#!/usr/bin/env node
/**
 * ground-truth.mjs — 配额站页面的双证人采集：每个停留位置一份穿透 shadow DOM
 * 的读数（census）+ 一张视口截图，成对落盘，判断交给 AI 对质两个证人。
 *
 *   node scripts/ground-truth.mjs --url <url> --out <evidence-dir> \
 *     [--budget 180] [--max-screens 12] \
 *     [--accept-redirect <path,path>] [--scroll-container auto|window|<selector>] \
 *     [--ready-text <regex>] [--no-eager-reload]
 *
 * 2026-08-29 两路开荒（Semrush organic / Similarweb explore）实测补的三个缺口：
 *
 *   - `--accept-redirect`：声明已知的合法重定向别名（如 /analytics/organic/pages/
 *     → /analytics/toppages/ 的 302）。命中别名不算 hijack。
 *   - hash 感知落点自检：目标 URL 含 `#` 时（Similarweb 等 SPA 的 pathname 恒为
 *     `/`），自检改比 hash 的前 3 段。census 的 href 因此带上 location.hash。
 *   - `--scroll-container`：主滚动条在内层 div（如 .sw-layout-scrollable-element）
 *     时 window 滚动是空操作。auto（默认）优先内层最大可滚容器（其 scrollHeight
 *     大于整页文档滚动时），否则滚 window；也可显式传 window 或一个选择器。
 *   - `--ready-text`：非 cells 页型（列主序 DIV 大榜、水合看心情的表单页）的第三条
 *     就绪分支：穿透文本命中 regex 且 2 轮稳定即就绪（readyBranch: "text"）。
 *     默认不启用，仅显式传参时生效。
 *
 * 职责边界：**只采集，不判断。** 本脚本产出证据（census-*.json / shot-*.png /
 * manifest.json），「有数据 / 空 / 功能不存在」这类结论一律由 AI 拿着两个证人
 * 对质后做出——见 SKILL.md 的 every-measurement-needs-two-witnesses。
 *
 * 试点（backlink/evidence/ground-truth/semrush-top-pages-canva/，2026-08-29）
 * 实测的三个关键事实，直接写进了流程：
 *
 *   1. **就绪判据是 filledCells > 0，不是文本长度。** deep text 在 9 秒就到
 *      1.6M（纯壳），数据 76 秒才落进 DOM；用文本长度当就绪判据会提前约 1 分钟
 *      误判。见 isReady()。2026-08-29 重测 9 条 chart-only 路由后补了第二分支：
 *      filledCells 恒 0 但 svgText > 0 且 3 轮稳定 → chart 分支就绪，见
 *      isChartReady()；manifest 的 readyBranch 记录走了哪条分支。
 *   2. **先轮询到有数据，再开始截图。** 顺序反了会存下一堆加载态废图。
 *   3. **到底判据 = census 不变 且 截图 md5 不变。** 双证人同时不变才算到底，
 *      单证人不变可能只是滚错了对象或页面根本没动。见 pairsIdentical()。
 *
 * 退出码：0 = 采集完成（stable / max-screens / empty-state，manifest 里的
 * stopReason 区分）；2 = 预算耗尽、数据始终未就绪；3 = 其他失败。
 * 无论哪条路，结束时都 close 会话（绝不 cleanup），stderr 一律过 redactSecrets。
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  batchBrowser, closeSession, firstJson, opencli, parseFlags, quotaSiteOf, required,
  sessionForUrl, showHelpIfRequested, sleepStep,
} from './opencli-core.mjs';
import { DEEP_DOM_JS } from './lib-deep-dom.mjs';
import { readCharts } from './lib-chart-read.mjs';
import { acquireToolsShareBrowserLocks, redactSecrets } from './lib-tools-share.mjs';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 轮询间隔。试点数据在 61–76 秒落地，8 秒一轮既跟得上又不轰炸站点。 */
const POLL_INTERVAL_MS = 8000;
/** 滚动后的真睡眠（Node 侧 setTimeout，不是坏掉的 `wait time`）。 */
const DWELL_MS = 2500;

/* ------------------------------------------------------------------ *
 * 纯函数（离线可测，全部不碰浏览器）
 * ------------------------------------------------------------------ */

/** 名字长得像凭证的查询参数。命中即整个删除。 */
export const SENSITIVE_PARAM = /(token|jwt|auth|secret|passw|api[-_]?key|session[-_]?id|access[-_]?key)/i;

/**
 * URL 剥敏：`__gmitm` 只留空值键名（页面身份的一部分，值是令牌），
 * token/jwt/auth 类参数整个删除；剩余部分再过一遍 redactSecrets 兜底。
 * 相对路径（census 里的 href = pathname + search）也接。
 */
export function sanitizeUrlString(value) {
  const raw = String(value ?? '');
  if (!raw) return raw;
  let url;
  let relative = false;
  try {
    url = new URL(raw);
  } catch {
    try { url = new URL(raw, 'https://placeholder.invalid'); relative = true; } catch { return redactSecrets(raw); }
  }
  for (const key of [...url.searchParams.keys()]) {
    if (/^__gmitm$/i.test(key)) url.searchParams.set(key, '');
    else if (SENSITIVE_PARAM.test(key)) url.searchParams.delete(key);
  }
  const out = relative ? url.pathname + url.search + url.hash : url.href;
  return redactSecrets(out);
}

/**
 * eval 结果落盘前的最后一道剥敏：redactSecrets（__gmitm 值 + 工具令牌）之外，
 * 再把 cookie / authorization / bearer 形状的串直接替换为 [REDACTED]。
 * 历史事故（2026-08-24）：opencli 失败把带令牌的 URL 打进 stderr，
 * error.message 原样带出。所以**所有**要写盘或打印的文本都过这一层。
 */
export function scrubEvalPayload(text) {
  let out = redactSecrets(String(text ?? ''));
  out = out.replace(/\b((?:set-)?cookie|authorization)([\s"':=]+)(?:bearer\s+)?[^\s"';,}\]]+/gi, '$1$2[REDACTED]');
  out = out.replace(/\b(bearer)([\s"':=]+)[^\s"';,}\]]+/gi, '$1$2[REDACTED]');
  return out;
}

/**
 * 就绪判据（table 分支，**优先级最高**）：**deep.filledCells > 0，绝不是文本长度。**
 * 试点实测：deep textLength 9 秒就 1,599,006（外壳），非空单元格 76 秒才从
 * 0 → 850。textLength 是壳不是货，任何用它当就绪判据的实现都会提前约 1 分钟
 * 把加载态当成数据。
 */
export function isReady(census) {
  return Number(census?.deep?.filledCells) > 0;
}

/**
 * 就绪判据（chart 分支，table 分支不满足时才看）：**svgText > 0 且连续
 * `stablePolls`（默认 3）轮 svgText 与 deepTextLength 稳定不变。**
 *
 * 背景（2026-08-29 重测，见 evidence/ground-truth/remeasure-VERDICTS.md）：
 * 9 条 Semrush chart-only 路由 filledCells 恒 0，老判据下永远「不就绪」，
 * 每条烧满 240 秒预算 + 触发 2 次无效刷新。图表就绪的形状是 svg text 节点
 * 落地后不再变（referral 44、daily-trends 1132……），所以用「有 svg 文本
 * 且稳定」当 chart 分支的就绪。
 *
 * 与 stall 判据的相互作用：两者都是「3 轮稳定」，区别是 svgText>0（就绪）
 * vs 全零（卡住）。**chart 就绪检查必须先于 stall 检查**——否则 svgText>0
 * 的稳定会被当成卡住去刷新。
 */
export const CHART_STABLE_POLLS = 3;
export function isChartReady(recent, stablePolls = CHART_STABLE_POLLS) {
  if (!Array.isArray(recent) || recent.length < stablePolls) return false;
  const window = recent.slice(-stablePolls);
  // filledCells > 0 归 table 分支管，这里绝不越权判就绪。
  if (window.some((poll) => Number(poll?.filledCells) > 0)) return false;
  const svg = Number(window[0]?.svgText);
  if (!(svg > 0)) return false;
  const textLen = window[0]?.deepTextLength;
  if (textLen == null) return false;
  return window.every((poll) => Number(poll?.svgText) === svg && poll?.deepTextLength === textLen);
}

/**
 * 疑似空态打标（采集侧，不构成结论）：svgText === 0 且 deepTextLength 稳定
 * 且无 filledCells。email 路由的教训：无文案的占位空态（灰色锯齿占位图）
 * 不触发 detectEmptyState，svgText 0 是唯一能把它从 chart-only 里分出来的
 * 信号。命中只在 manifest 记 `suspectedEmptyState: true`，仍按预算走完——
 * 「空」的结论一律留给 AI 对质双证人。
 */
export function isSuspectedEmptyState(recent, stablePolls = CHART_STABLE_POLLS) {
  if (!Array.isArray(recent) || recent.length < stablePolls) return false;
  const window = recent.slice(-stablePolls);
  if (window.some((poll) => Number(poll?.filledCells) > 0)) return false;
  if (window.some((poll) => Number(poll?.svgText) !== 0)) return false;
  const textLen = window[0]?.deepTextLength;
  if (textLen == null) return false;
  return window.every((poll) => poll?.deepTextLength === textLen);
}

/**
 * 明确空态的**采集侧**识别：只用来停止继续轮询、转去采一对空态证据
 * （census + 截图），不构成「空」的结论——结论仍归 AI 对质双证人。
 */
export const EMPTY_STATE_MARKERS = [/没有数据/, /暂无数据/, /no data (?:available|to show|found)/i];
export function detectEmptyState(deepText) {
  const text = String(deepText ?? '');
  const hit = EMPTY_STATE_MARKERS.find((marker) => marker.test(text));
  return hit ? String(hit) : null;
}

/**
 * 逐轮落点自检（纯函数）：census 的 href path 是否已离开目标路由。
 *
 * 背景（2026-08-29 复核，见 evidence/ground-truth/recheck-VERDICTS.md）：
 * 4 次现行抓到共享标签页被外部工作流接管——usa 被别人的 referral 验证导走、
 * page-groups v2 被导经 /home/ 后停在 sylviejewelry.com 的 toppages（942 格，
 * 不看 href 就会记到 canva.com 名下）、demographics/behavior 被别的会话的
 * keywordoverview 抢走。daemon 只串行化单条 batch，本脚本一轮运行横跨几十条
 * 命令，poll 间隙足够别人 open 自己的 URL。工具锁把窗口关上，这里是最后防线：
 * 每次 census 后核对 href，path 不再以目标路由 path 开头 → hijacked，
 * 立即终止（继续轮询只是在别人的页面上采证据）。
 *
 * 判据是**path 前缀**：同路由的 query 变化（?q=canva.com）、子路径、末尾斜杠
 * 差异都不算离开；跨到别的路由（/analytics/overview/、/home/）才算。
 *
 * 两个扩展（2026-08-29 开荒实测）：
 *
 *   1. **hash 感知**：Similarweb 等 hash 路由 SPA 的 pathname 恒为 `/`，按 path
 *      比对对 hash 级劫持全盲（不误报，但也全不设防）。target 含 `#` 时改比 hash
 *      的前 `HASH_PREFIX_SEGMENTS`（3）段——同报表的国家段/窗口段变化不算离开，
 *      跨到别的报表树（marketresearch vs markets）才算。
 *   2. **合法重定向别名**：Semrush 的 /analytics/organic/pages/ 会 302 到
 *      /analytics/toppages/，是合法跳转形状不是接管。`acceptRedirects` 里声明的
 *      别名按同样的规则比对，命中任意一个就不算 hijack。
 */
export const HASH_PREFIX_SEGMENTS = 3;

/** hash 的前 n 段：`#/digitalsuite/markets/webmarketanalysis/...` → 前 3 段。 */
export function hashSegments(hash, n = HASH_PREFIX_SEGMENTS) {
  return String(hash ?? '').replace(/^#/, '').split('/').filter(Boolean).slice(0, n);
}

/** `--accept-redirect` 的值：逗号分隔的已知别名 path/hash 列表。 */
export function parseAcceptRedirects(value) {
  if (value == null || value === true) return [];
  return String(value).split(',').map((part) => part.trim()).filter(Boolean);
}

export function isHijacked(target, href, acceptRedirects = []) {
  const targetStr = String(target ?? '');
  const matchesAlias = () => Array.isArray(acceptRedirects)
    && acceptRedirects.some((alias) => alias && !isHijacked(alias, href, []));
  const hashIndex = targetStr.indexOf('#');
  if (hashIndex >= 0) {
    const want = hashSegments(targetStr.slice(hashIndex));
    if (!want.length) return false;
    let gotHash;
    try {
      gotHash = new URL(String(href ?? ''), 'https://placeholder.invalid').hash;
    } catch { return true; }
    const got = hashSegments(gotHash);
    if (want.every((segment, index) => got[index] === segment)) return false;
    return !matchesAlias();
  }
  const want = targetStr.replace(/\/+$/, '');
  if (!want) return false;
  let got;
  try {
    got = new URL(String(href ?? ''), 'https://placeholder.invalid').pathname;
  } catch { return true; }
  const gotNorm = got.replace(/\/+$/, '');
  if (gotNorm === want || gotNorm.startsWith(`${want}/`)) return false;
  return !matchesAlias();
}

/**
 * 就绪判据（text 分支，**仅显式传 `--ready-text` 时生效**）：穿透文本命中给定
 * regex 且连续 `TEXT_READY_POLLS`（2）轮 deepTextLength 稳定 → 就绪。
 *
 * 背景（2026-08-29 Similarweb 开荒）：列主序 DIV 大榜（Website Rankings 主榜）
 * 不产 cells，Keyword Gap 有表格但水合看心情——table/chart 两分支都接不住。
 * 未传参时 `resolveReadyText` 返回 null、poll 里的 readyTextHit 恒为 null，
 * 本分支永不命中；「默认不启用」是红线，不是默认值巧合。
 */
export const TEXT_READY_POLLS = 2;

export function resolveReadyText(flags) {
  const raw = flags?.['ready-text'];
  if (raw == null || raw === true || raw === '') return null;
  return new RegExp(String(raw));
}

export function isTextReady(recent, stablePolls = TEXT_READY_POLLS) {
  if (!Array.isArray(recent) || recent.length < stablePolls) return false;
  const window = recent.slice(-stablePolls);
  // readyTextHit 必须是显式 true：未启用（null/undefined）与未命中（false）都不就绪。
  if (!window.every((poll) => poll?.readyTextHit === true)) return false;
  const textLen = window[0]?.deepTextLength;
  if (textLen == null) return false;
  return window.every((poll) => poll?.deepTextLength === textLen);
}

/**
 * 滚动容器选择（2026-08-29 Similarweb 开荒）：主滚动条在内层 div
 * （.sw-layout-scrollable-element）时 window 滚动是空操作，且图表动画让截图
 * md5 恒变、census 恒定 → 假到底。
 *
 * `--scroll-container auto|window|<selector>`，auto 为默认：优先内层最大可滚
 * 容器——但仅当它的 scrollHeight 超过整页文档滚动（bodyScrollHeight）时才选它，
 * 否则最大的「内层容器」可能只是一个 500px 的下拉列表，抢走 Semrush 这类
 * window 正常滚动页面的滚动权。
 */
export function resolveScrollMode(value) {
  if (value == null || value === true || value === '' || value === 'auto') return { mode: 'auto', selector: null };
  if (value === 'window') return { mode: 'window', selector: null };
  return { mode: 'selector', selector: String(value) };
}

/**
 * auto 的挑选规则（纯函数，页面内 eval 里以同一份源码执行）：
 *   1. 内层最大可滚容器的 scrollHeight > max(bodyScrollHeight, innerHeight)
 *      → 选它（内层容器装的内容比整页文档还多，它才是真滚动条）；
 *   2. 否则 window 能滚（bodyScrollHeight - innerHeight > 32）→ window；
 *   3. 否则有内层容器就选内层最大者；再否则 window（空操作也比抛错好）。
 */
export function pickScrollContainer(containers, { bodyScrollHeight = 0, innerHeight = 0 } = {}) {
  const list = Array.isArray(containers) ? containers : [];
  let best = -1;
  for (let index = 0; index < list.length; index += 1) {
    const item = list[index];
    const scrollHeight = Number(item?.scrollHeight || 0);
    const clientHeight = Number(item?.clientHeight || 0);
    if (clientHeight > 0 && scrollHeight - clientHeight > 32
      && (best < 0 || scrollHeight > Number(list[best].scrollHeight || 0))) best = index;
  }
  const docScroll = Math.max(Number(bodyScrollHeight) || 0, Number(innerHeight) || 0);
  if (best >= 0 && Number(list[best].scrollHeight || 0) > docScroll) return { kind: 'container', index: best };
  if ((Number(bodyScrollHeight) || 0) - (Number(innerHeight) || 0) > 32) return { kind: 'window' };
  if (best >= 0) return { kind: 'container', index: best };
  return { kind: 'window' };
}

/**
 * 假到底识别：**md5 恒变但 census 恒定**。图表动画让像素证人永不稳定，滚动又是
 * 空操作（滚错了对象）时，双证人判据永远到不了「到底」，烧满 max-screens 还全是
 * 同一视口。连续 `SHOT_UNSTABLE_PAIRS`（3）步 census 指纹逐字节相同而相邻截图
 * md5 各不相同 → stopReason: census-stable-shot-unstable，绝不伪装成 stable，
 * 也不再白烧剩余的 max-screens。
 */
export const SHOT_UNSTABLE_PAIRS = 3;
export function isCensusStableShotUnstable(recentPairs, n = SHOT_UNSTABLE_PAIRS) {
  if (!Array.isArray(recentPairs) || recentPairs.length < n) return false;
  const window = recentPairs.slice(-n);
  const fingerprint = window[0]?.fingerprint;
  if (!fingerprint) return false;
  if (!window.every((pair) => pair?.fingerprint === fingerprint)) return false;
  for (let index = 1; index < window.length; index += 1) {
    const prev = window[index - 1]?.md5;
    const curr = window[index]?.md5;
    if (!prev || !curr || prev === curr) return false;
  }
  return true;
}

/**
 * 卡住（stall）判据：**停滞，不是耗时。** filledCells 仍为 0 且最近
 * `stallPolls`（默认 3）次轮询的 census **完全没有任何变化**（指纹逐字节相同，
 * deep/light 文本长度、单元格数、样本全在指纹里）→ 判定卡住，触发同会话刷新。
 *
 * 为什么不能用耗时：试点正常路径数据 76 秒才落，而 61 秒时 light innerText
 * 从 59 涨到 127——**是有进展的**。「慢」和「卡」的区别就是有没有变化，
 * 任何「等了 N 秒还没好 ⇒ 卡了」的判据都会把正常慢加载误判成卡。
 * 对应仓库既有教训：卡加载页面刷新后往往正常，绝不能把卡加载记成
 * 「功能不存在」或零数据——但也绝不能把慢加载刷没了。
 */
export const STALL_POLLS = 3;
export const MAX_REFRESHES = 2;

/** 轮询一轮的 census 指纹：整个 census 对象，时间戳（capture.when）不在其中。 */
export function pollFingerprint(capture) {
  return JSON.stringify(capture?.census ?? null);
}

/**
 * `recent` 是**自上次刷新以来**的轮询摘要序列（{ fingerprint, filledCells }）。
 * 卡住 = 至少 stallPolls 轮，且最近 stallPolls 轮指纹完全相同、filledCells 全为 0。
 * 任何一轮有任何变化（哪怕只是浅层文本长度 59 → 127）都会打断停滞计数。
 */
export function isStalled(recent, stallPolls = STALL_POLLS) {
  if (!Array.isArray(recent) || recent.length < stallPolls) return false;
  const window = recent.slice(-stallPolls);
  if (window.some((poll) => Number(poll?.filledCells) > 0)) return false;
  const first = window[0]?.fingerprint;
  if (!first) return false;
  return window.every((poll) => poll.fingerprint === first);
}

/**
 * 一个停留位置的 census 指纹。时间戳刻意排除（同一画面两次读时间必然不同）；
 * scrollY 刻意包含（滚动命令发出去但页面没动，正是「到底」的一半证据）。
 */
export function censusFingerprint(capture) {
  return JSON.stringify({ scrollY: capture?.scrollY ?? null, census: capture?.census ?? null });
}

/**
 * 到底判据：**双证人同时不变。** census 指纹相同（DOM 证人）且截图 md5 相同
 * （像素证人），连续一次即到底。只看其中一个都不行：census 不变可能是滚错了
 * 对象，截图不变可能是虚拟滚动只换数据不动像素。
 */
export function pairsIdentical(prev, curr) {
  return Boolean(
    prev && curr
    && prev.md5 && curr.md5 && prev.md5 === curr.md5
    && prev.fingerprint && prev.fingerprint === curr.fingerprint,
  );
}

/** manifest 的形状在这里定死，测试直接对着它断言。 */
export function buildManifest({
  url, session, startedAt, finishedAt, readyAfterMs, polls, steps,
  stopReason, budgetSeconds, maxScreens, error = null, refreshes = [],
  readyBranch = null, suspectedEmptyState = false, chartRead = null,
  lockHeld = false, lockWaitMs = null, hijacked = false, hijackedHref = null, finalHref = null,
  acceptRedirects = [], readyTextPattern = null,
  scrollMode = 'auto', scrollSelector = null, scrolls = [],
  eagerReload = true,
}) {
  return {
    schemaVersion: 1,
    url: sanitizeUrlString(url),
    session,
    startedAt,
    finishedAt,
    budgetSeconds,
    maxScreens,
    readyAfterMs,
    // 整轮运行是否持有机器级工具锁（配额站 true，非配额站 false），
    // 以及拿到锁前等了多少毫秒（未加锁为 null）。
    lockHeld,
    lockWaitMs,
    // 落点自检：href 离开目标路由 path/hash → true + 当轮 href（已剥敏），
    // 采集立即终止、退出码 3——不在别人的页面上继续轮询。
    hijacked,
    hijackedHref,
    // 最后一轮 census 读到的 href（已剥敏，含 search/hash）。**落点自检看不见的那一半**：
    // 2026-08-30 实盘抓到——`?q=canva.com` 的 URL 因面板自动追加 `lid=`，
    // 渲染的其实是列表里那个域（截图上是 nytimes）。path/hash 全程没变，
    // 所以 hijack 判据无从察觉，AI 得自己看 `q=` 与 `lid=` 对不对得上。
    // 这里只是把它摆到 manifest 表面，不做判断——判断照旧归 AI。
    finalHref,
    // `--accept-redirect` 声明的合法重定向别名（如 302 的落点），命中不算 hijack。
    acceptRedirects,
    // 就绪走的是哪条分支："table"（filledCells>0）| "chart"（svgText>0 稳定）
    // | "text"（--ready-text 命中且稳定）| null（从未就绪）。
    readyBranch,
    // --ready-text 的 regex 源码；未启用为 null（text 分支默认不生效）。
    readyTextPattern,
    // 滚动容器策略与实际滚动记录（auto|window|selector；scrolls 记每次滚动的落点）。
    scrollMode,
    scrollSelector,
    scrolls,
    // svgText===0 且 deepTextLength 稳定且无 filledCells 的疑似空态打标。
    // 只是打标——判断留给 AI 对质双证人。
    suspectedEmptyState,
    // chart 读数器的**提取结果**（轴刻度/轴范围/标签/系列名/几何逐点值），
    // 见 lib-chart-read.mjs。null = 本轮没走 chart 分支或读数器抛了错。
    // `capability` 说的是读数器做到了什么（points / axis-only / none），
    // **不说页面有没有数据**——后者是判断，归 AI。
    chartRead,
    pollCount: polls.length,
    stepCount: steps.length,
    // 打开即刷新是否启用（默认 true；--no-eager-reload 关）。首刷不计入 refreshCount。
    eagerReload,
    // 「刷了 2 次还起不来」和「从没刷过就放弃」是完全不同的证据：
    // 退出码 2 时读这里就能分辨。
    refreshCount: refreshes.length,
    stopReason,
    error,
    refreshes,
    polls,
    steps,
  };
}

/* ------------------------------------------------------------------ *
 * 采集
 * ------------------------------------------------------------------ */

/**
 * 页面侧读数：DEEP_DOM_JS 注入 + readDomCensus，包在 IIFE 里。
 * href 带 location.hash：hash 路由 SPA 的 pathname 恒为 `/`，落点自检全靠 hash。
 */
export const CENSUS_EXPR = `(() => {
  ${DEEP_DOM_JS}
  const census = readDomCensus(document, { sampleChars: 20000 });
  return JSON.stringify({
    when: new Date().toISOString(),
    href: location.pathname + location.search + location.hash,
    title: document.title,
    scrollY: window.scrollY,
    innerHeight: window.innerHeight,
    bodyScrollHeight: Math.max(document.documentElement.scrollHeight, (document.body && document.body.scrollHeight) || 0),
    census,
  });
})()`;

/**
 * 一次滚动的页面侧表达式。window / selector / auto 三种模式；auto 在页面内
 * 现场重算候选容器并以 pickScrollContainer 的**同一份源码**挑选——挑选逻辑
 * 只有一处，离线测试测的就是页面里跑的那份。
 */
export function buildScrollExpr({ mode = 'auto', selector = null, amount = 700 } = {}) {
  const amt = Math.max(1, Math.round(Number(amount) || 700));
  if (mode === 'window') {
    return `(() => { window.scrollBy(0, ${amt}); return JSON.stringify({ kind: 'window', scrollY: window.scrollY }); })()`;
  }
  if (mode === 'selector') {
    return `(() => {
  ${DEEP_DOM_JS}
  const root = document.body || document.documentElement;
  const el = deepQueryAll(root, ${JSON.stringify(String(selector ?? ''))})[0];
  if (!el) { window.scrollBy(0, ${amt}); return JSON.stringify({ kind: 'window', missingSelector: true, scrollY: window.scrollY }); }
  el.scrollTop += ${amt};
  return JSON.stringify({ kind: 'container', tag: String(el.tagName || '').toLowerCase(), scrollTop: el.scrollTop, scrollHeight: el.scrollHeight, scrollY: window.scrollY });
})()`;
  }
  return `(() => {
  ${DEEP_DOM_JS}
  const pick = ${pickScrollContainer.toString()};
  const root = document.body || document.documentElement;
  const candidates = [];
  for (const el of deepQueryAll(root, '*')) {
    const scrollHeight = Number(el.scrollHeight || 0);
    const clientHeight = Number(el.clientHeight || 0);
    if (clientHeight > 0 && scrollHeight - clientHeight > 32) {
      candidates.push({ el, tag: String(el.tagName || '').toLowerCase(), scrollHeight, clientHeight });
    }
  }
  const bodyScrollHeight = Math.max(document.documentElement.scrollHeight, (document.body && document.body.scrollHeight) || 0);
  const choice = pick(
    candidates.map((c) => ({ tag: c.tag, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight })),
    { bodyScrollHeight, innerHeight: window.innerHeight },
  );
  if (choice.kind === 'container') {
    const c = candidates[choice.index];
    c.el.scrollTop += ${amt};
    return JSON.stringify({ kind: 'container', tag: c.tag, scrollTop: c.el.scrollTop, scrollHeight: c.el.scrollHeight, scrollY: window.scrollY });
  }
  window.scrollBy(0, ${amt});
  return JSON.stringify({ kind: 'window', scrollY: window.scrollY });
})()`;
}

/**
 * 图表几何专用读数：和 CENSUS_EXPR 同一份 readDomCensus，只多开 `chartGeometry`。
 *
 * **只在 chart 分支就绪之后打一次**，不进轮询：每个 svg 节点一次
 * `getBoundingClientRect()` 会触发布局，逐轮跑既慢又没意义（没就绪时没有图）。
 */
export const CHART_GEOMETRY_EXPR = `(() => {
  ${DEEP_DOM_JS}
  const census = readDomCensus(document, { sampleChars: 20000, chartGeometry: true });
  return JSON.stringify({
    when: new Date().toISOString(),
    href: location.pathname + location.search + location.hash,
    title: document.title,
    census,
  });
})()`;

async function readCensus(evalPage, expr = CENSUS_EXPR) {
  const capture = await evalPage(expr);
  capture.href = sanitizeUrlString(capture.href);
  return capture;
}

/** 落盘统一走这里：序列化后整体过 scrubEvalPayload，再写文件。 */
function writePayload(outDir, file, value) {
  writeFileSync(path.join(outDir, file), `${scrubEvalPayload(JSON.stringify(value, null, 2))}\n`);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  showHelpIfRequested(flags, import.meta.url);
  const url = required(flags, 'url');
  const outDir = path.resolve(required(flags, 'out'));
  const budgetMs = Math.max(1, Number(flags.budget) || 180) * 1000;
  const maxScreens = Math.max(1, Number(flags['max-screens']) || 12);
  const acceptRedirects = parseAcceptRedirects(flags['accept-redirect']);
  const readyText = resolveReadyText(flags);
  // 打开即刷新（2026-08-30 用户令）：3ue.co 镜像抖动频发，首开常见白屏/空响应/
  // 「出错了」组件页，等 stall 判定（3 轮不变）才刷太慢——open 后无条件先 reload
  // 一次再进轮询，刷新即愈。`--no-eager-reload` 可关（非镜像站点或调试用）。
  const eagerReload = !flags['no-eager-reload'];
  const scroll = resolveScrollMode(flags['scroll-container']);
  mkdirSync(outDir, { recursive: true });

  // 配额站收敛：同一站点固定会话名（如 semrush-nav），daemon 把并发排成一队。
  const session = sessionForUrl(url, 'ground-truth');
  // hidden 出生的标签页永不水合（hidden-tabs-do-not-hydrate），所以 foreground 出生。
  const windowMode = 'foreground';

  // 整轮持机器级工具锁（one-collector-per-quota-tool）：daemon 只串行化单条
  // batch，本脚本一轮横跨几十条命令，poll 间隙别的工作流可以 open 自己的 URL
  // ——2026-08-29 复核抓到 4 次现行接管。锁按 url 的 host 映射工具 key
  // （sem.3ue.co→semrush、sim.3ue.co→similarweb），非配额站不加锁。
  // 等锁超时沿用 lib-tools-share 的默认；锁等待不计入采集预算。
  const quotaSite = quotaSiteOf(url);
  let locks = null;
  let lockWaitMs = null;
  if (quotaSite) {
    const lockStartMs = Date.now();
    locks = await acquireToolsShareBrowserLocks(session, quotaSite.key);
    lockWaitMs = Date.now() - lockStartMs;
  }

  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  // hash 路由 SPA（pathname 恒为 `/`）以 hash 为落点身份，其余以 pathname。
  const targetUrl = new URL(url);
  const target = targetUrl.hash || targetUrl.pathname;

  const evalPage = async (expression) => firstJson(
    (await opencli(['browser', session, 'eval', expression], { windowMode, timeoutMs: 90_000 })).stdout,
  );

  const polls = [];
  const steps = [];
  const refreshes = [];
  const scrolls = [];
  let stopReason = 'error';
  let exitCode = 3;
  let readyAfterMs = null;
  let readyBranch = null;
  let suspectedEmptyState = false;
  // chart 分支就绪后由读数器填；其余分支恒 null（「没跑读数器」≠「读数器读到空」）。
  let chartRead = null;
  let errorRecord = null;
  let hijacked = false;
  let hijackedHref = null;
  // 每轮都覆写，收尾时进 manifest.finalHref——面板悄悄追加的 `lid=` 之类只在这里看得见。
  let finalHref = null;

  /** 逐轮落点自检：href 离开目标路由（path 或 hash 前 3 段，别名豁免）→ 立即终止。 */
  function assertOnTarget(capture) {
    finalHref = capture.href; // readCensus 已剥敏；无论是否命中 hijack 都记
    if (!isHijacked(target, capture.href, acceptRedirects)) return;
    hijacked = true;
    hijackedHref = capture.href; // readCensus 已剥敏
    const error = new Error(`tab hijacked: href ${capture.href} left target route ${target}`);
    error.code = 'hijacked';
    throw error;
  }

  /** 同一停留位置的一对证人：census-sN.json 先落，紧接 shot-sN.png。 */
  async function capturePair(n) {
    const capture = await readCensus(evalPage);
    assertOnTarget(capture);
    const censusFile = `census-s${n}.json`;
    const shotFile = `shot-s${n}.png`;
    writePayload(outDir, censusFile, capture);
    const shotPath = path.join(outDir, shotFile);
    await opencli(['browser', session, 'screenshot', shotPath], { windowMode, timeoutMs: 90_000 });
    const md5 = createHash('md5').update(readFileSync(shotPath)).digest('hex');
    return {
      capture,
      md5,
      fingerprint: censusFingerprint(capture),
      summary: {
        step: n,
        censusFile,
        shotFile,
        when: capture.when,
        scrollY: capture.scrollY,
        filledCells: capture.census?.deep?.filledCells ?? null,
        screenshotMd5: md5,
        sameAsPrevious: null,
      },
    };
  }

  try {
    // 1. open（foreground 出生）+ 3 秒落地缓冲。
    await batchBrowser(session, [{ cmd: 'open', args: { url } }, sleepStep(3)], { windowMode, timeoutMs: 120_000 });

    // 1b. 打开即刷新一次（eager reload，见上）——不占 stall 刷新次数配额，
    //     manifest 单独记 eagerReload，让「首刷」与「卡住后救活」两种证据分开。
    if (eagerReload) {
      await evalPage('(() => { location.reload(); return JSON.stringify({ reload: true }); })()');
      await sleep(3000);
    }

    // 2. 轮询到有数据（filledCells > 0），或明确空态，或预算耗尽。**先轮询后截图。**
    //    卡住（连续 STALL_POLLS 轮 census 完全不变且 0 格）→ 同会话刷新重试，
    //    最多 MAX_REFRESHES 次；每次刷新后就绪等待重新计时，但总预算仍受
    //    --budget 上限约束（取两者中先到的截止点）。
    let emptyMarker = null;
    let pollIndex = 0;
    let sinceRefresh = [];
    const hardDeadline = startedAtMs + budgetMs;
    let attemptDeadline = hardDeadline;
    for (;;) {
      pollIndex += 1;
      const capture = await readCensus(evalPage);
      writePayload(outDir, `census-poll${pollIndex}.json`, capture);
      const summary = {
        poll: pollIndex,
        file: `census-poll${pollIndex}.json`,
        when: capture.when,
        elapsedMs: Date.now() - startedAtMs,
        scrollY: capture.scrollY,
        filledCells: capture.census?.deep?.filledCells ?? null,
        deepTextLength: capture.census?.deep?.textLength ?? null,
        lightTextLength: capture.census?.lightDom?.textLength ?? null,
        svgText: capture.census?.deep?.svgText ?? null,
        // --ready-text 未传时恒为 null：text 分支的「默认不启用」在这里落地。
        readyTextHit: readyText ? readyText.test(String(capture.census?.deepText ?? '')) : null,
      };
      polls.push(summary);
      // 落点自检先于一切就绪判断：落在别人的页面上，「就绪」只会把污染当数据。
      assertOnTarget(capture);
      // 就绪分支优先级：table（filledCells>0，立即）> chart（svgText>0 且 3 轮稳定）。
      if (isReady(capture.census)) {
        readyAfterMs = Date.now() - startedAtMs;
        readyBranch = 'table';
        suspectedEmptyState = false;
        break;
      }
      emptyMarker = detectEmptyState(capture.census?.deepText);
      if (emptyMarker) break;

      sinceRefresh.push({
        fingerprint: pollFingerprint(capture),
        filledCells: summary.filledCells,
        svgText: summary.svgText,
        deepTextLength: summary.deepTextLength,
        readyTextHit: summary.readyTextHit,
      });
      // text 分支（仅 --ready-text 时生效）先于 chart：显式判据比形状推断更强。
      if (readyText && isTextReady(sinceRefresh)) {
        readyAfterMs = Date.now() - startedAtMs;
        readyBranch = 'text';
        suspectedEmptyState = false;
        break;
      }
      // chart 就绪必须先于 stall 检查：svgText>0 的 3 轮稳定是就绪，不是卡住。
      if (isChartReady(sinceRefresh)) {
        readyAfterMs = Date.now() - startedAtMs;
        readyBranch = 'chart';
        suspectedEmptyState = false;
        break;
      }
      // 疑似空态（svgText===0 稳定）只打标，仍按预算走完；stall 刷新照旧。
      if (isSuspectedEmptyState(sinceRefresh)) suspectedEmptyState = true;
      if (isStalled(sinceRefresh) && refreshes.length < MAX_REFRESHES) {
        refreshes.push({
          refresh: refreshes.length + 1,
          at: new Date().toISOString(),
          afterPoll: pollIndex,
          reason: `stalled: ${STALL_POLLS} consecutive polls with identical census and filledCells=0`,
          lastCensus: {
            filledCells: summary.filledCells,
            deepTextLength: summary.deepTextLength,
            lightTextLength: summary.lightTextLength,
          },
        });
        await evalPage('(() => { location.reload(); return JSON.stringify({ reload: true }); })()');
        await sleep(3000);
        sinceRefresh = [];
        attemptDeadline = Math.min(Date.now() + budgetMs, hardDeadline);
        continue;
      }

      if (Date.now() + POLL_INTERVAL_MS >= attemptDeadline) break;
      await sleep(POLL_INTERVAL_MS);
    }

    if (readyAfterMs === null) {
      // 未就绪也采一对成对证据（空态/超时那一刻的画面 + 读数），AI 才有东西可对质。
      const pair = await capturePair(1);
      steps.push(pair.summary);
      stopReason = emptyMarker ? 'empty-state' : 'budget';
      exitCode = emptyMarker ? 0 : 2;
      if (emptyMarker) errorRecord = null;
      else errorRecord = { code: 'budget-exhausted', message: 'data never became ready (no table filledCells, no stable svgText)' };
    } else {
      // 2b. chart 分支就绪 → 打一次图表读数器。**失败不影响主流程**：
      //     读数器只是把轴/标签/几何提取出来摆到 manifest 上，判读仍归 AI
      //     （第 11 条法律）。它读不出逐点值时会自己在 uncertain 里说明理由，
      //     绝不猜一个数填上。
      if (readyBranch === 'chart') {
        try {
          const geoCapture = await readCensus(evalPage, CHART_GEOMETRY_EXPR);
          writePayload(outDir, 'census-chart-geometry.json', geoCapture);
          chartRead = readCharts(geoCapture);
        } catch (chartError) {
          chartRead = { schemaVersion: 1, capability: 'none', error: redactSecrets(chartError?.message || String(chartError)) };
        }
      }

      // 3. 分屏循环：census + 截图成对落盘 → 滚一屏 → 真睡眠 → 再采。
      //    到底 = 与上一步双证人同时不变，连续 1 次。
      //    假到底 = census 恒定而截图 md5 恒变（图表动画 + 滚错对象），连续
      //    SHOT_UNSTABLE_PAIRS 步 → census-stable-shot-unstable，不伪装成 stable。
      let prev = null;
      const recentPairs = [];
      for (let n = 1; n <= maxScreens; n += 1) {
        const pair = await capturePair(n);
        const same = pairsIdentical(prev, pair);
        pair.summary.sameAsPrevious = n === 1 ? null : same;
        steps.push(pair.summary);
        recentPairs.push({ fingerprint: pair.fingerprint, md5: pair.md5 });
        if (same) { stopReason = 'stable'; exitCode = 0; break; }
        if (isCensusStableShotUnstable(recentPairs)) { stopReason = 'census-stable-shot-unstable'; exitCode = 0; break; }
        prev = pair;
        if (n === maxScreens) { stopReason = 'max-screens'; exitCode = 0; break; }
        const amount = Math.min(2000, Math.max(200, Math.round((Number(pair.capture.innerHeight) || 772) * 0.9)));
        const scrolled = await evalPage(buildScrollExpr({ mode: scroll.mode, selector: scroll.selector, amount }));
        scrolls.push({ afterStep: n, amount, ...scrolled });
        await sleep(DWELL_MS);
      }
    }
  } catch (error) {
    stopReason = error?.code === 'hijacked' ? 'hijacked' : 'error';
    exitCode = 3;
    errorRecord = { code: error?.code || 'error', message: redactSecrets(error?.message || String(error)) };
    console.error(redactSecrets(error?.stack || error?.message || String(error)));
  } finally {
    const manifest = buildManifest({
      url, session, startedAt,
      finishedAt: new Date().toISOString(),
      readyAfterMs, polls, steps, stopReason,
      budgetSeconds: budgetMs / 1000, maxScreens,
      error: errorRecord, refreshes, readyBranch, suspectedEmptyState, chartRead,
      lockHeld: Boolean(locks), lockWaitMs, hijacked, hijackedHref, finalHref,
      acceptRedirects, readyTextPattern: readyText ? readyText.source : null,
      scrollMode: scroll.mode, scrollSelector: scroll.selector, scrolls,
      eagerReload,
    });
    try { writePayload(outDir, 'manifest.json', manifest); } catch (writeError) {
      console.error(redactSecrets(`manifest write failed: ${writeError?.message || writeError}`));
    }
    // 结束时 close 会话（配额站的固定名标签页不留）。绝不 cleanup。
    await closeSession(session).catch(() => {});
    // 锁最后放：close 也是对配额站的操作，应当在锁内完成。
    if (locks) await locks.release().catch(() => {});
  }

  console.error(redactSecrets(`[ground-truth] stopReason=${stopReason} readyBranch=${readyBranch} steps=${steps.length} polls=${polls.length} refreshes=${refreshes.length} exit=${exitCode}`));
  process.exitCode = exitCode;
}

// Node 的 ESM 加载器对 import.meta.url 做了 realpath 解析（软链接 -> 真实路径），
// 但 process.argv[1] 保留调用者敲的原始路径（可能仍是符号链接，如
// ~/.claude/skills/backlink/scripts/... -> yan-skills/backlink/scripts/...）。
// 只用 path.resolve 比较会永远不相等，main() 因此从未被调用，进程零输出零报错
// 直接以 exit code 0 退出——实测经由 skill 的软链接路径调用时复现过这个静默失败，
// 极易被误判成「这个词没有数据」。这里对 process.argv[1] 也做一次 realpathSync
// 抹平软链接差异，调用失败（文件不存在等）时退回原始 resolve 结果，不让这个
// 兼容性修复本身引入新的启动异常。
const invokedPath = (() => {
  if (!process.argv[1]) return null;
  try {
    return realpathSync(process.argv[1]);
  } catch {
    return path.resolve(process.argv[1]);
  }
})();
const invokedAsScript = invokedPath === fileURLToPath(import.meta.url);
if (invokedAsScript) {
  main().catch((error) => {
    // 历史事故：error.message 带出过令牌。stderr 也必须过 redactSecrets。
    console.error(redactSecrets(error?.stack || error?.message || String(error)));
    process.exitCode = 3;
  });
}
