import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanText, fileHash, lockKeys, normalizeSecretKey, parseOpenCliPayload, redactValue, requestIdentity, sanitizedUrl, sha256, validReceipt } from '../scripts/tools-share-evidence.mjs';

const names = ['page.txt', 'page.html', 'page.dom.json', 'page.ax.json', 'page.parsed.json', 'page.app-json.json', 'page.network.json', 'full.png'];
const request = requestIdentity({ tool: 'semrush', report: 'organic-pages', target: 'example.com', db: 'us', url: 'https://sem.proxy.example.com/analytics/organic/pages/?q=example.com&__gmitm=secret' });

test('redacts secret strings and key-aware objects while preserving safe URL semantics', () => {
  assert.equal(cleanText('x?__gmitm=super-secret&y=1'), 'x?__gmitm=<redacted>&y=1');
  assert.equal(cleanText('Authorization: Bearer secret Cookie: sid=secret 138-0013-8000'), 'Authorization: Bearer <redacted> Cookie: <redacted>');
  assert.equal(cleanText('Call +1 415 555 0101 or a@example.com'), 'Call +1 415 555 0101 or a@example.com');
  assert.equal(cleanText('Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature'), '<redacted-jwt>');
  assert.deepEqual(redactValue({ authorization: 'Bearer secret', nested: { apiKey: 'key', xApiKey: 'key', name: 'ok' } }), { authorization: '<redacted>', nested: { apiKey: '<redacted>', xApiKey: '<redacted>', name: 'ok' } });
  const hash = 'a'.repeat(64);
  assert.equal(redactValue({ sha256: hash }).sha256, hash);
  assert.equal(redactValue({ sessionReused: true }).sessionReused, true);
  for (const key of ['gmitm', 'authorization', 'proxyAuthorization', 'cookie', 'set-cookie', 'password', 'passwd', 'pwd', 'secret', 'clientSecret', 'secretAccessKey', 'private-key', 'api_key', 'x_api_key', 'sessionId', 'sessionKey', 'x-session-id', 'token', 'access_token', 'x-access-token', 'refresh_token', 'oauthToken', 'idToken', 'csrfToken', 'x-csrf-token', 'csrfmiddlewaretoken', 'authToken', 'x-auth-token', 'jwt', 'bearerToken', 'signature', 'sig', 'credential', 'credentials']) {
    assert.equal(redactValue({ [key]: 'leak' })[key], '<redacted>', key);
    assert.equal(sanitizedUrl('https://sem.proxy.example.com/x?' + key + '=leak').includes('leak'), false, key);
  }
  assert.equal(normalizeSecretKey('x-auth-token'), 'xauthtoken');
  assert.deepEqual(redactValue({ authority: 'ok', monkey: 'ok', key: 'ok', sessionReused: true }), { authority: 'ok', monkey: 'ok', key: 'ok', sessionReused: true });
  assert.equal(sanitizedUrl('https://sem.proxy.example.com/x?q=one&token=secret#/page?tab=two&session=secret'), 'https://sem.proxy.example.com/x?q=one#/page?tab=two');
  assert.equal(sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});

test('keeps JSONL, lock order, and screenshot policy explicit', () => {
  assert.equal(parseOpenCliPayload('{"a":1}\n{"b":2}').entries.length, 2);
  const structured = parseOpenCliPayload('{"x-csrf-token":"leak","nested":{"sessionKey":"leak"}}');
  assert.equal(structured.entries[0]['x-csrf-token'], '<redacted>');
  assert.equal(structured.entries[0].nested.sessionKey, '<redacted>');
  assert.equal(structured.stdout.includes('leak'), false, 'structured stdout is rebuilt from redacted data');
  const jsonl = parseOpenCliPayload('{"proxyAuthorization":"leak"}\n{"cookie":"leak"}');
  assert.deepEqual(jsonl.entries, [{ proxyAuthorization: '<redacted>' }, { cookie: '<redacted>' }]);
  assert.equal(jsonl.stdout.includes('leak'), false, 'JSONL stdout is rebuilt from redacted entries');
  assert.deepEqual(parseOpenCliPayload('RootWebArea\n  avatar B', true), { format: 'plain-text', text: 'RootWebArea\n  avatar B' });
  assert.deepEqual(lockKeys('same-session', 'semrush'), ['opencli-session-same-session', 'semrush']);
});

test('resume requires matching request identity, complete bundle, and matching hashes', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tools-share-evidence-receipt-'));
  try {
    for (const name of names) await writeFile(join(dir, name), name);
    const artifacts = Object.fromEntries(await Promise.all(names.map(async (name) => [name, { sha256: await fileHash(join(dir, name)) }])));
    const receipt = { bundleComplete: true, resumeEligible: true, request, artifacts, captureStatus: 'captured', sources: { dom: 'available', ax: 'available', parsed: 'available', network: 'available', html: 'available' }, dataCompleteness: { status: 'not_applicable' } };
    await writeFile(join(dir, 'receipt.json'), JSON.stringify(receipt));
    assert.equal(await validReceipt(dir, request), true);
    assert.equal(await validReceipt(dir, { ...request, target: 'other.example' }), false, 'a different domain cannot resume');
    assert.equal(await validReceipt(dir, { ...request, url: 'https://sem.proxy.example.com/analytics/other/' }), false, 'a different URL cannot resume');
    assert.equal(await validReceipt(dir, { ...request, url: 'https://sem.proxy.example.com/analytics/organic/pages/?q=other' }), false, 'a different normal query cannot resume');
    const bounded = { ...receipt, resumeEligible: false, dataCompleteness: { status: 'bounded' } };
    await writeFile(join(dir, 'receipt.json'), JSON.stringify(bounded));
    assert.equal(await validReceipt(dir, request), false, 'a bounded bundle needs explicit acceptance');
    assert.equal(await validReceipt(dir, request, true), true, 'accept-bounded may resume an otherwise complete bounded bundle');
    await writeFile(join(dir, 'receipt.json'), JSON.stringify(receipt));
    await writeFile(join(dir, 'page.txt'), 'changed');
    assert.equal(await validReceipt(dir, request), false, 'a changed artifact cannot resume');
    artifacts['page.txt'].sha256 = await fileHash(join(dir, 'page.txt'));
    await writeFile(join(dir, 'receipt.json'), JSON.stringify({ ...receipt, bundleComplete: false, resumeEligible: false }));
    assert.equal(await validReceipt(dir, request), false, 'an incomplete receipt cannot resume');
    await writeFile(join(dir, 'receipt.json'), JSON.stringify(receipt));
    await rm(join(dir, 'full.png'));
    assert.equal(await validReceipt(dir, request), false, 'a missing artifact cannot resume');
  } finally { await rm(dir, { recursive: true, force: true }); }
});
