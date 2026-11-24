/**
 * tools.js — 模型面向的 coordination 工具（13 个）
 *
 * 设计要点：
 *   - 工具优先读「最近上级 .ai」，root 参数可显式指向项目根
 *   - 写操作统一经过 project.js 的沙箱策略检查
 *   - 返回值给模型（JSON）+ 给 UI 的 render 文本；不返回整份文件
 */

import path from "node:path";
import * as L from "./lib.js";
import {
	consumeHandoff,
	createIo,
	initProject,
	listMeta,
	loadTodo,
	promoteMeta,
	recordError,
	readHandoff,
	savePlan,
	saveTodo,
	statusReport,
	writeHandoff,
} from "./project.js";
import { runIssueTool } from "./issues.js";
import { checkArchitecture } from "./arch.js";
import { recallExperience, renderRecall } from "./recall.js";
import { recordResearch } from "./research.js";
import {
	addAgentMemory,
	buildDispatch,
	completeFirstMission,
	listAgentCards,
	listAgentMemory,
	poolPaths,
	queryAgentPool,
	reflectCard,
	registerAgentCard,
	renderCardList,
	renderQuery,
	updateAgentCard,
} from "./agents.js";
import { cwdOf, policyOf, sessionIdOf } from "./host.js";

function text(value) {
	return [{ type: "text", text: value }];
}

function objectSchema(properties) {
	return { type: "object", additionalProperties: false, properties };
}

/**
 * 把插件内部的参数简写（字段上带 required:true）编译成合法 JSON Schema。
 * 必须做：ctx.tools.register 不像 defineTool 那样编译参数；直接把简写发给模型，
 * 当某个参数恰好叫 `type` 时整个 parameters 会变成非法 schema（type 值不是字符串）。
 */
function toJsonSchema(parameters) {
	const properties = {};
	const required = [];
	for (const [key, spec] of Object.entries(parameters ?? {})) {
		const { required: isRequired, ...rest } = spec;
		properties[key] = rest;
		if (isRequired === true) required.push(key);
	}
	return { type: "object", properties, ...(required.length ? { required } : {}) };
}

/** 注册工具前统一编译参数 schema（已是 object 根的保持原样）。 */
function registerTool(ctx, definition) {
	const parameters = definition.parameters;
	const compiled =
		parameters && parameters.type === "object" && parameters.properties ? parameters : toJsonSchema(parameters);
	ctx.tools.register({ ...definition, parameters: compiled });
}

/** 非负/正整数参数校验（未提供时返回 fallback）。 */
function intArg(value, name, { min = 1, fallback } = {}) {
	if (value === undefined || value === null || value === "") return fallback;
	const number = Number(value);
	if (!Number.isInteger(number) || number < min) throw new Error(`${name} 必须是 >=${min} 的整数，收到 ${JSON.stringify(value)}`);
	return number;
}

function numberArg(value, name, { min = 0, fallback } = {}) {
	if (value === undefined || value === null || value === "") return fallback;
	const number = Number(value);
	if (!Number.isFinite(number) || number < min) throw new Error(`${name} 必须是 >=${min} 的数字，收到 ${JSON.stringify(value)}`);
	return number;
}

// ---------------------------------------------------------------------------
// 任务阶段登记（todo.md「阶段定义」小节）
// ---------------------------------------------------------------------------

function addStage(file, id, title) {
	let sectionStart = -1;
	for (let i = 0; i < file.lines.length; i++) {
		const header = file.lines[i].match(/^##\s+(.*)$/);
		if (header && header[1].includes("阶段")) {
			sectionStart = i;
			break;
		}
	}
	if (sectionStart < 0) throw new Error("todo.md 没有「阶段定义」小节，请先检查模板。");
	let insertAt = sectionStart + 1;
	for (let i = sectionStart + 1; i < file.lines.length; i++) {
		if (/^##\s/.test(file.lines[i])) break;
		if (/^-\s*s\d+\s*[:：]/.test(file.lines[i])) insertAt = i + 1;
	}
	file.lines.splice(insertAt, 0, `- ${id}: ${title}`);
}

// ---------------------------------------------------------------------------
// 工具注册
// ---------------------------------------------------------------------------

/**
 * @param {any} ctx Cordis context（顶层插件，注册为全局工具）
 * @param {{templates:Record<string,string>, issuesScript:string}} env
 */
export function registerCoordinationTools(ctx, env) {
	const resolveRoot = async (args, exec) => (args?.root ? path.resolve(String(args.root)) : await cwdOf(ctx, exec));

	// ------------------------------------------------------------------ init
	registerTool(ctx, {
		name: "eai_init",
		description:
			"初始化项目的 coordination 层（幂等）：写入 AGENTS.md 规范插桩、todo.md、.ai/（STRUCTURE、REQ/ERR/META 模板、issues CLI）、docs/plans/，并确保全局池骨架。项目根已有 .ai/ 时先报告状态，不要重复初始化。",
		parameters: {
			root: { type: "string", description: "项目根绝对路径；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({
				ok: { type: "boolean" },
				root: { type: "string" },
				created: { type: "array", items: { type: "string" } },
				skipped: { type: "array", items: { type: "string" } },
				warnings: { type: "array", items: { type: "string" } },
				text: { type: "string" },
			}),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const root = await resolveRoot(args, exec);
			const result = await initProject({
				root,
				templates: env.templates,
				issuesScript: env.issuesScript,
				policy: policyOf(ctx, exec),
			});
			const lines = [
				`coordination 已就绪：${result.root}`,
				"",
				"新建：",
				...(result.project.created.length ? result.project.created.map((item) => `  + ${item}`) : ["  （无）"]),
				"跳过：",
				...(result.project.skipped.length ? result.project.skipped.map((item) => `  · ${item}`) : ["  （无）"]),
				...(result.warnings.length ? ["", "警告：", ...result.warnings.map((item) => `  ! ${item}`)] : []),
				...(result.global?.seeded?.length ? ["", `全局池：已播种 ${result.global.seeded.join(" / ")}（process-role 基卡）`] : []),
				"",
				"下一步：",
				...result.next.map((item) => `  - ${item}`),
			];
			return {
				ok: true,
				root: result.root,
				created: result.project.created,
				skipped: result.project.skipped,
				warnings: result.warnings,
				text: lines.join("\n"),
			};
		},
	});

	// ------------------------------------------------------------------ todo
	registerTool(ctx, {
		name: "eai_todo",
		description:
			"维护项目 todo.md（唯一任务事实源）。action: list 看板；add 新建任务(desc, stage 默认 s0)；start/done 标记进行中/完成(id)；link 关联当前宿主 session(id)；set_issue 写入 issue 编号(id, issue)；stage_add 登记阶段(id, title)。禁止用 edit/write 直接改任务行，否则会与工具写入冲突。",
		parameters: {
			action: { type: "string", required: true, description: "list | add | start | done | link | set_issue | stage_add" },
			id: { type: "string", description: "任务编号 T-NNN（start/done/link/set_issue）或阶段编号 sN（stage_add）。" },
			desc: { type: "string", description: "add：任务描述。" },
			title: { type: "string", description: "stage_add：阶段标题。" },
			stage: { type: "string", description: "add：阶段 id（s1/s2/…，默认 s0）。" },
			issue: { type: "number", description: "set_issue：issue 编号。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({
				action: { type: "string" },
				ok: { type: "boolean" },
				id: { type: "string" },
				text: { type: "string" },
			}),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const policy = policyOf(ctx, exec);
			const sessionId = L.shortSessionId(sessionIdOf(exec));
			const action = String(args.action ?? "");
			const { paths, file, io } = await loadTodo(startDir, policy);

			if (action === "list") {
				return { action, ok: true, text: L.renderBoard(file) };
			}

			if (action === "stage_add") {
				if (!args.id || !args.title) throw new Error("stage_add 需要 id（如 s1）和 title。");
				if (!/^s\d+$/.test(args.id)) throw new Error(`阶段 id 必须形如 s1，收到 ${args.id}`);
				const title = String(args.title).trim();
				if (!title) throw new Error("stage_add 的 title 不能为空。");
				if (file.stages.some((stage) => stage.id === args.id)) throw new Error(`阶段 ${args.id} 已存在。`);
				addStage(file, args.id, title);
				await saveTodo(paths, file, io);
				return { action, ok: true, id: args.id, text: `已登记阶段 ${args.id}: ${title}` };
			}

			if (action === "add") {
				if (!args.desc?.trim()) throw new Error("add 需要 desc（任务描述）。");
				const stage = args.stage ?? "s0";
				if (!file.stages.some((item) => item.id === stage)) {
					throw new Error(`未知阶段 ${stage}。现有：${file.stages.map((item) => item.id).join(", ") || "（无）"}。先用 eai_todo {action:'stage_add'} 登记，或改 todo.md「阶段定义」。`);
				}
				const desc = L.sanitizeTodoDesc(args.desc);
				const id = L.nextItemId(file.items, file.lines);
				L.appendItem(file, { id, done: false, doing: false, stage, desc });
				await saveTodo(paths, file, io);
				return { action, ok: true, id, text: `已添加 ${id} [stage:${stage}] ${desc}` };
			}

			if (action === "start" || action === "done") {
				if (!args.id) throw new Error(`${action} 需要 id（T-NNN）。`);
				const patch = action === "done" ? { done: true, doing: false } : { doing: true, done: false };
				const item = L.updateItem(file, args.id, patch);
				if (!item) throw new Error(`未找到任务 ${args.id}。`);
				await saveTodo(paths, file, io);
				return { action, ok: true, id: args.id, text: `${args.id} → ${action === "done" ? "完成 ✓" : "进行中 ~"}` };
			}

			if (action === "link") {
				if (!args.id) throw new Error("link 需要 id（T-NNN）。");
				if (!sessionId) throw new Error("当前工具调用没有关联会话，无法写入 @session。");
				const item = L.updateItem(file, args.id, { session: sessionId });
				if (!item) throw new Error(`未找到任务 ${args.id}。`);
				await saveTodo(paths, file, io);
				return { action, ok: true, id: args.id, text: `${args.id} 已关联 session ${sessionId}` };
			}

			if (action === "set_issue") {
				if (!args.id || args.issue === undefined) throw new Error("set_issue 需要 id 和 issue。");
				const issue = Number(args.issue);
				if (!Number.isInteger(issue) || issue < 1) throw new Error(`issue 必须是 >=1 的整数，收到 ${JSON.stringify(args.issue)}`);
				const item = L.updateItem(file, args.id, { issue });
				if (!item) throw new Error(`未找到任务 ${args.id}。`);
				await saveTodo(paths, file, io);
				return { action, ok: true, id: item.id, text: `${item.id} ↔ issue #${issue}` };
			}

			throw new Error(`未知 action ${action}。可选：list | add | start | done | link | set_issue | stage_add`);
		},
	});

	// ------------------------------------------------------------------ status
	registerTool(ctx, {
		name: "eai_status",
		description:
			"coordination 全量状态：todo 看板、阶段进度、项目/全局 META 条数、HANDOFF 卡片状态、STRUCTURE 与 issues CLI 是否就绪。只读，不改任何文件。",
		parameters: {
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const result = await statusReport({ startDir, sessionId: sessionIdOf(exec), policy: policyOf(ctx, exec) });
			return { ok: true, text: result.report };
		},
	});

	// ------------------------------------------------------------------ plan
	registerTool(ctx, {
		name: "eai_plan_save",
		description:
			"把已获用户批准的计划落盘：写 docs/plans/PLAN-NNN-*.md，回写 todo.md 阶段行的 plan 引用，并把每个步骤登记为任务（自动编号）。计划模式（plan mode）里先用 exit_plan_mode 获得批准，再调用本工具；不要在未批准时落盘。",
		parameters: {
			stage: { type: "string", required: true, description: "计划归属阶段 id（必须先存在，如 s1）。" },
			steps: { type: "array", items: { type: "string" }, description: "计划步骤（一句一个，可独立验证）。省略时从 plan 提取编号行。" },
			acceptance: { type: "array", items: { type: "string" }, description: "与 steps 一一对应的验收标准（多步骤计划必填；问题分解 → 逐步验收 → 最后整合）。" },
			research: { type: "string", description: "eai_research 产出的研究编号（RESEARCH-NNN）；计划文档会引用它。" },
			skip_research: { type: "string", description: "跳过研究门禁的理由（仅纯文档/无实现任务）；与 research 二选一。" },
			plan: { type: "string", description: "计划 Markdown 原文；steps 省略时用它提取编号步骤。" },
			title: { type: "string", description: "计划标题（默认取阶段标题）。" },
			notes: { type: "string", description: "备注/风险/验收标准。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({
				ok: { type: "boolean" },
				stage: { type: "string" },
				plan: { type: "string" },
				added: { type: "array", items: { type: "string" } },
				text: { type: "string" },
			}),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const stage = String(args.stage ?? "").trim();
			if (!stage) throw new Error("eai_plan_save 需要 stage（阶段 id，如 s1）。");
			const startDir = await resolveRoot(args, exec);
			const steps = Array.isArray(args.steps) && args.steps.length > 0 ? args.steps.map(String) : L.extractSteps(args.plan);
			if (steps.length === 0) throw new Error("没有可落盘的步骤：传 steps 数组，或传带编号列表的 plan。");
			const result = await savePlan({
				startDir,
				stage,
				steps,
				acceptance: args.acceptance,
				research: args.research,
				skipResearch: args.skip_research,
				notes: args.notes,
				title: args.title,
				sessionId: sessionIdOf(exec),
				policy: policyOf(ctx, exec),
			});
			return {
				ok: true,
				stage: result.stage,
				plan: result.planRel,
				added: result.added,
				text: `计划已落盘 ${result.planRel}（阶段 ${result.stage}），${result.total} 个步骤已登记为 ${result.added.join(", ")}。`,
			};
		},
	});

	// ------------------------------------------------------------------ handoff
	registerTool(ctx, {
		name: "eai_handoff",
		description:
			"跨宿主交接卡：action=write 写 .ai/HANDOFF.md（交出方换宿主前必做，自动附 git status/log 取证）；action=read 读卡片；action=consume 接手方确认接上后消化卡片（状态改 resumed、任务 @session 重绑本会话）。write 必须给出 next 与 verify。",
		parameters: {
			action: { type: "string", required: true, description: "write | read | consume" },
			task: { type: "string", description: "write：关联任务 T-NNN。" },
			done: { type: "string", description: "write：已完成内容（证据 = commit/测试输出）。" },
			doing: { type: "string", description: "write：进行中/半成品状态。" },
			blockers: { type: "string", description: "write：卡点、死路、已排除方向。" },
			next: { type: "string", description: "write：接手方下一步（可直接执行的命令/动作）。" },
			verify: { type: "string", description: "write：证明接上的最小验证命令 + 期望输出。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, status: { type: "string" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const policy = policyOf(ctx, exec);
			const action = String(args.action ?? "");
			if (action === "write") {
				if (!args.next?.trim() || !args.verify?.trim()) {
					throw new Error("交接卡必须写 next（下一步）与 verify（验证命令）；不允许空白交接。");
				}
				const result = await writeHandoff({
					startDir,
					task: args.task,
					done: args.done,
					doing: args.doing,
					blockers: args.blockers,
					next: args.next,
					verify: args.verify,
					sessionId: sessionIdOf(exec),
					policy,
				});
				return { ok: true, status: "open", text: `交接卡已写入 ${result.path}\n任务：${result.task ?? "（未关联）"} · 交出方 dsh/${result.session}\n提醒：提交并推送卡片，接手方 pull 后才看得到。` };
			}
			if (action === "read") {
				const found = await readHandoff({ startDir, policy });
				if (!found) return { ok: false, status: "missing", text: "没有交接卡（.ai/HANDOFF.md 不存在）。" };
				return { ok: true, status: found.card.status, text: found.raw };
			}
			if (action === "consume") {
				const result = await consumeHandoff({ startDir, sessionId: sessionIdOf(exec), policy });
				if (result.skipped) return { ok: true, status: result.card.status, text: result.skipped };
				const taskText = result.taskId ? (result.taskFound ? `，${result.taskId} 已重绑本会话` : `；任务 ${result.taskId} 不在 todo.md，未重绑`) : "";
				return {
					ok: true,
					status: "resumed",
					text: `交接卡已消化：状态 resumed，接手方 dsh/${result.session}${taskText}。\n继续按卡片「下一步」执行；G2 纪律照常。`,
				};
			}
			throw new Error(`未知 action ${action}。可选：write | read | consume`);
		},
	});

	// ------------------------------------------------------------------ issue
	registerTool(ctx, {
		name: "eai_issue",
		description:
			"todo.md ↔ git issues 同步。action: sync 为无编号待办建 issue 并回写 (#N)；list 查看映射；close-done 关闭已完成任务的 issue；view/close/open 针对单个编号。GitHub 用 gh CLI（需已登录），Gitee 需 GITEE_TOKEN。sync 建议先 dry_run 预览。",
		parameters: {
			action: { type: "string", required: true, description: "sync | list | close-done | view | close | open" },
			stage: { type: "string", description: "sync/list 的阶段过滤（s1 等）。" },
			dry_run: { type: "boolean", description: "sync/close-done：只预览不写入。" },
			number: { type: "number", description: "view/close/open 的 issue 编号。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, host: { type: "string" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const result = await runIssueTool({
				startDir,
				action: String(args.action ?? ""),
				stage: args.stage,
				dryRun: Boolean(args.dry_run),
				number: args.number === undefined ? undefined : Number(args.number),
				policy: policyOf(ctx, exec),
			});
			return { ok: true, host: result.host, text: result.text };
		},
	});

	// ------------------------------------------------------------------ error
	registerTool(ctx, {
		name: "eai_error",
		description:
			"G3 五步错误提炼：写 .ai/errors/raw/ERR-NNN.md（现象/根因/修复/预防），并按受控分类蒸馏一条 META 规则到项目池。任何构建/测试/运行时报错都当场记录；不许写「玄学」或「暂时好了」。连续两次同根因报错应先停下来升级为 REQ 卡走计划流程。",
		parameters: {
			symptom: { type: "string", required: true, description: "现象：精确报错、复现步骤、期望 vs 实际。" },
			root_cause: { type: "string", required: true, description: "根因：定位过程 + 结论。" },
			fix: { type: "string", description: "修复：改了什么（文件/提交/命令）。" },
			prevention: { type: "string", description: "预防：检查、约束、自动化手段。" },
			meta_category: { type: "string", description: "受控分类：BUILD/ENV/TEST/DATA/API/ARCH/PROC/DOC/SEC/PERF/DEP/COLLAB。" },
			meta_rule: { type: "string", description: "蒸馏出的可复用规则（一句话，含触发条件）。" },
			evidence: { type: "string", description: "证据：报错原文、日志片段、命令输出。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, err: { type: "string" }, meta: { type: "string" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const policy = policyOf(ctx, exec);
			let related = null;
			try {
				related = await recallExperience({ startDir, query: String(args.symptom ?? ""), limit: 3, policy });
			} catch {
				/* 未激活或检索失败不阻断记录 */
			}
			const result = await recordError({
				startDir,
				symptom: args.symptom,
				rootCause: args.root_cause,
				fix: args.fix,
				prevention: args.prevention,
				metaCategory: args.meta_category,
				metaRule: args.meta_rule,
				evidence: args.evidence,
				sessionId: sessionIdOf(exec),
				policy,
			});
			const relatedText = related?.matches?.length
				? `\n\n相关旧经验（先对照再修，勿重复踩坑）：\n${related.matches.map((match) => `  ${match.kind} ${match.id} — ${match.title}`).join("\n")}`
				: "\n\n相关旧经验：无命中（首次遇到，按五步法沉淀）。";
			return {
				ok: true,
				err: result.errId,
				meta: result.metaId ?? "",
				text: `${result.errId} 已记录${result.metaId ? `，蒸馏 ${result.metaId}` : "（未蒸馏 META，补齐 meta_rule 可补记）"}。\n路径：${result.path}${relatedText}`,
			};
		},
	});

	// ------------------------------------------------------------------ meta
	registerTool(ctx, {
		name: "eai_meta",
		description:
			"项目 META 规则池管理。action=list 列出项目/全局规则；action=promote 把一条确认跨项目普适的项目规则提升到全局池（AI_GLOBAL_DIR/meta/distilled/meta-rules.md，四位编号），并在项目规则末尾回写全局编号。提升前先与用户确认「确实普适」。",
		parameters: {
			action: { type: "string", required: true, description: "list | promote" },
			rule: { type: "string", description: "promote：META-NNN 编号或标题关键词。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const policy = policyOf(ctx, exec);
			const action = String(args.action ?? "");
			if (action === "list") {
				const result = await listMeta({ startDir, policy });
				const fmt = (rules, limit) => {
					if (rules.length === 0) return "  （无）";
					const shown = limit && rules.length > limit ? rules.slice(-limit) : rules;
					const head = limit && rules.length > limit ? [`  …… 共 ${rules.length} 条，仅列最近 ${limit} 条`] : [];
					return [...head, ...shown.map((entry) => `  ${entry.id}${entry.title ? ` ${entry.title}` : ""}`)].join("\n");
				};
				return {
					ok: true,
					text: [
						`项目规则（${result.projectPath}）：`,
						fmt(result.project, 30),
						"",
						`全局池（${result.globalPath}）：`,
						fmt(result.global, 15),
					].join("\n"),
				};
			}
			if (action === "promote") {
				if (!args.rule) throw new Error("promote 需要 rule（META-NNN 或关键词）。");
				const result = await promoteMeta({ startDir, rule: args.rule, policy });
				return { ok: true, text: `${result.projectRule} → ${result.globalRule}\n已写入 ${result.globalPath}` };
			}
			throw new Error(`未知 action ${action}。可选：list | promote`);
		},
	});

	// ------------------------------------------------------------------ agent pool
	registerTool(ctx, {
		name: "eai_agent",
		description:
			"全局角色卡池（RAG pool v2，AI_GLOBAL_DIR/agents）：派发前检索、未命中建卡、角色自升级、经验沉淀。action: query 检索（任务描述→top 卡+记忆，缺口提示建卡）；list 卡片清单；register 建卡（≥3 keywords、scope.do/dont 必写、taxonomy 路径必须存在，first_mission=pending）；update 自升级（只改自己的卡，version+1）；reflect 从刚完成的任务里提取可补充的检索词（提示词成长建议，不写盘）；memory_add 写本角色经验；memory_list 查经验；first_mission_done 首任务复核。",
		parameters: {
			action: { type: "string", required: true, description: "query | list | register | update | reflect | memory_add | memory_list | first_mission_done" },
			task: { type: "string", description: "query：任务描述（关键词越具体越好）。" },
			limit: { type: "number", description: "query：返回卡/记忆条数（默认 5）。" },
			threshold: { type: "number", description: "query：缺口阈值（默认 3；top 分低于它=建卡信号）。" },
			id: { type: "string", description: "register/update/first_mission_done：卡片 id（kebab-case）。" },
			type: { type: "string", description: "register：process-role | domain-expert。" },
			name: { type: "string", description: "register：显示名。" },
			summary: { type: "string", description: "register/update：≤80 字摘要（禁「通用/万能/all-in-one」）。" },
			taxonomy: { type: "array", items: { type: "string" }, description: "register：taxonomy 路径数组（如 embedded.driver.sensor-imu）。" },
			keywords: { type: "array", items: { type: "string" }, description: "register/update：≥3 个检索关键词。" },
			scope_do: { type: "array", items: { type: "string" }, description: "register/update：scope.do（职责内，≥1 条）。" },
			scope_dont: { type: "array", items: { type: "string" }, description: "register/update：scope.dont（明确不做，≥1 条）。" },
			applies_to: { type: "array", items: { type: "string" }, description: "register/update：典型任务场景（检索加权）。" },
			reject_hint: { type: "string", description: "register/update：退单建议（涉及 XX → 某 agent）。" },
			note: { type: "string", description: "update：自升级记录一行（为什么改）。" },
			owner: { type: "string", description: "memory_add/memory_list：角色 id（省略时用 id）。" },
			title: { type: "string", description: "memory_add：经验标题（description）。" },
			content: { type: "string", description: "memory_add：经验正文（可多行）。" },
			domains: { type: "array", items: { type: "string" }, description: "memory_add：领域标签。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const io = createIo(policyOf(ctx, exec));
			const action = String(args.action ?? "");
			const paths = poolPaths();

			if (action === "query") {
				if (!args.task?.trim()) throw new Error("query 需要 task（任务描述）。");
				const limit = intArg(args.limit, "limit", { fallback: 5 });
				const threshold = numberArg(args.threshold, "threshold", { fallback: 3 });
				const result = await queryAgentPool(io, args.task, { limit, threshold });
				return { ok: true, text: renderQuery(result, limit) };
			}

			if (action === "list") {
				const cards = await listAgentCards(io);
				return { ok: true, text: `${renderCardList(cards)}\n\n路径：${paths.poolDir}` };
			}

			if (action === "register") {
				const result = await registerAgentCard(io, {
					id: args.id,
					type: args.type,
					name: args.name,
					summary: args.summary,
					taxonomy: args.taxonomy,
					keywords: args.keywords,
					scope: { do: args.scope_do, dont: args.scope_dont },
					applies_to: args.applies_to,
					reject_hint: args.reject_hint,
				});
				return {
					ok: true,
					text: [
						`已建卡 ${result.card.id}（${result.card.type}）→ ${result.path}`,
						"first_mission=pending：首任务完成后调用 eai_agent {action:'first_mission_done', id}。",
						"派发前先 eai_agent {action:'query', task} 复核命中。",
					].join("\n"),
				};
			}

			if (action === "update") {
				if (!args.id) throw new Error("update 需要 id。");
				const result = await updateAgentCard(io, String(args.id), {
					summary: args.summary,
					keywords: args.keywords,
					scope: { do: args.scope_do, dont: args.scope_dont },
					applies_to: args.applies_to,
					reject_hint: args.reject_hint,
					note: args.note,
				});
				return { ok: true, text: `${result.card.id} 已升级到 v${result.card.version}（${result.note}）\n路径：${result.path}` };
			}

			if (action === "reflect") {
				if (!args.id || !args.task) throw new Error("reflect 需要 id 与 task（刚完成的任务描述）。");
				const result = await reflectCard(io, String(args.id), String(args.task));
				const existing = result.keywords ?? [];
				return {
					ok: true,
					text: [
						`提示词成长建议 · ${result.id}`,
						`- 现有 keywords：${existing.join(" / ") || "（无）"}`,
						`- 建议补充：${result.proposed.join(" / ") || "（本次任务没有新词，暂不升级）"}`,
						"（分词候选可能含碎片，update 前人工筛掉噪声词。）",
						result.proposed.length
							? `确认后：eai_agent {action:'update', id:'${result.id}', keywords:[${[...existing, ...result.proposed].map((word) => `'${word}'`).join(", ")}], note:'reflect: 补检索词'}`
							: "无需升级；升级必须基于经验证据，不要凭感觉改卡。",
					].join("\n"),
				};
			}

			if (action === "memory_add") {
				const owner = String(args.owner ?? args.id ?? "").trim();
				if (!owner) throw new Error("memory_add 需要 owner（角色 id）。");
				if (!args.title?.trim()) throw new Error("memory_add 需要 title。");
				const result = await addAgentMemory(io, {
					owner,
					type: args.type,
					title: args.title,
					content: args.content,
					domains: args.domains,
					keywords: args.keywords,
				});
				return { ok: true, text: `经验已写入 ${result.file}（${result.type}）\n索引：${path.join(paths.memoryDir, owner, "MEMORY.md")}` };
			}

			if (action === "memory_list") {
				const owner = args.owner ?? args.id;
				const rows = await listAgentMemory(io, owner ? String(owner) : undefined);
				if (rows.length === 0) return { ok: true, text: "没有记忆条目。用 eai_agent {action:'memory_add'} 沉淀经验。" };
				return {
					ok: true,
					text: [
						`记忆 ${rows.length} 条：`,
						...rows.map((row) => `  [${row.owner}] ${row.id}${row.type ? `（${row.type}）` : ""} — ${row.summary ?? ""}`),
					].join("\n"),
				};
			}

			if (action === "first_mission_done") {
				if (!args.id) throw new Error("first_mission_done 需要 id。");
				const result = await completeFirstMission(io, String(args.id));
				return {
					ok: true,
					text: result.already ? `${result.id} 已复核过（first_mission=done），跳过。` : `${result.id} first_mission → done（首任务复核完成）\n路径：${result.path}`,
				};
			}

			throw new Error(`未知 action ${action}。可选：query | list | register | update | memory_add | memory_list | first_mission_done`);
		},
	});

	// ------------------------------------------------------------------ dispatch
	registerTool(ctx, {
		name: "eai_dispatch",
		description:
			"生成多 agent 派发矩阵与任务卡：按 todo.md 未完成任务检索角色卡池，输出阶段×任务×角色×文件域的派发建议，并（默认）落盘 .ai/dispatch/DISPATCH-*.md。只生成矩阵，不执行派发；真正执行用 subagent / subagent_fork / workflow（pipeline）。缺口任务走 eai_agent register 建卡。",
		parameters: {
			stage: { type: "string", description: "只调度某阶段（s1）；省略 = 全部未完成。" },
			tasks: { type: "array", items: { type: "string" }, description: "只调度指定任务编号（T-003）。" },
			record: { type: "boolean", description: "是否落盘派发记录（默认 true）。" },
			threshold: { type: "number", description: "角色卡命中阈值（默认 3）。" },
			meta_injection: { type: "string", description: "任务卡 META 预注入：full | partial | none（默认 partial）。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, path: { type: "string" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const { paths, file, io } = await loadTodo(startDir, policyOf(ctx, exec));
			const result = await buildDispatch({
				io,
				todoFile: file,
				paths,
				stage: args.stage ? String(args.stage).trim() : undefined,
				taskIds: Array.isArray(args.tasks) ? args.tasks.map(String) : undefined,
				record: args.record !== false,
				threshold: numberArg(args.threshold, "threshold", { fallback: 3 }),
				metaInjection: args.meta_injection ? String(args.meta_injection) : "partial",
			});
			return {
				ok: true,
				path: result.path ?? "",
				text: result.path
					? `${result.text}\n\n已记录：${result.path}\n机器可读派发计划（含每个 subagent 的 prompt）：${result.jsonPath}`
					: result.text,
			};
		},
	});

	// ------------------------------------------------------------------ recall
	registerTool(ctx, {
		name: "eai_recall",
		description:
			"旧经验检索（自我使用旧有经验 / 自纠正）：按关键词在 .ai 的 ERR 卡、项目 META、全局 META、角色记忆里召回相关条目并打分。开工前、写新 ERR 前、连续同根因报错时先跑；命中先对照旧经验再动手，避免重复踩坑。",
		parameters: {
			query: { type: "string", required: true, description: "要检索的现象/关键词（报错原文、任务描述、技术关键词）。" },
			limit: { type: "number", description: "返回条数（默认 5）。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			if (!args.query?.trim()) throw new Error("recall 需要 query。");
			const startDir = await resolveRoot(args, exec);
			const result = await recallExperience({
				startDir,
				query: String(args.query),
				limit: intArg(args.limit, "limit", { fallback: 5 }),
				policy: policyOf(ctx, exec),
			});
			return { ok: true, text: renderRecall(result) };
		},
	});

	// ------------------------------------------------------------------ architecture
	registerTool(ctx, {
		name: "eai_arch",
		description:
			"七层单向依赖检查：扫描 src/<shared|core|interface|presentation>/ 的直接 import，报告反向/跨层引用（presentation → interface → core → shared）。G2 写操作后跑；违规先落 interface 契约或登记 REQ，不要「能跑就放过」。启发式检查，间接依赖仍需评审。",
		parameters: {
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const result = await checkArchitecture({ root: startDir, io: createIo(policyOf(ctx, exec)) });
			return { ok: result.ok, text: result.text };
		},
	});

	// ------------------------------------------------------------------ research
	registerTool(ctx, {
		name: "eai_research",
		description:
			"记录外部方案检索（不闭门造车的门禁产物）：官方文档 / 开源仓库 / 已验证做法。eai_plan_save 落盘前必须传 research 编号，或显式 skip_research 说明原因。返回 RESEARCH-NNN 编号与 .ai/research/ 路径。",
		parameters: {
			topic: { type: "string", required: true, description: "要解决的实现问题（一句话）。" },
			sources: { type: "array", items: { type: "string" }, required: true, description: "来源列表：URL 或 owner/repo（至少 1 条）；可附一句说明。" },
			decision: { type: "string", description: "adopt（直接采用）/ adapt（改造）/ build（自研）/ reject（不采用）。" },
			notes: { type: "string", description: "取舍与理由：为什么采用/不采用，与现有架构的冲突点。" },
			root: { type: "string", description: "项目根；省略 = 当前会话工作目录。" },
		},
		output: {
			schema: objectSchema({ ok: { type: "boolean" }, id: { type: "string" }, path: { type: "string" }, text: { type: "string" } }),
			render: (_args, value) => text(value.text),
		},
		async execute(args, exec) {
			const startDir = await resolveRoot(args, exec);
			const result = await recordResearch({
				startDir,
				topic: args.topic,
				sources: args.sources,
				decision: args.decision,
				notes: args.notes,
				sessionId: sessionIdOf(exec),
				policy: policyOf(ctx, exec),
			});
			return {
				ok: true,
				id: result.id,
				path: result.file,
				text: `${result.id} 已记录（${result.decision}，${result.sources} 条来源）→ ${result.path}\n计划落盘时传 research:'${result.id}'。`,
			};
		},
	});
}