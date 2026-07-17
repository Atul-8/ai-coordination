/**
 * meta-paths.js — META 仓库路径解析（全局优先 + 项目本地回退）
 *
 * 全局仓库（默认 C:\.ai_meta / ~/.ai_meta，env AI_META_DIR 可配）是所有 META 规则的**唯一真相源**。
 * 配套软件 ai-meta-sync 负责 git 后台同步；本 skill 兼容有/无该软件（无则单机 git 仓库）。
 * 零依赖（fs/path/os/child_process 均为 Node 内置）。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

// 全局 META 仓库路径：env AI_META_DIR 优先；默认 Windows C:\.ai_meta，其他平台 ~/.ai_meta
// 由独立配套软件 ai-meta-sync（见其 SPEC.md）做 git 后台同步；本 skill 兼容有/无该软件。
const GLOBAL_META_DIR = process.env.AI_META_DIR
  || (process.platform === 'win32' ? 'C:\\.ai_meta' : path.join(os.homedir(), '.ai_meta'));

function globalMetaPath() { return path.join(GLOBAL_META_DIR, 'meta-rules.md'); }
function globalIndexPath() { return path.join(GLOBAL_META_DIR, 'meta-index.json'); }
function localMetaDir(projectRoot) { return path.join(projectRoot, '.ai', 'errors', 'distilled'); }
function localMetaPath(projectRoot) { return path.join(localMetaDir(projectRoot), 'meta-rules.md'); }
function localIndexPath(projectRoot) { return path.join(localMetaDir(projectRoot), 'meta-index.json'); }

// 解析 META 来源：全局优先（全局仓库存在则用全局），否则回退项目本地
function resolveMetaSource(projectRoot) {
  if (fs.existsSync(globalMetaPath())) {
    return {
      scope: 'global',
      metaPath: globalMetaPath(),
      indexPath: globalIndexPath(),
      globalDir: GLOBAL_META_DIR
    };
  }
  return {
    scope: 'local',
    metaPath: localMetaPath(projectRoot),
    indexPath: localIndexPath(projectRoot),
    globalDir: null
  };
}

// 确保全局仓库存在（首次初始化：建目录 + 种子 meta-rules.md + git init）
// 由 PM 在首次写入前调用。返回 { existed, initialized, dir }
function ensureGlobalMeta() {
  if (fs.existsSync(globalMetaPath())) {
    return { existed: true, dir: GLOBAL_META_DIR };
  }
  fs.mkdirSync(GLOBAL_META_DIR, { recursive: true });
  const seed = [
    '<!-- schema_version: 1 -->',
    '',
    '# META 规则汇总（全局仓库）',
    '',
    '> 所有项目的 META 规则集中于此，git 同步，全局共享。独立后台项目定期 pull 保持最新。',
    '>',
    '> CATEGORY 受控词表：ASYNC | SECURITY | CONCURRENCY | DEPENDENCY | LAYERING | API_CONTRACT | DATA_INTEGRITY | ERROR_HANDLING | TESTING | PERFORMANCE | BUILD | STATE_MGMT',
    '',
    '---',
    '',
    '## 规则总表',
    '',
    '| 编号 | 类别 | 关联层 | 规则摘要 | 源错误 |',
    '|------|------|--------|---------|--------|',
    '',
    '---',
    '',
    '*PM 提炼的 META 规则按 `### META-NNN-CATEGORY` 格式追加于此（含 category/layer/applies_to/keywords）。*',
    ''
  ].join('\n');
  fs.writeFileSync(globalMetaPath(), seed);
  try {
    execSync('git init', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
    execSync('git add -A', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
    execSync('git commit -m "init: global meta repo"', { cwd: GLOBAL_META_DIR, stdio: 'pipe' });
  } catch (e) {
    // git 可能不可用或已初始化，忽略——后台同步项目会处理 git 远程配置
  }
  return { existed: false, initialized: true, dir: GLOBAL_META_DIR };
}

module.exports = {
  GLOBAL_META_DIR,
  globalMetaPath, globalIndexPath,
  localMetaPath, localIndexPath,
  resolveMetaSource, ensureGlobalMeta
};
