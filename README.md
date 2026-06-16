# ai-coordination

业务对接层 Claude Code 插件 — 上下文容灾、状态持久化、错误自我提炼。

## 功能

- **上下文容灾**：会话中断后通过 WORKSTATE.md 快速恢复开发上下文
- **状态持久化**：实时记录工作进度、操作履历、代码结构、需求变更
- **错误自我提炼**：五步法记录错误，自动抽象通用规则，跨项目防重复
- **跨项目 META 规则**：错误知识库的二次提炼接口，新项目自动继承防线

## 安装

### 本地测试

```bash
claude --plugin-dir /path/to/ai-coordination
```

### 从 Git 仓库安装

配置 `settings.json` 或通过 marketplace 注册后使用 `claude plugin install`。

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

## License

MIT
