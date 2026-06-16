---
description: 初始化项目 .ai/ 对接层目录
allowed-tools: Read, Write, Glob, Grep, Bash
---

## Your task

Initialize the project's `.ai/` coordination layer directory with the 5 standard templates.

### Steps

1. Check if `.ai/` directory already exists in the current project root. If it exists with content, ask the user whether to overwrite or skip.

2. Read the 5 template files from the plugin assets:
   - @${CLAUDE_PLUGIN_ROOT}/skills/coordination/assets/WORKSTATE.md
   - @${CLAUDE_PLUGIN_ROOT}/skills/coordination/assets/CHANGELOG.md
   - @${CLAUDE_PLUGIN_ROOT}/skills/coordination/assets/STRUCTURE.md
   - @${CLAUDE_PLUGIN_ROOT}/skills/coordination/assets/REQUIREMENTS.md
   - @${CLAUDE_PLUGIN_ROOT}/skills/coordination/assets/ERRORS.md

3. Create the `.ai/` directory and write each template file there.

4. Analyze the current project structure using Glob and Grep to populate `STRUCTURE.md` with:
   - Actual directory-to-layer mapping
   - Key modules table (name, path, responsibility, dependencies)

5. Initialize `.ai/` as an independent git repository for cloud sync:
   ```bash
   cd .ai && git init && git add -A && git commit -m "init: ai-coordination layer"
   ```

6. Add `.ai/` to the project root `.gitignore` if not already present (the `.ai/` directory manages its own git repo independently).

7. Report completion: list the created files and the detected project structure.
