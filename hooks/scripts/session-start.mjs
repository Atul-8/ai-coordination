#!/usr/bin/env node
/**
 * session-start.mjs — G1 开门自动化（自 pi 版 status.ts session_start 移植为 zcode hook）
 *
 * SessionStart 事件（startup/resume/clear/compact）触发：
 *   - 项目未激活（无 .ai/）→ 静默退出，不注入任何内容
 *   - 激活 → 读 todo.md + META 计数，以 additionalContext 注入 G1 提示：
 *     阶段进度 / 进行中任务 / 续作建议 / 命令入口
 *
 * stdin：hook JSON（session_id 等）；环境：CLAUDE_PROJECT_DIR / CLAUDE_SESSION_ID 由 zcode 注入。
 * stdout：严格 JSON（仅 zcode hook schema 顶层键），多余键会校验失败。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { findCoordDir, parseTodo, stageStats, countMetaRules, countGlobalMetaRules, readAgentRegistry, shortSessionId } from "../../mcp/todo-store.mjs";

/** 检测未消化交接卡（跨宿主接力）：.ai/HANDOFF.md 状态 open → 返回摘要行；无卡/已消化 → null */
function detectOpenHandoff(paths) {
	const handoffPath = join(paths.aiDir, "HANDOFF.md");
	if (!existsSync(handoffPath)) return null;
	try {
		const text = readFileSync(handoffPath, "utf-8");
		if (!/^\s*[-*]?\s*状态:\s*open\s*$/m.test(text)) return null;
		const from = text.match(/^\s*[-*]?\s*交出方:\s*(.+)$/m)?.[1]?.trim() ?? "未知来源";
		const task = text.match(/^\s*[-*]?\s*任务:\s*(.+)$/m)?.[1]?.trim() ?? "?";
		return { from, task, path: handoffPath };
	} catch {
		return null;
	}
}

async function readStdin() {
	if (process.stdin.isTTY) return "";
	let raw = "";
	for await (const chunk of process.stdin) raw += chunk;
	return raw;
}

function buildG1Context({ paths, sessionId }) {
	const file = parseTodo(paths.todoPath);
	const stats = stageStats(file);
	const openTotal = file.items.filter((t) => !t.done).length;
	const doing = file.items.filter((t) => t.doing);
	const metaCount = countMetaRules(paths.metaRulesPath);
	const globalMeta = countGlobalMetaRules();
	const roles = readAgentRegistry();
	const sid = shortSessionId(sessionId);

	const lines = [];
	lines.push(`[G1 开门] ai-coordination 已激活${sid ? ` · session ${sid}` : ""}`);
	lines.push(
		`任务进度：${stats.map((s) => `${s.stage?.id ?? "?"} ${s.done}/${s.open + s.doing + s.done}`).join(" · ") || "todo.md 为空"}` +
			` · 待办 ${openTotal}${doing.length > 0 ? `，进行中：${doing.map((t) => t.id).join(", ")}` : ""}`,
	);
	lines.push(`META 规则：项目 ${metaCount} 条 · 全局池 ${globalMeta} 条（干活前先读 .ai/errors/distilled/meta-rules.md 参与决策）`);
	if (roles.length > 0) lines.push(`派发角色：${roles.map((r) => `${r.name}=${r.title}`).join(" / ")}`);
	const handoff = detectOpenHandoff(paths);
	if (handoff) {
		lines.push(
			`⚠️ 未消化交接卡（${handoff.path}，来自 ${handoff.from}，任务 ${handoff.task}）——` +
				"跨宿主接力：先读卡并跑卡上「验证」命令，再按「下一步」续作；接手完成用 /handoff done 消化（状态改 resumed + coord_todo link 重绑会话）",
		);
	}
	lines.push(
		openTotal > 0
			? "续作建议：有 `~` 进行中任务优先续作；/go <阶段|T-NNN> 调度 · /coord-status 全量状态 · /plan 新计划"
			: "开始：/pm 需求入口（G0 路由）· /plan 计划模式",
	);
	return lines.join("\n");
}

async function main() {
	const raw = await readStdin();
	let hookInput = {};
	try {
		hookInput = raw.trim() ? JSON.parse(raw) : {};
	} catch {
		// stdin 非法不影响：cwd/session 走环境变量
	}

	const cwd = process.env.CLAUDE_PROJECT_DIR || process.env.COORD_PROJECT_DIR || process.cwd();
	const sessionId = process.env.CLAUDE_SESSION_ID || hookInput.session_id;

	const paths = findCoordDir(cwd);
	if (!paths) {
		process.exit(0); // 未激活：静默
	}

	const context = buildG1Context({ paths, sessionId });
	process.stdout.write(JSON.stringify({ additionalContext: context }));
	process.exit(0);
}

main().catch((err) => {
	process.stderr.write(`[coord-g1] ${err?.stack || err}\n`);
	process.exit(0); // hook 失败不阻塞会话
});
