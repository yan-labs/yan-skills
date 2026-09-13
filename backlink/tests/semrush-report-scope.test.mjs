// semrush-report.mjs country-scope hardening, 2026-09-13.
//
// Ground truth (see backlink/references/authorized-data-sources.md and the
// scratchpad research it's built from): organic-overview / organic-positions /
// organic-pages / keyword-magic / keyword-overview have NO worldwide selector,
// and the country they land on without --db is unpredictable — same account,
// same session, observed drifting us → jp → kr with nothing changed on our
// end. So these five must now hard-fail (exit 2) instead of just warning.
// backlinks-list / referring-domains / backlinks-overview are not country-
// scoped at all and must be unaffected.
//
// Fully offline. Never spawns the script past its own argument-validation
// guard (the guard calls process.exit(2) before ever touching opencli/the
// browser) and never imports launchTool/opencli. The exit-guard itself is
// extracted via vm with a stubbed `process.exit` so no process ever actually
// exits during the test run.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../scripts/semrush-report.mjs', import.meta.url), 'utf8');

const REPORT_KEYS = [
  'organic-overview', 'organic-positions', 'organic-pages', 'backlinks-list',
  'referring-domains', 'keyword-magic', 'keyword-overview', 'backlinks-overview',
];
const COUNTRY_SCOPED = new Set(['organic-overview', 'organic-positions', 'organic-pages', 'keyword-magic', 'keyword-overview']);

/** Pull one report's `path: (...) => ...` arrow function out as standalone, evaluable text. */
function extractPathFn(key) {
  const keyIdx = source.indexOf(`'${key}': {`);
  assert.ok(keyIdx >= 0, `report block not found: ${key}`);
  const pathIdx = source.indexOf('path:', keyIdx);
  assert.ok(pathIdx >= 0 && pathIdx < keyIdx + 600, `path: not found near '${key}'`);
  const after = source.slice(pathIdx + 'path:'.length);
  const nextField = after.match(/\n\s{4}\w+:/);
  const nextComment = after.search(/\n\s*\/\//);
  const candidates = [after.length, nextField ? nextField.index : Infinity, nextComment >= 0 ? nextComment : Infinity];
  const cut = Math.min(...candidates);
  const fnText = after.slice(0, cut).trim().replace(/,\s*$/, '');
  // Each path() is self-contained (only uses the global encodeURIComponent) —
  // safe to eval in isolation, same trick semrush-keyword-summary.test.mjs
  // uses (via vm) to pull pure functions out of a script with side-effecting
  // top-level code.
  // eslint-disable-next-line no-eval
  return (0, eval)(fnText);
}

test('REPORTS covers exactly the 8 known report types (no silent addition/removal)', () => {
  for (const key of REPORT_KEYS) assert.match(source, new RegExp(`'${key}':\\s*\\{`), key);
});

test("path() arity is the single source of truth needsCountryDb relies on", () => {
  for (const key of REPORT_KEYS) {
    const fn = extractPathFn(key);
    const wantsDb = COUNTRY_SCOPED.has(key);
    assert.equal(fn.length >= 2, wantsDb, `${key}: path() has arity ${fn.length}, expected ${wantsDb ? '>= 2 (takes db)' : '1 (no db)'}`);
  }
});

test('country-scoped report URLs carry db=; the three backlink reports never do', () => {
  for (const key of REPORT_KEYS) {
    const fn = extractPathFn(key);
    if (COUNTRY_SCOPED.has(key)) {
      assert.match(fn('example.com', 'us'), /[?&]db=us(&|$)/, key);
    } else {
      assert.doesNotMatch(fn('example.com'), /[?&]db=/, key);
    }
  }
});

test('needsCountryDb is derived from path.length, not a hand-kept report-name list', () => {
  assert.match(source, /const needsCountryDb = Boolean\(spec && spec\.path\.length >= 2\);/);
  assert.doesNotMatch(source, /spec\.needs !== 'keyword'/, 'the old keyword exemption from the --db check must be gone');
});

test('scope + scopeEvidence are emitted on both the success and the failure output', () => {
  assert.match(source, /import \{ SCOPE_PROBE_JS, judgeScope \} from '\.\/lib-semrush-overview\.mjs';/);
  assert.match(source, /async function readScopeEvidence\(\)/);
  assert.match(source, /const scopeEvidence = needsCountryDb \? await readScopeEvidence\(\) : null;/);
  assert.match(source, /const scopeEvidence = launched && needsCountryDb \? await readScopeEvidence\(\)\.catch\(\(\) => null\) : null;/);
  // Both output object literals must include the two fields, not just db.
  assert.match(source, /report: name,\s*\n\s*target,\s*\n\s*db: db \|\| null,\s*\n\s*scope,\s*\n\s*scopeEvidence,/);
  assert.match(source, /report: name, target, db: db \|\| null, scope, scopeEvidence, session,/);
});

// --- Exercise the exit(2) guard offline, with process.exit stubbed to record
// instead of actually exiting the test runner. ---
const guardStart = source.indexOf("if (!flags['self-test'] && needsCountryDb && !dbGiven) {");
const guardEnd = source.indexOf('\n}\n', guardStart) + 2;
assert.ok(guardStart >= 0 && guardEnd > guardStart, 'could not locate the --db exit guard');

function runGuard({ selfTest, needsCountryDb, dbGiven, name }) {
  const calls = { exits: [], errors: [] };
  const context = vm.createContext({
    flags: { 'self-test': selfTest },
    needsCountryDb, dbGiven, name,
    console: { error: (...args) => calls.errors.push(args.join(' ')) },
    process: { exit: (code) => { calls.exits.push(code); throw new Error('__exit__'); } },
  });
  try {
    vm.runInContext(source.slice(guardStart, guardEnd), context);
  } catch (e) {
    if (e.message !== '__exit__') throw e;
  }
  return calls;
}

test('missing --db on a country-scoped report exits 2 with an explanatory message', () => {
  const calls = runGuard({ selfTest: false, needsCountryDb: true, dbGiven: false, name: 'organic-overview' });
  assert.deepEqual(calls.exits, [2]);
  assert.match(calls.errors[0], /organic-overview/);
  assert.match(calls.errors[0], /没有全球选项/);
  assert.match(calls.errors[0], /不可预测/);
});

test('missing --db on a non-country report (backlinks-overview) does not exit', () => {
  const calls = runGuard({ selfTest: false, needsCountryDb: false, dbGiven: false, name: 'backlinks-overview' });
  assert.deepEqual(calls.exits, []);
  assert.deepEqual(calls.errors, []);
});

test('explicit --db on a country-scoped report does not exit', () => {
  const calls = runGuard({ selfTest: false, needsCountryDb: true, dbGiven: true, name: 'organic-overview' });
  assert.deepEqual(calls.exits, []);
});

test('--self-test bypasses the guard even with needsCountryDb and no --db', () => {
  const calls = runGuard({ selfTest: true, needsCountryDb: true, dbGiven: false, name: 'keyword-overview' });
  assert.deepEqual(calls.exits, []);
});

// ---------------------------------------------------------------------------
// 2026-09-14 fix: judgeScope() without an rpcWitness can structurally never
// reach `confirmed` for these five reports (this script has no CDP/hook
// infrastructure at all, and the shape of whatever network calls these five
// pages make has never been verified — see the file's readScopeEvidence()
// comment and authorized-data-sources.md's "report.mjs 口径证据现状与实测计划").
// Instead of shipping a guessed-at RPC witness, `unverified` rows whose reason
// shows the DOM half was actually fine ("DOM ok, ...") get relabeled
// `dom-only` — distinct from a real `unverified` (DOM itself unreadable) or
// `mismatch` (DOM contradicts the request). demoteUnverifiedDomOnly() is a
// pure, dependency-free function extracted straight from the shipped file.
// ---------------------------------------------------------------------------
function extractFunction(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  assert.ok(m, `could not find function ${name}() in semrush-report.mjs`);
  // Depth starts at the BODY's own opening brace (end of the match), not at
  // m.index — a destructured-object parameter, e.g. `({ paginated, ... })`,
  // contains its own {}  pair earlier in the match, which would otherwise be
  // mistaken for the whole function and truncate the extraction right there.
  let depth = 1;
  let i = m.index + m[0].length;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}
function loadDemote() {
  const context = vm.createContext({});
  vm.runInContext(`${extractFunction(source, 'demoteUnverifiedDomOnly')};this.demoteUnverifiedDomOnly = demoteUnverifiedDomOnly;`, context);
  return context.demoteUnverifiedDomOnly;
}

test('readScopeEvidence routes judgeScope\'s result through demoteUnverifiedDomOnly', () => {
  assert.match(source, /return demoteUnverifiedDomOnly\(judgeScope\(\{ requestedDb: db, probe: await evalPage\(SCOPE_PROBE_JS\) \}\)\);/);
});

test('demoteUnverifiedDomOnly: "DOM ok, RPC not confirmed" (checker\'s exact C2 finding) becomes dom-only', () => {
  const demote = loadDemote();
  const out = demote({ requested: 'us', verdict: 'unverified', reason: 'DOM ok, RPC not confirmed (matches: none)', dom: { urlDb: 'us', checkedPills: ['us'] } });
  assert.equal(out.verdict, 'dom-only');
  assert.equal(out.reason, 'DOM ok, RPC not confirmed (matches: none)', 'the original reason must survive, not be overwritten');
  assert.match(out.domOnlyNote, /接口|RPC|见证/);
  assert.equal(out.dom.urlDb, 'us', 'the rest of the judgeScope() result must pass through untouched');
});

test('demoteUnverifiedDomOnly: a real mismatch is never softened', () => {
  const demote = loadDemote();
  const out = demote({ requested: 'us', verdict: 'mismatch', reason: 'requested db=us but landed URL carries db=de' });
  assert.equal(out.verdict, 'mismatch');
  assert.equal(out.domOnlyNote, undefined);
});

test('demoteUnverifiedDomOnly: unverified because the DOM itself could not be read is left alone', () => {
  const demote = loadDemote();
  const out = demote({ requested: 'us', verdict: 'unverified', reason: 'no country pill exposes aria-checked, cannot rule out a selected country' });
  assert.equal(out.verdict, 'unverified');
  assert.equal(out.domOnlyNote, undefined);
});

test('demoteUnverifiedDomOnly: confirmed passes through untouched (in case a future rpcWitness gets wired in)', () => {
  const demote = loadDemote();
  const out = demote({ requested: 'us', verdict: 'confirmed', reason: 'DOM (pill checked) and RPC trend keywords 503 = us row' });
  assert.equal(out.verdict, 'confirmed');
});

test('demoteUnverifiedDomOnly: a missing/malformed result never throws', () => {
  const demote = loadDemote();
  assert.equal(demote(null), null);
  assert.equal(demote(undefined), undefined);
});

// ---------------------------------------------------------------------------
// 2026-09-14 fix: a paginated/virtualized report used to be able to reach the
// success output with NO top-level signal that pagination was cut short, the
// parser lost rows, or the table was virtual-scroll-truncated — those three
// were only ever `console.error`'d. assessCompleteness() is the pure function
// that now decides `status`/`completenessBlockers` from the very same
// `reportCoverage()`/pagination values the script already computes.
// ---------------------------------------------------------------------------
function loadAssessCompleteness() {
  const context = vm.createContext({});
  vm.runInContext(`${extractFunction(source, 'assessCompleteness')};this.assessCompleteness = assessCompleteness;`, context);
  return context.assessCompleteness;
}
function loadReadPageInfo() {
  const context = vm.createContext({});
  vm.runInContext(`${extractFunction(source, 'readPageInfo')};this.readPageInfo = readPageInfo;`, context);
  return context.readPageInfo;
}
function loadReportCoverage() {
  const context = vm.createContext({});
  const defaultRecordLine = source.match(/const DEFAULT_RECORD_LINE = .*;/)[0];
  vm.runInContext(`${defaultRecordLine}\n${extractFunction(source, 'reportCoverage')};this.reportCoverage = reportCoverage;`, context);
  return context.reportCoverage;
}

// ---------------------------------------------------------------------------
// readPageInfo() — 2026-09-14 fix (requirement 1/2, the coordinator's exact
// finding): an unparseable pager used to silently default to {current:1, total:1}
// ("only one page"), which feeds straight into assessCompleteness's primary
// pagination-incomplete check. Now it says so via `unverifiable:true` instead.
// ---------------------------------------------------------------------------
test('readPageInfo: reads the Chinese "页码：X / Y" pager', () => {
  const readPageInfo = loadReadPageInfo();
  const out = readPageInfo('some content\n页码：\n2 / 6\nmore content');
  assert.equal(out.total, 6);
  assert.equal(out.unverifiable, false);
});
test('readPageInfo: reads the English "Page: X of Y" pager', () => {
  const readPageInfo = loadReadPageInfo();
  const out = readPageInfo('some content\nPage:\nof\n12\nmore content');
  assert.equal(out.total, 12);
  assert.equal(out.unverifiable, false);
});
// This is the runE shape, desensitized: keyword-magic's real body text never matched
// either pager regex in that run (pageSelfReportedTotal came back null there too, for
// the same underlying reason — the page just doesn't render text this parser knows).
test('readPageInfo: unparseable pager text (the runE shape) is unverifiable, not silently "1 of 1"', () => {
  const readPageInfo = loadReadPageInfo();
  const out = readPageInfo('关键词魔法工具\n搜索量\n关键词难度\n(no recognizable pager text anywhere in this body)');
  assert.equal(out.unverifiable, true);
  assert.equal(out.total, 1, 'the placeholder value is still 1, but callers must gate on unverifiable, not trust it');
});

// ---------------------------------------------------------------------------
// reportCoverage() — same fix, for the headline-total half of the same landmine.
// ---------------------------------------------------------------------------
test('reportCoverage: organic-positions headline total parsed and compared against raw rows (existing behavior, unaffected)', () => {
  const reportCoverage = loadReportCoverage();
  const body = '自然搜索排名：\n503\nhttps://example.com/a\nhttps://example.com/b';
  const out = reportCoverage('organic-positions', [body], 2, {});
  assert.equal(out.pageSelfReportedTotal, 503);
  assert.equal(out.virtualScrollTruncated, true);
  assert.equal(out.totalUnverifiable, false, 'the total WAS readable, so it is not the unverifiable case');
});
// The runE shape, desensitized: keyword-magic's headline never parses (no branch for
// its wording), but crossPageTotal:true means the per-page virtual-scroll check does
// not apply to it in the first place — pagination.pages is its completeness signal.
test('reportCoverage: crossPageTotal report (keyword-magic-shaped) with no parseable headline is NOT flagged totalUnverifiable', () => {
  const reportCoverage = loadReportCoverage();
  const body = '关键词魔法工具​\nkeyword one​\nkeyword two​';
  const out = reportCoverage('keyword-magic', [body], 2, { crossPageTotal: true, recordLine: (l) => l.endsWith('​') && !l.startsWith('​') });
  assert.equal(out.pageSelfReportedTotal, null);
  assert.equal(out.virtualScrollTruncated, false);
  assert.equal(out.totalUnverifiable, false, 'crossPageTotal reports delegate completeness to pagination, not the headline');
});
// This is the coordinator's exact hypothetical made concrete: a report shaped like
// organic-pages (paginated, NOT crossPageTotal) whose headline text this run could not
// parse at all (e.g. a wording variant the regex has never seen).
test('reportCoverage: non-crossPageTotal report with no parseable headline IS flagged totalUnverifiable', () => {
  const reportCoverage = loadReportCoverage();
  const body = 'some unrecognized headline wording\nhttps://example.com/page-a\nhttps://example.com/page-b';
  const out = reportCoverage('organic-pages', [body], 2, {});
  assert.equal(out.pageSelfReportedTotal, null);
  assert.equal(out.totalUnverifiable, true);
});

test('production wires reportCoverage/pagination through assessCompleteness, not straight into output', () => {
  assert.match(source, /const \{ status, completenessBlockers, pagesCaptured, pagesTotal \} = assessCompleteness\(\{/);
  assert.match(source, /pageCountUnverifiable: Boolean\(spec\.paginated\) && Boolean\(pageInfo\.unverifiable\),/);
  assert.match(source, /status,\s*\n\s*completenessBlockers: completenessBlockers\.length \? completenessBlockers : null,/);
  assert.match(source, /pagesCaptured, pagesTotal,/);
  assert.match(source, /else if \(output\.status === 'unverified'\) process\.exitCode = 3;/);
  // partial-by-design must exit like complete (0), not join unavailable/unverified's
  // non-zero exits — it is the caller's own choice (no --all-pages), not a defect.
  assert.doesNotMatch(source, /'partial-by-design'\) process\.exitCode/);
});

test('assessCompleteness: non-paginated report with clean coverage is complete', () => {
  const assess = loadAssessCompleteness();
  const out = assess({ paginated: false, pagesRead: 1, totalPages: 1, paginationVerdict: null, stoppedBecause: null, coverage: null });
  assert.equal(out.status, 'complete');
  assert.equal(out.completenessBlockers.length, 0);
  assert.equal(out.pagesCaptured, 1);
  assert.equal(out.pagesTotal, null, 'a non-paginated report has no page total to report');
});

test('assessCompleteness: paginated report that read every page and matches raw/parsed counts is complete', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 3, totalPages: 3, paginationVerdict: 'complete', stoppedBecause: null,
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 30, parsedRows: 30, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: false },
  });
  assert.equal(out.status, 'complete');
  assert.equal(out.pagesCaptured, 3);
  assert.equal(out.pagesTotal, 3);
});

// 2026-09-14 fix (requirement 3): the DEFAULT, everyday usage of a big paginated
// report — run it without --all-pages, get page 1 — must read as "this is exactly
// what you asked for", not as a defect indistinguishable from a real capture failure.
test('assessCompleteness: pagination stopped only because --all-pages was not passed is partial-by-design, not unverified', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 5, paginationVerdict: 'inconclusive', stoppedBecause: 'no --all-pages',
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 10, parsedRows: 10, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: false },
  });
  assert.equal(out.status, 'partial-by-design');
  assert.match(out.completenessBlockers[0], /pagination-incomplete\(1\/5/);
  assert.equal(out.pagesCaptured, 1);
  assert.equal(out.pagesTotal, 5);
});

// This is the checker's runE finding, reproduced exactly (keyword-magic, --db us,
// 1/283 pages, no --all-pages, crossPageTotal report so coverage.totalUnverifiable
// and .virtualScrollTruncated are both forced false by reportCoverage() regardless
// of the unparseable headline — pagination-incomplete is the only, by-design reason).
test('assessCompleteness: reproduces the checker runE fixture (keyword-magic 1/283, crossPageTotal) as partial-by-design', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 283, paginationVerdict: 'inconclusive', stoppedBecause: 'no --all-pages',
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 100, parsedRows: 100, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: false },
    pageCountUnverifiable: false,
  });
  assert.equal(out.status, 'partial-by-design');
  assert.equal(out.completenessBlockers.length, 1);
  assert.equal(out.pagesCaptured, 1);
  assert.equal(out.pagesTotal, 283);
});

// Stopping mid-pagination for any OTHER reason (quota block, render timeout, --max-pages
// hit) is not the caller's choice — must stay unverified even though the reason text
// differs from a plain "didn't ask for more".
test('assessCompleteness: pagination stopped for a reason OTHER than "no --all-pages" is unverified, not partial-by-design', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 2, totalPages: 5, paginationVerdict: 'inconclusive', stoppedBecause: 'page 3 never settled',
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 20, parsedRows: 20, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: false },
  });
  assert.equal(out.status, 'unverified');
});

// This is the checker's exact concern: the parse()-stability fingerprint reproduces
// identically across reads because the virtualized table genuinely has no more rows
// mounted, not because the data hasn't finished loading — indistinguishable from
// "actually done" by the stability check alone. Pagination itself is NOT incomplete
// here (1 of 1 "pages"), so the headline-vs-raw mismatch is independently actionable.
test('assessCompleteness: virtual-scroll truncation on a fully-"paged" single-page report is unverified', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 1, paginationVerdict: null, stoppedBecause: null,
    coverage: { pageSelfReportedTotal: 100, rawRecordCount: 20, parsedRows: 20, parserAligned: true, virtualScrollTruncated: true, totalUnverifiable: false },
  });
  assert.equal(out.status, 'unverified');
  assert.match(out.completenessBlockers[0], /virtual-scroll-truncated\(page-self-reported-total=100, raw-captured=20\)/);
});

// 2026-09-14 same-day fix: this used to assert virtualScrollTruncated gets suppressed
// ("not double-counted") whenever pagination is already incomplete, on the theory that
// "haven't paged through yet" fully explains headlineTotal > rawRecordCount. An
// independent checker's offline review found the flaw: that reasoning only holds if the
// page(s) actually captured are themselves complete — if the FIRST page is ALSO
// virtual-scroll-truncated (e.g. it should render ~100 rows but only mounted 20), that
// is a real capture defect, not "designed to stop early", and must not be waved through
// as partial-by-design. There is no reliable "expected rows per page" baseline to tell
// the two cases apart offline, so the fix is to stop guessing: virtualScrollTruncated
// now always counts, regardless of pagination state.
test('assessCompleteness: a multi-page report whose already-captured page is itself virtual-scroll-truncated is unverified, never partial-by-design', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 6, paginationVerdict: 'inconclusive', stoppedBecause: 'no --all-pages',
    coverage: { pageSelfReportedTotal: 503, rawRecordCount: 100, parsedRows: 100, parserAligned: true, virtualScrollTruncated: true, totalUnverifiable: false },
  });
  assert.notEqual(out.status, 'partial-by-design', 'a captured page reported as truncated must never be waved through as "just didn\'t page further"');
  assert.equal(out.status, 'unverified');
  assert.equal(out.completenessBlockers.length, 2, `expected both pagination-incomplete AND virtual-scroll-truncated, got: ${out.completenessBlockers.join(' | ')}`);
  assert.match(out.completenessBlockers.find((b) => b.startsWith('pagination-incomplete')), /pagination-incomplete/);
  assert.match(out.completenessBlockers.find((b) => b.startsWith('virtual-scroll-truncated')), /virtual-scroll-truncated\(page-self-reported-total=503, raw-captured=100\)/);
});

// The genuinely clean case for the SAME (non-crossPageTotal) report family: pagination
// not yet complete, but reportCoverage did NOT flag virtual-scroll-truncated on the
// captured page (its own headline confirms exactly what was captured — 100 of 100 —
// so the page itself is verifiably not truncated) even though the pager independently
// says more pages remain. The sole reason for incompleteness really is "no
// --all-pages", so this one still reaches partial-by-design. (The more common route to
// partial-by-design in practice is a crossPageTotal report like keyword-magic, already
// covered by the "reproduces the checker runE fixture" test above — this test exists
// to prove the fix didn't accidentally make partial-by-design unreachable outside that
// one report shape.)
test('assessCompleteness: multi-page report whose captured page is verifiably NOT truncated still reaches partial-by-design', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 6, paginationVerdict: 'inconclusive', stoppedBecause: 'no --all-pages',
    coverage: { pageSelfReportedTotal: 100, rawRecordCount: 100, parsedRows: 100, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: false },
  });
  assert.equal(out.status, 'partial-by-design');
  assert.equal(out.completenessBlockers.length, 1);
  assert.match(out.completenessBlockers[0], /pagination-incomplete/);
});

test('assessCompleteness: a parser gap (raw rows lost during parsing) is unverified', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 1, paginationVerdict: null, stoppedBecause: null,
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 20, parsedRows: 11, parserAligned: false, virtualScrollTruncated: false, totalUnverifiable: true },
  });
  assert.equal(out.status, 'unverified');
  assert.match(out.completenessBlockers[0], /parser-gap\(raw-record-lines=20, parsed-rows=11\)/);
});

// ---------------------------------------------------------------------------
// 2026-09-14 fix (requirement 1/2 — the coordinator's headline finding):
// reportCoverage()/readPageInfo() used to silently default to "not truncated"/
// "only 1 page" when the evidence to check either was simply unreadable. This is
// the exact hypothetical the checker warned about: a report with NO working
// pagination signal (pager text unparseable) AND no parseable headline total —
// every one of the three original checks would have passed, previously yielding
// status:'complete' on a table that might be silently virtual-scroll-truncated.
// ---------------------------------------------------------------------------
test('assessCompleteness: pager AND headline both unreadable — must be unverified, never complete (the exact landmine reported)', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 1, paginationVerdict: null, stoppedBecause: null,
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 20, parsedRows: 20, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: true },
    pageCountUnverifiable: true,
  });
  assert.notEqual(out.status, 'complete', 'this is exactly the silent-pass path the checker found — it must never resolve to complete');
  assert.equal(out.status, 'unverified');
  assert.equal(out.completenessBlockers.length, 2);
  assert.match(out.completenessBlockers[0], /page-count-unverifiable/);
  assert.match(out.completenessBlockers[1], /total-unverified/);
});

test('assessCompleteness: headline unreadable but pager explicitly confirms the last page and rows are consistent — complete via the alternate evidence path', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    // pageCountUnverifiable:false means the pager was ACTUALLY read (e.g. a genuine
    // "第 1/1 页", not the readPageInfo() unverifiable-default placeholder) —
    // "分页 footer 显示最后一页且各页行数累加一致" from the coordinator's own wording.
    paginated: true, pagesRead: 1, totalPages: 1, paginationVerdict: 'complete', stoppedBecause: null,
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 20, parsedRows: 20, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: true },
    pageCountUnverifiable: false,
  });
  assert.equal(out.status, 'complete', 'a genuinely-confirmed last page with consistent row counts is the documented alternative to a headline total');
  assert.equal(out.completenessBlockers.length, 0);
});

test('assessCompleteness: headline unreadable AND still mid-pagination — unverified, the alternate-evidence path requires full pagination', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    paginated: true, pagesRead: 1, totalPages: 3, paginationVerdict: 'inconclusive', stoppedBecause: 'no --all-pages',
    coverage: { pageSelfReportedTotal: null, rawRecordCount: 10, parsedRows: 10, parserAligned: true, virtualScrollTruncated: false, totalUnverifiable: true },
    pageCountUnverifiable: false,
  });
  // Both pagination-incomplete and total-unverified fire here (mid-pagination is not
  // itself evidence of full capture), so this is >1 blocker — plain unverified, not
  // partial-by-design (which only ever applies to the single-blocker "just didn't ask
  // for --all-pages, and nothing else looks wrong" case).
  assert.equal(out.status, 'unverified');
  assert.equal(out.completenessBlockers.length, 2);
});

test('assessCompleteness: multiple simultaneous, independently-actionable problems all get listed, not just the first one found', () => {
  const assess = loadAssessCompleteness();
  const out = assess({
    // Pagination itself is NOT incomplete (pagesRead===totalPages===1) so
    // virtual-scroll-truncated is independently actionable here, alongside the
    // pager being unreadable and a parser gap — three genuinely separate problems.
    paginated: true, pagesRead: 1, totalPages: 1, paginationVerdict: null, stoppedBecause: null,
    coverage: { pageSelfReportedTotal: 100, rawRecordCount: 20, parsedRows: 19, parserAligned: false, virtualScrollTruncated: true, totalUnverifiable: false },
    pageCountUnverifiable: true,
  });
  assert.equal(out.status, 'unverified');
  assert.equal(out.completenessBlockers.length, 3);
});
