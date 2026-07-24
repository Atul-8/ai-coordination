# ai-coordination 安装部署指南

> 从零开始，5 分钟完成安装和首次使用

## 前置条件

| 条件 | 要求 | 检查方式 |
|------|------|---------|
| Claude Code | 已安装并可用 | `claude --version` |
| Git | 已安装 | `git --version` |
| 网络（可选） | 云同步需要 GitHub/Gitee 账号 | — |

---

## 方式 1：Plugin Marketplace 安装（v1.2+ 推荐）

**最快方式**——在 Claude Code 里跑两行命令，所有 agent / commands / hooks 自动加载：

```bash
# 1. 添加 ai-coordination 仓库为 marketplace（一次性）
/plugin marketplace add Atul-8/ai-coordination

# 2. 安装 plugin（一次性，所有项目自动生效）
/plugin install ai-coordination@ai-coordination
```

**安装后立即获得**：
- ✅ 8 个 agent（PM + PA 项目助理 + 6 专家）—— `claude --agent pm` / `--agent project-assistant` 等全局可用
- ✅ 9 个命令（`/ai:pm` `/ai:init` `/ai:status` 等）全局可用
- ✅ 3 个 hook（G1/G2/G4 铁律强制执行）自动加载
- ✅ 任何项目含 `.ai/` 目录即启用 G1-G4 铁律
- ✅ 跨项目共享的全局 META 规则池（`C:\.ai_meta` 或 `~/.ai_meta`）

**前置条件**：
- Claude Code 较新版本（支持 `/plugin` 命令）
- 仓库 `Atul-8/ai-coordination` 对你可访问（public 对所有人，private 需 GitHub 授权）

**升级**：
```bash
# 仓库 push 新版本后，在 Claude Code 里
/plugin update ai-coordination@ai-coordination
```

**卸载**：
```bash
/plugin uninstall ai-coordination@ai-coordination
# 可选：移除 marketplace
/plugin marketplace remove ai-coordination
```

> **与方式 2 的关系**：方式 1 是 v1.2+ 的推荐姿势（自动、干净、可升级），方式 2（手动 cp）是 v1.1 时代的旧办法，两者效果等价但方式 1 更省心。

---

## 方式 2：手动部署（旧方式，等价但繁琐）

### 最推荐：让 Claude 自己部署

不用记任何命令。打开 Claude Code，把下面这段话发给它：

```
请帮我部署 ai-coordination 插件：
1. 克隆 https://github.com/Atul-8/ai-coordination.git 到临时目录
2. 把 commands/ 复制到 ~/.claude/commands/ai/
3. 把 skills/coordination/ 复制到 ~/.claude/skills/coordination/
4. 把 skills/coordination/SKILL.md 的内容追加到 ~/.claude/CLAUDE.md
5. 完成后报告部署结果
```

Claude 会自动完成所有步骤。你不需要记住 `cp`、`cat >>` 等命令，也不需要关心路径细节。

**如果想只在某个项目生效**，把第 4 步改为：
```
4. 把 skills/coordination/SKILL.md 的内容追加到 /path/to/your-project/CLAUDE.md
```

---

## 核心概念

ai-coordination 由两部分组成：

| 组件 | 作用 | 部署位置 |
|------|------|---------|
| **commands + skills** | 提供工具命令和触发条件 | `~/.claude/`（全局共用） |
| **SKILL.md 规范** | 让 Claude **强制执行**七层架构 | 写入 CLAUDE.md（全局或项目级） |

> 只部署 commands 和 skills，Claude 会"知道"但不"遵守"。SKILL.md 必须写入 CLAUDE.md 才能强制执行。

---

## 三种部署模式

### 模式一：全局模式（推荐日常使用）

所有项目自动生效，一次配置到处使用。

```bash
# 1. 克隆仓库
git clone https://github.com/Atul-8/ai-coordination.git
cd ai-coordination

# 2. 部署命令和技能到全局
cp -r commands/ ~/.claude/commands/ai/
cp -r skills/coordination/ ~/.claude/skills/coordination/

# 3. 写入架构规范到全局 CLAUDE.md
cat skills/coordination/SKILL.md >> ~/.claude/CLAUDE.md
```

**效果**：任意项目启动 Claude Code 即可使用 `/ai:init` 等命令，且严格遵守七层架构。

**适合**：个人开发者、所有项目都想用这套架构的用户。

---

### 模式二：项目模式（推荐团队/选择性使用）

命令全局可用，规范只入侵指定项目。

```bash
# 1. 克隆仓库
git clone https://github.com/Atul-8/ai-coordination.git
cd ai-coordination

# 2. 部署命令和技能到全局（所有项目共用命令）
cp -r commands/ ~/.claude/commands/ai/
cp -r skills/coordination/ ~/.claude/skills/coordination/

# 3. 写入架构规范到【目标项目】的 CLAUDE.md
cat skills/coordination/SKILL.md >> /path/to/your-project/CLAUDE.md
```

**效果**：只有写入了规范的项目会严格执行七层架构，其他项目命令可用但不强制架构规范。

**适合**：
- 只想在部分项目中使用七层架构
- 团队项目中，规范跟随项目走（CLAUDE.md 提交到仓库，团队成员自动生效）
- 担心全局规范影响其他项目

> 可以给多个项目分别写入，每个项目独立控制。

---

### 模式三：测试模式（推荐首次体验）

不复制任何文件到全局，用 `--plugin-dir` 临时加载并入侵当前项目。

```bash
# 1. 克隆仓库（或下载 ZIP）
git clone https://github.com/Atul-8/ai-coordination.git

# 2. 进入你的项目，用 --plugin-dir 启动
cd /path/to/your-project
claude --plugin-dir /path/to/ai-coordination

# 3. 在 Claude 中执行，将规范写入当前项目 CLAUDE.md
# 手动方式：
cat /path/to/ai-coordination/skills/coordination/SKILL.md >> ./CLAUDE.md
```

**效果**：
- 当前会话可使用 `/ai:init` 等命令（退出会话后命令消失）
- 当前项目 CLAUDE.md 中的规范永久保留

**适合**：
- 首次体验，不想修改全局配置
- 在别人的电脑上临时使用
- 对 ai-coordination 持观望态度，先试再说

---

**三种模式对比**：

| | 全局模式 | 项目模式 | 测试模式 |
|---|---------|---------|---------|
| 命令可用性 | 所有项目 | 所有项目 | 仅当前会话 |
| 规范生效范围 | 所有项目 | 仅指定项目 | 仅当前项目 |
| 需要复制文件 | 是 | 是 | 否 |
| 需要写入 CLAUDE.md | 全局 | 项目级 | 项目级 |
| 退出会话后 | 保留 | 保留 | 命令消失，规范保留 |
| 适合谁 | 重度用户 | 选择性使用 | 首次体验 |

---

## 首次使用：3 步上手

### 第 1 步：初始化项目

在你的项目目录中启动 Claude Code 并执行：

```
/ai:init
```

这会在项目根目录下创建 `.ai/` 目录：

```
你的项目/
  .ai/
    README.md                  # 目录说明 + 共享策略
    WORKSTATE.md               # 工作状态
    STRUCTURE.md               # 代码结构地图（自动填充）
    changelog/
      LOG.md                   # 操作履历
    requirements/              # 需求记录（每条独立文件）
    errors/
      raw/                     # 原始错误记录（每条独立文件）
      distilled/
        meta-rules.md          # META 规则汇总
```

同时会：
- 将 `.ai/` 目录初始化为独立的 Git 仓库
- 在项目根的 `.gitignore` 中添加 `.ai/`（避免影响主仓库）

### 第 2 步：正常开发

正常使用 Claude Code 开发即可。插件会在以下时刻自动工作：

| 时刻 | 自动行为 |
|------|---------|
| 新会话开始 | 读取 WORKSTATE.md，恢复上次中断点 |
| 任务执行中 | 更新工作状态和中断点 |
| 任务完成后 | 更新 WORKSTATE.md + 追加 changelog/LOG.md |
| 架构变更后 | 更新 STRUCTURE.md |
| 需求变更时 | 新建 requirements/REQ-NNN.md |
| 遇到错误时 | 新建 errors/raw/ERR-NNN.md + 更新 errors/distilled/meta-rules.md |

### 第 3 步：配置云同步（可选）

```
/ai:sync https://github.com/yourname/your-project-ai-state.git
```

将 `.ai/` 目录同步到云端 Git 仓库，实现多机访问和备份。

---

## 命令详解

### /ai:init — 初始化

**用法**：`/ai:init`

**行为**：
1. 检查 `.ai/` 目录是否已存在
2. 创建目录结构（含 changelog/、requirements/、errors/raw/、errors/distilled/）
3. 写入模板文件
4. 分析项目结构，填充 STRUCTURE.md
5. 初始化 `.ai/` 为独立 Git 仓库
6. 更新项目根 `.gitignore`

**注意**：如果 `.ai/` 已存在，会询问是否覆盖。

---

### /ai:status — 查看状态

**用法**：`/ai:status`

**行为**：
1. 读取 WORKSTATE.md — 显示当前任务、未完成队列、中断点
2. 读取 STRUCTURE.md — 显示项目架构概览
3. 列出 requirements/ 目录 — 显示活跃需求数量和标题
4. 列出 errors/raw/ 目录 — 显示错误计数
5. 读取 errors/distilled/meta-rules.md — 显示 META 规则数
6. 读取 changelog/LOG.md — 显示最近 5 条操作记录
7. 输出项目状态摘要

---

### /ai:error — 记录错误

**用法**：`/ai:error <错误简要描述>`

**示例**：
```
/ai:error 异步函数未做错误处理导致数据丢失
```

**行为**：
1. 列出 errors/raw/ 目录获取当前最大 ERR 编号
2. 按五步法分析：
   - **症状**：表面现象
   - **根因**：连问 3 个为什么
   - **修复**：具体修复方式
   - **规律提炼**：抽象通用规则
   - **二次提炼接口**：生成 META-XXX 规则
3. 创建 errors/raw/ERR-NNN.md（原始记录）
4. 如果提炼出 META 规则，追加到 errors/distilled/meta-rules.md

---

### /ai:sync — 云同步

**用法**：
- 首次：`/ai:sync <远程仓库URL>`
- 后续：`/ai:sync`（自动推送到已配置的远程仓库）

**示例**：
```
/ai:sync https://github.com/yourname/my-project-ai.git
```

**行为**：
1. 检查 `.ai/` 目录是否存在
2. 提交所有变更
3. 配置远程仓库（首次）或直接推送
4. 报告同步结果

**选择性同步**：团队可以选择只共享提炼成果，在 `.ai/` 中添加 `.gitignore`：
```
# .ai/.gitignore — 只共享提炼后的 META 规则
errors/raw/
changelog/
```
这样推送时不会暴露原始调试细节和操作履历，团队成员只收到 `distilled/meta-rules.md` 错题本。

**推荐的远程仓库结构**：
```
yourname/
  project-a-ai/     ← 项目 a 的 .ai/ 同步目标
  project-b-ai/     ← 项目 b 的 .ai/ 同步目标
```

---

### /ai:uninstall — 卸载

**用法**：`/ai:uninstall`

**行为**：
1. 列出 `.ai/` 目录中的所有文件
2. 如果有云同步配置，显示远程 URL（数据不会丢失）
3. **必须确认后才执行删除**
4. 删除 `.ai/` 目录
5. 清理 `.gitignore` 中的相关条目

**注意**：这是破坏性操作，需要明确确认。随时可以用 `/ai:init` 重新创建。

---

## 配置说明

### .gitignore 处理

`/ai:init` 会自动将 `.ai/` 添加到项目根的 `.gitignore`。原因是：
- `.ai/` 有自己独立的 Git 仓库，不应被主仓库追踪
- 不同开发者的 AI 工作状态可能不同
- 避免主仓库的提交历史被元数据污染

如需自定义，可在 `.gitignore` 中调整。

### STRUCTURE.md 自动填充

初始化时，插件会自动分析项目结构并填充 STRUCTURE.md：
1. 扫描项目目录，识别常见的分层模式
2. 将目录映射到七层架构的对应层
3. 生成关键模块表（模块名、路径、职责、依赖）

如果分析不准确，可以手动编辑 STRUCTURE.md。

### 团队共享设置

团队协作时，建议使用**项目模式**：
1. 将 SKILL.md 规范写入项目 `CLAUDE.md`（随仓库提交）
2. 所有成员拉取项目后自动获得架构规范
3. 为 `.ai/` 创建共享的远程仓库
4. 所有成员使用同一个 `/ai:sync` 目标
5. 工作前先同步拉取最新状态，工作后及时推送更新

### Hook 强制执行（可选）

如果发现 Claude 偶尔不严格执行 G1–G4 规则，可启用 Hook 方案强制拦截。ai-coordination 提供三个 Hook 脚本（位于 `src/hooks/`）：

- **PreToolUse**（Write/Edit 前）：G1 检查 + G2 登记 + G2.5 底层依赖验证提醒
- **PostToolUse**（Write/Edit 后）：G2 同步提醒 + 自动追加 changelog
- **Stop**（会话结束前）：G4 离场检查自检清单

将对应配置添加到 `~/.claude/settings.json` 的 `hooks` 字段，`command` 指向本仓库的 `src/hooks/*.js`。完整配置示例见 [README.md — Hook 强制执行方案](README.md)。

### 状态栏 agent 显示（可选）

如需在状态栏实时查看当前运行的 agent（PM 调度的专家 subagent + 会话 agent 身份），ai-coordination 提供三个 statusLine 脚本（位于 `src/scripts/`）：

- **`subagent-statusline.js`**：在输入框下方面板显示 PM 此刻调度的每个专家 subagent（动态实时，核心价值）
- **`ccline-agent-wrapper.js`**：在主状态栏显示会话 agent 身份（如「项目经理」），自动包裹现有 ccline（CCometixLine）
- **`hud-agent-wrapper.js`**：同上，但包裹的是 claude-hud 插件（保留 hud 的 Context 进度条、manual mode 等全部功能）

**按你已装的 statusLine 引擎二选一**（ccline 和 hud 选一个）：

| 你装了 | 用哪个 wrapper | 依赖位置 |
|---|---|---|
| CCometixLine（`~/.claude/ccline/ccline.exe`） | `ccline-agent-wrapper.js` | ccline 二进制 |
| claude-hud 插件（`enabledPlugins.claude-hud`） | `hud-agent-wrapper.js` | hud 在 plugins/cache 下 |
| 都没装 | 两个 wrapper 都会降级为仅显示 agent 段 | — |

**配置方法**（以 hud 为例，将 `<plugin-dir>` 替换为本仓库在你机器上的实际路径）：

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"<plugin-dir>/src/scripts/hud-agent-wrapper.js\"",
    "padding": 0
  },
  "subagentStatusLine": {
    "type": "command",
    "command": "node \"<plugin-dir>/src/scripts/subagent-statusline.js\""
  },
  "agent": "pm"
}
```

> **跨机器部署**：`statusLine.command` 是字面字符串，Claude Code 不解析其中的环境变量。所以每台新机器都需要把 `<plugin-dir>` 替换为该机器上 ai-coordination 仓库的实际克隆路径（例如 `F:/AI/ai-coordination` 或 `/home/you/ai-coordination`）。hud 版 wrapper 会自动从 `${CLAUDE_CONFIG_DIR:-~/.claude}/plugins/cache/claude-hud/claude-hud/<最新版本>/dist/index.js` 查找 hud 入口，无需手动配置 hud 路径；非标准安装位置可用 `AI_COORDINATION_HUD_PATH` 环境变量覆盖。

完整配置、前提条件与降级说明见 [README.md — 状态栏 agent 显示](README.md)。

---

## 常见问题

### Q: 安装后命令不可用？

确认文件已正确复制到 `~/.claude/`：
```bash
ls ~/.claude/commands/ai/
ls ~/.claude/skills/coordination/
```

如果是测试模式，确认使用了 `--plugin-dir` 参数启动。

### Q: Claude 不遵守七层架构规范？

必须将 SKILL.md 写入 CLAUDE.md：

```bash
# 全局模式
cat skills/coordination/SKILL.md >> ~/.claude/CLAUDE.md

# 项目模式
cat skills/coordination/SKILL.md >> /path/to/your-project/CLAUDE.md
```

skills 提供工具触发，CLAUDE.md 提供强制执行。两者缺一不可。

### Q: 全局模式和项目模式可以混用吗？

可以。命令和技能全局部署让所有项目都能用 `/ai:init`，规范根据需要选择性写入：
- 写入全局 CLAUDE.md → 所有项目强制执行
- 写入项目 CLAUDE.md → 仅该项目强制执行
- 两者都不写 → 命令可用，但不强制架构规范

### Q: /ai:init 提示目录已存在？

如果 `.ai/` 已存在，命令会询问是否覆盖。选择：
- **覆盖**：用新模板替换所有文件（已有数据会丢失）
- **跳过**：保留现有内容

### Q: 云同步推送失败？

常见原因：
1. **远程仓库不存在** — 先在 GitHub/Gitee 上创建仓库
2. **认证失败** — 检查 Git 凭据配置（`git config --global credential.helper`）
3. **网络问题** — 确认可以访问远程仓库

### Q: 如何在多个项目间共享 META 规则？

1. 在项目 A 的 `.ai/errors/distilled/meta-rules.md` 中积累了 META 规则
2. 新建项目 B → `/ai:init`
3. 将项目 A 的 `distilled/meta-rules.md` 复制到项目 B 的 `.ai/errors/distilled/meta-rules.md`
4. 项目 B 自动获得项目 A 的错误防线

### Q: 如何卸载？

1. 在项目中执行 `/ai:uninstall`（清理 `.ai/` 目录）
2. 删除全局部署文件：
   ```bash
   rm -rf ~/.claude/commands/ai/
   rm -rf ~/.claude/skills/coordination/
   ```
3. 从 CLAUDE.md 中移除七层架构相关内容：
   - 全局模式：编辑 `~/.claude/CLAUDE.md`
   - 项目模式：编辑 `<项目>/CLAUDE.md`

卸载后，你的项目代码完全不受影响。

---

## 目录结构参考

```
ai-coordination/
├── .claude-plugin/
│   └── plugin.json              # 插件元数据
├── src/                         # 源代码（Hook + 检查脚本）
│   ├── hooks/                   # Hook 强制执行脚本
│   │   ├── pre-tool-use.js      # PreToolUse — G1 检查 + G2.5 验证提醒
│   │   ├── post-tool-use.js     # PostToolUse — G2 同步提醒 + changelog 追加
│   │   └── stop.js              # Stop — G4 离场检查
│   └── scripts/                 # 检查脚本（节省 token）
│       ├── ai-init.js           # 初始化对接层
│       ├── ai-status.js         # 状态查看
│       ├── ai-sync.js           # 云端同步
│       ├── g1-check.js          # G1 开门三件事检查
│       ├── g2-check.js          # G2 双门禁同步清单
│       ├── g3-error.js          # G3 错误五步法提炼
│       ├── g4-check.js          # G4 离场检查
│       ├── workstate-update.js  # 更新 WORKSTATE.md
│       └── changelog-append.js  # 追加 changelog/LOG.md
├── commands/                    # → 部署到 ~/.claude/commands/ai/
│   ├── init.md
│   ├── status.md
│   ├── error.md
│   ├── sync.md
│   └── uninstall.md
├── skills/coordination/         # → 部署到 ~/.claude/skills/coordination/
│   ├── SKILL.md                 # → 写入 CLAUDE.md（全局或项目级）
│   └── assets/
│       ├── README.md
│       ├── WORKSTATE.md
│       ├── STRUCTURE.md
│       ├── changelog/LOG.md
│       ├── requirements/REQ-000.md
│       └── errors/
│           ├── raw/ERR-000.md
│           └── distilled/meta-rules.md
├── COMPETITIVE_ANALYSIS.md      # 竞争格局分析
├── README.md
├── SCI_GUIDE.md                 # 科普指南
└── INSTALL.md                   # 本文件
```

---

## 快速检查清单

根据你选择的模式确认：

**全局模式**：
- [ ] `~/.claude/commands/ai/` 目录包含 5 个命令文件
- [ ] `~/.claude/skills/coordination/` 目录包含 SKILL.md 和 assets/
- [ ] `~/.claude/CLAUDE.md` 中包含七层架构规范

**项目模式**：
- [ ] `~/.claude/commands/ai/` 目录包含 5 个命令文件
- [ ] `~/.claude/skills/coordination/` 目录包含 SKILL.md 和 assets/
- [ ] 目标项目的 `CLAUDE.md` 中包含七层架构规范

**测试模式**：
- [ ] 使用 `--plugin-dir` 参数启动 Claude Code
- [ ] 当前项目的 `CLAUDE.md` 中包含七层架构规范

**通用检查**：
- [ ] `/ai:init` 命令可识别
- [ ] 项目中出现了 `.ai/` 目录和完整结构
- [ ] `.gitignore` 中包含 `.ai/`
- [ ] （可选）云同步远程仓库已配置
- [ ] （可选）`.ai/.gitignore` 中配置了选择性共享（如排除 errors/raw/）

如遇到问题，请检查上述清单或在 GitHub 仓库提交 Issue。
