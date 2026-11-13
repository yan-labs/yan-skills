import { existsSync, readFileSync } from 'node:fs';

// These names are shared with future queue/yield implementations.
export const FLEET_EVENTS = Object.freeze({ QUEUED: 'queued', STEER: 'steer', HANDOFF: 'handoff', BLOCKED: 'blocked', PARK: 'park', WAKE: 'wake', ASK: 'ask' });
export const fleetEvent = event => JSON.stringify({ method: `fleet/${event}`, emittedAtMs: Date.now() });
export const isWaitCommand = command => /\b(?:sleep|fleet(?:-go)?\s+wait|fleet-go\s+new|write_stdin)\b/i.test(command || '');

export function grokTimelineEvent(event, receivedAt, id) {
  const timestamp = event.emittedAtMs ?? event.timestamp;
  const parsed = typeof timestamp === 'number' ? timestamp : Date.parse(timestamp);
  const emittedAtMs = Number.isFinite(parsed) ? parsed : receivedAt;
  const item = { id, type: 'commandExecution' };
  if (event.type === 'tool_call') {
    item.wait = isWaitCommand(event.rawInput?.command);
    return { method: 'grok/tool/started', emittedAtMs, params: { item } };
  }
  if (event.type === 'tool_call_update' && ['completed', 'failed'].includes(event.status))
    return { method: 'grok/tool/completed', emittedAtMs, params: { item } };
  return null;
}

export function analyzeTimeline(text) {
  const totals = { cmdMs: 0, waitMs: 0, modelMs: 0, disconnectMs: 0, parkedMs: 0, queuedMs: 0, pollCount: 0, askCount: 0 };
  const running = new Map();
  let previous, disconnected = false, parked = false, queued = false, grok = false;
  for (const line of String(text).split('\n')) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const t = e.emittedAtMs;
    if (!Number.isFinite(t)) continue;
    if (previous !== undefined && t >= previous) {
      const duration = t - previous;
      const kinds = [...running.values()];
      const key = parked ? 'parkedMs' : queued ? 'queuedMs' : kinds.includes('wait') ? 'waitMs' : kinds.length ? 'cmdMs' : disconnected ? 'disconnectMs' : 'modelMs';
      totals[key] += duration;
    }
    previous = t;
    if (disconnected) disconnected = false;
    const item = e.params?.item;
    if (typeof e.method === 'string' && e.method.startsWith('grok/')) grok = true;
    if (['item/started', 'grok/tool/started'].includes(e.method) && item?.type === 'commandExecution') {
      const wait = e.method === 'grok/tool/started' ? item.wait : isWaitCommand(item.command);
      running.set(item.id, wait ? 'wait' : 'cmd');
      if (wait) totals.pollCount++;
    }
    if (['item/completed', 'grok/tool/completed'].includes(e.method) && item?.type === 'commandExecution') running.delete(item.id);
    if (e.method === 'grok/segment/end') running.clear();
    if (e.method === 'error' && /reconnecting/i.test(JSON.stringify(e.params))) disconnected = true;
    if (e.method === 'fleet/queued') queued = true;
    if (e.method === 'fleet/wake') { parked = false; queued = false; }
    if (e.method === 'fleet/park') parked = true;
    if (e.method === 'fleet/ask') totals.askCount++;
  }
  return { ...totals, activeMs: totals.cmdMs + totals.waitMs + totals.modelMs + totals.disconnectMs,
    timeSource: grok ? 'Grok streaming-json event timestamp or local receipt time; cmd and wait are exclusive tool wall time, wait is command-pattern estimate, model is residual; queue from fleet events' : 'app-server emittedAtMs; model is residual, wait is command-pattern estimate; unavailable events are zero' };
}
export function timelineFile(path) { return analyzeTimeline(path && existsSync(path) ? readFileSync(path, 'utf8') : ''); }
