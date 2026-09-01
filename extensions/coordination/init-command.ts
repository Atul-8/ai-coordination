/**
 * init-command.ts — /coord-init（别名 /aic-init-project）
 *
 * 在 pi 会话内一键初始化项目 coordination 层：
 * 直接运行包内 scripts/init-project.js（默认目标 = 当前项目根 ctx.cwd）。
 * 免去手敲 node + 安装路径的麻烦；脚本是幂等的，重复执行安全。
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

/** 包根目录（本文件位于 <pkg>/extensions/coordination/） */
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const initScript = join(pkgRoot, "scripts", "init-project.js");

/** 手动兜底命令文案（按 shell 区分变量展开语法） */
function manualHint(root: string): string {
	return [
		"可改为在终端手动初始化（末尾参数为目标项目，`.` = 当前目录）：",
		"",
		`  PowerShell:   node "$env:USERPROFILE\\.pi\\agent\\git\\github.com\\Atul-8\\ai-coordination\\scripts\\init-project.js" ${root}`,
		`  CMD:          node "%USERPROFILE%\\.pi\\agent\\git\\github.com\\Atul-8\\ai-coordination\\scripts\\init-project.js" ${root}`,
		`  Bash/类 Unix: node ~/.pi/agent/git/github.com/Atul-8/ai-coordination/scripts/init-project.js ${root}`,
		"",
		"注意：%USERPROFILE% 仅在 CMD 生效；PowerShell 必须用 $env:USERPROFILE。",
	].join("\n");
}

export async function runInit(args: string, ctx: ExtensionCommandContext): Promise<void> {
	const root = args.trim() || ctx.cwd;
	if (!existsSync(initScript)) {
		ctx.ui.notify(`未找到包内 init-project.js：${initScript}（安装可能不完整，请 pi update --extensions 或重装）`, "error");
		return;
	}
	ctx.ui.notify(`🚀 正在初始化 coordination 层：${root}`, "info");
	try {
		const out = execFileSync(process.execPath, [initScript, root], {
			encoding: "utf-8",
			timeout: 60_000,
		});
		ctx.ui.notify(out.trim(), "info");
		ctx.ui.notify(
			"✅ 完成。流水线：/pm 需求入口 → /plan 计划 → /issue 同步 → /go <stage> 调度。\n提示：task 行仅经 coord_todo 工具维护；阶段定义可在 todo.md 手工编辑。",
			"info",
		);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		ctx.ui.notify(`初始化失败：${msg}\n\n${manualHint(root)}`, "error");
	}
}

export function registerInitCommand(pi: ExtensionAPI): void {
	pi.registerCommand("coord-init", {
		description: "初始化项目 coordination 层（运行包内 init-project.js，幂等）",
		handler: (args, ctx) => runInit(args, ctx),
	});

	pi.registerCommand("aic-init-project", {
		description: "初始化项目 coordination 层（/coord-init 的别名）",
		handler: (args, ctx) => runInit(args, ctx),
	});
}
