/**
 * lib-tools-share.mjs 的 dedicated 窗口相关改动（2026-09-14）——离线测试。
 *
 * `launchToolInner` 本身不导出（会真的起 opencli 子进程，这里不允许，也不该允许：
 * 另一个 checker 正在用真实 opencli 复核这条路径），所以把它的 env 组装抽成纯函数
 * `buildToolLaunchEnv` 直接断言，不用起子进程就能钉住"dedicated 的 slot/display
 * 只在 automationWindow 真正走了 dedicated 策略时才出现"这条规则。
 *
 * `reuseDecision` 是另一半：dedicated 和 foreground/active 同属"调用方明确要可见"，
 * hidden 时必须触发 relaunch，不能被 background/isolated 那条"不要求可见"的分支放过。
 * `tools-share-reuse-visibility.test.mjs` 已经覆盖了 foreground/active/background/
 * isolated 四档，这里只补 dedicated 这一档，不重复其余场景。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import {
  buildToolLaunchEnv, reuseDecision,
} from '../scripts/lib-tools-share.mjs';

const ORIGIN = 'sem.3ue.co';
const URL_ON_TOOL = `https://${ORIGIN}/analytics/traffic/top-pages/?q=example.com`;

test('buildToolLaunchEnv: no opencliEnv (legacy path) → the one line unchanged from before dedicated existed', () => {
  assert.deepEqual(buildToolLaunchEnv('background'), { OPENCLI_WINDOW: 'background' });
  assert.deepEqual(buildToolLaunchEnv('foreground'), { OPENCLI_WINDOW: 'foreground' });
  assert.deepEqual(buildToolLaunchEnv('typo'), { OPENCLI_WINDOW: 'background' }, 'unrecognised value still falls back to background');
  assert.deepEqual(buildToolLaunchEnv('background', {}), { OPENCLI_WINDOW: 'background' }, 'an explicit empty opencliEnv is the same as omitting it');
});

test('buildToolLaunchEnv: dedicated opencliEnv (from automationWindow.opencliEnv) is merged in, slot/display included', () => {
  const opencliEnv = { OPENCLI_WINDOW: 'dedicated', OPENCLI_WINDOW_SLOT: 'semrush-nav', OPENCLI_WINDOW_DISPLAY: '/虚拟|virtual/i' };
  assert.deepEqual(buildToolLaunchEnv('dedicated', opencliEnv), {
    OPENCLI_WINDOW: 'dedicated',
    OPENCLI_WINDOW_SLOT: 'semrush-nav',
    OPENCLI_WINDOW_DISPLAY: '/虚拟|virtual/i',
  });
});

test('buildToolLaunchEnv: normalizeWindowMode now accepts dedicated as a real fifth mode', () => {
  assert.equal(buildToolLaunchEnv('dedicated').OPENCLI_WINDOW, 'dedicated');
});

function fakeSession({ vis = 'visible', url = URL_ON_TOOL, bodyText = 'x'.repeat(400) } = {}) {
  return { url, title: 'Traffic Analytics', vis, len: bodyText.length, bodyText };
}

// 2026-09-14：dedicated 跟 foreground/active 同一档"要可见"；hidden 时必须 relaunch，
// 不能被当成 background/isolated 那种"不要求可见"悄悄放过去——dedicated 窗口默认开着
// auto-select，复用探针读到 hidden 说明这次复用不会真的可见。
test('reuseDecision: hidden tab + dedicated → refuse reuse, same relaunch branch as foreground/active', () => {
  const got = reuseDecision(fakeSession({ vis: 'hidden' }), { origin: ORIGIN, windowMode: 'dedicated' });
  assert.equal(got.reuse, false);
  assert.equal(got.relaunch, true);
  assert.equal(got.reason, 'hidden-tab');
});

test('reuseDecision: visible tab + dedicated → reuse normally', () => {
  const got = reuseDecision(fakeSession({ vis: 'visible' }), { origin: ORIGIN, windowMode: 'dedicated' });
  assert.equal(got.reuse, true);
  assert.equal(got.relaunch, false);
});

test('reuseDecision: dedicated is on the same side of the table as foreground/active, not background/isolated', () => {
  const hidden = (windowMode) => reuseDecision(fakeSession({ vis: 'hidden' }), { origin: ORIGIN, windowMode }).reuse;
  assert.equal(hidden('dedicated'), hidden('foreground'));
  assert.equal(hidden('dedicated'), hidden('active'));
  assert.notEqual(hidden('dedicated'), hidden('background'));
  assert.notEqual(hidden('dedicated'), hidden('isolated'));
});
