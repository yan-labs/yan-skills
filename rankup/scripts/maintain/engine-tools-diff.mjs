#!/usr/bin/env node
// engine-tools-diff.mjs —— 比对站点引擎当前的 MCP 工具名与 references/integrations/site-engine.md 末尾的工具名清单。
//
//   node scripts/maintain/engine-tools-diff.mjs --names <文件>             # 名单取自新会话的工具列表，空白分隔
//   node scripts/maintain/engine-tools-diff.mjs --engine-src <引擎源码目录>  # 从源码的工具定义里取名
//   node scripts/maintain/engine-tools-diff.mjs ... [--doc <md 文件>] [--json]
//
// 为什么：Skill 只写工具名与时机、不抄参数；引擎几乎天天改，工具改名或下线后集成文件会静默过期，
// AI 照着旧名字调用只会得到「没有这个工具」。集成文件「核对漂移」一节写了什么时候跑。
// 源码取名规则：src/core/tools.ts、src/core/*-tools.ts 与 src/types/*/index.ts 里形如 `  name: 'tool_name',` 的行
// （2026-11-27 按引擎源码核对：同目录其他文件里的预置提示词等也用 name 字段，不能全扫）。
// 退出码：0 一致；1 有差异；2 参数或读取错误。只读，不改任何文件。

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const defaultDoc = path.join(skillRoot, "references", "integrations", "site-engine.md");
const NAME = /^[a-z][a-z0-9_]*$/;

export function parseArgs(argv) {
  const opts = { doc: defaultDoc, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--names") opts.names = argv[++i];
    else if (a === "--engine-src") opts.engineSrc = argv[++i];
    else if (a === "--doc") opts.doc = path.resolve(argv[++i] ?? "");
    else if (a === "--json") opts.json = true;
    else if (a === "-h" || a === "--help") opts.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!opts.help && !opts.names === !opts.engineSrc) throw new Error("--names 与 --engine-src 二选一");
  return opts;
}

export function docTools(text) {
  const m = text.match(/<!-- tools:start -->([\s\S]*?)<!-- tools:end -->/);
  if (!m) throw new Error("集成文件里没有 <!-- tools:start --> … <!-- tools:end --> 清单");
  return new Set(m[1].split(/\s+/).filter((w) => NAME.test(w)));
}

export function namesFromList(text) {
  return new Set(text.split(/[\s,]+/).map((w) => w.trim()).filter((w) => NAME.test(w)));
}

export function namesFromSource(text) {
  return [...text.matchAll(/^\s+name:\s*['"]([a-z][a-z0-9_]*)['"],/gm)].map((m) => m[1]);
}

async function sourceFiles(dir) {
  const files = [];
  const core = path.join(dir, "src", "core");
  for (const e of await readdir(core, { withFileTypes: true })) {
    if (e.isFile() && /(?:^|-)tools\.ts$/.test(e.name)) files.push(path.join(core, e.name));
  }
  const types = path.join(dir, "src", "types");
  for (const e of await readdir(types, { withFileTypes: true }).catch(() => [])) {
    if (e.isDirectory()) files.push(path.join(types, e.name, "index.ts"));
  }
  return files;
}

export async function engineToolsFromSource(dir) {
  const names = new Set();
  for (const file of await sourceFiles(dir)) {
    const text = await readFile(file, "utf8").catch(() => "");
    for (const n of namesFromSource(text)) names.add(n);
  }
  return names;
}

export function diff(engine, doc) {
  const added = [...engine].filter((n) => !doc.has(n)).sort();
  const missing = [...doc].filter((n) => !engine.has(n)).sort();
  return { engineCount: engine.size, docCount: doc.size, added, missing };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("engine-tools-diff.mjs")) {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
  if (opts.help) {
    console.log("用法：node scripts/maintain/engine-tools-diff.mjs (--names <文件> | --engine-src <目录>) [--doc <md>] [--json]");
    process.exit(0);
  }
  try {
    const doc = docTools(await readFile(opts.doc, "utf8"));
    const engine = opts.names
      ? namesFromList(await readFile(opts.names, "utf8"))
      : await engineToolsFromSource(path.resolve(opts.engineSrc));
    const r = diff(engine, doc);
    if (opts.json) console.log(JSON.stringify(r, null, 2));
    else {
      console.log(`引擎 ${r.engineCount} 个工具，集成文件清单 ${r.docCount} 个`);
      console.log(`引擎新增（判断要不要进协同表）：${r.added.length ? r.added.join(" ") : 0}`);
      console.log(`集成文件有、引擎没有（改名或下线，必须修）：${r.missing.length ? r.missing.join(" ") : 0}`);
    }
    process.exitCode = r.added.length || r.missing.length ? 1 : 0;
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
