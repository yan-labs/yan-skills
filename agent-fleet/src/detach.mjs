import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runsDir } from './progress.mjs';
import { assertSafeToSignal, isPidAlive, sameCwd, signalProcessTree, processCommand, collectDescendantPids, readPidPpidTable, readPidRecord, writePidRecord } from './pid.mjs';
import { buildBrief, formatBriefHuman, redactEvidence, snapshotGit, inspectGit } from './brief.mjs';

export const statePath = (id) => join(runsDir(), `${id}.json`);
export function writeState(rec) {
  const path = statePath(rec.runId);
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(rec, null, 2)}\n`);
  renameSync(tmp, path);
}
export function readState(id) {
  const path = statePath(id);
  if (!existsSync(path)) return null;
  const rec = JSON.parse(readFileSync(path, 'utf8'));
  return rec.detach ? rec : null;
}
export function detachedState(rec) {
  if (rec.status !== 'running') return rec.status;
  return isPidAlive(rec.pid) && Date.now() - Date.parse(rec.heartbeatAt) < 90_000 ? 'running' : 'abnormal';
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
    const matches = records.filter(r => r.name === spec || r.runId.startsWith(spec));
    if (matches.length === 1) return matches[0].runId;
    if (matches.length > 1) throw new Error(`任务匹配不唯一 ${spec}；请用完整 runId。`);
    return spec;
  }
  const rec = listDetached().filter(r => sameCwd(r.cwd, cwd))
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  if (!rec) throw new Error('当前目录没有 detach 任务。');
  return rec.runId;
}

export async function launchDetached(cli, args, { cwd, model, briefPath, name, reportPath, noWait = false }) {
  const launcherParent = process.ppid;
  const claudeTool = Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT);
  mkdirSync(runsDir(), { recursive: true });
  const runId = `${new Date().toISOString().replace(/[:.]/g, '-')}-detach-${randomUUID().slice(0, 8)}`;
  const base = join(runsDir(), runId);
  const rec = { detach: true, runId, status: 'running', pid: null, childPid: null,
    startedAt: new Date().toISOString(), heartbeatAt: new Date().toISOString(), finishedAt: null,
    exitCode: null, verdict: null, briefPath: briefPath ?? null, cwd, model, name: name ?? null, reportPath: reportPath ?? null,
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
      child.kill('SIGTERM');
      reject(new Error('detach 监督进程启动超时，未退回前台。'));
    }, 1500);
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

function killGroup(pid, signal) {
  if (!pid) return;
  // 子孙可能自行建组；先按精确 PID 树收集，再杀执行进程组，不按名字清理。
  if (isPidAlive(pid)) signalProcessTree(pid, signal);
  try { process.kill(-pid, signal); } catch (err) { if (err.code !== 'ESRCH') throw err; }
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
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
  const payload = await new Promise(resolve => process.once('message', resolve));
  rec = { ...payload.rec, pid: process.pid, command: processCommand(process.pid) };
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
    child = spawn(process.execPath, [cli, ...payload.args], {
      detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, FLEET_DETACHED_RUN_ID: rec.runId, FLEET_DETACHED_BATCH: payload.args[0] === 'run-many' ? '1' : '' },
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
    process.send?.({ ready: true });
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
    rec.status = stopping ? 'stopped' : rec.verdict === 'ok' ? 'done' : 'failed';
  } catch (err) {
    if (child?.pid) forceStop();
    rec.status = stopping ? 'stopped' : 'failed';
    rec.verdict = stopping ? 'stopped' : 'fail';
    rec.exitCode = 1;
    rec.error = redactEvidence(err.message);
    rec.brief = buildBrief({ ...failureFacts(rec), ok: false, error: rec.error, progress: { phase: '监督进程' }, resultPath: rec.resultPath, logPath: rec.logPath });
    console.error(rec.error);
  } finally {
    clearInterval(timer);
    clearTimeout(killTimer);
    rec.finishedAt = new Date().toISOString();
    if (!existsSync(rec.resultPath)) writeFileSync(rec.resultPath, rec.error ?? '任务被停止，未生成结果。\n');
    if (!summary && rec.brief?.failureReport) writeFileSync(rec.resultPath, `${redactEvidence(readFileSync(rec.resultPath, 'utf8'))}\n\n## 失败事实\n${JSON.stringify(rec.brief.failureReport, null, 2)}\n`);
    beat();
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
  const id = resolveDetached(spec, cwd);
  const started = Date.now();
  for (;;) {
    const rec = readState(id);
    if (!rec) throw new Error(`找不到 detach 任务 ${id}`);
    const state = detachedState(rec);
    if (state !== 'running') {
      const brief = state === 'abnormal' ? buildBrief({ ...failureFacts(rec), ok: false,
        error: `异常终止；最后心跳 ${rec.heartbeatAt}`, resultPath: rec.resultPath, logPath: rec.logPath })
        : rec.brief ?? buildBrief({ ...failureFacts(rec), ok: false, stopped: state === 'stopped', error: rec.error,
          resultPath: rec.resultPath, logPath: rec.logPath });
      if (originalOutput && rec.stderr) process.stderr.write(rec.stderr);
      process.stdout.write(originalOutput && rec.output !== undefined && !['abnormal', 'stopped'].includes(state) ? rec.output : Array.isArray(brief) ? brief.map((b, i) => `--- task ${i + 1} ${b.model ?? ''} ---\n${formatBriefHuman(b)}`).join('\n') : formatBriefHuman(brief));
      return (Array.isArray(brief) ? brief.every(b => b.verdict === 'ok') : brief.verdict === 'ok') ? 0 : rec.exitCode || 1;
    }
    if (timeout !== undefined && Date.now() - started >= Number(timeout) * 1000) throw new Error(`等待 ${id} 超时；任务继续运行。`);
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

export async function stopDetached(rec) {
  if (!isPidAlive(rec.pid)) {
    if (rec.status !== 'running' || !isPidAlive(rec.childPid)) return { runId: rec.runId, signaled: false, exited: true };
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
