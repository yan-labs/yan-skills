#!/usr/bin/env node
// 收件箱解析、pid 校验、子进程树计算的纯函数单测。不起 SDK、不发网、不发真实信号。

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAsserter } from './assert-helper.mjs';
import {
  parseInboxLine,
  readInboxSince,
  createPromptStream,
  createUserMessage,
} from '../src/inbox.mjs';
import {
  parsePidPpidTable,
  collectDescendantPids,
  assertSafeToSignal,
  commandLooksLikeAgentFleet,
  runIdFromLogPath,
  runIdFromPidFilename,
  latestLiveRunIdFrom,
  resolveLatestRunId,
  LATEST_MISS,
  sameCwd,
  normalizeCwd,
  writePidRecord,
} from '../src/pid.mjs';
import { deliverSay } from '../src/control.mjs';
import { computeVerdict } from '../src/verdict.mjs';
import { DEFAULT_EXECUTOR_SYSTEM_PROMPT, wallClockDurationMs } from '../src/run-task.mjs';
import { buildBrief } from '../src/brief.mjs';

const { assert, finish } = createAsserter('control 单测');

assert(parseInboxLine('') === null, '空行 → null');
assert(parseInboxLine('not json') === null, '非法 JSON → null');
assert(parseInboxLine(JSON.stringify({ type: 'ping' })) === null, '未知 type → null');
{
  const say = parseInboxLine(JSON.stringify({ type: 'say', text: '改计划', at: '2026-09-26T00:00:00.000Z' }));
  assert(say?.type === 'say' && say.text === '改计划', '合法 say 解析');
}
{
  const stop = parseInboxLine(JSON.stringify({ type: 'stop', text: '', at: 't', grace: 20 }));
  assert(stop?.type === 'stop' && stop.grace === 20, '合法 stop 带 grace');
}

{
  const isolated = mkdtempSync(join(tmpdir(), 'fleet-codex-say-'));
  const previous = process.env.AGENT_FLEET_RUNS_DIR;
  process.env.AGENT_FLEET_RUNS_DIR = isolated;
  try {
    const base = { pid: process.pid, model: 'gpt-6.1-sol', finished: false, cwd: isolated };
    writePidRecord('codex-starting', { ...base, backend: 'codex-app-server' });
    assert(deliverSay('codex-starting', '只写到 3').mode === 'steer', 'Codex app-server 初始化期间可排队插话');
    assert(readInboxSince(join(isolated, 'codex-starting.inbox'), 0, '').entries[0]?.text === '只写到 3', 'Codex say 保留原始指令');
    writePidRecord('codex-exec', { ...base, backend: 'codex-exec', threadId: 'thread-1' });
    assert(deliverSay('codex-exec', '继续').mode === 'resume', 'Codex exec 有 threadId 时允许续会话插话');
    writePidRecord('codex-legacy', base);
    let failure = '';
    try { deliverSay('codex-legacy', '继续'); } catch (err) { failure = err.message; }
    assert(failure.includes('--restart'), '没有会话的 Codex 旧记录提示 restart');
    writePidRecord('codex-done', { ...base, backend: 'codex-app-server', finished: true });
    try { deliverSay('codex-done', '继续'); } catch (err) { failure = err.message; }
    assert(failure.includes('已不在运行'), 'Codex 终态禁止插话');
  } finally {
    if (previous === undefined) delete process.env.AGENT_FLEET_RUNS_DIR;
    else process.env.AGENT_FLEET_RUNS_DIR = previous;
    rmSync(isolated, { recursive: true, force: true });
  }
}

const dir = mkdtempSync(join(tmpdir(), 'agent-fleet-inbox-'));
try {
  const path = join(dir, 'x.inbox');
  writeFileSync(path, `${JSON.stringify({ type: 'say', text: 'one', at: 'a' })}\n${JSON.stringify({ type: 'say', text: 'two', at: 'b' })}\npartial`);
  const first = readInboxSince(path, 0, '');
  assert(first.entries.length === 2 && first.entries[0].text === 'one' && first.entries[1].text === 'two', '按行读出两条完整记录');
  assert(first.leftover === 'partial', '不完整行留在 leftover');
  const second = readInboxSince(path, first.offset, first.leftover);
  assert(second.entries.length === 0 && second.leftover === 'partial', '没有新字节时 leftover 保持');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

{
  const msg = createUserMessage('hello');
  assert(msg.type === 'user' && msg.message.role === 'user' && msg.message.content === 'hello' && msg.parent_tool_use_id === null, 'SDKUserMessage 形状');
}

{
  const stream = createPromptStream('first');
  const it = stream[Symbol.asyncIterator]();
  const a = await it.next();
  assert(a.done === false && a.value.message.content === 'first', '流的首条是原 prompt');
  stream.push('插话');
  const b = await it.next();
  assert(b.value.message.content === '插话' && b.value.priority === 'now', 'push 后下一条是插话且 priority=now');
  stream.close();
  const c = await it.next();
  assert(c.done === true, 'close 后 iterator 结束');
}

const table = parsePidPpidTable(`
  10  1
  20  10
  21  10
  30  20
  99  2
`);
assert(table.length === 5 && table[0].pid === 10 && table[0].ppid === 1, '解析 ps pid,ppid 表');
{
  const kids = collectDescendantPids(10, table).sort((x, y) => x - y);
  assert(kids.join(',') === '20,21,30', '递归收集子孙,不含根自身、不含旁支');
}
assert(collectDescendantPids(99, table).length === 0, '叶子节点没有子孙');

assert(commandLooksLikeAgentFleet('node bin/agent-fleet.mjs run --model x'), 'command 含 agent-fleet');
assert(!commandLooksLikeAgentFleet('node some-other-tool'), '无关进程不含 agent-fleet');
assert(assertSafeToSignal({}).ok === false, '没有 pid 不能发信号');
assert(assertSafeToSignal({ pid: 1 }).ok === false, 'pid 1 通常不是 agent-fleet,拒绝');

assert(runIdFromLogPath('/tmp/runs/2026-09-26T00-00-00-000Z-mock.log') === '2026-09-26T00-00-00-000Z-mock', '从日志路径还原 run-id');
assert(runIdFromPidFilename('abc.pid.json') === 'abc', '从 pid 文件名还原 run-id');

assert(computeVerdict({ ok: false, stopped: true, result: '进度' }).verdict === 'stopped', 'stopped 优先于其它 verdict');
assert(
  DEFAULT_EXECUTOR_SYSTEM_PROMPT.includes('绝不 kill / pkill / killall 任何不是你自己启动的进程'),
  '默认执行者提示含防误杀句',
);

{
  const alive = () => true;
  const mine = '/tmp/agent-fleet-cwd-a';
  const theirs = '/tmp/agent-fleet-cwd-b';
  const records = [
    {
      runId: 'older-mine',
      pid: 11,
      cwd: mine,
      finished: false,
      startedAt: '2026-09-26T00:00:00.000Z',
    },
    {
      runId: 'newer-theirs',
      pid: 22,
      cwd: theirs,
      finished: false,
      startedAt: '2026-09-26T00:01:00.000Z',
    },
    {
      runId: 'newer-mine',
      pid: 33,
      cwd: `${mine}/`,
      finished: false,
      startedAt: '2026-09-26T00:00:30.000Z',
    },
    {
      runId: 'dead-mine',
      pid: 44,
      cwd: mine,
      finished: true,
      startedAt: '2026-09-26T00:02:00.000Z',
    },
  ];
  assert(
    latestLiveRunIdFrom(records, { cwd: mine, isAlive: alive }) === 'newer-mine',
    'latest 只匹配给定 cwd 里最近存活任务,不取全局更新的别人的任务',
  );
  assert(
    latestLiveRunIdFrom(records, { cwd: theirs, isAlive: alive }) === 'newer-theirs',
    'latest --cwd 指向别人目录时才命中别人的任务',
  );
  let miss = null;
  try {
    resolveLatestRunId(records, { cwd: '/tmp/agent-fleet-cwd-none', isAlive: alive });
  } catch (err) {
    miss = err.message;
  }
  assert(miss === LATEST_MISS, '当前目录匹配不到 latest 时报错并提示用 status,不回退全局');
  assert(sameCwd(mine, `${mine}/`), 'cwd 比较走 realpath/resolve 规范化,尾斜杠视为同一目录');
}

assert(wallClockDurationMs(1000, 34300) === 33300, '墙钟 duration = now - startedAt');
assert(wallClockDurationMs('bad', 10) === 0, '非法 startedAt 墙钟为 0');
{
  const brief = buildBrief({
    ok: true,
    result: 'done',
    durationMs: 34000,
    sdkDurationMs: 9122,
    subtype: 'success',
  });
  assert(brief.durationMs === 34000, '简报 duration 取墙钟 durationMs,不是 SDK 最后一段');
  assert(brief.sdkDurationMs === 9122, 'SDK duration 另起 sdkDurationMs 字段');
}

// Land uses real disposable git repositories, local bare remotes and fake team pipelines.
{
  const { land } = await import('../src/land.mjs');
  const { execFileSync } = await import('node:child_process');
  const { mkdirSync, readFileSync, existsSync } = await import('node:fs');
  const { localCondition, writeYield } = await import('../src/yield.mjs');
  const root = mkdtempSync(join(tmpdir(), 'fleet-land-test-'));
  const previous = process.env.AGENT_FLEET_RUNS_DIR;
  process.env.AGENT_FLEET_RUNS_DIR = join(root, 'runs');
  const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const cli = join(import.meta.dirname || new URL('.', import.meta.url).pathname, '..', 'bin', 'agent-fleet.mjs');
  try {
    for (const kind of ['kollab-test', 'nextspace-test']) {
      const dir = join(root, kind); mkdirSync(dir);
      const repo = join(dir, 'main'), remote = join(dir, 'remote.git');
      git(dir, 'init', '--bare', remote); git(dir, 'clone', remote, repo);
      git(repo, 'checkout', '-b', 'test'); writeFileSync(join(repo, 'base'), 'base');
      git(repo, 'add', '.'); git(repo, 'commit', '-m', 'base'); git(repo, 'push', 'origin', 'test');
      const base = git(repo, 'rev-parse', 'HEAD'), commits = [];
      for (const name of ['good-a', 'bad', 'good-c']) {
        git(repo, 'checkout', '-b', name, base); writeFileSync(join(repo, name), name);
        git(repo, 'add', '.'); git(repo, 'commit', '-m', name); commits.push(git(repo, 'rev-parse', 'HEAD'));
      }
      git(repo, 'checkout', 'test');
      const hook = join(dir, 'adapter.mjs'), config = join(dir, 'runtime.json'), calls = join(dir, 'calls.jsonl');
      writeFileSync(hook, `import {readFileSync,appendFileSync,existsSync} from 'node:fs';
        import {execFileSync} from 'node:child_process';
        let raw='';for await(const c of process.stdin)raw+=c;const c=JSON.parse(raw);
        appendFileSync(${JSON.stringify(calls)},JSON.stringify(c)+'\\n');
        if(c.phase==='check'&&existsSync(c.cwd+'/bad')){console.error('bad candidate');process.exit(1)}
        if(c.phase==='push') execFileSync('git',['push',c.remote,'HEAD:refs/heads/'+c.branch],{cwd:c.repo});
        if(c.phase==='verify') { const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:c.repo,encoding:'utf8'}).trim();if(sha!==c.candidate)process.exit(2); }
        console.log(c.phase==='pipeline'?'team-pipeline-1':'ok');`);
      const cfg = { kind, repo, env: 'test', branch: 'test', expectedHead: base, runningCommit: base,
        push: [process.execPath, hook], check: [process.execPath, hook], pipeline: [process.execPath, hook], verify: [process.execPath, hook] };
      writeFileSync(config, JSON.stringify({ adapters: [cfg] }));
      if (kind === 'kollab-test') {
        const missingPush = {...cfg}; delete missingPush.push;
        writeFileSync(config, JSON.stringify({adapters:[missingPush]}));
        let error = '';
        try { await land({repo,env:'test',flush:true,config}); } catch(e) { error = e.message; }
        assert(error.includes('push') && !existsSync(calls), 'Kollab requires explicit private push protocol before any mutation');
        writeFileSync(config, JSON.stringify({adapters:[cfg]}));
      }
      for (let i = 0; i < commits.length; i++) {
        const result = JSON.parse(execFileSync(process.execPath, [cli, 'land', '--repo', repo, '--env', 'test', '--commit', commits[i], '--run', `${kind}-${i}`], { encoding: 'utf8' }));
        assert(result.status === 'queued', `${kind} register ${i} queues without publishing`);
      }
      await land({ repo, env: 'test', commit: commits[0], run: `${kind}-0` });
      assert((await land({ repo, env: 'test', status: true })).pending.length === 3, `${kind} duplicate registration is idempotent`);
      assert(!existsSync(calls), `${kind} three registrations trigger no pipeline`);
      const result = await land({ repo, env: 'test', flush: true, config });
      assert(result.status === 'done' && result.accepted?.length === 2 && result.rejected.length === 1, `${kind} rejects bad commit and lands two good members`);
      const latePark = writeYield(`${kind}-0`, {type:'park',until:`land:${result.key}`,say:'continue',timeout:'1m'});
      assert((await localCondition(latePark.until, {id:`${kind}-0`,entry:latePark,cwd:repo}))?.batchId === result.id, `${kind} completion before park is consumed by registration`);
      const events = readFileSync(calls, 'utf8').trim().split('\n').map(JSON.parse);
      assert(events.filter(c => c.phase === 'push').length === 1, `${kind} private push hook runs exactly once`);
      assert(events.find(c => c.phase === 'push')?.base === base && events.find(c => c.phase === 'push')?.candidate === result.candidate, `${kind} push hook receives expected base and candidate`);
      assert(events.filter(c => c.phase === 'pipeline').length === 1, `${kind} batch triggers exactly one team pipeline`);
      assert(events.find(c => c.phase === 'pipeline').trigger === (kind === 'nextspace-test'), `${kind} respects push-trigger versus explicit Jenkins trigger`);
      assert(existsSync(join(repo, 'good-a')) && existsSync(join(repo, 'good-c')) && !existsSync(join(repo, 'bad')), `${kind} final environment contains only good changes`);
      assert(git(repo, 'rev-parse', 'HEAD') === git(remote, 'rev-parse', 'test'), `${kind} main clone and remote environment branch readback agree`);
      const wake = await localCondition(`land:${result.key}`, { id: `${kind}-1`, entry: { at: 0 }, cwd: repo });
      assert(wake?.status === 'failed' && existsSync(wake.logPath), `${kind} bad member receives failure wake and log`);
      assert((await localCondition(`land:${result.key}`, { id: `${kind}-0`, entry: { at: 0 }, cwd: repo }))?.status === 'done', `${kind} good member receives success wake`);
      const count = events.length;
      assert((await land({ repo, env: 'test', flush: true, config })).status === 'empty' && readFileSync(calls, 'utf8').trim().split('\n').length === count, `${kind} empty flush never repeats pipeline`);
      await land({ repo, env: 'test', run: `${kind}-0` });
      assert(await localCondition(latePark.until, {id:`${kind}-0`,entry:latePark,cwd:repo}) === null, `${kind} new registration cannot consume previous batch result`);
      const candidate = await land({ repo, env: 'production', run: `${kind}-prod` });
      assert(candidate.status === 'candidate-only', `${kind} production records candidate only`);
      let error;
      try { await land({ repo, env: 'production', flush: true, config }); } catch (e) { error = e.message; }
      assert(error?.includes('生产仅登记'), `${kind} production flush refused before mutation`);
      // Preserve dirty/staged edits, and require an updated coordinator snapshot.
      await land({ repo, env: 'test', run: `${kind}-dirty` });
      writeFileSync(join(repo, 'personal'), 'keep'); git(repo, 'add', 'personal');
      const before = git(repo, 'status', '--porcelain');
      const dirty = await land({ repo, env: 'test', flush: true, config });
      assert(dirty.status === 'failed' && git(repo, 'status', '--porcelain') === before && readFileSync(join(repo, 'personal'), 'utf8') === 'keep', `${kind} refuses dirty clone and preserves staged edits`);
      assert(git(repo, 'worktree', 'list', '--porcelain').match(/worktree /g).length === 1, `${kind} candidate worktree cleaned up`);
      git(repo, 'reset', '--hard', 'HEAD');
      process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'drift-runs');
      await land({ repo, env: 'test', run: `${kind}-drift` });
      const drift = await land({ repo, env: 'test', flush: true, config });
      assert(drift.status === 'failed' && drift.error.includes('枢纽快照'), `${kind} stale coordinator snapshot stops before push/pipeline`);
      const candidateHead = git(repo, 'rev-parse', 'HEAD');
      cfg.expectedHead = candidateHead; cfg.runningCommit = candidateHead;
      git(repo,'checkout','-b','recovery-candidate',candidateHead);
      writeFileSync(join(repo,'recovery-change'),'new candidate'); git(repo,'add','.'); git(repo,'commit','-m','unpublished candidate');
      const recoveryCommit = git(repo,'rev-parse','HEAD'); git(repo,'checkout','test');
      const movedHead = git(remote,'commit-tree',`${candidateHead}^{tree}`,'-p',candidateHead,'-m','concurrent remote commit');
      const normalPush = cfg.push;
      for (const moveRemote of [false, true, 'local-edit']) {
        process.env.AGENT_FLEET_RUNS_DIR = join(dir, `refused-${moveRemote}-runs`);
        cfg.expectedHead = git(repo, 'rev-parse', 'HEAD'); cfg.runningCommit = cfg.expectedHead;
        cfg.push = [process.execPath, '-e', moveRemote === 'local-edit'
          ? `require('node:fs').writeFileSync(${JSON.stringify(join(repo,'concurrent-edit'))},'keep');console.error('permission denied');process.exit(1)`
          : moveRemote
          ? `const {execFileSync:g}=require('node:child_process');g('git',['update-ref','refs/heads/test',${JSON.stringify(movedHead)}],{cwd:${JSON.stringify(remote)}});console.error('remote moved');process.exit(1)`
          : 'console.error("permission denied");process.exit(1)'];
        writeFileSync(config, JSON.stringify({adapters:[cfg]}));
        await land({repo,env:'test',commit:recoveryCommit,run:`refused-${moveRemote}`});
        const refused = await land({repo,env:'test',flush:true,config});
        if (moveRemote === 'local-edit') {
          assert(refused.status === 'failed' && !refused.recoveredHead && readFileSync(join(repo,'concurrent-edit'),'utf8') === 'keep' && refused.recoveryCommands.length === 5, `${kind} concurrent edits preserved with executable recovery argv`);
          rmSync(join(repo,'concurrent-edit'));
          git(repo,'checkout','--detach'); git(repo,'branch','-f','test',cfg.expectedHead); git(repo,'checkout','test');
        } else assert(refused.status === 'failed' && git(repo,'rev-parse','HEAD') === git(remote,'rev-parse','test') && !git(repo,'status','--porcelain'), `${kind} rejected push restores clean local test to current remote (${moveRemote})`);
        assert(git(repo,'rev-parse',refused.recoveryRef) === refused.candidate, `${kind} rejected candidate preserved by recovery ref (${moveRemote})`);
        assert(git(remote,'rev-parse','test') === (moveRemote ? movedHead : candidateHead), `${kind} rejected private hook never falls back to direct push (${moveRemote})`);
      }
      // Restore only the disposable remote/fixture to the last successful head.
      git(remote,'update-ref','refs/heads/test',candidateHead);
      git(repo,'checkout','--detach'); git(repo,'branch','-f','test',candidateHead); git(repo,'checkout','test');
      cfg.expectedHead = candidateHead; cfg.runningCommit = candidateHead; cfg.push = normalPush;
      cfg.pipeline = [process.execPath, '-e', 'console.error("pipeline failed");process.exit(1)'];
      writeFileSync(config, JSON.stringify({ adapters: [cfg] }));
      process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'failed-pipeline-runs');
      await land({ repo, env: 'test', run: `${kind}-pipeline-fail` });
      const failed = await land({ repo, env: 'test', flush: true, config });
      assert(failed.status === 'failed' && failed.error.includes('pipeline failed'), `${kind} team pipeline failure is never reported done`);
      await land({ repo, env: 'test', run: `${kind}-no-replay` });
      error = '';
      try { await land({ repo, env: 'test', flush: true, config }); } catch (e) { error = e.message; }
      assert(error.includes('上批发布未确认'), `${kind} failed pipeline cannot be automatically replayed`);
      if (kind === 'nextspace-test') {
        const alternate = join(dir, 'alternate');
        git(repo, 'worktree', 'add', '-b', 'old-test', alternate, base);
        git(repo, 'checkout', '--detach'); git(alternate, 'checkout', 'test');
        cfg.repo = alternate; writeFileSync(config, JSON.stringify({ adapters: [cfg] }));
        process.env.AGENT_FLEET_RUNS_DIR = join(dir, 'alternate-runs');
        await land({ repo: alternate, env: 'test', run: 'alternate-test' });
        const refused = await land({ repo: alternate, env: 'test', flush: true, config });
        assert(refused.status === 'failed' && refused.error.includes('主克隆'), 'nextspace refuses environment merge from linked worktree');
        git(repo, 'worktree', 'remove', '--force', alternate);
      }
      process.env.AGENT_FLEET_RUNS_DIR = join(root, 'runs');

    }
  } finally {
    if (previous === undefined) delete process.env.AGENT_FLEET_RUNS_DIR;
    else process.env.AGENT_FLEET_RUNS_DIR = previous;
    rmSync(root, { recursive: true, force: true });
  }
}

finish();
