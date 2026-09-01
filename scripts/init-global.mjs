#!/usr/bin/env node
/**
 * init-global.mjs — 全新机器全局池 bootstrap（设计规格：agents 仓 docs/design/rag-pool-redesign.md §11）
 *
 * 职责（幂等，可重复执行）：
 *   1. 检测全局池根目录（AI_GLOBAL_DIR，默认 C:\.ai_global / ~/.ai_global）
 *      - 缺失 → 创建目录架构 meta/{raw,distilled} + agents/ + README.md + read-token.sh
 *      - 已存在 → 只补缺失目录与文件，不动已有内容
 *   2. meta/ 与 agents/ 两个公共池数据源：
 *      - 是 git 仓库 → git pull --ff-only 幂等更新
 *      - 空目录/缺失 → git clone 云端库
 *          meta/   ← gitee eai-code/ai-meta  （main）
 *          agents/ ← gitee eai-code/eai-agent（master，含 pool/ 卡池 + taxonomy + scripts）
 *      - 非空且非 git 仓库 → 告警跳过（绝不删除用户文件）
 *   3. 凭据：personal_token.yml（顶层 gitee:/github: 键）静默读取，仅用于本次命令行；
 *      clone 后立即 git remote set-url origin 干净 URL，token 绝不持久化到 .git/config。
 *      token 缺失 → 优雅降级：尝试匿名 clone；失败则保留目录结构并告警（不中断，exit 0）。
 *
 * 用法： node scripts/init-global.mjs [--dir <全局池根目录>]
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PKG = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TPL = join(PKG, "templates");

const REPOS = [
	{ dir: "meta", url: "https://gitee.com/eai-code/ai-meta.git", branch: "main" },
	{ dir: "agents", url: "https://gitee.com/eai-code/eai-agent.git", branch: "master" },
];

const args = process.argv.slice(2);
let dirOverride = null;
for (let i = 0; i < args.length; i++) if (args[i] === "--dir") dirOverride = args[i + 1];

const dir = resolve(
	dirOverride
		?? process.env.AI_GLOBAL_DIR
		?? (process.platform === "win32" ? "C:\\.ai_global" : join(homedir(), ".ai_global")),
);

const actions = [];
const warnings = [];

function git(cwd, argv) {
	return execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** 从 personal_token.yml 静默读指定平台 token（顶层 <platform>: → token:）。找不到返回 null。 */
function readToken(platform) {
	for (const p of [join(dir, "personal_token.yml"), "C:\\.ai_global\\personal_token.yml"]) {
		try {
			let inSection = false;
			for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
				if (new RegExp(`^${platform}\\s*:`).test(line)) { inSection = true; continue; }
				if (/^\S/.test(line)) { inSection = false; continue; }
				if (inSection) {
					const m = /^token\s*:\s*(.+?)\s*$/.exec(line);
					if (m) return m[1];
				}
			}
		} catch { /* 文件缺失/不可读 → 找下一个路径 */ }
	}
	return null;
}

function isGitRepo(p) {
	return existsSync(join(p, ".git"));
}

function ensureSkeleton() {
	// 只建根目录与根文件；meta/、agents/ 内部留给 clone（避免非空阻塞），失败后再兜底
	if (!existsSync(dir)) { mkdirSync(dir, { recursive: true }); actions.push(`mkdir ${dir}`); }
	const readme = join(dir, "README.md");
	if (!existsSync(readme)) { copyFileSync(join(TPL, "global", "README.md"), readme); actions.push("README.md（模板部署）"); }
	const tokenSh = join(dir, "read-token.sh");
	if (!existsSync(tokenSh)) { copyFileSync(join(TPL, "global", "read-token.sh"), tokenSh); actions.push("read-token.sh（模板部署）"); }
}

/** clone 失败/被跳过的目录：离线兜底（建最小可用结构，不阻塞使用） */
function ensureFallbackDirs() {
	const meta = join(dir, "meta");
	if (!isGitRepo(meta)) {
		for (const d of [join(meta, "raw"), join(meta, "distilled")]) {
			if (!existsSync(d)) { mkdirSync(d, { recursive: true }); actions.push(`mkdir ${d}（离线兜底）`); }
		}
		const rules = join(meta, "distilled", "meta-rules.md");
		if (!existsSync(rules)) { copyFileSync(join(TPL, "global", "meta-rules.md"), rules); actions.push("meta/distilled/meta-rules.md（模板部署）"); }
	}
}

function syncRepo({ dir: name, url, branch }) {
	const target = join(dir, name);
	const missing = !existsSync(target);
	const emptyRepo = !missing && !isGitRepo(target);

	// 已是 git 仓库 → 幂等 pull
	if (!missing && !emptyRepo) {
		try {
			git(target, ["pull", "--ff-only", "origin", branch]);
			actions.push(`${name}/: git pull --ff-only（幂等更新）`);
		} catch (e) {
			warnings.push(`${name}/: git pull 失败（${String(e.message).split("\n")[0].trim()}），保留本地版本`);
		}
		return;
	}

	// 空目录 → 先移除空壳再 clone；非空且非 git 仓库 → 绝不删除，告警跳过
	if (emptyRepo) {
		try {
			rmdirSync(target); // 仅真空目录可成功；非空会抛错
		} catch {
			warnings.push(`${name}/: 目录非空且非 git 仓库——跳过 clone（不删除用户文件），请手工处理`);
			return;
		}
	}

	const token = readToken("gitee");
	const authUrl = token ? url.replace("https://", `https://oauth2:${token}@`) : url;
	try {
		git(dir, ["clone", "--branch", branch, authUrl, name]);
		actions.push(`${name}/: clone ${url}（${branch}${token ? "，凭据模式" : "，匿名模式"}）`);
	} catch (e) {
		warnings.push(`${name}/: clone 失败（${token ? "凭据模式" : "匿名模式"}，${String(e.message).split("\n")[0].trim()}）——稍后修复网络/凭据可重跑本脚本`);
		return;
	} finally {
		// clone 后立即清洗 remote URL，token 不持久化（目标不存在时静默跳过）
		try { git(target, ["remote", "set-url", "origin", url]); } catch { /* ignore */ }
	}
}

ensureSkeleton();
for (const r of REPOS) syncRepo(r);
ensureFallbackDirs();

console.log(JSON.stringify({ ok: true, dir, actions, warnings }, null, 2));
if (warnings.length > 0) {
	console.error("提示：存在告警项；修复网络/凭据后可重跑 node scripts/init-global.mjs（幂等）。");
}
