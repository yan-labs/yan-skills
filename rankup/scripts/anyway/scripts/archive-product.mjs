#!/usr/bin/env node
// 用途：在已登录 Anyway 商户后台归档指定商品，并用只读 Merchant API 回读状态和支付链接。
// 参数：--product-id <PRD...>（可重复或逗号分隔）或 --name-match <子串>，可加 --keep <PRD,PRD> --dry-run --env stg|prod --env-file <path> --session <name>。
// 登录态：OpenCLI 已连接用户浏览器，且当前环境商户后台已登录；只读复核需要对应 API key。
// 已知坑：后台不支持硬删除，只能归档；已归档同名商品不阻止重建。验证日期：2026-09-30。

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveEnvName, getEnvConfig } from '../lib/env.mjs';

const ANYWAY_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ANYWAY_CLI = path.join(ANYWAY_DIR, 'anyway.mjs');
const flags = {};
for (let i = 2; i < process.argv.length; i++) {
  const [key, inline] = process.argv[i].split('=', 2);
  if (!key.startsWith('--')) throw new Error(`unexpected argument: ${key}`);
  const value = inline ?? (process.argv[i + 1]?.startsWith('--') || !process.argv[i + 1] ? true : process.argv[++i]);
  const name = key.slice(2);
  flags[name] = name === 'product-id' ? [...(flags[name] || []), value] : value;
}

const ENV = resolveEnvName(flags.env);
const BASE = getEnvConfig(ENV).dashboardUrl.replace(/\/$/, '');
const SESSION = flags.session || 'anyway-dashboard';
const WINDOW = flags.window || 'dedicated';
const DRY_RUN = !!flags['dry-run'];
const ids = new Set((flags['product-id'] || []).flatMap((v) => String(v).split(',').map((s) => s.trim()).filter(Boolean)));
const keep = new Set(String(flags.keep || '').split(',').map((s) => s.trim()).filter(Boolean));

function api(args) {
  return JSON.parse(execFileSync('node', [ANYWAY_CLI, '--env', ENV, ...(flags['env-file'] ? ['--env-file', flags['env-file']] : []), ...args, '--json'], { cwd: ANYWAY_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
}

function browser(args) {
  return execFileSync('opencli', ['browser', SESSION, ...args, '--window', WINDOW], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

async function main() {
  if ((ids.size > 0) === !!flags['name-match']) throw new Error('provide --product-id or --name-match');
  if ([...ids, ...keep].some((id) => !/^PRD[A-Z0-9]+$/.test(id))) throw new Error('product IDs must start with PRD');
  if (flags['name-match'] === true || flags['name-match'] === '') throw new Error('--name-match needs a substring');

  const products = api(['products', 'list', '--all']).records || [];
  const selected = products.filter((p) => ids.size ? ids.has(p.productId || p.id) : p.name?.includes(flags['name-match']));
  if (ids.size && selected.length !== ids.size) throw new Error(`product ID not found: ${[...ids].filter((id) => !selected.some((p) => (p.productId || p.id) === id)).join(', ')}`);
  const toArchive = selected.filter((p) => p.status !== 'ARCHIVED' && !keep.has(p.productId || p.id));
  const retained = selected.filter((p) => p.status === 'ARCHIVED' || keep.has(p.productId || p.id));
  const notMatched = products.filter((p) => !selected.includes(p) && p.status !== 'ARCHIVED');
  console.log(JSON.stringify({ env: ENV, dryRun: DRY_RUN, toArchive: toArchive.map(summary), retained: retained.map(summary), notMatched: notMatched.map(summary) }, null, 2));
  if (DRY_RUN || !toArchive.length) return;

  const doctor = execFileSync('opencli', ['doctor'], { encoding: 'utf8' });
  if (!(/\[OK\] Daemon/.test(doctor) && /\[OK\] Extension/.test(doctor)) && !/"daemonRunning":\s*true[\s\S]*"extensionConnected":\s*true/.test(doctor)) throw new Error('opencli doctor failed');
  try {
    for (const product of toArchive) {
      const id = product.productId || product.id;
      browser(['open', `${BASE}/products/overview?id=${encodeURIComponent(id)}`]);
      browser(['wait', 'text', product.name]);
      browser(['click', '--role', 'button', '--name', '归档']);
      browser(['wait', 'text', '确定要归档此产品吗？']);
      browser(['click', '[role=dialog] button', '--nth', '1']);
      let current;
      for (let attempt = 0; attempt < 5; attempt++) {
        current = api(['products', 'get', id]);
        if (current.status === 'ARCHIVED') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      const links = api(['products', 'links', id]);
      if (current.status !== 'ARCHIVED' || !Array.isArray(links) || links.some((link) => link.isActive !== false)) {
        throw new Error(`archive verification failed for ${id}: status=${current.status}, links=${JSON.stringify(links)}`);
      }
      console.log(`verified: ${id} ARCHIVED; usable links=0`);
    }
  } finally {
    try { browser(['close']); } catch { /* preserve the original error */ }
  }
}

function summary(p) { return { id: p.productId || p.id, name: p.name, status: p.status }; }

main().catch((err) => { console.error('[fatal]', err.message); process.exitCode = 1; });
