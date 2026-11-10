// 账本:每个 run 到终态时追加一行 JSON 到 ~/.agent-fleet/ledger.jsonl(单文件、只追加、不改旧 run 记录),
// 供 `fleet-go score` 之类的命令重算各执行者的打分,不必再人工翻报告。
//
// 只放元数据:任务名、执行者、结果、时长、失败分类、配对关系、复核尾注数字。
// 不放任务正文、结果正文、凭据、用户标识。写账本失败一律吞掉,不能影响任务本身的结果。
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { timelineFile } from './timeline.mjs';

export const LEDGER_VERSION = 1;
const TERMINAL = new Set(['done', 'failed', 'stopped']);
// 测试用的 mock 与 run-many 批量父记录不是真实执行者,不进账本。
const NOISE_MODELS = new Set(['mock', 'run-many']);

/** 账本路径。显式给了 AGENT_FLEET_LEDGER 就用它;测试挪走了 runs 目录而没给账本路径时不写,免得污染真账本。 */
export function ledgerPath() {
  if (process.env.AGENT_FLEET_LEDGER) return process.env.AGENT_FLEET_LEDGER;
  return process.env.AGENT_FLEET_RUNS_DIR ? null : join(homedir(), '.agent-fleet', 'ledger.jsonl');
}

export function readLedger(path = ledgerPath()) {
  if (!path || !existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* 跳过坏行 */ }
  }
  return rows;
}

/** 复核方在回复/报告里写的机读尾注:`LEDGER: blockers=<n> verdict=<pass|fail|partial>`,多行取最后一条。 */
export function parseTrailer(text) {
  const re = /^[ \t]*LEDGER:[ \t]*blockers=(\d+)[ \t]+verdict=(pass|fail|partial)[ \t]*$/gim;
  const s = String(text ?? '');
  let last = null;
  for (let m = re.exec(s); m; m = re.exec(s)) last = m;
  return last ? { blockers: Number(last[1]), verdict: last[2].toLowerCase() } : null;
}

export function executorOf(model = '', resolved = '') {
  const m = `${model} ${resolved}`;
  if (/terra/.test(m)) return 'terra';
  if (/luna/.test(m)) return 'luna';
  if (/sol/.test(m)) return 'sol';
  if (/grok/.test(m)) return 'grok';
  if (/gemini|kollab-gateway-(copy|bulk)|^kollab-gateway\b/.test(m)) return 'gemini';
  const claude = /claude-(haiku|sonnet|opus|fable)/.exec(m);
  if (claude) return claude[1];
  if (/jev/.test(m)) return 'jev';
  return String(model) || 'unknown';
}

const QUOTA = /\b402\b|credit balance|credits? remaining|insufficient[_ ]quota|credit_balance_exhausted|usage limits?|额度|余额不足/i;
const CAPACITY = /at capacity|\b429\b|rate.?limit|concurrent request|overloaded|too many requests|容量/i;
const AUTH = /unrecognized_model|\b401\b|\b403\b|unauthori[sz]ed|invalid[_ ]api[_ ]key|authentication|not logged in|login (?:required|expired)|登录失效|鉴权|failed to refresh|request timed out|not scoped to a workspace|unsupported_role|ECONN|ETIMEDOUT|ENOTFOUND|fetch failed/i;
const KILLED = /退出 SIG(?:TERM|KILL|INT)|被外部信号/;
const STRICT_QUOTA = /status 402|Payment Required|usage balance exhausted/i;
const CAPABILITY_NOTE = /控制 token|结果为空|max-turns|零提交|复述 Skill/;

/** 失败原因分类:能从记录里自动判的自动判,判不了写 unknown;成功与部分完成不分类。 */
export function classifyFailure(rec) {
  const verdict = rec.verdict ?? rec.brief?.verdict;
  if (verdict === 'ok' || verdict === 'partial') return null;
  const report = rec.brief?.failureReport ?? {};
  const text = [rec.error, rec.stopReason, rec.brief?.verdictNote, report.error, String(report.stderr ?? '').slice(-1500), String(rec.stderr ?? '').slice(-1500)]
    .filter(Boolean).join('\n');
  if (rec.abnormalExit || /死进程|监督进程与执行进程均已不存在/.test(text)) return 'zombie';
  if (QUOTA.test(text)) return 'quota';
  if (CAPACITY.test(text)) return 'capacity';
  if (AUTH.test(text)) return 'auth-gateway';
  // Grok 等执行器只给「退出码 1」,402 在日志尾部。
  if (STRICT_QUOTA.test(safeRead(rec.logPath, 6000))) return 'quota';
  if (rec.status === 'stopped' || verdict === 'stopped' || KILLED.test(text)) return 'stopped';
  if (verdict === 'suspect' || CAPABILITY_NOTE.test(text)) return 'capability';
  return 'unknown';
}

/** 报告「结论」首句的口径:完成 / 部分(含未完成、局部、阻塞) / 失败;读不出返回 null。 */
export function conclusionOutcome(text) {
  const s = String(text ?? '').replace(/^[\s*_`>#-]+/, '');
  if (/^(?:仍为?)?(?:部分完成|未完成|仍未|局部|范围缩小|阻塞|受阻|未达成)/.test(s)) return 'partial';
  if (/^失败/.test(s)) return 'failed';
  if (/^(?:已)?完成/.test(s)) return 'complete';
  return null;
}

const safeRead = (path, max = 1_000_000) => {
  try { return path && existsSync(path) ? readFileSync(path, 'utf8').slice(-max) : ''; } catch { return ''; }
};

const REVIEW_TOKEN = /^(?:re)?review\d*$|^recheck\d*$/i;
/** 由复核单名字推测被复核的任务名:去掉 review/recheck 词与末尾的轮次(r2、r3)。 */
export function guessMakerName(name) {
  const tokens = String(name).split(/[-_.]/);
  const i = tokens.findIndex(t => REVIEW_TOKEN.test(t));
  if (i < 0) return null;
  const kept = tokens.filter((_, j) => j !== i);
  while (kept.length > 1 && /^r\d+$/i.test(kept[kept.length - 1])) kept.pop();
  return kept.length ? kept.join('-') : null;
}

const tilde = p => (p && p.startsWith(homedir() + '/') ? '~' + p.slice(homedir().length) : p ?? null);
const startMs = row => Date.parse(row.startedAt) || 0;

/** 内存索引:去重、找同名上一个 run、给复核单找被复核任务。回填与实时写入共用。 */
export class LedgerIndex {
  constructor(rows = []) {
    this.byId = new Map();
    this.byName = new Map();
    rows.forEach(row => this.add(row));
  }
  has(runId) { return this.byId.has(runId); }
  add(row) {
    this.byId.set(row.runId, row);
    const list = this.byName.get(row.name) ?? [];
    list.push(row);
    this.byName.set(row.name, list);
  }
  /** 同名且更早开始的最近一个 run(relaunch/续跑的上一个)。 */
  prevOf(row) {
    return (this.byName.get(row.name) ?? []).filter(r => r.runId !== row.runId && startMs(r) < startMs(row))
      .sort((a, b) => startMs(b) - startMs(a))[0] ?? null;
  }
  /** 从同名前缀推测被复核任务:先精确同名,再唯一的「候选名-」前缀;只认更早开始、且自己不是复核的任务。 */
  makerNameFor(row) {
    const guess = guessMakerName(row.name);
    if (!guess) return null;
    const earlier = name => (this.byName.get(name) ?? []).some(r => r.type !== 'review' && startMs(r) < startMs(row));
    if (earlier(guess)) return guess;
    const prefixed = [...this.byName.keys()].filter(n => n.startsWith(guess + '-') && earlier(n));
    return prefixed.length === 1 ? prefixed[0] : null;
  }
}

function metaOf(rec) {
  try {
    const path = rec.briefPath?.replace(/\.md$/, '.json');
    return path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  } catch { return {}; }
}

/** 由一条已到终态的 run 记录生成一行账本。useReport=false 时不读共享的 REPORT 文件(它可能已被后来的 run 改写)。 */
export function buildRow(rec, index, { useReport = true, backfilled = false } = {}) {
  const meta = metaOf(rec);
  const brief = rec.brief && !Array.isArray(rec.brief) ? rec.brief : {};
  const verdict = rec.verdict ?? brief.verdict ?? null;
  const name = rec.name ?? (rec.briefPath ? rec.briefPath.split('/').pop().replace(/(\.brief)?\.md$/, '') : rec.runId);
  const result = safeRead(rec.resultPath, 200_000);
  const report = useReport ? safeRead(rec.reportPath) : '';
  const section = /^##\s*结论[ \t]*\n+([^\n]{0,200})/m.exec(report);
  const concluded = conclusionOutcome(rec.reportConclusion ?? section?.[1]);
  const yieldText = safeRead(rec.logPath?.replace(/\.log$/, '.yield'));
  let yielded; try { yielded = JSON.parse(yieldText); } catch {}
  const yieldKind = typeof yielded === 'string' ? yielded : yielded?.type ?? yielded?.kind;
  const outcome = yieldKind === 'blocked' ? 'partial' : yieldKind === 'park' || yieldKind === 'handoff' ? 'partial'
    : rec.status === 'stopped' || verdict === 'stopped' ? 'stopped'
    : concluded ?? (verdict === 'ok' ? 'complete' : verdict === 'partial' ? 'partial' : 'failed');
  const trailer = parseTrailer(result) ?? parseTrailer(report);
  const isReview = meta.type === 'review' || (!meta.type && Boolean(rec.review || meta.review || meta.for || guessMakerName(name)));
  const executor = executorOf(rec.model, brief.resolvedModel);
  const row = {
    v: LEDGER_VERSION, runId: rec.runId, name,
    date: localDate(rec.startedAt), startedAt: rec.startedAt, finishedAt: rec.finishedAt ?? null,
    durationSec: rec.finishedAt ? Math.round((Date.parse(rec.finishedAt) - Date.parse(rec.startedAt)) / 1000) : null,
    executor, model: brief.resolvedModel ?? rec.model, route: rec.model,
    effort: rec.tier ?? brief.effort ?? (rec.max || meta.max ? 'max' : rec.xhigh || meta.xhigh ? 'xhigh' : rec.high || meta.high ? 'high' : rec.low || meta.low ? 'low' : executor === 'gemini' ? 'xhigh' : null),
    level: meta.level ?? null,
    type: meta.type ?? (isReview ? 'review' : /orchestrat/i.test(name) ? 'orchestrate' : 'work'),
    status: rec.status, verdict, outcome, failure: classifyFailure(rec),
    continues: rec.continueCount ?? 0,
    prevRunId: null, prevExecutor: null, prevFailure: null,
    reviewOf: null, pairSource: null,
    blockers: trailer?.blockers ?? null, reviewVerdict: trailer?.verdict ?? null,
    report: tilde(rec.reportPath),
    tokens: rec.usage?.total?.totalTokens ?? null, costUsd: rec.totalCostUsd ?? brief.totalCostUsd ?? null,
    backfilled,
    ...timelineFile(rec.logPath),
  };
  const prev = (rec.resumedFrom && index.byId.get(rec.resumedFrom)) || index.prevOf(row);
  if (prev) Object.assign(row, { prevRunId: prev.runId, prevExecutor: prev.executor, prevFailure: prev.failure });
  if (row.type === 'review') {
    const maker = meta.for ?? index.makerNameFor(row);
    if (maker) Object.assign(row, { reviewOf: maker, pairSource: meta.for ? 'explicit' : 'inferred' });
  }
  return row;
}

function localDate(iso) {
  const d = new Date(iso);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function isLedgerRun(rec) {
  return Boolean(rec?.detach && TERMINAL.has(rec.status) && !NOISE_MODELS.has(rec.model));
}

export function appendRows(rows, path = ledgerPath()) {
  if (!path || !rows.length) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, rows.map(r => JSON.stringify(r)).join('\n') + '\n');
}

/** 实时写入口:run 到终态时调用。已有同 runId 的行就不再写;任何失败都吞掉。 */
export function recordRun(rec) {
  try {
    const path = ledgerPath();
    if (!path || !isLedgerRun(rec)) return;
    const index = new LedgerIndex(readLedger(path));
    if (index.has(rec.runId)) return;
    appendRows([buildRow(rec, index)], path);
  } catch { /* 账本写不了不影响任务本身 */ }
}

/**
 * 回填:按开始时间顺序处理所有终态记录,窗口内且账本里还没有的追加成 backfilled:true 的行。
 * 窗口外的记录只进内存索引(用来找同名上一个 run),不写盘。重复运行不会产生重复行。
 */
export function backfill(records, { days = 14, path = ledgerPath(), now = Date.now(), dryRun = false } = {}) {
  const existing = readLedger(path);
  const index = new LedgerIndex(existing);
  const terminal = records.filter(isLedgerRun).sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const lastByReport = new Map(terminal.filter(r => r.reportPath).map(r => [r.reportPath, r.runId]));
  const cutoff = now - days * 86400_000;
  const fresh = [];
  for (const rec of terminal) {
    if (index.has(rec.runId)) continue;
    const row = buildRow(rec, index, { useReport: lastByReport.get(rec.reportPath) === rec.runId, backfilled: true });
    index.add(row);
    if (Date.parse(rec.startedAt) >= cutoff) fresh.push(row);
  }
  if (!dryRun) appendRows(fresh, path);
  return { scanned: terminal.length, existing: existing.length, added: fresh.length };
}
