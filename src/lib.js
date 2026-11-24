/**
 * lib.js — dsh-eai-workflow 纯函数层（无 I/O、无上下文依赖）
 *
 * 移植自 pi 版 extensions/eaiination/lib.ts，语义保持一致：
 *   - todo.md 是唯一任务事实源，行格式固定
 *   - 阶段定义写在「阶段定义」小节，任务行写在「任务」小节
 *   - 行内容：- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
 *
 * 所有函数可单测；文件读写与沙箱策略在 project.js，工具装配在 tools.js。
 */

export const ITEM_RE = /^- \[( |x|~)\]\s*(T-\d+)\s+\[stage:([^\]]+)\]\s*(.*)$/;
export const STAGE_RE = /^-\s*(s\d+)\s*[:：]\s*(.*)$/;

/** 宿主插桩标记：eai 版为本体；legacyDsh / pi / zcode 为跨宿主接力时原位升级的对象 */
export const AGENTS_MARKERS = {
	eai: {
		begin: "<!-- eai-workflow:agents:v1 BEGIN -->",
		end: "<!-- eai-workflow:agents:v1 END -->",
	},
	legacyDsh: {
		begin: "<!-- dsh-ai-coordination:agents:v1 BEGIN -->",
		end: "<!-- dsh-ai-coordination:agents:v1 END -->",
	},
	pi: {
		begin: "<!-- pi-ai-coordination:agents:v1 BEGIN -->",
		end: "<!-- pi-ai-coordination:agents:v1 END -->",
	},
	zcode: {
		begin: "<!-- ai-coordination:agents:v1 BEGIN -->",
		end: "<!-- ai-coordination:agents:v1 END -->",
	},
};

// ---------------------------------------------------------------------------
// todo.md
// ---------------------------------------------------------------------------

/**
 * 解析 todo.md。
 * @param {string} raw 文件内容（不存在时传空串）
 */
export function parseTodo(raw) {
	const lines = String(raw ?? "").split(/\r?\n/);
	/** @type {Array<{id:string,title:string,plan?:string,lineIndex:number}>} */
	const stages = [];
	/** @type {Array<{id:string,done:boolean,doing:boolean,stage:string,desc:string,issue?:number,session?:string,lineIndex:number}>} */
	const items = [];
	let section = "";
	let taskSectionStart = -1;

	lines.forEach((line, i) => {
		const header = line.match(/^##\s+(.*)$/);
		if (header) {
			section = header[1].trim();
			if (section.includes("任务")) taskSectionStart = i;
			return;
		}

		const isTaskSection = section === "任务" || (section.includes("任务") && !section.includes("阶段"));
		const isStageSection = section.includes("阶段") && !section.includes("任务");

		if (isStageSection) {
			const m = line.match(STAGE_RE);
			if (m) {
				const plan = line.match(/<!--\s*plan:([^>]*?)\s*-->/)?.[1]?.trim();
				stages.push({ id: m[1], title: cleanTitle(m[2]), plan: plan || undefined, lineIndex: i });
			}
			return;
		}

		if (isTaskSection) {
			const m = line.match(ITEM_RE);
			if (!m) return;
			let rest = m[4].trim();
			// 元数据只认行尾，避免描述里的 "(#9)" / "@session:xxx" 被当成关联
			const session = rest.match(/\s+@session:([0-9a-zA-Z]+)\s*$/);
			if (session) rest = rest.slice(0, session.index).trim();
			const issue = rest.match(/\s+\(#(\d+)\)\s*$/);
			if (issue) rest = rest.slice(0, issue.index).trim();
			items.push({
				id: m[2],
				done: m[1] === "x",
				doing: m[1] === "~",
				stage: m[3],
				desc: rest,
				issue: issue ? Number(issue[1]) : undefined,
				session: session ? session[1] : undefined,
				lineIndex: i,
			});
		}
	});

	return { lines, stages, items, taskSectionStart };
}

/** 任务描述/步骤一律压成单行，避免破坏 todo.md 行格式。 */
export function sanitizeOneLine(value) {
	return String(value ?? "").replace(/\r?\n+/g, " / ").replace(/\s+/g, " ").trim();
}

/** 任务描述额外中和元数据标记，防止 desc 伪造 (#N) / @session。 */
export function sanitizeTodoDesc(value) {
	return sanitizeOneLine(value)
		.replace(/@session:/gi, "＠session:")
		.replace(/\(#(\d+)\)/g, "（#$1）")
		.replace(/\(#/g, "（#");
}

function cleanTitle(value) {
	return String(value).replace(/<!--.*?-->/g, "").trim();
}

/** 规范化生成一条任务行 */
export function formatItemLine(item) {
	const mark = item.done ? "x" : item.doing ? "~" : " ";
	let line = `- [${mark}] ${item.id} [stage:${item.stage}] ${sanitizeTodoDesc(item.desc)}`;
	if (item.issue !== undefined) line += ` (#${item.issue})`;
	if (item.session) line += ` @session:${item.session}`;
	return line;
}

export function nextItemId(items, lines = []) {
	let max = 0;
	for (const item of items ?? []) max = Math.max(max, Number(String(item.id).replace("T-", "")) || 0);
	// 也扫描原始任务行（含手工改坏、缺 stage 的行）：不能导致编号复用
	for (const line of lines ?? []) {
		const match = String(line).match(/^-\s*\[[ x~]\]\s*(T-\d+)\b/);
		if (match) max = Math.max(max, Number(match[1].replace("T-", "")) || 0);
	}
	return `T-${String(max + 1).padStart(3, "0")}`;
}

/** 追加任务到「任务」小节（插到最后一条任务行之后），同步修正行号 */
export function appendItem(file, item) {
	const line = formatItemLine(item);
	if (file.taskSectionStart >= 0) {
		let last = -1;
		for (let i = file.taskSectionStart + 1; i < file.lines.length; i++) {
			if (ITEM_RE.test(file.lines[i])) last = i;
			else if (/^##\s/.test(file.lines[i])) break;
		}
		let insertAt = last + 1;
		if (last < 0) {
			// 小节还没有任务：跳过分节标题后的空行，保持「标题—空行—任务」的排版
			insertAt = file.taskSectionStart + 1;
			while (insertAt < file.lines.length && file.lines[insertAt].trim() === "") insertAt++;
		}
		for (const existing of file.items) {
			if (existing.lineIndex >= insertAt) existing.lineIndex++;
		}
		file.lines.splice(insertAt, 0, line);
		item.lineIndex = insertAt;
	} else {
		file.lines.push("", "## 任务", "", line);
		item.lineIndex = file.lines.length - 1;
	}
	file.items.push(item);
	return item;
}

/** 原地更新一条任务行（done / doing / issue / session / desc） */
export function updateItem(file, id, patch) {
	const wanted = String(id ?? "").toUpperCase();
	const item = file.items.find((candidate) => String(candidate.id).toUpperCase() === wanted);
	if (!item) return null;
	Object.assign(item, patch);
	file.lines[item.lineIndex] = formatItemLine(item);
	return item;
}

/** 覆盖式设置阶段计划引用 */
export function setStagePlan(file, stageId, planPath) {
	const stage = file.stages.find((candidate) => candidate.id === stageId);
	if (!stage) return null;
	stage.plan = planPath;
	const base = file.lines[stage.lineIndex].replace(/\s*<!--\s*plan:[^>]*-->\s*$/, "");
	file.lines[stage.lineIndex] = `${base} <!-- plan:${planPath} -->`;
	return stage;
}

/** 序列化 todo.md */
export function serializeTodo(file) {
	return file.lines.join("\n");
}

/** 按阶段统计任务（未定义阶段归入 stage:null） */
export function stageStats(file) {
	const map = new Map();
	for (const stage of file.stages) map.set(stage.id, { stage, open: 0, doing: 0, done: 0 });
	for (const item of file.items) {
		if (!map.has(item.stage)) map.set(item.stage, { stage: null, open: 0, doing: 0, done: 0 });
		const stat = map.get(item.stage);
		if (item.done) stat.done++;
		else if (item.doing) stat.doing++;
		else stat.open++;
	}
	return [...map.values()];
}

/** 看板文本（工具 list 与 /eai-status 共用） */
export function renderBoard(file) {
	const out = [];
	for (const stat of stageStats(file)) {
		const stage = stat.stage;
		const title = stage ? `${stage.id}: ${stage.title}` : "(未定义阶段)";
		const plan = stage?.plan ? ` → ${stage.plan}` : "";
		out.push(`[${stage?.id ?? "?"}] ${title} — 待办 ${stat.open} / 进行 ${stat.doing} / 完成 ${stat.done}${plan}`);
	}
	out.push("");
	const open = file.items.filter((item) => !item.done);
	const done = file.items.filter((item) => item.done);
	for (const item of [...open, ...done]) {
		const mark = item.done ? "x" : item.doing ? "~" : " ";
		const meta = [item.issue ? `#${item.issue}` : null, item.session ? `@${item.session}` : null].filter(Boolean).join(" ");
		out.push(`  [${mark}] ${item.id} [${item.stage}] ${item.desc}${meta ? `  (${meta})` : ""}`);
	}
	if (file.items.length === 0) out.push("  （任务清单为空。用 eai_todo {action:'add'} 或 eai_plan_save 产出）");
	return out.join("\n");
}

// ---------------------------------------------------------------------------
// 编号 / 名称
// ---------------------------------------------------------------------------

export function shortSessionId(sessionId) {
	if (!sessionId) return undefined;
	return String(sessionId)
		.replace(/^session-/, "")
		.replace(/-/g, "")
		.slice(0, 8);
}

export function todayStr(date = new Date()) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function nowStr(date = new Date()) {
	const pad = (value) => String(value).padStart(2, "0");
	return `${todayStr(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** docs/plans 下下一个 PLAN 编号（传入文件名数组） */
export function nextPlanNo(names) {
	const max = (names ?? []).reduce((acc, name) => {
		const m = String(name).match(/^PLAN-(\d+)/);
		return m ? Math.max(acc, Number(m[1])) : acc;
	}, 0);
	return max + 1;
}

/** .ai/errors/raw 下下一个 ERR 编号（传入文件名数组） */
export function nextErrNo(names) {
	const max = (names ?? []).reduce((acc, name) => {
		const m = String(name).match(/^ERR-(\d+)/);
		return m ? Math.max(acc, Number(m[1])) : acc;
	}, 0);
	return max + 1;
}

/** meta-rules.md 中 META 规则条数（META-0000 是模板示例，不计入） */
export function countMetaRules(text) {
	let count = 0;
	for (const match of String(text ?? "").matchAll(/^###\s+META-(\d+)/gm)) {
		if (Number(match[1]) !== 0) count++;
	}
	return count;
}

/** meta-rules.md 中最后一个 META 编号（忽略示例 META-0000） */
export function lastMetaNo(text) {
	let max = 0;
	for (const m of String(text ?? "").matchAll(/^###\s+META-(\d+)/gm)) {
		const value = Number(m[1]);
		if (value !== 0) max = Math.max(max, value);
	}
	return max;
}

export function slugify(text, max = 16) {
	const slug = String(text ?? "plan")
		.replace(/[/\\:*?"<>|\s.]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, max);
	return slug || "plan";
}

// ---------------------------------------------------------------------------
// 计划文档
// ---------------------------------------------------------------------------

/**
 * 生成 docs/plans/PLAN-NNN-*.md 正文。
 */
export function buildPlanDoc({ planNo, stageId, stageTitle, steps, acceptance, research, notes, sessionId, date = todayStr() }) {
	const head = `# PLAN-${String(planNo).padStart(3, "0")} ${stageTitle ?? ""}`.trimEnd();
	return [
		head,
		"",
		`- **阶段**: ${stageId}${stageTitle ? `（${stageTitle}）` : ""}`,
		`- **日期**: ${date}`,
		`- **会话**: ${sessionId ?? "unknown"}（宿主 session，完整上下文见会话日志）`,
		...(research ? [`- **研究**: ${research}`] : []),
		"- **来源**: 计划模式审批后经 eai_plan_save 落盘",
		"",
		"## 计划步骤",
		"",
		...steps.flatMap((step, i) => [
			`${i + 1}. ${step}`,
			...(acceptance?.[i] ? [`   - 验收：${acceptance[i]}`] : []),
		]),
		"",
		"## 备注 / 风险 / 验收",
		"",
		notes?.trim() || "（计划讨论中确认的约束、风险与验收标准）",
		"",
	].join("\n");
}

/**
 * 从计划 Markdown 中提取编号步骤；没有编号行时按段落/列表项兜底。
 */
export function extractSteps(markdown) {
	const lines = String(markdown ?? "").split(/\r?\n/);
	const numbered = [];
	for (const line of lines) {
		const m = line.match(/^\s*\d+[.)、]\s*(.+?)\s*$/);
		if (m) numbered.push(m[1].replace(/^[-*]\s*/, "").trim());
	}
	if (numbered.length > 0) return numbered;
	const bullets = [];
	for (const line of lines) {
		const m = line.match(/^\s*[-*]\s+(.+?)\s*$/);
		if (m) bullets.push(m[1].trim());
	}
	return bullets;
}

// ---------------------------------------------------------------------------
// AGENTS.md 插桩
// ---------------------------------------------------------------------------

/**
 * 幂等部署 AGENTS.md 规范块：已有 dsh/pi/zcode 标记块时原位替换，否则插到文件顶部。
 * @param {string|null} existing 现有内容（不存在传 null）
 * @param {string} block 规范正文（不含标记）
 */
export function applyAgentsBlock(existing, block) {
	const markers = AGENTS_MARKERS.eai;
	const wrapped = `${markers.begin}\n${block.trim()}\n${markers.end}\n`;
	if (!existing) return { content: wrapped, action: "created" };

	for (const [host, pair] of Object.entries(AGENTS_MARKERS)) {
		const beginIdx = existing.indexOf(pair.begin);
		const endIdx = existing.indexOf(pair.end);
		if (beginIdx < 0 && endIdx < 0) continue;
		if (beginIdx < 0 || endIdx < 0 || endIdx < beginIdx) {
			throw new Error(`AGENTS.md 的 ${host} 插桩标记不完整（BEGIN/END 不成对），拒绝改写；请先手工修复标记。`);
		}
		const before = existing.slice(0, beginIdx);
		const tail = existing.slice(endIdx + pair.end.length).replace(/^\r?\n+/, "");
		const content = `${before}${wrapped}${tail ? `\n${tail}` : ""}`;
		return { content, action: host === "eai" ? "updated" : `upgraded-${host}` };
	}

	return { content: `${wrapped}\n${existing}`, action: "merged" };
}

// ---------------------------------------------------------------------------
// 交接卡
// ---------------------------------------------------------------------------

export function buildHandoffCard({ status = "open", task, from, to = "", done, doing, blockers, next, verify, time = nowStr() }) {
	// 卡片是逐行键值对：字段内的换行压成 " / "，保证 parseHandoff 与接手方都能逐行读
	const flat = (value) =>
		String(value ?? "")
			.replace(/\r?\n+/g, " / ")
			.replace(/\s+/g, " ")
			.trim();
	return [
		"# HANDOFF — 跨宿主交接卡",
		"",
		"> 跨宿主（pi / ZCode / DSH）接力开发的唯一现场记录。**G1 接手方必读**；接手完成后把「状态」改为 resumed。",
		"> 一张卡对应一次交出，整卡重写不追加（历史在 git log）；本文件是纯数据，各宿主工具链都原生可读。",
		"",
		`- 状态: ${status}`,
		`- 交出方: ${flat(from)}（${time}）`,
		`- 接手方: ${flat(to) || "（留空；接手方完成后写「宿主 + session 前 8 位 + 日期时间」）"}`,
		`- 任务: ${flat(task) || "（未关联任务）"}`,
		`- 已完成: ${flat(done) || "（无）"}`,
		`- 进行中: ${flat(doing) || "（无）"}`,
		`- 卡点/死路: ${flat(blockers) || "（无）"}`,
		`- 下一步: ${flat(next) || "（未填写——接手方不得凭猜测续作）"}`,
		`- 验证: ${flat(verify) || "（未填写——接手方必须先跑验证）"}`,
		"",
	].join("\n");
}

/** 解析交接卡字段（宽松匹配，未知字段忽略） */
export function parseHandoff(text) {
	const fields = {};
	for (const line of String(text ?? "").split(/\r?\n/)) {
		const m = line.match(/^-\s*([^:：]+)[:：]\s*(.*)$/);
		if (m) fields[m[1].trim()] = m[2].trim();
	}
	const pick = (...names) => {
		for (const name of names) if (fields[name]) return fields[name];
		return undefined;
	};
	return {
		status: pick("状态") ?? "unknown",
		from: pick("交出方"),
		to: pick("接手方"),
		task: pick("任务"),
		done: pick("已完成"),
		doing: pick("进行中"),
		blockers: pick("卡点/死路", "卡点"),
		next: pick("下一步"),
		verify: pick("验证"),
	};
}

// ---------------------------------------------------------------------------
// git remote → issue 宿主
// ---------------------------------------------------------------------------

/**
 * 解析 git remote URL，返回 { host: 'github'|'gitee', owner, repo } 或抛错。
 */
export function parseRemoteUrl(url) {
	const raw = String(url ?? "").trim();
	const m =
		raw.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i) ||
		raw.match(/^ssh:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i) ||
		raw.match(/^git@([^:]+):(.+)$/);
	if (!m) throw new Error(`无法从 remote 解析 owner/repo：${raw || "（空）"}`);
	const hostRaw = m[1];
	const repoPath = m[2].replace(/\.git\/?$/i, "").replace(/\/+$/, "");
	const parts = repoPath.split("/").filter(Boolean);
	if (parts.length < 2) throw new Error(`remote 路径异常：${raw}`);
	const host = /github/i.test(hostRaw) ? "github" : /gitee/i.test(hostRaw) ? "gitee" : null;
	if (!host) throw new Error(`仅支持 github.com（gh CLI）与 gitee.com（API）。当前 remote：${raw}`);
	return { host, owner: parts[0], repo: parts[parts.length - 1], url: raw };
}

// ---------------------------------------------------------------------------
// 路径 / 报告
// ---------------------------------------------------------------------------

/** target 是否位于 root 内（Windows 大小写不敏感） */
export function isInside(root, target) {
	const rel = relativePath(root, target);
	return rel === "" || (!rel.startsWith("..") && !isAbsolutePath(rel));
}

function normalize(p) {
	const s = String(p).replace(/\\/g, "/");
	return process.platform === "win32" ? s.toLowerCase() : s;
}

function relativePath(from, to) {
	const a = normalize(from).replace(/\/+$/, "").split("/");
	const b = normalize(to).split("/");
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	const up = a.length - i;
	return [...Array(up).fill(".."), ...b.slice(i)].join("/");
}

function isAbsolutePath(p) {
	return /^([A-Za-z]:|\/)/.test(p);
}

/** 组装 /eai-status 报告 */
export function buildStatusReport({ root, board, metaCount, globalMetaCount, handoff, structureOk, issuesScriptOk, sessionId }) {
	const lines = [
		`项目  ${root}`,
		`会话  ${sessionId ?? "unknown"}`,
		"",
		"任务",
		board,
		"",
		`META  项目规则 ${metaCount} 条 · 全局池 ${globalMetaCount} 条`,
		`交接  ${handoff ? `HANDOFF ${handoff.status}${handoff.task ? `（${handoff.task}）` : ""}` : "无卡片"}`,
		`结构  STRUCTURE.md ${structureOk ? "✓" : "✗ 缺失"} · issues CLI ${issuesScriptOk ? "✓" : "✗ 未部署"}`,
	];
	return lines.join("\n");
}