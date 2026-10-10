import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { runCode } from '../src/code-runner.mjs';
import { appendInbox, watchInbox } from '../src/inbox.mjs';
import { readPidRecord, processCommand } from '../src/pid.mjs';
import { buildBrief, formatBriefHuman } from '../src/brief.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'fleet-codex-steer-'));
const envKeys = ['AGENT_FLEET_RUNS_DIR', 'FLEET_DETACHED_RUN_ID', 'FLEET_CODEX_BACKEND', 'FLEET_STEER_TEST_MODE', 'FLEET_STEER_TEST_TRACE'];
const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
const mock = join(scratch, 'codex-mock');
writeFileSync(mock, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const args = process.argv.slice(2), mode = process.env.FLEET_STEER_TEST_MODE;
const trace = value => fs.appendFileSync(process.env.FLEET_STEER_TEST_TRACE, JSON.stringify(value) + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
trace({ args });
process.on('SIGINT', () => { trace({ signal: 'SIGINT' }); process.exit(130); });
if (args[0] === 'app-server') {
  if (mode === 'app-fail') { process.stderr.write('mock app-server unavailable\n'); process.exit(2); }
  const complete = () => {
    send({ method: 'thread/tokenUsage/updated', params: { tokenUsage: { total: { totalTokens: 17 } } } });
    send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'commentary', text: '处理中' } } });
    send({ method: 'item/completed', params: { item: { type: 'agentMessage', phase: 'final_answer', text: '任务完成' } } });
    send({ method: 'turn/completed', params: { turn: { id: 'turn-one', status: 'completed' } } });
  };
  readline.createInterface({ input: process.stdin }).on('line', line => {
    const req = JSON.parse(line); trace(req);
    if (req.method === 'initialize') send({ id: req.id, result: {} });
    if (req.method === 'thread/archive' || req.method === 'thread/unarchive') {
      if (mode === 'archive-fail' && req.method === 'thread/archive') send({ id: req.id, error: { code: -32000, message: 'mock archive failed' } });
      else send({ id: req.id, result: {} });
    }
    if (req.method === 'thread/start') send({ id: req.id, result: { thread: { id: 'thread-one' } } });
    if (req.method === 'turn/start') {
      send({ id: req.id, result: { turn: { id: 'turn-one' } } });
      send({ method: 'turn/started', params: { turn: { id: 'turn-one' } } });
      if (mode === 'normal' || mode === 'archive-fail') setTimeout(complete, 25);
      if (mode === 'failed') setTimeout(() => send({ method: 'turn/completed', params: { turn: { id: 'turn-one', status: 'failed', error: { message: 'mock turn failed' } } } }), 25);
      if (mode === 'reject' || mode === 'crash') {
        const orphan = require('node:child_process').spawn(process.execPath, ['-e', '/* codex-orphan-fixture */ setInterval(() => {}, 1000)'], { stdio: 'ignore' });
        trace({ orphanPid: orphan.pid });
      }
    }
    if (req.method === 'turn/interrupt') {
      send({ id: req.id, result: {} });
      send({ method: 'turn/completed', params: { turn: { id: 'turn-one', status: 'interrupted' } } });
    }
    if (req.method === 'turn/steer') {
      if (mode === 'crash' || mode === 'crash-empty') process.exit(1);
      if (mode === 'reject') send({ id: req.id, error: { code: -32000, message: 'mock steer rejected' } });
      else { send({ id: req.id, result: {} }); setTimeout(complete, 25); }
    }
  });
} else {
  let prompt = '';
  process.stdin.on('data', chunk => { prompt += chunk; });
  process.stdin.on('end', () => {
    trace({ prompt });
    if (args.includes('resume') && args.includes('invalid-thread')) {
      process.stderr.write('session not found\n'); process.exit(1);
    }
    send({ type: 'thread.started', thread_id: 'thread-one' });
    fs.writeFileSync(args[args.indexOf('-o') + 1], '任务完成');
    send({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 7 } });
  });
}
`);
chmodSync(mock, 0o755);
process.env.AGENT_FLEET_RUNS_DIR = scratch;

let scenarioNumber = 0;
async function scenario(mode, { backend, say, stop, resume, review = false, low = false } = {}) {
  const runId = `codex-${++scenarioNumber}-${mode}-${review ? 'review' : 'code'}`;
  process.env.FLEET_DETACHED_RUN_ID = runId;
  process.env.FLEET_STEER_TEST_MODE = mode;
  process.env.FLEET_STEER_TEST_TRACE = join(scratch, `${runId}.trace`);
  if (backend) process.env.FLEET_CODEX_BACKEND = backend;
  else delete process.env.FLEET_CODEX_BACKEND;
  const pending = runCode({ prompt: '归类：(a) Codex 编码\nREPORT: /tmp/report\n原任务规则', cwd: scratch, codexBin: mock, resume, review, low });
  if (say || stop) {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (existsSync(process.env.FLEET_STEER_TEST_TRACE) && readFileSync(process.env.FLEET_STEER_TEST_TRACE, 'utf8').includes('turn/start')) break;
      await delay(10);
    }
    assert.match(readFileSync(process.env.FLEET_STEER_TEST_TRACE, 'utf8'), /turn\/start/, '等待当前 turn 后才插话');
    appendInbox(runId, { type: stop ? 'stop' : 'say', text: say || '' });
  }
  const result = await pending;
  const trace = readFileSync(process.env.FLEET_STEER_TEST_TRACE, 'utf8').trim().split('\n').map(JSON.parse);
  return { result, trace, record: readPidRecord(runId) };
}

try {
  const deliveries = [];
  const inbox = watchInbox('inbox-check', entry => deliveries.push(entry), { pollMs: 20 });
  appendInbox('inbox-check', { type: 'say', text: '新指令' });
  inbox.pump(); inbox.pump(); inbox.stop();
  assert.deepEqual(deliveries.map(entry => entry.text), ['新指令']);

  const normal = await scenario('normal', { low: true });
  assert.equal(normal.result.ok, true);
  assert.equal(normal.result.backend, 'codex-app-server');
  assert.equal(normal.result.result, '任务完成');
  assert.equal(normal.result.numTurns, 1);
  assert(readFileSync(normal.result.logPath, 'utf8').trim().split('\n').map(JSON.parse).length > 1, 'app 日志保持 JSONL 行边界');
  assert.equal(normal.result.usage.total.totalTokens, 17);
  const threadStart = normal.trace.find(entry => entry.method === 'thread/start');
  assert.deepEqual([threadStart.params.cwd, threadStart.params.model, threadStart.params.sandbox, threadStart.params.approvalPolicy], [scratch, 'gpt-6.1-sol', 'danger-full-access', 'never']);
  const initial = normal.trace.find(entry => entry.method === 'turn/start');
  assert.equal(initial.params.effort, 'low');
  assert.match(initial.params.input[0].text, /归类：\(a\) Codex 编码\nREPORT: \/tmp\/report\n原任务规则$/);
  assert.equal(normal.record.threadId, 'thread-one');
  assert.equal(normal.record.backend, 'codex-app-server');
  assert.equal(normal.record.finished, true);
  assert.equal(normal.record.activeTurnId, null);
  assert.equal(normal.trace.find(entry => entry.method === 'thread/archive').params.threadId, 'thread-one');
  assert(normal.trace.findIndex(entry => entry.method === 'thread/archive') < normal.trace.findIndex(entry => entry.signal === 'SIGINT'));
  const archiveFail = await scenario('archive-fail');
  assert.equal(archiveFail.result.ok, true);
  assert.equal(buildBrief(archiveFail.result).verdict, 'ok');
  assert.match(archiveFail.result.fallbacks.join('\n'), /thread\/archive failed: mock archive failed/);
  assert.match(archiveFail.record.fallbacks.join('\n'), /mock archive failed/);

  for (const terminal of [await scenario('failed'), await scenario('stop', { stop: true })]) {
    assert.equal(terminal.result.ok, false);
    assert.equal(terminal.trace.find(entry => entry.method === 'thread/archive').params.threadId, 'thread-one');
  }
  const steered = await scenario('steer', { say: '只写到 3 并停止' });
  const steer = steered.trace.find(entry => entry.method === 'turn/steer');
  assert.equal(steer.params.threadId, 'thread-one');
  assert.equal(steer.params.expectedTurnId, 'turn-one');
  assert.equal(steer.params.input[0].text, '只写到 3 并停止');
  assert.equal(steered.result.steerCount, 1);
  assert.equal(steered.result.numTurns, 1);
  assert.equal(steered.result.resumeCount, 0);
  assert.equal(steered.result.ok, true);

  const rejected = await scenario('reject', { say: '保持上下文续跑' });
  const resumeArgs = rejected.trace.find(entry => entry.args?.[0] === 'exec').args;
  assert.deepEqual(resumeArgs.slice(resumeArgs.indexOf('resume')), ['resume', 'thread-one', '-']);
  assert.equal(rejected.trace.find(entry => entry.prompt).prompt, '保持上下文续跑');
  assert(rejected.trace.findIndex(entry => entry.signal === 'SIGINT') < rejected.trace.findIndex(entry => entry.args?.[0] === 'exec'));
  const orphanPid = rejected.trace.find(entry => entry.orphanPid).orphanPid;
  assert(!processCommand(orphanPid).includes('codex-orphan-fixture'), '续跑前必须结束旧工具子进程');
  assert.equal(rejected.result.resumeCount, 1);
  assert(rejected.trace.findIndex(entry => entry.method === 'thread/unarchive') < rejected.trace.findIndex(entry => entry.args?.[0] === 'exec'));
  assert.equal(rejected.trace.filter(entry => entry.method === 'thread/archive').length, 2);
  assert.equal(rejected.result.backend, 'codex-exec');
  assert.equal(rejected.result.ok, true);
  assert.match(rejected.result.fallbacks.join('\n'), /turn\/steer rejected.*SIGINT \+ exec resume/);
  assert.match(readFileSync(rejected.result.logPath, 'utf8'), /mock steer rejected/);

  const crashed = await scenario('crash', { say: '继续当前上下文' });
  assert.equal(crashed.result.ok, true);
  assert.equal(crashed.result.resumeCount, 1);
  assert(!processCommand(crashed.trace.find(entry => entry.orphanPid).orphanPid).includes('codex-orphan-fixture'), '崩溃后也清理已记录旧工具');
  const unknownCrash = await scenario('crash-empty', { say: '不能与未知旧工具并发' });
  assert.equal(unknownCrash.result.ok, false);
  assert(unknownCrash.trace.some(entry => entry.method === 'thread/archive'), '异常退出后用新服务归档本线程');
  assert.equal(unknownCrash.result.resumeBlocked, true);
  assert.equal(unknownCrash.trace.filter(entry => entry.args?.[0] === 'exec').length, 0);
  assert.match(unknownCrash.result.fallbacks.join('\n'), /无法确认旧工具.*--restart/);

  const appFail = await scenario('app-fail');
  assert.equal(appFail.result.ok, true);
  assert.equal(appFail.result.backend, 'codex-exec');
  assert.equal(appFail.trace.filter(entry => entry.args).length, 2);
  assert.match(appFail.result.fallbacks.join('\n'), /app-server unavailable/);

  const exec = await scenario('normal', { backend: 'exec' });
  assert.equal(exec.result.ok, true);
  assert.equal(exec.trace[0].args[0], 'exec');
  assert.equal(exec.result.result, normal.result.result);
  assert.equal(exec.result.numTurns, 1);
  assert(exec.trace[0].args.includes('danger-full-access'));
  for (const result of [normal.result, steered.result, rejected.result, appFail.result, exec.result]) {
    const brief = buildBrief(result);
    assert.equal(brief.ok, true);
    assert.equal(brief.verdict, 'ok');
    assert.equal(brief.resultPath, result.resultPath);
    assert.equal(brief.logPath, result.logPath);
    assert.match(formatBriefHuman(brief), /ok: true  verdict: ok/);
  }

  const continued = await scenario('normal', { resume: 'thread-one' });
  assert.equal(continued.result.ok, true);
  assert.equal(continued.trace.find(entry => entry.method === 'thread/unarchive').params.threadId, 'thread-one');
  assert.equal(continued.trace.at(-1).method, 'thread/archive');

  const invalid = await scenario('normal', { resume: 'invalid-thread' });
  assert.equal(invalid.result.ok, false);
  assert.match(invalid.result.stderr, /session not found/);
  assert.match(invalid.result.fallbacks.join('\n'), /exec resume failed.*--restart/);
  assert.equal(buildBrief(invalid.result).verdict, 'fail');

  const review = await scenario('normal', { review: true });
  assert.equal(review.result.ok, true);
  assert.equal(review.trace[0].args[0], 'exec');
  assert(review.trace[0].args.includes('read-only'));
  console.log('PASS - Codex app-server/steer、SIGINT + resume、exec 兜底、元数据及简报桩测试');
} finally {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(scratch, { recursive: true, force: true });
}
