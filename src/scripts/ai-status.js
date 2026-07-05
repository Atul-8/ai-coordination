#!/usr/bin/env node
/**
 * ai-status 脚本 - 查看当前工作状态和对接层信息
 *
 * 用法：node ai-status.js [project-root]
 * 输出：JSON 格式的状态报告
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const aiDir = path.join(projectRoot, '.ai');

const result = {
  hasAiDir: false,
  workstate: null,
  structure: null,
  requirements: null,
  errors: null,
  metaRules: null,
  changelog: null,
  gitSync: null,
  summary: null
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.hasAiDir = false;
  result.message = '项目未启用 ai-coordination，请运行 /ai:init 初始化';
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

result.hasAiDir = true;

// 读取 WORKSTATE.md
const workstatePath = path.join(aiDir, 'WORKSTATE.md');
if (fs.existsSync(workstatePath)) {
  const content = fs.readFileSync(workstatePath, 'utf-8');

  result.workstate = {
    exists: true,
    inProgress: extractSection(content, '## 正在进行'),
    unfinished: extractSection(content, '## 未完成队列'),
    interruption: extractSection(content, '## 上次中断点'),
    lastUpdate: content.match(/上次更新: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] || null
  };
}

// 读取 STRUCTURE.md
const structurePath = path.join(aiDir, 'STRUCTURE.md');
if (fs.existsSync(structurePath)) {
  const content = fs.readFileSync(structurePath, 'utf-8');

  result.structure = {
    exists: true,
    layerCount: (content.match(/\| [a-z]+ \|/g) || []).length,
    lastUpdate: content.match(/上次更新: (\d{4}-\d{2}-\d{2})/)?.[1] || null
  };
}

// 统计 requirements
const requirementsDir = path.join(aiDir, 'requirements');
if (fs.existsSync(requirementsDir)) {
  const files = fs.readdirSync(requirementsDir).filter(f => f.startsWith('REQ-') && f.endsWith('.md'));

  result.requirements = {
    exists: true,
    count: files.length,
    latest: files.length > 0 ? files[files.length - 1] : null
  };
}

// 统计 errors
const errorsRawDir = path.join(aiDir, 'errors', 'raw');
if (fs.existsSync(errorsRawDir)) {
  const files = fs.readdirSync(errorsRawDir).filter(f => f.startsWith('ERR-') && f.endsWith('.md'));

  result.errors = {
    exists: true,
    count: files.length,
    latest: files.length > 0 ? files[files.length - 1] : null
  };
}

// 统计 meta-rules
const metaRulesPath = path.join(aiDir, 'errors', 'distilled', 'meta-rules.md');
if (fs.existsSync(metaRulesPath)) {
  const content = fs.readFileSync(metaRulesPath, 'utf-8');
  const metaCount = (content.match(/### META-/g) || []).length;

  result.metaRules = {
    exists: true,
    count: metaCount,
    latest: metaCount > 0 ? content.match(/### META-(\d+)/g)?.pop()?.match(/\d+/)?.[0] : null
  };
}

// 读取最近 changelog
const logPath = path.join(aiDir, 'changelog', 'LOG.md');
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n').filter(l => l.startsWith('-'));

  result.changelog = {
    exists: true,
    total: lines.length,
    recent: lines.slice(-5)
  };
}

// Git 同步状态
const gitDir = path.join(aiDir, '.git');
if (fs.existsSync(gitDir)) {
  try {
    const gitConfig = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
    const hasRemote = gitConfig.includes('[remote "origin"]');

    if (hasRemote) {
      execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });

      const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
      const aheadCount = parseInt(execSync(`git rev-list origin/${localBranch}..HEAD --count`, { cwd: aiDir, encoding: 'utf-8' }).trim()) || 0;
      const behindCount = parseInt(execSync(`git rev-list HEAD..origin/${localBranch} --count`, { cwd: aiDir, encoding: 'utf-8' }).trim()) || 0;

      let syncStatus = 'synced';
      if (aheadCount > 0 && behindCount > 0) syncStatus = 'diverged';
      else if (aheadCount > 0) syncStatus = 'ahead';
      else if (behindCount > 0) syncStatus = 'behind';

      result.gitSync = {
        hasRemote: true,
        localBranch,
        aheadCount,
        behindCount,
        syncStatus
      };
    } else {
      result.gitSync = { hasRemote: false };
    }
  } catch (e) {
    result.gitSync = { error: e.message };
  }
} else {
  result.gitSync = { hasGitRepo: false };
}

// 生成摘要
result.summary = {
  workstate: result.workstate?.inProgress ? '有进行中任务' : '无进行中任务',
  requirements: result.requirements?.count || 0,
  errors: result.errors?.count || 0,
  metaRules: result.metaRules?.count || 0,
  gitSync: result.gitSync?.syncStatus || '无Git仓库'
};

console.log(JSON.stringify(result, null, 2));

// 辅助函数
function extractSection(content, sectionHeader) {
  const match = content.match(new RegExp(sectionHeader + '\n([^#]+)', 'm'));
  return match ? match[1].trim() : null;
}