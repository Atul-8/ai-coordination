/**
 * tools.js — 模型面向的 coordination 工具（8 个）
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
import { cwdOf, policyOf, sessionIdOf } from "./host.js";

function text(value) {
	return [{ type: "text", text: value }];
}

function objectSchema(properties) {
	return { type: "object", additionalProperties: false, properties };
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
	ctx.tools.register({
		name: "coord_init",
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
	ctx.tools.register({
		name: "coord_todo",
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
				if (file.stages.some((stage) => stage.id === args.id)) throw new Error(`阶段 ${args.id} 已存在。`);
				addStage(file, args.id, String(args.title).trim());
				await saveTodo(paths, file, io);
				return { action, ok: true, id: args.id, text: `已登记阶段 ${args.id}: ${args.title}` };
			}

			if (action === "add") {
				if (!args.desc?.trim()) throw new Error("add 需要 desc（任务描述）。");
				const stage = args.stage ?? "s0";
				if (!file.stages.some((item) => item.id === stage)) {
					throw new Error(`未知阶段 ${stage}。现有：${file.stages.map((item) => item.id).join(", ") || "（无）"}。先用 coord_todo {action:'stage_add'} 登记，或改 todo.md「阶段定义」。`);
				}
				const id = L.nextItemId(file.items);
				L.appendItem(file, { id, done: false, doing: false, stage, desc: String(args.desc).trim() });
				await saveTodo(paths, file, io);
				return { action, ok: true, id, text: `已添加 ${id} [stage:${stage}] ${args.desc}` };
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
				const item = L.updateItem(file, args.id, { issue: Number(args.issue) });
				if (!item) throw new Error(`未找到任务 ${args.id}。`);
				await saveTodo(paths, file, io);
				return { action, ok: true, id: args.id, text: `${args.id} ↔ issue #${args.issue}` };
			}

			throw new Error(`未知 action ${action}。可选：list | add | start | done | link | set_issue | stage_add`);
		},
	});

	// ------------------------------------------------------------------ status
	ctx.tools.register({
		name: "coord_status",
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
	ctx.tools.register({
		name: "coord_plan_save",
		description:
			"把已获用户批准的计划落盘：写 docs/plans/PLAN-NNN-*.md，回写 todo.md 阶段行的 plan 引用，并把每个步骤登记为任务（自动编号）。计划模式（plan mode）里先用 exit_plan_mode 获得批准，再调用本工具；不要在未批准时落盘。",
		parameters: {
			stage: { type: "string", required: true, description: "计划归属阶段 id（必须先存在，如 s1）。" },
			steps: { type: "array", items: { type: "string" }, description: "计划步骤（一句一个，可独立验证）。省略时从 plan 提取编号行。" },
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
			const startDir = await resolveRoot(args, exec);
			const steps = Array.isArray(args.steps) && args.steps.length > 0 ? args.steps.map(String) : L.extractSteps(args.plan);
			if (steps.length === 0) throw new Error("没有可落盘的步骤：传 steps 数组，或传带编号列表的 plan。");
			const result = await savePlan({
				startDir,
				stage: String(args.stage),
				steps,
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
	ctx.tools.register({
		name: "coord_handoff",
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
				return {
					ok: true,
					status: "resumed",
					text: `交接卡已消化：状态 resumed，接手方 dsh/${result.session}${result.taskId ? `，${result.taskId} 已重绑本会话` : ""}。\n继续按卡片「下一步」执行；G2 纪律照常。`,
				};
			}
			throw new Error(`未知 action ${action}。可选：write | read | consume`);
		},
	});

	// ------------------------------------------------------------------ issue
	ctx.tools.register({
		name: "coord_issue",
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
	ctx.tools.register({
		name: "coord_error",
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
				policy: policyOf(ctx, exec),
			});
			return {
				ok: true,
				err: result.errId,
				meta: result.metaId ?? "",
				text: `${result.errId} 已记录${result.metaId ? `，蒸馏 ${result.metaId}` : "（未蒸馏 META，补齐 meta_rule 可补记）"}。\n路径：${result.path}`,
			};
		},
	});

	// ------------------------------------------------------------------ meta
	ctx.tools.register({
		name: "coord_meta",
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
}