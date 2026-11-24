---
name: eai-handoff
description: 跨宿主交接卡协议（DSH ↔ pi ↔ ZCode）：写卡交出、接手验证、消化卡片。开发到一半需要换宿主、会话无法延续、或接手他人半成品时使用。
whenToUse: 需要跨宿主/跨会话接力；看到 .ai/HANDOFF.md；用户说「交接」「换宿主继续」「接手」。
---

# eai-handoff — 跨宿主交接卡

交接卡 `.ai/HANDOFF.md` 是**唯一跨宿主现场记录**：宿主会话日志对另一宿主不可读，卡片是纯数据，任何宿主都能读。
一张卡对应一次交出；整卡重写不追加，历史在 git log。

## A. 写卡交出（eai_handoff write）

写卡前先把现场变成可验证的事实：

1. 确认激活：项目根有 `.ai/`；`eai_todo {action:'list'}` 找出 `[~]` 进行中任务（没有则通常无需交接）。
2. 取证（禁止凭记忆）：
   - `git status --short`（工具会自动附上）
   - `git log --oneline -5`
   - 半成品尽量先 WIP 提交（征得用户同意），卡片引用 commit hash
   - 当前宿主 session 前 8 位（工具自动写入交出方）
3. 调用 `eai_handoff {action:'write', task:'T-003', done, doing, blockers, next, verify}`：
   - `next` 与 `verify` 必填；`verify` 是「证明接上了」的最小命令 + 期望输出。
   - `blockers` 写已排除的死路，防止接手方重蹈覆辙。
4. 提交卡片：`git add .ai/HANDOFF.md && git commit -m "chore: HANDOFF T-NNN 交出（dsh→接手方）"` 并推送。
5. 汇报：卡片路径 + 任务号 + 接手方开卡动作。

## B. 接手（G1 必读）

1. `eai_handoff {action:'read'}` 读卡；状态不是 open → 无需接手。
2. **先跑「验证」**，确认环境与卡片一致（输出不符 → 先查环境，不要直接续作）。
3. 按「下一步」精确续作；G2 纪律照常。
4. 完成后 `eai_handoff {action:'consume'}`：状态改 resumed、任务 `@session` 重绑本会话。
5. 提交卡片（`chore: HANDOFF T-NNN 消化（接手方）`）。

## 反模式

- 无 `verify` 的交接卡 = 未交接；接手方无法区分「环境坏了」与「进度不同」。
- 把「我觉得做完了」写进已完成；只认 commit hash / 测试输出。
- 交接后继续在旧宿主改同一文件；交出方在新卡 resumed 前不得再动现场。
- 卡片写成流水账；只写接手方续作所需的最小事实。