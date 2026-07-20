# ai-coordination

分治思想双重落地 — 五步法错误进化 + 七层架构职责分层 | 上下文容灾 · 状态持久化 · 错误自我提炼

[![LGPL-3.0 License](https://img.shields.io/badge/license-LGPL--3.0-blue.svg)](LICENSE)

## 核心理念：分治思想的双重落地

**分治（Divide and Conquer）** 是软件工程最核心的思想——把复杂问题拆成独立子问题分别解决，再合并结果。ai-coordination 将分治在两个维度上系统化落地：

### 纵向递进：五步法 — 错误怎么才能永远不再犯？

```
症状 → 根因 → 修复 → 规律提炼 → 二次提炼接口(META)
 "表面现象"  "深层为什么"  "当下怎么修"  "通用模式"   "跨项目预防检查项"
```

每步有明确输入输出，上一步输出是下一步输入。这不是"记一下错误"，是**结构化的知识提炼流水线**。

### 横向分层：七层架构 — 代码怎么组织才不会乱？

```
                  coordination（对接层）
                  开发状态持久化、上下文容灾
                       ↓ 可读取所有层
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
presentation      interface          core
（展现层）        （接口层）          （核心层）
用户交互/视图     对外接口/协议适配    业务逻辑/核心算法
    ↓                 ↓                 ↓
    └─────────────────┼─────────────────┘
                      ↓ 均可依赖
                  shared（共享层）
                  常量、工具函数、通用类型、配置项
                  不依赖任何其他层，被所有层依赖
                      ↑ 被所有层依赖
                      ↓ 可测试所有层
                  testing（测试层）
                  各层接口验证、集成测试、回归守护
                  不被任何层依赖，可依赖所有被测层
                      ↑ 被所有层依赖
                  docs（文档层）
                  人与项目交互接口：使用者指南、需求梳理、数据对比
                  可读取所有层信息，禁止被任何代码层依赖
```

严格单向依赖：上层依赖下层，shared 是**地基**——不依赖任何人，但所有人依赖它。testing 是**守门员**——可测试所有被测层，但不被任何业务层依赖。coordination 层填补传统三层架构的盲区——**谁来管理开发过程本身？** docs 层填补另一个盲区——**谁来对接人？**

### 两者协同

七层架构提供**错误知识的归属层**（coordination），五步法提供**错误知识的提炼路径**。横向保证架构不乱，纵向保证知识不丢。

## 它解决什么问题？

| 痛点 | 解决方式 |
|------|---------|
| AI 会话结束，上下文丢失 | WORKSTATE.md 自动记录断点，新会话秒恢复 |
| 同样的错误在不同项目中重复出现 | 五步法提炼 META 规则，跨项目自动继承 |
| 代码架构混乱，改一处动全身 | 七层分治 + 严格单向依赖，职责隔离 |
| 开发过程不可追溯 | 操作履历、需求追踪、结构地图全程记录 |
| 多设备开发状态不同步 | 独立 Git 仓库云同步，多机无缝续接 |
| 多设备并行开发导致编号冲突 | 自动检测冲突，本地编号顺延，确保全局唯一 |
| 遇到不同领域问题不会切专家，单体硬扛 | **[新]** PM 编排 + 按项目驻场专家 + 按需上线 |
| META 规则笼统，无法按类检索挂载 | **[新]** 分类 META（受控词表）+ 关键词检索，预留向量 RAG |

## 调度编排层（v1.1 新增）

在七层架构之上新增一层「调度编排」，把"问题 → 对的专家"自动化：

```
用户请求 → [常驻 PM agent] 解析&分类 → 检索本地 Agent Registry
           → 驻场专家直接调度 / 按需专家(测试·安全)事件触发上线
           → 顺序委派编排（专家 → 测试 → 回流 → 修改）→ 提炼分类 META
```

- **常驻 PM**：唯一默认入口（G0 路由），`memory: project` 跨会话沉淀项目认知。
- **专家双生命周期**：resident（`.claude/agents/`，自动可调度）/ on-demand（`.ai/agents/stash/`，PM 调度前 `activate` 上线）。
- **三级来源（本地优先）**：项目 `.ai/agents/` → 用户全局 `~/.ai-coordination/agents/` → 远程 `agency-agents-zh` 按需拉取（`/ai:fetch`）。
- **分类 META**：规则带 category / layer / keywords，`meta-retriever.js` 关键词检索，为未来向量 RAG 预留 `embedding` 字段。
- **零运行时依赖**：所有脚本仅用 Node 内置模块。

> 详见 `skills/coordination/assets/agents/README.md` 与 SKILL.md 的 G0 路由。

## 安装

> 前提：已安装 Claude Code CLI 和 Git

### 最推荐：直接叫 Claude 帮你部署

不用记任何命令，把这段话发给 Claude：

```
请帮我部署 ai-coordination 插件：
1. 克隆 https://github.com/Atul-8/ai-coordination.git
2. 把 commands/ 复制到 ~/.claude/commands/ai/
3. 把 skills/coordination/ 复制到 ~/.claude/skills/coordination/
4. 把 skills/coordination/SKILL.md 的内容追加到 ~/.claude/CLAUDE.md
5. 完成后报告部署结果
```

Claude 会自动完成所有步骤，你去喝杯咖啡就好。

### 手动安装

```bash
git clone https://github.com/Atul-8/ai-coordination.git
cd ai-coordination
```

## 三种部署模式

| 模式 | 规范写入位置 | 生效范围 | 适用场景 |
|------|-------------|---------|---------|
| **全局模式** | `~/.claude/CLAUDE.md` | 所有项目 | 重度用户，所有项目都想用 |
| **项目模式** | `<项目>/CLAUDE.md` | 仅指定项目 | 只在部分项目中启用 |
| **测试模式** | `<项目>/CLAUDE.md` | 仅当前项目 | 临时试用，不部署文件 |

> **为什么必须写入 CLAUDE.md？** commands 和 skills 提供工具和触发条件，但 Claude 只有读取 CLAUDE.md 中的规范才会**强制执行**七层架构。纯靠 skills 触发，Claude 会"知道"但不"遵守"。

### 全局模式

所有项目自动生效，无需逐个配置：

```bash
cd /path/to/ai-coordination

# 1. 部署命令和技能
cp -r commands/ ~/.claude/commands/ai/
cp -r skills/coordination/ ~/.claude/skills/coordination/

# 2. 写入全局 CLAUDE.md
cat skills/coordination/SKILL.md >> ~/.claude/CLAUDE.md
```

### 项目模式

只在指定项目中生效，其他项目不受影响：

```bash
cd /path/to/ai-coordination

# 1. 部署命令和技能（全局，所有项目共用命令）
cp -r commands/ ~/.claude/commands/ai/
cp -r skills/coordination/ ~/.claude/skills/coordination/

# 2. 写入目标项目的 CLAUDE.md（而非全局）
cat skills/coordination/SKILL.md >> /path/to/your-project/CLAUDE.md
```

> 命令和技能可全局部署（让 `/ai:init` 等命令在任何项目可用），规范可以选择只写入特定项目。

### 测试模式

不复制任何文件，用 `--plugin-dir` 临时加载，规范写入当前项目：

```bash
cd /path/to/your-project

# 1. 临时加载命令和技能
claude --plugin-dir /path/to/ai-coordination

# 2. 在 Claude 中执行：将规范写入当前项目 CLAUDE.md
# 或手动执行：
cat /path/to/ai-coordination/skills/coordination/SKILL.md >> ./CLAUDE.md
```

> 退出会话后命令消失，但 CLAUDE.md 中的规范保留。

## 新电脑复刻

全局模式一键复刻：

```bash
git clone https://github.com/Atul-8/ai-coordination.git
cd ai-coordination
cp -r commands/ ~/.claude/commands/ai/
cp -r skills/coordination/ ~/.claude/skills/coordination/
cat skills/coordination/SKILL.md >> ~/.claude/CLAUDE.md
```

> Windows 用户路径对应 `%USERPROFILE%\.claude\`。

## Hook 强制执行方案（可选）

> **适用场景**：如果你发现 Claude 有时候不严格执行 G1-G4 规则，可以启用 Hook 方案强制执行。

### 方案说明

ai-coordination 提供三个 Hook 脚本，通过 Claude Code 的 Hook 机制强制执行铁律：

| Hook | 触发时机 | 强制执行内容 |
|------|---------|-------------|
| **PreToolUse** | Write/Edit 调用前 | G1 检查 + G2 登记 + G2.5 底层依赖验证提醒 |
| **PostToolUse** | Write/Edit 调用后 | G2 后续步骤：提醒更新 .ai 文件、运行测试 |
| **Stop** | 会话结束前 | G4 离场检查：输出自检清单 |

### 安装方式

将以下配置添加到 `~/.claude/settings.json` 的 `hooks` 字段：

```json
"hooks": {
  "PreToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"<plugin-dir>/src/hooks/pre-tool-use.js\""
        }
      ]
    }
  ],
  "PostToolUse": [
    {
      "matcher": "Write|Edit",
      "hooks": [
        {
          "type": "command",
          "command": "node \"<plugin-dir>/src/hooks/post-tool-use.js\""
        }
      ]
    }
  ],
  "Stop": [
    {
      "hooks": [
        {
          "type": "command",
          "command": "node \"<plugin-dir>/src/hooks/stop.js\""
        }
      ]
    }
  ]
}
```

> **注意**：将 `<plugin-dir>` 替换为本仓库实际的克隆/安装路径，如 `<plugin-dir>`、`C:/Users/xxx/.claude/plugins/ai-coordination` 等。

### 工作原理

1. **PreToolUse Hook**：
   - 检查项目是否有 `.ai/` 目录
   - 检查目标文件是否在 `.ai/` 目录外（排除 .ai 文件本身的更新）
   - 检查 `WORKSTATE.md` 是否有「正在进行」的任务登记
   - **没有登记则阻止操作**，输出提示要求先登记
   - **G2.5 验证提醒**：识别目标文件所属层级，若其底层依赖尚未验证，输出提醒（不阻止操作）

2. **PostToolUse Hook**：
   - 代码写入成功后输出提醒
   - 列出必须执行的同步步骤（更新 WORKSTATE、追加 LOG、检查 STRUCTURE 等）
   - **不阻止操作**（因为代码已写入），但强制提醒

3. **Stop Hook**：
   - 会话结束前输出离场检查清单
   - 显示当前 .ai 状态（最后更新时间、最近操作记录、错误数量等）
   - **不阻止会话结束**，但强制输出自检清单

### 效果

启用 Hook 后：

- **写代码前不登记 → 操作被阻止**，必须先在 WORKSTATE.md 登记
- **写代码后 → 自动输出提醒**，列出必须执行的同步步骤
- **会话结束前 → 自动输出自检清单**，确保不遗漏任何同步任务

这是「铁律」的真正落地：不是靠 Claude 自觉执行，而是靠 Hook 强制拦截。

## 状态栏 agent 显示（可选）

> **适用场景**：在状态栏实时看到「当前运行的 agent」——PM 此刻调度了哪个专家、当前会话本身是不是 PM。

ai-coordination 提供三个 statusLine 脚本，覆盖 Claude Code 的两层 agent 显示：

| 脚本 | 显示位置 | 显示内容 |
|------|---------|---------|
| **`subagent-statusline.js`** | 输入框下方的 agent 面板 | PM 此刻调度的每个专家 subagent（动态实时，核心价值） |
| **`ccline-agent-wrapper.js`** | 主状态栏那一行 | 当前会话的 agent 身份（如「项目经理」），自动包裹现有 ccline（CCometixLine） |
| **`hud-agent-wrapper.js`** | 主状态栏那一行 | 同上，但包裹的是 claude-hud 插件（保留 hud 的 Context 进度条、manual mode 等全部功能） |

> 主状态栏两个 wrapper **二选一**：按你已装的 statusLine 引擎挑选。装了 CCometixLine 用 ccline 版；装了 claude-hud 插件用 hud 版；都没装则任选其一（wrapper 会降级为仅显示 agent 段）。

### 安装方式

将以下两段配置添加到 `~/.claude/settings.json`（与 `statusLine` / `hooks` 平级）：

**运行中的 subagent 面板**（推荐，纯增量无风险）：

```json
"subagentStatusLine": {
  "type": "command",
  "command": "node \"<plugin-dir>/src/scripts/subagent-statusline.js\""
}
```

**主状态栏会话 agent 段**（二选一，替换原 `statusLine.command`）：

ccline 版（包裹 CCometixLine）：
```json
"statusLine": {
  "type": "command",
  "command": "node \"<plugin-dir>/src/scripts/ccline-agent-wrapper.js\"",
  "padding": 0
}
```

hud 版（包裹 claude-hud 插件）：
```json
"statusLine": {
  "type": "command",
  "command": "node \"<plugin-dir>/src/scripts/hud-agent-wrapper.js\"",
  "padding": 0
}
```

> **注意**：将 `<plugin-dir>` 替换为本仓库实际的克隆/安装路径。`statusLine.command` 是字面字符串，Claude Code 不解析其中的环境变量——**跨机器部署时每台机器都要把 `<plugin-dir>` 改成本机的实际路径**。两个 wrapper 内部都会自动定位引擎：
> - ccline 版：自动找 `~/.claude/ccline/ccline`（Windows 为 `ccline.exe`），可用 `AI_COORDINATION_CCLINE` env 覆盖。
> - hud 版：自动找 `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/claude-hud/claude-hud/<最新版本>/dist/index.js`，可用 `AI_COORDINATION_HUD_PATH` env 覆盖。

### 前提与降级

- **会话 agent 段**：仅当用 `claude --agent pm` 启动、或在 `settings.json` 顶层设了 `"agent": "pm"` 时，主状态栏才会出现「项目经理」段；普通会话该字段缺省，退化为与裸 ccline/hud 完全一致。
- **运行中 subagent 面板**：需较新版本 Claude Code 支持 `subagentStatusLine`；不支持则该配置静默无效，不报错。
- **未识别的 agent**（非 ai-coordination 专家，如 `general-purpose`）：原样显示 slug，不报错。

### 工作原理

- 三个脚本共用 `src/scripts/lib/agent-names.js`（slug ↔ 中文显示名映射，静态保底 + 动态扫描 `~/.claude/agents/` 与项目 `.ai/agents/stash/`）。
- `subagent-statusline.js` 从 stdin 读 `tasks[]`，按官方 `{id, content}` 协议逐行输出，渲染 `图标 · 中文名 · 状态 · token`，非法输入静默不报错。
- `ccline-agent-wrapper.js` / `hud-agent-wrapper.js` 透传原始 stdin 给底层引擎，三层 fallback 保证状态栏永不挂（JSON 解析失败 / 引擎不可用 / 全失败 均有兜底）。两者结构对称，仅「调用哪种引擎」不同：ccline 版 spawn `ccline.exe`，hud 版 spawn `node dist/index.js`。

## 检查脚本（节省 Token）

> **适用场景**：Hook 调用脚本执行检查，避免 Claude 重复读取文件浪费 token。

### 脚本说明

| 脚本 | 位置 | 功能 | 输出格式 |
|------|------|------|---------|
| `g1-check.js` | `src/scripts/` | G1 开门三件事检查 | JSON |
| `g2-check.js` | `src/scripts/` | G2 双门禁同步任务清单 | JSON |
| `g3-error.js` | `src/scripts/` | G3 错误五步法提炼（生成 ERR 文件） | JSON |
| `g4-check.js` | `src/scripts/` | G4 离场检查自检清单 | JSON |
| `ai-init.js` | `src/scripts/` | 初始化对接层目录 | JSON |
| `ai-status.js` | `src/scripts/` | 汇总输出项目状态 | JSON |
| `ai-sync.js` | `src/scripts/` | 同步到云端 Git 仓库 | JSON |
| `workstate-update.js` | `src/scripts/` | 更新 WORKSTATE.md（任务/进度/中断点） | JSON |
| `changelog-append.js` | `src/scripts/` | 追加 changelog/LOG.md 操作记录 | JSON |

### 工作原理

Hook 脚本调用检查脚本，脚本执行以下操作：

1. **读取文件**：扫描 `.ai/` 目录下的所有相关文件
2. **分析状态**：提取关键信息（最后更新时间、记录数量、Git 状态等）
3. **生成报告**：输出 JSON 格式的检查结果
4. **Hook 解析**：Hook 脚本解析 JSON，输出简洁的提示信息

### Token 节省效果

| 场景 | 传统方式（Claude 读取） | 脚本方式 | 节省 |
|------|----------------------|---------|------|
| G1 检查 | 读取 WORKSTATE + meta-rules + Git 状态 | 脚本输出 JSON | ~80% |
| G2 检查 | Claude 分析变更文件 | 脚本分析层级 | ~70% |
| G4 检查 | 读取 5+ 个文件 | 脚本汇总输出 | ~90% |

### 手动调用方式

你也可以手动调用脚本获取状态报告：

```bash
# 初始化对接层
node <plugin-dir>/src/scripts/ai-init.js [project-root] [remote-url]

# 查看状态
node <plugin-dir>/src/scripts/ai-status.js [project-root]

# G1 开门检查
node <plugin-dir>/src/scripts/g1-check.js [project-root]

# G2 同步任务清单
node <plugin-dir>/src/scripts/g2-check.js [project-root] [changed-files]

# G3 错误记录
node <plugin-dir>/src/scripts/g3-error.js [project-root] [error-type] [error-message] [affected-files]

# G4 离场检查
node <plugin-dir>/src/scripts/g4-check.js [project-root]

# 同步到云端
node <plugin-dir>/src/scripts/ai-sync.js [project-root] [remote-url]

# 更新工作状态
node <plugin-dir>/src/scripts/workstate-update.js [project-root] start "任务描述"
node <plugin-dir>/src/scripts/workstate-update.js [project-root] progress 50
node <plugin-dir>/src/scripts/workstate-update.js [project-root] interrupt "file.py:123" "正在修改" "继续完成"
node <plugin-dir>/src/scripts/workstate-update.js [project-root] finish
node <plugin-dir>/src/scripts/workstate-update.js [project-root] queue "新任务"
node <plugin-dir>/src/scripts/workstate-update.js [project-root] dequeue

# 追加操作日志
node <plugin-dir>/src/scripts/changelog-append.js [project-root] "完成" "修改文件" "file1,file2"
```

输出均为 JSON 格式，便于 Claude 解析或人工查看。

### AI 自动调用机制

| 脚本 | 自动调用时机 | 调用方式 |
|------|-------------|---------|
| `g1-check.js` | PreToolUse Hook 触发时 | Hook 脚本调用 |
| `g2-check.js` | PostToolUse Hook 触发时 | Hook 脚本调用 |
| `g3-error.js` | 需手动调用或 Claude 主动调用 | `/ai:error` 命令或 Bash |
| `g4-check.js` | Stop Hook 触发时 | Hook 脚本调用 |
| `ai-init.js` | 用户执行 `/ai:init` 时 | 命令调用脚本 |
| `ai-status.js` | 用户执行 `/ai:status` 时 | 命令调用脚本 |
| `ai-sync.js` | 用户执行 `/ai:sync` 时 | 命令调用脚本 |
| `workstate-update.js` | Claude 主动调用或手动调用 | Bash 命令 |
| `changelog-append.js` | PostToolUse Hook 自动调用 | Hook 脚本调用 |

**Hook 自动调用**：G1/G2/G4 检查脚本和 changelog-append 已集成到 Hook 中，Claude 无需主动调用，Hook 会自动执行并输出简洁提示。

**命令调用脚本**：`/ai:init`、`/ai:status`、`/ai:sync` 命令现在调用脚本而非 Claude 直接读取文件，大幅节省 token。

**自动追加 changelog**：每次 Write/Edit 操作后，Hook 自动调用 `changelog-append.js` 追加操作记录，无需 Claude 手动操作。

## 使用命令

| 命令 | 说明 |
|------|------|
| `/ai:pm <需求>` | **唯一对外入口** —— 任何需求/任务交给 PM 归类、写任务表、调度专家执行 |

> 以下为 **PM 内部工具**（开发者通常无需直接使用，由 PM 自行调用）：
>
> | 内部命令 | 用途 |
> |---------|------|
> | `/ai:init` | 初始化对接层（PM 首次启用） |
> | `/ai:status` | 查看工作状态 |
> | `/ai:agents` | 管理 agent registry |
> | `/ai:fetch` | 按需拉取专家 |
> | `/ai:dispatch` | 调度分析 |
> | `/ai:error` | 手动补录错误 |
> | `/ai:sync` | 同步对接层 |
> | `/ai:uninstall` | 清理对接层 |

### 典型工作流

```
/ai:init                          # 首次：初始化对接层
/ai:status                        # 随时：查看当前状态
/ai:error 异步函数未做错误处理     # 遇坑：记录并提炼规则
/ai:sync https://github.com/...   # 下班：同步到云端
```

## .ai/ 目录结构

```
.ai/
  README.md                     # 目录说明 + 共享策略
  WORKSTATE.md                  # 当前工作状态 + 未完成任务
  STRUCTURE.md                  # 代码结构分类描述
  changelog/
    LOG.md                      # 操作履历（追加，可归档）
  requirements/
    REQ-001.md                  # 每条需求独立文件
    REQ-002.md
  errors/
    raw/                        # 原始错误记录（五步法完整过程）
      ERR-001.md                # 每条错误独立文件
      ERR-002.md
    distilled/                  # 提炼成果（可跨项目共享）
      meta-rules.md             # META 规则汇总表
```

### 为什么这样分？

| 类型 | 更新方式 | 所在位置 | 理由 |
|------|---------|---------|------|
| 不增长的 | 覆盖更新 | .ai/ 根目录 | 体积可控，每次全量读取 |
| 持续增长的 | 追加写入 | 独立文件夹 | 每条记录独立文件，按需读取不浪费上下文 |

### errors/ 为什么分 raw 和 distilled？

- **raw/** — 完整的五步法调试过程，属于项目内部资料，**不建议共享**
- **distilled/** — 提炼后的 META 规则汇总，就是"错题本"，**强烈建议共享**

团队共享时，只需同步 `distilled/meta-rules.md`，新项目读取即可获得跨项目防线，无需暴露原始调试细节。

## 与同类工具的差异

市面上已有多种 AI 编程记忆/工作流方案，ai-coordination 的独特壁垒是：

**分治思想的双重落地** — 五步法（纵向递进）+ 七层架构（横向分层），竞品要么没有方法论，要么只有一个维度。

| 维度 | ai-coordination | ECC (216K★) | karpathy-skills (176K★) | Planning-with-Files (23K★) | claude-mem (82K★) |
|------|----------------|-------------|------------------------|---------------------------|-------------------|
| 核心能力 | 分治双重落地：五步法 + 七层架构 | 全栈 Agent 操作系统 | 行为规范四原则 | 任务规划 + 进度追踪 | 记忆压缩 + 语义搜索 |
| 错误分析方法论 | **五步法分治递进** | 无结构概率归纳 | 无 | 试错法(3-Strike) | 无 |
| 代码架构约束 | **七层分治 + 单向依赖** | 无架构约束 | 无 | 无 | 无 |
| 运行时依赖 | **零** | npm + Rust + SQLite | **零** | Shell 脚本 Hook | Node.js + Worker |
| 可卸载性 | **删 .ai/ 即可** | 需专用卸载流程 | **删 CLAUDE.md 行** | 需清理 Hook 脚本 | 需卸载服务 |
| 错误知识跨项目 | **有（distilled 错题本）** | 无 | 无 | 无 | 无 |

> ECC 是"全功能赛车"，karpathy-skills 是"驾驶守则"，Planning-with-Files 是"导航仪"，claude-mem 是"行车记录仪"，ai-coordination 是"保险系统 + 免疫系统"——出了事故提炼规律，永远不再犯同类事故。
>
> 详见 [竞争格局分析报告](COMPETITIVE_ANALYSIS.md)

## 七层架构

```
                  coordination（对接层）
                  开发状态持久化、上下文容灾
                       ↓ 可读取所有层
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
presentation      interface          core
（展现层）        （接口层）          （核心层）
用户交互/视图     对外接口/协议适配    业务逻辑/核心算法
    ↓                 ↓                 ↓
    └─────────────────┼─────────────────┘
                      ↓ 均可依赖
                  shared（共享层）
                  常量、工具函数、通用类型、配置项
                  不依赖任何其他层，被所有层依赖
                      ↑ 被所有层依赖
                      ↓ 可测试所有层
                  testing（测试层）
                  各层接口验证、集成测试、回归守护
                  不被任何层依赖，可依赖所有被测层
                      ↑ 被所有层依赖
                  docs（文档层）
                  人与项目交互接口：使用者指南、需求梳理、数据对比
                  可读取所有层信息，禁止被任何代码层依赖
```

| 层级 | 职责 | 典型内容 |
|------|------|---------|
| **coordination** | 开发状态持久化、上下文容灾、业务需求对接 | 工作状态、操作日志、代码结构描述、需求变更、错误知识库 |
| **presentation** | 用户交互、视图渲染、输入输出 | UI 组件、页面、交互逻辑、状态展示 |
| **interface** | 对外接口封装、协议适配、类型契约 | API 调用、协议转换、接口类型定义、配置、**安全认证（鉴权/加密/限流）、外部服务对接、数据脱敏接口** |
| **core** | 业务逻辑、算法实现、数据处理 | 领域模型、核心算法、处理流程、状态机 |
| **shared** | 跨层通用基础能力，被所有层依赖，不依赖任何人 | 常量、工具函数、通用类型、配置项、**环境变量管理、日志规范、异常体系、审计日志、性能埋点** |
| **testing** | 各层接口验证、集成回归守护，不被任何层依赖 | presentation 快照测试、interface 契约测试、core 单元测试、shared 工具测试、集成测试、E2E 测试 |
| **docs** | 人与项目的数据交互接口，对接所有人类角色 | **使用者指南**（入门文档、使用说明）、**需求梳理**（产品经理对接、PRD 输出）、**数据对比**（竞品分析、性能对比、技术选型报告）、**项目介绍**（新成员架构解读） |

## 仓库结构

```
ai-coordination/
├── src/                          # 源代码
│   ├── hooks/                    # Hook 强制执行脚本（自动调用脚本）
│   │   ├── pre-tool-use.js       # PreToolUse Hook - 调用 g1-check.js
│   │   ├── post-tool-use.js      # PostToolUse Hook - 调用 g2-check.js + changelog-append.js
│   │   └── stop.js               # Stop Hook - 调用 g4-check.js
│   └── scripts/                  # 检查脚本（节省 token，零依赖）
│       ├── ai-init.js            # 初始化对接层（含 .ai/agents/）
│       ├── ai-status.js          # 状态查看脚本
│       ├── ai-sync.js            # 云端同步脚本
│       ├── g1-check.js           # G1 开门三件事检查
│       ├── g2-check.js           # G2 双门禁同步任务清单
│       ├── g3-error.js           # G3 错误五步法提炼
│       ├── g4-check.js           # G4 离场检查自检清单
│       ├── workstate-update.js   # 自动更新 WORKSTATE.md
│       ├── changelog-append.js   # 自动追加 changelog/LOG.md
│       ├── meta-index.js         # [新] META 规则索引生成（md→json）
│       ├── meta-retriever.js     # [新] META 规则检索（关键词档，预留向量 RAG）
│       ├── meta-classify.js      # [新] META 规则分类建议（受控词表）
│       ├── agent-registry.js     # [新] Agent 注册表（三级存储 + 双生命周期）
│       ├── agent-roster.js       # [新] 项目结构 → 驻场专家提议
│       ├── pm-dispatch.js        # [新] PM 调度链建议（任务 → 专家 + META）
│       ├── agent-fetch.js        # [新] 从 agency-agents-zh 按需拉取专家
│       └── lib/                  # [新] 共享模块
│           ├── detect-layer.js   #     层级检测（DRY，4 处去重）
│           └── agent-format.js   #     agent 框架封装（slug 化 / 注入前导）
├── commands/                     # 命令定义（调用脚本）
│   ├── init.md                   # /ai:init - 初始化对接层
│   ├── status.md                 # /ai:status - 查看状态
│   ├── sync.md                   # /ai:sync - 同步云端
│   ├── error.md                  # /ai:error - 记录错误
│   ├── agents.md                 # [新] /ai:agents - 管理 agent registry
│   ├── fetch.md                  # [新] /ai:fetch - 按需拉取专家 agent
│   ├── dispatch.md               # [新] /ai:dispatch - PM 调度分析
│   └── uninstall.md              # /ai:uninstall - 清理对接层
├── skills/coordination/          # 技能定义 + 模板
│   ├── SKILL.md                  # 架构规范（含 G0 路由，需写入 CLAUDE.md）
│   └── assets/                   # 初始化模板
│       ├── README.md
│       ├── WORKSTATE.md
│       ├── STRUCTURE.md
│       ├── changelog/LOG.md
│       ├── requirements/REQ-000.md
│       ├── errors/
│       │   ├── raw/ERR-000.md
│       │   └── distilled/meta-rules.md   # 分类 META（RAG-ready 格式）
│       └── agents/               # [新] 调度编排层种子资源
│           ├── pm.md             #     项目经理（常驻，编排中枢）
│           ├── embedded-firmware-engineer.md / pc-host-engineer.md
│           ├── tester.md / security-engineer.md / code-reviewer.md / software-architect.md
│           ├── registry.json     #     agent 注册表模板
│           ├── ROSTER.md         #     驻场名单模板
│           └── README.md         #     agents 目录说明
├── COMPETITIVE_ANALYSIS.md       # 竞争格局分析报告
├── SCI_GUIDE.md                  # 架构思想与原理详解
└── INSTALL.md                    # 详细部署文档
```

## 文档

- [竞争格局分析](COMPETITIVE_ANALYSIS.md) — 与同类工具的深度对比
- [科普指南](SCI_GUIDE.md) — 架构思想和原理详解
- [详细部署](INSTALL.md) — 完整安装和配置说明

## License

LGPL-3.0
