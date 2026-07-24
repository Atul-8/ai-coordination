#!/usr/bin/env node
/**
 * pm-dispatch.js — PM 调度链建议
 *
 * 用法：node pm-dispatch.js [project-root] "<task-desc>"
 * 输出：JSON（建议的专家调度链 + 应挂载的 META 规则子集 + 编排模式）
 *
 * 流程：任务关键词 → 推断类别 → 映射专家 → 过滤 registry 可用 → 结合 meta-retriever 命中
 * PM 读此 JSON 决定 Agent 工具调用顺序（默认顺序委派）。零依赖（调 meta-retriever.js 用 child_process）。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
const task = process.argv[3] || '';
const registryPath = path.join(projectRoot, '.ai', 'agents', 'registry.json');
const scriptDir = __dirname;

// 类别 → 候选专家
const CATEGORY_TO_AGENTS = {
  ASYNC: ['embedded-firmware-engineer', 'pc-host-engineer', 'backend-architect'],
  CONCURRENCY: ['embedded-firmware-engineer', 'pc-host-engineer', 'backend-architect'],
  DATA_INTEGRITY: ['pc-host-engineer', 'embedded-firmware-engineer'],
  SECURITY: ['security-engineer', 'code-reviewer'],
  API_CONTRACT: ['backend-architect', 'frontend-developer', 'software-architect'],
  TESTING: ['tester'],
  LAYERING: ['software-architect', 'code-reviewer'],
  DEPENDENCY: ['software-architect'],
  ERROR_HANDLING: ['code-reviewer'],
  PERFORMANCE: ['code-reviewer', 'embedded-firmware-engineer']
};

// 任务关键词 → 推断类别
const TASK_KEYWORDS = [
  { cat: 'ASYNC', kw: ['async', 'await', 'promise', '异步'] },
  { cat: 'CONCURRENCY', kw: ['thread', 'mutex', 'race', '线程', '锁', '竞态', 'isr', '中断', 'dma', 'signal slot', '信号槽'] },
  { cat: 'SECURITY', kw: ['auth', 'login', 'sql', 'injection', 'xss', '鉴权', '认证', '加密', '密钥', '输入校验'] },
  { cat: 'DATA_INTEGRITY', kw: ['crc', 'checksum', 'protocol', 'frame', '校验', '协议', '帧', '粘包'] },
  { cat: 'TESTING', kw: ['test', '测试', 'unit', 'integration', 'coverage', '覆盖率'] },
  { cat: 'API_CONTRACT', kw: ['api', 'rest', 'graphql', '接口', 'endpoint', 'schema'] },
  { cat: 'LAYERING', kw: ['architecture', 'layer', 'refactor', '架构', '分层', '重构', '依赖'] },
  { cat: 'PERFORMANCE', kw: ['perf', 'slow', 'optimize', '性能', '优化', 'latency', '延迟'] }
];

function loadRegistry() {
  if (!fs.existsSync(registryPath)) return [];
  try { return JSON.parse(fs.readFileSync(registryPath, 'utf-8')).agents || []; } catch (e) { return []; }
}

function inferCategories(task) {
  const t = (task || '').toLowerCase();
  const cats = new Set();
  TASK_KEYWORDS.forEach(c => {
    if (c.kw.some(k => t.indexOf(k.toLowerCase()) !== -1)) cats.add(c.cat);
  });
  return Array.from(cats);
}

function retrieveMeta(query) {
  try {
    const safe = query.replace(/"/g, '\\"');
    const out = execSync(`node "${path.join(scriptDir, 'meta-retriever.js')}" "${projectRoot}" "${safe}" 5`, { encoding: 'utf-8' });
    return JSON.parse(out);
  } catch (e) { return { hits: [] }; }
}

const agents = loadRegistry();
const categories = inferCategories(task);
const metaRes = retrieveMeta(task);

const suggestedSet = new Set();
categories.forEach(cat => (CATEGORY_TO_AGENTS[cat] || []).forEach(a => suggestedSet.add(a)));
metaRes.hits.forEach(h => (h.applies_to || []).forEach(a => suggestedSet.add(a)));

const availableNames = new Set(agents.map(a => a.name));
const suggested = Array.from(suggestedSet).map(n => {
  const reg = agents.find(a => a.name === n);
  return {
    name: n,
    in_registry: availableNames.has(n),
    lifecycle: reg ? reg.lifecycle : null,
    active: reg ? reg.active : null,
    needs_activate: reg ? (reg.lifecycle === 'on-demand' && !reg.active) : false
  };
});

// 调度顺序：实现类 → tester → 审查类
const RANK = { 'embedded-firmware-engineer': 1, 'pc-host-engineer': 1, 'backend-architect': 1, 'frontend-developer': 1, 'software-architect': 1 };
function order(chain) {
  const impl = chain.filter(a => RANK[a.name]);
  const testers = chain.filter(a => a.name === 'tester');
  const reviewers = chain.filter(a => a.name === 'code-reviewer' || a.name === 'security-engineer');
  return impl.concat(testers, reviewers);
}

const result = {
  task,
  inferred_categories: categories,
  suggested_chain: order(suggested),
  meta_rules: (metaRes.hits || []).map(h => ({ id: h.id, category: h.category, score: h.score, rule: h.rule })),
  orchestration: '顺序委派：实现专家 →(完成)→ tester →(缺陷回流)→ 实现专家修改 → code-reviewer/security 复核 → 提炼 META',
  notes: []
};
if (agents.length === 0) result.notes.push('registry 为空，请先 /ai:init 或手动 add agent');
suggested.filter(a => !a.in_registry).forEach(a => result.notes.push(`专家 ${a.name} 不在 registry，可 /ai:fetch 拉取或手动添加`));

console.log(JSON.stringify(result, null, 2));
