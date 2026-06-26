#!/usr/bin/env node
/**
 * G1 开门三件事检查脚本
 * 执行 G1 规则的全部检查步骤，输出汇总报告
 *
 * 用法：node g1-check.js [project-root]
 * 输出：JSON 格式的检查结果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const aiDir = path.join(projectRoot, '.ai');

const result = {
  hasAiDir: false,
  isDevSession: true, // 默认假设是开发会话
  workstate: null,
  metaRules: null,
  gitSync: null,
  sessionPlan: null,
  errors: []
};

// 1. 检查 .ai/ 目录是否存在
if (!fs.existsSync(aiDir)) {
  result.hasAiDir = false;
  result.errors.push('项目未启用 ai-coordination（无 .ai/ 目录）');
  console.log(JSON.stringify(result, null, 2));
  process.exit(0); // 不阻止，只是报告状态
}

result.hasAiDir = true;

// 2. 读取 WORKSTATE.md
const workstatePath = path.join(aiDir, 'WORKSTATE.md');
if (fs.existsSync(workstatePath)) {
  const content = fs.readFileSync(workstatePath, 'utf-8');

  // 提取关键信息
  const inProgressMatch = content.match(/## 正在进行\n(- .+\n)+/);
  const unfinishedMatch = content.match(/## 未完成队列\n((- \[ \].+\n)+)?/);
  const interruptionMatch = content.match(/## 上次中断点\n(- 文件: .+\n- 操作: .+\n- 待恢复: .+)?/);

  result.workstate = {
    exists: true,
    inProgress: inProgressMatch ? inProgressMatch[0].trim() : null,
    unfinished: unfinishedMatch ? unfinishedMatch[0].trim() : null,
    interruption: interruptionMatch ? interruptionMatch[0].trim() : null,
    lastUpdate: content.match(/上次更新: (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/)?.[1] || null
  };
} else {
  result.workstate = { exists: false };
  result.errors.push('WORKSTATE.md 不存在');
}

// 3. 读取 meta-rules.md
const metaRulesPath = path.join(aiDir, 'errors', 'distilled', 'meta-rules.md');
if (fs.existsSync(metaRulesPath)) {
  const content = fs.readFileSync(metaRulesPath, 'utf-8');
  const metaCount = (content.match(/### META-/g) || []).length;

  result.metaRules = {
    exists: true,
    count: metaCount,
    lastMetaId: content.match(/### META-(\d+)/g)?.pop()?.match(/\d+/)?.[0] || '000'
  };
} else {
  result.metaRules = { exists: false, count: 0 };
  result.errors.push('meta-rules.md 不存在');
}

// 4. Git 一致性检查
const gitDir = path.join(aiDir, '.git');
if (fs.existsSync(gitDir)) {
  try {
    // 检查是否有远程仓库
    const gitConfig = fs.readFileSync(path.join(gitDir, 'config'), 'utf-8');
    const hasRemote = gitConfig.includes('[remote "origin"]');

    if (hasRemote) {
      // 执行 fetch
      execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });

      // 获取本地和远程分支
      const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
      const remoteBranch = 'origin/' + localBranch;

      // 比较差异
      const localCommit = execSync('git rev-parse HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
      const remoteCommit = execSync('git rev-parse ' + remoteBranch, { cwd: aiDir, encoding: 'utf-8' }).trim();

      const aheadCount = parseInt(execSync(`git rev-list ${remoteBranch}..HEAD --count`, { cwd: aiDir, encoding: 'utf-8' }).trim()) || 0;
      const behindCount = parseInt(execSync(`git rev-list HEAD..${remoteBranch} --count`, { cwd: aiDir, encoding: 'utf-8' }).trim()) || 0;

      let syncStatus = 'synced';
      if (aheadCount > 0 && behindCount > 0) syncStatus = 'diverged';
      else if (aheadCount > 0) syncStatus = 'ahead';
      else if (behindCount > 0) syncStatus = 'behind';

      result.gitSync = {
        hasRemote: true,
        localBranch,
        remoteBranch,
        localCommit,
        remoteCommit,
        aheadCount,
        behindCount,
        syncStatus
      };

      // 自动处理同步
      if (syncStatus === 'behind') {
        execSync('git pull origin ' + localBranch, { cwd: aiDir, stdio: 'pipe' });
        result.gitSync.action = 'pulled';
      } else if (syncStatus === 'ahead') {
        execSync('git push origin ' + localBranch, { cwd: aiDir, stdio: 'pipe' });
        result.gitSync.action = 'pushed';
      } else if (syncStatus === 'diverged') {
        result.gitSync.action = 'needs-resolve';
        result.errors.push('本地与远程有冲突，需手动解决');
      }
    } else {
      result.gitSync = { hasRemote: false };
    }
  } catch (e) {
    result.gitSync = { error: e.message };
    result.errors.push('Git 操作失败: ' + e.message);
  }
} else {
  result.gitSync = { hasGitRepo: false };
}

// 5. 生成会话计划建议
if (result.workstate?.interruption) {
  result.sessionPlan = {
    suggestion: '根据上次中断点续接工作',
    interruption: result.workstate.interruption
  };
} else if (result.workstate?.inProgress) {
  result.sessionPlan = {
    suggestion: '继续进行中的任务',
    inProgress: result.workstate.inProgress
  };
} else {
  result.sessionPlan = {
    suggestion: '无进行中任务，可开始新任务'
  };
}

// 输出结果
console.log(JSON.stringify(result, null, 2));