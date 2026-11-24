/**
 * arch.js — 七层单向依赖检查（G2 的自动化补充）
 *
 * 规则：presentation → interface → core → shared（只允许依赖更低的层；testing 可依赖全部）。
 * 启发式检查 `src/<layer>/`（或根目录下同名层）中的直接 import：
 *   - JS/TS：import ... from '...' / export ... from '...' / require('...')
 *   - Python：from x import y
 * 只判定层内反向引用；外部包、别名解析不到的一律跳过（不误报）。
 *
 * 这不是编译器：跨层间接引用（A→B→C）仍要靠 G2 评审；工具负责把「明显违规」当场抓出来。
 */

import path from "node:path";

export const LAYERS = [
	{ id: "shared", rank: 1, deps: [] },
	{ id: "core", rank: 2, deps: ["shared"] },
	{ id: "interface", rank: 3, deps: ["core", "shared"] },
	{ id: "presentation", rank: 4, deps: ["interface", "core", "shared"] },
];

const RANK = new Map(LAYERS.map((layer) => [layer.id, layer.rank]));
const ALLOWED = new Map(LAYERS.map((layer) => [layer.id, new Set(layer.deps)]));

async function walk(io, dir, out, depth = 0) {
	if (depth > 8 || out.length > 800) return;
	for (const name of await io.list(dir)) {
		if (name === "node_modules" || name.startsWith(".")) continue;
		const abs = path.join(dir, name);
		const kind = await io.kind(abs);
		if (kind === "dir") await walk(io, abs, out, depth + 1);
		else if (kind === "file" && /\.(m?js|cjs|jsx|ts|tsx|py)$/.test(name)) out.push(abs);
	}
}

function layerOf(file, root) {
	const rel = path.relative(root, file).replace(/\\/g, "/");
	for (const layer of LAYERS) if (rel === layer.id || rel.startsWith(`${layer.id}/`)) return layer.id;
	return null;
}

function importSpecs(text) {
	const specs = [];
	const patterns = [
		/^\s*(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/gm,
		/^\s*import\s*['"]([^'"]+)['"]/gm,
		/require\(\s*['"]([^'"]+)['"]\s*\)/g,
		/^\s*from\s+([\w.]+)\s+import\s+/gm,
	];
	for (const pattern of patterns) for (const match of text.matchAll(pattern)) specs.push(match[1]);
	return specs;
}

function resolveImport(spec, file, root) {
	let value = spec;
	const isPython = file.endsWith(".py");
	if (isPython) {
		if (value.startsWith(".")) {
			const lead = value.match(/^\.+/)?.[0] ?? ".";
			value = value.slice(lead.length).replace(/\./g, "/");
			return layerOf(path.resolve(path.dirname(file), "../".repeat(lead.length - 1), value), root);
		}
		return layerOf(path.join(root, value.replace(/\./g, "/")), root);
	}
	if (value.startsWith("@/") || value.startsWith("~/")) value = value.slice(2);
	if (value.startsWith("src/")) value = value.slice(4);
	if (value.startsWith(".")) {
		return layerOf(path.resolve(path.dirname(file), value), root);
	}
	const normalized = value.replace(/\\/g, "/");
	for (const layer of LAYERS) if (new RegExp(`(^|/)${layer.id}(/|$)`).test(normalized)) return layer.id;
	return null;
}

/**
 * @param {{root:string, io:any}} options
 */
export async function checkArchitecture({ root, io }) {
	const srcDir = path.join(root, "src");
	const base = (await io.exists(srcDir)) ? srcDir : root;
	const files = [];
	for (const layer of LAYERS) {
		const dir = path.join(base, layer.id);
		if ((await io.kind(dir)) === "dir") await walk(io, dir, files);
	}

	if (files.length === 0) {
		return {
			ok: false,
			layers: {},
			violations: [],
			structureOk: await io.exists(path.join(root, ".ai", "STRUCTURE.md")),
			text: `架构检查：${root}\n未找到 src/<layer>/（shared|core|interface|presentation）下的源码。若项目尚未分层，先按七层落目录，再启用检查。`,
		};
	}

	const counts = {};
	for (const layer of LAYERS) counts[layer.id] = 0;
	const violations = [];
	for (const file of files) {
		const owner = layerOf(file, base);
		if (!owner) continue;
		counts[owner]++;
		const text = (await io.read(file)) ?? "";
		for (const spec of importSpecs(text)) {
			const target = resolveImport(spec, file, base);
			if (!target || target === owner) continue;
			if (!ALLOWED.get(owner)?.has(target)) {
				violations.push({
					file: path.relative(root, file).replace(/\\/g, "/"),
					spec,
					owner,
					target,
					rule: `${owner} 只允许依赖 ${[...(ALLOWED.get(owner) ?? [])].join(" / ") || "（无）"}`,
				});
			}
		}
	}

	const structureOk = await io.exists(path.join(root, ".ai", "STRUCTURE.md"));
	const layerText = LAYERS.map((layer) => `${layer.id} ${counts[layer.id]}`).join(" · ");
	const lines = [
		`架构检查：${root}`,
		`层文件：${layerText}`,
		"依赖方向：presentation → interface → core → shared（禁止反向 / 跨层直插）",
		"",
		violations.length === 0 ? "✓ 未发现反向依赖。" : `✗ ${violations.length} 处反向依赖：`,
		...violations.slice(0, 30).map((v) => `  ${v.file} → ${v.spec}（${v.owner} 依赖 ${v.target}；${v.rule}）`),
		...(violations.length > 30 ? [`  …… 其余 ${violations.length - 30} 处省略`] : []),
		"",
		`STRUCTURE.md：${structureOk ? "✓" : "✗ 缺失（G2 同步对象）"}`,
		"修复：跨层引用必须先落到 interface 契约，或在 STRUCTURE.md 标注并登记 REQ；不要靠「反正能跑」放过。",
	];
	return { ok: violations.length === 0, layers: counts, violations, structureOk, text: lines.join("\n") };
}