/**
 * 流量筛查管线去判决化（2026-08-30）的行为测试。
 *
 * 三条主张，全部作为**子进程行为**或**共享库函数**来测，不扫源码正则：
 *   1. 批量脚本的续跑语义由 stopReason 决定（lib-batch-evidence.isRowComplete），
 *      旧格式（verdict）按 legacy 规则识别；已全部完成时脚本在碰浏览器之前退出。
 *   2. apply-traffic-screen 只搬测量值 + 证据路径，绝不写 verdict；
 *      未完成的行清掉同源旧测量；--strip-legacy-verdicts 清历史判决字段。
 *   3. targets-select --min-traffic 对实测数字现算；数字缺失单列为未测，
 *      绝不归入不合格；--unmeasured 把「无 traffic」与「有记录无数字」都排进队列。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPLETE_STOP_REASONS, evidenceBaseName, evidenceDirFor, isRowComplete,
  rawExcerptOf, screenshotPaths, writeRawEvidence,
} from '../scripts/lib-batch-evidence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.join(here, '..', 'scripts');
const run = (script, args, options = {}) =>
  spawnSync(process.execPath, [path.join(scripts, script), ...args], { encoding: 'utf8', ...options });

/* ------------------------------------------------------------------ *
 * 1. 完成语义
 * ------------------------------------------------------------------ */

test('stopReason decides completeness; empty-state is complete but is not a verdict', () => {
  assert.equal(isRowComplete({ stopReason: 'stable' }), true);
  assert.equal(isRowComplete({ stopReason: 'empty-state' }), true);
  for (const r of ['unstable', 'timeout', 'exception']) {
    assert.equal(isRowComplete({ stopReason: r }), false, `${r} must be retried by resume`);
  }
  assert.deepEqual([...COMPLETE_STOP_REASONS].sort(), ['empty-state', 'stable']);
});

test('legacy rows keep their old resume semantics: verdict=error is incomplete, others complete', () => {
  assert.equal(isRowComplete({ verdict: 'pass' }), true);
  assert.equal(isRowComplete({ verdict: 'fail' }), true);
  assert.equal(isRowComplete({ verdict: 'below-floor' }), true);
  assert.equal(isRowComplete({ verdict: 'error' }), false);
  assert.equal(isRowComplete({}), false);
  assert.equal(isRowComplete(null), false);
});

test('evidence helpers produce paths next to the output file and scrub via the caller', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'traffic-evidence-'));
  const out = path.join(dir, 'sw.jsonl');
  assert.equal(evidenceDirFor(out), `${out}.evidence`);
  assert.equal(evidenceBaseName('Example.COM'), 'example.com');
  const shot = screenshotPaths(out, 'example.com');
  assert.equal(shot.rel, path.join('sw.jsonl.evidence', 'example.com.png'));
  const rel = writeRawEvidence({ outPath: out, domain: 'example.com', text: 'secret-token-abc body', redact: (s) => s.replace('secret-token-abc', '<redacted>') });
  assert.equal(rel, path.join('sw.jsonl.evidence', 'example.com.txt'));
  const written = readFileSync(path.join(dir, rel), 'utf8');
  assert.match(written, /<redacted> body/);
  assert.doesNotMatch(written, /secret-token-abc/);
  assert.equal(rawExcerptOf('a'.repeat(2000), 100).length, 101); // 100 + 省略号
});

/* ------------------------------------------------------------------ *
 * 1b. 批量脚本：全部已完成时在碰浏览器之前就退出（真子进程，不是正则）
 * ------------------------------------------------------------------ */

test('similarweb-batch resumes past completed rows (new and legacy) without touching a browser', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'swbatch-'));
  const out = path.join(dir, 'sw.jsonl');
  writeFileSync(out, [
    JSON.stringify({ domain: 'a-new.com', totalVisits: 1234, stopReason: 'stable' }),
    JSON.stringify({ domain: 'b-empty.com', totalVisits: null, stopReason: 'empty-state' }),
    JSON.stringify({ domain: 'c-legacy.com', totalVisits: 55, verdict: 'fail' }),
  ].join('\n') + '\n');
  const r = run('similarweb-batch.mjs', ['--domains', 'a-new.com,b-empty.com,c-legacy.com', '--out', out]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /3 already done, 0 to go/);
});

test('similarweb-batch retries incomplete rows: timeout/unstable/legacy-error are not "done"', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'swbatch-'));
  const out = path.join(dir, 'sw.jsonl');
  writeFileSync(out, [
    JSON.stringify({ domain: 'a.com', stopReason: 'timeout' }),
    JSON.stringify({ domain: 'b.com', stopReason: 'unstable' }),
    JSON.stringify({ domain: 'c.com', verdict: 'error' }),
  ].join('\n') + '\n');
  // 桩 opencli：立即失败，让脚本在 launch 阶段就停。我们只断言续跑账目。
  const stub = mkdtempSync(path.join(tmpdir(), 'opencli-stub-'));
  writeFileSync(path.join(stub, 'opencli'), '#!/bin/sh\necho stub >&2\nexit 3\n');
  spawnSync('chmod', ['+x', path.join(stub, 'opencli')]);
  const r = run('similarweb-batch.mjs', ['--domains', 'a.com,b.com,c.com', '--out', out], {
    env: { ...process.env, PATH: `${stub}:${process.env.PATH}` },
  });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /0 already done, 3 to go/);
});

/* ------------------------------------------------------------------ *
 * 2. apply-traffic-screen：纯搬运，不判决
 * ------------------------------------------------------------------ */

function targetsFixture() {
  return {
    updatedAt: '2026-08-01',
    targets: [
      { domain: 'kept.com', route: 'https://kept.com/submit', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-01' },
      { domain: 'stale.com', route: 'https://stale.com/submit', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-01', traffic: { monthlyVisits: 5, verdict: 'fail', checkedAt: '2026-08-01T00:00:00Z', source: 'similarweb' } },
      { domain: 'othersource.com', route: 'https://othersource.com/submit', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-01', traffic: { monthlyVisits: 900, verdict: 'pass', checkedAt: '2026-08-01T00:00:00Z', source: 'semrush' } },
    ],
  };
}

test('apply-traffic-screen writes numbers + evidence and never a verdict; incomplete rows clear same-source stale entries only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apply-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(targetsFixture(), null, 2));
  const jsonl = path.join(dir, 'sw.jsonl');
  writeFileSync(jsonl, [
    JSON.stringify({ domain: 'kept.com', totalVisits: 4321, globalRank: 99, parse: 'parsed', stopReason: 'stable', evidence: { screenshot: 'sw.jsonl.evidence/kept.com.png', raw: 'sw.jsonl.evidence/kept.com.txt', screenshotError: null }, checkedAt: '2026-08-30T00:00:00Z' }),
    JSON.stringify({ domain: 'stale.com', totalVisits: null, parse: 'none', stopReason: 'timeout', checkedAt: '2026-08-30T00:00:00Z' }),
    JSON.stringify({ domain: 'othersource.com', totalVisits: null, parse: 'none', stopReason: 'exception', checkedAt: '2026-08-30T00:00:00Z' }),
  ].join('\n') + '\n');
  const r = run('apply-traffic-screen.mjs', ['--in', jsonl, '--source', 'similarweb', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const [kept, stale, other] = doc.targets;
  // 完成的行：数字 + 证据路径，无 verdict。
  assert.equal(kept.traffic.monthlyVisits, 4321);
  assert.equal(kept.traffic.source, 'similarweb');
  assert.ok(!('verdict' in kept.traffic), 'no verdict may be written');
  assert.equal(kept.traffic.evidence.stopReason, 'stable');
  assert.equal(kept.traffic.evidence.screenshot, 'sw.jsonl.evidence/kept.com.png');
  assert.equal(kept.traffic.evidence.jsonl, 'sw.jsonl');
  // 未完成的行：清掉同源旧测量（旧的 fail 判决不能冒充已测）。
  assert.equal(stale.traffic, undefined, 'incomplete capture must clear the stale same-source measurement');
  // 异源不清：similarweb 这次没测成，否定不了 semrush 的数字。
  assert.equal(other.traffic.monthlyVisits, 900);
});

test('apply-traffic-screen accepts legacy verdict jsonl rows but strips the verdict on write; empty-state lands as null + evidence', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apply-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(targetsFixture(), null, 2));
  const jsonl = path.join(dir, 'mix.jsonl');
  writeFileSync(jsonl, [
    JSON.stringify({ domain: 'kept.com', totalVisits: null, parse: 'no-data-marker', stopReason: 'empty-state', evidence: { screenshot: null, raw: 'mix.jsonl.evidence/kept.com.txt', screenshotError: 'stub' }, checkedAt: '2026-08-30T00:00:00Z' }),
    JSON.stringify({ domain: 'stale.com', totalVisits: 250, verdict: 'pass', checkedAt: '2026-08-30T00:00:00Z' }), // 旧格式 JSONL
  ].join('\n') + '\n');
  const r = run('apply-traffic-screen.mjs', ['--in', jsonl, '--source', 'similarweb', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const [kept, stale] = doc.targets;
  assert.equal(kept.traffic.monthlyVisits, null);
  assert.equal(kept.traffic.evidence.stopReason, 'empty-state');
  assert.ok(!('verdict' in kept.traffic));
  assert.equal(stale.traffic.monthlyVisits, 250);
  assert.ok(!('verdict' in stale.traffic), 'legacy jsonl verdict must not be copied forward');
  assert.equal(stale.traffic.evidence.stopReason, null, 'legacy rows have no scene to point at — null marks that debt');
});

test('apply-traffic-screen --strip-legacy-verdicts removes stored verdicts without touching numbers', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'apply-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(targetsFixture(), null, 2));
  const r = run('apply-traffic-screen.mjs', ['--strip-legacy-verdicts', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, /stripped 2 legacy verdict field\(s\)/);
  const doc = JSON.parse(readFileSync(file, 'utf8'));
  const stale = doc.targets.find((t) => t.domain === 'stale.com');
  assert.equal(stale.traffic.monthlyVisits, 5);
  assert.ok(!('verdict' in stale.traffic));
});

/* ------------------------------------------------------------------ *
 * 3. targets-select：门槛现算，数字缺失 = 未测单列
 * ------------------------------------------------------------------ */

function selectFixture() {
  return {
    updatedAt: '2026-08-30',
    targets: [
      { domain: 'big.com', route: 'https://big.com/s', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-29', traffic: { monthlyVisits: 5000, checkedAt: '2026-08-30T00:00:00Z', source: 'similarweb' } },
      { domain: 'small.com', route: 'https://small.com/s', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-29', traffic: { monthlyVisits: 12, checkedAt: '2026-08-30T00:00:00Z', source: 'similarweb' } },
      { domain: 'nonumber.com', route: 'https://nonumber.com/s', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-29', traffic: { monthlyVisits: null, checkedAt: '2026-08-30T00:00:00Z', source: 'similarweb', evidence: { stopReason: 'empty-state' } } },
      { domain: 'never.com', route: 'https://never.com/s', status: 'usable', cohort: 'open', kind: 'web-directory', payment: 'none-seen', lastProbedAt: '2026-08-29' },
    ],
  };
}

test('targets-select --min-traffic computes the gate from measured numbers and reports missing numbers separately, never as unqualified', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'select-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(selectFixture(), null, 2));
  const r = run('targets-select.mjs', ['--cohort', 'open', '--min-traffic', '100', '--format', 'urls', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  const urls = r.stdout.trim().split('\n').filter(Boolean);
  assert.deepEqual(urls, ['https://big.com/s'], 'only the measured >=100 row is in the batch');
  assert.match(r.stderr, /excluded 1 never-measured and 1 measured-but-no-number/);
  assert.match(r.stderr, /NOT a low-traffic verdict/);
});

test('targets-select --unmeasured queues both no-record and no-number rows', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'select-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(selectFixture(), null, 2));
  const r = run('targets-select.mjs', ['--cohort', 'open', '--unmeasured', '--format', 'urls', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  const urls = r.stdout.trim().split('\n').filter(Boolean).sort();
  assert.deepEqual(urls, ['https://never.com/s', 'https://nonumber.com/s']);
});

test('targets-select --stats reports measurement states, not verdicts', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'select-'));
  const file = path.join(dir, 'targets.json');
  writeFileSync(file, JSON.stringify(selectFixture(), null, 2));
  const r = run('targets-select.mjs', ['--stats', '--file', file]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /has-number\s+no-number\s+unmeasured/);
  assert.doesNotMatch(r.stdout, /traffic>=100/, 'stats must not present a threshold as a stored verdict');
});
