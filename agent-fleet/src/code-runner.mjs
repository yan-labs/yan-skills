import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { runsDir } from './progress.mjs';
import { patchPidRecord, processCommand, collectDescendantPids, readPidPpidTable, isPidAlive } from './pid.mjs';
import { watchInbox } from './inbox.mjs';
import { SCOPE_LOCK } from './scope.mjs';

const REVIEW_REFERENCE = fileURLToPath(new URL('../skill/references/codex-coding.md', import.meta.url));

export function reviewPrompt() {
  const source = readFileSync(REVIEW_REFERENCE, 'utf8');
  const match = source.match(/## 可直接使用的 review 提示词\s+```text\n([\s\S]*?)\n```/);
  if (!match) throw new Error('找不到 codex-coding.md 中的 review 提示词');
  return match[1];
}

export async function runCode({ prompt, cwd = process.cwd(), low = false, review = false, resume, resumedFrom,
  codexBin = process.env.FLEET_CODEX_BIN || 'codex' }) {
  const workdir = resolve(cwd);
  const fullPrompt = review ? `${reviewPrompt()}\n\n${prompt}` : `${SCOPE_LOCK}\n\n${prompt}`;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(runsDir(), { recursive: true });
  const runId = process.env.FLEET_DETACHED_RUN_ID || `${stamp}-codex`;
  const base = join(runsDir(), runId);
  const logPath = `${base}.log`;
  const resultPath = `${base}.result.md`;
  const before = snapshotGit(workdir);
  const startedAt = Date.now();
  writeFileSync(resultPath, '');
  if (!process.env.FLEET_DETACHED_RUN_ID) writeFileSync(logPath, '');
  let stderr = '', activeChild, closed, rpc, turnId, completed, turnFinished, stopping = false;
  let offsetQueue = [], drain = Promise.resolve(), activeDescendants = [];
  const metadata = { backend: 'codex-exec', threadId: resume || null, sessionId: resume || null,
    steerCount: 0, resumeCount: 0, numTurns: 0, fallbacks: [], low, review, resumedFrom };
  const record = (patch = {}) => {
    process.send?.({ codexMetadata: metadata });
    return patchPidRecord(runId, { pid: process.pid, command: processCommand(process.pid),
    model: 'gpt-6.1-sol', cwd: workdir, startedAt: new Date(startedAt).toISOString(), logPath,
    ...metadata, ...patch });
  };
  const log = text => {
    const evidence = redactEvidence(String(text));
    appendFileSync(logPath, evidence.endsWith('\n') ? evidence : `${evidence}\n`);
  };
  const fallback = reason => { metadata.fallbacks.push(reason); log(`\n[codex] fallback: ${reason}\n`); record(); };
  const start = args => {
    const child = spawn(codexBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    activeChild = child;
    activeDescendants = [];
    child.stdin.on('error', () => {});
    child.stderr.on('data', chunk => { stderr += chunk; log(chunk); });
    closed = new Promise(done => {
      child.once('error', error => done({ error }));
      child.once('close', (code, signal) => done({ code, signal }));
    });
    record({ codexPid: child.pid, codexCommand: processCommand(child.pid), finished: false });
    return child;
  };
  const captureChildren = () => {
    if (!activeChild?.pid || activeChild.exitCode !== null || activeChild.signalCode !== null) return;
    const current = collectDescendantPids(activeChild.pid, readPidPpidTable())
      .map(pid => ({ pid, command: processCommand(pid) }));
    activeDescendants = [...new Map([...activeDescendants, ...current].map(child => [child.pid, child])).values()];
  };
  const interrupt = async () => {
    const child = activeChild;
    if (!child) return;
    captureChildren();
    const alreadyExited = child.exitCode !== null || child.signalCode !== null;
    if (alreadyExited && metadata.backend === 'codex-app-server' && metadata.threadId && !completed && !activeDescendants.length && !metadata.resumeBlocked) {
      metadata.resumeBlocked = true;
      fallback('app-server 异常退出，无法确认旧工具已结束；不并发续跑，改方向请用 --restart');
    }
    if (!alreadyExited && metadata.backend === 'codex-app-server' && turnId && !completed) {
      try {
        await rpc('turn/interrupt', { threadId: metadata.threadId, turnId });
        let waitTimer;
        await Promise.race([turnFinished, new Promise(resolve => { waitTimer = setTimeout(resolve, 5000); })]);
        clearTimeout(waitTimer);
      } catch { /* SIGINT is the fallback when the protocol is unavailable */ }
    }
    captureChildren();
    const descendants = activeDescendants;
    if (!alreadyExited) child.kill('SIGINT');
    let timer;
    await Promise.race([closed, new Promise(resolve => { timer = setTimeout(resolve, 10000); })]);
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      const force = setTimeout(() => child.kill('SIGKILL'), 5000);
      await closed;
      clearTimeout(force);
    }
    // A crashed server can leave its tool command alive; never resume beside that writer.
    for (const descendant of descendants) {
      if (!descendant.command || !isPidAlive(descendant.pid) || processCommand(descendant.pid) !== descendant.command) continue;
      try { process.kill(descendant.pid, 'SIGKILL'); } catch { /* already exited */ }
    }
    const stillWriting = () => descendants.some(({ pid, command }) => command && isPidAlive(pid) && processCommand(pid) === command);
    for (let attempt = 0; attempt < 20 && stillWriting(); attempt++) await new Promise(resolve => setTimeout(resolve, 50));
    if (stillWriting()) throw new Error('旧 Codex 工具进程尚未结束，未启动并发续跑');
  };
  const textInput = text => [{ type: 'text', text, text_elements: [] }];
  const consume = async () => {
    while (offsetQueue.length && !stopping && activeChild) {
      if (metadata.backend === 'codex-app-server' && !turnId) return;
      if (!metadata.threadId) return;
      const text = offsetQueue.shift();
      if (metadata.backend === 'codex-app-server') {
        try {
          captureChildren();
          await rpc('turn/steer', { threadId: metadata.threadId, expectedTurnId: turnId, input: textInput(text) });
          metadata.steerCount++; log('\n[codex] steer accepted\n'); record();
          continue;
        } catch (error) {
          fallback(`turn/steer rejected: ${error.message}; SIGINT + exec resume`);
        }
      }
      offsetQueue.unshift(text);
      await interrupt();
      return;
    }
  };
  const schedule = () => { drain = drain.then(consume); };
  record({ finished: false });
  const inbox = watchInbox(runId, entry => {
    if (entry.type === 'stop') { stopping = true; void interrupt(); }
    else { offsetQueue.push(entry.text); schedule(); }
  });
  let outcome;
  try {
    if (!stopping && !review && !resume && process.env.FLEET_CODEX_BACKEND !== 'exec') {
      metadata.backend = 'codex-app-server';
      const child = start(['app-server', '--stdio']);
      const pending = new Map();
      let counter = 0, buffer = '';
      let finishTurn;
      const turnDone = turnFinished = new Promise(resolve => { finishTurn = resolve; });
      rpc = (method, params) => new Promise((resolve, reject) => {
        const id = ++counter;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timeout`)); }, 15000);
        pending.set(id, { resolve, reject, timer });
        child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      const notification = event => {
        if (event.id !== undefined && pending.has(event.id)) {
          const request = pending.get(event.id); pending.delete(event.id); clearTimeout(request.timer);
          if (event.error) request.reject(new Error(event.error.message)); else request.resolve(event.result);
          return;
        }
        // danger-full-access + approvalPolicy never; older servers may still ask for approval.
        if (event.id !== undefined && event.method) {
          const result = event.method === 'item/permissions/requestApproval' ? { permissions: event.params.permissions, scope: 'turn' }
            : /requestApproval$/.test(event.method) ? { decision: 'accept' }
            : /applyPatchApproval|execCommandApproval/.test(event.method) ? { decision: 'approved' } : null;
          child.stdin.write(`${JSON.stringify(result ? { id: event.id, result } : { id: event.id, error: { code: -32601, message: 'Unsupported client request' } })}\n`);
          return;
        }
        const params = event.params || {};
        if (event.method === 'turn/started') { turnId = params.turn.id; metadata.numTurns++; record({ activeTurnId: turnId }); }
        if (event.method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary')
          writeFileSync(resultPath, params.item.text || '');
        if (event.method === 'thread/tokenUsage/updated') { metadata.usage = params.tokenUsage; record(); }
        if (event.method === 'turn/completed') { completed = params.turn; finishTurn(); }
      };
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        buffer += chunk;
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) { log(`${line}\n`); try { notification(JSON.parse(line)); } catch { /* non JSON diagnostics */ } }
      });
      closed.then(result => {
        for (const request of pending.values()) { clearTimeout(request.timer); request.reject(result.error || new Error('app-server closed')); }
        pending.clear(); finishTurn();
      });
      try {
        await rpc('initialize', { clientInfo: { name: 'agent_fleet', version: '0.7.0' }, capabilities: { experimentalApi: true } });
        child.stdin.write('{"method":"initialized"}\n');
        const response = await rpc('thread/start', { cwd: workdir, model: 'gpt-6.1-sol', sandbox: 'danger-full-access', approvalPolicy: 'never' });
        metadata.threadId = metadata.sessionId = response.thread.id; record();
        const turn = await rpc('turn/start', { threadId: metadata.threadId, input: textInput(fullPrompt), effort: low ? 'low' : 'medium' });
        turnId = turn.turn.id; record({ activeTurnId: turnId }); schedule();
        await turnDone;
        inbox.pump(); await drain;
        if (completed?.status === 'completed') outcome = { code: 0 };
        else outcome = { error: new Error(completed?.error?.message || `Codex turn ${completed?.status || 'disconnected'}`) };
      } catch (error) {
        fallback(`app-server unavailable: ${error.message}; exec${metadata.threadId ? ' resume' : ''}`);
      } finally {
        await interrupt();
      }
    }
    if (!stopping && !metadata.resumeBlocked && (!outcome || offsetQueue.length)) {
      metadata.backend = 'codex-exec';
      let session = metadata.threadId;
      let nextPrompt = session ? offsetQueue.splice(0).join('\n\n') || fullPrompt : fullPrompt;
      do {
        writeFileSync(resultPath, '');
        const args = ['exec', '--skip-git-repo-check', '--json', '-m', 'gpt-6.1-sol', '-c', `model_reasoning_effort=${low ? 'low' : 'medium'}`,
          '--sandbox', review ? 'read-only' : 'danger-full-access', '-C', workdir, '-o', resultPath,
          ...(session ? ['resume', session, '-'] : ['-'])];
        if (session) metadata.resumeCount++;
        metadata.numTurns++;
        const child = start(args);
        let buffer = '';
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => {
          buffer += chunk;
          const lines = buffer.split('\n'); buffer = lines.pop();
          for (const line of lines) {
            log(line);
            try {
              const event = JSON.parse(line);
              if (event.type === 'thread.started') { metadata.threadId = metadata.sessionId = event.thread_id; record(); schedule(); }
              if (event.type === 'turn.completed') metadata.usage = event.usage;
            } catch { /* legacy exec stdout remains in log */ }
          }
        });
        child.stdin.end(nextPrompt);
        outcome = await closed;
        if (buffer) log(buffer);
        inbox.pump(); await drain;
        activeChild = null;
        if (!offsetQueue.length || stopping) break;
        if (!metadata.threadId) { fallback('Codex 不支持插话，改方向请用 --restart'); break; }
        session = metadata.threadId;
        nextPrompt = `${review ? '只读审查，不修改文件。\n' : ''}${offsetQueue.splice(0).join('\n\n')}`;
        log('\n[codex] say: exec resume same thread\n');
      } while (true);
      if (outcome.code !== 0 && metadata.resumeCount) fallback('exec resume failed；改方向请用 --restart');
    }
  } catch (error) {
    outcome = { error };
  } finally {
    inbox.stop(); await drain.catch(error => { outcome = { error }; });
    record({ finished: true, finishedAt: new Date().toISOString(), activeTurnId: null });
  }
  outcome ||= { error: new Error('Codex stopped') };
  const result = existsSync(resultPath) ? readFileSync(resultPath, 'utf8') : '';
  if (!existsSync(resultPath)) writeFileSync(resultPath, '');
  const git = inspectGit(workdir, before);
  return attachArtifacts({
    ...metadata,
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
