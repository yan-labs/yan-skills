#!/usr/bin/env node
// 用途：在商户后台 Developer → Webhook 页列出现有端点，并用「添加端点」对话框新增一个；默认只读（只列出），--commit 才提交。
// 参数：--url <endpoint> [--name n] [--events all|标签列表] [--env stg|prod] [--session anyway-dashboard] [--commit] [--no-submit]。--no-submit 配合 --commit：填完对话框但不提交。
// 登录态：OpenCLI 已连接用户浏览器，且对应环境的商户后台已登录。
// 已知坑：Merchant API 无端点读取接口；UI 不展示 signing secret。验证日期：2026-09-07（原流程）。
// 2026-10-02 后台改版：「配置 Webhook 端点」不再直接弹对话框，而是跳 /developer?tab=webhooks，页面里有端点表格和「添加端点」按钮，
// 对话框本身（名称 / 端点 URL / 事件）未变。脚本改为直达该页、先读现有端点（同 URL 已存在则跳过，不重复创建、不改动任何已有端点）。
// 登录态过期时 /developer 会跳 /login，脚本以退出码 3 提示需要人工登录。新会话首次 open 会报 Navigation rejected，同会话重试即可。

import { execFileSync } from 'node:child_process';

function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    if (eq !== -1) {
      flags[tok.slice(2, eq)] = tok.slice(eq + 1);
    } else {
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[tok.slice(2)] = next;
        i++;
      } else {
        flags[tok.slice(2)] = true;
      }
    }
  }
  return flags;
}

const flags = parseFlags(process.argv.slice(2));

const URL = flags.url;
const NAME = flags.name || '';
const EVENTS = flags.events || 'all'; // 'all' or comma-separated Chinese labels
const SESSION = flags.session || 'anyway-dashboard';
const COMMIT = !!flags.commit;
const NO_SUBMIT = !!flags['no-submit'];
const ENV = flags.env || process.env.ANYWAY_ENV || 'stg';
if (!['stg', 'prod'].includes(ENV)) throw new Error('expected --env stg|prod');
const DASHBOARD_BASE = ENV === 'stg' ? 'https://stg.anyway.sh' : 'https://app.anyway.sh';

const KNOWN_EVENTS = [
  '订单待处理',
  '订单已付款',
  '订单失败',
  '订阅已创建',
  '订阅已更新',
  '订阅已过期',
  '订阅已结束',
  '退款成功', // seen in the stg dashboard 2026-11-28 (refund.succeeded)
];

function log(...args) {
  console.error(...args);
}

function runOpencliBrowser(args, { allowFail = false } = {}) {
  try {
    const out = execFileSync('opencli', ['browser', SESSION, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const trimmed = out.trim();
    try {
      const parsed = JSON.parse(trimmed);
      // opencli 2.x wraps results as {ok, data}; unwrap so callers keep reading flat fields
      if (parsed && typeof parsed === 'object' && 'ok' in parsed && 'data' in parsed) {
        if (parsed.data !== null && typeof parsed.data === 'object') return parsed.data;
        const text = String(parsed.data ?? '');
        if (/^\s*[{[]/.test(text)) { try { return JSON.parse(text); } catch {} } // eval of JSON.stringify(...)
        return { raw: text };
      }
      return parsed;
    } catch {
      return { raw: trimmed };
    }
  } catch (err) {
    if (allowFail) return { error: true, raw: String(err.stdout || err.message) };
    throw err;
  }
}

function checkDoctor() {
  try {
    const out = execFileSync('opencli', ['doctor'], { encoding: 'utf8' });
    if (!(/\[OK\] Daemon/.test(out) && /\[OK\] Extension/.test(out)) && !/"daemonRunning":\s*true[\s\S]*"extensionConnected":\s*true/.test(out)) {
      throw new Error('opencli doctor did not report both Daemon and Extension OK:\n' + out);
    }
    log('[doctor] OpenCLI bridge OK');
  } catch (err) {
    console.error('opencli doctor failed — fix the browser bridge before retrying.');
    console.error(String(err.stdout || err.message || err));
    process.exit(1);
  }
}

function currentUrl() {
  const r = runOpencliBrowser(['get', 'url'], { allowFail: true });
  return String(r.raw || r.url || '').trim();
}

async function openPage(url) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      runOpencliBrowser(['open', url]);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      log(`[warn] open attempt ${attempt + 1} failed; retrying on the same session`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (lastErr) throw lastErr;
  for (let i = 0; i < 12; i++) {
    const u = currentUrl();
    if (/\/login/.test(u)) {
      const e = new Error(`LOGIN_REQUIRED: ${DASHBOARD_BASE} redirected to ${u}. The ${ENV} dashboard is signed out in the OpenCLI Chrome profile; sign in there once (Google) and rerun.`);
      e.exitCode = 3;
      throw e;
    }
    const probe = runOpencliBrowser(['find', '--role', 'button', '--name', '添加端点'], { allowFail: true });
    if (!probe.error && probe.matches_n >= 1) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Webhook page did not render at ${currentUrl()} (no 添加端点 button after 6s); the dashboard layout may have changed.`);
}

// Read the endpoint table as rows of cell texts (name, URL, events, status, created, actions).
async function readEndpoints() {
  const js = `JSON.stringify([...document.querySelectorAll('table tbody tr')].map((tr) => [...tr.cells].map((c) => c.innerText.replace(/\\s+/g, ' ').trim())))`;
  const res = runOpencliBrowser(['eval', js], { allowFail: true });
  let rows = Array.isArray(res) ? res : [];
  if (!rows.length && typeof res.raw === 'string') {
    try { rows = JSON.parse(res.raw); } catch { rows = []; }
  }
  return (Array.isArray(rows) ? rows : []).map((cells) => ({ cells }));
}

async function main() {
  if (!URL) {
    console.error('Usage: create-webhook.mjs --url <endpoint-url> [--name n] [--events all|"a,b"] [--env stg|prod] [--commit]');
    process.exit(1);
  }

  let selectedEvents = null;
  if (EVENTS !== 'all') {
    selectedEvents = EVENTS.split(',').map((s) => s.trim()).filter(Boolean);
    const unknown = selectedEvents.filter((e) => !KNOWN_EVENTS.includes(e));
    if (unknown.length) {
      console.error(`[error] unknown event(s): ${unknown.join(', ')}`);
      console.error(`Known events: ${KNOWN_EVENTS.join(', ')}`);
      process.exit(1);
    }
  }

  checkDoctor();

  const pageUrl = `${DASHBOARD_BASE}/developer?tab=webhooks`;
  log(`[browser] env="${ENV}" session="${SESSION}" opening ${pageUrl}`);
  await openPage(pageUrl);

  let endpoints = await readEndpoints();
  log(`[endpoints] ${endpoints.length} existing endpoint(s):`);
  for (const e of endpoints) log(`  - ${e.cells.slice(0, 5).join(' | ')}`);

  if (!COMMIT) {
    log('[dry-run] listed only; pass --commit to add the endpoint.');
    return;
  }

  const existing = endpoints.find((e) => e.cells.some((c) => c === URL));
  if (existing) {
    log(`[skip] an endpoint with URL ${URL} already exists (${existing.cells.slice(0, 4).join(' | ')}). Not creating again.`);
    return;
  }

  log('[browser] opening "添加端点" dialog...');
  runOpencliBrowser(['click', '--role', 'button', '--name', '添加端点']);
  await new Promise((r) => setTimeout(r, 800));

  log(`[survey] known events: ${KNOWN_EVENTS.join(', ')}`);
  log(`[commit] filling name="${NAME}" url="${URL}" events=${EVENTS}`);

  if (NAME) {
    runOpencliBrowser(['fill', 'input[placeholder="例如生产服务器"]', NAME]);
  }
  runOpencliBrowser(['fill', 'input[placeholder="https://api.example.com/webhooks/anyway"]', URL]);

  if (selectedEvents) {
    // Switch to "选择特定事件" (2nd radio in the 事件订阅 radiogroup), then
    // click each requested event button by its visible text.
    runOpencliBrowser(['click', '[role=radiogroup] button[role=radio]:nth-of-type(2)']);
    await new Promise((r) => setTimeout(r, 400));
    for (const label of selectedEvents) {
      runOpencliBrowser(['click', '--role', 'button', '--name', label]);
    }
  }
  // else: leave default "所有活动" (all events) selected.

  // Read the dialog back before submitting: wrong events cannot be undone from here.
  const dialogState = runOpencliBrowser(['eval', `JSON.stringify({name:document.querySelector('input[placeholder="例如生产服务器"]')?.value,url:document.querySelector('input[placeholder="https://api.example.com/webhooks/anyway"]')?.value,all:document.querySelector('[role=radiogroup] button[role=radio]')?.getAttribute('aria-checked'),pressed:[...document.querySelectorAll('button[aria-pressed=true]')].map((x)=>x.innerText.trim())})`]);
  log('[verify-dialog]', JSON.stringify(dialogState));
  if (dialogState.url !== URL || (NAME && dialogState.name !== NAME)) throw new Error('dialog name/url read-back does not match; not submitting.');
  if (selectedEvents) {
    const got = [...(dialogState.pressed || [])].sort().join(',');
    if (got !== [...selectedEvents].sort().join(',')) throw new Error(`dialog events read-back "${got}" != requested; not submitting.`);
  } else if (dialogState.all !== 'true') {
    throw new Error('expected 所有活动 to be selected; not submitting.');
  }

  if (NO_SUBMIT) {
    log('[no-submit] dialog filled, NOT submitted; closing it.');
    runOpencliBrowser(['keys', 'Escape']);
    return;
  }

  log('[commit] submitting "创建端点"...');
  runOpencliBrowser(['click', '--role', 'button', '--name', '创建端点']);
  await new Promise((r) => setTimeout(r, 2000));
  // Never read or print anything from a signing-secret reveal; just dismiss it if shown.
  runOpencliBrowser(['keys', 'Escape'], { allowFail: true });

  runOpencliBrowser(['open', pageUrl], { allowFail: true });
  await new Promise((r) => setTimeout(r, 1500));
  endpoints = await readEndpoints();
  const created = endpoints.find((e) => e.cells.some((c) => c === URL));
  log(`[verify] endpoints now (${endpoints.length}):`);
  for (const e of endpoints) log(`  - ${e.cells.slice(0, 5).join(' | ')}`);
  if (!created) throw new Error('endpoint was submitted but is not listed on the Webhook page; check the dialog for a validation error.');
  log(`[done] endpoint created: ${created.cells.slice(0, 4).join(' | ')}`);
}

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exitCode = err.exitCode || 1;
}).finally(() => {
  runOpencliBrowser(['close'], { allowFail: true });
});
