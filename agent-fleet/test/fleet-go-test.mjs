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
if(['code','copy','bulk','grok-cli','haiku','sonnet','opus','fable','judge'].includes(args[0])) process.exit(7);
`, { mode: 0o755 });
writeFileSync(join(bin, 'pgrep'), '#!/bin/sh\nif [ -n "${RESIDUAL:-}" ]; then\n printf "%s\\n" "$RESIDUAL"\n exit 0\nfi\nexit 1\n', { mode: 0o755 });
const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, CALLS: calls, STATES: states };
const run = (args, extra={}) => spawnSync(script, args, { encoding:'utf8', env:{...env,...extra}, input:'' });
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
    assert.deepEqual(history().at(-1).args,['code',path,'--name','one','--report',report]);
    assert.ok(existsSync(path));
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
  test('没有运行 run 时 --say 直接按修订后 brief relaunch', () => {
    writeFileSync(states,'[]'); reset(); const r=run(['amend','one','离线修订','--say']); assert.equal(r.status,7,r.stderr); assert.match(r.stdout,/直接 relaunch/);
    assert.ok(history().some(c=>c.args[0]==='code'));
  });
  test('--restart 找不到运行 run 仍清楚提示', () => {
    writeFileSync(states,'[]'); const r=run(['amend','one','离线重启','--restart']); assert.equal(r.status,1); assert.match(r.stderr,/找不到唯一运行/);
  });
  test('lint 缺项失败、合格通过、后台命令和秘密拒绝且不回显', () => {
    const bad=join(temp,'bad.md'); writeFileSync(bad,'没有必需项');
    let r=run(['lint',bad]); assert.equal(r.status,1); for(const word of ['第一行','REPORT','逐字规则']) assert.ok(r.stderr.includes(word));
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
    assert.match(local.stdout,/部署、git 写操作、线上写入由主线程另行授权/); assert.match(local.stdout,/提交按授权覆盖执行/);
  });
  test('密钥诊断仅给行号与规则，摘要、长文件名和路径不误报', () => {
    const normal=[
      '镜像 digest：sha256:'+ 'a1'.repeat(32),
      '文件：fleet-task-'+'long-name-'.repeat(8)+'report.md',
      '检查 fleet-task-'+'x'.repeat(40)+'.md 文件',
      '路径：/tmp/sk-'+'x'.repeat(40)+'/report.md',
      '路径：/tmp/exports/'+'a'.repeat(64)+'/fleet-task-report.md',
    ].join('\n');
    const preview=spawnSync(script,['new','normal-check','--to','gpt','--dry-run'],{encoding:'utf8',env,input:normal});
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
  test('body 文件、stdin、授权叠加、paid 必须预算、默认报告和 no-launch', () => {
    const body=join(temp,'body.md'); writeFileSync(body,'## 独有正文\n只处理本目标');
    let r=run(['new','--to','gpt','body','--body',body,'--auth','local,readonly-web','--no-launch']); assert.equal(r.status,0,r.stderr);
    assert.equal(run(['new','--to','gpt','paid','--goal','付费','--auth','paid','--dry-run']).status,1);
    r=run(['new','--to','gpt','paid','--goal','付费','--auth','paid','--budget','$2，重试 1 次','--dry-run']); assert.equal(r.status,0); assert.match(r.stdout,/\$2，重试 1 次/);
    r=spawnSync(script,['new','--to','gpt','stdin','--dry-run'],{encoding:'utf8',env,input:'## stdin 独有正文'}); assert.equal(r.status,0); assert.match(r.stdout,/stdin 独有正文/);
  });
  test('五产品、各档及选项映射，必填产品与旧参数拒绝', () => {
    for(const [to,cmd] of Object.entries({gpt:'code',claude:'sonnet',grok:'grok-cli',gemini:'copy',jev:'judge'})) {
      const r=run(['new',to,'--to',to,'--goal','是否满足判断条件','--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.ok(r.stderr.includes('fleet '+cmd+' '));
      assert.match(r.stdout,/归类：/); assert.match(r.stdout,/REPORT: /); assert.ok(r.stdout.includes(rule));
    }
    for(const tier of ['haiku','sonnet','opus','fable']) {
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
  test('relaunch --to/--tier 改执行者、保留 brief/name/report，拒绝运行中的重复派发', () => {
    writeFileSync(states,'[]'); reset();
    const current=readFileSync(path,'utf8');
    let r=run(['relaunch','one','--to','claude','--tier','opus']); assert.equal(r.status,7,r.stderr);
    assert.deepEqual(history().at(-1).args,['opus',path,'--name','one','--report',report]);
    assert.equal(readFileSync(path,'utf8'),current);
    const meta=JSON.parse(readFileSync(path.replace(/\.md$/,'.json'),'utf8')); assert.equal(meta.to,'claude'); assert.equal(meta.tier,'opus');
    reset(); r=run(['relaunch','one']); assert.equal(r.status,7,r.stderr); assert.equal(history().at(-1).args[0],'opus');
    assert.equal(run(['relaunch','one','--to','gpt','--tier','haiku']).status,1);
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
    assert.equal(r.status,7,r.stderr); assert.equal(history().at(-1).args[0],'copy');
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
  test('team 转发底层入口', () => { reset(); assert.equal(run(['team']).status,0); assert.deepEqual(history().at(-1).args,['team']); });
  test('status 提醒 launchDetached 与 wait',()=> {
    state(); const r=run(['status']); assert.equal(r.status,0); assert.match(r.stdout,/⚠/); assert.match(r.stdout,/fleet wait fake-run/);
  });
  test('源码不包含真实后台化调用', () => {
    const shell=readFileSync(script,'utf8'); assert.doesNotMatch(shell,/&|nohup|setsid|disown/);
    const python=readFileSync(join(root,'src/fleet-go.py'),'utf8');
    assert.doesNotMatch(python,/subprocess\.(?:Popen|run)\([^\n]*(?:shell\s*=\s*True|start_new_session|nohup|setsid|disown)/);
    assert.doesNotMatch(python,/os\.(?:fork|setsid|system)\(/);
    assert.match(python,/os\.execvp\('fleet'/);
  });
  console.log(`fleet-go：${checks} 组通过。`);
} finally { rmSync(temp,{recursive:true,force:true}); }
