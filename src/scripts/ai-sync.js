#!/usr/bin/env node
/**
 * ai-sync 脚本 - 同步 .ai/ 目录到云端 Git 仓库
 *
 * 用法：node ai-sync.js [project-root] [remote-url]
 * 输出：JSON 格式的同步结果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const remoteUrl = process.argv[3] || '';
const aiDir = path.join(projectRoot, '.ai');

const result = {
  success: false,
  hasAiDir: false,
  gitInitialized: false,
  remoteConfigured: false,
  conflictsResolved: [],
  committed: false,
  pushed: false,
  errors: []
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.hasAiDir = false;
  result.errors.push('.ai/ 目录不存在，请先运行 /ai:init');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

result.hasAiDir = true;

// 检查 Git 仓库
const gitDir = path.join(aiDir, '.git');
if (!fs.existsSync(gitDir)) {
  try {
    execSync('git init', { cwd: aiDir, stdio: 'pipe' });
    execSync('git add -A', { cwd: aiDir, stdio: 'pipe' });
    execSync('git commit -m "init: ai-coordination layer"', { cwd: aiDir, stdio: 'pipe' });
    result.gitInitialized = true;
  } catch (e) {
    result.errors.push('Git 初始化失败: ' + e.message);
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
} else {
  result.gitInitialized = true;
}

// 配置远程仓库
let hasRemote = false;
try {
  const remoteOutput = execSync('git remote -v', { cwd: aiDir, encoding: 'utf-8' });
  hasRemote = remoteOutput.includes('origin');
} catch (e) {}

if (remoteUrl && !hasRemote) {
  try {
    execSync('git remote add origin ' + remoteUrl, { cwd: aiDir, stdio: 'pipe' });
    result.remoteConfigured = true;
    result.remoteUrl = remoteUrl;
    hasRemote = true;
  } catch (e) {
    result.errors.push('远程仓库配置失败: ' + e.message);
  }
} else if (remoteUrl && hasRemote) {
  // 检查是否需要更新远程 URL
  try {
    const currentRemote = execSync('git remote get-url origin', { cwd: aiDir, encoding: 'utf-8' }).trim();
    if (currentRemote !== remoteUrl) {
      execSync('git remote set-url origin ' + remoteUrl, { cwd: aiDir, stdio: 'pipe' });
      result.remoteUrl = remoteUrl;
      result.remoteUpdated = true;
    }
  } catch (e) {}
}

// 冲突检测与编号顺延
if (hasRemote) {
  try {
    execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });

    // 检查 ERR/META 编号冲突
    const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
    const remoteBranch = 'origin/' + localBranch;

    // 获取本地和远程的 ERR/META 文件列表
    const localErrFiles = fs.readdirSync(path.join(aiDir, 'errors', 'raw')).filter(f => f.startsWith('ERR-') && f.endsWith('.md'));
    const localMetaContent = fs.readFileSync(path.join(aiDir, 'errors', 'distilled', 'meta-rules.md'), 'utf-8');
    const localMetaIds = (localMetaContent.match(/META-\d+/g) || []);

    // 获取远程的 ERR/META 文件列表（通过 git show）
    let remoteErrFiles = [];
    let remoteMetaIds = [];

    try {
      const remoteErrList = execSync(`git show ${remoteBranch}:errors/raw/ 2>/dev/null || echo ""`, { cwd: aiDir, encoding: 'utf-8' });
      remoteErrFiles = remoteErrList.split('\n').filter(f => f.startsWith('ERR-') && f.endsWith('.md'));

      const remoteMetaContent = execSync(`git show ${remoteBranch}:errors/distilled/meta-rules.md 2>/dev/null || echo ""`, { cwd: aiDir, encoding: 'utf-8' });
      remoteMetaIds = (remoteMetaContent.match(/META-\d+/g) || []);
    } catch (e) {}

    // 检测冲突
    const localErrIds = localErrFiles.map(f => f.match(/ERR-(\d+)/)?.[1]);
    const remoteErrIds = remoteErrFiles.map(f => f.match(/ERR-(\d+)/)?.[1]);

    const errConflicts = localErrIds.filter(id => remoteErrIds.includes(id));
    const metaConflicts = localMetaIds.map(m => m.match(/\d+/)?.[0]).filter(id => remoteMetaIds.map(m => m.match(/\d+/)?.[0]).includes(id));

    // 解决冲突：本地编号顺延
    if (errConflicts.length > 0 || metaConflicts.length > 0) {
      const maxRemoteErrId = Math.max(...remoteErrIds.map(id => parseInt(id) || 0), 0);
      const maxRemoteMetaId = Math.max(...remoteMetaIds.map(id => parseInt(id) || 0), 0);

      // 顺延 ERR 编号
      errConflicts.forEach(conflictId => {
        const newId = maxRemoteErrId + 1;
        const oldFile = `ERR-${conflictId}.md`;
        const newFile = `ERR-${String(newId).padStart(3, '0')}.md`;

        const oldPath = path.join(aiDir, 'errors', 'raw', oldFile);
        const newPath = path.join(aiDir, 'errors', 'raw', newFile);

        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);

          // 更新文件内容中的编号引用
          let content = fs.readFileSync(newPath, 'utf-8');
          content = content.replace(new RegExp(`ERR-${conflictId}`, 'g'), `ERR-${String(newId).padStart(3, '0')}`);
          fs.writeFileSync(newPath, content);

          result.conflictsResolved.push({ type: 'ERR', oldId: conflictId, newId: String(newId).padStart(3, '0') });
        }
      });

      // 顺延 META 编号
      metaConflicts.forEach(conflictId => {
        const newId = maxRemoteMetaId + 1;
        const oldMeta = `META-${conflictId}`;
        const newMeta = `META-${String(newId).padStart(3, '0')}`;

        // 更新 meta-rules.md
        let metaContent = fs.readFileSync(path.join(aiDir, 'errors', 'distilled', 'meta-rules.md'), 'utf-8');
        metaContent = metaContent.replace(new RegExp(oldMeta, 'g'), newMeta);
        fs.writeFileSync(path.join(aiDir, 'errors', 'distilled', 'meta-rules.md'), metaContent);

        result.conflictsResolved.push({ type: 'META', oldId: conflictId, newId: String(newId).padStart(3, '0') });
      });
    }
  } catch (e) {
    result.errors.push('冲突检测失败: ' + e.message);
  }
}

// 提交变更
try {
  const statusOutput = execSync('git status --porcelain', { cwd: aiDir, encoding: 'utf-8' });

  if (statusOutput.trim().length > 0) {
    execSync('git add -A', { cwd: aiDir, stdio: 'pipe' });
    const commitMsg = 'sync: ' + new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '_' + new Date().toTimeString().split(' ')[0].replace(/:/g, '');
    execSync('git commit -m "' + commitMsg + '"', { cwd: aiDir, stdio: 'pipe' });
    result.committed = true;
    result.commitMessage = commitMsg;
  } else {
    result.committed = false;
    result.message = '无变更需要提交';
  }
} catch (e) {
  result.errors.push('提交失败: ' + e.message);
}

// 推送到远程
if (hasRemote && result.committed) {
  try {
    const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();

    // 先 pull（rebase）
    try {
      execSync('git pull origin ' + localBranch + ' --rebase', { cwd: aiDir, stdio: 'pipe' });
    } catch (e) {
      // 可能是首次推送，忽略 pull 错误
    }

    // 推送
    execSync('git push -u origin ' + localBranch, { cwd: aiDir, stdio: 'pipe' });
    result.pushed = true;
    result.branch = localBranch;
  } catch (e) {
    result.errors.push('推送失败: ' + e.message);
  }
}

// 验证同步
if (result.pushed) {
  try {
    execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });
    const localBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: aiDir, encoding: 'utf-8' }).trim();
    const diffOutput = execSync('git diff HEAD origin/' + localBranch, { cwd: aiDir, encoding: 'utf-8' });

    if (diffOutput.trim().length === 0) {
      result.verified = true;
      result.message = '同步验证成功：本地与远程一致';
    } else {
      result.verified = false;
      result.errors.push('同步验证失败：本地与远程有差异');
    }
  } catch (e) {
    result.verified = false;
    result.errors.push('同步验证失败: ' + e.message);
  }
}

result.success = result.errors.length === 0;

console.log(JSON.stringify(result, null, 2));