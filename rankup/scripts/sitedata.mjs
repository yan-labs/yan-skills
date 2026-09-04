#!/usr/bin/env node
/**
 * sitedata.mjs — 用已登录的 Chrome 查 SiteData 的流量和 Reverse AdSense 数据。
 *
 * 用法：
 *   node scripts/sitedata.mjs --domain toolify.ai
 *   node scripts/sitedata.mjs --domain toolify.ai --report adsense
 *   node scripts/sitedata.mjs --domain toolify.ai --report traffic --out out.json
 *
 * 参数：
 *   --domain <d>            必填，目标域名
 *   --report <r>            traffic（默认）| adsense | whois
 *   --out <file>            落盘 JSON
 *   --timeout <s>           整体超时（默认 30）
 *   --keep-open             跑完保留标签页
 *   --window <mode>         background（默认）/ foreground / isolated
 *   --help                  本说明
 *
 * 输出（traffic 报表）：
 *   { version, source, retrievedAt, domain, report, url,
 *     metrics: { monthlyVisits, visitDuration, pagesPerVisit, bounceRate },
 *     trend: [{ month, visits }],
 *     channels: [{ name, share }],
 *     countries: [{ code, share }],
 *     keywords: [{ keyword, traffic, volume, cpc }],
 *     rawText }
 *
 * 输出（adsense 报表）：
 *   { version, source, retrievedAt, domain, report, url,
 *     publisherIds: [{ id, relation }],
 *     publisherDetails: [{ id, associatedDomains, domains: [string] }],
 *     rawText }
 *
 * 坑：
 *   1. SiteData 是 Next.js SPA，直接导航到 /traffic/<hash> 只渲染骨架不加载数据；
 *      必须从首页搜索框走 React 路由，用 nativeInputValueSetter 设值+派发事件。
 *   2. 搜索按钮没有 form 包裹，Enter 键和 CDP click 都不可靠；
 *      用 JS querySelector 找到按钮后 .click() 最稳。
 *   3. Traffic 报表免费不扣积分；Reverse AdSense 免费不扣积分。
 *      但 SiteData 不是配额站，无需配额站的固定会话名机制。
 */
import { writeFile } from 'node:fs/promises';
import {
  closeSession,
  defaultSession,
  parseFlags,
  showHelpIfRequested,
  printJson,
  required,
  opencli,
  batchBrowser,
  sleepStep,
} from '../../backlink/scripts/opencli-core.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);

const domain = required(flags, 'domain');
const report = String(flags.report || 'traffic').toLowerCase();
if (!['traffic', 'adsense', 'whois'].includes(report)) {
  throw new Error(`Unknown report: ${report}. Must be traffic, adsense, or whois.`);
}
const outFile = flags.out || null;
const timeoutMs = (Number(flags.timeout) || 30) * 1000;
const keepOpen = !!flags['keep-open'];
const windowMode = flags.window || 'background';

const session = defaultSession('sitedata');
const SEARCH_TAB = report === 'adsense' ? 'AdSense' : 'Traffic';

// ── helpers ──────────────────────────────────────────────────────────

function js(strings, ...values) {
  return strings.reduce((acc, str, i) => acc + str + (values[i] ?? ''), '');
}

const SET_INPUT_AND_SEARCH = (domain, tabName) => js`(function(){
  // 1) Click the right tab (Traffic / AdSense)
  const tabs = document.querySelectorAll('[role="tablist"] button');
  for (const t of tabs) {
    if (t.textContent.trim() === '${tabName}') { t.click(); break; }
  }

  // 2) Set input value via React-compatible setter
  const input = document.querySelector('input[placeholder*="Enter a site"], input[placeholder*="Enter a domain"]');
  if (!input) return { error: 'input_not_found' };
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, '${domain}');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 3) Click search button
  const btns = document.querySelectorAll('button');
  for (const b of btns) {
    const text = b.textContent.trim();
    if (text === 'Search' || text === 'Analyze') { b.click(); return { ok: true, clicked: text }; }
  }
  return { error: 'search_button_not_found' };
})()`;

const EXTRACT_TRAFFIC = js`(function(){
  const getText = (el) => el ? el.textContent.trim() : null;
  const body = document.body.innerText;

  // Metrics cards
  const cards = {};
  const labels = ['MONTHLY VISITS', 'VISIT DURATION', 'PAGES PER VISIT', 'BOUNCE RATE'];
  const keys = ['monthlyVisits', 'visitDuration', 'pagesPerVisit', 'bounceRate'];
  for (let i = 0; i < labels.length; i++) {
    const regex = new RegExp(labels[i] + '[\\\\s\\\\S]*?([\\\\d.,]+[KMBkmb]?[\\\\s\\\\w%]*)');
    const m = body.match(regex);
    cards[keys[i]] = m ? m[1].trim().split('\\n')[0].trim() : null;
  }

  // Trend (VISITS OVER TIME)
  const trend = [];
  const trendMatch = body.match(/VISITS OVER TIME[\\s\\S]*?((?:[A-Z][a-z]+ \\d{4}[\\s\\S]*?\\d+[\\s\\S]*?)+?)(?=TRAFFIC SOURCES|TOP COUNTRIES|Top Keywords|$)/);
  if (trendMatch) {
    const rows = trendMatch[1].matchAll(/([A-Z][a-z]+ \\d{4})\\s+([\\d.,]+[KMB]?)/g);
    for (const r of rows) trend.push({ month: r[1], visits: r[2] });
  }

  // Channels (TRAFFIC SOURCES)
  const channels = [];
  const chanMatch = body.match(/TRAFFIC SOURCES[\\s\\S]*?((?:(?:Direct|Social|Search|Referrals|Mail|DisplayAds|GenAI|SocialPaid|SearchPaid|Affiliate)[\\s\\S]*?\\d+[\\s\\S]*?)+?)(?=TOP COUNTRIES|Top Keywords|$)/);
  if (chanMatch) {
    const rows = chanMatch[1].matchAll(/(Direct|Social|Search|Referrals|Mail|DisplayAds|GenAI|SocialPaid|SearchPaid|Affiliate)\\s+([\\d.]+%)/g);
    for (const r of rows) channels.push({ name: r[1], share: r[2] });
  }

  // Countries (TOP COUNTRIES)
  const countries = [];
  const geoMatch = body.match(/TOP COUNTRIES[\\s\\S]*?((?:[A-Z]{2}\\s+[\\d.]+%[\\s\\S]*?)+?)(?=Top Keywords|$)/);
  if (geoMatch) {
    const rows = geoMatch[1].matchAll(/([A-Z]{2})\\s+([\\d.]+%)/g);
    for (const r of rows) countries.push({ code: r[1], share: r[2] });
  }

  // Keywords (Top Keywords table — values are in separate DOM nodes, newline-separated)
  const keywords = [];
  const kwSection = body.split('Top Keywords')[1];
  if (kwSection) {
    const afterHeader = kwSection.replace(/^[\\s\\S]*?CPC\\s*\\n/, '');
    const lines = afterHeader.split('\\n').map(l => l.trim()).filter(Boolean);
    // Lines come in groups: keyword, traffic, volume, cpc (4 lines per row)
    // but some cpc values are "-" and keyword can be multi-word
    // Pattern: keyword line has no K/M/B/$ prefix, traffic/volume have K/M/B suffix, cpc has $ or -
    let i = 0;
    while (i < lines.length) {
      const kw = lines[i];
      if (!kw || /^\\d/.test(kw) || /^\\$/.test(kw) || kw === '-' || kw === '\\\\-') { i++; continue; }
      const traffic = lines[i+1] || null;
      const volume = lines[i+2] || null;
      const cpc = lines[i+3] || null;
      if (traffic && /[\\d.,]+[KMB]?$/.test(traffic)) {
        keywords.push({ keyword: kw, traffic, volume, cpc: cpc === '\\\\-' || cpc === '-' ? null : cpc });
        i += 4;
      } else {
        i++;
      }
    }
  }

  return { cards, trend, channels, countries, keywords, url: location.href, title: document.title };
})()`;

const EXTRACT_ADSENSE = js`(function(){
  const body = document.body.innerText;

  // Publisher IDs section
  const publisherIds = [];
  const pubMatch = body.match(/Publisher IDs[\\s\\S]*?All Publisher IDs\\s+(\\d+)[\\s\\S]*?Direct IDs\\s+(\\d+)[\\s\\S]*?Reseller IDs\\s+(\\d+)/);
  const counts = pubMatch ? { all: pubMatch[1], direct: pubMatch[2], reseller: pubMatch[3] } : {};

  // Individual pub IDs
  const idMatches = body.matchAll(/(pub-\\d+)\\s+(DIRECT|RESELLER)/g);
  for (const m of idMatches) publisherIds.push({ id: m[1], relation: m[2] });

  // Publisher details - associated domains
  const details = [];
  const detailMatch = body.match(/PUBLISHER DETAILS[\\s\\S]*?Publisher ID\\s+(pub-\\d+)[\\s\\S]*?Associated Domains\\s+(\\d+)/);
  if (detailMatch) {
    const domains = [];
    const domainMatches = body.matchAll(/(?:PUBLISHER DETAILS[\\s\\S]*?)((?:[a-z0-9][-a-z0-9]*\.)+[a-z]{2,})(?:\\s|$)/gm);
    // Simpler: grab all domain-looking strings after PUBLISHER DETAILS
    const afterDetails = body.split('PUBLISHER DETAILS')[1] || '';
    const dMatches = afterDetails.matchAll(/([a-z0-9][-a-z0-9]*(?:\\.[a-z0-9][-a-z0-9]*)+\\.[a-z]{2,})/g);
    for (const d of dMatches) {
      if (!domains.includes(d[1]) && d[1] !== 'sitedata.dev') domains.push(d[1]);
    }
    details.push({
      id: detailMatch[1],
      associatedDomains: Number(detailMatch[2]),
      domains,
    });
  }

  return { publisherIds, counts, details, url: location.href, title: document.title };
})()`;

/**
 * Parse keywords from rawText when eval-based extraction fails.
 * rawText format after "Top Keywords\nKeyword\nTraffic\nVolume\nCPC\n":
 *   toolify\n19.9K\n21.9K\n$1.98\ntoolify ai\n10.3K\n6.1K\n$0.85\n...
 */
function parseKeywordsFromText(text) {
  const keywords = [];
  const section = text.split(/Top Keywords/)[1];
  if (!section) return keywords;
  // Skip header line "Keyword\nTraffic\nVolume\nCPC"
  const afterHeader = section.replace(/^[\s\S]*?CPC\s*\n/, '');
  const lines = afterHeader.split('\n').map(l => l.trim()).filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const kw = lines[i];
    // A keyword line: does NOT start with digit or $, and is not just \- or a number
    if (/^[\d$]/.test(kw) || kw === '\\-' || kw === '-') { i++; continue; }
    const traffic = lines[i + 1] || null;
    const volume = lines[i + 2] || null;
    const cpc = lines[i + 3] || null;
    // Validate: traffic should look like a number (with K/M/B suffix)
    if (traffic && /^[\d.,]+[KMB]?$/i.test(traffic)) {
      keywords.push({
        keyword: kw,
        traffic,
        volume,
        cpc: (cpc === '\\-' || cpc === '-') ? null : cpc,
      });
      i += 4;
    } else {
      break;
    }
  }
  return keywords;
}

function parseAdsenseDomainsFromText(text) {
  const section = text.split(/Associated Domains/)[1];
  if (!section) return [];
  const lines = section.split('\n').map(l => l.trim()).filter(Boolean);
  // First line is the count, then domain names
  const domains = [];
  for (const line of lines.slice(1)) {
    if (/^[a-z0-9][-a-z0-9]*(?:\.[a-z0-9][-a-z0-9]*)*\.[a-z]{2,}$/.test(line)) {
      domains.push(line);
    }
  }
  return domains;
}

// ── main ─────────────────────────────────────────────────────────────

async function main() {
  const startUrl = report === 'adsense'
    ? 'https://sitedata.dev/reverse-adsense'
    : 'https://sitedata.dev';

  try {
    // 1. Open the right page
    await opencli(['browser', session, '--window', windowMode, 'open', startUrl]);
    await new Promise(r => setTimeout(r, 3000));

    // 2. Set input and trigger search via JS eval
    const searchResult = await batchBrowser(session, [
      { cmd: 'eval', args: { js: SET_INPUT_AND_SEARCH(domain, SEARCH_TAB) } },
    ]);
    const searchOk = searchResult[0]?.ok && searchResult[0]?.result?.ok;
    if (!searchOk) {
      throw new Error(`Search trigger failed: ${JSON.stringify(searchResult[0]?.result || searchResult[0]?.error)}`);
    }

    // 3. Wait for data to load (adsense publisher details load slower)
    const waitMs = report === 'adsense' ? 10000 : 6000;
    await new Promise(r => setTimeout(r, waitMs));

    // 4. Extract data
    const extractJs = report === 'adsense' ? EXTRACT_ADSENSE : EXTRACT_TRAFFIC;
    const extractResult = await batchBrowser(session, [
      { cmd: 'eval', args: { js: extractJs } },
    ]);

    if (!extractResult[0]?.ok) {
      throw new Error(`Extract failed: ${extractResult[0]?.error}`);
    }

    const raw = extractResult[0].result;

    // 5. Also get the plain text for rawText field
    const textResult = await batchBrowser(session, [
      { cmd: 'extract', args: {} },
    ]);
    const rawText = textResult[0]?.ok ? textResult[0].result.content : '';

    // 6. Build output
    const output = {
      version: 1,
      source: 'sitedata',
      retrievedAt: new Date().toISOString(),
      domain,
      report,
      url: raw.url || null,
    };

    if (report === 'traffic') {
      output.metrics = raw.cards || {};
      output.trend = raw.trend || [];
      output.channels = raw.channels || [];
      output.countries = raw.countries || [];
      // Keywords from eval may be empty; fall back to rawText parsing
      output.keywords = raw.keywords?.length ? raw.keywords : parseKeywordsFromText(rawText);
    } else if (report === 'adsense') {
      output.publisherIds = raw.publisherIds || [];
      output.publisherDetails = raw.details || [];
      // Fall back to rawText parsing for associated domains
      if (output.publisherDetails.length && !output.publisherDetails[0].domains?.length) {
        output.publisherDetails[0].domains = parseAdsenseDomainsFromText(rawText);
      }
    }

    output.rawText = rawText;

    printJson(output);

    if (outFile) {
      await writeFile(outFile, JSON.stringify(output, null, 2) + '\n');
      process.stderr.write(`Written to ${outFile}\n`);
    }
  } finally {
    if (!keepOpen) await closeSession(session);
  }
}

main().catch((err) => {
  process.stderr.write(`sitedata.mjs: ${err.message}\n`);
  process.exitCode = 1;
});
