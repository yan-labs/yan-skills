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

finish();
