/**
 * meta-paths.js — META 仓库路径解析（全局优先 + 项目本地回退 + 分类目录结构）
 *
 * 全局仓库（默认 C:\.ai_meta / ~/.ai_meta，env AI_META_DIR 可配）是所有 META 规则的**唯一真相源**。
 * 配套软件 ai-meta-sync 负责 git 后台同步；本 skill 兼容有/无该软件（无则单机 git 仓库）。
 *
 * v2 结构（PA agent 接管后）：
 *   <GLOBAL_META_DIR>/
 *     README.md                     # 仓库说明
 *     INDEX.md                      # PA 自动重生成的人类可读导航（聚合视图）
 *     meta-index.json               # 机器可读索引（meta-index.js 扫描 rules/ 生成）
 *     rules/                        # 按 category 分目录（PA 自治组织）
 *       ASYNC/
 *         META-001.md               # 每条规则独立文件（git/同步/RAG 单元）
 *       SECURITY/
 *         META-002.md
 *       ...
 *
 * 向后兼容：若全局仓库仅有 meta-rules.md（旧 schema_version 1 单文件结构）而无 rules/ 目录，
 * resolveMetaSource 会回退到单文件模式，供老项目继续工作。
 *
 * 零依赖（fs/path/os/child_process 均为 Node 内置）。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 全局 META 仓库路径：env AI_META_DIR 优先；默认 Windows C:\.ai_meta，其他平台 ~/.ai_meta
const GLOBAL_META_DIR = process.env.AI_META_DIR
  || (process.platform === 'win32' ? 'C:\\.ai_meta' : path.join(os.homedir(), '.ai_meta'));

// 受控词表（与 SKILL.md / meta-classify.js 一致）
const CATEGORIES = [
  'ASYNC', 'SECURITY', 'CONCURRENCY', 'DEPENDENCY', 'LAYERING', 'API_CONTRACT',
  'DATA_INTEGRITY', 'ERROR_HANDLING', 'TESTING', 'PERFORMANCE', 'BUILD', 'STATE_MGMT'
];

// ===== 全局仓库路径 =====
function globalDir() { return GLOBAL_META_DIR; }
function globalRulesDir() { return path.join(GLOBAL_META_DIR, 'rules'); }
function globalRuleFile(category, id) {
  return path.join(globalRulesDir(), String(category || 'UNCATEGORIZED').toUpperCase(), id + '.md');
}
function globalIndexPath() { return path.join(GLOBAL_META_DIR, 'meta-index.json'); }
function globalIndexMdPath() { return path.join(GLOBAL_META_DIR, 'INDEX.md'); }
function globalReadmePath() { return path.join(GLOBAL_META_DIR, 'README.md'); }
// 旧版兼容：单文件 meta-rules.md
function globalLegacyMetaPath() { return path.join(GLOBAL_META_DIR, 'meta-rules.md'); }

// ===== 项目本地路径 =====
function localMetaDir(projectRoot) { return path.join(projectRoot, '.ai', 'errors', 'distilled'); }
function localMetaPath(projectRoot) { return path.join(localMetaDir(projectRoot), 'meta-rules.md'); }
function localIndexPath(projectRoot) { return path.join(localMetaDir(projectRoot), 'meta-index.json'); }

// ===== 项目级 PA inbox（消息队列）=====
function inboxDir(projectRoot) { return path.join(projectRoot, '.ai', 'pa-inbox'); }

/**
 * 解析 META 来源：优先全局新结构（rules/ 目录），其次全局旧结构（单文件���，最后回退项目本地
 * 返回 { scope: 'global-v2'|'global-v1'|'local', ...路径们 }
 */
function resolveMetaSource(projectRoot) {
  // 优先 v2：全局 rules/ 目录存在（哪怕为空也认为是 v2）
  if (fs.existsSync(globalRulesDir())) {
    return {
      scope: 'global-v2',
      globalDir: GLOBAL_META_DIR,
      rulesDir: globalRulesDir(),
      indexPath: globalIndexPath(),
      indexMdPath: globalIndexMdPath(),
      // 兼容字段（给老脚本读）
      metaPath: globalIndexMdPath()
    };
  }
  // 回退 v1：全局单文件 meta-rules.md
  if (fs.existsSync(globalLegacyMetaPath())) {
    return {
      scope: 'global-v1',
      metaPath: globalLegacyMetaPath(),
      indexPath: globalIndexPath(),
      globalDir: GLOBAL_META_DIR
    };
  }
  // 回退本地
  return {
    scope: 'local',
    metaPath: localMetaPath(projectRoot),
    indexPath: localIndexPath(projectRoot),
    globalDir: null
  };
}

/**
 * 确保全局仓库存在（v2 分类结构）。
 * 首次初始化时：建 rules/ 目录 + 12 个分类子目录 + 种子 README.md + 空 INDEX.md + 空 meta-index.json + git init
 * 已初始化则幂等返回。
 * 由 PA / PM 在首次写入前调用。返回 { existed, initialized, dir }
 */
function ensureGlobalMeta() {
  if (fs.existsSync(globalRulesDir())) {
    return { existed: true, initialized: false, dir: GLOBAL_META_DIR, rulesDir: globalRulesDir() };
  }
  fs.mkdirSync(GLOBAL_META_DIR, { recursive: true });
  const rulesDir = globalRulesDir();
  fs.mkdirSync(rulesDir, { recursive: true });

  // 建 12 个分类子目录
  CATEGORIES.forEach(cat => {
    fs.mkdirSync(path.join(rulesDir, cat), { recursive: true });
  });

  // 种子 README.md
  const readme = [
    '# 全局 META 规则仓库',
    '',
    '> 所有项目的 META 规则集中于此，由 **项目助理（PA）agent** 自治分类入库、维护索引。',
    '> 配套软件 ai-meta-sync 负责 git 后台同步；本 skill 兼容有/无该软件。',
    '',
    '## 目录结构',
    '',
    '```',
    GLOBAL_META_DIR.replace(/\\/g, '/') + '/',
    '  README.md              # 本文件',
    '  INDEX.md               # 人类可读导航（PA 自动重生成）',
    '  meta-index.json        # 机器可读索引（meta-index.js 扫 rules/ 生成）',
    '  rules/                 # 按 category 分目录',
    '    ASYNC/',
    '      META-NNN.md        # 每条规则独立文件',
    '    SECURITY/',
    '      META-NNN.md',
    '    ...（共 ' + CATEGORIES.length + ' 个受控词表类别）',
    '```',
    '',
    '## CATEGORY 受控词表',
    '',
    '`' + CATEGORIES.join(' | ') + '`',
    '',
    '## 规则入库协议（PA 执行）',
    '',
    '1. 消费 `.ai/pa-inbox/MSG-*.md`（生产者 = 任何 agent）',
    '2. 分类（meta-classify 复核 category）',
    '3. 查重（meta-retriever，命中则 merge / supersede / skip）',
    '4. 编号（全局 META-NNN 最大+1，含 git pull 防冲突）',
    '5. 写入 `rules/<CATEGORY>/META-NNN.md`（每条独立文件）',
    '6. 刷新 INDEX.md + meta-index.json',
    '7. ACK = 删除 inbox 消息文件',
    '',
    '## 单条规则文件格式（schema_version: 1）',
    '',
    '见任一 `rules/<CAT>/META-*.md`。必填字段：',
    'category / layer / applies_to / keywords / rule / semantic_summary。',
    '',
    '## 向量 RAG（预留）',
    '',
    '规则量达阈值（≥30）后，可对「规则 + 语义摘要」生成 embedding 写入单文件 embedding 字段，',
    'meta-retriever.js 自动切换向量检索，格式向前兼容。',
    ''
  ].join('\n');
  fs.writeFileSync(globalReadmePath(), readme);

  // 种子 INDEX.md（空）
  fs.writeFileSync(globalIndexMdPath(), [
    '# META 规则导航',
    '',
    '> 由 PA agent 自动重生成。请勿手动编辑。',
    '',
    '生成时间：' + new Date().toISOString(),
    '',
    '## 规则总表',
    '',
    '| 编号 | 类别 | 关联层 | 规则摘要 | 源错误 |',
    '|------|------|--------|---------|--------|',
    '',
    '_(暂无规则)_',
    ''
  ].join('\n'));

  // 种子 meta-index.json（空）
  fs.writeFileSync(globalIndexPath(), JSON.stringify({
    schema_version: 2,
    generated_from: 'rules/',
    generated_at: new Date().toISOString(),
    rules: []
  }, null, 2));

  // git init（若无）
  if (!fs.existsSync(path.join(GLOBAL_META_DIR, '.git'))) {
    try {
      execSync('git init', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
      execSync('git add -A', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
      execSync('git commit -m "init: global meta repo (v2 categorized structure)"', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
    } catch (e) {
      // git 可能不可用或已初始化，忽略——后台同步项目会处理 git 远程配置
    }
  }
  return { existed: false, initialized: true, dir: GLOBAL_META_DIR, rulesDir };
}

module.exports = {
  GLOBAL_META_DIR,
  CATEGORIES,
  // 全局
  globalDir, globalRulesDir, globalRuleFile,
  globalIndexPath, globalIndexMdPath, globalReadmePath, globalLegacyMetaPath,
  // 本地
  localMetaDir, localMetaPath, localIndexPath,
  // inbox
  inboxDir,
  // 解析 / 初始化
  resolveMetaSource, ensureGlobalMeta
};
