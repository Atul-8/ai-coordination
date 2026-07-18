/**
 * agent-names.js — agent slug ↔ 中文显示名映射（statusLine 渲染用）
 *
 * statusLine 收到的 agent 标识是 ASCII slug（如 software-architect），人类更易读中文显示名。
 * 数据源（静态优先，动态补充）：
 *   1. 静态映射表（保底，覆盖 skills/coordination/assets/agents/ 已知专家）
 *   2. 动态扫描 ~/.claude/agents/*.md（resident）与 <projectRoot>/.ai/agents/stash/*.md（on-demand）
 *      的 frontmatter `name` 字段
 * 未命中时原样返回 slug，绝不抛错。
 * 零依赖（fs/path/os 均为 Node 内置）。
 *
 * 用法：const { getDisplayName } = require('./lib/agent-names');
 *       getDisplayName('software-architect') → '软件架构师'
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// 静态映射表（保底，覆盖 ai-coordination 已知专家）
const STATIC_NAMES = {
  'pm': '项目经理',
  'software-architect': '软件架构师',
  'tester': '测试工程师',
  'security-engineer': '安全工程师',
  'code-reviewer': '代码审查员',
  'embedded-firmware-engineer': '嵌入式固件工程师',
  'pc-host-engineer': 'PC 主机工程师'
};

// 轻量 frontmatter 解析：仅取顶层 `name:` 行（避免依赖 agent-format.js 形成循环依赖）
function parseFrontmatterName(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fmLine = m[1].split(/\r?\n/).find(l => /^name:\s*.+/.test(l));
  if (!fmLine) return null;
  return fmLine.replace(/^name:\s*/, '').replace(/^["']|["']$/g, '').trim() || null;
}

// 扫描目录下所有 .md 的 frontmatter name，写入 out（已有 key 不覆盖，静态优先）
function scanAgentDir(dir, out) {
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return; }   // 目录不存在/不可读 → 静默跳过
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const slug = f.replace(/\.md$/, '');
    if (out[slug]) continue;                                   // 静态优先，不覆盖
    let content;
    try { content = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
    const name = parseFrontmatterName(content);
    if (name) out[slug] = name;
  }
}

// 构建完整映射：静态优先 + 动态补充（resident 全局 + on-demand 项目本地）
// projectRoot 可选，默认 process.cwd()
function buildMap(projectRoot) {
  const map = Object.assign({}, STATIC_NAMES);
  scanAgentDir(path.join(os.homedir(), '.claude', 'agents'), map);
  scanAgentDir(path.join(projectRoot || process.cwd(), '.ai', 'agents', 'stash'), map);
  return map;
}

// slug → 中文显示名；未命中或空入参 → 原样返回（空入参返回空串）
function getDisplayName(slug, projectRoot) {
  if (!slug) return '';
  const map = buildMap(projectRoot);
  return map[slug] || String(slug);
}

module.exports = { STATIC_NAMES, parseFrontmatterName, buildMap, getDisplayName };
