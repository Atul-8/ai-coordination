---
description: 从 agency-agents-zh 按需拉取单个专家 agent，框架封装后登记
argument-hint: <agent-key>
allowed-tools: Bash
---

## Your task

从 agency-agents-zh 仓库（266 个即插即用专家）按需拉取一个 agent，做框架封装（slug 化 name、注入框架意识前导、加 `memory: project`），登记到 registry。

The user provides: $ARGUMENTS（agent-key）

### agent-key 格式

- 完整：`agency-agents-zh:engineering/engineering-code-reviewer.md`
- 简写：`code-reviewer`（默认 engineering 部门，自动补全）
- 带部门：`testing/api-tester`

### Steps

1. 调用拉取脚本（默认入 stash 并登记 registry）：

   ```bash
   node "E:/AI/ai-coordination/src/scripts/agent-fetch.js" "$PWD" "$ARGUMENTS" --to stash
   ```

2. 解析 JSON 输出，向用户报告：
   - `display_name` / `slug`（拉取的专家）
   - `written_to`（stash 或全局仓库）
   - 若 `registered: true`：提示 PM 调度前需 `agent-registry.js activate <slug>` 上线

3. 失败时（HTTP 404 / 超时）：
   - 建议用户检查 agent-key 拼写与部门路径
   - 指向 https://github.com/jnMetaCode/agency-agents-zh 浏览确认

4. 拉取成功后，可选：提醒用户该 agent 是按需（on-demand）生命周期，PM 会在相关任务时 activate 上线。
