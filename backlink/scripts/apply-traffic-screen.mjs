#!/usr/bin/env node
/**
 * apply-traffic-screen.mjs —— 把批量采集（similarweb-batch / semrush-batch）的
 * JSONL 证据写回 data/submission-targets.json 的 `traffic` 字段。**纯搬运，不判决。**
 *
 * 写回的只有：实测数字 + 证据路径 + checkedAt + 采集口径（source/db/globalRank）。
 * **不落 verdict 字段。** 「过不过 100 门槛」由 targets-select 在查询时对实测数字
 * 现算；「空值意味着什么」由 AI 拿着证据（stopReason + rawExcerpt + 截图）下判。
 * 空值 ≠ 低流量：它只说明这次没拿到数字，成因在 stopReason 里。
 *
 * 写回的 traffic 形状：
 *   { monthlyVisits, checkedAt, source, db, globalRank,
 *     evidence: { stopReason, parse, screenshot, raw, jsonl } }
 *
 * 只写 `traffic`，**不改 `status`**。两个字段答的是不同问题：
 *   status  —— 这个入口还在不在（可达性）
 *   traffic —— 值不值得走这个入口（准入）
 *
 * 未完成的行（stopReason: unstable/timeout/exception，旧格式 verdict: error）
 * 不是测量。它们只做一件事：**清掉同一数据源留下的旧测量**——超时被误记成的
 * 旧结论不能留在表里冒充已测。
 *
 * ── 旧数据迁移策略（--help 正文）──────────────────────────────────────────
 * 历史上 traffic 里落过 `verdict: pass/fail/below-floor`。处理方式：
 *   1. 本脚本写回的新 traffic 对象**不含 verdict**，重测一个域名即自然替换掉旧判决；
 *   2. 未重测的行保留旧 verdict 原值，validate-data.mjs 将其视为 legacy 字段
 *      （警告不报错）——旧值是当时的脚本判决，只可当历史参考，不可当测量事实；
 *   3. `--strip-legacy-verdicts` 一次性删除表中所有 traffic.verdict 字段
 *      （数字、时间、来源全部保留），供整表切换到新语义时使用。
 *
 * 用法：node scripts/apply-traffic-screen.mjs --in traffic.jsonl [--source similarweb]
 *         [--file <targets.json>] [--strip-legacy-verdicts] [--dry]
 */
import fs from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { helpGuard } from './opencli-core.mjs';
import { isRowComplete } from './lib-batch-evidence.mjs';
helpGuard(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_FILE = join(HERE, '..', 'data', 'submission-targets.json');

const a = { in: [], source: 'similarweb', dry: false, file: DEFAULT_FILE, stripLegacy: false };
for (let i = 2; i < process.argv.length; i++) {
  const f = process.argv[i]; const v = () => process.argv[++i];
  if (f === '--in') a.in.push(v());
  else if (f === '--source') a.source = v();
  else if (f === '--file') a.file = resolve(v());
  else if (f === '--strip-legacy-verdicts') a.stripLegacy = true;
  else if (f === '--dry') a.dry = true;
  else { process.stderr.write(`unknown flag ${f}\n`); process.exit(2); }
}
if (!a.in.length && !a.stripLegacy) { process.stderr.write('--in <jsonl> is required (repeatable), unless only --strip-legacy-verdicts\n'); process.exit(2); }

const byDomain = new Map();
for (const line of a.in.flatMap((f) => fs.readFileSync(f, 'utf8').split('\n'))) {
  if (!line.trim()) continue;
  const r = JSON.parse(line);
  // 未完成的行不是测量。绝不写进去冒充读数——而且如果表里已经写着一条
  // 由未完成降级来的旧测量（例如超时被误记成的空读数），必须**清掉**它，
  // 不能留在那儿冒充已测。所以未完成也要进 map，只是带上删除标记。
  if (!isRowComplete(r)) { byDomain.set(r.domain, { ...r, __clear: true }); continue; }
  const prev = byDomain.get(r.domain);
  if (prev && Date.parse(prev.checkedAt) >= Date.parse(r.checkedAt)) continue;
  byDomain.set(r.domain, r);
}

/** 该行所在的 JSONL 与 evidence 相对路径基准：记来源文件名，AI 复核时能找到现场。 */
const jsonlOf = new Map();
for (const f of a.in) {
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { jsonlOf.set(JSON.parse(line).domain, f); } catch { /* 半行 */ }
  }
}

const doc = JSON.parse(fs.readFileSync(a.file, 'utf8'));
let applied = 0;
let cleared = 0;
let stripped = 0;
const counts = { measured: 0, 'no-number': 0 };
for (const t of doc.targets) {
  if (a.stripLegacy && t.traffic && 'verdict' in t.traffic) { delete t.traffic.verdict; stripped++; }
  const r = byDomain.get(t.domain);
  if (!r) continue;
  // **只清掉同一个数据源留下的旧测量。** A 源这次没测成，对 B 源已经测出来的数字
  // 不构成任何否定——跨源清除会让「先跑 B 再跑 A」把 B 的成果全抹掉，
  // 而输出只轻描淡写地说 cleared N，极易被当成正常。
  if (r.__clear) {
    if (t.traffic && t.traffic.source === a.source) { delete t.traffic; cleared++; }
    continue;
  }
  t.traffic = {
    // 2026-09-12 实测：Similarweb 面板会把请求的 28 天窗口悄悄改写成别的窗口
    // （落地成 6 个月累计），而「总访问量」标签在两种窗口下长一个样，
    // r.totalVisits 因此可能是 28 天数字也可能是 6 个月累计数字。
    // r.monthlyVisits（页面「参与度概览」区自己给的月度数字）在场时优先用它；
    // 没有它的行（旧格式行、Semrush 行、或 Similarweb 没有改写窗口的行）
    // 退回 r.totalVisits ?? r.organicTraffic，行为与改动前一致。
    monthlyVisits: (r.monthlyVisits ?? r.totalVisits ?? r.organicTraffic) ?? null,
    checkedAt: r.checkedAt,
    source: a.source,
    // Semrush 行带 db（该次测的是哪个国家库，undefined 说明来自没有国家维度的
    // Similarweb 行），保留下来是唯一能事后判断"这个 monthlyVisits 是不是被裁到
    // 一个国家"的字段——不留痕迹的话，下一轮筛选没法分辨这个数字的地理范围。
    db: r.db ?? null,
    globalRank: Number.isInteger(r.globalRank) ? r.globalRank : null,
    // 证据指针：stopReason 说明这次采集是怎么结束的（stable/empty-state），
    // screenshot/raw 是 evidence 目录里的现场，jsonl 是整行所在的输出文件。
    // 旧格式行（没有这些字段）落 null——那正是「无现场可复核」的历史债标记。
    evidence: {
      stopReason: r.stopReason ?? null,
      parse: r.parse ?? null,
      // 原样保留页面自己的窗口文案，供复核这个 monthlyVisits 到底出自哪种
      // 窗口（28 天原生 / 页面自报月度 / 未知）——不代表脚本替调用方下了判断。
      windowLabel: r.windowLabel ?? null,
      screenshot: r.evidence?.screenshot ?? null,
      raw: r.evidence?.raw ?? null,
      jsonl: jsonlOf.get(r.domain) ?? null,
    },
  };
  applied++;
  counts[t.traffic.monthlyVisits === null ? 'no-number' : 'measured'] += 1;
}
doc.updatedAt = new Date().toISOString().slice(0, 10);

const unmatched = [...byDomain.keys()].filter((d) => !doc.targets.some((t) => t.domain === d));
process.stderr.write(`applied ${applied} of ${byDomain.size} rows (${counts.measured} with a number, ${counts['no-number']} source-reported no data); cleared ${cleared} stale measurement(s)${a.stripLegacy ? `; stripped ${stripped} legacy verdict field(s)` : ''}\n`);
if (unmatched.length) process.stderr.write(`${unmatched.length} measured domain(s) not in the table (ignored): ${unmatched.slice(0, 8).join(', ')}\n`);
if (a.dry) { process.stderr.write('--dry: nothing written\n'); process.exit(0); }
fs.writeFileSync(a.file, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
process.stderr.write(`wrote ${a.file}\n`);
