---
description: 跨宿主交接卡：开发到一半换宿主（ZCode ↔ pi）无缝接力；/handoff 写卡交出，/handoff done 消化接手
argument-hint: [done（接手完成后消化卡片），默认=写卡交出]
skills: coordination
---

执行跨宿主交接流程。参数：`$ARGUMENTS`（空 = 写卡交出；`done` = 消化接手）。

## A. 写卡交出（默认，开发到一半要换宿主时执行）

1. **确认现场**：项目根有 `.ai/`；从 todo.md 找 `[~]` 进行中任务（无则提示：无进行中任务，通常无需交接卡）。
2. **汇总现场事实**（全部用真实输出，禁止凭记忆）：
   - 未提交变更：`git status --short`（原样贴卡）
   - 最近提交：`git log --oneline -5`
   - 半成品：建议先 WIP 提交（征得用户同意后 `git add -A && git commit -m "WIP: T-NNN 交接前暂存"`），卡片引用 hash
   - 当前会话 id：G1 开门上下文里的 session 前 8 位
3. **写卡**：读插件模板 `$ZCODE_PLUGIN_ROOT/templates/HANDOFF.md`（找不到则
   `ls ~/.zcode/cli/plugins/cache/*/ai-coordination/*/templates/HANDOFF.md`），填充后写入 `.ai/HANDOFF.md`（整卡重写，覆盖旧卡）。
   - 状态=open；交出方=本方宿主+session；「下一步」「验证」必须写到接手方可直接照做
4. **提交交接卡**：`git add .ai/HANDOFF.md && git commit -m "chore: HANDOFF T-NNN 交出（zcode→接手方）"`（`.ai/` 若为独立 git 仓库则在该仓库内提交）；提示用户 push（跨机器时接手方 pull 才能看到）。
5. **汇报**：卡片路径 + 任务号 + 接手方开机动作（在任意宿主打开项目 → G1 自动提示读卡；pi 侧同样生效）。

## B. 消化接手（`/handoff done`，本方接手开发完成后执行）

1. 读 `.ai/HANDOFF.md` 确认「状态: open」（已是 resumed 则告知无待消化卡片，终止）。
2. 按卡执行：「验证」命令先跑（证明接上了）→「下一步」动作续作 → G2 纪律照常。
3. **消化收尾**：
   - 编辑 `.ai/HANDOFF.md`：状态=open 改 `resumed`；接手方=本方宿主 + session 前 8 位 + 时间
   - `coord_todo {action:'link', id:'T-NNN'}` 把任务会话关联重绑到本方会话
   - 提交卡片：同 A4（message 用 `chore: HANDOFF T-NNN 消化（接手方）`）
4. 汇报：验证输出 + 续作结果 + 卡片已闭环。
