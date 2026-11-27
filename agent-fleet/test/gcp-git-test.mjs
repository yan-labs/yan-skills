import assert from 'node:assert/strict';
import { remoteGit } from '../src/gcp-git.mjs';

const config = { sshConfig: '/tmp/fleet-ssh.conf', host: 'worker-1', cwd: '/home/worker/task' };
let seen;
const run = (binary, argv, opts) => { seen = { binary, argv, opts }; return { status: 0, stdout: 'abc\n' }; };
assert.equal(remoteGit(config, ['log', "a'b"], { run }), 'abc\n');
assert.equal(seen.binary, '/usr/bin/ssh');
assert.ok(seen.argv.at(-1).includes("'a'\\''b'"));
assert.ok(seen.argv.at(-1).startsWith("cd -- '/home/worker/task' && exec git "));
assert.throws(() => remoteGit({ ...config, cwd: '/home/a/../x' }, ['status'], { run }), /workspace/);
assert.throws(() => remoteGit({ ...config, host: '-bad' }, ['status'], { run }), /transport/);
assert.throws(() => remoteGit(config, ['status'], { run: () => ({ status: 255 }) }), /exit 255/);
assert.throws(() => remoteGit(config, ['status'], { run: () => ({ error: new Error('ssh down') }) }), /transport failed/);
console.log('GCP remote git transport tests passed');

const { snapshotGit, inspectGit } = await import('../src/brief.mjs');
const { readContinuationState } = await import('../src/code-continue.mjs');
const commands = [];
const gitRunner = args => {
  commands.push(args);
  if (args.includes('--is-inside-work-tree')) return 'true\n';
  if (args[0] === 'rev-parse') return 'a'.repeat(40) + '\n';
  if (args[0] === 'log') return 'abc1234\n';
  return '';
};
const before = snapshotGit('/nonexistent/local-mirror', gitRunner);
assert.equal(before.isRepo, true);
assert.deepEqual(inspectGit('/nonexistent/local-mirror', before, gitRunner).newCommits, ['abc1234']);
assert.equal(readContinuationState('/nonexistent/local-mirror', null, '', null, null, gitRunner).head, 'a'.repeat(40));
assert.ok(commands.length > 4);
assert.throws(() => snapshotGit('/tmp', () => { throw new Error('SSH down'); }), /SSH down/);
assert.throws(() => readContinuationState('/tmp', null, '', null, null, () => { throw new Error('SSH down'); }), /SSH down/);
