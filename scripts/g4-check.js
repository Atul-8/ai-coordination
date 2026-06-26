#!/usr/bin/env node
/**
 * G4 离场检查脚本
 * 执行 G4 规则的全部检查步骤，输出自检清单和状态报告
 *
 * 用法：node g4-check.js [project-root]
 * 输出：JSON 格式的检查结果 + 自检清单
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const aiDir = path.join(projectRoot, '.ai');

const result = {
  hasAiDir: false,
  checks: [],
  passed: true,
  warnings: [],
  gitSync: null
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.hasAiDir = false;
  result.message = '项目未启用 ai-coordination，G4 不适用';
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

result.hasAiDir = true;

// 读取当前时间
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

// 1. WORKSTATE.md 中断点检查
const workstatePath = path.join(aiDir, 'WORKSTATE.md');
if (fs.existsSync(workstatePath)) {
  const content = fs.readFileSync(workstatePath, 'utf-8');
  const lastUpdateMatch = content.match(/上次更新: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/);
  const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1] : null;

  const isRecent = lastUpdate && lastUpdate.startsWith(dateStr);

  result.checks.push({
    id: 'workstate-interruption',
    name: 'WORKSTATE.md 中断点',
    status: isRecent ? 'pass' : 'warning',
    detail: lastUpdate ? `最后更新: ${lastUpdate}` : '无更新时间记录',
    action: isRecent ? null : '建议更新中断点指向当前状态'
  });

  if (!isRecent) {
    result.warnings.push('WORKSTATE.md 中断点可能未指向当前最新状态');
  }
} else {
  result.checks.push({
    id: 'workstate-exists',
    name: 'WORKSTATE.md 存在性',
    status: 'fail',
    detail: '文件不存在',
    action: '需创建 WORKSTATE.md'
  });
  result.passed = false;
}

// 2. changelog/LOG.md 检查
const logPath = path.join(aiDir, 'changelog', 'LOG.md');
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.startsWith('-'));
  const recentLines = lines.slice(-5);

  // 检查是否有今天的记录
  const hasTodayRecord = recentLines.some(l => l.includes(dateStr));

  result.checks.push({
    id: 'changelog-records',
    name: 'changelog/LOG.md 操作记录',
    status: hasTodayRecord ? 'pass' : 'warning',
    detail: `总记录数: ${lines.length}，最近5条: ${recentLines.length}`,
    recentRecords: recentLines,
    action: hasTodayRecord ? null : '建议追加本次关键操作记录'
  });

  if (!hasTodayRecord) {
    result.warnings.push('changelog/LOG.md 可能未记录本次操作');
  }
} else {
  result.checks.push({
    id: 'changelog-exists',
    name: 'changelog/LOG.md 存在性',
    status: 'fail',
    detail: '文件不存在',
    action: '需创建 changelog/LOG.md'
  });
  result.passed = false;
}

// 3. STRUCTURE.md 检查
const structurePath = path.join(aiDir, 'STRUCTURE.md');
if (fs.existsSync(structurePath)) {
  const content = fs.readFileSync(structurePath, 'utf-8');
  const lastUpdateMatch = content.match(/上次更新: (\d{4}-\d{2}-\d{2})/);
  const lastUpdate = lastUpdateMatch ? lastUpdateMatch[1] : null;

  result.checks.push({
    id: 'structure-update',
    name: 'STRUCTURE.md 架构地图',
    status: 'pass',
    detail: lastUpdate ? `最后更新: ${lastUpdate}` : '无更新时间记录',
    action: '若有架构变更需手动更新'
  });
} else {
  result.checks.push({
    id: 'structure-exists',
    name: 'STRUCTURE.md 存在性',
    status: 'fail',
    detail: '文件不存在',
    action: '需创建 STRUCTURE.md'
  });
  result.passed = false;
}

// 4. errors/raw/ 检查
const errorsRawDir = path.join(aiDir, 'errors', 'raw');
if (fs.existsSync(errorsRawDir)) {
  const files = fs.readdirSync(errorsRawDir).filter(f => f.startsWith('ERR-') && f.endsWith('.md'));

  result.checks.push({
    id: 'errors-records',
    name: 'errors/raw/ 错误记录',
    status: 'pass',
    detail: `错误记录数: ${files.length}`,
    lastErr: files.length > 0 ? files[files.length - 1] : null,
    action: '若有新错误需按五步法记录'
  });
} else {
  result.checks.push({
    id: 'errors-dir-exists',
    name: 'errors/raw/ 目录',
    status: 'fail',
    detail: '目录不存在',
    action: '需创建 errors/raw/ 目录'
  });
  result.passed = false;
}

// 5. meta-rules.md 检查
const metaRulesPath = path.join(aiDir, 'errors', 'distilled', 'meta-rules.md');
if (fs.existsSync(metaRulesPath)) {
  const content = fs.readFileSync(metaRulesPath, 'utf-8');
  const metaCount = (content.match(/### META-/g) || []).length;

  result.checks.push({
    id: 'meta-rules',
    name: 'errors/distilled/meta-rules.md',
    status: 'pass',
    detail: `META 规则数: ${metaCount}`,
    action: '若有新错误提炼需追加 META 规则'
  });
} else {
  result.checks.push({
    id: 'meta-rules-exists',
    name: 'meta-rules.md 存在性',
    status: 'fail',
    detail: '文件不存在',
    action: '需创建 meta-rules.md'
  });
  result.passed = false;
}

// 6. Git 云端同步检查
const gitDir = path.join(aiDir, '.git');
if (fs.existsSync(gitDir)) {
  try {
    const gitConfig = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
    const hasRemote = gitConfig.includes('[remote "origin"]');

    if (hasRemote) {
      // 检查是否有未提交的变更
      const statusOutput = execSync('git status --porcelain', { cwd: aiDir, encoding: 'utf-8' });
      const hasUncommitted = statusOutput.trim().length > 0;

      // 检查本地与远程的差异
      execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });
      const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
      const aheadCount = parseInt(execSync(`git rev-list origin/${localBranch}..HEAD --count`, { cwd: aiDir, encoding: 'utf-8' }).trim()) || 0;

      result.gitSync = {
        hasRemote: true,
        hasUncommitted,
        aheadCount,
        needsPush: hasUncommitted || aheadCount > 0
      };

      result.checks.push({
        id: 'git-sync',
        name: 'Git 云端同步',
        status: result.gitSync.needsPush ? 'warning' : 'pass',
        detail: hasUncommitted ? '有未提交变更' : (aheadCount > 0 ? `本地超前 ${aheadCount} 个提交` : '已同步'),
        action: result.gitSync.needsPush ? '需 git add -A && git commit && git push' : null
      });

      if (result.gitSync.needsPush) {
        result.warnings.push('Git 云端未同步，需提交并推送');
      }
    } else {
      result.gitSync = { hasRemote: false };
      result.checks.push({
        id: 'git-remote',
        name: 'Git 远程仓库',
        status: 'pass',
        detail: '未配置远程仓库（可选）',
        action: null
      });
    }
  } catch (e) {
    result.gitSync = { error: e.message };
    result.checks.push({
      id: 'git-check',
      name: 'Git 检查',
      status: 'warning',
      detail: 'Git 操作失败: ' + e.message,
      action: '需手动检查 Git 状态'
    });
  }
} else {
  result.gitSync = { hasGitRepo: false };
  result.checks.push({
    id: 'git-repo',
    name: 'Git 仓库',
    status: 'pass',
    detail: '.ai/ 未初始化为 Git 仓库（可选）',
    action: null
  });
}

// 7. 测试层验证检查（提醒项）
result.checks.push({
  id: 'test-verification',
  name: '测试层验证',
  status: 'manual',
  detail: '需人工确认',
  action: '确认本次代码变更已运行对应层测试'
});

// 计算总体状态
const failedCount = result.checks.filter(c => c.status === 'fail').length;
const warningCount = result.checks.filter(c => c.status === 'warning').length;

result.summary = {
  total: result.checks.length,
  passed: result.checks.filter(c => c.status === 'pass').length,
  failed: failedCount,
  warnings: warningCount,
  manual: result.checks.filter(c => c.status === 'manual').length
};

if (failedCount > 0) {
  result.passed = false;
  result.message = '离场检查未通过，存在必须修复的问题';
} else if (warningCount > 0) {
  result.passed = true;
  result.message = '离场检查通过，但存在建议处理的事项';
} else {
  result.passed = true;
  result.message = '离场检查全部通过';
}

// 输出结果
console.log(JSON.stringify(result, null, 2));