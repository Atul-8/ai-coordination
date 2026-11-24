# dsh-ai-coordination

七层分治协调框架（原 pi-ai-coordination）的 **DSH bundle**：把「任务事实源 + 计划落盘 + issue 同步 +
G3 错误/META 蒸馏 + 跨宿主交接」做成宿主级能力，并附带一个 `AGI · 协调开发` 智能体预设。

- 框架 = 全局插件；项目 = 纯数据（`.ai/`、`todo.md`、`AGENTS.md`、`docs/plans/`）。
- 任何会话都可用 `coord_*` 工具与 `/coord-*` 命令；工具自己判断项目是否已初始化。
- 选择 `AGI · 协调开发` 预设的会话额外获得 persona、计划模式、委派与压缩分组。

## 安装

本地目录安装：

```text
Plugins → Add plugin → 选择该目录（dsh-plugin/）
```

或用 `plugin_manager`：

```json
{ "action": "install_bundle", "target": "E:\\AI\\ai-coordination\\dsh-plugin" }
```

安装后不需要重启即可热加载顶层插件；预设行在新建会话时可选。

## 初始化项目

在目标项目会话里让 AI 调用 `coord_init`，或键入：

```
/coord-init
```

产物：

```
<项目>/
├── AGENTS.md            # 运行时规范（幂等插桩，pi/zcode 旧块原位升级）
├── todo.md              # 唯一任务事实源
├── docs/plans/          # 计划落盘
└── .ai/                 # 协调层：STRUCTURE / REQ / ERR / META / issues CLI
```

全局池骨架（不联网）：`AI_GLOBAL_DIR`（默认 `C:\.ai_global`）下建 `meta/distilled`、`agents/pool`。

## 工具

| 工具 | 作用 |
| --- | --- |
| `coord_init` | 初始化（幂等），部署模板与 issues CLI |
| `coord_todo` | 任务看板；add/start/done/link/set_issue/stage_add（唯一写者） |
| `coord_plan_save` | 计划落盘 `docs/plans/PLAN-NNN-*.md` + 步骤登记为任务 |
| `coord_status` | todo / META / HANDOFF / 结构全量状态（只读） |
| `coord_issue` | todo ↔ git issues（GitHub `gh` / Gitee API） |
| `coord_error` | G3 五步法：ERR 卡 + META 规则蒸馏 |
| `coord_meta` | 项目 META 概览；promote 提升全局池 |
| `coord_handoff` | 跨宿主交接卡 write / read / consume |

## 命令

```
/coord status | todo | init | go <sN|T-NNN> | issues [sync] | meta | handoff [done]
/coord-status  /coord-todo  /coord-init  /coord-go  /coord-issues  /coord-handoff
```

`/coord go s1` 会把所选任务写入 `@session:` 关联，并把任务清单 followup 给当前会话执行。

## 技能

- `agi-coordination`：G0–G4 铁律与完整流水线。
- `agi-handoff`：跨宿主交接卡协议。
- `agi-dispatch`：subagent / workflow / team 的派发纪律与验收。

## 设计要点与边界

- 会话状态由宿主会话日志承担，不维护 WORKSTATE/LOG；任务 ↔ 会话只记 `@session` 前 8 位。
- 计划审批仍由 DSH 计划模式（`exit_plan_mode`）负责；本插件只在批准后落盘。
- 文件写入遵循会话沙箱：`read-only` 拒绝写；`workspace-write` 下不能写工作区外的全局池。
- `coord_issue` 依赖 `gh` CLI 或 `GITEE_TOKEN`，无认证时返回错误而不是伪造编号。
- 全局工具对所有会话可见；未初始化项目调用会得到引导而不是静默失败。

## 测试

```bash
node --test test/lib.test.mjs test/plugin.test.mjs
```

## 与 pi 版的关系

本包是 `pi-ai-coordination`（pi 扩展）的 DSH 重构，共享同一套项目数据格式（todo.md / `.ai/` / HANDOFF），
因此同一个项目可以在 DSH、pi、ZCode 之间接力。全链路对照见仓库 `docs/DESIGN-DSH.md`。