#!/usr/bin/env node
/**
 * merge-submission-targets.mjs — fold a probe run (and any agent-resolved or
 * price-checked overlays) into data/submission-targets.json, and route the
 * paid ones into data/paid-platforms.json.
 *
 * Layering, later wins per field: probe (anonymous HTTP, mechanical) →
 * resolved (a route was followed and the page judged) → priced (what the money
 * actually buys). Each layer only overwrites fields it actually observed.
 *
 * What is DROPPED, and the only things that are:
 *   - status dead — the domain is no longer a submission surface;
 *   - status unverified — no route could be established at all.
 * Nothing is dropped for being low-DR, off-topic, obscure, or ugly. Per
 * references/acquisition-doctrine.md those rank targets, they never gate them.
 *
 * NOTHING IS DROPPED SILENTLY (third refactor wave, 2026-08-30). This script
 * used to print two counters — "dropped 41 dead, 12 unverified" — and throw the
 * rows away. A count is not reviewable: `unverified` in particular means "the
 * probe could not establish a route", which is a statement about **the probe**,
 * not about the domain, and a 403 from a WAF looks exactly like a domain that
 * has no submission form. Now every dropped row is emitted in full, with its
 * reason and whatever evidence the probe collected, on stdout and — with
 * `--dropped-out <file>` — as JSON you can re-probe from. The same goes for the
 * `usable` → `gated` downgrade: it is an inference this script draws from the
 * gate set, so it is listed as such, not applied in silence.
 *
 * Neither the drop nor the downgrade is a verdict on the domain. They are this
 * run's bookkeeping, and the rows come back out so a human or the AI can look.
 *
 * Usage:
 *   node scripts/merge-submission-targets.mjs \
 *     --probe /tmp/probe/all.json \
 *     --resolved /tmp/probe/resolved-1.json --resolved ... \
 *     --priced /tmp/probe/priced-1.json --priced ... \
 *     --source-list 'flaqai/backlink_skills Free-backlink-list.md' \
 *     [--dropped-out /tmp/probe/dropped.json] [--dry-run]
 */

import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cohortOf, primaryGate } from './lib-cohort.mjs';
import { helpGuard } from './opencli-core.mjs';
helpGuard(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');

const args = { probe: null, resolved: [], priced: [], sourceList: null, dryRun: false, droppedOut: null };
for (let i = 2; i < process.argv.length; i++) {
  const f = process.argv[i];
  const v = () => process.argv[++i];
  if (f === '--probe') args.probe = v();
  else if (f === '--resolved') args.resolved.push(v());
  else if (f === '--priced') args.priced.push(v());
  else if (f === '--source-list') args.sourceList = v();
  else if (f === '--dropped-out') args.droppedOut = v();
  else if (f === '--dry-run') args.dryRun = true;
  else throw new Error(`unknown flag ${f}`);
}
if (!args.probe) throw new Error('--probe is required');

const readRows = (f) => {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  return Array.isArray(j) ? j : j.targets || j.records || [];
};

const KIND = new Set(['product-directory', 'ai-directory', 'startup-launch', 'saas-review', 'web-directory', 'business-directory', 'dev-community', 'publish-platform', 'comment-form', 'search-engine', 'contact-form', 'unknown']);
const GATE = new Set(['open-form', 'account', 'captcha-interactive', 'captcha-passive', 'email-verify', 'personal-contact', 'reciprocal', 'manual-review', 'none-found', 'unknown']);
const STATUS = new Set(['usable', 'gated', 'unverified', 'dead']);
const PAY = new Set(['none-seen', 'optional', 'required', 'unknown']);
const HUMAN_GATE = new Set(['captcha-interactive', 'account', 'reciprocal', 'personal-contact']);

const byDomain = new Map();
for (const r of readRows(args.probe)) {
  if (!r.domain) continue;
  const { _signals, ...clean } = r;
  byDomain.set(r.domain, { ...clean, sourceList: args.sourceList || clean.sourceList || null });
}

let resolvedApplied = 0;
for (const f of args.resolved) {
  for (const r of readRows(f)) {
    const t = byDomain.get(r.domain);
    if (!t) continue;
    resolvedApplied++;
    if (r.route) t.route = r.route;
    if (r.name) t.name = r.name;
    if (KIND.has(r.kind)) t.kind = r.kind;
    // The resolver followed the real submission route; the probe may only have
    // seen the homepage. Same URL → both looked at the same page, so union the
    // gates. Different URL → the resolver's page is the one that matters, and
    // unioning would import a "Sign in" link from the homepage nav as a gate.
    if (GATE.has(r.gate)) {
      const sameRoute = r.route && t.route && r.route.replace(/\/$/, '') === t.route.replace(/\/$/, '');
      const probeGates = (t.gates || []).filter((g) => g !== 'none-found' && g !== 'unknown');
      t.gates = [...new Set(sameRoute ? [...probeGates, r.gate] : [r.gate])];
    }
    if (STATUS.has(r.status)) t.status = r.status;
    if (PAY.has(r.payment)) t.payment = r.payment;
    if (r.price !== undefined) t.price = r.price || null;
    if (r.evidenceWhat && r.evidenceWhat.length >= 10) {
      t.evidence = {
        method: 'anonymous-http',
        what: r.evidenceWhat,
        httpStatus: r.httpStatus ?? t.evidence?.httpStatus ?? null,
        finalUrl: r.finalUrl ?? t.evidence?.finalUrl ?? null,
        title: r.name ?? t.evidence?.title ?? null,
      };
    }
  }
}

const paidRows = new Map();
let pricedApplied = 0;
for (const f of args.priced) {
  for (const r of readRows(f)) {
    const t = byDomain.get(r.domain);
    if (!t) continue;
    pricedApplied++;
    if (PAY.has(r.payment)) t.payment = r.payment;
    t.price = r.price || null;
    if (r.freePathNote) t.notes = [t.notes, r.freePathNote].filter(Boolean).join(' · ').slice(0, 300);
    if (r.evidenceWhat && r.evidenceWhat.length >= 10) {
      t.evidence = { ...t.evidence, method: 'anonymous-http', what: r.evidenceWhat, httpStatus: r.httpStatus ?? t.evidence?.httpStatus ?? null };
    }
    if (r.tier && r.tier !== 'free-with-account' && r.tier !== 'not-a-platform' && r.price && r.pricePageUrl) {
      paidRows.set(r.domain, { tier: r.tier, price: r.price, sourceUrl: r.pricePageUrl, what: r.evidenceWhat || null });
    }
  }
}

const today = new Date().toISOString().slice(0, 10);
const kept = [];
// Not counters. Every dropped row is kept in full so it can be reviewed and
// re-probed — see the header: `unverified` is a fact about the probe, not
// about the domain, and a count cannot be told apart from a WAF block.
const dropped = [];
const downgraded = [];
const DROP_REASON = {
  dead: 'probe/resolver reported status=dead — the domain is no longer a submission surface',
  unverified: 'probe/resolver reported status=unverified — no route could be established. '
    + 'This describes the probe, not the domain: a 403/WAF block, a timeout and a genuine '
    + 'absence of any form all land here. Re-probe before concluding anything.',
};
for (const t of byDomain.values()) {
  if (t.status === 'dead' || t.status === 'unverified') {
    dropped.push({
      domain: t.domain,
      status: t.status,
      reason: DROP_REASON[t.status],
      route: t.route ?? null,
      name: t.name ?? null,
      kind: t.kind ?? null,
      gates: t.gates ?? null,
      sourceList: t.sourceList ?? null,
      lastProbedAt: t.lastProbedAt ?? null,
      evidence: t.evidence ?? null,
    });
    continue;
  }
  // Recompute the single gate and the cohort from the full gate set, once, here.
  // Any layer may have written a stale `gate`; `gates` is the ground truth.
  t.gates = [...new Set((t.gates && t.gates.length ? t.gates : [t.gate || 'unknown']).filter((g) => GATE.has(g)))];
  if (!t.gates.length) t.gates = ['unknown'];
  t.gate = primaryGate(t.gates);
  t.cohort = cohortOf(t.gates);
  // A human-only gate is never `usable`, whatever a layer claimed — but that is
  // an *inference from the gate set*, so say so instead of rewriting in silence.
  if (t.status === 'usable' && t.gates.some((g) => HUMAN_GATE.has(g))) {
    downgraded.push({
      domain: t.domain,
      from: 'usable',
      to: 'gated',
      because: t.gates.filter((g) => HUMAN_GATE.has(g)),
      reason: 'a gate in this row needs a human (captcha-interactive / account / reciprocal / personal-contact), '
        + 'so the row cannot be handed to an unattended batch. The gate observation is the fact; '
        + 'this status is derived from it.',
    });
    t.status = 'gated';
  }
  if (t.price && !t.priceCheckedAt) t.priceCheckedAt = today;
  if (!t.price) t.priceCheckedAt = null;
  kept.push({
    domain: t.domain, route: t.route, name: t.name || undefined, kind: t.kind,
    gate: t.gate, gates: t.gates, cohort: t.cohort,
    payment: t.payment, price: t.price ?? null, priceCheckedAt: t.priceCheckedAt ?? null,
    status: t.status, sourceList: t.sourceList ?? null, notes: t.notes ?? null,
    lastProbedAt: t.lastProbedAt || today, evidence: t.evidence,
  });
}
kept.sort((a, b) => a.domain.localeCompare(b.domain));

// **This run only ever touches the domains named in --probe/--resolved/--priced.**
// Every other domain already in data/submission-targets.json must survive
// untouched — this file is the accumulated library, not this run's scratch
// output. Before 2026-09-12 this script never read the existing file at all:
// `out.targets = kept` replaced the whole library with just this run's rows,
// and a 4-domain footprint-discovery run silently reduced a 924-row library
// to 4. That is exactly the "silent subtraction" failure this Skill's own
// laws forbid (references/discovery-loop.md's law on scripts-collect-ai-judges
// and CONTRIBUTING.md's evidence rule both apply) — a run's own output must
// never be mistaken for the whole table.
const existingFile = join(DATA, 'submission-targets.json');
const existingTargets = fs.existsSync(existingFile)
  ? (JSON.parse(fs.readFileSync(existingFile, 'utf8')).targets || [])
  : [];
const merged = new Map(existingTargets.map((t) => [t.domain, t]));
// This run's kept rows always win for the domains they touch (fresher evidence).
for (const t of kept) merged.set(t.domain, t);
// A domain this run re-probed and found dead/unverified is removed from the
// library even if an older row for it existed — that IS new evidence, not a
// silent drop, and it is still fully reported via `dropped` below.
for (const d of dropped) merged.delete(d.domain);
const allTargets = [...merged.values()].sort((a, b) => a.domain.localeCompare(b.domain));

const out = {
  version: 1,
  updatedAt: new Date().toISOString(),
  note: 'Submission routes observed to exist. NOT placements: no row here claims a published link, a rel value, or an index entry. A row graduates into free-channels.json only when a real anchor is seen on a live page. Relevance and authority rank these, they never gate them.',
  targets: allTargets,
};

// —— paid side ————————————————————————————————————————————————
const paidFile = join(DATA, 'paid-platforms.json');
const paid = JSON.parse(fs.readFileSync(paidFile, 'utf8'));
let paidNew = 0; let paidUpdated = 0;
for (const [host, p] of paidRows) {
  const existing = paid.platforms[host];
  const observedPrice = { what: p.what || `Listed price read on ${host}`, sourceUrl: p.sourceUrl, checkedAt: today };
  if (existing) {
    paidUpdated++;
    existing.tier = existing.tier === 'unverified' ? p.tier : existing.tier;
    existing.price = p.price;
    existing.priceCheckedAt = today;
    existing.observedPrice = observedPrice;
    // A tiered row with no notes is unreviewable — nobody can check why it was
    // filed where it was. The price observation IS that reasoning, so use it
    // rather than leaving the validator's warning to be silenced by hand later.
    if (!existing.notes) existing.notes = observedPrice.what;
  } else {
    paidNew++;
    paid.platforms[host] = {
      tier: p.tier, price: p.price, priceCheckedAt: today,
      notes: p.what || null, observedSites: [], placements: [], totalUrls: 0,
      observedPrice,
    };
  }
}
paid.updatedAt = new Date().toISOString();

const droppedReport = {
  version: 1,
  generatedAt: new Date().toISOString(),
  note: 'Rows this merge did NOT write into submission-targets.json, in full, with the reason. '
    + 'A drop is bookkeeping, not a verdict on the domain: `unverified` in particular says the '
    + 'probe established no route, which a WAF block, a timeout and a genuine absence of any '
    + 'form all produce identically. Re-probe from here rather than treating the absence as fact.',
  droppedBy: { dead: dropped.filter((d) => d.status === 'dead').length, unverified: dropped.filter((d) => d.status === 'unverified').length },
  dropped,
  statusDowngrades: downgraded,
};
if (args.droppedOut) fs.writeFileSync(args.droppedOut, JSON.stringify(droppedReport, null, 2) + '\n');

/** Print every dropped row and every downgrade. Counts alone are unreviewable. */
function reportDroppedAndDowngraded() {
  if (dropped.length) {
    console.log(`\ndropped ${dropped.length} row(s) — listed in full, nothing is thrown away silently:`);
    for (const d of dropped) {
      const http = d.evidence?.httpStatus ?? '—';
      console.log(`  · [${d.status}] ${d.domain}  http=${http}  route=${d.route || '—'}  source=${d.sourceList || '—'}`);
      if (d.evidence?.what) console.log(`      evidence: ${String(d.evidence.what).slice(0, 160)}`);
    }
    if (dropped.some((d) => d.status === 'unverified')) {
      console.log('  ⓘ unverified 说的是「这次探测没能建立路由」，不是「这个站没有提交入口」——'
        + '403/WAF、超时和真的没有表单在这里长得一模一样。重新探测过再下结论。');
    }
    if (!args.droppedOut) console.log('  ⓘ 加 --dropped-out <file> 可以把这些行连证据一起落盘，直接拿去重探。');
  }
  if (downgraded.length) {
    console.log(`\nstatus downgraded usable → gated for ${downgraded.length} row(s) (derived from the gate set, not observed):`);
    for (const d of downgraded) console.log(`  · ${d.domain}  because: ${d.because.join(', ')}`);
  }
}

if (args.dryRun) {
  console.log(JSON.stringify({
    thisRunKept: kept.length,
    libraryTotalAfterMerge: allTargets.length,
    libraryTotalBefore: existingTargets.length,
    droppedBy: droppedReport.droppedBy,
    dropped,
    statusDowngrades: downgraded,
    resolvedApplied, pricedApplied, paidNew, paidUpdated,
  }, null, 2));
} else {
  fs.writeFileSync(join(DATA, 'submission-targets.json'), JSON.stringify(out, null, 2) + '\n');
  fs.writeFileSync(paidFile, JSON.stringify(paid, null, 2) + '\n');
  const byCohort = kept.reduce((m, t) => ((m[t.cohort] = (m[t.cohort] || 0) + 1), m), {});
  // Two different numbers on purpose: this run's own kept/dropped count, and the
  // library's total size after folding this run in — conflating them is exactly
  // how a 924-row library got silently written down to 4 (see the merged/allTargets
  // comment above). Always print both so a shrinking library is never invisible.
  console.log(`this run: ${kept.length} kept (dropped ${droppedReport.droppedBy.dead} dead, ${droppedReport.droppedBy.unverified} unverified)`);
  console.log(`  cohorts (this run): ${Object.entries(byCohort).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`submission-targets library: ${existingTargets.length} -> ${allTargets.length} total after merge`);
  console.log(`paid-platforms: +${paidNew} new, ${paidUpdated} updated`);
  console.log(`overlays applied: resolved ${resolvedApplied}, priced ${pricedApplied}`);
  reportDroppedAndDowngraded();
  if (args.droppedOut) console.log(`\ndropped rows written to ${args.droppedOut}`);
}
