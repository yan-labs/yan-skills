// Machine-local admission state. Supervisors wait here without starting a model.
import { existsSync, statSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hostname } from 'node:os';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { runsDir } from './progress.mjs';
import { isRecordedProcessAlive, processCommand } from './pid.mjs';
import { fleetEvent } from './timeline.mjs';

const live = new Set(['queued', 'running', 'parked', 'waiting']);
const pathFor = id => join(runsDir(), `${id}.queue.json`);
function read(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (err) { if (err.code === 'ENOENT') return null; throw err; }
}
function write(row) {
  const path = pathFor(row.runId), tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(row) + '\n'); renameSync(tmp, path);
}
export function queueRecord(id) { return read(pathFor(id)); }
export function canonicalPath(value) {
  let path = resolve(value), tail = [];
  while (!existsSync(path) && dirname(path) !== path) { tail.unshift(path.split('/').at(-1)); path = dirname(path); }
  return join(realpathSync(path), ...tail);
}
export function pathsOverlap(a, b) {
  return a.some(x => b.some(y => x === y || x.startsWith(y.replace(/\/$/, '') + '/') || y.startsWith(x.replace(/\/$/, '') + '/')));
}
export function taskObject(briefPath) {
  if (!briefPath) return null;
  const metaPath = briefPath.replace(/\.md$/, '.json');
  const meta = read(metaPath);
  const object = meta?.object;
  if (!object) return null; // Legacy/direct fleet briefs still share the machine slot limit.
  return { ...object, repo: canonicalPath(object.repo), writes: object.writes.map(canonicalPath), after: meta.after || null };
}
export function taskIdentity(rec) {
  const meta = rec.briefPath ? read(rec.briefPath.replace(/\.md$/, '.json')) : null;
  const brief = rec.briefPath && existsSync(rec.briefPath) ? readFileSync(rec.briefPath, 'utf8') : '';
  const actions = meta?.actions || rec.actions || brief.match(/^动作[ \t]*[:：][ \t]*(.*)$/m)?.[1];
  const list = Array.isArray(actions) ? actions : String(actions || '').split('/').map(s => s.trim()).filter(Boolean);
  const writing = list.some(a => a !== '只读' && a !== 'read' && a !== 'readonly');
  const auth = meta?.auth ?? rec.auth ?? [];
  const grants = Array.isArray(auth) ? auth : String(auth).split(',');
  const readonly = !writing && (list.length > 0 || rec.review || meta?.review ||
    (grants.includes('review') && !grants.some(a => ['local', 'local-commit', 'deploy-prod', 'paid'].includes(a))));
  return { auth: grants, actions: list, review: Boolean(rec.review || meta?.review), readonly: Boolean(readonly) };
}
async function locked(fn) {
  mkdirSync(runsDir(), { recursive: true });
  const lock = join(runsDir(), '.queue-lock');
  for (;;) {
    try { mkdirSync(lock); break; }
    catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const owner = read(join(lock, 'owner.json'));
      if (!owner) {
        let age;
        try { age = Date.now() - statSync(lock).mtimeMs; } catch (err) { if (err.code === 'ENOENT') continue; throw err; }
        if (age > 15000) throw new Error('槽位锁缺少持有者记录；请由协调者清理 .queue-lock 后重试。');
      }
      if (owner && !isRecordedProcessAlive(owner.pid, owner.command)) { rmSync(lock, { recursive: true, force: true }); continue; }
      await new Promise(r => setTimeout(r, 20));
    }
  }
  const ownerPath = join(lock, 'owner.json');
  writeFileSync(ownerPath + '.tmp', JSON.stringify({ pid: process.pid, command: processCommand(process.pid) }));
  renameSync(ownerPath + '.tmp', ownerPath);
  try { return await fn(); } finally { rmSync(lock, { recursive: true, force: true }); }
}
export function queueRows() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(n => n.endsWith('.queue.json')).map(n => read(join(runsDir(), n)));
}
function refreshedRows() {
  return queueRows().map(row => {
    if (!live.has(row.state)) return row;
    const rec = read(join(runsDir(), `${row.runId}.json`));
    if ((rec && ['done', 'failed', 'stopped', 'blocked'].includes(rec.status)) ||
        (!isRecordedProcessAlive(row.pid, row.command) && !isRecordedProcessAlive(rec?.childPid, rec?.childCommand))) {
      row.state = rec?.status && rec.status !== 'running' ? rec.status : 'failed';
      row.finishedAt = Date.now(); write(row);
    }
    if (row.state === 'waiting') {
      row.waiters = (row.waiters || []).filter(w => isRecordedProcessAlive(w.pid, w.command));
      if (!row.waiters.length) row.state = 'running';
      write(row);
    }
    return row;
  });
}
function dependency(rows, spec) {
  const matches = rows.filter(r => r.runId === spec || r.name === spec);
  const active = matches.filter(r => live.has(r.state));
  if (active.length > 1) throw new Error('--after 匹配多个未结束任务，请使用 runId。');
  return active[0] ?? matches.sort((a, b) => b.createdAt - a.createdAt)[0];
}
function follows(rows, row, predecessor, seen = new Set()) {
  if (!row.after || seen.has(row.runId)) return false;
  seen.add(row.runId);
  const dep = dependency(rows, row.after);
  return dep?.runId === predecessor.runId || (dep && follows(rows, dep, predecessor, seen));
}
export function slotPool(model) {
  return /(?:^|[-/:])(luna|gemini|copy|bulk|haiku|jev)(?:$|[-/:.0-9])/i.test(String(model || '')) ? 'light' : 'code';
}
function poolCapacity(pool) {
  return Number(process.env[pool === 'light' ? 'FLEET_LIGHT_CAPACITY' : 'FLEET_CODE_CAPACITY'] || (pool === 'light' ? 10 : 4));
}
export async function registerQueue(rec) {
  return locked(() => {
    const rows = refreshedRows();
    const object = taskObject(rec.briefPath);
    const identity = taskIdentity(rec);
    const row = { runId: rec.runId, name: rec.name, pid: process.pid, command: processCommand(process.pid),
      machine: hostname(), model: rec.model, briefPath: rec.briefPath, object, ...identity, after: object?.after,
      createdAt: Date.now(), state: 'queued' };
    if (row.after && !dependency(rows, row.after)) throw new Error('--after 找不到任务；请先派发前置单。');
    for (const other of rows) {
      if (!object || !other.object || other.runId === row.runId) continue;
      if (live.has(other.state) && pathsOverlap(object.writes, other.object.writes) && !follows(rows, row, other)) {
        const pairs = object.writes.flatMap(a => other.object.writes.filter(b => pathsOverlap([a], [b])).map(b => `${a} ↔ ${b}`));
        const quote = s => `'${String(s).replaceAll("'", "'\\''")}'`;
        throw new Error(`可写路径重叠：${other.name || other.runId}\n${pairs.join('\n')}\nfleet-go relaunch ${quote(row.name)} --worktree\nfleet-go relaunch ${quote(row.name)} --after ${quote(other.name || other.runId)}\nfleet say ${quote(other.name || other.runId)} '请处理重叠路径上的任务'`);
      }
      if ((live.has(other.state) || Date.now() - (other.finishedAt || other.createdAt) < 86_400_000) &&
          object.question && object.repo === other.object.repo && object.environment === other.object.environment &&
          object.question.trim() === other.object.question?.trim() && other.name !== row.name && !follows(rows, row, other))
        throw new Error(`重复问题：${other.name || other.runId}；请对已有单 say。`);
    }
    write(row);
    return row;
  });
}
export function saveCodexQuota(rateLimits) {
  mkdirSync(runsDir(), { recursive: true });
  const windows = [rateLimits?.primary, rateLimits?.secondary].filter(Boolean);
  const usedPercent = Math.max(0, ...windows.map(w => Number(w.usedPercent) || 0));
  const resetsAt = Math.max(0, ...windows.filter(w => Number(w.usedPercent) > 80).map(w => Number(w.resetsAt) || 0));
  const path = join(runsDir(), 'codex-quota.json'), tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ usedPercent, resetsAt, updatedAt: Date.now() })); renameSync(tmp, path);
}
export async function acquireSlot(id) {
  return locked(() => {
    const rows = refreshedRows(), row = rows.find(r => r.runId === id);
    if (!row || row.state !== 'queued') return row?.state === 'running';
    const dep = row.after && dependency(rows, row.after);
    if (dep && live.has(dep.state)) return false;
    if (row.readonly) { row.state = 'running'; row.startedAt ??= Date.now(); write(row); return true; }
    const quota = read(join(runsDir(), 'codex-quota.json'));
    if (/^gpt-/.test(row.model) && quota?.usedPercent > 80 && (!quota.resetsAt || quota.resetsAt * 1000 > Date.now())) return false;
    const pool = slotPool(row.model);
    const totalOverride = process.env.FLEET_SLOT_CAPACITY;
    const samePool = r => totalOverride || slotPool(r.model) === pool;
    const capacity = totalOverride ? Number(totalOverride) : poolCapacity(pool);
    const active = rows.filter(r => r.state === 'running' && !r.readonly && samePool(r)).length;
    // Older detached/foreground runs also occupy slots, without double-counting supervised children.
    const known = new Set(rows.map(r => r.runId));
    const legacy = new Set();
    const registeredPids = new Set(rows.filter(r => live.has(r.state)).map(r => r.pid));
    for (const name of readdirSync(runsDir()).filter(n => n.endsWith('.json') && !n.endsWith('.queue.json'))) {
      const rec = read(join(runsDir(), name));
      const runId = rec?.runId || name.replace(/\.pid\.json$/, '');
      if (!rec || known.has(runId) || known.has(rec?.slotRunId) || registeredPids.has(rec.pid) || (rec.detach ? rec.status !== 'running' : !name.endsWith('.pid.json') || rec.finished)) continue;
      if (!taskIdentity(rec).readonly && samePool(rec) && isRecordedProcessAlive(rec.pid, rec.command)) legacy.add(runId);
    }
    if (active + legacy.size >= capacity) return false;
    const earlier = rows.some(r => r.state === 'queued' && !r.readonly && slotPool(r.model) === pool &&
      (r.createdAt < row.createdAt || (r.createdAt === row.createdAt && r.runId < row.runId)) &&
      (!r.after || !live.has(dependency(rows, r.after)?.state)) &&
      !(/^gpt-/.test(r.model) && quota?.usedPercent > 80 && (!quota.resetsAt || quota.resetsAt * 1000 > Date.now())));
    if (earlier) return false;
    row.state = 'running'; row.startedAt = Date.now(); write(row); return true;
  });
}
// Step 4 calls this only after parking the executor, and reacquires before waking it.
export async function setSlotState(id, state) {
  if (!['parked', 'queued', 'done', 'failed', 'stopped', 'blocked'].includes(state)) throw new Error('无效槽位状态。');
  return locked(() => {
    const row = queueRecord(id);
    if (!row) return;
    row.state = state;
    if (!live.has(state)) row.finishedAt = Date.now();
    write(row);
  });
}
export function queueEvent(event) { return fleetEvent(event) + '\n'; }

// A wait lease is owned by the waiting process, not the executor/supervisor.
// Dead waiters are reaped under the same queue lock on the next admission.
export async function releaseParentSlot(id = process.env.FLEET_SLOT_RUN_ID || process.env.FLEET_DETACHED_RUN_ID) {
  if (!id) return async () => {};
  const token = randomUUID();
  const released = await locked(() => {
    const row = queueRecord(id);
    if (!row || row.readonly || !['running', 'waiting'].includes(row.state)) return false;
    row.waiters = [...(row.waiters || []), { token, pid: process.pid, command: processCommand(process.pid) }];
    row.state = 'waiting'; write(row); return true;
  });
  return async () => {
    if (!released) return;
    const resume = await locked(() => {
      const row = queueRecord(id);
      if (!row || row.state !== 'waiting') return false;
      row.waiters = row.waiters.filter(w => w.token !== token && isRecordedProcessAlive(w.pid, w.command));
      if (row.waiters.length) { write(row); return false; }
      row.state = 'queued'; write(row); return true;
    });
    if (resume) while (!(await acquireSlot(id))) {
      if (queueRecord(id)?.state !== 'queued') break;
      await new Promise(r => setTimeout(r, 100));
    }
  };
}

// Python transport uses the same lock/state transitions, with stdin as its lease.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href && process.argv[2] === '--wait-parent') {
  const resume = await releaseParentSlot();
  process.stdout.write('ready\n');
  process.stdin.resume();
  await new Promise(r => process.stdin.once('end', r));
  await resume();
}
