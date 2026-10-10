import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { sweep } from '../bin/fleet-archive-sweep.mjs';
import { launchArchiveSweep } from '../src/code-runner.mjs';

const scratch = mkdtempSync(join(tmpdir(), 'archive-sweep-'));
const root = join(scratch, 'sessions');
mkdirSync(root);
const paths = new Map();
function fixture(id, originator = 'agent_fleet', source, recent = false) {
  const path = join(root, `rollout-${id}.jsonl`);
  writeFileSync(path, JSON.stringify({ type: 'session_meta', payload: { id, originator, source } }) + '\n');
  if (!recent) utimesSync(path, 1, 1);
  paths.set(id, path);
}
try {
  fixture('running'); fixture('child', 'agent_fleet', { subagent: { thread_spawn: { parent_thread_id: 'running' } } });
  fixture('foreign', 'codex_cli'); fixture('recent', 'agent_fleet', undefined, true);
  for (const id of ['parent', 'cascade', 'writer', 'bad', 'last', 'changed']) fixture(id);
  const calls = [];
  let opened = 0, closed = 0;
  const client = { close() { closed++; }, async rpc(method, { threadId: id }) {
    calls.push([method, id]);
    if (method === 'thread/read') return { thread: { originator: id === 'changed' ? 'vscode' : 'agent_fleet', path: paths.get(id) } };
    if (id === 'writer') throw new Error('thread already has an active writer');
    if (id === 'bad') throw new Error('mock archive failed');
    paths.set(id, join(scratch, 'archived_sessions', id));
    if (id === 'cascade') paths.set('parent', join(scratch, 'archived_sessions', 'parent'));
    return {};
  } };
  const options = { root, status: () => [{ state: 'running', threadId: 'running' }], open: async () => { opened++; return client; } };
  const dry = await sweep({ ...options, dryRun: true });
  assert.equal(dry.candidates, 5);
  assert.equal(dry.skipped, 4);
  assert(!calls.some(([method]) => method === 'thread/archive'));
  calls.length = 0;
  const result = await sweep(options);
  assert.equal(result.archived, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.skipped, 5);
  assert(result.threads.some(row => row.reason === 'already archived (cascade)'));
  assert(!calls.some(([method, id]) => method === 'thread/archive' && ['running', 'child', 'foreign', 'recent', 'changed'].includes(id)));
  assert(!calls.some(([, id]) => ['running', 'child', 'foreign', 'recent'].includes(id)));
  assert(calls.some(([method, id]) => method === 'thread/archive' && id === 'last'), 'single failure does not stop sweep');
  assert.equal(opened, closed);
  const broken = join(scratch, 'broken'); mkdirSync(broken);
  writeFileSync(join(broken, 'rollout-bad.jsonl'), '{broken');
  const brokenResult = await sweep({ root: broken, status: () => [], open: () => { throw new Error('must not start'); } });
  assert.equal(brokenResult.failed, 1);
  const family = join(scratch, 'family'); mkdirSync(family);
  for (const [id, parent] of [['ancestor'], ['middle', 'ancestor'], ['active', 'middle']]) {
    const path = join(family, `rollout-${id}.jsonl`);
    writeFileSync(path, JSON.stringify({ type: 'session_meta', payload: { id, originator: 'agent_fleet',
      source: { subagent: { thread_spawn: { parent_thread_id: parent } } } } }) + '\n');
    utimesSync(path, 1, 1);
  }
  const familyResult = await sweep({ root: family, status: () => [{ state: 'running', threadId: 'active' }],
    open: () => { throw new Error('must not archive running family'); } });
  assert.equal(familyResult.skipped, 3);
  const empty = join(scratch, 'empty'); mkdirSync(empty);
  await sweep({ root: empty, status: () => [], open: () => { throw new Error('must not start'); } });
  let launched = 0, unref = 0;
  const spawnChild = (_bin, args, options) => {
    launched++; assert.deepEqual(args, ['missing.mjs', '--quiet']);
    assert.equal(options.detached, true); assert.equal(options.stdio, 'ignore');
    const child = new EventEmitter(); child.unref = () => unref++;
    queueMicrotask(() => child.emit('error', new Error('mock spawn error')));
    return child;
  };
  launchArchiveSweep({ env: { FLEET_NO_ARCHIVE_SWEEP: '1' }, spawnChild });
  assert.equal(launched, 0);
  launchArchiveSweep({ env: {}, spawnChild, script: 'missing.mjs' });
  assert.equal(launched, 1); assert.equal(unref, 1);
  launchArchiveSweep({ env: {}, spawnChild: () => { throw new Error('mock synchronous failure'); } });
  await new Promise(resolve => setImmediate(resolve));
  // A missing or failing sweep exits separately; the dispatching process continues.
  for (const script of [join(scratch, 'missing.mjs'), join(scratch, 'fail.mjs')]) {
    if (script.endsWith('fail.mjs')) writeFileSync(script, "throw new Error('mock script failure');");
    launchArchiveSweep({ env: {}, script });
  }
  const cliSource = resolve('bin/agent-fleet.mjs');
  assert(existsSync(cliSource));
  const cli = spawn(process.execPath, [cliSource, 'code', '--help'], {
    env: { ...process.env, FLEET_NO_ARCHIVE_SWEEP: '1' }, stdio: 'ignore',
  });
  assert.equal(await new Promise(resolve => cli.on('close', resolve)), 0);
  console.log('archive-sweep-test: ok');
} finally { rmSync(scratch, { recursive: true, force: true }); }
