/**
 * semrush-overview.mjs 的窗口模式与 OS 级抬前台节流器——2026-09-14 新增。
 *
 * 背景：`--activate-chrome false` 和 `--window` 曾经是两个互相不知道对方存在的
 * 开关——`--activate-chrome false` 只关掉脚本侧独立的 `open -a "Google Chrome"`
 * 调用，但脚本自带 `DEFAULT_WINDOW = 'foreground'`，仍然会向 opencli 请求
 * foreground（raise + select，本身就是一种 OS 级抢焦点），默认开着时一次真实
 * 运行会 `open -a` 31~32 次。这里钉住修复之后的行为：
 *   - opencli 窗口模式默认改成 `active`（选中标签页、不节流，不夺 OS 焦点）；
 *   - `--activate-chrome false` 时，即使显式要 foreground 也要降级成 active；
 *   - OS 级 `open -a` 有次数上限（默认 3），且 activate-chrome=false 时恒为 0 次。
 *
 * 两个函数都住在 lib-semrush-overview.mjs（纯逻辑层，不碰浏览器）——理由见该文件
 * 里它们旁边的注释：semrush-overview.mjs 自己的顶层是直接执行、缺 --domain 就
 * throw 的脚本体，import 它做单测会连带跑起整段启动流程。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { createChromeActivator, DEFAULT_WINDOW, resolveOverviewWindowMode } from '../scripts/lib-semrush-overview.mjs';

test('DEFAULT_WINDOW is active, not foreground', () => {
  assert.equal(DEFAULT_WINDOW, 'active');
});

test('resolveOverviewWindowMode: no --window, activate-chrome default(true) → active', () => {
  const r = resolveOverviewWindowMode({ windowFlag: null, activateChrome: true });
  assert.deepEqual(r, { windowMode: 'active', downgraded: false });
});

test('resolveOverviewWindowMode: no --window, activate-chrome false → still active (nothing to downgrade)', () => {
  const r = resolveOverviewWindowMode({ windowFlag: null, activateChrome: false });
  assert.deepEqual(r, { windowMode: 'active', downgraded: false });
});

test('resolveOverviewWindowMode: explicit --window active/background/isolated always pass through unchanged', () => {
  for (const mode of ['active', 'background', 'isolated']) {
    assert.deepEqual(resolveOverviewWindowMode({ windowFlag: mode, activateChrome: true }), { windowMode: mode, downgraded: false });
    assert.deepEqual(resolveOverviewWindowMode({ windowFlag: mode, activateChrome: false }), { windowMode: mode, downgraded: false });
  }
});

test('resolveOverviewWindowMode: explicit --window foreground + activate-chrome true → foreground, unchanged', () => {
  assert.deepEqual(
    resolveOverviewWindowMode({ windowFlag: 'foreground', activateChrome: true }),
    { windowMode: 'foreground', downgraded: false },
  );
});

test('resolveOverviewWindowMode: explicit --window foreground + activate-chrome false → downgraded to active', () => {
  // 核心行为：activate-chrome false 的承诺是"这次运行不会有任何 OS 级抢焦点"，
  // opencli 的 foreground 本身就是 raise + select，不能被这个开关绕过去。
  assert.deepEqual(
    resolveOverviewWindowMode({ windowFlag: 'foreground', activateChrome: false }),
    { windowMode: 'active', downgraded: true },
  );
});

function fakeActivator(overrides = {}) {
  const calls = [];
  let tick = 0;
  const activator = createChromeActivator({
    enabled: true,
    maxActivations: 3,
    activate: async () => { calls.push('activate'); },
    now: () => `t${tick += 1}`,
    ...overrides,
  });
  return { activator, calls };
}

test('createChromeActivator: activate-chrome=false never calls activate, 0 activations', async () => {
  const calls = [];
  const { state, bringChromeForward } = createChromeActivator({ enabled: false, maxActivations: 3, activate: async () => { calls.push('activate'); } });
  await bringChromeForward('before-report-navigation');
  await bringChromeForward('hidden-read');
  await bringChromeForward('hidden-read');
  assert.equal(calls.length, 0);
  assert.equal(state.activations, 0);
  assert.equal(state.activationCapReached, false);
  assert.equal(state.hint, null);
});

test('createChromeActivator: records one log entry per activation with timestamp + reason', async () => {
  const { activator, calls } = fakeActivator();
  await activator.bringChromeForward('before-report-navigation');
  await activator.bringChromeForward('hidden-read');
  assert.equal(calls.length, 2);
  assert.equal(activator.state.activations, 2);
  assert.deepEqual(activator.state.activationLog, [
    { at: 't1', reason: 'before-report-navigation' },
    { at: 't2', reason: 'hidden-read' },
  ]);
});

test('createChromeActivator: the activation cap is enforced (default cap here is 3)', async () => {
  const { activator, calls } = fakeActivator();
  await activator.bringChromeForward('before-report-navigation'); // 1
  await activator.bringChromeForward('hidden-read'); // 2
  await activator.bringChromeForward('hidden-read'); // 3 — hits the cap
  await activator.bringChromeForward('hidden-read'); // over cap, must not call activate again
  await activator.bringChromeForward('hidden-read'); // still over cap
  assert.equal(calls.length, 3, 'activate() must not be called beyond the cap');
  assert.equal(activator.state.activations, 3);
  assert.equal(activator.state.activationCapReached, true);
  assert.match(activator.state.hint, /激活上限.*3 次/);
  assert.match(activator.state.hint, /保持.*可见/);
});

test('createChromeActivator: the cap-reached hint is recorded only once, not once per subsequent call', async () => {
  const { activator } = fakeActivator();
  for (let i = 0; i < 6; i += 1) await activator.bringChromeForward('hidden-read');
  // hint is a single string, not an array that would grow — assert it stayed set and activations froze at the cap.
  assert.equal(activator.state.activations, 3);
  const firstHint = activator.state.hint;
  await activator.bringChromeForward('hidden-read');
  assert.equal(activator.state.hint, firstHint);
});

test('createChromeActivator: --max-activations is configurable (0 disables OS-level activation entirely while enabled stays true)', async () => {
  const { activator, calls } = fakeActivator({ maxActivations: 0 });
  await activator.bringChromeForward('before-report-navigation');
  assert.equal(calls.length, 0);
  assert.equal(activator.state.activationCapReached, true);
});

test('createChromeActivator: a failed activate() is recorded as an error, not thrown, and does not consume the cap silently wrong', async () => {
  const { activator } = fakeActivator({ activate: async () => { throw new Error('open failed: no such app'); } });
  await activator.bringChromeForward('before-report-navigation');
  assert.equal(activator.state.activations, 0, 'a failed activation must not count as a successful one');
  assert.equal(activator.state.errors.length, 1);
  assert.match(activator.state.errors[0], /before-report-navigation: open failed/);
});
