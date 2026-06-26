#!/usr/bin/env node
/**
 * PreToolUse Hook - 调用 G1/G2 检查脚本
 * 在 Write/Edit 工具调用前执行检查，节省 token
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
  process.exit(0); // 没有 .ai/ 目录，不强制执行
}

// 调用 G1 检查脚本
// 脚本位置：F:/AI/ai-coordination/scripts/（固定路径）
const hookDir = __dirname; // hooks 目录
const scriptDir = path.join(hookDir, '..', 'scripts');
const g1Script = path.join(scriptDir, 'g1-check.js');

// 如果脚本不存在，使用内置逻辑
if (!fs.existsSync(g1Script)) {
  // 简化版检查：只检查 WORKSTATE.md 是否有进行中任务
  const workstatePath = path.join(aiDir, 'WORKSTATE.md');
  if (!fs.existsSync(workstatePath)) {
    console.error('❌ 阻止操作：WORKSTATE.md 不存在，请先运行 /ai:init');
    process.exit(2);
  }

  const content = fs.readFileSync(workstatePath, 'utf-8');
  const hasInProgress = content.includes('## 正在进行') && content.match(/## 正在进行\n- .+/);

  if (!hasInProgress) {
    console.error('❌ 阻止操作：写代码前必须在 WORKSTATE.md 登记「正在做什么」');
    console.error('请在 .ai/WORKSTATE.md 的「## 正在进行」章节添加任务登记');
    process.exit(2);
  }

  process.exit(0);
}

// 调用脚本
try {
  const result = JSON.parse(execSync(`node "${g1Script}" "${projectRoot}"`, { encoding: 'utf-8' }));

  // 检查 WORKSTATE 是否有进行中任务
  if (result.workstate?.exists && !result.workstate?.inProgress) {
    console.error('❌ 阻止操作：写代码前必须在 WORKSTATE.md 登记「正在做什么」');
    console.error('请在 .ai/WORKSTATE.md 的「## 正在进行」章节添加任务登记');
    process.exit(2);
  }

  // 输出 G1 检查摘要（简洁版）
  if (result.workstate?.interruption) {
    console.log('📍 上次中断点：' + result.workstate.interruption.split('\n')[0].replace('- 文件: ', ''));
  }
  if (result.metaRules?.count > 0) {
    console.log('📚 META 规则已加载：' + result.metaRules.count + ' 条');
  }
  if (result.gitSync?.syncStatus !== 'synced' && result.gitSync?.action) {
    console.log('🔄 Git 同步：' + result.gitSync.action);
  }

  process.exit(0);
} catch (e) {
  // 脚本执行失败，使用简化版检查
  const workstatePath = path.join(aiDir, 'WORKSTATE.md');
  if (fs.existsSync(workstatePath)) {
    const content = fs.readFileSync(workstatePath, 'utf-8');
    if (!content.includes('## 正在进行') || !content.match(/## 正在进行\n- .+/)) {
      console.error('❌ 阻止操作：写代码前必须在 WORKSTATE.md 登记');
      process.exit(2);
    }
  }
  process.exit(0);
}