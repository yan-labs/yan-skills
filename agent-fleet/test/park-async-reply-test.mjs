import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';

const dir = mkdtempSync(join(tmpdir(), 'fleet-park-async-'));
const runs = join(dir, 'runs'), bin = join(dir, 'bin');
mkdirSync(runs); mkdirSync(bin);
Object.assign(process.env, { HOME: dir, AGENT_FLEET_RUNS_DIR: runs, AGENT_FLEET_LEDGER: join(dir, 'ledger'), FLEET_NO_ARCHIVE_SWEEP: '1', FLEET_SLOT_CAPACITY: '4', FLEET_DETACHED_RUN_ID: 'parent', FLEET_SLOT_RUN_ID: 'parent', PATH: `${bin}:${process.env.PATH}`, TEST_DIR: dir });
for (const key of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'FLEET_CODEX_BACKEND']) delete process.env[key];
const gh = join(bin, 'gh');
writeFileSync(gh, `#!/usr/bin/env node
require('fs').writeFileSync(process.env.TEST_DIR+'/gh-started','yes');
setTimeout(()=>console.log(JSON.stringify({status:'in_progress',headSha:'${'a'.repeat(40)}'})),5000);
`, { mode: 0o755 });
const mock = join(dir, 'mock.cjs');
writeFileSync(mock, `#!/usr/bin/env node
const fs=require('fs'), dir=process.env.TEST_DIR;
const send=x=>process.stdout.write(JSON.stringify(x)+'\\n');
process.on('SIGINT',()=>process.exit(0));
require('readline').createInterface({input:process.stdin}).on('line',line=>{
 const q=JSON.parse(line);
 if(q.method==='thread/start'||q.method==='thread/resume')return send({id:q.id,result:{thread:{id:'thread'}}});
 if(q.method==='turn/start'){
  send({id:q.id,result:{turn:{id:'turn'}}}); send({method:'turn/started',params:{turn:{id:'turn'}}});
  if(!fs.existsSync(dir+'/started')){
   fs.writeFileSync(dir+'/started','yes');
   fs.writeFileSync(dir+'/runs/parent.yield',JSON.stringify({type:'park',until:'any:'+JSON.stringify(['reply','gh-run:https://github.com/fixture/repo/actions/runs/1@${'a'.repeat(40)}']),say:'resume',at:Date.now(),timeoutMs:1000,timeouts:0}));
  }
  send({method:'turn/completed',params:{turn:{id:'turn',status:'completed'}}});return;
 }
 if(q.method==='turn/interrupt'){send({id:q.id,result:{}});send({method:'turn/completed',params:{turn:{id:'turn',status:'interrupted'}}});return;}
 if(q.id!==undefined)send({id:q.id,result:{}});
});
`, { mode: 0o755 });
process.env.FLEET_CODEX_BIN = mock;
writeFileSync(join(runs, 'parent.json'), JSON.stringify({runId:'parent',childPid:process.pid,status:'running',detach:true}));
const { runCode } = await import('../src/code-runner.mjs');
const { appendInbox } = await import('../src/inbox.mjs');
const pending = runCode({prompt:'fixture',cwd:dir,codexBin:mock,noContinue:true});
for (let i=0; i<400 && !existsSync(join(dir,'gh-started')); i++) await delay(25);
assert(existsSync(join(dir,'gh-started')), 'async probe started');
const replyAt = Date.now();
appendInbox('parent', {type:'say',text:'answer while probing'});
await pending;
assert(Date.now() - replyAt < 4000, 'reply wakes the parked run before the slow probe finishes');
const result = JSON.parse(readFileSync(join(runs,'parent.yield'),'utf8')).result;
assert.equal(result.status, 'done', 'reply received during async probe wins over timeout');
assert(result.results.some(r => r?.text?.includes('answer while probing')));
console.log('PASS - reply during async probe is processed before timeout');
