import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, symlink, link } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { triage, markdown, SECTIONS } from '../scripts/aitdk-triage.mjs';

const fixture = () => ({
  url: 'https://tool.test/convert/', readAt: '2026-01-01T00:00:00Z', issues: [],
  seo: { url: 'https://tool.test/convert/', title: '六曜カレンダー', metaDescription: 'Choose a date', canonical: 'https://tool.test/convert', viewport: 'width=device-width', robots: null, headings: { h1: { count: 1, text: ['Choose a date'] } }, images: { total: 0, withoutAlt: 0 }, structuredData: [], ogTitle: 'Calendar', ogDescription: 'Choose a date', ogImage: 'https://tool.test/share.png' },
  aitdkPanel: { attempted: true, ok: true, errors: [], sections: Object.fromEntries(SECTIONS.map(k => [k, { raw: k === 'issues' ? 'SEO Issues\nMeta Title Check\nAim for 40-60 characters.\nH3 Check\nMissing H3 tags.' : 'Captured' }])) },
});
const codes = p => p.findings.map(f => f.code);

test('research ignores keyword/length/H3 templates, trailing slash and absent robots meta', () => {
  const p = triage(fixture(), 'input.json');
  assert.equal(p.status, 'no-selected-findings');
  assert.equal(p.findings.length, 0);
  assert.equal(p.suppressed['template-length-or-heading-advice'], 2);
  assert.doesNotMatch(markdown([p]), /Choose a date/);
});

test('missing fields, invalid exports, skipped/partial panels never become healthy', () => {
  assert.equal(triage({}, 'bad.json').status, 'capture-incomplete');
  const d = fixture(); delete d.seo.title; delete d.aitdkPanel.sections.geo;
  const p = triage(d, 'partial.json');
  assert.equal(p.status, 'capture-incomplete');
  assert.ok(codes(p).includes('SEO_FIELDS_UNOBSERVED'));
  assert.ok(!codes(p).includes('TITLE_MISSING'));
  d.aitdkPanel.attempted = false;
  assert.ok(codes(triage(d, 'skip.json')).includes('PANEL_INCOMPLETE'));
});

test('observed absence differs from unobserved and real JSON failure is retained with pointer', () => {
  const d = fixture(); d.seo.metaDescription = null; d.seo.canonical = 'https://tool.test/';
  d.seo.robots = 'INDEX, NONE'; d.seo.structuredData = [{ parseError: true, raw: '{"name":"x",}' }];
  const p = triage(d, 'input.json');
  for (const c of ['DESCRIPTION_MISSING', 'CANONICAL_DIFFERENT', 'INDEXING_DIRECTIVE', 'JSON_LD_PARSE_ERROR']) assert.ok(codes(p).includes(c));
  assert.equal(p.findings.find(f => f.code === 'JSON_LD_PARSE_ERROR').ref, 'input.json#/seo/structuredData/0');
});

test('multiple file warnings survive, unknown issue language fails visibly, SSR remains review', () => {
  const d = fixture(); d.aitdkPanel.sections.overview.raw = 'SSR Check\nMissing';
  d.aitdkPanel.sections.issues.raw = 'SEO Issues\nRobots.txt Check\nMissing robots.txt\nSitemap.xml Check\nMissing sitemap.xml\nNew Provider Check\nA new concern';
  const p = triage(d, 'input.json');
  assert.equal(p.findings.filter(f => f.code === 'FILE_AVAILABILITY_RECHECK').length, 2);
  assert.equal(p.findings.find(f => f.code === 'SSR_RECHECK').kind, 'review');
  assert.ok(codes(p).includes('PANEL_REVIEW'));
  d.aitdkPanel.sections.issues.raw = '新布局：未知检查列表';
  assert.ok(codes(triage(d, 'unknown.json')).includes('ISSUES_FORMAT_UNKNOWN'));
});

test('first issue without preamble and file fetch failures are never swallowed', () => {
  const d = fixture();
  d.aitdkPanel.sections.issues.raw = 'Robots.txt Check\nError: request failed\nSitemap.xml Check\nUnknown response\nMeta Title Check\nOK';
  assert.equal(triage(d, 'input.json').findings.filter(f => f.code === 'FILE_AVAILABILITY_RECHECK').length, 2);
  d.aitdkPanel.sections.issues.raw = 'Robots.txt Check';
  assert.ok(codes(triage(d, 'input.json')).includes('ISSUE_BODY_UNOBSERVED'));
});

test('loading and unobserved robots are capture gaps; null robots and 1.5 zoom are not', () => {
  const d = fixture(); d.aitdkPanel.sections.traffic.raw = 'Loading...'; delete d.seo.robots;
  const p = triage(d, 'input.json');
  assert.equal(p.status, 'capture-incomplete');
  assert.ok(codes(p).includes('SEO_FIELDS_UNOBSERVED'));
  d.aitdkPanel.sections.traffic.raw = 'No data available'; d.seo.robots = null; d.seo.viewport = 'width=device-width,maximum-scale=1.5';
  assert.equal(triage(d, 'input.json').status, 'no-selected-findings');
});

test('CLI preserves raw, deduplicates inputs, writes small digest and reports corrupt input without false success', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'aitdk-triage-'));
  const cli = fileURLToPath(new URL('../scripts/aitdk-triage.mjs', import.meta.url));
  const run = promisify(execFile), file = path.join(dir, 'raw.json'), broken = path.join(dir, 'broken.json'), out = path.join(dir, 'digest');
  const d = fixture(); d.aitdkPanel.sections.traffic.raw = 'unneeded traffic data '.repeat(5000);
  const raw = JSON.stringify(d);
  try {
    await writeFile(file, raw); await writeFile(broken, '{');
    const result = await run(process.execPath, [cli, file, file, '--out', out]);
    const stats = JSON.parse(result.stdout);
    assert.equal(stats.pages, 1); assert.ok(stats.characterReductionPercent > 90);
    assert.equal(await readFile(file, 'utf8'), raw);
    assert.doesNotMatch(await readFile(`${out}.md`, 'utf8'), /unneeded traffic/);
    await assert.rejects(run(process.execPath, [cli, file, broken, '--out', out]), e => e.code === 2);
    const partial = JSON.parse(await readFile(`${out}.json`, 'utf8'));
    assert.equal(partial.pages[1].findings[0].code, 'INPUT_UNREADABLE');
    await assert.rejects(run(process.execPath, [cli, file, '--out', file.slice(0, -5)]), e => e.code === 1);
    await symlink(dir, path.join(dir, 'alias'));
    await assert.rejects(run(process.execPath, [cli, file, '--out', path.join(dir, 'alias/raw')]), e => e.code === 1);
    await link(file, path.join(dir, 'hard.json'));
    await assert.rejects(run(process.execPath, [cli, file, '--out', path.join(dir, 'hard')]), e => e.code === 1);
    assert.equal(await readFile(file, 'utf8'), raw);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
