/**
 * server-core.mjs — coord_todo MCP 工具内核（纯 JSON-RPC 处理，stdio 无关，可单测）
 *
 * 对齐 pi 版 extensions/coordination/todo.ts 的六个 action：
 *   list / add / start / done / link / set_issue
 * 会话来源：zcode 会话 id 经 .mcp.json env 注入（COORD_SESSION_ID），
 * link 动作把它写进任务行 @session: 标记。
 */

import {
	findCoordDir,
	parseTodo,
	stageStats,
	appendItem,
	updateItem,
	nextItemId,
	shortSessionId,
	saveTodo,
} from "./todo-store.mjs";

export const SERVER_INFO = { name: "coord-todo", version: "0.1.0" };

const TOOL = {
	name: "coord_todo",
	description:
		"维护项目 todo.md（唯一任务事实源）。action: list 查看全部；add 新建任务(desc, stage 默认 s0)；" +
		"start/done 标记进行中/完成(id)；link 将当前会话关联到任务(id，session 缺省取当前 zcode 会话)；" +
		"set_issue 写入 issue 编号(id, issue)。禁止用 edit/write 直接改 todo.md 任务行——会与本工具写入冲突。",
	inputSchema: {
		type: "object",
		properties: {
			action: { type: "string", enum: ["list", "add", "start", "done", "link", "set_issue"], description: "操作类型" },
			desc: { type: "string", description: "add：任务描述" },
			stage: { type: "string", description: "add：阶段 id（s1/s2/…，默认 s0）" },
			id: { type: "string", description: "start/done/link/set_issue：任务编号 T-NNN" },
			issue: { type: "number", description: "set_issue：issue 编号" },
			session: { type: "string", description: "link：显式会话短 id（缺省取 COORD_SESSION_ID 环境变量）" },
		},
		required: ["action"],
	},
};

const PROTOCOL_VERSION = "2024-11-05";

/**
 * 创建 JSON-RPC 处理器。
 * @param {object} opts
 * @param {string} opts.cwd          项目定位起点（MCP cwd = CLAUDE_PROJECT_DIR）
 * @param {string} [opts.sessionId]  当前 zcode 会话 id（完整 id，内部截短）
 * @returns {(msg: object) => Promise<object|null>} 请求 → 响应；notification 返回 null
 */
export function createHandler({ cwd, sessionId } = {}) {
	return async function handle(msg) {
		if (!msg || typeof msg !== "object") return null;
		const { id, method, params } = msg;

		// notification：无 id，不回包
		if (id === undefined || id === null) {
			return null;
		}

		try {
			const result = await dispatch(method, params, { cwd, sessionId });
			return { jsonrpc: "2.0", id, result };
		} catch (err) {
			// 工具业务错误 → isError 结果（MCP 约定：工具错误放 result 而非 JSON-RPC error）
			if (err.isToolError) {
				return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: String(err.message) }], isError: true } };
			}
			if (err.isRpcError) {
				return { jsonrpc: "2.0", id, error: { code: err.code, message: err.message } };
			}
			return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `内部错误：${err.message}` }], isError: true } };
		}
	};
}

function rpcError(code, message) {
	const e = new Error(message);
	e.isRpcError = true;
	e.code = code;
	return e;
}

function toolError(message) {
	const e = new Error(message);
	e.isToolError = true;
	return e;
}

async function dispatch(method, params, ctx) {
	switch (method) {
		case "initialize":
			return {
				protocolVersion: PROTOCOL_VERSION,
				capabilities: { tools: {} },
				serverInfo: SERVER_INFO,
			};

		case "ping":
			return {};

		case "tools/list":
			return { tools: [TOOL] };

		case "tools/call": {
			const name = params?.name;
			if (name !== TOOL.name) throw rpcError(-32602, `未知工具：${name}`);
			const args = params?.arguments ?? {};
			const text = await runTool(args, ctx);
			return { content: [{ type: "text", text }] };
		}

		default:
			throw rpcError(-32601, `未知方法：${method}`);
	}
}

// ---------- 工具实现（移植 todo.ts execute） ----------

export async function runTool(args, { cwd, sessionId } = {}) {
	const paths = findCoordDir(cwd ?? process.cwd());
	if (!paths) {
		throw toolError("coordination 未激活：项目根缺少 .ai/ 目录。先运行 ai-coordination 的 scripts/init-project.js（/coord-init）");
	}

	const file = parseTodo(paths.todoPath);
	const action = args.action;

	switch (action) {
		case "list":
			return renderList(file);

		case "add": {
			if (!args.desc) throw toolError("add 需要 desc");
			const stage = args.stage ?? "s0";
			if (!file.stages.some((s) => s.id === stage)) {
				throw toolError(`未知阶段 ${stage}。现有：${file.stages.map((s) => s.id).join(", ") || "（无）"}。请先在 todo.md「阶段定义」小节登记。`);
			}
			const item = appendItem(file, {
				id: nextItemId(file.items),
				done: false,
				doing: false,
				stage,
				desc: args.desc,
			});
			saveTodo(paths.todoPath, file);
			return `已添加 ${item.id} [stage:${stage}] ${item.desc}`;
		}

		case "start":
		case "done": {
			if (!args.id) throw toolError(`${action} 需要 id`);
			const item = updateItem(file, args.id, action === "done" ? { done: true, doing: false } : { doing: true, done: false });
			if (!item) throw toolError(`未找到任务 ${args.id}`);
			saveTodo(paths.todoPath, file);
			return `${item.id} → ${action === "done" ? "完成 ✓" : "进行中 ~"}`;
		}

		case "link": {
			if (!args.id) throw toolError("link 需要 id");
			const sid = shortSessionId(args.session ?? sessionId);
			if (!sid) throw toolError("会话 id 未知（COORD_SESSION_ID 未注入），请显式传 session 参数（8 位以内）");
			const item = updateItem(file, args.id, { session: sid });
			if (!item) throw toolError(`未找到任务 ${args.id}`);
			saveTodo(paths.todoPath, file);
			return `${item.id} 已关联 zcode session ${sid}（工作状态由 zcode 原生会话承担，不再维护 WORKSTATE.md）`;
		}

		case "set_issue": {
			if (!args.id || args.issue === undefined) throw toolError("set_issue 需要 id 和 issue");
			const item = updateItem(file, args.id, { issue: args.issue });
			if (!item) throw toolError(`未找到任务 ${args.id}`);
			saveTodo(paths.todoPath, file);
			return `${item.id} ↔ issue #${args.issue}`;
		}

		default:
			throw toolError(`未知 action：${action}（可用：list/add/start/done/link/set_issue）`);
	}
}

/** 渲染看板文本（与 pi 版 todo.ts renderList 一致） */
export function renderList(file) {
	const out = [];
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
