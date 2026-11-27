import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
import { validateGcpEnvironment } from './gcp-environment.mjs';

// The capability is read from a private child pipe and never put into argv,
// environment variables, fleet logs, or persisted task metadata.
export async function startGcpxTransport({ gcpxBin, config, workspace, cwd, control, commandPath = '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', spawnChild = spawn }) {
  if (typeof workspace !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(workspace)) throw new Error('invalid gcpx workspace');
  if (typeof config !== 'string' || !config.startsWith('/')) throw new Error('gcpx config must be absolute');
  if (control && (!Number.isInteger(control.port) || control.port < 1 || control.port > 65535 || typeof control.token !== 'string')) throw new Error('invalid gcpx control capability');
  const child = spawnChild(gcpxBin, ['--config', config, '_transport', workspace, ...(control ? ['--control-port', String(control.port)] : [])], { stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.on('error', () => {});
  if (control) child.stdin.write(JSON.stringify({ token: control.token }) + '\n');
  child.stderr.resume(); // Diagnostic text can contain external secrets; do not log it.
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  let finished = false;
  const exited = new Promise(resolve => {
    child.once('error', error => { finished = true; resolve({ error }); });
    child.once('close', (code, signal) => { finished = true; resolve({ code, signal }); });
  });
  try {
    const ready = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('gcpx transport startup timed out')), 300000);
      lines.once('line', line => {
        clearTimeout(timer);
        if (line.length > 4096) return reject(new Error('invalid gcpx transport response'));
        try { resolve(JSON.parse(line)); } catch { reject(new Error('invalid gcpx transport response')); }
      });
      exited.then(result => { clearTimeout(timer); reject(result.error || new Error('gcpx transport exited before ready')); });
    });
    const id = 'gcp-' + createHash('sha256').update(workspace).digest('hex').slice(0, 32);
    const environment = validateGcpEnvironment({ id, url: ready.url, token: ready.token, cwd });
    let executionEnv;
    if (control) {
      for (const path of [ready.proxyBin, ready.bridgeFile]) {
        if (typeof path !== 'string' || !path.startsWith('/') || posix.normalize(path) !== path) throw new Error('invalid remote control path');
      }
      if (typeof commandPath !== 'string' || commandPath.includes('\0') || commandPath.split(':').some(path => !path.startsWith('/'))) throw new Error('invalid worker command path');
      executionEnv = { PATH: `${ready.proxyBin}:${commandPath}`, FLEET_GCP_BRIDGE_FILE: ready.bridgeFile };
    }
    const stop = async () => {
      if (!finished) child.stdin.end();
      let timer;
      const result = await Promise.race([exited, new Promise(resolve => { timer = setTimeout(() => resolve(null), 30000); })]);
      clearTimeout(timer);
      if (!result) { child.kill('SIGTERM'); throw new Error('gcpx transport cleanup timed out'); }
      if (result.error || result.code !== 0) throw new Error('gcpx transport cleanup failed');
    };
    return { environment, executionEnv, stop };
  } catch (error) {
    child.stdin.end();
    if (!finished) child.kill('SIGTERM');
    await exited;
    throw error;
  } finally { lines.close(); }
}
