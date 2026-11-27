import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { isAbsolute, resolve, posix } from 'node:path';
import { startGcpxTransport } from './gcp-transport-client.mjs';
import { startGcpControlBridge } from './gcp-control-bridge.mjs';
import { pullGcpReport, pushGcpReport } from './gcp-report.mjs';

async function invoke(bin, args) {
  return await new Promise((resolvePromise, reject) => {
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.resume(); // Do not forward remote diagnostics containing possible secrets.
    child.once('error', reject);
    child.once('close', code => {
      if (code !== 0) return reject(new Error(`gcpx command failed (exit ${code ?? 'unknown'})`));
      try { resolvePromise(JSON.parse(stdout)); } catch { reject(new Error('gcpx returned invalid JSON')); }
    });
  });
}

/** Prepare a task workspace. Cleanup closes transport and flushes; it never
 * deletes work or commits. A later explicit gcpx ws rm applies its safety checks. */
export async function prepareGcpxWorkspace({ gcpxBin, config, repo, workspace, mirror,
  branch, sha, controlContext, execute = invoke, startTransport = startGcpxTransport,
  startBridge = startGcpControlBridge, pushReport = pushGcpReport, pullReport = pullGcpReport }) {
  if (![gcpxBin, config, mirror].every(value => typeof value === 'string' && isAbsolute(value))) throw new Error('gcpx paths must be absolute');
  if (typeof workspace !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(workspace) || workspace === '.' || workspace === '..') throw new Error('invalid workspace name');
  if (branch && sha) throw new Error('select branch or sha');
  const settings = JSON.parse(await readFile(config, 'utf8'));
  const prefix = ['--config', config, '--json'];
  const listing = await execute(gcpxBin, [...prefix, 'ws', 'ls']);
  const existing = listing[workspace];
  if (existing && existing.repo !== repo) throw new Error('gcpx workspace belongs to a different repository');
  if (existing && sha && existing.base_head !== sha.toLowerCase()) throw new Error('gcpx workspace has a different base commit');
  if (existing && branch && (existing.base_ref_kind !== 'branch' || existing.base_ref !== branch)) throw new Error('gcpx workspace has a different or unknown base branch');
  const created = existing ? { ...existing, id: workspace } : await execute(gcpxBin, [...prefix, 'ws', 'new', repo, '--name', workspace,
    ...(branch ? ['--branch', branch] : []), ...(sha ? ['--sha', sha] : [])]);
  if (created.id !== workspace || typeof created.path !== 'string' || !created.path.startsWith('/')) throw new Error('gcpx returned invalid workspace');
  const worker = settings.workers?.[created.worker];
  if (!worker || !isAbsolute(worker.ssh_config || '') || !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/.test(worker.host || '')) throw new Error('gcpx worker configuration is invalid');
  if (!posix.isAbsolute(worker.root || '') || posix.normalize(worker.root) !== worker.root || worker.root === '/' || created.path !== posix.join(worker.root, 'workspaces', workspace)) throw new Error('gcpx workspace is outside configured root');
  await execute(gcpxBin, [...prefix, 'sync', workspace, resolve(mirror)]);
  let bridge;
  let report;
  const flush = () => execute(gcpxBin, [...prefix, 'sync', workspace, resolve(mirror), '--flush']);
  if (controlContext) {
    const { reportPath, runId, parentRunId, tempRoot, fleetBin } = controlContext;
    if (![reportPath, tempRoot, fleetBin].every(value => typeof value === 'string' && isAbsolute(value)) || !runId) throw new Error('missing GCP control context');
    report = { sshConfig: worker.ssh_config, host: worker.host, remotePath: posix.join(worker.root, 'reports', workspace, 'report.md'), localPath: reportPath };
    if (existing) pullReport(report); else pushReport(report);
    await mkdir(tempRoot, { recursive: true, mode: 0o700 });
    bridge = await startBridge({ runId, parentRunId, remoteRoot: created.path, mirrorRoot: resolve(mirror), tempRoot, fleetBin,
      beforeCommand: async () => { await flush(); pullReport(report); } });
  }
  let transport;
  try { transport = await startTransport({ gcpxBin, config, workspace, cwd: created.path, ...(worker.command_path ? { commandPath: worker.command_path } : {}), ...(bridge ? { control: bridge } : {}) }); }
  catch (error) { if (bridge) await bridge.stop(); throw error; }
  return {
    mirror: resolve(mirror),
    environment: transport.environment,
    executionEnv: transport.executionEnv,
    git: { sshConfig: worker.ssh_config, host: worker.host },
    remoteReportPath: report?.remotePath,
    pullReport: report ? () => pullReport(report) : () => {},
    flush,
    async close() {
      try { await transport.stop(); }
      finally {
        try { if (bridge) await bridge.stop(); }
        finally { await flush(); if (report) pullReport(report); }
      }
    },
  };
}
