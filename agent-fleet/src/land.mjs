// Private runtime adapters own project-specific checks and team pipeline entry points.
// Runtime JSON: {adapters:[{kind:'kollab-test'|'nextspace-test', repo, env:'test',
// branch:'test', remote:'origin', expectedHead, runningCommit, check:argv,
// push:argv, pipeline:argv, verify:argv}]}. Never commit real entries or credentials.
// Hooks receive batch/candidate/members/cwd as JSON on stdin; exit 0 means complete.
// check is isolated and must not deploy. pipeline waits the team pipeline to finish,
// handles project-required rollback on failure; trigger=false only waits a push's CI.
// Kollab requires push: a private argv wrapper around the project release-ref protocol.
// It validates the expected base/candidate and pushes exactly once; land never retries it.
// The wrapper must reuse the project release script; private entry points stay in runtime config.
// verify must read back this candidate's digest and project smoke checks.
import { mkdirSync, readFileSync, writeFileSync, renameSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { runsDir } from './progress.mjs';
import { currentRun, readJSON } from './yield.mjs';
import { appendInbox } from './inbox.mjs';
import { redactEvidence } from './brief.mjs';

const keyFor = (repo, env) => createHash('sha256').update(`${realpathSync(repo)}\n${env}`).digest('hex').slice(0, 24);
function save(path, value) {
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, JSON.stringify(value) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}
async function command(argv, cwd, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(redactEvidence(`${argv[0]} exit ${code}\n${stderr}\n${stdout}`))));
    child.stdin.on('error', () => {});
    child.stdin.end(input === undefined ? '' : JSON.stringify(input));
  });
}
const git = (repo, ...args) => command(['git', ...args], repo);
function adapterConfig(path, repo, env) {
  if (!path) throw new Error('land 需要受控运行时 --config 或 FLEET_LAND_CONFIG。');
  const entries = JSON.parse(readFileSync(path, 'utf8')).adapters;
  const config = entries?.find(c => realpathSync(c.repo) === realpathSync(repo) && c.env === env);
  if (!config || !['kollab-test', 'nextspace-test'].includes(config.kind) || env !== 'test' || config.branch !== 'test')
    throw new Error('只支持配置明确指定的 Kollab/nextspace test；生产仅登记候选。');
  for (const phase of ['check', 'pipeline', 'verify', ...(config.kind === 'kollab-test' || config.push !== undefined ? ['push'] : [])]) {
    if (!Array.isArray(config[phase]) || !config[phase].length || config[phase].some(s => typeof s !== 'string')) throw new Error(`adapter 缺少 ${phase} 命令数组。`);
  }
  if (!/^[a-f0-9]{40}$/.test(config.expectedHead || '') || !/^[a-f0-9]{40}$/.test(config.runningCommit || ''))
    throw new Error('需要枢纽提供 expectedHead 与 runningCommit 完整 SHA。');
  return { ...config, repo: realpathSync(repo), remote: config.remote || 'origin' };
}

export async function land(flags) {
  if (typeof flags.repo !== 'string' || typeof flags.env !== 'string') throw new Error('land 需要 --repo 与 --env。');
  const repo = realpathSync(flags.repo), env = flags.env, key = keyFor(repo, env);
  const root = join(runsDir(), 'land'); mkdirSync(root, { recursive: true, mode: 0o700 });
  const path = join(root, `${key}.json`), lock = join(root, `${key}.lock`);
  if (flags.status) return { key, until: `land:${key}`, ...(readJSON(path) || { pending: [] }) };
  try { mkdirSync(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('该仓库/环境列车正在登记或发车；稍后重试。'); throw error; }
  try {
    const state = readJSON(path) || { pending: [], batches: [] };
    if (!flags.flush) {
      const runId = currentRun(flags);
      const sha = await git(repo, 'rev-parse', '--verify', '--end-of-options', `${flags.commit || 'HEAD'}^{commit}`);
      let member = state.pending.find(m => m.runId === runId && m.sha === sha);
      if (!member) { member = { runId, sha, registrationId: randomUUID() }; state.pending.push(member); }
      const registrationsPath = join(runsDir(), `${runId}.land.json`);
      const registrations = readJSON(registrationsPath) || {};
      registrations[`land:${key}`] = { registrationId: member.registrationId };
      save(registrationsPath, registrations);
      save(path, state);
      return { key, until: `land:${key}`, status: env === 'test' ? 'queued' : 'candidate-only', pending: state.pending };
    }
    const config = adapterConfig(flags.config || process.env.FLEET_LAND_CONFIG, repo, env);
    if (!state.pending.length) return { key, status: 'empty' };
    const batch = { id: randomUUID(), at: Date.now(), members: [...state.pending], status: 'checking', rejected: [] };
    // A failed or interrupted publish is never silently replayed by a later flush.
    if (state.batches.some(b => ['publishing', 'failed'].includes(b.status))) throw new Error('上批发布未确认；先由枢纽核验并处理私有列车记录。');
    const logPath = join(root, `${batch.id}.log`);
    batch.logPath = logPath;
    const log = text => writeFileSync(logPath, redactEvidence(text) + '\n', { flag: 'a', mode: 0o600 });
    const invoke = async (phase, context) => {
      try {
        const output = await command(config[phase], repo, { ...context, phase, kind: config.kind, env, repo, branch: config.branch });
        log(`${phase}: ${output}`);
        return output;
      } catch (error) { log(`${phase}: ${error.message}`); throw error; }
    };
    let temp;
    try {
      if (await git(repo, 'status', '--porcelain')) throw new Error('主克隆有未提交或暂存改动，保持原样并停止发车。');
      if (await git(repo, 'symbolic-ref', '--short', 'HEAD') !== config.branch) throw new Error('发车必须在主克隆本地 test 分支。');
      if (config.kind === 'nextspace-test') {
        const common = resolve(repo, await git(repo, 'rev-parse', '--git-common-dir'));
        const gitDir = resolve(repo, await git(repo, 'rev-parse', '--git-dir'));
        if (realpathSync(common) !== realpathSync(gitDir)) throw new Error('nextspace 环境合入必须在主克隆，不能在 worktree。');
      }
      await git(repo, 'fetch', config.remote, config.branch);
      const base = await git(repo, 'rev-parse', 'FETCH_HEAD');
      if (base !== config.expectedHead || await git(repo, 'rev-parse', 'HEAD') !== base) throw new Error('远端头或本地 test 与枢纽快照不符，需重新提供共享状态。');
      await git(repo, 'merge-base', '--is-ancestor', config.runningCommit, base);
      temp = mkdtempSync(join(tmpdir(), 'fleet-land-'));
      await git(repo, 'worktree', 'add', '--detach', temp, base);
      const context = { batchId: batch.id, base, runningCommit: config.runningCommit, cwd: temp, members: batch.members };
      const build = async members => {
        await git(temp, 'reset', '--hard', base);
        await git(temp, 'clean', '-fdx');
        for (const member of members) await git(temp, '-c', 'user.name=Fleet land', '-c', 'user.email=fleet@example.invalid', 'merge', '--no-edit', '--no-ff', member.sha);
        const candidate = await git(temp, 'rev-parse', 'HEAD');
        await invoke('check', { ...context, candidate, members });
        return candidate;
      };
      // Keep passing halves; recheck their combination to catch interactions.
      const isolate = async members => {
        try { await build(members); return members; }
        catch (error) {
          log(error.message);
          if (members.length === 1) { batch.rejected.push({ ...members[0], reason: 'merge/check failed', logPath }); return []; }
          const middle = Math.ceil(members.length / 2);
          return [...await isolate(members.slice(0, middle)), ...await isolate(members.slice(middle))];
        }
      };
      let accepted = await isolate(batch.members);
      let candidate;
      while (accepted.length) {
        try { candidate = await build(accepted); break; }
        catch {
          const member = accepted.pop();
          batch.rejected.push({ ...member, reason: 'combined check failed', logPath });
        }
      }
      batch.accepted = accepted;
      if (accepted.length) {
        // Only this merge touches the environment branch, in its main clone.
        await git(repo, 'merge', '--ff-only', candidate);
        batch.candidate = candidate; batch.status = 'publishing';
        state.batches.push(batch); state.pending = []; save(path, state);
        try {
          if (config.push) await invoke('push', { ...context, candidate, members: accepted, remote: config.remote });
          else await git(repo, 'push', config.remote, `HEAD:refs/heads/${config.branch}`);
        } catch (error) {
          // Preserve the candidate before moving any branch; never reset someone else's edits.
          batch.recoveryRef = `refs/heads/fleet-land-recovery-${batch.id}`;
          batch.recoveryCommands = [
            ['git', 'update-ref', batch.recoveryRef, candidate, '0'.repeat(40)],
            ['git', 'fetch', config.remote, config.branch],
            ['git', 'switch', '--detach', candidate],
            ['git', 'update-ref', `refs/heads/${config.branch}`, 'FETCH_HEAD', candidate],
            ['git', 'switch', config.branch],
          ];
          try {
            await git(repo, ...batch.recoveryCommands[0].slice(1));
            await git(repo, 'fetch', config.remote, config.branch);
            const remote = await git(repo, 'rev-parse', 'FETCH_HEAD');
            if (await git(repo, 'status', '--porcelain') || await git(repo, 'rev-parse', 'HEAD') !== candidate ||
                await git(repo, 'symbolic-ref', '--short', 'HEAD') !== config.branch)
              throw new Error('主克隆已被他人修改；保留原状，恢复前先保存其改动。');
            await git(repo, 'switch', '--detach', candidate);
            await git(repo, 'update-ref', `refs/heads/${config.branch}`, remote, candidate);
            await git(repo, 'switch', config.branch);
            batch.recoveredHead = remote;
          } catch (recoveryError) {
            log(`恢复未完成：${recoveryError.message}`);
          }
          throw new Error(`${error.message}\n候选保留于 ${batch.recoveryRef}；本地同步 ${batch.recoveredHead || '未完成'}。恢复 argv（在主克隆干净且 HEAD 仍为候选时执行；已完成步骤可跳过）：${JSON.stringify(batch.recoveryCommands)}`);
        }
        const remoteHead = (await git(repo, 'ls-remote', config.remote, `refs/heads/${config.branch}`)).split(/\s/)[0];
        if (remoteHead !== candidate) throw new Error('推送后远端头不符，停止发布。');
        // Kollab: wait/read back the push-triggered pipeline. Nextspace: trigger and wait Jenkins.
        const pipeline = await invoke('pipeline', { ...context, candidate, members: accepted, trigger: config.kind === 'nextspace-test' });
        await invoke('verify', { ...context, candidate, members: accepted, pipeline });
      } else { state.batches.push(batch); state.pending = []; }
      batch.status = 'done'; batch.finishedAt = Date.now(); save(path, state);
    } catch (error) {
      batch.status = 'failed'; batch.error = redactEvidence(error.message); log(batch.error);
      if (!state.batches.includes(batch)) state.batches.push(batch);
      state.pending = state.pending.filter(m => !batch.members.some(b => b.runId === m.runId && b.sha === m.sha));
      save(path, state);
    } finally {
      if (temp) {
        try { await git(repo, 'worktree', 'remove', '--force', temp); } catch { /* preserve evidence if git refuses cleanup */ }
      }
    }
    for (const member of batch.members) {
      const rejected = batch.rejected.some(m => m.runId === member.runId && m.sha === member.sha);
      const status = batch.status === 'done' && !rejected ? 'done' : 'failed';
      const result = { condition: `land:${key}`, at: Date.now(), status, logPath, batchId: batch.id, candidate: batch.candidate };
      const registrationsPath = join(runsDir(), `${member.runId}.land.json`);
      const registrations = readJSON(registrationsPath) || {};
      if (registrations[result.condition]?.registrationId === member.registrationId) {
        registrations[result.condition].result = result;
        save(registrationsPath, registrations);
      }
      save(join(runsDir(), `${member.runId}.wake.json`), result);
      appendInbox(member.runId, { type: 'say', text: `land ${status}; batch=${batch.id}; log=${logPath}${rejected ? '; rejected merge/check' : ''}` });
    }
    return { key, ...batch };
  } finally { rmSync(lock, { recursive: true }); }
}
