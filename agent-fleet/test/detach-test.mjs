import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const scratch = mkdtempSync(join(tmpdir(), 'fleet-detach-'));
const cli = resolve('bin/agent-fleet.mjs');
const runs = join(scratch, 'runs');
mkdirSync(runs);
const stub = join(scratch, 'runner');
writeFileSync(stub, `#!/bin/sh
out=
if [ "$1" = 'app-server' ]; then
  exec node -e 'require("node:readline").createInterface({input:process.stdin}).on("line", line => {
    const request = JSON.parse(line);
    if (request.id !== undefined) console.log(JSON.stringify({id:request.id,result:{}}));
  });'
fi
if [ -n "$FLEET_TEST_ARGS" ]; then printf '%s\\n' "$@" > "$FLEET_TEST_ARGS"; fi
if [ -n "$FLEET_TEST_SESSION" ]; then printf '{"type":"thread.started","thread_id":"%s"}\\n' "$FLEET_TEST_SESSION"; fi
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then shift; out=$1; fi
  shift
done
if [ -z "$out" ]; then out="$FLEET_TEST_RESULT"; else cat >/dev/null; fi
sleep "$FLEET_TEST_SLEEP" &
kid=$!
printf '%s %s\\n' "$$" "$kid" > "$FLEET_TEST_PIDS"
wait "$kid"
printf 'stub completed\\n' > "$out"
printf 'stub log\\n'
exit "$FLEET_TEST_EXIT"
`, { mode: 0o755 });
const mock = join(scratch, 'sdk.mjs');
writeFileSync(mock, `import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
export function query({prompt, options}) {
  let child;
  return {
    interrupt: async () => child?.kill('SIGTERM'),
    async *[Symbol.asyncIterator]() {
      yield {type:'system', session_id:'stub-session'};
      // 使用真正的子进程桩，避免任何模型/网关访问。
      child = spawn(process.env.FLEET_CODEX_BIN, [], {stdio:['ignore','inherit','inherit']});
      const code = await new Promise(r => child.once('close', r));
      yield {type:'result', subtype:'success', session_id:'stub-session', is_error:code !== 0,
        result: readFileSync(process.env.FLEET_TEST_RESULT,'utf8'), num_turns:1, total_cost_usd:0};
    }
  };
}`);
const loader = join(scratch, 'loader.mjs');
writeFileSync(loader, `export async function resolve(specifier, context, next) {
  if (specifier === '@anthropic-ai/claude-agent-sdk') return {url:${JSON.stringify(pathToFileURL(mock).href)},shortCircuit:true};
  return next(specifier,context);
}`);
const cfg = join(scratch, 'models.json');
writeFileSync(cfg, JSON.stringify({ stub: { model: 'stub-gemini', baseURL:'http://127.0.0.1:1', apiKeyEnv:'FLEET_TEST_KEY' } }));
const env = { ...process.env, FLEET_TEST_SLEEP:'1', FLEET_TEST_EXIT:'0', AGENT_FLEET_RUNS_DIR:runs, FLEET_CODEX_BIN:stub, FLEET_CODEX_BACKEND:'exec',
  FLEET_TEST_PIDS:join(scratch,'pids'), FLEET_TEST_RESULT:join(scratch,'gateway-result'),
  FLEET_TEST_KEY:'fake-test-key', NODE_OPTIONS:`--no-warnings --experimental-loader=${pathToFileURL(loader).href}` };
// 测试启动器不能继承宿主 fleet 的执行器身份。
delete env.FLEET_DETACHED_RUN_ID;
delete env.FLEET_DETACHED_BATCH;
const sleep = ms => new Promise(r=>setTimeout(r,ms));
function cliRun(args, extra={}) {
  return new Promise((r,reject)=>{
    const p=spawn(process.execPath,[cli,...args],{env:{...env,...extra},cwd:scratch});
    let stdout='', stderr='';
    p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);
    p.once('error',reject);p.once('close',code=>r({code,stdout,stderr}));
  });
}
const state = id => JSON.parse(readFileSync(join(runs,`${id}.json`),'utf8'));
async function launch(command='code', extra={}, prefix=[]) {
  const args=command==='code' ? ['code','stub brief','--cwd',scratch] : ['run','--model','stub','--prompt','stub brief','--models-config',cfg,'--cwd',scratch];
  const start=Date.now();const out=await cliRun([...args,...prefix,'--detach','--no-wait'],extra);
  assert.equal(out.code,0,out.stderr);assert(Date.now()-start<2000,'launcher under two seconds');
  const id=out.stdout.match(/runId: (.+)/)[1];
  assert(out.stdout.includes(`status: ${join(runs,`${id}.json`)}`));
  console.log(`launch ${command}: ${Date.now()-start}ms ${id}`);
  return id;
}
async function runnerReady() { for(let i=0;i<100;i++){ if(existsSync(env.FLEET_TEST_PIDS)) return readFileSync(env.FLEET_TEST_PIDS,'utf8').trim().split(' ').map(Number);await sleep(50); } throw Error('runner not ready'); }
function psReceipt(pids) {
  let output;
  try { output=execFileSync('ps',['-o','pid=,ppid=,pgid=,command=','-p',pids.join(',')],{encoding:'utf8',stdio:['ignore','pipe','ignore']}); }
  catch(err) { output=err.stdout || ''; }
  assert.equal(output.trim(),'','ps finds no stopped descendants');
  return `ps -o pid=,ppid=,pgid=,command= -p ${pids.join(',')}: (empty)`;
}
function alive(pid) { try {process.kill(pid,0);return true;}catch{return false;} }
const code = await launch();
assert.equal((await cliRun(['wait',code])).code,0);
assert.equal(state(code).status,'done');assert.equal(state(code).brief.verdict,'ok');
assert.match((await cliRun(['tail','--follow'])).stdout,/stub log/);
assert.match((await cliRun(['status'])).stdout,/done/);
const fail=await launch('code',{FLEET_TEST_EXIT:'1'});
assert.equal((await cliRun(['wait',fail])).code,1);assert.equal(state(fail).status,'failed');
const suspect=await launch('code',{},['--expect-changes']);
assert.equal((await cliRun(['wait',suspect])).code,1);assert.equal(state(suspect).verdict,'suspect');
const gateway=await launch('run');assert.equal((await cliRun(['wait','latest'])).code,0);
assert.equal(state(gateway).status,'done');
const speaking=await launch('run',{FLEET_TEST_SLEEP:'3'});await sleep(500);
assert.equal((await cliRun(['say',speaking,'hello gateway'])).code,0);
assert.equal((await cliRun(['wait',speaking])).code,0);assert.match(readFileSync(state(speaking).logPath,'utf8'),/收到插话.*hello gateway/);
assert.equal((await cliRun(['resume',gateway,'continue','--models-config',cfg])).code,0);
assert.match((await cliRun(['resume',code])).stderr,/Codex.*没有/);
const sessionId = await launch('code', { FLEET_TEST_SESSION:'detached-thread' }, ['--low','--review','--name','codex-continued','--report',join(scratch,'report.md')]);
const sessionWait=await cliRun(['wait',sessionId]);
assert.equal(sessionWait.code,0);
assert.match(sessionWait.stdout,/Codex：steer 0 次，resume 0 次/);
assert.equal(state(sessionId).threadId,'detached-thread');
assert.equal(state(sessionId).brief.backend,'codex-exec');
assert.equal(state(sessionId).brief.steerCount,0);
const resumeArgsPath=join(scratch,'resume-args');
const continued=await cliRun(['resume',sessionId,'追加要求','--no-wait'],{FLEET_TEST_SESSION:'detached-thread',FLEET_TEST_ARGS:resumeArgsPath});
assert.equal(continued.code,0,continued.stderr);
const continuedId=continued.stdout.match(/runId: (.+)/)[1];
assert.equal((await cliRun(['wait',continuedId])).code,0);
const continuedState=state(continuedId);
assert.equal(continuedState.threadId,'detached-thread');
assert.equal(continuedState.resumedFrom,sessionId);
assert.equal(continuedState.name,'codex-continued');
assert.equal(continuedState.reportPath,join(scratch,'report.md'));
assert.equal(continuedState.review,true);
assert.equal(continuedState.low,true);
const resumedArgs=readFileSync(resumeArgsPath,'utf8').trim().split('\n');
assert(resumedArgs.includes('resume') && resumedArgs.includes('detached-thread'));
assert(resumedArgs.includes('read-only') && resumedArgs.includes('model_reasoning_effort=low'));
console.log('Codex CLI resume: preserved thread, low/review/name/report and metadata');
const leftoverId='codex-executor-alive';
writeFileSync(join(runs,leftoverId+'.pid.json'),JSON.stringify({runId:leftoverId,model:'gpt-6.1-sol',pid:0,codexPid:process.pid,threadId:'detached-thread',cwd:scratch}));
const refused=await cliRun(['resume',leftoverId,'继续','--no-wait']);
assert.equal(refused.code,1);
assert.match(refused.stderr,/执行器仍在运行.*未启动重复续跑/);
assert.equal(existsSync(join(runs,leftoverId+'.inbox')),false);


// 等完整 30 秒心跳；顺带验证 SIGHUP、wait 超时和 Codex say 提示。
const beat=await launch('code',{FLEET_TEST_SLEEP:'34'});
await sleep(500);const before=state(beat).heartbeatAt;process.kill(state(beat).pid,'SIGHUP');
assert.equal((await cliRun(['wait',beat,'--timeout','0'])).code,1);
assert.match((await cliRun(['say',beat,'hello'])).stderr,/Codex.*不支持/);
await sleep(30_500);assert(state(beat).heartbeatAt>before,'30s heartbeat');
console.log(`heartbeat: ${before} -> ${state(beat).heartbeatAt}; SIGHUP survived`);
assert.equal((await cliRun(['wait',beat])).code,0);
const immediate=await launch('code',{FLEET_TEST_SLEEP:'60'});
assert.equal((await cliRun(['stop','latest'])).code,0);assert.equal(state(immediate).status,'stopped');
const stubborn = join(scratch,'stubborn-runner');
writeFileSync(stubborn, `#!${process.execPath}
const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');
const child=spawn(process.execPath,['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{detached:true,stdio:'ignore'});
child.unref();process.stdin.resume();setTimeout(()=>writeFileSync(process.env.FLEET_TEST_PIDS,process.pid+' '+child.pid),300);setInterval(()=>{},1000);
`,{mode:0o755});
const stubbornPids = join(scratch,'stubborn-pids');
const stubbornId=await launch('code',{FLEET_CODEX_BIN:stubborn,FLEET_TEST_PIDS:stubbornPids});
for(let i=0;i<100&&!existsSync(stubbornPids);i++)await sleep(50);
const stubbornIds=readFileSync(stubbornPids,'utf8').trim().split(' ').map(Number);
const stale=state(stubbornId);stale.heartbeatAt='2000-01-01T00:00:00.000Z';writeFileSync(join(runs,stubbornId+'.json'),JSON.stringify(stale));
assert.match((await cliRun(['status'])).stdout,/最后心跳=2000/);
assert.equal((await cliRun(['stop',stubbornId])).code,0);await sleep(200);
assert(stubbornIds.every(pid=>!alive(pid)),'stale heartbeat and detached TERM-ignoring descendant stopped');
console.log('new-group stop: '+psReceipt([state(stubbornId).pid,state(stubbornId).childPid,...stubbornIds]));
const stopped=await launch('code',{FLEET_TEST_SLEEP:'60',FLEET_TEST_PIDS:join(scratch,'stop-pids')});
for(let i=0;i<100&&!existsSync(join(scratch,'stop-pids'));i++)await sleep(50);
const pids=readFileSync(join(scratch,'stop-pids'),'utf8').trim().split(' ').map(Number);
assert.equal((await cliRun(['stop','latest'])).code,0);
assert.equal(state(stopped).status,'stopped');assert.equal((await cliRun(['wait',stopped])).code,1);
await sleep(200);assert(pids.every(p=>!alive(p)),'stop leaves no runner descendants');
console.log('stop: '+psReceipt([state(stopped).pid,state(stopped).childPid,...pids]));
const abnormal=await launch('code',{FLEET_TEST_SLEEP:'60',FLEET_TEST_PIDS:join(scratch,'abnormal-pids')});
await sleep(500);const abnormalRec=state(abnormal);process.kill(abnormalRec.pid,'SIGKILL');await sleep(200);
const status=await cliRun(['status']);assert.match(status.stdout,/最后心跳=.*异常终止/);
assert.equal((await cliRun(['wait',abnormal])).code,1);
// 仅清理本测试主动杀监督器后留下的测试执行组。
assert.equal((await cliRun(['stop',abnormal])).code,0);
assert.equal(state(abnormal).status,'stopped');assert(!alive(abnormalRec.childPid));
const front=await cliRun(['code','stub brief','--cwd',scratch,'--json','--attach']);assert.equal(front.code,0);assert.equal(JSON.parse(front.stdout).verdict,'ok');

// 默认 launcher 阻塞，保持 JSON/全文简报，并覆盖快捷别名与批量路径。
const briefFile=join(scratch,'default-brief.md');
writeFileSync(briefFile,'归类：(a) 默认桩任务\nREPORT: '+join(scratch,'report.md')+'\n完成桩任务');
const started=Date.now();
const defaultRun=await cliRun(['code',briefFile,'--cwd',scratch,'--json'],{FLEET_TEST_SLEEP:'2'});
assert.equal(defaultRun.code,0,defaultRun.stderr);assert(Date.now()-started>=2000);
assert.equal(JSON.parse(defaultRun.stdout).verdict,'ok');
const defaultId=JSON.parse(defaultRun.stdout).logPath.split('/').pop().slice(0,-4);
assert.equal(state(defaultId).status,'done');assert.equal(state(defaultId).name,'归类：(a) 默认桩任务');
assert.equal(state(defaultId).reportPath,join(scratch,'report.md'));
assert.notEqual(state(defaultId).pid,state(defaultId).childPid);
let instant=Date.now();assert.equal((await cliRun(['wait',defaultId.slice(0,-3)])).code,0);assert(Date.now()-instant<2000);
assert.match((await cliRun(['tail',state(defaultId).name])).stdout,/stub log/);
for (const command of ['copy','grok','bulk','gpt']) {
  const out=await cliRun([command,briefFile,'--model','stub','--models-config',cfg,'--cwd',scratch,'--name',command,'--json']);
  assert.equal(out.code,0,out.stderr);assert.equal(JSON.parse(out.stdout).verdict,'ok');
  assert.equal(state(JSON.parse(out.stdout).logPath.split('/').pop().slice(0,-4)).name,command);
}
const batch=join(scratch,'batch.json');writeFileSync(batch,JSON.stringify([{model:'stub',prompt:'one'},{model:'stub',prompt:'two'}]));
const batchOut=await cliRun(['run-many','--config',batch,'--models-config',cfg,'--cwd',scratch,'--json']);
assert.equal(batchOut.code,0,batchOut.stderr);assert.equal(JSON.parse(batchOut.stdout).length,2);
const batchId=JSON.parse(batchOut.stdout)[0].logPath.split('/').pop().split('-task-')[0];
assert.equal(state(batchId).status,'done');assert.equal(state(batchId).brief.length,2);
assert.notEqual(state(batchId).brief[0].resultPath,state(batchId).brief[1].resultPath);
assert.equal((await cliRun(['wait',batchId])).code,0);
// 显式 no-wait 无需 detach；默认失败返回 verdict 对应非零。
instant=Date.now();
const noWait=await cliRun(['code','stub brief','--cwd',scratch,'--name','no-wait-only','--no-wait'],{FLEET_TEST_SLEEP:'3'});
assert.equal(noWait.code,0);assert(Date.now()-instant<2000);
assert.equal(state(noWait.stdout.match(/runId: (.+)/)[1]).status,'running');
assert.equal((await cliRun(['wait','no-wait-only'])).code,0);
const defaultFail=await cliRun(['code','stub brief','--cwd',scratch,'--expect-changes']);
assert.equal(defaultFail.code,1);assert.match(defaultFail.stdout,/verdict: suspect/);
// attach 仍在派发者进程组，无监督状态，杀整组会结束桩及子孙。
const attachPids=join(scratch,'attach-pids');
const attached=spawn(process.execPath,[cli,'code','stub brief','--cwd',scratch,'--attach'],{detached:true,stdio:'ignore',env:{...env,FLEET_TEST_SLEEP:'60',FLEET_TEST_PIDS:attachPids}});
for(let i=0;i<100&&!existsSync(attachPids);i++)await sleep(50);
const attachIds=readFileSync(attachPids,'utf8').trim().split(' ').map(Number);
const attachPgids=execFileSync('ps',['-o','pgid=','-p',[attached.pid,...attachIds].join(',')],{encoding:'utf8'}).trim().split(/\s+/).map(Number);
assert(attachPgids.every(id=>id===attached.pid));
const attachClosed=new Promise(r=>attached.once('close',r));process.kill(-attached.pid,'SIGKILL');await attachClosed;await sleep(200);
assert(attachIds.every(pid=>!alive(pid)));console.log('attach group killed: '+psReceipt([attached.pid,...attachIds]));
// 监督器stopped必须覆盖收尾竞争中残留的成功output。
const stoppedOutput={...state(defaultId),runId:'stopped-output-check',status:'stopped',exitCode:1,
  brief:{...state(defaultId).brief,ok:false,verdict:'stopped'},output:'ok: true verdict: ok\n'};
writeFileSync(join(runs,stoppedOutput.runId+'.json'),JSON.stringify(stoppedOutput));
const waitModule=pathToFileURL(resolve('src/detach.mjs')).href;
const stoppedReceipt=await new Promise((resolve,reject)=>{
  const p=spawn(process.execPath,['--input-type=module','-e',`const {waitDetached}=await import(${JSON.stringify(waitModule)});process.exitCode=await waitDetached('stopped-output-check',{originalOutput:true});`],{env,cwd:scratch});
  let stdout='';p.stdout.on('data',d=>stdout+=d);p.once('error',reject);p.once('close',code=>resolve({code,stdout}));
});
assert.equal(stoppedReceipt.code,1);assert.match(stoppedReceipt.stdout,/verdict: stopped/);
// 24小时窗口、running筛选及早期心跳的中断提示。
const archived=state(defaultId);archived.finishedAt='2000-01-01T00:00:00Z';writeFileSync(join(runs,defaultId+'.json'),JSON.stringify(archived));
assert(!JSON.parse((await cliRun(['status','--json'])).stdout).some(r=>r.runId===defaultId));
const synthetic={...archived,runId:'synthetic-abnormal',status:'running',pid:0,heartbeatAt:archived.startedAt};
writeFileSync(join(runs,synthetic.runId+'.json'),JSON.stringify(synthetic));
const abnormalRows=JSON.parse((await cliRun(['status','--running','--json'])).stdout);
assert(abnormalRows.every(r=>['running','abnormal'].includes(r.status ?? r.state)));
assert(abnormalRows.some(r=>r.runId===synthetic.runId && r.status==='abnormal'));
assert.match((await cliRun(['status','--running'])).stdout,/可能因机器重启\/强制休眠中断，可用 fleet resume synthetic-abnormal/);
console.log('PASS default blocking / no-wait / attach / aliases / batch / metadata / status filtering / finished wait');

// 仅用已有执行器桩：短命 shell 退出，真实模拟 launcher 孤儿化。
for (const [label, marker, warned] of [
  ['claudecode', {CLAUDECODE:'1', CLAUDE_CODE_ENTRYPOINT:''}, true],
  ['entrypoint', {CLAUDECODE:'', CLAUDE_CODE_ENTRYPOINT:'cli'}, true],
  ['terminal', {CLAUDECODE:'', CLAUDE_CODE_ENTRYPOINT:''}, false],
]) {
  const outPath=join(scratch,`orphan-${label}.out`), errPath=join(scratch,`orphan-${label}.err`);
  const orphanEnv={...env,...marker,FLEET_NODE:process.execPath,FLEET_CLI:cli,FLEET_CWD:scratch,
    FLEET_OUT:outPath,FLEET_ERR:errPath,FLEET_NAME:`orphan-${label}`,FLEET_TEST_SLEEP:'5'};
  const shell=spawn('/bin/sh',['-c','"$FLEET_NODE" "$FLEET_CLI" code fixture --cwd "$FLEET_CWD" --name "$FLEET_NAME" > "$FLEET_OUT" 2> "$FLEET_ERR" &'],{env:orphanEnv,stdio:'ignore'});
  await new Promise((resolve,reject)=>{shell.once('error',reject);shell.once('close',resolve);});
  await sleep(2200);
  const rows=JSON.parse((await cliRun(['status','--running','--json'])).stdout);
  const row=rows.find(r=>r.name===orphanEnv.FLEET_NAME);
  assert(row, 'orphan fixture still running');
  const stderr=readFileSync(errPath,'utf8');
  const log=readFileSync(row.logPath,'utf8');
  if(warned) {
    assert.equal(row.launchDetached,true);
    assert.match(stderr,/检测到脱离启动/);assert(stderr.includes(row.runId));
    assert(log.startsWith(stderr.trim()),'warning at log head');
    assert.match((await cliRun(['status','--running'])).stdout,/⚠ detached-launch/);
  } else {
    assert.equal(stderr,'');assert(!Object.hasOwn(row,'launchDetached'));assert(!log.includes('检测到脱离启动'));
  }
  assert.equal((await cliRun(['wait',row.runId])).code,0,'execution exit unchanged');
  const finalRow=JSON.parse((await cliRun(['status','--json'])).stdout).find(r=>r.runId===row.runId);
  assert.equal(Boolean(finalRow.launchDetached),warned,'terminal metadata keeps guard result');
  assert.match(readFileSync(row.logPath,'utf8'),/stub log/,'log output preserved');
  assert.match(readFileSync(outPath,'utf8'),/verdict: ok/,'launcher still prints original summary');
}
const normalGuard=await cliRun(['code','fixture','--cwd',scratch,'--name','normal-guard'],{CLAUDECODE:'1',FLEET_TEST_SLEEP:'3'});
assert.equal(normalGuard.code,0);assert.equal(normalGuard.stderr,'','normal parent has no added output');
const normalRow=JSON.parse((await cliRun(['status','--json'])).stdout).find(r=>r.name==='normal-guard');
assert(!Object.hasOwn(normalRow,'launchDetached'));assert(!readFileSync(normalRow.logPath,'utf8').includes('检测到脱离启动'));
console.log('PASS launch guard: CLAUDECODE / ENTRYPOINT orphan warnings, log head, running and terminal status; terminal orphan and normal parent silent');

// 默认启动独立子shell：launcher仍在等待时杀整组，新shell按短名发现和等待。
const demoOut=join(scratch,'demo-launch.txt');const demoErr=join(scratch,'demo-launch.err');
const demoCommand='"$FLEET_NODE" "$FLEET_CLI" run --model stub --prompt demo --models-config "$FLEET_CFG" --cwd "$FLEET_CWD" --name survival-demo --report "$FLEET_REPORT" > "$FLEET_DEMO_OUT" 2> "$FLEET_DEMO_ERR"';
const demoEnv={...env,FLEET_NODE:process.execPath,FLEET_CLI:cli,FLEET_CFG:cfg,FLEET_CWD:scratch,FLEET_REPORT:join(scratch,'demo-report.md'),FLEET_DEMO_OUT:demoOut,FLEET_DEMO_ERR:demoErr,FLEET_TEST_SLEEP:'25'};
const dispatcher=spawn('/bin/sh',['-c',demoCommand],{detached:true,stdio:'ignore',env:demoEnv});
let demoId;
for(let i=0;i<100;i++){
  demoId=readdirSync(runs).filter(n=>n.endsWith('.json')&&!n.endsWith('.pid.json')).map(n=>JSON.parse(readFileSync(join(runs,n),'utf8'))).find(r=>r.name==='survival-demo' && r.childPid)?.runId;
  if(demoId)break;await sleep(50);
}
assert(demoId,'supervisor ready state found');
assert(alive(dispatcher.pid));assert.equal(readFileSync(demoOut,'utf8'),'','launcher blocks before summary');
const pgids=execFileSync('ps',['-o','pid=,ppid=,pgid=','-p',[dispatcher.pid,state(demoId).pid,state(demoId).childPid].join(',')],{encoding:'utf8'});
const closed=new Promise(r=>dispatcher.once('close',r));process.kill(-dispatcher.pid,'SIGKILL');await closed;
assert(alive(state(demoId).pid));
function newShell(command) {
  return new Promise((resolve,reject)=>{
    const p=spawn('/bin/sh',['-c',command],{env:demoEnv,cwd:scratch});let stdout='',stderr='';
    p.stdout.on('data',d=>stdout+=d);p.stderr.on('data',d=>stderr+=d);p.once('error',reject);p.once('close',code=>resolve({code,stdout,stderr}));
  });
}
const discovery=await newShell('"$FLEET_NODE" "$FLEET_CLI" status --running --json');
const discovered=JSON.parse(discovery.stdout).find(r=>r.runId===demoId);
assert.equal(discovered.name,'survival-demo');assert.equal(discovered.reportPath,demoEnv.FLEET_REPORT);assert.equal(discovered.status,'running');
const demo=await newShell('"$FLEET_NODE" "$FLEET_CLI" wait survival-demo');assert.equal(demo.code,0);assert.equal(state(demoId).status,'done');
instant=Date.now();assert.equal((await newShell('"$FLEET_NODE" "$FLEET_CLI" wait survival-demo')).code,0);assert(Date.now()-instant<2000);
console.log(`DEMO default launcher group ${dispatcher.pid} SIGKILL; supervisor ${state(demoId).pid} survived; new shell status name=${discovered.name} report=${discovered.reportPath}; wait exit=${demo.code}\n${pgids}${demo.stdout}`);
writeFileSync(join(scratch,'demo-evidence.json'),JSON.stringify({demoCommand,dispatcherPid:dispatcher.pid,runId:demoId,pgids,discovered,state:state(demoId),wait:demo},null,2));
console.log(`PASS detach integration; artifacts: ${scratch}`);
