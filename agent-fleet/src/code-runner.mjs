import { spawn } from 'node:child_process';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { runsDir } from './progress.mjs';
import { writePidRecord, processCommand } from './pid.mjs';
import { SCOPE_LOCK } from './scope.mjs';

const REVIEW_REFERENCE = fileURLToPath(new URL('../skill/references/codex-coding.md', import.meta.url));

export function reviewPrompt() {
  const source = readFileSync(REVIEW_REFERENCE, 'utf8');
  const match = source.match(/## 可直接使用的 review 提示词\s+```text\n([\s\S]*?)\n```/);
  if (!match) throw new Error('找不到 codex-coding.md 中的 review 提示词');
  return match[1];
}

export async function runCode({ prompt, cwd = process.cwd(), low = false, review = false, codexBin = process.env.FLEET_CODEX_BIN || 'codex' }) {
  const workdir = resolve(cwd);
  const fullPrompt = review ? `${reviewPrompt()}\n\n${prompt}` : `${SCOPE_LOCK}\n\n${prompt}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(runsDir(), { recursive: true });
  const base = join(runsDir(), process.env.FLEET_DETACHED_RUN_ID || `${stamp}-codex`);
  const logPath = `${base}.log`;
  const resultPath = `${base}.result.md`;
  const before = snapshotGit(workdir);
  const startedAt = Date.now();
  writeFileSync(resultPath, '');
  const fd = openSync(logPath, process.env.FLEET_DETACHED_RUN_ID ? 'a' : 'w');
  let stderr = '';
  // 非 review 运行使用 danger-full-access：用户要求 Codex 拥有最大权限（含网络/代理），workspace-write 会断网导致 AWS 等取数任务全部失败；review 保持 read-only 以维持 checker 只读边界。
  const args = ['exec', '--skip-git-repo-check', '-m', 'gpt-6.1-sol', '-c', `model_reasoning_effort=${low ? 'low' : 'medium'}`, '--sandbox', review ? 'read-only' : 'danger-full-access', '-C', workdir, '-o', resultPath, '-'];
  let child;
  try {
    child = spawn(codexBin, args, { stdio: ['pipe', fd, 'pipe'] });
  } finally {
    closeSync(fd);
  }
  const detachedId = process.env.FLEET_DETACHED_RUN_ID;
  if (detachedId) writePidRecord(detachedId, { pid: process.pid, command: processCommand(process.pid),
    model: 'gpt-6.1-sol', cwd: workdir, startedAt: new Date(startedAt).toISOString(), logPath, finished: false });
  const outcome = await new Promise((done) => {
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; appendFileSync(logPath, redactEvidence(chunk.toString())); });
    child.once('error', (error) => done({ error }));
    child.once('close', (code, signal) => done({ code, signal }));
    child.stdin.on('error', () => {});
    child.stdin.end(fullPrompt);
  });
  if (detachedId) writePidRecord(detachedId, { pid: process.pid, command: processCommand(process.pid),
    model: 'gpt-6.1-sol', cwd: workdir, startedAt: new Date(startedAt).toISOString(), logPath, finished: true });
  const result = existsSync(resultPath) ? readFileSync(resultPath, 'utf8') : '';
  if (!existsSync(resultPath)) writeFileSync(resultPath, '');
  const git = inspectGit(workdir, before);
  return attachArtifacts({
    tier: low ? 'low' : 'medium',
    progress: { phase: outcome.error ? '启动执行器' : 'Codex 进程结束', exitCode: outcome.code ?? null },
    stderr: stderr.split(/\r?\n/).slice(-20).join('\n'),
    errorObject: outcome.error ? { ...outcome.error, message: outcome.error.message } : undefined,
    signal: outcome.signal,
    ok: outcome.code === 0 && Boolean(result.trim()),
    result,
    error: outcome.error?.message ?? (outcome.code === 0 ? (result.trim() ? null : 'Codex 没有写出结果') : `Codex 退出码 ${outcome.code ?? outcome.signal ?? '?'}`),
    durationMs: Date.now() - startedAt,
    model: 'gpt-6.1-sol',
    cwd: workdir,
    resultPath,
    logPath,
  }, logPath, git);
}
