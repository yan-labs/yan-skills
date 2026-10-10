#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { collectStatus } from '../src/control.mjs';
import { redactEvidence } from '../src/brief.mjs';

export async function connect() {
  const child = spawn(process.env.FLEET_CODEX_BIN || 'codex', ['app-server', '--stdio'], {
    stdio: ['pipe', 'pipe', 'ignore'], env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  });
  const pending = new Map();
  let counter = 0, closed;
  const fail = error => {
    closed = error;
    for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); }
    pending.clear();
  };
  child.on('error', fail);
  child.on('close', () => fail(new Error('app-server closed')));
  child.stdin.on('error', fail);
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    const p = pending.get(event.id);
    if (!p) return;
    pending.delete(event.id); clearTimeout(p.timer);
    event.error ? p.reject(new Error(event.error.message)) : p.resolve(event.result);
  });
  const rpc = (method, params) => new Promise((resolve, reject) => {
    if (closed) { reject(closed); return; }
    const id = ++counter;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 15000);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  const close = () => { lines.close(); fail(new Error('connection closed')); child.kill('SIGKILL'); };
  try {
    await rpc('initialize', { clientInfo: { name: 'agent_fleet', version: '0.7.0' }, capabilities: { experimentalApi: true } });
    child.stdin.write('{"method":"initialized"}\n');
    return { rpc, close };
  } catch (error) { close(); throw error; }
}

async function enumerate(root) {
  const rows = [], errors = [];
  async function walk(dir) {
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code !== 'ENOENT') errors.push({ path: dir, status: 'failed', reason: redactEvidence(error.message) }); return; }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) {
        const stream = createReadStream(path);
        try {
          let firstLine = '';
          stream.setEncoding('utf8');
          for await (const chunk of stream) {
            firstLine += chunk;
            const end = firstLine.indexOf('\n');
            if (end >= 0) { firstLine = firstLine.slice(0, end); break; }
          }
          const meta = JSON.parse(firstLine);
          if (meta.type === 'session_meta' && meta.payload?.originator === 'agent_fleet') rows.push({ ...meta.payload, path });
        } catch (error) { if (error.code !== 'ENOENT') errors.push({ path, status: 'failed', reason: error instanceof SyntaxError ? 'invalid session metadata' : redactEvidence(error.message) }); }
        finally { stream.destroy(); }
      }
    }
  }
  await walk(root);
  return { rows, errors };
}

export async function sweep({ root = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'sessions'),
  minIdleMinutes = 10, dryRun = false, status = collectStatus, open = connect } = {}) {
  root = resolve(root);
  const result = { archived: 0, skipped: 0, failed: 0, candidates: 0, threads: [] };
  const { rows, errors } = await enumerate(root);
  result.failed = errors.length;
  result.threads.push(...errors);
  const protectedIds = () => {
    const ids = new Set(status().filter(r => ['running', 'abnormal'].includes(r.state ?? r.status))
      .flatMap(r => [r.runId, r.threadId, r.sessionId]).filter(Boolean));
    // Parent archive cascades: protect the whole family of a running thread.
    let changed;
    do {
      changed = false;
      for (const row of rows) {
        const parent = row.source?.subagent?.thread_spawn?.parent_thread_id;
        if (parent && (ids.has(parent) || ids.has(row.id))) {
          for (const id of [parent, row.id]) if (!ids.has(id)) { ids.add(id); changed = true; }
        }
      }
    } while (changed);
    return ids;
  };
  const reason = async row => {
    const ids = protectedIds();
    if (ids.has(row.id)) return 'running task or family';
    if (ids.has(row.source?.subagent?.thread_spawn?.parent_thread_id)) return 'running parent';
    try { if (Date.now() - (await stat(row.path)).mtimeMs < minIdleMinutes * 60000) return 'recent mtime'; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  const targets = [];
  for (const row of rows) {
    const why = await reason(row);
    if (why) { result.skipped++; result.threads.push({ id: row.id, status: 'skipped', reason: why }); }
    else targets.push(row);
  }
  if (!targets.length) return result;
  const client = await open();
  const inSessions = path => typeof path === 'string' && resolve(path).startsWith(root + sep);
  const read = async row => (await client.rpc('thread/read', { threadId: row.id, includeTurns: false })).thread;
  try {
    for (const row of targets) {
      let state = 'failed', why;
      try {
        const thread = await read(row);
        if (thread.originator !== 'agent_fleet') { state = 'skipped'; why = 'non-fleet originator'; }
        else if (thread.path && !inSessions(thread.path)) { state = 'archived'; why = 'already archived (cascade)'; }
        else if (!thread.path) throw new Error('thread/read missing path');
        else if ((why = await reason({ ...row, path: thread.path }))) state = 'skipped';
        else if (dryRun) { state = 'candidate'; why = 'idle fleet thread'; }
        else {
          await client.rpc('thread/archive', { threadId: row.id });
          state = 'archived';
        }
      } catch (error) {
        why = redactEvidence(error.message);
        if (/active writer/i.test(why)) state = 'skipped';
        else {
          try {
            const thread = await read(row);
            if (thread.originator === 'agent_fleet' && thread.path && !inSessions(thread.path)) {
              state = 'archived'; why = 'already archived (cascade)';
            }
          } catch {}
        }
      }
      result[state === 'candidate' ? 'candidates' : state]++;
      result.threads.push({ id: row.id, status: state, ...(why ? { reason: why } : {}) });
    }
  } finally { client.close(); }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  let result;
  try {
    const index = args.indexOf('--min-idle-minutes');
    const minutes = index < 0 ? 10 : Number(args[index + 1]);
    if (!Number.isFinite(minutes) || minutes < 0) throw new Error('--min-idle-minutes requires a nonnegative number');
    if (args.some(arg => !['--dry-run', '--json', '--quiet', '--min-idle-minutes'].includes(arg) && !(index >= 0 && args.indexOf(arg) === index + 1))) throw new Error('unknown option');
    result = await sweep({ minIdleMinutes: minutes, dryRun: args.includes('--dry-run') });
  } catch (error) { result = { archived: 0, skipped: 0, failed: 1, candidates: 0, error: redactEvidence(error.message), threads: [] }; }
  if (args.includes('--quiet')) return;
  if (args.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    if (args.includes('--dry-run')) for (const row of result.threads) console.log(`${row.id || row.path}: ${row.status}${row.reason ? ` (${row.reason})` : ''}`);
    console.log(`archive-sweep: archived ${result.archived}, skipped ${result.skipped}, failed ${result.failed}${args.includes('--dry-run') ? `, candidates ${result.candidates}` : ''}`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
