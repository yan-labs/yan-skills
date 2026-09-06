#!/usr/bin/env node
/**
 * semrush-report.mjs — 读 Semrush 里**没有导出按钮**的那几张报告。
 *
 * 为什么在 semrush-overview.mjs 之外还要这一个：overview 只覆盖「域名概览」一张页。
 * 竞品勘测真正要的是另外四张——自然排名、主要页面、反链概览、关键词概览——
 * 它们同样没有表格导出，只能读页面。2026-08-21 那轮勘测因为缺这个脚本，
 * 在 scratchpad 里现写了个一次性的 `sem.mjs` 加三个 shell 循环，用完就扔了。
 * **本脚本就是把那次的行为沉淀下来**，别再写第二个。
 *
 * 与 semrush-overview.mjs 的关系：那个是本脚本 `--report domain-overview` 的
 * 特化版，输出字段更规整。域名那六个数字用它，其余四张用这个。
 *
 * **`--db` 决定的是一个国家库，四张域名报表都没有全球选项。** 省略 `--db` 不会
 * 给你全球合计，只会落到 Semrush 自己的默认库；同一个域名换个 `--db` 会读出
 * 完全不同的自然流量、排名词和主要页面。
 *
 * 用法：
 *   node semrush-report.mjs --report organic-overview  --domain example.com --db us
 *   node semrush-report.mjs --report organic-positions --domain example.com --db us
 *   node semrush-report.mjs --report organic-pages     --domain example.com --db us
 *   node semrush-report.mjs --report backlinks-overview --domain example.com
 *   node semrush-report.mjs --self-test
 *
 * 可选：--scroll-segments[=N] 分段滚动（默认**关闭**，理由见主流程里 scrollSegments
 *       的注释）、--scroll-pause 每段等待秒数（默认 1.5）。
 *
 * 已验证 2026-08-26：organic-pages 从 URL 后方读取当前行；旧版向前读，首行会吞表头，
 * 后续每个 URL 都会拿到上一页的字段，行数看似正确但内容整体错位。
 *
 * **关键词维度不在这里**：`semrush-keyword.mjs` 已经覆盖关键词概览，且它的取值函数
 * 比本文件早一步处理了「不可用」短路。2026-08-21 我在这里重复实现了一遍 keyword 报告，
 * 属于本 Skill 明令禁止的「写第二个」——已删除，词维度一律走 semrush-keyword.mjs。
 *
 * 一次装一堆（**这是省配额的关键**，见下面「会话复用」）：
 *   S=semrush-recon-$$
 *   node semrush-report.mjs --session $S --report backlinks-overview --domain a.com
 *   node semrush-report.mjs --session $S --report backlinks-overview --domain b.com
 *   ...
 *   opencli browser $S close
 *
 * 2026-08-30 双证人化：所有失败路径（never rendered / never settled / 任何异常）
 * 在退出前 captureScene（穿透 census + 截图）落进 --evidence-dir（默认
 * `<out>.evidence/` 或 `.backlink/evidence/semrush-report/…`）；
 * `status:'unavailable'` 的输出带 evidence 字段（现场路径）。截图链路已实盘验证。
 */
import { resolveSession, opencli, firstJson, parseFlags, showHelpIfRequested, printJson, validateSession } from './opencli-core.mjs';
import { captureStable, expiryWarning, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { DEEP_DOM_JS, scrollThroughSegments } from './lib-deep-dom.mjs';
import { captureScene, defaultSceneDir, sceneSummaryLine } from './lib-evidence-scene.mjs';
import { writeFile } from 'node:fs/promises';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const session = resolveSession(flags, 'semrush-report', 'semrush');
const APP_ORIGIN = (process.env.TOOLS_SHARE_APP_ORIGIN_SEMRUSH || 'https://sem.3ue.co').replace(/\/+$/, '');
const APP_HOST = new URL(APP_ORIGIN).host;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** 同一个关键词可以合法地出现在多个落地页上，去重键必须带 URL 与排名，
 *  只用关键词会把 100 行压成 67 行——实测踩过。 */
const rowKey = (r) => `${r.keyword}||${r.url || ''}||${r.position ?? ''}`;
const escapeRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 每张报告的路由、就绪判据、以及解析方式。
 *
 * `ready` 必须认**只有数据渲染完才会出现**的字样。认页面标题或左侧菜单会在
 * 骨架阶段就通过，拿到一个空壳——similarweb-query.mjs 已经为这个坑付过一次学费。
 */
/**
 * 通用 ARIA grid 单元格提取器——`[role=columnheader]` 给表头，`[role=row]` 给数据行，
 * 按「格子数等于表头数」过滤掉不完整的行。关键词魔法工具和引荐域名报告用的是同一种
 * DOM 结构，2026-08-28 之前这份提取器叫 `KEYWORD_MAGIC_CELLS`，名字绑死在第一个用它
 * 的报告上，其实和关键词魔法工具本身没有任何耦合——沿用旧名字只会误导下一个读者以为
 * 这是专属提取器。改名 `ARIA_GRID_CELLS`，旧名字留一个别名，省得漏改某处引用。
 *
 * 这张表**不能按 innerText 行数切**。意图列可以是 0 个、1 个或多个字母，趋势列是
 * sparkline 完全不进 innerText，指标可以整格是「不可用」——实测同一页里第 1 行有 8 个
 * 尾值、第 3 行只有 7 个。按位置切列会算出一组读起来完全正常的错数字，正是本仓库
 * 最不能接受的失败形态。所以走 DOM，并且**按列名取值而不是按下标**：列顺序变了会
 * 得到 null 并记进 missingColumns，不会静默错位。
 *
 * 顺带一个好处：DOM 给的是 `27,100`，innerText 给的是 `27.1K`。
 */
/**
 * ⚠️ **2026-08-29：这份提取器现在穿透 shadow DOM。** 在这之前它用的是
 * `document.querySelectorAll`，而 Semrush 把外壳与报表挂件渲染在 44 个 shadow root
 * 里——`querySelectorAll` 到 shadow 边界就停了，于是它量到的是页面的一小块。
 * 行数看起来正常（因为没有表头就返回 null），但一整族「这条路由没有表格」的结论
 * 就是这么来的。走 <ref file="scripts/lib-deep-dom.mjs"/> 的共用遍历，不要在这里
 * 再写一份。
 */
const ARIA_GRID_CELLS = `(() => {
  ${DEEP_DOM_JS}
  const root = document.body || document.documentElement;
  const headers = deepQueryAll(root, '[role=columnheader]').map((e) => (e.innerText || '').trim());
  if (!headers.length) return null;
  const rows = deepQueryAll(root, '[role=row]')
    .map((r) => deepQueryAll(r, '[role=gridcell],[role=cell]').map((c) => (c.innerText || '').trim()))
    .filter((cells) => cells.length === headers.length);
  return { headers, rows };
})()`;
/** 旧名字，保持向后兼容——不要删，可能还有外部脚本/笔记引用它。 */
const KEYWORD_MAGIC_CELLS = ARIA_GRID_CELLS;

const REPORTS = {
  'organic-overview': {
    needs: 'domain',
    path: (t, db) => `/analytics/organic/overview/?searchType=domain&q=${encodeURIComponent(t)}${db ? `&db=${db}` : ''}`,
    // ⚠️ 第三次踩「认标签导致抓到空壳」这个坑（2026-08-21）。
    // 初版写的是 /流量成本|Traffic Cost/ —— 那是指标块的标签，SPA 骨架阶段就已经在了，
    // 而此时页面顶部的主体名还是空的、所有数值都没渲染。结果六个域名连跑六次，
    // organicTraffic / organicKeywords / trafficCost 全返回 null 且不报错，
    // 读起来像「这些站没有自然流量」，实际是「一个字都还没渲染出来」——错得正好相反。
    // 判据改为：主体名必须出现在页面上，且「流量成本」后面真的跟着一个数值。
    ready: (t, target) => new RegExp(escapeRe(target)).test(t)
      && /(?:流量成本|Traffic Cost)\s*\n\s*(?:US\$|[$¥€£]|[\d.,])/.test(t),
    parse: parseOrganicOverview,
  },
  'organic-positions': {
    needs: 'domain',
    path: (t, db) => `/analytics/organic/positions/?searchType=domain&q=${encodeURIComponent(t)}${db ? `&db=${db}` : ''}` +
      `&sortField=Po&sortDirection=ascending`,
    // ⚠️ 就绪判据必须认**数据行**，不能认表头。
    // 初版写的是 /上次更改/ —— 那是 URL 列右边的表头文字，表体还没渲染就已经在了，
    // 结果每次都在空表上解析，稳定返回 0 行且不报错。这与 similarweb-query.mjs
    // 记过的「认左侧菜单项导致抓到空壳」是同一个坑，第二次踩了。
    ready: (t, target) => new RegExp(`${escapeRe(target)}/`).test(t) || /未找到结果|No results|没有数据/.test(t),
    parse: parsePositions,
    paginated: true,
  },
  'organic-pages': {
    needs: 'domain',
    path: (t, db) => `/analytics/organic/pages/?searchType=domain&q=${encodeURIComponent(t)}${db ? `&db=${db}` : ''}`,
    ready: (t, target) => new RegExp(`${escapeRe(target)}/`).test(t) || /未找到结果|No results|没有数据/.test(t),
    parse: parsePages,
    paginated: true,
  },
  'backlinks-list': {
    needs: 'domain',
    // 反链明细。**这是回答「我们的链都是什么性质」的唯一报告**——概览只给总数，
    // 看不出 follow/nofollow、锚文本、来源页类型。
    path: (t) => `/analytics/backlinks/backlinks/?q=${encodeURIComponent(t)}&searchType=domain`,
    // ⚠️ 第三次踩同一个坑，写死在这里：**「锚链接」是标签页名，「nofollow」是筛选器 chip，
    // 两者在表体渲染之前就已经在页面上**。认它们等于在空表上解析，稳定返回 0 行且不报错。
    // 就绪判据只能认**数据行**：表体里的源页面 URL（http 开头且不是本站自己）。
    ready: (t) => /\n\s*https?:\/\/[^\n]+\n/.test(t.split('Sortable').slice(1).join('\n'))
      || /未找到|No backlinks|没有数据/.test(t),
    parse: parseBacklinksList,
  },
  /**
   * 引荐域名报告。反链 SOP 第三步（导出引荐域名列表、按命中次数排序）要的原料
   * 就是这张表——backlinks-overview 只给一个总数，backlinks-list 是明细但没有
   * 按域名去重聚合。这张表本身已经是按引荐域名分组的，一行一个域名。
   *
   * 与 keyword-magic 同一种 ARIA grid 结构（`[role=columnheader]` / `[role=row]`），
   * 直接复用它的单元格提取器，不重写一遍。
   */
  'referring-domains': {
    needs: 'domain',
    path: (t) => `/analytics/refdomains/report/?q=${encodeURIComponent(t)}&searchType=domain`,
    // ⚠️ ready 必须认数据行，不能认标签或筛选器 chip——本文件已经在这个坑跌倒三次
    // （organic-overview / organic-positions / backlinks-list 各一次，见各自注释）。
    // 这里认的是「AS 列的整数 → 域名/分类格（带点号，可能带斜杠分类）→ 带千位分隔符的
    // Backlinks 数」连续三行——这是数据行独有的形状，骨架阶段的标签/占位符凑不出它。
    ready: (t) => /\n\d+\n[^\n]*\.[a-z]{2,}\/?[^\n]*\n[\d,]+\n/i.test(t) || /未找到|No results|没有数据/.test(t),
    cells: ARIA_GRID_CELLS,
    parse: parseReferringDomains,
    paginated: true,
    // 域名格本身长得像默认 URL 启发式想抓的东西（域名单独一行，比如 `coacht.com`），
    // 基本能直接用，但两个坑：
    //   1. 「正在查询的这个域名自己」会在面包屑/筛选 chip 里反复出现，排除掉。
    //   2. Country / IP 列的 IPv4（如 `172.67.68.23`）在字符类上和域名一模一样——
    //      点分、每段字母数字——同样会被默认启发式当成一行记录。2026-08-27 live 实测：
    //      raw record lines=200、parsed rows=100，正好 2 倍，就是这一条造成的假警报。
    //      全数字分段的必须排除。
    recordLine: (line) => {
      if (line === target) return false;
      const host = line.split('/')[0];
      if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host)) return false;
      return !/^\d+(\.\d+){3}$/.test(host);
    },
    // 表头合计「引荐域名 1 - 100 (~20,032)」是跨 201 页的总量（这里~20,001 是硬上限，
    // 不是这个域名的真实引荐域名总数），不是本页量——交给 pagination 报。
    crossPageTotal: true,
  },
  /**
   * 关键词概览。**这是本脚本唯一一张以「词」为主体的报告**，其余全是域名维度。
   * 加它的原因：KD 类免费工具只给难度分，不给搜索量；而「这个词到底有没有人搜」
   * 是选题阶段唯一要紧的问题，只有这里答得了。
   *
   * 就绪判据认「关键词摘要」这个块标题 + 搜索量后面**真的跟着一个数**。
   * 只认标签会在骨架阶段通过——那正是 similarweb-query.mjs 和 organic-positions
   * 各栽过一次的坑，这里不再栽第三次。
   */
  /**
   * 关键词魔法工具——种子词批量扩词 + 侧栏聚簇。
   *
   * 与 keyword-overview 的分工：那张回答「这一个词值不值得做」，这张回答「围绕这个
   * 种子还有哪几千个词」。semrush-keyword.mjs 的头部注释早就写明了这个分工，
   * 但另一半一直没实现，选词流水线因此卡在源头。
   *
   * **配额提醒**：搜索量 / KD / CPC 这几列在本账号上回的是「不可用」，要点页面上的
   * 「刷新指标」才补齐，那一下大概率消耗配额。所以本报表只读词表和聚簇，指标缺就缺，
   * 并把 metricsPending 标出来——要指标请走 semrush-keyword.mjs 按需补，
   * 不要指望一次拿全。
   */
  'keyword-magic': {
    needs: 'keyword',
    path: (t, db) => `/analytics/keywordmagic/?q=${encodeURIComponent(t)}${db ? `&db=${db}` : ''}&type=all&mode=0`,
    // 就绪判据认**表体**：列名在骨架阶段就挂出来了，认它等于在空表上解析。
    ready: (t) => /(?:Page|页码)\s*[:：]/.test(t) || /未找到|No results|没有数据/.test(t),
    cells: ARIA_GRID_CELLS,
    parse: parseKeywordMagic,
    paginated: true,
    // 每行都有一个带零宽空格的重复关键词单元格，正好一行一条。
    // 页面标题 `\u200b\u200b关键词魔法工具\u200b\u200b` 两侧都带零宽空格，会多算一条——
    // 数据行只在**末尾**带，所以要把开头也带的排除掉。
    recordLine: (line) => line.endsWith('\u200b') && !line.startsWith('\u200b'),
    // 「所有关键词: 20.1K」是全量，不是本页量——交给 pagination 报。
    crossPageTotal: true,
  },
  'keyword-overview': {
    needs: 'keyword',
    path: (t, db) => `/analytics/keywordoverview/?q=${encodeURIComponent(t)}${db ? `&db=${db}` : ''}`,
    ready: (t) => /关键词摘要|Keyword overview/.test(t)
      && /(?:搜索量|Volume)\s*\n\s*(?:[\d.,]+\s*(?:[KMB]|万)?|n\/a|—|-)/i.test(t),
    parse: parseKeywordOverview,
  },
  'backlinks-overview': {
    needs: 'domain',
    path: (t) => `/analytics/backlinks/overview/?q=${encodeURIComponent(t)}&searchType=domain`,
    // 标签级判据。**单靠它是不够的**——「Authority Score」这行会连同占位的 0 一起先挂出来，
    // 真值晚几秒才水合（2026-08-23 实测 8 个域名错 6 个）。够用的原因是 loadReport 在
    // ready 之后还要求 `parse()` 的结果连续两次一致，占位态过不了那一关。
    // **要抄这张表的写法，就必须连 loadReport 的稳定性检查一起抄。**
    ready: /Authority Score|权威分数/,
    parse: parseBacklinks,
  },
};

const name = String(flags.report || '').trim();
const spec = REPORTS[name];
if (!spec && !flags['self-test']) {
  console.error(`--report must be one of: ${Object.keys(REPORTS).join(', ')}`);
  process.exit(2);
}
// 关键词主体绝不能过 normalizeDomain——它会把空格后的部分当路径切掉，
// 于是 "car wrap visualizer" 变成 "car"，查出来的是另一个词的数据且不报错。
const target = spec?.needs === 'keyword'
  ? String(flags.keyword || '').trim()
  : normalizeDomain(String(flags.domain || '').trim());
if (!flags['self-test'] && !target) {
  console.error(`--report ${name} requires --${spec.needs}`);
  process.exit(2);
}
const dbGiven = flags.db !== undefined && String(flags.db).trim() !== '';
const db = String(flags.db || '').trim().toLowerCase();
// 失败现场的落点（census + 截图成对）。默认贴着 --out，没有 --out 进 .backlink/。
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'semrush-report', runTag: `${target || 'na'}-${name || 'na'}`.replace(/[^a-zA-Z0-9.-]+/g, '_') });
if (!flags['self-test'] && !dbGiven && spec.needs !== 'keyword') {
  console.error(`⚠ --db not given. organic-overview/organic-positions/organic-pages fall back to Semrush's own default country — not a global total; pass --db explicitly when the market matters.`);
}

function normalizeDomain(value) {
  if (!value) return '';
  const c = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  return c.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/** 「23.8K」「1.6万」这类缩写在这些页面到处都是。中文页会用「万」。 */
function parseCompact(v) {
  const s = String(v ?? '').replace(/,/g, '').trim();
  let m = s.match(/^([\d.]+)\s*万$/);
  if (m) return Math.round(Number(m[1]) * 1e4);
  m = s.match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1;
  return Math.round(Number(m[1]) * mult);
}

const NUM = /^[\d.,]+\s*(?:[KMB]|万)?$/i;

/** 0 是合法值，不是「没数据」。别用 `Number(x) || null`。 */
const toNum = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

/**
 * 「不可用」「n/a」「—」「-」都表示这一格没有值。这个正则本来在 `magicValue` 和
 * `parseReferringDomains` 里各写了一份一模一样的（第三份是 lib-similarweb.mjs 的
 * `NO_VALUE`，那边是另一个模块，这里不跨文件复用，但至少本文件内部不再抄两遍）。
 * 一个判据，两处共用。
 */
const NO_VALUE = /^(?:不可用|n\/a|—|-|N\/A)$/i;

/**
 * 按列名（ARIA grid 的表头文字）建立「名字 -> 下标」的索引。**这是唯一允许的取值
 * 方式**——谁也不许按下标硬取。列被改名或删掉时下标是 -1，调用方据此把值填 null
 * 并记进 missingColumns，而不是让后面的列顶替上来。
 *
 * keyword-magic 和 referring-domains 两张报表各自手写过一份一模一样的
 * `at()` + `Object.fromEntries` + missingColumns 逻辑（第三份等价实现是
 * lib-similarweb.mjs 私有的 buildColumnIndex，那边未导出，这里就地收敛一次）。
 */
function buildColumnIndex(headers, wanted) {
  const at = (name) => (headers || []).indexOf(name);
  const index = Object.fromEntries(Object.entries(wanted).map(([key, label]) => [key, at(label)]));
  const missingColumns = Object.entries(index).filter(([, i]) => i < 0).map(([key]) => wanted[key]);
  return { index, missingColumns };
}

/**
 * 逐列统计「原文有内容 → 解析成 null」的行数，分两档报。
 *
 * `missingColumns` 说的是「压根没找到这一列」；这里说的是「列找到了，原始格子
 * 里明明有非占位符的真实文本，解析函数却把它喂成了 null」——多半是取值/换算
 * 逻辑写错了，而不是页面没渲染。
 *
 * **旧版要求整列全 null 才报（`allParsedNull`），那不是检测器。** 丢 120/121 行
 * 它也沉默，因为剩的那 1 行不是 null。真实事故正是部分丢失：121 个国家里 9 个的
 * 份额格式解析不了，行数对得上、列名找得到、这个检测器空——三个信号一致地
 * 说「干净」。占位符已经不进分母了，所以分母里剩下的每一个 null 都是我们看见
 * 却扔掉的数据，**没有良性的 null，也就不该有阈值**。
 *
 *   - `partialLossColumns`：任何非零丢失，丢 1 行就报，并带上原文样本。
 *   - `suspectColumns`：丢失过半，整列基本报废。
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
      if (!v || NO_VALUE.test(v)) return; // 占位符不进分母
      realCount += 1;
      const parsed = parsedRows[ri]?.[key];
      // 空数组也算丢失：`intent` 这类多值列解析失败时给的是 []，不是 null，
      // 只查 null 会漏掉它。
      const empty = parsed === null || parsed === undefined
        || (Array.isArray(parsed) && parsed.length === 0);
      if (empty) lost.push(v);
    });
    if (realCount === 0 || lost.length === 0) continue;
    if (lost.length / realCount > 0.5) suspectColumns.push(label);
    else partialLossColumns.push({
      column: label, lost: lost.length, of: realCount, samples: [...new Set(lost)].slice(0, 3),
    });
  }
  return { suspectColumns, partialLossColumns };
}

/**
 * 页面上出现的所有指标标签。`pick` 用它当**扫描边界**。
 *
 * 两个 bug 逼出来的（2026-08-21 首跑实测，两个都返回了「看着合理、其实是隔壁字段」的值）：
 *   1. 顶部导航里也有「反向链接」这个词，findIndex 命中的是导航项，
 *      它后面六行全是别的菜单项，于是返回 null——**漏报**。
 *   2. 某次「自然流量」的值没渲染出来，向后扫描一路穿过标签边界，
 *      把下一个指标「出站域名」的 4 抓走当成自然流量——**错报，且看不出来**。
 * 错报比漏报危险得多，所以宁可返回 null。
 */
const LABELS = [
  '引荐域名', '反向链接', '每月访问量', '自然流量', '付费流量', '出站域名',
  '总体有害性分数', 'Authority Score', '关键词', '流量', '流量成本',
  '搜索量', '关键词难度', '全球搜索量', 'CPC', '竞争激烈程度', '意图',   // 词维度标签保留：概览页也会出现
];

/**
 * 标签一行、数值在后面几行里，中间常插变化率（+35%）和评级词（还行/困难）。
 * 所以往后找第一个像数值的——但**碰到下一个标签就停**，并且**所有同名位置都试**
 * （导航里的同名词排在前面，指标块里的那个才带数值）。
 */
function pick(lines, label, pattern, span = 6) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] !== label) continue;
    for (let j = i + 1; j < Math.min(lines.length, i + 1 + span); j++) {
      if (LABELS.includes(lines[j])) break;          // 越界即停，不许穿到下一个指标
      if (pattern.test(lines[j])) return lines[j];
    }
  }
  return null;
}

/**
 * eval 返回裸字符串时没有 JSON 信封，firstJson 会抛。
 * 这个坑让 2026-08-21 那轮的第一次运行直接崩在第一步。**所有 eval 都要包 JSON.stringify**，
 * 但仍然兜一层，免得下次又栽。
 */
async function evalPage(js) {
  const r = await opencli(['browser', session, '--window', 'background', 'eval', js]);
  try {
    const j = firstJson(r.stdout);
    return typeof j === 'string' ? JSON.parse(j) : j;
  } catch {
    return { __raw: String(r.stdout || '').trim() };
  }
}

/**
 * 会话复用：会话已经停在工具 origin 上就不再走面板启动。
 *
 * 这是这个脚本最值钱的一行。面板启动一次约 20–40 秒并消耗一次登录，
 * 而报告本身只要十几秒。一轮竞品勘测要读十几张报告，
 * 每张都重新启动等于把时间和配额乘以十几倍。
 */
async function ensureTool() {
  // **探测失败 ≠ 报告失败。** 会话还不存在时 opencli 直接非零退出，
  // `evalPage` 里那层 try 只兜 JSON 解析，兜不住这个——于是一个全新的 --session
  // 名字会让整张报告变成 report_failed，报错还是「No active session」，
  // 读起来像 OpenCLI 坏了。2026-08-24 实测：这个脚本在新会话名下**根本跑不起来**。
  // 探测的语义只有一个：「我是不是已经站在工具页上了」。答不上来就当没有，去启动。
  const launched = await launchTool({
    session,
    tool: 'semrush',
    node: flags.node,
    window: flags.window,
    wait: Number(flags.wait || 7),
    timeout: Number(flags.launchTimeout || 60),
    allowParallelSession: Boolean(flags['allow-parallel-session']),
  });
  evalPage = launched.evalPage;
  return { ...launched, reused: Boolean(launched.reused) };
}

/** 面板/工具页偶发的整页错误文案。站主口述：这是瞬时的，重载即恢复。 */
const TRANSIENT = /出错了|我们已经发现了问题|请稍后重试|Something went wrong/;

/**
 * 共享账号撞到 Semrush 的每日报告限额。**这不是「没数据」也不是「节点挂了」**——
 * 2026-08-27 live 实测：撞额度时整页照常渲染，六个列头（AS / Root Domain / Category /
 * Backlinks / Country / IP / First Seen / Last Seen）全部正常挂出来，只有表体被替换成
 * 这句话。⚠️ 这正是本文件反复强调「ready 必须认数据体，不能认表头」的活证据——
 * 认表头的 ready 会在这种页面上直接判定「就绪」，然后在一张空表上稳定解析出 0 行，
 * 不报错，读起来像这个域名真的没有引荐域名。
 * 英文文案未经实测验证，按大概率翻译写，如与实际不符以实测为准。
 *
 * ⚠️ 2026-08-28 独立 review 抓到的坑，写在这里免得再犯：**`loadReport` 返回的
 * `capture` 在这种页面上恒为 null，不能直接拿它测 QUOTA_BLOCKED。** 看
 * `captureStable`（lib-tools-share.mjs）就知道：`last`（也就是最终返回的 capture）
 * 只在 `fingerprint()` 返回非 null 时才会被赋值，而 `fingerprint()` 只在
 * `isReady(bodyText)` 通过之后才会去跑 `parse()`。referring-domains 的 ready 认的
 * 正是数据体，撞限额时数据体被替换成这句话，ready 因此正确地拒绝了它——但拒绝的
 * 代价就是 `capture` 从头到尾都是 null，撞限额的证据从来没被 `loadReport` 记下来过。
 * 旧版在这里写 `if (loaded.capture?.bodyText && QUOTA_BLOCKED.test(...))` 恰好是
 * 反的：这个分支只在 ready 认表头/标签（比如 backlinks-overview）的报告上才可能
 * 触发，对写这条检查真正针对的 referring-domains 反而是死代码。修法见下面
 * `diagnoseUnrendered`——`!loaded.capture` 时必须现场再读一次 body，不能指望
 * `loaded.capture` 里已经有它。
 */
const QUOTA_BLOCKED = /已达到每日报告限额|Daily report limit reached/i;

/**
 * 表体区探针。**判据必须绑在「表体区」上，不是整页**——见
 * <law-ref id="readiness-must-bind-to-this-query"/>：「页面上出现了 X」永远要先问
 * 「X 有没有可能由别处提供？」。这句限额提示的另外几个供应商是现成的：供应商做
 * A/B、改文案、把同一句话写进帮助气泡或侧栏，整页扫描就会在一张有数据的报表上
 * 判「限额」；反过来，供应商换个说法，整页扫描又会在真限额页上判「没限额」。
 * 两个方向都会错。
 *
 * 绑法：`filledCells === 0`（表体区一个非空单元格都没有）**且**这句提示出现在
 * **表体区自己的文字**里。表头、列名、周边散文都满足不了 `filledCells > 0`。
 */
const REGION_PROBE_JS = `(() => {
  ${DEEP_DOM_JS}
  const clean = (s) => String(s == null ? '' : s).replace(/\\s+/g, ' ').trim();
  const root = document.body || document.documentElement;
  // ⚠️ 2026-08-29：表体区**要在深层里找**。旧写法是 document.querySelectorAll，
  // 在这个站上连表体区都可能因为在 shadow root 里而定位不到，于是每一次都走
  // 「bodies.length === 0」那条分支，报一个 region:null + 59 字符的 bodyText。
  const bodies = deepQueryAll(root, 'tbody, [role="rowgroup"]:not(:first-of-type), [class*="table-body" i], [class*="tableBody"], [class*="grid-body" i]');
  // 浅层读数一并留着：两者的差就是「有多少表体藏在 shadow DOM 里」。
  const lightBodies = document.querySelectorAll('tbody, [role="rowgroup"]:not(:first-of-type), [class*="table-body" i], [class*="tableBody"], [class*="grid-body" i]').length;
  const bodyText = clean(deepTextSample(root, { maxChars: 8000 })).slice(0, 4000);
  const lightBodyText = clean(document.body && document.body.innerText).slice(0, 4000);
  const shadowRoots = collectRoots(root).roots.length - 1;
  // 表体区定位不到就老实说不知道，绝不退化成「整页搜一遍」然后当成同等证据。
  if (!bodies.length) {
    return JSON.stringify({ region: null, bodyText, lightDom: { bodies: lightBodies, textLength: lightBodyText.length }, shadowRoots });
  }
  let filledCells = 0;
  const texts = [];
  for (const b of bodies) {
    for (const c of deepQueryAll(b, 'td, [role="gridcell"], [role="cell"]')) {
      if (clean(c.innerText) !== '') filledCells += 1;
    }
    texts.push(clean(b.innerText));
  }
  return JSON.stringify({
    region: { filledCells, text: texts.join(' ').slice(0, 4000), containers: bodies.length },
    bodyText,
    lightDom: { bodies: lightBodies, textLength: lightBodyText.length },
    shadowRoots,
  });
})()`;

/**
 * 纯判据，离线可测。
 *   `quota-blocked`   表体区 0 个非空单元格 **且** 表体区文字里有这句提示
 *   `quota-suspected` 页面上有这句提示，但表体区根本没定位到 —— 判据没能绑上，
 *                     不许当成 `quota-blocked` 报，也不许假装没看见
 *   `not-quota`       其余（包括「整页别处有这句话但表体区有数据」）
 */
function classifyQuotaBlock(probe) {
  const region = probe && probe.region;
  if (region && typeof region.filledCells === 'number') {
    return region.filledCells === 0 && QUOTA_BLOCKED.test(String(region.text || ''))
      ? 'quota-blocked' : 'not-quota';
  }
  return QUOTA_BLOCKED.test(String((probe && probe.bodyText) || '')) ? 'quota-suspected' : 'not-quota';
}

/**
 * `!loaded.capture` 时的诊断，拆成独立函数是为了能在 --self-test 里直接喂一个
 * 「capture 为 null、但页面上其实有限额文案」的场景进去做集成测试——只测
 * QUOTA_BLOCKED 这个正则本身（旧版的 quotaOk）测不出「production 代码根本没执行到
 * 这个正则」这类问题，删掉整段拦截逻辑那个测试照样通过，等于没测。
 *
 * `readProbe` 由调用方注入：生产环境传一个真的 `evalPage` 读取（跑
 * `REGION_PROBE_JS`），自测传一个返回固定 `{ region, bodyText }` 的假函数。
 * 函数本身不知道也不需要知道 opencli 怎么读页面。
 */
async function diagnoseUnrendered(name, target, db, retries, readProbe) {
  let probe = null;
  try { probe = await readProbe(); } catch { /* 读不到就当空，走通用诊断 */ }
  const quota = classifyQuotaBlock(probe);
  if (quota === 'quota-blocked') {
    return new Error(
      `Semrush ${name} for "${target}" 撞到了共享账号的每日报告限额（表体区 0 个非空单元格，` +
      `且表体区文字就是「已达到每日报告限额」）。` +
      `这不是「该主体没有数据」，也不是「节点挂了」——列头都正常渲染了，只是表体被限额挡住。` +
      `换一个节点重跑：--node N（面板的节点下拉会切到另一个账号；实测撞额度时 node 2 仍是新鲜的）。`,
    );
  }
  if (quota === 'quota-suspected') {
    return new Error(
      `Semrush ${name} for "${target}" 没渲染，页面上出现了「已达到每日报告限额」字样，` +
      `但这一次**没能定位到表体区**，所以无法确认那句话是不是表体给出的——` +
      `它也可能来自帮助气泡或侧栏。先按限额处理（换 --node N 重跑），` +
      `若换节点后依然如此，再按「从未渲染」排查。`,
    );
  }
  return new Error(
    `Semrush ${name} for "${target}" never rendered. 依次排查：` +
    `(1) 该主体在 db=${db || 'global'} 里可能真的没有数据；` +
    `(2) 节点挂了——换 --node 重跑（症状是白页、长时间不渲染）；` +
    `(3) 若页面显示「出错了…请稍后重试」，本脚本已自动重载重试 ${retries} 次仍失败。`,
  );
}

/**
 * 解析结果是不是「一屏还什么都没有」。空结果要多要一次确认——
 * 它既可能是「真的没数据」（终局结论），也可能是「还在水合」（等一下就有了），
 * 两者在某一个瞬间长得完全一样。
 */
function looksEmpty(parsed) {
  if (!parsed || typeof parsed !== 'object') return true;
  return Object.entries(parsed).every(([k, v]) => {
    if (k === 'note' || k === 'rawText' || k === 'rowsVisible') return true;   // 元信息，不算内容
    if (Array.isArray(v)) return v.length === 0;
    return v === null || v === undefined || v === false;
  });
}

/**
 * 页面自己渲染出来的「这里没有内容」。**这是页面产出的事实**，和「解析出 0 行」
 * 不是一回事：后者也可能只是还没水合。各报告的 `spec.ready` 里已经在认这几句话
 * （见上面的 REPORTS），这里复用同一组词，用途不同——那边是入场券，这边是
 * 「空结果可以下结论」的依据。
 */
const EMPTY_STATE_RENDERED = /未找到结果|未找到匹配|未找到|没有找到|没有数据|暂无数据|No results|No backlinks|No data|Nothing found/i;

/**
 * `loadReport` 的指纹。**空结果不靠「多读一次」确认，靠结构。**
 *
 * 【2026-08-29 修正】上一版是 `needed: (print) => looksEmpty(parsed) ? 3 : 2` ——
 * 「看起来空就多读一次」。那还是重复计数，而
 * <law-ref id="readiness-must-bind-to-this-query"/> 的整条要点就是重复不是完成：
 * 一个还没水合的表在任意次读数里都稳定地空着。发现者点出的具体走法更难看：当
 * `isReady` 因为目标字符串出现在**面包屑**而不是表格主体里而通过时，一份未水合的
 * 0 行解析会被稳稳确认 3 次，然后作为「空报表」归档，全程不报错。
 *
 * 换成和 `makeNextPageFingerprint` 同一条已验证过的结构判据：
 *
 *   | 形态                  | 结构特征                        | 能否下结论 |
 *   |-----------------------|---------------------------------|-----------|
 *   | 页面渲染了「无结果」  | 空态文案出现                    | 能         |
 *   | 整页根本没有表        | `tableCount === 0`              | 能         |
 *   | 表在、列头在、就是没行 | `tableCount > 0`                | **不能**，继续等 |
 *   | 读不到 tableCount      | 判据没能绑上                    | **不能**，继续等 |
 *
 * 「继续等」等到 captureStable 的 deadline，然后 `stable === false`，调用方走
 * `diagnoseUnrendered` 显式报错 —— 宁可让人重跑，也不把一张慢表归档成空报表。
 */
function makeReportFingerprint({ isReady, parseText, target }) {
  return (cap) => {
    if (!cap?.bodyText || !isReady(cap.bodyText, target)) return null;
    const parsed = parseText(cap.bodyText, cap.cells);
    if (parsed === null) return null;
    const print = JSON.stringify(parsed);
    if (!looksEmpty(parsed)) return print;
    if (EMPTY_STATE_RENDERED.test(cap.bodyText)) return print;
    if (typeof cap.tableCount !== 'number') return null;
    // ⚠️ 2026-08-29：`tableCount === 0` 只有在**穿透读数**上才有意义。浅层的 0 是
    // 「页面的一小块里没有表」，而 Semrush 的表就在 shadow root 里——那正是整族
    // `no-table` 结论的来路。读数不是穿透读的就继续等，宁可超时也不下这个结论。
    if (cap.deepProbe !== true) return null;
    return cap.tableCount > 0 ? null : print;
  };
}

/**
 * 导航 + 轮询到**解析结果稳定**。撞上瞬时错误页就重载重试，**不要去换节点或改选择器**——
 * 节点挂掉的样子是白页/长时间不渲染，这个是有明确错误文案的错误页，两回事。
 *
 * **就绪判据（`spec.ready`）只是入场券，不是结论。** 这些页面分两拍渲染：
 * 先挂标签和占位值，几秒后真值才水合进来。只认标签/文案的判据会在这个缝里通过，
 * 读到的是占位值，而且**不报错**——2026-08-23 实测 semrush-overview 跑 8 个域名，
 * 6 个的 Authority Score 被读成 0（真值 15~29）。
 * 所以这里用 `parse()` 的**完整输出**当指纹：连续两次完全一致才收下。
 * 指纹就是要写出去的那个对象，不存在「盯着 A、写出去 B」的漏洞。
 *
 * 返回 { capture, parsed, stable, reads }。**stable 为 false 时不许把 parsed 当结论**——
 * 那是一份还在变的数，写出去不会有人发现它是错的。
 */
async function loadReport(url, spec, {
  settle = 10, timeout = 120, retries = 3, intervalMs = 3000,
  scrollSegments = false, scrollPauseMs = 1500, maxScrollSegments = 12,
} = {}) {
  // ready 可以是正则（页面级字样）或函数 (bodyText, target) => boolean（需要认数据行时）。
  const isReady = typeof spec.ready === 'function' ? spec.ready : (t) => spec.ready.test(t);
  const parseText = (t, cells) => {
    // 中间态的文本什么形状都有，解析器抛错只说明「这一拍还不能读」，不是致命错误。
    try { return spec.parse(String(t || '').split(/\n+/).map((l) => l.trim()).filter(Boolean), cells); } catch { return null; }
  };
  let last = { capture: null, reads: 0 };
  for (let attempt = 1; attempt <= retries; attempt++) {
    await evalPage(`(() => { location.href = ${JSON.stringify(url)}; return JSON.stringify({ nav: 1 }); })()`);
    await sleep(settle * 1000);
    // 见调用点关于默认值的长注释。滚完回顶，后面还要读页头。
    if (scrollSegments) {
      try {
        const scrolled = await scrollThroughSegments(evalPage, {
          sleep, segmentPauseMs: scrollPauseMs, maxSegments: maxScrollSegments,
        });
        console.error(`[scroll] ${JSON.stringify(scrolled)}`);
      } catch (error) {
        console.error(`[scroll] 分段滚动失败，继续按不滚动读：${redactSecrets(String(error?.message || error))}`);
      }
    }
    const settled = await captureStable({
      // tableCount 是结构判据的原料：**表在但无行** 和 **整页无表** 是两件不同的事，
      // 而「读了几次」区分不了它们。见 makeReportFingerprint。
      // ⚠️ 2026-08-29：`bodyText` 与 `tableCount` 都改走穿透遍历。旧版是
      // `document.body.innerText` + `document.querySelectorAll`，两者都不进
      // shadow DOM；同一页实测浅层 59 字符 / 深层 1,605,054，`tableCount` 因此
      // 恒为 0，`makeReportFingerprint` 的结构判据就一直落在「整页无表 ⇒ 能下结论」
      // 那一格上。浅层读数保留在 `lightDom` 里，差值是诊断信号。
      read: () => evalPage(`(() => {
        ${DEEP_DOM_JS}
        const root = document.body || document.documentElement;
        const light = document.body?.innerText || '';
        const t = deepTextSample(root, { maxChars: 60000 });
        return JSON.stringify({
        url: location.href.split('?')[0], title: document.title,
        landedUrl: location.href,
        transient: ${TRANSIENT.toString()}.test(t),
        bodyText: t.slice(0, 60000),
        tableCount: deepQueryAll(root, 'table,[role="grid"]').length,
        deepProbe: true,
        shadowRoots: collectRoots(root).roots.length - 1,
        lightDom: { textLength: light.length, tableCount: document.querySelectorAll('table,[role="grid"]').length },
        cells: ${spec.cells || 'null'},
      }); })()`),
      // 瞬时错误页要的是重载，不是更长的超时——立刻出让，别把 timeout 白烧完。
      abortIf: (cap) => Boolean(cap?.transient),
      fingerprint: makeReportFingerprint({ isReady, parseText, target }),
      // 空结果不再靠「多读一次」确认——那由 makeReportFingerprint 的结构判据管。
      needed: 2,
      timeoutMs: timeout * 1000,
      intervalMs,
    });
    if (settled.aborted) {
      // 重载，不是换节点。见 authorized-data-sources.md「瞬时错误页」。
      await evalPage(`(() => { location.reload(); return JSON.stringify({ reload: 1 }); })()`);
      await sleep(6000);
      continue;
    }
    if (settled.stable) {
      return { capture: settled.capture, parsed: JSON.parse(settled.fingerprint), stable: true, reads: settled.reads };
    }
    last = settled;
  }
  return { capture: last.capture, parsed: null, stable: false, reads: last.reads };
}

// ---------- 解析器 ----------

/**
 * 「不可用」「n/a」「—」都表示这一格没有值——绝不能落成 0。
 *
 * 计数列走 parseCompact（页面上是 `27.1K` / `1.1M` / `1.6万`，直接 Number() 会得到
 * NaN，然后把一个月搜 27,100 的词报成「没有搜索量」）；小数列不能走它，它会把
 * CPC 0.97 四舍五入成 1。
 */
function magicValue(raw, { compact = false } = {}) {
  const value = String(raw ?? '').trim();
  if (!value || NO_VALUE.test(value)) return null;
  return compact ? parseCompact(value) : toNum(value.replace(/[,%]/g, ''));
}

function parseKeywordMagic(lines, cells) {
  // 侧栏聚簇的总量，用来核对「翻完了没有」。
  const totalLine = lines.find((l, i) => l === 'All' && /^[\d.,]+[KMB]?$/.test(lines[i + 1] || ''));
  const total = totalLine ? lines[lines.indexOf(totalLine) + 1] : null;
  if (!cells?.headers?.length) return { rows: [], seedTotal: total, metricsPending: null, missingColumns: ['<no DOM cells>'], suspectColumns: [], partialLossColumns: [] };

  const wanted = {
    keyword: '关键词', intent: '意图', relevance: 'Relevance', volume: '搜索量',
    kd: 'KD', cpc: 'CPC (USD)', competition: '竞争程度', serpFeatures: 'SF',
    results: '结果', updated: '已更新',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : null);

  const rows = cells.rows.map((row) => ({
    keyword: String(cell(row, 'keyword') ?? '').replace(/\u200b/g, '').trim(),
    // 一个词可以同时带多个意图，页面用换行分隔。
    intent: String(cell(row, 'intent') ?? '').split(/\s+/).filter(Boolean),
    relevance: magicValue(cell(row, 'relevance')),
    volume: magicValue(cell(row, 'volume'), { compact: true }),
    kd: magicValue(cell(row, 'kd')),
    cpc: magicValue(cell(row, 'cpc')),
    competition: magicValue(cell(row, 'competition')),
    serpFeatures: magicValue(cell(row, 'serpFeatures')),
    results: magicValue(cell(row, 'results'), { compact: true }),
    updated: String(cell(row, 'updated') ?? '').trim() || null,
  })).filter((row) => row.keyword);

  // 指标待刷新的行要能被下游认出来，否则 null 会被当成「这个词没量」。
  const metricsPending = rows.filter((row) => row.volume === null).length;
  // 这个解析器以前只有 missingColumns，没有任何「列名对得上但值解析崩了」的
  // 检测——而 `27.1K → null` 那次事故正好发生在这条路径上的同类换算里。
  // 注意分母用 `cells.rows`、parsedRows 用未经 keyword 过滤的行，两边必须等长。
  const audited = cells.rows.map((row) => ({
    keyword: String(cell(row, 'keyword') ?? '').replace(/\u200b/g, '').trim(),
    intent: String(cell(row, 'intent') ?? '').split(/\s+/).filter(Boolean),
    relevance: magicValue(cell(row, 'relevance')),
    volume: magicValue(cell(row, 'volume'), { compact: true }),
    kd: magicValue(cell(row, 'kd')),
    cpc: magicValue(cell(row, 'cpc')),
    competition: magicValue(cell(row, 'competition')),
    serpFeatures: magicValue(cell(row, 'serpFeatures')),
    results: magicValue(cell(row, 'results'), { compact: true }),
    updated: String(cell(row, 'updated') ?? '').trim() || null,
  }));
  const audit = auditColumns(index, wanted, cells.rows, audited);
  return { rows, seedTotal: total, metricsPending, missingColumns, ...audit };
}

/**
 * 引荐域名报告。ARIA grid 与 keyword-magic 同构，单元格已经由 ARIA_GRID_CELLS
 * 按列名切好，这里只管按列名取值——列顺序变了得到 null 并记进 missingColumns，
 * 不许静默错位（本文件反复写过这条规则，这里不再重复论证一遍）。
 *
 * 「Root Domain / Category」是一个格子里塞了两样东西。⚠️ 2026-08-27 首版按发现探针
 * 抓到的样本（`coacht.com/知识`）以为是斜杠分隔，写死按第一个 `/` 切；live 核验发现
 * 那是探针把 innerText 拼成一行时的假象——**真实单元格是两个 <div>，innerText 里是
 * 换行分隔的 `coacht.com\n知识`**。只认斜杠时 referringDomain 会带着 `\n知识` 一起，
 * category 恒为 null，还会连带打穿 buildRollup 的分组（同域名不同分类永远聚不到一起）。
 * 现在换行和斜杠都认，谁先出现按谁切，别只测那个探针留下的斜杠假象。
 * 原始整格文本原样保留在 rootDomainRaw，切错了还能从这里回填，不必重新抓页面。
 */
function parseReferringDomains(lines, cells) {
  if (!cells?.headers?.length) return { rows: [], missingColumns: ['<no DOM cells>'], suspectColumns: [], partialLossColumns: [] };

  const wanted = {
    authorityScore: 'AS', rootDomain: 'Root Domain / Category', backlinks: 'Backlinks',
    ipCountry: 'Country / IP', firstSeen: 'First Seen', lastSeen: 'Last Seen',
  };
  const { index, missingColumns } = buildColumnIndex(cells.headers, wanted);
  const cell = (row, key) => (index[key] >= 0 ? row[index[key]] : null);

  // 「不可用」「n/a」「—」「-」都表示这一格没有值，绝不能落成 0 或空字符串当真值。
  const placeholder = (v) => {
    const s = String(v ?? '').trim();
    return !s || NO_VALUE.test(s) ? null : s;
  };

  // ⚠️ 2026-08-28 live 核验：这一格不是「域名 + 分类」两段，是「域名 + 分类？+ 状态徽章 +
  // 徽章的整句 tooltip」四段全部拼在一起，域名之后剩下的文本可能长这样（原文照抄，不是
  // 简化版——之前三个缺陷都栽在「用摘要打字出来的 fixture」上，这是第四次，不能再来一次）：
  //   'ifaxian.net\nNofollow\n此域名没有 Follow 链接，但可能包含具有 Nofollow、Sponsored 和 UGC 属性的链接。'
  //   'portaportal.com\n知识\nNofollow\n此域名没有 Follow 链接，但可能包含具有 Nofollow、Sponsored 和 UGC 属性的链接。'
  //   'oregongrassfed.com\n丢失\n如果一个引荐域名不再有指向所分析域名的链接，则被视为丢失。…'
  // 只切一刀（旧版）会把徽章和整句 tooltip 一起塞进 category。做法：域名之后按行切开，
  // 找第一个匹配「已知徽章词」的行，扔掉它和它之后的所有行；徽章前面剩下的（可能是空）
  // 才是 category。找不到徽章前面没有东西就是 null，不能把徽章文字当 category。
  //
  // 已观测到的徽章词——这份列表是「观测到的」，不是穷举。以后见到新徽章之前，
  // 宁可整段保留在 category 里（哪怕带着徽章）也不能瞎猜切哪一刀，把真分类文字切没了。
  const BADGE_TOKENS = ['Nofollow', 'Follow', 'Sponsored', 'UGC', '丢失'];

  const splitRoot = (row) => {
    const rawRoot = placeholder(cell(row, 'rootDomain'));
    // 换行是真实分隔符，斜杠是探针假象留下的兜底——两个都认，谁先出现切谁。
    const sepIdx = rawRoot === null ? -1 : rawRoot.search(/[\n/]/);
    const restLines = (rawRoot !== null && sepIdx >= 0)
      ? rawRoot.slice(sepIdx + 1).split('\n').map((l) => l.trim()).filter(Boolean)
      : [];
    const badgeIdx = restLines.findIndex((l) => BADGE_TOKENS.includes(l));
    // 认识徽章：徽章前面的行才是 category，没有就是 null。
    // 不认识徽章（badgeIdx < 0 但确实有剩余文本）：不猜测切哪一刀，整段原样保留。
    const category = restLines.length === 0 ? null
      : (badgeIdx >= 0 ? (restLines.slice(0, badgeIdx).join('\n') || null) : restLines.join('\n'));
    const referringDomain = rawRoot === null ? null : (sepIdx >= 0 ? rawRoot.slice(0, sepIdx).trim() : rawRoot.trim());
    return { rawRoot, referringDomain, category };
  };

  const allRows = cells.rows.map((row) => {
    const { rawRoot, referringDomain, category } = splitRoot(row);
    return {
      // toNum 对 "-" / "不可用" 求值会得到 NaN 从而落成 null，不需要再套一层 placeholder。
      authorityScore: toNum(cell(row, 'authorityScore')),
      referringDomain,
      category,
      rootDomainRaw: rawRoot,
      // 计数列必须走 parseCompact——页面上是 `75,501`，不是 `75501`。
      backlinks: parseCompact(placeholder(cell(row, 'backlinks'))),
      ipCountry: placeholder(cell(row, 'ipCountry')),
      firstSeen: placeholder(cell(row, 'firstSeen')),
      lastSeen: placeholder(cell(row, 'lastSeen')),
    };
  });

  // suspectColumns 要在丢弃「没有域名的行」**之前**算——那些行往往正是列错位的受害者，
  // filter 掉之后 rawRows 和 parsedRows 数量对不上，auditColumns 直接判不出来。
  // rootDomain 这一列的输出字段名是 referringDomain（不是 wanted 里写的那个 key
  // 本身），额外补一份别名字段只给这次检查用，不进最终输出。
  const suspectCheckRows = allRows.map((r) => ({ ...r, rootDomain: r.referringDomain }));
  const audit = auditColumns(index, wanted, cells.rows, suspectCheckRows);

  const rows = allRows.filter((row) => row.referringDomain);

  return { rows, missingColumns, ...audit };
}

/**
 * 反链 SOP 第三步——「导出引荐域名列表，按命中次数排序」——就是这个函数。
 * 加它是为了不让每个调用方都重新实现一遍这段聚合。
 *
 * ⚠️ 2026-08-28 review：旧签名是 `buildRollup(rows, target)`，只吃**一次运行**的行。
 * 单次查询里 hitCount 几乎总是 1（这张报表本身已经按域名分组），fromDomains 也永远只有
 * 一个元素——字段名承诺的「同一个引荐域名有没有同时指向组合里的好几个站」，单次调用
 * 根本回答不了，名字在撒谎。真要回答这个问题得跨多次 `--report referring-domains`
 * 调用合并。所以改成吃「多次运行」的数组：`[{ target, rows }, ...]`。CLI 主流程
 * 目前只喂一次运行进去，效果和以前一样；真要跨域聚合时，调用方把几份 JSON 输出的
 * `{ target, rows }` 塞进同一个数组传进来就行，不用重新实现这段聚合逻辑。
 */
function buildRollup(runs) {
  const map = new Map();
  for (const run of runs || []) {
    for (const row of run?.rows || []) {
      const key = row?.referringDomain;
      if (!key) continue;
      if (!map.has(key)) map.set(key, { referringDomain: key, hitCount: 0, fromDomains: new Set() });
      const entry = map.get(key);
      entry.hitCount += 1;
      entry.fromDomains.add(run.target);
    }
  }
  return [...map.values()]
    .map((e) => ({ ...e, fromDomains: [...e.fromDomains] }))
    .sort((a, b) => b.hitCount - a.hitCount);
}

function parseOrganicOverview(lines) {
  return {
    organicKeywords: parseCompact(pick(lines, '关键词', NUM)),
    organicTraffic: parseCompact(pick(lines, '流量', NUM)),
    trafficCost: pick(lines, '流量成本', /^US\$|^\$/),
  };
}

function parseBacklinks(lines) {
  return {
    referringDomains: parseCompact(pick(lines, '引荐域名', NUM)),
    backlinks: parseCompact(pick(lines, '反向链接', NUM)),
    monthlyVisits: parseCompact(pick(lines, '每月访问量', NUM)),
    organicTraffic: parseCompact(pick(lines, '自然流量', NUM)),
    // 不能写 `Number(x) || null`：**AS 为 0 是有意义的实测值**（本站 2026-08-21 就是 0），
    // 而 0 是 falsy，会被这个写法悄悄变成「没数据」。null 和 0 在这里含义相反。
    authorityScore: toNum(pick(lines, 'Authority Score', /^\d+$/)),
    // 这一句是实测出来的强信号：全站一条 follow 反链都没有时，Semrush 直接这么写。
    // 它比 AS=0 更明确——AS 0 也可能只是数据太新。
    noFollowBacklinks: lines.some((l) => /找不到\s*Follow\s*反向链接|No follow backlinks/i.test(l)),
  };
}

/**
 * 自然排名表：**从 URL 往左数**，不要从左往右按固定宽度切。
 *
 * 列顺序是 关键词 / 意图 / 排名 / SF / 流量 / 流量% / 搜索量 / KD% / URL / 上次更改。
 * 「意图」这一列**可能是一个字母也可能是两个**（`C` 或 `C` `I` 两行），
 * 从左往右按固定宽度切会在有两个意图的行上整体错位一格，而且看不出来——
 * 2026-08-21 首版就是这样，第一行对、后面每行都把上一行的日期当成了关键词。
 *
 * URL 左边紧邻的六列全是数值且顺序固定，所以倒着数是稳的：
 *   KD% ← 搜索量 ← 流量% ← 流量 ← SF ← 排名
 * 再往左剩下的就是「关键词 + 若干意图字母」，意图字母是单个大写字母，剔掉即得关键词。
 */
// The URL-line matcher deliberately does NOT require a character after the
// trailing slash. It used to (`\/\S`), and that silently dropped every row
// whose ranking page is the bare root — `snapgen.ai/` with nothing after it.
// Measured 2026-08-21 on a live leaderboard cohort: snapgen.ai lost 90 of 91
// rows and logomotion.design lost 18 of 20, both reported as `rows: []`-ish
// with no error, and a tester wrote up "this domain ranks for almost nothing"
// on the strength of it. A young SaaS site ranking entirely on `/` is the
// median case here, not an edge case, so the slash ends the requirement.
/**
 * 表格报告每页 100 行，**超出部分不会有任何提示**——`parsed.rows` 就是 100，
 * 看起来像一个完整结果。2026-08-21 实测一个 104 词的域名被静默截成 100。
 *
 * 翻页**不是 URL 驱动的**：`&page=2` / `&pageNumber=2` / `&offset=100` 三种写法
 * 都试过，页码指示器纹丝不动停在 1。这与本 Skill 既有的「分页多半是 URL 驱动，
 * 确认后可直接拼 URL」相反——**这里是反例，只能点「下一页」**。
 */
/**
 * 分页器有两种渲染：中文 `页码： 1 / 201`，英文 `Page:` `of` `201` `Page: 1`。
 *
 * 只认中文那种时，英文页面一律读出 total=1，于是「只读了第 1 页」被写成
 * `complete: true`——本文件三令五申禁止的静默截断，正好由分页检测自己制造出来。
 * 两个数都可能带千位逗号，旧的 `(\\d+)` 在 `1,848` 上同样匹配不到——**任何超过 999 页
 * 的报表都会被宣称「已读完」**。实测：关键词魔法工具 seed=nonogram 是 201 页、
 * 自然排名 coolmathgames.com 是 1,848 页，旧实现两个都报 1 页且不报警。
 */
function readPageInfo(bodyText) {
  const zh = bodyText.match(/页码：\s*\n?\s*([\d,]+)?[\s\S]{0,6}?\/\s*\n?\s*([\d,]+)/);
  const zhCur = bodyText.match(/页码：\s*(\d+)\s*$/m);
  const plain = (v) => Number(String(v).replace(/,/g, ''));
  if (zh) return { current: zhCur ? plain(zhCur[1]) : (zh[1] ? plain(zh[1]) : 1), total: plain(zh[2]) };
  const en = bodyText.match(/Page:\s*\n?\s*of\s*\n?\s*([\d,]+)/i);
  const enCur = bodyText.match(/Page:\s*(\d+)\s*$/mi);
  if (en) return { current: enCur ? plain(enCur[1]) : 1, total: plain(en[1]) };
  return { current: 1, total: 1 };
}

/**
 * 「下一页」控件探针。**分成 absent / disabled / enabled 三态，不是有/没有两态。**
 * 见 <law-ref id="readiness-must-bind-to-this-query"/>：否定判定同样需要一个最小
 * 等待下限。分页控件和表体一样是后渲染的，刚翻完一页的那一瞬间它既不存在、又
 * 「非常稳定」地不存在——把 absent 当成「没有下一页」，就是「行数不再增长所以到头了」
 * 那个错误换了件衣服。
 *   `disabled` 是页面自己产出的「这是最后一页」信号，可以立刻采信；
 *   `absent`   是「还没渲染出来」和「真的没有分页器」的叠加态，**它永远不是一个结论**。
 *
 * 【2026-08-28 第二次修正】上一版给 absent 装了个 9 秒下限，等满就 return
 * 「没有下一页」。那是同一个赌，只是换了个数——见
 * <law-ref id="readiness-must-bind-to-this-query"/>：*等够久了还是空，所以是空* 这条
 * 规则永远不可证伪，任何反例都能用一个更大的常数回答。**时长不是页面产出的东西。**
 *
 * 这里还有一条**结构判据**把话说死：进入翻页循环的前提是 `readPageInfo` 从页面上
 * 读到了「1 / 201」——**页面自己已经说了它有 N 页**。所以在这个代码路径里，
 * 「分页控件不存在」和一个页面产出的事实直接矛盾，它只能是「还没渲染」，
 * 不可能是「已到最后一页」。absent 的判定因此恒为 `inconclusive`。
 * 下限只保留为**一轮的时间上界**（别让一次探针死等），不作为判据。
 */
const NEXT_PAGE_JS = `(() => {
  const all = [...document.querySelectorAll('button,a,[role="button"]')]
    .filter((b) => /^(下一页|Next)$/.test((b.innerText || '').trim()));
  if (!all.length) return JSON.stringify({ control: 'absent' });
  const live = all.find((b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true');
  if (!live) return JSON.stringify({ control: 'disabled' });
  live.click();
  return JSON.stringify({ control: 'enabled', clicked: true });
})()`;

/**
 * absent 探针一轮的**时间上界**。不是判据——等满它得到的是 `inconclusive`，
 * 不是「没有下一页」。名字带 BUDGET 而不是 MIN_，是为了下一个读代码的人不会
 * 再把它当成「等够了就能下结论」。
 */
const PAGER_ABSENT_BUDGET_MS = 9000;
/**
 * 翻页后表体「解析出 0 行」的时间上界。同样不是判据：判据是下面那条结构判据
 * （表在但无行 → 继续等；整页无表 → 可以下结论）。只有在拿不到结构信号时，
 * 这个数字才作为退化兜底出现，并且退化路径本身会在注释里被标出来。
 */
const PAGE_SETTLE_BUDGET_MS = 6000;

/**
 * 点「下一页」，等页码真的变了再返回。
 *
 * 返回 `{ advanced, verdict, reason }`。**`verdict` 才是给下游读的东西**，reason 只是
 * 给人看的原文：
 *   `advanced`      翻过去了
 *   `last-page`     页面产出的禁用态 —— 唯一一个「确实到头了」的结论
 *   `inconclusive`  分页器一直没出现 / 点了没反应 —— **不知道**，不是「到头了」
 * 把 last-page 和 inconclusive 挤进同一个 `advanced: false` 里，下游就只能靠正则去猜
 * reason 的措辞；这两个词对下游意思完全不同，必须是结构化字段。
 */
async function clickNextPage(evalPage, before, options = {}) {
  const {
    absentBudgetMs = PAGER_ABSENT_BUDGET_MS,
    probeIntervalMs = 1500,
    now = () => Date.now(),
    sleepFn = sleep,
    pageWaits = 12,
  } = options;
  const startedAt = now();
  for (;;) {
    const probe = await evalPage(NEXT_PAGE_JS);
    if (probe?.control === 'enabled') break;
    if (probe?.control === 'disabled') {
      return { advanced: false, verdict: 'last-page', reason: '分页控件已渲染且「下一页」为禁用态 —— 这是最后一页' };
    }
    const waited = now() - startedAt;
    if (waited >= absentBudgetMs) {
      return {
        advanced: false,
        verdict: 'inconclusive',
        reason: `inconclusive：探了 ${Math.round(waited / 1000)}s 分页控件始终没有出现`
          + `（既没有启用态也没有禁用态）。页面自己报的总页数说明它有下一页，`
          + `所以这只说明分页器没渲染出来 —— **这不等于已经到最后一页**，本次读到的行不是全量。`,
      };
    }
    await sleepFn(probeIntervalMs);
  }
  for (let i = 0; i < pageWaits; i++) {
    await sleepFn(probeIntervalMs);
    const current = await evalPage('(() => JSON.stringify({ t: document.body?.innerText || "" }))()');
    if (readPageInfo(current.t).current > before) return { advanced: true, verdict: 'advanced', reason: null };
  }
  return { advanced: false, verdict: 'inconclusive', reason: 'inconclusive：点了「下一页」但页码始终没有前进' };
}

/**
 * 翻页后那一页的 fingerprint。三条否定：还是上一页 → 继续等；parse 抛了 → 继续等；
 * **解析出 0 行而上一页有行 → 看结构，不看时长**。
 *
 * 【2026-08-28 第二次修正】上一版是「0 行且还没过最小等待 → 继续等」，等满 6 秒之后
 * 就把 0 行收下当成「这一页确实是空的」。那是 <law-ref id="readiness-must-bind-to-this-query"/>
 * 点名的那个赌：一张水合更慢的表只需要 6.1 秒就能骗过它。
 *
 * 换成实测出来的结构判据 —— 它可观测、互斥，而且不依赖等了多久：
 *
 *   | 形态       | 结构特征                                  | 能否下结论 |
 *   |------------|-------------------------------------------|-----------|
 *   | 表来得晚   | table 元素存在（列头齐全），只是无行        | 不能，继续等 |
 *   | 本来没表   | 整页不存在 table / [role=grid]              | 能         |
 *
 * 「继续等」等到 captureStable 的 deadline 为止，然后 `stable === false`，调用方把它
 * 记成截断并报出来 —— 显式失败，而不是把一张慢表写成空表。
 *
 * `tableCount` 拿不到时（老调用方没传）退回旧的时间兜底，只为不改变既有调用方的行为；
 * 本文件唯一的调用点是传的。
 */
function makeNextPageFingerprint({ prevPrint, prevRowCount, settleBudgetMs = PAGE_SETTLE_BUDGET_MS, now = () => Date.now() }) {
  const startedAt = now();
  return (print, ctx = {}) => {
    if (print == null || print === prevPrint) return null;
    let rows = 0;
    try { rows = (JSON.parse(print).rows || []).length; } catch { return null; }
    if (rows === 0 && prevRowCount > 0) {
      const tableCount = ctx?.tableCount;
      // 退化路径：没有结构信号，只剩时间兜底。保留只为兼容，不要在新调用点上依赖它。
      if (typeof tableCount !== 'number') return now() - startedAt < settleBudgetMs ? null : print;
      // 表在、列头在、就是没行 —— 这正是「还没水合」的样子，等多久都不许收下。
      if (tableCount > 0) return null;
      // 整页连 table / [role=grid] 都没有 —— 这是页面产出的结构事实，可以收下。
      return print;
    }
    return print;
  };
}

function parsePositions(lines) {
  const NUMISH = /^(<\s*)?[\d.,]+\s*(?:[KMB]|万)?$|^< ?0\.01$/i;
  const UNAVAILABLE = /^(?:不可用|n\/?a|-|—)$/i;
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(lines[i]) && !/^https?:\/\//i.test(lines[i])) continue;
    const left = lines.slice(Math.max(0, i - 12), i);
    // KD 会是「不可用」，SF 也会整格缺失；这两列不能拿来当固定宽度锚点。
    // 从右往左先取 KD/量/流量%，再取 1–2 个位置数（position 必有，SF 可无）。
    let j = left.length - 1;
    const kdRaw = left[j];
    if (!NUMISH.test(kdRaw) && !UNAVAILABLE.test(kdRaw)) continue;
    j -= 1;
    const tail = [];
    while (j >= 0 && tail.length < 3 && NUMISH.test(left[j])) { tail.unshift(left[j]); j -= 1; }
    if (tail.length < 3) continue;
    const rankCells = [];
    while (j >= 0 && rankCells.length < 2 && NUMISH.test(left[j])) { rankCells.unshift(left[j]); j -= 1; }
    if (!rankCells.length) continue;
    const head = left.slice(0, j + 1).filter((x) => !/^\d+月\d+日$|^\d+ ?(小时|天|个月)$|^[A-Z]$/.test(x));
    rows.push({
      keyword: head[head.length - 1] ?? null,
      position: Number(rankCells[0]), serpFeatures: rankCells.length > 1 ? Number(rankCells[1]) : null,
      traffic: parseCompact(tail[0]), trafficPercent: tail[1],
      volume: parseCompact(tail[2]), kd: UNAVAILABLE.test(kdRaw) ? null : Number(kdRaw),
      url: lines[i],
    });
  }
  return { rows, note: '按「URL 左邻六列必为数值」倒推；结构不符的行被丢弃而不是猜测，因此行数可能少于页面显示。' };
}

/**
 * 关键词概览页的解析。页面很短（实测 innerText 不到 1000 字符），
 * 结构是「标签一行、值在下一行」，中间会插评级词（非常容易/困难）。
 *
 * 分国家那块是 `US / 美国 / 260` 三行一组，**国家代码是两个大写字母**，
 * 靠这个切组，不靠出现顺序——顺序会随各国量级变化。
 */
function parseKeywordOverview(lines) {
  const volume = pick(lines, '搜索量', NUM) ?? pick(lines, 'Volume', NUM);
  const kdRaw = pick(lines, '关键词难度', /^\d+(?:\.\d+)?%$/)
    ?? pick(lines, 'Keyword Difficulty', /^\d+(?:\.\d+)?%$/);
  const globalVolume = pick(lines, '全球搜索量', NUM) ?? pick(lines, 'Global Volume', NUM);
  const cpc = pick(lines, 'CPC', /^[$¥€£]/);
  const intent = pick(lines, '意图', /^(信息|导航|商业|交易|Informational|Navigational|Commercial|Transactional)$/);

  // KD 的评级词紧跟在百分数后面
  let kdLabel = null;
  const kdIdx = kdRaw ? lines.indexOf(kdRaw) : -1;
  if (kdIdx >= 0 && lines[kdIdx + 1] && !LABELS.includes(lines[kdIdx + 1])
      && !NUM.test(lines[kdIdx + 1])) kdLabel = lines[kdIdx + 1];

  const byCountry = [];
  const gi = lines.indexOf('全球搜索量');
  if (gi >= 0) {
    for (let i = gi + 1; i < lines.length; i++) {
      if (LABELS.includes(lines[i])) break;
      if (/^[A-Z]{2}$/.test(lines[i]) && lines[i + 2] && NUM.test(lines[i + 2])) {
        byCountry.push({ code: lines[i], name: lines[i + 1], volume: parseCompact(lines[i + 2]) });
        i += 2;
      } else if (lines[i] === '其他' && NUM.test(lines[i + 1] || '')) {
        byCountry.push({ code: 'OTHER', name: '其他', volume: parseCompact(lines[i + 1]) });
        i += 1;
      }
    }
  }

  return {
    volume: volume === null ? null : parseCompact(volume),
    kd: kdRaw ? Number(String(kdRaw).replace('%', '')) : null,
    kdLabel,
    globalVolume: globalVolume === null ? null : parseCompact(globalVolume),
    cpc: cpc || null,
    intent: intent || null,
    byCountry,
    note: 'volume 是该 db 国家的月搜索量，globalVolume 是全球合计；两者不可混用。'
      + 'volume 为 null 表示页面上没读到数值，不等于该词搜索量为 0。',
  };
}

/**
 * ⚠️ 这里曾经写成 `{ rowsVisible: parseRows(...) }` —— 字段名说「几行」，装的却是**行数组**。
 * 两个后果：`--all-pages` 翻页时 `parsed.rows` 是 undefined，push 直接抛 TypeError
 * （整张报告变成 report_failed，看起来像数据源的问题）；下游读 `rowsVisible` 想拿个数，
 * 拿到的是数组。**字段名和内容必须对得上**，否则错在别处才被发现。
 */
function parsePages(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^https?:\/\//i.test(lines[i]) && !/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(lines[i])) continue;
    const fields = lines.slice(i + 1, i + 10).filter((line) => line !== 'Generate SEO Brief').slice(0, 8);
    if (fields.length === 8) rows.push({ url: lines[i], fields });
  }
  return { rows, rowsVisible: rows.length };
}

/**
 * 一条「原始记录」长什么样是**按报表定的**，不是通用的。
 *
 * 默认那条 URL 启发式只对 organic-positions / organic-pages 成立。关键词类报表的
 * 记录行是关键词，一条 URL 都没有，于是 rawRecordCount 恒为 0 而 parsedRows 是 100，
 * 每次都报一条假的 parser-gap。假警报和漏警报一样有害——看多了就没人再看它。
 */
const DEFAULT_RECORD_LINE = (line) => /^https?:\/\//i.test(line) || /^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(line);

function reportCoverage(report, bodyTexts, parsedRows, spec = {}) {
  const isRecordLine = spec.recordLine || DEFAULT_RECORD_LINE;
  const rawRecordCount = bodyTexts.reduce((sum, text) => sum + String(text).split(/\n+/)
    .map((line) => line.trim()).filter(isRecordLine).length, 0);
  const first = String(bodyTexts[0] || '');
  // headline 始终尝试解析——即使是 crossPageTotal 报告也要把页面自报的数字亮出来，
  // 不然「零静默截断」的保证少了一个可比对的锚点。crossPageTotal 只管下面
  // virtualScrollTruncated 那句话是否成立，不管 pageSelfReportedTotal 要不要填。
  //
  // 引荐域名的表头是「引荐域名\n1 - 100 (~20,034)」——`~` 说明这是近似值（实测约等于
  // 20,001 这个硬上限），不是这个域名真实的引荐域名总数。原样报出去，不做「修正」。
  const headline = report === 'organic-positions'
    ? first.match(/自然搜索排名：\s*\n?\s*([\d,]+)|Organic Search Positions:?\s*\n?\s*([\d,]+)/i)
    : report === 'referring-domains'
      ? first.match(/引荐域名\s*\n?\s*[\d,]+\s*-\s*[\d,]+\s*\(~\s*([\d,]+)\)/)
      : first.match(/所有页面\s*\n\s*([\d,]+)|All Pages\s*\n\s*([\d,]+)/i);
  const headlineTotal = headline ? Number((headline[1] || headline[2]).replace(/,/g, '')) : null;
  return {
    pageSelfReportedTotal: headlineTotal,
    rawRecordCount,
    parsedRows,
    parserAligned: rawRecordCount === parsedRows,
    // 跨页总量（keyword-magic 的「所有关键词」、referring-domains 的 ~20,034）由
    // pagination 字段负责报「翻了几页」，不能让它在单页 rawRecordCount 面前冒充
    // 「这一页被虚拟滚动截断了」——那是两回事，前者是全量，后者是本页渲染不全。
    virtualScrollTruncated: !spec.crossPageTotal && headlineTotal !== null && headlineTotal > rawRecordCount,
  };
}

/**
 * 反链明细表。每行大致是：源页面标题 / 源 URL / 锚文本 / 目标 URL / 属性标签…
 * 属性标签在 Semrush 中文界面里是「nofollow」「sponsored」「ugc」等字样，
 * **没有标签就意味着 follow**——不要去找一个写着「follow」的单元格，没有那个东西。
 */
function parseBacklinksList(lines) {
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^https?:\/\//i.test(lines[i])) continue;
    const win = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 6));
    const rel = [];
    for (const w of win) {
      const m = String(w).toLowerCase();
      if (/\bnofollow\b/.test(m)) rel.push('nofollow');
      if (/\bsponsored\b/.test(m)) rel.push('sponsored');
      if (/\bugc\b/.test(m)) rel.push('ugc');
    }
    let host = null;
    try { host = new URL(lines[i]).host.replace(/^www\./, ''); } catch { /* 非法 URL */ }
    if (!host) continue;
    rows.push({ sourceUrl: lines[i], sourceHost: host, relObserved: [...new Set(rel)] });
  }
  // 按来源域名去重，同域多条只留一条并合并 rel
  const byHost = new Map();
  for (const r of rows) {
    const cur = byHost.get(r.sourceHost);
    if (cur) cur.relObserved = [...new Set([...cur.relObserved, ...r.relObserved])];
    else byHost.set(r.sourceHost, { ...r, });
  }
  return {
    rowsVisible: rows.length,
    byHost: [...byHost.values()],
    note: 'rel 是从行邻域的标签文字读出来的；「没有 nofollow 标签」不等于已核实 follow，'
      + '要写进 ledger 的 rel_verified 必须去源页面看 <a> 的实际属性。',
  };
}

if (flags['self-test']) {
  // Live crystals.com positions renders 5.3K; Number() silently turned it into NaN/null.
  const compactTraffic = parsePositions(['crystals', 'C', '1', '9', '5.3K', '9.54', '40.5K', '50', 'www.crystals.com/']);
  if (compactTraffic.rows[0]?.traffic !== 5300) throw new Error('compact organic traffic regression');
  if (parseCompact('584') !== 584 || parseCompact('—') !== null || parseCompact(null) !== null) {
    throw new Error('organic traffic integer or unknown regression');
  }
  const parsed = parsePages([
    'URL', '流量', '流量变化', '流量 (%)', '关键词', '大型语言模型提示', '引荐域名', '主要关键词', '意图', 'Sortable',
    'example.com/page-a', 'Generate SEO Brief', '12', '+3', '40', '8', '0', '2', 'alpha', 'I',
    'example.com/page-b', 'Generate SEO Brief', '5', '-1', '20', '3', '0', '1', 'beta', 'C',
  ]);
  const coverage = reportCoverage('organic-pages', [
    '所有页面\n2\nexample.com/page-a\nGenerate SEO Brief\n12\n+3\n40\n8\n0\n2\nalpha\nI\nexample.com/page-b\nGenerate SEO Brief\n5\n-1\n20\n3\n0\n1\nbeta\nC',
  ], parsed.rows.length);
  const positions = parsePositions([
    'grid maker', 'I', '1', '8', '10', '1.2', '1.9K', '17', 'example.com/',
    'grid for artists', 'I', '2', '5', '0.8', '390', '9', 'example.com/',
    'cold keyword', 'I', '48', '6', '0', '< 0.01', '40', '不可用', 'example.com/',
  ]);
  // 关键词魔法工具：真实抓到的 15 列，第 1 行有指标、第 3 行是「不可用」。
  // 关键是**按列名取值**——下面把列顺序打乱一次，值必须还落在同样的字段上。
  const magicHeaders = ['选择所有关键词', '关键词', '意图', 'Relevance', '相关性', '搜索量', '趋势', '潜在流量', 'PKD %', 'KD', 'CPC (USD)', '竞争程度', 'SF', '结果', '已更新'];
  const magicRows = [
    // 缩写是页面上的常态：27.1K / 1.1M。直接 Number() 会 NaN，然后把有量的词报成没量。
    ['nonogram', 'nonogram\u200b', 'C', '100', '0', '27.1K', '', '不可用', '不可用', '62', '0.97', '0.01', '7', '1.1M', '3 周'],
    ['nonogram.', 'nonogram.\u200b', 'I\nC', '87', '0', '170', '', '不可用', '不可用', '43', '0.97', '0.01', '3', '95', '3 周'],
    ['blank nonogram', 'blank nonogram\u200b', '', '69', '0', '不可用', '', '不可用', '不可用', '20', '不可用', '0.33', '0', '12', '要更新指标数据，请刷新'],
  ];
  const magic = parseKeywordMagic(['Topic', 'Keywords', 'All', '20.1K'], { headers: magicHeaders, rows: magicRows });
  // 同样的数据，把「搜索量」和「KD」两列对调，按名取值的结果必须一模一样。
  const swap = (arr, a, b) => { const c = [...arr]; [c[a], c[b]] = [c[b], c[a]]; return c; };
  const shuffled = parseKeywordMagic([], { headers: swap(magicHeaders, 5, 9), rows: magicRows.map((r) => swap(r, 5, 9)) });
  const magicOk = magic.rows.length === 3
    && magic.rows[0].volume === 27100 && magic.rows[0].results === 1100000
    && magic.rows[0].kd === 62 && magic.rows[0].intent.join('') === 'C'
    // CPC 是小数，不能走计数列那条四舍五入的路。
    && magic.rows[0].cpc === 0.97 && magic.rows[1].competition === 0.01
    && magic.rows[1].intent.join('') === 'IC'
    // 「不可用」必须是 null，落成 0 会被下游读成「这个词没人搜」。
    && magic.rows[2].volume === null && magic.rows[2].cpc === null && magic.rows[2].competition === 0.33
    && magic.rows[2].intent.length === 0
    && magic.metricsPending === 1 && magic.seedTotal === '20.1K' && magic.missingColumns.length === 0
    && JSON.stringify(shuffled.rows) === JSON.stringify(magic.rows);
  // 列名改了要报出来，而不是悄悄给一列 null。
  const renamed = parseKeywordMagic([], { headers: magicHeaders.map((h) => (h === '搜索量' ? 'Volume' : h)), rows: magicRows });
  const renamedOk = renamed.missingColumns.includes('搜索量') && renamed.rows[0].volume === null;

  const magicRecordLine = (line) => line.endsWith('\u200b') && !line.startsWith('\u200b');
  const magicCoverage = reportCoverage('keyword-magic',
    // 第一行是页面标题，两侧都带零宽空格，不能算成一条记录。
    ['\u200b\u200b关键词魔法工具\u200b\u200b\nnonogram\nnonogram\u200b\nC\n100\nblank nonogram\nblank nonogram\u200b\n69'], 2,
    { recordLine: magicRecordLine, crossPageTotal: true });
  const coverageOk = magicCoverage.rawRecordCount === 2 && magicCoverage.parserAligned
    && magicCoverage.pageSelfReportedTotal === null && !magicCoverage.virtualScrollTruncated;

  // 引荐域名报告：真实抓到的样本行——**换行分隔**（`coacht.com\n知识`），这是 live 实测
  // 的真实 DOM 形状；发现探针曾经把它拼成 `coacht.com/知识` 的斜杠形式，那是探针的假象，
  // 不能只测那一种，所以下面第 3、4 行分别用换行和斜杠各测一次，且指向同一个域名，
  // 用来同时验证「换行也能切」和「两种写法必须聚成同一个 hitCount」。
  const refHeaders = ['AS', 'Root Domain / Category', 'Backlinks', 'Country / IP', 'First Seen', 'Last Seen'];
  const refRows = [
    ['35', 'coacht.com\n知识', '75,501', '172.67.68.23', '2023年7月23日', '10 小时前'],
    ['-', 'placeholder.com', '-', '不可用', '-', '-'],
    ['12', 'dup.com\n游戏', '1,204', '1.2.3.4', '2022年1月1日', '2 天前'],
    ['9', 'dup.com/新闻', '300', '5.6.7.8', '2021年5月5日', '5 天前'],
  ];
  const ref = parseReferringDomains([], { headers: refHeaders, rows: refRows });
  // 同样的数据，把 Backlinks 和 Country / IP 两列对调，按名取值必须一字不差。
  const refShuffled = parseReferringDomains([], {
    headers: swap(refHeaders, 2, 3), rows: refRows.map((r) => swap(r, 2, 3)),
  });
  // 列名改了要报出来，而不是悄悄给一列 null。
  const refRenamed = parseReferringDomains([], {
    headers: refHeaders.map((h) => (h === 'Backlinks' ? 'Links' : h)), rows: refRows,
  });
  const refRollup = buildRollup([{ target: 'example.com', rows: ref.rows }]);
  // buildRollup 现在吃「多次运行」的数组——用两个不同 target、有一个共享域名的场景
  // 证明 hitCount/fromDomains 真的能跨运行聚合，不是摆设。
  const rollupMulti = buildRollup([
    { target: 'a.com', rows: [{ referringDomain: 'shared.com' }, { referringDomain: 'onlyA.com' }] },
    { target: 'b.com', rows: [{ referringDomain: 'shared.com' }] },
  ]);
  const rollupMultiOk = rollupMulti.length === 2
    && rollupMulti[0].referringDomain === 'shared.com' && rollupMulti[0].hitCount === 2
    && rollupMulti[0].fromDomains.sort().join(',') === 'a.com,b.com'
    && rollupMulti[1].referringDomain === 'onlyA.com' && rollupMulti[1].hitCount === 1
    && rollupMulti[1].fromDomains.join(',') === 'a.com';

  // suspectColumns：列名对上了，但这一列的原始文本不是占位符、解析函数却把它全喂成
  // null——这里用一个 parseCompact 认不出来的假格式（"??"）制造这种情况。
  const suspectRows = [
    ['10', 'example1.com', '??', '1.1.1.1', '2020年1月1日', '1 天前'],
    ['20', 'example2.com', '??', '2.2.2.2', '2020年2月2日', '2 天前'],
  ];
  const suspect = parseReferringDomains([], { headers: refHeaders, rows: suspectRows });
  const suspectOk = suspect.suspectColumns.includes('Backlinks') && suspect.missingColumns.length === 0;

  // 部分丢失（回归：把 `27.1K → null` 那类事故重新注入）。10 行里坏 2 行 = 20%，
  // 低于过半阈值——**旧的检测器在这份数据上必须保持沉默**，否则这个用例证明不了
  // 任何新增能力。这正是真实事故的形态：不是整列崩，是一小撮行被静默扔掉。
  const partialRows = Array.from({ length: 10 }, (_, i) => [
    '10', `d${i}.com`, i < 2 ? '一千二百' : '1,204', '1.1.1.1', '2020年1月1日', '1 天前',
  ]);
  const partial = parseReferringDomains([], { headers: refHeaders, rows: partialRows });
  const partialOk = partial.suspectColumns.length === 0            // 旧档：沉默
    && partial.missingColumns.length === 0                          // 列名找得到
    && partial.rows.length === 10                                   // 行数也对得上
    && partial.partialLossColumns.length === 1                      // 新档：报出来
    && partial.partialLossColumns[0].column === 'Backlinks'
    && partial.partialLossColumns[0].lost === 2
    && partial.partialLossColumns[0].of === 10
    && partial.partialLossColumns[0].samples.includes('一千二百');
  // 反面：干净数据必须两档都闭嘴，否则告警会因为噪音被无视。
  const cleanRows = Array.from({ length: 10 }, (_, i) => [
    '10', `d${i}.com`, '1,204', '1.1.1.1', '2020年1月1日', '1 天前',
  ]);
  const cleanParsed = parseReferringDomains([], { headers: refHeaders, rows: cleanRows });
  const cleanOk = cleanParsed.partialLossColumns.length === 0 && cleanParsed.suspectColumns.length === 0;
  // 占位符不进分母：整列「-」不是丢失，是页面明写的「没有这一项」。
  const phRows = Array.from({ length: 4 }, (_, i) => [
    '10', `d${i}.com`, '-', '1.1.1.1', '2020年1月1日', '1 天前',
  ]);
  const phOk = parseReferringDomains([], { headers: refHeaders, rows: phRows }).partialLossColumns.length === 0;

  const refOk = ref.rows.length === 4
    && ref.rows[0].authorityScore === 35 && ref.rows[0].referringDomain === 'coacht.com'
    && ref.rows[0].category === '知识' && ref.rows[0].rootDomainRaw === 'coacht.com\n知识'
    && ref.rows[0].backlinks === 75501 && ref.rows[0].ipCountry === '172.67.68.23'
    && ref.rows[0].firstSeen === '2023年7月23日' && ref.rows[0].lastSeen === '10 小时前'
    // 「-」「不可用」必须落成 null，不能落成 0 或空字符串。
    && ref.rows[1].authorityScore === null && ref.rows[1].backlinks === null
    && ref.rows[1].ipCountry === null && ref.rows[1].firstSeen === null && ref.rows[1].lastSeen === null
    && ref.rows[1].referringDomain === 'placeholder.com' && ref.rows[1].category === null
    // 第 3、4 行分别用换行和斜杠指向同一个域名，两种写法都要正确切出 dup.com。
    && ref.rows[2].referringDomain === 'dup.com' && ref.rows[2].category === '游戏'
    && ref.rows[3].referringDomain === 'dup.com' && ref.rows[3].category === '新闻'
    && ref.missingColumns.length === 0 && ref.suspectColumns.length === 0
    && JSON.stringify(refShuffled.rows) === JSON.stringify(ref.rows)
    && refRenamed.missingColumns.includes('Backlinks') && refRenamed.rows[0].backlinks === null
    // 换行形式和斜杠形式必须聚成同一个 hitCount=2——曾经的 bug 是只认斜杠，
    // 换行形式的 category 恒为 null 导致 referringDomain 带着 `\n知识` 一起，
    // 两条 dup.com 因为字符串不同而永远分不到同一组。
    && refRollup.length === 3 && refRollup[0].referringDomain === 'dup.com' && refRollup[0].hitCount === 2
    && refRollup[0].fromDomains.join(',') === 'example.com'
    && refRollup[1].hitCount === 1 && refRollup[2].hitCount === 1
    && rollupMultiOk && suspectOk && partialOk && cleanOk && phOk;

  // recordLine 曾经把 Country / IP 列的 IPv4（点分、字母数字，字符类和域名一样）
  // 也数成一条记录，导致 raw=200、parsed=100 的假警报（2026-08-27 live 实测，正好 2 倍）。
  // 这里用「AS / 域名 / 分类 / Backlinks / IP / 日期」各自一行模拟真实渲染，
  // 断言 IP 行不会被重复计数，也断言 recordLine 对具体行的判断是对的。
  const refRecordLine = REPORTS['referring-domains'].recordLine;
  const refBodyText = [
    '35', 'coacht.com', '知识', '75,501', '172.67.68.23', '2023年7月23日', '10 小时前',
    '20', 'yahoo.com', '大众媒体', '1,204', '1.2.3.4', '2022年1月1日', '2 天前',
  ].join('\n');
  const refCoverage = reportCoverage('referring-domains', [refBodyText], 2,
    { recordLine: refRecordLine, crossPageTotal: true });
  const refCoverageOk = refCoverage.rawRecordCount === 2 && refCoverage.parserAligned
    && refRecordLine('coacht.com') === true && refRecordLine('172.67.68.23') === false
    && refRecordLine('知识') === false;

  // 集成测试，不是正则测试：喂一个「loadReport 判定 capture 为 null（ready 拒绝了
  // 限额页），但页面上其实有限额文案」的场景走完整条诊断路径。旧版的 quotaOk 只测
  // QUOTA_BLOCKED 这个正则本身，删掉整段生产代码那个测试照样通过——这正是 review
  // 抓到的「测试测不出 bug」。这里改成真正驱动 diagnoseUnrendered，断言从诊断路径
  // 出来的错误消息是对的，而不是断言正则单独能不能匹配。
  // 表体区 0 个非空单元格 + 提示就在表体区里 = 真限额。
  const quotaDiag = await diagnoseUnrendered('referring-domains', 'example.com', 'us', 3,
    async () => ({
      region: { filledCells: 0, text: '已达到每日报告限额', containers: 1 },
      bodyText: 'AS Root Domain / Category 已达到每日报告限额',
    }));
  const genericDiag = await diagnoseUnrendered('referring-domains', 'example.com', 'us', 3,
    async () => ({ region: { filledCells: 0, text: '', containers: 1 }, bodyText: '' }));
  // ⚠️ 方向反了的老判据（整页扫描）会在这一条上误判：帮助气泡里写着这句话，
  // 表体区却有 850 个填好的单元格。必须是 not-quota。
  const quotaElsewhere = await diagnoseUnrendered('referring-domains', 'example.com', 'us', 3,
    async () => ({
      region: { filledCells: 850, text: 'coacht.com 知识 75,501', containers: 1 },
      bodyText: '帮助：账号已达到每日报告限额时会看到提示 coacht.com 知识 75,501',
    }));
  // 表体区没定位到 + 页面上有这句话 = 明确的第三态，既不能说 blocked 也不能装没看见。
  const quotaRegionUnknown = await diagnoseUnrendered('referring-domains', 'example.com', 'us', 3,
    async () => ({ region: null, bodyText: '已达到每日报告限额' }));
  const quotaOk = /每日报告限额/.test(quotaDiag.message) && !/依次排查/.test(quotaDiag.message)
    && /依次排查/.test(genericDiag.message) && !/每日报告限额/.test(genericDiag.message)
    && /依次排查/.test(quotaElsewhere.message) && !/撞到了共享账号/.test(quotaElsewhere.message)
    && /没能定位到表体区/.test(quotaRegionUnknown.message)
    && classifyQuotaBlock({ region: { filledCells: 0, text: '已达到每日报告限额' } }) === 'quota-blocked'
    && classifyQuotaBlock({ region: { filledCells: 850, text: 'x' }, bodyText: '已达到每日报告限额' }) === 'not-quota'
    && classifyQuotaBlock({ region: null, bodyText: '已达到每日报告限额' }) === 'quota-suspected'
    && classifyQuotaBlock({ region: null, bodyText: '什么都没有' }) === 'not-quota';

  // ---- 翻页终止条件：「找不到下一页控件」不是「到最后一页了」 ----
  // 假 evalPage：前 3 次探针返回 absent（分页器还没渲染），第 4 次才 enabled。
  let pagerProbes = 0;
  let fakeClock = 0;
  const fakeSleep = async (ms) => { fakeClock += ms; };
  const lateEval = async (js) => {
    if (js === NEXT_PAGE_JS) {
      pagerProbes += 1;
      return pagerProbes >= 4 ? { control: 'enabled', clicked: true } : { control: 'absent' };
    }
    return { t: '页码：2\n/\n5' };
  };
  const late = await clickNextPage(lateEval, 1,
    { now: () => fakeClock, sleepFn: fakeSleep, probeIntervalMs: 1500 });
  // 没有下限的旧实现在第 1 次探针就 return false 了。
  const lastPage = await clickNextPage(async () => ({ control: 'disabled' }), 1,
    { now: () => fakeClock, sleepFn: fakeSleep });
  let absentClock = 0;
  const neverRenders = await clickNextPage(async () => ({ control: 'absent' }), 1,
    { now: () => absentClock, sleepFn: async (ms) => { absentClock += ms; }, probeIntervalMs: 1500 });
  // 分页器始终不出现 → **verdict 必须是 inconclusive，不许是 last-page**。
  // 只有 disabled（页面产出的信号）配得上 last-page。
  const nextControlOk = late.advanced === true && late.verdict === 'advanced' && pagerProbes === 4
    && lastPage.advanced === false && lastPage.verdict === 'last-page' && /最后一页/.test(lastPage.reason)
    && neverRenders.advanced === false && neverRenders.verdict === 'inconclusive'
    && /这不等于已经到最后一页/.test(neverRenders.reason)
    && absentClock >= PAGER_ABSENT_BUDGET_MS;

  // 点了「下一页」但页码不动，同样是 inconclusive —— 不是「到头了」。
  const stalled = await clickNextPage(
    async (js) => (js === NEXT_PAGE_JS ? { control: 'enabled', clicked: true } : { t: '页码：1\n/\n5' }),
    1,
    { now: () => 0, sleepFn: async () => {}, probeIntervalMs: 1, pageWaits: 2 },
  );
  const stalledOk = stalled.advanced === false && stalled.verdict === 'inconclusive';

  // ---- 翻页水合：第 2 页解析出 0 行。**结构判据，不是时长。** ----
  let hydClock = 0;
  const hydrate = makeNextPageFingerprint({
    prevPrint: JSON.stringify({ rows: [{ referringDomain: 'a.com' }] }),
    prevRowCount: 1,
    now: () => hydClock,
  });
  const emptyPrint = JSON.stringify({ rows: [] });
  const filledPrint = JSON.stringify({ rows: [{ referringDomain: 'b.com' }] });
  // 表在、无行：等再久也不许收下。时钟直接推到远超旧下限的地方，旧的时长实现会在这里翻车。
  const tableLate = hydrate(emptyPrint, { tableCount: 1 }) === null;
  hydClock = PAGE_SETTLE_BUDGET_MS * 100;
  const stillWaitingLongAfter = hydrate(emptyPrint, { tableCount: 1 }) === null;
  // 整页无表：这是页面产出的结构事实，可以收下。
  const noTableConclusive = hydrate(emptyPrint, { tableCount: 0 }) === emptyPrint;
  const hydrationOk = tableLate && stillWaitingLongAfter && noTableConclusive
    && hydrate(JSON.stringify({ rows: [{ referringDomain: 'a.com' }] }), { tableCount: 1 }) === null // 还是上一页
    && hydrate(filledPrint, { tableCount: 1 }) === filledPrint;                                      // 水合完了

  // 2026-08-28 live 核验：这一格不是「域名 + 分类」，是「域名 + 分类？+ 状态徽章 +
  // 徽章的整句 tooltip」拼在一起。下面三行是核验时给出的原文，逐字照抄，不是按摘要
  // 手打的简化版——前三个缺陷都栽在「fixture 是打字打出来的，不是从 DOM 抄的」上，
  // 这是第四次同类问题，必须原样验证。
  const badgeHeaders = refHeaders;
  const badgeRows = [
    ['20', 'ifaxian.net\nNofollow\n此域名没有 Follow 链接，但可能包含具有 Nofollow、Sponsored 和 UGC 属性的链接。', '5', '1.1.1.1', '2020年1月1日', '1 天前'],
    ['15', 'portaportal.com\n知识\nNofollow\n此域名没有 Follow 链接，但可能包含具有 Nofollow、Sponsored 和 UGC 属性的链接。', '10', '2.2.2.2', '2020年2月2日', '2 天前'],
    ['5', 'oregongrassfed.com\n丢失\n如果一个引荐域名不再有指向所分析域名的链接，则被视为丢失。…', '1', '3.3.3.3', '2020年3月3日', '3 天前'],
    // 没见过的徽章词：不能瞎猜切哪一刀，degrade 成把整段原样留在 category 里。
    ['1', 'unknownbadge.com\n某某\nMysteryBadge\n未见过的徽章后面跟着说明文字。', '2', '4.4.4.4', '2020年4月4日', '4 天前'],
  ];
  const badge = parseReferringDomains([], { headers: badgeHeaders, rows: badgeRows });
  const badgeOk = badge.rows.length === 4
    // 没有分类，徽章紧跟在域名后面——徽章文字本身绝不能变成 category。
    && badge.rows[0].referringDomain === 'ifaxian.net' && badge.rows[0].category === null
    // 有分类，徽章和 tooltip 都要被切掉，只留「知识」。
    && badge.rows[1].referringDomain === 'portaportal.com' && badge.rows[1].category === '知识'
    // 「丢失」本身也是一种徽章词，不是分类——同样要落成 null。
    && badge.rows[2].referringDomain === 'oregongrassfed.com' && badge.rows[2].category === null
    // 未知徽章：整段保留，不猜测切哪一刀。
    && badge.rows[3].referringDomain === 'unknownbadge.com'
    && badge.rows[3].category === '某某\nMysteryBadge\n未见过的徽章后面跟着说明文字。';

  // 表头「引荐域名\n1 - 100 (~20,034)」是跨 201 页的近似总量（`~` 就是近似的意思，
  // 实测约等于 20,001 那个硬上限），reportCoverage 以前只认 organic-positions /
  // organic-pages 两种表头措辞，这种表头会落空成 null，削弱了「零静默截断」的比对锚点。
  // 这里验证：数字要原样报出去（不做「修正」），但 crossPageTotal 报告不能被这个数字
  // 误判成「本页被虚拟滚动截断了」——那是 pagination 字段的职责。
  const refHeadlineBody = `引荐域名\n1 - 100 (~20,034)\n${refBodyText}`;
  const refHeadlineCoverage = reportCoverage('referring-domains', [refHeadlineBody], 2,
    { recordLine: refRecordLine, crossPageTotal: true });
  const refHeadlineOk = refHeadlineCoverage.pageSelfReportedTotal === 20034
    && refHeadlineCoverage.rawRecordCount === 2 && refHeadlineCoverage.parserAligned
    && refHeadlineCoverage.virtualScrollTruncated === false;

  const pagerZh = readPageInfo('行\n上一页\n下一页\n页码：\n/\n1,848\n页码： 3');
  const pagerEn = readPageInfo('rows\nPrev\nNext\nPage:\nof\n201\nPage: 1');
  const pagerNone = readPageInfo('just a table with no pager');
  const pagerOk = pagerZh.total === 1848 && pagerZh.current === 3
    && pagerEn.total === 201 && pagerEn.current === 1
    && pagerNone.total === 1;

  if (!pagerOk || !coverageOk || parsed.rows.length !== 2 || parsed.rows[0].fields.join('|') !== '12|+3|40|8|0|2|alpha|I'
      || parsed.rows[1].fields.join('|') !== '5|-1|20|3|0|1|beta|C'
      || !coverage.parserAligned || coverage.virtualScrollTruncated || coverage.pageSelfReportedTotal !== 2
      || positions.rows.length !== 3 || positions.rows[1].serpFeatures !== null || positions.rows[2].kd !== null
      || !magicOk || !renamedOk || !refOk || !refCoverageOk || !quotaOk || !badgeOk || !refHeadlineOk
      || !nextControlOk || !stalledOk || !hydrationOk) {
    throw new Error(`semrush-report self-test failed: ${JSON.stringify({ parsed, coverage, positions, magic, renamed, ref, refRollup, refCoverage, badge, refHeadlineCoverage, pagerZh, pagerEn })}`);
  }
  console.log('semrush-report self-test: PASS');
  process.exit(0);
}

// ---------- 主流程 ----------

let output;
let launched;
try {
  const tool = launched = await ensureTool();
  const url = `${APP_ORIGIN}${spec.path(target, db)}`;
  // **分段滚动，默认关闭。**
  //
  // 为什么默认关：2026-08-29 实测这几条路由 `body.scrollHeight === window.innerHeight`
  // （772）、`scrollY` 滚 8 次没动过、350 秒内所有数字冻结——**但那是因为整个报表
  // 模块渲染成了空白**，一个什么都没渲染的页面当然没有首屏之下的内容。所以那次观测
  // 既不能证明「这个站需要滚动」，也不能证明「不需要」，它什么都没证明。在这种情况下
  // 默认开启就是把一个**没有测过的假设**写进默认行为——正是把我们送到今天这一步的
  // 那个动作。默认关、一个 flag 就能开，并且探针每一轮都回报
  // `scrollContainers` / `windowNeverMoved`，让下一次实盘用数据来定这个默认值。
  //
  // ⚠️ 另一重观测限度：在一个把外壳挂在 44 个 shadow root 里的页面上，真正的滚动
  // 容器**很可能不是 window**。「滚 window 8 次 scrollY 没动」和「没有可滚的内容」
  // 在读数上一模一样。见 lib-deep-dom.mjs 的 `deepScrollContainers()`。
  const scrollSegments = flags['scroll-segments'] !== undefined;
  const loaded = await loadReport(url, spec, {
    scrollSegments,
    scrollPauseMs: Number(flags['scroll-pause'] || 1.5) * 1000,
    maxScrollSegments: Number(flags['scroll-segments'] || 12),
    settle: Number(flags.settle || 10),
    timeout: Number(flags.timeout || 120),
    retries: Number(flags.retries || 3),
    intervalMs: Number(flags['stable-interval'] || 3) * 1000,
  });
  if (!loaded.capture) {
    // `!loaded.capture` 恰恰是限额页最常见的落点（见 diagnoseUnrendered 上方注释）——
    // 这里必须现场再读一次 body 去分辨「真的没渲染」和「渲染了但 ready 正确拒绝了
    // 限额页」，不能指望 loaded.capture 里已经有证据。
    // **先取证后死**：诊断之外再落一对双证人（穿透 census + 截图），把 REGION_PROBE
    // 的读数也写盘——错误消息只带结论文案的形态是这轮重构要杀的。
    const scene = await captureScene({
      session, outDir: evidenceDir, evalPage, tag: 'never-rendered',
      note: `semrush-report ${name} ${target}: loaded.capture is null`,
    });
    const diagnosed = await diagnoseUnrendered(name, target, db, flags.retries || 3,
      () => evalPage(REGION_PROBE_JS));
    diagnosed.message += ` ${sceneSummaryLine(scene)}`;
    throw diagnosed;
  }
  if (!loaded.stable) {
    // **读到了但一直在变，只能算没测成。** 写下一个还在水合的值，它不会被任何人发现是错的。
    const scene = await captureScene({
      session, outDir: evidenceDir, evalPage, tag: 'values-never-settled',
      note: `semrush-report ${name} ${target}: stable=false after ${loaded.reads} reads`,
    });
    throw new Error(
      `Semrush ${name} for "${target}" 渲染了，但数值在 ${loaded.reads} 次读取里始终没稳定下来——` +
      `屏幕上的还是占位值（典型症状：Authority Score 0、表 0 行）。` +
      `重跑，或调大 --timeout / --stable-interval。 ${sceneSummaryLine(scene)}`,
    );
  }
  const cap = loaded.capture;
  const parsed = loaded.parsed;
  const rawPages = [cap.bodyText];
  const pageInfo = readPageInfo(cap.bodyText);
  let pagesRead = 1;
  let stoppedBecause = null;
  // 「停下来的原因」和「停下来这件事说明了什么」是两回事。`last-page` 是页面产出的
  // 结论，其余一律是 `inconclusive`：我们不知道后面还有没有，只知道没读到。
  let paginationVerdict = null;

  // **不允许静默截断**（本 Skill 的明文规则）：要么把页翻完，要么把丢掉的量报出来。
  if (spec.paginated && pageInfo.total > 1) {
    if (flags['all-pages']) {
      const maxPages = Number(flags['max-pages'] || 20);
      const seen = new Set((parsed.rows || []).map(rowKey));
      let prevPrint = JSON.stringify(parsed);
      while (pagesRead < pageInfo.total) {
        if (pagesRead >= maxPages) {
          stoppedBecause = `max-pages=${maxPages}`;
          paginationVerdict = 'inconclusive';
          break;
        }
        const advance = await clickNextPage(evalPage, pagesRead);
        if (!advance.advanced) {
          stoppedBecause = advance.reason;
          paginationVerdict = advance.verdict;
          break;
        }
        pagesRead += 1;
        const pageFingerprint = makeNextPageFingerprint({
          prevPrint, prevRowCount: (parsed.rows || []).length,
        });
        // **页码变了不等于表体换完了。** clickNextPage 只等到分页指示器前进，
        // 此时表格可能还在渲染上一页的行——直接读会把同一页读两遍，
        // 而 rowKey 去重会把它悄悄吞掉，表现为「翻了 5 页只多出 12 行」。
        // 所以这里同样要等到解析结果稳定，**并且与上一页不同**。
        const nextPage = await captureStable({
          // tableCount 是结构判据的原料：**表在但无行** 和 **整页无表** 是两件不同的事，
          // 只有后者能支持「这一页就是空的」。见 makeNextPageFingerprint 顶部的表。
          // 同一处穿透修复的翻页版本。见上面那段注释。
          read: () => evalPage(`(() => {
            ${DEEP_DOM_JS}
            const root = document.body || document.documentElement;
            return JSON.stringify({
              bodyText: deepTextSample(root, { maxChars: 60000 }),
              tableCount: deepQueryAll(root, 'table,[role="grid"]').length,
              deepProbe: true,
              lightDom: { textLength: (document.body?.innerText || '').length, tableCount: document.querySelectorAll('table,[role="grid"]').length },
              cells: ${spec.cells || 'null'},
            });
          })()`),
          fingerprint: (c) => {
            let print = null;
            try { print = JSON.stringify(spec.parse(String(c?.bodyText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean), c?.cells)); } catch { return null; }
            // 还是上一页的内容 → 继续等；解析出 0 行而表还在 → 也继续等（不看时长）。
            return pageFingerprint(print, { tableCount: c?.tableCount });
          },
          timeoutMs: Number(flags['page-timeout'] || 30) * 1000,
          intervalMs: 1500,
        });
        if (!nextPage.stable) {
          // 同一个坑，翻页版本：nextPage.capture 在这里几乎总是 null——原因和
          // diagnoseUnrendered 上面写的一样，fingerprint 只在 parse 成功且与上一页
          // 不同时才非 null，captureStable 才会把 capture 记进 last。撞限额撞在
          // 第 N 页和「这一页迟迟没渲染」在 nextPage.capture 上长得一模一样，
          // 现场再读一次 body 来分辨——这个读取很便宜，值得做。
          let freshProbe = null;
          try { freshProbe = await evalPage(REGION_PROBE_JS); } catch { /* 读不到就按普通超时处理 */ }
          pagesRead -= 1;
          // 整页搜「限额」在这里同样不合法（见 classifyQuotaBlock）——绑表体区。
          const quota = classifyQuotaBlock(freshProbe);
          // 三种都是「没读成」，没有一种是「后面没有了」。
          paginationVerdict = 'inconclusive';
          stoppedBecause = quota === 'quota-blocked'
            ? `每日报告限额在第 ${pagesRead + 1} 页触发（表体区 0 个非空单元格且提示在表体区内）——换 --node 重跑，不是网络超时`
            : quota === 'quota-suspected'
              ? `第 ${pagesRead + 1} 页没渲染完，页面上有限额字样但表体区没定位到——先按限额处理（换 --node）`
              : `page ${pagesRead + 1} never settled`;
          break;
        }
        rawPages.push(nextPage.capture.bodyText);
        prevPrint = nextPage.fingerprint;
        for (const r of JSON.parse(nextPage.fingerprint).rows || []) {
          const k = rowKey(r);
          if (!seen.has(k)) { seen.add(k); parsed.rows.push(r); }
        }
      }
      if (pagesRead < pageInfo.total) {
        // 少读了页就必须说出来。少了多少行没人知道，但少了几页是确定的。
        console.error(
          `[truncated] ${name} 共 ${pageInfo.total} 页，只读到第 ${pagesRead} 页（${stoppedBecause}）。` +
          `当前 ${(parsed.rows || []).length} 行不是全量。`,
        );
      }
    } else {
      stoppedBecause = 'no --all-pages';
      paginationVerdict = 'inconclusive';
      console.error(
        `[truncated] ${name} 共 ${pageInfo.total} 页，本次只读了第 1 页（${(parsed.rows || []).length} 行）。` +
        `要全量加 --all-pages。`,
      );
    }
  }

  // --rollup 目前只喂本次运行这一组 { target, rows } 进去；见 buildRollup 注释——
  // 要跨域聚合，调用方把多份 JSON 输出的 { target, rows } 拼进同一个数组再调用它。
  // 对没有 referringDomain 字段的报告（比如 keyword-magic）这里安全地什么都不做，
  // 聚合结果是空数组。
  const rollup = flags.rollup && Array.isArray(parsed.rows) && parsed.rows.length
    ? buildRollup([{ target, rows: parsed.rows }]) : null;

  const coverage = spec.paginated ? reportCoverage(name, rawPages, (parsed.rows || []).length, spec) : null;
  if (coverage && !coverage.parserAligned) {
    console.error(`[parser-gap] ${name}: raw record lines=${coverage.rawRecordCount}, parsed rows=${coverage.parsedRows}.`);
  }
  if (coverage?.virtualScrollTruncated) {
    console.error(`[truncated] ${name}: page reports ${coverage.pageSelfReportedTotal} records, raw captures contain ${coverage.rawRecordCount}.`);
  }

  // 解析质量必须**说出来**，不能只放进 JSON 等人去翻。missingColumns 是「列没了」，
  // partialLossColumns 是「列在、值被静默丢了」——后者才是真实事故的形态，
  // 而它以前在这个文件里连一条 console 都没有。
  for (const col of parsed.missingColumns || []) {
    console.error(`[missing-column] ${name}: 表里找不到「${col}」列，该字段本次全为 null。`);
  }
  for (const col of parsed.suspectColumns || []) {
    console.error(`[suspect-column] ${name}: 「${col}」列过半的行解析成 null，这一列基本报废。`);
  }
  for (const loss of parsed.partialLossColumns || []) {
    console.error(
      `[partial-loss] ${name}: 「${loss.column}」列有 ${loss.lost}/${loss.of} 行解析成 null，` +
      `原文样本：${loss.samples.map((v) => JSON.stringify(v)).join(', ')}。`,
    );
  }

  output = {
    version: 1,
    source: 'Semrush via authenticated Tools Share browser session',
    // 这句只管**自然搜索**口径。Semrush 另有一个和 Similarweb 同口径的总访问量，
    // 在 Traffic & Market（.Trends）里，2026-08-28 实测两家相差 2.4%——见
    // rankup/references/provider-capabilities.md「跨平台哪些数能并列」。
    note: 'Semrush 的这个流量是自然搜索估算，与 Similarweb 的总访问量不同口径，不要并列。'
        + '要和 Similarweb 对得上的总访问量，去 Traffic & Market（/analytics/traffic/traffic-overview/），'
        + '那个口径实测与 Similarweb 相差 2.4%。',
    retrievedAt: new Date().toISOString(),
    report: name,
    target,
    db: db || null,
    session,
    sessionReused: tool.reused,
    title: cap.title,
    subscription: tool.reused ? null : {
      expiry: tool.state.expiry, daysLeft: tool.state.daysLeft,
      quotas: tool.state.quotas, warning: expiryWarning(tool.state),
    },
    // complete=false 时 stoppedBecause 必须有值——「少了」和「为什么少」要一起交付。
    // `verdict` 是给机器读的那一半：`complete` = 页数读满了；`last-page` = 页面自己
    // 产出的禁用态说到头了；`inconclusive` = 我们不知道后面还有没有，**别当成读完了**。
    // 见 <law-ref id="readiness-must-bind-to-this-query"/>：负向判定必须绑到页面产出的
    // 完成信号，绑不到就只能是 inconclusive。
    pagination: spec.paginated
      ? {
        pages: pageInfo.total,
        pagesRead,
        complete: pagesRead >= pageInfo.total,
        verdict: pagesRead >= pageInfo.total ? 'complete' : (paginationVerdict || 'inconclusive'),
        stoppedBecause,
      }
      : null,
    coverage,
    rollup,
    reads: loaded.reads,
    parsed,
    rawText: cap.bodyText.slice(0, 20000),
    rawPages: spec.paginated ? rawPages : null,
  };
} catch (error) {
  // **先取证后关**：`status:'unavailable'` 的输出必须带证据路径。上面两个专属
  // 分支已各拍过一对；这里兜住其余异常（导航失败、翻页超时、eval 崩）。
  // captureScene 永不 throw，launch 都没成时它把失败原因记进 record 本身。
  const scene = launched
    ? await captureScene({
      session, outDir: evidenceDir, evalPage, tag: 'unavailable',
      note: `semrush-report ${name} ${target}: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    })
    : null;
  output = {
    version: 1, source: 'Semrush via authenticated Tools Share browser session',
    retrievedAt: new Date().toISOString(), report: name, target, db: db || null, session,
    // 失败输出带现场：census + 截图的落盘路径（拍不到时是错误说明）。
    evidence: scene,
    // **错误消息必须过 redactSecrets。** opencli 失败时会把带 __gmitm 令牌的会话 URL
    // 打进 stderr，那段文本会一路进 output、进 --out 文件、进日志。
    status: 'unavailable', error: { code: 'report_failed', message: redactSecrets(error.message) },
  };
} finally {
  await launched?.releaseBrowserLocks?.();
}

if (typeof flags.out === 'string') await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
printJson(output);
if (output.status === 'unavailable') process.exitCode = 1;
