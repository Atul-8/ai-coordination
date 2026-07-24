#!/usr/bin/env node
/**
 * agent-fetch.js — 从 agency-agents-zh 按需拉取单个 agent，框架封装后登记
 *
 * 用法：node agent-fetch.js [project-root] <agent-key> [--to global|stash]
 *   agent-key 格式：
 *     完整：agency-agents-zh:engineering/engineering-code-reviewer.md
 *     简写：code-reviewer（默认 engineering 部门，自动补全路径与前缀）
 *     带部门：testing/api-tester
 *   --to global  缓存到 ~/.ai-coordination/agents/（默认）
 *   --to stash   直接放项目 .ai/agents/stash/ 并登记 registry（lifecycle=on-demand）
 * 输出：JSON。零依赖（Node 内置 https + agent-format.js）。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { wrap, slugFromKey } = require('./lib/agent-format');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
const agentKey = process.argv[3];

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
const opts = parseOpts(process.argv, 4);

const REMOTE_BASE = 'https://raw.githubusercontent.com/jnMetaCode/agency-agents-zh/main/';
const globalAgentsDir = path.join(os.homedir(), '.ai-coordination', 'agents');

// agent-key → 远程相对路径
function resolveRemotePath(agentKey) {
  let p = agentKey;
  const prefix = 'agency-agents-zh:';
  if (p.startsWith(prefix)) p = p.slice(prefix.length);
  if (p.indexOf('/') === -1) {
    // 无部门：默认 engineering，补部门前缀
    const dept = 'engineering';
    const fname = p.replace(/^engineering-/, '');
    p = dept + '/' + dept + '-' + fname;
  }
  if (!p.endsWith('.md')) p = p + '.md';
  return p;
}

function fetch(url, redirects) {
  redirects = redirects || 0;
  if (redirects > 5) return Promise.reject(new Error('重定向过多'));
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        res.resume();
        return resolve(fetch(res.headers.location, redirects + 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error('HTTP ' + res.statusCode + '（检查 agent-key 拼写 / 部门路径）: ' + url));
      }
      let data = '';
      res.setEncoding('utf-8');
      res.on('data', c => data += c);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(new Error('请求超时')); });
  });
}

const out = { agent_key: agentKey, ok: false };

(async () => {
  try {
    if (!agentKey) throw new Error('用法: agent-fetch.js [project-root] <agent-key> [--to global|stash]');
    const relPath = resolveRemotePath(agentKey);
    const url = REMOTE_BASE + relPath;
    out.url = url;

    const raw = await fetch(url);
    out.fetched_bytes = raw.length;

    const wrapped = wrap(raw, 'agency-agents-zh:' + relPath, { source: 'agency-agents-zh:' + relPath });
    out.slug = wrapped.slug;
    out.display_name = wrapped.display_name;

    const destDir = opts.to === 'stash'
      ? path.join(projectRoot, '.ai', 'agents', 'stash')
      : globalAgentsDir;
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, wrapped.slug + '.md');
    fs.writeFileSync(dest, wrapped.content);
    out.written_to = dest;

    if (opts.to === 'stash') {
      const regPath = path.join(projectRoot, '.ai', 'agents', 'registry.json');
      let reg;
      try { reg = JSON.parse(fs.readFileSync(regPath, 'utf-8')); } catch (e) { reg = { schema_version: 1, agents: [] }; }
      reg.agents = reg.agents.filter(a => a.name !== wrapped.slug);
      reg.agents.push({
        name: wrapped.slug,
        display_name: wrapped.display_name,
        lifecycle: 'on-demand',
        active: false,
        category: relPath.split('/')[0] || 'uncategorized',
        layer_focus: [],
        triggers: [],
        source: 'agency-agents-zh:' + relPath,
        physical_path: '.ai/agents/stash/' + wrapped.slug + '.md',
        rag_text: wrapped.slug + ' ' + wrapped.display_name + ' ' + wrapped.description,
        added_at: new Date().toISOString().split('T')[0]
      });
      reg.updated_at = new Date().toISOString().split('T')[0];
      fs.writeFileSync(regPath, JSON.stringify(reg, null, 2));
      out.registered = true;
    }

    out.ok = true;
    out.note = opts.to === 'stash'
      ? '已入 stash + 登记 registry；PM 调度前: agent-registry.js ' + projectRoot + ' activate ' + wrapped.slug
      : '已缓存到全局仓库 ' + globalAgentsDir + '；项目使用: agent-registry.js ' + projectRoot + ' activate ' + wrapped.slug;
  } catch (e) {
    out.ok = false;
    out.error = e.message;
  }
  console.log(JSON.stringify(out, null, 2));
})();
