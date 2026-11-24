/**
 * recall.js — 旧经验检索（G3 自纠正 + 自我使用旧有经验）
 *
 * 在写新 ERR / 开工前，用关键词召回已沉淀的经验：
 *   - .ai/errors/raw/ERR-*.md（现象/根因/修复）
 *   - 项目 META（.ai/errors/distilled/meta-rules.md）
 *   - 全局 META（AI_GLOBAL_DIR/meta/distilled/meta-rules.md）
 *   - 角色记忆（AI_GLOBAL_DIR/agents/memory/）
 *
 * 排序用关键词重合度（与角色卡池一致的分词规则），不引入向量检索。
 */

import path from "node:path";
import * as P from "./pool.js";
import * as L from "./lib.js";
import { createIo, findCoordDir, globalMetaRulesPath, listMetaRules } from "./project.js";
import { listAgentMemory } from "./agents.js";

function score(text, tokens) {
	const set = new Set(P.tokenize(text));
	let count = 0;
	for (const token of tokens) if (set.has(token)) count++;
	return count;
}

function firstLine(text, fallback) {
	const lines = String(text ?? "").split(/\r?\n/);
	const heading = lines.find((line) => /^#\s+\S/.test(line));
	const picked = heading ?? lines.find((line) => line.trim() && !line.startsWith("#"));
	return (picked ?? fallback ?? "").replace(/^#\s*/, "").trim().slice(0, 120);
}

/**
 * @param {{startDir:string, query:string, limit?:number, policy?:any}} options
 */
export async function recallExperience({ startDir, query, limit = 5, policy }) {
	const paths = findCoordDir(startDir);
	if (!paths) throw new Error("coordination 未激活：缺少 .ai/ 目录，无法检索旧经验。");
	const io = createIo(policy);
	const tokens = P.tokenize(query);
	if (tokens.length === 0) throw new Error("query 不能为空。");
	const items = [];

	// 1. ERR 卡
	for (const file of (await io.list(paths.errorsRawDir)).filter((name) => /^ERR-\d+\.md$/.test(name))) {
		const raw = await io.read(path.join(paths.errorsRawDir, file));
		if (!raw) continue;
		const id = file.replace(/\.md$/, "");
		const rawLines = raw.split(/\r?\n/);
		const symptom = rawLines.find((line) => /^##\s*1\.\s*现象/.test(line)) ? rawLines.slice(rawLines.findIndex((line) => /^##\s*1\.\s*现象/.test(line)) + 1).find((line) => line.trim()) ?? "" : "";
		items.push({
			kind: "ERR",
			id,
			title: firstLine(raw, id),
			score: score(raw, tokens),
			path: path.join(paths.errorsRawDir, file),
			snippet: symptom.slice(0, 100),
		});
	}

	// 2. 项目 / 全局 META
	const projectMeta = (await io.read(paths.metaRulesPath)) ?? "";
	for (const rule of listMetaRules(projectMeta)) {
		items.push({
			kind: "META(项目)",
			id: rule.id,
			title: rule.title,
			score: score(`${rule.title} ${rule.body}`, tokens),
			path: paths.metaRulesPath,
			snippet: rule.body.split(/\r?\n/).find((line) => line.startsWith("- **规则**")) ?? "",
		});
	}
	const globalMeta = (await io.read(globalMetaRulesPath())) ?? "";
	for (const rule of listMetaRules(globalMeta)) {
		items.push({
			kind: "META(全局)",
			id: rule.id,
			title: rule.title,
			score: score(`${rule.title} ${rule.body}`, tokens),
			path: globalMetaRulesPath(),
			snippet: rule.body.split(/\r?\n/).find((line) => line.startsWith("- **规则**")) ?? "",
		});
	}

	// 3. 角色记忆
	for (const memory of await listAgentMemory(io)) {
		items.push({
			kind: `memory/${memory.owner}`,
			id: memory.id,
			title: memory.summary ?? memory.id,
			score: 2 * score((memory.keywords ?? []).join(" "), tokens) + score(`${memory.summary ?? ""} ${(memory.domains ?? []).join(" ")}`, tokens),
			path: memory.file,
			snippet: memory.type ? `type=${memory.type}` : "",
		});
	}

	const matches = items.filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
	return { query, tokens, matches, total: items.length };
}

export function renderRecall(result) {
	const lines = [`旧经验检索：${result.query}（扫描 ${result.total} 条）`, ""];
	if (result.matches.length === 0) {
		lines.push("未命中旧经验。首次遇到：按 G3 五步法记录，事后沉淀 META / 角色记忆。");
		return lines.join("\n");
	}
	for (const match of result.matches) {
		lines.push(`${String(match.score).padStart(4)}  [${match.kind}] ${match.id} — ${match.title}`);
		if (match.snippet) lines.push(`      ${match.snippet}`);
	}
	lines.push("", "用法：先对照旧经验再动手；同根因第二次出现 → 停止修复，升级 REQ 卡。");
	return lines.join("\n");
}