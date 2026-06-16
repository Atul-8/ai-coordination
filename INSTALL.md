# ai-coordination 安装部署指南

> 从零开始，5 分钟完成安装和首次使用

## 前置条件

| 条件 | 要求 | 检查方式 |
|------|------|---------|
| Claude Code | 已安装并可用 | `claude --version` |
| Git | 已安装 | `git --version` |
| 网络（可选） | 云同步需要 GitHub/Gitee 账号 | — |

---

## 核心概念

ai-coordination 由两部分组成：

| 组件 | 作用 | 部署位置 |
|------|------|---------|
| **commands + skills** | 提供工具命令和触发条件 | `~/.claude/`（全局共用） |
| **SKILL.md 规范** | 让 Claude **强制执行**五层架构 | 写入 CLAUDE.md（全局或项目级） |

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

**效果**：任意项目启动 Claude Code 即可使用 `/ai:init` 等命令，且严格遵守五层架构。

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

**效果**：只有写入了规范的项目会严格执行五层架构，其他项目命令可用但不强制架构规范。

**适合**：
- 只想在部分项目中使用五层架构
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
2. 将目录映射到五层架构的对应层
3. 生成关键模块表（模块名、路径、职责、依赖）

如果分析不准确，可以手动编辑 STRUCTURE.md。

### 团队共享设置

团队协作时，建议使用**项目模式**：
1. 将 SKILL.md 规范写入项目 `CLAUDE.md`（随仓库提交）
2. 所有成员拉取项目后自动获得架构规范
3. 为 `.ai/` 创建共享的远程仓库
4. 所有成员使用同一个 `/ai:sync` 目标
5. 工作前先同步拉取最新状态，工作后及时推送更新

---

## 常见问题

### Q: 安装后命令不可用？

确认文件已正确复制到 `~/.claude/`：
```bash
ls ~/.claude/commands/ai/
ls ~/.claude/skills/coordination/
```

如果是测试模式，确认使用了 `--plugin-dir` 参数启动。

### Q: Claude 不遵守五层架构规范？

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
3. 从 CLAUDE.md 中移除五层架构相关内容：
   - 全局模式：编辑 `~/.claude/CLAUDE.md`
   - 项目模式：编辑 `<项目>/CLAUDE.md`

卸载后，你的项目代码完全不受影响。

---

## 目录结构参考

```
ai-coordination/
├── .claude-plugin/
│   └── plugin.json              # 插件元数据
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
- [ ] `~/.claude/CLAUDE.md` 中包含五层架构规范

**项目模式**：
- [ ] `~/.claude/commands/ai/` 目录包含 5 个命令文件
- [ ] `~/.claude/skills/coordination/` 目录包含 SKILL.md 和 assets/
- [ ] 目标项目的 `CLAUDE.md` 中包含五层架构规范

**测试模式**：
- [ ] 使用 `--plugin-dir` 参数启动 Claude Code
- [ ] 当前项目的 `CLAUDE.md` 中包含五层架构规范

**通用检查**：
- [ ] `/ai:init` 命令可识别
- [ ] 项目中出现了 `.ai/` 目录和完整结构
- [ ] `.gitignore` 中包含 `.ai/`
- [ ] （可选）云同步远程仓库已配置
- [ ] （可选）`.ai/.gitignore` 中配置了选择性共享（如排除 errors/raw/）

如遇到问题，请检查上述清单或在 GitHub 仓库提交 Issue。
