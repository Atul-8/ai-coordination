# LICENSE-REQ-001 — 许可记录（发版/对外分发时可选使用）

> 按当前规则，警告与记录**以 README + 会话警告为主**；本文件只在**发版或对外分发**时作为 release notes /
> Issue 正文使用，平时不必创建。当前项目未发版，因此该步骤可省略。

**标题**：`[license-request] LICENSE-REQ-001 eai-agent GPL-3.0 port — approved`

**正文**：

```markdown
## LICENSE-REQ-001 · eai-agent RAG pool port

- **Source**: https://gitee.com/eai-code/eai-agent (commit 623b3b4)
- **License**: GPL-3.0 (per repository LICENSE)
- **Scope used**: `src/pool.js` — front-matter parsing, taxonomy/card validation,
  Chinese 2-gram tokenization and keyword scoring, ported/adapted from `scripts/lib.mjs`
- **This project**: dsh-eai-workflow (LGPL-3.0)
- **Copyright holder decision**: **APPROVED** — eai is the copyright holder's personal
  development repository; direct authorization granted in session on 2026-11-24 to
  distribute the ported scope under LGPL-3.0.
- **Ledger**: docs/THIRD-PARTY.md
- **Channels**: this Issue + README & docs/THIRD-PARTY.md disclosure +
  session handoff card `docs/HANDOFF-LICENSE-REQ-001.md`

Status: **approved** (was pending).
```