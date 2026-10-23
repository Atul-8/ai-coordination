/**
 * global-agents.test.mjs — 全局思维架构部署器测试（~/.zcode/AGENTS.md 幂等插桩）
 */

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deployGlobalAgents, GLOBAL_AGENTS_MARKER_BEGIN, GLOBAL_AGENTS_MARKER_END } from "../scripts/global-agents.mjs";

const TEMPLATE = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "global", "agents-zcode.md"),
	"utf-8",
);

function makeDir() {
	return mkdtempSync(join(tmpdir(), "coord-global-"));
}

test("模板即 pi 全局思维架构的同构移植：9 节纪律齐全，宿主专属引用已适配", () => {
	for (const section of [
		"云端提交：全部脱敏",
		"平台 token：存放与使用",
		"跨目录权限分级（T0 / T1 / T2）",
		"模型纪律：仅限用户手动切换",
		"汇报真实性（禁止幻觉反馈",
		"链路优先与最小验证",
		"错误沉淀：犯错/踩坑/被批评",
		"池子位置",
		"全局池是**公共仓**",
	]) {
		assert.ok(TEMPLATE.includes(section), `缺少小节：${section}`);
	}
	assert.ok(!TEMPLATE.includes("pi 会话"), "不应残留 pi 会话措辞");
	assert.ok(TEMPLATE.includes("~/.zcode/AGENTS.md"), "声明 ZCode 全局指令位");
});

test("文件不存在 → 整文件写入（带标记）", () => {
	const dir = makeDir();
	try {
		const r = deployGlobalAgents({ zcodeDir: dir, templateContent: TEMPLATE });
		assert.equal(r.action, "created");
		const text = readFileSync(join(dir, "AGENTS.md"), "utf-8");
		assert.ok(text.includes(GLOBAL_AGENTS_MARKER_BEGIN));
		assert.ok(text.includes(GLOBAL_AGENTS_MARKER_END));
		assert.ok(text.includes("汇报真实性"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("内容相同 → current（幂等跳过，不重写）", () => {
	const dir = makeDir();
	try {
		deployGlobalAgents({ zcodeDir: dir, templateContent: TEMPLATE });
		const before = readFileSync(join(dir, "AGENTS.md"), "utf-8");
		const r = deployGlobalAgents({ zcodeDir: dir, templateContent: TEMPLATE });
		assert.equal(r.action, "current");
		assert.equal(readFileSync(join(dir, "AGENTS.md"), "utf-8"), before);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("标记块内容演进 → updated 原位替换，块外用户内容保留", () => {
	const dir = makeDir();
	try {
		deployGlobalAgents({ zcodeDir: dir, templateContent: TEMPLATE });
		const userNote = "\n# 我自己的补充\n\n- 用户手写规则，不许被部署器吃掉\n";
		const target = join(dir, "AGENTS.md");
		writeFileSync(target, readFileSync(target, "utf-8") + userNote, "utf-8");

		const evolved = TEMPLATE + "\n## 10. 新增规则（演练）\n\n- 新纪律条目\n";
		const r = deployGlobalAgents({ zcodeDir: dir, templateContent: evolved });
		assert.equal(r.action, "updated");

		const text = readFileSync(target, "utf-8");
		assert.ok(text.includes("新增规则（演练）"));
		assert.equal((text.match(new RegExp(GLOBAL_AGENTS_MARKER_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")) || []).length, 1, "仅一个标记块");
		assert.ok(text.includes("用户手写规则，不许被部署器吃掉"), "块外内容保留");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("已有用户文件（无标记）→ wrapped 前置合并", () => {
	const dir = makeDir();
	try {
		const target = join(dir, "AGENTS.md");
		writeFileSync(target, "# 用户自有全局指令\n\n- 已有规则\n", "utf-8");
		const r = deployGlobalAgents({ zcodeDir: dir, templateContent: TEMPLATE });
		assert.equal(r.action, "wrapped");
		const text = readFileSync(target, "utf-8");
		assert.ok(text.indexOf(GLOBAL_AGENTS_MARKER_BEGIN) < text.indexOf("# 用户自有全局指令"), "插桩块在前");
		assert.ok(text.includes("已有规则"));
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
