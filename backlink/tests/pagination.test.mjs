/**
 * pagination.test.mjs — 大表翻页批采的纯函数层。
 *
 * 断言全部对着**实测过的真实文本**写，不是想象出来的形状：
 * `Prev Next Page: of 1,430 Page: 1` 这一段是 2026-08-29 从 canva.com 的
 * top-pages census（`evidence/ground-truth/semrush-top-pages-canva/census-s5.json`
 * 的 deepText 尾部）里原样抠出来的；`1 - 100 (~50,988)` 来自 harvest.md 记的
 * Semrush backlinks 分页硬顶那一节。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_MAX_PAGES, HARD_MAX_PAGES, applyPageResult, classifyPagination,
  clusterCellsByY, dedupeRows, donePages, findUrlPageParam, loadCheckpoint,
  newCheckpoint, pageFingerprint, pagesRemaining, parseCount, parsePager,
  planPages, verifyRowCount,
} from '../scripts/lib-pagination.mjs';
import { buildPagerActionExpr, buildPaginatedManifest, PAGE_READ_EXPR } from '../scripts/harvest-paginated.mjs';

/* ── parseCount ──────────────────────────────────────────────────────── */

test('parseCount 剥千分位与波浪号，认不出返回 null', () => {
  assert.equal(parseCount('1,430'), 1430);
  assert.equal(parseCount('~50,988'), 50988);
  assert.equal(parseCount('50 988'), 50988);
  assert.equal(parseCount('7'), 7);
  assert.equal(parseCount('abc'), null);
  assert.equal(parseCount(''), null);
  assert.equal(parseCount(null), null);
  // 「1,430 页」带单位不是纯数字，交给 parsePager 去切
  assert.equal(parseCount('1,430 页'), null);
});

/* ── parsePager ──────────────────────────────────────────────────────── */

const SEMRUSH_TAIL = '9.1万\n315\n39.1万\n5.2万\n102\n0\n2041\n0\n1.1万\n0\nPrev\nNext\nPage:\nof\n1,430\nPage: 1\n\n    \n首页\n\n  \nSEO';

test('parsePager 认得 Semrush TA 的碎片形态（实测文本）', () => {
  const pager = parsePager(SEMRUSH_TAIL);
  assert.equal(pager.total, 1430);
  assert.equal(pager.current, 1);
});

test('parsePager 认得英文行内式与中文式', () => {
  assert.deepEqual(
    { ...parsePager('Showing results. Page 3 of 1,430. Next') },
    { current: 3, total: 1430, totalRows: null, shape: 'inline' },
  );
  const zh = parsePager('第 3 页，共 2,611 页');
  assert.equal(zh.current, 3);
  assert.equal(zh.total, 2611);
  assert.equal(zh.shape, 'zh');
});

test('parsePager 认得行区间式，页数为 null 但总行数有值', () => {
  const pager = parsePager('引荐域名 1 - 100 (~50,988) 导出');
  assert.equal(pager.shape, 'range');
  assert.equal(pager.total, null);
  assert.equal(pager.totalRows, 50988);
  assert.equal(pager.rangeTo, 100);
});

test('parsePager 认不出就返回 null —— 绝不猜一个总数出来', () => {
  assert.equal(parsePager('一张没有分页器的表'), null);
  assert.equal(parsePager(''), null);
  assert.equal(parsePager(null), null);
});

test('parsePager 不把正文里的 "of" 当分页器（锚点窗口的意义）', () => {
  // 「3 of 4」没有 page 锚点 → 不认；有锚点但离得远 → 也不认
  assert.equal(parsePager('step 3 of 4 completed'), null);
  // 锚点在，但 `of` 被 48 字符以上的正文推出了窗口 → 不认（空白会被归一，所以填实词）
  const far = 'Page views by country and device across the last quarter of 1,430';
  assert.equal(parsePager(far), null);
});

/* ── 机制分类 ────────────────────────────────────────────────────────── */

test('classifyPagination：有分页器无 URL 参数 = 客户端分页（Semrush TA 的形状）', () => {
  const verdict = classifyPagination({ pager: parsePager(SEMRUSH_TAIL), urlPageParam: null });
  assert.equal(verdict.kind, 'client');
  assert.equal(verdict.confidence, 'high');
});

test('classifyPagination：URL 里有页码参数优先判 url', () => {
  assert.equal(classifyPagination({ pager: null, urlPageParam: 'page' }).kind, 'url');
});

test('classifyPagination：无分页器但滚动长行 = 虚拟滚动；不长 = 单页；没测过 = unknown', () => {
  assert.equal(classifyPagination({ rowsGrewOnScroll: true }).kind, 'scroll');
  assert.equal(classifyPagination({ rowsGrewOnScroll: false }).kind, 'single');
  const unknown = classifyPagination({});
  assert.equal(unknown.kind, 'unknown');
  assert.equal(unknown.confidence, 'low');
});

test('findUrlPageParam 只认页码类参数名，q/lid 不算', () => {
  assert.equal(findUrlPageParam('https://x.test/a?q=canva.com&lid=123'), null);
  assert.equal(findUrlPageParam('https://x.test/a?q=canva.com&page=3'), 'page');
  assert.equal(findUrlPageParam('https://x.test/a?offset=100'), 'offset');
  assert.equal(findUrlPageParam('not a url'), null);
});

/* ── 采页计划：绝不默认全量 ─────────────────────────────────────────── */

test('planPages 默认保守，且 1,430 页时 capped 必为 true 并给出 notice', () => {
  const plan = planPages({ total: 1430 });
  assert.equal(plan.pages.length, DEFAULT_MAX_PAGES);
  assert.deepEqual(plan.pages, [1, 2, 3, 4, 5]);
  assert.equal(plan.capped, true);
  assert.equal(plan.coverage, 'partial');
  assert.match(plan.notice, /只采了 5\/1430 页/);
  assert.match(plan.notice, /抽样/);
});

test('planPages 覆盖完整时 capped=false、coverage=full', () => {
  const plan = planPages({ total: 3, maxPages: 10 });
  assert.deepEqual(plan.pages, [1, 2, 3]);
  assert.equal(plan.capped, false);
  assert.equal(plan.coverage, 'full');
  assert.match(plan.notice, /全量/);
});

test('planPages 永远受 HARD_MAX_PAGES 约束（没有「不限」这个取值）', () => {
  const plan = planPages({ total: 100000, maxPages: 99999 });
  assert.equal(plan.pages.length, HARD_MAX_PAGES);
});

test('planPages 续跑：已采过的页不再排进计划', () => {
  const plan = planPages({ total: 1430, maxPages: 3, done: [1, 2, 3, 7] });
  assert.deepEqual(plan.pages, [4, 5, 6]);
});

test('planPages stratified 等距抽样，offset 固定则结果可复现', () => {
  const a = planPages({ total: 1000, maxPages: 5, mode: 'stratified', offset: 0 });
  assert.deepEqual(a.pages, [1, 201, 401, 601, 801]);
  assert.equal(a.step, 200);
  const b = planPages({ total: 1000, maxPages: 5, mode: 'stratified', offset: 7 });
  assert.deepEqual(b.pages, [8, 208, 408, 608, 808]);
  // 同一 offset 再算一次必须一模一样（续跑不能换样本）
  assert.deepEqual(planPages({ total: 1000, maxPages: 5, mode: 'stratified', offset: 7 }).pages, b.pages);
});

test('planPages stratified 在总页数未知时退回 head 并标出来', () => {
  const plan = planPages({ total: null, maxPages: 3, mode: 'stratified' });
  assert.equal(plan.fellBackToHead, true);
  assert.deepEqual(plan.pages, [1, 2, 3]);
  assert.match(plan.notice, /只采了 3\/\? 页/);
});

/* ── 断点续跑状态机 ─────────────────────────────────────────────────── */

test('checkpoint 往返：记一页 → donePages 反映出来', () => {
  let state = newCheckpoint({ url: 'https://x.test/t', mode: 'head' });
  assert.deepEqual(donePages(state), []);
  state = applyPageResult(state, { page: 1, ok: true, rows: 50, fingerprint: 'a', totalPages: 1430, rowsPerPage: 50 });
  state = applyPageResult(state, { page: 2, ok: true, rows: 50, fingerprint: 'b' });
  assert.deepEqual(donePages(state), [1, 2]);
  assert.equal(state.totalPages, 1430);
  assert.equal(state.rowsPerPage, 50);
});

test('同一页重采以新的覆盖旧的，页数不重复计入', () => {
  let state = newCheckpoint({ url: 'https://x.test/t' });
  state = applyPageResult(state, { page: 4, ok: true, rows: 18, fingerprint: 'old' });
  state = applyPageResult(state, { page: 4, ok: true, rows: 50, fingerprint: 'new' });
  assert.equal(state.pages.length, 1);
  assert.equal(state.pages[0].rows, 50);
  assert.equal(state.pages[0].fingerprint, 'new');
});

test('失败的页只进 failures，下一轮计划会自然重入', () => {
  let state = newCheckpoint({ url: 'https://x.test/t' });
  state = applyPageResult(state, { page: 1, ok: true, rows: 50, fingerprint: 'a' });
  state = applyPageResult(state, { page: 2, ok: false, reason: 'content did not change' });
  assert.deepEqual(donePages(state), [1]);
  assert.equal(state.failures.length, 1);
  const plan = planPages({ total: 10, maxPages: 2, done: donePages(state) });
  assert.deepEqual(plan.pages, [2, 3]);
});

test('applyPageResult 不改原对象（续跑状态不许被就地改坏）', () => {
  const state = newCheckpoint({ url: 'https://x.test/t' });
  const next = applyPageResult(state, { page: 1, ok: true, rows: 5, fingerprint: 'a' });
  assert.equal(state.pages.length, 0);
  assert.equal(next.pages.length, 1);
});

test('loadCheckpoint 对版本不符 / URL 不符 / 坏 JSON 一律返回 null', () => {
  const good = JSON.stringify(newCheckpoint({ url: 'https://x.test/t' }));
  assert.ok(loadCheckpoint(good, { url: 'https://x.test/t' }));
  assert.equal(loadCheckpoint(good, { url: 'https://x.test/OTHER' }), null);
  assert.equal(loadCheckpoint('{not json', { url: 'https://x.test/t' }), null);
  assert.equal(loadCheckpoint(JSON.stringify({ ...JSON.parse(good), schemaVersion: 99 }), {}), null);
  assert.equal(loadCheckpoint(JSON.stringify({ schemaVersion: 1 }), {}), null);
  assert.equal(loadCheckpoint(null), null);
});

test('pagesRemaining 只留没采过的', () => {
  let state = newCheckpoint({ url: 'https://x.test/t' });
  state = applyPageResult(state, { page: 2, ok: true, rows: 50, fingerprint: 'b' });
  assert.deepEqual(pagesRemaining(state, [1, 2, 3]), [1, 3]);
});

/* ── 行数自检 ───────────────────────────────────────────────────────── */

test('verifyRowCount 干净的抽样不报 mismatch', () => {
  const audit = verifyRowCount({
    pages: [{ page: 1, rows: 50, fingerprint: 'a' }, { page: 2, rows: 50, fingerprint: 'b' }],
    rowsPerPage: 50, totalPages: 1430, uniqueRows: 100, coverage: 'partial',
  });
  assert.equal(audit.rowCountMismatch, false);
  assert.equal(audit.collectedRows, 100);
});

test('verifyRowCount 抓静默丢行：非末页却不足 rowsPerPage', () => {
  const audit = verifyRowCount({
    pages: [{ page: 1, rows: 50, fingerprint: 'a' }, { page: 2, rows: 18, fingerprint: 'b' }],
    rowsPerPage: 50, totalPages: 1430, uniqueRows: 68, coverage: 'partial',
  });
  assert.equal(audit.rowCountMismatch, true);
  assert.deepEqual(audit.shortPages, [{ page: 2, rows: 18, expected: 50 }]);
});

test('verifyRowCount 末页不足不算丢行', () => {
  const audit = verifyRowCount({
    pages: [{ page: 3, rows: 12, fingerprint: 'c' }],
    rowsPerPage: 50, totalPages: 3, uniqueRows: 12, coverage: 'partial',
  });
  assert.deepEqual(audit.shortPages, []);
  assert.equal(audit.rowCountMismatch, false);
});

test('verifyRowCount 抓「翻页没生效」：两页指纹相同', () => {
  const audit = verifyRowCount({
    pages: [{ page: 1, rows: 50, fingerprint: 'same' }, { page: 2, rows: 50, fingerprint: 'same' }],
    rowsPerPage: 50, totalPages: 1430, uniqueRows: 50, coverage: 'partial',
  });
  assert.equal(audit.rowCountMismatch, true);
  assert.deepEqual(audit.duplicatePages, [{ page: 2, sameAs: 1 }]);
  assert.equal(audit.duplicateRows, 50);
});

test('verifyRowCount 全量采完时与自报总行数对账', () => {
  const audit = verifyRowCount({
    pages: [{ page: 1, rows: 50, fingerprint: 'a' }, { page: 2, rows: 40, fingerprint: 'b' }],
    rowsPerPage: 50, totalPages: 2, reportedTotalRows: 100, uniqueRows: 90, coverage: 'full',
  });
  assert.equal(audit.rowCountMismatch, true);
  assert.equal(audit.expectedTotalRows, 100);
  assert.ok(audit.reasons.some((r) => r.startsWith('totalRows:')));
});

test('verifyRowCount 只回报不判决：没有任何 verdict / ok / accept 字段', () => {
  const audit = verifyRowCount({ pages: [], coverage: 'partial' });
  for (const forbidden of ['verdict', 'ok', 'accepted', 'conclusion', 'healthy']) {
    assert.equal(Object.hasOwn(audit, forbidden), false, `audit 不许有 ${forbidden} 字段`);
  }
});

/* ── 行重建 ─────────────────────────────────────────────────────────── */

test('clusterCellsByY 按 Y 聚类、行内按 X 排序', () => {
  const rows = clusterCellsByY([
    { x: 300, y: 101, t: 'b' }, { x: 100, y: 100, t: 'a' }, { x: 500, y: 103, t: 'c' },
    { x: 100, y: 140, t: 'd' }, { x: 300, y: 141, t: 'e' },
  ]);
  assert.deepEqual(rows.map((row) => row.cells), [['a', 'b', 'c'], ['d', 'e']]);
});

test('clusterCellsByY 没有固定分桶的边界伪影：跨 6 的倍数的一行不许被劈开', () => {
  // 老写法 round(y/6)*6 会把 140→138、141→144 劈成两个桶，两半各自
  // 不足 minCells 被丢掉 —— 那正是「静默丢行」。按间隙断行不会。
  const rows = clusterCellsByY([{ x: 10, y: 140, t: 'd' }, { x: 30, y: 141, t: 'e' }]);
  assert.deepEqual(rows.map((row) => row.cells), [['d', 'e']]);
});

test('clusterCellsByY 丢掉不足 minCells 的桶（标题/图例），并忽略脏点', () => {
  const rows = clusterCellsByY([
    { x: 10, y: 10, t: '孤零零的标题' },
    { x: 10, y: 60, t: 'a' }, { x: 40, y: 61, t: 'b' },
    { x: 10, y: 90, t: '' }, { x: 20, y: 90, t: null }, { x: NaN, y: 90, t: 'x' },
  ]);
  assert.deepEqual(rows.map((row) => row.cells), [['a', 'b']]);
});

test('pageFingerprint 只看行内容：内容一样页码不同也是同一个指纹', () => {
  const rows = [['a', '1'], ['b', '2']];
  assert.equal(pageFingerprint(rows), pageFingerprint([['a', '1'], ['b', '2']]));
  assert.notEqual(pageFingerprint(rows), pageFingerprint([['a', '1'], ['b', '3']]));
  assert.equal(pageFingerprint([]), pageFingerprint([]));
});

test('dedupeRows 跨页去重并数出重复条数', () => {
  const merged = dedupeRows([[['a', '1'], ['b', '2']], [['b', '2'], ['c', '3']]]);
  assert.deepEqual(merged.rows, ['a\t1', 'b\t2', 'c\t3']);
  assert.equal(merged.unique, 3);
  assert.equal(merged.duplicates, 1);
});

/* ── 采集脚本：形状与剥敏 ───────────────────────────────────────────── */

test('manifest 形状：no silent caps —— notice / capped / coverage 必须在', () => {
  const plan = planPages({ total: 1430, maxPages: 5 });
  const manifest = buildPaginatedManifest({
    url: 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&__gmitm=SECRET',
    session: 'semrush-nav', startedAt: 'a', finishedAt: 'b',
    mechanism: { kind: 'client' }, pager: { total: 1430 }, plan,
    pages: [], failures: [], rowsPerPage: 50, totalPages: 1430,
    shotEvery: 5, shotPages: [1], audit: { rowCountMismatch: true, reasons: ['shortPages:1'] },
    stopReason: 'done', notice: plan.notice, maxPages: 5, mode: 'head', offset: 0,
    resumedFrom: 0, lockHeld: true, lockWaitMs: 12,
  });
  assert.equal(manifest.capped, true);
  assert.equal(manifest.coverage, 'partial');
  assert.match(manifest.notice, /只采了 5\/1430 页/);
  assert.equal(manifest.rowCountMismatch, true);
  assert.equal(manifest.lockHeld, true);
  // 剥敏：__gmitm 只留键名，值不许出现在 manifest 里
  assert.match(manifest.url, /__gmitm=/);
  assert.equal(manifest.url.includes('SECRET'), false);
});

test('页面侧表达式是可求值的 JS，且带上了穿透 DOM 与聚类的源码', () => {
  assert.doesNotThrow(() => new Function(`return ${PAGE_READ_EXPR}`));
  assert.match(PAGE_READ_EXPR, /deepQueryAll/);
  assert.match(PAGE_READ_EXPR, /role=row/);
  // URL 列必须从属性读（harvest.md 的静默丢行那一条）
  assert.match(PAGE_READ_EXPR, /getAttribute\('title'\)/);
});

test('分页控件表达式：next 不带页码，jump 用合成 Enter（keyCode 13）', () => {
  const next = buildPagerActionExpr('next');
  assert.doesNotThrow(() => new Function(`return ${next}`));
  assert.match(next, /下一页/);
  const jump = buildPagerActionExpr('jump', 42);
  assert.doesNotThrow(() => new Function(`return ${jump}`));
  assert.match(jump, /keyCode: 13/);
  assert.match(jump, /insertText/);
  assert.match(jump, /"42"/);
});
