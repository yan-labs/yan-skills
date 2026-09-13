/**
 * 复用快路径的可见性闸门。
 *
 * 堵的失败形态（2026-08-28 同路由控制对比坐实）：`launchTool` 有一条「已经落在
 * 工具页就原地复用」的快路径，它**不点面板卡片**，因此不把 Chrome 抬到前台。
 * 标签页停在 `document.visibilityState === "hidden"`，之后页内导航出来的报表
 * 永远卡在半水合——结构齐全、值全空（850 个非空单元格 → 0 个）。
 * 于是 `semrush-traffic.mjs` 的 `DEFAULT_WINDOW = 'foreground'` 被静默绕过。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { REUSE_PROBE, attemptToolSessionReuse, reuseDecision } from '../scripts/lib-tools-share.mjs';

const ORIGIN = 'sem.3ue.co';
const URL_ON_TOOL = `https://${ORIGIN}/analytics/traffic/top-pages/?q=example.com`;

function fakeSession({ vis = 'visible', url = URL_ON_TOOL, bodyText = 'x'.repeat(400), throws = null } = {}) {
  const calls = { eval: [], close: 0 };
  return {
    calls,
    evalPage: async (script) => {
      calls.eval.push(script);
      if (throws) throw throws;
      return { url, title: 'Traffic Analytics', vis, len: bodyText.length, bodyText };
    },
    closeSession: async () => { calls.close += 1; },
  };
}

test('the reuse probe reads visibilityState in the SAME eval as url/len', () => {
  // 判可见性不许多花一个 round-trip，否则「探测再决定」就不比「禁用复用」划算了。
  assert.match(REUSE_PROBE, /document\.visibilityState/);
  assert.match(REUSE_PROBE, /location\.href/);
  assert.equal(REUSE_PROBE.split('location.href').length, 2, 'probe must stay a single eval');
});

test('hidden tab + caller asked foreground: refuse reuse, close so the full launch re-clicks the card', async () => {
  const s = fakeSession({ vis: 'hidden' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' });
  assert.equal(got.reused, false);
  assert.equal(got.closed, true);
  assert.equal(got.reason, 'hidden-tab');
  assert.equal(s.calls.close, 1);
});

test('visible tab: reuse normally, and do NOT spend a close', async () => {
  const s = fakeSession({ vis: 'visible' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' });
  assert.equal(got.reused, true);
  assert.equal(got.closed, false);
  assert.equal(s.calls.close, 0);
  assert.equal(s.calls.eval.length, 1);
});

test('background callers keep the old behaviour — a hidden tab is what they asked for', async () => {
  // background-by-default 那条法则不能被这条修复推翻：不能让每个脚本都去抢机主的窗口。
  const s = fakeSession({ vis: 'hidden' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'background' });
  assert.equal(got.reused, true);
  assert.equal(s.calls.close, 0);
});

// 2026-09-14：`active` 是"要可见/不节流，但不夺 OS 焦点"——跟 foreground 一样
// 属于"调用方明确要可见"，hidden 时必须触发同一条 relaunch 分支，不能被当成
// background 悄悄放过去。
test('hidden tab + caller asked active: refuse reuse, close so the full launch re-selects the tab', async () => {
  const s = fakeSession({ vis: 'hidden' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'active' });
  assert.equal(got.reused, false);
  assert.equal(got.closed, true);
  assert.equal(got.reason, 'hidden-tab');
  assert.equal(s.calls.close, 1);
});

test('visible tab + caller asked active: reuse normally', async () => {
  const s = fakeSession({ vis: 'visible' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'active' });
  assert.equal(got.reused, true);
  assert.equal(got.closed, false);
  assert.equal(s.calls.close, 0);
});

// isolated 跟 background 一样是"不要可见"的显式请求，hidden 不该触发 relaunch。
test('isolated callers keep the old (background-like) behaviour', async () => {
  const s = fakeSession({ vis: 'hidden' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'isolated' });
  assert.equal(got.reused, true);
  assert.equal(s.calls.close, 0);
});

test('restarts are bounded: one probe, at most one close per attempt, no self-recursion', async () => {
  const s = fakeSession({ vis: 'hidden' });
  for (let i = 0; i < 5; i += 1) {
    await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' });
  }
  // 5 次显式调用 = 5 次探测 + 5 次 close。函数自己一次都没有重入。
  assert.equal(s.calls.eval.length, 5);
  assert.equal(s.calls.close, 5);
});

test('a session parked off the tool origin still falls through to the full launch, without a close', async () => {
  const s = fakeSession({ url: 'https://dash.3ue.co/zh-Hans/#/page/m/home' });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' });
  assert.equal(got.reused, false);
  assert.equal(got.closed, false);
  assert.equal(got.reason, 'not-on-tool-origin');
  assert.equal(s.calls.close, 0);
});

test('no session at all: fall through to the full launch path unchanged', async () => {
  const s = fakeSession({ throws: new Error('No active session named tools-share-semrush') });
  const got = await attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' });
  assert.equal(got.reused, false);
  assert.equal(got.closed, false);
  assert.equal(got.reason, 'no-session');
});

test('a blocked panel still throws instead of being read as "just relaunch"', async () => {
  const blocked = new Error('shared proxy blocked');
  blocked.code = 'TOOLS_SHARE_BLOCKED';
  const s = fakeSession({ throws: blocked });
  await assert.rejects(() => attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' }));
});

test('an unexpected eval error is not swallowed', async () => {
  const s = fakeSession({ throws: new Error('opencli daemon died') });
  await assert.rejects(() => attemptToolSessionReuse({ ...s, origin: ORIGIN, windowMode: 'foreground' }));
});

test('reuseDecision is the whole rule, in one table', () => {
  const cap = (vis) => ({ url: URL_ON_TOOL, vis, bodyText: 'x'.repeat(400) });
  assert.equal(reuseDecision(cap('hidden'), { origin: ORIGIN, windowMode: 'foreground' }).reuse, false);
  assert.equal(reuseDecision(cap('visible'), { origin: ORIGIN, windowMode: 'foreground' }).reuse, true);
  assert.equal(reuseDecision(cap('hidden'), { origin: ORIGIN, windowMode: 'background' }).reuse, true);
  // active 跟 foreground 同一档「要可见」；isolated 跟 background 同一档「不要求可见」。
  assert.equal(reuseDecision(cap('hidden'), { origin: ORIGIN, windowMode: 'active' }).reuse, false);
  assert.equal(reuseDecision(cap('visible'), { origin: ORIGIN, windowMode: 'active' }).reuse, true);
  assert.equal(reuseDecision(cap('hidden'), { origin: ORIGIN, windowMode: 'isolated' }).reuse, true);
  // vis 缺失（老的探针、或页面没交回来）不当 hidden 处理：宁可复用，也不要凭空多一次 launch。
  assert.equal(reuseDecision(cap(undefined), { origin: ORIGIN, windowMode: 'foreground' }).reuse, true);
});
