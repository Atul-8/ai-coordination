---
description: 项目状态报告：todo / issues / meta / 智能体 / 会话
---

汇总当前项目状态并输出报告（不修改任何文件）：

1. **任务**：读 todo.md —— 各阶段进度（待办/进行/完成）、进行中的 T-NNN 及其 @session 关联。
2. **issues**：`node .ai/scripts/issues.js list` —— 任务↔issue 映射、未同步的待办。
3. **经验**：项目 META 规则数（`.ai/errors/distilled/meta-rules.md`）+
   全局池规则数（`C:\.ai_global\meta\distilled\meta-rules.md`）。
4. **智能体**：全局卡池（`AI_GLOBAL_DIR\agents\pool\*.md`，RAG pool v2）角色清单与 host。
5. **会话**：当前 pi session id；需要历史细节时提示用 /tree 回溯（不读 WORKSTATE——已废弃）。
6. **结构**：`.ai/STRUCTURE.md` 是否与实际目录一致（抽查关键目录）。

结尾给出建议动作：继续未完成任务（/go）→ 同步缺失 issue（/issue）→ 提炼新错误（/error）。
