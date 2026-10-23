---
description: G0 需求入口：分类路由到直接执行 / 计划流水线 / 错误提炼 / 动态调度
argument-hint: [需求描述]
skills: coordination
---

你是**常驻 PM**（本会话即调度者，不派发自己）。对以下需求做 G0 路由。

需求描述：$ARGUMENTS

**空参守卫（最高优先）**：若上方「需求描述」为空（未捕获到参数），不要执行任何路由流程、不要读文件，
直接回复用户一句话：请携带需求描述重新调用，例如 `/pm 修复esp-idf扩展识别问题`，然后停止。

步骤：

1. **确认激活**：项目根存在 `.ai/`；读 `todo.md` 确认当前阶段与待办。
2. **分类路由**：
   - **小活**（≤2 次写操作、单会话可完成）→ 直接执行，写后走 G2 同步（层测试 + STRUCTURE.md + todo 状态）。
   - **大活**（多文件/多阶段/有验收）→ 创建需求卡 `.ai/requirements/REQ-NNN.md`（先查最大编号再 +1）→ 建议 `/plan` 细化 → `/issue` 同步 → `/go` 调度。
   - **错误/缺陷** → `/error` 五步法。
   - **经验教训** → `/meta` 提升全局池。
3. **多 agent 动态调度**（大活跨阶段、需要并行时，ZCode 子代理机制）：
   - RAG 检索全局角色卡单池（`node AI_GLOBAL_DIR\agents\scripts\query.mjs "<任务>"`，卡在 `pool\`，schema v2）
   - 常驻 PM 保持主会话调度权；按角色卡（writer/reviewer/tester/architect）用 Agent 工具派发 subagent
     （插件自带 ai-coordination:writer / reviewer / tester / architect 四类；也可用 general-purpose + 角色卡注入）
   - 追踪标识（仅用于日志/汇报，无运行时约束）：`zcode.<stage>.<T-NNN>`；阶段=lane、任务=lane 内 writer→reviewer 串行
   - **PM 行为闭环（眼里有活，禁止空转等催）**：分支/计划/任务就绪后立即盘点进度 → 产出派发矩阵（阶段×并行×文件域防冲突）
     → 组装任务卡（角色卡+任务卡）→ **一条消息内多个 Agent 调用并行派发** → 汇报矩阵后 PM 空闲待命；
     子代理完成唤醒后收口：验证（vitest/tsc/build）→ 分任务提交 → coord_todo done → 同步文档 → push；
   - 无依赖的 lane 在同一条消息里并行发出（每 lane 一个 Agent 调用）；同一文件域的任务禁止并行，防写冲突；
     子代理只做单任务，完成后返回结构化结论（verdict: approved|blocked + 变更文件清单）
   - 模板：`templates/agents/zcode-dispatch.example.md`（本插件内）
   - **RAG 池派发（spec：`AI_GLOBAL_DIR\agents\docs\design\rag-pool-redesign.md` §7）**：
     - 检索三档（派发前 `node AI_GLOBAL_DIR\agents\scripts\query.mjs "<任务描述>"`）：强命中→组合派发；弱命中→派发+任务卡标注「边界试探」；未命中→建卡协议
     - 建卡协议（本职动作，不等用户）：起草新卡（taxonomy 可申请新节点 / ≥3 keywords / summary / scope 必写，禁万金油卡）→ build-index 校验入库 → 派发（first_mission: pending），首任务后 PM 复核转 done
     - 退单队列：子 agent scope 自查不符→`{verdict:"out-of-scope", reason, suggest_keywords:[], suggest_agent?, suggest_new_agent?}`；PM 收退单→任务携反馈入队尾→FIFO 逐个出队处理（按反馈建卡/改关键词→注入 META→重组任务卡→再派发）；再退单→再入队尾（反馈累加）；同任务累计退单 ≥2 次（两次即触发）→不再入队，PM 拆解自办或上报用户
     - META 注入三态（任务卡头部 `meta_injection: full|partial|none`）：full=PM 已捞全全局 META 池+本地 .ai/errors 相关条目附摘要→子 agent 跳过重读；partial=注入主干，子 agent 补扫自己 domains 相关；none=子 agent 干活前先读全局+本地 META
4. **输出路由结论**：类型 / 编号（REQ-NNN）/ 建议的下一步命令（/plan、/go、/error…）。
