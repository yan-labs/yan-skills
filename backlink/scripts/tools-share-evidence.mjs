#!/usr/bin/env node
/**
 * Rendered, redacted Tools Share evidence capture.
 *
 * ⚠️ **For a new capture, reach for `scripts/ground-truth.mjs` first.**
 * (Third refactor wave, 2026-08-30.) That script is the reference collector for
 * this Skill's `every-measurement-needs-two-witnesses` law: it pairs a
 * shadow-DOM-piercing census with a screenshot **at every dwell position**,
 * scrolls the real (possibly inner) scroll container, writes a manifest with a
 * `stopReason` and a `readyBranch`, holds the machine-wide per-tool lock, and
 * checks its own landing URL after every read so another session's takeover
 * cannot be mistaken for your data. None of that is in this file.
 *
 * **This file is kept, not retired**, because it still owns two things
 * ground-truth.mjs does not:
 *   - the `REPORTS` route registry below — the actual URL shapes and readiness
 *     regexes for 3 Similarweb and 6 Semrush reports. ground-truth.mjs takes a
 *     URL; something has to know what URL. Read routes from here.
 *   - the wider artifact set (page.html / page.ax.json / page.network.json /
 *     page.app-json.json), which is the right tool when the question is about
 *     the page's *plumbing* rather than its rendered numbers.
 * It is also published in package.json `files`, so its path is part of the
 * installed surface — do not move or delete it without a version bump.
 *
 * Either way the rule is unchanged: **this script collects, it does not judge.**
 *
 * node scripts/tools-share-evidence.mjs --tool semrush --report organic-pages --domain example.com --out-dir evidence/example
 * node scripts/tools-share-evidence.mjs --tool semrush --report custom --path /analytics/ --page-kind table --out-dir evidence/example
 * node scripts/tools-share-evidence.mjs --self-test
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { firstJson, opencli, parseFlags, printJson, resolveSession, showHelpIfRequested } from './opencli-core.mjs';
import { captureStable, gotoInTool, launchTool, redactSecrets, scrub } from './lib-tools-share.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const TRANSIENT = /出错了|我们已经发现了问题|请稍后重试|Something went wrong/i;
const NO_DATA = /抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data|我们没有此网站的数据/i;
const ARTIFACTS = ['page.txt', 'page.html', 'page.dom.json', 'page.ax.json', 'page.parsed.json', 'page.app-json.json', 'page.network.json', 'full.png'];
const REPORTS = {
  similarweb: {
    performance: { needs: 'domain', kind: 'scalar', ready: /总访问量/, hasData: /总访问量[\s\S]{0,200}\d/, path: (t) => '/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?webSource=Total&key=' + encodeURIComponent(t) },
    channels: { needs: 'domain', kind: 'table', ready: /渠道流量|流量来源渠道/, hasData: /流量来源渠道[\s\S]{0,1500}\d+(?:\.\d+)?%/, path: (t) => '/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d/?webSource=Total&key=' + encodeURIComponent(t) },
    'similar-sites': { needs: 'domain', kind: 'table', ready: /相似度|类似的网站/, hasData: /[a-z0-9-]+\.[a-z]{2,}/i, path: (t) => '/#/digitalsuite/websiteanalysis/overview/competitive-landscape/*/999/3m?key=' + encodeURIComponent(t) },
  },
  semrush: {
    'organic-overview': { needs: 'domain', kind: 'scalar', ready: /流量成本|Traffic Cost/, path: (t, db) => '/analytics/organic/overview/?searchType=domain&q=' + encodeURIComponent(t) + '&db=' + encodeURIComponent(db) },
    'organic-positions': { needs: 'domain', kind: 'table', ready: /未找到结果|No results|没有数据|https?:\/\//, path: (t, db) => '/analytics/organic/positions/?searchType=domain&q=' + encodeURIComponent(t) + '&db=' + encodeURIComponent(db) },
    'organic-pages': { needs: 'domain', kind: 'table', ready: /未找到结果|No results|没有数据|https?:\/\//, path: (t, db) => '/analytics/organic/pages/?searchType=domain&q=' + encodeURIComponent(t) + '&db=' + encodeURIComponent(db) },
    'backlinks-overview': { needs: 'domain', kind: 'scalar', ready: /Authority Score|权威分数/, path: (t) => '/analytics/backlinks/overview/?q=' + encodeURIComponent(t) + '&searchType=domain' },
    'backlinks-list': { needs: 'domain', kind: 'table', ready: /未找到|No backlinks|没有数据|https?:\/\//, path: (t) => '/analytics/backlinks/backlinks/?q=' + encodeURIComponent(t) + '&searchType=domain' },
    'keyword-overview': { needs: 'keyword', kind: 'scalar', ready: /关键词摘要|Keyword overview/, path: (t, db) => '/analytics/keywordoverview/?q=' + encodeURIComponent(t) + '&db=' + encodeURIComponent(db) },
  },
};

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export function normalizeSecretKey(name) { return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
const SAFE_KEYS = new Set(['sessionreused']);
export function isSecretKey(name) {
  const key = normalizeSecretKey(name);
  if (!key || SAFE_KEYS.has(key)) return false;
  return key === 'gmitm' || /session|token|secret|password|passwd|pwd|cookie|authorization|credential|apikey|privatekey/.test(key)
    || /(?:jwt|signature|sig)$/.test(key);
}
const MACHINE_KEY = /^(?:sha256|bytes|count|maskedCount|reads|reloads|scrollHeight|clientHeight)$/i;
function secretParam(name) { return isSecretKey(name); }
export function sanitizedUrl(value) {
  try {
    const url = new URL(String(value));
    for (const key of [...url.searchParams.keys()]) if (secretParam(key)) url.searchParams.delete(key);
    if (url.hash.includes('?')) {
      const parts = url.hash.slice(1).split('?');
      const query = new URLSearchParams(parts.slice(1).join('?'));
      for (const key of [...query.keys()]) if (secretParam(key)) query.delete(key);
      url.hash = parts[0] + (query.size ? '?' + query.toString() : '');
    }
    return url.href;
  } catch { return String(value); }
}
export const cleanText = (value) => redactSecrets(String(value ?? ''))
  .replace(/(authorization\s*:\s*bearer\s+)[^\s,;]+/gi, '$1<redacted>')
  .replace(/(cookie\s*:\s*)[^\r\n]+/gi, '$1<redacted>')
  .replace(/\b(?:bearer\s+)?eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/gi, '<redacted-jwt>')
  .replace(/([?&](?:__gmitm|token|access_token|api[_-]?key|authorization|cookie|session|password)=)[^&\s"'\\]+/gi, '$1<redacted>')
  .replace(/https?:\/\/[^\s"'<>]+/gi, (url) => sanitizedUrl(url));
export function redactValue(value, key = '') {
  if (isSecretKey(key)) return '<redacted>';
  if (key === 'sha256' && typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value)) return value;
  if (MACHINE_KEY.test(key) && typeof value === 'number') return value;
  if (typeof value === 'string') return cleanText(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, item]) => [cleanText(name), redactValue(item, name)]));
  return value;
}
export async function fileHash(file) { return sha256(await readFile(file)); }
export function requestIdentity({ tool, report, target = null, db = null, url }) {
  return { tool: cleanText(String(tool || '').toLowerCase()), report: cleanText(String(report || '')), target: target ? cleanText(target) : null, db: db ? cleanText(String(db).toLowerCase()) : null, url: sanitizedUrl(url) };
}
function sameIdentity(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
export async function validReceipt(outDir, expectedRequest, acceptBounded = false) {
  try {
    const receipt = JSON.parse(await readFile(path.join(outDir, 'receipt.json'), 'utf8'));
    if (receipt.bundleComplete !== true || !sameIdentity(receipt.request, expectedRequest)) return false;
    for (const name of ARTIFACTS) {
      const file = path.join(outDir, name);
      if (!receipt.artifacts?.[name]?.sha256 || !existsSync(file) || await fileHash(file) !== receipt.artifacts[name].sha256) return false;
    }
    const sources = ['dom', 'ax', 'parsed', 'network', 'html'];
    const usable = ['captured', 'no_data'].includes(receipt.captureStatus) && sources.every((name) => receipt.sources?.[name] === 'available');
    const complete = ['complete', 'not_applicable'].includes(receipt.dataCompleteness?.status);
    return usable && ((receipt.resumeEligible === true && complete) || (acceptBounded && receipt.dataCompleteness?.status === 'bounded'));
  } catch { return false; }
}
function originFor(tool) {
  return new URL(tool === 'semrush' ? (process.env.TOOLS_SHARE_APP_ORIGIN_SEMRUSH || (process.env.TOOLS_SHARE_DOMAIN ? `https://sem.${process.env.TOOLS_SHARE_DOMAIN}` : '')) : (process.env.TOOLS_SHARE_APP_ORIGIN || (process.env.TOOLS_SHARE_DOMAIN ? `https://sim.${process.env.TOOLS_SHARE_DOMAIN}` : ''))).origin;
}
function normalizeDomain(value) {
  const input = String(value || '');
  const domain = (input.includes('://') ? new URL(input).hostname : input.split('/')[0]).trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain)) throw new Error('Invalid domain: ' + value);
  return domain;
}
function sameOrigin(url, origin) { try { return new URL(url).origin === origin; } catch { return false; } }
function targetRendered(url, text, target) {
  if (!target) return true;
  try {
    const p = new URL(url).searchParams;
    if ([p.get('q'), p.get('key')].filter(Boolean).some((value) => value.trim().toLowerCase() === target.toLowerCase())) return true;
  } catch {}
  return String(text || '').toLowerCase().includes(target.toLowerCase());
}
async function stateArtifact(session, source) {
  try {
    const result = await opencli(['browser', session, 'state', '--source', source], { timeoutMs: 90_000 });
    return { status: 'available', source, payload: parseOpenCliPayload(result.stdout, true) };
  } catch (error) { return { status: 'unavailable', source, error: cleanText(error?.message || error) }; }
}
async function evalArtifact(evalPage, expression, fallback) {
  try { return redactValue(await evalPage(expression)); } catch (error) { return { status: 'unavailable', error: cleanText(error?.message || error), fallback }; }
}
async function htmlArtifact(evalPage) {
  try {
    const meta = await evalPage('(()=>{const r=document.documentElement.cloneNode(true);r.querySelectorAll(\"script\").forEach(n=>n.remove());r.querySelectorAll(\"input,textarea,select\").forEach(n=>{n.removeAttribute(\"value\");n.textContent=\"\"});r.querySelectorAll(\"*\").forEach(n=>[...n.attributes].forEach(a=>{const k=a.name.toLowerCase().replace(/[^a-z0-9]/g,\"\");if(/^(value|srcset)$/i.test(a.name)||/session|token|secret|password|passwd|pwd|cookie|authorization|credential|apikey|privatekey/.test(k)||/(jwt|signature|sig)$/.test(k)||/email/i.test(a.name))n.removeAttribute(a.name);else if(/^(href|src)$/i.test(a.name)&&/[?&](token|session|__gmitm|key)=/i.test(a.value))n.setAttribute(a.name,a.value.split(\"?\")[0])}));window.__toolsShareEvidenceHtmlBytes=new TextEncoder().encode(r.outerHTML);return JSON.stringify({bytes:window.__toolsShareEvidenceHtmlBytes.length})})()');
    const chunks = [];
    for (let offset = 0; offset < meta.bytes; offset += 32 * 1024) {
      const encoded = await evalPage('(()=>{const a=window.__toolsShareEvidenceHtmlBytes.slice(' + offset + ',' + (offset + 32 * 1024) + ');let s=\"\";for(let i=0;i<a.length;i+=8192)s+=String.fromCharCode(...a.subarray(i,i+8192));return JSON.stringify({data:btoa(s)})})()');
      chunks.push(Buffer.from(encoded.data, 'base64'));
    }
    return { status: 'available', bytes: meta.bytes, html: cleanText(Buffer.concat(chunks).toString('utf8')) };
  } catch (error) { return { status: 'unavailable', error: cleanText(error?.message || error) }; }
}
export function parseOpenCliPayload(stdout, allowPlainText = false) {
  const raw = String(stdout || '');
  const lines = raw.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length > 1) {
    try {
      const entries = lines.map((line) => redactValue(JSON.parse(line)));
      return { format: 'jsonl', entries, stdout: entries.map((entry) => JSON.stringify(entry)).join('\n') };
    } catch {}
  }
  try {
    const entries = [redactValue(firstJson(raw))];
    return { format: 'embedded-json', entries, stdout: JSON.stringify(entries[0]) };
  } catch {
    if (allowPlainText) return { format: 'plain-text', text: cleanText(raw) };
    throw new Error('OpenCLI returned no parseable JSON or JSONL payload.');
  }
}
async function networkArtifact(session) {
  try {
    const result = await opencli(['browser', session, 'network'], { timeoutMs: 90_000 });
    return { status: 'available', mode: 'shape-preview', fullBodies: false, payload: parseOpenCliPayload(result.stdout) };
  } catch (error) { return { status: 'unavailable', mode: 'shape-preview', fullBodies: false, error: cleanText(error?.message || error) }; }
}
async function scrollToEnd(evalPage, maxScrolls) {
  const expression = '(async()=>{const z=m=>new Promise(r=>setTimeout(r,m)),v=[...document.querySelectorAll(\"div\")].filter(n=>n.clientHeight>40&&/auto|scroll/.test(getComputedStyle(n).overflowY)),a=[document.scrollingElement,...v].filter(n=>n&&n.scrollHeight>n.clientHeight+40).filter((n,i,x)=>x.indexOf(n)===i),s=a.map(n=>({n,p:-1,stable:0}));let k=0;for(;k<' + Math.max(1, maxScrolls) + ';k++){s.forEach(x=>x.n.scrollTop=x.n.scrollHeight);await z(300);s.forEach(x=>{const h=x.n.scrollHeight;x.stable=h===x.p?x.stable+1:0;x.p=h});if(s.every(x=>x.stable>=2))break}const c=s.map(x=>{const n=x.n,h=n.scrollHeight,b=n.scrollTop+n.clientHeight>=h-2,r={name:n===document.scrollingElement?\"document\":n.tagName.toLowerCase()+(n.id?\"#\"+n.id:\"\"),scrolls:k,scrollHeight:h,clientHeight:n.clientHeight,atBottom:b,stable:x.stable>=2,status:x.stable>=2&&b?\"complete\":\"bounded\",maxScrolls:' + Math.max(1, maxScrolls) + '};n.scrollTop=0;return r});return JSON.stringify({status:c.every(x=>x.status===\"complete\")?\"complete\":\"bounded\",containers:c})})()';
  return redactValue(await evalPage(expression));
}
async function stablePage(evalPage, spec, target, origin, options) {
  for (let attempt = 0; attempt <= options.reloads; attempt += 1) {
    const settled = await captureStable({
      read: () => evalPage('(()=>{const text=document.body?.innerText||\"\";return JSON.stringify({url:location.href,title:document.title,text,blank:!text.trim(),transient:' + TRANSIENT.toString() + '.test(text)})})()'),
      abortIf: (capture) => capture?.blank || capture?.transient,
      fingerprint: (capture) => {
        const text = String(capture?.text || '');
        if (!text || !sameOrigin(capture?.url, origin) || !targetRendered(capture.url, text, target)) return null;
        if (spec?.ready && !spec.ready.test(text) && !NO_DATA.test(text)) return null;
        return cleanText(text).replace(/\s+/g, ' ').trim();
      },
      needed: (print) => NO_DATA.test(print) ? 3 : 2, timeoutMs: options.timeoutMs, intervalMs: options.intervalMs,
    });
    if (settled.stable) return { ...settled, reloads: attempt };
    if (!settled.aborted || attempt === options.reloads) break;
    await evalPage('(()=>{location.reload();return JSON.stringify({reloaded:true})})()');
    await sleep(4000);
  }
  throw new Error('Report never reached a stable, nonblank rendered state; this is unavailable, not no-data. target=' + (target || 'none') + ' origin=' + origin);
}
function customUrl(tool, flags) {
  const origin = originFor(tool);
  if (flags.url) {
    const supplied = new URL(String(flags.url));
    if (supplied.origin !== origin) throw new Error('--url must stay on the selected tool origin.');
    return supplied.href;
  }
  if (flags.path) {
    const supplied = String(flags.path);
    if ((!supplied.startsWith('/') && !supplied.startsWith('#/')) || supplied.includes('://') || supplied.startsWith('//')) throw new Error('--path must be an absolute path or hash path on the selected tool origin.');
    return origin + (supplied.startsWith('/') ? supplied : '/' + supplied);
  }
  return null;
}
function dataCompleteness(kind, text, scroll, status) {
  if (status === 'no_data') return { status: 'not_applicable', reason: 'explicit no-data after three reads' };
  if (kind === 'scalar' || kind === 'navigation') return { status: 'not_applicable', reason: kind + ' page' };
  if (scroll.status !== 'complete') return { status: 'bounded', reason: 'a scroll container hit its cap' };
  const m = String(text || '').match(/(?:所有页面|All Pages|自然搜索排名|Organic Search Positions)\s*:?\s*\n?\s*([\d,]+)/i);
  const total = m ? Number(m[1].replace(/,/g, '')) : null;
  const rows = String(text || '').split(/\n+/).filter((line) => /^https?:\/\//i.test(line.trim())).length;
  if (total !== null && total > rows) return { status: 'bounded', reason: 'self-reported total exceeds rendered rows', selfReportedTotal: total, visibleRecordLines: rows };
  return { status: 'unknown', reason: 'virtualized table coverage is not proven', selfReportedTotal: total, visibleRecordLines: rows };
}
async function writeArtifact(outDir, name, value) {
  const safe = Buffer.isBuffer(value) ? value : redactValue(value);
  const bytes = Buffer.isBuffer(safe) ? safe : Buffer.from(typeof safe === 'string' ? safe : JSON.stringify(safe, null, 2) + '\n');
  await writeFile(path.join(outDir, name), bytes);
  return { sha256: sha256(bytes), bytes: bytes.length };
}
async function writeReceipt(outDir, receipt) { await writeFile(path.join(outDir, 'receipt.json'), JSON.stringify(redactValue(receipt), null, 2) + '\n'); }
export function lockKeys(session, tool) { return ['opencli-session-' + session, tool]; }
export async function selfTest() {
  const { mkdtemp, rm } = await import('node:fs/promises');
  const temporary = await mkdtemp(path.join(process.env.TMPDIR || '/tmp', 'tools-share-evidence-test-'));
  try {
    const request = requestIdentity({ tool: 'semrush', report: 'organic-pages', target: 'example.com', db: 'us', url: 'https://sem.proxy.example.com/analytics/?q=example.com&__gmitm=secret' });
    for (const name of ARTIFACTS) await writeArtifact(temporary, name, name);
    const artifacts = Object.fromEntries(await Promise.all(ARTIFACTS.map(async (name) => [name, { sha256: await fileHash(path.join(temporary, name)) }])));
    await writeReceipt(temporary, { bundleComplete: true, resumeEligible: true, request, artifacts, captureStatus: 'captured', sources: { dom: 'available', ax: 'available', parsed: 'available', network: 'available', html: 'available' }, dataCompleteness: { status: 'not_applicable' } });
    if (!(await validReceipt(temporary, request))) throw new Error('matching receipt should resume');
    if (await validReceipt(temporary, { ...request, target: 'other.example' })) throw new Error('different domain resumed');
    if (await validReceipt(temporary, { ...request, url: 'https://sem.proxy.example.com/other' })) throw new Error('different URL resumed');
    await writeFile(path.join(temporary, 'page.txt'), 'changed');
    if (await validReceipt(temporary, request)) throw new Error('hash mismatch resumed');
    console.log('tools-share-evidence self-test: PASS');
  } finally { await rm(temporary, { recursive: true, force: true }); }
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);
  if (flags['self-test']) return selfTest();
  const tool = String(flags.tool || '').toLowerCase();
  if (!REPORTS[tool]) throw new Error('--tool must be semrush or similarweb.');
  const report = String(flags.report || 'custom');
  const spec = REPORTS[tool]?.[report];
  const override = customUrl(tool, flags);
  if (!spec && !override) throw new Error('--report must be supported unless --url or --path is supplied.');
  const target = spec?.needs === 'keyword' ? String(flags.keyword || '').trim() : (flags.domain ? normalizeDomain(flags.domain) : '');
  if (spec && !target) throw new Error('--' + spec.needs + ' is required.');
  const db = tool === 'semrush' ? String(flags.db || 'us').toLowerCase() : null;
  const kind = spec?.kind || String(flags['page-kind'] || '');
  if (!['scalar', 'table', 'navigation'].includes(kind)) throw new Error('Custom --url/--path requires --page-kind scalar, table, or navigation.');
  const origin = originFor(tool);
  const url = override || origin + spec.path(target, db);
  const request = requestIdentity({ tool, report, target: target || null, db, url });
  if (!flags['out-dir']) throw new Error('--out-dir is required.');
  const outDir = path.resolve(String(flags['out-dir']));
  const acceptBounded = Boolean(flags['accept-bounded']);
  if (flags.resume && await validReceipt(outDir, request, acceptBounded)) return printJson({ status: acceptBounded ? 'resumed-with-accept-bounded' : 'resumed', outDir, request, acceptBounded });
  await mkdir(outDir, { recursive: true });
  // 配额站：会话名归站点。取证脚本在启动之后还会直接对 session 发 state/network/screenshot，
  // 所以这里必须算出和 launchTool 内部一致的那个名字，不能只靠 launchTool 兜底。
  const session = resolveSession(flags, 'evidence-' + tool, tool);
  let launched;
  let receipt;
  try {
    launched = await launchTool({ session, tool, node: flags.node, window: 'dedicated', wait: Number(flags.wait || 7), timeout: Number(flags['launch-timeout'] || 60), evalTimeoutMs: Number(flags['eval-timeout'] || 180) * 1000, allowParallelSession: Boolean(flags['allow-parallel-session']) });
    await gotoInTool(launched.evalPage, url, Number(flags.settle || 10));
    const options = { reloads: Math.max(0, Number(flags.reloads || 2)), timeoutMs: Number(flags.timeout || 120) * 1000, intervalMs: Number(flags['stable-interval'] || 3) * 1000 };
    const settled = await stablePage(launched.evalPage, spec, target, origin, options);
    const scroll = await scrollToEnd(launched.evalPage, Number(flags['max-scrolls'] || 60));
    const afterScroll = await stablePage(launched.evalPage, spec, target, origin, { ...options, reloads: 0 });
    const captured = afterScroll.capture;
    const noData = Boolean(spec) && NO_DATA.test(captured.text) && !(spec.hasData?.test(captured.text));
    const dom = await stateArtifact(session, 'dom');
    const ax = await stateArtifact(session, 'ax');
    const appJson = await evalArtifact(launched.evalPage, '(()=>{const e=[...document.querySelectorAll(\"script[type=\\\"application/json\\\"]\")].map((n,i)=>{try{return {index:i,id:n.id||null,value:JSON.parse(n.textContent||\"\")}}catch{return {index:i,id:n.id||null,unavailable:\"invalid JSON\"}}});return JSON.stringify(e.length?{status:\"available\",entries:e}:{status:\"unavailable\",reason:\"no application/json script\"})})()', 'app-json');
    const parsed = await evalArtifact(launched.evalPage, '(()=>{const t=n=>(n.innerText||n.textContent||\"\").replace(/\\s+/g,\" \").trim().slice(0,500),c=s=>[...document.querySelectorAll(s)].map(n=>({text:t(n),ariaLabel:n.getAttribute(\"aria-label\"),name:n.getAttribute(\"name\"),type:n.getAttribute(\"type\"),placeholder:n.getAttribute(\"placeholder\")}));return JSON.stringify({status:\"available\",headings:[...document.querySelectorAll(\"h1,h2,h3,h4,h5,h6\")].map(n=>({level:n.tagName.toLowerCase(),text:t(n)})),links:[...document.querySelectorAll(\"a[href]\")].map(n=>({text:t(n),href:n.href.split(\"?\")[0]})),buttons:c(\"button,[role=button]\"),inputs:c(\"input,textarea,select\"),tables:[...document.querySelectorAll(\"table\")].map(n=>({headers:[...n.querySelectorAll(\"th\")].map(t),visibleRows:n.querySelectorAll(\"tbody tr\").length})),permissionSignals:[...new Set(((document.body?.innerText||\"\").match(/upgrade|trial|permission|权限|升级|订阅|登录|login/gi)||[]).map(x=>x.toLowerCase()))]})})()', 'parsed-page');
    const html = await htmlArtifact(launched.evalPage);
    const network = await networkArtifact(session);
    const artifacts = {};
    artifacts['page.txt'] = await writeArtifact(outDir, 'page.txt', captured.text);
    artifacts['page.html'] = await writeArtifact(outDir, 'page.html', html.status === 'available' ? html.html : html);
    artifacts['page.dom.json'] = await writeArtifact(outDir, 'page.dom.json', dom);
    artifacts['page.ax.json'] = await writeArtifact(outDir, 'page.ax.json', ax);
    artifacts['page.parsed.json'] = await writeArtifact(outDir, 'page.parsed.json', parsed);
    artifacts['page.app-json.json'] = await writeArtifact(outDir, 'page.app-json.json', appJson);
    artifacts['page.network.json'] = await writeArtifact(outDir, 'page.network.json', network);
    await opencli(['browser', session, 'screenshot', '--full-page', path.join(outDir, 'full.png')], { timeoutMs: 90_000 });
    artifacts['full.png'] = { sha256: await fileHash(path.join(outDir, 'full.png')), bytes: (await readFile(path.join(outDir, 'full.png'))).length };
    const sources = { dom: dom.status, ax: ax.status, parsed: parsed.status, network: network.status, html: html.status };
    const status = noData ? 'no_data' : (Object.values(sources).some((item) => item !== 'available') ? 'partial' : 'captured');
    const completeness = dataCompleteness(kind, captured.text, scroll, status);
    const resumeEligible = ['captured', 'no_data'].includes(status) && Object.values(sources).every((item) => item === 'available') && ['complete', 'not_applicable'].includes(completeness.status);
    receipt = { schemaVersion: 2, bundleComplete: true, resumeEligible, resumePolicy: { boundedRequiresAcceptFlag: completeness.status === 'bounded' }, request, retrievedAt: new Date().toISOString(), title: cleanText(captured.title), captureStatus: status, sources, htmlCapture: { status: html.status, bytes: html.bytes || null, byteLimit: html.byteLimit || null }, noData: { detected: noData, confirmationReads: noData ? afterScroll.reads : 0, requiredReads: noData ? 3 : 0 }, dataCompleteness: completeness, sessionReused: Boolean(launched.reused), reads: settled.reads + afterScroll.reads, reloads: settled.reloads + afterScroll.reloads, scroll, screenshot: { file: 'full.png', scope: 'full-page', maskPolicy: 'none', maskedCount: 0 }, network: { source: 'opencli browser <session> network', boundary: 'shape preview only; raw bodies were not requested', rawRequested: false }, artifacts };
  } catch (error) {
    receipt = { schemaVersion: 2, bundleComplete: false, resumeEligible: false, request, retrievedAt: new Date().toISOString(), captureStatus: 'unavailable', dataCompleteness: { status: 'unknown', reason: 'capture failed before completeness could be assessed' }, error: { code: 'capture_failed', message: cleanText(error?.message || error) } };
  } finally {
    await writeReceipt(outDir, receipt);
    await launched?.releaseBrowserLocks();
  }
  printJson(receipt);
  if (!receipt.bundleComplete) process.exitCode = 1;
}
const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main().catch((error) => { console.error(cleanText(error?.message || error)); process.exitCode = 1; });
