# 项目驻场专家组（ROSTER）

> 由 `agent-roster.js` 依据项目结构自动提议，PM 可手动调整。
> **常驻（resident）** = 文件在 `.claude/agents/`，Claude Code 自动可发现可调度。
> **按需（on-demand）** = 文件在 `.ai/agents/stash/`，PM 调度前先 `agent-registry.js activate <name>` 上线。

## 常驻（resident）

<!-- 由 agent-roster.js 按项目特征填写，例：
- embedded-firmware-engineer   # 检测到 .inf / WDF / VHF / 寄存器
- pc-host-engineer             # 检测到 Qt / QML / .pro / QSerialPort
-->

（待 agent-roster.js 扫描后回填）

## 按需上线（on-demand）

- tester              # 组件完成时
- security-engineer   # 涉及鉴权 / 输入 / 外部数据时
- code-reviewer       # PR 审查 / 质量把关时
- software-architect  # 架构决策时

## 来源决策

- 本地全局仓库（`~/.ai-coordination/agents/`）有 → 用本地
- 无 → 从 agency-agents-zh 拉取（`/ai:fetch`）后缓存到全局仓库
