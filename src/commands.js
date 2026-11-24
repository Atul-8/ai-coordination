/**
 * commands.js — 人类斜杠命令（/coord 组 + /coord-* 扁平别名）
 *
 * 与 pi 版 /go /status /todo 的职责对应：
 *   /coord status      看板与状态
 *   /coord todo        任务看板
 *   /coord init        初始化项目（幂等）
 *   /coord go s1       阶段调度：写 @session 关联并把任务清单派发给模型
 *   /coord handoff     读交接卡；/coord handoff done 消化交接卡
 *   /coord issues      任务 ↔ issue 映射；/coord issues sync [--dry-run]
 *   /coord meta        项目/全局 META 规则概览
 *   /coord agents      角色卡池：列表 / 检索
 *   /coord dispatch    派发矩阵 + 任务卡（落盘 .ai/dispatch/）
 *   /coord growth      自我成长状态
 *   /coord recall      旧经验检索
 *   /coord arch        七层单向依赖检查
 *   /coord research    记录外部方案检索（计划门禁）
 *
 * 命令在校验与计算后直接返回文本；只有 /coord go 需要唤醒模型（followup）。
 */

import path from "node:path";
import * as L from "./lib.js";
import { createIo, globalMetaRulesPath, initProject, listMeta, loadTodo, saveTodo, statusReport } from "./project.js";
import { runIssueTool } from "./issues.js";
import { consumeHandoff, readHandoff } from "./project.js";
import { checkArchitecture } from "./arch.js";
import { recallExperience, renderRecall } from "./recall.js";
import { recordResearch } from "./research.js";
import {
	buildDispatch,
	listAgentCards,
	listAgentMemory,
	queryAgentPool,
	renderCardList,
	renderQuery,
} from "./agents.js";
import { cwdOf, execOfInvocation, policyOf, shortSessionOf } from "./host.js";

export function registerCoordinationCommands(ctx, env) {
	const resolveDir = async (invocation, explicit) => (explicit ? path.resolve(explicit) : await cwdOf(ctx, execOfInvocation(invocation)));

	const define = (name, description, hint, handler) => {
		ctx.commands.register({
			name,
			description,
			input: hint ? { hint } : undefined,
			handler: async (invocation) => {
				try {
					const text = await handler(invocation);
					return { kind: "success", text };
				} catch (error) {
					return { kind: "error", text: error?.message ?? String(error) };
				}
			},
		});
	};

	const runStatus = async (invocation, dir) => {
		const result = await statusReport({
			startDir: dir ?? (await resolveDir(invocation)),
			sessionId: invocation.agent?.id,
			policy: policyOf(ctx, execOfInvocation(invocation)),
		});
		return result.report;
	};

	const runInit = async (invocation, arg) => {
		const root = await resolveDir(invocation, arg);
		const result = await initProject({
			root,
			templates: env.templates,
			issuesScript: env.issuesScript,
			policy: policyOf(ctx, execOfInvocation(invocation)),
		});
		return [
			`coordination 已就绪：${result.root}`,
			`新建 ${result.project.created.length} 项，跳过 ${result.project.skipped.length} 项。`,
			...(result.warnings.length ? ["警告：", ...result.warnings.map((item) => `  ! ${item}`)] : []),
			"下一步：编辑 todo.md 阶段定义 → /coord go <阶段> 或让 AI 落计划。",
		].join("\n");
	};

	const runTodo = async (invocation) => {
		const startDir = await resolveDir(invocation);
		const { file } = await loadTodo(startDir, policyOf(ctx, execOfInvocation(invocation)));
		return L.renderBoard(file);
	};

	const runGo = async (invocation, arg) => {
		const startDir = await resolveDir(invocation);
		const policy = policyOf(ctx, execOfInvocation(invocation));
		const { paths, file, io } = await loadTodo(startDir, policy);
		if (file.items.length === 0) return "todo.md 无任务。先用计划模式产出计划（审批后 coord_plan_save），或让 AI 用 coord_todo add 添加。";

		const target = String(arg ?? "").trim();
		let picked = [];
		let title = "";
		if (/^T-\d+$/i.test(target)) {
			const item = file.items.find((candidate) => candidate.id.toLowerCase() === target.toLowerCase());
			if (!item) throw new Error(`未找到任务 ${target}。`);
			picked = [item];
			title = `单任务 ${item.id}`;
		} else if (/^s\d+$/.test(target)) {
			const stage = file.stages.find((candidate) => candidate.id === target);
			if (!stage) throw new Error(`未定义阶段 ${target}。先在 todo.md「阶段定义」登记。`);
			picked = file.items.filter((item) => item.stage === target && !item.done);
			title = `${stage.id}: ${stage.title}`;
		} else if (target) {
			throw new Error(`参数无法识别：${target}。用法 /coord go [sN | T-NNN]`);
		} else {
			const open = file.items.filter((item) => !item.done).length;
			const stages = file.stages.map((stage) => {
				const count = file.items.filter((item) => item.stage === stage.id && !item.done).length;
				return `${stage.id}（待办 ${count}）`;
			});
			return [`可选阶段：${stages.join(" · ") || "（无）"}`, `未完成任务共 ${open} 项。用法：/coord go s1 或 /coord go T-003。`].join("\n");
		}

		picked = picked.filter((item) => !item.done);
		if (picked.length === 0) return "所选范围内没有待办任务。";

		const short = shortSessionOf(execOfInvocation(invocation));
		if (!short) throw new Error("当前命令没有关联会话，无法写入 @session；请在会话内执行 /coord go。");
		for (const item of picked) L.updateItem(file, item.id, { session: short, doing: item.doing || false });
		await saveTodo(paths, file, io);

		const stage = file.stages.find((candidate) => candidate.id === picked[0].stage);
		const planLine = stage?.plan ? `阶段计划：${stage.plan}` : "阶段计划：（无）";
		const prompt = [
			`[/coord-go 阶段调度] ${title}`,
			`当前会话：${short}（已写入 todo.md @session 关联）`,
			planLine,
			`按顺序执行以下 ${picked.length} 项任务：`,
			...picked.map((item, i) => `${i + 1}. **${item.id}** ${item.desc}${item.issue ? `（issue #${item.issue}，详情用 .ai/scripts/issues.js view ${item.issue}）` : ""}`),
			"",
			"纪律：",
			"- 每完成一项，立即 coord_todo {action:'done', id:'T-NNN'}，再开始下一项。",
			"- 写操作后 G2 同步：层测试 → .ai/STRUCTURE.md → 任务/需求状态。",
			"- 出错当场走 coord_error 五步法（现象/根因/修复/预防/META）。",
			"- 任务粒度大时用 subagent 派发（writer 执行 → reviewer 复核）；多阶段可并行时用 workflow 按阶段 fan-out，参考技能 agi-dispatch。",
			"- 全部完成后：coord_issue {action:'close-done'} 关闭已完成 issue，并输出阶段总结。",
		].join("\n");

		const agent = ctx.get?.("agents")?.get(invocation.agent?.id);
		if (agent?.followup) {
			await agent.followup({ content: [{ type: "text", text: prompt }], source: { kind: "user" } });
			return `已调度 ${title}：${picked.length} 项任务，已关联 session ${short} 并派发给本会话。`;
		}
		return `已写入 @session 关联（${short}），但当前宿主不能自动唤醒模型。请把下面内容发给我执行：\n\n${prompt}`;
	};

	const runHandoff = async (invocation, arg) => {
		const startDir = await resolveDir(invocation);
		const policy = policyOf(ctx, execOfInvocation(invocation));
		const action = String(arg ?? "").trim();
		if (action === "done") {
			if (!invocation.agent?.id) throw new Error("当前命令没有关联会话，无法消化交接卡。");
			const result = await consumeHandoff({ startDir, sessionId: invocation.agent.id, policy });
			if (result.skipped) return result.skipped;
			const taskText = result.taskId ? (result.taskFound ? `，${result.taskId} 已重绑本会话` : `；任务 ${result.taskId} 不在 todo.md，未重绑`) : "";
			return `交接卡已消化：状态 resumed，接手方 dsh/${result.session}${taskText}。`;
		}
		const found = await readHandoff({ startDir, policy });
		if (!found) return "没有交接卡（.ai/HANDOFF.md 不存在）。开发到一半要换宿主时，用 coord_handoff 写卡。";
		return found.raw;
	};

	const runIssues = async (invocation, arg) => {
		const startDir = await resolveDir(invocation);
		const tokens = String(arg ?? "").trim().split(/\s+/).filter(Boolean);
		const action = tokens[0] && !tokens[0].startsWith("-") ? tokens[0] : "list";
		const stageIndex = tokens.findIndex((token) => token === "--stage" || token === "-s");
		const stage = stageIndex >= 0 ? tokens[stageIndex + 1] : undefined;
		const dryRun = tokens.includes("--dry-run") || tokens.includes("-n");
		const numberToken = tokens.find((token) => /^\d+$/.test(token));
		const result = await runIssueTool({
			startDir,
			action,
			stage,
			dryRun,
			number: numberToken ? Number(numberToken) : undefined,
			policy: policyOf(ctx, execOfInvocation(invocation)),
		});
		return result.text;
	};

	const runMeta = async (invocation) => {
		const startDir = await resolveDir(invocation);
		const result = await listMeta({ startDir, policy: policyOf(ctx, execOfInvocation(invocation)) });
		return [
			`项目规则 ${result.project.length} 条（${result.projectPath}）：`,
			...(result.project.length ? result.project.map((entry) => `  ${entry.id} ${entry.title}`) : ["  （无）"]),
			"",
			`全局池 ${result.global.length} 条（${result.globalPath}）`,
			"提升：让 AI 调用 coord_meta {action:'promote', rule:'META-NNN'}。",
		].join("\n");
	};

	const runAgents = async (invocation, arg) => {
		const io = createIo(policyOf(ctx, execOfInvocation(invocation)));
		const task = String(arg ?? "").trim();
		if (task) return renderQuery(await queryAgentPool(io, task, { limit: 5 }), 5);
		return renderCardList(await listAgentCards(io));
	};

	const runDispatch = async (invocation, arg) => {
		const startDir = await resolveDir(invocation);
		const { paths, file, io } = await loadTodo(startDir, policyOf(ctx, execOfInvocation(invocation)));
		const stage = String(arg ?? "").trim() || undefined;
		const result = await buildDispatch({ io, todoFile: file, paths, stage });
		return result.path ? `${result.text}\n\n已记录：${result.path}` : result.text;
	};

	const runGrowth = async (invocation) => {
		const io = createIo(policyOf(ctx, execOfInvocation(invocation)));
		const cards = await listAgentCards(io);
		const memories = await listAgentMemory(io);
		const pending = cards.filter((card) => card.first_mission === "pending");
		const byOwner = new Map();
		for (const memory of memories) byOwner.set(memory.owner, (byOwner.get(memory.owner) ?? 0) + 1);
		const globalMeta = (await io.read(globalMetaRulesPath())) ?? "";
		return [
			"自我成长状态（三层：memory → 自卡升级 → 全局 META）",
			"",
			`待复核卡（first_mission=pending）：${pending.length ? pending.map((card) => card.id).join(", ") : "（无）"}`,
			`记忆条目：${memories.length} 条${byOwner.size ? `（${[...byOwner.entries()].map(([owner, count]) => `${owner}=${count}`).join(" / ")}）` : ""}`,
			`全局 META：${L.countMetaRules(globalMeta)} 条（${globalMetaRulesPath()}）`,
			"",
			"操作：coord_agent memory_add / update / first_mission_done；跨项目普适教训 coord_meta promote。",
		].join("\n");
	};

	const runRecall = async (invocation, arg) => {
		const query = String(arg ?? "").trim();
		if (!query) throw new Error("用法：/coord recall <现象/关键词>");
		const startDir = await resolveDir(invocation);
		const result = await recallExperience({ startDir, query, limit: 5, policy: policyOf(ctx, execOfInvocation(invocation)) });
		return renderRecall(result);
	};

	const runArch = async (invocation) => {
		const startDir = await resolveDir(invocation);
		const result = await checkArchitecture({ root: startDir, io: createIo(policyOf(ctx, execOfInvocation(invocation))) });
		return result.text;
	};

	const runResearch = async (invocation, arg) => {
		const value = String(arg ?? "").trim();
		if (!value) throw new Error("用法：/coord research <主题> | <来源1> <来源2> …（来源可用逗号分隔）");
		const [topic, ...rest] = value.split("|").map((part) => part.trim());
		const sources = (rest.join("|").split(/[\s,，]+/).filter(Boolean));
		if (sources.length === 0) throw new Error("research 至少给 1 条来源（URL / owner/repo），格式：/coord research 主题 | 来源1 来源2");
		const startDir = await resolveDir(invocation);
		const result = await recordResearch({
			startDir,
			topic,
			sources,
			sessionId: invocation.agent?.id,
			policy: policyOf(ctx, execOfInvocation(invocation)),
		});
		return `${result.id} 已记录 → ${result.path}\n计划落盘时传 research:'${result.id}'。`;
	};

	// /coord 组命令
	define(
		"coord",
		"coordination 入口：/coord init|status|todo|go|handoff|issues|meta|agents|dispatch|growth|recall|arch|research",
		"init | status | todo | go <sN|T-NNN> | handoff [done] | issues [sync] | meta | agents [任务] | dispatch [sN] | growth | recall <关键词> | arch | research <主题> | <来源…>",
		async (invocation) => {
			const raw = String(invocation.rawInput ?? "").trim();
			const [sub, ...rest] = raw.split(/\s+/);
			const arg = rest.join(" ");
			if (!sub) return runStatus(invocation);
			switch (sub) {
				case "init":
					return runInit(invocation, arg);
				case "status":
					return runStatus(invocation);
				case "todo":
					return runTodo(invocation);
				case "go":
					return runGo(invocation, arg);
				case "handoff":
					return runHandoff(invocation, arg);
				case "issues":
					return runIssues(invocation, arg);
				case "meta":
					return runMeta(invocation);
				case "agents":
					return runAgents(invocation, arg);
				case "dispatch":
					return runDispatch(invocation, arg);
				case "growth":
					return runGrowth(invocation);
				case "recall":
					return runRecall(invocation, arg);
				case "arch":
					return runArch(invocation);
				case "research":
					return runResearch(invocation, arg);
				default:
					throw new Error(`未知子命令 ${sub || "（空）"}。可选：init | status | todo | go | handoff | issues | meta | agents | dispatch | growth | recall | arch | research`);
			}
		},
	);

	// 扁平别名（等价 /coord <sub>）
	define("coord-init", "初始化项目 coordination 层（幂等）", "[项目根]", (invocation) => runInit(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-status", "coordination 全量状态（todo / META / HANDOFF / 结构）", undefined, (invocation) => runStatus(invocation));
	define("coord-todo", "查看 todo.md 任务看板", undefined, (invocation) => runTodo(invocation));
	define("coord-go", "阶段调度：写 @session 关联并把任务清单派发给本会话", "[sN | T-NNN]", (invocation) => runGo(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-handoff", "读交接卡；/coord-handoff done 消化接管", "[done]", (invocation) => runHandoff(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-issues", "todo.md ↔ git issues：list / sync / close-done [--stage sN] [--dry-run]", "[sync|list|close-done|view N|close N|open N]", (invocation) => runIssues(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-agents", "角色卡池：无参列卡；带任务描述检索（缺口提示建卡）", "[任务描述]", (invocation) => runAgents(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-dispatch", "生成派发矩阵与任务卡并落盘 .ai/dispatch/", "[sN | T-NNN]", (invocation) => runDispatch(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-growth", "自我成长状态：待复核卡 / 记忆分布 / 全局 META", undefined, (invocation) => runGrowth(invocation));
	define("coord-recall", "旧经验检索：ERR / META / 角色记忆", "<现象或关键词>", (invocation) => runRecall(invocation, String(invocation.rawInput ?? "").trim()));
	define("coord-arch", "七层单向依赖检查（src/<layer> 直接 import）", undefined, (invocation) => runArch(invocation));
	define("coord-research", "记录外部方案检索（计划门禁）；格式：/coord-research 主题 | 来源1 来源2", "<主题> | <来源…>", (invocation) => runResearch(invocation, String(invocation.rawInput ?? "").trim()));
}