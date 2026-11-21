import assert from 'node:assert/strict';
import { spawnSync as rawSpawnSync } from 'node:child_process';
function spawnSync(cmd, args, opts) {
  if (cmd === script && ['new', 'relaunch', 'amend'].includes(args[0])) {
    args = [...args];
    if (!args.includes('--on')) args.push('--on', 'local');
    if (args[args.indexOf('--on') + 1] === 'local' && !args.includes('--local-reason')) args.push('--local-reason', 'test fixture');
  }
  return rawSpawnSync(cmd, args, opts);
}
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, utimesSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname ?? new URL('..', import.meta.url).pathname, import.meta.dirname ? '..' : '.');
const script = join(root, 'bin/fleet-go');
const temp = mkdtempSync(join(tmpdir(), 'fleet-go-test-'));
const home = join(temp, 'home');
const bin = join(temp, 'bin');
mkdirSync(join(home, '.claude'), { recursive: true });
// 调遣令全部正常的夹具,免得「文件不存在」警告混进被断言的 stderr;调遣令本身的行为见 order-test.mjs。
mkdirSync(join(home, '.agents'), { recursive: true });
writeFileSync(join(home, '.agents/dispatch-order.md'), '| 执行者 | 状态 | 有效至 | 原因与用户原话 |\n|---|---|---|---|\n| 全局 | 正常 | 用户另说 | |\n');
mkdirSync(bin);
const rule = readFileSync(join(root, 'skill/templates/blocks/rule-sentence.md'), 'utf8').trim();
writeFileSync(join(home, '.claude/CLAUDE.md'), "禁止单纯转发，允许分发子步骤：不能把整个任务原样甩给另一个 agent 后只回'已启动/等结果'就结束当轮；可以拆出边界清晰的子步骤交给更便宜的 agent 做，但你必须自己掌握全局、消化并验证子任务结果，最终给出真正的结论作为你的最终答案");
const calls = join(temp, 'calls.jsonl');
const states = join(temp, 'states.json');
writeFileSync(states, '[]');
writeFileSync(join(bin, 'fleet'), `#!${process.execPath}
const fs = require('fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CALLS, JSON.stringify({args, pid:process.pid, cwd:process.cwd()})+'\\n');
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
} else if(['code','openai','copy','bulk','grok-cli','haiku','sonnet','opus','fable','judge'].includes(args[0])) {
  if (!args.includes('runtime-retry')) {
    const runs=process.env.AGENT_FLEET_RUNS_DIR || process.env.HOME+'/.agent-fleet/runs';
    fs.mkdirSync(runs,{recursive:true});
    fs.writeFileSync(runs+'/fixture-'+process.pid+'.queue.json',JSON.stringify({briefPath:args[1],createdAt:Date.now()}));
  }
  process.exit(7);
}
`, { mode: 0o755 });
writeFileSync(join(bin, 'pgrep'), '#!/bin/sh\nif [ -n "${RESIDUAL:-}" ]; then\n printf "%s\\n" "$RESIDUAL"\n exit 0\nfi\nexit 1\n', { mode: 0o755 });
const env = { ...process.env, FLEET_STRICT: '1', FLEET_DEFAULT_ON: 'local', HOME: home, PATH: bin + ':' + process.env.PATH, CALLS: calls, STATES: states };
const run = (args, extra={}) => spawnSync(script, ['new','lint'].includes(args[0]) ? [...args, '--no-lint'] : args, { encoding:'utf8', env:{...env,...extra}, input:'' });
const history = () => existsSync(calls) ? readFileSync(calls,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const reset = () => writeFileSync(calls, '');
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS - '+name); }
try {
  test('status 忽略无 runId 和损坏的本地 JSON',()=> {
    const runs=join(temp,'status-local-runs'); mkdirSync(runs);
    writeFileSync(join(runs,'quota.json'),JSON.stringify({status:'done'}));
    writeFileSync(join(runs,'broken.json'),'{');
    writeFileSync(join(runs,'valid.json'),JSON.stringify({runId:'valid-run',status:'done'}));
    const r=run(['status','--all'],{AGENT_FLEET_RUNS_DIR:runs});
    assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/valid-run/);
    reset();
  });
  let brief;
  test('dry-run 必需元素及顺序、最后一行逐字规则、无文件或派发', () => {
    const r=run(['new','--to','gpt','one','--goal','独有目标','--dry-run','--write','/tmp/project','--read','/tmp/source']);
    assert.equal(r.status,0,r.stderr); brief=r.stdout;
    let previous=-1;
    for(const text of ['归类：','REPORT:','## 思维准则（每单首要','根因优先','自我证伪','围绕本 brief','## 授权覆盖','## 目标','## 允许范围','## 验收',rule]) {
      const i=brief.indexOf(text); assert.ok(i>previous,text); previous=i;
    }
    assert.equal(brief.trim().split('\n').at(-1),rule);
    assert.match(r.stderr,/将执行：fleet code .*--name one --report /);
    assert.doesNotMatch(brief,/NODE_USE_ENV_PROXY=1/);
    assert.match(r.stderr,/样板字符数.*样板占比/);
    assert.match(brief,/规则回执/);
    assert.equal(history().length,0);
    assert.ok(!existsSync(join(home,'.agent-fleet/reports')));
    assert.match(brief, /不启动子代理或子线程/);
    assert.doesNotMatch(brief, /可以把边界清晰的子步骤交给/);
    const orchestrator = run(['new','orchestrator','--to','gpt','--type','orchestrate','--goal','x','--dry-run']);
    assert.equal(orchestrator.status,0,orchestrator.stderr);
    assert.match(orchestrator.stdout,/可以把边界清晰的子步骤交给/);
    assert.doesNotMatch(orchestrator.stdout,/不启动子代理或子线程/);
  });
  test('Codex 额度自动改派及停用边界', () => {
    const orderFile=join(temp,'fallback-order.md'), runs=join(temp,'fallback-runs'); mkdirSync(runs);
    const setOrder=(reason, api='正常')=>writeFileSync(orderFile, `| codex | 停用 | 用户另说 | ${reason} |\n| openai-api | ${api} | 用户另说 | |\n`);
    const extra={AGENT_FLEET_ORDER_FILE:orderFile, AGENT_FLEET_RUNS_DIR:runs};
    setOrder('自动：额度用尽');
    let r=run(['new','fallback','--to','gpt','--sol','--fast','--goal','x','--no-launch'],extra);
    assert.equal(r.status,0,r.stderr);
    const file=r.stdout.match(/\/[^\n ]+fallback\.brief\.md/)[0];
    const meta=JSON.parse(readFileSync(file.replace(/\.md$/,'.json'),'utf8'));
    assert.equal(meta.to,'openai'); assert.match(meta.fallback_deviation,/sol.*fast/); assert.match(readFileSync(file,'utf8'),/自动改派 OpenAI API/);
    r=run(['relaunch','fallback','--to','gpt','--astra'],extra); assert.equal(r.status,7,r.stderr); assert.equal(history().at(-1).args[0],'openai');
    setOrder('手动停用'); r=run(['new','manual','--to','gpt','--goal','x','--dry-run'],extra); assert.equal(r.status,1); assert.match(r.stderr,/调遣令拒绝/);
    setOrder('自动：额度用尽','停用'); r=run(['new','api-stop','--to','gpt','--goal','x','--dry-run'],extra); assert.equal(r.status,1); assert.match(r.stderr,/openai-api/);
    writeFileSync(orderFile,'| codex | 正常 | 用户另说 | |\n| openai-api | 正常 | 用户另说 | |\n');
    writeFileSync(join(runs,'codex-quota.json'),JSON.stringify({usedPercent:100,resetsAt:Date.now()/1000+3600}));
    r=run(['new','quota','--to','gpt','--goal','x','--dry-run'],extra); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/自动改派 OpenAI API/); assert.match(r.stderr,/fleet openai/);
    r=run(['new','review-quota','--to','gpt','--review','--goal','x','--dry-run'],extra); assert.equal(r.status,1); assert.match(r.stderr,/不支持 --review/); reset();
  });
  // 使用输出的 REPORT 路径，避免日期 locale 与时区差异。
  const report = brief.match(/^REPORT: (.+)$/m)[1];
  const path = report.replace(/\.md$/,'.brief.md');
  test('启动器运行时失败后允许同名重试并记录退出码', () => {
    const args=['new','runtime-retry','--to','gpt','--goal','retry'];
    assert.equal(run(args).status,7);
    const metaPath=join(home,'.agent-fleet/reports',report.split('/').at(-2),'runtime-retry.brief.json');
    assert.equal(JSON.parse(readFileSync(metaPath,'utf8')).launch_exit,7);
    assert.equal(run(args).status,7);
  });
  test('new 前台启动、参数正确、退出码透传', () => {
    const r=run(['new','--to','gpt','one','--goal','独有目标']);
    assert.equal(r.status,7,r.stderr);
    assert.notEqual(history().at(-1).pid,r.pid);
    assert.deepEqual(history().at(-1).args,['code',path,'--name','one','--report',report,'--simple']);
    assert.ok(existsSync(path));
    const metadata=JSON.parse(readFileSync(path.replace(/\.md$/,'.json'),'utf8'));
    assert.equal(metadata.tier,'terra');
    assert.deepEqual(metadata.auth,['local']);
    assert.deepEqual(metadata.actions,[]);
  });
  test('项目派单经验在 new 和 relaunch 中按优先级注入', () => {
    const project=join(temp,'lessons-project'), repo=join(project,'nested');
    mkdirSync(join(project,'.rankup/infra'),{recursive:true}); mkdirSync(repo,{recursive:true});
    const primary=join(realpathSync(project),'.rankup/infra/13-dispatch-kit.md'), fallback=join(realpathSync(project),'.rankup/dispatch.md');
    writeFileSync(primary,'经验'); writeFileSync(fallback,'备用');
    const body=join(temp,'lessons-body.md'); writeFileSync(body,`## 入口\n仓库: ${repo}\n`);
    let r=run(['new','lessons','--to','gpt','--action','只读','--body',body,'--no-launch']);
    assert.equal(r.status,0,r.stderr); assert.ok(r.stdout.includes(primary));
    const file=join(path.slice(0,path.lastIndexOf('/')),'lessons.brief.md');
    assert.ok(readFileSync(file,'utf8').includes(`## 已知坑\n项目派单经验：${primary}（派单前先读）`));
    rmSync(primary); r=run(['relaunch','lessons']); assert.equal(r.status,7,r.stderr); assert.ok(r.stdout.includes(fallback));
    const updated=readFileSync(file,'utf8'); assert.ok(updated.includes(fallback)); assert.ok(!updated.includes(primary));
    rmSync(fallback); r=run(['relaunch','lessons']); assert.equal(r.status,7,r.stderr); assert.doesNotMatch(r.stdout,/项目派单经验：/); assert.doesNotMatch(readFileSync(file,'utf8'),/项目派单经验：/);
  });
  test('场景显式选择、自动唯一/歧义、默认值、验收环境和跳过', () => {
    const project = join(temp, 'scene-project');
    const repo = join(project, 'service');
    const folder = join(project, '.rankup/dispatch-scenes');
    mkdirSync(folder, { recursive: true });
    mkdirSync(repo);
    writeFileSync(join(project, '.rankup/dispatch.md'), '通用派单经验');
    const scene = (name, keywords, auth, action, tier) => writeFileSync(join(folder, name + '.md'),
      `---\n${JSON.stringify({ description: name + ' 说明', keywords, auth, action, tier,
        writes: ['<worktree>'], acceptance: ['检查证据'] })}\n---\n${name} 专用入口\n`);
    scene('api', ['api TEST 发布'], 'local-commit,deploy-prod', '部署', 'sol');
    scene('editor', ['编辑器对齐'], 'local-commit', '改代码', 'terra');
    const file = join(temp, 'scene-body.md');
    const writeBody = extra => writeFileSync(file, `## 入口\n仓库: ${repo}\n可写路径: ${repo}\n\n${extra}`);
    writeBody('## 验收目标\n编辑器对齐');
    const preview = (...args) => run(['new', 'scenes-preview', '--to', 'gpt', '--dry-run', '--body', file, ...args]);
    const listing = run(['scenes', '--project', project]);
    assert.equal(listing.status, 0, listing.stderr);
    assert.match(listing.stdout, /api\s+api 说明/);
    let r = preview('--scene', 'api');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /自我证伪[\s\S]*## 派单场景 · api[\s\S]*检查证据/);
    assert.match(r.stdout, /动作: 部署/);
    assert.match(r.stdout, /发布全流程/);
    assert.match(r.stderr, /模型：sol/);
    assert.doesNotMatch(r.stdout, /项目派单经验：|editor 专用入口/);
    r = preview();
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /已自动带场景 editor/);
    assert.match(r.stdout, /动作: 改代码/);
    r = preview('--goal', 'API TEST 发布');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /api, editor.*--scene none/);
    r = preview('--scene', 'api,editor', '--auth', 'local', '--action', '只读', '--simple');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /api 专用入口[\s\S]*editor 专用入口/);
    assert.match(r.stdout, /动作: 只读/);
    assert.doesNotMatch(r.stdout, /发布全流程|允许在本地分支提交/);
    assert.match(r.stderr, /模型：terra/);
    r = preview('--scene', 'none');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /项目派单经验：/);
    assert.doesNotMatch(r.stdout, /派单场景 ·/);
    writeFileSync(file, `## 入口\n仓库: ${repo}\n可写路径: ${repo}、${project}\n`);
    r = preview('--scene', 'editor');
    assert.equal(r.status, 0, r.stderr);
    const object = JSON.parse(r.stdout.match(/^对象: (.+)$/m)[1]);
    assert.deepEqual(object.writes, [repo, project]);
    writeBody('');
    writeFileSync(join(project, 'AGENTS.md'), '# example-project / Buildin 项目规则\n');
    r = preview('--scene', 'editor');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /账号、免费空间、付费空间、开关、夹具、性能闸门/);
    writeBody('## 验收环境\n- 账号：测试身份\n- 免费空间：fixture-a\n- 付费空间：fixture-b\n- 开关：0%\n- 夹具：fixture\n- 性能闸门：计划 §3\n');
    r = preview('--scene', 'editor');
    assert.equal(r.status, 0, r.stderr);
  });
  test('context、项目总则、声明闸门、新旧场景、doctor 与两代报告', () => {
    const project = join(temp, 'layers-project');
    const layer = join(project, '.agent-fleet');
    const old = join(project, '.rankup/dispatch-scenes');
    mkdirSync(old, { recursive: true });
    mkdirSync(join(layer, 'scenes'), { recursive: true });
    const scene = (dir, name, description) => writeFileSync(join(dir, name + '.md'),
      '---\n' + JSON.stringify({ description, keywords: [], acceptance: [] }) + '\n---\n内容\n');
    scene(old, 'old-scene', '旧目录条目');
    scene(old, 'new-scene', '已被覆盖');
    scene(join(layer, 'scenes'), 'new-scene', '新目录条目');
    for (let i = 0; i < 19; i++) scene(join(layer, 'scenes'), 'extra-' + i, '场景');
    const global = join(home, '.agent-fleet');
    mkdirSync(global, { recursive: true });
    writeFileSync(join(global, 'README.md'), '全局规则夹具');
    const reportMarker = '项目规则夹具';
    writeFileSync(join(layer, 'README.md'), [reportMarker, ...Array(59).fill('普通文字'), '截断标记'].join('\n'));
    writeFileSync(join(layer, 'project.json'), JSON.stringify({ briefGates: [
      { when: { action: '改代码' }, section: '现场', fields: ['入口.地址'], hint: '填写真实入口' }
    ] }));
    const r = run(['context', '--project', join(layer, 'scenes')]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /调遣令[\s\S]*全局规则夹具[\s\S]*项目规则夹具[\s\S]*新目录条目[\s\S]*旧目录条目[\s\S]*优先级/);
    assert.doesNotMatch(r.stdout, /已被覆盖|截断标记/);
    assert.match(r.stderr, /迁到/);
    const body = join(temp, 'layers-body.md');
    const newArgs = ['new', 'layers-report', '--to', 'gpt', '--body', body, '--scene', 'new-scene', '--action', '改代码'];
    writeFileSync(body, `## 入口\n仓库: ${project}\n可写路径: ${layer}\n## 现场\n入口X地址: 无效`);
    let out = run([...newArgs, '--dry-run']);
    assert.equal(out.status, 1);
    assert.match(out.stderr, /入口\.地址.*填写真实入口/);
    writeFileSync(body, `## 入口\n仓库: ${project}\n可写路径: ${layer}\n## 现场\n- 入口.地址: 夹具`);
    out = run([...newArgs, '--no-launch']);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stderr, /超过 60 行，已截断/);
    const brief = out.stdout.match(/已生成：(.+)/)[1];
    const meta = JSON.parse(readFileSync(brief.replace(/\.md$/, '.json'), 'utf8'));
    assert.deepEqual(meta.scenes, ['new-scene']);
    assert.match(readFileSync(brief, 'utf8'), /项目规则夹具/);
    assert.doesNotMatch(readFileSync(brief, 'utf8'), /截断标记/);
    writeFileSync(meta.report, '新报告\n第二行\n');
    assert.equal(run(['read', 'layers-report', '--head', '1']).stdout, '新报告\n');
    const oldReport = join(home, '.agent-reports/2001-02-03');
    mkdirSync(oldReport, { recursive: true });
    writeFileSync(join(oldReport, 'legacy.brief.md'), '旧 brief');
    writeFileSync(join(oldReport, 'legacy.brief.json'), JSON.stringify({ to: 'gpt', report: join(oldReport, 'legacy.md') }));
    writeFileSync(join(oldReport, 'legacy.md'), '旧报告');
    assert.equal(run(['read', 'legacy']).stdout, '旧报告');
    const envFile = join(layer, '.env');
    const git = (...args) => spawnSync('git', ['-C', project, ...args], { encoding: 'utf8' });
    assert.equal(git('init', '-q').status, 0);
    writeFileSync(envFile, 'FIXTURE=1');
    const secret = 'sk-' + 'x'.repeat(24);
    writeFileSync(join(global, 'lessons.md'), [
      '- 用户 10-12 说过', '- 10-13', '- 10-14', '- 这条派单规则一律在进入任务时执行',
      '- 这条派单规则一律在进入任务前执行', '“' + '原话'.repeat(25) + '”', secret,
    ].join('\n'));
    const ago = new Date(Date.now() - 91 * 86400 * 1000);
    for (const file of [join(old, 'old-scene.md'), join(layer, 'scenes/new-scene.md')]) utimesSync(file, ago, ago);
    writeFileSync(join(global, 'ledger.jsonl'), JSON.stringify({ project, scenes: ['new-scene'], startedAt: new Date().toISOString() }));
    writeFileSync(join(global, 'dispatch-order.md'), '| codex | 停用 | 2000-01-01 | fixture |\n');
    const doctorEnv = { AGENT_FLEET_LEDGER: join(global, 'ledger.jsonl'), FLEET_MINI_BIN: '/missing/fleet', FLEET_MINI_MM: '/missing/mm' };
    const doctor = run(['doctor', '--project', project], doctorEnv);
    assert.equal(doctor.status, 0, doctor.stderr);
    for (const message of ['疑似原话', '日期密度', '超过 60 行', '近似重复', '补充「适用」',
      '超过 20 个', '候选删除场景 old-scene', '过期调遣令', '未被 Git 忽略', '疑似密钥', 'Skill agent-fleet']) {
      assert.ok(doctor.stdout.includes(message), message);
    }
    assert.ok(!doctor.stdout.includes(secret) && !doctor.stderr.includes(secret));
    assert.doesNotMatch(doctor.stdout, /候选删除场景 new-scene/);
    writeFileSync(join(project, '.gitignore'), '/.agent-fleet/.env\n');
    assert.doesNotMatch(run(['doctor', '--project', project], doctorEnv).stdout, /未被 Git 忽略/);
  });
  test('多仓聚合根拦截入口和 --write，允许具体仓库和子目录', () => {
    const workspace = join(temp, 'aggregate-workspace');
    const repo = join(workspace, 'aggregate-repo');
    const service = join(workspace, 'service');
    const docs = join(repo, 'docs');
    mkdirSync(docs, { recursive: true });
    mkdirSync(service);
    const git = (cwd, ...args) => {
      const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
      assert.equal(r.status, 0, r.stderr);
      return r.stdout.trim();
    };
    git(repo, 'init');
    git(service, 'init');
    git(repo, '-c', 'user.email=test@example.invalid', '-c', 'user.name=test', 'commit', '--allow-empty', '-m', 'base');
    const commit = git(repo, 'rev-parse', 'HEAD');
    for (const name of ['sub-a', 'sub-b']) {
      git(repo, 'update-index', '--add', '--cacheinfo', `160000,${commit},${name}`);
    }
    const body = join(temp, 'scope-body.md');
    const preview = (path, ...extra) => {
      writeFileSync(body, `## 入口\n仓库: ${repo}\n可写路径: ${path}\n`);
      return run(['new', 'scope-preview', '--to', 'gpt', '--sol', '--action', '改代码', '--dry-run', '--body', body, ...extra]);
    };
    for (const result of [preview(repo), preview(docs, '--write', workspace)]) {
      assert.equal(result.status, 1);
      assert.match(result.stderr, /覆盖多仓聚合根.*具体仓库 worktree 或子目录/);
    }
    assert.equal(preview(docs, '--read', workspace).status, 0);
    assert.equal(preview(service).status, 0);
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
    assert.match(r.stderr,/fleet-go relaunch one\n/); assert.match(r.stderr,/one-2/);
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
  test('修订路径不参与必需路径，重派前置失败恢复文件', () => {
    writeFileSync(states,'[]');
    const missing='/tmp/'+'not-on-mini.git';
    const r=run(['amend','one','远端机器路径 '+missing,'--say']);
    assert.equal(r.status,7,r.stderr);
    const jsonPath=path.replace(/\.md$/,'.json');
    assert(!JSON.parse(readFileSync(jsonPath,'utf8')).paths.includes(missing));
    const python=`import importlib.util,sys
from unittest.mock import patch
sys.path.insert(0, __import__('os').path.dirname(sys.argv[1]))
spec=importlib.util.spec_from_file_location('fg',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
a=m.build_parser().parse_args(['amend',sys.argv[2],'远端 /tmp/not-on-mini.git','--say','--on','mini'])
def dry_preflight(meta, paths):
 assert '/tmp/not-on-mini.git' not in paths
 return None
with patch.object(m,'running',return_value=[]), patch.object(m.mini,'find',return_value=None), patch.object(m.mini,'available',return_value=True), patch.object(m,'checked'), patch.object(m.mini,'preflight',side_effect=dry_preflight), patch.object(m.mini,'launch',return_value=0):
 try: m.amend(a)
 except SystemExit as e: assert e.code == 0
before=[__import__('pathlib').Path(sys.argv[2]).read_bytes(), __import__('pathlib').Path(sys.argv[2]).with_suffix('.json').read_bytes()]
a=m.build_parser().parse_args(['amend',sys.argv[2],'校验失败','--say','--on','mini'])
with patch.object(m,'running',return_value=[]), patch.object(m.mini,'find',return_value=None), patch.object(m.mini,'available',return_value=True), patch.object(m,'checked'), patch.object(m.mini,'preflight',return_value='Mini 缺少路径'):
 try: m.amend(a)
 except ValueError as e: assert 'Mini 缺少路径' in str(e)
 else: raise AssertionError('expected failure')
assert before == [__import__('pathlib').Path(sys.argv[2]).read_bytes(), __import__('pathlib').Path(sys.argv[2]).with_suffix('.json').read_bytes()]
`;
    const failed=rawSpawnSync('python3',['-c',python,join(root,'src/fleet-go.py'),path],{encoding:'utf8',env});
    assert.equal(failed.status,0,failed.stderr);
  });
  test('Mini 本机显式指定 --on mini 给出正确提示', () => {
    const python=`import importlib.util,sys
from unittest.mock import patch
sys.path.insert(0, __import__('os').path.dirname(sys.argv[1]))
spec=importlib.util.spec_from_file_location('fg',sys.argv[1]); m=importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
with patch.dict(m.mini.os.environ, {'FLEET_MINI_HOSTNAME':'remote-host'}), patch.object(m.mini.socket,'gethostname',return_value='remote-host.local'), patch.object(sys,'argv',['fleet-go','amend','one','--say','x','--on','mini']):
 try: m.main()
 except ValueError as e: assert '已在 Mini 上' in str(e) and '--on local' in str(e)
 else: raise AssertionError('expected failure')
`;
    const r=rawSpawnSync('python3',['-c',python,join(root,'src/fleet-go.py')],{encoding:'utf8',env});
    assert.equal(r.status,0,r.stderr);
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
    let r=spawnSync(script,['lint',bad,'--on','local'],{encoding:'utf8',env}); assert.equal(r.status,1); for(const word of ['归类','REPORT','逐字规则']) assert.ok(r.stderr.includes(word));
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
  test('预检补全格式并将预览拒绝记账', () => {
    const file=join(temp,'normalize.md');
    writeFileSync(file, original.replace(/^归类：[^\n]*\n/m,'').replace(/^REPORT: [^\n]*\n/m,''));
    let r=spawnSync(script,['lint',file,'--on','local'],{encoding:'utf8',env});
    assert.equal(r.status,0,r.stderr);
    assert.match(readFileSync(file,'utf8'),/^归类：.*理由：.*\nREPORT: \//);
    const ledger=join(temp,'preview-rejects.jsonl');
    r=run(['new','preview-reject','--to','gpt','--goal','检查','--action','改代码','--dry-run'],{AGENT_FLEET_GATE_REJECTS:ledger});
    assert.equal(r.status,1); assert.equal(JSON.parse(readFileSync(ledger,'utf8').trim()).preview,true);
    r=run(['new','invalid name','--to','gpt','--goal','检查','--dry-run'],{AGENT_FLEET_GATE_REJECTS:ledger});
    assert.equal(r.status,1); assert.equal(JSON.parse(readFileSync(ledger,'utf8').trim().split('\n').at(-1)).preview,true);
    r=run(['new','arg-error','--to','gpt','--bogus','--dry-run'],{AGENT_FLEET_GATE_REJECTS:ledger});
    assert.notEqual(r.status,0); assert.equal(JSON.parse(readFileSync(ledger,'utf8').trim().split('\n').at(-1)).preview,true);
  });
  test('无仓库只读实际在空目录启动', () => {
    reset();
    const r=run(['new','no-repo-read','--to','gpt','--goal','联网调研','--action','只读']);
    assert.equal(r.status,7,r.stderr);
    const call=history().find(c=>c.args[0]==='code');
    assert.ok(call && call.cwd.includes('fleet-readonly-')); assert.ok(existsSync(call.cwd));
  });
  test('动作、入口与授权 lint 及豁免', () => {
    const strict = (action, body, opts=[]) => spawnSync(script,['new','strict','--to','gpt','--on','local','--goal','检查任务' ,'--dry-run',...(action ? ['--action',action] : []),...opts],{encoding:'utf8',env,input:body});
    const entry = '## 入口\n仓库：/tmp\n可写路径：/tmp/example\n';
    const readEntry = '## 入口\n仓库：/tmp\n';
    let r = strict('只读',readEntry); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/动作: 只读/);
    assert.equal(strict('改代码',entry).status,0);
    for (const sep of ['/', '、', ',', '，', ';', '；', ' ', '和']) {
      const r = strict('只读' + sep + '改代码', entry);
      assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /动作: 只读 \/ 改代码/);
    }
    let noRepo = strict('只读', ''); assert.equal(noRepo.status, 0, noRepo.stderr); assert.match(noRepo.stderr, /空的临时工作目录/);
    assert.equal(strict('改代码', '').status, 1);
    const badWord = strict('只读、错字', entry); assert.match(badWord.stderr, /错字.*动作: 只读/);
    const annotated = strict('部署（生产数据删除）、只读', '## 入口\n仓库：/tmp（说明）\n可写路径：/tmp/example(说明)\n', ['--auth','local-commit,deploy-prod']);
    assert.equal(annotated.status,1); assert.match(annotated.stderr,/删除数据需要/);
    assert.equal(strict('本地提交',entry,['--auth','local-commit']).status,0);
    assert.equal(strict('推送 / 部署',entry,['--auth','local-commit,deploy-prod']).status,0);
    assert.equal(strict('付费',entry,['--auth','paid']).status,0);
    for (const [action, body, opts, expected] of [
      ['只读','## 入口\n仓库：relative',[],/绝对路径/],
      ['只读','## 入口\n仓库：/no-such-fake-repository',[],/仓库不存在/],
      ['改代码',readEntry,[],/可写路径/],
      ['改代码',entry,['--auth','review'],/local 或 local-commit/],
      ['本地提交',entry,[],/local-commit/],
      ['推送',entry,['--auth','deploy-prod'],/local-commit 和 deploy-prod/],
      ['部署',entry,['--auth','local-commit'],/local-commit 和 deploy-prod/],
      ['付费',entry,[],/paid/],
      ['未知动作',entry,[],/未知或空动作/],
    ]) { r=strict(action,body,opts); assert.equal(r.status,1,action); assert.match(r.stderr,expected); assert.match(r.stderr,/示例（按实际任务和授权修改）/); }
    r=strict('错误动作',entry); assert.match(r.stderr,/合法集合：只读、改代码、本地提交、推送、部署、付费/);
    r=strict('只读','## 入口\n仓库：/tmp\n自己找 token=abcdefghijklmnopqrstuv'); assert.equal(r.status,1); assert.match(r.stderr,/发现疑似密钥字面量/); assert.doesNotMatch(r.stderr,/abcdefghijklmnopqrstuv/);
    assert.equal(strict('只读','## 入口\n仓库：/tmp\n未知',['--sol']).status,0);
    r=strict('本地提交',entry+'PR 合入后装到 launchd 路径并回读。',['--auth','local-commit']); assert.equal(r.status,1); assert.match(r.stderr,/deploy-prod/);
    assert.equal(strict('只读',readEntry+'核查是否部署。').status,0);
    r=strict('',entry+'PR 合入后装到 launchd 路径并回读。',['--auth','local-commit']); assert.equal(r.status,1); assert.match(r.stderr,/deploy-prod/);
    r=strict('', ''); assert.equal(r.status,0,r.stderr); assert.match(r.stderr,/缺少动作行/);
    r=strict('推送',entry,['--auth','local-commit']); assert.match(r.stderr.split('\n')[0],/^错误：缺授权块 deploy-prod：.*改用 --auth local-commit,deploy-prod/);
    r=strict('部署',readEntry,['--no-lint']); assert.equal(r.status,1); assert.match(r.stderr,/--auth local-commit,deploy-prod/); assert.match(r.stderr,/可写路径/);
    const f=join(temp,'strict.md'); writeFileSync(f,strict('只读',readEntry).stdout);
    assert.equal(spawnSync(script,['lint',f,'--on','local'],{encoding:'utf8',env}).status,0);
    writeFileSync(f,readFileSync(f,'utf8').replace('动作: 只读','动作: 本地提交'));
    r=spawnSync(script,['lint',f,'--on','local'],{encoding:'utf8',env}); assert.equal(r.status,1); assert.match(r.stderr,/local-commit/);
    assert.equal(spawnSync(script,['lint',f,'--no-lint','--on','local'],{encoding:'utf8',env}).status,1);
  });
  test('默认宽松预览，严格模式和敏感动作仍拒绝', () => {
    const entry = `## 入口\n仓库：${temp}\n`;
    const preview = (name, action, body = entry, strict = false, extra = []) =>
      spawnSync(script, ['new', name, '--to', 'gpt', '--goal', '整理代码', '--dry-run', '--action', action, ...extra],
        {encoding:'utf8', env:{...env,FLEET_STRICT:strict ? '1' : ''}, input:body});
    for (const [name, action] of [['push-lite','推送'], ['write-lite','改代码'], ['free-action','修正类型']]) {
      const r = preview(name, action);
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /可写路径:/);
      assert.equal(preview(name, action, entry, true).status, 1);
      if (action === '推送') assert.match(r.stdout, /授权块：local-commit/);
    }
    const prior = 'prior-lite';
    assert.equal(run(['new',prior,'--to','gpt','--goal','旧任务','--action','只读','--no-launch']).status,0);
    writeFileSync(states, JSON.stringify([{name:prior,status:'done'}]));
    const reused = preview(prior,'改代码');
    assert.equal(reused.status,0,reused.stderr);
    assert.match(reused.stderr, /本次改用 prior-lite-2/);
    writeFileSync(states, JSON.stringify([{name:prior,status:'running'}]));
    assert.match(preview(prior,'改代码').stderr, /同名任务仍未结束/);
    writeFileSync(states, '[]');

    for (const action of ['推送 / 部署', '同步生产数据并写入', '跑付费验证', '删除测试数据', '不部署；删除历史数据']) {
      const r = preview('risk-lite', action);
      assert.equal(r.status, 1, action);
      assert.match(r.stderr, /需要 brief 或调用方明确授权/);
    }
    assert.equal(preview('push-negative','推送 / 不部署').status,0);
    assert.equal(preview('paid-authorized','付费验证',entry,false,['--auth','paid']).status,0);
    assert.equal(preview('delete-authorized','删除测试数据',entry+'## 授权\n允许删除指定测试数据。').status,0);
    const fake = 'abcdefghijklmnopqrstuv';
    const secret = preview('secret-lite','修正类型',entry + 'token=' + fake);
    assert.equal(secret.status,1);
    assert.doesNotMatch(secret.stdout+secret.stderr, new RegExp(fake));
  });
  test('敏感动作全文、授权隔离及规则描述', () => {
    const cases = [
      ['## 背景\n部署生产环境', [], false],
      ['## 背景\n部署本地并上线', [], false],
      ['## 背景\n规则说明：“部署”“付费”“删除数据”属于敏感动作。', [], true],
      ['## 背景\n规则说明：“部署”“付费”属于敏感动作并部署生产环境。', [], false],
      ['## 目标\n执行者收尾并部署生产环境', [], false],
      ['## 目标\n删除测试数据', ['deploy-prod'], false],
      ['## 背景\n保留硬拦（只留这些）：生产/线上数据写入、付费、删数据而 brief 与调用方都没有任何对应授权声明。', [], true],
      ['## 背景\n保留硬拦：生产/线上数据写入、付费、删数据而 brief 与调用方都没有任何对应授权声明；执行者收尾并部署生产环境', [], false],
    ];
    const code = `import sys, runpy, json
sys.path.insert(0, sys.argv[1] + '/src')
m=runpy.run_path(sys.argv[1] + '/src/fleet-go.py')
try:
 m['check_sensitive_actions'](sys.argv[2], json.loads(sys.argv[3]))
except ValueError:
 sys.exit(1)
`;
    for (const [body, auth, allowed] of cases) {
      const r = rawSpawnSync('python3', ['-c', code, root, body, JSON.stringify(auth)], {encoding:'utf8'});
      assert.equal(r.status === 0, allowed, body + r.stderr);
    }
  });
  test('amend say 只检查新增文字', () => {
    const name='amend-sensitive';
    assert.equal(run(['new',name,'--to','gpt','--goal','修复','--action','只读','--no-launch'],{FLEET_STRICT:''}).status,0);
    const file=join(path.slice(0,path.lastIndexOf('/')),name+'.brief.md');
    writeFileSync(file,readFileSync(file,'utf8')+'\n## 旧内容\n删除测试数据\n');
    writeFileSync(states, JSON.stringify([{name,status:'running',runId:'amend-sensitive-run'}]));
    const r=run(['amend',name,'只描述缺陷','--say'],{FLEET_STRICT:''});
    assert.equal(r.status,0,r.stderr);
    const blocked=run(['amend',name,'删除测试数据','--say'],{FLEET_STRICT:''});
    assert.equal(blocked.status,1);
    writeFileSync(states,'[]');
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
    for(const [to,opts,entry] of [['gpt',['--review','--low'],'code'],['grok',['--review','--model','grok-code','--subagents','--type','orchestrate'],'grok-cli'],['gemini',['--bulk'],'bulk']]) {
      const r=run(['new','opts','--to',to,...opts,'--goal','任务','--dry-run']);
      assert.equal(r.status,0,r.stderr); assert.ok(r.stderr.includes('fleet '+entry+' '));
      for(const opt of opts.filter(x=>x.startsWith('--')&&!['--bulk','--type'].includes(x))) assert.ok(r.stderr.includes(opt));
    }
    assert.notEqual(run(['new','missing','--goal','任务','--dry-run']).status,0);
    const old=run(['new','old','--kind','code']); assert.equal(old.status,1); assert.match(old.stderr,/--to/); assert.match(old.stderr,/修改后重跑：fleet-go new/);
    assert.equal(run(['new','bad','--to','gpt','--tier','opus','--goal','任务','--dry-run']).status,1);
  });
  test('simple 两档、组合限制及 relaunch/amend 保留档位', () => {
    const normal = run(['new','normal-mode','--to','gpt','--goal','x','--dry-run']);
    assert.equal(normal.status, 0, normal.stderr);
    assert(normal.stderr.includes('--simple'));
    const simple = run(['new','simple-mode','--to','gpt','--simple','--low','--goal','x','--no-launch']);
    assert.equal(simple.status, 0, simple.stderr);
    const simplePath = join(home,'.agent-fleet/reports', report.split('/').at(-2), 'simple-mode.brief.md');
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
    for (const [name,flags,tier] of [['default-tier',[],'terra'],['sol-tier',['--sol'],'sol'],['luna-tier',['--luna'],'luna'],['astra-tier',['--astra'],'astra']]) {
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
  test('astra 新建、重派、修订与互斥', () => {
    const preview = run(['new','astra-preview','--to','gpt','--astra','--goal','x','--dry-run']);
    assert.equal(preview.status,0,preview.stderr); assert.match(preview.stderr,/gpt-6\.2-astra/); assert.match(preview.stdout,/遇到缺文件、工具不可用等阻碍/);
    for (const option of ['--simple','--sol','--luna']) assert.equal(run(['new','astra-bad','--to','gpt','--astra',option,'--goal','x','--dry-run']).status,1);
    for (const action of ['relaunch','amend']) {
      const cmd = action === 'relaunch' ? [action,'default-tier'] : [action,'default-tier','切换'];
      assert.equal(run([...cmd,'--astra','--sol']).status,1);
      reset(); assert.equal(run([...cmd,'--astra']).status, action === 'relaunch' ? 7 : 0);
    }
    reset(); assert.equal(run(['relaunch','default-tier']).status,7); assert(history().at(-1).args.includes('--astra'));
  });
  test('luna 新建、重派和修订保留模型及冲突限制', () => {
    assert.equal(run(['new','luna-mode','--to','gpt','--luna','--low','--goal','x','--no-launch']).status, 0);
    const metaPath = join(home,'.agent-fleet/reports', report.split('/').at(-2), 'luna-mode.brief.json');
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
      const metaPath = join(home,'.agent-fleet/reports', report.split('/').at(-2), name + '.brief.json');
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
    assert.equal(blocked.status,7,blocked.stderr);assert.match(blocked.stderr,/先查 brief/);
    assert.equal(run(['relaunch','route-relaunch']).status,7);
    const metaPath=join(home,'.agent-fleet/reports',report.split('/').at(-2),'route-relaunch.brief.json');
    const meta=JSON.parse(readFileSync(metaPath,'utf8'));meta.simple=true;meta.tier='terra';writeFileSync(metaPath,JSON.stringify(meta));
    assert.equal(run(['relaunch','route-relaunch']).status,7);
    assert.equal(run(['relaunch','route-relaunch','--luna']).status,7);
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
    const job=(name,path,after)=>[name,'--to','gpt','--on','local','--local-reason','test fixture','--goal',name,'--body',body,'--write',path,'--no-lint',...(after?['--after',after]:[])];
    writeFileSync(manifest,JSON.stringify([job('batch-a',temp+'/a'),job('batch-b',temp+'/a/src')]));
    reset(); let r=run(['batch',manifest,'--dry-run']);
    assert.equal(r.status,1,r.stderr);assert.match(r.stdout,/重叠矩阵/);assert.match(r.stdout,/batch-a - X/);assert.equal(history().length,0);
    writeFileSync(manifest,JSON.stringify([job('batch-a',temp+'/a'),job('batch-b',temp+'/a/src','batch-a')]));
    r=run(['batch',manifest,'--dry-run']);assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/X/);assert.equal(history().length,0);
    r=run(['batch',manifest]);assert.equal(r.status,1,r.stderr); // fake fleet deliberately exits 7
    assert.deepEqual(history().filter(c=>c.args[0]==='code').map(c=>c.args[c.args.indexOf('--name')+1]),['batch-a','batch-b']);
    const aMeta=JSON.parse(readFileSync(join(home,'.agent-fleet/reports',report.split('/').at(-2),'batch-b.brief.json'),'utf8'));
    assert.equal(aMeta.after,'batch-a');assert.deepEqual(aMeta.object.writes,[temp+'/a/src']);
    writeFileSync(manifest,JSON.stringify([job('cycle-a',temp+'/a','cycle-b'),job('cycle-b',temp+'/a','cycle-a')]));
    assert.match(run(['batch',manifest,'--dry-run']).stderr,/循环依赖/);
    const repo=join(temp,'batch-repo'); mkdirSync(repo, {recursive:true});
    spawnSync('git',['init',repo]);
    writeFileSync(body,`## 入口\n仓库: ${repo}\n`);
    writeFileSync(manifest,JSON.stringify([job('tree-a',repo+'/src').concat('--worktree'),job('tree-b',repo+'/src').concat('--worktree')]));
    r=run(['batch',manifest,'--dry-run']); assert.equal(r.status,0,r.stderr); assert.match(r.stdout,/tree-a - \./);
    writeFileSync(manifest,JSON.stringify([job('tree-c',temp+'/shared').concat('--worktree'),job('tree-d',temp+'/shared').concat('--worktree')]));
    r=run(['batch',manifest,'--dry-run']); assert.equal(r.status,1); assert.match(r.stdout,/tree-c - X/);
    writeFileSync(manifest,JSON.stringify([job('disjoint-a',temp+'/a'),job('disjoint-b',temp+'/ab')]));
    assert.equal(run(['batch',manifest,'--dry-run']).status,0);
  });
  test('team 转发底层入口', () => { reset(); assert.equal(run(['team']).status,0); assert.deepEqual(history().at(-1).args,['team']); });
  test('status 提醒 launchDetached 与 wait',()=> {
    state(); const r=run(['status']); assert.equal(r.status,0); assert.match(r.stdout,/⚠/); assert.match(r.stdout,/fleet wait fake-run/);
  });
  test('status 一次 ssh 批量取 Mini：默认非终态加最近 1 小时，--all 全部，失败说明原因',()=> {
    state();
    const records=join(home,'.agent-fleet/mini-runs'); mkdirSync(records,{recursive:true});
    const miniHome=join(temp,'mini-home'), runs=join(miniHome,'.agent-fleet/runs'), miniBin=join(temp,'mini-bin'), counter=join(temp,'mm-count');
    mkdirSync(runs,{recursive:true}); mkdirSync(miniBin,{recursive:true});
    const ago=m=>new Date(Date.now()-m*60000).toISOString();
    const add=(id)=>writeFileSync(join(records,id+'.json'),JSON.stringify({id,name:id,brief:'/b/'+id}));
    const listed=[{runId:'mini-live',status:'running',startedAt:ago(90)},{runId:'mini-listed-old',status:'done',startedAt:ago(300),finishedAt:ago(200)}];
    writeFileSync(join(miniHome,'listed.json'),JSON.stringify(listed));
    writeFileSync(join(miniBin,'fleet'),'#!/bin/sh\ncat "$MINI_LISTED"\n',{mode:0o755});
    writeFileSync(join(runs,'mini-file-recent.json'),JSON.stringify({runId:'mini-file-recent',status:'failed',startedAt:ago(30),finishedAt:ago(5)}));
    writeFileSync(join(runs,'mini-file-old.json'),JSON.stringify({runId:'mini-file-old',status:'done',startedAt:ago(900),finishedAt:ago(800)}));
    for (const id of ['mini-live','mini-listed-old','mini-file-recent','mini-file-old','mini-gone']) add(id);
    for (let i=0;i<300;i++) add('mini-bulk-'+i);
    for (let i=0;i<300;i++) writeFileSync(join(runs,`mini-bulk-${i}.json`),JSON.stringify({runId:'mini-bulk-'+i,status:'done',startedAt:ago(2000),finishedAt:ago(1900)}));
    const mm=join(bin,'fake-mm');
    const opts={FLEET_MINI_MM:mm,FLEET_MINI_BIN:miniBin,FLEET_MINI_STATUS_TIMEOUT:'3',MINI_LISTED:join(miniHome,'listed.json'),MM_COUNT:counter};
    const field=(r,id)=>r.stdout.split('\n').some(l=>l.includes(id));
    try {
      // 假 mm 在 Mini 家目录里本地执行整条命令，并记录调用次数。
      writeFileSync(mm,`#!/bin/sh\necho x >> "$MM_COUNT"\nHOME=${miniHome} exec /bin/sh -c "$1"\n`,{mode:0o755});
      let start=Date.now(), r=run(['status'],opts); assert.equal(r.status,0,r.stderr); assert.ok(Date.now()-start<2000);
      assert.equal(readFileSync(counter,'utf8').trim().split('\n').length,1);
      assert.doesNotMatch(r.stderr,/Mini 状态未取到/); assert.match(r.stdout,/fake-run/);
      assert.ok(field(r,'mini-live')&&field(r,'mini-file-recent')&&field(r,'mini-gone')); // 非终态、最近结束、记录缺失
      assert.ok(!field(r,'mini-listed-old')&&!field(r,'mini-file-old')&&!field(r,'mini-bulk-1'));
      assert.match(r.stdout,/mini-live running .* mini$/m);
      rmSync(counter);
      r=run(['status','--all'],opts); assert.equal(r.status,0,r.stderr);
      assert.equal(readFileSync(counter,'utf8').trim().split('\n').length,1);
      for (const id of ['mini-live','mini-listed-old','mini-file-recent','mini-file-old','mini-bulk-1','mini-bulk-299']) assert.ok(field(r,id),id);
      // 超时：保留本机结果并说明原因。
      writeFileSync(mm,'#!/bin/sh\nsleep 30 &\nexit 0\n',{mode:0o755});
      for (const args of [['status'],['status','--all']]) {
        start=Date.now(); r=spawnSync(script,args,{encoding:'utf8',env:{...env,...opts,FLEET_MINI_STATUS_TIMEOUT:'0.5'},timeout:3000});
        assert.equal(r.status,0,r.stderr); assert.ok(Date.now()-start<3000);
        assert.match(r.stdout,/fake-run/); assert.match(r.stderr,/Mini 状态未取到：超时/); assert.ok(!field(r,'mini-gone'));
      }
      // 连接失败：说明原因，不打印远端输出。
      writeFileSync(mm,'#!/bin/sh\necho secret-detail >&2\nexit 255\n',{mode:0o755});
      r=run(['status'],opts); assert.equal(r.status,0,r.stderr);
      assert.match(r.stderr,/Mini 状态未取到：连接失败/); assert.doesNotMatch(r.stderr,/secret-detail/); assert.match(r.stdout,/fake-run/);
    } finally { rmSync(records,{recursive:true,force:true}); }
  });
  test('源码不包含真实后台化调用', () => {
    const shell=readFileSync(script,'utf8'); assert.doesNotMatch(shell,/&|nohup|setsid|disown/);
    const python=readFileSync(join(root,'src/fleet-go.py'),'utf8');
    assert.doesNotMatch(python,/subprocess\.(?:Popen|run)\([^\n]*(?:shell\s*=\s*True|start_new_session|nohup|setsid|disown)/);
    assert.doesNotMatch(python,/os\.(?:fork|setsid|system)\(/);
    assert.match(python,/os\.execvp\('fleet'/);
  });
  test('worktree relaunch 复用、收尾后提示重建并续做', () => {
    const remote=join(temp,'wt-remote'), repo=join(temp,'wt-repo');
    const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'}); assert.equal(r.status,0,r.stderr);};
    git('init','--bare',remote); git('clone',remote,repo);
    git('-C',repo,'config','user.email','test@example.invalid'); git('-C',repo,'config','user.name','test');
    git('-C',repo,'commit','--allow-empty','-m','initial'); git('-C',repo,'push','-u','origin','HEAD');
    const r=run(['new','wt-test','--to','gpt','--on','local','--goal','test','--write',repo,'--worktree','--no-launch']);
    assert.equal(r.status,0,r.stderr);
    const bp=join(home,'.agent-fleet/reports',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'wt-test.brief.md');
    const body=readFileSync(bp,'utf8'); const meta=JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8'));
    assert.ok(body.includes(meta.worktree.path)); assert.ok(body.includes(meta.worktree.branch)); assert.ok(body.includes('origin/')); assert.ok(body.includes('worktree remove')); assert.ok(body.includes('branch -D'));
    assert.equal(meta.object.writes[0],meta.worktree.path);
    const again=run(['relaunch','wt-test','--worktree']); assert.equal(again.status,7,again.stderr);
    assert.equal(JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8')).worktree.path,meta.worktree.path);
    const pruned = run(['worktree', 'prune', 'wt-test']);
    assert.equal(pruned.status, 0, pruned.stderr);
    assert.ok(!existsSync(meta.worktree.path));
    const oldBrief = readFileSync(bp, 'utf8');
    let follow = run(['amend', 'wt-test', '续做一项', '--say']);
    assert.equal(follow.status, 1);
    assert.match(follow.stderr, /worktree recreate/);
    assert.equal(readFileSync(bp, 'utf8'), oldBrief);
    let rebuilt = run(['worktree', 'recreate', 'wt-test']);
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    assert.ok(existsSync(meta.worktree.path));
    assert.ok(readFileSync(bp, 'utf8').includes(meta.worktree.branch + '-2'));
    follow = run(['amend', 'wt-test', '续做一项', '--say']);
    assert.equal(follow.status, 7, follow.stderr);
    assert.match(readFileSync(bp, 'utf8'), /续做一项/);
    rebuilt = run(['worktree', 'recreate', 'wt-test']);
    assert.equal(rebuilt.status, 1);
    assert.match(rebuilt.stderr, /路径已存在/);

    const manual = join(temp, 'wt-ops', 'manual-tree');
    const manualBody = join(temp, 'manual-tree.md');
    writeFileSync(manualBody, `## 入口\n仓库: ${repo}\n可写路径: ${manual}\n`);
    const handMade = run(['new', 'manual-tree', '--to', 'gpt', '--body', manualBody, '--no-launch']);
    assert.equal(handMade.status, 0, handMade.stderr);
    follow = run(['amend', 'manual-tree', '继续修文档', '--say']);
    assert.equal(follow.status, 1);
    assert.match(follow.stderr, /worktree recreate.*--base/);
    rebuilt = run(['worktree', 'recreate', 'manual-tree', '--base', meta.worktree.base]);
    assert.equal(rebuilt.status, 0, rebuilt.stderr);
    assert.ok(existsSync(manual));
    follow = run(['amend', 'manual-tree', '继续修文档', '--say']);
    assert.equal(follow.status, 7, follow.stderr);
  });
  test('relaunch 按改过的 --body 更新正文并保留修订；旧单不能自动换就大声拒绝', () => {
    const bodyFile=join(temp,'refresh.body.md'); writeFileSync(bodyFile,'旧正文 A\n');
    let r=run(['new','refresh','--to','gpt','--auth','local','--goal','g','--body',bodyFile,'--no-launch']); assert.equal(r.status,0,r.stderr);
    const bp=r.stdout.match(/已生成：(.+)/)[1].trim();
    assert.equal(run(['amend','refresh','修订甲']).status,0);
    writeFileSync(bodyFile,'新正文 B\n仓库: /tmp\n');
    reset(); r=run(['relaunch','refresh']); assert.equal(r.status,7,r.stderr); assert.match(r.stdout,/已按 .*refresh\.body\.md 更新 brief 正文/);
    const text=readFileSync(bp,'utf8'); assert.match(text,/新正文 B/); assert.doesNotMatch(text,/旧正文 A/); assert.match(text,/修订 1（[^\n]+）】\n修订甲/); assert.match(text,/^对象: \{"repo": "\/tmp"/m);
    assert.equal(history().at(-1).args[0],'code');
    r=run(['relaunch','refresh']); assert.equal(r.status,7); assert.doesNotMatch(r.stdout,/更新 brief 正文/);
    // 换班重派：缺思维准则的旧 brief 自动补上，已有的不重复。
    writeFileSync(bp,readFileSync(bp,'utf8').replace(/## 思维准则[\s\S]*?\n\n(?=对象:)/,'')); assert.doesNotMatch(readFileSync(bp,'utf8'),/思维准则/);
    r=run(['relaunch','refresh']); assert.equal(r.status,7,r.stderr); assert.equal((readFileSync(bp,'utf8').match(/## 思维准则（每单首要/g)||[]).length,1);
    writeFileSync(bp, readFileSync(bp,'utf8').replace('新正文 B', '已手改正文'));
    writeFileSync(bodyFile,'下一版正文');
    const bodyFuture = new Date(Date.now() + 1000);
    utimesSync(bodyFile, bodyFuture, bodyFuture);
    r=run(['relaunch','refresh']); assert.equal(r.status,1); assert.match(r.stderr,/无法自动换进/);
    assert.match(r.stderr, /--keep-brief/);
    r=run(['relaunch','refresh','--keep-brief']); assert.equal(r.status,7,r.stderr);
    assert.match(readFileSync(bp,'utf8'), /已手改正文/);
    // 旧任务：没有正文快照，同目录 <name>.body.md 比 brief 新时拒绝并给出下一步命令。
    const meta=JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8')); delete meta.body; delete meta.body_text;
    writeFileSync(bp.replace(/\.md$/,'.json'),JSON.stringify(meta)); const legacyBody=bp.replace(/\.brief\.md$/,'.body.md');
    writeFileSync(legacyBody,'改过的正文'); const later=new Date(Date.now()+5000); utimesSync(legacyBody,later,later);
    r=run(['relaunch','refresh']); assert.equal(r.status,1); assert.match(r.stderr,/比 brief 新/); assert.match(r.stderr,/--keep-brief/);
    utimesSync(bp,new Date(Date.now()+10000),new Date(Date.now()+10000)); assert.equal(run(['relaunch','refresh']).status,7);
    rmSync(legacyBody);
  });
  test('跨日期重名给出可复制的路径命令，路径可直接 relaunch', () => {
    const bp=join(home,'.agent-fleet/reports',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'refresh.brief.md');
    const old=join(home,'.agent-reports','2000-01-01'); mkdirSync(old,{recursive:true});
    writeFileSync(join(old,'refresh.brief.md'),readFileSync(bp,'utf8')); writeFileSync(join(old,'refresh.brief.json'),readFileSync(bp.replace(/\.md$/,'.json'),'utf8'));
    let r=run(['relaunch','refresh']); assert.equal(r.status,1); assert.ok(r.stderr.includes('fleet-go relaunch '+bp),r.stderr);
    reset(); r=run(['relaunch',bp]); assert.equal(r.status,7,r.stderr); assert.ok(history().at(-1).args.includes('refresh'));
    rmSync(old,{recursive:true,force:true});
  });
  test('worktree 以入口仓库为准：cwd 和 --write 不在 git 仓库也能建', () => {
    const remote=join(temp,'wt2-remote'), repo=join(temp,'wt2-repo'), outside=join(temp,'wt2-out'); mkdirSync(outside);
    const git=(...args)=>{const r=spawnSync('git',args,{encoding:'utf8'}); assert.equal(r.status,0,r.stderr);};
    git('init','--bare',remote); git('clone',remote,repo);
    git('-C',repo,'config','user.email','test@example.invalid'); git('-C',repo,'config','user.name','test');
    git('-C',repo,'commit','--allow-empty','-m','initial'); git('-C',repo,'push','-u','origin','HEAD');
    const r=spawnSync(script,['new','wt-entry','--to','gpt','--on','local','--goal','t','--write',outside,'--worktree','--no-launch','--no-lint'],{encoding:'utf8',env,cwd:outside,input:`## 入口\n仓库: ${repo}\n可写路径: ${repo}/src\n`});
    assert.equal(r.status,0,r.stderr);
    const bp=join(home,'.agent-fleet/reports',new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'}),'wt-entry.brief.md');
    const meta=JSON.parse(readFileSync(bp.replace(/\.md$/,'.json'),'utf8')); const text=readFileSync(bp,'utf8');
    assert.ok(existsSync(meta.worktree.path)); assert.match(meta.worktree.path,/wt2-repo-wt\/wt-entry$/);
    assert.ok(text.includes('仓库: '+meta.worktree.path)); assert.ok(text.includes('可写路径: '+meta.worktree.path+'/src'));
    assert.deepEqual(meta.worktree.writes,['src']);
  });
  test('拒绝落账四阶段，队列拒绝后同命令换正文可用，报告目录与巡检时窗不撞', () => {
    const orderFile = join(temp, 'gate-order.md'), rejects = join(temp, 'gate-rejects.jsonl');
    const runs = join(temp, 'gate-runs'), scripts = join(temp, 'gate-bin');
    mkdirSync(scripts); mkdirSync(runs);
    writeFileSync(orderFile, '| 全局 | 停用 | 用户另说 | fixture |\n');
    const fixture = { ...env, AGENT_FLEET_ORDER_FILE: orderFile, AGENT_FLEET_GATE_REJECTS: rejects,
      AGENT_FLEET_RUNS_DIR: runs, PATH: scripts + ':' + env.PATH };
    const invoke = (args, input = '') => spawnSync(script, args, { encoding: 'utf8', env: fixture, input });
    const badOrder = invoke(['new','reject-order','--to','gpt','--goal','x']);
    assert.equal(badOrder.status,1); assert.match(badOrder.stderr,/调遣令拒绝/);
    writeFileSync(orderFile, '| 全局 | 正常 | 用户另说 | |\n');
    const badLint = invoke(['new','reject-lint','--to','gpt','--goal','x','--action','改代码']);
    assert.equal(badLint.status,1); assert.match(badLint.stderr,/入口缺少仓库/);
    const hook = rawSpawnSync('python3',[join(root,'hooks/check-fleet-launch.py')], { encoding:'utf8',env:fixture,
      input:JSON.stringify({tool_input:{command:'fleet-go new reject-hook --to gpt --goal x'}}) });
    assert.equal(JSON.parse(hook.stdout).hookSpecificOutput.permissionDecision,'deny');
    writeFileSync(join(scripts,'fleet'), `#!${process.execPath}
(async()=>{
  const {registerQueue,setSlotState}=await import(${JSON.stringify(new URL('../src/queue.mjs',import.meta.url).href)});
  const {readFileSync}=require('node:fs');
  const briefPath=process.argv[3], name=process.argv[5];
  const meta=JSON.parse(readFileSync(briefPath.replace(/\\.md$/,'.json')));
  if(meta.paths.some(p=>p.endsWith('/optional-missing'))) throw Error('instruction path became required');
  await registerQueue({runId:meta.attemptId,name,briefPath,model:'test'});
  await setSlotState(meta.attemptId,'done');
})().catch(e=>{console.error(e.message);process.exit(1)});
`, {mode:0o755});
    const body = join(temp,'retry-body.md');
    const shared = join(home,'.agent-fleet/reports');
    const repo = join(temp,'wt2-repo');
    const base = `## 入口\n仓库: ${repo}\n可写路径: ${shared}\n可选目录 \`${repo}/optional-missing\`\n`;
    writeFileSync(body, base);
    const retry = ['new','retry-same','--to','gpt','--goal','goal','--body',body,'--after','prerequisite'];
    const rejected = invoke(retry); assert.equal(rejected.status,1,rejected.stderr); assert.match(rejected.stderr,/找不到前置单/);
    assert.equal(invoke(['new','prerequisite','--to','gpt','--goal','prerequisite'],base).status,0);
    writeFileSync(body, base + '修订正文明细');
    const retried = invoke(retry); assert.equal(retried.status,0,retried.stderr);
    const score = invoke(['score','--fault-window','--since','2000-01-01','--until','2999-01-01']);
    assert.equal(score.status,0,score.stderr);
    assert.match(score.stdout,/拒绝落账覆盖阶段：4\/4/);
    for(const metric of ['判定与 outcome','无进展续做停机','部分完成','涉及报告路径','示例 dry-run','快照巡检部分完成']) assert.ok(score.stdout.includes(metric));
    const rows = readFileSync(rejects,'utf8').trim().split('\n').map(JSON.parse);
    assert.deepEqual(rows.map(row=>row.stage),['order','lint','launch-hook','queue']);
    assert.equal(new Set(rows.map(row=>row.attemptId)).size,4);
    const cmd = name => ['new',name,'--to','gpt','--scene','snapshot-patrol','--goal','固定巡检'];
    const one = invoke(cmd('snapshot-one'), base + '时间窗: 08:00–08:30\n');
    const two = invoke(cmd('snapshot-two'), base + '时间窗: 08:30–09:00\n');
    assert.equal(one.status,0,one.stderr); assert.equal(two.status,0,two.stderr);
    const same = invoke(cmd('snapshot-duplicate'),base+'时间窗: 08:30–09:00\n');
    assert.equal(same.status,1); assert.match(same.stderr,/fleet say/);
    const preview = invoke(['new','preview-worktree','--to','gpt','--worktree','--dry-run','--goal','x'],base);
    assert.equal(preview.status,0,preview.stderr);
    assert.match(preview.stderr,/将准备工作树/); assert.match(preview.stderr,/样板占比/);
    assert.ok(!existsSync(repo+'-wt/preview-worktree'));
    for (const [role, flags] of Object.entries({
      terra: [], sol: ['--sol'], astra: ['--astra'], luna: ['--luna'],
      review: ['--review', '--sol'], orchestrator: ['--type', 'orchestrate', '--sol'],
    })) {
      const render = invoke(['new', 'preview-' + role, '--to', 'gpt', '--dry-run', '--goal', 'x', ...flags], base);
      assert.equal(render.status, 0, render.stderr);
      for (const model of ['terra', 'sol', 'astra', 'review', 'orchestrator']) {
        const sentence = readFileSync(join(root, 'skill/templates/blocks/model-' + model + '.md'), 'utf8').trim();
        assert.equal(render.stdout.split(sentence).length - 1, Number(role === model));
      }
    }
  });
  console.log(`fleet-go：${checks} 组通过。`);
} finally { rmSync(temp,{recursive:true,force:true}); }
