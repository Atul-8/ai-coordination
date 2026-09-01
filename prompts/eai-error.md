---
description: G3 五步错误提炼：现象→根因→修复→预防→META（= /error eai 别名）
argument-hint: [错误简述]
---

对以下错误执行 G3 五步法（缺一不可）：

$ARGUMENTS

1. **现象**：精确报错信息、复现步骤、期望 vs 实际 → 写入 `.ai/errors/raw/ERR-NNN.md`
   （先 `ls .ai/errors/raw/` 查最大编号再 +1；模板 ERR-000；记录当前 pi session 前 8 位与关联任务 T-NNN）
2. **根因**：定位过程 + 根因结论。禁止"玄学"结论；禁止"暂时好了"当作修复。
3. **修复**：改了什么（文件/提交/命令）。
4. **预防**：检查、约束、自动化手段。
5. **META 蒸馏**：按受控词表（BUILD/ENV/TEST/DATA/API/ARCH/PROC/DOC/SEC/PERF/DEP/COLLAB）
   提炼一条可复用规则 → 追加到 `.ai/errors/distilled/meta-rules.md`（`### META-NNN`，编号连续）。

若连续 2 次同根因报错：停止修复，升级为 REQ 卡走 /plan。
若规则确认跨项目普适：提示用户运行 `/meta` 提升到全局池（`C:\.ai_global\meta`）。
