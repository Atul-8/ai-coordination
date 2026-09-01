# AGENTS.md — pi-ai-coordination 运行时规范

> 本文件由 pi-ai-coordination 框架在项目初始化时部署（`scripts/init-project.js`）。
> **激活检测**：项目根存在 `.ai/` 目录 = 框架启用，以下规则生效；否则全部忽略。
> 完整铁律（G0-G4）见技能 `coordination`（skills/coordination/SKILL.md）。

## 核心思想（七层分治）

七层架构：coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）→ shared（共享）+ testing（测试）+ docs（文档）。
依赖单向向下（shared 零依赖），跨层必须走接口。结构地图：`.ai/STRUCTURE.md`（写操作后同步）。

## 任务流水线（todo → plan → issue → go）

```
/pm      需求入口（G0 路由：小活直接干，大活走流水线，错误走 G3）
/plan    计划模式：只读探索 → Plan: 步骤 → 用户确认
         → 落盘 docs/plans/PLAN-NNN-*.md → 步骤自动登记为 todo.md 任务
/issue   node .ai/scripts/issues.js sync：待办任务 ↔ git issues（gh / GITEE_TOKEN）
/go      阶段性调度：交互确认 → 按序执行 → 每完成一项 coord_todo done
/status  项目状态报告（/coord-status 为扩展原生命令）
/error   G3 五步法错误提炼
/meta    经验提升到全局 META 池
```

**todo.md 是唯一任务事实源**，行格式：

```
- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
      │            │              │       └ /go 调度时自动写入的 pi session 前 8 位
      │            │              └ issues.js sync 回写的 issue 编号
      │            └ 阶段标签，对应下方「阶段定义」小节
      └ [ ] 待办 / [~] 进行中 / [x] 完成
```

- 任务行只能用 `coord_todo` 工具维护，**禁止用 edit/write 直接改任务行**。
- 阶段定义（`- s1: 标题`）可手工编辑；`/plan` 保存时自动回写 `<!-- plan:docs/plans/... -->`。

## 会话与状态（session 原生）

- **不维护** WORKSTATE.md / LOG.md：会话上下文由 pi 原生承担（`/resume`、`/tree`、`/fork`；bash 内可用 `$PI_SESSION_FILE` / `$PI_SESSION_ID`）。
- 任务 ↔ 会话关联记录在 todo.md 行内 `@session:` 标记；详细过程在 pi 会话树里，按需 `/tree` 回溯。

## 铁律卡片

| 门 | 何时 | 动作 |
| --- | --- | --- |
| G0 | 任何需求进来 | 路由：小活直接做；大活 → REQ 卡 + /plan 流水线；错误 → G3 |
| G1 | 开门 / resume | 确认 todo.md 进度 + META 规则加载（session_start 自动提示；状态：/coord-status） |
| G2 | 任何写操作后 | 跑层测试 → 更新 .ai/STRUCTURE.md / REQ / todo 状态 → 再写下一处 |
| G2.5 | 任何新开发前 | 先证明测试体系能跑（红→绿），再写实现 |
| G3 | 出错时 | 五步法：现象→根因→修复→预防→META（`.ai/errors/raw/ERR-NNN.md`，编号先查最大值） |
| G4 | 离场前 | coord_todo 归档 + close-done 关 issue + git 提交推送 + STRUCTURE 校验 |

## 编号规则

- 任务 T-NNN（todo.md 自动递增）；计划 PLAN-NNN（docs/plans/ 自动递增）
- 需求 REQ-NNN、错误 ERR-NNN（.ai/ 内手工，**先查现有最大编号再递增**）
- META 规则：项目池 META-NNN（`.ai/errors/distilled/meta-rules.md`）；全局池 META-NNNN（`AI_GLOBAL_DIR`，默认 `C:\.ai_global`）

## 大任务派发（全局智能体调配 · 动态调度）

角色注册表与角色卡在全局池：`AI_GLOBAL_DIR\agents\registry.json` + `cards\*.md`（默认 `C:\.ai_global\agents\`）。

- **命名空间（固定前缀，勿改）**：`pi-dynamic-workflows`；动态 lanes 的 workflow key 一律
  `pi-dynamic-workflows.<stage>.<T-NNN>`；常驻命名 agent 固定名 `pi-dynamic-workflows-pm`
- **pm（调度者，常驻主会话）**：不派发自己——负责 G0 路由、动态调度各阶段 subagent、结果汇总
- **PM 行为闭环（眼里有活，禁止空转等催）**：
  1. 分支/计划/任务就绪后必须立即：盘点进度（todo/PLAN）→ 产出派发矩阵（阶段×并行×文件域防冲突）
     → 组装任务卡（角色卡+任务卡）→ 一次顶层 workflowScript 派发 → 向用户汇报矩阵后 PM 空闲待命；
  2. 不允许出现「分支已建、任务已登记、却无派发就停轮」的状态——那是 PM 失职；
  3. 子代理完成唤醒后 PM 收口：验证（vitest/tsc/build）→ 分任务提交 → coord_todo done →
     STRUCTURE/README 同步 → push。
- **writer / reviewer / tester / architect**：subagent 执行；阶段 = lane（无依赖可并行接入），
  任务 = lane 内 writer→reviewer 串行；lane 完成即动态续派
- 派发 = 角色卡 + 任务卡（todo.md 描述 + REQ 文档）组合成 task；模板见
  `pi-ai-coordination/templates/agents/dynamic-dispatch.example.js`
- **workflowScript 沙箱契约（subagent 工具，违反即运行时崩溃）**：
  可用 `runs.run / runs.all / runs.lanes / runs.host / runs.steer / runs.status / runs.ref / emit / console / return`；
  不可用 `workflow` 工具的 log()/phase()/agent()/parallel()/pipeline()；
  key 校验 `^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$` —— 禁用冒号，分隔符用点号
