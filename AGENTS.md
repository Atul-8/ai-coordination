# AGENTS.md — 本仓库开发约定

> 本文件是 **ai-coordination 仓库自身**的维护规范，不是部署到用户项目的模板。
> 部署模板是 `templates/AGENTS.template.md`（故意不用 `AGENTS.md` 命名，避免被本仓库会话自动加载）。

## 这是什么

`dsh` 分支 = 七层分治协调框架的 **DSH bundle**（包名 `dsh-ai-coordination`），仓库根即插件根。
pi 版在 `pi-ai-coordination` 分支，ZCode 版在 `zcode-ai-coordination` 分支；三个分支共享项目数据契约
（`todo.md` / `.ai/` / `HANDOFF.md`），不要在本分支恢复 pi 的 `extensions/`、`prompts/`、`pi` 清单字段。

## 结构

| 路径 | 约束 |
| --- | --- |
| `index.js` | 只做装配：读模板资产 → 注册工具、命令、技能；业务逻辑放 `src/` |
| `src/lib.js` | 纯函数、零 I/O；todo/plan/交接卡格式都在这里，改格式必须同步 `docs/DESIGN.md` 与测试 |
| `src/project.js` | 所有落盘经 `createIo(policy)`（沙箱策略）；不要在工具里直接 `fs.writeFile` |
| `src/tools.js` / `src/commands.js` | 只做参数校验与结果渲染；共享逻辑下沉到 `src/` |
| `templates/` | 会被部署到用户项目；`AGENTS.template.md` 是规范正文，`todo.md` / `STRUCTURE.md` 等保持占位可读 |
| `scripts/issues.js` | 零依赖 Node CLI；与 `src/issues.js` 行为保持一致 |
| `skills/*/SKILL.md` | frontmatter 必须含 `name` / `description` / `whenToUse`；技能名以 `agi-` 前缀避免冲突 |
| `cordis.patch.yml` | 顶层插件行 + `preset-agi` 预设；插件名只用 DSH 已发布包 |
| `test/` | 改工具/格式必须补测试；`npm test` 全绿才算完成 |

## 开发流程

1. 改代码前先跑 `npm test`，确认基线是绿的（G2.5：红→绿）。
2. 改行为 → 同步 `README.md`（工具/命令表）与 `docs/DESIGN.md`（映射/边界/验证记录）。
3. 改 `package.json` 的 `version`（本地安装用），然后重新 `plugin_manager install_bundle` 指向仓库根。
4. 验证：`npm test` 全绿 → 安装 `application: applied` → 重启 DSH → 新建会话选 `AGI · 协调开发` →
   跑 `coord_init` / `coord_todo` / `coord_status` 冒烟。
5. 提交信息用 `feat|fix|docs|chore(dsh): …`，与分支语义一致；不提交 `.ai/`、`todo.md`、`node_modules/`。

## 兼容红线

- `todo.md` 行格式与 `<!-- dsh-ai-coordination:agents:v1 BEGIN/END -->` 标记是跨宿主契约：
  改它们必须同时改 pi 分支的 `lib.ts` / `init-project.js`，否则接力会断。
- 工具名 `coord_*`、命令名 `/coord-*`、预设 id `agi` 已在 profile 安装态使用，不要无故改名。
- 写文件必须走会话沙箱策略（`read-only` 拒绝、`workspace-write` 限制在工作区），不要绕过。