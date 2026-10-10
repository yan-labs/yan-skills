import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const scratch = mkdtempSync(join(tmpdir(), 'fleet-team-'));
try {
  const bin = join(scratch, 'mock-login');
  writeFileSync(bin, '#!/bin/sh\nprintf "login success\\n"\n');
  chmodSync(bin, 0o755);
  const secret = 'fixture-must-never-be-printed';
  const result = spawnSync(process.execPath, ['bin/agent-fleet.mjs', 'team'], {
    encoding: 'utf8', env: { ...process.env, FLEET_CODEX_BIN: bin, FLEET_GROK_BIN: bin,
      ANTHROPIC_CREDIT_API_KEY: secret, KOLLAB_PROD_API_KEY: secret, TYPESAFE_API_KEY: secret },
  });
  assert.equal(result.status, 0);
  for (const product of ['gpt', 'claude', 'grok', 'gemini', 'jev']) assert.match(result.stdout, new RegExp(`^${product}\\s*\\|`, 'm'));
  assert.ok(!`${result.stdout}${result.stderr}`.includes(secret));
  assert.ok(result.stdout.split('\n').length < 12);
  console.log('team 桩通过：五产品、一屏、登录存在性、凭据不回显');
} finally { rmSync(scratch, { recursive: true, force: true }); }
