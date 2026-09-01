/**
 * lib.ts — pi-ai-coordination 共享库
 *
 * 核心职责（重构点 1 + 3）：
 * - 定位 coordination 层（.ai/ 目录，向上查找）
 * - todo.md 解析 / 写入（单一任务事实源）
 * - session 关联（依赖 pi 原生会话，不再自建 WORKSTATE）
 *
 * todo.md 行格式（唯一规范）：
 *   - [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
 *         │     │        │            │      └ /go 调度时自动写入的 pi session 前 8 位
 *         │     │        │            └ issues.js sync 写回的 issue 编号
 *         │     │        └ 阶段标签（对应「阶段定义」小节）
 *         │     └ 任务编号 T-NNN
 *         └ [ ] 待办 / [~] 进行中 / [x] 完成
 *
 * 阶段定义行格式：
 *   - s1: 阶段标题 <!-- plan:docs/plans/PLAN-001-xxx.md -->
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

// ---------- 类型 ----------

export interface StageDef {
	id: string; // s1 / s2 ...
	title: string;
	plan?: string; // docs/plans/PLAN-xxx.md
	lineIndex: number;
}

export interface TodoItem {
	id: string; // T-001
	done: boolean;
	doing: boolean;
	stage: string;
	desc: string;
	issue?: number;
	session?: string; // pi session id 前 8 位
	lineIndex: number;
}

export interface CoordPaths {
	root: string;
	aiDir: string;
	todoPath: string;
	plansDir: string;
	issuesScript: string; // .ai/scripts/issues.js
	structurePath: string;
	metaRulesPath: string;
}

export interface TodoFile {
	lines: string[];
	stages: StageDef[];
	items: TodoItem[];
	taskSectionStart: number; // 「任务」小节标题行下标（-1 无）
}

// ---------- 路径定位 ----------

/** 从 startDir 向上查找 .ai/ 目录（与 pi 上下文文件发现规则一致） */
export function findCoordDir(startDir: string): CoordPaths | null {
	let dir = resolve(startDir);
	// fs 根防护
	for (let i = 0; i < 64; i++) {
		const aiDir = join(dir, ".ai");
		if (existsSync(aiDir) && statSync(aiDir).isDirectory()) {
			return {
				root: dir,
				aiDir,
				todoPath: join(dir, "todo.md"),
				plansDir: join(dir, "docs", "plans"),
				issuesScript: join(aiDir, "scripts", "issues.js"),
				structurePath: join(aiDir, "STRUCTURE.md"),
				metaRulesPath: join(aiDir, "errors", "distilled", "meta-rules.md"),
			};
		}
		const parent = resolve(dir, "..");
		if (parent === dir) return null;
		dir = parent;
	}
	return null;
}

/** coordination 是否激活（.ai/ 存在） */
export function isActive(cwd: string): boolean {
	return findCoordDir(cwd) !== null;
}

// ---------- todo.md 解析 ----------

const ITEM_RE = /^- \[( |x|~)\]\s*(T-\d+)\s+\[stage:([^\]]+)\]\s*(.*)$/;

export function parseTodo(todoPath: string): TodoFile {
	const raw = existsSync(todoPath) ? readFileSync(todoPath, "utf-8") : "";
	const lines = raw.split(/\r?\n/);

	const stages: StageDef[] = [];
	const items: TodoItem[] = [];
	let section = "";
	let taskSectionStart = -1;

	lines.forEach((rawLine, i) => {
		const header = rawLine.match(/^##\s+(.*)$/);
		if (header) {
			section = header[1];
			if (section.includes("任务")) taskSectionStart = i;
			return;
		}

		if (section.includes("阶段")) {
			const m = rawLine.match(/^-\s*(s\d+)\s*[:：]\s*(.*)$/);
			if (m) {
				const plan = rawLine.match(/<!--\s*plan:([^>]*?)\s*-->/)?.[1]?.trim();
				stages.push({ id: m[1], title: cleanTitle(m[2]), plan: plan || undefined, lineIndex: i });
			}
			return;
		}

		if (section.includes("任务")) {
			const m = rawLine.match(ITEM_RE);
			if (m) {
				let rest = m[4].trim();
				const issue = rest.match(/\(#(\d+)\)/);
				if (issue) rest = rest.replace(/\(#\d+\)/, "").trim();
				const session = rest.match(/@session:([0-9a-zA-Z]+)/);
				if (session) rest = rest.replace(/@session:[0-9a-zA-Z]+/, "").trim();
				items.push({
					id: m[2],
					done: m[1] === "x",
					doing: m[1] === "~",
					stage: m[3],
					desc: rest,
					issue: issue ? Number(issue[1]) : undefined,
					session: session ? session[1] : undefined,
					lineIndex: i,
				});
			}
		}
	});

	return { lines, stages, items, taskSectionStart };
}

function cleanTitle(s: string): string {
	return s.replace(/<!--.*?-->/g, "").trim();
}

/** 规范化生成一条任务行 */
export function formatItemLine(item: Omit<TodoItem, "lineIndex">): string {
	const mark = item.done ? "x" : item.doing ? "~" : " ";
	let line = `- [${mark}] ${item.id} [stage:${item.stage}] ${item.desc}`;
	if (item.issue !== undefined) line += ` (#${item.issue})`;
	if (item.session) line += ` @session:${item.session}`;
	return line;
}

// ---------- todo.md 写入（全部为整文件重写，行级原地更新） ----------

export function saveTodo(todoPath: string, file: TodoFile): void {
	writeFileSync(todoPath, file.lines.join("\n"), "utf-8");
}

export function nextItemId(items: TodoItem[]): string {
	const max = items.reduce((acc, t) => Math.max(acc, Number(t.id.replace("T-", "")) || 0), 0);
	return `T-${String(max + 1).padStart(3, "0")}`;
}

/** 追加任务到「任务」小节（插到最后一条任务行之后），并同步修正其它任务的行号 */
export function appendItem(file: TodoFile, item: Omit<TodoItem, "lineIndex">): TodoItem {
	const line = formatItemLine(item);
	if (file.taskSectionStart >= 0) {
		// 找小节内最后一条任务行；无任务则紧跟小节标题
		let last = -1;
		for (let i = file.taskSectionStart + 1; i < file.lines.length; i++) {
			const l = file.lines[i];
			if (ITEM_RE.test(l)) last = i;
			else if (/^##\s/.test(l)) break;
		}
		const insertAt = last >= 0 ? last + 1 : file.taskSectionStart + 1;
		for (const t of file.items) {
			if (t.lineIndex >= insertAt) t.lineIndex++;
		}
		file.lines.splice(insertAt, 0, line);
		item.lineIndex = insertAt;
	} else {
		file.lines.push("", "## 任务", "", line);
		item.lineIndex = file.lines.length - 1;
	}
	file.items.push(item as TodoItem);
	return item as TodoItem;
}

/** 原地更新一条任务行（done / issue / session / desc 变更都走这里） */
export function updateItem(file: TodoFile, id: string, patch: Partial<TodoItem>): TodoItem | null {
	const item = file.items.find((t) => t.id === id);
	if (!item) return null;
	Object.assign(item, patch);
	file.lines[item.lineIndex] = formatItemLine(item);
	return item;
}

/** 设置阶段计划引用（覆盖式，一个阶段指向最新计划文档） */
export function setStagePlan(file: TodoFile, stageId: string, planPath: string): StageDef | null {
	const stage = file.stages.find((s) => s.id === stageId);
	if (!stage) return null;
	stage.plan = planPath;
	const base = file.lines[stage.lineIndex].replace(/\s*<!--\s*plan:[^>]*-->\s*$/, "");
	file.lines[stage.lineIndex] = `${base} <!-- plan:${planPath} -->`;
	return stage;
}

// ---------- 杂项 ----------

export function shortSessionId(sessionId: string | undefined): string | undefined {
	if (!sessionId) return undefined;
	return sessionId.replace(/-/g, "").slice(0, 8);
}

export function todayStr(): string {
	return new Date().toISOString().slice(0, 10);
}

/** docs/plans 下下一个 PLAN-NNN 编号 */
export function nextPlanId(plansDir: string): number {
	if (!existsSync(plansDir)) return 1;
	const max = readdirSync(plansDir).reduce((acc, name) => {
		const m = name.match(/^PLAN-(\d+)/);
		return m ? Math.max(acc, Number(m[1])) : acc;
	}, 0);
	return max + 1;
}

/** 统计 meta-rules.md 中 META 规则条数 */
export function countMetaRules(metaRulesPath: string): number {
	if (!existsSync(metaRulesPath)) return 0;
	return (readFileSync(metaRulesPath, "utf-8").match(/^###\s+META-/gm) ?? []).length;
}

// ---------- 全局池（默认 C:\.ai_global，AI_GLOBAL_DIR 可覆盖） ----------

/** 全局池根目录：META 经验 + 智能体调配 */
export function globalDir(): string {
	return process.env.AI_GLOBAL_DIR ?? (process.platform === "win32" ? "C:\\.ai_global" : join(homedir(), ".ai_global"));
}

/** 全局 META 规则池文件 */
export function globalMetaRulesPath(): string {
	return join(globalDir(), "meta", "distilled", "meta-rules.md");
}

/** 全局智能体调配目录 */
export function globalAgentsDir(): string {
	return join(globalDir(), "agents");
}

export interface AgentRole {
	name: string;
	title: string;
	host: "main" | "subagent";
	stages?: string[];
	description: string;
	card: string;
	agent?: string; // pi-subagents 命名 agent 名（建议 pi-dynamic-workflows-<name>）
}

/** 读取全局角色注册表（缺失/损坏返回空数组，不抛错） */
export function readAgentRegistry(): AgentRole[] {
	try {
		const raw = readFileSync(join(globalAgentsDir(), "registry.json"), "utf-8");
		return (JSON.parse(raw).roles ?? []) as AgentRole[];
	} catch {
		return [];
	}
}

/** 固定派发命名空间：pi-dynamic-workflows（注册表 namespace，缺省回退） */
export function readWorkflowPrefix(): string {
	try {
		const raw = readFileSync(join(globalAgentsDir(), "registry.json"), "utf-8");
		return (JSON.parse(raw).namespace as string) || "pi-dynamic-workflows";
	} catch {
		return "pi-dynamic-workflows";
	}
}

export function countGlobalMetaRules(): number {
	return countMetaRules(globalMetaRulesPath());
}

export interface StageStat {
	stage: StageDef | null;
	open: number;
	doing: number;
	done: number;
}

/** 按阶段统计任务（包含未定义阶段的散项 → stage: null） */
export function stageStats(file: TodoFile): StageStat[] {
	const map = new Map<string, StageStat>();
	for (const s of file.stages) map.set(s.id, { stage: s, open: 0, doing: 0, done: 0 });
	for (const it of file.items) {
		if (!map.has(it.stage)) map.set(it.stage, { stage: null, open: 0, doing: 0, done: 0 });
		const stat = map.get(it.stage)!;
		if (it.done) stat.done++;
		else if (it.doing) stat.doing++;
		else stat.open++;
	}
	return [...map.values()];
}
