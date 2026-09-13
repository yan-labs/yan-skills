#!/usr/bin/env node
/**
 * semrush-keyword.mjs — 读 Semrush「关键词概览」：某个词在某个国家库里的
 * 月搜索量、关键词难度(KD)、CPC、竞争密度、结果数、意图。
 *
 * 为什么需要它：已有的 semrush 脚本全是**域名**维度（semrush-overview 读域名概览，
 * semrush-batch 批量导出域名报表）。「这个词有多少量」此前一直靠手开浏览器看，
 * 而选品、选域名、排产品线全都要问这个问题。
 *
 * 与关键词魔法工具整包导出的分工：整包导出适合一次拉几千个词做聚簇；
 * 本脚本适合**点查十几个词**，不占导出配额，也不需要事后清洗。
 *
 * 坑（与 semrush-overview 同源，别重犯）：
 *   1. 认「关键词难度」这类**只在数据渲染后才出现的字符串**做就绪标记，
 *      认页面标题会抓到骨架空壳；
 *   2. 「无数据」是结果不是故障——Semrush 会渲染出页面但量为空，
 *      本脚本记为 volume:null + noData:true；只有明确显示 0 才记为零；
 *   3. 词里有空格/CJK 必须 encodeURIComponent，否则路由会被截断；
 *   4. **`--db` 省略时（2026-09-13 起不再默认 `jp`）** 主输出 `volume` 直接改用
 *      `globalVolume`（页面常驻的全球合计指标块，不随选中国家变化），并标
 *      `volumeScope: "global"`；KD/CPC/竞争度/结果数这几个只有国家口径的字段会被
 *      置空（`countryMetricsAvailable:false` 附理由）——这个页面没有全球选择器，
 *      不传 `--db` 时落地哪个国家不可预测（账号共享状态，实测同一 session 内
 *      在 jp/us/kr 之间跳过，不是退回某个固定默认库），继续把这些数字当某个随机
 *      国家的真值吐出去，比返回 null 更危险。页面实际落地的国家仅作诊断写进
 *      `renderedDb`。要国家专属 KD/CPC/竞争度/结果数就必须显式传 `--db`。
 *
 * 用法：
 *   node semrush-keyword.mjs --kw 診断 --db jp      # 要国家专属 KD/CPC，--db 别省
 *   node semrush-keyword.mjs --kw "global keyword"  # 不传 --db：只拿 globalVolume，
 *                                                    # KD/CPC/竞争度/结果数置空（见 volumeScope）
 *   node semrush-keyword.mjs --kw-file words.txt --db kr --out kr.jsonl
 *   node semrush-keyword.mjs --kw-file words.txt --db us --bulk --out us.jsonl
 *   node semrush-keyword.mjs --bulk-plan countries.json --out countries.jsonl
 *   node semrush-keyword.mjs --ui-plan countries.json --out countries.jsonl
 *   # 想要全球规模：读输出里的 globalVolume（volumeScope=global 时 volume 就是它）
 *   # 单词模式默认自动复查第一大国家（只要它 ≠ --db）；明确不要时传 --no-follow-top-country
 *
 * 已验证 2026-08-26：冻结/登录失效页立即停止；同机 Semrush 查询跨进程串行；
 * 批量关键词之间默认等待 12–25 秒；第一大国家 ≠ 当前库时，同一 session 内自动
 * geo-hop 一次拿事实，不回 dashboard、不递归查询。
 *
 * 2026-08-30 双证人化：geoHop 只报事实（第一大国家、份额、两边的量），旧版
 * 「份额 >=35% 或当前库量 <500 才追查」的阈值判断已移出脚本——显著与否由 AI
 * 拿事实判。单词模式的失败关键词在落行前 captureScene（穿透 census + 截图）
 * 进 --evidence-dir，行内带证据路径。截图链路已实盘验证。
 */
import { resolveSession, parseFlags, printJson, validateSession, showHelpIfRequested} from './opencli-core.mjs';
import { assertToolsShareAvailable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import { plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW } from './lib-automation-window.mjs';
import { readFile, writeFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import assert from 'node:assert/strict';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const bulkPlanFile = typeof flags['bulk-plan'] === 'string' ? flags['bulk-plan'] : null;
const uiPlanFile = typeof flags['ui-plan'] === 'string' ? flags['ui-plan'] : null;
if (bulkPlanFile && uiPlanFile) throw new Error('--bulk-plan and --ui-plan cannot be used together.');
if (flags.bulk && uiPlanFile) throw new Error('--bulk and --ui-plan cannot be used together.');
const dbGiven = flags.db !== undefined && String(flags.db).trim() !== '';
// 2026-09-13：去掉了 jp 硬编码默认值。它当初只是「第一批调用方全是日本市场」的历史
// 遗留，留着只会让人以为「不传 --db 等于全球」或「不传就有个安全的默认国家」——两个
// 都不成立：这个页面没有全球选择器，不传 --db 时落地哪个国家不可预测（账号共享状态，
// 实测同一 session 内在 jp/us/kr 之间跳过，不是退回某个固定默认库）。所以现在不传
// --db 时，主输出 volume 改用 globalVolume，国家专属字段（kd/cpc/competition/results）
// 一律置空，见下面 scopeKeywordMetrics。
const db = String(flags.db || '').trim().toLowerCase();
if (flags.bulk && !bulkPlanFile && !dbGiven) throw new Error('Bulk keyword lookup requires an explicit country database, for example --db us or --db jp.');
if (!dbGiven && !bulkPlanFile && !uiPlanFile && !flags['self-test']) {
  console.error(`⚠ --db not given. volume in the output is globalVolume (worldwide), and country-scoped fields (kd/cpc/competition/results) are nulled out — Semrush's keyword overview has no worldwide selector and the country it lands on without --db is unpredictable (account-shared, observed drifting between jp/us/kr with nothing changed on our end). Pass --db explicitly (e.g. --db us) for country-specific KD/CPC/competition.`);
}
const session = resolveSession(flags, 'semrush-keyword', 'semrush');
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN_SEMRUSH || 'https://sem.3ue.co').replace(/\/+$/, '');
// 失败现场的落点。默认贴着 --out（`x.jsonl.evidence/`），没有 --out 进 .backlink/。
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'semrush-keyword' });

// 窗口策略（见 lib-automation-window.mjs 与 semrush-overview.mjs 的同名用法）：不传
// --window 时默认走虚拟屏幕，检测不到虚拟屏幕就回退到 --window active；显式传 opencli
// 四档之一则原样透传、不走虚拟屏幕。本脚本不接 semrush-overview.mjs 那套 OS 级
// `open -a` 抢焦点兜底（createChromeActivator/--max-activations）——那是历史更早、
// 独立的另一层兜底，不在本轮「补齐虚拟屏幕窗口」的范围内。
const windowStrategy = resolveWindowStrategy({
  windowFlag: typeof flags.window === 'string' ? flags.window : null,
  fallbackWindowMode: 'active',
});
const launchWindow = windowStrategy.launchWindow;
// 走虚拟屏幕成功时下面 launchTool() 会把它填成真正的控制器；显式传了非虚拟屏幕窗口
// 模式、或虚拟屏幕在 launchTool() 里就失败时保持 null。
let automation = null;
// 上一次读数的 document.visibilityState：hidden 才值得再花一次 ensureVisible 去恢复，
// visible 就不重复检查——和 semrush-overview.mjs 的 io.readPage 同一个节流理由。
let lastVis = null;
/** 输出里的 automationWindow 字段：有控制器就用它的 summary()，否则退化成形状一致的
 *  plainAutomationSummary()——与 semrush-overview.mjs 的用法一致，收成一个函数给
 *  最终输出和每行的错误输出共用。`errorAutomation` 是 launchTool() 失败时挂在
 *  error.automationWindow 上的现成 summary（见 lib-tools-share.mjs）。 */
function automationWindowOutput(errorAutomation) {
  if (automation) return automation.summary();
  if (errorAutomation) return errorAutomation;
  const reason = windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? 'launch-failed-before-prepare' : 'explicit-window-mode';
  const windowMode = windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? windowStrategy.fallbackWindowMode : launchWindow;
  return plainAutomationSummary({ windowMode, reason });
}

let keywords = [];
if (typeof flags.kw === 'string') keywords = String(flags.kw).split(',').map((s) => s.trim()).filter(Boolean);
if (typeof flags['kw-file'] === 'string') {
  const text = await readFile(flags['kw-file'], 'utf8');
  keywords = keywords.concat(text.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && !s.startsWith('#')));
}
let bulkPlan = null;
if (bulkPlanFile) {
  bulkPlan = JSON.parse(await readFile(bulkPlanFile, 'utf8'));
  if (!bulkPlan || Array.isArray(bulkPlan) || typeof bulkPlan !== 'object') throw new Error('--bulk-plan must be a JSON object: {"us":["keyword"]}');
  for (const [country, words] of Object.entries(bulkPlan)) {
    if (!/^[a-z]{2}$/i.test(country) || !Array.isArray(words) || !words.length || words.length > 100) {
      throw new Error(`Invalid --bulk-plan entry for ${country}; each country needs 1-100 keywords.`);
    }
  }
}
let uiPlan = null;
if (uiPlanFile) {
  uiPlan = JSON.parse(await readFile(uiPlanFile, 'utf8'));
  if (!uiPlan || Array.isArray(uiPlan) || typeof uiPlan !== 'object') throw new Error('--ui-plan must be a JSON object: {"us":["keyword"]}');
  for (const [country, words] of Object.entries(uiPlan)) {
    if (!/^[a-z]{2}$/i.test(country) || !Array.isArray(words) || !words.length || words.length > 100) {
      throw new Error(`Invalid --ui-plan entry for ${country}; each country needs 1-100 keywords.`);
    }
  }
}
if (!keywords.length && !bulkPlanFile && !uiPlanFile && !flags['self-test']) throw new Error('Need --kw "a,b", --kw-file <path>, --bulk-plan <json>, or --ui-plan <json>');
const minDelaySeconds = Number(flags['min-delay'] ?? 12);
const maxDelaySeconds = Number(flags['max-delay'] ?? 25);
if (![minDelaySeconds, maxDelaySeconds].every(Number.isFinite) || minDelaySeconds < 0 || maxDelaySeconds < minDelaySeconds) {
  throw new Error('--min-delay and --max-delay must be finite non-negative seconds, with max >= min.');
}
const minDelayMs = minDelaySeconds * 1000;
const maxDelayMs = maxDelaySeconds * 1000;
const pace = () => new Promise((resolve) => setTimeout(resolve, randomInt(Math.floor(minDelayMs), Math.floor(maxDelayMs) + 1)));

function parseCompact(value) {
  const m = String(value ?? '').replace(/,/g, '').trim().match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(Number(m[1]) * mult);
}

const BULK_INTENTS = ['Informational', 'Navigational', 'Commercial', 'Transactional'];
function parseBulkApi(keywords, rows, database = db) {
  const byPhrase = new Map(rows.map((row) => [row.phrase, row]));
  return keywords.map((keyword) => {
    const row = byPhrase.get(keyword);
    const noData = !row || row.volume == null;
    return {
      keyword,
      db: database,
      volume: noData ? null : row.volume,
      kd: row?.difficulty ?? null,
      cpc: row?.cpc == null ? null : `$${row.cpc}`,
      competition: row?.competition_level == null ? null : String(row.competition_level),
      results: row?.results ?? null,
      trend: row?.trend ?? null,
      globalVolume: null,
      byCountry: null,
      intentRaw: row?.intents ?? null,
      intent: row?.intents?.map((code) => BULK_INTENTS[code]).filter(Boolean).join(', ') || null,
      noData,
      status: noData ? 'absent' : 'ok',
    };
  });
}

/**
 * 页面上出现的所有指标标签，`pick` 拿它当**扫描边界**。
 * 单独列出来是因为「往后找」必须知道自己什么时候越界了。
 */
const LABELS = [
  '搜索量', '关键词难度', '全球搜索量', 'CPC', '竞争激烈程度', '意图', '趋势',
  '结果', '谷歌购物广告', '广告', '关键词意见', '关键词变化', '总搜索量',
];

/**
 * 标签下一行不一定是数值（可能是变化率、评级词），所以要往后找。
 * 往后找有**两种**翻车方式，两个守卫缺一不可：
 *
 *   1. **「不可用」没短路**：Semrush 对冷门词把 KD 写成「不可用」，
 *      继续往后就会抓到下一个指标的数字——实测有个词的 KD 被读成 780，
 *      那其实是它的全球搜索量。
 *   2. **越过了标签边界**：某个指标的值这次没渲染出来时，扫描会一路穿到
 *      下一个标签底下，把别人的数字当成自己的。2026-08-21 在 semrush-report.mjs
 *      上实测到「自然流量」被读成 4，那是「出站域名」的值。
 *
 * 两种都产出**看着合理、其实是隔壁字段**的错数，比返回 null 危险得多。
 * 所以：碰到「不可用」停，碰到下一个已知标签也停，宁可返回 null。
 */
const NA = /^(不可用|n\/a|-|—)$/i;
function pick(lines, label, pattern, span = 6) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;   // 同名词可能先出现在导航里，所有位置都试
    for (let j = i + 1; j < Math.min(lines.length, i + 1 + span); j++) {
      if (NA.test(lines[j])) break;           // 守卫 1：明确的「无数据」
      if (LABELS.includes(lines[j])) break;   // 守卫 2：越到下一个指标了
      if (pattern.test(lines[j])) return lines[j];
    }
  }
  return null;
}


/**
 * 意图（Commercial / Informational / Navigational / Transactional）。
 * 这个字段头部注释从一开始就写着会读，代码里却一直没取——2026-08-21 实战测试里
 * 有人只能自己对 --debug 的 bodyText 现写正则去抠，所以补成一等字段。
 * 值可能是多个（「商业, 交易」），按已知词表匹配整行，避免把隔壁标签的文字吞进来。
 */
const INTENT_WORDS = { 商业: 'Commercial', 信息: 'Informational', 导航: 'Navigational', 交易: 'Transactional' };
const INTENT_RE = /^(?:商业|信息|导航|交易|Commercial|Informational|Navigational|Transactional)(?:\s*[,、，/]\s*(?:商业|信息|导航|交易|Commercial|Informational|Navigational|Transactional))*$/i;
function pickIntent(lines) {
  const raw = pick(lines, '意图', INTENT_RE, 3) ?? pick(lines, 'Intent', INTENT_RE, 3);
  if (!raw) return { intent: null, intentRaw: null };
  const parts = raw.split(/\s*[,、，/]\s*/).filter(Boolean);
  return { intentRaw: raw, intent: parts.map((x) => INTENT_WORDS[x] || x).join(', ') };
}

/** 「全球搜索量」下面是 国家码/国家名/数值 三行一组，一直到「意图」。
 *  罗马字词最有价值的信息就在这里：它到底在哪个国家有量。 */
// **`byCountry` 是页面展示的 Top-N，不是穷举。** 实测过一批词，byCountry 里几个
// 国家加总只到 globalVolume 的一半左右——差额是页面没列出来的其余国家，不是丢数据。
// 不要拿 byCountry 求和去核对或替代 globalVolume。
function pickCountries(lines) {
  const i = lines.indexOf('全球搜索量');
  if (i < 0) return null;
  const end = lines.findIndex((l, j) => j > i && (l === '意图' || l === '趋势'));
  const slice = lines.slice(i + 1, end < 0 ? i + 30 : end);
  const out = {};
  for (let j = 0; j < slice.length; j++) {
    if (/^[A-Z]{2}$/.test(slice[j]) && slice[j + 2] && /^[\d.,]+\s*[KMB]?$/i.test(slice[j + 2])) {
      out[slice[j]] = parseCompact(slice[j + 2]);
      j += 2;
    }
  }
  return Object.keys(out).length ? out : null;
}

function parseOverviewMetrics(bodyText, absent = false) {
  const all = bodyText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const start = all.findIndex((l) => /^(关键词摘要|Keyword Summary)$/i.test(l));
  const end = all.findIndex((l, i) => i > start && /^(关键词意见|Keyword Ideas)$/i.test(l));
  // 同名“搜索量”还在下方相关词表中出现。摘要缺边界时不回退全页，避免借用别的词。
  const lines = start >= 0 && end > start ? all.slice(start + 1, end) : [];
  const volRaw = pick(lines, '搜索量', /^[\d.,]+\s*[KMB]?$/i) ?? pick(lines, 'Volume', /^[\d.,]+\s*[KMB]?$/i);
  const kdRaw = pick(lines, '关键词难度', /^\d{1,3}%?$/) ?? pick(lines, 'Keyword Difficulty', /^\d{1,3}%?$/);
  const volume = parseCompact(volRaw);
  return {
    volume,
    kd: kdRaw === null ? null : Number(String(kdRaw).replace('%', '')),
    cpc: pick(lines, 'CPC', /^[^\n]{1,12}$/, 3),
    competition: pick(lines, '竞争激烈程度', /^[\d.]+$/) ?? pick(lines, 'Com.', /^[\d.]+$/),
    results: parseCompact(pick(lines, '结果数', /^[\d.,]+\s*[KMB]?$/i) ?? pick(lines, 'Results', /^[\d.,]+\s*[KMB]?$/i)),
    globalVolume: parseCompact(pick(lines, '全球搜索量', /^[\d.,]+\s*[KMB]?$/i)),
    byCountry: pickCountries(lines),
    ...pickIntent(lines),
    noData: volume === null,
    status: absent ? 'absent' : volume === null ? 'metrics_unavailable' : 'ok',
  };
}

/** 落地 URL 里的 `db` 参数——诊断用，读不出就是 null，不猜。 */
function extractDbFromUrl(url) {
  try { return new URL(String(url)).searchParams.get('db'); } catch { return null; }
}

/**
 * 未显式传 `--db` 时的口径改写（见文件头第 4 条）。这个页面没有全球选择器，不传
 * `--db` 落地哪个国家不可预测（账号共享状态，实测同一 session 内在 jp/us/kr 之间
 * 跳过，不是退回某个固定默认库）。继续把 `kd`/`cpc`/`competition`/`results`
 * 这几个只有国家口径的字段当某个随机国家的真值吐出去，比返回 `null` 更危险——
 * 二选一里选了「置空 + 写清理由」而不是「保留数字但附 `renderedDb`」：后者要求每个
 * 下游调用方自己记得先检查 `renderedDb` 才能用这几个字段，漏检一次就是一条静默的
 * 错数；置空则调用方什么都不用做就不会被坑，理由字段负责解释为什么拿不到。
 *
 * 显式传了 `--db` 时原样返回，只加 `volumeScope`/`renderedDb`/`countryMetricsAvailable`
 * 三个字段，方便下游不用反查有没有传 `--db` 就知道这一行能不能信 `kd`/`cpc`。
 */
function scopeKeywordMetrics(metrics, { dbGiven, database, renderedDb }) {
  if (dbGiven) {
    return { ...metrics, volumeScope: database, renderedDb, countryMetricsAvailable: true };
  }
  const volume = metrics.globalVolume;
  return {
    ...metrics,
    volume,
    volumeScope: 'global',
    renderedDb,
    kd: null,
    cpc: null,
    competition: null,
    results: null,
    countryMetricsAvailable: false,
    countryMetricsUnavailableReason: 'no --db given: Semrush keyword overview has no worldwide selector, and the country it renders without --db is unpredictable (account-shared state observed drifting between jp/us/kr across sessions with nothing changed on our end) — returning kd/cpc/competition/results here would silently mix in another market\'s numbers. Pass --db explicitly for country-specific difficulty/cost/competition.',
    noData: volume === null,
    status: volume === null ? 'metrics_unavailable' : 'ok',
  };
}

/**
 * geo-hop 只报**事实**：第一大国家是谁、占全球多少份额、两边的量各是多少。
 * 旧版的「份额 >=35% 或当前库量 <500 才追查」是 AI 级判断写死在脚本里
 * （refactor-audit P1 点名），已移出——`followed: true` 只表示「第一大国家
 * 不是当前库，值得把它的数一并采回来」，显著与否由 AI 拿 share/volume 判。
 */
function geoHopFacts(row, currentDb) {
  const countries = Object.entries(row?.byCountry || {}).sort((a, b) => b[1] - a[1]);
  if (!countries.length) return { followed: false, reason: 'no byCountry data' };
  const [code, topCountryVolume] = countries[0];
  const country = code.toLowerCase();
  const share = row.globalVolume > 0 ? Math.round(topCountryVolume / row.globalVolume * 1000) / 10 : null;
  if (country === currentDb) {
    return { followed: false, reason: 'top country is current db', country, share, topCountryVolume };
  }
  return { followed: true, reason: 'top country differs from current db', country, share, topCountryVolume, currentDbVolume: row.volume ?? null };
}

function uiPlanJobs(plan) {
  return Object.entries(plan).flatMap(([database, phrases]) => phrases.map((keyword) => ({ database: database.toLowerCase(), keyword })));
}

if (flags['self-test']) {
  const sample = parseBulkApi(['x', 'missing'], [{
    phrase: 'x', volume: 1400, difficulty: 29, cpc: 0.16, competition_level: 0.01,
    results: 100, trend: [1, 2], intents: [0],
  }]);
  assert.deepEqual(sample[0], {
    keyword: 'x', db, volume: 1400, kd: 29, cpc: '$0.16', competition: '0.01', results: 100,
    trend: [1, 2], globalVolume: null, byCountry: null, intentRaw: [0], intent: 'Informational',
    noData: false, status: 'ok',
  });
  assert.equal(sample[1].status, 'absent');
  assert.equal(sample[1].volume, null);

  // scopeKeywordMetrics: no --db → volume comes from globalVolume, country-only fields nulled.
  const rawMetrics = {
    volume: 260, kd: 32, cpc: '$1.20', competition: '0.4', results: 900,
    globalVolume: 41300, byCountry: { US: 14800 }, intent: null, intentRaw: null,
    noData: false, status: 'ok', updateOffered: false,
  };
  const globalRow = scopeKeywordMetrics(rawMetrics, { dbGiven: false, database: '', renderedDb: 'jp' });
  assert.equal(globalRow.volume, 41300, 'no --db: volume must be globalVolume, not the country the page happened to land on');
  assert.equal(globalRow.volumeScope, 'global');
  assert.equal(globalRow.renderedDb, 'jp');
  assert.equal(globalRow.kd, null);
  assert.equal(globalRow.cpc, null);
  assert.equal(globalRow.competition, null);
  assert.equal(globalRow.results, null);
  assert.equal(globalRow.countryMetricsAvailable, false);
  assert.equal(typeof globalRow.countryMetricsUnavailableReason, 'string');
  assert.ok(globalRow.countryMetricsUnavailableReason.length > 0);
  assert.equal(globalRow.status, 'ok');
  assert.equal(globalRow.byCountry.US, 14800, 'byCountry/globalVolume survive scoping — only the country-only fields are nulled');

  // scopeKeywordMetrics: explicit --db → country-specific numbers pass through untouched.
  const scopedRow = scopeKeywordMetrics(rawMetrics, { dbGiven: true, database: 'jp', renderedDb: 'jp' });
  assert.equal(scopedRow.volume, 260, '--db given: volume stays the country-specific figure');
  assert.equal(scopedRow.volumeScope, 'jp');
  assert.equal(scopedRow.kd, 32);
  assert.equal(scopedRow.cpc, '$1.20');
  assert.equal(scopedRow.countryMetricsAvailable, true);
  assert.equal(scopedRow.countryMetricsUnavailableReason, undefined);

  // scopeKeywordMetrics: no --db and no global figure either → still no data, not a fabricated zero.
  const noGlobalRow = scopeKeywordMetrics(
    { volume: null, kd: null, cpc: null, competition: null, results: null, globalVolume: null, byCountry: null, intent: null, intentRaw: null, noData: true, status: 'metrics_unavailable', updateOffered: false },
    { dbGiven: false, database: '', renderedDb: null },
  );
  assert.equal(noGlobalRow.volume, null);
  assert.equal(noGlobalRow.noData, true);
  assert.equal(noGlobalRow.status, 'metrics_unavailable');

  assert.equal(extractDbFromUrl('https://sem.3ue.co/analytics/keywordoverview/?q=x&db=kr'), 'kr');
  assert.equal(extractDbFromUrl('https://sem.3ue.co/analytics/keywordoverview/?q=x'), null);
  assert.equal(extractDbFromUrl('not a url'), null);

  assert.deepEqual(geoHopFacts({ volume: 100, globalVolume: 1000, byCountry: { IN: 600, US: 100 } }, 'us'), {
    followed: true, reason: 'top country differs from current db', country: 'in', share: 60, topCountryVolume: 600, currentDbVolume: 100,
  });
  // 阈值判断已移出：份额只有 20%、当前库量充足，也照样报事实并追查——显著与否归 AI。
  assert.equal(geoHopFacts({ volume: 5000, globalVolume: 10000, byCountry: { IN: 2000, US: 1000 } }, 'us').followed, true);
  assert.equal(geoHopFacts({ volume: 5000, globalVolume: 10000, byCountry: { IN: 2000, US: 1000 } }, 'us').share, 20);
  assert.equal(geoHopFacts({ volume: 100, globalVolume: 1000, byCountry: { US: 600 } }, 'us').followed, false);
  assert.equal(geoHopFacts({ volume: 100, globalVolume: 1000, byCountry: {} }, 'us').followed, false);
  assert.deepEqual(uiPlanJobs({ de: ['x'], jp: ['y', 'z'] }), [{ database: 'de', keyword: 'x' }, { database: 'jp', keyword: 'y' }, { database: 'jp', keyword: 'z' }]);
  console.log('semrush-keyword bulk self-test passed');
  process.exit(0);
}

const launched = await launchTool({
  session,
  tool: 'semrush',
  node: flags.node,
  window: launchWindow,
  fallbackWindow: windowStrategy.fallbackWindowMode,
  wait: Number(flags.wait || 7),
  timeout: Number(flags.launchTimeout || 60),
  allowParallelSession: Boolean(flags['allow-parallel-session']),
});
automation = launched.automationWindow || null;
try {
const warn = expiryWarning(launched.state);
if (warn) console.error(`[subscription] ${warn}`);

let results = [];
async function fetchBulk(database, phrases) {
  if (phrases.length > 100) throw new Error(`Semrush bulk accepts at most 100 keywords, received ${phrases.length}.`);
  // The launcher now lands on /home/, whose gateway rejects keyword RPCs with 405.
  // Enter the keyword app first so the request uses the report gateway and session context.
  const params = { phrases, database, date: '', currency: 'USD' };
  const cap = assertToolsShareAvailable(await launched.evalPage(`(async () => {
    const response = await fetch('/kwogw/v2/webapi', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'keywords.GetBulk', params: ${JSON.stringify(params)} }),
      mode: 'cors',
      cache: 'default',
    });
    const text = await response.text();
    let data = null;
    try { data = JSON.parse(text); } catch { /* handled below without exposing response text */ }
    return JSON.stringify({
      url: location.href,
      title: document.title,
      bodyText: (document.body?.innerText || '').slice(0, 1000),
      httpStatus: response.status,
      rpcError: data?.error || null,
      invalidJson: data === null,
      rows: Array.isArray(data?.result) ? data.result : [],
    });
  })()`, Number(flags.timeout || 90) * 1000));
  if (cap.httpStatus !== 200 || cap.rpcError || cap.invalidJson) {
    throw new Error(`Semrush bulk request failed (db=${database}, HTTP ${cap.httpStatus}, ${cap.rpcError?.message || 'empty or invalid response'})`);
  }
  return parseBulkApi(phrases, cap.rows, database);
}

if (flags.bulk || bulkPlan) {
  const jobs = bulkPlan ? Object.entries(bulkPlan).map(([database, phrases]) => [database.toLowerCase(), phrases]) : [[db, keywords]];
  const [firstDb, firstPhrases] = jobs[0];
  // 导航进关键词概览前先确认自动化窗口可见（虚拟屏幕模式；非虚拟屏幕模式下
  // automation 为 null，这一行是 no-op，和接入前完全一样）。
  await automation?.ensureVisible('bulk-navigation');
  await gotoInTool(
    launched.evalPage,
    `${appOrigin}/analytics/keywordoverview/?q=${encodeURIComponent(firstPhrases[0])}&db=${encodeURIComponent(firstDb)}`,
    Number(flags.settle || 8),
  );
  for (const [database, phrases] of jobs) {
    const rows = await fetchBulk(database, phrases);
    results.push(...rows);
    console.error(`bulk ${database}: ${rows.length} keywords`);
  }
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, results.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }
} else {
// ui-plan 里每个国家都是计划本身显式写的（2 位国码校验过），永远算 dbGiven=true；
// 单词/--kw-file 模式的 dbGiven 就是顶层有没有传 --db。
const uiJobs = uiPlan
  ? uiPlanJobs(uiPlan).map((job) => ({ ...job, dbGiven: true }))
  : keywords.map((keyword) => ({ database: db, keyword, dbGiven }));
for (const { database, keyword: kw, dbGiven: jobDbGiven } of uiJobs) {
  if (results.length) await pace();
  let row;
  try {
    // database 为空 = 没传 --db，不带 db 参数请求——落地哪个国家由 Semrush 自己的
    // （不可预测的）账号状态决定，之后从 cap.url 读回 renderedDb 只作诊断。
    const url = `${appOrigin}/analytics/keywordoverview/?q=${encodeURIComponent(kw)}${database ? `&db=${encodeURIComponent(database)}` : ''}`;
    await automation?.ensureVisible('keyword-navigation');
    await gotoInTool(launched.evalPage, url, Number(flags.settle || 8));

    let cap = null;
    const deadline = Date.now() + Number(flags.timeout || 90) * 1000;
    while (Date.now() < deadline) {
      // 只在上一次读到 hidden 时才恢复；visible 就不重复检查——每 2.5s 轮询一次，
      // 每次都检查会把往返次数翻倍（与 semrush-overview.mjs 的 io.readPage 同一节流理由）。
      if (lastVis === 'hidden') await automation?.ensureVisible('keyword-read-hidden');
      cap = await launched.evalPage(`(() => { const t = document.body?.innerText || ''; return JSON.stringify({
        url: location.href,
        title: document.title,
        ready: /关键词难度|Keyword Difficulty/.test(t),
        // 库里完全没有这个词时，页面渲染完也不会出现任何指标块，只留一个
        // 「更新指标 / 提供最新的关键词数据」的取数按钮。这是**观测到的空**，
        // 与「还没渲染完」形态不同，必须分开——否则冷门词全被记成脚本故障。
        absent: /提供最新的关键词数据|更新指标/.test(t) && !/关键词难度|搜索量/.test(t),
        bodyText: t.slice(0, 20000),
        vis: document.visibilityState,
      }); })()`);
      assertToolsShareAvailable(cap);
      lastVis = cap?.vis ?? lastVis;
      automation?.recordRead({ vis: cap?.vis ?? null, label: 'keyword-read' });
      if (cap.ready || cap.absent) break;
      await new Promise((r) => setTimeout(r, 2500));
    }
    if (!cap?.ready && !cap?.absent) throw new Error(`keyword overview never rendered for "${kw}" (db=${database || 'unspecified — global scope'}) — 页面既没出指标也没出空态标记，这是超时不是结果`);

    row = {
      keyword: kw,
      db: database || null,
      ...scopeKeywordMetrics(parseOverviewMetrics(cap.bodyText, cap.absent), {
        dbGiven: jobDbGiven, database, renderedDb: extractDbFromUrl(cap.url),
      }),
    };
    if (flags.debug) row.bodyText = cap.bodyText.slice(0, 3000);
  } catch (error) {
    if (error?.code === 'TOOLS_SHARE_BLOCKED') throw error;
    // **必须过 redactSecrets。** opencli 失败时会把带 __gmitm 令牌的会话 URL
    // 打进 stderr，opencli-core 又把那整段 stderr 当成 Error.message 抛上来；
    // 这一行直接进 --out 的 JSONL、进 stdout、进日志。2026-08-28 实测确认这里
    // 拿到的就是 opencli 的 stderr 原文。同仓库的 semrush-report.mjs 早就把这条
    // 写在注释里了，但注释拦不住第二个脚本重犯——所以另配了一条会红的检查
    // （backlink/tests/redaction-guard.test.mjs）。
    // **先取证后落行**：超时/never-rendered 的那一刻页面长什么样，只有此刻拍得到。
    // captureScene 永不 throw；行内带证据路径，AI 复核「超时」还是「真没数据」。
    const scene = await captureScene({
      session, outDir: evidenceDir, evalPage: launched.evalPage, tag: `kw-${results.length + 1}-error`,
      note: `semrush-keyword "${kw}" (db=${database || 'unspecified — global scope'}): ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    });
    row = { keyword: kw, db: database || null, status: 'error', error: redactSecrets(error.message), evidence: scene, automationWindow: automationWindowOutput(error?.automationWindow) };
  }
  if (row.status === 'ok') {
    if (jobDbGiven) {
      // 只报事实 + 采数据，不做显著性判断（阈值已移出，见 geoHopFacts 注释）。
      const facts = geoHopFacts(row, database);
      row.geoHop = facts;
      if (facts.followed && !flags['no-follow-top-country'] && !uiPlan) {
        try {
          const [followed] = await fetchBulk(facts.country, [kw]);
          row.geoHop = { ...facts, result: followed };
        } catch (error) {
          if (error?.code === 'TOOLS_SHARE_BLOCKED') throw error;
          row.geoHop = { ...facts, status: 'error', error: redactSecrets(error.message) };
        }
      } else if (facts.followed) {
        row.geoHop = { ...facts, followed: false, reason: uiPlan ? 'disabled for --ui-plan DOM-only mode' : 'disabled by --no-follow-top-country' };
      }
    } else {
      // 没有显式 --db，就没有"当前国家库"可比——geoHop 整个前提（离开哪个国家）不成立，
      // 不追查。volumeScope 已经是 global，追查也追不出"离开谁"的意义。
      row.geoHop = { followed: false, reason: 'no explicit --db given; volumeScope is global, no current-country baseline to hop from' };
    }
  }
  results.push(row);
  console.error(`[${results.length}/${uiJobs.length}] ${kw} (${database || 'global'}) → ${row.status !== 'error' ? `vol=${row.volume} kd=${row.kd}` : row.error}`);
  // 每查完一个就落盘，中途被打断也留得下已有结果。
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, results.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  }
}
}

printJson({
  version: 1,
  source: `Semrush keyword overview${flags.bulk || bulkPlan ? ' bulk' : uiPlan ? ' UI plan' : ''} via authenticated Tools Share browser session`,
  note: flags.bulk || bulkPlan
    ? `bulk volume/KD/CPC 是每行 db 对应国家库的数据；对筛出的候选先用单词模式读取 globalVolume 与 byCountry。`
    : uiPlan
      ? 'ui-plan 逐条读取关键词概览网页 DOM，不调用 bulk RPC，也不会为 geo hop 追加接口请求。每行的 volume 是其 db 对应国家库的月搜量。'
      : dbGiven
        ? `volume 是 db=${db} 这一个国家库的月搜量，globalVolume 是全球合计，byCountry 是页面列出的 Top-N（不穷举，加总不等于 globalVolume）——三者不可互相替代。geoHop 只报事实：第一大国家 ≠ 当前库时用同一 session 复查一次并附 result；显著与否（旧阈值 35%/<500 已移出脚本）由 AI 拿 share/volume 判。`
        : 'no --db：volume 已改用 globalVolume（volumeScope: "global"），kd/cpc/competition/results 这几个只有国家口径的字段置空（countryMetricsAvailable:false，理由见每行的 countryMetricsUnavailableReason）；renderedDb 是页面这次落地的国家，仅诊断，不代表可信的口径；geoHop 因为没有"当前国家"可比而不追查。要国家专属指标请显式传 --db。',
  retrievedAt: new Date().toISOString(),
  db,
  session,
  subscription: { expiry: launched.state.expiry, daysLeft: launched.state.daysLeft, warning: warn || null },
  automationWindow: automationWindowOutput(),
  results,
});
} finally {
  await launched.releaseBrowserLocks?.();
}
