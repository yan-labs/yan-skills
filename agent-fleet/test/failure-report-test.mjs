import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { judgeTask } from '../src/judge-task.mjs';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { attachArtifacts, buildBrief, formatBriefHuman } from '../src/brief.mjs';
import { runCode } from '../src/code-runner.mjs';
import { runGrok } from '../src/grok-runner.mjs';
const dir = mkdtempSync(join(tmpdir(), 'fleet-failure-'));
const prior = process.env.AGENT_FLEET_RUNS_DIR;
process.env.AGENT_FLEET_RUNS_DIR = dir;
process.env.FLEET_TEST_SECRET = 'private-secret-fixture';
try {
  const failed = attachArtifacts({ ok: false, model: 'claude', tier: 'sonnet', error: 'HTTP 402', httpStatus: 402,
    stderr: `${Array.from({ length: 25 }, (_, i) => `line-${i}`).join('\n')}\napi_key=private-secret-fixture`,
    errorObject: { error: { code: 'insufficient_quota', detail: 'private-secret-fixture' } },
    progress: { phase: 'SDK 执行', tool: 'Read', detail: 'private-secret-fixture' }, result: '完成了读取' },
    join(dir, 'failed.log'), { newCommits: [], hasUncommittedChanges: true });
  const brief = buildBrief(failed);
  assert.equal(brief.verdict, 'fail');
  assert.equal(brief.failureReport.executor, 'claude');
  assert.equal(brief.failureReport.tier, 'sonnet');
  assert.equal(brief.failureReport.httpStatus, 402);
  assert.equal(brief.failureReport.progress.phase, 'SDK 执行');
  assert.equal(brief.failureReport.dirty, true);
  assert.equal(brief.failureReport.artifacts.resultPath, failed.resultPath);
  assert.equal(brief.failureReport.errorObject.error.code, 'insufficient_quota');
  assert(!brief.failureReport.stderr.includes('line-0\n'));
  for (const output of [JSON.stringify(failed), formatBriefHuman(brief), readFileSync(failed.resultPath, 'utf8')]) {
    assert(!output.includes('private-secret-fixture'));
    assert(output.includes('[REDACTED]'));
  }
  assert.equal(buildBrief({ ok: false, subtype: 'error_max_turns', hasUncommittedChanges: true }).verdict, 'fail');
  const success = attachArtifacts({ ok: true, model: 'gpt', result: '完成' }, join(dir, 'success.log'), {});
  assert(!('failureReport' in success));
  assert(!('failureReport' in buildBrief(success)));
  assert.equal(readFileSync(success.resultPath, 'utf8'), '完成');
  const missing = await runCode({ prompt: '不发请求', cwd: dir, codexBin: join(dir, 'missing') });
  assert.equal(missing.failureReport.errorObject.code, 'ENOENT');
  assert.equal(missing.failureReport.tier, 'medium');
  assert(readFileSync(missing.resultPath, 'utf8').includes('失败事实'));
  const grok = join(dir, 'grok');
  const calls = join(dir, 'calls');
  writeFileSync(grok, `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\nif [ "$1" = models ]; then printf 'Default model: fixture-model\\n'; exit 0; fi\nprintf 'partial output\\n'\nprintf 'HTTP 402 api_key=private-secret-fixture\\n' >&2\nexit 1\n`);
  chmodSync(grok, 0o755);
  const gr = await runGrok({ prompt: '不发请求', cwd: dir, grokBin: grok });
  assert.equal(gr.ok, false);
  assert.equal(gr.failureReport.tier, 'fixture-model');
  assert(gr.failureReport.stderr.includes('HTTP 402'));
  assert(!JSON.stringify(gr).includes('private-secret-fixture'));
  assert.equal(readFileSync(calls, 'utf8').trim().split('\n').length, 2);
  assert(!existsSync(join(dir, 'retry')));
  const configPath = join(dir, 'jev.config.json');
  const statePath = join(dir, 'state.txt');
  const questionsPath = join(dir, 'questions.json');
  const reportPath = join(dir, 'jev-report.md');
  writeFileSync(configPath, JSON.stringify({ jev: { protocol: 'typesafe-systemone', authHeader: 'bearer-raw', baseURL: 'https://example.invalid', model: 'test-jev', apiKeyEnv: 'FLEET_ABSENT_TEST_KEY' } }));
  writeFileSync(statePath, '分类材料');
  writeFileSync(questionsPath, JSON.stringify({ decision: { type: 'noul', instructions: '是否需要处理' } }));
  const env = { ...process.env }; delete env.FLEET_ABSENT_TEST_KEY;
  const jr = spawnSync(process.execPath, ['bin/agent-fleet.mjs', 'judge', statePath, questionsPath, '--models-config', configPath, '--report', reportPath, '--json'], { encoding: 'utf8', env });
  assert.equal(jr.status, 1);
  assert(jr.stdout.trim(), jr.stderr);
  const jb = JSON.parse(jr.stdout);
  assert.equal(jb.verdict, 'fail');
  assert.equal(jb.failureReport.executor, 'jev');
  assert.equal(jb.failureReport.artifacts.resultPath, reportPath);
  assert(readFileSync(reportPath, 'utf8').includes('failureReport'));
  const oldFetch = globalThis.fetch;
  const oldKey = process.env.FLEET_JUDGE_STUB_KEY;
  process.env.FLEET_JUDGE_STUB_KEY = 'local-test-only';
  try {
    globalThis.fetch = async () => ({ ok: false, status: 402, text: async () => JSON.stringify({ error: { code: 'fixture-error' } }) });
    const result = await judgeTask({ friendlyModel: 'jev', state: '材料', questions: { decision: { type: 'noul', instructions: '是否处理' } }, config: { jev: { protocol: 'typesafe-systemone', authHeader: 'bearer-raw', baseURL: 'https://example.invalid', model: 'test', apiKeyEnv: 'FLEET_JUDGE_STUB_KEY' } } });
    assert.equal(result.httpStatus, 402);
    assert.equal(result.errorObject.error.code, 'fixture-error');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKey === undefined) delete process.env.FLEET_JUDGE_STUB_KEY; else process.env.FLEET_JUDGE_STUB_KEY = oldKey;
  }
  console.log('failure-report: failure facts, redaction, runner stubs, no retries, success isolation passed');
} finally {
  delete process.env.FLEET_TEST_SECRET;
  if (prior === undefined) delete process.env.AGENT_FLEET_RUNS_DIR;
  else process.env.AGENT_FLEET_RUNS_DIR = prior;
  rmSync(dir, { recursive: true, force: true });
}
