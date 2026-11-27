import { join } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';
import { startGcpControlBridge } from '../src/gcp-control-bridge.mjs';
const dir = mkdtempSync(join(tmpdir(), 'gcpx-bridge-test-'));
let bridge;
try {
  const calls = [];
  bridge = await startGcpControlBridge({ runId: 'run-one', parentRunId: 'run-parent', remoteRoot: '/home/u/workspace', mirrorRoot: dir, tempRoot: dir, fleetBin: '/tmp/fleet', env: {},
    execute: async (_bin, argv, env, cwd) => {
      calls.push({ argv, env, cwd, file: argv.includes('--file') ? readFileSync(argv[argv.indexOf('--file') + 1], 'utf8') : null });
      return { code: 0, stdout: 'ok', stderr: '' };
    } });
  async function request(data) {
    return await new Promise((resolve, reject) => {
      const sock = createConnection({ host: '127.0.0.1', port: bridge.port }); let result = '';
      sock.on('connect', () => sock.write(JSON.stringify(data) + '\n'));
      sock.on('data', chunk => { result += chunk; });
      sock.on('end', () => resolve(JSON.parse(result)));
      sock.on('error', reject);
    });
  }
  const send = argv => request({ token: bridge.token, argv });
  assert.equal((await request({ token: 'wrong', argv: ['park'] })).code, 1);
  assert.equal((await send(['bg', '--', 'sh'])).code, 1);
  assert.equal((await send(['park', '--until', 'cmd:touch /tmp/no'])).code, 1);
  assert.equal((await send(['park', '--until', 'all:["after:1s","cmd:id"]'])).code, 1);
  assert.equal((await send(['say', 'some-other-run', 'text'])).code, 1);
  assert.equal((await send(['park', '--run=someone', '--until', 'after:1s'])).code, 1);
  assert.equal((await request({ token: bridge.token, argv: ['plan', '--file', '/home/u/workspace/plan.md'], file: 'stage' })).code, 0);
  assert.equal(calls[0].file, 'stage'); assert.equal(calls[0].env.FLEET_SLOT_RUN_ID, 'run-one');
  assert.equal((await send(['park', '--until', 'file:/home/u/workspace/result'])).code, 0);
  assert.equal(calls[1].argv[2], `file:${dir}/result`);
  assert.equal((await send(['say', 'run-parent', 'done'])).code, 0);
  const cfg = `${dir}/remote-config.json`;
  writeFileSync(cfg, JSON.stringify({ port: bridge.port, token: bridge.token }), { mode: 0o600 });
  const proxy = fileURLToPath(new URL('../src/gcpx_remote_fleet.py', import.meta.url));
  const child = spawn('python3', [proxy, 'wait', 'run-parent'], { env: { ...process.env, FLEET_GCP_BRIDGE_FILE: cfg }, stdio: ['ignore', 'pipe', 'pipe'] });
  const exit = await new Promise(resolve => child.once('close', resolve));
  assert.equal(exit, 0);
  assert.deepEqual(calls.at(-1).argv, ['wait', 'run-parent']);
  console.log('GCP control bridge restricts capability, target and local command execution');
} finally { if (bridge) await bridge.stop(); rmSync(dir, { recursive: true, force: true }); }
