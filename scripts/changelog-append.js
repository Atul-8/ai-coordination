#!/usr/bin/env node
/**
 * changelog-append 脚本 - 自动追加 changelog/LOG.md
 *
 * 用法：node changelog-append.js [project-root] [action-type] [description] [files]
 *
 * action-type: 完成 | 决策 | 修复 | 新增 | 删除 | 重构 | 测试 | 其他
 * description: 操作描述
 * files: 涉及文件（逗号分隔）
 *
 * 输出：JSON 格式的追加结果
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
const actionType = process.argv[3] || '其他';
const description = process.argv[4] || '';
const filesStr = process.argv[5] || '';
const files = filesStr.split(',').filter(f => f.trim());

const aiDir = path.join(projectRoot, '.ai');
const logPath = path.join(aiDir, 'changelog', 'LOG.md');

const result = {
  success: false,
  appended: false,
  entry: null,
  errors: []
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.errors.push('.ai/ 目录不存在');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

// 确保 changelog 目录存在
const changelogDir = path.join(aiDir, 'changelog');
if (!fs.existsSync(changelogDir)) {
  fs.mkdirSync(changelogDir, { recursive: true });
}

// 获取当前时间
const now = new Date();
const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

// 构建日志条目
const filesPart = files.length > 0 ? ` (涉及文件: ${files.join(', ')})` : '';
const entry = `- ${timeStr} [${actionType}] ${description}${filesPart}`;

// 读取或创建 LOG.md
let content = '';
if (fs.existsSync(logPath)) {
  content = fs.readFileSync(logPath, 'utf-8');
} else {
  content = `# 操作履历

此文件记录开发过程中的关键操作，按时间线追加。

---
`;
}

// 检查是否需要归档（超过 50KB 或 30 天）
const shouldArchive = content.length > 50000 || checkArchiveNeeded(content);

if (shouldArchive) {
  // 创建归档文件
  const archiveDate = now.toISOString().split('T')[0];
  const archivePath = path.join(changelogDir, `ARCHIVE-${archiveDate}.md`);

  // 提取旧记录（保留最近 10 条）
  const lines = content.split('\n').filter(l => l.startsWith('-'));
  const recentLines = lines.slice(-10);
  const oldLines = lines.slice(0, -10);

  // 写入归档文件
  const archiveContent = `# 操作履历归档 (${archiveDate})

${oldLines.join('\n')}
`;
  fs.writeFileSync(archivePath, archiveContent);
  result.archived = true;
  result.archiveFile = archivePath;

  // 更新 LOG.md，只保留最近 10 条
  content = `# 操作履历

此文件记录开发过程中的关键操作，按时间线追加。

---
${recentLines.join('\n')}
`;
}

// 追加新条目
content += entry + '\n';

// 写入文件
fs.writeFileSync(logPath, content);

result.success = true;
result.appended = true;
result.entry = entry;
result.totalLines = content.split('\n').filter(l => l.startsWith('-')).length;

console.log(JSON.stringify(result, null, 2));

// 辅助函数
function checkArchiveNeeded(content) {
  // 检查是否有超过 30 天的记录
  const lines = content.split('\n').filter(l => l.startsWith('-'));

  if (lines.length < 30) return false;

  // 提取第一条记录的时间（假设格式为 - HH:MM）
  // 由于没有日期信息，我们通过记录数量判断
  return lines.length > 100;
}