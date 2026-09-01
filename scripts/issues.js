#!/usr/bin/env node
/**
 * issues.js — todo.md ↔ git issues 双向桥（重构点 3 后半）
 *
 * 零依赖 Node 脚本。宿主自动检测（git remote origin）：
 * - github.com → 调用 gh CLI（需已 `gh auth login`）
 * - gitee.com  → 调用 Gitee OpenAPI v5（需环境变量 GITEE_TOKEN）
 *
 * 用法（在项目根目录，或任意子目录）：
 *   node issues.js sync [--stage s1] [--dry-run]  为无 issue 编号的待办任务创建 issue 并回写 (#N)
 *   node issues.js list [--stage s1]              列出任务与 issue 关联
 *   node issues.js view <N>                       查看 issue 详情
 *   node issues.js close <N> | open <N>           关闭 / 重开 issue
 *   node issues.js close-done                     关闭所有已完成任务对应的 issue
 *
 * 对应关系约定（todo.md 行内）：
 *   - [ ] T-001 [stage:s1] 描述 (#12) @session:01a05cc8
 */

import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, resolve } from "node:path";

// ---------- 定位 ----------

const ITEM_RE = /^- \[( |x|~)\]\s*(T-\d+)\s+\[stage:([^\]]+)\]\s*(.*)$/;
const STAGE_RE = /^-\s*(s\d+)\s*[:：]\s*(.*)$/;

function findRoot() {
	let dir = resolve(process.cwd());
	for (let i = 0; i < 64; i++) {
		if (existsSync(join(dir, "todo.md"))) return dir;
		const parent = resolve(dir, "..");
		if (parent === dir) fail("未找到 todo.md（从当前目录向上查找失败）");
		dir = parent;
	}
}

function fail(msg) {
	console.error(`[issues] ${msg}`);
	process.exit(1);
}

function parseTodo(root) {
	const lines = readFileSync(join(root, "todo.md"), "utf-8").split(/\r?\n/);
	let section = "";
	const stages = new Map();
	const items = [];
	lines.forEach((raw, i) => {
		const h = raw.match(/^##\s+(.*)$/);
		if (h) {
			section = h[1];
			return;
		}
		if (section.includes("阶段")) {
			const m = raw.match(STAGE_RE);
			if (m) stages.set(m[1], m[2].replace(/<!--.*?-->/g, "").trim());
		} else if (section.includes("任务")) {
			const m = raw.match(ITEM_RE);
			if (m) {
				let desc = m[4].trim();
				const issue = desc.match(/\(#(\d+)\)/);
				if (issue) desc = desc.replace(/\(#\d+\)/, "").trim();
				desc = desc.replace(/@session:[0-9a-zA-Z]+/, "").trim();
				items.push({ line: i, state: m[1], id: m[2], stage: m[3], desc, issue: issue ? Number(issue[1]) : null, done: m[1] === "x" });
			}
		}
	});
	return { lines, stages, items };
}

// ---------- 远端检测 ----------

function detectRemote(root) {
	let url;
	try {
		url = execFileSync("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf-8" }).trim();
	} catch {
		fail("git remote origin 未配置，无法同步 issues");
	}
	// git@github.com:owner/repo.git / https://gitee.com/owner/repo.git / ssh://...
	const m =
		url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i) ||
		url.match(/^ssh:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i) ||
		url.match(/^git@([^:]+):(.+)$/);
	if (!m) fail(`无法从 remote 解析 owner/repo：${url}`);
	const hostRaw = m[1];
	const path = m[2].replace(/\.git\/?$/i, "").replace(/\/+$/, "");
	const parts = path.split("/");
	if (parts.length < 2) fail(`remote 路径异常：${url}`);
	const host = /github/i.test(hostRaw) ? "github" : /gitee/i.test(hostRaw) ? "gitee" : null;
	if (!host) fail(`仅支持 github.com（gh CLI）与 gitee.com（API）。当前 remote：${url}`);
	return { host, owner: parts[0], repo: parts[parts.length - 1], url };
}

// ---------- gh CLI ----------

function gh(args, opts = {}) {
	return execFileSync("gh", args, { encoding: "utf-8", ...opts }).trim();
}

// ---------- Gitee API ----------

function giteeToken() {
	const t = process.env.GITEE_TOKEN;
	if (!t) fail("需要环境变量 GITEE_TOKEN（Gitee 私人令牌，repo 权限）");
	return t;
}

async function giteeApi(root, method, path, body) {
	const { owner, repo } = detectRemote(root);
	const res = await fetch(`https://gitee.com/api/v5/repos/${owner}/${repo}${path}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body ? JSON.stringify({ access_token: giteeToken(), ...body }) : undefined,
	});
	if (!res.ok) fail(`Gitee API ${method} ${path} → ${res.status} ${await res.text().catch(() => "")}`);
	return res.json();
}

// ---------- 抽象操作 ----------

async function createIssue(root, item) {
	const { host } = detectRemote(root);
	const title = `[${item.id}] ${item.desc}`;
	const stageTitle = parseTodo(root).stages.get(item.stage) ?? "";
	const body = [
		`来自 pi-ai-coordination todo.md 的任务项。`,
		"",
		`- 任务编号: ${item.id}`,
		`- 阶段: ${item.stage}（${stageTitle}）`,
		`- 阶段计划: ${stagePlanRef(root, item.stage) ?? "（无）"}`,
		`- 状态: 待办（todo.md 单一事实源）`,
		"",
		"> 调度：项目内 `/go " + item.stage + "`；完成由 `issues.js close-done` 自动关闭。",
	].join("\n");
	const labels = ["coordination", `stage:${item.stage}`];

	if (host === "github") {
		const out = gh(["issue", "create", "--title", title, "--body", body, "--label", labels.join(",")], { cwd: root });
		const num = out.match(/\/issues\/(\d+)/)?.[1];
		if (!num) fail(`gh issue create 输出无法解析：${out}`);
		return Number(num);
	}
	const json = await giteeApi(root, "POST", "/issues", { title, body, labels: labels.join(",") });
	return json.number;
}

function stagePlanRef(root, stageId) {
	const line = readFileSync(join(root, "todo.md"), "utf-8")
		.split(/\r?\n/)
		.find((l) => l.match(STAGE_RE)?.[1] === stageId);
	return line?.match(/<!--\s*plan:([^>]*?)\s*-->/)?.[1]?.trim() ?? null;
}

async function setIssueState(root, number, state) {
	const { host } = detectRemote(root);
	if (host === "github") {
		gh(["issue", state === "closed" ? "close" : "reopen", String(number)], { cwd: root });
		return;
	}
	await giteeApi(root, "PATCH", `/issues/${number}`, { state });
}

async function getIssue(root, number) {
	const { host } = detectRemote(root);
	if (host === "github") {
		const json = gh(["issue", "view", String(number), "--json", "number,title,state,body,labels"], { cwd: root });
		return JSON.parse(json);
	}
	return giteeApi(root, "GET", `/issues/${number}`);
}

// ---------- 写回 todo.md ----------

function writeIssueRef(root, item, number) {
	const lines = readFileSync(join(root, "todo.md"), "utf-8").split(/\r?\n/);
	const base = lines[item.line].replace(/\s*\(#[^)]*\)\s*$/, "");
	lines[item.line] = base + ` (#${number})`;
	writeFileSync(join(root, "todo.md"), lines.join("\n"), "utf-8");
}

// ---------- 命令 ----------

async function main() {
	const root = findRoot();
	const [cmd, ...rest] = process.argv.slice(2);
	const flags = new Set(rest.filter((a) => a.startsWith("--")));
	const pos = rest.filter((a) => !a.startsWith("--"));
	const dryRun = flags.has("--dry-run");
	const stage = (() => {
		const i = rest.indexOf("--stage");
		return i >= 0 ? rest[i + 1] : null;
	})();

	const parsed = parseTodo(root);
	const { host, owner, repo } = detectRemote(root);
	console.log(`[issues] root=${root} host=${host} repo=${owner}/${repo}`);

	if (!cmd || cmd === "list") {
		const filter = (it) => !stage || it.stage === stage;
		const items = parsed.items.filter(filter);
		if (items.length === 0) console.log("（无匹配任务）");
		for (const it of items) {
			const mark = it.done ? "x" : it.state === "~" ? "~" : " ";
			console.log(`  [${mark}] ${it.id} [${it.stage}] ${it.desc}${it.issue ? `  → #${it.issue}` : "  → （未建 issue）"}`);
		}
		return;
	}

	if (cmd === "sync") {
		const targets = parsed.items.filter((it) => !it.done && it.issue === null && (!stage || it.stage === stage));
		if (targets.length === 0) {
			console.log("[issues] 所有待办任务都已有 issue（或无匹配）");
			return;
		}
		for (const it of targets) {
			if (dryRun) {
				console.log(`[dry-run] 将创建 issue: [${it.id}] ${it.desc}（labels: coordination,stage:${it.stage}）`);
				continue;
			}
			const num = await createIssue(root, it);
			writeIssueRef(root, it, num);
			it.issue = num;
			console.log(`[issues] ${it.id} → #${num} 已创建并回写`);
		}
		if (!dryRun) console.log("[issues] 同步完成。可 /go 调度对应阶段。");
		return;
	}

	if (cmd === "view") {
		const number = Number(pos[0]);
		if (!number) fail("用法: issues.js view <issue编号>");
		const json = await getIssue(root, number);
		console.log(JSON.stringify(json, null, 2));
		return;
	}

	if (cmd === "close" || cmd === "open") {
		const number = Number(pos[0]);
		if (!number) fail(`用法: issues.js ${cmd} <issue编号>`);
		await setIssueState(root, number, cmd === "close" ? "closed" : "open");
		console.log(`[issues] #${number} → ${cmd === "close" ? "closed" : "open"}`);
		return;
	}

	if (cmd === "close-done") {
		const targets = parsed.items.filter((it) => it.done && it.issue !== null);
		if (targets.length === 0) {
			console.log("[issues] 没有已完成且关联 issue 的任务");
			return;
		}
		for (const it of targets) {
			if (dryRun) {
				console.log(`[dry-run] 将关闭 #${it.issue}（${it.id}）`);
				continue;
			}
			await setIssueState(root, it.issue, "closed");
			console.log(`[issues] #${it.issue}（${it.id}）→ closed`);
		}
		return;
	}

	fail(`未知命令 ${cmd}。可用: sync | list | view | close | open | close-done [--stage sN] [--dry-run]`);
}

main().catch((e) => fail(e.message));
