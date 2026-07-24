#!/usr/bin/env node
/**
 * tasks.js — 任务表操作（PM 维护，专家读取）
 *
 * 用法：
 *   node tasks.js [project] add "<desc>" [--cat CATEGORY] [--to expert]
 *   node tasks.js [project] list [--status pending|doing|done]
 *   node tasks.js [project] start <TASK-NNN>   待办 → 进行中
 *   node tasks.js [project] done <TASK-NNN>    → 完成
 * 输出：JSON。零依赖。
 *
 * 任务表 .ai/TASKS.md 是 PM 与专家的协作看板：
 *   - [ ] TASK-NNN [CATEGORY] 描述 @expert   （pending）
 *   - [~] TASK-NNN ...                         （doing）
 *   - [x] TASK-NNN ...                         （done）
 */

const fs = require('fs');
const path = require('path');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
const action = process.argv[3];
const arg = process.argv[4];
const tasksPath = path.join(projectRoot, '.ai', 'TASKS.md');

function parseOpts(argv, start) {
  const o = {};
  for (let i = start; i < argv.length; i++) {
    if (argv[i].indexOf('--') === 0) {
      const k = argv[i].slice(2);
      o[k] = (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) ? argv[++i] : true;
    }
  }
  return o;
}
const opts = parseOpts(process.argv, 5);

const DEFAULT_TEMPLATE = [
  '# 任务表（PM 维护）',
  '',
  '> 开发者通过 `/ai:pm` 提需求 → PM 归类写入此表 → 专家按分配执行，互不干扰。',
  '> PM 用 `tasks.js` 维护；专家读取自己负责的任务（@expert）。',
  '',
  '## 待办（pending）',
  '',
  '## 进行中（doing）',
  '',
  '## 完成（done）',
  ''
].join('\n');

function ensureFile() {
  if (!fs.existsSync(tasksPath)) {
    fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
    fs.writeFileSync(tasksPath, DEFAULT_TEMPLATE);
  }
}

function readTasks() {
  const raw = fs.existsSync(tasksPath) ? fs.readFileSync(tasksPath, 'utf-8') : DEFAULT_TEMPLATE;
  const pending = [], doing = [], done = [];
  raw.split(/\r?\n/).forEach(line => {
    const m = line.match(/^-\s*\[\s\]\s*(TASK-\d+)\s*(.*)/);
    const d = line.match(/^-\s*\[~\]\s*(TASK-\d+)\s*(.*)/);
    const x = line.match(/^-\s*\[x\]\s*(TASK-\d+)\s*(.*)/);
    if (m) pending.push({ id: m[1], desc: m[2].trim() });
    else if (d) doing.push({ id: d[1], desc: d[2].trim() });
    else if (x) done.push({ id: x[1], desc: x[2].trim() });
  });
  return { pending, doing, done, raw };
}

function nextId(tasks) {
  const all = [].concat(tasks.pending, tasks.doing, tasks.done)
    .map(t => parseInt(t.id.replace('TASK-', ''), 10) || 0);
  const max = all.length ? Math.max.apply(null, all) : 0;
  return 'TASK-' + String(max + 1).padStart(3, '0');
}

function appendToSection(raw, line, sectionTitle) {
  const lines = raw.split(/\r?\n/);
  const idx = lines.findIndex(l => l.trim() === sectionTitle);
  if (idx === -1) return raw + '\n' + line + '\n';
  // 插到章节标题后、下一个章节/空行块前（收集连续任务行后追加）
  let insertAt = idx + 1;
  while (insertAt < lines.length && lines[insertAt].match(/^-\s*\[[ x~]\]/)) insertAt++;
  lines.splice(insertAt, 0, line);
  return lines.join('\n');
}

const out = { action, ok: false };

try {
  ensureFile();
  const tasks = readTasks();

  if (action === 'add') {
    if (!arg) throw new Error('用法: add "<desc>" [--cat X] [--to expert]');
    const id = nextId(tasks);
    const cat = opts.cat ? `[${opts.cat}]` : '';
    const to = opts.to ? `@${opts.to}` : '';
    const desc = [cat, arg, to].filter(Boolean).join(' ');
    const line = `- [ ] ${id} ${desc}`;
    const newRaw = appendToSection(tasks.raw, line, '## 待办（pending）');
    fs.writeFileSync(tasksPath, newRaw);
    out.ok = true;
    out.task = { id, desc, status: 'pending' };
  }

  else if (action === 'list') {
    out.ok = true;
    if (opts.status) out.tasks = tasks[opts.status] || [];
    else out.tasks = { pending: tasks.pending, doing: tasks.doing, done: tasks.done };
  }

  else if (action === 'start' || action === 'done') {
    if (!arg) throw new Error('用法: ' + action + ' <TASK-NNN>');
    const mark = action === 'start' ? '~' : 'x';
    const re = new RegExp('(^-\\s*)\\[[ x~]\\]\\s*' + arg + '\\b', 'm');
    if (!re.test(tasks.raw)) throw new Error('未找到任务: ' + arg);
    const newRaw = tasks.raw.replace(re, '$1[' + mark + '] ' + arg);
    fs.writeFileSync(tasksPath, newRaw);
    out.ok = true;
    out.task = { id: arg, status: action === 'start' ? 'doing' : 'done' };
  }

  else {
    throw new Error('未知 action: ' + action + '（支持: add/list/start/done）');
  }
} catch (e) {
  out.error = e.message;
}

console.log(JSON.stringify(out, null, 2));
