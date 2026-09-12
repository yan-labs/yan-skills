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
 * Engine choice (updated 2026-09-12, second sweep of the day): needs a real
 * Google SERP where operators actually execute — everything else tried is
 * disqualified for one of two reasons, and the two implemented engines
 * (`serper`, the default when configured; `google`, the OpenCLI/browser
 * fallback) split the remaining tradeoff between them:
 *   - General search APIs (this repo tried anysearch) and Tuner do NOT
 *     execute `inurl:`/`intitle:` operators — they run a generic keyword
 *     search and silently ignore the operator, so every "footprint" query
 *     degrades to a plain keyword query with no signal that it happened;
 *     Tuner in particular also caps at ~10 results per query.
 *   - Bing (tried both the OpenCLI/browser path and re-verified with
 *     explicit `cc=US&setlang=en-US`) redirects by IP to a localized
 *     subdomain (`cn.bing.com`) and drops the operators there too — 0/10
 *     results matched the operator on a `puzzle games inurl:submit` probe.
 *     It cannot substitute for operator-bearing queries.
 *   - DuckDuckGo's HTML endpoint answers without JS but also does not honor
 *     `inurl:`/`intitle:`. Usable as a last-resort plain-text degrade, never
 *     as an operator-query substitute.
 *   - **`--engine serper` (preferred, used automatically whenever
 *     `SERPER_API_KEY` is configured)** — Serper.dev's `/search` endpoint is
 *     backed by a real Google SERP, not a different engine, so operators
 *     execute exactly as they would on google.com. It is a plain
 *     authenticated HTTP call: no browser, no OpenCLI session, no per-account
 *     CAPTCHA math to work around.
 *   - **`--engine google` (fallback when no key is configured)** — a real
 *     Google SERP loaded in the owner's own logged-in Chrome via OpenCLI.
 *     This is the path with the CAPTCHA policy and machine-wide-contention
 *     caveats documented below; it exists for when Serper access isn't set
 *     up, not the other way around.
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
 *   --engine google|serper  default: serper if SERPER_API_KEY is set, else
 *                          google (OpenCLI/browser). --engine serper with
 *                          no key configured errors instead of silently
 *                          falling back. See "Engine choice" below.
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

  // Serper: organic[] fixture, parse-only (no network).
  const serperFixture = {
    organic: [
      { position: 1, title: 'Submit Your Puzzle Game', link: 'https://example.com/submit-game', snippet: 'Submit your puzzle game to our directory.' },
      { position: 2, title: 'Play free puzzles', link: 'https://otherpuzzles.example/play' },
      { title: 'No position field', link: 'https://noposition.example/x' }, // falls back to index+1
      { position: 4, title: 'No link — dropped', snippet: 'should be filtered out' },
    ],
  };
  const mapped = mapSerperOrganic(serperFixture.organic);
  eq('serper: rows without a link are dropped', mapped.length, 3);
  eq('serper: position used as rank', mapped[0], { rank: 1, url: 'https://example.com/submit-game', title: 'Submit Your Puzzle Game', snippet: 'Submit your puzzle game to our directory.' });
  eq('serper: missing position falls back to array index+1', mapped[2].rank, 3);
  eq('serper: missing snippet defaults to empty string', mapped[1].snippet, '');
  eq('serper: mapSerperOrganic(undefined) → []', mapSerperOrganic(undefined), []);

  eq('isSerperFreeTierNumCapError: matches the real error body', isSerperFreeTierNumCapError('{"message":"Query pattern not allowed for free accounts.","statusCode":400}'), true);
  eq('isSerperFreeTierNumCapError: case-insensitive', isSerperFreeTierNumCapError('QUERY PATTERN NOT ALLOWED FOR FREE ACCOUNTS'), true);
  eq('isSerperFreeTierNumCapError: unrelated 400 body does not match', isSerperFreeTierNumCapError('{"message":"Invalid API key","statusCode":401}'), false);
  eq('isSerperFreeTierNumCapError: empty/undefined body does not match', isSerperFreeTierNumCapError(undefined), false);

  const serperRecord = buildResultRecord('puzzle games inurl:submit', mapped[0], ctx);
  eq('serper result feeds the same buildResultRecord as google', serperRecord?.domain, 'example.com');
  eq('serper result operatorHit uses the same shape scoring', serperRecord?.operatorHit, true);

  // Engine resolution: explicit flag wins; otherwise presence of
  // SERPER_API_KEY decides; explicit --engine serper without a key errors
  // instead of silently falling back (a typo'd/missing key should be loud).
  const savedKey = process.env.SERPER_API_KEY;
  try {
    delete process.env.SERPER_API_KEY;
    eq('resolveEngine: no flag, no key → google', resolveEngine({}), 'google');
    eq('resolveEngine: explicit --engine google, no key → google', resolveEngine({ engine: 'google' }), 'google');
    check('resolveEngine: explicit --engine serper, no key → throws', (() => { try { resolveEngine({ engine: 'serper' }); return false; } catch { return true; } })());
    process.env.SERPER_API_KEY = 'test-key-not-real';
    eq('resolveEngine: no flag, key present → serper', resolveEngine({}), 'serper');
    eq('resolveEngine: explicit --engine google, key present → google (explicit wins)', resolveEngine({ engine: 'google' }), 'google');
    eq('resolveEngine: explicit --engine serper, key present → serper', resolveEngine({ engine: 'serper' }), 'serper');
    check('resolveEngine: unknown --engine value → throws', (() => { try { resolveEngine({ engine: 'bing' }); return false; } catch { return true; } })());
  } finally {
    if (savedKey === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = savedKey;
  }

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
    const where = stopped.preexisting ? 'before any query was spent (preflight check)' : `on query "${stopped.query}"`;
    process.stderr.write(`\nSTOPPED: CAPTCHA signal ${where}. Evidence written to ${stopped.evidenceDir}. Nothing already collected was discarded; re-run with --resume later.\n`);
    if (stopped.sessionKept) {
      process.stderr.write(`Session kept open for manual solving — session name: ${stopped.sessionName}.\n`);
    }
  }
  process.stderr.write(`\nNext step — build a lead list for the prober from the new, unlibraried, non-fingerprinted domains in ${out}:\n`);
  process.stderr.write(`  node -e "const fs=require('fs');const seen=new Set();const rows=fs.readFileSync('${out}','utf8').split('\\n').filter(Boolean).map(JSON.parse).filter(r=>r.type==='result'&&r.shapeScore>=1&&!r.inLibrary&&!r.fingerprintHit&&!r.inLedger);const leads=rows.filter(r=>!seen.has(r.domain)&&seen.add(r.domain)).map(r=>({domain:r.domain,urls:[r.url]}));fs.writeFileSync('${out}.leads.json',JSON.stringify(leads,null,2));console.log(leads.length,'leads')"\n`);
  process.stderr.write(`  node scripts/probe-submission-targets.mjs --input ${out}.leads.json --out ${out}.probed.json --concurrency 8\n`);
}

/**
 * Which engine actually runs, per <ref file="references/discovery-loop.md"/>
 * "Footprint discovery — engine choice": Serper (a real Google SERP API,
 * operators execute as-is, no CAPTCHA math) is preferred whenever a key is
 * configured; the OpenCLI/browser Google path is kept as the fallback for
 * when no key is set up, not the other way around.
 *   --engine serper explicit → use it, error out (not silently fall back) if
 *     SERPER_API_KEY is missing, so a typo'd or unconfigured key fails loud.
 *   --engine google explicit → use it regardless of any key present.
 *   no --engine → serper if SERPER_API_KEY is set, else google.
 */
function resolveEngine(flags) {
  const requested = flags.engine;
  const hasKey = Boolean((process.env.SERPER_API_KEY || '').trim());
  if (requested) {
    if (requested !== 'google' && requested !== 'serper') {
      throw new Error(`Unknown --engine "${requested}" — only "google" and "serper" are implemented.`);
    }
    if (requested === 'serper' && !hasKey) {
      throw new Error('--engine serper requires SERPER_API_KEY (backlink/.env or the environment) — see references/discovery-loop.md § "Footprint discovery — engine choice" for where to get a key.');
    }
    return requested;
  }
  return hasKey ? 'serper' : 'google';
}

const SERPER_ENDPOINT = 'https://google.serper.dev/search';

/**
 * A real Google SERP through the Serper.dev API — operators (`inurl:`,
 * quoted phrases) execute exactly as they would on google.com, because
 * Serper's backend *is* Google; it is not a different search engine like
 * Bing/DuckDuckGo that silently drops them. No browser, no OpenCLI session,
 * no CAPTCHA math: this is a plain authenticated HTTP call.
 */
/** Pure, exercised directly by --self-test with a fixture — no network. */
export function mapSerperOrganic(organic) {
  const list = Array.isArray(organic) ? organic : [];
  return list.map((item, idx) => ({
    rank: Number.isInteger(item?.position) ? item.position : idx + 1,
    url: item?.link || '',
    title: item?.title || '',
    snippet: item?.snippet || '',
  })).filter((r) => r.url);
}

/** True for the specific free-tier-num-cap 400 body — see the comment on
 * `runQuerySerper` below. Exercised by --self-test with a fixture string. */
export function isSerperFreeTierNumCapError(bodyText) {
  return /query pattern not allowed for free accounts/i.test(String(bodyText || ''));
}

async function fetchSerper(apiKey, query, { num, hl, gl }) {
  const res = await fetch(SERPER_ENDPOINT, {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: query, gl, hl, num }),
  });
  const bodyText = res.ok ? null : await res.text().catch(() => '');
  return { res, bodyText };
}

/**
 * Discovered 2026-09-12 running a real sweep: a free-tier Serper account
 * rejects `num > 10` with `400 {"message":"Query pattern not allowed for
 * free accounts."}` **only** when the query contains an operator or a
 * quoted phrase — the exact shape footprint queries always have. A plain
 * keyword query happily accepts num up to 30+. Confirmed by direct probing:
 * `puzzle games inurl:submit` at num=10 → 200, num=11 → 400, every value up
 * to 30 → 400; a bare `puzzle games` succeeds at num=30. Silently eating
 * this as "0 results" (what happened on the first real run before this fix)
 * looks exactly like an empty footprint and would have burned the whole
 * sweep's Serper quota for nothing. So: request the caller's `num`, and on
 * this specific error retry once at num=10 rather than failing the query —
 * any other 400/non-2xx still throws normally.
 */
async function runQuerySerper(query, { num, hl, gl }) {
  const apiKey = (process.env.SERPER_API_KEY || '').trim();
  if (!apiKey) throw new Error('SERPER_API_KEY is not set.');
  const requestedNum = Math.min(Number(num) || 30, 100);
  let { res, bodyText } = await fetchSerper(apiKey, query, { num: requestedNum, hl, gl });
  let numUsed = requestedNum;

  if (!res.ok && requestedNum > 10 && isSerperFreeTierNumCapError(bodyText)) {
    numUsed = 10;
    ({ res, bodyText } = await fetchSerper(apiKey, query, { num: 10, hl, gl }));
  }

  if (!res.ok) {
    throw new Error(`serper HTTP ${res.status}: ${String(bodyText || '').slice(0, 200)}`);
  }
  const data = await res.json();
  return { results: mapSerperOrganic(data?.organic), numUsed, numClamped: numUsed !== requestedNum };
}

/**
 * Serper sweep: no browser, no Tools Share lock (nothing shared is at
 * stake — it is a metered HTTP API on its own key), no CAPTCHA stop
 * concept. Query-to-query delay is a short courtesy pace, not a CAPTCHA
 * countermeasure — the effective-footprint rate limiting that matters here
 * is Serper's own API quota, which surfaces as a normal HTTP error.
 */
async function runSerperEngine({ pending, ctx, seenDomains, out, num, hl, gl, delaySpec }) {
  const summaries = [];
  for (let i = 0; i < pending.length; i += 1) {
    const query = pending[i];
    if (i > 0) await delay(delaySpec || '1000-2000');
    process.stderr.write(`[query ${i + 1}/${pending.length}] ${query}\n`);

    let extraction;
    try {
      extraction = await runQuerySerper(query, { num, hl, gl });
    } catch (error) {
      appendLine(out, { type: 'query-error', engine: 'serper', query, error: String(error?.message || error).slice(0, 300), capturedAt: nowIso() });
      process.stderr.write(`  query-error: ${String(error?.message || error).slice(0, 200)}\n`);
      continue;
    }

    if (extraction.numClamped) {
      process.stderr.write(`  note: free-tier Serper rejected num=${num} for this operator/quoted query; retried at num=10.\n`);
    }

    let operatorHits = 0;
    let newDomains = 0;
    const results = extraction.results || [];
    for (const item of results) {
      const record = buildResultRecord(query, item, ctx);
      if (!record) continue;
      appendLine(out, { ...record, engine: 'serper', capturedAt: nowIso() });
      if (record.operatorHit) operatorHits += 1;
      if (!seenDomains.has(record.domain)) { seenDomains.add(record.domain); newDomains += 1; }
    }

    const summary = {
      type: 'query-summary', engine: 'serper', query, resultCount: results.length, operatorHits, newDomains,
      numUsed: extraction.numUsed, numClamped: Boolean(extraction.numClamped), capturedAt: nowIso(),
    };
    appendLine(out, summary);
    summaries.push(summary);
  }
  return { summaries, stopped: null };
}

/**
 * OpenCLI/browser Google sweep — the original engine, kept as the fallback
 * for when no Serper key is configured. See the header comment "Machine-wide
 * contention" and "CAPTCHA policy" for why this path needs the Tools Share
 * lock, the preflight check, and the keep-session-on-captcha behaviour.
 */
async function runGoogleEngine({ pending, ctx, seenDomains, out, num, hl, gl, delaySpec, keepSessionOnCaptcha }) {
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
        type: 'run-summary', engine: 'google', stopReason: 'captcha-preexisting', evidenceDir, scene,
        sessionKept: keepSessionOnCaptcha, sessionName: session, capturedAt: nowIso(),
      });
      process.stderr.write(`\nSTOPPED before spending any query: Google is already showing a CAPTCHA to this session (stopReason: captcha-preexisting). Evidence written to ${evidenceDir}.\n`);
      if (keepSessionOnCaptcha) {
        process.stderr.write(`Session left open for manual solving — session name: ${session}, url: ${scene?.href || '(see evidence)'}. Pass --no-keep-session-on-captcha to close it instead.\n`);
      } else {
        await closeSession(session);
      }
      await lock.release();
      return { summaries, stopped: { query: null, evidenceDir, sessionKept: keepSessionOnCaptcha, sessionName: session, preexisting: true } };
    }

    for (let i = 0; i < pending.length; i += 1) {
      const query = pending[i];
      if (i > 0) await delay(delaySpec);
      process.stderr.write(`[query ${i + 1}/${pending.length}] ${query}\n`);

      let extraction;
      try {
        extraction = await runQuery(session, query, { num, hl, gl });
      } catch (error) {
        appendLine(out, { type: 'query-error', engine: 'google', query, error: String(error?.message || error).slice(0, 300), capturedAt: nowIso() });
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
          type: 'run-summary', engine: 'google', stopReason: 'captcha', queryAtStop: query, evidenceDir, scene,
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
        appendLine(out, { ...record, engine: 'google', capturedAt: nowIso() });
        if (record.operatorHit) operatorHits += 1;
        if (!seenDomains.has(record.domain)) { seenDomains.add(record.domain); newDomains += 1; }
      }

      const summary = { type: 'query-summary', engine: 'google', query, resultCount: results.length, operatorHits, newDomains, capturedAt: nowIso() };
      appendLine(out, summary);
      summaries.push(summary);
    }
  } finally {
    if (!(stopped && keepSessionOnCaptcha)) await closeSession(session);
    await lock.release();
  }

  return { summaries, stopped };
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);

  if (flags['self-test']) { selfTest(); return; }

  const engine = resolveEngine(flags);
  console.log(engine === 'serper'
    ? 'engine: serper (SERPER_API_KEY found — real Google SERP via API, operators execute as-is)'
    : 'engine: google (OpenCLI/browser — ' + (flags.engine ? '--engine google explicit' : 'no SERPER_API_KEY found, falling back') + ')');

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

  const { summaries, stopped } = engine === 'serper'
    ? await runSerperEngine({ pending, ctx, seenDomains, out, num, hl, gl, delaySpec })
    : await runGoogleEngine({ pending, ctx, seenDomains, out, num, hl, gl, delaySpec, keepSessionOnCaptcha });

  printFinalSummary({ summaries, stopped, out });
  if (stopped) process.exitCode = 3; // stopped early — a failure to run further, not a verdict
}

let isMain = false;
try {
  isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
} catch { /* argv[1] missing/unresolvable → treat as imported */ }

if (isMain) main().catch((error) => { console.error(error?.stack || error); process.exitCode = 1; });
