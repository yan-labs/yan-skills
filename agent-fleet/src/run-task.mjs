// 单个子任务的执行核心:把「友好模型名 + 任务描述」翻译成一次完整的 Claude Agent SDK
// query() 调用,权限模式固定 bypassPermissions(自主读写文件、跑 bash、多轮工具调用直到
// 任务完成,不需要人工逐步确认),跑完把最终结果整理成一个稳定的 JSON 形状返回。
//
// 被 bin/agent-fleet.mjs 的 `run` 子命令直接调用,也被 src/run-many.mjs 在并发批量场景
// 里逐个调用——本文件不关心并发,一次调用只对应一个独立的 SDK 子进程/子任务,并发完全
// 交给调用方(Promise.allSettled 或者操作系统层面的多进程)。

import { query } from '@anthropic-ai/claude-agent-sdk';
import { resolveModel, ConfigError } from './config.mjs';
import { buildIsolatedEnv, buildPinnedSettings } from './isolated-env.mjs';
import { assertProjectSettingsTrusted, ProjectTrustError } from './project-trust.mjs';
import { createProgress } from './progress.mjs';
import { snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { createPromptStream, ensureInbox, watchInbox } from './inbox.mjs';
import { patchPidRecord, processCommand, readPidRecord, runIdFromLogPath, writePidRecord } from './pid.mjs';
import { onProcessSignal } from './signals.mjs';
import { SCOPE_LOCK } from './scope.mjs';
import { prepareCopyPrompt, COPY_VOICE_PATH } from './copy-voice.mjs';

/**
 * 默认追加给每个任务的执行者系统提示。
 *
 * 【为什么需要这个 —— 真实发生过的问题】
 * 用户全局的 ~/.claude/CLAUDE.md 要求"主线程必须把具体工作派给 subagent",而这个工具驱动的
 * 恰恰是第三方模型(Gemini/DeepSeek/...)在扮演 Claude Code 的主循环。第三方模型读到宿主环境里那份
 * 全局规则后,会把 agent-fleet 交给它的任务原样再转派一层——包括荒谬地用 Bash 工具反过来调用
 * agent-fleet 自己(2026-09-26 实测发生过),或者只回一句"已经在跑了/等结果"就结束当轮。
 * 这段默认提示就是直接把"你现在是执行者"这条边界钉在系统提示里,不依赖每次调用方都记得写。
 *
 * 【怎么叠加,而不是替换 —— 见 sdk.d.ts 对 systemPrompt 的说明】
 * `{ type: 'preset', preset: 'claude_code', append: '...' }` 是 Claude Agent SDK 官方支持的写法:
 * 保留 Claude Code 默认的工具系统提示(工具定义、环境信息等),只在后面追加文本,不会把整个
 * 系统提示替换掉。调用方通过 --system-prompt / task.systemPrompt 传入的自定义文本会接在这段
 * 默认文本之后,两者都保留,不是二选一。
 */
export const DEFAULT_EXECUTOR_SYSTEM_PROMPT =
  '你是执行者,拿到任务要直接动手完成,不是把任务转述或转发给别人就结束。' +
  '禁止用 Bash 工具调用 agent-fleet 自己(bin/agent-fleet.mjs、npx agent-fleet 或等价命令),' +
  '那会造成递归嵌套。禁止调用 Agent/Task 工具，禁止转派任务。' +
  '必须自己完成任务并验证结果，不允许只回"已启动/等结果"就结束当轮。' +
  '任何时候都不允许杀死、停止或干预不是你自己这次任务启动的进程。' +
  '绝不 kill / pkill / killall 任何不是你自己启动的进程。' +
  SCOPE_LOCK;

/**
 * 组装一次 query() 调用的 options。
 *
 * 单独抽出来并导出,不是为了复用(只有一个调用方),而是为了让安全回归测试能够直接断言
 * 这里的安全相关字段还在——env 隔离、flag 层 settings 钉住 baseURL、strictMcpConfig
 * 这几项一旦被谁顺手删掉,链路仍然"能跑通",只有针对这个结构的断言才拦得住这种回归。
 *
 * @param {{ resolved: object, cwd: string, maxTurns?: number, systemPrompt?: string, resume?: string }} params
 * @returns {object} 传给 query() 的 options
 */
export function buildQueryOptions({ resolved, cwd, maxTurns, systemPrompt, resume, projectSettings }) {
  return {
    model: resolved.model,
    cwd,
    // 见 isolated-env.mjs 顶部注释:必须先剥离宿主环境里的 CLAUDE_*/ANTHROPIC_* 变量,
    // 再叠上这次任务真正要用的 baseURL + 密钥 + 自定义头,否则在某些嵌套场景下 SDK 会
    // 悄悄绕过我们的配置、复用宿主自己的登录凭据或自定义请求头。
    env: buildIsolatedEnv(resolved),
    // 核心要求:全自主执行,不需要人工逐步确认每一步工具调用。
    permissionMode: 'bypassPermissions',
    // SDK 类型定义明确要求:用 bypassPermissions 必须显式加这个安全确认字段,
    // 防止「误设了 bypassPermissions 却没意识到风险」。
    allowDangerouslySkipPermissions: true,
    // SDK 不加载任何项目、本地或全局配置。默认只传 fleet 钉死的请求配置;
    // 可选白名单的过滤结果由前置层显式传入,避免 SDK 再读取未过滤的文件。
    settingSources: [],
    settings: { ...projectSettings, ...buildPinnedSettings(resolved) },
    // 不加载目标目录的 .mcp.json。MCP server 条目本质是"会话启动时自动执行的命令",
    // 而这个子进程的环境里带着用户的真实第三方密钥——让一个可能来自外部的目录决定
    // 启动时跑什么进程,等于直接把密钥递出去,且不需要模型配合。本工具从不传
    // mcpServers,所以关掉它不损失任何现有能力。
    strictMcpConfig: true,
    ...(maxTurns ? { maxTurns } : {}),
    // 见上方 DEFAULT_EXECUTOR_SYSTEM_PROMPT 的注释:用 preset+append 叠加,不替换 Claude Code
    // 自己的默认系统提示(工具定义等)。调用方传入的 systemPrompt 接在默认文本之后,两者共存。
    systemPrompt: {
      type: 'preset',
      preset: 'claude_code',
      append: systemPrompt ? `${DEFAULT_EXECUTOR_SYSTEM_PROMPT}\n\n${systemPrompt}` : DEFAULT_EXECUTOR_SYSTEM_PROMPT,
    },
    // SDK Options.resume:加载指定 session 的对话历史再继续。与 continue 互斥。
    ...(resume ? { resume } : {}),
  };
}

/**
 * 执行一个子任务。
 *
 * @param {object} params
 * @param {string} params.friendlyModel  models.config.json 里的友好名字,如 "deepseek-v4.1-flash"
 * @param {string} params.prompt         任务描述
 * @param {string} params.cwd            Agent 的工作目录(读写文件、跑 bash 的作用域)
 * @param {object} params.config         已加载的 models.config.json(见 config.mjs)
 * @param {number} [params.maxTurns]     可选,限制最大工具调用轮数,避免任务跑飞
 * @param {string} [params.systemPrompt] 可选,追加的系统提示
 * @param {string} [params.resume]       SDK session id,续跑历史对话
 * @param {string} [params.resumedFrom]  被续跑的原 run-id,只进返回值/简报
 * @returns {Promise<object>} 见文件底部的返回形状说明
 */
export async function runTask({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt, progress, resume, resumedFrom, noVoice, copyVoice }) {
  const startedAt = Date.now();

  // 进度输出对象:调用方(bin 的 run、run-many)注入,各自决定 quiet 和 label;以库方式
  // 直接调用且没传时,退化成一个只写日志文件、不打扰 stderr 的静默进度——日志文件这一层
  // 永远存在,tail 永远有料。整个函数体包在 try/finally 里,任何一条返回路径(包括配置
  // 错误的短路 return)都会 stop 掉 60 秒心跳定时器,不会把 CLI 进程吊住不退出。
  // 内部函数只拿到 log(line) 写入函数;stop 由这一层负责,内部不用关心生命周期。
  const output = progress ?? createProgress({ quiet: true, label: friendlyModel });
  const gitBefore = snapshotGit(cwd);
  const runId = runIdFromLogPath(output.logPath);
  writePidFile(runId, {
    pid: process.pid,
    ppid: process.ppid,
    model: friendlyModel,
    cwd,
    startedAt: new Date(startedAt).toISOString(),
    logPath: output.logPath,
    sessionId: null,
    command: processCommand(process.pid),
    resume: resume ?? null,
    resumedFrom: resumedFrom ?? null,
    finished: false,
  });
  try {
    const preparedPrompt = prepareCopyPrompt({ friendlyModel, prompt, noVoice, copyVoice });
    if (preparedPrompt !== prompt) output.log(`copy-voice: injected Paste-ready block from ${COPY_VOICE_PATH}`);
    else if (noVoice && (copyVoice || ['copy', 'kollab-gateway-copy'].includes(friendlyModel))) output.log('copy-voice: skipped (--no-voice)');
    const inner = await runTaskInner({
      friendlyModel,
      prompt: preparedPrompt,
      cwd,
      config,
      maxTurns,
      systemPrompt,
      resume,
      resumedFrom,
      startedAt,
      log: line => output.log(redactEvidence(line)),
      runId,
    });
    const withMeta = resumedFrom ? { ...inner, resumedFrom } : inner;
    return attachArtifacts(withMeta, output.logPath, inspectGit(cwd, gitBefore));
  } catch (err) {
    // 未预见的异常:同样补一行 done error 再抛,保住"日志必有 done 行收尾"的不变量,
    // 否则 tail --follow 会对这份日志永远等下去。
    output.log(`done error ${oneLine(redactEvidence(err?.message ?? String(err)), 160)}`);
    const failed = { ok: false, model: friendlyModel, cwd, error: err.message, durationMs: wallClockDurationMs(startedAt) };
    return attachArtifacts({ ...failed, httpStatus: err.status ?? err.statusCode, errorObject: err.error ?? { code: err.code, type: err.type, message: err.message }, stderr: err.stderr }, output.logPath, inspectGit(cwd, gitBefore));
  } finally {
    markPidFinished(runId);
    output.stop();
  }
}

export const STOP_USER_MESSAGE = '请立即收尾：停止新工作，简要写出当前进度与结果';
const RESULT_CLOSE_GRACE_MS = 2000;

/** 从进程开始跑任务到现在的总墙钟。不用 SDK result.duration_ms(插话后续段会重置)。 */
export function wallClockDurationMs(startedAt, now = Date.now()) {
  const start = Number(startedAt);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Number(now) - start);
}

function writePidFile(runId, rec) {
  if (!runId) return;
  try {
    writePidRecord(runId, rec);
  } catch {
    /* 目录不可写时不影响真正执行 */
  }
  try {
    ensureInbox(runId);
  } catch {
    /* ignore */
  }
}

function markPidFinished(runId) {
  if (!runId) return;
  try {
    patchPidRecord(runId, { finished: true, finishedAt: new Date().toISOString() });
  } catch {
    /* ignore */
  }
}

async function runTaskInner({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt, resume, resumedFrom, startedAt, log, runId }) {
  let resolved;
  let projectSettings;
  try {
    // 先决定项目配置来源,再 resolveModel 读取密钥。默认不读取目录配置内容,
    // 安全保证由不加载来满足,无需为每个仓库维护白名单;白名单仅加载过滤后的配置。
    projectSettings = assertProjectSettingsTrusted(cwd);
    if (projectSettings !== undefined) process.stderr.write('cwd 在受信白名单内，已跳过项目配置越权检查（项目凭据、地址和请求头设置仍被忽略）\n');
    resolved = resolveModel(friendlyModel, config);
    // typesafe-systemone 协议(JEV 等结构化决策 API)不实现 Anthropic Messages 协议,
    // Claude Agent SDK 的 query() 没法驱动它——它不生成文本、不支持多轮工具调用,委派
    // 不了一个完整任务。这里在真正发起 SDK 调用之前就短路拒绝,而不是让它带着一个
    // 必然失败或语义不明的请求打到上游。见 src/judge-task.mjs 和 README「JEV」一节。
    if (resolved.protocol === 'typesafe-systemone') {
      throw new ConfigError(
        `"${friendlyModel}" 是 typesafe-systemone 协议(结构化决策 API:给它一段 state + 类型化 ` +
          `questions,返回 noul/choice/score 结构化答案),不生成文本、不支持多轮工具调用,不能通过 ` +
          `run/run-many 委派完整任务。请改用: node bin/agent-fleet.mjs judge --model ${friendlyModel} ` +
          `--state-file <path> --questions-file <path>`,
      );
    }
  } catch (err) {
    // 配置/密钥/目标目录信任类错误在真正发起请求之前就能判定,直接短路返回,
    // 不消耗一次 SDK 调用。message 本身已经是写给人看的可操作提示。
    if (err instanceof ConfigError || err instanceof ProjectTrustError) {
      // 这类错误发生在真正发起请求之前;也补一行 done error,保证"每份日志都以 done 行
      // 收尾"的不变量成立——tail --follow 靠这一行判断停止。
      log(`done error ${oneLine(err.message, 160)}`);
      return { ok: false, model: friendlyModel, prompt, cwd, progress: { phase: '配置加载' }, error: err.message, durationMs: wallClockDurationMs(startedAt) };
    }
    throw err;
  }

  const options = buildQueryOptions({ resolved, cwd, maxTurns, systemPrompt, resume, projectSettings });

  const stream = createPromptStream(prompt);
  const q = query({ prompt: stream, options });

  let pendingAfterResult = 0;
  let seenResult = false;
  let stopRequested = false;
  let interruptTimer = null;
  let closeTimer = null;
  const cancelCloseTimer = () => {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  };
  const maybeCloseAfterResult = () => {
    cancelCloseTimer();
    inbox?.pump();
    if (pendingAfterResult > 0) {
      pendingAfterResult = 0;
      return;
    }
    // result 之后再等 2 秒:这期间新来的 say 还能再开一轮;否则关流让 query 结束。
    closeTimer = setTimeout(() => {
      inbox?.pump();
      if (pendingAfterResult > 0) {
        pendingAfterResult = 0;
        closeTimer = null;
        return;
      }
      stream.close();
      closeTimer = null;
    }, RESULT_CLOSE_GRACE_MS);
    closeTimer.unref?.();
  };

  const inbox = runId
    ? watchInbox(runId, (entry) => {
        if (entry.type === 'say') {
          if (seenResult) pendingAfterResult += 1;
          cancelCloseTimer();
          stream.push(entry.text);
          log(`收到插话：${oneLine(entry.text, 160)}`);
        } else if (entry.type === 'stop') {
          stopRequested = true;
          if (seenResult) pendingAfterResult += 1;
          cancelCloseTimer();
          stream.push(STOP_USER_MESSAGE);
          log(`收到插话：${STOP_USER_MESSAGE}`);
          const graceSec = Number.isFinite(entry.grace) ? entry.grace : 60;
          if (interruptTimer) clearTimeout(interruptTimer);
          interruptTimer = setTimeout(() => {
            q.interrupt().catch(() => {});
          }, Math.max(0, graceSec) * 1000);
          interruptTimer.unref?.();
        }
      })
    : null;

  let signalName = null;
  const onSignal = (name) => {
    if (signalName) return;
    const rec = runId ? readPidRecord(runId) : null;
    const fromOurStop = stopRequested || rec?.stopRequested || rec?.stopSignal;
    if (fromOurStop) {
      stream.close();
      q.interrupt().catch(() => {});
      return;
    }
    signalName = name;
    log(`被外部信号 ${name} 终止`);
    stream.close();
    q.interrupt().catch(() => {});
  };
  const unhookSignal = onProcessSignal(onSignal);

  let finalResult = null;
  let assistantText = { messageId: null, text: '' };
  try {
    for await (const message of q) {
      logSdkMessage(log, message);
      assistantText = collectAssistantText(assistantText, message);
      if (runId && message.session_id) {
        try {
          patchPidRecord(runId, { sessionId: message.session_id });
        } catch {
          /* ignore */
        }
      }
      if (message.type === 'result') {
        finalResult = message;
        seenResult = true;
        maybeCloseAfterResult();
      }
    }
  } catch (err) {
    if (signalName) log(`被外部信号 ${signalName} 终止`);
    log(`done error cost=? ${oneLine(err.message, 160)}`);
    inbox?.stop();
    if (interruptTimer) clearTimeout(interruptTimer);
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      progress: { phase: 'SDK 执行', assistantText: assistantText.text },
      error: signalName
        ? `被外部信号 ${signalName} 终止: ${err.message}`
        : `调用 Claude Agent SDK 失败: ${err.message}`,
      httpStatus: err.status ?? err.statusCode,
      errorObject: err.error ?? { code: err.code, type: err.type, message: err.message }, stderr: err.stderr,
      durationMs: wallClockDurationMs(startedAt),
      stopped: stopRequested || Boolean(signalName),
      signal: signalName,
      ...(resumedFrom ? { resumedFrom } : {}),
    };
  } finally {
    inbox?.stop();
    if (interruptTimer) clearTimeout(interruptTimer);
    cancelCloseTimer();
    stream.close();
    unhookSignal();
  }

  if (!finalResult) {
    log('done error cost=? (SDK 没有产出 result 消息)');
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      progress: { phase: 'SDK 执行', assistantText: assistantText.text },
      error: signalName
        ? `被外部信号 ${signalName} 终止,SDK 没有产出 result 消息`
        : 'SDK 没有产出 result 消息',
      durationMs: wallClockDurationMs(startedAt),
      stopped: stopRequested || Boolean(signalName),
      signal: signalName,
      ...(resumedFrom ? { resumedFrom } : {}),
    };
  }

  // 收尾行:done ok / done error + 成本。这是 tail --follow 的停止信号。
  const joinedErrors = (finalResult.errors ?? []).join('; ');
  const errorText = joinedErrors || (typeof finalResult.result === 'string' ? finalResult.result : '');
  const wasStopped = stopRequested || Boolean(signalName);
  if (finalResult.is_error) {
    log(`done error cost=${fmtCost(finalResult.total_cost_usd)}${errorText ? ` ${oneLine(errorText, 160)}` : ''}`);
  } else if (wasStopped) {
    log(`done error cost=${fmtCost(finalResult.total_cost_usd)} stopped`);
  } else {
    log(`done ok cost=${fmtCost(finalResult.total_cost_usd)}`);
  }

  return {
    ok: !finalResult.is_error && !wasStopped,
    model: friendlyModel,
    resolvedModel: resolved.model,
    baseURL: resolved.baseURL,
    prompt,
    cwd,
    // 只有 success 分支才有最终文本;error 分支(error_during_execution/error_max_turns/...)
    // 没有 result 字段,把 errors 数组透出去让调用方知道具体败在哪。
    result: finalResult.subtype === 'success'
      ? resolveSuccessfulResult(finalResult.result, assistantText.text)
      : null,
    isError: finalResult.is_error,
    subtype: finalResult.subtype,
    stopReason: finalResult.stop_reason ?? null,
    numTurns: finalResult.num_turns,
    durationMs: wallClockDurationMs(startedAt),
    sdkDurationMs: finalResult.duration_ms,
    totalCostUsd: finalResult.total_cost_usd,
    sessionId: finalResult.session_id,
    errors: finalResult.errors ?? [],
    ...(finalResult.is_error ? { error: errorText } : {}),
    stopped: wasStopped,
    signal: signalName,
    ...(resumedFrom ? { resumedFrom } : {}),
  };
}

/**
 * 把一条 SDK 消息里值得看的内容落一行进度:
 * - assistant 的每个 text 块:一行,截前 120 字;
 * - assistant 的每个 tool_use 块:一行,`tool=<名字> <参数摘要前 80 字>`。
 * user(tool_result)/system/stream_event 等其它消息不打——噪音大,对"跑到哪了"没有增量信息。
 */
function logSdkMessage(log, message) {
  if (message.type !== 'assistant') return;
  const content = message.message?.content ?? message.content;
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (block?.type === 'text' && block.text) {
      log(oneLine(block.text, 120));
    } else if (block?.type === 'tool_use') {
      log(`tool=${block.name ?? '?'} ${oneLine(JSON.stringify(block.input ?? {}), 80)}`);
    }
  }
}

/**
 * 聚合同一条主 Agent assistant 消息的流式文本块，作为空 success result 的候选文本。
 * 新消息会先清空旧候选，子 Agent 消息不参与，避免把工具调用前的过程说明或子任务输出当最终结果。
 */
export function collectAssistantText(current, message) {
  if (message.type !== 'assistant' || message.parent_tool_use_id) return current;
  const messageId = message.message?.id;
  const content = message.message?.content ?? message.content;
  if (!messageId || !Array.isArray(content)) return current;
  const text = content
    .filter((block) => block?.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n')
    .trim();
  if (current.messageId !== messageId) return { messageId, text };
  return text ? { messageId, text: [current.text, text].filter(Boolean).join('\n') } : current;
}

/**
 * 部分 Anthropic 兼容模型会把完整文本放在 assistant 消息里，却给 SDK 的成功 result 留空。
 * CLI 在这种情况下取最后一条 assistant 文本，避免把已完成的任务报告成空结果。
 */
export function resolveSuccessfulResult(result, lastAssistantText) {
  return typeof result === 'string' && result.trim() ? result : lastAssistantText;
}

/** 压成单行并截断——进度行是给人扫一眼的,不承载完整内容(完整结果走 stdout/JSON)。 */
function oneLine(text, max) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function fmtCost(cost) {
  return typeof cost === 'number' && Number.isFinite(cost) ? `$${cost.toFixed(4)}` : '?';
}


/*
 * 返回形状(成功时):
 * {
 *   ok: true,
 *   model: "deepseek-v4.1-flash",     友好名字
 *   resolvedModel: "deepseek-flash",  实际发给上游的 model 字段
 *   baseURL: "https://api.deepseek.com/anthropic",
 *   prompt, cwd,
 *   result: "……最终文本……",
 *   isError: false,
 *   subtype: "success",
 *   stopReason: "end_turn",
 *   numTurns: 3,
 *   durationMs: 12345,            进程开始跑任务到结束的总墙钟
 *   sdkDurationMs: 12345,         SDK result.duration_ms(插话后可能只是最后一段)
 *   totalCostUsd: 0.0012,
 *   sessionId: "…uuid…",
 *   errors: [],
 * }
 *
 * 失败时至少有 { ok:false, model, error }, 可能没有 resolvedModel/baseURL 等字段
 * (配置阶段就失败的情况,还没走到真正调用 SDK 那一步)。
 */
