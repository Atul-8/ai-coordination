#!/usr/bin/env node
/**
 * 层级检测共享模块（DRY）
 *
 * 统一原本散落在 ai-init.js / pre-tool-use.js / post-tool-use.js / g2-check.js
 * 四处的重复实现。零依赖，仅字符串匹配。
 *
 * 两个签名对应两种用法：
 *   - detectLayer(filePath)       完整文件路径 → 层级（带斜杠匹配，含 src/app 等复合前缀）
 *   - detectLayerFromDir(dirPath) 目录名/路径片段 → 层级（不带斜杠匹配，供目录扫描用）
 *
 * 七层架构：presentation / interface / core / shared / testing / docs
 * （coordination 层即 .ai/，属元数据，不参与业务层判定）
 */

// 文件路径 → 层级（适配完整路径，如 src/app/xxx、packages/core/yyy）
function detectLayer(filePath) {
  if (!filePath) return null;
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');

  // .ai/ 是 coordination 元数据层，不参与业务层判定
  // （吸收原 g2-check.js docs 分支里的 .ai/ 排除，统一在此处理）
  if (normalized.indexOf('/.ai/') !== -1 || normalized.indexOf('.ai/') === 0) {
    return null;
  }

  if (anyMatch(normalized, ['ui/', 'components/', 'pages/', 'views/', 'src/app/', 'src/components/'])) {
    return 'presentation';
  }
  if (anyMatch(normalized, ['api/', 'routes/', 'controllers/', 'handlers/', 'interface/', 'adapters/'])) {
    return 'interface';
  }
  if (anyMatch(normalized, ['core/', 'domain/', 'services/', 'business/', 'logic/', 'models/'])) {
    return 'core';
  }
  if (anyMatch(normalized, ['shared/', 'utils/', 'lib/', 'common/', 'helpers/', 'constants/'])) {
    return 'shared';
  }
  if (anyMatch(normalized, ['test/', 'tests/', '__tests__/', 'spec/']) || normalized.indexOf('.test.') !== -1 || normalized.indexOf('.spec.') !== -1) {
    return 'testing';
  }
  if (normalized.indexOf('docs/') !== -1 || normalized.endsWith('.md')) {
    return 'docs';
  }

  return null;
}

// 目录名/路径片段 → 层级（不带斜杠匹配，供 ai-init.js 的 scanProjectDirs 使用）
// 注意：此处保留原 ai-init 的匹配词表（与 detectLayer 略有差异，如 core 不含 logic、shared 不含 constants）
function detectLayerFromDir(dirPath) {
  if (!dirPath) return null;
  const normalized = dirPath.toLowerCase().replace(/\\/g, '/');

  if (anyMatch(normalized, ['ui', 'components', 'pages', 'views', 'app'])) {
    return 'presentation';
  }
  if (anyMatch(normalized, ['api', 'routes', 'controllers', 'handlers', 'interface'])) {
    return 'interface';
  }
  if (anyMatch(normalized, ['core', 'domain', 'services', 'business', 'models'])) {
    return 'core';
  }
  if (anyMatch(normalized, ['shared', 'utils', 'lib', 'common', 'helpers'])) {
    return 'shared';
  }
  if (anyMatch(normalized, ['test', 'tests', '__tests__', 'spec'])) {
    return 'testing';
  }
  if (anyMatch(normalized, ['docs', 'documentation'])) {
    return 'docs';
  }

  return null;
}

// 任一子串命中即返回 true
function anyMatch(normalized, patterns) {
  for (let i = 0; i < patterns.length; i++) {
    if (normalized.indexOf(patterns[i]) !== -1) return true;
  }
  return false;
}

module.exports = { detectLayer, detectLayerFromDir };
