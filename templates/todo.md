# TODO — 任务清单

> 单一任务事实源。规范见 AGENTS.md「任务流水线」。
> 流水线：计划模式审批 → `eai_plan_save` 落盘 `docs/plans/` + 自动登记任务 → `eai_issue sync` 同步 git issues → `/eai-go <stage>` 阶段性调度。
> 行格式：`- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8`
> 由 eai_todo 工具维护；请勿手工编辑任务行（阶段定义可手工编辑）。

## 阶段定义

<!-- 每行一个阶段；eai_plan_save 保存计划后自动回写 plan 引用 -->
- s0: 框架与环境

## 任务