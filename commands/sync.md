---
description: 同步 .ai/ 目录到云端 Git 仓库
argument-hint: [remote-git-url]
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---

## Your task

Sync the `.ai/` coordination directory to a remote Git repository for cloud backup and cross-machine access.

The user provides: $ARGUMENTS

### Steps

1. Check if `.ai/` directory exists. If not, suggest running `/ai:init` first.

2. Navigate to `.ai/` directory and check if it's a git repository:
   ```bash
   cd .ai && git status
   ```
   If not a git repo, initialize it:
   ```bash
   cd .ai && git init && git add -A && git commit -m "init: ai-coordination layer"
   ```

3. **冲突检测与编号顺延**（关键步骤，在 commit 之前执行）：

   If remote "origin" exists or `$ARGUMENTS` provides a URL:
   - Fetch remote first: `cd .ai && git fetch origin`
   - Check for ERR/META numbering conflicts:
     ```bash
     cd .ai && git diff HEAD origin/main -- errors/raw/ errors/distilled/
     ```
   - If any file with same number exists in both local and remote (e.g., local `ERR-007.md` and remote `ERR-007.md`):
     - Find the next available number beyond the remote's maximum
     - Rename local files: `ERR-007.md` → `ERR-008.md` (or next available)
     - Rename local files: update `META-007` → `META-008` if applicable
     - Update all cross-references inside the renamed files (e.g., `源错误: ERR-007` → `源错误: ERR-008` in meta-rules.md)
     - Update `meta-rules.md` to reflect new numbering
   - Only after conflict resolution: stage the corrected files

4. Stage and commit all current changes:
   ```bash
   cd .ai && git add -A && git commit -m "sync: $(date +%Y-%m-%d_%H%M%S)"
   ```
   If there are no changes to commit, report "Already up to date".

5. If `$ARGUMENTS` (remote-git-url) is provided:
   - Check if remote "origin" already exists:
     ```bash
     cd .ai && git remote -v
     ```
   - If no origin, add it:
     ```bash
     cd .ai && git remote add origin $ARGUMENTS
     ```
   - If origin exists with a different URL, ask user before changing it.
   - Pull and merge remote changes first (to ensure no conflicts remain):
     ```bash
     cd .ai && git pull origin main --rebase || git pull origin master --rebase
     ```
   - If rebase reveals new conflicts after our rename, resolve by continuing to shift numbers forward.
   - Push to remote:
     ```bash
     cd .ai && git push -u origin main || git push -u origin master
     ```

6. If `$ARGUMENTS` is not provided but remote "origin" already exists:
   - Pull first: `cd .ai && git pull --rebase`
   - Then push: `cd .ai && git push`

7. **Verification**: After push, fetch and compare to confirm local and remote are identical:
   ```bash
   cd .ai && git fetch origin && git diff HEAD origin/main
   ```
   Report "Sync verified: local and remote are consistent" or list remaining differences.

8. Report sync result: what was committed, what conflicts were resolved (if any), and the remote URL if configured.

### Selective sync note

If the team only wants to share `errors/distilled/` (the refined META rules) rather than raw debug details, they can use `.gitignore` inside `.ai/` to exclude specific directories:
- Add `errors/raw/` to `.ai/.gitignore` to keep debug details local
- Add `changelog/` to `.ai/.gitignore` if operation history should not be shared
- Always share `errors/distilled/` — it's the team's shared knowledge base
