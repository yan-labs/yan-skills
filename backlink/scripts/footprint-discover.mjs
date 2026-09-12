#!/usr/bin/env node
/**
 * footprint-discover.mjs — Google search-operator footprints → submission-page
 * leads. Collect-only, per <law id="scripts-collect-ai-judges">: it emits a
 * measured shape score and library/fingerprint/ledger membership, never a
 * usable/reject verdict. Feed its output's new domains into
 * scripts/probe-submission-targets.mjs for the next stage, and read
 * references/discovery-loop.md's "Footprint discovery" section before running
 * a real sweep — it has the effective/noisy footprint table this script's
 * defaults are built from.
 *
 * Why Google, and only Google (verified 2026-09-12, see
 * /private/tmp .../scratchpad/footprint/*  raw runs this file's defaults come
 * from):
 *   - General search APIs (this repo tried anysearch) do NOT execute
 *     `inurl:` / `intitle:` operators — they run a generic keyword search and
 *     silently ignore the operator, so every "footprint" query degrades to a
 *     plain keyword query with no way to notice the degradation from the
 *     response alone.
 *   - Bing redirects by IP to a localized subdomain (cn.bing.com for a CN
 *     egress) and drops the operators there too. It cannot be a fallback for
 *     operator-bearing queries — only for a plain-keyword query, which is a
 *     different, weaker signal.
 *   - DuckDuckGo's HTML endpoint answers without JS but also does not honor
 *     `inurl:`/`intitle:`. Usable as a last-resort plain-text degrade, never
 *     as an operator-query substitute.
 *   - Only a real Google SERP, loaded in the owner's logged-in Chrome via
 *     OpenCLI, actually executes the operators. That is why this script has
 *     exactly one engine implementation.
 *
 * CAPTCHA policy: Google starts showing a CAPTCHA / "unusual traffic" page
 * around the 4th query in one session in a sandboxed browser (measured
 * 2026-09-12: 3 queries clean, the 4th blocked). This script does not evade,
 * retry through, or solve it. On any CAPTCHA signal it stops the run
 * immediately, writes a scene (census + screenshot) to `<out>.evidence/`, and
 * exits non-zero. Whatever queries already completed keep their written rows
 * — nothing already collected is discarded. Re-running later (same --out,
 * with --resume) picks up where it stopped; the query-by-query delay exists
 * to make that "later" happen less often, not to guarantee it never happens.
 *
 * Machine-wide contention (found 2026-09-12, second sweep): unlike Semrush
 * and Similarweb, plain Google search has NO Tools Share account behind it —
 * it rides the owner's own logged-in Chrome, and nothing in this repo used to
 * serialise access to it. Multiple unrelated OpenCLI sessions on the same
 * machine hammering Google concurrently (each running its own searches, none
 * of them this script) can jointly trigger and then keep renewing an
 * account-level CAPTCHA that no amount of single-session cooldown will clear,
 * because the "cooldown" only matters if nobody else is still poking Google.
 * This script now (a) takes a machine-wide mutex keyed `google` via
 * `lib-tools-share.mjs`'s `acquireToolsShareLock`, so at least concurrent
 * footprint-discover.mjs runs on this box serialise against each other, and
 * (b) fires one cheap non-operator preflight query before spending any real
 * query — if that preflight itself lands on `/sorry`, the run stops
 * immediately with `stopReason: "captcha-preexisting"` and spends nothing
 * further. Neither fix controls *other* scripts/agents that talk to Google
 * outside this file — before a real sweep, run `opencli browser sessions`
 * and look for other entries parked on `google.com/sorry` first.
 *
 * Usage:
 *   node scripts/footprint-discover.mjs --keyword "browser games" --preset submit \
 *     --num 20 --out .backlink/footprint-browser-games.jsonl
 *
 *   node scripts/footprint-discover.mjs --queries-file queries.txt \
 *     --out .backlink/footprint-run.jsonl --resume
 *
 *   node scripts/footprint-discover.mjs --self-test
 *
 * Flags:
 *   --queries-file <txt>   one full query per line; takes priority over
 *                          --keyword/--preset when given
 *   --keyword <kw>         seed keyword; combined with --preset into the
 *                          built-in templates below
 *   --preset submit|write-for-us|all
 *                          submit:        <kw> inurl:submit
 *                                         <kw> inurl:links "submit"
 *                                         <kw> "submit your <noun>"
 *                          write-for-us:  <kw> "write for us"
 *                          <kw> "guest post guidelines"
 *                          all:           the union of both
 *                          Deliberately NOT included, and never will be by
 *                          default — measured noisy (see header comment
 *                          "Noisy footprints" below):
 *                            inurl:resources   — 4-12% real hit rate on real
 *                                                Google; almost all hits are
 *                                                resource round-up posts and
 *                                                .edu pages, not submission
 *                                                forms.
 *                            "add your site"   — dominated by SEO-agency
 *                                                sales pages and "how to
 *                                                submit to search engines"
 *                                                tutorials, not real targets.
 *   --engine google        default and only implementation; see header
 *   --num <n>              results per page requested from Google (default 30)
 *   --hl <lang>            Google UI language (default en)
 *   --gl <country>         Google geolocation bias (default us)
 *   --out <jsonl>          required; append-only JSONL output
 *   --delay-ms <n|n-m>     delay between queries, ms; a single number fixes
 *                          it, "n-m" randomizes in that range (default
 *                          8000-20000 — this is a courtesy pace and does
 *                          nothing to change the CAPTCHA math above)
 *   --ledger <path>        optional; a backlink/ledger.mjs-format JSON file
 *                          (default .backlink/ledger.json; missing file is
 *                          silently treated as "empty ledger", not an error)
 *   --resume               skip queries whose query-summary line already
 *                          exists in --out; recount `new domain` against
 *                          domains already written there too
 *   --keep-session-on-captcha (default ON) — on a CAPTCHA stop, leave the
 *                          browser tab open instead of closing it, and print
 *                          the session name + URL so a human sitting at the
 *                          owner's own Chrome can solve it by hand in
 *                          seconds. The run-summary row also carries
 *                          `sessionKept`/`sessionName`. This script still
 *                          never solves or bypasses a CAPTCHA itself — see
 *                          <rule id="no-bypass"/> — it only stops touching
 *                          the tab. Pass --no-keep-session-on-captcha to
 *                          restore the old close-on-stop behaviour.
 *   --self-test            run the offline extraction/scoring/dedup checks
 *                          against a fixture and exit; opens no browser
 *
 * Noisy footprints seen in the 2026-09-12 manual run, kept out of the built-in
 * templates on purpose:
 *   inurl:resources     4-12% real hit rate; nearly all hits are link
 *                        round-ups and .edu resource pages, not submission
 *                        forms.
 *   "add your site"      SEO-agency sales copy and "how to submit your site
 *                        to search engines" tutorials, essentially no real
 *                        submission pages.
 * Effective footprints from the same run (context for --preset choices):
 *   `<kw> inurl:submit`            ~70% operator hit rate
 *   `<kw> inurl:links "submit"`    ~56% operator hit rate, ~25/27 manually
 *                                  read hits were real submission pages
 *   `<kw> "write for us"`          fewest false positives of any footprint
 *                                  tried
 * A specific vertical keyword ("browser games", "ai tools") beats a generic
 * one ("web tools") — generic keywords pull in bulk directory-submission
 * services as noise. Japanese footprints (登録/申請/相互リンク募集中) produced
 * zero usable leads across two rounds; Japanese submission-page slugs were
 * plain English (/contact, /apply) instead, so this needs a different
 * approach, not this script's templates.
 */
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  closeSession,
  defaultSession,
  helpGuard,
  openAndEval,
  parseFlags,
  required,
  showHelpIfRequested,
} from './opencli-core.mjs';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import { normDomain } from './third-party-list-ingest.mjs';
import { acquireToolsShareLock } from './lib-tools-share.mjs';

helpGuard(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(HERE, '..', 'data');

/* ------------------------------------------------------------------ *
 * Built-in templates. See header comment for why inurl:resources and
 * "add your site" are excluded on purpose.
 * ------------------------------------------------------------------ */

function guessNoun(keyword) {
  const k = String(keyword).toLowerCase();
  if (/\bgames?\b/.test(k)) return 'game';
  if (/\btools?\b/.test(k)) return 'tool';
  if (/\bapps?\b/.test(k)) return 'app';
  if (/\bplugins?\b/.test(k)) return 'plugin';
  return 'site';
}

export const TEMPLATES = {
  'inurl-submit': (kw) => `${kw} inurl:submit`,
  'inurl-links-submit': (kw) => `${kw} inurl:links "submit"`,
  'submit-your-noun': (kw) => `${kw} "submit your ${guessNoun(kw)}"`,
  'write-for-us': (kw) => `${kw} "write for us"`,
  'guest-post-guidelines': (kw) => `${kw} "guest post guidelines"`,
};

export const PRESET_TEMPLATES = {
  submit: ['inurl-submit', 'inurl-links-submit', 'submit-your-noun'],
  'write-for-us': ['write-for-us', 'guest-post-guidelines'],
  all: ['inurl-submit', 'inurl-links-submit', 'submit-your-noun', 'write-for-us', 'guest-post-guidelines'],
};

export function buildQueryList(flags) {
  if (flags['queries-file']) {
    return fs.readFileSync(flags['queries-file'], 'utf8')
      .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }
  const keyword = flags.keyword;
  if (!keyword) return [];
  const preset = flags.preset || 'submit';
  const names = PRESET_TEMPLATES[preset];
  if (!names) throw new Error(`unknown --preset ${preset}; expected submit|write-for-us|all`);
  return names.map((name) => TEMPLATES[name](keyword));
}

/* ------------------------------------------------------------------ *
 * Pure processing: URL cleanup, shape scoring, dedup key, membership
 * checks. Exercised directly by --self-test — no browser needed to test
 * this half of the script.
 * ------------------------------------------------------------------ */

export function unwrapGoogleRedirect(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (/(^|\.)google\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('q')) {
      return u.searchParams.get('q');
    }
  } catch { /* not a URL at all */ }
  return rawUrl;
}

export function isGoogleSelfLink(rawUrl) {
  try { return /(^|\.)google\.[a-z.]+$/i.test(new URL(rawUrl).hostname); } catch { return false; }
}

// Same keyword set the brief specifies for shapeScore; operatorHit is just
// "did any of them hit at all" — see references/discovery-loop.md.
const SHAPE_KEYWORDS = ['submit', 'submission', 'write-for-us', 'guest-post', 'add-your', 'directory', 'suggest'];

export function scoreShape(urlStr) {
  let p;
  try { p = new URL(urlStr).pathname.toLowerCase(); } catch { p = String(urlStr).toLowerCase(); }
  const hits = new Set();
  for (const kw of SHAPE_KEYWORDS) {
    const pattern = new RegExp(kw.replace(/-/g, '[-_]?'));
    if (pattern.test(p)) hits.add(kw);
  }
  return Math.min(3, hits.size);
}

/**
 * One extracted search-result item → one output record, or null if it is not
 * a real external result (a Google-internal link, or a URL normDomain can't
 * parse). No verdict fields — inLibrary/fingerprintHit/inLedger/shapeScore
 * are all measured membership/count, left for the AI or a later script to
 * act on.
 */
export function buildResultRecord(query, item, ctx) {
  const url = unwrapGoogleRedirect(item.url);
  if (!url || !/^https?:\/\//i.test(url) || isGoogleSelfLink(url)) return null;
  const domain = normDomain(url);
  if (!domain) return null;
  const shapeScore = scoreShape(url);
  return {
    type: 'result',
    query,
    rank: item.rank ?? null,
    url,
    domain,
    title: item.title || null,
    snippet: item.snippet || null,
    operatorHit: shapeScore >= 1,
    shapeScore,
    inLibrary: ctx.libSet.has(domain),
    fingerprintHit: ctx.fpSet.has(domain),
    inLedger: ctx.ledgerSet.has(domain),
  };
}

export function isCaptchaSignal(extraction) {
  if (!extraction) return false;
  if (extraction.captcha) return true;
  if (/\/sorry\//.test(extraction.href || '')) return true;
  if (/unusual traffic|automated queries|detected unusual traffic|our systems have detected/i.test(extraction.bodyTextSample || '')) return true;
  return false;
}

export function parseDelayRange(spec) {
  if (!spec) return [8000, 20000];
  const m = String(spec).match(/^(\d+)(?:-(\d+))?$/);
  if (!m) throw new Error('--delay-ms expects N or N-M (milliseconds)');
  const lo = Number(m[1]);
  const hi = m[2] !== undefined ? Number(m[2]) : lo;
  return lo <= hi ? [lo, hi] : [hi, lo];
}

async function delay(spec) {
  const [lo, hi] = parseDelayRange(spec);
  const ms = lo + Math.floor(Math.random() * (hi - lo + 1));
  process.stderr.write(`  waiting ${ms}ms before next query...\n`);
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'query';
}

function nowIso() { return new Date().toISOString(); }

/* ------------------------------------------------------------------ *
 * Library / fingerprint / ledger membership sets — loaded once per run.
 * ------------------------------------------------------------------ */

function loadJsonSafe(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function buildLibraryDomainSet() {
  const set = new Set();
  const targets = loadJsonSafe(path.join(DATA_DIR, 'submission-targets.json'));
  for (const t of targets?.targets || []) if (t.domain) set.add(String(t.domain).toLowerCase());
  const channels = loadJsonSafe(path.join(DATA_DIR, 'free-channels.json'));
  for (const c of channels?.channels || []) {
    const d = c.homepage ? normDomain(c.homepage) : null;
    if (d) set.add(d);
  }
  return set;
}

function buildFingerprintDomainSet() {
  const set = new Set();
  const fingerprints = loadJsonSafe(path.join(DATA_DIR, 'network-fingerprints.json'));
  for (const n of fingerprints?.networks || []) {
    for (const d of n.domains || []) set.add(String(d).toLowerCase());
  }
  return set;
}

function buildLedgerDomainSet(ledgerPath) {
  const set = new Set();
  const ledger = loadJsonSafe(ledgerPath);
  for (const r of ledger?.records || []) {
    try { set.add(new URL(r.url).hostname.replace(/^www\./, '').toLowerCase()); } catch { /* bad row, skip */ }
  }
  return set;
}

/* ------------------------------------------------------------------ *
 * JSONL output + resume bookkeeping.
 * ------------------------------------------------------------------ */

function appendLine(outPath, obj) {
  fs.mkdirSync(path.dirname(outPath) || '.', { recursive: true });
  fs.appendFileSync(outPath, `${JSON.stringify(obj)}\n`, 'utf8');
}

function readLines(outPath) {
  if (!fs.existsSync(outPath)) return [];
  return fs.readFileSync(outPath, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

function loadDoneQueries(outPath) {
  const done = new Set();
  for (const row of readLines(outPath)) {
    if (row.type === 'query-summary' || row.type === 'query-error') done.add(row.query);
  }
  return done;
}

function loadSeenDomains(outPath) {
  const seen = new Set();
  for (const row of readLines(outPath)) {
    if (row.type === 'result' && row.domain) seen.add(row.domain);
  }
  return seen;
}

/* ------------------------------------------------------------------ *
 * Browser extraction. One session, sequential navigations — the
 * <law id="one-session-one-tab"/> pattern the discover workflow's recon
 * section already uses for Semrush reports.
 * ------------------------------------------------------------------ */

const EXTRACT_EXPR = `(() => {
  try {
    const seen = new Set();
    const out = [];
    const heads = Array.from(document.querySelectorAll('#search h3, #rso h3'));
    for (const h3 of heads) {
      const a = h3.closest('a[href]');
      if (!a) continue;
      let href = a.href;
      if (!href) continue;
      try {
        const u = new URL(href);
        if (/(^|\\.)google\\.[a-z.]+$/i.test(u.hostname) && u.pathname === '/url' && u.searchParams.get('q')) href = u.searchParams.get('q');
      } catch (e) { /* not absolute, leave as-is */ }
      if (!/^https?:\\/\\//i.test(href)) continue;
      try { if (/(^|\\.)google\\.[a-z.]+$/i.test(new URL(href).hostname)) continue; } catch (e) { continue; }
      if (seen.has(href)) continue;
      seen.add(href);
      const title = h3.textContent.trim();
      let snippet = '';
      const container = a.closest('div[data-hveid]') || a.closest('div.g') || (a.parentElement && a.parentElement.parentElement);
      if (container) {
        const snEl = container.querySelector('[data-sncf], .VwiC3b, .IsZvec, span.aCOpRe');
        if (snEl) snippet = snEl.textContent.trim();
      }
      out.push({ rank: out.length + 1, url: href, title, snippet });
    }
    const bodyText = document.body ? document.body.innerText.slice(0, 4000) : '';
    const captcha = /unusual traffic|automated queries|detected unusual traffic|our systems have detected/i.test(bodyText)
      || Boolean(document.querySelector('form#captcha-form, #recaptcha, iframe[src*="recaptcha"]'));
    return { results: out, captcha, href: location.href, bodyTextSample: bodyText };
  } catch (e) {
    return { results: [], captcha: false, href: location.href, bodyTextSample: '', evalError: String((e && e.message) || e) };
  }
})()`;

async function runQuery(session, query, { num, hl, gl }) {
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=${num}&hl=${hl}&gl=${gl}`;
  return openAndEval(session, url, EXTRACT_EXPR, { wait: 4 });
}

/**
 * One cheap, non-operator query fired before any real footprint query is
 * spent. If the account is already sitting on a CAPTCHA — plausible with no
 * action from this process at all, since other machine-local sessions share
 * the same logged-in Google — there is no point paying for 1-3 more blocked
 * queries and a scene capture per keyword. Uses a plain "test" search so a
 * clean result never gets logged as a footprint result row.
 */
async function preflightCaptchaCheck(session, { hl, gl }) {
  const extraction = await runQuery(session, 'test', { num: 10, hl, gl });
  return isCaptchaSignal(extraction);
}

/* ------------------------------------------------------------------ *
 * Self-test: exercises the pure functions above against a fixture.
 * Opens no browser. This is the only thing --self-test checks — it does
 * NOT prove Google's markup still matches EXTRACT_EXPR's selectors, only
 * that everything downstream of "a list of {rank,url,title,snippet}" is
 * correct. A real smoke run is still required to check the selectors.
 * ------------------------------------------------------------------ */

function selfTest() {
  let failures = 0;
  const check = (label, cond) => {
    if (!cond) { failures += 1; console.error(`FAIL: ${label}`); }
  };
  const eq = (label, actual, expected) => check(`${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`, JSON.stringify(actual) === JSON.stringify(expected));

  const ctx = {
    libSet: new Set(['addictinggames.com']),
    fpSet: new Set(['spamnet.example']),
    ledgerSet: new Set(['already-submitted.example']),
  };

  const r1 = buildResultRecord('browser games inurl:submit', { rank: 1, url: 'https://indiex.online/submitgame', title: 'Submit Your Game | Indie X', snippet: 'Submit your indie game' }, ctx);
  eq('r1.domain', r1?.domain, 'indiex.online');
  eq('r1.operatorHit', r1?.operatorHit, true);
  check('r1.shapeScore >= 1', (r1?.shapeScore ?? 0) >= 1);
  eq('r1.inLibrary', r1?.inLibrary, false);

  const r2 = buildResultRecord('browser games inurl:submit', { rank: 2, url: 'https://www.addictinggames.com/', title: 'Free Online Games', snippet: 'Play free games' }, ctx);
  eq('r2.shapeScore', r2?.shapeScore, 0);
  eq('r2.operatorHit', r2?.operatorHit, false);
  eq('r2.inLibrary', r2?.inLibrary, true);

  const r3 = buildResultRecord('q', { rank: 3, url: 'https://www.google.com/url?q=https://example.com/foo&sa=U', title: 'x', snippet: '' }, ctx);
  eq('r3.domain unwrapped through /url?q=', r3?.domain, 'example.com');

  const r4 = buildResultRecord('q', { rank: 4, url: 'https://www.google.com/search?q=x', title: 'self-link', snippet: '' }, ctx);
  eq('r4 filtered as Google self-link', r4, null);

  const r5 = buildResultRecord('q', { rank: 5, url: 'https://already-submitted.example/write-for-us', title: 't', snippet: '' }, ctx);
  eq('r5.inLedger', r5?.inLedger, true);
  eq('r5.fingerprintHit', r5?.fingerprintHit, false);

  const r6 = buildResultRecord('q', { rank: 6, url: 'https://spamnet.example/directory/x', title: 't', snippet: '' }, ctx);
  eq('r6.fingerprintHit', r6?.fingerprintHit, true);
  check('r6.shapeScore counts the directory hit', (r6?.shapeScore ?? 0) >= 1);

  eq('captcha true on /sorry/ href', isCaptchaSignal({ captcha: false, href: 'https://www.google.com/sorry/index?continue=x', bodyTextSample: '' }), true);
  eq('captcha true on body-text marker', isCaptchaSignal({ captcha: false, href: 'https://www.google.com/search?q=x', bodyTextSample: 'Our systems have detected unusual traffic from your computer network.' }), true);
  eq('captcha false on an ordinary results page', isCaptchaSignal({ captcha: false, href: 'https://www.google.com/search?q=x', bodyTextSample: 'About 10 results' }), false);

  eq('delay range: fixed number', parseDelayRange('5000'), [5000, 5000]);
  eq('delay range: explicit span', parseDelayRange('8000-20000'), [8000, 20000]);
  eq('delay range: default', parseDelayRange(null), [8000, 20000]);

  eq('preset submit → 3 templates', buildQueryList({ keyword: 'browser games', preset: 'submit' }).length, 3);
  eq('preset write-for-us → 2 templates', buildQueryList({ keyword: 'browser games', preset: 'write-for-us' }).length, 2);
  eq('preset all → 5 templates', buildQueryList({ keyword: 'browser games', preset: 'all' }).length, 5);
  check('no inurl:resources template shipped', !Object.keys(TEMPLATES).some((k) => /resources/.test(k)));
  check('no add-your-site template shipped', !Object.keys(TEMPLATES).some((k) => /add.?your/.test(k)));

  const queriesFileList = buildQueryList({ 'queries-file': '/dev/null' });
  eq('queries-file with no lines → empty list', queriesFileList, []);

  if (failures) {
    console.error(`\nself-test: ${failures} failure(s)`);
    process.exitCode = 1;
    return;
  }
  console.log('self-test: all checks passed (extraction/scoring/dedup/preset logic; no browser opened)');
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

function printFinalSummary({ summaries, stopped, out }) {
  process.stderr.write('\n=== footprint-discover summary ===\n');
  let totalResults = 0;
  let totalOperatorHits = 0;
  let totalNewDomains = 0;
  for (const s of summaries) {
    const rate = s.resultCount ? Math.round((s.operatorHits / s.resultCount) * 100) : 0;
    process.stderr.write(`  ${s.query}\n    results=${s.resultCount} operatorHit=${s.operatorHits}/${s.resultCount} (${rate}%) newDomains=${s.newDomains}\n`);
    totalResults += s.resultCount;
    totalOperatorHits += s.operatorHits;
    totalNewDomains += s.newDomains;
  }
  process.stderr.write(`\ntotal: queries=${summaries.length} results=${totalResults} operatorHit=${totalOperatorHits} newDomains=${totalNewDomains}\n`);
  if (stopped) {
    process.stderr.write(`\nSTOPPED: CAPTCHA signal on query "${stopped.query}". Evidence written to ${stopped.evidenceDir}. Nothing already collected was discarded; re-run with --resume later.\n`);
    if (stopped.sessionKept) {
      process.stderr.write(`Session kept open for manual solving — session name: ${stopped.sessionName}.\n`);
    }
  }
  process.stderr.write(`\nNext step — build a lead list for the prober from the new, unlibraried, non-fingerprinted domains in ${out}:\n`);
  process.stderr.write(`  node -e "const fs=require('fs');const seen=new Set();const rows=fs.readFileSync('${out}','utf8').split('\\n').filter(Boolean).map(JSON.parse).filter(r=>r.type==='result'&&r.shapeScore>=1&&!r.inLibrary&&!r.fingerprintHit&&!r.inLedger);const leads=rows.filter(r=>!seen.has(r.domain)&&seen.add(r.domain)).map(r=>({domain:r.domain,urls:[r.url]}));fs.writeFileSync('${out}.leads.json',JSON.stringify(leads,null,2));console.log(leads.length,'leads')"\n`);
  process.stderr.write(`  node scripts/probe-submission-targets.mjs --input ${out}.leads.json --out ${out}.probed.json --concurrency 8\n`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);

  if (flags['self-test']) { selfTest(); return; }

  const engine = flags.engine || 'google';
  if (engine !== 'google') throw new Error('Only --engine google is implemented — see the header comment for why anysearch/Bing/DuckDuckGo cannot substitute for operator-bearing footprint queries.');

  const num = Number(flags.num || 30);
  const hl = flags.hl || 'en';
  const gl = flags.gl || 'us';
  const out = required(flags, 'out');
  const resume = Boolean(flags.resume);
  const ledgerPath = flags.ledger || '.backlink/ledger.json';
  const delaySpec = flags['delay-ms'] || null;
  // Default ON: a human sitting at the owner's own Chrome can solve a CAPTCHA
  // manually in seconds; closing the tab out from under them just makes them
  // hunt for a new one. This script still never solves/bypasses a CAPTCHA
  // itself — see <rule id="no-bypass"/> — it only stops touching the tab so
  // a person can. `--no-keep-session-on-captcha` restores the old
  // close-on-stop behaviour.
  const keepSessionOnCaptcha = !flags['no-keep-session-on-captcha'];

  const queries = buildQueryList(flags);
  if (!queries.length) throw new Error('No queries to run. Pass --queries-file <txt>, or --keyword <kw> with --preset submit|write-for-us|all.');

  const ctx = {
    libSet: buildLibraryDomainSet(),
    fpSet: buildFingerprintDomainSet(),
    ledgerSet: buildLedgerDomainSet(ledgerPath),
  };

  const doneQueries = resume ? loadDoneQueries(out) : new Set();
  const pending = queries.filter((q) => !doneQueries.has(q));
  const seenDomains = resume ? loadSeenDomains(out) : new Set();

  if (!pending.length) {
    process.stderr.write('Nothing to do — every query is already in --out (per --resume). Pass a fresh --out to re-run them.\n');
    return;
  }

  // Per <law id="no-literal-session-name"/>: a per-process suffix, not a bare
  // literal. This run holds exactly one page and navigates it query by query,
  // the same pattern the "discover" workflow's Semrush recon section uses —
  // see SKILL.md's <workflow id="discover"> <recon> block.
  const session = defaultSession('backlink-footprint');
  const summaries = [];
  let stopped = null;

  // Machine-wide mutex — see the header comment "Machine-wide contention".
  // This only serialises other footprint-discover.mjs invocations against
  // each other; it cannot see or stop unrelated scripts/agents also talking
  // to Google outside this file.
  const lock = await acquireToolsShareLock('google', { timeoutMs: 15 * 60_000 });

  try {
    const preexisting = await preflightCaptchaCheck(session, { hl, gl });
    if (preexisting) {
      const evidenceDir = defaultSceneDir({ out });
      const scene = await captureScene({ session, outDir: evidenceDir, tag: 'captcha-preexisting-preflight', note: 'Preflight non-operator query already landed on /sorry before any real query was spent.' });
      appendLine(out, {
        type: 'run-summary', stopReason: 'captcha-preexisting', evidenceDir, scene,
        sessionKept: keepSessionOnCaptcha, sessionName: session, capturedAt: nowIso(),
      });
      process.stderr.write(`\nSTOPPED before spending any query: Google is already showing a CAPTCHA to this session (stopReason: captcha-preexisting). Evidence written to ${evidenceDir}.\n`);
      if (keepSessionOnCaptcha) {
        process.stderr.write(`Session left open for manual solving — session name: ${session}, url: ${scene?.href || '(see evidence)'}. Pass --no-keep-session-on-captcha to close it instead.\n`);
      } else {
        await closeSession(session);
      }
      await lock.release();
      process.exitCode = 3;
      return;
    }

    for (let i = 0; i < pending.length; i += 1) {
      const query = pending[i];
      if (i > 0) await delay(delaySpec);
      process.stderr.write(`[query ${i + 1}/${pending.length}] ${query}\n`);

      let extraction;
      try {
        extraction = await runQuery(session, query, { num, hl, gl });
      } catch (error) {
        appendLine(out, { type: 'query-error', query, error: String(error?.message || error).slice(0, 300), capturedAt: nowIso() });
        process.stderr.write(`  query-error: ${String(error?.message || error).slice(0, 200)}\n`);
        continue;
      }

      if (isCaptchaSignal(extraction)) {
        const evidenceDir = defaultSceneDir({ out });
        // 先取证后死 / 先取证后关 per <law id="scripts-collect-ai-judges"/>:
        // capture before stopping, close (or, by default, leave open for a
        // human to solve — see keepSessionOnCaptcha above) after.
        const scene = await captureScene({ session, outDir: evidenceDir, tag: `captcha-${slug(query)}`, note: `CAPTCHA/unusual-traffic signal on query: ${query}` });
        appendLine(out, {
          type: 'run-summary', stopReason: 'captcha', queryAtStop: query, evidenceDir, scene,
          sessionKept: keepSessionOnCaptcha, sessionName: session, capturedAt: nowIso(),
        });
        if (keepSessionOnCaptcha) {
          process.stderr.write(`Session left open for manual solving — session name: ${session}, url: ${scene?.href || '(see evidence)'}. Pass --no-keep-session-on-captcha to close it instead.\n`);
        }
        stopped = { query, evidenceDir, sessionKept: keepSessionOnCaptcha, sessionName: session };
        break;
      }

      let operatorHits = 0;
      let newDomains = 0;
      const results = extraction.results || [];
      for (const item of results) {
        const record = buildResultRecord(query, item, ctx);
        if (!record) continue;
        appendLine(out, { ...record, capturedAt: nowIso() });
        if (record.operatorHit) operatorHits += 1;
        if (!seenDomains.has(record.domain)) { seenDomains.add(record.domain); newDomains += 1; }
      }

      const summary = { type: 'query-summary', query, resultCount: results.length, operatorHits, newDomains, capturedAt: nowIso() };
      appendLine(out, summary);
      summaries.push(summary);
    }
  } finally {
    if (!(stopped && keepSessionOnCaptcha)) await closeSession(session);
    await lock.release();
  }

  printFinalSummary({ summaries, stopped, out });
  if (stopped) process.exitCode = 3; // stopped early — a failure to run further, not a verdict
}

let isMain = false;
try {
  isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
} catch { /* argv[1] missing/unresolvable → treat as imported */ }

if (isMain) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
