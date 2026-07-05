#!/usr/bin/env node
/**
 * G3 错误五步法提炼脚本
 * 自动执行五步法分析并生成 ERR 和 META 文件
 *
 * 用法：node g3-error.js [project-root] [error-type] [error-message] [affected-files]
 * 输出：生成的 ERR-NNN.md 内容
 *
 * 参数：
 * - error-type: 错误类型（TypeError, ReferenceError, BuildError, TestError 等）
 * - error-message: 错误信息（简短描述）
 * - affected-files: 涉及文件（逗号分隔）
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const errorType = process.argv[3] || 'UnknownError';
const errorMessage = process.argv[4] || '';
const affectedFilesStr = process.argv[5] || '';
const affectedFiles = affectedFilesStr.split(',').filter(f => f.trim());

const aiDir = path.join(projectRoot, '.ai');
const errorsRawDir = path.join(aiDir, 'errors', 'raw');
const metaRulesPath = path.join(aiDir, 'errors', 'distilled', 'meta-rules.md');

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  console.error('项目未启用 ai-coordination');
  process.exit(1);
}

// 确保目录存在
if (!fs.existsSync(errorsRawDir)) {
  fs.mkdirSync(errorsRawDir, { recursive: true });
}
if (!fs.existsSync(path.join(aiDir, 'errors', 'distilled'))) {
  fs.mkdirSync(path.join(aiDir, 'errors', 'distilled'), { recursive: true });
}

// 获取下一个 ERR 编号
function getNextErrNumber() {
  // 先检查远程是否有更新（如果有 Git 仓库）
  const gitDir = path.join(aiDir, '.git');
  if (fs.existsSync(gitDir)) {
    try {
      execSync('git fetch origin', { cwd: aiDir, stdio: 'pipe' });
      execSync('git pull origin main 2>/dev/null || git pull origin master 2>/dev/null', { cwd: aiDir, stdio: 'pipe' });
    } catch (e) {
      // 忽略 Git 错误
    }
  }

  // 扫描现有 ERR 文件
  const existingFiles = fs.readdirSync(errorsRawDir).filter(f => f.startsWith('ERR-') && f.endsWith('.md'));
  const existingNumbers = existingFiles.map(f => parseInt(f.match(/ERR-(\d+)/)?.[1] || '0'));

  const maxNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) : 0;
  return maxNumber + 1;
}

const errNumber = getNextErrNumber();
const errId = `ERR-${String(errNumber).padStart(3, '0')}`;
const errFileName = `${errId}.md`;
const errFilePath = path.join(errorsRawDir, errFileName);

// 获取当前时间
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

// 生成 ERR 文件内容（五步法模板）
const errContent = `### ${errId}: ${errorType} - ${errorMessage}

- **症状**: ${errorMessage}
- **根因**: [待分析 - 连问 3 个为什么找到深层原因]
- **修复**: [待记录 - 具体修复方式]
- **规律提炼**: [待抽象 - 从此错误抽象出的通用规则]
- **二次提炼接口**: [待生成 - 可跨项目复用的检查项/编码规范]
- **首次出现**: ${dateStr}
- **复现次数**: 1
- **涉及文件**: ${affectedFiles.join(', ')}

## 五步法分析过程

### 第一步：症状记录
- 表面现象：${errorMessage}
- 错误类型：${errorType}
- 触发场景：[待补充]

### 第二步：根因分析（连问 3 个为什么）
1. 为什么会出现这个错误？
   - [待分析]
2. 为什么会有这个深层原因？
   - [待分析]
3. 为什么会有这个根本原因？
   - [待分析]

**最终根因**：[待确定]

### 第三步：修复方式
- [待记录具体修复步骤]

### 第四步：规律提炼
- [待抽象通用规则]

### 第五步：二次提炼接口（META 规则）
- [待生成 META-XXX 规则]

---
*此文件由 G3 错误自动捕获脚本生成，需人工补充分析内容*
`;

// 写入 ERR 文件
fs.writeFileSync(errFilePath, errContent);

// 输出结果
const result = {
  errId,
  errFile: errFilePath,
  created: true,
  message: `已创建 ${errId}，需人工补充五步法分析内容`,
  nextStep: '请补充根因分析、修复方式、规律提炼，完成后若提炼出 META 规则则追加到 meta-rules.md'
};

console.log(JSON.stringify(result, null, 2));

// 如果有 Git 仓库，提交变更
if (fs.existsSync(gitDir)) {
  try {
    execSync('git add ' + errFilePath, { cwd: aiDir, stdio: 'pipe' });
    execSync('git commit -m "error: add ' + errId + ' - ' + errorMessage + '"', { cwd: aiDir, stdio: 'pipe' });
    result.gitCommitted = true;
  } catch (e) {
    result.gitCommitted = false;
    result.gitError = e.message;
  }
}