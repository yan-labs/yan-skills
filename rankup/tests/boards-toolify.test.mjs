// scripts/demand/boards.mjs toolify 分支的离线契约（2026-09-13）：
//
//   1. 带 website 的榜单（revenue / new）照旧解析，domain 取外链；
//   2. 不带 website 的榜单（trending：tableData 行只有 handle/name/访问量/增长）
//      不能再整页判「结构改了」——退到 handle+name 列表，url 记 toolify 工具页、
//      domain=null、extra.websiteMissing=true，绝不把 toolify.ai 当产品域名；
//   3. 负载里连工具列表都没有时仍返回 {error}，调用方据此留现场、记 browser_error；
//   4. 榜单页一页即全量（next_page_url=null / 已覆盖 total）时停止翻页，重复页按 handle 去重。
//
// 纯离线：用 vm 喂假 window.__NUXT__ / document，不开浏览器。真实页面结果见脚本头部「已验证」。
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const boards = await import(path.join(here, '../scripts/demand/boards.mjs'));

function runExtract(nuxt) {
  const context = vm.createContext({
    window: { __NUXT__: nuxt },
    document: { querySelectorAll: () => [] },
  });
  return vm.runInContext(boards.TOOLIFY_EXTRACT, context);
}

const trendingPayload = {
  data: [{
    tableData: [
      { id: '1', tool_id: '9363', handle: 'chatgpt-4', name: 'ChatGPT', month_visited_count: '5638438573', growth: '188047147', growth_rate: '0.0345', date: '2026-08-01', created_at: '2026-09-08 10:48:26', description: 'A free-to-use AI system.', tags: ['AI chatbot'] },
      { id: '2', tool_id: '9454', handle: 'hint-app', name: 'Hint', month_visited_count: '19445235', growth: '6292118', growth_rate: '0.4784', date: '2026-08-01', created_at: '2026-09-08 10:54:35', description: 'Astrology app.', tags: ['Astrology'] },
    ],
    page: 1, per_page: 300, next_page_url: null, total: 300,
    monthDate: [{ handle: 'August-2026' }], currentLabel: 'August 2026',
  }],
};

const revenuePayload = {
  data: [{
    tableData: [
      { handle: 'chatgpt-4', name: 'ChatGPT', website: 'https://chatgpt.com?utm_source=toolify', month_visited_count: 5638438573, payment_platform: ['stripe'], created_at: '2023-12-25 18:16:44', categories: [{ name: 'Chat' }] },
    ],
    page: 1, per_page: 300, next_page_url: null, total: 300,
  }],
};

test('trending：无 website 的 tableData 也能解析，不再报「结构改了」', () => {
  const res = runExtract(trendingPayload);
  assert.equal(res.error, undefined);
  assert.equal(res.key, 'tableData');
  assert.equal(res.rows.length, 2);
  assert.equal(res.rows[0].website, null);
  assert.equal(res.rows[0].handle, 'chatgpt-4');
  assert.equal(res.paging.next, null);

  const rows = [];
  boards.appendToolifyRows(rows, res, { boardKey: 'trending', limit: 50, date: '2026-09-13' });
  assert.equal(rows.length, 2);
  const [r] = rows;
  assert.equal(r.url, 'https://www.toolify.ai/tool/chatgpt-4');
  assert.equal(r.domain, null, 'toolify 工具页不是产品域名');
  assert.equal(r.metric, 5638438573);
  assert.equal(r.date, '2026-08-01', 'trending 行取榜单月份，不取榜单记录写入时间');
  assert.equal(r.extra.websiteMissing, true);
  assert.equal(r.extra.growthRate, 0.0345);
});

test('revenue：带 website 的列表照旧取外链域名', () => {
  const res = runExtract(revenuePayload);
  const rows = [];
  boards.appendToolifyRows(rows, res, { boardKey: 'revenue', limit: 50, date: '2026-09-13' });
  assert.equal(rows[0].domain, 'chatgpt.com');
  assert.equal(rows[0].url, 'https://chatgpt.com/');
  assert.equal(rows[0].extra.websiteMissing, false);
  assert.equal(rows[0].extra.paymentPlatform, 'stripe');
  assert.equal(rows[0].date, '2023-12-25');
});

test('负载里没有工具列表：仍返回 error，调用方据此留现场', () => {
  assert.match(runExtract({ data: [{ title: 'x', monthDate: [{ handle: 'August-2026' }] }] }).error, /找不到工具列表/);
  assert.match(runExtract(undefined).error, /no __NUXT__/);
});

test('回退不把分类列表当工具：只有 handle+name、没有访问量字段的数组不算', () => {
  // /most-saved、/most-used 实测负载里有 category_group_list（handle+name，无 month_visited_count）。
  // 工具列表若也丢了 website，必须报错留现场，而不是以 ok 吐出 22 个分类。
  const res = runExtract({
    data: [{
      toolsList: [{ handle: 'foo', name: 'Foo', description: 'no website, no visits' }],
      category_group_list: [{ handle: 'text-writing', name: 'Text&Writing' }],
    }],
  });
  assert.match(res.error, /找不到工具列表/);
});

test('翻页：next_page_url=null 或已覆盖 total 就停；重复页按 handle 去重', () => {
  const res = runExtract(trendingPayload);
  assert.equal(boards.toolifyHasMorePages(res), false);
  assert.equal(boards.toolifyHasMorePages({ paging: { page: 1, next: 1, total: 1038 } }), true);
  assert.equal(boards.toolifyHasMorePages({ paging: { page: 2, perPage: 50, total: 100 } }), false);
  assert.equal(boards.toolifyHasMorePages({}), true, '没有分页元信息时不擅自截断');

  const rows = [];
  const seen = new Set();
  boards.appendToolifyRows(rows, res, { boardKey: 'trending', limit: 50, date: '2026-09-13', seen });
  boards.appendToolifyRows(rows, res, { boardKey: 'trending', limit: 50, date: '2026-09-13', seen });
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => r.rank), [1, 2]);
});
