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
const { detectLayer } = require('./lib/detect-layer');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
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

// 6. G2.5 先验证后开发 — 检查底层依赖是否已验证
// 依赖关系：presentation → interface → core → shared
const layerDeps = {
  presentation: ['interface', 'shared'],
  interface: ['core', 'shared'],
  core: ['shared'],
  shared: []
};

// 读取 WORKSTATE.md 中的验证标记
let verifyMap = {};
const workstatePath = path.join(aiDir, 'WORKSTATE.md');
if (fs.existsSync(workstatePath)) {
  const wsContent = fs.readFileSync(workstatePath, 'utf-8');
  const verifyMatch = wsContent.match(/\[验证: ([^\]]+)\]/);
  if (verifyMatch) {
    const validLayers = ['shared', 'core', 'interface', 'presentation'];
    verifyMatch[1].split(/\s+/).forEach(part => {
      const layer = part.replace(/[✓✗]/g, '');
      const passed = part.includes('✓');
      if (validLayers.includes(layer)) {
        verifyMap[layer] = passed;
      }
    });
  }
}

// 检查变更层的底层依赖是否已验证
layersWithChanges.forEach(layer => {
  const deps = layerDeps[layer];
  if (deps && deps.length > 0) {
    const unverifiedDeps = deps.filter(dep => !verifyMap[dep]);
    if (unverifiedDeps.length > 0) {
      result.tasks.push({
        type: 'verify-dependencies',
        priority: 'high',
        description: `G2.5 验证提醒：${layer} 层的底层依赖未验证`,
        layer: layer,
        unverifiedDeps: unverifiedDeps,
        reminder: `开发 ${layer} 层代码前，必须先验证 ${unverifiedDeps.join(', ')} 层的依赖可用。运行：node src/scripts/workstate-update.js . verify <layer>`
      });
    }
  }
});

// 输出结果
console.log(JSON.stringify(result, null, 2));

// 辅助函数
// detectLayer 已抽到 ./lib/detect-layer.js（DRY，四处去重）

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