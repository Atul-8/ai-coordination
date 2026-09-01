---
description: 把项目 META 规则提升到全局池（C:\.ai_global\meta）（= /meta eai 别名）
argument-hint: [规则关键词或 META 编号，可选]
---

把项目级 META 规则提升到全局池（`AI_GLOBAL_DIR`，默认 `C:\.ai_global`，类 Unix `~/.ai_global`）。

1. 读 `.ai/errors/distilled/meta-rules.md` 全部项目规则；若用户给了关键词/编号则只筛这些。
2. 与用户逐条确认是否"跨项目普适"（不是本仓库特有的路径/命令/约定）。
3. 对确认的规则：
   - 读全局池 `C:\.ai_global\meta\distilled\meta-rules.md`，扫现有最大 `### META-NNNN` 编号再 +1
   - 追加到全局池（保持受控词表格式：规则/来源/反面案例；来源注明 `<项目名> META-NNN`）
4. 回写项目池：对应项目规则末尾加一行 `- **全局**: META-NNNN`（建立双向关联）。
5. 可选：若 `C:\.ai_global` 是 git 仓库 → 提交并推送，实现跨机同步。
6. 输出提升清单：项目 META-NNN → 全局 META-NNNN。
