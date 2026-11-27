// Durable local yield protocol. Remote watchers publish <runId>.wake.json.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, openSync, closeSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn, spawnSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runsDir } from './progress.mjs';
import { appendInbox } from './inbox.mjs';
import { readPidRecord } from './pid.mjs';
import { redactEvidence } from './brief.mjs';
import { fleetEvent } from './timeline.mjs';
import { linkedReview, records } from './requests.mjs';

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
const exactActions = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/actions\/runs\/(\d+)@([a-f0-9]{40})$/i;
export function actionsTerminal(run, sha) {
  if (run.headSha?.toLowerCase() !== sha.toLowerCase() || run.status !== 'completed') return null;
  return { status: run.conclusion === 'success' ? 'done' : 'failed', conclusion: run.conclusion, sha };
}
export function validateCondition(condition) {
  if (condition === 'reply' || condition === 'review') return;
  const index = String(condition).indexOf(':');
  const kind = condition.slice(0, index), value = condition.slice(index + 1);
  if (index < 1 || !value) throw new Error('缺少有效 --until 条件。');
  if (kind === 'all' || kind === 'any') {
    const children = JSON.parse(value);
    if (!Array.isArray(children) || !children.length) throw new Error('all:/any: 后须为非空条件 JSON 数组。');
    children.forEach(validateCondition); return;
  }
  if (!['file', 'run', 'compat-run', 'job', 'after', 'at', 'cmd', 'gh-run', 'gh-pr', 'land', 'lock'].includes(kind)) throw new Error(`不支持条件 ${kind}`);
  if (kind === 'after') duration(value);
  if (kind === 'at' && !Number.isFinite(Date.parse(value))) throw new Error('at: 需要有效时间。');
  if (kind === 'run' || kind === 'compat-run' || kind === 'job') validId(value);
  if (kind === 'gh-run' && value.includes('@') && !exactActions.test(value)) throw new Error('gh-run 需要 GitHub Actions URL@完整提交 SHA。');
}
export function writeYield(id, entry) {
  validId(id);
  if (entry.type === 'park') {
    if (entry.until?.startsWith('run:')) entry = { ...entry, until: 'compat-run:' + entry.until.slice(4) };
    validateCondition(entry.until);
    if (!entry.say?.trim()) throw new Error('park 需要 --say，说明醒来做什么。');
  } else if (entry.type === 'plan') {
    if (!entry.text?.trim()) throw new Error('plan 需要阶段范围和完成条件。');
  } else if (entry.type === 'handoff') {
    if (!entry.next?.trim() || !entry.text?.trim() || Buffer.byteLength(entry.text + entry.next) > 2048) throw new Error('handoff 需要 --next 和五项交接正文（≤2KB）。');
  } else if (entry.type === 'blocked') {
    if (!['auth', 'input', 'access'].includes(entry.need) || !entry.what?.trim() || !entry.tried?.trim() || !entry.who?.trim())
      throw new Error('blocked 需要 --need auth|input|access --what --tried --who。');
  } else throw new Error('无效 yield 类型。');
  const previous = readYield(id);
  // A plan is informational; retain it when the same turn requests a park.
  const pendingPlan = previous?.type === 'plan' && !previous.resolvedAt && entry.type === 'park' ? previous : null;
  if (previous && !previous.resolvedAt && !pendingPlan) throw new Error('已有未处理的 yield。');
  const sameWait = previous?.type === 'park' && previous.until === entry.until;
  const rec = { ...entry, ...(pendingPlan ? { pendingPlan: pendingPlan.text } : {}), ...(entry.type === 'park' ? { owner: entry.owner || '本单' } : {}),
    sourceId: sameWait ? previous.sourceId : undefined, at: Date.now(),
    timeoutMs: entry.type === 'park' ? duration(entry.timeout) : undefined,
    timeouts: sameWait ? previous.timeouts || 0 : 0 };
  save(pathFor(id, 'yield'), rec);
  appendFileSync(pathFor(id, 'log'), fleetEvent(entry.type) + '\n');
  return rec;
}
export function resolveYield(id, entry, result) {
  save(pathFor(id, 'yield'), { ...entry, resolvedAt: Date.now(), result,
    timeouts: (entry.timeouts || 0) + (result.status === 'timeout' ? 1 : 0) });
}
export function watchRequest(action, data) {
  const store = fileURLToPath(new URL('./watch-store.py', import.meta.url));
  const result = spawnSync('python3', [store, '--request'], {
    input: JSON.stringify([action, data]), encoding: 'utf8', timeout: 100_000,
  });
  if (result.error) throw result.error;
  const reply = JSON.parse(result.stdout);
  if (result.status !== 0) throw new Error(reply.error || 'Mini 信箱写入失败');
  return reply;
}

export function dispatchSession() {
  return process.env.FLEET_DISPATCH_SESSION || process.env.CODEX_THREAD_ID || null;
}

export function watchBinding(rec) {
  const metadata = rec.briefPath && readJSON(rec.briefPath.replace(/\.md$/, '.json'));
  return {
    seat: rec.watchSeat || (process.env.FLEET_LINE ? undefined : process.env.FLEET_SEAT) || metadata?.watch_seat || undefined,
    line: rec.watchLine || rec.dispatchSession || process.env.FLEET_LINE || metadata?.dispatch_session || dispatchSession(),
    cwd: rec.cwd || process.cwd(),
    parent: rec.parentRunId || process.env.FLEET_PARENT_RUN_ID || undefined,
    repo: metadata?.object?.repo,
  };
}

export function ask(id, { kind = 'help', text, wait = false, timeout, review } = {}) {
  validId(id);
  if (!['help', 'shared', 'decision', 'review', 'resource'].includes(kind) || !text?.trim()) throw new Error('ask 需要 --kind help|shared|decision 和问题。');
  const rec = { type: 'ask', id: randomUUID(), runId: id, kind, text: redactEvidence(text), ...(review ? { review: { repo: redactEvidence(review.repo), ranges: review.ranges.map(redactEvidence), focus: redactEvidence(review.focus) } } : {}), at: new Date().toISOString() };
  // Install the reply wait before publishing the question so a fast say cannot race it.
  const park = wait && writeYield(id, { type: 'park', until: 'reply', timeout: timeout || '30m', say: `答复后继续：${text}` });
  const state = readJSON(pathFor(id, 'json')) || readJSON(pathFor(id, 'queue.json')) || {};
  const binding = watchBinding(state);
  try {
    watchRequest('ask', { ...rec, text: redactEvidence(text), binding });
  } catch (error) {
    if (park) resolveYield(id, park, { status: 'ask-failed' });
    throw error;
  }
  mkdirSync(runsDir(), { recursive: true });
  appendFileSync(pathFor(id, 'asks'), JSON.stringify(rec) + '\n', { mode: 0o600 });
  const parent = binding.parent;
  if (parent) appendInbox(validId(parent), rec);
  appendFileSync(pathFor(id, 'log'), fleetEvent('ask') + '\n');
  return rec;
}
export async function localCondition(condition, { id, entry, cwd, replies = [] }) {
  if (condition === 'review') {
    const asks = (existsSync(pathFor(id, 'asks')) ? readFileSync(pathFor(id, 'asks'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line)) : []).filter(a => a.kind === 'review');
    const review = asks.length && linkedReview(asks.at(-1), readJSON(pathFor(id, 'json')));
    return review ? localCondition(`run:${review.runId}`, { id, entry, cwd, replies }) : null;
  }
  if (condition === 'reply') return replies.length ? { status: 'done', text: replies.join('\n\n') } : null;
  const index = condition.indexOf(':'), kind = condition.slice(0, index), value = condition.slice(index + 1);
  if (kind === 'all' || kind === 'any') {
    const results = await Promise.all(JSON.parse(value).map(c => localCondition(c, { id, entry, cwd, replies })));
    if (kind === 'any') {
      if (results.some(r => r?.status === 'done')) return { status: 'done', results };
      return results.find(r => r?.status === 'failed') || null;
    }
    const failed = results.find(r => r && r.status !== 'done');
    if (failed) return failed;
    return results.every(Boolean) ? { status: 'done', results } : null;
  }
  if (kind === 'file') return existsSync(resolve(cwd, value)) ? { status: 'done', path: value } : null;
  if (kind === 'after' || kind === 'at') return Date.now() >= (kind === 'after' ? entry.at + duration(value) : Date.parse(value)) ? { status: 'done' } : null;
  if (kind === 'run' || kind === 'compat-run' || kind === 'job') {
    const matches = kind !== 'job' ? records().filter(r => r.runId === value || r.name === value || r.runId.startsWith(value)) : [];
    if (matches.length > 1) return { status: 'failed', text: `run:${value} 匹配不唯一，请指定完整 runId。` };
    const rec = matches[0] || readJSON(pathFor(value, kind === 'job' ? 'job.json' : 'json')) || (kind !== 'job' ? readPidRecord(value) : null);
    if (!rec) return kind !== 'job' ? null : { status: 'failed', text: `找不到本地 job:${value}` };
    if (['running', 'queued', 'parked', 'waiting'].includes(rec.status) || (!rec.status && !rec.finished)) return null;
    return { status: rec.status === 'done' || (!rec.status && rec.verdict === 'ok') ? 'done' : 'failed', logPath: rec.logPath, resultPath: rec.resultPath };
  }
  const wake = readJSON(pathFor(id, 'wake.json'));
  const actions = kind === 'gh-run' && value.match(exactActions);
  if (wake?.condition === condition && ['done', 'failed'].includes(wake.status) &&
      (actions ? wake.sha?.toLowerCase() === actions[3].toLowerCase() : wake.at >= entry.at)) return wake;
  const probeKey = () => `probe-${createHash('sha256').update(condition).digest('hex')}`;
  if (actions) {
    const [, repo, number, sha] = actions;
    const probe = pathFor(id, probeKey() + '.json');
    const previous = readJSON(probe);
    if (previous?.terminal) return previous.terminal;
    const at = Date.now();
    if (previous && at - previous.at < 120_000) return null;
    save(probe, { at });
    try {
      const { stdout } = await promisify(execFile)('gh', ['run', 'view', number, '--repo', repo, '--json', 'headSha,status,conclusion'], { cwd, timeout: 30_000 });
      const terminal = actionsTerminal(JSON.parse(stdout), sha);
      if (terminal) save(probe, { at, terminal });
      return terminal;
    } catch (error) {
      if (!error.code && !error.killed && !(error instanceof SyntaxError)) throw error;
      return null;
    }
  }
  if (kind === 'cmd') {
    // The runner polls at 250ms, but command probes never run more than once per two minutes.
    const key = probeKey(), path = pathFor(id, key + '.json');
    const previous = readJSON(path);
    if (previous && Date.now() - previous.at < 120000) return null;
    save(path, { at: Date.now() });
    const logPath = pathFor(id, key + '.log');
    try {
      const output = await promisify(execFile)('/bin/sh', ['-c', value], { cwd, timeout: 30000 });
      writeFileSync(logPath, redactEvidence(output.stdout + output.stderr), { mode: 0o600 });
      return { status: 'done', logPath };
    } catch (error) {
      writeFileSync(logPath, redactEvidence((error.stdout || '') + (error.stderr || '')), { mode: 0o600 });
      return { status: 'failed', text: `cmd 退出 ${error.code}`, logPath };
    }
  }
  if (kind === 'land') {
    // Registration, not park time, owns the result: a batch may finish before park.
    const registration = readJSON(pathFor(id, 'land.json'))?.[condition];
    return registration?.result || null;
  }
  return null;
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

// The original brief and ordered revisions are retained verbatim, never summarized.
export function stageState(id, anchor) {
  const state = readJSON(pathFor(validId(id), 'stages.json')) ||
    { anchor, stages: anchor.match(/^阶段[:：].+$/gm) || [], baton: 1, stage: 0 };
  save(pathFor(id, 'stages.json'), state);
  return state;
}
export function saveStages(id, state) { save(pathFor(validId(id), 'stages.json'), state); }
export async function alignStage(state, text, kind, judge, { details = false } = {}) {
  try {
    const result = await judge(JSON.parse(redactEvidence({
      state: { anchor: state.anchor, stage: state.stages[state.stage], text, kind },
      questions: { aligned: { type: 'choice',
        instructions: '对照不变锚和本阶段条件。交接须含已完成及证据、决定及理由、未决与外部事项、坑与勿重做、下一步；复述须含目标、阶段边界、不做什么。偏离或缺项选 reject。',
        criteria: { pass: '完整且对齐', reject: '偏离或缺项' } },
        ...(details ? { completed: { type: 'choice',
          instructions: '仅依据交接中明确的完成证据核对当前阶段全部完成条件；阶段内换棒、仍有阶段内待办或证据不足选 reject。',
          criteria: { pass: '本阶段完成条件已由证据确认', reject: '本阶段未完成或未确认' } } } : {}) }
    })));
    const answer = result.answers?.aligned;
    const aligned = Boolean(result.ok && answer?.choice === 'pass' && answer.confidence >= 0.55);
    const completion = result.answers?.completed;
    return details ? { aligned, completed: Boolean(aligned && completion?.choice === 'pass' && completion.confidence >= 0.55) } : aligned;
  } catch { return details ? { aligned: false, completed: false } : false; }
}
