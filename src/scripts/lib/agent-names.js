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
  'project-assistant': '项目助理',
  'software-architect': '软件架构师',
  'tester': '测试工程师',
  'security-engineer': '安全工程师',
  'code-reviewer': '代码审查员',
  'embedded-firmware-engineer': '嵌入式固件工程师',
  'pc-host-engineer': '上位机工程师'
};

// 专家身份关键词（用于从 task.description 反推 agent slug）
// ���择原则：该专家独有、不会跨专家误命中的术语；中文显示名已由 detectByDescription 优先匹配，此处只列领域词
const KEYWORDS = {
  'software-architect': ['架构', '分层', 'DDD', '依赖治理', '技术选型', '七层'],
  'tester': ['测试', '回归', '覆盖率', 'E2E', '单元测试', '集成测试'],
  'security-engineer': ['安全审计', '鉴权', '加密', 'OWASP', '脱敏', '威胁建模', 'XSS', 'SQL 注入'],
  'code-reviewer': ['代码审查', 'code review', '静态分析', '代码质量'],
  'embedded-firmware-engineer': ['嵌入式', '固件', '驱动', '中断', 'DMA', 'HID', 'CMSIS', 'RTOS', 'USB'],
  'pc-host-engineer': ['上位机', 'Qt', 'QSerialPort', '串口', 'Modbus', 'CAN', 'QChart', 'QCustomPlot'],
  'project-assistant': ['项目助理', 'project-assistant', 'PA drain', 'pa-inbox', '规则池管家', 'META 入库', '消息队列消费', '沉淀消费'],
  'pm': ['项目经理', 'PM 调度', '编排']
};

// 图标映射（slug → emoji）；未命中用 DEFAULT_ICON
const ICONS = {
  'pm': '🧑‍💼',
  'project-assistant': '📋',
  'software-architect': '🏗️',
  'tester': '🧪',
  'security-engineer': '🔒',
  'code-reviewer': '🔍',
  'embedded-firmware-engineer': '🔌',
  'pc-host-engineer': '🖥️'
};

const DEFAULT_ICON = '🧑‍💻';

// 转义正则特殊字符（关键词含 . / 等时需要）
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 从 task.description 反推专家身份
// 命中策略（按优先级）：
//   1. 中文显示名完整出现（最强信号，最准确）
//   2. KEYWORDS 中的领域关键词出现（按 KEYWORDS 定义顺序；大小写不敏感，便于匹配 DDD / OWASP / USB 等英文术语）
// 未命中返回 null（调用方应回退到原 description）
function detectByDescription(description) {
  const desc = String(description || '');
  if (!desc) return null;

  // 1. 中文显示名直接命中（静态映射 + 动态扫描结果一起参与匹配）
  const map = buildMap();
  for (const slug in map) {
    const display = map[slug];
    if (display && desc.includes(display)) {
      return { slug, displayName: display, icon: ICONS[slug] || DEFAULT_ICON };
    }
  }

  // 2. 领域关键词命中
  for (const slug in KEYWORDS) {
    for (const kw of KEYWORDS[slug]) {
      if (new RegExp(escapeRegExp(kw), 'i').test(desc)) {
        return { slug, displayName: map[slug] || slug, icon: ICONS[slug] || DEFAULT_ICON };
      }
    }
  }

  return null;
}

// 轻量 frontmatter 解析：仅取顶层 `name:` 行（避免依赖 agent-format.js 形成循环依赖）
function parseFrontmatterName(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fmLine = m[1].split(/\r?\n/).find(l => /^name:\s*.+/.test(l));
  if (!fmLine) return null;
  return fmLine.replace(/^name:\s*/, '').replace(/^["']|["']$/g, '').trim() || null;
}

// 增强 frontmatter 解析：提取中文显示名（B2 修复核心）
// 优先级：display_name 字段 > description 首句（到中文句号）> name 字段
// 这样动态扫描能拿到中文显示名，新增专家即使忘加 STATIC_NAMES 也能被识别
function parseFrontmatterDisplayName(content) {
  const m = String(content).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const lines = m[1].split(/\r?\n/);
  // 1. display_name 字段（显式声明，最高优先）
  const dnLine = lines.find(l => /^display_name:\s*.+/.test(l));
  if (dnLine) return dnLine.replace(/^display_name:\s*/, '').replace(/^["']|["']$/g, '').trim() || null;
  // 2. description 首句（所有 agent description 都是"中文名。详细描述"格式）
  const descLine = lines.find(l => /^description:\s*.+/.test(l));
  if (descLine) {
    const desc = descLine.replace(/^description:\s*/, '').replace(/^["']|["']$/g, '').trim();
    const firstClause = desc.split('。')[0].trim();
    if (firstClause) return firstClause;
  }
  // 3. 回退 name 字段
  const nameLine = lines.find(l => /^name:\s*.+/.test(l));
  if (nameLine) return nameLine.replace(/^name:\s*/, '').replace(/^["']|["']$/g, '').trim() || null;
  return null;
}

// 扫描目录下所有 .md 的 frontmatter 显示名，写入 out（已有 key 不覆盖，静态优先）
function scanAgentDir(dir, out) {
  let files;
  try { files = fs.readdirSync(dir); } catch (e) { return; }   // 目录不存在/不可读 → 静默跳过
  for (const f of files) {
    if (!f.endsWith('.md')) continue;
    const slug = f.replace(/\.md$/, '');
    if (out[slug]) continue;                                   // 静态优先，不覆盖
    let content;
    try { content = fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { continue; }
    const name = parseFrontmatterDisplayName(content);
    if (name) out[slug] = name;
  }
}

// 构建完整映射：静态优先 + 动态补充（resident 全局 + on-demand 项目本地）
// projectRoot 可选，默认 process.cwd()
function buildMap(projectRoot) {
  const root = projectRoot || process.cwd();
  const map = Object.assign({}, STATIC_NAMES);
  scanAgentDir(path.join(os.homedir(), '.claude', 'agents'), map);
  // B2 修复：补扫项目级 .claude/agents/（resident 实际位置，原只扫全局 → 新增专家若不在 STATIC_NAMES 会漏）
  scanAgentDir(path.join(root, '.claude', 'agents'), map);
  scanAgentDir(path.join(root, '.ai', 'agents', 'stash'), map);
  return map;
}

// slug → 中文显示名；未命中或空入参 → 原样返回（空入参返回空串）
function getDisplayName(slug, projectRoot) {
  if (!slug) return '';
  const map = buildMap(projectRoot);
  return map[slug] || String(slug);
}

module.exports = {
  STATIC_NAMES,
  KEYWORDS,
  ICONS,
  DEFAULT_ICON,
  parseFrontmatterName,
  parseFrontmatterDisplayName,
  buildMap,
  getDisplayName,
  detectByDescription
};
