# zcode-dispatch.example.md — 常驻 PM 的并行派发模板（ZCode 子代理）

PM（主会话）把本模板读出 → 按「派发矩阵」组装任务卡 → **在一条消息里发出多个 Agent 工具调用**（每 lane 一个），
全部并行执行；子代理完成后 PM 逐个收口。

与 pi 版（workflowScript / runs.* / key 禁冒号）不同：ZCode 无脚本沙箱，无 key 校验；
追踪标识 `zcode.<stage>.<T-NNN>` 仅用于汇报与 todo 关联，写什么都行。

## 1. 派发前（PM 本职，缺一不可）

1. 盘点：读 todo.md（coord_todo list）+ 阶段计划（docs/plans）+ REQ 卡
2. RAG 检索三档：`node AI_GLOBAL_DIR\agents\scripts\query.mjs "<任务描述>"`
   强命中→组合派发｜弱命中→派发+任务卡标注「边界试探」｜未命中→建卡协议
   （新卡必写 scope、≥3 keywords、禁万金油卡、first_mission: pending，首任务后复核转 done）
3. 产出派发矩阵：阶段 × 并行 × **文件域防冲突**（同一文件域的任务禁止并行）
4. META 预注入决策：任务卡头 `meta_injection: full|partial|none`

## 2. 任务卡格式（Agent prompt）

```
[/go <stage> 派发 · zcode.<stage>.<T-NNN>]
角色: writer（或 reviewer/tester/architect；角色卡全文来自 AI_GLOBAL_DIR\agents\pool\<card>.md）
meta_injection: full          ← full|partial|none（RAG 池派发协议）
任务: T-003 <todo.md 任务描述>
计划: docs/plans/PLAN-001-xxx.md（相关小节摘录）
需求: .ai/requirements/REQ-002-xxx.md（相关验收条目）
文件域（只许改这些）: src/core/order/**, testing/core/order/**
纪律: G2 写后同步（STRUCTURE/REQ/todo 只用 coord_todo）；G2.5 红绿；完成按固定格式回 verdict
```

子代理返回（见插件 agents/*.md 的固定格式）：

```
verdict: approved | blocked | out-of-scope
task / changed / tests / notes（或 out-of-scope 的 suggest_keywords）
```

## 3. 派发示例（一条消息内多个 Agent 调用）

```
Agent(subagent_type="ai-coordination:writer", prompt=<T-003 任务卡，文件域 src/core/order/**>)
Agent(subagent_type="ai-coordination:writer", prompt=<T-004 任务卡，文件域 src/interface/api/**>)
Agent(subagent_type="ai-coordination:tester",  prompt=<T-005 任务卡，文件域 testing/core/**>)
```

- 无依赖 lane 同消息并行；lane 内 writer→reviewer 串行（writer 完成后同会话续发 reviewer 任务卡）
- 可并行接入不同阶段（s1 的 writer + s2 的 architect 互不阻塞）

## 4. 退单队列（out-of-scope 处理）

子代理拒单 → 任务携反馈（suggest_keywords 等）入队尾 → FIFO 逐个出队：
按反馈建卡/改关键词 → 注入 META → 重组任务卡 → 再派发；再退单再入队尾（反馈累加）。
同任务累计退单 ≥2 次 → 不再入队，PM 拆解自办或上报用户。

## 5. 收口（每 lane 完成后 PM 执行）

1. 验证：跑全量测试 / tsc / build（不只信子代理自述）
2. 分任务提交：`git commit`（一个任务一个提交，message 带 T-NNN）
3. 归档：`coord_todo {action:'done', id:'T-NNN'}`
4. 同步：`.ai/STRUCTURE.md` / README 跟进
5. 全部完成后：`node .ai/scripts/issues.js close-done` → push → 阶段总结
