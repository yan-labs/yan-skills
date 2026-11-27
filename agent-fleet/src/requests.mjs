import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runsDir } from './progress.mjs';
import { redactEvidence } from './brief.mjs';

function json(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
function lines(path) { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); } catch { return []; } }
export function records() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(n => n.endsWith('.json')).map(n => json(join(runsDir(), n))).filter(r => r?.detach && r.runId);
}
export function linkedReview(ask, maker) {
  return records().filter(r => {
    const meta = r.briefPath && json(r.briefPath.replace(/\.md$/, '.json'));
    return meta?.review && meta.for === maker?.name && Date.parse(r.startedAt) >= Date.parse(ask.at);
  }).sort ( (a,b) => String(a.startedAt).localeCompare(String(b.startedAt)) )[0] || null;
}
export function pendingFor(id) {
  const root = runsDir();
  const maker = json(join(root, `${id}.json`));
  const replies = lines(join(root, `${id}.inbox`)).filter(r => r.type === 'say');
  return lines(join(root, `${id}.asks`)).map(a => ({ ...a, text: redactEvidence(a.text || '') })).filter(a => {
    if (!a.id || !a.at) return false;
    if (a.kind === 'review') return !linkedReview(a, maker);
    return !replies.some(r => r.at && r.at >= a.at);
  });
}
export function allPending() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(n => n.endsWith('.asks')).flatMap(n => pendingFor(n.slice(0, -5)));
}
