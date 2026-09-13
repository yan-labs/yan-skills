// seo-webcafe.mjs 的 kd 口径标注（2026-09-13 隐性缩小范围默认值审计的修复）：
//
//   kd 命令按 gl（国家）/hl（语言）分库取难度/搜索量，两者都默认 us/en——和
//   Semrush 的 --db 是同一类风险：查错市场不报错，只是静默换成另一国的量。
//   这里只测两处纯函数契约，不发任何网络请求：
//     1. TOOLS.kd.query() 的默认值 us/en，以及显式传参时正确透传；
//     2. summarize('kd', data, meta) 的文本摘要必须带上 gl=xx hl=xx（markdown
//        报告分支和数值分支都要带，不能只有一个分支有）。
//
// 纯离线：只 import 脚本模块拿函数，不触发 main()（脚本自己用
// `process.argv[1] === realpathSync(...)` 守卫，import 不会执行到那一支）。
import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const wc = await import(path.join(here, '../scripts/seo-webcafe.mjs'));

test('TOOLS.kd.query：gl/hl 默认 us/en', () => {
  const q = wc.TOOLS.kd.query({ keyword: 'clipboard history' });
  assert.equal(q.gl, 'us');
  assert.equal(q.hl, 'en');
});

test('TOOLS.kd.query：显式传参正确透传，不被默认值覆盖', () => {
  const q = wc.TOOLS.kd.query({ keyword: 'クリップボード 履歴', gl: 'jp', hl: 'ja' });
  assert.equal(q.gl, 'jp');
  assert.equal(q.hl, 'ja');
});

test('summarize(kd, 数值分支)：文本摘要带 gl=xx hl=xx', () => {
  const data = {
    score: 42,
    level: '中等',
    keywordVolume: 1000,
    keywordType: 'generic',
    details: [],
  };
  const text = wc.summarize('kd', data, { gl: 'jp', hl: 'ja' });
  assert.ok(text.includes('gl=jp hl=ja'), `expected locale tag in: ${text}`);
  assert.ok(text.includes('KD 42'), `expected KD score in: ${text}`);
});

test('summarize(kd, markdown 分支)：文本摘要同样带 gl=xx hl=xx', () => {
  const data = { markdown: '# report\n'.repeat(5) };
  const text = wc.summarize('kd', data, { gl: 'us', hl: 'en' });
  assert.ok(text.includes('gl=us hl=en'), `expected locale tag in: ${text}`);
  assert.ok(/Markdown 报告/.test(text));
});

test('summarize(kd, 缺 meta 时)：不报错，用占位符标出「口径未知」而不是假装是 us/en', () => {
  const data = { score: 1, level: '低', keywordVolume: null, details: [] };
  const text = wc.summarize('kd', data);
  assert.ok(text.includes('gl=? hl=?'), `expected unknown-locale placeholder in: ${text}`);
});

test('summarize(其它命令)：不受 kd 分支改动影响', () => {
  const text = wc.summarize('referringMonth', { month: '202601', rows: [], total: { visits: 0 } });
  assert.ok(text.includes('202601'));
});
