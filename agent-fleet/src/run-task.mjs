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
import { snapshotGit, inspectGit, attachArtifacts } from './brief.mjs';

/**
 * 默认追加给每个任务的执行者系统提示。
 *
 * 【为什么需要这个 —— 真实发生过的问题】
 * 用户全局的 ~/.claude/CLAUDE.md 要求"主线程必须把具体工作派给 subagent",而这个工具驱动的
 * 恰恰是第三方模型(GLM/Gemini/...)在扮演 Claude Code 的主循环。第三方模型读到宿主环境里那份
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
  '那会造成递归嵌套。可以用 Agent 工具把边界清晰的子任务拆给子 agent 并行处理,' +
  '但你必须自己读懂并验证子 agent 的结果,最终给出真正完成任务的回复,' +
  '不允许原样转发子 agent 的输出、也不允许只回"已启动/等结果"就结束当轮。' +
  '任何时候都不允许杀死、停止或干预不是你自己这次任务启动的进程。';

/**
 * 组装一次 query() 调用的 options。
 *
 * 单独抽出来并导出,不是为了复用(只有一个调用方),而是为了让安全回归测试能够直接断言
 * 这里的安全相关字段还在——env 隔离、flag 层 settings 钉住 baseURL、strictMcpConfig
 * 这几项一旦被谁顺手删掉,链路仍然"能跑通",只有针对这个结构的断言才拦得住这种回归。
 *
 * @param {{ resolved: object, cwd: string, maxTurns?: number, systemPrompt?: string }} params
 * @returns {object} 传给 query() 的 options
 */
export function buildQueryOptions({ resolved, cwd, maxTurns, systemPrompt }) {
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
    // 只加载目标工作目录自己的项目级配置(.claude/settings.json、CLAUDE.md、
    // .claude/settings.local.json),不加载运行这个 CLI 的操作者本人的全局
    // ~/.claude/settings.json——那里面是操作者自己日常用 Claude Code 攒下的
    // hooks、MCP server、个人权限白名单,和"跑一个独立子任务"这个场景无关,
    // 混进来既是噪音也是新的隔离漏洞(实测这条不设的话,子进程会把操作者本机
    // 装的一整套 MCP server、slash command 都加载进来)。
    settingSources: ['project', 'local'],
    // 目标目录的项目配置可以影响 Agent 在目录里怎么干活(CLAUDE.md、权限、hooks),
    // 但不能影响模型请求本身。flag 层 settings 是用户可控层里优先级最高的一层,
    // 把 baseURL 钉在这里,项目配置里的同名 env 覆盖不掉(已实测验证)。
    settings: buildPinnedSettings(resolved),
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
 * @returns {Promise<object>} 见文件底部的返回形状说明
 */
export async function runTask({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt, progress }) {
  const startedAt = Date.now();

  // 进度输出对象:调用方(bin 的 run、run-many)注入,各自决定 quiet 和 label;以库方式
  // 直接调用且没传时,退化成一个只写日志文件、不打扰 stderr 的静默进度——日志文件这一层
  // 永远存在,tail 永远有料。整个函数体包在 try/finally 里,任何一条返回路径(包括配置
  // 错误的短路 return)都会 stop 掉 60 秒心跳定时器,不会把 CLI 进程吊住不退出。
  // 内部函数只拿到 log(line) 写入函数;stop 由这一层负责,内部不用关心生命周期。
  const output = progress ?? createProgress({ quiet: true, label: friendlyModel });
  const gitBefore = snapshotGit(cwd);
  try {
    const inner = await runTaskInner({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt, startedAt, log: output.log });
    return attachArtifacts(inner, output.logPath, inspectGit(cwd, gitBefore));
  } catch (err) {
    // 未预见的异常:同样补一行 done error 再抛,保住"日志必有 done 行收尾"的不变量,
    // 否则 tail --follow 会对这份日志永远等下去。
    output.log(`done error ${oneLine(err?.message ?? String(err), 160)}`);
    throw err;
  } finally {
    output.stop();
  }
}

async function runTaskInner({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt, startedAt, log }) {
  let resolved;
  try {
    // 顺序是有意的:先过目标目录的信任闸门,再解析模型(后者会把真实密钥读进内存)。
    // 目标目录一旦被判定为不可信,这次运行连"密钥进内存、注入子进程环境"这一步都不发生。
    // 见 project-trust.mjs:--cwd 可能是别人发来的目录,它不得决定请求发去哪、带什么凭据。
    assertProjectSettingsTrusted(cwd);
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
      return { ok: false, model: friendlyModel, prompt, cwd, error: err.message, durationMs: Date.now() - startedAt };
    }
    throw err;
  }

  const options = buildQueryOptions({ resolved, cwd, maxTurns, systemPrompt });

  let finalResult = null;
  let fallbackAssistant = { messageId: null, text: '' };
  try {
    for await (const message of query({ prompt, options })) {
      // 进度行:assistant 文本一行、tool_use 一行(截断),让人实时看到子任务跑到哪了。
      logSdkMessage(log, message);
      fallbackAssistant = collectFallbackAssistantText(fallbackAssistant, message);
      // 最终结果仍然只认 result 消息。
      if (message.type === 'result') {
        finalResult = message;
      }
    }
  } catch (err) {
    // 上游 402(额度用尽)单独识别:这是"立即停止、不要重试"的失败,调用方按退出码 2 处理。
    const fatal402 = looksLikeFatal402(err.message);
    if (fatal402) log('ERROR 402');
    log(`done error cost=? ${oneLine(err.message, 160)}`);
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      error: `调用 Claude Agent SDK 失败: ${err.message}`,
      fatal402,
      durationMs: Date.now() - startedAt,
    };
  }

  if (!finalResult) {
    // 正常完成的 query() 一定会产出恰好一条 result 消息;走到这里说明进程中途被杀、
    // 上游连接异常断开,或者上游根本没有实现完整的 Anthropic Messages 协议。
    log('done error cost=? (SDK 没有产出 result 消息)');
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      error: 'SDK 没有产出 result 消息,任务没有跑完就结束了(可能是进程被中断,或上游端点没有正确实现流式 Anthropic Messages 协议)。',
      fatal402: false,
      durationMs: Date.now() - startedAt,
    };
  }

  // 收尾行:done ok / done error + 成本。这是 tail --follow 的停止信号。
  const joinedErrors = (finalResult.errors ?? []).join('; ');
  const errorText = joinedErrors || (typeof finalResult.result === 'string' ? finalResult.result : '');
  const fatal402 = looksLikeFatal402(errorText);
  if (finalResult.is_error) {
    if (fatal402) log('ERROR 402');
    log(`done error cost=${fmtCost(finalResult.total_cost_usd)}${errorText ? ` ${oneLine(errorText, 160)}` : ''}`);
  } else {
    log(`done ok cost=${fmtCost(finalResult.total_cost_usd)}`);
  }

  return {
    ok: !finalResult.is_error,
    model: friendlyModel,
    resolvedModel: resolved.model,
    baseURL: resolved.baseURL,
    prompt,
    cwd,
    // 只有 success 分支才有最终文本;error 分支(error_during_execution/error_max_turns/...)
    // 没有 result 字段,把 errors 数组透出去让调用方知道具体败在哪。
    result: finalResult.subtype === 'success'
      ? resolveSuccessfulResult(finalResult.result, fallbackAssistant.text)
      : null,
    isError: finalResult.is_error,
    subtype: finalResult.subtype,
    stopReason: finalResult.stop_reason ?? null,
    numTurns: finalResult.num_turns,
    durationMs: finalResult.duration_ms,
    totalCostUsd: finalResult.total_cost_usd,
    sessionId: finalResult.session_id,
    errors: finalResult.errors ?? [],
    // 只在失败分支有意义:上游 402/额度用尽,bin 据此以退出码 2 结束。
    ...(finalResult.is_error ? { fatal402 } : {}),
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
 * 聚合同一条主 Agent assistant 消息的流式文本块，作为空 success result 的候选回退。
 * 新消息会先清空旧候选，子 Agent 消息不参与，避免把工具调用前的过程说明或子任务输出当最终结果。
 */
export function collectFallbackAssistantText(current, message) {
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
 * CLI 在这种情况下回退到最后一条 assistant 文本，避免把已完成的任务报告成空结果。
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

/** 上游网关返回 402(额度/credit budget 用尽)时是"立即停止、不要重试"的失败。 */
function looksLikeFatal402(text) {
  if (!text) return false;
  const s = String(text);
  return /\b402\b/.test(s) || s.toLowerCase().includes('credit budget');
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
 *   durationMs: 12345,
 *   totalCostUsd: 0.0012,
 *   sessionId: "…uuid…",
 *   errors: [],
 * }
 *
 * 失败时至少有 { ok:false, model, error }, 可能没有 resolvedModel/baseURL 等字段
 * (配置阶段就失败的情况,还没走到真正调用 SDK 那一步)。
 */
