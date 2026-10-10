import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { deliverSay } from '../src/control.mjs';
import { readState, resolveDetached, stopDetached, writeState } from '../src/detach.mjs';
import { writePidRecord, readPidRecord } from '../src/pid.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'fleet-grok-control-'));
const previousRuns = process.env.AGENT_FLEET_RUNS_DIR;
process.env.AGENT_FLEET_RUNS_DIR = scratch;
const cli = resolve('bin/agent-fleet.mjs');
const mock = join(scratch, 'grok-mock');
const argsFile = join(scratch, 'args.json');
const work = join(scratch, 'work');
mkdirSync(work);
writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'models') { console.log('Default model: mock'); process.exit(0); }
fs.writeFileSync(process.env.FLEET_TEST_ARGS, JSON.stringify(args));
const prompt = fs.readFileSync(args[args.indexOf('--prompt-file') + 1], 'utf8');
const resume = args.indexOf('-r');
const sessionId = resume >= 0 ? args[resume + 1] : args[args.indexOf('--session-id') + 1];
const emit = event => console.log(JSON.stringify(event));
emit({type:'thought',data:'starting'});
if (prompt.includes('SLOW') && resume < 0) setInterval(() => {}, 1000);
else {
 emit({type:'text',data:prompt.includes('FRAGMENT') ? '先读目录' : '结论：完成，保留上下文'});
 emit({type:'end',stopReason:'end_turn',sessionId,num_turns:2,total_cost_usd:0.001,usage:{input_tokens:4}});
}
`);
chmodSync(mock, 0o755);
const createdRuns = [];
const env = { ...process.env, FLEET_GROK_BIN: mock, FLEET_TEST_ARGS: argsFile, FLEET_DETACHED_RUN_ID: '', FLEET_DETACHED_BATCH: '' };
function run(args) {
  const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env, timeout: 15000 });
  assert.equal(result.error, undefined);
  return result;
}
async function until(check) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const result = check();
    if (result) return result;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Grok control fixture timed out');
}
try {
  writePidRecord('missing-session', { pid: process.pid, model: 'grok-cli:mock', finished: false });
  writeState({ runId: 'missing-session', detach: true, name: 'no-session' });
  assert.throws(() => deliverSay('no-session', 'continue'), /sessionId.*暂不支持/);
  assert.equal(readPidRecord('missing-session').finished, false);
  assert.equal(existsSync(join(scratch, 'missing-session.inbox')), false);

  const started = run(['grok-cli', 'SLOW count to five', '--cwd', work, '--name', 'control-grok', '--report', join(scratch, 'report.md'), '--review', '--max-turns', '4', '--reasoning-effort', 'low', '--no-wait']);
  assert.equal(started.status, 0, started.stderr);
  const id = started.stdout.match(/runId: (\S+)/)[1];
  createdRuns.push(id);
  await until(() => readPidRecord(id)?.sessionId);
  assert.equal(deliverSay('control-grok', 'count to three').runId, id);
  const finished = await until(() => { const rec = readState(id); return rec?.status !== 'running' && rec; });
  assert.equal(finished.verdict, 'ok');
  assert.equal(finished.numTurns, 2);
  assert.equal(finished.totalCostUsd, 0.001);
  assert.equal(finished.review, true);
  assert.equal(finished.sessionId, readPidRecord(id).sessionId);
  let args = JSON.parse(readFileSync(argsFile, 'utf8'));
  assert.equal(args[args.indexOf('-r') + 1], finished.sessionId);
  assert.match(readFileSync(finished.resultPath, 'utf8'), /结论：完成/);

  const resumed = run(['resume', 'control-grok', 'continue', '--no-wait']);
  assert.equal(resumed.status, 0, resumed.stderr);
  const nextId = resumed.stdout.match(/runId: (\S+)/)[1];
  createdRuns.push(nextId);
  const next = await until(() => { const rec = readState(nextId); return rec?.status !== 'running' && rec; });
  assert.equal(next.verdict, 'ok');
  assert.equal(next.name, 'control-grok');
  assert.equal(next.reportPath, finished.reportPath);
  assert.equal(resolveDetached('control-grok'), nextId);
  assert.equal(next.brief.resumedFrom, id);
  args = JSON.parse(readFileSync(argsFile, 'utf8'));
  assert.equal(args[args.indexOf('-r') + 1], finished.sessionId);
  assert.equal(args[args.indexOf('--max-turns') + 1], '4');
  assert.equal(args[args.indexOf('--reasoning-effort') + 1], 'low');

  const fragment = run(['grok-cli', 'FRAGMENT', '--cwd', work, '--attach', '--full']);
  assert.equal(fragment.status, 1);
  assert.match(fragment.stdout, /状态: suspect/);
  assert.ok(!fragment.stdout.includes('状态: 成功'));
  assert.match(fragment.stdout, /费用来源：grok 自报/);
  console.log('Grok 控制桩通过：无 session 不停止、短名 say、同会话续跑、IPC 元数据、resume 沿用参数、full suspect。');
} finally {
  for (const id of createdRuns) {
    const rec = readState(id);
    if (rec?.status === 'running') await stopDetached(rec);
  }
  if (previousRuns === undefined) delete process.env.AGENT_FLEET_RUNS_DIR;
  else process.env.AGENT_FLEET_RUNS_DIR = previousRuns;
  rmSync(scratch, { recursive: true, force: true });
}
