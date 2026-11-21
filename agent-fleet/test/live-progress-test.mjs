import assert from 'node:assert/strict';
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { progressLine, readProgress, reportProgress, progressLimiter } from '../src/live-progress.mjs';
import { buildBrief, formatBriefHuman } from '../src/brief.mjs';
process.env.FLEET_TEST_SECRET = 'fixture-secret-123';
const usage={input_tokens:10,cache_read_input_tokens:80,cache_creation_input_tokens:10,output_tokens:3};
const brief=buildBrief({ok:true,result:'完成',usage,modelUsage:{fixture:{inputTokens:10}}});
assert.deepEqual(brief.usage,usage); assert.equal(brief.modelUsage.fixture.inputTokens,10);
assert.match(formatBriefHuman(brief),/缓存命中率 80.00%/);
assert.match(formatBriefHuman({...brief,usage:{input_tokens:10}}),/缓存命中率 未知/);
for (const [event, model, expected] of [
  [{method:'item/started',params:{item:{type:'commandExecution',command:'pnpm test --token=fixture-secret-123'}}},'codex',/运行 pnpm test/],
  [{type:'tool_use',name:'Edit',input:{file_path:'src/a.js'}},'gemini',/改 src\/a.js/],
  [{type:'tool_call',input:{command:'git status'}},'grok',/运行 git status/],
  [{method:'fleet/park'},'codex',/\[park\]/],
]) {
  const line=progressLine(JSON.stringify(event),model);
  assert.match(line,expected); assert.doesNotMatch(line,/fixture-secret-123/); assert.ok(line.length<=160);
}
assert.equal(progressLine(JSON.stringify({type:'text',data:'private'})),null);
const limited=[]; const limiter=progressLimiter(line=>limited.push(line));
for(let i=0;i<1000;i++) limiter.add(`12:00:00 [codex] ${i%2?'运行':'改'} ${i}`);
limiter.finish(); assert.equal(limited.length,301); assert.match(limited.at(-1),/省略 700/);
const merged=[]; const same=progressLimiter(line=>merged.push(line));
same.add('12:00:00 [codex] 运行 a'); same.add('12:00:01 [codex] 运行 b'); same.finish();
assert.equal(merged.length,2); assert.match(merged[1],/另有 1 条/);

const root=mkdtempSync(join(tmpdir(),'fleet-live-'));
try {
  const runs=join(root,'runs'); mkdirSync(runs);
  const log=join(runs,'fixture.log'); writeFileSync(log,'');
  const report=join(root,'report.md'); writeFileSync(report,'V1｜已过｜mock\n');
  assert.match(reportProgress(report)[0],/\[report\] V1｜已过/);
  const state=join(runs,'fixture.json');
  const rec={detach:true,runId:'fixture',status:'queued',model:'codex',logPath:log,cwd:root};
  const save=()=>writeFileSync(state,JSON.stringify(rec)); save();
  const env={...process.env,AGENT_FLEET_RUNS_DIR:runs};
  async function check(quiet) {
    rec.status='queued'; save(); writeFileSync(log,'');
    const start=Date.now(); let first,out='';
    const child=spawn(process.execPath,[resolve('bin/agent-fleet.mjs'),'wait','fixture',...(quiet?['--quiet']:[])],{env,cwd:root});
    child.stdout.on('data',b=>{out+=b;if(!first&&out.includes('运行'))first=Date.now()-start;});
    const event=command=>JSON.stringify({method:'item/started',params:{item:{type:'commandExecution',command}}})+'\n';
    await new Promise(r=>setTimeout(r,250)); appendFileSync(log,event('step-one'));
    await new Promise(r=>setTimeout(r,700));
    if(!quiet){assert.ok(first<2000,`first line: ${first}`);assert.match(out,/step-one/);}
    appendFileSync(log,JSON.stringify({type:'tool_use',name:'Edit',input:{file_path:'step-two'}})+'\n');
    await new Promise(r=>setTimeout(r,700)); if(!quiet)assert.match(out,/step-two/);
    rec.status='done';rec.brief={verdict:'ok',model:'codex'};save();
    const code=await new Promise(r=>child.on('close',r));assert.equal(code,0);
    if(quiet)assert.doesNotMatch(out,/step-one|step-two/);assert.ok(out.trim());
  }
  await check(false);await check(true);
  writeFileSync(log,'{"method":"fleet/wake"}');assert.equal(readProgress(log).lines.length,0);
  appendFileSync(log,'\n');assert.equal(readProgress(log).lines.length,1);
  console.log('live progress: mock streaming, quiet, parsing and redaction passed');
} finally {rmSync(root,{recursive:true,force:true});}
