#!/usr/bin/env node
/**
 * meta-index.js — 扫描 META 规则仓库生成 meta-index.json（机器可读索引）
 *
 * v2：支持分类目录结构（C:\.ai_meta/rules/<CAT>/META-NNN.md 多文件）
 * v1：兼容旧版单文件 meta-rules.md
 * 本地：兼容项目级 .ai/errors/distilled/meta-rules.md
 *
 * 用法：node meta-index.js [project-root]
 * 输出：JSON（同时写入解析到的对应 indexPath）
 *
 * 解析每条规则的结构化字段（category/layer/applies_to/keywords/semantic_summary/rule），
 * 供 meta-retriever.js 检索。零依赖。
 */

const fs = require('fs');
const path = require('path');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
const { resolveMetaSource, CATEGORIES } = require('./lib/meta-paths');
const src = resolveMetaSource(projectRoot);

const result = {
  schema_version: 2,
  scope: src.scope,
  generated_from: null,
  generated_at: new Date().toISOString(),
  rules: [],
  errors: []
};

// ===== v2 分类目录扫描 =====
function scanV2(rulesDir) {
  let count = 0;
  CATEGORIES.forEach(cat => {
    const catDir = path.join(rulesDir, cat);
    if (!fs.existsSync(catDir)) return;
    const files = fs.readdirSync(catDir).filter(f => /^META-\d+\.md$/.test(f));
    files.forEach(f => {
      const fp = path.join(catDir, f);
      try {
        const content = fs.readFileSync(fp, 'utf-8');
        const rule = parseRuleFile(content, f.replace(/\.md$/, ''), cat);
        if (rule) { result.rules.push(rule); count++; }
      } catch (e) {
        result.errors.push(`解析失败 ${cat}/${f}: ${e.message}`);
      }
    });
  });
  return count;
}

// ===== v1 / 本地：单文件解析（向后兼容）=====
function scanSingleFile(metaPath) {
  if (!fs.existsSync(metaPath)) return 0;
  const content = fs.readFileSync(metaPath, 'utf-8');
  // 兼容 schema_version 注释
  const svMatch = content.match(/schema_version:\s*(\d+)/);
  result.schema_version = svMatch ? Math.max(parseInt(svMatch[1], 10), result.schema_version) : result.schema_version;

  const blocks = content.split(/^### /m).filter(b => /^META-/.test(b));
  blocks.forEach(block => {
    const lines = block.split('\n');
    const header = lines[0];
    const idMatch = header.match(/^(META-\d+-[A-Z_]+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    const title = header.replace(/^META-\d+-[A-Z_]+:\s*/, '').trim();
    const catField = fieldMatch(block, ['category', '类别']);
    const category = catField || id.split('-').slice(-1)[0];
    const rule = {
      id,
      title,
      category,
      layer: splitList(fieldMatch(block, ['layer', '关联层'])),
      applies_to: splitList(fieldMatch(block, ['applies_to', '关联专家'])),
      keywords: splitList(fieldMatch(block, ['keywords', '触发关键词'])),
      semantic_summary: fieldMatch(block, ['semantic_summary', '语义摘要']) || '',
      rule: fieldMatch(block, ['规则']) || '',
      source_err: fieldMatch(block, ['source_err', '源错误']) || '',
      embedding: null,
      _source: 'legacy-single-file'
    };
    result.rules.push(rule);
  });
  return result.rules.length;
}

// ===== 新格式：单文件 = 单规则（v2）=====
function parseRuleFile(content, idFromFilename, catFromDir) {
  // frontmatter（YAML）优先
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const fmObj = {};
  if (fm) {
    fm[1].split('\n').forEach(line => {
      const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
      if (m) fmObj[m[1]] = m[2].trim();
    });
  }

  // 标题：第一个 # 行
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : (fmObj.title || idFromFilename);

  // 字段：优先 frontmatter，其次正文 - **字段**: value
  const get = (keys) => fmObj[keys[0]] || fieldMatch(content, keys);

  return {
    id: fmObj.id || idFromFilename,
    title,
    category: get(['category', '类别']) || catFromDir,
    layer: splitList(get(['layer', '关联层'])),
    applies_to: splitList(get(['applies_to', '关联专家'])),
    keywords: splitList(get(['keywords', '触发关键词'])),
    semantic_summary: get(['semantic_summary', '语义摘要']) || '',
    rule: get(['规则']) || '',
    source_err: get(['source_err', '源错误']) || '',
    embedding: fmObj.embedding ? JSON.parse(fmObj.embedding) : null,
    _source: 'v2-categorized'
  };
}

// ===== 辅助函数 =====
function fieldMatch(block, keys) {
  for (const k of keys) {
    const re = new RegExp('-\\s*\\*{0,2}' + k + '(?:\\([\\w_ ]+\\))?\\*{0,2}\\s*:\\s*(.+)');
    const m = block.match(re);
    if (m) return m[1].trim();
  }
  return null;
}
function splitList(s) {
  if (!s) return [];
  return s.split(/[,，]/).map(x => x.replace(/^[\s\-•]+/, '').trim()).filter(Boolean);
}

// ===== 主流程 =====
let written_to = null;
if (src.scope === 'global-v2') {
  result.generated_from = 'rules/';
  const n = scanV2(src.rulesDir);
  if (n === 0) result.errors.push('rules/ 目录存在但无规则文件');
  written_to = src.indexPath;
} else if (src.scope === 'global-v1') {
  result.generated_from = 'meta-rules.md (v1 兼容)';
  scanSingleFile(src.metaPath);
  written_to = src.indexPath;
} else {
  // local
  if (!fs.existsSync(src.metaPath)) {
    result.errors.push('meta-rules.md 不存在（项目未启用 ai-coordination？）');
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  }
  result.generated_from = 'local meta-rules.md';
  scanSingleFile(src.metaPath);
  written_to = src.indexPath;
}

// 写入 index 文件
if (written_to) {
  fs.mkdirSync(path.dirname(written_to), { recursive: true });
  fs.writeFileSync(written_to, JSON.stringify(result, null, 2));
}

console.log(JSON.stringify({
  ok: true,
  scope: result.scope,
  total_rules: result.rules.length,
  categories_present: [...new Set(result.rules.map(r => r.category))],
  written_to,
  errors: result.errors
}, null, 2));
