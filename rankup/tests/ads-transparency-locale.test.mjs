// ads-transparency.mjs 的 region/regionCode 显式字段（2026-09-13 隐性缩小范围
// 默认值审计）：
//
//   creatives 命令的每条记录和 meta 之前只在 url 字符串的查询参数里带地区
//   信息，机读要解析 URL 才拿得到口径；现在显式落成 region/regionCode 两个
//   字段。这里只测 mapCreativeRow / buildCreativesMeta 两个纯函数，不发
//   任何网络请求（广告透明度中心是逆向的内部 RPC，不进 CI 联网测试）。
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const at = await import(path.join(here, '../scripts/demand/ads-transparency.mjs'));

test('mapCreativeRow：region/regionCode 显式落字段，不用解析 url 查询参数', () => {
  const now = 1735689600; // 2025-01-01T00:00:00Z，秒
  const c = {
    1: 'AR123', 12: 'Example Advertiser', 2: 'CR456', 14: 'example.com',
    4: 2, // video
    6: { 1: String(now - 30 * 86400) }, // firstShown 30 天前
    7: { 1: String(now) }, // lastShown 今天
    3: { 1: { 4: 'https://preview.example/x' }, 3: { 2: '<div>ad</div>' } },
  };
  const row = at.mapCreativeRow(c, { now, region: 'JP', regionCode: 2392 });
  assert.equal(row.advertiserId, 'AR123');
  assert.equal(row.domain, 'example.com');
  assert.equal(row.format, 'video');
  assert.equal(row.daysRunning, 30);
  assert.equal(row.region, 'JP', 'region 必须是显式字段，不能只藏在 url 里');
  assert.equal(row.regionCode, 2392);
  assert.ok(row.url.includes('region=JP'));
});

test('mapCreativeRow：字段缺失时优雅降级为 null，不抛错', () => {
  const row = at.mapCreativeRow({}, { now: 0, region: 'US', regionCode: 2840 });
  assert.equal(row.advertiserId, null);
  assert.equal(row.url, null);
  assert.equal(row.region, 'US');
  assert.equal(row.regionCode, 2840);
});

test('buildCreativesMeta：带 region/regionCode，并保留 totalAdsMin/Max 区间估计的既有语义', () => {
  const meta = at.buildCreativesMeta({ 4: '600', 5: '700' }, { region: 'DE', regionCode: 2276 });
  assert.equal(meta.region, 'DE');
  assert.equal(meta.regionCode, 2276);
  assert.equal(meta.totalAdsMin, 600);
  assert.equal(meta.totalAdsMax, 700);
  assert.ok(/区间估计/.test(meta.note));
});

test('buildCreativesMeta：totalAdsMin/Max 缺失时为 null（不是 0，不是「确定没有」）', () => {
  const meta = at.buildCreativesMeta({}, { region: 'US', regionCode: 2840 });
  assert.equal(meta.totalAdsMin, null);
  assert.equal(meta.totalAdsMax, null);
});
