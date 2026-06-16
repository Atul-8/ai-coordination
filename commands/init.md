---
description: 初始化项目 .ai/ 对接层目录
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

## Your task

Initialize the project's `.ai/` coordination layer directory.

### Steps

1. Check if `.ai/` directory already exists in the current project root. If it exists with content, ask the user whether to overwrite or skip.

2. Create the directory structure:

```
.ai/
  README.md
  WORKSTATE.md
  STRUCTURE.md
  changelog/
    LOG.md
  requirements/
  errors/
    raw/
    distilled/
      meta-rules.md
```

3. Read template files from `~/.claude/skills/coordination/assets/` and write them:
   - `assets/README.md`         → `.ai/README.md`
   - `assets/WORKSTATE.md`      → `.ai/WORKSTATE.md`
   - `assets/STRUCTURE.md`      → `.ai/STRUCTURE.md` (use as base, then enrich)
   - `assets/changelog/LOG.md`  → `.ai/changelog/LOG.md`
   - `assets/errors/distilled/meta-rules.md` → `.ai/errors/distilled/meta-rules.md`

4. Analyze the current project structure using Glob and Grep to populate `STRUCTURE.md` with:
   - Actual directory-to-layer mapping
   - Key modules table (name, path, responsibility, dependencies)

5. Initialize `.ai/` as an independent git repository for cloud sync:
   ```bash
   cd .ai && git init && git add -A && git commit -m "init: ai-coordination layer"
   ```

6. Add `.ai/` to the project root `.gitignore` if not already present (the `.ai/` directory manages its own git repo independently).

7. Report completion: list the created structure and the detected project layout.
