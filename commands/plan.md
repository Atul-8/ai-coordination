---
description: 计划模式：只读探索 → Plan 步骤 → 用户确认 → 落盘 docs/plans + 步骤登记为 todo 任务
argument-hint: [计划主题或 REQ 编号]
skills: coordination
---

对以下主题执行计划模式流水线（只读探索 → 确认 → 落盘 → 任务登记）：

$ARGUMENTS

步骤：

1. **只读探索**：先充分读代码/文档（不写任何文件）；若平台提供原生 plan mode（只读门控），保持在其约束内工作。
2. **产出计划**：以 `Plan:` 开头给出编号步骤（1. 2. 3.…），每步一行、可独立验收；标注每步对应的阶段（sN）与涉及文件域（防并行冲突用）。
3. **用户确认**：把计划呈现给用户，等待确认/修改；未确认前不落盘。
4. **落盘计划文档**（确认后）：`docs/plans/PLAN-NNN-<slug>.md`——
   - 编号：`ls docs/plans/` 查最大 PLAN-NNN 再 +1（三位零填充）
   - 内容：背景（关联 REQ-NNN）/ 目标 / 验收标准 / 编号步骤清单
5. **阶段与任务登记**（全部用 coord_todo 工具，禁手改任务行）：
   - 计划引入新阶段 → 提示用户手工编辑 todo.md「阶段定义」小节（阶段行允许手工编辑），或复用现有阶段
   - 每个步骤 → `coord_todo {action:'add', desc, stage:'sN'}`（自动递增 T-NNN）
   - 阶段行回写计划引用：在 todo.md 阶段定义行尾追加 `<!-- plan:docs/plans/PLAN-NNN-<slug>.md -->`（阶段行可手工编辑）
6. **收尾**：汇报 PLAN 编号 + 任务编号清单 + 建议下一步（`/issue` 同步 git issues → `/go <sN>` 调度）。
