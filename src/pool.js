/**
 * pool.js — RAG 角色卡池的纯函数层（front-matter / taxonomy / 校验 / 分词 / 打分）
 *
 * ✅ LICENSE-REQ-001（approved）：本文件解析/校验/打分逻辑移植或改写自 eai-agent
 *   （https://gitee.com/eai-code/eai-agent，commit 623b3b4，LICENSE = GPL-3.0）。
 *   2026-11-24 版权人书面授权以 LGPL-3.0 分发本移植范围（eai 为版权人个人开发仓库）。
 *   记录：docs/THIRD-PARTY.md · 三渠道见 README「致谢与第三方代码」。
 *
 * 移植内容：front-matter 限定子集解析、taxonomy 路径校验、卡片校验、中文 2-gram 分词、
 * 关键词打分（keywords×3 / scope.do×3 / taxonomy×2 / applies_to×2 / name×1 / dont×−2）。
 * 设计参考：`agents/docs/design/rag-pool-redesign.md`（RAG pool v2）。
 *
 * 本文件零 I/O；读写与生命周期在 agents.js。
 */

const CARD_TYPES = ["process-role", "domain-expert"];
const CARD_STATUS = ["active", "deprecated"];
const FIRST_MISSION = ["pending", "done"];
const SUMMARY_MAX = 80;
const BANNED = /通用|杂项|万能|all-in-one/i;
const REQUIRED_FIELDS = ["id", "type", "name", "summary", "taxonomy", "keywords", "scope", "status", "first_mission"];

export { CARD_TYPES, CARD_STATUS, FIRST_MISSION, SUMMARY_MAX, BANNED };

// ── front-matter：限定 YAML 子集（扁平键 / 流式数组 / 一层嵌套 / 一层块序列） ──

function stripQuotes(value) {
	const text = String(value).trim();
	if ((text.startsWith('"') && text.endsWith('"') && text.length >= 2) || (text.startsWith("'") && text.endsWith("'") && text.length >= 2)) {
		return text.slice(1, -1);
	}
	return text;
}

function parseValue(raw) {
	const text = String(raw ?? "").trim();
	if (text === "") return "";
	if (/^\[.*\]$/.test(text)) {
		const inner = text.slice(1, -1).trim();
		if (inner === "") return [];
		const parts = inner.match(/(?:[^,"]|"[^"]*")+/g) ?? [];
		return parts.map((part) => stripQuotes(part)).filter((part) => part !== "");
	}
	if (text === "true") return true;
	if (text === "false") return false;
	if (text === "null" || text === "~") return null;
	if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
	return stripQuotes(text);
}

function parseNestedMap(block) {
	const out = {};
	for (const line of block) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const m = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(trimmed);
		if (m) out[m[1]] = parseValue(m[2] ?? "");
	}
	return out;
}

function parseListOfMaps(block) {
	const items = [];
	let current = null;
	for (const line of block) {
		const trimmed = line.trim();
		if (trimmed === "" || trimmed.startsWith("#")) continue;
		const seq = /^-\s+(.*)$/.exec(trimmed);
		if (seq) {
			current = {};
			items.push(current);
			const inline = seq[1].trim();
			const kv = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(inline);
			if (kv) current[kv[1]] = parseValue(kv[2] ?? "");
			else if (inline !== "") current.value = parseValue(inline);
			continue;
		}
		const kv = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(trimmed);
		if (kv && current) current[kv[1]] = parseValue(kv[2] ?? "");
	}
	return items;
}

function parseBlock(lines) {
	const root = {};
	let i = 0;
	while (i < lines.length) {
		const trimmed = lines[i].trim();
		if (trimmed === "" || trimmed.startsWith("#")) {
			i++;
			continue;
		}
		const top = /^(?![-\s])([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(trimmed);
		if (!top) {
			i++;
			continue;
		}
		const key = top[1];
		const inline = (top[2] ?? "").trim();
		if (inline !== "") {
			root[key] = parseValue(inline);
			i++;
			continue;
		}
		const block = [];
		let j = i + 1;
		while (j < lines.length) {
			const line = lines[j];
			if (line.trim() === "" || line.trim().startsWith("#")) {
				j++;
				continue;
			}
			if (/^[^\s#-]/.test(line)) break;
			block.push(line);
			j++;
		}
		const isSequence = block.some((line) => /^\s*-\s/.test(line));
		root[key] = isSequence ? parseListOfMaps(block) : parseNestedMap(block);
		i = j;
	}
	return root;
}

/** 解析 markdown front-matter（--- 围栏）；无围栏返回 null。 */
export function parseFrontMatter(text) {
	const lines = String(text ?? "").split(/\r?\n/);
	if (lines[0]?.trim() !== "---") return null;
	let end = -1;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			end = i;
			break;
		}
	}
	if (end === -1) return null;
	return parseBlock(lines.slice(1, end));
}

/** 解析 taxonomy.yml（块序列 + 流式数组 + 多父）。 */
export function parseTaxonomy(yamlText) {
	const doc = parseBlock(String(yamlText ?? "").split(/\r?\n/));
	const nodes = Array.isArray(doc.nodes) ? doc.nodes : [];
	return { version: doc.version ?? 1, nodes };
}

function nodeById(taxonomy, id) {
	return (taxonomy?.nodes ?? []).find((node) => node.id === id);
}

/** 校验一条 taxonomy 路径（存在性 + active + 逐段邻接）。合法返回 null。 */
export function validateTaxonomyPath(taxonomy, value) {
	if (typeof value !== "string" || value.trim() === "") return "taxonomy 路径为空";
	const segments = value.split(".");
	for (let i = 0; i < segments.length; i++) {
		const node = nodeById(taxonomy, segments[i]);
		if (!node) return `未知节点 ${segments[i]}（路径 ${value}）`;
		if (node.status === "deprecated") return `deprecated 节点 ${segments[i]}（路径 ${value}）`;
		if (i > 0) {
			const parents = Array.isArray(node.parents) ? node.parents : [];
			if (!parents.includes(segments[i - 1])) return `路径 ${value} 邻接断裂：${segments[i]} 的 parents 不含 ${segments[i - 1]}`;
		}
	}
	return null;
}

/**
 * 校验一张卡（schema v2）。返回错误数组（空 = 通过）。
 * @param {Record<string, any>} card
 * @param {{nodes: any[]}} taxonomy
 */
export function validateCard(card, taxonomy) {
	const errors = [];
	for (const field of REQUIRED_FIELDS) {
		const value = card[field];
		if (value === undefined || value === null || value === "") errors.push(`缺必填字段 ${field}`);
	}
	if (card.id !== undefined && !/^[a-z0-9][a-z0-9-]*$/.test(String(card.id))) errors.push(`id 必须 kebab-case（小写字母/数字/连字符）：${card.id}`);
	if (card.type !== undefined && !CARD_TYPES.includes(card.type)) errors.push(`type 非法（${card.type}），应为 ${CARD_TYPES.join(" | ")}`);
	if (card.status !== undefined && !CARD_STATUS.includes(card.status)) errors.push(`status 非法（${card.status}）`);
	if (card.first_mission !== undefined && !FIRST_MISSION.includes(card.first_mission)) errors.push(`first_mission 非法（${card.first_mission}）`);
	if (typeof card.summary === "string") {
		if (card.summary.length > SUMMARY_MAX) errors.push(`summary 超 ${SUMMARY_MAX} 字（${card.summary.length}）`);
		if (BANNED.test(card.summary)) errors.push(`summary 含禁用词（万金油卡）：${card.summary}`);
	}
	if (!Array.isArray(card.taxonomy) || card.taxonomy.length < 1) {
		errors.push("taxonomy 至少 1 条路径");
	} else {
		for (const value of card.taxonomy) {
			const error = validateTaxonomyPath(taxonomy, value);
			if (error) errors.push(`taxonomy 路径非法 ${value}: ${error}`);
		}
	}
	if (!Array.isArray(card.keywords) || card.keywords.length < 3) errors.push("keywords 不足 3 个（检索主锚点）");
	const scope = card.scope;
	if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
		errors.push("scope 缺失或格式非法（需 {do:[], dont:[]}）");
	} else {
		if (!Array.isArray(scope.do) || scope.do.length < 1) errors.push("scope.do 至少 1 条");
		if (!Array.isArray(scope.dont) || scope.dont.length < 1) errors.push("scope.dont 至少 1 条");
	}
	return errors;
}

// ── 分词与打分 ──

/** 中文 2-gram + 英文/数字 token（去重保序）。 */
export function tokenize(text) {
	const input = String(text ?? "").toLowerCase();
	const out = [];
	const push = (token) => {
		if (token && !out.includes(token)) out.push(token);
	};
	for (const match of input.matchAll(/[a-z0-9]+|[\u4e00-\u9fff]+/g)) {
		const token = match[0];
		if (/[a-z0-9]/.test(token[0])) push(token);
		else if (token.length === 1) push(token);
		else for (let i = 0; i < token.length - 1; i++) push(token.slice(i, i + 2));
	}
	return out;
}

function fieldTokens(values) {
	const set = new Set();
	for (const value of values ?? []) {
		if (typeof value === "string" && value.trim() !== "") for (const token of tokenize(value)) set.add(token);
	}
	return set;
}

function hits(values, querySet) {
	const tokens = fieldTokens(values);
	let count = 0;
	for (const token of querySet) if (tokens.has(token)) count++;
	return count;
}

/**
 * 逆文档频率：同一 token 命中越多卡，区分度越低（「测试/实现」这类通用词降权）。
 * 返回 idf(token) 函数；不传时打分退化为等权（兼容旧调用）。
 */
export function buildIdf(cards) {
	const df = new Map();
	for (const card of cards ?? []) {
		const text = [card.name, ...(card.keywords ?? []), ...(card.scope?.do ?? []), ...(card.applies_to ?? [])].join(" ");
		for (const token of new Set(tokenize(text))) df.set(token, (df.get(token) ?? 0) + 1);
	}
	const total = Math.max((cards ?? []).length, 1);
	return (token) => Math.log(1 + total / (1 + (df.get(String(token).toLowerCase()) ?? 0)));
}

function weightedHits(values, querySet, idf) {
	const tokens = fieldTokens(values);
	let score = 0;
	for (const token of querySet) if (tokens.has(token)) score += idf(token);
	return score;
}

/** 卡片打分：keywords×3、scope.do×3、taxonomy 段/别名×2、applies_to×2、name×1、scope.dont×(−2)；命中按 idf 加权。 */
export function scoreCard(card, taxonomy, queryTokens, idf = () => 1) {
	const querySet = new Set(queryTokens);
	let score = 0;
	score += 3 * weightedHits(card.keywords, querySet, idf);
	if (card.scope) {
		score += 3 * weightedHits(card.scope.do, querySet, idf);
		score -= 2 * weightedHits(card.scope.dont, querySet, idf);
	}
	score += 2 * weightedHits(card.applies_to, querySet, idf);
	score += 1 * weightedHits([card.name], querySet, idf);
	const matched = new Set();
	for (const path of card.taxonomy ?? []) {
		for (const segment of String(path).split(".")) {
			if (matched.has(segment)) continue;
			const node = nodeById(taxonomy, segment);
			if (weightedHits([segment, ...(node?.aliases ?? [])], querySet, idf) > 0) matched.add(segment);
		}
	}
	score += 2 * matched.size;
	return score;
}

/** 记忆打分：keywords×3、domains×2、summary×1。 */
export function scoreMemory(memory, queryTokens) {
	const querySet = new Set(queryTokens);
	return 3 * hits(memory.keywords, querySet) + 2 * hits(memory.domains, querySet) + 1 * hits([memory.summary], querySet);
}

const MEMORY_TYPE_NORMALIZE = { pitfalls: "pitfall", project: "project-fact" };

/** 记忆条目映射（宽容：name→id、description→summary、metadata.type→type）。 */
export function mapMemory(frontMatter, owner, file) {
	if (!frontMatter || typeof frontMatter !== "object" || !frontMatter.name) return null;
	const rawType = frontMatter.metadata?.type ?? frontMatter.type;
	return {
		id: frontMatter.name,
		owner,
		file,
		summary: frontMatter.description,
		type: rawType ? MEMORY_TYPE_NORMALIZE[rawType] ?? rawType : undefined,
		domains: frontMatter.domains,
		keywords: frontMatter.keywords,
	};
}

export function needsNewCard(topScore, threshold = 3) {
	return topScore < threshold;
}

// ── 写盘序列化 ──

function quote(value) {
	return JSON.stringify(String(value ?? ""));
}

function flow(values) {
	return `[${(values ?? []).map(quote).join(", ")}]`;
}

/** 序列化一张卡（front-matter + 正文）。 */
export function serializeCard(card, body) {
	const lines = [
		"---",
		`id: ${quote(card.id)}`,
		`type: ${quote(card.type)}`,
		`name: ${quote(card.name)}`,
		`summary: ${quote(card.summary)}`,
		`description: ${quote(card.summary)}`,
		`taxonomy: ${flow(card.taxonomy)}`,
		`keywords: ${flow(card.keywords)}`,
		"scope:",
		`  do: ${flow(card.scope?.do)}`,
		`  dont: ${flow(card.scope?.dont)}`,
	];
	if (card.applies_to?.length) lines.push(`applies_to: ${flow(card.applies_to)}`);
	if (card.reject_hint) lines.push(`reject_hint: ${quote(card.reject_hint)}`);
	lines.push(`status: ${quote(card.status ?? "active")}`);
	lines.push(`first_mission: ${quote(card.first_mission ?? "pending")}`);
	lines.push(`version: ${Number(card.version ?? 1)}`);
	lines.push(`created: ${quote(card.created ?? "")}`);
	lines.push(`last_reviewed: ${quote(card.last_reviewed ?? "")}`);
	lines.push("---", "", body.trimEnd(), "");
	return lines.join("\n");
}

/** 新卡正文模板。 */
export function defaultCardBody(card) {
	const doList = (card.scope?.do ?? []).map((item) => `- ${item}`).join("\n");
	const dontList = (card.scope?.dont ?? []).map((item) => `- ${item}`).join("\n");
	return [
		`# 角色卡 · ${card.name}`,
		"",
		`- **id**: ${card.id} ｜ **type**: ${card.type} ｜ **host**: subagent`,
		"",
		"## 职责",
		"",
		card.summary,
		"",
		"## 边界（scope）",
		"",
		"### do",
		"",
		doList,
		"",
		"### dont",
		"",
		dontList,
		"",
		card.reject_hint ? `> 退单建议：${card.reject_hint}` : "> scope 不符时拒单：out-of-scope + reason + suggest_keywords。",
		"",
		"## 自学习",
		"",
		"1. 本次经验写 `memory/" + card.id + "/`；",
		"2. 只改自己的卡（keywords/scope），`eai_agent update` 自动 version+1；",
		"3. 跨项目普适教训 → `eai_error` / `eai_meta promote`。",
		"",
		"## 自升级记录",
		"",
		`- v${Number(card.version ?? 1)} ${card.created ?? ""}: 建卡（first_mission=pending，首任务后复核转 done）`,
		"",
	].join("\n");
}