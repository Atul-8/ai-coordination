#!/usr/bin/env node
/**
 * Stop Hook - 调用 G4 离场检查脚本
 * 在会话结束前输出自检清单，节省 token
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// 检查项目是否有 .ai/ 目录
const projectRoot = process.cwd();
const aiDir = path.join(projectRoot, '.ai');

if (!fs.existsSync(aiDir)) {
  process.exit(0);
}

// 调用 G4 检查脚本
// 脚本位置：F:/AI/ai-coordination/scripts/（固定路径）
const hookDir = __dirname; // hooks 目录
const scriptDir = path.join(hookDir, '..', 'scripts');
const g4Script = path.join(scriptDir, 'g4-check.js');

// 如果脚本不存在，使用简化版提醒
if (!fs.existsSync(g4Script)) {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('G4 离场检查 — 请确认以下项目');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('[ ] WORKSTATE.md 中断点是否指向当前最新状态？');
  console.log('[ ] changelog/LOG.md 是否记录了本次所有关键操作？');
  console.log('[ ] 本次架构变更是否已更新到 STRUCTURE.md？');
  console.log('[ ] 本次错误是否已按五步法记录？');
  console.log('[ ] 本次代码变更是否已运行对应层测试？');
  console.log('[ ] 若 .ai/ 有远程仓库，是否已 git push？');
  console.log('');
  console.log('自检没过就结束会话 = 遗留问题给未来的自己');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  process.exit(0);
}

// 调用脚本
try {
  const result = JSON.parse(execSync(`node "${g4Script}" "${projectRoot}"`, { encoding: 'utf-8' }));

  if (!result.hasAiDir) {
    process.exit(0);
  }

  // 输出简洁的自检清单
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('G4 离场检查 — ' + result.message);
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  result.checks.forEach(check => {
    const statusIcon = check.status === 'pass' ? '✅' :
                       (check.status === 'fail' ? '❌' :
                       (check.status === 'warning' ? '⚠️' : '📋'));
    console.log(`${statusIcon} ${check.name}: ${check.detail}`);
    if (check.action) {
      console.log(`   → ${check.action}`);
    }
  });

  console.log('');
  console.log(`汇总: 通过 ${result.summary.passed} | 失败 ${result.summary.failed} | 警告 ${result.summary.warnings} | 待确认 ${result.summary.manual}`);
  console.log('');

  if (result.warnings.length > 0) {
    console.log('⚠️ 警告事项：');
    result.warnings.forEach(w => console.log('   - ' + w));
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  process.exit(0);
} catch (e) {
  // 脚本执行失败，使用简化版提醒
  console.log('');
  console.log('G4 离场检查 — 请手动确认同步状态');
  console.log('');
  process.exit(0);
}