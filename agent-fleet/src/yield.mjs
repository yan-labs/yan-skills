// Durable local yield protocol. Remote watchers publish <runId>.wake.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runsDir } from './progress.mjs';
import { appendInbox } from './inbox.mjs';
import { readPidRecord } from './pid.mjs';
import { redactEvidence } from './brief.mjs';
import { fleetEvent } from './timeline.mjs';

const pathFor = (id, suffix) => join(runsDir(), `${id}.${suffix}`);
const validId = id => {
  if (!id || !/^[\w.-]+$/.test(id) || id === '.' || id === '..') throw new Error('需要有效 runId（在执行器内运行或指定 --run）。');
  return id;
};
export function currentRun(flags = {}) { return validId(flags.run || process.env.FLEET_SLOT_RUN_ID || process.env.FLEET_DETACHED_RUN_ID); }
export function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function save(path, value) {
  mkdirSync(runsDir(), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + '\n', { mode: 0o600 }); renameSync(temp, path);
}
export function readYield(id) { return readJSON(pathFor(validId(id), 'yield')); }
export function duration(value = '2h') {
  const match = String(value).match(/^(\d+(?:\.\d+)?)(ms|s|m|h)?$/);
  if (!match || Number(match[1]) <= 0) throw new Error('时长应为正数，支持 ms/s/m/h。');
  return Number(match[1]) * ({ ms: 1, s: 1000, m: 60000, h: 3600000 }[match[2] || 's']);
}
export function validateCondition(condition) {
  if (condition === 'reply') return;
  const index = String(condition).indexOf(':');
  const kind = condition.slice(0, index), value = condition.slice(index + 1);
  if (index < 1 || !value) throw new Error('缺少有效 --until 条件。');
  if (kind === 'all' || kind === 'any') {
    const children = JSON.parse(value);
    if (!Array.isArray(children) || !children.length) throw new Error('all:/any: 后须为非空条件 JSON 数组。');
    children.forEach(validateCondition); return;
  }
  if (!['file', 'run', 'job', 'after', 'at', 'cmd', 'gh-run', 'gh-pr', 'land', 'lock'].includes(kind)) throw new Error(`不支持条件 ${kind}`);
  if (kind === 'after') duration(value);
  if (kind === 'at' && !Number.isFinite(Date.parse(value))) throw new Error('at: 需要有效时间。');
  if (kind === 'run' || kind === 'job') validId(value);
}
export function writeYield(id, entry) {
  validId(id);
  if (entry.type === 'park') {
    validateCondition(entry.until);
    if (!entry.say?.trim()) throw new Error('park 需要 --say，说明醒来做什么。');
  } else if (entry.type === 'blocked') {
    if (!['auth', 'input', 'access'].includes(entry.need) || !entry.what?.trim() || !entry.tried?.trim() || !entry.who?.trim())
      throw new Error('blocked 需要 --need auth|input|access --what --tried --who。');
  } else throw new Error('无效 yield 类型。');
  const previous = readYield(id);
  if (previous && !previous.resolvedAt) throw new Error('已有未处理的 yield。');
  const rec = { ...entry, at: Date.now(), timeoutMs: entry.type === 'park' ? duration(entry.timeout) : undefined,
    timeouts: previous?.until === entry.until ? previous?.timeouts || 0 : 0 };
  save(pathFor(id, 'yield'), rec);
  appendFileSync(pathFor(id, 'log'), fleetEvent(entry.type) + '\n');
  return rec;
}
export function resolveYield(id, entry, result) {
  save(pathFor(id, 'yield'), { ...entry, resolvedAt: Date.now(), result,
    timeouts: (entry.timeouts || 0) + (result.status === 'timeout' ? 1 : 0) });
}
export function ask(id, { kind = 'help', text, wait = false, timeout } = {}) {
  validId(id);
  if (!['help', 'shared', 'decision'].includes(kind) || !text?.trim()) throw new Error('ask 需要 --kind help|shared|decision 和问题。');
  const rec = { type: 'ask', id: randomUUID(), runId: id, kind, text, at: new Date().toISOString() };
  // Install the reply wait before publishing the question so a fast say cannot race it.
  if (wait) writeYield(id, { type: 'park', until: 'reply', timeout: timeout || '30m', say: `答复后继续：${text}` });
  mkdirSync(runsDir(), { recursive: true });
  appendFileSync(pathFor(id, 'asks'), JSON.stringify(rec) + '\n', { mode: 0o600 });
  const parent = readJSON(pathFor(id, 'json'))?.parentRunId || process.env.FLEET_PARENT_RUN_ID;
  if (parent) appendInbox(validId(parent), rec);
  appendFileSync(pathFor(id, 'log'), fleetEvent('ask') + '\n');
  return rec;
}
export function takeAsk(id) {
  const path = pathFor(validId(id), 'asks');
  if (!existsSync(path)) return null;
  const entries = readFileSync(path, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const seen = readJSON(pathFor(id, 'asks-seen')) || [];
  const entry = entries.find(e => !seen.includes(e.id));
  if (entry) save(pathFor(id, 'asks-seen'), [...seen, entry.id]);
  return entry || null;
}
export async function localCondition(condition, { id, entry, cwd, replies = [] }) {
  if (condition === 'reply') return replies.length ? { status: 'done', text: replies.join('\n\n') } : null;
  const index = condition.indexOf(':'), kind = condition.slice(0, index), value = condition.slice(index + 1);
  if (kind === 'all' || kind === 'any') {
    const results = await Promise.all(JSON.parse(value).map(c => localCondition(c, { id, entry, cwd, replies })));
    if (kind === 'any') {
      if (results.some(r => r?.status === 'done')) return { status: 'done', results };
      return results.every(Boolean) ? results[0] : null;
    }
    const failed = results.find(r => r && r.status !== 'done');
    if (failed) return failed;
    return results.every(Boolean) ? { status: 'done', results } : null;
  }
  if (kind === 'file') return existsSync(resolve(cwd, value)) ? { status: 'done', path: value } : null;
  if (kind === 'after' || kind === 'at') return Date.now() >= (kind === 'after' ? entry.at + duration(value) : Date.parse(value)) ? { status: 'done' } : null;
  if (kind === 'run' || kind === 'job') {
    const rec = readJSON(pathFor(value, kind === 'job' ? 'job.json' : 'json')) || (kind === 'run' ? readPidRecord(value) : null);
    if (!rec) return { status: 'failed', text: `找不到本地 ${kind}:${value}；跨机 run 由 watchd 提供终态。` };
    if (['running', 'queued', 'parked', 'waiting'].includes(rec.status) || (!rec.status && !rec.finished)) return null;
    return { status: rec.status === 'done' || (!rec.status && rec.verdict === 'ok') ? 'done' : 'failed', logPath: rec.logPath, resultPath: rec.resultPath };
  }
  if (kind === 'cmd') {
    // The runner polls at 250ms, but command probes never run more than once per two minutes.
    const previous = readJSON(pathFor(id, 'probe.json'));
    if (previous?.condition === condition && Date.now() - previous.at < 120000) return null;
    save(pathFor(id, 'probe.json'), { condition, at: Date.now() });
    const logPath = pathFor(id, 'probe.log');
    try {
      const output = await promisify(execFile)('/bin/sh', ['-c', value], { cwd, timeout: 30000 });
      writeFileSync(logPath, redactEvidence(output.stdout + output.stderr), { mode: 0o600 });
      return { status: 'done', logPath };
    } catch (error) {
      writeFileSync(logPath, redactEvidence((error.stdout || '') + (error.stderr || '')), { mode: 0o600 });
      return { status: 'failed', text: `cmd 退出 ${error.code}`, logPath };
    }
  }
  // Step 5 owns remote probes; this runner only consumes their explicit terminal record.
  const wake = readJSON(pathFor(id, 'wake.json'));
  return wake?.condition === condition && wake.at >= entry.at && ['done', 'failed'].includes(wake.status) ? wake : null;
}
export function startBackground(command, cwd = process.cwd()) {
  if (!command.length) throw new Error('用法: fleet bg -- <命令> [参数]');
  mkdirSync(runsDir(), { recursive: true });
  const id = `job-${randomUUID()}`, logPath = pathFor(id, 'job.log');
  save(pathFor(id, 'job.json'), { status: 'running', logPath, startedAt: Date.now() });
  const fd = openSync(logPath, 'a', 0o600);
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--job', id, cwd, ...command], { detached: true, stdio: ['ignore', fd, fd] });
  closeSync(fd); child.unref();
  child.on('error', error => save(pathFor(id, 'job.json'), { status: 'failed', logPath, error: error.message }));
  return { jobId: id, until: `job:${id}`, logPath };
}
if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--job') {
  const [, , , id, cwd, ...command] = process.argv;
  const previous = readJSON(pathFor(id, 'job.json'));
  const child = spawn(command[0], command.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', chunk => process.stdout.write(redactEvidence(chunk.toString())));
  child.stderr.on('data', chunk => process.stderr.write(redactEvidence(chunk.toString())));
  const result = await new Promise(resolve => {
    child.once('error', error => resolve({ error: error.message }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  save(pathFor(id, 'job.json'), { ...previous, ...result, status: result.code === 0 ? 'done' : 'failed', finishedAt: Date.now() });
}
