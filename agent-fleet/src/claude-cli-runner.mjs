import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { snapshotGit, inspectGit, attachArtifacts, redactEvidence, writeResultFile } from './brief.mjs';
import { createProgress } from './progress.mjs';

const exec = promisify(execFile);
export async function runClaude({ prompt, cwd, model }) {
  const bin = process.env.FLEET_CLAUDE_BIN || 'claude';
  const progress = createProgress({ quiet: true, label: 'claude-cli' });
  const started = Date.now();
  const before = snapshotGit(cwd);
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|ANTHROPIC_BASE_URL|CLAUDE_CODE_OAUTH_TOKEN)$/i.test(k)));
  try {
    let auth;
    try { auth = JSON.parse((await exec(bin, ['auth', 'status'], { cwd, env })).stdout); } catch { auth = null; }
    if (!auth?.loggedIn || auth.authMethod !== 'claude.ai') throw new Error('claude CLI 未登录，请在该机 claude 登录或改到 MacBook 派');
    const { stdout } = await exec(bin, ['-p', prompt, '--model', model, '--dangerously-skip-permissions'], { cwd, env, timeout: 600000, maxBuffer: 10 * 1024 * 1024 });
    if (!stdout.trim()) throw new Error('claude CLI 返回空结果');
    const resultPath = writeResultFile(progress.logPath, stdout.trim());
    return attachArtifacts({ ok: true, model: `claude-cli:${model}`, route: 'claude-cli', result: stdout.trim(), cwd, resultPath, logPath: progress.logPath, durationMs: Date.now() - started, totalCostUsd: null }, progress.logPath, inspectGit(cwd, before));
  } catch (e) {
    const error = redactEvidence(e.stderr || e.message);
    console.error(error);
    return { ok: false, model: `claude-cli:${model}`, route: 'claude-cli', error, cwd, logPath: progress.logPath, durationMs: Date.now() - started };
  } finally { progress.stop(); }
}
