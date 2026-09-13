#!/usr/bin/env node
/**
 * semrush-traffic.mjs — 读 Semrush「流量与市场」(Traffic & Market / .Trends) 的
 * **流量分析总览**：总访问量、唯一访客、购买转化率、页数/访问、平均访问时长、跳出率。
 *
 * 为什么需要这个脚本（它和 semrush-report.mjs 不重复）：
 * semrush-report.mjs / semrush-overview.mjs 读的全是**自然搜索**口径的数——
 * organic traffic 是「Semrush 估算的搜索带来的访问」，天然只有总量的一小块。
 * 跨平台并列时真正对得上 Similarweb 的是 .Trends 这个总访问量口径：
 * 2026-08-28 实测 canva.com 两家相差 2.4%（见 rankup/references/provider-capabilities.md）。
 * semrush-report.mjs 的 `note` 字段早就把读者指向这个路由了，但一直没有脚本实现它——
 * 本文件把那句注释兑现，别再写第二个。
 *
 * 2026-08-30 双证人化：失败路径退出前 captureScene 落现场，截图链路已实盘验证。
 *
 * 用法：
 *   node semrush-traffic.mjs --domain canva.com
 *   node semrush-traffic.mjs --domain canva.com --out traffic.json --json
 *   node semrush-traffic.mjs --self-test
 *
 * 参数：--domain（必填）/ --session / --node / --out / --json / --help
 *       --settle --timeout --stable-interval 调节等待，正常不用给。
 *       --scroll-segments[=N] / --scroll-pause 分段滚动，**默认关闭**，理由见调用点注释。
 *       （`--input-timeout` 已废弃：这条路由上没有输入框，见下面第 3 条。）
 *       --window 默认 **virtual-display**（2026-09-14）：把自动化窗口放到虚拟屏幕上并选中标签页，
 *       可见但不抢焦点；检测不到虚拟屏幕时回退为 **foreground**（见下面 DEFAULT_WINDOW 的注释：
 *       这张报表在后台标签页里不水合）。可显式覆盖成 foreground / active / background / isolated
 *       （原样透传，不走虚拟屏幕）。--automation-display <name|/re/|off> 调虚拟屏幕名匹配。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 已实测确认的 DOM 契约（2026-08-28 canva.com，**照抄，不要凭直觉改**）
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. 路由是 `/analytics/traffic/traffic-overview/`。**不是**
 *    `/analytics/traffic/overview/` —— 后者 302 到 Getting Started 落地页并把 query 丢掉，
 *    于是你会在一个空态页上「成功」解析出一堆 null。
 *
 * 2. **目标从 query string 来，不从输入框来。**
 *    `?q=<域名>&searchType=domain` —— **两个参数缺一不可**。
 *
 *    ⚠️ 这一条在 2026-08-29 之前是写反的。旧注释写着「深链参数不管用，必须在页面上
 *    填域名提交」，那次测试**漏了 `searchType=domain`**，只拼了 `?q=<domain>`，
 *    看到页面停在空态就下了「深链不被识别」的结论。同一条错误记录也进了
 *    `rankup/data/provider-capabilities.json`，已一并更正。
 *
 * 3. **这条路由上没有查询表单。** 2026-08-29 持锁实盘 3 次干净复现：裸导航
 *    `TRAFFIC_PATH` 落地页标题是 `Dashboards`，整页**唯一的 input 是 13 个 checkbox**；
 *    在确认 `visibilityState === 'visible'` 的前台标签页上轮询 36 秒，
 *    从来没有出现过任何文本/搜索输入框。
 *
 *    所以旧驱动层里等 `input[aria-label="Input target"]` 的那段**永远不可能成功**，
 *    它后面的提交函数在这个页面上是死代码。整条路径已删除，理由三条：
 *      - 这条路由上没有表单可提交，留着就是留一段跑不到的代码；
 *      - 旧的提交函数「只要元素存在就 `ok:true`」，从不校验提交是否落地——
 *        第一次污染运行报的「37 次读取」就是它在读**另一个任务的 dashboard**；
 *      - 无法离线测、也没有第二个调用方（本轮 grep 确认过），留着只会腐烂。
 *    真要在别的路由上填表，用 `safe-fill.mjs` / `lib-submit-outcome.mjs`——
 *    那两处本来就带「提交是否落地」的判据，别在这里重造一个更弱的。
 *
 * 3b. **不许把「读到了报表」建立在中文文案上。** 这个共享账号的 Semrush UI 是中文
 *    （`输入网站或关键词` / `输入域名`），写死英文 `aria-label="Input target"` 的
 *    选择器在它上面一次都匹配不上——这是独立于路由问题的另一个潜伏 bug。
 *    现在导航是否落地用的是**结构信号**：落地 URL 里 `q` / `searchType` 还在不在
 *    （见 `classifyDeepLink`），完全不看文案。文案只在**诊断失败原因**时用到，
 *    并且走 `lib-report-readiness.mjs` 的 locale 表：locale 没覆盖就判 `unknown`，
 *    不默认通过。
 *
 * 4. **就绪判据必须限定在「摘要」区内**，区间是 innerText 里 `摘要` 的下标到
 *    `流量趋势` 的下标之间。这里连续踩过三次坑，逐条写下来：
 *      ❌ 不能在整页找数字：页面**底部有别的工具的挂件**（本地可见度差距 / axa.fr /
 *         42 / 758 / 15%）。那是别人的数据，会让判据假阳性——空态页也「有数字」。
 *      ❌ 不能认「访问量」这类关键词：它出现在营销文案「通过访问量、跳出率和参与度
 *         对多个域名进行基准测试」里，空态页上就有。
 *      ❌ 不能认「有图表」：空态落地页本身就有装饰性 svg。
 *      ✅ 只认「摘要区内出现带 K/M/B/万/亿/% 的数字」。
 *
 * 5. 摘要区的真实文本形状（管道符代表换行）：
 *      摘要|摘要|导出|访问量|访问量|7.9亿|↑4.53%|84.26%|15.74%|唯一|唯一|2.1亿|↑2.92%|…
 *    三件必须记住的事：
 *      - **每个标签都重复两次**（可见标签 + a11y 副本）；
 *      - `访问量` 后面跟四个值：`值 | 环比 | 桌面占比 | 移动占比`，其余指标只跟两个；
 *      - `平均访问时长` 是 `mm:ss`，不是数字。
 *    所以解析器**不按位置切**，而是「标签开桶、带箭头的是环比、不带箭头的按顺序是
 *    值和附加占比」——多一个少一个占比都不会让别的字段错位。
 *
 * 6. 页头形如 `未命名列表 | <域名> | 全球 | 2026年7月 | 所有设备`，据此回报
 *    headerTarget / scope / period / devices。这几个是**元信息**，不能当就绪判据用
 *    （空态页上「全球」「所有设备」同样存在）。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 本仓库的硬性规则，本文件逐条遵守
 * ──────────────────────────────────────────────────────────────────────
 *  - 错误文本进输出前一律过 `redactSecrets`（opencli 失败会把带 __gmitm 令牌的
 *    会话 URL 打进 stderr）。有守卫测试 tests/redaction-guard.test.mjs 会扫。
 *  - **解析不出来给 null，绝不给 0。** 0 和 null 在这里含义相反：0 是「实测就是零」。
 *  - **空结果不是事实。** 摘要区拿不到值就输出 `status: 'unavailable'` 并说明原因，
 *    不输出一堆 0/null 假装成功。
 *  - 会话名不写死字面常量（同名会话 = 共用标签页，两个任务会互相读到对方的页面）。
 */
import { parseFlags, printJson, resolveSession, showHelpIfRequested } from './opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { parseNumber } from './lib-similarweb.mjs';
import { plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW } from './lib-automation-window.mjs';
import { classifyTargetScope } from './lib-report-readiness.mjs';
import { DEEP_DOM_JS, scrollThroughSegments } from './lib-deep-dom.mjs';
// 2026-08-30 双证人化：失败路径在退出前 captureScene（穿透 census + 截图）成对
// 落盘，unavailable 输出带 evidence 字段。截图链路已实盘验证。
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import { writeFile } from 'node:fs/promises';

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const TRAFFIC_PATH = '/analytics/traffic/traffic-overview/';
/** 目标类型。**和 `q` 一样是必需参数**：只给 `q` 页面停在空态，那正是旧结论写反的原因。 */
export const TRAFFIC_SEARCH_TYPE = 'domain';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * 深链。`q` + `searchType` 两个都要，缺一个页面就停在空态。
 * 域名走 `encodeURIComponent`——虽然域名里通常没有需要转义的字符，
 * 但拼 URL 不转义是一类会在别处咬人的习惯。
 */
export function buildTrafficUrl(origin, domain) {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}${TRAFFIC_PATH}?q=${encodeURIComponent(domain)}&searchType=${TRAFFIC_SEARCH_TYPE}`;
}

/**
 * **结构信号，不看一个字的文案。** 落地之后 URL 里还带不带我们请求的 `q`/`searchType`。
 *
 * 这是取代「等输入框 → 提交」那条路径的唯一就绪前提：目标是从 query string 进去的，
 * 那么 query string 被吞掉（`/analytics/traffic/overview/` 就会 302 丢 query）就是
 * 「这一页读到的不是我们要的目标」的确切证据，而且这个证据和 UI 语言无关。
 *
 * 返回 `{ ok, reason, pathname, q, searchType }`；`reason` 是稳定的机器码，不是文案。
 */
export function classifyDeepLink({ landedUrl, domain, expectedPath = TRAFFIC_PATH } = {}) {
  const base = { ok: false, reason: null, pathname: null, q: null, searchType: null };
  let url;
  try { url = new URL(String(landedUrl || '')); } catch { return { ...base, reason: 'unparsable-url' }; }
  const pathname = url.pathname;
  const q = url.searchParams.get('q');
  const searchType = url.searchParams.get('searchType');
  const out = { ...base, pathname, q, searchType };
  // 尾斜杠不作数：`/x/` 和 `/x` 是同一条路由。
  const norm = (p) => String(p || '').replace(/\/+$/, '');
  if (norm(pathname) !== norm(expectedPath)) return { ...out, reason: 'path-drift' };
  if (!q) return { ...out, reason: 'query-dropped' };
  if (String(q).trim().toLowerCase().replace(/^www\./, '') !== String(domain || '').toLowerCase()) {
    return { ...out, reason: 'query-target-mismatch' };
  }
  if (searchType !== TRAFFIC_SEARCH_TYPE) return { ...out, reason: 'search-type-dropped' };
  return { ...out, ok: true };
}

/**
 * 页头主体 vs 请求主体。**读到别人的页面必须是硬失败，不是一行 console.error。**
 *
 * 旧代码在这里只打一行警告就照常把数据写出去；同一次污染运行里「37 次读取」的那份
 * 数据其实来自另一个任务的 dashboard，而输出看上去是成功的。现在：
 *   - 页头主体和请求主体**不一致** → `mismatch`，调用方抛错，不出数；
 *   - 页头里**根本没找到主体** → `unknown`，记进输出但不阻断（页头形状变了不等于读错了页，
 *     而且深链校验已经在前面把「读的是不是这一页」挡住了一道）。
 */
export function verifyReportTarget({ headerTarget, domain } = {}) {
  const want = String(domain || '').trim().toLowerCase();
  const got = String(headerTarget || '').trim().toLowerCase().replace(/^www\./, '');
  if (!got) return { status: 'unknown', headerTarget: null, expected: want || null };
  if (!want) return { status: 'unknown', headerTarget: got, expected: null };
  return { status: got === want ? 'match' : 'mismatch', headerTarget: got, expected: want };
}

/**
 * **这张报表必须在前台标签页里跑。** 全仓的默认是后台
 * （`lib-tools-share.mjs` 的 `launchTool` 默认 `windowMode = 'background'`），
 * 这里是全仓唯一一处实测确认的例外，具体见
 * SKILL.md 的 <law id="hidden-tabs-do-not-hydrate">。
 *
 * 2026-08-28 控制变量实测：同一个标签页、同一个节点、**不重新提交**，
 * 只翻转 `document.visibilityState`：
 *   hidden  → `document.body.innerText` 长 549，摘要区只有标签、**零个值**
 *   visible → 长 1957，**所有值齐全**
 * 解析层是好的（把前台抓到的 innerText 喂给 parseTrafficSummary，15 个字段
 * 零容差全对）——坏的只是驱动层。
 *
 * 为什么是“默认前台”而不是“后台跑、发现没水合再自动转前台重试”：
 * 自动重试无法把两个真实原因分开——“后台不水合”和“这个域名在 .Trends
 * 里真的没数据”在页面上长得一模一样（都是“有标签无值”），于是每一次真空数据
 * 都要白白多花一轮 40–120 秒的重试，而且前台抢焦点这件事照样会发生，
 * 只是发生得更晚、更难预测。一次就前台，行为确定，错误信息也才能诚实。
 *
 * 仍然可以显式覆盖：`--window background` / `--window isolated`。
 * **不要因为这个去改 `lib-tools-share.mjs` 的公共默认**——semrush-report.mjs 和
 * similarweb-query.mjs 长期在后台模式下正常取数，改公共默认会让它们都去抢前台。
 */
export const DEFAULT_WINDOW = 'foreground';

export function normalizeDomain(value) {
  if (!value) return '';
  const c = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  return c.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

// ---------- 摘要区的切分与解析 ----------

/** 摘要区的边界字样。`摘要` 是区首，`流量趋势` 是区尾（下一个板块的标题）。 */
const SUMMARY_START = /摘要|Summary/;
const SUMMARY_END = /流量趋势|Traffic Trend/;

/**
 * 从整页 innerText 里切出摘要区。
 *
 * **这是本文件最重要的一个函数**，页面底部挂着别的工具的挂件（见头部注释第 4 条），
 * 整页扫描一定会读到别人的数字。切不出来就返回 null，让调用方判 unavailable——
 * 绝不退化成「那就整页找吧」。
 */
export function sliceSummary(bodyText) {
  const text = String(bodyText || '');
  const startMatch = text.match(SUMMARY_START);
  if (!startMatch) return null;
  const start = startMatch.index;
  const endMatch = text.slice(start).match(SUMMARY_END);
  // 尾界找不到就是**没渲染完**，不是「摘要一直到页尾」——后者会把底部别人的挂件圈进来。
  if (!endMatch) return null;
  return text.slice(start, start + endMatch.index);
}

/** 摘要区里出现了带 K/M/B/万/亿/% 的数字，才算这一屏真的有数据。 */
const SUMMARY_VALUE = /[\d.,]+\s*(?:[KMB]|万|亿|%)/i;

export function summaryHasValues(bodyText) {
  const region = sliceSummary(bodyText);
  return Boolean(region && SUMMARY_VALUE.test(region));
}

/**
 * 指标标签 → 输出字段前缀。英文标签是按大概率补的，**未经实测**；
 * 中文那一列才是 2026-08-28 实测确认过的。
 */
const METRICS = [
  { key: 'visits', labels: ['访问量', 'Visits'] },
  { key: 'unique', labels: ['唯一', '唯一访客', 'Unique Visitors', 'Unique'] },
  { key: 'purchaseConversion', labels: ['购买转化率', 'Purchase Conversion'] },
  { key: 'pagesPerVisit', labels: ['页数/访问', 'Pages / Visit', 'Pages/Visit'] },
  { key: 'avgVisitDuration', labels: ['平均访问时长', 'Avg. Visit Duration'] },
  { key: 'bounceRate', labels: ['跳出率', 'Bounce Rate'] },
];
/** 摘要区里出现、但不是指标的标签。碰到它们要**关掉当前桶**，
 *  否则「导出」后面万一跟点什么就会被算进上一个指标。 */
const NON_METRIC_LABELS = ['摘要', 'Summary', '导出', 'Export'];

const LABEL_TO_KEY = new Map();
for (const m of METRICS) for (const l of m.labels) LABEL_TO_KEY.set(l, m.key);

/** `↑4.53%` / `↓2.55%` / `+4.53%` / `-2.55%`。↓ 必须变负数。 */
const CHANGE = /^([↑↓▲▼+\-−])\s*([\d.,]+)\s*%?$/;
/** 明写的「没有这一项」。命中即当作缺值，不是 0。 */
const NO_VALUE = /^(?:不可用|n\/a|N\/A|—|–|-|--)$/i;

/** 百分数/纯数：去掉 % 再交给 parseNumber（它不认 %，会返回 null）。 */
function numeric(token) {
  const s = String(token ?? '').trim();
  if (!s || NO_VALUE.test(s)) return null;
  return parseNumber(s.replace(/%$/, ''));
}

/** `11:02` → 662；`1:02:03` → 3723。不是这个形状就返回 null，不猜。 */
export function durationToSeconds(text) {
  const s = String(text ?? '').trim();
  if (!/^\d{1,2}(:\d{2}){1,2}$/.test(s)) return null;
  const parts = s.split(':').map(Number);
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * 把摘要区文本切成「指标 → { values: [不带箭头的], change: 带箭头的 }」。
 *
 * 规则只有两条，刻意不依赖位置：
 *   1. 认识的标签开一个桶（**标签重复两次**，第二次开桶时前一个还是空的，直接复用）；
 *   2. 桶里带箭头的 token 是环比，不带箭头的按出现顺序进 values。
 * 这样 `访问量` 多出来的两个占比不会把后面的指标顶错位，少了也只是 values 短一截。
 */
export function bucketSummary(regionText) {
  const tokens = String(regionText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const buckets = new Map();
  let current = null;
  for (const token of tokens) {
    if (NON_METRIC_LABELS.includes(token)) { current = null; continue; }
    const key = LABEL_TO_KEY.get(token);
    if (key) {
      // 标签重复出现：桶还空着就复用（这是页面的 a11y 副本）；
      // 桶里已经有值了说明是别处又提了一次同名标签，**不覆盖已经收到的真值**。
      if (!buckets.has(key) || buckets.get(key).values.length === 0) {
        if (!buckets.has(key)) buckets.set(key, { values: [], change: null });
        current = buckets.get(key);
      } else {
        current = null;
      }
      continue;
    }
    if (!current) continue;                       // 还没进任何指标，忽略
    const change = token.match(CHANGE);
    if (change) { if (current.change === null) current.change = token; continue; }
    if (NO_VALUE.test(token)) { current.values.push(null); continue; }
    current.values.push(token);
  }
  return buckets;
}

/** `↑4.53%` → 4.53；`↓2.55%` → -2.55；认不出来 → null。 */
export function parseChangePercent(token) {
  const m = String(token ?? '').trim().match(CHANGE);
  if (!m) return null;
  const value = parseNumber(m[2]);
  if (value === null) return null;
  return /[↓▼\-−]/.test(m[1]) ? -value : value;
}

/**
 * 摘要区 → 15 个字段。任何一格解析不出来就是 null，**绝不落成 0**。
 * 返回 null 表示「这不是一个有数据的摘要区」，调用方据此判 unavailable。
 */
export function parseTrafficSummary(bodyText) {
  const region = sliceSummary(bodyText);
  if (!region || !SUMMARY_VALUE.test(region)) return null;
  const buckets = bucketSummary(region);
  const at = (key, i = 0) => buckets.get(key)?.values?.[i] ?? null;
  const change = (key) => parseChangePercent(buckets.get(key)?.change);
  const duration = at('avgVisitDuration');
  const durationText = duration && /^\d{1,2}(:\d{2}){1,2}$/.test(String(duration).trim())
    ? String(duration).trim() : null;

  return {
    visits: numeric(at('visits')),
    visitsChangePercent: change('visits'),
    // 「桌面占比 / 移动占比」只有访问量这一格有，且必须是第 2、3 个非箭头值。
    desktopSharePercent: numeric(at('visits', 1)),
    mobileSharePercent: numeric(at('visits', 2)),
    uniqueVisitors: numeric(at('unique')),
    uniqueChangePercent: change('unique'),
    purchaseConversionPercent: numeric(at('purchaseConversion')),
    purchaseConversionChangePercent: change('purchaseConversion'),
    pagesPerVisit: numeric(at('pagesPerVisit')),
    pagesPerVisitChangePercent: change('pagesPerVisit'),
    // 时长保留原文，另给一份秒数；`mm:ss` 不是数字，numeric() 会给 null，别用它。
    avgVisitDuration: durationText,
    avgVisitDurationSeconds: durationToSeconds(durationText),
    avgVisitDurationChangePercent: change('avgVisitDuration'),
    bounceRatePercent: numeric(at('bounceRate')),
    bounceRateChangePercent: change('bounceRate'),
  };
}

/**
 * 页头元信息：`未命名列表 | canva.com | 全球 | 2026年7月 | 所有设备`。
 * 只在**摘要区之前**的那段文本里找，页面底部别的工具的挂件同样带地区/设备字样。
 */
export function parseHeader(bodyText, expected) {
  const text = String(bodyText || '');
  const startMatch = text.match(SUMMARY_START);
  const head = text.slice(0, startMatch ? startMatch.index : Math.min(text.length, 2000));
  const lines = head.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const isHost = (l) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(l);
  const headerTarget = lines.find((l) => (expected ? l.toLowerCase() === expected : isHost(l)))
    || lines.find(isHost) || null;
  const period = lines.find((l) => /^\d{4}年\d{1,2}月$/.test(l) || /^[A-Z][a-z]+ \d{4}$/.test(l)) || null;
  const scope = lines.find((l) => /^(全球|Worldwide|Global)$/.test(l)) || null;
  const devices = lines.find((l) => /^(所有设备|All Devices|桌面|移动)/.test(l)) || null;
  return { headerTarget, period, scope, devices };
}

// ---------- 浏览器侧 ----------

/** 面板/工具页偶发的整页错误文案。站主口述：瞬时的，重载即恢复。 */
const TRANSIENT = /出错了|我们已经发现了问题|请稍后重试|Something went wrong/;

/**
 * 读一次「我现在在哪」：URL（深链校验用）+ 页面语言（诊断用）+ 瞬时错误页。
 * **一个选择器都不查**——这条路由上没有我们要找的控件，查了也只是自欺。
 */
async function readLocation(evalPage) {
  // ⚠️ 2026-08-29：瞬时错误页的文案也可能在 shadow DOM 里。整页 `innerText` 在这个站
  // 上只有 59 个字符（深层 1,605,054），认不到「出错了」不等于没出错。
  return await evalPage(`(() => {
    ${DEEP_DOM_JS}
    const root = document.body || document.documentElement;
    const deepText = deepTextSample(root, { maxChars: 20000 });
    return JSON.stringify({
      url: location.href,
      lang: document.documentElement?.getAttribute('lang') || '',
      transient: ${TRANSIENT.toString()}.test(deepText),
      shadowRoots: collectRoots(root).roots.length - 1,
      lightDom: { textLength: (document.body?.innerText || '').length },
      deep: { textLength: deepTextLength(root) },
    });
  })()`);
}

/**
 * 瞬时错误页（「出错了 / 请稍后重试」）就地重载一次，最多 `attempts` 次。
 * 这是原来 `waitForInput` 里唯一还有用的那半——它和输入框无关，所以留下来单独成函数。
 */
async function reloadPastTransient(evalPage, attempts = 2) {
  let state = await readLocation(evalPage);
  for (let i = 0; i < attempts && state?.transient; i += 1) {
    await evalPage('(() => { location.reload(); return JSON.stringify({ reload: 1 }); })()');
    // 条件等待，不是定长睡眠：每 1.5s 读一次「还在瞬时错误页吗」，最多 ~9s。
    // 恢复得快就快走，恢复得慢也不会在 6 秒整点误读一个还没重载完的页面。
    const deadline = Date.now() + 9_000;
    do {
      await sleep(1_500);
      state = await readLocation(evalPage);
    } while (state?.transient && Date.now() < deadline);
  }
  return state;
}

/**
 * 轮询到**解析结果稳定**再收下。
 *
 * 就绪判据只是入场券：这些页面先挂标签和占位值，几秒后真值才水合进来。
 * 所以指纹用 `parseTrafficSummary()` 的完整输出——连续两次完全一致才算数，
 * 指纹就是要写出去的那个对象，不存在「盯着 A、写出去 B」的漏洞。
 */
async function loadSummary(evalPage, { timeout, intervalMs }) {
  return await captureStable({
    // ⚠️ 2026-08-29：`bodyText` 改走穿透遍历。摘要区的切分（sliceSummary）、指标解析、
    // 页头解析全都吃这一份文本，所以只要它是浅层的，后面每一层都是在读页面的一小块。
    // **浅层长度一并带出来**（`lightDom.textLength`）：它和 `deep.textLength` 的差就是
    // 「这一页有多少东西藏在 shadow DOM 里」，是这次事故唯一的直接诊断量。
    read: () => evalPage(`(() => {
      ${DEEP_DOM_JS}
      const root = document.body || document.documentElement;
      const light = document.body?.innerText || '';
      const t = deepTextSample(root, { maxChars: 60000 });
      return JSON.stringify({
      url: location.href.split('?')[0], title: document.title,
      href: location.href, pathname: location.pathname,
      lang: document.documentElement?.getAttribute('lang') || '',
      transient: ${TRANSIENT.toString()}.test(t),
      bodyText: t.slice(0, 60000),
      deepProbe: true,
      shadowRoots: collectRoots(root).roots.length - 1,
      lightDom: { textLength: light.length },
      deep: { textLength: deepTextLength(root) },
      scrollContainers: deepScrollContainers(root).slice(0, 20),
    }); })()`),
    abortIf: (cap) => Boolean(cap?.transient),
    fingerprint: (cap) => {
      if (!cap?.bodyText || !summaryHasValues(cap.bodyText)) return null;
      const parsed = parseTrafficSummary(cap.bodyText);
      return parsed === null ? null : JSON.stringify(parsed);
    },
    timeoutMs: timeout * 1000,
    intervalMs,
  });
}

// ---------- 离线自测 ----------

export function runSelfTest() {
  const checks = [];
  const check = (name, ok, detail) => {
    checks.push(name);
    if (!ok) throw new Error(`semrush-traffic self-test failed at ${name}${detail ? `: ${detail}` : ''}`);
  };

  // 2026-08-28 canva.com 的真实 innerText，逐字照抄（含每个标签重复两次、
  // 访问量后面四个值、mm:ss 的时长）。**不是按摘要手打的简化版。**
  const realBody = [
    '未命名列表', 'canva.com', '全球', '2026年7月', '所有设备',
    '摘要', '摘要', '导出',
    '访问量', '访问量', '7.9亿', '↑4.53%', '84.26%', '15.74%',
    '唯一', '唯一', '2.1亿', '↑2.92%',
    '购买转化率', '购买转化率', '0.21%', '↑27.93%',
    '页数/访问', '页数/访问', '5.4', '↓2.55%',
    '平均访问时长', '平均访问时长', '11:02', '↑7.99%',
    '跳出率', '跳出率', '30.23%', '↑1.72%',
    '流量趋势',
    // 页面底部**别的工具的挂件**——整页扫描就会读到这些别人的数字。
    '本地可见度差距', 'axa.fr', '42', '758', '15%',
  ].join('\n');

  const parsed = parseTrafficSummary(realBody);
  const expected = {
    visits: 790000000, visitsChangePercent: 4.53,
    desktopSharePercent: 84.26, mobileSharePercent: 15.74,
    uniqueVisitors: 210000000, uniqueChangePercent: 2.92,
    purchaseConversionPercent: 0.21, purchaseConversionChangePercent: 27.93,
    pagesPerVisit: 5.4, pagesPerVisitChangePercent: -2.55,
    avgVisitDuration: '11:02', avgVisitDurationSeconds: 662, avgVisitDurationChangePercent: 7.99,
    bounceRatePercent: 30.23, bounceRateChangePercent: 1.72,
  };
  check('real-summary-15-fields', JSON.stringify(parsed) === JSON.stringify(expected),
    JSON.stringify({ parsed, expected }));
  check('field-count-is-15', Object.keys(parsed).length === 15, String(Object.keys(parsed).length));

  // ↓ 必须变负数，↑ 必须是正数——符号搞反了，读者会把跌当成涨。
  check('down-arrow-is-negative',
    parseChangePercent('↓2.55%') === -2.55 && parseChangePercent('↑7.99%') === 7.99
    && parseChangePercent('▼1.2%') === -1.2 && parseChangePercent('-3%') === -3
    && parseChangePercent('乱七八糟') === null);

  // 底部别人的挂件不能进摘要区——这是本文件踩过的第一个坑。
  check('summary-excludes-foreign-widget',
    !sliceSummary(realBody).includes('axa.fr') && !sliceSummary(realBody).includes('758'));

  // 摘要区缺失 → unavailable，不是一堆 0。
  const emptyState = [
    'Traffic Analytics', '通过访问量、跳出率和参与度对多个域名进行基准测试',
    '开始使用', '本地可见度差距', 'axa.fr', '42', '758', '15%',
  ].join('\n');
  check('empty-state-is-unavailable',
    parseTrafficSummary(emptyState) === null && summaryHasValues(emptyState) === false);
  // 「访问量」出现在营销文案里、页面底部也有数字——两者加起来都不许构成就绪。
  check('marketing-copy-is-not-ready', !/摘要/.test(emptyState) && !summaryHasValues(emptyState));
  // 摘要标题出现了但还没水合完（没有 `流量趋势` 尾界）：同样是 unavailable，
  // **不能退化成「摘要一直到页尾」**，那会把底部挂件圈进来。
  const halfRendered = ['摘要', '摘要', '导出', '访问量', '访问量', '本地可见度差距', 'axa.fr', '42'].join('\n');
  check('missing-end-boundary-is-unavailable', parseTrafficSummary(halfRendered) === null);

  // 标签在、值缺失 → null，绝不是 0。0 的含义是「实测就是零」，两者相反。
  const labelsNoValues = [
    '摘要', '摘要', '导出',
    '访问量', '访问量', '7.9亿', '↑4.53%',          // 只有值和环比，没有两个占比
    '唯一', '唯一', '不可用',                        // 明写的「不可用」
    '购买转化率', '购买转化率',                       // 标签在，什么都没有
    '页数/访问', '页数/访问', '—', '↓2.55%',         // 破折号占位
    '平均访问时长', '平均访问时长', '↑7.99%',         // 只有环比
    '跳出率', '跳出率', '30.23%',                    // 只有值
    '流量趋势',
  ].join('\n');
  const sparse = parseTrafficSummary(labelsNoValues);
  check('missing-values-are-null-not-zero',
    sparse.visits === 790000000 && sparse.visitsChangePercent === 4.53
    && sparse.desktopSharePercent === null && sparse.mobileSharePercent === null
    && sparse.uniqueVisitors === null && sparse.uniqueChangePercent === null
    && sparse.purchaseConversionPercent === null && sparse.purchaseConversionChangePercent === null
    && sparse.pagesPerVisit === null && sparse.pagesPerVisitChangePercent === -2.55
    && sparse.avgVisitDuration === null && sparse.avgVisitDurationSeconds === null
    && sparse.avgVisitDurationChangePercent === 7.99
    && sparse.bounceRatePercent === 30.23 && sparse.bounceRateChangePercent === null,
    JSON.stringify(sparse));
  check('no-zero-substituted-for-missing',
    Object.values(sparse).every((v) => v !== 0), JSON.stringify(sparse));

  // 中文缩写换算：万=1e4、亿=1e8，K/M/B 也要认。
  check('cjk-and-latin-magnitudes',
    numeric('1.6万') === 16000 && numeric('7.9亿') === 790000000
    && numeric('23.8K') === 23800 && numeric('1.1M') === 1100000 && numeric('2B') === 2000000000
    && numeric('不可用') === null && numeric('—') === null);

  // mm:ss / h:mm:ss，认不出来给 null（不要把 11:02 当成 11.02 这种数）。
  check('duration-seconds',
    durationToSeconds('11:02') === 662 && durationToSeconds('1:02:03') === 3723
    && durationToSeconds('5.4') === null && durationToSeconds('') === null);

  // 页头元信息只在摘要区之前找，别把底部挂件的 axa.fr 当成本次主体。
  const header = parseHeader(realBody, 'canva.com');
  check('header-metadata',
    header.headerTarget === 'canva.com' && header.period === '2026年7月'
    && header.scope === '全球' && header.devices === '所有设备',
    JSON.stringify(header));

  // 深链必须同时带 q 和 searchType——只给 q 就是 2026-08-28 那次得出错误结论的写法。
  const url = buildTrafficUrl('https://sem.example', 'canva.com');
  check('deep-link-carries-q-and-search-type',
    url === 'https://sem.example/analytics/traffic/traffic-overview/?q=canva.com&searchType=domain', url);

  // 落地校验只看结构（路径 + query），一个字的文案都不看。
  check('deep-link-classify',
    classifyDeepLink({ landedUrl: url, domain: 'canva.com' }).ok === true
    && classifyDeepLink({ landedUrl: 'https://sem.example/analytics/traffic/traffic-overview/', domain: 'canva.com' }).reason === 'query-dropped'
    && classifyDeepLink({ landedUrl: 'https://sem.example/analytics/traffic/traffic-overview/?q=canva.com', domain: 'canva.com' }).reason === 'search-type-dropped'
    && classifyDeepLink({ landedUrl: 'https://sem.example/analytics/traffic/?q=canva.com&searchType=domain', domain: 'canva.com' }).reason === 'path-drift'
    && classifyDeepLink({ landedUrl: url, domain: 'figma.com' }).reason === 'query-target-mismatch');

  // 页头主体对不上 = 读到别人的页面，必须是 mismatch（调用方据此硬失败）。
  check('verify-report-target',
    verifyReportTarget({ headerTarget: 'canva.com', domain: 'canva.com' }).status === 'match'
    && verifyReportTarget({ headerTarget: 'axa.fr', domain: 'canva.com' }).status === 'mismatch'
    && verifyReportTarget({ headerTarget: null, domain: 'canva.com' }).status === 'unknown');

  // 错误文本必须过 redactSecrets 才能进输出——这是仓库红线，在这里也验一遍。
  const redacted = redactSecrets('open https://sem.example/app?__gmitm=SECRET123 failed');
  check('errors-are-redacted', !redacted.includes('SECRET123') && redacted.includes('__gmitm=<redacted>'));

  console.log(`semrush-traffic self-test: PASS (${checks.length} checks: ${checks.join(', ')})`);
}

// ---------- 主流程 ----------

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);
  if (flags['self-test']) { runSelfTest(); return; }

  // Semrush 是配额站：会话名归站点，不归 agent。defaultSession() 的 per-agent 后缀
  // 在这里就是并发度，2026-08-28 实测把 19 个标签页同时压在同一张报表上。
  const session = resolveSession(flags, 'semrush-traffic', 'semrush');
  const domain = normalizeDomain(String(flags.domain || '').trim());
  if (!domain) {
    console.error('semrush-traffic.mjs requires --domain (例如 --domain canva.com)');
    process.exit(2);
  }

  let output;
  let launched;
  const windowStrategy = resolveWindowStrategy({ windowFlag: flags.window, fallbackWindowMode: DEFAULT_WINDOW });
  let deepLink = null;
  let targetCheck = null;
  // 失败现场的落点。默认贴着 --out（`x.json.evidence/`），没有 --out 进 .backlink/。
  const evidenceDir = typeof flags['evidence-dir'] === 'string'
    ? flags['evidence-dir']
    : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'semrush-traffic', runTag: domain });
  try {
    launched = await launchTool({
      session,
      tool: 'semrush',
      node: flags.node,
      // 见本文件顶部 DEFAULT_WINDOW 的注释：这张报表在后台标签页里不水合。
      // 2026-09-14：默认先走虚拟屏幕（可见、不抢焦点），DEFAULT_WINDOW 退为检测不到时的回退模式。
      window: windowStrategy.launchWindow,
      fallbackWindow: windowStrategy.fallbackWindowMode,
      automationDisplay: flags['automation-display'],
      wait: Number(flags.wait || 7),
      timeout: Number(flags.launchTimeout || 60),
      allowParallelSession: Boolean(flags['allow-parallel-session']),
    });
    const { evalPage } = launched;
    // `landed` 是 `{ url, title, bodyText }` 对象，不是字符串——直接 new URL(landed) 会抛。
    const origin = new URL(launched.landed?.url || launched.tool.origin.replace(/^/, 'https://')).origin;

    // 导航一律走 gotoInTool（在已登录的工具页内部跳转）。**不能用 `opencli open` 打深链**——
    // 那会开一个没有登录态的新标签页。
    // **目标带在 URL 里**，不在页面上填。见头部注释第 2/3 条。
    const requested = buildTrafficUrl(origin, domain);
    await launched.automationWindow?.ensureVisible('before-report-navigation');
    await gotoInTool(evalPage, requested, Number(flags.settle || 8));

    // 瞬时错误页先重载掉，再做深链校验——否则会把「出错了」误判成「query 被吞了」。
    const located = await reloadPastTransient(evalPage);
    if (located?.transient) {
      throw new Error('页面停在瞬时错误页（出错了/请稍后重试），重载重试仍未恢复，稍后再跑。');
    }
    // 结构判据：落地 URL 还带不带我们请求的 q/searchType。和 UI 语言无关。
    deepLink = classifyDeepLink({ landedUrl: located?.url, domain });
    if (!deepLink.ok) {
      throw new Error(
        `深链没有落地（reason=${deepLink.reason}）：请求的是 ${TRAFFIC_PATH}?q=${domain}&searchType=${TRAFFIC_SEARCH_TYPE}，` +
        `落地路径是 ${deepLink.pathname || '(读不出)'}，q=${deepLink.q ?? '(无)'}，searchType=${deepLink.searchType ?? '(无)'}。` +
        `依次排查：(1) 路由被改了——本脚本用的是 ${TRAFFIC_PATH}，不是 /analytics/traffic/overview/（后者 302 到落地页并把 query 丢掉）；` +
        `(2) searchType 缺失会让页面停在空态，**两个参数缺一不可**；` +
        `(3) 节点挂了——换 --node 重跑。` +
        `注意：这条路由上**没有查询表单**，不要退回「在页面上填域名提交」，那条路径已被实盘证伪。`,
      );
    }

    // **分段滚动，默认关闭。** 理由和 semrush-report.mjs 那处逐字相同：2026-08-29 实测
    // `body.scrollHeight === window.innerHeight`（772）、`scrollY` 滚 8 次没动过，
    // **但那是因为整个报表模块渲染成了空白**——那次观测既不能证明这个站需要滚动，
    // 也不能证明不需要。默认开启就是把一个没测过的假设写进默认行为。另外在一个把外壳
    // 挂在 44 个 shadow root 里的页面上，真正的滚动容器很可能不是 window，
    // 「滚 window 不动」和「没有可滚内容」读数一模一样（见 deepScrollContainers）。
    // 探针每轮回报 `scrollContainers`，下一次实盘用数据来定这个默认值。
    if (flags['scroll-segments'] !== undefined) {
      try {
        const scrolled = await scrollThroughSegments(evalPage, {
          sleep,
          segmentPauseMs: Number(flags['scroll-pause'] || 1.5) * 1000,
          maxSegments: Number(flags['scroll-segments'] || 12),
        });
        console.error(`[scroll] ${JSON.stringify(scrolled)}`);
      } catch (error) {
        console.error(`[scroll] 分段滚动失败，继续按不滚动读：${redactSecrets(String(error?.message || error))}`);
      }
    }

    await launched.automationWindow?.ensureVisible('before-summary-read');
    const loaded = await loadSummary(evalPage, {
      timeout: Number(flags.timeout || 120),
      intervalMs: Number(flags['stable-interval'] || 3) * 1000,
    });

    if (!loaded.stable || !loaded.capture) {
      // 诊断（**只在失败时用文案**，而且走 locale 表）：分清「空态落地页」和「有数据但还没稳」。
      // locale 不在 EMPTY_STATE_MARKERS 覆盖表里时是 `unknown`，**不默认判成「不在空态」**——
      // 这个共享账号的 UI 是中文，写死单语言的判据在这里会一路默认通过。
      const scope = loaded.capture ? classifyTargetScope({
        text: loaded.capture.bodyText, target: domain,
        documentLang: loaded.capture.lang, pathname: loaded.capture.pathname,
      }) : null;
      const scopeNote = scope
        ? `页面诊断：emptyState=${scope.emptyState}（locale=${scope.uiLocale || '未知'}，`
          + `covered=${scope.localeCovered}）、页面上${scope.hasTarget ? '有' : '没有'} "${domain}" 字样。`
          + (scope.emptyState === 'unknown'
            ? `（这个 locale 没有空态标记，所以**不能**据此断定不在空态——` +
              `要继续用，把观测到的标记加进 lib-report-readiness.mjs 的 EMPTY_STATE_MARKERS。）`
            : '')
        : '';
      // **空结果不是事实。** 这里绝不输出一堆 0/null 假装成功。
      throw new Error(
        loaded.aborted
          ? `页面停在瞬时错误页（出错了/请稍后重试）。重载重试仍未恢复，稍后再跑。`
          : `"${domain}" 的摘要区在 ${loaded.reads} 次读取里始终没出现稳定数值。${scopeNote}` +
            `依次排查：(1) 深链虽然落地了但页面还停在空态（emptyState=yes 时基本就是它）；` +
            `(2) 该域名在 .Trends 里流量太小、没有数据；` +
            `(3) 还在水合——调大 --timeout / --stable-interval。` +
            `注意：这**不等于**「这个站没有流量」。`,
      );
    }

    const cap = loaded.capture;
    const parsed = JSON.parse(loaded.fingerprint);
    const header = parseHeader(cap.bodyText, domain);
    // 页头主体和请求主体对不上 = 读的是别人的页面。**这里是硬失败，不是一行警告。**
    // 旧代码只 console.error 就照常出数——那正是「37 次读取」那份数据其实来自
    // 另一个任务的 dashboard、而输出看上去成功的原因。
    targetCheck = verifyReportTarget({ headerTarget: header.headerTarget, domain });
    if (targetCheck.status === 'mismatch') {
      throw new Error(
        `读到的是别人的页面：请求 ${domain}，页头显示 ${targetCheck.headerTarget}。` +
        `多半是会话被别的任务抢了标签页（同名会话共用标签页），或者深链落地后页面又跳走了。` +
        `重跑前先确认 --session 没有和别的任务撞名。`,
      );
    }
    if (targetCheck.status === 'unknown') {
      console.error(`[target-unknown] 页头里没认出主体域名；深链校验已通过（q=${deepLink?.q}），数据照常输出，但请人工复核 header。`);
    }

    output = {
      version: 1,
      source: 'Semrush Traffic & Market (.Trends) via authenticated Tools Share browser session',
      // 口径必须写清楚：这是**总访问量**，和 semrush-report.mjs 的自然搜索流量不是一回事。
      note: '这是 Semrush .Trends 的总访问量口径（与 Similarweb 同口径，2026-08-28 实测相差 2.4%），'
          + '不是 semrush-report.mjs / semrush-overview.mjs 的自然搜索流量，两者不要混用或相加。',
      retrievedAt: new Date().toISOString(),
      report: 'traffic-overview',
      target: domain,
      session,
      sessionReused: Boolean(launched.reused),
      title: cap.title,
      url: cap.url,
      // 2026-08-29 起随每次取数一并落盘：浅层 vs 深层的差值，就是「这一页有多少东西
      // 藏在 shadow DOM 里」。历史记录里的所有数字都是浅层的，靠这一栏才能对账。
      domProbe: {
        deepProbe: cap.deepProbe === true,
        shadowRoots: cap.shadowRoots ?? null,
        lightTextLength: cap.lightDom?.textLength ?? null,
        deepTextLength: cap.deep?.textLength ?? null,
        scrollContainers: cap.scrollContainers ?? null,
      },
      header,
      // 取数是怎么落地的：深链的结构校验结果 + 页头主体核对结果。
      // 下游能据此把「读到了正确的页」和「读到了某一页」分开。
      deepLink,
      targetCheck,
      subscription: launched.reused ? null : {
        expiry: launched.state?.expiry, daysLeft: launched.state?.daysLeft,
        quotas: launched.state?.quotas, warning: expiryWarning(launched.state || {}),
      },
      reads: loaded.reads,
      parsed,
      rawSummary: sliceSummary(cap.bodyText),
      rawText: cap.bodyText.slice(0, 20000),
      automationWindow: launched.automationWindow?.summary() ?? plainAutomationSummary({ windowMode: windowStrategy.launchWindow }),
    };
  } catch (error) {
    // **先取证后死**：所有失败分支（瞬时错误页、深链没落地、摘要区不稳、页头
    // 对不上、任何 eval 崩）都汇到这里；在 finally 释放锁之前把此刻的穿透
    // census + 截图成对落盘。captureScene 永不 throw。
    const scene = launched
      ? await captureScene({
        session, outDir: evidenceDir, evalPage: launched.evalPage, env: launched.env,
        tag: 'unavailable',
        note: `semrush-traffic ${domain}: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
      })
      : null;
    output = {
      version: 1,
      source: 'Semrush Traffic & Market (.Trends) via authenticated Tools Share browser session',
      retrievedAt: new Date().toISOString(),
      report: 'traffic-overview',
      target: domain,
      session,
      // 失败输出带现场：census + 截图的落盘路径（拍不到时是错误说明）。
      evidence: scene,
      // **错误消息必须过 redactSecrets。** opencli 失败会把带 __gmitm 令牌的会话 URL
      // 打进 stderr，那段文本会一路进 output、进 --out 文件、进日志。
      status: 'unavailable',
      deepLink,
      targetCheck,
      error: { code: 'traffic_overview_unavailable', message: redactSecrets(error.message) },
      automationWindow: launched?.automationWindow?.summary() ?? error?.automationWindow
        ?? plainAutomationSummary({ windowMode: windowStrategy.fallbackWindowMode, reason: windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? 'launch-failed-before-prepare' : 'explicit-window-mode' }),
    };
  } finally {
    await launched?.releaseBrowserLocks?.();
  }

  if (typeof flags.out === 'string') await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  // --json 只影响 stderr 上那行人读摘要；stdout 永远是 JSON，管道下游不会因为这个 flag 变形。
  if (!flags.json && output.status !== 'unavailable') {
    const p = output.parsed;
    console.error(
      `[${output.target}] visits=${p.visits} (${p.visitsChangePercent}%) unique=${p.uniqueVisitors} ` +
      `pages/visit=${p.pagesPerVisit} duration=${p.avgVisitDuration} bounce=${p.bounceRatePercent}%`,
    );
  }
  printJson(output);
  if (output.status === 'unavailable') process.exitCode = 1;
}

// **导入这个模块不许启动 CLI。** 解析函数是可单测的纯函数，验证方要能
// `import { parseTrafficSummary }` 而不意外开一个浏览器会话——2026-08-28 就真的
// 因为没有这道守卫开了一个。写法照抄同目录的 tools-share-evidence.mjs。
const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) main().catch((error) => { console.error(redactSecrets(error?.message || String(error))); process.exitCode = 1; });
