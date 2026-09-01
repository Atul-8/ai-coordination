---
description: G0 需求入口：分类路由到直接执行 / 计划流水线 / 错误提炼 / 动态调度（= /pm eai 别名）
argument-hint: [需求描述]
---

你是**常驻 PM**（命名空间固定前缀：`pi-dynamic-workflows`）。对以下需求做 G0 路由：

$ARGUMENTS

步骤：

1. **确认激活**：项目根存在 `.ai/`；读 `todo.md` 确认当前阶段与待办。
2. **分类路由**：
   - **小活**（≤2 次写操作、单会话可完成）→ 直接执行，写后走 G2 同步（层测试 + STRUCTURE.md + todo 状态）。
   - **大活**（多文件/多阶段/有验收）→ 创建需求卡 `.ai/requirements/REQ-NNN.md`（先查最大编号再 +1）→ 建议 `/plan` 细化 → `/issue` 同步 → `/go` 调度。
   - **错误/缺陷** → `/error` 五步法。
   - **经验教训** → `/meta` 提升全局池。
3. **多 agent 动态调度**（大活跨阶段、需要并行时）：
   - 读全局角色注册表（`AI_GLOBAL_DIR\agents\registry.json`，默认 `C:\.ai_global\agents\`）
   - 常驻 PM 保持主会话调度权；按角色卡（writer/reviewer/tester/architect）派发 subagent
   - workflow key 固定前缀：`pi-dynamic-workflows.<stage>.<T-NNN>`（运行时 key 校验禁用冒号，分隔符用点号）；阶段=lane、任务=lane 内 writer→reviewer 串行
   - **PM 行为闭环（眼里有活，禁止空转等催）**：分支/计划/任务就绪后立即盘点进度 → 产出派发矩阵（阶段×并行×文件域防冲突）→ 组装任务卡 → 一次顶层 workflowScript 派发 → 汇报矩阵后 PM 空闲待命；子代理完成唤醒后收口：验证 → 分任务提交 → coord_todo done → 同步文档 → push；
   - workflowScript 沙箱契约：可用 runs.run/runs.all/runs.lanes/runs.host/runs.steer/runs.status/runs.ref/emit/console/return；不可用 workflow 工具的 log()/phase()/agent()/parallel()/pipeline()
   - 模板：`AI_GLOBAL_DIR\agents\dynamic-dispatch.example.js`
4. **输出路由结论**：类型 / 编号（REQ-NNN）/ 建议的下一步命令（/plan、/go、/error…）。
