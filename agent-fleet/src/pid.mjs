// 运行中任务的 pid.json:启动时写入,sessionId 拿到后补写,正常结束标 finished。
// 发信号前必须校验:pid 来自该文件,且 ps command 含 agent-fleet 且与记录一致。
// 只按 pid 树杀,绝不按名字批量杀。

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import { runsDir } from './progress.mjs';

export function pidPath(runId) {
  return join(runsDir(), `${runId}.pid.json`);
}

export function runIdFromLogPath(logPath) {
  if (!logPath) return null;
  const base = String(logPath).split(/[/\\]/).pop() ?? '';
  return base.endsWith('.log') ? base.slice(0, -4) : base;
}

export function readPidRecord(runId) {
  const path = pidPath(runId);
  if (!existsSync(path)) return null;
  try {
    const rec = JSON.parse(readFileSync(path, 'utf8'));
    return rec && typeof rec === 'object' ? rec : null;
  } catch {
    return null;
  }
}

export function writePidRecord(runId, rec) {
  if (process.env.FLEET_SLOT_RUN_ID) rec = { ...rec, slotRunId: process.env.FLEET_SLOT_RUN_ID };
  writeFileSync(pidPath(runId), `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

export function patchPidRecord(runId, patch) {
  const current = readPidRecord(runId) ?? {};
  return writePidRecord(runId, { ...current, ...patch });
}

/** 当前进程的 command 行,写进 pid.json 供 stop 时对照。 */
export function processCommand(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

export function isPidAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * pid 存活且仍是记录里的那个进程。只看 kill -0 会把「pid 被系统复用给别的进程」当成任务还活着,
 * 所以记录里存了启动时 command 的,要求当前 command 与之一致(监督进程的 command 带 runId,复用后不会重名)。
 * 只有拿到「进程已不存在」或「command 明确不同」的证据才判死:EPERM(进程存在但无权发信号)、
 * ps 读不到 command 都按存活处理,避免在受限环境里把活任务误判成已死再补写终态。
 * 旧记录没有 command 时退回只看存活。
 */
export function isRecordedProcessAlive(pid, command) {
  const n = Number(pid);
  if (!pid || !Number.isFinite(n)) return false;
  try {
    process.kill(n, 0);
  } catch (err) {
    if (err.code !== 'EPERM') return false;
  }
  if (!command) return true;
  const current = processCommand(n);
  return !current || current === command;
}

/** 前台任务的 pid.json 已无对应进程却没写终态:补写成失败终态(最后心跳/启动时间作为结束时间),让它按普通终态 24 小时后退出列表。 */
export function finalizeDeadPidRecord(runId, rec) {
  const valid = (t) => Number.isFinite(Date.parse(t ?? ''));
  const finishedAt = valid(rec.heartbeatAt) ? rec.heartbeatAt : valid(rec.startedAt) ? rec.startedAt : new Date().toISOString();
  return patchPidRecord(runId, { finished: true, finishedAt, verdict: 'fail', abnormalExit: true });
}

export function commandLooksLikeAgentFleet(cmd) {
  const s = String(cmd ?? '');
  return s.includes('agent-fleet');
}

/**
 * 发信号前的硬校验。不通过就绝不能 kill。
 * @returns {{ ok: true, cmd: string } | { ok: false, reason: string }}
 */
export function assertSafeToSignal(record) {
  if (!record?.pid) return { ok: false, reason: 'pid.json 没有 pid' };
  const cmd = processCommand(record.pid);
  if (!cmd) return { ok: false, reason: `pid ${record.pid} 不存在` };
  if (!commandLooksLikeAgentFleet(cmd)) {
    return { ok: false, reason: `pid ${record.pid} 的 command 不含 agent-fleet,拒绝发信号` };
  }
  if (record.command && cmd !== record.command) {
    return { ok: false, reason: `pid ${record.pid} 的 command 与 pid.json 记录不一致,拒绝发信号` };
  }
  return { ok: true, cmd };
}

/**
 * 解析 `ps -ax -o pid=,ppid=` 风格的表格。纯函数,单测不需要真起进程。
 * @param {string} text
 * @returns {Array<{ pid: number, ppid: number }>}
 */
export function parsePidPpidTable(text) {
  const rows = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)$/);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]) });
  }
  return rows;
}

/**
 * 从根 pid 出发,按 ppid 递归收集所有子孙(不含根自身)。
 * @param {number} rootPid
 * @param {Array<{ pid: number, ppid: number }>} rows
 * @returns {number[]}
 */
export function collectDescendantPids(rootPid, rows) {
  const children = new Map();
  for (const r of rows) {
    if (!children.has(r.ppid)) children.set(r.ppid, []);
    children.get(r.ppid).push(r.pid);
  }
  const out = [];
  const stack = [...(children.get(Number(rootPid)) ?? [])];
  const seen = new Set();
  while (stack.length) {
    const id = stack.pop();
    if (seen.has(id) || id === Number(rootPid)) continue;
    seen.add(id);
    out.push(id);
    for (const c of children.get(id) ?? []) stack.push(c);
  }
  return out;
}

export function readPidPpidTable() {
  const out = execFileSync('ps', ['-ax', '-o', 'pid=,ppid='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parsePidPpidTable(out);
}

/**
 * 只向该 pid 及其子孙发 signal。子孙先、根后,避免父进程被杀后丢树。
 * 绝不按进程名杀。
 */
export function signalProcessTree(rootPid, signal) {
  const root = Number(rootPid);
  const desc = collectDescendantPids(root, readPidPpidTable());
  const sent = [];
  for (const pid of [...desc, root]) {
    try {
      process.kill(pid, signal);
      sent.push(pid);
    } catch {
      /* 进程已退出 */
    }
  }
  return sent;
}

export function listPidFilenames() {
  const dir = runsDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((name) => name.endsWith('.pid.json'));
}

export function runIdFromPidFilename(name) {
  return name.endsWith('.pid.json') ? name.slice(0, -'.pid.json'.length) : name;
}

export function listAllPidRecords() {
  const out = [];
  for (const name of listPidFilenames()) {
    const runId = runIdFromPidFilename(name);
    const rec = readPidRecord(runId);
    if (rec) out.push({ runId, ...rec });
  }
  return out;
}

/** realpath 规范化 cwd,目录不存在时退回 resolve,保证同路径不同写法仍能比。 */
export function normalizeCwd(dir) {
  if (dir == null || dir === '') return '';
  const s = String(dir);
  try {
    return realpathSync(s);
  } catch {
    return resolvePath(s);
  }
}

export function sameCwd(a, b) {
  const left = normalizeCwd(a);
  const right = normalizeCwd(b);
  return Boolean(left) && left === right;
}

/**
 * 当前匹配目录里最近启动且仍存活的任务。不回退到其它目录。
 * startedAt 缺失时退回 runId 字典序(ISO 时间前缀)。
 * @param {object[]} [records]
 * @param {{ cwd?: string, isAlive?: (pid: number) => boolean }} [opts]
 */
export function latestLiveRunIdFrom(records, { cwd, isAlive = (pid, rec) => isRecordedProcessAlive(pid, rec?.command) } = {}) {
  const want = normalizeCwd(cwd ?? process.cwd());
  const live = (records ?? []).filter(
    (r) => !r.finished && isAlive(r.pid, r) && sameCwd(r.cwd, want),
  );
  if (live.length === 0) return null;
  live.sort((a, b) => {
    const at = Date.parse(a.startedAt ?? '') || 0;
    const bt = Date.parse(b.startedAt ?? '') || 0;
    if (at !== bt) return bt - at;
    return String(b.runId).localeCompare(String(a.runId));
  });
  return live[0].runId;
}

/** 最近启动且仍存活、cwd 等于给定目录(默认 process.cwd())的任务。不回退到全局。 */
export function latestLiveRunId(cwd) {
  return latestLiveRunIdFrom(listAllPidRecords(), { cwd });
}

export const LATEST_MISS =
  '当前匹配目录没有仍在运行的任务。用 status 查看 run-id。';

export function resolveLatestRunId(records, opts = {}) {
  const id = latestLiveRunIdFrom(records, opts);
  if (!id) throw new Error(LATEST_MISS);
  return id;
}

export function resolveRunId(spec, cwd) {
  if (!spec) throw new Error('缺少 run-id。可用 latest 指当前目录最近启动且仍存活的任务。');
  if (spec === 'latest') return resolveLatestRunId(listAllPidRecords(), { cwd });
  return spec;
}
