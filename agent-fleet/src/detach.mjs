import { takeAsk } from './yield.mjs';
import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runsDir } from './progress.mjs';
import { assertSafeToSignal, isPidAlive, isRecordedProcessAlive, sameCwd, signalProcessTree, processCommand, collectDescendantPids, readPidPpidTable, readPidRecord, writePidRecord } from './pid.mjs';
import { buildBrief, formatBriefHuman, redactEvidence, snapshotGit, inspectGit } from './brief.mjs';
import { recordRun } from './ledger.mjs';
import { registerQueue, acquireSlot, queueRecord, setSlotState, queueEvent, taskIdentity, releaseParentSlot } from './queue.mjs';

const stopPath = (id) => join(runsDir(), `${id}.stop`);
export const statePath = (id) => join(runsDir(), `${id}.json`);
export function writeState(rec) {
  const path = statePath(rec.runId);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`);
  renameSync(tmp, path);
  recordRun(rec); // 到终态才会写账本一行;内部吞掉所有错误,不影响任务
}
export function readState(id) {
  const path = statePath(id);
  if (!existsSync(path)) return null;
  const rec = JSON.parse(readFileSync(path, 'utf8'));
  return rec.detach ? rec : null;
}
export function detachedState(rec) {
  if (rec.status !== 'running') return rec.status;
  return isRecordedProcessAlive(rec.pid, rec.command) && Date.now() - Date.parse(rec.heartbeatAt) < 90_000 ? queueRecord(rec.runId)?.state ?? 'running' : 'abnormal';
}
/**
 * 状态还写着 running,但监督进程和执行进程都已不在(含 pid 被别的进程复用):没人会再写终态了,
 * 由读到它的人补写,之后它按普通终态记录 24 小时后退出 status 列表。
 * 进程还活着只是心跳过期、或监督进程已死但执行进程还在跑,仍是 abnormal(要人处理),不动。
 * status 默认 failed;用户要求停止一个已死任务时传 'stopped'。返回最新记录。
 */
export function reconcileDetached(rec, { status = 'failed', reason } = {}) {
  if (!rec || rec.status !== 'running') return rec;
  if (isRecordedProcessAlive(rec.pid, rec.command)) return rec;
  if (rec.childPid && isRecordedProcessAlive(rec.childPid, rec.childCommand)) return rec;
  const fresh = readState(rec.runId);
  if (!fresh || fresh.status !== 'running') return fresh ?? rec;
  const stopped = status === 'stopped';
  const error = reason ?? `监督进程与执行进程均已不存在，任务异常终止；最后心跳 ${fresh.heartbeatAt}`;
  const finishedAt = Number.isFinite(Date.parse(fresh.heartbeatAt ?? '')) ? fresh.heartbeatAt : new Date().toISOString();
  const next = { ...fresh, status, verdict: stopped ? 'stopped' : 'fail', exitCode: 1, finishedAt, abnormalExit: true, error };
  next.brief = buildBrief({ model: next.model, tier: next.model, ok: false, stopped, error,
    resultPath: next.resultPath, logPath: next.logPath, durationMs: Date.parse(finishedAt) - Date.parse(next.startedAt) });
  try {
    if (next.resultPath && !existsSync(next.resultPath)) writeFileSync(next.resultPath, `${error}\n`);
    if (next.logPath && existsSync(next.logPath)) appendFileSync(next.logPath, `[agent-fleet] done error ${status} (reconciled)\n`);
  } catch { /* 结果/日志文件写不了不影响补写终态 */ }
  writeState(next);
  return next;
}
export function listDetached() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(n => n.endsWith('.json') && !n.endsWith('.pid.json'))
    .map(n => readState(n.slice(0, -5))).filter(Boolean);
}
export function resolveDetached(spec, cwd = process.cwd()) {
  if (spec !== 'latest') {
    const records = listDetached();
    if (records.some(r => r.runId === spec)) return spec;
    const matches = records.filter(r => r.name === spec || r.runId.startsWith(spec) || (spec.startsWith('detach-') && r.runId.endsWith(spec)));
    if (matches.length === 1) return matches[0].runId;
    if (matches.length > 1 && matches.every(r => r.name === spec && (r.model?.startsWith('grok-cli:') || ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'].includes(r.model)))) {
      const active = matches.filter(r => ['running', 'queued', 'parked', 'waiting'].includes(detachedState(r)));
      if (active.length === 1) return active[0].runId;
      if (!active.length) return matches.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0].runId;
    }
    if (matches.length > 1) throw new Error(`任务匹配不唯一 ${spec}；请用完整 runId。`);
    return spec;
  }
  const rec = listDetached().filter(r => sameCwd(r.cwd, cwd))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!rec) throw new Error('当前目录没有 detach 任务。');
  return rec.runId;
}

export async function launchDetached(cli, args, { cwd, model, briefPath, name, reportPath, effort, review = false, auth, actions, noWait = false }) {
  const launcherParent = process.ppid;
  const claudeTool = Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT);
  mkdirSync(runsDir(), { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-detach-${randomUUID().slice(0, 8)}`;
  const base = join(runsDir(), runId);
  const identity = taskIdentity({ briefPath, review, auth, actions });
  const rec = { parentRunId: process.env.FLEET_SLOT_RUN_ID || process.env.FLEET_DETACHED_RUN_ID || null, ...identity, detach: true, runId, status: 'running', pid: null, childPid: null,
    startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), finishedAt: null,
    exitCode: null, verdict: null, briefPath: briefPath ?? null, cwd, model, name: name ?? null, reportPath: reportPath ?? null, fallbackWarning: process.env.FLEET_FALLBACK_WARNING || null,
    ...(effort ? { tier: effort, [effort]: true } : {}),
    resultPath: `${base}.result.md`, logPath: `${base}.log` };
  // 任务参数只经 IPC 传递，避免把 prompt 或认证参数留在进程命令行/状态文件。
  const fd = openSync(rec.logPath, 'a');
  let child;
  try {
    child = spawn(process.execPath, [cli, '__supervise', runId], {
      detached: true, stdio: ['ignore', fd, fd, 'ipc'],
    });
  } finally { closeSync(fd); }
  try { await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      writeFileSync(stopPath(runId), 'stop');
      child.kill('SIGTERM');
      reject(new Error('detach 监督进程启动超时，未退回前台。'));
    }, 15000);
    child.once('error', err => { clearTimeout(timer); reject(err); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`detach 监督进程启动失败 (${code})，见 ${rec.logPath}`)); });
    child.once('message', msg => {
      clearTimeout(timer);
      if (!msg.ready) return reject(new Error(msg.error || 'detach 启动失败'));
      child.unref();
      resolve();
    });
    child.send({ rec, args }, err => {
      if (err) { clearTimeout(timer); reject(err); }
    });
  });
  } catch (err) {
    writeFileSync(stopPath(runId), 'stop');
    child.kill('SIGTERM');
    if (child.connected) child.disconnect();
    child.unref();
    throw err;
  }
  if (noWait || !claudeTool) child.disconnect();
  else {
    const guard = setTimeout(() => {
      if (process.ppid === 1 || process.ppid !== launcherParent) {
        const warning = detachedLaunchWarning(runId);
        process.stderr.write(`${warning}\n`);
        if (child.connected) child.send({ launchDetached: true }, () => {
          if (child.connected) child.disconnect();
        });
      } else if (child.connected) child.disconnect();
    }, 1500);
    guard.unref();
  }
  if (noWait) console.log(`runId: ${runId}\nstatus: ${statePath(runId)}\nresult: ${rec.resultPath}\nlog: ${rec.logPath}`);
  return runId;
}

function detachedLaunchWarning(runId) {
  return `[agent-fleet] runId: ${runId} 检测到脱离启动：命令里可能带了 &/nohup，完成不会通知、任务列表看不到；请另开一条 Bash 用 fleet wait ${runId} 且 run_in_background:true 挂上通知，不要杀掉重派。`;
}

export function killGroup(pid, signal) {
  if (!pid) return;
  // 子孙可能自行建组；先按精确 PID 树收集，再杀执行进程组，不按名字清理。
  if (isPidAlive(pid)) signalProcessTree(pid, signal);
  try { process.kill(-pid, signal); } catch (err) { if (err.code === 'EPERM') console.error(`[agent-fleet] killGroup EPERM ${pid} ${signal}`); else if (err.code !== 'ESRCH') throw err; }
}
export async function supervise(cli) {
  process.on('SIGHUP', () => {});
  let stopping = false;
  let child;
  let rec;
  let timer;
  let killTimer;
  let summary;
  let output;
  let stoppedDescendants = [];
  const forceStop = () => {
    for (const { pid, command } of stoppedDescendants) {
      if (command && processCommand(pid) === command) {
        try { process.kill(pid, 'SIGKILL'); } catch (err) { if (err.code !== 'ESRCH') throw err; }
      }
    }
    killGroup(child?.pid, 'SIGKILL');
  };
  const stop = () => {
    stopping = true;
    if (!child) return;
    if (!stoppedDescendants.length) stoppedDescendants = collectDescendantPids(child.pid, readPidPpidTable())
      .map(pid => ({ pid, command: processCommand(pid) }));
    killGroup(child.pid, 'SIGTERM');
    killTimer ??= setTimeout(forceStop, 1000);
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => {
    if (existsSync(stopPath(process.argv[3]))) stop();
    else console.error(`[agent-fleet] 忽略外部信号 ${signal}`);
  });
  const payload = await new Promise(resolve => process.once('message', resolve));
  rec = { ...payload.rec, pid: process.pid, command: processCommand(process.pid) };
  process.env.FLEET_SLOT_RUN_ID = rec.runId;
  const beat = () => { rec.heartbeatAt = new Date().toISOString(); writeState(rec); };
  beat();
  process.on('message', msg => {
    if (!msg.launchDetached || rec.launchDetached) return;
    rec.launchDetached = true;
    // 执行器输出由监督器串行写入，前插警告不会覆盖并发追加的日志。
    writeFileSync(rec.logPath, `${detachedLaunchWarning(rec.runId)}\n${readFileSync(rec.logPath, 'utf8')}`);
    beat();
  });
  if (existsSync('/usr/bin/caffeinate')) {
    const caffeine = spawn('/usr/bin/caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    caffeine.on('error', err => console.error(`caffeinate: ${err.message}`));
    caffeine.unref();
  }
  timer = setInterval(beat, 30_000);
  try {
    writePidRecord(rec.runId, { pid: rec.pid, command: rec.command, model: rec.model, cwd: rec.cwd,
      startedAt: rec.startedAt, logPath: rec.logPath, finished: false });
    await registerQueue(rec);
    const admitted = await acquireSlot(rec.runId);
    if (!admitted) {
      appendFileSync(rec.logPath, queueEvent('queued'));
      process.send?.({ ready: true });
    }
    while (!stopping && !(await acquireSlot(rec.runId))) await new Promise(r => setTimeout(r, 250));
    if (stopping) throw new Error('排队任务已停止。');
    if (!admitted) appendFileSync(rec.logPath, queueEvent('wake'));
    child = spawn(process.execPath, [cli, ...payload.args], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, FLEET_DETACHED_RUN_ID: rec.runId, FLEET_SLOT_RUN_ID: rec.runId, FLEET_PARENT_RUN_ID: rec.parentRunId || '', FLEET_DETACHED_BATCH: payload.args[0] === 'run-many' ? '1' : '' },
    });
    child.stdout.on('data', chunk => appendFileSync(rec.logPath, chunk));
    rec.stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { const text = redactEvidence(chunk.toString()); rec.stderr += text; appendFileSync(rec.logPath, text); });
    child.on('message', msg => {
      if (msg.brief) {
        summary = msg.brief;
        if (!Array.isArray(summary)) {
          rec.model = summary.model ?? rec.model;
        }
      }
      if (msg.grokMetadata || msg.codexMetadata) {
        Object.assign(rec, msg.grokMetadata ?? msg.codexMetadata);
        beat();
      }
      if (msg.output !== undefined) output = msg.output;
      if (msg.resultText !== undefined) writeFileSync(rec.resultPath, msg.resultText);
    });
    const outcome = new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    rec.childPid = child.pid;
    rec.childCommand = processCommand(child.pid);
    beat();
    if (admitted) process.send?.({ ready: true });
    if (stopping) stop();
    const { code, signal } = await outcome;
    // 执行器退出也清掉它留下的进程组/子孙，终态不留下后台子任务。
    forceStop();
    rec.brief = summary ?? buildBrief({ ...failureFacts(rec), ok: false, progress: { phase: '执行进程结束', exitCode: code, signal }, error: `执行进程退出 ${code ?? signal}`,
      durationMs: Date.now() - Date.parse(rec.startedAt), resultPath: rec.resultPath, logPath: rec.logPath });
    rec.output = output;
    if (stopping) rec.brief = { ...rec.brief, ok: false, verdict: 'stopped', stopped: true };
    rec.verdict = Array.isArray(rec.brief) ? rec.brief.every(b => b.verdict === 'ok') ? 'ok' : 'fail' : rec.brief.verdict;
    rec.exitCode = rec.verdict === 'ok' ? 0 : 1;
    rec.status = stopping ? 'stopped' : rec.yield?.type === 'blocked' ? 'blocked' : rec.verdict === 'ok' ? 'done' : 'failed';
  } catch (err) {
    if (child?.pid) forceStop();
    rec.status = stopping ? 'stopped' : 'failed';
    rec.verdict = stopping ? 'stopped' : 'fail';
    rec.exitCode = 1;
    rec.error = redactEvidence(err.message);
    if (process.connected) process.send({ ready: false, error: rec.error });
    rec.brief = buildBrief({ ...failureFacts(rec), ok: false, error: rec.error, progress: { phase: '监督进程' }, resultPath: rec.resultPath, logPath: rec.logPath });
    console.error(rec.error);
  } finally {
    clearInterval(timer);
    clearTimeout(killTimer);
    rec.finishedAt = new Date().toISOString();
    if (!existsSync(rec.resultPath)) writeFileSync(rec.resultPath, rec.error ?? '任务被停止，未生成结果。\n');
    if (!summary && rec.brief?.failureReport) writeFileSync(rec.resultPath, `${redactEvidence(readFileSync(rec.resultPath, 'utf8'))}\n\n## 失败事实\n${JSON.stringify(rec.brief.failureReport, null, 2)}\n`);
    if (rec.fallbackWarning) appendFileSync(rec.resultPath, `\n${rec.fallbackWarning}\n`);
    beat();
    await setSlotState(rec.runId, rec.status);
    appendFileSync(rec.logPath, `[agent-fleet] done ${rec.status === 'done' ? 'ok' : 'error'}\n`);
    if (process.connected) process.disconnect();
  }
}

function failureFacts(rec) {
  return { model: rec.model, tier: rec.brief?.failureReport?.tier ?? rec.model, stderr: rec.stderr,
    resultPath: rec.resultPath, logPath: rec.logPath,
    ...inspectGit(rec.cwd, snapshotGit(rec.cwd)) };
}

export async function waitDetached(spec, { cwd, timeout, originalOutput = false } = {}) {
  const resume = await releaseParentSlot();
  try {
  const id = resolveDetached(spec, cwd);
  const started = Date.now();
  for (;;) {
    const rec = reconcileDetached(readState(id));
    if (!rec) throw new Error(`找不到 detach 任务 ${id}`);
    const state = detachedState(rec);
    const question = takeAsk(id);
    if (question) { process.stdout.write(JSON.stringify(question) + '\n'); return 3; }
    if (!['running', 'queued', 'parked', 'waiting'].includes(state)) {
      const brief = state === 'abnormal' ? buildBrief({ ...failureFacts(rec), ok: false,
        error: `异常终止；最后心跳 ${rec.heartbeatAt}`, resultPath: rec.resultPath, logPath: rec.logPath })
        : rec.brief ?? buildBrief({ ...failureFacts(rec), ok: false, stopped: state === 'stopped', error: rec.error,
          resultPath: rec.resultPath, logPath: rec.logPath });
      if (originalOutput && rec.stderr) process.stderr.write(rec.stderr);
      process.stdout.write(originalOutput && rec.output !== undefined && !['abnormal', 'stopped'].includes(state) ? rec.output : Array.isArray(brief) ? brief.map((b, i) => `--- task ${i + 1} ${b.model ?? ''} ---\n${formatBriefHuman(b)}`).join('\n') : formatBriefHuman(brief));
      if ((!originalOutput || rec.output === undefined || ['abnormal', 'stopped'].includes(state)) && brief.costSource) process.stdout.write(`费用来源：${brief.costSource}\n`);
      if ((!originalOutput || rec.output === undefined || ['abnormal', 'stopped'].includes(state)) && ['gpt-6.1-sol', 'gpt-6.1-terra', 'gpt-6-luna'].includes(rec.model)) {
        process.stdout.write(`Codex：steer ${brief.steerCount ?? rec.steerCount ?? 0} 次，resume ${brief.resumeCount ?? rec.resumeCount ?? 0} 次，降级 ${(brief.fallbacks ?? rec.fallbacks)?.length ?? 0} 次\n`);
      }
      return (Array.isArray(brief) ? brief.every(b => b.verdict === 'ok') : brief.verdict === 'ok') ? 0 : rec.exitCode || 1;
    }
    if (timeout !== undefined && Date.now() - started >= Number(timeout) * 1000) throw new Error(`等待 ${id} 超时；任务继续运行。`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  } finally { await resume(); }
}

export async function stopDetached(rec) {
  if (!isRecordedProcessAlive(rec.pid, rec.command)) {
    if (rec.status !== 'running' || !isRecordedProcessAlive(rec.childPid, rec.childCommand)) {
      reconcileDetached(rec, { status: 'stopped', reason: '收到停止请求时监督进程与执行进程均已不存在；按停止结束记录' });
      return { runId: rec.runId, signaled: false, exited: true };
    }
    const worker = readPidRecord(rec.runId);
    const record = worker?.pid === rec.childPid ? worker : { pid: rec.childPid, command: rec.childCommand };
    if (!record.command) throw new Error('监督进程已死，缺少执行器身份记录，拒绝误杀。');
    const check = assertSafeToSignal(record);
    if (!check.ok) throw new Error(check.reason);
    const descendants = collectDescendantPids(rec.childPid, readPidPpidTable()).map(pid => ({ pid, command: processCommand(pid) }));
    killGroup(rec.childPid, 'SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
    for (const { pid, command } of descendants) {
      if (command && processCommand(pid) === command) {
        try { process.kill(pid, 'SIGKILL'); } catch (err) { if (err.code !== 'ESRCH') throw err; }
      }
    }
    if (isPidAlive(rec.childPid) && !assertSafeToSignal(record).ok) throw new Error('执行器身份已变化，拒绝误杀。');
    killGroup(rec.childPid, 'SIGKILL');
    rec.status = 'stopped'; rec.verdict = 'stopped'; rec.exitCode = 1;
    rec.finishedAt = new Date().toISOString();
    rec.brief = buildBrief({ ...failureFacts(rec), ok: false, stopped: true, error: '监督进程异常退出后停止执行器',
      resultPath: rec.resultPath, logPath: rec.logPath, durationMs: Date.now() - Date.parse(rec.startedAt) });
    const body = existsSync(rec.resultPath) ? readFileSync(rec.resultPath, 'utf8') : '监督进程异常退出后停止任务，未生成结果。\n';
    writeFileSync(rec.resultPath, `${redactEvidence(body)}\n\n## 失败事实\n${JSON.stringify(rec.brief.failureReport, null, 2)}\n`);
    writeState(rec);
    appendFileSync(rec.logPath, '[agent-fleet] done error stopped\n');
    return { runId: rec.runId, signaled: true, exited: !isPidAlive(rec.childPid) };
  }
  if (rec.status !== 'running') return { runId: rec.runId, signaled: false, exited: !isPidAlive(rec.pid) };
  const check = assertSafeToSignal(rec);
  if (!check.ok) throw new Error(check.reason);
  writeFileSync(stopPath(rec.runId), 'stop');
  process.kill(rec.pid, 'SIGTERM');
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline && isPidAlive(rec.pid)) await new Promise(resolve => setTimeout(resolve, 100));
  if (isPidAlive(rec.pid)) {
    const again = assertSafeToSignal(rec);
    if (!again.ok) throw new Error(again.reason);
    killGroup(rec.childPid, 'SIGKILL');
    process.kill(-rec.pid, 'SIGKILL');
  }
  return { runId: rec.runId, signaled: true, exited: !isPidAlive(rec.pid) };
}
