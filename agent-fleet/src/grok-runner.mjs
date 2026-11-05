import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { runsDir } from './progress.mjs';
import { writePidRecord, processCommand, signalProcessTree } from './pid.mjs';
import { watchInbox } from './inbox.mjs';
import { SCOPE_LOCK } from './scope.mjs';

const execute = promisify(execFile);

export async function runGrok({ prompt, cwd = process.cwd(), model, review = false, subagents = false,
  maxTurns, reasoningEffort, resume, resumedFrom, grokBin = process.env.FLEET_GROK_BIN || 'grok' }) {
  const workdir = resolve(cwd);
  const startedAt = Date.now();
  mkdirSync(runsDir(), { recursive: true });
  const runId = process.env.FLEET_DETACHED_RUN_ID || `${new Date().toISOString().replace(/[:.]/g, '-')}-grok-cli`;
  const base = join(runsDir(), runId);
  const logPath = `${base}.log`;
  const resultPath = `${base}.result.md`;
  const env = { ...process.env, NODE_USE_ENV_PROXY: '1', GROK_DISABLE_AUTOUPDATER: '1', GROK_SUBAGENTS: subagents ? '1' : '0' };
  let selectedModel = model;
  let phase = 'grok models';
  const before = snapshotGit(workdir);
  let result = '', error = null, git = {}, stderrEvidence = '', errorObject, httpStatus, signal;
  let metadata = { sessionId: resume || null, review, subagents, maxTurns, reasoningEffort,
    stopReason: null, numTurns: null, totalCostUsd: null, usage: null, modelUsage: null, costSource: 'grok 自报' };
  let suspectNote = null;
  const record = finished => {
    writePidRecord(runId, { pid: process.pid, command: processCommand(process.pid),
      model: `grok-cli:${selectedModel || 'default'}`, cwd: workdir,
      startedAt: new Date(startedAt).toISOString(), logPath, finished, ...metadata });
    writeFileSync(`${base}.grok.json`, `${JSON.stringify({ ...metadata }, null, 2)}\n`);
    process.send?.({ grokMetadata: { ...metadata } });
  };
  writeFileSync(resultPath, '');
  appendFileSync(logPath, '[grok-cli] checking authentication and default model\n');
  record(false);
  try {
    const models = await execute(grokBin, ['models'], { cwd: workdir, env, timeout: 30000 });
    selectedModel ||= models.stdout.match(/Default model:\s*(\S+)/i)?.[1];
    const reviewInstruction = '只读审查：项目文件保持原样；允许联网、运行测试和脚本，只在自己的 mktemp -d 临时目录建删文件。';
    const fullPrompt = `${SCOPE_LOCK}\n\n${review ? `${reviewInstruction}\n\n` : ''}${prompt}\n\n最终回答请用“结论：”说明实际结果。`;
    const promptPath = `${base}.prompt.md`;
    let nextPrompt = fullPrompt;
    let session = resume;
    const newSessionId = randomUUID();
    let activeChild, pendingSay = null, killTimer;
    const inbox = watchInbox(runId, entry => {
      if (entry.type !== 'say') return;
      pendingSay = pendingSay ? `${pendingSay}\n${entry.text}` : entry.text;
      if (activeChild) {
        const pid = activeChild.pid;
        signalProcessTree(pid, 'SIGTERM');
        killTimer ??= setTimeout(() => {
          if (activeChild?.pid === pid) signalProcessTree(pid, 'SIGKILL');
        }, 1000);
      }
    });
    let finalText = '';
    try {
      do {
        writeFileSync(promptPath, nextPrompt);
        const args = ['--prompt-file', promptPath, '--cwd', workdir, '--output-format', 'streaming-json', '--always-approve'];
        if (session) args.push('-r', session);
        else args.push('--session-id', newSessionId);
        if (selectedModel) args.push('--model', selectedModel);
        if (!subagents) args.push('--no-subagents');
        if (maxTurns !== undefined) args.push('--max-turns', String(maxTurns));
        if (reasoningEffort) args.push('--reasoning-effort', reasoningEffort);
        record(false);
        phase = 'Grok 进程执行';
        const child = spawn(grokBin, args, { cwd: workdir, env, stdio: ['ignore', 'pipe', 'pipe'] });
        activeChild = child;
        let buffer = '', stderr = '', parseError = null, ended = false;
        finalText = '';
        const parseLine = line => {
          if (!line.trim()) return;
          let event;
          try { event = JSON.parse(line); }
          catch { parseError = 'Grok streaming-json 包含非法 JSON 行'; return; }
          if (!event || typeof event !== 'object' || Array.isArray(event)) {
            parseError = 'Grok streaming-json 事件必须是对象'; return;
          }
          // 不落盘 thought/signature，日志只保留正文和结束状态。
          if (event.type === 'text') {
            if (typeof event.data !== 'string') { parseError = 'Grok text 事件缺少 data 正文'; return; }
            result += event.data;
            finalText += event.data;
            appendFileSync(logPath, redactEvidence(event.data));
          }
          if (!metadata.sessionId && ['text', 'thought', 'tool_call'].includes(event.type)) {
            metadata.sessionId = newSessionId;
            record(false);
          }
          if (event.type === 'end') {
            ended = true;
            metadata = { ...metadata, stopReason: event.stopReason, sessionId: event.sessionId || metadata.sessionId,
              numTurns: event.num_turns, totalCostUsd: event.total_cost_usd, usage: event.usage, modelUsage: event.modelUsage };
            appendFileSync(logPath, `\n[grok-cli] end ${event.stopReason}\n`);
            record(false);
          }
        };
        child.stdout.setEncoding('utf8');
        child.stderr.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop();
          for (const line of lines) parseLine(line);
        });
        child.stderr.on('data', chunk => { stderr += chunk; appendFileSync(logPath, redactEvidence(chunk)); });
        const outcome = await new Promise(done => {
          child.once('error', error => done({ error }));
          child.once('close', (code, signal) => done({ code, signal }));
        });
        parseLine(buffer);
        activeChild = null;
        clearTimeout(killTimer); killTimer = null;
        inbox.pump();
        stderrEvidence = stderr;
        errorObject = outcome.error ? { code: outcome.error.code } : undefined;
        signal = outcome.signal;
        if (pendingSay && metadata.sessionId) {
          session = metadata.sessionId;
          nextPrompt = `${review ? `${reviewInstruction}\n` : ''}${pendingSay}\n最终回答请用“结论：”说明实际结果。`;
          pendingSay = null;
          result += '\n\n';
          metadata.stopReason = null;
          appendFileSync(logPath, '\n[grok-cli] say: resuming session\n');
          continue;
        }
        const stopError = ended && metadata.stopReason !== 'end_turn'
          ? `Grok stopReason=${metadata.stopReason ?? 'missing'}；需要批准的工具被取消可能导致提前结束（cancelled）` : null;
        error = stopError || outcome.error?.message || (outcome.code !== 0
          ? `Grok 退出码 ${outcome.code ?? outcome.signal ?? '?'}`
          : parseError || (!ended ? 'Grok 缺少 end 事件，不能认定成功' : !result.trim() ? 'Grok 没有写出结果' : null));
        break;
      } while (true);
    } finally {
      inbox.stop();
      clearTimeout(killTimer);
    }
    result = result.trim();
    git = inspectGit(workdir, before);
    if (!error && !/(?:结论|总结|完成|结果|conclusion|summary|completed|result)\s*[:：]|\b(?:done|finished)\b/i.test(finalText))
      suspectNote = 'Grok 没有明确最终结论，可能只有提前结束前的片段';
  } catch (err) {
    stderrEvidence = err.stderr || err.stdout || stderrEvidence;
    errorObject = err.error ?? { ...err, message: err.message };
    httpStatus = err.status ?? err.statusCode;
    error = err.message;
  } finally {
    if (error && (errorObject?.killed === true || errorObject?.signal === 'SIGTERM' || errorObject?.code === 'ETIMEDOUT' ||
      /timed?\s*out|timeout|ETIMEDOUT|超时/i.test(`${error} ${stderrEvidence}`)) &&
      !['HTTPS_PROXY', 'HTTP_PROXY', 'ALL_PROXY', 'https_proxy', 'http_proxy', 'all_proxy'].some(key => process.env[key]))
      error += '；终端未设置 HTTPS_PROXY，Grok 需要它联网（Clash 示例为 http://127.0.0.1:7890，请使用实际代理地址）';
    if (error) appendFileSync(logPath, `\n[grok-cli] ${redactEvidence(error)}\n`);
    writeFileSync(resultPath, result);
    appendFileSync(logPath, `[grok-cli] done ${error || suspectNote ? 'error' : 'ok'}${suspectNote ? ' verdict=suspect' : ''}\n`);
    record(true);
  }
  return attachArtifacts({ ...metadata, suspectNote, resumedFrom, ok: !error && Boolean(result), result, error, progress: { phase }, tier: selectedModel || 'default', stderr: stderrEvidence.split(/\r?\n/).slice(-20).join('\n'), errorObject, httpStatus, signal, durationMs: Date.now() - startedAt,
    model: `grok-cli:${selectedModel || 'default'}`, cwd: workdir, resultPath, logPath }, logPath, Object.keys(git).length ? git : inspectGit(workdir, before));
}
