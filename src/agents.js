/**
 * agents.js — RAG 角色卡池 I/O：检索 / 建卡 / 自升级 / 记忆沉淀 / 派发矩阵
 *
 * 数据在全局池 `AI_GLOBAL_DIR/agents/`（默认 `C:\.ai_global\agents`）：
 *   pool/*.md           角色卡（schema v2）
 *   taxonomy.yml        受控标签 DAG
 *   memory/<id>/*.md    每角色专属经验
 *   agents-index.json   原生态的生成物；本实现直接扫文件，不依赖索引
 *
 * 设计纪律（rag-pool-redesign.md）：检索三档、未命中建卡、只改自己的卡、scope 不符可退单。
 */

import path from "node:path";
import { createIo, globalAgentsDir } from "./project.js";
import * as P from "./pool.js";
import * as L from "./lib.js";

export function poolPaths() {
	const root = globalAgentsDir();
	return {
		root,
		poolDir: path.join(root, "pool"),
		memoryDir: path.join(root, "memory"),
		taxonomyPath: path.join(root, "taxonomy.yml"),
		indexPath: path.join(root, "agents-index.json"),
	};
}

async function loadTaxonomy(io, paths) {
	const raw = (await io.read(paths.taxonomyPath)) ?? "";
	return P.parseTaxonomy(raw);
}

async function loadCards(io, paths) {
	const files = (await io.list(paths.poolDir)).filter((name) => name.endsWith(".md"));
	const cards = [];
	for (const file of files) {
		const raw = await io.read(path.join(paths.poolDir, file));
		if (!raw) continue;
		const frontMatter = P.parseFrontMatter(raw);
		if (!frontMatter) continue;
		cards.push({ ...frontMatter, __file: file });
	}
	return cards;
}

async function loadMemory(io, paths) {
	const entries = [];
	const owners = (await io.list(paths.memoryDir)).filter((name) => !name.startsWith("."));
	for (const owner of owners) {
		const dir = path.join(paths.memoryDir, owner);
		const files = (await io.list(dir)).filter((name) => name.endsWith(".md") && name !== "MEMORY.md");
		for (const file of files) {
			const raw = await io.read(path.join(dir, file));
			if (!raw) continue;
			const mapped = P.mapMemory(P.parseFrontMatter(raw), owner, `memory/${owner}/${file}`);
			if (mapped) entries.push(mapped);
		}
	}
	return entries;
}

/**
 * 检索三档：强命中 / 弱命中 / 缺口（topScore < threshold）。
 * @returns {Promise<{query:string,tokens:string[],threshold:number,topScore:number,suggestCreate:boolean,cards:any[],memory:any[]}>}
 */
export async function queryAgentPool(io, task, { limit = 5, threshold = 3 } = {}) {
	const paths = poolPaths();
	const [taxonomy, cards, memory] = await Promise.all([loadTaxonomy(io, paths), loadCards(io, paths), loadMemory(io, paths)]);
	const query = String(task ?? "").trim();
	const tokens = P.tokenize(query);
	const scoredCards = cards
		.filter((card) => card.status !== "deprecated")
		.map((card) => ({
			id: card.id,
			name: card.name,
			type: card.type,
			summary: card.summary,
			taxonomy: card.taxonomy,
			keywords: card.keywords,
			scope: card.scope,
			first_mission: card.first_mission,
			version: card.version,
			score: P.scoreCard(card, taxonomy, tokens),
		}))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
	const scoredMemory = memory
		.map((entry) => ({ ...entry, score: P.scoreMemory(entry, tokens) }))
		.sort((a, b) => b.score - a.score)
		.slice(0, limit);
	const topScore = scoredCards[0]?.score ?? 0;
	return {
		query,
		tokens,
		threshold,
		topScore,
		suggestCreate: P.needsNewCard(topScore, threshold),
		cards: scoredCards,
		memory: scoredMemory.filter((entry) => entry.score > 0),
	};
}

export function renderQuery(result, limit = 5) {
	const lines = [
		`任务：${result.query}`,
		`分词：${result.tokens.join(" ")}`,
		"",
		`▶ 推荐卡（top ${Math.min(limit, result.cards.length)}，threshold=${result.threshold}）`,
		...(result.cards.length ? result.cards.map((card) => `  ${String(card.score).padStart(4)}  ${card.id}（${card.type}）— ${card.summary}`) : ["  （池为空）"]),
		"",
		"▶ 相关记忆",
		...(result.memory.length ? result.memory.map((entry) => `  ${String(entry.score).padStart(4)}  [${entry.owner}] ${entry.id} — ${entry.summary ?? ""}`) : ["  （无相关记忆命中）"]),
	];
	if (result.suggestCreate) {
		lines.push("", `⚠ 缺口：最高分 ${result.topScore} < 阈值 ${result.threshold} → 走建卡协议（coord_agent register），禁万金油卡。`);
	}
	return lines.join("\n");
}

export async function listAgentCards(io) {
	const paths = poolPaths();
	const cards = await loadCards(io, paths);
	return cards
		.filter((card) => card.status !== "deprecated")
		.map((card) => ({
			id: card.id,
			type: card.type,
			name: card.name,
			first_mission: card.first_mission,
			version: card.version,
			summary: card.summary,
			taxonomy: card.taxonomy,
		}))
		.sort((a, b) => a.id.localeCompare(b.id));
}

export function renderCardList(cards) {
	if (cards.length === 0) return "角色卡池为空。用 coord_agent {action:'register'} 建第一张卡（scope 必写，禁万金油卡）。";
	const limit = 40;
	const shown = cards.slice(0, limit);
	const head = cards.length > limit ? [`角色卡 ${cards.length} 张（仅显示前 ${limit} 张；用 query 检索更准）：`] : [`角色卡 ${cards.length} 张（AI_GLOBAL_DIR/agents/pool）：`];
	return [
		...head,
		...shown.map(
			(card) =>
				`  ${card.id}（${card.type}, v${card.version ?? "?"}, first_mission=${card.first_mission ?? "?"}）— ${card.summary}` +
				(card.taxonomy?.length ? `\n      taxonomy: ${card.taxonomy.join(" · ")}` : ""),
		),
		...(cards.length > limit ? [`  …… 其余 ${cards.length - limit} 张省略`] : []),
	].join("\n");
}

/** 建卡（PM 本职动作）：校验通过才落盘；first_mission=pending。 */
export async function registerAgentCard(io, input) {
	const paths = poolPaths();
	const taxonomy = await loadTaxonomy(io, paths);
	if (taxonomy.nodes.length === 0) {
		throw new Error(`taxonomy.yml 缺失或为空：${paths.taxonomyPath}。先建受控标签词表，不要绕过校验。`);
	}
	const card = {
		id: String(input.id ?? "").trim(),
		type: String(input.type ?? "process-role").trim(),
		name: String(input.name ?? "").trim(),
		summary: String(input.summary ?? "").trim(),
		taxonomy: (input.taxonomy ?? []).map(String),
		keywords: (input.keywords ?? []).map(String),
		scope: { do: (input.scope?.do ?? []).map(String), dont: (input.scope?.dont ?? []).map(String) },
		applies_to: (input.applies_to ?? []).map(String),
		reject_hint: input.reject_hint ? String(input.reject_hint) : undefined,
		status: "active",
		first_mission: "pending",
		version: 1,
		created: L.todayStr(),
		last_reviewed: L.todayStr(),
	};
	const errors = P.validateCard(card, taxonomy);
	const existing = (await io.list(paths.poolDir)).filter((name) => name.endsWith(".md"));
	if (existing.includes(`${card.id}.md`)) errors.push(`id 已存在：${card.id}（改卡走 coord_agent update，只改自己的卡）`);
	if (errors.length) throw new Error(`建卡校验失败：\n- ${errors.join("\n- ")}`);

	const file = path.join(paths.poolDir, `${card.id}.md`);
	await io.write(file, P.serializeCard(card, P.defaultCardBody(card)));
	return { card, path: file };
}

/** 自升级：只改自己的 keywords / scope / summary；version+1 并追加记录。 */
export async function updateAgentCard(io, id, patch) {
	const paths = poolPaths();
	const file = path.join(paths.poolDir, `${id}.md`);
	const raw = await io.read(file);
	if (!raw) throw new Error(`卡不存在：${id}（建卡用 coord_agent register）`);
	const frontMatter = P.parseFrontMatter(raw);
	if (!frontMatter) throw new Error(`${id}.md 缺少 front-matter，拒绝改写。`);

	const card = { ...frontMatter };
	if (patch.summary) card.summary = String(patch.summary);
	if (patch.keywords?.length) card.keywords = patch.keywords.map(String);
	if (patch.scope?.do?.length) card.scope = { ...(card.scope ?? {}), do: patch.scope.do.map(String) };
	if (patch.scope?.dont?.length) card.scope = { ...(card.scope ?? {}), dont: patch.scope.dont.map(String) };
	if (patch.applies_to?.length) card.applies_to = patch.applies_to.map(String);
	if (patch.reject_hint) card.reject_hint = String(patch.reject_hint);
	card.version = Number(card.version ?? 1) + 1;
	card.last_reviewed = L.todayStr();

	const taxonomy = await loadTaxonomy(io, paths);
	const errors = P.validateCard(card, taxonomy);
	if (errors.length) throw new Error(`改卡校验失败：\n- ${errors.join("\n- ")}`);

	const note = patch.note ? String(patch.note) : "keywords/scope 自升级";
	let body = raw.slice(raw.indexOf("\n---", 3) + 4).replace(/^\r?\n/, "");
	const log = `- v${card.version} ${L.todayStr()}: ${note}`;
	if (/^##\s+自升级记录/m.test(body)) body = `${body.trimEnd()}\n${log}\n`;
	else body = `${body.trimEnd()}\n\n## 自升级记录\n\n${log}\n`;
	await io.write(file, P.serializeCard(card, body));
	return { card, path: file, note };
}

export async function completeFirstMission(io, id) {
	const paths = poolPaths();
	const file = path.join(paths.poolDir, `${id}.md`);
	const raw = await io.read(file);
	if (!raw) throw new Error(`卡不存在：${id}`);
	const frontMatter = P.parseFrontMatter(raw);
	if (!frontMatter) throw new Error(`${id}.md 缺少 front-matter`);
	const card = { ...frontMatter, first_mission: "done", last_reviewed: L.todayStr() };
	const body = raw.slice(raw.indexOf("\n---", 3) + 4).replace(/^\r?\n/, "").trimEnd();
	await io.write(file, P.serializeCard(card, `${body}\n\n- ${L.todayStr()}: 首任务复核通过，first_mission=done\n`));
	return { id, path: file };
}

// ---------------------------------------------------------------------------
// 记忆沉淀（自学习三层之一）
// ---------------------------------------------------------------------------

const MEMORY_TYPES = ["pitfall", "feedback", "project-fact", "decision"];

export async function addAgentMemory(io, { owner, type, title, content, domains, keywords }) {
	const paths = poolPaths();
	const id = String(owner ?? "").trim();
	if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error(`owner 非法（kebab-case）：${id}`);
	const normalizedType = MEMORY_TYPES.includes(type) ? type : "feedback";
	const slug = L.slugify(title, 40).replace(/\./g, "-");
	const file = path.join(paths.memoryDir, id, `${normalizedType}_${slug}.md`);
	const body = [
		"---",
		`name: ${JSON.stringify(slug)}`,
		`description: ${JSON.stringify(String(title ?? "").trim())}`,
		`type: ${JSON.stringify(normalizedType)}`,
		`domains: ${JSON.stringify((domains ?? []).map(String))}`,
		`keywords: ${JSON.stringify((keywords ?? []).map(String))}`,
		`first_seen: ${JSON.stringify(L.todayStr())}`,
		"---",
		"",
		String(content ?? "").trim(),
		"",
	].join("\n");
	await io.write(file, body);

	// MEMORY.md 索引页：存在则追加，不存在则创建
	const indexPath = path.join(paths.memoryDir, id, "MEMORY.md");
	const existing = (await io.read(indexPath)) ?? `# ${id} — 记忆索引\n`;
	if (!existing.includes(`${normalizedType}_${slug}.md`)) {
		await io.write(indexPath, `${existing.trimEnd()}\n- [${title}](./${normalizedType}_${slug}.md) — ${L.todayStr()}\n`);
	}
	return { owner: id, type: normalizedType, file };
}

export async function listAgentMemory(io, owner) {
	const paths = poolPaths();
	const owners = owner ? [owner] : (await io.list(paths.memoryDir)).filter((name) => !name.startsWith("."));
	const rows = [];
	for (const id of owners) {
		const dir = path.join(paths.memoryDir, id);
		const files = (await io.list(dir)).filter((name) => name.endsWith(".md") && name !== "MEMORY.md");
		for (const file of files) {
			const raw = await io.read(path.join(dir, file));
			const mapped = raw ? P.mapMemory(P.parseFrontMatter(raw), id, `memory/${id}/${file}`) : null;
			if (mapped) rows.push(mapped);
		}
	}
	return rows;
}

// ---------------------------------------------------------------------------
// 派发矩阵
// ---------------------------------------------------------------------------

/**
 * 从 todo.md 生成派发矩阵 + 任务卡，并（默认）落盘 `.ai/dispatch/DISPATCH-*.md`。
 * 不执行 subagent：矩阵交给 PM/模型，用 subagent / workflow 真正派发。
 */
export async function buildDispatch({ io, todoFile, paths, stage, taskIds, record = true, threshold = 3, metaInjection = "partial" }) {
	const wanted = taskIds?.length ? new Set(taskIds.map((id) => String(id).toUpperCase())) : null;
	const tasks = todoFile.items.filter(
		(item) => !item.done && (!stage || item.stage === stage) && (!wanted || wanted.has(item.id.toUpperCase())),
	);
	if (tasks.length === 0) return { tasks: [], rows: [], gaps: [], path: null, text: "所选范围内没有待办任务（或都已完成）。" };

	const rows = [];
	for (const item of tasks) {
		const result = await queryAgentPool(io, item.desc, { limit: 3, threshold });
		const alternatives = result.cards.filter((card) => card.score > 0).slice(0, 3);
		rows.push({ item, query: result, card: alternatives[0] ?? null, alternatives });
	}
	const gaps = rows.filter((row) => !row.card).map((row) => row.item);

	const lines = [
		`# 派发矩阵 · ${stage ? `阶段 ${stage}` : "全部未完成"}`,
		"",
		`- 任务：${tasks.length} 项 · 命中角色卡：${rows.length - gaps.length} · 缺口：${gaps.length}`,
		`- 检索：AI_GLOBAL_DIR/agents/pool（阈值 ${threshold}，命中即组合派发；缺口先建卡）`,
		`- meta_injection：${metaInjection}（full=PM 已注入全局 META；partial=注入主干；none=子 agent 自读）`,
		"",
		"## 矩阵",
		"",
		"| 阶段 | 任务 | 角色卡 | 分数 | 派发建议 |",
		"| --- | --- | --- | --- | --- |",
		...rows.map((row) => {
			const role = row.card ? `${row.card.id}` : "（缺口）";
			const score = row.card ? String(row.card.score) : "-";
			const advice = row.card ? "lane 内 writer→reviewer；同阶段不同文件域可并行" : "先 coord_agent register 建卡，再派发";
			return `| ${row.item.stage} | ${row.item.id} ${escapeCell(row.item.desc)} | ${role} | ${score} | ${advice} |`;
		}),
		"",
		"## 任务卡",
		"",
	];
	for (const row of rows) {
		const { item, card, query, alternatives } = row;
		lines.push(`### ${item.id} ${item.desc}`, "");
		if (card) {
			lines.push(
				`- 角色卡：\`${card.id}\`（${card.type}，v${card.version ?? "?"}，first_mission=${card.first_mission ?? "?"}）`,
				`- 候选：${alternatives.map((entry) => `${entry.id}(${entry.score})`).join(" / ")}`,
				`- scope.do：${(card.scope?.do ?? []).join("；") || "（无）"}`,
				`- scope.dont：${(card.scope?.dont ?? []).join("；") || "（无）"}`,
				`- 若 top 卡 scope 不符：用备选卡，或按退单纪律拒单；不要硬做。`,
			);
		} else {
			lines.push(
				`- 角色卡：缺口（top ${query.topScore} < ${threshold}）→ 建卡协议：\`coord_agent register\``,
				`- 建议 keywords：${query.tokens.slice(0, 6).join(" / ") || "（从任务描述提取）"}`,
			);
		}
		lines.push(
			`- 验收：层测试红→绿 + \`npm test\`；G2 同步 STRUCTURE/REQ/todo`,
			`- 退单：scope 不符 → \`{verdict:"out-of-scope", reason, suggest_keywords}\`，任务携反馈回队尾（同任务 2 次即拆解）`,
			"",
		);
	}
	if (gaps.length) {
		lines.push("## 缺口处理（建卡协议）", "");
		for (const item of gaps) lines.push(`- ${item.id} ${item.desc}`);
		lines.push("", "建卡 → 再跑 `coord_dispatch` 复核；no 万金油卡。", "");
	}

	let filePath = null;
	if (record) {
		const stamp = `${L.todayStr().replace(/-/g, "")}-${new Date().toTimeString().slice(0, 5).replace(":", "")}`;
		filePath = path.join(paths.aiDir, "dispatch", `DISPATCH-${stamp}.md`);
		await io.write(filePath, lines.join("\n"));
	}
	return { tasks, rows, gaps, path: filePath, text: lines.join("\n") };
}

function escapeCell(value) {
	return String(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}