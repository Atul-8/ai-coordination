#!/usr/bin/env node
/**
 * agent-registry.js — Agent 注册表管理（三级存储 + 双生命周期同步）
 *
 * 用法：node agent-registry.js [project-root] [action] [name] [options]
 *   action:
 *     list                     列出 registry 所有 agent
 *     add <name> --source <path> [--lifecycle resident|on-demand] [--category X] [--layer A,B] [--triggers x,y] [--source-label local|seed|...]
 *                              登记新 agent（复制源文件 + 写 registry）
 *     activate <name>          on-demand → resident（复制到 .claude/agents/）
 *     deactivate <name>        resident → on-demand（从 .claude/agents/ 移回 stash）
 *     sync                     扫描 .claude/agents/，同步 registry 的 active 状态
 *     remove <name>            从 registry 删除并清理物理文件
 * 输出：JSON。零依赖（仅 fs/path/os）。
 *
 * 生命周期语义：
 *   resident  = 文件在 .claude/agents/，Claude Code 自动可发现可调度（active:true）
 *   on-demand = 文件在 .ai/agents/stash/，PM 调度前需 activate（active:false）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const projectRoot = process.argv[2] || process.cwd();
const action = process.argv[3] || 'list';
const name = process.argv[4];

const aiAgentsDir = path.join(projectRoot, '.ai', 'agents');
const stashDir = path.join(aiAgentsDir, 'stash');
const registryPath = path.join(aiAgentsDir, 'registry.json');
const claudeAgentsDir = path.join(projectRoot, '.claude', 'agents');
const globalAgentsDir = path.join(os.homedir(), '.ai-coordination', 'agents');

function parseOpts(argv, startIdx) {
  const opts = {};
  for (let i = startIdx; i < argv.length; i++) {
    const a = argv[i];
    if (a.indexOf('--') === 0) {
      const key = a.slice(2);
      const val = (i + 1 < argv.length && argv[i + 1].indexOf('--') !== 0) ? argv[++i] : true;
      opts[key] = val;
    }
  }
  return opts;
}
const opts = parseOpts(process.argv, 5);

function loadRegistry() {
  if (!fs.existsSync(registryPath)) return { schema_version: 1, agents: [] };
  try { return JSON.parse(fs.readFileSync(registryPath, 'utf-8')); }
  catch (e) { return { schema_version: 1, agents: [] }; }
}
function saveRegistry(reg) {
  reg.schema_version = reg.schema_version || 1;
  reg.updated_at = today();
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(reg, null, 2));
}
function today() { return new Date().toISOString().split('T')[0]; }
function findAgent(reg, n) { return reg.agents.find(a => a.name === n); }
function ensureDirs() {
  fs.mkdirSync(stashDir, { recursive: true });
  fs.mkdirSync(claudeAgentsDir, { recursive: true });
}
function parseFrontmatter(content) {
  const fm = content.match(/^-{3}\n([\s\S]*?)\n-{3}/);
  if (!fm) return {};
  const obj = {};
  fm[1].split('\n').forEach(line => {
    const m = line.match(/^(\w+):\s*(.*)$/);
    if (m) obj[m[1]] = m[2].trim();
  });
  return obj;
}
function buildRagText(fm) {
  return [fm.name, (fm.description || '').replace(/^["']|["']$/g, ''), fm.category].filter(Boolean).join(' ');
}

const out = { action, ok: false };

try {
  if (action === 'list') {
    const reg = loadRegistry();
    out.ok = true;
    out.total = reg.agents.length;
    out.agents = reg.agents.map(a => ({
      name: a.name, display_name: a.display_name, lifecycle: a.lifecycle,
      active: a.active, category: a.category, source: a.source
    }));
  }

  else if (action === 'add') {
    if (!name || !opts.source) throw new Error('用法: add <name> --source <path> [--lifecycle resident|on-demand]');
    if (!fs.existsSync(opts.source)) throw new Error('源文件不存在: ' + opts.source);
    ensureDirs();
    const lifecycle = opts.lifecycle === 'on-demand' ? 'on-demand' : 'resident';
    const reg = loadRegistry();
    if (findAgent(reg, name)) throw new Error('agent 已存在: ' + name + '（如需更新请先 remove）');

    const target = lifecycle === 'resident'
      ? path.join(claudeAgentsDir, name + '.md')
      : path.join(stashDir, name + '.md');
    fs.copyFileSync(opts.source, target);

    const fm = parseFrontmatter(fs.readFileSync(opts.source, 'utf-8'));
    const agent = {
      name,
      display_name: opts['display-name'] || name,
      lifecycle,
      active: lifecycle === 'resident',
      category: opts.category || 'uncategorized',
      layer_focus: opts.layer ? String(opts.layer).split(',').map(s => s.trim()) : [],
      triggers: opts.triggers ? String(opts.triggers).split(',').map(s => s.trim()) : [],
      source: opts['source-label'] || 'local',
      physical_path: path.relative(projectRoot, target).replace(/\\/g, '/'),
      rag_text: buildRagText(fm),
      added_at: today()
    };
    reg.agents.push(agent);
    saveRegistry(reg);
    out.ok = true;
    out.agent = agent;
    out.note = lifecycle === 'resident'
      ? '已安装到 .claude/agents/（若该目录为全新，需重启会话才被扫描）'
      : '已暂存到 stash（PM 调度前需 activate）';
  }

  else if (action === 'activate') {
    if (!name) throw new Error('用法: activate <name>');
    ensureDirs();
    const reg = loadRegistry();
    const agent = findAgent(reg, name);
    if (!agent) throw new Error('registry 无此 agent: ' + name);
    const dest = path.join(claudeAgentsDir, name + '.md');
    if (agent.active && fs.existsSync(dest)) {
      out.ok = true; out.note = '已是 active 状态'; out.agent = agent;
    } else {
      const candidates = [
        path.join(stashDir, name + '.md'),
        path.join(globalAgentsDir, name + '.md'),
        agent.physical_path ? path.join(projectRoot, agent.physical_path) : ''
      ];
      const src = candidates.find(c => c && fs.existsSync(c));
      if (!src) throw new Error('找不到 agent 源文件（stash/global/physical_path 均无）: ' + name);
      fs.copyFileSync(src, dest);
      agent.active = true;
      agent.physical_path = path.relative(projectRoot, dest).replace(/\\/g, '/');
      saveRegistry(reg);
      out.ok = true; out.agent = agent;
      out.note = '已上线到 .claude/agents/（几秒内热重载；若该目录为全新，需重启会话）';
    }
  }

  else if (action === 'deactivate') {
    if (!name) throw new Error('用法: deactivate <name>');
    const reg = loadRegistry();
    const agent = findAgent(reg, name);
    if (!agent) throw new Error('registry 无此 agent: ' + name);
    const dest = path.join(claudeAgentsDir, name + '.md');
    ensureDirs();
    if (fs.existsSync(dest)) {
      fs.copyFileSync(dest, path.join(stashDir, name + '.md')); // 保留副本
      fs.unlinkSync(dest);
    }
    agent.active = false;
    agent.physical_path = '.ai/agents/stash/' + name + '.md';
    saveRegistry(reg);
    out.ok = true; out.agent = agent; out.note = '已下线（副本移回 stash）';
  }

  else if (action === 'sync') {
    ensureDirs();
    const reg = loadRegistry();
    const activeFiles = fs.existsSync(claudeAgentsDir)
      ? fs.readdirSync(claudeAgentsDir).filter(f => f.endsWith('.md')).map(f => f.replace(/\.md$/, ''))
      : [];
    let changed = 0;
    reg.agents.forEach(a => {
      const isActive = activeFiles.indexOf(a.name) !== -1;
      if (a.active !== isActive) { a.active = isActive; changed++; }
    });
    saveRegistry(reg);
    out.ok = true; out.active_files = activeFiles; out.changed = changed; out.total = reg.agents.length;
  }

  else if (action === 'remove') {
    if (!name) throw new Error('用法: remove <name>');
    const reg = loadRegistry();
    const idx = reg.agents.findIndex(a => a.name === name);
    if (idx < 0) throw new Error('registry 无此 agent: ' + name);
    [path.join(claudeAgentsDir, name + '.md'), path.join(stashDir, name + '.md')].forEach(f => {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
    reg.agents.splice(idx, 1);
    saveRegistry(reg);
    out.ok = true; out.removed = name;
  }

  else {
    throw new Error('未知 action: ' + action + '（支持: list/add/activate/deactivate/sync/remove）');
  }
} catch (e) {
  out.ok = false;
  out.error = e.message;
}

console.log(JSON.stringify(out, null, 2));
