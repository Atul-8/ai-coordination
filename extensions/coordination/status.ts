/**
 * status.ts — G1 开门自动化 + 状态看板
 *
 * 重构点 1：不再维护 WORKSTATE.md / LOG.md。
 * session_start 时由 pi 原生会话恢复上下文（/resume、/tree、PI_SESSION_FILE），
 * 本扩展只补充「项目态」信息：todo 进度、META 规则数、issue 关联。
 */

import { existsSync } from "node:fs";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import {
	countGlobalMetaRules,
	countMetaRules,
	findCoordDir,
	parseTodo,
	readAgentRegistry,
	stageStats,
} from "./lib.ts";
import { renderList } from "./todo.ts";

export function registerStatus(pi: ExtensionAPI): void {
	pi.on("session_start", async (_event, ctx) => {
		const paths = findCoordDir(ctx.cwd);
		if (!paths) return;

		const file = parseTodo(paths.todoPath);
		const stats = stageStats(file);
		const openTotal = file.items.filter((t) => !t.done).length;
		const metaCount = countMetaRules(paths.metaRulesPath);
		const sid = ctx.sessionManager.getSessionId();

		// 状态条
		ctx.ui.setStatus("coord", ctx.ui.theme.fg("accent", `ⓒ ${openTotal} 待办 · META ${metaCount}`));

		// 常驻小部件：阶段进度
		const lines = stats.map((s) => {
			const label = s.stage ? `${s.stage.id} ${s.stage.title.slice(0, 14)}` : "(未定义)";
			const total = s.open + s.doing + s.done;
			const bar = "█".repeat(s.done) + "░".repeat(Math.max(0, total - s.done));
			return `${label.padEnd(18, "　")} ${bar} ${s.done}/${total}`;
		});
		ctx.ui.setWidget("coord", lines.length > 0 ? lines : ["（todo.md 为空 —— /plan 开始）"]);

		// G1 提示（一次性通知，不打断）
		const doing = file.items.filter((t) => t.doing);
		const doingText = doing.length > 0 ? `，进行中：${doing.map((t) => t.id).join(", ")}` : "";
		ctx.ui.notify(
			[
				`[G1 开门] coordination 已激活 · session ${sid.slice(0, 8)}`,
				`任务：${openTotal} 待办${doingText} · META 规则 ${metaCount} 条`,
				openTotal > 0 ? "继续：/go 调度阶段 · /todo 看板 · /plan 新计划" : "开始：/pm 需求入口 · /plan 计划模式",
			].join("\n"),
			"info",
		);
	});

	pi.registerCommand("coord-status", {
		description: "coordination 全量状态（todo / plans / meta / session）",
		handler: (args, ctx) => runStatus(args, ctx),
	});
}

/** 全量状态看板（/coord-status、/eai status、/eai 组共用） */
export async function runStatus(_args: string, ctx: ExtensionCommandContext): Promise<void> {
	const paths = findCoordDir(ctx.cwd);
	if (!paths) {
		ctx.ui.notify("coordination 未激活：项目根缺少 .ai/ 目录", "warning");
		return;
	}
	const file = parseTodo(paths.todoPath);
	const metaCount = countMetaRules(paths.metaRulesPath);
	const structureOk = existsSync(paths.structurePath);
	const issuesScriptOk = existsSync(paths.issuesScript);

	const roles = readAgentRegistry();
	const sections = [
		`会话  ${ctx.sessionManager.getSessionId()}（${ctx.sessionManager.getSessionFile() ?? "?"}）`,
		`任务  ${renderList(file)}`,
		`META  项目规则 ${metaCount} 条（${paths.metaRulesPath}）\n      全局池 ${countGlobalMetaRules()} 条（AI_GLOBAL_DIR）`,
		`智能体  ${roles.length > 0 ? roles.map((r) => `${r.name}=${r.title}`).join(" / ") : "（未配置：全局池 agents/registry.json）"}`,
		`结构  STRUCTURE.md ${structureOk ? "✓" : "✗ 缺失"} · issues.js ${issuesScriptOk ? "✓" : "✗ 未部署"}`,
	];
	ctx.ui.notify(sections.join("\n\n"), "info");
}
