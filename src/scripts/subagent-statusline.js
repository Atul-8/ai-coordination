#!/usr/bin/env node
/**
 * subagent-statusline.js — Claude Code subagentStatusLine 渲染脚本（② 运行中 subagent 面板）
 *
 * 渲染输入框下方 agent 面板中每个 subagent。这是显示「PM 此刻调度了哪个专家」的官方机制。
 *
 * 输入（stdin JSON）：{ tasks: [ { id, type, status, tokenCount, description, label, ... } ] }
 *   - type        = 任务分类（local_agent / remote_agent），【非】agent slug
 *   - description = PM spawn 时传入的任务描述（agent 身份应写在此处）
 *   - status      = 运行状态（running/completed/...）
 *   - tokenCount  = 已耗 token
 *   ⚠ harness 不提供 subagent 类型 slug，无法查 agent 中文名映射 → 改显 description
 * 输出协议：每个 task 输出一行 JSON → { "id": "<task.id>", "content": "<渲染内容>" }
 *   - content 支持 ANSI 颜色；省略某 id 保留默认渲染；空 content 隐藏该行
 * 容错：stdin 非法 JSON / 无 tasks / 异常 → 静默不输出（绝不报错，避免面板报错）
 * 依赖：./lib/agent-names 的 getDisplayName（slug → 中文显示名）
 * 零依赖（fs 均为 Node 内置）。
 *
 * 用法（settings.json）：
 *   "subagentStatusLine": {
 *     "type": "command",
 *     "command": "node \"<plugin-dir>/src/scripts/subagent-statusline.js\""
 *   }
 */

const fs = require('fs');

// 同步读 stdin（fd 0）。statusLine 经管道收 JSON；读失败返回空串。
function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

// ANSI 颜色码
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

// 状态宽松匹配 → { label, color }；未知状态返回 null（不显示）
function mapStatus(status) {
  const s = String(status || '').toLowerCase();
  if (/running|active|in_progress|executing|busy/.test(s)) return { label: '⚡ 运行中', color: C.green };
  if (/completed|done|success|finished|complete/.test(s)) return { label: '✓ 完成', color: C.gray };
  if (/error|failed|fail/.test(s)) return { label: '✗ 出错', color: C.red };
  if (/pending|queued|waiting|idle/.test(s)) return { label: '… 等待', color: C.yellow };
  return null;
}

// token 数格式化：1234 → '1.2k'，25 → '25'，≤0 → ''
function fmtTokens(n) {
  n = Number(n) || 0;
  if (n <= 0) return '';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(n);
}

// 渲染单个 task → content 字符串
function renderTask(task) {
  // harness 不提供 subagent 类型 slug（task.type 是 local_agent 任务分类），
  // 故主显示名取 description/label；PM 调度时应把 agent 身份写入 description。
  const name = task.description || task.label || task.type || 'subagent';
  const st = mapStatus(task.status);
  const parts = [`${C.cyan}🧑‍💻 ${name}${C.reset}`];
  if (st) parts.push(`${st.color}${st.label}${C.reset}`);
  const tk = fmtTokens(task.tokenCount);
  if (tk) parts.push(`${C.gray}· ${tk}${C.reset}`);
  return parts.join(' ');
}

// 主流程：任何异常都静默吞掉（statusLine 报错会污染面板）
try {
  const data = JSON.parse(readStdinSync());
  const tasks = Array.isArray(data && data.tasks) ? data.tasks : [];
  const lines = [];
  for (const task of tasks) {
    if (!task || !task.id) continue;          // 无 id 无法回填 → 跳过（保留默认渲染）
    lines.push(JSON.stringify({ id: task.id, content: renderTask(task) }));
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch (e) {
  // 静默：非法 JSON 或异常 → 不输出，保留 Claude Code 默认渲染
}
