#!/usr/bin/env node
/**
 * similarweb-query.mjs —— 用已登录的 Tools Share 会话查一个域名的 Similarweb 报表。
 *
 * 用法：
 *   node scripts/similarweb-query.mjs --domain example.com
 *   node scripts/similarweb-query.mjs --domain example.com --report channels --out out.json
 *   node scripts/similarweb-query.mjs --self-test
 *
 * 参数：
 *   --domain <d>            必填（--self-test 时不需要）
 *   --report <r>            performance（默认）| channels | similar-sites | audience-geo | site-keywords
 *   --self-test             跑离线解析自检，不连浏览器，不需要 --domain
 *   --out <file>            落盘 JSON
 *   --session <name>        忽略：similarweb 是配额站，会话名固定为 similarweb-nav
 *                           （传了会打一行 stderr；--allow-parallel-session 才放行）
 *   --node <n> / --launch   面板节点与启动方式
 *   --timeout <s>           整体超时
 *   --stable-interval <s>   两次读数之间的间隔（默认 2.5 秒）
 *   --wait / --settle       额外等待
 *   --keep-open             跑完保留标签页
 *   --window <mode>         virtual-display（默认）/ foreground / active / background / isolated——
 *                           不传 = virtual-display：把自动化窗口放到虚拟屏幕上、选中标签页，
 *                           全程 --window isolated，不抢焦点也不被遮挡（见 lib-automation-window.mjs）；
 *                           检测不到虚拟屏幕时回退为下面 --activate-chrome 解出的模式（默认 active）。
 *                           显式传 opencli 四档之一则原样透传，不走虚拟屏幕。
 *   --automation-display <name|/re/|off>  虚拟屏幕名匹配（默认含「虚拟」或 Virtual 的非主屏；
 *                           也可用环境变量 BACKLINK_AUTOMATION_DISPLAY；off 关闭）
 *   --activate-chrome <b>   true | false（2026-09-14 起默认 false）——
 *                           audience-geo/channels/audience-interests/
 *                           site-keywords 这四个长表报表在 activateChrome=true
 *                           时仍会把 --window 强制升级成 foreground（raise +
 *                           select，真的会把 Chrome 抬到 OS 前台、抢走当前焦点，
 *                           见 FOREGROUND_FORCED_REPORTS 旁边的注释）；默认
 *                           false 之后这四个报表退回跟其它报表一样的默认
 *                           `active`——2026-09-14 之前的实测（见
 *                           SCROLL_AB_CONCLUSIONS）已经确认 active 不需要真的
 *                           拿到 OS 焦点也能读到完整内容，不必再默认强制
 *                           foreground 抢焦点。跟 Semrush 脚本的同名参数保持一致，
 *                           但机制不同：这里关掉的是 launchTool 的 window 参数，
 *                           不是一次独立的 OS 级激活调用。关掉之后如果这次读数
 *                           真的抓到过标签页隐藏（document.hidden），除
 *                           audience-interests（A/B 证据里两组都是 hidden:true
 *                           且行数一致，见 SCROLL_AB_CONCLUSIONS 旁注）外，会在
 *                           warnings 里单独报 page_hidden_during_capture，不会
 *                           因为少了前台就悄悄放行
 *   --traffic-tab <t>       仅 site-keywords 报表生效：total（默认）| organic | paid——
 *                           关键词表上方「总流量/自然流量/付费流量」三个子 tab，
 *                           2026-09-13 第四轮实测确认用直接构造 URL（selectedPageTab=
 *                           Total/Organic/Paid）切换，不用点击（点击会把窗口切成 6m，
 *                           直接构造 URL 反而更稳）；paid 子 tab 页面自己会把窗口
 *                           强制升到 6m（即使 URL 传 1m），已经把这一点算进请求口径，
 *                           不会每次都产出一个 scope-mismatch 噪音
 *   --accept-window-fallback 页面实际显示的窗口跟请求的窗口不一致时，默认拒绝
 *                           收下（status: "scope-mismatch"，退出码非 0，数据落进
 *                           unconfirmed* 字段）——传这个 flag 才把页面实际显示的
 *                           窗口当作这次查询的权威口径正常收下（正式字段 +
 *                           windowActual 说明实际口径）
 *   --gender <g>            仅 audience-demographics 报表生效：male | female——
 *                           "各受众群体的流量和参与度"分段表默认只渲染"女性"，
 *                           传这个 flag 才会去点击切换（2026-09-14 实测确认可行，
 *                           见 resolveDemographicsFilter 旁边的大段注释）；不认识
 *                           的值（包括"all"——没实测过选中"所有性别"之后分段表
 *                           会变成什么形状）一律当没传，退回页面默认，不新增隐藏
 *                           失败模式。输出里的 demographicsFilterSwitch.ok 说明
 *                           这次切换有没有真的生效
 *   --age <a>               仅 audience-demographics 报表生效：18-24 | 25-34 |
 *                           35-44 | 45-54 | 55-64 | 65+——默认只渲染"18-24岁"，
 *                           传这个 flag 才会点击切换（多选 checkbox + 应用按钮，
 *                           跟 --gender 是不同的交互模式，见同一段注释）；不认识
 *                           的值（包括"all"，原因同上）一律当没传
 *   --help                  本说明
 *
 * 【必须知道的一条】指标区是分两拍渲染的：标签和占位值先挂上，真值几秒后才水合。
 * 所以本脚本读到**同一组数值连续若干次完全一致**才收下，`stable === false`
 * 时直接抛错而不是把最后一次读数当结论——静默的错数比一次显式超时坏得多。
 * 空态（「未找到匹配内容」）是**页面正面渲染出来的一句话**，不是「读到 0 行」——
 * 这两者形状不同，见下面 fingerprint 处的长注释，别按同一条规则改。
 *
 * `noDataTextObserved: true` 是**观测事实**（页面正面渲染出「没有此网站的数据」这句话，
 * 且连读三次一致），不是失败，别和「查不到」混为一谈；「该不该当没数据处理」由 AI
 * 拿 rawText + 现场证据判。（旧字段名 `belowFloor` 已于第三波移除——它读起来像一个
 * 判决「这个站在门槛以下」，而实际发生的事只是「页面上写了一句话」。）
 * 只有 performance 报表有 metrics：在渠道页上跑 deriveMetrics 会把筛选器文字当数值抓
 * （实测 globalRank 抓成 1），宁可不给也不要给错的。
 *
 * 2026-08-30 双证人化：任何失败路径（never settled / timed out / launch 失败）在
 * close 之前先 captureScene（穿透 census + 截图）落进 --evidence-dir（默认
 * `<out>.evidence/` 或 `.backlink/evidence/similarweb-query/…`），错误输出带证据
 * 路径。截图链路已实盘验证。
 */
import { writeFile } from 'node:fs/promises';
import {
  closeSession,
  firstJson,
  normalizeWindowMode,
  opencli,
  resolveSession,
  parseFlags,
  showHelpIfRequested,
  printJson,
  required,
  validateSession,
} from './opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW } from './lib-automation-window.mjs';
import { captureScene, defaultSceneDir, sceneSummaryLine } from './lib-evidence-scene.mjs';
// 解析只有一份，住在 lib-similarweb.mjs。**这里曾经和 similarweb-batch.mjs 各抄一份**，
// 于是同一个错报 bug 要修两遍，实际只修了一遍。
import {
  compact,
  deriveAudienceDemographicsSignal,
  deriveAudienceInterestsRows,
  deriveAudienceInterestsSupplemental,
  deriveAudienceOverlapDetailRows,
  deriveAudienceOverlapMetrics,
  deriveChannelDetailRows,
  deriveChannels,
  deriveGeoRows,
  deriveMetrics,
  deriveOverviewSupplementalBlocks,
  deriveScopeEvidence,
  deriveSiteKeywordRows,
  deriveSiteKeywordStatCards,
  deriveTrendGraph,
  findTrendGraphNetworkEntry,
  findWindowLabel,
  parseNumber,
  SW_GEO_TABLE_CELLS,
  SW_OVERLAP_DETAIL_TABLE_CELLS,
  SW_ROW_MAJOR_TABLE_CELLS,
  SW_SITE_KEYWORD_STAT_CARDS,
} from './lib-similarweb.mjs';

/**
 * 数据源**正面渲染出来的**「查无此站」文案。这是一个 page-produced 的完成信号：
 * 页面必须先判定查无结果才会挂上它，骨架屏和未水合的空表都产不出这句话。
 * 提到模块作用域只为一件事——让 `--self-test` 能离线断言它，不用连浏览器。
 * 见 fingerprint 处的长注释和 <law-ref id="readiness-must-bind-to-this-query"/>。
 */
// 2026-09-13: a rendered proxy 502 is an error, not a report still loading.
function gatewayError(cap) {
  return /(?:502|503|504): (?:Bad gateway|Service unavailable|Gateway time)/i.test(String(cap?.title || ''))
    || /(?:Bad gateway|Gateway time.out)[\s\S]{0,100}Error code 50[234]/i.test(String(cap?.bodyText || ''));
}

const NO_DATA = /抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data|我们没有此网站的数据/;

/**
 * 法则要求的另一半：**这句空态提示是本次查询产出的吗？**
 * 标签页是复用的，上一个域名的空态会原样留在 DOM 里。URL 里的 `key=` 是面板自己
 * 写的本次查询标识，绑定它，空态才归本次查询所有。
 */
function boundToThisQuery(url, target) {
  return String(url || '').includes(`key=${encodeURIComponent(target)}`);
}

/**
 * 三档输出状态的纯函数判定——**主流程和 --self-test 调的是同一份逻辑**，不是
 * "自测测一份、脚本跑另一份"。这是 2026-09-13 二次复核之后新增的：之前的版本
 * 把"窗口不一致"仅仅当成一条 stderr 提示、数据照常进正式字段，复核意见指出
 * 这仍然是"以为抓到了、其实没抓到"的一种——只要正式字段里有数，调用方大概率
 * 不会去翻 scopeEvidence。
 *
 * 三档：
 *   - `blocked`：确认窗口不一致（`windowMatchesRequest === false`）且调用方没有
 *     传 `acceptWindowFallback`——**立即**（不是等到超时）判定为非成功，数据要
 *     被调用方降级放进 `unconfirmed*` 字段，不进正式字段。退出码非 0。
 *   - `status: 'ok-unverified'`：没有确认的不一致，但至少有一项没能独立验证
 *     （窗口/国家/设备读不到，或表格类报表的行数完整性/加载占位没法确认）。
 *     数据正常放进正式字段，但状态词和退出码都跟"完全确认"区分开，逼调用方
 *     去看 warnings，而不是让它长得和 100% 确认过的结果一样。
 *   - `status: 'ok'`：零 warnings，真的什么都确认过。
 *
 * 只接受已经算好的布尔判据，不在这里做任何 DOM/文本解析——判据的产生逻辑
 * （data-icon/颜色/文本选择器）在 lib-similarweb.mjs 里单独测过，这里只测
 * "给定这些判据，状态该判成什么"这一步，两层测试不重复。
 */
function decideScopeStatus({
  windowMatchesRequest, // true | false | null
  windowRequested,
  windowActual,
  acceptWindowFallback,
  countryUnverified,
  deviceUnverified,
  rowsCompletenessUnverified,
  loadingIndicatorUnverified,
  channelDetailRowsCompletenessUnverified,
  statCardsUnverified,
  audienceInterestsRowsCompletenessUnverified,
  audienceOverlapUnverified,
  audienceOverlapDetailUnresolved,
  audienceDemographicsUnverified,
  scrollUnverified,
  pageWasHiddenDuringCapture,
  overviewSupplementalUnresolved,
  audienceInterestsSupplementalUnresolved,
}) {
  const blocked = windowMatchesRequest === false && !acceptWindowFallback;
  if (blocked) {
    return {
      blocked: true,
      status: 'scope-mismatch',
      warnings: [],
      exitCode: 1,
    };
  }
  const warnings = [];
  if (windowMatchesRequest === null) {
    warnings.push({
      code: 'window_unverified',
      message: `页面上没能读到可识别的窗口文案，无法核实这批数据是不是 ${windowRequested ?? '请求'} 口径的。`,
    });
  }
  if (windowMatchesRequest === false && acceptWindowFallback) {
    warnings.push({
      code: 'window_fallback_accepted',
      message: `--accept-window-fallback 生效：请求的是 ${windowRequested}，接受页面实际显示的 ${windowActual} 作为这次查询的权威口径。`,
    });
  }
  if (countryUnverified) {
    warnings.push({
      code: 'country_unverified',
      message: '页面上没能读到「全球」这个国家选择器文案（弱信号，见 SKILL 文档待实测清单）——不代表口径不是全球，只是没能核实到。',
    });
  }
  if (deviceUnverified) {
    warnings.push({ code: 'device_unverified', message: '页面上没能读到「所有流量」这个设备选择器文案，无法核实设备口径。' });
  }
  if (rowsCompletenessUnverified) {
    warnings.push({
      code: 'rows_completeness_unverified',
      message: '页面表头没有给出可解析的总行数，"这次是否读全了这张表"没有被独立验证，只是数值连续两次读数一致。',
    });
  }
  if (loadingIndicatorUnverified) {
    warnings.push({
      code: 'loading_indicator_unverified',
      // 2026-09-13 第四轮：site-keywords 主表格已经实测确认并接进硬 gate（见
      // LOADING_INDICATOR_SELECTOR），从这个 unverified 名单里移出了；这条现在
      // 只覆盖 audience-interests/audience-overlap/audience-demographics 三个
      // 受众子 tab，消息不能再点名 site-keywords，否则跟实际触发它的报表对不上
      // （2026-09-13 实跑 audience-interests 时发现这处文案 bug）。第六轮又
      // 专门对 audience-interests 试了一次（canva.com，导航后紧接着轮询），
      // 抓到过一次 `[class*="skeleton"]` 命中 1 个元素，但下一次读它已经消失，
      // 没能拿到具体 class 名——证据太弱，给不出候选选择器，仍然维持
      // unverified，不能因为"抓到过一次影子"就升级成确认。
      message: '本次没有实测确认过这张页面是否有独立于内容之外的加载指示器 DOM，无法排除截图时机恰好卡在一个尚未播报的加载态。',
    });
  }
  if (channelDetailRowsCompletenessUnverified) {
    warnings.push({
      code: 'channel_detail_rows_completeness_unverified',
      message: '流量来源明细表的表头没有给出可解析的总行数，"这次是否读全了这张表"没有被独立验证。',
    });
  }
  if (statCardsUnverified) {
    warnings.push({
      code: 'stat_cards_unverified',
      message: '5 个统计卡（Cannibalization/长尾机会/SERP 充满机会/高流量机会/低潜力关键词）里，至少有一张没找到，或者它的 data-automation-button-loading 属性读不到确定值。',
    });
  }
  if (audienceInterestsRowsCompletenessUnverified) {
    warnings.push({
      code: 'audience_interests_rows_completeness_unverified',
      message: '交叉访问网站表的表头没有给出可解析的总行数，"这次是否读全了这张表"没有被独立验证。',
    });
  }
  if (audienceOverlapUnverified) {
    warnings.push({
      code: 'audience_overlap_unverified',
      message: '页面上既没有读到"平均独立访客数"等确认有数据的锚点，也没有读到确认空态的文案——不知道这个 tab 是还没渲染完还是结构变了。',
    });
  }
  if (audienceOverlapDetailUnresolved) {
    warnings.push({
      code: 'audience_overlap_detail_unresolved',
      message: '独占/重合明细表——表头锚点找到了，但列结构不认识或者一行都没解析出来，没有猜结构，原样标 unresolved，见 audienceOverlap.detail 字段。',
    });
  }
  if (audienceDemographicsUnverified) {
    warnings.push({
      code: 'audience_demographics_unverified',
      message: '页面上既没有读到"各受众群体的流量和参与度"章节标题，也没有读到确认空态的文案——不知道这个 tab 是还没渲染完还是结构变了。这个报表本身的提取器置信度也偏低，见 audienceDemographics 字段和 notCovered 里的说明。',
    });
  }
  if (scrollUnverified) {
    warnings.push({
      code: 'scroll_to_bottom_unverified',
      message: '滚动容器（.sw-layout-scrollable-element）已实测确认，但"标签页是否可见会不会影响懒加载触发"这组隐藏 vs 可见对照实验本轮没能做成——在做成之前不把"停在底部"当硬判据，这次读到的 scrollEvidence/scrollTrace 仅供参考。',
    });
  }
  if (pageWasHiddenDuringCapture) {
    warnings.push({
      code: 'page_hidden_during_capture',
      message: '这次读数至少有一轮抓到标签页 document.hidden === true（可能是 --activate-chrome false、也可能是前台窗口被别的窗口挡住/切走）——懒加载内容有可能因为标签页不可见而没有真正触发，不能因为其它维度都确认过就当这件事没发生。',
    });
  }
  if (overviewSupplementalUnresolved) {
    warnings.push({
      code: 'overview_supplemental_unresolved',
      message: '"网站表现"页离线补抓的子区块（设备分发/品牌占比/热门搜索词/外链摘要/展示广告主/地理 Top5/渠道摘要）里，至少有一个锚点找到了但内容形状不认识——没有猜结构，原样标 unresolved，见 overviewSupplemental 字段里对应子区块的 status。',
    });
  }
  if (audienceInterestsSupplementalUnresolved) {
    warnings.push({
      code: 'audience_interests_supplemental_unresolved',
      message: '受众兴趣 tab 的行业分布/话题词云至少有一个锚点找到了但内容形状不认识——没有猜结构，见 audienceInterestsSupplemental 字段里对应子区块的 status。',
    });
  }
  return {
    blocked: false,
    status: warnings.length ? 'ok-unverified' : 'ok',
    warnings,
    exitCode: warnings.length ? 1 : 0,
  };
}

const TRAFFIC_TABS = new Set(['total', 'organic', 'paid']);
/**
 * site-keywords 报表「总流量/自然流量/付费流量」子 tab 的纯函数决策——单独拆
 * 出来是为了能在 --self-test 里覆盖，不用连真浏览器跑一遍主流程才能验证。
 *
 * 2026-09-13 第四轮实测确认（howolddoyoulook.com，直接构造 URL 冷启动，不点击）：
 *   - total/organic 两个子 tab 带 1m 冷启动都能正常渲染 75 行关键词表；
 *   - **paid 子 tab 就算 URL 显式传 1m，页面自己也会把窗口悄悄升级成 6m**——
 *     请求 1m，落地渲染 "Mar 2026 - Aug 2026 (6 月)"，这是一个确认过的、每次都
 *     会发生的结构性行为（该站没有付费关键词，最终显示的是页面自己的空态文案
 *     「似乎没有足够的数据」，NO_DATA 正则已经认得），不是偶发的窗口污染。与其
 *     每次都因此产出一个必然触发的 scope-mismatch，不如把 paid 的 REQUESTED
 *     窗口本身设成 6m，windowActual 才能如实匹配 windowRequested。
 *   - selectedPageTab 的大小写（Total/Organic/Paid）是从点击 tab 后地址栏回填
 *     的真实值里抄出来的，不是猜的。
 *   - 不认识的值（拼写错误等）一律退回 total，不新增一个隐藏失败模式。
 */
function resolveTrafficTab(rawValue) {
  const trafficTab = TRAFFIC_TABS.has(rawValue) ? rawValue : 'total';
  const pageTabParam = trafficTab === 'organic' ? 'Organic' : trafficTab === 'paid' ? 'Paid' : 'Total';
  const windowSeg = trafficTab === 'paid' ? '6m' : '1m';
  return { trafficTab, pageTabParam, windowSeg };
}

// audience-demographics「各受众群体的流量和参与度」分段表——页面默认只渲染
// "女性/18-24岁"这一个性别×年龄组合，2026-09-14 实测确认可以点击切换到任何
// 其它组合（见 NOT_COVERED.{'audience-demographics'} 里的排查记录）。
//
// 两个下拉控件是不同的交互模式，都是实测点开确认的，不是猜的：
//   - 性别（`data-automation-dropdown-item` id: all/male/female）：简单单选，
//     点选项直接生效，不需要"应用"。**这里只收 male/female**——"所有性别"选中后
//     分段表会不会退化成别的形状（比如按性别拆行）没有实测过，不知道就不猜，
//     传了会被当成没传（回退页面默认，不新增隐藏失败模式，跟 resolveTrafficTab
//     对不认识的值的处理原则一致）。
//   - 年龄（`data-automation-dropdown-item` id: 18to24/25to34/35to44/45to54/
//     55to64/65plus）：多选 checkbox + 底部"应用"按钮，选中目标 checkbox 之后
//     必须点应用才会真正切换。**这里只收 6 个具体年龄段，不收"所有年龄组"**——
//     同样是没实测过选中之后分段表会变成什么形状。
//
// **应用后年龄 chip 的显示文案会从默认的"18-24岁"（带"岁"字）变成不带"岁"字的
// 纯区间文本（比如"25-34"）**——2026-09-14 实测确认（点开→选 25-34→应用之后，
// 原本的下拉按钮变成一个可移除的 chip-item，文本就是"25-34"）。这是一个真实的
// 显示层不一致，不是 bug：默认状态和"点击应用之后"走的是两套不同的渲染路径。
// 所以这里不去断言"应用之后 ageFilter 应该等于某个字符串"，而是让调用方直接
// 拿页面实际渲染出来的文案（`deriveAudienceDemographicsSignal` 已经在读这个），
// 判定"切没切换成功"改用更可靠的信号：分段表的数值（份额/时长/页面数/跳出率）
// 跟切换前的基线相比，是不是变了且连续两次读数一致——不去猜一个期望的展示文案。
const DEMOGRAPHICS_GENDER_CLICK_IDS = { male: 'male', female: 'female' };
const DEMOGRAPHICS_AGE_CLICK_IDS = {
  '18-24': '18to24', '25-34': '25to34', '35-44': '35to44',
  '45-54': '45to54', '55-64': '55to64', '65+': '65plus',
};
// 页面没有传 --gender/--age 时自己的默认组合——只有请求的值跟默认不同才需要
// 点击；请求的值刚好等于默认值时,什么都不点,直接用首次捕获到的分段行即可。
const DEMOGRAPHICS_DEFAULT_GENDER = 'female';
const DEMOGRAPHICS_DEFAULT_AGE = '18-24';

/**
 * 纯函数决策，跟 resolveTrafficTab 一个风格——能在 --self-test 里覆盖。
 * 不认识的值一律当成没传（回退页面默认），不新增隐藏失败模式。
 */
function resolveDemographicsFilter({ genderFlag, ageFlag }) {
  const gender = DEMOGRAPHICS_GENDER_CLICK_IDS[genderFlag] ? genderFlag : null;
  const age = DEMOGRAPHICS_AGE_CLICK_IDS[ageFlag] ? ageFlag : null;
  return {
    gender,
    age,
    genderClickId: gender ? DEMOGRAPHICS_GENDER_CLICK_IDS[gender] : null,
    ageClickId: age ? DEMOGRAPHICS_AGE_CLICK_IDS[age] : null,
    needsGenderClick: Boolean(gender) && gender !== DEMOGRAPHICS_DEFAULT_GENDER,
    needsAgeClick: Boolean(age) && age !== DEMOGRAPHICS_DEFAULT_AGE,
  };
}

// "各受众群体的流量和参与度"这一整块的锚点——点击的两个下拉都在这个区块内，
// 用它把查找范围限定住，避免误触页面顶部长得很像的日期/国家/webSource 筛选器
// （结构类似,都是 DropdownButton,但那三个不是这个区块的东西）。
const DEMOGRAPHICS_SEGMENT_ANCHOR = '各受众群体的流量和参与度';
const DEMOGRAPHICS_SEGMENT_SCOPE_EXPR = `(() => {
  const xp = document.evaluate(${JSON.stringify(`//*[text()='${DEMOGRAPHICS_SEGMENT_ANCHOR}']`)}, document, null, XPathResult.ANY_TYPE, null);
  const anchor = xp.iterateNext();
  if (!anchor) return null;
  let node = anchor;
  for (let i = 0; i < 6 && node.parentElement; i++) node = node.parentElement;
  return node;
})()`;

/**
 * 实际执行点击切换,只负责"点对地方",不负责"点完之后数据有没有稳定下来"
 * （那件事交给调用方,见下面主流程里怎么用它)。失败(找不到触发器/选项/应用
 * 按钮,或轮询超时)时返回 `{ ok:false, step, reason }`；全部成功返回 `null`。
 *
 * `evaluate` 是 launchTool 绑定过的 evalPage,每次调用都是一次独立的 IIFE 求值,
 * 不能跨调用留 DOM 引用,所以每一步都要重新从锚点定位一次范围。
 */
async function switchDemographicsFilter(evaluate, { genderClickId, ageClickId }) {
  // 2026-09-14 实测踩过一次：性别切完之后紧接着找年龄触发器，第一次读到
  // `scope-not-found`——不是选择器写错了（同一个 scope 表达式刚给性别用过），
  // 是切换性别之后这一小块 SPA 短暂重渲染，锚点文本有一瞬间不在 DOM 里。
  // 所以这里带几次短重试，不是「选择器错了就该立刻报错」，是「给重渲染一点时间」。
  const clickWithin = async (findExpr, step) => {
    let lastReason = 'unknown';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      if (attempt > 0) await new Promise((resolve) => { setTimeout(resolve, 300); });
      const result = await evaluate(`(() => {
        const scope = ${DEMOGRAPHICS_SEGMENT_SCOPE_EXPR};
        if (!scope) return { ok: false, reason: 'scope-not-found' };
        const el = ${findExpr};
        if (!el) return { ok: false, reason: '${step}-not-found' };
        el.click();
        return { ok: true };
      })()`);
      if (result?.ok) return null;
      lastReason = result?.reason || 'unknown';
    }
    return { ok: false, step, reason: lastReason };
  };
  // **evaluate() 的返回值必须是一个对象**——它内部靠 `firstJson()` 解析 opencli
  // eval 的输出，`firstJson` 只认第一个 `{`/`[` 起手的 JSON，裸布尔值/数字/字符串
  // 会导致它报「OpenCLI returned no JSON payload」（2026-09-14 实测踩过这个坑：
  // 最初这里直接 `Boolean(...)`，opencli eval 输出裸的 "false"，整条查询直接
  // 失败）。所以永远包一层 `{found: ...}` 再读字段，不要让 IIFE 直接返回原始值。
  const waitForGlobal = async (checkExpr, step) => {
    for (let i = 0; i < 8; i += 1) {
      const result = await evaluate(`(() => ({ found: Boolean(${checkExpr}) }))()`);
      if (result?.found) return null;
      await new Promise((resolve) => { setTimeout(resolve, 400); });
    }
    return { ok: false, step, reason: 'timed-out-waiting' };
  };
  const clickGlobal = async (id, step) => {
    const result = await evaluate(`(() => {
      const el = document.querySelector('[data-automation-dropdown-item="true"][id="${id}"]');
      if (!el) return { ok: false, reason: '${step}-not-found' };
      el.click();
      return { ok: true };
    })()`);
    return result?.ok ? null : { ok: false, step, reason: result?.reason || 'unknown' };
  };

  if (genderClickId) {
    let err = await clickWithin(`scope.querySelector('[data-automation="chipdown-no-border-button"]')`, 'gender-trigger');
    if (err) return err;
    err = await waitForGlobal(`document.querySelector('[data-automation-dropdown-item="true"][id="${genderClickId}"]')`, 'gender-options-mount');
    if (err) return err;
    err = await clickGlobal(genderClickId, 'gender-option');
    if (err) return err;
  }
  if (ageClickId) {
    let err = await clickWithin(`scope.querySelector('.age-filter-multi-select [data-automation="chipdown-no-border-button"]')`, 'age-trigger');
    if (err) return err;
    err = await waitForGlobal(`document.querySelector('[data-automation-dropdown-item="true"][id="${ageClickId}"]')`, 'age-options-mount');
    if (err) return err;
    err = await clickGlobal(ageClickId, 'age-option');
    if (err) return err;
    err = await waitForGlobal(`document.querySelector('[data-automation-i18n-key="common.apply"]')`, 'age-apply-mount');
    if (err) return err;
    // "应用"按钮不是 `[data-automation-dropdown-item]`（它是年龄面板自己的
    // footer 按钮，不是选项列表里的一项），用专门的选择器单独点一次。
    const applyResult = await evaluate(`(() => {
      const el = document.querySelector('[data-automation-i18n-key="common.apply"]');
      if (!el) return { ok: false, reason: 'age-apply-not-found' };
      el.click();
      return { ok: true };
    })()`);
    if (!applyResult?.ok) return { ok: false, step: 'age-apply', reason: applyResult?.reason || 'unknown' };
  }
  return null;
}

// 2026-09-13 第三轮：这四个长表报表默认自动强制前台窗口（懒加载依赖标签页
// 可见，见下面 windowMode 用到它的地方的大段注释）。第五轮加了
// `--activate-chrome` 开关之后，这张表和判定函数都要能在 --self-test 里
// 离线覆盖，所以放在这里（跟 resolveTrafficTab 一样，在 flags 解析/self-test
// 分支之前）。
const FOREGROUND_FORCED_REPORTS = new Set(['audience-geo', 'channels', 'audience-interests', 'site-keywords']);
/**
 * 纯函数，供 --self-test 覆盖——判定逻辑本身不该只能靠连真实 opencli 才能验证。
 *
 * 2026-09-14 改版（原来是「非 foreground 就一律 background」的二值化）：
 *   - 显式 `--window <mode>`：不管传的是 foreground/active/background/isolated
 *     哪一个，原样透传（用 `normalizeWindowMode` 兜底校验，认不出的值退回
 *     `active`，不是退回旧默认 `background`）——那是用户自己要的，不是脚本替他
 *     决定的。
 *   - 没传：默认 `active`（选中标签页、不节流，但不夺 OS 焦点），不再是
 *     `background`。
 *   - 唯一的例外：`activateChrome === true` 且这个报表在
 *     `FOREGROUND_FORCED_REPORTS` 里——这四个长表报表历史上靠强制 `foreground`
 *     保证懒加载触发；`--activate-chrome` 默认值 2026-09-14 起改成 `false`，
 *     所以这条强制默认不再生效，改用 `active`（SCROLL_AB_CONCLUSIONS 的 A/B
 *     实测已确认 active 级别的可见性足够）。显式传 `--activate-chrome true`
 *     才会真正拿到 OS 级更强的 foreground。
 */
function resolveWindowMode({ windowFlag, activateChrome, report: r }) {
  if (typeof windowFlag === 'string' && windowFlag) return normalizeWindowMode(windowFlag, 'active');
  return activateChrome && FOREGROUND_FORCED_REPORTS.has(r) ? 'foreground' : 'active';
}

/**
 * 滚动 A/B 结论登记表——2026-09-13 第五轮新增。用
 * `backlink/scripts/dev/similarweb-scroll-ab.mjs`（只写不跑，等 Chrome 不再被
 * Semrush 独占再实测）对每个长表报表做"零滚动读取 vs 滚到最终底部读取"的
 * 对照，把结论写进这张表，就地切换下面两处判定：
 *   - `scrollGateSatisfied()`：RENDER_SIGNAL 会不会把"停在最终底部且可见"
 *     当成完成前必须满足的硬条件；
 *   - `scrollUnverified` 的计算（主流程里，靠近 `SCROLL_GATED_REPORTS` 的地方）：
 *     一旦 `concluded:true`，不管 verdict 是哪一种，都不再产出
 *     `scroll_to_bottom_unverified` 这条 warning——`'not-needed'` 是因为已经
 *     确认内容不依赖滚动（这时"读全了没有"改用已有的行数/分页 footer/加载
 *     占位这些信号，本来就在管，不需要滚动这个维度再单独报一次不确定）；
 *     `'needed'` 是因为这时滚动已经是 RENDER_SIGNAL 的硬性前置条件，能走到
 *     `decideScopeStatus` 这一步就说明这一次真的在底部、真的可见，不再是
 *     "没做成对照实验"意义上的 unverified。
 * **2026-09-13 第五轮实测已切换全部四个报表为 `concluded:true`/`'not-needed'`**
 * ——用 `similarweb-scroll-ab.mjs --activate-chrome true` 对 howolddoyoulook.com
 * 实跑（真实前台窗口，不是 Claude in Chrome 探索工具），四张报表的"零滚动"
 * 组行数/scrollHeight 都跟"滚到底"组完全一致（11/51/19/75 行，
 * 2004/2898/1581/3837 像素，两组分毫不差），`channels` 那次 `hidden:false`，
 * `audience-interests` 那次两组都是 `hidden:true`（前台窗口没能真正抢到焦点，
 * 但恰好提供了一次意外的"隐藏也一样"佐证——不是刻意安排的对照）。
 * **样本局限（写在这里，不是揣着）**：只测了 howolddoyoulook.com 一个站，
 * 行数都在 11~75 之间，远低于这四张表各自约 100 行才会切换到分页/下一页的
 * 阈值（audience-geo/channels/audience-interests 是"out of N" footer，
 * site-keywords 是 Ant Design 分页器）——**没有测过大站点单页内是否会出现
 * 虚拟列表/懒挂载**。判断这样够不够切换：`channels` 的渠道分类是固定的
 * 小枚举（直接/自然搜索/…最多十来项），行数根本不随站点大小变化，这条结论
 * 幂等；`audience-geo`/`audience-interests`/`site-keywords` 三张会随站点变
 * 大而变长的表，风险只存在于"单页内、还没触发分页"这个区间——而这个区间
 * 本来就有独立于滚动之外的 `rowsCompletenessUnverified`/分页 footer/加载
 * 指示器信号在把关，就算这条"不依赖滚动"的结论对某个大站点单页不成立，
 * 那些信号大概率会先一步把不完整的读数拦成 `inconclusive`/告警，不会悄悄
 * 放过去。综合评估：**证据虽然只来自一个小样本站点，但退路（既有的行数/
 * 分页信号）足够扎实，值得先切换**，不是无保留地"以后再也不用管"。
 */
const SCROLL_AB_CONCLUSIONS = {
  'audience-geo': {
    concluded: true, verdict: 'not-needed', date: '2026-09-13',
    notes: '实跑 howolddoyoulook.com：零滚动/滚到底两组均 51 行、scrollHeight 2898、hidden:false。样本局限：只测了 1 个小站（51 行，远低于约 100 行的分页阈值），未测大站点单页内是否有虚拟列表/懒挂载——若未来发现某大站点单页读数不完整，优先怀疑这条结论对该规模不成立，回退为 concluded:false 并换一个数据量更大但仍在单页阈值内的站点重测。',
  },
  channels: {
    concluded: true, verdict: 'not-needed', date: '2026-09-13',
    notes: '实跑 howolddoyoulook.com：零滚动/滚到底两组均 11 行、scrollHeight 2004、hidden:false。这张表的渠道分类是固定小枚举（最多十来项，不随站点流量规模变化），"单站点样本"这条局限对这张表基本不成立——结论置信度高于另外三张会变长的表。',
  },
  'audience-interests': {
    concluded: true, verdict: 'not-needed', date: '2026-09-13',
    notes: '实跑 howolddoyoulook.com：零滚动/滚到底两组均 19 行、scrollHeight 1581，**两组都是 hidden:true**（--activate-chrome true 没能真正抢到前台焦点，意外提供了一次"隐藏也读到完整内容"的佐证，不是刻意安排）。样本局限同 audience-geo：只测了 1 个小站，未测大站点单页内是否有懒挂载。',
  },
  'site-keywords': {
    concluded: true, verdict: 'not-needed', date: '2026-09-13',
    notes: '实跑 howolddoyoulook.com：零滚动/滚到底两组均 75 行、scrollHeight 3837、hidden:false。样本局限同 audience-geo：75 行接近但仍低于约 100 行的 Ant Design 分页阈值，未测多页场景下单页内部是否有懒挂载。',
  },
};

/**
 * 2026-09-14：`page_hidden_during_capture` 这条 warning 要不要**独立于滚动之外**
 * 把状态拖去 ok-unverified——只在 SCROLL_AB_CONCLUSIONS 的证据里**真的含有一次
 * hidden 状态下的读数、且行数跟可见状态一致**时才放宽；四个报表都 concluded，
 * 但只有 `audience-interests` 的样本满足这个更严的条件：
 *   - audience-geo/channels/site-keywords：A/B 两组的证据都是 `hidden:false`
 *     （两次都在可见状态下测的），完全没有测过"标签页真的被藏起来时会怎样"，
 *     所以 hidden 对这三个报表仍然是未验证过的风险——不能因为"滚动"这个维度
 *     已经 concluded 就顺带放宽了一个从没被这批证据回答过的问题。
 *   - audience-interests：A/B **两组都是 `hidden:true`**（19 行、scrollHeight
 *     1581，完全一致），这恰好就是"hidden 下内容仍然完整"的直接证据，可以放宽。
 * 放宽之后 hidden 只作为信息字段记录（见下面 pageWasHiddenDuringCapture 的输出），
 * 不再单独触发 ok-unverified；行数/分页 footer/加载占位这些既有信号继续把关
 * "有没有读全"，跟 SCROLL_AB_CONCLUSIONS 已经确认过的"滚动是否必要"是同一套逻辑。
 * 没有 A/B 结论、或结论里含懒加载补充区块（performance 的 overviewSupplemental、
 * audience-overlap/audience-demographics）的报表本来就不在 SCROLL_GATED_REPORTS
 * 里，从未产出过这条 warning，这里也不新增——hidden 对它们依旧维持"未验证就不
 * 放宽"的默认姿态。
 */
const HIDDEN_CAPTURE_CONFIRMED_SAFE_REPORTS = new Set(['audience-interests']);

/**
 * 纯函数，供 --self-test 覆盖。`wasHidden` 是这次跑是否真的抓到过
 * `document.hidden === true`（观测事实，原样记进输出，不受这里影响）；
 * 返回值只回答"这次观测该不该把状态拖成 ok-unverified"。
 */
function hiddenCaptureRequiresDowngrade(report, wasHidden) {
  return Boolean(wasHidden) && !HIDDEN_CAPTURE_CONFIRMED_SAFE_REPORTS.has(report);
}

/**
 * 滚动这一维度的完成判据——纯函数，供 RENDER_SIGNAL 里的各报表闭包调用。
 * `verdict` 不是 `'needed'` 时（包括还没做 A/B 的 `null`，以及确认不需要的
 * `'not-needed'`）一律放行，不阻塞——完成判据仍然完全由各报表已有的行数/
 * 分页/加载指示器信号决定，这个函数不参与、也不新增超时风险。只有明确
 * `verdict === 'needed'` 时才要求这次读数本身就带着"确认停在最终底部且
 * 标签页可见"的证据（`scroll.atBottom && scroll.hidden === false`），
 * 否则返回 false 让 captureStable 继续轮询、不把半途的读数当结论。
 */
function scrollGateSatisfied({ verdict, scroll }) {
  if (verdict !== 'needed') return true;
  return Boolean(scroll && scroll.atBottom === true && scroll.hidden === false);
}

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
if (flags['self-test']) {
  runSelfTest();
  process.exit(0);
}
const domain = normalizeDomain(required(flags, 'domain'));
const session = resolveSession(flags, 'similarweb-research', 'similarweb');
// audience-interests/overlap/demographics 是 2026-09-13 第三轮离线新增的——
// 上一轮实测已经确认了 selectedTab 的真实参数值（不是猜的）：
// demographicsUsersBased / audienceInterests / overlap。
const REPORTS = new Set([
  'performance', 'similar-sites', 'channels', 'audience-geo', 'site-keywords',
  'audience-interests', 'audience-overlap', 'audience-demographics',
]);
const report = REPORTS.has(flags.report) ? flags.report : 'performance';
// --traffic-tab 只对 site-keywords 有意义（其它报表没有这三个子 tab）；具体
// 判断逻辑见上面 resolveTrafficTab 旁边的大段注释。
const { trafficTab, pageTabParam: siteKeywordsPageTabParam, windowSeg: siteKeywordsWindowSeg } =
  report === 'site-keywords' ? resolveTrafficTab(flags['traffic-tab']) : resolveTrafficTab('total');
// --gender/--age 只对 audience-demographics 有意义；具体判断逻辑和已知局限见
// resolveDemographicsFilter 旁边的大段注释。
const demographicsFilter = report === 'audience-demographics'
  ? resolveDemographicsFilter({ genderFlag: flags.gender, ageFlag: flags.age })
  : resolveDemographicsFilter({});
// 每个报表硬编码在请求 URL 里的窗口段——用来跟页面自己渲染出来的窗口文案比对
// （见 lib-similarweb.mjs 的 deriveScopeEvidence/compareWindowToRequest）。
// similar-sites 没有解析器、也不产出 windowLabel，这里不需要它。受众页三个
// 新 tab 跟 geography 是同一个页面、同一个窗口段（6m），只是 selectedTab 不同。
// site-keywords 的窗口段依赖子 tab，见 resolveTrafficTab。
const REPORT_WINDOW_SEG = {
  performance: '28d', channels: '28d', 'audience-geo': '6m',
  'site-keywords': siteKeywordsWindowSeg,
  'audience-interests': '6m', 'audience-overlap': '6m', 'audience-demographics': '6m',
};
// audience-geo 这个 tab 本身没有国家筛选器（审计实测：过滤条只有日期和「所有
// 流量」两个控件），URL 里的 999 是这组路由的通用位置参数，对这个 tab 不生效——
// 不要在没有筛选器的报表上假装核对出了国家口径。**受众页另外三个 tab
// （人口特征/兴趣/重叠）2026-09-13 第二轮实测确认都有国家选择器**（显示
// "全球"），跟 geography tab 不是同一种情况，不能一刀切写成 false。
const COUNTRY_APPLICABLE = {
  performance: true, channels: true, 'similar-sites': true, 'audience-geo': false, 'site-keywords': true,
  'audience-interests': true, 'audience-overlap': true, 'audience-demographics': true,
};
// 页面上肉眼可见、但当前脚本没有提取器覆盖的区块——2026-09-13 审计浏览器实测
// 盘点出来的清单(见 similarweb-audit.md 二.1~二.4)。这里只是把"没抓"这件事
// 显式地写进输出,不是"以后一定会补"的承诺；具体要不要补、成本多大，
// 见对应文档/交接说明里的补抓方案。
const NOT_COVERED = {
  performance: [
    // 2026-09-14 第七轮：「随时间的访问趋势图」原来判 notCovered 是因为
    // DOM/SVG 文本里确实只有坐标轴刻度、没有逐点数值——但这次排查发现逐点
    // 数值其实来自一条独立的 XHR（`.../widgetApi/WebsiteOverview/
    // EngagementVisits/Graph`），opencli `network` 能直接拦到，已实现为
    // `trendGraph` 字段（见 lib-similarweb.mjs deriveTrendGraph 顶部注释，
    // 含跟页面图例期间总访问量的逐站核对），不再是缺口。
    // 2026-09-13 第五轮离线补抓（deriveOverviewSupplementalBlocks，见
    // lib-similarweb.mjs）：设备分发/品牌非品牌占比/热门自然+付费搜索词/
    // 外链摘要(热门外链网站)/领先广告主/地理 Top5 摘要/渠道摘要，已实现为
    // overviewSupplemental 字段，每个子区块带四态 status（data/legit-empty/
    // locked/confirmed-absent/unresolved）。地理 Top5/渠道摘要虽然跟
    // --report audience-geo/channels 有重叠，但协调者要求这份 overview 快照
    // 本身也要自成一体，不再以"已被别的报表覆盖"为由跳过。
    // 2026-09-13 第六轮用数据丰富的 canva.com 实测补齐了第五轮只见过空态、
    // 结构一直没看清的三个区块——热门外链行业（2 列，网站类别/流量份额，
    // 没有变动列）、出站流量·热门链接目的地（3 列，列头是英文 "Domain"）、
    // 社交流量细分（跟渠道摘要同一个"标签+坐标轴噪声+末尾 N 个值"形状，
    // 平台名是开放词表）；同一轮还发现第五轮完全漏抓了一个区块——
    // "显示广告→热门媒体"（3 列，列头"发布商"，是跟"导出广告→领先广告主"
    // 不同的两个部件，第五轮误把后者当成覆盖了前者），已补上
    // `topMediaPublishers` 字段，样本还带出了"新"（上一期无可比数据的第三态，
    // 跟英文 NEW 是同一个概念）和负数变动（"-96%"，顺带修了 parseNumber
    // 不支持负号的 bug）两个此前没见过的真实取值。
  ],
  channels: [
    { name: '渠道流量趋势折线图', reason: '图表类数据,当前提取器只处理文本/表格' },
    // 流量来源明细表：2026-09-13 第二轮实测确认结构（.swReactTable-column，
    // 跟 audience-geo 同一套），已实现为 channelDetail，见 deriveChannelDetailRows。
  ],
  'audience-geo': [
    { name: '世界地图可视化(choropleth，按流量份额深浅着色)', reason: '图表类数据，当前提取器只处理表格' },
    // demographics/interests/overlap 三个 tab 2026-09-13 第三轮已经拆成独立
    // report（--report audience-demographics/audience-interests/audience-overlap），
    // 不再算"没抓"，各自的残留缺口记在它们自己的 NOT_COVERED 条目里。
  ],
  'audience-interests': [
    // 2026-09-13 第五轮离线补抓（deriveAudienceInterestsSupplemental）：
    // 行业分布饼图（industryDistribution）+ 话题词云（topicCloud）已实现，
    // 不再是"没抓"——见 audienceInterestsSupplemental 字段。话题词云本身
    // 没有可读的权重/排名数值（字号是 CSS 视觉权重，不是文本节点），只能拿到
    // 词表，已在该字段的 topicsOrderConfidence 里如实标注，不是完整缺口。
  ],
  'audience-overlap': [
    { name: '韦恩图可视化(SVG)', reason: '只解析旁边的文本区块（平均独立访客数/独立受众总数），不读 SVG 圆圈本身的几何/面积信息' },
    // 2026-09-14 第七轮：「独占/重合明细百分比」之前两轮只解析扁平化
    // bodyText（"7 个站点 token / 3 个百分比 / 9 个数字，互相除不尽"），
    // 根因是没有对齐 DOM 列边界——这次改读 DOM，发现是跟 audience-geo 同一套
    // `.swReactTable-column`（+ 最后一列用 `.swReactTable-unResizeColumn`）
    // 结构，列边界由 DOM 本身保证对齐，已实现为 audienceOverlap.detail 字段
    // （见 lib-similarweb.mjs deriveAudienceOverlapDetailRows 顶部注释，
    // 含用 perSiteAvgVisitors 做的算术交叉核对），不再是缺口。
  ],
  'audience-demographics': [
    // 2026-09-14 第七轮：「除当前下拉选中组合之外的其它性别×年龄组合」——上一轮
    // 判定"需要模拟点击切换下拉，本轮离线阶段做不到"，这次实际点开验证过两个
    // 下拉都能点通（性别单选/年龄多选+应用，见 resolveDemographicsFilter 旁边的
    // 大段注释），已实现为 --gender/--age 两个可选 flag，见文件头部帮助文本。
    // **仍然是部分实现，不是完全覆盖**：
    //   1. 一次调用仍然只能拿一个组合，不支持"一次拿全部 12 种组合"——那需要
    //      在同一个会话里连续点击、每轮都等待+校验，复杂度和这份报表现有代码量
    //      不成比例，本轮没有做；
    //   2. "所有性别"/"所有年龄组"这两个选项没有实测过选中之后分段表会变成
    //      什么形状（有可能从单行变成多行分拆），--gender/--age 只收具体的
    //      male/female 和 6 个具体年龄段，不收"all"，避免猜结构；
    //   3. 直接在页面里 `fetch()` 手搓 `DemographicSegments/Buckets/Table` 这个
    //      真实存在的底层 XHR、绕开点击拿全部组合——实测被代理网关 403 拦截
    //      （真实请求的 URL 带着 gmitm 代理自己签名的 `__gmitm` token，手搓的
    //      URL 没有它），这条捷径确认走不通，只能靠点击。
    {
      name: '"所有性别"/"所有年龄组"选中后的分段表形状 + 一次调用拿全部 12 种性别×年龄组合',
      reason: '"all" 两个选项没有实测过选中后分段表会不会变成多行（比如按性别/年龄拆开），不知道结构就不猜；一次拿全部 12 种组合需要连续点击 12 轮+每轮等待校验，复杂度暂不做，可以用 --gender/--age 单次指定任意一个具体组合替代',
    },
  ],
  'site-keywords': [
    // 5 个统计卡：2026-09-13 第二轮实测确认结构（[data-automation="preset-content"]
    // + 祖先节点的 data-automation-button-loading 属性），已实现为 statCards。
    // 总流量/自然流量/付费流量三个子 tab：2026-09-13 第四轮实测确认真实结构是
    // react-tabs（`li[data-automation-item="total"|"organic"|"paid"]`），已实现
    // 为 --traffic-tab total|organic|paid（见文件头部帮助文本），不再是缺口。
  ],
};
// 2026-09-13 第三轮：长表报表（audience-geo/channels/audience-interests/
// site-keywords）强制前台窗口——参考 Semrush 那边的实测结论（IntersectionObserver
// 在不可见标签页里不计算，`background` 窗口会让懒加载看起来"怎么等都不加载"）。
// 本轮没能用 Claude in Chrome 复现"隐藏→可见"的对照实验（这个自动化通道本身
// 恒为 document.hidden=true，`open -a`/`osascript activate` 都无法改变），
// 所以这条不是靠直接测出来的，是套用已经在同一套基础设施（lib-tools-share.mjs
// launchTool 的 window 参数）上验证过的 Semrush 结论——风险不对称：强制前台
// 的代价只是多一个可见窗口，不强制的代价可能是懒加载永远等不到。
//
// **2026-09-13 第五轮修正：这条强制本身也是有代价的**——用户反馈脚本反复把
// Chrome 抬到前台、抢走电脑焦点，影响正常使用。这里的"前台"跟 Semrush
// 那边 `bringChromeForward()` 的 `open -a "Google Chrome"` 不是同一个机制
// （那是脚本侧独立发一次 OS 级激活指令），而是 `launchTool({window})` 把
// `--window foreground` 传给 opencli 本身——但效果是同一类事：会把 Chrome
// 应用抬到 OS 前台。跟 Semrush 保持同名参数 `--activate-chrome`。
// **2026-09-14 第六轮：默认值改成 false**——SCROLL_AB_CONCLUSIONS 四个报表都已
// concluded，其中 audience-interests 那次实测甚至是在 hidden:true 下完成的，
// 足够的证据支持"不必默认抢焦点"；`resolveWindowMode` 的默认输出也从
// `background` 改成了 `active`（选中标签页、不节流，但不夺 OS 焦点），
// 两件事一起让"默认不抢焦点"和"默认不会因为 background 完全不选中标签页而
// 更容易卡在 hidden"同时成立。`--activate-chrome true` 仍然保留，用于需要更强
// 保证时显式拿到 OS 级 foreground。
// `FOREGROUND_FORCED_REPORTS`/`resolveWindowMode` 定义在文件更靠前的地方
// （`flags = parseFlags(...)` 之前，跟 `resolveTrafficTab` 挨着），好让
// `--self-test` 能覆盖到，这里只是使用它。
const activateChrome = String(flags['activate-chrome'] ?? 'false') !== 'false';
const windowMode = resolveWindowMode({ windowFlag: flags.window === VIRTUAL_DISPLAY_WINDOW ? undefined : flags.window, activateChrome, report });
// 虚拟屏幕策略（2026-09-14）：不传 --window 时默认走它，windowMode 退为检测不到虚拟屏幕时的回退模式。
const windowStrategy = resolveWindowStrategy({ windowFlag: flags.window, fallbackWindowMode: windowMode });
// **2026-09-13 第五轮新增判据**：关掉自动前台之后，如果这次读数偏偏真的
// 遇上了标签页不可见（hidden），不能因为"用户自己关掉了前台"就当没这回事——
// 仍然要如实降级成非成功状态（ok-unverified/看下面 scrollUnverified 的用法），
// 不能因为少了抬前台就悄悄放行。这个标志只是记录"这次跑没有主动争取前台"，
// 具体降级判据仍然是下面 scrollEvidence/scrollUnverified 那一套。
const activateChromeSkipped = !activateChrome && FOREGROUND_FORCED_REPORTS.has(report) && flags.window !== 'foreground';
const timeoutMs = Math.max(30_000, Math.min(240_000, Number(flags.timeout || 150) * 1000));
const keepOpen = Boolean(flags['keep-open']);
// 2026-09-13 复核意见：「口径不一致但仍照常输出」本身就是「以为抓到了、其实
// 没抓到」的一种——即使不拦截，把数据放进正常字段里就已经是把它当成了可信结果。
// 默认拒绝接受被改写的窗口（见下面 scope-mismatch 分支）；只有显式传这个 flag
// 才把「页面实际显示的窗口」当成这次查询的权威口径，正常收下。
const acceptWindowFallback = Boolean(flags['accept-window-fallback']);
// 失败现场的落点。默认贴着 --out（`x.json.evidence/`），没有 --out 就进 .backlink/。
const evidenceDir = typeof flags['evidence-dir'] === 'string'
  ? flags['evidence-dir']
  : defaultSceneDir({ out: typeof flags.out === 'string' ? flags.out : null, script: 'similarweb-query', runTag: `${domain}-${report}` });
// 面板入口已硬编码(公开 URL,账号在浏览器会话里),环境变量仍可覆盖。
// 面板地址与登录流程都在 lib-tools-share.mjs 里，这里不再重复一份。
// 面板点开之后跳转到的应用域名与入口面板不是同一个 host,推导不出来,只能写死或由环境变量给。
// Similarweb 卡片落在 sim.3ue.co(Semrush 是 sem.3ue.co)。见 references/authorized-data-sources.md。
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN || 'https://sim.3ue.co').replace(/\/+$/, '');
if (!appOrigin) {
  throw new Error(
    'TOOLS_SHARE_APP_ORIGIN is not set. Point it at the origin the dashboard launches into (e.g. https://app.example.com).',
  );
}

function normalizeDomain(value) {
  const candidate = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  const normalized = candidate.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(normalized)) {
    throw new Error(`Invalid domain: ${value}`);
  }
  return normalized;
}


// launchTool 返回的 evalPage 已绑定会话，启动之后才可用。
let evaluate = null;

let output;
let subscription = null;
let launched;
// 每次运行都写 automationWindow：虚拟屏幕控制器的摘要；没走该策略时给同形状的占位。
const automationWindowSummary = (error) => launched?.automationWindow?.summary()
  ?? error?.automationWindow
  ?? plainAutomationSummary({ windowMode, reason: windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? 'launch-failed-before-prepare' : 'explicit-window-mode' });
try {
  // 启动一律走 lib-tools-share.mjs 的那一份。**之前这里自己写了一份简化版**：
  // 靠 logo 的 style 找卡片、直接点「打开」、不选节点。它漏掉了三个已知坑
  // （会话焊死、卡片无文字、节点会挂），于是稳定报 shared_proxy_blank_or_unavailable，
  // 而真正的原因每次都不一样。删掉重复实现之后这类误报才有唯一的排查入口。
  launched = await launchTool({
    session,
    tool: 'similarweb',
    node: flags.node,
    window: windowStrategy.strategy === VIRTUAL_DISPLAY_WINDOW ? VIRTUAL_DISPLAY_WINDOW : windowMode,
    fallbackWindow: windowMode,
    automationDisplay: flags['automation-display'],
    wait: Number(flags.wait || 7),
    timeout: Number(flags.launchTimeout || 60),
    allowParallelSession: Boolean(flags['allow-parallel-session']),
  });
  evaluate = launched.evalPage;
  subscription = {
    expiry: launched.state.expiry,
    daysLeft: launched.state.daysLeft,
    quotas: launched.state.quotas,
    warning: expiryWarning(launched.state),
  };

  const REPORT_PATHS = {
    'similar-sites': '/#/digitalsuite/websiteanalysis/overview/competitive-landscape/*/999/3m?key=',
    // 注意：**这条路由没有 `*` 段，而且 `?` 前面有一个斜杠。**
    // 照抄 website-performance 的形状（带 `*`）会让 SPA 整个重新初始化成空白页，
    // 表现为 bodyText 为空、标题退回 'Similarweb PRO'，看起来像节点挂了。
    channels: '/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d/?webSource=Total&key=',
    performance: '/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?webSource=Total&key=',
    'audience-geo': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=geography&key=',
    // selectedTab 的三个真实参数值是 2026-09-13 第二轮点击实测出来的（点开
    // 对应 tab 后地址栏回填的原值），不是猜的。**注意 gotoInTool 的
    // routeMismatch 只校验路径段，query 里的 selectedTab 不在校验范围内**——
    // 如果哪天这三个值失效，不会被自动拦下来，只能靠 READY_MARKERS/内容判据
    // 间接发现（大概率会拿到 geography 或别的 tab 的内容，读到不认识的表头）。
    'audience-interests': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=audienceInterests&key=',
    'audience-overlap': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=overlap&key=',
    'audience-demographics': '/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&selectedTab=demographicsUsersBased&key=',
  };
  // 「网站关键词」页的 hash 不是「路径 + key=」这么简单：key 在前，pageFilter 在中间，
  // 都带域名，而且**total 子 tab 上 6 个月的窗口会直接报错**（「出问题了 请重试或
  // 选择更短的日期范围」），必须用 1m。改 hash 从 6m 换成 1m 救不回已经报错的页面——
  // 只有一次全新的、一开始就是 1m 的跳转才行。
  //
  // 三个子 tab 用 selectedPageTab=Total|Organic|Paid 直接切换（大小写、拼写都是
  // 2026-09-13 第四轮点击实测后从地址栏回填值里抄出来的，不是猜的）——**不点击
  // 页面上的 tab 文案**：实测点击会把窗口切成 6m（旁边 REPORT_WINDOW_SEG 的大段
  // 注释已经说明 paid 子 tab 本身就需要 6m，但 total/organic 点击切换同样触发了
  // 6m，说明这是点击这个交互路径本身的副作用，不是 tab 类型决定的），直接构造
  // 带 selectedPageTab 的完整 URL 一次性冷启动反而更稳，也省一轮点击+等待。
  const buildReportUrl = () => {
    if (report === 'site-keywords') {
      const pageFilter = encodeURIComponent(JSON.stringify([{ url: domain, searchType: 'domain' }]));
      return `${appOrigin}/#/organicsearch/pageAnalysis/website-keyword-v2/*/999/${siteKeywordsWindowSeg}` +
        `?key=${encodeURIComponent(domain)}&pageFilter=${pageFilter}&webSource=Total&selectedPageTab=${siteKeywordsPageTabParam}&comparedDuration=`;
    }
    return `${appOrigin}${REPORT_PATHS[report]}${encodeURIComponent(domain)}`;
  };
  // 这是 hash 路由的 SPA：换 hash 不会重新加载页面，所以深链之后必须等它自己渲染完。
  // 实测首屏要 15-20 秒，settle 给小了就会读到一个空 body 并被误判成"这个域名没数据"。
  //
  // 2026-09-13 补上一个已知残留缺口(见 lib-tools-share.mjs 里 routeWindow 的注释：
  // 「7 个 gotoInTool 调用点里只有 payment-referrers.mjs 把 routeWindow 写进了
  // 输出」)——这里之前直接把返回值丢掉，导致「面板把请求窗口悄悄改写」这件事
  // 只在 gotoInTool 自己打的一行 stderr 里出现过，输出 JSON 里完全看不到。
  // `routeWindow` 是**基于落地 URL**的窗口漂移证据；下面 deriveScopeEvidence
  // 读的是**页面正文渲染出来的窗口文案**，两条独立通道的证据都要留，
  // 这正是审计要求的「同时从页面读回…与请求参数比对」。
  // 虚拟屏幕模式：导航前确认标签页 visible（hidden 才走恢复）；其它模式是空操作。
  await launched.automationWindow?.ensureVisible('before-report-navigation');
  const landedNav = await gotoInTool(evaluate, buildReportUrl(), Number(flags.settle || 12));
  const navRouteWindow = landedNav?.routeWindow || null;
  if (navRouteWindow?.rewritten) {
    console.error(
      `[scope] ${report} ${domain}: gotoInTool 报告窗口段被改写(来源:${navRouteWindow.source})——` +
      `请求 ${navRouteWindow.requested},落地 ${navRouteWindow.landed}。`,
    );
  }

  // **轮询条件必须认「只有数据到了才会出现的字符串」。**
  // 之前这里认的是「网站表现」——那是左侧导航的菜单项，页面骨架一挂载就命中，
  // 于是轮询秒过、抓到一个还没渲染数值的 body，metrics 静默变成 {}，
  // 报表看上去查成功了，指标却一个都没有。导航词和内容词必须分清楚。
  //
  // **而且认到内容词也还不算数。** 这些页分两拍渲染：先挂标签和占位值，
  // 几秒后真值才水合进来（2026-08-23 实测：批量脚本把月访问 35 万的 mmradar.gg
  // 记成没数据）。所以就绪之后还要**连读两次解析结果完全一致**才收下，
  // 指纹就是要写出去的那个对象本身。
  //
  // **老实说清楚 audience-geo/site-keywords 这两个 marker 能保证什么、不能保证
  // 什么。** `受众群体份额`、`点击量` 都是表头文字本身，**不是**「只有数据到了
  // 才会出现」的字样——2026-08-27 实测：`点击量` 同时也出现在表格上方的筛选器
  // 里（`点击量变化` 这个 chip），骨架一渲染、表还是空的时候这两个字符串就已经
  // 在页面上了。这两个 marker 只是一道**省钱的预筛**：字符串都没出现时肯定没
  // 数据，不用白跑一次 cells 提取。**真正保证就绪的是下面 fingerprint 里
  // `isEmptyPayload` 那一步**——它要求解析出来的 `rows.length > 0` 且连读两次
  // 完全一致，这才是「表真的有数据而且数据稳定了」的证明。所以就算这两个字符串
  // 在空骨架上短暂命中，也不会被当成就绪，只会多等几轮直到 cells 提取出真行。
  const READY_MARKERS = {
    performance: '总访问量',
    channels: '渠道流量',
    'similar-sites': '相似度',
    'audience-geo': '受众群体份额',
    'site-keywords': '点击量',
    // 「相关性评分」是交叉访问网站表的表头文字，只有表渲染了才会出现。
    'audience-interests': '相关性评分',
    // 「平均独立访客数」是内容词——骨架阶段不会有，2026-09-13 实测原文确认。
    'audience-overlap': '平均独立访客数',
    // demographics 的判据比其它报表宽松：这个 tab 实测样本数据不全，除了
    // 内容词还要认页面自己的空态文案，两者任一出现都算「有信号可以往下判」，
    // 具体在下面 isEmptyPayload 里处理，这里的 marker 只是内容词那一半。
    'audience-demographics': '各受众群体的流量和参与度',
  };
  // 表格类报表（audience-geo / site-keywords）不是按行文本解析的——这两张表分别是
  // 按列渲染的 `.swReactTable-column` 和 Ant Design 的 `.ant-table`，必须在页面里
  // 跑对应的提取器拿到结构化的 {headers, rows}，再交给 lib-similarweb.mjs 按列名解析。
  // channels 现在也跑 SW_GEO_TABLE_CELLS——2026-09-13 第二轮实测确认「流量来源
  // 明细表」跟 audience-geo 的地理表是同一套 `.swReactTable-column` 结构，复用
  // 同一个通用提取器（见 lib-similarweb.mjs deriveChannelDetailRows 顶部注释）。
  const CELL_EXTRACTORS = {
    'audience-geo': SW_GEO_TABLE_CELLS,
    channels: SW_GEO_TABLE_CELLS,
    'audience-interests': SW_GEO_TABLE_CELLS,
    'site-keywords': SW_ROW_MAJOR_TABLE_CELLS,
    // 独占/重合明细表——2026-09-14 第三轮实测确认跟 audience-geo 同一套
    // `.swReactTable-column` 结构（见 SW_OVERLAP_DETAIL_TABLE_CELLS 顶部注释）。
    'audience-overlap': SW_OVERLAP_DETAIL_TABLE_CELLS,
  };
  // 每张报表用**自己那份即将写进输出的数据**当指纹。similar-sites 没有解析器，
  // 就用整页文本（去掉空白差异）——它是静态的，两次一致即可信。
  const payloadOf = (cap) => {
    const bodyText = String(cap?.bodyText || '');
    if (report === 'performance') {
      const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      return compact(deriveMetrics(lines));
    }
    if (report === 'channels') {
      const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      // 10 大类渠道摘要（文本解析）+ 流量来源明细表（DOM 提取）两块都要稳定，
      // 任一块还在变都不能收——两块本来就是同一份数据的两种视图。
      return { summary: deriveChannels(lines), detail: deriveChannelDetailRows(cap?.cells) };
    }
    if (report === 'audience-geo') return deriveGeoRows(cap?.cells);
    if (report === 'audience-interests') return deriveAudienceInterestsRows(cap?.cells);
    if (report === 'audience-overlap') {
      const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      const metrics = deriveAudienceOverlapMetrics(lines);
      const detail = deriveAudienceOverlapDetailRows(cap?.cells, {
        knownDomains: metrics.perSiteAvgVisitors.map((s) => s.domain),
        emptyStateObserved: metrics.emptyStateObserved,
      });
      return { ...metrics, detail };
    }
    if (report === 'audience-demographics') {
      const lines = bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      return deriveAudienceDemographicsSignal(lines);
    }
    if (report === 'site-keywords') {
      // 关键词表 + 5 个统计卡两块都要稳定；统计卡各自的 loading 属性也并进
      // 指纹——属性从 "true" 变成 "false" 时指纹跟着变，不会被误收。
      return { table: deriveSiteKeywordRows(cap?.cells), statCards: deriveSiteKeywordStatCards(cap?.statCards) };
    }
    return { text: bodyText.replace(/\s+/g, ' ').trim() };
  };
  // **「一个字段都没解析出来」必须当成「还没渲染」，不能当成结论。**
  // compact() 把 null 去掉之后，空结果的形状就是 {}，而旧代码会把它照原样输出——
  // 报表看上去查成功了，metrics 是空的。表格类报表用 rows.length 判断同一件事。
  const isEmptyPayload = (payload) => {
    if (report === 'performance') return Object.keys(payload).length === 0;
    // 明细表允许合法地比摘要慢半拍：只要求摘要本身不是空的就不算「还没渲染」，
    // 明细表的完整性单独在 channelDetailRowsCompletenessUnverified 里如实标注，
    // 不拿它去卡这条「渲染没渲染」的粗判据——摘要有数据但明细一直是 0 行，
    // 更可能是这个站点真的没有可拆的细分来源，不该被这里当成"还没加载完"。
    if (report === 'channels') return !payload.summary?.totalFromChannels;
    if (report === 'audience-geo' || report === 'audience-interests') return !payload?.rows?.length;
    // overlap/demographics 不是表格，"还没渲染"的判据是"两个页面产出的信号
    // （确认有数据 / 确认空态）都还没出现"——任一个出现就不算空，具体是哪一种
    // 交给输出里的 dataConfirmed/emptyStateObserved(/sectionAnchorFound) 字段，
    // 这里只负责"该不该继续等"。
    if (report === 'audience-overlap') return !payload.dataConfirmed && !payload.emptyStateObserved;
    if (report === 'audience-demographics') return !payload.sectionAnchorFound && !payload.emptyStateObserved;
    if (report === 'site-keywords') return !payload.table?.rows?.length;
    return !payload.text;
  };

  // audience-geo 是唯一一个「表头自己声明了总行数、且实测存在分批渲染」的报表
  // （121 个国家实测分批出现——见 lib-similarweb.mjs deriveGeoRows 顶部注释）。
  // `captureStable` 的 `renderSignal` 就是为这种「重复不是完成」的场景设计的
  // （见 lib-tools-share.mjs 里那段长注释）：光是连续两次读到同样的行数不够，
  // 因为如果两次读数恰好都落在同一批渲染完成之后、下一批开始之前的间隙里，
  // 会被误判成「稳定」而提前收工。这里要求「已读行数 >= 表头总数」才算见过
  // 完成信号。
  //
  // **表头总数读不到时，renderSignal 仍然放行（返回 true），但不等于"确认读全
  // 了"**——2026-09-13 复核明确指出：不能靠"拖到 captureStable 超时才报
  // inconclusive"来处理这种情况（那会让每一次总数解析失败的正常查询都白等一整个
  // timeout 才失败，把一个大概率没问题的查询变成必然失败）。正确的收敛条件是
  // "至少连续两次行数与内容一致（已经是 fingerprint 的既有语义）+ 没有检测到
  // 加载占位（见下面 loading 信号）"——两者都满足就正常收下，**但收下之后必须
  // 在输出里如实标注 rowsCompletenessUnverified: true**，不能让它看起来和
  // "表头总数验证过、confirmed 读全"是同一种确定性。这个标注在下面 geoResult
  // 算出来之后统一处理，不在这里做。
  // site-keywords 的关键词表是分页表（Antd 分页控件），一页最多 ~100 行会
  // 同步渲染完；channels/audience-geo/audience-interests 是另一套
  // `.swReactTable-column` 结构，**2026-09-13 第三轮实测发现它们也分页**——
  // 总行数超过约 100 时出现一个"1 out of N"的自定义 footer（不是 Ant Design
  // 分页，class 是 `SWReactTableWrapperFooter-*` 哈希后缀，纯文本 "out of \d+"
  // 是稳定锚点）。howolddoyoulook.com 所有表都 ≤52 行从未触发过，第二轮因此
  // 没发现——**这是一个真实缺口**：旧版 RENDER_SIGNAL 硬要求
  // `rowsRead >= totalRowsOnPage` 才放行，totalRowsOnPage 是全站表头总数
  // （对照的大流量域名表头总数是 5 位数），只读到第 1 页的 ~100 行永远追不上，
  // 会让任何规模稍大的站点必然超时。修法：出现分页 footer 时，"这一页读全了"
  // 本身就是合法终态（还没实现翻页点击），不再死等 rowsRead 追上表头总数。
  const MULTI_PAGE_FOOTER = /out of\s+[\d,]+/i;

  // **滚动到底证据（2026-09-13 第三轮实测确认容器）**：真实滚动容器是
  // `.sw-layout-scrollable-element`（class 前缀非哈希，在 performance/
  // audience-geo/audience-interests 三个页面上都确认存在），不是 window——
  // `window.scrollY`/`document.documentElement.scrollHeight` 在这套布局下
  // 恒等于视口高度，用它判"到没到底"必然假阳性。**同时实测确认**：全新标签页、
  // 零滚动、`document.hidden=true` 的条件下，performance 的"用户指南"帮助
  // 面板（页面最底部）和 audience-geo 的 52 行已经完整出现在 DOM 里——这两个
  // 页面的内容不像 Semrush 那样靠 IntersectionObserver 滚动进视口才挂载。
  // **但这不能当成"滚动/可见性完全不重要"的结论**：本次没能让 Claude in
  // Chrome 的标签页变成非 hidden（`open -a`/`osascript activate` 都没用，
  // 这个自动化通道本身渲染在一个 OS 级不算"聚焦"的上下文），没有做成"隐藏 vs
  // 可见"的直接对照实验；真正跑这个脚本的 opencli 会话是独立的、真实可控的
  // Chrome 窗口，`--window foreground` 能不能让它 visibilityState 变成
  // "visible" 本轮没有用真实脚本验证过。综合考虑：**用确认过的容器做真实
  // scrollTrace 诊断，并强制这四个长表报表用前台窗口**，但暂不把"必须
  // atBottom"当成阻塞 captureStable 的硬 renderSignal——原因见下面
  // scrollUnverified 的用法：宁可多一个 warning，不要在没做成对照实验的情况下
  // 把这四个已经实跑验证工作正常的报表变成一个新的超时风险源。
  const SCROLL_CONTAINER_SELECTOR = '.sw-layout-scrollable-element';
  const SCROLL_TO_BOTTOM = `(() => {
    const el = document.querySelector(${JSON.stringify(SCROLL_CONTAINER_SELECTOR)});
    let containerFound = !!el;
    if (el) { try { el.scrollTop = el.scrollHeight; } catch (e) { containerFound = false; } }
    try { window.scrollTo(0, document.body.scrollHeight); } catch (e) {}
    const gap = el ? el.scrollHeight - el.scrollTop - el.clientHeight : (document.documentElement.scrollHeight - window.scrollY - window.innerHeight);
    return {
      containerFound,
      containerSelector: containerFound ? ${JSON.stringify(SCROLL_CONTAINER_SELECTOR)} : null,
      scrollTop: el ? el.scrollTop : window.scrollY,
      scrollHeight: el ? el.scrollHeight : document.documentElement.scrollHeight,
      clientHeight: el ? el.clientHeight : window.innerHeight,
      atBottom: gap <= 8,
      hidden: document.hidden,
      visibilityState: document.visibilityState,
    };
  })()`;
  const SCROLL_GATED_REPORTS = new Set(['audience-geo', 'channels', 'audience-interests', 'site-keywords']);
  // 每个报表的 RENDER_SIGNAL 现在是"原有的行数/分页完成信号" AND
  // "scrollGateSatisfied"——后者在 SCROLL_AB_CONCLUSIONS 对应条目还是
  // `concluded:false`（默认）时恒为 true，不改变今天的行为；只有真的把某个
  // 报表的 verdict 标成 `'needed'` 才会真正参与阻塞。site-keywords 之前没有
  // RENDER_SIGNAL 条目（完成判据完全靠 fingerprint 里的加载指示器 gate），
  // 这里新增一条纯粹为了让它也能吃到 scrollGateSatisfied——verdict 为 null 时
  // 首次读数就会立刻满足，等价于"没有这条 gate"，不会新增超时风险。
  const RENDER_SIGNAL = {
    'audience-geo': (cap) => {
      const g = deriveGeoRows(cap?.cells);
      const rowsOk = g.totalRowsOnPage === null || g.rowsRead >= g.totalRowsOnPage || MULTI_PAGE_FOOTER.test(String(cap?.bodyText || ''));
      return rowsOk && scrollGateSatisfied({ verdict: SCROLL_AB_CONCLUSIONS['audience-geo'].verdict, scroll: cap?.scroll });
    },
    channels: (cap) => {
      const d = deriveChannelDetailRows(cap?.cells);
      const rowsOk = d.totalRowsOnPage === null || d.rowsRead >= d.totalRowsOnPage || MULTI_PAGE_FOOTER.test(String(cap?.bodyText || ''));
      return rowsOk && scrollGateSatisfied({ verdict: SCROLL_AB_CONCLUSIONS.channels.verdict, scroll: cap?.scroll });
    },
    'audience-interests': (cap) => {
      const d = deriveAudienceInterestsRows(cap?.cells);
      const rowsOk = d.totalRowsOnPage === null || d.rowsRead >= d.totalRowsOnPage || MULTI_PAGE_FOOTER.test(String(cap?.bodyText || ''));
      return rowsOk && scrollGateSatisfied({ verdict: SCROLL_AB_CONCLUSIONS['audience-interests'].verdict, scroll: cap?.scroll });
    },
    'site-keywords': (cap) => scrollGateSatisfied({ verdict: SCROLL_AB_CONCLUSIONS['site-keywords'].verdict, scroll: cap?.scroll }),
  };
  // **site-keywords 加载指示器——2026-09-13 第三轮实测确认（不再是候选猜测）**：
  // 用一个全新标签页在加载中途抓拍到 `.ant-spin`/`.ant-spin-spinning`/
  // `.ant-table-placeholder`/`[aria-busy="true"]` 四个选择器**同时**命中且
  // `rows:0`；加载完成后全部消失、`rows>0`。第一、二轮都没抓住这个窗口（轮询
  // 节奏跟加载速度没对上），这次专门用"导航后立刻检查"的方式捕捉到了。
  // 现在可以真正接进 fingerprint 当阻断条件，不再只是"检测到就多等一轮"的
  // 弱信号，`loadingIndicatorUnverified` 对 site-keywords 相应改成 false。
  // `.app-loader`/`.sw_loader`/`.first-time-loader` 仍然确认是账号首次引导层，
  // 跟具体报表加载无关（第二轮结论，未变）；audience-geo/channels/
  // audience-interests 这三张 `.swReactTable-column` 系表格上仍然没有找到
  // 独立于内容之外的加载指示器（本轮沿用第二轮的确认结论，未重复验证）。
  const LOADING_INDICATOR_SELECTOR = '.ant-spin-spinning, .ant-table-placeholder, [aria-busy="true"]';
  // 滚动轨迹：每次读数一条，供人工排查"到底了没有/可见性如何"，格式参照
  // lib-semrush-overview.mjs 的 scrollTrace（只读参考，未照抄实现）。
  const scrollTrace = [];
  const scrollTraceStart = Date.now();
  // 读数级别记录 visibilityState；读到 hidden 时让虚拟屏幕控制器恢复（有上限），下一次读受益。
  const readWithVisibility = async (js) => {
    const cap = await evaluate(js);
    const aw = launched.automationWindow;
    if (aw) {
      aw.recordRead({ vis: cap?.visibilityState ?? null, label: 'capture-read' });
      if (cap?.visibilityState === 'hidden') await aw.ensureVisible('hidden-read');
    }
    return cap;
  };
  const settled = await captureStable({
    read: () => readWithVisibility(`(() => ({
      url: location.href,
      visibilityState: document.visibilityState,
      title: document.title,
      bodyText: (document.body?.innerText || '').slice(0, 50000)${CELL_EXTRACTORS[report] ? `,
      cells: ${CELL_EXTRACTORS[report]}` : ''}${report === 'site-keywords' ? `,
      statCards: ${SW_SITE_KEYWORD_STAT_CARDS},
      loading: !!document.querySelector(${JSON.stringify(LOADING_INDICATOR_SELECTOR)})` : ''}${SCROLL_GATED_REPORTS.has(report) ? `,
      scroll: ${SCROLL_TO_BOTTOM}` : ''}
    }))()`),
    abortIf: gatewayError,
    renderSignal: RENDER_SIGNAL[report],
    fingerprint: (cap) => {
      const text = String(cap?.bodyText || '');
      if (!boundToThisQuery(cap?.url, domain)) return null;
      // 确认过的加载指示器——命中就是「还在加载」，多等一轮，不当成这次的结论。
      if (report === 'site-keywords' && cap?.loading) return null;
      if (SCROLL_GATED_REPORTS.has(report) && cap?.scroll) scrollTrace.push({ atMs: Date.now() - scrollTraceStart, ...cap.scroll });
      if (!text.includes(READY_MARKERS[report])) {
        // 数据源正面说了「没有此网站的数据」——这是结论，不是失败，但要多确认一次。
        return NO_DATA.test(text) ? 'no-data' : null;
      }
      const payload = payloadOf(cap);
      if (isEmptyPayload(payload)) return NO_DATA.test(text) ? 'no-data' : null;
      // 把页面自己渲染出来的窗口文案也并进指纹——四个报表实测都能匹配上
      // findWindowLabel 认的两种形态之一（见 lib-similarweb.mjs）。这不是为了
      // 判「跟请求是否一致」（那件事在下面收下结果之后单独做——现在会拦截，
      // 见 scope-mismatch 分支），而是为了不让「数值已经稳定但窗口还在从上一次
      // 查询的残留状态切过来」这种瞬时态被提前当成结论——只要窗口文案还在变，
      // 指纹就不会稳。
      const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
      return JSON.stringify({ payload, windowLabel: findWindowLabel(lines) });
    },
    /**
     * 【2026-08-28 复核：这一处**不是**阈值赌博，不要「顺手」改成 inconclusive。】
     *
     * <law-ref id="readiness-must-bind-to-this-query"/> 打掉的是这个形状：
     * *读到空 N 次 / 等了 N 秒还是空 → 判空*。那里的证据是「什么都没有」，
     * 而一个还没开始渲染的区域天然就是「什么都没有」，所以证据为零。
     *
     * 这里的证据不是「没有」，是**有**：`NO_DATA` 匹配的是页面自己渲染出来的一句
     * 「我们没有此网站的数据 / 抱歉，未找到与该搜索匹配的内容」。骨架屏、占位符、
     * 还没水合的空表都产不出这句话——**页面必须先判定查无结果，才会把它挂上去**。
     * 按法则的话说：它是一个 positive、page-produced 的完成信号，和「表里有一个非空
     * 单元格」是同一个等级的证据，跟时长和读数不是一回事。
     *
     * 另一半（法则要求的「这是本次查询产出的吗」）由上面第一行的 URL 断言兜住：
     * 不含 `key=<本次查询的域名>` 一律返回 null，所以上一个域名残留在标签页里的
     * 那句空态提示，在这里根本进不了判定。
     *
     * 下面的 3 次重复因此**是冗余，不是判据**：判据是那句话本身。留着它的成本是几秒，
     * 收益是挡住一次偶发的读取抖动；删掉也不会让结论变得不可靠，但别反过来
     * 以为把它调大就能让「读到 0 行」变成可信的空态——那条路是被法则封死的。
     */
    needed: (print) => (print === 'no-data' ? 3 : 2),
    timeoutMs,
    intervalMs: Number(flags['stable-interval'] || 2.5) * 1000,
  });
  if (settled.aborted) throw new Error('Similarweb proxy gateway error (502/503/504); report did not load.');
  if (!settled.stable) {
    // 三种失败要分开说：从没就绪（八成是节点/代理）vs 就绪了但数一直在变（占位值）
    // vs 数值稳了但「读全了」这件事一直confirm 不了（renderSignal 一直是 false——
    // 比如 audience-geo 表头总数迟迟对不上已读行数，见上面 RENDER_SIGNAL 的注释）。
    // 第三种是本轮新加的：**不能把"数值不再变"直接当成"读全了"**，`inconclusive`
    // 就是「不完整,不是空,也不是确认过的稳定值」这三者里专门留给它的那一档，
    // 沿用脚本既有的"先取证后死"风格,不单独发明一套新状态字段。
    const scene = await captureScene({
      session, outDir: evidenceDir, evalPage: evaluate, env: launched?.env,
      tag: settled.inconclusive ? 'rows-incomplete' : settled.fingerprint ? 'values-never-settled' : 'timed-out',
      note: `similarweb-query ${report} ${domain}: stable=false after ${settled.reads} reads (inconclusive=${settled.inconclusive})`,
    });
    throw new Error((settled.inconclusive
      ? `The Similarweb ${report} report for ${domain} rendered stable values across ${settled.reads} reads, ` +
        `but the table never confirmed it had loaded all rows the page itself reports (rowsExpected vs rowsCaptured ` +
        `never matched) — this is incomplete, not empty, and not a confirmed-stable result. Rerun, or raise --timeout.`
      : settled.fingerprint
        ? `The Similarweb ${report} report for ${domain} rendered but its values never settled across ` +
          `${settled.reads} reads — what is on screen is still placeholder. Rerun, or raise --timeout.`
        : `Timed out waiting for the Similarweb ${report} report for ${domain} after ${settled.reads} reads. ` +
          `Last URL: ${settled.capture?.url ? String(settled.capture.url).split('?')[0] : 'unknown'}.`)
      + ` ${sceneSummaryLine(scene)}`);
  }
  const captured = settled.capture;
  const noDataTextObserved = settled.fingerprint === 'no-data';
  const lines = captured.bodyText.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  // audience-demographics：--gender/--age 请求了组合时，在这里点击切换——必须在
  // 下面 audienceDemographicsResult 计算之前做完，否则它会读到默认组合
  // （女性/18-24岁）的残留数据。见 resolveDemographicsFilter/
  // switchDemographicsFilter 旁边的大段注释（含两个下拉的交互模式差异、
  // 应用后展示文案跟默认状态不一致的已知情况）。
  let demographicsFilterSwitch = null;
  if (report === 'audience-demographics' && !noDataTextObserved && (demographicsFilter.gender || demographicsFilter.age)) {
    const requested = { gender: demographicsFilter.gender, age: demographicsFilter.age };
    if (!demographicsFilter.needsGenderClick && !demographicsFilter.needsAgeClick) {
      // 请求的组合刚好就是页面默认组合——什么都不用点，首次捕获已经是它了。
      demographicsFilterSwitch = { ok: true, requested, clicked: false };
    } else {
      const baselineFingerprint = JSON.stringify(deriveAudienceDemographicsSignal(lines).segment);
      const clickError = await switchDemographicsFilter(evaluate, demographicsFilter);
      if (clickError) {
        demographicsFilterSwitch = { ok: false, requested, clicked: true, ...clickError };
        console.error(`[audience_demographics_filter_switch_failed] ${domain}: 请求切到 gender=${requested.gender ?? '(默认)'} age=${requested.age ?? '(默认)'}，点击第 ${clickError.step} 步失败（${clickError.reason}）。分段行仍是切换前的默认组合。`);
      } else {
        // 连读到「分段行跟切换前的基线比，要么展示文案变了、要么数值变了」且
        // 连续两次读数一致才收下——**不断言应用之后的文案应该长什么样**（旁边
        // 注释已经说明这是已知的展示层不一致，猜一个期望字符串本身就不可靠），
        // 只看「确实变了、而且变了之后稳住了」，这跟整份脚本"连读两次一致才
        // 收下"的既有原则是同一套精神,不是另发明一条新规则。
        let confirmedLines = null;
        let previousFingerprint = null;
        let stableReads = 0;
        for (let i = 0; i < 10 && stableReads < 2; i += 1) {
          if (i > 0) await new Promise((resolve) => { setTimeout(resolve, 800); });
          const cap2 = await readWithVisibility(`(() => ({ bodyText: (document.body?.innerText || '').slice(0, 50000) }))()`);
          const lines2 = String(cap2?.bodyText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
          const segment2 = deriveAudienceDemographicsSignal(lines2).segment;
          const fingerprint2 = JSON.stringify(segment2);
          const changedFromBaseline = segment2 != null && fingerprint2 !== baselineFingerprint;
          stableReads = changedFromBaseline && fingerprint2 === previousFingerprint ? stableReads + 1 : (changedFromBaseline ? 1 : 0);
          previousFingerprint = fingerprint2;
          if (changedFromBaseline) confirmedLines = lines2;
        }
        if (confirmedLines) {
          lines.length = 0;
          lines.push(...confirmedLines);
          captured.bodyText = confirmedLines.join('\n');
          demographicsFilterSwitch = { ok: true, requested, clicked: true };
        } else {
          demographicsFilterSwitch = { ok: false, requested, clicked: true, step: 'settle', reason: 'segment-did-not-change-from-baseline' };
          console.error(`[audience_demographics_filter_switch_failed] ${domain}: 点击都成功了，但分段行数值/展示文案在多次读数里始终没有跟切换前的基线不一样——不确定是切换真的没生效还是这个组合恰好和默认组合数值相同，分段行仍是切换前的默认组合。`);
        }
      }
    }
  }
  // audience-geo 的「总数」（totalRowsOnPage）就是这张表的行总数，和 rowsRead
  // 说的是同一件事。site-keywords 的表头总数（pageReportedKeywordTotal）是这个
  // 站点全站收录的关键词数，跟这次读到多少行是两回事——两张报表的「总数」字段
  // 名字不同就是因为它们数的不是同一种东西，见 lib-similarweb.mjs 里对应函数
  // 顶部的注释。
  const geoResult = report === 'audience-geo' && !noDataTextObserved ? deriveGeoRows(captured.cells) : null;
  const keywordsResult = report === 'site-keywords' && !noDataTextObserved ? deriveSiteKeywordRows(captured.cells) : null;
  // 流量来源明细表（channels 报表新补的区块，2026-09-13 第二轮实测）——跟
  // geoResult 是同一套提取框架，读法完全一样。
  const channelDetailResult = report === 'channels' && !noDataTextObserved ? deriveChannelDetailRows(captured.cells) : null;
  // 5 个统计卡（site-keywords 报表新补的区块）。
  const statCardsResult = report === 'site-keywords' && !noDataTextObserved ? deriveSiteKeywordStatCards(captured.statCards) : null;
  // 受众页三个新 tab（2026-09-13 第三轮离线新增）。
  const audienceInterestsResult = report === 'audience-interests' && !noDataTextObserved ? deriveAudienceInterestsRows(captured.cells) : null;
  const audienceOverlapMetricsResult = report === 'audience-overlap' && !noDataTextObserved ? deriveAudienceOverlapMetrics(lines) : null;
  // 独占/重合明细表——2026-09-14 第三轮新增，跟 metrics 同一次捕获里的 cells 一起解析，
  // 见 lib-similarweb.mjs deriveAudienceOverlapDetailRows 顶部注释（含核对过程）。
  const audienceOverlapDetailResult = audienceOverlapMetricsResult
    ? deriveAudienceOverlapDetailRows(captured.cells, {
      knownDomains: audienceOverlapMetricsResult.perSiteAvgVisitors.map((s) => s.domain),
      emptyStateObserved: audienceOverlapMetricsResult.emptyStateObserved,
    })
    : null;
  const audienceOverlapResult = audienceOverlapMetricsResult
    ? { ...audienceOverlapMetricsResult, detail: audienceOverlapDetailResult }
    : null;
  const audienceDemographicsResult = report === 'audience-demographics' ? deriveAudienceDemographicsSignal(lines) : null;
  // "网站表现"页 notCovered 区块的离线补抓 + 受众兴趣 tab 的行业分布/话题词云
  // （2026-09-13 第五轮，完全离线补的）。跟上面几个 result 一样，noDataTextObserved
  // 时不解析——那种情况下 bodyText 本来就是页面正面写的空态句子，硬解析只会
  // 全部落进 confirmed-absent，没有信息量，也没必要。
  const overviewSupplementalResult = report === 'performance' && !noDataTextObserved
    ? deriveOverviewSupplementalBlocks(lines) : null;
  const audienceInterestsSupplementalResult = report === 'audience-interests' && !noDataTextObserved
    ? deriveAudienceInterestsSupplemental(lines, { domain }) : null;
  // 「随着时间的访问」趋势折线图——2026-09-14 排查确认数据不在 DOM 里，来自
  // 一条独立的 XHR（见 lib-similarweb.mjs deriveTrendGraph 顶部注释，含跟
  // 页面图例的核对过程）。只在 performance 报表、且已确认这次查询有数据时才
  // 去抓一次 `network --raw`；网络捕获本身失败、或响应体结构不认识，都不能
  // 拖累这次查询里其它已经拿到手的字段——如实标 unresolved，跟别的补抓区块
  // 一样的四态精神,不是让整条查询失败。
  let trendGraphResult = null;
  if (report === 'performance' && !noDataTextObserved) {
    try {
      const netRes = await opencli(['browser', session, 'network', '--raw'], { env: launched?.env, timeoutMs: 60_000 });
      const netEntries = firstJson(netRes?.stdout)?.entries ?? [];
      trendGraphResult = deriveTrendGraph(findTrendGraphNetworkEntry(netEntries), { primaryDomain: domain });
    } catch (error) {
      trendGraphResult = {
        status: 'unresolved',
        reason: `network-capture-failed: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
        domains: null,
        series: null,
      };
    }
  }
  // site-keywords 是否被截断，问的是「这张表本身还有没有下一页」，不是关键词总数
  // 减去 rowsRead——那个数字根本不是同一种东西（见上面的注释）。只有在提取器
  // 真的在页面上看到了未禁用的「下一页」按钮时才报；`morePagesAvailable === null`
  // 说明分页控件没找到（比如页面本来就是单页，没有分页控件），这种「不知道」
  // 不该被当成「有更多页」去报警，也不该被当成「确认没有」而彻底沉默——
  // 所以下面单独打一行日志说明这次是哪种情况，跟 semrush-report.mjs 的
  // `[truncated]` 走同一种腔调。
  if (keywordsResult) {
    if (keywordsResult.morePagesAvailable === true) {
      // `totalPages`/`currentPage` 来自 Antd simple 分页器的 title 属性
      // （形如「1/389777」）——**不是** `.ant-pagination-total-text`，那个
      // class 只有用了 Antd 的 showTotal 才会渲染，这张页面没用，选择器永远
      // 查不到，是死代码路径。有了总页数就能说清楚「共几页，本次读了第几页」，
      // 跟 semrush-report.mjs 的 `共 201 页，本次只读了第 1 页` 是同一种腔调；
      // 拿不到总页数（分页器不是这个格式）就退化成只说「还有下一页」。
      console.error(
        keywordsResult.totalPages
          ? `[truncated] site-keywords ${domain}: 共 ${keywordsResult.totalPages} 页，本次只读了第 ` +
            `${keywordsResult.currentPage ?? 1} 页（${keywordsResult.rowsRead} 行）。`
          : `[truncated] site-keywords ${domain}: 表格还有下一页未读取，当前只有 ${keywordsResult.rowsRead} 行。`,
      );
    } else if (keywordsResult.morePagesAvailable === null) {
      console.error(
        `[truncated?] site-keywords ${domain}: 页面上没找到分页控件，无法确认这 ${keywordsResult.rowsRead} 行` +
        `是不是全部——不是「确认单页」，只是「没查到分页控件」。`,
      );
    }
    // morePagesAvailable === false：分页控件明确说没有下一页，这才是「确认单页」，不用提。
  }
  // audience-geo 反过来：`totalRowsOnPage` 和 `rowsRead` 说的是同一件事（都是
  // 这张表的行数），`deriveGeoRows` 自己的注释也写了「两者不等时通常是分页
  // 没翻完」——但之前这里从来没有谁真的去比较这两个数字，写了等于没写。
  // 独立检查报告点名：这是唯一一个「对比有意义」的报表，却是唯一一个不打
  // 任何提示的报表。
  if (geoResult) {
    if (geoResult.totalRowsOnPage !== null && geoResult.rowsRead < geoResult.totalRowsOnPage) {
      console.error(
        `[truncated] audience-geo ${domain}: 页面表头显示共 ${geoResult.totalRowsOnPage} 个国家/地区，` +
        `这次只解析出 ${geoResult.rowsRead} 行。`,
      );
    }
    // `SW_GEO_TABLE_CELLS` 用最短列的长度截断所有列——如果某一列在 DOM 里
    // 少渲染了几格，所有列都会被拖着从底部截断，且上面那条对比可能因为
    // totalRowsOnPage 本身没问题、只是行被砍了而看不出来（rowsRead 依然可能
    // 等于 totalRowsOnPage，如果被砍的行数正好不影响这个巧合）。这里单独报，
    // 不依赖上面那条数字对比。
    if (geoResult.columnDepthMismatch) {
      console.error(
        `[truncated?] audience-geo ${domain}: 提取器发现列长度不一致，已用最短列的长度截断——` +
        `当前 ${geoResult.rowsRead} 行可能不是全部，且具体丢了哪几个国家不确定。`,
      );
    }
  }
  // ---- 自洽校验（不需要第二个数据源的交叉验证）----------------------------
  // 这一段查的都是「页面自己说的话有没有互相打架」。真实事故的教训：missingColumns
  // 空、rowsRead 对得上、suspectColumns 空——三个信号一致地说「干净」，而 121 个
  // 国家里有 9 个的流量份额被静默丢掉了。单一信号查不出部分失败，得让几条互不
  // 依赖的路径同时说话。
  for (const [label, result] of [['audience-geo', geoResult], ['site-keywords', keywordsResult]]) {
    for (const loss of result?.partialLossColumns ?? []) {
      // **没有阈值**：占位符已经不进分母了，剩下的每一个 null 都是页面上确实
      // 印着内容、却被我们扔掉的格子。带上原文样本，否则没法排查缺的是哪种格式。
      console.error(
        `[partial-loss] ${label} ${domain}: 「${loss.column}」列有 ${loss.lost}/${loss.of} 行解析成 null，` +
        `原文样本：${loss.samples.map((v) => JSON.stringify(v)).join(', ')}。`,
      );
    }
  }
  if (geoResult?.trafficShareSum) {
    const { sum, contributing, ofRows } = geoResult.trafficShareSum;
    // 只有在「这张表确认读全了」的前提下，和才应该 ≈100——读了半张表当然不足
    // 100，那是截断问题，上面已经单独报过了，不该在这里重复报一次假警报。
    const complete = geoResult.totalRowsOnPage !== null
      && geoResult.rowsRead === geoResult.totalRowsOnPage
      && !geoResult.columnDepthMismatch;
    // 容差 2 个百分点：每行份额是四舍五入到 2 位显示的，121 行累积起来本身
    // 就有约 0.6 的漂移；`< 0.01%` 这类下限值又按上限取，会略微高估。
    if (complete && Math.abs(sum - 100) > 2) {
      console.error(
        `[sum-check] audience-geo ${domain}: 各国流量份额之和 ${sum}%（${contributing}/${ofRows} 行有数值），` +
        `偏离 100% 超过容差——要么有行的份额被丢掉了，要么这一列的单位解析错了。`,
      );
    }
  }
  if (keywordsResult?.totalPages && keywordsResult.pageReportedKeywordTotal) {
    // 同源异视图的等值检查：表头声明的全站关键词总数 ÷ 每页行数，应该约等于
    // 分页器声明的总页数。这两个数字来自页面上两个**完全不同**的地方，由两个
    // 互相不知道对方存在的解析器读出来，同时对得上就是互相印证。
    //
    // 这条检查以前是写在注释里的，理由是「怕误报把好数据拦下来」——但警告不是
    // 拦截，怕误报就不做检查，等于把唯一一条真等值验证路径关掉了。
    const ROWS_PER_PAGE = 100;
    const impliedPages = Math.ceil(keywordsResult.pageReportedKeywordTotal / ROWS_PER_PAGE);
    // 容差 1 页：末页不满、以及总数本身可能是估算值。
    if (Math.abs(impliedPages - keywordsResult.totalPages) > 1) {
      console.error(
        `[cross-check] site-keywords ${domain}: 表头总数 ${keywordsResult.pageReportedKeywordTotal} ` +
        `推出约 ${impliedPages} 页，分页器却说 ${keywordsResult.totalPages} 页——两个解析器里至少有一个不对。`,
      );
    }
  }

  // 时间/国家/设备三个筛选器「页面自己怎么说」的证据，跟请求参数比对——
  // 这是本轮的核心修复之一：之前 boundToThisQuery 只校验域名，完全不检查
  // 落地的到底是不是请求的那个窗口/国家/设备。
  //
  // **2026-09-13 二次复核：「不拦截，只在 stderr/JSON 里报告」本身仍然是
  // 「以为抓到了、其实没抓到」的一种**——只要数据照常进了 `metrics`/`geo`/
  // `keywords` 这些正式字段，调用方大概率不会去翻 scopeEvidence，就会把窗口
  // 不一致的数字当成请求窗口的数字用。用户的硬性原则是「绝不能让脚本自己以为
  // 抓到了、实际没抓到」，权衡的天平不是「超时 vs 静默通过」这两个选项，
  // 而是第三条路：**立即停止（不额外等待），但也不装作成功**——见下面
  // windowMismatchBlocking 分支。
  const scopeEvidence = {
    ...deriveScopeEvidence(lines, {
      requestedWindowSeg: REPORT_WINDOW_SEG[report] ?? null,
      countryApplicable: COUNTRY_APPLICABLE[report] ?? true,
    }),
    // URL 通道的窗口漂移证据（gotoInTool 直接对比请求/落地路由算出来的），
    // 跟上面文本通道（页面正文渲染出的窗口文案）的证据并列——两条独立路径
    // 都指向同一个结论时才是真正可信的印证，只有一条命中时另一条能帮忙澄清
    // "是不是提取器本身的问题"。
    navRouteWindow,
  };

  // 表格类报表「没法在离线阶段确认，但也不该被当成已确认」的信号：
  //   1. rowsCompletenessUnverified 系——RENDER_SIGNAL 在表头总数读不到时选择
  //      不阻塞（避免把解析失败变成必然超时），代价是"读全了"这件事没有被
  //      验证过。
  //   2. loadingIndicatorUnverified——2026-09-13 第二轮实测确认 audience-geo/
  //      channels 这两类 .swReactTable-column 表格没有独立于内容之外的加载
  //      指示器（见 RENDER_SIGNAL 旁边的大段注释），所以只有 site-keywords
  //      主表格 + 第三轮新增的三个受众 tab 还保持 unverified——都没有专门测过
  //      "立即刷新+抢拍加载态"，是否有独立 loading 态没有确定结论。
  //   3. scrollUnverified——2026-09-13 第三轮：滚动容器已确认（见上面
  //      SCROLL_TO_BOTTOM 旁边的大段注释），但"隐藏 vs 可见"对照实验没做成，
  //      所以还不敢把"到过底部"当成硬 gate，恒为 true 直到做成那组对照实验。
  const rowsCompletenessUnverified = geoResult ? geoResult.totalRowsOnPage === null : false;
  const channelDetailRowsCompletenessUnverified = channelDetailResult ? channelDetailResult.totalRowsOnPage === null : false;
  const audienceInterestsRowsCompletenessUnverified = audienceInterestsResult ? audienceInterestsResult.totalRowsOnPage === null : false;
  const audienceOverlapUnverified = audienceOverlapResult ? (!audienceOverlapResult.dataConfirmed && !audienceOverlapResult.emptyStateObserved) : false;
  const audienceDemographicsUnverified = audienceDemographicsResult
    ? (!audienceDemographicsResult.dataConfirmed && !audienceDemographicsResult.emptyStateObserved)
    : false;
  // site-keywords 的加载指示器 2026-09-13 第三轮已实测确认（见 LOADING_INDICATOR_SELECTOR
  // 旁边的注释）并接进了 fingerprint 当阻断条件，不再是"没测过的候选"——从
  // unverified 列表里移出。三个受众 tab 仍然没有专门测过，保持 unverified。
  const loadingIndicatorUnverified = ['audience-interests', 'audience-overlap', 'audience-demographics'].includes(report);
  const statCardsUnverified = statCardsResult ? statCardsResult.loadingUnverified : false;
  // "网站表现"页/受众兴趣 tab 离线补抓的子区块——任何一个子区块落在 unresolved
  // （锚点找到了但形状不认识，既不是 data 也不是已知的 legit-empty/locked/
  // confirmed-absent）就不能整体判 ok，见 lib-similarweb.mjs 里
  // deriveOverviewSupplementalBlocks/deriveAudienceInterestsSupplemental
  // 旁边的四态说明。
  const OVERVIEW_SUPPLEMENTAL_GATE_KEYS = [
    'deviceSplit', 'brandVsNonBrand', 'topOrganicKeywords', 'topPaidKeywords',
    'referralSites', 'referralIndustries', 'outboundDestinations', 'displayAdvertisers',
    'topMediaPublishers', 'socialBreakdown', 'geoTop5', 'channelSummary',
  ];
  const overviewSupplementalUnresolved = overviewSupplementalResult
    ? OVERVIEW_SUPPLEMENTAL_GATE_KEYS.some((key) => overviewSupplementalResult[key]?.status === 'unresolved')
    : false;
  const audienceInterestsSupplementalUnresolved = audienceInterestsSupplementalResult
    ? ['industryDistribution', 'topicCloud'].some((key) => audienceInterestsSupplementalResult[key]?.status === 'unresolved')
    : false;
  // 独占/重合明细表——2026-09-14 新增，跟 overviewSupplemental 同一种四态语义：
  // 只有 'unresolved'（锚点/表头找到了但解析不出来）才拦，'legit-empty'/
  // 'data' 都算正常收下。
  const audienceOverlapDetailUnresolved = audienceOverlapDetailResult?.status === 'unresolved';
  // scrollUnverified 现在跟着 SCROLL_AB_CONCLUSIONS 走（见该表旁边的大段
  // 注释）：还没做成对照实验（`concluded:false`，本轮所有报表的默认值）时
  // 恒为 true，不能假装"滚动这件事已经被验证过"；一旦某个报表的条目被改成
  // `concluded:true`——不管 verdict 是 'not-needed'（已确认内容不依赖滚动，
  // 改由行数/分页/加载占位这些既有信号把关）还是 'needed'（这时滚动已经是
  // RENDER_SIGNAL 的硬性前置条件，能走到这里就说明已经确认过停在底部且
  // 可见）——都不再需要这条 warning。
  const scrollAbConclusion = SCROLL_GATED_REPORTS.has(report) ? SCROLL_AB_CONCLUSIONS[report] : null;
  const scrollUnverified = SCROLL_GATED_REPORTS.has(report) && !scrollAbConclusion?.concluded;
  // **2026-09-13 第五轮**：`--activate-chrome false`（或者哪怕开着前台，标签页
  // 还是被别的窗口挡住/切走）之后，如果这次真的抓到过 hidden:true 的读数，
  // 这是一个独立于"滚动到底"之外的风险信号——即使将来某个报表的
  // SCROLL_AB_CONCLUSIONS 被标成 concluded（不再产出 scroll_to_bottom_unverified），
  // 「这一次具体跑的时候标签页被藏起来过」这件事本身仍然要单独拦一次，不能
  // 因为滚动维度"已经验证过"就连带放行一次真实发生过的可见性风险。
  const pageWasHiddenDuringCapture = SCROLL_GATED_REPORTS.has(report)
    && (scrollTrace.some((entry) => entry?.hidden === true) || settled.capture?.scroll?.hidden === true);
  // 2026-09-14：见 HIDDEN_CAPTURE_CONFIRMED_SAFE_REPORTS 旁边的大段注释——只有
  // audience-interests 的 A/B 证据真的在 hidden:true 下测过，才不让这次观测
  // 独立降级状态；其余三个报表的证据都只在 hidden:false 下测过，hidden 仍要拦。
  // 原始观测值 pageWasHiddenDuringCapture 照常写进输出（信息字段），这里只决定
  // 要不要把它也喂给 decideScopeStatus 当阻断信号。
  const pageHiddenCaptureBlocksStatus = hiddenCaptureRequiresDowngrade(report, pageWasHiddenDuringCapture);

  // 三档状态判定：见 decideScopeStatus 顶部的大段注释。主流程和 --self-test
  // 调的是同一个函数，避免"自测测一份逻辑、脚本跑另一份"。
  const decision = decideScopeStatus({
    windowMatchesRequest: scopeEvidence.windowMatchesRequest,
    windowRequested: scopeEvidence.windowRequested,
    windowActual: scopeEvidence.windowLabel,
    acceptWindowFallback,
    countryUnverified: scopeEvidence.countryUnverified,
    deviceUnverified: scopeEvidence.deviceUnverified,
    rowsCompletenessUnverified,
    loadingIndicatorUnverified,
    channelDetailRowsCompletenessUnverified,
    statCardsUnverified,
    audienceInterestsRowsCompletenessUnverified,
    audienceOverlapUnverified,
    audienceOverlapDetailUnresolved,
    audienceDemographicsUnverified,
    scrollUnverified,
    pageWasHiddenDuringCapture: pageHiddenCaptureBlocksStatus,
    overviewSupplementalUnresolved,
    audienceInterestsSupplementalUnresolved,
  });
  for (const w of decision.warnings) console.error(`[${w.code}] ${report} ${domain}: ${w.message}`);

  if (decision.blocked) {
    // **核心分支：确认的窗口不一致，且调用方没有显式接受放宽，立即以非成功
    // 状态停止**——不是等到超时，settled 已经稳定之后立刻判定，跟"等待"无关。
    // 真实数据仍然落盘（放进 unconfirmed* 字段）供人工排查，但不进正式字段，
    // 退出码非 0，`status` 是一个明确不同于成功的值。
    console.error(
      `[scope-mismatch] ${report} ${domain}: 页面显示的窗口(${scopeEvidence.windowLabel})跟请求的窗口` +
      `(${scopeEvidence.windowRequested})不一致，且未传 --accept-window-fallback——立即判定 scope-mismatch，` +
      `数据落进 unconfirmed* 字段，不进正式字段。`,
    );
    output = {
      version: 1,
      source: 'Similarweb via authenticated Tools Share browser session',
      retrievedAt: new Date().toISOString(),
      domain,
      report,
      session,
      status: decision.status,
      url: captured.url,
      title: captured.title,
      subscription,
      ...(report === 'site-keywords' ? { trafficTab } : {}),
      reads: settled.reads,
      noDataTextObserved,
      scopeEvidence,
      notCovered: NOT_COVERED[report] || [],
      windowRequested: scopeEvidence.windowRequested,
      // 页面实际显示的窗口——如实作为观测事实报出来，但不是这次查询的正式口径，
      // 除非调用方用 --accept-window-fallback 显式接受它。
      windowActual: scopeEvidence.windowLabel,
      // 数据仍然给出来，但降级成 unconfirmed*——正式字段（metrics/channels/geo/
      // keywords）留空，防止调用方绕过 status 检查直接读正式字段拿到错口径的数字。
      ...(report === 'performance' && !noDataTextObserved ? { unconfirmedMetrics: compact(deriveMetrics(lines)) } : {}),
      ...(report === 'channels' && !noDataTextObserved ? { unconfirmedChannels: deriveChannels(lines) } : {}),
      ...(channelDetailResult ? { unconfirmedChannelDetail: channelDetailResult } : {}),
      ...(geoResult ? { unconfirmedGeo: geoResult } : {}),
      ...(keywordsResult ? { unconfirmedKeywords: keywordsResult } : {}),
      ...(statCardsResult ? { unconfirmedStatCards: statCardsResult } : {}),
      ...(audienceInterestsResult ? { unconfirmedAudienceInterests: audienceInterestsResult } : {}),
      ...(audienceOverlapResult ? { unconfirmedAudienceOverlap: audienceOverlapResult } : {}),
      ...(audienceDemographicsResult ? { unconfirmedAudienceDemographics: audienceDemographicsResult } : {}),
      ...(demographicsFilterSwitch ? { demographicsFilterSwitch } : {}),
      ...(overviewSupplementalResult ? { unconfirmedOverviewSupplemental: overviewSupplementalResult } : {}),
      ...(audienceInterestsSupplementalResult ? { unconfirmedAudienceInterestsSupplemental: audienceInterestsSupplementalResult } : {}),
      ...(trendGraphResult ? { unconfirmedTrendGraph: trendGraphResult } : {}),
      sparse: /没有足够的数据|Not enough data|N\/A/i.test(captured.bodyText),
      rawText: captured.bodyText,
      error: {
        code: 'window_scope_mismatch',
        message: `The Similarweb ${report} report for ${domain} rendered ${scopeEvidence.windowLabel ?? 'an unrecognised'} ` +
          `window, not the requested ${scopeEvidence.windowRequested}. This can be Similarweb legitimately widening a ` +
          `small site's window, or stale state carried over from a previous query sharing this browser tab — either way ` +
          `the data is NOT filed under the normal fields. Rerun with --accept-window-fallback to accept the rendered ` +
          `window as this query's authoritative scope, or start a fresh session/tab and retry.`,
      },
    };
    process.exitCode = decision.exitCode;
  } else {
    output = {
      version: 1,
      source: 'Similarweb via authenticated Tools Share browser session',
      retrievedAt: new Date().toISOString(),
      domain,
      report,
      session,
      // 只有零 warnings 时才是纯粹的 "ok"——任何一项没能独立确认，都用一个明确
      // 不同于纯成功的状态词，逼调用方去看 warnings，而不是让它看起来和
      // 完全确认过的结果长一个样。
      status: decision.status,
      url: captured.url,
      title: captured.title,
      subscription,
      // 只有 site-keywords 有这三个子 tab；其它报表不产出一个恒为 'total' 的
      // 噪音字段。
      ...(report === 'site-keywords' ? { trafficTab } : {}),
      // 读了几次才稳下来；偶发 4+ 次说明这个节点水合很慢，值得换。
      reads: settled.reads,
      // 数据源正面渲染了「没有此网站的数据」这句话，且连着三次都这么说。**这是观测
      // 事实，不是失败**——它和「查不到」必须区分开，所以单独一个字段，而不是一个空的
      // metrics。「该不该当没数据处理」由 AI 判。（旧别名 belowFloor 已移除。）
      noDataTextObserved,
      // 时间/国家/设备口径的证据——见上面的大段注释。
      scopeEvidence,
      windowRequested: scopeEvidence.windowRequested,
      windowActual: scopeEvidence.windowLabel,
      // 滚动到底的观测证据（不用于阻塞完成判定，见 SCROLL_TO_BOTTOM 旁边的
      // 大段注释）——容器选择器已确认，但"隐藏是否影响懒加载"未做成对照实验，
      // 这里只是如实记录最终读数（scrollEvidence）和整个轮询期间每次读数的
      // 轨迹（scrollTrace：{atMs, containerFound, scrollTop, scrollHeight,
      // clientHeight, atBottom, hidden, visibilityState}[]），供下一轮做成
      // 对照实验时核对。
      ...(SCROLL_GATED_REPORTS.has(report) ? {
        scrollEvidence: settled.capture?.scroll ?? null, scrollTrace, scrollAbConclusion,
        // 这次跑有没有为这个报表自动抬前台、有没有真的抓到过 hidden 读数——
        // 2026-09-13 第五轮为了回应"脚本反复抬前台抢焦点"的反馈新增，见
        // --activate-chrome 帮助文本和 pageWasHiddenDuringCapture 的注释。
        // pageWasHiddenDuringCapture 永远是原始观测事实；hiddenCaptureRelaxed
        // 才说明这次观测有没有被算进 status/warnings（2026-09-14 新增——只有
        // audience-interests 有 hidden 下行数一致的 A/B 证据，见
        // HIDDEN_CAPTURE_CONFIRMED_SAFE_REPORTS 旁边的注释）。
        activateChrome, activateChromeSkipped, pageWasHiddenDuringCapture,
        hiddenCaptureRelaxed: HIDDEN_CAPTURE_CONFIRMED_SAFE_REPORTS.has(report),
      } : {}),
      // 没能独立确认的维度，逐条说明原因；空数组就是真的什么都不缺。
      warnings: decision.warnings,
      // 页面上肉眼可见、但当前脚本没有提取器覆盖的区块——静态清单，见 NOT_COVERED
      // 定义处的注释，不是运行时探测出来的。
      notCovered: NOT_COVERED[report] || [],
      // 只有「网站表现」页有总访问量/排名/跳出率这些指标。在渠道页上跑 deriveMetrics
      // 会把筛选器里的字当成数值抓（实测 globalRank 抓成 1），宁可不给也不要给错的。
      ...(report === 'performance' && !noDataTextObserved ? { metrics: compact(deriveMetrics(lines)) } : {}),
      ...(report === 'channels' && !noDataTextObserved ? { channels: deriveChannels(lines) } : {}),
      ...(channelDetailResult ? { channelDetail: channelDetailResult } : {}),
      ...(geoResult ? { geo: geoResult } : {}),
      ...(keywordsResult ? { keywords: keywordsResult } : {}),
      ...(statCardsResult ? { statCards: statCardsResult } : {}),
      ...(audienceInterestsResult ? { audienceInterests: audienceInterestsResult } : {}),
      ...(audienceOverlapResult ? { audienceOverlap: audienceOverlapResult } : {}),
      ...(audienceDemographicsResult ? { audienceDemographics: audienceDemographicsResult } : {}),
      // --gender/--age 请求了非默认组合时,点击切换的结果——ok:true 才代表
      // audienceDemographics.segment 是请求的组合,ok:false 时 segment 仍是
      // 页面默认组合(女性/18-24岁),不是请求的那个,见 switchDemographicsFilter
      // 旁边的大段注释。
      ...(demographicsFilterSwitch ? { demographicsFilterSwitch } : {}),
      // "网站表现"页 notCovered 区块的离线补抓 + 受众兴趣 tab 的行业分布/
      // 话题词云（2026-09-13 第五轮）——每个子区块自己带 status（data/
      // legit-empty/locked/confirmed-absent/unresolved），见
      // lib-similarweb.mjs 里 deriveOverviewSupplementalBlocks/
      // deriveAudienceInterestsSupplemental 旁边的四态说明。
      ...(overviewSupplementalResult ? { overviewSupplemental: overviewSupplementalResult } : {}),
      ...(audienceInterestsSupplementalResult ? { audienceInterestsSupplemental: audienceInterestsSupplementalResult } : {}),
      // 趋势折线图——2026-09-14 新增，数据来自独立 XHR 而非 DOM，见
      // lib-similarweb.mjs deriveTrendGraph 顶部注释。
      ...(trendGraphResult ? { trendGraph: trendGraphResult } : {}),
      sparse: /没有足够的数据|Not enough data|N\/A/i.test(captured.bodyText),
      rawText: captured.bodyText,
    };
    process.exitCode = decision.exitCode;
  }
  output.automationWindow = automationWindowSummary();
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  printJson(output);
} catch (error) {
  // **先取证后关**：finally 里的 closeSession 会销毁唯一证人，所以现场必须在
  // 这里落。上面 never-settled 分支已经拍过一次的话，这里再拍一张 unavailable
  // 时刻的也不亏——两处 tag 不同，不会互相覆盖。captureScene 永不 throw。
  const scene = launched
    ? await captureScene({
      session, outDir: evidenceDir, evalPage: evaluate ?? undefined, env: launched?.env,
      tag: 'unavailable', note: `similarweb-query ${report} ${domain}: ${redactSecrets(String(error?.message || error)).slice(0, 200)}`,
    })
    : null;
  output = {
    version: 1,
    source: 'Similarweb via authenticated Tools Share browser session',
    retrievedAt: new Date().toISOString(),
    domain,
    report,
    session,
    status: 'unavailable',
    // 失败输出必须带现场：census + 截图的落盘路径（拍不到时是错误说明）。
    evidence: scene,
    error: {
      // 四种成因四个码：从没渲染（代理/节点）、渲染了但数没稳（占位值）、
      // 数稳了但读全了这件事一直 confirm 不了（表格截断/懒加载中）、其它。
      code: /proxy gateway error/i.test(error.message) ? 'proxy_gateway_error' : /never confirmed it had loaded all rows/i.test(error.message)
        ? 'rows_incomplete'
        : /never settled/i.test(error.message)
          ? 'values_never_settled'
          : /Timed out waiting for the (launched )?Similarweb/i.test(error.message)
            ? 'shared_proxy_blank_or_unavailable'
            : 'query_failed',
      // opencli 的报错里可能带着 __gmitm 令牌（它会打印活动会话的完整 URL）。
      message: redactSecrets(error.message),
    },
    automationWindow: automationWindowSummary(error),
  };
  if (typeof flags.out === 'string') {
    await writeFile(flags.out, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
  }
  printJson(output);
  process.exitCode = 1;
} finally {
  await launched?.releaseBrowserLocks();
  if (!keepOpen) await closeSession(session);
}

/**
 * 离线自检：不连浏览器，不需要 --domain。只验证 lib-similarweb.mjs 里两张新表的
 * 解析器——`deriveGeoRows` / `deriveSiteKeywordRows`——在实测样本上的行为，
 * 尤其是本文件顶部注释反复强调的那几条：占位符必须是 null 不是 0，列换位置
 * 不能换答案，改名/丢列必须显式进 missingColumns，且格式对不上时要落进
 * suspectColumns（而不是安安静静地全部 null）。
 *
 * 2026-08-27 那次真实检查戳穿了第一版 fixture：手打的样例表头/格子跟真实 DOM
 * 不一样（表头「(121)」前有没有空格、数字带不带千分位逗号、格子是斜杠分隔还是
 * 换行分隔），下面的 fixture 已经按检查报告里给出的真实形态改过。
 */
function runSelfTest() {
  if (!gatewayError({title:'3ue.co | 502: Bad gateway'}) || gatewayError({title:'查找关键词',bodyText:'关键词 502'}))
    throw new Error('gateway error must stop polling without treating a metric as an error');
  const assertEqual = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) {
      throw new Error(`similarweb-query self-test failed [${label}]\n  actual:   ${a}\n  expected: ${e}`);
    }
  };
  const assert = (label, cond) => {
    if (!cond) throw new Error(`similarweb-query self-test failed [${label}]`);
  };

  // ---------- site-keywords 子 tab（resolveTrafficTab） ----------
  // 2026-09-13 第四轮实测确认：total/organic 用 1m，paid 页面自己会把窗口
  // 升到 6m（即使请求 1m），所以直接把 paid 的 REQUESTED 窗口设成 6m。
  assertEqual('resolveTrafficTab: 默认/不认识的值退回 total+1m', resolveTrafficTab(undefined), { trafficTab: 'total', pageTabParam: 'Total', windowSeg: '1m' });
  assertEqual('resolveTrafficTab: 拼写错误的值退回 total+1m，不新增隐藏失败模式', resolveTrafficTab('Organic'), { trafficTab: 'total', pageTabParam: 'Total', windowSeg: '1m' });
  assertEqual('resolveTrafficTab: organic 用 1m，selectedPageTab=Organic', resolveTrafficTab('organic'), { trafficTab: 'organic', pageTabParam: 'Organic', windowSeg: '1m' });
  assertEqual('resolveTrafficTab: paid 的 REQUESTED 窗口直接设成 6m（页面自己会强制升级）', resolveTrafficTab('paid'), { trafficTab: 'paid', pageTabParam: 'Paid', windowSeg: '6m' });

  // ---------- audience-demographics --gender/--age（resolveDemographicsFilter） ----------
  // 2026-09-14 第七轮实测确认可以点击切换：性别单选/年龄多选+应用两套不同交互，
  // 页面默认组合是 女性/18-24岁——跟默认相同的请求不需要点击，"all" 两个选项
  // 没实测过分段表会变成什么形状，一律当没传（回退默认），跟 resolveTrafficTab
  // 对不认识值的处理原则一致。
  assertEqual('resolveDemographicsFilter: 都不传——不需要点任何一个下拉', resolveDemographicsFilter({}), {
    gender: null, age: null, genderClickId: null, ageClickId: null, needsGenderClick: false, needsAgeClick: false,
  });
  assertEqual('resolveDemographicsFilter: 请求的正好是页面默认组合——不需要点击', resolveDemographicsFilter({ genderFlag: 'female', ageFlag: '18-24' }), {
    gender: 'female', age: '18-24', genderClickId: 'female', ageClickId: '18to24', needsGenderClick: false, needsAgeClick: false,
  });
  assertEqual('resolveDemographicsFilter: 请求 male + 25-34——两个都要点', resolveDemographicsFilter({ genderFlag: 'male', ageFlag: '25-34' }), {
    gender: 'male', age: '25-34', genderClickId: 'male', ageClickId: '25to34', needsGenderClick: true, needsAgeClick: true,
  });
  assertEqual('resolveDemographicsFilter: 65+ 映射到 65plus（数字开头的 id 不能直接当 CSS #id，调用方用属性选择器）', resolveDemographicsFilter({ ageFlag: '65+' }).ageClickId, '65plus');
  assertEqual('resolveDemographicsFilter: "all"没实测过分段表形状，当没传处理，不新增隐藏失败模式', resolveDemographicsFilter({ genderFlag: 'all', ageFlag: 'all' }), {
    gender: null, age: null, genderClickId: null, ageClickId: null, needsGenderClick: false, needsAgeClick: false,
  });
  assertEqual('resolveDemographicsFilter: 拼写错误的值一律当没传', resolveDemographicsFilter({ genderFlag: 'Female', ageFlag: '18-25' }), {
    gender: null, age: null, genderClickId: null, ageClickId: null, needsGenderClick: false, needsAgeClick: false,
  });

  // ---------- --activate-chrome / --window（resolveWindowMode） ----------
  // 2026-09-14 第六轮：--activate-chrome 默认改成 false，resolveWindowMode 的
  // 默认输出从 background 改成 active（选中标签页、不节流，但不夺 OS 焦点）；
  // 显式 --window 原样透传（不再是"非 foreground 就一律 background"的二值化）。
  assertEqual('resolveWindowMode: 默认（没传 --window，activateChrome=false 新默认）长表报表用 active，不再强制 foreground', resolveWindowMode({ windowFlag: undefined, activateChrome: false, report: 'audience-geo' }), 'active');
  assertEqual('resolveWindowMode: 非长表报表默认也是 active（原来是 background）', resolveWindowMode({ windowFlag: undefined, activateChrome: false, report: 'performance' }), 'active');
  assertEqual('resolveWindowMode: 显式 --activate-chrome true 时，长表报表仍然自动强制 foreground（更强保证，向后兼容旧行为）', resolveWindowMode({ windowFlag: undefined, activateChrome: true, report: 'audience-geo' }), 'foreground');
  assertEqual('resolveWindowMode: 显式 --activate-chrome true 但非长表报表不受影响，仍是 active', resolveWindowMode({ windowFlag: undefined, activateChrome: true, report: 'performance' }), 'active');
  assertEqual('resolveWindowMode: 显式 --window foreground 原样放行（用户自己要的）', resolveWindowMode({ windowFlag: 'foreground', activateChrome: false, report: 'performance' }), 'foreground');
  assertEqual('resolveWindowMode: 显式 --window active/background/isolated 原样透传，不被二值化压缩', resolveWindowMode({ windowFlag: 'background', activateChrome: true, report: 'audience-geo' }), 'background');
  assertEqual('resolveWindowMode: isolated 同样原样透传', resolveWindowMode({ windowFlag: 'isolated', activateChrome: false, report: 'performance' }), 'isolated');
  assertEqual('resolveWindowMode: 认不出的 --window 值退回 active（新默认），不是旧的 background', resolveWindowMode({ windowFlag: 'typo', activateChrome: false, report: 'performance' }), 'active');

  // ---------- hidden 观测该不该独立降级状态（hiddenCaptureRequiresDowngrade） ----------
  // 2026-09-14：只有 audience-interests 的 SCROLL_AB_CONCLUSIONS 证据是在
  // hidden:true 下测出来的（两组都 hidden、行数一致）；audience-geo/channels/
  // site-keywords 的证据全部在 hidden:false 下测出来，对"hidden 会不会影响内容"
  // 这件事没有发言权，hidden 观测仍要独立降级。
  assertEqual('hiddenCaptureRequiresDowngrade: audience-interests 有 hidden 下行数一致的 A/B 证据，不再独立降级', hiddenCaptureRequiresDowngrade('audience-interests', true), false);
  assertEqual('hiddenCaptureRequiresDowngrade: audience-geo 的 A/B 证据只在可见状态下测过，hidden 仍要降级', hiddenCaptureRequiresDowngrade('audience-geo', true), true);
  assertEqual('hiddenCaptureRequiresDowngrade: channels 同理仍要降级', hiddenCaptureRequiresDowngrade('channels', true), true);
  assertEqual('hiddenCaptureRequiresDowngrade: site-keywords 同理仍要降级', hiddenCaptureRequiresDowngrade('site-keywords', true), true);
  assertEqual('hiddenCaptureRequiresDowngrade: 没有观测到 hidden 就永远不降级，哪个报表都一样', hiddenCaptureRequiresDowngrade('audience-geo', false), false);
  assertEqual('hiddenCaptureRequiresDowngrade: 未在 SCROLL_GATED_REPORTS 里的报表（performance 等）从不会走到这里，但函数本身对陌生 report 名也只看白名单，不误判为安全', hiddenCaptureRequiresDowngrade('performance', true), true);

  // 2026-09-13 第五轮：标签页真的被抓到过 hidden，必须独立于 scrollUnverified/
  // scrollAbConclusion 之外单独报——不能因为"少了抬前台"就悄悄放行。
  const hiddenCaptureDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    scrollUnverified: false, pageWasHiddenDuringCapture: true,
  });
  assertEqual('decideScopeStatus: pageWasHiddenDuringCapture=true → ok-unverified，即使 scrollUnverified 已经是 false', hiddenCaptureDecision.status, 'ok-unverified');
  assert('decideScopeStatus: page_hidden_during_capture 留痕', hiddenCaptureDecision.warnings.some((w) => w.code === 'page_hidden_during_capture'));

  // 2026-09-14：audience-interests 的放宽路径——真实观测到 hidden，但先经过
  // hiddenCaptureRequiresDowngrade 过滤成 false 再喂给 decideScopeStatus，
  // 这条 warning 就不会出现（主流程里两步是分开算的，这里模拟同样的顺序）。
  const relaxedHiddenDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    scrollUnverified: false,
    pageWasHiddenDuringCapture: hiddenCaptureRequiresDowngrade('audience-interests', true),
  });
  assertEqual('decideScopeStatus: audience-interests 观测到 hidden 但已放宽 → 纯 ok，不产出 page_hidden_during_capture', relaxedHiddenDecision.status, 'ok');
  assert('decideScopeStatus: 放宽之后确实没有 page_hidden_during_capture 这条 warning', !relaxedHiddenDecision.warnings.some((w) => w.code === 'page_hidden_during_capture'));

  // ---------- 滚动 A/B 结论表（scrollGateSatisfied + SCROLL_AB_CONCLUSIONS） ----------
  // 2026-09-13 第五轮：先用离线断言确认两条切换分支都有代码路径 + 测试
  // （scrollGateSatisfied 那几条），第五轮后半段用 similarweb-scroll-ab.mjs
  // 对 howolddoyoulook.com 实跑之后，四个报表都已经切到 concluded:true。
  // 这条回归测试改成守住"切换过的条目形状必须完整"——不能有
  // concluded:true 但 verdict/date/notes 是 null 的半成品条目（那样
  // scrollUnverified 会悄悄变 false，却没有任何可追溯的实测依据）。
  for (const [report, entry] of Object.entries(SCROLL_AB_CONCLUSIONS)) {
    if (entry.concluded) {
      assert(`SCROLL_AB_CONCLUSIONS['${report}'] concluded:true 时 verdict 必须是 not-needed/needed 之一`, entry.verdict === 'not-needed' || entry.verdict === 'needed');
      assert(`SCROLL_AB_CONCLUSIONS['${report}'] concluded:true 时必须留下实测日期`, typeof entry.date === 'string' && entry.date.length > 0);
      assert(`SCROLL_AB_CONCLUSIONS['${report}'] concluded:true 时必须留下 notes（样本局限说明，见旁边大段注释的要求）`, typeof entry.notes === 'string' && entry.notes.length > 0);
    } else {
      assertEqual(`SCROLL_AB_CONCLUSIONS['${report}'] concluded:false 时 verdict 必须是 null`, entry.verdict, null);
    }
  }
  assertEqual('scrollGateSatisfied: verdict 为 null（还没做 A/B）时不阻塞，不管 scroll 长什么样', scrollGateSatisfied({ verdict: null, scroll: null }), true);
  assertEqual('scrollGateSatisfied: verdict 为 not-needed 时不阻塞', scrollGateSatisfied({ verdict: 'not-needed', scroll: { atBottom: false, hidden: true } }), true);
  assertEqual('scrollGateSatisfied: verdict 为 needed 但还没读到 scroll 证据时必须阻塞（继续轮询，不能当结论）', scrollGateSatisfied({ verdict: 'needed', scroll: null }), false);
  assertEqual('scrollGateSatisfied: verdict 为 needed 但标签页是 hidden 时必须阻塞', scrollGateSatisfied({ verdict: 'needed', scroll: { atBottom: true, hidden: true } }), false);
  assertEqual('scrollGateSatisfied: verdict 为 needed 但还没到最终底部时必须阻塞', scrollGateSatisfied({ verdict: 'needed', scroll: { atBottom: false, hidden: false } }), false);
  assertEqual('scrollGateSatisfied: verdict 为 needed 且确认到底+可见时放行', scrollGateSatisfied({ verdict: 'needed', scroll: { atBottom: true, hidden: false } }), true);

  const swapCols = (headers, rows, i, j) => {
    const h = [...headers];
    [h[i], h[j]] = [h[j], h[i]];
    const r = rows.map((row) => {
      const copy = [...row];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
    return { headers: h, rows: r };
  };
  // 构造一行 dirHints：除 `idx` 位置外全是 null，`idx` 位置放 `hint`——
  // 模拟提取器在页面里跟 innerText 并列抽出来的方向线索（data-icon/颜色）。
  const dirHintsRow = (len, idx, hint) => {
    const arr = Array(len).fill(null);
    if (idx >= 0) arr[idx] = hint;
    return arr;
  };

  // ---------- audience-geo ----------
  // 真实页面**没有 `#` 列**（行号是隐式的），表头「(121)」前带一个空格——
  // 这是实测形态，不是猜的。
  const geoHeaders = ['国家/地区 (121)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
  const geoSampleRow = ['美国', '20.42%', '7.12%', '15.45%', '#13', '00:03:58', '3.75'];
  const geoRows1 = deriveGeoRows({ headers: geoHeaders, rows: [geoSampleRow] });
  // changePercent 是 null、directionUnknown 是 true——这正是这次修复的核心。
  // 真实 DOM 里「变动」格子的 innerText 只有纯数字（这里的 '7.12%' 就是照抄
  // 那种形态，没有箭头/符号），没有配 dirHints 时无法判断涨跌方向。旧代码在
  // 这种情况下会把 7.12 当正数吐出来（parseSignedPercent 的 isDown 恒为
  // false）——那正是审计发现的、全量数据方向丢失的 bug。这里断言的是修好之后
  // 的正确行为：宁可 null + directionUnknown，也不能默认当正数。
  assertEqual('geo sample row (no direction signal → null + directionUnknown, NOT defaulted positive)', geoRows1.rows[0], {
    rank: 1, // 不来自某一列，是行下标 + 1——真实页面没有名叫「#」的表头
    country: '美国',
    trafficSharePercent: 20.42,
    changePercent: null,
    changePercentDirectionUnknown: true,
    audienceSharePercent: 15.45,
    countryRank: 13,
    visitDuration: '00:03:58',
    visitDurationSeconds: 238,
    pagesPerVisit: 3.75,
  });
  assert('geo sample row direction-unknown surfaces at top level', geoRows1.directionUnknownColumns.some((c) => c.column === '变动' && c.count === 1));
  assertEqual('geo totalRowsOnPage (space before paren)', geoRows1.totalRowsOnPage, 121);
  assertEqual('geo missingColumns (complete headers, no # expected)', geoRows1.missingColumns, []);
  assertEqual('geo suspectColumns (clean sample)', geoRows1.suspectColumns, []);
  assertEqual('geo rowsExpected/rowsCaptured/truncated mirror totalRowsOnPage/rowsRead', {
    rowsExpected: geoRows1.rowsExpected, rowsCaptured: geoRows1.rowsCaptured, truncated: geoRows1.truncated,
  }, { rowsExpected: 121, rowsCaptured: 1, truncated: true });

  // ---------- BLOCKING：DOM 方向信号(2026-09-13 第二轮 Claude in Chrome 实测确认) ----------
  // 真实 DOM 里「变动」列的方向不在 innerText 里。这套（.swReactTable-column 系
  // 表格：audience-geo 地理/受众兴趣 PoP变化/channels 明细表，三处结构相同）
  // 实测机制是 wrapper div 的 class 直接带 positive/negative（不是 SVG/data-icon），
  // 见 lib-similarweb.mjs SW_GEO_TABLE_CELLS 里 dirHintOf 的注释。这里验证
  // hint.direction 路径、hint.fill 颜色兜底路径，以及两者都拿不到时必须是
  // null + directionUnknown，不能猜。
  const changeColIdx = geoHeaders.indexOf('变动');
  const geoRowsUpIcon = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow], dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: 'up' })],
  });
  assertEqual('geo dirHint direction=up (wrapper class positive) resolves to positive', geoRowsUpIcon.rows[0].changePercent, 7.12);
  assertEqual('geo dirHint direction=up is not directionUnknown', geoRowsUpIcon.rows[0].changePercentDirectionUnknown, false);

  const geoRowsDownIcon = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow], dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: 'down' })],
  });
  assertEqual('geo dirHint direction=down (wrapper class negative) resolves to negative', geoRowsDownIcon.rows[0].changePercent, -7.12);

  // 颜色兜底路径的两个十六进制值是 2026-09-13 实测 site-keywords 图标 fill 的
  // 真实取值（#FF442D 下降、#4FBF40 上升）——这套颜色惯例在两套机制间通用。
  const geoRowsRedColor = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow], dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: null, fill: '#FF442D' })],
  });
  assertEqual('geo dirHint red fill (#FF442D, 实测值) resolves to negative (color fallback path)', geoRowsRedColor.rows[0].changePercent, -7.12);

  const geoRowsGreenColor = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow], dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: null, fill: '#4FBF40' })],
  });
  assertEqual('geo dirHint green fill (#4FBF40, 实测值) resolves to positive (color fallback path)', geoRowsGreenColor.rows[0].changePercent, 7.12);

  const geoRowsAmbiguousHint = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow],
    dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: null, fill: 'rgb(120,120,120)' })],
  });
  assert('geo dirHint that resolves to neither a known direction nor a clear hue stays null, not a guessed sign', geoRowsAmbiguousHint.rows[0].changePercent === null);
  assert('geo ambiguous dirHint is flagged directionUnknown', geoRowsAmbiguousHint.rows[0].changePercentDirectionUnknown === true);
  assert('geo ambiguous direction surfaces in directionUnknownColumns', geoRowsAmbiguousHint.directionUnknownColumns.some((c) => c.column === '变动'));

  // 占位格（实测 wrapper class 只有 "changePercentage"，不带 positive/negative）
  // 提取器给出的 hint 是 null（见 dirHintOf：querySelector('.changePercentage')
  // 找不到就是 null，找到但两个 modifier 都没有时 direction 也是 null）——这里
  // 直接测「hint 存在但 direction 是 null」这个真实会出现的形态。
  const geoRowsNoModifierHint = deriveGeoRows({
    headers: geoHeaders, rows: [geoSampleRow],
    dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: null, fill: null })],
  });
  assert('geo dirHint with neither modifier nor fill stays null, not a guessed sign', geoRowsNoModifierHint.rows[0].changePercent === null);
  assert('geo dirHint with neither modifier nor fill is flagged directionUnknown', geoRowsNoModifierHint.rows[0].changePercentDirectionUnknown === true);

  // 文本箭头优先于 DOM hint——两者都在时不能让 hint 覆盖已经明确写在文本里的符号。
  const geoRowsTextWinsOverHint = deriveGeoRows({
    headers: geoHeaders, rows: [['美国', '20.42%', '↓7.12%', '15.45%', '#13', '00:03:58', '3.75']],
    dirHints: [dirHintsRow(geoHeaders.length, changeColIdx, { direction: 'up' })],
  });
  assertEqual('geo explicit text glyph wins over a conflicting DOM hint', geoRowsTextWinsOverHint.rows[0].changePercent, -7.12);

  // 表头跨两行渲染：第一行「国家/地区」，第二行「(121)」——同一个字符串里带真实换行。
  // 这曾经是 totalRowsOnPage 拿不到值的直接原因（提取器把第二行切掉了）。
  const geoHeadersTwoLine = ['国家/地区\n(121)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
  const geoRowsTwoLine = deriveGeoRows({ headers: geoHeadersTwoLine, rows: [geoSampleRow] });
  assertEqual('geo totalRowsOnPage (two-line header)', geoRowsTwoLine.totalRowsOnPage, 121);
  assertEqual('geo two-line header still matches by name', geoRowsTwoLine.missingColumns, []);
  assertEqual('geo two-line header country still parses', geoRowsTwoLine.rows[0].country, '美国');

  // 占位符（国家排名是「-」）必须是 null，不能是 0——这正是本文件事故记录里那一起。
  const geoPlaceholderRow = ['某国', '1%', '-', '1%', '-', '-', '-'];
  const geoRows2 = deriveGeoRows({ headers: geoHeaders, rows: [geoPlaceholderRow] });
  assert('geo placeholder countryRank is null not 0', geoRows2.rows[0].countryRank === null);
  assert('geo placeholder changePercent is null not 0', geoRows2.rows[0].changePercent === null);
  assert('geo placeholder visitDuration is null', geoRows2.rows[0].visitDuration === null);
  assert('geo placeholder visitDurationSeconds is null not 0', geoRows2.rows[0].visitDurationSeconds === null);
  assert('geo placeholder pagesPerVisit is null not 0', geoRows2.rows[0].pagesPerVisit === null);
  // 全是占位符是正常结果（这个站/这一行真的没有这项数据），不该被当成格式错误上报。
  assertEqual('geo all-placeholder columns are not flagged suspect', geoRows2.suspectColumns, []);

  // 打乱两列（表头和每行数据同步打乱）必须得到完全一样的解析结果——按列名取值的证明。
  const iShare = geoHeaders.indexOf('流量份额');
  const iDuration = geoHeaders.indexOf('访问持续时间');
  const shuffledGeo = swapCols(geoHeaders, [geoSampleRow], iShare, iDuration);
  const geoRows3 = deriveGeoRows(shuffledGeo);
  assertEqual('geo shuffled columns match original', geoRows3.rows[0], geoRows1.rows[0]);

  // 改名一列必须显式进 missingColumns，且该字段变 null，而不是被下一列顶替。
  const geoHeadersRenamed = geoHeaders.map((h) => (h === '国家/地区 (121)' ? '国家/地区 (121)-renamed' : h));
  const geoRows4 = deriveGeoRows({ headers: geoHeadersRenamed, rows: [geoSampleRow] });
  assert('geo renamed column surfaces in missingColumns', geoRows4.missingColumns.includes('国家/地区'));
  assert('geo renamed column nulls the field', geoRows4.rows[0].country === null);
  // 其余列没被牵连——排在被改名列后面的字段应该照常解析，证明没有整体错位。
  assertEqual('geo renamed column does not shift others', geoRows4.rows[0].trafficSharePercent, 20.42);

  // suspectColumns：列名对上了（不在 missingColumns 里），但格式跟解析函数的假设不一样，
  // 导致这一列在所有行上都解析成 null——这正是 missingColumns 查不出来的那类问题。
  const geoBadFormatRows = [
    ['美国', 'abc', '7.12%', '15.45%', '#13', '00:03:58', '3.75'],
    ['日本', 'xyz', '7.12%', '15.45%', '#14', '00:03:58', '3.75'],
  ];
  const geoRows5 = deriveGeoRows({ headers: geoHeaders, rows: geoBadFormatRows });
  assert('geo bad-format column not in missingColumns (name matched)', !geoRows5.missingColumns.includes('流量份额'));
  assert('geo bad-format column surfaces in suspectColumns', geoRows5.suspectColumns.includes('流量份额'));

  // ---------- 部分丢失检测（回归：把已修的事故重新注入）----------
  // 2026-08-27 事故复刻：121 个国家里 9 个的份额格式解析不了。
  // 关键点是**旧检测器必须在同一份数据上保持沉默**——如果它也报了，
  // 这个用例就没有证明任何新增能力，只是重复覆盖。
  const injectedHeaders = ['国家/地区 (121)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
  const injectedRows = Array.from({ length: 121 }, (_, i) => [
    `C${i}`, i >= 112 ? 'under 0.01%' : '0.82%', '-', '1%', `#${i + 1}`, '00:01:00', '2',
  ]);
  const injected = deriveGeoRows({ headers: injectedHeaders, rows: injectedRows });
  assertEqual('injected loss: 旧的过半阈值检测器保持沉默（这正是事故当时的状态）', injected.suspectColumns, []);
  assertEqual('injected loss: missingColumns 也是空的（列名找得到）', injected.missingColumns, []);
  assertEqual('injected loss: 行数完全对得上（截断检测同样无感）', injected.rowsRead, injected.totalRowsOnPage);
  assertEqual('injected loss: 新检测器报出丢失行数', injected.partialLossColumns[0]?.lost, 9);
  assert('injected loss: 报告带上原文样本，否则没法排查缺哪种格式',
    injected.partialLossColumns[0]?.samples.includes('under 0.01%'));
  // 第二条独立路径：求和。它和列检测互不依赖，两条同时响才算交叉验证。
  assert('injected loss: 份额之和明显偏离 100%', Math.abs(injected.trafficShareSum.sum - 100) > 2);

  // 反面用例：数据干净时两条路径都必须闭嘴，否则这个检测器会因为噪音被无视。
  const cleanRows = Array.from({ length: 100 }, (_, i) => [
    `C${i}`, '1%', '-', '1%', `#${i + 1}`, '00:01:00', '2',
  ]);
  const clean = deriveGeoRows({ headers: ['国家/地区 (100)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'], rows: cleanRows });
  assertEqual('clean geo: 无部分丢失', clean.partialLossColumns, []);
  assertEqual('clean geo: 份额之和正好 100', clean.trafficShareSum.sum, 100);
  // 整列占位符不算丢失——它们不进分母，这是 NO_VALUE 那条统一定义在守的事。
  const allPlaceholder = deriveGeoRows({
    headers: ['国家/地区 (2)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'],
    rows: [['A', '50%', '-', '不可用', '#1', '00:01:00', '2'], ['B', '50%', '-', 'N/A', '#2', '00:01:00', '2']],
  });
  assertEqual('placeholder 列不算部分丢失', allPlaceholder.partialLossColumns, []);

  // ---------- site-keywords ----------
  // 真实表头：「关键词 (38,977,695)」——空格 + 千分位逗号，这正是原版 fixture 漏掉、
  // 导致 keyword 整表 null 的那两处细节。
  // 列顺序照实测 DOM dump 抄，不要按散文描述重排——尾部「变动」的左邻是「排位」，
  // 曾有一版夹具漏掉「排位」，据此推出的锚点结论是错的，实跑才暴露。
  const kwHeaders = ['#', '关键词 (38,977,695)', '点击量', '变动', 'KD', '意图', '规模', '平均体量', 'CPC', '零点击', '比较', '排位', '变动', '热门网址', '#URL'];
  // 点击量格子是换行分隔的「9.9M\n0.32%」，不是斜杠——这是原版 fixture 猜错的地方。
  // 值的位置跟着上面的表头顺序走：… 比较 | 排位 | 变动 | 热门网址 | #URL
  // 实测该目标站点的「排位」与其「变动」两列整列都是占位符，这里给「变动」一个
  // 真值以便断言锚点确实解析出了排名涨跌；占位符情形另有独立用例覆盖。
  const kwSampleRow = ['1', 'facebook', '9.9M\n0.32%', '↑25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', '+6', 'en.wikipedia.org/wiki/Facebook', '79'];
  const kwRows1 = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwSampleRow] });
  assertEqual('site-keywords sample row (newline-separated clicks)', kwRows1.rows[0], {
    keyword: 'facebook',
    clicks: 9900000,
    clicksSharePercent: 0.32,
    clicksChangePercent: 25,
    clicksChangePercentDirectionUnknown: false,
    kd: 94,
    intent: ['NAV/INFO'],
    size: 295200000,
    avgVolume: 294800000,
    cpc: 1.14,
    zeroClickPercent: 14.54,
    rankChangePercent: 6,
    rankChangePercentDirectionUnknown: false,
    topUrl: 'en.wikipedia.org/wiki/Facebook',
    urlCount: 79,
  });
  assertEqual('site-keywords pageReportedKeywordTotal (space + thousands separator)', kwRows1.pageReportedKeywordTotal, 38977695);
  assertEqual('site-keywords missingColumns (complete headers)', kwRows1.missingColumns, []);
  assertEqual('site-keywords suspectColumns (clean sample)', kwRows1.suspectColumns, []);
  assertEqual('site-keywords directionUnknownColumns empty for glyph-carrying sample', kwRows1.directionUnknownColumns, []);

  // ---------- BLOCKING：DOM 方向信号(site-keywords 行渲染表，2026-09-13 第二轮实测) ----------
  // 真实 DOM 里这两个「变动」格子都没有箭头/符号（跟 geo 表一样），必须靠
  // dirHints 才能定方向；没有 hint 时绝不能默认当正数——这是审计发现的、
  // clicksChangePercent/rankChangePercent 恒为非负的那个 bug 的直接回归测试。
  // 实测这张表用的是它自己的 data-automation 体系（不是 Ant Design 官方图标），
  // 提取器已经把 data-automation-value/data-automation-icon-name/fill 都
  // 解析成统一的 { direction, special } 形状，这里直接测那个统一形状。
  const kwPlainChangeRow = ['1', 'facebook', '9.9M\n0.32%', '25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', '6', 'en.wikipedia.org/wiki/Facebook', '79'];
  const kwChangeIdxs = kwHeaders.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);
  const kwDirHintsDown = dirHintsRow(kwHeaders.length, kwChangeIdxs[0], { direction: 'down' });
  kwDirHintsDown[kwChangeIdxs[1]] = { direction: 'up' };
  const kwRowsWithHints = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwPlainChangeRow], dirHints: [kwDirHintsDown] });
  assertEqual('site-keywords clicksChangePercent resolved via data-icon=fall', kwRowsWithHints.rows[0].clicksChangePercent, -25);
  assertEqual('site-keywords rankChangePercent resolved via data-icon=rise', kwRowsWithHints.rows[0].rankChangePercent, 6);
  assertEqual('site-keywords hint-resolved direction is not flagged unknown', kwRowsWithHints.rows[0].clicksChangePercentDirectionUnknown, false);

  const kwRowsNoHints = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwPlainChangeRow] });
  assert('site-keywords: no glyph + no hint must NOT default to positive (clicksChangePercent)', kwRowsNoHints.rows[0].clicksChangePercent === null);
  assert('site-keywords: no glyph + no hint must NOT default to positive (rankChangePercent)', kwRowsNoHints.rows[0].rankChangePercent === null);
  assert('site-keywords: unresolved clicksChangePercent direction is flagged, not silently dropped', kwRowsNoHints.rows[0].clicksChangePercentDirectionUnknown === true);
  assert('site-keywords: unresolved rankChangePercent direction is flagged, not silently dropped', kwRowsNoHints.rows[0].rankChangePercentDirectionUnknown === true);
  assert('site-keywords unresolved clicksChangePercent direction surfaces at top level', kwRowsNoHints.directionUnknownColumns.some((c) => c.column === '点击量变动'));
  assert('site-keywords unresolved rankChangePercent direction surfaces at top level', kwRowsNoHints.directionUnknownColumns.some((c) => c.column === '排位变动'));

  // "NEW"（2026-09-13 实测：新词，没有上一期数据可比，data-automation-value="New"）
  // 是第三态，不是「方向未知」也不是「解析失败」——不能计入 directionUnknownColumns，
  // 也不能被 partialLossColumns/suspectColumns 当成丢数据。
  const kwNewRow = ['1', 'facebook', '9.9M\n0.32%', 'NEW', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', '6', 'en.wikipedia.org/wiki/Facebook', '79'];
  const kwNewHints = dirHintsRow(kwHeaders.length, kwChangeIdxs[0], { direction: null, special: 'new' });
  kwNewHints[kwChangeIdxs[1]] = { direction: 'up' };
  const kwRowsNew = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwNewRow], dirHints: [kwNewHints] });
  assert('site-keywords "NEW" resolves to null, not a guessed sign', kwRowsNew.rows[0].clicksChangePercent === null);
  assert('site-keywords "NEW" is NOT flagged directionUnknown (it is a distinct state, not an unresolved direction)', kwRowsNew.rows[0].clicksChangePercentDirectionUnknown === false);
  assert('site-keywords "NEW" does not surface in directionUnknownColumns', !kwRowsNew.directionUnknownColumns.some((c) => c.column === '点击量变动'));
  assert('site-keywords "NEW" does not surface in partialLossColumns', !kwRowsNew.partialLossColumns.some((c) => c.column === '点击量变动'));
  assert('site-keywords "NEW" does not surface in suspectColumns', !kwRowsNew.suspectColumns.includes('点击量变动'));

  // 斜杠分隔仍然要接受——万一某个变体页面真是这么渲染的，不能因为换成认换行就反过来丢了斜杠。
  const kwSlashRow = ['1', 'facebook', '9.9M/0.32%', '↑25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', 'en.wikipedia.org/wiki/Facebook', '79', '+6'];
  const kwRowsSlash = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwSlashRow] });
  assertEqual('site-keywords slash-separated clicks still parses', kwRowsSlash.rows[0].clicks, 9900000);
  assertEqual('site-keywords slash-separated share still parses', kwRowsSlash.rows[0].clicksSharePercent, 0.32);

  // 占位符（这里用零点击列举例）必须是 null，不是 0。
  const kwPlaceholderRow = ['1', 'facebook', '9.9M\n0.32%', '↑25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '-', '-', 'en.wikipedia.org/wiki/Facebook', '79', '+6'];
  const kwRows2 = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwPlaceholderRow] });
  assert('site-keywords placeholder zeroClickPercent is null not 0', kwRows2.rows[0].zeroClickPercent === null);
  assertEqual('site-keywords all-placeholder column not flagged suspect', kwRows2.suspectColumns, []);

  // 打乱两个单义列名（KD / CPC），不动那两个重名的「变动」，输出必须完全一致。
  const iKd = kwHeaders.indexOf('KD');
  const iCpc = kwHeaders.indexOf('CPC');
  const shuffledKw = swapCols(kwHeaders, [kwSampleRow], iKd, iCpc);
  const kwRows3 = deriveSiteKeywordRows(shuffledKw);
  assertEqual('site-keywords shuffled columns match original', kwRows3.rows[0], kwRows1.rows[0]);

  // 改名「关键词」列必须显式进 missingColumns，且该字段变 null。
  const kwHeadersRenamed = kwHeaders.map((h) => (h === '关键词 (38,977,695)' ? '关键词 (38,977,695)-renamed' : h));
  const kwRows4 = deriveSiteKeywordRows({ headers: kwHeadersRenamed, rows: [kwSampleRow] });
  assert('site-keywords renamed column surfaces in missingColumns', kwRows4.missingColumns.includes('关键词'));
  assert('site-keywords renamed column nulls the field', kwRows4.rows[0].keyword === null);

  // suspectColumns 覆盖「点击量」这个特判列——2026-08-27 真实事故正是这一列：
  // 列名对上了（不进 missingColumns），格式却跟解析函数的假设不一样（这里用分号
  // 模拟一种解析器不认识的分隔符），于是所有行都解析成 null。
  const kwBadClicksRow = ['1', 'facebook', '9.9M;0.32%', '↑25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', 'en.wikipedia.org/wiki/Facebook', '79', '+6'];
  const kwRowsBadClicks = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwBadClicksRow] });
  assert('site-keywords bad-format clicks not in missingColumns (name matched)', !kwRowsBadClicks.missingColumns.includes('点击量'));
  assert('site-keywords bad-format clicks surfaces in suspectColumns', kwRowsBadClicks.suspectColumns.includes('点击量'));

  // top5SharePercent：五行都带份额时正常累加；只有 4 行带份额时必须是 null，不是部分和。
  // 用换行分隔的格子——这正是协调者要求补的那条：newline 形式也要能喂出非 null 的结果。
  const shareRow = (clicks, share) => ['1', 'kw', `${clicks}\n${share}%`, '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'];
  const fiveRows = [shareRow('1M', 1), shareRow('1M', 2), shareRow('1M', 3), shareRow('1M', 4), shareRow('1M', 5)];
  const kwRows5 = deriveSiteKeywordRows({ headers: kwHeaders, rows: fiveRows });
  assert('top5SharePercent is non-null for five newline-form cells', kwRows5.top5SharePercent !== null);
  assertEqual('top5SharePercent sums five newline-form rows', kwRows5.top5SharePercent, 15);
  const fourRows = fiveRows.slice(0, 4);
  const kwRows6 = deriveSiteKeywordRows({ headers: kwHeaders, rows: fourRows });
  assert('top5SharePercent is null with fewer than five rows carrying a share', kwRows6.top5SharePercent === null);

  // ---------- 浮点伪影：132.8M 必须落地为精确整数，不是 132800000.00000001 ----------
  assertEqual('parseNumber rounds compact-suffix counts', parseNumber('132.8M'), 132800000);
  assert('parseNumber rounded result has no floating-point remainder', Number.isInteger(parseNumber('132.8M')));
  // 没有后缀的普通小数不该被圆整——CPC、份额百分比这类字段允许有小数部分。
  assertEqual('parseNumber leaves plain decimals alone', parseNumber('1.14'), 1.14);
  const kwSizeRow = ['1', 'facebook', '9.9M\n0.32%', '↑25%', '94', 'NAV/INFO', '132.8M', '294.8M', '$1.14', '14.54%', '-', 'en.wikipedia.org/wiki/Facebook', '79', '+6'];
  const kwRowsSize = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwSizeRow] });
  assertEqual('site-keywords size (132.8M) is an exact integer', kwRowsSize.rows[0].size, 132800000);
  assert('site-keywords size has no floating-point remainder', Number.isInteger(kwRowsSize.rows[0].size));

  // ---------- site-keywords 分页：pageReportedKeywordTotal 不是行数，不能拿它当截断信号 ----------
  // 没有分页控件（提取器没找到 `.ant-pagination-next`）时 pagination 是 null，
  // 代表「不知道有没有更多页」，不能当成「确认只有一页」。
  const kwRowsNoPagination = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwSampleRow], pagination: null });
  assert('morePagesAvailable is null (unknown) without a pagination control', kwRowsNoPagination.morePagesAvailable === null);
  // 分页控件明确说「有下一页」——必须报告，且要能从 title 读出页码。
  // 夹具用实测到的真实形态 `1/389777`（Antd simple 分页器的 title 属性），
  // 不用手打的「共 250 条」——那是 `.ant-pagination-total-text` 的形态，
  // 而实测证明该 class 在这张页面上永远不存在。
  const kwRowsHasNext = deriveSiteKeywordRows({
    headers: kwHeaders, rows: [kwSampleRow], pagination: { hasNext: true, pagerTitle: '1/389777' },
  });
  assert('morePagesAvailable is true when the pagination control has a live next button', kwRowsHasNext.morePagesAvailable === true);
  assertEqual('currentPage comes from the simple pager title', kwRowsHasNext.currentPage, 1);
  assertEqual('totalPages comes from the simple pager title', kwRowsHasNext.totalPages, 389777);
  // 交叉印证：全站收录数 / 每页 100 行 ≈ 总页数。两个数来自页面上完全不同的位置，
  // 对得上就是互相佐证；对不上说明其中一个解析器漂移了。
  assert('the keyword total and the pager total corroborate each other',
    Math.abs(kwRowsHasNext.pageReportedKeywordTotal / 100 - kwRowsHasNext.totalPages) < 1);
  // title 格式不认识时不许瞎猜一个页码出来。
  const kwRowsOddPager = deriveSiteKeywordRows({
    headers: kwHeaders, rows: [kwSampleRow], pagination: { hasNext: true, pagerTitle: '共 250 条' },
  });
  assert('an unrecognised pager title yields null pages rather than a guess',
    kwRowsOddPager.currentPage === null && kwRowsOddPager.totalPages === null);
  // 分页控件明确说「没有下一页」——这才是真正「确认单页」，不该被当成截断报出来。
  const kwRowsNoNext = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwSampleRow], pagination: { hasNext: false, pagerTitle: null } });
  assert('morePagesAvailable is false when the pagination control confirms there is no next page', kwRowsNoNext.morePagesAvailable === false);
  // pageReportedKeywordTotal 依然是全站收录数，不受分页信号影响——两个字段互不干扰。
  assertEqual('pageReportedKeywordTotal is unaffected by pagination info', kwRowsHasNext.pageReportedKeywordTotal, 38977695);

  // ---------- BLOCKING 1：两个「变动」列按左邻列消歧，不按位置 ----------
  // 独立检查报告实测戳穿过按位置分配的版本：去掉尾部那个「变动」（#URL 涨跌）后，
  // 剩下唯一一个「变动」左边是「点击量」，必须正确认成 clicksChangePercent，
  // 且 rankChangePercent 必须是 null 并且 missingColumns 里要有「#URL变动」——
  // 不能因为只剩一列就把它安在错的字段上还不报错。
  // 按索引精确移除尾部那个「变动」——不能用 slice(0,-1)，实测表头里「变动」后面
  // 还跟着「热门网址」和「#URL」，砍最后一个会砍错列。
  const changeIdxAll = kwHeaders.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);
  const trailingChangeIdx = changeIdxAll[changeIdxAll.length - 1];
  const kwHeadersNoTrailingChange = kwHeaders.filter((_, i) => i !== trailingChangeIdx);
  const kwRowNoTrailingChange = kwSampleRow.filter((_, i) => i !== trailingChangeIdx);
  const kwRowsNoTrailingChange = deriveSiteKeywordRows({ headers: kwHeadersNoTrailingChange, rows: [kwRowNoTrailingChange] });
  assertEqual('only the 点击量-变动 column present: clicksChangePercent still correct', kwRowsNoTrailingChange.rows[0].clicksChangePercent, 25);
  assert('only the 点击量-变动 column present: rankChangePercent is null, not stolen', kwRowsNoTrailingChange.rows[0].rankChangePercent === null);
  assert('only the 点击量-变动 column present: missing 排位变动 is reported', kwRowsNoTrailingChange.missingColumns.includes('排位变动'));
  assert('only the 点击量-变动 column present: 点击量变动 is not falsely reported missing', !kwRowsNoTrailingChange.missingColumns.includes('点击量变动'));

  // 反过来：去掉第一个「变动」（点击量涨跌），剩下唯一一个「变动」左边是
  // 「#URL」。这正是原来那个 bug 的实测复现——旧代码会把这唯一的一列错认成
  // clicksChangePercent（吐出 6，其实是 URL 数的涨跌），现在必须认成
  // rankChangePercent，clicksChangePercent 必须是 null。
  const changeIndicesInHeaders = kwHeaders.reduce((acc, h, i) => (h === '变动' ? [...acc, i] : acc), []);
  const leadingChangeIdx = changeIndicesInHeaders[0];
  const kwHeadersNoLeadingChange = kwHeaders.filter((_, i) => i !== leadingChangeIdx);
  const kwRowNoLeadingChange = kwSampleRow.filter((_, i) => i !== leadingChangeIdx);
  const kwRowsNoLeadingChange = deriveSiteKeywordRows({ headers: kwHeadersNoLeadingChange, rows: [kwRowNoLeadingChange] });
  assert('only the 排位-变动 column present: clicksChangePercent is null, NOT wrongly 6', kwRowsNoLeadingChange.rows[0].clicksChangePercent === null);
  assertEqual('only the 排位-变动 column present: rankChangePercent is correctly 6', kwRowsNoLeadingChange.rows[0].rankChangePercent, 6);
  assert('only the 排位-变动 column present: missing 点击量变动 is reported', kwRowsNoLeadingChange.missingColumns.includes('点击量变动'));
  assert('only the 排位-变动 column present: 排位变动 is not falsely reported missing', !kwRowsNoLeadingChange.missingColumns.includes('排位变动'));

  // 消歧是按左邻列，不是按位置——把「点击量,变动」这一对整体挪到表尾，
  // 「变动」仍然要因为左边是「点击量」而认成 clicksChangePercent。
  const kwHeadersReordered = ['#', 'KD', '意图', '规模', '平均体量', 'CPC', '零点击', '比较', '排位', '变动', '热门网址', '#URL', '关键词 (38,977,695)', '点击量', '变动'];
  const kwRowReordered = ['1', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', '+6', 'en.wikipedia.org/wiki/Facebook', '79', 'facebook', '9.9M\n0.32%', '↑25%'];
  const kwRowsReordered = deriveSiteKeywordRows({ headers: kwHeadersReordered, rows: [kwRowReordered] });
  assertEqual('reordered columns: clicksChangePercent still found by left-neighbour, not position', kwRowsReordered.rows[0].clicksChangePercent, 25);
  assertEqual('reordered columns: rankChangePercent still found by left-neighbour, not position', kwRowsReordered.rows[0].rankChangePercent, 6);
  assertEqual('reordered columns: missingColumns empty', kwRowsReordered.missingColumns, []);

  // 消歧失败：一个「变动」列左边既不是「点击量」也不是「#URL」——不能瞎猜安给
  // 任意一个字段，必须报进 suspectColumns，且两个变动字段都不该被这一列污染。
  const kwHeadersAmbiguousChange = ['#', '关键词 (38,977,695)', '点击量', 'KD', '变动', '意图', '规模', '平均体量', 'CPC', '零点击', '比较', '热门网址', '#URL', '排位'];
  const kwRowAmbiguousChange = ['1', 'facebook', '9.9M\n0.32%', '94', '↑25%', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', 'en.wikipedia.org/wiki/Facebook', '79'];
  const kwRowsAmbiguousChange = deriveSiteKeywordRows({ headers: kwHeadersAmbiguousChange, rows: [kwRowAmbiguousChange] });
  assert('unresolvable 变动 column is not assigned to clicksChangePercent', kwRowsAmbiguousChange.rows[0].clicksChangePercent === null);
  assert('unresolvable 变动 column is not assigned to rankChangePercent', kwRowsAmbiguousChange.rows[0].rankChangePercent === null);
  assert('unresolvable 变动 column surfaces in suspectColumns', kwRowsAmbiguousChange.suspectColumns.includes('变动(左邻列无法识别)'));

  // ---------- 非阻塞修复：占位符定义统一、parseNumber 的 NaN 归零、suspectColumns 比例阈值 ----------
  // 「不可用」现在和「-」「—」「--」是同一个占位符集合：country/topUrl 不该把
  // 字符串「不可用」当真实值输出，而且这种列不该被 findSuspectColumns 误判。
  // 值位置跟 kwHeaders 走：… 比较 | 排位 | 变动 | 热门网址 | #URL
  const kwRowUnavailable = ['1', '不可用', '9.9M\n0.32%', '↑25%', '94', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', '-', '+6', '不可用', '79'];
  const kwRowsUnavailable = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwRowUnavailable] });
  assert('"不可用" keyword becomes null, not the literal string', kwRowsUnavailable.rows[0].keyword === null);
  assert('"不可用" topUrl becomes null, not the literal string', kwRowsUnavailable.rows[0].topUrl === null);
  assertEqual('an all-"不可用" column is not falsely flagged suspect', kwRowsUnavailable.suspectColumns, []);

  // 「< 0.01%」是「有值但低于下限」，不是「没有值」。实测 121 个国家里有 9 个是
  // 这个形态；旧版把它们全判成 null，而 9/121=7.4% 低于 suspectColumns 的 50% 阈值，
  // 连告警都没有——静默丢真实数据且无信号。取下限值本身。
  assertEqual('below-bound "< 0.01%" keeps the bound, not null', parseNumber('< 0.01%'), 0.01);
  assertEqual('below-bound without space and percent', parseNumber('<0.01'), 0.01);
  assertEqual('below-bound with full-width less-than', parseNumber('＜ 0.01%'), 0.01);
  const geoBelowBound = deriveGeoRows({
    headers: geoHeaders,
    rows: [['美国', '< 0.01%', '7.12%', '< 0.01%', '#13', '00:03:58', '3.75']],
  });
  assertEqual('geo below-bound trafficShare survives as a number', geoBelowBound.rows[0].trafficSharePercent, 0.01);
  assertEqual('geo below-bound audienceShare survives as a number', geoBelowBound.rows[0].audienceSharePercent, 0.01);

  // parseNumber 对 "1.2.3" 这种畸形数字必须归零成 null，不能变成 NaN 悄悄溜进 JSON。
  assert('parseNumber normalises a malformed number to null, not NaN', parseNumber('1.2.3') === null);
  const kwRowMalformedKd = ['1', 'facebook', '9.9M\n0.32%', '↑25%', '1.2.3', 'NAV/INFO', '295.2M', '294.8M', '$1.14', '14.54%', '-', 'en.wikipedia.org/wiki/Facebook', '79', '+6'];
  const kwRowsMalformedKd = deriveSiteKeywordRows({ headers: kwHeaders, rows: [kwRowMalformedKd] });
  assert('a malformed KD cell parses to null, not NaN', kwRowsMalformedKd.rows[0].kd === null);
  assert('null (not NaN) JSON-serialises as null so it still reads as null downstream', JSON.stringify(kwRowsMalformedKd.rows[0].kd) === 'null');

  // suspectColumns 现在按比例判断（超过一半 null），不要求「全部」——能抓住只有
  // 部分行解析失败的情况（比如换了种负号写法，只有负数那部分坏掉）。
  const kwRatioRows = [
    ['1', 'kw1', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw2', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw3', '1M\n1%', '+1%', 'bad-format', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw4', '1M\n1%', '+1%', 'bad-format', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw5', '1M\n1%', '+1%', 'bad-format', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
  ];
  const kwRowsRatio = deriveSiteKeywordRows({ headers: kwHeaders, rows: kwRatioRows });
  assert('a column with >50% (but not 100%) real-value failures is flagged suspect', kwRowsRatio.suspectColumns.includes('KD'));
  // 这组只有 1/5 行的 KD 失败（20%），不该被标为可疑——阈值是「超过一半」。
  const badOnlyOne = [
    ['1', 'kw1', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw2', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw3', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw4', '1M\n1%', '+1%', '10', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
    ['1', 'kw5', '1M\n1%', '+1%', 'bad-format', 'NAV', '1', '1', '$1', '1%', '-', 'x.com', '1', '+1'],
  ];
  const kwRowsBadOnlyOne = deriveSiteKeywordRows({ headers: kwHeaders, rows: badOnlyOne });
  assert('a column with only 20% real-value failures is NOT flagged suspect', !kwRowsBadOnlyOne.suspectColumns.includes('KD'));

  // 排位变动 这一列独立检查报告确认过是「这个目标站点真的 100% 没有排名变化」，
  // 不是解析失败——全是占位符（分母是 0）不该被 ratio 阈值当成可疑。
  assertEqual('a genuinely all-placeholder rankChangePercent column is not flagged suspect', kwRows1.suspectColumns, []);

  // ---------- BLOCKING 2：audience-geo 的截断信号 ----------
  // totalRowsOnPage 和 rowsRead 不一致时，deriveGeoRows 必须把两个数字都吐出来，
  // 让调用方（similarweb-query.mjs 的主流程）能对比着打 [truncated]。
  const geoHeadersForTruncation = ['国家/地区 (5)', '流量份额', '变动', '受众群体份额', '国家/地区排名', '访问持续时间', '页面数/访问'];
  const geoRowsTruncated = deriveGeoRows({ headers: geoHeadersForTruncation, rows: [geoSampleRow, geoSampleRow] });
  assertEqual('geo totalRowsOnPage reports what the page header says', geoRowsTruncated.totalRowsOnPage, 5);
  assertEqual('geo rowsRead reports what was actually parsed', geoRowsTruncated.rowsRead, 2);
  assert('geo totalRowsOnPage/rowsRead mismatch is visible to the caller', geoRowsTruncated.totalRowsOnPage > geoRowsTruncated.rowsRead);

  // columnDepthMismatch：提取器发现列长度不一致时要传出来，deriveGeoRows 要透传
  // 成一个布尔值；没给这个字段（比如旧版 cells）时是 null，不是「确认一致」。
  const geoRowsMismatch = deriveGeoRows({ headers: geoHeaders, rows: [geoSampleRow], columnDepthMismatch: true });
  assertEqual('columnDepthMismatch true is passed through', geoRowsMismatch.columnDepthMismatch, true);
  const geoRowsNoMismatch = deriveGeoRows({ headers: geoHeaders, rows: [geoSampleRow], columnDepthMismatch: false });
  assertEqual('columnDepthMismatch false is passed through', geoRowsNoMismatch.columnDepthMismatch, false);
  const geoRowsUnknownMismatch = deriveGeoRows({ headers: geoHeaders, rows: [geoSampleRow] });
  assertEqual('columnDepthMismatch is null (unknown), not false, when the extractor did not report it', geoRowsUnknownMismatch.columnDepthMismatch, null);

  // ---- 空态判据：它是「页面产出的一句话」，不是「读到 0 行」 ----
  // 见 <law-ref id="readiness-must-bind-to-this-query"/>。这几条断言在锁两件事：
  // (1) 触发空态的是明确的文案，加载/骨架屏文本一律不触发；
  // (2) 空态只有绑定到本次查询的 URL 才作数——上一个域名残留的提示进不来。
  assert('no-data 认的是页面正面写出来的那句话', NO_DATA.test('抱歉，未找到与该搜索匹配的内容'));
  assert('英文空态同样认', NO_DATA.test('Not enough data to display'));
  assert('「我们没有此网站的数据」同样认', NO_DATA.test('我们没有此网站的数据'));
  // 骨架屏 / 加载中 / 空表：什么都没有，不是「说了没有」。这里必须**不**匹配，
  // 否则「还没渲染」就会被当成「查无此站」——正是法则打掉的那个形状。
  assert('加载中的骨架屏不算空态', !NO_DATA.test('总访问量\n加载中…\n\n\n'));
  assert('一张空表不算空态', !NO_DATA.test('国家/地区\n流量份额\n变动'));
  assert('空 body 不算空态', !NO_DATA.test(''));
  assert('空态绑定本次查询的 key', boundToThisQuery('https://x/#/a/b?key=example.com', 'example.com'));
  assert('上一个域名残留的空态不算数', !boundToThisQuery('https://x/#/a/b?key=other.com', 'example.com'));
  assert('没有 key 段一律不作数', !boundToThisQuery('https://x/#/a/b', 'example.com'));

  // ---------- BLOCKING 2：scopeEvidence（时间窗口污染） ----------
  // 审计核心发现之二：同一标签页在纯前端路由跳转时，可能把上一次查询遗留的
  // 时间窗口带进下一次查询，即使新 URL 明确写着别的窗口。boundToThisQuery
  // 只校验域名，完全不检查窗口——这里验证新加的 deriveScopeEvidence 能把
  // 「请求的窗口 vs 页面实际显示的窗口」这件事说清楚。
  const perfLines = ['总访问量', '20,300', '最后 28 天数 (As of Sep 09)', '所有流量', '全球'];
  const perfScope = deriveScopeEvidence(perfLines, { requestedWindowSeg: '28d', countryApplicable: true });
  assertEqual('scopeEvidence: matching window is recognised, not flagged unverified', {
    windowLabel: perfScope.windowLabel, windowMatchesRequest: perfScope.windowMatchesRequest, windowUnverified: perfScope.windowUnverified,
  }, { windowLabel: '最后 28 天数 (As of Sep 09)', windowMatchesRequest: true, windowUnverified: false });
  assert('scopeEvidence: device label observed', perfScope.deviceLabelObserved === true && perfScope.deviceUnverified === false);
  assert('scopeEvidence: country label observed', perfScope.countryLabelObserved === true && perfScope.countryUnverified === false);

  // 请求 1m，页面却显示 6 个月区间——这正是审计实测到的窗口污染的形状（site-keywords
  // 在复用的标签页上被上一次访问的 6m 状态带偏）。matches 必须是 false，不能被
  // 悄悄放过；这不是「查询失败」，是「证据要如实反映」，调用方拿这个信号自己判断。
  const pollutedLines = ['点击量', '75', 'Mar 2026 - Aug 2026 (6 月)', '所有流量', '全球'];
  const pollutedScope = deriveScopeEvidence(pollutedLines, { requestedWindowSeg: '1m', countryApplicable: true });
  assertEqual('scopeEvidence: window pollution (1m requested, 6m landed) is caught as a mismatch, not silently accepted', {
    windowMatchesRequest: pollutedScope.windowMatchesRequest, windowUnverified: pollutedScope.windowUnverified,
  }, { windowMatchesRequest: false, windowUnverified: false });

  // 页面上完全没有可识别的窗口文案——必须是 windowUnverified:true，不能默认
  // 当"一致"或"不一致"，两者都是没证据支撑的猜测。
  const noWindowLines = ['受众群体份额', '20.42%', '所有流量'];
  const noWindowScope = deriveScopeEvidence(noWindowLines, { requestedWindowSeg: '6m', countryApplicable: true });
  assert('scopeEvidence: no recognisable window text on the page → windowUnverified, not a guessed match/mismatch',
    noWindowScope.windowLabel === null && noWindowScope.windowMatchesRequest === null && noWindowScope.windowUnverified === true);

  // audience-geo 这个 tab 没有国家筛选器——countryApplicable:false 时不能报
  // countryUnverified:true，那是"这个问题对这张报表没有意义"，不是"查不到证据"。
  const geoScopeNoCountry = deriveScopeEvidence(noWindowLines, { requestedWindowSeg: '6m', countryApplicable: false });
  assertEqual('scopeEvidence: countryApplicable=false is not conflated with countryUnverified', {
    countryApplicable: geoScopeNoCountry.countryApplicable,
    countryLabelObserved: geoScopeNoCountry.countryLabelObserved,
    countryUnverified: geoScopeNoCountry.countryUnverified,
  }, { countryApplicable: false, countryLabelObserved: null, countryUnverified: false });

  // 请求窗口段本身认不出来（比如没传）时 windowRequested 原样回显 null，
  // matches 也是 null——不能拿一个不存在的"请求"去跟页面比对出真假结论。
  const noRequestScope = deriveScopeEvidence(perfLines, { requestedWindowSeg: null, countryApplicable: true });
  assert('scopeEvidence: no requested window segment → matches is null, not guessed', noRequestScope.windowMatchesRequest === null && noRequestScope.windowUnverified === true);

  // ---------- BLOCKING 3：decideScopeStatus 三档判定（2026-09-13 二次复核） ----------
  // 复核意见：「不拦截，只报告」本身仍然是「以为抓到了、其实没抓到」的一种。
  // 这里直接测主流程调用的那个函数，不是重新拼一遍它的逻辑。
  const cleanDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '28d', windowActual: '最后 28 天数 (As of Sep 09)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
  });
  assertEqual('decideScopeStatus: 全部确认 → ok，零 warnings，退出码 0', cleanDecision, { blocked: false, status: 'ok', warnings: [], exitCode: 0 });

  // 核心用例：确认不一致、没有传 accept-window-fallback → 必须立即 blocked，
  // 不是"报告一下但仍然成功"。
  const mismatchBlocked = decideScopeStatus({
    windowMatchesRequest: false, windowRequested: '1m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
  });
  assertEqual('decideScopeStatus: 确认窗口不一致且未接受放宽 → blocked，status=scope-mismatch，退出码 1',
    mismatchBlocked, { blocked: true, status: 'scope-mismatch', warnings: [], exitCode: 1 });

  // 接受放宽：不再 blocked，但必须在 warnings 里留痕，不能悄悄变成跟"完全匹配"
  // 一样的 status。
  const mismatchAccepted = decideScopeStatus({
    windowMatchesRequest: false, windowRequested: '1m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: true, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
  });
  assert('decideScopeStatus: 接受放宽后不再 blocked', mismatchAccepted.blocked === false);
  assertEqual('decideScopeStatus: 接受放宽 → status 是 ok-unverified，不是纯 ok（口径毕竟被换过）', mismatchAccepted.status, 'ok-unverified');
  assert('decideScopeStatus: 接受放宽必须留痕在 warnings 里', mismatchAccepted.warnings.some((w) => w.code === 'window_fallback_accepted'));
  assertEqual('decideScopeStatus: 接受放宽后退出码仍非 0（提醒调用方这不是无条件成功）', mismatchAccepted.exitCode, 1);

  // 窗口读不到（unverified，不是 confirmed mismatch）→ 不 blocked，但要标 ok-unverified。
  const windowUnverifiedDecision = decideScopeStatus({
    windowMatchesRequest: null, windowRequested: '28d', windowActual: null,
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
  });
  assert('decideScopeStatus: 窗口 unverified 不是 blocked（没有证据说它不一致，只是没证据）', windowUnverifiedDecision.blocked === false);
  assertEqual('decideScopeStatus: 窗口 unverified → ok-unverified', windowUnverifiedDecision.status, 'ok-unverified');
  assert('decideScopeStatus: 窗口 unverified 原因要留痕', windowUnverifiedDecision.warnings.some((w) => w.code === 'window_unverified'));

  // audience-geo 表头总数读不到 → 不阻塞（不能把解析失败变成必然超时），
  // 但绝不能是无条件成功——必须是 ok-unverified，且要看到 rows_completeness_unverified。
  const rowsUnverifiedDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: true, loadingIndicatorUnverified: true,
  });
  assertEqual('decideScopeStatus: 行数完整性未确认 → ok-unverified，不是无条件成功', rowsUnverifiedDecision.status, 'ok-unverified');
  assert('decideScopeStatus: rows_completeness_unverified 必须留痕', rowsUnverifiedDecision.warnings.some((w) => w.code === 'rows_completeness_unverified'));
  assert('decideScopeStatus: loading_indicator_unverified 必须留痕', rowsUnverifiedDecision.warnings.some((w) => w.code === 'loading_indicator_unverified'));
  assertEqual('decideScopeStatus: 未完全确认时退出码非 0', rowsUnverifiedDecision.exitCode, 1);

  // 国家/设备读不到同样要留痕，且不能因为"只是弱信号"就不算数。
  const weakSignalsDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '28d', windowActual: '最后 28 天数 (As of Sep 09)',
    acceptWindowFallback: false, countryUnverified: true, deviceUnverified: true,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
  });
  assertEqual('decideScopeStatus: 国家/设备 unverified 也进 warnings、也不是纯 ok', weakSignalsDecision.status, 'ok-unverified');
  assert('decideScopeStatus: country_unverified 留痕', weakSignalsDecision.warnings.some((w) => w.code === 'country_unverified'));
  assert('decideScopeStatus: device_unverified 留痕', weakSignalsDecision.warnings.some((w) => w.code === 'device_unverified'));

  // ---------- BLOCKING 4：2026-09-13 第三轮新增的四个 unverified 判据 ----------
  // audience-interests/overlap/demographics 的完整性信号，以及滚动到底证据——
  // 四个都要能在 warnings 里留痕，且都不能让状态是纯 "ok"。
  const interestsRowsDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    audienceInterestsRowsCompletenessUnverified: true,
  });
  assertEqual('decideScopeStatus: audience-interests 行数完整性未确认 → ok-unverified', interestsRowsDecision.status, 'ok-unverified');
  assert('decideScopeStatus: audience_interests_rows_completeness_unverified 留痕', interestsRowsDecision.warnings.some((w) => w.code === 'audience_interests_rows_completeness_unverified'));

  const overlapDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    audienceOverlapUnverified: true,
  });
  assertEqual('decideScopeStatus: audience-overlap 既非确认有数据也非确认空 → ok-unverified', overlapDecision.status, 'ok-unverified');
  assert('decideScopeStatus: audience_overlap_unverified 留痕', overlapDecision.warnings.some((w) => w.code === 'audience_overlap_unverified'));

  const demographicsDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    audienceDemographicsUnverified: true,
  });
  assertEqual('decideScopeStatus: audience-demographics 既非确认有数据也非确认空 → ok-unverified', demographicsDecision.status, 'ok-unverified');
  assert('decideScopeStatus: audience_demographics_unverified 留痕', demographicsDecision.warnings.some((w) => w.code === 'audience_demographics_unverified'));

  // 核心用例：滚动到底选择器未经实测确认时，即便其它一切都确认了，也不能是
  // 纯 "ok"——这是本轮"未到底证据→不得 ok"要求的直接落地。
  const scrollDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '28d', windowActual: '最后 28 天数 (As of Sep 09)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    scrollUnverified: true,
  });
  assertEqual('decideScopeStatus: 滚动到底选择器未实测确认 → ok-unverified，不能是纯 ok', scrollDecision.status, 'ok-unverified');
  assert('decideScopeStatus: scroll_to_bottom_unverified 留痕', scrollDecision.warnings.some((w) => w.code === 'scroll_to_bottom_unverified'));

  // 2026-09-13 第五轮：离线补抓的 notCovered 区块里，任何一个子区块落进
  // unresolved（锚点找到了但形状不认识）都必须让整份报表保持 ok-unverified，
  // 不能因为"大部分区块都抓到了"就悄悄放行。
  const overviewSupplementalDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '28d', windowActual: '最后 28 天数 (As of Sep 09)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    overviewSupplementalUnresolved: true,
  });
  assertEqual('decideScopeStatus: overviewSupplemental 里有区块 unresolved → ok-unverified', overviewSupplementalDecision.status, 'ok-unverified');
  assert('decideScopeStatus: overview_supplemental_unresolved 留痕', overviewSupplementalDecision.warnings.some((w) => w.code === 'overview_supplemental_unresolved'));

  const interestsSupplementalDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    audienceInterestsSupplementalUnresolved: true,
  });
  assertEqual('decideScopeStatus: 受众兴趣行业分布/话题词云 unresolved → ok-unverified', interestsSupplementalDecision.status, 'ok-unverified');
  assert('decideScopeStatus: audience_interests_supplemental_unresolved 留痕', interestsSupplementalDecision.warnings.some((w) => w.code === 'audience_interests_supplemental_unresolved'));

  const overlapDetailDecision = decideScopeStatus({
    windowMatchesRequest: true, windowRequested: '6m', windowActual: 'Mar 2026 - Aug 2026 (6 月)',
    acceptWindowFallback: false, countryUnverified: false, deviceUnverified: false,
    rowsCompletenessUnverified: false, loadingIndicatorUnverified: false,
    audienceOverlapDetailUnresolved: true,
  });
  assertEqual('decideScopeStatus: 独占/重合明细表 unresolved → ok-unverified', overlapDetailDecision.status, 'ok-unverified');
  assert('decideScopeStatus: audience_overlap_detail_unresolved 留痕', overlapDetailDecision.warnings.some((w) => w.code === 'audience_overlap_detail_unresolved'));

  console.log('similarweb-query self-test: PASS');
}
