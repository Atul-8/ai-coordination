/**
 * global-agents.mjs — ZCode 全局指令（~/.zcode/AGENTS.md）幂等部署器
 *
 * 把「全局思维架构」（templates/global/agents-zcode.md，pi 版全局 AGENTS.md 的同构移植）
 * 部署到宿主全局指令位。ZCode 原生先注入 ~/.zcode/AGENTS.md、后注入项目 AGENTS.md，
 * 全局纪律因此对所有项目生效（pi 版对应物：~/.pi/agent/AGENTS.md）。
 *
 * 幂等策略（与项目 AGENTS.md 插桩一致）：
 *   - 文件不存在 → 整文件写入（带标记包裹）
 *   - 已含标记块 → 内容相同则跳过；不同则原位替换标记块（块外用户内容保留）
 *   - 有文件无标记 → 标记块前置合并（用户内容原样保留在后）
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const GLOBAL_AGENTS_MARKER_BEGIN = "<!-- ai-coordination:global-agents:v1 BEGIN -->";
export const GLOBAL_AGENTS_MARKER_END = "<!-- ai-coordination:global-agents:v1 END -->";

/** 默认 ZCode 配置根（全局指令所在目录） */
export function zcodeConfigDir() {
	return process.env.ZCODE_CONFIG_DIR ?? join(homedir(), ".zcode");
}

/**
 * 部署全局指令。
 * @returns {{ action: "created"|"updated"|"current"|"wrapped", path: string }}
 */
export function deployGlobalAgents({ zcodeDir = zcodeConfigDir(), templateContent }) {
	const target = join(zcodeDir, "AGENTS.md");
	const wrapped = `${GLOBAL_AGENTS_MARKER_BEGIN}\n${templateContent.trimEnd()}\n${GLOBAL_AGENTS_MARKER_END}\n`;

	if (!existsSync(target)) {
		writeFileSync(target, wrapped, "utf-8");
		return { action: "created", path: target };
	}

	const existing = readFileSync(target, "utf-8");
	const beginIdx = existing.indexOf(GLOBAL_AGENTS_MARKER_BEGIN);
	if (beginIdx >= 0) {
		const endIdx = existing.indexOf(GLOBAL_AGENTS_MARKER_END);
		// 标记之间 exclusive 取内容（两侧标记与各自相邻换行都不计入）
		const inner = existing
			.slice(beginIdx + GLOBAL_AGENTS_MARKER_BEGIN.length, endIdx)
			.replace(/^\r?\n/, "")
			.replace(/\r?\n$/, "");
		if (inner === templateContent.trimEnd()) {
			return { action: "current", path: target };
		}
		writeFileSync(
			target,
			existing.slice(0, beginIdx) + wrapped + existing.slice(endIdx + GLOBAL_AGENTS_MARKER_END.length),
			"utf-8",
		);
		return { action: "updated", path: target };
	}

	writeFileSync(target, `${wrapped}\n${existing}`, "utf-8");
	return { action: "wrapped", path: target };
}
