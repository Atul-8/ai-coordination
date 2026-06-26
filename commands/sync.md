---
description: 同步 .ai/ 目录到云端 Git 仓库
allowed-tools: Bash
argument-hint: [remote-git-url]
---

## Your task

Sync the `.ai/` coordination directory to a remote Git repository by calling the sync script.

The user provides: $ARGUMENTS (optional remote Git URL)

### Steps

1. Call the sync script:
   ```bash
   node "F:/AI/ai-coordination/scripts/ai-sync.js" "$PROJECT_ROOT" "$ARGUMENTS"
   ```

2. Parse the JSON output and report the result:

   If `success: false`:
   - Show the errors
   - If `.ai/` doesn't exist, suggest running `/ai:init` first

   If `success: true`:
   - Show what was committed (`commitMessage`)
   - Show any conflicts resolved (`conflictsResolved`)
   - Show the sync status (`verified`, `pushed`, `branch`)

3. If `conflictsResolved` has entries:
   - List each conflict: "ERR-007 → ERR-008" or "META-007 → META-008"
   - Explain that local numbering was shifted to avoid conflicts with remote

4. If `verified: false`:
   - Warn the user that local and remote are not identical
   - Suggest manual inspection

5. After successful sync, remind the user:
   - The `.ai/` directory is now backed up to the cloud
   - Other machines can clone and continue work seamlessly