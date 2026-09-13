// Offline regression using recorded 2026-09-01 UI text, with account chrome removed.
// Sources: subscription-validation-2026-09-01/semrush/{priority-global-raw,
// zero-check-raw}.jsonl and raw/primary-ui-1-fill.json. No provider calls.
// The CLI imports launch a browser, so extract its pure parser as other tests do.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../scripts/semrush-keyword.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function parseCompact(');
const end = source.indexOf('function geoHopFacts(');
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ db: 'us' });
vm.runInContext(source.slice(start, end) + ';this.api = { parseOverviewMetrics, parseBulkApi };', context);
const { parseOverviewMetrics: parse, parseBulkApi: bulk } = context.api;
// 2026-09-13: production now wraps the parser's result through scopeKeywordMetrics()
// (no --db ⇒ volume becomes globalVolume, country-only fields nulled — see
// semrush-db-scope tests), so the call is nested rather than spread directly.
// parseOverviewMetrics(cap.bodyText, cap.absent) itself is still the exact call made;
// only the wrapping changed.
assert.match(source, /parseOverviewMetrics\(cap\.bodyText, cap\.absent\)/, 'production must use the tested parser');

const unavailable = "关键词摘要\n搜索量\n不可用\n关键词难度\n不可用\n全球搜索量\n不可用\n我们没有要显示的数据。\n意图\n不可用\n趋势\n我们没有要显示的数据。\nCPC\n不可用\n竞争激烈程度\n不可用\n谷歌购物广告\n不可用\n广告\n不可用\n关键词意见\n关键词变化\n1\n总搜索量:\n0\n关键词\n搜索量\nKD (%)\ncollect documents from clients for real estate closing software\n0\n不可用\n查看全部 1 个关键词\n问题\n不可用\n我们没有要显示的数据。\n相关关键词\n不可用\n我们没有要显示的数据。\n超越竞争对手的 SEO\n关键词: \nclient document collection software\n域名\n可读性分数\n字符统计\n加载时间\n可排序\nhttps://silver-switchboard.net\n62\n3548\n0.34\nhttps://silver-switchboard.net\n23\n1082\n0.1\nhttps://blank-dime.biz\n53\n302\n3.4\n查看机会";
const positive = "关键词摘要\n搜索量\n320\n关键词难度\n20%\n容易\n这个关键词很有可能获得排名。您需要专注于关键词意图的高质量内容。\n全球搜索量\n840\nUS\n美国\n320\nIN\n印度\n170\nUK\n英国\n40\nAU\n澳大利亚\n30\nCA\n加拿大\n30\nBE\n比利时\n20\n其他\n230\n意图\n信息\n趋势\nCPC\n$9.17\n竞争激烈程度\n0.62\n谷歌购物广告\n不可用\n广告\n不可用\n关键词意见";
const zero = "关键词摘要\n搜索量\n0\n关键词难度\n不可用\n全球搜索量\n20\nNL\n荷兰\n10\nUK\n英国\n10\nAU\n澳大利亚\n0\nBE\n比利时\n0\nBR\n巴西\n0\nUS\n美国\n0\n意图\n不可用\n趋势\nCPC\n$10.70\n竞争激烈程度\n0.53\n谷歌购物广告\n不可用\n广告\n不可用\n关键词意见";
const unfinished = "输入以逗号分隔的关键词\n﻿\n";

test('unavailable summary cannot borrow related-keyword zero', () => {
  const row = parse(unavailable);
  for (const key of ['volume', 'kd', 'globalVolume', 'cpc', 'competition']) assert.equal(row[key], null, key);
  assert.equal(row.noData, true);
  assert.equal(row.status, 'metrics_unavailable');
});
test('recorded positive summary keeps country/global metrics', () => {
  const row = parse(positive);
  assert.equal(row.volume, 320);
  assert.equal(row.kd, 20);
  assert.equal(row.cpc, '$9.17');
  assert.equal(row.globalVolume, 840);
  assert.equal(row.byCountry.US, 320);
  assert.equal(row.noData, false);
});
test('recorded explicit zero stays zero with unavailable KD', () => {
  const row = parse(zero);
  assert.equal(row.volume, 0);
  assert.equal(row.kd, null);
  assert.equal(row.globalVolume, 20);
  assert.equal(row.noData, false);
});
test('unfinished/missing summary boundary stays unknown', () => {
  for (const text of [unfinished, positive.split('关键词意见')[0]]) {
    assert.equal(parse(text).volume, null);
    assert.equal(parse(text).status, 'metrics_unavailable');
  }
  assert.equal(parse(unfinished, true).status, 'absent');
  assert.equal(parse(unfinished, true).volume, null);
});
test('bulk missing and null rows differ from explicit zero', () => {
  const rows = bulk(['missing', 'unknown', 'zero'], [{ phrase: 'unknown', volume: null }, { phrase: 'zero', volume: 0 }]);
  assert.equal(rows[0].volume, null);
  assert.equal(rows[1].volume, null);
  assert.equal(rows[2].volume, 0);
  assert.equal(rows[2].noData, false);
});
