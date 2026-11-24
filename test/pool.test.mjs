import test from "node:test";
import assert from "node:assert/strict";
import * as P from "../src/pool.js";

const TAXONOMY = `version: 1
nodes:
  - id: process
    aliases: ["流程", "阶段"]
  - id: implement
    parents: [process]
    aliases: ["实现", "编码"]
  - id: review
    parents: [process]
    aliases: ["复核", "审查"]
`;

const CARD_TEXT = `---
id: "writer"
type: "process-role"
name: "Writer（实现者）"
summary: "按任务卡实现，先红后绿。"
description: "按任务卡实现，先红后绿。"
taxonomy: ["process.implement"]
keywords: ["实现", "编码", "任务卡"]
scope:
  do: ["按卡实现", "层测试红→绿"]
  dont: ["顺手重构"]
status: "active"
first_mission: "done"
version: 2
---
# 角色卡 · writer
`;

test("parseFrontMatter 解析限定 YAML 子集", () => {
	const fm = P.parseFrontMatter(CARD_TEXT);
	assert.equal(fm.id, "writer");
	assert.equal(fm.type, "process-role");
	assert.deepEqual(fm.taxonomy, ["process.implement"]);
	assert.deepEqual(fm.keywords, ["实现", "编码", "任务卡"]);
	assert.deepEqual(fm.scope.do, ["按卡实现", "层测试红→绿"]);
	assert.deepEqual(fm.scope.dont, ["顺手重构"]);
	assert.equal(fm.version, 2);
	assert.equal(fm.first_mission, "done");
});

test("parseTaxonomy + validateTaxonomyPath", () => {
	const taxonomy = P.parseTaxonomy(TAXONOMY);
	assert.equal(taxonomy.nodes.length, 3);
	assert.equal(P.validateTaxonomyPath(taxonomy, "process.implement"), null);
	assert.match(P.validateTaxonomyPath(taxonomy, "process.nope"), /未知节点/);
	assert.match(P.validateTaxonomyPath(taxonomy, "implement.process"), /邻接断裂/);
});

test("validateCard 拒绝万金油/缺 keywords/scope", () => {
	const taxonomy = P.parseTaxonomy(TAXONOMY);
	const good = {
		id: "writer",
		type: "process-role",
		name: "Writer",
		summary: "实现任务卡",
		taxonomy: ["process.implement"],
		keywords: ["实现", "编码", "任务卡"],
		scope: { do: ["按卡实现"], dont: ["顺手重构"] },
		status: "active",
		first_mission: "pending",
	};
	assert.deepEqual(P.validateCard(good, taxonomy), []);
	assert.match(P.validateCard({ ...good, summary: "通用万能角色" }, taxonomy).join("\n"), /禁用词/);
	assert.match(P.validateCard({ ...good, keywords: ["实现"] }, taxonomy).join("\n"), /keywords 不足 3 个/);
	assert.match(P.validateCard({ ...good, scope: { do: ["x"], dont: [] } }, taxonomy).join("\n"), /scope.dont 至少 1 条/);
});

test("tokenize + scoreCard 命中与 dont 减分", () => {
	const taxonomy = P.parseTaxonomy(TAXONOMY);
	const card = P.parseFrontMatter(CARD_TEXT);
	const tokens = P.tokenize("实现一个任务卡：按卡实现");
	assert.ok(tokens.includes("实现"));
	const score = P.scoreCard(card, taxonomy, tokens);
	assert.ok(score >= 6, `score=${score}`);
	const negative = P.scoreCard(card, taxonomy, P.tokenize("顺手重构"));
	assert.ok(negative < 0, `negative=${negative}`);
});

test("buildIdf 降低通用词权重，避免「测试/实现」抢路由", () => {
	const cards = [
		{ name: "a", keywords: ["测试", "实现"], scope: { do: ["测试 实现"] } },
		{ name: "b", keywords: ["测试", "编码"], scope: { do: ["测试 编码"] } },
		{ name: "c", keywords: ["IMU", "标定"], scope: { do: ["IMU 标定"] } },
	];
	const idf = P.buildIdf(cards);
	assert.ok(idf("IMU") > idf("测试"), `idf(IMU)=${idf("IMU")} idf(测试)=${idf("测试")}`);
	const tokens = P.tokenize("IMU 测试");
	const imuCard = { ...cards[2], taxonomy: [], scope: { do: ["IMU 标定"], dont: [] } };
	const testCard = { ...cards[0], taxonomy: [], scope: { do: ["测试 实现"], dont: [] } };
	const imuScore = P.scoreCard(imuCard, { nodes: [] }, tokens, idf);
	const testScore = P.scoreCard(testCard, { nodes: [] }, tokens, idf);
	assert.ok(imuScore > testScore, `imu=${imuScore} test=${testScore}`);
});

test("serializeCard 可被 parseFrontMatter 回读", () => {
	const card = {
		id: "tester",
		type: "process-role",
		name: "Tester",
		summary: "补测试",
		taxonomy: ["process.implement"],
		keywords: ["测试", "单测", "回归"],
		scope: { do: ["补层测试"], dont: ["改实现"] },
		status: "active",
		first_mission: "pending",
		version: 1,
		created: "2026-01-01",
	};
	const text = P.serializeCard(card, P.defaultCardBody(card));
	const fm = P.parseFrontMatter(text);
	assert.equal(fm.id, "tester");
	assert.deepEqual(fm.scope.do, ["补层测试"]);
	assert.match(text, /## 职责/);
});