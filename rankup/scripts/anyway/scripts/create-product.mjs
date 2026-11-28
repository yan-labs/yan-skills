#!/usr/bin/env node
// 用途：在已登录后台创建一次性或月/年订阅商品与支付链接，再用只读 Merchant API 复核。
// 参数：--name --description --price --currency --success-url [--type one-time|subscription] [--interval month|year] [--flexible --min 5 --max 48] [--dry-run] [--no-submit] [--env stg|prod] [--env-file <path>] [--session anyway-dashboard] [--json]。
// --no-submit：只填表并回读字段值，不点「创建产品」（验证后台改版后的选择器，不会创建任何东西）。
// 登录态：OpenCLI 已连接用户浏览器，且当前环境的商户后台已登录；复核需要相应 API key。
// 已知坑：商品表单没有 cancel URL；提交即发布并创建支付链接；已归档同名商品不阻止重建。验证日期：2026-09-29。
// 2026-10-02：后台登录态过期时 /products/new 会跳 /login，脚本现在开页后检测并以退出码 3 提示需要人工登录；
// 开页遇到 Navigation rejected（新会话首次 open 必现，同会话再 open 即成功）时在原会话上重试；填表前等待 #product-name 渲染，描述框找不到时回退到页面第一个 textarea。

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnvName, getEnvConfig } from '../lib/env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ANYWAY_DIR = path.dirname(__dirname); // shared Anyway tool
const ANYWAY_CLI = path.join(ANYWAY_DIR, 'anyway.mjs');

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

const NAME = flags.name;
const DESCRIPTION = flags.description;
const PRICE = String(flags.price ?? '');
const CURRENCY = flags.currency || 'USD';
const SUCCESS_URL = flags['success-url'] || '';
const TYPE = flags.type || 'one-time';
const INTERVAL = flags.interval || 'month';
const DRY_RUN = !!flags['dry-run'];
const NO_SUBMIT = !!flags['no-submit'];
const FLEXIBLE = !!flags.flexible;

const SESSION = flags.session || 'anyway-dashboard';
const WINDOW = flags.window || 'dedicated';
const JSON_OUT = !!flags.json;
const ENV = resolveEnvName(flags.env);
const ENV_CONFIG = getEnvConfig(ENV);
const DASHBOARD_BASE = ENV_CONFIG.dashboardUrl.replace(/\/$/, '');

function log(...args) {
  if (!JSON_OUT) console.error(...args);
}

function runAnywayApi(args) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const out = execFileSync('node', [ANYWAY_CLI, '--env', ENV, ...(flags['env-file'] ? ['--env-file', flags['env-file']] : []), ...args, '--json'], {
        cwd: ANYWAY_DIR,
        encoding: 'utf8',
      });
      return JSON.parse(out);
    } catch (err) {
      lastErr = err; // transient "Network error" from the Merchant API client: retry
      execFileSync('sleep', ['2']);
    }
  }
  throw lastErr;
}

function runOpencliBrowser(args, { allowFail = false } = {}) {
  try {
    const out = execFileSync('opencli', ['browser', SESSION, ...args, '--window', WINDOW], {
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

// Open the form page. The FIRST `open` in a fresh dedicated window is
// rejected ("Navigation rejected", seen on app.anyway.sh 2026-10-02) while the
// window/tab still exists; a plain second `open` on the same session works.
// So retry without closing the session, then make sure we are really on the
// form and not bounced to /login.
async function openFormPage(url) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      runOpencliBrowser(['open', url]);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      log(`[warn] open attempt ${attempt + 1} failed (${String(err.stdout || err.message).split('\n').find((l) => l.includes('rejected')) || 'error'}); retrying on the same session`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  if (lastErr) throw lastErr;
  // The SPA redirects to /login asynchronously once Privy reports no session.
  for (let i = 0; i < 12; i++) {
    const u = currentUrl();
    if (/\/login/.test(u)) {
      const e = new Error(`LOGIN_REQUIRED: ${DASHBOARD_BASE} redirected to ${u}. The ${ENV} dashboard is signed out in the OpenCLI Chrome profile; sign in there once (Google) and rerun.`);
      e.exitCode = 3;
      throw e;
    }
    const probe = runOpencliBrowser(['find', '--css', '#product-name'], { allowFail: true });
    if (!probe.error && probe.matches_n >= 1) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`product form did not render at ${currentUrl()} (no #product-name after 6s); the dashboard layout may have changed.`);
}

function findExistingProduct(name) {
  const res = runAnywayApi(['products', 'list', '--all']);
  const records = res.records || [];
  return records.find((p) => p.name === name && p.status !== 'ARCHIVED') || null;
}

function getLinks(productId) {
  return runAnywayApi(['products', 'links', productId]);
}

async function main() {
  if (!NAME || !DESCRIPTION || !PRICE) throw new Error('usage: --name --description --price required');
  if (!['one-time', 'subscription'].includes(TYPE)) throw new Error('--type must be one-time or subscription');
  if (!['month', 'year'].includes(INTERVAL) || (TYPE !== 'subscription' && flags.interval)) throw new Error('--interval month|year requires --type subscription');

  if (DRY_RUN) {
    console.log(JSON.stringify({ env: ENV, name: NAME, description: DESCRIPTION, price: PRICE, currency: CURRENCY, type: TYPE, ...(TYPE === 'subscription' ? { interval: INTERVAL } : {}), successUrl: SUCCESS_URL, ...(FLEXIBLE ? { flexible: true, min: flags.min, max: flags.max } : {}), create: false }, null, 2));
    return;
  }

  checkDoctor();

  log(`[check] looking for an existing product named "${NAME}" via Merchant API...`);
  let product = findExistingProduct(NAME);

  if (product) {
    log(`[skip] product "${NAME}" already exists (id=${product.id}, status=${product.status}). Not creating again.`);
  } else {
    log(`[create] no existing product named "${NAME}" — driving the browser to create it.`);
    log(`[browser] session="${SESSION}" opening ${DASHBOARD_BASE}/products/new`);

    await openFormPage(`${DASHBOARD_BASE}/products/new`);

    // Fields addressed by CSS id/attribute selectors — stable across
    // re-renders, unlike numeric state refs (which reflow on every dialog
    // open/close and go stale mid-script; see opencli skill session-laws).
    runOpencliBrowser(['fill', '#product-name', NAME]);
    const descFill = runOpencliBrowser(['fill', '#product-description', DESCRIPTION], { allowFail: true });
    if (descFill.error) {
      log('[warn] #product-description not found — falling back to the first textarea on the page');
      runOpencliBrowser(['fill', 'textarea', DESCRIPTION]);
    }

    runOpencliBrowser(['click', '--text', TYPE === 'subscription' ? '订阅' : '一次性', '--nth', '0']);
    if (TYPE === 'subscription') {
      runOpencliBrowser(['click', '[role=combobox]']);
      runOpencliBrowser(['click', '--role', 'option', '--name', INTERVAL === 'year' ? '每年' : '每月']);
      let selected;
      for (let attempt = 0; attempt < 3; attempt++) {
        selected = runOpencliBrowser(['get', 'text', '[role=combobox]'], { allowFail: true });
        if (selected.value) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      if (selected.value?.trim() !== (INTERVAL === 'year' ? '每年' : '每月')) {
        throw new Error(`billing interval was not selected: expected ${INTERVAL}, got ${selected.value || 'unknown'}`);
      }
    }

    if (CURRENCY !== 'USD') {
      runOpencliBrowser(['click', '[aria-label=币种]']);
      runOpencliBrowser(['click', `[role=menuitem]:has-text(${CURRENCY})`], { allowFail: true });
    }

    // Price is a plain number input with no id — target by placeholder.
    if (FLEXIBLE) {
      runOpencliBrowser(['click', 'input[type=checkbox]']);
      if (flags.min !== undefined) runOpencliBrowser(['type', '#min-amount', String(flags.min)]);
      if (flags.max !== undefined) runOpencliBrowser(['type', '#max-amount', String(flags.max)]);
    } else {
      runOpencliBrowser(['type', 'input[placeholder="输入价格"]', PRICE]);
    }

    if (SUCCESS_URL) {
      runOpencliBrowser(['fill', '#payment-link-success-url', SUCCESS_URL]);
    }

    if (NO_SUBMIT) {
      const readBack = runOpencliBrowser(['eval', `JSON.stringify({name:document.querySelector('#product-name')?.value,desc:(document.querySelector('#product-description')||document.querySelector('textarea'))?.value,price:document.querySelector('input[placeholder="输入价格"]')?.value,successUrl:document.querySelector('#payment-link-success-url')?.value${FLEXIBLE ? ",flexible:document.querySelector('input[type=checkbox]')?.checked,min:document.querySelector('#min-amount')?.value,max:document.querySelector('#max-amount')?.value" : ''}})`]);
      log('[no-submit] form filled, NOT submitted. Field read-back:', JSON.stringify(readBack));
      return;
    }

    log('[browser] submitting form...');
    runOpencliBrowser(['click', '--role', 'button', '--name', '创建产品']);

    // Give the create + auto-publish + auto-link-creation round trip a moment.
    await new Promise((r) => setTimeout(r, 2500));

    log('[verify] polling Merchant API for the new product...');
    for (let attempt = 0; attempt < 5 && !product; attempt++) {
      product = findExistingProduct(NAME);
      if (!product) await new Promise((r) => setTimeout(r, 1500));
    }

    if (!product) {
      console.error(
        '[error] product creation was submitted but the Merchant API does not show it yet. ' +
          'Check the browser (session "' + SESSION + '") for a validation error or a merchant-review gate.',
      );
      throw new Error('Merchant API does not show the submitted product');
    }

    log(`[ok] product created: id=${product.id} status=${product.status}`);
  }

  const links = getLinks(product.id);
  const result = { product, links };

  if (JSON_OUT) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`product: ${product.name} (${product.id}) — ${product.status}`);
    for (const link of links) {
      console.log(
        `  link: ${link.linkId} — ${link.amount} ${link.currency} · ${link.pricingType} · ` +
          `${DASHBOARD_BASE}/pay/${link.linkId}` +
          (link.successUrl ? ` · success=${link.successUrl}` : ''),
      );
    }
  }
}

main().catch((err) => {
  console.error('[fatal]', err.message);
  process.exitCode = err.exitCode || 1;
}).finally(() => {
  runOpencliBrowser(['close'], { allowFail: true });
});
