/**
 * session-start.test.mjs — G1 hook 脚本集成测试（子进程驱动，验证 stdout JSON 协议）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "..", "hooks", "scripts", "session-start.mjs");

function makeProject(todoContent) {
	const root = mkdtempSync(join(tmpdir(), "coord-hook-"));
	mkdirSync(join(root, ".ai"), { recursive: true });
	writeFileSync(join(root, "todo.md"), todoContent, "utf-8");
	return root;
}

const SAMPLE = `# TODO

## 阶段定义

- s0: 框架与环境
- s1: 核心功能

## 任务

- [ ] T-001 [stage:s1] 实现核心
- [~] T-002 [stage:s0] 搭建骨架 @session:01a05cc8
`;

function runHook(cwd, sessionId) {
	const stdout = execFileSync(
		process.execPath,
		[HOOK],
		{
			encoding: "utf-8",
			input: JSON.stringify({ session_id: sessionId ?? "fallback-sess-0000", hook_event_name: "SessionStart" }),
			env: { ...process.env, CLAUDE_PROJECT_DIR: cwd, ...(sessionId ? { CLAUDE_SESSION_ID: sessionId } : {}) },
		},
	);
	return stdout.trim();
}

test("激活项目 → 注入 G1 上下文（进度/进行中/META/建议）", () => {
	const root = makeProject(SAMPLE);
	try {
		const out = runHook(root, "01a05cc8-9abc-4def-9012");
		const parsed = JSON.parse(out);
		assert.deepEqual(Object.keys(parsed), ["additionalContext"]);
		const ctx = parsed.additionalContext;
		assert.match(ctx, /G1 开门/);
		assert.match(ctx, /session 01a05cc8/);
		assert.match(ctx, /s1 0\/1/);
		assert.match(ctx, /进行中：T-002/);
		assert.match(ctx, /\/go/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("未激活项目 → 静默（空输出，exit 0）", () => {
	const empty = mkdtempSync(join(tmpdir(), "coord-hook-empty-"));
	try {
		const out = runHook(empty, "sess-1");
		assert.equal(out, "");
	} finally {
		rmSync(empty, { recursive: true, force: true });
	}
});

test("无 CLAUDE_SESSION_ID 时回退 stdin session_id", () => {
	const root = makeProject(SAMPLE);
	try {
		const out = execFileSync(process.execPath, [HOOK], {
			encoding: "utf-8",
			input: JSON.stringify({ session_id: "abcdef12-3333", hook_event_name: "SessionStart" }),
			env: { ...process.env, CLAUDE_PROJECT_DIR: root, CLAUDE_SESSION_ID: "" },
		});
		const parsed = JSON.parse(out.trim());
		assert.match(parsed.additionalContext, /session abcdef12/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

const HANDOFF_CARD = (status, from) => `# HANDOFF — 跨宿主交接卡

- 状态: ${status}
- 交出方: ${from}
- 任务: T-001 [stage:s1] 实现核心
- 已完成: 骨架已提交（abc1234）
- 进行中: src/core/order.ts 半成品
- 卡点/死路: 无
- 下一步: 补齐 order.ts 校验逻辑
- 验证: npm test → 5 passed
`;

test("交接卡 open → G1 注入接力提示（读卡→验证→续作→done 消化）", () => {
	const root = makeProject(SAMPLE);
	try {
		mkdirSync(join(root, ".ai"), { recursive: true });
		writeFileSync(join(root, ".ai", "HANDOFF.md"), HANDOFF_CARD("open", "zcode session abcd1234 · 2026-10-24"), "utf-8");
		const parsed = JSON.parse(runHook(root, "01a05cc8-9abc-4def-9012"));
		assert.match(parsed.additionalContext, /未消化交接卡/);
		assert.match(parsed.additionalContext, /来自 zcode session abcd1234/);
		assert.match(parsed.additionalContext, /T-001 \[stage:s1\]/);
		assert.match(parsed.additionalContext, /\/handoff done/);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("交接卡 resumed（已消化）→ 不提示", () => {
	const root = makeProject(SAMPLE);
	try {
		mkdirSync(join(root, ".ai"), { recursive: true });
		writeFileSync(join(root, ".ai", "HANDOFF.md"), HANDOFF_CARD("resumed", "pi session 1234abcd · 2026-10-25"), "utf-8");
		const parsed = JSON.parse(runHook(root, "01a05cc8-9abc-4def-9012"));
		assert.ok(!parsed.additionalContext.includes("交接卡"), "resumed 卡不应注入接力提示");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
