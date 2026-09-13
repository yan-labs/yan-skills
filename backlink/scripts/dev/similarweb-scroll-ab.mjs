#!/usr/bin/env node
/**
 * similarweb-scroll-ab.mjs —— 滚动 A/B 对照实验（诊断脚本，2026-09-13 第五轮新增）。
 *
 * ============================================================================
 * **本轮只写代码，不运行。** 协调者原话："Chrome 现在被 Semrush report 的
 * agent 独占实测，你不许开浏览器、不许实跑。" 这份文件从写完到这一轮结束
 * 没有被执行过一次——`node --check` 和人工代码走查之外没有更强的验证。
 * 等 Chrome 不再被占用、协调者明确批准实测之后，再真的跑它。
 * ============================================================================
 *
 * 背景：round 4 已经用真实生产脚本（不是 Claude in Chrome 探索工具）确认了
 * 滚动容器选择器 `.sw-layout-scrollable-element`，但没能做成"隐藏 vs 可见"
 * 或者"零滚动 vs 滚到底"的对照实验——round 4 用来探索 DOM 结构的浏览器
 * 自动化通道本身恒为 `document.hidden === true`，`open -a "Google Chrome"`/
 * `osascript activate` 都无法改变它，没法在那个通道里做真实的可见性对照。
 *
 * 这份脚本改用跟 similarweb-query.mjs **同一套** `lib-tools-share.mjs` 的
 * `launchTool`/`gotoInTool`/`captureStable` 基础设施——那是真实、可控、由
 * opencli 驱动的 Chrome 窗口，不是探索工具那种恒隐藏的自动化通道。
 *
 * **2026-09-13 第五轮中途修正：不主动抬前台。** 协调者反馈用户已经在抱怨
 * 现有脚本（similarweb-query.mjs 对四个长表报表的自动前台）反复把 Chrome
 * 抬到前台、抢走电脑焦点——这份新脚本不能在这个反馈之后又加一处新的抬前台
 * 逻辑。所以这里**默认不强制前台**（`--activate-chrome` 默认 `false`，
 * 跟 similarweb-query.mjs"先保持现状"的默认值不同——那边是已有行为要保留，
 * 这里是全新代码，不该顺手引入一个刚刚被投诉的模式）。这意味着默认情况下
 * A/B 两组测的是"零滚动 vs 滚到底"，而不是"隐藏 vs 可见"——标签页实际的
 * `hidden`/`visibilityState` 是自然状态（取决于用户当时有没有把 Chrome
 * 窗口摆在前面），两组读数里仍然会如实记录这两个字段，只是脚本自己不会去
 * 主动争取"可见"这个条件。真的需要连着"隐藏 vs 可见"一起测时，显式传
 * `--activate-chrome true`，跟 Semrush 那边的参数同名。
 *
 * 对同一个报表连续做两组读数：
 *   A 组（零滚动）：导航落地、初次 settle 之后立刻读一次 DOM——过程中不执行
 *     任何 `scrollTop=`/`scrollTo(...)` 赋值，只读当前自然状态。
 *   B 组（滚到最终底部）：执行滚动探针（`scrollTop = scrollHeight` +
 *     `window.scrollTo`），用 `captureStable` 轮询到一个稳定的、`atBottom`
 *     为真的读数。
 * 然后比较两组的：行数（对 audience-geo/channels/audience-interests/
 * site-keywords 这几个已知结构的报表，用 lib-similarweb.mjs 里已经测过的
 * derive 函数算行数，不是自己另写一套数行逻辑）、`scrollHeight`（滚动前后
 * 内容高度有没有变化，变化了说明滚动触发了新内容加载）、`bodyText` 长度。
 *
 * **verdict 的判定是保守的**：
 *   - 'not-needed'：A 组的行数/scrollHeight 已经跟 B 组一致（滚不滚都一样），
 *     判定这个报表不依赖滚动到底。
 *   - 'needed'：A 组明显不完整（行数更少，或者 B 组滚动之后 scrollHeight
 *     变大——说明滚动确实触发了新内容），判定必须滚到底才算数。
 *   - 'inconclusive'：两组读数没法干净地分出上面两种情况（比如报表本身
 *     rowsRead/totalRowsOnPage 都读不到）——**不强行给一个 verdict**，
 *     原始的 A/B 读数仍然会写进输出，留给人工看一眼再判断，不能让一次
 *     含糊的对照结果自动变成某个报表的既定结论。
 *
 * **切换 SCROLL_AB_CONCLUSIONS 是手动的，这个脚本不自动写回去。** 看完
 * 这份脚本的输出、确认 verdict 站得住脚之后，去
 * `backlink/scripts/similarweb-query.mjs` 手动把对应报表的条目改成
 * `{ concluded: true, verdict: '...', date: '...', notes: '...' }`。
 *
 * 用法：
 *   node backlink/scripts/dev/similarweb-scroll-ab.mjs --domain example.com --report audience-geo
 *   node backlink/scripts/dev/similarweb-scroll-ab.mjs --domain example.com --report site-keywords --out ab-result.json
 *
 * 参数：
 *   --domain <d>   必填。
 *   --report <r>   audience-geo（默认）| channels | audience-interests | site-keywords
 *                  ——只有这四个报表被判定需要"前台窗口 + 滚动证据"，见
 *                  similarweb-query.mjs 的 SCROLL_GATED_REPORTS。
 *   --out <file>   落盘 JSON（同时仍然打印到 stdout）。
 *   --node <n>     面板节点，同 similarweb-query.mjs。
 *   --timeout <s>  B 组 captureStable 的整体超时（默认 150 秒）。
 *   --activate-chrome <b>  false（默认）| true——是否让 launchTool 用前台
 *                  窗口（会把 Chrome 抬到 OS 前台、抢走当前焦点）。默认关闭，
 *                  见文件头部"不主动抬前台"那段说明；传 true 才会连着
 *                  "隐藏 vs 可见"一起测。跟 Semrush 脚本同名参数。
 *   --keep-open    跑完保留标签页，方便肉眼复核。
 *   --help         本说明。
 */
import { writeFile } from 'node:fs/promises';
import {
  closeSession, parseFlags, printJson, required, resolveSession, showHelpIfRequested,
} from '../opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from '../lib-tools-share.mjs';
import { captureScene, defaultSceneDir, sceneSummaryLine } from '../lib-evidence-scene.mjs';
import {
  deriveAudienceInterestsRows, deriveChannelDetailRows, deriveGeoRows, deriveSiteKeywordRows,
  SIMILARWEB_SCROLL_READ_ONLY_PROBE_JS, SIMILARWEB_SCROLL_PROBE_JS, SW_GEO_TABLE_CELLS, SW_ROW_MAJOR_TABLE_CELLS,
} from '../lib-similarweb.mjs';

// 复制自 similarweb-query.mjs 的 normalizeDomain——一个纯函数，够小、够稳定，
// 为了不在"完全离线"的这一轮改动那份正在跑的生产脚本，接受这处受控范围的
// 重复；两份如果哪天都要改，记得一起改。
function normalizeDomain(value) {
  const candidate = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  const normalized = candidate.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalized)) {
    throw new Error(`Invalid domain: ${value}`);
  }
  return normalized;
}

// 四个滚动受控报表各自的 URL 模板 + 表格提取器——**复制自
// similarweb-query.mjs 的 REPORT_PATHS/CELL_EXTRACTORS**，同样是"完全离线"
// 约束下不去重构那份已经在跑的生产代码而接受的受控重复。这份路由如果哪天
// 变了，两边都要改，已经在两处注释里互相点名。
const AB_REPORT_PATHS = {
  channels: '/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d/?webSource=Total&key=',
  'audience-geo': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=geography&key=',
  'audience-interests': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=audienceInterests&key=',
};
const AB_CELL_EXTRACTORS = {
  channels: SW_GEO_TABLE_CELLS,
  'audience-geo': SW_GEO_TABLE_CELLS,
  'audience-interests': SW_GEO_TABLE_CELLS,
  'site-keywords': SW_ROW_MAJOR_TABLE_CELLS,
};
const AB_ROW_DERIVERS = {
  channels: (cells) => deriveChannelDetailRows(cells).rowsRead,
  'audience-geo': (cells) => deriveGeoRows(cells).rowsRead,
  'audience-interests': (cells) => deriveAudienceInterestsRows(cells).rowsRead,
  'site-keywords': (cells) => deriveSiteKeywordRows(cells).rowsRead,
};
const AB_REPORTS = new Set(['audience-geo', 'channels', 'audience-interests', 'site-keywords']);

function buildReportUrl(appOrigin, report, domain) {
  if (report === 'site-keywords') {
    // site-keywords 固定用 total 子 tab + 1m 窗口做这组对照——子 tab/窗口的
    // 选择跟"滚不滚到底"这件事无关，不需要在这里把 --traffic-tab 的组合
    // 也铺开测一遍。
    const pageFilter = encodeURIComponent(JSON.stringify([{ url: domain, searchType: 'domain' }]));
    return `${appOrigin}/#/organicsearch/pageAnalysis/website-keyword-v2/*/999/1m` +
      `?key=${encodeURIComponent(domain)}&pageFilter=${pageFilter}&webSource=Total&selectedPageTab=Total&comparedDuration=`;
  }
  return `${appOrigin}${AB_REPORT_PATHS[report]}${encodeURIComponent(domain)}`;
}

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const domain = normalizeDomain(required(flags, 'domain'));
const report = AB_REPORTS.has(flags.report) ? flags.report : 'audience-geo';
const session = resolveSession(flags, 'similarweb-scroll-ab', 'similarweb');
const timeoutMs = Math.max(30_000, Math.min(240_000, Number(flags.timeout || 150) * 1000));
const keepOpen = Boolean(flags['keep-open']);
// 2026-09-13 第五轮中途修正：默认 false，不主动抬前台——见文件头部大段
// 说明。跟 similarweb-query.mjs/Semrush 保持同名参数、同样的字符串判定方式。
const activateChrome = String(flags['activate-chrome'] ?? 'false') === 'true';
const windowMode = activateChrome ? 'foreground' : 'background';
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN || 'https://sim.3ue.co').replace(/\/+$/, '');
const evidenceDir = defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'similarweb-scroll-ab', runTag: `${domain}-${report}` });

let evaluate = null;
let launched;
let output;
try {
  launched = await launchTool({
    session, tool: 'similarweb', node: flags.node, window: windowMode,
    wait: Number(flags.wait || 7), timeout: Number(flags.launchTimeout || 60),
    allowParallelSession: Boolean(flags['allow-parallel-session']),
  });
  evaluate = launched.evalPage;
  // 2026-09-13 补上：跟 similarweb-query.mjs 一样把配额原文留痕——这是共享
  // 账号，诊断脚本消耗的配额跟正式脚本是同一份，人工复核 verdict 时应该
  // 能看到当时的配额状态。
  const subscription = {
    expiry: launched.state.expiry, daysLeft: launched.state.daysLeft,
    quotas: launched.state.quotas, warning: expiryWarning(launched.state),
  };

  const url = buildReportUrl(appOrigin, report, domain);
  await gotoInTool(evaluate, url, Number(flags.settle || 12));

  const cellExtractor = AB_CELL_EXTRACTORS[report];
  const readGroupA = () => evaluate(`(() => ({
    url: location.href,
    bodyTextLength: (document.body?.innerText || '').length,
    cells: ${cellExtractor},
    scroll: ${SIMILARWEB_SCROLL_READ_ONLY_PROBE_JS}
  }))()`);
  const readGroupB = () => evaluate(`(() => ({
    url: location.href,
    bodyTextLength: (document.body?.innerText || '').length,
    cells: ${cellExtractor},
    scroll: ${SIMILARWEB_SCROLL_PROBE_JS}
  }))()`);

  // A 组：零滚动，只读一次——多读几次会有诱惑去"多等等看会不会自己涨"，
  // 但那样测的就不是"零滚动"了，是"零滚动 + 隐性的等待时间"，污染对照。
  const groupA = await readGroupA();

  // B 组：滚到底 + captureStable 轮询到一个稳定、atBottom 为真的读数——
  // 复用 similarweb-query.mjs 已经用过的"连续两次一样才收下"规则，不能拿
  // 滚动瞬间那一读当结论。
  const settledB = await captureStable({
    read: readGroupB,
    fingerprint: (cap) => JSON.stringify({ bodyTextLength: cap?.bodyTextLength, scrollHeight: cap?.scroll?.scrollHeight }),
    renderSignal: (cap) => Boolean(cap?.scroll?.atBottom),
    needed: 2,
    timeoutMs,
    intervalMs: Number(flags['stable-interval'] || 2.5) * 1000,
  });
  const groupB = settledB.capture;

  const rowsA = cellExtractor ? AB_ROW_DERIVERS[report](groupA?.cells) : null;
  const rowsB = cellExtractor && groupB ? AB_ROW_DERIVERS[report](groupB.cells) : null;
  const scrollHeightA = groupA?.scroll?.scrollHeight ?? null;
  const scrollHeightB = groupB?.scroll?.scrollHeight ?? null;

  // verdict：保守判定，两组关键信号都读到了才敢下结论，读不到就 inconclusive，
  // 不强行凑一个答案——留痕给人工复核，见文件头部大段注释。
  let verdict = 'inconclusive';
  let verdictReason;
  if (rowsA !== null && rowsB !== null && scrollHeightA !== null && scrollHeightB !== null) {
    const rowsMatch = rowsA === rowsB;
    const heightMatch = scrollHeightA === scrollHeightB;
    if (rowsMatch && heightMatch) {
      verdict = 'not-needed';
      verdictReason = `零滚动读到 ${rowsA} 行、scrollHeight ${scrollHeightA}，滚到底之后行数/高度都没变——内容不依赖滚动到底。`;
    } else if (rowsA < rowsB || scrollHeightA < scrollHeightB) {
      verdict = 'needed';
      verdictReason = `零滚动读到 ${rowsA} 行（scrollHeight ${scrollHeightA}），滚到底之后变成 ${rowsB} 行（scrollHeight ${scrollHeightB}）——滚动确实触发了新内容加载。`;
    } else {
      verdictReason = `零滚动读到 ${rowsA} 行（scrollHeight ${scrollHeightA}），滚到底之后是 ${rowsB} 行（scrollHeight ${scrollHeightB}）——两组不一致但也不是"滚动让内容变多"这个方向，形状没见过，不猜，人工看一眼。`;
    }
  } else {
    verdictReason = '行数或 scrollHeight 有一边读不到（报表本身的表头总数解析不出来，或者没找到滚动容器），两组读数没法干净比较，不强行下结论。';
  }

  output = {
    version: 1,
    kind: 'similarweb-scroll-ab-result',
    domain,
    report,
    url: groupB?.url ?? groupA?.url ?? url,
    retrievedAt: new Date().toISOString(),
    activateChrome,
    subscription,
    // activateChrome=false（默认）时，这次对照测的是"零滚动 vs 滚到底"，
    // 标签页的 hidden/visibilityState 是自然状态，不是脚本主动争取来的——
    // 如果两组读数恰好都是 hidden:true，这份结果只能说明"滚不滚都一样"，
    // 不能同时拿来回答"隐藏是不是也没关系"，那需要另开一次 --activate-chrome true。
    scopeNote: activateChrome
      ? '本次前台窗口开启，A/B 对照同时覆盖"零滚动 vs 滚到底"和标签页可见的自然状态。'
      : '本次前台窗口关闭（默认）：只测"零滚动 vs 滚到底"，不代表也测过了"隐藏 vs 可见"——如果两组的 scroll.hidden 都是 true，这份结果不能用来回答可见性问题，需要另跑一次 --activate-chrome true。',
    groupA: { label: 'zero-scroll', rows: rowsA, bodyTextLength: groupA?.bodyTextLength ?? null, scroll: groupA?.scroll ?? null },
    groupB: {
      label: 'scrolled-to-bottom', rows: rowsB, bodyTextLength: groupB?.bodyTextLength ?? null, scroll: groupB?.scroll ?? null,
      settleStable: settledB.stable, settleReads: settledB.reads,
    },
    verdict,
    verdictReason,
    nextStep: verdict === 'inconclusive'
      ? '不要直接切换 SCROLL_AB_CONCLUSIONS——先看 groupA/groupB 的原始读数，想清楚到底是报表本身没有可解析的行数/滚动证据，还是这次跑得不巧。'
      : `确认这个 verdict 站得住脚之后，去 similarweb-query.mjs 把 SCROLL_AB_CONCLUSIONS['${report}'] 手动改成 ` +
        `{ concluded: true, verdict: '${verdict}', date: '<今天日期>', notes: '<链到这次输出/截图>' }——这一步是手动的，这个脚本不自动写回去。`,
  };
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  printJson(output);
} catch (error) {
  const scene = launched
    ? await captureScene({
      session, outDir: evidenceDir, evalPage: evaluate ?? undefined, env: launched?.env,
      tag: 'scroll-ab-failed', note: `similarweb-scroll-ab ${report} ${domain}: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    })
    : null;
  output = {
    version: 1,
    kind: 'similarweb-scroll-ab-result',
    domain,
    report,
    status: 'unavailable',
    evidence: scene,
    error: { code: 'scroll_ab_failed', message: redactSecrets(String(error?.message || error)) },
  };
  if (scene) console.error(sceneSummaryLine(scene));
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  printJson(output);
  process.exitCode = 1;
} finally {
  await launched?.releaseBrowserLocks();
  if (!keepOpen) await closeSession(session);
}
