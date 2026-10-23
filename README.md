# ai-coordination（ZCode 插件版）

ai-coordination 七层分治框架的 **ZCode 插件版**（继承自 `pi-ai-coordination` 分支，pi 版见该分支）。

七层架构不变：coordination（协调）→ presentation（表示）→ interface（接口）→ core（核心）→ shared（共享）+ testing（测试）+ docs（文档）。
变的是承载方式——全面拥抱 ZCode 原生插件体系（skills / commands / hooks / agents / MCP server）。

> 📋 项目计划与路线图见 **`masterV2`** 分支 ·
> ✅ 插件核心链路（MCP 工具 / G1 hook / 脚本）由 `node --test` 覆盖（`npm test`，15 例）

## 插件组成

```
├── .zcode-plugin/plugin.json    # 插件 manifest（+ marketplace.json 供市场分发）
├── .mcp.json                    # coord_todo MCP server 注册（zcode 自动信任连接）
├── mcp/                         # coord_todo 工具（零依赖 Node，todo.md 数据模型 + JSON-RPC stdio）
├── hooks/                       # SessionStart hook：G1 开门上下文注入（todo 进度 / META 计数 / 续作建议）
├── commands/                    # 斜杠命令：/pm /plan /go /issue /error /meta /coord-status /coord-init
├── agents/                      # 子代理角色卡：writer / reviewer / tester / architect
├── skills/coordination/         # G0-G4 铁律 + 流水线 + 派发协议（纪律全文）
├── scripts/                     # init-project.js（项目初始化）/ init-global.mjs（全局池 + 全局指令）/ issues.js（todo↔issues）
├── templates/global/agents-zcode.md  # 全局思维架构模板（部署到 ~/.zcode/AGENTS.md）
└── templates/                   # 项目模板（todo/STRUCTURE/REQ/ERR/META）+ 派发模板（zcode-dispatch）
```

**设计原则不变**：框架 = 全局插件（一次安装处处可用）；项目 = 纯数据（`init-project.js` 部署 `AGENTS.md + todo.md + docs/plans/ + .ai/`，激活开关 = 项目根存在 `.ai/`）。全局池 `AI_GLOBAL_DIR`（默认 `C:\.ai_global` / `~/.ai_global`）：META 经验池 + RAG 角色卡单池，跨 agent 共享。

**全局思维架构（宿主级纪律）**：`init-global.mjs` 会把「全局思维架构」幂等部署到 ZCode 全局指令位 **`~/.zcode/AGENTS.md`**（ZCode 原生先注入该文件、后注入项目 AGENTS.md，因此对所有项目生效）——这是 pi 版 `~/.pi/agent/AGENTS.md` 全局纪律的同构移植：云端脱敏、token 纪律、T0/T1/T2 目录权限分级、模型纪律（禁自动换模型）、汇报真实性（禁幻觉反馈）、链路优先与最小验证、META 错误沉淀三步法。部署走标记插桩（`ai-coordination:global-agents:v1`），块外用户自有全局规则永不覆盖。

## 安装

### 方式 A：本地目录（开发/试用）

ZCode 客户端 → Settings → Plugin Management → Discover 页 **`+`** → 添加本地目录（本仓库检出路径）→ 启用 `ai-coordination`。

### 方式 B：Git 仓库（分发）

Discover 页 **`+`** → 输入 `https://github.com/Atul-8/ai-coordination`（分支 `zcode-ai-coordination`）——仓库自带 `.zcode-plugin/marketplace.json`，按市场添加后启用插件。

### 初始化项目（每个项目一次）

在 ZCode 会话内输入：

```
/coord-init
```

（幂等可重复；缺全局池时自动 bootstrap。也可以直接对 AI 说「用 ai-coordination 初始化本项目」。）

## 任务流水线（todo → plan → issue → go）

```
/pm      需求入口（G0 路由：小活直接干，大活走流水线，错误走 G3）
/plan    计划模式：只读探索 → Plan: 步骤 → 用户确认 → 落盘 docs/plans/PLAN-NNN-*.md → 步骤自动登记为任务
/issue   node .ai/scripts/issues.js sync：待办任务 ↔ git issues（gh / GITEE_TOKEN）
/go      阶段性调度：交互确认 → 大活并行派发子代理 → 每完成一项 coord_todo done
/coord-status  全量状态报告      /error  G3 五步法      /meta  经验提升全局池
```

**todo.md 是唯一任务事实源**，行格式：

```
- [ ] T-001 [stage:s1] 任务描述 (#12) @session:01a05cc8
      │            │              │       └ /go 调度时自动写入的 zcode session 前 8 位
      │            │              └ issues.js sync 回写的 issue 编号
      │            └ 阶段标签（对应「阶段定义」小节）
      └ [ ] 待办 / [~] 进行中 / [x] 完成
```

任务行只能用 **coord_todo MCP 工具**维护（`list/add/start/done/link/set_issue`），禁用 edit/write 直改任务行；阶段定义可手工编辑。

## G0-G4 铁律（详见技能 coordination）

| 门 | 何时 | 动作 |
| --- | --- | --- |
| G0 | 需求进来 | 路由：小活直接做；大活 → REQ + /plan 流水线；错误 → G3 |
| G1 | 开门 / resume | SessionStart hook 自动注入 todo 进度 + META 计数；人工确认后续作 |
| G2 | 写操作后 | 跑层测试 → 更新 .ai/STRUCTURE.md / REQ / todo → 再写下一处 |
| G2.5 | 新开发前 | 先证明测试体系能跑（红→绿） |
| G3 | 出错时 | 五步法：现象→根因→修复→预防→META |
| G4 | 离场前 | coord_todo 归档 + close-done + git 提交推送 + STRUCTURE 校验 |

## 大任务派发（ZCode 子代理 · RAG 角色卡池）

- **PM 行为闭环**：分支/计划/任务就绪后立即盘点 → 产出派发矩阵（阶段×并行×**文件域防冲突**）→ 组装任务卡（角色卡+任务卡）→ **一条消息内多个 Agent 调用并行派发** → 汇报矩阵后待命；子代理完成后收口：验证 → 分任务提交 → coord_todo done → 同步 → push
- **角色**：插件自带 `ai-coordination:writer / reviewer / tester / architect` 子代理；也可 general-purpose + 全局池角色卡注入
- **RAG 池协议**（`AI_GLOBAL_DIR\agents\`）：派发前检索三档 `query.mjs`（强命中组合派发｜弱命中标注边界试探｜未命中建卡）；子代理 scope 不符可拒单（out-of-scope），任务携反馈入队尾 FIFO 重组再派，累计 ≥2 次 PM 拆解自办或上报用户；任务卡头 `meta_injection: full|partial|none` 控制 META 预注入
- 派发模板：`templates/agents/zcode-dispatch.example.md`；追踪标识 `zcode.<stage>.<T-NNN>`（仅汇报用，无 key 沙箱）

## 从 pi 版迁移（pi 版 ↔ zcode 版映射）

| pi 版（`pi-ai-coordination` 分支） | ZCode 版（本分支） |
| --- | --- |
| pi 扩展 registerTool（coord_todo） | MCP server `mcp/coord-todo-server.mjs`（.mcp.json 注册） |
| 扩展 session_start 状态条/部件 | SessionStart hook additionalContext 注入（G1） |
| prompts/ 提示词模板 | commands/ 斜杠命令 |
| `--coord-plan` 旗标 + 工具门控 | zcode 原生 plan mode + /plan 命令流水线 |
| pi-subagents workflowScript（runs.*，key 禁冒号） | Agent 工具并行调用（无 key 沙箱） |
| pi 会话树 /tree /fork + `$PI_SESSION_FILE` | zcode 原生会话；`@session:` 由 coord_todo link 写入（`COORD_SESSION_ID` 注入） |
| eai 组命令 + 平面别名 | 插件命令天然命名空间，无需别名 |
| pi 全局指令 `~/.pi/agent/AGENTS.md`（全局思维架构） | `~/.zcode/AGENTS.md`（init-global.mjs 幂等部署，9 节纪律同构移植） |

迁移注意：跨工具数据无缝衔接——`.ai/` 目录、todo.md 行格式、docs/plans 编号、issues.js、全局池在
pi 版与本版完全同构，同一项目可互换使用两个宿主。唯一差异是 AGENTS.md 插桩标记（pi 版
`pi-ai-coordination:agents:v1`）：本版 init-project.js 检测到旧标记会**原位升级**为新标记块，
块外用户自有规范原样保留，不会叠层（有测试覆盖）。

## 卸载

- 停用插件：Settings → Plugin Management → 关闭 `ai-coordination`（或移除本地市场）
- 项目数据（`.ai/`、todo.md、docs/plans/、AGENTS.md 插桩）为纯数据，卸载插件不影响已归档内容，删除即可彻底清理

## 开发

```bash
npm test                 # node --test，15 例（todo-store / MCP JSON-RPC / G1 hook 子进程）
node scripts/init-project.js <项目根>   # 手动初始化
node scripts/init-global.mjs            # 手动 bootstrap 全局池
```

零运行时依赖（Node ≥18.17），不需要 npm install。
