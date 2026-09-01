# C:\.ai_global — 全局池（META 经验 + 智能体调配 + 凭据字典）

pi-coordination 框架的跨项目资产根。`AI_GLOBAL_DIR` 环境变量可覆盖（类 Unix 默认 `~/.ai_global`）。

> **2026-09-02 迁移说明**：旧框架的 `.ai_meta` / `.ai_agent` 两个独立 git 仓库已整体迁入
> `meta/` 与 `agents/`（保留完整 git 历史与云端关联），本目录下的旧路径不复存在。

## 目录布局

| 路径 | 作用 | 云端仓库 | 编号规则 |
| --- | --- | --- | --- |
| `meta/distilled/meta-rules.md` | **新框架全局 META 池**（`### META-NNNN`） | gitee `eai-code/ai-meta`（main） | META-NNNN（0001 起） |
| `meta/rules/`（206 文件）+ `meta-rules.md`（1714 行汇编）+ `meta-index.json` | **legacy META 知识库**（12 类规则 + RAG 索引） | 同上（同仓库同分支） | META-NNN（001~243，继续沿用） |
| `meta/raw/` | 跨项目错误原始现场（可选） | 同上 | — |
| `agents/pool/*.md`（21 张） | **角色卡单池（schema v2）**：domain-expert 与 process-role 同池，front-matter 限定子集 | gitee `eai-code/eai-agent`（master） | — |
| `agents/taxonomy.yml` | 受控标签词表（多维 DAG，多父允许，点号路径） | 同上 | — |
| `agents/scripts/` | `build-index.mjs`（校验+建索引）/ `query.mjs`（检索，exit 2=缺口建卡信号）/ `lib.mjs`（node:test） | 同上 | — |
| `agents/agents-index.json` | 索引构建产物（克隆即可检索） | 同上 | — |
| `agents/memory/`（41 份） | 各 agent 专属经验（`<id>/MEMORY.md` 索引页 + 记忆条目） | 同上 | — |
| `agents/docs/design/rag-pool-redesign.md` | **RAG 池唯一设计规格** | 同上 | — |
| `personal_token.yml` | 凭据字典（platforms 索引 + 每平台固定 `token` 变量） | **不入库**（本机文件） | — |
| `read-token.sh` | 凭据静默读取助手：`TOKEN=$(sh read-token.sh <platform>)` | 不入库 | — |

**编号注意**：全局池新旧两套编号并行——新规则 META-NNNN（4 位，`meta/distilled/`），
legacy 规则 META-NNN（3 位，`meta/rules/`），引用时以位数区分，互不续接。

## 动态调度命名规范（固定前缀）

- 常驻调度者：主会话担任 PM；若注册为命名 agent，名称固定 **`pi-dynamic-workflows-pm`**
- 动态 lanes 的 workflow key：**`pi-dynamic-workflows.<stage>.<T-NNN>`**（如 `pi-dynamic-workflows.s1.T-003`）
- 阶段 = lane（无依赖阶段可并行接入）；任务 = lane 内串行 stage（writer → reviewer）
- 角色卡单池：`agents/pool/`；派发前先检索：`node scripts/query.mjs "任务"`（在 agents/ 下）

## 云端同步

`meta/` 与 `agents/` 各自是独立 git 仓库（remote 已指向 gitee），写入后记得 push：

```sh
git -C /c/.ai_global/meta push origin main
git -C /c/.ai_global/agents push origin master
```
