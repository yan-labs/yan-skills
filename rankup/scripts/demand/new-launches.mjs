#!/usr/bin/env node
/** 新品候选快照与跨周工具词聚类；只发现候选，不判断需求。
 * node new-launches.mjs --days 7 --sources taaft,toolify --snapshot-dir <dir> --compare --md --json
 * 依赖真实 Chrome + OpenCLI（沿用 boards）；Toolify 无可靠发布时间，按观察日期留存。
 * 已知限制：词法启发式会漏掉隐含功能词；域名沿用 regDomain 的常见后缀规则。
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmdTaaft, cmdToolify, cmdProducthunt, stripTracking } from './boards.mjs';
import { regDomain } from './_chatgpt_web.mjs';
import { parseArgs, initEvidence, writeManifest, readToken } from './_lib.mjs';

const DAY = 86400000;
const SUFFIX = /^(generators?|makers?|changers?|creators?|removers?|editors?|converters?|swaps?|upscalers?|enhancers?|animators?)$/;
const STOP = new Set('ai free online the a an best new powered tool tools your for with and of to by from create generate make turn using ultimate easy simple most complete'.split(' '));

/** shortcut: 英语词法聚类不推断同义词或隐含功能，需要语义聚类时再升级。 */
export function extractCoreTerm({ name = '', tagline = '', task = '' }) {
  for (const text of [name, task, tagline]) {
    // 有品牌分隔符时只取功能描述一侧；普通连字符留作词间空格。
    const segments = String(text).replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s*[|:–—]\s*|\s+-\s+/);
    for (const segment of segments.reverse()) {
      const words = segment.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      const end = words.findIndex(w => SUFFIX.test(w));
      if (end < 0) continue;
      const marker = words.slice(0, end).findIndex(w => ['ai', 'free', 'online'].includes(w));
      const core = words.slice(marker > 0 && marker < end - 1 ? marker : 0, end + 1).filter(w => !STOP.has(w)).map(w =>
        SUFFIX.test(w) ? w.replace(/s$/, '') : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /s$/.test(w) && !/ss$/.test(w) ? w.slice(0, -1) : w);
      if (core.length >= 2) return core.join(' ');
    }
  }
  return null;
}

export function clusterLaunches(rows) {
  const terms = new Map();
  for (const row of rows) {
    const term = extractCoreTerm(row);
    if (!term || !row.rootDomain) continue;
    if (!terms.has(term)) terms.set(term, new Map());
    const sites = terms.get(term);
    if (!sites.has(row.rootDomain)) sites.set(row.rootDomain, { ...row, sources: [...(row.sources || [row.source])] });
    else {
      const site = sites.get(row.rootDomain);
      site.sources = [...new Set([...site.sources, ...(row.sources || [row.source])])];
    }
  }
  return [...terms].map(([term, sites]) => ({ term, domainCount: sites.size, sites: [...sites.values()] }))
    .sort((a, b) => b.domainCount - a.domainCount || a.term.localeCompare(b.term));
}

/** 新增按首次观察日期计算，绝不把目录抓取日称为产品发布日期。 */
export function compareClusters(rows, history, fetchedAt) {
  const now = Date.parse(fetchedAt);
  const recent = history.filter(s => Date.parse(s.fetchedAt) >= now - 28 * DAY && Date.parse(s.fetchedAt) <= now);
  const observations = [...recent, { fetchedAt, rows }];
  const terms = new Map();
  for (const snapshot of observations.sort((a, b) => a.fetchedAt.localeCompare(b.fetchedAt))) {
    for (const cluster of clusterLaunches(snapshot.rawRows ?? snapshot.rows)) {
      if (!terms.has(cluster.term)) terms.set(cluster.term, new Map());
      for (const site of cluster.sites) {
        const domains = terms.get(cluster.term);
        if (!domains.has(site.rootDomain)) domains.set(site.rootDomain, snapshot.fetchedAt);
      }
    }
  }
  return clusterLaunches(rows).map(cluster => {
    const firstSeen = [...terms.get(cluster.term).values()].sort();
    const previousWeekDomains = firstSeen.filter(d => Date.parse(d) < now - 7 * DAY).length;
    return { ...cluster, totalDomains28d: firstSeen.length,
      newDomainsThisWeek: firstSeen.length - previousWeekDomains,
      firstSeen: firstSeen[0].slice(0, 10),
      becameMultiThisWeek: recent.length > 0 && previousWeekDomains === 1 && firstSeen.length >= 2,
      isNewTerm: !recent.some(s => clusterLaunches(s.rawRows ?? s.rows).some(c => c.term === cluster.term)) };
  });
}

export function normalizeLaunch(row, fetchedAt) {
  const source = row.source.split(':')[0];
  return { source, sources: [source], id: row.extra?.id ?? row.extra?.handle ?? null,
    name: row.name, website: row.domain ? stripTracking(row.url) : null,
    rootDomain: row.rootDomain ?? (row.domain ? regDomain(row.domain) : null),
    tagline: row.extra?.tagline ?? '', task: row.extra?.task ?? '',
    pricing: row.extra?.pricing ?? null, releasedAt: row.releasedAt ?? null,
    releasedAtEstimated: row.releasedAtEstimated ?? false,
    saves: row.metricLabel === 'saves' ? row.metric : null,
    monthlyVisits: row.metricLabel === 'monthly visits' ? row.metric : null,
    observedAt: fetchedAt };
}

export function mergeLaunches(rows) {
  const unique = new Map();
  for (const row of rows) {
    const key = row.rootDomain || `${row.source}:${row.id || row.name}`;
    if (!unique.has(key)) unique.set(key, { ...row });
    else {
      const current = unique.get(key);
      current.sources = [...new Set([...current.sources, ...row.sources])];
      for (const field of ['pricing', 'releasedAt', 'saves', 'monthlyVisits', 'task', 'tagline']) {
        if (current[field] == null || current[field] === '') current[field] = row[field];
      }
      current.releasedAtEstimated ||= row.releasedAtEstimated;
    }
  }
  return [...unique.values()];
}

export function renderMarkdown(result) {
  const lines = ['# 新品候选快照', '', `抓取：${result.fetchedAt}；窗口：${result.days} 天。仅候选，不判断需求。`, '',
    result.comparison.note, '', ...result.notes.map(n => `- ${n}`), '',
    '| 来源 | 取回行数 | 独立域名 | 最老发布时间 |', '|---|---:|---:|---|',
    ...result.sourceStats.map(s => `| ${s.source} | ${s.count} | ${s.domains} | ${s.oldestReleasedAt ?? '未知'} |`), '',
    `合并前 ${result.rawRows.length} 行；合并后 ${result.rows.length} 行。`];
  for (const [title, list] of [['多站同词', result.multiSite], ['新出现单站词', result.newSingleSite]]) {
    lines.push('', `## ${title}`, '', '| 词 | 当前域名 / 28天累计 / 本周新增 | 首次观察 | 本周1→多 | 站点、定价、发布时间 |', '|---|---|---|---|---|');
    for (const c of list) lines.push(`| ${c.term} | ${c.domainCount} / ${c.totalDomains28d} / ${c.newDomainsThisWeek} | ${c.firstSeen} | ${c.becameMultiThisWeek ? '是' : ''} | ${c.sites.map(s => `${s.rootDomain}（${String(s.pricing ?? '定价未知').replaceAll('|', '/')}；${s.releasedAt ?? '发布时间未知'}${s.releasedAtEstimated ? '，估算' : ''}）`).join('<br>')} |`);
    if (!list.length) lines.push('| 无 | | | | |');
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('new-launches.mjs --days 7 --sources taaft,toolify[,producthunt] --snapshot-dir <dir> [--compare] [--json] [--md]\n快照为 YYYY-MM-DD.json；--json 与 --md 同用时 stdout 是 JSON，Markdown 写同目录日期.md（无目录则 stderr）。');
    return;
  }
  const days = Number(args.days ?? 7);
  if (!Number.isFinite(days) || days <= 0) throw new Error('--days 要大于 0');
  const sources = [...new Set(String(args.sources ?? 'taaft,toolify').split(',').map(s => s.trim()))];
  if (sources.some(s => !['taaft', 'toolify', 'producthunt'].includes(s))) throw new Error('--sources 只认 taaft,toolify,producthunt');
  const fetchedAt = new Date().toISOString();
  const dir = args['snapshot-dir'] ? resolve(args['snapshot-dir']) : null;
  const history = [];
  // 先读再写，允许同日 compare 读取上一轮快照；每天文件保留最近一次采集。
  if (args.compare && dir && existsSync(dir)) {
    for (const file of readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))) {
      const snapshot = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
      if (Date.parse(snapshot.fetchedAt) >= Date.parse(fetchedAt) - 28 * DAY && Date.parse(snapshot.fetchedAt) <= Date.parse(fetchedAt)) history.push(snapshot);
    }
  }
  initEvidence('new-launches', { dir: dir ? resolve(dir, `evidence-${fetchedAt.replaceAll(':', '-')}`) : null });
  const rawRows = [], sourceStats = [], notes = [];
  if (!sources.includes('producthunt')) notes.push('ProductHunt 未选择；可用 --sources 加入，缺 PRODUCTHUNT_TOKEN 时跳过。');
  for (const source of sources) {
    if (source === 'producthunt' && !readToken('PRODUCTHUNT_TOKEN')) { notes.push('ProductHunt 缺 PRODUCTHUNT_TOKEN，已跳过。'); continue; }
    const fn = { taaft: cmdTaaft, toolify: cmdToolify, producthunt: cmdProducthunt }[source];
    const collected = await fn({ board: 'new', days, limit: source === 'producthunt' ? 50 : Infinity });
    const rows = collected.map(r => normalizeLaunch(r, fetchedAt));
    rawRows.push(...rows);
    sourceStats.push({ source, count: rows.length, domains: new Set(rows.map(r => r.rootDomain).filter(Boolean)).size,
      oldestReleasedAt: rows.map(r => r.releasedAt).filter(Boolean).sort()[0] ?? null });
    if (source === 'toolify') notes.push('Toolify new 仅当前列表；无可靠发布时间，releasedAt=null，不保证覆盖所选天数。');
  }
  const manifest = JSON.parse(readFileSync(writeManifest(), 'utf8'));
  for (const entry of manifest.sources) {
    if (entry.source === 'taaft:new') notes.push(`TAAFT ${entry.stopReason ?? entry.status}；去重前读取 ${entry.rawCount} 行；ID 去重 ${entry.uniqueCount ?? '未知'} 行；最老 ${entry.oldestReleasedAt ?? '未知'}（估算）。`);
    if (!['ok'].includes(entry.status)) notes.push(`${entry.source} 采集状态 ${entry.status}，见证据 manifest。`);
  }
  const rows = mergeLaunches(rawRows);
  const clusters = compareClusters(rawRows, history, fetchedAt);
  const result = { fetchedAt, days, sources, notes, sourceStats, rawRows, rows, clusters,
    comparison: { requested: !!args.compare, baselineSnapshots: history.length,
      note: history.length ? `已读取 ${history.length} 份快照；新增按首次观察计算，同日基线不代表已有跨周覆盖。` : '首次运行，无对比基线；累计与本周新增仅代表本次观察。' },
    multiSite: clusters.filter(c => c.domainCount >= 2),
    newSingleSite: clusters.filter(c => c.domainCount === 1 && c.isNewTerm) };
  if (dir) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(resolve(dir, `${fetchedAt.slice(0, 10)}.json`), JSON.stringify(result, null, 2) + '\n');
    if (args.md) writeFileSync(resolve(dir, `${fetchedAt.slice(0, 10)}.md`), renderMarkdown(result));
  }
  if (args.json) console.log(JSON.stringify(result, null, 2));
  if (args.md && !args.json || !args.json && !args.md) console.log(renderMarkdown(result));
  else if (args.md && !dir) console.error(renderMarkdown(result));
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) {
  main().catch(e => { console.error(e.message); process.exitCode = 1; });
}
