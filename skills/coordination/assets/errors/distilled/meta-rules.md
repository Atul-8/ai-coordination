<!-- schema_version: 1 -->

# META 规则汇总

> 从项目错误中提炼的跨项目通用规则。新项目启动时读取此文件作为预置防线。
>
> **格式约定（schema_version: 1）**：每条规则带结构化字段，供 `meta-index.js` 生成机器可读索引、
> 供 `meta-retriever.js` 检索，并为未来向量 RAG 预留 `embedding` 字段。
>
> **CATEGORY 受控词表**：`ASYNC | SECURITY | CONCURRENCY | DEPENDENCY | LAYERING | API_CONTRACT | DATA_INTEGRITY | ERROR_HANDLING | TESTING | PERFORMANCE | BUILD | STATE_MGMT`
>
> **必填字段**：类别(category) / 关联层(layer) / 关联专家(applies_to) / 触发关键词(keywords)。
> G3 五步法提炼时若缺失这些字段，视为提炼未完成。

---

## 规则总表

| 编号 | 类别 | 关联层 | 规则摘要 | 源错误 |
|------|------|--------|---------|--------|
| META-001-ASYNC | ASYNC | core, interface | async 调用必须有错误处理，禁止裸 await | ERR-000 |

---

### META-001-ASYNC: 异步函数必须包含错误处理

- **规则**: 所有 async 函数调用处必须包含 try-catch 或等效错误处理（如 .catch()），禁止裸 await 不含错误处理
- **适用场景**: 任何使用 async/await 的代码，特别是涉及 I/O 操作（数据库、网络、文件系统）的异步调用
- **源错误**: ERR-000（异步函数未做错误处理导致数据丢失）
- **检查方式**: 代码审查中搜索 `await` 关键字，确认每个 await 调用是否被 try-catch 包裹或函数本身已返回 Result/Option 类型
- **类别(category)**: ASYNC
- **关联层(layer)**: core, interface
- **关联专家(applies_to)**: backend-architect, embedded-firmware-engineer, pc-host-engineer
- **触发关键词(keywords)**: async, await, promise, 异步, 错误处理, try-catch, then, catch
- **语义摘要(semantic_summary)**: 防止异步异常未捕获导致数据丢失或流程中断
- **schema_version**: 1
- **embedding**: null

---

## 使用方式

1. **新项目启动**：读取此文件作为代码审查检查项；PM agent 通过 `meta-retriever.js` 按类别/关键词检索，挂载给相关专家。
2. **新错误发生**：按五步法记录到 `errors/raw/ERR-NNN.md`，提炼完成后在此追加 META 规则——**必须含类别/关联层/关联专家/触发关键词**，否则视为提炼未完成。
3. **索引重建**：规则变更后运行 `node src/scripts/meta-index.js <project>` 刷新 `.ai/errors/distilled/meta-index.json`。
4. **检索**：`node src/scripts/meta-retriever.js <project> "<问题描述>"` 返回最相关的 META 规则。
5. **复现检查**：若某 ERR 复现次数 >1，说明提炼不够，需回溯 raw 记录重新分析。
6. **跨项目传播**：将此文件复制到新项目的 `errors/distilled/` 即可继承防线。
7. **向量 RAG（预留）**：规则量达阈值（如 ≥30）后，可对「规则+语义摘要」生成 embedding 写入 `embedding` 字段，`meta-retriever.js` 自动切换向量检索，格式向前兼容。
