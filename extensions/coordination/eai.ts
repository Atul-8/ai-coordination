/**
 * eai.ts — /eai 组命令 + /eai-* 平面别名（命名统一层）
 *
 * 设计原则：
 * - 本包命令统一提供 eai 前缀形态；原生命令（/pm /plan /todo /go /issue
 *   /error /meta /status /coord-status /coord-init /aic-init-project）全部保留，
 *   eai 形态只是到同一实现的映射，不是替代。
 * - /eai 是组命令：`/eai <子命令> [参数] [-flags]`，支持 gcc 风格参数叠加，
 *   如：/eai issue sync -s s1 --dry-run、/eai issue -n。
 * - prompt 模板类子命令经 pi.sendUserMessage({ expandPromptTemplates: true })
 *   转发到原生命令——模板仍是唯一事实源，零复制。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { findCoordDir, parseTodo } from "./lib.ts";
import { runInit } from "./init-command.ts";
import { runTodo } from "./todo.ts";
import { runGo } from "./go.ts";
import { runStatus } from "./status.ts";
import { togglePlanModeForEai } from "./plan.ts";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const promptsDir = join(pkgRoot, "prompts");
const issuesScript = join(pkgRoot, "scripts", "issues.js");

const SUBS = ["init", "plan", "todo", "go", "status", "report", "pm", "issue", "error", "meta", "help"];

const USAGE = [
	"/eai <子命令> [参数] [-flags]   —— gcc 风格参数叠加",
	"",
	"  init [项目根]    初始化 coordination 层（幂等）",
	"  plan             切换计划模式（= /plan，Ctrl+Alt+P）",
	"  todo             任务看板（= /todo）",
	"  go [sN|T-NNN]    阶段/任务调度（= /go）",
	"  status           快速状态（= /coord-status）",
	"  report [重点]    AI 状态报告（= /status）",
	"  pm <需求>        需求入口（= /pm）",
	"  issue [sync|list|view|close|open|close-done] [-s <stage>] [-n|--dry-run]",
	"                   裸 /eai issue [描述] → 转发 /issue 提示词（由 AI 执行）",
	"  error <描述>     五步错误提炼（= /error）",
	"  meta <操作>      META 规则管理（= /meta）",
	"  help             本帮助",
].join("\n");

/** 解析 gcc 风格参数：--long[=v]、-s v、叠加布尔 -abc、引号词组 */
function parseEaiArgs(input: string): { pos: string[]; opts: Record<string, string | boolean> } {
	const pos: string[] = [];
	const opts: Record<string, string | boolean> = {};
	const tokens = input.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
	const SHORT: Record<string, string> = { s: "stage", n: "dry-run", d: "dry-run" };
	for (let i = 0; i < tokens.length; i++) {
		const t = tokens[i];
		if (t.startsWith("--") && t.length > 2) {
			const eq = t.indexOf("=");
			if (eq > 2) {
				opts[t.slice(2, eq)] = t.slice(eq + 1).replace(/^"|"$/g, "");
			} else {
				const next = tokens[i + 1];
				if (next !== undefined && !next.startsWith("-")) {
					opts[t.slice(2)] = next;
					i++;
				} else opts[t.slice(2)] = true;
			}
		} else if (t.startsWith("-") && t.length > 1) {
			const body = t.slice(1);
			if (body.length > 1 && !SHORT[body]) {
				for (const ch of body) opts[ch] = true; // 叠加布尔：-abc
			} else {
				const key = SHORT[body] ?? body;
				const next = tokens[i + 1];
				if (next !== undefined && !next.startsWith("-")) {
					opts[key] = next;
					i++;
				} else opts[key] = true;
			}
		} else {
			pos.push(t.replace(/^"|"$/g, ""));
		}
	}
	return { pos, opts };
}

/**
 * 转发到原生命令：读 prompts/<cmd>.md 原文（去 front-matter、替换 $ARGUMENTS）后
 * 直接 sendUserMessage。不使用 expandPromptTemplates 嵌套 dispatch——
 * 实测在 -p 无头模式下会触发部分扩展（如 pi-goal）的 stale-ctx 误报，
 * 且读文件转发保证模板仍是唯一事实源（零复制）。
 */
function forward(pi: ExtensionAPI, cmd: string, args: string): void {
	let text: string | null = null;
	try {
		text = readFileSync(join(promptsDir, `${cmd}.md`), "utf-8");
	} catch {
		/* 模板缺失 → 退化为直发命令（TUI 内可用） */
	}
	const body = text.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
	pi.sendUserMessage(body.replace(/\$ARGUMENTS/g, args ?? ""));
}

/** issue 子命令：带子命令/旗标 → 本地直接执行包内 issues.js；裸用 → 转发 /issue 提示词 */
function runIssue(
	pi: ExtensionAPI,
	pos: string[],
	opts: Record<string, string | boolean>,
	ctx: ExtensionCommandContext,
): void {
	const SCRIPT_SUBS = new Set(["sync", "list", "view", "close", "open", "close-done"]);
	const explicit = pos.length > 0 && SCRIPT_SUBS.has(pos[0].toLowerCase());
	const hasFlags = Object.keys(opts).length > 0;
	if (!explicit && !hasFlags) {
		forward(pi, "issue", pos.join(" "));
		return;
	}
	if (!existsSync(issuesScript)) {
		ctx.ui.notify(`未找到包内 issues.js：${issuesScript}`, "error");
		return;
	}
	const dryRun = opts["dry-run"] === true || opts.d === true || opts.n === true;
	let cmd = "list";
	if (explicit) cmd = pos[0].toLowerCase();
	else if (dryRun) cmd = "sync";
	const argv = [cmd];
	const stage = opts.stage ?? opts.s;
	if (typeof stage === "string" && /^s\d+$/i.test(stage)) argv.push("--stage", stage);
	if (dryRun) argv.push("--dry-run");
	try {
		const out = execFileSync(process.execPath, [issuesScript, ...argv], {
			encoding: "utf-8",
			cwd: ctx.cwd,
			timeout: 120_000,
		});
		ctx.ui.notify(`[issues.js ${argv.join(" ")}]\n${out.trim() || "(无输出)"}`, "info");
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`issues.js ${cmd} 失败：${msg}\n（提示：需 git remote 与 GITEE_TOKEN；试运行加 -n）`, "error");
	}
}

/** 组命令补全：子命令名；go 子命令下补全阶段/任务（尽力而为） */
async function eaiCompletions(prefix: string) {
	try {
		const parts = prefix.split(/\s+/);
		const sub = (parts[0] ?? "").toLowerCase();
		if (!sub) {
			const items = SUBS.map((s) => ({ value: s, label: s }));
			return items;
		}
		if (sub !== "go") return null;
		const rest = parts.slice(1).join(" ").toLowerCase();
		const paths = findCoordDir(process.cwd());
		if (!paths) return null;
		const todo = parseTodo(paths.todoPath);
		const items = [
			...todo.stages.map((s) => ({ value: s.id, label: s.id, description: s.title })),
			...todo.items
				.filter((t) => !t.done)
				.map((t) => ({ value: t.id, label: t.id, description: t.desc.slice(0, 40) })),
		].filter((i) => i.value.toLowerCase().startsWith(rest));
		return items.length > 0 ? items : null;
	} catch {
		return null;
	}
}

/** /eai 组命令路由 */
async function runEaiGroup(raw: string, ctx: ExtensionCommandContext, pi: ExtensionAPI): Promise<void> {
	const { pos, opts } = parseEaiArgs(raw);
	const sub = (pos.shift() ?? "").toLowerCase();
	switch (sub) {
		case "":
		case "help":
		case "h":
			ctx.ui.notify(USAGE, "info");
			return;
		case "init":
			await runInit(pos.join(" "), ctx);
			return;
		case "plan":
			try {
				togglePlanModeForEai(ctx);
			} catch (err) {
				ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
			}
			return;
		case "todo":
		case "board":
			await runTodo(pos.join(" "), ctx);
			return;
		case "go":
			await runGo(pi, pos.join(" "), ctx);
			return;
		case "status":
			await runStatus("", ctx);
			return;
		case "report":
			forward(pi, "status", pos.join(" "));
			return;
		case "pm":
			forward(pi, "pm", pos.join(" "));
			return;
		case "issue":
			runIssue(pi, pos, opts, ctx);
			return;
		case "error":
			forward(pi, "error", pos.join(" "));
			return;
		case "meta":
			forward(pi, "meta", pos.join(" "));
			return;
		default:
			ctx.ui.notify(`未知子命令：${sub}\n\n${USAGE}`, "warning");
	}
}

export function registerEai(pi: ExtensionAPI): void {
	pi.registerCommand("eai", {
		description: "eai 组命令（/eai help 查看子命令；gcc 风格旗标）",
		getArgumentCompletions: eaiCompletions,
		handler: async (args, ctx) => runEaiGroup(args, ctx, pi),
	});

	// 平面别名：与原生命令一一映射（原生命令全部保留）
	pi.registerCommand("eai-init", {
		description: "初始化 coordination 层（= /coord-init）",
		handler: (args, ctx) => runInit(args, ctx),
	});
	pi.registerCommand("eai-plan", {
		description: "切换计划模式（= /plan）",
		handler: async (_args, ctx) => {
			try {
				togglePlanModeForEai(ctx);
			} catch (err) {
				ctx.ui.notify(err instanceof Error ? err.message : String(err), "error");
			}
		},
	});
	pi.registerCommand("eai-todo", {
		description: "任务看板（= /todo）",
		handler: (args, ctx) => runTodo(args, ctx),
	});
	pi.registerCommand("eai-go", {
		description: "阶段/任务调度（= /go）",
		handler: (args, ctx) => runGo(pi, args, ctx),
	});
	// 注：prompt 模板类别名（/eai-pm /eai-issue /eai-error /eai-meta /eai-status）
	// 由 prompts/eai-*.md 原生模板提供（scripts/sync-eai-prompts.mjs 从源模板同步），
	// 全环境可靠；不在此注册扩展命令以免重名冲突。
}
