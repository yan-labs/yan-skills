// 基准:约 4 万个历史文件(每个 run 一组 detach/pid/queue/stages/job 记录加日志、结果、收件箱)下,
// status 的耗时与读盘量不随历史线性变慢。上限默认 3 秒,可用 FLEET_BENCH_MAX_MS 调整(机器负载很高时)。
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const cli = join(root, 'bin/agent-fleet.mjs');
const maxMs = Number(process.env.FLEET_BENCH_MAX_MS || 3000);
const temp = mkdtempSync(join(tmpdir(), 'status-scale-'));
const home = join(temp, 'home');
const runs = join(temp, 'runs');
mkdirSync(home);
mkdirSync(runs);

const HISTORY = 4900;
const RECENT = 20;
const now = Date.now();
const runId = (t, n) => `${new Date(t).toISOString().replace(/[:.]/g, '-')}-detach-${n.toString(16).padStart(8, '0')}`;
const put = (file, value) => writeFileSync(join(runs, file), typeof value === 'string' ? value : JSON.stringify(value));
const command = execFileSync('ps', ['-o', 'command=', '-p', String(process.pid)], { encoding: 'utf8' }).trim();
const pad = 'x'.repeat(1500);

function terminal(n, finishedAgoMs) {
  const finishedAt = new Date(now - finishedAgoMs).toISOString();
  const startedAt = new Date(now - finishedAgoMs - 60_000).toISOString();
  const id = runId(now - finishedAgoMs - 60_000, n);
  put(`${id}.json`, { detach: true, runId: id, name: `hist-${n}`, status: 'done', verdict: 'ok', pid: 2_000_000_000 + n, startedAt, finishedAt, heartbeatAt: finishedAt, cwd: '/tmp', model: 'gpt-test', briefPath: `/tmp/hist-${n}.brief.md`, brief: pad });
  put(`${id}.pid.json`, { pid: 2_000_000_000 + n, command: 'node old', finished: true, startedAt, finishedAt, verdict: 'ok', cwd: '/tmp', model: 'gpt-test' });
  put(`${id}.queue.json`, { runId: id, state: 'done', model: 'gpt-test', createdAt: now - finishedAgoMs });
  put(`${id}.stages.json`, [{ stage: 'run', note: pad }]);
  put(`${id}.job.json`, { state: 'done' });
  put(`${id}.log`, 'log\n');
  put(`${id}.result.md`, 'result\n');
  put(`${id}.inbox`, '');
  return id;
}

const started = Date.now();
for (let n = 0; n < HISTORY; n++) terminal(n, 2 * 86_400_000 + n * 30_000);
for (let n = 0; n < 700; n++) put(`probe-${n.toString(16).padStart(64, '0')}.json`, { probe: true });
const recent = Array.from({ length: RECENT }, (_, n) => terminal(HISTORY + n, 3_600_000 + n * 60_000));
const active = [0, 1, 2].map(n => {
  const id = runId(now - 120_000 - n, HISTORY + RECENT + n);
  put(`${id}.json`, { detach: true, runId: id, name: `active-${n}`, status: 'running', pid: process.pid, command, startedAt: new Date(now - 120_000).toISOString(), heartbeatAt: new Date(now + 600_000).toISOString(), finishedAt: null, cwd: '/tmp', model: 'gpt-test', briefPath: `/tmp/active-${n}.brief.md` });
  put(`${id}.queue.json`, { runId: id, state: 'running', model: 'gpt-test', pid: process.pid, command, createdAt: now });
  return id;
});
const foreground = `${new Date(now - 90_000).toISOString().replace(/[:.]/g, '-')}-gpt-test`;
put(`${foreground}.pid.json`, { pid: process.pid, command, startedAt: new Date(now - 90_000).toISOString(), heartbeatAt: new Date(now).toISOString(), cwd: '/tmp', model: 'gpt-test', name: 'foreground-1' });
console.log(`fixture: ${HISTORY * 8 + RECENT * 8 + 700 + 6} files in ${((Date.now() - started) / 1000).toFixed(1)}s`);

const env = { ...process.env, HOME: home, AGENT_FLEET_RUNS_DIR: runs };
const status = (...args) => {
  const begin = performance.now();
  const r = spawnSync(process.execPath, [cli, 'status', '--json', ...args], { encoding: 'utf8', env, maxBuffer: 1 << 28 });
  const ms = performance.now() - begin;
  assert.equal(r.status, 0, r.stderr);
  return { rows: JSON.parse(r.stdout), ms };
};
const best = (...args) => Math.min(...[1, 2, 3].map(() => status(...args).ms));

try {
  const cold = status('--running');
  console.log(`status --running 冷启动(建索引) ${cold.ms.toFixed(0)}ms`);
  assert.deepEqual(cold.rows.map(r => r.runId).sort(), [...active, foreground].sort(), '--running 只列活跃任务');

  const warm = best('--running');
  console.log(`status --running 最快一次 ${warm.toFixed(0)}ms`);
  assert.ok(warm <= maxMs, `status --running ${warm.toFixed(0)}ms 超过 ${maxMs}ms`);

  const full = status();
  assert.deepEqual(full.rows.map(r => r.runId).sort(), [...active, ...recent, foreground].sort(), '全量只含活跃任务和 24 小时内终态');
  const fullBest = best();
  console.log(`status 最快一次 ${fullBest.toFixed(0)}ms`);
  assert.ok(fullBest <= maxMs, `status ${fullBest.toFixed(0)}ms 超过 ${maxMs}ms`);

  assert.deepEqual(status('--running', '--name', 'active-1').rows.map(r => r.name), ['active-1'], '--name 只留同名行');
  assert.deepEqual(status('--name', 'hist-7').rows, [], '24 小时外的历史不进状态');
  assert.deepEqual(status('--brief-path', '/tmp/active-2.brief.md').rows.map(r => r.name), ['active-2'], '--brief-path 只留同 brief 的行');

  // 读盘量:伴生记录(queue/stages/job/probe)和老终态不再被逐个读,warm 之后只读活跃与近期记录。
  const counted = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import fs from 'node:fs'; import { syncBuiltinESMExports } from 'node:module';
    const counts = { readFileSync: 0, statSync: 0 };
    for (const key of Object.keys(counts)) { const original = fs[key]; fs[key] = (...a) => { counts[key]++; return original(...a); }; }
    syncBuiltinESMExports();
    const { collectStatus } = await import(${JSON.stringify(new URL('../src/control.mjs', import.meta.url).href)});
    collectStatus({ active: true });
    console.log(JSON.stringify(counts));
  `], { encoding: 'utf8', env });
  assert.equal(counted.status, 0, counted.stderr);
  const counts = JSON.parse(counted.stdout);
  console.log(`warm 读盘量 ${JSON.stringify(counts)}`);
  assert.ok(counts.readFileSync <= 400, `读了 ${counts.readFileSync} 个文件,历史记录仍在被逐个读`);
  assert.ok(counts.statSync <= 2 * (HISTORY + RECENT + 800), `stat 了 ${counts.statSync} 次`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
console.log('status scale: 4 万历史文件下 status/--running 在上限内,伴生文件与老终态不逐个读 OK');
