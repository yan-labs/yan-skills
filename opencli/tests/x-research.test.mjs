import assert from 'node:assert/strict';
import { postId, compact, readPost } from '../scripts/x-research.mjs';
assert.equal(postId('https://x.com/a/status/2100124837091987607?s=1'), '2100124837091987607');
assert.throws(() => postId('https://evil.example/a/status/2100124837091987607'));
assert.throws(() => postId('https://x.com/home'));
assert.equal(compact({ id: '1', likes: 0 }).likes, 0);
assert.equal(compact({ id: '1' }).likes, null);
const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async url => {
  calls.push(url);
  return { ok: true, json: async () => ({ code: 200, tweet: {
    id: '2100124837091987607', text: 'fun', replying_to_status: null,
    quote: { id: '2099827888379879512', text: 'game', raw_text: { facets: [{ type: 'url', replacement: 'https://dontlookup.app' }] } }
  } }) };
};
try {
  const result = await readPost('2100124837091987607', 1);
  assert.equal(calls.length, 1);
  assert.equal(result.posts[0].quote, result.posts[1].id);
  assert.deepEqual(result.posts[1].links, ['https://dontlookup.app']);
  globalThis.fetch = async () => ({ ok: false, status: 429 });
  const failed = await readPost('2100124837091987607');
  assert.equal(failed.status, 'http_error');
  assert.equal(failed.http, 429);
} finally { globalThis.fetch = originalFetch; }
console.log('x-research checks passed');
