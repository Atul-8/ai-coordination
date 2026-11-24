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

test("插件注册 13 工具 / 13 命令 / 4 技能", async () => {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-eai-reg-"));
	process.env.AI_GLOBAL_DIR = path.join(dir, "global");
	try {
		const { tools, commands, skills } = makeHarness();
		assert.deepEqual([...tools.keys()].sort(), [
			"eai_agent",
			"eai_arch",
			"eai_dispatch",
			"eai_error",
			"eai_handoff",
			"eai_init",
			"eai_issue",
			"eai_meta",
			"eai_plan_save",
			"eai_recall",
			"eai_research",
			"eai_status",
			"eai_todo",
		]);
		assert.deepEqual([...commands.keys()].sort(), [
			"eai",
			"eai-agents",
			"eai-arch",
			"eai-dispatch",
			"eai-go",
			"eai-growth",
			"eai-handoff",
			"eai-init",
			"eai-issues",
			"eai-recall",
			"eai-research",
			"eai-status",
			"eai-todo",
		]);
		assert.deepEqual(skills.map((skill) => skill.name).sort(), ["eai-coordination", "eai-dispatch", "eai-growth", "eai-handoff"]);

		// 工具参数必须是合法 JSON Schema（不能把 required:true 简写直接发给模型）
		for (const [name, definition] of tools) {
			assert.equal(definition.parameters.type, "object", `${name} parameters.type`);
			assert.equal(typeof definition.parameters.properties, "object", `${name} parameters.properties`);
			for (const [key, property] of Object.entries(definition.parameters.properties)) {
				assert.ok(!("required" in property), `${name}.${key} 泄漏 required 注解`);
			}
		}
		const agent = tools.get("eai_agent");
		assert.deepEqual(agent.parameters.required, ["action"]);
		assert.equal(agent.parameters.properties.type.type, "string");
		assert.equal(agent.parameters.properties.sources, undefined);
	} finally {
		await fsp.rm(dir, { recursive: true, force: true });
	}
});

test("端到端：初始化 → 任务 → 计划 → 状态 → 交接 → 错误/META", async () => {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "dsh-eai-e2e-"));
	const project = path.join(dir, "proj");
	await fsp.mkdir(project, { recursive: true });
	process.env.AI_GLOBAL_DIR = path.join(dir, "global");
	try {
		const { commands, call, cwd } = makeHarness();
		cwd.value = project;

		// init
		const init = await call("eai_init", { root: project });
		assert.equal(init.ok, true);
		assert.match(init.text, /coordination 已就绪/);
		for (const rel of ["AGENTS.md", "todo.md", ".ai/STRUCTURE.md", ".ai/errors/distilled/meta-rules.md", ".ai/scripts/issues.js", "docs/plans"]) {
			await fsp.access(path.join(project, rel));
		}
		assert.match(await fsp.readFile(path.join(project, "AGENTS.md"), "utf8"), /eai-workflow:agents:v1 BEGIN/);

		// 幂等
		const again = await call("eai_init", { root: project });
		assert.match(again.text, /跳过/);

		// todo
		const list = await call("eai_todo", { action: "list", root: project });
		assert.match(list.text, /任务清单为空/);
		const add = await call("eai_todo", { action: "add", desc: "实现解析器", stage: "s0", root: project });
		assert.equal(add.id, "T-001");
		const added = await call("eai_todo", { action: "add", desc: "实现渲染器", stage: "s0", root: project });
		assert.equal(added.id, "T-002");
		await call("eai_todo", { action: "start", id: "T-001", root: project });
		await call("eai_todo", { action: "done", id: "T-001", root: project });
		const linked = await call("eai_todo", { action: "link", id: "T-002", root: project });
		assert.match(linked.text, /aaaabbbb/);

		// 阶段登记 + 计划门禁（多步必须 acceptance + 研究记录）
		await call("eai_todo", { action: "stage_add", id: "s1", title: "核心实现", root: project });
		await assert.rejects(
			call("eai_plan_save", { stage: "s1", steps: ["实现解析器", "实现渲染器"], skip_research: "纯文档", root: project }),
			/acceptance/,
		);
		await assert.rejects(
			call("eai_plan_save", { stage: "s1", steps: ["实现解析器", "实现渲染器"], acceptance: ["a", "b"], root: project }),
			/eai_research|闭门造车|skip_research/,
		);
		const research = await call("eai_research", {
			topic: "todo.md 解析器实现方案",
			sources: ["https://github.com/example/todo-parser — 参考状态机实现"],
			decision: "adapt",
			notes: "参考其状态机，去掉依赖",
			root: project,
		});
		assert.equal(research.id, "RESEARCH-001");
		const plan = await call("eai_plan_save", {
			stage: "s1",
			steps: ["实现解析器", "实现渲染器"],
			acceptance: ["npm test 全绿（解析器）", "快照测试通过（渲染器）"],
			research: research.id,
			notes: "验收：node --test",
			root: project,
		});
		assert.equal(plan.ok, true);
		assert.match(plan.plan, /^docs\/plans\/PLAN-001-/);
		assert.deepEqual(plan.added, ["T-003", "T-004"]);
		const planText = await fsp.readFile(path.join(project, plan.plan), "utf8");
		assert.match(planText, /PLAN-001/);
		assert.match(planText, /1\. 实现解析器/);
		assert.match(planText, /验收：npm test 全绿（解析器）/);
		assert.match(planText, /研究.*RESEARCH-001/);
		const todoText = await fsp.readFile(path.join(project, "todo.md"), "utf8");
		assert.match(todoText, /- s1: 核心实现 <!-- plan:docs\/plans\/PLAN-001-/);

		// 状态
		const status = await call("eai_status", { root: project });
		assert.match(status.text, /任务/);
		assert.match(status.text, /META/);
		assert.match(status.text, /PLAN-001/);

		// 交接
		const handoff = await call("eai_handoff", {
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

		const read = await call("eai_handoff", { action: "read", root: project });
		assert.match(read.text, /状态: open/);

		const consumed = await call("eai_handoff", { action: "consume", root: project });
		assert.equal(consumed.status, "resumed");
		const card2 = await fsp.readFile(path.join(project, ".ai", "HANDOFF.md"), "utf8");
		assert.match(card2, /- 状态: resumed/);
		assert.match(card2, /dsh\/aaaabbbb/);
		assert.match(await fsp.readFile(path.join(project, "todo.md"), "utf8"), /T-003 .*@session:aaaabbbb/);

		// G3 + META
		const err = await call("eai_error", {
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

		const metaList = await call("eai_meta", { action: "list", root: project });
		assert.match(metaList.text, /META-001/);

		// 角色卡池：开箱种子 / 检索 / 建卡 / 自升级 / 记忆 / first_mission
		const cards = await call("eai_agent", { action: "list" });
		assert.match(cards.text, /writer/);
		assert.match(cards.text, /reviewer/);
		assert.match(cards.text, /tester/);
		assert.match(cards.text, /architect/);
		const hit = await call("eai_agent", { action: "query", task: "实现一个任务卡" });
		assert.match(hit.text, /writer/);

		const reg = await call("eai_agent", {
			action: "register",
			id: "imu-expert",
			type: "domain-expert",
			name: "IMU 专家",
			summary: "IMU 标定与姿态融合",
			taxonomy: ["process.implement"],
			keywords: ["IMU", "标定", "姿态", "陀螺"],
			scope_do: ["标定与姿态融合"],
			scope_dont: ["上位机 UI 实现"],
			applies_to: ["IMU 调试"],
			reject_hint: "UI 问题 → writer",
		});
		assert.match(reg.text, /first_mission=pending/);
		const afterRegister = await call("eai_agent", { action: "query", task: "陀螺仪标定" });
		assert.match(afterRegister.text, /imu-expert/);

		const upgraded = await call("eai_agent", {
			action: "update",
			id: "imu-expert",
			keywords: ["IMU", "标定", "姿态", "陀螺", "零偏"],
			note: "T-042 补零偏关键词",
		});
		assert.match(upgraded.text, /v2/);

		const reflected = await call("eai_agent", { action: "reflect", id: "imu-expert", task: "陀螺仪零偏标定与温度补偿" });
		assert.match(reflected.text, /建议补充/);
		assert.match(reflected.text, /温度|补偿|陀螺/);

		const memory = await call("eai_agent", {
			action: "memory_add",
			owner: "imu-expert",
			type: "pitfall",
			title: "零偏必须持续追踪",
			content: "静置漂移：冻结偏置压不住，必须静止判定 + 持续 bias 追踪。",
			domains: ["imu"],
			keywords: ["零偏", "漂移"],
		});
		assert.match(memory.text, /经验已写入/);
		const memoryList = await call("eai_agent", { action: "memory_list", owner: "imu-expert" });
		assert.match(memoryList.text, /零偏/);

		const firstMission = await call("eai_agent", { action: "first_mission_done", id: "imu-expert" });
		assert.match(firstMission.text, /done/);

		// 派发矩阵：命中 writer + 落盘 .ai/dispatch/
		const dispatch = await call("eai_dispatch", { stage: "s1", root: project });
		assert.match(dispatch.text, /派发矩阵/);
		assert.match(dispatch.text, /T-003/);
		assert.match(dispatch.text, /writer/);
		assert.ok(dispatch.path, "dispatch record path");
		await fsp.access(dispatch.path);
		const dispatchJson = JSON.parse(await fsp.readFile(dispatch.path.replace(/\.md$/, ".json"), "utf8"));
		assert.equal(dispatchJson.tasks.length, 2);
		assert.match(dispatchJson.tasks[0].prompt, /纪律/);
		assert.ok(dispatchJson.tasks[0].role);

		const growth = await commands.get("eai-growth").handler({ rawInput: "", agent: { id: SESSION }, signal: new AbortController().signal });
		assert.equal(growth.kind, "success");
		assert.match(growth.text, /待复核卡/);

		// 旧经验检索：能召回刚记录的 ERR
		const recall = await call("eai_recall", { query: "断言不匹配", root: project });
		assert.match(recall.text, /ERR-001/);

		// 七层单向依赖检查：反向引用必须被抓住
		await fsp.mkdir(path.join(project, "src", "shared"), { recursive: true });
		await fsp.mkdir(path.join(project, "src", "core"), { recursive: true });
		await fsp.writeFile(path.join(project, "src", "shared", "a.js"), 'import x from "../core/b.js";\nimport y from "@/core/b.js";\nexport default x + y;\n', "utf8");
		await fsp.writeFile(path.join(project, "src", "core", "b.js"), "export default 1;\n", "utf8");
		const arch = await call("eai_arch", { root: project });
		assert.equal(arch.ok, false);
		assert.match(arch.text, /2 处反向依赖/);
		assert.match(arch.text, /shared 依赖 core/);
		assert.match(arch.text, /@\/core\/b\.js/);

		// issue：无 remote 时 list 仍可用（本地视图），sync 才报错
		assert.match((await call("eai_issue", { action: "list", root: project })).text, /remote=（未配置/);
		await assert.rejects(call("eai_issue", { action: "sync", root: project }), /git remote origin/);

		// 命令：/eai-status 与 /eai-go 空参
		const statusCommand = await commands.get("eai-status").handler({ rawInput: "", agent: { id: SESSION }, signal: new AbortController().signal });
		assert.equal(statusCommand.kind, "success");
		assert.match(statusCommand.text, /项目/);
		const goCommand = await commands.get("eai-go").handler({ rawInput: "", agent: { id: SESSION }, signal: new AbortController().signal });
		assert.match(goCommand.text, /可选阶段/);
	} finally {
		await fsp.rm(dir, { recursive: true, force: true });
		delete process.env.AI_GLOBAL_DIR;
	}
});