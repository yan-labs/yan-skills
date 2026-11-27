import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { runsDir } from './progress.mjs';
import { redactEvidence } from './brief.mjs';
import { isRunStateFile } from './pid.mjs';

function json(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
function lines(path) { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); } catch { return []; } }
// Cache parsed records, but stat every candidate so updates and deletions remain visible.
const recordCache = new Map();
export function records() {
  const root = runsDir();
  if (!existsSync(root)) { recordCache.clear(); return []; }
  const paths = readdirSync(root).filter(isRunStateFile).map(n => join(root, n));
  const present = new Set(paths);
  for (const path of recordCache.keys()) if (!present.has(path)) recordCache.delete(path);
  return paths.flatMap(path => {
    try {
      const st = statSync(path);
      const signature = `${st.ino}:${st.size}:${st.mtimeMs}:${st.ctimeMs}`;
      let cached = recordCache.get(path);
      if (!cached || cached.signature !== signature) {
        const value = json(path);
        cached = { signature, value: value?.detach && value.runId ? value : null };
        recordCache.set(path, cached);
      }
      const r = cached.value;
      return r?.detach && r.runId ? [r] : [];
    } catch { recordCache.delete(path); return []; }
  });
}
export function linkedReview(ask, maker, reviewRecords = records()) {
  return reviewRecords.filter(r => {
    if (!(Date.parse(r.startedAt) >= Date.parse(ask.at))) return false;
    const meta = r.briefPath && json(r.briefPath.replace(/\.md$/, '.json'));
    return meta?.review && meta.for === maker?.name;
  }).sort ( (a,b) => String(a.startedAt).localeCompare(String(b.startedAt)) )[0] || null;
}
export function pendingFor(id, getReviewRecords = records) {
  const root = runsDir();
  const asks = lines(join(root, `${id}.asks`));
  if (!asks.length) return [];
  const maker = json(join(root, `${id}.json`));
  const replies = lines(join(root, `${id}.inbox`)).filter(r => r.type === 'say');
  return asks.map(a => ({ ...a, text: redactEvidence(a.text || '') })).filter(a => {
    if (!a.id || !a.at) return false;
    if (a.kind === 'review') return !linkedReview(a, maker, getReviewRecords());
    return !replies.some(r => r.askId === a.id);
  });
}
export function allPending() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(n => n.endsWith('.asks')).flatMap(n => pendingFor(n.slice(0, -5)));
}
