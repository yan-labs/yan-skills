import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pullGcpReport, pushGcpReport } from '../src/gcp-report.mjs';
const dir = mkdtempSync('/tmp/gcp-pool-runner/report-test-');
try {
  const report = join(dir, 'report.md');
  const cfg = { sshConfig: '/tmp/ssh', host: 'worker', remotePath: '/home/u/reports/a/report.md', localPath: report };
  writeFileSync(report, 'before');
  let uploaded;
  pushGcpReport(cfg, (_bin, _argv, options) => { uploaded = options.input.toString(); return { status: 0 }; });
  assert.equal(uploaded, 'before');
  assert.throws(() => pullGcpReport(cfg, () => ({ status: 255 })), /download failed/);
  assert.equal(readFileSync(report, 'utf8'), 'before');
  pullGcpReport(cfg, () => ({ status: 0, stdout: Buffer.from('after') }));
  assert.equal(readFileSync(report, 'utf8'), 'after');
  assert.deepEqual(readdirSync(dir), ['report.md']);
  assert.throws(() => pushGcpReport({ ...cfg, remotePath: '/x/../secret' }), /invalid remote report/);
  console.log('GCP report transfer preserves local report on failures and replaces atomically');
} finally { rmSync(dir, { recursive: true, force: true }); }
