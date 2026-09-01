/**
 * plan-utils.ts — 计划模式辅助（移植自 pi 官方 plan-mode 示例的 utils.ts，保持白名单一致）
 */

export interface PlanStep {
	step: number;
	text: string;
	completed: boolean;
}

const SAFE_PATTERNS = [
	/^ls\b/i,
	/^pwd$/i,
	/^echo\s+/i,
	/^cat\s+/i,
	/^head\s+/i,
	/^tail\s+/i,
	/^grep\s+/i,
	/^find\s+/i,
	/^rg\s+/i,
	/^wc\s+/i,
	/^which\s+/i,
	/^whoami$/i,
	/^date(\s|$)/i,
	/^node\s+--version$/i,
	/^npm\s+(view|search|info)\s+/i,
	/^git\s+(status|log|diff|show|branch|remote|blame|rev-parse)\b/i,
	/^git\s+fetch\b/i,
	/^git\s+pull\b/i,
	/^gh\s+(issue\s+list|issue\s+view|pr\s+list|pr\s+view|repo\s+view)\b/i,
];

const DESTRUCTIVE_PATTERNS = [
	/\brm\s+-[rf]/i,
	/\bdel\s+\/[fs]/i,
	/\brmdir\b/i,
	/\bformat\b/i,
	/\bmkfs\b/i,
	/\bdd\s+if=/i,
	/\bshutdown\b/i,
	/\breboot\b/i,
	/\bsudo\b/i,
	/\bgit\s+push\b/i,
	/\bgit\s+reset\s+--hard\b/i,
	/\bgit\s+clean\b/i,
	/\bgit\s+checkout\s+--\s+\./i,
	/\bdrop\s+(table|database)\b/i,
	/\btruncate\s+table\b/i,
	/\bkill\s+-9\b/i,
	/\bpkill\b/i,
	/>\s*\/(dev|etc|usr|bin|sbin)\//i,
];

/** 计划模式下 bash 是否只读安全 */
export function isSafeCommand(command: string): boolean {
	const trimmed = command.trim();
	if (trimmed.startsWith("#")) return true;

	for (const pattern of DESTRUCTIVE_PATTERNS) {
		if (pattern.test(trimmed)) return false;
	}

	// 多命令：管道 / 分号 / && 只允许每一段都安全
	if (/[;|&]/.test(trimmed)) {
		const parts = trimmed.split(/(?:\|\||&&|;|\|)/).map((p) => p.trim()).filter(Boolean);
		if (parts.length === 0) return false;
		return parts.every((part) => isSafeCommand(part));
	}

	return SAFE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/** 从文本提取 "Plan:" 之后的编号步骤 */
export function extractTodoItems(text: string): PlanStep[] {
	const planMatch = text.match(/Plan:\s*\n([\s\S]*)/i);
	if (!planMatch) return [];
	const items: PlanStep[] = [];
	const itemRegex = /^(\d+)[.)]\s+(.+)$/gm;
	let m: RegExpExecArray | null;
	while ((m = itemRegex.exec(planMatch[1])) !== null) {
		items.push({ step: Number(m[1]), text: m[2].trim(), completed: false });
	}
	return items;
}

/** 解析 [DONE:n] 标记，标记完成步骤；返回变更数 */
export function markCompletedSteps(text: string, steps: PlanStep[]): number {
	let changed = 0;
	const doneRegex = /\[DONE:\s*(\d+)\]/g;
	let m: RegExpExecArray | null;
	while ((m = doneRegex.exec(text)) !== null) {
		const step = Number(m[1]);
		const item = steps.find((s) => s.step === step);
		if (item && !item.completed) {
			item.completed = true;
			changed++;
		}
	}
	return changed;
}
