#!/usr/bin/env node
/**
 * meta-index.js — 扫描 meta-rules.md 生成 meta-index.json（机器可读索引）
 *
 * 用法：node meta-index.js [project-root]
 * 输出：JSON（同时写入 .ai/errors/distilled/meta-index.json）
 *
 * 解析每条 `### META-NNN-CATEGORY: 标题` 规则的结构化字段，供 meta-retriever.js
 * 检索使用，避免 LLM 每次读全文。零依赖。
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
const { resolveMetaSource } = require('./lib/meta-paths');
const src = resolveMetaSource(projectRoot);
const metaPath = src.metaPath;
const outPath = src.indexPath;

const result = { schema_version: 1, scope: src.scope, generated_from: null, rules: [], errors: [] };

if (!fs.existsSync(metaPath)) {
  result.errors.push('meta-rules.md 不存在（项目未启用 ai-coordination？）');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const content = fs.readFileSync(metaPath, 'utf-8');
result.generated_from = 'meta-rules.md';

// 顶部 schema_version 注释
const svMatch = content.match(/schema_version:\s*(\d+)/);
result.schema_version = svMatch ? parseInt(svMatch[1], 10) : 1;

// 按 `### ` 分块，只取 META- 开头
const blocks = content.split(/^### /m).filter(b => /^META-/.test(b));

blocks.forEach(block => {
  const lines = block.split('\n');
  const header = lines[0]; // META-001-ASYNC: 标题
  const idMatch = header.match(/^(META-\d+-[A-Z_]+)/);
  if (!idMatch) return;
  const id = idMatch[1];
  const title = header.replace(/^META-\d+-[A-Z_]+:\s*/, '').trim();

  // category：优先字段，否则从 id 后缀推断
  const catField = fieldMatch(block, ['category', '类别']);
  const category = catField || id.split('-').slice(-1)[0];

  const layer = fieldMatch(block, ['layer', '关联层']);
  const appliesTo = fieldMatch(block, ['applies_to', '关联专家']);
  const keywords = fieldMatch(block, ['keywords', '触发关键词']);
  const semantic = fieldMatch(block, ['semantic_summary', '语义摘要']);
  const rule = fieldMatch(block, ['规则']);

  result.rules.push({
    id,
    title,
    category,
    layer: splitList(layer),
    applies_to: splitList(appliesTo),
    keywords: splitList(keywords),
    semantic_summary: semantic || '',
    rule: rule || '',
    embedding: null // 预留：未来向量层填充
  });
});

// 写入 index 文件
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

console.log(JSON.stringify({ ...result, written_to: outPath }, null, 2));

// --- 辅助函数 ---

// 匹配 `- **key**: value` 或 `- **中文(english)**: value` 等变体
function fieldMatch(block, keys) {
  for (const k of keys) {
    const re = new RegExp('-\\s*\\*{0,2}' + k + '(?:\\([\\w_ ]+\\))?\\*{0,2}\\s*:\\s*(.+)');
    const m = block.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

// 逗号分隔列表 → 数组（去掉前导 - 等杂符）
function splitList(s) {
  if (!s) return [];
  return s.split(/[,，]/).map(x => x.replace(/^[\s\-•]+/, '').trim()).filter(Boolean);
}
