#!/usr/bin/env node
/**
 * meta-classify.js — META 规则分类建议
 *
 * 用法：node meta-classify.js [project-root] "<规则文本或错误描述>"
 * 输出：JSON（建议的 category / layer / applies_to / keywords / 候选）
 *
 * 供 G3 五步法提炼时辅助给 META 规则打分类标签（category 受控词表）。
 * 规则量少时用关键词分类，量多后可平滑切向量。零依赖。
 */

const projectRoot = process.argv[2] || process.cwd();
const text = process.argv[3] || '';

// category 受控词表（与 SKILL.md / meta-rules.md 一致）+ 关键词
const CATEGORY_KEYWORDS = {
  ASYNC: ['async', 'await', 'promise', '异步', 'then', 'catch', '回调', 'future'],
  CONCURRENCY: ['thread', 'mutex', 'race', '线程', '锁', '竞态', 'isr', '中断', 'dma', '并发', 'atomic', '信号槽', 'movetothread'],
  SECURITY: ['auth', 'login', 'sql', 'injection', 'xss', 'csrf', '鉴权', '认证', '加密', '密钥', '注入', '权限', '脱敏', 'owasp'],
  DATA_INTEGRITY: ['crc', 'checksum', 'protocol', 'frame', '校验', '协议', '帧', '粘包', '分包', '序列化'],
  DEPENDENCY: ['依赖', 'import', 'require', '耦合', '循环依赖'],
  LAYERING: ['架构', '分层', 'layer', 'architecture', '七层', '单向依赖', '关注点分离', 'refactor', '重构'],
  API_CONTRACT: ['api', 'rest', 'graphql', '接口', 'endpoint', 'schema', '契约', 'openapi'],
  ERROR_HANDLING: ['错误', '异常', 'error', 'exception', 'try', '失败', '容错', '降级'],
  TESTING: ['test', '测试', 'unit', 'integration', 'mock', 'coverage', '覆盖率', '回归'],
  PERFORMANCE: ['性能', 'perf', 'slow', '优化', 'optimize', 'latency', '延迟', '缓存', 'cache', '内存'],
  BUILD: ['build', '编译', 'compile', 'cmake', 'make', '链接', 'linker', '打包'],
  STATE_MGMT: ['状态', 'state', 'workstate', '持久化', 'persist', '上下文', 'context']
};

const CATEGORY_LAYER = {
  ASYNC: ['core', 'interface'], CONCURRENCY: ['core', 'interface'],
  SECURITY: ['interface', 'core'], DATA_INTEGRITY: ['interface', 'core'],
  DEPENDENCY: ['core', 'shared'], LAYERING: ['coordination'],
  API_CONTRACT: ['interface'], ERROR_HANDLING: ['core', 'interface', 'shared'],
  TESTING: ['testing'], PERFORMANCE: ['core', 'shared'],
  BUILD: ['shared'], STATE_MGMT: ['coordination']
};

const CATEGORY_EXPERTS = {
  ASYNC: ['embedded-firmware-engineer', 'pc-host-engineer', 'backend-architect'],
  CONCURRENCY: ['embedded-firmware-engineer', 'pc-host-engineer', 'backend-architect'],
  SECURITY: ['security-engineer', 'code-reviewer'],
  DATA_INTEGRITY: ['pc-host-engineer', 'embedded-firmware-engineer'],
  DEPENDENCY: ['software-architect'],
  LAYERING: ['software-architect', 'code-reviewer'],
  API_CONTRACT: ['backend-architect', 'software-architect'],
  ERROR_HANDLING: ['code-reviewer'],
  TESTING: ['tester'],
  PERFORMANCE: ['code-reviewer', 'embedded-firmware-engineer'],
  BUILD: ['devops-automator'],
  STATE_MGMT: ['software-architect']
};

function classify(text) {
  const t = (text || '').toLowerCase();
  const scores = {};
  const hitKw = {};
  Object.keys(CATEGORY_KEYWORDS).forEach(cat => {
    const hits = [];
    CATEGORY_KEYWORDS[cat].forEach(k => {
      if (t.indexOf(k.toLowerCase()) !== -1) hits.push(k);
    });
    if (hits.length) { scores[cat] = hits.length; hitKw[cat] = hits; }
  });

  const sorted = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
  const best = sorted[0];
  if (!best) {
    return {
      suggested_category: null, confidence: 'low',
      note: '未匹配到关键词，请人工归类（受控词表：' + Object.keys(CATEGORY_KEYWORDS).join(' | ') + '）',
      candidates: []
    };
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = scores[best] / total > 0.5 ? 'high' : 'medium';
  return {
    suggested_category: best,
    confidence,
    layer: CATEGORY_LAYER[best] || [],
    applies_to: CATEGORY_EXPERTS[best] || [],
    keywords: hitKw[best],
    candidates: sorted.slice(0, 3).map(c => ({ category: c, score: scores[c] }))
  };
}

console.log(JSON.stringify(Object.assign({ text }, classify(text)), null, 2));
