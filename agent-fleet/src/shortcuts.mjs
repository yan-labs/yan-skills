import { existsSync, readFileSync, statSync } from 'node:fs';

export const MODEL_ALIASES = Object.freeze({
  copy: 'agy',
  grok: 'grok-cli:default',
  bulk: 'agy',
  gpt: 'codex',
  openai: 'openai-gpt-terra',
  haiku: 'claude-cli:haiku',
  sonnet: 'claude-cli:sonnet',
  opus: 'claude-cli:opus',
  fable: 'claude-cli:fable',
});

const BOOLEAN_FLAGS = new Set(['quiet', 'verbose', 'low', 'high', 'xhigh', 'max', 'simple', 'sol', 'luna', 'astra', 'fast', 'no-fast', 'review', 'json', 'full', 'expect-changes', 'judge', 'no-voice', 'no-continue', 'no-subagents', 'subagents', 'agent-mode', 'detach', 'attach', 'no-wait', 'wait', 'help']);

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
