// semrush-batch.mjs opens the same domain-overview page as semrush-overview.mjs
// (/analytics/overview/), which DOES have a worldwide option — unlike the
// organic/keyword report pages. 2026-09-13 fix #1: batch.mjs used to warn that
// omitting --db falls back to "whatever country Semrush defaults to", which
// was wrong for this page; it now matches semrush-overview.mjs (no --db =
// global) and reads the page's own region selector back into scopeEvidence
// instead of echoing the requested --db as if it were confirmed fact.
//
// 2026-09-13 fix #2 (this file): semrush-overview.mjs's judgeScope() was
// tightened to require BOTH a DOM witness (region selector) AND an RPC witness
// (country-traffic rows + trend series, via rpcScopeWitness()) before it will
// ever say `confirmed` — DOM alone now tops out at `unverified`. batch.mjs was
// updated to supply that RPC witness too: it arms CDP network capture before
// each domain's navigation, installs the in-page hook after landing, and on
// settle drains both sources through the SAME flattenRpc()/rpcScopeWitness()
// lib-semrush-overview.mjs exports the full semrush-overview.mjs uses (no lib
// changes — see CONFLICT-SCOPE). Rows whose scope never reaches `confirmed`
// now get a new `stopReason: 'scope-unconfirmed'` (not in lib-batch-evidence's
// COMPLETE_STOP_REASONS, so it retries on the next run) and their numbers move
// to unconfirmedOrganicTraffic/unconfirmedAuthorityScore instead of the main
// fields — see applyScopeGate().
//
// 2026-09-14 fix #3 (independent checker's third-round finding): readRpcWitness()
// used to drain the CDP network capture and the in-page hook with NO navigation
// boundary — in the multi-domain loop, a straggling response that belongs to the
// PREVIOUS domain (still in flight when that domain's own drain ran, then
// captured by CDP just before the next domain's arm+navigate) could get mixed
// into the CURRENT domain's scope witness. The fix is to stop hand-rolling the
// drain and use lib-semrush-overview.mjs's `drainRpcWitness()`, which reads the
// CURRENT document's `performance.timeOrigin` and drops any CDP entry whose
// timestamp predates it — exactly the boundary semrush-overview.mjs's own
// runReadiness() already enforces. Same round: `trendContextFromText()` (new lib
// export, innerText-only SEO-card matching) replaces the old "only pick a trend
// series if there's exactly one" fallback, so a domain with two live trend
// series (page-level + research-group-level) can still reach `confirmed`
// instead of always degrading to unverified.
//
// Fully offline: every function under test is extracted via vm with stubbed
// opencli/evaluate/network (no browser, no opencli daemon, no network) and,
// where relevant, exercised against the REAL judgeScope()/SCOPE_PROBE_JS/
// flattenRpc()/rpcScopeWitness()/trendContextFromText()/drainRpcWitness() from
// lib-semrush-overview.mjs (read-only import — that file and semrush-overview.mjs
// are never modified here).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  judgeScope, SCOPE_PROBE_JS, HOOK_TAKE_JS, flattenRpc, rpcScopeWitness,
  trendContextFromText, drainRpcWitness,
} from '../scripts/lib-semrush-overview.mjs';

const source = await readFile(new URL('../scripts/semrush-batch.mjs', import.meta.url), 'utf8');

/** Grab a top-level `function name(...) { ... }` or `async function name(...) { ... }` by name, brace-matched. */
function extractFunction(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  assert.ok(m, `could not find function ${name}() in semrush-batch.mjs`);
  // Depth starts at the BODY's own opening brace (end of the match), not at
  // m.index — a destructured-object parameter contains its own {} pair
  // earlier in the match, which would otherwise be mistaken for the whole
  // function and truncate the extraction right there.
  let depth = 1;
  let i = m.index + m[0].length;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

// ---------------------------------------------------------------------------
// Regression guards on the wiring itself.
// ---------------------------------------------------------------------------
test('no --db is no longer treated as "not global"', () => {
  assert.doesNotMatch(source, /organicTraffic will be whatever country Semrush defaults to/);
  assert.match(source, /const scope = db \|\| 'global';/);
});
test('production imports the shared scope machinery from the lib, not a local reimplementation', () => {
  assert.match(source, /import \{\s*SCOPE_PROBE_JS, judgeScope, HOOK_JS, flattenRpc, rpcScopeWitness, trendContextFromText,\s*armNetworkCapture, drainRpcWitness,\s*\} from '\.\/lib-semrush-overview\.mjs';/);
  assert.match(source, /judgeScope\(\{ requestedDb: db, probe: await evaluate\(SCOPE_PROBE_JS\), rpcWitness \}\)/);
  // Fix #3 regression guard: must delegate to the lib's nav-boundary-aware drain,
  // never hand-roll a raw `network --raw` + HOOK_TAKE_JS merge again.
  assert.match(source, /await drainRpcWitness\(\{/);
  assert.doesNotMatch(source, /'network', '--raw'/, 'must not call opencli network --raw directly — that bypasses drainRpcWitness\'s navStart filtering');
});
test('CDP capture is armed (via the lib\'s armNetworkCapture) before EVERY navigation, not once for the whole run', () => {
  const armIdx = source.indexOf('await armNetworkCapture({');
  const gotoIdx = source.indexOf('await gotoInTool(evaluate,');
  assert.ok(armIdx >= 0 && gotoIdx > armIdx, 'armNetworkCapture() must run, and must run before gotoInTool()');
  // Must be inside the per-domain loop (after the `for (const domain of todo) {` line),
  // not hoisted out to run once before the loop.
  const loopIdx = source.indexOf('for (const domain of todo) {');
  assert.ok(loopIdx >= 0 && loopIdx < armIdx, 'arming must happen inside the per-domain loop');
});
test('the hook is installed right after landing, before the stability poll', () => {
  const gotoIdx = source.indexOf('await gotoInTool(evaluate,');
  const hookIdx = source.indexOf('await evaluate(HOOK_JS)');
  const captureStableIdx = source.indexOf('await captureStable({');
  assert.ok(gotoIdx >= 0 && hookIdx > gotoIdx && captureStableIdx > hookIdx);
});
test('every row carries scope + scopeEvidence (with the section-scope note), not just the echoed request', () => {
  const occurrences = source.match(/const scopeEvidence = await readScope\(rpcWitness\);/g) || [];
  assert.equal(occurrences.length, 2, 'both the success path and the exception path must probe scope with an rpc witness (found ' + occurrences.length + ')');
  assert.match(source, /const base = \{\s*domain,\s*db: db \|\| null,\s*scope,\s*scopeEvidence,\s*rpcEvidence,/);
  assert.match(source, /row = \{\s*domain,\s*db: db \|\| null,\s*scope,\s*scopeEvidence,\s*rpcEvidence,/);
  assert.match(source, /return \{ \.\.\.scopeEvidence, sectionScopeNotApplicable: true, sectionScopeNote: note \};/);
});
test('every row also carries rpcEvidence — the destructured .witness/.rpcEvidence from readRpcWitness, not just the scope verdict', () => {
  const occurrences = source.match(/const \{ witness: rpcWitness, rpcEvidence \} = await readRpcWitness\(/g) || [];
  assert.equal(occurrences.length, 2, 'both the success path and the exception path destructure witness+rpcEvidence from readRpcWitness');
  assert.match(source, /const \{ witness: rpcWitness, rpcEvidence \} = await readRpcWitness\(bodyText\);/, 'success path, no .catch needed — readRpcWitness never throws');
  assert.match(source, /const \{ witness: rpcWitness, rpcEvidence \} = await readRpcWitness\(lastRead\?\.bodyText \?\? ''\)\.catch\(\(\) => \(\{ witness: null, rpcEvidence: \[\] \}\)\);/, 'the exception path must default to an empty evidence array, not undefined, on failure');
  // No response payload ever leaks into the row-level evidence field.
  assert.doesNotMatch(source, /rpcEvidence:.*\bresult\b/);
});
test('the success branch is gated through applyScopeGate(), not written inline again', () => {
  assert.match(source, /\.\.\.applyScopeGate\(m, scopeEvidence\)/);
  // Guard against regressing to the old unconditional-accept shape.
  assert.doesNotMatch(source, /organicTraffic: m\.organicTraffic,\s*\n\s*authorityScore: m\.authorityScore,\s*\n\s*parse: 'parsed',\s*\n\s*stopReason: 'stable',/);
});

// ---------------------------------------------------------------------------
// applyScopeGate() — pure, no vm needed to reason about, but extracted from
// the real file so a future edit can't silently diverge from what ships.
// ---------------------------------------------------------------------------
function loadPureHelpers() {
  const context = vm.createContext({});
  const src = [extractFunction(source, 'applyScopeGate'), extractFunction(source, 'attachSectionScopeNote')].join('\n');
  vm.runInContext(`${src}\nthis.applyScopeGate = applyScopeGate; this.attachSectionScopeNote = attachSectionScopeNote;`, context);
  return context;
}

test('applyScopeGate: confirmed scope keeps the numbers in the main fields', () => {
  // Field-by-field, not assert.deepEqual: `out` is an object literal built inside a
  // vm context (a different V8 realm), so its Object.prototype differs from this
  // realm's — deepStrictEqual would fail on prototype identity even though every
  // value matches ("same structure but not reference-equal").
  const { applyScopeGate } = loadPureHelpers();
  const out = applyScopeGate({ organicTraffic: 7800, authorityScore: 30 }, { verdict: 'confirmed' });
  assert.equal(out.organicTraffic, 7800);
  assert.equal(out.authorityScore, 30);
  assert.equal(out.parse, 'parsed');
  assert.equal(out.stopReason, 'stable');
  assert.equal(out.error, null);
  assert.equal(out.unconfirmedOrganicTraffic, undefined, 'confirmed rows must not also carry unconfirmed fields');
});
for (const [label, evidence] of [
  ['mismatch', { verdict: 'mismatch', reason: 'landed URL carries db=jp' }],
  ['unverified', { verdict: 'unverified', reason: 'no RPC witness' }],
  ['missing scopeEvidence', null],
]) {
  test(`applyScopeGate: ${label} withholds organicTraffic/authorityScore and moves them to unconfirmed*`, () => {
    const { applyScopeGate } = loadPureHelpers();
    const out = applyScopeGate({ organicTraffic: 7800, authorityScore: 30 }, evidence);
    assert.equal(out.organicTraffic, null);
    assert.equal(out.authorityScore, null);
    assert.equal(out.unconfirmedOrganicTraffic, 7800);
    assert.equal(out.unconfirmedAuthorityScore, 30);
    assert.equal(out.stopReason, 'scope-unconfirmed');
    assert.match(out.error, /scope not confirmed/);
  });
}
test('attachSectionScopeNote: flags that group-level (organic/ads) scope was never assessed', () => {
  const { attachSectionScopeNote } = loadPureHelpers();
  const out = attachSectionScopeNote({ verdict: 'confirmed' });
  assert.equal(out.verdict, 'confirmed', 'underlying verdict must survive untouched');
  assert.equal(out.sectionScopeNotApplicable, true);
  assert.match(out.sectionScopeNote, /自然搜索研究|广告研究|organic|ads/i);
});

// ---------------------------------------------------------------------------
// readScope(rpcWitness) — the two-witness judgeScope() integration.
// ---------------------------------------------------------------------------
function makeReadScope({ db, scope, evaluate }) {
  const context = vm.createContext({
    db, scope, evaluate, judgeScope, SCOPE_PROBE_JS,
    redactSecrets: (s) => String(s),
  });
  const src = [extractFunction(source, 'readScope'), extractFunction(source, 'attachSectionScopeNote')].join('\n');
  vm.runInContext(`${src}\nthis.readScope = readScope;`, context);
  return context.readScope;
}

test('global request, DOM consistent, no RPC witness supplied: unverified (honest degrade), not confirmed', async () => {
  const readScope = makeReadScope({
    db: '', scope: 'global',
    evaluate: async () => ({ urlDb: null, candidates: [{ label: '全世界', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const result = await readScope(null);
  assert.equal(result.verdict, 'unverified');
  assert.match(result.reason, /no RPC witness/);
  assert.equal(result.sectionScopeNotApplicable, true, 'readScope must still attach the section-scope note on every path');
});

test('global request, DOM consistent AND an RPC witness whose trend exceeds every country: confirmed', async () => {
  const readScope = makeReadScope({
    db: '', scope: 'global',
    evaluate: async () => ({ urlDb: null, candidates: [{ label: '全世界', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const rpcWitness = { trendPositions: 900, maxCountryPositions: 500, trendExceedsEveryCountry: true, topMatches: [] };
  const result = await readScope(rpcWitness);
  assert.equal(result.verdict, 'confirmed');
  assert.equal(result.sectionScopeNotApplicable, true);
});

test('global request but account state drifted to a country: mismatch regardless of RPC witness', async () => {
  const readScope = makeReadScope({
    db: '', scope: 'global',
    evaluate: async () => ({ urlDb: 'jp', candidates: [{ label: 'JP', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const result = await readScope({ trendPositions: 900, maxCountryPositions: 500, trendExceedsEveryCountry: true, topMatches: [] });
  assert.equal(result.verdict, 'mismatch');
});

test('explicit --db, DOM pill checked AND RPC trend matches that country row: confirmed', async () => {
  const readScope = makeReadScope({
    db: 'us', scope: 'us',
    evaluate: async () => ({ urlDb: 'us', candidates: [{ label: 'US', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const rpcWitness = { trendPositions: 500, maxCountryPositions: 500, trendExceedsEveryCountry: false, topMatches: ['us'] };
  const result = await readScope(rpcWitness);
  assert.equal(result.verdict, 'confirmed');
});

test('explicit --db, DOM-only (RPC does not corroborate): unverified, not confirmed', async () => {
  const readScope = makeReadScope({
    db: 'us', scope: 'us',
    evaluate: async () => ({ urlDb: 'us', candidates: [{ label: 'US', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const result = await readScope(null);
  assert.equal(result.verdict, 'unverified');
});

test('explicit --db but the page checks a different country: mismatch', async () => {
  const readScope = makeReadScope({
    db: 'us', scope: 'us',
    evaluate: async () => ({ urlDb: 'de', candidates: [{ label: 'DE', chain: [{ depth: 0, tag: 'button', 'aria-checked': 'true' }] }] }),
  });
  const result = await readScope({ trendPositions: 500, maxCountryPositions: 500, trendExceedsEveryCountry: false, topMatches: ['de'] });
  assert.equal(result.verdict, 'mismatch');
});

test('probe failure (e.g. page not settled) is unverified, never confirmed by default', async () => {
  const readScope = makeReadScope({
    db: 'us', scope: 'us',
    evaluate: async () => { throw new Error('eval timed out'); },
  });
  const result = await readScope(null);
  assert.equal(result.verdict, 'unverified');
  assert.equal(result.requested, 'us');
  assert.match(result.reason, /scope probe failed/);
});

// ---------------------------------------------------------------------------
// readRpcWitness(bodyText) — now a thin wrapper around the lib's own
// drainRpcWitness() (nav-boundary filtering) + trendContextFromText() (two-series
// disambiguation), recombined via flattenRpc()/rpcScopeWitness(). opencli/evaluate
// are stubbed; drainRpcWitness/flattenRpc/trendContextFromText/rpcScopeWitness are
// the REAL lib functions, so this is a genuine integration test of the fix, not a
// reimplementation of it.
// ---------------------------------------------------------------------------
function makeReadRpcWitness({ networkRawEntries, hookEntries, networkRawFails = false, netProbe = { timeOrigin: 0, rtCount: 0, rtBeforeHook: null } }) {
  const calls = { opencli: [], evaluate: [] };
  const witnessKindsDecl = source.match(/const WITNESS_KINDS = .*;/)[0];
  const context = vm.createContext({
    launched: { session: 's1', env: {} }, session: 's1',
    drainRpcWitness, flattenRpc, trendContextFromText, rpcScopeWitness,
    opencli: async (args) => {
      calls.opencli.push(args);
      if (networkRawFails) throw new Error('opencli boom');
      return { stdout: JSON.stringify({ entries: networkRawEntries }) };
    },
    evaluate: async (js) => {
      calls.evaluate.push(js);
      // Exact match first: readRpcWitness's OWN navStart read (for rpcEvidence's
      // msFromNavStart) is a short, distinct expression from drainRpcWitness's own
      // inline net-timing probe below — both mention "timeOrigin", order matters.
      if (js === '(() => performance.timeOrigin)()') return netProbe.timeOrigin ?? 0;
      if (js.includes('timeOrigin')) return netProbe;   // drainRpcWitness's own inline net-timing probe
      if (js.includes('__ovRpc')) return hookEntries;    // HOOK_TAKE_JS
      throw new Error(`unexpected evalPage call in test: ${js.slice(0, 60)}`);
    },
  });
  vm.runInContext(`${witnessKindsDecl}\n${extractFunction(source, 'readRpcWitness')};this.readRpcWitness = readRpcWitness;`, context);
  return { readRpcWitness: context.readRpcWitness, calls };
}

const COUNTRIES_ROW = { database: 'us', organicTraffic: 1000, rank: 5, positions: 500 };
const COUNTRIES_ROW_DE = { database: 'de', organicTraffic: 200, rank: 20, positions: 100 };
// A trend series needs >= 2 points: trendGranularity() only labels it daily/monthly
// (the only two keys latestTrendRow() looks at) once it can measure a date gap;
// a single point is classified 'unknown' and latestTrendRow() would return null.
const GLOBAL_TREND_ROWS = [
  { date: '20260701', organicTraffic: 4800, adwordsTraffic: 0, positions: 880 },
  { date: '20260801', organicTraffic: 5000, adwordsTraffic: 0, positions: 900 },
];

test('readRpcWitness merges the CDP drain and the hook capture into one witness (no stale entries in play)', async () => {
  const { readRpcWitness, calls } = makeReadRpcWitness({
    networkRawEntries: [{ url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1000, body: JSON.stringify([{ id: 1, result: [COUNTRIES_ROW, COUNTRIES_ROW_DE] }]) }],
    hookEntries: [{ via: 'hook', url: '/dpa/rpc', status: 200, body: JSON.stringify([{ id: 2, result: GLOBAL_TREND_ROWS }]) }],
  });
  const { witness, rpcEvidence } = await readRpcWitness('');
  assert.equal(witness.trendPositions, 900);
  assert.equal(witness.maxCountryPositions, 500);
  assert.equal(witness.trendExceedsEveryCountry, true, 'global trend (900) must exceed every single country row (max 500)');
  assert.equal(calls.opencli.length, 1);
  // Array.from(...) instead of assert.deepEqual: the array was built inside a vm
  // context (a different realm), so its Array.prototype differs from this realm's.
  assert.deepEqual(Array.from(calls.opencli[0]).slice(0, 3), ['browser', 's1', 'network']);

  // 2026-09-14 fix (checker's audit-granularity finding): every row should carry
  // enough metadata to reconstruct "was this evidence actually this domain's own".
  const evidence = Array.from(rpcEvidence).map((e) => ({ ...e }));
  assert.equal(evidence.length, 2, 'the googleCountries record (CDP) and the trend record (hook)');
  const cdpRow = evidence.find((e) => e.kind === 'googleCountries');
  const hookRow = evidence.find((e) => e.kind === 'trend');
  assert.equal(cdpRow.id, 1);
  assert.equal(cdpRow.timestamp, 1000);
  assert.equal(cdpRow.msFromNavStart, 1000, 'navStart is 0 in this fixture (netProbe.timeOrigin default)');
  assert.equal(hookRow.id, 2);
  assert.equal(hookRow.timestamp, null, 'the hook entry fixture never set a timestamp');
  assert.equal(hookRow.msFromNavStart, null, 'a missing timestamp must stay null, not silently become "0 minus navStart"');
  // No response payload anywhere in the evidence — just id/kind/timestamp/offset.
  for (const row of evidence) assert.deepEqual(Object.keys(row).sort(), ['id', 'kind', 'msFromNavStart', 'timestamp']);
});

// The exact bug the third-round checker flagged: a response that belongs to the
// PREVIOUS domain, still sitting in the CDP capture buffer (which is tab-level and
// survives navigation) when the CURRENT domain drains. drainRpcWitness()'s navStart
// filter (performance.timeOrigin of the NEW document) is what must reject it.
test('readRpcWitness ignores a stale CDP entry from a previous domain\'s navigation (fix #3)', async () => {
  const STALE_DE_ROW = { database: 'de', organicTraffic: 999999, rank: 1, positions: 99999 };   // deliberately extreme so contamination would be obvious
  const CURRENT_US_ROW = { database: 'us', organicTraffic: 7800, rank: 5, positions: 503 };
  const { readRpcWitness } = makeReadRpcWitness({
    netProbe: { timeOrigin: 2_000_000, rtCount: 1, rtBeforeHook: null },   // current document's nav started at t=2,000,000
    networkRawEntries: [
      // Left over from the PREVIOUS domain — timestamped well before this navigation's timeOrigin.
      { url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1_000_000, body: JSON.stringify([{ id: 1, result: [STALE_DE_ROW] }]) },
      // This domain's own response, timestamped after timeOrigin.
      { url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 2_000_050, body: JSON.stringify([{ id: 2, result: [CURRENT_US_ROW] }]) },
    ],
    hookEntries: [],
  });
  const { witness, rpcEvidence } = await readRpcWitness('');
  assert.equal(witness.countriesSeen, 1, 'the stale de row must be dropped, leaving only the current us row');
  assert.equal(witness.maxCountryPositions, 503, 'must not be 99999 — that number belongs to the previous domain');
  assert.doesNotMatch(JSON.stringify(witness), /99999/, 'the stale extreme value must not leak into the witness at all');

  // The audit trail itself must also show only one record (id 2, the current
  // domain's) — the stale id-1 record must not appear even as a filtered-out-but-
  // still-listed entry, and its far-negative offset must not show up anywhere.
  const evidence = Array.from(rpcEvidence).map((e) => ({ ...e }));
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].id, 2);
  assert.equal(evidence[0].timestamp, 2_000_050);
  assert.equal(evidence[0].msFromNavStart, 50, 'landed 50ms after this domain\'s own navigation start — a healthy, small offset');
});

// Companion case: the stale entry sits exactly at the fix's own tolerance boundary
// (drainRpcWitness allows a 5ms grace window: `stampOf(e) < navStart - 5`).
test('readRpcWitness: an entry within the 5ms grace window of navStart is still kept, not treated as stale', async () => {
  const { readRpcWitness } = makeReadRpcWitness({
    netProbe: { timeOrigin: 2_000_000, rtCount: 1, rtBeforeHook: null },
    networkRawEntries: [
      { url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1_999_998, body: JSON.stringify([{ id: 1, result: [COUNTRIES_ROW] }]) },
    ],
    hookEntries: [],
  });
  const { witness, rpcEvidence } = await readRpcWitness('');
  assert.equal(witness.countriesSeen, 1);
});

// Fix #2: two live (non-stale) trend series in the same load — page-level and the
// "自然搜索研究/广告研究" research-group level. The old "only pick a series when
// there is exactly one" rule gave up here (→ unverified forever, batch.mjs's
// documented known limitation). trendContextFromText() reads the SEO card's
// displayed 自然搜索关键词/自然流量 straight out of innerText and picks the
// matching series instead.
const PAGE_TREND_ROWS = [
  { date: '20260701', organicTraffic: 7600, adwordsTraffic: 0, positions: 490 },
  { date: '20260801', organicTraffic: 7800, adwordsTraffic: 0, positions: 503 },
];
const RESEARCH_GROUP_TREND_ROWS = [
  { date: '20260701', organicTraffic: 3100, adwordsTraffic: 0, positions: 190 },
  { date: '20260801', organicTraffic: 3300, adwordsTraffic: 0, positions: 205 },
];
const SEO_CARD_BODY_TEXT = [
  'Authority Score', '30', '高', '自然流量', '7.8K', '+23%', '付费流量', '0',
  '引荐域名', '381', '流量比例', '21%', '自然搜索关键词', '503', '-6%',
  '付费关键词', '0', '反向链接', '1.1K', '按国家/地区划分',
].join('\n');

test('readRpcWitness disambiguates two simultaneous trend series via the SEO card text (fixes the old "give up with two series" limitation)', async () => {
  const { readRpcWitness } = makeReadRpcWitness({
    networkRawEntries: [{
      url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1000,
      body: JSON.stringify([
        { id: 1, result: [{ database: 'us', organicTraffic: 7800, rank: 5, positions: 503 }] },
        { id: 2, result: PAGE_TREND_ROWS },
        { id: 3, result: RESEARCH_GROUP_TREND_ROWS },
      ]),
    }],
    hookEntries: [],
  });
  const { witness, rpcEvidence } = await readRpcWitness(SEO_CARD_BODY_TEXT);
  assert.equal(witness.trendPositions, 503, 'must pick the page-level series the SEO card confirms, not the 205 research-group one');
  assert.deepEqual(Array.from(witness.topMatches), ['us']);
});

test('readRpcWitness: same two-series page but no readable SEO card text falls back to the old single-series rule (honest unverified, not a guess)', async () => {
  const { readRpcWitness } = makeReadRpcWitness({
    networkRawEntries: [{
      url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1000,
      body: JSON.stringify([
        { id: 1, result: [{ database: 'us', organicTraffic: 7800, rank: 5, positions: 503 }] },
        { id: 2, result: PAGE_TREND_ROWS },
        { id: 3, result: RESEARCH_GROUP_TREND_ROWS },
      ]),
    }],
    hookEntries: [],
  });
  const { witness, rpcEvidence } = await readRpcWitness('page still rendering, no Authority Score line yet');
  assert.equal(witness.trendPositions, null, 'two series and no SEO-card evidence to break the tie: must not guess either one');
});

// Both the CDP-drain call and the hook-take call inside drainRpcWitness() are
// independent await points — a broken drain must not be masked as "no witness at
// all" if the lib itself still returns something; readRpcWitness's own try/catch
// is defense-in-depth for the whole call throwing (e.g. opencli itself rejecting).
test('readRpcWitness: a broken opencli drain never throws — returns null, judgeScope treats that as unverified', async () => {
  const { readRpcWitness } = makeReadRpcWitness({ networkRawFails: true, hookEntries: [] });
  const { witness, rpcEvidence } = await readRpcWitness('');
  assert.equal(witness, null);
  assert.deepEqual(Array.from(rpcEvidence), [], 'a hard failure must not leave stale evidence behind either');
});

test('readRpcWitness with only country rows and no trend series still returns a (mostly empty) witness, not a crash', async () => {
  const { readRpcWitness } = makeReadRpcWitness({
    networkRawEntries: [{ url: 'https://sem.3ue.co/dpa/rpc', status: 200, timestamp: 1000, body: JSON.stringify([{ id: 1, result: [COUNTRIES_ROW] }]) }],
    hookEntries: [],
  });
  const { witness, rpcEvidence } = await readRpcWitness('');
  assert.equal(witness.trendPositions, null);
  assert.equal(witness.trendExceedsEveryCountry, false);
});
