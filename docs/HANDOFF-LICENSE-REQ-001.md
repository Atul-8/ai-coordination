# HANDOFF — LICENSE-REQ-001（许可报备）

> 跨渠道许可报备的第三渠道记录（会话交接卡）。仓库 `.ai/` 被 `.gitignore` 排除，
> 因此许可类交接卡落 `docs/`，随代码提交留痕。
> 规则见 README「致谢与第三方代码」；台账见 [docs/THIRD-PARTY.md](THIRD-PARTY.md)。

- 状态: approved（版权人已授权）
- 交出方: dsh/本轮会话（2026-11-24）
- 接手方: 仓库维护者（人工完成渠道① Issue 创建）
- 任务: LICENSE-REQ-001
- 已完成: 识别移植范围（src/pool.js）/ 更新 README 与 THIRD-PARTY 致谢 / 版权人书面授权记录 / 本交接卡
- 进行中: 渠道① GitHub Issue 待人工创建（PAT 缺 issues 写权限；正文已备）
- 卡点/死路: `gh issue create` → `GraphQL: Resource not accessible by personal access token (createIssue)`；`gh label create` → 403
- 下一步: 打开 https://github.com/Atul-8/ai-coordination/issues/new ，粘贴
  [docs/LICENSE-REQ-001-ISSUE.md](LICENSE-REQ-001-ISSUE.md) 的标题与正文，标签 `license-request`
- 验证: 仓库 Issues 出现 `[license-request] LICENSE-REQ-001 …`；THIRD-PARTY 三渠道表三行均为 done