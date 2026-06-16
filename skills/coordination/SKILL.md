---
name: coordination
description: >
  CRITICAL ACTIVATION RULE: This skill is ACTIVE whenever the project contains
  a `.ai/` directory — that means the user has CHOSEN to use ai-coordination,
  and ALL discipline rules (G1-G4) are MANDATORY, not optional.

  Auto-activate when:
  - The project root contains `.ai/` directory (user has opted in)
  - New conversation session starts in a project with `.ai/`
  - User mentions: "初始化项目", "对接层", "工作状态", "错误记录",
    "业务需求", "代码结构", "ai-init", "ai-status", "ai-error", "ai-sync"

  Do NOT activate when:
  - No `.ai/` directory exists (user has not opted in)
  - User is chatting, researching, or doing non-development tasks
---

# 六层分治架构 + 业务对接层

## 强制纪律

> **适用前提**：以下规则仅在项目包含 `.ai/` 目录时生效。`.ai/` 的存在 = 用户已选择启用 ai-coordination = 必须执行。
> 没有 `.ai/` 的项目不受任何约束。
>
> 以下规则是**铁律**，不是建议。违反任意一条即为失职。
> 任何时候你觉得"这不重要可以跳过"，**你错了，必须执行。**

### G1 — 会话开门三件事（项目含 .ai/ 时，做任何编码之前）

1. **判断当前会话类型**：是否为软件项目开发？
   - **是开发会话**（写代码、修 bug、重构、需求分析等）：继续执行 G1
   - **不是开发会话**（闲聊、搜索资料、写文章、数据分析等）：G1-G4 全部不适用，正常工作即可
2. 检查项目根目录是否存在 `.ai/` 目录。**不存在则 G1-G4 全部不适用，正常工作即可。**
3. 若 `.ai/` 存在：读取 `.ai/WORKSTATE.md`，报告上次中断点
4. 读取 `.ai/errors/distilled/meta-rules.md`，确认 META 规则已加载
5. 基于以上信息制定本次会话计划

**项目有 .ai/ 且是开发会话，却不做这三件事，不允许开始写任何代码。**

### G2 — 代码变更 ↔ .ai 同步（双门禁）

**前提**：项目包含 `.ai/` 目录。没有则忽略。

写代码和写 .ai 是**原子操作**，不可分割：

- **写代码之前**：先在 `.ai/WORKSTATE.md` 登记「正在做什么」
- **写代码之后**：必须立刻执行以下全部，顺序不可省略：
  1. 更新 `WORKSTATE.md`（进度、中断点）
  2. 追加 `changelog/LOG.md`（操作记录）
  3. 检查是否触发以下条件，触发则执行：
     - 新增/删除/重命名了文件 → 更新 `STRUCTURE.md`
     - 新增/变更了业务需求 → 新建 `requirements/REQ-NNN.md`
     - 修复了 bug 或遇到了错误 → **自动触发 G3**

**写完代码不更新 .ai，等同于代码没写完。**

### G3 — 错误自动捕获与五步法提炼

**前提**：项目包含 `.ai/` 目录。没有则忽略。

**核心理念**：错误记录对用户无感。用户不需要执行任何命令，Claude 遇到错误时**必须自动**完成五步法提炼。

**自动触发时机**（任何一条成立即触发，无需用户操作）：
- 代码运行出错（TypeError、ReferenceError、Exception 等）
- 编译/构建失败
- 测试不通过
- 用户报告了 bug 或异常行为
- 修复了一个已知问题
- 代码审查中发现潜在错误

**触发后自动执行**（不允许跳过任何步骤）：

1. **静默执行五步法分析**（不中断开发流程，在后台完成）：
   - 症状：记录表面现象
   - 根因：连问 3 个为什么，找到深层原因
   - 修复：记录修复方式
   - 规律提炼：抽象通用规则
   - 二次提炼接口：生成 META 规则

2. **自动写入文件**：
   - 新建 `errors/raw/ERR-NNN.md`（五步法完整记录）
   - 若提炼出 META 规则 → 追加到 `errors/distilled/meta-rules.md`

3. **复现追踪**：若某条 ERR 复现次数 >1，**立即**回溯重新分析根因，补充规律提炼

**不要告知用户"请运行 /ai:error"**。五步法是 Claude 的内部纪律，不是用户操作。用户只管开发，错误提炼全自动。

### G4 — 离场检查（会话结束前）

**前提**：项目包含 `.ai/` 目录。没有则忽略。

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
```

| 层级               | 职责                   | 典型内容                        |
| ---------------- | -------------------- | --------------------------- |
| **coordination** | 开发状态持久化、上下文容灾、业务需求对接 | 工作状态、操作日志、代码结构描述、需求变更、错误知识库 |
| **presentation** | 用户交互、视图渲染、输入输出       | UI 组件、页面、交互逻辑、状态展示          |
| **interface**    | 对外接口封装、协议适配、类型契约     | API 调用、协议转换、接口类型定义、配置、**安全认证（鉴权/加密/限流）、外部服务对接、数据脱敏接口** |
| **core**         | 业务逻辑、算法实现、数据处理       | 领域模型、核心算法、处理流程、状态机          |
| **shared**       | 跨层通用基础能力，被所有层依赖，不依赖任何人       | 常量、工具函数、通用类型、配置项、**环境变量管理、日志规范、异常体系、审计日志、性能埋点** |
| **testing**      | 各层接口验证、集成回归守护，不被任何层依赖       | presentation 快照测试、interface 契约测试、core 单元测试、shared 工具测试、集成测试、E2E 测试 |

## 严格单向依赖规则

```
                  coordination（对接层）
                       ↓ 可读取所有层
    ┌─────────────────┼─────────────────┐
    ↓                 ↓                 ↓
presentation      interface          core
    ↓                 ↓                 ↓
    └─────────────────┼─────────────────┘
                      ↓ 均可依赖
                  shared（共享层）
              不依赖任何其他层，被所有层依赖
                      ↑ 被所有层依赖
                  testing（测试层）
              依赖所有被测层，不被任何层依赖
```

- **coordination** 可读取所有层信息用于状态记录，**禁止**被任何代码层运行时依赖
- **presentation** 可依赖 interface、shared，**禁止**直接依赖 core
- **interface** 可依赖 core、shared
- **core** 仅依赖 shared，**禁止**依赖 interface 或 presentation
- **shared** 不依赖任何其他层级
- **testing** 可依赖所有被测层（presentation/interface/core/shared），**禁止**被任何业务层依赖

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

| 内容                | 共享建议     | 理由                    |
| ----------------- | -------- | --------------------- |
| WORKSTATE.md      | 共享       | 多机续接需要                |
| STRUCTURE.md      | 共享       | 架构共识                  |
| changelog/        | 可选       | 操作历程，参考价值有限           |
| requirements/     | 共享       | 需求追踪需要团队可见            |
| errors/raw/       | **不建议**  | 调试细节，可能涉密             |
| errors/distilled/ | **强烈建议** | 提炼后的通用规则，最适合跨项目/跨团队传播 |

## 操作规程

> 以下规程仅在项目包含 `.ai/` 目录时生效。用户执行 `/ai:init` 即表示选择启用，G1-G4 自动强制执行。
> **所有操作对用户无感**——用户只管开发，Claude 在后台自动完成 .ai 同步、错误提炼、日志记录。

1. **会话开始**：检查 `.ai/` 是否存在，存在则执行 G1 开门三件事
2. **任务执行中**：实时更新 `WORKSTATE.md` 的进度和中断点
3. **任务完成后**：自动执行 G2 双门禁 — 写代码后静默同步 .ai
4. **架构变更后**：自动更新 `STRUCTURE.md`
5. **需求变更时**：自动新建 `requirements/REQ-NNN.md` 并标注影响范围
6. **异常中断恢复**：根据 `WORKSTATE.md` 的"上次中断点"直接续接
7. **错误发生时**：自动执行 G3 — 静默完成五步法提炼，用户无感
8. **新项目启动**：读取已有项目的 `errors/distilled/meta-rules.md` 作为预置防线
9. **代码变更后**：运行对应层的测试，确保不引入回归
10. **会话结束前**：自动执行 G4 离场检查

## 思维检查清单（每次开发前）

> 仅在项目包含 `.ai/` 目录时需要检查。

- [ ] 项目是否有 `.ai/` 目录？没有则本清单不适用
- [ ] 这个文件/函数属于哪一层？
- [ ] 依赖方向是否合规？
- [ ] 是否有跨层硬编码或隐式耦合？
- [ ] 新增功能是否按层次拆分到对应位置？
- [ ] 核心逻辑是否可独立于 UI 测试？
- [ ] 测试是否按层分类（presentation/interface/core/shared）且不遗漏？
- [ ] 关键操作是否已记录到 coordination 层？
- [ ] 中断点是否已更新到 WORKSTATE.md？
