# AGENTS.md — dsh-ai-coordination 运行时规范

> 本文件由 dsh-ai-coordination 插件在项目初始化时部署（`coord_init`）。
> **激活检测**：项目根存在 `.ai/` 目录 = 框架启用，以下规则生效；否则忽略。
> 完整铁律（G0-G4）见技能 `agi-coordination`。

## 核心思想（七层分治）

七层架构：coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）→ shared（共享）+ testing（测试）+ docs（文档）。
依赖单向向下（shared 零依赖），跨层必须走接口。结构地图：`.ai/STRUCTURE.md`（写操作后同步）。

## 任务流水线（计划 → 落盘 → 调度 → 归档）

```
需求入口（G0 路由：小活直接干，大活走流水线，错误走 G3）
  → 计划模式（只读探索 → exit_plan_mode 审批）
  → coord_plan_save 落盘 docs/plans/PLAN-NNN-*.md + 步骤登记 todo.md
  → coord_issue sync 同步 git issues
  → /coord-go <stage> 阶段调度 → 逐项 coord_todo done
  → coord_issue close-done → G4 离场
```

todo.md 是**唯一任务事实源**，行格式：

```
- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
      │            │              │       └ 调度时写入的宿主 session 前 8 位
      │            │              └ issues 同步回写
      │            └ 阶段标签，对应「阶段定义」小节
      └ [ ] 待办 / [~] 进行中 / [x] 完成
```

- 任务行只能用 `coord_todo` 工具维护，**禁止用 edit/write 直接改任务行**。
- 阶段定义（`- s1: 标题`）可手工编辑；`coord_plan_save` 保存计划时自动回写 `<!-- plan:docs/plans/... -->`。

## 会话与状态（宿主原生）

- 会话上下文由宿主承担（DSH：会话日志 / 恢复 / fork；pi：`/tree` `/fork`），不维护 WORKSTATE.md / LOG.md。
- 任务 ↔ 会话关联记录在 todo.md 行内 `@session:` 标记；详细过程在会话日志里按需回溯。
- **跨宿主接力**：DSH / pi / ZCode 之间切换时写交接卡 `.ai/HANDOFF.md`（`coord_handoff write`）；接手方先跑卡片「验证」，按「下一步」续作，然后 `coord_handoff consume`。

## 工具与命令（DSH）

| 工具 | 作用 |
| --- | --- |
| `coord_init` | 初始化项目 coordination 层（幂等） |
| `coord_todo` | 任务看板与任务行维护（单一写者） |
| `coord_plan_save` | 计划落盘 + 步骤登记 |
| `coord_status` | 全量状态（todo/META/HANDOFF/结构） |
| `coord_issue` | todo.md ↔ git issues |
| `coord_error` | G3 五步法 + META 蒸馏 |
| `coord_meta` | 项目 META 提升全局池 |
| `coord_handoff` | 跨宿主交接卡 write/read/consume |

命令：`/coord status|todo|init|go <sN\|T-NNN>|issues|meta|handoff`；扁平别名 `/coord-status` `/coord-go` 等。

> 其他宿主：pi / ZCode 使用 `/pm` `/plan` `/issue` `/go` `/error` `/meta` `/status`；工具名相同（`coord_todo`）。

## 铁律卡片

| 门 | 何时 | 动作 |
| --- | --- | --- |
| G0 | 任何需求进来 | 路由：小活直接做；大活 → REQ 卡 + 计划模式；错误 → G3 |
| G1 | 开门 / resume | 确认 todo.md 进度 + META 规则 + 读 `.ai/HANDOFF.md`（open 卡必读） |
| G2 | 任何写操作后 | 跑层测试 → 更新 `.ai/STRUCTURE.md` / REQ / todo 状态 → 再写下一处 |
| G2.5 | 任何新开发前 | 先证明测试体系能跑（红→绿），再写实现 |
| G3 | 出错时 | 五步法：现象→根因→修复→预防→META（`.ai/errors/raw/ERR-NNN.md`） |
| G4 | 离场前 | 归档 todo + close-done 关 issue + git 提交推送 + STRUCTURE 校验 |

## 编号规则

- 任务 T-NNN（todo.md 自动递增）；计划 PLAN-NNN（docs/plans/ 自动递增）
- 需求 REQ-NNN、错误 ERR-NNN（.ai/ 内，**先查现有最大编号再递增**）
- META 规则：项目池 META-NNN（`.ai/errors/distilled/meta-rules.md`）；全局池 META-NNNN（`AI_GLOBAL_DIR`，默认 `C:\.ai_global`）

## 大任务派发（DSH 原生）

- 单任务委派：`subagent`（独立上下文）或 `subagent_fork`（继承会话上下文）。
- 多阶段 fan-out：`workflow` 工具写编排脚本（`pipeline`/`parallel`/`agent`），阶段 = 一组 lane，任务 = 阶段内串行；不要用 workflow 的 `log/phase` 之外未声明的 API。
- 共享任务板：`team_task_create / team_task_list / team_task_update`（需要共享任务 DAG 时用）。
- PM 纪律：计划与任务就绪后立即产出派发矩阵（阶段 × 并行 × 文件域防冲突）并派发，不允许「已登记却无派发就停轮」；子代理完成后验证（测试/类型检查/构建）→ 分任务提交 → `coord_todo done` → 同步文档。
- 可选 RAG 角色卡池：`AI_GLOBAL_DIR\agents\pool\*.md`，派发前检索；未命中先建卡（必写 scope，禁万金油卡）。