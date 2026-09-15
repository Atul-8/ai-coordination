/**
 * todo-store.mjs — todo.md 数据模型（自 pi 版 extensions/coordination/lib.ts 移植，零依赖）
 *
 * todo.md 行格式（唯一规范）：
 *   - [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
 *         │     │        │            │      └ /go 调度时写入的 zcode session 前 8 位
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

// ---------- 路径定位 ----------

/** 从 startDir 向上查找 .ai/ 目录（与项目上下文文件发现规则一致） */
export function findCoordDir(startDir) {
	let dir = resolve(startDir);
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
export function isActive(cwd) {
	return findCoordDir(cwd) !== null;
}

// ---------- todo.md 解析 ----------

const ITEM_RE = /^- \[( |x|~)\]\s*(T-\d+)\s+\[stage:([^\]]+)\]\s*(.*)$/;

export function parseTodo(todoPath) {
	const raw = existsSync(todoPath) ? readFileSync(todoPath, "utf-8") : "";
	const lines = raw.split(/\r?\n/);

	const stages = [];
	const items = [];
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

function cleanTitle(s) {
	return s.replace(/<!--.*?-->/g, "").trim();
}

/** 规范化生成一条任务行 */
export function formatItemLine(item) {
	const mark = item.done ? "x" : item.doing ? "~" : " ";
	let line = `- [${mark}] ${item.id} [stage:${item.stage}] ${item.desc}`;
	if (item.issue !== undefined) line += ` (#${item.issue})`;
	if (item.session) line += ` @session:${item.session}`;
	return line;
}

// ---------- todo.md 写入（整文件重写，行级原地更新） ----------

export function saveTodo(todoPath, file) {
	writeFileSync(todoPath, file.lines.join("\n"), "utf-8");
}

export function nextItemId(items) {
	const max = items.reduce((acc, t) => Math.max(acc, Number(t.id.replace("T-", "")) || 0), 0);
	return `T-${String(max + 1).padStart(3, "0")}`;
}

/** 追加任务到「任务」小节（插到最后一条任务行之后），并同步修正其它任务的行号 */
export function appendItem(file, item) {
	const line = formatItemLine(item);
	if (file.taskSectionStart >= 0) {
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
	file.items.push(item);
	return item;
}

/** 原地更新一条任务行（done / issue / session / desc 变更都走这里） */
export function updateItem(file, id, patch) {
	const item = file.items.find((t) => t.id === id);
	if (!item) return null;
	Object.assign(item, patch);
	file.lines[item.lineIndex] = formatItemLine(item);
	return item;
}

/** 设置阶段计划引用（覆盖式，一个阶段指向最新计划文档） */
export function setStagePlan(file, stageId, planPath) {
	const stage = file.stages.find((s) => s.id === stageId);
	if (!stage) return null;
	stage.plan = planPath;
	const base = file.lines[stage.lineIndex].replace(/\s*<!--\s*plan:[^>]*-->\s*$/, "");
	file.lines[stage.lineIndex] = `${base} <!-- plan:${planPath} -->`;
	return stage;
}

// ---------- 杂项 ----------

export function shortSessionId(sessionId) {
	if (!sessionId) return undefined;
	return sessionId.replace(/-/g, "").slice(0, 8);
}

export function todayStr() {
	return new Date().toISOString().slice(0, 10);
}

/** docs/plans 下下一个 PLAN-NNN 编号 */
export function nextPlanId(plansDir) {
	if (!existsSync(plansDir)) return 1;
	const max = readdirSync(plansDir).reduce((acc, name) => {
		const m = name.match(/^PLAN-(\d+)/);
		return m ? Math.max(acc, Number(m[1])) : acc;
	}, 0);
	return max + 1;
}

/** 统计 meta-rules.md 中 META 规则条数 */
export function countMetaRules(metaRulesPath) {
	if (!existsSync(metaRulesPath)) return 0;
	return (readFileSync(metaRulesPath, "utf-8").match(/^###\s+META-/gm) ?? []).length;
}

// ---------- 全局池（默认 C:\.ai_global / ~/.ai_global，AI_GLOBAL_DIR 可覆盖） ----------

/** 全局池根目录：META 经验 + 智能体调配 */
export function globalDir() {
	return process.env.AI_GLOBAL_DIR ?? (process.platform === "win32" ? "C:\\.ai_global" : join(homedir(), ".ai_global"));
}

/** 全局 META 规则池文件 */
export function globalMetaRulesPath() {
	return join(globalDir(), "meta", "distilled", "meta-rules.md");
}

/** 全局智能体调配目录 */
export function globalAgentsDir() {
	return join(globalDir(), "agents");
}

/** 读取全局角色注册表（缺失/损坏返回空数组，不抛错） */
export function readAgentRegistry() {
	try {
		const raw = readFileSync(join(globalAgentsDir(), "registry.json"), "utf-8");
		return JSON.parse(raw).roles ?? [];
	} catch {
		return [];
	}
}

/** 派发追踪前缀（注册表 namespace，缺省回退 zcode 命名） */
export function readWorkflowPrefix() {
	try {
		const raw = readFileSync(join(globalAgentsDir(), "registry.json"), "utf-8");
		return JSON.parse(raw).namespace || "zcode-ai-coordination";
	} catch {
		return "zcode-ai-coordination";
	}
}

export function countGlobalMetaRules() {
	return countMetaRules(globalMetaRulesPath());
}

// ---------- 统计 ----------

/** 按阶段统计任务（包含未定义阶段的散项 → stage: null） */
export function stageStats(file) {
	const map = new Map();
	for (const s of file.stages) map.set(s.id, { stage: s, open: 0, doing: 0, done: 0 });
	for (const it of file.items) {
		if (!map.has(it.stage)) map.set(it.stage, { stage: null, open: 0, doing: 0, done: 0 });
		const stat = map.get(it.stage);
		if (it.done) stat.done++;
		else if (it.doing) stat.doing++;
		else stat.open++;
	}
	return [...map.values()];
}
