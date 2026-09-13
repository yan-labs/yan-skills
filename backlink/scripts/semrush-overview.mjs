#!/usr/bin/env node
/**
 * semrush-overview.mjs — Semrush「域名概览」**整页**抓取：从上到下每个区块都要到终态才算完。
 *
 * 用法：
 *   node semrush-overview.mjs --domain example.com --db us [--subdomain] [--node 5]
 *        [--out result.json] [--evidence-dir dir] [--timeout 150]
 *        [--window virtual-display|foreground|active|background|isolated] [--activate-chrome false]
 *        [--max-activations 3] [--automation-display <name|/re/|off>]
 *   # --window 不传 = virtual-display（2026-09-14）：自动化窗口放到虚拟屏幕、选中标签页、全程
 *   #   --window isolated，可见但不抢焦点，activations 恒为 0；检测不到虚拟屏幕才回退为下面这套
 *   #   active + 限次 open -a。显式传 opencli 四档之一则原样透传、不走虚拟屏幕。
 *   # 不传 --db = 全球库（scope: "global"）；--db us = 美国库（scope: "us"）。
 *   # 结束时核对页面地区选择器的选中项，写进 scopeEvidence；不符或读不出 ⇒ incomplete。
 *   # --window 默认 active（选中标签页、不节流，但不夺 OS 焦点），显式传其它值原样透传；
 *   #   --activate-chrome false 时禁止解出 foreground（会被降级成 active，见
 *   #   resolveOverviewWindowMode）。--activate-chrome 控制的是另一件事：OS 级
 *   #   `open -a` 抬前台，默认开、整次运行最多 --max-activations 次（默认 3），
 *   #   见文件头第 5 条与 visibilityActions 输出字段。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 抓什么
 * ──────────────────────────────────────────────────────────────────────
 * 期望区块清单在 lib-semrush-overview.mjs 的 SECTION_SPECS（23 块）：AI 可见度卡片、SEO 卡片
 * 8 宫格（含「流量比例」「付费关键词」）、按国家/地区划分、主要的引用来源、谷歌 SERP 排名分布、
 * 流量趋势图、关键词排名分布趋势图、自然搜索研究 6 块、广告研究 4 块、反向链接 6 块。
 * 数据来自两个证人：
 *   - 接口证人：`/dpa/rpc` 的 JSON-RPC 响应体（OpenCLI 会话级 CDP 网络捕获 + 页内钩子）
 *     —— 结构化数据，趋势图逐点序列只在这里有；
 *   - DOM 证人：穿透 shadow DOM 的文本 token 流 —— 证明区块真的渲染出来、渲染成了什么终态。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 什么时候算「加载完成」（两路都满足，同一轮判定）
 * ──────────────────────────────────────────────────────────────────────
 * DOM 一路：每个区块都到终态 data / empty / locked / absent，且页面报表区没有任何占位元素
 *   （data-ui-name 含 Skeleton/Spin/Loader/Placeholder、aria-busy、role=progressbar）。
 * 网络一路：CDP 捕获的 `/dpa/rpc` 发出数 = 资源计时完成数、drain 时无在途、页内钩子在途为 0、
 *   最后一个 rpc 返回距今 ≥ quiet 窗口。
 * 超时仍不满足 ⇒ status: incomplete，列出卡住的区块和当时的 pending 数；**不存在「看起来成功」
 * 的超时输出**。判据细节与反例测试见 lib-semrush-overview.mjs 与
 * tests/semrush-overview-readiness.test.mjs。
 *
 * ──────────────────────────────────────────────────────────────────────
 * 2026-09-13 实测钉死的三个驱动层事实（别凭直觉改）
 * ──────────────────────────────────────────────────────────────────────
 * 1. **后台（hidden）标签页里这张报表不水合**：页头出来、报表区空白。默认 --window active
 *    （2026-09-14 前是 foreground；active 同样能避免 hidden，但不夺 OS 焦点），
 *    每次读都记录 document.visibilityState（见 SKILL.md hidden-tabs-do-not-hydrate）。
 * 2. **不能用 `opencli browser open <url>` 导航到报表**：CDP 捕获布防 + chrome.tabs.update 导航时，
 *    接口 20 条全部 200 带数据，而报表模块从不挂载（非报表页 /home/ 上对照复现：open 导航空白，
 *    location.href 导航正常渲染）。所以导航走 gotoInTool（location.href），布防用
 *    `wait xhr <永不匹配> --timeout 1`——它只调 startNetworkCapture，不带 URL、不导航，
 *    也就不会把带 __gmitm 的 URL 写进访问日志。
 * 3. **中途 drain CDP 捕获会丢在途请求的响应体**（扩展端按 requestId 回填，缓冲清空后不再记录）。
 *    所以只在页内已静默时 drain；发出数/完成数用「CDP 累计条数 vs 资源计时完成数」对账。
 * 4. **CDP 捕获本身也会丢响应体**：扩展每条命令先用 2 秒探针检查调试器，页面加载忙时探针超时就
 *    detach + attach，重连前已收到响应头的请求再也取不到 body（实测 21 条里 16 条 status 200、body 空）。
 *    所以报表导航后立刻注入页内钩子（fetch/XHR 完成时 clone 响应文本），两个来源合并对账
 *    （accountRpcBodies）；合起来仍缺 ⇒ `rpc-bodies-missing` 阻断，两边内容不一致 ⇒ `rpc-body-conflict`。
 * 5. **窗口被遮挡时标签页会读成 hidden**，下方懒加载区块可能不挂载。opencli 的 CDP 透传白名单里
 *    没有 Page.bringToFront / 焦点模拟，opencli 自己的 `active` 窗口模式（选中标签页、不节流）
 *    能解决大多数场景，但窗口整个被别的应用**遮挡**时（macOS 的窗口遮挡检测会让 Chrome 把
 *    被完全挡住的标签页也标成 hidden，即使它是选中的活动标签）`active` 救不回来，仍需要脚本侧
 *    `open -a "Google Chrome"` 把应用抬到最前：导航前一次、每次 hidden 读数之后补一次
 *    （`--activate-chrome false` 整体关闭这条 OS 级抬前台；开着时 2026-09-14 起有次数上限
 *    `--max-activations`，默认 3——超过上限不再抬，仍 hidden 就保留 tab-hidden 阻断，并在
 *    visibilityActions.hint 里提示保持窗口可见）。
 *
 * 与 similarweb-query.mjs 的分工照旧：本脚本的 organicTraffic 是**自然搜索流量估算**
 * （全球库或 --db 指定的国家库），不是总访问量，不要和 Similarweb 的总访问量并列比较。
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { resolveSession, parseFlags, showHelpIfRequested, printJson, required, opencli, firstJson } from './opencli-core.mjs';
import { assertToolsShareAvailable, expiryWarning, gotoInTool, launchTool, redactSecrets, routeMismatch } from './lib-tools-share.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import {
  runReadiness, PAGE_READ_JS, HOOK_JS, HOOK_TAKE_JS, NOT_COVERED, SECTION_SPECS, TERMINAL_STATES,
  seoCardCheck, crossCheckSeo, locateSections, SCOPE_PROBE_JS, judgeScope,
  rpcScopeWitness, judgeSectionScopes, finalStatus, scrollToTextJs, flattenRpc, crossCheckIntent, LAZY_PROBE_JS,
  DEFAULT_WINDOW, resolveOverviewWindowMode, createChromeActivator,
} from './lib-semrush-overview.mjs';
import { plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW } from './lib-automation-window.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const domain = normalizeDomain(required(flags, 'domain'));
// 口径：不传 --db = 全球（概览页 URL 不带 db 参数就是全球库）；--db xx = 该国家库。
// 页面是否真的处在这个口径，结束时从地区选择器读出来核对（见 judgeScope），读不出或不符都不算 complete。
const db = String(flags.db || '').trim().toLowerCase();
const scope = db || 'global';
// 「自然搜索研究」「广告研究」两个分组的国家库（它们不跟页头走，跟账号级「最近一次显式选择的国家」走）。
// 传了：先显式访问一次 /analytics/organic/overview/?db=<xx> 把账号状态钉住（会改写同账号共享状态，写进输出）。
// 不传且请求全球：不动账号状态，如实标出页面显示的国家并阻断 complete（理由见 judgeSectionScopes）。
const organicDb = String(flags['organic-db'] || '').trim().toLowerCase();
// 可见性（见文件头第 5 条）：opencli 的 `active` 窗口模式（"选中标签页、不节流，
// 但不夺 OS 焦点"）能在不抢用户焦点的前提下解决"后台标签页不水合"，2026-09-14
// 起是本脚本的默认 opencli 窗口模式，不再靠 opencli 级别的 `foreground`（raise +
// select）抢焦点。真正会抢 OS 焦点的只剩 OS 级 `open -a`（bringChromeForward）：
// 默认开、但整次运行有次数上限（`--max-activations`，默认 3）——导航前 1 次 +
// 之后每次读到 hidden 补抬 1 次，用满上限就不再抬，仍 hidden 就照现有判据如实
// incomplete，并在 visibilityActions.hint 里提示用户保持窗口可见。
// `--activate-chrome false` 关掉 OS 级抬前台；这时如果显式传了 `--window
// foreground`，也会被降级成 `active`——false 的意图就是"不要任何 OS 级抢焦点"，
// 而 opencli 的 foreground 本身就是"raise + select"，同属抢焦点，不能被这个开关
// 绕过去。
const execFileP = promisify(execFile);
const activateChrome = process.platform === 'darwin' && String(flags['activate-chrome'] ?? 'true') !== 'false';
const chromeApp = typeof flags['chrome-app'] === 'string' ? flags['chrome-app'] : 'Google Chrome';
const maxActivations = Math.max(0, Number(flags['max-activations'] ?? 3) || 0);

// resolveOverviewWindowMode / createChromeActivator / DEFAULT_WINDOW 都住在
// lib-semrush-overview.mjs（本脚本纯逻辑层）：它们不碰浏览器，import 这里就
// 能离线测，见 tests/semrush-overview-visibility.test.mjs。
const { windowMode, downgraded: windowModeDowngraded } = resolveOverviewWindowMode({
  windowFlag: typeof flags.window === 'string' && flags.window !== VIRTUAL_DISPLAY_WINDOW ? flags.window : null,
  activateChrome,
});
// 虚拟屏幕策略（见 lib-automation-window.mjs）：不传 --window 时默认走它；windowMode 退为回退模式。
const windowStrategy = resolveWindowStrategy({ windowFlag: typeof flags.window === 'string' ? flags.window : null, fallbackWindowMode: windowMode });
const launchWindow = windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? VIRTUAL_DISPLAY_WINDOW : windowMode;
const activator = createChromeActivator({
  enabled: activateChrome,
  maxActivations,
  activate: () => execFileP('open', ['-a', chromeApp], { timeout: 15_000 }),
});
const visibilityActions = activator.state;
visibilityActions.app = chromeApp;
visibilityActions.windowMode = windowMode;
visibilityActions.windowModeDowngraded = windowModeDowngraded;
// 让标签页可见：虚拟屏幕模式下只做「确认 visible / hidden 时移窗 + tab select」，从不 open -a；
// 没有虚拟屏幕（或运行中断开）才交给 activator（限次 open -a，--activate-chrome false 时 0 次）。
let automation = null;
const bringChromeForward = async (reason) => {
  if (automation?.mode === VIRTUAL_DISPLAY_WINDOW) {
    const r = await automation.ensureVisible(reason);
    if (r.mode === VIRTUAL_DISPLAY_WINDOW) return visibilityActions;
  }
  return activator.bringChromeForward(reason);
};
if (organicDb && !/^[a-z]{2}(-[a-z]+)?$/.test(organicDb)) throw new Error(`Invalid --organic-db: ${flags['organic-db']}`);
const session = resolveSession(flags, 'semrush-overview', 'semrush');
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN_SEMRUSH || 'https://sem.3ue.co').replace(/\/+$/, '');
const LEGACY_FIELDS = ['authorityScore', 'organicTraffic', 'organicTrafficChange', 'paidTraffic', 'referringDomains', 'organicKeywords', 'organicKeywordsChange', 'backlinks', 'paidKeywords', 'trafficShare'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeDomain(value) {
  const candidate = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  const normalized = candidate.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalized)) {
    throw new Error(`Invalid domain: ${value}`);
  }
  return normalized;
}

/** 接口数据量的人读描述，写进每个区块的判据。 */
function describeData(data) {
  if (data == null) return '无';
  if (Array.isArray(data)) return `${data.length} 行`;
  if (typeof data === 'object') {
    if ('daily' in data || 'monthly' in data) return `日粒度 ${data.daily?.length ?? 0} 点 / 月粒度 ${data.monthly?.length ?? 0} 点`;
    if ('rows' in data && Array.isArray(data.rows)) return `${data.rows.length} 行（总数 ${data.total ?? '未知'}）`;
    if ('ai' in data || 'google' in data) return `AI 口径 ${data.ai?.length ?? 0} 行 / 谷歌口径 ${(data.google || []).map((g) => g.length).join('+') || 0} 行`;
    return `${Object.keys(data).length} 个字段`;
  }
  return String(data);
}

function sectionOutput(spec, s, terminalAtMs) {
  const dom = s._dom || {};
  const rpc = s._rpc || { data: null, hasData: false, rpcKinds: [] };
  let data = null;
  let criteria;
  if (spec.key === 'seo') {
    const check = seoCardCheck(dom.content || []);
    const card = check.card.values;
    const display = {
      authorityScore: card.authorityScore,
      referringDomainsDisplay: check.card.raw.referringDomains?.value ?? null,
      backlinksDisplay: check.card.raw.backlinks?.value ?? null,
      organicTrafficDisplay: check.card.raw.organicTraffic?.value ?? null,
      organicKeywordsDisplay: check.card.raw.organicKeywords?.value ?? null,
      paidTrafficDisplay: check.card.raw.paidTraffic?.value ?? null,
      paidKeywordsDisplay: check.card.raw.paidKeywords?.value ?? null,
    };
    data = {
      card,
      authorityScoreGrade: check.card.grade,
      rpc: rpc.data,
      crossCheck: crossCheckSeo(display, rpc.data),
      warnings: check.warnings,
    };
  } else if (s.state === 'locked') {
    data = { preview: (dom.content || []).slice(0, 30), rpc: rpc.data };
  } else if (rpc.hasData) {
    data = rpc.data;
  } else if (s.state === 'data') {
    data = { domValues: (dom.content || []).slice(0, 80) };
  }
  switch (s.state) {
    case 'data': criteria = `DOM：标题「${dom.title}」下有 ${dom.numericCount} 个数值 token、无占位元素、连续两次读数一致；接口：${rpc.hasData ? describeData(rpc.data) : '未识别到对应响应（dataSource: dom）'}`; break;
    case 'empty': criteria = `DOM：出现「${dom.emptyMarker}」且连续两次一致；接口：无非空数据`; break;
    case 'locked': criteria = `DOM：出现付费墙文案「${dom.lockedMarker}」且连续两次一致`; break;
    case 'absent': criteria = s.evidence?.absentProof; break;
    default: criteria = `未到终态：${s.reason || s.state}`;
  }
  return {
    name: spec.name,
    group: spec.group,
    state: s.state,
    ...(s.reason && !TERMINAL_STATES.has(s.state) ? { reason: s.reason } : {}),
    ...(s.dataSource ? { dataSource: s.dataSource } : {}),
    criteria,
    terminalAtMs: terminalAtMs ?? null,
    data,
    evidence: { ...s.evidence, domContentSample: (dom.content || []).slice(0, 12) },
  };
}

let output;
let launched;
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'semrush-overview', runTag: domain });
const started = Date.now();
try {
  launched = await launchTool({
    session,
    tool: 'semrush',
    node: flags.node,
    window: launchWindow,
    fallbackWindow: windowMode,
    fallbackMaxActivations: activateChrome ? maxActivations : 0,
    automationDisplay: flags['automation-display'],
    wait: Number(flags.wait || 7),
    timeout: Number(flags.launchTimeout || 60),
    allowParallelSession: Boolean(flags['allow-parallel-session']),
  });
  const { evalPage, env } = launched;
  automation = launched.automationWindow || null;
  visibilityActions.windowMode = automation ? automation.windowMode : windowMode;
  const searchType = flags.subdomain ? 'subdomain' : 'domain';
  const url = `${appOrigin}/analytics/overview/?q=${encodeURIComponent(domain)}` +
    `&searchType=${searchType}${db ? `&db=${encodeURIComponent(db)}` : ''}`;

  const accountStateWrites = [];
  if (organicDb) {
    // 显式带 db 访问一次域名维度报表：Semrush 会把它记成账号级「最近一次显式选择的国家」，
    // 随后不带 db 的概览页里两个研究分组就跟着它走（semrush-global-scope 调研第 7 节实测的 sticky 行为）。
    const pinUrl = `${appOrigin}/analytics/organic/overview/?q=${encodeURIComponent(domain)}&searchType=${searchType}&db=${encodeURIComponent(organicDb)}`;
    const pinned = await gotoInTool(evalPage, pinUrl, Number(flags['pin-settle'] || 10));
    accountStateWrites.push({
      action: 'explicit-db-visit', route: '/analytics/organic/overview/', db: organicDb, at: new Date().toISOString(),
      landedDb: (() => { try { return new URL(pinned.url).searchParams.get('db'); } catch { return null; } })(),
      note: '改写了 Semrush 账号级「最近一次显式选择的国家」，同账号其它不带 db 的域名报表会跟着变。',
    });
  }

  // 布防 CDP 网络捕获：必须在导航**之前**（首屏那批 rpc 在页面脚本一启动就发出）。见文件头第 2 条。
  const arm = await opencli(['browser', launched.session, 'wait', 'xhr', '__semrush_overview_arm_never_matches__', '--timeout', '1000'],
    { env, timeoutMs: 60_000, allowFailure: true });
  const armOutput = redactSecrets(`${arm.stdout}`).replace(/\s+/g, ' ').slice(0, 200);

  // 报表导航：和 gotoInTool 一样走 location.href（open 导航会让报表不挂载），但自己做，
  // 以便新 document 一可执行就注入页内钩子——钩子是响应体的第二来源，必须赶在应用首批 rpc 之前。
  // 注入时刻记在 window.__ovHookAt；资源计时里早于它发出的 rpc 计为 preHookRequests，只能靠 CDP 补 body。
  await bringChromeForward('before-report-navigation');
  const beforeNav = await evalPage('(() => JSON.stringify({ to: performance.timeOrigin }))()');
  await evalPage(`(() => { location.href = ${JSON.stringify(url)}; return JSON.stringify({ navigating: true }); })()`);
  const navStartedAt = Date.now();
  let hook = null;
  while (Date.now() - navStartedAt < 45_000) {
    let r = null;
    try {
      // 懒加载探针和响应体钩子同一次注入（探针回答「下方区块靠 IntersectionObserver 还是 scroll 事件加载」）。
      r = await evalPage(`(() => { if (performance.timeOrigin === ${Number(beforeNav?.to)}) return JSON.stringify({ old: true }); try { ${LAZY_PROBE_JS}; } catch (e) {} return (${HOOK_JS}); })()`, 15_000);
    } catch { r = null; }
    if (r && !r.old && (r.installed || r.already)) { hook = { ...r, msAfterNavigationCall: Date.now() - navStartedAt }; break; }
    await sleep(150);
  }
  if (!hook) hook = { installed: false, reason: 'new document never became evaluable within 45s' };
  await sleep(Number(flags.settle || 6) * 1000);
  // gotoInTool 的两道落地校验照做：面板错误页 / 被重定向到别的报表都当失败。
  const landed = assertToolsShareAvailable(await evalPage('(() => JSON.stringify({ url: location.href, title: document.title, bodyText: (document.body?.innerText||"").slice(0, 1000) }))()'));
  const drift = routeMismatch(url, landed.url);
  if (drift) {
    throw new Error(redactSecrets(`Navigation landed on a different page than requested: requested route ${drift.requested}, landed route ${drift.landed}`));
  }

  let lastVis = null;
  const io = {
    now: () => Date.now(),
    sleep,
    readPage: async () => {
      if (lastVis === 'hidden') await bringChromeForward('hidden-read');
      const p = await evalPage(PAGE_READ_JS, 120_000);
      lastVis = p?.vis ?? lastVis;
      automation?.recordRead({ vis: p?.vis ?? null, label: 'readiness-read' });
      return p;
    },
    takeHook: async () => {
      const taken = await evalPage(HOOK_TAKE_JS, 120_000);
      return Array.isArray(taken) ? taken : [];
    },
    drain: async () => {
      const res = await opencli(['browser', launched.session, 'network', '--raw'], { env, timeoutMs: 180_000 });
      return firstJson(res.stdout).entries || [];
    },
    // opencli 没有可信滚轮输入（`browser scroll` 也是页面 JS），滚动后补派发 scroll 事件，照顾只听事件的懒加载。
    scrollTo: (y) => evalPage(`(() => { window.scrollTo(0, ${Math.max(0, Math.round(Number(y) || 0))}); try { window.dispatchEvent(new Event('scroll')); document.dispatchEvent(new Event('scroll')); } catch (e) {} return JSON.stringify({ y: window.scrollY }); })()`),
    scrollToText: (text, occurrence) => evalPage(scrollToTextJs(text, occurrence), 60_000),
  };
  const result = await runReadiness(io, {
    timeoutMs: Number(flags.timeout || 150) * 1000,
    intervalMs: Number(flags.interval || 2.5) * 1000,
    quietMs: Number(flags['quiet-ms'] || 4000),
    stepTimeoutMs: Number(flags['step-timeout'] || 15) * 1000,
    log: (m) => console.error(`[semrush-overview] ${redactSecrets(m)}`),
  });

  const page = result.lastPage || { toks: [] };
  const { found, groupIndex } = locateSections(page.toks || []);
  const firstTitle = Math.min(...[...Object.values(found), ...Object.values(groupIndex)].filter((i) => i !== null), (page.toks || []).length);
  const headerTokens = (page.toks || []).slice(0, firstTitle);
  // 页头里必须出现请求的域名——防「标签页停在别的域名的概览上」（2026-08-29 mmradar.gg 事故）。
  const targetConfirmed = headerTokens.some((t) => String(t).trim().toLowerCase() === domain);
  const quotaDisplay = headerTokens.find((t) => /^[\d,]+\s*\/\s*[\d,]+$/.test(String(t).trim())) || null;
  // 口径核对：页面地区选择器上被标成选中的是哪一个（全世界 / 国家码），外加落地 URL 的 db 参数。
  // 页面级口径：DOM（URL db / 国家 pill aria-checked / 全世界按钮）+ 接口（趋势关键词数 vs 各国家行）双证人。
  // 页面级趋势由 SEO 卡片显示值认出（同一次加载里还有一套研究分组级趋势，见 trendContext）。
  const rpcWitness = rpcScopeWitness(flattenRpc(result.rpcEntries || []), result.trendContext || {});
  let scopeEvidence;
  try {
    scopeEvidence = judgeScope({ requestedDb: db, probe: await evalPage(SCOPE_PROBE_JS, 60_000), rpcWitness });
  } catch (error) {
    scopeEvidence = { requested: scope, verdict: 'unverified', reason: `scope probe failed: ${redactSecrets(error.message).slice(0, 160)}`, rpc: rpcWitness };
  }
  // 区块级口径：研究分组徽标（整轮收集）+ 反链过滤条 + 接口本域名行。
  const sectionScopes = judgeSectionScopes({ requestedScope: scope, organicDb: organicDb || null, topScope: scopeEvidence, groupBadges: result.groupBadges, rpcWitness });

  const sections = {};
  for (const spec of SECTION_SPECS) {
    sections[spec.key] = { ...sectionOutput(spec, result.sections[spec.key], result.readiness.sectionTerminalAtMs[spec.key]), scope: sectionScopes.bySection[spec.key] };
  }
  // 「按意图」已经在 lib 里改取研究分组那套趋势（trendContext.organicPositions）；认不出那套时
  // 它的接口数据为空、退回 DOM 读数——不再用页面级趋势冒充分组口径。
  const verdict = result.verdict;
  // 「按意图」交叉校验：DOM 行 vs 所选研究分组趋势；SEO 卡片交叉校验已在 sectionOutput 里算好。两者不一致都阻断。
  const intentCheck = sections.intent.state === 'data'
    ? crossCheckIntent(result.sections.intent._dom?.content || [], result.sections.intent._rpc?.hasData ? result.sections.intent._rpc.data : null)
    : { status: 'not-applicable', checked: 0, mismatches: [] };
  sections.intent.crossCheck = intentCheck;
  const final = finalStatus({
    readinessVerdict: verdict, scopeEvidence, sectionScopes, targetConfirmed, visibility: result.readiness.visibility,
    crossChecks: { seo: sections.seo.data?.crossCheck, intent: intentCheck },
    trendContext: result.trendContext || null,
  });
  const extraBlockers = final.blockers;
  const status = final.status;

  const seoCard = sections.seo.data?.card || {};
  const legacy = Object.fromEntries(LEGACY_FIELDS.map((f) => [f, seoCard[f]]).filter(([, v]) => v !== null && v !== undefined));

  const scene = status === 'complete'
    ? null
    : await captureScene({
      session: launched.session, outDir: evidenceDir, evalPage, env,
      tag: 'incomplete', note: `semrush-overview ${domain}: ${verdict.incomplete.length} section(s) not terminal; network gate ${verdict.networkOk ? 'passed' : 'failed'}`,
    });
  if (status !== 'complete' || typeof flags['evidence-dir'] === 'string') {
    // 报表区 token 快照（丢掉页头：页头里有共享账号的档案信息），离线复核判据用。
    try {
      await mkdir(evidenceDir, { recursive: true });
      await writeFile(path.join(evidenceDir, 'semrush-overview-snapshot.json'), `${redactSecrets(JSON.stringify({
        domain, db: db || null, capturedAt: new Date().toISOString(),
        // 占位元素的 at 是整条 token 流里的位置，页头被裁掉之后要同步平移，快照才能离线复判。
        toks: (page.toks || []).slice(firstTitle),
        placeholders: (page.placeholders || []).map((p) => ({ ...p, at: p.at - firstTitle })),
        net: page.net || null, verdict, readiness: result.readiness,
        // 接口响应清单（只有 id / kind / 方法名 / 白名单请求参数 / 行数 / 字段名，不含数值），用于离线对账分类。
        rpcSummary: flattenRpc(result.rpcEntries || []).map((r) => ({
          id: r.id, kind: r.kind, method: r.method ?? null, requestParams: r.requestParams ?? null,
          rows: Array.isArray(r.result) ? r.result.length : null,
          keys: Array.isArray(r.result) ? Object.keys(r.result[0] || {}).slice(0, 40) : (r.result && typeof r.result === 'object' ? Object.keys(r.result).slice(0, 40) : typeof r.result),
        })),
      }, null, 1))}\n`, 'utf8');
    } catch { /* 快照是附加证据，写不出来不影响主输出 */ }
  }

  output = {
    version: 2,
    source: 'Semrush domain overview (full page) via authenticated Tools Share browser session',
    note: `organicTraffic 是 ${scope === 'global' ? '全球库' : `db=${scope} 这一个国家库`}的自然搜索流量估算，` +
      '与 Similarweb 的总访问量不是同一口径，不要并列比较。'
      + ' 要和 Similarweb 同口径的总访问量，用 semrush-traffic.mjs（Traffic & Market）。',
    retrievedAt: new Date().toISOString(),
    domain,
    db: db || null,
    scope,
    scopeEvidence,
    organicDb: organicDb || null,
    // 每个口径分组的期望/实际/判定；区块自己的 scope 也在 sections[key].scope。
    sectionScopes: { groups: sectionScopes.groups, blockers: sectionScopes.blockers },
    accountStateWrites,
    searchType,
    session: launched.session,
    title: page.title ?? landed.title ?? null,
    status,
    // 旧键名与含义不变（外加「流量比例」「付费关键词」）。只有 complete 才叫 metrics；
    // 否则换名 unconfirmedMetrics —— 读 metrics 的下游会显式拿到 undefined，而不是一份可能是占位值的数。
    ...(status === 'complete' ? { metrics: legacy } : { unconfirmedMetrics: legacy }),
    sections,
    completeness: {
      expected: verdict.expected,
      terminal: verdict.terminal,
      incomplete: verdict.incomplete,
      blockers: [...(verdict.blockers || []), ...extraBlockers],
      domOk: verdict.domOk,
      networkOk: verdict.networkOk,
      network: verdict.network,
      pagePlaceholders: verdict.pagePlaceholders,
      timedOut: verdict.timedOut,
      elapsedMs: Date.now() - started,
    },
    readiness: {
      ...result.readiness,
      decidedAt: new Date(result.readiness.startedAt + result.readiness.decidedAtMs).toISOString(),
      startedAt: new Date(result.readiness.startedAt).toISOString(),
      captureArm: armOutput,
      hook,
      visibilityActions,
      automationWindow: automation ? automation.summary() : plainAutomationSummary({ windowMode }),
      trendContext: result.trendContext || null,
      targetConfirmed,
      rule: 'complete ⇔ 每个期望区块 ∈ {data, empty, locked, absent} 且报表区无占位元素，并且同一轮 CDP /dpa/rpc 发出数 = 资源计时完成数、drain 无在途、页内钩子在途为 0、最后一个 rpc 返回距今 ≥ quiet 窗口；超时即 incomplete。',
    },
    notCovered: NOT_COVERED,
    automationWindow: automation ? automation.summary() : plainAutomationSummary({ windowMode }),
    quotaDisplay,
    subscription: {
      expiry: launched.state.expiry,
      daysLeft: launched.state.daysLeft,
      quotas: launched.state.quotas,
      via: launched.state.via ?? null,
      warning: expiryWarning(launched.state),
    },
    ...(scene ? { evidence: scene } : {}),
  };
  console.error(`[semrush-overview] ${domain} status=${status} terminal=${verdict.terminal}/${verdict.expected} network=${verdict.networkOk ? 'ok' : (verdict.network?.reasons || []).join(';')}`);
  for (const [key, s] of Object.entries(sections)) console.error(`  ${s.state.padEnd(12)} ${key}${s.reason ? `  (${s.reason})` : ''}`);
} catch (error) {
  // 先取证后死：释放锁之前把此刻的穿透 census + 截图成对落盘。captureScene 永不 throw。
  const scene = launched
    ? await captureScene({
      session: launched.session, outDir: evidenceDir, evalPage: launched.evalPage, env: launched.env,
      tag: 'unavailable',
      note: `semrush-overview ${domain}: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    })
    : null;
  output = {
    version: 2,
    source: 'Semrush domain overview (full page) via authenticated Tools Share browser session',
    retrievedAt: new Date().toISOString(),
    domain,
    db: db || null,
    scope,
    session,
    status: 'unavailable',
    evidence: scene,
    notCovered: NOT_COVERED,
    // opencli 的报错里可能带着 __gmitm 令牌（它会打印活动会话的完整 URL）。
    error: { code: 'overview_failed', message: redactSecrets(error.message) },
    automationWindow: launched?.automationWindow?.summary() ?? error?.automationWindow
      ?? plainAutomationSummary({ windowMode, reason: launchWindow === VIRTUAL_DISPLAY_WINDOW ? 'launch-failed-before-prepare' : 'explicit-window-mode' }),
  };
} finally {
  // 判定结束（complete / incomplete / unavailable 都已定）之后才释放；本脚本从不关闭标签页。
  await launched?.releaseBrowserLocks();
}

if (typeof flags.out === 'string') {
  await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
}
printJson(output);
// 只有 complete 以 0 退出：批量脚本靠退出码决定要不要重跑。
if (output.status !== 'complete') process.exitCode = 1;
