#!/usr/bin/env node
// 已死任务自动结束 + pid 复用识别：用真实的已退出进程和被复用的 pid 验证，不发信号、不连网。

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAsserter } from './assert-helper.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'fleet-dead-run-'));
process.env.AGENT_FLEET_RUNS_DIR = scratch;
const { collectStatus, formatStatusHuman } = await import('../src/control.mjs');
const { detachedState, readState, stopDetached, writeState } = await import('../src/detach.mjs');
const { isRecordedProcessAlive, processCommand, readPidRecord, writePidRecord } = await import('../src/pid.mjs');

const { assert, finish } = createAsserter('已死任务收尾与 pid 复用识别');
const iso = (offsetMs = 0) => new Date(Date.now() + offsetMs).toISOString();
const cwd = scratch;
const selfCommand = processCommand(process.pid);
const OTHER = 'node /somewhere/else/agent-fleet.mjs __supervise someone-else';

// 一个真实存在过又退出的进程：它的 pid 现在是死的。
const done = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' });
const deadPid = Number(done.stdout);
assert(Number.isFinite(deadPid) && deadPid > 0, '拿到一个已退出进程的 pid');

const detachedRec = (runId, patch = {}) => ({
  detach: true, runId, status: 'running', pid: deadPid, command: OTHER, childPid: null,
  startedAt: iso(-3600_000), heartbeatAt: iso(-1800_000), finishedAt: null, exitCode: null, verdict: null,
  cwd, model: 'gpt-6.1-terra', name: runId, resultPath: join(scratch, `${runId}.result.md`), logPath: join(scratch, `${runId}.log`), ...patch,
});
const rowOf = (runId) => collectStatus().find(r => r.runId === runId);

try {
  // 1. 进程身份比较
  assert(isRecordedProcessAlive(process.pid, selfCommand) === true, '存活且 command 一致 → 活');
  assert(isRecordedProcessAlive(process.pid) === true, '旧记录没有 command → 只看存活');
  assert(isRecordedProcessAlive(process.pid, OTHER) === false, 'pid 存活但 command 不同（被复用）→ 死');
  assert(isRecordedProcessAlive(deadPid, OTHER) === false, 'pid 不存在 → 死');
  assert(isRecordedProcessAlive(null, selfCommand) === false, '没有 pid → 死');

  // 2. 监督进程已死、执行进程也不在 → 自动补写终态，再也不是 abnormal
  writeState(detachedRec('dead-plain'));
  const first = rowOf('dead-plain');
  assert(first && first.state === 'failed' && first.abnormalExit === true, '已死任务第一次 status 就进入 failed 终态');
  const saved = readState('dead-plain');
  assert(saved.status === 'failed' && saved.verdict === 'fail' && saved.exitCode === 1, '终态已写回磁盘');
  assert(saved.finishedAt === saved.heartbeatAt, '结束时间取最后心跳');
  assert(saved.brief?.ok === false && /不存在/.test(saved.error), '带失败简报和原因');
  assert(existsSync(saved.resultPath), '补出结果文件，wait 不会读不到');
  assert(rowOf('dead-plain').state === 'failed', '再次 status 结果一致，不重复改写');
  assert(formatStatusHuman([first]).includes('异常终止'), '人读输出仍给出异常终止与 resume 提示');

  // 3. pid 被别的进程复用：pid 活着但 command 不是监督进程 → 视同已死
  writeState(detachedRec('dead-reused', { pid: process.pid, command: OTHER, heartbeatAt: iso(-5000) }));
  assert(rowOf('dead-reused')?.state === 'failed', 'pid 被复用的记录判为已死并进入终态，不再长期显示 running/abnormal');

  // 4. 旧的已死记录：补写后超过 24 小时，不再出现在列表里
  writeState(detachedRec('dead-old', { startedAt: iso(-3 * 86400_000), heartbeatAt: iso(-3 * 86400_000 + 60_000) }));
  assert(rowOf('dead-old') === undefined, '三天前就死了的记录补写终态后直接退出列表');
  assert(readState('dead-old').status === 'failed', '但磁盘上已是终态');

  // 5. 活着的任务不能被动：身份一致且心跳新鲜
  writeState(detachedRec('alive-fresh', { pid: process.pid, command: selfCommand, heartbeatAt: iso(-1000) }));
  assert(rowOf('alive-fresh')?.state === 'running' && readState('alive-fresh').status === 'running', '身份一致、心跳新鲜 → 保持 running');

  // 6. 进程活着只是心跳过期：仍是 abnormal，不写终态
  writeState(detachedRec('alive-stale', { pid: process.pid, command: selfCommand, heartbeatAt: iso(-600_000) }));
  assert(rowOf('alive-stale')?.state === 'abnormal' && readState('alive-stale').status === 'running', '进程在、心跳过期 → 仍 abnormal，不误杀记录');

  // 7. 监督进程已死但执行进程还在跑：abnormal，留给人 stop
  const orphan = spawn('sleep', ['30'], { stdio: 'ignore' });
  try {
    await new Promise(r => setTimeout(r, 100));
    writeState(detachedRec('orphan-child', { childPid: orphan.pid, childCommand: processCommand(orphan.pid) }));
    assert(rowOf('orphan-child')?.state === 'abnormal' && readState('orphan-child').status === 'running', '执行进程还活着 → 保持 abnormal，不补写终态');
  } finally { orphan.kill('SIGKILL'); }

  // 8. 前台任务 pid.json：已死 / 被复用 → 失败终态；活着不动
  writePidRecord('fg-dead', { pid: deadPid, command: OTHER, model: 'claude-haiku', cwd, startedAt: iso(-3600_000), finished: false });
  writePidRecord('fg-reused', { pid: process.pid, command: OTHER, model: 'claude-haiku', cwd, startedAt: iso(-3600_000), finished: false });
  writePidRecord('fg-alive', { pid: process.pid, command: selfCommand, model: 'claude-haiku', cwd, startedAt: iso(-60_000), finished: false });
  const rows = collectStatus();
  assert(rows.find(r => r.runId === 'fg-dead')?.state === 'failed', '前台任务进程已死 → failed');
  assert(rows.find(r => r.runId === 'fg-reused')?.state === 'failed', '前台任务 pid 被复用 → failed');
  assert(rows.find(r => r.runId === 'fg-alive')?.state === 'running', '前台任务活着 → running');
  const fg = readPidRecord('fg-dead');
  assert(fg.finished === true && fg.verdict === 'fail' && fg.abnormalExit === true && fg.finishedAt === fg.startedAt, '前台 pid.json 终态写盘');

  // 9. 对已死任务执行 stop：记录以 stopped 结束，fleet-go amend 才等得到 stopped
  writeState(detachedRec('stop-dead'));
  const stopped = await stopDetached(readState('stop-dead'));
  assert(stopped.exited === true && stopped.signaled === false, '停止已死任务不发信号');
  assert(readState('stop-dead').status === 'stopped' && readState('stop-dead').verdict === 'stopped', '已死任务被 stop 后记为 stopped');
  assert(detachedState(readState('stop-dead')) === 'stopped', 'detachedState 读到终态');
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
finish();
