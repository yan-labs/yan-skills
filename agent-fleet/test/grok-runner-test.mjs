import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const scratch = mkdtempSync(join(tmpdir(), 'fleet-grok-runner-'));
const cli = resolve('bin/agent-fleet.mjs');
try {
  const bin = join(scratch, 'mock-grok');
  writeFileSync(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
if (args[0] === 'models') {
 if (process.env.SCENARIO === 'timeout') { console.error('network timeout'); process.exit(1); }
 console.log('Default model: grok-fixture'); process.exit(0);
}
fs.writeFileSync(process.env.ARGS_PATH, JSON.stringify({args,proxy:Object.fromEntries(['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy'].map(k=>[k,process.env[k]]))}));
if (['write', 'cancelled-nonzero'].includes(process.env.SCENARIO)) fs.writeFileSync('changed.txt','changed');
const text = process.env.SCENARIO === 'no-conclusion' ? '先写规则回执，再继续' : '结论：完成。';
process.stdout.write(JSON.stringify({type:'thought',data:'do not include this'})+'\\n');
const line = JSON.stringify({type:'text',data:text});
process.stdout.write(line.slice(0,9));
setTimeout(()=>{
 process.stdout.write(line.slice(9)+'\\n');
 if(process.env.SCENARIO==='null-event') process.stdout.write('null\\n');
 if(process.env.SCENARIO==='bad-json') process.stdout.write('invalid\\n');
 if(process.env.SCENARIO!=='no-end') process.stdout.write(JSON.stringify({type:'end',stopReason:['cancelled','cancelled-nonzero'].includes(process.env.SCENARIO)?'cancelled':process.env.SCENARIO==='max-turns'?'max_turns':'end_turn',sessionId:'fixture-session',num_turns:2,total_cost_usd:0.0123,usage:{input_tokens:10,output_tokens:3},modelUsage:{fixture:{costUSD:0.0123}}}));
 if(process.env.SCENARIO==='cancelled-nonzero') process.exitCode=1;
},5);
`);
  chmodSync(bin, 0o755);
  const sleepBin = join(scratch, 'sleep-grok');
  writeFileSync(sleepBin, '#!/bin/sh\nexec sleep 5\n');
  chmodSync(sleepBin, 0o755);
  const shortTimeout = join(scratch, 'short-timeout.mjs');
  // Shorten only the test timeout; keep the real execFile and its error metadata.
  writeFileSync(shortTimeout, `import childProcess from 'node:child_process';
import { promisify } from 'node:util';
import { syncBuiltinESMExports } from 'node:module';
const original = childProcess.execFile;
const execute = promisify(original);
childProcess.execFile = (...args) => original(...args);
childProcess.execFile[promisify.custom] = (file, args, options) => execute(file, args, { ...options, timeout: 200 });
syncBuiltinESMExports();
`);
  function run(scenario, review = false, noProxy = false) {
    const dir = join(scratch, scenario + (review ? '-review' : '') + (noProxy ? '-no-proxy' : ''));
    mkdirSync(dir, { recursive: true });
    const runs = join(dir, 'runs');
    // Keep run artifacts outside the monitored cwd.
    const work = join(dir, 'work'); mkdirSync(work);
    const env = { ...process.env, SCENARIO: scenario, FLEET_GROK_BIN: scenario === 'exec-timeout' ? sleepBin : bin,
      AGENT_FLEET_RUNS_DIR: runs, ARGS_PATH: join(dir, 'args.json') };
    delete env.FLEET_DETACHED_RUN_ID;
    for (const key of ['HTTPS_PROXY','HTTP_PROXY','ALL_PROXY','https_proxy','http_proxy','all_proxy']) {
      if (noProxy) env[key] = ''; else env[key] = `http://fixture-${key}:7899`;
    }
    const output = spawnSync(process.execPath, [...(scenario === 'exec-timeout' ? ['--import', shortTimeout] : []), cli, 'grok-cli', 'Give a conclusion', '--cwd', work, '--attach', '--json', ...(review ? ['--review'] : [])], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(output.error, undefined);
    return { output, brief: JSON.parse(output.stdout), dir };
  }
  const normal = run('normal');
  assert.equal(normal.output.status, 0); assert.equal(normal.brief.verdict, 'ok');
  assert.equal(normal.brief.totalCostUsd, 0.0123); assert.equal(normal.brief.numTurns, 2);
  assert.equal(normal.brief.sessionId, 'fixture-session'); assert.equal(normal.brief.costSource, 'grok 自报');
  assert.equal(readFileSync(normal.brief.resultPath, 'utf8'), '结论：完成。');
  const metadata = JSON.parse(readFileSync(normal.brief.logPath.replace(/\.log$/, '.grok.json'), 'utf8'));
  assert.equal(metadata.sessionId, 'fixture-session'); assert.equal(metadata.numTurns, 2);
  assert.equal(metadata.totalCostUsd, 0.0123); assert.deepEqual(metadata.usage, { input_tokens: 10, output_tokens: 3 });
  const invocation = JSON.parse(readFileSync(join(normal.dir, 'args.json'), 'utf8'));
  assert.equal(invocation.args[invocation.args.indexOf('--output-format') + 1], 'streaming-json');
  assert.ok(invocation.args.includes('--always-approve')); assert.ok(!invocation.args.includes('--sandbox'));
  for (const [key, value] of Object.entries(invocation.proxy)) assert.equal(value, `http://fixture-${key}:7899`);
  for (const reason of ['cancelled', 'cancelled-nonzero', 'max-turns']) {
    const r = run(reason); assert.equal(r.output.status, 1); assert.equal(r.brief.verdict, 'fail');
    assert.match(r.brief.error, /stopReason=/); assert.match(r.brief.error, /需要批准的工具被取消/);
  }
  const incomplete = run('no-conclusion');
  assert.equal(incomplete.output.status, 1); assert.equal(incomplete.brief.verdict, 'suspect'); assert.match(incomplete.brief.error, /最终结论/);
  const cleanReview = run('normal', true); assert.equal(cleanReview.brief.verdict, 'ok');
  const changed = run('write', true);
  assert.equal(changed.output.status, 1); assert.equal(changed.brief.verdict, 'suspect'); assert.match(changed.brief.error, /changed.txt/);
  assert.equal(changed.brief.changedFiles.length, 1);
  assert.match(readFileSync(changed.brief.logPath, 'utf8'), /done error verdict=suspect/);
  assert.ok(JSON.parse(readFileSync(join(changed.dir, 'args.json'), 'utf8')).args.includes('--always-approve'));
  const failedReview = run('cancelled-nonzero', true);
  assert.equal(failedReview.output.status, 1); assert.equal(failedReview.brief.verdict, 'fail');
  assert.match(failedReview.brief.error, /stopReason=cancelled/);
  assert.match(failedReview.brief.error, /changed.txt/);
  for (const scenario of ['bad-json', 'null-event', 'no-end']) { const r = run(scenario); assert.equal(r.brief.verdict, 'fail'); }
  const timeout = run('timeout', false, true);
  assert.match(timeout.brief.error, /终端未设置 HTTPS_PROXY/);
  const killed = run('exec-timeout', false, true);
  assert.equal(killed.output.status, 1); assert.equal(killed.brief.verdict, 'fail');
  assert.match(killed.brief.error, /Command failed:/);
  assert.match(killed.brief.error, /终端未设置 HTTPS_PROXY/);
  const proxiedTimeout = run('exec-timeout');
  assert.equal(proxiedTimeout.brief.verdict, 'fail');
  assert.doesNotMatch(proxiedTimeout.brief.error, /终端未设置 HTTPS_PROXY/);
  console.log('grok-runner 桩通过：NDJSON、收尾判定、正文、元数据、review 快照、代理透传/提示');
} finally { rmSync(scratch, { recursive: true, force: true }); }
