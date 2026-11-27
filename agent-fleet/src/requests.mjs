import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runsDir } from './progress.mjs';
import { redactEvidence } from './brief.mjs';
import { isRunStateFile } from './pid.mjs';

function json(path) { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } }
function lines(path) { try { return readFileSync(path, 'utf8').split('\n').filter(Boolean).flatMap(line => { try { return [JSON.parse(line)]; } catch { return []; } }); } catch { return []; } }
export function records() {
  if (!existsSync(runsDir())) return [];
  return readdirSync(runsDir()).filter(isRunStateFile).map(n => json(join(runsDir(), n))).filter(r => r?.detach && r.runId);
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
