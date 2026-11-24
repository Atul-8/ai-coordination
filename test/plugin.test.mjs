import test from "node:test";
import assert from "node:assert/strict";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../index.js";

const SESSION = "session-aaaabbbb-cccc-dddd";

function makeHarness() {
	const tools = new Map();
	const commands = new Map();
	const skills = [];
	const cwd = { value: process.cwd() };
	const ctx = {
		tools: { register: (definition) => { tools.set(definition.name, definition); return () => {}; } },
		commands: { register: (definition) => { commands.set(definition.name, definition); return () => {}; } },
		get: (name) => {
			if (name === "skills") return { register: (skill) => { skills.push(skill); return () => {}; } };
			if (name === "workingDirectory") return { ensure: async () => cwd.value };
			return undefined;
		},
	};
	apply(ctx);
	const call = async (name, args) => {
		const definition = tools.get(name);
		assert.ok(definition, `unknown tool ${name}`);
		return definition.execute(args, { agent: { id: SESSION }, signal: new AbortController().signal });
	};
	return { tools, commands, skills, call, cwd };
}

test("插件注册 8 工具 / 7 命令 / 3 技能", async () => {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-agi-reg-"));
	process.env.AI_GLOBAL_DIR = path.join(dir, "global");
	try {
		const { tools, commands, skills } = makeHarness();
		assert.deepEqual([...tools.keys()].sort(), [
			"coord_error",
			"coord_handoff",
			"coord_init",
			"coord_issue",
			"coord_meta",
			"coord_plan_save",
			"coord_status",
			"coord_todo",
		]);
		assert.deepEqual([...commands.keys()].sort(), [
			"coord",
			"coord-go",
			"coord-handoff",
			"coord-init",
			"coord-issues",
			"coord-status",
			"coord-todo",
		]);
		assert.deepEqual(skills.map((skill) => skill.name).sort(), ["agi-coordination", "agi-dispatch", "agi-handoff"]);
	} finally {
		await fsp.rm(dir, { recursive: true, force: true });
	}
});

test("端到端：初始化 → 任务 → 计划 → 状态 → 交接 → 错误/META", async () => {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-agi-e2e-"));
	const project = path.join(dir, "proj");
	await fsp.mkdir(project, { recursive: true });
	process.env.AI_GLOBAL_DIR = path.join(dir, "global");
	try {
		const { commands, call, cwd } = makeHarness();
		cwd.value = project;

		// init
		const init = await call("coord_init", { root: project });
		assert.equal(init.ok, true);
		assert.match(init.text, /coordination 已就绪/);
		for (const rel of ["AGENTS.md", "todo.md", ".ai/STRUCTURE.md", ".ai/errors/distilled/meta-rules.md", ".ai/scripts/issues.js", "docs/plans"]) {
			await fsp.access(path.join(project, rel));
		}
		assert.match(await fsp.readFile(path.join(project, "AGENTS.md"), "utf8"), /dsh-ai-coordination:agents:v1 BEGIN/);

		// 幂等
		const again = await call("coord_init", { root: project });
		assert.match(again.text, /跳过/);

		// todo
		const list = await call("coord_todo", { action: "list", root: project });
		assert.match(list.text, /任务清单为空/);
		const add = await call("coord_todo", { action: "add", desc: "实现解析器", stage: "s0", root: project });
		assert.equal(add.id, "T-001");
		const added = await call("coord_todo", { action: "add", desc: "实现渲染器", stage: "s0", root: project });
		assert.equal(added.id, "T-002");
		await call("coord_todo", { action: "start", id: "T-001", root: project });
		await call("coord_todo", { action: "done", id: "T-001", root: project });
		const linked = await call("coord_todo", { action: "link", id: "T-002", root: project });
		assert.match(linked.text, /aaaabbbb/);

		// 阶段登记 + 计划落盘
		await call("coord_todo", { action: "stage_add", id: "s1", title: "核心实现", root: project });
		const plan = await call("coord_plan_save", {
			stage: "s1",
			steps: ["写解析器", "写渲染器"],
			notes: "验收：node --test",
			root: project,
		});
		assert.equal(plan.ok, true);
		assert.match(plan.plan, /^docs\/plans\/PLAN-001-/);
		assert.deepEqual(plan.added, ["T-003", "T-004"]);
		const planText = await fsp.readFile(path.join(project, plan.plan), "utf8");
		assert.match(planText, /PLAN-001/);
		assert.match(planText, /1\. 写解析器/);
		const todoText = await fsp.readFile(path.join(project, "todo.md"), "utf8");
		assert.match(todoText, /- s1: 核心实现 <!-- plan:docs\/plans\/PLAN-001-/);

		// 状态
		const status = await call("coord_status", { root: project });
		assert.match(status.text, /任务/);
		assert.match(status.text, /META/);
		assert.match(status.text, /PLAN-001/);

		// 交接
		const handoff = await call("coord_handoff", {
			action: "write",
			task: "T-003",
			done: "解析器骨架",
			doing: "渲染器未开始",
			blockers: "无",
			next: "实现渲染器并跑 node --test",
			verify: "node --test 全绿",
			root: project,
		});
		assert.match(handoff.text, /交接卡已写入/);
		const card = await fsp.readFile(path.join(project, ".ai", "HANDOFF.md"), "utf8");
		assert.match(card, /- 状态: open/);
		assert.match(card, /- 下一步: 实现渲染器/);

		const read = await call("coord_handoff", { action: "read", root: project });
		assert.match(read.text, /状态: open/);

		const consumed = await call("coord_handoff", { action: "consume", root: project });
		assert.equal(consumed.status, "resumed");
		const card2 = await fsp.readFile(path.join(project, ".ai", "HANDOFF.md"), "utf8");
		assert.match(card2, /- 状态: resumed/);
		assert.match(card2, /dsh\/aaaabbbb/);
		assert.match(await fsp.readFile(path.join(project, "todo.md"), "utf8"), /T-003 .*@session:aaaabbbb/);

		// G3 + META
		const err = await call("coord_error", {
			symptom: "node --test 失败：断言不匹配",
			root_cause: "测试期望值写错",
			fix: "修正期望值",
			prevention: "先写红测试再实现",
			meta_category: "TEST",
			meta_rule: "新增测试先确认失败信息再写实现",
			evidence: "AssertionError: 1 !== 2",
			root: project,
		});
		assert.equal(err.err, "ERR-001");
		assert.equal(err.meta, "META-001");
		const errText = await fsp.readFile(path.join(project, ".ai", "errors", "raw", "ERR-001.md"), "utf8");
		assert.match(errText, /## 2\. 根因/);
		const metaText = await fsp.readFile(path.join(project, ".ai", "errors", "distilled", "meta-rules.md"), "utf8");
		assert.match(metaText, /### META-001 \[TEST\]/);

		const metaList = await call("coord_meta", { action: "list", root: project });
		assert.match(metaList.text, /META-001/);

		// issue 无 remote 时报错而不是伪造
		await assert.rejects(call("coord_issue", { action: "list", root: project }), /git remote origin/);

		// 命令：/coord-status 与 /coord-go 空参
		const statusCommand = await commands.get("coord-status").handler({ rawInput: "", agent: { id: SESSION }, signal: new AbortController().signal });
		assert.equal(statusCommand.kind, "success");
		assert.match(statusCommand.text, /项目/);
		const goCommand = await commands.get("coord-go").handler({ rawInput: "", agent: { id: SESSION }, signal: new AbortController().signal });
		assert.match(goCommand.text, /可选阶段/);
	} finally {
		await fsp.rm(dir, { recursive: true, force: true });
		delete process.env.AI_GLOBAL_DIR;
	}
});