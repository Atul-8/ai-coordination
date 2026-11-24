# .ai/ — coordination 层

dsh-ai-coordination 框架数据目录。只放协调/状态/知识资产，不放业务代码。

| 路径 | 作用 | 维护者 |
| --- | --- | --- |
| `STRUCTURE.md` | 七层结构地图（G2 同步对象） | 写操作后必须更新 |
| `requirements/REQ-NNN.md` | 需求卡（背景/目标/验收） | G0 大活时创建 |
| `errors/raw/ERR-NNN.md` | 错误现场记录（G3 第 1-2 步） | `coord_error` |
| `errors/distilled/meta-rules.md` | 项目级 META 规则（G3 蒸馏） | `coord_error` / `coord_meta` |
| `HANDOFF.md` | 跨宿主交接卡（换宿主时才存在） | `coord_handoff` |
| `scripts/issues.js` | todo.md ↔ git issues 同步 CLI | init 部署，勿手改 |

## 会话与状态（重要）

本目录**不维护** WORKSTATE.md / LOG.md：
- 会话上下文 → 宿主原生会话（DSH 会话日志/恢复/fork；pi `/tree` `/fork`）
- 任务状态 → 项目根 `todo.md`（行内 `@session:xxxxxxxx` 关联会话）
- 提交历史 → git log

## 全局池（默认 `C:\.ai_global`，`AI_GLOBAL_DIR` 可覆盖）

| 路径 | 作用 |
| --- | --- |
| `meta/distilled/meta-rules.md` | 全局 META 经验池（项目规则确认普适后由 `coord_meta promote` 提升） |
| `meta/raw/` | 跨项目错误原始现场（可选） |
| `agents/pool/*.md` | 角色卡单池（RAG v2）：pm=主会话；writer/reviewer/tester/architect=subagent |

项目级规则先落在 `errors/distilled/meta-rules.md`，确认普适后再提升到全局池。