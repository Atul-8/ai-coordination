---
description: 记录错误并按五步法提炼 META 规则
argument-hint: <错误简要描述>
allowed-tools: Read, Write, Edit, Glob, Grep
---

## Your task

Record an error using the 5-step method and extract a META rule if applicable.

The user provides: $ARGUMENTS

### Steps

1. If `.ai/` directory doesn't exist, inform user to run `/ai:init` first.

2. List `.ai/errors/raw/` to find the current maximum ERR number. Files are named `ERR-001.md`, `ERR-002.md`, etc.

3. Based on the user's error description `$ARGUMENTS`, perform 5-step analysis:

   **Step 1 — 症状 (Symptom)**: Describe what happened (the observable behavior).

   **Step 2 — 根因 (Root Cause)**: Dig deeper — not the surface cause, but the underlying reason. Ask yourself "why" at least 3 times.

   **Step 3 — 修复 (Fix)**: The specific fix that was applied or should be applied.

   **Step 4 — 规律提炼 (Pattern Extraction)**: Abstract a general rule from this specific error. What pattern does it follow?

   **Step 5 — 二次提炼接口 (Cross-project Interface)**: Formulate a reusable check item or coding standard that could prevent this class of errors in ANY project. Format as a META-xxx rule.

4. Create a new file `.ai/errors/raw/ERR-NNN.md` using the template:

```markdown
# ERR-NNN: 错误标题

- **症状**: [description]
- **根因**: [deep analysis]
- **修复**: [specific fix]
- **规律提炼**: [general rule]
- **二次提炼接口**: [cross-project reusable check item]
- **首次出现**: [current date]
- **复现次数**: 1

---

> 此文件是错误原始记录，保留完整五步法分析过程。
> 提炼后的 META 规则汇总见 `errors/distilled/meta-rules.md`
```

5. If a META rule was extracted, also append it to `.ai/errors/distilled/meta-rules.md` in both the summary table and the detailed section:

```markdown
### META-XXX: 规则标题

- **规则**: 通用规则描述
- **适用场景**: 哪类代码/场景需要遵守
- **源错误**: ERR-NNN
- **检查方式**: 如何在代码审查中验证
```

6. Confirm the entry was recorded and show the new ERR file path and any META rule.
