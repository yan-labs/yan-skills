// 真实 detach 监督器配假 app-server：验证插话送到当前 turn，嵌套启动不覆盖外层身份。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const scratch = `/tmp/fleet-continue-gate/detach-say-${process.pid}`;
mkdirSync(scratch, { recursive: true });
const cli = resolve('bin/agent-fleet.mjs');
const mock = join(scratch, 'codex.cjs');
writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
let turns = 0;
const send = o => process.stdout.write(JSON.stringify(o)+'\\n');
const cli = (...args) => require('node:child_process').execFileSync(process.execPath,[process.env.FLEET_TEST_CLI,...args]);
const reply = text => {
 const target = text.match(/fleet say (\\S+)/);
 if (target && text.includes('父子回归问题')) cli('say',target[1],'父模型答复');
};
const finish = () => {
 send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'完成'}}});
 send({method:'turn/completed',params:{turn:{id:'turn-test',status:'completed'}}});
};
process.on('SIGINT', () => process.exit(0));
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
 const q = JSON.parse(line); fs.appendFileSync(process.env.TRACE, line+'\\n');
 if(q.method==='thread/start') send({id:q.id,result:{thread:{id:'thread-test'}}});
 else if(q.method==='turn/start') {
  send({id:q.id,result:{turn:{id:'turn-test'}}});
  send({method:'turn/started',params:{turn:{id:'turn-test'}}});
  const text = q.params.input[0].text;
  turns++;
  if (text.includes('delayed child ask fixture')) {
   const timer = setInterval(() => {
    if (!fs.existsSync(process.env.ASK_GATE)) return;
    clearInterval(timer);
    cli('ask','--kind','decision','父子回归问题','--wait');
    finish();
   }, 10);
   return;
  }
  if (text.includes('child ask fixture') || text.includes('park fixture') || turns > 1) {
   reply(text);
   if (text.includes('child ask fixture')) require('node:child_process').execFileSync(process.execPath,[process.env.FLEET_TEST_CLI,'ask','--kind','decision','父子回归问题','--wait']);
   if (text.includes('park fixture')) require('node:child_process').execFileSync(process.execPath,[process.env.FLEET_TEST_CLI,'ask','--kind','help','需要答复','--wait']);
   send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'完成'}}});
   send({method:'turn/completed',params:{turn:{id:'turn-test',status:'completed'}}});
  }
 } else if(q.method==='turn/steer') {
  const text = q.params.input[0].text;
  reply(text);
  if (text.startsWith('park for child ')) cli('park','--until','run:'+text.slice('park for child '.length),'--say','子任务完成后收尾');
  send({id:q.id,result:{}});
  send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:'完成'}}});
  send({method:'turn/completed',params:{turn:{id:'turn-test',status:'completed'}}});
 } else if(q.id !== undefined) send({id:q.id,result:{}});
});
`, { mode: 0o755 });
const env = { ...process.env, AGENT_FLEET_RUNS_DIR: scratch, FLEET_CODEX_BIN: mock,
  TRACE: join(scratch, 'trace'), FLEET_NO_ARCHIVE_SWEEP: '1', FLEET_NO_CONTINUE: '1' };
delete env.FLEET_DETACHED_RUN_ID;
delete env.FLEET_DETACHED_BATCH;
delete env.FLEET_CODEX_BACKEND;
const run = (args, extra = {}) => execFileSync(process.execPath, [cli, ...args], { cwd: scratch, env: { ...env, ...extra }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const states = () => readdirSync(scratch).filter(n => n.endsWith('.json') && !n.endsWith('.pid.json')).map(n => JSON.parse(readFileSync(join(scratch, n), 'utf8')));
const waitFor = async predicate => {
  for (let i = 0; i < 300; i++) { if (predicate()) return; await delay(20); }
  throw new Error('mock timeout');
};
try {
  run(['code', 'fixture', '--cwd', scratch, '--name', 'outer', '--no-wait']);
  const outer = states().find(s => s.name === 'outer'); assert(outer);
  await waitFor(() => existsSync(env.TRACE) && readFileSync(env.TRACE, 'utf8').includes('turn/start'));
  const original = JSON.parse(readFileSync(join(scratch, `${outer.runId}.pid.json`), 'utf8'));
  run(['code', 'nested fixture', '--cwd', scratch, '--name', 'nested', '--no-wait'], { FLEET_DETACHED_RUN_ID: outer.runId });
  const nested = states().find(s => s.name === 'nested'); assert(nested && nested.runId !== outer.runId);
  await waitFor(() => existsSync(join(scratch, `${nested.runId}.pid.json`)) && JSON.parse(readFileSync(join(scratch, `${nested.runId}.pid.json`), 'utf8')).threadId);
  assert.equal(JSON.parse(readFileSync(join(scratch, `${outer.runId}.pid.json`), 'utf8')).pid, original.pid);
  // 重现历史嵌套调用留下的 finished=true/错误 pid，外层执行器仍在监听原收件箱。
  writeFileSync(join(scratch, `${outer.runId}.pid.json`), JSON.stringify({ ...original, pid: process.pid, finished: true }));
  assert.equal(JSON.parse(run(['status', '--running', '--json'])).find(s => s.runId === outer.runId).state, 'running');
  run(['say', 'outer', '修订后的具体要求']);
  run(['say', nested.runId, '嵌套任务要求']);
  run(['wait', outer.runId]); run(['wait', nested.runId]);
  const trace = readFileSync(env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
  assert(trace.some(q => q.method === 'turn/steer' && q.params.input[0].text === '修订后的具体要求'));
  assert(trace.some(q => q.method === 'turn/steer' && q.params.input[0].text === '嵌套任务要求'));
  // Use the real supervisor, queue and say command while the mock model is parked.
  const local = { FLEET_SLOT_CAPACITY:'1', FLEET_TEST_CLI:cli };
  run(['code','park fixture','--cwd',scratch,'--name','parked','--no-wait'],local);
  const parked = states().find(s => s.name === 'parked');
  await waitFor(() => existsSync(join(scratch,`${parked.runId}.queue.json`)) && JSON.parse(readFileSync(join(scratch,`${parked.runId}.queue.json`),'utf8')).state === 'parked');
  assert.throws(() => run(['wait',parked.runId],local), error => error.status === 3 && /需要答复/.test(error.stdout));
  const silent = readFileSync(env.TRACE,'utf8');
  await delay(350);
  assert.equal(readFileSync(env.TRACE,'utf8'),silent,'监督器挂起期零模型请求');
  run(['code','queued fixture','--cwd',scratch,'--name','behind-park','--no-wait'],local);
  const behind = states().find(s => s.name === 'behind-park');
  await waitFor(() => existsSync(join(scratch,`${behind.runId}.pid.json`)) && JSON.parse(readFileSync(join(scratch,`${behind.runId}.pid.json`),'utf8')).threadId);
  run(['say',parked.runId,'收到，按原方案继续'],local);
  run(['say',behind.runId,'排队任务完成'],local);
  run(['wait',behind.runId],local);
  run(['wait',parked.runId],local);
  const wakeTrace = readFileSync(env.TRACE,'utf8').trim().split('\n').map(JSON.parse);
  assert(wakeTrace.some(q => q.method === 'turn/start' && q.params.threadId === 'thread-test' && /答复.*收到/.test(q.params.input[0].text)));
  assert(!wakeTrace.some(q => q.method === 'turn/steer' && /收到，按原方案继续/.test(q.params.input[0].text)),'park 答复不可 steer 已完成的 turn');
  // A real child ask must reach the parent's model, which replies to that exact child.
  for (const parkedParent of [false, true]) {
  const traceStart = readFileSync(env.TRACE,'utf8').length;
  const suffix = parkedParent ? '-parked' : '';
  const family = { FLEET_SLOT_CAPACITY:'2', FLEET_TEST_CLI:cli, ASK_GATE:join(scratch,'ask-gate') };
  run(['code','parent fixture','--cwd',scratch,'--name','ask-parent'+suffix,'--no-wait'],family);
  const parent = states().find(s => s.name === 'ask-parent'+suffix);
  await waitFor(() => existsSync(join(scratch,`${parent.runId}.pid.json`)) && JSON.parse(readFileSync(join(scratch,`${parent.runId}.pid.json`),'utf8')).activeTurnId);
  run(['code',parkedParent ? 'delayed child ask fixture' : 'child ask fixture','--cwd',scratch,'--name','ask-child'+suffix,'--no-wait'],{...family,FLEET_DETACHED_RUN_ID:parent.runId});
  const child = states().find(s => s.name === 'ask-child'+suffix);
  assert.equal(child.parentRunId,parent.runId);
  if (parkedParent) {
    run(['say',parent.runId,'park for child '+child.runId],family);
    await waitFor(() => JSON.parse(readFileSync(join(scratch,`${parent.runId}.queue.json`),'utf8')).state === 'parked');
    writeFileSync(family.ASK_GATE,'ready');
  }
  const requests = () => readFileSync(env.TRACE,'utf8').slice(traceStart).trim().split('\n').filter(Boolean).map(JSON.parse);
  const method = parkedParent ? 'turn/start' : 'turn/steer';
  await waitFor(() => requests().some(q => q.method === method && q.params.input[0].text.includes('父子回归问题')));
  run(['wait',parent.runId],family);
  assert.throws(() => run(['wait',child.runId],family), error => error.status === 3);
  run(['wait',child.runId],family);
  const familyTrace = requests();
  const delivery = familyTrace.find(q => q.method === method && q.params.input[0].text.includes('父子回归问题'));
  const question = delivery.params.input[0].text;
  assert(question.includes(child.runId) && question.includes('decision'),'上行问题保留子 runId 与 kind');
  assert(familyTrace.some(q => q.method === 'turn/start' && q.params.input[0].text.includes('答复：父模型答复')),'父模型 say 唤醒原子任务');
  if (parkedParent) {
    assert.equal(delivery.params.threadId,'thread-test');
    assert.equal(JSON.parse(readFileSync(join(scratch,`${parent.runId}.yield`),'utf8')).result.status,'ask');
    assert(!familyTrace.some(q => q.method === 'turn/steer' && q.params.input[0].text.includes('父子回归问题')),'挂起父任务的 ask 通过新回合处理');
  }
  }
  // 监督器活着但没有执行器时，应报告具体问题，不误报整个任务已退出。
  const selfCommand = execFileSync('ps', ['-o', 'command=', '-p', String(process.pid)], { encoding: 'utf8' }).trim();
  const broken = { ...outer, runId: 'broken', name: 'broken', status: 'running', pid: process.pid, command: selfCommand, childPid: null, heartbeatAt: new Date().toISOString() };
  writeFileSync(join(scratch, 'broken.json'), JSON.stringify(broken));
  assert.throws(() => run(['say', 'broken', '要求']), error => /监督器仍在运行.*执行器/.test(error.stderr));
  console.log('PASS - detach 短名/runId 插话实际进入 turn/steer、嵌套身份隔离、历史污染兼容及明确失败说明');
} finally {
  for (const state of states()) {
    if (state.status === 'running' && state.runId !== 'broken') { try { run(['stop', state.runId, '--grace', '0']); } catch {} }
  }
  rmSync(scratch, { recursive: true, force: true });
}
