#!/usr/bin/env node
/**
 * meta-retriever.js — META 规则检索（渐进式 RAG）
 *
 * 用法：node meta-retriever.js [project-root] "<query>" [top_k]
 * 输出：JSON，命中的 META 规则（按相关度排序）
 *
 * 检索策略（统一 Retriever 接口 retrieve(query, top_k)）：
 *   - KeywordClassifierRetriever（默认）：关键词 + 类别 + 关联层/专家 加权匹配
 *   - VectorRetriever（预留）：当 index 的 embedding 字段非空时启用余弦相似度
 *
 * 设计原则：阶段1 零依赖关键词索引；规则量达阈值后可由外部离线脚本生成
 * embedding 写入 meta-index.json，本脚本自动切换向量档，主流程不引入运行时依赖。
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
const query = process.argv[3] || '';
const topK = parseInt(process.argv[4], 10) || 5;

const { resolveMetaSource } = require('./lib/meta-paths');
const indexPath = resolveMetaSource(projectRoot).indexPath;

// 统一接口：retrieve(query, topK) -> [{id, score, ...}]
class KeywordClassifierRetriever {
  constructor(index) { this.index = index; }

  retrieve(query, topK) {
    const q = (query || '').toLowerCase();
    const qTerms = tokenize(query);

    const scored = this.index.rules.map(rule => {
      let score = 0;
      const lowerKeywords = (rule.keywords || []).map(k => k.toLowerCase());

      // 1) keyword 被 query 包含（适配中文长句：query 出现关键词即命中）
      lowerKeywords.forEach(k => {
        if (k && q.indexOf(k) !== -1) score += 3;
      });
      // 2) query 分词 token 精确命中 keyword（英文友好）
      qTerms.forEach(t => {
        if (t && lowerKeywords.indexOf(t) !== -1) score += 2;
      });
      // 3) 类别命中
      const cat = (rule.category || '').toLowerCase();
      if (cat && q.indexOf(cat) !== -1) score += 1;

      return Object.assign({}, rule, { score });
    });

    return scored
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

// 预留：向量检索（当 embedding 字段可用时启用）
class VectorRetriever {
  constructor(index) { this.index = index; }

  isAvailable() {
    return (this.index.rules || []).some(r => Array.isArray(r.embedding) && r.embedding.length);
  }

  retrieve(/* query, topK */) {
    // 未实现：需外部 embedding（离线生成）+ 查询向量化 + 余弦相似度。
    // 当前返回 null，由调用方降级到 KeywordClassifierRetriever。
    return null;
  }
}

function tokenize(s) {
  return (s || '').toLowerCase().split(/[\s,，;；:：()\[\]{}|/\\]+/).filter(Boolean);
}

function retrieve(query, topK) {
  if (!fs.existsSync(indexPath)) {
    return {
      error: 'meta-index.json 不存在，请先运行: node src/scripts/meta-index.js ' + projectRoot,
      hits: []
    };
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  // 优先向量档（若可用）
  const vr = new VectorRetriever(index);
  if (vr.isAvailable()) {
    const vHits = vr.retrieve(query, topK);
    if (vHits) return { mode: 'vector', query, top_k: topK, hits: vHits };
  }

  // 默认关键词档
  const kr = new KeywordClassifierRetriever(index);
  const hits = kr.retrieve(query, topK);
  return {
    mode: 'keyword',
    query,
    top_k: topK,
    total_rules: (index.rules || []).length,
    hits
  };
}

console.log(JSON.stringify(retrieve(query, topK), null, 2));
