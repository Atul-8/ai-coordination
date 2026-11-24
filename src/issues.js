/**
 * issues.js — todo.md ↔ git issues 同步（GitHub gh CLI / Gitee OpenAPI v5）
 *
 * 与脚本 .ai/scripts/issues.js 行为一致；工具层直接调用本模块，避免每次派生 node 子进程。
 * 认证：GitHub 需 `gh auth login`；Gitee 需环境变量 GITEE_TOKEN。
 */

import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as L from "./lib.js";
import { loadTodo, saveTodo } from "./project.js";

const run = promisify(execFile);

async function gitRemote(root) {
	try {
		const { stdout } = await run("git", ["-C", root, "remote", "get-url", "origin"], { encoding: "utf8" });
		return stdout.trim();
	} catch {
		throw new Error("git remote origin 未配置，无法同步 issues。");
	}
}

export async function detectRemote(root) {
	return L.parseRemoteUrl(await gitRemote(root));
}

async function gh(args, cwd) {
	try {
		const { stdout } = await run("gh", args, { cwd, encoding: "utf8" });
		return stdout.trim();
	} catch (error) {
		if (error?.code === "ENOENT") throw new Error("gh CLI 不可用：请先安装 GitHub CLI 并 `gh auth login`。");
		throw new Error(`gh 调用失败：${String(error?.stderr ?? error?.message ?? error).trim()}`);
	}
}

function giteeToken() {
	const token = process.env.GITEE_TOKEN;
	if (!token) throw new Error("Gitee 同步需要环境变量 GITEE_TOKEN（私人令牌，repo 权限）。");
	return token;
}

async function giteeApi(remote, method, route, body) {
	const token = giteeToken();
	const suffix = method === "GET" ? `${route}${route.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}` : route;
	const response = await fetch(`https://gitee.com/api/v5/repos/${remote.owner}/${remote.repo}${suffix}`, {
		method,
		headers: { "Content-Type": "application/json" },
		body: body ? JSON.stringify({ access_token: token, ...body }) : undefined,
	});
	if (!response.ok) {
		throw new Error(`Gitee API ${method} ${route} → ${response.status} ${await response.text().catch(() => "")}`);
	}
	return response.json();
}

function stagePlanRef(todoFile, stageId) {
	return todoFile.stages.find((stage) => stage.id === stageId)?.plan ?? null;
}

function issueBody(todoFile, item) {
	const stageTitle = todoFile.stages.find((stage) => stage.id === item.stage)?.title ?? "";
	return [
		"来自 dsh-eai-workflow todo.md 的任务项。",
		"",
		`- 任务编号: ${item.id}`,
		`- 阶段: ${item.stage}（${stageTitle}）`,
		`- 阶段计划: ${stagePlanRef(todoFile, item.stage) ?? "（无）"}`,
		"- 状态: 待办（todo.md 单一事实源）",
		"",
		`> 调度：项目内 /eai-go ${item.stage}；完成由 eai_issue close-done 自动关闭。`,
	].join("\n");
}

async function createIssue(remote, cwd, todoFile, item) {
	const title = `[${item.id}] ${item.desc}`;
	const labels = ["coordination", `stage:${item.stage}`];
	const body = issueBody(todoFile, item);
	if (remote.host === "github") {
		const out = await gh(["issue", "create", "--title", title, "--body", body, "--label", labels.join(",")], cwd);
		const number = out.match(/\/issues\/(\d+)/)?.[1];
		if (!number) throw new Error(`gh issue create 输出无法解析：${out}`);
		return Number(number);
	}
	const created = await giteeApi(remote, "POST", "/issues", { title, body, labels: labels.join(",") });
	return created.number;
}

async function setIssueState(remote, cwd, number, state) {
	if (remote.host === "github") {
		await gh(["issue", state === "closed" ? "close" : "reopen", String(number)], cwd);
		return;
	}
	await giteeApi(remote, "PATCH", `/issues/${number}`, { state });
}

async function getIssue(remote, cwd, number) {
	if (remote.host === "github") {
		const json = await gh(["issue", "view", String(number), "--json", "number,title,state,body,labels"], cwd);
		return JSON.parse(json);
	}
	return giteeApi(remote, "GET", `/issues/${number}`);
}

/**
 * @param {{startDir:string, action:string, stage?:string, dryRun?:boolean, number?:number, policy:any}} input
 */
export async function runIssueTool({ startDir, action, stage, dryRun, number, policy }) {
	const ACTIONS = ["sync", "list", "close-done", "view", "close", "open"];
	if (!ACTIONS.includes(action)) throw new Error(`未知 action ${action}。可选：${ACTIONS.join(" | ")}`);
	if (["view", "close", "open"].includes(action)) {
		if (!Number.isInteger(number) || number < 1) throw new Error(`${action} 需要 number（>=1 的整数）。`);
	}
	const { paths, file, io } = await loadTodo(startDir, policy);
	const cwd = paths.root;
	let remote = null;
	if (action === "list") {
		try {
			remote = await detectRemote(cwd);
		} catch {
			remote = null; // list 是本地视图，不应该被 remote 缺失阻断
		}
	} else {
		remote = await detectRemote(cwd);
	}
	const head = remote
		? `root=${cwd} host=${remote.host} repo=${remote.owner}/${remote.repo}`
		: `root=${cwd} remote=（未配置；list 仍可用）`;
	const stageFilter = (item) => !stage || item.stage === stage;

	if (action === "list" || action === "sync") {
		if (action === "list") {
			const items = file.items.filter(stageFilter);
			const lines = items.map((item) => {
				const mark = item.done ? "x" : item.doing ? "~" : " ";
				return `  [${mark}] ${item.id} [${item.stage}] ${item.desc}${item.issue ? `  → #${item.issue}` : "  → （未建 issue）"}`;
			});
			return { host: remote?.host ?? "", repo: remote ? `${remote.owner}/${remote.repo}` : "", text: [head, ...(lines.length ? lines : ["（无匹配任务）"])].join("\n") };
		}

		const targets = file.items.filter((item) => !item.done && item.issue === undefined && stageFilter(item));
		if (targets.length === 0) {
			return { host: remote.host, repo: `${remote.owner}/${remote.repo}`, text: `${head}\n所有待办任务都已有 issue（或无匹配）。` };
		}
		const lines = [];
		for (const item of targets) {
			if (dryRun) {
				lines.push(`[dry-run] 将创建：${item.id} ${item.desc}（labels: coordination,stage:${item.stage}）`);
				continue;
			}
			const created = await createIssue(remote, cwd, file, item);
			L.updateItem(file, item.id, { issue: created });
			item.issue = created;
			await saveTodo(paths, file, io); // 逐个持久化：中途失败不丢已创建编号
			lines.push(`${item.id} → #${created} 已创建并回写 todo.md`);
		}
		if (!dryRun) await saveTodo(paths, file, io);
		return { host: remote.host, repo: `${remote.owner}/${remote.repo}`, text: [head, ...lines, dryRun ? "（dry-run：未写入）" : "同步完成。可 /eai-go <stage> 调度。"].join("\n") };
	}

	if (action === "close-done") {
		const targets = file.items.filter((item) => item.done && item.issue !== undefined);
		if (targets.length === 0) return { host: remote.host, text: `${head}\n没有已完成且关联 issue 的任务。` };
		const lines = [];
		for (const item of targets) {
			if (dryRun) {
				lines.push(`[dry-run] 将关闭 #${item.issue}（${item.id}）`);
				continue;
			}
			await setIssueState(remote, cwd, item.issue, "closed");
			lines.push(`#${item.issue}（${item.id}）→ closed`);
		}
		return { host: remote.host, text: [head, ...lines].join("\n") };
	}

	if (action === "view") {
		if (!number) throw new Error("view 需要 number（issue 编号）。");
		const json = await getIssue(remote, cwd, number);
		return { host: remote.host, text: `${head}\n${JSON.stringify(json, null, 2)}` };
	}

	if (action === "close" || action === "open") {
		if (!number) throw new Error(`${action} 需要 number（issue 编号）。`);
		await setIssueState(remote, cwd, number, action === "close" ? "closed" : "open");
		return { host: remote.host, text: `${head}\n#${number} → ${action === "close" ? "closed" : "open"}` };
	}

	throw new Error(`未知 action ${action}。可选：sync | list | close-done | view | close | open`);
}