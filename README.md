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

## 功能

- **上下文容灾**：会话中断后通过 WORKSTATE.md 快速恢复开发上下文
- **状态持久化**：实时记录工作进度、操作履历、代码结构、需求变更
- **错误自我提炼**：五步法记录错误，自动抽象通用规则，跨项目防重复
- **跨项目 META 规则**：错误知识库的二次提炼接口，新项目自动继承防线

## 快速开始

### 安装

```bash
# Fork 本仓库到你的账号，然后克隆
git clone https://github.com/<your-username>/ai-coordination.git

# 或直接克隆
git clone https://github.com/Atul-8/ai-coordination.git

# 在你的项目中加载插件
claude --plugin-dir /path/to/ai-coordination
```

### 首次使用

```
/ai-init                          # 初始化项目 .ai/ 对接层目录
/ai-status                        # 查看当前工作状态
/ai-error 异步函数未做错误处理     # 记录错误并提炼 META 规则
/ai-sync https://github.com/...   # 同步到云端 Git 仓库
```

## 命令

| 命令 | 说明 |
|------|------|
| `/ai-init` | 初始化项目 `.ai/` 对接层目录 |
| `/ai-status` | 查看当前工作状态和对接层信息 |
| `/ai-error <描述>` | 记录错误并按五步法提炼 META 规则 |
| `/ai-sync [remote-url]` | 同步 `.ai/` 目录到云端 Git 仓库 |
| `/ai-uninstall` | 清理项目的 `.ai/` 对接层目录 |

## .ai/ 目录结构

```
.ai/
  WORKSTATE.md      # 当前工作状态 + 未完成任务
  CHANGELOG.md      # 操作履历
  STRUCTURE.md      # 代码结构分类描述
  REQUIREMENTS.md   # 业务需求记录
  ERRORS.md         # 错误知识库 + META 规则
```

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

## 文档

- [科普指南](SCI_GUIDE.md) — 架构思想和原理详解
- [安装部署](INSTALL.md) — 详细的安装和使用说明

## License

MIT
