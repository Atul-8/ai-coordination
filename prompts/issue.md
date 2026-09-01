---
description: 把 todo.md 待办任务同步为 git issues（gh CLI / Gitee API）
argument-hint: [阶段 sN，可选]
---

把 todo.md 中尚无 issue 编号的待办任务同步到 git issues。

1. 先跑 dry-run 预览（不要创建）：`node .ai/scripts/issues.js sync --dry-run`；
   若用户指定了阶段（如 `s1`），加上 `--stage s1`。
2. 向用户展示将要创建的 issue 清单（编号/标题/阶段），确认后去掉 `--dry-run` 真正执行。
3. 脚本会自动把 `(#N)` 回写进 todo.md 对应任务行——不要手工补编号。
4. 宿主要求：GitHub → `gh` CLI 已登录；Gitee → 环境变量 `GITEE_TOKEN`。缺什么就告诉用户怎么配。
5. 完成后输出映射表（T-NNN → #N），并提示：`/go <阶段>` 开始调度；完成由 `issues.js close-done` 自动关闭。
