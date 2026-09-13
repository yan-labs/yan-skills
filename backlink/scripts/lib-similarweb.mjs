/**
 * lib-similarweb.mjs — Similarweb 页面解析，**唯一一份**。
 *
 * 为什么抽出来：`similarweb-query.mjs` 和 `similarweb-batch.mjs` 各自抄了一份
 * `deriveMetrics`，于是同一个解析 bug 要修两遍，而实际发生的是**只修了一遍**。
 * 本 Skill 对「写第二个」有明文禁令，这里是补上欠账。
 *
 * ---
 *
 * ## 取值的两条硬规则（都是被错报逼出来的）
 *
 * 页面结构是「标签一行、值在后面几行」，中间夹着日期范围、国家名、图例。
 * 所以必须往后扫——但**扫描必须有边界，模式必须整行匹配**：
 *
 *   1. **碰到下一个标签就停。** 否则某个指标没有值时，扫描会一路穿过去，
 *      把下一个指标的数字抓来当自己的。
 *   2. **`-` / `—` / `N/A` 是「这一项没有值」，不是「继续往后找」。** 命中就返回 null。
 *
 * 2026-08-24 实测事故：na.whatismymmr.com 的三个排名在页面上全是 `-`，
 * 而旧代码的模式 `#?\s*[\d,]+` 不限整行、不设边界，一路扫到
 * 「Last 28 days (As of Aug 21)」，把 **28** 抓成了国家排名和行业排名。
 * 一个月访问 2 万的站被写成「国家排名第 28」，而且不报错。
 * **错报比漏报危险得多，所以宁可返回 null。**
 */
import { normalizeWindowMode } from './opencli-core.mjs';

/**
 * `--window` 的统一入口，给不需要「按报表判断要不要强制 foreground」这类复杂
 * 逻辑的调用方用（`similarweb-batch.mjs` / `similarweb-keywords.mjs`）——
 * `similarweb-query.mjs` 自己的 `resolveWindowMode` 要按 report 决定要不要强制
 * foreground，逻辑更复杂，留在它自己文件里，不复用这个。
 *
 * 2026-09-14：默认从 `background` 改成 `active`（选中标签页、不节流，但不夺
 * OS 焦点）；显式传值原样透传（用 `normalizeWindowMode` 兜底校验，认不出的值
 * 退回新默认 `active`，不是退回旧默认 `background`）。
 */
export function resolveSimilarwebWindowMode(windowFlag) {
  return typeof windowFlag === 'string' && windowFlag ? normalizeWindowMode(windowFlag, 'active') : 'active';
}

/** 页面上出现的指标标签。`nextValue` 用它当扫描边界。 */
export const SW_LABELS = [
  '总访问量', '全球排名', '国家/地区排名', '行业排名', '跳出率',
  '页面数/访问', '每次访问页数', '访问持续时间', '平均访问时长',
  '参与度概览', '站点排名', '渠道流量', '流量来源',
];

/** 「1.5M」「20,300」「1.6万」都要还原成数字。中文面板会用「万」「亿」。
 * **带 K/M/B/万/亿 后缀的值一律四舍五入。** 这类值在这个文件里全是搜索量、
 * 点击量、访问量这种概念上的整数——`132.8M` 不是「一亿三千二百八十万零
 * 零点零零零零零一」，`132.8 * 1e6` 只是二进制浮点乘法的舍入误差
 * （2026-08-27 实测：`size` 字段吐出过 `132800000.00000001`）。
 * 没有后缀的普通小数（CPC、份额百分比、访问时长这类）原样返回，不做四舍五入——
 * 那些数字本来就允许有小数部分，圆整反而是错的。 */
export function parseNumber(value) {
  // 「< 0.01%」是页面在说「有值，但小于这个下限」，**不是没有值**。
  // 实测 audience-geo 的 121 个国家里有 9 个是这个形态；旧版正则匹配不到
  // 前导的 `<`，于是整整 9 行的流量份额被判成 null——而 9/121 只有 7.4%，
  // 低于 auditColumns 的 50% 阈值，连告警都不会有。**静默丢真实数据，
  // 而且没有任何信号**，正是本库最不能接受的失败形态。
  // 取下限值本身（0.01），宁可略微高估也不要丢掉「这个国家确实有流量」这个事实。
  const belowBound = String(value ?? '').trim().match(/^[<＜]\s*([\d.,]+)\s*%?$/);
  if (belowBound) return Number(belowBound[1].replace(/,/g, ''));
  const normalized = String(value ?? '').replace(/,/g, '').trim();
  // **2026-09-13 第六轮实测确认：负数是真的会出现的合法值**——canva.com「显示
  // 广告」的「热门媒体」变动列实测到过 "-96%"（这一期比上一期跌了 96%，不是
  // 占位符，`-` 不是独占整个字符串，后面跟着数字）。旧正则 `[\d.]+` 不允许
  // 前导负号，"-96" 直接判 null，静默丢真实的跌幅方向和数值——跟本文件顶部
  // 「静默丢真实数据」的历史事故是同一类问题。这里允许可选的前导 `-`；
  // 其它调用点（访问量/排名/关键词量这些从不该是负数的字段）目前也没有任何
  // 真实样本出现过负号，放开这个口子不会把它们的正常正数值变成误判。
  const match = normalized.match(/^(-?[\d.]+)\s*([KMB万亿])?$/i);
  if (!match) return null;
  const multipliers = { k: 1e3, m: 1e6, b: 1e9, 万: 1e4, 亿: 1e8 };
  const raw = Number(match[1]);
  // `[\d.]+` 允许多个小数点（比如 "1.2.3"）匹配上，但 Number() 那种字符串会
  // 变成 NaN。**NaN 必须在这里就落地成 null**，不能让它继续往下游流——
  // 下游的 suspectColumns 检测认的是 `=== null`，NaN 会绕过去，序列化成 JSON
  // 又变回看着无害的 `null`，中间那趟 NaN 谁也看不见。
  if (Number.isNaN(raw)) return null;
  const result = raw * (multipliers[(match[2] || '').toLowerCase()] || 1);
  return match[2] ? Math.round(result) : result;
}

/** 排名必须**整行**就是一个（可带 # 的）数字。半行匹配正是上面那起错报的成因。 */
export function parseRank(value) {
  const match = String(value ?? '').replace(/,/g, '').trim().match(/^#?\s*(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * 明写的「没有这一项」。命中即停，不许继续往后找数字。
 *
 * **这个文件曾经有两份不一致的占位符定义**：这里的 `NO_VALUE` 认 `- — – --
 * N/A`，但不认「不可用」；`swCell` 自己另写了一条认「不可用」却不认 `–`/`--`
 * 的正则。两份对不上带来两个真实后果：(a) 一个全是「不可用」的列，会被
 * `auditColumns` 用 `NO_VALUE` 判断「这是不是占位符」时误判成「有真数据
 * 但解析失败」，假阳性打在这个信号最该被信任的地方；(b) `swText('不可用')`
 * 会把字符串 `不可用` 原样当成真实值放出去，`country: "不可用"`、
 * `topUrl: "不可用"` 就这么混进结果里。现在全文件只有这一条定义，
 * `swCell`/`swText`/`parseSignedPercentCell`/`parseDuration`/`auditColumns`
 * 全部认它，不许各写各的。
 */
const NO_VALUE = /^(?:[-—–]|N\/A|n\/a|--|不可用)$/i;

/** 判断一段文本是不是「明写的没有这一项」。所有占位符判断都走这一个函数，
 * 不要在别处再写一条正则——这正是本文件曾经出过的那类问题。 */
function isPlaceholder(value) {
  return NO_VALUE.test(String(value ?? '').trim());
}

/**
 * site-keywords「变动」列实测到的两个非数字特殊值——**不是占位符（页面明说
 * 没有），也不是解析失败，是第三种合法状态**：
 *   - "NEW"：新词，没有上一期数据可比。
 *   - "LOST"：2026-09-13 第二轮实跑 howolddoyoulook.com 实测到的第二个特殊
 *     值——这个词丢失了排名/点击数据，跟"NEW"是同一类"没有可比较的变化量"，
 *     只是方向相反。**实跑当场抓到过一次真实回归**：这两个值原来只在
 *     `hint.special` 里认，而 dirHintOf 从来没打过 'lost' 标签，于是 8/23 行
 *     的"LOST"被 partialLossColumns 当成解析失败报出去——直接检查文本本身
 *     （不依赖 hint 有没有打对标签）才是不会再漏的做法。
 * 两者都不计入涨跌方向的丢失/未知统计，也不计入"这一格解析出了负值"。
 */
const NON_COMPARABLE_CHANGE = /^(?:new|lost)$/i;

/**
 * 从标签往后找第一个匹配的值。**碰到下一个标签、或碰到 `-`，立刻停。**
 * labels 可以给多个候选：同一个指标在面板上不止一种写法（实测「访问持续时间」
 * 与「平均访问时长」并存，「页面数/访问」与「每次访问页数」并存），
 * 只认一种会让指标静默变成 null——报表看起来查成功了，字段却缺一半。
 */
export function nextValue(lines, labels, pattern = /./, span = 8) {
  for (const label of [].concat(labels)) {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i] !== label) continue;
      for (let j = i + 1; j < Math.min(lines.length, i + 1 + span); j++) {
        if (SW_LABELS.includes(lines[j])) break;        // 越界即停
        if (isPlaceholder(lines[j])) break;             // 页面明说没有
        if (pattern.test(lines[j])) return lines[j];
      }
    }
  }
  return null;
}

const NUMLINE = /^[\d,.]+\s*[KMB万亿]?$/i;
const RANKLINE = /^#?\s*[\d,]+$/;

/**
 * 面板路由会把请求的时间窗口悄悄改写（实测 2026-09-12：请求 28d，落地 6m），
 * 而「总访问量」这个标签在两种窗口下都长一个样——不看这一行，`totalVisits`
 * 就可能是 28 天的数字，也可能是 6 个月的累计数字，读的人分不出来。
 * 这里只认两种已实测出现过的窗口行形态，认不出就是 null（宁可不填，不猜）：
 *   「最后 N 天数 (As of ...)」          → 28 天风格
 *   「Mon YYYY - Mon YYYY (N 月)」       → 多月累计风格
 * 命中即整行原样返回，交给调用方去 apply-traffic-screen/报告里原文引用。
 */
const WINDOW_LINE = /^(?:最后\s*\d+\s*天数\s*\(As of[^)]*\)|[A-Za-z]{3}\s+\d{4}\s*-\s*[A-Za-z]{3}\s+\d{4}\s*\(\d+\s*月\))$/;

/** 导出给 similarweb-query/batch/keywords 用——这条判据本来只在「网站表现」页用,
 * 但两种窗口行形态本身跟报表种类无关(审计实测四个报表全部能匹配上这两种形态之一:
 * performance/channels 是「最后 N 天数」风格,audience-geo/site-keywords 是月份区间风格),
 * 所以可以原样搬去做「这次落地的到底是哪个窗口」这件事的通用证据,不必每个报表各写一份。 */
export function findWindowLabel(lines) {
  return lines.find((l) => WINDOW_LINE.test(l)) ?? null;
}

/** 请求 URL 里的窗口段(`28d`/`6m`/`3m`/`1m`)拆成 {amount, unit}。认不出就是 null。 */
export function parseWindowSegment(seg) {
  const m = String(seg ?? '').trim().match(/^(\d+)\s*([dwmy])$/i);
  return m ? { amount: Number(m[1]), unit: m[2].toLowerCase(), raw: String(seg) } : null;
}

/** 页面自己渲染出来的窗口文案拆成 {amount, unit}——两种已知形态各拆一次。
 * 「最后 N 天数」→ 天;「Mon YYYY - Mon YYYY (N 月)」→ 月。认不出就是 null。 */
export function parseWindowLabelAmount(label) {
  if (!label) return null;
  const days = String(label).match(/^最后\s*(\d+)\s*天数/);
  if (days) return { amount: Number(days[1]), unit: 'd', raw: label };
  const months = String(label).match(/\((\d+)\s*月\)\s*$/);
  if (months) return { amount: Number(months[1]), unit: 'm', raw: label };
  return null;
}

/**
 * 拿页面实际显示的窗口文案跟这次请求的窗口段比对。**这是证据,不是判决**——
 * 面板把窗口从小站的 28d 悄悄放宽成 6m 是已知的正常产品行为(见
 * lib-tools-share.mjs 的 routeWindow 大段注释),不能因为不一致就判定这次查询
 * 失败,那会把大量小站查询变成永远超时。这里只负责说清楚「请求的是什么、
 * 页面实际显示的是什么、两者是否一致」,一致与否交给调用方决定要不要拦截、
 * 要不要在输出里标注。
 *
 * 返回 `matches: null` 代表两边至少有一边解析不出来(页面没显示窗口文案,或者
 * 窗口段本身不是常见形态),这种「读不到」不能当成「不一致」——见
 * windowUnverified 的用法。
 */
export function compareWindowToRequest(windowLabel, requestedSeg) {
  const requested = parseWindowSegment(requestedSeg);
  const landed = parseWindowLabelAmount(windowLabel);
  const matches = requested && landed ? (requested.amount === landed.amount && requested.unit === landed.unit) : null;
  return { requested, landed, matches };
}

/** 页面顶部过滤条里「设备」筛选器目前唯一在用的取值——本仓库所有 Similarweb 脚本
 * 都只请求 webSource=Total,页面上对应显示为灰显、不可点的「所有流量」
 * (审计截图实测)。只在这一个值上做弱信号核对:文本没读到就是 unverified,
 * 不是「切换成了别的设备口径」——设备选择器本身在当前账号档位下是锁死的。 */
const DEVICE_LABEL_TOTAL = '所有流量';
/** 国家选择器实测显示「全球」,但审计没能定位到一个稳定的 CSS 选择器/唯一文本
 * 锚点(「全球」这个词也会以「全球排名」等复合形式出现在别处,纯文本匹配只能是
 * 弱证据)。只在 countryApplicable 为真时才检查;audience-geo 这个 tab 本身没有
 * 国家筛选器,999 只是路由位置参数,999 对这里不生效——不要在没有筛选器的报表
 * 上假装核对出了什么。 */
const COUNTRY_LABEL_GLOBAL = '全球';

/**
 * 时间/国家/设备三个筛选器「页面自己怎么说」的证据,供调用方跟请求参数比对、
 * 写进输出。**只给证据,不做判决**——具体报表要不要拿 windowMatchesRequest===false
 * 当成失败,是调用方的选择(见 similarweb-query.mjs 里的用法和注释)。
 *
 * `lines` 是已经按行切分、trim 过、去空行的 bodyText(跟 deriveMetrics 等函数
 * 吃的是同一种输入),不是原始字符串。
 */
export function deriveScopeEvidence(lines, { requestedWindowSeg = null, countryApplicable = true } = {}) {
  const windowLabel = findWindowLabel(lines);
  const window = compareWindowToRequest(windowLabel, requestedWindowSeg);
  const deviceLabelObserved = lines.includes(DEVICE_LABEL_TOTAL);
  const countryLabelObserved = countryApplicable ? lines.includes(COUNTRY_LABEL_GLOBAL) : null;
  return {
    windowLabel,
    windowRequested: requestedWindowSeg,
    windowMatchesRequest: window.matches,
    // 读不到(两边任一边解析不出来)是「不知道」,不是「不一致」——见 compareWindowToRequest。
    windowUnverified: windowLabel === null || window.matches === null,
    countryApplicable,
    countryLabelObserved,
    // 不适用的报表(audience-geo)不算 unverified——那是「这个问题对这张报表没有意义」,
    // 不是「查不到证据」,两者不该用同一个信号表达。
    countryUnverified: countryApplicable ? !countryLabelObserved : false,
    deviceLabelObserved,
    deviceUnverified: !deviceLabelObserved,
  };
}

/** 「网站表现」页的指标。**只有这一页有**——在渠道页上跑它会把筛选器里的字当数值抓。 */
export function deriveMetrics(lines) {
  const windowLabel = findWindowLabel(lines);
  const metrics = {
    totalVisits: parseNumber(nextValue(lines, '总访问量', NUMLINE)),
    // 「总访问量」在窗口被改写成 6 个月时是 6 个月的累计数，不是月均数。
    // 「每月访问量」是页面「参与度概览」区自己给出的月度数字，窗口改写时
    // 尤其要靠它，而不是拿 totalVisits 硬当月度用。两个字段都留，
    // 不由这里替调用方决定用哪个 —— 那是判断，不是采集。
    monthlyVisits: parseNumber(nextValue(lines, '每月访问量', NUMLINE)),
    // 原样保留窗口行文本；null 代表两种已知形态都没匹配上，不代表没有窗口。
    windowLabel,
    globalRank: parseRank(nextValue(lines, '全球排名', RANKLINE)),
    countryRank: parseRank(nextValue(lines, '国家/地区排名', RANKLINE)),
    industryRank: parseRank(nextValue(lines, '行业排名', RANKLINE)),
    bounceRatePercent: (() => {
      const hit = nextValue(lines, '跳出率', /^[\d.]+\s*%$/);
      const m = hit && hit.match(/([\d.]+)\s*%/);
      return m ? Number(m[1]) : null;
    })(),
    pagesPerVisit: parseNumber(nextValue(lines, ['页面数/访问', '每次访问页数'], /^[\d.]+$/)),
    visitDuration: nextValue(lines, ['访问持续时间', '平均访问时长'], /^\d{2}:\d{2}:\d{2}$/),
  };
  return metrics;
}

/**
 * 「流量来源渠道」页：下方那张「渠道 → 绝对访问数」的表是最稳的结构，取它。
 * **占比直接由绝对值算，不去页面上捞那串百分比**——页面顶部并排列了一串 % 和一串
 * 渠道名，中间夹着图例和空行，顺序配对极易错位，而错位的占比比没有占比更危险。
 */
export const CHANNEL_KEYS = [
  'Direct', 'Search - Organic', 'Search - Paid', 'Referrals', 'Display Ads',
  'Social - Organic', 'Social - Paid', 'Gen AI', 'Email', 'Affiliates',
];

/** 输出时把 null 字段去掉；**判断「有没有解析到东西」不能用它**——见 similarweb-query 的注释。 */
export const compact = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export function deriveChannels(lines) {
  const visits = {};
  for (const key of CHANNEL_KEYS) {
    const i = lines.indexOf(key);
    if (i >= 0) {
      const v = lines[i + 1];
      visits[key] = isPlaceholder(String(v || '').trim()) ? null : parseNumber(v);
    }
  }
  const total = Object.values(visits).reduce((a, v) => a + (v || 0), 0);
  const sharePercent = {};
  if (total > 0) {
    for (const [k, v] of Object.entries(visits)) {
      if (v !== null && v !== undefined) sharePercent[k] = Number(((v / total) * 100).toFixed(2));
    }
  }
  return { totalFromChannels: total || null, sharePercent, visits };
}

/**
 * ============================================================================
 * "网站表现"页 notCovered 区块的离线补抓——2026-09-13 第五轮。
 *
 * 背景：协调者要求"完全离线，用已保存的实跑输出/DOM 记录实现"，不许开
 * 浏览器、不许猜结构。下面这批函数全部只依据本轮之前实跑 howolddoyoulook.com
 * 时**已经拿到、已经在会话记录里**的真实 rawText 片段写成——不是凭印象编的
 * 形状。每个函数吃的 `lines` 跟 `deriveMetrics` 一样：已经按 `\n+` 切分、
 * trim 过、`filter(Boolean)` 去掉空行的 bodyText。
 *
 * 四态判定（每个区块函数的 `status` 字段）：
 *   'data'             —— 解析出了具体数值/条目，形状跟已确认的真实样本一致。
 *   'legit-empty'      —— 命中了页面自己正面渲染的空态文案（不是"读到 0 条"）。
 *   'locked'           —— 命中"解锁/upgrade"这类付费墙提示（本轮的真实样本
 *                         没有任何一个子区块落在这一态，检测逻辑仍然写了，
 *                         避免真遇到时被误判成 unresolved 或者更糟地被当成
 *                         confirmed-absent）。
 *   'confirmed-absent' —— 连锚点文字都没找到，这个区块本身没有渲染出来。
 *   'unresolved'       —— 锚点找到了，但接下来的内容既不匹配已确认的数据
 *                         形状，也不匹配已知的空态/锁定文案——**不猜**，原样
 *                         报 unresolved，调用方据此保持 ok-unverified，不能
 *                         当成 confirmed-absent（区块明明存在）也不能当成
 *                         data（没有可信的解析结果）。
 * ============================================================================
 */

/** 页面自己正面渲染的两种"没有结果"文案——分别在"热门付费非品牌搜索词"
 * （没有数据时）、"热门外链行业"、"出站流量·热门链接目的地"三处真实样本里
 * 确认过，是同一套两行组合："没有结果" + 紧跟一句"尝试……"的引导语。 */
const EMPTY_RESULT_TEXT = /^没有结果$/;
const EMPTY_RESULT_HINT = /^尝试(?:其他网站、日期范围或国家\/地区|扩大您的参数量或搜索其他内容)。?$/;
/** 本轮唯一实测到的付费墙提示（"网站表现"页历史趋势图旁的"解锁长达 15 个月
 * 的历史数据"），泛化成一条通用检测，供所有子区块复用；不是任何一个已实现
 * 子区块本身命中过的态。 */
const LOCK_HINT = /解锁|upgrade|需要升级|仅限.*(?:套餐|计划|版)/i;
/** 已知会出现在区块内部、但跟这个区块本身的数据无关的噪声行（日期范围、
 * 国家/设备筛选器回显文案）——先滤掉再定位数据，比每个函数各写一套判断稳。 */
const OVERVIEW_NOISE_LINE = /^(全球|所有流量|Include Subdomains|反馈|PoP|年同比)$/;
function isOverviewNoiseLine(line) {
  // 「XX构成网站流量的 YY%」这句整体占比句子——2026-09-13 第六轮用 canva.com
  // 实测「社交」区块时发现：这句话跟标签+坐标轴+数据那套形状的区块紧挨着，
  // 不滤掉的话会被 deriveLeadingLabelsTrailingValues 误当成第一个"标签"
  // （它本身不是百分比专属格式，被判成"非数值 token"）。
  return OVERVIEW_NOISE_LINE.test(line) || /\d{4}/.test(line) || /^Last \d+ days/i.test(line) || /As of/.test(line)
    || /构成网站流量的/.test(line);
}
function isKnownEmptyBlock(scopeLines) {
  const text = scopeLines.join('\n');
  if (/抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data/.test(text)) return true;
  for (let i = 0; i < scopeLines.length - 1; i++) {
    if (EMPTY_RESULT_TEXT.test(scopeLines[i]) && EMPTY_RESULT_HINT.test(scopeLines[i + 1])) return true;
  }
  return false;
}

/** 「XX构成网站流量的 YY%」——"网站表现"页 5 个已确认的整体占比句子，
 * 分别挂在自然搜索/付费搜索/外链/社交/展示广告 5 个小节里，是比下面各种
 * 表格提取更简单、更不容易出错的信号源，跟表格类字段分开报，互相印证。 */
const OVERVIEW_CHANNEL_SHARE_SENTENCE_PREFIX = {
  organicSearch: '自然搜索构成网站流量的',
  paidSearch: '付费搜索构成网站流量的',
  referral: '外链流量构成网站流量的',
  social: '社交流量构成网站流量的',
  display: '展示型广告构成网站流量的',
};
function findChannelShareSentence(lines, key) {
  const prefix = OVERVIEW_CHANNEL_SHARE_SENTENCE_PREFIX[key];
  const re = new RegExp(`^${prefix}\\s*([<＜]?\\s*[\\d.]+\\s*%)$`);
  for (const line of lines) {
    const m = line.match(re);
    if (m) return swCell(m[1], { percent: true });
  }
  return null;
}

/**
 * 设备分发（Desktop/Mobile 占比）。实测原文（已脱敏无需脱敏——这条本身
 * 就是通用文案）：
 *   设备分发 / Aug 2026 - Sep 2026 / 全球 / Desktop / 20.30% / Mobile Web / 79.70%
 * 噪声行（日期范围、"全球"）滤掉之后就是干净的 (标签, 百分比) 交替对，
 * 停在"全球排名"这个下一个已知锚点之前。
 */
function deriveOverviewDeviceSplit(lines) {
  const anchorIdx = lines.indexOf('设备分发');
  if (anchorIdx < 0) return { status: 'confirmed-absent', devices: null };
  const stopIdx = lines.indexOf('全球排名', anchorIdx);
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + 12);
  const scope = lines.slice(anchorIdx + 1, scopeEnd);
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', devices: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', devices: null };
  const cleaned = scope.filter((l) => !isOverviewNoiseLine(l));
  if (cleaned.length === 0 || cleaned.length % 2 !== 0) return { status: 'unresolved', devices: null };
  const devices = [];
  for (let i = 0; i + 1 < cleaned.length; i += 2) {
    const label = cleaned[i];
    const value = cleaned[i + 1];
    if (!/^[\d.]+\s*%$/.test(value)) return { status: 'unresolved', devices: null };
    devices.push({ label, percent: swCell(value, { percent: true }) });
  }
  return { status: 'data', devices };
}

/**
 * 品牌 vs.非品牌占比。实测原文（trim+filter(Boolean) 之后，原来夹在中间的
 * 空白行已经被滤掉）：
 *   品牌 vs.非品牌 / Aug 2026 / 全球 / 所有流量 / 品牌 / 0% / 非品牌 / 100%
 * 按精确 token "品牌"/"非品牌" 定位，不受前面噪声行干扰——不像设备分发要
 * 靠位置配对，这里两个标签本身就是可靠锚点。
 */
function deriveOverviewBrandShare(lines) {
  const anchorIdx = lines.indexOf('品牌 vs.非品牌');
  if (anchorIdx < 0) return { status: 'confirmed-absent', brandPercent: null, nonBrandPercent: null };
  const stopIdx = lines.indexOf('查看搜索概况', anchorIdx);
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + 10);
  const scope = lines.slice(anchorIdx + 1, scopeEnd);
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', brandPercent: null, nonBrandPercent: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', brandPercent: null, nonBrandPercent: null };
  const brandIdx = scope.indexOf('品牌');
  const nonBrandIdx = scope.indexOf('非品牌');
  if (brandIdx < 0 || nonBrandIdx < 0) return { status: 'unresolved', brandPercent: null, nonBrandPercent: null };
  const findPercentAfter = (idx) => {
    for (let i = idx + 1; i < Math.min(scope.length, idx + 4); i++) {
      if (/^[\d.]+\s*%$/.test(scope[i])) return swCell(scope[i], { percent: true });
    }
    return undefined;
  };
  const brandPercent = findPercentAfter(brandIdx);
  const nonBrandPercent = findPercentAfter(nonBrandIdx);
  if (brandPercent === undefined || nonBrandPercent === undefined) {
    return { status: 'unresolved', brandPercent: null, nonBrandPercent: null };
  }
  return { status: 'data', brandPercent, nonBrandPercent };
}

/**
 * 热门自然/付费非品牌搜索词 Top5。实测原文（自然，有数据）：
 *   热门自然非品牌搜索词 / Aug 2026 / 全球 / 所有流量 /
 *   how old do i lookAds / age guesserAds / ... （5 个，"Ads" 是页面自己拼接
 *   的徽标文字后缀，不是关键词本身的一部分，剥掉） /
 *   52.30% / 12.97% / 4.95% / 3.01% / 2.59% （份额，5 个）/
 *   10.60% / 494.59% / 154.55% / - / - （变动，5 个，"-" 表示无可比数据）/
 *   查看更多搜索词
 * 实测原文（付费，没有数据）：
 *   热门付费非品牌搜索词 / 没有结果 / 尝试扩大您的参数量或搜索其他内容。
 * 变动列这里**没有配色/箭头 DOM 证据**（纯文本卡片），不能默认当正数——
 * 每一条非"-"的变动都标 changePercentDirectionUnknown:true，跟其它已经用
 * DOM 判据的表格区分开，不能装得比实际证据更确定。
 */
function deriveOverviewTopKeywords(lines, anchor, stopAnchor, maxWindow = 40) {
  const anchorIdx = lines.indexOf(anchor);
  if (anchorIdx < 0) return { status: 'confirmed-absent', keywords: null };
  const stopIdx = stopAnchor ? lines.indexOf(stopAnchor, anchorIdx) : -1;
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + maxWindow);
  const scope = lines.slice(anchorIdx + 1, scopeEnd).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', keywords: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', keywords: null };
  const isPercent = (s) => /^[\d.]+\s*%$/.test(s);
  const isChangeToken = (s) => s === '-' || /^[\d.]+\s*%$/.test(s);
  let i = 0;
  const keywordLines = [];
  while (i < scope.length && !isPercent(scope[i])) { keywordLines.push(scope[i]); i += 1; }
  const n = keywordLines.length;
  if (n === 0) return { status: 'unresolved', keywords: null };
  const shareLines = scope.slice(i, i + n);
  const changeLines = scope.slice(i + n, i + 2 * n);
  if (shareLines.length !== n || changeLines.length !== n
    || !shareLines.every(isPercent) || !changeLines.every(isChangeToken)) {
    return { status: 'unresolved', keywords: null };
  }
  const keywords = keywordLines.map((raw, idx) => {
    const keyword = raw.replace(/Ads$/, '');
    const changeRaw = changeLines[idx];
    return {
      keyword,
      sharePercent: swCell(shareLines[idx], { percent: true }),
      changePercent: swCell(changeRaw, { percent: true }),
      changePercentDirectionUnknown: changeRaw !== '-',
    };
  });
  return { status: 'data', keywords };
}

/**
 * 「域/共享/变动」这类 3 列、按列渲染的小部件通用解析。实测原文（"领先
 * 广告主"，5 行，最扎实的样本）：
 *   域 / adobe.com / akakce.com / booking.com / dell.com / delltechnologies.com /
 *   共享 / 0% / 0% / 0% / 0% / 0% / 变动 / - / - / - / - / -
 * 「热门外链网站」是同页面相邻区块、同一形状（只是这次样本只有 1 行：
 * 域=Referral / 共享=100% / 变动=-），视为同一套组件复用，不是另猜的形状。
 * 「地理 Top5」的列头文字不同（国家/地区、流量来源、变动）但结构完全一样。
 *
 * **2026-09-13 第六轮用 canva.com 实测追加确认**：col1 的列头文字**不是
 * 只有"域"一种**——「出站流量·热门链接目的地」实测是英文 "Domain"，
 * 「显示广告·热门媒体」实测是 "发布商"，三种写法对应的是同一个"这一行的
 * 标识列"概念，只是不同小部件各自的文案。`col1Header` 因此改成接受
 * 字符串或字符串数组，数组时命中其中任意一个都算找到表头。变动列也是
 * 同一轮确认到两件事：(1) 真的会出现负数（canva 热门媒体 "-96%"，已经
 * 在 `parseNumber` 里放开负号支持）；(2) 会出现中文"新"（跟 site-keywords
 * 表格的英文 "NEW" 是同一个概念——这一行上一期没有可比数据），跟 "-"
 * （没有变动/没有比较）是两种不同的语义，不能混在一起都变成 null 之后
 * 分不清是"没有变动"还是"没有可比数据"。
 */
const OVERVIEW_NON_COMPARABLE_CHANGE = /^(?:new|新)$/i;
function deriveColumnTripleBlock(lines, { anchor, col1Header, col2Header, col3Header, stopAnchor, maxWindow = 40 }) {
  const anchorIdx = lines.indexOf(anchor);
  if (anchorIdx < 0) return { status: 'confirmed-absent', rows: null };
  const stopIdx = stopAnchor ? lines.indexOf(stopAnchor, anchorIdx) : -1;
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + maxWindow);
  const scope = lines.slice(anchorIdx + 1, scopeEnd).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', rows: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', rows: null };
  const col1Candidates = [].concat(col1Header);
  const h1 = scope.findIndex((l) => col1Candidates.includes(l));
  const h2 = h1 >= 0 ? scope.indexOf(col2Header, h1 + 1) : -1;
  const h3 = h2 >= 0 ? scope.indexOf(col3Header, h2 + 1) : -1;
  if (h1 < 0 || h2 < 0 || h3 < 0) return { status: 'unresolved', rows: null };
  const n = h2 - h1 - 1;
  const col1 = scope.slice(h1 + 1, h2);
  const col2 = scope.slice(h2 + 1, h3);
  const col3 = scope.slice(h3 + 1, h3 + 1 + n);
  if (n === 0 || col2.length !== n || col3.length !== n) return { status: 'unresolved', rows: null };
  const rows = col1.map((label, idx) => {
    const changeRaw = col3[idx];
    const isSpecial = OVERVIEW_NON_COMPARABLE_CHANGE.test(changeRaw);
    return {
      label: swText(label),
      sharePercent: swCell(col2[idx], { percent: true }),
      changePercent: isSpecial ? null : swCell(changeRaw, { percent: true }),
      changePercentDirectionUnknown: changeRaw !== '-' && !isSpecial,
      // "新"/"New"：这一行上一期没有可比数据（跟 site-keywords 的 NEW/LOST
      // 是同一类第三态），不是"没有变动"，也不是解析失败。
      changeIsNew: isSpecial || null,
    };
  });
  return { status: 'data', rows };
}

/**
 * 「网站类别/流量份额」这类 2 列（没有变动列）的小部件——2026-09-13 第六轮
 * 用 canva.com 实测确认的真实形态（「热门外链行业」，之前只见过它的空态
 * 样本，误以为跟"领先广告主"是同一套 3 列组件，实测发现少一列）：
 *   网站类别 / Computers Electronics and Technology - Other / Education /
 *   Graphics Multimedia and Web Design / Search Engines / Photography /
 *   流量份额 / 19.73% / 12.60% / 11.12% / 7.81% / 4.85% / 查看更多外链行业
 */
function deriveColumnPairBlock(lines, { anchor, col1Header, col2Header, stopAnchor, maxWindow = 40 }) {
  const anchorIdx = lines.indexOf(anchor);
  if (anchorIdx < 0) return { status: 'confirmed-absent', rows: null };
  const stopIdx = stopAnchor ? lines.indexOf(stopAnchor, anchorIdx) : -1;
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + maxWindow);
  const scope = lines.slice(anchorIdx + 1, scopeEnd).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', rows: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', rows: null };
  const col1Candidates = [].concat(col1Header);
  const h1 = scope.findIndex((l) => col1Candidates.includes(l));
  const h2 = h1 >= 0 ? scope.indexOf(col2Header, h1 + 1) : -1;
  if (h1 < 0 || h2 < 0) return { status: 'unresolved', rows: null };
  const n = h2 - h1 - 1;
  const col1 = scope.slice(h1 + 1, h2);
  const col2 = scope.slice(h2 + 1, h2 + 1 + n);
  if (n === 0 || col2.length !== n) return { status: 'unresolved', rows: null };
  const rows = col1.map((label, idx) => ({ label: swText(label), sharePercent: swCell(col2[idx], { percent: true }) }));
  return { status: 'data', rows };
}

/**
 * 只确认过空态样本、从没见过"有数据"长什么样的区块——本轮（第六轮）用
 * canva.com 实测把「热门外链行业」「出站流量·热门链接目的地」「社交」
 * 三个原本挂在这里的区块都换成了真实解析（分别见
 * `deriveColumnPairBlock`/`deriveColumnTripleBlock`/
 * `deriveOverviewSocialBreakdown`），这个函数保留给下一个"只见过空态"的
 * 区块用——命中已知空态就是 legit-empty（这本身是一个终态，不是"没做完"）；
 * 不是空态、也不匹配任何已知形态时，如实报 unresolved。
 */
function deriveEmptyOnlyBlock(lines, anchor, maxWindow = 20) {
  const anchorIdx = lines.lastIndexOf(anchor);
  if (anchorIdx < 0) return { status: 'confirmed-absent' };
  const scope = lines.slice(anchorIdx + 1, Math.min(lines.length, anchorIdx + maxWindow));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked' };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty' };
  return { status: 'unresolved' };
}

/**
 * "标签连续出现，然后是若干坐标轴刻度噪声，然后是紧挨着停止锚点之前的
 * N 个数据值"——渠道摘要迷你图和社交细分列表共用的形状。**不需要知道
 * 标签的固定词表**：标签就是"从 scope 开头数，数到第一个百分比/N-A 记号
 * 之前"的那些行（不管是"直接/自然搜索/…"这种固定枚举，还是"Youtube/
 * Facebook/Linkedin/…"这种因站而异的社媒平台名，规则完全一样）——数出来
 * 多少个 N，真正的数据就是紧挨着停止锚点之前的最后 N 个百分比/N-A 记号，
 * 不用管中间夹了几个坐标轴刻度。2026-09-13 第六轮用 canva.com 实测确认：
 * 「社交」区块的平台名两次读到的都不一样（一次是 Instagram，一次是
 * Linkedin）——如果用固定词表会漏，这也是把 `deriveOverviewChannelSummary`
 * 原来那份写死的 `OVERVIEW_CHANNEL_LABELS_ZH` 词表换成这个通用算法的
 * 直接原因（这个词表本身也一样得不到"以后不会有新渠道类型"的保证）。
 */
function deriveLeadingLabelsTrailingValues(scope) {
  const isValueToken = (s) => /^[\d.]+\s*%$/.test(s) || /^N\/A$/i.test(s);
  let n = 0;
  while (n < scope.length && !isValueToken(scope[n])) n += 1;
  if (n === 0 || scope.length < 2 * n) return null;
  const labels = scope.slice(0, n);
  const tail = scope.slice(-n);
  if (!tail.every(isValueToken)) return null;
  return { labels, values: tail };
}

/**
 * 渠道摘要（"流量来源渠道"迷你饼图/条形图）。实测原文：
 *   流量来源渠道 / Last 28 days.. / 全球 / 所有流量 /
 *   直接 / 自然搜索 / 付费搜索 / 外链 / 自然社媒 / 付费社交媒体 / 生成式 AI /
 *   0% / 20% / 40% / 60% （图表坐标轴刻度，数量不固定）/
 *   26.62% / 44.39% / N/A / 27.46% / 0.89% / N/A / 0.64% （数据，7 个）/
 *   查看完整概况
 * "流量来源渠道" 这个词在侧边导航栏里也出现过一次（纯链接文字，不是这个
 * 区块）——用 `lastIndexOf` 跳过它，取最后一次出现，也就是真正的区块标题。
 * 标签个数用 `deriveLeadingLabelsTrailingValues` 通用算出，不再依赖固定
 * 渠道名词表（2026-09-13 第六轮改，理由见该函数的注释）。
 */
function deriveOverviewChannelSummary(lines) {
  const anchorIdx = lines.lastIndexOf('流量来源渠道');
  if (anchorIdx < 0) return { status: 'confirmed-absent', channels: null };
  const stopIdx = lines.indexOf('查看完整概况', anchorIdx);
  if (stopIdx < 0) return { status: 'unresolved', channels: null };
  const scope = lines.slice(anchorIdx + 1, stopIdx).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', channels: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', channels: null };
  const parsed = deriveLeadingLabelsTrailingValues(scope);
  if (!parsed) return { status: 'unresolved', channels: null };
  const channels = parsed.labels.map((label, idx) => ({ label, sharePercent: swCell(parsed.values[idx], { percent: true }) }));
  return { status: 'data', channels };
}

/**
 * 「社交」区块的平台细分列表——2026-09-13 第六轮用 canva.com 实测确认
 * 真实结构（之前只见过 howolddoyoulook.com 的空态样本）：
 *   社交流量构成网站流量的 6.21% / Last 28 days.. / 全球 / 所有流量 /
 *   Youtube / Facebook / Facebook Messenger / Instagram / Pinterest / Other /
 *   0% / 50% / 100% （坐标轴刻度）/
 *   48.39% / 44.09% / 3.36% / 1.95% / 1.62% / 0.59% （数据）/ 查看完整概况
 * 跟渠道摘要同一个形状，但平台名是开放词表（因站而异，两次实测就见过
 * 不同的平台组合），用 `deriveLeadingLabelsTrailingValues` 而不是固定词表。
 * 停止锚点"查看完整概况"这个词在"流量来源渠道"区块里也出现过一次——
 * 用 `indexOf(..., anchorIdx)` 从社交区块自己的锚点之后开始找，不会挑到
 * 前面那次。
 */
function deriveOverviewSocialBreakdown(lines) {
  const anchorIdx = lines.lastIndexOf('社交');
  if (anchorIdx < 0) return { status: 'confirmed-absent', platforms: null };
  const stopIdx = lines.indexOf('查看完整概况', anchorIdx);
  if (stopIdx < 0) return { status: 'unresolved', platforms: null };
  const scope = lines.slice(anchorIdx + 1, stopIdx).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', platforms: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', platforms: null };
  const parsed = deriveLeadingLabelsTrailingValues(scope);
  if (!parsed) return { status: 'unresolved', platforms: null };
  const platforms = parsed.labels.map((label, idx) => ({ label, sharePercent: swCell(parsed.values[idx], { percent: true }) }));
  return { status: 'data', platforms };
}

/**
 * "网站表现"页汇总入口——把上面这些子区块拼在一起，加上 5 句"构成网站
 * 流量的"整体占比句子。`domain` 可选，不传也能工作（各子函数不依赖它），
 * 只有调用方想要更保险的话可以传（目前这批函数都没用到，占位保留接口一致）。
 */
export function deriveOverviewSupplementalBlocks(lines) {
  return {
    deviceSplit: deriveOverviewDeviceSplit(lines),
    brandVsNonBrand: deriveOverviewBrandShare(lines),
    topOrganicKeywords: deriveOverviewTopKeywords(lines, '热门自然非品牌搜索词', '查看更多搜索词'),
    topPaidKeywords: deriveOverviewTopKeywords(lines, '热门付费非品牌搜索词', null),
    referralSites: deriveColumnTripleBlock(lines, {
      anchor: '热门外链网站', col1Header: '域', col2Header: '共享', col3Header: '变动', stopAnchor: 'See more referrals',
    }),
    // 2026-09-13 第六轮用 canva.com 实测确认真实形态（之前只见过空态）：
    // 只有 2 列（网站类别/流量份额），没有变动列——跟 3 列组件不是同一个形状。
    referralIndustries: deriveColumnPairBlock(lines, {
      anchor: '热门外链行业', col1Header: '网站类别', col2Header: '流量份额', stopAnchor: '查看更多外链行业',
    }),
    // 2026-09-13 第六轮用 canva.com 实测确认：3 列结构没错，但列头是英文
    // "Domain"，不是"域"——跟"热门外链网站"/"领先广告主"的中文列头是两种
    // 写法，`col1Header` 传数组兼容两种。
    outboundDestinations: deriveColumnTripleBlock(lines, {
      anchor: '热门链接目的地', col1Header: ['域', 'Domain'], col2Header: '共享', col3Header: '变动', stopAnchor: '查看更多导出链接',
    }),
    displayAdvertisers: deriveColumnTripleBlock(lines, {
      anchor: '领先广告主', col1Header: '域', col2Header: '共享', col3Header: '变动', stopAnchor: '查看更多发布商数据',
    }),
    // 2026-09-13 第六轮新增：「显示广告」自己的「热门媒体」子区块，跟上面
    // 「导出广告→领先广告主」是页面上两个不同的小部件（本轮之前误把
    // "displayAdvertisers" 当成覆盖了这一块，实际上从来没抓过它）——3 列，
    // 列头是"发布商"，canva.com 实测样本还带出了"新"这个特殊变动值
    // （见 OVERVIEW_NON_COMPARABLE_CHANGE）和负数变动（"-96%"）。
    topMediaPublishers: deriveColumnTripleBlock(lines, {
      anchor: '热门媒体', col1Header: '发布商', col2Header: '共享', col3Header: '变动', stopAnchor: '查看更多媒体',
    }),
    // 2026-09-13 第六轮用 canva.com 实测确认真实形态（之前只见过空态）——
    // 跟渠道摘要同一个"标签+坐标轴噪声+末尾 N 个值"形状，见
    // deriveOverviewSocialBreakdown 的注释。
    socialBreakdown: deriveOverviewSocialBreakdown(lines),
    geoTop5: deriveColumnTripleBlock(lines, {
      anchor: '热门国家/地区', col1Header: '国家/地区', col2Header: '流量来源', col3Header: '变动', stopAnchor: '查看更多国家/地区',
    }),
    channelSummary: deriveOverviewChannelSummary(lines),
    // 5 句整体占比——跟上面的表格类区块分开报，这是页面另一处更简单、更
    // 可信的信号源，两边可能出现却对不上（值得留意但不是这里要处理的事）。
    channelShareOverall: {
      organicSearch: findChannelShareSentence(lines, 'organicSearch'),
      paidSearch: findChannelShareSentence(lines, 'paidSearch'),
      referral: findChannelShareSentence(lines, 'referral'),
      social: findChannelShareSentence(lines, 'social'),
      display: findChannelShareSentence(lines, 'display'),
    },
  };
}

/**
 * 「受众兴趣」tab 的"行业分布"饼图。实测原文：
 *   行业分布 / 计算机电子技术 > 社交网络和在线社区 / 计算机电子技术 > 搜索引擎 /
 *   艺术与娱乐 > 电视、电影和流媒体 / 计算机电子技术 > 电子邮件 /
 *   AI Chatbots and Tools / 其它 （6 个分类名，自由文本，没有固定词表）/
 *   howolddoyoulook.com （查询域名自己的图例行）/
 *   30.70% / 18.43% / 14.53% / 12.09% / 10.99% / 13.26% （6 个百分比）/
 *   话题分布
 * 分类名是自由文本，不能像 channelSummary 那样靠"已知词表数出 n"，但域名
 * 图例行是可靠边界——传 `domain` 时直接找这一行；不传时退化成"从
 * `话题分布` 往前数连续的百分比个数 n，再往前一行当图例、之前 n 行当分类名"，
 * 两条路径在真实样本上给出同一个结果（已用真实样本核对过），互为印证。
 */
function deriveOverviewIndustryDistribution(lines, { domain } = {}) {
  const anchorIdx = lines.indexOf('行业分布');
  if (anchorIdx < 0) return { status: 'confirmed-absent', industries: null };
  const stopIdx = lines.indexOf('话题分布', anchorIdx);
  if (stopIdx < 0) return { status: 'unresolved', industries: null };
  const scope = lines.slice(anchorIdx + 1, stopIdx);
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', industries: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', industries: null };
  const isPercent = (s) => /^[\d.]+\s*%$/.test(s);
  let legendIdx = domain ? scope.indexOf(domain) : -1;
  if (legendIdx < 0) {
    let n = 0;
    while (n < scope.length && isPercent(scope[scope.length - 1 - n])) n += 1;
    if (n === 0) return { status: 'unresolved', industries: null };
    legendIdx = scope.length - n - 1;
    if (legendIdx < 0 || isPercent(scope[legendIdx])) return { status: 'unresolved', industries: null };
  }
  const percentLines = scope.slice(legendIdx + 1);
  const labelLines = scope.slice(0, legendIdx);
  if (percentLines.length === 0 || labelLines.length !== percentLines.length || !percentLines.every(isPercent)) {
    return { status: 'unresolved', industries: null };
  }
  const industries = labelLines.map((label, idx) => ({ category: label, percent: swCell(percentLines[idx], { percent: true }) }));
  return { status: 'data', industries };
}

/**
 * 「受众兴趣」tab 的"话题分布"词云。实测原文：
 *   话题分布 / share / social / social media / video / youtube videos / ... /
 *   article （20 个左右的词）/ 导出 Excel
 * 词云的字号大小是 CSS 视觉权重，不是文本节点——**这里只能拿到词表本身，
 * 拿不到权重/排名**，如实标注在 `topicsOrderConfidence` 里，不假装这是一份
 * 排好序的排行榜。第一个词"share"是不是词云本身的词、还是列头残留，本轮
 * 无法确认，原样保留，不擅自剔除。
 */
function deriveOverviewTopicCloud(lines) {
  const anchorIdx = lines.indexOf('话题分布');
  if (anchorIdx < 0) return { status: 'confirmed-absent', topics: null };
  const stopIdx = lines.indexOf('导出 Excel', anchorIdx);
  const scopeEnd = stopIdx >= 0 ? stopIdx : Math.min(lines.length, anchorIdx + 40);
  const scope = lines.slice(anchorIdx + 1, scopeEnd).filter((l) => !isOverviewNoiseLine(l));
  if (LOCK_HINT.test(scope.join('\n'))) return { status: 'locked', topics: null };
  if (isKnownEmptyBlock(scope)) return { status: 'legit-empty', topics: null };
  if (scope.length === 0) return { status: 'unresolved', topics: null };
  return { status: 'data', topics: scope, topicsOrderConfidence: 'dom-order-not-confirmed-as-rank' };
}

/**
 * 「受众兴趣」tab 汇总入口——行业分布 + 话题词云。`domain` 可选，见
 * `deriveOverviewIndustryDistribution` 的注释。
 */
export function deriveAudienceInterestsSupplemental(lines, { domain } = {}) {
  return {
    industryDistribution: deriveOverviewIndustryDistribution(lines, { domain }),
    topicCloud: deriveOverviewTopicCloud(lines),
  };
}

/** 「44%」「$1.21」这类带符号的值。空串与占位符一律 null，绝不落成 0。 */
function swCell(value, { percent = false, currency = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return null;
  if (percent) return parseNumber(text.replace(/%$/, ''));
  if (currency) return parseNumber(text.replace(/^[$¥€£]/, ''));
  return parseNumber(text);
}

/**
 * 把提取到的列表变成行对象。**按列名取值，不按下标**——列顺序变了会得到 null 并
 * 记进 missingColumns，而不是把体量的数字安到 KD 头上。
 */
/**
 * 表头会带「(数字)」这种总数后缀，例如「国家/地区(121)」「关键词 (38,977,695)」。
 * **实测两处坑**：括号前可能有空格也可能没有；数字里可能带千分位逗号。
 * `\s` 本身就匹配换行，所以这条正则也顺带处理了表头跨两行渲染的情况
 * （第一行标签、第二行「(数字)」）——前提是提取器没有先把第二行切掉，
 * 见 `SW_GEO_TABLE_CELLS` 的注释。
 * 按列名找列的前提是先把这个后缀剥掉，否则谁也匹配不上，整张表变成 missingColumns——
 * 2026-08-27 实测事故：`国家/地区 (121)`（带空格）没被 `\(\d+\)$` 匹配到，
 * `关键词` 字段整表 null，`missingColumns` 一直报 `关键词`。
 */
function normalizeHeader(header) {
  return String(header ?? '')
    .replace(/\s*\(\s*[\d,]+\s*\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 从原始（未剥后缀的）表头里找出「页面自己说的总数」，用来和实际读到的行数对比。
 * 数字部分可能带千分位逗号，取出来之后要先去掉逗号再转数字。 */
function headerTotal(rawHeaders, label) {
  const raw = (rawHeaders || []).find((h) => normalizeHeader(h) === label);
  const match = raw && String(raw).match(/\(\s*([\d,]+)\s*\)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}

/**
 * 按列名（剥后缀之后）建立「名字 -> 下标」的索引。**这是唯一允许的取值方式**——
 * 谁也不许按下标硬取。列被改名或删掉时，下标是 -1，调用方据此把值填 null
 * 并记进 missingColumns，而不是让后面的列顶替上来。
 */
function buildColumnIndex(headers, wanted) {
  const normalized = (headers || []).map(normalizeHeader);
  const index = {};
  const missingColumns = [];
  for (const [key, label] of Object.entries(wanted)) {
    const i = normalized.indexOf(label);
    index[key] = i;
    if (i < 0) missingColumns.push(label);
  }
  return { index, missingColumns };
}

/**
 * 涨跌方向的 DOM 信号——真实页面上，「变动」这类列的方向不在 `innerText` 里
 * （2026-09-13 两轮审计都实测确认：`cell.innerText` 只有数字本身，没有任何
 * `↑`/`↓`/`+`/`-`）。老代码只认文本符号，认不出来就默认当正数——于是全量数据
 * 的「下降」被系统性地记成了「上升」，这是本文件曾经出过的最严重的一类错报。
 * **现在认不出方向必须是 null，不能默认正数。**
 *
 * `hint` 由 SW_ROW_MAJOR_TABLE_CELLS / SW_GEO_TABLE_CELLS 在页面里跟 innerText
 * 一起提取。2026-09-13 第二轮用 Claude in Chrome 对 howolddoyoulook.com 的
 * performance/channels/audience-geo(+demographics/interests/overlap)/
 * site-keywords 实测，**证实这是两套完全不同的机制，不是同一套的两种写法**：
 *
 *   - **机制 A**（`.swReactTable-column` 系表格——audience-geo 的地理/受众兴趣
 *     的 PoP变化列、channels 的流量来源明细表，均实测确认是同一套）：
 *     `<div class="changePercentage positive|negative">` 包一个
 *     `<i class="changePercentage-icon sw-icon-arrow-up5|sw-icon-arrow-down5">`；
 *     占位是 `<div class="changePercentage">`（不带 positive/negative）。
 *     **没有 SVG，之前设想的 data-icon/颜色在这套机制上根本用不上。**
 *     `hint.direction` 由提取器直接读 wrapper class 判出来，这里只管信任它。
 *   - **机制 B**（Ant Design 行渲染表——site-keywords 唯一实测到的这一种）：
 *     `[data-automation="cell-value"]` 的 `data-automation-value` 属性是**精确
 *     带符号的原始比值**（不是百分比，×100 才是显示的百分比），比图标/颜色都
 *     可靠，提取器优先用它算出 `hint.direction`；退一步是
 *     `.SWReactIcons[data-automation-icon-name]`（"arrow-up"/"arrow-down"，
 *     2026-09-13 实测 fill 分别是 `#4FBF40`/`#FF442D`，证实了第一轮"红=降"的
 *     猜测，也证实了此前没实测到的"绿=升"）；再退一步（提取器认不出上面两个）
 *     才把颜色原样交出来给 `hint.fill`，这里用色相兜底。
 *   - **特殊值 "NEW"**（site-keywords 独有：新词，没有上一期数据可比）：
 *     `data-automation-value="New"`，提取器识别成 `hint.special === 'new'`——
 *     这不是"方向读不出来"，是"没有方向这回事"，不能计入 directionUnknown，
 *     也不能被上层的丢失统计当成解析失败（见 deriveSiteKeywordRows）。
 *
 * `hint.direction` 已经是提取器判好的 'up'/'down'/null，这里不重新猜；
 * `hint.fill` 只在提取器自己也判不出方向时才会被填，是最后一道颜色兜底。
 * 三条信号都认不出来（或者压根没给 hint）时，方向就是「不知道」，不是「正数」。
 */

/** 从一个 `#rrggbb` 或 `rgb(r,g,b)`/`rgba(r,g,b,a)` 字符串猜色相方向。要求某个
 * 通道明显压过另外两个通道（1.2~1.3 倍）才判定，不是随便偏一点就算——降低
 * 颜色本身有渐变、抗锯齿等噪音时被误判的概率。两个通道都不明显压倒时返回
 * null，不猜。2026-09-13 实测：site-keywords 的下降/上升图标 fill 分别是
 * `#FF442D`/`#4FBF40`，代入下面的判据都能正确分类。 */
function hueDirection(colorText) {
  const text = String(colorText ?? '').trim();
  let r; let g; let b;
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1], 16);
    r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255;
  } else {
    const rgb = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (!rgb) return null;
    [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  }
  if (r > g * 1.3 && r > b * 1.3) return 'down'; // 红——两轮审计都实测确认
  if (g > r * 1.2 && g > b * 1.2) return 'up'; // 绿——2026-09-13 第二轮实测确认
  return null;
}

/** 方向判定的优先级：文本里明写的符号 > 提取器已经判好的 hint.direction > 颜色
 * 兜底。文本符号排第一是为了不破坏任何「文本里真的带了箭头/符号」的旧夹具或
 * 未来变体页面。 */
function resolveDirection(text, hint) {
  if (/↓/.test(text)) return 'down';
  if (/↑/.test(text)) return 'up';
  if (/^-/.test(text)) return 'down';
  if (/^\+/.test(text)) return 'up';
  if (!hint) return null;
  if (hint.direction === 'up' || hint.direction === 'down') return hint.direction;
  return hueDirection(hint.fill ?? hint.color);
}

/**
 * 「-」「—」「N/A」「+」「↑」「↓」混在一起的涨跌值，例如「↑25%」「+6」「-1.23%」「-」，
 * 外加真实 DOM 里更常见的「纯数字，方向在 DOM class/属性上」这种形态
 * （`hint` 参数，见上面大段注释里两套实测确认的机制）。
 * 单独一个「-」是占位符，必须先按 NO_VALUE 判掉，不能被当成负号吃掉；
 * `hint.special === 'new'`（site-keywords 的"NEW"）同样是"没有值可比"，
 * 跟占位符走同一条 value:null 路径，但不是"方向未知"，也不是解析失败。
 *
 * 返回 `{ value, directionUnknown }`，不是裸数字——**这是这次修复的关键**：
 * `value` 只有在方向明确（文本符号或 hint 指向一个方向）时才是带符号的数字；
 * 方向解析不出来时 `value` 必须是 `null`，`directionUnknown` 才是 `true`，绝不能
 * 把「不知道涨跌」悄悄当成「涨」输出——这正是审计发现的那个全量方向丢失的 bug。
 * `value === null && directionUnknown === false` 仍然保留给「占位符」「NEW」或
 * 「数字本身解析不出来」这三种旧含义，调用方不用改判断逻辑。
 */
export function parseSignedPercentCell(value, hint) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return { value: null, directionUnknown: false };
  // 直接查文本本身，不依赖 hint 有没有打对标签——2026-09-13 实跑证明了这一点：
  // hint.special 只在提取器主动识别时才有，漏识别时这里必须还有兜底。
  if (NON_COMPARABLE_CHANGE.test(text) || hint?.special === 'new' || hint?.special === 'lost') {
    return { value: null, directionUnknown: false };
  }
  const direction = resolveDirection(text, hint);
  const magnitudeText = text.replace(/[↑↓]/g, '').replace(/^[+-]/, '').replace(/%$/, '').trim();
  const magnitude = parseNumber(magnitudeText);
  if (magnitude === null) return { value: null, directionUnknown: false };
  if (direction === 'down') return { value: -magnitude, directionUnknown: false };
  if (direction === 'up') return { value: magnitude, directionUnknown: false };
  return { value: null, directionUnknown: true };
}

/** 「00:03:58」之类的时长：原始字符串保留给人看，另外算出秒数给代码用。占位符一律两者都 null。 */
function parseDuration(value) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return { raw: null, seconds: null };
  const match = text.match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return { raw: null, seconds: null };
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return { raw: text, seconds };
}

/** Antd simple 分页器的 title 属性，形如「1/389777」（当前页/总页数）。
 * 节点不存在、或者 title 不是这个格式时两个都是 null——不去猜一个数字出来。 */
function parsePagerTitle(title) {
  const text = String(title ?? '').trim();
  const match = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (!match) return { currentPage: null, totalPages: null };
  return { currentPage: Number(match[1]), totalPages: Number(match[2]) };
}

/** 占位符之外的普通文本格（国家名、URL 这类不能拿 parseNumber 处理的字段）。 */
function swText(value) {
  const text = String(value ?? '').trim();
  return text && !isPlaceholder(text) ? text : null;
}

/**
 * 「按列渲染」表格的通用提取器（在页面里跑），关键词生成器、受众地理位置页都用它。
 *
 * **这类表在 DOM 里是按列渲染的**：`.swReactTable-column` 一个容器装一整列，
 * 表头列和数据列还是分开的两组。innerText 出来是「100 个行号一块、100 个国家名一块」，
 * 按行切分必然错位——某一列有空值时 innerText 不会留空行，于是整列往上挪一格，
 * 得到一组读起来完全正常的错数据。
 *
 * 按 DOM 列取值则由结构本身保证对齐：第 i 个数据列的第 j 个格子，就是第 j 行的该列值。
 * 表头列（子元素 <= 2 个）与数据列（子元素上百个）按出现顺序一一对应。
 * 不为每张新报表再抄一份选择器——出现第二张同结构的表就直接复用这份。
 */
export const SW_COLUMN_MAJOR_TABLE_CELLS = `(() => {
  const all = [...document.querySelectorAll('.swReactTable-column')];
  const headerCols = all.filter((c) => c.children.length <= 2);
  const dataCols = all.filter((c) => c.children.length > 2);
  if (!dataCols.length || headerCols.length !== dataCols.length) return null;
  const headers = headerCols.map((c) => (c.children[0]?.innerText || '').trim().split('\\n')[0].trim());
  const columns = dataCols.map((c) => [...c.children].map((x) => (x.innerText || '').trim()));
  const depth = Math.min(...columns.map((c) => c.length));
  const rows = [];
  for (let i = 0; i < depth; i++) rows.push(columns.map((c) => c[i]));
  return { headers, rows };
})()`;

/** 保持旧名字可用——关键词生成器页面用的就是这个通用提取器。 */
export const SW_KEYWORD_TABLE_CELLS = SW_COLUMN_MAJOR_TABLE_CELLS;

/**
 * 「受众地理位置」页同样是 `.swReactTable-column` 按列渲染，结构和关键词生成器
 * 一样，**但表头取值不能照抄那份**：上面那份用 `.split('\\n')[0]` 只留表头的
 * 第一行，关键词生成器的表头本来就该这么取。而地理位置页的国家列表头是跨两行
 * 渲染的——第一行「国家/地区」，第二行「(121)」——切掉第一行之后总数就没了，
 * `headerTotal()` 永远拿不到 `totalRowsOnPage`（2026-08-27 实测事故）。
 * 这里保留表头单元格的完整 innerText，总数留给 `normalizeHeader`/`headerTotal`
 * 自己去处理（它们的正则本来就把 `\s`——包括换行——当空白处理）。
 */
export const SW_GEO_TABLE_CELLS = `(() => {
  const all = [...document.querySelectorAll('.swReactTable-column')];
  const headerCols = all.filter((c) => c.children.length <= 2);
  const dataCols = all.filter((c) => c.children.length > 2);
  if (!dataCols.length || headerCols.length !== dataCols.length) return null;
  const headers = headerCols.map((c) => (c.children[0]?.innerText || '').trim());
  // 「变动」这类方向性格子的方向不在 innerText 里——2026-09-13 第二轮实测确认
  // 这套（audience-geo 地理/受众兴趣 PoP变化列/channels 流量来源明细表，三处
  // 结构相同）的真实机制是 \`<div class="changePercentage positive|negative">\`
  // 包一个 \`<i class="changePercentage-icon sw-icon-arrow-up5|down5">\`，占位是
  // \`<div class="changePercentage">\`（不带 positive/negative）——**没有 SVG**，
  // 见 lib-similarweb.mjs 里 resolveDirection 大段注释「机制 A」。
  const dirHintOf = (el) => {
    const wrapper = el.querySelector('.changePercentage');
    if (!wrapper) return null;
    const cls = wrapper.className || '';
    const direction = /(?:^|\\s)positive(?:$|\\s)/.test(cls) ? 'up' : /(?:^|\\s)negative(?:$|\\s)/.test(cls) ? 'down' : null;
    let fill = null;
    if (!direction) { try { fill = getComputedStyle(wrapper).color; } catch (e) { fill = null; } }
    return { direction, fill };
  };
  const columns = dataCols.map((c) => [...c.children].map((x) => (x.innerText || '').trim()));
  const dirHintColumns = dataCols.map((c) => [...c.children].map(dirHintOf));
  const lengths = columns.map((c) => c.length);
  const depth = Math.min(...lengths);
  // 「结构本身保证对齐」只保证第 j 个格子属于第 j 行，不保证每一列长度一样。
  // 之前这里直接拿最短列的长度截断所有列——如果某一列在 DOM 里少渲染了几个
  // 格子（不管什么原因），所有列都会被这一列拖着从底部截断，且没有任何信号：
  // 表面上看是「一张读到 20 行的完整表」，实际是「121 行被砍到 20 行」。
  // 这里把「列长度是否一致」暴露出来，交给 deriveGeoRows 决定要不要报警。
  const columnDepthMismatch = lengths.length > 0 && Math.max(...lengths) !== Math.min(...lengths);
  const rows = [];
  const dirHints = [];
  for (let i = 0; i < depth; i++) {
    rows.push(columns.map((c) => c[i]));
    dirHints.push(dirHintColumns.map((c) => c[i]));
  }
  return { headers, rows, dirHints, columnDepthMismatch };
})()`;

/**
 * 「网站关键词」页（organic-search / website-keyword-v2）**不是**按列渲染——
 * 实测这张页面上 `.swReactTable-column` 查不到任何东西，它是标准的 Ant Design
 * 表格：`.ant-table-thead` 表头 + `.ant-table-tbody tr.ant-table-row` 一行一行的
 * `td.ant-table-cell`。按行取值本身就是对齐的，不需要再拼列。
 */
export const SW_ROW_MAJOR_TABLE_CELLS = `(() => {
  const headerCells = [...document.querySelectorAll('.ant-table-thead .ant-table-cell')];
  const bodyRows = [...document.querySelectorAll('.ant-table-tbody tr.ant-table-row')];
  if (!headerCells.length || !bodyRows.length) return null;
  const headers = headerCells.map((c) => (c.innerText || '').trim());
  // 「变动」列的方向不在 innerText 里——2026-09-13 第二轮实测确认这张 Ant Design
  // 表用的是它自己的一套 data-automation 体系，不是 Ant Design 官方图标（见
  // lib-similarweb.mjs resolveDirection 大段注释「机制 B」）：
  // \`[data-automation="cell-value"]\` 的 \`data-automation-value\` 是精确带符号的
  // 原始比值（不是百分比），最可靠；退一步是 \`.SWReactIcons[data-automation-icon-name]\`
  // （"arrow-up"/"arrow-down"，实测 fill 分别是 #4FBF40/#FF442D）；再退一步是颜色。
  // 实测还有一个特殊值 "New"（新词，没有上一期数据可比，不是"方向未知"）。
  const dirHintOf = (td) => {
    const valueEl = td.querySelector('[data-automation="cell-value"]');
    const raw = valueEl ? valueEl.getAttribute('data-automation-value') : null;
    if (raw !== null && /^new$/i.test(raw)) return { direction: null, special: 'new' };
    // "LOST"（词丢失了排名/点击数据）——2026-09-13 第二轮实跑 howolddoyoulook.com
    // 实测到的第二个特殊值，跟 "NEW" 是同一类"没有可比较的变化量"，猜它的
    // data-automation-value 也是 "Lost"（跟 "New" 是同一套命名风格），但这一条
    // 本身没有像 "New" 那样从真实 DOM 里读到确认——lib-similarweb.mjs 里
    // parseSignedPercentCell 直接查文本 "LOST" 兜底，不管这里猜没猜中都不会漏。
    if (raw !== null && /^lost$/i.test(raw)) return { direction: null, special: 'lost' };
    if (raw !== null) {
      const num = Number(raw);
      if (Number.isFinite(num) && num !== 0) return { direction: num < 0 ? 'down' : 'up' };
    }
    const iconDiv = td.querySelector('.SWReactIcons');
    const iconName = iconDiv ? iconDiv.getAttribute('data-automation-icon-name') : null;
    if (iconName === 'arrow-down') return { direction: 'down' };
    if (iconName === 'arrow-up') return { direction: 'up' };
    const fillEl = td.querySelector('svg path[fill]');
    if (fillEl) return { direction: null, fill: fillEl.getAttribute('fill') };
    return null;
  };
  const rows = bodyRows.map((r) => [...r.querySelectorAll('td.ant-table-cell')].map((c) => (c.innerText || '').trim()));
  const dirHints = bodyRows.map((r) => [...r.querySelectorAll('td.ant-table-cell')].map(dirHintOf));
  // 表头里的「关键词 (38,977,695)」是这个站点全站收录的关键词总数，跟这张表
  // 有没有分页是两回事——不能拿它冒充「一共有多少页/多少行没读到」。真正回答
  // 「这张表还有没有下一页」的是 Ant Design 的分页控件，这里顺手取一份。
  // 没有分页控件时 pagination 整体是 null，调用方按「查不到，不代表没有」处理。
  //
  // **不要指望 \`.ant-pagination-total-text\`。** 实测这张页面用的是 Antd 的
  // simple 分页模式（\`ant-pagination-simple\`），那个 class 只有在用了
  // \`showTotal\` 才会渲染，这张表没用，所以那个选择器永远查不到东西——不是
  // 「有时候没有」，是「压根不存在」。真正带总页数的是
  // \`li.ant-pagination-simple-pager\` 这个节点，总数写在它的 \`title\` 属性里，
  // 形如 \`title="1/389777"\`（当前页/总页数），比拆它的子节点文本更稳。
  const nextBtn = document.querySelector('.ant-pagination-next');
  const pagerTitle = document.querySelector('.ant-pagination-simple-pager')?.getAttribute('title') || null;
  const pagination = nextBtn ? {
    hasNext: !nextBtn.classList.contains('ant-pagination-disabled') && nextBtn.getAttribute('aria-disabled') !== 'true',
    pagerTitle,
  } : null;
  return { headers, rows, dirHints, pagination };
})()`;

/**
 * 「网站关键词」页顶部 5 个统计卡（Cannibalization / 长尾机会 / SERP 充满机会 /
 * 高流量机会 / 低潜力关键词）——2026-09-13 第二轮实测确认的结构：每张卡片是
 * `[data-automation="preset-content"]`（数字 + 单位两个子 div），它的**上一个
 * 兄弟节点**是标签容器（第一个子 div 的 innerText 是标签文本，如「长尾机会。」，
 * 注意部分标签实测带一个全角句号）。外层某个祖先节点带
 * `data-automation-button-loading="true"|"false"` 属性——**这是本次审计里
 * 唯一一个逐区块可信的加载态信号**（不是猜的选择器，是这张页面自己的
 * automation 属性），往上最多找 6 层。
 */
export const SW_SITE_KEYWORD_STAT_CARDS = `(() => {
  const contents = [...document.querySelectorAll('[data-automation="preset-content"]')];
  if (!contents.length) return null;
  const cards = contents.map((el) => {
    const labelWrapper = el.previousElementSibling;
    const label = labelWrapper ? (labelWrapper.children[0]?.innerText || '').trim() : null;
    let ancestor = el;
    let loading = null;
    for (let i = 0; i < 6 && ancestor; i++) {
      const attr = ancestor.getAttribute && ancestor.getAttribute('data-automation-button-loading');
      if (attr !== null) { loading = attr; break; }
      ancestor = ancestor.parentElement;
    }
    return {
      label,
      value: (el.children[0]?.innerText || '').trim(),
      unit: (el.children[1]?.innerText || '').trim(),
      loading,
    };
  });
  return { cards };
})()`;

/** 丢掉列切分深度不一致导致的尾部空行——**不能按某个具体字段是否为空来判断**，
 * 否则「改名/丢列导致该字段变 null」和「这本来就是占位空行」会被混为一谈。 */
function nonEmptyRows(rows) {
  return (rows || []).filter((row) => Array.isArray(row) && row.some((v) => String(v ?? '').trim() !== ''));
}

/** 跟 nonEmptyRows 做同一件事，但把 dirHints 按同样的下标一起过滤，保证过滤后
 * `rows[i]` 和 `dirHints[i]` 还是同一行。extractor 没给 dirHints（旧版 cells，
 * 或者没有方向列的表）时退化成全 null，不影响其余逻辑——这也是自测夹具（大多
 * 数不传 dirHints）能继续工作的原因。 */
function nonEmptyRowsWithHints(rows, dirHints) {
  const hints = Array.isArray(dirHints) ? dirHints : [];
  const kept = [];
  const keptHints = [];
  (rows || []).forEach((row, i) => {
    if (Array.isArray(row) && row.some((v) => String(v ?? '').trim() !== '')) {
      kept.push(row);
      keptHints.push(hints[i] || null);
    }
  });
  return { rows: kept, dirHints: keptHints };
}

/**
 * `missingColumns` 只能查出「列名对不上」——它查不出「列名对上了，但格子里的
 * 内容跟解析函数假设的格式不一样」。2026-08-27 实测事故正是这样藏起来的：
 * `点击量` 按名字精确匹配上了，`missingColumns` 是空的，但实际格子是
 * `"9.9M\n0.32%"`（换行分隔），解析器只认 `"9.9M/0.32%"`（斜杠分隔，来自某份
 * discovery 摘要的渲染方式，不是真实 DOM），于是整列静默地全部解析成 null，
 * 报表看起来干干净净地查成功了。
 *
 * 这里补一个独立信号：**列名找到了，格子原文有真东西（不是空、不是占位符），
 * 但解析出来的字段是 null**——这基本就是「格式假设错了」，而不是「这个站真的
 * 没有这项数据」。占位符本身解析成 null 是正常结果，不算可疑，所以判断
 * 「有真东西」时要把占位符也排除掉。
 *
 * **判定标准是比例，不是「全部」。** 第一版只在「每一行都 null」时才报——
 * 这会漏掉换了负号写法（`−`/`–` 而不是 `-`）这种只有部分行（比如所有负数行）
 * 解析失败的情况：多数行是正的、能解析，少数负的全变 null，`allParsedNull`
 * 判不出来，问题就这么被「大多数行是对的」盖过去了。这里改成：在「有真实内容
 * 的行」里，null 的比例超过一半就报——既能抓住 100% 失败（原来的场景），
 * 也能抓住「一半以上失败」这种局部损坏，同时不会因为个别行本来就该是 null
 * （占位符不算在分母里）而误报。
 */
/**
 * 逐列统计「看得见的原文 → 解析成 null」的比例。
 *
 * **分母里的每一个 null 都是丢数据。** 占位符（`-`、`N/A`、`不可用`）已经被
 * 排除在 realCount 之外，所以留在分母里的都是页面上确实印着内容的格子；它解析
 * 不出来，就是我们看见了却扔掉了。这里不存在良性的 null。
 *
 * 因此有两档，而不是一个阈值：
 *   - `partialLossColumns`：**任何** 非零丢失。这一档没有阈值，丢 1 行就报。
 *   - `suspectColumns`：丢失过半，整列基本报废。保留原语义供既有调用方使用。
 *
 * 为什么必须有第一档：`< 0.01%` 那次事故里，121 个国家丢了 9 个 = 7.4%，
 * 远低于 50%，于是 suspectColumns 是空的、missingColumns 是空的、行数对得上，
 * **所有信号一致地说「干净」**。静默丢真实数据且毫无告警，是本库最不能接受的
 * 失败形态；用一个「过半才报」的检测器去防它，等于没防。
 */
function auditColumns(index, wanted, rawRows, parsedRows) {
  const suspectColumns = [];
  const partialLossColumns = [];
  if (!rawRows.length || !parsedRows.length) return { suspectColumns, partialLossColumns };
  for (const [key, label] of Object.entries(wanted)) {
    const i = index[key];
    if (i == null || i < 0) continue; // 列名都没找到，已经在 missingColumns 里了
    let realCount = 0;
    const lost = [];
    rawRows.forEach((row, ri) => {
      const v = String(row[i] ?? '').trim();
      if (!v || isPlaceholder(v)) return; // 占位符不进分母——它解析成 null 是正常结果
      realCount += 1;
      const parsedValue = parsedRows[ri]?.[key];
      if (parsedValue === null || parsedValue === undefined) lost.push(v);
    });
    if (realCount === 0) continue;
    if (lost.length / realCount > 0.5) suspectColumns.push(label);
    else if (lost.length > 0) {
      // 带上原文样本。只报「这列丢了 9 行」没法排查；带上 `< 0.01%` 的原文，
      // 一眼就能看出解析函数缺的是哪种格式。
      partialLossColumns.push({
        column: label,
        lost: lost.length,
        of: realCount,
        samples: [...new Set(lost)].slice(0, 3),
      });
    }
  }
  return { suspectColumns, partialLossColumns };
}


/**
 * 受众地理位置：按国家列出流量份额、受众份额、国家排名、访问时长、页面数/访问。
 * 表头会写「国家/地区(121)」，那个数字**就是**这张表一共有多少个国家/地区，
 * 和 rowsRead 是同一件事的两种说法——两者不等时通常是分页没翻完，而不是
 * 「这个站真的只有这么多国家」。`totalRowsOnPage` 这个名字在这张报表里是准确
 * 的：它就是「页面上这张表的行总数」。**site-keywords 那份表头总数不是这个
 * 意思**（那是全站收录关键词数，不是这张表的行数），所以那边用了另一个字段名
 * `pageReportedKeywordTotal`，不要以为两张报表的「总数」字段说的是同一件事。
 *
 * **没有 `#` 这一列。** 实测行号是隐式的，页面并不渲染一个叫「#」的表头——
 * 按名字找它只会一直落进 missingColumns，而 missingColumns 一直非空等于没人
 * 会再看它。行号本来就等于这一行在表里的顺序，所以直接用行下标 +1，不当成
 * 「找不到的列」处理。
 */
/**
 * 一列百分比的求和，外加「有多少行真的贡献了数字」。
 *
 * 只给事实，不下判断——「和是不是该等于 100」取决于这张表读全了没有，
 * 那是调用方才知道的事。这里**不做**「差不多就算了」的容忍处理：把 sum
 * 原样交出去，让判定逻辑集中在一个地方。
 */
function sumShare(rows, key) {
  const values = rows.map((r) => r[key]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (!values.length) return null;
  // 浮点累加会让 100 变成 100.00000000000001，四舍五入到 2 位再报。
  const sum = Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
  return { sum, contributing: values.length, ofRows: rows.length };
}

/**
 * 滚动容器选择器与探针脚本——2026-09-13 第四轮用真实生产脚本（不是探索工具）
 * 实测确认，供 `backlink/scripts/dev/similarweb-scroll-ab.mjs`（滚动 A/B
 * 对照实验，第五轮新增，只写不跑）复用，避免那个诊断脚本自己重抄一遍探针。
 * **`similarweb-query.mjs` 自己的 `SCROLL_TO_BOTTOM` 目前仍是内联字符串**，
 * 没有改成引用这份 export——那是一条本轮"完全离线"约束下不去动的既有生产
 * 路径（改了没法实测验证），等下一次允许连浏览器实测时再统一成一份，现在
 * 保持两份内容一致就行（都是同一个选择器、同一套 gap<=8 判据）。
 */
export const SIMILARWEB_SCROLL_CONTAINER_SELECTOR = '.sw-layout-scrollable-element';
export const SIMILARWEB_SCROLL_PROBE_JS = `(() => {
  const el = document.querySelector(${JSON.stringify(SIMILARWEB_SCROLL_CONTAINER_SELECTOR)});
  let containerFound = !!el;
  if (el) { try { el.scrollTop = el.scrollHeight; } catch (e) { containerFound = false; } }
  try { window.scrollTo(0, document.body.scrollHeight); } catch (e) {}
  const gap = el ? el.scrollHeight - el.scrollTop - el.clientHeight : (document.documentElement.scrollHeight - window.scrollY - window.innerHeight);
  return {
    containerFound,
    containerSelector: containerFound ? ${JSON.stringify(SIMILARWEB_SCROLL_CONTAINER_SELECTOR)} : null,
    scrollTop: el ? el.scrollTop : window.scrollY,
    scrollHeight: el ? el.scrollHeight : document.documentElement.scrollHeight,
    clientHeight: el ? el.clientHeight : window.innerHeight,
    atBottom: gap <= 8,
    hidden: document.hidden,
    visibilityState: document.visibilityState,
  };
})()`;
/** 跟上面那份唯一的差别：不执行任何 `scrollTop=`/`scrollTo(...)`赋值，只读当前
 * 状态——A/B 对照实验的"零滚动"那一组必须保证真的一次滚动都没发生过。 */
export const SIMILARWEB_SCROLL_READ_ONLY_PROBE_JS = `(() => {
  const el = document.querySelector(${JSON.stringify(SIMILARWEB_SCROLL_CONTAINER_SELECTOR)});
  const gap = el ? el.scrollHeight - el.scrollTop - el.clientHeight : (document.documentElement.scrollHeight - window.scrollY - window.innerHeight);
  return {
    containerFound: !!el,
    containerSelector: el ? ${JSON.stringify(SIMILARWEB_SCROLL_CONTAINER_SELECTOR)} : null,
    scrollTop: el ? el.scrollTop : window.scrollY,
    scrollHeight: el ? el.scrollHeight : document.documentElement.scrollHeight,
    clientHeight: el ? el.clientHeight : window.innerHeight,
    atBottom: gap <= 8,
    hidden: document.hidden,
    visibilityState: document.visibilityState,
  };
})()`;

export function deriveGeoRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return {
      rows: [], missingColumns: ['<no DOM columns>'], suspectColumns: [], partialLossColumns: [],
      directionUnknownColumns: [],
      totalRowsOnPage: null, rowsRead: 0, columnDepthMismatch: null,
      rowsExpected: null, rowsCaptured: 0, truncated: null,
    };
  }
  // 「变动」不放进 wanted/auditColumns 的通用比对——它现在要区分「格式解析不出来」
  // 和「方向读不出来」两种不同性质的 null（见下面的专项统计），跟 site-keywords
  // 里 点击量变动/排位变动 已经在用的处理方式一致，不要在这里另开一套逻辑。
  const wanted = {
    country: '国家/地区',
    trafficSharePercent: '流量份额',
    audienceSharePercent: '受众群体份额',
    countryRank: '国家/地区排名',
    visitDuration: '访问持续时间',
    pagesPerVisit: '页面数/访问',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);
  const cellAt = (row, i) => (typeof i === 'number' && i >= 0 && i < row.length ? row[i] : undefined);
  const normalized = (cells.headers || []).map(normalizeHeader);
  const changeIdx = normalized.indexOf('变动');
  if (changeIdx < 0) missingColumns.push('变动');

  const { rows: rawRows, dirHints: rawDirHints } = nonEmptyRowsWithHints(cells.rows, cells.dirHints);

  let changeRealCount = 0;
  let changeMagnitudeLostCount = 0;
  let changeDirectionUnknownCount = 0;
  const changeMagnitudeLostSamples = [];

  const rows = rawRows.map((row, i) => {
    const duration = parseDuration(cell(row, 'visitDuration'));
    const changeText = String(cellAt(row, changeIdx) ?? '').trim();
    const changeHint = changeIdx >= 0 ? (rawDirHints[i]?.[changeIdx] ?? null) : null;
    const change = parseSignedPercentCell(cellAt(row, changeIdx), changeHint);
    if (changeIdx >= 0 && changeText && !isPlaceholder(changeText)) {
      changeRealCount += 1;
      if (change.directionUnknown) changeDirectionUnknownCount += 1;
      else if (change.value === null) {
        changeMagnitudeLostCount += 1;
        if (changeMagnitudeLostSamples.length < 3) changeMagnitudeLostSamples.push(changeText);
      }
    }
    return {
      rank: i + 1,
      country: swText(cell(row, 'country')),
      trafficSharePercent: swCell(cell(row, 'trafficSharePercent'), { percent: true }),
      changePercent: change.value,
      // 有原文、能解析出数值，但方向既没有文本符号也没能从 DOM hint 认出来——
      // 绝不能因为「反正解析不出方向」就悄悄丢掉这行的存在，必须让调用方看见。
      changePercentDirectionUnknown: change.directionUnknown,
      audienceSharePercent: swCell(cell(row, 'audienceSharePercent'), { percent: true }),
      countryRank: parseRank(cell(row, 'countryRank')),
      visitDuration: duration.raw,
      visitDurationSeconds: duration.seconds,
      pagesPerVisit: swCell(cell(row, 'pagesPerVisit')),
    };
  });

  const { suspectColumns, partialLossColumns } = auditColumns(index, wanted, rawRows, rows);
  if (changeIdx >= 0 && changeRealCount > 0 && changeMagnitudeLostCount > 0) {
    if (changeMagnitudeLostCount / changeRealCount > 0.5) suspectColumns.push('变动');
    else {
      partialLossColumns.push({
        column: '变动', lost: changeMagnitudeLostCount, of: changeRealCount,
        samples: [...new Set(changeMagnitudeLostSamples)],
      });
    }
  }
  const directionUnknownColumns = [];
  if (changeIdx >= 0 && changeDirectionUnknownCount > 0) {
    directionUnknownColumns.push({ column: '变动', count: changeDirectionUnknownCount, of: changeRealCount });
  }

  const totalRowsOnPage = headerTotal(cells.headers, '国家/地区');
  const truncated = totalRowsOnPage !== null ? rows.length < totalRowsOnPage : null;

  return {
    rows,
    missingColumns,
    suspectColumns,
    partialLossColumns,
    directionUnknownColumns,
    // 自洽校验：各国流量份额加起来应该 ≈ 100%。这是**不需要第二个数据源**就能
    // 做的交叉验证——页面自己声明了一个总量，各行是它的拆分。丢行、丢值、
    // 单位解析错，都会让这个和偏离。`< 0.01%` 那次事故里 121 国丢了 9 个，
    // 列检测因为只丢 7.4% 而沉默，但这个和会掉下来。
    trafficShareSum: sumShare(rows, 'trafficSharePercent'),
    totalRowsOnPage,
    rowsRead: rows.length,
    // 跟 totalRowsOnPage/rowsRead 是同一对数字，只是换成审计报告要求的命名——
    // 两组字段并存，不删旧的，任何已经在读 totalRowsOnPage/rowsRead 的调用方
    // 不受影响。
    rowsExpected: totalRowsOnPage,
    rowsCaptured: rows.length,
    truncated,
    // 提取器发现列长度不一致时置 true——说明最短的那一列把所有列都从底部
    // 截断了，`rowsRead` 可能比真实行数少，而且具体哪些国家被砍掉不确定。
    // 提取器给不出这个信息（比如 cells 是旧格式）时是 null，不是「确认没有」。
    columnDepthMismatch: cells.columnDepthMismatch === undefined ? null : Boolean(cells.columnDepthMismatch),
  };
}

/**
 * 「流量来源渠道」页下方那张更细的明细表——2026-09-13 第二轮 Claude in Chrome
 * 实测确认：跟 audience-geo 的地理表是**同一套** `.swReactTable-column` 结构
 * （复用 SW_GEO_TABLE_CELLS 这个通用提取器即可，不用再抄一份），列是（隐式排名）/
 * 流量来源(N)/流量份额/变动/来源类型/全球排名，共 6 列（实测 howolddoyoulook.com
 * 是 14 行）。这张表把 `deriveChannels` 的 10 大类渠道进一步拆到"具体来源"粒度
 * （比如把「自然搜索」拆成 Google Search / Bing Search 等，各带自己的全球排名），
 * 之前完全没有脚本碰过，记在 backlink 审计的 notCovered 里。
 *
 * **没有 `#` 这一列**（跟地理表一样，行号是隐式的），直接用行下标 +1。
 */
export function deriveChannelDetailRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return {
      rows: [], missingColumns: ['<no DOM columns>'], suspectColumns: [], partialLossColumns: [],
      directionUnknownColumns: [], totalRowsOnPage: null, rowsRead: 0,
      rowsExpected: null, rowsCaptured: 0, truncated: null, columnDepthMismatch: null,
    };
  }
  const wanted = {
    source: '流量来源',
    trafficSharePercent: '流量份额',
    sourceType: '来源类型',
    globalRank: '全球排名',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);
  const cellAt = (row, i) => (typeof i === 'number' && i >= 0 && i < row.length ? row[i] : undefined);
  const normalized = (cells.headers || []).map(normalizeHeader);
  const changeIdx = normalized.indexOf('变动');
  if (changeIdx < 0) missingColumns.push('变动');

  const { rows: rawRows, dirHints: rawDirHints } = nonEmptyRowsWithHints(cells.rows, cells.dirHints);

  let changeRealCount = 0;
  let changeMagnitudeLostCount = 0;
  let changeDirectionUnknownCount = 0;
  const changeMagnitudeLostSamples = [];

  const rows = rawRows.map((row, i) => {
    const changeText = String(cellAt(row, changeIdx) ?? '').trim();
    const changeHint = changeIdx >= 0 ? (rawDirHints[i]?.[changeIdx] ?? null) : null;
    const change = parseSignedPercentCell(cellAt(row, changeIdx), changeHint);
    if (changeIdx >= 0 && changeText && !isPlaceholder(changeText)) {
      changeRealCount += 1;
      if (change.directionUnknown) changeDirectionUnknownCount += 1;
      else if (change.value === null) {
        changeMagnitudeLostCount += 1;
        if (changeMagnitudeLostSamples.length < 3) changeMagnitudeLostSamples.push(changeText);
      }
    }
    return {
      rank: i + 1,
      source: swText(cell(row, 'source')),
      trafficSharePercent: swCell(cell(row, 'trafficSharePercent'), { percent: true }),
      changePercent: change.value,
      changePercentDirectionUnknown: change.directionUnknown,
      sourceType: swText(cell(row, 'sourceType')),
      globalRank: parseRank(cell(row, 'globalRank')),
    };
  });

  const { suspectColumns, partialLossColumns } = auditColumns(index, wanted, rawRows, rows);
  if (changeIdx >= 0 && changeRealCount > 0 && changeMagnitudeLostCount > 0) {
    if (changeMagnitudeLostCount / changeRealCount > 0.5) suspectColumns.push('变动');
    else {
      partialLossColumns.push({
        column: '变动', lost: changeMagnitudeLostCount, of: changeRealCount,
        samples: [...new Set(changeMagnitudeLostSamples)],
      });
    }
  }
  const directionUnknownColumns = [];
  if (changeIdx >= 0 && changeDirectionUnknownCount > 0) {
    directionUnknownColumns.push({ column: '变动', count: changeDirectionUnknownCount, of: changeRealCount });
  }

  const totalRowsOnPage = headerTotal(cells.headers, '流量来源');
  const truncated = totalRowsOnPage !== null ? rows.length < totalRowsOnPage : null;

  return {
    rows,
    missingColumns,
    suspectColumns,
    partialLossColumns,
    directionUnknownColumns,
    totalRowsOnPage,
    rowsRead: rows.length,
    rowsExpected: totalRowsOnPage,
    rowsCaptured: rows.length,
    truncated,
    columnDepthMismatch: cells.columnDepthMismatch === undefined ? null : Boolean(cells.columnDepthMismatch),
  };
}

/**
 * 「受众兴趣」tab（selectedTab=audienceInterests）的「交叉访问网站」表——
 * 2026-09-13 第二轮实测确认结构：同一套 `.swReactTable-column`（复用
 * SW_GEO_TABLE_CELLS 即可），表头「域(N)」/行业/全球排名/相关性评分/交叉访问/
 * PoP变化/AdSense，共 7 个具名列（实测原始列数是 12，其余 5 列没有确认到
 * 用途，可能是隐藏/装饰列，不在 wanted 里）。
 *
 * **`crossVisit`/`adsense` 两个字段的取值格式本次没有实测到真实样本**（实测
 * 那次这两列全是「-」占位符）——`crossVisit` 按通用数字解析（`swCell`），
 * `adsense` 按原文文本保留（`swText`，如果它其实是一个只有图标没有文字的格子，
 * `swText` 会读到 null，跟"这一格没有数据"分不清，这是本函数**唯一**没有实测
 * confirmed 的两个字段，2026-09-13 第三轮用一个数据更丰富的对照域名只读实测
 * 确认（只读查看一次，未落盘该域名的任何具体数据/名称到仓库，只把结论写下来）：
 *   - `crossVisit`：是**百分比**（实测 "86.51%"），已改用 `swCell({percent:true})`。
 *   - `AdSense`：**这一列不是每个站点都有**——howolddoyoulook.com 的表头有
 *     这一列（7 列），对照的大流量站点反而没有（6 列）。这不是
 *     解析失败，是页面按站点条件决定要不要渲染这一列，所以 `adsense` 不放进
 *     `wanted`/`missingColumns` 的常规校验里（那套校验假设"列消失=结构变了"，
 *     这里列消失是正常业务逻辑）——单独按下标查，找不到就是 `undefined`，
 *     字段值为 `null`，不计入 missingColumns。
 * 方向列走机制 A（PoP变化，跟 geography/channels 明细表同一套 changePercentage
 * 判据）。**大站点会分页**（对照域名表头总数是 5 位数、只渲染当前页 ~100 行，
 * 页面自带"1 out of 389"这类 footer，不是懒加载——见 similarweb-query.mjs 里
 * RENDER_SIGNAL 对应分页 footer 的处理）。
 */
export function deriveAudienceInterestsRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return {
      rows: [], missingColumns: ['<no DOM columns>'], suspectColumns: [], partialLossColumns: [],
      directionUnknownColumns: [], totalRowsOnPage: null, rowsRead: 0,
      rowsExpected: null, rowsCaptured: 0, truncated: null, columnDepthMismatch: null,
    };
  }
  const wanted = {
    domain: '域',
    industry: '行业',
    globalRank: '全球排名',
    relevanceScore: '相关性评分',
    crossVisit: '交叉访问',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);
  const cellAt = (row, i) => (typeof i === 'number' && i >= 0 && i < row.length ? row[i] : undefined);
  const normalized = (cells.headers || []).map(normalizeHeader);
  const changeIdx = normalized.indexOf('PoP变化');
  if (changeIdx < 0) missingColumns.push('PoP变化');
  // AdSense 是条件列（不是每个站点都渲染），不走 wanted/missingColumns 那套
  // "找不到=结构变了"的校验——见函数顶部注释。
  const adsenseIdx = normalized.indexOf('AdSense');

  const { rows: rawRows, dirHints: rawDirHints } = nonEmptyRowsWithHints(cells.rows, cells.dirHints);

  let changeRealCount = 0;
  let changeMagnitudeLostCount = 0;
  let changeDirectionUnknownCount = 0;
  const changeMagnitudeLostSamples = [];

  const rows = rawRows.map((row, i) => {
    const changeText = String(cellAt(row, changeIdx) ?? '').trim();
    const changeHint = changeIdx >= 0 ? (rawDirHints[i]?.[changeIdx] ?? null) : null;
    const change = parseSignedPercentCell(cellAt(row, changeIdx), changeHint);
    if (changeIdx >= 0 && changeText && !isPlaceholder(changeText) && !NON_COMPARABLE_CHANGE.test(changeText)) {
      changeRealCount += 1;
      if (change.directionUnknown) changeDirectionUnknownCount += 1;
      else if (change.value === null) {
        changeMagnitudeLostCount += 1;
        if (changeMagnitudeLostSamples.length < 3) changeMagnitudeLostSamples.push(changeText);
      }
    }
    return {
      domain: swText(cell(row, 'domain')),
      industry: swText(cell(row, 'industry')),
      globalRank: parseRank(cell(row, 'globalRank')),
      relevanceScore: swCell(cell(row, 'relevanceScore')),
      crossVisit: swCell(cell(row, 'crossVisit'), { percent: true }),
      changePercent: change.value,
      changePercentDirectionUnknown: change.directionUnknown,
      // 条件列，找不到时 adsenseIdx 是 -1，cellAt 返回 undefined，swText 给 null——
      // 跟"这个站点真的没有这一列"是同一个结果，不需要额外分支。
      adsense: swText(cellAt(row, adsenseIdx)),
    };
  });

  const { suspectColumns, partialLossColumns } = auditColumns(index, wanted, rawRows, rows);
  if (changeIdx >= 0 && changeRealCount > 0 && changeMagnitudeLostCount > 0) {
    if (changeMagnitudeLostCount / changeRealCount > 0.5) suspectColumns.push('PoP变化');
    else {
      partialLossColumns.push({
        column: 'PoP变化', lost: changeMagnitudeLostCount, of: changeRealCount,
        samples: [...new Set(changeMagnitudeLostSamples)],
      });
    }
  }
  const directionUnknownColumns = [];
  if (changeIdx >= 0 && changeDirectionUnknownCount > 0) {
    directionUnknownColumns.push({ column: 'PoP变化', count: changeDirectionUnknownCount, of: changeRealCount });
  }

  const totalRowsOnPage = headerTotal(cells.headers, '域');
  const truncated = totalRowsOnPage !== null ? rows.length < totalRowsOnPage : null;

  return {
    rows,
    missingColumns,
    suspectColumns,
    partialLossColumns,
    directionUnknownColumns,
    totalRowsOnPage,
    rowsRead: rows.length,
    rowsExpected: totalRowsOnPage,
    rowsCaptured: rows.length,
    truncated,
    columnDepthMismatch: cells.columnDepthMismatch === undefined ? null : Boolean(cells.columnDepthMismatch),
  };
}

/**
 * 「受众重叠」tab（selectedTab=overlap）——**不是表格**，是文本区块：
 * 「平均独立访客数」标签后跟着「域名/数字」交替对，直到「独立受众总数」标签，
 * 后面紧跟一个总数。2026-09-13 第二轮实测原文（已脱敏域名）：
 *   平均独立访客数 / howolddoyoulook.com / 51,025 / veriff.com / 462,211 /
 *   faceage.ai / 62,062 / 独立受众总数 / 564,238
 * 默认（没有手动添加对比站点）时页面会自动配几个相似站点做对比，实测确实
 * 显示了真实数字，不是要求先添加站点的空态——但**没有实测到"完全没有可比较
 * 站点"的空态长什么样**，这种情况下按下面的判据会落进 `dataConfirmed:false`
 * 而不是被误判成有数据，见 `emptyStateObserved` 的用法。
 *
 * `lines` 是已经按行切分、trim 过的 bodyText（跟 deriveMetrics 等函数吃的
 * 输入一样）。
 */
export function deriveAudienceOverlapMetrics(lines) {
  const startIdx = lines.indexOf('平均独立访客数');
  const totalLabelIdx = lines.indexOf('独立受众总数');
  if (startIdx < 0 || totalLabelIdx < 0 || totalLabelIdx <= startIdx) {
    return {
      perSiteAvgVisitors: [],
      totalUniqueAudience: null,
      // 两个锚点文案都没读到——不知道是"这个 tab 还没渲染完"还是"页面结构变了"，
      // 不能默认当空态，也不能默认当有数据。
      dataConfirmed: false,
      emptyStateObserved: /抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data/.test(lines.join('\n')),
    };
  }
  const perSiteAvgVisitors = [];
  for (let i = startIdx + 1; i + 1 < totalLabelIdx; i += 2) {
    const domain = swText(lines[i]);
    const visitors = parseNumber(lines[i + 1]);
    if (domain && visitors !== null) perSiteAvgVisitors.push({ domain, avgVisitors: visitors });
  }
  const totalUniqueAudience = parseNumber(lines[totalLabelIdx + 1]);
  return {
    perSiteAvgVisitors,
    totalUniqueAudience,
    // 两个锚点都读到了、且至少解析出一个站点+总数，才算"确认有数据"。
    dataConfirmed: perSiteAvgVisitors.length > 0 && totalUniqueAudience !== null,
    emptyStateObserved: false,
  };
}

/**
 * 「受众人口特征」tab（selectedTab=demographicsUsersBased）。2026-09-13 第二轮
 * 实测样本数据不全，第三轮用一个数据更丰富的对照域名只读实测拿到了完整样本
 * （只读查看一次，未落盘该域名的名称/具体数据到仓库；下面的域名和数字都是
 * 脱敏占位，只是为了标注每个字段在原文里出现的顺序，不是真实观测值），
 * 确认原文结构：
 *   Male / 59.59% / Female / 40.41% /
 *   20.46%​20.46% / 25.74%​25.74% / 18.65%​18.65% / 15.17%​15.17% / 11.47%​11.47% / 8.52%​8.52% /
 *   18-24 / 25-34 / 35-44 / 45-54 / 55-64 / 65+ /
 *   各受众群体的流量和参与度 / 女性 / 18-24岁 /
 *   域 / 竞争对手份额 / 受众群体份额 / 访问持续时间 / 页面数/访问 / 跳出率 /
 *   example-site.test / 100% / 7.2% / 00:03:08 / 3.2 / 54.72%
 * 三点已知局限，都在下面对应字段的注释里重复一遍：
 *   1. 性别标签是英文 "Male"/"Female"（面板整体是中文 UI，这两个词没有翻译）。
 *   2. 年龄分布是"6 个百分比先出现（每个值和自己之间夹了一个零宽字符，可能是
 *      tooltip 重复），6 个年龄段标签后出现"——按 Similarweb 固定的年龄段顺序
 *      做**位置配对**，不是按标签相邻取值；图表改版顺序变了会直接错位，没有
 *      更强的锚点可用。
 *   3. "各受众群体的流量和参与度"那张分段表只显示**当前下拉选中的一个
 *      "性别×年龄"组合**（默认是"女性/18-24岁"），要拿全部组合需要模拟点击
 *      切换下拉，本函数不做，只解析当前显示的这一行。
 * 三态判据（`sectionAnchorFound`/`emptyStateObserved`/`hasGenderSplit`）保留
 * 不变，用来兼容第二轮那种数据不全的样本；`genderMalePercent`/`ageDistribution`/
 * `segment` 是第三轮新增的真实字段，解析不出来时各自为 null，不影响三态判断。
 */
export function deriveAudienceDemographicsSignal(lines) {
  const text = lines.join('\n');
  const sectionAnchorFound = lines.includes('各受众群体的流量和参与度');
  const emptyStateObserved = /抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data/.test(text);
  const genderMatch = text.match(/女性[\s\S]{0,20}?(\d+(?:\.\d+)?)\s*%/);
  const hasGenderSplit = Boolean(genderMatch);

  // 实测确认的性别分布——英文标签 "Male"/"Female"，紧跟一个百分比。
  const genderFull = text.match(/Male\s*\n?\s*(\d+(?:\.\d+)?)\s*%\s*\n?\s*Female\s*\n?\s*(\d+(?:\.\d+)?)\s*%/);
  const genderMalePercent = genderFull ? Number(genderFull[1]) : null;
  const genderFemalePercentConfirmed = genderFull ? Number(genderFull[2]) : null;

  // 年龄分布：按固定顺序位置配对，见函数顶部注释的局限 2。
  const AGE_BRACKETS = ['18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  let ageDistribution = null;
  const ageLabelIdx = lines.indexOf(AGE_BRACKETS[0]);
  if (ageLabelIdx >= AGE_BRACKETS.length) {
    const labelLines = lines.slice(ageLabelIdx, ageLabelIdx + AGE_BRACKETS.length);
    const pctLines = lines.slice(ageLabelIdx - AGE_BRACKETS.length, ageLabelIdx);
    if (labelLines.join('|') === AGE_BRACKETS.join('|') && pctLines.length === AGE_BRACKETS.length) {
      ageDistribution = AGE_BRACKETS.map((bracket, i) => {
        const m = pctLines[i].match(/(\d+(?:\.\d+)?)\s*%/);
        return { bracket, percent: m ? Number(m[1]) : null };
      });
    }
  }

  // 分段表：只有当前下拉选中组合的一行，见函数顶部注释的局限 3。
  let segment = null;
  const segHeaderIdx = lines.indexOf('域');
  if (segHeaderIdx >= 0 && lines[segHeaderIdx - 1] && lines.slice(segHeaderIdx, segHeaderIdx + 6).join('|') === '域|竞争对手份额|受众群体份额|访问持续时间|页面数/访问|跳出率') {
    const genderFilter = lines[segHeaderIdx - 2] || null;
    const ageFilter = lines[segHeaderIdx - 1] || null;
    const dataRow = lines.slice(segHeaderIdx + 6, segHeaderIdx + 12);
    if (dataRow.length === 6) {
      const duration = parseDuration(dataRow[3]);
      segment = {
        genderFilter, ageFilter,
        domain: swText(dataRow[0]),
        competitorSharePercent: swCell(dataRow[1], { percent: true }),
        audienceSharePercent: swCell(dataRow[2], { percent: true }),
        visitDuration: duration.raw,
        visitDurationSeconds: duration.seconds,
        pagesPerVisit: swCell(dataRow[4]),
        bounceRatePercent: swCell(dataRow[5], { percent: true }),
      };
    }
  }

  return {
    sectionAnchorFound,
    emptyStateObserved,
    hasGenderSplit,
    genderFemalePercent: hasGenderSplit ? Number(genderMatch[1]) : null,
    genderMalePercent,
    // 跟上面 hasGenderSplit 走的粗正则不是同一条路径，两个 female 数字应该一致，
    // 保留 genderFemalePercent（兼容旧字段名）不变，这个是同一个数的确认版本。
    genderFemalePercentConfirmed,
    ageDistribution,
    segment,
    // 有部分数据 / 确认空 / 都不是（未加载或结构没认出来）——三态由调用方
    // 按这三个字段自己组合判断，这里不替调用方下结论。
    dataConfirmed: hasGenderSplit || Boolean(genderFull),
  };
}

/** 「<点击量>」「<份额%>」两截，例如实测的 `"9.9M\n0.32%"`（换行分隔）。
 * **不是斜杠 `"9.9M/0.32%"`**——那个写法来自某份 discovery 摘要的渲染方式，
 * 不是真实 DOM 里的格子内容，2026-08-27 实测：只认斜杠会让这一列在真实页面上
 * 整表解析成 null，而 missingColumns 还是空的（列名本身找对了）。斜杠仍然接受，
 * 万一某个变体页面真是这么渲染的。份额单独拆出来是因为 top5SharePercent
 * 就是拿它累加的——调用方不该自己再拆一遍这个格式。
 *
 * **2026-09-13 第三轮离线排查：`suspectColumns` 里"点击量"整列可疑的根因**。
 * 实跑 howolddoyoulook.com 的 site-keywords，75 行里超过一半是长尾词，点击量
 * 格子实测是 `"< 50\n< 0.01%"` 这种形态——份额部分也会用「< 下限值」写法（跟
 * audience-geo 的 `< 0.01%` 是同一种惯例），旧正则的份额分组只认纯数字
 * `[\d.]+`，"<" 前缀让整行匹配失败，退到把原始多行文本整段扔给 `swCell()`
 * （必然解析不出来），于是这一整列的 `realCount` 全部落进 `lost`，过半即报
 * `suspectColumns`——这不是"数据本身丢了"，是解析器没认全一种早就在别处
 * （`parseNumber` 的 belowBound 分支）处理过的写法。修法：份额分组放开
 * `<`/`＜` 前缀，两边都交给 `parseNumber` 处理（它本来就认得 `< 0.01%`）。 */
function parseClicksShare(value) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return { clicks: null, sharePercent: null };
  const unified = text.replace(/\s*\n\s*/g, '/');
  const match = unified.match(/^(.+?)\/([<＜]?\s*[\d.,]+)\s*%$/);
  if (!match) return { clicks: swCell(text), sharePercent: null };
  return { clicks: parseNumber(match[1].trim()), sharePercent: parseNumber(match[2].trim()) };
}

/**
 * 前 5 个关键词的点击份额之和。**只有前 5 行都真的带了份额值才给数字**——
 * 少于 5 个就返回 null，绝不把「只有 3 行有数」的部分和悄悄当成结论输出，
 * 那样看起来和「前 5 名占了 X%」是同一句话，实际缺了一大截。
 */
function deriveTop5SharePercent(rows) {
  const top5 = rows.slice(0, 5);
  const shares = top5
    .map((row) => row.clicksSharePercent)
    .filter((v) => typeof v === 'number' && !Number.isNaN(v));
  if (shares.length < 5) return null;
  return Number(shares.reduce((a, b) => a + b, 0).toFixed(2));
}

/**
 * 「网站关键词」页：Ant Design 行渲染表格。表头里「变动」出现两次，光按名字
 * 找列天然分不清是哪一个。**这里曾经按「第一个/最后一个变动列」的位置分配**——
 * 独立检查报告实测戳穿：只有一个「变动」列时（另一个被删或改名），
 * `changeIndices.length === 1`，那一个列不管它实际是谁，永远被当成
 * `clicksChangePercent`；`rankChangePercent` 静默变 null，`missingColumns`
 * 和 `suspectColumns` 全是空的——因为列名本身「变动」是找到了，格式也解析
 * 得出数字，只是安错了字段。
 *
 * 现在改成**按左邻列消歧**：看每个「变动」列左边紧挨着的是哪一列。左边是
 * 「点击量」的那个是点击量涨跌；左边是「排位」的那个是排名涨跌——这与位置无关，
 * 两列不管被挪到表格哪个位置，各自后面跟着的「变动」还是能认出来。
 *
 * **锚点用「排位」，不是「#URL」。** 这里绕过一次弯，记下来免得再绕：
 * 一份代码审查曾断言「实测表头里根本没有『排位』这一列，第二个变动跟在 #URL
 * 后面」，据此改成了 `#URL`。但那条结论是**从自测夹具推出来的**，而夹具本身
 * 就是照那份说法写的——自证循环。两份互相独立的实测表头 dump 都是：
 *   … 零点击 | 排位 | 变动 | 热门网址 | #URL | SERP features
 * 第二个「变动」左邻是「排位」。改用 `#URL` 之后实跑立刻暴露：
 * `missingColumns: ['#URL变动']` + `suspectColumns: ['变动(左邻列无法识别)']`，
 * `rankChangePercent` 恒为 null。**这是第五次「夹具照摘要写、和真实 DOM 不符」
 * 造成的缺陷**——夹具必须从 DOM dump 复制，不能从任何一段散文推。
 *
 * `#URL` 保留为备用锚点：只有在没有「排位」列时才认它，布局真变了也不至于全丢。
 * 两个都匹配不上就进 suspectColumns，绝不按位置猜。
 *
 * 找不到某一侧锚点、或者「变动」列左边既不是「点击量」也不是「#URL」（消歧
 * 失败），都不会被静默分给任何一个字段——分别记进 missingColumns（找不到）
 * 或 suspectColumns（找到了但认不出是哪个）。
 *
 * **`关键词 (38,977,695)` 里的那个数字不是这张表的行数。** 它是 Similarweb
 * 给这个站点统计的全站收录关键词总数，跟这次查询实际返回、渲染成表格的行数
 * 是两个完全不同的概念——2026-08-27 检查报告点名过这一点：如果字段还叫
 * `totalRowsOnPage`，会让人拿它和 `rowsRead`（比如 100）对比，得出「读少了
 * 3900 万行」这种荒谬结论。所以这里改叫 `pageReportedKeywordTotal`，老老实实
 * 说它数的是什么。「这张表本身有没有被截断」是另一件事，答案在 `pagination`——
 * 见 `SW_ROW_MAJOR_TABLE_CELLS` 的注释——`morePagesAvailable` 就是从那里来的。
 */
export function deriveSiteKeywordRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return {
      rows: [], missingColumns: ['<no DOM rows>'], suspectColumns: [], partialLossColumns: [],
      directionUnknownColumns: [], top5SharePercent: null,
      pageReportedKeywordTotal: null, rowsRead: 0, morePagesAvailable: null, currentPage: null, totalPages: null,
      rowsExpected: null, rowsCaptured: 0, truncated: null,
    };
  }
  // **2026-09-13 第六轮用 canva.com 的 paid 子 tab 实测确认：KD 和"排位/排位
  // 变动"是 total/organic 子 tab 才有的列，paid 子 tab 的表头结构性地没有
  // 这两样**（付费广告没有"自然排名"这个概念，KD/排位对它不适用）——不是
  // 解析失败，是这个 tab 本来就没有。旧代码把 KD 放进 `wanted`（缺了就报
  // missingColumns）、把"排位变动"缺失无条件当成"没解析出来"，于是每次跑
  // paid 子 tab 都会在 missingColumns 里报出两个根本不该算"缺"的列名——
  // 跟第四轮 AdSense 条件列是同一类问题：**表头本来就没有的列不该走
  // "缺了=解析失败"这条路径**。KD 单独按下标查（找不到就是 undefined，字段
  // 值 null，不计入 missingColumns）；"排位变动"只有在表头里**确实出现了
  // 两个"变动"列**（说明这个 tab 本来就该有排位变动，只是没能正确定位到
  // 是哪一个）时才算缺——只有一个"变动"列（paid 子 tab 的真实形态）时，
  // 压根没有"第二个变动"这回事，不能报"缺"。
  const wanted = {
    keyword: '关键词',
    intent: '意图',
    size: '规模',
    avgVolume: '平均体量',
    cpc: 'CPC',
    zeroClickPercent: '零点击',
    topUrl: '热门网址',
    urlCount: '#URL',
  };
  const { index, missingColumns: baseMissing } = buildColumnIndex(cells.headers, wanted);
  const normalized = (cells.headers || []).map(normalizeHeader);
  const clicksIdx = normalized.indexOf('点击量');
  const kdIdx = normalized.indexOf('KD');
  const changeIndices = normalized.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);

  // 按左邻列消歧，不按位置。见函数顶部注释：这不是「第一个/最后一个」，
  // 是「谁的左边是点击量、谁的左边是 #URL」，与两列在表里的先后顺序无关。
  let clicksChangeIdx = -1;
  let rankChangeIdx = -1;
  const unresolvedChangeIndices = [];
  for (const i of changeIndices) {
    const leftNeighbor = normalized[i - 1];
    if (leftNeighbor === '点击量' && clicksChangeIdx < 0) clicksChangeIdx = i;
    // 主锚点「排位」，备用锚点「#URL」——见上方注释里那次自证循环。
    else if ((leftNeighbor === '排位' || leftNeighbor === '#URL') && rankChangeIdx < 0) rankChangeIdx = i;
    else unresolvedChangeIndices.push(i);
  }

  const missingColumns = [...baseMissing];
  if (clicksIdx < 0) missingColumns.push('点击量');
  // 分开报「点击量后面那个变动」和「#URL 后面那个变动」——不再用一个笼统的
  // 「变动」，因为这张表里「变动」这个名字本来就不唯一，笼统报告诉不了任何人
  // 到底是哪一个丢了。
  if (clicksChangeIdx < 0) missingColumns.push('点击量变动');
  // 只有表头里确实出现过「排位」这一列时，"排位变动"没被定位到才算缺——
  // 「排位」本身都不在表头里（paid 子 tab 的真实形态：没有自然排名这个概念）
  // 说明这个 tab 本来就没有排位变动，不是缺。用「排位」在不在，而不是
  // 「变动」出现了几次——后者会被"表头里的变动列被意外砍掉但排位还在"这种
  // 真实的抽取残缺情形骗到（旧夹具"kwRowsNoTrailingChange"就是这个场景：
  // 排位列还在，配对的变动被剥离，这时候必须报缺，不能因为只剩 1 个"变动"
  // 就放过）。
  if (rankChangeIdx < 0 && normalized.includes('排位')) missingColumns.push('排位变动');

  const cellAt = (row, i) => (typeof i === 'number' && i >= 0 && i < row.length ? row[i] : undefined);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);

  const { rows: rawRows, dirHints: rawDirHints } = nonEmptyRowsWithHints(cells.rows, cells.dirHints);

  let clicksChangeRealCount = 0;
  let clicksChangeMagnitudeLost = 0;
  let clicksChangeDirectionUnknown = 0;
  const clicksChangeMagnitudeLostSamples = [];
  let rankChangeRealCount = 0;
  let rankChangeMagnitudeLost = 0;
  let rankChangeDirectionUnknown = 0;
  const rankChangeMagnitudeLostSamples = [];

  const rows = rawRows.map((row, i) => {
    const clicksShare = parseClicksShare(cellAt(row, clicksIdx));

    const clicksChangeText = String(cellAt(row, clicksChangeIdx) ?? '').trim();
    const clicksChangeHint = clicksChangeIdx >= 0 ? (rawDirHints[i]?.[clicksChangeIdx] ?? null) : null;
    const clicksChange = parseSignedPercentCell(cellAt(row, clicksChangeIdx), clicksChangeHint);
    // "NEW"/"LOST"（新词没有上一期数据可比 / 词丢失了排名数据，2026-09-13 第
    // 二轮实跑 howolddoyoulook.com 两个都实测到了）不算丢数据——它们是合法的
    // 第三态，不是占位符也不是解析失败，不能被 partialLossColumns/
    // suspectColumns 当成"这一格解析不出来"报出去。查文本本身而不是只查
    // hint.special——实跑证明了 hint 不一定打得上标签，文本判断更不会漏。
    if (clicksChangeIdx >= 0 && clicksChangeText && !isPlaceholder(clicksChangeText) && !NON_COMPARABLE_CHANGE.test(clicksChangeText)) {
      clicksChangeRealCount += 1;
      if (clicksChange.directionUnknown) clicksChangeDirectionUnknown += 1;
      else if (clicksChange.value === null) {
        clicksChangeMagnitudeLost += 1;
        if (clicksChangeMagnitudeLostSamples.length < 3) clicksChangeMagnitudeLostSamples.push(clicksChangeText);
      }
    }

    const rankChangeText = String(cellAt(row, rankChangeIdx) ?? '').trim();
    const rankChangeHint = rankChangeIdx >= 0 ? (rawDirHints[i]?.[rankChangeIdx] ?? null) : null;
    const rankChange = parseSignedPercentCell(cellAt(row, rankChangeIdx), rankChangeHint);
    // 同上——"NEW"/"LOST" 不算丢数据，即便这一列实测暂时只见过占位符也保持
    // 一致处理，免得下次实测到这一列也出现这两个值时又漏一次。
    if (rankChangeIdx >= 0 && rankChangeText && !isPlaceholder(rankChangeText) && !NON_COMPARABLE_CHANGE.test(rankChangeText)) {
      rankChangeRealCount += 1;
      if (rankChange.directionUnknown) rankChangeDirectionUnknown += 1;
      else if (rankChange.value === null) {
        rankChangeMagnitudeLost += 1;
        if (rankChangeMagnitudeLostSamples.length < 3) rankChangeMagnitudeLostSamples.push(rankChangeText);
      }
    }

    return {
      keyword: swText(cell(row, 'keyword')),
      clicks: clicksShare.clicks,
      clicksSharePercent: clicksShare.sharePercent,
      clicksChangePercent: clicksChangeIdx >= 0 ? clicksChange.value : null,
      // 有原文、能解析出数值，但方向既没有文本符号也没能从 DOM hint 认出来——
      // 绝不能悄悄丢掉这行的存在，必须让调用方看见（审计发现的核心 bug 就是
      // 这个字段过去恒为正数）。
      clicksChangePercentDirectionUnknown: clicksChangeIdx >= 0 ? clicksChange.directionUnknown : false,
      kd: swCell(cellAt(row, kdIdx)),
      intent: swText(cell(row, 'intent'))?.split(/\s+/).filter(Boolean) || [],
      size: swCell(cell(row, 'size')),
      avgVolume: swCell(cell(row, 'avgVolume')),
      cpc: swCell(cell(row, 'cpc'), { currency: true }),
      zeroClickPercent: swCell(cell(row, 'zeroClickPercent'), { percent: true }),
      rankChangePercent: rankChangeIdx >= 0 ? rankChange.value : null,
      rankChangePercentDirectionUnknown: rankChangeIdx >= 0 ? rankChange.directionUnknown : false,
      topUrl: swText(cell(row, 'topUrl')),
      urlCount: swCell(cell(row, 'urlCount')),
    };
  });

  const { suspectColumns, partialLossColumns } = auditColumns(index, wanted, rawRows, rows);
  // 找到了「变动」列，但左边既不是「点击量」也不是「#URL」——消歧失败，没法
  // 安全地分给任何一个字段，报出来让人去看，而不是猜一个安上去。
  if (unresolvedChangeIndices.length) suspectColumns.push('变动(左邻列无法识别)');

  // `点击量`、点击量涨跌、#URL 涨跌都不在 `wanted` 里（它们要么是特判解析、
  // 要么按左邻列消歧），auditColumns 覆盖不到，这里单独查一遍——
  // 2026-08-27 那次真实事故就是「点击量」按名字找到了、却整列解析成 null，
  // 这正是这个信号该抓住的案例。用比例而不是「全部」，理由见 auditColumns
  // 顶部注释：同样的道理在这两列特判逻辑上也成立。
  // 和 auditColumns 同样的两档，只是这几列走特判解析、不在 `wanted` 里，
  // 所以得单独统计一遍。**同一个「非占位符却解析成 null 就是丢数据」的判断**，
  // 不要因为这里是特判路径就退回到只看过半。
  const auditSpecial = (label, colIdx, isRowNull) => {
    if (colIdx < 0 || !rawRows.length) return;
    let realCount = 0;
    const lost = [];
    rawRows.forEach((row, ri) => {
      const v = String(cellAt(row, colIdx) ?? '').trim();
      if (!v || isPlaceholder(v)) return;
      realCount += 1;
      if (isRowNull(ri)) lost.push(v);
    });
    if (realCount === 0 || lost.length === 0) return;
    if (lost.length / realCount > 0.5) suspectColumns.push(label);
    else partialLossColumns.push({
      column: label, lost: lost.length, of: realCount, samples: [...new Set(lost)].slice(0, 3),
    });
  };
  auditSpecial('点击量', clicksIdx, (ri) => rows[ri].clicks === null && rows[ri].clicksSharePercent === null);
  // KD 不在 `wanted` 里（见上面的大段注释：paid 子 tab 表头本来就没有这一列，
  // 不能用"缺了=解析失败"那条通用路径），但列存在的时候，单元格本身解析
  // 失败仍然是真实的丢数据，得用 auditSpecial 单独查一遍——不能因为挪出了
  // `wanted` 就连这条本该有的审计也一起丢了。
  auditSpecial('KD', kdIdx, (ri) => rows[ri].kd === null);
  // 点击量变动/排位变动不再走 auditSpecial 的单一 null 判据——现在 null 有两种
  // 不同性质（格式解析不出来 vs 方向读不出来），分开统计见上面 rows.map 那一段；
  // 这里只把统计结果落进 suspectColumns/partialLossColumns/directionUnknownColumns，
  // 独立检查报告确认过的「#URL 涨跌列 100% 是占位符」结论不受影响——两边都要求
  // realCount > 0 才报，全占位符时 realCount 是 0，自然不会被当成可疑。
  if (clicksChangeIdx >= 0 && clicksChangeRealCount > 0 && clicksChangeMagnitudeLost > 0) {
    if (clicksChangeMagnitudeLost / clicksChangeRealCount > 0.5) suspectColumns.push('点击量变动');
    else {
      partialLossColumns.push({
        column: '点击量变动', lost: clicksChangeMagnitudeLost, of: clicksChangeRealCount,
        samples: [...new Set(clicksChangeMagnitudeLostSamples)],
      });
    }
  }
  if (rankChangeIdx >= 0 && rankChangeRealCount > 0 && rankChangeMagnitudeLost > 0) {
    if (rankChangeMagnitudeLost / rankChangeRealCount > 0.5) suspectColumns.push('排位变动');
    else {
      partialLossColumns.push({
        column: '排位变动', lost: rankChangeMagnitudeLost, of: rankChangeRealCount,
        samples: [...new Set(rankChangeMagnitudeLostSamples)],
      });
    }
  }
  const directionUnknownColumns = [];
  if (clicksChangeIdx >= 0 && clicksChangeDirectionUnknown > 0) {
    directionUnknownColumns.push({ column: '点击量变动', count: clicksChangeDirectionUnknown, of: clicksChangeRealCount });
  }
  if (rankChangeIdx >= 0 && rankChangeDirectionUnknown > 0) {
    directionUnknownColumns.push({ column: '排位变动', count: rankChangeDirectionUnknown, of: rankChangeRealCount });
  }

  // Antd simple 分页器的 title 是「1/389777」（当前页/总页数），不是
  // `.ant-pagination-total-text`——那个 class 只有用了 Antd 的 showTotal 才会
  // 渲染，这张页面没用，选择器永远查不到，是一条死代码路径，不是「有时候没有」。
  const pager = parsePagerTitle(cells?.pagination?.pagerTitle);
  const pageReportedKeywordTotal = headerTotal(cells.headers, '关键词');
  // 独立交叉验证（只留在注释里，不做成运行时断言，避免误报把好数据拦下来）：
  // pageReportedKeywordTotal / 100（每页行数）应该约等于 pager.totalPages——
  // 38977695 / 100 ≈ 389777，跟实测的分页器总页数完全对上。这两个数字来自
  // 页面上两个完全不同的地方，同时对得上就是互相印证；哪天对不上了，
  // 说明其中一个解析器（表头总数解析或分页器解析）出问题了。
  const morePagesAvailable = cells?.pagination ? Boolean(cells.pagination.hasNext) : null;
  return {
    rows,
    missingColumns,
    suspectColumns,
    // 之前这里漏掉了 partialLossColumns——auditSpecial 和上面的专项统计都会往
    // 这个数组里 push，但旧版返回对象没有把它带出去，调用方（similarweb-query.mjs
    // 的 [partial-loss] 提示）拿到的永远是 `undefined ?? []`，一次都没响过。
    partialLossColumns,
    directionUnknownColumns,
    top5SharePercent: deriveTop5SharePercent(rows),
    // 全站收录关键词总数，不是这张表的行数——见函数顶部注释，不要拿它和 rowsRead 比。
    pageReportedKeywordTotal,
    rowsRead: rows.length,
    // 这张表是否还有没读到的下一页；提取器没找到分页控件时是 null，
    // 代表「不知道」，不能当成「肯定没有下一页」。
    morePagesAvailable,
    // 当前页 / 总页数，来自分页器的 title 属性；分页器不存在或 title 格式不对
    // （比如页面根本不是 simple 分页模式）时两个都是 null，不瞎猜一个数字出来。
    currentPage: pager.currentPage,
    totalPages: pager.totalPages,
    // 分页表没有一个「这一读应该有多少行」的总数概念（每页最多 ~100 行，是
    // 页面设计决定的，不是这次抓取该不该更多）——所以 rowsExpected 恒为 null，
    // 「读没读全」交给 morePagesAvailable/currentPage/totalPages 判断，
    // 这里的 truncated 只是把 morePagesAvailable 用审计报告要求的字段名重复一遍。
    rowsExpected: null,
    rowsCaptured: rows.length,
    truncated: morePagesAvailable,
  };
}

/** 5 个统计卡的标签——中文原文来自 2026-09-13 实测，部分带全角句号（"长尾机会。"），
 * 匹配前统一去掉。 */
const STAT_CARD_LABELS = {
  cannibalization: 'Cannibalization',
  longTailOpportunity: '长尾机会',
  serpOpportunity: 'SERP 充满机会',
  highTrafficOpportunity: '高流量机会',
  lowPotentialKeywords: '低潜力关键词',
};

/**
 * 「网站关键词」页顶部 5 个统计卡——见 SW_SITE_KEYWORD_STAT_CARDS 的注释。
 * `loading` 字段是这张页面自己的 `data-automation-button-loading` 属性，
 * 是本次审计里少数几个**逐区块可信**的完成信号之一：卡片存在、loading==="false"
 * 才算这张卡片真的确认到位；找不到卡片、或者属性读不到值，都不能当成"已就绪"。
 */
export function deriveSiteKeywordStatCards(data) {
  if (!data?.cards?.length) {
    return {
      cards: {}, missingCards: Object.values(STAT_CARD_LABELS),
      loadingUnverified: true, anyCardLoading: null,
    };
  }
  const normalizeLabel = (s) => String(s ?? '').replace(/[。.]\s*$/, '').trim();
  const byLabel = new Map(data.cards.map((c) => [normalizeLabel(c.label), c]));
  const cards = {};
  const missingCards = [];
  let anyLoading = false;
  let allLoadingKnown = true;
  for (const [key, label] of Object.entries(STAT_CARD_LABELS)) {
    const raw = byLabel.get(label);
    if (!raw) { missingCards.push(label); continue; }
    const loading = raw.loading === 'true' ? true : raw.loading === 'false' ? false : null;
    if (loading === null) allLoadingKnown = false;
    if (loading === true) anyLoading = true;
    cards[key] = { label, count: swCell(raw.value), unit: swText(raw.unit), loading };
  }
  return {
    cards,
    missingCards,
    // 卡片本身没找到、或者找到了但 loading 属性读不到值，"5 张卡是否都已就绪"
    // 这件事就没法确认——不能默认当"都好了"。
    loadingUnverified: missingCards.length > 0 || !allLoadingKnown,
    anyCardLoading: anyLoading,
  };
}

export function deriveKeywordRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return { rows: [], missingColumns: ['<no DOM columns>'] };
  }
  const wanted = {
    keyword: '关键词', volume28d: '28 天的体量', avgVolume: '平均体量',
    zeroClickPercent: '零点击搜索', kd: 'KD', intent: '意图', cpc: 'CPC',
  };
  const index = Object.fromEntries(Object.entries(wanted).map(([key, label]) => [key, cells.headers.indexOf(label)]));
  const missingColumns = Object.entries(index).filter(([, i]) => i < 0).map(([key]) => wanted[key]);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : null);

  const rows = cells.rows.map((row) => ({
    keyword: String(cell(row, 'keyword') ?? '').trim(),
    volume28d: swCell(cell(row, 'volume28d')),
    avgVolume: swCell(cell(row, 'avgVolume')),
    zeroClickPercent: swCell(cell(row, 'zeroClickPercent'), { percent: true }),
    kd: swCell(cell(row, 'kd')),
    // 一个词可以同时带多个意图，页面用换行分隔。
    intent: String(cell(row, 'intent') ?? '').split(/\s+/).filter(Boolean),
    cpc: swCell(cell(row, 'cpc'), { currency: true }),
  })).filter((row) => row.keyword);

  return { rows, missingColumns };
}
