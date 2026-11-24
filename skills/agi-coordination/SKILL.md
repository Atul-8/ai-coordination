---
name: agi-coordination
description: DSH 七层分治协调纪律（G0-G4 + todo/plan/issue 流水线 + 交接卡）。当项目根存在 .ai/、用户提到协调框架/初始化/任务调度/阶段计划/错误提炼/META，或需要 coord_* 工具与 /coord-* 命令时使用。
whenToUse: 项目内有 .ai/ 目录；或用户要求初始化 coordination、做阶段计划、调度任务、同步 issue、提炼错误与 META、跨宿主交接。
---

# agi-coordination — 七层分治纪律（DSH 原生版）

本技能是 pi-ai-coordination 的 DSH 重构：宿主会话日志承担上下文，todo.md 承担任务事实，
协调能力由 13 个 `coord_*` 工具与 `/coord-*` 命令提供。激活条件：项目根存在 `.ai/`（`findCoordDir` 向上查找）。

## 项目初始化（coord_init）

用户要求「初始化本项目 / 重构为协调框架」或 `/coord-init` 时：

1. 项目根已有 `.ai/` → 不要重复初始化，读 `todo.md` 报告状态，转入 G0/G1。
2. 否则调用 `coord_init`（可传 root）；它会部署 AGENTS.md 规范块、todo.md、`.ai/`、`docs/plans/`，
   并刷新 `.ai/scripts/issues.js`。
3. 汇报 created / skipped；引导：登记阶段 → 计划模式 → 审批后 `coord_plan_save` → `/coord-go s1`。

## G0 · 入口路由

任何需求先分类，不直接开写：

| 类型 | 去向 |
| --- | --- |
| 小活（单文件、一次对话可完成） | 直接执行，写后仍走 G2 |
| 大活（多文件/多阶段/有验收/需跨会话） | REQ 卡（`.ai/requirements/`）→ 计划模式 → `coord_plan_save` → `coord_issue sync` → `/coord-go` |
| 错误/缺陷 | G3 五步法（`coord_error`） |
| 经验教训 | `coord_meta promote` 提升全局池 |

判断标准：需要 ≥2 次写操作、或跨会话继续、或用户要求计划 → 大活。

**研究与分解（大活入口必做）**：

1. 先检索外部已有方案（`web_search` / `web_fetch`：官方文档、开源仓库、已验证做法），用 `coord_research` 记录来源与取舍；`coord_plan_save` 不带 research / skip_research 会拒绝落盘。
2. 把需求拆成 n 个可独立验收的小问题；多步骤计划的 `acceptance` 必填且与 `steps` 一一对应。
3. 逐个红→绿，最后单独一步做集成；禁止跳过验收一把梭。

## G1 · 开门

1. `coord_todo {action:'list'}` 确认阶段与待办；有 `~` 进行中任务优先续作。
2. 读 `.ai/errors/distilled/meta-rules.md`，让 META 规则参与本轮决策（工具 `coord_meta list` 可概览）。
3. 读 `.ai/HANDOFF.md`：存在且状态 open → 先跑卡上「验证」，按「下一步」续作，完成后 `coord_handoff consume`。
4. 任务已有 `@session:` 关联；需要历史细节时查宿主会话日志/分支，**不要编造上次进度**。
5. 开发到一半要换宿主（DSH ↔ pi ↔ ZCode）→ 先 `coord_handoff write`。

## G2 · 同步门控（每次写操作后）

1. 跑层测试（testing 层对应模块）；
2. 跑 `coord_arch` 检查单向依赖（presentation → interface → core → shared；反向/跨层先落 interface 契约）；
3. 更新 `.ai/STRUCTURE.md`（新增/移动/删除文件时）；
4. 更新任务/需求状态（`coord_todo start|done`、REQ 卡回写）。

依赖方向铁律：shared ← core ← interface ← presentation；testing 可依赖全部。跨层引用 = 架构破坏，先在 STRUCTURE.md 标注再动手。

## G2.5 · 先验证后开发

新模块开发前先证明测试体系能跑：写必然失败的测试（红）→ 确认失败信息正确 → 最小实现变绿。
禁止「先实现后补测试」。

## G3 · 五步错误提炼（coord_error）

任何构建/测试/运行时报错当场提炼，五步缺一不可：

1. **现象**：精确报错、复现步骤、期望 vs 实际（写入 `.ai/errors/raw/ERR-NNN.md`，编号由工具自动递增）
2. **根因**：定位过程 + 结论（不写「玄学」，不许「暂时好了」）
3. **修复**：改了什么（文件/提交/命令）
4. **预防**：检查、约束、自动化手段
5. **META 蒸馏**：按受控词表（BUILD/ENV/TEST/DATA/API/ARCH/PROC/DOC/SEC/PERF/DEP/COLLAB）提一条规则 → 项目池 `### META-NNN`；确认普适后 `coord_meta promote`

连续 2 次同根因报错 → 停止修复，升级为 REQ 卡走计划流程。
动手前先 `coord_recall <关键词>` 召回旧 ERR/META/角色记忆；`coord_error` 也会自动附相关旧经验。

## G4 · 离场检查

1. todo.md 归档：完成任务 `[x]`，进行中清零或注明；
2. `coord_issue {action:'close-done'}` 关闭已完成 issue；
3. `.ai/STRUCTURE.md` 与实际目录一致（抽查）；
4. git 提交 + 推送；
5. 新 META 规则已写入；普适规则提示提升全局池。

## 计划模式 → 落盘

DSH 的计划模式（`exit_plan_mode`）负责只读探索与审批。计划被批准后：

1. 调用 `coord_plan_save {stage:'s1', steps:[...], acceptance:[...], research:'RESEARCH-NNN', notes:'...'}`；
   多步骤计划必须给 acceptance；research 来自 `coord_research`（纯文档任务用 `skip_research:'原因'` 显式跳过）。
2. 它会写 `docs/plans/PLAN-NNN-*.md`、回写阶段行 `<!-- plan:... -->`、把步骤登记为任务；
3. 需要 issue 时 `coord_issue {action:'sync', dry_run:true}` 预览，再真跑；
4. 调度用 `/coord-go s1`（写入 @session 并唤醒本会话）或逐项 `coord_todo done`。

不要在计划未被批准时落盘；不要把计划直接贴在回答里代替 `exit_plan_mode`。

## 命令总表

| 命令 | 作用 |
| --- | --- |
| `/coord init [root]` | 初始化（幂等） |
| `/coord status` | 全量状态 |
| `/coord todo` | 任务看板 |
| `/coord go s1` / `/coord go T-003` | 阶段/单任务调度 |
| `/coord issues [sync] [--dry-run] [--stage s1]` | todo ↔ issues |
| `/coord meta` | META 概览 |
| `/coord agents [任务]` | 角色卡池：列卡 / 检索 |
| `/coord dispatch [sN]` | 派发矩阵（落盘 `.ai/dispatch/`） |
| `/coord growth` | 自我成长状态 |
| `/coord recall <关键词>` | 旧经验检索 |
| `/coord arch` | 七层单向依赖检查 |
| `/coord research <主题> \| <来源…>` | 记录外部方案检索（计划门禁） |
| `/coord handoff [done]` | 读卡 / 消化交接 |

工具：`coord_init` `coord_todo` `coord_plan_save` `coord_status` `coord_issue` `coord_error` `coord_meta` `coord_handoff` `coord_agent` `coord_dispatch` `coord_recall` `coord_arch` `coord_research`。

- 多 agent 派发：`coord_agent query` 检索角色卡 → `coord_dispatch` 生成矩阵/任务卡 → `subagent` / `workflow` 执行（技能 `agi-dispatch`）。
- 自我成长：任务收口写 `coord_agent memory_add`；只改自己的卡用 `coord_agent update`；普适教训 `coord_meta promote`（技能 `agi-growth`）。

## 失败与降级

- 缺 `.ai/`：先 `coord_init`；不要假设已有结构。
- `coord_issue` 无 remote / 未登录：报告认证问题（GitHub `gh auth login`，Gitee `GITEE_TOKEN`），不要伪造 issue 编号。
- 只读沙箱：写操作会被拒绝；不要绕过，提示用户切换权限。
- workspace-write 下全局池写入会越界：提示需要 danger-full-access，或把 `AI_GLOBAL_DIR` 放到工作区内。