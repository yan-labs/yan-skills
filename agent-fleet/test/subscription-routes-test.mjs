import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runClaude } from '../src/claude-cli-runner.mjs';
import { MODEL_ALIASES } from '../src/shortcuts.mjs';
import { executorOf } from '../src/ledger.mjs';
const dir = mkdtempSync(join(tmpdir(), 'fleet-subscription-'));
try {
  assert.deepEqual([MODEL_ALIASES.copy, MODEL_ALIASES.bulk, MODEL_ALIASES.grok, MODEL_ALIASES.gpt, MODEL_ALIASES.sonnet], ['agy', 'agy', 'grok-cli:default', 'codex', 'claude-cli:sonnet']);
  assert.deepEqual(['agy', 'grok-cli:default', 'claude-cli:sonnet', 'kollab-gateway-gpt-sol'].map(x => executorOf(x)), ['gemini-sub', 'grok', 'claude-sub', 'openai-api']);
  const cli = join(dir, 'claude');
  const capture = join(dir, 'args');
  process.env.FLEET_CLAUDE_BIN = cli;
  process.env.AGENT_FLEET_RUNS_DIR = dir;
  writeFileSync(cli, `#!/bin/sh\nif [ "$1" = auth ]; then echo '{"loggedIn":true,"authMethod":"claude.ai"}'; else printf '%s\\n' "$@" > '${capture}'; echo done; fi\n`); chmodSync(cli, 0o755);
  const ok = await runClaude({ prompt: 'test', cwd: dir, model: 'sonnet' });
  assert.equal(ok.ok, true); assert.match(readFileSync(capture, 'utf8'), /--model\nsonnet/);
  writeFileSync(cli, '#!/bin/sh\nexit 1\n'); chmodSync(cli, 0o755);
  const failed = await runClaude({ prompt: 'test', cwd: dir, model: 'sonnet' });
  assert.equal(failed.ok, false); assert.match(failed.error, /claude CLI 未登录/);
  console.log('PASS subscription CLI defaults, classification and Claude auth failure');
} finally { rmSync(dir, { recursive: true, force: true }); }
