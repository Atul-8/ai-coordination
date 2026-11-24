/**
 * host.js — 从 Cordis 上下文取宿主事实（工作目录 / 沙箱策略 / 会话 id）
 *
 * 工具与命令共用；所有取值都做降级，宿主没有对应服务时退回会话 header 或进程 cwd。
 */

import * as L from "./lib.js";

/** 当前调用的工作目录 */
export async function cwdOf(ctx, exec) {
	const agent = exec?.agent;
	if (!agent) return process.cwd();
	const workingDirectory = ctx.get?.("workingDirectory");
	if (workingDirectory) {
		try {
			return await workingDirectory.ensure(agent, exec.signal);
		} catch {
			/* fall through to the session header */
		}
	}
	const sessions = ctx.get?.("sessions");
	return sessions?.get(agent.id)?.header?.cwd ?? process.cwd();
}

/** 当前调用的沙箱执行策略（缺服务时 undefined = 不额外限制） */
export function policyOf(ctx, exec) {
	const sandboxPolicy = ctx.get?.("sandboxPolicy");
	if (!sandboxPolicy) return undefined;
	const session = ctx.get?.("sessions")?.get(exec?.agent?.id);
	try {
		return sandboxPolicy.resolve(session ? { session } : {});
	} catch {
		return undefined;
	}
}

export function sessionIdOf(exec) {
	return exec?.agent?.id;
}

export function shortSessionOf(exec) {
	return L.shortSessionId(exec?.agent?.id);
}

/** 把命令 invocation 适配成工具那样的 exec 形状 */
export function execOfInvocation(invocation) {
	return { agent: invocation.agent, signal: invocation.signal };
}