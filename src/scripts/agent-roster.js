#!/usr/bin/env node
/**
 * agent-roster.js — 依据项目结构提议驻场专家组
 *
 * 用法：node agent-roster.js [project-root] [--write]
 * 输出：JSON（建议的 resident/on-demand 专家 + 证据）；--write 时同时更新 .ai/agents/ROSTER.md
 *
 * 基于项目特征（文件扩展名、目录、关键词）匹配专家驻场建议。
 * 复用 lib/detect-layer.js 做层级分布统计。零依赖。
 */

const fs = require('fs');
const path = require('path');
const { detectLayer } = require('./lib/detect-layer');

const projectRoot = require('./lib/project-validate')(process.argv[2]);
const writeFlag = process.argv.indexOf('--write') !== -1;
const aiAgentsDir = path.join(projectRoot, '.ai', 'agents');
const rosterPath = path.join(aiAgentsDir, 'ROSTER.md');

// 项目特征 → 专家映射
const SIGNALS = [
  {
    agent: 'embedded-firmware-engineer', label: '嵌入式固件工程师',
    patterns: ['.inf', '.dts', 'linker.ld', 'ldscript'],
    keywords: ['VHF', 'WDF', 'KMDF', 'CMSIS-DAP', 'STM32', 'ESP32', 'HID_Report', 'register', 'RTOS', 'firmware', '中断', '寄存器', '固件'],
    minHits: 1
  },
  {
    agent: 'pc-host-engineer', label: '上位机工程师',
    patterns: ['.pro', '.qrc', '.ui', '.qml'],
    keywords: ['Qt', 'QML', 'QWidget', 'QSerialPort', 'QChart', 'QCustomPlot', 'Modbus', 'moveToThread', 'readyRead', '串口', '上位机'],
    minHits: 1
  },
  {
    agent: 'backend-architect', label: '后端架构师',
    patterns: ['go.mod', 'pom.xml', 'requirements.txt'],
    keywords: ['express', 'fastapi', 'spring', 'django', 'REST', 'graphql', 'database', 'ORM'],
    minHits: 2
  },
  {
    agent: 'frontend-developer', label: '前端开发者',
    patterns: ['package.json'],
    keywords: ['react', 'vue', 'angular', 'svelte', 'next.js', 'vite', 'jsx', 'tsx', 'component'],
    minHits: 2
  }
];

const ON_DEMAND_DEFAULT = [
  { agent: 'tester', trigger: '组件完成时' },
  { agent: 'security-engineer', trigger: '涉及鉴权/输入/外部数据时' },
  { agent: 'code-reviewer', trigger: 'PR 审查/质量把关时' },
  { agent: 'software-architect', trigger: '架构决策时' }
];

function scanProject() {
  const found = { patterns: new Set(), keywords: {}, layers: {} };
  const exclude = new Set(['.git', 'node_modules', 'dist', 'build', '.ai', '.claude', 'target', 'Debug', 'Release', 'x64']);
  let fileCount = 0;

  function walk(dir, depth) {
    if (depth > 3 || fileCount > 2000) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (const e of entries) {
      if (exclude.has(e.name) || e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        walk(full, depth + 1);
      } else if (e.isFile()) {
        fileCount++;
        const lower = e.name.toLowerCase();
        SIGNALS.forEach(s => s.patterns.forEach(p => {
          if (lower === p.toLowerCase() || lower.endsWith(p.toLowerCase())) found.patterns.add(p);
        }));
        const rel = path.relative(projectRoot, full).replace(/\\/g, '/');
        const layer = detectLayer(rel);
        if (layer) found.layers[layer] = (found.layers[layer] || 0) + 1;
        if (shouldScan(lower)) scanKeywords(full, found.keywords);
      }
    }
  }
  walk(projectRoot, 0);
  found._fileCount = fileCount;
  return found;
}

function shouldScan(name) {
  return /\.(c|cc|cpp|h|hpp|js|ts|py|go|rs|java|cmake|txt|md|json|qml|pro|inf|dts|ui|vue|jsx|tsx)$/i.test(name);
}

function scanKeywords(file, keywords) {
  let content;
  try {
    const stat = fs.statSync(file);
    if (stat.size > 100000) return;
    content = fs.readFileSync(file, 'utf-8');
  } catch (e) { return; }
  const lower = content.toLowerCase();
  SIGNALS.forEach(s => {
    s.keywords.forEach(k => {
      if (lower.indexOf(k.toLowerCase()) !== -1) {
        keywords[s.agent] = keywords[s.agent] || {};
        keywords[s.agent][k] = (keywords[s.agent][k] || 0) + 1;
      }
    });
  });
}

const found = scanProject();
const resident = [];
const evidence = {};
SIGNALS.forEach(s => {
  const patternHit = s.patterns.some(p => found.patterns.has(p));
  const distinctKw = found.keywords[s.agent] ? Object.keys(found.keywords[s.agent]).length : 0;
  if (patternHit || distinctKw >= s.minHits) {
    const reason = [patternHit ? 'pattern命中' : '', distinctKw > 0 ? distinctKw + '个关键词' : ''].filter(Boolean).join('+');
    resident.push({ agent: s.agent, label: s.label, reason });
    evidence[s.agent] = {
      patterns: s.patterns.filter(p => found.patterns.has(p)),
      keywords: found.keywords[s.agent] || {}
    };
  }
});

const result = {
  project_root: projectRoot,
  resident,
  on_demand: ON_DEMAND_DEFAULT,
  layer_distribution: found.layers,
  scanned_files: found._fileCount,
  evidence
};

if (writeFlag && fs.existsSync(aiAgentsDir)) {
  let md = '# 项目驻场专家组（ROSTER）\n\n> 由 agent-roster.js 依据项目结构自动提议，PM 可手动调整。\n> 常驻 = .claude/agents/；按需 = .ai/agents/stash/（PM 调度前 activate）。\n\n## 常驻（resident）\n\n';
  if (resident.length === 0) md += '（未识别到明确领域特征，PM 可按需添加）\n';
  else resident.forEach(r => { md += `- ${r.agent}   # ${r.label}（${r.reason}）\n`; });
  md += '\n## 按需上线（on-demand）\n\n';
  ON_DEMAND_DEFAULT.forEach(o => { md += `- ${o.agent}   # ${o.trigger}\n`; });
  fs.writeFileSync(rosterPath, md);
  result.written_to = rosterPath;
}

console.log(JSON.stringify(result, null, 2));
