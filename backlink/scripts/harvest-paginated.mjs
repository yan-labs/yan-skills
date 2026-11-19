#!/usr/bin/env node
/**
 * harvest-paginated.mjs — 大表**翻页**批采：每页一份证据、断点续跑、
 * 保守上限、行数自检。判断照旧不归它（scripts-collect-ai-judges）。
 *
 *   # 先摸清这张表怎么分页（约 2 次页面加载，不采数据）
 *   node scripts/harvest-paginated.mjs --url <url> --out <dir> --probe
 *
 *   # 采：默认只采 5 页，绝不默认全量
 *   node scripts/harvest-paginated.mjs --url <url> --out <dir> \
 *     [--max-pages 5] [--mode head|stratified] [--offset 0] \
 *     [--pager auto|url|client] [--page-param page] \
 *     [--shot-every 5] [--page-budget 90] [--budget 240] [--max-next-walk 25] \
 *     [--rows-per-page 50] [--accept-redirect <path,path>]
 *
 *   # 中断后原样再跑一次同一条命令即可续跑（读 <dir>/state.json，已采的页不重采）
 *
 * ──────────────────────────────────────────────────────────────────────
 * 它解决的那个问题
 * ──────────────────────────────────────────────────────────────────────
 * `ground-truth.mjs` 一次只看**第 1 页**：Semrush Traffic Analytics 的
 * top-pages 有 1,430 页、subfolders 2,611 页、sources-destinations 930 页，
 * 于是「850 个非空单元格」实际只是总量的 0.07%。这个脚本把翻页那一维补上。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 四条硬纪律（每一条都对应一次实测事故，出处见 references/pagination-harvest.md）
 * ──────────────────────────────────────────────────────────────────────
 *
 * 1. **绝不默认全量。** `--max-pages` 默认 5，硬上限 200。计划被截断时
 *    stderr 与 manifest 里都必须出现「本轮只采了 N/M 页」，不许静默抽样。
 *    1,430 页按实测节奏是**小时级**任务，还要一直占着配额站的机器级锁——
 *    那种规模应当抽样，不该一口气跑。
 * 2. **每页都要有证据。** 每页固定落一份 census（DOM 证人）；截图按
 *    `--shot-every` 抽（默认每 5 页一张，首页与末页必留），抽样规则写进 manifest。
 *    「只留一个合并结果」= 出了错没有现场。
 * 3. **翻页成功要绑内容，不绑页码，而且「内容」必须是数据。** 点了 Next、页码
 *    变成 2、表格没换——实测就这么抓回 1200 行只有 90 个唯一源（harvest.md）。
 *    反过来，点完 Next 表体会被整个卸掉重建，那一瞬取行会降级抓到导航栏，
 *    指纹也「变了」也「稳定」——2026-08-30 首次实盘就这么把导航栏存成了第 2 页。
 *    所以每页就绪要四条同时成立：filledCells>0、取行策略与第 1 页一致、
 *    指纹与上一页不同、连续两读一致。凑不齐就记失败，不存那一页。
 * 4. **对不上就打标，不下判断。** 合并后行数与页面自报总数不符 →
 *    manifest 里 `rowCountMismatch: true` + 差在哪，退出码仍是 0（采集本身完成了），
 *    「是丢行还是口径不同」由 AI 拿证据判。
 *
 * 退出码：0 = 本轮采集完成（含抽样封顶、含 rowCountMismatch）；
 *         2 = 一页都没采到（首屏始终未就绪 / 分页器认不出）；
 *         3 = 落点被接管、会话故障等失败（现场已落盘）。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  batchBrowser, closeSession, firstJson, opencli, parseFlags, quotaSiteOf, required,
  sessionForUrl, showHelpIfRequested, sleepStep,
} from './opencli-core.mjs';
import { DEEP_DOM_JS } from './lib-deep-dom.mjs';
import { acquireToolsShareBrowserLocks, redactSecrets } from './lib-tools-share.mjs';
import { isReady, sanitizeUrlString, scrubEvalPayload, isHijacked, parseAcceptRedirects } from './ground-truth.mjs';
import {
  DEFAULT_MAX_PAGES, applyPageResult, classifyPagination, clusterCellsByY, dedupeRows,
  donePages, findUrlPageParam, loadCheckpoint, newCheckpoint, pageFingerprint,
  parsePager, planPages, verifyRowCount,
} from './lib-pagination.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 首屏就绪轮询间隔，沿用 ground-truth 的实测值（数据 61–76 秒落地）。 */
const POLL_INTERVAL_MS = 8000;
/** 翻页后的重读间隔。翻页是客户端重渲染，比冷启动快一个量级。 */
const PAGE_POLL_MS = 2000;

/* ------------------------------------------------------------------ *
 * 页面侧表达式
 * ------------------------------------------------------------------ */

/**
 * 读一页：分页器文本 + 行。
 *
 * 取行的三级降级，**顺序不能反**：
 *   1. `[role=row]` —— 现代数据网格的标准形状，最可靠；
 *   2. `[role=gridcell]` 按 Y 聚类 —— 网格没标 row 时（`clusterCellsByY`，
 *      与离线测试跑的是同一份源码）；
 *   3. 滚动容器内所有叶子节点按 Y 聚类 —— 最后的兜底。
 *
 * **URL 列必须从属性读**（harvest.md 实测：长 URL 在单元格里换行成两行 + 省略号，
 * 文本是截断的，而且换行让该格跨两个 Y 分桶、整行被静默丢掉；100 行只回收到 18 行
 * 且毫无报错）。所以每行额外带一个首列 `__href`：该行第一个 `a[href]` 或
 * `[title]` 的**完整**属性值，取不到就是空串。
 */
export const PAGE_READ_EXPR = `(() => {
  ${DEEP_DOM_JS}
  const cluster = ${clusterCellsByY.toString()};
  const root = document.body || document.documentElement;
  const text = deepTextSample(root, { maxChars: 40000 });
  const SKIP_TAGS = /^(STYLE|SCRIPT|NOSCRIPT|TEMPLATE)$/;

  const linkOf = (el) => {
    if (!el || !el.querySelectorAll) return '';
    for (const a of el.querySelectorAll('a[href],[title]')) {
      const v = a.getAttribute('title') || a.getAttribute('href') || '';
      if (v && v.length > 3) return v;
    }
    return '';
  };
  const cellText = (el) => String(el.innerText != null ? el.innerText : (el.textContent || '')).trim().replace(/\\s+/g, ' ');

  // **空行必须丢掉。** 2026-08-30 实盘：外壳里的 6 个 role=row 全是空格子
  // （filledCells=0 的加载态），把它们当行会让「就绪」判据当场作废。
  const nonEmpty = (row) => row.some((cell, index) => index > 0 && cell !== '');

  let rows = [];
  let strategy = 'none';
  const rowEls = deepQueryAll(root, '[role=row]');
  if (rowEls.length > 1) {
    strategy = 'role-row';
    for (const el of rowEls) {
      const cells = [...el.querySelectorAll('[role=gridcell],[role=cell],td')];
      if (!cells.length) continue;              // 表头行（只有 columnheader）跳过
      const row = [linkOf(el), ...cells.map(cellText)];
      if (nonEmpty(row)) rows.push(row);
    }
  }
  if (!rows.length) {
    const cellEls = deepQueryAll(root, '[role=gridcell],[role=cell],td');
    if (cellEls.length) {
      strategy = 'gridcell-ycluster';
      const pts = [];
      for (const el of cellEls) {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) continue;
        const t = cellText(el);
        const href = linkOf(el);
        pts.push({ x: r.left, y: r.top + r.height / 2, t: href && href.length > t.length ? href : t });
      }
      rows = cluster(pts, { tolerance: 6, minCells: 2 }).map((row) => ['', ...row.cells]);
    }
  }
  if (!rows.length) {
    strategy = 'leaf-ycluster';
    const pts = [];
    for (const el of deepQueryAll(root, '*')) {
      if (el.children && el.children.length) continue;
      if (SKIP_TAGS.test(String(el.tagName || ''))) continue;
      const t = cellText(el);
      if (!t || t.length > 90) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      pts.push({ x: r.left, y: r.top + r.height / 2, t });
    }
    rows = cluster(pts, { tolerance: 6, minCells: 5 }).map((row) => ['', ...row.cells]);
  }

  // ── 分页器文本 ────────────────────────────────────────────────────────
  // **不能用「深层文本的尾部」。** 2026-08-30 实盘：deepTextSample 逐 root 取
  // innerText，取不到就退 textContent —— 于是 style 标签里的 CSS 全进了样本，
  // 40 万字符的尾部 3000 字全是 semi-popover-wrapper 之类的样式规则，一个分页器字样都没有。
  // 分页器在页面**底部**这件事，在「按 root 顺序拼接的文本」里根本不成立。
  // 改成定点找：先找分页器关键词的叶子，再往上爬到一个文本量还小的祖先，取它的文本。
  const PAGER_WORD = /^(prev|previous|next|page:?|of|下一页|上一页|第|共|页)$/i;
  const chunks = [];
  for (const el of deepQueryAll(root, '*')) {
    if (el.children && el.children.length) continue;
    if (SKIP_TAGS.test(String(el.tagName || ''))) continue;
    const t = cellText(el);
    if (!t || t.length > 24) continue;
    if (!PAGER_WORD.test(t) && !/^(page\\s*\\d|第\\s*\\d)/i.test(t)) continue;
    let best = null;
    let node = el;
    for (let k = 0; k < 5 && node.parentElement; k += 1) {
      node = node.parentElement;
      const text = String(node.innerText != null ? node.innerText : (node.textContent || '')).replace(/\\s+/g, ' ').trim();
      if (text && text.length <= 300) best = text; else break;
    }
    if (best && !chunks.includes(best)) chunks.push(best);
    if (chunks.length >= 12) break;
  }

  return JSON.stringify({
    when: new Date().toISOString(),
    href: location.pathname + location.search + location.hash,
    title: document.title,
    strategy,
    rows,
    census: readDomCensus(document, { sampleChars: 4000 }),
    pagerText: chunks.join('\\n').slice(0, 2000),
    headText: text.slice(0, 1500),
  });
})()`;

/**
 * 客户端分页的控件操作。**两条路，能走 Next 就不用输入框**：
 *
 *   - `next`：找文本恰好是 Next / 下一页 / › 的可点元素并点它。顺序采页只需要它，
 *     比输入框稳得多（Semrush 上 `opencli click --text` 会多重匹配，所以这里自己
 *     按 textContent 精确匹配 + 爬到可点祖先，见 harvest.md「导航的三个坑」）。
 *   - `jump`：分页器里的页码输入框。填值用 `focus() + execCommand('insertText')`，
 *     提交用**合成 KeyboardEvent Enter 三连（keyCode 13）**——受控输入直接改
 *     `value` React 状态不更新（harvest.md：`filled:true, verified:true` 是假成功信号），
 *     CDP 真键在 Semrush 的列表编辑器上实测也不生效（见 traffic-analytics/OVERVIEW.md）。
 *
 * 两条都返回**诊断对象**而不是布尔：找不到控件时要留下「找到了哪些候选」，
 * 否则失败现场是一片空白。
 */
export function buildPagerActionExpr(action, page = null) {
  return `(() => {
  ${DEEP_DOM_JS}
  const root = document.body || document.documentElement;
  const txt = (el) => String(el.textContent || '').trim();
  const clickable = (el) => { let n = el; for (let k = 0; k < 3 && n; k += 1) { if (n.tagName === 'BUTTON' || n.tagName === 'A' || n.getAttribute('role') === 'button' || n.onclick) return n; n = n.parentElement; } return el; };

  if (${JSON.stringify(action)} === 'next') {
    const wanted = ['Next', '下一页', '›', '>'];
    const leaves = deepQueryAll(root, '*').filter((el) => !el.children.length && wanted.includes(txt(el)));
    const candidates = leaves.map((el) => ({ text: txt(el), disabled: !!(el.closest && el.closest('[disabled],[aria-disabled="true"]')) }));
    const pick = leaves.find((el) => !(el.closest && el.closest('[disabled],[aria-disabled="true"]')));
    if (!pick) return JSON.stringify({ ok: false, action: 'next', reason: 'no enabled Next control', candidates });
    clickable(pick).click();
    return JSON.stringify({ ok: true, action: 'next', candidates });
  }

  const inputs = deepQueryAll(root, 'input').filter((el) => {
    const type = String(el.getAttribute('type') || 'text').toLowerCase();
    if (['hidden', 'checkbox', 'radio', 'file', 'submit'].includes(type)) return false;
    const near = String((el.closest && el.closest('*') && el.parentElement && el.parentElement.textContent) || '');
    const label = String(el.getAttribute('aria-label') || el.getAttribute('name') || el.getAttribute('placeholder') || '');
    return /page|页/i.test(label) || /\\bPage\\b|页/.test(near);
  });
  const diag = inputs.map((el) => ({ label: String(el.getAttribute('aria-label') || el.getAttribute('name') || ''), value: String(el.value || '') }));
  const input = inputs[0];
  if (!input) return JSON.stringify({ ok: false, action: 'jump', reason: 'no page input found', candidates: diag });
  input.focus();
  try { input.select(); } catch (e) { /* 有的实现不支持 select */ }
  try { document.execCommand('insertText', false, String(${JSON.stringify(String(page ?? ''))})); } catch (e) { input.value = String(${JSON.stringify(String(page ?? ''))}); }
  for (const type of ['keydown', 'keypress', 'keyup']) {
    input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true }));
  }
  return JSON.stringify({ ok: true, action: 'jump', page: ${JSON.stringify(page)}, valueAfter: String(input.value || ''), candidates: diag });
})()`;
}

/* ------------------------------------------------------------------ *
 * manifest
 * ------------------------------------------------------------------ */

export function buildPaginatedManifest({
  url, session, startedAt, finishedAt, mechanism, pager, plan, pages, failures,
  rowsPerPage, totalPages, shotEvery, shotPages, audit, stopReason, notice,
  maxPages, mode, offset, maxNextWalk = null, resumedFrom, lockHeld, lockWaitMs, hijacked = false,
  hijackedHref = null, finalHref = null, error = null, probe = null,
}) {
  return {
    schemaVersion: 1,
    tool: 'harvest-paginated',
    url: sanitizeUrlString(url),
    session,
    startedAt,
    finishedAt,
    lockHeld,
    lockWaitMs,
    hijacked,
    hijackedHref,
    finalHref,
    // 分页机制判定（形状分类 + 分页器读数）。probe 模式下 probe 字段有 URL 参数实证。
    mechanism,
    pager,
    probe,
    // 本轮计划与它是否是抽样。notice 是「no silent caps」那句话本身。
    mode,
    offset,
    maxPages,
    maxNextWalk,
    plannedPages: plan?.pages ?? [],
    capped: plan?.capped ?? true,
    coverage: plan?.coverage ?? 'partial',
    notice,
    // 续跑：这一轮开跑前 state.json 里已经有多少页。
    resumedFrom,
    totalPages,
    rowsPerPage,
    // 每页证据。截图是抽样的，规则记在这里（shotEvery + 实际留了哪些页）。
    shotEvery,
    shotPages,
    pages,
    failures,
    // 行数自检的**原始回报**，不含结论。rowCountMismatch=true 只是「对不上」。
    audit,
    rowCountMismatch: Boolean(audit?.rowCountMismatch),
    stopReason,
    error,
  };
}

/* ------------------------------------------------------------------ *
 * 落盘
 * ------------------------------------------------------------------ */

function writePayload(outDir, file, value) {
  writeFileSync(path.join(outDir, file), `${scrubEvalPayload(JSON.stringify(value, null, 2))}\n`);
}

function writeText(outDir, file, text) {
  writeFileSync(path.join(outDir, file), scrubEvalPayload(String(text)));
}

/**
 * 检查点写盘。**先写临时文件再 rename**：中途被杀不会留下半个 JSON，
 * 而半个 JSON 会让下一轮 `loadCheckpoint` 返回 null、于是从头重采
 * ——那正是 harvest.md 里「失败的抓取覆盖了更值钱的东西」那一类事故。
 */
function saveCheckpoint(outDir, state) {
  const tmp = path.join(outDir, 'state.json.tmp');
  writeFileSync(tmp, `${scrubEvalPayload(JSON.stringify(state, null, 2))}\n`);
  renameSync(tmp, path.join(outDir, 'state.json'));
}

function readCheckpoint(outDir, url) {
  const file = path.join(outDir, 'state.json');
  if (!existsSync(file)) return null;
  try { return loadCheckpoint(readFileSync(file, 'utf8'), { url }); } catch { return null; }
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);
  const url = required(flags, 'url');
  const outDir = path.resolve(required(flags, 'out'));
  const maxPages = Math.max(1, Number(flags['max-pages']) || DEFAULT_MAX_PAGES);
  const mode = flags.mode === 'stratified' ? 'stratified' : 'head';
  const offset = Math.max(0, Number(flags.offset) || 0);
  const pagerMode = ['url', 'client'].includes(flags.pager) ? flags.pager : 'auto';
  const pageParam = typeof flags['page-param'] === 'string' ? flags['page-param'] : 'page';
  const shotEvery = Math.max(1, Number(flags['shot-every']) || 5);
  // 客户端分页跳页不可靠时，连点 Next 走过去的最大步数。走 25 步已经是分钟级，
  // 再大就该换 --mode head 分多轮续跑，而不是让一个进程握着锁走半小时。
  const maxNextWalk = Math.max(1, Number(flags['max-next-walk']) || 25);
  const rowsPerPageFlag = Number(flags['rows-per-page']) > 0 ? Number(flags['rows-per-page']) : null;
  const readyBudgetMs = Math.max(1, Number(flags.budget) || 240) * 1000;
  const pageBudgetMs = Math.max(1, Number(flags['page-budget']) || 90) * 1000;
  const acceptRedirects = parseAcceptRedirects(flags['accept-redirect']);
  const probeOnly = Boolean(flags.probe);
  mkdirSync(outDir, { recursive: true });

  const session = sessionForUrl(url, 'harvest-page');
  const windowMode = 'dedicated';   // hidden 出生的标签页永不水合
  const targetUrl = new URL(url);
  const target = targetUrl.hash || targetUrl.pathname;

  // 整轮持机器级工具锁（one-collector-per-quota-tool）。翻页采集比 ground-truth
  // 还长，锁的必要性只增不减。
  const quotaSite = quotaSiteOf(url);
  let locks = null;
  let lockWaitMs = null;
  if (quotaSite) {
    const lockStart = Date.now();
    locks = await acquireToolsShareBrowserLocks(session, quotaSite.key);
    lockWaitMs = Date.now() - lockStart;
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  const evalPage = async (expression) => firstJson(
    (await opencli(['browser', session, 'eval', expression], { windowMode, timeoutMs: 90_000 })).stdout,
  );

  let stopReason = 'error';
  let exitCode = 3;
  let errorRecord = null;
  let hijacked = false;
  let hijackedHref = null;
  let finalHref = null;
  let mechanism = null;
  let pager = null;
  let probe = null;
  let plan = { pages: [], capped: true, coverage: 'partial', notice: '(未成计划)' };
  let state = readCheckpoint(outDir, url) ?? newCheckpoint({ url, mode, offset, rowsPerPage: rowsPerPageFlag });
  const resumedFrom = donePages(state).length;
  const shotPages = [];
  let rowsPerPage = state.rowsPerPage ?? rowsPerPageFlag;
  let totalPages = state.totalPages ?? null;

  function assertOnTarget(capture) {
    finalHref = sanitizeUrlString(capture?.href);
    if (!isHijacked(target, finalHref, acceptRedirects)) return;
    hijacked = true;
    hijackedHref = finalHref;
    const error = new Error(`tab hijacked: href ${finalHref} left target route ${target}`);
    error.code = 'hijacked';
    throw error;
  }

  /** 读一页（不落盘）。行、分页器、census 一次拿全。 */
  async function readPage() {
    const capture = await evalPage(PAGE_READ_EXPR);
    capture.href = sanitizeUrlString(capture.href);
    assertOnTarget(capture);
    return capture;
  }

  /** 一页的成对证据：census 恒落，截图按 shotEvery 抽。 */
  async function capturePage(pageNo, capture, { shot }) {
    const censusFile = `census-p${pageNo}.json`;
    writePayload(outDir, censusFile, {
      when: capture.when, href: capture.href, title: capture.title,
      strategy: capture.strategy, rowCount: capture.rows.length,
      census: capture.census, pagerText: capture.pagerText, headText: capture.headText,
      rowsSample: capture.rows.slice(0, 3),
    });
    let shotFile = null;
    if (shot) {
      shotFile = `shot-p${pageNo}.png`;
      await opencli(['browser', session, 'screenshot', path.join(outDir, shotFile)], { windowMode, timeoutMs: 90_000 });
      shotPages.push(pageNo);
    }
    writeText(outDir, `page-${pageNo}.tsv`, `${capture.rows.map((row) => row.join('\t')).join('\n')}\n`);
    return { censusFile, shotFile };
  }

  try {
    // ── 1. 打开 + 打开即刷新（proxy.example.com 镜像抖动，首开常见白屏）────────────
    await batchBrowser(session, [{ cmd: 'open', args: { url } }, sleepStep(3)], { windowMode, timeoutMs: 120_000 });
    await evalPage('(() => { location.reload(); return JSON.stringify({ reload: true }); })()');
    await sleep(3000);

    // ── 2. 轮询到首屏就绪（判据沿用 ground-truth：filledCells > 0）──────
    //
    // ⚠ **`rows.length > 1` 不是就绪判据。** 2026-08-30 首次实盘就栽在这上面：
    // 外壳里有 6 个 role=row，格子全空、filledCells=0，于是脚本在**页面根本
    // 没出数**的时候就判了就绪，接着 no-pager 退出。这正是
    // readiness-must-bind-to-this-query 那条法律说的错误形状——「有东西」
    // 不等于「有这一查询的数据」。现在行必须**有内容**才算数（PAGE_READ_EXPR
    // 已经丢掉全空行），且 filledCells 优先。
    //
    // 第二次实盘（同一天的续跑那轮）又踩了一次同一个坑的变体：兜底策略
    // leaf-ycluster 从导航栏里聚出了 2 行，`rows.length >= 2` 再次成立、
    // 再次提前判就绪。所以「有行」必须限定为**数据形状的行**——
    // leaf-ycluster 是最后的兜底，它出的行不构成就绪证据。
    const dataShaped = (page) => isReady(page.census)
      || (page.strategy === 'role-row' && page.rows.length >= 2);
    let first = null;
    const deadline = startedAtMs + readyBudgetMs;
    for (;;) {
      first = await readPage();
      if (dataShaped(first)) break;
      if (Date.now() + POLL_INTERVAL_MS >= deadline) { first = null; break; }
      await sleep(POLL_INTERVAL_MS);
    }
    if (!first) {
      const timedOut = await readPage().catch(() => null);
      if (timedOut) await capturePage('0-unready', timedOut, { shot: true });
      stopReason = 'not-ready';
      exitCode = 2;
      errorRecord = { code: 'budget-exhausted', message: 'first page never became ready' };
      throw Object.assign(new Error('first page never became ready'), { code: 'not-ready', handled: true });
    }

    // ── 3. 分页机制判定 ────────────────────────────────────────────────
    pager = parsePager(`${first.headText}\n${first.pagerText}`);
    const urlPageParam = findUrlPageParam(url);
    mechanism = classifyPagination({ pager, urlPageParam });
    rowsPerPage = rowsPerPage ?? first.rows.length;
    totalPages = pager?.total ?? totalPages;
    const firstFingerprint = pageFingerprint(first.rows);
    // 第 1 页的取行策略 = 这张表的「数据形状」。后续页降级到别的策略 = 没渲染完。
    const firstStrategy = first.strategy;

    // ── 3b. --probe：再花一次加载去证实/证伪「URL 参数驱动」，然后收工 ──
    if (probeOnly) {
      await capturePage('probe1', first, { shot: true });
      const probeUrl = new URL(url);
      probeUrl.searchParams.set(pageParam, '2');
      await batchBrowser(session, [{ cmd: 'open', args: { url: probeUrl.href } }, sleepStep(6)], { windowMode, timeoutMs: 120_000 });
      let second = null;
      const probeDeadline = Date.now() + pageBudgetMs;
      for (;;) {
        second = await readPage();
        if (second.rows.length > 1) break;
        if (Date.now() + PAGE_POLL_MS >= probeDeadline) break;
        await sleep(PAGE_POLL_MS);
      }
      const secondFingerprint = pageFingerprint(second?.rows ?? []);
      const changed = Boolean(secondFingerprint && secondFingerprint !== firstFingerprint);
      await capturePage('probe2', second, { shot: true });
      probe = {
        pageParam,
        probedUrl: sanitizeUrlString(probeUrl.href),
        page1Fingerprint: firstFingerprint,
        page2Fingerprint: secondFingerprint,
        contentChanged: changed,
        // 只回报「改了参数内容变没变」。**它变了也不等于是第 2 页**
        // （可能只是重新排序或重新取数）——第 2 页里第 1 行是不是接着第 1 页的
        // 最后一行，得 AI 看两份 census 才判得了。
        pagerAfter: parsePager(`${second?.headText ?? ''}\n${second?.pagerText ?? ''}`),
      };
      mechanism = classifyPagination({ pager, urlPageParam: changed ? pageParam : null });
      stopReason = 'probe';
      exitCode = 0;
      throw Object.assign(new Error('probe done'), { code: 'probe', handled: true });
    }

    if (!pager || (pager.total == null && pager.totalRows == null)) {
      // **失败路径绝不写 page-1.tsv。** 2026-08-30 续跑那轮就是这么把上一轮
      // 采到的 50 行正本覆盖成了 2 行导航栏垃圾（harvest.md：写入方必须假定
      // 目标位置上已经有一份比自己更值钱的东西）。存 -nopager 后缀的现场即可。
      await capturePage('1-nopager', first, { shot: true });
      stopReason = 'no-pager';
      exitCode = 2;
      errorRecord = { code: 'no-pager', message: 'pager text not recognised; total pages unknown' };
      throw Object.assign(new Error('pager not recognised'), { code: 'no-pager', handled: true });
    }

    // ── 4. 计划（绝不默认全量）──────────────────────────────────────────
    plan = planPages({ total: totalPages, maxPages, mode, done: donePages(state), offset });
    console.error(redactSecrets(`[harvest-paginated] ${plan.notice}`));

    // ── 5. 逐页采 ──────────────────────────────────────────────────────
    let previousFingerprint = firstFingerprint;
    let currentPage = 1;
    let lastSettleRead = null;

    /**
     * 等一次翻页落地。**四条同时成立才算这一页到了**：
     *   ① filledCells > 0（有数据，不是加载态）
     *   ② 取行策略与第 1 页一致（形状没降级）
     *   ③ 指纹与上一页不同（真的翻动了）
     *   ④ 连续两读指纹一致（渲染稳定了）
     *
     * 少了任何一条都不行。2026-08-30 首次实盘（nytimes audience-overlap，15 页）：
     * 点完 Next 表体被整个卸掉重建，那一瞬 filledCells=0、role=row 一个不剩，
     * 取行降级到 leaf-ycluster 抓到了导航栏（「流量与市场 价格 Enterprise…」）。
     * 指纹确实变了、也连着两读一致（因为壳是静止的），旧判据于是把**导航栏
     * 当成第 2 页**存了下来——行数自检当场报了 shortPages（2 行 vs 50 行），
     * 但脚本本就不该把它当成功。
     *
     * 超时返回 null（调用方记失败、留现场，不存那一页）；最后一次读数留在
     * `lastSettleRead` 里，好让失败原因说得出「当时看到的是什么」。
     */
    async function settle(against) {
      const pageDeadline = Date.now() + pageBudgetMs;
      let stableFingerprint = null;
      lastSettleRead = null;
      for (;;) {
        await sleep(PAGE_POLL_MS);
        const seen = await readPage();
        lastSettleRead = seen;
        const fingerprint = pageFingerprint(seen.rows);
        const shapeOk = seen.strategy === firstStrategy && isReady(seen.census) && seen.rows.length >= 2;
        if (shapeOk && fingerprint !== against && fingerprint === stableFingerprint) return seen;
        stableFingerprint = shapeOk ? fingerprint : null;
        if (Date.now() + PAGE_POLL_MS >= pageDeadline) return null;
      }
    }
    for (const pageNo of plan.pages) {
      const at = new Date().toISOString();
      let capture = null;
      if (pageNo === currentPage) {
        capture = first && pageNo === 1 ? first : await readPage();
      } else {
        // **客户端分页要一步一步走。** 2026-08-30 续跑实盘：浏览器一关，页码状态
        // 就回到第 1 页，于是「跳到第 4 页」走了输入框那条路，而输入框**根本没找到**
        // （`no page input found`，连采三页全废）。分页器上真正稳的控件只有 `Next`，
        // 所以目标页在当前页之后、且距离不超过 `--max-next-walk`（默认 25）时，
        // 一律用连点 Next 走过去——中间那些页只导航不落盘。
        // 代价是真实的（走到第 40 页要点 39 次），这正是 pagination-harvest.md
        // 里「客户端分页的续跑代价最高」那句话的实测形态。
        const forward = pageNo - currentPage;
        const canWalk = mechanism.kind === 'client' && pagerMode !== 'url'
          && forward > 0 && forward <= maxNextWalk;
        if (mechanism.kind === 'url' || pagerMode === 'url') {
          const next = new URL(url);
          next.searchParams.set(pageParam, String(pageNo));
          await batchBrowser(session, [{ cmd: 'open', args: { url: next.href } }, sleepStep(4)], { windowMode, timeoutMs: 120_000 });
        } else if (canWalk) {
          let walkFingerprint = previousFingerprint;
          let walkFailed = null;
          for (let hop = 0; hop < forward; hop += 1) {
            const action = await evalPage(buildPagerActionExpr('next'));
            if (!action?.ok) { walkFailed = `next control: ${action?.reason ?? 'unknown'}`; writePayload(outDir, `pager-diag-p${pageNo}.json`, action ?? null); break; }
            if (hop === forward - 1) break;      // 最后一跳交给下面的就绪等待
            const hopped = await settle(walkFingerprint);
            if (!hopped) { walkFailed = `intermediate page ${currentPage + hop + 1} never settled`; break; }
            walkFingerprint = pageFingerprint(hopped.rows);
          }
          if (walkFailed) {
            state = applyPageResult(state, { page: pageNo, ok: false, reason: walkFailed, at });
            saveCheckpoint(outDir, state);
            console.error(redactSecrets(`[harvest-paginated] page ${pageNo} :: ${walkFailed}`));
            continue;
          }
          previousFingerprint = walkFingerprint;
        } else {
          const action = await evalPage(buildPagerActionExpr('jump', pageNo));
          if (!action?.ok) {
            writePayload(outDir, `pager-diag-p${pageNo}.json`, action ?? null);
            state = applyPageResult(state, { page: pageNo, ok: false, reason: `pager control: ${action?.reason ?? 'unknown'}`, at });
            saveCheckpoint(outDir, state);
            console.error(redactSecrets(`[harvest-paginated] page ${pageNo} :: pager control failed (${action?.reason ?? 'unknown'}) — 诊断见 pager-diag-p${pageNo}.json`));
            continue;
          }
        }
        // **翻页成功绑内容，不绑页码** —— 而且「内容」必须是**数据**，不是重渲染中途。
        //
        // 2026-08-30 首次实盘（nytimes audience-overlap，15 页）栽的第二个坑：
        // 点完 Next，表体被整个卸掉重建，那一瞬 filledCells=0、role=row 一个不剩，
        // 取行降级到 leaf-ycluster 抓到了导航栏（「流量与市场 价格 Enterprise…」）。
        // 指纹确实变了、也连着两读一致（因为壳是静止的），于是旧判据把**导航栏
        // 当成了第 2 页**存了下来。行数自检当场报了 shortPages（2 行 vs 50 行），
        // 但脚本本不该把它当成功。所以就绪判据是四条同时成立：
        //   ① filledCells > 0（有数据，不是加载态）
        //   ② strategy 与第 1 页一致（形状没降级）
        //   ③ 指纹与上一页不同（真的翻动了）
        //   ④ 连续两读指纹一致（渲染稳定了）
        // 四条凑不齐就**记失败**，不存那一页——失败的页会被下一轮计划自然重入。
        const accepted = await settle(previousFingerprint);
        const lastSeen = lastSettleRead;
        if (!accepted) {
          // 这**不是**「没有更多数据」的结论，只是这一页没拿到。现场留一份 census。
          const reason = lastSeen && pageFingerprint(lastSeen.rows) === previousFingerprint
            ? 'content did not change after paging'
            : `page never settled into data shape (strategy=${lastSeen?.strategy ?? '?'} filledCells=${lastSeen?.census?.deep?.filledCells ?? '?'} rows=${lastSeen?.rows?.length ?? 0})`;
          if (lastSeen) await capturePage(`${pageNo}-failed`, lastSeen, { shot: true });
          state = applyPageResult(state, { page: pageNo, ok: false, reason, at });
          saveCheckpoint(outDir, state);
          console.error(redactSecrets(`[harvest-paginated] page ${pageNo} :: ${reason} (not a verdict — see census-p${pageNo}-failed.json)`));
          continue;
        }
        capture = accepted;
      }

      const fingerprint = pageFingerprint(capture.rows);
      const shot = plan.pages.indexOf(pageNo) === 0
        || pageNo === plan.pages[plan.pages.length - 1]
        || plan.pages.indexOf(pageNo) % shotEvery === 0;
      const files = await capturePage(pageNo, capture, { shot });
      const seenPager = parsePager(`${capture.headText}\n${capture.pagerText}`);
      if (seenPager?.total != null) totalPages = seenPager.total;
      state = applyPageResult(state, {
        page: pageNo, ok: true, rows: capture.rows.length, fingerprint, at,
        censusFile: files.censusFile, shotFile: files.shotFile,
        totalPages, rowsPerPage,
      });
      saveCheckpoint(outDir, state);
      previousFingerprint = fingerprint;
      currentPage = pageNo;
      console.error(redactSecrets(`[harvest-paginated] page ${pageNo} :: rows=${capture.rows.length} strategy=${capture.strategy} pagerCurrent=${seenPager?.current ?? '?'}`));
    }

    stopReason = donePages(state).length ? 'done' : 'no-pages';
    exitCode = donePages(state).length ? 0 : 2;
  } catch (error) {
    if (error?.code === 'hijacked') { stopReason = 'hijacked'; exitCode = 3; }
    else if (!error?.handled) { stopReason = 'error'; exitCode = 3; }
    if (!errorRecord) errorRecord = { code: error?.code || 'error', message: redactSecrets(error?.message || String(error)) };
    if (!error?.handled) console.error(redactSecrets(error?.stack || error?.message || String(error)));
  } finally {
    // ── 6. 合并 + 行数自检（对不上只打标，不下判断）────────────────────
    let audit = null;
    try {
      const rowsByPage = donePages(state).map((page) => {
        const file = path.join(outDir, `page-${page}.tsv`);
        if (!existsSync(file)) return [];
        return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => line.split('\t'));
      });
      const merged = dedupeRows(rowsByPage);
      writeText(outDir, 'rows.tsv', `${merged.rows.join('\n')}\n`);
      audit = verifyRowCount({
        pages: state.pages,
        rowsPerPage: state.rowsPerPage ?? rowsPerPage,
        totalPages: state.totalPages ?? totalPages,
        reportedTotalRows: pager?.totalRows ?? null,
        uniqueRows: merged.unique,
        coverage: plan.coverage,
      });
    } catch (auditError) {
      audit = { rowCountMismatch: true, reasons: [`audit failed: ${redactSecrets(String(auditError?.message ?? auditError))}`] };
    }

    const manifest = buildPaginatedManifest({
      url, session, startedAt, finishedAt: new Date().toISOString(),
      mechanism, pager, plan, pages: state.pages, failures: state.failures,
      rowsPerPage: state.rowsPerPage ?? rowsPerPage, totalPages: state.totalPages ?? totalPages,
      shotEvery, shotPages, audit, stopReason, notice: plan.notice,
      maxPages, mode, offset, maxNextWalk, resumedFrom,
      lockHeld: Boolean(locks), lockWaitMs, hijacked, hijackedHref, finalHref,
      error: errorRecord, probe,
    });
    try { writePayload(outDir, 'manifest.json', manifest); saveCheckpoint(outDir, state); } catch (writeError) {
      console.error(redactSecrets(`manifest write failed: ${writeError?.message || writeError}`));
    }
    await closeSession(session).catch(() => {});
    if (locks) await locks.release().catch(() => {});
    console.error(redactSecrets(
      `[harvest-paginated] stopReason=${stopReason} mechanism=${mechanism?.kind ?? '?'} `
      + `pages=${donePages(state).length}/${state.totalPages ?? totalPages ?? '?'} `
      + `rowCountMismatch=${Boolean(audit?.rowCountMismatch)} exit=${exitCode}`,
    ));
    console.error(redactSecrets(`[harvest-paginated] ${plan.notice}`));
  }
  process.exitCode = exitCode;
}

const invokedAsScript = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((error) => {
    console.error(redactSecrets(error?.stack || error?.message || String(error)));
    process.exitCode = 3;
  });
}
