// status / say / stop 的控制面。只按 pid.json 里的 pid 操作,绝不 pkill/killall。

import { existsSync, readFileSync } from 'node:fs';
import { detachedState, listDetached, readState, resolveDetached, stopDetached } from './detach.mjs';
import { appendInbox } from './inbox.mjs';
import {
  assertSafeToSignal,
  isPidAlive,
  listAllPidRecords,
  patchPidRecord,
  readPidRecord,
  resolveRunId,
  sameCwd,
  signalProcessTree,
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

export function collectStatus({ cwd } = {}) {
  const rows = [];
  const detached = listDetached();
  for (const rec of detached) {
    if (cwd && !sameCwd(rec.cwd, cwd)) continue;
    const state = detachedState(rec);
    if (!['running', 'abnormal'].includes(state) && Date.now() - Date.parse(rec.finishedAt) > 86_400_000) continue;
    rows.push({ ...rec, status: state, state, duration: formatDuration(rec.startedAt, rec.finishedAt) });
  }
  for (const rec of listAllPidRecords()) {
    if (detached.some(d => d.runId === rec.runId || rec.runId.startsWith(`${d.runId}-task-`))) continue;
    if (cwd && !sameCwd(rec.cwd, cwd)) continue;
    const alive = isPidAlive(rec.pid);
    if (rec.finished && Date.now() - Date.parse(rec.finishedAt ?? rec.startedAt) > 86_400_000) continue;
    let state = 'running';
    if (!alive && !rec.finished) state = 'abnormal';
    else if (rec.finished) {
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
      ...(rec.model === 'gpt-6.1-sol' ? { backend: rec.backend, threadId: rec.threadId, sessionId: rec.sessionId,
        steerCount: rec.steerCount, resumeCount: rec.resumeCount, fallbacks: rec.fallbacks,
        low: rec.low, review: rec.review, resumedFrom: rec.resumedFrom } : {}),
    });
  }
  rows.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')));
  return rows;
}

export function formatStatusHuman(rows) {
  if (rows.length === 0) return '没有运行中的任务。\n';
  const lines = rows.map((r) => {
    const line = `${r.runId}  ${r.name ?? '(无短名)'}  ${r.model}  ${r.state}  ${r.duration}  cwd=${r.cwd}  report=${r.reportPath ?? '(无)'}  最后心跳=${r.heartbeatAt ?? '(无)'}`;
    if (r.state !== 'abnormal') return line;
    const interrupted = Date.parse(r.heartbeatAt) < Date.parse(r.startedAt) + 600_000;
    return `${line}  异常终止（可能被外部信号杀掉）${interrupted ? `；可能因机器重启/强制休眠中断，可用 fleet resume ${r.runId}` : ''}`;
  });
  return `${lines.join('\n')}\n`;
}

export function deliverSay(spec, text, { cwd } = {}) {
  if (!text) throw new Error('缺少消息。用法: agent-fleet say <run-id|latest> "<消息>"');
  const runId = resolveRunId(spec && spec !== 'latest' ? resolveDetached(spec, cwd) : spec, cwd);
  const rec = readPidRecord(runId);
  if (!rec) throw new Error(`找不到任务 ${runId} 的 pid.json`);
  if (rec.model?.startsWith('grok-cli:') && !rec.sessionId) throw new Error('Grok CLI 尚未提供 sessionId，暂不支持 fleet say；当前任务继续运行。');
  const codex = rec.model === 'gpt-6.1-sol';
  if (codex && rec.backend !== 'codex-app-server' && !rec.threadId && !rec.sessionId) {
    throw new Error('Codex 任务不支持 fleet say（当前没有可续跑的会话）；改方向请用 fleet-go amend --restart。');
  }
  if (rec.finished || !isPidAlive(rec.pid)) {
    throw new Error(`任务 ${runId} 已不在运行,无法投递插话。`);
  }
  appendInbox(runId, { type: 'say', text });
  return { runId, delivered: true, mode: codex ? rec.backend === 'codex-app-server' ? 'steer' : 'resume' : undefined };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 先投递 stop 到收件箱;宽限期后若仍在,校验 pid 再 SIGTERM,再 5 秒 SIGKILL。
 * 共享同一个 pid 的其它未结束任务存在时不发信号(run-many 同进程),只靠 inbox + interrupt。
 */
export async function requestStop(spec, { grace = 60, sleepFn = sleep, cwd } = {}) {
  const runId = resolveRunId(spec, cwd);
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
    if (!latest || latest.finished || !isPidAlive(latest.pid)) {
      return { runId, delivered: true, signaled: false, exited: true };
    }
    await sleepFn(200);
  }

  const latest = readPidRecord(runId);
  if (!latest || latest.finished || !isPidAlive(latest.pid)) {
    return { runId, delivered: true, signaled: false, exited: true };
  }

  const others = listAllPidRecords().filter(
    (r) => r.runId !== runId && !r.finished && r.pid === latest.pid && isPidAlive(r.pid),
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
  if (isPidAlive(latest.pid)) {
    const again = assertSafeToSignal(readPidRecord(runId) ?? latest);
    if (again.ok) signalProcessTree(latest.pid, 'SIGKILL');
  }
  return {
    runId,
    delivered: true,
    signaled: true,
    exited: !isPidAlive(latest.pid),
  };
}
