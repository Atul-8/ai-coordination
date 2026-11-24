/**
 * dsh-ai-coordination — DSH bundle 宿主插件入口
 *
 * 顶层插件（全局）：注册 coord_* 工具、/coord-* 命令与 agi-* 技能。
 * 预设 `agi` 由 cordis.patch.yml 声明，负责 persona 与工具组合。
 *
 * 设计：框架 = 全局插件，项目 = 纯数据（.ai/ + todo.md + AGENTS.md）。
 */

import { readFileSync } from "node:fs";
import { registerCoordinationCommands } from "./src/commands.js";
import { registerCoordinationTools } from "./src/tools.js";

/** 工具与命令是硬依赖；skills 服务可选（缺失时只少技能注册）。 */
export const inject = ["tools", "commands"];

const TEMPLATE_FILES = {
	agents: "templates/AGENTS.template.md",
	todo: "templates/todo.md",
	aiReadme: "templates/ai-readme.md",
	structure: "templates/STRUCTURE.md",
	req: "templates/REQ-000.md",
	err: "templates/ERR-000.md",
	metaRules: "templates/meta-rules.md",
	globalMetaRules: "templates/global-meta-rules.md",
	globalAgentsReadme: "templates/global-agents-readme.md",
	globalTaxonomy: "templates/global-taxonomy.yml",
};

const SKILL_DIRS = ["agi-coordination", "agi-handoff", "agi-dispatch", "agi-growth"];

function readAsset(relative) {
	return readFileSync(new URL(`./${relative}`, import.meta.url), "utf8");
}

function loadTemplates() {
	const templates = {};
	for (const [key, relative] of Object.entries(TEMPLATE_FILES)) templates[key] = readAsset(relative);
	return templates;
}

/** 解析 SKILL.md 的简单 frontmatter（name/description/whenToUse）。 */
function parseSkill(raw, fallbackName) {
	const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
	if (!match) return { meta: { name: fallbackName }, content: raw.trim() };
	const meta = {};
	for (const line of match[1].split(/\r?\n/)) {
		const entry = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
		if (entry) meta[entry[1]] = entry[2].trim();
	}
	return { meta, content: match[2].trim() };
}

function registerSkills(ctx) {
	const skills = ctx.get?.("skills");
	if (!skills) return;
	for (const dir of SKILL_DIRS) {
		try {
			const raw = readAsset(`skills/${dir}/SKILL.md`);
			const { meta, content } = parseSkill(raw, dir);
			skills.register({
				name: meta.name || dir,
				description: meta.description || "",
				whenToUse: meta.whenToUse || meta["when-to-use"],
				content,
				source: "bundled",
				provider: "dsh-ai-coordination",
			});
		} catch (error) {
			// 单个技能冲突/缺失不影响协调工具：工具才是主链路。
			console.warn(`[dsh-ai-coordination] 技能 ${dir} 注册失败：${error?.message ?? error}`);
		}
	}
}

/**
 * @param {any} ctx Cordis context
 */
export function apply(ctx) {
	const templates = loadTemplates();
	const issuesScript = readAsset("scripts/issues.js");

	registerCoordinationTools(ctx, { templates, issuesScript });
	registerCoordinationCommands(ctx, { templates, issuesScript });
	registerSkills(ctx);
}