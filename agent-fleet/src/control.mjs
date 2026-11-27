import { pendingFor } from './requests.mjs';
import { isCodexModel } from './model-family.mjs';
// status / say / stop 的控制面。只按 pid.json 里的 pid 操作,绝不 pkill/killall。

import { existsSync, readFileSync } from 'node:fs';
import { detachedState, listDetached, readState, reconcileDetached, resolveDetached, stopDetached } from './detach.mjs';
import { queueRecord } from './queue.mjs';
import { appendInbox } from './inbox.mjs';
import {
  assertSafeToSignal,
  finalizeDeadPidRecord,
  isRecordedProcessAlive,
  listAllPidRecords,
  patchPidRecord,
  readPidRecord,
  resolveRunId,
  sameCwd,
  prefetchProcessCommands,
  signalProcessTree,
  withProcessSnapshot,
} from './pid.mjs';

function formatDuration(startedAt, finishedAt) {
  const t = Date.parse(startedAt ?? '');
  if (!Number.isFinite(t)) return '?';
  const sec = Math.max(0, Math.floor(((Date.parse(finishedAt) || Date.now()) - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m${s}s`;
}

/** active 为真时只返回仍在跑/排队/停靠/等待/异常的行,不为已结束的任务读日志、不拼行(status --running 的快路径)。 */
export function collectStatus({ cwd, onDetached, active = false } = {}) {
  return withProcessSnapshot(() => scanStatus({ cwd, onDetached, active }));
}

function scanStatus({ cwd, onDetached, active }) {
  const rows = [];
  const detached = listDetached({ indexed: true });
  onDetached?.(detached);
  const pidRecords = listAllPidRecords({ indexed: true });
  // 仍显示运行中的记录,一次 ps 取齐它们的 command,避免逐个 ps(几十次进程启动)。
  prefetchProcessCommands([...detached.filter(r => r.status === 'running').flatMap(r => [r.pid, r.childPid]), ...pidRecords.filter(r => !r.finished).map(r => r.pid)]);
  for (const listed of detached) {
    if (cwd && !sameCwd(listed.cwd, cwd)) continue;
    const rec = reconcileDetached(listed);
    const state = detachedState(rec);
    const live = ['running', 'queued', 'parked', 'waiting', 'abnormal'].includes(state);
    if (!live && (active || Date.now() - Date.parse(rec.finishedAt) > 86_400_000)) continue;
    rows.push({ ...rec, status: state, state, duration: formatDuration(rec.startedAt, rec.finishedAt) });
  }
  const detachedIds = new Set(detached.map(d => d.runId));
  for (const listed of pidRecords) {
    let parent = listed.runId;
    while (!detachedIds.has(parent) && parent.includes('-task-')) parent = parent.slice(0, parent.lastIndexOf('-task-'));
    if (detachedIds.has(parent)) continue;
    if (cwd && !sameCwd(listed.cwd, cwd)) continue;
    let rec = listed;
    if (!rec.finished && !isRecordedProcessAlive(rec.pid, rec.command)) {
      rec = { ...rec, ...finalizeDeadPidRecord(rec.runId, rec) };
    }
    if (rec.finished && (active || Date.now() - Date.parse(rec.finishedAt ?? rec.startedAt) > 86_400_000)) continue;
    let state = rec.slotRunId && queueRecord(rec.slotRunId)?.state === 'parked' ? 'parked' : 'running';
    if (rec.finished) {
      const log = rec.logPath && existsSync(rec.logPath) ? readFileSync(rec.logPath, 'utf8') : '';
      state = rec.verdict ? rec.verdict === 'ok' ? 'done' : 'failed' : /\] done error/.test(log) ? 'failed' : 'done';
    }
    rows.push({
      runId: rec.runId,
      name: rec.name ?? null, reportPath: rec.reportPath ?? null, heartbeatAt: rec.heartbeatAt ?? null, status: state,
      model: rec.model ?? '?',
      pid: rec.pid,
      cwd: rec.cwd ?? '',
      startedAt: rec.startedAt ?? null,
      duration: formatDuration(rec.startedAt, rec.finishedAt),
      state,
      logPath: rec.logPath ?? null,
      activeMs: rec.activeMs, waitMs: rec.waitMs, pollCount: rec.pollCount,
      ...(isCodexModel(rec.model) ? { backend: rec.backend, threadId: rec.threadId, sessionId: rec.sessionId,
        steerCount: rec.steerCount, resumeCount: rec.resumeCount, fallbacks: rec.fallbacks,
        low: rec.low, high: rec.high, xhigh: rec.xhigh, max: rec.max, simple: rec.simple, sol: rec.sol, luna: rec.luna, astra: rec.astra, serviceTier: rec.serviceTier, review: rec.review, resumedFrom: rec.resumedFrom } : {}),
    });
  }
  rows.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  return rows;
}

export function formatStatusHuman(rows) {
  if (rows.length === 0) return '没有运行中的任务。\n';
  const lines = rows.map((r) => {
    const line = `${r.runId}  ${r.name ?? '(无短名)'}  ${r.model}  ${r.state}  ${r.duration}  cwd=${r.cwd}  report=${r.reportPath ?? '(无)'}  最后心跳=${r.heartbeatAt ?? '(无)'}`;
    if (r.state !== 'abnormal' && !r.abnormalExit) return line;
    const interrupted = Date.parse(r.heartbeatAt) < Date.parse(r.startedAt) + 600_000;
    return `${line}  异常终止（可能被外部信号杀掉）${interrupted ? `；可能因机器重启/强制休眠中断，可用 fleet resume ${r.runId}` : ''}`;
  });
  return `${lines.join('\n')}\n`;
}

/** say 以 detach 的监督状态判断存活，收件箱始终绑定精确 runId。 */
export function deliverSay(spec, text, { cwd, askId } = {}) {
  if (!text) throw new Error('缺少消息。用法: agent-fleet say <run-id|latest> "<消息>"');
  const selected = spec === 'latest' ? collectStatus({ cwd: cwd ?? process.cwd() }).find(row => ['running', 'parked', 'waiting'].includes(row.state))?.runId : spec;
  const runId = resolveRunId(selected && selected !== 'latest' ? resolveDetached(selected, cwd) : spec, cwd);
  let rec = readPidRecord(runId);
  const detached = readState(runId);
  if (detached?.status === 'running') {
    if (!['running', 'parked', 'waiting'].includes(detachedState(detached))) throw new Error(`任务 ${runId} 的监督器已退出或心跳超时，无法确认插话通道可用。`);
    if (!isRecordedProcessAlive(detached.childPid, detached.childCommand)) throw new Error(`任务 ${runId} 的监督器仍在运行，但执行器尚未就绪或已退出，无法投递插话。`);
    // 嵌套 fleet 的历史记录可能覆盖 finished/pid；真正监听此收件箱的是监督器的执行子进程。
    rec = { ...rec, ...detached, pid: detached.childPid, command: detached.childCommand, finished: false };
  }
  if (!rec) throw new Error(`找不到任务 ${runId} 的 pid.json`);
  if (rec.model?.startsWith('grok-cli:') && !rec.sessionId) throw new Error('Grok CLI 尚未提供 sessionId，暂不支持 fleet say；当前任务继续运行。');
  const codex = isCodexModel(rec.model);
  if (codex && !['codex-app-server', 'codex-exec'].includes(rec.backend) && !rec.threadId && !rec.sessionId) {
    throw new Error('Codex 任务不支持 fleet say（当前没有可续跑的会话）；改方向请用 fleet-go amend --restart。');
  }
  if (rec.finished || !isRecordedProcessAlive(rec.pid, rec.command)) {
    throw new Error(`任务 ${runId} 已不在运行,无法投递插话。`);
  }
  if (askId && !pendingFor(runId).some(a => a.id === askId && a.kind !== 'review')) throw new Error('找不到该未答信号 ID。');
  appendInbox(runId, { type: 'say', text, askId });
  return { runId, delivered: true, mode: codex ? rec.backend === 'codex-app-server' && !rec.resumeBlocked ? 'steer' : 'resume' : undefined };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 先投递 stop 到收件箱;宽限期后若仍在,校验 pid 再 SIGTERM,再 5 秒 SIGKILL。
 * 共享同一个 pid 的其它未结束任务存在时不发信号(run-many 同进程),只靠 inbox + interrupt。
 */
export async function requestStop(spec, { grace = 60, sleepFn = sleep, cwd } = {}) {
  const runId = resolveRunId(spec !== 'latest' ? resolveDetached(spec, cwd) : spec, cwd);
  const detached = readState(runId);
  if (detached) return stopDetached(detached);
  const rec = readPidRecord(runId);
  if (!rec) throw new Error(`找不到任务 ${runId} 的 pid.json`);
  const graceSec = Number.isFinite(Number(grace)) ? Math.max(0, Number(grace)) : 60;

  appendInbox(runId, { type: 'stop', text: '', grace: graceSec });
  patchPidRecord(runId, { stopRequested: true });

  const deadline = Date.now() + graceSec * 1000;
  while (Date.now() < deadline) {
    const latest = readPidRecord(runId);
    if (!latest || latest.finished || !isRecordedProcessAlive(latest.pid, latest.command)) {
      return { runId, delivered: true, signaled: false, exited: true };
    }
    await sleepFn(200);
  }

  const latest = readPidRecord(runId);
  if (!latest || latest.finished || !isRecordedProcessAlive(latest.pid, latest.command)) {
    return { runId, delivered: true, signaled: false, exited: true };
  }

  const others = listAllPidRecords().filter(
    (r) => r.runId !== runId && !r.finished && r.pid === latest.pid && isRecordedProcessAlive(r.pid, r.command),
  );
  if (others.length > 0) {
    return {
      runId,
      delivered: true,
      signaled: false,
      exited: false,
      skippedSignal: `pid ${latest.pid} 还被其它任务占用(${others.map((r) => r.runId).join(', ')}),不发 SIGTERM`,
    };
  }

  const check = assertSafeToSignal(latest);
  if (!check.ok) {
    return { runId, delivered: true, signaled: false, exited: false, skippedSignal: check.reason };
  }

  patchPidRecord(runId, { stopSignal: true });
  signalProcessTree(latest.pid, 'SIGTERM');
  await sleepFn(5000);
  if (isRecordedProcessAlive(latest.pid, latest.command)) {
    const again = assertSafeToSignal(readPidRecord(runId) ?? latest);
    if (again.ok) signalProcessTree(latest.pid, 'SIGKILL');
  }
  return {
    runId,
    delivered: true,
    signaled: true,
    exited: !isRecordedProcessAlive(latest.pid, latest.command),
  };
}
