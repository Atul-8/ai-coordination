/**
 * go.ts — /go 阶段性调度命令（重构点 4）
 *
 * 用法：
 *   /go          交互式：选择阶段 → 确认任务清单 → 派发执行
 *   /go s1       直接调度阶段 s1
 *   /go T-003    只调度单个任务
 *
 * 派发即关联：被调度的任务自动写入当前 pi session 前 8 位（@session:xxxx），
 * 会话上下文、中断恢复、分支历史全部由 pi 会话树承担——不再需要 WORKSTATE.md。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	findCoordDir,
	globalAgentsDir,
	parseTodo,
	readAgentRegistry,
	readWorkflowPrefix,
	updateItem,
	saveTodo,
	shortSessionId,
	type TodoItem,
} from "./lib.ts";

export function registerGo(pi: ExtensionAPI): void {
	pi.registerCommand("go", {
		description: "阶段性调度：选择阶段/任务 → 确认 → 派发执行（关联当前 session）",
		getArgumentCompletions: (prefix: string) => {
			try {
				const paths = findCoordDir(process.cwd());
				if (!paths) return null;
				const todo = parseTodo(paths.todoPath);
				const lower = prefix.toLowerCase();
				const items = [
					...todo.stages.map((s) => ({ value: s.id, label: s.id, description: s.title })),
					...todo.items
						.filter((t) => !t.done)
						.map((t) => ({ value: t.id, label: t.id, description: t.desc.slice(0, 40) })),
				].filter((i) => i.value.toLowerCase().startsWith(lower));
				return items.length > 0 ? items : null;
			} catch {
				return null;
			}
		},
		handler: (args, ctx) => runGo(pi, args, ctx),
	});
}

/** 阶段调度实现（/go、/eai-go、/eai go 共用） */
export async function runGo(pi: ExtensionAPI, args: string, ctx: ExtensionCommandContext): Promise<void> {
	const paths = findCoordDir(ctx.cwd);
	if (!paths) {
		ctx.ui.notify("coordination 未激活：项目根缺少 .ai/ 目录。先运行 init-project.js", "warning");
		return;
	}

	const file = parseTodo(paths.todoPath);
	if (file.items.length === 0) {
		ctx.ui.notify("todo.md 无任务。先用 /plan 产出计划（自动登记），或 coord_todo add 添加。", "warning");
		return;
	}

	const arg = args.trim();
	let picked: TodoItem[] = [];
	let stageTitle = "";

	if (/^T-\d+$/i.test(arg)) {
		// 单任务调度
		const item = file.items.find((t) => t.id.toLowerCase() === arg.toLowerCase());
		if (!item) {
			ctx.ui.notify(`未找到任务 ${arg}`, "error");
			return;
		}
		picked = [item];
		stageTitle = `单任务 ${item.id}`;
	} else if (/^s\d+$/.test(arg)) {
		const stat = file.stages.find((s) => s.id === arg);
		if (!stat) {
			ctx.ui.notify(`未定义阶段 ${arg}。先在 todo.md「阶段定义」登记。`, "error");
			return;
		}
		picked = file.items.filter((t) => t.stage === arg && !t.done);
		stageTitle = `${stat.id}: ${stat.title}`;
	} else if (arg) {
		ctx.ui.notify(`参数无法识别：${arg}。用法 /go [sN | T-NNN]`, "warning");
		return;
	} else {
		// 交互式选阶段
		const options = file.stages.map((s) => {
			const open = file.items.filter((t) => t.stage === s.id && !t.done).length;
			return `${s.id} — ${s.title}（待办 ${open}）`;
		});
		options.push("全部 — 所有未完成任务");
		const pickedStr = await ctx.ui.select("调度目标：", options);
		if (!pickedStr) return;
		if (pickedStr.startsWith("全部")) {
			picked = file.items.filter((t) => !t.done);
			stageTitle = "全部未完成任务";
		} else {
			const stageId = pickedStr.split(" — ")[0];
			const stat = file.stages.find((s) => s.id === stageId);
			picked = file.items.filter((t) => t.stage === stageId && !t.done);
			stageTitle = `${stageId}: ${stat?.title ?? ""}`;
		}
	}

	picked = picked.filter((t) => !t.done);
	if (picked.length === 0) {
		ctx.ui.notify("所选范围内没有待办任务。", "info");
		return;
	}

	// 确认清单（G2 交互门控）
	const listText = picked.map((t) => `  ${t.id}  ${t.desc}${t.issue ? `  (#${t.issue})` : ""}`).join("\n");
	const ok = await ctx.ui.confirm(
		`调度 ${stageTitle}`,
		`将按顺序执行 ${picked.length} 项任务（每完成一项 coord_todo done 归档）：\n\n${listText}`,
	);
	if (!ok) return;

	// session 关联写入 todo.md
	const sid = shortSessionId(ctx.sessionManager.getSessionId());
	for (const t of picked) {
		updateItem(file, t.id, { session: sid, doing: t.doing || false });
	}
	saveTodo(paths.todoPath, file);

	// 派发
	const stage = file.stages.find((s) => s.id === picked[0].stage);
	const planLine = stage?.plan ? `阶段计划：${stage.plan}\n` : "";
	const lines = picked.map((t, i) => {
		const issue = t.issue ? `（详情：\`.ai/scripts/issues.js view ${t.issue}\` 或 #${t.issue}）` : "";
		return `${i + 1}. **${t.id}** ${t.desc}${issue}`;
	});
	const subRoles = readAgentRegistry().filter((r) => r.host === "subagent");
	const prefix = readWorkflowPrefix();
	const rolesLine =
		subRoles.length > 0
			? `- 多 agent 接入本阶段时，常驻 PM 用 subagent 按角色动态派发（注册表 ${globalAgentsDir()}）：${subRoles
					.map((r) => `${r.name}=${r.title}`)
					.join(" / ")}。workflow key 固定前缀 \`${prefix}:${picked[0].stage}:<T-NNN>\`，\n  阶段=lane（无依赖可并行）、任务=lane 内 writer→reviewer 串行；把角色卡 + 任务描述组成 task。`
			: `- 任务粒度大时用 subagent 派发（writer 执行 → reviewer 复核），workflow key 固定前缀 \`${prefix}:${picked[0].stage}:<T-NNN>\`。`;

	pi.sendUserMessage(
		[
			`[/go 阶段调度] ${stageTitle}`,
			`当前会话：${sid ?? "unknown"}（已写入 todo.md @session 关联）`,
			planLine,
			`按顺序执行以下 ${picked.length} 项任务：`,
			...lines,
			"",
			"纪律：",
			"- 每完成一项，立即 coord_todo {action:'done', id:'T-NNN'}，再开始下一项。",
			"- 写操作后 G2 同步：更新 .ai/STRUCTURE.md / 需求文档 / 层测试。",
			"- 出错自动走 G3 五步法（记录 .ai/errors/raw/ERR-NNN.md）。",
			rolesLine,
			"- 全部完成后：运行 `node .ai/scripts/issues.js close-done` 关闭已完成 issue，并输出阶段总结。",
		].join("\n"),
	);
}
