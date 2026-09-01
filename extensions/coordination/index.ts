/**
 * index.ts — pi-ai-coordination 扩展入口
 *
 * 注册：
 * - 工具  coord_todo（todo.md 唯一事实源）
 * - 组命令 /eai（gcc 风格子命令+旗标）+ /eai-* 平面别名
 * - 原生命令 /coord-init（/aic-init-project） /plan /todo /go /coord-status（全部保留）
 * - 快捷键 Ctrl+Alt+P（计划模式）
 * - 启动旗标 --coord-plan
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerTodo } from "./todo.ts";
import { registerPlan } from "./plan.ts";
import { registerGo } from "./go.ts";
import { registerStatus } from "./status.ts";
import { registerInitCommand } from "./init-command.ts";
import { registerEai } from "./eai.ts";

export default function coordinationExtension(pi: ExtensionAPI): void {
	registerTodo(pi);
	registerPlan(pi);
	registerGo(pi);
	registerStatus(pi);
	registerInitCommand(pi);
	registerEai(pi);
}
