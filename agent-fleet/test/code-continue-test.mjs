// 假 app-server 验证同线程续做，不调用真实 Codex 或付费服务。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCode } from '../src/code-runner.mjs';
import { CONTINUE_PROMPT, readContinuationState, continuationProgress, continuationRules, judgeContinuation } from '../src/code-continue.mjs';
import { buildBrief, formatBriefHuman, redactEvidence } from '../src/brief.mjs';
import { splitShortArgs } from '../src/shortcuts.mjs';

const scratch = `/tmp/fleet-continue-gate/test-${process.pid}`;
mkdirSync(scratch, { recursive: true });
const saved = { ...process.env };
const mock = join(scratch, 'codex-mock.cjs');
writeFileSync(mock, `#!/usr/bin/env node
const fs = require('node:fs');
let count = 0;
const send = obj => process.stdout.write(JSON.stringify(obj) + '\\n');
process.on('SIGINT', () => process.exit(0));
require('node:readline').createInterface({input: process.stdin}).on('line', line => {
 const req = JSON.parse(line);
 fs.appendFileSync(process.env.TRACE, line + '\\n');
 if (req.method === 'thread/start') send({id:req.id,result:{thread:{id:'same-thread'}}});
 else if (req.method === 'turn/start') {
  const id = 'turn-' + ++count;
  send({id:req.id,result:{turn:{id}}});
  send({method:'turn/started',params:{turn:{id}}});
  setTimeout(() => {
   const mode = process.env.MODE;
   const conclusion = mode === 'finish' && count > 1 || mode.startsWith('judge-') || mode === 'complete' || mode === 'missing-sections' ? '完成' : mode === 'fail' ? '失败' : '部分完成';
   let report = '# 测试\\n## 规则回执\\n测试\\n## 实际执行\\n测试\\n## 改动与产物\\n测试\\n## 验证证据\\n测试\\n## 偏差\\n无\\n## 结论\\n' + conclusion + '。\\n## 未完成/风险/需要用户决定的事\\n' + (mode === 'progress' ? count : '待办');
   if (mode === 'missing-sections' || (['finish', 'stuck', 'progress', 'env-off'].includes(mode) && !(mode === 'finish' && count > 1))) report = '## 结论\\n' + conclusion + (mode === 'progress' ? count : '');
   fs.writeFileSync(process.env.REPORT_FILE, report);
   send({method:'item/completed',params:{item:{type:'agentMessage',phase:'final_answer',text:conclusion}}});
   send({method:'turn/completed',params:{turn:{id,status:'completed'}}});
  }, 5);
 } else if (req.id !== undefined) send({id:req.id,result:{}});
});
`);
chmodSync(mock, 0o755);
try {
  process.env.AGENT_FLEET_RUNS_DIR = scratch;
  delete process.env.FLEET_CODEX_BACKEND;
  delete process.env.FLEET_NO_CONTINUE;
  assert.equal(splitShortArgs(['--no-continue', 'brief.md']).flags['no-continue'], true);
  for (const [mode, options, expected] of [
    ['finish', {}, 1], ['complete', {}, 0], ['fail', {}, 0],
    ['missing-sections', {}, 2], ['judge-done', {}, 0], ['judge-missing', {}, 2], ['judge-low', {}, 0], ['judge-fail', {}, 0], ['judge-throw', {}, 0],
    ['stuck', {}, 2], ['progress', {}, 3], ['stuck', { review: true }, 0],
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
    const result = await runCode({ continuationJudge, prompt: `REPORT: ${process.env.REPORT_FILE}\n测试`, cwd: scratch, codexBin: mock, ...options });
    assert.equal(result.continueCount, expected, mode);
    assert.equal(result.continuation.length, expected, mode);
    const trace = readFileSync(process.env.TRACE, 'utf8').trim().split('\n').map(JSON.parse);
    const starts = trace.filter(event => event.method === 'turn/start');
    assert.equal(starts.length, expected + 1);
    assert(starts.every(event => event.params.threadId === 'same-thread'));
    assert(starts.slice(1).every(event => /具体缺项/.test(event.params.input[0].text) || event.params.input[0].text === CONTINUE_PROMPT));
    if (mode === 'judge-missing') assert.match(starts[1].params.input[0].text, /缺少 brief 要求的文件/);
    if (mode.startsWith('judge-')) assert(result.continuationChecks.every(check => check.judge));
    const brief = buildBrief(result);
    assert.equal(brief.verdict, mode === 'fail' ? 'fail' : ['finish', 'complete', 'judge-done', 'judge-low', 'judge-fail', 'judge-throw'].includes(mode) || options.review ? 'ok' : 'partial');
    assert.match(formatBriefHuman(brief), new RegExp(`续做 ${expected} 次`));
    assert.match(readFileSync(result.resultPath, 'utf8'), new RegExp(`续做 ${expected} 次`));
    if (mode === 'stuck' && expected === 2) {
      assert(result.continuation.every(step => !step.progress));
      assert.match(result.continueStop, /连续两次续做无进展/);
    }
    if (mode === 'progress') {
      assert(result.continuation.every(step => step.progress && step.report));
      assert.match(result.continueStop, /最多 3 次/);
    }
  }
  process.env.MODE = 'missing-sections';
  process.env.TRACE = join(scratch, 'document.trace');
  const documentRun = await runCode({ prompt: `归类：Codex 文档任务\nREPORT: ${process.env.REPORT_FILE}\n## 目标\n更新文档`, cwd: scratch, codexBin: mock });
  assert.equal(documentRun.continueCount, 0);
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
  const missing = continuationRules({ conclusion: '完成', report: '## 结论\n完成' }, '给出提交哈希和读回结果');
  assert(missing.some(item => item.includes('规则回执')));
  assert(missing.some(item => item.includes('提交哈希')));
  assert(missing.some(item => item.includes('实际读回')));
  assert.deepEqual(continuationRules({ conclusion: '失败', report: '' }, '提交哈希'), []);
  assert.deepEqual(continuationRules({ conclusion: '完成', report: '## 规则回执\n## 结论\n## 实际执行\n## 改动与产物\nabcdef123\n## 验证证据\n读回结果：通过\n## 偏差\n## 未完成/风险/需要用户决定的事' }, '给出提交哈希和读回结果'), []);
  const completeReport = { conclusion: '完成', report: ['规则回执', '结论', '实际执行', '改动与产物', '验证证据', '偏差', '未完成/风险/需要用户决定的事'].map(section => `## ${section}\n完成`).join('\n') };
  const style = readFileSync(new URL('../skill/templates/blocks/style-sol.md', import.meta.url), 'utf8');
  assert.deepEqual(continuationRules(completeReport, style + '\n验收：本地测试通过。不提交、不部署。'), []);
  assert.deepEqual(continuationRules(completeReport, style + '\n要求不提交哈希，无需读回结果。'), []);
  assert(continuationRules(completeReport, style + '\n验收：报告必须给出提交哈希和读回结果。').some(item => item.includes('提交哈希')));
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
    const decision = await judgeContinuation({ brief: '验收：交付文件', report: '', finalReply: '', judge: async () => ({ ok: true, answers: { deliverable: { choice, confidence: 0.9 } } }) });
    assert.equal(decision.decision, 'continue');
  }
  assert.deepEqual(continuationRules({ ...completeReport, conclusion: '部分完成' }, '覆盖未穷尽，还可补证'), []);
  const localBrief = '## 授权覆盖\n本块不含 git 写操作\n## 验收\n产物清单：\n- 报告：report.md\n报告列出本地提交哈希';
  writeFileSync(join(scratch, 'report.md'), 'ok');
  assert.deepEqual(continuationRules(completeReport, localBrief, scratch), []);
  const commitBrief = '## 授权覆盖\n允许在本地分支提交。\n## 目标\n实现代码';
  const initial = { head: 'abc', files: 'unchanged' };
  assert(continuationRules({ ...completeReport, ...initial, files: 'other-change', conclusion: '未完成', report: completeReport.report + '\n基线 abcdef123' }, commitBrief, scratch, initial).some(x => x.includes('实现改动')));
  assert.equal(buildBrief({ok:true, result:'未完成', reportConclusion:'未完成'}).verdict, 'partial');
  assert(!continuationRules({ ...completeReport, ...initial, head: 'def', conclusion: '部分完成', report: completeReport.report + '\nabcdef123' }, commitBrief, scratch, initial).some(x => x.includes('实现改动')));
  assert(continuationRules(completeReport, '产物清单：\n- 报告：missing.md（上限 2 KB）\n', scratch).some(item => item.includes('missing.md')));
  const low = await judgeContinuation({ brief: '覆盖未穷尽', report: '', finalReply: '', judge: async () => ({ ok: true, answers: { deliverable: { choice: 'file', confidence: 0.4 } } }) });
  assert.equal(low.decision, 'done');
  // 同一路径内容变化、提交、报告分别都能打破无进展计数。
  const repo = join(scratch, 'repo'); mkdirSync(repo);
  const git = args => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  git(['init']); git(['config', 'user.email', 'test@example.invalid']); git(['config', 'user.name', 'test']);
  writeFileSync(join(repo, 'file'), 'a'); git(['add', '.']); git(['commit', '-m', 'fixture']);
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
  console.log('PASS - 部分完成同线程续做、终态/开关/review 跳过、连续两次无进展停止、三次上限与进展记录');
} finally {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
  rmSync(scratch, { recursive: true, force: true });
}
