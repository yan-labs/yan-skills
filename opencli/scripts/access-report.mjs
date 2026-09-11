#!/usr/bin/env node
/**
 * access-report.mjs — 读 ~/.opencli/logs/site-access.jsonl，回答复盘时最常问的问题。
 *
 * 为什么需要它：OpenCLI 自己的日志答不了这些——它记标签页租约和导航超时，
 * 不记 HTTP 状态、不记响应体、不记谁在调。而复盘要问的恰恰是：
 * 「这一串标签页是谁开的」「哪个路由最费劲」「哪几次取回来是空的」。
 *
 * 用法：
 *   node access-report.mjs                    # 全部
 *   node access-report.mjs --since 2h         # 最近两小时（也支持 30m / 3d）
 *   node access-report.mjs --site sem.3ue.co  # 只看一个站
 *   node access-report.mjs --suspicious       # 只列可疑行（失败 / 超时 / 配额站空响应 / 限流降级）
 *   node access-report.mjs --degraded         # 只列 detectDegradation 命中的那一类
 *   node access-report.mjs -f json            # 机器可读
 */
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
/** 参数解析内联在这里，让这个脚本零依赖、单文件可拷走。 */
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const t = argv[i];
    if (t === '--help' || t === '-h') { flags.help = true; continue; }
    if (!t.startsWith('-')) continue;
    const key = t.replace(/^-+/, '');
    const next = argv[i + 1];
    if (next && !next.startsWith('-')) { flags[key] = next; i += 1; } else flags[key] = true;
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));
if (flags.help) {
  console.log(readFileSync(new URL(import.meta.url).pathname, 'utf8').match(/\/\*\*([\s\S]*?)\*\//)[1]
    .split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').trim());
  process.exit(0);
}
const path = flags.file || join(homedir(), '.opencli', 'logs', 'site-access.jsonl');
if (!existsSync(path)) {
  console.error(`没有访问日志：${path}\n跑过任何 opencli 调用之后才会有（OPENCLI_ACCESS_LOG=0 会关掉记账）。`);
  process.exit(1);
}

const rows = readFileSync(path, 'utf8').split('\n')
  .filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } })
  .filter(Boolean);

const since = (() => {
  if (!flags.since) return 0;
  const m = String(flags.since).match(/^(\d+)([mhd])$/);
  if (!m) throw new Error('--since 形如 30m / 2h / 3d');
  return Date.now() - Number(m[1]) * { m: 60e3, h: 3600e3, d: 86400e3 }[m[2]];
})();

let data = rows.filter((r) => Date.parse(r.ts) >= since);
if (flags.site) data = data.filter((r) => r.site === flags.site);

const pct = (arr, p) => {
  if (!arr.length) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

/**
 * 「可疑」不等于「限流」——本脚本不判限流，只把值得肉眼看一眼的行捞出来。
 *
 * 第一版判据是「失败，或 eval 且 bytes < 200」，实测标出 601/1080 行，等于没筛。
 * 两个错误：正常的小 eval 本来就几十字节（`JSON.stringify({url})` 就是），
 * 以及测试桩的 `opencli stub` 会刷出成百上千条失败。判据太松等于没有判据——
 * 没人会去翻一份 55% 都是「可疑」的清单。
 *
 * 现在的判据留四类，每一类都能说出为什么值得看：
 *   1. 真失败——排除已知噪音（测试桩、Node 的 UNDICI 警告、session_not_found）
 *   2. 超时——页面没在时限内给出东西，配额站上尤其值得看
 *   3. 配额站上「成功但几乎没内容」——限流和降级渲染都长这样（bytes 判据，粗）
 *   4. `degraded_kind` 非空——`detectDegradation`（opencli-core.mjs）读了页面原文
 *      判出来的限流/设备上限/降级渲染/登录态失效，是细判据，日志里已经有结论了
 * 前两类是硬信号，第三类是软信号（只在配额站上算数），第四类比第三类更细——
 * 有了它之后第三类里一部分行会同时命中第四类，这是预期内的重叠，不去重：
 * 第三类答的是「bytes 小」，第四类答的是「读了内容之后判定是哪一种」。
 *
 * 噪音源本身也堵掉了两处，所以这条正则现在是兜底而不是主力：测试桩那条改成
 * 在测试里设 OPENCLI_ACCESS_LOG=0（不再往真日志里写），Node 的 UNDICI 警告改成
 * 在 opencli-core.mjs 的 run() 里剥掉（它曾把真正的失败原因挤出 200 字截断）。
 * 老日志里的噪音还在，所以别删这条正则。
 */
const NOISE = /opencli stub|UNDICI-EHPA|session_not_found|No active session/i;
const degraded = data.filter((r) => Boolean(r.degraded_kind));
const suspicious = data.filter((r) => {
  if (r.degraded_kind) return true;
  if (!r.ok) {
    if (NOISE.test(r.error || '')) return false;
    return true;
  }
  return r.quota && r.bytes !== null && r.bytes < 120;
});

if (flags.degraded) {
  for (const r of degraded) {
    console.log(`${r.ts}  ${String(r.degraded_kind).padEnd(14)}  ${(r.tag || r.script || r.session || '-').padEnd(24)}  ${r.site || '-'}${r.route || ''}`);
    for (const line of r.evidence || []) console.log(`        - ${line}`);
  }
  console.log(`\n共 ${degraded.length} 行 degraded / 总 ${data.length} 行`);
  process.exit(0);
}

if (flags.suspicious) {
  for (const r of suspicious) {
    const why = r.degraded_kind ? `降级:${r.degraded_kind}`
      : !r.ok ? (/timed out/i.test(r.error || '') ? '超时' : '失败')
      : '配额站空响应';
    console.log(`${r.ts}  ${why.padEnd(14)}  ${String(r.bytes ?? '-').padStart(6)}B  ${(r.tag || r.script || r.session || '-').padEnd(24)}  ${r.site || '-'}${r.route || ''}${r.error ? `\n        ${String(r.error).split('\n')[0].slice(0, 140)}` : ''}`);
    if (r.degraded_kind) for (const line of r.evidence || []) console.log(`        - ${line}`);
  }
  console.log(`\n共 ${suspicious.length} 行可疑 / 总 ${data.length} 行（含 ${degraded.length} 行 degraded）`);
  process.exit(0);
}

const byRoute = new Map();
for (const r of data) {
  const key = `${r.site || '-'}${r.route || ''}`;
  if (!byRoute.has(key)) byRoute.set(key, { n: 0, fail: 0, ms: [], quota: r.quota });
  const g = byRoute.get(key);
  g.n += 1; if (!r.ok) g.fail += 1; if (typeof r.ms === 'number') g.ms.push(r.ms);
}
const routes = [...byRoute.entries()].sort((a, b) => b[1].n - a[1].n);

// 顺序有讲究：显式 tag（人写的任务名）> script（入口脚本，自动）> 会话名。
// 会话名排最后是因为配额站上它由站点决定——`semrush-nav` 答的是「哪个站」，
// 不是「谁开的」，拿它当调用方会把所有脚本糊成一坨。
const byWho = new Map();
for (const r of data) {
  const key = r.tag || r.script || r.session || '-';
  byWho.set(key, (byWho.get(key) || 0) + 1);
}

if (flags.format === 'json' || flags.f === 'json') {
  console.log(JSON.stringify({
    total: data.length, suspicious: suspicious.length,
    routes: routes.map(([k, g]) => ({ route: k, n: g.n, fail: g.fail, quota: g.quota, p50: pct(g.ms, 0.5), p95: pct(g.ms, 0.95) })),
    byWho: Object.fromEntries(byWho),
  }, null, 2));
  process.exit(0);
}

console.log(`访问日志 ${path}\n范围 ${data.length} 行${flags.since ? ` (最近 ${flags.since})` : ''}${flags.site ? ` site=${flags.site}` : ''}\n`);
console.log('按路由（决定哪些值得封 adapter）');
console.log('   次数   失败    p50     p95  配额站  路由');
for (const [key, g] of routes.slice(0, Number(flags.top || 20))) {
  console.log(`${String(g.n).padStart(7)}${String(g.fail).padStart(7)}${String(pct(g.ms, 0.5) ?? '-').padStart(7)}ms${String(pct(g.ms, 0.95) ?? '-').padStart(7)}ms${(g.quota ? '   是  ' : '   -   ').padStart(7)}  ${key}`);
}
console.log('\n按调用方（复盘「这串标签页是谁开的」；tag > 脚本名 > 会话名）');
for (const [key, n] of [...byWho].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`${String(n).padStart(7)}  ${key}`);
}
console.log(`\n可疑行 ${suspicious.length} 条（含 ${degraded.length} 行 degraded）——用 --suspicious 看明细（真失败 / 超时 / 配额站上的空响应 / detectDegradation 判出的限流降级，已排除测试桩等已知噪音）`);
console.log(`degraded_kind 非空的行单独用 --degraded 看，附带 detectDegradation 给出的证据`);
console.log(`取样落在 ~/.opencli/logs/samples/，那里才有页面原文——限流和降级渲染都是 HTTP 200，光看 bytes 分不出来`);
