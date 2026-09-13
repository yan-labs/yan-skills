// semrush-overview.mjs 的完成判定：不仅要证明「能判完成」，更要证明「不会过早判完成」。
//
// 全部离线：DOM 用合成的 token 快照（形状照 2026-09-13 真实页面的合成树 token 流），
// 接口用 fixtures/semrush-overview/rpc-sample.json（真实 /dpa/rpc 响应的形状，身份与数字已替换）。
// 编排循环 runReadiness 用注入的假 io 驱动：虚拟时钟、可控的在途数、可控的 drain。
//
// 反例清单（用户要求逐条钉住）：
//   R1 只有首屏加载好、下方仍是骨架/未挂载 ⇒ incomplete，并点名未完成区块
//   R2 某个 rpc 仍 pending（页内在途 / drain 里无状态码 / 发出数 > 完成数）⇒ 即使 DOM 全有数也不完成
//   R3 合法空态（广告研究「未找到任何数据」）与付费墙锁定态 ⇒ 终态，不死等
//   R4 超时调到 3 秒 ⇒ incomplete，而不是 complete
// 另加：空白页但接口有数 ⇒ not-rendered；区块里残留骨架元素 ⇒ loading；真缺席 ⇒ absent。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  SECTION_SPECS, TERMINAL_STATES, buildSectionData, classifyRpcResult, evaluateCompleteness, flattenRpc, hasGradeText,
  networkGate, pageNetworkQuiet, readDomSections, readSeoCard, runReadiness, seoCardCheck, compactMatches, judgeScope,
  rpcScopeWitness, readGroupBadges, judgeSectionScopes, finalStatus, classifySection, accountRpcBodies, trendContext,
  crossCheckSeo, crossCheckIntent, trendContextFromText, armNetworkCapture, drainRpcWitness,
  locateSections, KNOWN_COLUMN_HEADERS, compactScrollTrace, LAZY_PROBE_JS, PAGE_READ_JS, scrollToTextJs,
  summarizeRpcRequest, HOOK_JS, HOOK_TAKE_JS, resolveSameShape,
} from '../scripts/lib-semrush-overview.mjs';

const RPC = JSON.parse(await readFile(new URL('./fixtures/semrush-overview/rpc-sample.json', import.meta.url), 'utf8'));
const TAB = '按“Tab”启用图形图表访问模块。';

const HEADER = ['跳到内容', 'example.com', '根域名', '域名概览：', 'example.com', '导出成 PDF', '全世界', 'US', '桌面设备', '2026年9月11日', 'USD', '概览', '增长审核', '按国家/地区进行比较'];
const FIRST_SCREEN = [
  'AI 搜索', 'AI 可见度', TAB, '16', '提及', '4', '引用的页面', '1', 'ChatGPT', '1', '0', 'AI 概览', '3', '1', 'AI 模式', '0', '0', 'Gemini', '0', '0',
  'SEO', 'Authority Score', '30', '高', '自然流量', '7.8K', '+23%', '付费流量', '0', '引荐域名', '381', '流量比例', TAB, '21%', '自然搜索关键词', '503', '-6%', '付费关键词', '0', '反向链接', '1.1K',
  'AI 搜索', '谷歌搜索', '按国家/地区划分', '国家', '可见度', '提及', 'Sortable', '全世界', '14', '14', 'US', '16', '4',
  '主要的引用来源', '域名', '提及', 'Sortable', 'cite1.example', '1', 'cite2.example', '1',
  '谷歌 SERP 排名分布', TAB, '自然搜索', '99%', 'AI Overviews', '1%', '其他 SERP 精选结果', '0%',
  '1 个月', '6 个月', '1 年', '2 年', '全部时间', '天', '月', '导出', '流量', '自然流量', '付费流量', '品牌流量', '备注', '0', '3.3K', '6.6K', '9.8K', '2026年4月', '2026年5月', TAB,
  '关键词', '自然搜索', '付费', '排名前 3 名', '第 4-10 名', '第 11-20 名', '第 21-50 名', '第 51-100 名', 'AI Overviews', 'SERP 精选结果', '0', '205', '410', '615', '820', '2026年4月', TAB,
];
const ORGANIC = [
  '自然搜索研究',
  '主要自然搜索关键词', '498', '关键词', '排名', '搜索量', 'sample keyword 1', '2', '18.1K', 'sample keyword 2', '5', '2.4K', '查看详情',
  '关键主题', 'Topic A', '流量：', '200K', 'Topic B', '流量：', '125K', '查看 example.com 关键主题', '获取主题',
  '按意图划分的关键词', '意图', '关键词', '流量', '信息', '92.9%', '481', '7.7K', '导航', '1.9%', '10', '106',
  '自然搜索排名分布', '1-3', '4-10', '11-20', '21-50', '51-100', 'SF', '0%', '25%', '50%',
  '主要自然搜索竞争对手', '331', '竞争对手', '竞争程度', 'competitor1.example', '208', '666',
  '竞争排名图谱', '自然搜索关键词', '自然流量', 'competitor1.example', '0', '2K', '4K',
];
const ADS_EMPTY = [
  '广告研究',
  '主要付费关键词', '未找到任何数据', '尝试更改筛选器',
  '付费排名分布', '未找到任何数据', '尝试更改筛选器',
  '主要付费搜索竞争对手', '未找到任何数据', '尝试更改筛选器',
  '竞争排名图谱', '未找到任何数据', '尝试更改筛选器',
];
const BACKLINKS = [
  '反向链接', '全世界', '全部时间',
  '引荐页面标题和链接', '锚文本和目标 URL', 'Source 1', 'https://source1.example/', 'anchor 1', 'https://example.com/', 'follow', '1',
  'Follow和NoFollow', 'Follow 链接', '728', 'NoFollow 链接', '346',
  '反向链接类型', '文本链接', '98%', '1K', '图像链接', '2%', '18',
  '主要锚链接', '锚文本', '域名', '反向链接', 'anchor text 1', '133', '213',
  '引荐域名', '根域名', 'IP', '反向链接', 'ref1.example', '192.0.2.1', '98',
  '编入索引页面', '标题和 URL', '域名', '反向链接', 'Page 1', '244', '559',
];
const FULL = [...HEADER, ...FIRST_SCREEN, ...ORGANIC, ...ADS_EMPTY, ...BACKLINKS];
/** 17:04 那一刻的真实形状：首屏齐了，下方懒加载区块连标题都没挂，只有分节大标题 + 骨架。 */
const FIRST_SCREEN_ONLY = [...HEADER, ...FIRST_SCREEN, '自然搜索研究', '关键主题', 'Topic A', '流量：', '200K', '获取主题', '广告研究', '反向链接', '全世界', '全部时间'];
const FIRST_SCREEN_ONLY_PLACEHOLDERS = [{ at: FIRST_SCREEN_ONLY.indexOf('广告研究') + 1, name: 'Skeleton' }, { at: FIRST_SCREEN_ONLY.length, name: 'Skeleton' }];

/**
 * 假 io。虚拟时钟；readPage 返回 snapshot(t, y)；drain 第一次返回 rpc fixture（可让前 N 条是在途），之后返回 []。
 * net 字段：默认「很久以前就全部返回了」——rtCount = 已完成条数，rtLastEnd 远早于 now。
 */
function fakeIo({ snapshot, rpc = RPC, rtCount = RPC.length, hookPending = () => 0, drainPending = 0, pageHeight = 4000, vis = 'visible', scrollToText = null, hookEntries = [], rtBeforeHook = 0 }) {
  let t = 0;
  let y = 0;
  let read = 0;
  let drained = false;
  let hookTaken = false;
  const calls = { drain: 0, closeTab: 0 };
  return {
    calls,
    ...(scrollToText ? { scrollToText: async (text, occurrence) => { const r = scrollToText(text, occurrence); if (r && typeof r.y === 'number') y = r.y; return r; } } : {}),
    now: () => t,
    sleep: async (ms) => { t += ms; },
    scrollTo: async (v) => { y = v; },
    readPage: async () => {
      read += 1;
      const snap = snapshot({ t, y });
      // vis 可以是固定值，也可以是 ({ t, y, read, atBottom }) => 'visible' | 'hidden'，用来模拟中途被遮挡。
      const atBottom = y + 800 >= pageHeight - 4;
      return {
        href: 'https://app.example/analytics/overview/', title: 'example.com：域名概览', vis: typeof vis === 'function' ? vis({ t, y, read, atBottom }) : vis,
        scrollY: y, innerHeight: 800, scrollHeight: pageHeight,
        toks: snap.toks, placeholders: snap.placeholders || [],
        net: { now: 600_000 + t, epoch: t, timeOrigin: 0, rtCount, rtLastEnd: 1000, hookInstalled: true, hookPending: hookPending(t), hookCount: 0, hookLastStart: null, hookAt: 50, rtBeforeHook },
      };
    },
    takeHook: async () => { if (hookTaken) return []; hookTaken = true; return hookEntries; },
    drain: async () => {
      calls.drain += 1;
      if (drained) return [];
      drained = true;
      return rpc.map((e, i) => (i < drainPending ? { ...e, status: 0, body: null } : e));
    },
  };
}

const OPTS = { timeoutMs: 120_000, intervalMs: 2500, quietMs: 4000, stepTimeoutMs: 15_000 };
const stateOf = (result) => Object.fromEntries(Object.entries(result.sections).map(([k, s]) => [k, s.state]));

/* ---------------- 正例：能判完成 ---------------- */

test('full page + all rpc returned ⇒ complete, and every expected section is terminal', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FULL }) });
  const r = await runReadiness(io, OPTS);
  assert.equal(r.verdict.status, 'complete', JSON.stringify(r.verdict.incomplete));
  assert.equal(r.verdict.expected, SECTION_SPECS.length);
  for (const [key, s] of Object.entries(r.sections)) assert.ok(TERMINAL_STATES.has(s.state), `${key} is ${s.state}`);
  assert.equal(r.verdict.network.sent, RPC.length);
  assert.equal(r.verdict.network.completed, RPC.length);
  assert.ok(r.readiness.decidedAtMs < OPTS.timeoutMs, 'decided before the deadline');
  assert.equal(Object.keys(r.readiness.sectionTerminalAtMs).length, SECTION_SPECS.length, 'every section has a terminal timestamp');
});

/* ---------------- R1：首屏好、下方骨架 ---------------- */

test('R1: first screen loaded, lower sections still skeleton ⇒ incomplete and names the unfinished sections', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FIRST_SCREEN_ONLY, placeholders: FIRST_SCREEN_ONLY_PLACEHOLDERS }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 90_000 });
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(r.verdict.timedOut, true);
  const names = r.verdict.incomplete.map((x) => x.key);
  for (const key of ['topOrganicKeywords', 'organicCompetitors', 'topPaidKeywords', 'backlinksList', 'indexedPages']) {
    assert.ok(names.includes(key), `${key} must be listed as unfinished, got ${names.join(',')}`);
  }
  // 有接口数据却没渲染的区块，不许被当成 data 或 absent。
  assert.equal(r.sections.topOrganicKeywords.state, 'not-rendered');
  // 首屏的区块本身是真的完成了——判定是逐块的，不是一刀切。
  assert.equal(r.sections.seo.state, 'data');
  assert.equal(r.sections.keyTopics.state, 'locked');
});

test('R1 (pure): a trailing skeleton belongs to the last section; an unclaimed one is a page-level blocker', () => {
  const trailing = readDomSections(FULL, { placeholders: [{ at: FULL.length, name: 'Skeleton' }] });
  assert.equal(trailing.sections.indexedPages.placeholders.length, 1, 'a skeleton after the last title is inside that section');
  // 夹在分节大标题与第一个子区块标题之间的骨架不属于任何区块（例如一个还没挂标题的懒加载挂件）。
  const between = FULL.indexOf('广告研究') + 1;
  const orphan = readDomSections(FULL, { placeholders: [{ at: between, name: 'Skeleton' }] });
  assert.equal(orphan.pagePlaceholders.length, 1);
  const verdict = evaluateCompleteness(
    Object.fromEntries(SECTION_SPECS.map((s) => [s.key, { name: s.name, state: 'data' }])),
    { elapsedMs: 1, gate: { pass: true }, pagePlaceholders: orphan.pagePlaceholders, reachedBottom: true },
  );
  assert.equal(verdict.status, 'incomplete', 'every section terminal + network ok is still not complete while a skeleton is on the page');
  assert.equal(
    evaluateCompleteness(Object.fromEntries(SECTION_SPECS.map((s) => [s.key, { name: s.name, state: 'data' }])), { elapsedMs: 1, gate: { pass: true }, reachedBottom: false }).status,
    'incomplete',
    'not scrolled to the bottom ⇒ not complete',
  );
});

/* ---------------- R2：rpc 仍 pending ---------------- */

test('R2a: DOM fully rendered but an rpc is in flight in the page ⇒ never complete, times out incomplete', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FULL }), hookPending: () => 1 });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 60_000 });
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(io.calls.drain, 0, 'must not even drain the CDP capture while the page reports a request in flight');
  assert.match(r.verdict.network.reasons.join(' '), /hook-pending=1/);
});

test('R2b: page looks quiet but the CDP drain shows requests without a status ⇒ incomplete', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FULL }), drainPending: 2, rtCount: RPC.length - 2 });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 60_000 });
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(r.verdict.network.pass, false);
  assert.ok(r.verdict.network.pending >= 2, `pending count must be reported, got ${r.verdict.network.pending}`);
});

test('R2c (pure): sent > completed fails the gate even with a quiet page and nothing pending in the drain', () => {
  const gate = networkGate({ cdpSentTotal: 21, rtCompleted: 20, pendingInDrain: 0, pageQuiet: { quiet: true, reason: 'idle' } });
  assert.equal(gate.pass, false);
  assert.match(gate.reasons.join(' '), /sent=21>completed=20/);
  assert.equal(networkGate({ cdpSentTotal: 0, rtCompleted: 0, pendingInDrain: 0, pageQuiet: { quiet: true } }).pass, false, 'zero captured rpc means capture was not armed — not a pass');
  assert.equal(pageNetworkQuiet({ now: 5000, epoch: 5000, rtCount: 3, rtLastEnd: 2000, hookPending: 0 }, { quietMs: 4000 }).quiet, false, 'last rpc 3s ago is not quiet');
});

test('R2d: rpc fired by the PREVIOUS page (captured before navigation) is not counted as sent on the new page', async () => {
  // 真实时序：捕获在上一页布防 → location.href 导航。旧页面在导航前发出的 rpc 进了 CDP 捕获，
  // 但不会出现在新 document 的资源计时里。时间戳早于新 document 的 timeOrigin 的条目必须剔除，
  // 否则「发出数 > 完成数」永远不过闸（误报 incomplete）；反过来也不许把旧页面的数据当成本页数据。
  const timeOrigin = 1_000_000;
  const stale = { url: '/dpa/rpc?old=1', status: 200, timestamp: new Date(timeOrigin - 3000).toISOString(), body: { jsonrpc: '2.0', id: 99, result: { authorityScore: 999, linkPower: 1, backlinks: 1, referringDomains: 1 } } };
  const fresh = RPC.map((e) => ({ ...e, timestamp: new Date(timeOrigin + 500).toISOString() }));
  const base = fakeIo({ snapshot: () => ({ toks: FULL }), rpc: [stale, ...fresh], rtCount: RPC.length });
  const io = { ...base, readPage: async () => { const p = await base.readPage(); return { ...p, net: { ...p.net, timeOrigin } }; } };
  const r = await runReadiness(io, OPTS);
  assert.equal(r.verdict.status, 'complete', JSON.stringify(r.verdict.network));
  assert.equal(r.verdict.network.sent, RPC.length, 'the stale pre-navigation rpc must not be counted');
  assert.notEqual(r.sections.seo._rpc.data.authorityScore, 999, 'and its payload must not be used as this page\'s data');
});

/* ---------------- R3：合法空态 / 付费墙是终态 ---------------- */

test('R3: legal empty state and paywall are terminal and do not stall the run', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FULL }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 600_000 });
  const s = stateOf(r);
  for (const key of ['topPaidKeywords', 'paidPositionDistribution', 'paidCompetitors', 'paidPositioningMap']) assert.equal(s[key], 'empty', key);
  assert.equal(s.keyTopics, 'locked');
  assert.equal(r.verdict.status, 'complete');
  assert.ok(r.readiness.decidedAtMs < 120_000, `must finish promptly, not wait out a 600s timeout (took ${r.readiness.decidedAtMs}ms)`);
  assert.match(r.sections.topPaidKeywords.evidence.emptyMarker, /未找到任何数据/);
});

test('R3 guard: an empty-state marker that contradicts non-empty rpc data is a conflict, not empty', () => {
  const tokens = [...HEADER, ...FIRST_SCREEN, '自然搜索研究', '主要自然搜索关键词', '未找到任何数据'];
  const dom = readDomSections(tokens);
  assert.equal(dom.sections.topOrganicKeywords.state, 'empty');
  const rpc = buildSectionData('topOrganicKeywords', flattenRpc(RPC));
  assert.equal(rpc.hasData, true);
});

/* ---------------- R4：超时 3 秒 ---------------- */

test('R4: a 3-second timeout on a perfectly good page yields incomplete, never complete', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: FULL }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 3000 });
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(r.verdict.timedOut, true);
});

/* ---------------- 其它防过早判完成 ---------------- */

test('blank report area with full rpc data (2026-09-13 incident) ⇒ incomplete, sections not-rendered', async () => {
  const io = fakeIo({ snapshot: () => ({ toks: HEADER }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 60_000 });
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(r.sections.seo.state, 'not-rendered');
  assert.equal(r.sections.trafficTrend.state, 'not-rendered');
});

test('a skeleton element inside a section with numbers keeps that section loading', async () => {
  const at = FULL.indexOf('主要自然搜索关键词') + 3;
  const io = fakeIo({ snapshot: () => ({ toks: FULL, placeholders: [{ at, name: 'Skeleton' }] }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 60_000 });
  assert.equal(r.sections.topOrganicKeywords.state, 'loading');
  assert.match(r.sections.topOrganicKeywords.reason, /placeholder/);
  assert.equal(r.verdict.status, 'incomplete');
});

test('a section that fills in late is only accepted after it is stable and the network is quiet', async () => {
  // 前 20 秒下方区块还没挂上；之后才出现。完成时间必须晚于它出现的时间。
  const io = fakeIo({ snapshot: ({ t }) => ({ toks: t < 20_000 ? FIRST_SCREEN_ONLY : FULL }) });
  const r = await runReadiness(io, OPTS);
  assert.equal(r.verdict.status, 'complete');
  assert.ok(r.readiness.sectionTerminalAtMs.indexedPages >= 20_000, 'indexedPages cannot be terminal before it rendered');
});

test('absent needs proof: bottom reached, quiet, repeated reads — and then the page can complete', async () => {
  const withoutPaidMap = FULL.filter((t, i) => !(i >= FULL.lastIndexOf('竞争排名图谱') && i < FULL.lastIndexOf('竞争排名图谱') + 3));
  const io = fakeIo({ snapshot: () => ({ toks: withoutPaidMap }) });
  const r = await runReadiness(io, OPTS);
  assert.equal(r.sections.paidPositioningMap.state, 'absent');
  assert.match(r.sections.paidPositioningMap.evidence.absentProof, /after scrolling to the bottom/);
  assert.equal(r.verdict.status, 'complete');
});

test('absent is refused when lazy loading may not have reached the spot (2026-09-13 hidden-tab shape)', async () => {
  // 真实形状：付费排名分布之后什么都没挂上（付费竞争对手、付费图谱、整个反向链接分节都不在）。
  const cut = FULL.indexOf('主要付费搜索竞争对手');
  const truncated = [...FULL.slice(0, cut), '反向链接', '全世界', '全部时间'];
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: truncated }) }), { ...OPTS, timeoutMs: 90_000 });
  assert.equal(r.verdict.status, 'incomplete');
  for (const key of ['paidCompetitors', 'paidPositioningMap']) {
    assert.equal(r.sections[key].state, 'not-found', `${key} must not be called absent when nothing after it rendered`);
    assert.match(r.sections[key].reason, /no-later-section-rendered/);
  }
  assert.notEqual(r.sections.indexedPages.state, 'absent', 'the last section can never be proven absent');
});

/* ---------------- hidden 读数 × finalStatus（钉住「readiness 已 complete 时不追加 tab-hidden 阻断」） ---------------- */

const CONFIRMED_SCOPE = { scopeEvidence: { verdict: 'confirmed', reason: 'test' }, sectionScopes: { blockers: [] } };

test('hidden 读数 ①：中途 hidden 后恢复、最终读数可见且在底部、双闸门通过 ⇒ complete，不追加 tab-hidden 阻断', async () => {
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), vis: ({ read }) => (read === 2 || read === 3 ? 'hidden' : 'visible') }), OPTS);
  assert.equal(r.verdict.status, 'complete', JSON.stringify(r.verdict.blockers));
  assert.ok(r.readiness.visibility.hidden >= 2, 'the run really saw hidden reads');
  assert.equal(r.readiness.visibility.first, 'visible');
  assert.equal(r.readiness.visibility.last, 'visible');
  assert.equal(r.readiness.scrollTrace.at(-1).atBottom, true, 'the deciding read is at the bottom');
  assert.equal(r.verdict.network.pass ?? true, true);
  const fin = finalStatus({ readinessVerdict: r.verdict, ...CONFIRMED_SCOPE, visibility: r.readiness.visibility });
  assert.equal(fin.status, 'complete', JSON.stringify(fin.blockers));
  assert.ok(!fin.blockers.some((b) => b.startsWith('tab-hidden-during-run')));
  // 同一份 visibility，只要 readiness 没判 complete，历史 hidden 就必须点名阻断。
  const notComplete = finalStatus({ readinessVerdict: { ...r.verdict, status: 'incomplete' }, ...CONFIRMED_SCOPE, visibility: r.readiness.visibility });
  assert.equal(notComplete.status, 'incomplete');
  assert.ok(notComplete.blockers.some((b) => b.startsWith('tab-hidden-during-run')));
});

test('hidden 读数 ②：最终读数 hidden（中段恢复过也不行）⇒ last-read-hidden，finalStatus 仍阻断', async () => {
  // 每次停在底部的读数都 hidden、中段读数可见：做判定的那次读数必然在底部 ⇒ 必然 hidden。
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), vis: ({ read, atBottom }) => (read > 1 && atBottom ? 'hidden' : 'visible') }), OPTS);
  assert.equal(r.verdict.status, 'incomplete');
  assert.ok(r.verdict.blockers.includes('last-read-hidden'), JSON.stringify(r.verdict.blockers));
  assert.equal(r.readiness.visibility.last, 'hidden');
  const fin = finalStatus({ readinessVerdict: r.verdict, ...CONFIRMED_SCOPE, visibility: r.readiness.visibility });
  assert.equal(fin.status, 'incomplete');
  assert.ok(fin.blockers.some((b) => b.startsWith('tab-hidden-during-run')));
  // 纯函数层：即使其它条件全满足，判定读数 hidden 也到不了 complete。
  const pure = evaluateCompleteness(
    Object.fromEntries(Object.entries(r.sections).map(([k, s]) => [k, { ...s, state: 'data' }])),
    { elapsedMs: 1000, gate: { pass: true }, pagePlaceholders: [], reachedBottom: true, finalRead: { atBottom: true, vis: 'hidden' } },
  );
  assert.equal(pure.status, 'incomplete');
  assert.ok(pure.blockers.includes('last-read-hidden'));
});

test('hidden 读数 ③：中途 hidden 且从未恢复 ⇒ incomplete，点名 tab-hidden-during-run', async () => {
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), vis: ({ read }) => (read >= 3 ? 'hidden' : 'visible') }), OPTS);
  assert.equal(r.verdict.status, 'incomplete');
  assert.equal(r.readiness.visibility.first, 'visible');
  assert.equal(r.readiness.visibility.last, 'hidden');
  assert.ok(r.verdict.blockers.includes('last-read-hidden'), JSON.stringify(r.verdict.blockers));
  const fin = finalStatus({ readinessVerdict: r.verdict, ...CONFIRMED_SCOPE, visibility: r.readiness.visibility });
  assert.equal(fin.status, 'incomplete');
  assert.ok(fin.blockers.some((b) => b.startsWith('tab-hidden-during-run')), JSON.stringify(fin.blockers));
});

test('absent is refused when any read saw a hidden tab', async () => {
  const withoutPaidMap = FULL.filter((t, i) => !(i >= FULL.lastIndexOf('竞争排名图谱') && i < FULL.lastIndexOf('竞争排名图谱') + 3));
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: withoutPaidMap }), vis: 'hidden' }), { ...OPTS, timeoutMs: 90_000 });
  assert.equal(r.sections.paidPositioningMap.state, 'not-found');
  assert.match(r.sections.paidPositioningMap.reason, /tab-was-hidden-during-run/);
  assert.equal(r.verdict.status, 'incomplete');
});

test('the SERP donut skeleton with time-range buttons is not mistaken for data', () => {
  const skeletonDonut = FIRST_SCREEN.filter((t) => !/^[\d<.]+%$/.test(t));
  const dom = readDomSections([...HEADER, ...skeletonDonut]);
  assert.equal(dom.sections.serpDistribution.state, 'loading', '「1 个月」「6 个月」 are digits but not donut values');
});

/* ---------------- 接口证人 ---------------- */

test('rpc shapes from the real capture are all classified', () => {
  const flat = flattenRpc(RPC);
  const kinds = new Set(flat.map((x) => x.kind));
  for (const k of ['aiVisibility', 'aiSources', 'aiCountries', 'googleCountries', 'trend', 'topKeywords', 'organicCompetitors', 'backlinksOverview', 'authoritySummary', 'keyTopicsStatus']) {
    assert.ok(kinds.has(k), `missing kind ${k}; got ${[...kinds].join(',')}`);
  }
  assert.equal(classifyRpcResult([]), 'empty-array');
  const trend = buildSectionData('trafficTrend', flat);
  assert.ok(trend.data.daily.length >= 2 && trend.data.monthly.length >= 2, 'chart point series come from the rpc witness');
  const comp = buildSectionData('organicCompetitors', flat);
  assert.equal(typeof comp.data.total, 'number', 'the integer after the competitor list in a batched body is the total');
});

/* ---------------- SEO 卡片与等级徽标 ---------------- */

test('grade badge: a single CJK character counts (the 高 bug), a lone latin letter does not', () => {
  assert.equal(hasGradeText('高'), true);
  assert.equal(hasGradeText('行业领导者'), true);
  assert.equal(hasGradeText('Industry leader'), true);
  assert.equal(hasGradeText('K'), false);
  assert.equal(hasGradeText(''), false);
});

test('SEO card reads all 8 tiles incl. traffic share and paid keywords; badge is recorded, not a gate', () => {
  const content = FIRST_SCREEN.slice(FIRST_SCREEN.indexOf('Authority Score') + 1, FIRST_SCREEN.indexOf('按国家/地区划分'));
  const check = seoCardCheck(content);
  assert.equal(check.ok, true, check.reason);
  assert.deepEqual(
    { ...check.card.values },
    { authorityScore: 30, organicTraffic: 7800, organicTrafficChange: '+23%', paidTraffic: 0, referringDomains: 381, organicKeywords: 503, organicKeywordsChange: '-6%', backlinks: 1100, paidKeywords: 0, trafficShare: '21%' },
  );
  assert.equal(check.card.grade.text, '高');
  const noBadge = seoCardCheck(content.filter((t) => t !== '高'));
  assert.equal(noBadge.ok, true, 'a missing badge alone must not fail the card');
  assert.deepEqual(noBadge.warnings, ['authority-score-grade-badge-missing']);
});

test('2026-08-23 incident shape: AS 0 with no badge is a placeholder, AS 0 with a badge is real', () => {
  const zero = ['0', '自然流量', '7.8K', '付费流量', '0', '引荐域名', '381', '流量比例', '21%', '自然搜索关键词', '503', '付费关键词', '0', '反向链接', '1.1K'];
  assert.equal(seoCardCheck(zero).ok, false);
  assert.match(seoCardCheck(zero).reason, /placeholder/);
  assert.equal(seoCardCheck(['0', '低', ...zero.slice(1)]).ok, true);
  assert.equal(readSeoCard(zero.slice(0, 3)).values.paidTraffic, null, 'never borrows a neighbour tile value');
});

test('SEO card: a change rendered as two text nodes ("+", "23%") is still read (2026-09-13 real page)', () => {
  const split = ['30', '高', '自然流量', '7.8K', '+', '23%', '付费流量', '0', '引荐域名', '381', '流量比例', TAB, '21%', '自然搜索关键词', '503', '-6%', '付费关键词', '0', '反向链接', '1.1K'];
  const card = readSeoCard(split).values;
  assert.equal(card.organicTrafficChange, '+23%');
  assert.equal(card.organicKeywordsChange, '-6%');
  assert.equal(card.organicTraffic, 7800);
});

test('determinate progress bars (competition-level column) are data, not loading placeholders (2026-09-13 real page)', () => {
  const at = FULL.indexOf('主要自然搜索竞争对手') + 5;
  const dom = readDomSections(FULL, { placeholders: [{ at, name: 'ProgressBar' }, { at: at + 1, name: 'ProgressBar' }] });
  assert.equal(dom.sections.organicCompetitors.placeholders.length, 0);
  assert.equal(dom.sections.organicCompetitors.state, 'rendered');
  const stillBlocks = readDomSections(FULL, { placeholders: [{ at, name: 'Skeleton' }] });
  assert.equal(stillBlocks.sections.organicCompetitors.placeholders.length, 1, 'a real skeleton in the same spot still blocks');
});

/* ---------------- 页面级口径：DOM + 接口双证人 ---------------- */

const rpcBody = (id, result) => ({ url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id, result } });
const trendRow = (date, positions) => ({ date, organicTraffic: 100, adwordsTraffic: 0, positions, adwordsPositions: 0 });
const countryRow = (database, positions, organicPositions = positions) => ({ database, organicTraffic: 1, rank: 1, positions, organicPositions });
const witnessFrom = ({ trend, countries, selfOrganic = null }) => rpcScopeWitness(flattenRpc([
  rpcBody(1, [trendRow('20260911', trend - 1), trendRow('20260912', trend)]),
  rpcBody(2, countries.map(([d, p, o]) => countryRow(d, p, o))),
  ...(selfOrganic === null ? [] : [rpcBody(3, [{ domain: 'example.com', commonKeywords: 0, competitionLvl: 100, organicPositions: selfOrganic }])]),
]));
/** checker 2026-09-13 实测的真实 DOM 形状：「全世界」没有任何选中态属性，国家 pill 有 aria-checked。 */
const pill = (label, checked) => ({ label, chain: [{ depth: 3, tag: 'button', 'aria-checked': checked ? 'true' : 'false' }] });
const REAL_GLOBAL_PROBE = { urlDb: null, candidates: [{ label: '全世界', chain: [] }, pill('US', false), pill('UK', false), pill('DE', false), { label: '全世界', chain: [] }, { label: 'US', chain: [] }] };

test('scope (global): the real selector shape + an RPC trend above every country ⇒ confirmed', () => {
  const w = witnessFrom({ trend: 1400, countries: [['us', 503], ['de', 64], ['mobile-us', 900]] });
  assert.equal(w.trendExceedsEveryCountry, true);
  const r = judgeScope({ requestedDb: '', probe: REAL_GLOBAL_PROBE, rpcWitness: w });
  assert.equal(r.verdict, 'confirmed', r.reason);
  assert.equal(r.actual, 'global');
});

test('scope (global): either witness missing or ambiguous ⇒ unverified, a contradiction ⇒ mismatch', () => {
  const w = witnessFrom({ trend: 1400, countries: [['us', 503], ['de', 64]] });
  assert.equal(judgeScope({ requestedDb: '', probe: REAL_GLOBAL_PROBE }).verdict, 'unverified', 'DOM alone is not enough');
  assert.equal(judgeScope({ requestedDb: '', probe: { urlDb: null, candidates: [{ label: '全世界', chain: [] }] }, rpcWitness: w }).verdict, 'unverified', 'no pill exposes state ⇒ cannot rule out a selected country');
  const single = witnessFrom({ trend: 503, countries: [['us', 503], ['de', 64]] });
  assert.equal(judgeScope({ requestedDb: '', probe: REAL_GLOBAL_PROBE, rpcWitness: single }).verdict, 'unverified', 'trend equal to one country is not proof of global');
  const checkedUs = { ...REAL_GLOBAL_PROBE, candidates: [{ label: '全世界', chain: [] }, pill('US', true), pill('DE', false)] };
  assert.equal(judgeScope({ requestedDb: '', probe: checkedUs, rpcWitness: w }).verdict, 'mismatch');
  assert.equal(judgeScope({ requestedDb: '', probe: { ...REAL_GLOBAL_PROBE, urlDb: 'de' }, rpcWitness: w }).verdict, 'mismatch');
});

test('scope (country): URL db / checked pill plus the RPC trend equal to that country ⇒ confirmed', () => {
  const us = witnessFrom({ trend: 503, countries: [['us', 503], ['de', 64]] });
  assert.equal(judgeScope({ requestedDb: 'us', probe: { urlDb: 'us', candidates: [pill('US', true)] }, rpcWitness: us }).verdict, 'confirmed');
  assert.equal(judgeScope({ requestedDb: 'us', probe: { urlDb: 'us', candidates: [] }, rpcWitness: us }).verdict, 'confirmed', 'URL db + RPC is enough when the pill sits under "more"');
  const globalLike = witnessFrom({ trend: 1400, countries: [['us', 503], ['de', 64]] });
  assert.equal(judgeScope({ requestedDb: 'us', probe: { urlDb: 'us', candidates: [] }, rpcWitness: globalLike }).verdict, 'mismatch');
  assert.equal(judgeScope({ requestedDb: 'us', probe: { urlDb: 'us', candidates: [] } }).verdict, 'unverified');
});

test('two trend series in one load (2026-09-13 real shape): SEO card picks the page series, the badge country picks the research series', () => {
  // 数值是虚构的，只保留真实页面的**关系**：页面级那套与卡片显示对得上、研究分组那套等于分组国家行。
  const rpc = flattenRpc([
    rpcBody(1, [{ ...trendRow('20260911', 1980), organicTraffic: 20000 }, { ...trendRow('20260912', 2010), organicTraffic: 20110, intentInformationalPositions: 1800 }]),
    rpcBody(2, [{ ...trendRow('20260911', 69), organicTraffic: 880 }, { ...trendRow('20260912', 70), organicTraffic: 900, intentInformationalPositions: 66 }]),
    rpcBody(3, [countryRow('us', 600), countryRow('de', 70), countryRow('uk', 150)]),
  ]);
  const screen = FIRST_SCREEN.map((t) => (t === '7.8K' ? '20.1K' : t === '503' ? '2K' : t));
  const dom = readDomSections([...HEADER, ...screen]).sections;
  const ctx = trendContext(rpc, dom, { organic: { headingSeen: true, values: ['de'] } });
  assert.equal(ctx.pagePositions, 2010);
  assert.equal(ctx.pageSource, 'seo-card');
  assert.equal(ctx.organicPositions, 70);
  assert.equal(buildSectionData('trafficTrend', rpc, ctx).data.daily.at(-1).organicTraffic, 20110, 'the chart series must be the page one');
  assert.equal(buildSectionData('intent', rpc, ctx).data.find((x) => x.intent === 'informational').keywords, 66, 'the intent widget sits in the research group');
  const w = rpcScopeWitness(rpc, ctx);
  assert.equal(w.trendPositions, 2010);
  assert.equal(judgeScope({ requestedDb: '', probe: REAL_GLOBAL_PROBE, rpcWitness: w }).verdict, 'confirmed');
  // 没有仲裁者（卡片没渲染）就不猜：两套趋势时区块不用接口数据、口径证人为空。
  assert.equal(buildSectionData('trafficTrend', rpc).hasData, false);
  assert.equal(trendContext(rpc, {}, {}).pagePositions, null);
  assert.equal(judgeScope({ requestedDb: '', probe: REAL_GLOBAL_PROBE, rpcWitness: rpcScopeWitness(rpc) }).verdict, 'unverified');
});

/* ---------------- 趋势序列撞车 / 交叉校验（checker 第二轮） ---------------- */

/** 两套趋势，最新关键词数相同（1400），自然流量不同：页面级 14800、研究分组 500。数值虚构。 */
const collidingTrends = (pageFirst) => {
  const page = rpcBody(1, [{ ...trendRow('20260911', 1390), organicTraffic: 14700 }, { ...trendRow('20260912', 1400), organicTraffic: 14800, intentInformationalPositions: 1210 }]);
  const group = rpcBody(2, [{ ...trendRow('20260911', 1390), organicTraffic: 490 }, { ...trendRow('20260912', 1400), organicTraffic: 500, intentInformationalPositions: 42 }]);
  const countries = rpcBody(3, [{ ...countryRow('us', 600), organicTraffic: 7000 }, { ...countryRow('de', 1400), organicTraffic: 500 }]);
  return flattenRpc(pageFirst ? [page, group, countries] : [group, page, countries]);
};
const cardScreen = (keywords, traffic) => FIRST_SCREEN.map((t) => (t === '7.8K' ? traffic : t === '503' ? keywords : t));

test('colliding keyword counts + card traffic not readable ⇒ trend-series-ambiguous, never complete (both orders)', () => {
  for (const pageFirst of [true, false]) {
    const rpc = collidingTrends(pageFirst);
    // 卡片里读不到「自然流量」的数值（例如那一刻窗口没框住它）：去掉这个值。
    const screen = cardScreen('1.4K', '14.8K').filter((t) => t !== '14.8K' && t !== '+23%');
    const dom = readDomSections([...HEADER, ...screen]).sections;
    const ctx = trendContext(rpc, dom, {});
    assert.equal(ctx.pageAmbiguous, true, `order ${pageFirst}`);
    assert.equal(ctx.pageKey, null);
    assert.equal(buildSectionData('trafficTrend', rpc, ctx).hasData, false, 'must not pick a series by array order');
    assert.equal(buildSectionData('seo', rpc, ctx).data?.organicTraffic ?? null, null);
    const final = finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, trendContext: ctx });
    assert.equal(final.status, 'incomplete');
    assert.ok(final.blockers.some((b) => b.startsWith('trend-series-ambiguous(')), final.blockers.join(' | '));
  }
  // 只给关键词数（旧调用方式、无上下文）撞车时也不挑。
  assert.equal(buildSectionData('trafficTrend', collidingTrends(true), { pagePositions: 1400 }).hasData, false);
  assert.equal(buildSectionData('trafficTrend', collidingTrends(true)).hasData, false);
});

test('colliding keyword counts but the card traffic tells them apart ⇒ the right source, whatever the order', () => {
  for (const pageFirst of [true, false]) {
    const rpc = collidingTrends(pageFirst);
    const dom = readDomSections([...HEADER, ...cardScreen('1.4K', '14.8K')]).sections;
    const ctx = trendContext(rpc, dom, { organic: { headingSeen: true, values: ['de'] } });
    assert.deepEqual(ctx.pageKey, { positions: 1400, organicTraffic: 14800 }, `order ${pageFirst}`);
    assert.deepEqual(ctx.organicKey, { positions: 1400, organicTraffic: 500 }, 'the DE country row traffic separates the research series');
    assert.equal(buildSectionData('trafficTrend', rpc, ctx).data.daily.at(-1).organicTraffic, 14800);
    assert.equal(buildSectionData('seo', rpc, ctx).data.organicTraffic, 14800);
    assert.equal(buildSectionData('intent', rpc, ctx).data.find((x) => x.intent === 'informational').keywords, 42);
    assert.equal(rpcScopeWitness(rpc, ctx).trendPositions, 1400);
  }
});

test('crossCheckSeo disagreement is a blocker, not an informational field', () => {
  const seoCheck = crossCheckSeo({ authorityScore: 30, organicTrafficDisplay: '14.8K', organicKeywordsDisplay: '1.4K' }, { authorityScore: 30, organicTraffic: 500, organicKeywords: 1400 });
  assert.equal(seoCheck.mismatches.length, 1);
  const final = finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, crossChecks: { seo: seoCheck } });
  assert.equal(final.status, 'incomplete');
  assert.ok(final.blockers.some((b) => b.startsWith('seo-crosscheck-mismatch(organicTraffic')), final.blockers.join(' | '));
  assert.equal(finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, crossChecks: { seo: { checked: 6, mismatches: [] } } }).status, 'complete');
});

test('intent cross-check: ok, wrong series ⇒ mismatch, unreadable DOM ⇒ unverified, no rpc ⇒ not-applicable', () => {
  const dom = ['意图', '关键词', '流量', '信息', '92.9%', '481', '7.7K', '导航', '1.9%', '10', '106', '商务', '4.4%', '23', '62', '交易', '0.8%', '4', '20'];
  const rows = [
    { intent: 'informational', keywords: 481, traffic: 7699 }, { intent: 'navigational', keywords: 10, traffic: 106 },
    { intent: 'commercial', keywords: 23, traffic: 62 }, { intent: 'transactional', keywords: 4, traffic: 20 }, { intent: 'unknown', keywords: 0, traffic: 0 },
  ];
  assert.equal(crossCheckIntent(dom, rows).status, 'ok');
  assert.equal(crossCheckIntent(dom, rows).checked, 4);
  const wrongSeries = rows.map((r) => (r.intent === 'informational' ? { ...r, keywords: 42, traffic: 500 } : r));
  const bad = crossCheckIntent(dom, wrongSeries);
  assert.equal(bad.status, 'mismatch');
  assert.equal(crossCheckIntent(dom.filter((t) => !['导航', '1.9%', '10', '106'].includes(t)), rows).status, 'mismatch', 'a non-zero rpc row missing from the widget is a mismatch');
  assert.equal(crossCheckIntent(['意图', '关键词'], rows).status, 'mismatch', 'rows present in rpc but none in the widget');
  assert.equal(crossCheckIntent(['意图', '信息', '92.9%'], [{ intent: 'informational', keywords: 0, traffic: 0 }]).status, 'unverified');
  assert.equal(crossCheckIntent(dom, null).status, 'not-applicable');
  const blockedMismatch = finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, crossChecks: { intent: bad } });
  assert.ok(blockedMismatch.blockers.some((b) => b.startsWith('intent-crosscheck-mismatch(')));
  const blockedUnverified = finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, crossChecks: { intent: { status: 'unverified', reason: 'x' } } });
  assert.equal(blockedUnverified.status, 'incomplete');
});

test('trendContextFromText (innerText-only callers) finds the page series from the card text', () => {
  const rpc = collidingTrends(false);
  const text = ['SEO', 'Authority Score', '30', '高', '自然流量', '14.8K', '+12%', '付费流量', '0', '引荐域名', '381', '流量比例', '38%', '自然搜索关键词', '1.4K', '-4.3%', '付费关键词', '0', '反向链接', '1.1K', 'AI 搜索', '按国家/地区划分', '国家'].join('\n');
  const ctx = trendContextFromText(rpc, text);
  assert.deepEqual(ctx.pageKey, { positions: 1400, organicTraffic: 14800 });
  assert.equal(trendContextFromText(rpc, 'no card here').pageKey, null);
});

test('armNetworkCapture / drainRpcWitness wrappers (injected runner, no browser)', async () => {
  const calls = [];
  const runOpencli = async (args) => {
    calls.push(args);
    if (args.includes('network')) {
      return { stdout: JSON.stringify({ entries: [
        { url: 'https://app.example/dpa/rpc?t=1', status: 200, timestamp: 2000, body: { jsonrpc: '2.0', id: 7, result: [trendRow('20260911', 1390), trendRow('20260912', 1400)] } },
        { url: 'https://app.example/dpa/rpc', status: 200, timestamp: 500, body: { jsonrpc: '2.0', id: 1, result: { stale: true } } },
        { url: 'https://app.example/dpa/rpc', status: 200, timestamp: 2100, body: null },
      ] }) };
    }
    return { stdout: '{"error":{"code":"xhr_not_seen"}}' };
  };
  const armed = await armNetworkCapture({ runOpencli, session: 's1' });
  assert.equal(armed.armed, true);
  assert.deepEqual(calls[0].slice(0, 5), ['browser', 's1', 'wait', 'xhr', '__semrush_overview_arm_never_matches__']);
  const evaluate = async (expr) => (expr.includes('__ovRpc') && expr.includes('window.__ovRpc = []')
    ? [{ url: '/dpa/rpc', status: 200, via: 'hook', body: JSON.stringify({ jsonrpc: '2.0', id: 8, result: [countryRow('us', 1400)] }) }]
    : { timeOrigin: 1000, rtCount: 3, rtBeforeHook: 0 });
  const out = await drainRpcWitness({ runOpencli, session: 's1', evaluate });
  assert.equal(out.witness.trendPositions, 1400);
  assert.deepEqual(out.witness.topMatches, ['us']);
  assert.equal(out.bodies.withBody, 2, 'the pre-navigation entry is dropped and the bodiless one is not counted');
  assert.equal(out.bodies.missing, 1);
  await assert.rejects(() => drainRpcWitness({ runOpencli, session: 's1' }), /needs runOpencli, evaluate and session/);
});

/* ---------------- 区块定位 / 滚动判据（checker 第三轮） ---------------- */

/** checker 第三轮证据的真实形状（脱敏）：关键词表带「意图」列头，排在真正的「按意图筛选关键词」标题之前。 */
const ORGANIC_REAL_SHAPE = [
  '自然搜索研究', 'US',
  '主要自然搜索关键词', '498', '关键词', '意图', '排名', '搜索量', 'CPC (USD)', '流量 (%)', 'Sortable',
  'sample keyword 1', 'I', '2', '18.1K', '1.32', '30.44', 'sample keyword 2', 'I', '5', '2.4K', '0.97', '7.10', '查看详情',
  '关键主题', 'Topic A', '流量：', '200K', '查看', 'example.com', '关键主题', '获取主题',
  '按意图筛选关键词', '意图', '关键词', '流量', 'Sortable', '信息', '92.9%', '481', '7.7K', '导航', '1.9%', '10', '106', '查看详情',
  '自然搜索排名分布', '0%', '50%', '100%', '1-3', '4-10',
  '主要自然搜索竞争对手', '331', '竞争对手', '竞争程度', '共同关键词', 'SE 关键词', 'competitor1.example', '208', '666',
  '竞争排名图谱', 'competitor1.example', '0', '2K', '4K',
];

test('the intent title can no longer be stolen by the keyword table\'s "意图" column header (checker 3 real shape)', () => {
  const tokens = [...HEADER, ...FIRST_SCREEN, ...ORGANIC_REAL_SHAPE, ...ADS_EMPTY, ...BACKLINKS];
  const { found, texts } = locateSections(tokens);
  assert.equal(texts[found.intent], '按意图筛选关键词');
  const dom = readDomSections(tokens);
  assert.equal(dom.sections.intent.state, 'rendered');
  assert.ok(dom.sections.intent.content.includes('481'), 'the intent segment holds the intent rows');
  assert.ok(dom.sections.topOrganicKeywords.content.includes('sample keyword 1'), 'the keyword table keeps its own rows');
  assert.equal(dom.locateConflicts.length, 0);
  const rows = [{ intent: 'informational', keywords: 481, traffic: 7699 }, { intent: 'navigational', keywords: 10, traffic: 106 }];
  assert.equal(crossCheckIntent(dom.sections.intent.content, rows).status, 'ok');
});

test('no section title regex matches a known column header or legend token (all 23 sections)', () => {
  for (const spec of SECTION_SPECS) {
    for (const header of KNOWN_COLUMN_HEADERS) {
      const hit = spec.titles.find((p) => p.test(header));
      assert.equal(hit, undefined, `${spec.key} title ${hit} matches the column header "${header}"`);
    }
  }
});

test('a title matched twice outside its own segment is a locate conflict and blocks completion', () => {
  // 构造：「关键主题」除了真标题，还在反链分节里又出现了一次独立 token（不在关键主题自己的段落里）。
  const tokens = [...HEADER, ...FIRST_SCREEN, ...ORGANIC, ...ADS_EMPTY, ...BACKLINKS.slice(0, 5), '关键主题', ...BACKLINKS.slice(5)];
  const dom = readDomSections(tokens);
  assert.ok(dom.locateConflicts.some((c) => c.key === 'keyTopics'), JSON.stringify(dom.locateConflicts));
  const verdict = evaluateCompleteness(Object.fromEntries(SECTION_SPECS.map((s) => [s.key, { name: s.name, state: 'data' }])), { elapsedMs: 1, gate: { pass: true }, reachedBottom: true, locateConflicts: dom.locateConflicts });
  assert.equal(verdict.status, 'incomplete');
  assert.ok(verdict.blockers.some((b) => b.startsWith('section-locate-conflict(keyTopics')));
});

test('a truncated table segment (only the count and one header) is not data', () => {
  const tokens = [...HEADER, ...FIRST_SCREEN, '自然搜索研究', '主要自然搜索关键词', '498', '关键词', '关键主题', 'Topic A', '获取主题'];
  assert.equal(readDomSections(tokens).sections.topOrganicKeywords.state, 'loading');
});

test('scroll exhausted (page keeps growing) ⇒ not reachedBottom, scroll-exhausted blocker, incomplete', async () => {
  const base = fakeIo({ snapshot: () => ({ toks: FULL }) });
  let growth = 0;
  const io = { ...base, readPage: async () => { const p = await base.readPage(); growth += 700; return { ...p, scrollHeight: 4000 + growth }; } };
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 90_000 });
  assert.equal(r.readiness.reachedBottom, false);
  assert.equal(r.readiness.scrollExhausted, true);
  assert.equal(r.verdict.status, 'incomplete');
  assert.ok(r.verdict.blockers.includes('scroll-exhausted'), r.verdict.blockers.join(' | '));
});

test('the deciding read must be at the final bottom and visible', () => {
  const all = Object.fromEntries(SECTION_SPECS.map((s) => [s.key, { name: s.name, state: 'data' }]));
  const base = { elapsedMs: 1, gate: { pass: true }, reachedBottom: true };
  assert.equal(evaluateCompleteness(all, { ...base, finalRead: { atBottom: true, vis: 'visible' } }).status, 'complete');
  const mid = evaluateCompleteness(all, { ...base, finalRead: { atBottom: false, vis: 'visible' } });
  assert.equal(mid.status, 'incomplete');
  assert.ok(mid.blockers.includes('last-read-not-at-bottom'));
  assert.ok(evaluateCompleteness(all, { ...base, finalRead: { atBottom: true, vis: 'hidden' } }).blockers.includes('last-read-hidden'));
});

test('after the targeted pass leaves the page mid-way, the run scrolls back to the bottom before deciding; scrollTrace records it', async () => {
  const io = fakeIo({ snapshot: narrowWindowSnapshot, scrollToText: () => ({ found: true, y: 2950 }) });
  const r = await runReadiness(io, { ...OPTS, timeoutMs: 150_000 });
  assert.equal(r.verdict.status, 'complete');
  const trace = r.readiness.scrollTrace;
  assert.ok(trace.length > 0 && trace.length <= 60);
  for (const f of ['i', 'atMs', 'y', 'vh', 'H', 'vis', 'atBottom', 'inView']) assert.ok(f in trace[0], `trace entry has ${f}`);
  assert.equal(trace.at(-1).atBottom, true, 'the last recorded read is at the final bottom');
  assert.ok(trace.some((e) => e.y === 2950), 'the mid-page targeted position is visible in the trace');
});

test('compactScrollTrace keeps head, tail and change points within the cap', () => {
  const trace = Array.from({ length: 200 }, (_, i) => ({ y: i, vis: i === 100 ? 'hidden' : 'visible', inView: i < 150 ? ['A'] : ['B'] }));
  const c = compactScrollTrace(trace);
  assert.ok(c.length <= 60);
  assert.equal(c[0].i, 0);
  assert.equal(c.at(-1).i, 199);
  assert.ok(c.some((e) => e.i === 100) && c.some((e) => e.i === 150), 'visibility and in-view changes are kept');
});

test('page-side scripts carry the lazy-load probe fields and dispatch scroll events', () => {
  assert.match(LAZY_PROBE_JS, /ioIntersecting/);
  assert.match(LAZY_PROBE_JS, /trustedScrollEvents/);
  assert.match(PAGE_READ_JS, /lazy: window\.__ovLazy/);
  assert.match(PAGE_READ_JS, /inView/);
  assert.match(scrollToTextJs('x', 0), /dispatchEvent\(new Event\('scroll'\)\)/);
});

/* ---------------- 请求体摘要 / 同形响应安全路径 / 付费关键词对账 ---------------- */

test('summarizeRpcRequest keeps only id, method and whitelisted params — never account-ish data', () => {
  const body = JSON.stringify([
    { jsonrpc: '2.0', id: 7, method: 'organic.Positions', params: { database: 'us', displayLimit: 5, apiKey: 'x', token: 't', userId: 42, args: { reportType: 'organic', searchItem: 'example.com', user: { type: 'owner', email: 'a@b' } } } },
    { jsonrpc: '2.0', id: 8, method: 'adwords.Positions', params: { db: 'us', type: 'paid', session: { id: 's' } } },
  ]);
  const s = summarizeRpcRequest(body);
  assert.deepEqual(s, [
    { id: 7, method: 'organic.Positions', params: { database: 'us', displayLimit: 5, 'args.reportType': 'organic' } },
    { id: 8, method: 'adwords.Positions', params: { db: 'us', type: 'paid' } },
  ]);
  const text = JSON.stringify(s);
  for (const forbidden of ['apiKey', 'token', 'userId', 'email', 'owner', 'searchItem', 'session']) assert.ok(!text.includes(forbidden), `${forbidden} leaked`);
  assert.equal(summarizeRpcRequest('not json'), null);
  assert.equal(summarizeRpcRequest(null), null);
});

test('HOOK_JS keeps every existing record field and only adds req (backward compatible)', async () => {
  const response = JSON.stringify({ jsonrpc: '2.0', id: 7, result: [{ phrase: 'sample keyword 1', position: 1, trafficPercent: 10 }] });
  const xhrProto = { open() {}, send() {} };
  const ctx = vm.createContext({
    window: {},
    document: { readyState: 'complete' },
    performance: { now: () => 123, setResourceTimingBufferSize() {} },
    XMLHttpRequest: { prototype: xhrProto },
    Date, JSON, String, Object, Array, Number, Boolean, RegExp, Math,
  });
  ctx.window.fetch = async () => ({ status: 200, clone: () => ({ text: async () => response }) });
  const installed = JSON.parse(vm.runInContext(HOOK_JS, ctx));
  assert.equal(installed.installed, true);
  await ctx.window.fetch('https://app.example/dpa/rpc?t=1', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'organic.Positions', params: { database: 'us', token: 'secret' } }) });
  const rec = ctx.window.__ovRpc[0];
  for (const f of ['via', 'url', 'status', 'body', 'bodyTruncated', 'startedAt', 'timestamp']) assert.ok(f in rec, `existing field ${f} kept`);
  assert.equal(rec.via, 'hook');
  assert.deepEqual(JSON.parse(JSON.stringify(rec.req)), [{ id: 7, method: 'organic.Positions', params: { database: 'us' } }]);
  assert.ok(!JSON.stringify(rec).includes('secret'));
  assert.equal(HOOK_TAKE_JS.includes('window.__ovRpc = []'), true, 'HOOK_TAKE_JS unchanged in shape');
});

test('HOOK_JS summarizes non-string request bodies (Request input, byte arrays, XHR) and records only the body type name', async () => {
  const response = JSON.stringify({ jsonrpc: '2.0', id: 8, result: [{ phrase: 'sample keyword 1', position: 1, trafficPercent: 10 }] });
  const reqJson = (id, method) => JSON.stringify([{ jsonrpc: '2.0', id, method, params: { database: 'us', userId: 42, token: 'secret' } }]);
  let xhrListener = null;
  const xhrProto = { open() {}, send() {}, addEventListener(name, fn) { if (name === 'loadend') xhrListener = fn; } };
  const ctx = vm.createContext({
    window: {},
    document: { readyState: 'complete' },
    performance: { now: () => 5, setResourceTimingBufferSize() {} },
    XMLHttpRequest: { prototype: xhrProto },
    TextDecoder, TextEncoder,
    Date, JSON, String, Object, Array, Number, Boolean, RegExp, Math, Promise,
  });
  ctx.window.fetch = async () => ({ status: 200, clone: () => ({ text: async () => response }) });
  JSON.parse(vm.runInContext(HOOK_JS, ctx));
  // 1) fetch(Request)：正文在 Request 里，init 为空。
  const requestLike = { url: 'https://app.example/dpa/rpc', clone: () => ({ text: async () => reqJson(8, 'adwords.PositionsOverview') }) };
  await ctx.window.fetch(requestLike);
  // 2) fetch(url, { body: Uint8Array })——在 vm 上下文里造，模拟页面自己的 realm。
  ctx.bytes = new TextEncoder().encode(reqJson(9, 'organic.PositionsOverview'));
  await vm.runInContext(`window.fetch('https://app.example/dpa/rpc', { method: 'POST', body: new Uint8Array(bytes) })`, ctx);
  // 3) XHR 发 Uint8Array。
  const x = Object.create(xhrProto);
  x.open('POST', 'https://app.example/dpa/rpc');
  x.status = 200; x.responseText = response;
  x.send(new TextEncoder().encode(reqJson(10, 'organic.OverviewTrend')));
  xhrListener();
  await new Promise((r) => setTimeout(r, 0));
  const recs = JSON.parse(JSON.stringify(ctx.window.__ovRpc));
  assert.equal(recs.length, 3);
  assert.deepEqual(recs.map((r) => r.req?.[0]?.method), ['adwords.PositionsOverview', 'organic.PositionsOverview', 'organic.OverviewTrend']);
  assert.equal(recs[0].reqBodyType, 'Request');
  assert.equal(recs[1].reqBodyType, 'Uint8Array');
  assert.deepEqual(recs[0].req[0].params, { database: 'us' }, 'whitelist still applies; userId/token dropped');
  const text = JSON.stringify(recs.map((r) => ({ req: r.req, reqBodyType: r.reqBodyType })));
  assert.ok(!text.includes('secret') && !text.includes('userId') && !text.includes('42'));
});

test('flattenRpc attaches method/requestParams from req and backfills when the CDP copy came first', () => {
  const body = { jsonrpc: '2.0', id: 7, result: [{ phrase: 'k', position: 1, trafficPercent: 1 }] };
  const flat = flattenRpc([
    { url: '/dpa/rpc', status: 200, via: 'cdp', body },
    { url: '/dpa/rpc', status: 200, via: 'hook', body: JSON.stringify(body), req: [{ id: 7, method: 'organic.Positions', params: { database: 'us' } }] },
  ]);
  assert.equal(flat.length, 1, 'still deduplicated');
  assert.equal(flat[0].method, 'organic.Positions');
  assert.deepEqual(flat[0].requestParams, { database: 'us' });
  assert.equal(flattenRpc(RPC)[0].method, null, 'entries without req keep method null');
});

const paidKeywordsEntry = { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 90, result: [
  { phrase: 'paid keyword 1', position: 1, trafficPercent: 40 }, { phrase: 'paid keyword 2', position: 2, trafficPercent: 20 }, { phrase: 'paid keyword 3', position: 3, trafficPercent: 10 },
] } };
const paidCompetitorsEntry = { url: '/dpa/rpc', status: 200, body: [{ jsonrpc: '2.0', id: 91, result: [
  { domain: 'paid-rival1.example', commonKeywords: 9, organicTraffic: 5, organicPositions: 3, positions: 4, competitionLvl: 0.5 },
  { domain: 'paid-rival2.example', commonKeywords: 8, organicTraffic: 4, organicPositions: 2, positions: 3, competitionLvl: 0.4 },
] }, { jsonrpc: '2.0', id: 92, result: 2 }] };

test('two same-shape keyword responses and the DOM cannot tell which is organic ⇒ ambiguous, section non-terminal, not complete', async () => {
  // fixture 的自然关键词有 3 行，FULL 的 DOM 只显示了其中 2 个词 ⇒ 两条都对不上 ⇒ 不取。
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), rpc: [...RPC, paidKeywordsEntry], rtCount: RPC.length + 1 }), { ...OPTS, timeoutMs: 90_000 });
  assert.equal(r.sections.topOrganicKeywords.state, 'loading');
  assert.match(r.sections.topOrganicKeywords.reason, /^ambiguous-organic-vs-paid\(/);
  assert.equal(r.verdict.status, 'incomplete');
});

test('two same-shape keyword responses resolved by the section rows in the DOM ⇒ the organic one, complete', async () => {
  const toks = FULL.flatMap((t) => (t === '2.4K' ? [t, 'sample keyword 3', '9', '1K'] : [t]));
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks }), rpc: [paidKeywordsEntry, ...RPC], rtCount: RPC.length + 1 }), OPTS);
  assert.equal(r.verdict.status, 'complete', JSON.stringify(r.verdict.incomplete));
  const built = r.sections.topOrganicKeywords._rpc;
  assert.equal(built.resolvedBy, 'dom-rows');
  assert.ok(built.data.every((row) => row.keyword.startsWith('sample keyword')), 'no paid keyword leaked into the organic table');
});

test('two same-shape competitor responses: unresolvable ⇒ ambiguous; resolvable by domains in the DOM ⇒ organic', () => {
  const rpc = flattenRpc([...RPC, paidCompetitorsEntry]);
  const ambiguous = buildSectionData('organicCompetitors', rpc, { domSections: { organicCompetitors: { content: ['331', '竞争对手'] } } });
  assert.ok(ambiguous.ambiguous);
  assert.equal(ambiguous.hasData, false);
  const organicDomains = pickFixtureCompetitorDomains();
  const resolved = buildSectionData('organicCompetitors', rpc, { domSections: { organicCompetitors: { content: ['331', ...organicDomains, '208'] } } });
  assert.equal(resolved.resolvedBy, 'dom-rows');
  assert.ok(resolved.data.rows.every((row) => !row.domain.startsWith('paid-rival')));
  // 只有一条（样本站形状）：不需要 DOM，照旧取。
  const single = buildSectionData('organicCompetitors', flattenRpc(RPC), {});
  assert.equal(single.ambiguous, undefined);
  assert.equal(single.resolvedBy, null);
  assert.ok(single.hasData);
});

function pickFixtureCompetitorDomains() {
  const r = flattenRpc(RPC).find((x) => x.kind === 'organicCompetitors');
  return r.result.slice(0, 3).map((x) => x.domain);
}

test('paid keywords card vs adwordsPositions: disagreement is a blocker', () => {
  const check = crossCheckSeo({ paidKeywordsDisplay: '1.2K', paidTrafficDisplay: '0' }, { paidKeywords: 40, paidTraffic: 0 });
  assert.deepEqual(check.mismatches.map((m) => m.field), ['paidKeywords']);
  const final = finalStatus({ readinessVerdict: { status: 'complete' }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] }, crossChecks: { seo: check } });
  assert.equal(final.status, 'incomplete');
  assert.ok(final.blockers.some((b) => b.includes('paidKeywords: dom=1.2K rpc=40')));
  assert.equal(crossCheckSeo({ paidKeywordsDisplay: '1.2K' }, { paidKeywords: 1180 }).mismatches.length, 0);
});

/* ---------------- 数据丰富站点形状（2026-09-14 实测形状，数值全部虚构） ---------------- */

const richTrendRow = (date, extra = {}) => ({
  date, positions: 1000, organicPositions: 800, traffic: 50000, organicTraffic: 45000, adwordsTraffic: 700, adwordsPositions: 40,
  trafficBranded: 20000, trafficNonBranded: 30000, aiOverviewPositions: 5, serpFeaturesPositions: 200,
  organicPositionsTrend: [200, 150, 120, 90, 80, 60, 40, 30, 20, 7, 3], adwordsPositionsTrend: [10, 12, 8, 6, 2, 2, 0, 0, 0, 0, 0],
  intentInformationalPositions: 600, intentInformationalTraffic: 30000, intentNavigationalPositions: 100, intentNavigationalTraffic: 12000,
  intentCommercialPositions: 80, intentCommercialTraffic: 5000, intentTransactionalPositions: 20, intentTransactionalTraffic: 3000,
  intentUnknownPositions: 0, intentUnknownTraffic: 0, ...extra,
});
const organicKwRows = [{ phrase: 'organic kw a', position: 1, volume: 9000, cpc: 1.1, trafficPercent: 30, url: 'https://example.com/' }, { phrase: 'organic kw b', position: 2, volume: 5000, cpc: 0.9, trafficPercent: 10, url: 'https://example.com/b' }];
const paidKwRows = [
  { phrase: 'paid kw a', position: 1, volume: 800, cpc: 2.2, trafficPercent: 20, url: 'https://example.com/', adwordBlock: 0, title: 'Ad A', description: 'Ad text A', visibleUrl: 'https://example.com › a', hiddenUrl: 'x', uniqHash: 'h1' },
  { phrase: 'paid kw b', position: 2, volume: 600, cpc: 1.2, trafficPercent: 10, url: 'https://example.com/', adwordBlock: 1, title: 'Ad B', description: 'Ad text B', visibleUrl: 'https://example.com › b', hiddenUrl: 'y', uniqHash: 'h2' },
];
const paidCompetitorRows = [
  { domain: 'paid-rival1.example', commonKeywords: 30, competitionLvl: 0.2, adwordsPositions: 90, organicPositions: 5000, traffic: 1500, trafficCost: 2000 },
  { domain: 'paid-rival2.example', commonKeywords: 12, competitionLvl: 0.1, adwordsPositions: 40, organicPositions: 3000, traffic: 600, trafficCost: 900 },
  { domain: 'example.com', commonKeywords: 40, competitionLvl: 100, adwordsPositions: 40, organicPositions: 800, traffic: 700, trafficCost: 950 },
];
const richRpc = () => flattenRpc([
  { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 1, result: [richTrendRow('20260911'), richTrendRow('20260912')] }, req: [{ id: 1, method: 'organic.OverviewTrend', params: { database: 'us' } }] },
  { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 2, result: organicKwRows }, req: [{ id: 2, method: 'organic.PositionsOverview', params: { database: 'us' } }] },
  { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 3, result: paidKwRows }, req: [{ id: 3, method: 'adwords.PositionsOverview', params: { database: 'us' } }] },
  { url: '/dpa/rpc', status: 200, body: [{ jsonrpc: '2.0', id: 4, result: paidCompetitorRows }, { jsonrpc: '2.0', id: 5, result: 250 }] },
  { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 6, result: [{ database: 'us', organicTraffic: 45000, rank: 1, positions: 1000, organicPositions: 800 }, { database: 'uk', organicTraffic: 900, rank: 5, positions: 100, organicPositions: 90 }] } },
  { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 7, result: { error_code: 0, status: 'ready', target: { database: 'us', date: '202608', traffic: 50000 }, topics: [{ name: 'Topic One', keywords_count: 300, traffic: 9000, volume: 90000, pages: [{}, {}] }, { name: 'Topic Two', keywords_count: 120, traffic: 4000, volume: 30000, pages: [{}] }] } } },
]);

test('rich shapes: paid keyword rows classify apart from organic ones; key topics data is recognised', () => {
  const kinds = richRpc().map((r) => r.kind);
  assert.ok(kinds.includes('paidKeywords'));
  assert.ok(kinds.includes('topKeywords'));
  assert.ok(kinds.includes('keyTopicsData'));
  assert.equal(classifyRpcResult(paidKwRows), 'paidKeywords');
  assert.equal(classifyRpcResult(organicKwRows), 'topKeywords');
});

test('method name is the primary organic/paid discriminator; DOM rows are only a cross-check', () => {
  const same = flattenRpc([
    { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 2, result: organicKwRows }, req: [{ id: 2, method: 'organic.PositionsOverview' }] },
    { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 3, result: organicKwRows.map((r) => ({ ...r, phrase: `x ${r.phrase}` })) }, req: [{ id: 3, method: 'adwords.PositionsOverview' }] },
  ]);
  const byMethod = buildSectionData('topOrganicKeywords', same, {});
  assert.equal(byMethod.resolvedBy, 'method');
  assert.equal(byMethod.data[0].keyword, 'organic kw a');
  // DOM 显示的是另一条的首行、被方法名选中那条的首行不在 ⇒ 冲突，不取。
  const conflict = buildSectionData('topOrganicKeywords', same, { domSections: { topOrganicKeywords: { content: ['x organic kw a', '1'] } } });
  assert.ok(conflict.ambiguous);
  assert.match(conflict.ambiguous.reason, /method selects organic\.PositionsOverview/);
  // DOM 与方法名一致 ⇒ 正常。
  assert.equal(buildSectionData('topOrganicKeywords', same, { domSections: { topOrganicKeywords: { content: ['organic kw a', '1'] } } }).resolvedBy, 'method');
});

test('rich shapes: paid keywords, paid competitors (target row excluded, total kept), paid positioning map are structured', () => {
  const rpc = richRpc();
  const paidKw = buildSectionData('topPaidKeywords', rpc, {});
  assert.equal(paidKw.hasData, true);
  assert.deepEqual(paidKw.data.map((r) => r.keyword), ['paid kw a', 'paid kw b']);
  assert.equal(paidKw.data[0].adTitle, 'Ad A');
  assert.equal(buildSectionData('topOrganicKeywords', rpc, {}).data.every((r) => r.keyword.startsWith('organic')), true, 'no paid keyword in the organic table');
  const comp = buildSectionData('paidCompetitors', rpc, {});
  assert.equal(comp.data.total, 250);
  assert.deepEqual(comp.data.rows.map((r) => [r.domain, r.commonKeywords, r.paidKeywords, r.paidTraffic]), [['paid-rival1.example', 30, 90, 1500], ['paid-rival2.example', 12, 40, 600]]);
  const map = buildSectionData('paidPositioningMap', rpc, {});
  assert.equal(map.data.length, 3);
  assert.deepEqual(map.data.find((p) => p.isTarget), { domain: 'example.com', x: 40, y: 700, isTarget: true });
  // 样本站形状：付费竞争对手查询只有目标自身一行 ⇒ 没有数据（配合 DOM 合法空态），不冲突。
  const onlySelf = buildSectionData('paidCompetitors', flattenRpc(RPC), {});
  assert.equal(onlySelf.hasData, false);
});

test('rich shapes: position distributions come from the research series histograms and reconcile with totals', () => {
  const rpc = richRpc();
  const organic = buildSectionData('organicPositionDistribution', rpc, {});
  assert.equal(organic.data.total, 800);
  assert.equal(organic.data.totalMatches, true);
  assert.equal(organic.data.bucketLabelsVerified, false);
  const paid = buildSectionData('paidPositionDistribution', rpc, {});
  assert.equal(paid.data.total, 40);
  assert.equal(paid.data.totalMatches, true);
  const noPaid = buildSectionData('paidPositionDistribution', flattenRpc([{ url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 1, result: [richTrendRow('20260912', { adwordsPositions: 0, adwordsPositionsTrend: Array(11).fill(0) })] } }]), {});
  assert.equal(noPaid.hasData, false, 'a site without ads has no paid distribution (legal empty state stays terminal)');
});

test('rich shapes: key topics structured from the unlocked response', () => {
  const kt = buildSectionData('keyTopics', richRpc(), {});
  assert.equal(kt.hasData, true);
  assert.deepEqual(kt.data.topics[0], { name: 'Topic One', keywords: 300, traffic: 9000, volume: 90000, pages: 2 });
  assert.equal(kt.data.database, 'us');
});

test('the SEO card traffic matches the trend `traffic` field (organic + SERP features), not organicTraffic', () => {
  const rpc = richRpc();
  const screen = FIRST_SCREEN.map((t) => (t === '7.8K' ? '50K' : t === '503' ? '1K' : t));
  const dom = readDomSections([...HEADER, ...screen]).sections;
  const ctx = trendContext(rpc, dom, { organic: { headingSeen: true, values: ['us'] } });
  assert.equal(ctx.pageSource, 'seo-card', JSON.stringify(ctx));
  const seo = buildSectionData('seo', rpc, ctx).data;
  assert.equal(seo.organicTraffic, 50000);
  assert.equal(seo.organicTrafficExclSerpFeatures, 45000);
  assert.equal(seo.paidTraffic, 700);
  assert.equal(seo.paidKeywords, 40);
  assert.equal(buildSectionData('trafficTrend', rpc, ctx).data.daily.at(-1).organicTraffic, 50000);
});

test('intent cross-check accepts compact keyword counts on large sites', () => {
  const dom = ['意图', '关键词', '流量', '信息', '75.4%', '1.3M', '14.7M', '导航', '5.9%', '103.1K', '3.8M'];
  const rows = [{ intent: 'informational', keywords: 1304000, traffic: 14700000 }, { intent: 'navigational', keywords: 103100, traffic: 3800000 }];
  assert.equal(crossCheckIntent(dom, rows).status, 'ok');
  assert.equal(crossCheckIntent(dom, [{ ...rows[0], keywords: 2000000 }, rows[1]]).status, 'mismatch');
});

test('the paid-competitor self row now witnesses the ads group (rpcScopeWitness adsMatches)', () => {
  const w = rpcScopeWitness(flattenRpc([
    { url: '/dpa/rpc', status: 200, body: [{ jsonrpc: '2.0', id: 4, result: [{ domain: 'example.com', commonKeywords: 40, competitionLvl: 100, adwordsPositions: 40, organicPositions: 800, traffic: 700, trafficCost: 950 }] }, { jsonrpc: '2.0', id: 5, result: 0 }] },
    { url: '/dpa/rpc', status: 200, body: { jsonrpc: '2.0', id: 6, result: [{ database: 'us', organicTraffic: 45000, rank: 1, positions: 1000, organicPositions: 800 }, { database: 'uk', organicTraffic: 900, rank: 5, positions: 100, organicPositions: 90 }] } },
  ]));
  assert.deepEqual(w.adsMatches, ['us']);
  const s = judgeSectionScopes({ requestedScope: 'us', topScope: { verdict: 'confirmed' }, groupBadges: { organic: { headingSeen: true, values: ['us'] }, ads: { headingSeen: true, values: [] }, backlinks: { headingSeen: true, values: ['global'] } }, rpcWitness: w });
  assert.equal(s.groups.ads.verdict, 'confirmed', 'ads badge missing (seen on the rich site) but the paid query self row confirms us');
  assert.equal(s.groups.organic.verdict, 'confirmed');
});

/* ---------------- 区块级口径：研究分组徽标 ---------------- */

const CHECKER_GLOBAL_TAIL = ['自然搜索研究', 'DE', '关键主题', 'Topic A', '获取主题', '广告研究', 'DE', '反向链接', '全世界', '全部时间', '主要锚链接'];

test('group badges are read from the token stream (checker DE shape and the no-badge shape)', () => {
  const b = readGroupBadges([...HEADER, ...FIRST_SCREEN, ...CHECKER_GLOBAL_TAIL]);
  assert.deepEqual(b.organic, { headingSeen: true, badge: 'de' });
  assert.deepEqual(b.ads, { headingSeen: true, badge: 'de' });
  assert.deepEqual(b.backlinks, { headingSeen: true, badge: 'global' });
  const none = readGroupBadges(FULL);
  assert.equal(none.organic.badge, null, 'no country token after the heading ⇒ badge missing');
  assert.equal(none.ads.badge, null);
  assert.equal(none.backlinks.badge, 'global');
});

test('section scopes: global request + DE badges + no --organic-db ⇒ unpinned, labelled DE, blocks completion', () => {
  const s = judgeSectionScopes({
    requestedScope: 'global', topScope: { verdict: 'confirmed' },
    groupBadges: { organic: { headingSeen: true, values: ['de'] }, ads: { headingSeen: true, values: ['de'] }, backlinks: { headingSeen: true, values: ['global'] } },
  });
  assert.equal(s.groups.organic.verdict, 'unpinned');
  assert.equal(s.bySection.topOrganicKeywords.scope, 'de', 'the organic sections must say DE, never global');
  assert.equal(s.bySection.organicCompetitors.scope, 'de');
  assert.equal(s.bySection.topPaidKeywords.scope, 'de');
  assert.equal(s.bySection.seo.scope, 'global');
  assert.equal(s.bySection.indexedPages.scope, 'global');
  assert.equal(s.groups.backlinks.verdict, 'confirmed');
  assert.equal(s.blockers.filter((x) => x.startsWith('section-scope-unpinned')).length, 2);
});

test('section scopes: pinned vs badge — confirmed, mismatch, unverified, changed mid-run, DOM vs RPC contradiction', () => {
  const badges = (organic, ads = organic) => ({ organic: { headingSeen: true, values: organic }, ads: { headingSeen: true, values: ads }, backlinks: { headingSeen: true, values: ['global'] } });
  const top = { verdict: 'confirmed' };
  assert.equal(judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: top, groupBadges: badges(['de']) }).blockers.length, 0);
  assert.equal(judgeSectionScopes({ requestedScope: 'global', organicDb: 'us', topScope: top, groupBadges: badges(['de']) }).groups.organic.verdict, 'mismatch');
  const missing = judgeSectionScopes({ requestedScope: 'global', organicDb: 'us', topScope: top, groupBadges: badges([]) });
  assert.equal(missing.groups.organic.verdict, 'unverified', 'badge missing ⇒ unverified');
  assert.equal(missing.groups.ads.verdict, 'unverified');
  // 2026-09-14 实测更正：本域名自身行来自付费竞争对手查询 ⇒ 只能给广告研究分组补位。
  const viaRpc = judgeSectionScopes({ requestedScope: 'us', topScope: top, groupBadges: badges([]), rpcWitness: { adsMatches: ['us'], organicMatches: ['us'] } });
  assert.equal(viaRpc.groups.ads.verdict, 'confirmed', 'a unique self-row match (paid competitors query) can stand in for the ads badge');
  assert.equal(viaRpc.groups.ads.source, 'rpc-self-competitor-row');
  assert.equal(viaRpc.groups.organic.verdict, 'unverified', 'the organic group no longer borrows the paid query self row');
  assert.equal(judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: top, groupBadges: badges(['us', 'de']) }).groups.organic.verdict, 'mismatch');
  assert.equal(judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: top, groupBadges: badges(['de']), rpcWitness: { adsMatches: ['us'] } }).groups.ads.verdict, 'mismatch');
  const blHidden = judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: top, groupBadges: { ...badges(['de']), backlinks: { headingSeen: true, values: ['de'] } } });
  assert.equal(blHidden.groups.backlinks.verdict, 'mismatch');
});

test('final status: a complete readiness run is still incomplete while any scope is not confirmed', () => {
  const ok = { status: 'complete' };
  const allConfirmed = judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: { verdict: 'confirmed' }, groupBadges: { organic: { headingSeen: true, values: ['de'] }, ads: { headingSeen: true, values: ['de'] }, backlinks: { headingSeen: true, values: ['global'] } } });
  assert.equal(finalStatus({ readinessVerdict: ok, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: allConfirmed }).status, 'complete');
  assert.equal(finalStatus({ readinessVerdict: ok, scopeEvidence: { verdict: 'unverified', reason: 'x' }, sectionScopes: allConfirmed }).status, 'incomplete');
  const unpinned = judgeSectionScopes({ requestedScope: 'global', topScope: { verdict: 'confirmed' }, groupBadges: { organic: { headingSeen: true, values: ['de'] }, ads: { headingSeen: true, values: ['de'] }, backlinks: { headingSeen: true, values: ['global'] } } });
  const r = finalStatus({ readinessVerdict: ok, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: unpinned });
  assert.equal(r.status, 'incomplete');
  assert.ok(r.blockers.some((b) => /section-scope-unpinned\(organic/.test(b)));
});

test('end to end: readiness complete on a page whose research groups show a foreign badge ⇒ final status incomplete', async () => {
  const tokens = FULL.flatMap((t) => (t === '自然搜索研究' || t === '广告研究' ? [t, 'DE'] : [t]));
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: tokens }) }), OPTS);
  assert.equal(r.verdict.status, 'complete', 'readiness alone completes');
  assert.deepEqual(r.groupBadges.organic.values, ['de']);
  const scopes = judgeSectionScopes({ requestedScope: 'global', topScope: { verdict: 'confirmed' }, groupBadges: r.groupBadges });
  const final = finalStatus({ readinessVerdict: r.verdict, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: scopes, visibility: r.readiness.visibility });
  assert.equal(final.status, 'incomplete');
  assert.equal(scopes.bySection.topOrganicKeywords.scope, 'de');
});

/* ---------------- 定点滚动 / 缓存二次校验 / 锁定态网络静默 ---------------- */

const BACKLINKS_LIST_TOKENS = BACKLINKS.slice(BACKLINKS.indexOf('引荐页面标题和链接'), BACKLINKS.indexOf('Follow和NoFollow'));
/** 反向链接明细只在 y ∈ [2900, 3100] 时挂载——固定步长（560）滚动的落点 0/560/…/2800/3200 全部跳过它。 */
const narrowWindowSnapshot = ({ y }) => ({ toks: y >= 2900 && y <= 3100 ? FULL : FULL.filter((t) => !BACKLINKS_LIST_TOKENS.includes(t) || t === '反向链接') });

test('targeted pass: a section whose visible window the fixed scroll steps skip is recovered by scrolling to its neighbour title', async () => {
  const without = await runReadiness(fakeIo({ snapshot: narrowWindowSnapshot }), { ...OPTS, timeoutMs: 150_000 });
  assert.equal(without.sections.backlinksList.state, 'not-rendered', 'fixed steps alone miss it (the checker failure)');
  assert.equal(without.verdict.status, 'incomplete');
  const io = fakeIo({ snapshot: narrowWindowSnapshot, scrollToText: () => ({ found: true, y: 2950 }) });
  const withTargeted = await runReadiness(io, { ...OPTS, timeoutMs: 150_000 });
  assert.equal(withTargeted.sections.backlinksList.state, 'data');
  assert.equal(withTargeted.verdict.status, 'complete');
  assert.ok(withTargeted.readiness.targeted.some((t) => t.key === 'backlinksList' && t.reached === 'data'));
  assert.equal(withTargeted.readiness.targeted.find((t) => t.key === 'backlinksList').anchor, '反向链接', 'anchors on its own group heading, not a title several groups back');
});

test('rpc responses completed but captured without a body (2026-09-13 real run: 16/21) ⇒ explicit blocker, never complete', async () => {
  const bodiless = RPC.map((e, i) => (i >= 5 ? { ...e, body: null } : e));
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), rpc: bodiless }), OPTS);
  assert.equal(r.verdict.network.pass, true, 'the requests themselves all completed');
  assert.equal(r.verdict.network.bodies.missing, RPC.length - 5);
  const scopes = judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: { verdict: 'confirmed' }, groupBadges: { organic: { headingSeen: true, values: ['de'] }, ads: { headingSeen: true, values: ['de'] }, backlinks: { headingSeen: true, values: ['global'] } } });
  const final = finalStatus({ readinessVerdict: r.verdict, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: scopes, visibility: r.readiness.visibility });
  assert.equal(final.status, 'incomplete');
  assert.ok(final.blockers.some((b) => b.startsWith(`rpc-bodies-missing(${RPC.length - 5}/${RPC.length}`)), final.blockers.join(' | '));
});

test('body accounting: CDP + in-page hook are merged per response, cross-checked, and counted against resource timing', () => {
  const body = (id, result) => ({ jsonrpc: '2.0', id, result });
  const cdp = [1, 2, 3].map((id) => ({ url: '/dpa/rpc', status: 200, via: 'cdp', body: body(id, { v: id }) }));
  const hook = [2, 3, 4, 5].map((id) => ({ url: '/dpa/rpc', status: 200, via: 'hook', body: JSON.stringify(body(id, { v: id })) }));
  const merged = accountRpcBodies([...cdp, ...hook], { rtCompleted: 5, rtBeforeHook: 1 });
  assert.deepEqual(
    { withBody: merged.withBody, missing: merged.missing, hook: merged.hook, cdp: merged.cdp, overlap: merged.overlap, conflicts: merged.conflicts, preHookRequests: merged.preHookRequests },
    { withBody: 5, missing: 0, hook: 4, cdp: 3, overlap: 2, conflicts: 0, preHookRequests: 1 },
  );
  // 同一个 id 两个来源内容不同 ⇒ 交叉校验失败。
  const conflict = accountRpcBodies([...cdp, { url: '/dpa/rpc', status: 200, via: 'hook', body: JSON.stringify(body(3, { v: 999 })) }], { rtCompleted: 3 });
  assert.equal(conflict.conflicts, 1);
  assert.equal(finalStatus({ readinessVerdict: { status: 'complete', network: { bodies: conflict } }, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: { blockers: [] } }).status, 'incomplete');
  // 截断 / 解析不了的不算拿到了 body。
  const bad = accountRpcBodies([{ url: '/dpa/rpc', status: 200, via: 'hook', body: '{"trunc', bodyTruncated: true }, { url: '/dpa/rpc', status: 200, via: 'hook', body: 'not json' }], { rtCompleted: 2 });
  assert.deepEqual({ withBody: bad.withBody, missing: bad.missing, truncated: bad.truncated, unparsable: bad.unparsable }, { withBody: 0, missing: 2, truncated: 1, unparsable: 1 });
});

test('bodies lost by the CDP capture but held by the in-page hook ⇒ no rpc-bodies-missing blocker', async () => {
  const bodiless = RPC.map((e, i) => (i >= 5 ? { ...e, body: null } : e));
  const hookEntries = RPC.slice(5).map((e) => ({ url: '/dpa/rpc', status: 200, via: 'hook', body: JSON.stringify(e.body) }));
  const r = await runReadiness(fakeIo({ snapshot: () => ({ toks: FULL }), rpc: bodiless, hookEntries, rtBeforeHook: 5 }), OPTS);
  assert.equal(r.verdict.status, 'complete');
  assert.equal(r.verdict.network.bodies.missing, 0);
  assert.equal(r.verdict.network.bodies.cdpWithoutBody, RPC.length - 5, 'the CDP loss is still recorded');
  assert.equal(r.verdict.network.bodies.preHookRequests, 5);
  const scopes = judgeSectionScopes({ requestedScope: 'global', organicDb: 'de', topScope: { verdict: 'confirmed' }, groupBadges: { organic: { headingSeen: true, values: ['de'] }, ads: { headingSeen: true, values: ['de'] }, backlinks: { headingSeen: true, values: ['global'] } } });
  const final = finalStatus({ readinessVerdict: r.verdict, scopeEvidence: { verdict: 'confirmed' }, sectionScopes: scopes, visibility: r.readiness.visibility });
  assert.equal(final.status, 'complete', final.blockers.join(' | '));
});

test('a base64-encoded rpc body is decoded, not silently skipped', () => {
  const payload = JSON.stringify({ jsonrpc: '2.0', id: 1, result: { authorityScore: 7, linkPower: 1, backlinks: 2, referringDomains: 3 } });
  const flat = flattenRpc([{ url: '/dpa/rpc', status: 200, body: `base64:${Buffer.from(payload).toString('base64')}` }]);
  assert.equal(flat.length, 1);
  assert.equal(flat[0].kind, 'authoritySummary');
});

test('targeted pass stays conservative: if the section never renders it remains not-rendered', async () => {
  const neverThere = () => ({ toks: FULL.filter((t) => !BACKLINKS_LIST_TOKENS.includes(t) || t === '反向链接') });
  const r = await runReadiness(fakeIo({ snapshot: neverThere, scrollToText: () => ({ found: true, y: 2950 }) }), { ...OPTS, timeoutMs: 150_000 });
  assert.equal(r.sections.backlinksList.state, 'not-rendered');
  assert.equal(r.verdict.status, 'incomplete');
});

test('sticky cache is dropped once the section is directly observed non-terminal again', async () => {
  const at = FULL.indexOf('主要自然搜索关键词') + 3;
  const kwTokens = ORGANIC.slice(ORGANIC.indexOf('主要自然搜索关键词'), ORGANIC.indexOf('关键主题'));
  const snapshot = ({ t }) => {
    if (t < 20_000) return { toks: FULL };
    if (t < 40_000) return { toks: FULL, placeholders: [{ at, name: 'Skeleton' }] };
    return { toks: FULL.filter((x) => !kwTokens.includes(x)) };
  };
  const r = await runReadiness(fakeIo({ snapshot }), { ...OPTS, timeoutMs: 90_000 });
  assert.notEqual(r.sections.topOrganicKeywords.state, 'data', 'the stale terminal snapshot must not stick after the section re-entered loading');
  assert.equal(r.verdict.status, 'incomplete');
});

test('locked is only terminal with a quiet network', () => {
  const spec = SECTION_SPECS.find((s) => s.key === 'keyTopics');
  const dom = readDomSections(FULL).sections.keyTopics;
  assert.equal(classifySection(spec, dom, true, { hasData: false, rpcKinds: [] }, { quiet: false }).state, 'loading');
  assert.equal(classifySection(spec, dom, true, { hasData: false, rpcKinds: [] }, { quiet: true }).state, 'locked');
});

test('script contract: global by default, --organic-db pins via an explicit visit, scope decided by finalStatus', async () => {
  const source = await readFile(new URL('../scripts/semrush-overview.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /--db not given/, 'the old "no global option" warning must be gone');
  assert.match(source, /const scope = db \|\| 'global'/);
  assert.match(source, /flags\['organic-db'\]/);
  assert.match(source, /accountStateWrites\.push\(/);
  assert.match(source, /judgeSectionScopes\(/);
  assert.match(source, /finalStatus\(/);
  assert.match(source, /sectionScopes: \{ groups: sectionScopes\.groups/);
  assert.match(source, /scrollToText: \(text, occurrence\)/);
});

test('compact display tolerance', () => {
  assert.equal(compactMatches('1.1K', 1076), true);
  assert.equal(compactMatches('1.1K', 1200), false);
  assert.equal(compactMatches('381', 381), true);
});

/* ---------------- 脚本契约 ---------------- */

test('script contract: legacy keys, strict exit code, never closes the tab, arms capture before navigating', async () => {
  const source = await readFile(new URL('../scripts/semrush-overview.mjs', import.meta.url), 'utf8');
  for (const key of ['authorityScore', 'organicTraffic', 'organicTrafficChange', 'paidTraffic', 'referringDomains', 'organicKeywords', 'organicKeywordsChange', 'backlinks']) {
    assert.ok(source.includes(`'${key}'`), `legacy key ${key} must still be emitted`);
  }
  assert.match(source, /status === 'complete' \? \{ metrics: legacy \} : \{ unconfirmedMetrics: legacy \}/);
  assert.match(source, /if \(output\.status !== 'complete'\) process\.exitCode = 1/);
  assert.doesNotMatch(source, /'close'\]/, 'the script must not close the tab/session');
  // 捕获必须在**报表**导航之前布防；--organic-db 的钉住访问是有意放在布防之前的（它发出的 rpc 早于报表页
  // 的 timeOrigin，会被时间戳过滤掉，不计入发出数、不当本页数据）。
  const armAt = source.indexOf("'wait', 'xhr'");
  const reportNavAt = source.indexOf('location.href = ${JSON.stringify(url)}');
  const pinNavAt = source.indexOf('await gotoInTool(evalPage, pinUrl,');
  const hookInjectAt = source.indexOf('return (${HOOK_JS});');
  const landedCheckAt = source.indexOf('assertToolsShareAvailable(await evalPage(');
  assert.ok(reportNavAt > 0 && armAt > 0 && armAt < reportNavAt, 'capture must be armed before the report navigation');
  assert.ok(pinNavAt > 0 && pinNavAt < armAt, 'the --organic-db pin visit happens before arming, so its rpc are not counted');
  assert.ok(hookInjectAt > reportNavAt && hookInjectAt < landedCheckAt, 'the body hook is injected right after navigating, before the settle and landed checks');
  assert.match(source, /routeMismatch\(url, landed\.url\)/, 'the redirect check gotoInTool did must still happen');
  assert.doesNotMatch(source, /\['browser', [^\]]*'open'/, 'navigating with `open` leaves the report blank (2026-09-13)');
});
