# STRUCTURE.md — 七层结构地图

> G2 同步对象：每次新增/移动/删除文件或模块后，先跑通层测试，再更新本文件。
> pi 会话内使用 `ls`/`find` 可随时校验本地图与实际目录的一致性。

## 布局总览

<!-- 七层：coordination 协调 / presentation 表示 / interface 接口 / core 核心 / shared 共享 / testing 测试 / docs 文档 -->

```
<项目根>/
├── AGENTS.md            # 运行时规范（pi 自动加载）
├── todo.md              # 任务事实源
├── docs/                # 第7层 文档层
│   └── plans/           # /plan 产出的阶段计划
├── .ai/                 # 第1层 协调层（框架数据，不含业务代码）
├── src/
│   ├── presentation/    # 第2层 表示层（UI/渲染，只依赖 interface）
│   ├── interface/       # 第3层 接口层（对内服务契约/对外 API，依赖 core）
│   ├── core/            # 第4层 核心层（业务逻辑，只依赖 shared）
│   └── shared/          # 第5层 共享层（纯函数/类型/常量，零依赖）
└── testing/             # 第6层 测试层（单元→集成→E2E→回放）
```

## 依赖铁律

- shared 不依赖任何层
- core 只依赖 shared
- interface 依赖 core（可含 shared）
- presentation 依赖 interface（禁止直插 core）
- testing 可依赖全部；docs 依赖一切但只做描述

## 模块清单

| 路径 | 职责 | 上游依赖 | 负责层 | 状态 |
| --- | --- | --- | --- | --- |
| （示例）src/shared/types/ | 全局类型定义 | 无 | shared | 规划中 |
