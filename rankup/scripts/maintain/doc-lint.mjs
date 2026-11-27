#!/usr/bin/env node
// doc-lint.mjs —— Markdown 文档健康检查：断链、断锚点、超标文件。
//
//   node scripts/maintain/doc-lint.mjs                      # 检查本 Skill（默认根 = Skill 目录，跳过 .rankup/）
//   node scripts/maintain/doc-lint.mjs --root <项目>/.rankup # 检查一个项目的 .rankup/
//   node scripts/maintain/doc-lint.mjs --max-lines 600 --max-kb 80 --json
//
// 用途：「维护」章节（references/maintenance.md）的可检查判据之一。拆分或移动文档、
// 改标题之后必须跑一遍：入站链接和 `文件.md#锚点` 在改名后会静默失效，validate-rankup.mjs
// 只查 SKILL.md 直链的文件存在，不查锚点，也不查 references 之间的互链。
//
// 检查项：
//   1. 相对链接 `[x](path.md)`、`[x](path.md#anchor)`、`[x](#anchor)` 指向的文件与锚点存在；
//      代码块与行内代码里的链接不算；http(s)/mailto 等外链不查。
//      指向根目录之外的链接（兄弟 Skill）默认不查，--include-outside 时才查；
//   2. 单文件行数 > --max-lines 或体积 > --max-kb 记为「超标」（警告，不算失败）；
//   3. 根目录有 SKILL.md 时查入口上限：全文行数、字符数，以及 frontmatter 之外的单行字符数
//      （默认 120 行 / 7000 字符 / 单行 200 字符，字符按 Unicode 码位计）。超了记「入口超标」（警告）。
//      为什么：入口每次触发都整篇载入，行数压下去而单行变长等于没瘦身（2026-11 重构依据）。
// 锚点按 GitHub 规则生成：去掉标点与符号、小写、空格变 `-`，重名依次加 `-1`、`-2`。
// 退出码：0 无断链；1 有断链；2 参数错误。只读，不改任何文件。
// 已验证：2026-09-30 在本 Skill 全量文档上运行。

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

export function parseArgs(argv) {
  const opts = { root: skillRoot, maxLines: 600, maxKb: 80, json: false, includeOutside: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = path.resolve(argv[++i] ?? "");
    else if (a === "--max-lines") opts.maxLines = Number(argv[++i]);
    else if (a === "--max-kb") opts.maxKb = Number(argv[++i]);
    else if (a === "--json") opts.json = true;
    else if (a === "--include-outside") opts.includeOutside = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  return opts;
}

export function slugify(heading) {
  const text = heading
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .trim()
    .toLowerCase();
  return text.replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, "").replace(/ /g, "-");
}

// 去掉围栏代码块，保留行号（被去掉的行留空）。
export function stripFences(text) {
  const lines = text.split("\n");
  let fence = null;
  return lines.map((line) => {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!fence) fence = m[1][0];
      else if (m[1][0] === fence) fence = null;
      return "";
    }
    return fence ? "" : line;
  });
}

export function anchorsOf(text) {
  const seen = new Map();
  const anchors = new Set();
  for (const line of stripFences(text)) {
    const m = line.match(/^#{1,6}\s+(.*?)\s*#*\s*$/);
    if (!m) continue;
    const base = slugify(m[1]);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    anchors.add(n === 0 ? base : `${base}-${n}`);
  }
  // 显式 HTML 锚点 <a id="x"> / <a name="x">
  for (const m of text.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(m[1]);
  return anchors;
}

export function linksOf(text) {
  const out = [];
  stripFences(text).forEach((raw, idx) => {
    const line = raw.replace(/`[^`]*`/g, (s) => " ".repeat(s.length));
    for (const m of line.matchAll(/(!?)\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[3];
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue; // http:, https:, mailto: …
      out.push({ line: idx + 1, target });
    }
  });
  return out;
}

async function walk(dir, { skipRankup }) {
  const files = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (skipRankup && e.name === ".rankup") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p, { skipRankup })));
    else if (e.name.endsWith(".md")) files.push(p);
  }
  return files;
}

export const ENTRY_LIMITS = { lines: 120, chars: 7000, lineChars: 200 };

// 入口上限：全文行数与字符数含 frontmatter；单行长度不计 frontmatter（description 按规范写在一行）。
export function entryStats(text, limits = ENTRY_LIMITS) {
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let bodyStart = 0;
  if (lines[0] === "---") {
    const end = lines.indexOf("---", 1);
    if (end > 0) bodyStart = end + 1;
  }
  const longLines = [];
  lines.forEach((line, idx) => {
    const chars = [...line].length;
    if (idx >= bodyStart && chars > limits.lineChars) longLines.push({ line: idx + 1, chars });
  });
  const chars = [...text].length;
  const problems = [];
  if (lines.length > limits.lines) problems.push(`行数 ${lines.length} > ${limits.lines}`);
  if (chars > limits.chars) problems.push(`字符 ${chars} > ${limits.chars}`);
  if (longLines.length) problems.push(`${longLines.length} 行超过 ${limits.lineChars} 字符`);
  return { lines: lines.length, chars, longLines, problems };
}

export async function lint({ root, maxLines = 600, maxKb = 80, includeOutside = false, entryLimits = ENTRY_LIMITS }) {
  const skipRankup = path.basename(root) !== ".rankup";
  const files = await walk(root, { skipRankup });
  const cache = new Map();
  const load = async (p) => {
    if (!cache.has(p)) cache.set(p, await readFile(p, "utf8").catch(() => null));
    return cache.get(p);
  };
  const broken = [];
  const oversize = [];
  let linkCount = 0;
  let outside = 0;
  for (const file of files) {
    const text = await load(file);
    const lines = text.split("\n").length;
    const kb = Buffer.byteLength(text) / 1024;
    if (lines > maxLines || kb > maxKb) {
      oversize.push({ file: path.relative(root, file), lines, kb: Math.round(kb) });
    }
    for (const { line, target } of linksOf(text)) {
      linkCount++;
      const [rawPath, anchor] = target.split("#");
      let decodedPath;
      try {
        decodedPath = decodeURIComponent(rawPath);
      } catch {
        decodedPath = rawPath;
      }
      const resolved = rawPath ? path.resolve(path.dirname(file), decodedPath) : file;
      const where = `${path.relative(root, file)}:${line}`;
      // 指向根目录之外（兄弟 Skill 等）的链接在单独安装时本来就可能不存在，默认只计数不检查。
      if (!includeOutside && path.relative(root, resolved).startsWith("..")) {
        outside++;
        continue;
      }
      let st = null;
      try {
        st = await stat(resolved);
      } catch {}
      if (!st) {
        broken.push({ where, target, reason: "文件不存在" });
        continue;
      }
      if (anchor === undefined || anchor === "" || st.isDirectory() || !resolved.endsWith(".md")) continue;
      let wanted;
      try {
        wanted = decodeURIComponent(anchor).toLowerCase();
      } catch {
        wanted = anchor.toLowerCase();
      }
      const anchors = anchorsOf(await load(resolved));
      if (!anchors.has(wanted)) broken.push({ where, target, reason: "锚点不存在" });
    }
  }
  oversize.sort((a, b) => b.lines - a.lines);
  let entry = null;
  const skillText = await load(path.join(root, "SKILL.md"));
  if (skillText !== null) entry = { file: "SKILL.md", ...entryStats(skillText, entryLimits), limits: entryLimits };
  return { root, files: files.length, links: linkCount, outside, broken, oversize, maxLines, maxKb, entry };
}

function render(r) {
  const out = [];
  out.push(`doc-lint：${r.files} 个 Markdown 文件，${r.links} 条相对链接（其中 ${r.outside} 条指向根目录外，未检查；加 --include-outside 检查）`);
  out.push(`断链：${r.broken.length}`);
  for (const b of r.broken) out.push(`  ${b.where} → ${b.target}（${b.reason}）`);
  out.push(`超标（> ${r.maxLines} 行或 > ${r.maxKb} KB，警告）：${r.oversize.length}`);
  for (const o of r.oversize) out.push(`  ${o.file}：${o.lines} 行，${o.kb} KB`);
  if (r.entry) {
    const e = r.entry;
    out.push(`入口 ${e.file}：${e.lines} 行，${e.chars} 字符（上限 ${e.limits.lines} 行 / ${e.limits.chars} 字符 / 单行 ${e.limits.lineChars}）`);
    out.push(`入口超标（警告）：${e.problems.length ? e.problems.join("；") : 0}`);
    for (const l of e.longLines) out.push(`  SKILL.md:${l.line}：${l.chars} 字符`);
  }
  return out.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("doc-lint.mjs")) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (opts.help) {
    console.log("用法：node scripts/maintain/doc-lint.mjs [--root <目录>] [--max-lines 600] [--max-kb 80] [--include-outside] [--json]\n根目录有 SKILL.md 时另报入口上限（120 行 / 7000 字符 / 单行 200 字符）。");
    process.exit(0);
  }
  const report = await lint(opts);
  console.log(opts.json ? JSON.stringify(report, null, 2) : render(report));
  process.exitCode = report.broken.length ? 1 : 0;
}
