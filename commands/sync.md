---
description: 同步 .ai/ 目录到云端 Git 仓库
argument-hint: [remote-git-url]
allowed-tools: Read, Bash
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

3. Stage and commit all current changes:
   ```bash
   cd .ai && git add -A && git commit -m "sync: $(date +%Y-%m-%d_%H%M%S)"
   ```
   If there are no changes to commit, report "Already up to date".

4. If `$ARGUMENTS` (remote-git-url) is provided:
   - Check if remote "origin" already exists:
     ```bash
     cd .ai && git remote -v
     ```
   - If no origin, add it:
     ```bash
     cd .ai && git remote add origin $ARGUMENTS
     ```
   - If origin exists with a different URL, ask user before changing it.
   - Push to remote:
     ```bash
     cd .ai && git push -u origin main || git push -u origin master
     ```

5. If `$ARGUMENTS` is not provided but remote "origin" already exists:
   - Just push: `cd .ai && git push`

6. Report sync result: what was committed, and the remote URL if configured.

### Selective sync note

If the team only wants to share `errors/distilled/` (the refined META rules) rather than raw debug details, they can use `.gitignore` inside `.ai/` to exclude specific directories:
- Add `errors/raw/` to `.ai/.gitignore` to keep debug details local
- Add `changelog/` to `.ai/.gitignore` if operation history should not be shared
- Always share `errors/distilled/` — it's the team's shared knowledge base
