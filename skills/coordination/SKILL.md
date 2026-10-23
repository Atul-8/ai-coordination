---
name: coordination
description: ai-coordination 七层分治纪律（G0-G4 铁律 + todo/plan/issue 流水线）的 ZCode 插件版。当项目根存在 .ai/ 目录、用户提到协调框架、项目初始化、任务调度、阶段计划、错误提炼、META 规则、/pm /plan /issue /go /coord-init 流程、coord_todo 工具时使用。
---

# coordination — 七层分治纪律（ZCode 版）

本技能是 ai-coordination 框架的 ZCode 插件实现。相对 pi 版的核心映射：

- 任务事实源收敛为项目根 `todo.md`，由 **coord_todo MCP 工具**维护（本插件 `.mcp.json` 注册，会话自动连接）
- 会话状态由 **zcode 原生会话**承担——不维护 WORKSTATE.md / LOG.md；任务行 `@session:` 存 zcode session 前 8 位（coord_todo link 自动写入）
- 计划产出落盘 `docs/plans/`，只读探索/确认复用 **zcode 原生 plan mode**；落盘后步骤自动登记为任务
- 任务同步 git issues（`.ai/scripts/issues.js`）；调度统一走 `/go`
- 大任务派发走 **Agent 工具子代理**（本插件自带 writer/reviewer/tester/architect），不再有 pi workflowScript

激活：项目根存在 `.ai/`（向上查找）。

## 项目初始化（/coord-init）

当用户要求「用 ai-coordination 初始化本项目」或执行 /coord-init 时：

1. **定位脚本**：`$ZCODE_PLUGIN_ROOT/scripts/init-project.js`；找不到则
   `ls ~/.zcode/cli/plugins/cache/*/ai-coordination/*/scripts/init-project.js`。
2. **执行**：`node <init-project.js> <项目根>`（幂等；缺全局池时自动 bootstrap init-global.mjs——
   同时把**全局思维架构**部署到 `~/.zcode/AGENTS.md`，宿主级纪律对所有项目生效）。
3. **汇报**：stdout JSON 的 `project.created / project.skipped / global.bootstrapped / global.actions`。
4. **引导**：/pm 需求入口 → /plan 计划 → /issue 同步 → /go <stage> 调度；任务行仅经 coord_todo 维护。

> 项目根已有 `.ai/` 时直接报告状态并转入 G0/G1，不要重复初始化。

## G0 · 入口路由（/pm）

任何需求先分类，不直接开写：

| 类型 | 去向 |
| --- | --- |
| 小活（单文件、可一次对话完成） | 直接执行，但写后仍走 G2 同步 |
| 大活（多文件/多阶段/有验收） | 创建 REQ 卡（.ai/requirements/）→ /plan 计划 → /issue → /go |
| 错误/缺陷 | G3 五步法（/error） |
| 经验教训 | /meta 提升全局池 |

判断标准：需要 ≥2 次写操作、或需要跨会话继续、或用户要求计划 → 大活。

## G1 · 开门（SessionStart hook 自动化 + 人工项）

自动（本插件 hooks/scripts/session-start.mjs）：激活项目会话开启时注入 G1 上下文——阶段进度、进行中任务、META 计数、session 短 id、续作建议。
人工（模型在首轮对话时执行）：
1. 读 todo.md 确认当前阶段与待办；有 `~` 进行中任务 → 优先续作
2. 读 `.ai/errors/distilled/meta-rules.md`，让 META 规则参与本轮决策
3. 任务关联：被调度任务已有 `@session:` 标记（zcode session 前 8 位）；历史细节查 git log 与会话自身上下文，**不要**凭空编造上次进度

## G2 · 同步门控（每次写操作后）

写代码/文档 → 立即三连（未完成不写下一处）：
1. **跑层测试**：testing 层对应模块的单测（G2.5 保证其可运行）
2. **更新结构**：新增/移动/删除了文件 → `.ai/STRUCTURE.md` 模块清单同步
3. **更新状态**：任务推进用 coord_todo（start→doing / done），需求变更回写 REQ 卡

依赖方向铁律：shared←core←interface←presentation；测试层可依赖全部。
跨层引用 = 架构破坏，先在 STRUCTURE.md 标注再动手。

## G2.5 · 先验证后开发

新模块开发前，先证明测试体系能跑：
1. 写一个必然失败的测试（红）
2. 确认失败信息正确（不是环境错误）
3. 写最小实现变绿
禁止"先实现后补测试"。禁止跳过红→绿直接全量实现。

## G3 · 五步错误提炼（/error）

任何报错（构建/测试/运行时）当场提炼，五步缺一不可：

1. **现象**：精确报错、复现步骤、期望 vs 实际 → `.ai/errors/raw/ERR-NNN.md`
   （编号先 `ls .ai/errors/raw/` 查最大值再 +1；记录 zcode session 前 8 位——G1 上下文里有）
2. **根因**：定位过程 + 结论（不写"玄学"，不许"暂时好了"）
3. **修复**：改了什么（文件/提交）
4. **预防**：检查、约束、自动化手段
5. **META 蒸馏**：按受控词表（BUILD/ENV/TEST/DATA/API/ARCH/PROC/DOC/SEC/PERF/DEP/COLLAB）
   提炼一条规则 → `.ai/errors/distilled/meta-rules.md`（### META-NNN，编号连续）；确认普适后由 /meta 提升全局池

连续 2 次同根因报错 → 强制停止，升级为 REQ 卡走 /plan。

## G4 · 离场检查（每个工作单元结束）

1. todo.md 全部归档：完成任务 `[x]`（coord_todo done），进行中清零或注明
2. `.ai/scripts/issues.js close-done` 关闭已完成任务的 issue
3. `.ai/STRUCTURE.md` 与实际目录一致（ls/find 抽查）
4. git 提交 + 推送（.ai 若独立仓库单独提交）
5. 新增 META 规则已写入；若普适 → 提示用户 /meta 升全局池

## 大任务派发（全局智能体调配 · ZCode 子代理）

全局角色卡单池（RAG pool v2）：`AI_GLOBAL_DIR\agents\pool\*.md` + `taxonomy.yml` + `scripts\`（检索三档 query.mjs，派发前必跑）。
`AI_GLOBAL_DIR` 默认 `C:\.ai_global`（类 Unix `~/.ai_global`），环境变量可覆盖。

- **pm（调度者）**：主会话常驻——G0 路由、调度各阶段 subagent、结果汇总，**不派发自己**
- **PM 行为闭环（眼里有活，禁止空转等催）**：
  1. 分支/计划/任务就绪后必须立即：盘点进度（todo/PLAN）→ 产出派发矩阵（阶段×并行×文件域防冲突）→
     组装任务卡（角色卡+任务卡）→ 一条消息内多个 Agent 调用并行派发 → 向用户汇报矩阵后 PM 空闲待命；
  2. 不允许出现「分支已建、任务已登记、却无派发就停轮」的状态——那是 PM 失职；
  3. 子代理完成唤醒后 PM 收口：验证（vitest/tsc/build）→ 分任务提交 → coord_todo done →
     STRUCTURE/README 同步 → push。
- **writer / reviewer / tester / architect**：本插件 agents/ 提供同名子代理（ai-coordination:writer 等）；
  也可 Agent 工具 general-purpose + 角色卡注入
- **并行规则**：阶段 = lane（无依赖可并行）；任务 = lane 内 writer→reviewer 串行；
  **同一文件域的任务禁止并行**；lane 完成 PM 收口后动态续派下一批
- **派发 = 角色卡 + 任务卡**（todo.md 任务描述 + REQ 文档 + 阶段计划 + `meta_injection` 三态）组合成 Agent prompt；
  子代理按固定格式回 verdict（approved|blocked|out-of-scope）
- 派发模板：`templates/agents/zcode-dispatch.example.md`
- **RAG 池派发（自演化卡池，spec：`AI_GLOBAL_DIR\agents\docs\design\rag-pool-redesign.md`）**：
  派发前检索三档（`node AI_GLOBAL_DIR\agents\scripts\query.mjs "<任务>"`）：强命中→组合派发｜
  弱命中→派发+标注「边界试探」｜未命中→建卡协议（新卡必写 scope、禁万金油卡、first_mission: pending，
  首任务后复核转 done）；子 agent scope 自查不符可拒单（out-of-scope + suggest_keywords）→
  任务携反馈入队尾，FIFO 逐个出队重组再派，再退单再入队尾（反馈累加），累计 ≥2 次（两次即触发）PM 拆解自办或上报用户；
  任务卡头 `meta_injection: full|partial|none` 控制 META 预注入，避免子 agent 重复读

## 命令与工具总表

| 命令/工具 | 类型 | 作用 |
| --- | --- | --- |
| /pm | 命令 | G0 入口：需求分类与路由 |
| /plan | 命令 | 计划模式：只读探索 → 确认 → docs/plans 落盘 + todo 登记 |
| /go | 命令 | 阶段调度：选阶段 → 确认 → 并行派发/按序执行 |
| /issue | 命令 | issues.js sync 同步 git issues |
| /error | 命令 | G3 五步法记录 |
| /meta | 命令 | 经验提升全局池（AI_GLOBAL_DIR\meta） |
| /coord-status | 命令 | 全量状态报告 |
| /coord-init | 命令 | 项目初始化（init-project.js） |
| coord_todo | MCP 工具 | list/add/start/done/link/set_issue 维护 todo.md |

## pi 版 → ZCode 版对照

| pi 版 | ZCode 版 |
| --- | --- |
| pi 扩展 registerTool（coord_todo） | MCP server（mcp/coord-todo-server.mjs，.mcp.json 注册） |
| 扩展 session_start 状态条/部件/通知 | SessionStart hook additionalContext 注入（G1） |
| prompts/ 提示词模板 | commands/ 斜杠命令（$ARGUMENTS） |
| --coord-plan 旗标 + 工具门控 | zcode 原生 plan mode + /plan 命令流水线 |
| pi-subagents workflowScript（runs.*，key 禁冒号） | Agent 工具并行调用（一条消息多 lane，无 key 沙箱） |
| pi 会话树 /tree /fork /resume + PI_SESSION_FILE | zcode 原生会话；@session: 短 id 由 coord_todo link 写入（COORD_SESSION_ID 注入） |
| eai 组命令 + 平面别名 | 插件命令天然命名空间（ai-coordination:pm），无需别名 |
| pi 全局指令 `~/.pi/agent/AGENTS.md`（全局思维架构） | `~/.zcode/AGENTS.md`（init-global.mjs 幂等部署，9 节纪律同构移植） |
| dispatch 模板 dynamic-dispatch.example.js | templates/agents/zcode-dispatch.example.md |
