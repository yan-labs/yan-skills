#!/usr/bin/env node
// Read Bing Webmaster Recommendations as JSON. Usage: node bing-recommendations.mjs <host> [host...]
// Requires OpenCLI and a Chrome profile logged into Bing Webmaster Tools. Opens one dedicated session per host, sequentially.
// Bing numbers are error counts, not issue-type counts; '-' and loading/missing data remain unknown. Page language/layout may change.
// Validated: 2026-11-05. Only reads pages; sessions are closed in finally.
import { execFileSync } from 'node:child_process';
const hosts = process.argv.slice(2);
if (!hosts.length) { console.error('Usage: node bing-recommendations.mjs <host> [host...]'); process.exit(1); }
const run = (...args) => execFileSync('opencli', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] });
for (const input of hosts) {
  const host = new URL(input.includes('://') ? input : `https://${input}`).hostname;
  const session = `bing-recs-${host.replace(/[^a-z0-9]/g, '-')}-${process.pid}x`;
  try {
    run('browser', session, '--window', 'dedicated', 'open', `https://www.bing.com/webmasters/seoreports?siteUrl=${encodeURIComponent(`https://${host}/`)}`);
    run('browser', session, 'wait', 'time', '3');
    const raw = run('browser', session, 'eval', `JSON.stringify({text:document.body.innerText,sites:[...document.querySelectorAll('a[href*="seoreports?siteUrl="]')].map(a=>a.href),index:[...document.querySelectorAll('a')].filter(a=>a.innerText.trim()==='IndexNow').map(a=>a.href)})`);
    const data = JSON.parse(raw.slice(0, raw.indexOf('\n  Update available') === -1 ? undefined : raw.indexOf('\n  Update available')).trim());
    const member = /用户无权访问此网站|You (?:do not|don't) have access to this site/i.test(data.text) ? false : data.sites.some(u => { try { return new URL(new URL(u).searchParams.get('siteUrl')).hostname === host; } catch { return false; } }) ? true : null;
    const text = data.text;
    const counts = Object.fromEntries([['high','高严重性'],['medium','中严重性'],['low','低严重性']].map(([k,label])=>[k, text.match(new RegExp(label+'\\n([^\\n]+)'))?.[1] ?? null]));
    const segment = text.split('SEO/GEO 错误类型\n')[1]?.split(/\n\d+ 多行/)[0] ?? '';
    const lines = segment.split('\n').map(s=>s.trim()).filter(Boolean).filter(s=>!['严重性','','页数'].includes(s));
    const issues = [];
    for (let i=0; i+2<lines.length; i++) if (/^(高|中等|低)$/.test(lines[i+1])) { issues.push({type:lines[i],severity:lines[i+1],pages:lines[i+2]}); i+=2; }
    let indexnow = null;
    if (member && data.index[0]) { run('browser', session, 'open', data.index[0]); run('browser', session, 'wait', 'time', '2'); indexnow = run('browser', session, 'eval', 'JSON.stringify(document.body.innerText)').split('\n  Update available')[0].trim(); try { indexnow = JSON.parse(indexnow); } catch {} }
    console.log(JSON.stringify({host,member,counts,issues,indexnow,raw:text}));
  } catch (e) { console.log(JSON.stringify({host,error:String(e.message)})); }
  finally { try { run('browser',session,'close'); } catch {} }
}
