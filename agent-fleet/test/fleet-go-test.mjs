import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname ?? new URL('..', import.meta.url).pathname, import.meta.dirname ? '..' : '.');
const script = join(root, 'bin/fleet-go');
const temp = mkdtempSync(join(tmpdir(), 'fleet-go-test-'));
const home = join(temp, 'home');
const bin = join(temp, 'bin');
mkdirSync(join(home, '.claude'), { recursive: true });
mkdirSync(bin);
const rule = readFileSync(join(root, 'skill/templates/blocks/rule-sentence.md'), 'utf8').trim();
writeFileSync(join(home, '.claude/CLAUDE.md'), "禁止单纯转发，允许分发子步骤：不能把整个任务原样甩给另一个 agent 后只回'已启动/等结果'就结束当轮；可以拆出边界清晰的子步骤交给更便宜的 agent 做，但你必须自己掌握全局、消化并验证子任务结果，最终给出真正的结论作为你的最终答案");
const calls = join(temp, 'calls.jsonl');
const states = join(temp, 'states.json');
writeFileSync(states, '[]');
writeFileSync(join(bin, 'fleet'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify({args, pid:process.pid})+'\\n');
if(args[0]==='status') { const rows=JSON.parse(fs.readFileSync(process.env.STATES,'utf8')); console.log(JSON.stringify(args.includes('--running')?rows.filter(r=>r.status==='running'):rows)); }
if(args[0]==='stop') fs.writeFileSync(process.env.STATES,JSON.stringify(JSON.parse(fs.readFileSync(process.env.STATES,'utf8')).map(r=>r.runId===args[1]?{...r,status:'stopped'}:r)));
if(args[0]==='say' && process.env.SAY_FAIL) process.exit(1);
if(args[0]==='code' && process.env.QUEUE_RESULT) {
  (async()=>{
    const {registerQueue,acquireSlot,queueRecord}=await import(${JSON.stringify(new URL('../src/queue.mjs',import.meta.url).href)});
    await registerQueue({runId:'blocker',model:'test-runner'});
    if(!await acquireSlot('blocker')) throw Error('blocker must occupy the only slot');
    await registerQueue({runId:'restarted',name:args[args.indexOf('--name')+1],briefPath:args[1],model:'test-runner'});
    const admitted=await acquireSlot('restarted');
    fs.writeFileSync(process.env.QUEUE_RESULT,JSON.stringify({admitted,row:queueRecord('restarted')}));
    process.exit(7);
  })().catch(e=>{console.error(e);process.exit(1)});
} else if(['code','openai','copy','bulk','grok-cli','haiku','sonnet','opus','fable','judge'].includes(args[0])) process.exit(7);
`, { mode: 0o755 });
writeFileSync(join(bin, 'pgrep'), '#!/bin/sh\nif [ -n "${RESIDUAL:-}" ]; then\n printf "%s\\n" "$RESIDUAL"\n exit 0\nfi\nexit 1\n', { mode: 0o755 });
const env = { ...process.env, FLEET_DEFAULT_ON: 'local', HOME: home, PATH: bin + ':' + process.env.PATH, CALLS: calls, STATES: states };
const run = (args, extra={}) => spawnSync(script, ['new','lint'].includes(args[0]) ? [...args, '--no-lint'] : args, { encoding:'utf8', env:{...env,...extra}, input:'' });
const history = () => existsSync(calls) ? readFileSync(calls,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const reset = () => writeFileSync(calls, '');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS - '+name); }
try {
  let brief;
  test('dry-run 必需元素及顺序、最后一行逐字规则、无文件或派发', () => {
    const r=run(['new','--to','gpt','one','--goal','独有目标','--dry-run','--write','/tmp/project','--read','/tmp/source']);
    assert.equal(r.status,0,r.stderr); brief=r.stdout;
    let previous=-1;
    for(const text of ['归类：','REPORT:','围绕本 brief','## 授权覆盖','## 目标','## 允许范围','## 已知坑','## 验收',rule]) {
      const i=brief.indexOf(text); assert.ok(i>previous,text); previous=i;
    }
    assert.equal(brief.trim().split('\n').at(-1),rule);
    assert.match(r.stderr,/将执行：fleet code .*--name one --report /);
    assert.match(brief,/NODE_USE_ENV_PROXY=1/);
    assert.match(brief,/规则回执/);
    assert.equal(history().length,0);
    assert.ok(!existsSync(join(home,'.agent-reports')));
    const globalRules = join(home, '.claude/CLAUDE.md');
    const legacy = readFileSync(globalRules, 'utf8');
    writeFileSync(globalRules, rule);
    assert.equal(run(['new','positive-rule','--to','gpt','--goal','x','--dry-run']).status, 0);
    writeFileSync(globalRules, '规则句缺失');
    assert.equal(run(['new','missing-rule','--to','gpt','--goal','x','--dry-run']).status, 1);
    writeFileSync(globalRules, legacy);
  });
  // 使用输出的 REPORT 路径，避免日期 locale 与时区差异。
  const report = brief.match(/^REPORT: (.+)$/m)[1];
  const path = report.replace(/\.md$/,'.brief.md');
  test('new 前台 exec、参数正确、退出码透传', () => {
    const r=run(['new','--to','gpt','one','--goal','独有目标']);
    assert.equal(r.status,7,r.stderr);
    assert.equal(history().at(-1).pid,r.pid);
    assert.deepEqual(history().at(-1).args,['code',path,'--name','one','--report',report,'--simple']);
    assert.ok(existsSync(path));
    const metadata=JSON.parse(readFileSync(path.replace(/\.md$/,'.json'),'utf8'));
    assert.equal(metadata.tier,'terra');
    assert.deepEqual(metadata.auth,['local']);
    assert.deepEqual(metadata.actions,[]);
  });
  test('只读授权和动作身份写入元信息，重派可沿用', () => {
    writeFileSync(join(temp,'read-entry.md'), '## 入口\n仓库: /tmp\n');
    const r=run(['new','prodwatch-read','--to','gpt','--auth','review','--action','只读','--goal','readonly','--body',join(temp,'read-entry.md'),'--no-launch']);
    assert.equal(r.status,0,r.stderr);
    const dir=path.slice(0,path.lastIndexOf('/'));
    const meta=JSON.parse(readFileSync(join(dir,'prodwatch-read.brief.json'),'utf8'));
    assert.deepEqual(meta.auth,['review']);assert.deepEqual(meta.actions,['只读']);
  });
  test('只读任务 amend --restart 改写后同步最新动作，满槽不再免槽', () => {
    const body=join(temp,'amend-entry.md');
    writeFileSync(body,`## 入口\n仓库: ${temp}\n可写路径: ${temp}/project`);
    const created=run(['new','prodwatch-amend','--to','gpt','--auth','local,review','--action','只读','--goal','amend queue regression','--body',body,'--no-launch']);
    assert.equal(created.status,0,created.stderr);
    const briefPath=join(path.slice(0,path.lastIndexOf('/')),'prodwatch-amend.brief.md');
    const queueEnv={AGENT_FLEET_RUNS_DIR:join(temp,'amend-runs'),FLEET_SLOT_CAPACITY:'1',QUEUE_RESULT:join(temp,'admission.json')};
    let result=run(['relaunch','prodwatch-amend'],queueEnv);
    assert.equal(result.status,7,result.stderr);
    assert.equal(JSON.parse(readFileSync(queueEnv.QUEUE_RESULT,'utf8')).admitted,true,'original readonly bypasses full slot');
    writeFileSync(states,JSON.stringify([{runId:'fake-reader',name:'prodwatch-amend',briefPath,status:'running'}]));
    reset();
    result=run(['amend','prodwatch-amend','动作: 改代码\n现在执行写代码任务','--restart'],queueEnv);
    assert.equal(result.status,7,result.stderr);
    assert.deepEqual(history().map(c=>c.args[0]),['status','stop','status','status','code']);
    assert.deepEqual(JSON.parse(readFileSync(briefPath.replace(/\.md$/,'.json'),'utf8')).actions,['改代码']);
    const admission=JSON.parse(readFileSync(queueEnv.QUEUE_RESULT,'utf8'));
    assert.equal(admission.admitted,false,'writing restart must wait for coding slot');
    assert.equal(admission.row.readonly,false);assert.equal(admission.row.state,'queued');
    for (const [message, readonly] of [
      ['动作: 只读\n现在只做复核', true],
      ['动作: 改代码\n现在执行写代码任务', false],
    ]) {
      writeFileSync(states,JSON.stringify([{runId:'fake-restarted',name:'prodwatch-amend',briefPath,status:'running'}]));
      const restarted=run(['amend','prodwatch-amend',message,'--restart'],queueEnv);
      assert.equal(restarted.status,7,restarted.stderr);
      assert.deepEqual(JSON.parse(readFileSync(briefPath.replace(/\.md$/,'.json'),'utf8')).actions,[readonly?'只读':'改代码']);
      const next=JSON.parse(readFileSync(queueEnv.QUEUE_RESULT,'utf8'));
      assert.equal(next.admitted,readonly,'repeated historical write must wait for coding slot');
      assert.equal(next.row.readonly,readonly);
      assert.equal(next.row.state,readonly?'running':'queued');
    }
    assert.match(readFileSync(briefPath,'utf8'),/修订 3（/);
    writeFileSync(states,'[]');
    const metadata=JSON.parse(readFileSync(briefPath.replace(/\.md$/,'.json'),'utf8'));
    metadata.actions=['只读'];writeFileSync(briefPath.replace(/\.md$/,'.json'),JSON.stringify(metadata));
    assert.equal(run(['amend','prodwatch-amend','动作: 改代码\n现在执行写代码任务']).status,0);
    assert.deepEqual(JSON.parse(readFileSync(briefPath.replace(/\.md$/,'.json'),'utf8')).actions,['改代码']);
  });
  const original=readFileSync(path,'utf8');
  test('同名拒绝覆盖', () => {
    const r=run(['new','--to','gpt','one','--goal','覆盖']); assert.equal(r.status,1); assert.match(r.stderr,/amend/); assert.equal(readFileSync(path,'utf8'),original);
  });
  test('amend 递增、不重复、原文保留、归类首行和规则末行保留', () => {
    for(const message of ['第一处要求','第二处要求','第二处要求']) assert.equal(run(['amend','one',message]).status,0);
    const revised=readFileSync(path,'utf8');
    assert.match(revised,/修订 1（/); assert.match(revised,/修订 2（/); assert.doesNotMatch(revised,/修订 3（/);
    assert.equal(revised.replace(/\n## 【修订 \d+（[^\n]+）】\n[^\n]+\n\n/g,''),original);
    assert.equal(run(['lint',path]).status,0);
  });
  const state=()=>writeFileSync(states,JSON.stringify([{runId:'fake-run',name:'one',briefPath:path,status:'running',duration:'3m',launchDetached:true}]));
  test('say 发送给运行 run、不 stop 或重派', () => {
    state(); reset(); assert.equal(run(['amend','one','插话','--say']).status,0);
    assert.deepEqual(history().map(c=>c.args[0]),['status','say']);
    assert.deepEqual(history().at(-1).args,['say','fake-run','插话']);
  });
  test('say 不支持时保留修订、不杀不重派', () => {
    state(); reset(); const r=run(['amend','one','Codex插话','--say'],{SAY_FAIL:'1'});
    assert.equal(r.status,1); assert.match(r.stderr,/未 stop、未重派/); assert.match(readFileSync(path,'utf8'),/Codex插话/);
    assert.deepEqual(history().map(c=>c.args[0]),['status','say']);
  });
  test('restart 先 stop、核验退出、再执行', () => {
    state(); reset(); const r=run(['amend','one','重启','--restart']); assert.equal(r.status,7,r.stderr);
    assert.deepEqual(history().map(c=>c.args[0]),['status','stop','status','status','code']);
  });
  test('dead parked relaunch routes through resume', () => {
    writeFileSync(states,JSON.stringify([{runId:'dead-park',name:'one',status:'abnormal'}]));
    const isolatedRuns=join(temp,'park-runs'); mkdirSync(isolatedRuns);
    writeFileSync(join(isolatedRuns,'dead-park.yield'),JSON.stringify({type:'park',until:'reply'}));
    reset();
    const result=run(['relaunch','one'],{AGENT_FLEET_RUNS_DIR:isolatedRuns});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(history().at(-1).args,['resume','dead-park']);
    writeFileSync(states,'[]');
  });
  test('没有运行 run 时 --say 直接按修订后 brief relaunch', () => {
    writeFileSync(states,'[]'); reset(); const r=run(['amend','one','离线修订','--say']); assert.equal(r.status,7,r.stderr); assert.match(r.stdout,/直接 relaunch/);
    assert.ok(history().some(c=>c.args[0]==='code'));
  });
  test('--restart 找不到运行 run 仍清楚提示', () => {
    writeFileSync(states,'[]'); const r=run(['amend','one','离线重启','--restart']); assert.equal(r.status,1); assert.match(r.stderr,/找不到唯一运行/);
  });
  test('lint 缺项失败、合格通过、后台命令和秘密拒绝且不回显', () => {
    const bad=join(temp,'bad.md'); writeFileSync(bad,'没有必需项');
    let r=spawnSync(script,['lint',bad,'--on','local'],{encoding:'utf8',env}); assert.equal(r.status,1); for(const word of ['第一行','REPORT','逐字规则']) assert.ok(r.stderr.includes(word));
    assert.equal(run(['lint',path]).status,0);
    for(const unsafe of ['fleet code task.md &','nohup fleet code task.md','fleet code task.md > /tmp/out 2>&1 &','nohup npm run dev','node server.mjs &','sk-'+'x'.repeat(24),'Bearer '+'x'.repeat(24)]) {
      writeFileSync(bad,original+'\n'+unsafe); r=run(['lint',bad]); assert.equal(r.status,1,unsafe); assert.ok(!r.stderr.includes(unsafe));
    }
    writeFileSync(bad,original+'\n错误示范：nohup fleet code task.md &'); assert.equal(run(['lint',bad]).status,0);
  });
  test('local-commit+deploy-prod 合派时推送与合入已授权', () => {
    const r=run(['new','commit-deploy','--to','gpt','--auth','local-commit,deploy-prod','--goal','修复并上线','--dry-run']);
    assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/推送功能分支\/开 PR/); assert.match(r.stdout,/不因本块停下/);
  });
  test('deliverables 可重复并写入验收段', () => {
    const r = run(['new', 'deliverables', '--to', 'gpt', '--goal', '测试', '--deliverables', '报告：report.md（上限 4 KB）', '--deliverables', '代码：src/a.mjs（上限 100 行）', '--dry-run']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /## 验收\n产物清单：\n- 报告：report.md（上限 4 KB）\n- 代码：src\/a.mjs（上限 100 行）/);
  });
  test('local-commit 授权与禁止、验收一致，可叠加且不改变 local 默认行为', () => {
    for (const auth of ['local-commit','local-commit,readonly-web','local,local-commit','local-commit,paid']) {
      const r=run(['new','commit-check','--to','gpt','--auth',auth,'--budget','$1，失败不重试','--goal','修复卡片并本地提交','--dry-run']);
      assert.equal(r.status,0,r.stderr);
      assert.match(r.stdout,/允许在本地分支提交/);
      assert.match(r.stdout,/同单带 deploy-prod 时按该块执行/);
      assert.match(r.stdout,/未带 deploy-prod 时不做/);
      assert.doesNotMatch(r.stdout,/不做 git 写操作|提交\/推送|无提交/);
      assert.match(r.stdout,/本地提交哈希/);
      if (auth.includes('readonly-web')) assert.match(r.stdout,/允许范围：只读联网/);
      if (auth.includes('paid')) assert.match(r.stdout,/允许范围：当前目标必要的付费验证/);
    }
    const local=run(['new','local-check','--to','gpt','--goal','修复卡片','--dry-run']);
    assert.equal(local.status,0,local.stderr);
    assert.match(local.stdout,/部署、git 写操作、线上写入由主线程另行授权/); assert.match(local.stdout,/本单不做 git 提交，报告不需要提交哈希/);
  });
  test('动作、入口与授权 lint 及豁免', () => {
    const strict = (action, body, opts=[]) => spawnSync(script,['new','strict','--to','gpt','--on','local','--goal','正文提到提交哈希、部署与凭据，但不推断动作','--dry-run',...(action ? ['--action',action] : []),...opts],{encoding:'utf8',env,input:body});
    const entry = '## 入口\n仓库：/tmp\n可写路径：/tmp/example\n';
    const readEntry = '## 入口\n仓库：/tmp\n';
    let r = strict('只读',readEntry); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/动作: 只读/);
    assert.equal(strict('改代码',entry).status,0);
    assert.equal(strict('部署（生产数据删除） / 只读', '## 入口\n仓库：/tmp（说明）\n可写路径：/tmp/example(说明)\n', ['--auth','local-commit,deploy-prod']).status,0);
    assert.equal(strict('本地提交',entry,['--auth','local-commit']).status,0);
    assert.equal(strict('推送 / 部署',entry,['--auth','local-commit,deploy-prod']).status,0);
    assert.equal(strict('付费',entry,['--auth','paid']).status,0);
    for (const [action, body, opts, expected] of [
      ['只读','',[],/仓库/],
      ['只读','## 入口\n仓库：relative',[],/绝对路径/],
      ['只读','## 入口\n仓库：/no-such-fake-repository',[],/仓库不存在/],
      ['改代码',readEntry,[],/可写路径/],
      ['只读','## 入口\n仓库：/tmp\n未知', [],/请加 --sol/],
      ['只读','## 入口\n仓库：/tmp\n未知', ['--simple'],/请加 --sol/],
      ['改代码',entry,['--auth','review'],/local 或 local-commit/],
      ['本地提交',entry,[],/local-commit/],
      ['推送',entry,['--auth','deploy-prod'],/local-commit 和 deploy-prod/],
      ['部署',entry,['--auth','local-commit'],/local-commit 和 deploy-prod/],
      ['付费',entry,[],/paid/],
      ['未知动作',entry,[],/未知或空动作/],
    ]) { r=strict(action,body,opts); assert.equal(r.status,1,action); assert.match(r.stderr,expected); assert.match(r.stderr,/示例（按实际任务和授权修改）/); }
    assert.equal(strict('只读','## 入口\n仓库：/tmp\n未知',['--sol']).status,0);
    r=strict('', ''); assert.equal(r.status,0,r.stderr); assert.match(r.stderr,/缺少动作行/);
    r=strict('部署',readEntry,['--no-lint']); assert.equal(r.status,1); assert.match(r.stderr,/--auth local-commit,deploy-prod/); assert.match(r.stderr,/可写路径/);
    const f=join(temp,'strict.md'); writeFileSync(f,strict('只读',readEntry).stdout);
    assert.equal(spawnSync(script,['lint',f,'--on','local'],{encoding:'utf8',env}).status,0);
    writeFileSync(f,readFileSync(f,'utf8').replace('动作: 只读','动作: 本地提交'));
    r=spawnSync(script,['lint',f,'--on','local'],{encoding:'utf8',env}); assert.equal(r.status,1); assert.match(r.stderr,/local-commit/);
    assert.equal(spawnSync(script,['lint',f,'--no-lint','--on','local'],{encoding:'utf8',env}).status,1);
  });
  test('豁免样板的任务重派及修订授权动作', () => {
    const body=join(temp,'dx-entry.md');
    writeFileSync(body,`## 入口\n仓库: ${temp}\n可写路径: ${temp}/project\n`);
    let r=run(['new','dx','--to','gpt','--on','local','--auth','local','--action','改代码','--body',body,'--no-launch']);
    assert.equal(r.status,0,r.stderr);
    const file=join(path.slice(0,path.lastIndexOf('/')),'dx.brief.md'), metaFile=file.replace(/\.md$/,'.json');
    writeFileSync(file,readFileSync(file,'utf8').replace(/^归类：.*$/m,'特殊单'));
    assert.equal(run(['relaunch','dx']).status,7);
    assert.equal(run(['amend','dx','继续','--say']).status,7);
    r=run(['amend','dx','补授权','--action','改代码 / 推送','--auth','local-commit,deploy-prod']);
    assert.equal(r.status,0,r.stderr);
    const meta=JSON.parse(readFileSync(metaFile,'utf8'));
    assert.deepEqual(meta.auth,['local-commit','deploy-prod']); assert.deepEqual(meta.actions,['改代码','推送']); assert.equal(meta.no_lint,true);
    assert.match(readFileSync(file,'utf8'),/动作: 改代码 \/ 推送/);
    assert.equal(run(['relaunch','dx','--after','prior']).status,7);
    assert.equal(JSON.parse(readFileSync(metaFile,'utf8')).after,'prior');
    r=run(['amend','dx','授权不足','--auth','local']); assert.equal(r.status,1); assert.match(r.stderr,/--auth local-commit,deploy-prod/);
    assert.deepEqual(JSON.parse(readFileSync(metaFile,'utf8')).auth,['local-commit','deploy-prod']);
  });
  test('密钥诊断仅给行号与规则，摘要、长文件名和路径不误报', () => {
    const normal=[
      '镜像 digest：sha256:'+ 'a1'.repeat(32),
      '文件：fleet-task-'+'long-name-'.repeat(8)+'report.md',
      '检查 fleet-task-'+'x'.repeat(40)+'.md 文件',
      '路径：/tmp/sk-'+'x'.repeat(40)+'/report.md',
      '路径：/tmp/exports/'+'a'.repeat(64)+'/fleet-task-report.md',
    ].join('\n');
    const preview=spawnSync(script,['new','normal-check','--to','gpt','--dry-run','--no-lint'],{encoding:'utf8',env,input:normal});
    assert.equal(preview.status,0,preview.stderr);
    const bad=join(temp,'secret-check.md');
    const cases=[
      ['aws-access-key-id','AKIA'+'A1'.repeat(8)],
      ['bearer-token','Bearer '+'x'.repeat(24)],
      ['bearer-token','Bearer\n'+'x'.repeat(24)],
      ['private-key','-----BEGIN RSA PRIVATE KEY-----'],
      ['credential-assignment','key='+ 'aB3z9X'.repeat(6)],
      ['sk-token','sk-'+ 'x'.repeat(24)],
      ['sk-token','密钥：sk-'+ 'x'.repeat(24)+'.'],
    ];
    for (const [ruleName,value] of cases) {
      writeFileSync(bad,original+'\n说明\n'+value);
      const r=run(['lint',bad]);
      assert.equal(r.status,1,ruleName);
      const line=original.split('\n').length+2;
      assert.ok(r.stderr.includes('第 '+line+' 行'),ruleName);
      assert.ok(r.stderr.includes(ruleName),ruleName);
      assert.ok(!r.stderr.includes(value),ruleName);
      assert.equal(r.stdout,'');
    }
  });
  test('body 文件、stdin、授权叠加、paid 预算可选、默认报告和 no-launch', () => {
    const body=join(temp,'body.md'); writeFileSync(body,'## 独有正文\n只处理本目标');
    let r=run(['new','--to','gpt','body','--body',body,'--auth','local,readonly-web','--no-launch']); assert.equal(r.status,0,r.stderr);
    for (const auth of ['paid', 'paid,local']) {
      r=run(['new','--to','gpt','paid','--goal','付费','--auth',auth,'--dry-run']);
      assert.equal(r.status,0,r.stderr);
      assert.match(r.stdout,/允许范围：当前目标必要的付费验证/);
      assert.doesNotMatch(r.stdout,/\$5|## 预算与重试限制|付费由主线程另行授权|\{BUDGET\}/);
      const preview=join(temp,'paid-preview.md'); writeFileSync(preview,r.stdout);
      assert.equal(run(['lint',preview]).status,0);
    }
    r=run(['new','--to','gpt','paid','--goal','付费','--auth','paid','--budget','$2，重试 1 次','--dry-run']); assert.equal(r.status,0); assert.match(r.stdout,/## 预算与重试限制\n\$2，重试 1 次/);
    assert.equal(r.stdout.split('$2，重试 1 次').length-1,1);
    r=spawnSync(script,['new','--to','gpt','stdin','--dry-run','--no-lint'],{encoding:'utf8',env,input:'## stdin 独有正文'}); assert.equal(r.status,0); assert.match(r.stdout,/stdin 独有正文/);
  });
  test('五产品、各档及选项映射，必填产品与旧参数拒绝', () => {
    for(const [to,cmd] of Object.entries({gpt:'code',openai:'openai',claude:'sonnet',grok:'grok-cli',gemini:'copy',jev:'judge'})) {
      const r=run(['new',to,'--to',to,'--goal','是否满足判断条件','--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.ok(r.stderr.includes('fleet '+cmd+' '));
      assert.match(r.stdout,/归类：/); assert.match(r.stdout,/REPORT: /); assert.ok(r.stdout.includes(rule));
    }
    const blocked = run(['new','owner','--to','claude','--tier','fable','--goal','x','--dry-run']);
    assert.equal(blocked.status,1); assert.ok(blocked.stderr.includes('Fable 只用 executor-fable 子代理派单（Agent 工具，subagent_type=executor-fable）'));
    for(const tier of ['haiku','sonnet','opus']) {
      const r=run(['new','tier','--to','claude','--tier',tier,'--goal','任务','--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.ok(r.stderr.includes('fleet '+tier+' '));
    }
    for(const [to,opts,entry] of [['gpt',['--review','--low'],'code'],['grok',['--review','--model','grok-code','--subagents'],'grok-cli'],['gemini',['--bulk'],'bulk']]) {
      const r=run(['new','opts','--to',to,...opts,'--goal','任务','--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.ok(r.stderr.includes('fleet '+entry+' '));
      for(const opt of opts.filter(x=>x.startsWith('--')&&x!=='--bulk')) assert.ok(r.stderr.includes(opt));
    }
    assert.notEqual(run(['new','missing','--goal','任务','--dry-run']).status,0);
    const old=run(['new','old','--kind','code']); assert.equal(old.status,1); assert.match(old.stderr,/--to/); assert.equal(old.stderr.trim().split('\n').length,1);
    assert.equal(run(['new','bad','--to','gpt','--tier','opus','--goal','任务','--dry-run']).status,1);
  });
  test('simple 两档、组合限制及 relaunch/amend 保留档位', () => {
    const normal = run(['new','normal-mode','--to','gpt','--goal','x','--dry-run']);
    assert.equal(normal.status, 0, normal.stderr);
    assert(normal.stderr.includes('--simple'));
    const simple = run(['new','simple-mode','--to','gpt','--simple','--low','--goal','x','--no-launch']);
    assert.equal(simple.status, 0, simple.stderr);
    const simplePath = join(home,'.agent-reports', report.split('/').at(-2), 'simple-mode.brief.md');
    const simpleMetaPath = simplePath.replace(/\.md$/,'.json');
    const oldMeta = JSON.parse(readFileSync(simpleMetaPath,'utf8'));
    assert.equal(oldMeta.simple, true);
    delete oldMeta.fast;
    delete oldMeta['no-fast'];
    writeFileSync(simpleMetaPath, JSON.stringify(oldMeta));
    writeFileSync(states,'[]'); reset();
    assert.equal(run(['relaunch','simple-mode']).status, 7);
    assert(history().at(-1).args.includes('--simple'));
    assert(!history().at(-1).args.includes('--fast'));
    assert(history().at(-1).args.includes('--low'));
    reset();
    assert.equal(run(['amend','simple-mode','继续','--say']).status, 7);
    assert(history().at(-1).args.includes('--simple'));
    const noFast = run(['new','no-fast-mode','--to','gpt','--simple','--no-fast','--goal','x','--no-launch']);
    assert.equal(noFast.status, 0, noFast.stderr);
    for (const args of [['relaunch','no-fast-mode'], ['amend','no-fast-mode','继续','--say']]) {
      reset(); assert.equal(run(args).status, 7); assert(history().at(-1).args.includes('--no-fast'));
    }
    const fast = run(['new','fast-mode','--to','gpt','--simple','--fast','--goal','x','--no-launch']);
    assert.equal(fast.status, 0, fast.stderr);
    for (const args of [['relaunch','fast-mode'], ['amend','fast-mode','继续','--say']]) {
      reset(); assert.equal(run(args).status, 7); assert(history().at(-1).args.includes('--fast'));
    }
    const solFast = run(['new','sol-fast','--to','gpt','--fast','--goal','x','--dry-run']);
    assert.equal(solFast.status, 0);
    assert.equal(run(['new','compat','--to','gpt','--no-fast','--goal','x','--dry-run']).status, 0);
    for (const to of ['openai','claude','grok','gemini','jev']) {
      const bad = run(['new','bad-simple','--to',to,'--simple','--goal','x','--dry-run']);
      assert.equal(bad.status, 1); assert.match(bad.stderr, /--simple.*--to gpt/);
    }
    const review = run(['new','bad-simple','--to','gpt','--simple','--review','--goal','x','--dry-run']);
    assert.equal(review.status, 0);
    assert.equal(run(['new','review-sol','--to','gpt','--sol','--review','--goal','x','--dry-run']).status, 0);
    reset();
    assert.equal(run(['relaunch','simple-mode','--to','claude']).status, 7);
    assert(!history().at(-1).args.includes('--simple'));
  });
  test('默认 Terra、显式 Sol、旧任务迁移及互斥', () => {
    const dir=path.slice(0,path.lastIndexOf('/'));
    for (const [name,flags,tier] of [['default-tier',[],'terra'],['sol-tier',['--sol'],'sol'],['luna-tier',['--luna'],'luna']]) {
      const preview=run(['new',name,'--to','gpt',...flags,'--goal','x','--dry-run']);
      assert.equal(preview.status,0,preview.stderr); assert(preview.stderr.includes(tier==='terra'?'--simple':'--'+tier));
      assert.equal(run(['new',name,'--to','gpt',...flags,'--goal','x','--no-launch']).status,0);
      assert.equal(JSON.parse(readFileSync(join(dir,name+'.brief.json'),'utf8')).tier,tier);
    }
    const legacy=join(dir,'default-tier.brief.json'); const old=JSON.parse(readFileSync(legacy,'utf8')); delete old.tier; old.simple=false; old.luna=false; writeFileSync(legacy,JSON.stringify(old));
    assert.equal(run(['amend','default-tier','保留旧档']).status,0); assert.equal(JSON.parse(readFileSync(legacy,'utf8')).tier,'sol');
    delete old.tier; writeFileSync(legacy,JSON.stringify(old));
    reset(); assert.equal(run(['relaunch','default-tier']).status,7); assert(history().at(-1).args.includes('--sol')); assert.equal(JSON.parse(readFileSync(legacy,'utf8')).tier,'sol');
    for (const action of ['relaunch','amend']) {
      const cmd=action==='relaunch'?[action,'default-tier']:[action,'default-tier','切换'];
      for (const option of ['--simple','--luna']) assert.equal(run([...cmd,'--sol',option]).status,1);
      assert.equal(run([...cmd,'--sol']).status,action==='relaunch'?7:0);
      assert.equal(JSON.parse(readFileSync(legacy,'utf8')).tier,'sol');
    }
    for (const option of ['--simple','--luna']) assert.equal(run(['new','bad-tier','--to','gpt','--sol',option,'--goal','x','--dry-run']).status,1);
  });
  test('luna 新建、重派和修订保留模型及冲突限制', () => {
    assert.equal(run(['new','luna-mode','--to','gpt','--luna','--low','--goal','x','--no-launch']).status, 0);
    const metaPath = join(home,'.agent-reports', report.split('/').at(-2), 'luna-mode.brief.json');
    assert.equal(JSON.parse(readFileSync(metaPath,'utf8')).luna, true);
    assert.equal(JSON.parse(readFileSync(metaPath,'utf8')).low, true);
    for (const args of [['relaunch','luna-mode'], ['amend','luna-mode','继续','--say']]) {
      reset(); assert.equal(run(args).status, 7); assert(history().at(-1).args.includes('--luna')); assert(history().at(-1).args.includes('--low')); assert(!history().at(-1).args.includes('--fast'));
    }
    for (const option of ['--simple','--review']) {
      const r = run(['new','bad-luna','--to','gpt','--luna',option,'--goal','x','--dry-run']);
      assert.equal(r.status,1); assert.match(r.stderr,/--luna/);
    }
    assert.equal(run(['new','luna-relaunch','--to','gpt','--goal','x','--no-launch']).status,0);
    reset(); assert.equal(run(['relaunch','luna-relaunch','--luna']).status,7); assert(history().at(-1).args.includes('--luna'));
    reset(); assert.equal(run(['relaunch','luna-relaunch']).status,7); assert(history().at(-1).args.includes('--luna'));
    assert.equal(run(['new','luna-amend','--to','gpt','--goal','x','--no-launch']).status,0);
    reset(); assert.equal(run(['amend','luna-amend','改用','--luna','--say']).status,7); assert(history().at(-1).args.includes('--luna'));
    assert.equal(run(['new','luna-high','--to','gpt','--luna','--high','--goal','x','--no-launch']).status,0);
    reset(); assert.equal(run(['relaunch','luna-high']).status,7); assert(history().at(-1).args.includes('--high'));
    assert.equal(run(['new','luna-low-upgrade','--to','gpt','--luna','--low','--goal','x','--no-launch']).status,0);
    reset(); assert.equal(run(['relaunch','luna-low-upgrade','--high']).status,7); assert(history().at(-1).args.includes('--high')); assert(!history().at(-1).args.includes('--low'));
    assert.equal(run(['new','luna-conflict','--to','gpt','--low','--high','--goal','x','--dry-run']).status,1);
    assert.equal(run(['new','luna-xhigh','--to','gpt','--luna','--xhigh','--goal','x','--no-launch']).status,0);
    for (const args of [['relaunch','luna-xhigh'], ['amend','luna-xhigh','继续','--say']]) { reset(); assert.equal(run(args).status,7); assert(history().at(-1).args.includes('--xhigh')); }
    for (const opts of [['--xhigh'], ['--luna','--low','--xhigh'], ['--luna','--high','--xhigh']]) assert.equal(run(['new','bad-xhigh','--to','gpt',...opts,'--goal','x','--dry-run']).status,1);
    assert.equal(run(['new','luna-max','--to','gpt','--luna','--max','--goal','x','--no-launch']).status,0);
    for (const args of [['relaunch','luna-max'], ['amend','luna-max','继续','--say']]) { reset(); assert.equal(run(args).status,7); assert(history().at(-1).args.includes('--max')); }
    reset(); assert.equal(run(['relaunch','luna-max','--low']).status,7); assert(history().at(-1).args.includes('--low')); assert(!history().at(-1).args.includes('--max'));
    reset(); assert.equal(run(['amend','luna-max','切换','--max','--say']).status,7); assert(history().at(-1).args.includes('--max')); assert(!history().at(-1).args.includes('--low'));
    assert.equal(run(['relaunch','luna-max','--low','--max']).status,1);
    assert.equal(run(['amend','luna-max','冲突','--low','--max','--say']).status,1);
    for (const opts of [['--max'], ['--luna','--low','--max'], ['--luna','--high','--max'], ['--luna','--xhigh','--max']]) assert.equal(run(['new','bad-max','--to','gpt',...opts,'--goal','x','--dry-run']).status,1);
    assert.equal(run(['new','luna-fast','--to','gpt','--luna','--fast','--goal','x','--dry-run']).status,0);
  });
  test('显式模型和推理档位覆盖并保存旧值', () => {
    for (const action of ['relaunch', 'amend']) {
      const name = 'switch-' + action;
      const metaPath = join(home,'.agent-reports', report.split('/').at(-2), name + '.brief.json');
      const invoke = (...flags) => action === 'relaunch' ? run([action,name,...flags]) : run([action,name,'切换档位',...flags,'--say']);
      assert.equal(run(['new',name,'--to','gpt','--simple','--low','--goal','x','--no-launch']).status,0);
      reset(); let r = invoke('--luna','--high'); assert.equal(r.status,7,r.stderr);
      let meta = JSON.parse(readFileSync(metaPath,'utf8'));
      assert.equal(meta.luna,true); assert.equal(meta.simple,false); assert.equal(meta.high,true); assert.equal(meta.low,false);
      assert(history().at(-1).args.includes('--luna')); assert(!history().at(-1).args.includes('--simple'));
      reset(); r = invoke('--simple','--low'); assert.equal(r.status,7,r.stderr);
      meta = JSON.parse(readFileSync(metaPath,'utf8'));
      assert.equal(meta.simple,true); assert.equal(meta.luna,false); assert.equal(meta.low,true); assert.equal(meta.high,false);
      assert(history().at(-1).args.includes('--simple')); assert(!history().at(-1).args.includes('--luna'));
      reset(); r = invoke('--luna','--max'); assert.equal(r.status,7,r.stderr);
      reset(); r = invoke('--simple'); assert.equal(r.status,7,r.stderr);
      meta = JSON.parse(readFileSync(metaPath,'utf8'));
      assert.equal(meta.max,false); assert(!history().at(-1).args.includes('--max'));
      reset(); assert.equal(run(['relaunch',name]).status,7); assert(history().at(-1).args.includes('--simple'));
      assert.equal(invoke('--simple','--luna').status,1);
      assert.equal(invoke('--low','--high').status,1);
    }
  });
  test('relaunch --to/--tier 改执行者、保留 brief/name/report，拒绝运行中的重复派发', () => {
    writeFileSync(states,'[]'); reset();
    const current=readFileSync(path,'utf8');
    let r=run(['relaunch','one','--to','claude','--tier','opus']); assert.equal(r.status,7,r.stderr);
    assert.deepEqual(history().at(-1).args,['opus',path,'--name','one','--report',report]);
    assert.equal(readFileSync(path,'utf8'),current);
    const meta=JSON.parse(readFileSync(path.replace(/\.md$/,'.json'),'utf8')); assert.equal(meta.to,'claude'); assert.equal(meta.tier,'opus');
    reset(); r=run(['relaunch','one']); assert.equal(r.status,7,r.stderr); assert.equal(history().at(-1).args[0],'opus');
    assert.equal(run(['relaunch','one','--to','gpt','--tier','haiku']).status,1);
    r=run(['relaunch','one','--tier','fable']); assert.equal(r.status,1); assert.ok(r.stderr.includes('Fable 只用 executor-fable 子代理派单'));
    meta.tier='fable'; writeFileSync(path.replace(/\.md$/,'.json'),JSON.stringify(meta));
    r=run(['relaunch','one']); assert.equal(r.status,1); assert.ok(r.stderr.includes('Fable 只用 executor-fable 子代理派单'));
    meta.tier='opus'; writeFileSync(path.replace(/\.md$/,'.json'),JSON.stringify(meta));
    state(); reset(); r=run(['relaunch','one','--to','grok']); assert.equal(r.status,1); assert.deepEqual(history().map(c=>c.args[0]),['status']);
    writeFileSync(states,'[]');
  });
  test('Gemini new/relaunch 允许复核代码、临时脚本及 expect-changes', () => {
    for (const goal of ['复核代码并运行测试', '实现 UI', '修改 src/a.mjs 文件', 'write code']) {
      reset(); const r = run(['new','gemini-check','--to','gemini','--goal',goal,'--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.equal(history().length,0);
    }
    assert.equal(run(['new','gemini-check','--to','gemini','--goal','运行小测试','--expect-changes','--dry-run']).status,0);
    reset(); const r = run(['relaunch','one','--to','gemini']);
    assert.equal(r.status,7,r.stderr); assert.equal(history().at(-1).args[0],'copy'); assert(history().at(-1).args.includes('--xhigh'));
    const gemDef = run(['new', 'gemini-default-xhigh', '--to', 'gemini', '--goal', '默认高思考档位', '--no-launch']);
    assert.equal(gemDef.status, 0, gemDef.stderr);
    reset(); assert.equal(run(['relaunch', 'gemini-default-xhigh']).status, 7);
    assert(history().at(-1).args.includes('--xhigh'));
    for (const flag of ['--low', '--high', '--xhigh']) {
      const g = run(['new', 'gemini-' + flag.slice(2), '--to', 'gemini', flag, '--goal', '测试思考档位', '--no-launch']);
      assert.equal(g.status, 0, g.stderr);
      reset(); assert.equal(run(['relaunch', 'gemini-' + flag.slice(2)]).status, 7);
      assert(history().at(-1).args.includes(flag));
    }
    reset(); assert.equal(run(['relaunch', 'gemini-low', '--xhigh']).status, 7);
    assert(history().at(-1).args.includes('--xhigh') && !history().at(-1).args.includes('--low'));
    reset(); assert.equal(run(['amend', 'gemini-low', '切到高档', '--high', '--say']).status, 7);
    assert(history().at(-1).args.includes('--high') && !history().at(-1).args.includes('--xhigh'));
    for (const bad of [['--low', '--high'], ['--high', '--xhigh'], ['--low', '--xhigh'], ['--max']]) {
      assert.equal(run(['new', 'bad-gemini', '--to', 'gemini', ...bad, '--goal', '冲突', '--dry-run']).status, 1);
      assert.equal(run(['relaunch', 'gemini-low', ...bad]).status, 1);
    }
  });
  test('图片六项、视频工具与隐私错误要求、JEV问题元信息', () => {
    for(const to of ['gpt','grok','claude','gemini','jev']) {
      const r=run(['new','image','--to',to,'--make','image','--goal','生成猫','--dry-run']); assert.equal(r.status,0,r.stderr);
      for(const item of ['/tmp/image/','01-image.png','1024×1024','共享风格块','keep the canvas free of text, letters, logos and watermarks','Deliver actual generated images','alpha status']) assert.ok(r.stdout.includes(item),item);
    }
    const r=run(['new','video','--to','grok','--make','video','--goal','视频','--dry-run']); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/ZDR\/privacy/); assert.match(r.stdout,/reference_to_video/);
    assert.equal(run(['new','bad-video','--to','gpt','--make','video','--goal','视频','--dry-run']).status,1);
    const j=run(['new','decision','--to','jev','--goal','判断是否符合条件','--no-launch']); assert.equal(j.status,0,j.stderr);
    const jp=j.stdout.match(/已生成：(.+)/)[1]; const meta=JSON.parse(readFileSync(jp.replace(/\.md$/,'.json'),'utf8'));
    assert.equal(meta.to,'jev'); assert.deepEqual(JSON.parse(readFileSync(meta.questions,'utf8')),{decision:{type:'noul',instructions:'判断是否符合条件'}});
    reset(); writeFileSync(states,'[]'); assert.equal(run(['relaunch','decision']).status,7);
    assert.deepEqual(history().at(-1).args,['judge',jp,meta.questions,'--name','decision','--report',meta.report]);
  });
  test('simple 跨仓库及跨服务路由，清楚的单仓任务不误拦', () => {
    const repos=[join(temp,'repo-a'),join(temp,'repo-b')];
    for(const repo of repos) mkdirSync(join(repo,'.git'),{recursive:true});
    const invoke=(goal,entry,writes=[],simple=true)=>spawnSync(script,['new','route','--to','gpt','--on','local','--goal',goal,'--action','改代码','--dry-run',...(simple?['--simple']:['--sol']),...(writes.length?['--write',...writes]:[])],{encoding:'utf8',env,input:entry});
    const entry=`## 入口\n仓库: ${repos[0]}\n可写路径: ${repos[0]}/src\n`;
    for(const [goal,body,writes,blocked] of [
      ['修复按钮',entry,[repos[0]+'/src',repos[1]+'/src'],true],
      ['修复按钮',entry,[repos[0]+'/src',repos[0]+'/test'],false],
      ['打通登录',entry,[],true],
      ['接入存储',entry,[],true],
      ['跨服务同步',entry,[],true],
      ['接入存储',entry+'具体文件: src/store.ts、src/index.ts\n',[],false],
      ['接入存储',entry+'具体文件: src/store.ts、src/index.ts\n',[repos[0]+'/other'],true],
      ['打通入口',entry+`可写路径: ${repos[0]}/other\n具体文件: src/index.ts\n`,[],true],
      ['修复按钮',entry,[],false],
    ]) {
      const r=invoke(goal,body,writes); assert.equal(r.status,blocked?1:0,r.stderr);
      if(blocked) assert.match(r.stderr,/改用 Sol/);
    }
    assert.equal(invoke('跨服务同步',entry,[repos[0],repos[1]],false).status,0);
  });
  test('relaunch 按最终模型重查 simple 可写范围和未知入口', () => {
    writeFileSync(states,'[]');
    const entry=`## 入口\n仓库: ${temp}/repo-a\n可写路径: ${temp}/repo-a/src\n未知入口\n`;
    const created=spawnSync(script,['new','route-relaunch','--to','gpt','--on','local','--goal','修复按钮','--action','改代码','--sol','--no-launch'],{encoding:'utf8',env,input:entry});
    assert.equal(created.status,0,created.stderr);
    reset();
    const blocked=run(['relaunch','route-relaunch','--simple']);
    assert.equal(blocked.status,1,blocked.stderr);assert.match(blocked.stderr,/请加 --sol/);
    assert(!history().some(c=>c.args[0]==='code'));
    assert.equal(run(['relaunch','route-relaunch']).status,7);
    const metaPath=join(home,'.agent-reports',report.split('/').at(-2),'route-relaunch.brief.json');
    const meta=JSON.parse(readFileSync(metaPath,'utf8'));meta.simple=true;meta.tier='terra';writeFileSync(metaPath,JSON.stringify(meta));
    assert.equal(run(['relaunch','route-relaunch']).status,1);
    assert.equal(run(['relaunch','route-relaunch','--luna']).status,1);
    const cross=spawnSync(script,['new','route-cross','--to','gpt','--on','local','--goal','接入存储','--action','改代码','--write',temp+'/repo-a/other','--sol','--no-launch'],{encoding:'utf8',env,input:entry.replace('未知入口','具体文件: src/store.ts')});
    assert.equal(cross.status,0,cross.stderr);
    const crossBlocked=run(['relaunch','route-cross','--simple']);
    assert.equal(crossBlocked.status,1,crossBlocked.stderr);assert.match(crossBlocked.stderr,/入口未列全具体文件/);
    assert.equal(run(['relaunch','route-cross']).status,7);

  });
  test('batch 先打印重叠矩阵，拒绝无 after 冲突、循环；允许串行及无重叠批次', () => {
    const body=join(temp,'batch-body.md');
    writeFileSync(body,`## 入口\n仓库: ${temp}\n`);
    const manifest=join(temp,'batch.json');
    const job=(name,path,after)=>[name,'--to','gpt','--on','local','--goal',name,'--body',body,'--write',path,'--no-lint',...(after?['--after',after]:[])];
    writeFileSync(manifest,JSON.stringify([job('batch-a',temp+'/a'),job('batch-b',temp+'/a/src')]));
    reset(); let r=run(['batch',manifest,'--dry-run']);
    assert.equal(r.status,1,r.stderr);assert.match(r.stdout,/重叠矩阵/);assert.match(r.stdout,/batch-a - X/);assert.equal(history().length,0);
    writeFileSync(manifest,JSON.stringify([job('batch-a',temp+'/a'),job('batch-b',temp+'/a/src','batch-a')]));
    r=run(['batch',manifest,'--dry-run']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/X/);assert.equal(history().length,0);
    r=run(['batch',manifest]);assert.equal(r.status,1,r.stderr); // fake fleet deliberately exits 7
    assert.deepEqual(history().filter(c=>c.args[0]==='code').map(c=>c.args[c.args.indexOf('--name')+1]),['batch-a','batch-b']);
    const aMeta=JSON.parse(readFileSync(join(home,'.agent-reports',report.split('/').at(-2),'batch-b.brief.json'),'utf8'));
    assert.equal(aMeta.after,'batch-a');assert.deepEqual(aMeta.object.writes,[temp+'/a/src']);
    writeFileSync(manifest,JSON.stringify([job('cycle-a',temp+'/a','cycle-b'),job('cycle-b',temp+'/a','cycle-a')]));
    assert.match(run(['batch',manifest,'--dry-run']).stderr,/循环依赖/);
    writeFileSync(manifest,JSON.stringify([job('disjoint-a',temp+'/a'),job('disjoint-b',temp+'/ab')]));
    assert.equal(run(['batch',manifest,'--dry-run']).status,0);
  });
  test('team 转发底层入口', () => { reset(); assert.equal(run(['team']).status,0); assert.deepEqual(history().at(-1).args,['team']); });
  test('status 提醒 launchDetached 与 wait',()=> {
    state(); const r=run(['status']); assert.equal(r.status,0); assert.match(r.stdout,/⚠/); assert.match(r.stdout,/fleet wait fake-run/);
  });
  test('status 远端超时保留本机结果，正常时合并',()=> {
    state();
    const records=join(home,'.agent-fleet/mini-runs'); mkdirSync(records,{recursive:true});
    writeFileSync(join(records,'remote.json'),JSON.stringify({id:'remote-run',name:'remote',brief:'remote'}));
    const mm=join(bin,'fake-mm');
    const opts={FLEET_MINI_MM:mm,FLEET_MINI_STATUS_TIMEOUT:'0.2'};
    try {
      writeFileSync(mm,'#!/bin/sh\nsleep 30 &\nexit 0\n',{mode:0o755});
      for (const args of [['status'],['status','--all']]) {
        const start=Date.now(), r=spawnSync(script,args,{encoding:'utf8',env:{...env,...opts},timeout:3000});
        assert.equal(r.status,0,r.stderr); assert.ok(Date.now()-start<3000);
        assert.match(r.stdout,/fake-run/); assert.match(r.stderr,/Mini 状态未取到/);
      }
      writeFileSync(mm,'#!/bin/sh\nprintf \'%s\\n\' \'{"runId":"remote-run","status":"running"}\'\n',{mode:0o755});
      for (const args of [['status'],['status','--all']]) {
        const r=run(args,opts); assert.equal(r.status,0,r.stderr);
        assert.match(r.stdout,/fake-run/); assert.match(r.stdout,/remote-run/); assert.doesNotMatch(r.stderr,/Mini 状态未取到/);
      }
    } finally { rmSync(records,{recursive:true,force:true}); }
  });
  test('源码不包含真实后台化调用', () => {
    const shell=readFileSync(script,'utf8'); assert.doesNotMatch(shell,/&|nohup|setsid|disown/);
    const python=readFileSync(join(root,'src/fleet-go.py'),'utf8');
    assert.doesNotMatch(python,/subprocess\.(?:Popen|run)\([^\n]*(?:shell\s*=\s*True|start_new_session|nohup|setsid|disown)/);
    assert.doesNotMatch(python,/os\.(?:fork|setsid|system)\(/);
    assert.match(python,/os\.execvp\('fleet'/);
  });
  test('worktree brief 路径和 relaunch 复用', () => {
    const remote=join(temp,'wt-remote'), repo=join(temp,'wt-repo');
    const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'}); assert.equal(r.status,0,r.stderr);};
    git('init','--bare',remote); git('clone',remote,repo);
    git('-C',repo,'config','user.email','test@example.invalid'); git('-C',repo,'config','user.name','test');
    git('-C',repo,'commit','--allow-empty','-m','initial'); git('-C',repo,'push','-u','origin','HEAD');
    const r=run(['new','wt-test','--to','gpt','--on','local','--goal','test','--write',repo,'--worktree','--no-launch']);
    assert.equal(r.status,0,r.stderr);
    const bp=join(home,'.agent-reports',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'wt-test.brief.md');
    const body=readFileSync(bp,'utf8'); const meta=JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8'));
    assert.ok(body.includes(meta.worktree.path)); assert.ok(body.includes(meta.worktree.branch)); assert.ok(body.includes('origin/')); assert.ok(body.includes('worktree remove')); assert.ok(body.includes('branch -D'));
    assert.equal(meta.object.writes[0],meta.worktree.path);
    const again=run(['relaunch','wt-test','--worktree']); assert.equal(again.status,7,again.stderr);
    assert.equal(JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8')).worktree.path,meta.worktree.path);
  });
  console.log(`fleet-go：${checks} 组通过。`);
} finally { rmSync(temp,{recursive:true,force:true}); }
