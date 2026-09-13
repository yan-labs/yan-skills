// semrush-keyword.mjs, 2026-09-13: dropped the hardcoded `--db` default of
// "jp" (a historical artifact of the Skill's first callers all being
// JP-market). The keyword-overview page has no worldwide selector and the
// country it lands on without --db is unpredictable (account-shared state,
// observed drifting jp/us/kr across sessions) — so single-keyword mode
// without --db now reports `volume` from the page's always-present
// `globalVolume` figure and nulls out the country-only fields (kd/cpc/
// competition/results) instead of quietly attributing a random country's
// numbers to the query. Bulk mode is unaffected: it already required an
// explicit country.
//
// Offline, same extraction trick as semrush-keyword-summary.test.mjs: pull
// the pure functions out via vm since the file's top level has side effects
// (flag parsing, launching a browser tool).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../scripts/semrush-keyword.mjs', import.meta.url), 'utf8');

test('the jp default is gone; --db is a plain pass-through with no fallback', () => {
  assert.doesNotMatch(source, /flags\.db \|\| 'jp'/);
  assert.match(source, /const db = String\(flags\.db \|\| ''\)\.trim\(\)\.toLowerCase\(\);/);
});
test('bulk mode still requires an explicit country (unaffected by the jp-default removal)', () => {
  assert.match(source, /Bulk keyword lookup requires an explicit country database/);
});

const start = source.indexOf('function parseOverviewMetrics(');
const end = source.indexOf('function uiPlanJobs(');
assert.ok(start >= 0 && end > start, 'could not locate parseOverviewMetrics..scopeKeywordMetrics span');
const context = vm.createContext({ URL });
vm.runInContext(`${source.slice(start, end)};this.api = { parseOverviewMetrics, scopeKeywordMetrics, extractDbFromUrl };`, context);
const { parseOverviewMetrics, scopeKeywordMetrics, extractDbFromUrl } = context.api;

test('production wires scopeKeywordMetrics onto every UI-mode row', () => {
  assert.match(source, /\.\.\.scopeKeywordMetrics\(parseOverviewMetrics\(cap\.bodyText, cap\.absent\), \{/);
});

const rawMetrics = {
  volume: 260, kd: 32, cpc: '$1.20', competition: '0.4', results: 900,
  globalVolume: 41300, byCountry: { US: 14800 }, intent: null, intentRaw: null,
  noData: false, status: 'ok', updateOffered: false,
};

test('no --db: volume comes from globalVolume, country-only fields are nulled with a reason', () => {
  const row = scopeKeywordMetrics(rawMetrics, { dbGiven: false, database: '', renderedDb: 'jp' });
  assert.equal(row.volume, 41300, 'must not be the country-specific 260 the page happened to render');
  assert.equal(row.volumeScope, 'global');
  assert.equal(row.renderedDb, 'jp', 'renderedDb is diagnostic only, never used as the scope');
  for (const field of ['kd', 'cpc', 'competition', 'results']) assert.equal(row[field], null, field);
  assert.equal(row.countryMetricsAvailable, false);
  assert.match(row.countryMetricsUnavailableReason, /no --db given/);
  assert.equal(row.status, 'ok');
  assert.equal(row.byCountry.US, 14800, 'byCountry/globalVolume survive — only country-only fields are nulled');
});

test('no --db and no global figure either: still null, never a fabricated zero', () => {
  const row = scopeKeywordMetrics(
    { ...rawMetrics, volume: null, globalVolume: null, noData: true, status: 'metrics_unavailable' },
    { dbGiven: false, database: '', renderedDb: null },
  );
  assert.equal(row.volume, null);
  assert.equal(row.noData, true);
  assert.equal(row.status, 'metrics_unavailable');
});

test('explicit --db: numbers pass through untouched, just tagged with volumeScope', () => {
  const row = scopeKeywordMetrics(rawMetrics, { dbGiven: true, database: 'jp', renderedDb: 'jp' });
  assert.equal(row.volume, 260);
  assert.equal(row.volumeScope, 'jp');
  assert.equal(row.kd, 32);
  assert.equal(row.cpc, '$1.20');
  assert.equal(row.countryMetricsAvailable, true);
  assert.equal(row.countryMetricsUnavailableReason, undefined);
});

test('extractDbFromUrl reads the landed db back from the page URL, diagnostically', () => {
  assert.equal(extractDbFromUrl('https://sem.3ue.co/analytics/keywordoverview/?q=x&db=kr'), 'kr');
  assert.equal(extractDbFromUrl('https://sem.3ue.co/analytics/keywordoverview/?q=x'), null);
  assert.equal(extractDbFromUrl('not a url'), null);
});

test('geoHop does not run without an explicit --db (no current-country baseline to hop from)', () => {
  assert.match(source, /no explicit --db given; volumeScope is global, no current-country baseline to hop from/);
  assert.match(source, /if \(jobDbGiven\) \{/);
});

test('ui-plan jobs are always treated as dbGiven (each entry names its own country)', () => {
  assert.match(source, /uiPlanJobs\(uiPlan\)\.map\(\(job\) => \(\{ \.\.\.job, dbGiven: true \}\)\)/);
});
