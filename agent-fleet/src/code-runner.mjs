import { createHash } from 'node:crypto';
import { codexCommandEnvironment, codexSessionOverrides } from './codex-headless.mjs';
import { resolveCodexModel } from './model-family.mjs';
import { readJSON, readYield, resolveYield, writeYield, localCondition, stageState, saveStages, alignStage } from './yield.mjs';
import { saveCodexQuota, taskIdentity, queueRecord, setSlotState, acquireSlot } from './queue.mjs';
// Codex 执行层：管理 app-server 回合、插话、自动续做与 exec 降级。
import { acceptanceResult } from './verdict.mjs';
import { readContinuationState, continuationProgress, continuationRules, judgeContinuation, acceptanceContinuation, CONTINUE_ACTION, NO_PROGRESS_STOP, parkWaitReason } from './code-continue.mjs';
import { judgeTask } from './judge-task.mjs';
import { loadModelsConfig } from './config.mjs';
import { spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { runsDir } from './progress.mjs';
import { readPidRecord, patchPidRecord, processCommand, collectDescendantPids, readPidPpidTable, isPidAlive } from './pid.mjs';
import { watchInbox } from './inbox.mjs';
import { readState } from './detach.mjs';
import { createSupervision, commandObservation, escalationAction, sleepSeconds } from './supervision.mjs';
import { SCOPE_LOCK } from './scope.mjs';
import { fleetEvent, FLEET_EVENTS } from './timeline.mjs';

const REVIEW_REFERENCE = fileURLToPath(new URL('../skill/references/codex-coding.md', import.meta.url));

export function reviewPrompt() {
  const source = readFileSync(REVIEW_REFERENCE, 'utf8');
  const match = source.match(/## 可直接使用的 review 提示词\s+```text\n([\s\S]*?)\n```/);
  if (!match) throw new Error('找不到 codex-coding.md 中的 review 提示词');
  return match[1];
}

export function launchArchiveSweep({ env = process.env, spawnChild = spawn,
  script = fileURLToPath(new URL('../bin/fleet-archive-sweep.mjs', import.meta.url)) } = {}) {
  if (env.FLEET_NO_ARCHIVE_SWEEP === '1') return;
  try {
    const child = spawnChild(process.execPath, [script, '--quiet'], { detached: true, stdio: 'ignore', env });
    child.on('error', () => {});
    child.unref();
  } catch {}
}

async function threadLifecycle(codexBin, method, threadId, overrides) {
  const child = spawn(codexBin, ['app-server', '--stdio', ...overrides], { stdio: ['pipe', 'pipe', 'ignore'] });
  const lines = createInterface({ input: child.stdout });
  const pending = new Map();
  let counter = 0;
  const rejectPending = error => {
    for (const request of pending.values()) request.reject(error);
    pending.clear();
  };
  child.on('error', rejectPending);
  child.on('close', () => rejectPending(new Error('app-server closed')));
  child.stdin.on('error', rejectPending);
  lines.on('line', line => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    const request = pending.get(event.id);
    if (!request) return;
    pending.delete(event.id);
    if (event.error) request.reject(new Error(event.error.message));
    else request.resolve(event.result);
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++counter;
    pending.set(id, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  const timer = setTimeout(() => rejectPending(new Error(`${method} timeout`)), 15000);
  try {
    await request('initialize', { clientInfo: { name: 'agent_fleet', version: '0.7.0' } });
    child.stdin.write('{"method":"initialized"}\n');
    await request(method, { threadId });
  } finally {
    clearTimeout(timer);
    lines.close();
    child.kill('SIGKILL');
  }
}

/** 执行 Codex 任务；自动续做保留 thread，用户插话仍走现有 steer/resume 链路。 */
export async function runCode({ prompt, briefPath, cwd = process.cwd(), low = false, high = false, xhigh = false, max = false, simple = false, sol = false, luna = false, astra = false, fast = false, review = false, noContinue = false, reportPath, resume, resumedFrom, continuationJudge = params => judgeTask({ ...params, friendlyModel: 'jev', config: loadModelsConfig(), signal: AbortSignal.timeout(15000) }),
  codexBin = process.env.FLEET_CODEX_BIN || 'codex' }) {
  if ([low, high, xhigh, max].filter(Boolean).length > 1) throw new Error('--low、--high、--xhigh 和 --max 不能同用。');
  if ((xhigh || max) && !luna) throw new Error('--xhigh 和 --max 仅用于 --luna。');
  if (astra && (sol || simple || luna)) throw new Error('--astra 不能与 --sol、--simple 或 --luna 同用。');
  if (sol && (simple || luna)) throw new Error('--sol 不能与 --simple 或 --luna 同用。');
  if (luna && (simple || review)) throw new Error('--luna 不能与 --simple 或 --review 同用。');
  const effort = max ? 'max' : xhigh ? 'xhigh' : high ? 'high' : low ? 'low' : process.env.FLEET_CODEX_EFFORT || (luna ? 'xhigh' : 'medium');
  const family = astra ? 'astra' : luna ? 'luna' : sol ? 'sol' : 'terra';
  const resolutionLog = [];
  const model = resolveCodexModel(family, { log: line => resolutionLog.push(line) });
  const serviceTier = fast ? 'priority' : null;
  const workdir = resolve(cwd);
  reportPath ||= prompt.match(/^REPORT:\s*(.+)$/m)?.[1]?.trim();
  const taskHeader = prompt.match(/^归类：[^\n]*/m)?.[0] || '';
  const taskGoal = prompt.match(/^## 目标\s*\n([^\n]+)/m)?.[1] || '';
  const documentTask = /文档|文案|写作|翻译|校对|review|复核|审查/i.test(taskHeader) || /^(?:写|撰写|编写|更新|修改|整理|翻译|校对|复核|审查)(?:文档|报告|文章|文案|资料|说明|代码)/.test(taskGoal);
  const terra = !sol && !luna && !astra;
  const continueEnabled = (terra || (!review && !documentTask)) && !noContinue && process.env.FLEET_NO_CONTINUE !== '1';
  const waitRule = readFileSync(new URL('../skill/templates/blocks/executor-wait.md', import.meta.url), 'utf8').trim();
  const basePrompt = review ? reviewPrompt() : `${SCOPE_LOCK}\n\n预计超过2小时且 brief 未给阶段时，第一棒先列出各阶段范围和完成条件，用 fleet plan --file <计划文件> 提交后直接继续，不等批准；阶段边界用 fleet handoff --next <第一动作> --file <五项交接单>。`;
  const fullPrompt = [basePrompt, ...(prompt.includes(waitRule) ? [] : [waitRule]), prompt].join('\n\n');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  mkdirSync(runsDir(), { recursive: true });
  const runId = process.env.FLEET_DETACHED_RUN_ID || process.env.FLEET_SLOT_RUN_ID || `${stamp}-codex`;
  const base = join(runsDir(), runId);
  const logPath = `${base}.log`;
  const resultPath = `${base}.result.md`;
  const before = snapshotGit(workdir);
  const initial = readContinuationState(workdir, reportPath, prompt);
  const startedAt = Date.now();
  writeFileSync(resultPath, '');
  if (!process.env.FLEET_DETACHED_RUN_ID) writeFileSync(logPath, '');
  let stderr = '', activeChild, closed, rpc, turnId, completed, turnFinished, stopping = false;
  let yielding = false;
  const sourceId = resumedFrom || runId;
  const stages = stageState(sourceId, prompt);
  saveStages(runId, stages);
  const persistStages = () => { saveStages(sourceId, stages); saveStages(runId, stages); };
  let thresholdSent = false, activeSince = Date.now(), activeElapsed = 0;

  let offsetQueue = [], drain = Promise.resolve(), activeDescendants = [];
  const pendingAsks = new Set();
  const slot = process.env.FLEET_SLOT_RUN_ID ? queueRecord(process.env.FLEET_SLOT_RUN_ID) : null;
  briefPath ??= slot?.briefPath;
  const identity = taskIdentity({ ...slot, briefPath, review });
  const { env: codexEnv, overrides: commandOverrides } = codexCommandEnvironment();
  const overrides = [...codexSessionOverrides(prompt, identity.auth), ...commandOverrides];
  const briefMetaInit = briefPath && readJSON(briefPath.replace(/\.md$/, '.json'));
  const metadata = { ...identity, briefPath, slotRunId: slot?.runId, backend: 'codex-exec', route: model, threadId: resume || null, sessionId: resume || null,
    steerCount: 0, wakeCount: 0, resumeCount: 0, continueCount: 0, continuation: [], continuationChecks: [], numTurns: 0, toolCalls: 0,
    externalWait: { waiting: false, reason: null }, promptTemplate: briefMetaInit?.prompt_template ?? (review ? 'codex/review' : 'codex/default'),
    fallbacks: [], low, high, xhigh, max, simple, sol, luna, astra, family, resolvedModel: model, model, tier: effort, serviceTier, review, resumedFrom };
  const countedToolIds = new Set();
  let anonToolCalls = 0;
  const countToolCall = (id, isStart) => {
    if (id != null) {
      if (!countedToolIds.has(id)) {
        countedToolIds.add(id);
        metadata.toolCalls = countedToolIds.size + anonToolCalls;
      }
    } else if (isStart) {
      anonToolCalls++;
      metadata.toolCalls = countedToolIds.size + anonToolCalls;
    }
  };
  const production = identity.auth.includes('deploy-prod') || identity.actions.some(action => /生产|部署|发布/.test(action)) ||
    /^(?:动作[：:]\s*.*(?:部署|发布|生产)|允许范围：正文明确指定的服务与环境.*发布全流程)/m.test(prompt);
  const supervision = createSupervision(startedAt, { production, previous: readPidRecord(resumedFrom || runId)?.supervision });
  const ownAcceptance = prompt.match(/^[- ]*(V\d+).*?｜owner：本单/gm) || [];
  let sampled = initial, lastSample = 0, intervention, interruptedForPark = false, restartPrompt;
  const tools = new Map();
  const sample = at => {
    if (at - lastSample < 15_000) return;
    lastSample = at;
    const state = readContinuationState(workdir, reportPath, prompt);
    if (state.head !== sampled.head || state.acceptance?.table !== sampled.acceptance?.table)
      supervision.progress(at, '提交或验收变化');
    for (const path of new Set([...Object.keys(state.fingerprints), ...Object.keys(sampled.fingerprints)])) {
      supervision.file(at, path, sampled.fingerprints[path] ?? 'clean');
      supervision.file(at, path, state.fingerprints[path] ?? 'clean');
    }
    sampled = state;
    const toolCommands = [...tools.values()].filter(item => item.command);
    const park = readYield(runId);
    const scanOptions = { waiting: yielding || Boolean(park?.type === 'park' && !park.resolvedAt),
      sleep: Math.max(0, ...toolCommands.map(item => sleepSeconds(item.command))),
      building: toolCommands.some(item => /\b(?:build|install|test|make|xcodebuild)\b/.test(item.command)) };
    const stateView = supervision.scan(at, scanOptions);
    metadata.supervision = stateView;
    const signal = stateView.correction || stateView.escalation;
    if (!signal || intervention || restartPrompt || completed) return;
    if (!turnId || metadata.backend !== 'codex-app-server') {
      metadata.supervision.decision = '交主会话';
      return;
    }
    const item = sampled.acceptance?.unmet?.join('、') || ownAcceptance.map(line => line.trim().split(/\s/)[0]).join('、') || '当前验收';
    const safeItem = redactEvidence(item);
    const message = `〔${safeItem}〕监督命中 ${stateView.hits.join('、')}，距最近有效证据 ${Math.round((at - stateView.progressAt) / 60000)} 分钟，最近事件为${stateView.recent.at(-1)?.kind || '启动'}。换一条可验证路径；只剩外部条件时登记终态并 park。下次只报新证据或具体缺口。`;
    if (stateView.correction) {
      intervention = rpc('turn/steer', { threadId: metadata.threadId, expectedTurnId: turnId, input: textInput(message) })
        .then(() => {
          for (const hit of stateView.hits) supervision.delivered(hit, at);
          metadata.supervision = { ...stateView, delivered: Object.fromEntries(
            [...Object.entries(stateView.delivered), ...stateView.hits.map(hit => [hit, at])]) };
          record();
        })
        .catch(error => log(`[监督] 插话未送达：${error.message}`))
        .finally(() => { intervention = null; });
      return;
    }
    const briefMeta = briefPath && readJSON(briefPath.replace(/\.md$/, '.json'));
    const safe = (identity.readonly || identity.actions.length > 0) && !production && !identity.auth.includes('paid') && identity.actions.every(action => /^(只读|read|readonly|改代码|本地提交)$/.test(action)) &&
      (identity.readonly || briefMeta?.worktree?.path === workdir) && !tools.size &&
      activeChild?.pid && !collectDescendantPids(activeChild.pid, readPidPpidTable()).length;
    const decision = escalationAction({ enabled: process.env.FLEET_SUPERVISION_RESTART === '1',
      safe, terra, restarts: stateView.restarts, hits: stateView.hits });
    if (decision !== 'restart') {
      metadata.supervision.decision = decision;
      return;
    }
    restartPrompt = `恢复监督快照。卡点：${signal}。已试路径见本线程最近命令。先用另一种观测核对 ${safeItem}；保留已完成产物。\n${message}`;
    writeFileSync(base + '.supervision-checkpoint.json', JSON.stringify({ signal, progressAt: stateView.progressAt,
      events: stateView.recent, head: sampled.head, item: safeItem, next: restartPrompt }), { mode: 0o600 });
    intervention = rpc('turn/interrupt', { threadId: metadata.threadId, turnId })
      .catch(error => { restartPrompt = null; log(`[监督] 换班未执行：${error.message}`); })
      .finally(() => { intervention = null; });
  };
  const record = (patch = {}) => {
    process.send?.({ codexMetadata: metadata });
    return patchPidRecord(runId, { pid: process.pid, command: processCommand(process.pid),
    model, cwd: workdir, startedAt: new Date(startedAt).toISOString(), logPath,
    ...metadata, ...patch });
  };
  const log = text => {
    const evidence = redactEvidence(String(text));
    appendFileSync(logPath, evidence.endsWith('\n') ? evidence : `${evidence}\n`);
  };
  log(JSON.stringify({ type: 'model_resolution', family, model, warnings: resolutionLog }));
  const fallback = reason => { metadata.fallbacks.push(reason); log(`\n[codex] fallback: ${reason}\n`); record(); };
  const protectedChildren = new Map();
  const start = args => {
    // Global options go before the exec resume subcommand and its positional prompt.
    const command = [args[0], ...overrides, ...args.slice(1)];
    const child = spawn(codexBin, command, { stdio: ['pipe', 'pipe', 'pipe'], env: codexEnv });
    activeChild = child;
    activeDescendants = [];
    protectedChildren.clear();
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
    const rows = readPidPpidTable();
    const current = collectDescendantPids(activeChild.pid, rows)
      .map(pid => ({ pid, command: processCommand(pid) }));
    // Detached child runs own their process trees, even while their launcher waits.
    for (const child of current) {
      const id = child.command.match(/(?:^|\s)__supervise\s+(\S+)(?:\s|$)/)?.[1];
      const rec = id && readState(id);
      if (!rec || rec.parentRunId !== runId || rec.status !== 'running' || rec.pid !== child.pid || rec.command !== child.command) continue;
      for (const pid of [child.pid, ...collectDescendantPids(child.pid, rows)]) {
        const command = processCommand(pid);
        if (command) protectedChildren.set(pid, command);
      }
    }
    activeDescendants = [...new Map([...activeDescendants, ...current].map(child => [child.pid, child])).values()];
  };
  const interrupt = async ({ forPark = false } = {}) => {
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
    const descendants = activeDescendants.filter(({ pid, command }) => protectedChildren.get(pid) !== command);
    if (!forPark && metadata.backend === 'codex-app-server') await archive();
    if (!alreadyExited) {
      if (forPark) child.stdin.end();
      else child.kill('SIGINT');
    }
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
      const yielded = readYield(runId);
      if (yielding || (yielded && !yielded.resolvedAt)) return;
      if (metadata.backend === 'codex-app-server' && !turnId) return;
      if (!metadata.threadId) return;
      const text = offsetQueue.shift();
      if (metadata.backend === 'codex-app-server') {
        try {
          captureChildren();
          await rpc('turn/steer', { threadId: metadata.threadId, expectedTurnId: turnId, input: textInput(text) });
          pendingAsks.delete(text);
          metadata.steerCount++; log(fleetEvent(FLEET_EVENTS.STEER)); record();
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
    if (entry.type === 'stop') { stopping = true; if (!yielding) void interrupt(); }
    else if (entry.type === 'say') {
      stages.revisions = [...(stages.revisions || []), entry.text];
      stages.anchor += '\n\n修订 ' + stages.revisions.length + '：\n' + entry.text;
      persistStages();
      offsetQueue.push(entry.text); schedule();
    }
    else if (entry.type === 'ask') {
      const text = `子任务 ${entry.runId} 请求帮助（${entry.kind}）：\n${entry.text}\n请用 fleet say ${entry.runId} "<答复>" 回复。`;
      pendingAsks.add(text);
      offsetQueue.push(text);
      schedule();
    }
  });
  let archived = false, archivePending, ownsAppThread = Boolean(resume);
  const archive = () => {
    if (!metadata.threadId || archived) return Promise.resolve();
    return archivePending ||= (async () => {
      try {
        if (metadata.backend === 'codex-app-server' && activeChild?.exitCode === null && activeChild?.signalCode === null)
          await rpc('thread/archive', { threadId: metadata.threadId });
        else await threadLifecycle(codexBin, 'thread/archive', metadata.threadId, overrides);
        archived = true;
        record();
      } catch (error) {
        fallback(`thread/archive failed: ${error.message}`);
      } finally { archivePending = null; }
    })();
  };
  const handleYield = async () => {
    const entry = readYield(runId);
    if (!entry || entry.resolvedAt) return null;
    const plan = entry.type === 'plan' ? entry.text : entry.pendingPlan;
    if (plan) {
      log(`[codex] 阶段计划自动放行：\n${plan}`);
      stages.stages = plan.split('\n').filter(Boolean);
      stages.stage = 0;
      stages.baton = 1;
      persistStages();
      if (entry.type === 'plan') {
        resolveYield(runId, entry, { status: 'accepted' });
        return { prompt: '阶段计划已记录，按计划直接继续完成当前阶段：\n' + plan + '\n' + CONTINUE_ACTION };
      }
    }
    if (entry.type === 'handoff') {
      resolveYield(runId, entry, { status: 'accepted' });
      entry.text += '\n下一步第一动作：' + entry.next;
      const { aligned, completed: stageCompleted } = await alignStage(stages, entry.text, 'handoff', continuationJudge, { details: true });
      stages.latest = entry.text;
      stages.baton++;
      if (aligned && stageCompleted) stages.stage++;
      persistStages();
      log(`[codex] 交接自动接力（aligned=${aligned}）：\n${entry.text}`);
      log(fleetEvent('handoff'));
      return { handoff: true, prompt: stages.anchor + '\n\n最新交接单：\n' + stages.latest +
        '\n先核对原始目标和本阶段边界；交接有偏差或缺项时自行纠正，按下一步第一动作直接继续，不等批准。只有真正的授权或必需输入缺口才停下求助。' };
    }
    yielding = true;
    metadata.yield = entry;
    metadata.continueRequired = false;
    record({ activeTurnId: null });
    if (entry.type === 'blocked') {
      metadata.reportConclusion = '受阻';
      if (reportPath) {
        const path = resolve(workdir, reportPath);
        let report = existsSync(path) ? readFileSync(path, 'utf8') : '';
        const line = `受阻：${entry.need}｜${entry.what}｜${entry.tried}｜${entry.who}`;
        const heading = '## 未完成/风险/需要用户决定的事';
        report = report.includes(heading) ? report.replace(heading, heading + '\n' + line) : report + '\n' + heading + '\n' + line + '\n';
        writeFileSync(path, report);
      }
      record();
      return { blocked: true };
    }
    if (metadata.backend === 'codex-app-server' && activeChild) {
      activeDescendants = [];
      await interrupt({ forPark: true });
      activeChild = null;
      turnId = null;
      record({ codexPid: null, codexCommand: null });
    }
    const slotId = process.env.FLEET_SLOT_RUN_ID || runId;
    const parkedAt = Date.now();
    const waited = metadata.waitMs ?? 0;
    metadata.activeMs = parkedAt - startedAt - waited;
    metadata.waitMs = waited;
    metadata.pollCount ??= 0;
    metadata.externalWait = { waiting: true, reason: parkWaitReason(entry.until) };
    record();
    await setSlotState(slotId, 'parked');
    supervision.pause(parkedAt);
    let result;
    while (!stopping) {
      inbox.pump();
      // A child waiting for our answer cannot finish the run we parked on.
      if (offsetQueue.some(text => pendingAsks.has(text))) {
        result = { status: 'ask', text: '先处理子任务求助，再决定是否继续等待原条件。' };
        break;
      }
      metadata.pollCount = (metadata.pollCount ?? 0) + 1;
      metadata.waitMs = waited + Date.now() - parkedAt;
      if (metadata.pollCount === 1 || metadata.pollCount % 20 === 0) record();
      result = await localCondition(entry.until, { id: entry.sourceId || runId, entry, cwd: workdir, replies: offsetQueue });
      if (result || Date.now() >= entry.at + entry.timeoutMs) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (stopping) { resolveYield(runId, entry, { status: 'stopped' }); return { blocked: true }; }
    metadata.waitMs = waited + Date.now() - parkedAt;
    result ||= { status: 'timeout' };
    if (result.status === 'timeout' && entry.timeouts >= 1) {
      resolveYield(runId, entry, result);
      writeYield(runId, { type: 'blocked', need: 'input', what: `同条件第二次超时：${entry.until}`, tried: '本地条件等待两次', who: '派单主会话' });
      const blocked = await handleYield();
      metadata.yield.external = true;
      metadata.externalWait = { waiting: true, reason: 'park-timeout' };
      record();
      return blocked;
    }
    await setSlotState(slotId, 'queued');
    while (queueRecord(slotId) && !(await acquireSlot(slotId))) {
      if (stopping) return { blocked: true };
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    metadata.waitMs = waited + Date.now() - parkedAt;
    resolveYield(runId, entry, result);
    const replies = offsetQueue.splice(0);
    for (const text of replies) pendingAsks.delete(text);
    metadata.yield = null;
    yielding = false;
    metadata.wakeCount++;
    log(fleetEvent(FLEET_EVENTS.WAKE)); record();
    activeSince = Date.now();
    supervision.pause(activeSince);
    return { parked: true, prompt: `${entry.say}\n条件：${entry.until}\n终态：${JSON.stringify(result)}${replies.length ? '\n答复：' + replies.join('\n\n') : ''}` };
  };
  let previous, previousHandoff, stagnant = 0;
  let lastAcceptance = initial;
  const commandEvidence = new Set();
  const recordCommandEvidence = item => {
    if (item?.command) supervision.command(commandObservation(JSON.parse(redactEvidence(item)), Date.now()));
    const command = item?.command;
    const output = item?.aggregatedOutput ?? item?.aggregated_output;
    if (!command || !output) return;
    commandEvidence.add(createHash('sha256').update(command).update('\0').update(output).digest('hex'));
  };
  let previousCommandEvidence = 0, acceptanceStagnant = 0, turnUsedTool = false;
  const namedMissing = state => {
    const count = commandEvidence.size;
    const { missing } = acceptanceContinuation(lastAcceptance, state, count > previousCommandEvidence);
    const blocked = !continuationProgress(lastAcceptance, state).progress && count === previousCommandEvidence;
    acceptanceStagnant = !turnUsedTool || !blocked || state.externalWait?.waiting ? 0 : acceptanceStagnant + 1;
    previousCommandEvidence = count;
    lastAcceptance = state;
    if (acceptanceStagnant >= 2) {
      metadata.continueStop = NO_PROGRESS_STOP;
      log(fleetEvent(FLEET_EVENTS.BLOCKED));
    }
    return missing;
  };
  let firstTurnUsedTool = false;
  let reportRecoveryPrompt = null;
  const recoverEmptyReport = state => {
    if (reportRecoveryPrompt || !reportPath || !metadata.threadId || metadata.continueStop ||
        noContinue || process.env.FLEET_NO_CONTINUE === '1' || state.report.trim() ||
        state.acceptance?.verdict !== 'needs-review' || state.acceptance.pending !== 'none') return null;
    metadata.continueRequired = true;
    metadata.continueCount++;
    log('[codex] 具名验收报告为空，原线程补交报告');
    record();
    const emptyRun = metadata.numTurns === 1 && !firstTurnUsedTool;
    reportRecoveryPrompt = `上轮执行已正常结束，但具名验收报告为空或缺失。${emptyRun ? '首轮没有任何工具调用，请按 brief 的授权范围实际开始执行任务并逐项验证，完成后' : '只根据当前线程已有记录和现有证据，'}补交七节报告到 ${JSON.stringify(reportPath)} 并给出最终回复。
每个具名验收项都在「## 结论」标题下、下一节之前单独写一行，格式为「Vn｜状态｜证据或原因」。Vn 用 brief 的实际编号，状态填已过、未过、等外部、待下游、已回滚或不适用。
${emptyRun ? '按 brief 执行并遵守其授权和限制；不要因本提示扩大范围。' : '只可写此报告，不重跑任务，不派新单，不交班、挂起、提交、推送、发布或写入外部系统。'}证据不足的验收写明实际缺口，不报已过。`;
    return reportRecoveryPrompt;
  };
  const checkProgress = (state, handoff) => {
    if (state.externalWait?.waiting && !metadata.externalWait?.waiting) {
      metadata.externalWait = { waiting: true, reason: state.externalWait.reason || 'external-wait' };
    }
    if (previous) {
      const progress = continuationProgress(previous, state);
      if (handoff !== undefined && previousHandoff !== undefined && handoff !== previousHandoff) progress.progress = true;
      metadata.continuation.push({ attempt: metadata.continueCount, ...progress });
      stagnant = progress.progress || progress.externalWaitExempt ? 0 : stagnant + 1;
    }
    previous = state;
    previousHandoff = handoff;
  };
  const checkHandoff = yielded => {
    checkProgress(readContinuationState(workdir, reportPath, prompt, metadata.yield), stages.latest);
    metadata.continueRequired = true;
    if (stagnant >= 2) metadata.continueStop = NO_PROGRESS_STOP;
    else metadata.continueCount++;
    record();
    return Boolean(metadata.continueStop);
  };
  let outcome, wakePrompt;
  try {
    if (!stopping && process.env.FLEET_CODEX_BACKEND !== 'exec') {
      metadata.backend = 'codex-app-server';
      let finishTurn;
      const connect = async threadId => {
        const child = start(['app-server', '--stdio']);
        const pending = new Map();
        let counter = 0, buffer = '';
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
          if (event.method === 'account/rateLimits/updated') saveCodexQuota(params.rateLimits);
          // app-server also emits child-thread events; only our thread can finish this run.
          if (params.threadId && params.threadId !== metadata.threadId) return;
          if (event.method === 'turn/started') { turnId = params.turn.id; metadata.numTurns++; record({ activeTurnId: turnId }); }
          if (event.method === 'item/completed' && params.item?.type === 'agentMessage' && params.item.phase !== 'commentary')
            writeFileSync(resultPath, params.item.text || '');
          if (event.method === 'thread/tokenUsage/updated') {
            metadata.usage = params.tokenUsage;
            const total = params.tokenUsage?.total;
            // Codex outputTokens already includes reasoningOutputTokens.
            supervision.token(Date.now(), total?.outputTokens);
            record();
          }
          if (/^item\/(started|completed)$/.test(event.method) && params.item && /^(commandExecution|mcpToolCall|dynamicToolCall|fileChange|webSearch|collabAgentToolCall)$/.test(params.item.type)) {
            turnUsedTool = true;
            if (metadata.numTurns === 1) firstTurnUsedTool = true;
            countToolCall(params.item.id, event.method === 'item/started');
            if (event.method === 'item/started') tools.set(params.item.id, params.item);
          }
          if (event.method === 'item/completed' && params.item) tools.delete(params.item.id);
          if (event.method === 'item/completed' && params.item?.type === 'commandExecution') recordCommandEvidence(params.item);
          if (event.method === 'item/completed' && params.item?.type === 'commandExecution' && !interruptedForPark && !tools.size && turnId) {
            const park = readYield(runId);
            if (park?.type === 'park' && !park.resolvedAt) {
              interruptedForPark = true;
              rpc('turn/interrupt', { threadId: metadata.threadId, turnId }).catch(() => { interruptedForPark = false; });
            }
          }
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
          pending.clear();
          if (activeChild === child) finishTurn?.();
        });
        await rpc('initialize', { clientInfo: { name: 'agent_fleet', version: '0.7.0' }, capabilities: { experimentalApi: true } });
        child.stdin.write('{"method":"initialized"}\n');
        const response = await rpc(threadId ? 'thread/resume' : 'thread/start', { ...(threadId ? { threadId } : {}), cwd: workdir, model, ...(serviceTier ? { serviceTier } : {}), sandbox: 'danger-full-access', approvalPolicy: 'never' });
        if (threadId && response.thread.id !== threadId) throw new Error('Codex resume 返回了不同的 threadId');
        metadata.threadId = metadata.sessionId = response.thread.id; ownsAppThread = true; record();
      };
      const reconnect = async () => {
        if (activeChild) return;
        await connect(metadata.threadId);
        metadata.resumeCount++;
        record();
      };
      let threshold;
      try {
        await connect(resume);
        let nextPrompt = resume ? stages.anchor : fullPrompt;
        if (resumedFrom) {
          const pendingYield = readYield(resumedFrom);
          if (pendingYield && !pendingYield.resolvedAt) {
            writeFileSync(base + '.yield', JSON.stringify({ ...pendingYield, sourceId: pendingYield.sourceId || resumedFrom }));
            const wake = await handleYield();
            if (wake?.blocked) return metadata;
            if (wake?.prompt) nextPrompt = wakePrompt = wake.prompt;
            resolveYield(resumedFrom, pendingYield, { status: 'resumed', runId });
          }
        }
        threshold = setInterval(() => {
          const elapsed = Date.now() - activeSince; activeSince = Date.now();
          if (!yielding) activeElapsed += elapsed;
          if (turnId && !completed && Date.now() - lastSample >= 15_000) {
            sample(Date.now());
            record();
          }
          const tokens = metadata.usage?.last?.totalTokens || metadata.usage?.total?.totalTokens || 0;
          if (!thresholdSent && !yielding && turnId && !completed && (tokens >= Number(process.env.FLEET_HANDOFF_TOKENS || 150000) || activeElapsed >= Number(process.env.FLEET_HANDOFF_ACTIVE_MS || 7200000))) {
            thresholdSent = true;
            rpc('turn/steer', { threadId: metadata.threadId, expectedTurnId: turnId,
              input: textInput('已到交接提示阈值；这不是强停。到阶段边界写五项交接单并 fleet handoff；没有阶段计划先 fleet plan 提交计划后直接继续，不等批准。') }).then(() => log(fleetEvent('steer'))).catch(error => fallback(error.message));
          }
        }, 250);
        while (true) {
          await reconnect();
          if (stopping) break;
          // 每轮都先安装完成监听，避免很快结束的回合漏掉通知。
          completed = null;
          turnId = null;
          tools.clear();
          interruptedForPark = false;
          const turnDone = turnFinished = new Promise(resolve => { finishTurn = resolve; });
          writeFileSync(resultPath, '');
          const turn = await rpc('turn/start', { threadId: metadata.threadId, input: textInput(nextPrompt), effort });
          wakePrompt = undefined;
          turnId = turn.turn.id; record({ activeTurnId: turnId }); schedule();
          await turnDone;
          inbox.pump(); await drain;
          if (stopping) break;
          if (restartPrompt && completed?.status === 'interrupted') {
            await intervention;
            nextPrompt = restartPrompt;
            restartPrompt = null;
            supervision.restart(Date.now());
            metadata.supervision = supervision.scan(Date.now());
            record();
            continue;
          }
          restartPrompt = null;
          if (completed?.status !== 'completed' && !interruptedForPark) break;
          const yielded = await handleYield();
          inbox.pump(); await drain;
          if (stopping) break;
          if (yielded?.handoff) {
            if (checkHandoff(yielded)) break;
            await rpc('thread/archive', { threadId: metadata.threadId });
            const fresh = await rpc('thread/start', { cwd: workdir, model, ...(serviceTier ? { serviceTier } : {}), sandbox: 'danger-full-access', approvalPolicy: 'never' });
            metadata.threadId = metadata.sessionId = fresh.thread.id;
            archived = false; activeSince = Date.now(); activeElapsed = 0; thresholdSent = false; record();
          }
          if (yielded?.blocked) break;
          if (yielded?.prompt) {
            if (yielded.parked) stagnant = 0;
            nextPrompt = yielded.prompt;
            if (!activeChild) wakePrompt = nextPrompt;
            continue;
          }
          if (offsetQueue.length) break;
          const state = readContinuationState(workdir, reportPath, prompt, metadata.yield);
          state.finalReply = readFileSync(resultPath, 'utf8');
          metadata.reportConclusion = state.conclusion;
          if (/^(?:阻塞|受阻)/.test(state.conclusion)) log(fleetEvent(FLEET_EVENTS.BLOCKED));
          checkProgress(state);
          if (nextPrompt === reportRecoveryPrompt) {
            metadata.continueRequired = false;
            record();
            break;
          }
          const reportPrompt = completed?.status === 'completed' && recoverEmptyReport(state);
          if (reportPrompt) {
            nextPrompt = reportPrompt;
            continue;
          }
          let missing = [], judgment;
          if (state.acceptance && !noContinue && process.env.FLEET_NO_CONTINUE !== '1') {
            missing = namedMissing(state);
          } else if (continueEnabled && (reportPath || terra) && (terra || !state.conclusion.startsWith('失败'))) {
            missing = reportPath && !review ? continuationRules(state, prompt, workdir, initial) : [];
            if (!missing.length && state.conclusion.startsWith('完成')) {
              judgment = await judgeContinuation({ brief: prompt, report: state.report,
                finalReply: readFileSync(resultPath, 'utf8'), judge: continuationJudge });
              if (judgment.decision === 'continue') missing = judgment.missing;
            }
            metadata.continuationChecks.push({ turn: metadata.numTurns, rules: missing, judge: judgment ?? null });
          }
          metadata.continueRequired = missing.length > 0;
          if (!state.acceptance && metadata.continueRequired && !metadata.continueStop && stagnant >= 2) metadata.continueStop = NO_PROGRESS_STOP;
          record();
          if (!metadata.continueRequired || metadata.continueStop) break;
          metadata.continueCount++;
          nextPrompt = `${!turnUsedTool ? "本单是实际执行任务，直接调用工具开工。\n" : ""}继续完成本任务，具体缺项：\n${missing.map(item => `- ${item}`).join('\n')}\n只做 brief 已授权范围；做完更新报告七节及要求的交付凭据，中途自查不是最终交付。\n${CONTINUE_ACTION}`;
          turnUsedTool = false;
          log(`[codex] 续做 ${metadata.continueCount} 次`);
        }
        if (completed?.status === 'completed' || metadata.yield?.external) outcome = { code: 0 };
        else outcome = { error: new Error(completed?.error?.message || `Codex turn ${completed?.status || 'disconnected'}`) };
      } catch (error) {
        fallback(`app-server unavailable: ${error.message}; exec${metadata.threadId ? ' resume' : ''}`);
      } finally {
        clearInterval(threshold);
        await interrupt();
      }
    }
    if (!stopping && !metadata.yield && !metadata.resumeBlocked && (!outcome || offsetQueue.length)) {
      metadata.backend = 'codex-exec';
      let session = metadata.threadId;
      let nextPrompt = session ? [wakePrompt, ...offsetQueue.splice(0)].filter(Boolean).join('\n\n') || fullPrompt : fullPrompt;
      do {
        writeFileSync(resultPath, '');
        const args = ['exec', '--skip-git-repo-check', '--json', '-m', model, ...(serviceTier ? ['-c', 'service_tier="priority"'] : []), '-c', `model_reasoning_effort=${effort}`,
          '--sandbox', 'danger-full-access', '-C', workdir, '-o', resultPath,
          ...(session ? ['resume', session, '-'] : ['-'])];
        if (session) {
          try { await threadLifecycle(codexBin, 'thread/unarchive', session, overrides); }
          catch (error) { fallback(`thread/unarchive failed: ${error.message}; exec resume`); }
          archived = false;
          metadata.resumeCount++;
        }
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
              if (/^item\.(started|completed)$/.test(event.type) && /^(command_execution|mcp_tool_call|dynamic_tool_call|file_change|web_search|collab_agent_tool_call)$/.test(event.item?.type || '')) {
                turnUsedTool = true;
                if (metadata.numTurns === 1) firstTurnUsedTool = true;
                countToolCall(event.item?.id, event.type === 'item.started');
              }
              if (event.type === 'item.completed' && event.item?.type === 'command_execution') recordCommandEvidence(event.item);
              if (event.type === 'turn.completed') {
                metadata.usage = event.usage;
                supervision.token(Date.now(), event.usage?.output_tokens);
              }
            } catch { /* legacy exec stdout remains in log */ }
          }
        });
        child.stdin.end(nextPrompt);
        const sampling = setInterval(() => { sample(Date.now()); record(); }, 15_000);
        outcome = await closed;
        clearInterval(sampling);
        if (buffer) log(buffer);
        inbox.pump(); await drain;
        activeChild = null;
        if (stopping || outcome.code !== 0) break;
        const yielded = await handleYield();
        inbox.pump(); await drain;
        if (stopping || yielded?.blocked) break;
        if (yielded?.prompt) {
          if (yielded.parked) stagnant = 0;
          if (yielded.handoff) {
            if (checkHandoff(yielded)) break;
            await archive();
            inbox.pump(); await drain;
            if (stopping) break;
            session = null;
          }
          else session = metadata.threadId;
          nextPrompt = yielded.prompt; continue;
        }
        if (offsetQueue.length) {
          if (!metadata.threadId) { fallback('Codex 不支持插话，改方向请用 --restart'); break; }
          session = metadata.threadId;
          nextPrompt = `${review ? `${reviewPrompt()}\n\n` : ''}${offsetQueue.splice(0).join('\n\n')}`;
          log('\n[codex] say: exec resume same thread\n');
          continue;
        }
        const state = readContinuationState(workdir, reportPath, prompt, metadata.yield);
        state.finalReply = readFileSync(resultPath, 'utf8');
        metadata.reportConclusion = state.conclusion;
        checkProgress(state);
        if (nextPrompt === reportRecoveryPrompt) {
          metadata.continueRequired = false;
          record();
          break;
        }
        const reportPrompt = recoverEmptyReport(state);
        if (reportPrompt) {
          session = metadata.threadId;
          nextPrompt = reportPrompt;
          continue;
        }
        const missing = state.acceptance ? (!noContinue && process.env.FLEET_NO_CONTINUE !== '1' ? namedMissing(state) : [])
          : continueEnabled && reportPath && !review ? continuationRules(state, prompt, workdir, initial) : [];
        metadata.continueRequired = missing.length > 0;
        metadata.continuationChecks.push({ turn: metadata.numTurns, rules: missing, judge: null });
        if (!state.acceptance && metadata.continueRequired && !metadata.continueStop && stagnant >= 2) metadata.continueStop = NO_PROGRESS_STOP;
        if (!metadata.continueRequired || metadata.continueStop) break;
        if (!metadata.threadId) { metadata.continueStop = '缺少 threadId，无法续做'; break; }
        metadata.continueCount++;
        session = metadata.threadId;
        nextPrompt = `${!turnUsedTool ? "本单是实际执行任务，直接调用工具开工。\n" : ""}继续完成本任务，具体缺项：\n${missing.map(item => `- ${item}`).join('\n')}\n只做 brief 已授权范围；做完更新报告七节及要求的交付凭据，中途自查不是最终交付。\n${CONTINUE_ACTION}`;
        turnUsedTool = false;
        log(`[codex] 续做 ${metadata.continueCount} 次`);
      } while (true);
      if (outcome.code !== 0 && metadata.resumeCount) fallback('exec resume failed；改方向请用 --restart');
    }
  } catch (error) {
    outcome = { error };
  } finally {
    inbox.stop(); await drain.catch(error => { outcome = { error }; });
    if (metadata.threadId && ownsAppThread) await archive();
    metadata.activeMs = Math.max(0, Date.now() - startedAt - (metadata.waitMs || 0));
    record({ finished: true, finishedAt: new Date().toISOString(), activeTurnId: null });
  }
  outcome ||= { error: new Error('Codex stopped') };
  const result = existsSync(resultPath) ? readFileSync(resultPath, 'utf8') : '';
  if (!existsSync(resultPath)) writeFileSync(resultPath, '');
  const git = inspectGit(workdir, before);
  let report = '';
  try { if (reportPath) report = readFileSync(resolve(workdir, reportPath), 'utf8'); } catch {}
  const acceptance = acceptanceResult(prompt, report, metadata.yield);
  const finalAcceptance = acceptance && { verdict: acceptance.verdict, pending: acceptance.pending, counts: acceptance.counts };
  if (acceptance?.pending === 'external' && !metadata.externalWait?.waiting) {
    metadata.externalWait = { waiting: true, reason: 'acceptance-external' };
  }
  return attachArtifacts({
    ...metadata,
    acceptance: finalAcceptance,
    tier: effort,
    progress: { phase: outcome.error ? '启动执行器' : 'Codex 进程结束', exitCode: outcome.code ?? null },
    stderr: stderr.split(/\r?\n/).slice(-20).join('\n'),
    errorObject: outcome.error ? { ...outcome.error, message: outcome.error.message } : undefined,
    signal: outcome.signal,
    ok: outcome.code === 0 && Boolean(result.trim()),
    result,
    error: outcome.error?.message ?? (outcome.code === 0 ? (result.trim() ? null : 'Codex 没有写出结果') : `Codex 退出码 ${outcome.code ?? outcome.signal ?? '?'}`),
    durationMs: Date.now() - startedAt,
    model,
    cwd: workdir,
    resultPath,
    logPath,
  }, logPath, git);
}
