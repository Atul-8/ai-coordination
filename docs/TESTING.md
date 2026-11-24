# 测试矩阵（TESTING）

> 目标：回答「这个插件敢不敢分发」。运行：`npm test`（30 项，纯 Node，无网络依赖）。

## 分层

| 层 | 文件 | 测什么 |
| --- | --- | --- |
| 纯函数 | `test/lib.test.mjs` | todo 解析/渲染、编号、AGENTS 插桩、交接卡、remote 解析、路径边界 |
| 卡池 | `test/pool.test.mjs` | front-matter/taxonomy/卡校验/分词/IDF 打分/序列化 |
| 插件契约 | `test/plugin.test.mjs` | 13 工具 / 1 用户命令 / 4 技能注册；**每个工具 parameters/output 是合法 JSON Schema**；mock 上下文端到端 |
| 全链路 | `test/full.test.mjs` | 每个工具 action、每个命令、错误分支、沙箱、bundle 清单 |

## 覆盖矩阵（full.test.mjs）

| 域 | 覆盖点 |
| --- | --- |
| Schema 契约 | 13 个工具 `parameters` 必须是 `type:object`；`required` 与 properties 一致；属性上不得残留 `required:true`；禁止 `anyOf`；array 必须有 items；`output.schema` 同样校验 |
| 初始化 | 全新项目、幂等重跑、已有 AGENTS.md 合并、pi/zcode 插桩原位升级、已有 todo.md 不覆盖、全局池播种 4 卡 + taxonomy |
| todo | list/add/start/done/link/set_issue/stage_add；未知阶段/未知任务/重复阶段/非法阶段 id/缺参数/未初始化 |
| 计划门禁 | 多步骤缺 acceptance、acceptance 数量不符、缺 research 且无 skip、找不到 research、单步免 acceptance、计划编号递增、阶段行回写、验收逐条写入 |
| 状态 | 未初始化报错；看板/META/HANDOFF/STRUCTURE 段落；HANDOFF open 可见 |
| 交接 | write 缺 next/verify 拒绝；卡片字段单行化；read/consume/重复 consume/无卡片 |
| 错误与 META | symptom/root_cause 必填、非法分类、ERR/META 连续编号、自动召回旧经验、meta list、promote 未知/成功、全局四位编号、项目回写 |
| 旧经验 | 未初始化/空 query；ERR+META 命中；关键词评分 |
| 架构检查 | 无 src 提示；合法 core→shared；JS 相对、`@/` 别名、Python 相对三类反向引用；STRUCTURE 状态 |
| issues | 无 remote 报错；本地 github remote 下 sync/list/close-done 的 dry-run；gitee 无 token 报错 |
| 角色卡 | 空 taxonomy 拒绝建卡；播种卡清单；query 命中/缺参；6 类非法建卡；register/update/reflect/memory_add/memory_list/first_mission_done；卡文件落盘 |
| 派发 | 无任务提示；矩阵与 role；`DISPATCH-*.json` 的任务数/prompt/缺口；record:false 不落盘 |
| 命令 | 只注册 `/eai-pm`；空参拒绝、正常路由、无 agents 服务时回退为可粘贴提示词；其余 `/eai-*` 不注册 |
| 沙箱 | read-only 拒绝写；workspace-write 越界拒绝；范围内放行；全局池在工作区外时警告但不阻断 |
| 清单 | `dsh.bundle.patch`、preset-eai-workflow/agi、persona、locale、icon、4 个技能 frontmatter |

## 安全回归（0.7.0 审计后新增）

独立 workflow 审计发现 31 项问题（5 项 P0），已修复并全部纳入测试：

| 问题 | 修复 | 测试 |
| --- | --- | --- |
| 卡片 id 路径穿越（`../evil`） | `cardPath()` 强制 kebab-case | 三个 action 的 `../evil` 拒绝 |
| desc 伪造 `(#N)` / `@session:` | 行尾锚定解析 + `sanitizeTodoDesc` 中和 | 注入描述后 metadata 不生效 |
| `set_issue` 写入 NaN/小数 | 整数 ≥1 校验 | `"abc"` / `3.7` 拒绝 |
| 重复 promote 污染全局池 | 按来源去重 | 两次 promote 只保留一条 |
| 多行 desc 破坏 todo 行 | 压成单行 | 换行描述写成单行 |
| 无 session 的 consume | 明确报错（命令层已隐藏，工具仍校验） | 空 session 拒绝 |
| todo.md 缺失静默当空 | `loadTodo` 报缺失 | 删除后 list 报错 |
| 外部包 `lodash/core` 误报 | 裸包名跳过 | 外部 import 不产生违规 |
| 同秒 dispatch 覆盖 | 秒级 + 冲突序号 | 连续两次路径不同 |
| 数值参数 NaN/0/-1 | `intArg` / `numberArg` | limit/threshold 非法值拒绝 |

## 未覆盖（分发前仍需人工/环境验证）

1. **真实 issue 创建**：需要 `gh` 登录或 `GITEE_TOKEN`，测试只验证 dry-run 与认证报错。
2. **新会话选 EAI 预设**：需要在 Web UI 新建会话选择预设，跑一次 `eai_init`/`eai_status` 冒烟。
3. **插件市场图标/详情渲染**：无浏览器控制，只校验文件与字段。
4. **真实 provider 端到端**：schema 契约 + 本机安装后的实际请求已覆盖大部分；不同 provider 的严格模式仍需观察。
5. **并发/性能**：卡池扫描是逐文件读取，几十张卡无压力；未做压力测试。
6. **Windows ACL 沙箱底层**：用 mock 策略验证逻辑，未验证宿主 ACL 差异。

## 分发前 checklist

- [ ] `npm test` 全绿（30/30）
- [ ] `plugin_manager remove_bundle` → `install_bundle <仓库根>`，结果 `application: applied`
- [ ] 新会话选 `EAI · 工作流`，跑 `eai_init` → `eai_todo add` → `eai_status`
- [ ] 版本号已 bump（当前 `1.1.0`），README/DESIGN 数字一致
- [ ] LICENSE-REQ-001 状态与 README/THIRD-PARTY 一致（已授权，发布记录可选）