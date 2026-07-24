#!/usr/bin/env node
/**
 * meta-persist.js — PA 主武器：META 规则入库（消费者）
 *
 * 把 .ai/pa-inbox/ 中的消息按 category 分类、查重、编号、写入全局仓库
 * C:\.ai_meta/rules/<CATEGORY>/META-NNN.md（每条规则独立文件），然后 ACK 删除消息。
 *
 * 用法：
 *   drain            <project>                    循环消费 inbox 直到空（PA 主路径）
 *   process-one      <project> [MSG-filename]     处理一条（不指定则取最早一条）
 *   next-id          <project>                    查询下一个可用 META-NNN（含 git pull 防冲突）
 *   migrate-legacy   <project>                    把老 .ai/errors/distilled/meta-rules.md 拆分迁移到全局
 *
 * 流程（每条消息）：
 *   1. 读消息 → meta-classify 复核 category（不盲信生产者建议）
 *   2. meta-retriever 查重（命���则 merge / supersede / skip）
 *   3. 分配 META-NNN（全局最大+1）
 *   4. 写入 rules/<CATEGORY>/META-NNN.md
 *   5. ACK = 删除消息
 *   6. 处理失败 → pa-inbox fail 标记，不删
 *
 * 输出：JSON。零依赖。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const action = process.argv[3] || 'drain';
const msgArg = process.argv[4];

const {
  GLOBAL_META_DIR, CATEGORIES,
  globalRulesDir, globalRuleFile, globalIndexMdPath,
  ensureGlobalMeta, inboxDir
} = require('./lib/meta-paths');

// ===== 工具 =====
function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { return fallback; }
}

// 复用 meta-classify.js（子进程）
function classify(text) {
  try {
    const out = execSync(
      `node "${path.join(__dirname, 'meta-classify.js')}" "${projectRoot}" "${String(text).replace(/"/g, '\\"').slice(0, 500)}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return JSON.parse(out);
  } catch (e) { return { suggested_category: null, confidence: 'error', error: e.message }; }
}

// 复用 meta-retriever.js（子进程）
function retrieve(query, topK) {
  try {
    const out = execSync(
      `node "${path.join(__dirname, 'meta-retriever.js')}" "${projectRoot}" "${String(query).replace(/"/g, '\\"').slice(0, 200)}" ${topK || 3}`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );
    return JSON.parse(out);
  } catch (e) { return { hits: [], error: e.message }; }
}

// 复用 meta-index.js（刷新索引）
function refreshIndex() {
  try {
    execSync(`node "${path.join(__dirname, 'meta-index.js')}" "${projectRoot}"`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return true;
  } catch (e) { return false; }
}

// 全局仓库 git pull（防编号冲突）
function gitPullGlobal() {
  if (!fs.existsSync(path.join(GLOBAL_META_DIR, '.git'))) return;
  try {
    execSync('git pull --rebase 2>&1 || true', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
  } catch (e) { /* 忽略 */ }
}

function gitCommitGlobal(msg) {
  if (!fs.existsSync(path.join(GLOBAL_META_DIR, '.git'))) return;
  try {
    execSync('git add -A', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
    execSync(`git commit -m "${msg.replace(/"/g, '\\"')}" 2>&1 || true`,
      { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
  } catch (e) { /* 忽略 */ }
}

// 扫描已有 META-NNN，返回下一个可用编号
function nextMetaId() {
  gitPullGlobal();
  const rulesDir = globalRulesDir();
  const nums = [];
  if (fs.existsSync(rulesDir)) {
    CATEGORIES.forEach(cat => {
      const catDir = path.join(rulesDir, cat);
      if (!fs.existsSync(catDir)) return;
      fs.readdirSync(catDir).forEach(f => {
        const m = f.match(/^META-(\d+)\.md$/);
        if (m) nums.push(parseInt(m[1], 10));
      });
    });
  }
  const max = nums.length ? Math.max.apply(null, nums) : 0;
  return 'META-' + String(max + 1).padStart(3, '0');
}

// 解析消息文件
function parseMessage(fp) {
  const content = fs.readFileSync(fp, 'utf-8');
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const fmObj = {};
  if (fm) {
    fm[1].split('\n').forEach(line => {
      const m = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
      if (m) fmObj[m[1]] = m[2].trim();
    });
  }
  // 提取正文 sections
  const ruleMatch = content.match(/## 规律草稿\s*\n([\s\S]*?)(?=\n## )/);
  const evidenceMatch = content.match(/## 证据[\s\S]*?\n([\s\S]*?)(?=\n---|\n>)/);
  return {
    from: fmObj.from,
    source_err: fmObj.source_err || '',
    suggested_category: (fmObj.suggested_category || '').toUpperCase(),
    layer: (fmObj.layer || '').replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean),
    keywords: (fmObj.keywords || '').replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean),
    rule_draft: ruleMatch ? ruleMatch[1].trim() : '',
    evidence: evidenceMatch ? evidenceMatch[1].trim() : '',
    raw: content
  };
}

// 查重：基于 retriever + 文本相似
function findDuplicate(msg, threshold) {
  threshold = threshold || 5;
  const query = (msg.rule_draft + ' ' + msg.keywords.join(' ')).slice(0, 200);
  const r = retrieve(query, 3);
  if (!r.hits || !r.hits.length) return null;
  const top = r.hits[0];
  if (top.score >= threshold) return top;
  return null;
}

// 生成规则文件内容（schema v2）
function renderRuleFile(id, cat, msg) {
  const layer = msg.layer.length ? msg.layer : ['unspecified'];
  const keywords = msg.keywords.length ? msg.keywords : ['general'];
  const appliesTo = inferAppliesTo(cat);
  const title = (msg.rule_draft.split('\n')[0] || id).replace(/^#+\s*/, '').slice(0, 80);

  return [
    '---',
    'id: ' + id,
    'category: ' + cat,
    'title: ' + JSON.stringify(title),
    'schema_version: 2',
    'embedding: null',
    '---',
    '',
    '# ' + id + ': ' + title,
    '',
    '- **规则**: ' + (msg.rule_draft.split('\n').filter(l => !l.startsWith('#'))[0] || title),
    '- **适用场景**: 见证据段落',
    '- **源错误**: ' + (msg.source_err || '_（无显式 ERR 关联）_'),
    '- **检查方式**: 待 PA / reviewer 补充（基于 keywords 在审查中检索）',
    '- **类别(category)**: ' + cat,
    '- **关联层(layer)**: ' + layer.join(', '),
    '- **关联专家(applies_to)**: ' + appliesTo.join(', '),
    '- **触发关键词(keywords)**: ' + keywords.join(', '),
    '- **语义摘要(semantic_summary)**: ' + title,
    '- **生产者(from)**: ' + (msg.from || 'unknown'),
    '- **入库时间**: ' + new Date().toISOString(),
    '',
    '## 完整规律草稿',
    '',
    msg.rule_draft || '_（空）_',
    '',
    '## 证据 / 上下文',
    '',
    msg.evidence || '_（空）_',
    ''
  ].join('\n');
}

// category → 推荐专家（与 meta-classify.js 的 CATEGORY_EXPERTS 对齐）
function inferAppliesTo(cat) {
  const map = {
    ASYNC: ['embedded-firmware-engineer', 'pc-host-engineer'],
    CONCURRENCY: ['embedded-firmware-engineer', 'pc-host-engineer'],
    SECURITY: ['security-engineer', 'code-reviewer'],
    DATA_INTEGRITY: ['pc-host-engineer', 'embedded-firmware-engineer'],
    DEPENDENCY: ['software-architect'],
    LAYERING: ['software-architect', 'code-reviewer'],
    API_CONTRACT: ['software-architect'],
    ERROR_HANDLING: ['code-reviewer'],
    TESTING: ['tester'],
    PERFORMANCE: ['code-reviewer', 'embedded-firmware-engineer'],
    BUILD: ['software-architect'],
    STATE_MGMT: ['software-architect', 'pm']
  };
  return map[cat] || ['code-reviewer'];
}

// 单条消息处理
function processMessage(msgFile) {
  const inbox = inboxDir(projectRoot);
  const fp = path.join(inbox, msgFile);
  if (!fs.existsSync(fp)) throw new Error('消息不存在: ' + msgFile);

  const msg = parseMessage(fp);

  // 1. 分类决策：生产者明确指定且在受控词表内 → 直接采纳（信任生产者上下文）
  //    生产者未指定 → 才跑 classify 辅助判定
  //    理由：classify 是纯关键词匹配，会因歧义词误判（如"协议"命中 DATA_INTEGRITY
  //    而非 LAYERING，见 META-005 分类错误事件）。生产者有完整上下文，应优先。
  let category = (msg.suggested_category || '').toUpperCase();
  let classifyUsed = false;
  if (!category || CATEGORIES.indexOf(category) === -1) {
    const cls = classify(msg.rule_draft + ' ' + msg.keywords.join(' '));
    classifyUsed = true;
    category = (cls.suggested_category || '').toUpperCase();
    if (CATEGORIES.indexOf(category) === -1) {
      execSync(`node "${path.join(__dirname, 'pa-inbox.js')}" "${projectRoot}" fail "${msgFile}" "category '${category}' 不在受控词表（classify ${cls.confidence}）"`,
        { stdio: 'pipe' });
      return { msg: msgFile, status: 'failed', reason: 'category 不在受控词表: ' + category };
    }
  }
  const clsInfo = classifyUsed ? '(classified)' : '(producer-suggested, trusted)';

  // 2. 查重
  const dup = findDuplicate(msg);
  if (dup) {
    // 命中：skip（简化策略——未来可支持 merge/supersede）
    execSync(`node "${path.join(__dirname, 'pa-inbox.js')}" "${projectRoot}" fail "${msgFile}" "与已有 ${dup.id} 重复（score=${dup.score}）"`,
      { stdio: 'pipe' });
    return { msg: msgFile, status: 'duplicate', duplicate_of: dup.id, score: dup.score };
  }

  // 3. 编号 + 写入
  const id = nextMetaId();
  const ruleFile = globalRuleFile(category, id);
  fs.mkdirSync(path.dirname(ruleFile), { recursive: true });
  fs.writeFileSync(ruleFile, renderRuleFile(id, category, msg));

  // 4. ACK
  execSync(`node "${path.join(__dirname, 'pa-inbox.js')}" "${projectRoot}" ack "${msgFile}"`,
    { stdio: 'pipe' });

  return {
    msg: msgFile,
    status: 'persisted',
    rule_id: id,
    category: category,
    category_source: clsInfo,
    rule_file: path.relative(projectRoot, ruleFile).replace(/\\/g, '/'),
    from: msg.from
  };
}

// 刷新 INDEX.md（人类可读导航）
function refreshIndexMd(results) {
  const indexPath = globalIndexMdPath();
  const rulesDir = globalRulesDir();
  const rows = [];
  CATEGORIES.forEach(cat => {
    const catDir = path.join(rulesDir, cat);
    if (!fs.existsSync(catDir)) return;
    fs.readdirSync(catDir).sort().forEach(f => {
      const m = f.match(/^META-(\d+)\.md$/);
      if (!m) return;
      const id = 'META-' + m[1];
      const content = fs.readFileSync(path.join(catDir, f), 'utf-8');
      const titleM = content.match(/^#\s+.+?:\s*(.+)$/m);
      const title = titleM ? titleM[1].trim() : id;
      const layerM = content.match(/关联层\(layer\)\*\*:\s*(.+)/);
      const srcM = content.match(/源错误\*\*:\s*(.+)/);
      rows.push(`| ${id} | ${cat} | ${layerM ? layerM[1].trim() : '-'} | ${title} | ${srcM ? srcM[1].trim() : '-'} |`);
    });
  });

  const md = [
    '# META 规则导航',
    '',
    '> 由 PA agent 自动重生成（meta-persist.js）。请勿手动编辑。',
    '生成时间：' + new Date().toISOString(),
    '',
    '## 规则总表',
    '',
    '| 编号 | 类别 | 关联层 | 规则摘要 | 源错误 |',
    '|------|------|--------|---------|--------|',
    rows.length ? rows.join('\n') : '| _(暂无规则)_ | | | | |',
    ''
  ].join('\n');
  fs.writeFileSync(indexPath, md);
}

// 迁移老 meta-rules.md（项目本地 or 全局旧版）→ 全局 v2 分类目录
function migrateLegacy() {
  const candidates = [
    path.join(projectRoot, '.ai', 'errors', 'distilled', 'meta-rules.md'),
    path.join(GLOBAL_META_DIR, 'meta-rules.md')
  ];
  const src = candidates.find(p => fs.existsSync(p));
  if (!src) return { ok: false, error: '未找到旧 meta-rules.md', checked: candidates };

  ensureGlobalMeta(); // 确保全局 v2 结构已初始化
  const content = fs.readFileSync(src, 'utf-8');
  const blocks = content.split(/^### /m).filter(b => /^META-/.test(b));
  const migrated = [];

  blocks.forEach(block => {
    const lines = block.split('\n');
    const header = lines[0];
    const idMatch = header.match(/^(META-\d+)/);
    if (!idMatch) return;
    const id = idMatch[1];
    const catField = block.match(/类别\(category\)\*\*:\s*(.+)/);
    const cat = catField ? catField[1].trim().toUpperCase() : 'UNCATEGORIZED';
    if (CATEGORIES.indexOf(cat) === -1) return;

    const title = header.replace(/^META-\d+-[A-Z_]+:\s*/, '').trim();
    const targetFile = globalRuleFile(cat, id);

    // 转换为 v2 单文件格式：frontmatter + # 标题（v2 用 # META-NNN: title，非 ### META-NNN-CAT:）
    const fm = [
      '---',
      'id: ' + id,
      'category: ' + cat,
      'title: ' + JSON.stringify(title),
      'schema_version: 2',
      'embedding: null',
      '---',
      ''
    ].join('\n');

    // 重写 header：丢掉原 block 第一行（### META-NNN-CAT: title），换成 v2 的 # META-NNN: title
    const firstNewline = block.indexOf('\n');
    const bodyRemainder = firstNewline >= 0 ? block.slice(firstNewline) : '';
    const v2Body = '# ' + id + ': ' + title + bodyRemainder;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, fm + v2Body);
    migrated.push({ id, cat, file: path.relative(projectRoot, targetFile).replace(/\\/g, '/') });
  });

  return { ok: true, migrated, source: src, note: '原文件保留，可手动删除或归档' };
}

// ===== 主流程 =====
ensureGlobalMeta();

const out = { action, ok: false };

if (action === 'drain' || action === 'process-one') {
  const inbox = inboxDir(projectRoot);
  if (!fs.existsSync(inbox)) fs.mkdirSync(inbox, { recursive: true });
  let queue = fs.readdirSync(inbox).filter(f => /^MSG-.*\.md$/.test(f)).sort();

  if (action === 'process-one') {
    if (msgArg) queue = queue.filter(f => f === msgArg);
    else queue = queue.slice(0, 1);
  }

  if (!queue.length) {
    out.ok = true; out.processed = 0; out.note = 'inbox 为空，无需处理';
  } else {
    out.results = [];
    queue.forEach(f => {
      try { out.results.push(processMessage(f)); }
      catch (e) { out.results.push({ msg: f, status: 'error', error: e.message }); }
    });
    out.processed = out.results.length;
    out.persisted = out.results.filter(r => r.status === 'persisted').length;
    out.duplicates = out.results.filter(r => r.status === 'duplicate').length;
    out.failed = out.results.filter(r => r.status === 'failed' || r.status === 'error').length;
    out.ok = out.failed === 0;

    // 刷新索引 + INDEX.md
    refreshIndex();
    refreshIndexMd();

    // 全局仓库 git commit
    if (out.persisted > 0) {
      gitCommitGlobal(`feat(meta): PA persisted ${out.persisted} rule(s) via drain`);
    }
  }
}

else if (action === 'next-id') {
  out.ok = true;
  out.next_id = nextMetaId();
}

else if (action === 'migrate-legacy') {
  const r = migrateLegacy();
  Object.assign(out, r);
  if (r.ok) {
    refreshIndex();
    refreshIndexMd();
    gitCommitGlobal(`chore(meta): migrate legacy meta-rules.md to v2 categorized structure`);
  }
}

else {
  out.error = '未知 action: ' + action + '（支持: drain/process-one/next-id/migrate-legacy）';
}

console.log(JSON.stringify(out, null, 2));
