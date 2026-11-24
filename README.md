# ai-coordination · DSH bundle

七层分治协调框架的 **DeepSeek Harness（DSH）插件**：把「任务事实源 + 计划落盘 + issue 同步 +
G3 错误/META 蒸馏 + 跨宿主交接」做成宿主级能力，并附带 `AGI · 协调开发` 智能体预设。

> 仓库根目录就是可安装 bundle，包名 `dsh-ai-coordination`。
> pi 版完整保留在 `pi-ai-coordination` 分支（本文档不再覆盖 pi 用法）。

- 框架 = 全局插件；项目 = 纯数据（`.ai/`、`todo.md`、`AGENTS.md`、`docs/plans/`）。
- `coord_*` 工具与 `/coord-*` 命令对所有会话可见，工具自己判断项目是否已初始化。
- 选择 **AGI · 协调开发** 预设的会话额外获得 persona、计划模式、委派与压缩分组。

## 致谢与第三方代码（重要）

本项目遵循「**先授权、后使用**」，任何复用他人代码都必须在此声明感谢：

- **MIT / ISC / BSD-2** 等宽松许可：README 致谢 + 保留原始版权声明与许可证文本。
- **非 MIT**（Apache-2.0 / GPL / LGPL / MPL / CC-BY / 自定义）：必须**先报备开发者并取得书面同意**，同意后才能使用；
  未获同意不得合并、发布。警告与记录**以 README + 会话警告为主**：
  1. **会话警告**（主要）：复制/移植前在会话里明确说明来源、许可证、使用范围，取得用户书面同意；
  2. **README 公示**（主要）：README + [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) 致谢与台账，随提交入库；
  3. **发布记录**（可选）：发版或对外分发时在 release notes / Issue 补一条；**未发版可省略**（很多项目长期不发版）。

### 当前第三方代码台账

| 来源 | 许可证 | 使用范围 | 状态 |
| --- | --- | --- | --- |
| [eai-agent](https://gitee.com/eai-code/eai-agent)（commit `623b3b4`） | **GPL-3.0**（以其 LICENSE 为准） | `src/pool.js`：front-matter 解析、taxonomy/卡片校验、中文分词与关键词打分（移植/改写自 `scripts/lib.mjs`） | ✅ **已授权**（2026-11-24 会话内版权人书面授权，LGPL-3.0 例外） |
| DeepSeek Harness（DSH） | 官方发行包 | 运行时、插件/预设 API 与文档参考 | 使用官方接口，无代码复制 |

> **LICENSE-REQ-001 已获批**：授权范围仅限 `src/pool.js` 列出的逻辑；后续从 eai 引入新实现需重新报备。
> 留痕：README 本节 + [docs/THIRD-PARTY.md](docs/THIRD-PARTY.md) + [会话交接卡](docs/HANDOFF-LICENSE-REQ-001.md)；
> 发版时再补发布记录（当前未发版，不强制）。

## 安装

本地目录安装（仓库根）：

```text
Plugins → Add plugin → 选择本仓库根目录
```

或用 `plugin_manager`：

```json
{ "action": "install_bundle", "target": "E:\\AI\\ai-coordination" }
```

安装后顶层插件热加载；**预设行需要新建会话**才能选择。
bundle 以 link 方式安装时，修改 JS 源码需要重启 DSH 才会加载新模块。

## 初始化项目

在目标项目会话里让 AI 调用 `coord_init`，或键入 `/coord-init`。产物：

```
<项目>/
├── AGENTS.md            # 运行时规范（幂等插桩，pi/zcode 旧块原位升级）
├── todo.md              # 唯一任务事实源
├── docs/plans/          # 计划落盘（PLAN-NNN）
└── .ai/                 # 协调层：STRUCTURE / REQ / ERR / META / HANDOFF / issues CLI
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
| `coord_agent` | RAG 角色卡池：检索 / 建卡 / 自升级 / 记忆沉淀 / first_mission |
| `coord_dispatch` | 派发矩阵 + 任务卡（落盘 `.ai/dispatch/`） |
| `coord_recall` | 旧经验检索：ERR / 项目与全局 META / 角色记忆 |
| `coord_arch` | 七层单向依赖检查（直接 import，支持 `@/` 别名与 Python 相对导入） |
| `coord_research` | 记录外部方案检索（计划门禁产物：`.ai/research/RESEARCH-NNN.md`） |

## 命令

```
/coord status | todo | init | go <sN|T-NNN> | issues [sync] | meta | handoff [done]
/coord agents [任务] | dispatch [sN] | growth | recall <关键词> | arch
/coord research <主题> | <来源…>
/coord-status  /coord-todo  /coord-init  /coord-go  /coord-issues
/coord-handoff  /coord-agents  /coord-dispatch  /coord-growth
/coord-recall  /coord-arch  /coord-research
```

`/coord go s1` 会把所选任务写入 `@session:` 关联，并把任务清单 followup 给当前会话执行。

## 技能

- `agi-coordination`：G0–G4 铁律与完整流水线。
- `agi-handoff`：跨宿主交接卡协议（DSH ↔ pi ↔ ZCode）。
- `agi-dispatch`：subagent / workflow / team 的派发纪律与验收。
- `agi-growth`：Agent 自我成长（记忆 → 自卡升级 → 全局 META）与卡池自演化。

## 多 agent 开发与自我成长

**多 agent 开发**（工具化，不只是文档）：

1. `coord_agent {action:'query', task}`：检索角色卡池（关键词打分，top-5 + 相关记忆；top < 3 = 缺口）。
2. `coord_dispatch {stage}`：从 todo.md 未完成任务生成「阶段 × 任务 × 角色卡 × 缺口」派发矩阵，落盘 `.ai/dispatch/DISPATCH-*.md`。
3. 用 `subagent` / `subagent_fork` / `workflow(pipeline)` 真正执行；任务卡含 scope、验收、`meta_injection`、退单规则。
4. 退单：scope 不符 → `out-of-scope + suggest_keywords`，任务携反馈回队尾；同任务 2 次即拆解。

**Agent 自我成长**（三层沉淀）：

| 层 | 落点 | 工具 |
| --- | --- | --- |
| 角色记忆 | `AI_GLOBAL_DIR/agents/memory/<id>/` | `coord_agent memory_add / memory_list` |
| 自卡升级 | `agents/pool/<id>.md`（只改自己的卡，version+1） | `coord_agent update / first_mission_done` |
| 全局 META | `AI_GLOBAL_DIR/meta/distilled/meta-rules.md` | `coord_error` → `coord_meta promote` |

`coord_init` 会在全局池为空时播种 `writer` / `reviewer` / `tester` / `architect` 四张 process-role 基卡（first_mission=done），
并写入 starter `taxonomy.yml`，让派发矩阵开箱可用；角色卡与记忆的检索/校验全部走 `coord_agent`，不手改 frontmatter。

## 六条核心思想的落地检查

| # | 核心思想 | 实现方式 | 状态 |
| --- | --- | --- | --- |
| 1 | 分治架构单向依赖 | 七层依赖写进 persona/AGENTS/技能；`coord_arch` 扫描 `src/<layer>` 直接 import（`@/` 别名、`src/`、Python 相对导入），报反向/跨层引用；G2 写后必跑 | 纪律 + 启发式自动检查 |
| 2 | 错误经验积累、自纠正、自用旧经验 | `coord_error` 五步法 → ERR 卡 + META；`coord_recall` 检索 ERR/项目 META/全局 META/角色记忆；`coord_error` 自动召回相关旧经验；同根因 2 次升级 REQ | 已实现 |
| 3 | 多 agent：PM 派发 n 子代理、不阻塞 | `coord_agent query` → `coord_dispatch` 矩阵/任务卡/JSON 派发计划 → `subagent`（启动即返回）/ `workflow` 后台；persona/AGENTS 明确派发后汇报待命；退单队列 + 2 次拆解 | 已实现（原生 subagent 非阻塞 + 纪律 + 机器可读任务卡） |
| 4 | Agent 提示词自我成长 | 角色记忆 `memory_add` → `reflect` 提取新检索词 → `update`（version+1）→ 首任务 `first_mission_done`；普适教训升全局 META；主 agent persona/技能走仓库变更 + 重装 | 已实现（子 agent 提示词可自演化；主 agent 提示词不运行时自改） |
| 5 | 不闭门造车：先检索开源/已验证方案 | `coord_research` 记录来源与取舍（`.ai/research/`）；`coord_plan_save` 无 research 且无 `skip_research` 理由时**拒绝落盘**；`web_search` / `web_fetch` 负责检索 | 已实现（硬门禁，纯文档任务可显式跳过） |
| 6 | 问题细分 → 逐步验收 → 整合 | 多步骤计划**强制** `acceptance`（与 steps 一一对应）；G2.5 红→绿；集成单独列一步；`coord_todo` 逐项 done | 已实现（工具强校验） |

> 边界：`coord_arch` 是启发式（直接 import），间接跨层仍需 G2 评审；研究门禁与验收门禁可显式跳过/单步豁免，
> 但跳过会留下理由。完整论证见 [docs/DESIGN.md](docs/DESIGN.md)。

## 仓库结构

| 路径 | 说明 |
| --- | --- |
| `package.json` · `cordis.patch.yml` · `index.js` | bundle 清单、插件补丁、入口（工具/命令/技能注册） |
| `src/` | `lib` 纯函数、`project` 项目 I/O、`pool`/`agents` 角色卡池、`issues` 同步、`tools`、`commands`、`host` |
| `templates/` | 部署到目标项目的模板（`AGENTS.template.md` 等 10 个） |
| `scripts/issues.js` | 零依赖 CLI，init 时刷新到 `<项目>/.ai/scripts/` |
| `skills/` · `locale/` · `icon.svg` | 技能、插件市场元数据、图标 |
| `test/` | 30 个测试（纯函数 + schema 契约 + mock 上下文全链路） |
| `docs/DESIGN.md` | pi → DSH 全链路评估、取舍、验证记录、路线图 |
| `docs/TESTING.md` | 测试矩阵与分发前 checklist |

分支：`dsh`（本分支，DSH 形态）· `pi-ai-coordination`（pi 扩展版）· `zcode-ai-coordination`（ZCode 插件版）。
三者共享 `todo.md` / `.ai/` / HANDOFF 数据契约，同一项目可跨宿主接力。

## 开发

```bash
npm test          # 30 项：lib + pool + plugin 契约 + full 全链路
```

覆盖矩阵与未覆盖项见 [docs/TESTING.md](docs/TESTING.md)。

## 计划门禁（v0.6）

- 多步骤计划：`acceptance` 必填且与 `steps` 一一对应（问题分解 → 逐步验收 → 整合）。
- 外部方案：`coord_plan_save` 必须带 `research:'RESEARCH-NNN'`，或显式 `skip_research:'原因'`（纯文档/无实现）。
- 研究记录：`coord_research {topic, sources:[URL|owner/repo], decision, notes}` → `.ai/research/`。

改完源码：bump `version` → 重新 `plugin_manager install_bundle` → 重启 DSH → 新建会话选 AGI 预设验证。
开发约定见 [AGENTS.md](AGENTS.md)。

## 设计要点与边界

- 会话状态由宿主会话日志承担，不维护 WORKSTATE/LOG；任务 ↔ 会话只记 `@session` 前 8 位。
- 计划审批由 DSH 计划模式（`exit_plan_mode`）负责；本插件只在批准后落盘。
- 文件写入遵循会话沙箱：`read-only` 拒绝写；`workspace-write` 下不能写工作区外的全局池。
- `coord_issue` 依赖 `gh` CLI 或 `GITEE_TOKEN`，无认证时返回错误而不是伪造编号。
- 全局工具对所有会话可见；未初始化项目调用会得到引导而不是静默失败。
- 完整取舍、未验证项与路线图见 [docs/DESIGN.md](docs/DESIGN.md)。