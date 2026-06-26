---
description: 查看当前工作状态和对接层信息
allowed-tools: Bash
---

## Your task

Display the current project coordination state by calling the status script.

### Steps

1. Call the status script:
   ```bash
   node "F:/AI/ai-coordination/scripts/ai-status.js" "$PROJECT_ROOT"
   ```

2. Parse the JSON output and present a concise summary to the user:

   If `hasAiDir: false`:
   - Inform the user that the project is not using ai-coordination
   - Suggest running `/ai:init` to initialize

   If `hasAiDir: true`, show:
   - **工作状态**: workstate.inProgress (or "无进行中任务")
   - **上次中断点**: workstate.interruption (first line only)
   - **需求数量**: requirements.count
   - **错误记录**: errors.count
   - **META 规则**: metaRules.count
   - **最近操作**: changelog.recent (last 3 entries)
   - **Git 同步**: gitSync.syncStatus (synced/ahead/behind/diverged)

3. If `gitSync.syncStatus` is not "synced", warn the user:
   - "ahead" → suggest running `/ai:sync` to push
   - "behind" → suggest running `/ai:sync` to pull
   - "diverged" → warn about potential numbering conflicts