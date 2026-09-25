#!/usr/bin/env node
// agent-fleet CLI 入口。
//
// 定位:通用多模型子任务执行工具。给一个任务描述 + 一个模型友好名字,用 Claude Agent SDK
// 驱动一个 bypassPermissions 的自主 Agent(读写文件、跑 bash、多轮工具调用直到任务完成)
// 去跑,跑完把结果打印出来。纯本地工具,不经过任何 Kollab 基础设施,模型接的是用户自己的
// 第三方 API key。
//
// 子命令:
//   run       跑单个任务,可以同时开多个进程/多个终端各自 run 不同模型实现并发
//   run-many  从一个 JSON 文件读一批任务,内部真正并发跑完,一次性拿到全部结果
//   judge     JEV(typesafe-systemone 协议)模型专用的结构化判断
//   tail      查看 ~/.agent-fleet/runs 下最近一次运行的进度日志
//   list-models  列出 models.config.json 里配置了哪些模型,以及各自的密钥是否已配置
//
// 本文件只负责:解析参数、装配 config/env、调用 src/ 下的核心逻辑、格式化输出。
// 不在这里写任何 SDK 调用细节——那些都在 src/run-task.mjs 里。

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve as resolvePath } from 'node:path';

import { loadEnvFile } from '../src/env.mjs';
import { loadModelsConfig, defaultConfigPath, resolveModel, ConfigError } from '../src/config.mjs';
import { runTask } from '../src/run-task.mjs';
import { runMany } from '../src/run-many.mjs';
import { judgeTask } from '../src/judge-task.mjs';
import { createProgress } from '../src/progress.mjs';
import { tailLatestLog } from '../src/tail-log.mjs';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PKG_VERSION = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8')).version;

const HELP_TEXT = `agent-fleet ${PKG_VERSION} — 通用多模型子任务执行工具

用法:
  agent-fleet run --model <友好名字> --prompt "<任务描述>" [选项]
  agent-fleet run-many --config <batch.json> [选项]
  agent-fleet judge --model <友好名字> --state-file <path> --questions-file <path> [选项]
  agent-fleet tail [--follow]
  agent-fleet list-models
  agent-fleet --help | --version

run 选项:
  --model <name>          必填。models.config.json 里的友好名字(如 deepseek-v4-flash)
  --prompt <text>          必填。任务描述
  --cwd <dir>               Agent 读写文件/跑 bash 的工作目录,默认当前目录
  --max-turns <n>           限制最大工具调用轮数
  --system-prompt <text>    追加的系统提示
  --json                    输出结构化 JSON 而不是人类可读文本
  --quiet                   进度不输出到 stderr,只写入日志文件
                            (~/.agent-fleet/runs/<ISO时间>-<模型名>.log,可用 tail 查看)

run-many 选项:
  --config <path>           必填。批量任务文件,JSON 数组,每项 { model, prompt, cwd? }
  --cwd <dir>               任务没写 cwd 时的默认工作目录
  --json                    输出结构化 JSON 而不是人类可读文本
  --quiet                   同 run;每个任务的日志 label 是「#序号-模型名」

tail 选项:
  --follow                  打印最新日志后持续跟随新增内容,直到出现 done ok / done error 行

judge 选项(protocol: typesafe-systemone 的模型专用,如 jev——不生成文本、不支持多轮
工具调用,给它一段 state + 类型化 questions,拿回结构化判断,不能用 run/run-many):
  --model <name>            必填。models.config.json 里 protocol 是 typesafe-systemone 的友好名字(如 jev)
  --state-file <path>       必填。要评估的内容,纯文本文件,或 .json 结尾时按 JSON 解析成结构化 state
  --questions-file <path>    必填。JSON 文件:{ 问题key: { type: "noul"|"choice"|"score", instructions, criteria? } }
  --json                    输出结构化 JSON 而不是人类可读文本

全局选项:
  --models-config <path>    覆盖默认的 models.config.json 路径

示例:
  agent-fleet run --model deepseek-v4-flash --prompt "帮我调研一下 XX 竞品有哪些定价策略"
  agent-fleet run --model kimi --prompt "把 README 翻译成英文" --cwd ~/some-project --json
  agent-fleet run-many --config batch.json
  agent-fleet judge --model jev --state-file ticket.txt --questions-file questions.json --json
  agent-fleet tail --follow
`;

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

function printResultHuman(res) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`模型: ${res.model}${res.resolvedModel ? ` (${res.resolvedModel})` : ''}`);
  if (res.cwd) console.log(`工作目录: ${res.cwd}`);
  console.log(`状态: ${res.ok ? '成功' : '失败'}`);
  if (res.ok) {
    console.log(`耗时: ${res.durationMs}ms | 轮数: ${res.numTurns} | 预估成本: $${res.totalCostUsd?.toFixed?.(4) ?? res.totalCostUsd}`);
    console.log(`${'-'.repeat(60)}`);
    console.log(res.result ?? '(没有文本结果)');
  } else {
    console.log(`错误: ${res.error ?? res.errors?.join('; ') ?? '未知错误'}`);
  }
  console.log('='.repeat(60));
}

async function cmdRun(argv) {
  const flags = parseFlags(argv);
  if (!flags.model || !flags.prompt) {
    console.error('缺少必填参数。用法: agent-fleet run --model <name> --prompt "<text>" [选项]');
    process.exitCode = 1;
    return;
  }

  const config = loadModelsConfig(flags['models-config'] ? resolvePath(flags['models-config']) : undefined);
  // 进度行实时打到 stderr,并同步写进 ~/.agent-fleet/runs/<ISO时间>-<模型名>.log(tail 的
  // 数据源);--quiet 时 stderr 静音,文件照写。日志文件路径在启动时已由进度对象打到 stderr。
  const progress = createProgress({ quiet: Boolean(flags.quiet), label: String(flags.model) });
  const result = await runTask({
    friendlyModel: flags.model,
    prompt: flags.prompt,
    cwd: flags.cwd ? resolvePath(flags.cwd) : process.cwd(),
    config,
    maxTurns: flags['max-turns'] ? Number(flags['max-turns']) : undefined,
    systemPrompt: flags['system-prompt'],
    progress,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printResultHuman(result);
  }
  // 退出码:成功 0;失败 1;失败且是上游 402/credit budget 用尽(不重试、立即停)2。
  process.exitCode = result.ok ? 0 : result.fatal402 ? 2 : 1;
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
    results = await runMany(tasks, { config, defaultCwd, quiet: Boolean(flags.quiet) });
  } catch (err) {
    console.error(`batch 任务格式错误: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const res of results) printResultHuman(res);
    const failed = results.filter((r) => !r.ok).length;
    console.log(`\n共 ${results.length} 个任务,成功 ${results.length - failed} 个,失败 ${failed} 个。`);
  }
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
    console.log(`错误: ${res.error ?? '未知错误'}`);
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

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printJudgeResultHuman(result);
  }
  process.exitCode = result.ok ? 0 : 1;
}

/** tail 子命令:打印 ~/.agent-fleet/runs 下最新一次运行的进度日志;--follow 持续跟随到 done 行。 */
async function cmdTail(argv) {
  const flags = parseFlags(argv);
  const outcome = await tailLatestLog({ follow: Boolean(flags.follow) });
  if (!outcome.ok) {
    console.error(outcome.error);
    process.exitCode = 1;
  }
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
    // 自定义请求头同样只报告"头名 + 指向的变量名 + 有没有值",绝不打印头值本身——
    // 这类头的值往往就是网关认证口令,和 API key 同级。
    for (const [headerName, envName] of Object.entries(def.headerEnvs ?? {})) {
      console.log(`    header ${headerName}: ${envName} (${process.env[envName] ? 'present' : 'missing'})`);
    }
    if (def.description) console.log(`    ${def.description}`);
  }
}

async function main() {
  loadEnvFile(join(PKG_ROOT, '.env'));

  const [command, ...rest] = process.argv.slice(2);

  if (!command || command === '--help' || command === '-h') {
    console.log(HELP_TEXT);
    return;
  }
  if (command === '--version' || command === '-v') {
    console.log(PKG_VERSION);
    return;
  }

  try {
    switch (command) {
      case 'run':
        await cmdRun(rest);
        break;
      case 'run-many':
        await cmdRunMany(rest);
        break;
      case 'judge':
        await cmdJudge(rest);
        break;
      case 'tail':
        await cmdTail(rest);
        break;
      case 'list-models':
        cmdListModels(rest);
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

main();
