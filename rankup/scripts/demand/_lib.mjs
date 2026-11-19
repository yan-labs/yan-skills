/**
 * 用途：demand/ 下各脚本共用的小工具（参数解析、token 读取、输出、表格打印、
 *       失败留现场：证据目录 + 运行 manifest）。
 *       不是可执行脚本，只被同目录的 *.mjs import。
 * 依赖：无（Node 22 内置 fetch / node:fs / node:path）
 * 已验证日期：2026-08-30
 *
 * 失败留现场契约（2026-08-30 重构第一波）：
 *   1. 采集失败不许只剩一句文案。get 系列与 saveEvidence 会把 {url,status,headers摘要,body}
 *      原样落进证据目录（--evidence-dir 或默认 .rankup/evidence/demand/<script>-<ts>/），
 *      抛出的异常信息里带落点路径。
 *   2. 每次运行落一份 manifest.json：{script, argv(剥敏), startedAt,
 *      sources:[{source,status,rawCount,error}], stopReason, finishedAt}。
 *      「0 条 + 3 源失败」和「0 条 + 3 源成功」从此长得不一样。
 *   3. 判断不在这里：manifest 只记录事实；空结果/失败怎么解读交给 AI。
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/** 解析 argv：--key value / --key=value / --flag / 位置参数 */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const body = a.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) { pushVal(out, body.slice(0, eq), body.slice(eq + 1)); continue; }
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[body] = true;
    else { pushVal(out, body, next); i++; }
  }
  return out;
}
function pushVal(o, k, v) {
  if (k in o) o[k] = Array.isArray(o[k]) ? [...o[k], v] : [o[k], v];
  else o[k] = v;
}
export const asList = (v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

/**
 * token 读取顺序：环境变量 → rankup/.env（KEY=value 每行一个）。
 * 永远不要把真实 token 写进脚本或文档。
 */
export function readToken(...names) {
  for (const n of names) if (process.env[n]) return process.env[n];
  const envFile = path.resolve(new URL('../../.env', import.meta.url).pathname);
  try {
    const txt = fs.readFileSync(envFile, 'utf8');
    for (const line of txt.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      if (names.includes(k)) return t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  } catch { /* .env 不存在就算了 */ }
  return null;
}

// ── 失败留现场：证据目录 + 运行 manifest ────────────────────────────────────

let _ev = null;

const tsSlug = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const inferScript = () => {
  try { return path.basename(process.argv[1] || 'demand', '.mjs') || 'demand'; } catch { return 'demand'; }
};

/** argv 剥敏：跟在 token/key/cookie 类旗标后面的值、以及长得像密钥的值，一律遮掉。 */
function scrubArgv(argv) {
  const SENSITIVE = /token|key|cookie|secret|password|auth/i;
  const LOOKS_SECRET = /^(sk|pk)_(live|test)_|^Bearer\s|^ey[A-Za-z0-9_-]{20,}/;
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--') && SENSITIVE.test(a)) {
      const eq = a.indexOf('=');
      out.push(eq !== -1 ? a.slice(0, eq + 1) + '<redacted>' : a);
      if (eq === -1 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) { out.push('<redacted>'); i++; }
      continue;
    }
    out.push(LOOKS_SECRET.test(a) ? '<redacted>' : a);
  }
  return out;
}

/**
 * 脚本入口处调用一次：initEvidence('script-name', { dir: args['evidence-dir'] })。
 * 不调用也能工作——第一次 saveEvidence/recordSource/get* 失败会用脚本文件名兜底初始化。
 */
export function initEvidence(script = inferScript(), { argv = process.argv.slice(2), dir = null } = {}) {
  _ev = {
    dir: path.resolve(process.cwd(), dir || `.rankup/evidence/demand/${script}-${tsSlug()}`),
    created: false,
    manifest: {
      script,
      argv: scrubArgv(argv),
      startedAt: new Date().toISOString(),
      sources: [],
      stopReason: null,
    },
  };
  return _ev;
}

function evEnsure() {
  if (!_ev) initEvidence();
  if (!_ev.created) { fs.mkdirSync(_ev.dir, { recursive: true }); _ev.created = true; }
  return _ev;
}

/** 证据目录绝对路径；还没初始化过则返回 null。 */
export const evidenceDir = () => _ev?.dir ?? null;

/** 把一份原始现场写进证据目录（字符串原样写，其它 JSON 化），返回绝对路径。 */
export function saveEvidence(name, data) {
  const ev = evEnsure();
  const file = path.join(ev.dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data, null, 2) + '\n');
  return file;
}

/**
 * 记一条数据源状态进 manifest：{source, status, rawCount, error, ...}。
 * status 约定：'ok' 表示采集动作本身成功（哪怕 rawCount 是 0）；
 * 其它任何值（'http_403'、'timeout'、'parse_error'…）表示采集失败——
 * 此时 rawCount 哪怕是 0 也不构成「没有数据」的证据。
 */
export function recordSource(entry) {
  if (!_ev) initEvidence();
  _ev.manifest.sources.push({ at: new Date().toISOString(), ...entry });
  return entry;
}

/** 落 manifest.json；stopReason 只在还没设置时生效（die 优先）。返回文件路径。 */
export function writeManifest(stopReason = 'completed') {
  if (!_ev) return null;
  if (_ev.manifest.stopReason == null) _ev.manifest.stopReason = stopReason;
  _ev.manifest.finishedAt = new Date().toISOString();
  const ev = evEnsure();
  const file = path.join(ev.dir, 'manifest.json');
  fs.writeFileSync(file, JSON.stringify(ev.manifest, null, 2) + '\n');
  return file;
}

/** 供空结果输出用：把 sources 状态折叠成人读行。没记录过源则返回 null。 */
export function sourceStatusSummary() {
  const src = _ev?.manifest.sources ?? [];
  if (!src.length) return null;
  const failed = src.filter((s) => s.status !== 'ok');
  const lines = src.map((s) =>
    `  - ${s.source}: ${s.status}` +
    (s.rawCount != null ? ` rawCount=${s.rawCount}` : '') +
    (s.error ? ` error=${String(s.error).replace(/\s+/g, ' ').slice(0, 160)}` : ''));
  return { lines, total: src.length, ok: src.length - failed.length, failed: failed.length };
}

/**
 * 浏览器失败现场的双证人：页面文本（DOM 证人）+ 视口截图（视觉证人），
 * 成对落进证据目录。**先取证后关**：调用方必须在 close 标签页之前调它。
 * 任何一步失败都不抛——取证失败不该掩盖原始错误——拿不到的证人记 null，
 * 拍不到的原因记 shotError（2026-08-30 实盘验证时补：静默 null 会让
 * 「这次没拍成」和「压根没拍」长得一样）。
 * 截图链路已实盘验证（2026-08-30 重构第二波，代码按 ground-truth.mjs 的
 * `opencli browser <session> screenshot <path>` 形态写；判决书见
 * backlink/evidence/screenshot-chain-VERDICTS.md）。
 */
export function captureBrowserScene(session, tag, { bin = 'opencli', windowMode = 'dedicated' } = {}) {
  const safe = String(tag).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'scene';
  const out = { text: null, shot: null, shotError: null };
  try {
    const r = spawnSync(bin, ['browser', session, '--window', windowMode, 'eval',
      '(()=>({url:location.href,title:document.title,readyState:document.readyState,' +
      'text:document.body?document.body.innerText.slice(0,30000):null}))()'],
      { encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024 });
    const stdout = r.stdout || '';
    const i = stdout.indexOf('{');
    out.text = saveEvidence(`${safe}-page.json`, i >= 0 ? stdout.slice(i)
      : { error: 'eval 未返回 JSON', stdout: stdout.slice(0, 400), stderr: (r.stderr || '').slice(0, 400) });
  } catch (e) {
    try { out.text = saveEvidence(`${safe}-page.json`, { error: String(e?.message ?? e) }); } catch { /* 证人拿不到就记 null */ }
  }
  try {
    const ev = evEnsure();
    const file = path.join(ev.dir, `${safe}-shot.png`);
    const r = spawnSync(bin, ['browser', session, '--window', windowMode, 'screenshot', file],
      { encoding: 'utf8', timeout: 90000 });
    if (r.status === 0 && fs.existsSync(file)) out.shot = file;
    // 拍不到也是事实：静默 null 会让「这次没拍成」和「没想过要拍」长得一模一样。
    else out.shotError = String(r.error?.message || r.stderr || `exit ${r.status}`).replace(/\s+/g, ' ').slice(0, 300);
  } catch (e) {
    out.shotError = String(e?.message ?? e).replace(/\s+/g, ' ').slice(0, 300);
  }
  return out;
}

/** fetch 响应头摘要：只留诊断相关的几个，绝不落 cookie。 */
function headerSummary(res) {
  const keep = ['content-type', 'retry-after', 'server', 'cf-ray', 'cf-mitigated',
    'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'location'];
  const out = {};
  for (const k of keep) { const v = res?.headers?.get?.(k); if (v) out[k] = v; }
  return out;
}

/** 采集失败 → 完整现场落盘，返回一个信息里带落点路径的 Error（由调用方抛）。 */
function fetchFailure(url, res, body, note) {
  const status = res?.status ?? null;
  let file = null;
  try {
    file = saveEvidence(`fetch-${Date.now()}-${status ?? 'neterr'}.json`, {
      at: new Date().toISOString(), url, status,
      headers: res ? headerSummary(res) : null,
      note: note ?? null, body: body ?? null,
    });
  } catch { /* 证据都写不进去时至少别把原始错误吞了 */ }
  const head = note ? `${note}：` : '';
  const tail = file ? `（现场已留 ${file}）` : '';
  const snippet = body ? ` :: ${String(body).slice(0, 200)}` : '';
  return new Error(`${head}HTTP ${status} ${url}${snippet}${tail}`);
}

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** 带重试与超时的 fetch；默认带浏览器 UA（多数公开榜单会挡默认 UA） */
export async function get(url, { headers = {}, retries = 2, timeout = 25000, ua = DEFAULT_UA } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        signal: ctl.signal,
        headers: { 'user-agent': ua, 'accept-language': 'en-US,en;q=0.9', ...headers },
      });
      clearTimeout(t);
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status} ${url}`);
        if (i < retries) { await sleep(800 * (i + 1)); continue; }
      }
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < retries) await sleep(800 * (i + 1));
    }
  }
  // 网络层失败（超时/连接被重置）：把能拿到的都留下再抛。
  let file = null;
  try {
    file = saveEvidence(`fetch-${Date.now()}-neterr.json`, {
      at: new Date().toISOString(), url,
      error: String(lastErr?.message ?? lastErr),
      code: lastErr?.cause?.code ?? lastErr?.code ?? null,
    });
  } catch { /* 留不下现场也要抛原始错误 */ }
  throw new Error(`${String(lastErr?.message ?? lastErr)}${file ? `（现场已留 ${file}）` : ''}`);
}

export async function getJson(url, opts = {}) {
  const res = await get(url, { headers: { accept: 'application/json' }, ...opts });
  const text = await res.text();
  if (!res.ok) throw fetchFailure(url, res, text);
  try { return JSON.parse(text); } catch {
    throw fetchFailure(url, res, text, '响应不是 JSON（可能被反爬挡了）');
  }
}

export async function getText(url, opts = {}) {
  const res = await get(url, opts);
  const text = await res.text();
  if (!res.ok) throw fetchFailure(url, res, text);
  return text;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 落盘：.jsonl 走 JSON Lines，其它走 pretty JSON */
export function writeOut(file, rows) {
  const p = path.resolve(process.cwd(), file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (p.endsWith('.jsonl')) fs.writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  else fs.writeFileSync(p, JSON.stringify(rows, null, 2) + '\n');
  return p;
}

const width = (s) => [...String(s)].reduce((n, c) => n + (/[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(c) ? 2 : 1), 0);
const pad = (s, w) => String(s) + ' '.repeat(Math.max(0, w - width(s)));
const clip = (s, max) => {
  s = String(s ?? '').replace(/\s+/g, ' ').trim();
  if (width(s) <= max) return s;
  let out = '', w = 0;
  for (const c of s) { const cw = width(c); if (w + cw > max - 1) break; out += c; w += cw; }
  return out + '…';
};

/** 人类可读表格；cols = [{key, label, max}] */
export function printTable(rows, cols) {
  if (!rows.length) {
    // 「0 条 + 源失败」和「0 条 + 源成功」必须长得不一样。
    const s = sourceStatusSummary();
    if (!s) { console.log('(无结果)'); return; }
    if (s.failed) console.log(`(无结果——但 ${s.failed}/${s.total} 个源采集失败，这不是「没有数据/没有需求」的证据)`);
    else console.log(`(无结果：${s.total} 个源全部采集成功，确实取到 0 条)`);
    console.log('源状态：');
    for (const l of s.lines) console.log(l);
    if (evidenceDir()) console.log(`证据目录：${evidenceDir()}`);
    return;
  }
  const cells = rows.map((r) => cols.map((c) => clip(r[c.key], c.max ?? 40)));
  const ws = cols.map((c, i) => Math.max(width(c.label), ...cells.map((row) => width(row[i]))));
  console.log(cols.map((c, i) => pad(c.label, ws[i])).join('  '));
  console.log(ws.map((w) => '-'.repeat(w)).join('  '));
  for (const row of cells) console.log(row.map((v, i) => pad(v, ws[i])).join('  '));
}

/** 统一收尾：--json / --out / 表格；记录过源状态的运行顺手落 manifest */
export function emit(rows, args, cols) {
  if (args.out) {
    const p = writeOut(args.out, rows);
    if (!args.json) console.error(`已写入 ${p}（${rows.length} 条）`);
  }
  const s = sourceStatusSummary();
  const mf = _ev ? writeManifest('completed') : null;
  if (args.json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    printTable(rows, cols);
    console.error(`\n共 ${rows.length} 条`);
  }
  // 有失败源时不论输出形态都要在 stderr 挂状态行，防止 0/少条被读成结论。
  if (s?.failed) {
    console.error(`注意：${s.failed}/${s.total} 个源采集失败——缺的行是「没取到」，不是「不存在」。`);
    for (const l of s.lines) console.error(l);
  }
  if (mf) console.error(`manifest：${mf}`);
}

/**
 * 会话名就是标签页的所有权声明：两个任务挑同一个名字就共用同一个标签页，
 * 各自读回对方打开的页面——导航报成功、数据是别人的、全程不报错。
 * 所以任何脚本都不许把会话名的默认值写成字面常量。
 *
 * 后缀取「真正会并发的那个单位」：一次对话 = 一个 CLAUDE_CODE_SESSION_ID。
 * HOST_SESSION_ID 是整个桌面端共用的，拿它当第一顺位等于把同一个标签页
 * 发给两个并行任务，只能垫底。node 脚本里 pid 全程不变所以可以兜底，
 * 但 Bash tool 里的 `$$` 每次调用都变，绝不能用。
 */
export function sessionName(base) {
  const suffix = (
    process.env.OPENCLI_SESSION_SUFFIX ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.CLAUDE_CODE_HOST_SESSION_ID ||
    String(process.ppid)
  ).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "local";
  return `${base}-${suffix}`;
}

/** 退出前先落 manifest（stopReason=died），现场路径打给调用方，再退出。 */
export function die(msg) {
  if (_ev) {
    _ev.manifest.stopReason = `died: ${String(msg).replace(/\s+/g, ' ').slice(0, 300)}`;
    try {
      const f = writeManifest();
      if (f) console.error(`现场已留：${f}`);
    } catch { /* manifest 写不进去也要把错误打出来 */ }
  }
  console.error(`错误：${msg}`);
  process.exit(1);
}

/**
 * 探测 OpenCLI 浏览器桥是否连上，短超时，三种判定：
 *   - true  ：doctor 明确说连上了
 *   - false ：doctor 明确说没连上
 *   - null  ：探测本身不可信（opencli 不存在、超时、输出格式认不出）——
 *             调用方必须把 null 当「放行」处理，绝不能因为探测器自己的问题
 *             挡住一个本来可能能跑的调用。
 *
 * 判据只认 `[OK] Connectivity`，不认 "Everything looks good"：doctor 只要有
 * 任何一条 Issue（哪怕只是「扩展版本比 example-owner 构建旧」这种纯建议）就不再
 * 打印那句话，但桥其实完全可用。这个坑 reddit-wishes.mjs 已经踩过一次
 * （2026-08-23），这里直接复用同一条判据，不再各写各的。
 */
export function probeBrowserBridge(bin = 'opencli', timeoutMs = 4000) {
  const r = spawnSync(bin, ['doctor'], { encoding: 'utf8', timeout: timeoutMs });
  if (r.error || r.status === null) return null; // 调不起来 / 超时
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  if (/\[OK\]\s*Connectivity/i.test(out)) return true;
  if (/Connectivity/i.test(out)) return false;
  return null; // 有输出但读不懂，别当成「没连上」
}

/**
 * 挡在「真的要发浏览器调用」之前的硬检查：明确没连上就 fail fast 并说清楚
 * 原因（不是「查无结果」，是桥没通），别的情况一律放行（fail open）。
 *
 * 为什么要 fail open：探测器本身也可能坏（opencli 升级改了 doctor 的文案、
 * 二进制暂时不在 PATH、这次探测恰好超时），一个会误报「没连上」的检查
 * 比它要防的那个静默卡死更糟——会把每一个原本能跑的环境都挡下来。
 */
export function requireBrowserBridge(bin = 'opencli') {
  if (probeBrowserBridge(bin) === false) {
    die(
      'OpenCLI 浏览器桥没连上——这不是「查无结果」，是根本没取到数据。\n' +
      '  修复：打开 Chrome → 确认 OpenCLI 扩展已安装并启用 → 跑 `opencli doctor`，' +
      '看到 Connectivity 那行是 [OK] 再重跑本脚本。'
    );
  }
}
