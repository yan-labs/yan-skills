import assert from 'node:assert/strict';
import { createSupervision, commandObservation, escalationAction } from '../src/supervision.mjs';
import { actionsTerminal } from '../src/yield.mjs';

const minute = 60_000;
const accept = (watch, at, command, output = 'pending', exitCode = 0) =>
  watch.command(commandObservation({ command, aggregatedOutput: output, exitCode }, at * minute));

let watch = createSupervision(0);
for (const t of [1, 2, 3]) accept(watch, t, 'gh run view 123');
assert.deepEqual(watch.scan(3 * minute).hits, ['repeat', 'wait']);
watch.delivered('repeat', 3 * minute);
watch.delivered('wait', 3 * minute);
assert.equal(watch.scan(4 * minute).correction, undefined);
for (const t of [6, 9, 12, 13]) accept(watch, t, 'gh run view 123');
assert.equal(watch.scan(13 * minute).escalation, 'repeat');
const recovered = createSupervision(0, { previous: watch.scan(13 * minute) });
for (const t of [11, 12, 13]) accept(recovered, t, 'gh run view 123');
assert.equal(recovered.scan(13 * minute).correction, undefined);

watch = createSupervision(0);
for (const t of [1, 2, 3]) accept(watch, t, 'cat file' + t, `2026-11-20T00:00:0${t}Z same output`);
assert(watch.scan(3 * minute).hits.includes('repeat'));

watch = createSupervision(0);
assert(watch.scan(30 * minute).hits.includes('stalled'));
assert(!watch.scan(31 * minute, { building: true }).hits.length);
watch.pause(60 * minute);
assert(!watch.scan(67 * minute, { waiting: true }).hits.length);

watch = createSupervision(0);
assert.equal(watch.scan(0).tokenUsage, 'unknown');
for (let t = 0; t <= 10; t++) watch.token(t * minute, 1200 * t);
assert(watch.scan(10 * minute).hits.includes('tokens'));
watch.progress(10 * minute, '验收通过');
assert(!watch.scan(10 * minute).hits.includes('tokens'));

watch = createSupervision(0);
for (const [i, hash] of ['A', 'B', 'A', 'B', 'A'].entries()) watch.file(i * minute, 'file', hash);
assert(watch.scan(4 * minute).hits.includes('revert'));
watch.progress(5 * minute, '测试通过');
assert(!watch.scan(5 * minute).hits.includes('revert'));

watch = createSupervision(0);
accept(watch, 1, "bash -c 'sleep 1m; gh run view 2'");
assert(watch.scan(minute).hits.includes('wait'));
assert(!watch.scan(minute, { building: true }).hits.length);
watch = createSupervision(0);
for (const t of [1, 2, 3]) accept(watch, t, 'git log', 'new root cause ' + t);
assert.equal(watch.scan(3 * minute).hits.length, 0);

watch = createSupervision(0);
assert.equal(watch.scan(0).intervalMinutes, 10);
watch.progress(minute, '验收进展');
assert.equal(watch.scan(10 * minute).intervalMinutes, 10);
watch.progress(11 * minute, '验收进展');
assert.equal(watch.scan(20 * minute).intervalMinutes, 30);
assert.equal(watch.scan(21 * minute, { sleep: 60 }).intervalMinutes, 10);
assert.equal(createSupervision(0, { production: true }).scan(0).intervalMinutes, 10);

assert.equal(actionsTerminal({ headSha: 'old', status: 'completed', conclusion: 'success' }, 'new'), null);
assert.equal(actionsTerminal({ headSha: 'new', status: 'in_progress' }, 'new'), null);
assert.equal(actionsTerminal({ headSha: 'new', status: 'completed', conclusion: 'success' }, 'new').status, 'done');
assert.equal(actionsTerminal({ headSha: 'new', status: 'completed', conclusion: 'cancelled' }, 'new').status, 'failed');
const recovery = { enabled: true, safe: true, restarts: 0, terra: false, hits: ['repeat'] };
assert.equal(escalationAction(recovery), 'restart');
for (const flags of [{ enabled: false }, { safe: false }, { restarts: 2 }, { terra: true, hits: ['stalled'] }])
  assert.equal(escalationAction({ ...recovery, ...flags }), '交主会话');
console.log('PASS - supervision signals, progress exclusions, steering dedupe, cadence and exact Actions terminal');
