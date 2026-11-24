# 第三方代码与许可（THIRD-PARTY）

> 本文件是**许可请求与致谢台账**。规则见 [README「致谢与第三方代码」](../README.md#致谢与第三方代码重要)：
> 非 MIT 许可证的代码，必须经三种渠道报备开发者并取得书面同意后才能使用；未经同意不得合并、发布。

## 规则摘要

1. **MIT / ISC / BSD-2** 等宽松许可：README 致谢 + 保留原始版权声明与许可证文本。
2. **非 MIT**（Apache-2.0 / GPL / LGPL / MPL / CC-BY / 自定义许可）：先报备、后使用。
3. **三种渠道**（缺一不可，全部留痕）：
   - ① 仓库 Issue（标签 `license-request`），记录来源、许可证、使用范围、请求事项；
   - ② 公开披露：README「致谢与第三方代码」+ 本文件 + 随提交入库；
   - ③ 会话交接卡：`docs/HANDOFF-LICENSE-REQ-001.md`（仓库 `.ai/` 被 gitignore，故落 docs）。
4. 同意必须**书面、针对具体版本与具体范围**；口头/默许不算。

## 台账

### LICENSE-REQ-001 · eai-agent RAG 池（GPL-3.0）— 状态：✅ 已授权（approved）

| 项 | 内容 |
| --- | --- |
| 来源仓库 | https://gitee.com/eai-code/eai-agent |
| 来源版本 | `623b3b4`（2026-10-30） |
| 许可证 | **GNU GPL v3**（仓库 `LICENSE` 为 GPL-3.0；README 徽章写 Apache-2.0 与文件不一致，以 LICENSE 文件为准） |
| 使用范围 | `src/pool.js` 的 front-matter 限定子集解析、taxonomy 路径校验、卡片校验、中文 2-gram 分词与关键词打分，移植/改写自 `scripts/lib.mjs`；设计参考 `docs/design/rag-pool-redesign.md` |
| 本项目许可证 | LGPL-3.0（见 `LICENSE`） |
| 授权 | **2026-11-24 会话中由版权人直接授权**：eai 是版权人的个人开发仓库，同意以 LGPL-3.0 分发上述移植范围 |
| 授权范围 | 仅限 `src/pool.js` 列出的解析/校验/打分逻辑；后续从 eai 引入新代码需重新报备 |
| 记录 | 本文件 + README 公示 + `docs/HANDOFF-LICENSE-REQ-001.md` + 渠道① Issue（待人工创建，正文见 `docs/LICENSE-REQ-001-ISSUE.md`） |

#### 三渠道记录

| 渠道 | 状态 | 证据/说明 |
| --- | --- | --- |
| ① 仓库 Issue（`license-request`） | ⏳ 待人工创建 | `gh issue create` 返回 `GraphQL: Resource not accessible by personal access token (createIssue)`；正文已备：`docs/LICENSE-REQ-001-ISSUE.md` |
| ② 公开披露 | ✅ 完成 | README「致谢与第三方代码」+ 本文件随 git 提交 |
| ③ 会话交接卡 | ✅ 完成 | `docs/HANDOFF-LICENSE-REQ-001.md`（含授权结论、渠道①跟进项与验证命令） |

#### 授权后约束

- 保留 `src/pool.js` 文件头来源声明与 GPL-3.0 出处；README 持续致谢。
- 若未来从 eai 复制新的实现（非本文件列举范围），重新走三渠道报备。
- 若版权人撤回授权：以独立实现重写 `src/pool.js`（只保留公开设计思想，不复制实现），重跑测试。
- 项目整体仍以 LGPL-3.0 发布，本次授权属版权人给出的特定例外，不改变其他文件的许可。

## 致谢

- eai-agent（eai-code）— RAG 池设计思想与接口约定，以及本台账记录的解析/校验/打分实现；
- DeepSeek Harness（DSH）— 插件/预设/工具运行时与文档；
- 以及所有通过 MIT/ISC/BSD 许可被复用的项目（逐条登记在 README）。