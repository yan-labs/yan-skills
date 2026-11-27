import { createServer } from 'node:net';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

const permitted = new Set(['plan', 'handoff', 'park', 'blocked', 'ask', 'say', 'wait']);
const maxMessage = 1024 * 1024;

function translateCondition(value, remoteRoot, mirrorRoot) {
  const pos = value.indexOf(':');
  const kind = value.slice(0, pos), payload = value.slice(pos + 1);
  if (kind === 'cmd') throw new Error('remote command conditions cannot execute on Mini');
  if (kind === 'all' || kind === 'any') {
    const children = JSON.parse(payload);
    if (!Array.isArray(children)) throw new Error('invalid composite condition');
    return `${kind}:${JSON.stringify(children.map(child => translateCondition(child, remoteRoot, mirrorRoot)))}`;
  }
  if (kind === 'file') {
    const suffix = relative(remoteRoot, payload);
    if (!isAbsolute(payload) || suffix === '..' || suffix.startsWith('../') || isAbsolute(suffix)) throw new Error('file condition is outside remote workspace');
    return `file:${resolve(mirrorRoot, suffix)}`;
  }
  return value;
}

export function validateControlRequest(request, { remoteRoot, mirrorRoot, allowedRuns }) {
  if (!Array.isArray(request.argv) || !request.argv.length || request.argv.length > 128 || request.argv.some(x => typeof x !== 'string' || x.includes('\0') || x.length > 65536)) throw new Error('invalid fleet arguments');
  const argv = [...request.argv];
  const command = argv[0];
  if (!permitted.has(command)) throw new Error('fleet command unavailable on remote worker');
  if (argv.some(x => x === '--run' || x.startsWith('--run=') || x === '--cwd' || x.startsWith('--cwd='))) throw new Error('run and cwd overrides are forbidden');
  if ((command === 'say' || command === 'wait') && !allowedRuns.includes(argv[1])) throw new Error('run target is outside task scope');
  for (let i = 1; i < argv.length; i++) {
    if (argv[i] === '--until') {
      if (typeof argv[i + 1] !== 'string') throw new Error('missing condition');
      argv[i + 1] = translateCondition(argv[i + 1], remoteRoot, mirrorRoot); i++;
    } else if (argv[i].startsWith('--until=')) {
      argv[i] = '--until=' + translateCondition(argv[i].slice(8), remoteRoot, mirrorRoot);
    }
  }
  const files = argv.reduce((out, arg, i) => arg === '--file' ? [...out, i] : out, []);
  if (argv.some(arg => arg.startsWith('--file=')) || files.length > 1 || (files.length && !['plan', 'handoff'].includes(command))) throw new Error('invalid file argument');
  if (files.length && (typeof request.file !== 'string' || Buffer.byteLength(request.file) > 256 * 1024)) throw new Error('missing or oversized control file');
  if (!files.length && request.file !== undefined) throw new Error('unexpected control file');
  return { argv, fileIndex: files[0] };
}

async function invokeFleet(bin, args, env, cwd) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { env, cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', data => { stdout += data; if (stdout.length > maxMessage) child.kill(); });
    child.stderr.on('data', data => { stderr += data; if (stderr.length > maxMessage) child.kill(); });
    child.once('error', reject);
    child.once('close', code => resolvePromise({ code: code ?? 1, stdout, stderr }));
  });
}

export async function startGcpControlBridge({ runId, parentRunId, remoteRoot, mirrorRoot, tempRoot, fleetBin, env = process.env, execute = invokeFleet, beforeCommand = async () => {} }) {
  if (![runId, remoteRoot, mirrorRoot, tempRoot, fleetBin].every(v => typeof v === 'string' && v)) throw new Error('missing control bridge configuration');
  if (![remoteRoot, mirrorRoot, tempRoot, fleetBin].every(isAbsolute)) throw new Error('control bridge paths must be absolute');
  const token = randomBytes(32).toString('base64url');
  const secret = Buffer.from(token);
  const server = createServer(socket => {
    let data = ''; let handled = false;
    socket.setEncoding('utf8');
    socket.on('error', () => {});
    socket.on('data', async chunk => {
      if (handled) return;
      data += chunk;
      if (Buffer.byteLength(data) > maxMessage) { handled = true; socket.destroy(); return; }
      const index = data.indexOf('\n');
      if (index < 0) return;
      handled = true;
      let temporary;
      try {
        const request = JSON.parse(data.slice(0, index));
        const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '');
        if (supplied.length !== secret.length || !timingSafeEqual(supplied, secret)) throw new Error('invalid capability');
        const { argv, fileIndex } = validateControlRequest(request, { remoteRoot, mirrorRoot, allowedRuns: [runId, ...(parentRunId ? [parentRunId] : [])] });
        if (fileIndex !== undefined) {
          temporary = await mkdtemp(join(tempRoot, 'bridge-'));
          const path = join(temporary, 'request.txt');
          await writeFile(path, request.file, { mode: 0o600 });
          argv[fileIndex + 1] = path;
        }
        await beforeCommand();
        const result = await execute(fleetBin, argv, { ...env, FLEET_SLOT_RUN_ID: runId, FLEET_DETACHED_RUN_ID: runId }, mirrorRoot);
        socket.end(JSON.stringify(result) + '\n');
      } catch (error) {
        socket.end(JSON.stringify({ code: 1, stdout: '', stderr: error.message }) + '\n');
      } finally { if (temporary) await rm(temporary, { recursive: true, force: true }); }
    });
  });
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolvePromise); });
  return { port: server.address().port, token, stop: () => new Promise((resolvePromise, reject) => server.close(error => error ? reject(error) : resolvePromise())) };
}
