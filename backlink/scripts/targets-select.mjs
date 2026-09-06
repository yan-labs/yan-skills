#!/usr/bin/env node
/**
 * targets-select.mjs — pick one batch out of data/submission-targets.json.
 *
 * A campaign is planned per cohort, because the cohorts cost different things:
 *   open             nobody needs to be present
 *   captcha          a human has to be at the keyboard
 *   account          credentials and an identity decision, up front
 *   account-captcha  both of the above
 *   email-verify     a mailbox has to be watched while the run is going
 *   reciprocal       the owner's own site has to change — their call, not yours
 *   personal-contact real name / phone / company email — the owner's call too
 *
 * Mixing them in one run is what makes a batch stall: the open rows finish in
 * minutes and then everything waits on a person who was never told they were
 * needed. Select one cohort, run it, then select the next.
 *
 * Usage:
 *   node scripts/targets-select.mjs --cohort open
 *   node scripts/targets-select.mjs --cohort captcha --free-only --limit 50
 *   node scripts/targets-select.mjs --unattended --format urls
 *   node scripts/targets-select.mjs --stats
 *
 * Flags:
 *   --cohort <c>     repeatable. open | captcha | account | account-captcha |
 *                    email-verify | reciprocal | personal-contact |
 *                    manual-review | unknown
 *   --unattended     shorthand for the cohorts that need nobody present
 *   --kind <k>       repeatable, e.g. ai-directory, web-directory
 *   --free-only      drop payment=required (keeps `optional`: a free path exists)
 *   --paid-ok        keep payment=required too (default drops nothing else)
 *   --max-age <days> only rows probed within N days (default: no limit; the
 *                    validator warns past 180 because this genre decays fast)
 *   --limit <n>
 *   --format table|urls|json   default table
 *   --min-traffic <n>  only rows whose MEASURED number is >= n monthly visits,
 *                    computed here from `traffic.monthlyVisits` at query time —
 *                    there is no stored verdict field to trust. Rows with no
 *                    number (never measured, or the source reported no data /
 *                    the capture did not complete) are NOT in this batch and are
 *                    NOT "unqualified" either: they are listed separately on
 *                    stderr as 未测/无数字, and the judgment about what an
 *                    absent number means belongs to whoever reads the evidence
 *                    (traffic.evidence points at it). Use --unmeasured to queue
 *                    them for screening or review.
 *   --unmeasured     invert: only rows with no measured number yet — no traffic
 *                    record at all, or a record whose monthlyVisits is null
 *                    (i.e. the queue for the next screening run or for an AI
 *                    read of the evidence)
 *   --file <path>    read targets from this JSON instead of the Skill's
 *                    data/submission-targets.json (tests, dry experiments)
 *   --ledger <path>  exclude domains already tracked in a project ledger file
 *                    (any state >= submitted, plus rejected — see
 *                    --include-rejected). The ledger is the project's own
 *                    record of what it has already sent — the Skill database is
 *                    shared, and "submitted" is always project-scoped.
 *                    Defaults to `.backlink/ledger.json` relative to the
 *                    current working directory, so running this from inside a
 *                    project picks it up with no flag at all. A missing file
 *                    only warns (nothing submitted yet, or the wrong cwd) —
 *                    it never fails the selection.
 *   --include-rejected  also keep domains the ledger marked `rejected`
 *                    (login-required, paid-only, dead, ...). Default: skip
 *                    them too, same as submitted-or-later. Only pass this once
 *                    you have re-read the record's notes and confirmed
 *                    whatever made it rejected no longer applies.
 *   --stats          print the cohort × payment matrix and exit. When a ledger
 *                    is present (default path or --ledger), also prints how
 *                    many rows it excluded and, for rejected ones, a
 *                    reason-by-reason count.
 */

import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COHORTS, UNATTENDED } from './lib-cohort.mjs';
import { helpGuard } from './opencli-core.mjs';
helpGuard(import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, '..', 'data', 'submission-targets.json');
const DEFAULT_LEDGER = join(process.cwd(), '.backlink', 'ledger.json');

const a = { cohort: [], kind: [], freeOnly: false, paidOk: false, maxAge: null, limit: Infinity, format: 'table', stats: false, unattended: false, minTraffic: null, unmeasured: false, ledger: DEFAULT_LEDGER, includeRejected: false, file: FILE };
for (let i = 2; i < process.argv.length; i++) {
  const f = process.argv[i];
  const v = () => process.argv[++i];
  if (f === '--cohort') a.cohort.push(v());
  else if (f === '--kind') a.kind.push(v());
  else if (f === '--free-only') a.freeOnly = true;
  else if (f === '--paid-ok') a.paidOk = true;
  else if (f === '--unattended') a.unattended = true;
  else if (f === '--max-age') a.maxAge = Number(v());
  else if (f === '--limit') a.limit = Number(v());
  else if (f === '--format') a.format = v();
  else if (f === '--min-traffic') a.minTraffic = Number(v());
  else if (f === '--unmeasured') a.unmeasured = true;
  else if (f === '--ledger') a.ledger = v();
  else if (f === '--include-rejected') a.includeRejected = true;
  else if (f === '--file') a.file = v();
  else if (f === '--stats') a.stats = true;
  else { process.stderr.write(`unknown flag ${f}\n`); process.exit(2); }
}
for (const c of a.cohort) {
  if (!COHORTS.includes(c)) { process.stderr.write(`unknown cohort "${c}". Known: ${COHORTS.join(', ')}\n`); process.exit(2); }
}

const all = JSON.parse(fs.readFileSync(a.file, 'utf8')).targets;

/** 有没有实测数字。数字缺失（无 traffic 记录，或记录里 monthlyVisits 为 null）
 *  一律算「未测/无数字」——它可能是没测过、数据源明说没有数据、或采集没完成，
 *  分辨这三者要看 traffic.evidence，脚本不替 AI 下这个判断。 */
const measuredVisits = (t) => (t.traffic && typeof t.traffic.monthlyVisits === 'number' ? t.traffic.monthlyVisits : null);

const SUBMITTED_OR_LATER = new Set(['submitted', 'public', 'indexed', 'rel_verified']);
const domainOfUrl = (url) => new URL(url).hostname.replace(/^www\./, '');

/** 记录最后一次进入 rejected 状态时写的 note，没有就退化成一个占位原因，
 *  好让 --stats 的按 reason 计数不会因为缺 note 而整段消失。 */
const rejectedReasonOf = (record) => {
  const entry = [...(record.history || [])].reverse().find((h) => h.state === 'rejected' && h.note);
  return entry ? entry.note : (record.evidence?.note || 'unspecified');
};

/**
 * 项目台账排除层：读一次 `<project>/.backlink/ledger.json`（或 --ledger 指的那份），
 * 把 submitted 及之后状态、以及（默认）rejected 的域名收集成 Set/Map。
 * 文件不存在只警告，不报错——项目可能还没发过任何一条。
 */
function loadLedgerExclusions(path, includeRejected) {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`ledger: no file at ${path} — nothing excluded (not submitted anything yet, or wrong cwd)\n`);
      return null;
    }
    throw err;
  }
  const records = data.records || [];
  const submittedDomains = new Set(records.filter((r) => SUBMITTED_OR_LATER.has(r.state)).map((r) => domainOfUrl(r.url)));
  const rejectedByDomain = new Map();
  if (!includeRejected) {
    for (const r of records) {
      if (r.state !== 'rejected') continue;
      const domain = domainOfUrl(r.url);
      if (!rejectedByDomain.has(domain)) rejectedByDomain.set(domain, rejectedReasonOf(r));
    }
  }
  return { submittedDomains, rejectedByDomain };
}

/** 按台账过滤一批 target，返回过滤后的数组，并把排除计数（submitted/rejected
 *  以及 rejected 按 reason 的计数）附在返回值上，供 --stats 复用。 */
function excludeByLedger(targets, exclusions) {
  if (!exclusions) return { targets, submittedExcluded: 0, rejectedExcluded: 0, reasonCounts: {} };
  let submittedExcluded = 0;
  let rejectedExcluded = 0;
  const reasonCounts = {};
  const kept = targets.filter((t) => {
    if (exclusions.submittedDomains.has(t.domain)) { submittedExcluded++; return false; }
    if (exclusions.rejectedByDomain.has(t.domain)) {
      rejectedExcluded++;
      const reason = exclusions.rejectedByDomain.get(t.domain);
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      return false;
    }
    return true;
  });
  return { targets: kept, submittedExcluded, rejectedExcluded, reasonCounts };
}

const ledgerExclusions = loadLedgerExclusions(a.ledger, a.includeRejected);

if (a.stats) {
  const rows = {};
  for (const t of all) {
    rows[t.cohort] ??= { open: 0, optional: 0, required: 0, unknown: 0, total: 0, tNum: 0, tNoNum: 0, tNone: 0 };
    const k = t.payment === 'none-seen' ? 'open' : t.payment;
    rows[t.cohort][k] = (rows[t.cohort][k] || 0) + 1;
    rows[t.cohort].total++;
    if (!t.traffic) rows[t.cohort].tNone++;
    else if (measuredVisits(t) !== null) rows[t.cohort].tNum++;
    else rows[t.cohort].tNoNum++;
  }
  process.stdout.write(`${all.length} targets. Payment column "open" = no cost seen on the page.\n`);
  process.stdout.write(`Traffic columns are measurement states, not verdicts: "no-number" rows have a\n`);
  process.stdout.write(`measurement record but no figure (source reported no data, or the capture did\n`);
  process.stdout.write(`not complete) — read traffic.evidence before treating one as low-traffic.\n\n`);
  process.stdout.write(`cohort            total  no-cost  free+paid  paid-only  unknown  has-number  no-number  unmeasured\n`);
  for (const [c, r] of Object.entries(rows).sort((x, y) => y[1].total - x[1].total)) {
    process.stdout.write(`${c.padEnd(17)}${String(r.total).padStart(5)}${String(r.open).padStart(9)}${String(r.optional).padStart(11)}${String(r.required).padStart(11)}${String(r.unknown).padStart(9)}${String(r.tNum).padStart(12)}${String(r.tNoNum).padStart(11)}${String(r.tNone).padStart(12)}\n`);
  }
  process.stdout.write(`\nNone of these rows has a published link yet — they are routes, not placements.\n`);
  if (ledgerExclusions) {
    const { submittedExcluded, rejectedExcluded, reasonCounts } = excludeByLedger(all, ledgerExclusions);
    process.stdout.write(`\n已按台账排除 ${submittedExcluded + rejectedExcluded} 个（其中 submitted ${submittedExcluded}、rejected ${rejectedExcluded}）\n`);
    if (rejectedExcluded) {
      process.stdout.write(`rejected 排除原因计数：\n`);
      for (const [reason, n] of Object.entries(reasonCounts).sort((x, y) => y[1] - x[1])) {
        process.stdout.write(`  ${String(n).padStart(4)}  ${reason}\n`);
      }
    }
  }
  process.exit(0);
}

const wanted = new Set(a.unattended ? [...UNATTENDED] : a.cohort);
let out = all.filter((t) => t.status === 'usable' || t.status === 'gated');
if (wanted.size) out = out.filter((t) => wanted.has(t.cohort));
if (a.kind.length) out = out.filter((t) => a.kind.includes(t.kind));
if (a.freeOnly && !a.paidOk) out = out.filter((t) => t.payment !== 'required');
if (a.unmeasured) out = out.filter((t) => measuredVisits(t) === null);
else if (a.minTraffic != null) {
  // 门槛在这里对实测数字现算——表里没有判决字段可抄。
  // 数字缺失的一律不进批次，但**绝不归入不合格**：没测过、数据源明说没数据、
  // 采集没完成这三种情况全都长成 null，分辨它们要看 traffic.evidence，
  // 那是 AI/人的判断，不是这个 filter 的。这里只把它们单列出来。
  const noNumber = out.filter((t) => t.traffic && measuredVisits(t) === null);
  const neverMeasured = out.filter((t) => !t.traffic);
  out = out.filter((t) => {
    const v = measuredVisits(t);
    return v !== null && v >= a.minTraffic;
  });
  if (noNumber.length || neverMeasured.length) {
    process.stderr.write(
      `min-traffic: excluded ${neverMeasured.length} never-measured and ${noNumber.length} measured-but-no-number row(s). `
      + `Absence of a number is NOT a low-traffic verdict — it can be an unfinished capture or a source empty state; `
      + `read traffic.evidence (stopReason/screenshot/raw) before writing any of them off. List them with --unmeasured.\n`,
    );
  }
}
if (a.maxAge != null) {
  const cutoff = Date.now() - a.maxAge * 86_400_000;
  out = out.filter((t) => Date.parse(t.lastProbedAt) >= cutoff);
}
if (ledgerExclusions) {
  const { targets, submittedExcluded, rejectedExcluded } = excludeByLedger(out, ledgerExclusions);
  out = targets;
  process.stderr.write(`已按台账排除 ${submittedExcluded + rejectedExcluded} 个（其中 submitted ${submittedExcluded}、rejected ${rejectedExcluded}）\n`);
}
out = out.slice(0, a.limit);

if (a.format === 'json') process.stdout.write(JSON.stringify(out, null, 2) + '\n');
else if (a.format === 'urls') process.stdout.write(out.map((t) => t.route).join('\n') + '\n');
else {
  for (const t of out) {
    const pay = t.payment === 'none-seen' ? '' : `  [${t.payment}${t.price ? ` ${t.price}` : ''}]`;
    const tr = t.traffic ? (t.traffic.monthlyVisits == null ? '   n/a' : String(Math.round(t.traffic.monthlyVisits)).padStart(9)) : '  unmeas.';
    process.stdout.write(`${tr}  ${t.cohort.padEnd(16)} ${t.kind.padEnd(19)} ${t.route}${pay}\n`);
  }
}
process.stderr.write(`${out.length} target(s). These are submission ROUTES; none is a placement until an anchor is observed.\n`);
