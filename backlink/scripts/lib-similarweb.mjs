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
  const match = normalized.match(/^([\d.]+)\s*([KMB万亿])?$/i);
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
 * `swCell`/`swText`/`parseSignedPercent`/`parseDuration`/`auditColumns`
 * 全部认它，不许各写各的。
 */
const NO_VALUE = /^(?:[-—–]|N\/A|n\/a|--|不可用)$/i;

/** 判断一段文本是不是「明写的没有这一项」。所有占位符判断都走这一个函数，
 * 不要在别处再写一条正则——这正是本文件曾经出过的那类问题。 */
function isPlaceholder(value) {
  return NO_VALUE.test(String(value ?? '').trim());
}

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

function findWindowLabel(lines) {
  return lines.find((l) => WINDOW_LINE.test(l)) ?? null;
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

/** 「-」「—」「N/A」「+」「↑」「↓」混在一起的涨跌值，例如「↑25%」「+6」「-1.23%」「-」。
 * 箭头/符号只决定正负，数值本身仍然只交给 parseNumber 处理——不写第二个数字解析器。
 * 单独一个「-」是占位符，必须先按 NO_VALUE 判掉，不能被当成负号吃掉。 */
function parseSignedPercent(value) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return null;
  const isDown = /↓/.test(text) || /^-/.test(text);
  const magnitudeText = text.replace(/[↑↓]/g, '').replace(/^[+-]/, '').replace(/%$/, '').trim();
  const magnitude = parseNumber(magnitudeText);
  if (magnitude === null) return null;
  return isDown ? -magnitude : magnitude;
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
  const columns = dataCols.map((c) => [...c.children].map((x) => (x.innerText || '').trim()));
  const lengths = columns.map((c) => c.length);
  const depth = Math.min(...lengths);
  // 「结构本身保证对齐」只保证第 j 个格子属于第 j 行，不保证每一列长度一样。
  // 之前这里直接拿最短列的长度截断所有列——如果某一列在 DOM 里少渲染了几个
  // 格子（不管什么原因），所有列都会被这一列拖着从底部截断，且没有任何信号：
  // 表面上看是「一张读到 20 行的完整表」，实际是「121 行被砍到 20 行」。
  // 这里把「列长度是否一致」暴露出来，交给 deriveGeoRows 决定要不要报警。
  const columnDepthMismatch = lengths.length > 0 && Math.max(...lengths) !== Math.min(...lengths);
  const rows = [];
  for (let i = 0; i < depth; i++) rows.push(columns.map((c) => c[i]));
  return { headers, rows, columnDepthMismatch };
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
  const rows = bodyRows.map((r) => [...r.querySelectorAll('td.ant-table-cell')].map((c) => (c.innerText || '').trim()));
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
  return { headers, rows, pagination };
})()`;

/** 丢掉列切分深度不一致导致的尾部空行——**不能按某个具体字段是否为空来判断**，
 * 否则「改名/丢列导致该字段变 null」和「这本来就是占位空行」会被混为一谈。 */
function nonEmptyRows(rows) {
  return (rows || []).filter((row) => Array.isArray(row) && row.some((v) => String(v ?? '').trim() !== ''));
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

export function deriveGeoRows(cells) {
  if (!cells?.headers?.length || !Array.isArray(cells.rows)) {
    return {
      rows: [], missingColumns: ['<no DOM columns>'], suspectColumns: [], partialLossColumns: [],
      totalRowsOnPage: null, rowsRead: 0, columnDepthMismatch: null,
    };
  }
  const wanted = {
    country: '国家/地区',
    trafficSharePercent: '流量份额',
    changePercent: '变动',
    audienceSharePercent: '受众群体份额',
    countryRank: '国家/地区排名',
    visitDuration: '访问持续时间',
    pagesPerVisit: '页面数/访问',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);

  const rawRows = nonEmptyRows(cells.rows);
  const rows = rawRows.map((row, i) => {
    const duration = parseDuration(cell(row, 'visitDuration'));
    return {
      rank: i + 1,
      country: swText(cell(row, 'country')),
      trafficSharePercent: swCell(cell(row, 'trafficSharePercent'), { percent: true }),
      changePercent: parseSignedPercent(cell(row, 'changePercent')),
      audienceSharePercent: swCell(cell(row, 'audienceSharePercent'), { percent: true }),
      countryRank: parseRank(cell(row, 'countryRank')),
      visitDuration: duration.raw,
      visitDurationSeconds: duration.seconds,
      pagesPerVisit: swCell(cell(row, 'pagesPerVisit')),
    };
  });

  return {
    rows,
    missingColumns,
    ...auditColumns(index, wanted, rawRows, rows),
    // 自洽校验：各国流量份额加起来应该 ≈ 100%。这是**不需要第二个数据源**就能
    // 做的交叉验证——页面自己声明了一个总量，各行是它的拆分。丢行、丢值、
    // 单位解析错，都会让这个和偏离。`< 0.01%` 那次事故里 121 国丢了 9 个，
    // 列检测因为只丢 7.4% 而沉默，但这个和会掉下来。
    trafficShareSum: sumShare(rows, 'trafficSharePercent'),
    totalRowsOnPage: headerTotal(cells.headers, '国家/地区'),
    rowsRead: rows.length,
    // 提取器发现列长度不一致时置 true——说明最短的那一列把所有列都从底部
    // 截断了，`rowsRead` 可能比真实行数少，而且具体哪些国家被砍掉不确定。
    // 提取器给不出这个信息（比如 cells 是旧格式）时是 null，不是「确认没有」。
    columnDepthMismatch: cells.columnDepthMismatch === undefined ? null : Boolean(cells.columnDepthMismatch),
  };
}

/** 「<点击量>」「<份额%>」两截，例如实测的 `"9.9M\n0.32%"`（换行分隔）。
 * **不是斜杠 `"9.9M/0.32%"`**——那个写法来自某份 discovery 摘要的渲染方式，
 * 不是真实 DOM 里的格子内容，2026-08-27 实测：只认斜杠会让这一列在真实页面上
 * 整表解析成 null，而 missingColumns 还是空的（列名本身找对了）。斜杠仍然接受，
 * 万一某个变体页面真是这么渲染的。份额单独拆出来是因为 top5SharePercent
 * 就是拿它累加的——调用方不该自己再拆一遍这个格式。 */
function parseClicksShare(value) {
  const text = String(value ?? '').trim();
  if (!text || isPlaceholder(text)) return { clicks: null, sharePercent: null };
  const unified = text.replace(/\s*\n\s*/g, '/');
  const match = unified.match(/^(.+?)\/([\d.]+)\s*%$/);
  if (!match) return { clicks: swCell(text), sharePercent: null };
  return { clicks: parseNumber(match[1].trim()), sharePercent: Number(match[2]) };
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
      rows: [], missingColumns: ['<no DOM rows>'], suspectColumns: [], partialLossColumns: [], top5SharePercent: null,
      pageReportedKeywordTotal: null, rowsRead: 0, morePagesAvailable: null, currentPage: null, totalPages: null,
    };
  }
  const wanted = {
    keyword: '关键词',
    kd: 'KD',
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
  if (rankChangeIdx < 0) missingColumns.push('排位变动');

  const cellAt = (row, i) => (typeof i === 'number' && i >= 0 && i < row.length ? row[i] : undefined);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : undefined);

  const rawRows = nonEmptyRows(cells.rows);
  const rows = rawRows.map((row) => {
    const clicksShare = parseClicksShare(cellAt(row, clicksIdx));
    return {
      keyword: swText(cell(row, 'keyword')),
      clicks: clicksShare.clicks,
      clicksSharePercent: clicksShare.sharePercent,
      clicksChangePercent: clicksChangeIdx >= 0 ? parseSignedPercent(cellAt(row, clicksChangeIdx)) : null,
      kd: swCell(cell(row, 'kd')),
      intent: swText(cell(row, 'intent'))?.split(/\s+/).filter(Boolean) || [],
      size: swCell(cell(row, 'size')),
      avgVolume: swCell(cell(row, 'avgVolume')),
      cpc: swCell(cell(row, 'cpc'), { currency: true }),
      zeroClickPercent: swCell(cell(row, 'zeroClickPercent'), { percent: true }),
      rankChangePercent: rankChangeIdx >= 0 ? parseSignedPercent(cellAt(row, rankChangeIdx)) : null,
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
  auditSpecial('点击量变动', clicksChangeIdx, (ri) => rows[ri].clicksChangePercent === null);
  // 独立检查报告确认过：这个目标站点的 #URL 涨跌列 100% 是占位符，这是真实
  // 数据（这个站点这段时间排位确实没变），不是解析漏了——ratioSuspect 的分母
  // 只数「有真实内容、不是占位符」的格子，全是占位符时 realCount 是 0，
  // 自然不会被当成可疑，不需要专门为这种情况开后门。
  auditSpecial('排位变动', rankChangeIdx, (ri) => rows[ri].rankChangePercent === null);

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
  return {
    rows,
    missingColumns,
    suspectColumns,
    top5SharePercent: deriveTop5SharePercent(rows),
    // 全站收录关键词总数，不是这张表的行数——见函数顶部注释，不要拿它和 rowsRead 比。
    pageReportedKeywordTotal,
    rowsRead: rows.length,
    // 这张表是否还有没读到的下一页；提取器没找到分页控件时是 null，
    // 代表「不知道」，不能当成「肯定没有下一页」。
    morePagesAvailable: cells?.pagination ? Boolean(cells.pagination.hasNext) : null,
    // 当前页 / 总页数，来自分页器的 title 属性；分页器不存在或 title 格式不对
    // （比如页面根本不是 simple 分页模式）时两个都是 null，不瞎猜一个数字出来。
    currentPage: pager.currentPage,
    totalPages: pager.totalPages,
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
