# ai-coordination V2 — 项目计划（pi-ai-coordination）

> **状态**：v1.x（Claude Code 插件形态，v1.2.3）已冻结 → V2 以 **pi 原生包** 形态重构。
> 本分支（`masterV2`）仅承载项目计划与分发说明；框架本体在 **`pi-ai-coordination`** 分支（命令总表详见其 README）。
> *最后更新：2025-06 · 全部安装/卸载命令已在 pi 0.84.4 实测*

## ✅ 实测验证记录（pi 0.84.4）

| 验证项 | 结果 |
|---|---|
| 全局安装 → `pi list` 注册 → init 部署 → 无头加载 | ✅ |
| 项目级安装（`-l`）→ 信任机制（`-a`）→ init → 无头加载 → 卸载 | ✅ |
| `coord_todo` 工具端到端（两种通道均真实调用并渲染任务清单） | ✅ |
| coordination 技能注入系统提示 | ✅ |
| `issues.js` Gitee remote 解析 + `sync --dry-run` | ✅（真同步待 `GITEE_TOKEN`） |
| 幂等性（重复 init 不重复插桩 AGENTS.md） | ✅ |
| 发现并修复：`--plan` 标志与 plannotator 冲突 → 改名 `--coord-plan` | ✅ `5ad9fe7` |

## 📦 一键安装（分发部署）

### 全局安装（推荐：框架 = 全局插件，所有项目共享）

```bash
# 1) 安装（装进 ~/.pi/agent/）
pi install git:github.com/Atul-8/ai-coordination@pi-ai-coordination

# 2) 项目初始化（幂等；部署 AGENTS.md / todo.md / .ai/，并确保全局经验池）
#    Windows：
node "%USERPROFILE%\.pi\agent\git\github.com\Atul-8\ai-coordination\scripts\init-project.js" <项目根>
#    Linux / macOS：
node ~/.pi/agent/git/github.com/Atul-8/ai-coordination/scripts/init-project.js <项目根>

# 3) 启动 pi，四条命令跑通流水线：
#    /pm 需求入口 → /plan 计划模式 → /issue 同步 issues → /go <stage> 阶段调度
```

### 项目级安装（仅指定项目生效；`.pi/settings.json` + `<项目>/.pi/git/`，可随项目共享给团队）

```bash
pi install -l git:github.com/Atul-8/ai-coordination@pi-ai-coordination

# 初始化（包在项目内 .pi/git/ 下）
node .pi/git/github.com/Atul-8/ai-coordination/scripts/init-project.js <项目根>

# 使用：项目级文件需一次性信任（交互 TUI 会提示；无头模式加 -a）
pi -a   # 或 pi --approve

# 卸载（同样需要 -a 信任项目本地配置修改）
pi remove -l -a git:github.com/Atul-8/ai-coordination@pi-ai-coordination
```

### 卸载与清理

```bash
pi remove git:github.com/Atul-8/ai-coordination@pi-ai-coordination   # 全局 → 项目不再受影响
pi remove -l -a git:github.com/Atul-8/ai-coordination@pi-ai-coordination  # 项目级
# 卸载后清理项目内数据（可选）：AGENTS.md / todo.md / .ai/ / docs/plans/
```

> 试装不落盘：`pi -e git:github.com/Atul-8/ai-coordination@pi-ai-coordination`（临时目录，仅本次运行生效）。
> 本地开发调试：`pi install /path/to/pi-ai-coordination`。

## 背景：为什么重构

v1.x 以 Claude Code 插件 + 侵入式 CLAUDE.md 追加的方式运行，实践中暴露出四类问题；V2 逐一映射：

| # | v1.x 问题 | V2 方案（pi 原生） |
|---|---|---|
| 1 | WORKSTATE.md / LOG.md 手工维护，与真实会话脱节 | 删除；用 pi 原生 session tree（`/resume` `/tree` `/fork`、session JSONL），任务行内联 `@session:` 链接 |
| 2 | `cat SKILL.md >> CLAUDE.md` 侵入式注入 | `init-project.js` 部署项目级 **AGENTS.md**（幂等标记插桩，pi 自动加载） |
| 3 | WORKTASK 拆分繁琐、与 issue 脱节 | `todo.md` 单一事实源 + `/plan` 计划落盘 `docs/plans/PLAN-NNN-*.md` 自动登记任务 + `/issue` 同步 git issues（gh CLI / Gitee API） |
| 4 | 调度靠人工口头描述 | `/go <stage>` 交互式确认 → 分阶段任务调度 → 逐项归档 |

## V2 三大增量设计

1. **全局经验池 `C:\.ai_global`**（`AI_GLOBAL_DIR` 可覆盖；unix `~/.ai_global`）
   `meta/raw` → `meta/distilled/meta-rules.md`（`META-NNNN` 全局四位编号，项目内三位），跨项目沉淀。
2. **多 agent 动态调度 · 固定前缀 `pi-dynamic-workflows`**
   常驻 PM（主会话）以 `pi-dynamic-workflows:<stage>:<T-NNN>` 为 lane key 动态派发；阶段=lane 并行，任务=writer→reviewer 串行；角色注册表 `C:\.ai_global\agents\registry.json` + 角色卡（pm/writer/reviewer/tester/architect）。
3. **形态定位：全局插件，而非 MCP / 侵入式配置**
   框架代码 = 全局 pi 包（扩展/技能/提示词随 `pi install` 分发）；项目 = 纯数据（todo.md、.ai/、docs/plans/）。Claude Code V2.0 整合时同样应做成 plugin，而非回退 CLAUDE.md 方案。

## 分支策略

| 分支 | 角色 | 状态 |
|---|---|---|
| `master` | v1.2.3 最终版（Claude Code 插件） | 🔒 冻结，不再维护 |
| `dev` | v1.x 开发线 | 🔒 冻结，不再维护 |
| `masterV2` | **本分支** — V2 计划页 + 分发说明 | 持续更新 |
| `pi-ai-coordination` | **V2 框架本体**（pi 包，仓库根即包根，可直接 `pi install`） | 持续开发 |

## 架构总览（V2）

```
pi-ai-coordination/            # pi 包（= pi-ai-coordination 分支根）
├── package.json               # pi manifest：extensions / skills / prompts
├── extensions/coordination/   # 扩展入口 index.ts + lib/plan/todo/go/status
├── prompts/                   # /pm /issue /error /meta /status
├── skills/coordination/       # G0-G4 铁律 + 流水线纪律（技能自动注入）
├── scripts/                   # init-project.js（部署器）· issues.js（issue 同步）
└── templates/                 # 项目模板 · 全局池模板 · agents 注册表 + 角色卡

项目内（init 一次，随项目 git 走）：
├── AGENTS.md · todo.md · docs/plans/ · .ai/{STRUCTURE,REQ,ERR,scripts/issues.js}

全局池（C:\.ai_global，跨项目）：
└── meta/{raw,distilled} · agents/{registry.json, cards/}
```

## 路线图

- [x] **0.1.0** — pi 原生重构完成；试点项目 dogfooding（物理实验模拟平台）
- [x] **0.1.1** — 双通道（全局/项目级）安装卸载全流程实测打通；`--coord-plan` 标志冲突修复
- [ ] **0.2** — 分发打磨：npm 发布（`pi install npm:pi-ai-coordination`）、Gitee/GitHub issue 真同步实测
- [ ] **0.3** — 动态调度强化：lane 级重试/汇总卡片、结构化验收（structuredOutput.verdict）
- [ ] **1.0** — 稳定 API 契约 + 文档站
- [ ] **V2.0-claude** — Claude Code plugin 形态映射（skills/prompts 结构直接复用）

## 已知限制

- 全局池暂不做自动同步（可选手工 git init 同步）；issue 同步 Gitee 分支需 `GITEE_TOKEN`。
- `workflowScript` 沙箱无文件系统访问，PM 派发时需注入 STAGE/TASKS 数据（见 `templates/agents/dynamic-dispatch.example.js`）。
- 任务行仅可经 `coord_todo` 工具编辑（单写者纪律），避免并行写竞争。

---
*v1.x 贡献与历史见 `master` / `dev` 分支（已冻结）。*
