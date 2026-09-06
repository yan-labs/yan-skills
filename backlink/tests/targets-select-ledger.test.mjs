// targets-select.mjs 的台账排除层：默认从当前工作目录下的 .backlink/ledger.json
// 排除 submitted 及之后状态、以及（默认）rejected 的域名，且按域名（去 www）匹配，
// 不是按 route——同一个域名换个 route 也必须被挡住。
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const SCRIPT = resolve(new URL('../scripts/targets-select.mjs', import.meta.url).pathname);

const TARGETS = {
  targets: [
    { domain: 'submitted-site.example', route: 'https://submitted-site.example/new-route', cohort: 'open', status: 'usable', payment: 'none-seen', kind: 'web-directory' },
    { domain: 'rejected-site.example', route: 'https://www.rejected-site.example/', cohort: 'open', status: 'usable', payment: 'none-seen', kind: 'web-directory' },
    { domain: 'open-site.example', route: 'https://open-site.example/', cohort: 'open', status: 'usable', payment: 'none-seen', kind: 'web-directory' },
  ],
};

const LEDGER = {
  version: 1,
  records: [
    // submitted under a DIFFERENT route than the one currently in the target
    // table — matching must be by domain, never by route.
    { id: 'a', url: 'https://submitted-site.example/old-submission-route', state: 'submitted', history: [] },
    { id: 'b', url: 'https://rejected-site.example/form', state: 'rejected', history: [{ state: 'rejected', note: 'login-required', at: new Date().toISOString() }] },
  ],
};

function run(args, cwd) {
  return execFileSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });
}

test('excludes submitted and rejected domains by domain, not by route', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'targets-select-ledger-'));
  try {
    const targetsFile = join(dir, 'targets.json');
    const ledgerFile = join(dir, 'ledger.json');
    await writeFile(targetsFile, JSON.stringify(TARGETS));
    await writeFile(ledgerFile, JSON.stringify(LEDGER));

    const out = run(['--file', targetsFile, '--ledger', ledgerFile, '--cohort', 'open', '--format', 'urls'], dir);
    assert.equal(out.trim(), 'https://open-site.example/', 'only the untouched domain should remain');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--include-rejected keeps rejected domains but never submitted ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'targets-select-ledger-'));
  try {
    const targetsFile = join(dir, 'targets.json');
    const ledgerFile = join(dir, 'ledger.json');
    await writeFile(targetsFile, JSON.stringify(TARGETS));
    await writeFile(ledgerFile, JSON.stringify(LEDGER));

    const out = run(['--file', targetsFile, '--ledger', ledgerFile, '--cohort', 'open', '--format', 'urls', '--include-rejected'], dir);
    const routes = out.trim().split('\n').sort();
    assert.deepEqual(routes, ['https://open-site.example/', 'https://www.rejected-site.example/']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('default ledger path is .backlink/ledger.json relative to cwd, and a missing file only warns', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'targets-select-ledger-'));
  try {
    const targetsFile = join(dir, 'targets.json');
    await writeFile(targetsFile, JSON.stringify(TARGETS));

    // No .backlink/ledger.json at all: must not throw, must keep every target.
    const out = run(['--file', targetsFile, '--cohort', 'open', '--format', 'urls'], dir);
    const routes = out.trim().split('\n').sort();
    assert.deepEqual(routes, [
      'https://open-site.example/',
      'https://submitted-site.example/new-route',
      'https://www.rejected-site.example/',
    ]);

    // Now create .backlink/ledger.json at the default location and confirm it
    // is picked up with no --ledger flag.
    const { mkdir } = await import('node:fs/promises');
    await mkdir(join(dir, '.backlink'), { recursive: true });
    await writeFile(join(dir, '.backlink', 'ledger.json'), JSON.stringify(LEDGER));
    const out2 = run(['--file', targetsFile, '--cohort', 'open', '--format', 'urls'], dir);
    assert.equal(out2.trim(), 'https://open-site.example/');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('--stats reports submitted/rejected exclusion counts and rejected reasons', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'targets-select-ledger-'));
  try {
    const targetsFile = join(dir, 'targets.json');
    const ledgerFile = join(dir, 'ledger.json');
    await writeFile(targetsFile, JSON.stringify(TARGETS));
    await writeFile(ledgerFile, JSON.stringify(LEDGER));

    const out = run(['--file', targetsFile, '--ledger', ledgerFile, '--stats'], dir);
    assert.match(out, /已按台账排除 2 个（其中 submitted 1、rejected 1）/);
    assert.match(out, /login-required/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
