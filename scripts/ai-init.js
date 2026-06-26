#!/usr/bin/env node
/**
 * ai-init 脚本 - 初始化项目 .ai/ 对接层目录
 *
 * 用法：node ai-init.js [project-root] [remote-url]
 * 输出：JSON 格式的初始化结果
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const projectRoot = process.argv[2] || process.cwd();
const remoteUrl = process.argv[3] || '';
const aiDir = path.join(projectRoot, '.ai');

const result = {
  success: false,
  aiDir: aiDir,
  createdFiles: [],
  gitInitialized: false,
  remoteConfigured: false,
  errors: []
};

// 检查是否已存在
if (fs.existsSync(aiDir)) {
  const existingFiles = fs.readdirSync(aiDir);
  if (existingFiles.length > 0) {
    result.errors.push('.ai/ 目录已存在且非空');
    result.existingFiles = existingFiles;
    console.log(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

// 创建目录结构
const structure = {
  'README.md': null,
  'WORKSTATE.md': null,
  'STRUCTURE.md': null,
  'changelog/LOG.md': null,
  'requirements/': null,
  'errors/raw/': null,
  'errors/distilled/meta-rules.md': null
};

// 获取模板目录（从 ai-coordination 安装位置）
const scriptDir = __dirname;
const templateDir = path.join(scriptDir, '..', 'skills', 'coordination', 'assets');

// 创建目录和文件
Object.entries(structure).forEach(([relPath, defaultValue]) => {
  const fullPath = path.join(aiDir, relPath);

  if (relPath.endsWith('/')) {
    // 创建目录
    fs.mkdirSync(fullPath, { recursive: true });
    result.createdFiles.push(relPath);
  } else {
    // 创建文件
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });

    // 尝试从模板读取
    const templatePath = path.join(templateDir, relPath);
    let content = '';

    if (fs.existsSync(templatePath)) {
      content = fs.readFileSync(templatePath, 'utf-8');
    } else {
      // 使用默认模板
      content = getDefaultTemplate(relPath, projectRoot);
    }

    fs.writeFileSync(fullPath, content);
    result.createdFiles.push(relPath);
  }
});

// 分析项目结构并更新 STRUCTURE.md
const structurePath = path.join(aiDir, 'STRUCTURE.md');
let structureContent = fs.readFileSync(structurePath, 'utf-8');

// 扫描项目目录
const projectDirs = scanProjectDirs(projectRoot);
structureContent += '\n\n## 自动检测的目录映射\n\n';
structureContent += '| 目录 | 推测层级 | 说明 |\n';
structureContent += '|------|---------|------|\n';

projectDirs.forEach(dir => {
  const layer = detectLayer(dir);
  structureContent += `| ${dir} | ${layer || '未确定'} | |\n';
});

fs.writeFileSync(structurePath, structureContent);

// 初始化 Git 仓库
try {
  execSync('git init', { cwd: aiDir, stdio: 'pipe' });
  execSync('git add -A', { cwd: aiDir, stdio: 'pipe' });
  execSync('git commit -m "init: ai-coordination layer"', { cwd: aiDir, stdio: 'pipe' });
  result.gitInitialized = true;
} catch (e) {
  result.errors.push('Git 初始化失败: ' + e.message);
}

// 配置远程仓库
if (remoteUrl) {
  try {
    execSync('git remote add origin ' + remoteUrl, { cwd: aiDir, stdio: 'pipe' });
    result.remoteConfigured = true;
    result.remoteUrl = remoteUrl;
  } catch (e) {
    result.errors.push('远程仓库配置失败: ' + e.message);
  }
}

// 添加到项目 .gitignore
const gitignorePath = path.join(projectRoot, '.gitignore');
if (fs.existsSync(gitignorePath)) {
  const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
  if (!gitignoreContent.includes('.ai/')) {
    fs.appendFileSync(gitignorePath, '\n# ai-coordination layer\n.ai/\n');
    result.gitignoreUpdated = true;
  }
} else {
  fs.writeFileSync(gitignorePath, '# ai-coordination layer\n.ai/\n');
  result.gitignoreUpdated = true;
}

result.success = result.errors.length === 0;
result.message = result.success ? '初始化成功' : '初始化失败';

console.log(JSON.stringify(result, null, 2));

// 辅助函数
function getDefaultTemplate(relPath, projectRoot) {
  const projectName = path.basename(projectRoot);
  const date = new Date().toISOString().split('T')[0];

  switch (relPath) {
    case 'README.md':
      return `# .ai/ 目录说明

这是 ai-coordination 的对接层目录，用于开发状态持久化和上下文容灾。

## 目录结构

- WORKSTATE.md - 当前工作状态和中断点
- STRUCTURE.md - 代码结构地图
- changelog/LOG.md - 操作履历
- requirements/ - 需求记录
- errors/raw/ - 原始错误记录
- errors/distilled/ - META 规则汇总

## 共享策略

建议共享 errors/distilled/ 目录，这是提炼后的通用规则。
`;

    case 'WORKSTATE.md':
      return `# 当前工作状态

## 正在进行
- [待填写] 进度: 0% | 上次更新: ${date}

## 未完成队列
- [ ] 任务1 — 简要描述

## 上次中断点
- 文件: 无
- 操作: 初始化
- 待恢复: 开始第一个任务
`;

    case 'STRUCTURE.md':
      return `# 代码结构地图

## 七层架构映射

| 层级 | 目录 | 职责 |
|------|------|------|
| coordination | .ai/ | 开发状态持久化 |
| presentation | [待检测] | 用户交互 |
| interface | [待检测] | 对外接口 |
| core | [待检测] | 业务逻辑 |
| shared | [待检测] | 通用基础 |
| testing | [待检测] | 测试验证 |
| docs | [待检测] | 文档 |

上次更新: ${date}
`;

    case 'changelog/LOG.md':
      return `# 操作履历

- ${new Date().toTimeString().split(' ')[0].substring(0, 5)} [完成] 初始化 .ai/ 对接层 (涉及文件: .ai/*)
`;

    case 'errors/distilled/meta-rules.md':
      return `# META 规则汇总

此文件存储从错误中提炼的通用规则，可跨项目共享。

---

*初始化时无规则，后续通过五步法提炼自动追加*
`;

    default:
      return '';
  }
}

function scanProjectDirs(projectRoot) {
  const dirs = [];
  const excludeDirs = ['.ai', '.git', 'node_modules', 'dist', 'build', '.claude'];

  try {
    const entries = fs.readdirSync(projectRoot, { withFileTypes: true });
    entries.forEach(entry => {
      if (entry.isDirectory() && !excludeDirs.includes(entry.name) && !entry.name.startsWith('.')) {
        dirs.push(entry.name);

        // 递归扫描一层子目录
        try {
          const subEntries = fs.readdirSync(path.join(projectRoot, entry.name), { withFileTypes: true });
          subEntries.forEach(subEntry => {
            if (subEntry.isDirectory() && !excludeDirs.includes(subEntry.name)) {
              dirs.push(entry.name + '/' + subEntry.name);
            }
          });
        } catch (e) {}
      }
    });
  } catch (e) {}

  return dirs;
}

function detectLayer(dirPath) {
  const normalized = dirPath.toLowerCase();

  if (normalized.includes('ui') || normalized.includes('components') || normalized.includes('pages') || normalized.includes('views') || normalized.includes('app')) {
    return 'presentation';
  }
  if (normalized.includes('api') || normalized.includes('routes') || normalized.includes('controllers') || normalized.includes('handlers') || normalized.includes('interface')) {
    return 'interface';
  }
  if (normalized.includes('core') || normalized.includes('domain') || normalized.includes('services') || normalized.includes('business') || normalized.includes('models')) {
    return 'core';
  }
  if (normalized.includes('shared') || normalized.includes('utils') || normalized.includes('lib') || normalized.includes('common') || normalized.includes('helpers')) {
    return 'shared';
  }
  if (normalized.includes('test') || normalized.includes('tests') || normalized.includes('__tests__') || normalized.includes('spec')) {
    return 'testing';
  }
  if (normalized.includes('docs') || normalized.includes('documentation')) {
    return 'docs';
  }

  return null;
}