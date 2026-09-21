#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';
import { batchBrowser, closeSession, defaultSession, sleepStep } from './opencli-core.mjs';

export function postId(value) {
  if (/^\d{10,25}$/.test(value)) return value;
  const u = new URL(value);
  if (u.protocol !== 'https:' || !/^(www\.)?(x\.com|twitter\.com|fxtwitter\.com)$/.test(u.hostname)) throw new Error('Expected an X post URL or numeric ID');
  const id = u.pathname.match(/^\/(?:[^/]+|i\/web)\/status\/(\d{10,25})(?:\/|$)/)?.[1];
  if (!id) throw new Error('Missing post ID');
  return id;
}
export function compact(t) {
  return { id: t.id, url: t.url, author: t.author?.screen_name ?? null, text: t.text,
    date: t.created_at ?? null, likes: t.likes ?? null, replies: t.replies ?? null,
    reposts: t.retweets ?? null, views: t.views ?? null,
    parent: t.replying_to_status ?? null, quote: t.quote?.id ?? null,
    links: [...new Set((t.raw_text?.facets ?? []).filter(f => f.type === 'url').map(f => f.replacement).filter(Boolean))] };
}
export async function readPost(input, depth = 0) {
  let id = postId(input);
  const posts = new Map();
  for (let n = 0; id && n <= depth; n++) {
    if (posts.has(id)) break;
    if (n) await new Promise(r => setTimeout(r, 1000));
    const res = await fetch(`https://api.fxtwitter.com/status/${id}`, {
      headers: { 'User-Agent': 'OpenCLI-X-Research/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) return { source: 'fxtwitter', status: 'http_error', http: res.status, posts: [...posts.values()] };
    const data = await res.json();
    if (data.code !== 200 || !data.tweet) return { source: 'fxtwitter', status: 'api_error', code: data.code, posts: [...posts.values()] };
    const t = data.tweet;
    posts.set(t.id, compact(t));
    if (t.quote) posts.set(t.quote.id, compact(t.quote));
    id = t.replying_to_status;
  }
  return { source: 'fxtwitter', status: 'ok', posts: [...posts.values()] };
}

// Runs in Chrome: DOM only; no fetch, cookies, or private GraphQL calls.
export function extractDOM() {
  const column = document.querySelector('[data-testid="primaryColumn"]');
  const articles = [...(column?.querySelectorAll('article[data-testid="tweet"]') ?? [])];
  const text = (column?.innerText ?? document.body?.innerText ?? '').slice(0, 5000);
  const outsidePosts = column?.cloneNode(true);
  outsidePosts?.querySelectorAll('article').forEach(a => a.remove());
  const notices = outsidePosts?.textContent ?? text;
  let status = /rate limit|限速|请求过多/i.test(notices) ? 'rate_limited'
    : /something went wrong|出错了|重新加载/i.test(notices) ? 'page_error'
    : /\/i\/flow\/login/.test(location.pathname) ? 'login_required'
    : articles.length ? 'ok' : /no results|没有结果|未找到结果/i.test(text) ? 'empty' : 'not_loaded';
  const posts = articles.map(a => {
    const time = a.querySelector('time');
    const link = time?.closest('a');
    const id = link?.href.match(/\/status\/(\d+)/)?.[1];
    return { id, url: link?.href, author: link?.pathname.split('/')[1],
      date: time?.getAttribute('datetime') ?? null,
      text: a.querySelector('[data-testid="tweetText"]')?.innerText ?? '',
      metrics: a.querySelector('[role="group"]')?.getAttribute('aria-label') ?? null,
      links: [...new Set([...a.querySelectorAll('a[href]')].map(x => x.href).filter(h => /^https?:/.test(h) && !/^https?:\/\/(?:www\.)?(?:x|twitter)\.com\//.test(h)))],
      parent: null };
  }).filter(p => p.id);
  if (status === 'ok' && !posts.length) status = 'parse_error';
  return { source: 'chrome_dom', status, url: location.href, posts, ...(status !== 'ok' ? { evidence: notices.slice(0, 400) } : {}) };
}
export async function search(query, scrolls = 0) {
  const session = defaultSession(`x-research-${randomUUID().slice(0, 8)}`);
  const url = `https://x.com/search?${new URLSearchParams({ q: query, src: 'typed_query', f: 'live' })}`;
  const evaluate = { cmd: 'eval', args: { js: `(${extractDOM.toString()})()` } };
  const posts = new Map();
  try {
    let commands = [{ cmd: 'open', args: { url } }, { cmd: 'wait', args: { selector: 'article[data-testid="tweet"], [data-testid="error-detail"], [data-testid="emptyState"]', timeout: 15000 } }, evaluate];
    for (let n = 0; n <= scrolls; n++) {
      const results = await batchBrowser(session, commands, { windowMode: 'active', timeoutMs: 50000 });
      const last = results.at(-1);
      if (!last?.ok || !last.result?.status) throw new Error('DOM extraction failed');
      const data = last.result;
      if (new URL(data.url).searchParams.get('q') !== query) data.status = 'wrong_page';
      const before = posts.size;
      for (const p of data.posts) posts.set(p.id, p);
      if (data.status !== 'ok' || n === scrolls || posts.size === before) return { ...data, query, partial: true, posts: [...posts.values()] };
      commands = [{ cmd: 'scroll', args: { direction: 'down', amount: 700 } }, sleepStep(2), evaluate];
    }
  } finally { await closeSession(session); }
}
async function main() {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: {
    depth: { type: 'string', default: '0' }, scrolls: { type: 'string', default: '0' } } });
  const [mode, input] = positionals;
  const depth = Number(values.depth), scrolls = Number(values.scrolls);
  if (!input || positionals.length !== 2 || !['read', 'search'].includes(mode) || !Number.isInteger(depth) || depth < 0 || depth > 3 || !Number.isInteger(scrolls) || scrolls < 0 || scrolls > 3) throw new Error('Usage: x-research.mjs read POST_URL [--depth 0..3] | search QUERY [--scrolls 0..3]');
  const result = mode === 'read' ? await readPost(input, depth) : await search(input, scrolls);
  console.log(JSON.stringify(result));
  if (!['ok', 'empty'].includes(result.status)) process.exitCode = 1;
}
if (process.argv[1] && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  main().catch(e => { console.log(JSON.stringify({ status: 'error', error: e.message })); process.exitCode = 1; });
}
