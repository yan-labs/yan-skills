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
    ...(systemPrompt ? { systemPrompt } : {}),
  };
}

/**
 * 执行一个子任务。
 *
 * @param {object} params
 * @param {string} params.friendlyModel  models.config.json 里的友好名字,如 "deepseek-v4-flash"
 * @param {string} params.prompt         任务描述
 * @param {string} params.cwd            Agent 的工作目录(读写文件、跑 bash 的作用域)
 * @param {object} params.config         已加载的 models.config.json(见 config.mjs)
 * @param {number} [params.maxTurns]     可选,限制最大工具调用轮数,避免任务跑飞
 * @param {string} [params.systemPrompt] 可选,追加的系统提示
 * @returns {Promise<object>} 见文件底部的返回形状说明
 */
export async function runTask({ friendlyModel, prompt, cwd, config, maxTurns, systemPrompt }) {
  const startedAt = Date.now();

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
      return { ok: false, model: friendlyModel, prompt, cwd, error: err.message, durationMs: Date.now() - startedAt };
    }
    throw err;
  }

  const options = buildQueryOptions({ resolved, cwd, maxTurns, systemPrompt });

  let finalResult = null;
  try {
    for await (const message of query({ prompt, options })) {
      // 只关心最终的 result 消息;中间的 assistant/tool_use/tool_result 消息本工具
      // 不做流式展示(定位是"派出去、跑完拿结果"的批处理工具,不是交互式对话)。
      if (message.type === 'result') {
        finalResult = message;
      }
    }
  } catch (err) {
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      error: `调用 Claude Agent SDK 失败: ${err.message}`,
      durationMs: Date.now() - startedAt,
    };
  }

  if (!finalResult) {
    // 正常完成的 query() 一定会产出恰好一条 result 消息;走到这里说明进程中途被杀、
    // 上游连接异常断开,或者上游根本没有实现完整的 Anthropic Messages 协议。
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      prompt,
      cwd,
      error: 'SDK 没有产出 result 消息,任务没有跑完就结束了(可能是进程被中断,或上游端点没有正确实现流式 Anthropic Messages 协议)。',
      durationMs: Date.now() - startedAt,
    };
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
    result: finalResult.subtype === 'success' ? finalResult.result : null,
    isError: finalResult.is_error,
    subtype: finalResult.subtype,
    stopReason: finalResult.stop_reason ?? null,
    numTurns: finalResult.num_turns,
    durationMs: finalResult.duration_ms,
    totalCostUsd: finalResult.total_cost_usd,
    sessionId: finalResult.session_id,
    errors: finalResult.errors ?? [],
  };
}

/*
 * 返回形状(成功时):
 * {
 *   ok: true,
 *   model: "deepseek-v4-flash",       友好名字
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
