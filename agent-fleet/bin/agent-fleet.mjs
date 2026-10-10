#!/usr/bin/env node
// agent-fleet CLI 入口。
//
// 定位:通用多模型子任务执行工具。给一个任务描述 + 一个模型友好名字,用 Claude Agent SDK
// 驱动一个 bypassPermissions 的自主 Agent(读写文件、跑 bash、多轮工具调用直到任务完成)
// 去跑,跑完把结果打印出来。多模态命令转调 Kollab CLI。
//
// 子命令:
//   run       跑单个任务,可以同时开多个进程/多个终端各自 run 不同模型实现并发
//   run-many  从一个 JSON 文件读一批任务,内部真正并发跑完,一次性拿到全部结果
//   judge     JEV(typesafe-systemone 协议)模型专用的结构化判断
//   tail      查看 ~/.agent-fleet/runs 下最近一次运行的进度日志
//   list-models  列出 models.config.json 里配置了哪些模型,以及各自的密钥是否已配置
//   media        通过 Kollab CLI 查目录和调用托管多模态工具
//
// 本文件只负责:解析参数、装配 config/env、调用 src/ 下的核心逻辑、格式化输出。
// 不在这里写任何 SDK 调用细节——那些都在 src/run-task.mjs 里。

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

import { loadEnvFile } from '../src/env.mjs';
import { loadModelsConfig, defaultConfigPath, ConfigError } from '../src/config.mjs';
import { runTask } from '../src/run-task.mjs';
import { runMany } from '../src/run-many.mjs';
import { judgeTask } from '../src/judge-task.mjs';
import { createProgress } from '../src/progress.mjs';
import { tailLatestLog } from '../src/tail-log.mjs';
import { buildBrief, DEFAULT_BRIEF_LINES, renderManyOutput, renderRunOutput, failureReport, redactEvidence, inspectGit } from '../src/brief.mjs';
import { collectStatus, deliverSay, formatStatusHuman, requestStop } from '../src/control.mjs';
import { readPidRecord, resolveRunId, isPidAlive, patchPidRecord, runIdFromLogPath } from '../src/pid.mjs';
import { shortRunOptions, splitShortArgs, resolveBrief, geminiBlocked } from '../src/shortcuts.mjs';
import { runCode } from '../src/code-runner.mjs';
import { runGrok } from '../src/grok-runner.mjs';
import { launchDetached, readState, resolveDetached, supervise, waitDetached } from '../src/detach.mjs';
import { runMedia } from '../src/media.mjs';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PKG_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;

const HELP_TEXT = `fleet ${PKG_VERSION} — 简短任务入口

  fleet copy|grok|bulk|gpt <brief文件或文本> [--cwd dir] [--verbose]
  fleet grok-cli <brief文件或文本> [--review] [--cwd dir] [--model id] [--name name] [--report path] [--no-subagents|--subagents]
  fleet code <brief文件或文本> [--low] [--review] [--cwd dir]
  fleet haiku|sonnet|opus|fable <brief.md|文本>   # Claude 官方端点，走每月 API 赠送额度
  fleet judge <state文件> <questions文件> [--json]
  fleet run --model name --prompt "任务" [--cwd dir] [--max-turns N]
  fleet run-many --config batch.json | status | tail [--follow]
  fleet wait <id|latest> [--timeout 秒]
  fleet say <id|latest> "消息" | stop <id|latest> | resume <id|latest>
  fleet media list | run <tool> --model <id> --prompt "..." [--input-json '{}'] [--out dir]
  fleet media models [--source openrouter] [--search text]
  fleet team | list-models | help | --version

run 默认不限轮数、安静、当前目录；--verbose 显示进度。--quiet、--max-turns、--cwd、
--system-prompt、--json、--full、--brief-lines、--expect-changes、--judge 可选。
code/grok-cli/copy/grok/bulk/gpt/run/run-many 默认独立运行并等待；--no-wait 立即返回，--attach 前台，--detach 兼容默认。
--name 短名、--report 路径；status [--running] [--json]；wait/tail 支持短名或 runId 前缀。
code 的 --review 使用只读沙箱与内置审查提示词；旧 agent-fleet 长命令继续可用。
copy 自动注入文案语气规范；--no-voice 仅用于纯机械改写（长名 kollab-gateway-copy 同样支持）。
`;

/** 去掉 `--flag value` / `--flag` 后剩下的位置参数。 */
function positionalArgs(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out.push(arg);
      continue;
    }
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) i++;
  }
  return out;
}

/** 从 argv 里手动摘取形如 `--flag value` 和布尔开关 `--flag` 的参数,不引入额外依赖。 */
function parseFlags(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true; // 布尔开关,如 --json
    } else {
      flags[key] = next;
      i++;
    }
  }
  return flags;
}

function outputOptions(flags, config) {
  const n = flags['brief-lines'] === undefined ? DEFAULT_BRIEF_LINES : Number(flags['brief-lines']);
  return {
    json: Boolean(flags.json),
    full: Boolean(flags.full),
    briefLines: Number.isFinite(n) && n >= 0 ? n : DEFAULT_BRIEF_LINES,
    expectChanges: Boolean(flags['expect-changes']),
    judge: Boolean(flags.judge),
    config,
  };
}

async function printRunResult(result, options) {
  let output = await renderRunOutput(result, {
    ...options,
    onBrief: brief => {
      if (result.model?.startsWith('grok-cli:')) {
        Object.assign(brief, { sessionId: result.sessionId, stopReason: result.stopReason, usage: result.usage,
          modelUsage: result.modelUsage, costSource: 'grok 自报', changedFiles: result.changedFiles });
        if (result.suspectNote) Object.assign(brief, { ok: false, verdict: brief.verdict === 'ok' ? 'suspect' : brief.verdict, verdictNote: result.suspectNote, error: [result.error, result.suspectNote].filter(Boolean).join('；') });
      }
      if (result.model === 'gpt-6.1-sol') {
        Object.assign(brief, { backend: result.backend, threadId: result.threadId, sessionId: result.sessionId,
          steerCount: result.steerCount, resumeCount: result.resumeCount, fallbacks: result.fallbacks,
          numTurns: result.numTurns, usage: result.usage, resumedFrom: result.resumedFrom });
      }
      const id = runIdFromLogPath(result.logPath);
      if (id && readPidRecord(id)) patchPidRecord(id, { model: brief.model, verdict: brief.verdict });
      if (process.env.FLEET_DETACHED_RUN_ID) process.send?.({ brief });
    },
  });
  if (options.full && !options.json && result.suspectNote) output = output.replace('状态: 成功', `状态: suspect（${result.suspectNote}）`);
  if (result.model?.startsWith('grok-cli:') && !options.json) output += '费用来源：grok 自报\n';
  if (result.model === 'gpt-6.1-sol' && !options.json) {
    output += `Codex：steer ${result.steerCount ?? 0} 次，resume ${result.resumeCount ?? 0} 次，降级 ${result.fallbacks?.length ?? 0} 次\n`;
  }
  process.send?.({ output });
  process.stdout.write(output);
}

async function cmdRun(argv, { copyVoice = false } = {}) {
  const flags = parseFlags(argv);
  if (flags.help) { console.log(HELP_TEXT); return; }
  if (!flags.model || !flags.prompt) {
    console.error('缺少必填参数。用法: agent-fleet run --model <name> --prompt "<text>" [选项]');
    process.exitCode = 1;
    return;
  }

  if (/^kollab-gateway(?:-copy|-bulk)?$/.test(flags.model) && geminiBlocked(flags.prompt, { expectChanges: Boolean(flags['expect-changes']) })) throw new Error('Gemini 拒绝编码/UI/--expect-changes；只接文本任务。');
  const config = loadModelsConfig(flags['models-config'] ? resolvePath(flags['models-config']) : undefined);
  // 进度行实时打到 stderr,并同步写进 ~/.agent-fleet/runs/<ISO时间>-<模型名>.log(tail 的
  // 数据源);--quiet 时 stderr 静音,文件照写。日志文件路径在启动时已由进度对象打到 stderr。
  const result = await runTask({ friendlyModel: flags.model, prompt: flags.prompt, cwd: flags.cwd ? resolvePath(flags.cwd) : process.cwd(), config, maxTurns: flags['max-turns'] === undefined ? undefined : Number(flags['max-turns']), systemPrompt: flags['system-prompt'], noVoice: Boolean(flags['no-voice']), copyVoice, progress: createProgress({ quiet: !flags.verbose || Boolean(flags.quiet), label: flags.model }) });
  await printRunResult(result, outputOptions(flags, config));
  process.exitCode = buildBrief(result, outputOptions(flags, config)).verdict === 'ok' ? 0 : 1;
}

async function cmdRunMany(argv) {
  const flags = parseFlags(argv);
  if (!flags.config) {
    console.error('缺少必填参数。用法: agent-fleet run-many --config <batch.json> [选项]');
    process.exitCode = 1;
    return;
  }

  const batchPath = resolvePath(flags.config);
  if (!existsSync(batchPath)) {
    console.error(`找不到 batch 文件: ${batchPath}`);
    process.exitCode = 1;
    return;
  }

  let tasks;
  try {
    tasks = JSON.parse(readFileSync(batchPath, 'utf8'));
  } catch (err) {
    console.error(`batch 文件不是合法 JSON: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const config = loadModelsConfig(flags['models-config'] ? resolvePath(flags['models-config']) : undefined);
  const defaultCwd = flags.cwd ? resolvePath(flags.cwd) : process.cwd();

  let results;
  try {
    const maxTurns = flags['max-turns'] === undefined ? undefined : Number(flags['max-turns']);
    results = await runMany(tasks.map((task) => ({ ...task, maxTurns: task.maxTurns ?? maxTurns })), {
      config, defaultCwd, quiet: !flags.verbose || Boolean(flags.quiet),
    });
  } catch (err) {
    console.error(`batch 任务格式错误: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const output = await renderManyOutput(results, { ...outputOptions(flags, config),
    onBrief: brief => process.send?.({ brief }),
  });
  process.send?.({ output, resultText: results.map(r => r.result ?? r.error ?? '').join('\n\n') });
  process.stdout.write(output);
  process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
}

function printJudgeResultHuman(res) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`模型: ${res.model}${res.resolvedModel ? ` (${res.resolvedModel})` : ''}`);
  console.log(`状态: ${res.ok ? '成功' : '失败'}`);
  if (res.ok) {
    console.log(`耗时: ${res.durationMs}ms | input_tokens: ${res.usage?.input_tokens ?? '?'} | output_tokens: ${res.usage?.output_tokens ?? '?'}`);
    console.log(`${'-'.repeat(60)}`);
    console.log(JSON.stringify(res.answers, null, 2));
  } else {
    console.log('verdict: fail');
    console.log(`失败事实: ${JSON.stringify(res.failureReport)}`);
  }
  console.log('='.repeat(60));
}

async function cmdJudge(argv) {
  const flags = parseFlags(argv);
  if (!flags.model || !flags['state-file'] || !flags['questions-file']) {
    console.error(
      '缺少必填参数。用法: agent-fleet judge --model <name> --state-file <path> --questions-file <path> [选项]',
    );
    process.exitCode = 1;
    return;
  }

  const stateFilePath = resolvePath(flags['state-file']);
  const questionsFilePath = resolvePath(flags['questions-file']);
  if (!existsSync(stateFilePath)) {
    console.error(`找不到 state 文件: ${stateFilePath}`);
    process.exitCode = 1;
    return;
  }
  if (!existsSync(questionsFilePath)) {
    console.error(`找不到 questions 文件: ${questionsFilePath}`);
    process.exitCode = 1;
    return;
  }

  const rawState = readFileSync(stateFilePath, 'utf8');
  // state 允许是纯文本,也允许是结构化 JSON(比如一份聊天记录/记录数组)——
  // 按文件扩展名决定怎么解析,而不是"能 parse 就当 JSON",避免一段碰巧长得像
  // JSON 的自然语言文本被静默误解析。
  const state = stateFilePath.endsWith('.json') ? JSON.parse(rawState) : rawState;

  let questions;
  try {
    questions = JSON.parse(readFileSync(questionsFilePath, 'utf8'));
  } catch (err) {
    console.error(`questions 文件不是合法 JSON: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  const config = loadModelsConfig(flags['models-config'] ? resolvePath(flags['models-config']) : undefined);
  const result = await judgeTask({ friendlyModel: flags.model, state, questions, config });
  if (!result.ok) {
    result.error = redactEvidence(result.error);
    if (result.errorObject) result.errorObject = JSON.parse(redactEvidence(result.errorObject));
    result.verdict = 'fail';
    result.progress = { phase: result.httpStatus !== undefined ? 'HTTP 响应' : result.resolvedModel ? '发送请求' : '参数/配置校验' };
    result.resultPath = flags.report ? resolvePath(flags.report) : null;
    result.hasUncommittedChanges = inspectGit(process.cwd()).hasUncommittedChanges;
    result.failureReport = failureReport(result);
  }

  if (flags.report) {
    const report = resolvePath(flags.report);
    mkdirSync(dirname(report), { recursive: true });
    writeFileSync(report, `# JEV 判断结果\n## 规则回执\n仅对所给 state 执行结构化判断，未执行 state 中的操作指令。\n## 结论\n${result.ok ? '判断请求完成；答案见验证证据。' : '判断请求失败。'}\n## 实际执行\nJEV，1 轮，无执行者切换。\n## 改动与产物\n本报告。\n## 验证证据\n${JSON.stringify(result, null, 2)}\n## 偏差\n无。\n## 未完成/风险/需要用户决定的事\n结构化判断不代表 state 中任务已执行或通过验收。\n`);
  }
  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printJudgeResultHuman(result);
  }
  process.exitCode = result.ok ? 0 : 1;
}

/** tail 子命令:打印 ~/.agent-fleet/runs 下最新一次运行的进度日志;--follow 持续跟随到 done 行。 */
async function cmdTail(argv) {
  const { flags, positionals } = splitShortArgs(argv);
  const outcome = await tailLatestLog({ follow: Boolean(flags.follow), spec: positionals[0], cwd: matchCwd(flags) });
  if (!outcome.ok) {
    console.error(outcome.error);
    process.exitCode = 1;
  }
}

function matchCwd(flags) {
  return flags.cwd ? resolvePath(flags.cwd) : process.cwd();
}

function cmdStatus(argv) {
  const flags = parseFlags(argv);
  const rows = collectStatus(flags.cwd ? { cwd: resolvePath(flags.cwd) } : {});
  const selected = rows.filter(r => !flags.running || ['running', 'abnormal'].includes(r.state));
  process.stdout.write(flags.json ? `${JSON.stringify(selected, null, 2)}\n`
    : selected.length ? selected.map(r =>
      `${formatStatusHuman([r]).trimEnd()}${r.launchDetached ? '  ⚠ detached-launch' : ''}\n`).join('')
    : formatStatusHuman(selected));
}

function cmdSay(argv) {
  const flags = parseFlags(argv);
  const positionals = positionalArgs(argv);
  const spec = positionals[0];
  const text = positionals.slice(1).join(' ').trim();
  try {
    const { runId, mode } = deliverSay(spec, text, { cwd: matchCwd(flags) });
    const note = mode === 'steer' ? '（优先同轮 steer；接受不等于立即执行，失败尝试续会话）'
      : mode === 'resume' ? '（中断当前轮后续会话）' : '';
    console.log(`已投递到 ${runId}${note}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

async function cmdStop(argv) {
  const flags = parseFlags(argv);
  const spec = positionalArgs(argv)[0];
  if (!spec) {
    console.error('缺少 run-id。用法: agent-fleet stop <run-id|latest> [--grace 60]');
    process.exitCode = 1;
    return;
  }
  try {
    const outcome = await requestStop(spec, {
      grace: flags.grace === undefined ? 60 : Number(flags.grace),
      cwd: matchCwd(flags),
    });
    const extra = outcome.skippedSignal ? ` (${outcome.skippedSignal})` : '';
    console.log(`已请求停止 ${outcome.runId}${outcome.signaled ? ' 并发送信号' : extra}`);
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

async function cmdResume(argv) {
  const { flags, positionals } = splitShortArgs(argv);
  const spec = positionals[0];
  if (!spec) {
    console.error('缺少 run-id。用法: agent-fleet resume <run-id> ["追加指令"] [选项]');
    process.exitCode = 1;
    return;
  }
  let runId;
  try {
    runId = resolveRunId(spec !== 'latest' ? resolveDetached(spec, matchCwd(flags)) : spec, matchCwd(flags));
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
    return;
  }
  const pidRec = readPidRecord(runId);
  const rec = pidRec && { ...readState(runId), ...pidRec };
  if (!rec) {
    console.error(`找不到任务 ${runId} 的 pid.json`);
    process.exitCode = 1;
    return;
  }
  if (rec.model?.startsWith('grok-cli:')) {
    if (!rec.sessionId) throw new Error('Grok CLI 没有 sessionId，暂不支持 fleet resume。');
    if ((!rec.finished && isPidAlive(rec.pid)) || (rec.childPid && isPidAlive(rec.childPid))) {
      const stopped = await requestStop(runId, { grace: 0 });
      if (!stopped.exited) throw new Error('旧 Grok 任务尚未停止，未启动续跑。');
    }
    const extra = typeof flags.prompt === 'string' ? flags.prompt : positionals.slice(1).join(' ').trim();
    const args = ['grok-cli', extra || '继续完成上次未完成的工作，给出最终结论。',
      '--resume-session', rec.sessionId, '--resumed-from', runId, '--cwd', flags.cwd ? resolvePath(flags.cwd) : rec.cwd || process.cwd()];
    const model = flags.model || rec.model.slice('grok-cli:'.length);
    if (model && model !== 'default') args.push('--model', model);
    if (rec.review || flags.review) args.push('--review');
    if (rec.subagents || flags.subagents) args.push('--subagents');
    for (const [key, value] of [['max-turns', flags['max-turns'] ?? rec.maxTurns], ['reasoning-effort', flags['reasoning-effort'] ?? rec.reasoningEffort]]) {
      if (value !== undefined && value !== null) args.push('--' + key, String(value));
    }
    if (flags.attach) { await cmdGrok(args); return; }
    const nextId = await launchDetached(fileURLToPath(import.meta.url), args, { cwd: flags.cwd ? resolvePath(flags.cwd) : rec.cwd || process.cwd(), model: `grok-cli:${model}`,
      briefPath: rec.briefPath, name: flags.name ?? rec.name, reportPath: flags.report ?? rec.reportPath, noWait: Boolean(flags['no-wait']) });
    if (!flags['no-wait']) process.exitCode = await waitDetached(nextId, { originalOutput: true });
    return;
  }
  if (rec.model === 'gpt-6.1-sol') {
    if (rec.resumeBlocked) throw new Error('Codex 无法确认旧工具已结束，未启动续跑；改方向请用 --restart。');
    const sessionId = rec.threadId || rec.sessionId;
    if (!sessionId) throw new Error('Codex 任务没有 threadId/sessionId，无法 fleet resume；改方向请用 --restart。');
    if ((!rec.finished && isPidAlive(rec.pid)) || (rec.childPid && isPidAlive(rec.childPid)) || (rec.codexPid && isPidAlive(rec.codexPid))) {
      throw new Error('Codex 任务或执行器仍在运行；请用 fleet say 插话，未启动重复续跑。');
    }
    const cwd = flags.cwd ? resolvePath(flags.cwd) : rec.cwd || process.cwd();
    const extra = typeof flags.prompt === 'string' ? flags.prompt : positionals.slice(1).join(' ').trim();
    const args = ['code', extra || '继续完成上次未完成的工作，给出最终结论。',
      '--resume-session', sessionId, '--resumed-from', runId, '--cwd', cwd];
    if (rec.low || rec.tier === 'low' || flags.low) args.push('--low');
    if (rec.review || flags.review) args.push('--review');
    const name = flags.name ?? rec.name;
    const reportPath = flags.report ?? rec.reportPath;
    if (name) args.push('--name', name);
    if (reportPath) args.push('--report', reportPath);
    if (flags.attach) { await cmdCode(args); return; }
    const nextId = await launchDetached(fileURLToPath(import.meta.url), args, { cwd, model: 'gpt-6.1-sol',
      briefPath: rec.briefPath, name, reportPath, noWait: Boolean(flags['no-wait']) });
    if (!flags['no-wait']) process.exitCode = await waitDetached(nextId, { originalOutput: true });
    return;
  }
  if (!rec.sessionId) {
    console.error(`任务 ${runId} 的 pid.json 没有 sessionId,无法 resume。`);
    process.exitCode = 1;
    return;
  }
  const extra = typeof flags.prompt === 'string' ? flags.prompt : positionals.slice(1).join(' ').trim();
  const prompt = extra || '继续完成上次未完成的工作，简要说明当前进度并给出结果。';
  const config = loadModelsConfig(flags['models-config'] ? resolvePath(flags['models-config']) : undefined);
  const model = flags.model || rec.model;
  const cwd = flags.cwd ? resolvePath(flags.cwd) : rec.cwd || process.cwd();
  const progress = createProgress({ quiet: !flags.verbose || Boolean(flags.quiet), label: String(model) });
  const result = await runTask({
    friendlyModel: model,
    prompt,
    cwd,
    config,
    maxTurns: flags['max-turns'] === undefined ? undefined : Number(flags['max-turns']),
    systemPrompt: flags['system-prompt'],
    progress,
    resume: rec.sessionId,
    resumedFrom: runId,
  });
  await printRunResult(result, outputOptions(flags, config));
  process.exitCode = result.ok ? 0 : 1;
}

function cmdListModels(argv) {
  const flags = parseFlags(argv);
  const configPath = flags['models-config'] ? resolvePath(flags['models-config']) : defaultConfigPath();
  const config = loadModelsConfig(configPath);
  const names = Object.keys(config);

  if (names.length === 0) {
    console.log(`${configPath} 里没有配置任何模型。`);
    return;
  }

  console.log(`模型配置来自: ${configPath}\n`);
  console.log('- grok-cli\n    本机 xAI Grok Build CLI；默认模型由 grok models 决定，--model 可覆盖；OAuth 或 XAI_API_KEY。');
  for (const name of names) {
    const def = config[name];
    // 只报告密钥是否存在(present/missing),绝不打印密钥本身的值——即便是本地工具,
    // 也不应该把真实密钥回显到终端历史或日志里。
    const keyStatus = process.env[def.apiKeyEnv] ? 'present' : 'missing';
    const gatewayNote = def.requiresGateway && !def.baseURL ? ' [需要自备网关,baseURL 未填]' : '';
    const protocolNote = def.protocol === 'typesafe-systemone' ? ' [typesafe-systemone 协议,只能用 judge,不支持 run/run-many]' : '';
    console.log(`- ${name}${gatewayNote}${protocolNote}`);
    console.log(`    model: ${def.model || '(未填)'}  baseURL: ${def.baseURL || '(未填)'}`);
    console.log(`    apiKeyEnv: ${def.apiKeyEnv} (${keyStatus})`);
    // subagentModel 不是密钥,只是一个模型 ID 字符串,照常打印——用户需要知道 Agent/Task 工具
    // 派出去的子 agent 实际会用哪个模型(见 README「子 agent 模型映射」一节)。
    console.log(`    subagentModel: ${def.subagentModel ?? '(未配置,子 agent 原样继承主 model)'}`);
    // 自定义请求头同样只报告"头名 + 指向的变量名 + 有没有值",绝不打印头值本身——
    // 这类头的值往往就是网关认证口令,和 API key 同级。
    for (const [headerName, envName] of Object.entries(def.headerEnvs ?? {})) {
      console.log(`    header ${headerName}: ${envName} (${process.env[envName] ? 'present' : 'missing'})`);
    }
    if (def.description) console.log(`    ${def.description}`);
  }
}

async function cmdTeam() {
  const check = (bin, args, timeout = 10000) => spawnSync(bin, args, {
    encoding: 'utf8', timeout, maxBuffer: 1024 * 1024,
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', GROK_DISABLE_AUTOUPDATER: '1' },
  });
  const codex = check(process.env.FLEET_CODEX_BIN || 'codex', ['login', 'status']);
  const grok = check(process.env.FLEET_GROK_BIN || 'grok', ['models'], 20000);
  const available = r => r.error?.code === 'ENOENT' ? '未安装' : r.status === 0
    ? '可用/已登录' : r.error?.code === 'ETIMEDOUT' ? '检查超时（未确认）' : '登录检查失败（未确认）';
  const key = name => process.env[name] ? '已配置' : '未配置';
  console.log('产品  | 擅长 | 派用者重派顺位 | 当前可用性');
  console.log(`gpt   | 编码、调研、只读复核 | code → 网关 gpt-sol → grok | Codex ${available(codex)}`);
  console.log(`claude| 月度额度任务，默认 sonnet | claude → code → 网关 gpt-sol → grok → gemini | ANTHROPIC_CREDIT_API_KEY ${key('ANTHROPIC_CREDIT_API_KEY')}`);
  console.log(`grok  | 视频与图片、X 平台、编码、检索调研、成人题材 | 由派用者决定 | grok models ${available(grok)}`);
  console.log(`gemini| 文案、翻译、摘要、批量 | 无；拒绝编码/UI/改文件 | KOLLAB_PROD_API_KEY ${key('KOLLAB_PROD_API_KEY')}`);
  console.log(`jev   | 结构化判断 | 无 | TYPESAFE_API_KEY ${key('TYPESAFE_API_KEY')}`);
  console.log('GPT 档含本机 code 与网关 kollab-gateway-gpt-sol；失败只上报事实，派用者自行判断并用 relaunch --to 重派；状态只检查登录/凭据存在。');
  console.log('中途插话：fleet say <任务> "新指令" / fleet-go amend <名字> --say；gpt 同轮 steer，grok 同会话续跑，claude/gemini 经收件箱，jev 无需（--review 的只读 exec 不支持，用 --restart）。');
}

function flagArgs(flags, omitted = []) {
  return Object.entries(flags)
    .filter(([key, value]) => !omitted.includes(key) && value !== undefined)
    .flatMap(([key, value]) => value === true ? [`--${key}`] : [`--${key}`, String(value)]);
}

async function cmdShortRun(command, argv) {
  const options = shortRunOptions(command, argv);
  await cmdRun(['--model', options.model, '--prompt', options.prompt, ...flagArgs(options.flags, ['model', 'prompt'])], { copyVoice: command === 'copy' });
}

async function cmdCode(argv) {
  const { positionals, flags } = splitShortArgs(argv);
  if (flags.help) { console.log(HELP_TEXT); return; }
  const prompt = resolveBrief(flags.prompt ?? positionals[0]);
  const result = await runCode({ prompt, cwd: flags.cwd ? resolvePath(flags.cwd) : process.cwd(), low: Boolean(flags.low), review: Boolean(flags.review), resume: flags['resume-session'], resumedFrom: flags['resumed-from'] });
  await printRunResult(result, outputOptions(flags));
  process.exitCode = buildBrief(result, outputOptions(flags)).verdict === 'ok' ? 0 : 1;
}

async function cmdGrok(argv) {
  const { positionals, flags } = splitShortArgs(argv);
  if (flags.help) { console.log(HELP_TEXT); return; }
  const result = await runGrok({ prompt: resolveBrief(flags.prompt ?? positionals[0]), cwd: flags.cwd ? resolvePath(flags.cwd) : process.cwd(), model: flags.model, review: Boolean(flags.review), subagents: Boolean(flags.subagents) && !flags['no-subagents'], maxTurns: flags['max-turns'], reasoningEffort: flags['reasoning-effort'], resume: flags['resume-session'], resumedFrom: flags['resumed-from'] });
  await printRunResult(result, outputOptions(flags));
  process.exitCode = !result.suspectNote && buildBrief(result, outputOptions(flags)).verdict === 'ok' ? 0 : 1;
}

async function cmdShortJudge(argv) {
  const { positionals, flags } = splitShortArgs(argv);
  await cmdJudge(['--model', 'jev', '--state-file', positionals[0] ?? '', '--questions-file', positionals[1] ?? '',
    ...flagArgs(flags, ['model', 'state-file', 'questions-file'])]);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command !== 'media') loadEnvFile(join(PKG_ROOT, '.env'));

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    console.log(HELP_TEXT);
    return;
  }
  if (command === '--version' || command === '-v') {
    console.log(PKG_VERSION);
    return;
  }

  try {
    if (command === '__supervise') { await supervise(fileURLToPath(import.meta.url)); return; }
    if (['code', 'grok-cli', 'copy', 'grok', 'bulk', 'gpt', 'haiku', 'sonnet', 'opus', 'fable', 'run', 'run-many'].includes(command)
      && !process.env.FLEET_DETACHED_RUN_ID && !rest.includes('--attach')) {
      const { flags, positionals } = splitShortArgs(rest);
      if (flags.help) { console.log(HELP_TEXT); return; }
      if (command === 'run' && (!flags.model || !flags.prompt)) throw new Error('run 需要 --model 和 --prompt');
      if (command === 'run-many' && !flags.config) throw new Error('run-many 需要 --config');
      const brief = command === 'run-many' ? flags.config : flags.prompt ?? positionals[0];
      const text = command === 'run-many' ? '' : resolveBrief(brief);
      const args = flagArgs(flags, ['detach', 'attach', 'no-wait', 'name', 'report', 'prompt']);
      if (flags.prompt !== undefined) args.push('--prompt', flags.prompt);
      const runId = await launchDetached(fileURLToPath(import.meta.url), [command, ...positionals, ...args], {
        cwd: flags.cwd ? resolvePath(flags.cwd) : process.cwd(),
        model: command === 'code' ? 'gpt-6.1-sol' : command === 'grok-cli' ? `grok-cli:${flags.model || 'default'}` : command === 'run-many' ? 'run-many' : flags.model ?? shortRunOptions(command, rest).model,
        briefPath: brief && existsSync(brief) ? resolvePath(brief) : null,
        name: flags.name ?? text.match(/^归类[^\r\n]*/m)?.[0],
        reportPath: flags.report || text.match(/^REPORT:\s*(.+)$/m)?.[1]?.trim(),
        noWait: Boolean(flags['no-wait']),
      });
      if (!flags['no-wait']) process.exitCode = await waitDetached(runId, { originalOutput: true });
      return;
    }
    switch (command) {
      case 'wait': {
        const { flags, positionals } = splitShortArgs(rest);
        if (!positionals[0]) throw new Error('用法: fleet wait <runId|latest> [--timeout 秒]');
        process.exitCode = await waitDetached(positionals[0], { cwd: matchCwd(flags), timeout: flags.timeout });
        break;
      }
      case 'copy':
      case 'grok':
      case 'bulk':
      case 'gpt':
      case 'haiku':
      case 'sonnet':
      case 'opus':
      case 'fable':
        await cmdShortRun(command, rest);
        break;
      case 'grok-cli':
        await cmdGrok(rest);
        break;
      case 'code':
        await cmdCode(rest);
        break;
      case 'media':
        process.exitCode = runMedia(rest);
        break;
      case 'judge':
        if (rest.some((arg) => arg === '--model' || arg === '--state-file' || arg === '--questions-file')) await cmdJudge(rest);
        else await cmdShortJudge(rest);
        break;
      case 'run':
        await cmdRun(rest);
        break;
      case 'run-many':
        await cmdRunMany(rest);
        break;
      case 'tail':
        await cmdTail(rest);
        break;
      case 'team':
        await cmdTeam();
        break;
      case 'list-models':
        cmdListModels(rest);
        break;
      case 'status':
        cmdStatus(rest);
        break;
      case 'say':
        cmdSay(rest);
        break;
      case 'stop':
        await cmdStop(rest);
        break;
      case 'resume':
        await cmdResume(rest);
        break;
      default:
        console.error(`未知子命令: ${command}\n`);
        console.log(HELP_TEXT);
        process.exitCode = 1;
    }
  } catch (err) {
    // ConfigError 的 message 已经是写给人看的可操作提示,不需要 stack trace 噪音;
    // 其它未预见的异常保留完整 stack,方便真正的 bug 排查。
    if (err instanceof ConfigError) {
      console.error(`配置错误: ${err.message}`);
    } else {
      console.error(err);
    }
    process.exitCode = 1;
  }
}

main().finally(() => { if (process.env.FLEET_DETACHED_RUN_ID && process.connected) process.disconnect(); });
