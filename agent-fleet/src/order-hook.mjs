// run 因额度类原因失败结束时，把现场证据交给 order.py 自动写「停用 + 重置时间」进调遣令。
// 判断规则只在 order.py 的 QUOTA_RULES 里；这里只收集证据。Mini 上的 run 由派单机（mini.py）负责记，避免写到 Mini 的副本。
// 任何失败一律吞掉，不能影响任务本身。
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runsDir } from './progress.mjs';

const tail = (path, max) => {
  try { return path && existsSync(path) ? readFileSync(path, 'utf8').slice(-max) : ''; } catch { return ''; }
};

export function quotaEvidence(rec) {
  const report = rec.brief?.failureReport ?? {};
  return [rec.error, rec.stopReason, rec.brief?.verdictNote, report.error, report.httpStatus ? `HTTP ${report.httpStatus}` : '',
    report.errorObject ? JSON.stringify(report.errorObject) : '', String(report.stderr ?? '').slice(-1500), String(rec.stderr ?? '').slice(-1500),
    tail(rec.logPath, 6000), tail(rec.resultPath, 3000)].filter(Boolean).join('\n');
}

export function recordQuotaOrder(rec, row) {
  try {
    if (row?.failure !== 'quota' || process.env.FLEET_MACHINE === 'mini') return;
    let codexQuota = null;
    try { codexQuota = JSON.parse(readFileSync(join(runsDir(), 'codex-quota.json'), 'utf8')); } catch { /* 没有就不用 */ }
    const input = JSON.stringify({ runId: rec.runId, name: row.name, route: rec.model, finishedAt: rec.finishedAt, text: quotaEvidence(rec), codexQuota });
    spawnSync('python3', [fileURLToPath(new URL('./order.py', import.meta.url)), 'auto'], { input, timeout: 15000, stdio: ['pipe', 'ignore', 'ignore'] });
  } catch { /* 记不了不影响任务 */ }
}
