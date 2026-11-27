import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { runCode } from '../src/code-runner.mjs';

const dir = mkdtempSync('/tmp/gcp-pool-runner/no-fallback-');
const marker = join(dir, 'exec-started');
const bin = join(dir, 'fake-codex');
writeFileSync(bin, `#!/bin/sh\nif [ "$1" = exec ]; then touch '${marker}'; fi\nexit 1\n`, { mode: 0o700 });
process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'runs');
process.env.FLEET_CODEX_BACKEND = 'exec';
process.env.FLEET_NO_ARCHIVE_SWEEP = '1';
try {
  const result = await runCode({
    prompt: 'test', cwd: dir, codexBin: bin, noContinue: true,
    gcpWorkspace: { environment: { id: 'gcp-test', url: 'ws://127.0.0.1:12345/', cwd: '/home/worker/repo', token: 'x'.repeat(32) }, git: {} },
    gitTransport: (_config, args) => args.includes('--is-inside-work-tree') ? 'true\n' : args.includes('HEAD') ? 'a'.repeat(40) + '\n' : '',
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /GCP workspace execution unavailable/);
  assert.equal(existsSync(marker), false, 'failed remote connection must not start local exec');
  console.log('GCP remote connection failure never falls back to local exec');
} finally { rmSync(dir, { recursive: true, force: true }); }
