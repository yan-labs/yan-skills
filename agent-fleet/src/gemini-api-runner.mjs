import { spawnSync } from 'node:child_process';

// Never use keychain fallback: this channel is enabled only by an explicit API key.
export function runGeminiApi(kind, { prompt, input, out, model, dryRun = false } = {}) {
  if (!['image', 'video', 'research', 'analyze'].includes(kind)) throw new Error('不支持的 gemini-api 类型');
  if (!prompt) throw new Error('缺少 prompt');
  if (kind === 'analyze' && !input) throw new Error('analyze 需要 --input');
  if (!dryRun && !process.env.GEMINI_API_KEY?.trim()) return { unavailable: true, error: 'GEMINI_API_KEY 未配置' };
  const args = kind === 'research'
    ? ['agent', 'run', prompt, '--agent', model || 'deep-research-preview-04-2026', '--background']
    : [kind, prompt];
  if (kind !== 'research' && model) args.push('-m', model);
  if (input) args.push('-i', input);
  if (out && (kind === 'image' || kind === 'video')) args.push('--out', out);
  if (dryRun) args.push('--dry-run', '-o', 'json');
  const child = spawnSync(process.env.FLEET_GEMINI_API_BIN || 'gemini-api', args, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  if (child.error || child.status !== 0) return { error: child.error?.message || child.stderr?.trim() || `退出码 ${child.status}` };
  return { output: child.stdout.trim() };
}
