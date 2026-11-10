import assert from 'node:assert/strict';
import { analyzeTimeline, fleetEvent, FLEET_EVENTS } from '../src/timeline.mjs';
import { buildRow, LedgerIndex } from '../src/ledger.mjs';
const event = (method, time, item) => JSON.stringify({ method, emittedAtMs: time, ...(item ? { params: { item } } : {}) });
const cmd = { id: 'a', type: 'commandExecution', command: 'echo hello' };
const wait = { id: 'b', type: 'commandExecution', command: 'sleep 10' };
const log = [event('turn/started', 0), event('item/started', 1000, cmd), event('item/completed', 3000, cmd), event('item/started', 4000, wait), event('item/completed', 7000, wait), event('fleet/park', 8000), event('fleet/wake', 12000), event('fleet/ask', 13000)].join('\n');
const t = analyzeTimeline(log);
assert.equal(t.cmdMs, 2000); assert.equal(t.waitMs, 3000); assert.equal(t.parkedMs, 4000); assert.equal(t.modelMs, 4000); assert.equal(t.pollCount, 1); assert.equal(t.askCount, 1);
for (const command of ['fleet-go new child --to gpt', 'fleet wait child']) {
  const item = { id: 'child', type: 'commandExecution', command };
  const result = analyzeTimeline([event('item/started', 0, item), event('item/completed', 56000, item)].join('\n'));
  assert.equal(result.waitMs, 56000); assert.equal(result.cmdMs, 0);
}
assert.equal(JSON.parse(fleetEvent(FLEET_EVENTS.STEER)).method, 'fleet/steer');
const row = buildRow({ runId: 'x', name: 'x', status: 'done', verdict: 'partial', reportConclusion: '完成：已交付', startedAt: '2026-01-01T00:00:00Z' }, new LedgerIndex());
assert.equal(row.outcome, 'complete'); assert.equal(row.cmdMs, 0);
console.log('PASS timeline and report outcome');
