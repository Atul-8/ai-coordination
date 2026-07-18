---
description: 查看 / 管理 agent registry（常驻池、按需池、来源）
allowed-tools: Bash
---

## Your task

列出或管理项目的 agent 注册表（调度编排层）。

The user provides: $ARGUMENTS（可选：`list` | `activate <name>` | `deactivate <name>` | `sync` | `roster`）

### Steps

1. **无参数或 `list`** —— 列出 registry：

   ```bash
   node "E:/AI/ai-coordination/src/scripts/agent-registry.js" "$PWD" list
   ```

2. **`activate <name>` / `deactivate <name>`** —— 上线 / 下线按需专家：

   ```bash
   node "E:/AI/ai-coordination/src/scripts/agent-registry.js" "$PWD" activate $NAME
   ```

3. **`sync`** —— 同步 registry 与 `.claude/agents/` 实际文件：

   ```bash
   node "E:/AI/ai-coordination/src/scripts/agent-registry.js" "$PWD" sync
   ```

4. **`roster`** —— 基于项目结构重新生成驻场名单：

   ```bash
   node "E:/AI/ai-coordination/src/scripts/agent-roster.js" "$PWD" --write
   ```

5. 解析 JSON 输出，向用户报告 agent 列表（`name` / `lifecycle` / `active` / `source`）。

### 说明

- **常驻（resident）**：文件在 `.claude/agents/`，Claude Code 自动可发现可调度。
- **按需（on-demand）**：文件在 `.ai/agents/stash/`，PM 调度前需 `activate` 上线（几秒热重载）。
- 全新 `.claude/agents/` 目录需重启会话才被扫描。
