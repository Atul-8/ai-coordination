/**
 * project-validate.js — projectRoot 路径校验（防 slug 误用导致静默 miswrite）
 *
 * ERR-007 教训：CLI <project> 参数命名歧义 + 缺校验 = slug 被当相对路径，
 * 静默写到 cwd/<slug>/.ai/...（错误位置）。META-002-API_CONTRACT 复现。
 *
 * 用法（在 CLI 脚本顶部）：
 *   const projectRoot = require('./lib/project-validate')(process.argv[2]);
 *
 * 校验失败 → console.log JSON 错误 + process.exit(1)
 * 校验通过 → 返回 resolved 路径（argv[2] 或 cwd 兜底）
 *
 * 零依赖（仅 fs）。
 */

const fs = require('fs');

function validateProjectRoot(projectRoot) {
  const resolved = projectRoot || process.cwd();
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    console.log(JSON.stringify({
      ok: false,
      error: `<project> 路径不存在或非目录: "${resolved}". 应为项目根路径（如 . 或 E:/AI/my-project），不是项目名 slug。详见 ERR-007 / META-002-API_CONTRACT`
    }, null, 2));
    process.exit(1);
  }
  return resolved;
}

module.exports = validateProjectRoot;
