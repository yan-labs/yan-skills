#!/usr/bin/env node
/**
 * similarweb-keywords.mjs —— 从一个种子词批量扩词（Similarweb 关键词生成器）。
 *
 * 为什么单独一个脚本：`similarweb-query.mjs` 整个契约是「查一个域名的报表」，
 * 入口第一行就是 `normalizeDomain(required(flags, 'domain'))`。词维度和域名维度
 * 是两种主体，Semrush 那边也是 `semrush-report.mjs` / `semrush-keyword.mjs` 这样分的。
 * **但解析只有一份**，住在 `lib-similarweb.mjs`——这里不重复任何取值逻辑。
 *
 * 它补的是选词流水线的入口。`rankup/references/experiences/demand-discovery.md`
 * 记的规模是「1,309 个词根 → Similarweb 扩出 97,681 个关键词」，而这一步此前完全
 * 没有脚本，整条流水线卡在源头。
 *
 * 用法：
 *   node similarweb-keywords.mjs --seed "nonogram"
 *   node similarweb-keywords.mjs --seed "nonogram" --tab relatedKeywords --out kw.json
 *   node similarweb-keywords.mjs --seed-file roots.txt --tab relatedKeywords --out kw.jsonl --jsonl
 *
 * 参数：
 *   --seed <词>            种子词（与 --seed-file 二选一）
 *   --seed-file <file>     一行一个种子词，批量跑；复用同一个会话
 *   --tab <t>              phraseMatch（默认，词组匹配）| relatedKeywords（相关词，量最大）
 *                          | trending（热门）| questions（问题查询）
 *   --country <code>       国家代码，不传时代码里落到 999（Similarweb 的全球代码，
 *                          实测确认过），不是真的"不传这一段"——跟 Semrush 那边
 *                          "不传 --db 只是落到某个不可预测的默认库"是两回事，
 *                          Similarweb 的 999 就是产品自带的 Worldwide 选项
 *   --out <file>           落盘；配 --jsonl 时一行一个词
 *   --jsonl                以 JSON Lines 输出词行，便于几万行的批量
 *   --session <name>       忽略：similarweb 是配额站，会话名固定为 similarweb-nav
 *                          （传了会打一行 stderr；--allow-parallel-session 才放行）
 *   --settle <s>           首屏等待秒数（默认 18）
 *   --timeout <s>          单个种子词的整体超时（默认 120）
 *   --keep-open            跑完保留标签页
 *   --window <mode>         virtual-display（默认，见 lib-automation-window.mjs；检测不到虚拟屏幕回退 active）
 *                           / foreground / active / background / isolated——
 *                           显式传 opencli 四档之一就原样透传给 opencli，不走虚拟屏幕；回退默认 active
 *   --automation-display <name|/re/|off>  虚拟屏幕名匹配（也可用环境变量 BACKLINK_AUTOMATION_DISPLAY）
 *                           （选中标签页、不节流，但不夺 OS 焦点）。2026-09-14
 *                           之前这个 flag 虽然写在 launchTool 调用里，但传的是
 *                           整个 flags 对象而不是 window 字段，从未真正生效过，
 *                           一直是隐式的 background——这次一并修正。
 *   --accept-window-fallback 页面实际显示的窗口跟请求的 28d 不一致时，默认拒绝
 *                          收下（该词 status: "scope-mismatch"，词落进
 *                          unconfirmedRows）——传这个 flag 才把页面实际窗口
 *                          当权威口径正常收下
 *   --self-test            离线自检
 *   --help
 *
 * 【必须知道的两条】
 * 1. **这张表在 DOM 里按列渲染**，innerText 是「行号一块、关键词一块」，按行切分必错位。
 *    提取器和解析器都在 lib 里，理由写在那边。
 * 2. **本脚本只读当前页**（100 行）。页面自报的总量写进 `shownTotal`，
 *    `complete` 明确告诉你读全了没有——不做静默截断。
 *
 * 2026-08-30 双证人化：table_never_settled 与整体失败在退出前 captureScene
 * （穿透 census + 截图）落进 --evidence-dir，行内/输出带证据路径——
 * 「表没稳定」和「这个词没有扩展词」必须能对着现场分辨。截图链路已实盘验证。
 */
import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import {
  closeSession, resolveSession, parseFlags, printJson,
  showHelpIfRequested, validateSession,
} from './opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW } from './lib-automation-window.mjs';
import { captureScene, defaultSceneDir } from './lib-evidence-scene.mjs';
import {
  deriveKeywordRows, findWindowLabel, compareWindowToRequest, parseNumber, resolveSimilarwebWindowMode, SW_KEYWORD_TABLE_CELLS,
} from './lib-similarweb.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);

/** 标签页决定扩词口径。值是从页面上点出来的，不是猜的。 */
const TABS = new Set(['phraseMatch', 'relatedKeywords', 'trending', 'questions']);
const tab = String(flags.tab || 'phraseMatch');
if (!TABS.has(tab)) {
  console.error(`--tab must be one of: ${[...TABS].join(', ')}`);
  process.exit(2);
}

const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN || 'https://sim.3ue.co').replace(/\/+$/, '');
const country = String(flags.country || '999');
const settle = Number(flags.settle || 18);
const timeoutMs = Number(flags.timeout || 120) * 1000;
// 见下面 windowCompare 分支：确认窗口不一致时默认拒绝收下，传这个才接受。
const acceptWindowFallback = Boolean(flags['accept-window-fallback']);
// 这条路由的窗口段硬编码在 routeFor 里，永远是 28d——跟页面正文渲染出的窗口
// 文案比对时复用这一个常量，不要在两处各写一遍 '28d'。
const REQUESTED_WINDOW_SEG = '28d';

/**
 * 三档状态判定，跟 similarweb-query.mjs 的 decideScopeStatus 是同一套原则
 * （2026-09-13 二次复核）：主循环和 --self-test 调同一份逻辑，不重新拼一遍。
 *   - `blocked`：确认窗口不一致且没有接受放宽——立即（不等超时）判 scope-mismatch，
 *     词落进 unconfirmedRows，不进 rows。
 *   - `ok-window-fallback-accepted`：确认不一致，但显式接受了放宽。
 *   - `ok-unverified`：没有确认的不一致，但窗口读不到，或者加载指示器 DOM
 *     本次没有实测确认过（`loadingIndicatorUnverified` 恒为 true，直到有一次
 *     实测确认了这张页面具体用的加载指示器 class/属性为止）。
 *   - `ok`：理论上限——目前 loadingIndicatorUnverified 恒为 true，所以这一档
 *     暂时打不到，如实反映"这个维度还没被验证过"，不是 bug。
 */
function decideKeywordsScopeStatus({ windowMatchesRequest, acceptWindowFallback: accept }) {
  const loadingIndicatorUnverified = true;
  if (windowMatchesRequest === false && !accept) {
    return { blocked: true, status: 'scope-mismatch' };
  }
  if (windowMatchesRequest === false && accept) {
    return { blocked: false, status: 'ok-window-fallback-accepted' };
  }
  const windowUnverified = windowMatchesRequest === null;
  return { blocked: false, status: (windowUnverified || loadingIndicatorUnverified) ? 'ok-unverified' : 'ok' };
}

function routeFor(seed) {
  return `${appOrigin}/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/${encodeURIComponent(country)}/28d`
    + `?searchEngine=google&webSource=Total&isWWW=*&tab=${tab}&keyword=${encodeURIComponent(seed)}`;
}

/** 页面自报的「显示的关键词总数」，用来判断读全了没有。 */
function shownTotal(text) {
  const m = String(text).match(/([\d,.]+[KMB万]?)\s*\n\s*显示的关键词总数/);
  return m ? parseNumber(m[1]) : null;
}

if (flags['self-test']) {
  const cells = {
    headers: ['关键词', '28 天的体量', '平均体量', '年趋势', '零点击搜索', 'KD', '意图', 'CPC'],
    rows: [
      ['nonograms', '106.1K', '74.2K', '', '44%', '60', 'NAV\nINFO', '$1.21'],
      ['dash keyword', '-', '', '', '', '', '', ''],
      ['', '', '', '', '', '', '', ''],
    ],
  };
  const parsed = deriveKeywordRows(cells);
  // 列顺序换了，按名取值的结果必须不变。
  const swap = (a, i, j) => { const c = [...a]; [c[i], c[j]] = [c[j], c[i]]; return c; };
  const shuffled = deriveKeywordRows({ headers: swap(cells.headers, 1, 5), rows: cells.rows.map((r) => swap(r, 1, 5)) });
  // 列名改了要报出来，不能悄悄给 null。
  const renamed = deriveKeywordRows({ headers: cells.headers.map((h) => (h === 'KD' ? 'Difficulty' : h)), rows: cells.rows });
  const ok = parsed.rows.length === 2
    && parsed.rows[0].volume28d === 106100 && parsed.rows[0].cpc === 1.21
    && parsed.rows[0].zeroClickPercent === 44 && parsed.rows[0].intent.join('|') === 'NAV|INFO'
    // `-` 是「没有值」，落成 0 会被下游读成「这个词没人搜」。
    && parsed.rows[1].volume28d === null && parsed.rows[1].kd === null
    && parsed.missingColumns.length === 0
    && JSON.stringify(shuffled.rows) === JSON.stringify(parsed.rows)
    && renamed.missingColumns.includes('KD') && renamed.rows[0].kd === null
    && shownTotal('8,888\n显示的关键词总数') === 8888
    && TABS.has('relatedKeywords') && routeFor('a b').includes('keyword=a%20b');
  if (!ok) throw new Error(`similarweb-keywords self-test failed: ${JSON.stringify({ parsed, shuffled, renamed })}`);

  // 时间窗口证据：这条路由永远请求 28d，跟页面正文渲染出的窗口文案比对。
  const matchLabel = findWindowLabel(['关键词', '最后 28 天数 (As of Sep 09)', '所有流量']);
  const matchCmp = compareWindowToRequest(matchLabel, REQUESTED_WINDOW_SEG);
  const pollutedLabel = findWindowLabel(['关键词', 'Mar 2026 - Aug 2026 (6 月)', '所有流量']);
  const pollutedCmp = compareWindowToRequest(pollutedLabel, REQUESTED_WINDOW_SEG);
  const noLabelCmp = compareWindowToRequest(null, REQUESTED_WINDOW_SEG);
  const windowOk = matchCmp.matches === true
    && pollutedCmp.matches === false // 窗口污染必须被认成不一致，不能默认放过
    && noLabelCmp.matches === null; // 页面读不到窗口文案时是「不知道」，不是猜一个真假出来
  if (!windowOk) {
    throw new Error(`similarweb-keywords self-test failed [window scope]: ${JSON.stringify({ matchCmp, pollutedCmp, noLabelCmp })}`);
  }

  // 2026-09-13 二次复核：decideKeywordsScopeStatus 三档判定的直接回归——
  // "确认不一致就必须 blocked"是核心，其余三档不能互相串。
  const decisions = {
    matched: decideKeywordsScopeStatus({ windowMatchesRequest: true, acceptWindowFallback: false }),
    mismatchBlocked: decideKeywordsScopeStatus({ windowMatchesRequest: false, acceptWindowFallback: false }),
    mismatchAccepted: decideKeywordsScopeStatus({ windowMatchesRequest: false, acceptWindowFallback: true }),
    unverified: decideKeywordsScopeStatus({ windowMatchesRequest: null, acceptWindowFallback: false }),
  };
  const decisionsOk =
    // 窗口匹配，但 loadingIndicatorUnverified 恒为 true——目前不可能是纯 "ok"，
    // 如实反映"这个维度还没被验证过"。
    decisions.matched.blocked === false && decisions.matched.status === 'ok-unverified'
    && decisions.mismatchBlocked.blocked === true && decisions.mismatchBlocked.status === 'scope-mismatch'
    && decisions.mismatchAccepted.blocked === false && decisions.mismatchAccepted.status === 'ok-window-fallback-accepted'
    && decisions.unverified.blocked === false && decisions.unverified.status === 'ok-unverified';
  if (!decisionsOk) {
    throw new Error(`similarweb-keywords self-test failed [decideKeywordsScopeStatus]: ${JSON.stringify(decisions)}`);
  }
  console.log('similarweb-keywords self-test: PASS');
  process.exit(0);
}

const seeds = flags['seed-file']
  ? readFileSync(String(flags['seed-file']), 'utf8').split('\n').map((l) => l.trim()).filter(Boolean)
  : [String(flags.seed || '').trim()].filter(Boolean);
if (!seeds.length) {
  console.error('--seed or --seed-file is required.');
  process.exit(2);
}

const session = resolveSession(flags, 'similarweb-keywords', 'similarweb');
// 失败现场的落点。默认贴着 --out（`x.json.evidence/`），没有 --out 进 .backlink/。
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'similarweb-keywords' });
const results = [];
let launched;
const fallbackWindowMode = resolveSimilarwebWindowMode(flags.window === VIRTUAL_DISPLAY_WINDOW ? undefined : flags.window);
const windowStrategy = resolveWindowStrategy({ windowFlag: flags.window, fallbackWindowMode });
let launchError = null;
try {
  // 2026-09-14：这里此前把整个 `flags` 对象当成一个属性传给 launchTool——
  // launchToolInner 只解构认识的字段名，`flags` 不在其中，于是被静默丢弃，
  // `window` 参数从未真正生效过，一直落在 launchToolInner 的默认值
  // `'background'` 上，`--window` 这个 CLI flag（如果有人传）从来没起过作用。
  // 顺手一起修：显式传 `window`，默认 `active`（选中标签页、不节流，不夺
  // OS 焦点），跟 similarweb-query.mjs/similarweb-batch.mjs 同一次修复统一默认。
  launched = await launchTool({
    tool: 'similarweb', session, window: windowStrategy.launchWindow, fallbackWindow: fallbackWindowMode,
    automationDisplay: flags['automation-display'],
    allowParallelSession: Boolean(flags['allow-parallel-session']),
  });
  const evaluate = launched.evalPage;

  for (const seed of seeds) {
    // hash 路由的 SPA：换 hash 不重载页面，深链之后必须等它自己渲染完。
    await launched.automationWindow?.ensureVisible('before-navigation');
    await gotoInTool(evaluate, routeFor(seed), settle);
    const settled = await captureStable({
      read: async () => {
        const cap = await evaluate(`(() => JSON.stringify({
        visibilityState: document.visibilityState,
        text: (document.body?.innerText || '').slice(0, 40000),
        cells: ${SW_KEYWORD_TABLE_CELLS},
      }))()`);
        if (launched.automationWindow) {
          launched.automationWindow.recordRead({ vis: cap?.visibilityState ?? null, label: 'keywords-read' });
          if (cap?.visibilityState === 'hidden') await launched.automationWindow.ensureVisible('hidden-read');
        }
        return cap;
      },
      // 就绪判据认**表体**：标签页和筛选器在骨架阶段就在了，认它们会抓到空表。
      // fingerprint 是整份 { headers, rows, missingColumns } 的 JSON——行数或任意
      // 一格内容还在变时，两次读数的字符串就不相等，指纹不会稳，不需要另外
      // 单独去比行数。
      fingerprint: (cap) => {
        if (!cap?.cells?.rows?.length) return null;
        const parsed = deriveKeywordRows(cap.cells);
        return parsed.rows.length ? JSON.stringify(parsed) : null;
      },
      // 显式写出来，不依赖 captureStable 的默认值——2026-09-13 审计点名过这里
      // "无固定次数确认"，实测默认值其实已经是 2，但**依赖一个没写在这个文件里
      // 的默认值**本身就是隐患（库的默认值以后变了，这里不会跟着报错，行为却
      // 悄悄变了）。至少连续两次行数与内容一致，才收下。
      //
      // 「+ 无加载占位」（审计原话）本轮**没有**实现成硬性阻断条件：这张页面
      // 用的加载指示器/骨架屏具体是什么 class、什么 aria 属性，本次审计没有
      // 实测记录，本仓库现在也不能开浏览器去确认（另一个 checker 正在独占）。
      // 硬编码一个没验证过的选择器风险是不对称的——猜错方向信号最多是「多一次
      // 不知道」，但猜错"是否在加载"这个判据一旦选择器命中了不该命中的东西，
      // 会让这张表永远等不到 stable，把所有正常查询都拖到超时，比现在的问题更糟。
      // 留在待实测清单里，等有条件实测到具体 class/属性后再接进来。
      needed: 2,
      timeoutMs,
      intervalMs: Number(flags['stable-interval'] || 2.5) * 1000,
    });

    if (!settled.stable) {
      // **先取证后落行**：表没稳定的那一刻页面长什么样（骨架？空态句？限流页？），
      // 只有此刻拍得到。captureScene 永不 throw；行内带证据路径。
      const scene = await captureScene({
        session, outDir: evidenceDir, evalPage: evaluate, tag: `seed-${results.length + 1}-never-settled`,
        note: `similarweb-keywords "${seed}" (tab=${tab}): table never settled in ${timeoutMs / 1000}s`,
      });
      results.push({ seed, tab, country, status: 'unavailable', evidence: scene, error: { code: 'table_never_settled', message: `等了 ${timeoutMs / 1000}s 表体没有稳定下来——不是「这个词没有扩展词」` } });
      continue;
    }
    const parsed = JSON.parse(settled.fingerprint);
    const total = shownTotal(settled.capture.text);
    // 这条路由永远请求 28d（见 routeFor），跟页面正文渲染出的窗口文案比对——
    // 跟 similarweb-query.mjs 的 scopeEvidence 是同一件事的轻量版。这里**没有**
    // 核对国家口径：country 是这个脚本唯一一个真的可以传非 999 值的地方，
    // 而我们只有"页面显示不显示『全球』这个词"这一条弱文本信号，只对 999
    // 有意义——传了具体国家代码时没有可靠的办法核对页面上显示的是不是那个
    // 国家（没有代码→显示名的映射），留作待实测，不在这里编一个假信号出来。
    const lines = String(settled.capture.text || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
    const windowLabel = findWindowLabel(lines);
    const windowCompare = compareWindowToRequest(windowLabel, REQUESTED_WINDOW_SEG);
    const windowUnverified = windowLabel === null || windowCompare.matches === null;
    const decision = decideKeywordsScopeStatus({ windowMatchesRequest: windowCompare.matches, acceptWindowFallback });

    // **2026-09-13 二次复核：确认窗口不一致时不能只打一行 stderr、词照样收下**——
    // 那仍然是"以为抓到了、其实没抓到"，大多数只看 `rows` 的消费代码不会去翻
    // windowMatchesRequest。默认这一条判非成功，词降级进 unconfirmedRows；
    // 传 --accept-window-fallback 才把页面实际窗口当权威口径正常收下。
    if (decision.blocked) {
      results.push({
        seed, tab, country, status: decision.status,
        shownTotal: total,
        unconfirmedRows: parsed.rows,
        rowsRead: parsed.rows.length,
        missingColumns: parsed.missingColumns,
        reads: settled.reads,
        windowLabel, windowRequested: REQUESTED_WINDOW_SEG, windowActual: windowLabel, windowMatchesRequest: windowCompare.matches,
        error: {
          code: 'window_scope_mismatch',
          message: `The Similarweb keyword-generator table for seed "${seed}" rendered window ${windowLabel}, ` +
            `not the requested ${REQUESTED_WINDOW_SEG}. Data is under unconfirmedRows, not rows. Rerun with ` +
            '--accept-window-fallback to accept the rendered window as authoritative.',
        },
      });
      console.error(
        `[scope-mismatch] ${seed} (tab=${tab}): 页面显示的窗口(${windowLabel})跟请求的窗口` +
        `(${REQUESTED_WINDOW_SEG})不一致，且未传 --accept-window-fallback——判定 scope-mismatch，词落进 unconfirmedRows。`,
      );
      continue;
    }
    if (decision.status === 'ok-window-fallback-accepted') {
      console.error(
        `[scope-mismatch-accepted] ${seed} (tab=${tab}): 请求 ${REQUESTED_WINDOW_SEG}，` +
        `接受页面实际窗口 ${windowLabel} 作为权威口径（--accept-window-fallback）。`,
      );
    }
    if (windowUnverified) {
      console.error(`[window-unverified] ${seed} (tab=${tab}): 页面上没能读到可识别的窗口文案，windowUnverified=true。`);
    }
    results.push({
      seed, tab, country, status: decision.status,
      shownTotal: total,
      rows: parsed.rows,
      rowsRead: parsed.rows.length,
      // 少读了必须说出来，别让调用方以为这就是全部。
      complete: total === null ? null : parsed.rows.length >= total,
      // 跟 complete 是同一件事的反面，只是换成审计报告要求的字段名，两个字段并存。
      truncated: total === null ? null : parsed.rows.length < total,
      missingColumns: parsed.missingColumns,
      reads: settled.reads,
      windowLabel,
      windowRequested: REQUESTED_WINDOW_SEG,
      windowActual: windowLabel,
      windowMatchesRequest: windowCompare.matches,
      windowUnverified,
      // 同 similarweb-query.mjs 的理由：这张页面的加载指示器/骨架屏 DOM 本次
      // 没有实测确认过（另一个 checker 正在独占浏览器），恒为 true，直到有
      // 一次实测确认了具体 class/属性为止——不能因为"没测到加载中"就说成
      // "确认没有"，见 decideKeywordsScopeStatus 顶部注释。
      loadingIndicatorUnverified: true,
    });
    if (total !== null && parsed.rows.length < total) {
      console.error(`[partial] ${seed}: 页面自报 ${total} 个词，本次只读到 ${parsed.rows.length} 个（当前页）。`);
    }
    // 缺列要在 stderr 上说，不能只写进 JSON 里等人去翻——不同标签页的列并不一样，
    // 实测 relatedKeywords 没有「28 天的体量」这一列，那一列会整列是 null。
    if (parsed.missingColumns.length) {
      console.error(`[missing-columns] ${seed} (tab=${tab}): ${parsed.missingColumns.join('、')} —— 这些字段整列为 null，不是「没有数据」。`);
    }
  }
} catch (error) {
  // **先取证后关**：finally 会 closeSession 销毁唯一证人，现场必须在这里落。
  const scene = launched
    ? await captureScene({
      session, outDir: evidenceDir, evalPage: launched.evalPage, tag: 'query-failed',
      note: `similarweb-keywords: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    })
    : null;
  launchError = error;
  results.push({ status: 'unavailable', evidence: scene, error: { code: 'query_failed', message: redactSecrets(error.message) } });
} finally {
  await launched?.releaseBrowserLocks?.();
  if (!flags['keep-open']) await closeSession(session);
}

const output = {
  version: 1,
  source: 'Similarweb keyword generator via authenticated Tools Share browser session',
  retrievedAt: new Date().toISOString(),
  tab, country, session,
  subscription: launched ? {
    expiry: launched.state.expiry, daysLeft: launched.state.daysLeft,
    quotas: launched.state.quotas, warning: expiryWarning(launched.state),
  } : null,
  seeds: results,
  automationWindow: launched?.automationWindow?.summary() ?? launchError?.automationWindow
    ?? plainAutomationSummary({ windowMode: fallbackWindowMode, reason: windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? 'launch-failed-before-prepare' : 'explicit-window-mode' }),
};

if (flags.jsonl) {
  const lines = results.flatMap((r) => (r.rows || []).map((row) => JSON.stringify({ seed: r.seed, tab, country, ...row })));
  if (typeof flags.out === 'string') await writeFile(String(flags.out), `${lines.join('\n')}\n`, 'utf8');
  else console.log(lines.join('\n'));
} else {
  if (typeof flags.out === 'string') await writeFile(String(flags.out), `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  printJson(output);
}
// 'unavailable'（表没稳定）/ 'scope-mismatch'（确认窗口不一致、未接受放宽）/
// 'ok-unverified' / 'ok-window-fallback-accepted'（至少一项没能独立确认，或
// 确认不一致但被显式接受）——只有全部种子都是纯 'ok' 才退出码 0。
if (results.some((r) => r.status !== 'ok')) process.exitCode = 1;
