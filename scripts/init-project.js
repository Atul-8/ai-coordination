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
 *   缺失时自动触发 scripts/init-global.mjs（幂等 bootstrap：建架构 + 克隆双云库
 *   meta/ ← eai-code/ai-meta、agents/ ← eai-code/eai-agent 含 pool/ 卡池）；
 *   已存在则不动（更新请手动跑 init-global.mjs）。
 *   设计规格：agents 仓 docs/design/rag-pool-redesign.md §11
 *
 * 用法： node init-project.js [项目根目录=当前目录]
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TPL = join(PKG, "templates");

const AGENTS_MARKER_BEGIN = "<!-- pi-ai-coordination:agents:v1 BEGIN -->";
const AGENTS_MARKER_END = "<!-- pi-ai-coordination:agents:v1 END -->";

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

	// ============ 一、全局池（缺失时触发 bootstrap，幂等；详见 scripts/init-global.mjs） ============
	const g = globalPoolDir();
	const gCreated = [];
	const gSkipped = [];
	let gBootstrapped = false;
	if (!existsSync(g)) {
		try {
			execFileSync(process.execPath, [join(PKG, "scripts", "init-global.mjs")], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
			gBootstrapped = true;
			gCreated.push("全局池 bootstrap（init-global.mjs：建架构 + 克隆 meta/agents 双云库）");
		} catch (e) {
			gSkipped.push(`全局池 bootstrap 失败（${String(e.message).split("\n")[0].trim()}），稍后可手动运行 node scripts/init-global.mjs`);
		}
	} else {
		gSkipped.push("全局池已存在（更新请运行 node <包>/scripts/init-global.mjs，幂等 pull）");
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
				global: { dir: g, bootstrapped: gBootstrapped, created: gCreated, skipped: gSkipped, note: "namespace=pi-dynamic-workflows；角色卡单池在 AI_GLOBAL_DIR/agents/pool/（派发前 query.mjs 检索三档）" },
				project: { created, skipped },
				next: [
					"编辑 todo.md 登记阶段定义与任务",
					"pi 启动项目 → /pm 需求入口 · /plan 计划模式 · /issue 同步 · /go 调度",
					"多 agent 接入各阶段：常驻 PM 以 pi-dynamic-workflows.<stage>.<T-NNN> 动态派发 lanes（派发前 RAG 池检索三档/建卡协议/退单队列，spec: AI_GLOBAL_DIR/agents/docs/design/rag-pool-redesign.md）",
				],
			},
			null,
			2,
		),
	);
}

main();
