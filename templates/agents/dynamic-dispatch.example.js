/**
 * dynamic-dispatch.example.js —— 常驻 PM 的动态调度 workflowScript 模板（pi-subagents）
 *
 * 用法：PM（主会话）把本文件内容读出 → 注入 STAGE / TASKS → 通过 subagent 工具的
 * workflowScript（或 workflowScriptPath）启动。一次顶层调用，子代理只在脚本内启动。
 *
 * 固定前缀（勿改）：pi-dynamic-workflows
 *   - lane key = pi-dynamic-workflows:<stage>:<T-NNN>
 *   - 常驻命名 agent = pi-dynamic-workflows-pm
 *
 * 沙箱约束：脚本内无文件系统/shell，任务数据必须由 PM 注入（读取 todo.md/REQ 后 bake 进来）。
 */

// ---- PM 注入区（替换下面两个占位）----
const NAMESPACE = "pi-dynamic-workflows"; // 固定前缀，勿改
const STAGE = "__STAGE__"; // 例: "s1"
const TASKS = [
	// 例: { id: "T-001", desc: "搭建仓库骨架", issue: 12, plan: "docs/plans/PLAN-001-xxx.md" },
];

// ---- 动态调度：阶段=lane（可并行），任务=lane 内串行 stage（writer→reviewer）----
const key = (id) => `${NAMESPACE}:${STAGE}:${id}`;

const lanes = TASKS.map((t) => ({
	key: key(t.id),
	stages: [
		{
			key: "write",
			agent: "writer",
			task: [
				`[/go ${STAGE} 派发 · pi-dynamic-workflows]`,
				`任务: ${t.id} ${t.desc}`,
				t.issue ? `issue: #${t.issue}` : null,
				t.plan ? `计划: ${t.plan}` : null,
				`纪律: G2 写后同步（STRUCTURE/REQ/todo）；输出变更文件清单与测试结果。`,
			]
				.filter(Boolean)
				.join("\n"),
		},
		{
			key: "review",
			agent: "reviewer",
			task: `复核 ${t.id}：G2 同步完整性、依赖方向（shared←core←interface←presentation）、测试可跑；structuredOutput.verdict = approved|blocked`,
			resume: "previous",
		},
	],
}));

const board = await runs.lanes(lanes);

// lane 完成即返回，PM 据此动态续派下一批 / 回写 todo / close-done
return {
	namespace: NAMESPACE,
	stage: STAGE,
	dispatched: TASKS.map((t) => t.id),
	board,
};
