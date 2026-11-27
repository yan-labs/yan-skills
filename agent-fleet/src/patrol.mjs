import { existsSync, readFileSync, statSync, opendirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { redactEvidence } from './brief.mjs';
import { collectStatus } from './control.mjs';
import { pendingFor } from './requests.mjs';
import { runsDir } from './progress.mjs';
const read = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const mtime = p => { try { return statSync(p).mtime.toISOString(); } catch { return null; } };
export function recentArtifacts(r) {
  const paths = new Set([...(r.artifacts || []), r.resultPath, r.reportPath].filter(p => typeof p === 'string'));
  const dirs = [r.artifactDir];
  if (r.name && /^[\w.-]+$/.test(r.name) && r.name !== '.' && r.name !== '..') dirs.push(join('/tmp', r.name));
  let truncated = false;
  for (const dir of dirs.filter(Boolean)) {
    try { const stream = opendirSync(dir); try { let count = 0, e; while ((e = stream.readSync())) { if (count++ >= 512) { truncated = true; break; } if (e.isFile()) paths.add(join(dir,e.name)); } } finally { stream.closeSync(); } } catch {}
  }
  const found = [...paths].flatMap(path => { try { const st = statSync(path); return st.isFile() ? [{path: redactEvidence(path), modifiedAt: st.mtime.toISOString()}] : []; } catch { return []; } });
  found.sort((a,b) => b.modifiedAt.localeCompare(a.modifiedAt));
  if (found.length > 20) truncated = true;
  return { items:found.slice(0,20), truncated };
}
for (const r of collectStatus().filter(r => ['running','queued','parked','waiting','abnormal'].includes(r.state))) {
  const y = read(join(runsDir(), `${r.runId}.yield`));
  const pending = pendingFor(r.runId).map(a => ({...a, ageMs: Date.now() - Date.parse(a.at)}));
  const stages = read(join(runsDir(), `${r.runId}.stages.json`));
  const git = r.cwd ? spawnSync('git', ['-C', r.cwd, 'log', '-1', '--format=%cI %h'], {encoding:'utf8', timeout:3000}) : null;
  let logTail = ''; try { logTail = redactEvidence(readFileSync(r.logPath, 'utf8').split('\n').slice(-12).join('\n')); } catch {}
  const pid = read(join(runsDir(), `${r.runId}.pid.json`)) || {};
  const artifactRecord = { ...pid, ...r, artifacts: [...(pid.artifacts || []), ...(r.artifacts || [])], artifactDir: r.artifactDir || pid.artifactDir };
  console.log(JSON.stringify({runId:r.runId,name:r.name,state:r.state,logTail,plan:stages ? { current: stages.stage, stages: stages.stages } : y?.type === 'plan' ? y.text : y?.pendingPlan, latestCommit: git?.status === 0 ? git.stdout.trim() : null,artifacts:recentArtifacts(artifactRecord),park:y?.type === 'park' && !y.resolvedAt ? {...y, ageMs:Date.now()-y.at} : null,pending,reportModified:mtime(r.reportPath),logModified:mtime(r.logPath),cwd:r.cwd}));
}
