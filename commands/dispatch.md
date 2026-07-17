---
description: 触发 PM 调度分析（任务 → 专家调度链 + 相关 META 规则）
argument-hint: <任务描述>
allowed-tools: Bash
---

## Your task

分析用户任务，给出 PM 调度建议：调用哪些专家、什么顺序、应挂载哪些 META 规则。

The user provides: $ARGUMENTS（任务描述）

### Steps

1. 先确保 META 索引最新：

   ```bash
   node "$(dirname "$0")/../src/scripts/meta-index.js" "$PROJECT_ROOT" >/dev/null
   ```

2. 调用调度分析：

   ```bash
   node "$(dirname "$0")/../src/scripts/pm-dispatch.js" "$PROJECT_ROOT" "$ARGUMENTS"
   ```

3. 解析 JSON 输出，向用户报告：
   - **推断的问题类别**（`inferred_categories`）
   - **建议的专家调度链**（`suggested_chain`）：哪些专家、是否在 registry、是否需 `activate`
   - **相关 META 规则**（`meta_rules`）：应作为约束挂载给专家的规则
   - **编排模式**（`orchestration`）：顺序委派流程

4. 按 `suggested_chain` 调度：
   - 驻场专家（已在 `.claude/agents/`）直接用 Agent 工具调用
   - 按需专家先 `agent-registry.js activate <name>` 上线再调用
   - 专家不在 registry → 建议用户 `/ai:fetch <agent-key>` 拉取
