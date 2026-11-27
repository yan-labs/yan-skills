import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { autoClean, finishCleanup } from '../src/auto-clean.mjs';
const root = mkdtempSync(join(tmpdir(), 'fleet-clean-test-'));
try {
  const name = 'task';
  const brief = join(root, 'brief.md'), report = join(root, 'report.md');
  writeFileSync(brief, 'brief'); writeFileSync(report, 'report');
  writeFileSync(brief.replace(/\.md$/, '.json'), JSON.stringify({ worktree: { path: join(root, 'wt') } }));
  const rec = { name, runId: 'one', briefPath: brief, reportPath: report };
  mkdirSync(join(root, 'wt'));
  const opts = { root, getCwds: () => [], prune: () => { prunes++; rmSync(join(root, 'wt'), { recursive: true, force: true }); } };
  let prunes = 0;
  mkdirSync(join(root, name)); mkdirSync(join(root, name + '-extra'));
  let result = finishCleanup({ ...rec, status: 'done', verdict: 'ok', pending: 'none' }, [], opts);
  assert.equal(existsSync(join(root, name)), false); assert.equal(existsSync(join(root, name + '-extra')), false); assert.equal(prunes, 1);
  mkdirSync(join(root, name));
  const other = join(root, 'other.md'); writeFileSync(other, `write ${join(root, name)}`);
  result = autoClean(rec, [{ runId: 'two', status: 'running', briefPath: other }], opts);
  assert.equal(existsSync(join(root, name)), true); assert.match(result.join(' '), /被在途任务引用/);
  // Partial execution only inventories residuals; it does not call autoClean.
  finishCleanup({ ...rec, status: 'done', verdict: 'ok', pending: 'handoff' }, [], opts);
  assert.equal(existsSync(join(root, name)), true); assert.match(readFileSync(report, 'utf8'), /残留清单/);
  mkdirSync(join(root, name, 'evidence'));
  result = autoClean(rec, [], opts);
  assert.match(result.join(' '), /受保护内容/);
  rmSync(join(root, name, 'evidence'), { recursive: true });
  result = autoClean(rec, [], { ...opts, getCwds: () => [join(root, name)] });
  assert.equal(existsSync(join(root, name)), true); assert.match(result.join(' '), /进程工作目录/);
  console.log('auto-clean tests passed');
} finally { rmSync(root, { recursive: true, force: true }); }
