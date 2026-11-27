import { familyOf, resolveCodexModel } from '../src/model-family.mjs';
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
const envKeys = ['AGENT_FLEET_RUNS_DIR', 'FLEET_DETACHED_RUN_ID', 'FLEET_CODEX_BACKEND', 'FLEET_STEER_TEST_MODE', 'FLEET_STEER_TEST_TRACE', 'HTTPS_PROXY', 'FLEET_EXPECTED_PROXY', 'CODEX_HOME'];
const saved = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
process.env.HTTPS_PROXY = process.env.FLEET_EXPECTED_PROXY = 'http://127.0.0.1:19876';
const mock = join(scratch, 'codex-mock');
writeFileSync(mock, String.raw`#!/usr/bin/env node
const fs = require('node:fs');
const readline = require('node:readline');
const args = process.argv.slice(2), mode = process.env.FLEET_STEER_TEST_MODE;
const trace = value => fs.appendFileSync(process.env.FLEET_STEER_TEST_TRACE, JSON.stringify(value) + '\n');
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
trace({ args });
trace({ nodeProxy: process.env.NODE_USE_ENV_PROXY, proxyInherited: process.env.HTTPS_PROXY === process.env.FLEET_EXPECTED_PROXY });
process.on('SIGINT', () => { trace({ signal: 'SIGINT' }); process.exit(130); });
if (args[0] === 'app-server') {
  if (mode === 'app-fail' || mode === 'app-fail-slow') { process.stderr.write('mock app-server unavailable\n'); process.exit(2); }
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
      else if (mode === 'reject-active' && req.method === 'thread/unarchive') {
        const dir = require('node:path').join(process.env.CODEX_HOME, 'sessions', '2026', '11', '27');
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(require('node:path').join(dir, 'rollout-2026-11-27T09-00-00-thread-one.jsonl'), '');
        send({ id: req.id, error: { code: -32000, message: 'no archived rollout found' } });
      }
      else send({ id: req.id, result: {} });
    }
    if (req.method === 'thread/resume') {
      if (req.params.threadId === 'invalid-thread') send({id:req.id,error:{code:-32000,message:'session not found'}});
      else send({id:req.id,result:{thread:{id:req.params.threadId}}});
    }
    if (req.method === 'thread/start') send({ id: req.id, result: { thread: { id: 'thread-one' } } });
    if (req.method === 'turn/start') {
      send({ id: req.id, result: { turn: { id: 'turn-one' } } });
      send({ method: 'turn/started', params: { turn: { id: 'turn-one' } } });
      if (mode === 'normal' || mode === 'archive-fail') setTimeout(complete, 25);
      if (mode === 'child-completes') {
        send({method:'turn/started',params:{threadId:'child-thread',turn:{id:'child-turn'}}});
        send({method:'thread/tokenUsage/updated',params:{threadId:'child-thread',tokenUsage:{total:{totalTokens:999999}}}});
        send({method:'item/completed',params:{threadId:'child-thread',item:{type:'agentMessage',phase:'final_answer',text:'子任务结论'}}});
        send({method:'turn/completed',params:{threadId:'child-thread',turn:{id:'child-turn',status:'completed'}}});
        setTimeout(complete,100);
      }
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
      if (['reject', 'reject-missing', 'reject-active', 'reject-auth', 'reject-run-failed'].includes(mode)) send({ id: req.id, error: { code: -32000, message: 'mock steer rejected' } });
      else if (mode === 'reject-turn-failed') {
        send({ id: req.id, error: { code: -32000, message: 'mock steer rejected' } });
        send({ method: 'turn/completed', params: { turn: { id: 'turn-one', status: 'failed', error: { message: 'mock genuine failure' } } } });
      }
      else { send({ id: req.id, result: {} }); setTimeout(complete, 25); }
    }
  });
} else {
  let prompt = '';
  process.stdin.on('data', chunk => { prompt += chunk; });
  process.stdin.on('end', () => {
    trace({ prompt });
    if (args.includes('resume') && (args.includes('invalid-thread') || mode === 'reject-missing')) {
      process.stderr.write('session not found\n'); process.exit(1);
    }
    if (args.includes('resume') && mode === 'reject-auth') {
      process.stderr.write('HTTP 401 authentication failed\n'); process.exit(1);
    }
    const complete = () => {
      fs.writeFileSync(args[args.indexOf('-o') + 1], '任务完成');
      send({ type: 'turn.completed', usage: { input_tokens: 10, output_tokens: 7 } });
    };
    if (mode === 'exec-starting') {
      trace({ execReady: true });
      setTimeout(() => { send({ type: 'thread.started', thread_id: 'thread-one' }); setTimeout(complete, 150); }, 150);
    } else {
      send({ type: 'thread.started', thread_id: 'thread-one' });
      trace({ execReady: true });
      if (mode === 'exec-failed' && !args.includes('resume')) {
        setTimeout(() => { process.stderr.write('mock genuine failure\n'); process.exit(7); }, 300);
      } else if (mode === 'reject-run-failed' && args.includes('resume')) {
        process.stderr.write('session not found during execution\n'); process.exit(7);
      } else if (mode === 'app-fail-slow' || mode === 'exec-slow') setTimeout(complete, 300);
      else complete();
    }
  });
}
`);
chmodSync(mock, 0o755);
process.env.AGENT_FLEET_RUNS_DIR = scratch;

let scenarioNumber = 0;
async function scenario(mode, { backend, say, stop, resume, review = false, low = false, high = false, xhigh = false, max = false, simple = false, sol = false, luna = false, fast = false, grant = '', waitFor = 'turn/start' } = {}) {
  const runId = `codex-${++scenarioNumber}-${mode}-${review ? 'review' : 'code'}`;
  process.env.FLEET_DETACHED_RUN_ID = runId;
  process.env.FLEET_STEER_TEST_MODE = mode;
  process.env.FLEET_STEER_TEST_TRACE = join(scratch, `${runId}.trace`);
  if (backend) process.env.FLEET_CODEX_BACKEND = backend;
  else delete process.env.FLEET_CODEX_BACKEND;
  const pending = runCode({ noContinue: true, prompt: '归类：(a) Codex 编码\nREPORT: /tmp/report\n原任务规则' + (grant ? '\n' + grant : ''), cwd: scratch, codexBin: mock, resume, review, low, high, xhigh, max, simple, sol, luna, fast });
  if (say || stop) {
    for (let attempt = 0; attempt < 500; attempt++) {
      if (existsSync(process.env.FLEET_STEER_TEST_TRACE) && readFileSync(process.env.FLEET_STEER_TEST_TRACE, 'utf8').includes(waitFor)) break;
      await delay(10);
    }
    assert(readFileSync(process.env.FLEET_STEER_TEST_TRACE, 'utf8').includes(waitFor), '等待当前 turn 后才插话');
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

  const childCompletes = await scenario('child-completes');
  assert.equal(childCompletes.result.result,'任务完成','child final cannot replace root result');
  assert.equal(childCompletes.result.numTurns,1,'child turn is not counted as our turn');
  assert.equal(childCompletes.result.usage.total.totalTokens,17,'child tokens cannot trigger our handoff');
  assert.equal(childCompletes.result.ok,true);
  const normal = await scenario('normal', { low: true });
  assert.equal(normal.result.ok, true);
  assert.equal(normal.result.backend, 'codex-app-server');
  assert.equal(normal.result.result, '任务完成');
  assert.equal(normal.result.numTurns, 1);
  assert(readFileSync(normal.result.logPath, 'utf8').trim().split('\n').map(JSON.parse).length > 1, 'app 日志保持 JSONL 行边界');
  assert.equal(normal.result.usage.total.totalTokens, 17);
  const threadStart = normal.trace.find(entry => entry.method === 'thread/start');
  assert.deepEqual([threadStart.params.cwd, threadStart.params.model, threadStart.params.sandbox, threadStart.params.approvalPolicy], [scratch, 'gpt-6.1-terra', 'danger-full-access', 'never']);
  assert.equal('serviceTier' in threadStart.params, false);
  assert.equal(normal.record.simple, false);
  assert.equal(normal.result.serviceTier, null);
  const defaultExec = await scenario('normal', { backend: 'exec' });
  assert(!defaultExec.trace.find(entry => entry.args?.[0] === 'exec').args.some(arg => arg.startsWith('service_tier=')));
  for (const run of [normal, defaultExec]) {
    const args = run.trace.find(entry => entry.args).args;
    assert(args.includes('mcp_servers.node_repl.enabled=false'));
    assert(args.includes('mcp_servers.computer-use.enabled=false'));
    assert(args.includes('features.computer_use=false'));
  }
  const gui = await scenario('normal', { grant: '允许范围：可使用本机已登录 Chrome 验收页面。' });
  assert(!gui.trace.find(entry => entry.args).args.includes('mcp_servers.node_repl.enabled=false'));
  const denied = await scenario('normal', { grant: '允许范围：只读检查，不允许浏览器操作。' });
  assert(denied.trace.find(entry => entry.args).args.includes('mcp_servers.node_repl.enabled=false'));
  const simpleApp = await scenario('normal', { simple: true, fast: true, low: true });
  const simpleStart = simpleApp.trace.find(entry => entry.method === 'thread/start').params;
  assert.equal(simpleStart.model, 'gpt-6.1-terra');
  assert.equal(simpleStart.serviceTier, 'priority');
  assert.equal(simpleApp.trace.find(entry => entry.method === 'turn/start').params.effort, 'low');
  const simpleExec = await scenario('app-fail', { simple: true, fast: true });
  const simpleResume = await scenario('normal', { simple: true, fast: true, resume: 'thread-one' });
  for (const run of [simpleApp, simpleExec, simpleResume]) {
    assert.equal(run.result.ok, true);
    assert.equal(run.record.simple, true);
    assert.equal(run.record.model, 'gpt-6.1-terra');
    assert.equal(run.record.serviceTier, 'priority');
    assert.match(readFileSync(run.result.resultPath, 'utf8'), /model: gpt-6.1-terra\nservice_tier: priority/);
    assert.match(formatBriefHuman(buildBrief(run.result)), /service_tier: priority/);
    const args = run.trace.find(entry => entry.args?.[0] === 'exec')?.args;
    if (args) {
      assert.equal(args[args.indexOf('-m') + 1], 'gpt-6.1-terra');
      assert(args.includes('service_tier="priority"'));
    }
  }
  for (const mode of ['normal', 'app-fail']) {
    const run = await scenario(mode, { simple: true });
    assert.equal(run.record.model, 'gpt-6.1-terra');
    assert.equal(run.record.serviceTier, null);
    const start = run.trace.find(entry => entry.method === 'thread/start');
    if (start) assert.equal('serviceTier' in start.params, false);
    const exec = run.trace.find(entry => entry.args?.[0] === 'exec');
    if (exec) assert(!exec.args.some(arg => arg.startsWith('service_tier=')));
  }
  for (const mode of ['normal', 'app-fail']) {
    const run = await scenario(mode, { luna: true });
    assert.equal(run.result.model, 'gpt-6-luna');
    assert.equal(buildBrief({ ...run.result, ok: false }).failureReport.executor, 'gpt-6-luna');
    assert.equal(run.result.serviceTier, null);
    assert.equal(run.record.luna, true);
    const start = run.trace.find(entry => entry.method === 'thread/start');
    if (start) { assert.equal(start.params.model, 'gpt-6-luna'); assert.equal(start.params.serviceTier, undefined); assert.equal(run.trace.find(entry => entry.method === 'turn/start').params.effort, 'xhigh'); }
    const exec = run.trace.find(entry => entry.args?.[0] === 'exec');
    if (exec) { assert(exec.args.includes('gpt-6-luna')); assert(exec.args.includes('model_reasoning_effort=xhigh')); assert(!exec.args.some(arg => arg.startsWith('service_tier='))); }
  }
  const lunaFast = await scenario('normal', { luna: true, fast: true, low: true });
  assert.equal(lunaFast.trace.find(entry => entry.method === 'thread/start').params.serviceTier, 'priority');
  assert.equal(lunaFast.trace.find(entry => entry.method === 'turn/start').params.effort, 'low');
  const lunaResume = await scenario('normal', { luna: true, resume: 'thread-one' });
  assert.equal(lunaResume.record.model, 'gpt-6-luna');
  assert.equal(lunaResume.record.serviceTier, null);
  await assert.rejects(runCode({ prompt: 'x', luna: true, review: true }), /--luna.*--review/);
  await assert.rejects(runCode({ prompt: 'x', luna: true, simple: true }), /--luna.*--simple/);
  const lunaHigh = await scenario('normal', { luna: true, high: true });
  assert.equal(lunaHigh.trace.find(entry => entry.method === 'turn/start').params.effort, 'high');
  assert.equal(lunaHigh.record.high, true);
  const lunaXhigh = await scenario('normal', { luna: true, xhigh: true });
  assert.equal(lunaXhigh.trace.find(entry => entry.method === 'turn/start').params.effort, 'xhigh');
  assert.equal(lunaXhigh.record.xhigh, true);
  const lunaMax = await scenario('normal', { luna: true, max: true });
  assert.equal(lunaMax.trace.find(entry => entry.method === 'turn/start').params.effort, 'max');
  assert.equal(lunaMax.record.max, true);
  for (const options of [{ low: true, high: true }, { luna: true, low: true, xhigh: true }, { luna: true, high: true, xhigh: true }, { luna: true, low: true, max: true }, { luna: true, high: true, max: true }, { luna: true, xhigh: true, max: true }]) await assert.rejects(runCode({ prompt: 'x', ...options }), /不能同用/);
  await assert.rejects(runCode({ prompt: 'x', xhigh: true }), /--xhigh.*--luna/);
  await assert.rejects(runCode({ prompt: 'x', max: true }), /--max.*--luna/);
  await assert.rejects(runCode({ prompt: 'x', simple: true, sol: true }), /--sol.*--simple/);
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

  for (const mode of ['app-fail-slow', 'exec-slow', 'exec-starting']) {
    const deferred = await scenario(mode, { backend: mode === 'app-fail-slow' ? undefined : 'exec', say: '回合结束后收到我', waitFor: 'execReady' });
    assert.equal(deferred.result.ok, true);
    assert.equal(deferred.result.numTurns, 2);
    assert.equal(deferred.result.resumeCount, 1);
    assert(!deferred.trace.some(entry => entry.signal === 'SIGINT'), 'exec 插话不杀进程');
    assert.deepEqual(deferred.trace.filter(entry => entry.prompt).map(entry => entry.prompt).slice(1), ['回合结束后收到我']);
    assert.equal(buildBrief(deferred.result).verdict, 'ok');
  }
  const missingResume = await scenario('reject-missing', { say: '旧线程不见也要执行这句' });
  assert.equal(missingResume.result.ok, true);
  assert.equal(buildBrief(missingResume.result).verdict, 'ok');
  const missingPrompts = missingResume.trace.filter(entry => entry.prompt).map(entry => entry.prompt);
  assert.equal(missingPrompts.length, 2);
  assert.match(missingPrompts[1], /原任务规则/);
  assert.match(missingPrompts[1], /旧线程不见也要执行这句/);
  assert(!missingResume.trace.filter(entry => entry.args?.[0] === 'exec').at(-1).args.includes('resume'));

  const genuineFailure = await scenario('exec-failed', { backend: 'exec', say: '不能覆盖真实失败', waitFor: 'execReady' });
  assert.equal(genuineFailure.result.ok, false);
  assert.equal(buildBrief(genuineFailure.result).verdict, 'fail');
  assert.equal(genuineFailure.result.progress.exitCode, 7);
  assert.equal(genuineFailure.trace.filter(entry => entry.args?.[0] === 'exec').length, 1);
  assert(!genuineFailure.trace.some(entry => entry.signal === 'SIGINT'));
  assert.match(readFileSync(genuineFailure.result.logPath, 'utf8'), /未投递插话保留在 inbox/);
  for (const mode of ['reject-auth', 'reject-run-failed']) {
    const failedResume = await scenario(mode, { say: '不能重放真实错误' });
    assert.equal(failedResume.result.ok, false);
    assert.equal(buildBrief(failedResume.result).verdict, 'fail');
    assert.equal(failedResume.trace.filter(entry => entry.args?.[0] === 'exec').length, 1);
  }
  const failedApp = await scenario('reject-turn-failed', { say: 'app-server 真失败不可覆盖' });
  assert.equal(failedApp.result.ok, false);
  assert.equal(failedApp.trace.filter(entry => entry.args?.[0] === 'exec').length, 0);

  process.env.CODEX_HOME = join(scratch, 'codex-home');
  const found = await scenario('reject-active', { say: '从活动 rollout 续接' });
  assert.equal(found.result.ok, true);
  assert.match(readFileSync(found.result.logPath, 'utf8'), /已在 sessions 找到 threadId/);
  assert(!found.result.fallbacks.some(line => line.includes('unarchive failed')));
  const active = await scenario('exec-slow', { backend: 'exec', say: '活动 rollout 无需解归档', waitFor: 'execReady' });
  assert.equal(active.result.ok, true);
  assert(!active.trace.some(entry => entry.method === 'thread/unarchive'));
  if (saved.CODEX_HOME === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = saved.CODEX_HOME;

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
  assert.equal(continued.trace.find(entry => entry.method === 'thread/resume').params.threadId, 'thread-one');
  assert.equal(continued.trace.filter(entry => entry.method).at(-1).method, 'thread/archive');

  const invalid = await scenario('normal', { resume: 'invalid-thread' });
  assert.equal(invalid.result.ok, false);
  assert.match(invalid.result.stderr, /session not found/);
  assert.match(invalid.result.fallbacks.join('\n'), /exec resume failed.*--restart/);
  assert.equal(buildBrief(invalid.result).verdict, 'fail');

  const review = await scenario('normal', { review: true });
  assert.equal(review.result.ok, true);
  assert.equal(review.result.model, 'gpt-6.1-terra');
  assert.equal(review.result.backend, 'codex-app-server');
  assert.equal(review.trace.find(entry => entry.method === 'thread/start').params.sandbox, 'danger-full-access');
  assert.equal(review.trace.find(entry => entry.method === 'thread/start').params.approvalPolicy, 'never');
  assert.match(review.trace.find(entry => entry.method === 'turn/start').params.input[0].text, /自己的.*mktemp -d/);
  const reviewSol = await scenario('normal', { review: true, sol: true });
  assert.equal(familyOf(reviewSol.result.model), 'sol');
  const reviewExec = await scenario('normal', { review: true, backend: 'exec' });
  const reviewFallback = await scenario('app-fail', { review: true });
  const reviewResume = await scenario('normal', { review: true, resume: 'thread-one' });
  for (const run of [review, reviewExec, reviewFallback, reviewResume]) {
    assert.equal(run.result.ok, true);
    for (const { args } of run.trace.filter(entry => entry.args?.[0] === 'exec')) {
      assert.equal(args[args.indexOf('--sandbox') + 1], 'danger-full-access');
      assert(!args.includes('read-only'));
    }
    assert.equal(buildBrief(run.result).verdict, 'ok', 'review 不按项目 dirty 状态判 suspect');
    assert(run.trace.some(entry => entry.nodeProxy === '1' && entry.proxyInherited), '保留宿主代理环境并开启 Node 代理支持');
  }
  console.log('PASS - Codex app-server/steer、SIGINT + resume、exec 兜底、元数据及简报桩测试');
} finally {
  for (const key of envKeys) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
  rmSync(scratch, { recursive: true, force: true });
}
