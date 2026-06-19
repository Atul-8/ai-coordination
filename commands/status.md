---
description: 查看当前工作状态和对接层信息
allowed-tools: Read, Glob, Grep, Bash
---

## Your task

Display the current project coordination state by reading the `.ai/` directory.

### Steps

1. Read `.ai/WORKSTATE.md` — show current tasks, unfinished queue, and last interruption point.

2. Read `.ai/STRUCTURE.md` — show project architecture overview.

3. List `.ai/requirements/` directory — show active requirements count and titles.

4. List `.ai/errors/raw/` directory — show total error count.

5. Read `.ai/errors/distilled/meta-rules.md` — show META rules count.

6. Read `.ai/changelog/LOG.md` — show the most recent 5 entries.

7. **Git sync status** (if `.ai/` has a remote configured):
   ```bash
   cd .ai && git remote -v && git fetch origin && git status
   ```
   - Report whether local is ahead, behind, or diverged from remote
   - If diverged, warn about potential numbering conflicts

8. Summarize the overall project state in a concise format.

If `.ai/` directory does not exist, inform the user and suggest running `/ai:init` to initialize it.
