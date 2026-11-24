# DSH 版全链路评估 —— 从 pi-ai-coordination 到 dsh-ai-coordination

> 评估日期：2026-11-24 · 分支：`dsh` · 运行环境：DSH Desktop 0.2.2-rc.5（profile `desktop`）
> 结论：框架的**方法论层**（七层分治、G0–G4、todo/plan/issue/META/交接）与宿主无关，可完整保留；
> **承载层**（扩展、提示词模板、会话、子代理编排）按 DSH 原生机制重写。已交付可安装 bundle
> `dsh-plugin/`（包名 `dsh-ai-coordination`），预设 `AGI · 协调开发`。

## 1. 评估方法

1. 通读 pi 版全部资产：`extensions/coordination/*.ts`、`prompts/*.md`、`skills/coordination/SKILL.md`、
   `scripts/init-project.js`、`scripts/issues.js`、`scripts/init-global.mjs`、`templates/`。
2. 用 `cordis_inspect_*` 读取当前 DSH 的真实契约：`Service`（tools / commands / skills / systemPrompt /
   agentPresets / workingDirectory / sandboxPolicy / sessions / agents）、`Config`（agent-preset 行）、
   `Tool`（当前会话可见工具）。
3. 用已安装的第三方本地 bundle（`@local/dsh-seeed-ts`）核对 bundle 清单、预设声明与工具注册的真实写法。
4. 逐项判定：**保留 / 换承载 / 删除 / 新增**，再实现、单测、安装、实跑验证。

## 2. 能力映射（pi → DSH）

### 2.1 分发与装配

| pi 资产 | pi 机制 | DSH 落点 | 判定 |
| --- | --- | --- | --- |
| `package.json` 的 `pi.extensions/skills/prompts` | pi 包清单 | `dsh.bundle.patch` + `exports` + `files` | 重写 |
| `pi install` / `pi update` | pi 包管理 | `plugin_manager install_bundle`（本地目录或 npm 包） | 换承载 |
| 全局安装、项目数据 | 全局插件 + 项目 `.ai/` | 同左：bundle 装 profile，项目数据仍落项目根 | **保留**（哲学不变） |
| `AGENTS.md` 插桩 | `init-project.js` 写标记块 | `coord_init` 写同构标记（dsh v1），并**原位升级** pi/zcode 旧块 | 保留并增强 |

### 2.2 命令与交互

| pi | DSH | 说明 |
| --- | --- | --- |
| `/coord-init` 扩展命令 | `/coord-init`、`/coord init`（`ctx.commands.register`） | 命令处理函数直接执行并返回文本 |
| `/todo` 看板 | `/coord-todo`、`/coord todo` | 纯计算，无 UI 依赖 |
| `/coord-status` | `/coord-status`、`/coord status` | 纯计算 |
| `/go s1` 交互选阶段 + 确认 | `/coord-go s1` 写 `@session` 后 `agent.followup()` 派发；无参列出阶段 | 命令树没有多选 UI，选择改为参数；确认由用户显式输入完成 |
| `/plan` 自建只读计划模式 | **删除自建模式**，改用 DSH `dsh-plan-mode` + `exit_plan_mode` | DSH 已有更完整的计划审批；自建会与宿主模式冲突 |
| `/issue` 提示词 | `/coord-issues` 命令 + `coord_issue` 工具 | 逻辑从提示词下沉为工具，行为可测 |
| `/error` `/meta` `/status` 提示词 | `coord_error` / `coord_meta` / `coord_status` 工具 + persona 纪律 | 提示词模板在 DSH 不再作为命令载体 |
| `/eai` 组命令与 `eai-*` 别名 | `/coord` 组命令 + `coord-*` 扁平别名 | 命名统一为 `coord`；不再维护双前缀 |

### 2.3 工具

| pi 工具 | DSH 工具 | 变化 |
| --- | --- | --- |
| `coord_todo`（todo.md 写者） | `coord_todo`（同名） | 增加 `stage_add`；新增 `root` 参数；session 取宿主 `session-xxxx` 前 8 位 |
| 计划落盘在 `/plan` 扩展内部 | `coord_plan_save` | 独立成工具，可在计划批准后由模型调用；步骤自动编号 |
| 状态在 `session_start` 扩展 | `coord_status` | 去掉 UI 小部件，改为可调用看板 |
| （无） | `coord_init` | init-project.js 工具化，幂等 |
| （无） | `coord_issue` | issues.js 逻辑工具化（CLI 仍随项目部署） |
| （无） | `coord_error` / `coord_meta` | 五步法 + META 编号从「提示词纪律」升级为「工具保证」 |
| （无） | `coord_handoff` | 交接卡 write/read/consume 工具化，自动附 git 取证 |

### 2.4 技能与提示词

| pi | DSH | 说明 |
| --- | --- | --- |
| `skills/coordination/SKILL.md` | `agi-coordination`（`ctx.skills.register`，bundled） | 内容重写为 DSH 工具/命令与计划模式 |
| `prompts/handoff.md` | `agi-handoff` 技能 + `coord_handoff` 工具 | 流程保留，执行工具化 |
| `prompts/pm.md` 的派发纪律 | `agi-dispatch` 技能 + persona | 派发机制改为 DSH `subagent` / `workflow` / `team_task_*` |
| `prompts/pm|error|meta|status|issue` | persona 纪律 + 工具描述 | DSH 无「提示词模板即命令」机制；职责拆到 persona/技能/工具 |

### 2.5 会话、编排与全局池

| pi | DSH | 判定 |
| --- | --- | --- |
| 会话树 `/resume` `/tree` `/fork`、`$PI_SESSION_FILE` | 会话日志 + 恢复/fork + `@session` 前 8 位 | **等价保留**（DSH 的 session id 前缀 `session-`，`shortSessionId` 已适配） |
| `pi-subagents` + `pi-dynamic-workflows` lanes + workflowScript 沙箱契约 | `subagent` / `subagent_fork` / `workflow`（`agent`/`pipeline`/`parallel`/`phase`/`log`）+ `team_task_*` | 换承载；纪律写进 `agi-dispatch` |
| `@plannotator` `--coord-plan` 旗标冲突 | 无冲突：不自建旗标 | 删除 |
| 全局池 `C:\.ai_global`（meta + agents RAG 池） | 同路径；`coord_meta promote`、`AI_GLOBAL_DIR` 可覆盖 | **保留**；bootstrap 不再联网克隆，只建最小骨架 |
| `init-global.mjs` 克隆 `eai-code/ai-meta`、`eai-code/eai-agent` | 不自动克隆（避免安装即联网）；建目录与 README | 降级（有意） |

## 3. 交付物

```
dsh-plugin/
├── package.json            dsh.bundle.patch 清单（locale/icon/files/exports）
├── cordis.patch.yml        顶层插件行 ai-coordination + 预设行 preset-agi
├── index.js                注册 8 工具 / 7 命令 / 3 技能
├── src/
│   ├── lib.js              纯函数（todo 解析渲染、编号、插桩、交接卡、remote 解析）
│   ├── project.js          .ai 定位、沙箱策略、初始化、计划/状态/交接/ERR/META 的 I/O
│   ├── issues.js           todo ↔ GitHub/Gitee（原生实现，CLI 另行部署）
│   ├── tools.js            8 个工具定义
│   ├── commands.js         /coord 组 + 6 个扁平别名
│   └── host.js             cwd / 沙箱策略 / 会话 id 的宿主事实
├── skills/                 agi-coordination / agi-handoff / agi-dispatch
├── templates/              项目初始化模板（AGENTS.md 等 9 个）
├── scripts/issues.js       零依赖 CLI（部署到 .ai/scripts/）
├── locale/{en,zh}.json     插件市场标题与描述
├── icon.svg                36×36 图标（七层分治）
└── test/                   11 个单测（纯函数 + mock 上下文端到端）
```

### 预设 `AGI · 协调开发`（id `agi`）

persona（G0–G4、七层、流水线、交接、委派、边界）+ `agent-instructions` + pwsh/fs/fs-search +
skill/skill-filesystem + goal + plan-mode（改写 section，明确「批准后 coord_plan_save」）+
compaction + subagent/fork/workflow + ask-user + todo + web + present。

## 4. 数据契约（跨宿主共享）

- `todo.md`：`- [ ] T-001 [stage:s1] 描述 (#12) @session:01a05cc8`；阶段行 `- s1: 标题 <!-- plan:... -->`。
- `.ai/`：`STRUCTURE.md`、`requirements/REQ-NNN.md`、`errors/raw/ERR-NNN.md`、
  `errors/distilled/meta-rules.md`（`### META-NNN`）、`HANDOFF.md`、`scripts/issues.js`。
- `AGENTS.md`：`<!-- dsh-ai-coordination:agents:v1 BEGIN/END -->`；pi / zcode 旧标记块原位升级，块外内容保留。
- 全局池：`AI_GLOBAL_DIR/meta/distilled/meta-rules.md`（`### META-NNNN`）、`agents/pool/`。

因为契约不变，同一个项目可以在 DSH、pi、ZCode 之间接力；交接卡是唯一跨宿主现场记录。

## 5. 验证记录

| 项 | 结果 |
| --- | --- |
| 单元/端到端测试 | `node --test test/lib.test.mjs test/plugin.test.mjs` → 11/11 通过 |
| 安装 | `plugin_manager install_bundle` → `application: applied`，bundle `dsh-ai-coordination@0.3.0` |
| 预设行 | `Config.listConfigs(name=dsh-agent-preset)` 出现 `include:preset-agi`（status schema） |
| 技能目录 | 安装后目录出现 `agi-coordination` / `agi-handoff` / `agi-dispatch` |
| 工具可用 | `Tool.listTools` 出现 8 个 `coord_*` |
| 实跑 | 在临时 demo 项目：init（建 14 项）→ stage_add → add → plan_save（PLAN-001 + T-002..T-004）→ status（看板正确）→ handoff write/read/consume（状态 resumed、T-002 重绑）→ error（ERR-001 + META-001）→ meta list → issue list（无 remote 时明确报错，不伪造）；demo 已清理 |
| 未验证 | ① 插件市场图标/详情页的实际渲染（无浏览器控制）；② 选择 `AGI` 预设的新会话端到端（需要用户新建会话）；③ GitHub/Gitee 真实 issue 创建（demo 无 remote） |

> 注意：当前 profile 以 **link** 方式安装。安装后修改插件源码，运行中的 Host 仍执行旧模块；
> 重启 DSH（或重新安装）后加载新代码。

## 6. 已知边界与取舍

1. **计划模式不再自建**：`/plan` 的只读约束与步骤追踪由 DSH 提供；coordination 只负责批准后的落盘与登记。
2. **全局工具可见性**：`coord_*` 注册在顶层（所有会话可见），未初始化项目调用时返回引导。
   代价是每个会话多 8 个工具 schema（约 2–3k tokens 的工具描述）；如只想在 AGI 预设内可见，
   可把顶层 insert 改为预设内 `plugins` 行，代价是标准会话无法使用 `/coord-*`。
3. **无 UI 小部件**：pi 的状态条/进度条在 DSH 没有等价注入点，改为 `/coord-status` 与 `coord_status` 文本。
4. **命令无交互式选择**：`/coord go` 需要显式参数（`s1` / `T-003`）；无参时列阶段。
5. **沙箱**：写操作遵循会话策略。`read-only` 一律拒绝；`workspace-write` 下全局池（工作区外）写入会被拒绝，
   工具会提示需要 `danger-full-access` 或把 `AI_GLOBAL_DIR` 指到工作区内。
6. **issues 只支持 GitHub / Gitee**（与 pi 版一致）；认证缺失时返回可操作的错误。
7. **RAG 卡池不自动建设**：只建骨架；检索脚本与索引构建仍是 pi 时代的全局资产，未移植。
8. **pi 专属集成不再存在**：`pi-subagents`、`pi-dynamic-workflows`、plannotator、pi-goal 的共存矩阵不再适用。

## 7. 后续路线

1. 监听 DSH 计划模式的批准事件，自动触发 `coord_plan_save`（省掉一次手工工具调用）。
2. 为 `coord_issue` 补 GitHub/Gitee 集成测试（可用本地 mock 或临时仓库）。
3. 把 RAG 卡池检索/建卡脚本移植为 DSH 工具（`coord_agent_query` / `coord_agent_card`）。
4. 提供/刷新 UI（状态条、看板面板）作为可选的 Client 插件。
5. 英文版 persona 与命令描述；bundle 发布到 npm / 插件市场索引。
6. 把「顶层全局工具」与「预设内工具」做成 Config 开关（`scope: global | preset`）。

## 8. 迁移与回滚

- 迁移：安装 bundle → 在项目里 `coord_init`（会原位升级 pi 版 AGENTS.md 块）→ 新会话选 `AGI` 预设。
- 回滚：`plugin_manager remove_bundle dsh-ai-coordination`；项目数据（`.ai/`、`todo.md`、`AGENTS.md`）与 pi 版兼容，
  pi 侧无需迁移即可继续使用。
- 卸载不会删除项目数据；如需清理，手动删除 `.ai/`、`todo.md`、`docs/plans/` 与 AGENTS.md 中的标记块。