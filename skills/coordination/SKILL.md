---
name: coordination
description: pi-ai-coordination 七层分治纪律（G0-G4 铁律 + todo/plan/issue 流水线）。当项目根存在 .ai/ 目录、用户提到协调框架、项目初始化、任务调度、阶段计划、错误提炼、META 规则、/pm /plan /issue /go /coord-init 流程时使用。
---

# coordination — 七层分治纪律（pi 原生版）

本技能是 ai-coordination（Claude Code 版 v1.2.1）的 pi 重构。核心变化：
- 会话状态由 pi 原生会话树承担（JSONL、/tree、/fork、PI_SESSION_FILE）——**已删除** WORKSTATE.md / LOG.md 及其脚本
- 任务事实源收敛为项目根 `todo.md`，由 `coord_todo` 工具维护
- 计划产出落盘 `docs/plans/`，任务同步 git issues（`.ai/scripts/issues.js`）
- 调度统一走 `/go`（阶段确认 → 按序执行 → 逐项归档）

激活：项目根存在 `.ai/`（`findCoordDir` 向上查找）。

## 项目初始化（/coord-init）

当用户要求「用 pi-ai-coordination 初始化本项目 / 重构为协调框架」或执行 /coord-init（别名 /aic-init-project）时：

1. **确定包根**：本技能位于 `<包根>/skills/coordination/`，因此初始化脚本为 `<包根>/scripts/init-project.js`（向上两级）。
2. **执行**：`node <包根>/scripts/init-project.js <项目根>`（不传参数则默认当前工作目录；脚本幂等，重复执行安全）。
3. **汇报**：读取 stdout JSON 的 `project.created / project.skipped / global.created`，向用户说明新建与跳过项。
4. **引导**：初始化后提示流水线入口 —— /pm 需求入口 → /plan 计划 → /issue 同步 → /go <stage> 调度；提醒 task 行仅经 coord_todo 维护。

> 项目根已存在 `.ai/` 时（项目已初始化），直接报告状态并转入 G0/G1 流程，不要重复初始化。

## G0 · 入口路由（/pm）

任何需求先分类，不直接开写：

| 类型 | 去向 |
| --- | --- |
| 小活（单文件、可一次对话完成） | 直接执行，但写后仍走 G2 同步 |
| 大活（多文件/多阶段/有验收） | 创建 REQ 卡（.ai/requirements/）→ /plan 计划 → /issue → /go |
| 错误/缺陷 | G3 五步法（/error） |
| 经验教训 | /meta 提升全局池 |

判断标准：需要 ≥2 次写操作、或需要跨会话继续、或用户要求计划 → 大活。

## G1 · 开门（session_start 自动化 + 人工项）

自动（status.ts 扩展完成）：恢复 todo 进度小部件、META 规则计数、session 提示。
人工（模型在首轮对话时执行）：
1. `/todo` 或读 todo.md 确认当前阶段与待办；有 `~` 进行中任务 → 优先续作
2. 读 `.ai/errors/distilled/meta-rules.md`，让 META 规则参与本轮决策
3. 若 `.ai/` 是独立 git 仓库 → `git -C .ai fetch && status` 校验一致性
4. 任务关联：被调度任务已有 `@session:` 标记；需要历史细节时用 pi 会话树（/tree、/fork）回溯，**不要**凭空编造上次进度

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
   （编号先 `ls .ai/errors/raw/` 查最大值再 +1；.ai 若为独立仓库先 pull）
2. **根因**：定位过程 + 结论（不写"玄学"，不许"暂时好了"）
3. **修复**：改了什么（文件/提交）
4. **预防**：检查、约束、自动化手段
5. **META 蒸馏**：按受控词表（构建 BUILD/环境 ENV/测试 TEST/数据 DATA/接口 API/架构 ARCH/流程 PROC/文档 DOC/安全 SEC/性能 PERF/依赖 DEP/协作 COLLAB）提炼一条规则 → `.ai/errors/distilled/meta-rules.md`（### META-NNN，编号连续）；确认普适后由 /meta 提升全局池

连续 2 次同根因报错 → 强制停止，升级为 REQ 卡走 /plan。

## G4 · 离场检查（每个工作单元结束）

1. todo.md 全部归档：完成任务 `[x]`（coord_todo done），进行中清零或注明
2. `.ai/scripts/issues.js close-done` 关闭已完成任务的 issue
3. `.ai/STRUCTURE.md` 与实际目录一致（ls/find 抽查）
4. git 提交 + 推送（.ai 若独立仓库单独提交）
5. 新增 META 规则已写入；若普适 → 提示用户 /meta 升全局池

## 大任务派发（全局智能体调配 · 动态调度）

全局角色注册表：`AI_GLOBAL_DIR\agents\registry.json`（默认 `C:\.ai_global\agents\`），角色卡在 `cards\*.md`。

- **命名空间（固定前缀，勿改）**：`pi-dynamic-workflows`
  - 动态 lanes 的 workflow key：`pi-dynamic-workflows:<stage>:<T-NNN>`
  - 常驻命名 agent：`pi-dynamic-workflows-pm`（子角色建议 `pi-dynamic-workflows-<name>`）
- **pm（调度者）**：主会话常驻——G0 路由、动态调度各阶段 subagent、结果汇总，不派发自己
- **writer / reviewer / tester / architect**：subagent 执行
- **动态调度（多 agent 接入不同阶段）**：阶段 = lane（无依赖阶段并行接入），
  任务 = lane 内串行 stage（writer → reviewer）；lane 完成即读结果动态续派；
  结果仅认 `structuredOutput.verdict === "blocked"`
- 派发 = 角色卡 + 任务卡（todo.md 任务描述 + REQ 文档 + 阶段计划）组合成 subagent task；
  父会话保持调度权与验收权；模板：`templates/agents/dynamic-dispatch.example.js`
- 注册表可编辑：增加角色只需加 JSON 条目 + 角色卡文件

## 命令总表

| 命令 | 类型 | 作用 |
| --- | --- | --- |
| /pm | 提示词 | G0 入口：需求分类与路由 |
| /plan | 扩展 | 计划模式（Ctrl+Alt+P，--coord-plan 旗标）→ docs/plans 落盘 + todo 登记 |
| /todo | 扩展 | 任务看板 |
| /issue | 提示词 | issues.js sync 同步 git issues |
| /go | 扩展 | 阶段调度：选阶段 → 确认 → 按序执行 |
| /error | 提示词 | G3 五步法记录 |
| /meta | 提示词 | 经验提升全局池（AI_GLOBAL_DIR\meta，默认 C:\.ai_global） |
| /status | 提示词 | 状态报告（/coord-status 为原生命令） |

## pi 原生能力对照（旧 → 新）

| 旧（Claude Code 版） | 新（pi 版） |
| --- | --- |
| WORKSTATE.md 手写续作上下文 | pi 会话树 /resume /tree /fork；todo 行内 @session 关联 |
| LOG.md 事件流水 | pi 会话 JSONL 本身 + git log |
| cat SKILL.md >> CLAUDE.md（全局追加） | init-project.js 部署项目级 AGENTS.md（幂等插桩） |
| TASKS.md PM 任务表 + tasks.js | todo.md + coord_todo 工具 + /go 调度 |
| g1-check/g2-check/g4-check 脚本 | G1 自动化进扩展 session_start；G2/G4 成为纪律卡片 |
| pm-dispatch 双智能体消息队列 | pi-subagents subagent 编排 + 全局角色注册表（AI_GLOBAL_DIR\agents） |
