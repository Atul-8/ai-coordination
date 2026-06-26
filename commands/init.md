---
description: 初始化项目 .ai/ 对接层目录
allowed-tools: Bash
argument-hint: [remote-git-url]
---

## Your task

Initialize the project's `.ai/` coordination layer directory by calling the script.

The user provides: $ARGUMENTS (optional remote Git URL)

### Steps

1. Call the initialization script:
   ```bash
   node "F:/AI/ai-coordination/scripts/ai-init.js" "$PROJECT_ROOT" "$ARGUMENTS"
   ```

2. Parse the JSON output and report the result to the user:
   - If `success: true`, list the created files and directories
   - If `success: false`, show the errors and suggest solutions

3. If the script reports that `.ai/` already exists with content, ask the user whether to:
   - Overwrite (delete and reinitialize)
   - Skip (keep existing content)

4. After successful initialization, suggest the user:
   - Run `/ai:status` to view the current state
   - Add a task to WORKSTATE.md before starting development