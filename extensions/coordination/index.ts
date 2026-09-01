/**
 * index.ts — pi-ai-coordination 扩展入口
 *
 * 注册：
 * - 工具  coord_todo（todo.md 唯一事实源）
 * - 命令  /coord-init（/aic-init-project） /plan /todo /go /coord-status
 * - 快捷键 Ctrl+Alt+P（计划模式）
 * - 启动旗标 --coord-plan
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTodo } from "./todo.ts";
import { registerPlan } from "./plan.ts";
import { registerGo } from "./go.ts";
import { registerStatus } from "./status.ts";
import { registerInitCommand } from "./init-command.ts";

export default function coordinationExtension(pi: ExtensionAPI): void {
	registerTodo(pi);
	registerPlan(pi);
	registerGo(pi);
	registerStatus(pi);
	registerInitCommand(pi);
}
