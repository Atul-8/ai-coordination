---
name: coordination
description: >
  This skill should be used when the user mentions "初始化项目", "对接层",
  "工作状态", "错误记录", "业务需求", "代码结构", "ai-init", "ai-status",
  "ai-error", "ai-sync", or asks about project coordination state.
  Also activate at conversation start to read .ai/WORKSTATE.md for context recovery.
---

# 五层分治架构 + 业务对接层

## 架构模式

```
coordination → presentation → interface → core → shared
    (对接层)       (展现层)     (接口层)    (核心层)  (共享层)
```

| 层级 | 职责 | 典型内容 |
|------|------|---------|
| **coordination** | 开发状态持久化、上下文容灾、业务需求对接 | 工作状态、操作日志、代码结构描述、需求变更、错误知识库 |
| **presentation** | 用户交互、视图渲染、输入输出 | UI 组件、页面、交互逻辑、状态展示 |
| **interface** | 对外接口封装、协议适配、类型契约 | API 调用、协议转换、接口类型定义、配置 |
| **core** | 业务逻辑、算法实现、数据处理 | 领域模型、核心算法、处理流程、状态机 |
| **shared** | 跨层通用基础能力 | 常量、工具函数、通用类型、配置项 |

## 严格单向依赖规则

```
coordination → presentation → interface → core → shared
      ↓              ↓             ↓          ↓
      └──────────────┴─────────────┴──────────┘
              coordination 可读取所有层的结构信息
```

- **coordination** 可读取所有层信息用于状态记录，**禁止**被任何代码层运行时依赖
- **presentation** 可依赖 interface、shared，**禁止**直接依赖 core
- **interface** 可依赖 core、shared
- **core** 仅依赖 shared，**禁止**依赖 interface 或 presentation
- **shared** 不依赖任何其他层级

> coordination 层是 AI Agent 的持久化元数据层，不是运行时代码依赖。

## coordination 层目录结构

项目根目录下创建 `.ai/` 目录：

```
<project_root>/.ai/
  WORKSTATE.md      # 当前工作状态 + 未完成任务（最高优先读取）
  CHANGELOG.md      # 操作履历（按时间线记录）
  STRUCTURE.md      # 代码结构分类描述（架构地图）
  REQUIREMENTS.md   # 业务需求记录 + 变更影响追踪
  ERRORS.md         # 错误知识库（五步法 + META 规则）
```

## 文件规范

### WORKSTATE.md — 工作状态（每次新会话必先读取）

```markdown
# 当前工作状态

## 正在进行
- [任务描述] 进度: xx% | 上次更新: YYYY-MM-DD HH:MM

## 未完成队列
- [ ] 任务1 — 简要描述 + 当前进度

## 上次中断点
- 文件: xxx.py:行号
- 操作: 正在执行 xxx
- 待恢复: 下一步要做 xxx
```

### CHANGELOG.md — 操作履历

每次关键操作后实时追加，格式：
`- HH:MM [完成|决策|修复] 描述 (涉及文件: a.py, b.py)`

### STRUCTURE.md — 代码结构地图

维护分层映射表 + 关键模块表（模块、路径、职责、依赖），架构变更后同步更新。

### REQUIREMENTS.md — 需求记录

按 REQ-NNN 编号记录需求，追踪状态和影响范围。

### ERRORS.md — 错误知识库

每条错误遵循「错误 → 根因 → 修复 → 规律提炼 → 二次提炼接口」五步法：

```markdown
### ERR-NNN: 错误标题

- **症状**: 现象描述
- **根因**: 深层原因分析（非表面原因）
- **修复**: 具体修复方式
- **规律提炼**: 从此错误抽象出的通用规则
- **二次提炼接口**: 可跨项目复用的检查项/编码规范
- **首次出现**: YYYY-MM-DD
- **复现次数**: N（若 >1 说明规律提炼不够透彻）
```

**自我升级机制**：若同一 ERR 复现次数 >1，说明规律提炼不够透彻，需回溯补充。
**跨项目传播**：`META-xxx` 规则条目可被其他项目直接引用为代码审查检查项。

## 操作规程

1. **会话开始**：优先读取 `WORKSTATE.md`，恢复上次中断点
2. **任务执行中**：实时更新 `WORKSTATE.md` 的进度和中断点
3. **任务完成后**：更新 `WORKSTATE.md`（标记完成）+ 追加 `CHANGELOG.md`
4. **架构变更后**：同步更新 `STRUCTURE.md`
5. **需求变更时**：记录到 `REQUIREMENTS.md` 并标注影响范围
6. **异常中断恢复**：根据 `WORKSTATE.md` 的"上次中断点"直接续接
7. **错误发生时**：按五步法记录到 `ERRORS.md`，提炼 META 规则
8. **新项目启动**：读取已有项目的 `ERRORS.md` 中的 META 规则作为预置防线

## 思维检查清单（每次开发前）

- [ ] 这个文件/函数属于哪一层？
- [ ] 依赖方向是否合规？
- [ ] 是否有跨层硬编码或隐式耦合？
- [ ] 新增功能是否按层次拆分到对应位置？
- [ ] 核心逻辑是否可独立于 UI 测试？
- [ ] 关键操作是否已记录到 coordination 层？
- [ ] 中断点是否已更新到 WORKSTATE.md？
