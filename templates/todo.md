# TODO — 任务清单

> 单一任务事实源。规范见 AGENTS.md「任务流水线」。
> 流水线：`/plan` 产出计划（docs/plans/）→ 自动登记任务 → `/issue` 同步 git issues → `/go <stage>` 阶段性调度执行。
> 行格式：`- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8`
> 由 coord_todo 工具维护；请勿手工编辑任务行（阶段定义可手工编辑）。

## 阶段定义

<!-- 每行一个阶段；/plan 保存计划后自动回写 plan 引用 -->
- s0: 框架与环境

## 任务

（任务清单为空。用 /plan 产出计划自动登记，或 coord_todo {action:'add'} 手工添加。）
