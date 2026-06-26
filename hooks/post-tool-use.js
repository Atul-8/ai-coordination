#!/usr/bin/env node
/**
 * PostToolUse Hook - 调用 G2 检查脚本 + 自动追加 changelog
 * 在 Write/Edit 工具调用后输出同步任务清单，节省 token
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const toolName = process.env.CLAUDE_TOOL_NAME || '';
const toolInput = JSON.parse(process.env.CLAUDE_TOOL_INPUT || '{}');

// 只检查 Write 和 Edit 工具
if (toolName !== 'Write' && toolName !== 'Edit') {
  process.exit(0);
}

const filePath = toolInput.file_path || '';

// 排除 .ai/ 目录本身的文件
if (filePath.includes('.ai/') || filePath.includes('.ai\\')) {
  process.exit(0);
}

// 检查项目是否有 .ai/ 目录
const projectRoot = process.cwd();
const aiDir = path.join(projectRoot, '.ai');

if (!fs.existsSync(aiDir)) {
  process.exit(0);
}

// 获取脚本目录
const hookDir = __dirname;
const scriptDir = path.join(hookDir, '..', 'scripts');
const g2Script = path.join(scriptDir, 'g2-check.js');
const changelogScript = path.join(scriptDir, 'changelog-append.js');

// 自动追加 changelog
try {
  // 提取文件名作为描述
  const fileName = path.basename(filePath);
  const actionType = '完成';
  const description = `修改文件 ${fileName}`;

  execSync(`node "${changelogScript}" "${projectRoot}" "${actionType}" "${description}" "${filePath}"`, { encoding: 'utf-8', stdio: 'pipe' });
} catch (e) {
  // changelog 追加失败不影响主流程
}

// 调用 G2 检查脚本
if (!fs.existsSync(g2Script)) {
  console.log('');
  console.log('⚠️ G2 提醒：代码已变更，请同步 .ai');
  console.log('1. 更新 WORKSTATE.md（进度、中断点）');
  console.log('2. 追加 changelog/LOG.md（已自动追加）');
  console.log('3. 检查 STRUCTURE.md（若有架构变更）');
  console.log('4. 运行对应层测试');
  console.log('');
  process.exit(0);
}

// 调用脚本
try {
  const result = JSON.parse(execSync(`node "${g2Script}" "${projectRoot}" "${filePath}"`, { encoding: 'utf-8' }));

  if (!result.hasAiDir) {
    process.exit(0);
  }

  // 输出简洁的任务清单
  console.log('');
  console.log('⚠️ G2 同步任务清单：');

  result.tasks.forEach((task, i) => {
    const priorityIcon = task.priority === 'high' ? '🔴' : (task.priority === 'medium' ? '🟡' : '🟢');
    console.log(`${priorityIcon} ${i + 1}. ${task.description}`);
    if (task.file) {
      console.log(`   → ${task.file}`);
    }
    if (task.layers) {
      console.log(`   → 涉及层级: ${task.layers.join(', ')}`);
    }
  });

  // 提示已自动追加 changelog
  console.log('');
  console.log('📝 changelog/LOG.md 已自动追加本次操作记录');
  console.log('');

  // 提供快速更新 WORKSTATE 的命令
  console.log('💡 快速更新中断点：');
  console.log(`   node scripts/workstate-update.js "${projectRoot}" interrupt "${filePath}" "修改文件" "继续开发"`);
  console.log('');

  process.exit(0);
} catch (e) {
  console.log('');
  console.log('⚠️ G2 提醒：代码已变更，请同步 .ai');
  console.log('');
  process.exit(0);
}