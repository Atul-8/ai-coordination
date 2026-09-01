#!/usr/bin/env node
/**
 * sync-eai-prompts.mjs — 同步 eai 前缀模板别名
 *
 * prompts/pm.md → prompts/eai-pm.md 等五组：内容原样复制，仅在 front-matter
 * description 末尾追加「（= /<原名> eai 别名）」以便自动补全里区分。
 * 原则是单一事实源：改提示词只改源文件，跑一次本脚本即可。
 *
 * 用法：node scripts/sync-eai-prompts.mjs   （在包根执行）
 */
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pairs = ["pm", "issue", "error", "meta", "status"].map((n) => [n, `eai-${n}`]);

let changed = 0;
for (const [src, dst] of pairs) {
	const srcPath = join(root, "prompts", `${src}.md`);
	const dstPath = join(root, "prompts", `${dst}.md`);
	const body = readFileSync(srcPath, "utf-8");
	const annotated = body.replace(
		/^description: (.*)$/m,
		`description: $1（= /${src} eai 别名）`,
	);
	try {
		if (readFileSync(dstPath, "utf-8") === annotated) continue;
	} catch {
		/* 目标不存在 */
	}
	writeFileSync(dstPath, annotated, "utf-8");
	changed++;
	console.log(`synced prompts/${dst}.md  ←  prompts/${src}.md`);
}
console.log(changed === 0 ? "已是最新，无需更新" : `共更新 ${changed} 个别名模板`);
