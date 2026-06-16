---
description: 查看当前工作状态和对接层信息
allowed-tools: Read, Glob, Grep
---

## Your task

Display the current project coordination state by reading the `.ai/` directory files.

### Steps

1. Read `.ai/WORKSTATE.md` — show current tasks, unfinished queue, and last interruption point.

2. Read `.ai/REQUIREMENTS.md` — show active requirements.

3. Read `.ai/ERRORS.md` — show error count and any META rules.

4. Read `.ai/CHANGELOG.md` — show the most recent 5 entries.

5. Summarize the overall project state in a concise format.

If `.ai/` directory does not exist, inform the user and suggest running `/ai-init` to initialize it.
