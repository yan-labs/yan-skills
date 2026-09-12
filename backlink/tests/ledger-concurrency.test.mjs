import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 回归测试：2026-09-12 发现 ledger.mjs 的 upsert/transition 是"整文件读出→内存里
// 改→整文件写回"，没有锁也不在写入前重新合并。多个 subagent 并发对同一个项目的
// ledger.json 调用 upsert 时，后写入的完整覆盖先写入的，丢过 6 条记录（videocatch）。
// 这里起一批并发子进程各自 upsert 一条不同的记录，验证修好之后全部记录都在，
// 一条都不丢。

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ledgerScript = path.join(skillRoot, 'scripts', 'ledger.mjs');

function runLedger(args, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ledgerScript, ...args, '--file', file], {
      cwd: skillRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`ledger.mjs ${args.join(' ')} exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
  });
}

test('concurrent upsert calls against the same ledger file do not lose records', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ledger-concurrency-'));
  const file = path.join(dir, 'ledger.json');
  try {
    await runLedger(['init'], file);

    const CONCURRENCY = 12;
    const urls = Array.from({ length: CONCURRENCY }, (_, i) => `https://example.com/page-${i}`);

    // 关键：Promise.all 让这些子进程的读/写窗口真正重叠，而不是一个接一个跑。
    await Promise.all(urls.map((url) => runLedger(['upsert', '--url', url], file)));

    const ledger = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(
      ledger.records.length,
      CONCURRENCY,
      `expected ${CONCURRENCY} records, got ${ledger.records.length} (records were lost to a racy overwrite)`,
    );
    const gotUrls = new Set(ledger.records.map((r) => r.url));
    for (const url of urls) assert.ok(gotUrls.has(url), `missing record for ${url}`);

    // 没有遗留锁文件（成功路径下必须释放）。
    await assert.rejects(readFile(`${file}.lock`, 'utf8'), /ENOENT/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('concurrent transitions on distinct records do not clobber each other', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ledger-concurrency-'));
  const file = path.join(dir, 'ledger.json');
  try {
    await runLedger(['init'], file);

    const CONCURRENCY = 8;
    const urls = Array.from({ length: CONCURRENCY }, (_, i) => `https://example.org/item-${i}`);
    // 先串行建好记录（upsert 并发已经在上一条用例里单独验证过了）。
    for (const url of urls) await runLedger(['upsert', '--url', url], file);

    const before = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(before.records.length, CONCURRENCY);

    await Promise.all(
      before.records.map((record) =>
        runLedger(['transition', '--id', record.id, '--state', 'qualified'], file),
      ),
    );

    const after = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(after.records.length, CONCURRENCY, 'record count changed across concurrent transitions');
    for (const record of after.records) {
      assert.equal(record.state, 'qualified', `${record.url} did not transition (lost update)`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
