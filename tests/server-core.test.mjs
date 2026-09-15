/**
 * server-core.test.mjs — coord_todo MCP JSON-RPC 内核单测
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler, renderList } from "../mcp/server-core.mjs";

function makeProject() {
	const root = mkdtempSync(join(tmpdir(), "coord-rpc-"));
	mkdirSync(join(root, ".ai"), { recursive: true });
	writeFileSync(
		join(root, "todo.md"),
		"# TODO\n\n## 阶段定义\n\n- s0: 框架与环境\n- s1: 核心功能\n\n## 任务\n",
		"utf-8",
	);
	return root;
}

function rpc(id, method, params) {
	return { jsonrpc: "2.0", id, method, params };
}

test("initialize / tools/list 握手", async () => {
	const root = makeProject();
	try {
		const handle = createHandler({ cwd: root, sessionId: "01a05cc8-aaaa" });

		const init = await handle(rpc(1, "initialize", {}));
		assert.equal(init.result.protocolVersion, "2024-11-05");
		assert.equal(init.result.serverInfo.name, "coord-todo");
		assert.ok(init.result.capabilities.tools);

		const list = await handle(rpc(2, "tools/list", {}));
		assert.equal(list.result.tools.length, 1);
		assert.equal(list.result.tools[0].name, "coord_todo");
		assert.equal(list.result.tools[0].inputSchema.required[0], "action");

		const ping = await handle(rpc(3, "ping", {}));
		assert.deepEqual(ping.result, {});
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("notification（无 id）不回包", async () => {
	const handle = createHandler({ cwd: process.cwd() });
	assert.equal(await handle(rpc(undefined, "notifications/initialized", {})), null);
});

test("add → list → start → link → done 全链路写 todo.md", async () => {
	const root = makeProject();
	try {
		const handle = createHandler({ cwd: root, sessionId: "01a05cc8-9abc-4def" });

		const add = await handle(rpc(1, "tools/call", { name: "coord_todo", arguments: { action: "add", desc: "实现核心", stage: "s1" } }));
		assert.equal(add.result.isError, undefined);
		assert.match(add.result.content[0].text, /已添加 T-001 \[stage:s1\] 实现核心/);

		const start = await handle(rpc(2, "tools/call", { name: "coord_todo", arguments: { action: "start", id: "T-001" } }));
		assert.match(start.result.content[0].text, /进行中/);

		const link = await handle(rpc(3, "tools/call", { name: "coord_todo", arguments: { action: "link", id: "T-001" } }));
		assert.match(link.result.content[0].text, /已关联 zcode session 01a05cc8/);

		const setIssue = await handle(rpc(4, "tools/call", { name: "coord_todo", arguments: { action: "set_issue", id: "T-001", issue: 42 } }));
		assert.match(setIssue.result.content[0].text, /#42/);

		const done = await handle(rpc(5, "tools/call", { name: "coord_todo", arguments: { action: "done", id: "T-001" } }));
		assert.match(done.result.content[0].text, /完成/);

		const listed = await handle(rpc(6, "tools/call", { name: "coord_todo", arguments: { action: "list" } }));
		assert.match(listed.result.content[0].text, /\[x\] T-001 \[s1\] 实现核心\s+\(#42 @01a05cc8\)/);

		// 落盘文件本身包含规范行格式
		const raw = readFileSync(join(root, "todo.md"), "utf-8");
		assert.match(raw, /- \[x\] T-001 \[stage:s1\] 实现核心 \(#42\) @session:01a05cc8/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("业务错误 → isError 结果（未知阶段 / 未找到任务）", async () => {
	const root = makeProject();
	try {
		const handle = createHandler({ cwd: root, sessionId: "sess" });

		const badStage = await handle(rpc(1, "tools/call", { name: "coord_todo", arguments: { action: "add", desc: "x", stage: "s9" } }));
		assert.equal(badStage.result.isError, true);
		assert.match(badStage.result.content[0].text, /未知阶段 s9/);

		const badId = await handle(rpc(2, "tools/call", { name: "coord_todo", arguments: { action: "done", id: "T-099" } }));
		assert.equal(badId.result.isError, true);
		assert.match(badId.result.content[0].text, /未找到任务 T-099/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("未知工具 → JSON-RPC error；未知方法 → -32601", async () => {
	const root = makeProject();
	try {
		const handle = createHandler({ cwd: root });

		const badTool = await handle(rpc(1, "tools/call", { name: "other", arguments: {} }));
		assert.equal(badTool.error.code, -32602);

		const badMethod = await handle(rpc(2, "no/such", {}));
		assert.equal(badMethod.error.code, -32601);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("未激活项目 → 工具报「未激活」", async () => {
	const empty = mkdtempSync(join(tmpdir(), "coord-empty-"));
	try {
		const handle = createHandler({ cwd: empty });
		const res = await handle(rpc(1, "tools/call", { name: "coord_todo", arguments: { action: "list" } }));
		assert.equal(res.result.isError, true);
		assert.match(res.result.content[0].text, /未激活/);
	} finally {
		rmSync(empty, { recursive: true, force: true });
	}
});
