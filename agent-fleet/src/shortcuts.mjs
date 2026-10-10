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

// 固定产品边界，不判断执行失败原因。
export function geminiBlocked(prompt, { expectChanges = false } = {}) {
  prompt = prompt.split('\n## 允许读写/禁止\n', 1)[0];
  const classification = prompt.match(/^归类[^\r\n]*/m)?.[0] ?? '';
  return expectChanges || /编码|code|UI|前端实现/i.test(classification) ||
    /(?:修改|改动|改|编辑|重写|创建|新增|删除|更新).{0,12}(?:文件|代码|源码|组件|\S+\.(?:mjs|js|ts|tsx|jsx|py|html|css|json))|写代码|实现.{0,12}(?:UI|界面|页面|功能)|(?:edit|modify|write|create|delete|update)\s+(?:\S+\s+){0,3}(?:files?|code|components?)|implement\s+(?:\S+\s+){0,3}(?:UI|code|component)/i.test(prompt);
}
