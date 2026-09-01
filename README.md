# pi-ai-coordination

ai-coordination 七层分治框架（v1.2.3，Claude Code 插件）的 **pi 原生重构版**。

七层架构不变：coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）→ shared（共享）+ testing（测试）+ docs（文档）。
变的是承载方式——全面拥抱 pi 原生能力（会话树、AGENTS.md、扩展、prompt 模板、包机制）。

> 📋 项目计划与路线图见 **`masterV2`** 分支 ·
> ✅ 以下安装/卸载/工具调用命令均已在 **pi 0.84.4** 端到端实测

## ⚠️ 运行环境：全局 pi 插件组合（已实测）

本框架**不是孤立工作的**：动态调度、计划模式旗标、无头行为都依赖与其他 pi 插件的共存与协作。以下正是开发者当前全局部署、且全部功能实测通过的完整组合（pi 0.84.4）——**照此环境部署可避免各类「用不了」的异常**：

| 全局插件 | 版本 | 与本框架的关系 |
| --- | --- | --- |
| `pi-subagents` | 0.62.0 | 多 agent 子代理基础设施（动态调度的底层） |
| `@quintinshaw/pi-dynamic-workflows` | 3.10.0 | **动态调度必需**：lane key 固定前缀 `pi-dynamic-workflows`、runs.lanes/runs.host API |
| `@plannotator/pi-extension` | 0.27.10 | 占用 `--plan` 旗标 → 本框架已改名 `--coord-plan` 避让；两者共存无冲突 |
| `@narumitw/pi-goal` | 0.54.4 | 无头 `-p` 下有已知的 sendUserMessage 生命周期限制（见下），TUI 正常 |
| `@narumitw/pi-btw` | 0.56.0 | 与本框架无交互，环境事实列出 |
| `pi-web-access` | 0.27.0 | 与本框架无交互，环境事实列出 |
| **`ai-coordination`（本框架）** | 0.1.0 | `pi install git:github.com/Atul-8/ai-coordination@pi-ai-coordination` |

**缺失影响对照**：

- 缺 `pi-dynamic-workflows` / `pi-subagents` → 单会话流程（`/pm` `/plan` `/todo` `/issue` `/go` `/error` `/meta` `/status`）**不受影响**，仅多 agent 动态调度不可用
- 缺 `@plannotator/pi-extension` → `--coord-plan` 旗标照常工作，只是没有 plannotator 功能
- `@narumitw/pi-goal` 的无头限制同样影响本框架 `/eai pm|error|meta|report`（组内转发）；无头请用 `/eai-pm` 等原生模板别名（TUI 两者都正常）

> 安装缺失插件：`pi install npm:<包名>`；查看当前全局组合：`pi list`。

## 安装与初始化

### 第 1 步：安装包

```bash
pi install git:github.com/Atul-8/ai-coordination@pi-ai-coordination   # GitHub 分支分发
pi install /path/to/pi-ai-coordination                                # 或本地路径
pi install -l git:github.com/Atul-8/ai-coordination@pi-ai-coordination   # 项目级（仅该项目生效）
```

### 第 2 步：初始化项目

**方式 A（推荐）：在 pi 会话内一键执行**

安装后启动 pi，直接输入：

```
/coord-init            # 别名：/aic-init-project
```

扩展会自动运行包内 init-project.js（默认当前项目根，幂等可重复）。
也可以直接对 AI 说：**「用 pi-ai-coordination 初始化本项目」**——技能会引导它完成同样的事。

**方式 B：终端手动执行**

⚠️ 注意 shell 差异：`%USERPROFILE%` 仅在 **CMD** 生效；**PowerShell 必须用 `$env:USERPROFILE`**（否则字面量传入导致 MODULE_NOT_FOUND）。末尾参数为目标项目（`.` = 当前目录；省略时默认当前目录）：

```powershell
# PowerShell（Windows 默认 shell）
node "$env:USERPROFILE\.pi\agent\git\github.com\Atul-8\ai-coordination\scripts\init-project.js" .
```

```cmd
:: CMD
node "%USERPROFILE%\.pi\agent\git\github.com\Atul-8\ai-coordination\scripts\init-project.js" .
```

```bash
# Git Bash / Linux / macOS
node ~/.pi/agent/git/github.com/Atul-8/ai-coordination/scripts/init-project.js .
```

### 项目级安装的信任与卸载

```bash
pi -a   # 项目级文件需信任：TUI 首次启动会提示；无头模式加 -a / --approve
pi remove git:github.com/Atul-8/ai-coordination@pi-ai-coordination        # 卸载全局
pi remove -l -a git:github.com/Atul-8/ai-coordination@pi-ai-coordination  # 卸载项目级（-a 必需）
```

> ℹ️ `pi remove` 仅移除 settings 注册，**不会删除克隆目录**；彻底清理可手动删除：
> 全局 `~/.pi/agent/git/github.com/Atul-8/ai-coordination`，项目级 `<项目>/.pi/git/github.com/Atul-8/ai-coordination`，
> 以及项目内数据（可选）：AGENTS.md / todo.md / .ai/ / docs/plans/
>
> 试装不落盘：`pi -e git:github.com/Atul-8/ai-coordination@pi-ai-coordination`（临时目录，仅本次运行）。

### 初始化产物

```
<项目>/
├── AGENTS.md            # 运行时规范（pi 自动加载）
├── todo.md              # 任务事实源
├── docs/plans/          # /plan 产出
└── .ai/                 # coordination 层（STRUCTURE/REQ/ERR/issues.js）

C:\.ai_global\           # 全局池（AI_GLOBAL_DIR 可覆盖；类 Unix ~/.ai_global）
├── meta/                # 全局 META 经验池（原 C:\.ai_meta 迁移于此）
│   ├── raw/
│   └── distilled/meta-rules.md   # ### META-NNNN（全局四位编号）
└── agents/              # 全局卡池（独立 git 仓 eai-code/eai-agent）
    ├── pool/*.md        # 角色卡单池（RAG pool v2，schema v2）
    ├── taxonomy.yml     # 受控标签 DAG
    └── scripts/         # query.mjs 检索三档 / build-index.mjs
```

## 命令总表

原生命令全部保留；同时统一提供 **`eai` 前缀形态**（映射同一实现）：

| 原生命令 | eai 别名 | 类型 | 作用 |
| --- | --- | --- | --- |
| `/coord-init`（`/aic-init-project`） | `/eai-init` | 扩展 | 初始化项目 coordination 层（运行包内 init-project.js，幂等） |
| `/pm` | `/eai-pm` | 提示词 | G0 入口：需求分类路由 |
| `/plan` | `/eai-plan` | 扩展 | 计划模式（Ctrl+Alt+P / `--coord-plan`）：只读探索 → Plan: → docs/plans 落盘 + todo 登记 |
| `/todo` | `/eai-todo` | 扩展 | 任务看板（`coord_todo` 工具供 LLM 维护 todo.md，单写者纪律） |
| `/issue` | `/eai-issue` | 提示词 | `issues.js sync`：待办 ↔ git issues（gh CLI / GITEE_TOKEN） |
| `/go` | `/eai-go` | 扩展 | 阶段调度：选阶段 → 确认 → 按序执行（写 `@session:` 关联） |
| `/error` | `/eai-error` | 提示词 | G3 五步错误提炼 |
| `/meta` | `/eai-meta` | 提示词 | 经验提升全局池 `C:\.ai_global\meta` |
| `/status` | `/eai-status` | 提示词 | 状态报告（`/coord-status` 为原生命令） |

### /eai 组命令（gcc 风格参数叠加）

`/eai <子命令> [参数] [-flags]`，一个入口路由全部能力：

```
/eai init              # 初始化（= /coord-init）
/eai plan              # 切换计划模式
/eai todo              # 任务看板
/eai go s1             # 阶段调度（= /go s1）
/eai status            # 快速状态（= /coord-status）
/eai report            # AI 状态报告（= /status）
/eai issue sync -s s1 --dry-run   # issues.js 直执：gcc 风格旗标叠加
/eai issue list        # 查看 issue 关联（-s 过滤阶段）
/eai pm <需求描述>     # 转发 /pm（TUI）
```

旗标：`-s <stage>`/`--stage`、`-n`/`--dry-run`/`-d`、`--key=value`、布尔叠加 `-abc`。

> ℹ️ 无头 `-p` 模式限制：`/eai pm|error|meta|report`（sendUserMessage 转发）受 pi
> 会话生命周期限制不可用（同款限制也影响 pi-goal 等扩展的无头用法）；
> 无头请用原生模板别名 `/eai-pm` `/eai-error` `/eai-meta` `/eai-status` 或原生命令。
> eai 模板别名由 `scripts/sync-eai-prompts.mjs` 从源模板自动同步（改提示词后跑一次）。

## 任务流水线

```
需求 → /pm 路由 → /plan 只读计划 → 确认落盘 docs/plans/ + todo 登记
     → /issue 同步 git issues → /go <stage> 阶段调度 → 逐项 coord_todo done
     → issues.js close-done → G4 离场（git 提交 + STRUCTURE 校验 + META 归档）
```

todo.md 行格式（唯一规范，仅经 `coord_todo` 工具编辑）：

```
- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
      │            │              │       └ /go 写入的 pi session 前 8 位
      │            │              └ issues.js sync 回写
      │            └ 阶段标签（对应「阶段定义」小节）
      └ [ ] 待办 / [~] 进行中 / [x] 完成
```

## 动态调度：pi-dynamic-workflows（固定前缀）

多 agent 接入不同阶段时，**常驻 PM**（主会话，不派发自己）以固定前缀动态调度：

- **命名空间**：`pi-dynamic-workflows`（注册表 `namespace` 字段，勿改）
- **lane key**：`pi-dynamic-workflows.<stage>.<T-NNN>`（如 `pi-dynamic-workflows.s1.T-003`）
- **常驻命名 agent**：`pi-dynamic-workflows-pm`；子角色 `pi-dynamic-workflows-<name>`
- **拓扑**：阶段 = lane（无依赖阶段并行接入），任务 = lane 内串行 stage（writer → reviewer）
- **动态性**：lane 完成即读结果，动态决定续派/复核/回写；结果仅认 `structuredOutput.verdict === "blocked"`
- **模板**：`C:\.ai_global\agents\dynamic-dispatch.example.js`（注入 STAGE/TASKS 后作为 workflowScript）

## 设计原则：全局插件，项目数据

经过 Claude Code 时期的实践，本框架**不适合 MCP 形式**（工具粒度粗、上下文开销大、无法参与 UI/命令生命周期），也不应该回到侵入式全局 CLAUDE.md。V2.0 定位：**框架 = 全局插件；项目 = 纯数据**。

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 框架代码（扩展/技能/提示词/脚本） | `~/.pi/agent/`（git 安装：`git/github.com/Atul-8/ai-coordination`；npm 安装：`npm/node_modules/`） | 全局唯一，所有项目共享；升级 = `pi update` |
| 项目数据（.ai/、todo.md、AGENTS.md、docs/plans/） | 各项目根 | `init-project.js` 实例化，随项目 git 走 |
| 全局池（META 经验 + 智能体调配） | `C:\.ai_global`（AI_GLOBAL_DIR 可覆盖） | 跨项目资产，可选 git 同步 |

项目内唯一被复制的代码是 `.ai/scripts/issues.js`（为提示词提供稳定路径，init 时自动刷新为包内最新版；源头在包内）。

> **Claude Code V2.0 对应目标**：后续整合回 Claude Code 时，也应做成 **plugin**（全局安装、项目级数据），而不是旧版 `cat SKILL.md >> CLAUDE.md` 的侵入式全局追加。届时本包的 skills/prompts 结构可直接映射。

## 旧 → 新映射（四个重构点）

| # | 旧（Claude Code 版） | 新（pi 版） |
| --- | --- | --- |
| 1 | `WORKSTATE.md` + `LOG.md` 手写续作 | **删除**。pi 原生会话树承担：`/resume` `/tree` `/fork`、JSONL、`$PI_SESSION_FILE`；任务↔会话用 todo.md 行内 `@session:xxxxxxxx` 关联 |
| 2 | `cat SKILL.md >> CLAUDE.md`（全局追加） | `init-project.js` 运行时把 **`AGENTS.md`** 部署到项目根（幂等插桩），按项目生效 |
| 3 | `TASKS.md` + tasks.js（PM 任务表） | **todo.md 单一事实源**：`/plan` 产出 `docs/plans/PLAN-NNN-*.md` → 步骤自动登记 → `/issue` 同步 git issues |
| 4 | 手工指派 + pm-dispatch 消息队列 | **`/go`** 阶段性调度：交互确认 → 按序执行 → 逐项归档；多 agent 接入时常驻 PM 动态派发（见上） |

G0–G4 铁律精简后保留在 `skills/coordination/SKILL.md`（G1 自动化进扩展 session_start；G2/G2.5/G3/G4 成为纪律卡片；G3 五步错误提炼 + META 池原样保留）。

## 兼容与迁移

- 旧 `C:\.ai_meta` → 整体挪到 `C:\.ai_global\meta\`（`distilled/meta-rules.md` 格式不变）
- 旧 `WORKSTATE.md`/`LOG.md` → 不再需要；历史价值信息可归档进 REQ/ERR 卡
- 旧 `TASKS.md` → 任务搬进 todo.md（保留编号可映射 T-NNN）
- 全局池建议 `git init` 关联远程，实现跨机同步
- ⚠️ `--plan` CLI 标志已更名为 **`--coord-plan`**（避免与 plannotator 扩展冲突）
