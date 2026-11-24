import test from "node:test";
import assert from "node:assert/strict";
import { promises as fsp } from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../index.js";

const SESSION = "session-0123abcd-ffff";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

function harness({ policy, workingDir, agents } = {}) {
	const tools = new Map();
	const commands = new Map();
	const skills = [];
	const ctx = {
		tools: { register: (definition) => { tools.set(definition.name, definition); return () => {}; } },
		commands: { register: (definition) => { commands.set(definition.name, definition); return () => {}; } },
		get(name) {
			if (name === "skills") return { register: (skill) => { skills.push(skill); return () => {}; } };
			if (name === "workingDirectory") return { ensure: async () => workingDir };
			if (name === "sandboxPolicy") return policy ? { resolve: () => policy } : undefined;
			if (name === "agents") return agents;
			return undefined;
		},
	};
	apply(ctx);
	const call = (name, args, exec = {}) => {
		const definition = tools.get(name);
		assert.ok(definition, `tool ${name} 未注册`);
		return definition.execute(args, { agent: { id: SESSION }, signal: new AbortController().signal, ...exec });
	};
	const cmd = (name, input = "", extra = {}) => {
		const definition = commands.get(name);
		assert.ok(definition, `command ${name} 未注册`);
		return definition.handler({ rawInput: input, agent: { id: SESSION }, signal: new AbortController().signal, ...extra });
	};
	return { tools, commands, skills, call, cmd };
}

async function freshProject(prefix = "dsh-full-") {
	const dir = await fsp.mkdtemp(path.join(os.tmpdir(), prefix));
	const project = path.join(dir, "proj");
	await fsp.mkdir(project, { recursive: true });
	const globalDir = path.join(dir, "global");
	process.env.AI_GLOBAL_DIR = globalDir;
	return { dir, project, globalDir };
}

async function cleanup(dir) {
	await fsp.rm(dir, { recursive: true, force: true });
	delete process.env.AI_GLOBAL_DIR;
}

// ---------------------------------------------------------------------------
// JSON Schema 契约
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

function checkSchema(node, where, errors) {
	if (node === null || typeof node !== "object" || Array.isArray(node)) {
		errors.push(`${where}: 不是 schema 对象`);
		return;
	}
	if (typeof node.required === "boolean") errors.push(`${where}: 属性注解 required:true 泄漏到 JSON Schema`);
	if (node.anyOf) errors.push(`${where}: 出现 anyOf（provider 严格模式风险）`);
	if (node.oneOf) {
		if (!Array.isArray(node.oneOf) || node.oneOf.length < 2) errors.push(`${where}.oneOf 至少 2 支`);
		else node.oneOf.forEach((branch, index) => checkSchema(branch, `${where}.oneOf[${index}]`, errors));
		return;
	}
	if (!VALID_TYPES.has(node.type)) {
		errors.push(`${where}.type 非法：${JSON.stringify(node.type)}`);
		return;
	}
	if (node.type === "object") {
		if (node.properties === undefined) errors.push(`${where}.properties 缺失`);
		else if (typeof node.properties !== "object" || Array.isArray(node.properties)) errors.push(`${where}.properties 非法`);
		else for (const [key, property] of Object.entries(node.properties)) checkSchema(property, `${where}.properties.${key}`, errors);
		if (node.required !== undefined) {
			if (!Array.isArray(node.required)) errors.push(`${where}.required 不是数组`);
			else for (const key of node.required) {
				if (!node.properties || !(key in node.properties)) errors.push(`${where}.required 含未定义属性 ${key}`);
			}
		}
		if (node.additionalProperties !== undefined && typeof node.additionalProperties !== "boolean") {
			errors.push(`${where}.additionalProperties 非法`);
		}
	}
	if (node.type === "array") {
		if (node.items === undefined) errors.push(`${where}.items 缺失`);
		else checkSchema(node.items, `${where}.items`, errors);
	}
}

test("全部工具 parameters/output.schema 是合法 JSON Schema", async () => {
	const { dir, project } = await freshProject();
	try {
		const { tools } = harness({ workingDir: project });
		assert.equal(tools.size, 13);
		for (const [name, definition] of tools) {
			const errors = [];
			checkSchema(definition.parameters, `${name}.parameters`, errors);
			checkSchema(definition.output.schema, `${name}.output`, errors);
			assert.deepEqual(errors, [], `${name}:\n${errors.join("\n")}`);
			assert.equal(definition.parameters.type, "object");
			assert.ok(definition.parameters.properties);
			assert.equal(typeof definition.description, "string");
			assert.ok(definition.description.length > 20, `${name} description 过短`);
		}
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// 初始化
// ---------------------------------------------------------------------------

test("eai_init：全新 / 幂等 / 合并 AGENTS / pi、zcode 插桩升级", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		const first = await call("eai_init", {});
		assert.match(first.text, /coordination 已就绪/);
		for (const rel of ["AGENTS.md", "todo.md", "docs/plans", ".ai/STRUCTURE.md", ".ai/README.md", ".ai/scripts/issues.js", ".ai/errors/raw/ERR-000.md", ".ai/errors/distilled/meta-rules.md"]) {
			await fsp.access(path.join(project, rel));
		}
		assert.match(await fsp.readFile(path.join(project, "AGENTS.md"), "utf8"), /eai-workflow:agents:v1 BEGIN/);
		assert.match(first.text, /全局池：已播种/);

		const second = await call("eai_init", {});
		assert.equal(second.created.length, 0);
		assert.match(second.text, /跳过/);
	} finally {
		await cleanup(dir);
	}

	// 合并已有 AGENTS
	{
		const { dir, project } = await freshProject();
		try {
			await fsp.writeFile(path.join(project, "AGENTS.md"), "# 用户自有规范\n\n保留这段。\n", "utf8");
			await fsp.writeFile(path.join(project, "todo.md"), "# 我的 todo\n", "utf8");
			const { call } = harness({ workingDir: project });
			await call("eai_init", {});
			const agents = await fsp.readFile(path.join(project, "AGENTS.md"), "utf8");
			assert.match(agents, /用户自有规范/);
			assert.match(agents, /eai-workflow:agents:v1 BEGIN/);
			assert.equal(await fsp.readFile(path.join(project, "todo.md"), "utf8"), "# 我的 todo\n");
		} finally {
			await cleanup(dir);
		}
	}

	// root 指向文件 / AGENTS 标记不成对
	{
		const { dir, project } = await freshProject();
		try {
			const filePath = path.join(dir, "afile.txt");
			await fsp.writeFile(filePath, "x", "utf8");
			const { call } = harness({ workingDir: project });
			await assert.rejects(call("eai_init", { root: filePath }), /不是目录/);
			await fsp.writeFile(path.join(project, "AGENTS.md"), "<!-- eai-workflow:agents:v1 BEGIN -->\n半截\n", "utf8");
			await assert.rejects(call("eai_init", {}), /标记不完整/);
		} finally {
			await cleanup(dir);
		}
	}

	// pi / zcode 插桩升级
	for (const [host, begin, end] of [
		["pi", "<!-- pi-ai-coordination:agents:v1 BEGIN -->", "<!-- pi-ai-coordination:agents:v1 END -->"],
		["zcode", "<!-- ai-coordination:agents:v1 BEGIN -->", "<!-- ai-coordination:agents:v1 END -->"],
	]) {
		const { dir, project } = await freshProject();
		try {
			await fsp.writeFile(path.join(project, "AGENTS.md"), `HEAD\n${begin}\n旧规范\n${end}\nTAIL\n`, "utf8");
			const { call } = harness({ workingDir: project });
			const result = await call("eai_init", {});
			const text = await fsp.readFile(path.join(project, "AGENTS.md"), "utf8");
			assert.ok(!text.includes(begin), `${host} 旧标记未清除`);
			assert.match(text, /HEAD/);
			assert.match(text, /TAIL/);
			assert.match(result.text, new RegExp(`AGENTS.md（upgraded-${host}）`));
		} finally {
			await cleanup(dir);
		}
	}
});

// ---------------------------------------------------------------------------
// todo
// ---------------------------------------------------------------------------

test("eai_todo：全 action 与错误分支", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await assert.rejects(call("eai_todo", { action: "list" }), /coordination 未激活/);
		await call("eai_init", {});
		assert.match((await call("eai_todo", { action: "list" })).text, /任务清单为空/);
		await assert.rejects(call("eai_todo", { action: "add" }), /需要 desc/);
		await assert.rejects(call("eai_todo", { action: "add", desc: "x", stage: "s9" }), /未知阶段/);
		await assert.rejects(call("eai_todo", { action: "stage_add", id: "x1", title: "t" }), /必须形如 s1/);
		await assert.rejects(call("eai_todo", { action: "stage_add", id: "s0", title: "t" }), /已存在/);
		assert.match((await call("eai_todo", { action: "stage_add", id: "s1", title: "核心" })).text, /已登记阶段 s1/);
		assert.equal((await call("eai_todo", { action: "add", desc: "实现解析器", stage: "s1" })).id, "T-001");
		assert.equal((await call("eai_todo", { action: "add", desc: "实现渲染器" })).id, "T-002");
		await call("eai_todo", { action: "start", id: "T-001" });
		await call("eai_todo", { action: "done", id: "t-001" }); // 编号大小写归一
		await assert.rejects(call("eai_todo", { action: "done", id: "T-999" }), /未找到任务/);
		await assert.rejects(call("eai_todo", { action: "set_issue", id: "T-002" }), /需要 id 和 issue/);
		await assert.rejects(call("eai_todo", { action: "set_issue", id: "T-002", issue: "abc" }), /整数/);
		await assert.rejects(call("eai_todo", { action: "set_issue", id: "T-002", issue: 3.7 }), /整数/);
		await call("eai_todo", { action: "set_issue", id: "T-002", issue: 42 });
		const injected = await call("eai_todo", { action: "add", desc: "look @session:deadbeef (#9)\nsecond line" });
		assert.match(injected.text, /look/);
		const linked = await call("eai_todo", { action: "link", id: "T-002" });
		assert.match(linked.text, /0123abcd/);
		await assert.rejects(call("eai_todo", { action: "unknown" }), /未知 action/);
		const board = await call("eai_todo", { action: "list" });
		assert.match(board.text, /T-001/);
		assert.match(board.text, /#42/);
		assert.doesNotMatch(board.text, /\(#9\)/); // desc 里的 (#9) 不能变成 issue 元数据
		const todo = await fsp.readFile(path.join(project, "todo.md"), "utf8");
		assert.match(todo, /- \[x\] T-001 \[stage:s1\] 实现解析器/);
		assert.match(todo, /- \[ \] T-002 \[stage:s0\] 实现渲染器 \(#42\) @session:0123abcd/);
		assert.match(todo, /＠session:deadbeef/);
		assert.match(todo, /（#9）/);
		assert.doesNotMatch(todo, /@session:deadbeef/);

		// todo.md 被删：必须报缺失，不能静默当空清单
		await fsp.rm(path.join(project, "todo.md"));
		await assert.rejects(call("eai_todo", { action: "list" }), /todo\.md 缺失/);
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// plan
// ---------------------------------------------------------------------------

test("eai_plan_save：研究门禁 / 验收门禁 / 落盘与编号", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await call("eai_init", {});
		await assert.rejects(call("eai_plan_save", { stage: "s9", steps: ["a"], skip_research: "文档" }), /未知阶段/);
		await assert.rejects(call("eai_plan_save", { steps: ["a"], skip_research: "文档" }), /需要 stage/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["   "], skip_research: "文档" }), /步骤为空|没有可落盘/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["a", "b"], skip_research: "文档" }), /acceptance/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["a", "b"], acceptance: ["x"], skip_research: "文档" }), /acceptance/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["a", "b"], acceptance: [], skip_research: "文档" }), /acceptance/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["a", "b"], acceptance: ["x", "y"] }), /eai_research|闭门造车|skip_research/);
		await assert.rejects(call("eai_plan_save", { stage: "s0", steps: ["a"], research: "RESEARCH-999", skip_research: "x" }), /找不到研究记录/);

		const research = await call("eai_research", { topic: "解析器实现", sources: ["https://github.com/example/parser"], decision: "adapt", notes: "参考状态机" });
		assert.equal(research.id, "RESEARCH-001");
		assert.match(research.text, /计划落盘时传 research/);
		await assert.rejects(call("eai_research", { topic: "", sources: ["https://x"] }), /topic/);
		await assert.rejects(call("eai_research", { topic: "x", sources: [] }), /至少需要 1 条来源/);
		await assert.rejects(call("eai_research", { topic: "x", sources: ["not a url"] }), /来源格式不合法/);
		await assert.rejects(call("eai_research", { topic: "x", sources: ["https://a"], decision: "adpot" }), /decision/);
		const stringSource = await call("eai_research", { topic: "字符串来源", sources: "https://github.com/x/y", decision: "adopt" });
		assert.equal(stringSource.id, "RESEARCH-002");

		const plan = await call("eai_plan_save", {
			stage: "s0",
			steps: ["实现解析器", "实现渲染器"],
			acceptance: ["解析器单测通过", "渲染器快照通过"],
			research: "RESEARCH-001",
			title: "核心实现",
			notes: "风险：状态机边界",
		});
		assert.match(plan.plan, /^docs\/plans\/PLAN-001-/);
		assert.deepEqual(plan.added, ["T-001", "T-002"]);
		const text = await fsp.readFile(path.join(project, plan.plan), "utf8");
		assert.match(text, /研究.*\.ai\/research\/RESEARCH-001/);
		assert.match(text, /1\. 实现解析器\n   - 验收：解析器单测通过/);
		assert.match(text, /风险：状态机边界/);
		const todo = await fsp.readFile(path.join(project, "todo.md"), "utf8");
		assert.match(todo, /<!-- plan:docs\/plans\/PLAN-001-/);

		const single = await call("eai_plan_save", { stage: "s0", steps: ["单步任务"], acceptance: [], skip_research: "纯文档" });
		assert.match(single.plan, /^docs\/plans\/PLAN-002-/);
		assert.deepEqual(single.added, ["T-003"]);
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// status / handoff
// ---------------------------------------------------------------------------

test("eai_status 与 eai_handoff 全流程", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await assert.rejects(call("eai_status", {}), /coordination 未激活/);
		await call("eai_init", {});
		await call("eai_todo", { action: "add", desc: "任务A" });
		await assert.rejects(call("eai_handoff", { action: "write", task: "T-001", done: "x", verify: "v" }), /next/);
		await assert.rejects(call("eai_handoff", { action: "write", task: "T-001", done: "x", next: "n" }), /verify/);
		const written = await call("eai_handoff", { action: "write", task: "T-001", done: "完成 A\n证据：abc", doing: "B 未开始", blockers: "无", next: "继续 B", verify: "node --test" });
		assert.match(written.text, /交接卡已写入/);
		const card = await fsp.readFile(path.join(project, ".ai/HANDOFF.md"), "utf8");
		assert.match(card, /- 状态: open/);
		assert.match(card, /- 已完成: 完成 A \/ 证据：abc/); // 单行化
		assert.match(card, /- 下一步: 继续 B/);
		const status = await call("eai_status", {});
		assert.match(status.text, /项目规则 0 条/); // 模板示例 META-0000 不计入
		assert.match(status.text, /HANDOFF open/);
		assert.match(status.text, /META/);
		const read = await call("eai_handoff", { action: "read" });
		assert.match(read.text, /状态: open/);
		await assert.rejects(
			call("eai_handoff", { action: "consume" }, { agent: { id: "" } }),
			/没有关联会话/,
		);
		const consumed = await call("eai_handoff", { action: "consume" });
		assert.equal(consumed.status, "resumed");
		assert.match((await call("eai_handoff", { action: "consume" })).text, /无需消化/);
		assert.match((await call("eai_handoff", { action: "read" })).text, /状态: resumed/);
		assert.match(await fsp.readFile(path.join(project, "todo.md"), "utf8"), /T-001 .*@session:0123abcd/);

		// task 指向不存在的任务：不能假称重绑
		await call("eai_handoff", { action: "write", task: "T-999", next: "n", verify: "v" });
		const missingTask = await call("eai_handoff", { action: "consume" });
		assert.match(missingTask.text, /不在 todo.md，未重绑/);
	} finally {
		await cleanup(dir);
	}

	// 无卡片的 read
	{
		const { dir, project } = await freshProject();
		try {
			const { call } = harness({ workingDir: project });
			await call("eai_init", {});
			const read = await call("eai_handoff", { action: "read" });
			assert.equal(read.ok, false);
			assert.match(read.text, /没有交接卡/);
			await assert.rejects(call("eai_handoff", { action: "consume" }), /没有交接卡/);
		} finally {
			await cleanup(dir);
		}
	}
});

// ---------------------------------------------------------------------------
// error / meta
// ---------------------------------------------------------------------------

test("eai_error 与 eai_meta：编号、校验、提升", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await call("eai_init", {});
		await assert.rejects(call("eai_error", { root_cause: "x" }), /symptom/);
		await assert.rejects(call("eai_error", { symptom: "x" }), /root_cause/);
		await assert.rejects(call("eai_error", { symptom: "x", root_cause: "y", meta_category: "NOPE" }), /未知 META 分类/);
		const first = await call("eai_error", { symptom: "断言失败 1 !== 2", root_cause: "期望值写错", fix: "改期望", prevention: "先红后绿", meta_category: "TEST", meta_rule: "先确认失败信息", evidence: "AssertionError" });
		assert.equal(first.err, "ERR-001");
		assert.equal(first.meta, "META-001");
		assert.match(first.text, /相关旧经验/);
		const second = await call("eai_error", { symptom: "另一个错误", root_cause: "另一个根因", meta_rule: "第二条规则", meta_category: "BUILD" });
		assert.equal(second.err, "ERR-002");
		assert.equal(second.meta, "META-002");

		const list = await call("eai_meta", { action: "list" });
		assert.match(list.text, /META-001/);
		assert.match(list.text, /META-002/);
		await assert.rejects(call("eai_meta", { action: "promote" }), /rule/);
		await assert.rejects(call("eai_meta", { action: "promote", rule: "META-999" }), /未找到匹配/);
		const promoted = await call("eai_meta", { action: "promote", rule: "META-001" });
		assert.match(promoted.text, /META-0001/);
		const promotedAgain = await call("eai_meta", { action: "promote", rule: "META-001" });
		assert.match(promotedAgain.text, /META-0001/);
		const globalText = await fsp.readFile(path.join(process.env.AI_GLOBAL_DIR, "meta/distilled/meta-rules.md"), "utf8");
		assert.equal((globalText.match(/### META-0001 /g) ?? []).length, 1, "重复 promote 不能重复写全局规则");
		assert.match(globalText, /### META-0001 \[META-001\]/);
		const projectText = await fsp.readFile(path.join(project, ".ai/errors/distilled/meta-rules.md"), "utf8");
		assert.match(projectText, /- \*\*全局\*\*: META-0001/);
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// recall / arch
// ---------------------------------------------------------------------------

test("eai_recall 与 eai_arch", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await assert.rejects(call("eai_recall", { query: "x" }), /未激活/);
		await call("eai_init", {});
		await assert.rejects(call("eai_recall", { query: "  " }), /query/);
		await call("eai_error", { symptom: "IMU 漂移：EKF 精度不足", root_cause: "未先检索旧经验", meta_rule: "IMU 默认 Mahony", meta_category: "ARCH" });
		const recall = await call("eai_recall", { query: "IMU 漂移" });
		assert.match(recall.text, /ERR-001/);
		assert.match(recall.text, /META-001/);
		await assert.rejects(call("eai_recall", { query: "IMU", limit: "abc" }), /limit/);

		// 无 src
		const empty = await call("eai_arch", {});
		assert.equal(empty.ok, false);
		assert.match(empty.text, /未找到 src/);

		// 允许方向
		await fsp.mkdir(path.join(project, "src/shared"), { recursive: true });
		await fsp.mkdir(path.join(project, "src/core"), { recursive: true });
		await fsp.writeFile(path.join(project, "src/shared/util.js"), "export const x = 1;\n");
		await fsp.writeFile(path.join(project, "src/core/engine.js"), 'import { x } from "../shared/util.js";\nexport default x;\n');
		const ok = await call("eai_arch", {});
		assert.equal(ok.ok, true);
		assert.match(ok.text, /未发现反向依赖/);

		// 外部裸包名（lodash/core）不能被误判为内部层
		await fsp.writeFile(path.join(project, "src/shared/ext.js"), 'import x from "lodash/core";\nexport default x;\n');
		const external = await call("eai_arch", {});
		assert.equal(external.ok, true, external.text);
		assert.match(external.text, /未发现反向依赖/);

		// JS 相对 + 别名 + Python 相对
		await fsp.writeFile(path.join(project, "src/shared/bad.js"), 'import a from "../core/engine.js";\nimport b from "@/core/engine.js";\nexport default a + b;\n');
		await fsp.writeFile(path.join(project, "src/shared/bad.py"), "from ..core import engine\n");
		const bad = await call("eai_arch", {});
		assert.equal(bad.ok, false);
		assert.match(bad.text, /3 处反向依赖/);
		assert.match(bad.text, /shared 依赖 core/);
		assert.match(bad.text, /@\/core\/engine\.js/);
		assert.match(bad.text, /bad\.py/);
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// issue（dry-run + 认证错误）
// ---------------------------------------------------------------------------

test("eai_issue：本地 remote 检测、dry-run、认证错误", async () => {
	const { dir, project } = await freshProject();
	try {
		const { execFile } = await import("node:child_process");
		const { promisify } = await import("node:util");
		const run = promisify(execFile);
		const { call } = harness({ workingDir: project });
		await call("eai_init", {});
		await call("eai_todo", { action: "add", desc: "需要 issue 的任务" });
		const localList = await call("eai_issue", { action: "list" });
		assert.match(localList.text, /remote=（未配置/);
		await assert.rejects(call("eai_issue", { action: "sync" }), /git remote origin/);
		await assert.rejects(call("eai_issue", { action: "bogus" }), /未知 action/);
		await assert.rejects(call("eai_issue", { action: "view" }), /number/);

		await run("git", ["init"], { cwd: project });
		await run("git", ["remote", "add", "origin", "https://github.com/example/repo.git"], { cwd: project });
		const dry = await call("eai_issue", { action: "sync", dry_run: true });
		assert.match(dry.text, /dry-run/);
		assert.match(dry.text, /T-001/);
		const list = await call("eai_issue", { action: "list" });
		assert.match(list.text, /未建 issue/);
		const closeDry = await call("eai_issue", { action: "close-done", dry_run: true });
		assert.match(closeDry.text, /没有已完成/);

		await run("git", ["remote", "set-url", "origin", "https://gitee.com/example/repo.git"], { cwd: project });
		const saved = process.env.GITEE_TOKEN;
		delete process.env.GITEE_TOKEN;
		try {
			await assert.rejects(call("eai_issue", { action: "sync" }), /GITEE_TOKEN/);
		} finally {
			if (saved !== undefined) process.env.GITEE_TOKEN = saved;
		}
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// agent pool / dispatch
// ---------------------------------------------------------------------------

test("eai_agent：检索、建卡校验、升级、记忆、复核、reflect", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		// 无 taxonomy：建卡必须拒绝
		process.env.AI_GLOBAL_DIR = path.join(dir, "empty-global");
		await assert.rejects(
			call("eai_agent", { action: "register", id: "x", type: "process-role", name: "x", summary: "y", taxonomy: ["a"], keywords: ["a", "b", "c"], scope_do: ["d"], scope_dont: ["e"] }),
			/taxonomy/,
		);
		process.env.AI_GLOBAL_DIR = path.join(dir, "global");
		await call("eai_init", {});
		const cards = await call("eai_agent", { action: "list" });
		for (const id of ["writer", "reviewer", "tester", "architect"]) assert.match(cards.text, new RegExp(id));
		const hit = await call("eai_agent", { action: "query", task: "实现一个任务卡" });
		assert.match(hit.text, /writer/);
		await assert.rejects(call("eai_agent", { action: "query" }), /task/);
		await assert.rejects(call("eai_agent", { action: "query", task: "x", limit: 0 }), /limit/);
		await assert.rejects(call("eai_agent", { action: "query", task: "x", threshold: "abc" }), /threshold/);
		for (const action of ["update", "reflect", "first_mission_done"]) {
			await assert.rejects(call("eai_agent", { action, id: "../evil", task: "x" }), /id 非法/);
		}

		const invalid = [
			{ id: "Bad_Id", type: "process-role", name: "x", summary: "y", taxonomy: ["process.implement"], keywords: ["a", "b", "c"], scope_do: ["d"], scope_dont: ["e"] },
			{ id: "bad-summary", type: "process-role", name: "x", summary: "通用万能角色", taxonomy: ["process.implement"], keywords: ["a", "b", "c"], scope_do: ["d"], scope_dont: ["e"] },
			{ id: "few-keywords", type: "process-role", name: "x", summary: "y", taxonomy: ["process.implement"], keywords: ["a"], scope_do: ["d"], scope_dont: ["e"] },
			{ id: "bad-taxonomy", type: "process-role", name: "x", summary: "y", taxonomy: ["nope.path"], keywords: ["a", "b", "c"], scope_do: ["d"], scope_dont: ["e"] },
			{ id: "no-scope", type: "process-role", name: "x", summary: "y", taxonomy: ["process.implement"], keywords: ["a", "b", "c"] },
			{ id: "writer", type: "process-role", name: "x", summary: "y", taxonomy: ["process.implement"], keywords: ["a", "b", "c"], scope_do: ["d"], scope_dont: ["e"] },
		];
		for (const input of invalid) await assert.rejects(call("eai_agent", { action: "register", ...input }), /建卡校验失败|已存在/);

		const reg = await call("eai_agent", {
			action: "register",
			id: "fpga-expert",
			type: "domain-expert",
			name: "FPGA 专家",
			summary: "FPGA 时序收敛与资源优化",
			taxonomy: ["process.implement"],
			keywords: ["fpga", "时序", "约束"],
			scope_do: ["时序收敛"],
			scope_dont: ["PCB 布线"],
		});
		assert.match(reg.text, /first_mission=pending/);
		assert.match((await call("eai_agent", { action: "query", task: "FPGA 时序收敛" })).text, /fpga-expert/);

		const up = await call("eai_agent", { action: "update", id: "fpga-expert", keywords: ["fpga", "时序", "约束", "vivado"], note: "补工具词" });
		assert.match(up.text, /v2/);

		// 卡内 version 非数字：自升级必须给出有限版本号
		const cardFile = path.join(process.env.AI_GLOBAL_DIR, "agents/pool/fpga-expert.md");
		await fsp.writeFile(cardFile, (await fsp.readFile(cardFile, "utf8")).replace(/version: \d+/, "version: abc"), "utf8");
		assert.match((await call("eai_agent", { action: "update", id: "fpga-expert", note: "修版本" })).text, /v1/);
		const reflected = await call("eai_agent", { action: "reflect", id: "fpga-expert", task: "Vivado 综合资源优化" });
		assert.match(reflected.text, /建议补充/);
		assert.match(reflected.text, /vivado|资源|综合/);
		await assert.rejects(call("eai_agent", { action: "reflect", id: "nope", task: "x" }), /卡不存在/);

		const memory = await call("eai_agent", { action: "memory_add", owner: "fpga-expert", type: "pitfall", title: "时序约束要先读 XDC", content: "现象/根因/修复/预防", domains: ["fpga"], keywords: ["xdc", "时序"] });
		assert.match(memory.text, /经验已写入/);
		await assert.rejects(call("eai_agent", { action: "memory_add", owner: "fpga-expert", type: "bogus", title: "x" }), /未知记忆类型/);
		await call("eai_agent", { action: "memory_add", owner: "fpga-expert", type: "pitfall", title: "时序约束要先读 XDC", content: "第二次" });
		const memoryFiles = (await fsp.readdir(path.join(process.env.AI_GLOBAL_DIR, "agents/memory/fpga-expert"))).filter((name) => name.startsWith("pitfall_"));
		assert.ok(memoryFiles.length >= 2, "同名记忆应追加序号而不是覆盖");
		assert.match((await call("eai_agent", { action: "memory_list", owner: "fpga-expert" })).text, /XDC/);
		assert.match((await call("eai_agent", { action: "memory_list" })).text, /fpga-expert/);
		await assert.rejects(call("eai_agent", { action: "memory_add", owner: "Bad", title: "x" }), /owner 非法/);
		assert.match((await call("eai_agent", { action: "first_mission_done", id: "fpga-expert" })).text, /done/);
		assert.match((await call("eai_agent", { action: "first_mission_done", id: "fpga-expert" })).text, /已复核/);
		const cardText = await fsp.readFile(path.join(process.env.AI_GLOBAL_DIR, "agents/pool/fpga-expert.md"), "utf8");
		assert.match(cardText, /first_mission: "done"/);
	} finally {
		await cleanup(dir);
	}
});

test("eai_dispatch：矩阵、JSON 派发计划、缺口", async () => {
	const { dir, project } = await freshProject();
	try {
		const { call } = harness({ workingDir: project });
		await call("eai_init", {});
		assert.match((await call("eai_dispatch", {})).text, /没有待办任务/);
		await assert.rejects(call("eai_dispatch", { stage: "s9" }), /未定义阶段/);
		await assert.rejects(call("eai_dispatch", { meta_injection: "BAD" }), /meta_injection/);
		await assert.rejects(call("eai_dispatch", { threshold: "abc" }), /threshold/);
		await call("eai_todo", { action: "stage_add", id: "s1", title: "实现" });
		await call("eai_todo", { action: "add", desc: "实现解析器", stage: "s1" });
		await call("eai_todo", { action: "add", desc: "zzz qqq", stage: "s1" });
		const result = await call("eai_dispatch", { stage: "s1" });
		assert.match(result.text, /派发矩阵/);
		assert.match(result.text, /T-001/);
		assert.match(result.text, /writer/);
		assert.match(result.text, /缺口/);
		const json = JSON.parse(await fsp.readFile(result.path.replace(/\.md$/, ".json"), "utf8"));
		assert.equal(json.tasks.length, 2);
		assert.match(json.tasks[0].prompt, /纪律/);
		assert.ok(json.tasks.some((task) => task.role === null));
		const noRecord = await call("eai_dispatch", { stage: "s1", record: false });
		assert.equal(noRecord.path, "");
		const again = await call("eai_dispatch", { stage: "s1" });
		assert.notEqual(again.path, result.path, "同秒派发不能覆盖上一份记录");
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// commands
// ---------------------------------------------------------------------------

test("全部 /eai 命令可执行", async () => {
	const { dir, project } = await freshProject();
	try {
		const followups = [];
		const agents = { get: () => ({ followup: async (message) => followups.push(message) }) };
		const { cmd, call } = harness({ workingDir: project, agents });
		assert.equal((await cmd("eai-init", "")).kind, "success");
		await call("eai_todo", { action: "add", desc: "命令路由测试任务" });
		await cmd("eai-todo", "");
		await cmd("eai-todo", "");
		await cmd("eai", "todo");
		await cmd("eai", "status");
		await cmd("eai", "meta");
		await cmd("eai", "agents");
		await cmd("eai", "agents", "");
		await cmd("eai-agents", "");
		await cmd("eai", "growth");
		await cmd("eai-growth", "");
		await cmd("eai", "arch");
		await cmd("eai-arch", "");
		assert.match((await cmd("eai-recall", "任意")).text ?? "", /旧经验检索|未命中/);
		await assert.rejects(async () => {
			const result = await cmd("eai-recall", "");
			if (result.kind === "error") throw new Error(result.text);
			return result;
		}, /用法/);
		assert.equal((await cmd("eai", "recall 任意")).kind, "success");

		const emptyResearch = await cmd("eai-research", "");
		assert.equal(emptyResearch.kind, "error");
		assert.match(emptyResearch.text, /用法/);
		const research = await cmd("eai-research", "插件测试 | https://github.com/example/x");
		assert.equal(research.kind, "success");
		assert.match(research.text, /RESEARCH-001/);

		await cmd("eai", "go");
		await cmd("eai-go", "");
		const noSessionGo = await cmd("eai", "go s0", { agent: {} });
		assert.equal(noSessionGo.kind, "error");
		assert.match(noSessionGo.text, /没有关联会话/);
		await assert.rejects(async () => {
			const result = await cmd("eai", "go s9");
			if (result.kind === "error") throw new Error(result.text);
			return result;
		}, /未定义阶段/);

		await cmd("eai", "handoff");
		await cmd("eai-handoff", "");
		await cmd("eai", "handoff done");

		await cmd("eai", "issues");
		await cmd("eai-issues", "list");
		const unknownSub = await cmd("eai", "unknown-sub");
		assert.equal(unknownSub.kind, "error");
		assert.match(unknownSub.text, /未知子命令/);
		assert.equal((await cmd("eai", "")).kind, "success"); // 空参回落到状态

		// /eai go s0 会写 @session 并 followup
		const goResult = await cmd("eai", "go s0");
		assert.equal(goResult.kind, "success", `go 失败：${goResult.text}`);
		const todoText = await fsp.readFile(path.join(project, "todo.md"), "utf8");
		assert.match(todoText, /@session:0123abcd/);
		assert.ok(followups.length >= 1);
		assert.match(followups[0].content[0].text, /阶段调度/);
	} finally {
		await cleanup(dir);
	}
});

// ---------------------------------------------------------------------------
// 沙箱策略
// ---------------------------------------------------------------------------

test("沙箱：read-only 拒绝写、workspace-write 越界、范围内放行", async () => {
	{
		const { dir, project } = await freshProject();
		try {
			const { call } = harness({ workingDir: project, policy: { mode: "read-only", workspaceRoot: project } });
			await assert.rejects(call("eai_init", {}), /只读/);
		} finally {
			await cleanup(dir);
		}
	}
	{
		const { dir, project } = await freshProject();
		try {
			const other = path.join(dir, "other");
			await fsp.mkdir(path.join(other, ".ai"), { recursive: true });
			await fsp.writeFile(path.join(other, "todo.md"), "# t\n\n## 阶段定义\n\n- s0: x\n\n## 任务\n", "utf8");
			const { call } = harness({ workingDir: project, policy: { mode: "workspace-write", workspaceRoot: project } });
			const init = await call("eai_init", {});
			assert.match(init.text, /警告/); // 全局池在工作区外 → 骨架失败但不阻断
			await call("eai_todo", { action: "add", desc: "范围内" });
			await assert.rejects(call("eai_todo", { action: "add", desc: "越界", root: other }), /越界/);
		} finally {
			await cleanup(dir);
		}
	}
});

// ---------------------------------------------------------------------------
// bundle 清单 / 技能
// ---------------------------------------------------------------------------

test("bundle 清单、patch、locale、icon、技能", async () => {
	const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, "package.json"), "utf8"));
	assert.equal(pkg.dsh.bundle.patch, "./cordis.patch.yml");
	assert.ok(pkg.files.includes("src"));
	assert.ok(pkg.files.includes("docs"));
	const patch = await fsp.readFile(path.join(ROOT, "cordis.patch.yml"), "utf8");
	assert.match(patch, /id: preset-eai-workflow/);
	assert.match(patch, /id: eai-workflow/);
	assert.match(patch, /name: 'dsh-eai-workflow'/);
	assert.match(patch, /prefix: \|/);
	for (const locale of ["en", "zh"]) {
		const json = JSON.parse(await fsp.readFile(path.join(ROOT, `locale/${locale}.json`), "utf8"));
		assert.ok(json.meta.title);
		assert.ok(json.meta.description);
	}
	const icon = await fsp.readFile(path.join(ROOT, "icon.svg"), "utf8");
	assert.match(icon, /viewBox="0 0 36 36"/);

	const { dir, project } = await freshProject();
	try {
		const { skills } = harness({ workingDir: project });
		assert.equal(skills.length, 4);
		for (const skill of skills) {
			assert.match(skill.name, /^eai-/);
			assert.ok(skill.description.length > 10);
			assert.ok(skill.content.length > 100);
		}
	} finally {
		await cleanup(dir);
	}
});