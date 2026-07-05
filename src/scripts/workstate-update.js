#!/usr/bin/env node
/**
 * workstate-update 脚本 - 自动更新 WORKSTATE.md
 *
 * 用法：node workstate-update.js [project-root] [action] [args...]
 *
 * action 类型：
 * - start <task-desc> - 开始新任务（添加到「正在进行」）
 * - progress <percent> - 更新进度
 * - interrupt <file> <operation> <next-step> - 设置中断点
 * - finish - 完成当前任务（移到「已完成」，清空「正在进行」）
 * - queue <task-desc> - 添加到「未完成队列」
 * - dequeue - 从「未完成队列」取出第一个作为「正在进行」
 * - verify <layer> - 标记某层验证通过（shared/core/interface/presentation）
 *
 * 输出：JSON 格式的更新结果
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
const action = process.argv[3] || '';
const args = process.argv.slice(4);

const aiDir = path.join(projectRoot, '.ai');
const workstatePath = path.join(aiDir, 'WORKSTATE.md');

const result = {
  success: false,
  action: action,
  updated: false,
  errors: []
};

// 检查 .ai/ 目录
if (!fs.existsSync(aiDir)) {
  result.errors.push('.ai/ 目录不存在');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

// 检查 WORKSTATE.md
if (!fs.existsSync(workstatePath)) {
  result.errors.push('WORKSTATE.md 不存在');
  console.log(JSON.stringify(result, null, 2));
  process.exit(1);
}

// 获取当前时间
const now = new Date();
const dateStr = now.toISOString().split('T')[0];
const timeStr = now.toTimeString().split(' ')[0].substring(0, 5);

// 读取当前内容
let content = fs.readFileSync(workstatePath, 'utf-8');

// 执行操作
switch (action) {
  case 'start':
    // 开始新任务
    const taskDesc = args[0] || '未命名任务';
    const newTask = `- [${taskDesc}] 进度: 0% | 上次更新: ${dateStr} ${timeStr}`;

    // 清空「正在进行」并添加新任务
    content = updateSection(content, '## 正在进行', newTask);
    result.updated = true;
    result.currentTask = taskDesc;
    break;

  case 'progress':
    // 更新进度
    const percent = args[0] || '0';

    // 更新「正在进行」中的进度
    content = content.replace(
      /(- \[.+?\]) 进度: \d+% \| 上次更新: .+/,
      `$1 进度: ${percent}% | 上次更新: ${dateStr} ${timeStr}`
    );
    result.updated = true;
    result.progress = percent;
    break;

  case 'interrupt':
    // 设置中断点
    const file = args[0] || '未知';
    const operation = args[1] || '未知';
    const nextStep = args[2] || '未知';

    const interruption = `- 文件: ${file}\n- 操作: ${operation}\n- 待恢复: ${nextStep}`;

    content = updateSection(content, '## 上次中断点', interruption);
    result.updated = true;
    result.interruption = { file, operation, nextStep };
    break;

  case 'finish':
    // 完成当前任务
    const inProgressMatch = content.match(/## 正在进行\n(- \[.+?\].+\n)/);

    if (inProgressMatch) {
      const completedTask = inProgressMatch[1].replace('进度:', '完成:').replace('| 上次更新:', '| 完成时间:');

      // 添加到「已完成」（如果存在该章节）
      if (content.includes('## 已完成')) {
        content = content.replace(/## 已完成\n/, '## 已完成\n' + completedTask);
      }

      // 清空「正在进行」
      content = updateSection(content, '## 正在进行', '- [无] 进度: 0% | 上次更新: ' + dateStr + ' ' + timeStr);

      result.updated = true;
      result.completedTask = inProgressMatch[1].trim();
    } else {
      result.errors.push('没有进行中的任务');
    }
    break;

  case 'queue':
    // 添加到未完成队列
    const queueTask = args[0] || '未命名任务';
    const queueEntry = `- [ ] ${queueTask} — 待开始`;

    // 添加到「未完成队列」
    if (content.includes('## 未完成队列')) {
      content = content.replace(/## 未完成队列\n/, '## 未完成队列\n' + queueEntry + '\n');
    } else {
      content += '\n## 未完成队列\n' + queueEntry + '\n';
    }

    result.updated = true;
    result.queuedTask = queueTask;
    break;

  case 'dequeue':
    // 从未完成队列取出第一个作为正在进行
    const queueMatch = content.match(/## 未完成队列\n(- \[ \] (.+?)\n)/);

    if (queueMatch) {
      const dequeuedTask = queueMatch[2].trim();
      const newInProgress = `- [${dequeuedTask}] 进度: 0% | 上次更新: ${dateStr} ${timeStr}`;

      // 移除队列中的第一个任务
      content = content.replace(queueMatch[1], '');

      // 设置为正在进行
      content = updateSection(content, '## 正在进行', newInProgress);

      result.updated = true;
      result.dequeuedTask = dequeuedTask;
    } else {
      result.errors.push('未完成队列中没有任务');
    }
    break;

  case 'verify':
    // 标记某层验证通过（G2.5 先验证后开发）
    // 用法：node workstate-update.js . verify shared
    const verifyLayer = args[0];
    const validLayers = ['shared', 'core', 'interface', 'presentation'];

    if (!verifyLayer || !validLayers.includes(verifyLayer)) {
      result.errors.push('无效的层名: ' + (verifyLayer || '(空)') + '，有效值: ' + validLayers.join(', '));
      break;
    }

    // 读取当前验证标记
    const verifyMatch = content.match(/\[验证: ([^\]]+)\]/);
    let verifyMap = {};

    if (verifyMatch) {
      // 解析已有标记，如 "shared✓ core✗"
      verifyMatch[1].split(/\s+/).forEach(part => {
        const layer = part.replace(/[✓✗]/g, '');
        const passed = part.includes('✓');
        if (validLayers.includes(layer)) {
          verifyMap[layer] = passed;
        }
      });
    }

    // 标记该层为已验证
    verifyMap[verifyLayer] = true;

    // 生成新的验证标记字符串
    const verifyStr = validLayers.map(l => l + (verifyMap[l] ? '✓' : '✗')).join(' ');
    const newVerifyTag = `[验证: ${verifyStr}]`;

    // 在「正在进行」任务行中追加或更新验证标记
    if (verifyMatch) {
      // 替换已有标记
      content = content.replace(/\[验证: [^\]]+\]/, newVerifyTag);
    } else {
      // 在「正在进行」行末尾追加
      content = content.replace(
        /(- \[.+?\]) 进度: (\d+% \| 上次更新: .+)/,
        `$1 进度: $2 ${newVerifyTag}`
      );
    }

    result.updated = true;
    result.verifiedLayer = verifyLayer;
    result.verificationStatus = verifyMap;
    break;

  default:
    result.errors.push('未知操作: ' + action);
    result.errors.push('可用操作: start, progress, interrupt, finish, queue, dequeue, verify');
}

// 写入更新后的内容
if (result.updated) {
  fs.writeFileSync(workstatePath, content);
  result.success = true;
}

console.log(JSON.stringify(result, null, 2));

// 辅助函数
function updateSection(content, sectionHeader, newContent) {
  // 找到章节并替换内容
  const regex = new RegExp(sectionHeader + '\n([^#]+)', 'm');
  return content.replace(regex, sectionHeader + '\n' + newContent + '\n');
}