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
import { defaultCardBody, serializeCard } from "./pool.js";

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

// ---------------------------------------------------------------------------
// 沙箱策略 + 文件访问
// ---------------------------------------------------------------------------

function assertWritable(policy, target) {
	if (!policy) return;
	if (policy.mode === "read-only") {
		throw new Error(`当前会话为只读模式，不能写入 ${target}。请切换权限后重试，或让用户手动执行。`);
	}
	if (policy.mode === "workspace-write") {
		if (!policy.workspaceRoot) throw new Error(`workspace-write 策略缺少 workspaceRoot，拒绝写入 ${target}（fail-closed）。`);
		if (!L.isInside(policy.workspaceRoot, target)) {
			throw new Error(`写入越界：${target} 不在工作区 ${policy.workspaceRoot} 内（当前为 workspace-write）。全局池写入需要 danger-full-access。`);
		}
		return;
	}
	if (policy.mode !== "danger-full-access") {
		throw new Error(`未知沙箱模式 ${policy.mode}，拒绝写入 ${target}（fail-closed）。`);
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
		async kind(abs) {
			try {
				const stat = await fsp.stat(abs);
				return stat.isDirectory() ? "dir" : stat.isFile() ? "file" : "other";
			} catch {
				return null;
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
	const rootKind = await io.kind(projectRoot);
	if (rootKind === "file" || rootKind === "other") {
		throw new Error(`项目根不是目录：${projectRoot}（当前是 ${rootKind}）。请传目录路径。`);
	}
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
			"编辑 todo.md「阶段定义」登记阶段，再让 AI 用 eai_plan_save 落计划或 eai_todo add 建任务",
			"DSH：/eai-status 看板 · /eai-go s1 调度 · 计划模式审批后自动落盘",
			"多 agent：用 workflow/subagent 按阶段派发（技能 eai-dispatch）",
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
		const agentsDir = path.join(dir, "agents");
		await io.mkdir(path.join(agentsDir, "pool"));
		await io.mkdir(path.join(agentsDir, "memory"));
		const metaFile = path.join(dir, "meta", "distilled", "meta-rules.md");
		if (!(await io.exists(metaFile))) await io.write(metaFile, templates.globalMetaRules);
		const poolReadme = path.join(agentsDir, "pool", "README.md");
		if (!(await io.exists(poolReadme))) await io.write(poolReadme, templates.globalAgentsReadme);
		const taxonomyPath = path.join(agentsDir, "taxonomy.yml");
		if (!(await io.exists(taxonomyPath))) await io.write(taxonomyPath, templates.globalTaxonomy ?? "");

		// 池为空时播种 4 张 process-role 卡，让派发矩阵开箱可用（不覆盖已有卡池）
		const poolFiles = (await io.list(path.join(agentsDir, "pool"))).filter((name) => name.endsWith(".md") && name !== "README.md");
		const seeded = [];
		if (poolFiles.length === 0) {
			const created = L.todayStr();
			for (const card of SEED_CARDS) {
				const full = { ...card, status: "active", first_mission: "done", version: 1, created, last_reviewed: created };
				await io.write(path.join(agentsDir, "pool", `${full.id}.md`), serializeCard(full, defaultCardBody(full)));
				seeded.push(full.id);
			}
		}
		return { ok: true, dir, seeded, note: seeded.length ? `已播种 ${seeded.join("/")}（process-role 基卡）；RAG 卡池可在该目录自行 git 初始化` : "最小骨架（无网络克隆）" };
	} catch (error) {
		return { ok: false, dir, error: error?.message ?? String(error) };
	}
}

/** 开箱 seed：四个流程角色（first_mission=done，可由用户/PM 继续演进） */
const SEED_CARDS = [
	{
		id: "writer",
		type: "process-role",
		name: "Writer（实现者）",
		summary: "按任务卡实现，只做卡面范围，G2.5 先红后绿。",
		taxonomy: ["process.implement"],
		keywords: ["实现", "编码", "任务卡", "先红后绿", "G2"],
		scope: { do: ["按任务卡实现", "层测试红→绿", "STRUCTURE/REQ/todo 同步"], dont: ["顺手重构", "超范围发挥"] },
		applies_to: ["功能实现", "缺陷修复"],
		reject_hint: "需要复核 → reviewer；需要补测 → tester",
	},
	{
		id: "reviewer",
		type: "process-role",
		name: "Reviewer（复核者）",
		summary: "只读复核 diff 与验收标准，输出缺陷清单，不改代码。",
		taxonomy: ["process.review"],
		keywords: ["复核", "审查", "diff", "缺陷", "验收"],
		scope: { do: ["审阅 diff 与验收标准", "指出缺陷与风险", "核对测试证据"], dont: ["直接改代码", "替代测试"] },
		applies_to: ["合并前复核", "方案评审"],
		reject_hint: "需要改代码 → writer；需要跑测试 → tester",
	},
	{
		id: "tester",
		type: "process-role",
		name: "Tester（测试者）",
		summary: "补层测试与回归，跑验收命令，记录失败输出与复现步骤。",
		taxonomy: ["process.lane-testing"],
		keywords: ["测试", "单测", "回归", "覆盖", "npm test"],
		scope: { do: ["补层测试", "跑验收命令", "记录失败输出"], dont: ["改实现", "放宽断言"] },
		applies_to: ["测试补齐", "回归验证"],
		reject_hint: "实现缺陷 → writer；验收标准不清 → PM",
	},
	{
		id: "architect",
		type: "process-role",
		name: "Architect（架构者）",
		summary: "七层边界、接口契约与依赖方向设计，落 STRUCTURE。",
		taxonomy: ["process.design"],
		keywords: ["架构", "设计", "接口", "依赖", "结构"],
		scope: { do: ["七层与依赖方向", "接口契约", "STRUCTURE 更新"], dont: ["写业务实现", "越过计划"] },
		applies_to: ["新模块设计", "跨层重构"],
		reject_hint: "实现 → writer；评审 → reviewer",
	},
];

// ---------------------------------------------------------------------------
// todo.md 读写
// ---------------------------------------------------------------------------

export async function loadTodo(startDir, policy) {
	const paths = findCoordDir(startDir);
	if (!paths) {
		throw new Error(`coordination 未激活：${startDir} 及其上级没有 .ai/ 目录。先运行 eai_init 初始化项目。`);
	}
	const io = createIo(policy);
	if (!(await io.exists(paths.todoPath))) {
		throw new Error(`todo.md 缺失（.ai/ 存在但 ${paths.todoPath} 不在）。运行 eai_init 重建，或手工恢复后再操作。`);
	}
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

export async function savePlan({ startDir, stage, steps, acceptance, research, skipResearch, notes, sessionId, title, policy }) {
	const { paths, file, io } = await loadTodo(startDir, policy);
	if (file.stages.length === 0) {
		throw new Error("todo.md 尚无「阶段定义」。请先在 todo.md「阶段定义」小节登记阶段（如 `- s1: 阶段标题`）再保存计划。");
	}
	const targetStage = file.stages.find((candidate) => candidate.id === stage);
	if (!targetStage) {
		throw new Error(`未知阶段 ${stage}。现有：${file.stages.map((s) => s.id).join(", ") || "（无）"}。`);
	}
	const cleanSteps = (steps ?? []).map((step) => L.sanitizeOneLine(step)).filter(Boolean);
	if (cleanSteps.length === 0) throw new Error("计划步骤为空：steps 每项必须是非空文本。");
	const cleanAcceptance = Array.isArray(acceptance) && acceptance.length > 0 ? acceptance.map((item) => L.sanitizeOneLine(item)) : undefined;
	if (cleanSteps.length > 1) {
		if (!cleanAcceptance || cleanAcceptance.length !== cleanSteps.length) {
			throw new Error(`多步骤计划必须给 acceptance（与 steps 一一对应，${cleanSteps.length} 条）：问题分解 → 逐步验收 → 最后整合。`);
		}
	} else if (cleanAcceptance && cleanAcceptance.length !== cleanSteps.length) {
		throw new Error(`acceptance 数量（${cleanAcceptance.length}）必须与 steps（${cleanSteps.length}）一一对应。`);
	}

	// 研究门禁：先记录外部方案检索，或显式说明为什么不需要（纯文档/无实现）
	let researchRef = null;
	if (research) {
		const matched = String(research).match(/RESEARCH-(\d+)/i);
		const needle = matched ? `RESEARCH-${matched[1].padStart(3, "0")}` : String(research).trim();
		const files = await io.list(path.join(paths.aiDir, "research"));
		const match = files.find((name) => name.toUpperCase().startsWith(needle.toUpperCase()) && name.endsWith(".md"));
		if (!match) throw new Error(`找不到研究记录 ${research}（.ai/research/）。先 eai_research，或检查编号。`);
		researchRef = `.ai/research/${match}`;
	} else if (!skipResearch?.trim()) {
		throw new Error("计划落盘前先记录外部方案检索：eai_research {topic, sources, decision}；纯文档/无实现任务可显式传 skip_research:'原因'。不要闭门造车。");
	}

	const planNames = await io.list(paths.plansDir);
	const planNo = L.nextPlanNo(planNames);
	const slug = L.slugify(cleanSteps[0] ?? title ?? "plan");
	const planName = `PLAN-${String(planNo).padStart(3, "0")}-${slug}.md`;
	const planAbs = path.join(paths.plansDir, planName);
	const planRel = `docs/plans/${planName}`;

	const doc = L.buildPlanDoc({
		planNo,
		stageId: stage,
		stageTitle: title?.trim() || targetStage.title,
		steps: cleanSteps,
		acceptance: cleanAcceptance,
		research: researchRef,
		notes,
		sessionId,
	});
	await io.write(planAbs, doc);

	L.setStagePlan(file, stage, planRel);
	const added = [];
	for (const step of cleanSteps) {
		const id = L.nextItemId(file.items, file.lines);
		L.appendItem(file, { id, done: false, doing: false, stage, desc: step });
		added.push(id);
	}
	await saveTodo(paths, file, io);

	return { planNo, planName, planRel, stage, added, total: cleanSteps.length };
}

// ---------------------------------------------------------------------------
// 状态
// ---------------------------------------------------------------------------

export async function statusReport({ startDir, sessionId, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) {
		throw new Error(`coordination 未激活：${startDir} 及其上级没有 .ai/ 目录。先运行 eai_init 初始化项目。`);
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
	if (!sessionId) throw new Error("当前工具调用没有关联会话，无法消化交接卡（接手方需要 session）。");

	const short = L.shortSessionId(sessionId);
	const taskId = String(card.task ?? "").match(/T-\d+/)?.[0];
	const lines = found.raw.split(/\r?\n/).map((line) => {
		if (/^- 状态:/.test(line)) return "- 状态: resumed";
		if (/^- 接手方:/.test(line)) return `- 接手方: dsh/${short}（${L.nowStr()}）`;
		return line;
	});
	const { paths, file, io } = await loadTodo(startDir, policy);
	let taskFound = false;
	if (taskId) {
		const item = file.items.find((candidate) => candidate.id.toUpperCase() === taskId.toUpperCase());
		if (item) {
			L.updateItem(file, item.id, { session: short });
			await saveTodo(paths, file, io);
			taskFound = true;
		}
	}
	await io.write(paths.handoffPath, lines.join("\n"));
	return { card, taskId, taskFound, session: short, path: paths.handoffPath };
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
		if (!m || Number(m[1]) === 0) continue; // META-0000 是模板示例，不算真规则
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
	if (rules.length === 0) throw new Error(".ai/errors/distilled/meta-rules.md 中没有 META 规则。先通过 eai_error 蒸馏规则。");

	const needle = String(rule ?? "").trim();
	const picked = rules.filter((entry) => entry.id.toLowerCase() === needle.toLowerCase() || entry.title.includes(needle));
	if (picked.length === 0) throw new Error(`未找到匹配「${needle}」的规则。现有：${rules.map((entry) => entry.id).join(", ")}`);
	if (picked.length > 1) throw new Error(`匹配到多条规则（${picked.map((entry) => entry.id).join(", ")}），请用 META-NNN 精确指定。`);

	const target = picked[0];
	const projectName = path.basename(paths.root);
	const globalText = (await io.read(globalMetaRulesPath())) ?? "";
	const existing = listMetaRules(globalText).find((entry) => entry.body.includes(`- **来源**: ${projectName} ${target.id}`));
	let globalId = existing?.id;
	let deduped = Boolean(existing);
	if (!globalId) {
		const globalNo = L.lastMetaNo(globalText) + 1;
		globalId = `META-${String(globalNo).padStart(4, "0")}`;
		const block = `### ${globalId} [${target.id}] ${target.title}\n- **来源**: ${projectName} ${target.id}\n- **反例**: （见该项目 ${target.id}）\n`;
		await io.write(globalMetaRulesPath(), `${globalText.trimEnd()}${globalText.trim() ? "\n\n" : ""}${block}`);
	}

	// 回写项目规则：已有任何「全局」关联则跳过，避免重复追加
	const marker = `- **全局**: ${globalId}`;
	if (!projectText.includes(marker) && !/^- \*\*全局\*\*: META-/m.test(projectText)) {
		const updated = projectText.replace(
			new RegExp(`(###\\s+${target.id}[^\\n]*\\n(?:[^\\n]*\\n)*?)(?=\\n###\\s+META-|$)`),
			(match) => `${match.trimEnd()}\n${marker}\n`,
		);
		await io.write(paths.metaRulesPath, updated);
	}

	return { projectRule: target.id, globalRule: globalId, globalPath: globalMetaRulesPath(), deduped };
}