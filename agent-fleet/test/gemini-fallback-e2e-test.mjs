import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startMockAnthropicServer, FIXED_REPLY_TEXT } from './mock-anthropic-server.mjs';
const dir = mkdtempSync(join(tmpdir(), 'gemini-fallback-e2e-'));
const cli = fileURLToPath(new URL('../bin/agent-fleet.mjs', import.meta.url));
const server = await startMockAnthropicServer();
const run = (args, env) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [cli, ...args], { env, cwd: dir });
  let stdout = '', stderr = '';
  child.stdout.on('data', d => stdout += d); child.stderr.on('data', d => stderr += d);
  child.on('error', reject); child.on('close', code => resolve({ code, stdout, stderr }));
});
try {
  const config = join(dir, 'models.json');
  const model = { baseURL: server.baseURL, model: 'mock-model', apiKeyEnv: 'MOCK_API_KEY', authHeader: 'x-api-key' };
  writeFileSync(config, JSON.stringify({ 'kollab-gateway-copy': model, 'kollab-gateway-research': model }));
  const order = join(dir, 'order.md');
  const resetOrder = () => writeFileSync(order, '| 执行者 | 状态 | 有效至 | 原因与用户原话 |\n| --- | --- | --- | --- |\n| gemini-sub | 正常 | 用户另说 | 测试 |\n');
  const agy = join(dir, 'agy');
  const env = { ...process.env, MOCK_API_KEY: 'fixture', GEMINI_API_KEY: '', FLEET_GEMINI_SUB: '1', FLEET_AGY_BIN: agy,
    AGENT_FLEET_ORDER_FILE: order, AGENT_FLEET_RUNS_DIR: join(dir, 'runs'), HTTP_PROXY: '', HTTPS_PROXY: '', ALL_PROXY: '' };
  for (const [name, response, expectedRequests] of [['success', 'completed copy', 0], ['login', 'authentication required', 1], ['quota', 'quota exhausted 429', 1]]) {
    resetOrder();
    writeFileSync(agy, `#!/bin/sh\nprintf '%s\\n' '${response}'\n`); chmodSync(agy, 0o755);
    const before = server.receivedRequests.length;
    const r = await run(['copy', 'hello', '--attach', '--no-voice', '--cwd', dir, '--models-config', config, '--full'], env);
    assert.equal(r.code, 0, `${name}: ${r.stderr} ${r.stdout}`);
    const requests = server.receivedRequests.slice(before).filter(x => x.url?.startsWith('/v1/messages') && !x.url.includes('count_tokens'));
    assert.equal(requests.length, expectedRequests, `${name}: gateway requests`);
    assert.ok(r.stdout.includes(name === 'success' ? 'completed copy' : FIXED_REPLY_TEXT));
    if (name !== 'success') assert.match(r.stderr, /回退 Kollab/);
    console.log(`PASS fleet copy ${name}: ${requests.length} gateway requests`);
  }
  resetOrder();
  writeFileSync(agy, '#!/bin/sh\nprintf "detach agy copy ok\\n"\n'); chmodSync(agy, 0o755);
  const detachReport = join(dir, 'detach-agy.md');
  const detachRuns = join(dir, 'detach-runs');
  const detachEnv = { ...env, AGENT_FLEET_RUNS_DIR: detachRuns };
  const detachOk = await run(['copy', 'hello', '--no-voice', '--cwd', dir, '--models-config', config, '--report', detachReport], detachEnv);
  assert.equal(detachOk.code, 0, `detach ok: ${detachOk.stderr} ${detachOk.stdout}`);
  const okStateFile = readdirSync(detachRuns).find(x => x.endsWith('.json') && !x.endsWith('.pid.json') && !x.endsWith('.queue.json'));
  const okState = JSON.parse(readFileSync(join(detachRuns, okStateFile), 'utf8'));
  assert.equal(okState.model, 'agy');
  assert.equal(readFileSync(detachReport, 'utf8').trim(), 'detach agy copy ok');
  console.log('PASS fleet copy detach agy: model=agy and report backfilled');

  writeFileSync(agy, '#!/bin/sh\necho "token=fixture-secret location blocked 400" >&2\nexit 1\n'); chmodSync(agy, 0o755);
  const detachFailRuns = join(dir, 'detach-fail-runs');
  const detachFailBefore = server.receivedRequests.length;
  const detachFail = await run(['copy', 'hello', '--no-voice', '--cwd', dir, '--models-config', config], { ...env, AGENT_FLEET_RUNS_DIR: detachFailRuns });
  assert.equal(detachFail.code, 0, `detach fallback: ${detachFail.stderr} ${detachFail.stdout}`);
  const failLogFile = readdirSync(detachFailRuns).find(x => x.endsWith('.log'));
  const failLog = readFileSync(join(detachFailRuns, failLogFile), 'utf8');
  assert.match(failLog, /agy 失败摘要:.*location blocked 400/);
  assert.doesNotMatch(failLog, /fixture-secret/);
  assert.equal(server.receivedRequests.slice(detachFailBefore).filter(x => x.url?.startsWith('/v1/messages') && !x.url.includes('count_tokens')).length, 1);
  console.log('PASS fleet copy detach fallback: failure summary logged & redacted');

  for (const kind of ['research', 'analyze']) {
    const before = server.receivedRequests.length;
    const args = [kind, '--to', 'gemini-api', '--prompt', 'hello', '--models-config', config, '--cwd', dir, '--full'];
    if (kind === 'analyze') args.push('--input', config);
    const r = await run(args, env);
    assert.equal(r.code, 0, `${kind}: ${r.stderr} ${r.stdout}`);
    assert.match(r.stderr, /回退 Kollab/);
    assert.ok(r.stdout.includes(FIXED_REPLY_TEXT));
    assert.equal(server.receivedRequests.slice(before).filter(x => x.url?.startsWith('/v1/messages') && !x.url.includes('count_tokens')).length, 1);
    console.log(`PASS fleet ${kind}: no key, gateway request`);
  }
} finally { await server.close(); rmSync(dir, { recursive: true, force: true }); }
