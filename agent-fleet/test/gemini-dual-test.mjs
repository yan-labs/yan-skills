import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runAgy } from '../src/agy-runner.mjs';
import { runGeminiApi } from '../src/gemini-api-runner.mjs';

const dir = mkdtempSync(join(tmpdir(), 'fleet-gemini-test-'));
try {
process.env.AGENT_FLEET_ORDER_FILE = join(dir, 'order.md');
writeFileSync(process.env.AGENT_FLEET_ORDER_FILE, '| 执行者 | 状态 | 有效至 | 原因与用户原话 |\n| --- | --- | --- | --- |\n| gemini-sub | 正常 | 用户另说 | 测试 |\n');
process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'runs');
process.env.FLEET_AGY_BIN = join(dir, 'agy');
const stub = text => { writeFileSync(process.env.FLEET_AGY_BIN, `#!/bin/sh\nprintf '%s\\n' '${text}'\n`); chmodSync(process.env.FLEET_AGY_BIN, 0o755); };
process.env.FLEET_TEST_SECRET = 'fixture-secret';
process.env.HTTPS_PROXY = 'http://127.0.0.1:1';
writeFileSync(process.env.FLEET_AGY_BIN, `#!/bin/sh\n[ -z "$FLEET_TEST_SECRET" ] && [ -z "$HTTPS_PROXY" ] || exit 1\nprintf '%s\\n' '完成：示例文案'\n`);
chmodSync(process.env.FLEET_AGY_BIN, 0o755);
assert.equal((await runAgy({ prompt:'hello', cwd:dir, noVoice:true })).result, '完成：示例文案');
stub('authentication required');
assert.equal(await runAgy({ prompt:'hello', cwd:dir, noVoice:true }), null);
stub('quota exhausted 429');
assert.equal(await runAgy({ prompt:'hello', cwd:dir, noVoice:true }), null);
assert.match(readFileSync(process.env.AGENT_FLEET_ORDER_FILE, 'utf8'), /gemini-sub.*停用/);
console.log('agy: success, authentication fallback, quota fallback and order OK');
process.env.FLEET_GEMINI_API_BIN = join(dir, 'gemini-api');
writeFileSync(process.env.FLEET_GEMINI_API_BIN, '#!/bin/sh\nprintf \'%s\\n\' \'{"dry_run":true}\'\n');
chmodSync(process.env.FLEET_GEMINI_API_BIN, 0o755);
for (const kind of ['image','video','research','analyze']) {
  const r = runGeminiApi(kind, { prompt:'test', input:kind === 'analyze' ? new URL('../package.json', import.meta.url).pathname : undefined, dryRun:true });
  assert.equal(r.error, undefined, `${kind}: ${r.error}`);
  assert.equal(JSON.parse(r.output).dry_run, true);
}
delete process.env.GEMINI_API_KEY;
assert.equal(runGeminiApi('image', { prompt:'test' }).unavailable, true);
console.log('gemini-api: image/video/research/analyze dry-run and no-key unavailable OK');
const kollab = join(dir, 'kollab');
writeFileSync(kollab, '#!/bin/sh\nprintf \'%s\\n\' \'{"data":{"status":"ok","local_path":"mock.png"}}\'\n');
chmodSync(kollab, 0o755);
const cli = new URL('../bin/agent-fleet.mjs', import.meta.url).pathname;
const fallback = spawnSync(process.execPath, [cli, 'media', 'run', 'image', '--provider', 'gemini-api', '--prompt', 'test'], { encoding:'utf8', env:{ ...process.env, PATH:`${dir}:${process.env.PATH}`, GEMINI_API_KEY:'' } });
assert.equal(fallback.status, 0, fallback.stderr);
assert.match(fallback.stderr, /回退 Kollab/);
assert.match(fallback.stdout, /mock.png/);
console.log('fleet media: no-key Kollab fallback OK');

} finally { rmSync(dir, { recursive: true, force: true }); }
