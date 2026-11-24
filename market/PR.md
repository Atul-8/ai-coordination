## Add `Atul-8/ai-coordination` — EAI workflow plugin

- **Entry**: `data/plugins/Atul-8__ai-coordination.yml`
- **Source**: https://github.com/Atul-8/ai-coordination (default branch `dsh`, root `package.json` declares `dsh.bundle.patch: ./cordis.patch.yml`)
- **Category**: `workflow`

### What it does

A seven-layer coordination framework for long-running software work on DSH: 13 `eai_*` tools and `/eai-*` commands for todo.md planning, plan documents, git issue sync, G3 error/META distillation, RAG role-card dispatch (`eai_agent` / `eai_dispatch` / `eai_recall`), architecture checks (`eai_arch`) and cross-host handoff, plus four skills and an **EAI · 工作流** agent preset.

### Checklist

- [x] `dsh.bundle` manifest at the repository root
- [x] Repository older than 1 day
- [x] `npm test` 30/30 passing
- [x] License: LGPL-3.0; third-party GPL-3.0 port authorized and disclosed in README/docs/THIRD-PARTY.md
- [x] Description matches the shipped tools and skills
- [ ] Icon: none (SVG icon exists in the bundle, but the market tile expects a GitHub-hosted raster image; omitting falls back to the owner avatar)

The installer resolves the repository root, so no subpackage path is needed.