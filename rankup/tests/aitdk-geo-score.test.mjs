// Regression test for the GEO score render-timing fix in aitdk-opencli.sh
// (added 2026-09-13, see the script's header comment and the friction log
// that motivated it). The AITDK panel's GEO tab animates its total score in
// after the tab switch and can transiently read as either (a) only the five
// category labels with no digits at all, or (b) a score frozen at "0 / 100"
// mid-animation. Both looked "non-empty" to the script's generic
// empty-content retry, so a naive read could silently write a false
// blank/near-zero GEO score into the report.
//
// This test extracts the real `geo_score_from_text()` function straight out
// of the shipped script (not a hand-copied duplicate) and runs it under bash
// against fixture text mimicking the two failure symptoms plus a normal
// settled read, so a future edit to the parsing logic in the script itself
// is what this test actually exercises.
import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, '../scripts/aitdk-opencli.sh');
const scriptSrc = readFileSync(scriptPath, 'utf8');

function extractFunction(src, name) {
  const lines = src.split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === `${name}() {`);
  assert.ok(startIdx >= 0, `could not find ${name}() in ${scriptPath}`);
  // Match the function's own unindented closing brace, not an indented `}`
  // that closes a nested block (e.g. the awk program body) inside it.
  const endIdx = lines.findIndex((l, i) => i > startIdx && l === '}');
  assert.ok(endIdx > startIdx, `could not find closing brace for ${name}() in ${scriptPath}`);
  return lines.slice(startIdx, endIdx + 1).join('\n');
}

const geoScoreFn = extractFunction(scriptSrc, 'geo_score_from_text');
const geoStableFn = extractFunction(scriptSrc, 'geo_score_is_stable');
const writePanelFn = extractFunction(scriptSrc, 'write_panel');

function runGeoScoreFromText(input) {
  const out = execFileSync('bash', ['-c', `${geoScoreFn}\ngeo_score_from_text "$TEST_INPUT"`], {
    env: { ...process.env, TEST_INPUT: input },
    encoding: 'utf8',
  });
  return out.replace(/\n$/, '');
}

test('geo_score_from_text: symptom A (category labels only, no "GEO Score" marker at all) reads as empty', () => {
  const text = [
    'AI Crawler Access', 'Machine Readability', 'Structured Data',
    'Content & Citability', 'Trust & E-E-A-T',
    'AI Crawler Access', 'Machine Readability', 'Structured Data',
    'Content & Citability', 'Trust & E-E-A-T',
    '0',
  ].join('\n');
  assert.equal(runGeoScoreFromText(text), '', 'no "GEO Score" marker present — must not be mistaken for a real score');
});

test('geo_score_from_text: symptom B (score frozen at 0 mid-animation) reads as "0"', () => {
  const text = ['GEO Score', '0', '/ 100', 'AI Crawler Access', '18', 'Machine Readability', '20'].join('\n');
  assert.equal(runGeoScoreFromText(text), '0', 'must surface the literal "0" so the caller\'s retry loop can treat it as unsettled');
});

test('geo_score_from_text: a settled non-zero score is read correctly', () => {
  const text = ['GEO Score', '96', '/ 100', 'AI Crawler Access', '18', 'Machine Readability', '20'].join('\n');
  assert.equal(runGeoScoreFromText(text), '96');
});

test('geo_score_from_text: only picks up a digit within a few lines of the marker, not an unrelated later number', () => {
  const text = ['GEO Score', 'Some unrelated label', 'Another label', 'Yet another', 'More text', 'Still more', 'Even more', '42'].join('\n');
  assert.equal(runGeoScoreFromText(text), '', 'the "42" is outside the 6-line lookahead window and must not be picked up as the score');
});

test('geo_score_is_stable: animated non-zero readings are not accepted', () => {
  const run = (...scores) => {
    try {
      execFileSync('bash', ['-c', `${geoStableFn}\ngeo_score_is_stable "$1" "$2" "$3"`, '--', ...scores]);
      return true;
    } catch { return false; }
  };
  assert.equal(run('8', '0', '0'), false);
  assert.equal(run('57', '8', '8'), false);
  assert.equal(run('57', '57', '8'), false);
  assert.equal(run('57', '57', '57'), true);
  assert.equal(run('0', '0', '0'), false);
});

test('write_panel: an unsettled GEO score cannot be marked ok', () => {
  const output = execFileSync('bash', ['-c', `
    PANEL_SECTIONS_JSON='{}'
    FRAME_IDX=0
    panel_errors=('geo: score unsettled')
    write_partial() { :; }
    ${writePanelFn}
    write_panel
    printf '%s' "$PANEL_JSON"
  `], { encoding: 'utf8' });
  assert.equal(JSON.parse(output).ok, false);
});
