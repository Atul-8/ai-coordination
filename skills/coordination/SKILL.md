---
name: coordination
description: >
  This skill should be used when the user mentions "初始化项目", "对接层",
  "工作状态", "错误记录", "业务需求", "代码结构", "ai-init", "ai-status",
  "ai-error", "ai-sync", or asks about project coordination state.
  Also activate at conversation start to read .ai/WORKSTATE.md for context recovery.
---

# 五层分治架构 + 业务对接层

## 强制纪律

> 以下规则是**铁律**，不是建议。违反任意一条即为失职。
> 任何时候你觉得"这不重要可以跳过"，**你错了，必须执行。**

### G1 — 会话开门三件事（会话启动时，做任何编码之前）

1. 读取 `.ai/WORKSTATE.md`，报告上次中断点
2. 读取 `.ai/errors/distilled/meta-rules.md`，确认 META 规则已加载
3. 基于以上信息制定本次会话计划

**不做这三件事，不允许开始写任何代码。**

### G2 — 代码变更 ↔ .ai 同步（双门禁）

写代码和写 .ai 是**原子操作**，不可分割：

- **写代码之前**：先在 `.ai/WORKSTATE.md` 登记「正在做什么」
- **写代码之后**：必须立刻执行以下全部，顺序不可省略：
  1. 更新 `WORKSTATE.md`（进度、中断点）
  2. 追加 `changelog/LOG.md`（操作记录）
  3. 检查是否触发以下条件，触发则执行：
     - 新增/删除/重命名了文件 → 更新 `STRUCTURE.md`
     - 新增/变更了业务需求 → 新建 `requirements/REQ-NNN.md`
     - 修复了 bug 或遇到了错误 → 新建 `errors/raw/ERR-NNN.md`，若提炼出 META 规则则追加到 `errors/distilled/meta-rules.md`

**写完代码不更新 .ai，等同于代码没写完。**

### G3 — 错误零容忍

遇到错误的处理流程是**强制**的，不允许"简单记一下"或"跳过五步法"：

1. 新建 `errors/raw/ERR-NNN.md`，五步法**全部填完**（症状、根因、修复、规律提炼、二次提炼接口）
2. 将提炼结果追加到 `errors/distilled/meta-rules.md`
3. 如果某条 ERR 复现次数 >1，**立即**回溯重新分析根因，补充规律提炼

**遇到错误不按五步法记录 = 隐瞒错误 = 下次必犯。**

### G4 — 离场检查（会话结束前）

每次会话结束前，自检以下项目，全部通过才允许结束：

- [ ] WORKSTATE.md 的中断点是否指向当前最新状态？
- [ ] changelog/LOG.md 是否记录了本次所有关键操作？
- [ ] 本次涉及的架构变更是否已更新到 STRUCTURE.md？
- [ ] 本次遇到的错误是否已按五步法记录？
- [ ] 未完成队列是否已更新？

**自检没过就结束会话 = 遗留问题给未来的自己。**

---

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
  README.md                    # 目录说明 + 共享策略
  WORKSTATE.md                 # 当前工作状态 + 未完成任务（最高优先读取）
  STRUCTURE.md                 # 代码结构分类描述（架构地图）
  changelog/
    LOG.md                     # 操作履历（按时间线追加）
  requirements/
    REQ-001.md                 # 每条需求独立文件
    REQ-002.md
    ...
  errors/
    raw/                       # 原始错误记录（五步法完整过程）
      ERR-001.md               # 每条错误独立文件
      ERR-002.md
      ...
    distilled/                 # 提炼成果（可跨项目共享）
      meta-rules.md            # META 规则汇总表
```

### 设计思路

- **不增长的文件**（WORKSTATE、STRUCTURE、README）留在根目录，覆盖更新，体积可控
- **持续增长的目录**（changelog、requirements、errors）拆分为独立文件夹，每条记录独立文件，按需读取
- **errors 分 raw/distilled 两层**：raw 保留完整调试过程（内部资料），distilled 只存提炼后的 META 规则（共享错题本）

## 文件规范

### README.md — 目录说明

描述 .ai/ 目录的结构、各文件/文件夹的用途和共享策略。新成员或新会话可快速理解目录用途。

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

### STRUCTURE.md — 代码结构地图

维护分层映射表 + 关键模块表（模块、路径、职责、依赖），架构变更后同步更新。

### changelog/LOG.md — 操作履历

每次关键操作后实时追加，格式：
`- HH:MM [完成|决策|修复] 描述 (涉及文件: a.py, b.py)`

当 LOG.md 超过 50KB 或 30 天记录时，将旧记录移入 `changelog/ARCHIVE-YYYY-MM.md` 归档。

### requirements/ — 需求记录

每条需求独立文件，按 REQ-NNN 编号：

```markdown
### REQ-NNN: 需求标题

- **状态**: [进行中 | 完成 | 取消]
- **描述**: 需求内容
- **影响范围**: 涉及的模块/文件
- **变更记录**:
  - YYYY-MM-DD: 初始记录
  - YYYY-MM-DD: 变更说明（如有）
```

### errors/raw/ — 原始错误记录

每条错误独立文件，遵循五步法：

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

### errors/distilled/ — META 规则汇总（跨项目共享）

从 raw 中提炼的通用规则汇总表：

```markdown
### META-XXX: 规则标题

- **规则**: 通用规则描述
- **适用场景**: 哪类代码/场景需要遵守
- **源错误**: ERR-NNN（可跨项目引用）
- **检查方式**: 如何在代码审查中验证
```

**跨项目传播**：新项目只需复制 `distilled/meta-rules.md` 即可继承防线。

## 共享策略

| 内容 | 共享建议 | 理由 |
|------|---------|------|
| WORKSTATE.md | 共享 | 多机续接需要 |
| STRUCTURE.md | 共享 | 架构共识 |
| changelog/ | 可选 | 操作历程，参考价值有限 |
| requirements/ | 共享 | 需求追踪需要团队可见 |
| errors/raw/ | **不建议** | 调试细节，可能涉密 |
| errors/distilled/ | **强烈建议** | 提炼后的通用规则，最适合跨项目/跨团队传播 |

## 操作规程

1. **会话开始**：执行 G1 开门三件事
2. **任务执行中**：实时更新 `WORKSTATE.md` 的进度和中断点
3. **任务完成后**：执行 G2 双门禁 — 写代码后必须同步 .ai
4. **架构变更后**：同步更新 `STRUCTURE.md`
5. **需求变更时**：新建 `requirements/REQ-NNN.md` 并标注影响范围
6. **异常中断恢复**：根据 `WORKSTATE.md` 的"上次中断点"直接续接
7. **错误发生时**：执行 G3 — 五步法零容忍
8. **新项目启动**：读取已有项目的 `errors/distilled/meta-rules.md` 作为预置防线
9. **会话结束前**：执行 G4 离场检查

## 思维检查清单（每次开发前）

- [ ] 这个文件/函数属于哪一层？
- [ ] 依赖方向是否合规？
- [ ] 是否有跨层硬编码或隐式耦合？
- [ ] 新增功能是否按层次拆分到对应位置？
- [ ] 核心逻辑是否可独立于 UI 测试？
- [ ] 关键操作是否已记录到 coordination 层？
- [ ] 中断点是否已更新到 WORKSTATE.md？
