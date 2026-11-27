import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supervise, waitDetached } from '../src/detach.mjs';

const self = fileURLToPath(import.meta.url);
const runs = process.env.AGENT_FLEET_RUNS_DIR;
const id = 'ipc-disconnect-regression';
const base = join(runs, id);
if (process.argv[2] === '__supervise') {
  await supervise(self);
} else if (process.argv[2] === 'execute') {
  writeFileSync(base + '.started', 'running');
  process.send({brief: {ok:true, verdict:'ok'}, resultText:'completed'});
  process.disconnect();
} else if (process.argv[2] === 'launcher') {
  const child = spawn(process.execPath, [self, '__supervise', id], {detached:true, stdio:['ignore','ignore','ignore','ipc']});
  child.kill('SIGSTOP');
  writeFileSync(base+'.supervisor', String(child.pid));
  writeFileSync(base + '.report.md', 'existing report');
  const rec = {reportPath:base+'.report.md', detach:true, runId:id, cwd:process.cwd(), model:'mock', status:'running', startedAt:new Date().toISOString(), logPath:base+'.log', resultPath:base+'.result.md'};
  child.send({rec, args:['execute']}, err => { if (err) throw err; process.exit(0); });
} else {
  const launcher = spawnSync(process.execPath, [self, 'launcher'], {env:process.env, timeout:30000});
  assert.equal(launcher.status, 0, launcher.stderr.toString());
  process.kill(Number(readFileSync(base+'.supervisor', 'utf8')), 'SIGCONT');
  // Directory watch events can be missed for atomic renames on macOS.
  const deadline = Date.now() + 30000;
  while (!existsSync(base+'.json')) {
    if (Date.now() >= deadline) throw Error('supervisor did not start');
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  await waitDetached(id);
  const rec = JSON.parse(readFileSync(base+'.json', 'utf8'));
  assert.equal(rec.status, 'done');
  assert.equal(rec.pending, undefined);
  const until = Date.now() + 10000;
  while (!readFileSync(base+'.report.md', 'utf8').includes('残留清单')) {
    if (Date.now() > until) throw Error('missing-pending residual report absent');
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert(!readFileSync(base+'.log', 'utf8').includes('自动收尾：'));
  console.log('PASS missing pending preserves residuals');
  assert(existsSync(base+'.started'));
  assert.equal(readFileSync(base+'.result.md', 'utf8'), 'completed');
  assert(!existsSync(base+'.stop'));
  console.log('PASS parent exited before ready; executor completed and terminal state is done');
}
