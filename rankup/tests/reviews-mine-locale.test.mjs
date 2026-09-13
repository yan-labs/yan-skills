// reviews-mine.mjs 的 country/lang 字段修复（2026-09-13 隐性缩小范围默认值审计）：
//
//   之前 appstore 分支把统一输出字段 `lang` 错误赋成 opt.country（应该是语言，
//   实际存的是国家/店面码），gplay 分支反过来完全不记录 country。两个源的
//   "这条评论来自哪个国家店面"字段互不一致，批量跑多国时没法用一个统一字段
//   group by。修复：appstore/gplay 都输出 {..., country, lang, ...}，country
//   是请求用的店面代码，lang 是真实语言（appstore 拿不到就是 null）。
//
// 纯离线：只测 mapAppstoreEntry / mapGplayRow 两个纯函数，不发请求、不碰浏览器。
// 模块本身有 isMain 守卫（同 footprint-discover.mjs 的模式），import 不会触发
// 参数解析或网络请求——见脚本头部注释与该守卫的注释。
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const rm = await import(path.join(here, '../scripts/demand/reviews-mine.mjs'));

test('mapAppstoreEntry：country 是店面代码，lang 固定 null（RSS 不返回评论语言）', () => {
  const entry = {
    'im:rating': { label: '1' },
    title: { label: 'Bad app' },
    content: { label: 'Does not work' },
    updated: { label: '2026-09-01T00:00:00-07:00' },
    author: { name: { label: 'someone' } },
    link: { attributes: { href: 'https://apps.apple.com/us/review/1' } },
  };
  const row = rm.mapAppstoreEntry(entry, { appId: '123456', country: 'jp' });
  assert.equal(row.source, 'appstore');
  assert.equal(row.target, '123456');
  assert.equal(row.rating, 1);
  assert.equal(row.country, 'jp');
  assert.equal(row.lang, null, 'appstore 分支必须不再把 country 误当 lang 塞进去');
});

test('mapGplayRow：country 与 lang 分别来自 --country / --lang，两者独立', () => {
  // Google Play batchexecute 的评论行是数字下标数组；这里只填测试用到的下标。
  const r = [];
  r[1] = ['author-name'];
  r[2] = 4; // rating
  r[4] = 'review text';
  r[5] = [1735689600]; // epoch seconds
  r[6] = 3; // thumbsUp
  const row = rm.mapGplayRow(r, { target: 'com.example.app', lang: 'ja', country: 'jp' });
  assert.equal(row.source, 'gplay');
  assert.equal(row.target, 'com.example.app');
  assert.equal(row.rating, 4);
  assert.equal(row.country, 'jp', 'gplay 分支此前完全不记录 country，必须补上');
  assert.equal(row.lang, 'ja');
  assert.equal(row.thumbsUp, 3);
});

test('两源字段一致：mapAppstoreEntry 与 mapGplayRow 的返回对象都同时带 country 和 lang 键', () => {
  const a = rm.mapAppstoreEntry(
    { 'im:rating': { label: '2' }, title: {}, content: {}, updated: {}, author: {}, link: {} },
    { appId: 'x', country: 'de' },
  );
  const g = rm.mapGplayRow([null, null, 2], { target: 'x', lang: 'de', country: 'de' });
  for (const key of ['country', 'lang']) {
    assert.ok(key in a, `mapAppstoreEntry 缺 ${key}`);
    assert.ok(key in g, `mapGplayRow 缺 ${key}`);
  }
});
