#!/usr/bin/env node
/**
 * Strategy: DOM_STATE; contract: visible-ui. Anonymous overview cards verified
 * on app.appfigures.com (four iOS apps + a large-app control). Official public
 * data API needs licensed access; no undocumented endpoints or auth bypass.
 * A repo script reuses opencli-core instead of duplicating a private adapter.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseFlags, guardSessionName, openAndExtract, closeSession } from './opencli-core.mjs';

export function profileUrl(input, dates = 'last-month', report = 'overview') {
  let id = String(input || '').trim();
  if (/^https?:/.test(id)) {
    const u = new URL(id);
    if (u.protocol !== 'https:' || u.username || u.password || u.port || !['appfigures.com', 'app.appfigures.com'].includes(u.hostname)) throw new Error('Expected an Appfigures profile URL, not an Apple ID URL');
    id = u.pathname.match(/^\/reports\/app-profile\/(\d+)\/?$/)?.[1] || '';
    if (u.searchParams.has('dates') && dates === 'last-month') dates = u.searchParams.get('dates');
  }
  if (!/^\d+$/.test(id)) throw new Error('Expected Appfigures product ID (NOT Apple App Store ID), or overview profile URL');
  if (!/^[a-zA-Z0-9,.-]+$/.test(dates)) throw new Error('Invalid dates value');
  if (!['overview', 'keywords'].includes(report)) throw new Error('Report must be overview or keywords');
  return `https://app.appfigures.com/reports/app-profile/${id}${report === 'keywords' ? '/organic-search' : ''}?dates=${encodeURIComponent(dates)}`;
}

export function parseEstimate(raw) {
  raw = raw?.trim() || null;
  const base = { raw, value: null, upperBoundExclusive: null, currencySymbol: raw?.includes('$') ? '$' : null, status: 'unparsed' };
  if (!raw || /^(Not Available|Error|Loading.*)$/i.test(raw)) return { ...base, status: raw === 'Not Available' ? 'not_available' : 'unavailable' };
  const m = raw.match(/^(<)?\s*\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)([KMB])?$/i);
  if (!m) return base;
  const amount = Number(m[2].replaceAll(',', '')) * ({ K: 1e3, M: 1e6, B: 1e9 }[m[3]?.toUpperCase()] || 1);
  if (!Number.isFinite(amount)) return base;
  return { ...base, status: m[1] ? 'upper_bound' : 'estimate', value: m[1] ? null : amount, upperBoundExclusive: m[1] ? amount : null };
}

export function parseProfile(page) {
  const text = String(page.text || '');
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  const metric = label => {
    const index = lines.indexOf(label);
    return { ...parseEstimate(index < 0 ? null : lines[index + 2]), scope: index < 0 ? null : lines[index + 1] };
  };
  const downloads = metric('Est. Downloads');
  const revenue = { ...metric('Est. Revenue (After Fees)'), basis: 'After Fees' };
  let status = page.access === 'auth_required' ? 'auth_required'
    : page.access === 'competitor_tracking_required' ? 'competitor_tracking_required'
    : /Track this app as a (Basic|Premium) Competitor/i.test(text) ? 'competitor_tracking_required'
    : /Create a free account to continue|Please (log|sign) in/i.test(text) ? 'auth_required'
    : /Loading ranks|Loading\.\.\./i.test(text) ? 'loading'
    : /unexpected error/i.test(text) ? 'provider_error'
    : !text.includes('Intelligence Summary') ? 'unrecognized_page'
    : [downloads, revenue].some(m => ['estimate', 'upper_bound'].includes(m.status)) ? 'ok'
    : [downloads, revenue].every(m => m.status === 'not_available') ? 'not_available' : 'incomplete';
  const actualId = page.url?.match(/\/app-profile\/(\d+)/)?.[1] || null;
  const platform = page.platform || (text.includes('iOS App Store') ? 'iOS App Store' : text.includes('Google Play') ? 'Google Play' : null);
  const scope = downloads.scope || revenue.scope;
  const [country = null, period = null] = scope?.split(' · ') || [];
  if (['ok', 'not_available'].includes(status)) {
    if (!country || !period || !platform || !downloads.scope || !revenue.scope) status = 'incomplete';
    else if (downloads.scope !== revenue.scope) status = 'scope_mismatch';
  }
  const appleLink = page.storeLinks?.find(u => /(?:itunes|apps)\.apple\.com/.test(u));
  return { productId: actualId, appleId: appleLink?.match(/\/id(\d+)/)?.[1] || null, title: page.title || null,
    sourceUrl: page.url || null, fetchedAt: page.fetchedAt || null, platform, country, period, status,
    dataKind: 'third_party_estimate', access: page.access || null, downloads, revenue,
    recentRatingsRaw: text.match(/Based on [^\n]+ new user ratings/)?.[0] || null,
    rawText: text };
}

export function parseKeywords(page) {
  const text = String(page.text || '');
  const number = value => /^\d+$/.test(value) && Number.isFinite(Number(value)) ? Number(value) : null;
  const rows = (page.tables || []).flat().filter(row => row.length === 6 && row[1] && number(row[2]) !== null).map(row => ({
    keyword: row[1], popularity: number(row[2]), competitiveness: number(row[3]),
    apps: number(row[4]), rank: number(row[5]),
  }));
  const loading = /Loading/i.test(text);
  const truncated = page.access === 'partial_upgrade_required' || /Unlock all results/.test(text) || (loading && rows.length > 0);
  const country = text.match(/COUNTRY\s*\n([^\n]+)/)?.[1]?.trim() || null;
  const status = page.access === 'auth_required' || /Create a free account to continue|Please (log|sign) in/i.test(text) ? 'auth_required'
    : page.access === 'competitor_tracking_required' || /Track this app as a/.test(text) ? 'competitor_tracking_required'
    : /unexpected error/i.test(text) ? 'provider_error'
    : loading ? 'loading'
    : !country || !page.platform || !page.selectedDevice ? 'incomplete'
    : rows.length ? (truncated ? 'partial' : 'ok') : 'incomplete';
  return { productId: page.url?.match(/app-profile\/(\d+)/)?.[1] || null, sourceUrl: page.url, fetchedAt: page.fetchedAt,
    status, access: page.access || null, report: 'keywords', platform: page.platform || null, country,
    device: page.selectedDevice || null, period: 'current snapshot; page does not display a historical window',
    metricMeaning: 'Appfigures popularity/competitiveness indices, tracked search-result app count and organic rank; NOT Google monthly volume or KD',
    truncated, count: rows.length, rows, rawTables: page.tables || [], rawText: text };
}

// Extract the visible report section, excluding account navigation and long metadata.
const EXTRACT = `(() => {
  const body = document.body?.innerText || '';
  const start = body.indexOf('Intelligence Summary');
  const relevant = start >= 0 ? body.slice(start).split('Metadata & Screenshots')[0] : body.slice(body.lastIndexOf('Metadata') + 8);
  return { url: location.href, title: document.title, text: relevant,
    access: /Create a free account to continue|Please (log|sign) in/i.test(body) ? 'auth_required' : /Unlock all results/.test(body) ? 'partial_upgrade_required' : /Track this app as a/.test(body) ? 'competitor_tracking_required' : [...document.querySelectorAll('a')].some(a=>a.innerText.trim()==='Log in') ? 'anonymous' : 'authenticated_or_no_login_link',
    platform: body.includes('iOS App Store') ? 'iOS App Store' : body.includes('Google Play') ? 'Google Play' : null,
    selectedDevice: [...document.querySelectorAll('[aria-selected="true"], [aria-pressed="true"], [aria-checked="true"], input:checked')].map(e=>(e.innerText || e.value || '').trim()).find(x=>/^(iPhone|iPad)$/.test(x)) || null,
    tables: [...document.querySelectorAll('table')].map(t=>[...t.querySelectorAll('tr')].map(r=>[...r.querySelectorAll('th,td')].map(c=>c.innerText.trim()))),
    fetchedAt: new Date().toISOString(), storeLinks: [...document.querySelectorAll('a')].map(a=>a.href).filter(u=>/https:\\/\\/(itunes|apps)\\.apple\\.com/.test(u)) };
})()`;

export function matchesReportUrl(actual, expected) {
  try {
    const page = new URL(actual), target = new URL(expected);
    return page.origin === 'https://app.appfigures.com' && !page.username && !page.password
      && page.pathname === target.pathname;
  } catch { return false; }
}

export function sessionForRun(explicit) {
  return { session: explicit ? guardSessionName(String(explicit)) : `appfigures-${randomUUID()}`, ownsSession: !explicit };
}

export async function main(argv = process.argv.slice(2)) {
  const f = parseFlags(argv);
  if (f.help) { console.log('node appfigures.mjs --product-id APPFIGURES_ID | --url PROFILE_URL | --ids ID,ID [--report overview|keywords] [--dates last-month] [--out-dir DIR] [--session BORROWED_SESSION]\nJSON on stdout. IDs are Appfigures product IDs, not Apple IDs. Supports overview and visible keyword rows; unavailable is null, <$5K is an upper bound. No history/ASO bypass. Default UUID session is owned and closed; explicit --session is borrowed and never closed.'); return; }
  const inputs = String(f.ids || f['product-id'] || f.url || '').split(',').filter(Boolean);
  if (!inputs.length) throw new Error('Provide --product-id, --url or --ids');
  const report = String(f.report || 'overview');
  const urls = inputs.map(input => profileUrl(input, String(f.dates || 'last-month'), report));
  const { session, ownsSession } = sessionForRun(f.session);
  const out = f['out-dir'] ? resolve(String(f['out-dir'])) : null;
  if (out) mkdirSync(out, { recursive: true });
  const results = [];
  try {
    for (const url of urls) {
      let result;
      try {
        let page = await openAndExtract(session, url, EXTRACT, { windowMode: 'isolated', settleSeconds: 4, timeoutMs: 60000 });
        if (typeof page === 'string') page = JSON.parse(page);
        result = page.degraded ? { sourceUrl: url, status: page.kind, evidence: page.evidence } : report === 'keywords' ? parseKeywords(page) : parseProfile(page);
        if (!page.degraded && !matchesReportUrl(result.sourceUrl, url)) result.status = 'page_mismatch';
      } catch (e) { result = { sourceUrl: url, status: 'navigation_or_extract_error', error: e.message }; }
      results.push(result);
      if (out) writeFileSync(join(out, `${url.match(/app-profile\/(\d+)/)[1]}.json`), JSON.stringify(result, null, 2) + '\n');
    }
  } finally { if (ownsSession) await closeSession(session); }
  if (out) writeFileSync(join(out, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results, null, 2));
  if (results.some(r => !['ok', 'partial', 'not_available'].includes(r.status))) process.exitCode = 2;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
