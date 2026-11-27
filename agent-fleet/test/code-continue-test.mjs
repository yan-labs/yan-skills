// 假 app-server 验证同线程续做，不调用真实 Codex 或付费服务。
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { writeYield, readYield, ask, watchRequest, localCondition, startBackground } from '../src/yield.mjs';
import { registerQueue, acquireSlot, queueRecord, setSlotState } from '../src/queue.mjs';
import { waitDetached } from '../src/detach.mjs';
import { readPidRecord } from '../src/pid.mjs';
import { appendInbox } from '../src/inbox.mjs';
import { setTimeout as delay } from 'node:timers/promises';
import { acceptanceResult } from '../src/verdict.mjs';
import { runCode } from '../src/code-runner.mjs';
import { CONTINUE_PROMPT, readContinuationState, continuationProgress, continuationRules, reportContinuation, unblockedItems, judgeContinuation, acceptanceContinuation } from '../src/code-continue.mjs';
import { buildBrief, formatBriefHuman, redactEvidence } from '../src/brief.mjs';
import { splitShortArgs } from '../src/shortcuts.mjs';

const scratch = mkdtempSync(join(process.env.TMPDIR || '/tmp', 'fleet-continue-'));
mkdirSync(scratch, { recursive: true });
const saved = { ...process.env };
const mock = join(scratch, 'codex-mock.cjs');
writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
let count = 0, threads = 0;
const send = obj => process.stdout.write(JSON.stringify(obj) + '\\n');
process.on('SIGINT', () => process.exit(0));
if (process.argv[2] === 'exec') {
 let prompt = '';
 process.stdin.on('data',chunk=>{prompt += chunk;});
 process.stdin.on('end',()=>{
  const counter = process.env.TRACE+'.count';
  const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter))+1 : 1;
  fs.writeFileSync(counter,String(n));
  const args = process.argv.slice(2);
  fs.appendFileSync(process.env.TRACE,JSON.stringify({args,prompt})+'\\n');
  send({type:'thread.started',thread_id:'exec-thread-'+n});
  if (process.env.MODE.startsWith('zero-loop')) {
    if (n === 1 && !process.env.MODE.includes('stale')) { send({type:'item.completed',item:{id:'plan-tool',type:'command_execution',command:'fleet plan',aggregated_output:'ok',exit_code:0}}); fs.writeFileSync(process.env.YIELD_FILE,JSON.stringify({type:'plan',text:'执行验证',at:Date.now()})); }
    fs.writeFileSync(args[args.indexOf('-o')+1],process.env.MODE.includes('stale') ? '没有可用的执行环境' : process.env.MODE === 'zero-loop-retry' ? '工具不可用' : '未完成');
    return;
  }
  if (n === 1 || (process.env.MODE === 'handoff-stuck' && n < 6)) fs.writeFileSync(process.env.YIELD_FILE,JSON.stringify(process.env.MODE === 'plan'
   ? {type:'plan',text:'实现：完成',at:Date.now()}
   : {type:'handoff',text:'已完成及证据；决定及理由；未决外部事项；坑勿重做；下一步',next:'继续',at:Date.now()}));
  fs.writeFileSync(args[args.indexOf('-o')+1],'完成');
 });
 return;
}
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
 const req = JSON.parse(line);
 fs.appendFileSync(process.env.TRACE, line + '\\n');
 if (req.method === 'thread/resume') send({id:req.id,result:{thread:{id:req.params.threadId}}});
 else if (req.method === 'thread/start') send({id:req.id,result:{thread:{id:++threads === 1 ? 'same-thread' : 'next-thread'}}});
 else if (req.method === 'turn/start') {
  // A resumed app-server has a new process, but the mock thread's turn counter persists.
  const counter = process.env.TRACE+'.app-count';
  count = fs.existsSync(counter) ? Number(fs.readFileSync(counter))+1 : 1;
  fs.writeFileSync(counter,String(count));
  const id = 'turn-' + count;
  send({id:req.id,result:{turn:{id}}});
  send({method:'turn/started',params:{turn:{id}}});
  if (process.env.MODE === 'yield-interrupt' && count === 1) {
   fs.writeFileSync(process.env.YIELD_FILE, JSON.stringify({type:'park',until:'file:ready',say:'从已完成工具挂起',at:Date.now(),timeoutMs:5000,timeouts:0}));
   send({method:'item/completed',params:{item:{id:'park-tool',type:'commandExecution',command:'fleet park --until file:ready',exitCode:0}}});
   return;
  }
  if (process.env.MODE === 'supervision-correct') {
   for (let i = 0; i < 3; i++) send({method:'item/completed',params:{item:{id:'sample-'+i,type:'commandExecution',command:'gh run view 123',aggregatedOutput:'pending',exitCode:0}}});
  }
  setTimeout(() => {
   const mode = process.env.MODE;
   if (mode.startsWith('zero-loop')) {
    if (count === 1 && !mode.includes('stale')) { send({method:'item/completed',params:{item:{id:'plan-tool',type:'commandExecution',command:'fleet plan',aggregatedOutput:'ok',exitCode:0}}}); fs.writeFileSync(process.env.YIELD_FILE,JSON.stringify({type:'plan',text:'执行验证',at:Date.now()})); }
    send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:mode.includes('stale') ? '没有可用的执行环境' : mode === 'zero-loop-retry' ? '工具不可用' : '未完成'}}});
    send({method:'turn/completed',params:{turn:{id,status:'completed'}}}); return;
   }
   if (['named-stuck','named-rewrite','zero-proof','evidence-proof'].includes(mode) && (mode !== 'zero-proof' || count > 1)) send({method:'item/completed',params:{item:{id:'tool-'+count,type:'commandExecution',command:'check',aggregatedOutput:mode === 'evidence-proof' && count === 3 ? 'new' : 'same',exitCode:0}}});
   if ((mode === 'zero-proof' && count > 1) || (mode === 'evidence-proof' && count > 3)) { fs.writeFileSync(process.env.REPORT_FILE, '## 结论\\nV1｜已过｜fixture'); send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'完成'}}}); send({method:'turn/completed',params:{turn:{id,status:'completed'}}}); return; }
   if ((mode === 'plan' && count === 1) || (mode === 'replan' && count === 2)) fs.writeFileSync(process.env.YIELD_FILE,JSON.stringify({type:'plan',text:'实现：假测试通过\\n验收点：报告完成',at:Date.now()}));
   if ((mode === 'handoff' && count === 1) || (mode === 'handoff-stuck' && count < 6) || (mode === 'replan' && (count === 1 || count === 3)))
     fs.writeFileSync(process.env.YIELD_FILE, JSON.stringify({type:'handoff',text:'已完成及证据；决定及理由；未决外部事项；坑勿重做；下一步',next:'继续',at:Date.now()}));

   if (count === 1 && mode === 'plan-park') {
    const cli = require('node:child_process').spawnSync;
    for (const args of [['plan','阶段：准备\\n阶段：验证'],['park','--until','file:ready','--say','醒来核验计划']]) {
      const result = cli(process.execPath,[process.env.YIELD_CLI,...args,'--run',process.env.FLEET_DETACHED_RUN_ID],{encoding:'utf8'});
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
    }
   }
   if (count === 1 && (mode === 'yield-park' || mode === 'yield-blocked')) {
    fs.writeFileSync(process.env.YIELD_FILE, JSON.stringify(mode === 'yield-park'
      ? {type:'park',until:'file:ready',say:'醒来执行指定动作',at:Date.now(),timeoutMs:5000,timeouts:0}
      : {type:'blocked',need:'input',what:'缺测试输入',tried:'仓库、文档、配置',who:'主会话',at:Date.now()}));
   }
   if (mode === 'yield-timeout' && count <= 2) {
    let previous = {}; try {previous = JSON.parse(fs.readFileSync(process.env.YIELD_FILE));} catch {}
    fs.writeFileSync(process.env.YIELD_FILE, JSON.stringify({type:'park',until:'file:never-ready',say:'继续等待输入',at:Date.now()-20,timeoutMs:10,timeouts:previous.timeouts||0}));
   }
   const conclusion = ((mode === 'finish' || mode === 'unfinished-full') && count > 1) || (mode === 'progress' && count > 5) || mode.startsWith('judge-') || mode === 'complete' || (mode === 'yield-park' && count > 1) || mode === 'missing-sections' ? '完成' : mode === 'fail' ? '失败' : '部分完成';
   let report = '# 测试\\n## 规则回执\\n测试\\n## 实际执行\\n测试\\n## 改动与产物\\n测试\\n## 验证证据\\n测试\\n## 偏差\\n无\\n## 结论\\n' + conclusion + '。\\n## 未完成/风险/需要用户决定的事\\n' + (mode === 'progress' ? count : '待办');
   if (mode === 'unfinished-full' && count === 1) report = report.replace('部分完成。', '未完成。');
   if (mode === 'real-blocked') report += '\\n受阻：用户决定｜缺授权｜已查配置｜请决定';
   if (mode === 'missing-sections' || (['finish', 'stuck', 'progress', 'env-off'].includes(mode) && !(mode === 'finish' && count > 1) && !(mode === 'progress' && count > 5))) report = '## 结论\\n' + conclusion + (mode === 'progress' ? count : '');
   if (mode === 'review-complete') report = '## 结论\\n不可放行，列出必修项\\nV1｜未过｜问题一\\nV2｜已过｜已核验\\nLEDGER: blockers=1 verdict=fail';
   if (mode === 'deviation-complete') report = '## 结论\\n' + Array.from({length:5}, (_, i) => 'V' + (i+1) + '｜已过' + (i === 2 ? '（目标分支偏差）' : '') + '｜已核验').join('\\n');
   if (['named-stuck', 'named-external', 'zero-proof', 'evidence-proof'].includes(mode)) report = '## 结论\\nV1｜' + (mode === 'named-external' ? '等外部' : '未过') + '｜fixture';
   if (mode === 'rewrite-only') report = '## 结论\\n部分完成：仅改写文字第 ' + count + ' 轮';
   if (mode === 'named-rewrite') report = '## 结论\\nV1｜未过｜仅改写证据文字第 ' + count + ' 轮';
   if (mode === 'park-exempt') {
    if (count === 3) fs.writeFileSync(process.env.YIELD_FILE, JSON.stringify({type:'park',until:'file:park-exempt-ready',say:'park唤醒后继续完成',at:Date.now(),timeoutMs:5000,timeouts:0}));
    if (count >= 4) report = '# 测试\\n## 规则回执\\n测试\\n## 结论\\n完成。\\n## 实际执行\\n测试\\n## 改动与产物\\n测试\\n## 验证证据\\n测试\\n## 偏差\\n无\\n## 未完成/风险/需要用户决定的事\\n无';
    else report = '## 结论\\n部分完成：第 ' + count + ' 轮';
   }
   if (mode.startsWith('named-empty')) {
    if (count === 1 && mode !== 'named-empty-zero') send({method:'item/completed',params:{item:{id:'tool',type:'commandExecution',command:'true',aggregatedOutput:'ok',exitCode:0}}});
    if (count === 1 || mode === 'named-empty-stuck') {
     if (mode === 'named-empty-missing') fs.rmSync(process.env.REPORT_FILE, { force: true });
     else fs.writeFileSync(process.env.REPORT_FILE, mode === 'named-empty-stuck' ? '\\n' : '');
     if (mode === 'named-empty-zero') send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'尚未完成，验收未过'}}});
     send({method:'turn/completed',params:{turn:{id,status:'completed'}}});
     return;
    }
    report = report.replace('## 结论\\n', '## 结论\\nV1｜' + (mode === 'named-empty-unmet' ? '未过' : '已过') + '｜已读取隔离夹具退出状态 0\\n');
   }
   if (mode === 'progress') fs.writeFileSync(process.env.REPORT_FILE + '.artifact', String(count));
   fs.writeFileSync(process.env.REPORT_FILE, report);
   send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:mode === 'acceptance' && count === 1 ? '证书未核实' : conclusion}}});
   send({method:'turn/completed',params:{turn:{id,status:'completed'}}});
  }, process.env.MODE === 'supervision-correct' ? 550 : process.env.MODE === 'threshold' ? 400 : 5);
 } else if (req.method === 'turn/interrupt' && process.env.MODE === 'yield-interrupt') {
   send({id:req.id,result:{}});
   send({method:'turn/completed',params:{turn:{id:req.params.turnId,status:'interrupted'}}});
 } else if (req.id !== undefined) send({id:req.id,result:{}});
});
`);
chmodSync(mock, 0o755);
try {
  process.env.AGENT_FLEET_RUNS_DIR = scratch;
  delete process.env.FLEET_CODEX_BACKEND;
  delete process.env.FLEET_NO_CONTINUE;
  assert.equal(splitShortArgs(['--no-continue', 'brief.md']).flags['no-continue'], true);
  // Plans and handoffs continue without replies, including drift and exhausted old baton limits.
  const anchor = '原始 brief 全文\n阶段：实现，完成条件：假测试通过\n阶段：验证，完成条件：报告\n## 【修订 1】\n按序修订全文';
  process.env.REPORT_FILE = join(scratch, 'stage-report.md');
  for (const mode of ['plan','handoff','replan']) for (const verdict of ['pass','reject','unavailable']) {
    const id = `${mode}-${verdict}`;
    process.env.FLEET_DETACHED_RUN_ID = id;
    process.env.MODE = mode;
    process.env.YIELD_FILE = join(scratch,`${id}.yield`);
    process.env.TRACE = join(scratch,`${id}.trace`);
    writeFileSync(join(scratch,`${id}.stages.json`),JSON.stringify({anchor,stages:['验收点：旧阶段'],stage:0,baton:9}));
    const checks = [];
    const result = await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,
      continuationJudge:async payload => {
        checks.push(payload);
        if (verdict === 'unavailable') throw new Error('judge unavailable');
        return {ok:true,answers:{aligned:{choice:verdict,confidence:0.9},completed:{choice:verdict,confidence:0.9}}};
      }});
    assert(result.ok);
    assert(!existsSync(join(scratch,`${id}.asks`)),'no approval ask');
    assert.equal(readYield(id).result.status,'accepted');
    assert(!result.continueStop);
    const trace = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
    const turns = trace.filter(e=>e.method==='turn/start');
    assert.equal(turns.length, mode === 'replan' ? 4 : 2);
    assert.equal(trace.filter(e=>e.method==='thread/start').length, mode === 'replan' ? 3 : mode === 'handoff' ? 2 : 1);
    if (mode !== 'plan') {
      assert.equal(turns[1].params.threadId,'next-thread');
      assert(turns[1].params.input[0].text.startsWith(anchor));
      assert.match(turns[1].params.input[0].text,/最新交接单/);
      assert(checks.every(p=>p.state.kind === 'handoff'),'no restatement approval turn');
    }
    const stage = JSON.parse(readFileSync(join(scratch,`${id}.stages.json`),'utf8'));
    if (mode === 'plan') { assert.match(turns[1].params.input[0].text, /fleet park --until job:<id>/); assert.equal(stage.stage,0); assert.equal(stage.baton,1); assert.equal(stage.stages.length,2); }
    if (mode === 'handoff') { assert.equal(stage.stage,verdict === 'pass' ? 1 : 0); assert.equal(stage.baton,10); }
    assert.match(readFileSync(join(scratch,`${id}.log`),'utf8'),/自动放行|自动接力/);
  }
  process.env.FLEET_DETACHED_RUN_ID = 'no-plan';
  process.env.MODE = 'handoff';
  process.env.YIELD_FILE = join(scratch,'no-plan.yield');
  process.env.TRACE = join(scratch,'no-plan.trace');
  await runCode({prompt:'无阶段的目标',cwd:scratch,codexBin:mock,noContinue:true,continuationJudge:async()=>({ok:false})});
  assert.equal(readFileSync(process.env.TRACE,'utf8').split('"method":"thread/start"').length-1,2);
  assert(!existsSync(join(scratch,'no-plan.asks')));
  console.log('PASS - plans auto-continue; handoffs auto-start fresh threads without approval gates');
  for (const mode of ['plan','handoff']) {
    const id = 'exec-'+mode;
    process.env.FLEET_CODEX_BACKEND = 'exec';
    process.env.FLEET_DETACHED_RUN_ID = id;
    process.env.MODE = mode;
    process.env.TRACE = join(scratch,id+'.trace');
    process.env.YIELD_FILE = join(scratch,id+'.yield');
    const result = await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,continuationJudge:async()=>({ok:false})});
    assert(result.ok);
    const execs = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.args);
    assert.equal(execs.length,2);
    assert.equal(execs[1].args.includes('resume'),mode === 'plan','exec handoff starts a fresh thread');
    if (mode === 'handoff') assert(execs[1].prompt.startsWith(anchor));
    assert(!existsSync(join(scratch,id+'.asks')));
  }
  for (const backend of ['app', 'exec']) {
    if (backend === 'exec') process.env.FLEET_CODEX_BACKEND = 'exec';
    else delete process.env.FLEET_CODEX_BACKEND;
    const id = 'handoff-stuck-' + backend;
    process.env.FLEET_DETACHED_RUN_ID = id;
    process.env.MODE = 'handoff-stuck';
    process.env.TRACE = join(scratch, id + '.trace');
    process.env.YIELD_FILE = join(scratch, id + '.yield');
    const result = await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,continuationJudge:async()=>({ok:false})});
    const trace = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(trace.filter(e => backend === 'exec' ? e.args : e.method === 'turn/start').length, 3);
    assert.match(result.continueStop, /连续两次续做无进展/);
  }
  process.env.FLEET_CODEX_BACKEND = 'exec';
  process.env.FLEET_DETACHED_RUN_ID = 'handoff-stop';
  process.env.MODE = 'handoff';
  process.env.TRACE = join(scratch, 'handoff-stop.trace');
  process.env.YIELD_FILE = join(scratch, 'handoff-stop.yield');
  await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,continuationJudge:async()=>{
    appendInbox('handoff-stop', {type:'stop',text:''});
    await delay(50);
    return {ok:false};
  }});
  assert.equal(readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.args).length, 1);
  console.log('PASS - repeated handoffs stop and exec stop during handoff prevents restart');
  delete process.env.FLEET_CODEX_BACKEND;
  // Recreate a dead runner's durable park: resume must wait before any model turn.
  process.env.FLEET_DETACHED_RUN_ID = 'recovered-park';
  process.env.MODE = 'complete';
  process.env.TRACE = join(scratch,'resume.trace');
  await registerQueue({runId:'dead-park',model:'gpt-6.1-sol'});
  assert(await acquireSlot('dead-park'));
  const deadEnv = {...process.env,FLEET_DETACHED_RUN_ID:'dead-park',FLEET_SLOT_RUN_ID:'dead-park',MODE:'yield-park',
    YIELD_FILE:join(scratch,'dead-park.yield'),TRACE:join(scratch,'dead.trace')};
  const dead = spawn(process.execPath,['--input-type=module','-e',
    'import {runCode} from '+JSON.stringify(new URL('../src/code-runner.mjs',import.meta.url).href)+'; await runCode('+JSON.stringify({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true})+');'],{env:deadEnv,stdio:'ignore'});
  for(let n=0;n<500 && !existsSync(deadEnv.YIELD_FILE);n++) await delay(10);
  assert(existsSync(deadEnv.YIELD_FILE));
  for(let n=0;n<500 && (queueRecord('dead-park')?.state !== 'parked' || existsSync(join(scratch,'.queue-lock')));n++) await delay(10);
  assert.equal(queueRecord('dead-park').state,'parked');
  assert(!existsSync(join(scratch,'.queue-lock')));
  const died = new Promise(resolve=>dead.once('close',resolve));
  dead.kill('SIGKILL'); await died;
  // The replacement resumes the durable condition rather than starting a model turn.
  const recovered = runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,resume:'old-thread',resumedFrom:'dead-park'});
  await delay(50);
  if (existsSync(process.env.TRACE)) assert(!readFileSync(process.env.TRACE,'utf8').includes('"method":"turn/start"'));
  writeFileSync(join(scratch,'ready'),'done');
  const recoveredResult = await recovered;

  assert(recoveredResult.ok, JSON.stringify({fallbacks:recoveredResult.fallbacks,stderr:recoveredResult.stderr,yield:recoveredResult.yield,trace:readFileSync(process.env.TRACE,'utf8')}));
  const resumedTrace = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
  assert(resumedTrace.some(e=>e.method==='thread/resume' && e.params.threadId==='old-thread'));
  assert.match(resumedTrace.find(e=>e.method==='turn/start').params.input[0].text,/醒来执行指定动作/);
  console.log('PASS - handoff full anchor/new thread and durable park resume');
  process.env.FLEET_DETACHED_RUN_ID = 'yield-interrupt';
  process.env.TRACE = join(scratch,'yield-interrupt.trace');
  process.env.YIELD_FILE = join(scratch,'yield-interrupt.yield');
  process.env.MODE = 'yield-interrupt';
  assert((await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true})).ok);
  const parkedTrace = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(parkedTrace.filter(event => event.method === 'turn/interrupt').length, 1);
  const wakeStarts = parkedTrace.filter(event => event.method === 'turn/start');
  assert.equal(wakeStarts.length, 2);
  assert.match(wakeStarts[1].params.input[0].text, /从已完成工具挂起/);
  process.env.MODE = 'complete';

  process.env.FLEET_DETACHED_RUN_ID = 'remote-recovered';
  process.env.TRACE = join(scratch,'remote-resume.trace');
  const remotePark = writeYield('remote-dead',{type:'park',until:'gh-run:fixture',say:'远程状态恢复',timeout:'1s'});
  writeFileSync(join(scratch,'remote-dead.wake.json'),JSON.stringify({condition:remotePark.until,at:Date.now(),status:'done'}));
  const remoteRecovery = await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true,resume:'old-thread',resumedFrom:'remote-dead'});
  assert(remoteRecovery.ok);
  assert.match(readFileSync(process.env.TRACE,'utf8'),/远程状态恢复/);
  process.env.FLEET_DETACHED_RUN_ID = 'threshold';
  process.env.MODE = 'threshold';
  process.env.TRACE = join(scratch,'threshold.trace');
  process.env.FLEET_HANDOFF_ACTIVE_MS = '1';
  await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true});
  const thresholdTrace = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
  assert(thresholdTrace.some(e=>e.method==='turn/steer' && /不是强停/.test(e.params.input[0].text)));
  delete process.env.FLEET_HANDOFF_ACTIVE_MS;
  process.env.FLEET_DETACHED_RUN_ID = 'supervision-correct';
  process.env.MODE = 'supervision-correct';
  process.env.TRACE = join(scratch,'supervision.trace');
  await runCode({prompt:anchor,cwd:scratch,codexBin:mock,noContinue:true});
  const corrections = readFileSync(process.env.TRACE,'utf8').trim().split('\n').map(JSON.parse)
    .filter(event => event.method === 'turn/steer' && /监督命中/.test(event.params.input[0].text));
  assert.equal(corrections.length, 1);
  assert.match(corrections[0].params.input[0].text, /repeat、wait/);

  rmSync(join(scratch,'ready'));
  // A parked turn frees its slot; no RPC is sent until a local condition wakes it.
  process.env.FLEET_SLOT_CAPACITY = '1';
  for (const mode of ['yield-park', 'yield-blocked']) {
    const id = mode;
    process.env.FLEET_DETACHED_RUN_ID = process.env.FLEET_SLOT_RUN_ID = id;
    process.env.MODE = mode;
    process.env.TRACE = join(scratch, `${id}.trace`);
    process.env.YIELD_FILE = join(scratch, `${id}.yield`);
    process.env.REPORT_FILE = join(scratch, `${id}.report`);
    await registerQueue({runId:id,model:'gpt-6.1-sol'});
    assert(await acquireSlot(id));
    let judgeCalls = 0;
    const pending = runCode({prompt:`REPORT: ${process.env.REPORT_FILE}`,cwd:scratch,codexBin:mock,
      continuationJudge:async () => { judgeCalls++; throw new Error('yield must skip judge'); }});
    if (mode === 'yield-park') {
      for (let i = 0; i < 500 && queueRecord(id)?.state !== 'parked'; i++) await delay(10);
      assert.equal(queueRecord(id).state, 'parked');
      assert.equal(readPidRecord(id).codexPid, null);
      const waitingId = 'queued-behind-park';
      await registerQueue({runId:waitingId,model:'gpt-6.1-sol'});
      assert(await acquireSlot(waitingId), 'park 释放槽位，队列可启动');
      const before = readFileSync(process.env.TRACE, 'utf8');
      await delay(350);
      assert.equal(readFileSync(process.env.TRACE, 'utf8'), before, '挂起期零模型/RPC请求');
      writeFileSync(join(scratch, 'ready'), 'ready');
      await delay(300);
      assert.equal(readFileSync(process.env.TRACE, 'utf8'), before, '唤醒前必须重拿槽位');
      await setSlotState(waitingId, 'done');
    }
    const result = await pending;
    const starts = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.method === 'turn/start');
    assert.equal(starts.length, mode === 'yield-park' ? 2 : 1);
    assert(starts.every(e => e.params.threadId === 'same-thread'));
    if (mode === 'yield-park') {
      assert.equal(result.resumeCount, 1);
      assert.match(starts[1].params.input[0].text, /醒来执行指定动作[\s\S]*终态/);
    }
    else {
      assert.equal(result.yield.type, 'blocked');
      assert.equal(buildBrief(result).verdict, 'partial');
      assert.match(readFileSync(process.env.REPORT_FILE,'utf8'), /## 未完成\/风险\/需要用户决定的事\n受阻：input｜缺测试输入｜仓库、文档、配置｜主会话/);
    }
    assert.equal(result.continueCount, 0);
    assert.equal(judgeCalls, mode === 'yield-park' ? 1 : 0);
    await setSlotState(id, 'done');
  }
  process.env.FLEET_DETACHED_RUN_ID = process.env.FLEET_SLOT_RUN_ID = 'yield-timeout';
  process.env.MODE = 'yield-timeout';
  process.env.TRACE = join(scratch,'timeout.trace');
  process.env.YIELD_FILE = join(scratch,'yield-timeout.yield');
  process.env.REPORT_FILE = join(scratch,'timeout.report');
  await registerQueue({runId:'yield-timeout',model:'gpt-6.1-sol'});
  assert(await acquireSlot('yield-timeout'));
  const timed = await runCode({prompt:`REPORT: ${process.env.REPORT_FILE}`,cwd:scratch,codexBin:mock});
  assert.equal(timed.numTurns,2,'同条件第二次超时直接 blocked，不能开第三轮');
  assert.equal(timed.yield.type,'blocked');
  await setSlotState('yield-timeout','blocked');
  process.env.FLEET_DETACHED_RUN_ID = process.env.FLEET_SLOT_RUN_ID = 'reply-test';
  process.env.MODE = 'complete';
  process.env.TRACE = join(scratch,'reply.trace');
  process.env.REPORT_FILE = join(scratch,'reply.report');
  ask('reply-test',{kind:'help',text:'等待答复',wait:true});
  const replyPending = runCode({noContinue:true,prompt:`REPORT: ${process.env.REPORT_FILE}`,cwd:scratch,codexBin:mock});
  for(let i=0;i<500;i++) {
    if (existsSync(process.env.TRACE) && readFileSync(process.env.TRACE,'utf8').includes('turn/start')) break;
    await delay(10);
  }
  appendInbox('reply-test',{type:'say',text:'采用方案 A'});
  const replyResult = await replyPending;
  assert.equal(replyResult.numTurns,2);
  assert.match(readFileSync(process.env.TRACE,'utf8'),/采用方案 A/);
  delete process.env.FLEET_SLOT_RUN_ID;
  delete process.env.FLEET_SLOT_CAPACITY;
  const askId = 'ask-child';
  writeFileSync(join(scratch, `${askId}.json`), JSON.stringify({detach:true,runId:askId,status:'done',cwd:scratch,exitCode:0}));
  ask(askId, {kind:'decision',text:'选哪种办法？'});
  assert.equal(await waitDetached(askId), 1, '终态退出码取决于结果，不因 ask 返回3');
  assert.deepEqual(watchRequest('wait-events', { run: askId }), [], '重新 wait 不重复消费 ask');
  const yieldCli = new URL('../bin/agent-fleet.mjs', import.meta.url).pathname;
  const cliEnv = {...process.env};
  for(const key of ['FLEET_SLOT_RUN_ID','FLEET_DETACHED_RUN_ID','FLEET_PARENT_RUN_ID']) delete cliEnv[key];
  assert.equal(spawnSync(process.execPath,[yieldCli,'ask','--run',askId,'--kind','shared','共享事实'],{env:cliEnv}).status,0);
  const waited = spawnSync(process.execPath,[yieldCli,'wait',askId],{env:cliEnv,encoding:'utf8'});
  assert.equal(waited.status,1,'CLI wait 保留真实终态退出码');
  assert.match(waited.stdout,/共享事实/);
  writeFileSync(join(scratch,'upstream-child.json'),JSON.stringify({parentRunId:'upstream-parent'}));
  ask('upstream-child',{text:'上行问题'});
  assert.match(readFileSync(join(scratch,'upstream-parent.inbox'),'utf8'),/上行问题/);
  const blockedCLI = spawnSync(process.execPath,[yieldCli,'blocked','--run','cli-blocked','--need','access','--what','入口','--tried','三处','--who','协调者'],{env:cliEnv,encoding:'utf8'});
  assert.equal(blockedCLI.status,0,blockedCLI.stderr);
  assert.equal(readYield('cli-blocked').type,'blocked');
  assert.equal(spawnSync(process.execPath,[yieldCli,'park','--run','cli-park','--until','after:1s','--say','继续'],{env:cliEnv}).status,0);
  assert.equal(readYield('cli-park').until,'after:1s');

  const planParkId = 'plan-park';
  process.env.FLEET_DETACHED_RUN_ID = planParkId;
  delete process.env.FLEET_SLOT_RUN_ID;
  process.env.MODE = planParkId;
  process.env.TRACE = join(scratch, `${planParkId}.trace`);
  process.env.YIELD_FILE = join(scratch, `${planParkId}.yield`);
  process.env.YIELD_CLI = yieldCli;
  writeFileSync(join(scratch, 'ready'), 'ready');
  const planPark = await runCode({prompt:'记录计划并挂起',cwd:scratch,codexBin:mock,noContinue:true});
  assert(planPark.ok);
  assert.equal(planPark.numTurns, 2);
  assert.equal(planPark.wakeCount, 1);
  assert.deepEqual(JSON.parse(readFileSync(join(scratch, `${planParkId}.stages.json`),'utf8')).stages,['阶段：准备','阶段：验证']);
  assert.equal(readYield(planParkId).result.status,'done');
  writeYield('pending-park',{type:'park',until:'file:ready',say:'继续'});
  assert.throws(() => writeYield('pending-park',{type:'park',until:'file:ready',say:'重复'}), /已有未处理/);
  console.log('PASS - same-turn plan and park preserve stage plan; pending parks cannot be overwritten');

  assert.throws(() => writeYield('invalid-blocked', {type:'blocked',need:'input',what:'输入',who:'主会话'}), /--tried/);
  assert.deepEqual(continuationRules({yield:{type:'blocked'},conclusion:'部分完成',report:''}, '提交哈希'), []);
  let calledForYield = false;
  assert.equal((await judgeContinuation({yield:{type:'park'},judge:async () => { calledForYield=true; }})).decision, 'done');
  assert.equal(calledForYield, false);
  const probeEntry = {at:Date.now()};
  const conditionContext = {id:'conditions',entry:probeEntry,cwd:scratch};
  assert.equal((await localCondition('any:["run:missing-local","file:ready"]', conditionContext)).status, 'done', 'any 成功优先于失败');
  assert.equal(await localCondition('any:["run:missing-local","file:pending"]', conditionContext), null, '未登记 run 保持等待');
  assert.equal((await localCondition('any:["run:missing-local","job:missing-local"]', conditionContext)).status, 'failed', 'any 全失败才失败');
  assert.equal((await localCondition('all:["file:ready","after:1ms"]', {id:'conditions',entry:{at:Date.now()-10},cwd:scratch})).status, 'done');
  assert.equal(await localCondition('run:missing-local', {id:'conditions',entry:probeEntry,cwd:scratch}), null);
  assert.equal(await localCondition('gh-run:123', {id:'conditions',entry:probeEntry,cwd:scratch}), null);
  writeFileSync(join(scratch,'conditions.wake.json'), JSON.stringify({condition:'gh-run:123',at:Date.now(),status:'failed',logPath:'failure.log'}));
  assert.equal((await localCondition('gh-run:123', {id:'conditions',entry:probeEntry,cwd:scratch})).logPath, 'failure.log');
  const cmdResult = await localCondition('cmd:printf probe-output', {id:'cmd-probe',entry:probeEntry,cwd:scratch});
  assert.equal(cmdResult.status,'done');
  assert.match(readFileSync(cmdResult.logPath,'utf8'),/probe-output/);
  assert.equal(await localCondition('cmd:printf probe-output', {id:'cmd-probe',entry:probeEntry,cwd:scratch}),null,'cmd 探测不早于2分钟重跑');
  const cmdFailure = await localCondition('cmd:echo failed-probe >&2; exit 1', {id:'cmd-failure',entry:probeEntry,cwd:scratch});
  assert.equal(cmdFailure.status,'failed');
  assert.match(readFileSync(cmdFailure.logPath,'utf8'),/failed-probe/);
  const bg = startBackground([process.execPath, '-e', 'console.log("job output")'], scratch);
  let jobResult;
  for (let i=0; i<500; i++) {
    jobResult = await localCondition(bg.until, {id:'conditions',entry:probeEntry,cwd:scratch});
    if (jobResult) break;
    await delay(10);
  }
  assert.equal(jobResult.status, 'done');
  assert.match(readFileSync(bg.logPath,'utf8'), /job output/);
  console.log('PASS - yield 同线程唤醒、零挂起请求、释放/重拿槽、blocked 跳闸门、ask 不提前返回、本地条件与 bg');
  for (const [mode, options, expected] of [
    ['finish', {}, 1], ['unfinished-full', {}, 1], ['real-blocked', {}, 0], ['complete', {}, 0], ['fail', {}, 0],
    ['missing-sections', {}, 2], ['judge-done', {}, 0], ['judge-missing', {}, 2], ['judge-low', {}, 0], ['judge-fail', {}, 0], ['judge-throw', {}, 0],
    ['stuck', {}, 2], ['progress', {}, 5], ['stuck', { review: true }, 0],
    ['stuck', { noContinue: true }, 0], ['env-off', {}, 0],
  ]) {
    process.env.FLEET_DETACHED_RUN_ID = `${mode}-${Object.keys(options).join() || 'default'}`;
    process.env.MODE = mode;
    process.env.TRACE = join(scratch, `${process.env.FLEET_DETACHED_RUN_ID}.trace`);
    process.env.REPORT_FILE = join(scratch, 'report.md');
    if (mode === 'env-off') process.env.FLEET_NO_CONTINUE = '1';
    const continuationJudge = async () => {
      if (mode === 'judge-throw') throw new Error('mock unavailable');
      if (mode === 'judge-fail') return { ok: false };
      return { ok: true, answers: { deliverable: { choice: mode === 'judge-missing' ? 'file' : 'done', confidence: mode === 'judge-low' ? 0.4 : 0.9 } } };
    };
    const result = await runCode({ continuationJudge, prompt: `REPORT: ${process.env.REPORT_FILE}\n测试${mode === 'progress' ? `\n产物清单：\n- 文件：${process.env.REPORT_FILE}.artifact\n` : ''}`, cwd: scratch, codexBin: mock, ...options });
    assert.equal(result.continueCount, expected, mode);
    assert.equal(result.continuation.length, expected, mode);
    const trace = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
    const starts = trace.filter(event => event.method === 'turn/start');
    assert.equal(starts.length, expected + 1);
    assert(starts.every(event => event.params.threadId === 'same-thread'));
    assert(starts.slice(1).every(event => /具体缺项/.test(event.params.input[0].text) || event.params.input[0].text === CONTINUE_PROMPT));
    assert(starts.slice(1).every(event => event.params.input[0].text.includes('fleet park --until job:<id>')));
    if (mode === 'judge-missing') assert.match(starts[1].params.input[0].text, /缺少 brief 要求的文件/);
    if (mode.startsWith('judge-')) assert(result.continuationChecks.every(check => check.judge));
    const brief = buildBrief(result);
    const stoppedNoProgress = ['stuck', 'missing-sections', 'judge-missing'].includes(mode) && expected === 2;
    assert.equal(brief.verdict, mode === 'fail' ? 'fail' : ['finish', 'unfinished-full', 'progress', 'complete', 'judge-done', 'judge-low', 'judge-fail', 'judge-throw'].includes(mode) ? 'ok' : stoppedNoProgress ? 'needs-review' : 'partial');
    assert.match(formatBriefHuman(brief), new RegExp(`续做 ${expected} 次`));
    assert.match(readFileSync(result.resultPath, 'utf8'), new RegExp(`续做 ${expected} 次`));
    if (stoppedNoProgress) {
      assert(result.continuation.every(step => !step.progress));
      assert.match(result.continueStop, /连续两次续做无进展/);
      assert.match(result.continueStop, /无进展停续做，交派单方裁定/);
      assert.match(readFileSync(result.resultPath, 'utf8'), /无进展停续做，交派单方裁定/);
      assert.equal(brief.verdictNote, '无进展停续做，交派单方裁定');
    }
    if (mode === 'progress') {
      assert(result.continuation.every(step => step.progress && step.report));
      assert.equal(result.continueStop, undefined);
    }
  }
  delete process.env.FLEET_NO_CONTINUE;
  for (const options of [{ review: true }, {}]) {
    process.env.MODE = 'acceptance';
    process.env.FLEET_DETACHED_RUN_ID = `acceptance-${options.review ? 'review' : 'document'}`;
    process.env.TRACE = join(scratch, `${process.env.FLEET_DETACHED_RUN_ID}.trace`);
    const result = await runCode({ prompt: '归类：只读复核\n## 目标\n复核证书', cwd: scratch, codexBin: mock, ...options });
    assert.equal(result.continueCount, 0, 'legacy prose does not trigger the retired Terra keyword scan');
  }
  for (const [mode, wanted, verdict] of [['named-stuck', 2, 'needs-review'], ['named-external', 0, 'ok']]) {
    process.env.MODE = mode;
    process.env.FLEET_DETACHED_RUN_ID = mode;
    process.env.TRACE = join(scratch, mode + '.trace');
    process.env.REPORT_FILE = join(scratch, mode + '.md');
    const result = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n## 验收\nV1 fixture｜owner：${mode === 'named-external' ? '派单方' : '本单'}`, cwd: scratch, codexBin: mock });
    assert.equal(result.continueCount, wanted, mode);
    assert.equal(buildBrief(result).verdict, verdict, mode);
    if (wanted) assert.match(result.continueStop, /无进展停续做/);
    else assert.equal(buildBrief(result).pending, 'external');
  }
  for (const backend of ['app', 'exec']) for (const mode of ['zero-loop-stop', 'zero-loop-retry', 'zero-loop-stale']) {
    if (backend === 'exec') process.env.FLEET_CODEX_BACKEND = 'exec'; else delete process.env.FLEET_CODEX_BACKEND;
    const id = `${backend}-${mode}`;
    process.env.MODE = mode; process.env.FLEET_DETACHED_RUN_ID = id;
    process.env.TRACE = join(scratch, id + '.trace'); process.env.REPORT_FILE = join(scratch, id + '.md');
    process.env.YIELD_FILE = join(scratch, id + '.yield');
    const stale = mode === 'zero-loop-stale';
    const rows = Array.from({length: stale ? 4 : 1}, (_, i) => `V${i + 1}`);
    const report = '## 结论\n' + (stale ? '巡检换班，快照在旧 checkpoint.md\n' : '') + rows.map(id => `${id}｜未过｜fixture`).join('\n');
    writeFileSync(process.env.REPORT_FILE, report);
    const result = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n## 验收\n${rows.map(id => `${id} fixture｜owner：本单`).join('\n')}`, cwd: scratch, codexBin: mock });
    const trace = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
    const turns = trace.filter(e => backend === 'exec' ? e.args : e.method === 'turn/start');
    assert.equal(turns.length, stale ? 4 : mode === 'zero-loop-retry' ? 5 : 3, id);
    assert.equal(result.zeroToolRetry, mode === 'zero-loop-stop' ? undefined : 1, id);
    assert.equal(result.zeroToolStreak, 2, id);
    assert.match(result.continueStop, /连续两次续做无进展/, id);
    if (mode !== 'zero-loop-stop') {
      assert.equal(backend === 'exec' ? turns.filter(e => !e.args.includes('resume')).length : trace.filter(e => e.method === 'thread/start').length, 2, id);
      const freshIndex = stale ? 2 : 3;
      assert.match(backend === 'exec' ? turns[freshIndex].prompt : turns[freshIndex].params.input[0].text, /V1 fixture/, id);
    }
    if (stale) {
      assert.equal(result.toolCalls, 0, id);
      assert.equal(result.acceptance.verdict, 'partial', id);
      assert.equal(result.acceptance.pending, 'none', id);
      assert.equal(result.acceptance.counts.failed, 4, id);
      assert.equal(buildBrief(result).verdict, 'needs-review', id);
      assert.equal(readFileSync(process.env.REPORT_FILE, 'utf8'), report, id);
    }
  }
  delete process.env.FLEET_CODEX_BACKEND;
  console.log('PASS - plan zero-tool stalls and stale patrol handoff stop after two turns; one fresh brief retry only in both backends');
  for (const [mode, turns] of [['zero-proof', 2], ['evidence-proof', 4]]) {
    process.env.MODE = mode; process.env.FLEET_DETACHED_RUN_ID = mode;
    process.env.TRACE = join(scratch, mode + '.trace'); process.env.REPORT_FILE = join(scratch, mode + '.md');
    const result = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n## 验收\nV1 fixture｜owner：本单`, cwd: scratch, codexBin: mock });
    const starts = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.method === 'turn/start');
    assert.equal(starts.length, turns); assert.equal(buildBrief(result).verdict, 'ok');
    if (mode === 'zero-proof') { assert.match(JSON.stringify(starts[1]), /本单是实际执行任务，直接调用工具开工/); console.log('零工具桩：首轮零工具 → 原线程续做；提示：本单是实际执行任务，直接调用工具开工'); }
  }
  for (const [mode, owner, options, turns, verdict] of [
    ['named-empty-zero', '本单', {}, 2, 'ok'],
    ['named-empty-missing', '本单', {}, 2, 'ok'],
    ['named-empty-unmet', '本单', {}, 2, 'partial'],
    ['named-empty-stuck', '本单', {}, 2, 'needs-review'],
    ['named-empty-disabled', '本单', { noContinue: true }, 1, 'needs-review'],
    ['named-empty-external', '派单方', {}, 1, 'ok'],
    ['named-empty-downstream', '下游：服务', {}, 1, 'ok'],
  ]) {
    process.env.MODE = mode;
    process.env.FLEET_DETACHED_RUN_ID = mode;
    process.env.TRACE = join(scratch, mode + '.trace');
    process.env.REPORT_FILE = join(scratch, mode + '.md');
    const result = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n## 验收\nV1 fixture｜owner：${owner}`, cwd: scratch, codexBin: mock, ...options });
    const trace = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
    const starts = trace.filter(event => event.method === 'turn/start');
    assert.equal(starts.length, turns, mode);
    assert.equal(trace.filter(event => event.method === 'thread/start').length, 1, mode);
    assert(starts.every(event => event.params.threadId === 'same-thread'), mode);
    assert.equal(result.continueCount, turns - 1, mode);
    assert.equal(result.continueRequired, false, mode);
    assert.equal(result.acceptance.verdict, verdict, mode);
    if (turns === 2) {
      const recovery = starts[1].params.input[0].text;
      assert.match(recovery, /「## 结论」标题下、下一节之前单独写一行，格式为「Vn｜状态｜证据或原因」/);
      if (mode === 'named-empty-zero') {
        assert.match(recovery, /首轮没有任何工具调用，请按 brief 的授权范围实际开始执行任务/);
        assert.doesNotMatch(recovery, /只可写此报告，不重跑任务/);
      } else assert.match(recovery, /只可写此报告，不重跑任务，不派新单/);
    }
  }
  console.log('PASS - empty named reports get one bounded recovery; zero-tool runs execute and other runs report only');
  for (const mode of ['review-complete', 'deviation-complete']) {
    process.env.MODE = mode;
    process.env.FLEET_DETACHED_RUN_ID = mode;
    process.env.TRACE = join(scratch, mode + '.trace');
    process.env.REPORT_FILE = join(scratch, mode + '.md');
    const count = mode === 'review-complete' ? 2 : 5;
    const prompt = `归类：${mode === 'review-complete' ? '只读复核' : '编码'}\nREPORT: ${process.env.REPORT_FILE}\n## 验收\n` + Array.from({length:count}, (_, i) => `V${i+1} 核验｜owner：本单`).join('\n');
    const result = await runCode({ prompt, cwd:scratch, codexBin:mock });
    assert.equal(result.continueCount, 0, mode);
    assert.equal(buildBrief(result).verdict, 'ok', mode);
    assert.equal(readFileSync(process.env.TRACE, 'utf8').split('"method":"turn/start"').length - 1, 1);
    if (mode === 'deviation-complete') {
      assert.match(readFileSync(process.env.REPORT_FILE, 'utf8'), /目标分支偏差/);
      const cli = spawnSync(process.execPath, [join(process.cwd(), 'bin/agent-fleet.mjs'), 'code', prompt, '--cwd', scratch, '--json', '--attach'], { env: { ...process.env, FLEET_CODEX_BIN: mock }, encoding:'utf8', timeout:30000 });
      assert.equal(cli.status, 0, cli.stderr);
      assert.equal(JSON.parse(cli.stdout).verdict, 'ok');
    }
  }
  const execMock = join(scratch, 'codex-exec-mock.cjs');
  writeFileSync(execMock, `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'app-server') process.exit(1);
let count = 0; try { count = Number(fs.readFileSync(process.env.EXEC_COUNT)); } catch {}
fs.writeFileSync(process.env.EXEC_COUNT, String(++count));
if (process.env.EXEC_EMPTY_REPORT === '1') {
 const prompt = fs.readFileSync(0, 'utf8');
 fs.appendFileSync(process.env.TRACE, JSON.stringify({ args: process.argv.slice(2), prompt }) + '\\n');
 console.log(JSON.stringify({type:'thread.started',thread_id:'exec-thread'}));
 if (count === 1) return;
 fs.writeFileSync(process.env.REPORT_FILE, '## 结论\\nV1｜已过｜已读取隔离夹具退出状态 0');
 fs.writeFileSync(process.argv[process.argv.indexOf('-o') + 1], '报告已写入');
 return;
}
fs.writeFileSync(process.env.REPORT_FILE, count === 1 ? '## 结论\\n未完成' : '# 测试\\n## 规则回执\\n测试\\n## 结论\\n完成\\n## 实际执行\\n测试\\n## 改动与产物\\n测试\\n## 验证证据\\n测试\\n## 偏差\\n无\\n## 未完成/风险/需要用户决定的事\\n无');
fs.writeFileSync(process.argv[process.argv.indexOf('-o') + 1], '完成');
console.log(JSON.stringify({type:'thread.started',thread_id:'exec-thread'}));
`);
  chmodSync(execMock, 0o755);
  for (const backend of ['exec', 'fallback']) {
    process.env.EXEC_COUNT = join(scratch, `exec-${backend}.count`);
    process.env.FLEET_CODEX_BACKEND = backend === 'exec' ? 'exec' : 'app-server';
    process.env.FLEET_DETACHED_RUN_ID = `test-${backend}`;
    const result = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n测试`, cwd: scratch, codexBin: execMock });
    assert.equal(result.continueCount, 1, backend);
    assert.equal(result.reportConclusion, '完成');
    assert.equal(result.continueRequired, false);
    assert.equal(buildBrief(result).verdict, 'ok');
  }
  process.env.FLEET_CODEX_BACKEND = 'exec';
  process.env.FLEET_DETACHED_RUN_ID = 'exec-empty-report';
  process.env.EXEC_EMPTY_REPORT = '1';
  process.env.EXEC_COUNT = join(scratch, 'exec-empty-report.count');
  process.env.REPORT_FILE = join(scratch, 'exec-empty-report.md');
  process.env.TRACE = join(scratch, 'exec-empty-report.trace');
  const execRecovery = await runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n## 验收\nV1 fixture｜owner：本单`, cwd: scratch, codexBin: execMock });
  const execTurns = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(execTurns.length, 2);
  assert.deepEqual(execTurns[1].args.slice(-3), ['resume', 'exec-thread', '-']);
  assert.match(execTurns[1].prompt, /首轮没有任何工具调用，请按 brief 的授权范围实际开始执行任务/);
  assert.equal(execRecovery.continueCount, 1);
  assert.equal(execRecovery.continueRequired, false);
  assert.equal(execRecovery.acceptance.verdict, 'ok');
  console.log('PASS - empty zero-tool exec resumes once to execute the brief');
  delete process.env.EXEC_EMPTY_REPORT;
  delete process.env.FLEET_CODEX_BACKEND;
  process.env.MODE = 'missing-sections';
  process.env.TRACE = join(scratch, 'document.trace');
  const documentRun = await runCode({ prompt: `归类：Codex 文档任务\nREPORT: ${process.env.REPORT_FILE}\n## 目标\n更新文档`, cwd: scratch, codexBin: mock });
  assert.equal(documentRun.continueCount, 2);
  delete process.env.FLEET_DETACHED_RUN_ID;
  delete process.env.FLEET_NO_CONTINUE;
  process.env.MODE = 'stuck';
  process.env.TRACE = join(scratch, 'report-only.trace');
  process.env.FLEET_CODEX_BIN = mock;
  process.env.FLEET_NO_ARCHIVE_SWEEP = '1';
  const cli = new URL('../bin/agent-fleet.mjs', import.meta.url).pathname;
  let detached;
  try {
    detached = execFileSync(process.execPath, [cli, 'code', '测试部分完成续做', '--cwd', scratch, '--report', process.env.REPORT_FILE],
      { cwd: scratch, env: process.env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('无进展的 partial 应以非零状态退出');
  } catch (error) {
    assert.equal(error.status, 1);
    detached = error.stdout;
  }
  assert.match(detached, /续做 2 次/);
  const reportOnlyTrace = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(reportOnlyTrace.filter(q => q.method === 'turn/start').length, 3);
  const artifact = join(scratch, 'declared-output');
  const artifactBrief = `产物清单：\n- 文件：${artifact}（上限 2 KB）\n`;
  writeFileSync(artifact, 'before');
  const artifactBefore = readContinuationState(scratch, process.env.REPORT_FILE, artifactBrief);
  writeFileSync(artifact, 'after');
  assert(continuationProgress(artifactBefore, readContinuationState(scratch, process.env.REPORT_FILE, artifactBrief)).files);
  const authorizedCommit = '## 授权覆盖\n允许在本地分支提交。\n## 目标\n验收：必须提交代码，给出提交哈希。';
  const missing = continuationRules({ conclusion: '完成', report: '## 结论\n完成' }, authorizedCommit + '\n给出读回结果');
  assert(missing.some(item => item.includes('规则回执')));
  assert(missing.some(item => item.includes('提交哈希')));
  assert(missing.some(item => item.includes('实际读回')));
  assert.deepEqual(continuationRules({ conclusion: '失败', report: '' }, '提交哈希'), []);
  assert.deepEqual(continuationRules({ conclusion: '完成', report: '## 规则回执\n## 结论\n## 实际执行\n## 改动与产物\nabcdef123\n## 验证证据\n读回结果：通过\n## 偏差\n## 未完成/风险/需要用户决定的事' }, '给出提交哈希和读回结果'), []);
  const completeReport = { conclusion: '完成', report: ['规则回执', '结论', '实际执行', '改动与产物', '验证证据', '偏差', '未完成/风险/需要用户决定的事'].map(section => `## ${section}\n完成`).join('\n') };
  assert.deepEqual(continuationRules(completeReport, '## 授权覆盖\n允许在本地分支提交。\n## 目标\n修复提交哈希误判。'), []);
  assert(continuationRules(completeReport, '## 授权覆盖\n发布全流程。\n## 目标\n验收：必须提交代码，给出提交哈希。').some(x => x.includes('提交哈希')));
  const readonlyBrief = '## 授权覆盖\n本块不含 git 写操作。\n## 目标\n验收：分析并报告，列出提交哈希。';
  assert.deepEqual(continuationRules(completeReport, readonlyBrief), []);
  assert(continuationRules(completeReport, authorizedCommit).some(x => x.includes('提交哈希')));
  assert(continuationRules(completeReport, '## 授权覆盖\n允许在本地分支提交。\n## 目标\n验收：提交修复。').some(x => x.includes('提交哈希')));
  for (const negative of ['无权限问题', '不缺授权']) {
    const report = completeReport.report + '\n' + negative;
    assert(continuationRules({ ...completeReport, report }, authorizedCommit).some(x => x.includes('提交哈希')), negative);
    const decision = await judgeContinuation({ brief: authorizedCommit, report, finalReply: '', judge: async () => ({ ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }) });
    assert.equal(decision.decision, 'continue', negative);
  }
  assert.deepEqual(continuationRules(completeReport, '## 授权覆盖\n允许在本地分支提交。\n## 目标\n验收：分析并报告。'), []);
  for (const blocker of ['缺少 Git 写授权', '缺少团队发布入口', '缺少必需外部输入', '需要主线程提供复现信息', '无需额外权限但缺少必需输入']) {
    const blocked = { conclusion: '完成授权内步骤', report: completeReport.report + '\n' + blocker };
    assert(continuationRules(blocked, authorizedCommit).some(x => x.includes('提交哈希')), blocker);
    let called = false;
    const decision = await judgeContinuation({ brief: authorizedCommit, report: blocked.report, finalReply: '', judge: async () => { called = true; return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }; } });
    assert.equal(decision.decision, 'continue', blocker);
    assert.equal(called, true, blocker);
  }
  let localJudgePayload;
  const localJudge = await judgeContinuation({ brief: readonlyBrief, report: completeReport.report, finalReply: '', judge: async payload => { localJudgePayload = payload; return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }; } });
  assert.equal(localJudge.decision, 'done');
  assert(!Object.hasOwn(localJudgePayload.questions.deliverable.criteria, 'commit'));
  const localAuth = readFileSync(new URL('../skill/templates/blocks/auth-local.md', import.meta.url), 'utf8');
  for (const brief of [
    `## 授权覆盖\n${localAuth}\n## 验收\n报告列出本地提交哈希。`,
    '## 授权覆盖\n不允许在本地分支提交。\n## 验收\n报告列出本地提交哈希。',
    '## 授权覆盖\n授权块：不含 local-commit\n## 验收\n报告列出本地提交哈希。',
    '## 授权覆盖\n授权块：不含 deploy-prod\n## 验收\n报告列出本地提交哈希。',
    '## 授权覆盖\n允许在本地分支提交。本单不做任何 git 提交。\n## 验收\n报告列出本地提交哈希。',
    '## 授权覆盖\n本单不做任何 git 提交；允许在本地分支提交。\n## 验收\n报告列出本地提交哈希。',
    `${authorizedCommit}\n本单不做任何 git 提交。`,
    `${authorizedCommit}\n本单不做任何提交。`,
    `${authorizedCommit}\n本单不提交、不需要提交哈希。`,
  ]) {
    assert.deepEqual(continuationRules(completeReport, brief), []);
    let payload;
    const decision = await judgeContinuation({ brief, report: completeReport.report, finalReply: '', judge: async value => { payload = value; return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }; } });
    assert(!Object.hasOwn(payload.questions.deliverable.criteria, 'commit'));
    assert.equal(decision.decision, 'done');
  }
  const generatedCommitBrief = execFileSync('python3', [new URL('../src/fleet-go.py', import.meta.url).pathname,
    'new', 'continue-commit-test', '--to', 'gpt', '--on', 'local', '--local-reason', 'test fixture', '--auth', 'local-commit',
    '--goal', '修复并本地提交', '--body', '-', '--pitfalls', '', '--dry-run', '--no-lint'], { encoding: 'utf8', input: '' });
  assert.match(generatedCommitBrief, /授权含提交才写哈希，否则写“本单不提交”/);
  for (const brief of [generatedCommitBrief, `${authorizedCommit}\n模板引用：授权含提交才写哈希，否则写“本单不提交”`]) {
    assert(continuationRules(completeReport, brief).some(item => item.includes('提交哈希')));
    let payload;
    const decision = await judgeContinuation({ brief, report: completeReport.report, finalReply: '', judge: async value => { payload = value; return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }; } });
    assert(Object.hasOwn(payload.questions.deliverable.criteria, 'commit'));
    assert.equal(decision.decision, 'continue');
  }
  const generatedPatrolBrief = execFileSync('python3', [new URL('../src/fleet-go.py', import.meta.url).pathname,
    'new', 'continue-local-patrol-test', '--to', 'gpt', '--on', 'local', '--local-reason', 'test fixture', '--auth', 'local',
    '--goal', '本地巡检并记录报告', '--body', '-', '--pitfalls', '', '--dry-run', '--no-lint'], { encoding: 'utf8', input: '' });
  assert.match(generatedPatrolBrief, /本单不做 git 提交，报告不需要提交哈希/);
  // 同一张表核对规则层与 JEV；包含实际生成模板和原 local 巡检授权形态。
  const commitCases = [
    ...['禁止提交代码', '不得提交代码', '不允许提交代码', '本单不做任何 git 提交', '本单不做代码提交']
      .flatMap(ban => [
        [ban + '（正文）', `${authorizedCommit}\n${ban}。`, false],
        [ban + '（授权块）', `## 授权覆盖\n允许在本地分支提交，${ban}。\n## 验收\n报告列出本地提交哈希。`, false],
      ]),
    ['条件说明', `${authorizedCommit}\n授权含提交才写哈希，否则本单不提交。`, true],
    ['条件说明变体', `${authorizedCommit}\n如果授权允许提交，则给出哈希，否则本单不做任何 git 提交。`, true],
    ['模板引用', `${authorizedCommit}\n模板引用：本单不做任何 git 提交。`, true],
    ['报告模板引用', `${authorizedCommit}\n报告模板：本单不做任何 git 提交。`, true],
    ['报告模板', `${authorizedCommit}\n## 改动与产物 ← 未授权时写本单不做任何 git 提交`, true],
    ['条件后实际禁令', `${authorizedCommit}\n授权含提交才写哈希，否则本单不提交。禁止提交代码。`, false],
    ['分支限制', `${authorizedCommit}\n禁止向 main 分支提交代码。不得提交到 master。`, true],
    ['推送限制', `${authorizedCommit}\n禁止推送代码。不得推送本地提交。`, true],
    ['生成 local-commit', generatedCommitBrief, true],
    ['生成 local 巡检', generatedPatrolBrief, false],
    ['local 巡检', `## 授权覆盖\n${localAuth}\n## 目标\n巡检并记录报告。\n## 验收\n报告列出本地提交哈希。`, false],
  ];
  for (const [name, brief, required] of commitCases) {
    assert.equal(continuationRules(completeReport, brief).some(item => item.includes('提交哈希')), required, name);
    let payload;
    const decision = await judgeContinuation({ brief, report: completeReport.report, finalReply: '', judge: async value => {
      payload = value;
      return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } };
    } });
    assert.equal(Object.hasOwn(payload.questions.deliverable.criteria, 'commit'), required, name);
    assert.equal(decision.decision, required ? 'continue' : 'done', name);
  }
  for (const auth of ['允许在本地分支提交。', '授权块：local-commit', '授权块：deploy-prod',
    readFileSync(new URL('../skill/templates/blocks/auth-local-commit.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../skill/templates/blocks/auth-deploy-prod.md', import.meta.url), 'utf8')]) {
    const brief = `## 授权覆盖\n${auth}\n## 验收\n报告列出本地提交哈希。`;
    assert(continuationRules(completeReport, brief).some(item => item.includes('提交哈希')), auth);
    let payload;
    const decision = await judgeContinuation({ brief, report: completeReport.report, finalReply: '', judge: async value => { payload = value; return { ok: true, answers: { deliverable: { choice: 'commit', confidence: 0.9 } } }; } });
    assert(Object.hasOwn(payload.questions.deliverable.criteria, 'commit'), auth);
    assert.equal(decision.decision, 'continue', auth);
  }
  const reportBefore = { head: 'same', files: 'same', report: 'old' };
  assert.equal(continuationProgress(reportBefore, { ...reportBefore, report: 'new' }).progress, false);
  const style = readFileSync(new URL('../skill/templates/blocks/style-sol.md', import.meta.url), 'utf8');
  assert.deepEqual(continuationRules(completeReport, style + '\n验收：本地测试通过。不提交、不部署。'), []);
  assert.deepEqual(continuationRules(completeReport, style + '\n要求不提交哈希，无需读回结果。'), []);
  assert(continuationRules(completeReport, style + '\n' + authorizedCommit + '\n验收：报告必须给出提交哈希和读回结果。').some(item => item.includes('提交哈希')));
  assert(continuationRules(completeReport, '不部署；验收：给出本地文件读回结果').some(item => item.includes('实际读回')));
  // 运行时拼接假凭据，拦截裁判入口核对 state 及 criteria 均已脱敏。
  const fake = 'sk-' + 'fakeCredentialForContinuationTest12345';
  let sanitizedPayload;
  await judgeContinuation({ brief: `验收：检查 token=${fake}`, report: `## 未完成/风险/需要用户决定的事\n读回 token=${fake}`, finalReply: `Bearer ${fake}`,
    judge: async payload => { sanitizedPayload = payload; return { ok: false }; } });
  assert(!JSON.stringify(sanitizedPayload).includes(fake));
  for (const value of Object.values(sanitizedPayload.state)) assert.match(value, /REDACTED/);
  assert.match(sanitizedPayload.state.brief, /REDACTED/);
  // 密码刻意很短且不含 token 前缀，确保确实由连接串规则遮挡，而非令牌规则误打误撞。
  const password = ['db', 'pass', '42'].join('');
  for (const scheme of ['postgres', 'postgresql', 'mysql', 'redis', 'rediss', 'mongodb', 'mongodb+srv']) {
    const connection = `${scheme}://tester:${password}@db.example.invalid:1234/app`;
    assert.equal(redactEvidence(connection), `${scheme}://tester:[REDACTED]@db.example.invalid:1234/app`);
    let request;
    const decision = await judgeContinuation({
      brief: `验收：检查 DATABASE_URL=${connection}`,
      report: `## 未完成/风险/需要用户决定的事\n读回 ${connection}`,
      finalReply: `读回结果：${connection}`,
      judge: async payload => {
        request = payload;
        return { ok: true, answers: { deliverable: { choice: 'done', confidence: 0.9 } } };
      },
    });
    // 在裁判调用外断言，避免异常被不可用回退吞掉；返回的续做缺项也必须保持脱敏。
    assert(!JSON.stringify(request).includes(password), scheme);
    assert(!JSON.stringify(decision).includes(password), scheme);
    for (const field of Object.values(request.state)) assert.match(field, /REDACTED/);
    assert.match(request.state.brief, /REDACTED/);
  }
  for (const name of ['DATABASE_URL', 'MYSQL_URL', 'REDIS_URL', 'MONGODB_URL', 'DATABASE_DSN']) {
    for (const value of [password, `"host=db.example.invalid password=${password}"`, `'host=db.example.invalid pwd=${password}'`]) {
      assert.equal(redactEvidence(`${name}=${value}`), `${name}=[REDACTED]`);
    }
    assert.equal(JSON.parse(redactEvidence({ nested: { [name]: `host=db.example.invalid pwd=${password}` } })).nested[name], '[REDACTED]');
  }
  assert.equal(redactEvidence('https://example.invalid/path'), 'https://example.invalid/path');
  const invalidJudge = await judgeContinuation({ brief: '测试', report: '', finalReply: '', judge: async () => ({ ok: true, answers: {} }) });
  assert.equal(invalidJudge.decision, 'skip');
  for (const choice of ['file', 'section', 'commit', 'readback']) {
    const decision = await judgeContinuation({ brief: choice === 'commit' ? authorizedCommit : '验收：交付文件', report: '', finalReply: '', judge: async () => ({ ok: true, answers: { deliverable: { choice, confidence: 0.9 } } }) });
    assert.equal(decision.decision, 'continue');
  }
  assert(continuationRules({ ...completeReport, conclusion: '部分完成' }, '覆盖未穷尽，还可补证').includes('完成报告中未完成的任务'));
  assert.deepEqual(reportContinuation({conclusion:'未完成', report:'受阻：用户决定｜缺授权｜已查配置｜请决定'}), []);
  assert(reportContinuation({conclusion:'未完成', report:'受阻：本单｜缺工作｜已查｜继续做'}).length);
  assert.deepEqual(reportContinuation({conclusion:'未完成', report:'受阻：input｜缺输入｜已查配置｜主会话'}), []);
  assert.deepEqual(unblockedItems(['V1','V2'], '受阻：input｜V1 缺输入｜已查配置｜主会话'), ['V2']);
  assert.deepEqual(unblockedItems(['V1','V2'], '受阻：input｜缺输入｜已查配置｜主会话'), ['V1','V2']);
  assert.deepEqual(reportContinuation({conclusion:'部分完成', report:'受阻：input｜阶段：一 缺输入｜已查｜主会话'}, {stages:['阶段：一','阶段：二'],stage:0}), ['完成阶段：阶段：二']);
  assert.deepEqual(reportContinuation({conclusion:'完成', report:''}), []);
  assert.deepEqual(reportContinuation({conclusion:'完成', report:''}, {stages:['一','二'], stage:1}), ['完成阶段：二']);
  const localBrief = '## 授权覆盖\n本块不含 git 写操作\n## 验收\n产物清单：\n- 报告：report.md\n报告列出本地提交哈希';
  writeFileSync(join(scratch, 'report.md'), 'ok');
  assert.deepEqual(continuationRules(completeReport, localBrief, scratch), []);
  const commitBrief = '## 授权覆盖\n允许在本地分支提交。\n## 目标\n实现代码并提交，给出提交哈希。';
  const initial = { head: 'abc', files: 'unchanged' };
  assert(continuationRules({ ...completeReport, ...initial, files: 'other-change', conclusion: '未完成', report: completeReport.report + '\n基线 abcdef123' }, commitBrief, scratch, initial).some(x => x.includes('实现改动')));
  for (const action of ['推送 / 部署 / 本地提交', '本地提交']) {
    const releaseBrief = `${commitBrief}\n动作: ${action}`;
    const missing = continuationRules({ ...completeReport, ...initial, conclusion: '部分完成' }, releaseBrief, scratch, initial);
    assert(!missing.some(x => x.includes('实现改动')));
    assert(missing.some(x => x.includes('提交哈希')));
  }
  assert(continuationRules({ ...completeReport, ...initial, conclusion: '部分完成' }, `${commitBrief}\n动作: 改代码 / 推送`, scratch, initial).some(x => x.includes('实现改动')));
  assert.equal(buildBrief({ok:true, result:'未完成', reportConclusion:'未完成'}).verdict, 'partial');
  assert(!continuationRules({ ...completeReport, ...initial, head: 'def', conclusion: '部分完成', report: completeReport.report + '\nabcdef123' }, commitBrief, scratch, initial).some(x => x.includes('实现改动')));
  assert(continuationRules(completeReport, '产物清单：\n- 报告：missing.md（上限 2 KB）\n', scratch).some(item => item.includes('missing.md')));
  const low = await judgeContinuation({ brief: '覆盖未穷尽', report: '', finalReply: '', judge: async () => ({ ok: true, answers: { deliverable: { choice: 'file', confidence: 0.4 } } }) });
  assert.equal(low.decision, 'done');
  // 同一路径内容变化、提交算进展，单独修改报告不算。
  const repo = join(scratch, 'repo'); mkdirSync(repo);
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git(['init']); git(['config', 'user.email', 'test@example.invalid']); git(['config', 'user.name', 'test']);
  writeFileSync(join(repo, 'file'), 'a'); git(['add', '.']); git(['commit', '-m', 'fixture']);
  const previousCommit = git(['rev-parse', 'HEAD']).toString().trim();
  const carriedState = { ...completeReport, conclusion: '部分完成', head: previousCommit, report: completeReport.report + `\n提交 ${previousCommit}` };
  const carriedBrief = `${commitBrief}\n## 续接（上一轮已本地提交 ${previousCommit.slice(0, 7)}，未推送）`;
  assert(!continuationRules(carriedState, carriedBrief, repo, { head: previousCommit }).some(x => x.includes('实现改动')));
  assert(continuationRules(carriedState, commitBrief, repo, { head: previousCommit }).some(x => x.includes('实现改动')));
  assert(continuationRules({ ...carriedState, report: completeReport.report }, carriedBrief, repo, { head: previousCommit }).some(x => x.includes('实现改动')));
  assert(continuationRules(carriedState, `${commitBrief}\n续接：上一轮提交 deadbeef123`, repo, { head: previousCommit }).some(x => x.includes('实现改动')));
  // 另一个 worktree 已推送并删除后，通过报告完整哈希识别远端提交。
  const remote = join(scratch, 'remote.git');
  execFileSync('git', ['init', '--bare', remote], { stdio: 'pipe' });
  git(['remote', 'add', 'origin', remote]); git(['push', 'origin', 'HEAD:main']);
  const worktree = join(scratch, 'worktree');
  git(['worktree', 'add', '-b', 'worktree-test', worktree]);
  writeFileSync(join(worktree, 'worktree-file'), 'change');
  execFileSync('git', ['add', 'worktree-file'], { cwd: worktree, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'worktree change'], { cwd: worktree, stdio: 'pipe' });
  const remoteCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: worktree, encoding: 'utf8' }).trim();
  execFileSync('git', ['push', 'origin', 'HEAD:test'], { cwd: worktree, stdio: 'pipe' });
  git(['worktree', 'remove', worktree]);
  git(['update-ref', '-d', 'refs/remotes/origin/test']);
  const remoteBrief = `${commitBrief}\n## 允许范围\n允许写：\n- ${repo}\n只读：\n无`;
  const remoteState = { ...carriedState, report: completeReport.report + `\n提交 ${remoteCommit}` };
  assert(!continuationRules(remoteState, remoteBrief, scratch, { head: previousCommit }).some(x => x.includes('实现改动')));
  assert(continuationRules({ ...remoteState, report: completeReport.report + `\n提交 ${remoteCommit.slice(0, 7)}` }, remoteBrief, scratch, { head: previousCommit }).some(x => x.includes('实现改动')));
  git(['branch', 'local-only']);
  writeFileSync(join(repo, 'local-file'), 'local'); git(['add', 'local-file']); git(['commit', '-m', 'local only']);
  const localCommit = git(['rev-parse', 'HEAD']).toString().trim();
  assert(continuationRules({ ...remoteState, report: completeReport.report + `\n提交 ${localCommit}` }, remoteBrief, scratch, { head: previousCommit }).some(x => x.includes('实现改动')));
  const trackedReport = join(repo, 'report.md');
  writeFileSync(trackedReport, 'before');
  const reportState = readContinuationState(repo, trackedReport, '产物清单：\n- 报告：report.md\n');
  writeFileSync(trackedReport, 'after');
  assert.equal(continuationProgress(reportState, readContinuationState(repo, trackedReport, '产物清单：\n- 报告：report.md\n')).progress, false);
  const nested = join(repo, 'nested'); mkdirSync(nested);
  writeFileSync(join(nested, 'file'), 'one'); git(['add', '.']); git(['commit', '-m', 'nested']);
  writeFileSync(join(nested, 'file'), 'two'); const nestedBefore = readContinuationState(nested);
  writeFileSync(join(nested, 'file'), 'three');
  assert(continuationProgress(nestedBefore, readContinuationState(nested)).files);
  const a = readContinuationState(repo);
  writeFileSync(join(repo, 'file'), 'b'); const b = readContinuationState(repo);
  assert(continuationProgress(a, b).files);
  writeFileSync(join(repo, 'file'), 'c'); const c = readContinuationState(repo);
  assert(continuationProgress(b, c).files);
  git(['add', '.']); git(['commit', '-m', 'progress']);
  assert(continuationProgress(c, readContinuationState(repo)).commits);
  // V1 续做闸门专项验证：文字改写不续做第三轮（普通+具名验收）、有新产物继续、park 豁免、流水线等待豁免。
  for (const [mode, promptText] of [
    ['rewrite-only', `REPORT: ${join(scratch, 'rewrite-only.md')}\n测试仅改写报告文字`],
    ['named-rewrite', `REPORT: ${join(scratch, 'named-rewrite.md')}\n## 验收\nV1 核验｜owner：本单`],
  ]) {
    process.env.MODE = mode;
    process.env.FLEET_DETACHED_RUN_ID = mode;
    process.env.TRACE = join(scratch, mode + '.trace');
    process.env.REPORT_FILE = join(scratch, mode + '.md');
    const result = await runCode({ prompt: promptText, cwd: scratch, codexBin: mock });
    const starts = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.method === 'turn/start');
    assert.equal(starts.length, 3, `${mode} 不续做第三轮`);
    assert.equal(result.continueCount, 2, `${mode} 仅续做两次`);
    assert.match(result.continueStop, /无进展停续做，交派单方裁定/, mode);
    const brief = buildBrief(result);
    assert.equal(brief.verdict, 'needs-review', `${mode} verdict 标 needs-review`);
    assert.equal(brief.verdictNote, '无进展停续做，交派单方裁定', mode);
    assert.match(readFileSync(result.resultPath, 'utf8'), /无进展停续做，交派单方裁定/, mode);
  }
  {
    const id = 'park-exempt';
    process.env.MODE = id;
    process.env.FLEET_DETACHED_RUN_ID = process.env.FLEET_SLOT_RUN_ID = id;
    process.env.TRACE = join(scratch, id + '.trace');
    process.env.YIELD_FILE = join(scratch, id + '.yield');
    process.env.REPORT_FILE = join(scratch, id + '.md');
    await registerQueue({ runId: id, model: 'gpt-6.1-terra' });
    assert(await acquireSlot(id));
    const pending = runCode({ prompt: `REPORT: ${process.env.REPORT_FILE}\n测试 park 豁免`, cwd: scratch, codexBin: mock });
    for (let i = 0; i < 500 && queueRecord(id)?.state !== 'parked'; i++) await delay(10);
    assert.equal(queueRecord(id).state, 'parked', '第 3 轮进入 park');
    writeFileSync(join(scratch, 'park-exempt-ready'), 'done');
    const result = await pending;
    await setSlotState(id, 'done');
    delete process.env.FLEET_SLOT_RUN_ID;
    const starts = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse).filter(e => e.method === 'turn/start');
    assert.equal(starts.length, 4, 'park 唤醒后继续第 4 轮完成');
    assert.equal(result.continueStop, undefined, 'park 豁免不触发无进展停机');
    assert.equal(buildBrief(result).verdict, 'ok', 'park 豁免后正常完成');
    assert.deepEqual(result.externalWait, { waiting: true, reason: 'park:file' }, '记录 park 外部等待');
  }
  {
    const namedBrief = '## 验收\n- V1 验证｜owner：本单\n- V2 外部｜owner：派单方';
    const r1 = '## 结论\nV1｜未过｜尝试一\nV2｜等外部｜等待 CI';
    const r2 = '## 结论\nV1｜未过｜仅改写证据文字尝试二\nV2｜等外部｜等待 CI';
    const r3 = '## 结论\nV1｜已过｜测试通过\nV2｜等外部｜等待 CI';
    const s1 = { head: 'h1', files: 'f1', report: r1, acceptance: acceptanceResult(namedBrief, r1), externalWait: { waiting: false, reason: null, key: null } };
    const s2 = { head: 'h1', files: 'f1', report: r2, acceptance: acceptanceResult(namedBrief, r2), externalWait: { waiting: false, reason: null, key: null } };
    const s3 = { head: 'h1', files: 'f1', report: r3, acceptance: acceptanceResult(namedBrief, r3), externalWait: { waiting: false, reason: null, key: null } };
    assert.equal(continuationProgress(s1, s2).progress, false, '仅改写具名验收文字不算进展');
    assert.equal(continuationProgress(s2, s3).progress, true, '具名验收状态变化算进展');
    assert.equal(continuationProgress(s2, s3).acceptance, true, '标记 acceptance 变化');
    const w1 = { head: 'h1', files: 'f1', report: 'a', acceptance: null, externalWait: { waiting: true, reason: 'pipeline-wait', key: 'pipeline:1' } };
    const w2 = { head: 'h1', files: 'f1', report: 'b', acceptance: null, externalWait: { waiting: true, reason: 'pipeline-wait', key: 'pipeline:1' } };
    assert.equal(continuationProgress(w1, w2).externalWaitExempt, true, '等待流水线豁免无进展停机');
    const w3 = { head: 'h1', files: 'f1', report: 'c', acceptance: null, externalWait: { waiting: true, reason: 'pipeline-wait', key: 'pipeline:2' } };
    assert.equal(continuationProgress(w2, w3).externalWait, true, '外部等待状态变化算进展');
  }
  console.log('PASS - V1 续做闸门：文字改写不续做第三轮(needs-review)、有新产物继续、park 与等待流水线豁免');
  console.log('PASS - 部分完成同线程续做、终态/开关/review 跳过、连续两次无进展停止、超过三次的进展续做');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  rmSync(scratch, { recursive: true, force: true });
}

// Named items use only report rows and new evidence.
const named = '## 验收\n- V1 验证｜owner：本单\n- V2 外部｜owner：派单方';
const state = report => ({ head: 'same', acceptance: acceptanceResult(named, '## 结论\n' + report) });
const before = state('V1｜未过｜a\nV2｜等外部｜CI');
assert.deepEqual(acceptanceContinuation(before, before), { missing: ['V1'], blocked: true });
assert.deepEqual(acceptanceContinuation(before, before, true), { missing: ['V1'], blocked: false });
assert.deepEqual(acceptanceContinuation(before, { ...before, head: 'new' }), { missing: ['V1'], blocked: false });
assert.deepEqual(acceptanceContinuation(before, state('V1｜未过｜b')), { missing: ['V1'], blocked: false });
assert.deepEqual(acceptanceContinuation(before, state('V1｜已过｜b\nV2｜未过｜CI')), { missing: [], blocked: false });
