# ai-coordination

业务对接层 Claude Code 插件 — 上下文容灾、状态持久化、错误自我提炼。

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 它解决什么问题？

| 痛点 | 解决方式 |
|------|---------|
| AI 会话结束，上下文丢失 | WORKSTATE.md 自动记录断点，新会话秒恢复 |
| 同样的错误在不同项目中重复出现 | 五步法提炼 META 规则，跨项目自动继承 |
| 开发过程不可追溯 | 操作履历、需求追踪、结构地图全程记录 |
| 多设备开发状态不同步 | 独立 Git 仓库云同步，多机无缝续接 |

## 安装

> 前提：已安装 Claude Code CLI 和 Git

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

> **为什么必须写入 CLAUDE.md？** commands 和 skills 提供工具和触发条件，但 Claude 只有读取 CLAUDE.md 中的规范才会**强制执行**五层架构。纯靠 skills 触发，Claude 会"知道"但不"遵守"。

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

## 使用命令

| 命令 | 说明 |
|------|------|
| `/ai:init` | 初始化项目 `.ai/` 对接层目录 |
| `/ai:status` | 查看当前工作状态和对接层信息 |
| `/ai:error <描述>` | 记录错误并按五步法提炼 META 规则 |
| `/ai:sync [remote-url]` | 同步 `.ai/` 目录到云端 Git 仓库 |
| `/ai:uninstall` | 清理项目的 `.ai/` 对接层目录 |

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

## 五层架构

```
coordination → presentation → interface → core → shared
    (对接层)       (展现层)     (接口层)    (核心层)  (共享层)
```

| 层级 | 职责 |
|------|------|
| **coordination** | 开发状态持久化、上下文容灾、错误知识库 |
| **presentation** | 用户交互、视图渲染 |
| **interface** | 对外接口封装、协议适配 |
| **core** | 业务逻辑、核心算法 |
| **shared** | 跨层通用基础能力 |

## 仓库结构

```
ai-coordination/
├── commands/                    # 命令定义
│   ├── init.md
│   ├── status.md
│   ├── error.md
│   ├── sync.md
│   └── uninstall.md
├── skills/coordination/         # 技能定义 + 模板
│   ├── SKILL.md                 # 架构规范（需写入 CLAUDE.md）
│   └── assets/                  # 初始化模板
│       ├── README.md
│       ├── WORKSTATE.md
│       ├── STRUCTURE.md
│       ├── changelog/LOG.md
│       ├── requirements/REQ-000.md
│       └── errors/
│           ├── raw/ERR-000.md
│           └── distilled/meta-rules.md
├── SCI_GUIDE.md                 # 架构思想与原理详解
└── INSTALL.md                   # 详细部署文档
```

## 文档

- [科普指南](SCI_GUIDE.md) — 架构思想和原理详解
- [详细部署](INSTALL.md) — 完整安装和配置说明

## License

MIT
