#!/usr/bin/env node
/**
 * init-project.js — 项目 + 全局池初始化（重构点 2 + 3 落地器）
 *
 * 一、部署目标项目（运行时移动，而非追加到全局文件）：
 *   <project>/
 *   ├── AGENTS.md            ← 模板部署（运行时生效；已有则插桩合并，幂等）
 *   ├── todo.md              ← 任务事实源（已存在则不动）
 *   ├── docs/plans/          ← /plan 产出目录
 *   └── .ai/                 ← coordination 层
 *       ├── README.md
 *       ├── STRUCTURE.md     ← 七层结构地图（G2 同步对象）
 *       ├── scripts/issues.js← 从包复制（项目内稳定路径，每次刷新）
 *       ├── requirements/REQ-000.md
 *       └── errors/{raw/ERR-000.md, distilled/meta-rules.md}
 *
 * 二、确保全局池（AI_GLOBAL_DIR，默认 C:\.ai_global / ~/.ai_global）：
 *   <global>/
 *   ├── README.md
 *   ├── meta/{raw/, distilled/meta-rules.md}      ← 全局 META 经验池
 *   └── agents/                                   ← 全局智能体调配
 *       ├── registry.json                         ← namespace 固定 pi-dynamic-workflows
 *       ├── cards/{pm,writer,reviewer,tester,architect}.md
 *       └── dynamic-dispatch.example.js           ← 常驻 PM 动态调度模板
 *
 * 用法： node init-project.js [项目根目录=当前目录]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TPL = join(PKG, "templates");

const AGENTS_MARKER_BEGIN = "<!-- pi-ai-coordination:agents:v1 BEGIN -->";
const AGENTS_MARKER_END = "<!-- pi-ai-coordination:agents:v1 END -->";

const AGENT_CARDS = ["pm", "writer", "reviewer", "tester", "architect"];

function globalPoolDir() {
	return process.env.AI_GLOBAL_DIR ?? (process.platform === "win32" ? "C:\\.ai_global" : join(homedir(), ".ai_global"));
}

function main() {
	const root = resolve(process.argv[2] ?? process.cwd());
	const created = [];
	const skipped = [];

	/** mkdir -p + 记录 */
	function ensureDir(p, log = created) {
		if (!existsSync(p)) {
			mkdirSync(p, { recursive: true });
			log.push(rel(p, log === created ? root : null) + "/");
		}
	}
	/** 复制模板文件（已存在则跳过） */
	function ensureFileFromTpl(dest, tplRel, log = created, projectRoot = root) {
		if (existsSync(dest)) {
			skipped.push(`${rel(dest, projectRoot)}（已存在，未覆盖）`);
			return;
		}
		copyFileSync(join(TPL, tplRel), dest);
		log.push(rel(dest, projectRoot));
	}
	function rel(p, base = root) {
		return base && p.startsWith(base) ? p.slice(base.length + 1) : p;
	}

	if (!existsSync(root)) mkdirSync(root, { recursive: true });

	// ============ 一、全局池（先就绪，项目派发依赖它） ============
	const g = globalPoolDir();
	const gCreated = [];
	const gSkipped = [];
	{
		const gDir = (p) => {
			if (!existsSync(p)) {
				mkdirSync(p, { recursive: true });
				gCreated.push(rel(p, g) + "/");
			}
		};
		const gFile = (dest, tplRel) => {
			if (existsSync(dest)) {
				gSkipped.push(rel(dest, g));
				return;
			}
			copyFileSync(join(TPL, tplRel), dest);
			gCreated.push(rel(dest, g));
		};
		gDir(g);
		gFile(join(g, "README.md"), join("global", "README.md"));
		gDir(join(g, "meta", "raw"));
		gDir(join(g, "meta", "distilled"));
		gFile(join(g, "meta", "distilled", "meta-rules.md"), join("global", "meta-rules.md"));
		gDir(join(g, "agents", "cards"));
		gFile(join(g, "agents", "registry.json"), join("agents", "registry.json"));
		for (const c of AGENT_CARDS) gFile(join(g, "agents", "cards", `${c}.md`), join("agents", "cards", `${c}.md`));
		gFile(join(g, "agents", "dynamic-dispatch.example.js"), join("agents", "dynamic-dispatch.example.js"));
	}

	// ============ 二、项目部署 ============

	// 1. AGENTS.md —— 运行时规范部署（已有文件则带标记插桩，幂等）
	const agentsPath = join(root, "AGENTS.md");
	const template = readFileSync(join(PKG, "AGENTS.md"), "utf-8");
	if (!existsSync(agentsPath)) {
		writeFileSync(agentsPath, template, "utf-8");
		created.push("AGENTS.md");
	} else if (readFileSync(agentsPath, "utf-8").includes(AGENTS_MARKER_BEGIN)) {
		skipped.push("AGENTS.md（已含 coordination 插桩）");
	} else {
		const existing = readFileSync(agentsPath, "utf-8");
		writeFileSync(agentsPath, `${AGENTS_MARKER_BEGIN}\n${template}\n${AGENTS_MARKER_END}\n\n${existing}`, "utf-8");
		created.push("AGENTS.md（插桩合并到现有文件顶部）");
	}

	// 2. todo.md
	ensureFileFromTpl(join(root, "todo.md"), "todo.md");

	// 3. docs/plans/
	ensureDir(join(root, "docs", "plans"));

	// 4. .ai/ coordination 层
	const ai = join(root, ".ai");
	ensureDir(ai);
	ensureFileFromTpl(join(ai, "README.md"), "ai-README.md");
	ensureFileFromTpl(join(ai, "STRUCTURE.md"), "STRUCTURE.md");
	ensureDir(join(ai, "scripts"));
	ensureDir(join(ai, "requirements"));
	ensureFileFromTpl(join(ai, "requirements", "REQ-000.md"), "REQ-000.md");
	ensureDir(join(ai, "errors", "raw"));
	ensureDir(join(ai, "errors", "distilled"));
	ensureFileFromTpl(join(ai, "errors", "raw", "ERR-000.md"), "ERR-000.md");
	ensureFileFromTpl(join(ai, "errors", "distilled", "meta-rules.md"), "meta-rules.md");

	// 5. issues.js 部署到项目内（稳定路径，AGENTS.md/提示词都引用它；每次 init 强制刷新）
	copyFileSync(join(PKG, "scripts", "issues.js"), join(ai, "scripts", "issues.js"));
	skipped.push(".ai/scripts/issues.js（每次 init 强制刷新为包内最新版）");

	console.log(
		JSON.stringify(
			{
				ok: true,
				root,
				global: { dir: g, created: gCreated, skipped: gSkipped, note: "namespace=pi-dynamic-workflows（常驻 PM 动态调度固定前缀）" },
				project: { created, skipped },
				next: [
					"编辑 todo.md 登记阶段定义与任务",
					"pi 启动项目 → /pm 需求入口 · /plan 计划模式 · /issue 同步 · /go 调度",
					"多 agent 接入各阶段：常驻 PM 以 pi-dynamic-workflows.<stage>.<T-NNN> 动态派发 lanes",
				],
			},
			null,
			2,
		),
	);
}

main();
