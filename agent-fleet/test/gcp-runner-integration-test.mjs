import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { runCode } from '../src/code-runner.mjs';
const dir = mkdtempSync('/tmp/gcp-pool-runner/runner-test-');
const report = join(dir, 'report.md');
const localRepo = '/Users/example/project';
const remoteRepo = '/home/u/workspaces/task';
const remoteReport = '/home/u/reports/task/report.md';
const marker = join(dir, 'wrong-exec');
const fake = join(dir, 'fake-codex.mjs');
const script = `#!/usr/bin/env node
import readline from 'node:readline';
import {writeFileSync} from 'node:fs';
if (process.argv[2] === 'exec') { writeFileSync(${JSON.stringify(marker)}, 'bad'); process.exit(1); }
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
const lines=readline.createInterface({input:process.stdin});
lines.on('line', line=>{
 const r=JSON.parse(line); if (!r.id) return;
 let result={};
 if (r.method==='environment/info') result={shell:{path:'/bin/sh',name:'sh'}};
 if (r.method==='thread/start') {
  const set=r.params.config?.shell_environment_policy?.set;
  if (r.params.cwd!==${JSON.stringify(remoteRepo)} || set?.FLEET_GCP_BRIDGE_FILE!=='/home/u/bridge.json') return send({id:r.id,error:{message:'bad thread configuration'}});
  result={thread:{id:'thread-one'}};
 }
 if (r.method==='turn/start') {
  const p=r.params.input[0].text;
  if (r.params.environments?.[0]?.cwd!==${JSON.stringify(remoteRepo)} || !p.includes(${JSON.stringify(remoteRepo + '/file')}) || !p.includes(${JSON.stringify(remoteReport)})) return send({id:r.id,error:{message:'bad remote mapping'}});
  send({id:r.id,result:{turn:{id:'turn-one'}}});
  setImmediate(()=>{
   send({method:'turn/started',params:{threadId:'thread-one',turn:{id:'turn-one'}}});
   send({method:'item/completed',params:{threadId:'thread-one',item:{type:'agentMessage',text:'simulated completion'}}});
   send({method:'turn/completed',params:{threadId:'thread-one',turn:{id:'turn-one',status:'completed'}}});
  }); return;
 }
 send({id:r.id,result});
});
`;
writeFileSync(fake, script, { mode: 0o700 });
writeFileSync(report, '');
process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'runs');
process.env.FLEET_NO_ARCHIVE_SWEEP = '1';
let flushes=0, pulls=0;
try {
  const result = await runCode({ prompt: `Read ${localRepo}/file\nREPORT: ${report}`, cwd: dir, reportPath: report,
    codexBin: fake, noContinue: true,
    gcpWorkspace: { environment: { id:'gcp-test', url:'ws://127.0.0.1:12345/', cwd:remoteRepo, token:'x'.repeat(32) },
      git:{}, localRepoPath:localRepo, remoteReportPath:remoteReport,
      executionEnv:{PATH:'/home/u/bin:/usr/bin:/bin', FLEET_GCP_BRIDGE_FILE:'/home/u/bridge.json'},
      flush:async()=>{flushes++;}, pullReport:()=>{pulls++;} },
    gitTransport: (_cfg,args)=>args.includes('--is-inside-work-tree') ? 'true\n' : args.includes('HEAD') ? 'a'.repeat(40)+'\n' : '' });
  assert.equal(result.ok,true, result.error);
  assert.equal(result.result,'simulated completion');
  assert.ok(flushes>=2); assert.equal(pulls,1);
  assert.equal(existsSync(marker),false);
  console.log('simulated app-server turn uses remote workspace, report mapping and environment');
} finally { rmSync(dir,{recursive:true,force:true}); }
