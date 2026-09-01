# ai-coordination

**AI 多智能体协作开发框架** —— 把「需求 → 计划 → 任务 → issue → 调度 → 复盘」整条流水线交给 AI 严格执行，人只做确认和验收。

> 本分支是**项目主页**：目的、结构、导航。框架本体与使用手册在 [`pi-ai-coordination`](https://github.com/Atul-8/ai-coordination/tree/pi-ai-coordination) 分支。

## 项目目的

让 AI 在真实项目里长期、多会话地干活而不散架。核心思路是**七层分治**：

```
coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）
    → shared（共享） + testing（测试） + docs（文档）
```

- **coordination 层**是框架的灵魂：G0–G4 五道铁律（路由 / 自动化 / 自查 / 错误提炼 / 离场）、todo.md 单一事实源、META 经验池，约束每一次 AI 会话的行为
- **其余六层**是它治理的对象：任何代码改动都必须落在正确的层里，STRUCTURE.md 校验保证结构不腐化

配套三条硬设计：

1. **框架 = 全局插件，项目 = 纯数据** —— 框架代码装一次全局共享；项目里只有 todo.md、`.ai/`、`docs/plans/` 等数据文件，随项目 git 走
2. **pi 原生会话树取代手写日志** —— 旧版 WORKSTATE.md / LOG.md 全部删除，任务↔会话用 `@session:` 内联关联
3. **全局经验池** —— `~/.ai_global`（Windows 默认 `C:\.ai_global`）跨项目沉淀 META 经验与智能体角色卡

## 目录（去哪找什么）

| 位置 | 内容 |
| --- | --- |
| **[`pi-ai-coordination` 分支](https://github.com/Atul-8/ai-coordination/tree/pi-ai-coordination#readme)** | **V2 框架本体 + 使用手册**（安装、初始化、命令总表、任务流水线、动态调度） |
| `masterV2`（本分支） | 项目前言 / 目录 / 路线图 |
| `master` | v1.2.3 最终版（Claude Code 插件形态）🔒 已冻结 |
| `dev` | v1.x 开发线 🔒 已冻结 |

### pi 用户从这里开始

```bash
pi install git:github.com/Atul-8/ai-coordination@pi-ai-coordination
```

装完后在 pi 会话里输入 `/coord-init` 即完成项目初始化。**完整使用手册（命令总表、`/eai` 组命令、流水线、多 agent 调度）请切到 [`pi-ai-coordination` 分支 README](https://github.com/Atul-8/ai-coordination/tree/pi-ai-coordination#readme)。**

## 演进与路线图

- **v1.x**（Claude Code 插件，2025）：CLAUDE.md 侵入式注入 + WORKSTATE/LOG 手工维护；实践中暴露四类问题（日志脱节、侵入式追加、任务拆分繁琐、调度靠口头）
- **v2.0.0-alpha 起**（pi 原生包，当前）：以上四点逐一重构为 pi 原生能力（session tree、AGENTS.md、todo.md + `/plan` + `/issue`、`/go` 阶段调度），并新增全局经验池与多 agent 动态调度
- 已实测：双通道安装/卸载、无头加载、`coord_todo` 端到端、幂等 init、`/eai` 命令族（pi 0.84.4）

- [ ] **0.2** —— npm 发布（`pi install npm:pi-ai-coordination`）、Gitee/GitHub issue 真同步实测
- [ ] **0.3** —— 动态调度强化：lane 级重试/汇总卡片、结构化验收
- [ ] **1.0** —— 稳定 API 契约 + 文档站
- [ ] **V2.0-claude** —— Claude Code plugin 形态映射（skills/prompts 结构直接复用）

---
*v1.x 贡献与历史见 `master` / `dev` 分支（已冻结）。*
