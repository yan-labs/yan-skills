import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { startGcpxTransport } from '../src/gcp-transport-client.mjs';
const dir = mkdtempSync('/tmp/gcp-pool-runner/transport-client-');
try {
  const bin = join(dir, 'gcpx'); const marker = join(dir, 'closed');
  const ready = JSON.stringify({ url: 'ws://127.0.0.1:12345/', token: 'x'.repeat(40), proxyBin: '/home/u/transport/bin', bridgeFile: '/home/u/transport/bridge.json' });
  writeFileSync(bin, `#!/bin/sh\nprintf '%s\\n' '${ready}'\ncat >/dev/null\ntouch '${marker}'\n`, { mode: 0o700 });
  const t = await startGcpxTransport({ gcpxBin: bin, config: '/tmp/config.json', workspace: 'Task.With-Dots', cwd: '/home/u/workspace', control: { port: 4321, token: 'y'.repeat(43) } });
  assert.match(t.environment.id, /^gcp-[0-9a-f]{32}$/);
  assert.equal(t.environment.cwd, '/home/u/workspace');
  assert.equal(t.executionEnv.FLEET_GCP_BRIDGE_FILE, '/home/u/transport/bridge.json');
  assert.ok(t.executionEnv.PATH.startsWith('/home/u/transport/bin:'));
  await t.stop();
  assert.ok(existsSync(marker));
  writeFileSync(bin, "#!/bin/sh\nprintf '%s\\n' bad-json\n", { mode: 0o700 });
  await assert.rejects(startGcpxTransport({ gcpxBin: bin, config: '/tmp/config.json', workspace: 'test', cwd: '/home/u/workspace' }), /invalid gcpx transport response/);
  console.log('gcpx transport client preserves private capability and closes service');
} finally { rmSync(dir, { recursive: true, force: true }); }
