import { createHash } from 'node:crypto';

const minute = 60_000;
const digest = text => createHash('sha256').update(text).digest('hex');
const normalize = text => String(text ?? '').replace(/\b\d{4}-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d+)?Z?/g, '').trim();
const probe = /\b(?:gh (?:run|pr) view|kubectl (?:get|rollout status)|curl|git status|write_stdin)\b/;
export const sleepSeconds = command => {
  // shortcut: detect explicit shell sleeps, add shell parsing if wrappers hide recurring incidents.
  const match = command.match(/(?:^|[;&|]\s*|['"]\s*|\bdo\s+)sleep\s+(\d+(?:\.\d+)?)([smh]?)(?=[\s;'"]|$)/);
  return match ? Number(match[1]) * ({ m: 60, h: 3600 }[match[2]] || 1) : 0;
};

export function commandObservation(item, at) {
  const command = normalize(item.command);
  const output = normalize(item.aggregatedOutput ?? item.aggregated_output)
    .replace(/^(?:Chunk ID|Wall time|Original token count):[^\n]*\n/gm, '').trim();
  const exit = item.exitCode ?? item.exit_code;
  return { at, command: digest(command), output: output && digest(output),
    sleep: sleepSeconds(command), probe: probe.test(command),
    evidence: Boolean(exit === 0 && output && !probe.test(command) &&
      !/\b(?:sleep|date|echo|printf)\b/.test(command)) };
}

export function createSupervision(start, { production = false, previous = {} } = {}) {
  let progressAt = previous.progressAt ?? start, next = start, previousReview = null, good = 0, dense = true, tokenKnown = false;
  let recent = [], tokens = [], commands = [], edits = new Map(), pending = new Map();
  const knownFiles = new Map();
  const delivered = new Map(Object.entries(previous.delivered || {}));
  let restarts = previous.restarts || 0;
  const seen = new Set();
  const note = (at, kind) => { recent = [...recent.slice(-11), { at, kind }]; };
  const progress = (at, kind) => {
    progressAt = at;
    restarts = 0;
    edits.clear();
    pending.clear();
    note(at, kind);
  };
  return {
    progress,
    pause(at) { progressAt = at; commands = []; tokens = []; edits.clear(); pending.clear(); next = at; },
    command(observation) {
      const { at, output, evidence } = observation;
      if (evidence && !seen.has(output)) progress(at, '新命令结果');
      if (evidence) seen.add(output);
      commands.push(observation);
      note(at, observation.sleep >= 60 ? '显式长 sleep' : '命令完成');
    },
    token(at, total) {
      if (!Number.isFinite(total)) return;
      tokenKnown = true;
      if (tokens.length && total < tokens.at(-1).total) tokens = [];
      tokens.push({ at, total });
    },
    file(at, path, hash) {
      const history = edits.get(path) || [];
      const known = knownFiles.get(path) || new Set();
      if (known.size && !known.has(hash)) {
        progressAt = at;
        restarts = 0;
        note(at, '新产物指纹');
      }
      known.add(hash);
      knownFiles.set(path, known);
      if (history.at(-1)?.hash !== hash) history.push({ at, hash });
      edits.set(path, history.filter(entry => at - entry.at <= 20 * minute));
    },
    scan(at, { waiting = false, sleep = 0, building = false } = {}) {
      commands = commands.filter(event => at - event.at <= 10 * minute && event.at >= progressAt);
      while (tokens.length > 1 && tokens[1].at <= at - 10 * minute) tokens.shift();
      const hits = [];
      if (!waiting && !building) {
        const repeats = new Map();
        for (const item of commands) repeats.set(item.command, (repeats.get(item.command) || 0) + 1);
        const tail = commands.slice(-3);
        if ([...repeats.values()].some(count => count >= 3) ||
            (tail.length === 3 && tail[0].output && tail.every(item => item.output === tail[0].output))) hits.push('repeat');
        if (at - Math.max(progressAt, start) >= 30 * minute) hits.push('stalled');
        if (at - progressAt >= 10 * minute && tokens.length > 1 && tokens[0].at <= at - 10 * minute &&
            tokens[0].at >= progressAt - minute && at - tokens.at(-1).at <= minute &&
            (tokens.at(-1).total - tokens[0].total) * minute >= 1000 * (tokens.at(-1).at - tokens[0].at)) hits.push('tokens');
        if ([...edits.values()].some(history => {
          const samples = history.filter(entry => at - entry.at <= 20 * minute).map(entry => entry.hash);
          return samples.some((a, i) => i + 4 < samples.length && a === samples[i + 2] && a === samples[i + 4] &&
            a !== samples[i + 1] && samples[i + 1] === samples[i + 3]);
        })) hits.push('revert');
        const polls = new Map();
        for (const item of commands.filter(item => item.probe && at - item.at <= 5 * minute)) {
          const key = item.command + item.output;
          polls.set(key, (polls.get(key) || 0) + 1);
        }
        if (sleep >= 60 || commands.some(item => item.sleep >= 60) || [...polls.values()].some(count => count >= 3)) hits.push('wait');
      }
      for (const signal of pending.keys()) if (!hits.includes(signal)) pending.delete(signal);
      for (const signal of hits) if (!pending.has(signal)) pending.set(signal, at);
      const due = at >= next;
      if (hits.length) {
        if (!dense) next = at + 10 * minute;
        dense = true;
        good = 0;
      } else if (due && dense && next && previousReview !== null && progressAt > previousReview && !waiting) {
        if (++good >= 2 && !production) dense = false;
      } else if (due && dense) good = 0;
      const intervalMinutes = production || dense ? 10 : 30;
      if (due) { previousReview = at; next = at + intervalMinutes * minute; }
      return { at, progressAt, nextReviewAt: next, intervalMinutes, production, hits, tokenUsage: tokenKnown ? 'observed' : 'unknown',
        recent, delivered: Object.fromEntries(delivered), restarts, due,
        correction: hits.find(signal => !delivered.has(signal) || delivered.get(signal) < progressAt),
        escalation: hits.find(signal => delivered.has(signal) && delivered.get(signal) >= progressAt &&
          at - Math.max(delivered.get(signal), pending.get(signal)) >= 10 * minute) };
    },
    delivered(signal, at) { delivered.set(signal, at); note(at, '插话已送达'); },
    restart(at) {
      restarts++;
      progressAt = at;
      commands = []; tokens = []; edits.clear(); pending.clear();
      note(at, '安全续跑');
    },
  };
}

export function escalationAction({ enabled, safe, restarts, terra, hits }) {
  return enabled && safe && restarts < 2 && !(terra && hits.includes('stalled')) ? 'restart' : '交主会话';
}
