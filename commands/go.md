---
description: 阶段性调度：选择阶段/任务 → 确认 → 按序执行（大活并行派发 subagent）
argument-hint: [sN | T-NNN，可选]
skills: coordination
---

执行阶段性调度（/go [sN | T-NNN]，无参数则交互选择）。参数：`$ARGUMENTS`

流程：

1. **选目标**：
   - `T-NNN` → 单任务调度；`sN` → 该阶段全部未完成任务
   - 无参数 → 列出 todo.md 各阶段待办数，用 AskUserQuestion 让用户选（含「全部未完成」选项）
   - todo.md 无任务 → 提示先 `/plan` 产出计划（自动登记），终止
2. **确认清单**（交互门控）：列出将执行的任务（id + 描述 + issue 号），经用户确认后继续。
3. **派发即关联**：对每个入选任务调用 `coord_todo {action:'link', id:'T-NNN'}`——写入当前 zcode session 前 8 位（@session: 标记；会话 id 由 G1 开门上下文提供）。
4. **执行**（按依赖分派）：
   - **PM 行为闭环（眼里有活，禁止空转等催）**：先盘点 → 产出派发矩阵（阶段×并行×文件域防冲突）→ 组装任务卡（角色卡+任务卡）→ 一次并行派发 → 汇报矩阵后待命；
   - 无依赖且跨文件域的任务：**一条消息内多个 Agent 调用并行派发**（角色卡来自 `AI_GLOBAL_DIR\agents\pool\`，检索三档 `node AI_GLOBAL_DIR\agents\scripts\query.mjs "<任务>"`；或用插件自带 ai-coordination:writer/reviewer/tester/architect）；
     任务卡头标 `meta_injection: full|partial|none`；writer 干完同 lane reviewer 复核（verdict: approved|blocked）；
   - 小活/串行任务：主会话直接执行；
   - 派发前跑 RAG 检索三档；退单（out-of-scope）→ 任务携反馈入队尾 FIFO 重组再派；累计 ≥2 次退单 → PM 拆解自办或上报用户。
5. **逐项归档**：每完成一项立即 `coord_todo {action:'done', id:'T-NNN'}`，再开始下一项；写操作后 G2 同步（层测试 + `.ai/STRUCTURE.md` + REQ 回写）。
6. **收口**：全部完成后——运行 `node .ai/scripts/issues.js close-done` 关闭已完成 issue → STRUCTURE 校验 → git 提交推送 → 输出阶段总结（含子代理 verdict 汇总）。
