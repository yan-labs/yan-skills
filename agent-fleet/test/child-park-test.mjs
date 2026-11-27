import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync,readFileSync,readdirSync,existsSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
const root=join(process.cwd(),'..'), dir=mkdtempSync(join(tmpdir(),'fleet-child-park-'));
mkdirSync(dir,{recursive:true}); mkdirSync(join(dir,'home'),{recursive:true}); mkdirSync(join(dir,'runs'),{recursive:true});
Object.assign(process.env,{HOME:join(dir,'home'),TMPDIR:dir,AGENT_FLEET_RUNS_DIR:join(dir,'runs'),AGENT_FLEET_LEDGER:join(dir,'ledger'),FLEET_NO_ARCHIVE_SWEEP:'1',FLEET_SLOT_CAPACITY:'4',FLEET_DETACHED_RUN_ID:'parent',FLEET_SLOT_RUN_ID:'parent',MOCK_ROOT:root,MOCK_DIR:dir});
for (const k of ['CLAUDECODE','CLAUDE_CODE_ENTRYPOINT','FLEET_CODEX_BACKEND']) delete process.env[k];
const mock=join(dir,'mock.cjs');
writeFileSync(mock,`#!/usr/bin/env node
const fs=require('fs'), cp=require('child_process'), path=require('path');
const dir=process.env.MOCK_DIR, send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
process.on('SIGINT',()=>process.exit(0));
require('readline').createInterface({input:process.stdin}).on('line',line=>{
 const q=JSON.parse(line); if(q.method==='thread/start'||q.method==='thread/resume')return send({id:q.id,result:{thread:{id:'thread'}}});
 if(q.method==='turn/start'){
  send({id:q.id,result:{turn:{id:'turn'}}}); send({method:'turn/started',params:{turn:{id:'turn'}}});
  if(process.env.MOCK_CHILD==='1'){fs.writeFileSync(path.join(dir,'child-ready'),'ready');return;}
  if(fs.existsSync(path.join(dir,'launched'))){send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});return;}
  fs.writeFileSync(path.join(dir,'launched'),'yes');
  const p=cp.spawn(process.execPath,[path.join(process.env.MOCK_ROOT,'agent-fleet/bin/agent-fleet.mjs'),'code','child fixture','--cwd',dir,'--name','isolated-child','--no-continue'],{env:{...process.env,MOCK_CHILD:'1'},stdio:'ignore'});
  fs.writeFileSync(path.join(dir,'launch-result'),JSON.stringify({launcherPid:p.pid}));
  const timer=setInterval(()=>{if(!fs.existsSync(path.join(dir,'child-ready')))return; clearInterval(timer); fs.writeFileSync(path.join(dir,'runs/parent.yield'),JSON.stringify({type:'park',until:'file:ready',say:'resume',at:Date.now(),timeoutMs:15000,timeouts:0})); send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});},30);return;
 }
 if(q.method==='turn/interrupt'){send({id:q.id,result:{}});send({method:'turn/completed',params:{turn:{id:'turn',status:'interrupted'}}});return;}
 if(q.id!==undefined)send({id:q.id,result:{}});
});
`);chmodSync(mock,0o755);process.env.FLEET_CODEX_BIN=mock;
writeFileSync(join(dir,'runs/parent.json'),JSON.stringify({runId:'parent',childPid:process.pid,status:'running',detach:true}));
const {runCode}=await import(pathToFileURL(join(root,'agent-fleet/src/code-runner.mjs')));
const {queueRecord}=await import(pathToFileURL(join(root,'agent-fleet/src/queue.mjs')));
const {readState,stopDetached}=await import(pathToFileURL(join(root,'agent-fleet/src/detach.mjs')));
const pending=runCode({prompt:'parent fixture',cwd:dir,codexBin:mock,noContinue:true});
let rec, readyScheduled=false;
try {
 for(let i=0;i<800;i++){await delay(25); if (!readyScheduled && existsSync(join(dir,'runs/parent.yield'))) { readyScheduled=true; setTimeout(()=>writeFileSync(join(dir,'ready'),'ready'),1000); }const f=readdirSync(join(dir,'runs')).find(x=>x.includes('-detach-')&&x.endsWith('.json')&&!x.endsWith('.pid.json')&&!x.endsWith('.queue.json')&&!x.endsWith('.stages.json'));if(f)rec=JSON.parse(readFileSync(join(dir,'runs',f)));if(existsSync(join(dir,'runs/parent.pid.json')) && JSON.parse(readFileSync(join(dir,'runs/parent.pid.json'))).codexPid===null && rec?.pid)break;}
 if(!rec)throw new Error('child missing: '+(existsSync(join(dir,'launch-result'))?readFileSync(join(dir,'launch-result'),'utf8'):'no launcher result'));
 let alive=true;try{process.kill(rec.pid,0)}catch{alive=false};
 let workerAlive=true; try { process.kill(rec.childPid,0); } catch { workerAlive=false; }
 await pending;
 assert.equal(JSON.parse(readFileSync(join(dir,'runs/parent.yield'),'utf8')).result.status,'done','condition satisfied between probes must not time out');
 assert.equal(alive,true,'park must preserve independent child supervisor');
 assert.equal(workerAlive,true,'park must preserve child executor');
 console.log('PASS - parent park preserves detached child supervisor and executor while launcher waits');
} finally { if(rec?.pid) await stopDetached(readState(rec.runId)); }
