---
description: 在当前项目初始化 coordination 层（.ai/ + todo.md + AGENTS.md，幂等）
argument-hint: [项目根目录，默认当前目录]
skills: coordination
---

在项目中初始化 ai-coordination 框架。目标根目录：`$ARGUMENTS`（空则当前工作目录）。

1. **定位 init-project.js**（本插件自带，按序尝试）：
   - `$ZCODE_PLUGIN_ROOT/scripts/init-project.js`（插件根环境变量）
   - `ls ~/.zcode/cli/plugins/cache/*/ai-coordination/*/scripts/init-project.js`（插件缓存安装位）
   - 本仓库开发检出：`E:\AI\ai-coordination\scripts\init-project.js`
2. **执行**：`node <init-project.js 路径> <项目根>`（脚本幂等，重复执行安全；缺全局池时自动 bootstrap `AI_GLOBAL_DIR`）。
3. **汇报**：读 stdout JSON——`project.created / project.skipped / global.bootstrapped`，向用户说明新建与跳过项。
4. **引导**：初始化后提示流水线入口——/pm 需求入口 → /plan 计划 → /issue 同步 → /go <stage> 调度；
   提醒任务行仅经 coord_todo 工具维护（MCP），阶段定义可手工编辑。
5. 若项目根已有 `.ai/`（已初始化）→ 直接报告状态并转入 G0/G1 流程，不要重复初始化。
