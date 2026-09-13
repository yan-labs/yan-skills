/**
 * lib-semrush-overview.mjs — semrush-overview.mjs 的纯逻辑层（不碰浏览器，离线可测）。
 *
 * 两个证人，各管一件事：
 *   - **接口证人**（`/dpa/rpc` 的 JSON-RPC 响应体）给**结构化数据**：卡片数值、表格行、
 *     国家分布、趋势图逐点序列。接口数据比 DOM 规整得多，而且趋势图的逐点序列只在这里有。
 *   - **DOM 证人**（穿透 shadow DOM 的文本 token 流）只回答一个问题：**这个区块在页面上
 *     真的渲染出来了吗、渲染成了什么终态**（有数 / 合法空态 / 付费墙 / 仍是骨架）。
 *
 * 为什么两个都要：2026-09-13 实测，同一次加载里 20 条 `/dpa/rpc` 全部 200 且带完整数据，
 * **而页面主体一片空白**（报表模块没挂载）。只看接口会把一次没渲染的加载报成成功；
 * 只看 DOM 拿不到趋势序列。所以：接口有数、DOM 没渲染 ⇒ `not-rendered`（未完成），
 * 绝不是 `data`。
 *
 * 区块识别**只靠标题文字 + 位置**，不靠 class 名：Semrush 的类名是哈希化 CSS-modules
 * （`___SBox_w9nx7_gg_` 这种），每次发版都会变。判据写在 SECTION_SPECS 的注释里。
 *
 * 状态机（每个区块）：
 *   终态   data | empty | locked | absent
 *   非终态 loading | not-found | not-rendered | conflict
 * 任何一个区块停在非终态，整页 status 就是 `incomplete`。
 */

/* ------------------------------------------------------------------ *
 * 通用小工具
 * ------------------------------------------------------------------ */

/** 「23.8K」「1.6K」「4.9K」这种缩写还原成数字；认不出返回 null。 */
export function parseCompact(value) {
  const m = String(value ?? '').replace(/[,\s]/g, '').match(/^([\d.]+)([KMB])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  const n = Number(m[1]) * mult;
  return Number.isFinite(n) ? Math.round(n) : null;
}

/** 缩写数（1.1K）与精确数（1076）是否互相容得下：按缩写的显示精度给容差。 */
export function compactMatches(displayed, exact) {
  const shown = String(displayed ?? '').replace(/[,\s]/g, '');
  const value = parseCompact(shown);
  if (value === null || !Number.isFinite(Number(exact))) return null;
  const m = shown.match(/^([\d]+)(?:\.(\d+))?([KMB])?$/i);
  if (!m) return null;
  const unit = { k: 1e3, m: 1e6, b: 1e9 }[(m[3] || '').toLowerCase()] || 1;
  const decimals = m[2] ? m[2].length : 0;
  const tolerance = unit === 1 ? 0 : (unit / 10 ** decimals) / 2;
  return Math.abs(value - Number(exact)) <= tolerance + 1e-9;
}

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ *
 * 期望区块清单
 * ------------------------------------------------------------------ */

/**
 * 页面从上到下的区块清单。每个区块：
 *   key        输出里的键
 *   name       人读名称
 *   group      ai | seo | organic | ads | backlinks
 *   titles     DOM 里认标题用的**整 token** 正则（中文 UI 实测 + 英文 UI 同义写法）。
 *              判据：token 去空白后整串匹配，不做子串匹配——「反向链接」这种词在指标卡、
 *              侧栏、分节大标题里都出现，子串匹配必然串台。
 *   after      只在这个分组大标题之后找（解决同名标题：竞争排名图谱在自然/付费各一个，
 *              引荐域名在 SEO 卡片和反向链接分节各一个）。
 *   rpc        从接口证人取数的函数名（见 buildSectionData）；null = 只有 DOM 证人。
 *   locked     这个区块特有的付费墙文案。
 *   chart      图表类：DOM 上只认坐标轴刻度出现（占位的灰色正弦波没有刻度）。
 *   requires   「rendered」要求段内至少 min 个 token 匹配 pattern（默认：1 个含数字的 token）。
 *              为什么需要：SERP 分布圆环在骨架态时，段里照样有「1 个月」「6 个月」这种含数字的
 *              时间范围按钮；只认「有数字」会把骨架读成有数。
 *
 * ⚠️ 中文标题来自 2026-09-13 人工全页盘点；英文写法**未实测**，只是同义兜底。
 *    认不出的标题会让区块停在 `not-found`，整页 `incomplete`——失败是显式的。
 */
export const GROUP_HEADINGS = {
  organic: [/^自然搜索研究$/, /^Organic Research$/i],
  ads: [/^广告研究$/, /^Advertising Research$/i],
};

/**
 * 不在期望清单里、但确实是独立挂件的标题——只当**段落边界**用，防止它的内容被并进前一个区块。
 * 2026-09-13 复核实跑：广告研究分组里出现「文字广告样本」（本次为合法空态）。
 */
export const EXTRA_BOUNDARIES = [/^文字广告样本$/, /^Text Ad Samples$/i];

export const SECTION_SPECS = [
  { key: 'aiVisibility', name: 'AI 可见度卡片', group: 'ai', titles: [/^AI 可见度$/, /^AI Visibility$/i], rpc: 'aiVisibility', near: [/^提及$/, /^Mentions$/i] },
  { key: 'seo', name: 'SEO 卡片（8 宫格）', group: 'seo', titles: [/^Authority Score$/], rpc: 'seo' },
  { key: 'countries', name: '按国家/地区划分', group: 'ai', titles: [/^按国家\/地区划分$/, /^By Country$/i, /^Distribution by Country$/i], rpc: 'countries' },
  { key: 'aiCitationSources', name: '主要的引用来源', group: 'ai', titles: [/^主要的引用来源$/, /^Top Cited Sources$/i], rpc: 'aiCitationSources' },
  { key: 'serpDistribution', name: '谷歌 SERP 排名分布', group: 'seo', titles: [/^谷歌 ?SERP ?排名分布$/, /^SERP Distribution$/i], rpc: null, requires: { pattern: /^[\d.<]+%$/, min: 2 } },
  { key: 'trafficTrend', name: '流量趋势图', group: 'seo', titles: [/^品牌流量$/, /^Branded Traffic$/i], rpc: 'trafficTrend', chart: true, requires: { pattern: /^[\d.,]+[KMB]?$/i, min: 2 } },
  { key: 'keywordsTrend', name: '排名分布趋势图（关键词）', group: 'seo', titles: [/^排名前 ?3 ?名$/, /^Top 3$/i], rpc: 'keywordsTrend', chart: true, requires: { pattern: /^[\d.,]+[KMB]?$/i, min: 2 } },
  // 表格类区块：「已渲染」至少要 3 个含数字的 token（行里的排名/量/流量……）。区块段落被别的标题提前截断时
  // （2026-09-13 复核：只剩 ['498','关键词'] 两个 token），这条让它停在非终态，而不是带着一个空壳判 data。
  { key: 'topOrganicKeywords', name: '主要自然搜索关键词', group: 'organic', titles: [/^主要自然搜索关键词/, /^Top Organic Keywords/i], rpc: 'topOrganicKeywords', after: 'organic', requires: { pattern: /\d/, min: 3 } },
  { key: 'keyTopics', name: '关键主题', group: 'organic', titles: [/^关键主题$/, /^Key Topics$/i], rpc: 'keyTopics', after: 'organic', locked: [/^获取主题$/, /^Get topics$/i] },
  // ⚠️ 标题只许**开头锚定或全等**。旧版有一条 `/意图$/`（只锚结尾），会先抢到「主要自然搜索关键词」表里
  // 那个列头 token「意图」（它在真正的分组标题之前），于是「按意图」区块读成了关键词表的列头和首行、
  // 关键词表自己的段落被截短（2026-09-13 复核实跑：intent-crosscheck-mismatch，4 行全部 dom=null）。
  { key: 'intent', name: '按意图划分关键词', group: 'organic', titles: [/^按意图(筛选|划分的?)关键词$/, /^按意图/, /^Keywords by Intent$/i], rpc: 'intent', after: 'organic' },
  { key: 'organicPositionDistribution', name: '自然搜索排名分布', group: 'organic', titles: [/^自然搜索排名分布$/, /^Organic Position Distribution$/i], rpc: 'organicPositionDistribution', after: 'organic', requires: { pattern: /\d/, min: 2 } },
  { key: 'organicCompetitors', name: '主要自然搜索竞争对手', group: 'organic', titles: [/^主要自然搜索竞争对手/, /^Main Organic Competitors/i], rpc: 'organicCompetitors', after: 'organic', requires: { pattern: /\d/, min: 3 } },
  { key: 'organicPositioningMap', name: '竞争排名图谱（自然）', group: 'organic', titles: [/^竞争排名图谱$/, /^Competitive Positioning Map$/i], rpc: 'organicPositioningMap', after: 'organic', before: 'ads' },
  { key: 'topPaidKeywords', name: '主要付费关键词', group: 'ads', titles: [/^主要付费关键词/, /^Top Paid Keywords/i], rpc: 'topPaidKeywords', after: 'ads' },
  { key: 'paidPositionDistribution', name: '付费排名分布', group: 'ads', titles: [/^付费排名分布$/, /^Paid Position Distribution$/i], rpc: 'paidPositionDistribution', after: 'ads' },
  { key: 'paidCompetitors', name: '主要付费搜索竞争对手', group: 'ads', titles: [/^主要付费搜索竞争对手/, /^Main Paid Competitors/i], rpc: 'paidCompetitors', after: 'ads' },
  { key: 'paidPositioningMap', name: '竞争排名图谱（付费）', group: 'ads', titles: [/^竞争排名图谱$/, /^Competitive Positioning Map$/i], rpc: 'paidPositioningMap', after: 'ads' },
  // 反链明细的行里只有页面标题 / URL / 锚文本 / follow 标签，**一个数字都没有**（2026-09-13 实跑：整张表
  // 渲染完了，却因为默认「至少一个含数字的 token」判据被读成 loading）。改认 URL 形状的 token。
  { key: 'backlinksList', name: '反向链接明细', group: 'backlinks', titles: [/^引荐页面/, /^Referring Page/i], rpc: 'backlinksList', after: 'ads', requires: { pattern: /^https?:\/\/\S+$/i, min: 2 } },
  { key: 'followNofollow', name: 'Follow 和 NoFollow', group: 'backlinks', titles: [/^Follow ?和 ?NoFollow/i, /^Follow ?(vs\.?|and) ?Nofollow/i], rpc: 'followNofollow', after: 'ads' },
  { key: 'backlinkTypes', name: '反向链接类型', group: 'backlinks', titles: [/^反向链接类型$/, /^Backlink Types$/i], rpc: 'backlinkTypes', after: 'ads' },
  { key: 'topAnchors', name: '主要锚链接', group: 'backlinks', titles: [/^主要锚/, /^Top Anchors$/i], rpc: 'topAnchors', after: 'ads', requires: { pattern: /\d/, min: 3 } },
  { key: 'referringDomainsTable', name: '引荐域名表', group: 'backlinks', titles: [/^引荐域名$/, /^Referring Domains$/i], rpc: 'referringDomainsTable', after: 'ads', requires: { pattern: /\d/, min: 3 } },
  { key: 'indexedPages', name: '编入索引页面', group: 'backlinks', titles: [/^编入索引页面$/, /^Indexed Pages$/i], rpc: 'indexedPages', after: 'ads', requires: { pattern: /\d/, min: 3 } },
];

/**
 * 表格里常见的**列头 / 图例** token。任何区块标题正则都不许命中它们（测试逐条钉住）——
 * 反向链接明细是唯一的例外：它的真标题与分节大标题同名，只能认它的首列列头「引荐页面标题/引荐页面链接」。
 */
export const KNOWN_COLUMN_HEADERS = [
  '关键词', '意图', '排名', '搜索量', 'CPC (USD)', '流量', '流量 (%)', '域名', '反向链接', '锚链接', '锚文本/URL链接', '类型',
  '国家', '可见度', '提及', '根域名', 'IP / 国家', '标题和 URL', '竞争对手', '竞争程度', '共同关键词', 'SE 关键词',
  'Follow 链接', 'NoFollow 链接', '文本链接', '图像链接', '表格链接', '框架链接', '自然搜索', '付费', '自然流量', '付费流量',
  'Keyword', 'Intent', 'Position', 'Volume', 'Traffic', 'Domain', 'Backlinks', 'Anchor', 'Type', 'Country', 'Referring Domains Count',
];

/** 页面顶部 Tab 之类，本脚本明确不覆盖的内容（写进输出）。 */
export const NOT_COVERED = [
  { item: '顶部 Tab「增长审核」「按国家/地区进行比较」', reason: '不在本次范围：它们是另外的视图，要点击切换，属于别的报表。' },
  { item: '「按国家/地区划分」的「谷歌搜索」Tab 视图', reason: '默认 Tab 是「AI 搜索」；本脚本不点击。谷歌口径的国家流量从接口证人取（countries.data.google），DOM 只见证 AI 口径那张表。' },
  { item: '「关键主题」付费墙后的完整主题列表', reason: '点「获取主题」会额外消耗配额，本脚本不点；只记录锁定态与模糊预览。' },
  { item: '各表格「查看详情」后的完整分页', reason: '概览页只展示前 5 行左右；完整表走 semrush-report.mjs。' },
  { item: '趋势图时间粒度切换（1/6 个月、1/2 年、全部；天/月）', reason: '不点击。接口证人在默认加载里已经给了日粒度与月粒度两条序列，原样输出。' },
  { item: '关键词排名分布趋势的 11 个分桶含义', reason: '接口字段 organicPositionsTrend 是 11 个无标签整数，图例只有 7 项，对应关系未实测，原样输出不做标注。' },
  { item: '谷歌 SERP 排名分布的逐项数值', reason: '没有识别出对应的接口响应，只从 DOM 读百分比文本（dataSource: dom）。' },
  { item: '自然 / 付费排名分布的档位标签', reason: '接口给了 11 档原始计数（合计与总数对账），但 11 档与图上「1-3 / 4-10 / …」档位的对应关系未实测，输出 bucketLabelsVerified:false。' },
  { item: '广告研究里的「文字广告样本」', reason: '2026-09-13 复核实跑首次见到，不在期望清单里；只当段落边界识别（EXTRA_BOUNDARIES），防止它的内容并进前一个区块，不抓取。' },
];

/* ------------------------------------------------------------------ *
 * 接口证人：JSON-RPC 响应分类
 * ------------------------------------------------------------------ */

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const has = (o, ...keys) => isObj(o) && keys.every((k) => Object.prototype.hasOwnProperty.call(o, k));
const first = (arr) => (Array.isArray(arr) && arr.length ? arr[0] : null);

/**
 * 把一条 JSON-RPC `result` 按**字段形状**归类。响应里没有方法名（CDP 捕获只给响应体），
 * id 是每次加载的自增序号、不稳定，所以只能认形状。判据全部是**字段名的组合**，
 * 每条都来自 2026-09-13 实测的真实响应。
 */
export function classifyRpcResult(result) {
  if (Array.isArray(result)) {
    const f = first(result);
    if (!f) return 'empty-array';
    if (has(f, 'currencyCode', 'rate')) return 'meta:currencies';
    if (has(f, 'code', 'searchEngine')) return 'meta:databases';
    if (has(f, 'database', 'mentions', 'visibility')) return 'aiCountries';
    if (has(f, 'database', 'organicTraffic', 'rank')) return 'googleCountries';
    if (has(f, 'date', 'organicTraffic', 'adwordsTraffic')) return 'trend';
    // 付费关键词与自然关键词共用大部分字段；付费行多出广告位 / 广告文案字段（2026-09-14 数据丰富站点实测：
    // adwordBlock / title / description / visibleUrl / hiddenUrl / uniqHash），自然行没有。先认付费。
    if (has(f, 'phrase', 'position') && (has(f, 'adwordBlock') || has(f, 'visibleUrl'))) return 'paidKeywords';
    if (has(f, 'phrase', 'position', 'trafficPercent')) return 'topKeywords';
    if (has(f, 'domain', 'commonKeywords', 'organicTraffic')) return 'organicCompetitors';
    // 实测这是「主要付费搜索竞争对手」的查询：commonKeywords = 共同付费关键词，adwordsPositions = 付费关键词数，
    // traffic = 付费流量；competitionLvl=100 的那行是目标域名自己。kind 名保留旧拼写以兼容调用方。
    if (has(f, 'domain', 'commonKeywords')) return 'competitorRowsWithoutTraffic';
    return 'unknown-array';
  }
  if (typeof result === 'number') return 'count';
  if (!isObj(result)) return 'unknown';
  if (has(result, 'ai_visibility', 'mention_stats')) return 'aiVisibility';
  if (has(result, 'sources') && Array.isArray(result.sources)) return 'aiSources';
  if (has(result, 'anchors', 'referralDomains')) return 'backlinksOverview';
  if (has(result, 'authorityScore', 'linkPower')) return 'authoritySummary';
  if (has(result, 'keyword', 'position', 'totalPositions')) return 'serpFeatureCounts';
  // 关键主题解锁后的完整数据（实测结构：target{database,date,…} + topics[]{name,keywords_count,traffic,volume,pages[]}）。
  if (has(result, 'topics', 'target') && Array.isArray(result.topics)) return 'keyTopicsData';
  if (has(result, 'status') && Object.keys(result).length === 1) return 'keyTopicsStatus';
  if (has(result, 'daily', 'monthly')) return 'meta:dates';
  if (has(result, 'isTrialAllowed')) return 'meta:permissions';
  if (has(result, 'isRootDomain')) return 'meta:rootDomain';
  return 'unknown';
}

/**
 * 把捕获到的网络条目（opencli `network --raw` 的 entries，或页内钩子的记录）摊平成
 * `[{ id, kind, result, next }]`。批量请求的响应体是 JSON-RPC 数组，**数组里紧跟在
 * 列表后面的整数是该列表的总数**（实测：竞争对手 6 行 + 331），所以保留 `next`。
 * 同一个响应体被两个证人各抓一次时按内容去重。
 */
export function flattenRpc(entries) {
  const out = [];
  const seen = new Set();
  // 同一响应体第二次出现（例如 CDP 那份先到、钩子那份带请求摘要后到）时，把 method / requestParams 回填到已产出的条目。
  const bySignature = new Map();
  const reqMapOf = (entry) => new Map((Array.isArray(entry?.req) ? entry.req : []).map((q) => [q?.id, q]));
  for (const entry of entries || []) {
    if (!/\/dpa\/rpc/.test(String(entry?.url || ''))) continue;
    let body = entry.body;
    // 扩展端在 Network.getResponseBody 返回 base64Encoded 时存成 `base64:<...>`，CLI 不解码。
    if (typeof body === 'string' && body.startsWith('base64:')) {
      try { body = Buffer.from(body.slice(7), 'base64').toString('utf8'); } catch { continue; }
    }
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { continue; } }
    if (body == null) continue;
    const items = Array.isArray(body) ? body : [body];
    const signature = JSON.stringify(body);
    const reqById = reqMapOf(entry);
    if (seen.has(signature)) {
      if (reqById.size) {
        for (const prior of bySignature.get(signature) || []) {
          const q = reqById.get(prior.id);
          if (q && prior.method == null) { prior.method = q.method ?? null; prior.requestParams = q.params ?? null; }
        }
      }
      continue;
    }
    seen.add(signature);
    const produced = [];
    items.forEach((item, index) => {
      if (!isObj(item) || !Object.prototype.hasOwnProperty.call(item, 'result')) return;
      const nextItem = items[index + 1];
      const q = reqById.get(item.id);
      const rec = {
        id: item.id ?? null,
        kind: classifyRpcResult(item.result),
        result: item.result,
        next: isObj(nextItem) ? nextItem.result : undefined,
        timestamp: entry.timestamp ?? null,
        // 证据字段（新增，不参与判定）：请求体白名单摘要里的方法名与口径参数。
        method: q?.method ?? null,
        requestParams: q?.params ?? null,
      };
      out.push(rec);
      produced.push(rec);
    });
    bySignature.set(signature, produced);
  }
  return out;
}

const pickKind = (rpc, kind) => rpc.filter((r) => r.kind === kind);

/** 日粒度 vs 月粒度：相邻两点的日期差。 */
function trendGranularity(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return 'unknown';
  const d = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(4, 6)) - 1, Number(s.slice(6, 8)));
  const gap = (d(rows[rows.length - 1].date) - d(rows[rows.length - 2].date)) / 86400000;
  return gap <= 1.5 ? 'daily' : 'monthly';
}

/** 所有趋势序列（不挑）。每条：{ granularity, rows（按日期升序）, latest }。 */
function trendSeriesAll(rpc) {
  return pickKind(rpc, 'trend').map((r) => {
    const rows = [...r.result].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return { granularity: trendGranularity(rows), rows, latest: rows[rows.length - 1] || null };
  });
}

/**
 * 按口径挑趋势序列。**同一次加载里有两套趋势**（2026-09-13 实跑缓存：页面级一套的最新点关键词数 /
 * 自然流量与 SEO 卡片显示值一致；研究分组级一套的最新点恰好等于分组徽标国家的国家行）。
 * 旧版只按行数挑，两套行数一样，于是随机拿到其中一套——页面级口径证人读成了 DE。
 *   positionsTarget === undefined  没给口径：只有一种最新关键词数时才返回，否则 {}（不猜）
 *   positionsTarget === null       明确对不上：{}
 *   positionsTarget 为数           最新点 positions 等于它的那套
 */
/** 一套趋势的身份：最新点的「关键词数 | 自然流量」。日粒度与月粒度同属一套时最新点相同。 */
const trendKeyOf = (latest) => `${Number(latest?.positions)}|${Number(latest?.organicTraffic)}`;

function trendSeries(rpc, positionsTarget = undefined) {
  const all = trendSeriesAll(rpc).filter((s) => s.latest);
  const keysOf = (list) => new Set(list.map((s) => trendKeyOf(s.latest)));
  let chosen;
  if (positionsTarget === undefined) {
    chosen = keysOf(all).size === 1 ? all : [];
  } else if (positionsTarget === null) {
    chosen = [];
  } else if (typeof positionsTarget === 'object') {
    // 复合键：关键词数 + 自然流量都要对上。
    chosen = all.filter((s) => Number(s.latest.positions) === Number(positionsTarget.positions)
      && Number(s.latest.organicTraffic) === Number(positionsTarget.organicTraffic));
  } else {
    // 只给了关键词数（旧调用方式）：若它对上了**不止一套**（关键词数撞车），不挑——返回空，而不是按数组顺序挑一套。
    const byPositions = all.filter((s) => Number(s.latest.positions) === Number(positionsTarget));
    chosen = keysOf(byPositions).size === 1 ? byPositions : [];
  }
  const series = {};
  for (const s of chosen) {
    if (!series[s.granularity] || series[s.granularity].length < s.rows.length) series[s.granularity] = s.rows;
  }
  return series;
}

const latestTrendRow = (series) => {
  const rows = series.daily || series.monthly || null;
  return rows && rows.length ? rows[rows.length - 1] : null;
};

/**
 * 趋势口径上下文（纯函数）：
 *   pagePositions     页面级那套的最新关键词数 —— 最新点与 SEO 卡片 DOM 显示的「自然搜索关键词」「自然流量」
 *                     都对得上（按缩写精度容差）；卡片没渲染时只有一种序列才采用
 *   organicPositions  研究分组那套 —— 最新点 positions 等于分组徽标国家的国家行；没有徽标时只有一种序列才采用
 * 对不上就是 null：相关区块不用接口数据（退回 DOM），也不拿它当口径证人。
 */
export function trendContext(rpc, domSections = {}, groupBadges = {}) {
  const all = trendSeriesAll(rpc);
  // 用复合键去重（checker 2026-09-13 第二轮：只按关键词数去重时，两套序列关键词数撞车会静默丢掉一套）。
  const latestPairs = [...new Map(all.filter((s) => s.latest).map((s) => [trendKeyOf(s.latest), s.latest])).values()];
  const asKey = (l) => ({ positions: Number(l.positions), organicTraffic: Number(l.organicTraffic) });
  const card = domSections?.seo?.state === 'rendered' ? readSeoCard(domSections.seo.content || []) : null;
  const kwShown = card?.raw?.organicKeywords?.value ?? null;
  const trafficShown = card?.raw?.organicTraffic?.value ?? null;
  const ambiguityReasons = [];

  // 页面级：先按卡片关键词数找；多于一套再用卡片自然流量区分；仍多于一套 ⇒ 歧义，不猜。
  let pageKey = null;
  let pageSource = null;
  let pageAmbiguous = false;
  if (kwShown) {
    // 卡片「自然流量」显示的是 `traffic`（自然 + SERP 精选），不是 `organicTraffic`——小站两者几乎相等看不出来，
    // 数据丰富站点上相差近一成（2026-09-14 实测），只比 organicTraffic 会把页面级序列判成对不上。
    const cardTrafficOf = (l) => (l.traffic ?? l.organicTraffic);
    let hits = latestPairs.filter((l) => compactMatches(kwShown, l.positions));
    if (hits.length > 1 && trafficShown != null) hits = hits.filter((l) => compactMatches(trafficShown, cardTrafficOf(l)));
    else if (hits.length === 1 && trafficShown != null && compactMatches(trafficShown, cardTrafficOf(hits[0])) === false) hits = [];
    if (hits.length === 1) { pageKey = asKey(hits[0]); pageSource = 'seo-card'; }
    else if (hits.length > 1) {
      pageAmbiguous = true;
      ambiguityReasons.push(`page: ${hits.length} trend series match the SEO card keywords ${kwShown}${trafficShown == null ? ' and the card traffic is not readable' : ` and traffic ${trafficShown}`}`);
    }
  } else if (latestPairs.length === 1) {
    pageKey = asKey(latestPairs[0]); pageSource = 'single-series';
  }

  // 研究分组：分组徽标国家的国家行——先按关键词数找，多于一套再用国家行的自然流量区分。
  const badges = [...new Set(groupBadges?.organic?.values || [])];
  let organicKey = null;
  let organicSource = null;
  let organicAmbiguous = false;
  if (badges.length === 1) {
    const dbRows = pickKind(rpc, 'googleCountries').flatMap((r) => r.result || []).filter((x) => x?.database === badges[0]);
    let hits = latestPairs.filter((l) => dbRows.some((x) => Number(x.positions) === Number(l.positions)));
    if (hits.length > 1) {
      hits = hits.filter((l) => dbRows.some((x) => Number(x.positions) === Number(l.positions) && Number(x.organicTraffic) === Number(l.organicTraffic)));
    }
    if (hits.length === 1) { organicKey = asKey(hits[0]); organicSource = `country-row:${badges[0]}`; }
    else if (hits.length > 1) {
      organicAmbiguous = true;
      ambiguityReasons.push(`organic: ${hits.length} trend series match the ${badges[0]} country row on keywords and traffic`);
    }
  } else if (!badges.length && latestPairs.length === 1) {
    organicKey = asKey(latestPairs[0]); organicSource = 'single-series';
  }
  return {
    pagePositions: pageKey ? pageKey.positions : null, pageKey, pageSource, pageAmbiguous,
    organicPositions: organicKey ? organicKey.positions : null, organicKey, organicSource, organicAmbiguous,
    ambiguityReasons,
    series: latestPairs.map((l) => ({ positions: l.positions, organicTraffic: l.organicTraffic, date: l.date })),
    cardKeywordsShown: kwShown, cardTrafficShown: trafficShown,
  };
}

/**
 * 轻量版（给只拿得到 `document.body.innerText` 的调用方，例如批量脚本）：把 innerText 按行切成 token，
 * 截取「Authority Score」之后的 SEO 卡片那一段，交给 trendContext。卡片不在文本里时等价于没有卡片。
 */
export function trendContextFromText(rpc, bodyText, groupBadges = {}) {
  const lines = String(bodyText ?? '').split(/\n+/).map((l) => norm(l)).filter(Boolean);
  const at = lines.findIndex((l) => /^Authority Score$/.test(l));
  if (at < 0) return trendContext(rpc, {}, groupBadges);
  const stop = lines.findIndex((l, i) => i > at && /^(按国家\/地区划分|By Country|AI 搜索|谷歌搜索)$/i.test(l));
  const content = lines.slice(at + 1, stop > at ? stop : at + 40);
  return trendContext(rpc, { seo: { state: 'rendered', content } }, groupBadges);
}

/**
 * 每个区块从接口证人拿到的数据。返回 `{ data, rpcKinds, hasData }`：
 *   hasData=false 表示接口里**没有**这个区块能用的非空数据（可能是真空，也可能是没抓到）。
 */
/**
 * 「形状相同的多条响应」安全路径（纯函数）。自然 / 付费的关键词表、竞争对手表在接口里很可能同形
 * （审计结论：分类器只认字段组合，付费关键词会被归成 topKeywords，付费竞争对手可能被归成 organicCompetitors）。
 * 在拿到方法名证据之前：
 *   只有一条（去重后）            ⇒ 照旧取它（样本站只有一条，不受影响）
 *   多条，且恰好一条的前几行标签  ⇒ 取它（resolvedBy: 'dom-rows'）——标签（关键词 / 域名）全部出现在该区块的 DOM 段里
 *   多条，DOM 认不出或不止一条对得上 ⇒ ambiguous：不取，由调用方判非终态（ambiguous-organic-vs-paid）
 */
export function resolveSameShape(items, labelsOf, domContent, { methodPrefix = null } = {}) {
  let distinct = [...new Map((items || []).map((r) => [JSON.stringify(r.result), r])).values()];
  // 主判据：请求体里的 JSON-RPC 方法名（2026-09-14 实测：自然 `organic.*`、付费 `adwords.*`）。
  // DOM 行只做交叉校验——被选那条的首行标签不在 DOM、而另一条的首行在，才判冲突。
  if (methodPrefix && distinct.some((r) => r.method)) {
    const byMethod = distinct.filter((r) => String(r.method || '').startsWith(methodPrefix));
    if (byMethod.length === 1) {
      const chosen = byMethod[0];
      if (domContent && distinct.length > 1) {
        const dom = new Set(domContent.map((t) => norm(t)));
        const firstLabel = (r) => norm((labelsOf(r.result) || []).filter(Boolean)[0] || '');
        const chosenIn = Boolean(firstLabel(chosen)) && dom.has(firstLabel(chosen));
        const otherIn = distinct.some((r) => r !== chosen && firstLabel(r) && dom.has(firstLabel(r)));
        if (!chosenIn && otherIn) {
          return {
            item: null, resolvedBy: null,
            ambiguous: { candidates: distinct.length, domFits: 0, methods: distinct.map((r) => r.method ?? null), reason: `method selects ${chosen.method}, but the DOM rows match a different response` },
          };
        }
      }
      return { item: chosen, ambiguous: null, resolvedBy: 'method' };
    }
    if (byMethod.length === 0 && distinct.every((r) => r.method)) return { item: null, ambiguous: null, resolvedBy: null };
    if (byMethod.length > 1) distinct = byMethod;
  }
  if (distinct.length <= 1) return { item: distinct[0] || null, ambiguous: null, resolvedBy: null };
  const dom = new Set((domContent || []).map((t) => norm(t)));
  const fits = distinct.filter((r) => {
    const labels = (labelsOf(r.result) || []).filter(Boolean).slice(0, 3).map((l) => norm(l));
    return labels.length > 0 && labels.every((l) => dom.has(l));
  });
  if (fits.length === 1) return { item: fits[0], ambiguous: null, resolvedBy: 'dom-rows' };
  return {
    item: null,
    resolvedBy: null,
    ambiguous: {
      candidates: distinct.length,
      domFits: fits.length,
      methods: distinct.map((r) => r.method ?? null),
      reason: fits.length ? `${fits.length} same-shape responses match the section rows in the DOM` : 'no same-shape response can be matched to the section rows in the DOM',
    },
  };
}

export function buildSectionData(key, rpc, ctx = {}) {
  const one = (kind) => pickKind(rpc, kind)[0] || null;
  switch (key) {
    case 'aiVisibility': {
      const r = one('aiVisibility');
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      const stats = r.result.mention_stats || [];
      return {
        rpcKinds: ['aiVisibility'],
        hasData: true,
        data: {
          visibility: r.result.ai_visibility,
          visibilityBenchmark: r.result.ai_visibility_benchmark ?? null,
          mentions: stats.reduce((s, x) => s + (Number(x.mentions_count) || 0), 0),
          citedPages: r.result.cited_pages,
          byPlatform: stats.map((x) => ({ platform: x.llm, mentions: x.mentions_count, citedPages: x.cited_pages, selfMentions: x.self_mentions_count })),
        },
      };
    }
    case 'seo': {
      const auth = one('authoritySummary');
      const latest = latestTrendRow(trendSeries(rpc, ctx.pageKey ?? ctx.pagePositions));
      if (!auth && !latest) return { data: null, rpcKinds: [], hasData: false };
      return {
        rpcKinds: [auth && 'authoritySummary', latest && 'trend'].filter(Boolean),
        hasData: true,
        data: {
          authorityScore: auth?.result.authorityScore ?? null,
          backlinks: auth?.result.backlinks ?? null,
          referringDomains: auth?.result.referringDomains ?? null,
          referringIPs: auth?.result.referringIPs ?? null,
          linkPower: auth?.result.linkPower ?? null,
          naturalness: auth?.result.naturalness ?? null,
          // 与卡片「自然流量」同口径（traffic，含 SERP 精选流量）；不含精选的那一口径另给。
          organicTraffic: latest?.traffic ?? latest?.organicTraffic ?? null,
          organicTrafficExclSerpFeatures: latest?.organicTraffic ?? null,
          organicKeywords: latest?.positions ?? null,
          paidTraffic: latest?.adwordsTraffic ?? null,
          paidKeywords: latest?.adwordsPositions ?? null,
          brandedTraffic: latest?.trafficBranded ?? null,
          organicTrafficCost: latest?.organicTrafficCost ?? null,
          latestDate: latest?.date ?? null,
        },
      };
    }
    case 'countries': {
      const ai = one('aiCountries');
      const google = pickKind(rpc, 'googleCountries').map((r) => r.result);
      if (!ai && !google.length) return { data: null, rpcKinds: [], hasData: false };
      return {
        rpcKinds: [ai && 'aiCountries', google.length && 'googleCountries'].filter(Boolean),
        hasData: Boolean((ai && ai.result.length) || google.some((g) => g.length)),
        data: {
          ai: ai ? [...ai.result].sort((a, b) => b.visibility - a.visibility || b.mentions - a.mentions) : null,
          // 实测同一次加载有两份形状相同的国家流量列表（行数不同，含 mobile-* 库）；
          // 口径差异未实测，两份都原样给出，不替它选。
          google: google.map((rows) => [...rows].sort((a, b) => (b.organicTraffic || 0) - (a.organicTraffic || 0))),
        },
      };
    }
    case 'aiCitationSources': {
      const r = one('aiSources');
      return r ? { rpcKinds: ['aiSources'], hasData: r.result.sources.length > 0, data: r.result.sources.map((s) => ({ domain: s.domain, mentions: s.mentions_count })) } : { data: null, rpcKinds: [], hasData: false };
    }
    case 'trafficTrend': {
      const s = trendSeries(rpc, ctx.pageKey ?? ctx.pagePositions);
      const map = (rows) => rows.map((x) => ({ date: x.date, organicTraffic: x.traffic ?? x.organicTraffic, organicTrafficExclSerpFeatures: x.organicTraffic, paidTraffic: x.adwordsTraffic, brandedTraffic: x.trafficBranded, nonBrandedTraffic: x.trafficNonBranded }));
      if (!s.daily && !s.monthly) return { data: null, rpcKinds: [], hasData: false };
      return { rpcKinds: ['trend'], hasData: true, data: { daily: s.daily ? map(s.daily) : null, monthly: s.monthly ? map(s.monthly) : null } };
    }
    case 'keywordsTrend': {
      const s = trendSeries(rpc, ctx.pageKey ?? ctx.pagePositions);
      const map = (rows) => rows.map((x) => ({ date: x.date, organicKeywords: x.positions, paidKeywords: x.adwordsPositions, aiOverviewPositions: x.aiOverviewPositions, serpFeaturesPositions: x.serpFeaturesPositions, organicPositionsTrend: x.organicPositionsTrend, adwordsPositionsTrend: x.adwordsPositionsTrend }));
      if (!s.daily && !s.monthly) return { data: null, rpcKinds: [], hasData: false };
      return { rpcKinds: ['trend'], hasData: true, data: { daily: s.daily ? map(s.daily) : null, monthly: s.monthly ? map(s.monthly) : null } };
    }
    case 'topOrganicKeywords': {
      const picked = resolveSameShape(pickKind(rpc, 'topKeywords'), (res) => res.map((x) => x.phrase), ctx.domSections?.topOrganicKeywords?.content, { methodPrefix: 'organic.' });
      if (picked.ambiguous) return { data: null, rpcKinds: ['topKeywords'], hasData: false, ambiguous: picked.ambiguous };
      const r = picked.item;
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      return {
        rpcKinds: ['topKeywords'],
        resolvedBy: picked.resolvedBy,
        hasData: r.result.length > 0,
        data: r.result.map((x) => ({
          keyword: x.phrase, position: x.position, previousPosition: x.previousPosition, volume: x.volume ?? null,
          cpc: x.cpc, keywordDifficulty: x.keywordDifficulty, traffic: x.traffic, trafficPercent: x.trafficPercent,
          trafficCost: x.trafficCost, intents: x.intents, url: x.url ?? null,
        })),
      };
    }
    case 'topPaidKeywords': {
      // 付费关键词：先认付费特有字段归出来的 kind；万一某次响应没带那些字段，再认方法名 adwords.* 的同形响应。
      const candidates = [...pickKind(rpc, 'paidKeywords'), ...pickKind(rpc, 'topKeywords').filter((x) => String(x.method || '').startsWith('adwords.'))];
      const picked = resolveSameShape(candidates, (res) => res.map((x) => x.phrase), ctx.domSections?.topPaidKeywords?.content, { methodPrefix: 'adwords.' });
      if (picked.ambiguous) return { data: null, rpcKinds: ['paidKeywords'], hasData: false, ambiguous: picked.ambiguous };
      const r = picked.item;
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      return {
        rpcKinds: [r.kind],
        resolvedBy: picked.resolvedBy,
        hasData: r.result.length > 0,
        data: r.result.map((x) => ({
          keyword: x.phrase, position: x.position, previousPosition: x.previousPosition ?? null, volume: x.volume ?? null,
          cpc: x.cpc ?? null, traffic: x.traffic ?? null, trafficPercent: x.trafficPercent ?? null, trafficCost: x.trafficCost ?? null,
          url: x.url ?? null, visibleUrl: x.visibleUrl ?? null, adTitle: x.title ?? null, adDescription: x.description ?? null, adBlock: x.adwordBlock ?? null,
        })),
      };
    }
    case 'paidCompetitors':
    case 'paidPositioningMap': {
      const picked = resolveSameShape(
        pickKind(rpc, 'competitorRowsWithoutTraffic'),
        (res) => res.filter((x) => Number(x.competitionLvl) !== 100).map((x) => x.domain),
        ctx.domSections?.[key]?.content,
      );
      if (picked.ambiguous) return { data: null, rpcKinds: ['competitorRowsWithoutTraffic'], hasData: false, ambiguous: picked.ambiguous };
      const r = picked.item;
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      const all = r.result.map((x) => ({
        domain: x.domain, competitionLevel: x.competitionLvl, commonKeywords: x.commonKeywords, paidKeywords: x.adwordsPositions,
        paidTraffic: x.traffic, paidTrafficCost: x.trafficCost, organicKeywords: x.organicPositions, isTarget: Number(x.competitionLvl) === 100,
      }));
      const rows = all.filter((x) => !x.isTarget);
      if (key === 'paidPositioningMap') {
        return { rpcKinds: ['competitorRowsWithoutTraffic'], resolvedBy: picked.resolvedBy, hasData: rows.length > 0, data: all.map((x) => ({ domain: x.domain, x: x.paidKeywords, y: x.paidTraffic, isTarget: x.isTarget })) };
      }
      return { rpcKinds: ['competitorRowsWithoutTraffic'], resolvedBy: picked.resolvedBy, hasData: rows.length > 0, data: { total: typeof r.next === 'number' ? r.next : null, rows } };
    }
    case 'organicPositionDistribution':
    case 'paidPositionDistribution': {
      // 研究分组那套趋势最新点的排名直方图：organicPositionsTrend / adwordsPositionsTrend 各 11 档，
      // 合计恰等于 organicPositions / adwordsPositions（2026-09-14 实测逐位相等）。
      // ⚠️ 11 档与图上档位（1-3 / 4-10 / …）的对应关系**未实测**：原样给出并标 bucketLabelsVerified:false。
      const latest = latestTrendRow(trendSeries(rpc, ctx.organicKey ?? ctx.organicPositions));
      const field = key === 'organicPositionDistribution' ? 'organicPositionsTrend' : 'adwordsPositionsTrend';
      const totalField = key === 'organicPositionDistribution' ? 'organicPositions' : 'adwordsPositions';
      const buckets = latest?.[field];
      if (!Array.isArray(buckets)) return { data: null, rpcKinds: [], hasData: false };
      const total = buckets.reduce((s, v) => s + (Number(v) || 0), 0);
      return {
        rpcKinds: ['trend'],
        hasData: total > 0,
        data: { date: latest.date, buckets: [...buckets], total, reportedTotal: latest[totalField] ?? null, totalMatches: Number(latest[totalField]) === total, bucketLabelsVerified: false },
      };
    }
    case 'keyTopics': {
      const full = one('keyTopicsData');
      if (full) {
        const t = full.result;
        const topics = (t.topics || []).map((x) => ({
          name: x.name, keywords: x.keywords_count ?? null, traffic: x.traffic ?? null, volume: x.volume ?? null, pages: Array.isArray(x.pages) ? x.pages.length : null,
        }));
        return { rpcKinds: ['keyTopicsData'], hasData: topics.length > 0, data: { status: t.status ?? null, date: t.target?.date ?? null, database: t.target?.database ?? null, topics } };
      }
      const r = one('keyTopicsStatus');
      return r ? { rpcKinds: ['keyTopicsStatus'], hasData: false, data: { status: r.result.status } } : { data: null, rpcKinds: [], hasData: false };
    }
    case 'intent': {
      // 「按意图」挂件画在自然搜索研究分组里，取研究分组那套趋势（不是页面级那套）。
      const latest = latestTrendRow(trendSeries(rpc, ctx.organicKey ?? ctx.organicPositions));
      if (!latest) return { data: null, rpcKinds: [], hasData: false };
      const names = ['Informational', 'Navigational', 'Commercial', 'Transactional', 'Unknown'];
      const rows = names.map((n) => ({ intent: n.toLowerCase(), keywords: latest[`intent${n}Positions`] ?? 0, traffic: latest[`intent${n}Traffic`] ?? 0 }));
      const total = rows.reduce((s, x) => s + x.keywords, 0);
      return { rpcKinds: ['trend'], hasData: total > 0, data: rows.map((x) => ({ ...x, keywordShare: total ? Math.round((x.keywords / total) * 1000) / 10 : null })) };
    }
    case 'organicCompetitors':
    case 'organicPositioningMap': {
      const picked = resolveSameShape(pickKind(rpc, 'organicCompetitors'), (res) => res.map((x) => x.domain), ctx.domSections?.[key]?.content);
      if (picked.ambiguous) return { data: null, rpcKinds: ['organicCompetitors'], hasData: false, ambiguous: picked.ambiguous };
      const r = picked.item;
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      const rows = r.result.map((x) => ({ domain: x.domain, commonKeywords: x.commonKeywords, competitionLevel: x.competitionLvl, organicKeywords: x.organicPositions, organicTraffic: x.organicTraffic, seKeywords: x.positions }));
      if (key === 'organicPositioningMap') {
        return { rpcKinds: ['organicCompetitors'], resolvedBy: picked.resolvedBy, hasData: rows.length > 0, data: rows.map((x) => ({ domain: x.domain, x: x.organicKeywords, y: x.organicTraffic })) };
      }
      return { rpcKinds: ['organicCompetitors'], resolvedBy: picked.resolvedBy, hasData: rows.length > 0, data: { total: typeof r.next === 'number' ? r.next : null, rows } };
    }
    case 'backlinksList':
    case 'followNofollow':
    case 'backlinkTypes':
    case 'topAnchors':
    case 'referringDomainsTable':
    case 'indexedPages': {
      const r = one('backlinksOverview');
      if (!r) return { data: null, rpcKinds: [], hasData: false };
      const b = r.result;
      const pickers = {
        backlinksList: () => (b.backlinks || []).map((x) => ({ sourceTitle: x.sourceTitle, sourceUrl: x.sourceURL, anchor: x.anchor, targetUrl: x.targetURL, nofollow: x.nofollow })),
        followNofollow: () => ({ follow: b.follow, nofollow: b.nofollow }),
        backlinkTypes: () => ({ text: b.texts, image: b.images, form: b.forms, frame: b.frames, total: b.total }),
        topAnchors: () => (b.anchors || []).map((x) => ({ anchor: x.anchor, domains: x.domains, backlinks: x.backlinks })),
        referringDomainsTable: () => (b.referralDomains || []).map((x) => ({ domain: x.domain, ip: x.ip, country: x.country, backlinks: x.backlinks })),
        indexedPages: () => (b.pages || []).map((x) => ({ title: x.sourceTitle, url: x.sourceURL, domains: x.domains, backlinks: x.backlinks })),
      };
      const data = pickers[key]();
      const nonEmpty = Array.isArray(data) ? data.length > 0 : Object.values(data).some((v) => Number(v) > 0);
      return { rpcKinds: ['backlinksOverview'], hasData: nonEmpty, data };
    }
    default:
      return { data: null, rpcKinds: [], hasData: false };
  }
}

/* ------------------------------------------------------------------ *
 * DOM 证人：token 流切段 + 区块渲染态
 * ------------------------------------------------------------------ */

/** 概览页里到处都是、本身不构成「有内容」证据的界面文案。 */
const UI_NOISE = /^(Sortable|按“Tab”启用图形图表访问模块。|Press "Tab" to .*|导出|Export|查看详情|View details|View full report|查看完整报告|备注|Notes|全世界|Worldwide|全部时间|All time)$/i;

/** 合法空态（实测中文：「未找到任何数据」+「尝试更改筛选器」）。 */
export const EMPTY_STATE = /^(未找到任何数据|没有数据|暂无数据|我们没有要显示的数据。?|No data found|Nothing found|We have no data to show)/i;

/** 通用付费墙文案（区块专属的写在 spec.locked）。 */
export const GENERIC_LOCKED = /^(升级|立即升级|解锁|Upgrade|Unlock)/i;

/**
 * 在 token 流里定位所有区块标题。token 是页面侧按**合成树（含 shadow root、按 slot 展开）
 * 深度优先顺序**吐出来的非空文本节点，已经排除了侧栏导航（`snav-*`）与页脚。
 *
 * 规则：
 *   1. 标题 token 必须整串匹配 spec.titles 之一；
 *   2. 有 `after` 的区块只在对应分组大标题之后找；有 `before` 的只在它之前找；
 *   3. 同一个 token 只能归一个区块（按 SECTION_SPECS 顺序先到先得）——
 *      「竞争排名图谱」第一次出现归自然、广告研究之后那次归付费；
 *   4. `near`：标题后 12 个 token 内必须出现这些词之一（AI 可见度卡片与侧栏同名项区分）。
 */
export function locateSections(tokens) {
  const texts = tokens.map((t) => norm(Array.isArray(t) ? t[0] : t));
  const groupIndex = {};
  for (const [group, patterns] of Object.entries(GROUP_HEADINGS)) {
    const i = texts.findIndex((t) => patterns.some((p) => p.test(t)));
    groupIndex[group] = i >= 0 ? i : null;
  }
  const taken = new Set();
  const found = {};
  // 同组单调：页面上同一分组的挂件按 SECTION_SPECS 顺序排列（多次实跑的 token 流一致）。组内后面的区块
  // 只在前面已定位区块的标题之后找——前一个表格里的列头再像，也抢不到后面区块的标题位。
  const groupLast = {};
  for (const spec of SECTION_SPECS) {
    const groupLower = spec.after ? groupIndex[spec.after] : -1;
    const upper = spec.before ? groupIndex[spec.before] : null;
    if (spec.after && groupLower === null) { found[spec.key] = null; continue; }
    const lower = Math.max(groupLower, groupLast[spec.group] ?? -1);
    let hit = null;
    for (let i = lower + 1; i < texts.length; i += 1) {
      if (upper !== null && upper !== undefined && i >= upper) break;
      if (taken.has(i)) continue;
      if (!spec.titles.some((p) => p.test(texts[i]))) continue;
      if (spec.near && !texts.slice(i + 1, i + 13).some((t) => spec.near.some((p) => p.test(t)))) continue;
      hit = i;
      break;
    }
    if (hit !== null) { taken.add(hit); groupLast[spec.group] = hit; }
    found[spec.key] = hit;
  }
  const extraBoundaries = [];
  texts.forEach((t, i) => { if (!taken.has(i) && EXTRA_BOUNDARIES.some((p) => p.test(t))) extraBoundaries.push(i); });
  return { texts, groupIndex, found, extraBoundaries };
}

/**
 * 每个区块的 DOM 段 = 从它的标题 token 到**下一个已定位的标题/分组大标题**之前。
 * 判渲染态：
 *   empty    段内出现合法空态文案
 *   locked   段内出现付费墙文案（区块专属或通用）
 *   rendered 段内有含数字的内容 token（图表：数字刻度；表格：行里的数；卡片：数值）
 *   loading  标题在、但段内没有任何含数字的内容 —— 骨架屏/占位波形都长这样
 *   not-found 标题不在（懒加载区块在滚到之前连标题都不挂）
 *
 * ⚠️ 这里只说「DOM 上是什么样」，不下「完成」结论；结论在 classifySection 里和接口证人合判。
 */
/** 数据条（Intergalactic ProgressBar，确定进度）不是加载指示。页面侧已过滤，这里再兜一层给旧快照/回放。 */
export const isLoadingIndicator = (ph) => !/^ProgressBar/i.test(String(ph?.name || ''));

export function readDomSections(tokens, { placeholders: rawPlaceholders = [] } = {}) {
  const placeholders = rawPlaceholders.filter(isLoadingIndicator);
  const { texts, groupIndex, found, extraBoundaries = [] } = locateSections(tokens);
  const boundaries = [...Object.values(found), ...Object.values(groupIndex), ...extraBoundaries].filter((i) => i !== null).sort((a, b) => a - b);
  // 定位冲突：某区块的标题正则在自己的搜索范围内、**自己段落之外**还命中了别的未被认领的 token——
  // 说明「先到先得」可能抢错了位置（真标题和列头长得一样）。冲突不猜，交给完成判定阻断。
  const takenIdx = new Set(Object.values(found).filter((i) => i !== null));
  const locateConflicts = [];
  for (const spec of SECTION_SPECS) {
    const start = found[spec.key];
    if (start === null || start === undefined) continue;
    const end = boundaries.find((b) => b > start) ?? texts.length;
    const lowerBound = spec.after ? (groupIndex[spec.after] ?? -1) : -1;
    const upperBound = spec.before ? (groupIndex[spec.before] ?? texts.length) : texts.length;
    const others = [];
    for (let i = lowerBound + 1; i < upperBound; i += 1) {
      if (i === start || takenIdx.has(i) || (i > start && i < end)) continue;
      if (spec.titles.some((p) => p.test(texts[i]))) others.push({ index: i, token: texts[i] });
    }
    if (others.length) locateConflicts.push({ key: spec.key, chosen: { index: start, token: texts[start] }, others: others.slice(0, 5) });
  }
  const out = {};
  const claimed = new Set();
  for (const spec of SECTION_SPECS) {
    const start = found[spec.key];
    if (start === null || start === undefined) { out[spec.key] = { state: 'not-found', titleIndex: null, content: [], placeholders: [] }; continue; }
    const end = boundaries.find((b) => b > start) ?? Math.min(texts.length, start + 400);
    const segment = texts.slice(start + 1, end);
    const content = segment.filter((t) => !UI_NOISE.test(t));
    const empty = content.find((t) => EMPTY_STATE.test(t)) || null;
    const locked = content.find((t) => (spec.locked || []).some((p) => p.test(t)) || GENERIC_LOCKED.test(t)) || null;
    const req = spec.requires || { pattern: /\d/, min: 1 };
    const numeric = content.filter((t) => req.pattern.test(t));
    // 占位元素的 `at` 是它在 token 流里的位置：落在 (标题, 下一个标题] 之间就归这个区块。
    const mine = [];
    placeholders.forEach((ph, i) => {
      if (ph.at > start && ph.at <= end && !claimed.has(i)) { claimed.add(i); mine.push(ph); }
    });
    let state;
    if (empty) state = 'empty';
    else if (locked) state = 'locked';
    else if (numeric.length >= req.min) state = 'rendered';
    else state = 'loading';
    out[spec.key] = {
      state,
      titleIndex: start,
      title: texts[start],
      content: content.slice(0, 120),
      numericCount: numeric.length,
      emptyMarker: empty,
      lockedMarker: locked,
      placeholders: mine,
      fingerprint: `${state}|${mine.length}|${content.slice(0, 120).join('')}`,
    };
  }
  // 不归属任何已定位区块的占位元素（例如还没挂标题的懒加载挂件的骨架）——页级阻断，
  // 只算第一个区块标题之后的（页头的加载条不在报表区）。
  const firstTitle = boundaries.length ? boundaries[0] : Infinity;
  const pagePlaceholders = placeholders.filter((ph, i) => !claimed.has(i) && ph.at >= firstTitle);
  return { sections: out, groupIndex, pagePlaceholders, locateConflicts };
}

/* ------------------------------------------------------------------ *
 * SEO 卡片：旧 8 字段 + 流量比例 + 付费关键词（DOM 读，接口交叉校验）
 * ------------------------------------------------------------------ */

const SEO_LABELS = {
  authorityScore: [/^Authority Score$/],
  organicTraffic: [/^自然流量$/, /^Organic Traffic$/i],
  paidTraffic: [/^付费流量$/, /^Paid Traffic$/i],
  referringDomains: [/^引荐域名$/, /^Referring Domains$/i],
  trafficShare: [/^流量比例$/, /^Traffic Share$/i],
  organicKeywords: [/^自然搜索关键词$/, /^Organic Keywords$/i],
  paidKeywords: [/^付费关键词$/, /^Paid Keywords$/i],
  backlinks: [/^反向链接$/, /^Backlinks$/i],
};
const ALL_SEO_LABELS = Object.values(SEO_LABELS).flat();
const isSeoLabel = (t) => ALL_SEO_LABELS.some((p) => p.test(t));

/**
 * 从 SEO 卡片段（标题 `Authority Score` 之后的 token）读 8 宫格。每个标签往后找，
 * **碰到下一个标签就停**（不许越界拿邻居的数）。
 *   - 数值：整串像 `7.8K` / `381` / `21%`
 *   - 变化率：整串像 `+23%` / `-6%`
 *   - AS 等级徽标：AS 数值后面、下一个标签之前的非数字文本（中文单字「高」也算）
 */
export function readSeoCard(tokens) {
  // 变化率有时被渲染成两个文本节点：`+` 和 `23%`（2026-09-13 实测；同一卡片上 `-6%` 却是一个节点）。
  // 先把孤立的正负号并回紧跟的百分比，否则 organicTrafficChange 会读成 null。
  const texts = [];
  for (const raw of tokens.map((t) => norm(t))) {
    const prev = texts[texts.length - 1];
    if ((prev === '+' || prev === '-' || prev === '−') && /^[\d.,]+%$/.test(raw)) texts[texts.length - 1] = `${prev}${raw}`;
    else texts.push(raw);
  }
  const at = (patterns) => texts.findIndex((t) => patterns.some((p) => p.test(t)));
  const window = (i) => {
    const out = [];
    for (let j = i + 1; j < texts.length && j <= i + 6; j += 1) {
      if (isSeoLabel(texts[j])) break;
      out.push(texts[j]);
    }
    return out;
  };
  const raw = {};
  const values = {};
  for (const [field, patterns] of Object.entries(SEO_LABELS)) {
    const i = field === 'authorityScore' ? (texts.length && /^\d/.test(texts[0]) ? -1 : at(patterns)) : at(patterns);
    const win = i === -1 && field === 'authorityScore' ? texts.slice(0, 6).filter((t, k, arr) => !arr.slice(0, k + 1).some(isSeoLabel)) : (i >= 0 ? window(i) : null);
    if (!win) { raw[field] = null; continue; }
    const value = win.find((t) => /^[\d.,]+\s*[KMB]?%?$/i.test(t)) ?? null;
    const change = win.find((t) => /^[+\-−][\d.,]+%$/.test(t)) ?? null;
    raw[field] = { value, change, window: win };
  }
  const num = (field) => (raw[field]?.value == null ? null : parseCompact(String(raw[field].value).replace(/%$/, '')));
  values.authorityScore = raw.authorityScore?.value && /^\d+$/.test(raw.authorityScore.value) ? Number(raw.authorityScore.value) : null;
  values.organicTraffic = num('organicTraffic');
  values.organicTrafficChange = raw.organicTraffic?.change ?? null;
  values.paidTraffic = num('paidTraffic');
  values.referringDomains = num('referringDomains');
  values.organicKeywords = num('organicKeywords');
  values.organicKeywordsChange = raw.organicKeywords?.change ?? null;
  values.backlinks = num('backlinks');
  values.paidKeywords = num('paidKeywords');
  values.trafficShare = raw.trafficShare?.value && /%$/.test(raw.trafficShare.value) ? raw.trafficShare.value : null;
  const asWin = raw.authorityScore?.window || [];
  const asValueAt = asWin.findIndex((t) => /^\d+$/.test(t));
  const gradeToken = asValueAt >= 0 ? asWin.slice(asValueAt + 1).find((t) => !/\d/.test(t) && !UI_NOISE.test(t)) : null;
  return { values, raw, grade: gradeToken ? { present: true, text: gradeToken } : { present: false, text: null } };
}

/**
 * 「等级标签位上有没有一段词」。**中文等级词可以是单字**（实测 `高`），所以
 * 汉字 1 个以上即成立；拉丁字母仍要 2 个以上（防一个孤立的 `K` 被当成等级）。
 * 旧版 `/\p{L}{2,}/u` 把 `高` 判成没有等级 → 整页 inconclusive，是本次修掉的 bug。
 */
export function hasGradeText(text) {
  return /\p{Script=Han}/u.test(String(text ?? '')) || /\p{L}{2,}/u.test(String(text ?? ''));
}

/**
 * SEO 卡片「真的渲染完了」的判据（DOM 侧）：
 *   1. 8 个字段（含本次补上的「流量比例」「付费关键词」）的数值位都读得出来；
 *   2. **AS 为 0 且没有等级徽标 ⇒ 视为水合前的占位值**（2026-08-23 事故形态：标签先挂、
 *      占位 0 完美稳定）。AS 非 0 而徽标缺失只记警告，不单独判失败——徽标是附属信息。
 */
export const SEO_REQUIRED_FIELDS = ['authorityScore', 'organicTraffic', 'paidTraffic', 'referringDomains', 'trafficShare', 'organicKeywords', 'paidKeywords', 'backlinks'];
export function seoCardCheck(contentTokens) {
  const card = readSeoCard(contentTokens);
  const missing = SEO_REQUIRED_FIELDS.filter((f) => card.values[f] === null || card.values[f] === undefined);
  if (missing.length) return { ok: false, reason: `seo-fields-missing(${missing.join(',')})`, card, warnings: [] };
  if (card.values.authorityScore === 0 && !card.grade.present) return { ok: false, reason: 'as-zero-without-grade(placeholder-suspect)', card, warnings: [] };
  const warnings = card.grade.present ? [] : ['authority-score-grade-badge-missing'];
  if (card.grade.present && !hasGradeText(card.grade.text)) warnings.push(`authority-score-grade-unrecognised(${card.grade.text})`);
  return { ok: true, reason: null, card, warnings };
}

const INTENT_LABELS = {
  informational: [/^信息$/, /^Informational$/i],
  navigational: [/^导航$/, /^Navigational$/i],
  commercial: [/^商务$/, /^Commercial$/i],
  transactional: [/^交易$/, /^Transactional$/i],
};

/**
 * 「按意图」挂件的交叉校验（纯函数）：DOM 里每一行「意图名 · 占比 · 关键词数 · 流量」对接口算出的那一行。
 *   ok            至少校验到 1 行，且没有不一致
 *   mismatch      关键词数不等 / 流量超出缩写精度 / 接口有非零行但 DOM 没有这一行
 *   unverified    接口有数据，但 DOM 里一行都读不出（无法证明接口数据就是这个挂件画的那套）
 *   not-applicable 接口没给这个区块数据（只有 DOM 读数，不存在「接口数据用错序列」的风险）
 * 为什么 unverified 也阻断（最不易误用）：接口数据会被下游当结构化事实使用；证明不了它对应页面上这个挂件，
 * 就不能在 complete 的输出里交出去。
 */
export function crossCheckIntent(domContent, rpcRows) {
  if (!Array.isArray(rpcRows) || !rpcRows.length) return { status: 'not-applicable', checked: 0, mismatches: [] };
  const t = (domContent || []).map((x) => norm(x));
  const mismatches = [];
  let checked = 0;
  for (const [intent, patterns] of Object.entries(INTENT_LABELS)) {
    const row = rpcRows.find((r) => r.intent === intent);
    const at = t.findIndex((x) => patterns.some((p) => p.test(x)));
    if (at < 0) {
      if (row && Number(row.keywords) > 0) mismatches.push({ intent, field: 'row', dom: null, rpc: row.keywords });
      continue;
    }
    const win = t.slice(at + 1, at + 5);
    const pctAt = win.findIndex((x) => /%$/.test(x));
    const after = pctAt >= 0 ? win.slice(pctAt + 1) : win;
    // 关键词数在数据丰富站点上也会缩写（实测「1.3M」「103.1K」），按缩写精度比较；整数时精度为 0 即精确比较。
    const COMPACT = /^[\d.,]+\s*[KMB]?$/i;
    const count = after.find((x) => COMPACT.test(x)) ?? null;
    const traffic = count === null ? null : (after.slice(after.indexOf(count) + 1).find((x) => COMPACT.test(x)) ?? null);
    if (count === null) continue;
    checked += 1;
    if (!row) { mismatches.push({ intent, field: 'row', dom: count, rpc: null }); continue; }
    if (compactMatches(count, row.keywords) === false) mismatches.push({ intent, field: 'keywords', dom: count, rpc: row.keywords });
    if (traffic !== null && compactMatches(traffic, row.traffic) === false) mismatches.push({ intent, field: 'traffic', dom: traffic, rpc: row.traffic });
  }
  if (mismatches.length) return { status: 'mismatch', checked, mismatches };
  if (!checked) return { status: 'unverified', checked, mismatches, reason: 'no intent row could be read from the DOM widget' };
  return { status: 'ok', checked, mismatches };
}

/** DOM 读数与接口数据交叉校验，只校验口径一一对应的几项。 */
export function crossCheckSeo(dom, rpcData) {
  if (!rpcData) return { checked: 0, mismatches: [] };
  const pairs = [
    ['authorityScore', dom.authorityScore, rpcData.authorityScore, (a, b) => a === b],
    ['referringDomains', dom.referringDomainsDisplay, rpcData.referringDomains, compactMatches],
    ['backlinks', dom.backlinksDisplay, rpcData.backlinks, compactMatches],
    ['organicTraffic', dom.organicTrafficDisplay, rpcData.organicTraffic, compactMatches],
    ['organicKeywords', dom.organicKeywordsDisplay, rpcData.organicKeywords, compactMatches],
    ['paidTraffic', dom.paidTrafficDisplay, rpcData.paidTraffic, compactMatches],
    // 付费关键词卡片 vs 页面级趋势最新点 adwordsPositions（审计：非零值从未被真实数据证实过，必须对账）。
    ['paidKeywords', dom.paidKeywordsDisplay, rpcData.paidKeywords, compactMatches],
  ];
  const mismatches = [];
  let checked = 0;
  for (const [field, shown, exact, eq] of pairs) {
    if (shown === null || shown === undefined || exact === null || exact === undefined) continue;
    checked += 1;
    const ok = eq(shown, exact);
    if (ok === false) mismatches.push({ field, dom: shown, rpc: exact });
  }
  return { checked, mismatches };
}

/* ------------------------------------------------------------------ *
 * 合判：单区块终态 + 网络闸门 + 整页完成度
 * ------------------------------------------------------------------ */

export const TERMINAL_STATES = new Set(['data', 'empty', 'locked', 'absent']);

/**
 * 单区块的最终状态。输入：
 *   dom       readDomSections 里这个区块的读数
 *   stable    同一 fingerprint 是否连续两次读到
 *   rpc       buildSectionData 的结果
 *   page      { reachedBottom, quiet, seoRendered, readsAfterBottom }
 *
 * 规则（每条都是「证据 ⇒ 状态」，缺证据一律非终态）：
 *   段内有占位元素（骨架/spinner/aria-busy）                  ⇒ loading（不管有没有数）
 *   DOM rendered + 稳定 + 网络静默                          ⇒ data（接口有数附结构化数据，没有就 dataSource: dom）
 *   DOM empty    + 稳定 + 网络静默 + 接口**没有**非空数据     ⇒ empty
 *   DOM empty    但接口有非空数据                            ⇒ conflict（两证人打架，不下结论）
 *   DOM locked   + 稳定                                     ⇒ locked
 *   DOM loading                                             ⇒ loading
 *   DOM not-found 且接口有非空数据                           ⇒ not-rendered（2026-09-13 空白页事故形态）
 *   DOM not-found、滚到过底、网络静默、到底后又读 ≥2 次仍不在、
 *     SEO 卡片确实渲染了、接口无数据                          ⇒ absent（证据写明）
 *   其余 not-found                                          ⇒ not-found
 */
export function classifySection(spec, dom, stable, rpc, page) {
  const evidence = {
    domState: dom.state, domTitle: dom.title ?? null, domStable: Boolean(stable),
    domNumericTokens: dom.numericCount ?? 0, placeholders: dom.placeholders?.length ?? 0,
    rpcKinds: rpc.rpcKinds, rpcHasData: rpc.hasData,
  };
  const quiet = Boolean(page.quiet);
  if (dom.placeholders && dom.placeholders.length) {
    return { state: 'loading', reason: `placeholder-in-section(${dom.placeholders.map((p) => p.name).slice(0, 3).join(',')})`, evidence };
  }
  switch (dom.state) {
    case 'rendered':
      if (!stable || !quiet) return { state: 'loading', reason: !stable ? 'dom-not-stable' : 'network-not-quiet', evidence };
      return { state: 'data', dataSource: rpc.hasData ? 'rpc+dom' : 'dom', evidence };
    case 'empty':
      if (rpc.hasData) return { state: 'conflict', reason: 'dom-empty-but-rpc-has-data', evidence: { ...evidence, emptyMarker: dom.emptyMarker } };
      if (!stable || !quiet) return { state: 'loading', reason: !stable ? 'empty-marker-not-stable' : 'network-not-quiet', evidence };
      return { state: 'empty', evidence: { ...evidence, emptyMarker: dom.emptyMarker } };
    case 'locked':
      // 与 data / empty 同一口径：锁定态也要网络静默才收（checker 2026-09-13 指出单读区块 state 时会被误导）。
      if (!stable || !quiet) return { state: 'loading', reason: !stable ? 'locked-marker-not-stable' : 'network-not-quiet', evidence };
      return { state: 'locked', evidence: { ...evidence, lockedMarker: dom.lockedMarker } };
    case 'loading':
      return { state: 'loading', reason: 'title-rendered-without-content', evidence };
    default: {
      if (rpc.hasData) return { state: 'not-rendered', reason: 'rpc-has-data-but-section-not-in-dom', evidence };
      // absent 必须证明「懒加载确实越过了这个位置」，否则它和「没挂载」长得一模一样：
      // 2026-09-13 实测，标签页转入 hidden 后下方挂件再也没挂上——那些区块此时标题同样不在。
      //   - 页面顺序里**排在它后面**的区块至少有一个真的渲染了（最后一个区块因此永远不能判 absent）；
      //   - 全程没有 hidden 读数。
      const missing = [];
      if (!page.reachedBottom) missing.push('not-scrolled-to-bottom');
      if (!quiet) missing.push('network-not-quiet');
      if (!page.seoRendered) missing.push('seo-card-not-rendered');
      if ((page.readsAfterBottom || 0) < 2) missing.push('fewer-than-2-reads-after-bottom');
      if (!page.laterSectionRendered) missing.push('no-later-section-rendered(lazy-loading-may-not-have-reached-here)');
      if (page.hiddenSeen) missing.push('tab-was-hidden-during-run');
      if (!missing.length) {
        return {
          state: 'absent',
          evidence: { ...evidence, absentProof: `title never matched after scrolling to the bottom (${page.readsAfterBottom} reads after bottom, network quiet, tab never hidden); a later section rendered, so lazy loading passed this point; SEO card rendered; no RPC payload of this kind` },
        };
      }
      return { state: 'not-found', reason: `absent-not-proven(${missing.join(',')})`, evidence };
    }
  }
}

/**
 * **页内**网络静默（每次读都能算，不消耗 CDP 捕获）。
 *   - 页内钩子记录的在途请求数为 0（钩子只覆盖它装上之后发出的请求）
 *   - 资源计时里 `/dpa/rpc` 的完成数在 quietMs 内没有变化，且最后一个完成距今 ≥ quietMs
 * 这只是**必要条件**。首屏那一批请求发生在钩子装上之前，它们有没有全部返回，
 * 只能靠 networkGate 里的「CDP 发出数 = 资源计时完成数」证明。
 */
export function pageNetworkQuiet(probe, { quietMs = 4000 } = {}) {
  if (!probe) return { quiet: false, reason: 'no-probe' };
  if (probe.hookPending > 0) return { quiet: false, reason: `hook-pending=${probe.hookPending}` };
  if (!(probe.rtCount > 0)) return { quiet: false, reason: 'no-rpc-completed-yet' };
  const idle = probe.rtLastEnd == null ? null : probe.now - probe.rtLastEnd;
  if (idle === null || idle < quietMs) return { quiet: false, reason: `last-rpc-returned-${idle === null ? '?' : Math.round(idle)}ms-ago` };
  if (probe.hookLastStart && probe.epoch - probe.hookLastStart < quietMs) return { quiet: false, reason: 'rpc-started-recently' };
  return { quiet: true, reason: `idle ${Math.round(idle)}ms; ${probe.rtCount} rpc completed` };
}

/**
 * **完成闸门的网络一路**。只在页内已静默时调用一次 CDP drain，然后：
 *   sent      = CDP 捕获里 `/dpa/rpc` 的累计条数（捕获在导航**之前**布防，覆盖首屏那批）
 *   completed = 同一刻资源计时里 `/dpa/rpc` 的完成条数（同一个 document）
 *   pendingInDrain = 本次 drain 里还没有状态码的条数
 * 通过 ⇔ sent > 0 且 sent === completed 且 pendingInDrain === 0 且页内静默。
 *
 * ⚠️ drain 会清空捕获缓冲，在途请求被 drain 之后**它的响应体不会再被记录**
 * （扩展端只按 requestId 回填）。所以只在页内静默时 drain；万一撞上在途请求，
 * 该条的数据会缺失（区块降级为 dataSource: dom 或 not-rendered），闸门本轮不通过。
 */
export function networkGate({ cdpSentTotal, rtCompleted, pendingInDrain, pageQuiet }) {
  const reasons = [];
  if (!pageQuiet?.quiet) reasons.push(`page-not-quiet(${pageQuiet?.reason || 'unknown'})`);
  if (!(cdpSentTotal > 0)) reasons.push('cdp-captured-no-rpc(capture-not-armed?)');
  if (pendingInDrain > 0) reasons.push(`pending-in-drain=${pendingInDrain}`);
  if (cdpSentTotal > 0 && rtCompleted < cdpSentTotal) reasons.push(`sent=${cdpSentTotal}>completed=${rtCompleted}`);
  return { pass: reasons.length === 0, reasons, sent: cdpSentTotal, completed: rtCompleted, pending: Math.max(0, (cdpSentTotal || 0) - (rtCompleted || 0)) + (pendingInDrain || 0) };
}

/** 把一条捕获的 body（对象 / JSON 文本 / `base64:` 文本）解析成对象；解析不了返回 undefined。 */
export function parseRpcBody(body) {
  let b = body;
  if (typeof b === 'string' && b.startsWith('base64:')) {
    try { b = Buffer.from(b.slice(7), 'base64').toString('utf8'); } catch { return undefined; }
  }
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return undefined; } }
  return b == null ? undefined : b;
}

/**
 * 响应体对账（纯函数）。两个来源：CDP 捕获（`via: 'cdp'`）与页内钩子（`via: 'hook'`）。
 *
 * 为什么要两个来源（2026-09-13 根因）：扩展端每条命令先用 2 秒的 `Runtime.evaluate` 探测调试器是否还挂着，
 * 页面主线程在加载大报表时忙到超时，就 detach 再 attach。重连只恢复「捕获列表」和 `Network.enable`，
 * 重连前已经收到响应头、还没取 body 的请求，旧 requestId 在新调试会话里取不到 body——扩展静默吞掉失败，
 * 于是捕获里出现 status 200、body 为空、size 0（实跑 21 条里 16 条，恰好是区块数据那批；同一时段
 * daemon 日志连续出现 `exec still waiting at Chrome API handler after 5s`）。页内钩子在页面里 clone
 * 响应文本，不经过调试器，不受重连影响。
 *
 * 计数口径：一个 HTTP 响应 = 一个签名（JSON-RPC 批量响应里所有 id 拼起来；没有 id 就用内容）。
 *   withBody   两个来源合起来拿到 body 的**不同响应**数
 *   missing    资源计时完成的 `/dpa/rpc` 数 − withBody（不许为负）
 *   conflicts  同一签名在两个来源里内容不同（交叉校验失败）
 *   preHookRequests  钩子装上之前就发出的 rpc 数（它们只能靠 CDP 拿 body）
 */
export function accountRpcBodies(entries, { rtCompleted = 0, rtBeforeHook = null } = {}) {
  const bySig = new Map();
  let unparsable = 0;
  let truncated = 0;
  for (const e of entries || []) {
    if (!/\/dpa\/rpc/.test(String(e?.url || ''))) continue;
    if (!(Number(e.status) > 0) || e.body == null) continue;
    if (e.bodyTruncated) { truncated += 1; continue; }
    const obj = parseRpcBody(e.body);
    if (obj === undefined) { unparsable += 1; continue; }
    const items = Array.isArray(obj) ? obj : [obj];
    const ids = items.map((it) => (it && typeof it === 'object' ? it.id : undefined)).filter((v) => v !== undefined && v !== null);
    const text = JSON.stringify(obj);
    const sig = ids.length ? `ids:${ids.join(',')}` : `txt:${text.length}:${text.slice(0, 120)}`;
    const rec = bySig.get(sig) || { sources: new Set(), texts: new Set() };
    rec.sources.add(e.via === 'hook' ? 'hook' : 'cdp');
    rec.texts.add(text);
    bySig.set(sig, rec);
  }
  const recs = [...bySig.values()];
  const withBody = recs.length;
  return {
    withBody,
    missing: Math.max(0, (Number(rtCompleted) || 0) - withBody),
    rtCompleted: Number(rtCompleted) || 0,
    hook: recs.filter((r) => r.sources.has('hook')).length,
    cdp: recs.filter((r) => r.sources.has('cdp')).length,
    overlap: recs.filter((r) => r.sources.size > 1).length,
    conflicts: recs.filter((r) => r.texts.size > 1).length,
    unparsable,
    truncated,
    preHookRequests: rtBeforeHook,
  };
}

/** 整页完成度：两路都满足才 complete。 */
export function evaluateCompleteness(sections, { elapsedMs, gate, pagePlaceholders = [], reachedBottom = true, locateConflicts = [], scrollExhausted = false, finalRead = null }) {
  const entries = Object.entries(sections || {});
  const incomplete = entries
    .filter(([, s]) => !TERMINAL_STATES.has(s.state))
    .map(([key, s]) => ({ key, name: s.name, state: s.state, reason: s.reason ?? null }));
  const blockers = [];
  if (!entries.length) blockers.push('no-sections-assessed');
  if (pagePlaceholders.length) blockers.push(`page-placeholders=${pagePlaceholders.length}`);
  // 「从上到下」：没滚到过底，就没有资格说整页读完了（下方可能还有没触发的懒加载）。
  if (!reachedBottom) blockers.push('page-not-scrolled-to-bottom');
  // 滚动步数 / 时限耗尽退出，不等于到过底（2026-09-13 复核：旧版循环一结束就无条件记「到过底」）。
  if (scrollExhausted && !reachedBottom) blockers.push('scroll-exhausted');
  if (locateConflicts.length) {
    blockers.push(`section-locate-conflict(${locateConflicts.map((c) => `${c.key}: chose "${c.chosen.token}"@${c.chosen.index}, also matched ${c.others.map((o) => `"${o.token}"@${o.index}`).join(',')}`).join('; ')})`);
  }
  // 懒加载只在「真的滚到底」时才挂载：做判定的那一次读数必须停在最终底部，而且标签页可见。
  if (finalRead && finalRead.atBottom === false) blockers.push('last-read-not-at-bottom');
  if (finalRead && finalRead.vis === 'hidden') blockers.push('last-read-hidden');
  const domOk = entries.length > 0 && incomplete.length === 0 && !blockers.length;
  const networkOk = Boolean(gate?.pass);
  return {
    expected: entries.length,
    terminal: entries.length - incomplete.length,
    incomplete,
    blockers,
    pagePlaceholders: pagePlaceholders.slice(0, 10),
    network: gate ?? null,
    domOk,
    networkOk,
    elapsedMs,
    status: domOk && networkOk ? 'complete' : 'incomplete',
  };
}

/* ------------------------------------------------------------------ *
 * 页面侧脚本（塞进 evalPage）
 * ------------------------------------------------------------------ */

/**
 * 读一次页面：合成树（shadow root + slot 展开）深度优先吐 token，外加占位元素清单。
 *   - 跳过 style/script/template 等；跳过侧栏导航（标签名 `snav-*`，Semrush 导航自定义元素）
 *     与 `<footer>`——侧栏里也有「反向链接」「引荐域名」，不排除就会串台。
 *   - 占位元素判据（不靠哈希类名）：`data-ui-name` 含 Skeleton/Spin/Loader/Placeholder
 *     （Semrush 设计系统 Intergalactic 的组件名，实测页面上有 data-ui-name=Box/Text/Flex）、
 *     `aria-busy="true"`、`role="progressbar"`；且元素确实占据版面（getClientRects 非空）。
 *     `at` 是它在 token 流里的位置，用来归属到区块。
 */
/** 页面侧用来找「视口里有哪些区块标题」的合并正则源（写进滚动轨迹）。 */
const TITLE_SOURCE = [...SECTION_SPECS.flatMap((s) => s.titles), ...Object.values(GROUP_HEADINGS).flat()].map((r) => `(?:${r.source})`).join('|');

export const PAGE_READ_JS = `(() => {
  const TITLE_RE = new RegExp(${JSON.stringify(TITLE_SOURCE)}, 'i');
  const inView = []; const vh = window.innerHeight;
  const SKIP = new Set(['STYLE','SCRIPT','NOSCRIPT','TEMPLATE','LINK','META','HEAD','FOOTER']);
  const PLACEHOLDER_NAME = /skeleton|spin|loader|placeholder/i;
  const toks = []; const placeholders = [];
  const walk = (node) => {
    if (node.nodeType === 3) { const t = String(node.nodeValue || '').replace(/\\s+/g, ' ').trim(); if (t) { toks.push(t); if (inView.length < 30 && TITLE_RE.test(t) && node.parentElement) { try { const r = node.parentElement.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh && r.height > 0) inView.push(t); } catch (e) {} } } return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (SKIP.has(tag) || tag.startsWith('SNAV-')) return;
    const ui = node.getAttribute('data-ui-name') || '';
    const role = node.getAttribute('role');
    // role=progressbar 只有「不确定进度」才是加载指示：带 aria-valuenow 的、或 Intergalactic 的
    // ProgressBar 组件，是**数据条**（2026-09-13 实测：竞争对手表「竞争程度」列）。
    const indeterminate = role === 'progressbar' && !node.hasAttribute('aria-valuenow') && !/^ProgressBar/i.test(ui);
    if ((PLACEHOLDER_NAME.test(ui) && !/^ProgressBar/i.test(ui)) || node.getAttribute('aria-busy') === 'true' || indeterminate) {
      let visible = false; try { visible = node.getClientRects().length > 0; } catch (e) {}
      if (visible && placeholders.length < 200) placeholders.push({ at: toks.length, name: ui || (role === 'progressbar' ? 'progressbar' : 'aria-busy') });
    }
    if (node.shadowRoot) { for (const c of node.shadowRoot.childNodes) walk(c); return; }
    if (tag === 'SLOT') { const a = node.assignedNodes ? node.assignedNodes({ flatten: true }) : []; for (const c of (a.length ? a : node.childNodes)) walk(c); return; }
    for (const c of node.childNodes) walk(c);
  };
  if (document.documentElement) walk(document.documentElement);
  const rt = performance.getEntriesByType('resource').filter((e) => /\\/dpa\\/rpc/.test(e.name));
  const ends = rt.map((e) => e.responseEnd).filter((v) => v > 0);
  return JSON.stringify({
    href: location.href.split('?')[0], title: document.title, vis: document.visibilityState,
    scrollY: window.scrollY, innerHeight: window.innerHeight,
    scrollHeight: Math.max(document.documentElement ? document.documentElement.scrollHeight : 0, document.body ? document.body.scrollHeight : 0),
    toks, placeholders, inView, lazy: window.__ovLazy || null,
    net: { now: performance.now(), epoch: Date.now(), timeOrigin: performance.timeOrigin, rtCount: rt.length, rtLastEnd: ends.length ? Math.max(...ends) : null,
      hookInstalled: Boolean(window.__ovRpc), hookPending: window.__ovPending ?? null,
      hookAt: window.__ovHookAt ?? null,
      rtBeforeHook: window.__ovHookAt == null ? null : rt.filter((e) => e.startTime < window.__ovHookAt).length, hookCount: (window.__ovRpc || []).length, hookLastStart: window.__ovLastStart || null },
  });
})()`;

/**
 * `/dpa/rpc` 请求体摘要（纯函数，同时被原样嵌进 HOOK_JS 在页面里执行——所以函数体里不许有反引号和模板插值）。
 * 只做**白名单**：每个 JSON-RPC 条目保留 `id`、`method`，以及 params 里深度 ≤2、键名在白名单里的标量值；
 * 从不进入 user / account / auth / token / session / cookie / key / secret / email / profile / billing 这类对象，
 * 其余键一律丢弃。用途：区分付费 / 自然这类「响应形状相同」的查询（证据用，本身不参与判定）。
 */
export function summarizeRpcRequest(bodyText) {
  var WHITELIST = {
    database: 1, db: 1, type: 1, report: 1, reportType: 1, reportName: 1, displayLimit: 1, displayOffset: 1,
    limit: 1, offset: 1, searchType: 1, targetType: 1, dateType: 1, period: 1, device: 1, mode: 1,
    sortField: 1, sortDirection: 1, currency: 1, positionsType: 1,
  };
  var NO_DESCEND = /user|account|auth|token|session|cookie|key|secret|email|profile|billing|password|credential/i;
  var MAX_DEPTH = 2;
  if (typeof bodyText !== 'string' || !bodyText) return null;
  var parsed;
  try { parsed = JSON.parse(bodyText); } catch (e) { return null; }
  var items = Array.isArray(parsed) ? parsed : [parsed];
  var pick = function (obj, prefix, depth, acc) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj) || depth > MAX_DEPTH) return;
    Object.keys(obj).forEach(function (k) {
      var v = obj[k];
      var path = prefix ? prefix + '.' + k : k;
      if (Object.prototype.hasOwnProperty.call(WHITELIST, k)) {
        if (typeof v === 'string') acc[path] = v.slice(0, 80);
        else if (typeof v === 'number' || typeof v === 'boolean') acc[path] = v;
      } else if (v && typeof v === 'object' && !Array.isArray(v) && !NO_DESCEND.test(k)) {
        pick(v, path, depth + 1, acc);
      }
    });
  };
  var out = [];
  for (var i = 0; i < items.length && out.length < 50; i += 1) {
    var it = items[i];
    if (!it || typeof it !== 'object') continue;
    var params = {};
    pick(it.params, '', 1, params);
    out.push({
      id: (typeof it.id === 'number' || typeof it.id === 'string') ? it.id : null,
      method: typeof it.method === 'string' ? it.method.slice(0, 120) : null,
      params: params,
    });
  }
  return out;
}

/**
 * 页内钩子：记录它装上之后发出的 `/dpa/rpc`（请求体 + 响应体 + 在途数），并把资源计时缓冲
 * 调大到 5000（默认 250，全页 140+ 条请求，懒加载再多一批就会溢出，完成数会少算）。
 */
export const HOOK_JS = `(() => {
  try { performance.setResourceTimingBufferSize(5000); } catch (e) {}
  if (window.__ovRpc) return JSON.stringify({ already: true, hookAt: window.__ovHookAt ?? null, readyState: document.readyState });
  window.__ovRpc = []; window.__ovPending = 0; window.__ovLastStart = 0;
  // 装上的时刻（本 document 的 performance.now）。资源计时里 startTime 早于它的 rpc 不在钩子覆盖范围内。
  window.__ovHookAt = performance.now();
  const push = (rec) => { try { if (window.__ovRpc.length < 300) window.__ovRpc.push(rec); } catch (e) {} };
  // 请求体只留白名单摘要（method + 少数口径参数），见 summarizeRpcRequest。新增字段 req，原有字段不变。
  const summarizeRpcRequest = ${summarizeRpcRequest.toString()};
  // 请求体不一定是字符串：fetch(Request) 时正文在 Request 里，也可能是 Blob / Uint8Array / URLSearchParams。
  // 2026-09-14 实跑：钩子收全了 22 条响应，但请求摘要全为空——只认字符串正文会漏掉这些形态。
  // reqBodyType 只记类型名（不含任何正文内容），下次实跑能直接看出是哪种。
  const bodyTypeOf = (b) => (b == null ? 'none' : typeof b === 'string' ? 'string' : String((b.constructor && b.constructor.name) || typeof b).slice(0, 40));
  const bodyText = async (b) => {
    if (b == null) return null;
    if (typeof b === 'string') return b;
    try {
      const tag = Object.prototype.toString.call(b);
      if (tag === '[object URLSearchParams]') return b.toString();
      if (typeof ArrayBuffer !== 'undefined' && (ArrayBuffer.isView(b) || tag === '[object ArrayBuffer]')) return new TextDecoder().decode(b);
      if (typeof b.text === 'function') return await b.text();
    } catch (e) {}
    return null;
  };
  const summarizeAsync = async (b) => { try { const t = await bodyText(b); return t ? summarizeRpcRequest(t) : null; } catch (e) { return null; } };
  const F = window.fetch;
  window.fetch = async function (input, init) {
    const url = String((input && input.url) || input);
    const isRpc = /\\/dpa\\/rpc/.test(url);
    if (isRpc) { window.__ovPending += 1; window.__ovLastStart = Date.now(); }
    const startedAt = performance.now();
    let reqP = null;
    let reqBodyType = null;
    if (isRpc) {
      const initBody = init && init.body != null ? init.body : null;
      if (initBody == null && input && typeof input === 'object' && typeof input.clone === 'function') {
        // 必须在交给原 fetch 之前 clone，否则正文会被消费掉。
        reqBodyType = 'Request';
        try { reqP = summarizeAsync(input.clone()); } catch (e) { reqP = null; }
      } else {
        reqBodyType = bodyTypeOf(initBody);
        reqP = summarizeAsync(initBody);
      }
    }
    let r;
    try { r = await F.apply(this, arguments); } finally { if (isRpc) window.__ovPending -= 1; }
    if (isRpc) {
      let req = null;
      try { req = reqP ? await reqP : null; } catch (e) { req = null; }
      try { const t = await r.clone().text(); push({ via: 'hook', url: '/dpa/rpc', status: r.status, body: t.slice(0, 2000000), bodyTruncated: t.length > 2000000, startedAt, timestamp: Date.now(), req, reqBodyType }); } catch (e) {}
    }
    return r;
  };
  const X = XMLHttpRequest.prototype, O = X.open, S = X.send;
  X.open = function (m, u) { this.__ovUrl = String(u); return O.apply(this, arguments); };
  X.send = function (body) {
    const x = this;
    if (/\\/dpa\\/rpc/.test(x.__ovUrl || '')) {
      window.__ovPending += 1; window.__ovLastStart = Date.now();
      const startedAt = performance.now();
      const reqBodyType = bodyTypeOf(body);
      const reqP = summarizeAsync(body);
      x.addEventListener('loadend', () => {
        window.__ovPending -= 1;
        let t = '';
        try { t = String(x.responseText || ''); } catch (e) {}
        const status = x.status;
        const rec = (req) => ({ via: 'hook', url: '/dpa/rpc', status, body: t.slice(0, 2000000), bodyTruncated: t.length > 2000000, startedAt, timestamp: Date.now(), req, reqBodyType });
        Promise.resolve(reqP).then((req) => push(rec(req)), () => push(rec(null)));
      });
    }
    return S.apply(this, arguments);
  };
  return JSON.stringify({ installed: true, hookAt: window.__ovHookAt, readyState: document.readyState });
})()`;

/* ------------------------------------------------------------------ *
 * 口径（全球 vs 国家库）
 * ------------------------------------------------------------------ */

/**
 * 读地区选择器：页头那排「全世界 / US / UK / DE …」按钮里，哪一个被页面标成选中。
 * 判据只认**页面产出的选中态属性**（aria-pressed / aria-selected / aria-checked / aria-current /
 * data-state / data-selected），在按钮本身及其 3 层合成祖先上找；不猜类名。
 * 另外带回落地 URL 的 db 参数。
 */
export const SCOPE_PROBE_JS = `(() => {
  const LABEL = /^(全世界|全球|Worldwide|Global|[A-Z]{2})$/;
  const out = [];
  const parentOf = (n) => n.parentElement || (n.getRootNode && n.getRootNode().host) || null;
  const stateOf = (el) => {
    const attrs = {};
    for (const a of ['aria-pressed', 'aria-selected', 'aria-checked', 'aria-current', 'data-state', 'data-selected', 'data-active']) {
      const v = el.getAttribute && el.getAttribute(a); if (v != null) attrs[a] = String(v).slice(0, 20);
    }
    return attrs;
  };
  const walk = (node) => {
    if (out.length >= 40 || node.nodeType !== 1) return;
    if (String(node.tagName).startsWith('SNAV-') || ['SCRIPT', 'STYLE', 'FOOTER'].includes(node.tagName)) return;
    const own = Array.from(node.childNodes).filter((c) => c.nodeType === 3).map((c) => c.nodeValue.trim()).join('');
    if (own && LABEL.test(own)) {
      const chain = [];
      let cur = node;
      for (let i = 0; i < 4 && cur; i += 1) { const s = stateOf(cur); if (Object.keys(s).length) chain.push({ depth: i, tag: String(cur.tagName).toLowerCase(), ...s }); cur = parentOf(cur); }
      out.push({ label: own, chain });
    }
    if (node.shadowRoot) for (const c of node.shadowRoot.childNodes) walk(c);
    for (const c of node.childNodes) walk(c);
  };
  if (document.body) walk(document.body);
  let urlDb = null; try { urlDb = new URL(location.href).searchParams.get('db'); } catch (e) {}
  return JSON.stringify({ urlDb, candidates: out });
})()`;

const GLOBAL_LABEL = /^(全世界|全球|Worldwide|Global)$/i;
const SELECTED_VALUE = /^(true|on|active|checked|selected|page)$/i;

/**
 * 口径判定（纯函数）。
 *   requestedDb  调用方给的 --db（空 = 全球）
 *   probe        SCOPE_PROBE_JS 的结果
 * 返回 verdict：
 *   confirmed   页面选中的恰好是请求的口径（全球 ⇒ 选中「全世界/Worldwide」；国家 ⇒ 选中同名国家码），
 *               且请求全球时落地 URL 不带 db
 *   mismatch    页面明确选中了别的口径，或请求全球而落地 URL 带着 db（例如沿用了上次选的国家）
 *   unverified  读不出唯一的选中项（选中态属性不存在 / 多个都像选中 / 国家藏在「更多」里）
 * 只有 confirmed 算通过——**读不出来不等于是全球**。
 */
/**
 * 接口证人里的口径线索（响应体里没有请求参数，但有能对账的数）：
 *   - 国家流量列表每行带 `database` + `positions`（该库关键词数）+ `organicPositions`；
 *   - 趋势序列最新一点的 `positions` 是**页面级口径**的关键词数：
 *       单国库 ⇒ 恰好等于那个国家行的 positions（2026-09-13 实测 db=us 时两者逐位相等）；
 *       全球库 ⇒ 严格大于任何单个国家行（同日全球口径实测明显大于最大的国家行）；
 *   - 竞争对手挂件里 `competitionLvl=100` 的那一行是本域名自己，它的 organicPositions 等于
 *     **该挂件所用数据库**那一行的 organicPositions（实测 db=us 时两者逐位相等）——
 *     这是「自然搜索研究」分组口径的接口侧见证。
 * 只取非 mobile-* 的库；同一库在两份列表里重复时取第一份。
 */
export function rpcScopeWitness(rpc, ctx = {}) {
  const byDb = new Map();
  for (const r of pickKind(rpc, 'googleCountries')) {
    for (const row of r.result || []) {
      if (!row || typeof row.database !== 'string' || /^mobile-/i.test(row.database)) continue;
      if (!byDb.has(row.database)) byDb.set(row.database, row);
    }
  }
  const rows = [...byDb.values()];
  // 页面级那套趋势（由 SEO 卡片显示值认出来，见 trendContext）；没给上下文时只在只有一套时采用。
  const latest = latestTrendRow(trendSeries(rpc, ctx.pageKey ?? ctx.pagePositions));
  const trendPositions = Number.isFinite(Number(latest?.positions)) ? Number(latest.positions) : null;
  const maxCountryPositions = rows.length ? Math.max(...rows.map((x) => Number(x.positions) || 0)) : null;
  // ⚠️ 2026-09-14 实测更正：这条响应是「主要付费搜索竞争对手」的查询，里面的目标域名自身行证明的是
  // **广告研究分组**所用的数据库，不是自然搜索研究分组。输出 adsMatches；organicMatches 保留同值仅为兼容旧调用方。
  const self = pickKind(rpc, 'competitorRowsWithoutTraffic').flatMap((r) => r.result || []).find((x) => Number(x?.competitionLvl) === 100) || null;
  const organicSelfPositions = Number.isFinite(Number(self?.organicPositions)) ? Number(self.organicPositions) : null;
  return {
    trendSource: ctx.pageSource ?? (ctx.pagePositions === undefined ? 'no-context' : null),
    countriesSeen: rows.length,
    trendPositions,
    maxCountryPositions,
    topMatches: trendPositions === null ? [] : rows.filter((x) => Number(x.positions) === trendPositions).map((x) => x.database),
    trendExceedsEveryCountry: trendPositions !== null && rows.length > 1 && trendPositions > maxCountryPositions,
    organicSelfPositions,
    organicMatches: organicSelfPositions === null ? [] : rows.filter((x) => Number(x.organicPositions) === organicSelfPositions).map((x) => x.database),
    adsMatches: organicSelfPositions === null ? [] : rows.filter((x) => Number(x.organicPositions) === organicSelfPositions).map((x) => x.database),
  };
}

const DB_ALIASES = { uk: ['uk', 'gb'], gb: ['uk', 'gb'] };
const sameDb = (a, b) => Boolean(a && b) && (DB_ALIASES[a] || [a]).includes(b);

/**
 * 页面级口径判定（纯函数）。两个证人**都**要到位才 confirmed：
 *
 * 请求全球（不传 --db）：
 *   DOM   落地 URL 不带 db；国家 pill（US/UK/DE…）暴露了 `aria-checked` 且**没有一个**为 true；
 *         「全世界」按钮存在。（2026-09-13 checker 实测：「全世界」按钮本身**没有**任何选中态属性，
 *         只有 CSS 高亮，所以只能用「国家 pill 全部未选中」反证。旧判据等「全世界」自报选中，永远等不到。）
 *   RPC   趋势最新点 positions 严格大于每一个国家行（全球 = 多库合计）。
 *   明确反例 ⇒ mismatch：URL 带 db / 某个国家 pill aria-checked=true。
 *   趋势恰好等于某国（只在一个库有数据的站点也会这样）⇒ unverified，不硬判。
 * 请求国家 xx：
 *   RPC   趋势 positions 等于 xx 行；DOM：xx pill aria-checked=true 或落地 URL db=xx。
 *   趋势大于所有国家（像全球）或别的 pill 被选中 ⇒ mismatch。
 */
export function judgeScope({ requestedDb, probe, rpcWitness = null }) {
  const requested = String(requestedDb || '').trim().toLowerCase() || 'global';
  const urlDb = probe?.urlDb ? String(probe.urlDb).toLowerCase() : null;
  const candidates = Array.isArray(probe?.candidates) ? probe.candidates : [];
  const pillState = (c) => {
    for (const link of c.chain || []) if (Object.prototype.hasOwnProperty.call(link, 'aria-checked')) return String(link['aria-checked']).toLowerCase();
    return null;
  };
  const pills = candidates.filter((c) => !GLOBAL_LABEL.test(c.label) && pillState(c) !== null);
  const checkedPills = [...new Set(pills.filter((c) => pillState(c) === 'true').map((c) => c.label.toLowerCase()))];
  const globalButtonPresent = candidates.some((c) => GLOBAL_LABEL.test(c.label));
  const globalSelfSelected = candidates.some((c) => GLOBAL_LABEL.test(c.label) && (c.chain || []).some((link) => Object.entries(link).some(([k, v]) => k !== 'depth' && k !== 'tag' && SELECTED_VALUE.test(String(v)))));
  const dom = { urlDb, pillsWithState: pills.length, checkedPills, globalButtonPresent, globalSelfSelected };
  const base = { requested, urlDb, dom, rpc: rpcWitness, candidates: candidates.slice(0, 12) };
  const w = rpcWitness || {};

  if (requested === 'global') {
    if (urlDb) return { ...base, actual: urlDb, verdict: 'mismatch', reason: `requested global but landed URL carries db=${urlDb}` };
    if (checkedPills.length) return { ...base, actual: checkedPills[0], verdict: 'mismatch', reason: `requested global but country pill ${checkedPills.join(',')} is aria-checked=true` };
    const domOk = globalSelfSelected || (pills.length > 0 && globalButtonPresent);
    if (!domOk) return { ...base, actual: null, verdict: 'unverified', reason: pills.length ? 'global button not found' : 'no country pill exposes aria-checked, cannot rule out a selected country' };
    if (!rpcWitness) return { ...base, actual: null, verdict: 'unverified', reason: 'DOM consistent with global, but no RPC witness' };
    if (w.trendExceedsEveryCountry) return { ...base, actual: 'global', verdict: 'confirmed', reason: `no country pill checked, no URL db, global button present; trend keywords ${w.trendPositions} > every single country (max ${w.maxCountryPositions})` };
    return { ...base, actual: w.topMatches?.length === 1 ? w.topMatches[0] : null, verdict: 'unverified', reason: `DOM consistent with global, but RPC trend keywords ${w.trendPositions ?? '?'} do not exceed every country (matches: ${(w.topMatches || []).join(',') || 'none'})` };
  }

  if (urlDb && !sameDb(requested, urlDb)) return { ...base, actual: urlDb, verdict: 'mismatch', reason: `requested db=${requested} but landed URL carries db=${urlDb}` };
  if (checkedPills.length && !checkedPills.some((p) => sameDb(requested, p))) return { ...base, actual: checkedPills[0], verdict: 'mismatch', reason: `requested ${requested} but pill ${checkedPills.join(',')} is checked` };
  if (rpcWitness && w.trendExceedsEveryCountry) return { ...base, actual: 'global', verdict: 'mismatch', reason: 'requested a country but RPC trend exceeds every single country (looks global)' };
  const domOk = checkedPills.some((p) => sameDb(requested, p)) || sameDb(requested, urlDb);
  const rpcOk = (w.topMatches || []).some((d) => sameDb(requested, d));
  if (domOk && rpcOk) return { ...base, actual: requested, verdict: 'confirmed', reason: `DOM (${checkedPills.length ? 'pill checked' : 'URL db'}) and RPC trend keywords ${w.trendPositions} = ${requested} row` };
  return { ...base, actual: null, verdict: 'unverified', reason: `DOM ${domOk ? 'ok' : 'not confirmed'}, RPC ${rpcOk ? 'ok' : `not confirmed (matches: ${(w.topMatches || []).join(',') || 'none'})`}` };
}

/* ------------------------------------------------------------------ *
 * 区块级口径：自然搜索研究 / 广告研究 分组各自带国家徽标
 * ------------------------------------------------------------------ */

const COUNTRY_BADGE = /^[A-Z]{2}$/;

/**
 * 从 token 流里读分组徽标（2026-09-13 checker 实测：全球页面上「自然搜索研究」「广告研究」大标题后
 * 紧跟一个 `DE` 文本 token——这两个分组**独立于页头地区选择器**，跟随账号级「最近一次显式选择的国家」；
 * 「反向链接」分节标题后是它自己的地区过滤条 `全世界`）。
 *   organic / ads：heading 后一个 token 是两位大写国家码 ⇒ badge；不是 ⇒ null（缺失）
 *   backlinks：广告研究（或自然搜索研究）之后第一个「反向链接」，后一个 token 是 全世界/国家码 ⇒ filter
 */
export function readGroupBadges(tokens) {
  const texts = (tokens || []).map((t) => norm(Array.isArray(t) ? t[0] : t));
  const find = (patterns, from = 0) => { for (let i = from; i < texts.length; i += 1) if (patterns.some((p) => p.test(texts[i]))) return i; return -1; };
  const badgeAfter = (i) => (i >= 0 && COUNTRY_BADGE.test(texts[i + 1] || '') ? texts[i + 1].toLowerCase() : null);
  const organicAt = find(GROUP_HEADINGS.organic);
  const adsAt = find(GROUP_HEADINGS.ads);
  const blAt = find([/^反向链接$/, /^Backlinks$/i], Math.max(adsAt, organicAt, 0) + 1);
  const blNext = blAt >= 0 ? texts[blAt + 1] || '' : '';
  const blFilter = blAt < 0 ? null : GLOBAL_LABEL.test(blNext) ? 'global' : COUNTRY_BADGE.test(blNext) ? blNext.toLowerCase() : null;
  const looksLikeBacklinksHeading = blAt >= 0 && (blFilter !== null || /^(全部时间|All time)$/i.test(texts[blAt + 2] || ''));
  return {
    organic: { headingSeen: organicAt >= 0, badge: badgeAfter(organicAt) },
    ads: { headingSeen: adsAt >= 0, badge: badgeAfter(adsAt) },
    backlinks: { headingSeen: looksLikeBacklinksHeading, badge: looksLikeBacklinksHeading ? blFilter : null },
  };
}

/** 区块 → 口径分组。 */
export const SCOPE_GROUP_OF = { ai: 'top', seo: 'top', organic: 'organic', ads: 'ads', backlinks: 'backlinks' };

/**
 * 区块级口径判定（纯函数）。
 *   requestedScope  页面级请求口径（global / 国家码）
 *   organicDb       --organic-db（自然搜索研究 + 广告研究两个分组的期望国家；不传 = 未钉住）
 *   topScope        judgeScope 的结果
 *   groupBadges     runReadiness 在整轮读数里收集到的徽标 { organic: {headingSeen, values[]} … }
 *   rpcWitness      rpcScopeWitness 的结果
 *
 * 分组期望口径：
 *   top        = 请求口径（由 judgeScope 判）
 *   organic/ads= --organic-db；没传且请求是国家 xx ⇒ xx；没传且请求全球 ⇒ **未钉住（unpinned）**
 *   backlinks  = global（反链数据不分国家，分节自带的过滤条应显示 全世界）
 * 分组 verdict：confirmed | mismatch | unverified | unpinned —— 只有 confirmed 不阻断。
 *   - 整轮里徽标出现过两个不同值 ⇒ mismatch（口径在运行中被改写）
 *   - 标题从未出现 / 徽标缺失 ⇒ unverified；自然搜索研究可用接口证人（本域名那一行）唯一匹配补位
 *   - DOM 徽标与接口证人矛盾 ⇒ mismatch
 * 未钉住的默认行为（为什么选它）：不自动切国家（切换会改写账号级共享状态、影响同账号其它任务）、
 * 不猜「代表国家」（猜错比不给更坏），而是**如实标出页面实际显示的国家并阻断 complete**，
 * 调用方要这两组数据就显式传 --organic-db。
 */
export function judgeSectionScopes({ requestedScope = 'global', organicDb = null, topScope = null, groupBadges = {}, rpcWitness = null } = {}) {
  const requested = String(requestedScope || 'global').toLowerCase();
  const pinned = organicDb ? String(organicDb).toLowerCase() : (requested !== 'global' ? requested : null);
  const groups = {};
  groups.top = {
    expected: requested,
    actual: topScope?.verdict === 'confirmed' ? requested : (topScope?.actual ?? null),
    verdict: topScope?.verdict || 'unverified',
    source: 'page-region-selector + rpc-trend',
    reason: topScope?.reason || 'top scope not judged',
  };
  const research = (name) => {
    const g = groupBadges[name] || {};
    const values = [...new Set(g.values || [])];
    // 接口补位只给广告研究分组：本域名自身行来自付费竞争对手查询（2026-09-14 实测更正，旧版错给了自然分组）。
    const rpcMatches = name === 'ads' ? (rpcWitness?.adsMatches ?? rpcWitness?.organicMatches ?? []) : [];
    const out = { expected: pinned, badgesSeen: values, rpcMatches };
    if (values.length > 1) return { ...out, actual: null, verdict: 'mismatch', source: 'dom-badge', reason: `group badge changed during the run: ${values.join('→')}` };
    let actual = values[0] ?? null;
    let source = actual ? 'dom-badge' : null;
    if (actual && rpcMatches.length && !rpcMatches.some((d) => sameDb(actual, d))) {
      return { ...out, actual, verdict: 'mismatch', source, reason: `DOM badge ${actual} contradicts RPC self-row match ${rpcMatches.join(',')}` };
    }
    if (!actual && rpcMatches.length === 1) { actual = rpcMatches[0]; source = 'rpc-self-competitor-row'; }
    if (!g.headingSeen && !actual) return { ...out, actual: null, verdict: 'unverified', source, reason: 'group heading never seen' };
    if (!actual) return { ...out, actual: null, verdict: 'unverified', source, reason: 'country badge missing next to the group heading and no unique RPC witness' };
    if (!pinned) return { ...out, actual, verdict: 'unpinned', source, reason: `page shows ${actual.toUpperCase()} for this group (account-level last explicit country); request was global — pass --organic-db ${actual} (or another country) to pin it` };
    return sameDb(pinned, actual)
      ? { ...out, actual, verdict: 'confirmed', source, reason: `group shows ${actual.toUpperCase()} = expected` }
      : { ...out, actual, verdict: 'mismatch', source, reason: `group shows ${actual.toUpperCase()} but expected ${pinned.toUpperCase()}` };
  };
  groups.organic = research('organic');
  groups.ads = research('ads');
  {
    const g = groupBadges.backlinks || {};
    const values = [...new Set(g.values || [])];
    const out = { expected: 'global', badgesSeen: values, source: 'dom-filter' };
    if (values.length > 1) groups.backlinks = { ...out, actual: null, verdict: 'mismatch', reason: `filter changed during the run: ${values.join('→')}` };
    else if (!values.length) groups.backlinks = { ...out, actual: null, verdict: 'unverified', reason: g.headingSeen ? 'backlinks filter label not readable' : 'backlinks heading never seen' };
    else groups.backlinks = { ...out, actual: values[0], verdict: values[0] === 'global' ? 'confirmed' : 'mismatch', reason: `backlinks filter shows ${values[0]}` };
  }
  const bySection = {};
  for (const spec of SECTION_SPECS) {
    const group = SCOPE_GROUP_OF[spec.group];
    bySection[spec.key] = { group, scope: groups[group].actual, expected: groups[group].expected, verdict: groups[group].verdict };
  }
  const blockers = ['organic', 'ads', 'backlinks']
    .filter((name) => groups[name].verdict !== 'confirmed')
    .map((name) => `section-scope-${groups[name].verdict}(${name}: expected=${groups[name].expected ?? 'unpinned'}, actual=${groups[name].actual ?? 'unknown'}; ${groups[name].reason})`);
  return { groups, bySection, blockers };
}

/**
 * 最终 status（纯函数）：readiness 判定 complete 之外，任何一条口径/目标/可见性阻断都让它 incomplete。
 */
export function finalStatus({ readinessVerdict, scopeEvidence, sectionScopes, targetConfirmed = true, visibility = { hidden: 0, reads: 0, first: 'visible' }, crossChecks = {}, trendContext: trendCtx = null }) {
  const blockers = [];
  if (!targetConfirmed) blockers.push('target-domain-not-found-in-page-header');
  if (visibility.first === 'hidden') blockers.push('tab-was-hidden-at-first-read(report-may-never-hydrate)');
  if (!scopeEvidence || scopeEvidence.verdict !== 'confirmed') blockers.push(`scope-${scopeEvidence?.verdict || 'unverified'}(${scopeEvidence?.reason || 'not judged'})`);
  blockers.push(...(sectionScopes?.blockers || []));
  // 趋势序列认不出是哪一套：不猜——相关区块的接口数据不可信，整页不许 complete。
  if (trendCtx && ((trendCtx.pageAmbiguous && !trendCtx.pageKey) || (trendCtx.organicAmbiguous && !trendCtx.organicKey))) {
    blockers.push(`trend-series-ambiguous(${(trendCtx.ambiguityReasons || []).join('; ') || 'several trend series fit and nothing tells them apart'})`);
  }
  // 交叉校验：SEO 卡片 DOM 显示值 vs 接口数据；「按意图」DOM 行 vs 所选研究分组趋势。
  const seoMismatches = crossChecks?.seo?.mismatches || [];
  if (seoMismatches.length) {
    blockers.push(`seo-crosscheck-mismatch(${seoMismatches.map((m) => `${m.field}: dom=${m.dom} rpc=${m.rpc}`).join('; ')})`);
  }
  const intentCheck = crossChecks?.intent;
  if (intentCheck && intentCheck.status === 'mismatch') {
    blockers.push(`intent-crosscheck-mismatch(${(intentCheck.mismatches || []).map((m) => `${m.intent}.${m.field}: dom=${m.dom} rpc=${m.rpc}`).join('; ')})`);
  } else if (intentCheck && intentCheck.status === 'unverified') {
    blockers.push(`intent-crosscheck-unverified(${intentCheck.reason || 'intent rows not readable in the DOM'})`);
  }
  const bodies = readinessVerdict?.network?.bodies;
  if (bodies && bodies.missing > 0) {
    const denominator = bodies.rtCompleted ?? bodies.missing + bodies.withBody;
    blockers.push(`rpc-bodies-missing(${bodies.missing}/${denominator} completed rpc responses have no body from either the CDP capture or the in-page hook; structured data and the RPC scope witness are incomplete)`);
  }
  if (bodies && bodies.conflicts > 0) {
    blockers.push(`rpc-body-conflict(${bodies.conflicts} responses differ between the CDP capture and the in-page hook)`);
  }
  // 设计意图：readiness 已判 complete 时，历史 hidden 读数**不再**追加阻断。前提由 evaluateCompleteness 保证——
  // 做判定的那次读数必须可见且停在最终底部（否则记 last-read-hidden / last-read-not-at-bottom，到不了 complete），
  // 双闸门（DOM 全终态 + 网络静默）也在那次读数上通过；中途被遮挡又恢复，懒加载已在可见时补挂载，不算缺数。
  // readiness 没判 complete 时，hidden 读数可能正是区块没挂载的原因，必须点名阻断。钉住的测试见 readiness 测试「hidden 读数」三例。
  if (visibility.hidden > 0 && readinessVerdict?.status !== 'complete') {
    blockers.push(`tab-hidden-during-run(${visibility.hidden}/${visibility.reads} reads hidden; lazily mounted sections may never render — rerun with the window visible)`);
  }
  return { status: readinessVerdict?.status === 'complete' && !blockers.length ? 'complete' : 'incomplete', blockers };
}

/**
 * 页面侧：按**与 PAGE_READ_JS 相同的合成树顺序与跳过规则**找第 occurrence 个整串等于 text 的文本节点，
 * 把它所在元素滚到视口中部。用于定点等待卡住的区块（checker 2026-09-13：固定步长滚动跳过了
 * 「反向链接明细」的可视窗口，而虚拟化又把它回收，整轮都没见证到）。
 */
export function scrollToTextJs(text, occurrence = 0) {
  return `(() => {
  const target = ${JSON.stringify(String(text))}; let want = ${Math.max(0, Number(occurrence) || 0)};
  const SKIP = new Set(['STYLE','SCRIPT','NOSCRIPT','TEMPLATE','LINK','META','HEAD','FOOTER']);
  let hit = null;
  const walk = (node) => {
    if (hit) return;
    if (node.nodeType === 3) { const t = String(node.nodeValue || '').replace(/\\s+/g, ' ').trim(); if (t && t === target) { if (want === 0) hit = node; else want -= 1; } return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName;
    if (SKIP.has(tag) || tag.startsWith('SNAV-')) return;
    if (node.shadowRoot) { for (const c of node.shadowRoot.childNodes) walk(c); return; }
    if (tag === 'SLOT') { const a = node.assignedNodes ? node.assignedNodes({ flatten: true }) : []; for (const c of (a.length ? a : node.childNodes)) walk(c); return; }
    for (const c of node.childNodes) walk(c);
  };
  if (document.documentElement) walk(document.documentElement);
  if (!hit || !hit.parentElement) return JSON.stringify({ found: false, y: window.scrollY });
  hit.parentElement.scrollIntoView({ block: 'center' });
  try { window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); } catch (e) {}
  return JSON.stringify({ found: true, y: window.scrollY });
})()`;
}

/** 取出并清空页内钩子攒下的响应（每次读完即清，避免重复搬运大响应体）。 */
export const HOOK_TAKE_JS = `(() => { const out = window.__ovRpc || []; if (window.__ovRpc) window.__ovRpc = []; return JSON.stringify(out); })()`;

/**
 * 滚动轨迹压缩（纯函数）：保留前 head 条、后 tail 条，以及「可见性或视口内区块标题变化」的关键点，
 * 总数不超过 cap。每条保留原始读数序号 `i`，方便对照。
 */
export function compactScrollTrace(trace, { head = 5, tail = 15, cap = 60 } = {}) {
  const list = Array.isArray(trace) ? trace : [];
  const withIndex = list.map((e, i) => ({ i, ...e }));
  if (withIndex.length <= cap) return withIndex;
  const keep = new Set();
  for (let i = 0; i < Math.min(head, withIndex.length); i += 1) keep.add(i);
  for (let i = Math.max(0, withIndex.length - tail); i < withIndex.length; i += 1) keep.add(i);
  for (let i = 1; i < withIndex.length; i += 1) {
    const a = withIndex[i - 1];
    const b = withIndex[i];
    if (a.vis !== b.vis || (a.inView || []).join('|') !== (b.inView || []).join('|')) keep.add(i);
  }
  const picked = [...keep].sort((x, y) => x - y).map((i) => withIndex[i]);
  return picked.length <= cap ? picked : [...picked.slice(0, cap - tail), ...picked.slice(-tail)];
}

/* ------------------------------------------------------------------ *
 * 给其它 Semrush 脚本复用的网络证人封装（依赖注入，lib 本身不引 opencli）
 * ------------------------------------------------------------------ */

/**
 * 懒加载机制探针（诊断用，和响应体钩子一起在报表导航后尽早注入）。回答「下方区块靠什么触发加载」：
 *   ioCreated / ioObserved / ioCallbacks / ioIntersecting  IntersectionObserver 被创建、observe 的次数，
 *                                                          回调次数与其中 isIntersecting 的条目数
 *   scrollListeners / wheelListeners                       window / document 上注册的 scroll、wheel 监听数
 *   scrollEvents / trustedScrollEvents / wheelEvents       实际收到的滚动事件（含可信事件数）
 * IntersectionObserver 在不可见的标签页里不跑计算（渲染暂停），scroll 监听则只看事件——两种机制对
 * 「后台标签页」「纯 JS scrollTo」的敏感度不同，探针数据决定加固方向。注入晚于应用创建的 observer 时计数偏少。
 *
 * 【2026-09-13 实测结论（全球 + 研究分组钉住，一次 complete 的实跑）】探针在 readyState=loading 时装上：
 *   ioCreated 546、ioObserved 16、ioCallbacks 45、ioIntersecting 16；window/document 上 scroll 监听 4、
 *   wheel 监听 6；收到 scroll 事件 31（其中可信 13）、wheel 事件 0。
 * ⇒ 下方区块的挂载由 **IntersectionObserver** 驱动（observe 的 16 个目标 ≈ 懒加载挂件，全部等到了相交回调），
 *   不依赖 wheel：整轮没有任何 wheel 事件，区块照样全部加载。`window.scrollTo` 本身会产生可信的原生 scroll
 *   事件，IO 只要**页面可见、目标进入视口**就会回调。所以关键是可见性而不是输入方式：复核时「纯 JS 滚到底
 *   等 90 秒不加载、一次真实滚轮立刻加载」最可能是那个标签页当时不可见（渲染暂停时 IO 不计算，真实滚轮
 *   把窗口激活后才恢复）。加固方向因此是：抬前台 + 每步把 visibilityState 纳入稳定判据 + 判定前停在最终
 *   底部；补派发 scroll 事件只是廉价的保险，不是主因。
 */
export const LAZY_PROBE_JS = `(() => {
  if (window.__ovLazy) return JSON.stringify({ already: true });
  const L = window.__ovLazy = { installedAt: performance.now(), readyState: document.readyState, ioCreated: 0, ioObserved: 0, ioCallbacks: 0, ioIntersecting: 0, scrollListeners: 0, wheelListeners: 0, scrollEvents: 0, trustedScrollEvents: 0, wheelEvents: 0 };
  const IO = window.IntersectionObserver;
  if (typeof IO === 'function') {
    const Wrapped = function (callback, options) {
      L.ioCreated += 1;
      const cb = function (entries) { L.ioCallbacks += 1; try { L.ioIntersecting += entries.filter((e) => e.isIntersecting).length; } catch (e) {} return callback.apply(this, arguments); };
      const observer = new IO(cb, options);
      const observe = observer.observe.bind(observer);
      observer.observe = function (target) { L.ioObserved += 1; return observe(target); };
      return observer;
    };
    Wrapped.prototype = IO.prototype;
    try { window.IntersectionObserver = Wrapped; } catch (e) {}
  }
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (this === window || this === document || this === document.documentElement || this === document.body) {
      if (type === 'scroll') L.scrollListeners += 1;
      if (type === 'wheel' || type === 'mousewheel') L.wheelListeners += 1;
    }
    return add.call(this, type, fn, opts);
  };
  add.call(window, 'scroll', (e) => { L.scrollEvents += 1; if (e.isTrusted) L.trustedScrollEvents += 1; }, { passive: true, capture: true });
  add.call(window, 'wheel', () => { L.wheelEvents += 1; }, { passive: true, capture: true });
  return JSON.stringify({ installed: true });
})()`;

export const ARM_XHR_PATTERN = '__semrush_overview_arm_never_matches__';

/**
 * 布防会话级网络捕获：`wait xhr <永不匹配> --timeout 1`——只调 startNetworkCapture，不带 URL、不导航
 * （不会把带令牌的 URL 写进访问日志）。必须在报表导航**之前**调用。
 *   runOpencli(args, options) → { stdout }，调用方传 opencli-core 的 `opencli`
 */
export async function armNetworkCapture({ runOpencli, session, env = {} }) {
  if (typeof runOpencli !== 'function' || !session) throw new Error('armNetworkCapture needs runOpencli and session');
  const res = await runOpencli(['browser', session, 'wait', 'xhr', ARM_XHR_PATTERN, '--timeout', '1000'], { env, timeoutMs: 60_000, allowFailure: true });
  return { armed: true, output: String(res?.stdout ?? '').replace(/\s+/g, ' ').slice(0, 200) };
}

const firstJsonLoose = (text) => {
  const s = String(text ?? '');
  const at = s.search(/[[{]/);
  if (at < 0) throw new Error('no JSON payload');
  return JSON.parse(s.slice(at));
};

/**
 * 页面静默之后调用一次：drain 网络捕获 + 取页内钩子 + 读资源计时，合并成接口口径证人与响应体对账。
 *   evaluate(expression) → 已解析的 JSON（调用方的 evalPage）
 *   ctx                  可选：trendContext / trendContextFromText 的结果（页面级那套趋势）
 * 返回 { witness, bodies, rpcEntries }；任何一步失败都抛出，由调用方决定降级。
 * ⚠️ drain 会清空捕获缓冲，在途请求的响应体会丢——只在页内已静默时调用（见 networkGate）。
 */
export async function drainRpcWitness({ runOpencli, session, env = {}, evaluate, ctx = {}, parseJson = firstJsonLoose }) {
  if (typeof runOpencli !== 'function' || typeof evaluate !== 'function' || !session) throw new Error('drainRpcWitness needs runOpencli, evaluate and session');
  const net = await evaluate(`(() => JSON.stringify({ timeOrigin: performance.timeOrigin, rtCount: performance.getEntriesByType('resource').filter((e) => /\\/dpa\\/rpc/.test(e.name)).length, rtBeforeHook: window.__ovHookAt == null ? null : performance.getEntriesByType('resource').filter((e) => /\\/dpa\\/rpc/.test(e.name) && e.startTime < window.__ovHookAt).length }))()`);
  const res = await runOpencli(['browser', session, 'network', '--raw'], { env, timeoutMs: 180_000 });
  const navStart = Number(net?.timeOrigin) || 0;
  const stampOf = (e) => (typeof e.timestamp === 'number' ? e.timestamp : Date.parse(e.timestamp));
  const drained = (parseJson(res?.stdout).entries || [])
    .filter((e) => /\/dpa\/rpc/.test(String(e.url || '')))
    .filter((e) => !(navStart > 0 && Number.isFinite(stampOf(e)) && stampOf(e) < navStart - 5))
    .filter((e) => Number(e.status) > 0 && e.body != null)
    .map((e) => ({ ...e, via: 'cdp' }));
  const hooked = await evaluate(HOOK_TAKE_JS);
  const rpcEntries = [...drained, ...(Array.isArray(hooked) ? hooked.map((e) => ({ ...e, via: e.via || 'hook' })) : [])];
  return {
    witness: rpcScopeWitness(flattenRpc(rpcEntries), ctx),
    bodies: accountRpcBodies(rpcEntries, { rtCompleted: net?.rtCount ?? 0, rtBeforeHook: net?.rtBeforeHook ?? null }),
    rpcEntries,
  };
}

/* ------------------------------------------------------------------ *
 * 编排：滚动 + 轮询 + 闸门（io 注入，离线可测）
 * ------------------------------------------------------------------ */

/**
 * io 契约（脚本里接 opencli，测试里接假数据）：
 *   readPage()        → PAGE_READ_JS 的解析结果
 *   takeHook()        → 页内钩子新攒的响应 [{url, body, status, timestamp}]
 *   drain()           → CDP 捕获条目 [{url, status, body, timestamp}]（opencli network --raw）
 *   scrollTo(y)       → 滚动
 *   sleep(ms) / now() → 时钟
 *
 * 不变量（反例测试逐条钉住）：
 *   1. 超时之前**只有**「DOM 一路 + 网络一路」同一轮都通过才会返回 complete；
 *   2. 超时返回的一定是 incomplete，并带上卡住的区块和当时的网络 pending 数；
 *   3. 合法空态 / 付费墙是终态，全部区块到终态且网络通过就立即结束，不死等；
 *   4. 函数本身从不关闭标签页或结束会话（那是调用方在拿到结果之后的事）。
 */
export async function runReadiness(io, {
  timeoutMs = 150_000,
  intervalMs = 2500,
  quietMs = 4000,
  stepTimeoutMs = 15_000,
  scrollRatio = 0.7,
  log = () => {},
} = {}) {
  const t0 = io.now();
  const deadline = t0 + Math.max(0, timeoutMs);
  const rpcEntries = [];
  let cdpSentTotal = 0;
  let lastDrainPending = 0;
  // 「请求完成了」和「拿到了响应体」是两件事：2026-09-13 实跑 21 条 rpc 全部 200，其中 16 条（恰好是
  // 区块数据那批）在捕获里 body=null、size=0——闸门照样过，接口证人却是空的。单独计数、单独阻断。
  const rpcBodies = { withBody: 0, missing: 0 };
  let reads = 0;
  let last = null;
  let prevDom = null;
  const stableCount = {};
  const firstTerminalAt = {};
  const sticky = {};
  let reachedBottom = false;
  let readsAfterBottom = 0;
  let passes = 0;
  let lastGate = null;
  let lastSections = null;
  let lastQuiet = null;
  // 趋势口径上下文记住最后一次非空值：SEO 卡片 / 研究分组被虚拟化回收后，不能把已经认出来的口径忘掉。
  const trendMemory = {
    pagePositions: null, pageKey: null, pageSource: null, pageAmbiguous: false,
    organicPositions: null, organicKey: null, organicSource: null, organicAmbiguous: false,
    ambiguityReasons: [], series: [], cardKeywordsShown: null, cardTrafficShown: null,
  };
  const visibility = { reads: 0, hidden: 0, first: null, last: null };
  // 分组徽标：整轮每次读都记，出现过的值全部保留（中途被改写要能看出来）。
  const groupBadges = { organic: { headingSeen: false, values: [] }, ads: { headingSeen: false, values: [] }, backlinks: { headingSeen: false, values: [] } };
  const targeted = [];
  // 滚动轨迹：每次读数一条（滚动位置、视口高、页高、可见性、视口内的区块标题）。
  const scrollTrace = [];
  let scrollExhausted = false;
  let lastLocateConflicts = [];
  const atBottomOf = (p) => Boolean(p) && (Number(p.scrollY) || 0) + (Number(p.innerHeight) || 0) >= (Number(p.scrollHeight) || 0) - 4;

  const read = async () => {
    const page = await io.readPage();
    reads += 1;
    visibility.reads += 1;
    if (page.vis === 'hidden') visibility.hidden += 1;
    visibility.first ??= page.vis;
    visibility.last = page.vis;
    const badges = readGroupBadges(page.toks || []);
    for (const name of Object.keys(groupBadges)) {
      if (badges[name].headingSeen) groupBadges[name].headingSeen = true;
      if (badges[name].badge && !groupBadges[name].values.includes(badges[name].badge)) groupBadges[name].values.push(badges[name].badge);
    }
    try { const hooked = await io.takeHook(); if (Array.isArray(hooked)) rpcEntries.push(...hooked); } catch { /* 钩子取不到不影响闸门 */ }
    last = page;
    scrollTrace.push({
      atMs: io.now() - t0, read: reads, y: page.scrollY ?? null, vh: page.innerHeight ?? null, H: page.scrollHeight ?? null,
      vis: page.vis ?? null, atBottom: atBottomOf(page), inView: Array.isArray(page.inView) ? page.inView.slice(0, 12) : [],
    });
    return page;
  };

  const assess = (page, gate) => {
    const dom = readDomSections(page.toks, { placeholders: page.placeholders || [] });
    lastLocateConflicts = dom.locateConflicts || [];
    const rpc = flattenRpc(rpcEntries);
    const quiet = pageNetworkQuiet(page.net, { quietMs });
    lastQuiet = quiet;
    const seoRendered = dom.sections.seo.state === 'rendered';
    {
      const fresh = trendContext(rpc, dom.sections, groupBadges);
      // 唯一认出来的结果（证据更全）优先；只有从没认出来时，歧义才留在记忆里（最终会成为阻断）。
      if (fresh.pageKey) Object.assign(trendMemory, { pagePositions: fresh.pagePositions, pageKey: fresh.pageKey, pageSource: fresh.pageSource, pageAmbiguous: false, cardKeywordsShown: fresh.cardKeywordsShown, cardTrafficShown: fresh.cardTrafficShown });
      else if (fresh.pageAmbiguous && !trendMemory.pageKey) trendMemory.pageAmbiguous = true;
      if (fresh.organicKey) Object.assign(trendMemory, { organicPositions: fresh.organicPositions, organicKey: fresh.organicKey, organicSource: fresh.organicSource, organicAmbiguous: false });
      else if (fresh.organicAmbiguous && !trendMemory.organicKey) trendMemory.organicAmbiguous = true;
      if (fresh.ambiguityReasons.length) trendMemory.ambiguityReasons = fresh.ambiguityReasons;
      if (fresh.series.length) trendMemory.series = fresh.series;
    }
    const trendCtx = { ...trendMemory };
    const sections = {};
    for (const spec of SECTION_SPECS) {
      let d = dom.sections[spec.key];
      const fp = d.fingerprint ?? d.state;
      stableCount[spec.key] = prevDom && (prevDom[spec.key]?.fingerprint ?? prevDom[spec.key]?.state) === fp ? (stableCount[spec.key] || 1) + 1 : 1;
      // 懒加载列表被虚拟化回收（标题从 DOM 消失）时沿用最后一次终态观测；
      // 退回 loading（重新请求）不沿用——那必须重新走完。
      if (d.state === 'not-found' && sticky[spec.key]) d = { ...sticky[spec.key].dom, stickyFromRead: sticky[spec.key].read };
      const stable = d.stickyFromRead ? true : stableCount[spec.key] >= 2;
      const built = buildSectionData(spec.key, rpc, { ...trendCtx, domSections: dom.sections });
      const laterSectionRendered = SECTION_SPECS.slice(SECTION_SPECS.indexOf(spec) + 1).some((later) => dom.sections[later.key].state !== 'not-found');
      let c = classifySection(spec, d, stable, built, {
        reachedBottom, quiet: quiet.quiet && (!gate || gate.pass), seoRendered, readsAfterBottom,
        laterSectionRendered, hiddenSeen: visibility.hidden > 0,
      });
      if (spec.key === 'seo' && c.state === 'data') {
        const check = seoCardCheck(d.content);
        if (!check.ok) c = { state: 'loading', reason: check.reason, evidence: c.evidence };
      }
      // 同形响应分不清是自然还是付费：不管 DOM 是什么状态，都不许到终态（包括 data 与 absent）。
      if (built.ambiguous) {
        c = { state: 'loading', reason: `ambiguous-organic-vs-paid(${built.ambiguous.candidates} same-shape responses; ${built.ambiguous.reason})`, evidence: { ...c.evidence, ambiguous: built.ambiguous } };
      }
      // 排名分布：直方图合计必须等于同一行的关键词总数，否则说明取错了序列或字段错位——不许到终态。
      if (built.data && built.data.totalMatches === false && TERMINAL_STATES.has(c.state)) {
        c = { state: 'loading', reason: `distribution-total-mismatch(sum ${built.data.total} vs reported ${built.data.reportedTotal})`, evidence: c.evidence };
      }
      sections[spec.key] = { name: spec.name, group: spec.group, ...c, _dom: d, _rpc: built };
      const direct = dom.sections[spec.key];
      if (TERMINAL_STATES.has(c.state)) {
        firstTerminalAt[spec.key] ??= io.now() - t0;
        // 只缓存**直接观测到**的终态（它已经过了「连续两次一致 + 网络静默」）。
        if (!d.stickyFromRead && direct.state !== 'not-found') sticky[spec.key] = { dom: direct, read: reads };
      } else {
        delete firstTerminalAt[spec.key];
        // 缓存二次校验：区块又被直接观测到、而且这次不是终态（重新请求/骨架/数值在变），
        // 旧的终态快照作废——不许让一次过期观测黏住（checker 2026-09-13 低风险项）。
        if (direct.state !== 'not-found') delete sticky[spec.key];
      }
    }
    prevDom = dom.sections;
    return { sections, pagePlaceholders: dom.pagePlaceholders, quiet };
  };

  const waitStep = async () => {
    const stepDeadline = Math.min(deadline, io.now() + stepTimeoutMs);
    let prevFp = null;
    while (io.now() < stepDeadline) {
      await io.sleep(intervalMs);
      const page = await read();
      const fp = page.toks.join('');
      const quiet = pageNetworkQuiet(page.net, { quietMs });
      assess(page, null);
      // hidden 读数不算这一步稳定：不可见的标签页里懒加载（IntersectionObserver）不会推进。
      if (fp === prevFp && quiet.quiet && !(page.placeholders || []).length && page.vis !== 'hidden') return;
      prevFp = fp;
    }
  };

  // 首屏
  await waitStep();
  // 自上而下分段滚动，直到到底且高度不再变；not-found 残留时再完整走一遍（最多 2 遍）
  while (io.now() < deadline && passes < 2) {
    passes += 1;
    let y = passes === 1 ? (last?.scrollY || 0) : 0;
    if (passes > 1) { await io.scrollTo(0); await waitStep(); }
    let lastHeight = -1;
    let bottomConfirmed = false;
    for (let guard = 0; guard < 40 && io.now() < deadline; guard += 1) {
      const vh = last?.innerHeight || 800;
      const H = last?.scrollHeight || 0;
      const atBottom = (last?.scrollY || 0) + vh >= H - 4;
      // 「到底」= 到底判据成立 **且** 页高与上一步相同（懒加载没有再把页面撑高）。只有这样退出循环才算到过底。
      if (atBottom && H === lastHeight) { bottomConfirmed = true; break; }
      lastHeight = H;
      y = Math.min((last?.scrollY || 0) + Math.round(vh * scrollRatio), Math.max(0, H - vh));
      await io.scrollTo(y);
      await waitStep();
    }
    // 步数或时限耗尽退出 ≠ 到过底（旧版这里无条件置真）。前一遍确认过的不撤销。
    if (bottomConfirmed) { reachedBottom = true; scrollExhausted = false; } else if (!reachedBottom) scrollExhausted = true;
    if (!bottomConfirmed) break;
    const pending = Object.values(assess(last, null).sections).filter((s) => s.state === 'not-found');
    if (!pending.length) break;
  }

  // 定点等待：固定步长滚动可能跳过某个挂件的可视窗口，而虚拟化会把离开视口的挂件回收。
  // 对仍未到终态的区块，滚到它自己的标题（不在就滚到它前面最近一个已定位的标题），停下来等；
  // 等不到再以 0.3 屏的小步往下挪，最多 6 步。保守：仍然见证不到就保持非终态。
  if (typeof io.scrollToText === 'function') {
    const waitFor = async (key) => {
      const until = Math.min(deadline, io.now() + stepTimeoutMs);
      while (io.now() < until) {
        await io.sleep(intervalMs);
        const page = await read();
        const s = assess(page, null).sections[key];
        if (TERMINAL_STATES.has(s.state)) return s.state;
      }
      return null;
    };
    const stuckKeys = Object.entries(assess(last, null).sections)
      .filter(([, s]) => ['not-rendered', 'not-found', 'loading'].includes(s.state))
      .map(([key]) => key);
    for (const key of stuckKeys) {
      if (io.now() >= deadline) break;
      const spec = SECTION_SPECS.find((s) => s.key === key);
      const texts = (last?.toks || []).map((t) => norm(t));
      const { found, groupIndex } = locateSections(last?.toks || []);
      // 锚点优先级：自己的标题 → 所属分组的大标题 → 前面最近一个已定位的标题。
      // 2026-09-13 实跑：只按清单顺序往回找时，付费区块标题已被虚拟化回收，反向链接明细一路锚到了
      // 「关键主题」（隔着整个广告研究分组），停下来等的位置根本不在它附近。
      let anchorIndex = found[key];
      if (anchorIndex == null) {
        if (spec.group === 'organic' || spec.group === 'ads') anchorIndex = groupIndex[spec.group] ?? null;
        if (spec.group === 'backlinks') {
          const from = Math.max(groupIndex.ads ?? -1, groupIndex.organic ?? -1) + 1;
          for (let i = from; i < texts.length && anchorIndex == null; i += 1) {
            if (/^(反向链接|Backlinks)$/i.test(texts[i]) && /^(全世界|全球|Worldwide|Global|[A-Z]{2})$/.test(texts[i + 1] || '')) anchorIndex = i;
          }
        }
      }
      for (let j = SECTION_SPECS.indexOf(spec) - 1; anchorIndex == null && j >= 0; j -= 1) anchorIndex = found[SECTION_SPECS[j].key];
      if (anchorIndex == null) { targeted.push({ key, anchor: null, reached: null }); continue; }
      const anchor = texts[anchorIndex];
      const occurrence = texts.slice(0, anchorIndex).filter((t) => t === anchor).length;
      let moved = null;
      try { moved = await io.scrollToText(anchor, occurrence); } catch (error) { log(`scrollToText failed: ${error.message}`); }
      let reached = await waitFor(key);
      let nudges = 0;
      while (!reached && nudges < 6 && io.now() < deadline) {
        nudges += 1;
        await io.scrollTo((last?.scrollY || 0) + Math.round((last?.innerHeight || 800) * 0.3));
        reached = await waitFor(key);
      }
      targeted.push({ key, anchor, anchorFound: Boolean(moved?.found), nudges, reached });
    }
  }

  // 到底之后：轮询到两路同一轮都通过，或超时
  while (true) {
    let page = await read();
    // 做判定的读数必须停在最终底部：定点等待可能把页面留在中段，而下方区块只在真正到底时挂载。
    // 不在底部就先滚回底部、等一个间隔再读（到时限就照常判，finalRead 会记下 last-read-not-at-bottom）。
    if (reachedBottom && !atBottomOf(page) && io.now() < deadline) {
      await io.scrollTo(Number(page.scrollHeight) || 0);
      await io.sleep(intervalMs);
      page = await read();
    }
    if (reachedBottom) readsAfterBottom += 1;
    let { sections, pagePlaceholders, quiet } = assess(page, null);
    const domCandidate = Object.values(sections).every((s) => TERMINAL_STATES.has(s.state)) && !pagePlaceholders.length;
    if (quiet.quiet && (domCandidate || io.now() >= deadline)) {
      // 页内已静默才 drain（见 networkGate 的 ⚠️）。
      let drained = [];
      try { drained = (await io.drain()) || []; } catch (error) { log(`drain failed: ${error.message}`); }
      // 捕获是在**上一个页面**上布防的：导航前那一瞬旧页面发出的 rpc 也会进捕获，
      // 但它们永远不会出现在新 document 的资源计时里——不剔除就会「发出数 > 完成数」永远不过闸。
      // 判据：CDP 条目时间戳（扩展侧 Date.now()）早于新 document 的 performance.timeOrigin 即剔除；
      // 没有时间戳的条目保留（宁可多算发出数，也不少算）。
      const navStart = Number(page.net?.timeOrigin) || 0;
      const stampOf = (e) => (typeof e.timestamp === 'number' ? e.timestamp : Date.parse(e.timestamp));
      const rpcDrained = drained
        .filter((e) => /\/dpa\/rpc/.test(String(e.url || '')))
        .filter((e) => !(navStart > 0 && Number.isFinite(stampOf(e)) && stampOf(e) < navStart - 5));
      cdpSentTotal += rpcDrained.length;
      lastDrainPending = rpcDrained.filter((e) => !(Number(e.status) > 0)).length;
      rpcEntries.push(...rpcDrained.filter((e) => Number(e.status) > 0 && e.body != null).map((e) => ({ ...e, via: 'cdp' })));
      const cdpWithoutBody = rpcDrained.filter((e) => Number(e.status) > 0 && e.body == null).length;
      const after = await read();
      const afterQuiet = pageNetworkQuiet(after.net, { quietMs });
      // 响应体按「两个来源合起来的不同响应数 vs 资源计时完成数」对账，见 accountRpcBodies。
      const bodies = { ...accountRpcBodies(rpcEntries, { rtCompleted: after.net?.rtCount ?? 0, rtBeforeHook: after.net?.rtBeforeHook ?? null }), cdpWithoutBody };
      rpcBodies.withBody = bodies.withBody;
      rpcBodies.missing = bodies.missing;
      lastGate = { ...networkGate({ cdpSentTotal, rtCompleted: after.net?.rtCount ?? 0, pendingInDrain: lastDrainPending, pageQuiet: afterQuiet }), bodies };
      ({ sections, pagePlaceholders } = assess(after, lastGate));
      lastSections = sections;
      const verdict = evaluateCompleteness(sections, { elapsedMs: io.now() - t0, gate: lastGate, pagePlaceholders, reachedBottom, locateConflicts: lastLocateConflicts, scrollExhausted, finalRead: last ? { atBottom: atBottomOf(last), vis: last.vis ?? null } : null });
      // 超时之后才凑齐的判定一律不算：用户给的时限就是时限（反例 R4：3 秒超时必须 incomplete）。
      if (verdict.status === 'complete' && io.now() <= deadline) return finish(verdict, sections);
    } else {
      lastSections = sections;
      lastGate = { pass: false, reasons: [quiet.quiet ? 'dom-not-terminal' : `page-not-quiet(${quiet.reason})`], sent: cdpSentTotal || null, completed: page.net?.rtCount ?? null, pending: page.net?.hookPending ?? null };
    }
    if (io.now() >= deadline) {
      const verdict = evaluateCompleteness(lastSections, { elapsedMs: io.now() - t0, gate: lastGate, pagePlaceholders, reachedBottom, locateConflicts: lastLocateConflicts, scrollExhausted, finalRead: last ? { atBottom: atBottomOf(last), vis: last.vis ?? null } : null });
      // 超时分支**永远**是 incomplete，哪怕最后一轮读数看起来齐了——那一轮没在时限内被确认。
      return finish({ ...verdict, status: 'incomplete', blockers: [...verdict.blockers, 'deadline-reached-before-confirmed-complete'] }, lastSections, true);
    }
    await io.sleep(intervalMs);
  }

  function finish(verdict, sections, timedOut = false) {
    const lastRpcEpoch = last?.net?.rtLastEnd != null && last?.net?.timeOrigin ? Math.round(last.net.timeOrigin + last.net.rtLastEnd) : null;
    return {
      verdict: { ...verdict, timedOut },
      sections,
      rpcEntries,
      lastPage: last,
      groupBadges,
      trendContext: { ...trendMemory },
      readiness: {
        targeted,
        startedAt: t0,
        decidedAtMs: io.now() - t0,
        lastRpcReturnedAt: lastRpcEpoch ? new Date(lastRpcEpoch).toISOString() : null,
        sectionTerminalAtMs: { ...firstTerminalAt },
        reads,
        scrollPasses: passes,
        reachedBottom,
        scrollExhausted,
        readsAfterBottom,
        scrollTrace: compactScrollTrace(scrollTrace),
        lazyLoadProbe: last?.lazy ?? null,
        pageNetwork: lastQuiet,
        visibility,
      },
    };
  }
}

/* ------------------------------------------------------------------ *
 * 窗口 / 可见性——activate-chrome 与 --window 的统一入口（2026-09-14）
 * ------------------------------------------------------------------ *
 * 放在这个纯逻辑层而不是 semrush-overview.mjs 自己，理由跟文件头一致：
 * semrush-overview.mjs 顶层是一段直接执行、会 throw-on-missing-`--domain`
 * 的脚本体，import 它做单测会连带跑起整段启动流程；这两个函数不碰浏览器，
 * 本来就该住在这里，供 tests/semrush-overview-visibility.test.mjs 离线断言。
 */

/** 见 semrush-overview.mjs 用它做 launchTool 的默认 window 参数。 */
export const DEFAULT_WINDOW = 'active';

/**
 * 纯函数：activate-chrome 与 --window 的统一入口。
 *   - 没有显式 `--window`：默认 DEFAULT_WINDOW（'active'）——它在不夺 OS 焦点的
 *     前提下解决"后台标签页不水合"，opencli 的 `foreground`（raise + select）
 *     不再是默认。
 *   - 显式 `--window <mode>`：原样透传（foreground/active/background/isolated）……
 *   - ……**除了** `activateChrome === false` 且解出来的模式是 `foreground` 时，
 *     强制降级成 `active`：`--activate-chrome false` 的承诺是"这次运行不会有任何
 *     OS 级抢焦点"，opencli 的 `foreground` 会把 Chrome 应用整个 raise 到最前，
 *     这本身就是一种抢焦点，允许它绕过这个开关就是自相矛盾。
 */
export function resolveOverviewWindowMode({ windowFlag, activateChrome } = {}) {
  const requested = typeof windowFlag === 'string' && windowFlag ? windowFlag : DEFAULT_WINDOW;
  if (!activateChrome && requested === 'foreground') return { windowMode: 'active', downgraded: true };
  return { windowMode: requested, downgraded: false };
}

/**
 * OS 级 `open -a` 抬前台的节流器：导航前 1 次 + 之后每次读到 hidden 补抬 1 次，
 * 整次运行不超过 `maxActivations`（默认 3）。`activate` 是"真正执行一次抬前台"的
 * 依赖注入（生产环境是 `open -a "Google Chrome"`），换成假实现就能离线测
 * "上限生效""次数计数""activate-chrome=false 时 0 次"这些行为，不用真的起 Chrome。
 *
 * 用满上限之后不再抬，但**只在第一次撞上限时**记一条 `hint`——调用方（人）
 * 只需要看到一次"该保持窗口可见了"的提示，不需要每次 hidden 读数都重复一遍。
 */
export function createChromeActivator({ enabled, maxActivations = 3, activate, now = () => new Date().toISOString() }) {
  const state = {
    enabled, maxActivations, activations: 0, activationLog: [], activationCapReached: false, hint: null, errors: [],
  };
  async function bringChromeForward(reason) {
    if (!enabled) return state;
    if (state.activations >= maxActivations) {
      if (!state.activationCapReached) {
        state.activationCapReached = true;
        state.hint = `已达到本次运行的激活上限（${maxActivations} 次），之后即使再读到 document.hidden 也不会再抬前台。` +
          '运行期间请保持 Chrome 窗口可见（未被遮挡切走，或放在副屏/虚拟屏幕上），否则报表可能因为标签页不可见而停在 incomplete。';
      }
      return state;
    }
    try {
      await activate();
      state.activations += 1;
      state.activationLog.push({ at: now(), reason });
    } catch (error) {
      state.errors.push(`${reason}: ${String(error?.message || error).slice(0, 160)}`);
    }
    return state;
  }
  return { state, bringChromeForward };
}
