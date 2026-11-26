// Kollab 多模态短命令：只转调本机 kollab CLI，下载与认证由它处理。
import { spawnSync } from 'node:child_process';
import { runGeminiApi } from './gemini-api-runner.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const HELP = `fleet media list
fleet media run <tool> --model <id> --prompt "..." [--input-json '{...}'] [--out dir]
fleet media models [--source openrouter] [--search text]`;

/** 执行 CLI 并解析其 JSON 回执，避免把完整响应直接打印到终端。 */
function call(args) {
  const child = spawnSync('kollab', args, { encoding: 'utf8', env: process.env, maxBuffer: 10 * 1024 * 1024 });
  let result;
  try { result = JSON.parse(child.stdout); } catch { /* CLI 错误可能只在 stderr。 */ }
  if (child.error || child.status !== 0 || result?.ok === false) {
    let error;
    try { error = JSON.parse(child.stderr)?.error; } catch { /* 保留简短纯文本错误。 */ }
    const reason = String(error ?? result?.error ?? child.error?.message ?? child.stderr?.trim() ?? '调用失败').split('\n')[0];
    throw new Error(/No credentials available|Standalone API key is missing/i.test(reason)
      ? '缺少 Kollab 凭据：设置 KOLLAB_API_KEY（或 KOLLAB_STANDALONE_API_KEY），可用 kollab api-key create 创建；也可先 kollab login。'
      : reason.replace(/kollab_live_[A-Za-z0-9_-]+/g, '[已隐藏密钥]'));
  }
  return result?.data ?? result;
}

/** 参数沿用 fleet 短命令的 --name value 写法。 */
function options(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) { const key = argv[i].slice(2); flags[key] = key === 'dry-run' ? true : argv[++i]; }
  return flags;
}

/** 按媒体类型展示 Kollab 当前公布的工具、模型与必填字段。 */
function list() {
  const tools = call(['tool', 'list']).tools ?? [];
  for (const [label, names] of Object.entries({
    image: ['generate_image', 'edit_image'], video: ['generate_video'],
    audio: ['text_to_speech', 'speech_to_text'], vision: ['vision'],
  })) {
    console.log(`${label}:`);
    for (const tool of tools.filter((entry) => names.includes(entry.name))) {
      const models = tool.properties?.model?.enum?.join(', ') ?? '见 fleet media models';
      console.log(`  ${tool.name} | model: ${models} | 必填: ${(tool.required ?? []).join(', ') || '无'}`);
    }
  }
}

/** 运行托管能力；无媒体路径的文字或结构化结果也落到输出目录。 */
function run(tool, flags) {
  const input = flags['input-json'] ? JSON.parse(flags['input-json']) : {};
  if (flags.model) input.model = flags.model;
  if (flags.prompt) input.prompt = flags.prompt;
  const out = resolve(flags.out ?? 'fleet-media');
  const result = call(['tool', 'run', tool, '--input-json', JSON.stringify(input), '--output-dir', out, '--json']);
  const paths = result.local_paths ?? (result.local_path ? [result.local_path] : []);
  if (paths.length === 0) {
    mkdirSync(out, { recursive: true });
    paths.push(join(out, 'result.json'));
    writeFileSync(paths[0], JSON.stringify(result, null, 2));
  }
  const status = result.status ?? (result.download_errors?.length ? '部分下载失败' : '完成');
  const cost = result.credits_used ?? result.credits_charged ?? result.cost_credits;
  const fee = cost === undefined ? result.usage?.cost_usd === undefined ? '' : ` | 费用: $${result.usage.cost_usd}` : ` | 费用: ${cost} credits`;
  for (const path of paths) console.log(`${path} | 状态: ${status}${fee}`);
  for (const failure of result.download_errors ?? []) console.error(`下载失败: ${failure.file_name}: ${failure.error}`);
  return result.download_errors?.length ? 1 : 0;
}

/** fleet media 的子命令分发。 */
export function runMedia(argv) {
  const [command, ...rest] = argv;
  if (!command || command === '--help' || command === 'help') { console.log(HELP); return 0; }
  try {
    if (command === 'list') { list(); return 0; }
    if (command === 'run') {
      const flags = options(rest.slice(1));
      if (flags.provider === 'gemini-api') {
        const kind = ({ generate_image: 'image', generate_video: 'video', image: 'image', video: 'video' })[rest[0]];
        if (!kind) throw new Error('gemini-api 支持 image / video');
        const result = runGeminiApi(kind, { prompt: flags.prompt, input: flags.input, out: flags.out, model: flags.model, dryRun: flags['dry-run'] });
        if (!result.unavailable) { if (result.error) throw new Error(result.error); console.log(result.output); return 0; }
        console.error(`${result.error}，回退 Kollab`);
      }
      const tool = ({ image: 'generate_image', video: 'generate_video' })[rest[0]] || rest[0];
      return run(tool, flags);
    }
    if (command === 'models') {
      const flags = options(rest);
      const args = ['model', 'list'];
      if (flags.source) args.push('--source', flags.source);
      if (flags.search) args.push('--search', flags.search);
      const data = call(args);
      for (const model of data.models ?? []) console.log(typeof model === 'string' ? model : `${model.id ?? model.gatewayModelId ?? model.model_id} | ${model.name ?? model.showName ?? ''}`);
      return 0;
    }
    console.error(`未知 media 子命令: ${command}\n${HELP}`);
  } catch (error) {
    console.error(`fleet media 失败: ${error.message}`);
  }
  return 1;
}
