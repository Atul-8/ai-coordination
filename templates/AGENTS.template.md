# AGENTS.md — dsh-eai-workflow 运行时规范

> 本文件由 dsh-eai-workflow 插件在项目初始化时部署（`eai_init`）。
> **激活检测**：项目根存在 `.ai/` 目录 = 框架启用，以下规则生效；否则忽略。
> 完整铁律（G0-G4）见技能 `eai-coordination`。

## 核心思想（七层分治）

七层架构：coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）→ shared（共享）+ testing（测试）+ docs（文档）。
依赖单向向下（shared 零依赖），跨层必须走接口。结构地图：`.ai/STRUCTURE.md`（写操作后同步）。

## 任务流水线（计划 → 落盘 → 调度 → 归档）

```
需求入口（G0 路由：小活直接干，大活走流水线，错误走 G3）
  → 外部方案检索（开源仓库 / 官方文档 / 已验证做法；不闭门造车）
  → 问题分解（n 个可独立验收的小问题，每个带验收测试）
  → 计划模式（只读探索 → exit_plan_mode 审批）
  → eai_plan_save 落盘 docs/plans/PLAN-NNN-*.md + 步骤登记 todo.md
  → eai_issue sync 同步 git issues
  → /eai-go <stage> 阶段调度 → 逐项 eai_todo done
  → eai_issue close-done → G4 离场
```

todo.md 是**唯一任务事实源**，行格式：

```
- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
      │            │              │       └ 调度时写入的宿主 session 前 8 位
      │            │              └ issues 同步回写
      │            └ 阶段标签，对应「阶段定义」小节
      └ [ ] 待办 / [~] 进行中 / [x] 完成
```

- 任务行只能用 `eai_todo` 工具维护，**禁止用 edit/write 直接改任务行**。
- 阶段定义（`- s1: 标题`）可手工编辑；`eai_plan_save` 保存计划时自动回写 `<!-- plan:docs/plans/... -->`。

## 会话与状态（宿主原生）

- 会话上下文由宿主承担（DSH：会话日志 / 恢复 / fork；pi：`/tree` `/fork`），不维护 WORKSTATE.md / LOG.md。
- 任务 ↔ 会话关联记录在 todo.md 行内 `@session:` 标记；详细过程在会话日志里按需回溯。
- **跨宿主接力**：DSH / pi / ZCode 之间切换时写交接卡 `.ai/HANDOFF.md`（`eai_handoff write`）；接手方先跑卡片「验证」，按「下一步」续作，然后 `eai_handoff consume`。

## 工具与命令（DSH）

| 工具 | 作用 |
| --- | --- |
| `eai_init` | 初始化项目 coordination 层（幂等） |
| `eai_todo` | 任务看板与任务行维护（单一写者） |
| `eai_plan_save` | 计划落盘 + 步骤登记 |
| `eai_status` | 全量状态（todo/META/HANDOFF/结构） |
| `eai_issue` | todo.md ↔ git issues |
| `eai_error` | G3 五步法 + META 蒸馏 |
| `eai_meta` | 项目 META 提升全局池 |
| `eai_handoff` | 跨宿主交接卡 write/read/consume |
| `eai_agent` | RAG 角色卡池：检索 / 建卡 / 自升级 / 记忆沉淀 |
| `eai_dispatch` | 派发矩阵 + 任务卡（落盘 `.ai/dispatch/`） |
| `eai_recall` | 旧经验检索（ERR / META / 角色记忆） |
| `eai_arch` | 七层单向依赖检查 |
| `eai_research` | 外部方案检索记录（计划门禁） |

命令：只向用户暴露 `/eai-pm <需求>`（G0 入口）；其余能力由模型用 `eai_*` 工具完成，不再提供 `/eai-*` 用户命令。

> 其他宿主：pi / ZCode 使用 `/pm` `/plan` `/issue` `/go` `/error` `/meta` `/status`；工具名相同（`eai_todo`）。

## 铁律卡片

| 门 | 何时 | 动作 |
| --- | --- | --- |
| G0 | 任何需求进来 | 路由：小活直接做；大活 → REQ 卡 + 计划模式；错误 → G3 |
| G1 | 开门 / resume | 确认 todo.md 进度 + META 规则 + 读 `.ai/HANDOFF.md`（open 卡必读） |
| G2 | 任何写操作后 | 跑层测试 → `eai_arch` 查单向依赖 → 更新 `.ai/STRUCTURE.md` / REQ / todo 状态 → 再写下一处 |
| G2.5 | 任何新开发前 | 先证明测试体系能跑（红→绿），再写实现 |
| G3 | 出错时 | 五步法：现象→根因→修复→预防→META；先 `eai_recall` 对照旧经验（`.ai/errors/raw/ERR-NNN.md`） |
| G4 | 离场前 | 归档 todo + close-done 关 issue + git 提交推送 + STRUCTURE 校验 |

## 编号规则

- 任务 T-NNN（todo.md 自动递增）；计划 PLAN-NNN（docs/plans/ 自动递增）
- 需求 REQ-NNN、错误 ERR-NNN（.ai/ 内，**先查现有最大编号再递增**）
- META 规则：项目池 META-NNN（`.ai/errors/distilled/meta-rules.md`）；全局池 META-NNNN（`AI_GLOBAL_DIR`，默认 `C:\.ai_global`）

## 研究与分解（G0/G2 纪律）

1. **不闭门造车**：非平凡实现前先检索（`web_search` / `web_fetch`：官方文档、开源仓库、已验证方案）。用 `eai_research` 记录主题、来源、取舍；`eai_plan_save` 不带 research 且不带 `skip_research` 理由时会拒绝落盘。优先复用；查无方案才自研，并写明原因。
2. **问题分解**：把需求拆成 n 个可独立验收的小问题；多步骤计划的 `acceptance` 必填且与 `steps` 一一对应。
3. **逐步验收再整合**：每个小问题先红→绿，全部通过后才做集成；集成单独列一步，不跳步。
4. **旧经验先用**：开工或报错先 `eai_recall <关键词>`；`eai_error` 会自动召回相关 ERR/META/记忆，避免重复踩坑。

## 第三方代码与许可

- 复用他人代码前先在会话里警告：来源、许可证、使用范围。
- 非 MIT（Apache/GPL/LGPL/MPL/CC-BY…）必须取得用户书面同意后才能用；MIT/ISC/BSD 也要在项目 README 致谢。
- 记录以 README「致谢与第三方代码」+ 会话警告为主；发版时再补 release notes。

## 大任务派发（DSH 原生）

- 检索角色卡：`eai_agent {action:'query', task}`（强命中组合派发｜弱命中标注边界试探｜缺口建卡）。
- 生成矩阵：`eai_dispatch {stage}` → 阶段 × 任务 × 角色卡 × 缺口，落盘 `.ai/dispatch/`（md + 机器可读 json，含每个子 agent 的 prompt）。
- 执行：`subagent`（独立上下文）/ `subagent_fork`（继承会话）/ `workflow`（`pipeline` 阶段内串行、阶段间无屏障）/ `team_task_*`（共享任务 DAG）。
- **PM 不阻塞**：用 `subagent`（启动即返回）或 `workflow` 后台模式派发；派发后向用户汇报矩阵并待命，不轮询子代理。子代理完成通知到达后再收口（验证 → 提交 → `eai_todo done`）。
- 派发纪律：阶段 = lane，任务 = lane 内 writer→reviewer 串行；同文件域不并行；每个任务卡必须含任务 ID、目标、验收命令、写入范围、角色 scope、`meta_injection`。
- 退单：子 agent scope 自查不符 → `{verdict:"out-of-scope", reason, suggest_keywords}`；PM 收退单入队尾 FIFO 重组，同任务累计 2 次即拆解或上报。
- PM 收口：验证（测试/类型检查/构建）→ 分任务提交 → `eai_todo done` → 同步文档；子 agent 报告不算完成。

## Agent 自我成长（三层沉淀）

1. **角色记忆**：任务收口 `eai_agent {action:'memory_add', owner, type, title, content}` → `AI_GLOBAL_DIR/agents/memory/<id>/`。
2. **自卡升级**：只改自己的卡（keywords / scope），`eai_agent {action:'update', id, note}` 自动 version+1；首任务复核 `first_mission_done`。
3. **全局 META**：项目内 `eai_error` 五步法；确认跨项目普适 → `eai_meta promote`（META-NNNN）。
4. 卡池维护：禁万金油卡；taxonomy 变更走评审（诞生/繁荣/剔除/合并），不物理删。技能 `eai-growth` 是完整协议。