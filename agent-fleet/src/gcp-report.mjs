import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { isAbsolute, dirname, join, posix } from 'node:path';

const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const MAX_REPORT = 1024 * 1024;

function config(args) {
  const { sshConfig, host, remotePath, localPath } = args;
  if (!isAbsolute(sshConfig || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(host || '')) throw new Error('invalid report transport');
  if (typeof remotePath !== 'string' || !remotePath.startsWith('/') || posix.normalize(remotePath) !== remotePath || remotePath === '/') throw new Error('invalid remote report path');
  if (!isAbsolute(localPath || '')) throw new Error('invalid local report path');
  return ['/usr/bin/ssh', ['-F', sshConfig, '-o', 'BatchMode=yes', host]];
}

export function pushGcpReport(args, run = spawnSync) {
  const [bin, base] = config(args);
  const data = existsSync(args.localPath) ? readFileSync(args.localPath) : Buffer.alloc(0);
  if (data.length > MAX_REPORT) throw new Error('report exceeds size limit');
  const remoteDir = posix.dirname(args.remotePath);
  const temporary = `${args.remotePath}.tmp-${randomUUID()}`;
  const script = `set -e; umask 077; mkdir -p -- ${quote(remoteDir)}; trap ${quote(`rm -f -- ${quote(temporary)}`)} EXIT; cat > ${quote(temporary)}; mv -f -- ${quote(temporary)} ${quote(args.remotePath)}`;
  const result = run(bin, [...base, script], { input: data, stdio: ['pipe', 'ignore', 'pipe'], timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error('remote report upload failed');
}

export function pullGcpReport(args, run = spawnSync) {
  const [bin, base] = config(args);
  const result = run(bin, [...base, `cat -- ${quote(args.remotePath)}`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, maxBuffer: MAX_REPORT + 1 });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout) || result.stdout.length > MAX_REPORT) throw new Error('remote report download failed');
  const temp = join(dirname(args.localPath), `.gcpx-report-${randomUUID()}`);
  try {
    writeFileSync(temp, result.stdout, { mode: 0o600, flag: 'wx' });
    renameSync(temp, args.localPath);
  } finally { try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; } }
}
