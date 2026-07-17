# 任务表（PM 维护）

> 开发者通过 `/ai:pm` 提需求 → PM 归类写入此表 → 专家按分配执行，互不干扰。
> PM 用 `tasks.js` 维护；专家读取自己负责的任务（`@expert`）。

## 待办（pending）

<!-- PM 归类后追加，格式：- [ ] TASK-NNN [CATEGORY] 描述 @expert -->

## 进行中（doing）

<!-- 专家认领 / PM 调度后移入：- [~] TASK-NNN ... -->

## 完成（done）

<!-- 完成后归档：- [x] TASK-NNN ... -->
