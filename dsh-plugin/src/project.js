/**
 * project.js — 宿主侧文件与项目数据操作
 *
 * 职责：
 *   - 定位项目 coordination 层（.ai/）
 *   - todo.md / plans / META / ERR / HANDOFF 的读写（受沙箱策略约束）
 *   - 项目初始化（模板部署、AGENTS.md 幂等插桩、issues CLI 刷新）
 *
 * 纯数据格式全部在 lib.js；本层只负责 I/O 与校验。
 */

import { existsSync, statSync } from "node:fs";
import { promises as fsp } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as L from "./lib.js";

const run = promisify(execFile);

// ---------------------------------------------------------------------------
// 全局池（与 pi 版一致：AI_GLOBAL_DIR 可覆盖）
// ---------------------------------------------------------------------------

export function globalDir() {
	return process.env.AI_GLOBAL_DIR ?? (process.platform === "win32" ? "C:\\.ai_global" : path.join(homedir(), ".ai_global"));
}

export function globalMetaRulesPath() {
	return path.join(globalDir(), "meta", "distilled", "meta-rules.md");
}

export function globalAgentsDir() {
	return path.join(globalDir(), "agents");
}

// ---------------------------------------------------------------------------
// 路径定位
// ---------------------------------------------------------------------------

/** 从 startDir 向上查找 .ai/ 目录 */
export function findCoordDir(startDir) {
	let dir = path.resolve(startDir);
	for (let i = 0; i < 64; i++) {
		const aiDir = path.join(dir, ".ai");
		if (existsSync(aiDir) && statSync(aiDir).isDirectory()) {
			return {
				root: dir,
				aiDir,
				todoPath: path.join(dir, "todo.md"),
				plansDir: path.join(dir, "docs", "plans"),
				issuesScript: path.join(aiDir, "scripts", "issues.js"),
				structurePath: path.join(aiDir, "STRUCTURE.md"),
				metaRulesPath: path.join(aiDir, "errors", "distilled", "meta-rules.md"),
				errorsRawDir: path.join(aiDir, "errors", "raw"),
				requirementsDir: path.join(aiDir, "requirements"),
				handoffPath: path.join(aiDir, "HANDOFF.md"),
			};
		}
		const parent = path.resolve(dir, "..");
		if (parent === dir) return null;
		dir = parent;
	}
	return null;
}

/** 已激活项目根或 null */
export function activatedRoot(cwd) {
	return findCoordDir(cwd)?.root ?? null;
}

// ---------------------------------------------------------------------------
// 沙箱策略 + 文件访问
// ---------------------------------------------------------------------------

function assertWritable(policy, target) {
	if (!policy) return;
	if (policy.mode === "read-only") {
		throw new Error(`当前会话为只读模式，不能写入 ${target}。请切换权限后重试，或让用户手动执行。`);
	}
	if (policy.mode === "workspace-write" && policy.workspaceRoot) {
		if (!L.isInside(policy.workspaceRoot, target)) {
			throw new Error(`写入越界：${target} 不在工作区 ${policy.workspaceRoot} 内（当前为 workspace-write）。全局池写入需要 danger-full-access。`);
		}
	}
}

export function createIo(policy) {
	return {
		async read(abs) {
			try {
				return await fsp.readFile(abs, "utf8");
			} catch (error) {
				if (error?.code === "ENOENT") return null;
				throw error;
			}
		},
		async write(abs, content) {
			assertWritable(policy, abs);
			await fsp.mkdir(path.dirname(abs), { recursive: true });
			await fsp.writeFile(abs, content, "utf8");
		},
		async mkdir(abs) {
			assertWritable(policy, abs);
			await fsp.mkdir(abs, { recursive: true });
		},
		async exists(abs) {
			try {
				await fsp.access(abs);
				return true;
			} catch {
				return false;
			}
		},
		async list(abs) {
			try {
				return await fsp.readdir(abs);
			} catch (error) {
				if (error?.code === "ENOENT") return [];
				throw error;
			}
		},
	};
}

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

/**
 * 初始化项目 coordination 层（幂等）。
 * @param {{root:string, templates:Record<string,string>, issuesScript:string, policy:any}} options
 */
export async function initProject({ root, templates, issuesScript, policy }) {
	const io = createIo(policy);
	const projectRoot = path.resolve(root);
	const created = [];
	const skipped = [];
	const warnings = [];

	const ensureDir = async (abs, label) => {
		if (await io.exists(abs)) return;
		await io.mkdir(abs);
		created.push(label ?? abs);
	};

	await ensureDir(projectRoot, `${projectRoot}/`);

	// 1. AGENTS.md（幂等插桩；pi/zcode 版原位升级为 DSH 版，块外内容保留）
	const agentsPath = path.join(projectRoot, "AGENTS.md");
	const existingAgents = await io.read(agentsPath);
	const applied = L.applyAgentsBlock(existingAgents, templates.agents);
	if (existingAgents === applied.content) {
		skipped.push("AGENTS.md（已是最新 coordination 插桩）");
	} else {
		await io.write(agentsPath, applied.content);
		const action = applied.action;
		created.push(action === "created" ? "AGENTS.md" : `AGENTS.md（${action}）`);
	}

	// 2. todo.md
	const todoPath = path.join(projectRoot, "todo.md");
	if (await io.exists(todoPath)) skipped.push("todo.md（已存在，未覆盖）");
	else {
		await io.write(todoPath, templates.todo);
		created.push("todo.md");
	}

	// 3. docs/plans/
	await ensureDir(path.join(projectRoot, "docs", "plans"), "docs/plans/");

	// 4. .ai/ coordination 层
	const aiDir = path.join(projectRoot, ".ai");
	await ensureDir(aiDir, ".ai/");
	const ensureTemplate = async (rel, content) => {
		const abs = path.join(aiDir, rel);
		if (await io.exists(abs)) {
			skipped.push(`.ai/${rel}（已存在，未覆盖）`);
			return;
		}
		await io.write(abs, content);
		created.push(`.ai/${rel}`);
	};
	await ensureTemplate("README.md", templates.aiReadme);
	await ensureTemplate("STRUCTURE.md", templates.structure);
	await ensureDir(path.join(aiDir, "requirements"), ".ai/requirements/");
	await ensureTemplate(path.join("requirements", "REQ-000.md"), templates.req);
	await ensureDir(path.join(aiDir, "errors", "raw"), ".ai/errors/raw/");
	await ensureDir(path.join(aiDir, "errors", "distilled"), ".ai/errors/distilled/");
	await ensureTemplate(path.join("errors", "raw", "ERR-000.md"), templates.err);
	await ensureTemplate(path.join("errors", "distilled", "meta-rules.md"), templates.metaRules);

	// 5. issues CLI 刷新到项目内（稳定路径，终端/其他宿主也可直接跑）
	const issuesPath = path.join(aiDir, "scripts", "issues.js");
	const issuesExisted = await io.exists(issuesPath);
	await io.write(issuesPath, issuesScript);
	if (issuesExisted) skipped.push(".ai/scripts/issues.js（每次 init 强制刷新为包内最新版）");
	else created.push(".ai/scripts/issues.js");

	// 6. 全局池骨架（不联网；失败不阻断项目初始化）
	const global = await ensureGlobalSkeleton({ templates, policy });
	if (!global.ok) warnings.push(`全局池骨架未创建：${global.error}`);

	return {
		ok: true,
		root: projectRoot,
		project: { created, skipped },
		warnings,
		global,
		next: [
			"编辑 todo.md「阶段定义」登记阶段，再让 AI 用 coord_plan_save 落计划或 coord_todo add 建任务",
			"DSH：/coord-status 看板 · /coord-go s1 调度 · 计划模式审批后自动落盘",
			"多 agent：用 workflow/subagent 按阶段派发（技能 agi-dispatch）",
		],
	};
}

/** 全局池骨架：meta 经验池 + agents 角色卡池（幂等，不联网） */
export async function ensureGlobalSkeleton({ templates, policy }) {
	const dir = globalDir();
	const io = createIo(policy);
	try {
		await io.mkdir(path.join(dir, "meta", "distilled"));
		await io.mkdir(path.join(dir, "meta", "raw"));
		await io.mkdir(path.join(dir, "agents", "pool"));
		const metaFile = path.join(dir, "meta", "distilled", "meta-rules.md");
		if (!(await io.exists(metaFile))) await io.write(metaFile, templates.globalMetaRules);
		const poolReadme = path.join(dir, "agents", "pool", "README.md");
		if (!(await io.exists(poolReadme))) await io.write(poolReadme, templates.globalAgentsReadme);
		return { ok: true, dir, note: "最小骨架（无网络克隆）；RAG 卡池可在该目录自行 git 初始化" };
	} catch (error) {
		return { ok: false, dir, error: error?.message ?? String(error) };
	}
}

// ---------------------------------------------------------------------------
// todo.md 读写
// ---------------------------------------------------------------------------

export async function loadTodo(startDir, policy) {
	const paths = findCoordDir(startDir);
	if (!paths) {
		throw new Error(`coordination 未激活：${startDir} 及其上级没有 .ai/ 目录。先运行 coord_init 初始化项目。`);
	}
	const io = createIo(policy);
	const raw = (await io.read(paths.todoPath)) ?? "";
	return { paths, file: L.parseTodo(raw), io };
}

export async function saveTodo(paths, file, io) {
	await io.write(paths.todoPath, L.serializeTodo(file));
}

export async function readTodoAt(paths, io) {
	const raw = (await io.read(paths.todoPath)) ?? "";
	return L.parseTodo(raw);
}

// ---------------------------------------------------------------------------
// 计划落盘 + todo 登记
// ---------------------------------------------------------------------------

export async function savePlan({ startDir, stage, steps, notes, sessionId, title, policy }) {
	const { paths, file, io } = await loadTodo(startDir, policy);
	if (file.stages.length === 0) {
		throw new Error("todo.md 尚无「阶段定义」。请先在 todo.md「阶段定义」小节登记阶段（如 `- s1: 阶段标题`）再保存计划。");
	}
	const targetStage = file.stages.find((candidate) => candidate.id === stage);
	if (!targetStage) {
		throw new Error(`未知阶段 ${stage}。现有：${file.stages.map((s) => s.id).join(", ") || "（无）"}。`);
	}

	const planNames = await io.list(paths.plansDir);
	const planNo = L.nextPlanNo(planNames);
	const slug = L.slugify(steps[0] ?? title ?? "plan");
	const planName = `PLAN-${String(planNo).padStart(3, "0")}-${slug}.md`;
	const planAbs = path.join(paths.plansDir, planName);
	const planRel = `docs/plans/${planName}`;

	const doc = L.buildPlanDoc({
		planNo,
		stageId: stage,
		stageTitle: title?.trim() || targetStage.title,
		steps,
		notes,
		sessionId,
	});
	await io.write(planAbs, doc);

	L.setStagePlan(file, stage, planRel);
	const added = [];
	for (const step of steps) {
		const id = L.nextItemId(file.items);
		L.appendItem(file, { id, done: false, doing: false, stage, desc: step });
		added.push(id);
	}
	await saveTodo(paths, file, io);

	return { planNo, planName, planRel, stage, added, total: steps.length };
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export async function statusReport({ startDir, sessionId, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) {
		throw new Error(`coordination 未激活：${startDir} 及其上级没有 .ai/ 目录。先运行 coord_init 初始化项目。`);
	}
	const io = createIo(policy);
	const file = await readTodoAt(paths, io);
	const projectMeta = (await io.read(paths.metaRulesPath)) ?? "";
	const globalMeta = (await io.read(globalMetaRulesPath())) ?? "";
	const handoffRaw = await io.read(paths.handoffPath);
	const handoff = handoffRaw ? L.parseHandoff(handoffRaw) : null;
	const structureOk = await io.exists(paths.structurePath);
	const issuesScriptOk = await io.exists(paths.issuesScript);
	const report = L.buildStatusReport({
		root: paths.root,
		board: L.renderBoard(file),
		metaCount: L.countMetaRules(projectMeta),
		globalMetaCount: L.countMetaRules(globalMeta),
		handoff,
		structureOk,
		issuesScriptOk,
		sessionId,
	});
	return { paths, file, handoff, report };
}

// ---------------------------------------------------------------------------
// 交接卡
// ---------------------------------------------------------------------------

export async function writeHandoff({ startDir, task, done, doing, blockers, next, verify, sessionId, from = "dsh", policy }) {
	const { paths, io } = await loadTodo(startDir, policy);

	let gitEvidence = "";
	try {
		const status = await run("git", ["-C", paths.root, "status", "--short"], { encoding: "utf8" });
		const log = await run("git", ["-C", paths.root, "log", "--oneline", "-5"], { encoding: "utf8" });
		gitEvidence = [
			`未提交变更：\n${status.stdout.trim() || "（干净）"}`,
			`最近提交：\n${log.stdout.trim() || "（无）"}`,
		].join("\n");
	} catch {
		gitEvidence = "（git 信息不可用）";
	}

	const short = L.shortSessionId(sessionId);
	const card = L.buildHandoffCard({
		status: "open",
		task,
		from: `${from}/${short ?? "unknown"}`,
		done: done ? `${done}\n${gitEvidence}` : gitEvidence,
		doing,
		blockers,
		next,
		verify,
	});
	await io.write(paths.handoffPath, card);
	return { path: paths.handoffPath, task, session: short };
}

export async function readHandoff({ startDir, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) throw new Error("coordination 未激活：缺少 .ai/ 目录。");
	const io = createIo(policy);
	const raw = await io.read(paths.handoffPath);
	if (!raw) return null;
	return { path: paths.handoffPath, raw, card: L.parseHandoff(raw) };
}

export async function consumeHandoff({ startDir, sessionId, policy }) {
	const found = await readHandoff({ startDir, policy });
	if (!found) throw new Error("没有交接卡（.ai/HANDOFF.md 不存在）。");
	const card = found.card;
	if (card.status !== "open") return { card, skipped: `卡片状态为 ${card.status}，无需消化` };

	const short = L.shortSessionId(sessionId);
	const taskId = String(card.task ?? "").match(/T-\d+/)?.[0];
	const lines = found.raw.split(/\r?\n/).map((line) => {
		if (/^- 状态:/.test(line)) return "- 状态: resumed";
		if (/^- 接手方:/.test(line)) return `- 接手方: dsh/${short}（${L.nowStr()}）`;
		return line;
	});
	const { paths, file, io } = await loadTodo(startDir, policy);
	if (taskId && file.items.some((item) => item.id === taskId)) {
		L.updateItem(file, taskId, { session: short });
		await saveTodo(paths, file, io);
	}
	await io.write(paths.handoffPath, lines.join("\n"));
	return { card, taskId, session: short, path: paths.handoffPath };
}

// ---------------------------------------------------------------------------
// G3 错误 + META
// ---------------------------------------------------------------------------

const META_CATEGORIES = ["BUILD", "ENV", "TEST", "DATA", "API", "ARCH", "PROC", "DOC", "SEC", "PERF", "DEP", "COLLAB"];

export { META_CATEGORIES };

export async function recordError({ startDir, symptom, rootCause, fix, prevention, metaCategory, metaRule, evidence, sessionId, policy }) {
	const { paths, io } = await loadTodo(startDir, policy);
	if (!symptom?.trim()) throw new Error("symptom（现象）不能为空");
	if (!rootCause?.trim()) throw new Error("root_cause（根因）不能为空");

	const category = String(metaCategory ?? "PROC").toUpperCase();
	if (!META_CATEGORIES.includes(category)) {
		throw new Error(`未知 META 分类 ${category}。可选：${META_CATEGORIES.join(", ")}`);
	}

	const errNo = L.nextErrNo(await io.list(paths.errorsRawDir));
	const errId = `ERR-${String(errNo).padStart(3, "0")}`;
	const short = L.shortSessionId(sessionId);

	const metaText = (await io.read(paths.metaRulesPath)) ?? "";
	let metaId = null;
	let nextMetaText = metaText;
	if (metaRule?.trim()) {
		const metaNo = L.lastMetaNo(metaText) + 1;
		metaId = `META-${String(metaNo).padStart(3, "0")}`;
		nextMetaText = `${metaText.trimEnd()}${metaText.trim() ? "\n\n" : ""}### ${metaId} [${category}] ${metaRule.trim()}\n- **来源**: ${errId}\n- **反例**: ${symptom.trim().split(/\r?\n/)[0]}\n`;
	}

	const card = [
		`# ${errId} ${symptom.trim().split(/\r?\n/)[0].slice(0, 80)}`,
		"",
		`- 日期: ${L.todayStr()}`,
		`- 会话: ${short ?? "unknown"}`,
		`- 分类: ${category}`,
		`- META: ${metaId ?? "（未蒸馏）"}`,
		"",
		"## 1. 现象",
		"",
		symptom.trim(),
		"",
		evidence?.trim() ? `证据：\n\n${evidence.trim()}\n` : "",
		"## 2. 根因",
		"",
		rootCause.trim(),
		"",
		"## 3. 修复",
		"",
		fix?.trim() || "（未填写）",
		"",
		"## 4. 预防",
		"",
		prevention?.trim() || "（未填写）",
		"",
		"## 5. META 蒸馏",
		"",
		metaId ? `### ${metaId} [${category}] ${metaRule.trim()}` : "（本次未蒸馏规则：连续两次同根因报错时强制升级为 REQ 卡走计划流程）",
		"",
	].join("\n");

	await io.write(path.join(paths.errorsRawDir, `${errId}.md`), card);
	if (metaId) await io.write(paths.metaRulesPath, nextMetaText);

	return { errId, metaId, path: path.join(paths.errorsRawDir, `${errId}.md`) };
}

export function listMetaRules(text) {
	const rules = [];
	const entries = String(text ?? "").split(/^###\s+META-/m).slice(1);
	for (const entry of entries) {
		const firstLineEnd = entry.indexOf("\n");
		const header = (firstLineEnd < 0 ? entry : entry.slice(0, firstLineEnd)).trim();
		const body = firstLineEnd < 0 ? "" : entry.slice(firstLineEnd + 1);
		const m = header.match(/^(\d+)\s*(?:\[[^\]]+\])?\s*(.*)$/);
		if (!m) continue;
		rules.push({ no: Number(m[1]), id: `META-${m[1]}`, title: m[2].trim(), body: body.trim() });
	}
	return rules;
}

export async function listMeta({ startDir, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) throw new Error("coordination 未激活：缺少 .ai/ 目录。");
	const io = createIo(policy);
	const projectText = (await io.read(paths.metaRulesPath)) ?? "";
	const globalText = (await io.read(globalMetaRulesPath())) ?? "";
	return {
		project: listMetaRules(projectText),
		global: listMetaRules(globalText),
		projectPath: paths.metaRulesPath,
		globalPath: globalMetaRulesPath(),
	};
}

export async function promoteMeta({ startDir, rule, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) throw new Error("coordination 未激活：缺少 .ai/ 目录。");
	const io = createIo(policy);
	const projectText = (await io.read(paths.metaRulesPath)) ?? "";
	const rules = listMetaRules(projectText);
	if (rules.length === 0) throw new Error(".ai/errors/distilled/meta-rules.md 中没有 META 规则。先通过 coord_error 蒸馏规则。");

	const needle = String(rule ?? "").trim();
	const picked = rules.filter((entry) => entry.id.toLowerCase() === needle.toLowerCase() || entry.title.includes(needle));
	if (picked.length === 0) throw new Error(`未找到匹配「${needle}」的规则。现有：${rules.map((entry) => entry.id).join(", ")}`);
	if (picked.length > 1) throw new Error(`匹配到多条规则（${picked.map((entry) => entry.id).join(", ")}），请用 META-NNN 精确指定。`);

	const target = picked[0];
	const globalText = (await io.read(globalMetaRulesPath())) ?? "";
	const globalNo = L.lastMetaNo(globalText) + 1;
	const globalId = `META-${String(globalNo).padStart(4, "0")}`;
	const projectName = path.basename(paths.root);
	const block = `### ${globalId} [${target.id}] ${target.title}\n- **来源**: ${projectName} ${target.id}\n- **反例**: （见该项目 ${target.id}）\n`;
	await io.write(globalMetaRulesPath(), `${globalText.trimEnd()}${globalText.trim() ? "\n\n" : ""}${block}`);

	// 回写项目规则：末尾追加全局关联（避免重复追加）
	const marker = `- **全局**: ${globalId}`;
	if (!projectText.includes(marker)) {
		const updated = projectText.replace(
			new RegExp(`(###\\s+${target.id}[^\\n]*\\n(?:[^\\n]*\\n)*?)(?=\\n###\\s+META-|$)`),
			(match) => `${match.trimEnd()}\n${marker}\n`,
		);
		await io.write(paths.metaRulesPath, updated);
	}

	return { projectRule: target.id, globalRule: globalId, globalPath: globalMetaRulesPath() };
}

// ---------------------------------------------------------------------------
// git 取证
// ---------------------------------------------------------------------------

export async function gitSnapshot(root) {
	try {
		const status = await run("git", ["-C", root, "status", "--short"], { encoding: "utf8" });
		const log = await run("git", ["-C", root, "log", "--oneline", "-5"], { encoding: "utf8" });
		return { status: status.stdout.trim(), log: log.stdout.trim() };
	} catch {
		return null;
	}
}