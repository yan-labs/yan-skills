import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { redactEvidence } from './brief.mjs';
import { collectStatus } from './control.mjs';
import { pendingFor } from './requests.mjs';
import { runsDir } from './progress.mjs';
const read = p => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; } };
const mtime = p => { try { return statSync(p).mtime.toISOString(); } catch { return null; } };
for (const r of collectStatus().filter(r => ['running','queued','parked','waiting','abnormal'].includes(r.state))) {
  const y = read(join(runsDir(), `${r.runId}.yield`));
  const pending = pendingFor(r.runId).map(a => ({...a, ageMs: Date.now() - Date.parse(a.at)}));
  const stages = read(join(runsDir(), `${r.runId}.stages.json`));
  const git = r.cwd ? spawnSync('git', ['-C', r.cwd, 'log', '-1', '--format=%cI %h'], {encoding:'utf8', timeout:3000}) : null;
  let logTail = ''; try { logTail = redactEvidence(readFileSync(r.logPath, 'utf8').split('\n').slice(-12).join('\n')); } catch {}
  console.log(JSON.stringify({runId:r.runId,name:r.name,state:r.state,logTail,plan:stages ? { current: stages.stage, stages: stages.stages } : y?.type === 'plan' ? y.text : y?.pendingPlan, latestCommit: git?.status === 0 ? git.stdout.trim() : null,park:y?.type === 'park' && !y.resolvedAt ? {...y, ageMs:Date.now()-y.at} : null,pending,reportModified:mtime(r.reportPath),logModified:mtime(r.logPath),cwd:r.cwd}));
}
