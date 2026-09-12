#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFlags, printJson, required, showHelpIfRequested} from './opencli-core.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const TARGETS_FILE = join(HERE, '..', 'data', 'submission-targets.json');

export const STATES = ['candidate', 'qualified', 'drafted', 'filled', 'submitted', 'public', 'indexed', 'rel_verified', 'rejected'];
const EVIDENCE_REQUIRED = new Set(['submitted', 'public', 'indexed', 'rel_verified']);

export function normalizeUrl(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only http(s) URLs are supported.');
  url.hash = '';
  return url.toString();
}

function idFor(url) {
  let hash = 2166136261;
  for (const character of url) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `candidate-${(hash >>> 0).toString(16)}`;
}

async function readLedger(file) {
  try {
    const value = JSON.parse(await readFile(file, 'utf8'));
    if (!Array.isArray(value.records)) throw new Error('Ledger records must be an array.');
    return value;
  } catch (error) {
    if (error.code === 'ENOENT') return { version: 1, records: [] };
    throw error;
  }
}

async function writeLedger(file, ledger) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.tmp.${process.pid}.${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(ledger, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
}

// --- concurrency guard -------------------------------------------------
// 多个 subagent 并发对同一份 ledger.json 调用 upsert/transition 时，"整文件读出
// →内存里改→整文件写回" 会互相覆盖：后写入的进程拿着自己那份旧快照整体覆盖磁盘，
// 先写入的记录直接消失（2026-09-12 videocatch 项目丢过 6 条记录，靠证据人工重建）。
// 修复用一把基于 `open(..., 'wx')`（等价 O_EXCL）的进程间文件锁：
//   1. 写入前必须先拿到 `${file}.lock`，拿不到就退避重试；
//   2. 锁内**重新从磁盘读一遍**最新内容再改，不信任调用方手里可能已经过期的那份；
//   3. 只有真的有变化才落盘，减少无意义的 mtime 抖动；
//   4. 锁文件超过 LOCK_STALE_MS 未更新视为持锁进程已死，允许后来者抢占，避免死锁卡死。
const LOCK_RETRY_BASE_MS = 40;
const LOCK_TIMEOUT_MS = 10_000;
const LOCK_STALE_MS = 15_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireLock(file) {
  const lockFile = `${file}.lock`;
  await mkdir(dirname(lockFile), { recursive: true });
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      const handle = await open(lockFile, 'wx');
      try {
        await handle.write(`${process.pid}\n${new Date().toISOString()}\n`);
      } finally {
        await handle.close();
      }
      return lockFile;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const info = await stat(lockFile);
        if (Date.now() - info.mtimeMs > LOCK_STALE_MS) {
          // 持锁进程大概率已经崩了或被杀了：陈旧锁不清掉整个脚本会永远卡在这里。
          await rm(lockFile, { force: true });
          continue;
        }
      } catch {
        // 锁在我们 stat 之前被释放了，直接重试拿锁。
        continue;
      }
      if (Date.now() > deadline) {
        throw new Error(
          `ledger.mjs: 等待 ${lockFile} 超过 ${LOCK_TIMEOUT_MS}ms 仍未拿到锁。`
          + `如果确认没有其他 ledger 进程在跑，手动删除该锁文件后重试。`,
        );
      }
      await sleep(LOCK_RETRY_BASE_MS + Math.random() * LOCK_RETRY_BASE_MS);
    }
  }
}

async function releaseLock(lockFile) {
  await rm(lockFile, { force: true });
}

// 在锁内重新读一遍磁盘上的最新内容，交给 mutate 就地改 `fresh.records`；
// 只有真的变了才写回，避免把调用方手里那份可能已经过期的快照整体覆盖上去。
async function withLedgerLock(file, mutate) {
  const lockFile = await acquireLock(file);
  try {
    const fresh = await readLedger(file);
    const before = JSON.stringify(fresh.records);
    const result = await mutate(fresh);
    if (JSON.stringify(fresh.records) !== before) {
      await writeLedger(file, fresh);
    }
    return result;
  } finally {
    await releaseLock(lockFile);
  }
}

export function transition(record, state, note) {
  if (!STATES.includes(state)) throw new Error(`Unknown state: ${state}`);
  if (EVIDENCE_REQUIRED.has(state) && (!note || !note.trim())) throw new Error(`${state} requires an evidence note.`);
  const now = new Date().toISOString();
  return {
    ...record,
    state,
    updatedAt: now,
    evidence: EVIDENCE_REQUIRED.has(state) ? { note: note.trim(), recordedAt: now } : record.evidence,
    history: [...(record.history || []), { state, note: note?.trim() || null, at: now }],
  };
}

// 子命令式脚本：`--help` 会被当成子命令吃掉（command='--help'、rest 为空），
// 所以必须在拆子命令**之前**判，否则一路走到「Unknown command」抛异常。
showHelpIfRequested(parseFlags(process.argv.slice(2)), import.meta.url);
const [command = 'list', ...rest] = process.argv.slice(2);
const flags = parseFlags(rest);
const file = flags.file || '.backlink/ledger.json';

// 只读命令才用这份缓存；init/upsert/transition 会写入，一律在锁内重新读磁盘上的
// 最新内容（见 withLedgerLock），不能信任这里可能已经过期的快照。
let ledgerCache = null;
async function getLedger() {
  if (!ledgerCache) ledgerCache = await readLedger(file);
  return ledgerCache;
}

if (command === 'init') {
  const lockFile = await acquireLock(file);
  let ledger;
  try {
    ledger = await readLedger(file);
    await writeLedger(file, ledger);
  } finally {
    await releaseLock(lockFile);
  }
  printJson({ ok: true, file, records: ledger.records.length });
} else if (command === 'upsert') {
  const url = normalizeUrl(required(flags, 'url'));
  const record = await withLedgerLock(file, (fresh) => {
    const existing = fresh.records.find((r) => r.url === url);
    if (existing) return existing;
    const now = new Date().toISOString();
    const created = {
      id: idFor(url),
      url,
      site: flags.site || new URL(url).hostname,
      state: 'candidate',
      createdAt: now,
      updatedAt: now,
      history: [{ state: 'candidate', note: 'Added to ledger.', at: now }],
    };
    fresh.records.push(created);
    return created;
  });
  printJson(record);
} else if (command === 'transition') {
  const identity = flags.id || (flags.url ? normalizeUrl(flags.url) : null);
  if (!identity) throw new Error('--id or --url is required.');
  const state = required(flags, 'state');
  const evidence = flags.evidence || '';
  const record = await withLedgerLock(file, (fresh) => {
    const index = fresh.records.findIndex((r) => r.id === identity || r.url === identity);
    if (index < 0) throw new Error('Candidate not found.');
    fresh.records[index] = transition(fresh.records[index], state, evidence);
    return fresh.records[index];
  });
  printJson(record);
} else if (command === 'list') {
  const ledger = await getLedger();
  const records = flags.state ? ledger.records.filter((record) => record.state === flags.state) : ledger.records;
  printJson({ version: ledger.version, records });
} else if (command === 'stats') {
  const ledger = await getLedger();
  const byState = {};
  for (const r of ledger.records) byState[r.state] = (byState[r.state] || 0) + 1;
  const domains = new Set(ledger.records.map((r) => new URL(r.url).hostname.replace(/^www\./, '')));
  let targetsTotal = 0;
  try {
    const targets = JSON.parse(await readFile(TARGETS_FILE, 'utf8'));
    targetsTotal = targets.targets.length;
  } catch { /* ok */ }
  printJson({
    ledgerRecords: ledger.records.length,
    uniqueDomains: domains.size,
    byState,
    skillTargetsTotal: targetsTotal,
    coverage: targetsTotal ? `${domains.size}/${targetsTotal} (${Math.round(domains.size / targetsTotal * 100)}%)` : 'n/a',
  });
} else if (command === 'remaining') {
  const ledger = await getLedger();
  const SUBMITTED_OR_LATER = new Set(['submitted', 'public', 'indexed', 'rel_verified']);
  const submittedDomains = new Set(
    ledger.records
      .filter((r) => SUBMITTED_OR_LATER.has(r.state))
      .map((r) => new URL(r.url).hostname.replace(/^www\./, ''))
  );
  const allDomains = new Set(ledger.records.map((r) => new URL(r.url).hostname.replace(/^www\./, '')));
  const targets = JSON.parse(await readFile(TARGETS_FILE, 'utf8'));
  let eligible = targets.targets.filter((t) => t.status === 'usable' || t.status === 'gated');
  if (flags['min-traffic']) {
    // 门槛**在这里对实测数字现算**，和 targets-select.mjs --min-traffic 同一条规矩。
    // 这里以前还要求 `t.traffic.verdict === 'pass'`，那是 2026-08-30 之前脚本自铸的
    // 判决字段；第一波之后新写入的行**根本没有 verdict**，于是每一个重新测过的
    // 域名都被这个条件静默筛掉——「重测过」和「不合格」在输出上完全同形。
    const min = Number(flags['min-traffic']);
    const measured = (t) => (t.traffic && typeof t.traffic.monthlyVisits === 'number' ? t.traffic.monthlyVisits : null);
    const before = eligible.length;
    const noNumber = eligible.filter((t) => measured(t) === null);
    eligible = eligible.filter((t) => (measured(t) ?? -1) >= min);
    if (noNumber.length) {
      // 没数字**不等于不达标**：可能没测过、数据源明说没数据、或采集没跑完。
      // 分辨这三者要读 traffic.evidence，脚本不替 AI 下这个判断。
      process.stderr.write(
        `min-traffic: ${before} 行里有 ${noNumber.length} 行没有实测数字，未进本批。`
        + `**没数字不是「流量不达标」的判决**——它可能是没测过、数据源正面说了没数据、`
        + `或采集没完成；读 traffic.evidence（stopReason/截图/原文）再决定。`
        + `用 targets-select.mjs --unmeasured 把它们列出来。\n`,
      );
    }
  }
  if (flags['free-only']) eligible = eligible.filter((t) => t.payment !== 'required');
  if (flags.cohort) eligible = eligible.filter((t) => t.cohort === flags.cohort);
  const remaining = eligible.filter((t) => !submittedDomains.has(t.domain));
  const inProgress = eligible.filter((t) => allDomains.has(t.domain) && !submittedDomains.has(t.domain));
  const fmt = flags.format || 'table';
  if (fmt === 'json') {
    printJson({ eligible: eligible.length, submitted: eligible.length - remaining.length, remaining: remaining.length, inProgress: inProgress.length, targets: remaining });
  } else {
    process.stdout.write(`eligible: ${eligible.length}  submitted: ${eligible.length - remaining.length}  remaining: ${remaining.length}  in-progress: ${inProgress.length}\n\n`);
    for (const t of remaining) {
      const tr = t.traffic ? (t.traffic.monthlyVisits == null ? '   n/a' : String(Math.round(t.traffic.monthlyVisits)).padStart(9)) : '  unmeas.';
      const pay = t.payment === 'none-seen' ? '' : `  [${t.payment}${t.price ? ` ${t.price}` : ''}]`;
      process.stdout.write(`${tr}  ${t.cohort.padEnd(16)} ${t.domain.padEnd(30)} ${t.route}${pay}\n`);
    }
  }
} else if (command === 'domains') {
  const ledger = await getLedger();
  // 供别的脚本（targets-select.mjs 的 --ledger）和人复用：只要域名列表，不要整条记录。
  const wanted = flags.states ? new Set(flags.states.split(',').map((s) => s.trim()).filter(Boolean)) : null;
  if (wanted) {
    for (const s of wanted) if (!STATES.includes(s)) throw new Error(`Unknown state: ${s}. Known: ${STATES.join(', ')}`);
  }
  const domains = new Set(
    ledger.records
      .filter((r) => !wanted || wanted.has(r.state))
      .map((r) => new URL(r.url).hostname.replace(/^www\./, ''))
  );
  const fmt = flags.format || 'table';
  if (fmt === 'json') printJson({ states: wanted ? [...wanted] : 'all', domains: [...domains].sort() });
  else for (const d of [...domains].sort()) process.stdout.write(`${d}\n`);
} else {
  throw new Error(`Unknown command: ${command}. Known: init, upsert, transition, list, stats, remaining, domains`);
}
