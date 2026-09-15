/**
 * todo-store.test.mjs — todo.md 数据模型单测（parse/format/append/update/setStagePlan/定位）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	findCoordDir,
	parseTodo,
	formatItemLine,
	nextItemId,
	appendItem,
	updateItem,
	setStagePlan,
	saveTodo,
	shortSessionId,
	stageStats,
	countMetaRules,
} from "../mcp/todo-store.mjs";

function makeProject(todoContent) {
	const root = mkdtempSync(join(tmpdir(), "coord-test-"));
	mkdirSync(join(root, ".ai"), { recursive: true });
	writeFileSync(join(root, "todo.md"), todoContent, "utf-8");
	return root;
}

const SAMPLE = `# TODO

## 阶段定义

- s0: 框架与环境
- s1: 核心功能 <!-- plan:docs/plans/PLAN-001-core.md -->

## 任务

- [ ] T-001 [stage:s1] 实现订单创建 (#12) @session:01a05cc8
- [~] T-002 [stage:s0] 搭建骨架
- [x] T-003 [stage:s1] 类型定义
`;

test("findCoordDir 向上查找 .ai/", () => {
	const root = makeProject(SAMPLE);
	try {
		const deep = join(root, "a", "b", "c");
		mkdirSync(deep, { recursive: true });
		const paths = findCoordDir(deep);
		assert.equal(paths.root, root);
		assert.equal(paths.todoPath, join(root, "todo.md"));
		assert.equal(findCoordDir(tmpdir()), null);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("parseTodo 解析阶段/任务/issue/session 标记", () => {
	const root = makeProject(SAMPLE);
	try {
		const file = parseTodo(join(root, "todo.md"));
		assert.deepEqual(
			file.stages.map((s) => s.id),
			["s0", "s1"],
		);
		assert.equal(file.stages[1].plan, "docs/plans/PLAN-001-core.md");
		assert.equal(file.stages[1].title, "核心功能");
		assert.equal(file.items.length, 3);
		assert.deepEqual(file.items[0], {
			id: "T-001",
			done: false,
			doing: false,
			stage: "s1",
			desc: "实现订单创建",
			issue: 12,
			session: "01a05cc8",
			lineIndex: file.items[0].lineIndex,
		});
		assert.equal(file.items[1].doing, true);
		assert.equal(file.items[2].done, true);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("formatItemLine 规范化行（含可选字段）", () => {
	assert.equal(formatItemLine({ id: "T-009", done: false, doing: true, stage: "s2", desc: "x y" }), "- [~] T-009 [stage:s2] x y");
	assert.equal(
		formatItemLine({ id: "T-009", done: true, doing: false, stage: "s2", desc: "x", issue: 3, session: "ab12cd34" }),
		"- [x] T-009 [stage:s2] x (#3) @session:ab12cd34",
	);
});

test("add → update → save 往返保持行格式", () => {
	const root = makeProject(SAMPLE);
	try {
		const todoPath = join(root, "todo.md");
		const file = parseTodo(todoPath);
		assert.equal(nextItemId(file.items), "T-004");

		appendItem(file, { id: "T-004", done: false, doing: false, stage: "s1", desc: "新任务", issue: 7 });
		updateItem(file, "T-003", { done: false, doing: true });
		const stage = setStagePlan(file, "s0", "docs/plans/PLAN-002-env.md");
		assert.equal(stage.plan, "docs/plans/PLAN-002-env.md");
		saveTodo(todoPath, file);

		const reread = parseTodo(todoPath);
		assert.equal(reread.items.length, 4);
		assert.equal(reread.items[3].id, "T-004");
		assert.equal(reread.items[3].issue, 7);
		assert.equal(reread.items[3].lineIndex, reread.items[0].lineIndex + 3);
		assert.equal(reread.items[2].doing, true);
		assert.equal(reread.items[2].done, false);
		assert.equal(reread.stages[0].plan, "docs/plans/PLAN-002-env.md");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("appendItem 在无任务小节时创建「## 任务」", () => {
	const root = makeProject("# TODO\n\n## 阶段定义\n\n- s0: 初始\n");
	try {
		const todoPath = join(root, "todo.md");
		const file = parseTodo(todoPath);
		appendItem(file, { id: "T-001", done: false, doing: false, stage: "s0", desc: "首任务" });
		saveTodo(todoPath, file);
		const reread = parseTodo(todoPath);
		assert.equal(reread.items.length, 1);
		assert.equal(reread.items[0].desc, "首任务");
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});

test("shortSessionId / stageStats / countMetaRules", () => {
	assert.equal(shortSessionId("01a05cc8-9abc-4def-9012-3456789abcdef0"), "01a05cc8");
	assert.equal(shortSessionId(undefined), undefined);

	const root = makeProject(SAMPLE);
	try {
		const file = parseTodo(join(root, "todo.md"));
		const stats = stageStats(file);
		assert.equal(stats.length, 2);
		const s0 = stats.find((s) => s.stage?.id === "s0");
		assert.deepEqual({ open: s0.open, doing: s0.doing, done: s0.done }, { open: 0, doing: 1, done: 0 });
		const s1 = stats.find((s) => s.stage?.id === "s1");
		assert.deepEqual({ open: s1.open, doing: s1.doing, done: s1.done }, { open: 1, doing: 0, done: 1 });

		writeFileSync(join(root, ".ai", "meta.txt"), "", "utf-8");
		const metaPath = join(root, ".ai", "errors", "distilled", "meta-rules.md");
		mkdirSync(join(root, ".ai", "errors", "distilled"), { recursive: true });
		writeFileSync(metaPath, "### META-001 a\n### META-002 b\n", "utf-8");
		assert.equal(countMetaRules(metaPath), 2);
	} finally {
		rmSync(root, { recursive: true, force: true });
	}
});
