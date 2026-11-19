import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  acquireToolsShareLock,
  acquireToolsShareBrowserLocks,
  assertToolsShareAvailable,
  captureStable,
  toolsShareBlockReason,
} from '../scripts/lib-tools-share.mjs';

test('recognizes redirect, expired session, and cooldown pages', () => {
  assert.match(toolsShareBlockReason({ url: 'https://gmitm.redirect.dash/error' }), /access-denied/);
  assert.match(
    toolsShareBlockReason({ url: 'https://sem.proxy.example.com/gmitm.redirect.dash?msg=%E7%99%BB%E5%BD%95%E8%BF%87%E6%9C%9F%E6%88%96%E6%97%A0%E6%95%88' }),
    /expired/,
  );
  assert.match(toolsShareBlockReason({ bodyText: '登录过期或无效，请重新登录' }), /expired/);
  assert.match(toolsShareBlockReason({ bodyText: '账号已冻结，剩余冷却 350 分钟' }), /frozen/);
  assert.equal(toolsShareBlockReason({ url: 'https://sem.proxy.example.com/home/', bodyText: '关键词难度 22' }), null);
  assert.throws(
    () => assertToolsShareAvailable({ bodyText: 'session expired' }),
    (error) => error.code === 'TOOLS_SHARE_BLOCKED',
  );
});

test('every launch caller explicitly releases and semrush-report has no pre-launch eval', async () => {
  // Scanned, not enumerated: a hard-coded list only proves the listed files are
  // still fine, never that nothing was missed. semrush-traffic.mjs sat outside the
  // old list for exactly that reason.
  const dir = new URL('../scripts/', import.meta.url);
  const names = (await readdir(dir)).filter((n) => n.endsWith('.mjs')).sort();
  const scripts = [];
  for (const name of names) {
    const source = await readFile(new URL(name, dir), 'utf8');
    if (!/launchTool\(/.test(source)) continue;   // not a panel driver
    if (name === 'lib-tools-share.mjs') continue;  // defines it, does not call it
    scripts.push(name);
    assert.match(source, /releaseBrowserLocks/, name + ' must release the shared browser lock');
  }
  assert.ok(scripts.length >= 8, `expected the scan to find the panel drivers, found ${scripts.length}: ${scripts.join(', ')}`);
  for (const expected of ['semrush-report.mjs', 'similarweb-query.mjs', 'semrush-traffic.mjs']) {
    assert.ok(scripts.includes(expected), `${expected} dropped out of the launchTool scan`);
  }
  const report = await readFile(new URL('../scripts/semrush-report.mjs', import.meta.url), 'utf8');
  const ensureTool = report.slice(report.indexOf('async function ensureTool()'), report.indexOf('/** 面板/工具页'));
  assert.ok(ensureTool.indexOf('launchTool(') >= 0);
  assert.equal(ensureTool.slice(0, ensureTool.indexOf('launchTool(')).includes('evalPage('), false);
});

test('different sessions and providers do not share a global browser lock', async () => {
  const lockRoot = await mkdtemp(join(tmpdir(), 'tools-share-browser-lock-test-'));
  try {
    const first = await acquireToolsShareBrowserLocks('test-session', 'semrush', { lockRoot, timeoutMs: 1000 });
    const second = await acquireToolsShareBrowserLocks('other-session', 'similarweb', { lockRoot, timeoutMs: 1000 });
    assert.deepEqual(first.keys, ['opencli-session-test-session', 'semrush']);
    assert.deepEqual(second.keys, ['opencli-session-other-session', 'similarweb']);
    await second.release();
    await first.release();
  } finally { await rm(lockRoot, { recursive: true, force: true }); }
});

test('captureStable settles after enough identical fingerprints and aborts on transient pages', async () => {
  let call = 0;
  const sequence = ['loading', 'content A', 'content A', 'content A'];
  const result = await captureStable({
    read: () => Promise.resolve({ text: sequence[Math.min(call++, sequence.length - 1)] }),
    fingerprint: (c) => c.text === 'loading' ? null : c.text,
    needed: 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(result.stable, true);
  assert.equal(result.fingerprint, 'content A');
  assert.equal(result.reads >= 3, true, 'needs at least 3 reads: 1 loading + 2 stable');

  let abortCall = 0;
  const abortResult = await captureStable({
    read: () => Promise.resolve({ text: 'error page', blank: true }),
    fingerprint: (c) => c.text,
    abortIf: (c) => c.blank,
    needed: 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(abortResult.stable, false);
  assert.equal(abortResult.aborted, true);
  assert.equal(abortResult.reads, 1);

  let noDataCall = 0;
  const noDataSequence = ['no data', 'no data', 'no data', 'no data'];
  const noDataResult = await captureStable({
    read: () => Promise.resolve({ text: noDataSequence[Math.min(noDataCall++, noDataSequence.length - 1)] }),
    fingerprint: (c) => c.text,
    needed: (print) => print === 'no data' ? 3 : 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(noDataResult.stable, true);
  assert.equal(noDataResult.reads >= 3, true, 'no-data needs 3 matching reads');

  const timeoutResult = await captureStable({
    read: () => Promise.resolve({ text: 'flip-' + Math.random() }),
    fingerprint: (c) => c.text,
    needed: 2,
    timeoutMs: 100,
    intervalMs: 10,
  });
  assert.equal(timeoutResult.stable, false);
  assert.equal(timeoutResult.aborted, false);
});

// <law-ref id="readiness-must-bind-to-this-query"/>：「连续读到一样」是重复，重复不是完成。
// 一个还没开始渲染的区域是完美稳定的，所以 needed=2 会被「稳定的空」瞬间满足。
// renderSignal 把结论绑到页面产出的完成信号上；拿不到信号就只能是 inconclusive。
test('captureStable: a stable fingerprint with no render signal is inconclusive, not stable', async () => {
  // 默认（不传 renderSignal）：行为必须和从前逐字一致 —— 稳定的空照样收下。
  const ungated = await captureStable({
    read: () => Promise.resolve({ rows: 0, pager: false }),
    fingerprint: (c) => `rows=${c.rows}`,
    needed: 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(ungated.stable, true, 'no renderSignal → unchanged legacy behaviour');
  assert.equal(ungated.inconclusive, false);
  assert.equal(ungated.fingerprint, 'rows=0');

  // 传了信号但页面始终没产出它：同一串读数**必须**变成 inconclusive。
  // 这就是「稳定的空」——它在旧实现里会被收下当成确认值。
  const gatedNoSignal = await captureStable({
    read: () => Promise.resolve({ rows: 0, pager: false }),
    fingerprint: (c) => `rows=${c.rows}`,
    renderSignal: (c) => c.pager,
    needed: 2,
    timeoutMs: 200,
    intervalMs: 10,
  });
  assert.equal(gatedNoSignal.stable, false, 'stable-but-unsignalled must NOT be reported as stable');
  assert.equal(gatedNoSignal.inconclusive, true, 'and it must be inconclusive, not a plain timeout');
  assert.equal(gatedNoSignal.fingerprint, 'rows=0', 'the raw evidence still travels with the verdict');

  // 信号到了：照常收下。
  let reads = 0;
  const gatedWithSignal = await captureStable({
    read: () => Promise.resolve({ rows: 0, pager: reads++ >= 2 }),
    fingerprint: (c) => `rows=${c.rows}`,
    renderSignal: (c) => c.pager,
    needed: 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(gatedWithSignal.stable, true);
  assert.equal(gatedWithSignal.inconclusive, false);

  // 信号见过一次就算数，之后被虚拟列表回收掉不该撤销一个已经成立的事实。
  let flick = 0;
  const flickering = await captureStable({
    read: () => Promise.resolve({ rows: 3, pager: flick++ === 0 }),
    fingerprint: (c) => `rows=${c.rows}`,
    renderSignal: (c) => c.pager,
    needed: 2,
    timeoutMs: 5000,
    intervalMs: 10,
  });
  assert.equal(flickering.stable, true, 'a render signal seen once is not withdrawn');

  // 「值一直在跳」和「稳定但没信号」是两种失败，下游必须分得开。
  const churning = await captureStable({
    read: () => Promise.resolve({ rows: Math.random(), pager: false }),
    fingerprint: (c) => `rows=${c.rows}`,
    renderSignal: (c) => c.pager,
    needed: 2,
    timeoutMs: 100,
    intervalMs: 10,
  });
  assert.equal(churning.stable, false);
  assert.equal(churning.inconclusive, false, 'a never-settling read is a plain timeout, not inconclusive');
});

test('serializes concurrent users of the same tool lock', async () => {
  const lockRoot = await mkdtemp(join(tmpdir(), 'tools-share-lock-test-'));
  try {
    const first = await acquireToolsShareLock('test-sem', { lockRoot, pollMs: 10, timeoutMs: 1000 });
    let secondAcquired = false;
    const secondPromise = acquireToolsShareLock('test-sem', { lockRoot, pollMs: 10, timeoutMs: 1000 })
      .then((lock) => { secondAcquired = true; return lock; });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(secondAcquired, false);
    await first.release();
    const second = await secondPromise;
    assert.equal(secondAcquired, true);
    await second.release();
  } finally {
    await rm(lockRoot, { recursive: true, force: true });
  }
});
