# agents/ — AI 专家接入管理

本目录是 ai-coordination「调度编排层」的种子资源，随插件分发。

## 内容

- `pm.md` — 项目经理（常驻，编排中枢）
- `embedded-firmware-engineer.md` / `pc-host-engineer.md` — 嵌入式 / 上位机专家种子
- `tester.md` / `security-engineer.md` — 事件触发型按需专家
- `code-reviewer.md` / `software-architect.md` — 通用专家
- `registry.json` — agent 注册表模板（`/ai:init` 时复制到项目 `.ai/agents/`）
- `ROSTER.md` — 驻场名单模板

## agent 文件格式（Claude Code 原生 subagent）

    ---
    name: <kebab-case-slug>
    description: <中文名>. <专长>. <何时由 PM 调度>.
    memory: project
    tools: Read, Write, Edit, Glob, Grep, Bash
    ---
    正文：身份 / 关键规则 / 工作流程 / 挂载的 META 规则

## 双生命周期

- **resident**：安装到 `.claude/agents/`，Claude Code 自动可发现可调度
- **on-demand**：暂存 `.ai/agents/stash/`，PM 调度前 `agent-registry.js activate <name>` 上线（几秒热重载）

## 三级来源（优先级递减）

1. 项目级 `.ai/agents/`
2. 用户全局 `~/.ai-coordination/agents/`（本地统一管理仓库）
3. 远程 `agency-agents-zh`（`/ai:fetch` 按需拉取，缓存到全局）

## 与 G1-G4 的关系

专家 subagent 继承铁律；PM（`pm.md`）是默认编排入口。启用 PM 见 SKILL.md 的 G0 路由（可选、向后兼容）。

## 按需拉取更多专家

    /ai:fetch agency-agents-zh:engineering/engineering-backend-architect.md

拉取会自动做框架封装（slug 化 name、剥除 emoji/color、注入框架意识前导、加 `memory: project`），缓存到全局仓库并登记到 registry。
