#!/usr/bin/env node
/**
 * G2 双门禁检查脚本
 * 执行 G2 规则的同步检查，输出需要执行的操作清单
 *
 * 用法：node g2-check.js [project-root] [changed-files]
 * 输出：JSON 格式的同步任务清单
 *
 * changed-files 格式：逗号分隔的文件路径列表
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
const changedFilesStr = process.argv[3] || '';
const changedFiles = changedFilesStr.split(',').filter(f => f.trim());

const aiDir = path.join(projectRoot, '.ai');

const result = {
  hasAiDir: false,
  tasks: [],
  errors: []
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.hasAiDir = false;
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

result.hasAiDir = true;

// 分析变更文件
const analysis = {
  newFiles: [],
  deletedFiles: [],
  renamedFiles: [],
  modifiedFiles: [],
  layers: {
    presentation: [],
    interface: [],
    core: [],
    shared: [],
    testing: [],
    docs: []
  }
};

// 分类变更
changedFiles.forEach(file => {
  // 判断层级
  const layer = detectLayer(file);
  if (layer) {
    analysis.layers[layer].push(file);
  }
});

// 生成同步任务

// 1. 更新 WORKSTATE.md
result.tasks.push({
  type: 'update-workstate',
  priority: 'high',
  description: '更新进度和中断点',
  file: '.ai/WORKSTATE.md'
});

// 2. 追加 changelog/LOG.md
result.tasks.push({
  type: 'append-log',
  priority: 'high',
  description: '追加操作记录',
  file: '.ai/changelog/LOG.md',
  format: '- HH:MM [完成|决策|修复] 描述 (涉及文件: xxx)'
});

// 3. 检查是否需要更新 STRUCTURE.md
if (analysis.newFiles.length > 0 || analysis.deletedFiles.length > 0 || analysis.renamedFiles.length > 0) {
  result.tasks.push({
    type: 'update-structure',
    priority: 'medium',
    description: '架构变更，需更新 STRUCTURE.md',
    file: '.ai/STRUCTURE.md',
    reason: '新增/删除/重命名了文件'
  });
}

// 4. 检查是否需要运行测试
const layersWithChanges = Object.entries(analysis.layers)
  .filter(([layer, files]) => files.length > 0)
  .map(([layer]) => layer);

if (layersWithChanges.length > 0) {
  result.tasks.push({
    type: 'run-tests',
    priority: 'high',
    description: '运行对应层测试',
    layers: layersWithChanges,
    testTypes: getTestTypes(layersWithChanges)
  });
}

// 5. 检查是否需要新建 REQ
// 这个需要用户手动判断，脚本只输出提醒
result.tasks.push({
  type: 'check-requirements',
  priority: 'low',
  description: '检查是否涉及需求变更',
  reminder: '若有新增/变更业务需求，新建 requirements/REQ-NNN.md'
});

// 输出结果
console.log(JSON.stringify(result, null, 2));

// 辅助函数
function detectLayer(filePath) {
  const normalized = filePath.toLowerCase().replace(/\\/g, '/');

  // 常见目录模式
  if (normalized.includes('ui/') || normalized.includes('components/') || normalized.includes('pages/') || normalized.includes('views/') || normalized.includes('src/app/') || normalized.includes('src/components/')) {
    return 'presentation';
  }
  if (normalized.includes('api/') || normalized.includes('routes/') || normalized.includes('controllers/') || normalized.includes('handlers/') || normalized.includes('interface/') || normalized.includes('adapters/')) {
    return 'interface';
  }
  if (normalized.includes('core/') || normalized.includes('domain/') || normalized.includes('services/') || normalized.includes('business/') || normalized.includes('logic/') || normalized.includes('models/')) {
    return 'core';
  }
  if (normalized.includes('shared/') || normalized.includes('utils/') || normalized.includes('lib/') || normalized.includes('common/') || normalized.includes('helpers/') || normalized.includes('constants/')) {
    return 'shared';
  }
  if (normalized.includes('test/') || normalized.includes('tests/') || normalized.includes('__tests__/') || normalized.includes('spec/') || normalized.includes('.test.') || normalized.includes('.spec.')) {
    return 'testing';
  }
  if (normalized.includes('docs/') || normalized.endsWith('.md') && !normalized.includes('.ai/')) {
    return 'docs';
  }

  return null;
}

function getTestTypes(layers) {
  const testMap = {
    presentation: ['UI快照测试', '交互测试'],
    interface: ['契约测试', '接口测试'],
    core: ['单元测试'],
    shared: ['工具函数测试'],
    testing: ['集成测试', 'E2E测试'],
    docs: ['无测试要求']
  };

  return layers.map(layer => testMap[layer] || ['未知测试类型']);
}