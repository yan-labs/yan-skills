/**
 * detectDegradation 的纯函数测试——不碰浏览器，可以随时跑。
 *   node --test opencli/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { detectDegradation } from '../scripts/opencli-core.mjs';

test('semrush 降级渲染：state.undefined + 指标全 n/a 一起出现才命中', () => {
  const text = 'Dashboards\nOrganic traffic: n/a\nPaid traffic: n/a\nBacklinks: n/a\nstate.undefined';
  const verdict = detectDegradation(text, { url: 'https://sem.3ue.co/analytics/overview/' });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'degraded-render');
  assert.ok(verdict.evidence.some((e) => e.includes('state.undefined')));
  assert.ok(verdict.evidence.some((e) => e.includes('n/a')));
});

test('semrush 页面只有零星 n/a、没有泄露的 i18n key，不算降级', () => {
  const text = 'Dashboards\nOrganic traffic: 12,345\nCompetitor rank: n/a\nBacklinks: 8,201';
  const verdict = detectDegradation(text, { url: 'https://sem.3ue.co/analytics/overview/' });
  assert.equal(verdict.degraded, false);
  assert.equal(verdict.kind, null);
});

test('配额站上出现原生 dialog 判定为设备上限，命中已知措辞时证据里说明', () => {
  const verdict = detectDegradation('Dashboards', {
    url: 'https://sim.3ue.co/#/digitalsuite',
    dialogText: 'You have reached the maximum number of devices for this account.',
  });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'device-limit');
  assert.ok(verdict.evidence.some((e) => e.includes('已知的设备上限措辞')));
});

test('配额站上出现未知措辞的 dialog 依然按设备上限判定，但证据里说明未命中已知列表', () => {
  const verdict = detectDegradation('Dashboards', {
    url: 'https://sem.3ue.co/analytics/overview/',
    dialogText: '这是一个从没见过的弹窗文案',
  });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'device-limit');
  assert.ok(verdict.evidence.some((e) => e.includes('未命中已知列表')));
});

test('非配额站上的 dialog 不判定为设备上限——alert/confirm 在普通站太常见', () => {
  const verdict = detectDegradation('Some page', {
    url: 'https://example.com/',
    dialogText: 'Are you sure you want to leave this page?',
  });
  assert.equal(verdict.degraded, false);
});

test('通用限流短语命中，任意站点都适用', () => {
  const verdict = detectDegradation("Sorry, you've reached your daily limit. Please upgrade.", {
    url: 'https://example.com/report',
  });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'rate-limit');
});

test('反例：正文里出现 limit 一词，但不是限流提示，不应误判', () => {
  const text = 'There is no limit to how many links you can add to this board. '
    + 'Set a spending limit in your account settings if you want to control costs.';
  const verdict = detectDegradation(text, { url: 'https://example.com/help' });
  assert.equal(verdict.degraded, false, 'bare "limit" 不该触发限流判据');
});

test('通用登录态失效短语命中', () => {
  const verdict = detectDegradation('Your session has expired. Please sign in to continue.', {
    url: 'https://example.com/dashboard',
  });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'auth');
});

test('正常页面（无任何信号）不命中任何一类', () => {
  const verdict = detectDegradation('Welcome back! Here is your weekly report with 12 new backlinks.', {
    url: 'https://sem.3ue.co/analytics/overview/',
  });
  assert.deepEqual(verdict, { degraded: false, kind: null, evidence: [] });
});

test('优先级：同时命中 dialog 和限流短语时，device-limit 排在 rate-limit 前面', () => {
  const verdict = detectDegradation("you've reached your daily limit", {
    url: 'https://sem.3ue.co/analytics/overview/',
    dialogText: 'maximum number of devices reached',
  });
  assert.equal(verdict.kind, 'device-limit');
});

test('siteKey 可以直接传，不必依赖 url', () => {
  const text = 'Dashboards n/a n/a n/a state.undefined';
  const verdict = detectDegradation(text, { siteKey: 'semrush' });
  assert.equal(verdict.degraded, true);
  assert.equal(verdict.kind, 'degraded-render');
});
