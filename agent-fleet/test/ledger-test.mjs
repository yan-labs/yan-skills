#!/usr/bin/env node
// 账本:失败分类、复核尾注、配对、去重、回填幂等、写入失败不影响任务、score 与 fleet-go new 的新参数。
// 全部在临时目录里跑,不碰真实账本。
import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { createAsserter } from './assert-helper.mjs';

const root = resolve(import.meta.dirname, '..');
const scratch = mkdtempSync(join(tmpdir(), 'fleet-ledger-'));
const runs = join(scratch, 'runs');
const ledger = join(scratch, 'ledger.jsonl');
mkdirSync(runs, { recursive: true });
process.env.AGENT_FLEET_RUNS_DIR = runs;
process.env.AGENT_FLEET_LEDGER = ledger;

const { writeState, listDetached } = await import('../src/detach.mjs');
const L = await import('../src/ledger.mjs');
const { assert, finish } = createAsserter('账本');
const rows = () => L.readLedger(ledger);
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
let n = 0;
const rec = (patch = {}) => {
  const runId = `r${++n}-${Math.random().toString(16).slice(2, 6)}`;
  return {
    detach: true, runId, status: 'done', pid: 1, childPid: null, startedAt: iso(-3600_000), heartbeatAt: iso(-1000), finishedAt: iso(-1000),
    exitCode: 0, verdict: 'ok', cwd: scratch, model: 'gpt-6.1-terra', name: `task-${n}`, briefPath: null, reportPath: join(scratch, `${runId}.md`),
    resultPath: join(scratch, `${runId}.result.md`), logPath: join(scratch, `${runId}.log`), ...patch,
  };
};
const failed = (error, extra = {}) => rec({ status: 'failed', verdict: 'fail', brief: { failureReport: { error } }, ...extra });

try {
  // 0. 账本路径:挪走 runs 目录且没给账本路径时不写,默认落在家目录
  const keepLedger = process.env.AGENT_FLEET_LEDGER;
  delete process.env.AGENT_FLEET_LEDGER;
  assert(L.ledgerPath() === null, '改写了 runs 目录又没给账本路径时不写账本');
  delete process.env.AGENT_FLEET_RUNS_DIR;
  assert(L.ledgerPath().endsWith('/.agent-fleet/ledger.jsonl'), '默认账本在 ~/.agent-fleet/ledger.jsonl');
  process.env.AGENT_FLEET_RUNS_DIR = runs;
  process.env.AGENT_FLEET_LEDGER = keepLedger;

  // 1. 复核尾注
  assert(JSON.stringify(L.parseTrailer('x\nLEDGER: blockers=2 verdict=fail\n')) === '{"blockers":2,"verdict":"fail"}', '尾注解析');
  assert(L.parseTrailer('LEDGER: blockers=0 verdict=pass\nLEDGER: blockers=3 verdict=partial').blockers === 3, '多条取最后一条');
  assert(L.parseTrailer('`LEDGER: blockers=1 verdict=pass`') === null, '带反引号不算');
  assert(L.parseTrailer('LEDGER: blockers=<n> verdict=<pass|fail|partial>') === null, '模板占位不算');
  assert(L.parseTrailer('') === null && L.parseTrailer(undefined) === null, '空文本得 null');

  // 2. 失败分类
  const kind = r => L.classifyFailure(r);
  assert(kind(rec()) === null, 'ok 不分类');
  assert(kind(rec({ verdict: 'partial', status: 'failed' })) === null, 'partial 不分类');
  assert(kind(failed('API Error: 402 Kollab workspace has credits remaining, but not enough')) === 'quota', '402 → quota');
  assert(kind(failed('Claude Code returned an error result: API Error: 400 You have reached your specified API usage limits.')) === 'quota', 'Claude 月度额度 → quota');
  assert(kind(failed('Selected model is at capacity. Please try a different model.')) === 'capacity', 'Codex 容量 → capacity');
  assert(kind(failed('API Error: Request rejected (429) · Kollab workspace concurrent request limit reached')) === 'capacity', '429 并发 → capacity');
  assert(kind(failed('API Error: 429 · credit_balance_exhausted')) === 'quota', '额度优先于 429');
  assert(kind(failed('Claude Code returned an error result: API Error: 400 This API key is not scoped to a workspace')) === 'auth-gateway', '工作区未配置 → auth-gateway');
  assert(kind(rec({ status: 'stopped', verdict: 'stopped', stopReason: '死进程记录，主线程清理' })) === 'zombie', '死进程 → zombie');
  assert(kind(rec({ status: 'stopped', verdict: 'stopped', brief: { failureReport: { error: '执行进程退出 SIGTERM' } } })) === 'stopped', 'SIGTERM 停止 → stopped');
  assert(kind(failed('执行进程退出 SIGTERM')) === 'stopped', 'failed 但被信号杀掉 → stopped');
  assert(kind(rec({ status: 'stopped', verdict: 'stopped', brief: { failureReport: { error: 'Credit balance is too low' } } })) === 'quota', '额度耗尽后被停仍算 quota');
  assert(kind(rec({ status: 'failed', verdict: 'suspect' })) === 'capability', 'suspect → capability');
  assert(kind(failed('Codex 退出码 1')) === 'unknown', '判不了 → unknown');
  const grokLog = join(scratch, 'grok.log');
  writeFileSync(grokLog, '..."message": "API error (status 402 Payment Required): Grok Build usage balance exhausted"...');
  assert(kind(failed('Grok 退出码 1', { logPath: grokLog })) === 'quota', '日志尾部的 402 → quota');

  // 3. 结论口径、执行者、复核单名字
  assert(L.conclusionOutcome('部分完成：xxx') === 'partial' && L.conclusionOutcome('**仍为部分完成**') === 'partial', '部分完成口径');
  assert(L.conclusionOutcome('完成本单授权内工作') === 'complete' && L.conclusionOutcome('失败：xx') === 'failed' && L.conclusionOutcome('本地盘点') === null, '完成/失败/读不出');
  assert([['gpt-6.1-sol'], ['openai-gpt-terra'], ['gpt-6-luna'], ['grok-cli:grok-4.7'], ['kollab-gateway-copy', 'gemini-4-argon'], ['claude-opus'], ['kollab-gateway-gpt-sol', 'gpt-6-sol']]
    .map(a => L.executorOf(...a)).join() === 'sol,terra,luna,grok,gemini,opus,sol', '执行者归并');
  assert(L.guessMakerName('bsm-r2b-review') === 'bsm-r2b' && L.guessMakerName('editor-parity-review-r3') === 'editor-parity'
    && L.guessMakerName('history-test-fixture-review3-1104') === 'history-test-fixture-1104' && L.guessMakerName('plain-task') === null, '复核单名字推测');

  // 4. 实时写入:running 不写;终态写一行;重复写不重复;mock 不写
  const a = rec({ name: 'alpha', model: 'gpt-6.1-sol', startedAt: iso(-7200_000), finishedAt: iso(-7100_000) });
  writeState({ ...a, status: 'running', verdict: null, finishedAt: null });
  assert(rows().length === 0, 'running 状态不写账本');
  writeState(a);
  writeState(a);
  assert(rows().length === 1 && rows()[0].executor === 'sol' && rows()[0].durationSec === 100 && rows()[0].backfilled === false, '终态写一行且重复写不重复');
  writeState(rec({ model: 'mock' }));
  writeState(rec({ model: 'run-many' }));
  assert(rows().length === 1, 'mock / run-many 不进账本');
  assert(['cwd', 'briefPath', 'resultPath', 'logPath', 'stderr', 'output', 'brief', 'reportConclusion'].every(k => !(k in rows()[0])), '账本只放元数据:不含工作目录、日志/结果路径、正文、报告结论原文');

  // 5. 同名上一个 run(relaunch)与换手
  const b = rec({ name: 'alpha', model: 'gpt-6.1-terra', startedAt: iso(-3000_000) });
  writeState(failed('Selected model is at capacity.', { name: 'alpha', model: 'gpt-6.1-sol', startedAt: iso(-5000_000), finishedAt: iso(-4900_000) }));
  writeState(b);
  const second = rows().find(r => r.runId === b.runId);
  assert(second.prevRunId === rows().find(r => r.failure === 'capacity').runId && second.prevExecutor === 'sol' && second.prevFailure === 'capacity', 'relaunch 对应关系:上一个 run、执行者、失败原因');

  // 6. 复核单:--for 显式、同名前缀推测、尾注读取
  const briefDir = join(scratch, 'briefs');
  mkdirSync(briefDir);
  const briefPath = join(briefDir, 'alpha-check.brief.md');
  writeFileSync(briefPath, 'x');
  writeFileSync(briefPath.replace(/\.md$/, '.json'), JSON.stringify({ for: 'alpha', level: 'L3', type: 'review' }));
  const rv = rec({ name: 'alpha-check', model: 'kollab-gateway-copy', briefPath, startedAt: iso(-1000_000), brief: { resolvedModel: 'gemini-4-argon' } });
  writeFileSync(rv.resultPath, '结论…\nLEDGER: blockers=2 verdict=fail\n');
  writeState(rv);
  const rrow = rows().find(r => r.runId === rv.runId);
  assert(rrow.type === 'review' && rrow.reviewOf === 'alpha' && rrow.pairSource === 'explicit' && rrow.level === 'L3', '--for 显式配对且带难度档');
  assert(rrow.blockers === 2 && rrow.reviewVerdict === 'fail' && rrow.executor === 'gemini' && rrow.model === 'gemini-4-argon', '尾注与执行者/模型');
  for (const effort of ['low', 'high', 'xhigh']) {
    const gemRec = rec({ name: `gem-${effort}`, model: 'kollab-gateway-copy', [effort]: true, tier: effort, brief: { resolvedModel: 'gemini-4-argon', effort } });
    writeState(gemRec);
    assert(rows().find(r => r.runId === gemRec.runId).effort === effort, `Gemini 账本记录 effort=${effort}`);
  }
  const rv2 = rec({ name: 'alpha-review2', model: 'gpt-6.1-sol', review: true, startedAt: iso(-900_000) });
  writeState(rv2);
  const r2 = rows().find(r => r.runId === rv2.runId);
  assert(r2.type === 'review' && r2.reviewOf === 'alpha' && r2.pairSource === 'inferred' && r2.blockers === null, '同名前缀自动关联,没有尾注则留空');
  const lone = rec({ name: 'zzz-review', model: 'gpt-6.1-sol', review: true });
  writeState(lone);
  assert(rows().find(r => r.runId === lone.runId).reviewOf === null, '找不到被复核任务则留空');

  // 7. 报告「结论」自述部分完成 → outcome partial(ok 但自述部分)
  const withReport = rec({ name: 'beta' });
  writeFileSync(withReport.reportPath, '# beta\n## 结论\n部分完成：还差一步\n');
  writeState(withReport);
  assert(rows().find(r => r.runId === withReport.runId).outcome === 'partial', 'ok 但报告自述部分完成 → partial');

  // 8. 账本写不了不影响任务:账本路径落在一个普通文件下面
  const blocker = join(scratch, 'blocker');
  writeFileSync(blocker, 'x');
  process.env.AGENT_FLEET_LEDGER = join(blocker, 'sub', 'ledger.jsonl');
  let thrown = null;
  try { writeState(rec({ name: 'gamma' })); } catch (e) { thrown = e; }
  assert(thrown === null, '账本不可写时 writeState 不抛错');
  process.env.AGENT_FLEET_LEDGER = ledger;
  appendFileSync(ledger, 'not json\n');
  assert(rows().length > 0, '坏行被跳过');

  // 9. 回填:只回填窗口内、反复运行不重复、标 backfilled、旧文件不被改
  const before = rows().length;
  const old = rec({ name: 'old-one', startedAt: iso(-20 * 86400_000), finishedAt: iso(-20 * 86400_000 + 1000) });
  const fresh = rec({ name: 'fresh-one', startedAt: iso(-2 * 86400_000), finishedAt: iso(-2 * 86400_000 + 1000) });
  const live = rec({ name: 'live-one', status: 'running', verdict: null, finishedAt: null });
  const rawDir = process.env.AGENT_FLEET_LEDGER;
  process.env.AGENT_FLEET_LEDGER = join(scratch, 'off.jsonl'); // 先写旧 run 文件而不触发实时账本
  for (const r of [old, fresh, live]) writeState(r);
  process.env.AGENT_FLEET_LEDGER = rawDir;
  const stateBefore = readFileSync(join(runs, `${fresh.runId}.json`), 'utf8');
  const first = L.backfill(listDetached(), { days: 14, path: ledger });
  const afterFirst = rows().length;
  const second2 = L.backfill(listDetached(), { days: 14, path: ledger });
  assert(first.added >= 1 && rows().filter(r => r.runId === fresh.runId)[0].backfilled === true, '窗口内的 run 被回填并标 backfilled:true');
  assert(!rows().some(r => r.runId === old.runId) && !rows().some(r => r.runId === live.runId), '窗口外和未结束的 run 不回填');
  assert(second2.added === 0 && rows().length === afterFirst && afterFirst > before, '回填重复运行行数不变');
  assert(readFileSync(join(runs, `${fresh.runId}.json`), 'utf8') === stateBefore, '回填不改旧 run 记录');
  const dry = L.backfill(listDetached(), { days: 40, path: ledger, dryRun: true });
  assert(dry.added === 1 && rows().length === afterFirst, 'dry-run 只统计不写');

  // 10. fleet-go score 与 new 的新参数
  const score = spawnSync(join(root, 'bin/fleet-go'), ['score'], { encoding: 'utf8', env: process.env });
  assert(score.status === 0 && /执行者/.test(score.stdout) && /terra/.test(score.stdout) && /样本不足/.test(score.stdout), `score 输出各执行者且标样本不足(${score.stderr.trim()})`);
  const since = spawnSync(join(root, 'bin/fleet-go'), ['score', '--since', '2999-01-01'], { encoding: 'utf8', env: process.env });
  assert(since.status === 0 && /0 行/.test(since.stdout), 'score --since 过滤');
  const badSince = spawnSync(join(root, 'bin/fleet-go'), ['score', '--since', 'yesterday'], { encoding: 'utf8', env: process.env });
  assert(badSince.status === 1 && /YYYY-MM-DD/.test(badSince.stderr), 'score --since 格式错误给出提示');
  const missing = spawnSync(join(root, 'bin/fleet-go'), ['score'], { encoding: 'utf8', env: { ...process.env, AGENT_FLEET_LEDGER: join(scratch, 'none.jsonl') } });
  assert(missing.status === 1 && /账本不存在/.test(missing.stderr), '账本缺失给出提示');
  const plain = spawnSync(join(root, 'bin/fleet-go'), ['new', 'ledger-plain', '--to', 'gpt', '--simple', '--goal', '目标', '--dry-run'], { encoding: 'utf8', env: process.env, input: '' });
  assert(plain.status === 0 && !plain.stdout.includes('LEDGER:'), '普通 new --dry-run 不受影响、不带尾注说明');
  const review = spawnSync(join(root, 'bin/fleet-go'), ['new', 'ledger-chk', '--to', 'gemini', '--for', 'alpha', '--level', '3', '--goal', '目标', '--dry-run'], { encoding: 'utf8', env: process.env, input: '' });
  assert(review.status === 0 && review.stdout.includes('LEDGER: blockers=<n>'), '--for 的 brief 带复核尾注说明');
  const badLevel = spawnSync(join(root, 'bin/fleet-go'), ['new', 'x', '--to', 'gpt', '--level', '7', '--goal', '目标', '--dry-run'], { encoding: 'utf8', env: process.env, input: '' });
  assert(badLevel.status !== 0 && /L1.L4/.test(badLevel.stderr), '难度档非法时报错');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
finish();
