# .ai/ — coordination 层

pi-ai-coordination 框架数据目录。只放协调/状态/知识资产，不放业务代码。

| 路径 | 作用 | 维护者 |
| --- | --- | --- |
| `STRUCTURE.md` | 七层结构地图（G2 同步对象） | 写操作后必须更新 |
| `requirements/REQ-NNN.md` | 需求卡（背景/目标/验收） | /pm 流程创建 |
| `errors/raw/ERR-NNN.md` | 错误现场记录（G3 第1-2步） | /error 流程创建 |
| `errors/distilled/meta-rules.md` | 项目级 META 规则（G3 第3步蒸馏） | /error + /meta 流程 |
| `scripts/issues.js` | todo.md ↔ git issues 同步脚本 | init 部署，勿手改 |

## 会话与状态（重要）

本目录**不再**维护 WORKSTATE.md / LOG.md：
- 会话上下文 → pi 原生会话树（`/resume` `/tree` `/fork`，JSONL 存于 pi 会话目录）
- 任务状态 → 项目根 `todo.md`（行内 `@session:xxxxxxxx` 关联 pi 会话）
- 提交历史 → git log

## 全局池（C:\.ai_global）

跨项目资产统一在 `AI_GLOBAL_DIR`（默认 `C:\.ai_global`，类 Unix `~/.ai_global`）：

| 路径 | 作用 |
| --- | --- |
| `meta/distilled/meta-rules.md` | 全局 META 经验池（项目内规则确认普适后由 `/meta` 提升） |
| `meta/raw/` | 跨项目错误原始现场（可选） |
| `agents/registry.json` | 智能体角色注册表（pm=主会话；writer/reviewer/tester/architect=subagent） |
| `agents/cards/*.md` | 角色卡，派发时与任务卡组合成 subagent task |

项目级规则先落在 `errors/distilled/meta-rules.md`，确认普适后再提升到全局池。
