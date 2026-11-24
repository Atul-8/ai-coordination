import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../src/lib.js";

const SAMPLE = `# TODO — 任务清单

## 阶段定义

- s0: 框架与环境
- s1: 核心实现 <!-- plan:docs/plans/PLAN-001-core.md -->

## 任务

- [ ] T-001 [stage:s1] 写解析器 (#12) @session:01a05cc8
- [~] T-002 [stage:s1] 写渲染器
- [x] T-003 [stage:s0] 初始化
`;

test("parseTodo 解析阶段、任务、issue、session", () => {
	const file = L.parseTodo(SAMPLE);
	assert.equal(file.stages.length, 2);
	assert.deepEqual(file.stages[1], { id: "s1", title: "核心实现", plan: "docs/plans/PLAN-001-core.md", lineIndex: 5 });
	assert.equal(file.items.length, 3);
	const first = file.items[0];
	assert.equal(first.id, "T-001");
	assert.equal(first.stage, "s1");
	assert.equal(first.desc, "写解析器");
	assert.equal(first.issue, 12);
	assert.equal(first.session, "01a05cc8");
	assert.equal(file.items[1].doing, true);
	assert.equal(file.items[2].done, true);
	assert.ok(file.taskSectionStart > 0);
});

test("appendItem / updateItem / setStagePlan 往返序列化", () => {
	const file = L.parseTodo(SAMPLE);
	const id = L.nextItemId(file.items);
	assert.equal(id, "T-004");
	const added = L.appendItem(file, { id, done: false, doing: false, stage: "s1", desc: "新任务" });
	assert.equal(added.lineIndex >= 0, true);
	L.updateItem(file, id, { doing: true });
	L.updateItem(file, "T-001", { issue: 99, session: "deadbeef" });
	L.setStagePlan(file, "s0", "docs/plans/PLAN-002-x.md");
	const text = L.serializeTodo(file);
	const reparsed = L.parseTodo(text);
	const item = reparsed.items.find((candidate) => candidate.id === "T-004");
	assert.equal(item.doing, true);
	const first = reparsed.items.find((candidate) => candidate.id === "T-001");
	assert.equal(first.issue, 99);
	assert.equal(first.session, "deadbeef");
	assert.equal(reparsed.stages.find((stage) => stage.id === "s0").plan, "docs/plans/PLAN-002-x.md");
});

test("stageStats 与 renderBoard", () => {
	const file = L.parseTodo(SAMPLE);
	const stats = L.stageStats(file);
	const s1 = stats.find((stat) => stat.stage?.id === "s1");
	assert.deepEqual({ open: s1.open, doing: s1.doing, done: s1.done }, { open: 1, doing: 1, done: 0 });
	const board = L.renderBoard(file);
	assert.match(board, /\[s1\] s1: 核心实现/);
	assert.match(board, /T-001/);
});

test("编号与命名工具", () => {
	assert.equal(L.nextPlanNo(["PLAN-001-a.md", "PLAN-007-b.md", "x.md"]), 8);
	assert.equal(L.nextErrNo(["ERR-001.md", "ERR-010.md"]), 11);
	assert.equal(L.countMetaRules("### META-001 a\n### META-002 b\n"), 2);
	assert.equal(L.lastMetaNo("### META-0007 x\n### META-0012 y"), 12);
	assert.equal(L.shortSessionId("session-d99b3363-11a0-44a0"), "d99b3363");
	assert.equal(L.slugify("实现 解析器/渲染"), "实现-解析器-渲染");
});

test("buildPlanDoc / extractSteps", () => {
	const doc = L.buildPlanDoc({
		planNo: 3,
		stageId: "s1",
		stageTitle: "核心",
		steps: ["第一步", "第二步"],
		notes: "验收：跑测试",
		sessionId: "session-abc",
		date: "2026-01-01",
	});
	assert.match(doc, /^# PLAN-003 核心/m);
	assert.match(doc, /1\. 第一步/);
	assert.match(doc, /验收：跑测试/);
	assert.deepEqual(L.extractSteps("说明\n1. 解析\n2) 渲染\n3、提交"), ["解析", "渲染", "提交"]);
	assert.deepEqual(L.extractSteps("- 甲\n- 乙"), ["甲", "乙"]);
});

test("applyAgentsBlock 幂等与跨宿主升级", () => {
	const block = "# 规范\n内容";
	const created = L.applyAgentsBlock(null, block);
	assert.equal(created.action, "created");
	assert.match(created.content, /dsh-ai-coordination:agents:v1 BEGIN/);

	const same = L.applyAgentsBlock(created.content, block);
	assert.equal(same.action, "updated");
	assert.equal(same.content, created.content);

	const foreign = `# 用户内容\n\n${L.AGENTS_MARKERS.pi.begin}\n旧规范\n${L.AGENTS_MARKERS.pi.end}\n\n尾部\n`;
	const upgraded = L.applyAgentsBlock(foreign, block);
	assert.equal(upgraded.action, "upgraded-pi");
	assert.ok(!upgraded.content.includes(L.AGENTS_MARKERS.pi.begin));
	assert.match(upgraded.content, /用户内容/);
	assert.match(upgraded.content, /尾部/);

	const merged = L.applyAgentsBlock("# 用户内容\n", block);
	assert.equal(merged.action, "merged");
	assert.match(merged.content, /# 用户内容/);
});

test("交接卡构建与解析", () => {
	const card = L.buildHandoffCard({
		task: "T-003",
		from: "dsh/abcdef12",
		done: "已完成 X\n证据：commit abc",
		doing: "改到一半",
		blockers: "试过 Y 不行",
		next: "运行 npm test",
		verify: "npm test 全绿",
		time: "2026-01-01 00:00",
	});
	const parsed = L.parseHandoff(card);
	assert.equal(parsed.status, "open");
	assert.equal(parsed.task, "T-003");
	assert.equal(parsed.next, "运行 npm test");
	assert.match(parsed.from, /dsh\/abcdef12/);
});

test("parseRemoteUrl 识别 github / gitee", () => {
	assert.deepEqual(L.parseRemoteUrl("https://github.com/o/r.git"), { host: "github", owner: "o", repo: "r", url: "https://github.com/o/r.git" });
	assert.equal(L.parseRemoteUrl("git@gitee.com:team/proj.git").host, "gitee");
	assert.equal(L.parseRemoteUrl("ssh://git@github.com/o/r.git").repo, "r");
	assert.throws(() => L.parseRemoteUrl("https://gitlab.com/o/r.git"), /仅支持/);
	assert.throws(() => L.parseRemoteUrl("not a url"), /无法从 remote 解析/);
});

test("isInside 边界", () => {
	assert.equal(L.isInside("C:\\work\\proj", "C:\\work\\proj\\a.md"), true);
	assert.equal(L.isInside("C:\\work\\proj", "C:\\work\\proj-other\\a.md"), false);
	assert.equal(L.isInside("C:\\Work\\Proj", "c:\\work\\proj\\a.md"), true);
});