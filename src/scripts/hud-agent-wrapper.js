#!/usr/bin/env node
/**
 * hud-agent-wrapper.js — 主 statusLine 包装脚本（claude-hud + 会话 agent 段）
 *
 * 在 claude-hud 原输出基础上，前置一个「会话 agent」段（如 🧑‍💼 项目经理）。
 * agent 段来自主 statusLine stdin 的 agent.name（仅 `claude --agent <name>` 或
 * settings.json 顶层 "agent" 启动时存在；缺省则只输出 hud 原结果，行为与裸 hud 一致）。
 *
 * 与 ccline-agent-wrapper.js 并列：两者二选一，按你已装的 statusLine 引擎挑选。
 *   - 用 claude-hud（claude-hud 插件）→ 本脚本
 *   - 用 ccline（CCometixLine 二进制）→ ccline-agent-wrapper.js
 *
 * 三层 fallback（wrapper 出错绝不阻塞 statusLine）：
 *   1. stdin JSON 解析失败 → 不解析，原始 stdin 直接透传给 hud（agent 段为空）
 *   2. hud 调用失败/不存在 → 仅输出 agent 段（若有）
 *   3. 全部失败 → 输出空行（保持 statusLine 活着）
 *
 * hud 入口路径解析（按优先级）：
 *   1. env AI_COORDINATION_HUD_PATH（用户指定绝对路径，跨机器/非标准安装位置时用）
 *   2. ${CLAUDE_CONFIG_DIR 或 ~/.claude}/plugins/cache/claude-hud/claude-hud/<最新版本>/dist/index.js
 *   3. 上面都找不到 → 跳过 hud 走 fallback
 *
 * 依赖：./lib/agent-names 的 getDisplayName（agent.name → 中文）
 * 零依赖（fs/path/os/child_process 均为 Node 内置）。
 *
 * 用法（settings.json，替换原 statusLine.command）：
 *   "statusLine": {
 *     "type": "command",
 *     "command": "node \"<plugin-dir>/src/scripts/hud-agent-wrapper.js\"",
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

// semver 目录名比较：'0.0.11' vs '0.0.12' → 数字逐段比较（等价于 bash 的 sort -t. -k1,1n ...）
function compareVersionDir(a, b) {
  const pa = String(a).split('.').map(s => parseInt(s, 10) || 0);
  const pb = String(b).split('.').map(s => parseInt(s, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

// 解析 hud 入口：env 显式 > plugins/cache 下最新版本 > null
function resolveHudEntry() {
  // 1. env 显式指定（跨机器/非标准安装位置时用）
  const envPath = process.env.AI_COORDINATION_HUD_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;

  // 2. plugins/cache/claude-hud/claude-hud/<version>/dist/index.js
  const configDir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const hudBase = path.join(configDir, 'plugins', 'cache', 'claude-hud', 'claude-hud');
  let versions;
  try {
    versions = fs.readdirSync(hudBase).filter(v =>
      /^\d+\.\d+/.test(v) && fs.statSync(path.join(hudBase, v)).isDirectory()
    );
  } catch (e) { return null; }
  if (!versions.length) return null;
  versions.sort(compareVersionDir);
  const latest = versions[versions.length - 1];
  const entry = path.join(hudBase, latest, 'dist', 'index.js');
  return fs.existsSync(entry) ? entry : null;
}

// 调 hud（node dist/index.js < rawStdin），返回 stdout（trim）；失败/不存在返回 null
// 用 execFileSync 直接 spawn node（不经 shell，规避 Windows 引号/路径问题）
function runHud(entryPath, rawStdin) {
  if (!entryPath) return null;
  try {
    return execFileSync(process.execPath, [entryPath], {
      input: rawStdin,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']     // stdin 喂入、stdout 收回、stderr 丢弃
    }).trim();
  } catch (e) {
    return null;
  }
}

const rawStdin = readStdinSync();

// 1. 提取 agent 段（解析失败则 agent 段为空，后续透传原始 stdin 给 hud）
let agentSegment = '';
try {
  const data = JSON.parse(rawStdin);
  const agentName = data && data.agent && data.agent.name;
  if (agentName) {
    agentSegment = `\x1b[36m🧑‍💼 ${getDisplayName(agentName)}\x1b[0m`;
  }
} catch (e) {
  // JSON 解析失败：agent 段留空，原始 stdin 仍透传给 hud
}

// 2. 调 hud（原始 stdin 透传，保证 hud 渲染不受影响）
const hudOut = runHud(resolveHudEntry(), rawStdin);

// 3. 拼接输出（三层 fallback 落在分支里）
if (agentSegment && hudOut) {
  process.stdout.write(`${agentSegment} | ${hudOut}\n`);
} else if (hudOut) {
  process.stdout.write(hudOut + '\n');           // 无 agent 段 → 与裸 hud 一致
} else if (agentSegment) {
  process.stdout.write(agentSegment + '\n');     // hud 不可用 → 仅 agent 段
} else {
  process.stdout.write('\n');                    // 全失败 → 空行（statusLine 不挂）
}
