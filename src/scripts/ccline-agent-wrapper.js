#!/usr/bin/env node
/**
 * ccline-agent-wrapper.js — 主 statusLine 包装脚本（① 会话级 agent 段）
 *
 * 包裹现有 ccline（CCometixLine）：在 ccline 原输出基础上，前置一个「会话 agent」段。
 * agent 段来自主 statusLine stdin 的 agent.name（仅 `claude --agent <name>` 或
 * settings.json 顶层 "agent" 启动时存在；缺省则只输出 ccline 原结果，行为与裸 ccline 一致）。
 *
 * 三层 fallback（wrapper 出错绝不阻塞 statusLine）：
 *   1. stdin JSON 解析失败 → 不解析，原始 stdin 直接透传给 ccline（agent 段为空）
 *   2. ccline 调用失败/不存在 → 仅输出 agent 段（若有）
 *   3. 全部失败 → 输出空行（保持 statusLine 活着）
 *
 * ccline 路径解析：env AI_COORDINATION_CCLINE 优先；否则 ~/.claude/ccline/ccline
 * （Windows 为 ccline.exe）；不存在则跳过 ccline 走 fallback。
 * 依赖：./lib/agent-names 的 getDisplayName（agent.name → 中文）
 * 零依赖（fs/path/os/child_process 均为 Node 内置）。
 *
 * 用法（settings.json，替换原 statusLine.command）：
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node \"<plugin-dir>/src/scripts/ccline-agent-wrapper.js\"",
 *     "padding": 0
 *   }
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const { getDisplayName } = require('./lib/agent-names');

// 同步读 stdin（fd 0）。读失败返回空串。
function readStdinSync() {
  try { return fs.readFileSync(0, 'utf8'); } catch (e) { return ''; }
}

// 解析 ccline 路径：env 优先 → 默认位置 → 不存在返回 null
function resolveCcline() {
  const env = process.env.AI_COORDINATION_CCLINE;
  if (env && fs.existsSync(env)) return env;
  const exe = process.platform === 'win32' ? 'ccline.exe' : 'ccline';
  const p = path.join(os.homedir(), '.claude', 'ccline', exe);
  return fs.existsSync(p) ? p : null;
}

// 调 ccline，原始 stdin 喂给它；返回 stdout（trim）；失败/不存在返回 null
// 用 execFileSync 直接 spawn（不经 shell，规避 Windows 引号/路径问题）
function runCcline(cclinePath, rawStdin) {
  if (!cclinePath) return null;
  try {
    return execFileSync(cclinePath, [], {
      input: rawStdin,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']     // stdin 喂入、stdout 收回、stderr 丢弃
    }).trim();
  } catch (e) {
    return null;
  }
}

const rawStdin = readStdinSync();

// 1. 提取 agent 段（解析失败则 agent 段为空，后续透传原始 stdin 给 ccline）
let agentSegment = '';
try {
  const data = JSON.parse(rawStdin);
  const agentName = data && data.agent && data.agent.name;
  if (agentName) {
    agentSegment = `\x1b[36m🧑‍💼 ${getDisplayName(agentName)}\x1b[0m`;
  }
} catch (e) {
  // JSON 解析失败：agent 段留空，原始 stdin 仍透传给 ccline
}

// 2. 调 ccline（原始 stdin 透传，保证 ccline 渲染不受影响）
const cclineOut = runCcline(resolveCcline(), rawStdin);

// 3. 拼接输出（三层 fallback 落在分支里）
if (agentSegment && cclineOut) {
  process.stdout.write(`${agentSegment} | ${cclineOut}\n`);
} else if (cclineOut) {
  process.stdout.write(cclineOut + '\n');     // 无 agent 段 → 与裸 ccline 一致
} else if (agentSegment) {
  process.stdout.write(agentSegment + '\n');  // ccline 不可用 → 仅 agent 段
} else {
  process.stdout.write('\n');                 // 全失败 → 空行（statusLine 不挂）
}
