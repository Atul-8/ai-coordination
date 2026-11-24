---
name: agi-dispatch
description: DSH 多 agent 派发纪律：subagent / subagent_fork / workflow(pipeline/parallel) / team 任务板的选型、派发矩阵、任务卡组装、结果验收与回写。大任务跨阶段、需要并行或需要独立复核时使用。
whenToUse: 任务跨多个阶段或文件域；需要 writer→reviewer 串行、阶段并行；需要独立上下文做审查/调研；用户要求多 agent 编排。
---

# agi-dispatch — DSH 多 agent 派发

## 选型

| 场景 | 机制 |
| --- | --- |
| 一个自包含子任务（调研、审查、独立实现） | `subagent`（独立上下文，返回结论） |
| 子任务需要本会话上下文（续写、复核本次改动） | `subagent_fork` |
| 多阶段 / 多文件 fan-out，阶段内串行 | `workflow` + `pipeline`（无屏障；每项独立跑完所有 stage） |
| 多路并行且后一步需要全部结果 | `workflow` + `parallel`（屏障，尽量少用） |
| 需要共享任务 DAG、跨 agent 认领 | `team_task_create / team_task_list / team_task_update` |

## 派发矩阵（PM 必做）

任务与计划就绪后立即产出矩阵，再派发：

```
阶段 s1 | 并行 2 | 文件域 src/core/**        | 任务 T-003, T-004
阶段 s1 | 串行   | 文件域 src/interface/**   | T-003 writer → reviewer
阶段 s2 | 等待 s1 完成 | 文件域 testing/**    | T-005
```

规则：
- 同一文件域不并行写（冲突）；跨阶段有依赖就串行。
- 每个 subagent 任务卡必须含：任务 ID、目标、验收标准、写入范围（文件域）、禁止事项、验证命令。
- 角色卡（可选）：`AI_GLOBAL_DIR\agents\pool\*.md`；先检索再派发，未命中先建卡（必写 scope，禁万金油卡）。
  子 agent scope 不符可拒单（`{verdict:'out-of-scope', reason, suggest_keywords}`）；任务带反馈回队尾，同一任务累计 2 次退单 → 主会话拆解或上报用户。
- 子 agent 不负责归档：`coord_todo done`、issue 关闭、文档同步由 PM 在验收后执行。

## workflow 脚本契约（DSH）

- 可用：`agent(prompt, opts?)`、`pipeline(items, ...stages)`、`parallel(thunks)`、`phase(title)`、`log(msg)`、`args`。
- `agent` 返回最终文本；带 `opts.schema` 时返回校验后的对象；失败为 `null`，要 `.filter(Boolean)`。
- 可选 `provider`/`model`/`reasoningEffort` 覆盖路由；不要猜测不可用的模型。
- 不要写文件、网络、定时器逻辑——脚本只做编排，实际工作由 agent 完成。
- 端到端返回 JSON 可序列化结果；PM 读取后统一验收。

示例骨架：

```js
const rows = args.tasks; // [{ id, prompt, files }]
return await pipeline(rows,
  async (task) => agent(task.prompt, { label: task.id, phase: 'writer' }),
  async (text, task) => agent(`复核 ${task.id} 的改动，只报缺陷：\n${text}`, { label: `${task.id}/review`, phase: 'reviewer' }),
);
```

## 验收与收口

1. 子 agent 报告 ≠ 完成：必须跑测试/类型检查/构建，按文件域审阅 diff。
2. 失败/超时：先定位是任务描述、范围还是环境问题；不要静默重试同一提示。
3. 通过后：分任务提交（`git add <文件域>`）→ `coord_todo {action:'done'}` → 同步 STRUCTURE/REQ → push。
4. 汇报矩阵与实际结果（成功/失败/未执行），不要只报「已完成」。

## 反模式

- 计划已登记却无派发就停轮（PM 失职）。
- 把同一文件域拆给多个并行 agent。
- 用「子 agent 说完成了」代替验证。
- 把整份计划原文复制给每个子 agent（上下文浪费）；只给任务卡 + 必要上下文。