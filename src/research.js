/**
 * research.js — 方案检索记录（「不闭门造车」的门禁产物）
 *
 * 计划落盘前要求先记录外部方案检索：官方文档 / 开源仓库 / 已验证做法。
 * 记录写 `.ai/research/RESEARCH-NNN-<slug>.md`，计划文档引用它；纯文档类工作可显式 skip。
 */

import path from "node:path";
import * as L from "./lib.js";
import { createIo, findCoordDir } from "./project.js";

const DECISIONS = ["adopt", "adapt", "build", "reject"];

export async function recordResearch({ startDir, topic, sources, decision, notes, sessionId, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) throw new Error("coordination 未激活：缺少 .ai/ 目录。先 coord_init。");
	const io = createIo(policy);
	const cleanTopic = String(topic ?? "").trim();
	if (!cleanTopic) throw new Error("research 需要 topic（要解决的实现问题）。");
	const list = Array.isArray(sources) ? sources.map(String).map((entry) => entry.trim()).filter(Boolean) : [];
	if (list.length === 0) throw new Error("research 至少需要 1 条来源（URL / 仓库 / 文档）。没有来源说明还没检索。");
	for (const source of list) {
		if (!/^https?:\/\//i.test(source) && !/^[\w.-]+\/[\w.-]+$/.test(source)) {
			throw new Error(`来源格式不合法：${source}（给 URL，或 owner/repo）`);
		}
	}
	const normalized = DECISIONS.includes(decision) ? decision : "adapt";
	const dir = path.join(paths.aiDir, "research");
	const files = await io.list(dir);
	const max = files.reduce((acc, name) => {
		const match = String(name).match(/^RESEARCH-(\d+)/);
		return match ? Math.max(acc, Number(match[1])) : acc;
	}, 0);
	const id = `RESEARCH-${String(max + 1).padStart(3, "0")}`;
	const file = `${id}-${L.slugify(cleanTopic)}.md`;
	const content = [
		`# ${id} ${cleanTopic}`,
		"",
		`- **日期**: ${L.todayStr()}`,
		`- **会话**: ${sessionId ?? "unknown"}`,
		`- **决策**: ${normalized}（adopt=直接采用 / adapt=改造 / build=自研 / reject=不采用）`,
		"",
		"## 检索到的方案",
		"",
		...list.map((source) => `- ${source}`),
		"",
		"## 取舍与理由",
		"",
		notes?.trim() || "（为什么采用/不采用；与现有架构的冲突点）",
		"",
		"## 落地方式",
		"",
		normalized === "build" ? "自研（已确认无可用现成方案，记录原因）。" : "复用/改造上述方案，必要时在计划中标注改动点。",
		"",
	].join("\n");
	await io.write(path.join(dir, file), content);
	return { id, path: path.join(dir, file), file: `.ai/research/${file}`, decision: normalized, sources: list.length };
}

/** 计划落盘门禁：找到研究记录文件（按 id 前缀），返回相对路径或 null。 */
export async function findResearchRef(io, paths, research) {
	const needle = String(research ?? "").trim();
	if (!needle) return null;
	const files = await io.list(path.join(paths.aiDir, "research"));
	const match = files.find((name) => name.startsWith(needle) && name.endsWith(".md"));
	if (!match) throw new Error(`找不到研究记录 ${needle}（.ai/research/）。先 coord_research 记录，或检查编号。`);
	return `.ai/research/${match}`;
}