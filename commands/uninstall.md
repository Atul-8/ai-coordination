---
description: 清理项目的 .ai/ 对接层目录
allowed-tools: Read, Bash
---

## Your task

Remove the `.ai/` coordination layer directory from the current project.

### Steps

1. Check if `.ai/` directory exists. If not, inform the user and exit.

2. Show the user what will be deleted:
   - List the full directory tree under `.ai/`
   - Show key stats: number of requirements, errors, META rules
   - Remind that if cloud sync was configured, the remote repository data is preserved

3. **IMPORTANT**: Ask the user to confirm before proceeding. This is a destructive operation.

4. If `.ai/` has a git remote configured, show the remote URL so the user knows their cloud data is safe. Also remind them that `errors/distilled/meta-rules.md` can be kept separately if they want to preserve META rules.

5. After confirmation, remove the `.ai/` directory:
   ```bash
   rm -rf .ai/
   ```

6. Remove `.ai/` entry from project root `.gitignore` if present (it was added by `/ai:init`).

7. Report completion. Inform user that they can re-run `/ai:init` to recreate the coordination layer at any time.
