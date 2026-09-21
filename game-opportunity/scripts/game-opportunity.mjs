#!/usr/bin/env node
/**
 * 小游戏机会流水线：复用 Rankup 取数脚本，产出每日原始信号与事实排版的中文日报。
 *
 * 分层纪律（2026-08-30 重构）：
 * - 采集层（discover/radar/collect/demand/evaluate 的取数部分）只落原始 per-source
 *   证据 + manifest；失败留现场（Cloudflare 挑战页保留原始 HTML 并标记，不剔除候选）。
 * - 本脚本不打分、不设阈值门、不下判决。develop/research/watch 等判断只能来自
 *   evaluation 文件（AI 判读写入），脚本原样透传，缺失时如实标「未判」。
 * - 「未查询」与「测得为零」严格分开：未查询的市场是 status:'not-queried'，
 *   全部数值为 null，绝不落 0。
 * - 修复：缺指标缓存曾被复用为已查，未测趋势/竞争字段曾因形状完整而通过验收。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const MONITOR = path.join(REPO, 'rankup/scripts/demand/game-platform-monitor.mjs');
const NEW_TITLES = path.join(REPO, 'rankup/scripts/demand/game-newtitles.mjs');
const SEMRUSH_KEYWORD = path.join(REPO, 'backlink/scripts/semrush-keyword.mjs');
const ACTIONS = ['develop', 'research', 'watch'];

const HELP = `game-opportunity.mjs — 每日小游戏机会发现、筛选与报告

用法:
  node game-opportunity/scripts/game-opportunity.mjs <命令> [选项]

命令:
  discover   运行游戏平台 sitemap diff
  radar      聚合 Steam、itch.io、Poki 新标题并做历史 diff
  collect    依次运行 discover + radar，供早间自动任务采集
  collect-checklist  执行早间采集并逐项验收
  dedupe     合并当天 discovery + radar，只保留新增游戏
  plan       生成“全球先查、国家再下钻”的关键词计划
  demand     执行全球量查询，再查询主要国家与英语大市场
  evaluate   合并当天输入、验活 URL、汇总原始信号并排版日报（判决只来自 evaluation 文件）
  decision-checklist 执行需求调查、日报并逐项验收
  render     从已有候选或 --evaluation 文件重新排版日报
  daily      依次运行 collect + demand + evaluate
  reject <entity-name>  在 watch-pool 里把匹配到的实体标记为已否决
                         （写 action:"rejected" 与 rejectedAt 时间戳），
                         此后 carryForward 与 watch-pool 续带都会跳过它，
                         不再每天重新带回候选列表

选项:
  --date YYYY-MM-DD       报告日期（默认今天）
  --limit <n>             每个平台/来源最多读取条数（默认 30）
  --source <name>         radar 仅重跑指定来源（steam、itch、poki、reddit、youtube、x）
  --evaluation <file>     人工或外部量化结果；数组或 {candidates:[...]}
  --semrush-node <n>      指定 Semrush 网页节点（节点故障时重试）
  --project-root <dir>    .rankup 所在项目（默认当前目录）
  --no-social             radar 不调用 Reddit、YouTube、X（离线检查用）
  --check-only            只检查已有产物，不重新取数
  --dry-run               只显示将执行的动作，不联网、不写文件
  --self-test             运行内置离线检查
  -h, --help

固定产物：.rankup/demand/game-review/YYYY-MM-DD-{discovery,radar,new-games,demand-plan,demand-results,candidates}.json、
          YYYY-MM-DD-report.md、YYYY-MM-DD-evidence/（挑战页等原始现场）、latest.json、latest.md、latest-new-games.json
可选输入：YYYY-MM-DD-demand-selection.json（AI 写入的深查名单，entityId 数组；缺省用机械顺序）

reject 用法:
  node game-opportunity/scripts/game-opportunity.mjs reject <entity-name> [--project-root <dir>] [--dry-run]
  <entity-name>           按 entityId 或名称匹配（大小写不敏感），从 --project-root（默认当前目录）
                          下的 .rankup/tasks/game-opportunity-watch-pool.json 的 active 列表中查找并标记`;

function parseArgs(argv) {
  const out = { command: null, date: new Date().toISOString().slice(0, 10), limit: 30, root: process.cwd() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (!argv[i + 1]) throw new Error(`${a} 缺少参数`);
      return argv[++i];
    };
    if (!a.startsWith('-') && !out.command) out.command = a;
    // Second bare positional: only `reject <entity-name>` consumes this today.
    else if (!a.startsWith('-') && out.entityName === undefined) out.entityName = a;
    else if (a === '--date') out.date = next();
    else if (a === '--limit') out.limit = Number(next());
    else if (a === '--source') out.source = next();
    else if (a === '--evaluation') out.evaluation = path.resolve(next());
    else if (a === '--semrush-node') out.semrushNode = String(next()).trim();
    else if (a === '--project-root') out.root = path.resolve(next());
    else if (a === '--no-social') out.noSocial = true;
    else if (a === '--check-only') out.checkOnly = true;
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '-h' || a === '--help') out.help = true;
    else throw new Error(`未知参数：${a}`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(out.date)) throw new Error('--date 需要 YYYY-MM-DD');
  if (!Number.isInteger(out.limit) || out.limit < 1) throw new Error('--limit 需要正整数');
  if (out.source && !['steam', 'itch', 'poki', 'reddit', 'youtube', 'x'].includes(out.source)) throw new Error('--source 必须是 steam、itch、poki、reddit、youtube 或 x');
  out.root = path.resolve(out.root);
  out.reviewDir = path.join(out.root, '.rankup/demand/game-review');
  out.radarState = path.join(out.root, '.rankup/demand/game-radar-snapshots');
  return out;
}

const readJson = (file, fallback = null) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return fallback; }
};
const writeJson = (file, data) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
};
const writeText = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text.endsWith('\n') ? text : `${text}\n`);
};
const exists = (file) => fs.existsSync(file);
const nonempty = (v) => v !== null && v !== undefined && v !== '' && (!Array.isArray(v) || v.length > 0);
const arr = (v) => Array.isArray(v) ? v : (nonempty(v) ? [v] : []);
const validUrl = (v) => { try { return /^https?:$/.test(new URL(v).protocol); } catch { return false; } };
const playableEmbed = (v) => {
  try { return !/(^|\.)(?:youtube(?:-nocookie)?\.com|youtu\.be|vimeo\.com)$/i.test(new URL(v).hostname); }
  catch { return false; }
};
const uniq = (xs) => [...new Set(xs.filter(nonempty))];
const normalizeName = (v) => String(v ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const normalizeUrl = (v) => {
  try { const u = new URL(v); u.hash = ''; u.search = ''; return `${u.hostname.replace(/^www\./, '')}${u.pathname.replace(/\/$/, '')}`.toLowerCase(); }
  catch { return ''; }
};
const slugName = (url) => {
  try { return decodeURIComponent(new URL(url).pathname.split('/').filter(Boolean).pop() || new URL(url).hostname).replace(/[-_]+/g, ' '); }
  catch { return '未命名游戏'; }
};
const decodeHtml = (v) => String(v ?? '').replace(/&(?:amp|#38);/gi, '&').replace(/&(?:quot|#34);/gi, '"').replace(/&(?:apos|#39);/gi, "'").replace(/&(?:lt|#60);/gi, '<').replace(/&(?:gt|#62);/gi, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
function pageMeta(html, baseUrl) {
  const title = decodeHtml(/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || null;
  const rawIframe = decodeHtml(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? '').trim();
  let iframeUrl = null;
  try { if (rawIframe) { const u = new URL(rawIframe, baseUrl); if (/^https?:$/.test(u.protocol)) iframeUrl = u.href; } } catch { /* 无效 iframe */ }
  return { title, iframeUrl };
}
function cleanPageTitle(title) {
  return decodeHtml(title).replace(/\s+/g, ' ').trim().split(/\s+(?:\||[-–—])\s+|[：｜]/)[0]
    .replace(/^Save\s+\d+%\s+on\s+(.+?)\s+on Steam$/i, '$1').replace(/\s*[|｜]\s*$/, '').trim();
}
const errorPageTitle = (title) => /^(?:404|410)\b|\bnot found\b|\bpage not found\b/i.test(String(title ?? '').trim());
const challengePageTitle = (title) => /^just a moment(?:\.\.\.)?$/i.test(String(title ?? '').trim());
function noisyName(candidate) {
  const name = arr(candidate.names)[0] ?? candidate.name ?? '';
  if (!name) return true;
  if (/\.(?:html?|php)(?:\W|$)/i.test(name) || /^[a-z]?\d{5,}$/i.test(name)) return true;
  const slug = arr(candidate.urls)[0] ? slugName(arr(candidate.urls)[0]) : '';
  return normalizeName(name) === normalizeName(slug) && (name === name.toLowerCase() || !/\s/.test(name));
}

// Keyword rows are observations, not append-only JSON blobs. Keep the caller's
// preferred row intact: merging old numbers into an explicit new null revives stale data.
function mergeKeywordRows(base, incoming) {
  const rows = [...arr(base), ...arr(incoming)];
  const market = (row) => String(row?.market ?? row?.gl ?? row?.db ?? '').toLowerCase();
  const namedMarkets = new Set(rows.filter((row) => market(row)).map((row) => normalizeName(row.keyword)));
  const seen = new Set();
  return rows.filter((row) => {
    const word = normalizeName(row?.keyword);
    if (word && !market(row) && row.status === 'not-queried' && namedMarkets.has(word)) return false;
    const key = word ? `${word}:${market(row)}` : JSON.stringify(row);
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}

function mergeMissing(base, incoming) {
  if (!nonempty(base)) return incoming;
  if (!nonempty(incoming)) return base;
  if (Array.isArray(base) && Array.isArray(incoming)) {
    const seen = new Set();
    return [...base, ...incoming].filter((v) => {
      const key = typeof v === 'object' ? JSON.stringify(v) : String(v);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }
  if (typeof base === 'object' && typeof incoming === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(incoming)) out[k] = k === 'keywords' && Array.isArray(v) ? mergeKeywordRows(out[k], v) : mergeMissing(out[k], v);
    return out;
  }
  return base;
}

function runProcess(command, argv, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, argv, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (e) => resolve({ ok: false, error: e.message, stdout, stderr }));
    child.on('close', (code) => resolve({ ok: code === 0, code, stdout, stderr, error: code ? stderr.trim() || `退出码 ${code}` : null }));
  });
}
const runNode = (script, argv, cwd) => runProcess(process.execPath, [script, ...argv], cwd);

function files(o) {
  const base = path.join(o.reviewDir, o.date);
  return {
    discovery: `${base}-discovery.json`, radar: `${base}-radar.json`,
    newGames: `${base}-new-games.json`,
    demandPlan: `${base}-demand-plan.json`, demandSelection: `${base}-demand-selection.json`,
    globalKeywords: `${base}-global-keywords.txt`,
    evidenceDir: `${base}-evidence`,
    globalSemrush: `${base}-semrush-global.jsonl`, countryPlan: `${base}-country-plan.json`,
    countrySemrush: `${base}-semrush-countries.jsonl`, demandResults: `${base}-demand-results.json`,
    evaluation: `${base}-evaluation.json`,
    candidates: `${base}-candidates.json`, report: `${base}-report.md`,
    latestJson: path.join(o.reviewDir, 'latest.json'), latestMd: path.join(o.reviewDir, 'latest.md'),
    latestNewGames: path.join(o.reviewDir, 'latest-new-games.json'),
    collectChecklist: `${base}-collect-checklist.json`, collectChecklistMd: `${base}-collect-checklist.md`,
    decisionChecklist: `${base}-decision-checklist.json`, decisionChecklistMd: `${base}-decision-checklist.md`,
    latestCollectChecklist: path.join(o.reviewDir, 'latest-collect-checklist.json'),
    latestCollectChecklistMd: path.join(o.reviewDir, 'latest-collect-checklist.md'),
    latestDecisionChecklist: path.join(o.reviewDir, 'latest-decision-checklist.json'),
    latestDecisionChecklistMd: path.join(o.reviewDir, 'latest-decision-checklist.md'),
  };
}

function discoveryHealth(data) {
  const usable = Number(data?.compared ?? 0) + Number(data?.baselineCreated ?? 0);
  const warnings = arr(data?.platforms).filter((p) => p.status === 'failed').map((p) => `${p.id ?? p.name ?? 'unknown-platform'}: ${p.error ?? '抓取失败'}`);
  return { usable, partial: usable > 0 && warnings.length > 0, warnings };
}

async function discover(o) {
  const f = files(o);
  if (o.dryRun) return { ok: true, dryRun: true, command: `${process.execPath} ${MONITOR} --limit ${o.limit} --out ${f.discovery}` };
  fs.mkdirSync(o.reviewDir, { recursive: true });
  const r = await runNode(MONITOR, ['--limit', String(o.limit), '--out', f.discovery], o.root);
  if (!exists(f.discovery)) {
    writeJson(f.discovery, { date: o.date, generatedAt: new Date().toISOString(), candidates: [], platforms: [], errors: [r.error] });
    return { ...r, ok: false, partial: false, file: f.discovery };
  }
  const data = readJson(f.discovery);
  if (!data) return { ...r, ok: false, partial: false, error: 'discovery JSON 无法读取', file: f.discovery };
  const health = discoveryHealth(data);
  if (health.usable > 0) {
    data.warnings = uniq([...arr(data.warnings), ...health.warnings]);
    data.errors = [];
    writeJson(f.discovery, data);
    return { ...r, ok: true, partial: health.partial, warnings: health.warnings, error: null, file: f.discovery };
  }
  data.errors = uniq([...arr(data.errors), ...health.warnings, r.error]);
  writeJson(f.discovery, data);
  return { ...r, ok: false, partial: false, error: data.errors.join('; ') || '没有可用平台结果', file: f.discovery };
}

function itemKeys(item) {
  return uniq([validUrl(item.url) ? `u:${normalizeUrl(item.url)}` : '', normalizeName(item.name) ? `n:${normalizeName(item.name)}` : '']);
}

const campaignKeys = (item) => uniq([
  ...arr(item.urls).filter(validUrl).map((v) => `u:${normalizeUrl(v)}`),
  validUrl(item.url) ? `u:${normalizeUrl(item.url)}` : '',
  normalizeName(item.author) ? `a:${normalizeName(item.author)}` : '',
  normalizeName(item.title ?? item.name ?? item.text) ? `t:${normalizeName(item.title ?? item.name ?? item.text)}` : '',
]);

function mergeCampaigns(items) {
  const groups = [];
  for (const item of items) {
    const keys = campaignKeys(item);
    const hits = groups.map((g, i) => g.keys.some((k) => keys.includes(k)) ? i : -1).filter((i) => i >= 0);
    if (!hits.length) { groups.push({ keys, items: [item] }); continue; }
    const first = hits[0];
    groups[first].items.push(item);
    groups[first].keys = uniq([...groups[first].keys, ...keys]);
    for (const i of hits.slice(1).reverse()) {
      groups[first].items.push(...groups[i].items);
      groups[first].keys = uniq([...groups[first].keys, ...groups[i].keys]);
      groups.splice(i, 1);
    }
  }
  return groups.map((group, i) => {
    const rows = group.items;
    const names = uniq(rows.map((v) => v.title ?? v.name ?? v.text).filter(Boolean));
    const urls = uniq(rows.flatMap((v) => [...arr(v.urls), v.url, v.destinationUrl]).filter(validUrl));
    return {
      campaignId: `campaign-${String(i + 1).padStart(3, '0')}-${normalizeName(names[0]).replace(/ /g, '-').slice(0, 50)}`,
      name: names[0] ?? '未命名游戏线索', names, urls, sourceLinks: urls,
      evidenceLinks: urls, authors: uniq(rows.map((v) => v.author).filter(Boolean)),
      platforms: uniq(rows.map((v) => v.source)), campaignCount: 1, mentions: rows.length,
      firstSeen: rows.map((v) => v.publishedAt).filter(Boolean).sort()[0] ?? new Date().toISOString(),
      socialEvidence: rows,
    };
  });
}

function socialRows(source, rows) {
  return rows.map((row) => ({
    source,
    title: row.title ?? row.text ?? row.name,
    author: row.author ?? row.channel,
    url: row.url ?? row.webpage_url,
    destinationUrl: row.url_overridden_by_dest,
    publishedAt: row.created_utc ? new Date(Number(row.created_utc) * 1000).toISOString()
      : (row.created_at ?? row.published ?? (row.timestamp ? new Date(Number(row.timestamp) * 1000).toISOString() : null)),
    engagement: {
      score: row.score ?? null, comments: row.comments ?? null, likes: row.likes ?? null,
      views: row.views ?? row.view_count ?? null,
    },
  })).filter((row) => row.title || row.url);
}

function parseSocialRows(source, stdout) {
  const data = source === 'youtube'
    ? stdout.split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : JSON.parse(stdout);
  return socialRows(source, arr(data));
}

async function socialRadar(o) {
  if (o.noSocial) return { sources: [], candidates: [], errors: [] };
  const yesterday = new Date(`${o.date}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const since = yesterday.toISOString().slice(0, 10);
  const specs = [
    ['reddit', 'opencli', ['reddit', 'search', 'new browser game', '--sort', 'new', '--time', 'day', '--limit', String(o.limit), '-f', 'json']],
    ['youtube', 'yt-dlp', ['--dump-json', '--playlist-end', String(o.limit), `ytsearch${o.limit}:new browser game`]],
    ['x', 'opencli', ['twitter', 'search', `"browser game" since:${since}`, '--product', 'live', '--limit', String(o.limit), '-f', 'json']],
  ];
  const sources = [], rows = [], errors = [];
  for (const [source, command, argv] of specs) {
    if (o.source && o.source !== source) continue;
    const r = await runProcess(command, argv, o.root);
    if (!r.ok) { const error = `${source}: ${r.error}`; errors.push(error); sources.push({ source, kind: 'social-24h', status: 'failed', count: 0, error }); continue; }
    try {
      const items = parseSocialRows(source, r.stdout);
      rows.push(...items);
      sources.push({ source, kind: 'social-24h', status: 'collected', count: items.length });
    } catch (e) {
      const error = `${source}: 输出解析失败 ${e.message}`;
      errors.push(error); sources.push({ source, kind: 'social-24h', status: 'failed', count: 0, error });
    }
  }
  return { sources, candidates: mergeCampaigns(rows), errors };
}

function mergeRadarReport(previous, current, date) {
  if (!previous || previous.date !== date) return { ...current, runCount: 1, sameDayMerged: false };
  const sourceMap = new Map(arr(previous.sources).map((row) => [row.source, row]));
  for (const row of arr(current.sources)) {
    const older = sourceMap.get(row.source);
    sourceMap.set(row.source, older ? {
      ...older,
      ...row,
      error: ['compared', 'baseline_created', 'collected'].includes(row.status) ? null : (row.error ?? older.error),
      added: [...new Map([...arr(older.added), ...arr(row.added)].map((item) => [itemKeys(item)[0] ?? JSON.stringify(item), item])).values()],
    } : row);
  }
  const candidateMap = new Map();
  for (const row of [...arr(previous.candidates), ...arr(current.candidates)]) {
    const key = row.campaignId ?? itemKeys(row)[0] ?? normalizeName(row.name ?? row.title);
    const older = candidateMap.get(key);
    candidateMap.set(key, older ? {
      ...older, ...row,
      names: uniq([...arr(older.names), ...arr(row.names)]),
      urls: uniq([...arr(older.urls), ...arr(row.urls)]),
      sourceLinks: uniq([...arr(older.sourceLinks), ...arr(row.sourceLinks)]),
      evidenceLinks: uniq([...arr(older.evidenceLinks), ...arr(row.evidenceLinks)]),
      socialEvidence: [...arr(older.socialEvidence), ...arr(row.socialEvidence)],
    } : row);
  }
  const candidates = [...candidateMap.values()];
  const retriedSources = new Set(arr(current.sources).map((row) => row.source));
  const retainedErrors = arr(previous.errors).filter((error) => !retriedSources.has(String(error).split(':', 1)[0]));
  return {
    ...current,
    runCount: Number(previous.runCount ?? 1) + 1,
    sameDayMerged: true,
    sources: [...sourceMap.values()],
    candidates,
    queue: candidates,
    coreErrors: uniq([...arr(previous.coreErrors), ...arr(current.coreErrors)]),
    errors: uniq([...retainedErrors, ...arr(current.errors)]),
  };
}

async function radar(o) {
  const f = files(o);
  if (o.dryRun) return { ok: true, dryRun: true, sources: ['steam', 'itch', 'poki', ...(o.noSocial ? [] : ['reddit', 'youtube', 'x'])], file: f.radar };
  fs.mkdirSync(o.radarState, { recursive: true });
  const sources = [];
  const errors = [];
  for (const source of ['steam', 'itch', 'poki']) {
    if (o.source && o.source !== source) continue;
    const stateFile = path.join(o.radarState, `${source}.json`);
    const previous = readJson(stateFile, { seenKeys: [] });
    const seen = new Set(previous.seenKeys ?? []);
    const r = await runNode(NEW_TITLES, ['--source', source, '--count', String(o.limit), '--json'], o.root);
    if (!r.ok) { errors.push(`${source}: ${r.error}`); sources.push({ source, status: 'failed', count: 0, added: [], error: r.error }); continue; }
    let items;
    try { items = JSON.parse(r.stdout); }
    catch (e) { errors.push(`${source}: 输出解析失败 ${e.message}`); sources.push({ source, status: 'failed', count: 0, added: [], error: e.message }); continue; }
    const added = previous.seenKeys?.length ? items.filter((item) => !itemKeys(item).some((key) => seen.has(key))) : [];
    const nextKeys = uniq([...seen, ...items.flatMap(itemKeys)]);
    writeJson(stateFile, { source, updatedAt: new Date().toISOString(), seenKeys: nextKeys, items });
    sources.push({ source, status: previous.seenKeys?.length ? 'compared' : 'baseline_created', count: items.length, addedCount: added.length, added });
  }
  const coreErrors = [...errors];
  const social = await socialRadar(o);
  sources.push(...social.sources);
  errors.push(...social.errors);
  const candidates = [...sources.flatMap((s) => s.added ?? []), ...social.candidates];
  const current = { date: o.date, generatedAt: new Date().toISOString(), window: '24h-and-since-last-snapshot', sources, candidates, queue: candidates, coreErrors, errors };
  const report = mergeRadarReport(readJson(f.radar), current, o.date);
  writeJson(f.radar, report);
  return { ok: !coreErrors.length, file: f.radar, errors, candidates: candidates.length };
}

function inputCandidates(data, origin) {
  if (!data) return [];
  const rows = [
    ...arr(data.candidates), ...arr(data.queue), ...arr(data.entities),
    ...arr(data.platforms).flatMap((p) => arr(p.added).map((v) => ({ ...v, platform: v.platform ?? p.name, languages: v.languages ?? p.languages, markets: v.markets ?? p.markets }))),
    ...arr(data.sources).flatMap((s) => arr(s.added).map((v) => ({ ...v, source: v.source ?? s.source }))),
  ];
  return rows.map((row) => {
    const urls = uniq([...arr(row.urls), row.url, row.link].filter(validUrl));
    const names = uniq([...arr(row.names), row.name, row.title, urls[0] ? slugName(urls[0]) : ''].filter(nonempty));
    const sourceLinks = uniq([...arr(row.sourceLinks), ...urls]);
    return {
      entityId: row.entityId ?? (normalizeName(names[0]).replace(/ /g, '-') || normalizeUrl(urls[0]).replace(/[^a-z0-9]+/g, '-')),
      names, urls, sourceLinks,
      playLinks: uniq([...arr(row.playLinks), row.playUrl, row.embed?.url].filter(validUrl)),
      evidenceLinks: uniq([...arr(row.evidenceLinks), ...sourceLinks]),
      platforms: uniq([...arr(row.platforms), row.platform, row.source]),
      languages: arr(row.languages), markets: arr(row.markets),
      firstSeen: row.firstSeen ?? data.generatedAt ?? data.date ?? null,
      pageType: row.pageType ?? row.kind ?? 'new-on-platform',
      // playable 是实测事实，不从「存在 playLink」推断；未测就是 null（未测 ≠ 否）。
      reachable: row.reachable ?? null, playable: row.playable ?? null,
      keywords: arr(row.keywords), trend: row.trend ?? {}, demandProof: row.demandProof ?? {},
      promotionRisk: row.promotionRisk ?? {}, reasons: arr(row.reasons),
      origin: uniq([...arr(row.origin), origin]),
      // Age has to survive normalisation the same way firstSeen does. Dropping it
      // here made every carried candidate look brand new to selectDeepCheck, which
      // is how six stale candidates kept holding the whole deep-check queue.
      ...(row.carryForward ? { carryForward: row.carryForward } : {}),
      ...(row.decision ? { decision: row.decision } : {}),
      ...(row.action ? { action: row.action } : {}),
      ...(row.nextAction ? { nextAction: row.nextAction } : {}),
    };
  }).filter((row) => row.names.length || row.urls.length);
}

function sameCandidate(a, b) {
  if (a.entityId && b.entityId && normalizeName(a.entityId) === normalizeName(b.entityId)) return true;
  const names = new Set(arr(a.names).map(normalizeName).filter(Boolean));
  const urls = new Set(arr(a.urls).map(normalizeUrl).filter(Boolean));
  return arr(b.names).some((v) => names.has(normalizeName(v))) || arr(b.urls).some((v) => urls.has(normalizeUrl(v)));
}

function mergeCandidates(rows) {
  const out = [];
  for (const row of rows) {
    const i = out.findIndex((v) => sameCandidate(v, row));
    if (i < 0) out.push(row); else out[i] = mergeMissing(out[i], row);
  }
  return out;
}

function mergeRichIntoOrdered(ordered, richerRows) {
  const out = [...ordered];
  for (const row of richerRows) {
    const i = out.findIndex((v) => sameCandidate(v, row));
    if (i < 0) out.push(row); else out[i] = mergeMissing(row, out[i]);
  }
  return out;
}

const numericMetric = (value) => nonempty(value) && typeof value !== 'boolean' && Number.isFinite(Number(value)) && Number(value) >= 0;
const measuredStatus = (row) => row && (row.status == null || ['ok', 'measured', 'collected'].includes(row.status)) && !row.error;
const evidencePresent = (value, root) => typeof value === 'string' && exists(path.resolve(root, value)) && fs.statSync(path.resolve(root, value)).isFile() && fs.statSync(path.resolve(root, value)).size > 0;

// Empty is a provider result only after the raw page and a known-volume control
// were checked. noData/absent alone also describe login and extraction failures.
function providerResultReady(row, scope, root) {
  if (!row || row.error) return false;
  if (['verified-empty', 'absent-confirmed'].includes(row.status)) {
    return row.verification?.pageChecked === true && row.verification?.controlPassed === true
      && evidencePresent(row.evidenceFile, root) && evidencePresent(row.verification?.controlFile, root);
  }
  if (!measuredStatus(row)) return false;
  if (scope === 'country') return numericMetric(row.volume);
  return numericMetric(row.globalVolume) && (Number(row.globalVolume) === 0
    || (row.byCountry && Object.values(row.byCountry).some((value) => numericMetric(value) && Number(value) > 0)));
}

/**
 * 只做机械排序（谁进日报的展示截断），不含任何价值判断：
 * 花过配额的深查候选必须留在报告里（哪怕精确词为零），其次是当天新发现，
 * 再次是到期复查的续带候选。哪个值得开发由 AI 看原始信号判。
 */
function rankCandidates(candidates, todayRows) {
  const rank = (c) => {
    if (c.demandCoverage?.globalChecked) return 0;
    if (todayRows.some((v) => sameCandidate(v, c))) return 1;
    if (c.carryForward?.recheckDue) return 2;
    return 3;
  };
  return candidates.map((c, i) => ({ c, i, rank: rank(c) })).sort((a, b) => a.rank - b.rank || a.i - b.i).map((v) => v.c);
}

const RECHECK_MILESTONES = [3, 7, 14, 28];

/**
 * A recheck is due when the candidate has *crossed* a milestone since the last
 * run, not when its age lands exactly on one.
 *
 * `includes(ageDays)` used to decide this, which quietly broke the day-3/7/14/28
 * promise every time the daily task skipped a day: age jumped 2 -> 4, no milestone
 * matched, and that recheck was never retried. Nothing turned red, so the miss was
 * invisible. Comparing against the previous age fires each milestone exactly once
 * and survives any gap.
 */
function annotateCarryForward(candidate, latestDate, date) {
  const first = String(candidate.firstSeen ?? latestDate).slice(0, 10);
  const ageDays = Math.max(0, Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${first}T00:00:00Z`)) / 86_400_000));
  const previousAge = Number.isFinite(Number(candidate.carryForward?.ageDays)) ? Number(candidate.carryForward.ageDays) : -1;
  const crossed = RECHECK_MILESTONES.filter((day) => ageDays >= day && previousAge < day);
  return { ...candidate, firstSeen: candidate.firstSeen ?? latestDate, carryForward: { from: latestDate, ageDays, recheckDue: crossed.length > 0, recheckMilestones: crossed } };
}

// A candidate leaves an active/carry-forward pool only once the AI has recorded
// a terminal decision: 'develop' (moved into the build pipeline) or 'rejected'
// (explicit no-go). Everything else — research, watch, or no action yet — keeps
// circulating so it gets looked at again.
const TERMINAL_ACTIONS = new Set(['develop', 'rejected']);
const isTerminalAction = (action) => TERMINAL_ACTIONS.has(action);

function carryForward(latest, date) {
  if (!latest?.date || latest.date >= date) return [];
  // 机械规则：只有 AI 给出终态判决的候选离开续带池——develop（进入建站流程）
  // 或 rejected（已否决）；research、watch 与未判候选一律续带，不由脚本替 AI 淘汰。
  return arr(latest.candidates).filter((c) => !isTerminalAction(c.action)).map((c) => annotateCarryForward(c, latest.date, date));
}

/**
 * The plan stage has to age the previous report itself.
 *
 * It reads latest.json straight from disk, and on a candidate's first carry-over
 * day that file has no carryForward field yet — evaluate only stamps one while
 * carrying. Without ageing them here every stale candidate looked brand new to
 * selectDeepCheck and kept its deep-check slot regardless. Unlike carryForward()
 * this keeps every action, because the plan pool ranks them rather than filtering.
 */
function previousReportPool(latest, date) {
  if (!latest?.date || latest.date >= date) return arr(latest?.candidates);
  return arr(latest.candidates).map((c) => annotateCarryForward(c, latest.date, date));
}

// The report is intentionally capped, but the watch pool is the durable calendar
// for follow-up. Read it separately so a row cannot disappear from a due deep check
// merely because it fell below the report's display limit.
function watchPoolCandidates(o) {
  const pool = readJson(path.join(o.root, '.rankup/tasks/game-opportunity-watch-pool.json'));
  // Same terminal-action rule as carryForward(): a row a decision writer marked
  // 'develop' or 'rejected' stays in the file for its own record-keeping, but must
  // not keep resurfacing here — otherwise a rejected entity gets re-offered daily.
  return arr(pool?.active).filter((row) => !isTerminalAction(row.action)).map((row) => {
    const firstSeen = String(row.firstSeen ?? o.date).slice(0, 10);
    const ageDays = Math.max(0, Math.round((new Date(`${o.date}T00:00:00Z`) - new Date(`${firstSeen}T00:00:00Z`)) / 86_400_000));
    const due = Boolean(row.nextDeepCheck && String(row.nextDeepCheck).slice(0, 10) <= o.date);
    return {
      ...row,
      names: [row.name],
      urls: [row.url],
      sourceLinks: [row.url],
      reasons: row.reason ? [row.reason] : [],
      nextAction: row.nextDeepCheck ? `观察池下次深查 ${row.nextDeepCheck}` : undefined,
      carryForward: { from: 'watch-pool', ageDays, recheckDue: due, recheckMilestones: [] },
    };
  }).filter((row) => validUrl(row.url));
}

/**
 * 记录一条否决决定并让 watch-pool 立刻停止续带该实体：按 entityId 或名称
 * （大小写不敏感，规范化后精确匹配）在 watch-pool 的 active 列表里定位一行，
 * 写入 action:"rejected" 与 rejectedAt 时间戳。找不到匹配项时不改动文件。
 */
function reject(o) {
  const watchPoolFile = path.join(o.root, '.rankup/tasks/game-opportunity-watch-pool.json');
  if (!o.entityName) return { ok: false, error: '缺少要否决的实体名，用法：reject <entity-name>', file: watchPoolFile };
  const pool = readJson(watchPoolFile);
  if (!pool) return { ok: false, error: `watch-pool 文件不存在或无法读取：${watchPoolFile}`, file: watchPoolFile };
  const target = normalizeName(o.entityName);
  const active = arr(pool.active);
  const index = active.findIndex((row) => target && [row.entityId, row.name].some((v) => normalizeName(v) === target));
  if (index < 0) return { ok: false, error: `watch-pool 中未找到匹配 "${o.entityName}" 的实体`, file: watchPoolFile };
  const matched = active[index];
  if (o.dryRun) return { ok: true, dryRun: true, file: watchPoolFile, entity: matched.name ?? matched.entityId };
  const rejectedAt = new Date().toISOString();
  active[index] = { ...matched, action: 'rejected', rejectedAt };
  writeJson(watchPoolFile, { ...pool, active });
  return { ok: true, file: watchPoolFile, entity: matched.name ?? matched.entityId, action: 'rejected', rejectedAt };
}

async function checkUrl(url) {
  if (!validUrl(url)) return { url, ok: false, status: null, error: 'URL 格式无效' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal, headers: { 'User-Agent': 'Mozilla/5.0 GameOpportunityMonitor/1.0', Range: 'bytes=0-65535' } });
    const chunks = [];
    let size = 0;
    const reader = res.body?.getReader();
    while (reader && size < 65_536) {
      const { done, value } = await reader.read();
      if (done) break;
      const keep = value.subarray(0, 65_536 - size);
      chunks.push(keep); size += keep.length;
    }
    await reader?.cancel().catch(() => {});
    const html = Buffer.concat(chunks.map((v) => Buffer.from(v))).toString('utf8');
    const meta = pageMeta(html, res.url);
    // html 只在进程内传递，供 evaluate 把挑战页等异常现场落盘；写入 JSON 前会剥离。
    const result = { url, ok: res.ok, status: res.status, finalUrl: res.url, ...meta, html };
    return result;
  } catch (e) { return { url, ok: false, status: null, error: e.name === 'AbortError' ? 'timeout' : e.message }; }
  finally { clearTimeout(timer); }
}

/**
 * 只汇总关键词行的原始事实，不选边、不打分：
 * 每一行区分「实测」与「未查询」；聚合值只来自实测行，未查询行单独计数。
 * KD 不取最小值（挑较低数字下结论是被点名的病灶），全量列出交给 AI 读。
 */
function keywordFacts(c) {
  const keywords = arr(c.keywords);
  const measured = keywords.filter((k) => measuredStatus(k) && [k.semrushVolume, k.volume, k.localVolume, k.semrushGlobalVolume, k.globalVolume, k.semrushKd, k.webcafeKd, k.kd].some(numericMetric));
  const notQueried = keywords.length - measured.length;
  const volumes = measured.map((k) => k.semrushVolume ?? k.volume ?? k.localVolume).filter(numericMetric).map(Number);
  const globalVolumes = measured.map((k) => k.semrushGlobalVolume ?? k.globalVolume).filter(numericMetric).map(Number);
  const kdValues = uniq(measured.flatMap((k) => [k.semrushKd, k.webcafeKd, k.kd]).filter(nonempty).map(Number).filter(Number.isFinite));
  return {
    measuredRows: measured.length, notQueriedRows: notQueried,
    maxMeasuredVolume: volumes.length ? Math.max(...volumes) : null,
    maxGlobalVolume: globalVolumes.length ? Math.max(...globalVolumes) : null,
    kdValues,
  };
}

/**
 * 只规范化，不判决。action/decision/reasons/nextAction 是 AI 在 evaluation 文件里
 * 写下的判读，脚本原样透传；缺失时保持缺失（渲染层如实显示「未判」），
 * 绝不代填理由句或下一步。
 */
function finishCandidate(c) {
  const urls = uniq(arr(c.urls).filter(validUrl));
  const sourceLinks = uniq([...arr(c.sourceLinks), ...urls].filter(validUrl));
  const playLinks = uniq([...arr(c.playLinks), c.playUrl, c.embed?.url].filter(validUrl));
  const evidenceLinks = uniq([...arr(c.evidenceLinks), ...sourceLinks].filter(validUrl));
  const action = c.action ?? ({ 'quick-ship': 'develop', 'priority-research': 'research', watch: 'watch' }[c.decision]) ?? null;
  // Explicit AI action is authoritative; an older derived label cannot contradict it.
  const decision = ({ develop: 'quick-ship', research: 'priority-research', watch: 'watch' }[action]) ?? c.decision ?? null;
  const keywords = mergeKeywordRows(c.keywords, []);
  return { ...c, urls, sourceLinks, playLinks, evidenceLinks, action, decision, keywords, keywordMetrics: keywordFacts({ keywords }), trend: c.trend ?? {} };
}

function staleReason(c) {
  const checks = arr(c.urlChecks);
  if (!checks.length || !checks.every((v) => v.status === 404 || v.status === 410)) return null;
  const playLinks = arr(c.playLinks);
  const hasUsablePlay = checks.some((v) => playLinks.includes(v.url) && v.ok);
  const hasUnverifiedPlay = playLinks.some((url) => !checks.some((v) => v.url === url));
  return !hasUsablePlay && !hasUnverifiedPlay ? '所有已响应 URL 均明确返回 404/410，且没有可用游戏链接' : null;
}

/**
 * Where the judgement calls come from.
 *
 * buildDemandPlan has always read the dated evaluation file from this conventional
 * path, but evaluate honoured only an explicit --evaluation. `decision-checklist`
 * calls evaluate without one, so brand/category, SERP intent, trend direction and
 * platform-traffic risk were dropped on every unattended run and D03/D06/D07/D08
 * reported 0/6 no matter how carefully the file had been filled in.
 */
function evaluationOverlayPath(o, f) {
  return o.evaluation ?? (exists(f.evaluation) ? f.evaluation : null);
}

function overlayCandidates(current, overlay) {
  if (!overlay) return current;
  const rows = Array.isArray(overlay) ? overlay : arr(overlay.candidates);
  const out = [...current];
  for (const row of rows) {
    const normalized = inputCandidates({ candidates: [row] }, 'evaluation')[0] ?? row;
    const i = out.findIndex((v) => sameCandidate(v, normalized));
    if (i < 0) out.push(row); else out[i] = mergeMissing(row, out[i]);
  }
  return out;
}

const md = (v) => String(v ?? '').replace(/([|[\]])/g, '\\$1').replace(/\n/g, ' ');
const link = (label, url) => validUrl(url) ? `[${md(label)}](${url})` : md(label);
// 只排版事实：实测值带市场标注，未查询行单独计数；不做「待查/达标」之类的定性。
const metric = (c) => {
  const k = c.keywordMetrics ?? keywordFacts(c);
  const rows = arr(c.keywords).filter((row) => measuredStatus(row) && numericMetric(row.semrushVolume ?? row.volume ?? row.localVolume))
    .map((row) => ({ row, volume: Number(row.semrushVolume ?? row.volume ?? row.localVolume) }))
    .filter(({ volume }) => Number.isFinite(volume));
  const top = rows.sort((a, b) => b.volume - a.volume)[0];
  const discovery = new Set(arr(c.discoveryMarkets).map((market) => String(market).toUpperCase()));
  const discoveryTop = rows.filter(({ row }) => discovery.has(String(row.market ?? row.gl ?? '').toUpperCase())).sort((a, b) => b.volume - a.volume)[0];
  const parts = [];
  if (k.maxGlobalVolume !== null) parts.push(`全球 ${k.maxGlobalVolume.toLocaleString('en-US')}`);
  if (top) parts.push(`最高 ${String(top.row.market ?? top.row.gl).toUpperCase()} ${top.volume.toLocaleString('en-US')}`);
  if (discoveryTop && discoveryTop.row !== top?.row) parts.push(`发现市场 ${String(discoveryTop.row.market ?? discoveryTop.row.gl).toUpperCase()} ${discoveryTop.volume.toLocaleString('en-US')}`);
  if (k.kdValues.length) parts.push(`KD ${k.kdValues.join('/')}`);
  if (k.notQueriedRows > 0) parts.push(`未查询 ${k.notQueriedRows} 行`);
  if (c.keywordStrategy?.entityType) parts.push(`类型 ${c.keywordStrategy.entityType}`);
  if (c.trend?.direction) parts.push(`近 7 天 ${c.trend.direction}`);
  if (c.promotionRisk?.internalTrafficRisk) parts.push(`站内流量风险 ${c.promotionRisk.internalTrafficRisk}`);
  return parts.join('；') || '未测';
};

const playableCell = (c) => c.playable === true ? '是' : c.playable === false ? '否' : '未测';

function renderMarkdown(report) {
  const labels = { develop: '建议开发（AI 判）', research: '继续调研（AI 判）', watch: '继续观察（AI 判）', unjudged: '未判（等待 AI 判读）' };
  const groups = [...ACTIONS, 'unjudged'];
  const lines = [
    `# 小游戏机会日报 · ${report.date}`, '',
    `共 ${report.candidates.length} 个候选：建议开发 ${report.stats.develop} 个，继续调研 ${report.stats.research} 个，继续观察 ${report.stats.watch} 个，未判 ${report.stats.unjudged} 个。`, '',
    '本报告只排版采集到的事实与 AI 写入 evaluation 文件的判读；分组标签来自 AI，脚本不下结论。', '',
  ];
  for (const group of groups) {
    lines.push(`## ${labels[group]}`, '');
    const rows = report.candidates.filter((c) => (group === 'unjudged' ? !c.action : c.action === group));
    if (!rows.length) { lines.push('本组暂无候选。', ''); continue; }
    lines.push('| 候选 | 来源 | 市场 / 搜索量 / KD | 可玩 | 下一步 |', '|---|---|---|---|---|');
    for (const c of rows) {
      const name = arr(c.names)[0] ?? c.name ?? '未命名游戏';
      const primary = arr(c.playLinks)[0] ?? arr(c.urls)[0] ?? arr(c.sourceLinks)[0];
      const sources = uniq([...arr(c.sourceLinks), ...arr(c.evidenceLinks), ...arr(c.urls)]).slice(0, 4);
      const sourceMd = sources.length ? sources.map((url, i) => link(`来源${i + 1}`, url)).join(' · ') : '无链接';
      const markets = arr(c.markets).join('/') || arr(c.keywords).map((k) => k.market).filter(Boolean).join('/') || '未记录';
      lines.push(`| ${link(name, primary)} | ${sourceMd} | ${md(markets)}；${metric(c)} | ${playableCell(c)} | ${md(c.nextAction ?? '—')} |`);
    }
    lines.push('');
  }
  const challenged = report.candidates.filter((c) => arr(c.urlChecks).some((v) => v.challenge));
  if (challenged.length) {
    lines.push('## 采集受阻（挑战页，原始 HTML 已留证）', '',
      ...challenged.map((c) => `- ${md(arr(c.names)[0] ?? '未命名游戏')}：${arr(c.urlChecks).filter((v) => v.challenge).map((v) => `\`${v.evidenceFile}\``).join('、')}`), '');
  }
  if (report.errors.length) lines.push('## 本次异常', '', ...report.errors.map((e) => `- ${md(e)}`), '');
  lines.push(`机器可读清单：\`${report.date}-candidates.json\`。`);
  return `${lines.join('\n')}\n`;
}

function saveReport(o, candidates, errors = [], excluded = []) {
  const f = files(o);
  const done = mergeCandidates(candidates).map(finishCandidate);
  const stats = {
    ...Object.fromEntries(ACTIONS.map((a) => [a, done.filter((c) => c.action === a).length])),
    unjudged: done.filter((c) => !c.action).length,
  };
  const report = {
    date: o.date, generatedAt: new Date().toISOString(), errors: uniq(errors.filter(Boolean)),
    stats,
    candidates: done, excluded: excluded.map(finishCandidate),
  };
  writeJson(f.candidates, report);
  const markdown = renderMarkdown(report);
  writeText(f.report, markdown);
  fs.copyFileSync(f.candidates, f.latestJson);
  fs.copyFileSync(f.report, f.latestMd);
  return { report, files: f };
}

const SOCIAL_PLATFORMS = new Set(['reddit', 'youtube', 'x']);
const cleanKeyword = (value) => String(value ?? '')
  .replace(/\s+(?:demo|play online|online game)$/i, '')
  .replace(/^save\s+\d+%\s+on\s+.+?\s+on steam$/i, '')
  .replace(/\s+/g, ' ').trim();
const usefulKeyword = (value) => {
  const v = cleanKeyword(value);
  return v.length >= 2 && v.length <= 80
    && !/^just a moment/i.test(v)
    && !/^reddit$/i.test(v)
    && !/^https?:/i.test(v)
    && !/\b(?:launch date trailer|looking for|need advice|until a new game comes out)\b/i.test(v);
};
const latinKeyword = (value) => /[a-z]/i.test(value) && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(value);
const marketDbs = (candidate) => uniq([
  ...arr(candidate.markets),
  ...arr(candidate.keywords).flatMap((k) => [k.gl, k.market]),
]).flatMap((value) => String(value).toLowerCase().split(/[^a-z]+/)).filter((v) => /^[a-z]{2}$/.test(v));

function demandKeywords(candidate) {
  const existing = arr(candidate.keywords).map((k) => cleanKeyword(k.keyword)).filter(usefulKeyword);
  // 已核定的查询词优先；URL slug 和消歧实体名不能自动占用配额。
  const names = existing.length ? existing : [...arr(candidate.names), candidate.name].map(cleanKeyword).filter(usefulKeyword);
  const seen = new Set();
  return names.filter((keyword) => {
    const key = normalizeName(keyword);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 3);
}

function demandCandidate(candidate) {
  if (candidate.pageType === 'game-adjacent') return false;
  if (arr(candidate.platforms).some((p) => SOCIAL_PLATFORMS.has(String(p).toLowerCase()))) return false;
  return demandKeywords(candidate).length > 0 && arr(candidate.urls).some(validUrl);
}

/**
 * 深查名额仍然只有 6 个（Semrush 配额），但「谁值得占名额」是判断，不归脚本。
 *
 * - AI 判读后写 `YYYY-MM-DD-demand-selection.json`（entityId 数组）即为名单，
 *   脚本按其顺序取用；
 * - 没有名单时用**机械默认顺序**（不含价值判断）：到期复查的续带候选先占位
 *   （复查是日历承诺，续带候选非复查日不占位——2026-08-27 实测续带常驻会让
 *   224 个新发现只剩 1 个名额），其余按当天新发现、再其余的输入顺序补位。
 * - 完整候选池连同选中与否一起写进 plan，AI 能看到被跳过的是谁并随时改名单。
 */
function selectDeepCheck(pool, selection, cap) {
  if (Array.isArray(selection) && selection.length) {
    const ids = selection.map((id) => normalizeName(id));
    const chosen = ids
      .map((id) => pool.find((c) => normalizeName(c.entityId) === id))
      .filter(Boolean);
    return { chosen: chosen.slice(0, cap), rule: 'ai-selection-file' };
  }
  const bucket = (c) => (c.carryForward?.recheckDue ? 0 : arr(c.origin).includes('new-games') ? 1 : c.carryForward ? 3 : 2);
  const chosen = pool.map((candidate, index) => ({ candidate, index, bucket: bucket(candidate) }))
    .sort((a, b) => a.bucket - b.bucket || a.index - b.index)
    .slice(0, cap)
    .map((row) => row.candidate);
  return { chosen, rule: 'mechanical-recheck-then-new' };
}

function buildDemandPlan(o) {
  const f = files(o);
  const newGames = readJson(f.newGames);
  const latest = readJson(f.latestJson);
  const evaluation = readJson(f.evaluation);
  const fullPool = mergeCandidates([
    ...inputCandidates({ candidates: arr(evaluation?.candidates) }, 'verified-evaluation'),
    ...inputCandidates({ candidates: previousReportPool(latest, o.date) }, 'previous-report'),
    ...inputCandidates({ candidates: watchPoolCandidates(o) }, 'watch-pool'),
    ...inputCandidates({ candidates: arr(newGames?.games) }, 'new-games'),
  ]).filter(demandCandidate);
  const selectionInput = readJson(f.demandSelection);
  const selection = Array.isArray(selectionInput) ? selectionInput : arr(selectionInput?.entityIds);
  const { chosen: pool, rule: selectionRule } = selectDeepCheck(fullPool, selection, Math.min(o.limit, 6));
  const candidates = pool.map((candidate) => {
    const keywords = demandKeywords(candidate);
    return {
      entityId: candidate.entityId,
      names: candidate.names,
      urls: candidate.urls,
      sourceLinks: candidate.sourceLinks,
      evidenceLinks: candidate.evidenceLinks,
      playLinks: candidate.playLinks,
      platforms: candidate.platforms,
      languages: candidate.languages,
      markets: candidate.markets,
      playable: candidate.playable,
      reachable: candidate.reachable,
      action: candidate.action,
      decision: candidate.decision,
      nextAction: candidate.nextAction,
      discoveryMarkets: candidate.markets,
      keywords,
      latinKeywords: keywords.filter(latinKeyword),
      mandatoryCountryDbs: uniq(marketDbs(candidate)),
    };
  });
  const globalKeywords = uniq(candidates.flatMap((candidate) => candidate.keywords));
  const planData = {
    date: o.date,
    generatedAt: new Date().toISOString(),
    rule: '先查每个原名、英文名和已有本地名的 globalVolume/byCountry，再查主要国家、发现市场和英语大市场。',
    selectionRule,
    selectionFile: f.demandSelection,
    sourceFiles: { verifiedEvaluation: f.evaluation, newGames: f.newGames, previousReport: f.latestJson, watchPool: path.join(o.root, '.rankup/tasks/game-opportunity-watch-pool.json') },
    // 完整候选池：AI 据此判断该换谁进深查名单（写 selectionFile 即生效）。
    pool: fullPool.map((c) => ({
      entityId: c.entityId, name: arr(c.names)[0] ?? null, origin: c.origin,
      recheckDue: c.carryForward?.recheckDue ?? false,
      selected: pool.some((p) => p.entityId === c.entityId),
    })),
    candidates,
    globalKeywords,
  };
  if (!o.dryRun) {
    writeJson(f.demandPlan, planData);
    writeText(f.globalKeywords, globalKeywords.join('\n'));
  }
  return { ok: true, plan: planData, files: { plan: f.demandPlan, keywords: f.globalKeywords } };
}

function readJsonLines(file) {
  if (!exists(file)) return [];
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

function demandOverlay(o, planData, globalRows, countryRows) {
  const f = files(o);
  const globalByKeyword = new Map(globalRows.map((row) => [normalizeName(row.keyword), row]));
  const localByKey = new Map(countryRows.map((row) => [`${normalizeName(row.keyword)}:${row.db}`, row]));
  const candidates = planData.candidates.map((candidate) => ({
    entityId: candidate.entityId,
    names: candidate.names,
    urls: candidate.urls,
    sourceLinks: candidate.sourceLinks,
    evidenceLinks: candidate.evidenceLinks,
    playLinks: candidate.playLinks,
    platforms: candidate.platforms,
    languages: candidate.languages,
    markets: candidate.markets,
    playable: candidate.playable,
    reachable: candidate.reachable,
    action: candidate.action,
    decision: candidate.decision,
    nextAction: candidate.nextAction,
    discoveryMarkets: candidate.discoveryMarkets,
    demandCoverage: {
      globalAttempted: candidate.keywords.some((word) => globalByKeyword.has(normalizeName(word))),
      globalChecked: candidate.keywords.every((word) => providerResultReady(globalByKeyword.get(normalizeName(word)), 'global', o.root)),
      keywordsChecked: candidate.keywords.filter((word) => providerResultReady(globalByKeyword.get(normalizeName(word)), 'global', o.root)),
      countriesChecked: uniq(countryRows.filter((row) => providerResultReady(row, 'country', o.root) && candidate.keywords.some((kw) => normalizeName(kw) === normalizeName(row.keyword))).map((row) => row.db.toUpperCase())),
    },
    keywords: candidate.keywords.flatMap((keyword) => {
      const global = globalByKeyword.get(normalizeName(keyword)) ?? {};
      const dbs = uniq([
        ...candidate.mandatoryCountryDbs,
        'us',
        ...Object.entries(global.byCountry ?? {}).filter(([, volume]) => Number(volume) > 0).map(([db]) => db.toLowerCase()),
      ]);
      return dbs.map((db) => {
        // 「未查询」与「测得为零」必须字节级可分辨：没有对应结果行的市场是
        // status:'not-queried' 且所有数值为 null——绝不默认成 0 或 noData:true。
        const local = localByKey.get(`${normalizeName(keyword)}:${db}`) ?? (db === 'us' && globalByKeyword.has(normalizeName(keyword)) ? global : null);
        const queried = local !== null;
        return {
          keyword, market: db.toUpperCase(), gl: db,
          semrushVolume: queried ? (local.volume ?? null) : null,
          semrushGlobalVolume: global.globalVolume ?? null,
          semrushByCountry: global.byCountry ?? null,
          semrushKd: queried ? (local.kd ?? null) : null,
          cpc: queried ? (local.cpc ?? null) : null,
          competition: queried ? (local.competition ?? null) : null,
          intent: queried ? (local.intent ?? global.intent ?? null) : null,
          status: queried ? (local.status ?? (local.volume != null ? 'measured' : 'measured-empty')) : 'not-queried',
          queryTime: o.date,
          rawResultFiles: [f.globalSemrush, f.countrySemrush],
        };
      });
    }),
  }));
  return { date: o.date, generatedAt: new Date().toISOString(), candidates };
}

async function plan(o) {
  return buildDemandPlan(o);
}

async function demand(o) {
  const f = files(o);
  const semrushNodeArgs = o.semrushNode ? ['--node', o.semrushNode] : [];
  const planned = buildDemandPlan(o);
  if (!planned.plan.globalKeywords.length) return { ok: false, error: '没有可查询的真实游戏关键词' };
  if (o.dryRun) return { ok: true, dryRun: true, plan: planned.plan, outputs: [f.globalSemrush, f.demandResults] };
  let globalRows = readJsonLines(f.globalSemrush);
  const globalKeys = new Set(globalRows.filter((row) => providerResultReady(row, 'global', o.root)).map((row) => normalizeName(row.keyword)));
  const canReuseGlobal = planned.plan.globalKeywords.every((keyword) => globalKeys.has(normalizeName(keyword)));
  if (!canReuseGlobal) {
    const globalRun = await runNode(SEMRUSH_KEYWORD, ['--kw-file', f.globalKeywords, '--db', 'us', '--no-follow-top-country', ...semrushNodeArgs, '--out', f.globalSemrush], o.root);
    if (!globalRun.ok) return { ok: false, stage: 'global', error: globalRun.error, stderr: globalRun.stderr, plan: planned.plan };
    globalRows = readJsonLines(f.globalSemrush);
  }
  const countryKeywords = new Map();
  for (const candidate of planned.plan.candidates) {
    for (const keyword of candidate.keywords) {
      const global = globalRows.find((row) => normalizeName(row.keyword) === normalizeName(keyword));
      const dbs = uniq([
        ...candidate.mandatoryCountryDbs,
        ...Object.entries(global?.byCountry ?? {}).filter(([, volume]) => Number(volume) > 0).map(([db]) => db.toLowerCase()),
      ]).slice(0, 8);
      for (const db of dbs) {
        if (db === 'us') continue;
        if (!countryKeywords.has(db)) countryKeywords.set(db, new Set());
        countryKeywords.get(db).add(keyword);
      }
    }
  }
  const countryRows = globalRows.map((row) => ({ ...row, db: 'us' }));
  const countryPlan = Object.fromEntries([...countryKeywords].map(([db, words]) => [db, [...words]]));
  const cachedCountryRows = readJsonLines(f.countrySemrush);
  const cachedCountryKeys = new Set(cachedCountryRows.filter((row) => providerResultReady(row, 'country', o.root)).map((row) => `${row.db}:${normalizeName(row.keyword)}`));
  const canReuseCountries = Object.entries(countryPlan).every(([db, words]) => words.every((word) => cachedCountryKeys.has(`${db}:${normalizeName(word)}`)));
  let countries = { ok: true, count: 0, reused: canReuseCountries, plan: f.countryPlan, output: f.countrySemrush };
  if (Object.keys(countryPlan).length) {
    writeJson(f.countryPlan, countryPlan);
    if (canReuseCountries) {
      countryRows.push(...cachedCountryRows);
      countries.count = cachedCountryRows.length;
    } else {
      fs.rmSync(f.countrySemrush, { force: true });
      const run = await runNode(SEMRUSH_KEYWORD, ['--ui-plan', f.countryPlan, ...semrushNodeArgs, '--out', f.countrySemrush], o.root);
      const rows = readJsonLines(f.countrySemrush);
      countries = { ...countries, ok: run.ok, error: run.ok ? null : run.error, count: rows.length };
      countryRows.push(...rows);
    }
  }
  const overlay = demandOverlay(o, planned.plan, globalRows, countryRows);
  writeJson(f.demandResults, overlay);
  return { ok: countries.ok && overlay.candidates.every((row) => row.demandCoverage.globalChecked && row.keywords.every((keyword) => countryRows.some((raw) => normalizeName(raw.keyword) === normalizeName(keyword.keyword) && String(raw.db).toLowerCase() === keyword.gl && providerResultReady(raw, 'country', o.root)))), plan: planned.plan, global: { file: f.globalSemrush, count: globalRows.length, reused: canReuseGlobal }, countries, results: f.demandResults };
}

async function evaluate(o, inheritedErrors = []) {
  const f = files(o);
  // A dry run that hides an input it will actually read is worse than no dry run.
  if (o.dryRun) return { ok: true, dryRun: true, inputs: [f.discovery, f.radar, evaluationOverlayPath(o, f)].filter(Boolean), outputs: [f.candidates, f.report, f.latestJson, f.latestMd] };
  const discovery = readJson(f.discovery);
  const radarData = readJson(f.radar);
  const old = readJson(f.candidates);
  const latest = readJson(f.latestJson);
  const errors = [...inheritedErrors];
  const fatalErrors = [...inheritedErrors];
  if (!discovery) { const e = `缺少 ${path.basename(f.discovery)}`; errors.push(e); fatalErrors.push(e); }
  if (!radarData) { const e = `缺少 ${path.basename(f.radar)}`; errors.push(e); fatalErrors.push(e); }
  const health = discoveryHealth(discovery);
  errors.push(...arr(discovery?.warnings), ...health.warnings, ...(health.usable > 0 ? [] : arr(discovery?.errors)), ...arr(radarData?.errors));
  if (discovery && health.usable === 0) fatalErrors.push(...arr(discovery.errors), ...health.warnings, 'discovery 没有可用平台结果');
  fatalErrors.push(...arr(radarData?.coreErrors));
  const newGames = readJson(f.newGames);
  const todayRows = (newGames?.games?.length
    ? mergeCandidates(inputCandidates({ candidates: newGames.games }, 'new-games'))
    : mergeCandidates([...inputCandidates(discovery, 'discovery'), ...inputCandidates(radarData, 'radar')]))
    .filter((candidate) => candidate.pageType !== 'game-adjacent' && !arr(candidate.platforms).some((p) => SOCIAL_PLATFORMS.has(String(p).toLowerCase())));
  let candidates = [...todayRows];
  if (old?.candidates?.length) candidates = mergeRichIntoOrdered(candidates, old.candidates.filter((row) => todayRows.some((today) => sameCandidate(today, row))));
  candidates = mergeRichIntoOrdered(candidates, mergeCandidates([
    ...carryForward(latest, o.date),
    ...watchPoolCandidates(o),
  ]));
  const automaticDemand = readJson(f.demandResults);
  if (automaticDemand) candidates = overlayCandidates(candidates, automaticDemand);
  // The dated evaluation file is where the judgement calls live — brand vs category,
  // SERP intent, weak positions, the 7-day direction. buildDemandPlan already reads
  // it from this conventional path; evaluate only honoured an explicit --evaluation,
  // so `decision-checklist` never picked it up and D03/D06/D07/D08 always reported
  // 0/6. Default to the same file both stages already agree on.
  const overlayPath = evaluationOverlayPath(o, f);
  if (overlayPath) {
    const overlay = readJson(overlayPath);
    if (!overlay) errors.push(`无法读取 evaluation ${overlayPath}`);
    else candidates = overlayCandidates(candidates, overlay);
  }
  candidates = rankCandidates(candidates, todayRows).slice(0, o.limit);
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i] = finishCandidate(candidates[i]);
    const checks = [];
    const primary = arr(c.urls)[0] ?? arr(c.sourceLinks)[0] ?? arr(c.playLinks)[0];
    if (primary) checks.push(await checkUrl(primary));
    const first = checks[0];
    if (first?.title && (errorPageTitle(first.title) || challengePageTitle(first.title))) c.names = arr(c.names).filter((name) => normalizeName(name) !== normalizeName(first.title));
    if (first?.title && !errorPageTitle(first.title) && !challengePageTitle(first.title) && (noisyName(c) || normalizeName(arr(c.names)[0]) === normalizeName(first.title))) {
      const title = cleanPageTitle(first.title);
      if (title) c.names = uniq([title, ...arr(c.names).filter((name) => normalizeName(name) !== normalizeName(first.title))]);
    }
    if (first?.iframeUrl && playableEmbed(first.iframeUrl)) c.playLinks = uniq([first.iframeUrl, ...arr(c.playLinks)]);
    const remaining = uniq([...arr(c.playLinks), ...arr(c.urls)]).filter((url) => url !== primary).slice(0, 3 - checks.length);
    for (const url of remaining) checks.push(await checkUrl(url));
    // 挑战页留现场：原始 HTML 落 evidence 目录并在 check 上标记，候选不被剔除。
    for (const check of checks) {
      if (challengePageTitle(check.title)) {
        check.challenge = true;
        try {
          fs.mkdirSync(f.evidenceDir, { recursive: true });
          const slug = (normalizeUrl(check.url) || 'page').replace(/[^a-z0-9]+/g, '-').slice(0, 80);
          check.evidenceFile = path.join(f.evidenceDir, `challenge-${slug}.html`);
          fs.writeFileSync(check.evidenceFile, check.html ?? '');
        } catch (e) { errors.push(`挑战页现场保存失败 ${check.url}: ${e.message}`); }
      }
      delete check.html; // 原始 HTML 只留 evidence 文件，不进 candidates.json
    }
    c.urlChecks = checks;
    // 被挑战页挡住的检查是「未测」，不是「不可达/不可玩」。
    const usableChecks = checks.filter((v) => !v.challenge);
    if (c.reachable !== true && usableChecks.length) c.reachable = usableChecks.some((v) => v.ok);
    if (arr(c.playLinks).length && c.playable !== true) {
      const playChecks = usableChecks.filter((v) => arr(c.playLinks).includes(v.url));
      if (playChecks.length) c.playable = playChecks.some((v) => v.ok);
    }
  }
  const excluded = [];
  candidates = candidates.filter((c) => {
    const reason = staleReason(c);
    if (!reason) return true;
    excluded.push({ ...c, pageType: 'stale-url', excludedReason: reason, excludedLinks: uniq([...arr(c.urls), ...arr(c.playLinks)]) });
    return false;
  });
  const saved = saveReport(o, candidates, errors, excluded);
  return { ok: !uniq(fatalErrors.filter(Boolean)).length, ...saved };
}

function render(o) {
  const f = files(o);
  if (o.dryRun) return { ok: true, dryRun: true, input: o.evaluation ?? f.candidates, outputs: [f.report, f.latestJson, f.latestMd] };
  const current = readJson(f.candidates);
  const supplied = o.evaluation ? readJson(o.evaluation) : null;
  if (!current && !supplied) throw new Error(`没有可渲染的候选：${f.candidates}`);
  let candidates = arr(current?.candidates);
  if (supplied) candidates = overlayCandidates(candidates, supplied);
  return { ok: true, ...saveReport(o, candidates, arr(current?.errors), arr(current?.excluded)) };
}

function saveNewGames(o, discovery, radar) {
  const f = files(o);
  const discoveryRows = mergeCandidates(inputCandidates(discovery, 'discovery'));
  const radarTitles = arr(radar?.candidates).filter((row) => !row.campaignId);
  const radarRows = mergeCandidates(inputCandidates({ candidates: radarTitles }, 'radar'));
  const games = mergeCandidates([...radarRows, ...discoveryRows])
    .filter((candidate) => candidate.pageType !== 'game-adjacent')
    .map(finishCandidate);
  const discoveryUrls = uniq(arr(discovery?.candidates).map((row) => row.url).filter(validUrl)).length;
  const report = {
    date: o.date,
    generatedAt: new Date().toISOString(),
    sourceFiles: { discovery: f.discovery, radar: f.radar },
    stats: {
      discoveryUrls,
      radarTitleRecords: radarTitles.length,
      ignoredCampaigns: arr(radar?.candidates).filter((row) => row.campaignId).length,
      dedupedGames: games.length,
      duplicatesRemoved: discoveryUrls + radarTitles.length - games.length,
    },
    errors: uniq([...arr(discovery?.errors), ...arr(discovery?.warnings), ...arr(radar?.errors)]),
    games,
  };
  writeJson(f.newGames, report);
  fs.copyFileSync(f.newGames, f.latestNewGames);
  return { file: f.newGames, latestFile: f.latestNewGames, count: games.length, stats: report.stats };
}

function dedupe(o) {
  const f = files(o);
  if (o.dryRun) return { ok: true, dryRun: true, inputs: [f.discovery, f.radar], outputs: [f.newGames, f.latestNewGames] };
  const discovery = readJson(f.discovery);
  const radarData = readJson(f.radar);
  const missing = [!discovery && path.basename(f.discovery), !radarData && path.basename(f.radar)].filter(Boolean);
  if (missing.length) return { ok: false, error: `缺少 ${missing.join('、')}` };
  return { ok: true, ...saveNewGames(o, discovery, radarData) };
}

async function collect(o) {
  if (o.dryRun) return { ok: true, dryRun: true, stages: [await discover(o), await radar(o)], newGames: { file: files(o).newGames } };
  const stages = [];
  const d = await discover(o); stages.push({ stage: 'discover', ok: d.ok, error: d.error, file: d.file });
  const r = await radar(o); stages.push({ stage: 'radar', ok: r.ok, errors: r.errors, file: r.file });
  const merged = saveNewGames(o, readJson(files(o).discovery), readJson(files(o).radar));
  return { ok: stages.every((s) => s.ok), stages, newGames: merged };
}

async function daily(o) {
  if (o.dryRun) return { ok: true, dryRun: true, collect: await collect(o), demand: await demand(o), evaluate: await evaluate(o) };
  const gathered = await collect(o);
  const errors = gathered.stages.flatMap((s) => s.ok ? [] : [s.error, ...arr(s.errors)].filter(Boolean).map((e) => `${s.stage}: ${e}`));
  const demandResult = await demand(o);
  if (!demandResult.ok) errors.push(`demand: ${demandResult.error ?? demandResult.stage ?? '查询失败'}`);
  const result = await evaluate(o, errors);
  return { ok: gathered.ok && demandResult.ok && result.ok, collect: gathered, demand: demandResult, evaluate: result };
}

const checkItem = (id, text, passed, evidence) => ({ id, text, passed: Boolean(passed), evidence: String(evidence ?? '') });
const dated = (data, date) => data?.date ? data.date === date
  : Boolean(data?.generatedAt) && new Date(data.generatedAt).toLocaleDateString('en-CA') === date;

function saveChecklist(o, kind, checks, summary = {}) {
  const f = files(o);
  const isCollect = kind === 'collect';
  const file = isCollect ? f.collectChecklist : f.decisionChecklist;
  const markdownFile = isCollect ? f.collectChecklistMd : f.decisionChecklistMd;
  const latestFile = isCollect ? f.latestCollectChecklist : f.latestDecisionChecklist;
  const latestMarkdown = isCollect ? f.latestCollectChecklistMd : f.latestDecisionChecklistMd;
  const result = { date: o.date, generatedAt: new Date().toISOString(), kind, ok: checks.every((item) => item.passed), checks, summary };
  const title = isCollect ? '小游戏每日采集 Checklist' : '小游戏每日决策 Checklist';
  const markdown = [`# ${title} · ${o.date}`, '', `状态：${result.ok ? '全部通过' : '未通过'}`, '', ...checks.flatMap((item) => [`- [${item.passed ? 'x' : ' '}] ${item.id} ${item.text}`, `  - ${item.evidence}`]), ''].join('\n');
  writeJson(file, result); writeText(markdownFile, markdown);
  fs.copyFileSync(file, latestFile); fs.copyFileSync(markdownFile, latestMarkdown);
  return { ...result, file, markdownFile, latestFile, latestMarkdown };
}

function inspectCollect(o) {
  const f = files(o);
  const discovery = readJson(f.discovery);
  const radarData = readJson(f.radar);
  const newGames = readJson(f.newGames);
  const config = readJson(discovery?.config ?? path.join(o.root, '.rankup/demand/game-platforms.json'));
  const platforms = arr(discovery?.platforms);
  const radarSources = arr(radarData?.sources);
  const games = arr(newGames?.games);
  const failedPlatforms = platforms.filter((row) => row.status === 'failed');
  const failedRadar = radarSources.filter((row) => row.status === 'failed');
  const gameKeys = games.map((game) => normalizeName(arr(game.names)[0] ?? game.name) || normalizeUrl(arr(game.urls)[0]));
  const expectedRadar = o.noSocial ? 3 : 6;
  const ignored = fs.readFileSync(path.join(o.root, '.gitignore'), 'utf8').split(/\r?\n/).some((line) => line.trim() === '.rankup/');
  const checks = [
    checkItem('C01', '平台配置已读取且本次覆盖全部配置平台。', arr(config?.platforms).length > 0 && Number(discovery?.selectedPlatforms) === arr(config?.platforms).length, `${discovery?.selectedPlatforms ?? 0}/${arr(config?.platforms).length} 个平台`),
    checkItem('C02', '每个平台都有 compared、baseline 或 failed 的明确结果。', platforms.length === Number(discovery?.selectedPlatforms) && platforms.every((row) => ['compared', 'baseline_created', 'failed'].includes(row.status)), `${platforms.length} 条平台结果`),
    checkItem('C03', '全部 sitemap 抓取成功且没有平台失败。', failedPlatforms.length === 0, failedPlatforms.length ? failedPlatforms.map((row) => row.id).join('、') : '0 个失败'),
    checkItem('C04', '每个平台都分别记录 added、changed 和 removed。', platforms.filter((row) => row.status !== 'failed').every((row) => ['added', 'changed', 'removed'].every((key) => Array.isArray(row[key]))), '三类 diff 字段已核对'),
    checkItem('C05', 'Steam、itch、Poki 与启用的社区雷达全部执行成功。', radarSources.length >= expectedRadar && failedRadar.length === 0, `${radarSources.length} 个来源，失败 ${failedRadar.length}`),
    checkItem('C06', '当天重跑会累积早先增量，且 discovery、radar 与 new-games 均属于当天。', [discovery, radarData, newGames].every((data) => dated(data, o.date)) && [discovery, radarData].every((data) => Number(data?.runCount ?? 1) === 1 || data?.sameDayMerged === true), `${o.date}；discovery ${discovery?.runCount ?? 1} 次，radar ${radarData?.runCount ?? 1} 次`),
    checkItem('C07', 'discovery 与 radar 已合并且统计数量和实体数量一致。', Number(newGames?.stats?.dedupedGames) === games.length && Number(newGames?.stats?.duplicatesRemoved) >= 0, `${games.length} 个去重游戏`),
    checkItem('C08', '社交 campaign 与非游戏记录没有混入新增游戏。', games.every((game) => !game.campaignId && game.pageType !== 'game-adjacent'), `${newGames?.stats?.ignoredCampaigns ?? 0} 个 campaign 已隔离`),
    checkItem('C09', '新增游戏按名称、URL 与多语言页面归并且没有重复实体。', gameKeys.every(Boolean) && games.every((game, i) => !games.slice(i + 1).some((other) => sameCandidate(game, other))), `${games.length} 个唯一实体`),
    checkItem('C10', '采集产物、名称、来源链接和 Git 忽略边界全部完整。', [f.discovery, f.radar, f.newGames, f.latestNewGames].every(exists) && games.every((game) => arr(game.names).length && [...arr(game.sourceLinks), ...arr(game.urls)].some(validUrl)) && ignored, '4 个产物与 .rankup/ 忽略规则已核对'),
  ];
  return saveChecklist(o, 'collect', checks, { platforms: platforms.length, games: games.length, failedPlatforms: failedPlatforms.map((row) => row.id), failedRadar: failedRadar.map((row) => row.source) });
}

async function collectChecklist(o) {
  if (!o.checkOnly) await collect(o);
  return inspectCollect(o);
}

function inspectDecision(o) {
  const f = files(o);
  const collectResult = readJson(f.collectChecklist);
  const planData = readJson(f.demandPlan);
  const globalRows = readJsonLines(f.globalSemrush);
  const countryPlan = readJson(f.countryPlan, {});
  const countryRows = readJsonLines(f.countrySemrush);
  const demandData = readJson(f.demandResults);
  const report = readJson(f.candidates);
  const latest = readJson(f.latestJson);
  const markdown = exists(f.report) ? fs.readFileSync(f.report, 'utf8') : '';
  const globalKeys = new Set(globalRows.filter((row) => providerResultReady(row, 'global', o.root)).map((row) => normalizeName(row.keyword)));
  const localResults = [...globalRows.map((row) => ({ ...row, db: 'us' })), ...countryRows];
  const countryKeys = new Set(localResults.filter((row) => providerResultReady(row, 'country', o.root)).map((row) => `${String(row.db).toLowerCase()}:${normalizeName(row.keyword)}`));
  const priority = arr(planData?.candidates);
  const finalPriority = priority.map((candidate) => arr(report?.candidates).find((row) => row.entityId === candidate.entityId || sameCandidate(row, candidate))).filter(Boolean);
  const requiredCountryKeys = (candidate) => arr(candidate.keywords).flatMap((word) => {
    const global = globalRows.find((row) => normalizeName(row.keyword) === normalizeName(word));
    return uniq(['us', ...arr(candidate.mandatoryCountryDbs), ...Object.entries(global?.byCountry ?? {}).filter(([, volume]) => numericMetric(volume) && Number(volume) > 0).map(([db]) => db.toLowerCase())])
      .map((db) => `${db}:${normalizeName(word)}`);
  });
  const plannedCountryRows = uniq([...Object.entries(countryPlan).flatMap(([db, words]) => arr(words).map((word) => `${db}:${normalizeName(word)}`)), ...priority.flatMap(requiredCountryKeys)]);
  const coverageReady = (candidate) => arr(candidate.keywords).length > 0
    && candidate.keywords.every((word) => globalKeys.has(normalizeName(word)))
    && requiredCountryKeys(candidate).every((key) => countryKeys.has(key));
  const coverageRecorded = (candidate) => {
    const coverage = arr(demandData?.candidates).find((row) => sameCandidate(candidate, row))?.demandCoverage;
    return coverageReady(candidate) && coverage?.globalChecked === true
      && candidate.keywords.every((word) => arr(coverage.keywordsChecked).some((checked) => normalizeName(checked) === normalizeName(word)))
      && requiredCountryKeys(candidate).every((key) => arr(coverage.countriesChecked).some((db) => String(db).toLowerCase() === key.split(':')[0]));
  };
  const stats = report?.stats ?? {};
  const statsMatch = ACTIONS.every((action) => Number(stats[action] ?? 0) === arr(report?.candidates).filter((row) => row.action === action).length)
    && Number(stats.unjudged ?? 0) === arr(report?.candidates).filter((row) => !row.action).length;
  const latestMatch = JSON.stringify(latest?.stats) === JSON.stringify(report?.stats) && arr(latest?.candidates).map((row) => row.entityId).join('|') === arr(report?.candidates).map((row) => row.entityId).join('|');
  const strategyReady = (row) => {
    const strategy = row.keywordStrategy ?? {};
    const clusters = arr(strategy.clusters);
    const terms = uniq(clusters.flatMap((cluster) => arr(cluster.terms)).map(normalizeName).filter(Boolean));
    return ['brand', 'category', 'generic'].includes(strategy.entityType)
      && clusters.length > 0
      && clusters.every((cluster) => cluster.intent && arr(cluster.terms).length)
      && (strategy.entityType === 'brand' || terms.length >= 2);
  };
  const competitionState = (row) => {
    const review = row.competitionReview ?? {};
    const candidate = priority.find((candidate) => sameCandidate(row, candidate));
    const checked = candidate && coverageReady(candidate);
    const noObservedVolume = checked && candidate.keywords.every((word) => globalRows.some((raw) => normalizeName(raw.keyword) === normalizeName(word)
      && providerResultReady(raw, 'global', o.root) && (raw.globalVolume === 0 || ['verified-empty', 'absent-confirmed'].includes(raw.status))));
    if (review.status === 'not-applicable') return noObservedVolume && nonempty(review.reason) ? 'not-applicable' : 'missing';
    return checked && ['reviewed', 'collected'].includes(review.status) && evidencePresent(review.evidenceFile, o.root)
      && nonempty(review.serpIntent) && Array.isArray(review.weakPositions)
      && typeof review.newSitePresent === 'boolean' && nonempty(review.kdInterpretation)
      && ['consistent', 'reviewed', 'not-applicable'].includes(review.metricConflict) ? 'reviewed' : 'missing';
  };
  const trendReady = (row) => {
    const windows = row.trend?.windows ?? {};
    const windowReady = (window, days) => {
      if (!window || !['ok', 'collected', 'measured', 'insufficient'].includes(window.status) || window.error || !evidencePresent(window.file, o.root)) return false;
      const end = Date.parse(window.end), start = Date.parse(window.start), today = Date.parse(o.date);
      const duration = (end - start) / 86400000, age = (today - end) / 86400000;
      return Number.isFinite(duration) && duration >= days - 2 && duration <= days + 2 && age >= -1 && age <= 3;
    };
    return windowReady(windows['28d'] ?? windows['30d'], windows['28d'] ? 28 : 30)
      && windowReady(windows['7d'], 7)
      && ['rising', 'flat', 'cooling', 'insufficient'].includes(row.trend?.direction)
      && (!Object.values(windows).some((window) => window?.status === 'insufficient') || row.trend.direction === 'insufficient');
  };
  const supplyReady = (row) => {
    const pagesChecked = arr(row.urlChecks).length > 0 && row.urlChecks.every((check) => numericMetric(check.status) && !check.error && !challengePageTitle(check.title)) && typeof row.reachable === 'boolean';
    if (row.pageType !== 'companion-tool') return pagesChecked && typeof row.playable === 'boolean';
    const supply = row.supplyReview ?? {};
    return pagesChecked && supply.status === 'reviewed' && evidencePresent(supply.evidenceFile, o.root)
      && ['dataSource', 'license', 'implementation'].every((field) => typeof supply[field] === 'string' && supply[field].trim().length > 0);
  };
  const demandSeparated = (row) => typeof row.demandProof?.independentDemand === 'boolean'
    && ['low', 'medium', 'high'].includes(row.promotionRisk?.internalTrafficRisk);
  // 判决只能来自 AI（evaluation 文件）：标了 action 的候选必须带 AI 写下的理由
  // 或缺失证据清单；未判候选如实处于未判。脚本自产结论（verdict 字段）不允许存在。
  const decisionExplained = (row) => !row.action
    || arr(row.reasons).length > 0
    || arr(row.decisionAudit?.missingEvidence).length > 0;
  const checks = [
    checkItem('D01', '当天采集 Checklist 已全部通过。', collectResult?.ok === true && collectResult?.date === o.date, collectResult?.ok ? '采集通过' : '采集未通过或缺失'),
    checkItem('D02', '已按优先级选出不超过 6 个真实游戏进入深查。', priority.length > 0 && priority.length <= 6 && priority.every((row) => row.entityId && arr(row.urls).some(validUrl)), `${priority.length} 个深查游戏`),
    checkItem('D03', '每个深查游戏都已区分品牌词或品类词，并建立去重的关键词需求簇。', finalPriority.length === priority.length && finalPriority.every(strategyReady), `${finalPriority.filter(strategyReady).length}/${priority.length} 个需求簇已核对`),
    checkItem('D04', '每个计划关键词都有有效全球与国家结果；已核实未覆盖与取数故障分开。', arr(planData?.globalKeywords).length > 0 && arr(planData.globalKeywords).every((word) => globalKeys.has(normalizeName(word))) && plannedCountryRows.every((key) => countryKeys.has(key)), `${arr(planData?.globalKeywords).filter((word) => globalKeys.has(normalizeName(word))).length}/${arr(planData?.globalKeywords).length} 条有效全球、${plannedCountryRows.filter((key) => countryKeys.has(key)).length}/${plannedCountryRows.length} 条有效国家结果`),
    checkItem('D05', '每个深查游戏的 demandCoverage 与实际取数证据一致。', priority.length > 0 && priority.every(coverageRecorded), `${priority.filter(coverageRecorded).length}/${priority.length} 个需求结果完整，不能以 globalChecked 自证`),
    checkItem('D06', '竞争盘面已核对；无已观测搜索量而不适用的候选单列并给出理由。', finalPriority.length === priority.length && finalPriority.every((row) => competitionState(row) !== 'missing'), `${finalPriority.filter((row) => competitionState(row) === 'reviewed').length}/${priority.length} 个竞争盘面已核对；不适用 ${finalPriority.filter((row) => competitionState(row) === 'not-applicable').length}；缺失 ${priority.length - finalPriority.filter((row) => competitionState(row) !== 'missing').length}`),
    checkItem('D07', '每个深查游戏有近期月度和七天窗口的有效证据，未测与日期异常不算完成。', finalPriority.length === priority.length && finalPriority.every(trendReady), `${finalPriority.filter(trendReady).length}/${priority.length} 个趋势窗口已核对（含有效样本不足）`),
    checkItem('D08', '每个深查游戏区分独立需求并核对适用供给；伴随工具核数据、许可和实现。', finalPriority.length === priority.length && finalPriority.every((row) => demandSeparated(row) && supplyReady(row)), `${finalPriority.filter((row) => demandSeparated(row) && supplyReady(row)).length}/${priority.length} 个独立需求与适用供给已核对`),
    checkItem('D09', '判决只来自 AI：有 action 的候选带理由或缺失证据，报告不含脚本自产结论。', arr(report?.candidates).every(decisionExplained) && report?.verdict === undefined, `develop ${stats.develop ?? 0}／research ${stats.research ?? 0}／watch ${stats.watch ?? 0}／未判 ${stats.unjudged ?? 0}`),
    checkItem('D10', 'JSON、Markdown、latest、分组数量、链接和异常信息彼此一致。', statsMatch && latestMatch && arr(report?.candidates).every((row) => [...arr(row.sourceLinks), ...arr(row.urls)].some(validUrl)) && (!arr(report?.errors).length || markdown.includes('本次异常')), `${arr(report?.candidates).length} 个候选，异常 ${arr(report?.errors).length}`),
  ];
  return saveChecklist(o, 'decision', checks, { stats, priority: priority.length, errors: arr(report?.errors) });
}

async function decisionChecklist(o) {
  if (!o.checkOnly) {
    const demandResult = await demand(o);
    await evaluate(o, demandResult.ok ? [] : [`demand: ${demandResult.error ?? demandResult.stage ?? '查询失败'}`]);
  }
  return inspectDecision(o);
}

function selfTest() {
  if (demandKeywords({ keywords: [{ keyword: 'queens puzzle hints' }], names: ['Queens explained hints', 'techniques'] }).join('|') !== 'queens puzzle hints') {
    throw new Error('显式查询词不能被页面 slug 或内部实体名扩充');
  }
  const youtubeRows = parseSocialRows('youtube', '{"title":"New Browser Game","channel":"Demo","webpage_url":"https://youtube.com/watch?v=test","timestamp":1735689600,"view_count":12}\n');
  if (youtubeRows.length !== 1 || youtubeRows[0].url !== 'https://youtube.com/watch?v=test' || youtubeRows[0].engagement.views !== 12 || !youtubeRows[0].publishedAt) {
    throw new Error('YouTube JSONL 备用后端解析失败');
  }
  const keywordMerge = finishCandidate(mergeMissing({ names: ['Merge'], action: 'watch', decision: 'priority-research', keywords: [{ keyword: 'merge', market: 'US', status: 'metrics_unavailable', semrushVolume: null }] },
    { keywords: [{ keyword: 'merge', status: 'not-queried', semrushVolume: null }, { keyword: 'merge', gl: 'us', status: 'ok', semrushVolume: 100 }, { keyword: 'merge', market: 'DE', status: 'not-queried', semrushVolume: null }] }));
  if (keywordMerge.action !== 'watch' || keywordMerge.decision !== 'watch' || keywordMerge.keywords.length !== 2 || keywordMerge.keywords[0].semrushVolume !== null || keywordMerge.keywords[1].market !== 'DE'
    || keywordMerge.keywordMetrics.measuredRows !== 0 || finishCandidate(keywordMerge).keywords.length !== 2) throw new Error('关键词占位/旧结果重复计数、复活旧数值或旧decision覆盖action');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'game-opportunity-'));
  try {
    const o = parseArgs(['render', '--date', '2099-01-02', '--project-root', tmp]);
    if (!dated({ generatedAt: new Date(2099, 0, 2, 0, 30).toISOString() }, o.date)
      || dated({ generatedAt: 'invalid' }, o.date) || dated({ date: '2099-01-01' }, o.date)) {
      throw new Error('采集验收应按本地报告日期核对 UTC 时间戳');
    }
    const merged = mergeCandidates([
      { names: ['Foo Game'], urls: ['https://example.com/foo'], keywords: [{ keyword: 'foo', semrushVolume: 5000, semrushGlobalVolume: 12000, semrushKd: 22 }], playable: true, demandProof: { intentValidated: true, independentDemand: true } },
      { names: ['foo-game'], urls: ['https://example.com/foo/'], evidenceLinks: ['https://reddit.com/r/games/foo'] },
    ]);
    if (merged.length !== 1) throw new Error('实体合并失败');
    // 脚本不下判决：没写 action 就保持未判，绝不代填 action/理由/下一步。
    const untouched = finishCandidate({ names: ['Unjudged Game'], urls: ['https://example.com/unjudged'], playable: true, keywords: [{ semrushVolume: 99999, semrushGlobalVolume: 99999, semrushKd: 1 }] });
    if (untouched.action !== null || untouched.decision !== null || arr(untouched.reasons).length || untouched.nextAction) throw new Error('脚本不应自产判决或理由');
    // AI 写入的判读原样透传。
    const judged = finishCandidate({ names: ['Judged Game'], urls: ['https://example.com/judged'], action: 'develop', reasons: ['AI 判读'], nextAction: '建站' });
    if (judged.action !== 'develop' || judged.decision !== 'quick-ship' || judged.reasons[0] !== 'AI 判读') throw new Error('AI 判读透传失败');
    const carried = mergeRichIntoOrdered(
      [{ names: ['New Game'], urls: ['https://example.com/new'] }],
      carryForward({ date: '2099-01-01', candidates: [{ names: ['Old Game'], firstSeen: '2098-12-30', sourceLinks: ['https://example.com/old'], action: 'research' }] }, o.date),
    );
    if (carried[0].names[0] !== 'New Game' || carried[1].firstSeen !== '2098-12-30' || carried[1].sourceLinks[0] !== 'https://example.com/old' || carried[1].carryForward.recheckDue !== true) throw new Error('旧候选续查或新词顺序失败');
    // rejected 是和 develop 对称的终态：一旦 AI 判了否决，脚本不能每天把它带回来。
    const rejectedCarry = carryForward({ date: '2099-01-01', candidates: [{ names: ['Rejected Game'], firstSeen: '2098-12-30', sourceLinks: ['https://example.com/rejected'], action: 'rejected' }] }, o.date);
    if (rejectedCarry.length !== 0) throw new Error('已否决候选未被排除出续带池');
    // A skipped run must not swallow a milestone. Age jumps 2 -> 4 here, so the
    // day-3 recheck has to fire late rather than never.
    const skipped = carryForward({ date: '2099-01-01', candidates: [{ names: ['Gap Game'], urls: ['https://example.com/gap'], firstSeen: '2098-12-29', action: 'watch', carryForward: { ageDays: 2 } }] }, o.date);
    if (skipped[0].carryForward.ageDays !== 4 || skipped[0].carryForward.recheckDue !== true || !skipped[0].carryForward.recheckMilestones.includes(3)) throw new Error('跨过里程碑的复查未触发');
    // And a milestone already crossed must not re-fire every single day after.
    const settled = carryForward({ date: '2099-01-01', candidates: [{ names: ['Gap Game'], urls: ['https://example.com/gap'], firstSeen: '2098-12-29', action: 'watch', carryForward: { ageDays: 4 } }] }, o.date);
    if (settled[0].carryForward.recheckDue !== false || settled[0].carryForward.recheckMilestones.length) throw new Error('已完成的里程碑重复触发');
    // 深查名额的机械默认顺序：到期复查 → 当天新发现 → 其余；AI 名单一到即覆盖。
    const poolA = { entityId: 'carried-due', names: ['Carried Due'], urls: ['https://example.com/a'], keywords: [{ keyword: 'a' }], origin: ['previous-report'], carryForward: { ageDays: 7, recheckDue: true } };
    const poolB = { entityId: 'fresh', names: ['Fresh'], urls: ['https://example.com/b'], keywords: [{ keyword: 'b' }], origin: ['new-games'] };
    const poolC = { entityId: 'carried-idle', names: ['Carried Idle'], urls: ['https://example.com/c'], keywords: [{ keyword: 'c' }], origin: ['previous-report'], carryForward: { ageDays: 5, recheckDue: false } };
    const mech = selectDeepCheck([poolC, poolB, poolA], null, 2);
    if (mech.rule !== 'mechanical-recheck-then-new' || mech.chosen.map((c) => c.entityId).join('|') !== 'carried-due|fresh') throw new Error('机械深查顺序失败');
    const aiPick = selectDeepCheck([poolC, poolB, poolA], ['carried-idle'], 6);
    if (aiPick.rule !== 'ai-selection-file' || aiPick.chosen.length !== 1 || aiPick.chosen[0].entityId !== 'carried-idle') throw new Error('AI 深查名单未生效');
    // carryForward 字段必须扛过规范化，否则续带候选在选位时看起来像全新的。
    const normalised = inputCandidates({ candidates: [{ ...poolC, playable: true }] }, 'previous-report');
    if (normalised[0].carryForward?.recheckDue !== false) throw new Error('carryForward 未能通过规范化');
    if (normalised[0].playable !== true || inputCandidates({ candidates: [{ names: ['P'], urls: ['https://example.com/p'], playLinks: ['https://example.com/p/play'] }] }, 'x')[0].playable !== null) throw new Error('playable 不应从 playLink 推断');
    if (previousReportPool({ date: '2099-01-01', candidates: [{ names: ['Aged'], firstSeen: '2098-12-31', action: 'develop' }] }, o.date)[0].carryForward.ageDays !== 2) throw new Error('计划阶段未给上一份报告计龄');
    const watchPoolFile = path.join(tmp, '.rankup/tasks/game-opportunity-watch-pool.json');
    fs.mkdirSync(path.dirname(watchPoolFile), { recursive: true });
    writeJson(watchPoolFile, { active: [
      { entityId: 'pool-due', name: 'Pool Due', url: 'https://example.com/pool-due', firstSeen: '2098-12-30', nextDeepCheck: '2099-01-01', action: 'watch' },
      { entityId: 'pool-rejected', name: 'Pool Rejected', url: 'https://example.com/pool-rejected', firstSeen: '2098-12-30', action: 'rejected', rejectedAt: '2099-01-01T00:00:00.000Z' },
      { entityId: 'pool-developed', name: 'Pool Developed', url: 'https://example.com/pool-developed', firstSeen: '2098-12-30', action: 'develop' },
    ] });
    const poolRows = watchPoolCandidates(o);
    if (poolRows.length !== 1 || poolRows[0].entityId !== 'pool-due') throw new Error('已否决/已建站的观察池实体未被排除出续带');
    const poolDue = poolRows[0];
    if (poolDue?.carryForward?.recheckDue !== true || poolDue?.carryForward?.ageDays !== 3) throw new Error('观察池到期候选未进入深查计划');
    // reject 命令：按名称大小写不敏感匹配，写 action:"rejected" 与 rejectedAt，
    // 写回后该实体立刻从 watchPoolCandidates 消失；未匹配到时不改动文件。
    const rejectResult = reject({ ...o, entityName: 'pool due' });
    if (!rejectResult.ok || rejectResult.action !== 'rejected' || !rejectResult.rejectedAt) throw new Error('reject 命令未能标记匹配实体');
    const afterReject = readJson(watchPoolFile);
    const rejectedRow = afterReject.active.find((row) => row.entityId === 'pool-due');
    if (rejectedRow.action !== 'rejected' || !rejectedRow.rejectedAt) throw new Error('reject 命令未写回 watch-pool 文件');
    if (watchPoolCandidates(o).length !== 0) throw new Error('reject 后该实体仍被续带');
    const rejectMissing = reject({ ...o, entityName: 'does not exist' });
    if (rejectMissing.ok !== false || !rejectMissing.error) throw new Error('reject 未匹配到实体时应报错而不是静默成功');
    if (JSON.stringify(readJson(watchPoolFile)) !== JSON.stringify(afterReject)) throw new Error('reject 未匹配到实体时不应改动文件');
    // decision-checklist runs evaluate with no --evaluation, so the conventional
    // dated file has to be found on its own or every judgement field is lost.
    const evalFiles = files(o);
    if (evaluationOverlayPath({}, evalFiles) !== null) throw new Error('不存在的 evaluation 文件不应被采用');
    fs.mkdirSync(path.dirname(evalFiles.evaluation), { recursive: true });
    fs.writeFileSync(evalFiles.evaluation, JSON.stringify({ candidates: [] }));
    if (evaluationOverlayPath({}, evalFiles) !== evalFiles.evaluation) throw new Error('未自动采用约定位置的 evaluation 文件');
    if (evaluationOverlayPath({ evaluation: '/tmp/explicit.json' }, evalFiles) !== '/tmp/explicit.json') throw new Error('显式 --evaluation 应当优先');
    fs.rmSync(evalFiles.evaluation, { force: true });
    const campaigns = mergeCampaigns([
      { source: 'reddit', title: 'Try My Browser Game', author: 'same-maker', url: 'https://reddit.com/r/games/1' },
      { source: 'youtube', title: 'Browser Game Trailer', author: 'same-maker', url: 'https://youtube.com/watch?v=1' },
    ]);
    const radarMerged = mergeRadarReport(
      { date: '2099-01-02', runCount: 1, sources: [{ source: 'steam', status: 'compared', added: [{ title: 'First Game' }] }], candidates: [{ campaignId: 'c1', names: ['First'], urls: ['https://example.com/first'] }] },
      { date: '2099-01-02', sources: [{ source: 'steam', status: 'compared', added: [] }], candidates: [] },
      '2099-01-02',
    );
    if (radarMerged.runCount !== 2 || radarMerged.sources[0].added.length !== 1 || radarMerged.candidates.length !== 1) throw new Error('雷达同日累积合并失败');
    const retriedRadar = mergeRadarReport(
      { date: '2099-01-02', sources: [{ source: 'steam', status: 'failed' }], errors: ['steam: temporary failure'] },
      { date: '2099-01-02', sources: [{ source: 'steam', status: 'compared', added: [] }], errors: [] },
      '2099-01-02',
    );
    if (retriedRadar.errors.length !== 0 || retriedRadar.sources[0].error !== null || parseArgs(['radar', '--source', 'steam']).source !== 'steam') throw new Error('雷达单源重试未清理已修复错误');
    if (campaigns.length !== 1 || campaigns[0].mentions !== 2) throw new Error('campaign 去重失败');
    const fresh = { names: ['Fresh Game'], urls: ['https://example.com/fresh'] };
    const ranked = rankCandidates([
      { names: ['Old Watch'], urls: ['https://example.com/watch'], action: 'watch' },
      fresh,
      { names: ['Deep Checked'], urls: ['https://example.com/deep'], demandCoverage: { globalChecked: true } },
    ], [fresh]);
    if (ranked.map((v) => v.names[0]).join('|') !== 'Deep Checked|Fresh Game|Old Watch') throw new Error('机械展示排序失败');
    const checkedZero = { names: ['Checked Zero'], urls: ['https://example.com/zero'], action: 'watch', demandCoverage: { globalChecked: true } };
    if (rankCandidates([{ names: ['Fresh'], urls: ['https://example.com/fresh'] }, checkedZero], [{ names: ['Fresh'], urls: ['https://example.com/fresh'] }])[0] !== checkedZero) throw new Error('零量深查候选被日报截断');
    const partial = discoveryHealth({ compared: 45, baselineCreated: 0, platforms: [{ id: 'bad-a', status: 'failed', error: 'timeout' }] });
    if (partial.usable !== 45 || !partial.partial || !partial.warnings[0].includes('bad-a')) throw new Error('部分 discovery 判定失败');
    if (!staleReason({ urlChecks: [{ url: 'https://example.com/gone', status: 404, ok: false }], playLinks: [] })) throw new Error('明确 404 未排除');
    if (staleReason({ urlChecks: [{ url: 'https://example.com/slow', status: null, ok: false, error: 'timeout' }], playLinks: [] })) throw new Error('timeout 被错误排除');
    if (!errorPageTitle('404 Not Found')) throw new Error('404 title 判定失败');
    const meta = pageMeta('<title>Cute Mahjong Connect - Play Free</title><iframe src="../play/index.html"></iframe>', 'https://games.example/catalog/item/');
    if (cleanPageTitle(meta.title) !== 'Cute Mahjong Connect' || meta.iframeUrl !== 'https://games.example/catalog/play/index.html') throw new Error('title 清洗或 iframe 相对地址解析失败');
    if (playableEmbed('https://www.youtube.com/embed/trailer') || !playableEmbed('https://games.example/play/index.html')) throw new Error('视频 iframe 被误判为可玩入口');
    if (cleanPageTitle('スネークデュエル｜対戦バトル｜無料ゲームならワウゲーム') !== 'スネークデュエル') throw new Error('全角站点后缀清洗失败');
    if (cleanPageTitle('Save 33% on GRIDFALL on Steam') !== 'GRIDFALL') throw new Error('Steam 折扣标题清洗失败');
    if (cleanKeyword('Save 33% on GRIDFALL on Steam') !== '') throw new Error('Steam 折扣关键词未排除');
    saveReport(o, merged, []);
    const f = files(o);
    if (overlayCandidates([{ entityId: 'foo', names: ['Foo'], urls: ['https://example.com/foo'] }], { candidates: [{ entityId: 'foo', keywordStrategy: { entityType: 'brand' } }] }).length !== 1) throw new Error('entityId 覆盖合并失败');
    const checklist = saveChecklist(o, 'collect', [checkItem('C01', '测试检查。', true, 'ok')]);
    if (!checklist.ok || !exists(f.collectChecklistMd) || !fs.readFileSync(f.collectChecklistMd, 'utf8').includes('- [x] C01')) throw new Error('Checklist 产物失败');
    const newGames = saveNewGames(o,
      { date: o.date, candidates: [{ url: 'https://example.com/foo' }] },
      { date: o.date, candidates: [
        { source: 'steam', name: 'Foo', url: 'https://store.steampowered.com/app/1/Foo/' },
        { campaignId: 'campaign-001', name: 'Foo campaign', urls: ['https://reddit.com/r/games/1'] },
      ] },
    );
    if (newGames.count !== 1 || newGames.stats.ignoredCampaigns !== 1 || !exists(f.newGames) || !exists(f.latestNewGames)) throw new Error('新增游戏去重失败');
    writeJson(f.newGames, { games: Array.from({ length: 7 }, (_, i) => ({ names: [`New Game ${i}`], urls: [`https://example.com/new-${i}`] })) });
    const demandPlan = buildDemandPlan(o).plan;
    if (demandPlan.candidates.length !== 6 || demandPlan.selectionRule !== 'mechanical-recheck-then-new' || demandPlan.pool.length < 8) throw new Error('机械深查计划或候选池落盘失败');
    if (!demandPlan.pool.some((row) => row.selected === false)) throw new Error('未选中的候选没有留在池里给 AI 看');
    writeJson(f.demandSelection, ['foo-game']);
    const aiPlan = buildDemandPlan(o).plan;
    if (aiPlan.selectionRule !== 'ai-selection-file' || aiPlan.candidates.length !== 1 || !aiPlan.globalKeywords.includes('foo') || !aiPlan.candidates[0].latinKeywords.includes('foo')) throw new Error('AI 深查名单计划失败');
    fs.rmSync(f.demandSelection, { force: true });
    // 未查询与测得为零必须字节级可分辨。
    const overlayRows = demandOverlay(o,
      { candidates: [{ entityId: 'foo', names: ['Foo'], urls: [], keywords: ['foo'], mandatoryCountryDbs: ['us', 'de'], discoveryMarkets: [] }] },
      [{ keyword: 'foo', volume: 0, globalVolume: 100, byCountry: {} }], []).candidates[0].keywords;
    const usRow = overlayRows.find((row) => row.gl === 'us');
    const deRow = overlayRows.find((row) => row.gl === 'de');
    if (usRow.semrushVolume !== 0 || usRow.status === 'not-queried') throw new Error('测得为零被误标');
    if (deRow.semrushVolume !== null || deRow.status !== 'not-queried' || 'noData' in deRow) throw new Error('未查询市场被默认成有数据');
    const unavailableRows = demandOverlay(o,
      { candidates: [{ entityId: 'unavailable', names: ['Unavailable'], urls: [], keywords: ['unavailable'], mandatoryCountryDbs: [], discoveryMarkets: [] }] },
      [{ keyword: 'unavailable', volume: null, globalVolume: null, byCountry: null, status: 'metrics_unavailable' }], []).candidates[0].keywords;
    if (unavailableRows.length !== 1 || unavailableRows[0].gl !== 'us' || unavailableRows[0].status !== 'metrics_unavailable') throw new Error('无国家分布的未测词丢失 US 状态');
    // Regression: the real failed run had all-null rows plus shape-complete
    // not-measured trends; it used to pass D04-D07 and claim 5/5 reviewed.
    const testCandidate = { entityId: 'foo', names: ['Foo'], urls: ['https://example.com/foo'], keywords: ['foo'], mandatoryCountryDbs: ['us'] };
    const testPlan = { candidates: [testCandidate], globalKeywords: ['foo'] };
    const rawFailure = { keyword: 'foo', db: 'us', status: 'absent', volume: null, globalVolume: null, byCountry: null };
    const failedOverlay = demandOverlay(o, testPlan, [rawFailure], [rawFailure]);
    if (failedOverlay.candidates[0].demandCoverage.globalChecked || failedOverlay.candidates[0].demandCoverage.countriesChecked.length) throw new Error('失败被写成已查覆盖');
    failedOverlay.candidates[0].demandCoverage = { globalChecked: true, keywordsChecked: ['foo'], countriesChecked: ['US'] };
    writeJson(f.demandPlan, testPlan); writeJson(f.countryPlan, {});
    writeText(f.globalSemrush, JSON.stringify(rawFailure)); writeText(f.countrySemrush, JSON.stringify(rawFailure));
    writeJson(f.demandResults, failedOverlay);
    const testReport = { ...failedOverlay.candidates[0], trend: { direction: 'insufficient', windows: { '28d': { status: 'not-measured' }, '7d': { status: 'rejected-date-mismatch' } } } };
    saveReport(o, [testReport], []);
    const falseGreen = inspectDecision(o);
    if (falseGreen.checks.some((check) => ['D04', 'D05', 'D06', 'D07'].includes(check.id) && check.passed)) throw new Error('空取数/未测趋势/无量误报再次通过验收');
    if (metric({ keywords: [{ status: 'metrics_unavailable', semrushVolume: null, semrushGlobalVolume: null, globalVolume: null }] }).includes('全球 0')) throw new Error('null 被排版成实测零');
    const rawZero = { keyword: 'foo', db: 'us', status: 'ok', volume: 0, globalVolume: 0, byCountry: {} };
    writeText(f.globalSemrush, JSON.stringify(rawZero)); writeText(f.countrySemrush, JSON.stringify(rawZero));
    writeJson(f.demandResults, demandOverlay(o, testPlan, [rawZero], [rawZero]));
    const testEvidence = path.join(tmp, 'raw-evidence.json'); writeJson(testEvidence, { measured: true });
    const verifiedReport = { ...testReport, pageType: 'companion-tool', reachable: true, playable: null,
      urlChecks: [{ url: 'https://example.com/foo', status: 200, ok: true }], demandProof: { independentDemand: false }, promotionRisk: { internalTrafficRisk: 'high' },
      competitionReview: { status: 'not-applicable', reason: '已核实全局量为零，保留观察' },
      supplyReview: { status: 'reviewed', evidenceFile: testEvidence, dataSource: 'test data', license: 'test permission', implementation: 'test feasibility' },
      trend: { direction: 'insufficient', windows: { '28d': { status: 'insufficient', start: '2098-12-05', end: o.date, file: testEvidence }, '7d': { status: 'insufficient', start: '2098-12-26', end: o.date, file: testEvidence } } } };
    saveReport(o, [verifiedReport], []);
    const verified = inspectDecision(o);
    if (verified.checks.some((check) => ['D04', 'D05', 'D06', 'D07', 'D08'].includes(check.id) && !check.passed)
      || !verified.checks.find((check) => check.id === 'D06').evidence.includes('不适用 1')) throw new Error('实测零/有效样本不足/伴随工具适用供给被误拒');
    verifiedReport.trend.windows['7d'].start = '2004-12-26'; verifiedReport.trend.windows['7d'].end = '2005-01-02';
    saveReport(o, [verifiedReport], []);
    if (inspectDecision(o).checks.find((check) => check.id === 'D07').passed) throw new Error('错误年份趋势通过验收');
    saveReport(o, merged, []);
    if (!challengePageTitle('Just a moment...')) throw new Error('Cloudflare 验证页识别失败');
    if (![f.candidates, f.report, f.latestJson, f.latestMd].every(exists)) throw new Error('报告产物不完整');
    const reportJson = readJson(f.candidates);
    if ('verdict' in reportJson || typeof reportJson.stats.unjudged !== 'number') throw new Error('报告仍含脚本自产结论或缺未判计数');
    const reportMd = fs.readFileSync(f.report, 'utf8');
    if (!reportMd.includes('[Foo Game](https://example.com/foo)')) throw new Error('Markdown 链接缺失');
    if (reportMd.includes('结论：') || !reportMd.includes('未判')) throw new Error('日报仍在下结论或未如实标未判');
    return { ok: true, checks: ['normalize-and-merge', 'keyword-market-merge', 'no-script-verdict', 'ai-passthrough', 'checklist-output', 'carry-forward-order', 'rejected-terminal-action', 'recheck-milestone-crossing', 'deep-check-mechanical-default', 'deep-check-ai-selection', 'evaluation-overlay-discovery', 'display-rank-mechanical', 'partial-discovery', 'stale-vs-timeout', 'title-and-iframe', 'campaign-dedupe', 'radar-same-day-merge', 'new-games-dedupe', 'not-queried-vs-zero', 'failed-evidence-regression', 'verified-zero-and-applicability', 'trend-date-rejection', 'challenge-title-detect', 'markdown-links', 'stable-latest', 'reject-command'] };
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(HELP); return; }
  if (o.selfTest) { console.log(JSON.stringify(selfTest(), null, 2)); return; }
  if (!['discover', 'radar', 'collect', 'collect-checklist', 'dedupe', 'plan', 'demand', 'evaluate', 'decision-checklist', 'render', 'daily', 'reject'].includes(o.command)) {
    console.log(HELP); process.exitCode = 2; return;
  }
  const result = await ({ discover, radar, collect, 'collect-checklist': collectChecklist, dedupe, plan, demand, evaluate, 'decision-checklist': decisionChecklist, render, daily, reject })[o.command](o);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}

main().catch((e) => { console.error(`错误：${e.message}`); process.exit(1); });
