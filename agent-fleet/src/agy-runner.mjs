import { execFile, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { prepareCopyPrompt } from './copy-voice.mjs';
import { createProgress } from './progress.mjs';
import { writeResultFile, snapshotGit, inspectGit, attachArtifacts } from './brief.mjs';
import { writePidRecord, runIdFromLogPath, processCommand } from './pid.mjs';

const exec = promisify(execFile);
const order = fileURLToPath(new URL('./order.py', import.meta.url));
const quota = /quota|rate.?limit|exhausted|\b429\b/i;
const bad = /authentication required|not logged in|unknown model|unrecognized.model|quota|rate.?limit|exhausted|\b429\b/i;
const wrapper = `import fcntl,os,re,subprocess,sys,tempfile
sys.path.insert(0,sys.argv[1])
import order
try: order.gate('gemini-sub',warn=lambda x:None)
except order.OrderError: sys.exit(75)
with open(os.path.join(tempfile.gettempdir(),'fleet-agy.lock'),'a') as lock:
 try: fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 except BlockingIOError: sys.exit(75)
 try:
  r=subprocess.run(sys.argv[2:],capture_output=True,text=True,timeout=600,env={k:v for k,v in os.environ.items() if k.lower() not in ('http_proxy','https_proxy','all_proxy','no_proxy') and not re.search(r'KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL',k,re.I)})
  sys.stdout.write(r.stdout); sys.stderr.write(r.stderr); sys.exit(r.returncode)
 except (OSError,subprocess.TimeoutExpired) as e:
  sys.stderr.write(str(e)); sys.exit(1)`;

export async function runAgy({ prompt, cwd, noVoice = false }) {
  const prepared = prepareCopyPrompt({ friendlyModel: 'copy', prompt, noVoice, copyVoice: true });
  const args = ['-c', wrapper, fileURLToPath(new URL('.', import.meta.url)), process.env.FLEET_AGY_BIN || 'agy', '-p', prepared];
  if (process.env.FLEET_AGY_MODEL) args.push('--model', process.env.FLEET_AGY_MODEL);
  const before = snapshotGit(cwd);
  const progress = createProgress({ quiet: true, label: 'agy' });
  const runId = runIdFromLogPath(progress.logPath);
  const startedAt = new Date().toISOString();
  const record = finished => writePidRecord(runId, { pid: process.pid, command: processCommand(process.pid), model: 'agy', cwd, startedAt, logPath: progress.logPath, finished });
  record(false);
  let stdout = '', stderr = '', failed = false;
  try { ({ stdout, stderr } = await exec('python3', args, { cwd, timeout: 610000, maxBuffer: 10 * 1024 * 1024 })); }
  catch (e) { stdout = e.stdout || ''; stderr = e.stderr || e.message; failed = true; }
  const evidence = `${stdout}\n${stderr}`;
  if (quota.test(evidence)) {
    try {
      const saved = spawnSync('python3', [order, 'auto'], { input: JSON.stringify({ route: 'agy', text: evidence }), timeout: 40000, stdio: ['pipe', 'ignore', 'ignore'] });
      if (saved.status !== 0) console.error('agy 额度调遣令写入失败，请检查调遣令文件');
    } catch { console.error('agy 额度调遣令写入失败，请检查调遣令文件'); }
  }
  record(true);
  progress.stop();
  if (failed || bad.test(evidence) || !stdout.trim()) return null;
  const resultPath = writeResultFile(progress.logPath, stdout.trim());
  return attachArtifacts({ ok: true, result: stdout.trim(), model: 'agy', tier: process.env.FLEET_AGY_MODEL || 'default', cwd, resultPath, logPath: progress.logPath, totalCostUsd: null }, progress.logPath, inspectGit(cwd, before));
}
