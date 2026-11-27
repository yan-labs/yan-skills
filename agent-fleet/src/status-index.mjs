// Cache only immutable-looking, old terminal records. Active and recent runs are
// always read; file identity and timestamps invalidate cached entries.
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { runsDir } from './progress.mjs';

export function indexedRecords(names, read, kind) {
  const root = runsDir();
  const dir = join(homedir(), '.agent-fleet');
  const key = createHash('sha256').update(resolve(root) + '\0' + kind).digest('hex');
  const path = join(dir, `status-index-${key}.json`);
  let previous = {};
  try { const data = JSON.parse(readFileSync(path, 'utf8')); if (data?.version === 1) previous = data.entries; } catch {}
  const entries = {};
  const out = [];
  const signature = name => {
    try { const s = statSync(join(root, name), { bigint: true }); return [s.ino, s.size, s.mtimeNs, s.ctimeNs].join(':'); } catch { return null; }
  };
  const cutoff = Date.now() - 86_400_000;
  for (const name of names) {
    const before = signature(name);
    const cached = previous?.[name];
    const cachedRecord = cached?.record;
    const cachedFinished = Date.parse(kind === 'detached' ? cachedRecord?.finishedAt : cachedRecord?.finishedAt ?? cachedRecord?.startedAt);
    const cachedTerminal = kind === 'detached' ? cachedRecord?.detach && !['running', 'queued', 'parked', 'waiting', 'abnormal'].includes(cachedRecord.status) : cachedRecord?.finished === true;
    if (before && cached?.signature === before && cachedTerminal && Number.isFinite(cachedFinished) && cachedFinished < cutoff) {
      entries[name] = cached;
      out.push(cached.record);
      continue;
    }
    const record = read(name);
    if (!record) continue;
    out.push(record);
    const finished = Date.parse(kind === 'detached' ? record.finishedAt : record.finishedAt ?? record.startedAt);
    const terminal = kind === 'detached'
      ? !['running', 'queued', 'parked', 'waiting', 'abnormal'].includes(record.status)
      : !!record.finished;
    if (terminal && Number.isFinite(finished) && finished < cutoff && before && before === signature(name)) {
      const fields = kind === 'detached'
        ? ['runId', 'detach', 'status', 'finishedAt', 'startedAt', 'briefPath']
        : ['runId', 'finished', 'finishedAt', 'startedAt'];
      entries[name] = { signature: before, record: Object.fromEntries(fields.filter(k => record[k] !== undefined).map(k => [k, record[k]])) };
    }
  }
  let temp;
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    temp = `${path}.${process.pid}.${randomUUID()}`;
    writeFileSync(temp, JSON.stringify({ version: 1, entries }), { mode: 0o600 });
    renameSync(temp, path);
  } catch { if (temp) try { unlinkSync(temp); } catch {} }
  return out;
}
