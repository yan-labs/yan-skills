import { existsSync, readFileSync, statSync } from 'node:fs';

export const MODEL_ALIASES = Object.freeze({
  copy: 'kollab-gateway-copy',
  grok: 'kollab-gateway-research',
  bulk: 'kollab-gateway-bulk',
  gpt: 'kollab-gateway-gpt-sol',
  // Claude 官方端点直连，走订阅附赠的每月 API 额度（ANTHROPIC_CREDIT_API_KEY），不占 Claude App 用量。
  haiku: 'claude-haiku',
  sonnet: 'claude-sonnet',
  opus: 'claude-opus',
  fable: 'claude-fable',
});

const BOOLEAN_FLAGS = new Set(['quiet', 'verbose', 'low', 'review', 'json', 'full', 'expect-changes', 'judge', 'no-voice', 'no-subagents', 'subagents', 'detach', 'attach', 'no-wait', 'help']);

export function splitShortArgs(argv) {
  const positionals = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (BOOLEAN_FLAGS.has(key)) flags[key] = true;
    else flags[key] = argv[++i];
  }
  return { positionals, flags };
}

export function resolveBrief(value) {
  if (typeof value !== 'string' || !value) throw new Error('缺少 brief：传文件路径或任务文本。');
  if (existsSync(value) && statSync(value).isFile()) return readFileSync(value, 'utf8');
  return value;
}

export function shortRunOptions(command, argv) {
  const { positionals, flags } = splitShortArgs(argv);
  const brief = flags.prompt ?? positionals[0];
  return {
    model: flags.model ?? MODEL_ALIASES[command],
    prompt: resolveBrief(brief),
    cwd: flags.cwd ?? process.cwd(),
    maxTurns: flags['max-turns'] === undefined ? undefined : Number(flags['max-turns']),
    quiet: !flags.verbose || Boolean(flags.quiet),
    systemPrompt: flags['system-prompt'],
    flags,
  };
}
