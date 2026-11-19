/**
 * pressure.mjs 的纯函数测试——**不碰浏览器、不碰真锁目录**。
 *   node --test opencli/tests/pressure.test.mjs
 *
 * 会话列表和锁状态全部作为参数注入。这不是为了跑得快，是因为这个工具存在的
 * 意义就是「在压力大的时候给出正确判断」，而压力大的现场恰恰是最难复现的。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import {
  assessPressure, atLimit, scrubUrl, ownerOf, siteOf, normalizeSessions,
  renderText, gatherLocks, formatDuration, EXIT_CODES, QUOTA_TAB_LIMIT,
} from '../scripts/pressure.mjs';

const SUFFIX = 'convabc123';
const mine = (base) => `${base}-${SUFFIX}`;
const tab = (session, url = '') => ({ session, url });
const idle = (tool) => ({ tool, held: false, pid: null, startedAt: null, heldMs: null, alive: null, path: `/tmp/${userInfo().username}-tools-share-${tool}.lock`, kind: 'tool' });
const heldBy = (tool, pid, alive, heldMs = 223_000) => ({ tool, held: true, pid, startedAt: '2026-08-28T10:00:00.000Z', heldMs, alive, path: `/tmp/${userInfo().username}-tools-share-${tool}.lock`, kind: 'tool' });

const assess = (opts) => assessPressure({ suffix: SUFFIX, locks: [idle('semrush'), idle('similarweb')], ...opts });
const ok = (list) => ({ ok: true, list });

/* ── 标签页压力 ─────────────────────────────────────────────────────── */

test('3 个 semrush 标签页 = 到线，裁决 wait', () => {
  const report = assess({
    sessions: ok([
      tab('semrush-nav', 'https://sem.proxy.example.com/analytics/overview/'),
      tab(mine('tm-a'), 'https://www.semrush.com/analytics/keywordmagic/'),
      tab('sweep2-other', 'https://cdn.semrush.com/x'),
    ]),
  });
  assert.equal(report.verdict, 'wait');
  assert.equal(report.tabs.bySite.semrush.total, 3);
  assert.equal(report.tabs.bySite.semrush.limit, QUOTA_TAB_LIMIT);
  assert.ok(report.tabs.bySite.semrush.atLimit, '3 个就是线');
  assert.deepEqual(report.saturated, ['semrush']);
  const advice = report.actions.join('\n');
  assert.match(advice, /close 不是 sleep/, '要给出具体动作，不是「请稍候」');
  assert.match(advice, /semrush-nav/, '要把固定会话名说出来');
});

test('1 个 semrush 标签页、没有锁 = go', () => {
  const report = assess({ sessions: ok([tab(mine('tm-a'), 'https://sem.proxy.example.com/x')]) });
  assert.equal(report.verdict, 'go');
  assert.equal(report.tabs.bySite.semrush.total, 1);
  assert.equal(report.tabs.bySite.semrush.atLimit, false);
  assert.equal(EXIT_CODES[report.verdict], 0);
});

test('非配额站的标签页不占配额站的线', () => {
  const report = assess({
    sessions: ok([
      tab(mine('a'), 'https://example.com/'),
      tab(mine('b'), 'https://not-semrush.com.evil.test/'),
      tab(mine('c'), 'https://sem.proxy.example.com/x'),
    ]),
  });
  assert.equal(report.verdict, 'go');
  assert.equal(report.tabs.other_site, 2);
  assert.equal(report.tabs.bySite.semrush.total, 1);
});

test('URL 还没出来的固定会话也算进它那个站', () => {
  // 刚建好的 semrush-nav 还没导航，url 是空的。按 URL 归组会把它漏掉，
  // 于是「已经有 3 个」被读成 2 个——正好在最该拦住的时刻放行。
  assert.equal(siteOf({ session: 'semrush-nav', url: '' }), 'semrush');
  const report = assess({
    sessions: ok([tab('semrush-nav'), tab(mine('a'), 'https://sem.proxy.example.com/x'), tab('b-other', 'https://semrush.com/y')]),
  });
  assert.equal(report.tabs.bySite.semrush.total, 3);
  assert.equal(report.verdict, 'wait');
});

/* ── 我的 / 别人的 / 共享的 ──────────────────────────────────────────── */

test('自己的会话、别人的会话、共享的固定会话能区分开', () => {
  assert.equal(ownerOf(mine('tm-a'), { suffix: SUFFIX }), 'mine');
  assert.equal(ownerOf('sweep2-otherconv', { suffix: SUFFIX }), 'other');
  assert.equal(ownerOf('semrush-nav', { suffix: SUFFIX }), 'shared', '配额站固定会话不属于任何人');
  assert.equal(ownerOf('backlink-probe-cn', { prefix: 'backlink-' }), 'mine');

  const report = assess({
    sessions: ok([tab(mine('a')), tab(mine('b')), tab('semrush-nav'), tab('someone-else'), tab('sweep2-x')]),
  });
  assert.equal(report.tabs.total, 5);
  assert.equal(report.tabs.mine, 2);
  assert.equal(report.tabs.shared, 1);
  assert.equal(report.tabs.other, 2);
  const others = report.tabs.entries.filter((e) => e.owner === 'other').map((e) => e.session);
  assert.deepEqual(others.sort(), ['someone-else', 'sweep2-x']);
});

test('到线时会点名「其中几个不是你的，不要关」', () => {
  const report = assess({
    sessions: ok([tab(mine('a'), 'https://sem.proxy.example.com/1'), tab('x-other', 'https://sem.proxy.example.com/2'), tab('y-other', 'https://sem.proxy.example.com/3')]),
  });
  const advice = report.actions.join('\n');
  assert.match(advice, /2 个不是你的/);
  assert.match(advice, /不要关/);
});

/* ── 锁 ─────────────────────────────────────────────────────────────── */

test('锁被活着的 pid 持有 → wait，并说清持有了多久', () => {
  const report = assess({
    sessions: ok([tab(mine('a'), 'https://sem.proxy.example.com/x')]),
    locks: [heldBy('semrush', 94149, true, 223_000), idle('similarweb')],
  });
  assert.equal(report.verdict, 'wait');
  assert.match(report.reasons.join('\n'), /pid 94149 持有 3m43s，进程存活/);
  assert.match(report.actions.join('\n'), /不要换会话名绕过去/);
  assert.doesNotMatch(report.actions.join('\n'), /rm -rf/, '活锁不该建议删');
});

test('pid 已死 → stale-lock，给出人工命令，脚本自己不删锁', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pressure-test-'));
  const path = join(root, `${userInfo().username}-tools-share-semrush.lock`);
  await mkdir(path);
  await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: 999_001, startedAt: new Date(Date.now() - 60_000).toISOString() }));

  const locks = await gatherLocks({ lockRoot: root, probe: () => false });
  const lock = locks.find((l) => l.tool === 'semrush');
  assert.equal(lock.held, true);
  assert.equal(lock.alive, false);

  const report = assess({ sessions: ok([]), locks });
  assert.equal(report.verdict, 'stale-lock');
  assert.match(report.actions.join('\n'), new RegExp(`rm -rf ${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`), '要给出可以照抄的人工命令');
  assert.match(report.actions.join('\n'), /人工/);

  // 最重要的一条：跑完之后锁必须**还在**。删别人的锁比多等十分钟危险得多。
  const after = await gatherLocks({ lockRoot: root, probe: () => false });
  assert.equal(after.find((l) => l.tool === 'semrush').held, true, '脚本绝不能自己删锁');
});

test('owner.json 还没写出来的锁不算陈旧锁', async () => {
  // acquireToolsShareLock 是 mkdir 之后再写 owner.json，中间有个短窗口。
  // 把「读不到 pid」当成「pid 已死」会建议人工去删一把刚刚被拿走的锁。
  const root = await mkdtemp(join(tmpdir(), 'pressure-test-'));
  await mkdir(join(root, `${userInfo().username}-tools-share-similarweb.lock`));
  const locks = await gatherLocks({ lockRoot: root, probe: () => false });
  const lock = locks.find((l) => l.tool === 'similarweb');
  assert.equal(lock.held, true);
  assert.equal(lock.alive, null, '未知就是未知');
  const report = assess({ sessions: ok([]), locks });
  assert.notEqual(report.verdict, 'stale-lock');
  assert.doesNotMatch(report.actions.join('\n'), /rm -rf/);
});

test('--tool 只看那一个工具，不给就全看', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pressure-test-'));
  await mkdir(join(root, `${userInfo().username}-tools-share-semrush.lock`));
  assert.deepEqual((await gatherLocks({ lockRoot: root })).map((l) => l.tool).sort(), ['semrush', 'similarweb']);
  assert.deepEqual((await gatherLocks({ lockRoot: root, tool: 'semrush' })).map((l) => l.tool), ['semrush']);
});

test('没有锁目录时，已知工具仍然显式报「空闲」', async () => {
  const locks = await gatherLocks({ lockRoot: join(tmpdir(), 'pressure-no-such-dir-xyz') });
  assert.deepEqual(locks.map((l) => l.tool).sort(), ['semrush', 'similarweb']);
  assert.ok(locks.every((l) => !l.held));
  assert.match(renderText(assess({ sessions: ok([]), locks })), /锁 semrush\s+: 空闲/);
});

/* ── 会话列表拿不到 ─────────────────────────────────────────────────── */

test('会话列表获取失败 → unknown，绝不能是 go', () => {
  const report = assess({ sessions: { ok: false, error: 'daemon not reachable' } });
  assert.equal(report.verdict, 'unknown');
  assert.notEqual(report.verdict, 'go');
  assert.equal(report.sessionsOk, false);
  assert.equal(report.tabs.total, 0);
  assert.match(report.reasons.join('\n'), /拿不到会话列表/);
  assert.match(report.actions.join('\n'), /不要当成 0 个标签页/);
  assert.match(renderText(report), /标签页 \?\?\? 个/, '渲染出来也不能长得像「0 个，可以动手」');
  assert.equal(EXIT_CODES.unknown, 4);
  assert.notEqual(EXIT_CODES.unknown, EXIT_CODES.go);
});

test('unknown 压过 go：一个空闲的机器 + 拿不到列表，仍然是 unknown', () => {
  assert.equal(assess({ sessions: { ok: false, error: 'x' }, locks: [idle('semrush')] }).verdict, 'unknown');
  assert.equal(assess({ sessions: ok([]) }).verdict, 'go');
});

/* ── 令牌 ───────────────────────────────────────────────────────────── */

test('URL 的 query 被完全剥掉，令牌不进输出', () => {
  const dirty = 'https://sem.proxy.example.com/analytics/overview/?__gmitm=SECRETVALUE123&db=us';
  assert.equal(scrubUrl(dirty), 'https://sem.proxy.example.com/analytics/overview/');

  // hash 路由的工具（Similarweb）把 query 放在 # 之后，按第一个 ? 切才盖得住。
  assert.equal(
    scrubUrl('https://sim.proxy.example.com/#/digitalsuite/home?__gmitm=SECRETVALUE123'),
    'https://sim.proxy.example.com/#/digitalsuite/home',
  );

  const report = assess({ sessions: ok([tab('semrush-nav', dirty)]) });
  const serialized = `${JSON.stringify(report)}\n${renderText(report)}`;
  assert.ok(!serialized.includes('SECRETVALUE123'), '令牌绝不能出现在任何输出里');
  assert.ok(!serialized.includes('__gmitm'), '整个 query 都该没了');
  assert.ok(serialized.includes('sem.proxy.example.com/analytics/overview'), '路径要留着，否则报告没用');
});

/* ── 杂项 ───────────────────────────────────────────────────────────── */

test('会话列表两种形状都收，脏条目被丢掉', () => {
  assert.deepEqual(normalizeSessions([{ session: 'a', url: 'u' }]).map((s) => s.session), ['a']);
  assert.deepEqual(normalizeSessions({ sessions: [{ name: 'b' }] }).map((s) => s.session), ['b']);
  assert.deepEqual(normalizeSessions(null), []);
  assert.deepEqual(normalizeSessions([{ url: 'no-name' }]), []);
});

test('atLimit 是 >=，不是 >', () => {
  assert.equal(atLimit(2, 3), false);
  assert.equal(atLimit(3, 3), true);
  assert.equal(atLimit(4, 3), true);
});

test('时长可读', () => {
  assert.equal(formatDuration(223_000), '3m43s');
  assert.equal(formatDuration(9_000), '9s');
  assert.equal(formatDuration(null), '0s');
});
