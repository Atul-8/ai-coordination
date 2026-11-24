---
name: agi-growth
description: Agent 自我成长协议：三层沉淀（角色记忆 → 自卡升级 → 全局 META）、RAG 角色卡池自演化（检索/建卡/退单/first_mission 复核）、taxonomy 演化与维护纪律。任务收口、角色卡升版、经验沉淀、卡池治理时使用。
whenToUse: 完成一个阶段后做复盘；角色卡需要升级 keywords/scope；出现新领域需要建卡；用户问 agent 如何越用越聪明/经验沉淀；需要维护 AI_GLOBAL_DIR/agents。
---

# agi-growth — Agent 自我成长

成长不是「记住这次对话」，而是把经验写进**下一次派发能检索到的地方**。三层沉淀，一层比一层通用：

| 层 | 落点 | 生命周期 | 工具 |
| --- | --- | --- | --- |
| 1. 角色记忆 | `AI_GLOBAL_DIR/agents/memory/<id>/*.md` | 跟随角色卡，可检索 | `coord_agent {action:'memory_add'}` |
| 2. 自卡升级 | `agents/pool/<id>.md`（只改自己的卡） | version+1，检索权重改变 | `coord_agent {action:'update'}` |
| 3. 全局 META | `AI_GLOBAL_DIR/meta/distilled/meta-rules.md` | 跨项目普适规则，META-NNNN | `coord_error` → `coord_meta promote` |

## 1. 角色记忆（任务收口时写）

触发：完成一项任务、踩坑、做出决策、得到用户反馈。

```json
{
  "action": "memory_add",
  "owner": "writer",
  "type": "pitfall",
  "title": "Windows 下别用默认代码页读写非 ASCII",
  "content": "现象……根因……修复……预防……",
  "domains": ["windows", "encoding"],
  "keywords": ["编码", "GBK", "UTF-8"]
}
```

- `type`：`pitfall` | `feedback` | `project-fact` | `decision`。
- 一条记忆只讲一件事；带证据（命令/报错/提交）。
- 写记忆是子 agent 自己的事，PM 收口只做归档与复核。

## 2. 自卡升级（只准改自己的卡）

触发：这类任务总被派给同一个角色、scope 需要收窄/放宽、检索关键词总是差一点。

```json
{ "action": "update", "id": "writer", "keywords": ["实现","编码","…"], "note": "T-042 起补 claim 关键词" }
```

纪律：
- 只改 `keywords` / `scope` / `summary` / `applies_to` / `reject_hint`；id、taxonomy 变更走建卡重审。
- 每次升级自动 `version+1` 并追加「自升级记录」。
- **不许**为了抢任务放宽 scope；scope 越宽，退单越少但错配越多。
- **角色卡就是子 agent 的提示词**：升级必须有经验证据（memory / 退单 / 复核缺陷），不是凭感觉改写；主 agent 的 persona 与技能属于仓库资产，通过改仓库 + 重装演进，不在运行时篡改宿主 prompt。

## 3. 全局 META（跨项目普适）

- 项目内：`coord_error` 五步法 → `.ai/errors/distilled/meta-rules.md`（META-NNN）。
- 确认跨项目普适（不是本仓库路径/命令/约定）→ 与用户确认后 `coord_meta {action:'promote', rule:'META-NNN'}`。
- 全局池编号 META-NNNN；项目规则末尾回写全局编号。

## 4. RAG 卡池自演化

**检索三档（派发前必跑）**：

```text
coord_agent {action:'query', task:'实现 STM32 USB HID 描述符'}
  → 强命中：top 卡 ≥ 阈值（3）→ 组合派发
  → 弱命中：分数低但非零 → 派发，任务卡标注「边界试探」，收口时补 keywords
  → 缺口：top < 阈值 → 建卡协议
```

**建卡协议**（本职动作，不等用户要求）：`coord_agent {action:'register', …}`

- 必填：id、type、name、summary（≤80 字，禁通用/万能）、taxonomy（路径必须存在于 taxonomy.yml）、≥3 keywords、scope.do/dont 各 ≥1。
- 新卡 `first_mission: pending`；首任务完成且 PM 复核通过 → `{action:'first_mission_done', id}`。
- 不合格的卡：修卡或废弃（不要物理删，改 status/deprecated）。

**退单队列**：子 agent 开工前对照 scope 自查，不符就拒单：

```json
{ "verdict": "out-of-scope", "reason": "主体是硬件驱动，charter 是文档", "suggest_keywords": ["HID", "描述符"], "suggest_agent": "embedded-firmware-engineer" }
```

PM 收退单 → 任务携反馈入队尾，FIFO 重新派发；同一任务累计 ≥2 次 → 不再入队，拆解自办或上报用户。

**taxonomy 演化四动作**：诞生（note 记 who/why/date）、繁荣（看使用分布）、剔除（`status: deprecated` + redirect）、合并（redirect 多目标）。

## 5. 收口检查（每个阶段结束）

1. 每个参与角色：记忆是否已写？卡是否需要升版？
2. 新领域是否缺卡？缺口任务是否已建卡并复核？
3. 跨项目教训是否已升 META？
4. `/coord-growth` 看板：待复核卡（first_mission=pending）、记忆分布、全局 META 数量。

## 反模式

- 把经验只写在回复里，不落 memory/卡/META（下次检索不到 = 没成长）。
- 建万金油卡 / 把 scope 写宽抢任务。
- 绕过校验手改 frontmatter（`coord_agent` 会拒收非法 taxonomy/keywords/scope）。
- 子 agent 越权改别人的卡或 taxonomy（taxonomy 变更由 PM 统一评审）。