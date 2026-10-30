import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { parseRelativeTime, stripTracking, TAAFT_TOOLS_EXTRACT } from '../scripts/demand/boards.mjs';
import { regDomain } from '../scripts/demand/_chatgpt_web.mjs';
import { extractCoreTerm, clusterLaunches, compareClusters, mergeLaunches, normalizeLaunch } from '../scripts/demand/new-launches.mjs';

const now = '2026-10-30T12:00:00.000Z';
const site = (rootDomain, name = 'AI Mashup Maker', extra = {}) => ({ rootDomain, name, source: 'taaft', sources: ['taaft'], ...extra });

test('相对时间按抓取时刻估算，月按30天，未知不伪造', () => {
  assert.equal(parseRelativeTime('15h ago', now), '2026-10-29T21:00:00.000Z');
  assert.equal(parseRelativeTime('Released 3d ago', now), '2026-10-27T12:00:00.000Z');
  assert.equal(parseRelativeTime('2mo ago', now), '2026-08-31T12:00:00.000Z');
  assert.equal(parseRelativeTime('1 week ago', now), '2026-10-23T12:00:00.000Z');
  assert.equal(parseRelativeTime(null, now), null);
  assert.equal(parseRelativeTime('unknown', now), null);
});

test('清理追踪参数，保留功能参数；根域沿用既有规则', () => {
  assert.equal(stripTracking('https://app.example.co.uk/make?ref=taaft&utm_source=x&UTM_campaign=y&mode=rap'), 'https://app.example.co.uk/make?mode=rap');
  assert.equal(regDomain('https://app.example.co.uk/make'), 'example.co.uk');
  assert.equal(regDomain('https://demo.pages.dev'), 'demo.pages.dev');
});

test('工具词抽取：品牌分隔、虚词、标点、单复数、task与tagline', () => {
  assert.equal(extractCoreTerm({ name: 'Kiravu | AI Rap Video Generator' }), 'rap video generator');
  assert.equal(extractCoreTerm({ name: 'Free Online Mashup Makers' }), 'mashup maker');
  assert.equal(extractCoreTerm({ name: 'Brand', task: 'Photos Enhancers' }), 'photo enhancer');
  assert.equal(extractCoreTerm({ name: 'Brand', tagline: 'The AI Background Remover for your images.' }), 'background remover');
  assert.equal(extractCoreTerm({ name: 'MashupMaker' }), 'mashup maker');
  assert.equal(extractCoreTerm({ name: 'Rap Video Generator Online' }), 'rap video generator');
  assert.equal(extractCoreTerm({ name: 'Vidu AI Video Generator' }), 'video generator');
  assert.equal(extractCoreTerm({ name: 'FreyaVideo - Image to Video AI Generator' }), 'image video generator');
  assert.equal(extractCoreTerm({ name: 'Yovid – Seedance 2.5 AI Video Generator' }), 'video generator');
  assert.equal(extractCoreTerm({ name: 'Designkit Free Background Remover' }), 'background remover');
  assert.equal(extractCoreTerm({ name: 'Chat with friends' }), null);
  assert.equal(extractCoreTerm({ name: 'AI generator' }), null);
});

test('同词按不同根域计数，跨来源不重数；合并保留指标', () => {
  const rows = [site('one.test', undefined, { saves: 5 }), site('one.test', undefined, { source: 'toolify', sources: ['toolify'], monthlyVisits: 100 }), site('two.test', 'Mashup Makers')];
  const [cluster] = clusterLaunches(rows);
  assert.equal(cluster.term, 'mashup maker');
  assert.equal(cluster.domainCount, 2);
  assert.deepEqual(cluster.sites[0].sources, ['taaft', 'toolify']);
  const merged = mergeLaunches(rows);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].monthlyVisits, 100);
  assert.equal(merged[0].saves, 5);
});

test('28天累计、本周新增、首次观察与1→多：不用发布日期冒充观察日期', () => {
  const history = [
    { fetchedAt: '2026-09-01T12:00:00.000Z', rows: [site('expired.test')] },
    { fetchedAt: '2026-10-20T12:00:00.000Z', rows: [site('one.test')] },
    { fetchedAt: '2026-10-28T12:00:00.000Z', rows: [site('one.test'), site('two.test')] },
  ];
  const [c] = compareClusters([site('one.test'), site('two.test'), site('three.test')], history, now);
  assert.equal(c.totalDomains28d, 3);
  assert.equal(c.newDomainsThisWeek, 2);
  assert.equal(c.firstSeen, '2026-10-20');
  assert.equal(c.becameMultiThisWeek, true);
  assert.equal(c.isNewTerm, false);
  const [first] = compareClusters([site('one.test')], [], now);
  assert.equal(first.becameMultiThisWeek, false);
  assert.equal(first.isNewTerm, true);
  const [sameDay] = compareClusters([site('one.test')], [{ fetchedAt: now, rows: [site('one.test')] }], now);
  assert.equal(sameDay.isNewTerm, false);
  assert.equal(sameDay.newDomainsThisWeek, 1);
  const [preserved] = compareClusters([site('one.test', 'Photo Editor')], [{
    fetchedAt: '2026-10-20T12:00:00.000Z', rows: [site('one.test')],
    rawRows: [site('one.test'), site('one.test', 'Photo Editor')],
  }], now);
  assert.equal(preserved.firstSeen, '2026-10-20', '同域多个产品的词从原始行保留');
  assert.equal(preserved.isNewTerm, false);
});

test('未知发布时间、定价保留null，抓取日不冒充发布日期', () => {
  const row = normalizeLaunch({ source: 'toolify:new', name: 'Example', url: 'https://example.test?ref=toolify', domain: 'example.test', date: '2026-10-30', metricLabel: 'monthly visits', metric: 100, extra: {} }, now);
  assert.equal(row.releasedAt, null);
  assert.equal(row.pricing, null);
  assert.equal(row.monthlyVisits, 100);
  assert.equal(row.observedAt, now);
});


test('TAAFT 提取发布时间，定价不误取 Trending 标签', () => {
  const attrs = { 'data-id': '123', 'data-name': 'Example', 'data-url': 'https://example.test' };
  const li = { getAttribute: k => attrs[k] ?? null,
    querySelector: () => null,
    querySelectorAll: selector => selector === '.relative'
      ? [{ innerText: '15h ago', previousElementSibling: { innerText: 'Released' } }]
      : selector === '.ai_launch_date' ? [{ innerText: '#4 in Trending' }, { innerText: 'Free + from $9/mo' }] : [] };
  const res = vm.runInNewContext(TAAFT_TOOLS_EXTRACT, { document: { querySelectorAll: () => [li] } });
  assert.equal(res.rows[0].id, '123');
  assert.equal(res.rows[0].released, '15h ago');
  assert.equal(res.rows[0].pricing, 'Free + from $9/mo');
});
