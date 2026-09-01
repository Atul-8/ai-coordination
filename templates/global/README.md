# C:\.ai_global — 全局池（META 经验 + 智能体调配）

pi-ai-coordination 框架的跨项目资产根。`AI_GLOBAL_DIR` 环境变量可覆盖（类 Unix 默认 `~/.ai_global`）。
可选：在本目录 `git init` 并关联远程，实现跨机同步。

| 路径 | 作用 | 维护者 |
| --- | --- | --- |
| `meta/distilled/meta-rules.md` | 全局 META 经验池（`### META-NNNN`，受控词表） | /meta 提升 |
| `meta/raw/` | 跨项目错误原始现场（可选） | /error |
| `agents/registry.json` | 智能体角色注册表（namespace 固定 `pi-dynamic-workflows`） | 手工/PM |
| `agents/cards/*.md` | 角色卡：派发时与任务卡组合成 subagent task | 手工/PM |

## 动态调度命名规范（固定前缀）

- 常驻调度者：主会话担任 PM；若注册为命名 agent，名称固定 **`pi-dynamic-workflows-pm`**
- 动态 lanes 的 workflow key：**`pi-dynamic-workflows:<stage>:<T-NNN>`**（如 `pi-dynamic-workflows:s1:T-003`）
- 阶段 = lane（无依赖阶段可并行接入）；任务 = lane 内串行 stage（writer → reviewer）
