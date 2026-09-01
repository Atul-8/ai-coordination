/**
 * todo.ts — todo.md 工具 + /todo 命令
 *
 * 重构点 3：todo.md 是唯一任务事实源（pi 哲学："No built-in to-dos. Use a TODO.md file"）。
 * LLM 通过 coord_todo 工具维护；/todo 命令给用户看板。
 * 状态存于 todo.md 文件本身（不存 session details）——项目级持久，天然跨会话。
 */

import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	findCoordDir,
	parseTodo,
	stageStats,
	appendItem,
	updateItem,
	formatItemLine,
	nextItemId,
	shortSessionId,
	saveTodo,
	type TodoFile,
} from "./lib.ts";

const TodoParams = Type.Object({
	action: Type.Union([
		Type.Literal("list"),
		Type.Literal("add"),
		Type.Literal("start"),
		Type.Literal("done"),
		Type.Literal("link"),
		Type.Literal("set_issue"),
	]),
	desc: Type.Optional(Type.String({ description: "add：任务描述" })),
	stage: Type.Optional(Type.String({ description: "add：阶段 id（s1/s2/…，默认 s0）" })),
	id: Type.Optional(Type.String({ description: "start/done/link/set_issue：任务编号 T-NNN" })),
	issue: Type.Optional(Type.Number({ description: "set_issue：issue 编号" })),
});

/** 看板渲染（/todo、/eai-todo、/eai todo 共用） */
export async function runTodo(_args: string, ctx: ExtensionCommandContext): Promise<void> {
	const paths = findCoordDir(ctx.cwd);
	if (!paths) {
		ctx.ui.notify("coordination 未激活：项目根缺少 .ai/ 目录", "warning");
		return;
	}
	ctx.ui.notify(renderList(parseTodo(paths.todoPath)), "info");
}

export function registerTodo(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "coord_todo",
		label: "Todo",
		description:
			"维护项目 todo.md（唯一任务事实源）。action: list 查看全部；add 新建任务(desc, stage 默认 s0)；start/done 标记进行中/完成(id)；link 将当前 pi session 关联到任务(id)；set_issue 写入 issue 编号(id, issue)。",
		promptSnippet: "读取或更新项目 todo.md 任务清单",
		promptGuidelines: [
			"用 coord_todo 维护任务清单；禁止直接用 edit/write 改 todo.md（会与工具写入冲突）。",
			"每完成 /go 派发的一项任务后，立即调用 coord_todo {action:'done', id:'T-NNN'} 标记完成。",
		],
		parameters: TodoParams,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx: ExtensionContext) {
			const paths = findCoordDir(ctx.cwd);
			if (!paths) {
				return {
					content: [
						{
							type: "text",
							text: "coordination 未激活：项目根缺少 .ai/ 目录。先运行 pi-ai-coordination/scripts/init-project.js",
						},
					],
					details: { ok: false },
				};
			}

			const file = parseTodo(paths.todoPath);

			switch (params.action) {
				case "list": {
					return { content: [{ type: "text", text: renderList(file) }], details: { ok: true } };
				}

				case "add": {
					if (!params.desc) throw new Error("add 需要 desc");
					const stage = params.stage ?? "s0";
					if (!file.stages.some((s) => s.id === stage)) {
						throw new Error(
							`未知阶段 ${stage}。现有：${file.stages.map((s) => s.id).join(", ") || "（无）"}。请先在 todo.md「阶段定义」小节登记。`,
						);
					}
					const item = appendItem(file, {
						id: nextItemId(file.items),
						done: false,
						doing: false,
						stage,
						desc: params.desc,
					});
					saveTodo(paths.todoPath, file);
					return {
						content: [{ type: "text", text: `已添加 ${item.id} [stage:${stage}] ${item.desc}` }],
						details: { ok: true, id: item.id },
					};
				}

				case "start":
				case "done": {
					if (!params.id) throw new Error(`${params.action} 需要 id`);
					const item = updateItem(
						file,
						params.id,
						params.action === "done" ? { done: true, doing: false } : { doing: true, done: false },
					);
					if (!item) throw new Error(`未找到任务 ${params.id}`);
					saveTodo(paths.todoPath, file);
					return {
						content: [{ type: "text", text: `${item.id} → ${params.action === "done" ? "完成 ✓" : "进行中 ~"}` }],
						details: { ok: true },
					};
				}

				case "link": {
					if (!params.id) throw new Error("link 需要 id");
					const sid = shortSessionId(ctx.sessionManager.getSessionId());
					const item = updateItem(file, params.id, { session: sid });
					if (!item) throw new Error(`未找到任务 ${params.id}`);
					saveTodo(paths.todoPath, file);
					return {
						content: [
							{
								type: "text",
								text: `${item.id} 已关联 pi session ${sid}（工作状态由 pi 会话树原生承担，不再维护 WORKSTATE.md）`,
							},
						],
						details: { ok: true, session: sid },
					};
				}

				case "set_issue": {
					if (!params.id || params.issue === undefined) throw new Error("set_issue 需要 id 和 issue");
					const item = updateItem(file, params.id, { issue: params.issue });
					if (!item) throw new Error(`未找到任务 ${params.id}`);
					saveTodo(paths.todoPath, file);
					return {
						content: [{ type: "text", text: `${item.id} ↔ issue #${params.issue}` }],
						details: { ok: true },
					};
				}
			}
		},
	});

	pi.registerCommand("todo", {
		description: "查看 todo.md 任务看板（阶段进度）",
		handler: (args, ctx) => runTodo(args, ctx),
	});
}

/** 渲染看板文本（工具与命令共用） */
export function renderList(file: TodoFile): string {
	const out: string[] = [];
	for (const stat of stageStats(file)) {
		const s = stat.stage;
		const title = s ? `${s.id}: ${s.title}` : "(未定义阶段)";
		const plan = s?.plan ? ` → ${s.plan}` : "";
		out.push(`[${s?.id ?? "?"}] ${title} — 待办 ${stat.open} / 进行 ${stat.doing} / 完成 ${stat.done}${plan}`);
	}
	out.push("");
	const open = file.items.filter((t) => !t.done);
	const done = file.items.filter((t) => t.done);
	for (const t of [...open, ...done]) {
		const mark = t.done ? "x" : t.doing ? "~" : " ";
		const meta = [t.issue ? `#${t.issue}` : null, t.session ? `@${t.session}` : null].filter(Boolean).join(" ");
		out.push(`  [${mark}] ${t.id} [${t.stage}] ${t.desc}${meta ? `  (${meta})` : ""}`);
	}
	if (file.items.length === 0) out.push("  （任务清单为空。用 coord_todo {action:'add'} 或 /plan 产出）");
	return out.join("\n");
}
