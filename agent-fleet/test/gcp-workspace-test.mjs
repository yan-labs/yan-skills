import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { prepareGcpxWorkspace } from '../src/gcp-workspace.mjs';
const dir = mkdtempSync(join(tmpdir(), 'gcpx-workspace-test-'));
try {
  const config = join(dir, 'config.json');
  writeFileSync(config, JSON.stringify({ workers: { w: { host: 'worker', ssh_config: '/tmp/ssh', root: '/home/u' } } }));
  const calls = [];
  const execute = async (_bin, args) => {
    calls.push(args);
    return args.includes('new') ? { id: 'task', path: '/home/u/workspaces/task', worker: 'w' } : {};
  };
  let stopped = false;
  const startTransport = async options => {
    assert.equal(options.cwd, '/home/u/workspaces/task');
    return { environment: { id: 'gcp-test' }, stop: async () => { stopped = true; } };
  };
  const ws = await prepareGcpxWorkspace({ gcpxBin: '/tmp/gcpx', config, repo: 'repo', workspace: 'task', mirror: join(dir, 'mirror'), execute, startTransport });
  assert.equal(ws.git.host, 'worker');
  assert.deepEqual(calls.map(args => args.includes('ls') ? 'ls' : args.includes('new') ? 'new' : 'sync'), ['ls', 'new', 'sync']);
  await ws.close();
  assert.ok(stopped);
  assert.ok(calls[3].includes('--flush'));
  await assert.rejects(prepareGcpxWorkspace({ gcpxBin: '/tmp/gcpx', config, repo: 'repo', workspace: 'task', mirror: dir, branch: 'main', sha: 'a'.repeat(40), execute, startTransport }), /branch or sha/);
  let push = 0, pull = 0, bridgeStopped = false, bridgeOptions;
  const controlled = await prepareGcpxWorkspace({ gcpxBin: '/tmp/gcpx', config, repo: 'repo', workspace: 'task', mirror: dir, execute,
    controlContext: { runId: 'run', reportPath: join(dir, 'report.md'), tempRoot: dir, fleetBin: '/tmp/fleet' },
    pushReport: () => { push++; }, pullReport: () => { pull++; },
    startBridge: async options => { bridgeOptions = options; return { token: 't', port: 1234, stop: async () => { bridgeStopped = true; } }; },
    startTransport: async options => { assert.equal(options.control.port, 1234); return { environment: {}, stop: async () => {} }; },
  });
  assert.equal(controlled.remoteReportPath, '/home/u/reports/task/report.md');
  assert.equal(push, 1);
  await bridgeOptions.beforeCommand(); assert.equal(pull, 1);
  await controlled.close(); assert.equal(pull, 2); assert.ok(bridgeStopped);
  console.log('gcpx workspace creation, transport, flush, and no-delete cleanup passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
