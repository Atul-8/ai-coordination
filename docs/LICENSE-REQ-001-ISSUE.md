# LICENSE-REQ-001 — 许可请求（可直接粘贴到 GitHub Issue）

> 用途：渠道①「仓库 Issue」。当前 PAT 缺少 issues 写权限，需人工在
> https://github.com/Atul-8/ai-coordination/issues/new 粘贴以下正文，并加标签 `license-request`
> （标签不存在时先创建）。

**标题**：`[license-request] LICENSE-REQ-001 eai-agent GPL-3.0 port — approved`

**正文**：

```markdown
## LICENSE-REQ-001 · eai-agent RAG pool port

- **Source**: https://gitee.com/eai-code/eai-agent (commit 623b3b4)
- **License**: GPL-3.0 (per repository LICENSE)
- **Scope used**: `src/pool.js` — front-matter parsing, taxonomy/card validation,
  Chinese 2-gram tokenization and keyword scoring, ported/adapted from `scripts/lib.mjs`
- **This project**: dsh-ai-coordination (LGPL-3.0)
- **Copyright holder decision**: **APPROVED** — eai is the copyright holder's personal
  development repository; direct authorization granted in session on 2026-11-24 to
  distribute the ported scope under LGPL-3.0.
- **Ledger**: docs/THIRD-PARTY.md
- **Channels**: this Issue + README & docs/THIRD-PARTY.md disclosure +
  session handoff card `docs/HANDOFF-LICENSE-REQ-001.md`

Status: **approved** (was pending).
```