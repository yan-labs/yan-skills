#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { closeSession, firstJson, opencli, run } from './opencli-core.mjs';
import { isReusableToolCapture } from './lib-tools-share.mjs';

assert.equal(isReusableToolCapture({ url: 'https://sem.proxy.example.com/analytics/overview/', len: 200 }, 'sem.proxy.example.com'), true);
assert.equal(isReusableToolCapture({ url: 'https://dash.proxy.example.com/zh-Hans/', len: 200 }, 'sem.proxy.example.com'), false);
assert.equal(isReusableToolCapture({ url: 'https://sem.proxy.example.com/analytics/overview/', len: 20 }, 'sem.proxy.example.com'), false);

const root = resolve(new URL('.', import.meta.url).pathname);
const temporary = await mkdtemp(join(tmpdir(), 'backlink-skill-test-'));
const scanPath = join(temporary, 'scan.json');
const payloadPath = join(temporary, 'payload.json');
const ledgerPath = join(temporary, 'ledger.json');
const session = `backlink-self-test-${Date.now()}`;
const html = `<!doctype html><html><head><title>Directory fixture</title></head><body>
<form id="newsletter"><label>Email <input type="email" name="newsletter_email"></label></form>
<form id="submit-form"><label>Website URL <input type="url" name="url"></label>
<label>Product name <input name="product_name"></label>
<label>Contact email <input type="email" name="email"></label>
<label>Description <textarea name="description"></textarea></label>
<button type="submit">Submit listing</button></form>
<output id="submits">0</output><script>
document.querySelector('#submit-form').addEventListener('submit', event => {
  event.preventDefault(); document.querySelector('#submits').textContent = String(Number(document.querySelector('#submits').textContent) + 1);
});
</script></body></html>`;
const server = createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
});
await new Promise((resolveServer) => server.listen(0, '127.0.0.1', resolveServer));
const url = `http://127.0.0.1:${server.address().port}/`;

try {
  await writeFile(payloadPath, JSON.stringify({
    url: 'https://product.example/',
    name: 'Truthful Product',
    email: 'owner@example.com',
    description: 'A truthful description.',
  }));
  await run(process.execPath, [join(root, 'inspect-page.mjs'), '--session', session, '--url', url, '--wait', '0', '--out', scanPath], { timeoutMs: 60_000 });
  const scan = JSON.parse(await readFile(scanPath, 'utf8'));
  assert.equal(scan.fillable, true);
  assert.equal(scan.qualifiedFormCount, 1);
  await run(process.execPath, [join(root, 'safe-fill.mjs'), '--session', session, '--scan', scanPath, '--payload', payloadPath], { timeoutMs: 60_000 });
  const state = firstJson((await opencli(['browser', session, 'eval', `({
    url: document.querySelector('#submit-form [name=url]').value,
    name: document.querySelector('#submit-form [name=product_name]').value,
    email: document.querySelector('#submit-form [name=email]').value,
    description: document.querySelector('#submit-form textarea').value,
    newsletter: document.querySelector('#newsletter input').value,
    submits: document.querySelector('#submits').textContent
  })`])).stdout);
  assert.deepEqual(state, {
    url: 'https://product.example/',
    name: 'Truthful Product',
    email: 'owner@example.com',
    description: 'A truthful description.',
    newsletter: '',
    submits: '0',
  });
  await opencli(['browser', session, 'eval', `document.querySelector('#submit-form').innerHTML = document.querySelector('#submit-form').innerHTML`]);
  const stale = await run(process.execPath, [join(root, 'safe-fill.mjs'), '--session', session, '--scan', scanPath, '--payload', payloadPath], { allowFailure: true, timeoutMs: 60_000 });
  assert.equal(stale.code, 2);
  await run(process.execPath, [join(root, 'ledger.mjs'), 'upsert', '--file', ledgerPath, '--url', 'https://directory.example/submit', '--site', 'Fixture']);
  const rejected = await run(process.execPath, [join(root, 'ledger.mjs'), 'transition', '--file', ledgerPath, '--url', 'https://directory.example/submit', '--state', 'public'], { allowFailure: true });
  assert.notEqual(rejected.code, 0);
  await run(process.execPath, [join(root, 'ledger.mjs'), 'transition', '--file', ledgerPath, '--url', 'https://directory.example/submit', '--state', 'public', '--evidence', 'Public listing verified at https://directory.example/item']);
  process.stdout.write('backlink skill self-test: PASS\n');
} finally {
  await closeSession(session);
  await new Promise((resolveServer) => server.close(resolveServer));
}
