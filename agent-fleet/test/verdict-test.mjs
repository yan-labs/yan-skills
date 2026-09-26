#!/usr/bin/env node
// verdict / 控制 token / 简报生成的纯函数单测。不起 SDK、不发网。

import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { createAsserter } from './assert-helper.mjs';
import { computeVerdict, hasControlTokens, looksLikeSkillIntro, isEmptyResult } from '../src/verdict.mjs';
import {
  buildBrief,
  previewLines,
  resultPathFromLog,
  snapshotGit,
  inspectGit,
  formatBriefJson,
  formatBriefHuman,
  maybeJudge,
  DEFAULT_BRIEF_LINES,
} from '../src/brief.mjs';

const { assert, finish } = createAsserter('verdict/brief 单测');

assert(hasControlTokens('<|tool_calls_section_begin|> foo'), '检测 <|tool_calls_section_begin|>');
assert(hasControlTokens('x <|tool_call_begin|> y'), '检测 <|tool_call_begin|>');
assert(hasControlTokens('<minimax:tool_call>'), '检测 <minimax:tool_call>');
assert(hasControlTokens('prefix <tool_call> suffix'), '检测 <tool_call>');
assert(!hasControlTokens('正常完成,写了 hello.txt'), '正常文本不含控制 token');

assert(looksLikeSkillIntro('## 核心命令\nrun --model'), '检测 ## 核心命令');
assert(looksLikeSkillIntro('什么时候用 / 什么时候不用'), '检测 什么时候用');
assert(looksLikeSkillIntro('本 Skill 用于派发任务'), '检测 本 Skill');
assert(!looksLikeSkillIntro('已创建 hello.txt 并提交'), '任务结果不像介绍');
assert(isEmptyResult('') && isEmptyResult('  \n') && isEmptyResult(null), '空结果判定');

assert(
  computeVerdict({ ok: true, result: 'done', subtype: 'success' }).verdict === 'ok',
  '成功且有回复 → ok',
);
assert(
  computeVerdict({ ok: false, result: 'x <|tool_call_begin|> y', subtype: 'success' }).verdict === 'fail',
  '控制 token → fail(即使其它字段看起来成功)',
);
assert(
  computeVerdict({ ok: true, result: '', subtype: 'success' }).verdict === 'fail',
  '空结果 → fail',
);
assert(
  computeVerdict({ ok: false, error: 'SDK 挂了' }).verdict === 'fail',
  '报错 → fail',
);
assert(
  computeVerdict({
    ok: false,
    subtype: 'error_max_turns',
    result: '还在写',
    hasNewCommits: true,
  }).verdict === 'partial' &&
    computeVerdict({
      ok: false,
      subtype: 'error_max_turns',
      result: '还在写',
      hasNewCommits: true,
    }).note === '可能已完成',
  '撞 max-turns 但已有提交 → partial + 可能已完成',
);
assert(
  computeVerdict({
    ok: false,
    subtype: 'error_max_turns',
    result: '还在写',
    hasUncommittedChanges: true,
  }).verdict === 'partial',
  '撞 max-turns 但有未提交改动 → partial',
);
assert(
  computeVerdict({
    ok: true,
    result: '没改文件',
    expectChanges: true,
    hasNewCommits: false,
    hasUncommittedChanges: false,
  }).verdict === 'suspect',
  '期望改动却零改动 → suspect',
);
assert(
  computeVerdict({
    ok: true,
    result: '## 核心命令\n什么时候用',
  }).verdict === 'suspect',
  '疑似复述介绍 → suspect',
);
assert(
  computeVerdict({
    ok: true,
    result: '已完成',
    judgeConfidence: 0.4,
  }).verdict === 'needs-review',
  'JEV 置信度 < 0.55 → needs-review',
);
assert(
  computeVerdict({
    ok: true,
    result: '已完成',
    judgeConfidence: 0.9,
  }).verdict === 'ok',
  'JEV 置信度 ≥ 0.55 保持 ok',
);

assert(resultPathFromLog('/tmp/runs/2026-01-01-mock.log') === '/tmp/runs/2026-01-01-mock.result.md', '日志同源 result 路径');
assert(previewLines('a\nb\nc\nd', 3).join(',') === 'a,b,c', 'preview 默认截前 N 行');
assert(previewLines('a\nb', 3).length === 2, '不足 N 行就全要');
assert(DEFAULT_BRIEF_LINES === 3, '默认 brief-lines 为 3');

const brief = buildBrief(
  {
    ok: true,
    model: 'mock',
    result: 'line1\nline2\nline3\nline4',
    durationMs: 12,
    totalCostUsd: 0.001,
    numTurns: 2,
    resultPath: '/tmp/x.result.md',
    logPath: '/tmp/x.log',
    newCommits: ['abc1234'],
    hasUncommittedChanges: false,
    subtype: 'success',
  },
  { briefLines: 3 },
);
assert(brief.verdict === 'ok', 'buildBrief 成功任务 verdict=ok');
assert(brief.preview.length === 3 && brief.preview[0] === 'line1', 'buildBrief 截前 3 行');
assert(brief.hasControlTokens === false, 'buildBrief 无控制 token');
assert(brief.newCommits[0] === 'abc1234', 'buildBrief 带上提交 hash');
assert(brief.resultPath.endsWith('.result.md'), 'buildBrief 含结果文件路径');

const jsonOut = formatBriefJson(brief);
let parsedBrief = null;
try {
  parsedBrief = JSON.parse(jsonOut);
} catch {
  parsedBrief = null;
}
assert(parsedBrief?.verdict === 'ok' && Array.isArray(parsedBrief?.preview), '--json 简报是单个合法 JSON 对象');

const human = formatBriefHuman(brief);
assert(human.includes('verdict: ok'), '人类简报含 verdict');
assert(human.split('\n').filter(Boolean).length <= 15, '人类简报不超过 15 行');

const dirty = buildBrief({
  ok: true,
  result: 'ok',
  expectChanges: undefined,
  hasUncommittedChanges: true,
  newCommits: [],
});
assert(dirty.hasUncommittedChanges === true, '简报反映未提交改动');

const ctrlBrief = buildBrief({ ok: true, result: 'hello <tool_call> x' });
assert(ctrlBrief.verdict === 'fail' && ctrlBrief.hasControlTokens === true, '简报标记控制 token 且 verdict=fail');

const dir = mkdtempSync(join(tmpdir(), 'agent-fleet-git-'));
try {
  const notRepo = snapshotGit(dir);
  assert(notRepo.isRepo === false, '非 git 目录 snapshot.isRepo=false');
  execFileSync('git', ['init', '-q'], { cwd: dir, stdio: 'ignore' });
  const empty = snapshotGit(dir);
  assert(empty.isRepo === true, 'git init 后是仓库');
  writeFileSync(join(dir, 'hello.txt'), 'hi\n');
  execFileSync('git', ['add', 'hello.txt'], { cwd: dir, stdio: 'ignore' });
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'test'], {
    cwd: dir,
    stdio: 'ignore',
  });
  const after = inspectGit(dir, empty);
  assert(after.newCommits.length >= 1, '运行期间新提交被列出');
  assert(after.hasUncommittedChanges === false, '干净工作树 dirty=false');
  writeFileSync(join(dir, 'hello.txt'), 'changed\n');
  const dirtyGit = inspectGit(dir, { isRepo: true, head: after.newCommits[0] ? undefined : null });
  assert(dirtyGit.hasUncommittedChanges === true, '有未提交改动 dirty=true');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

{
  const saved = process.env.TYPESAFE_API_KEY;
  delete process.env.TYPESAFE_API_KEY;
  const skipped = await maybeJudge({ prompt: 'x', result: 'y' }, { jev: { protocol: 'typesafe-systemone' } });
  assert(typeof skipped.skipped === 'string' && skipped.skipped.includes('TYPESAFE_API_KEY'), '--judge 无 key 时跳过并注明');
  if (saved !== undefined) process.env.TYPESAFE_API_KEY = saved;
}

finish();
