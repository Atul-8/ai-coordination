/**
 * init-project.test.mjs — 项目初始化 + 跨工具迁移测试（子进程驱动）
 *
 * 覆盖：全新初始化 / pi 版项目旧标记原位升级（数据无缝衔接）/ 幂等重跑
 */

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "..", "scripts", "init-project.js");
const NEW_BEGIN = "<!-- ai-coordination:agents:v1 BEGIN -->";
const OLD_BEGIN = "<!-- pi-ai-coordination:agents:v1 BEGIN -->";
const OLD_END = "<!-- pi-ai-coordination:agents:v1 END -->";

function runInit(root) {
	const stdout = execFileSync(process.execPath, [SCRIPT, root], { encoding: "utf-8" });
	return JSON.parse(stdout);
}

test("全新项目：部署 AGENTS.md / todo.md / .ai 全套，且 todo 模板行可被 coord_todo 数据模型解析", async () => {
	const root = mkdtempSync(join(tmpdir(), "coord-init-"));
	try {
		const out = runInit(root);
		assert.equal(out.ok, true);
		assert.ok(out.project.created.includes("AGENTS.md"));
		assert.ok(existsSync(join(root, "todo.md")));
		assert.ok(existsSync(join(root, ".ai", "STRUCTURE.md")));
		assert.ok(existsSync(join(root, ".ai", "scripts", "issues.js")));
		assert.ok(existsSync(join(root, ".ai", "errors", "distilled", "meta-rules.md")));
		assert.ok(readFileSync(join(root, "AGENTS.md"), "utf-8").includes(NEW_BEGIN));

		// 跨工具衔接：pi 版写出的任务行（同一条规范格式）必须能被本版解析
		const { parseTodo } = await import("../mcp/todo-store.mjs");
		writeFileSync(
			join(root, "todo.md"),
			"# TODO\n\n## 阶段定义\n\n- s1: 核心功能 <!-- plan:docs/plans/PLAN-001-x.md -->\n\n## 任务\n\n- [ ] T-001 [stage:s1] pi 版建的任务 (#12) @session:01a05cc8\n",
			"utf-8",
		);
		const file = parseTodo(join(root, "todo.md"));
		assert.equal(file.items[0].issue, 12);
		assert.equal(file.items[0].session, "01a05cc8");
		assert.equal(file.stages[0].plan, "docs/plans/PLAN-001-x.md");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("pi 版老项目：旧插桩原位升级，块外用户内容保留，不叠层", async () => {
	const root = mkdtempSync(join(tmpdir(), "coord-mig-"));
	try {
		const userContent = "# 我的项目规范\n\n- 自有规则 A\n- 自有规则 B\n";
		writeFileSync(
			join(root, "AGENTS.md"),
			`${OLD_BEGIN}\n（pi 版旧规范内容）\n${OLD_END}\n\n${userContent}`,
			"utf-8",
		);
		const out = runInit(root);
		assert.ok(out.project.created.some((c) => c.includes("原位升级")));

		const text = readFileSync(join(root, "AGENTS.md"), "utf-8");
		assert.ok(text.includes(NEW_BEGIN), "含新标记");
		assert.ok(!text.includes("pi-ai-coordination:agents:v1"), "旧标记已清除");
		assert.ok(text.includes("自有规则 A"), "用户内容保留");
		assert.equal(text.split(NEW_BEGIN).length - 1, 1, "只有一个新插桩块");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("幂等：重复 init 跳过已存在文件，不覆盖", () => {
	const root = mkdtempSync(join(tmpdir(), "coord-idem-"));
	try {
		runInit(root);
		const agentsBefore = readFileSync(join(root, "AGENTS.md"), "utf-8");
		const out = runInit(root);
		assert.ok(out.project.skipped.some((s) => s.includes("已含 coordination 插桩")));
		assert.equal(readFileSync(join(root, "AGENTS.md"), "utf-8"), agentsBefore);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
