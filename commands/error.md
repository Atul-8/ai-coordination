---
description: 记录错误并按五步法提炼 META 规则
argument-hint: <错误简要描述>
allowed-tools: Read, Write, Edit, Glob, Grep
---

## Your task

Record an error using the 5-step method and extract a META rule if applicable.

The user provides: $ARGUMENTS

### Steps

1. Read `.ai/ERRORS.md` to get the current maximum ERR number.

2. If `.ai/` directory doesn't exist, inform user to run `/ai-init` first.

3. Based on the user's error description `$ARGUMENTS`, perform 5-step analysis:

   **Step 1 — 症状 (Symptom)**: Describe what happened (the observable behavior).

   **Step 2 — 根因 (Root Cause)**: Dig deeper — not the surface cause, but the underlying reason. Ask yourself "why" at least 3 times.

   **Step 3 — 修复 (Fix)**: The specific fix that was applied or should be applied.

   **Step 4 — 规律提炼 (Pattern Extraction)**: Abstract a general rule from this specific error. What pattern does it follow?

   **Step 5 — 二次提炼接口 (Cross-project Interface)**: Formulate a reusable check item or coding standard that could prevent this class of errors in ANY project. Format as a META-xxx rule.

4. Append the new `ERR-NNN` entry to `.ai/ERRORS.md` following the standard format:

```markdown
### ERR-NNN: 错误标题

- **症状**: [description]
- **根因**: [deep analysis]
- **修复**: [specific fix]
- **规律提炼**: [general rule]
- **二次提炼接口**: [cross-project reusable check item]
- **首次出现**: [current date]
- **复现次数**: 1
```

5. If a META rule was extracted, add it to the "二次提炼接口" table at the bottom of ERRORS.md.

6. Confirm the entry was recorded and show the new ERR number and any META rule.
