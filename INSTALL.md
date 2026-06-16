# ai-coordination 安装部署指南

> 从零开始，5 分钟完成安装和首次使用

## 前置条件

| 条件 | 要求 | 检查方式 |
|------|------|---------|
| Claude Code | 已安装并可用 | `claude --version` |
| Git | 已安装 | `git --version` |
| 网络（可选） | 云同步需要 GitHub/Gitee 账号 | — |

---

## 安装方式

### 方式一：从 Git 仓库安装（推荐）

```bash
# 方式 A：Fork 本仓库后克隆你自己的副本（推荐，方便自定义和接收更新）
# 1. 在 GitHub 上 Fork https://github.com/Atul-8/ai-coordination
# 2. 克隆你 Fork 的仓库
git clone https://github.com/<your-username>/ai-coordination.git

# 方式 B：直接克隆官方仓库
git clone https://github.com/Atul-8/ai-coordination.git

# 2. 启动 Claude Code 并加载插件
claude --plugin-dir /path/to/ai-coordination
```

### 方式二：本地测试

如果你已经下载了插件源码：

```bash
claude --plugin-dir /path/to/ai-coordination
```

### 方式三：直接下载 ZIP

1. 访问仓库页面，点击 "Code" → "Download ZIP"
2. 解压到任意目录
3. 执行 `claude --plugin-dir /path/to/ai-coordination`

---

## 首次使用：3 步上手

### 第 1 步：初始化项目

在你的项目目录中启动 Claude Code 并执行：

```
/ai-init
```

这会在项目根目录下创建 `.ai/` 目录，包含 5 个核心文件：

```
你的项目/
  .ai/
    WORKSTATE.md      # 工作状态
    CHANGELOG.md      # 操作履历
    STRUCTURE.md      # 代码结构地图（自动填充）
    REQUIREMENTS.md   # 需求记录
    ERRORS.md         # 错误知识库
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
| 任务完成后 | 更新 WORKSTATE.md + 追加 CHANGELOG.md |
| 架构变更后 | 更新 STRUCTURE.md |
| 需求变更时 | 记录到 REQUIREMENTS.md |
| 遇到错误时 | 按五步法记录到 ERRORS.md |

### 第 3 步：配置云同步（可选）

```
/ai-sync https://github.com/yourname/your-project-ai-state.git
```

将 `.ai/` 目录同步到云端 Git 仓库，实现多机访问和备份。

---

## 命令详解

### /ai-init — 初始化

**用法**：`/ai-init`

**行为**：
1. 检查 `.ai/` 目录是否已存在
2. 复制 5 个模板文件到 `.ai/`
3. 分析项目结构，填充 STRUCTURE.md
4. 初始化 `.ai/` 为独立 Git 仓库
5. 更新项目根 `.gitignore`

**注意**：如果 `.ai/` 已存在，会询问是否覆盖。

---

### /ai-status — 查看状态

**用法**：`/ai-status`

**行为**：
1. 读取 WORKSTATE.md — 显示当前任务、未完成队列、中断点
2. 读取 REQUIREMENTS.md — 显示活跃需求
3. 读取 ERRORS.md — 显示错误计数和 META 规则
4. 读取 CHANGELOG.md — 显示最近 5 条操作记录
5. 输出项目状态摘要

---

### /ai-error — 记录错误

**用法**：`/ai-error <错误简要描述>`

**示例**：
```
/ai-error 异步函数未做错误处理导致数据丢失
```

**行为**：
1. 读取 ERRORS.md 获取当前最大 ERR 编号
2. 按五步法分析：
   - **症状**：表面现象
   - **根因**：连问 3 个为什么
   - **修复**：具体修复方式
   - **规律提炼**：抽象通用规则
   - **二次提炼接口**：生成 META-XXX 规则
3. 追加到 ERRORS.md
4. 如果提炼出 META 规则，添加到规则表

---

### /ai-sync — 云同步

**用法**：
- 首次：`/ai-sync <远程仓库URL>`
- 后续：`/ai-sync`（自动推送到已配置的远程仓库）

**示例**：
```
/ai-sync https://github.com/yourname/my-project-ai.git
```

**行为**：
1. 检查 `.ai/` 目录是否存在
2. 提交所有变更
3. 配置远程仓库（首次）或直接推送
4. 报告同步结果

**推荐的远程仓库结构**：
```
yourname/
  project-a-ai/     ← 项目 a 的 .ai/ 同步目标
  project-b-ai/     ← 项目 b 的 .ai/ 同步目标
```

---

### /ai-uninstall — 卸载

**用法**：`/ai-uninstall`

**行为**：
1. 列出 `.ai/` 目录中的所有文件
2. 如果有云同步配置，显示远程 URL（数据不会丢失）
3. **必须确认后才执行删除**
4. 删除 `.ai/` 目录
5. 清理 `.gitignore` 中的相关条目

**注意**：这是破坏性操作，需要明确确认。随时可以用 `/ai-init` 重新创建。

---

## 配置说明

### .gitignore 处理

`/ai-init` 会自动将 `.ai/` 添加到项目根的 `.gitignore`。原因是：

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

团队协作时，建议：

1. 为 `.ai/` 创建共享的远程仓库
2. 所有成员使用同一个 `/ai-sync` 目标
3. 工作前先同步拉取最新状态
4. 工作后及时推送更新

---

## 常见问题

### Q: 安装后命令不可用？

确认加载方式正确：
```bash
claude --plugin-dir /absolute/path/to/ai-coordination
```
路径需要是**绝对路径**。

### Q: /ai-init 提示目录已存在？

如果 `.ai/` 已存在，命令会询问是否覆盖。选择：
- **覆盖**：用新模板替换所有文件（已有数据会丢失）
- **跳过**：保留现有内容

### Q: 云同步推送失败？

常见原因：
1. **远程仓库不存在** — 先在 GitHub/Gitee 上创建仓库
2. **认证失败** — 检查 Git 凭据配置（`git config --global credential.helper`）
3. **网络问题** — 确认可以访问远程仓库

### Q: 如何在多个项目间共享 META 规则？

1. 在项目 A 的 `.ai/ERRORS.md` 中提炼了 META 规则
2. 新建项目 B → `/ai-init`
3. 手动将项目 A 的 META 规则复制到项目 B 的 `.ai/ERRORS.md`
4. 后续版本将支持 META 规则的自动跨项目传播

### Q: 和全局 CLAUDE.md 中的五层架构指令重复吗？

不完全重复：
- 全局 CLAUDE.md 定义了**规范**（应然）
- 本插件提供**工具**（实然）——命令、模板、自动记录

两者配合使用效果最佳：CLAUDE.md 提供原则，插件提供落地方案。

### Q: 如何卸载？

1. 在项目中执行 `/ai-uninstall`（清理 `.ai/` 目录）
2. 移除 `--plugin-dir` 参数，不再加载插件即可

卸载后，你的项目代码完全不受影响。

---

## 目录结构参考

完整的插件目录结构：

```
ai-coordination/
├── .claude-plugin/
│   └── plugin.json              # 插件元数据
├── commands/
│   ├── init.md                  # /ai-init 命令定义
│   ├── status.md                # /ai-status 命令定义
│   ├── error.md                 # /ai-error 命令定义
│   ├── sync.md                  # /ai-sync 命令定义
│   └── uninstall.md             # /ai-uninstall 命令定义
├── skills/
│   └── coordination/
│       ├── SKILL.md             # 五层架构核心技能定义
│       └── assets/
│           ├── WORKSTATE.md     # 工作状态模板
│           ├── CHANGELOG.md     # 操作履历模板
│           ├── STRUCTURE.md     # 代码结构模板
│           ├── REQUIREMENTS.md  # 需求记录模板
│           └── ERRORS.md        # 错误知识库模板
├── .spec-workflow/
│   └── templates/               # 规范文档模板
├── README.md
├── SCI_GUIDE.md                 # 科普指南
└── INSTALL.md                   # 本文件
```

---

## 快速检查清单

安装完成后，确认以下事项：

- [ ] `claude --plugin-dir /path/to/ai-coordination` 可正常启动
- [ ] `/ai-init` 命令可识别
- [ ] 项目中出现了 `.ai/` 目录和 5 个文件
- [ ] `.gitignore` 中包含 `.ai/`
- [ ] （可选）云同步远程仓库已配置

如遇到问题，请检查上述清单或在 GitHub 仓库提交 Issue。
