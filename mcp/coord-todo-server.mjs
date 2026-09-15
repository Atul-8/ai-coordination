#!/usr/bin/env node
/**
 * coord-todo-server.mjs — coord_todo MCP stdio server 入口（零依赖，Node ≥18）
 *
 * 由插件 .mcp.json 注册；zcode 在会话内自动信任并连接插件 MCP server。
 * 环境变量（.mcp.json 模板注入）：
 *   COORD_PROJECT_DIR = ${CLAUDE_PROJECT_DIR}  项目定位起点
 *   COORD_SESSION_ID  = ${CLAUDE_SESSION_ID}   当前会话 id（link 动作写 @session: 标记）
 *
 * 协议：MCP stdio（newline-delimited JSON-RPC 2.0）。日志一律走 stderr。
 */

import { createInterface } from "node:readline";
import { createHandler } from "./server-core.mjs";

const cwd = process.env.COORD_PROJECT_DIR || process.cwd();
const sessionId = process.env.COORD_SESSION_ID || undefined;
const handle = createHandler({ cwd, sessionId });

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
	const trimmed = line.trim();
	if (!trimmed) return;
	let msg;
	try {
		msg = JSON.parse(trimmed);
	} catch {
		process.stderr.write(`[coord-todo] 忽略非法 JSON 行：${trimmed.slice(0, 80)}\n`);
		return;
	}
	Promise.resolve(handle(msg))
		.then((resp) => {
			if (resp !== null) process.stdout.write(JSON.stringify(resp) + "\n");
		})
		.catch((err) => {
			process.stderr.write(`[coord-todo] 处理失败：${err?.stack || err}\n`);
		});
});

rl.on("close", () => {
	process.exit(0);
});
