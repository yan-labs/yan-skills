#!/usr/bin/env node
// 用途：在测试后台通过 OpenCLI 完成测试卡结账，并用只读 Merchant API 复核订单。
// 参数：--link <支付链接> --ref <引用> --email <邮箱> [--env stg|prod] [--env-file <path>] [--meta k=v]
//       [--amount-cents <预期分>] [--currency <ISO币种>] [--session anyway-paytest] [--address-line1 <街道地址>] [--city <城市>]。
// 登录态：OpenCLI 已连接用户浏览器；目标商户后台已登录；复核需要该环境 API key。
// 已知坑：stg 用 Stripe 借记测试卡 4000056655665556（4242 信用卡在 Anyway 沙盒被拒，2026-10-20 确认），
// prod 的卡信息从进程环境变量读取；币种切换可能重建表单；必须用
// --window dedicated（非 background，后者在此结账页无法滚动，见下方 WINDOW_MODE 注释）；
// 美国账单地址的"地址"“城市”字段现为必填，留空会导致提交按钮点击后无任何反应。
// 验证日期：2026-09-29（stg，含完整 4 次重试循环、真实跳转）。原流程验证日期 2026-09-07。

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANYWAY_DIR = path.resolve(__dirname, '..', '..'); // shared Anyway tool
const ANYWAY_CLI = path.join(ANYWAY_DIR, 'anyway.mjs');
// ---------------------------------------------------------------------------
// arg parsing
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const flags = { meta: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (!tok.startsWith('--')) continue;
    const eq = tok.indexOf('=');
    let key;
    let inlineValue;
    if (eq !== -1) {
      key = tok.slice(2, eq);
      inlineValue = tok.slice(eq + 1);
    } else {
      key = tok.slice(2);
    }
    const next = argv[i + 1];
    const hasNext = inlineValue === undefined && next !== undefined && !next.startsWith('--');
    const value = inlineValue !== undefined ? inlineValue : hasNext ? next : true;
    if (inlineValue === undefined && hasNext) i++;

    if (key === 'meta') {
      if (value === true) throw new Error('--meta requires a key=value argument');
      flags.meta.push(String(value));
    } else {
      flags[key] = value;
    }
  }
  return flags;
}

const flags = parseArgs(process.argv.slice(2));
const ENV = flags.env || process.env.ANYWAY_ENV || 'stg';
const EVIDENCE_DIR = path.resolve(flags['evidence-dir'] || path.join(process.cwd(), '.rankup', 'evidence', 'anyway', ENV));


function log(...args) {
  console.error(...args);
}

if (!flags.link) {
  log('[fatal] --link is required (payment link URL or PL id, e.g. <payment-link-id>)');
  process.exit(1);
}
if (!flags.email) { log('[fatal] --email is required'); process.exit(1); }
if (!flags.ref) {
  log('[fatal] --ref is required (becomes the merchant_reference query param)');
  process.exit(1);
}

const SESSION = flags.session || 'anyway-paytest';
const TIMEOUT_S = Number(flags.timeout || 120);
if (!Number.isFinite(TIMEOUT_S) || TIMEOUT_S <= 0) throw new Error('--timeout must be a positive number');
const EMAIL = flags.email;
// Stripe debit test card: 4242 credit card is declined by Anyway sandbox (confirmed 2026-10-20).
const CARD_NUMBER = ENV === 'stg' ? '4000056655665556' : process.env.ANYWAY_CARD_NUMBER;
const CARD_EXPIRY = ENV === 'stg' ? futureExpiry() : process.env.ANYWAY_CARD_EXPIRY;
const CARD_CVC = ENV === 'stg' ? '123' : process.env.ANYWAY_CARD_CVC;
if (ENV === 'prod' && (!CARD_NUMBER || !CARD_EXPIRY || !CARD_CVC)) throw new Error('prod payment requires ANYWAY_CARD_NUMBER, ANYWAY_CARD_EXPIRY and ANYWAY_CARD_CVC environment variables');
const NAME = flags.name || 'Test Buyer';
const COUNTRY = flags.country || 'US';
const ADDRESS_LINE1 = flags['address-line1'] || '548 Market St';
const CITY = flags.city || 'San Francisco';
const POSTAL = flags.postal || '94103';
// Text of the currency-toggle button to click before filling the form — see
// the comment at the click site below for why this matters.
const CURRENCY_TEXT = flags['currency-text'] || 'US$';

// ---------------------------------------------------------------------------
// URL building
// ---------------------------------------------------------------------------

function buildPayUrl() {
  const raw = String(flags.link);
  const base = /^https?:\/\//i.test(raw) ? raw : `https://${ENV === 'stg' ? 'stg' : 'app'}.anyway.sh/pay/${raw}`;
  const u = new URL(base);
  u.searchParams.set('merchant_reference', String(flags.ref));
  for (const kv of flags.meta) {
    const eq = kv.indexOf('=');
    if (eq === -1) throw new Error(`--meta "${kv}" must be in key=value form`);
    u.searchParams.set(kv.slice(0, eq), kv.slice(eq + 1));
  }
  return u.toString();
}

// ---------------------------------------------------------------------------
// OpenCLI helpers
// ---------------------------------------------------------------------------

// Window mode: 'dedicated', not 'background'. Confirmed by live debugging
// (2026-09-29): on this checkout page, a `--window background` tab (hidden
// tab inside the user's current Chrome window) does not scroll at all —
// `window.scrollTo`/`scrollIntoView` silently no-op (scrollY stays pinned)
// and opencli's own CDP-level `scroll` command hangs for 115s and times out.
// A `--window dedicated` tab (its own automation window) scrolls normally
// and instantly. Since the submit button sits below the fold on this page's
// viewport (observed button top ~1006px vs. viewport height ~701px), a
// background tab can never make it hit-testable via elementFromPoint —
// that's the actual root cause of the "submit button ready=false" timeout
// seen in prior runs, not (only) a missing scrollIntoView call. Mixing modes
// (background for the main flow, dedicated-by-default for screenshot/close)
// also caused "automation window slots busy" failures when a screenshot was
// taken mid-run — using 'dedicated' consistently for every call avoids that
// too. Trade-off: this uses the single-capacity dedicated window pool and
// is visible, instead of running hidden in the background.
const WINDOW_MODE = 'dedicated';

function oc(args, { allowFail = false, timeoutMs = 45_000 } = {}) {
  try {
    const out = execFileSync('opencli', ['browser', SESSION, '--window', WINDOW_MODE, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return out.trim();
  } catch (err) {
    if (allowFail) return null;
    throw new Error(`opencli browser ${SESSION} failed`);
  }
}

// `fill`/`select` exit non-zero whenever their own `verified` check doesn't
// byte-match the typed text against the field's actual value — which is the
// EXPECTED outcome for Stripe's card-number/expiry inputs, since Stripe's
// input mask inserts spaces ("4242424242424242" -> "4242 4242 4242 4242",
// "1230" -> "12 / 30") as you type. That's correct masking behavior, not a
// failure, so this helper treats `filled`/`selected` truthy as success and
// ignores the exit code and `verified` field entirely.
function ocField(cmd, target, value) {
  try {
    const out = execFileSync('opencli', ['browser', SESSION, '--window', WINDOW_MODE, cmd, target, value], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 45_000,
    });
    const parsed = JSON.parse(out.trim());
    return { ok: Boolean(parsed.filled || parsed.selected) };
  } catch (err) {
    const text = err.stdout ? String(err.stdout) : '';
    try {
      const parsed = JSON.parse(text.trim());
      return { ok: Boolean(parsed.filled || parsed.selected) };
    } catch {
      return { ok: false };
    }
  }
}

function ocBatch(commands, { timeoutMs = 45_000 } = {}) {
  const out = execFileSync(
    'opencli',
    ['browser', SESSION, '--window', WINDOW_MODE, 'batch', '--commands', JSON.stringify(commands)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs },
  );
  return JSON.parse(out.trim());
}

function checkDoctor() {
  const out = execFileSync('opencli', ['doctor'], { encoding: 'utf8' });
  if (!/\[OK\] Daemon/.test(out) || !/\[OK\] Extension/.test(out)) {
    throw new Error(`opencli doctor did not report both Daemon and Extension OK:\n${out}`);
  }
  log('[doctor] OpenCLI bridge OK');
}

function screenshotEvidence(tag) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(EVIDENCE_DIR, `pay-test-${stamp}-${tag}.png`);
  try {
    execFileSync('opencli', ['browser', SESSION, '--window', WINDOW_MODE, 'screenshot', file], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
    log(`[evidence] screenshot saved: ${file}`);
  } catch (err) {
    log(`[evidence] screenshot failed: ${err.message}`);
  }
  return file;
}

function closeSession() {
  try {
    execFileSync('opencli', ['browser', SESSION, 'close'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20_000,
    });
  } catch {
    // best-effort; don't let cleanup failure mask the real result
  }
}

// ---------------------------------------------------------------------------
// Merchant API helpers
// ---------------------------------------------------------------------------

function runAnywayApi(args) {
  const out = execFileSync('node', [ANYWAY_CLI, '--env', ENV, ...(flags['env-file'] ? ['--env-file', flags['env-file']] : []), ...args, '--json'], {
    cwd: ANYWAY_DIR,
    encoding: 'utf8',
  });
  return JSON.parse(out);
}

// ---------------------------------------------------------------------------
// misc
// ---------------------------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// MM/YY string a few years out so the card never expires as this script ages.
function futureExpiry() {
  const year = new Date().getFullYear() + 4;
  return `12${String(year).slice(-2)}`;
}

// OpenCLI starts session-level network capture before `open`, preserving intermediate
// requests across navigations. Read URLs only; never log captured bodies or headers.
function observedOrderIds() {
  const urls = [oc(['get', 'url'], { allowFail: true })];
  try {
    const capture = JSON.parse(oc(['network', '--all'], { allowFail: true }));
    urls.push(...(capture?.entries || []).map((entry) => entry.url));
  } catch { /* API lookup remains available with older bridges. */ }
  try {
    const pageUrls = `JSON.stringify([
      location.href,
      ...performance.getEntriesByType('navigation').map(e => e.name),
      ...performance.getEntriesByType('resource').map(e => e.name),
      ...Array.from(document.querySelectorAll('[href],[action],input[name="anyway_order_id"],[data-anyway-order-id]'),
        e => e.href || e.action || ('?anyway_order_id=' + encodeURIComponent(e.value || e.dataset.anywayOrderId || '')))
    ])`;
    urls.push(...JSON.parse(oc(['eval', pageUrls], { allowFail: true })));
  } catch { /* A redirect may temporarily destroy the execution context. */ }
  const ids = new Set();
  for (const url of urls) {
    try {
      const id = new URL(url, 'https://checkout.invalid').searchParams.get('anyway_order_id');
      if (id) ids.add(id);
    } catch { /* Not a URL. */ }
  }
  return [...ids];
}

function expectedPayment(payUrl) {
  let amountCents = flags['amount-cents'] === undefined ? null : Number(flags['amount-cents']);
  let currency = flags.currency && String(flags.currency).toUpperCase();
  const linkId = new URL(payUrl).pathname.split('/').filter(Boolean).at(-1);
  if (amountCents === null || !currency) {
    const products = runAnywayApi(['products', 'list', '--all']);
    let link;
    for (const product of products.records || []) {
      const links = runAnywayApi(['products', 'links', product.productId || product.id]);
      link = (Array.isArray(links) ? links : links.records || links.paymentLinks || []).find(l => l.linkId === linkId);
      if (link) break;
    }
    if (!link) throw new Error('Cannot resolve payment link price; supply --amount-cents and --currency before paying.');
    amountCents ??= Math.round(Number(link.amount) * 100);
    currency ||= String(link.currency || '').toUpperCase();
  }
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || !/^[A-Z]{3}$/.test(currency)) {
    throw new Error('Expected payment requires positive integer --amount-cents and ISO --currency.');
  }
  return { amountCents, currency, linkId };
}

function matchesOrder(order, expected, startedAt, until) {
  const created = Date.parse(order.createdAt);
  return order.merchantReference === String(flags.ref) &&
    created >= startedAt && created <= until &&
    order.amountCents === expected.amountCents && order.currency === expected.currency &&
    (!order.paymentLinkId || order.paymentLinkId === expected.linkId);
}

async function resolvePaidOrder(expected, startedAt) {
  const redirectDeadline = Date.now() + TIMEOUT_S * 1000;
  // The timeout changes observation to API-only; it must never return to checkout.
  const deadline = redirectDeadline + 60_000;
  const ids = new Set();
  let lastStatus = 'no matching order';
  let apiFailed = false;
  do {
    if (Date.now() <= redirectDeadline) {
      for (const id of observedOrderIds()) ids.add(id);
    }
    const until = Date.now();
    try {
      const orders = [];
      for (const id of ids) {
        try { orders.push(runAnywayApi(['orders', 'get', id])); }
        catch { /* A stale captured ID must not block reference lookup. */ }
      }
      let matches = orders.filter(order => matchesOrder(order, expected, startedAt, until));
      if (!matches.some(order => order.status === 'PAID')) {
        const listed = runAnywayApi(['orders', 'list', '--merchant-ref', String(flags.ref),
          '--from', new Date(startedAt).toISOString(), '--to', new Date(until).toISOString(), '--all']);
        matches = (listed.records || []).filter(order => matchesOrder(order, expected, startedAt, until));
      }
      const paid = matches.filter(order => order.status === 'PAID');
      if (paid.length > 1) throw new Error('Ambiguous payment: multiple matching PAID orders; refusing to choose.');
      if (paid.length === 1) {
        // List results are candidates: independently read the full order before success.
        const order = runAnywayApi(['orders', 'get', paid[0].orderId]);
        if (!matchesOrder(order, expected, startedAt, Date.now()) || order.status !== 'PAID') {
          throw new Error('Order changed during final verification.');
        }
        log(ids.has(order.orderId) ? '[verify] captured return order is PAID' : '[verify] payment PAID; return URL parameter absent, recovered via Merchant API');
        return order;
      }
      lastStatus = matches.length ? matches.map(o => o.status).join(', ') : 'no matching reference/time/amount/currency';
    } catch (err) {
      if (/Ambiguous payment|Order changed/.test(err.message)) throw err;
      apiFailed = true;
      log('[verify] Merchant API unavailable; retrying read-only lookup');
    }
    await sleep(3000);
  } while (Date.now() < deadline);
  throw new Error(`Payment not verified PAID (last: ${lastStatus}${apiFailed ? '; API lookup failed during observation' : ''}). No payment resubmitted.`);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const payUrl = buildPayUrl();
  const expected = expectedPayment(payUrl);
  const startedAt = Date.now();
  checkDoctor();
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  log(`[open] session="${SESSION}" payment link opened`);

  // Default opencli nav timeout (15s) is sometimes too tight for a fresh
  // dedicated window: window creation + the anyway.sh -> Stripe hosted
  // checkout redirect chain can exceed it, especially right after a prior
  // session released the pool's single dedicated-window slot. 30s avoids a
  // spurious timeout on an otherwise-fine load.
  //
  // `open`'s own success/failure signal is unreliable for this multi-hop
  // redirect (anyway.sh -> buy.stripe.com): opencli sometimes reports
  // "Navigation rejected" for the intermediate anyway.sh navigation getting
  // superseded by the Stripe redirect, even though the tab lands on a fully
  // loaded, correct Stripe Checkout page (confirmed 2026-09-29 by manually
  // reproducing the "rejected" error, then reading the resulting page state:
  // right product, right price, real form fields, not stuck or errored). So
  // `open` failing here is NOT treated as fatal by itself on its own — the
  // real, reliable signal of whether the checkout form actually loaded is
  // the `wait selector #email` right after it.
  //
  // Separately, this machine's automation windows are a single-capacity
  // shared pool (`opencli browser window list` -> `Pool: capacity=1`): an
  // unrelated concurrent task holding that one dedicated-window slot can
  // make `open` fail hard (session never gets created at all, not just a
  // spurious "rejected") until that other task releases it (observed
  // 2026-09-29: a concurrent `fa-anyway-e2e` session held the slot). So the
  // whole open-then-wait-for-#email sequence is retried a few times with a
  // growing pause, rather than failing on the first attempt.
  const OPEN_ATTEMPTS = 3;
  let emailAppeared = null;
  let lastOpenErrorDetail = null;
  for (let attempt = 1; attempt <= OPEN_ATTEMPTS && !emailAppeared; attempt += 1) {
    if (attempt > 1) {
      const backoffS = 10 * (attempt - 1);
      log(`[open] retry ${attempt}/${OPEN_ATTEMPTS} after ${backoffS}s (previous attempt did not reach a checkout form — likely transient: shared dedicated-window pool busy, or a redirect-context race)`);
      oc(['wait', 'time', String(backoffS)], { allowFail: true });
    }
    // Not routed through `oc()`'s allowFail path here specifically, so the
    // real opencli error text survives for the final error message below if
    // every attempt ultimately fails — `oc(..., {allowFail:true})` discards
    // it, which made a genuine permanent failure (bad link, real outage)
    // just as opaque as the transient false-negative case this retry exists
    // to route around.
    try {
      execFileSync('opencli', ['browser', SESSION, '--window', WINDOW_MODE, 'open', payUrl, '--timeout', '30000'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 45_000,
      });
      lastOpenErrorDetail = null;
    } catch (err) {
      lastOpenErrorDetail = String(err.stderr || err.stdout || err.message || err).trim();
      log(`[open] opencli reported a navigation error (often a false negative on this redirect chain) — continuing to verify via #email instead of failing immediately: ${lastOpenErrorDetail}`);
    }
    // Give the Anyway -> Stripe redirect and Stripe Checkout's client bundle
    // a moment to settle before waiting on specific fields. Uses opencli's
    // own `wait time` (no page-context JS) rather than an `eval` sleep:
    // right after a multi-hop redirect the old execution context can still
    // be mid-teardown, and an `eval` landing in that window throws.
    oc(['wait', 'time', '2.5'], { allowFail: true });
    emailAppeared = oc(['wait', 'selector', '#email', '--timeout', '20000'], { allowFail: true });
  }
  if (emailAppeared === null) {
    screenshotEvidence('checkout-form-not-found');
    throw new Error(
      `Stripe Checkout email field (#email) did not appear after ${OPEN_ATTEMPTS} attempts` +
        (lastOpenErrorDetail ? ` (last "open" error: ${lastOpenErrorDetail})` : ' (the "open" call itself reported success each time)') +
        '. The checkout page structure may have changed, or the shared dedicated-window automation ' +
        'pool stayed busy with another task the whole time — see the evidence screenshot and ' +
        '`opencli browser window list`. (Expected flow: the Anyway payment link 302s to a ' +
        'top-level buy.stripe.com hosted checkout page with plain DOM form fields, not an iframe embed.)',
    );
  }

  // --- Helpers for the cycle below -----------------------------------
  //
  // The payment link page geo-detects a "local" currency (e.g. JPY for a
  // request that looks Japan-based) and shows it pre-selected next to the
  // link's native currency as a toggle ("选择货币": [JP¥7,871] [US$49.00]).
  // Confirmed by direct testing (2026-09-07): submitting with the
  // geo-detected non-native currency left the submit button spinning forever
  // — no redirect, no order, no error surfaced anywhere (network/console were
  // silent) — while explicitly selecting the native currency first completes
  // normally. So always select the currency option whose text starts with
  // CURRENCY_TEXT ("US$" by default — override with --currency-text for a
  // non-USD-native product) before touching the rest of the form.
  //
  // A normal `click` (CDP-dispatched, single synthetic 'click' event) does
  // NOT work on this control: opencli reports `{clicked:true, hit:"target"}`
  // but the button's `.is-active` class never moves and no re-render happens.
  // `click --text` is also unusable regardless of --nth: with --nth it
  // disambiguates by literal index across ALL text-containing ancestors
  // (wrapper divs whose concatenated text happens to contain "US$" too, not
  // just the button), and without --nth it's a hard `semantic_ambiguous`
  // error. What DOES work is dispatching a full
  // pointerdown/mousedown/pointerup/mouseup/click sequence with real
  // coordinates via eval.
  const selectCurrencyJs =
    `(()=>{const btns=[...document.querySelectorAll('.CurrencyOptionButton')];` +
    `const target=btns.find(b=>b.textContent.startsWith(${JSON.stringify(CURRENCY_TEXT)}));` +
    `if(!target)return JSON.stringify({found:false});` +
    `if(target.className.includes('is-active'))return JSON.stringify({found:true,alreadyActive:true,text:target.textContent});` +
    `const r=target.getBoundingClientRect();` +
    `const opts={bubbles:true,cancelable:true,composed:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,pointerId:1,isPrimary:true,button:0};` +
    `target.dispatchEvent(new PointerEvent('pointerdown',opts));` +
    `target.dispatchEvent(new MouseEvent('mousedown',opts));` +
    `target.dispatchEvent(new PointerEvent('pointerup',opts));` +
    `target.dispatchEvent(new MouseEvent('mouseup',opts));` +
    `target.dispatchEvent(new MouseEvent('click',opts));` +
    `return JSON.stringify({found:true,alreadyActive:false,text:target.textContent});})()`;

  // Switching currency re-mounts the whole payment-method/card-fields React
  // tree (confirmed via the Stripe Checkout session's client_reference_id
  // changing in the URL right after the switch — a real re-initialization,
  // not just a CSS transition). A fixed sleep is the wrong tool since the
  // re-mount's duration varies a lot run to run (observed ~1.5s-8s+).
  // Instead wait for the DOM to actually go quiet: watch for mutations under
  // <body> and resolve once none have landed for 900ms, capped at 25s.
  const domQuietJs =
    `(async()=>{const start=Date.now();let lastMutation=Date.now();` +
    `const obs=new MutationObserver(()=>{lastMutation=Date.now();});` +
    `obs.observe(document.body,{childList:true,subtree:true,attributes:true});` +
    `const deadline=start+25000;` +
    `while(Date.now()<deadline){` +
    `if(Date.now()-lastMutation>900){obs.disconnect();return JSON.stringify({settled:true,waitedMs:Date.now()-start});}` +
    `await new Promise(r=>setTimeout(r,150));}` +
    `obs.disconnect();return JSON.stringify({settled:false,waitedMs:Date.now()-start});})()`;

  // Stripe Checkout's submit button stays present and "clickable" in the DOM
  // (disabled === false, pointer-events: auto) for a variable amount of time
  // while a loading spinner SVG is visually layered on top of it. A plain
  // `click` during that window hits the spinner via elementFromPoint, not
  // the real button, and the click is silently swallowed. Poll client-side
  // until elementFromPoint at the button's center resolves to the button
  // itself before clicking it.
  //
  // `elementFromPoint` only ever resolves against the current *viewport* —
  // it ignores content scrolled out of view entirely (returns whatever is
  // actually painted at that x/y, which can be a totally unrelated element,
  // the <body>, or null). On short browser windows (observed: viewport
  // height ~702px, button top ~1006px) the button sits below the fold on
  // page load, so `top` never equals `btn` and this loop spins to the 30s
  // deadline every time even though the button is real, enabled, and would
  // be clickable if scrolled into view. Fixed 2026-09-29: scroll the button
  // to the vertical center of the viewport on every iteration (cheap,
  // idempotent, and self-correcting if a re-render moves it again) before
  // doing the elementFromPoint hit-test.
  const submitReadyJs =
    `(async()=>{const start=Date.now();const deadline=start+30000;` +
    `while(Date.now()<deadline){` +
    `const btn=document.querySelector('[data-testid=hosted-payment-submit-button]');` +
    `if(btn){btn.scrollIntoView({block:'center',inline:'center'});` +
    `const r=btn.getBoundingClientRect();` +
    `const top=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2);` +
    `if(top===btn||btn.contains(top)){return JSON.stringify({ready:true,waitedMs:Date.now()-start});}}` +
    `await new Promise(res=>setTimeout(res,300));}` +
    `return JSON.stringify({ready:false,waitedMs:Date.now()-start});})()`;

  function selectCurrencyAndWaitSettled(label) {
    const info = JSON.parse(oc(['eval', selectCurrencyJs]));
    if (!info.found) {
      log(`[currency${label}] no option starting with "${CURRENCY_TEXT}" found — leaving as-is`);
      return;
    }
    log(`[currency${label}] "${info.text}" ${info.alreadyActive ? 'already active' : 'selected'}`);
    if (info.alreadyActive) return;
    log(`[wait${label}] letting the currency-switch re-render settle...`);
    const settleInfo = JSON.parse(oc(['eval', domQuietJs], { timeoutMs: 30_000 }));
    log(`[wait${label}] settled=${settleInfo.settled} (waited ${settleInfo.waitedMs}ms)`);
    oc(['wait', 'selector', '#email', '--timeout', '15000'], { allowFail: true });
  }

  selectCurrencyAndWaitSettled('');

  // The whole payment element can spontaneously reset mid-flow (observed
  // 2026-09-07: after a successful currency switch + fill, clicking submit
  // sometimes re-triggers the SAME full re-mount the currency switch causes
  // — panel goes back to a translucent "still has old values but re-loading"
  // state, client_reference_id changes again, and the click that landed on
  // the pre-reset button is lost). So the fill-through-submit sequence is
  // retried only before submission. After any submit attempt, use read-only
  // verification: a missing click acknowledgement cannot prove no charge happened.
  const baseCheckoutUrl = oc(['get', 'url'], { allowFail: true });
  const maxCycles = 4;
  let movedOffBase = false;
  let submitted = false;
  for (let cycle = 1; cycle <= maxCycles && !movedOffBase; cycle += 1) {
    const tag = ` cycle ${cycle}/${maxCycles}`;
    log(`[${tag.trim()}] ensuring payment method + fields, then submitting`);

    // Re-confirm currency in case the panel reset and reverted to the
    // geo-detected default.
    if (cycle > 1) selectCurrencyAndWaitSettled(` (${tag.trim()})`);

    // "银行卡" (card) is the default-selected payment method tab; click it
    // explicitly and idempotently in case a reset defaults to Cash App Pay
    // or Bank instead.
    oc(['click', 'input[name="payment-method-accordion-item-title"][value="card"]'], { allowFail: true });

    // Individual calls, not one `batch` — deliberately. The two manually
    // driven runs that DID complete successfully (2026-09-07, orders
    // two earlier test orders) filled every field with a
    // separate `opencli browser ... fill` process each; every automated
    // attempt that batched all 7 fills into one `batch` call (one CDP
    // session covering all of them) got the click accepted but the page
    // never progressed. Correlation isn't proof of the mechanism, but
    // matching the known-good shape is cheap and this is the last remaining
    // structural difference between the two.
    log(`[fill${tag}] contact + card + billing fields...`);
    const fillSteps = [
      ['fill', '#email', EMAIL],
      ['fill', '#cardNumber', CARD_NUMBER],
      ['fill', '#cardExpiry', CARD_EXPIRY],
      ['fill', '#cardCvc', CARD_CVC],
      ['fill', '#billingName', NAME],
      ['select', '#billingCountry', COUNTRY],
      // `#billingAddressLine1` / `#billingLocality` only render once a
      // billing country is selected (US here), and — confirmed live
      // 2026-09-29 — the checkout form now client-side-validates both as
      // required for a US address: leaving them empty draws a red required
      // outline on submit and the pay button click is silently swallowed
      // (no navigation, no error, no network request — this was the actual
      // cause of every prior "submit never progressed" failure, not a
      // bot/dwell-time heuristic as originally suspected). They didn't exist
      // in the 2026-09-07 single-field-per-country form this script was
      // originally written against.
      ['fill', '#billingAddressLine1', ADDRESS_LINE1],
      ['fill', '#billingLocality', CITY],
      // Postal code only renders for some countries (e.g. US) — best-effort,
      // not a hard requirement (last entry, excluded from hardFailures below).
      ['fill', '#billingPostalCode', POSTAL],
    ];
    // A short pause between each field (not just before the final submit)
    // mimics the pacing of the two manually-driven runs that completed
    // successfully — each field there was a separate command with natural
    // round-trip latency between them, unlike a tight synchronous loop.
    const fillResults = [];
    for (const [cmd, target, value] of fillSteps) {
      fillResults.push(ocField(cmd, target, value));
      await sleep(900);
    }
    const hardFailures = fillResults.filter((r, i) => !r.ok && i < fillSteps.length - 1);
    if (hardFailures.length) {
      screenshotEvidence(`fill-failed-cycle${cycle}`);
      if (cycle === maxCycles) throw new Error(`Form fill failed: ${JSON.stringify(hardFailures)}`);
      log(`[fill${tag}] failed (${JSON.stringify(hardFailures)}) — panel likely mid-reset, retrying next cycle`);
      await sleep(2000);
      continue;
    }

    // Deliberate pause before submitting. Every prior attempt that filled
    // the form and clicked submit within a few seconds of page-open (this
    // form's fields alone, batch-filled) got the click accepted
    // (`{clicked:true, hit:"target"}`) but the page never progressed off the
    // base checkout URL — no spinner, no error, no navigation, checked via
    // console/network/DOM — repeatable across many attempts including with a
    // never-before-used merchant_reference (ruling out server-side dedup).
    // The one thing consistently different in the two runs that DID
    // complete (driven manually, one command at a time) is wall-clock time
    // on page before submitting — tens of seconds, not a few. That matches
    // a plausible bot/velocity heuristic (this is a Stripe Checkout page
    // that literally renders an "I am an AI agent acting on behalf of
    // someone else" disclosure checkbox — see AiAgentPaymentSteering below —
    // so this checkout surface is explicitly agent-aware). Padding time here
    // is the practical mitigation available from a test script.
    await sleep(6000);

    log(`[wait${tag}] polling until the submit button is hit-testable (not covered by its loading spinner)...`);
    const readyInfo = JSON.parse(oc(['eval', submitReadyJs], { timeoutMs: 35_000 }));
    log(`[wait${tag}] submit button ready=${readyInfo.ready} (waited ${readyInfo.waitedMs}ms)`);
    if (!readyInfo.ready) {
      screenshotEvidence(`submit-never-ready-cycle${cycle}`);
      if (cycle === maxCycles) {
        throw new Error('Submit button never became hit-testable (stuck under its own loading spinner).');
      }
      continue;
    }

    log(`[submit${tag}] clicking pay button...`);
    submitted = true; // Even a command timeout may have delivered the click.
    try {
      oc(['click', '[data-testid=hosted-payment-submit-button]']);
    } catch (err) {
      screenshotEvidence(`submit-failed-cycle${cycle}`);
      log('[submit] click acknowledgement failed; switching to read-only verification');
      break;
    }

    const attemptDeadline = Date.now() + 15_000;
    while (Date.now() < attemptDeadline) {
      await sleep(1500);
      const currentUrl = oc(['get', 'url'], { allowFail: true });
      if (currentUrl && currentUrl !== baseCheckoutUrl) {
        movedOffBase = true;
        break;
      }
    }
    break; // Once submitted, all remaining work is read-only, even without navigation.
  }
  if (!submitted) {
    screenshotEvidence('submit-never-progressed');
    throw new Error('Checkout never became ready; no payment was submitted.');
  }

  log('[verify] observing return URLs and Merchant API (read-only)...');
  let order;
  try {
    order = await resolvePaidOrder(expected, startedAt);
  } catch (err) {
    screenshotEvidence('order-not-verified');
    throw err;
  }
  const orderId = order.orderId;
  log(`[ok] order ${orderId} is PAID (${order.amountCents} ${order.currency})`);

  let webhookCheck;
  if (flags['expect-webhook-url']) {
    const webhookUrl = String(flags['expect-webhook-url']).replace('{orderId}', orderId);
    log('[webhook] GET project endpoint');
    try {
      const res = await fetch(webhookUrl);
      webhookCheck = { status: res.status };
      log(`[webhook] -> ${res.status}`);
    } catch (err) {
      webhookCheck = { url: webhookUrl, error: String(err.message || err) };
      log(`[webhook] request failed: ${webhookCheck.error}`);
    }
  }

  const result = {
    orderId: order.orderId,
    status: order.status,
    amountCents: order.amountCents,
    currency: order.currency,
    merchantReference: order.merchantReference,
    ...(webhookCheck ? { webhookCheck } : {}),
  };

  console.log(JSON.stringify(result, null, 2));
}

main()
  .then(() => {
    closeSession();
    process.exit(0);
  })
  .catch((err) => {
    log('[fatal]', err.stack || err.message || err);
    closeSession();
    process.exit(1);
  });
