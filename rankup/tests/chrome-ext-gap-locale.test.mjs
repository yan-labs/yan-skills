// chrome-ext-gap.mjs 的 gl/reviewLang 显式字段（2026-09-13 隐性缩小范围默认值
// 审计）：Chrome Web Store 分类/搜索/详情请求都带 hl(reviewLang)+gl，之前只
// 出现在请求 URL 里，产出记录看不出这批数据是哪个地区/语言抓的。
//
// 纯离线：只测 toRecord（位置数组 → 统一输出行的纯函数），不发请求。模块本身
// 有 isMain 守卫（同 footprint-discover.mjs 的模式），import 不会触发
// parseArgs/main()。
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ceg = await import(path.join(here, '../scripts/demand/chrome-ext-gap.mjs'));

test('toRecord：gl/reviewLang 从 opts 透传进记录', () => {
  // a 是位置数组：[0]=id, [2]=name, [3]=rating, [4]=ratingCount, [6]=summary, [7]=website
  const a = ['abcdefghijklmnopabcdefghijklmnop', null, 'Example Extension', 4.2, 1234, null, 'a summary', 'https://example.com'];
  const rec = ceg.toRecord(a, { gl: 'JP', reviewLang: 'ja', raw: false });
  assert.equal(rec.name, 'Example Extension');
  assert.equal(rec.rating, 4.2);
  assert.equal(rec.ratingCount, 1234);
  assert.equal(rec.gl, 'JP', 'gl 必须是显式字段');
  assert.equal(rec.reviewLang, 'ja', 'reviewLang 必须是显式字段');
});

test('toRecord：默认口径（gl=US, reviewLang=en）同样落进记录，不是只有非默认值才带', () => {
  const a = ['abcdefghijklmnopabcdefghijklmnop', null, 'Another Ext', 3.9, 500];
  const rec = ceg.toRecord(a, { gl: 'US', reviewLang: 'en', raw: false });
  assert.equal(rec.gl, 'US');
  assert.equal(rec.reviewLang, 'en');
});

test('toRecord：--raw 时原始位置数组仍然保留在 extra.raw（本次改动不影响这个既有行为）', () => {
  const a = ['abcdefghijklmnopabcdefghijklmnop', null, 'Ext', 4.0, 10];
  const rec = ceg.toRecord(a, { gl: 'US', reviewLang: 'en', raw: true });
  assert.deepEqual(rec.extra.raw, a);
});
