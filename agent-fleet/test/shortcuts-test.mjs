#!/usr/bin/env node
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createAsserter } from './assert-helper.mjs';
import { MODEL_ALIASES, resolveBrief, shortRunOptions, splitShortArgs, geminiBlocked } from '../src/shortcuts.mjs';
import { runCode, reviewPrompt } from '../src/code-runner.mjs';
import { DEFAULT_EXECUTOR_SYSTEM_PROMPT } from '../src/run-task.mjs';

const { assert, finish } = createAsserter('短命令单测');
const scratch = mkdtempSync(join(tmpdir(), 'fleet-shortcuts-'));
const priorRunsDir = process.env.AGENT_FLEET_RUNS_DIR;
process.env.AGENT_FLEET_RUNS_DIR = scratch;
try {
  for (const prompt of ['归类：编码\n复核', '实现 UI 页面', '修改文件 a.js']) assert(geminiBlocked(prompt), 'Gemini 底层静态拒绝编码/UI');
  assert(geminiBlocked('摘要', { expectChanges: true }), 'Gemini 底层拒绝 expect-changes');
  assert(!geminiBlocked('归类：Gemini 文本任务\n总结文章\n## 允许读写/禁止\n## 改动与产物 ← 文件路径'), 'Gemini 文本 brief 样板不误触发');
  const brief = join(scratch, 'brief.md');
  writeFileSync(brief, '来自文件的任务');
  for (const [alias, model] of Object.entries({
    copy: 'kollab-gateway-copy', grok: 'kollab-gateway-research',
    bulk: 'kollab-gateway-bulk', gpt: 'kollab-gateway-gpt-sol',
  })) assert(MODEL_ALIASES[alias] === model && shortRunOptions(alias, ['任务']).model === model, `${alias} 映射模型`);
  assert(resolveBrief(brief) === '来自文件的任务', '存在的 brief 文件读取内容');
  assert(resolveBrief('直接写的任务') === '直接写的任务', '非文件参数当文本');
  const defaults = shortRunOptions('copy', [brief]);
  assert(defaults.prompt === '来自文件的任务' && defaults.maxTurns === undefined && defaults.quiet && defaults.cwd === process.cwd(), '默认 brief、不设轮数上限、安静、cwd');
  const custom = shortRunOptions('copy', ['--verbose', brief, '--model', 'custom', '--max-turns', '12', '--cwd', scratch, '--system-prompt', '额外']);
  assert(custom.model === 'custom' && custom.maxTurns === 12 && !custom.quiet && custom.cwd === scratch && custom.systemPrompt === '额外', '显式参数覆盖默认值');
  assert(splitShortArgs(['--review', brief]).positionals[0] === brief, '布尔选项在 brief 前也能解析');
  assert(DEFAULT_EXECUTOR_SYSTEM_PROMPT.includes('禁止调用 Agent/Task 工具，禁止转派任务'), '默认系统提示禁止转派');
  assert(reviewPrompt().includes('你是独立 reviewer'), 'review 模板来自唯一文档段落');
  const missing = await runCode({ prompt: '不发送', cwd: scratch, codexBin: join(scratch, 'missing-codex') });
  assert(!missing.ok && missing.errorObject.code === 'ENOENT', '缺少 codex 返回原始失败证据');
  const mockCodex = join(scratch, 'mock-codex');
  const captured = join(scratch, 'captured.txt');
  const capturedArgs = join(scratch, 'args.txt');
  writeFileSync(mockCodex, `#!/bin/sh
printf '%s\n' "$@" > "$FLEET_TEST_ARGS"
out=
while [ "$#" -gt 0 ]; do
  if [ "$1" = "-o" ]; then shift; out=$1; fi
  shift
done
cat > "$FLEET_TEST_CAPTURE"
printf '审查完成\n' > "$out"
printf 'mock codex log\n'
`);
  chmodSync(mockCodex, 0o755);
  process.env.FLEET_TEST_CAPTURE = captured;
  process.env.FLEET_TEST_ARGS = capturedArgs;
  const code = await runCode({ prompt: '检查文件', cwd: scratch, codexBin: mockCodex, review: true });
  assert(code.ok && code.model === 'gpt-6.1-sol' && code.result.trim() === '审查完成', '模拟 Codex 正常结束并读取 result');
  assert(readFileSync(captured, 'utf8').startsWith(reviewPrompt()) && readFileSync(captured, 'utf8').endsWith('检查文件'), 'review 模板拼在 brief 前');
  assert(readFileSync(code.logPath, 'utf8').includes('mock codex log'), 'Codex stdout 写入同名 log');
  const args = readFileSync(capturedArgs, 'utf8');
  assert(args.includes('model_reasoning_effort=medium') && args.includes('read-only') && args.includes(scratch), 'review 使用 medium、只读 sandbox 和指定 cwd');
  delete process.env.FLEET_TEST_CAPTURE;
  delete process.env.FLEET_TEST_ARGS;
} finally {
  if (priorRunsDir === undefined) delete process.env.AGENT_FLEET_RUNS_DIR;
  else process.env.AGENT_FLEET_RUNS_DIR = priorRunsDir;
  rmSync(scratch, { recursive: true, force: true });
}
await import('./codex-steer-test.mjs');
await import('./grok-runner-test.mjs');
await import('./grok-control-test.mjs');
finish();
