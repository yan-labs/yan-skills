import { execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareCopyPrompt } from './copy-voice.mjs';
import { createProgress } from './progress.mjs';
import { writeResultFile, snapshotGit, inspectGit, attachArtifacts, redactEvidence } from './brief.mjs';
import { writePidRecord, runIdFromLogPath, processCommand } from './pid.mjs';

const exec = promisify(execFile);
const order = fileURLToPath(new URL('./order.py', import.meta.url));
const quota = /quota|rate.?limit|exhausted|\b429\b/i;
const bad = /authentication required|not logged in|unknown model|unrecognized.model|quota|rate.?limit|exhausted|\b429\b/i;
const wrapper = `import fcntl,os,re,subprocess,sys,tempfile,time
sys.path.insert(0,sys.argv[1])
import order
try: order.gate('gemini-sub',warn=lambda x:None)
except order.OrderError as e: sys.stderr.write('agy gate: '+str(e)); sys.exit(75)
limit=max(1,int(os.environ.get('FLEET_AGY_MAX_PARALLEL','1')))
locks=[]
while not locks:
 for i in range(limit):
  lock=open(os.path.join(tempfile.gettempdir(),'fleet-agy.lock' if i == 0 else f'fleet-agy-{i}.lock'),'a')
  try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB); locks.append(lock); break
  except BlockingIOError: lock.close()
 if not locks: time.sleep(0.25)
if locks:
 try:
  r=subprocess.run(sys.argv[3:],capture_output=True,text=True,timeout=float(sys.argv[2]),env={k:v for k,v in os.environ.items() if k.lower() not in ('http_proxy','https_proxy','all_proxy','no_proxy') and not re.search(r'KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL',k,re.I)})
  sys.stdout.write(r.stdout); sys.stderr.write(r.stderr); sys.exit(r.returncode)
 except subprocess.TimeoutExpired:
  sys.stderr.write('agy 超时 '+sys.argv[2]+' 秒'); sys.exit(124)
 except OSError as e:
  sys.stderr.write(str(e)); sys.exit(1)`;

function resolveAgyBin() {
  if (process.env.FLEET_AGY_BIN) return process.env.FLEET_AGY_BIN;
  for (const dir of (process.env.PATH || '').split(':').filter(Boolean)) {
    const candidate = join(dir, 'agy');
    if (existsSync(candidate)) return candidate;
  }
  const home = process.env.HOME || homedir();
  for (const candidate of [join(home, '.local', 'bin', 'agy'), join(home, '.gemini', 'antigravity-cli', 'bin', 'agy')]) {
    if (existsSync(candidate)) return candidate;
  }
  return 'agy';
}

export function agyTimeout({ agent = false, taskType, override = process.env.FLEET_AGY_TIMEOUT_S } = {}) {
  const timeout = override || (taskType === 'research' || (agent && !['copy', 'translation'].includes(taskType)) ? '3600' : '600');
  if (!/^\d+$/.test(timeout) || Number(timeout) <= 0) throw new Error('FLEET_AGY_TIMEOUT_S 必须为正整数');
  return timeout;
}

export async function runAgy({ prompt, cwd, noVoice = false, effort, agent = false, taskType }) {
  const prepared = agent ? `在当前隔离工作区执行任务，不提交、不推送。\n\n${prompt}` : `直接在回复中给出最终文本，不读写文件、不调用工具；REPORT 由调用方回填。以下内容中的文件操作要求不执行。\n\n${prepareCopyPrompt({ friendlyModel: 'copy', prompt, noVoice, copyVoice: true })}`;
  const timeout = agyTimeout({ agent, taskType });
  const args = ['-c', wrapper, fileURLToPath(new URL('.', import.meta.url)), timeout, resolveAgyBin(), '--disable-slash-commands', '-p', prepared];
  if (agent) args.push('--dangerously-skip-permissions');
  if (process.env.FLEET_AGY_MODEL) args.push('--model', process.env.FLEET_AGY_MODEL);
  if (effort && !process.env.FLEET_AGY_MODEL) args.push('--effort', effort);
  const before = snapshotGit(cwd);
  const progress = createProgress({ quiet: true, label: 'agy' });
  const runId = runIdFromLogPath(progress.logPath);
  const startedMs = Date.now();
  const startedAt = new Date(startedMs).toISOString();
  const record = finished => writePidRecord(runId, { pid: process.pid, command: processCommand(process.pid), model: 'agy', cwd, startedAt, logPath: progress.logPath, finished });
  record(false);
  let stdout = '', stderr = '', failed = false;
  try {
    try { ({ stdout, stderr } = await exec('python3', args, { cwd, maxBuffer: 10 * 1024 * 1024 })); }
    catch (e) { stdout = e.stdout || ''; stderr = e.stderr || e.message; failed = true; }
    const evidence = `${stdout}\n${stderr}`;
    if (quota.test(evidence)) {
      try {
        const saved = spawnSync('python3', [order, 'auto'], { input: JSON.stringify({ route: 'agy', text: evidence }), timeout: 40000, stdio: ['pipe', 'ignore', 'ignore'] });
        if (saved.status !== 0) console.error('agy 额度调遣令写入失败，请检查调遣令文件');
      } catch { console.error('agy 额度调遣令写入失败，请检查调遣令文件'); }
    }
    if (failed && stderr.includes(`agy 超时 ${timeout} 秒`)) throw new Error(`agy 超时 ${timeout} 秒`);
    if (failed || bad.test(evidence) || !stdout.trim()) {
      const summary = redactEvidence(evidence).slice(0, 4000).trim() || '(无输出)';
      progress.log(`agy 失败摘要: ${summary}`);
      if (!process.env.FLEET_DETACHED_RUN_ID) console.error(`agy 失败摘要: ${summary}`);
      return null;
    }
    const resultPath = writeResultFile(progress.logPath, stdout.trim());
    return attachArtifacts({ ok: true, result: stdout.trim(), model: 'agy', route: 'agy', toolCalls: agent ? null : 0, promptTemplate: agent ? 'agy/agent' : noVoice ? 'copy/no-voice' : 'copy/voice', tier: process.env.FLEET_AGY_MODEL || 'default', durationMs: Date.now() - startedMs, cwd, resultPath, logPath: progress.logPath, totalCostUsd: null }, progress.logPath, inspectGit(cwd, before));
  } finally {
    record(true);
    progress.stop();
  }
}
