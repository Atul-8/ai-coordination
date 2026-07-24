#!/usr/bin/env node
/**
 * pa-inbox.js — PA 消息队列操作（生产者 + 列表 + ACK）
 *
 * 用法：
 *   produce  <project> --from <agent> [--cat <CATEGORY>] [--err ERR-NNN]
 *                       [--layer "a,b"] [--keywords "x,y"] [--rule-file <path>]
 *                       [--rule-text "<inline>"] [--evidence "<inline>"]
 *                       生成一条 MSG-*.md 到 .ai/pa-inbox/，返回文件名
 *
 *   list     <project>                          列出 inbox 中所有待处理消息
 *   ack      <project> <MSG-filename>           删除指定消息（PA 消费成功后调用）
 *   fail     <project> <MSG-filename> <reason>  标记消息处理失败（不删，加 # FAILED 头）
 *
 * 协议：消息文件 = 单 markdown，frontmatter + 规律草稿 + 证据。
 * 生产者（任何 agent）写完即返回，不阻塞；PA drain 时消费并 ACK（删除）。
 *
 * 输出：JSON。零依赖（fs/path）。
 */

const fs = require('fs');
const path = require('path');

const projectRoot = process.argv[2] || process.cwd();
// 校验：projectRoot 必须是存在的目录（防 slug 误用导致静默写到错误位置，见 ERR-007）
// 用户/agent 可能传 "ai-coordination" 这种 slug，会被 path.join 解析成相对路径 → 写到 cwd/ai-coordination/.ai/pa-inbox/（错误位置）
// 正确用法：<project> = "." 或绝对路径如 "E:/AI/my-project"
if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
  console.log(JSON.stringify({
    ok: false,
    error: `<project> 路径不存在或非目录: "${projectRoot}"。应为项目根路径（如 . 或 E:/AI/my-project），不是项目名 slug。详见 ERR-007 / META-002-API_CONTRACT`
  }, null, 2));
  process.exit(1);
}
const action = process.argv[3];

// 智能解析：--xxx val 成 opts，孤立非 -- 开头的进 _（位置参数）
// 这样 produce（无位置参数）和 ack/fail（有 MSG 文件名）都能正确工作
function parseOpts(argv, startIdx) {
  const o = { _: [] };
  for (let i = startIdx; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) ? argv[++i] : true;
      o[key] = val;
    } else {
      o._.push(a);
    }
  }
  return o;
}
const opts = parseOpts(process.argv, 4);
const arg = opts._[0];           // 第一个位置参数（ack/fail 的 MSG 文件名）
const failReason = opts._[1];    // 第二个位置参数（fail 的 reason）

const { inboxDir } = require('./lib/meta-paths');
const inbox = inboxDir(projectRoot);

function ensureInbox() {
  if (!fs.existsSync(inbox)) fs.mkdirSync(inbox, { recursive: true });
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate())
    + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
}

function slugify(s) {
  // 仅保留 ASCII（中文文件名在某些 git/Windows 组合下易乱码），截断到 20 字符
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20) || 'msg';
}

const out = { action, ok: false };

try {
  if (action === 'produce') {
    if (!opts.from) throw new Error('缺少 --from <agent>');
    ensureInbox();

    // 规律草稿：优先 --rule-file，其次 --rule-text
    let ruleDraft = '';
    if (opts['rule-file']) {
      if (!fs.existsSync(opts['rule-file'])) throw new Error('--rule-file 不存在: ' + opts['rule-file']);
      ruleDraft = fs.readFileSync(opts['rule-file'], 'utf-8').trim();
    } else if (opts['rule-text']) {
      ruleDraft = String(opts['rule-text']).trim();
    } else {
      ruleDraft = '_（生产者未提供规律草稿，PA 需从证据自行提炼）_';
    }

    const evidence = opts.evidence ? String(opts.evidence).trim() : '_（无附加证据）_';
    const titleHint = opts.title || (ruleDraft.split('\n')[0].slice(0, 40) || 'meta-rule');
    const slug = slugify(titleHint);
    const filename = `MSG-${timestamp()}-${slug}.md`;
    const fp = path.join(inbox, filename);

    const layer = opts.layer || '';
    const keywords = opts.keywords || '';
    const cat = (opts.cat || '').toUpperCase();

    const content = [
      '---',
      'from: ' + opts.from,
      opts.err ? 'source_err: ' + opts.err : '',
      cat ? 'suggested_category: ' + cat : '',
      layer ? 'layer: [' + layer + ']' : '',
      keywords ? 'keywords: [' + keywords + ']' : '',
      'produced_at: ' + new Date().toISOString(),
      '---',
      '',
      '# 待沉淀：' + titleHint,
      '',
      '## 规律草稿',
      '',
      ruleDraft,
      '',
      '## 证据 / 上下文',
      '',
      evidence,
      '',
      '---',
      '> 此消息由 ' + opts.from + ' 生产。PA agent 消费后应删除本文件（ACK）。',
      '> 若分类/查重失败，加 `# FAILED: <原因>` 标记后保留，等待人工或下次重试。',
      ''
    ].filter(l => l !== '' || true).join('\n');

    fs.writeFileSync(fp, content);
    out.ok = true;
    out.message_file = filename;
    out.message_path = fp;
    out.notice = '已生产消息到 inbox。请在返回 PM 的报告里说明："已生产 ' + filename + ' 到 pa-inbox，请调度 PA 消费"';
  }

  else if (action === 'list') {
    ensureInbox();
    const files = fs.readdirSync(inbox)
      .filter(f => /^MSG-.*\.md$/.test(f))
      .sort();
    out.ok = true;
    out.total = files.length;
    out.messages = files.map(f => {
      const content = fs.readFileSync(path.join(inbox, f), 'utf-8');
      const failed = content.match(/^# FAILED:\s*(.+)$/m);
      const fromM = content.match(/^from:\s*(.+)$/m);
      const catM = content.match(/^suggested_category:\s*(.+)$/m);
      const errM = content.match(/^source_err:\s*(.+)$/m);
      return {
        file: f,
        from: fromM ? fromM[1].trim() : null,
        suggested_category: catM ? catM[1].trim() : null,
        source_err: errM ? errM[1].trim() : null,
        status: failed ? 'FAILED: ' + failed[1] : 'PENDING'
      };
    });
  }

  else if (action === 'ack') {
    if (!arg) throw new Error('用法: ack <project> <MSG-filename>');
    ensureInbox();
    const fp = path.join(inbox, arg);
    if (!fs.existsSync(fp)) throw new Error('消息不存在: ' + arg);
    fs.unlinkSync(fp);
    out.ok = true;
    out.acked = arg;
  }

  else if (action === 'fail') {
    if (!arg) throw new Error('用法: fail <project> <MSG-filename> <reason>');
    const reason = failReason || 'unknown';
    ensureInbox();
    const fp = path.join(inbox, arg);
    if (!fs.existsSync(fp)) throw new Error('消息不存在: ' + arg);
    const content = fs.readFileSync(fp, 'utf-8');
    if (/^# FAILED:/m.test(content)) {
      out.ok = true; out.note = '已有 FAILED 标记，跳过';
    } else {
      fs.writeFileSync(fp, '# FAILED: ' + reason + '\n\n' + content);
      out.ok = true; out.marked_failed = arg; out.reason = reason;
    }
  }

  else {
    throw new Error('未知 action: ' + action + '（支持: produce/list/ack/fail）');
  }
} catch (e) {
  out.ok = false;
  out.error = e.message;
}

console.log(JSON.stringify(out, null, 2));
