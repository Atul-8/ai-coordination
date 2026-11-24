# 角色卡池（可选）

`AI_GLOBAL_DIR\agents\pool\*.md` 存放可复用的角色卡（writer / reviewer / tester / architect / pm），
供大任务派发时按任务检索组合。本骨架只建目录，不联网克隆。

## 卡片最小字段

- `name`：kebab-case，唯一
- `title`：角色标题
- `scope`：适用边界（必写；禁止万金油卡）
- `keywords`：≥3 个检索词
- `host`：main（主会话 PM）或 subagent
- `stages`：建议接入的阶段
- `first_mission`：pending / done（首任务后复核）

## 派发纪律

- 先检索再派发；未命中先建卡（写清 scope），不要拿万金油卡硬套。
- 任务卡 = 角色卡 + 任务描述 + 验收标准；子 agent scope 不符可拒单，任务带反馈回队尾。
- PM 保持调度权与验收权；子 agent 结果必须经测试/构建验证后才归档。