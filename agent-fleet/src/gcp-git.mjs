// Execute git evidence commands in the remote workspace, never in the local
// synchronized mirror.  SSH configuration and its control socket are owned by
// the workspace lifecycle, and SSH errors must be returned to the caller.
import { spawnSync } from 'node:child_process';
import { isAbsolute, posix } from 'node:path';

const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";

export function remoteGit(config, args, { run = spawnSync, timeout = 30000 } = {}) {
  if (!config || !isAbsolute(config.sshConfig || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(config.host || '')) {
    throw new Error('invalid remote git transport');
  }
  if (typeof config.cwd !== 'string' || !config.cwd.startsWith('/') || posix.normalize(config.cwd) !== config.cwd || config.cwd === '/') {
    throw new Error('invalid remote git workspace');
  }
  if (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0'))) throw new Error('invalid git arguments');
  const command = `cd -- ${quote(config.cwd)} && exec git ${args.map(quote).join(' ')}`;
  const result = run('/usr/bin/ssh', ['-F', config.sshConfig, '-o', 'BatchMode=yes', config.host, command],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout });
  if (result.error) throw new Error('remote git transport failed', { cause: result.error });
  if (result.status !== 0) {
    const error = new Error(`remote git failed (exit ${result.status ?? 'unknown'})`);
    error.status = result.status;
    throw error;
  }
  return result.stdout || '';
}
