// 调遣令:order show/set/clear、派单闸门(new/relaunch)、额度类失败自动记账(order auto、run 结束钩子、Mini 派单机路径)。
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const script = join(root, 'bin/fleet-go');
const temp = mkdtempSync(join(tmpdir(), 'fleet-order-test-'));
const home = join(temp, 'home'), bin = join(temp, 'bin'), repo = join(temp, 'cfg');
mkdirSync(join(home, '.claude'), { recursive: true });
mkdirSync(bin); mkdirSync(repo);
const rule = readFileSync(join(root, 'skill/templates/blocks/rule-sentence.md'), 'utf8').trim();
writeFileSync(join(home, '.claude/CLAUDE.md'), rule);
const calls = join(temp, 'calls.jsonl');
writeFileSync(join(bin, 'fleet'), `#!${process.execPath}\nconst a = process.argv.slice(2);\nif (a[0] === 'status') { console.log('[]'); process.exit(0); }\nrequire('fs').appendFileSync(process.env.CALLS, JSON.stringify({args: a})+'\\n'); process.exit(7);\n`, { mode: 0o755 });
const orderFile = join(repo, 'dispatch-order.md');
const seed = `# 调遣令

说明段落,改令时必须原样保留。

| 执行者 | 状态 | 有效至 | 原因与用户原话 |
|---|---|---|---|
| codex | 停用 | 用户另说 | 用户:“别用 codex”|
| openai-api | 正常 | 用户另说 | |
| claude-sub | 优先 | 用户另说 | 用户:“用 subagent 优先做” |
| claude-api | 正常 | 用户另说 | |
| grok | 正常 | 用户另说 | |
| gemini | 正常 | 用户另说 | 仍只做文案 |
| jev | 正常 | 用户另说 | |
| 全局 | 正常 | 用户另说 | |

表后的文字也要保留。
`;
const env = { ...process.env, HOME: home, PATH: bin + ':' + process.env.PATH, CALLS: calls, FLEET_DEFAULT_ON: 'local', AGENT_FLEET_ORDER_FILE: orderFile,
  GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid', GIT_CONFIG_GLOBAL: '/dev/null' };
const sh = (cmd, args, extra = {}) => spawnSync(cmd, args, { encoding: 'utf8', env: { ...env, ...extra }, input: '' });
const go = (args, extra = {}) => spawnSync(script, args, { encoding: 'utf8', env: { ...env, ...extra }, input: 't' });
const git = (...args) => sh('git', ['-C', repo, ...args]);
const reset = () => writeFileSync(orderFile, seed);
const resetCodexFree = () => writeFileSync(orderFile, seed.replace('| codex | 停用 | 用户另说 |', '| codex | 正常 | 用户另说 |'));
const calledFleet = () => existsSync(calls) && readFileSync(calls, 'utf8').trim().length > 0;
const clearCalls = () => writeFileSync(calls, '');
const text = () => readFileSync(orderFile, 'utf8');
const row = executor => text().split('\n').find(l => l.startsWith(`| ${executor} |`)) ?? '';
const day = n => new Date(Date.now() + n * 86400000).toISOString();
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('PASS - ' + name); }

git('init', '-q'); reset(); clearCalls();
git('add', 'dispatch-order.md'); git('commit', '-q', '-m', 'seed');
writeFileSync(join(repo, 'other.txt'), '别人未提交的改动');

await test('show:列出生效的令、当前优先;过期的令忽略并提示可清理', () => {
  let r = go(['order', 'show']); assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /- 停用 codex（有效至 用户另说）/); assert.match(r.stdout, /- 优先 claude-sub/); assert.match(r.stdout, /当前优先：claude-sub/);
  assert.match(r.stdout, /- 正常 gemini：仍只做文案/);
  writeFileSync(orderFile, seed.replace('| grok | 正常 | 用户另说 |', '| grok | 停用 | 2020-01-01T00:00+08:00 |'));
  r = go(['order', 'show']);
  assert.match(r.stdout, /过期忽略 grok 停用.*已到重置时间，已恢复，可清理/); assert.doesNotMatch(r.stdout, /- 停用 grok/);
  reset();
});

await test('set/clear:只改一行、其余原文保留、只提交这一个文件;未知执行者与状态报错', () => {
  const before = git('rev-list', '--count', 'HEAD').stdout.trim();
  let r = go(['order', 'set', 'grok', '省着用', '--until', '+3d', '--reason', '用户 2026-11-13：“grok 省着用|只做视频”']); assert.equal(r.status, 0, r.stderr);
  assert.match(row('grok'), /^\| grok \| 省着用 \| 20\d\d-\d\d-\d\dT\d\d:\d\d[+-]\d\d:\d\d \| 用户 2026-11-13：“grok 省着用\\\|只做视频” \|$/);
  assert.ok(text().includes('说明段落,改令时必须原样保留。') && text().includes('表后的文字也要保留。'));
  assert.equal(text().split('\n').filter(l => l.startsWith('| ')).length, 9);
  assert.equal(Number(git('rev-list', '--count', 'HEAD').stdout.trim()), Number(before) + 1);
  assert.equal(git('show', '--name-only', '--format=', 'HEAD').stdout.trim(), 'dispatch-order.md');
  assert.match(git('status', '--porcelain').stdout, /other\.txt/);
  r = go(['order', 'set', 'gpt', '停用']); assert.equal(r.status, 0, r.stderr); assert.match(row('codex'), /^\| codex \| 停用 \| 用户另说 \|/);
  r = go(['order', 'clear', 'grok']); assert.equal(r.status, 0, r.stderr); assert.match(row('grok'), /^\| grok \| 正常 \| 用户另说 \| 已清除/);
  assert.equal(go(['order', 'set', 'nobody', '停用']).status, 1);
  assert.equal(go(['order', 'set', 'grok', '停用', '--until', '明天']).status, 1);
  assert.equal(go(['order', 'set', 'grok', '睡觉']).status, 2);
  reset();
});

await test('闸门:停用拒绝并列出优先执行者、override 放行写偏差、--dry-run 同样拦', () => {
  clearCalls();
  let r = go(['new', 'g1', '--to', 'gpt', '--goal', 'x', '--no-lint']);
  assert.equal(r.status, 1); assert.match(r.stderr, /调遣令拒绝：codex 当前「停用」.*别用 codex/s); assert.match(r.stderr, /当前优先的执行者：claude-sub/); assert.match(r.stderr, /--override-order/);
  assert.ok(!calledFleet());
  r = go(['new', 'g1', '--to', 'gpt', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 1); assert.match(r.stderr, /调遣令拒绝/);
  r = go(['new', 'g1', '--to', 'gpt', '--goal', 'x', '--dry-run', '--no-lint', '--override-order', '紧急窗口，用户已知']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /调遣令偏差：codex 当前「停用」.*--override-order 放行，理由：紧急窗口，用户已知/s);
  r = go(['new', 'g1', '--to', 'grok', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stderr, /调遣令/);
});

await test('闸门:省着用只警告、优先/正常照常、全局停用拦所有、过期放行', () => {
  writeFileSync(orderFile, seed.replace('| grok | 正常 | 用户另说 | |', '| grok | 省着用 | 用户另说 | 只给视频和 X |'));
  let r = go(['new', 'g2', '--to', 'grok', '--goal', 'x', '--dry-run', '--no-lint']);
  assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /警告：调遣令把 grok 设为「省着用」.*只给视频和 X/);
  r = go(['new', 'g2', '--to', 'gemini', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 0); assert.doesNotMatch(r.stderr, /调遣令/);
  writeFileSync(orderFile, seed.replace('| 全局 | 正常 | 用户另说 | |', '| 全局 | 停用 | 用户另说 | 冻结所有派单 |'));
  r = go(['new', 'g2', '--to', 'gemini', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 1); assert.match(r.stderr, /全局 当前「停用」.*冻结所有派单/);
  writeFileSync(orderFile, seed.replace('| codex | 停用 | 用户另说 |', '| codex | 停用 | 2020-01-01T00:00+08:00 |'));
  r = go(['new', 'g2', '--to', 'gpt', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stderr, /调遣令/);
  reset();
});

await test('闸门:文件缺失或无法解析只警告不阻断', () => {
  writeFileSync(orderFile, '没有表格，只有一句话\n');
  let r = go(['new', 'g3', '--to', 'gpt', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /警告：调遣令读取失败.*照常派单/);
  r = go(['new', 'g3', '--to', 'gpt', '--goal', 'x', '--dry-run', '--no-lint'], { AGENT_FLEET_ORDER_FILE: join(temp, 'absent.md') });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stderr, /警告：调遣令文件不存在.*照常派单/);
  r = go(['order', 'show'], { AGENT_FLEET_ORDER_FILE: join(temp, 'absent.md') }); assert.equal(r.status, 0); assert.match(r.stdout, /文件不存在/);
  reset();
});

await test('relaunch 同样拦停用;override 放行并把理由带进 brief 与元信息', () => {
  clearCalls();
  let r = go(['new', 'rl', '--to', 'grok', '--goal', 'x', '--no-launch', '--no-lint']); assert.equal(r.status, 0, r.stderr);
  const brief = r.stdout.match(/已生成：(.+)/)[1];
  r = go(['relaunch', 'rl', '--to', 'gpt']); assert.equal(r.status, 1); assert.match(r.stderr, /调遣令拒绝：codex/); assert.ok(!calledFleet());
  r = go(['relaunch', 'rl', '--to', 'gpt', '--override-order', '用户点名']); assert.equal(r.status, 7, r.stderr); assert.ok(calledFleet());
  assert.match(readFileSync(brief, 'utf8'), /调遣令偏差：.*理由：用户点名/);
  assert.equal(JSON.parse(readFileSync(brief.replace(/\.md$/, '.json'), 'utf8')).order_override, '用户点名');
});

const grokText = 'Error: Internal error: {\n  "message": "API error (status 402 Payment Required): Grok Build usage balance exhausted",\n  "http_status": 402\n}';
await test('脱敏:Bearer、api_key=、sk- 开头和长随机串都被遮掉', () => {
  const r = sh('python3', ['-I', '-c', `import sys; sys.path.insert(0, ${JSON.stringify(join(root, 'src'))}); import order; print(order.scrub('Authorization: Bearer abc.def-123 api_key=sk-secret-value-123456 token: zzzz1234 sk-abcdefgh12345 ${'A'.repeat(40)}'))`]);
  assert.equal(r.status, 0, r.stderr); assert.doesNotMatch(r.stdout, /abc\.def|secret-value|zzzz1234|abcdefgh|AAAAAAAA/); assert.match(r.stdout, /REDACTED/);
});
const auto = (info, extra = {}) => spawnSync(script, ['order', 'auto'], { encoding: 'utf8', env: { ...env, ...extra }, input: JSON.stringify(info) });

await test('自动记账:Grok 402 → 停用到估计的重置时间，原因带 run 名/时间/脱敏摘要/估计标记', () => {
  const r = auto({ runId: 'r-grok', name: 'fix-card', route: 'grok-cli:grok-4.7', finishedAt: '2026-11-13T06:05:00Z', text: grokText });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /已记入调遣令：grok 停用/);
  const line = row('grok');
  assert.match(line, /^\| grok \| 停用 \| 20\d\d-\d\d-\d\dT/); assert.match(line, /自动：fix-card 2026-11-13 \d\d:05 报/); assert.match(line, /usage balance exhausted/); assert.match(line, /重置时间估计：按周重置估计/);
  const until = Date.parse(line.split(' | ')[2]); assert.ok(until > Date.now() + 6 * 86400000 && until < Date.now() + 8 * 86400000);
  assert.match(git('log', '-1', '--format=%s').stdout, /^chore\(order\): 自动停用 grok 至 /);
  assert.equal(git('show', '--name-only', '--format=', 'HEAD').stdout.trim(), 'dispatch-order.md');
  // 同一个 run 再报一次不重复提交
  const count = git('rev-list', '--count', 'HEAD').stdout.trim();
  assert.match(auto({ runId: 'r-grok', name: 'fix-card', route: 'grok-cli:grok-4.7', finishedAt: '2026-11-13T06:05:00Z', text: grokText }).stdout, /未改/);
  assert.equal(git('rev-list', '--count', 'HEAD').stdout.trim(), count);
  const show = go(['order', 'show']).stdout; assert.match(show, /- 停用 grok（有效至 20\d\d-/);
  // 到重置时间后:show 提示恢复、闸门放行
  writeFileSync(orderFile, text().replace(/\| grok \| 停用 \| [^|]+\|/, '| grok | 停用 | 2020-01-01T00:00+08:00 |'));
  assert.match(go(['order', 'show']).stdout, /过期忽略 grok 停用.*已到重置时间，已恢复，可清理/);
  const gate = go(['new', 'ag', '--to', 'grok', '--goal', 'x', '--dry-run', '--no-lint']); assert.equal(gate.status, 0, gate.stderr); assert.doesNotMatch(gate.stderr, /调遣令/);
  reset();
});

await test('自动记账:resetsAt / Retry-After / 用量记录取准确时间;Claude 402 取下月初;OpenAI 无自动重置', () => {
  const at = Math.floor(Date.now() / 1000) + 3 * 86400;
  resetCodexFree();
  auto({ runId: 'r1', name: 'c1', route: 'gpt-6.1-terra', text: `You've hit your usage limit.\n{"rateLimits":{"primary":{"usedPercent":100,"resetsAt":${at}}}}` });
  assert.equal(Date.parse(row('codex').split(' | ')[2]) / 1000, Math.floor(at / 60) * 60); assert.match(row('codex'), /重置时间取自错误信息里的重置字段/); assert.doesNotMatch(row('codex'), /估计/);
  auto({ runId: 'r6', name: 'o2', route: 'openai-gpt-terra', text: 'rate_limit insufficient_quota Retry-After: 7200' });
  const retry = Date.parse(row('openai-api').split(' | ')[2]); assert.ok(retry > Date.now() + 7000_000 && retry < Date.now() + 7400_000); assert.match(row('openai-api'), /重置时间取自错误信息里的重置字段/);
  resetCodexFree();
  auto({ runId: 'r2', name: 'c2', route: 'gpt-6-luna', text: 'usage limit reached', codexQuota: { usedPercent: 100, resetsAt: at + 3600 } });
  assert.equal(Date.parse(row('codex').split(' | ')[2]) / 1000, Math.floor((at + 3600) / 60) * 60); assert.match(row('codex'), /Codex 用量记录 resetsAt/);
  reset();
  auto({ runId: 'r3', name: 'a1', route: 'claude-sonnet', text: '调用 Claude Agent SDK 失败: Claude Code returned an error result: Credit balance is too low' });
  const now = new Date(), nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  assert.equal(Date.parse(row('claude-api').split(' | ')[2]), nextMonth); assert.match(row('claude-api'), /^\| claude-api \| 停用 \|.*重置时间估计：按每月 1 日/);
  reset();
  auto({ runId: 'r4', name: 'o1', route: 'openai-gpt-terra', text: '{"error":{"code":"insufficient_quota","message":"You exceeded your current quota"}}' });
  assert.match(row('openai-api'), /^\| openai-api \| 停用 \| 用户另说 \|/); assert.match(row('openai-api'), /没有自动重置/);
  reset();
  auto({ runId: 'r5', name: 'g1', route: 'kollab-gateway-copy', finishedAt: '2026-11-13T06:05:00Z', text: 'HTTP 402 usage budget exceeded' });
  const hour = Date.parse(row('gemini').split(' | ')[2]);
  assert.ok(hour % 3600000 === 0 && hour > Date.now() && hour <= Date.now() + 3600000); assert.match(row('gemini'), /^\| gemini \| 停用 \|.*按网关下一整点/);
  reset();
});

await test('自动记账:不是额度类/瞬时限流/并发 429 不记;人工停用不被覆盖;人工省着用被升级且保留原令', () => {
  const before = text();
  assert.match(auto({ runId: 'n1', name: 'n1', route: 'kollab-gateway-copy', text: 'HTTP 429 workspace concurrent request limit' }).stdout, /不是额度类/);
  assert.match(auto({ runId: 'n2', name: 'n2', route: 'grok-cli:grok-4.7', text: '测试失败：expected 402 files, got 3' }).stdout, /不是额度类/);
  assert.match(auto({ runId: 'n3', name: 'n3', route: 'openai-gpt-terra', text: 'insufficient_quota retry-after: 30' }).stdout, /不是额度类/);
  assert.match(auto({ runId: 'n4', name: 'n4', route: 'mock', text: 'usage limit' }).stdout, /不是额度类/);
  assert.equal(text(), before);
  assert.match(auto({ runId: 'n5', name: 'n5', route: 'gpt-6.1-sol', text: 'usage limit reached' }).stdout, /未改/); // codex 人工停用
  assert.equal(text(), before);
  writeFileSync(orderFile, seed.replace('| grok | 正常 | 用户另说 | |', '| grok | 省着用 | 用户另说 | 只给视频 |'));
  assert.match(auto({ runId: 'n6', name: 'n6', route: 'grok-cli:grok-4.7', text: grokText }).stdout, /已记入/);
  assert.match(row('grok'), /^\| grok \| 停用 .*原令：省着用（只给视频），重置后请重新确认 \|$/);
  reset();
});

await test('run 结束钩子:ledger 写入失败 run 时自动记调遣令;Mini 上的 run 不在此处记', async () => {
  const keys = ['AGENT_FLEET_LEDGER', 'AGENT_FLEET_ORDER_FILE', 'HOME', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL', 'GIT_CONFIG_GLOBAL'];
  const saved = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  Object.assign(process.env, { ...Object.fromEntries(keys.filter(k => env[k]).map(k => [k, env[k]])), AGENT_FLEET_LEDGER: join(temp, 'ledger.jsonl') });
  try {
    const { recordRun } = await import('../src/ledger.mjs');
    const log = join(temp, 'run.log'); writeFileSync(log, 'Error: Internal error: API error (status 402 Payment Required): Grok Build usage balance exhausted\n');
    const rec = { runId: 'h1', name: 'hook-run', detach: true, status: 'failed', verdict: 'fail', model: 'grok-cli:grok-4.7', startedAt: '2026-11-13T05:00:00Z', finishedAt: '2026-11-13T05:01:00Z', logPath: log, error: 'Grok 退出码 1' };
    process.env.FLEET_MACHINE = 'mini'; recordRun({ ...rec, runId: 'h0' });
    assert.match(row('grok'), /\| 正常 \|/);
    delete process.env.FLEET_MACHINE; recordRun(rec);
    assert.match(row('grok'), /^\| grok \| 停用 \| 20\d\d-.*自动：hook-run 2026-11-13 \d\d:01 报/);
  } finally {
    for (const k of keys) saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k]);
    delete process.env.FLEET_MACHINE;
  }
  reset();
});

await test('派单机路径:Mini run 失败结束,mini.record_quota_order 读 Mini 日志尾后记账', () => {
  const py = `import sys, json, subprocess
sys.path.insert(0, ${JSON.stringify(join(root, 'src'))})
import mini
mini.call = lambda script, payload, timeout=30, kill_group=False: subprocess.CompletedProcess([], 0, stdout=json.dumps({'text': 'API error (status 402 Payment Required): Grok Build usage balance exhausted', 'codexQuota': None}), stderr='')
mini.record_quota_order({'id': 'm1', 'name': 'mini-job'}, {'verdict': 'fail', 'status': 'failed', 'model': 'grok-cli:grok-4.7', 'resultPath': '/x/m1.result.md', 'finishedAt': '2026-11-13T05:01:00Z'})
mini.call = lambda *a, **k: (_ for _ in ()).throw(OSError('boom'))
mini.record_quota_order({'id': 'm2', 'name': 'x'}, {'verdict': 'fail', 'status': 'failed', 'model': 'grok-cli:grok-4.7', 'resultPath': '/x/m2.result.md'})
mini.record_quota_order({'id': 'm3', 'name': 'ok'}, {'verdict': 'ok', 'status': 'done', 'model': 'grok-cli:grok-4.7'})`;
  const r = sh('python3', ['-I', '-c', py]); assert.equal(r.status, 0, r.stderr);
  assert.match(row('grok'), /^\| grok \| 停用 .*自动：mini-job 2026-11-13 \d\d:01 报/);
  reset();
});

console.log(`\n调遣令测试全部通过(${checks} 组)。`);
