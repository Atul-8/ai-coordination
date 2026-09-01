/**
 * plan.ts — 计划模式扩展（重构点 3 核心）
 *
 * 移植自 pi 官方示例 examples/extensions/plan-mode/，并按下述方式增强：
 * 1. 计划产出落盘 docs/plans/PLAN-NNN-<slug>.md（七层架构 docs 层，人与计划的交互接口）
 * 2. 计划步骤自动登记为 todo.md 任务项（[stage:sN]），阶段行回写 <!-- plan:... --> 引用
 * 3. 保存后可一键进入 /issue 同步（git issues 任务清单）
 *
 * 交互闭环：/plan（只读探索）→ Plan: 步骤 → 用户确认 → docs/plans 落盘 + todo 登记
 *          → /issue 同步 → /go <stage> 阶段调度执行。
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type { AssistantMessage, TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
	findCoordDir,
	parseTodo,
	saveTodo,
	setStagePlan,
	appendItem,
	nextItemId,
	nextPlanId,
	shortSessionId,
	todayStr,
} from "./lib.ts";
import { isSafeCommand, extractTodoItems, markCompletedSteps, type PlanStep } from "./plan-utils.ts";

const PLAN_MODE_TOOLS = ["read", "bash", "grep", "find", "ls"];
const NORMAL_MODE_TOOLS = ["read", "bash", "edit", "write"];
const PLAN_MODE_DISABLED_TOOLS = new Set<string>(["edit", "write"]);
const PLAN_MANAGED_TOOLS = new Set<string>([...PLAN_MODE_TOOLS, ...NORMAL_MODE_TOOLS]);

interface PlanModeState {
	enabled: boolean;
	steps?: PlanStep[];
	executing?: boolean;
	toolsBeforePlanMode?: string[];
}

function isAssistantMessage(m: AgentMessage): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
}

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((block): block is TextContent => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

/** eai 复用：registerPlan 安装真实切换实现（计划模式状态在闭包内） */
const planModeHook: { toggle?: (ctx: ExtensionContext) => void } = {};
export function togglePlanModeForEai(ctx: ExtensionContext): void {
	if (!planModeHook.toggle) throw new Error("计划模式未初始化（registerPlan 未运行）");
	planModeHook.toggle(ctx);
}

export function registerPlan(pi: ExtensionAPI): void {
	let planModeEnabled = false;
	let executionMode = false;
	let steps: PlanStep[] = [];
	let toolsBeforePlanMode: string[] | undefined;

	pi.registerFlag("coord-plan", {
		description: "以计划模式启动（只读探索）",
		type: "boolean",
		default: false,
	});

	function updateStatus(ctx: ExtensionContext): void {
		if (executionMode && steps.length > 0) {
			const completed = steps.filter((t) => t.completed).length;
			ctx.ui.setStatus("coord-plan", ctx.ui.theme.fg("accent", `📋 ${completed}/${steps.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("coord-plan", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("coord-plan", undefined);
		}

		if (executionMode && steps.length > 0) {
			const lines = steps.map((item) => {
				if (item.completed) {
					return ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text));
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("coord-plan", lines);
		} else {
			ctx.ui.setWidget("coord-plan", undefined);
		}
	}

	function uniqueToolNames(toolNames: string[]): string[] {
		return [...new Set(toolNames)];
	}

	function enablePlanModeTools(): void {
		if (toolsBeforePlanMode === undefined) {
			toolsBeforePlanMode = pi.getActiveTools();
		}
		pi.setActiveTools(
			uniqueToolNames([
				...pi.getActiveTools().filter((name) => !PLAN_MODE_DISABLED_TOOLS.has(name)),
				...PLAN_MODE_TOOLS,
			]),
		);
	}

	function restoreNormalModeTools(): void {
		pi.setActiveTools(
			uniqueToolNames([
				...(toolsBeforePlanMode ?? NORMAL_MODE_TOOLS),
				...(toolsBeforePlanMode ?? pi.getActiveTools()).filter((name) => !PLAN_MANAGED_TOOLS.has(name)),
			]),
		);
		toolsBeforePlanMode = undefined;
	}

	function persistState(): void {
		pi.appendEntry("coord-plan-mode", {
			enabled: planModeEnabled,
			steps,
			executing: executionMode,
			toolsBeforePlanMode,
		});
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		steps = [];

		if (planModeEnabled) {
			enablePlanModeTools();
			ctx.ui.notify("计划模式已开启：写工具禁用，bash 仅允许只读命令。产出 Plan: 后保存到 docs/plans/。");
		} else {
			restoreNormalModeTools();
			ctx.ui.notify("计划模式已关闭：完整工具已恢复。");
		}
		updateStatus(ctx);
		persistState();
	}
	planModeHook.toggle = togglePlanMode;

	pi.registerCommand("plan", {
		description: "切换计划模式（只读探索 → docs/plans 落盘 → todo 登记）",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "切换计划模式",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	// 计划模式下拦截非只读 bash
	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;
		const command = String(event.input.command ?? "");
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `计划模式：命令被拦截（仅允许只读白名单）。先用 /plan 退出计划模式。\n命令：${command}`,
			};
		}
	});

	// 非计划模式时过滤过期的模式上下文消息
	pi.on("context", async (event) => {
		if (planModeEnabled) return;
		return {
			messages: event.messages.filter((m) => {
				const msg = m as AgentMessage & { customType?: string };
				if (msg.customType === "coord-plan-context") return false;
				if (msg.role !== "user") return true;
				const content = msg.content;
				if (typeof content === "string") return !content.includes("[计划模式生效]");
				if (Array.isArray(content)) {
					return !content.some((c) => c.type === "text" && (c as TextContent).text?.includes("[计划模式生效]"));
				}
				return true;
			}),
		};
	});

	// 注入计划模式 / 执行模式上下文
	pi.on("before_agent_start", async () => {
		if (planModeEnabled) {
			return {
				message: {
					customType: "coord-plan-context",
					content: `[计划模式生效]
当前处于只读计划模式。

限制：
- edit / write 工具已禁用
- bash 仅允许只读白名单命令
- 其余现有工具保持可用

任务：与用户交互式澄清目标后，输出带编号的详细计划（Plan: 头部）：

Plan:
1. 第一步描述
2. 第二步描述
...

计划要按「可独立验证的阶段性任务」拆分，每步一句话、含验收方式。
不要做任何修改——只描述将要做什么。`,
					display: false,
				},
			};
		}

		if (executionMode && steps.length > 0) {
			const remaining = steps.filter((t) => !t.completed);
			const list = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "coord-plan-exec",
					content: `[正在执行计划 - 完整工具已恢复]

剩余步骤：
${list}

按顺序执行每一步。每完成一步，在回复中带上 [DONE:n] 标记。`,
					display: false,
				},
			};
		}
	});

	// 执行模式：跟踪 [DONE:n]
	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || steps.length === 0) return;
		if (!isAssistantMessage(event.message)) return;
		if (markCompletedSteps(getTextContent(event.message), steps) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	// 计划产出与执行入口
	pi.on("agent_end", async (event, ctx) => {
		// 执行完成检查
		if (executionMode && steps.length > 0) {
			if (steps.every((t) => t.completed)) {
				const completedList = steps.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "coord-plan-complete", content: `**计划执行完毕！** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				steps = [];
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		// 提取 Plan: 步骤
		const lastAssistant = [...event.messages].reverse().find(isAssistantMessage);
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) steps = extracted;
		}
		if (steps.length === 0) return;
		persistState();

		const stepsText = steps.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
		const stepsMessage = {
			customType: "coord-plan-steps",
			content: `**计划步骤（${steps.length}）：**\n\n${stepsText}`,
			display: true,
		};

		const choice = await ctx.ui.select("计划模式 · 下一步？", [
			"保存计划到 docs/plans 并登记 todo（推荐）",
			"直接执行（不落盘）",
			"继续细化计划",
			"退出计划模式",
		]);

		if (choice?.startsWith("保存计划")) {
			const paths = findCoordDir(ctx.cwd);
			if (!paths) {
				ctx.ui.notify("未找到 .ai/ 目录，无法落盘。请先运行 init-project.js", "error");
				return;
			}
			const saved = await savePlanDoc(pi, ctx, steps, stepsMessage);
			if (!saved) return;
			const [stageId, planRelPath] = saved;

			// 询问是否进入执行
			const goChoice = await ctx.ui.select("计划已保存 · 下一步？", [
				`立即执行本阶段（/go ${stageId}）`,
				"同步 git issues（/issue）",
				"暂不执行（之后用 /go 手动调度）",
			]);
			if (goChoice?.startsWith("立即执行")) {
				pi.sendUserMessage(`/go ${stageId}`);
			} else if (goChoice?.startsWith("同步")) {
				pi.sendUserMessage(`/issue ${stageId}`, { expandPromptTemplates: true });
			}
			void planRelPath;
		} else if (choice?.startsWith("直接执行")) {
			const first = steps[0];
			if (!first) return;
			planModeEnabled = false;
			executionMode = true;
			restoreNormalModeTools();
			updateStatus(ctx);
			persistState();

			const remainingList = steps.map((t) => `${t.step}. ${t.text}`).join("\n");
			pi.sendMessage(stepsMessage, { deliverAs: "followUp" });
			pi.sendMessage(
				{
					customType: "coord-plan-execute",
					content: `执行计划。\n\n剩余步骤：\n${remainingList}\n\n从这一步开始：${first.text}\n每完成一步，在回复中带上 [DONE:n] 标记。`,
					display: true,
				},
				{ triggerTurn: true, deliverAs: "followUp" },
			);
		} else if (choice === "继续细化计划") {
			const refinement = await ctx.ui.editor("细化计划（补充约束/调整步骤）：", "");
			if (refinement?.trim()) {
				pi.sendMessage(stepsMessage, { deliverAs: "followUp" });
				pi.sendUserMessage(refinement.trim(), { deliverAs: "followUp" });
			}
		} else if (choice === "退出计划模式") {
			togglePlanMode(ctx);
		}
	});

	// 会话恢复
	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("coord-plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();
		const stateEntry = entries
			.filter((e: { type: string; customType?: string }) => e.type === "custom" && e.customType === "coord-plan-mode")
			.pop() as { data?: PlanModeState } | undefined;

		if (stateEntry?.data) {
			planModeEnabled = stateEntry.data.enabled ?? planModeEnabled;
			steps = stateEntry.data.steps ?? steps;
			executionMode = stateEntry.data.executing ?? executionMode;
			toolsBeforePlanMode = stateEntry.data.toolsBeforePlanMode ?? toolsBeforePlanMode;
		}

		// 恢复后重扫消息重建完成状态（只扫最近一次执行起点之后）
		if (stateEntry && executionMode && steps.length > 0) {
			let executeIndex = -1;
			for (let i = entries.length - 1; i >= 0; i--) {
				const entry = entries[i] as { type: string; customType?: string };
				if (entry.customType === "coord-plan-execute") {
					executeIndex = i;
					break;
				}
			}
			if (executeIndex >= 0) {
				const texts: string[] = [];
				for (let i = executeIndex + 1; i < entries.length; i++) {
					const entry = entries[i];
					if (entry.type === "message" && "message" in entry && isAssistantMessage(entry.message as AgentMessage)) {
						texts.push(getTextContent(entry.message as AssistantMessage));
					}
				}
				markCompletedSteps(texts.join("\n"), steps);
			}
		}

		if (planModeEnabled) enablePlanModeTools();
		updateStatus(ctx);
	});
}

// ---------- 计划落盘 ----------

type PlanStepItem = { step: number; text: string; completed: boolean };

async function savePlanDoc(
	pi: ExtensionAPI,
	ctx: ExtensionContext,
	steps: PlanStepItem[],
	stepsMessage: { customType: string; content: string; display: boolean },
): Promise<[string, string] | null> {
	const paths = findCoordDir(ctx.cwd);
	if (!paths) return null;
	const file = parseTodo(paths.todoPath);

	// 选阶段（无阶段则引导先定义）
	if (file.stages.length === 0) {
		ctx.ui.notify("todo.md 尚无「阶段定义」。请先登记阶段（如 `- s1: 阶段标题`）再保存计划。", "warning");
		return null;
	}
	const stageOptions = file.stages.map((s) => `${s.id} — ${s.title}`);
	const picked = await ctx.ui.select("计划归属阶段：", stageOptions);
	if (!picked) return null;
	const stageId = picked.split(" — ")[0];

	// 写计划文档
	if (!existsSync(paths.plansDir)) mkdirSync(paths.plansDir, { recursive: true });
	const planNo = nextPlanId(paths.plansDir);
	const slug = (steps[0]?.text ?? "plan")
		.replace(/[/\\:*?"<>|\s]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 16);
	const planName = `PLAN-${String(planNo).padStart(3, "0")}-${slug || "plan"}.md`;
	const planPathAbs = join(paths.plansDir, planName);
	const planRel = `docs/plans/${planName}`;
	const sid = shortSessionId(ctx.sessionManager.getSessionId());

	const stage = file.stages.find((s) => s.id === stageId);
	const body = [
		`# PLAN-${String(planNo).padStart(3, "0")} ${stage ? stage.title : ""}`.trimEnd(),
		"",
		`- **阶段**: ${stageId}${stage ? `（${stage.title}）` : ""}`,
		`- **日期**: ${todayStr()}`,
		`- **会话**: ${sid ?? "unknown"}（pi session，完整上下文见会话树）`,
		"- **来源**: plan mode 交互式计划（/plan）",
		"",
		"## 计划步骤",
		"",
		...steps.map((s) => `${s.step}. ${s.text}`),
		"",
		"## 备注 / 风险 / 验收",
		"",
		"（计划讨论中确认的约束、风险与验收标准）",
		"",
	].join("\n");
	writeFileSync(planPathAbs, body, "utf-8");

	// 阶段行回写 plan 引用 + 步骤登记为 todo
	setStagePlan(file, stageId, planRel);
	for (const s of steps) {
		appendItem(file, { id: nextItemId(file.items), done: false, doing: false, stage: stageId, desc: s.text });
	}
	saveTodo(paths.todoPath, file);

	pi.sendMessage(stepsMessage, { deliverAs: "followUp" });
	pi.sendMessage(
		{
			customType: "coord-plan-saved",
			content: `**计划已落盘** 📄 \`${planRel}\`（阶段 ${stageId}），${steps.length} 个步骤已登记到 todo.md。\n用 \`/todo\` 查看看板，\`/issue ${stageId}\` 同步 git issues，\`/go ${stageId}\` 开始调度。`,
			display: true,
		},
		{ deliverAs: "followUp" },
	);
	pi.setSessionName(`PLAN-${String(planNo).padStart(3, "0")} ${stageId}`);
	return [stageId, planRel];
}
