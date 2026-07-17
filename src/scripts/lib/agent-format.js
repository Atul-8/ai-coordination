/**
 * agent-format.js — agency-agents-zh ↔ Claude Code subagent 框架封装
 *
 * agency-agents-zh 的 agent 已是 markdown + frontmatter（Claude Code 原生可读），
 * 但有四个问题需要框架封装（非格式转换）：
 *   1. name 是中文（如"代码审查员"），@-mention / 调度用 ASCII slug 更稳
 *   2. 含 emoji / color 字段（非 Claude Code subagent 字段）
 *   3. 缺 memory: project（跨会话沉淀知识）
 *   4. 缺框架意识前导（G1-G4 + 在 PM 协调下工作）
 * 零依赖。
 */

// 已知部门前缀（agency-agents-zh 的目录名）
const DEPARTMENTS = [
  'engineering', 'design', 'marketing', 'product', 'testing', 'project-management',
  'support', 'specialized', 'finance', 'hr', 'legal', 'supply-chain', 'paid-media',
  'sales', 'game-development', 'spatial-computing', 'academic', 'strategy'
];

// 从 agent-key 提取 ASCII slug
//   "agency-agents-zh:engineering/engineering-code-reviewer.md" → "code-reviewer"
//   "agency-agents-zh:engineering/engineering-pc-host-engineer.md" → "pc-host-engineer"
function slugFromKey(agentKey) {
  const file = String(agentKey).split(':').pop().split('/').pop().replace(/\.md$/, '');
  const parts = file.split('-');
  if (parts.length > 1 && DEPARTMENTS.indexOf(parts[0]) !== -1) {
    return parts.slice(1).join('-');
  }
  return file;
}

// 解析 frontmatter（轻量 YAML：仅 key: value 行）
function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { fm: {}, body: content };
  const fm = {};
  m[1].split(/\r?\n/).forEach(line => {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim();
  });
  return { fm, body: m[2] };
}

// 框架封装：原始 agency-agents-zh md → Claude Code subagent md
function wrap(rawContent, agentKey, opts) {
  opts = opts || {};
  const { fm, body } = parseFrontmatter(rawContent);
  const slug = opts.slug || slugFromKey(agentKey) || 'agent';
  const displayName = fm.name || slug;          // 中文显示名（留正文 H1）
  const description = fm.description || (displayName + '。由 PM 调度。');

  const newFm = [
    '---',
    'name: ' + slug,
    'description: ' + description,
    'source: ' + (opts.source || agentKey),
    'memory: project'
  ];
  if (opts.tools) newFm.push('tools: ' + opts.tools);
  newFm.push('---');

  const preamble = [
    '> **框架意识**：你是 ai-coordination 框架下的专家 subagent，在项目经理（PM）协调下工作。',
    '> 遵守 G1-G4 铁律（见项目 CLAUDE.md / SKILL.md）。写代码前登记、写后同步 .ai、先验证后开发、错误触发五步法、完成回流 META 规则（带 category）。',
    '> 显示名：' + displayName,
    ''
  ].join('\n');

  return {
    slug,
    display_name: displayName,
    description,
    content: newFm.join('\n') + '\n\n' + preamble + '\n' + body.replace(/^\s+/, '')
  };
}

module.exports = { slugFromKey, parseFrontmatter, wrap, DEPARTMENTS };
