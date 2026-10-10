import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { runsDir } from './progress.mjs';
import { writePidRecord, processCommand } from './pid.mjs';
import { SCOPE_LOCK } from './scope.mjs';

const execute = promisify(execFile);

function filesSnapshot(cwd) {
  const files = [];
  function visit(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (['.git', 'node_modules', '.grok'].includes(entry.name)) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) files.push([path, createHash('sha256').update(readFileSync(path)).digest('hex')]);
    }
  }
  visit(cwd);
  return JSON.stringify(files);
}

export async function runGrok({ prompt, cwd = process.cwd(), model, review = false, subagents = false,
  maxTurns, reasoningEffort, grokBin = process.env.FLEET_GROK_BIN || 'grok' }) {
  const workdir = resolve(cwd);
  const startedAt = Date.now();
  mkdirSync(runsDir(), { recursive: true });
  const base = join(runsDir(), process.env.FLEET_DETACHED_RUN_ID || `${new Date().toISOString().replace(/[:.]/g, '-')}-grok-cli`);
  const logPath = `${base}.log`;
  const resultPath = `${base}.result.md`;
  const env = { ...process.env, NODE_USE_ENV_PROXY: '1', GROK_DISABLE_AUTOUPDATER: '1', GROK_SUBAGENTS: subagents ? '1' : '0' };
  let selectedModel = model;
  let phase = 'grok models';
  const before = snapshotGit(workdir);
  let result = '', error = null, git = {}, stderrEvidence = '', errorObject, httpStatus, signal;
  const record = finished => {
    if (process.env.FLEET_DETACHED_RUN_ID) writePidRecord(process.env.FLEET_DETACHED_RUN_ID, {
      pid: process.pid, command: processCommand(process.pid), model: `grok-cli:${selectedModel || 'default'}`,
      cwd: workdir, startedAt: new Date(startedAt).toISOString(), logPath, finished,
    });
  };
  writeFileSync(resultPath, '');
  appendFileSync(logPath, '[grok-cli] checking authentication and default model\n');
  record(false);
  try {
    const models = await execute(grokBin, ['models'], { cwd: workdir, env, timeout: 30000 });
    selectedModel ||= models.stdout.match(/Default model:\s*(\S+)/i)?.[1];
    const filesBefore = filesSnapshot(workdir);
    const fullPrompt = `${SCOPE_LOCK}\n\n${review ? '只读审查：只读取与回答，不修改文件，不执行写操作。\n\n' : ''}${prompt}`;
    const promptPath = `${base}.prompt.md`;
    writeFileSync(promptPath, fullPrompt);
    const args = ['--prompt-file', promptPath, '--cwd', workdir, '--output-format', 'plain', '--sandbox', review ? 'read-only' : 'workspace'];
    if (selectedModel) args.push('--model', selectedModel);
    if (!review) args.push('--always-approve');
    if (!subagents) args.push('--no-subagents');
    if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns));
    if (reasoningEffort) args.push('--reasoning-effort', reasoningEffort);
    record(false);
    phase = 'Grok 进程执行';
    const child = spawn(grokBin, args, { cwd: workdir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; appendFileSync(logPath, redactEvidence(chunk.toString())); });
    child.stderr.on('data', chunk => { stderr += chunk; appendFileSync(logPath, redactEvidence(chunk.toString())); });
    const outcome = await new Promise(done => {
      child.once('error', error => done({ error }));
      child.once('close', (code, signal) => done({ code, signal }));
    });
    result = stdout.trim();
    stderrEvidence = stderr;
    errorObject = outcome.error ? { code: outcome.error.code } : undefined;
    signal = outcome.signal;
    error = outcome.error?.message ||
      (outcome.code !== 0 ? `Grok 退出码 ${outcome.code ?? outcome.signal ?? '?'}` : !result ? 'Grok 没有写出结果' : null);
    git = inspectGit(workdir, before);
    git.hasUncommittedChanges ||= filesBefore !== filesSnapshot(workdir);
  } catch (err) {
    stderrEvidence = err.stderr || err.stdout || stderrEvidence;
    errorObject = err.error ?? { ...err, message: err.message };
    httpStatus = err.status ?? err.statusCode;
    error = err.message;
  } finally {
    if (error) appendFileSync(logPath, `\n[grok-cli] ${redactEvidence(error)}\n`);
    writeFileSync(resultPath, result);
    appendFileSync(logPath, `[grok-cli] done ${error ? 'error' : 'ok'}\n`);
    record(true);
  }
  return attachArtifacts({ ok: !error && Boolean(result), result, error, progress: { phase }, tier: selectedModel || 'default', stderr: stderrEvidence.split(/\r?\n/).slice(-20).join('\n'), errorObject, httpStatus, signal, durationMs: Date.now() - startedAt,
    model: `grok-cli:${selectedModel || 'default'}`, cwd: workdir, resultPath, logPath }, logPath, Object.keys(git).length ? git : inspectGit(workdir, before));
}
