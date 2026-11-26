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
  const rec = {detach:true, runId:id, cwd:process.cwd(), model:'mock', status:'running', startedAt:new Date().toISOString(), logPath:base+'.log', resultPath:base+'.result.md'};
  child.send({rec, args:['execute']}, err => { if (err) throw err; process.exit(0); });
} else {
  const launcher = spawnSync(process.execPath, [self, 'launcher'], {env:process.env, timeout:30000});
  assert.equal(launcher.status, 0, launcher.stderr.toString());
  process.kill(Number(readFileSync(base+'.supervisor', 'utf8')), 'SIGCONT');
  // waitDetached requires the first state to exist; observe its atomic creation.
  const { watch } = await import('node:fs');
  if (!existsSync(base+'.json')) await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { watcher.close(); reject(Error('supervisor did not start')); }, 30000);
    const watcher = watch(runs, () => { if (existsSync(base+'.json')) { clearTimeout(timer); watcher.close(); resolve(); } });
    if (existsSync(base+'.json')) { clearTimeout(timer); watcher.close(); resolve(); }
  });
  await waitDetached(id);
  const rec = JSON.parse(readFileSync(base+'.json', 'utf8'));
  assert.equal(rec.status, 'done');
  assert(existsSync(base+'.started'));
  assert.equal(readFileSync(base+'.result.md', 'utf8'), 'completed');
  assert(!existsSync(base+'.stop'));
  console.log('PASS parent exited before ready; executor completed and terminal state is done');
}
