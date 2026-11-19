/**
 * lib-report-readiness.mjs — 报表路由的「就绪 / 目标 / 无表格」判据，从 SKILL.md 的
 * <law-ref id="readiness-must-bind-to-this-query"/> 的 <correct> 块里搬出来，变成可执行、
 * 可测、可传参的一份代码。以前它只是一段贴在文档里的片段，实盘 agent 手抄进页面执行，
 * 于是它自己的毛病没有任何一处会变红。
 *
 * ⚠️ **这条 law 是为了防「判据被页面上无关的东西满足」而写的，而它自己的两个承重条件
 * 正犯着同一个病。** 2026-08-29 复盘出四处未说出口的假设，处置如下：
 *
 * 1. `exportBtns >= 1` —— 作用域没绑。旧写法在 `main` 底下全量扫 `button, a` 的文本。
 *    自家记录里就有反例：`daily-trends` 主体区**每个渠道名各带一个「导出」**，所以一个
 *    「导出」按钮既可能来自全局工具栏，也可能来自别的章节，跟「本报表章节渲染完了」
 *    没有必然关系。**同日晚些时候已退役**：空白页上量到 12，全在导航壳里。
 * 2. `chartHydrated >= 3` —— 同上。`svg text` 里含数字的节点没有绑到本路由的图表；
 *    实例 1 那张 `axa.fr / 42 / 758 / 15%` 的邻居挂件如果是 svg 画的，它自己就能凑够 3 个。
 *    **同日晚些时候已退役**：三条路由全读到 0，包括记录里 `chart=122` 的那条。
 * 3. `spinnerGone` —— 猜类名的**否定式**信号，已经**拆开**：`[aria-busy="true"]` 是
 *    ARIA 标准属性、是页面自己声明「我还在忙」，保留为**否决项**；
 *    `[class*="skeleton"|"spinner"]` 是猜厂商类名，**降级为只记录、永不参与判定**。
 *    理由见 `readBusyState()` 上方的长注释。
 * 4. `onTarget` 的否定半边写死了中文字面量 `创建新列表`。同一个共享账号如果 UI 是英文，
 *    落地页的 `Create a new list` 匹配不上，空态落地页上 `ok` 就是 `true` —— 实例 4 原封
 *    不动复现。现在标记按 locale 声明，并且**匹配不到标记不等于不在空态**：
 *    locale 不在覆盖表里时判 `unknown`，`ok` 为 false，而不是默认通过。
 *
 * ⚠️⚠️ **2026-08-29 再一次更正，这一次是根因：整族探针对 shadow DOM 结构性失明。**
 * 同一页同一刻，`document.body.innerText.length` = **59**，穿透 shadow DOM 的深层文本
 * = **1,605,054**，页面里有 **44 个 shadow root**。`innerText` 和 `querySelectorAll`
 * 都不穿透，所以**在这之前本文件量到的每一个数都只是页面的一小块**。三处后果：
 *   - 上面 1 / 2 两条的「退役」有了实测依据（见 RETIRED_STRUCTURAL_SIGNALS）；
 *   - 所有计数改走 <ref file="scripts/lib-deep-dom.mjs"/> 的穿透遍历，**浅层读数保留
 *     并一同输出**（`lightDom` / `deep`），差值就是「藏了多少在 shadow DOM 里」；
 *   - 新增**分类前的硬闸门** `classifyAdmissibility()`：路由 / 页头 / 内容区三条，
 *     任一不满足 ⇒ `inconclusive`，**绝不输出 `no-table` 或 `empty`**。
 *
 * 分工和 lib-submit-outcome.mjs 一样：`readReportProbe(document, options)` 会被
 * `.toString()` 进 eval 里在页面执行；下面每一个分类函数都是纯函数，可以离线喂假页面测。
 */
import { deepQueryAll, deepTextLength, deepTextSample } from './lib-deep-dom.mjs';

/**
 * ⚠️ **未验证的默认值，不是结论。**
 *
 * `main` 是从 DOM 惯例推来的，没有任何一次实测确认过「Semrush 流量与市场路由的本报表区
 * 根节点是 `main`」。它之所以还是默认值，只是因为**本轮不许在没有实测依据的情况下改变
 * 现有行为**——旧片段用的就是它。等实盘取回本报表区的真实根，改的是调用点的参数，
 * 不是这里的代码。
 *
 * 每一次探针输出都会带上 `scopeIsUnverifiedDefault`，让下游能把「绑到了报表区」和
 * 「退回了整页」区分开。
 */
export const DEFAULT_SCOPE_SELECTOR = 'main';

/**
 * ⚠️ **`chartHydrated` 与 `exportBtns` 已于 2026-08-29 退役，不再参与任何判定。**
 *
 * 上一版把这两个当成「页面其余部分渲染完了」的正向证据，理由是它们「是页面产出」。
 * 同一天的只读实盘把这个理由打穿了：
 *
 *   - `daily-trends` 内容区**一片空白**，`exportBtns` 量到 **12**，而且**和记录里的
 *     `exp=12` 完全一致**。那 12 个匹配全在 shadow DOM 的**导航壳**里，不在任何报表
 *     内。这正是本 law 描述的形态：判据被页面上无关的东西满足，而且满足得毫无破绽。
 *   - `chartHydrated` 在三条路由上**全部读到 0**，包括记录里写着 `chart=122` 的那条。
 *     一个在同一页上既能读到 122 又能读到 0 的量，**不能证明任何事**。
 *
 * 两个方向都错：一个在空白页上恒真，一个在有数据的页上恒假。**是页面产出**这件事
 * 从来不足以让一个信号成为证据——它还必须**绑在本报表区上**，而本报表区的根到今天
 * 仍然没有被实测过（见 `DEFAULT_SCOPE_SELECTOR`）。
 *
 * 处置：**两个字段继续量、继续写进证据，但 `isNoTableStructural()` 不再读它们。**
 * 它们现在是 `advisoryOnly`。等哪天实盘取回了报表区的真实根、并且在**同一页**上
 * 复现出「空白 ⇒ 0，有报表 ⇒ 非 0」，再谈重新启用。阈值常量保留只是为了让老输出
 * 还能被解读，**不是**判定门槛。
 */
export const CHART_HYDRATED_MIN = 3;
export const EXPORT_CONTROLS_MIN = 1;
export const RETIRED_STRUCTURAL_SIGNALS = ['chartHydrated', 'exportBtns'];

/**
 * 内容区非空的**兜底地板**，单位是字符。
 *
 * ⚠️ **这是兜底，不是判据。** 说清楚区别，因为今天已经因为「阈值赌博」翻过一次车
 * （instance 5 → 6：18 秒不够就改 100 秒，还是错的；「等够久还是空」在任何数字上
 * 都不是判据）。
 *
 *   - 它**只能产生 `inconclusive`**，永远不能产生一个正向结论；而且它**从属于**正向
 *     判据——有正向证据时地板根本不参与判定。反过来用（「文本太短所以判它空」）就是
 *     把 instance 5→6 那个赌博换个方向再赌一次。它唯一的作用是在**已经没有正向证据**
 *     的时候，把「连空壳都不如、这次根本没读到内容区」和「内容区渲染了但没东西可认」
 *     分成两个不同的失败原因，给人看的。
 *   - 数字的来历不是拍的：2026-08-29 实测那个空白模块的整页 `innerText` 是 **59**
 *     字符（那 59 个字符是外壳）。地板取 **60**，含义是「连那个已知的空壳都不如」。
 *     它是一次观测的下界，不是「内容区应该有多长」的估计——后者没人测过，也不该猜。
 *
 * 真正承重的是 `classifyContentEvidence()`：**正向**、绑在报表区子树内、三选一。
 */
export const CONTENT_FLOOR_CHARS = 60;

/** 值形的数字 token（和 semrush-traffic.mjs 的摘要判据同一口径）。 */
export const CONTENT_VALUE_PATTERN = /[\d.,]+\s*(?:[KMB]|万|亿|%)/i;
/** 页面**自己渲染出来**的「这里没有内容」。和 semrush-report.mjs 同一组词。 */
export const CONTENT_EMPTY_STATE_PATTERN = /未找到结果|未找到匹配|未找到|没有找到|没有数据|暂无数据|No results|No backlinks|No data|Nothing found/i;

/** 「导出」控件的文案。作用域绑不上时这个正则是唯一的防线，所以它只负责认控件，
 *  **不负责认它属于谁**——那件事只能由 `scopeSelector` 来做。 */
export const EXPORT_CONTROL_PATTERN = /导出|export/i;

/**
 * 空态落地页的标记，**按 locale 声明**。
 *
 * 一条硬规则：这张表既是「怎么认出空态」，也是「我认得哪些 locale」。第二件事才是修掉
 * 实例 4 的关键——旧判据把「没匹配到中文标记」直接读成「不在空态」，那是一个**否定式、
 * 不可证伪**的信号，跟 3 号病一模一样。
 */
export const EMPTY_STATE_MARKERS = [
  { locale: 'zh', marker: '创建新列表' },
  { locale: 'en', marker: 'Create a new list' },
];

/** 从 `<html lang>` 或 URL 里的 locale 段取 UI 语言。
 *  两者都是页面/请求自己产出的事实，不是猜的类名：本仓库自测里就有
 *  `https://dash.proxy.example.com/zh-Hans/` 这样的路径。 */
export function detectUiLocale({ documentLang = '', pathname = '' } = {}) {
  const fromLang = String(documentLang || '').trim();
  if (fromLang) return fromLang;
  for (const segment of String(pathname || '').split('/')) {
    if (/^[a-z]{2}(-[A-Za-z0-9]+)*$/.test(segment)) return segment;
  }
  return '';
}

/** 主语言子标签：`zh-Hans` → `zh`，`en-US` → `en`。 */
export function primaryLanguageSubtag(locale) {
  return String(locale || '').trim().toLowerCase().split(/[-_]/)[0] || '';
}

/**
 * 目标检查：正向（目标标识出现）+ 否定（不在空态落地页）。两半都要。
 *
 * 相对旧片段的唯一行为变化，就是**否定半边不再默认成立**：
 *
 *   - 命中某个 locale 的标记 → `emptyState: 'yes'`，`ok: false`（和以前一样）；
 *   - 没命中，且这一页的 locale 在覆盖表里 → `emptyState: 'no'`，`ok` 看正向半边
 *     （和以前一样）；
 *   - 没命中，但这一页的 locale 我们根本没有标记 → `emptyState: 'unknown'`，
 *     **`ok: false`**。以前这里是 `true`，也就是实例 4 换个语言原样复现。
 *
 * 拿不准就显式失败，是本仓库的既定规矩。想在一个新 locale 上继续跑，办法是把观测到的
 * 标记加进 `markers`（或传 `uiLocale`），而不是让判据默认通过。
 */
export function classifyTargetScope({
  text = '',
  target = '',
  documentLang = '',
  pathname = '',
  uiLocale,
  markers = EMPTY_STATE_MARKERS,
} = {}) {
  const body = String(text || '');
  const hit = markers.find((entry) => entry.marker && body.includes(entry.marker)) || null;
  const hasTarget = Boolean(target) && body.includes(target);
  const locale = uiLocale !== undefined ? String(uiLocale || '') : detectUiLocale({ documentLang, pathname });
  const covered = markers.some((entry) => entry.locale === primaryLanguageSubtag(locale));

  let emptyState;
  if (hit) emptyState = 'yes';
  else if (covered) emptyState = 'no';
  else emptyState = 'unknown';

  return {
    hasTarget,
    emptyState,
    emptyStateMarkerLocale: hit ? hit.locale : null,
    // 老字段名保留，下游还在按它记证据。含义不变：空态标记就在页面上。
    listPickerVisible: emptyState === 'yes',
    uiLocale: locale || null,
    localeCovered: covered,
    ok: hasTarget && emptyState === 'no',
  };
}

/**
 * 「页面还在忙吗」——**只有一半可以参与判定**。
 *
 * 旧写法：`spinnerGone = !root.querySelector('[class*="skeleton" i], [class*="spinner" i], [aria-busy="true"]')`
 * 一个否定式判据，而且其中两项在猜厂商类名。厂商改一次类名，它就**恒为真**，于是一个
 * 从未开始渲染的页面被判成「加载指示已消失」。这正是这条 law 在要求「正向的结束渲染
 * 信号」时最不该用的那种东西：**不可证伪**。它和被删掉的 `vis === 'visible'` 是同一个
 * 形状——在它撒谎的地方自动为真，在它诚实的地方反而可能误杀（页面别处一个装饰性的
 * `class="spinner-icon"` 能把一个已经渲染完的页面永远卡住）。
 *
 * 所以拆开：
 *   - `ariaBusy` —— `[aria-busy="true"]` 是 ARIA 标准属性，是**页面自己声明**的状态，
 *     可证伪、有语义。保留，且**只作为否决项**：为真 ⇒ 没渲染完。为假**不构成**
 *     任何完成证据，完成证据永远由正向信号（paginator / rowCount）提供。
 *   - `loadingClassPresent` —— 猜类名的那两项，**降级为只记录**。写进证据供人看，
 *     永不进入任何判定式。
 */
export function readBusyState(root) {
  return {
    ariaBusy: Boolean(root.querySelector('[aria-busy="true"]')),
    // 记录项，绝不参与判定。见上方注释。
    loadingClassPresent: Boolean(root.querySelector('[class*="skeleton" i], [class*="spinner" i]')),
  };
}

/**
 * 「这一页渲染完了吗」——正向信号 + `aria-busy` 否决。
 * 正向那半（paginator / rowCount）是唯一能提供「完成」的东西；缺了它，无论 spinner
 * 在不在，都不算完成。
 */
export function renderFinished(done = {}) {
  return Boolean((done.paginator || done.rowCount) && !done.ariaBusy);
}

// ---------------------------------------------------------------------------
// 分类之前的**硬闸门**（2026-08-29 新增）
//
// 今天整轮扫描本该全部 `inconclusive`。它没有，是因为分类发生在三件事**都没被断言**
// 的情况下：落地到哪条路由、页头是谁、内容区里有没有东西。三条各自都有实盘反例：
//
//   1. 路由：`www.semrush.com/analytics/traffic/...` 不是授权基址（授权的是
//      `sem.proxy.example.com`），**它不报错**——渲染骨架 → 弹到 `/analytics/traffic/`
//      （公开**营销页**，`innerText` 514、10 张图、标题
//      `Traffic Analytics: Estimate Any Website's Traffic | Semrush`）→ 再弹到
//      overview。一个扫描器会从**销售页**上记下「无表格、有 svg、有导出按钮」。
//   2. 页头：弹完之后标签页停在 **`mmradar.gg`** 的域名概览（23 个非空单元格、
//      AS 22、自然流量 23.9K）。任何当时读到 `cells > 0` 的探针，都会把 mmradar.gg
//      的数字记到 canva.com 名下。
//   3. 内容区：`top-pages`——记录里写着 **850 个非空单元格**的那条路由——现在读到
//      `tables:0, grids:0, cells:0, innerText:59`，持续 150 秒。**一条已知有数据的
//      路由，和那 9 条「无表格」读出来完全一样。**分类在这样的读数上零区分力。
//
// 任一不满足 ⇒ `inconclusive`。**绝不输出 `no-table` 或 `empty`。**
// ---------------------------------------------------------------------------

/** 路由比对用：尾斜杠不作数，`/x/` 和 `/x` 是同一条。 */
function normalizePath(value) {
  return String(value || '').replace(/\/+$/, '') || '/';
}

/** 域名比对用：小写、去 `www.`、去尾点。 */
export function normalizeHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
}

/**
 * 闸门 1：**落地 URL 的 path == 请求的路由**。
 * 结构信号，不看一个字的文案——销售页的文案是英文的、报表页的是中文的，认文案只会
 * 在下一次换 locale 时再翻一次车。
 */
export function checkLandedRoute({ landedUrl, requestedPath } = {}) {
  if (!requestedPath) return { ok: false, reason: 'requested-path-missing', landedPath: null };
  let landedPath;
  try { landedPath = new URL(String(landedUrl || '')).pathname; } catch {
    return { ok: false, reason: 'landing-url-unparsable', landedPath: null };
  }
  const ok = normalizePath(landedPath) === normalizePath(requestedPath);
  return { ok, reason: ok ? null : 'path-drift', landedPath };
}

/**
 * 闸门 2：**页头的域名 == 请求的目标**。
 *
 * 页头读不到 ⇒ `header-target-unknown` ⇒ **不放行**。这一条和 `verifyReportTarget()`
 * （semrush-traffic.mjs）的口径**故意不同**：那边 `unknown` 只记录不阻断，因为它前面
 * 还有一道深链校验兜着。这里是最后一道闸门，后面没有别的东西了——mmradar.gg 那次
 * 就是「没人核对页头」直接变成「把别人的数记到目标名下」。拿不准就显式失败。
 */
export function checkHeaderTarget({ headerTarget, requestedTarget } = {}) {
  const want = normalizeHost(requestedTarget);
  const got = normalizeHost(headerTarget);
  if (!want) return { ok: false, reason: 'requested-target-missing', headerTarget: got || null };
  if (!got) return { ok: false, reason: 'header-target-unknown', headerTarget: null };
  const ok = got === want;
  return { ok, reason: ok ? null : 'header-target-mismatch', headerTarget: got };
}

/**
 * 闸门 3 的承重半边：**内容区里有东西，而且是正向证据。**
 *
 * 三选一，每一条都绑在**报表区子树的深层文本**上（穿透 shadow DOM 之后的）：
 *   - `filled-cells`         —— 至少一个非空单元格。本仓库既有的正向判据。
 *   - `value-token`          —— 至少一个值形数字（`7.9亿` / `84.26%` / `27.1K`）。
 *   - `rendered-empty-state` —— 页面**自己**渲染出了「未找到结果」。这是页面产出的
 *     事实，和「解析出 0 行」不是一回事，必须算作「内容区已渲染」，否则一条真的空
 *     报表会被永远判成 `inconclusive`，那是把一个 bug 换成另一个 bug。
 *
 * 三条都不满足 ⇒ `null` ⇒ 不放行。注意这**不是**「页面上有数字就算有数据」那个
 * 假阳性（instance 8b）：这里读的是**报表区子树**，不是整页，而且它只决定「允不允许
 * 分类」，不决定分成哪一类。
 */
export function classifyContentEvidence({
  deepText = '',
  filledCells = 0,
  valuePattern = CONTENT_VALUE_PATTERN,
  emptyStatePattern = CONTENT_EMPTY_STATE_PATTERN,
} = {}) {
  const text = String(deepText || '');
  if (Number(filledCells) > 0) return { has: true, kind: 'filled-cells' };
  if (valuePattern.test(text)) return { has: true, kind: 'value-token' };
  if (emptyStatePattern.test(text)) return { has: true, kind: 'rendered-empty-state' };
  return { has: false, kind: null };
}

/**
 * 三条闸门合一。**在任何分类发生之前调用**，`admissible === false` ⇒ `inconclusive`。
 *
 * 额外两条前提，和三条闸门同级，因为没有它们前面三条会变成自欺：
 *   - `deepProbe` —— 这份读数必须来自穿透遍历。**浅层探针的读数一律不许分类**：
 *     那正是今天这轮扫描的根因，`innerText` 59 而深层 1,605,054。
 *   - `scopeResolved` 且 `scopeIsUnverifiedDefault === false` —— 报表区的根必须是
 *     **实测确认过的**，不是 `main` 这个 DOM 惯例。绑不上就没有「内容区」可言，
 *     整页文本长度是另一个问题的答案。
 */
export function classifyAdmissibility({
  landedUrl,
  requestedPath,
  headerTarget,
  requestedTarget,
  deepText = '',
  contentTextLength,
  filledCells = 0,
  deepProbe = false,
  scopeResolved = false,
  scopeIsUnverifiedDefault = true,
  contentFloorChars = CONTENT_FLOOR_CHARS,
} = {}) {
  const route = checkLandedRoute({ landedUrl, requestedPath });
  const target = checkHeaderTarget({ headerTarget, requestedTarget });
  const evidence = classifyContentEvidence({ deepText, filledCells });
  const length = Number.isFinite(Number(contentTextLength))
    ? Number(contentTextLength) : String(deepText || '').length;

  const reasons = [];
  if (!deepProbe) reasons.push('shallow-probe');
  if (!scopeResolved) reasons.push('scope-unresolved');
  else if (scopeIsUnverifiedDefault) reasons.push('scope-unverified-default');
  if (!route.ok) reasons.push(route.reason);
  if (!target.ok) reasons.push(target.reason);
  // **地板从属于正向判据，永远不能反过来否掉它。**
  // 有正向证据时地板不参与（否则一个只有一格、文本很短的真报表会被判成
  // inconclusive —— 那就是把阈值赌博换个方向再赌一次）。没有正向证据时，地板
  // 把「连空壳都不如，这次根本没读到内容区」和「内容区渲染了但没有可认的东西」
  // 分开，纯粹是给人看的更具体的失败原因。
  const belowFloor = !(length > contentFloorChars);
  if (!evidence.has) {
    if (belowFloor) reasons.push('content-below-floor');
    reasons.push('no-content-evidence');
  }

  return {
    admissible: reasons.length === 0,
    reasons,
    route,
    target,
    contentEvidence: evidence,
    contentTextLength: length,
    contentBelowFloor: belowFloor,
    contentFloorChars,
  };
}

/**
 * 结构判据。**2026-08-29 重写：`chartHydrated` / `exportBtns` 已退役**（理由见
 * `RETIRED_STRUCTURAL_SIGNALS` 上方）。现在承重的是三件事：
 *
 *   1. `admissible` —— 三条硬闸门全过。没过就根本不该走到这里。
 *   2. `deepProbe` —— 读数来自穿透遍历。浅层的 `noTable` 是**页面一小块**的结论。
 *   3. `noTable` + `onTarget` —— 原来的条件 1 和 4，一个都没松。
 *
 * 少掉的那两个「渲染完成证据」由 `admissible` 里的 `contentEvidence` 顶上，而且顶得
 * 更结实：它绑在报表区子树上，导航壳里的 12 个导出按钮进不来。
 */
export function isNoTableStructural(probe = {}) {
  return Boolean(
    probe.admissible === true
    && probe.deepProbe === true
    && probe.noTable === true
    && probe.onTarget === true,
  );
}

/**
 * 三个判定名，只有两个是结果。先查 `data-not-in-table`——「没有表格」和「没有数据」
 * 是两句不同的话。
 *
 * **2026-08-29：`admissible` 是必填的第一个参数，而且必须显式为 `true`。**
 * 漏传 ⇒ `inconclusive`。这是有意的：一个「不传就按通过算」的闸门等于没有闸门，
 * 而今天这轮扫描恰恰是在没人断言过路由/页头/内容区的情况下分完类的。
 */
export function classifyAbsence({
  admissible,
  anchoredReady,
  noTableStructuralTwiceRunning,
  budgetExhausted,
} = {}) {
  if (admissible !== true) return 'inconclusive';
  if (anchoredReady) return 'data-not-in-table';
  if (noTableStructuralTwiceRunning) return 'no-table-structural';
  if (budgetExhausted) return 'no-table';
  return 'inconclusive';
}

/**
 * 在页面里跑的那一半。`.toString()` 进 eval 执行，所以这里只能用页面自带的东西，
 * 不能引用模块作用域里的常量——阈值和标记都通过 `options` 传进来。
 *
 * `scopeSelector` 是这次改动的全部意义：判据从「写死在 main 底下」变成「绑到调用方
 * 声明的作用域根」。默认值仍是 `main`，**行为与旧片段逐位相同**，等实测确认了本报表区
 * 的真实根，只要传参。
 */
export function readReportProbe(document, options = {}) {
  const {
    scopeSelector = 'main',
    target = '',
    markers = [],
    uiLocale,
    // 穿透遍历由调用方注入（页面里跑时由 DEEP_DOM_JS 提供同名的全局函数）。
    // 注入不进来就没有深层读数——**那时候这个探针必须自报 `deepProbe: false`**，
    // 而不是悄悄退回浅层然后让下游以为它读到了整页。
    deep = (typeof deepQueryAll === 'function' ? {
      queryAll: deepQueryAll, textLength: deepTextLength, textSample: deepTextSample,
    } : null),
  } = options;

  // 报表区的根**要在深层里找**。旧代码用 `document.querySelector(sel)`——在一个把外壳
  // 挂在 44 个 shadow root 里的站上，这一句可能连报表区都找不到，然后静默退回
  // `document.body`，也就是退回到那 59 个字符。
  const scoped = scopeSelector
    ? (deep ? (deep.queryAll(document.body || document, scopeSelector)[0] || null)
      : document.querySelector(scopeSelector))
    : null;
  const root = scoped || document.body;
  const bodyText = (document.body && document.body.innerText) || '';

  const exportControls = [];
  const exportNodes = deep ? deep.queryAll(root, 'button, a') : root.querySelectorAll('button, a');
  for (const control of exportNodes) {
    const label = (control.innerText || '').trim();
    if (/导出|export/i.test(label)) exportControls.push(label);
  }

  let chartHydrated = 0;
  const svgTextNodes = deep ? deep.queryAll(root, 'svg text') : root.querySelectorAll('svg text');
  for (const node of svgTextNodes) {
    if (/\d/.test(node.textContent || '')) chartHydrated += 1;
  }

  const tableSelector = 'table, [role="grid"]';
  const cellSelector = 'td, [role="gridcell"], [role="cell"]';
  const lightTables = root.querySelectorAll(tableSelector).length;
  const deepTables = deep ? deep.queryAll(root, tableSelector).length : lightTables;

  let lightFilled = 0;
  for (const cell of root.querySelectorAll(cellSelector)) {
    if (String((cell.innerText != null ? cell.innerText : cell.textContent) || '').trim() !== '') lightFilled += 1;
  }
  let deepFilled = lightFilled;
  if (deep) {
    deepFilled = 0;
    for (const cell of deep.queryAll(root, cellSelector)) {
      if (String((cell.innerText != null ? cell.innerText : cell.textContent) || '').trim() !== '') deepFilled += 1;
    }
  }

  const lightText = String((root.innerText != null ? root.innerText : root.textContent) || '');
  const deepScopeText = deep ? deep.textSample(root, { maxChars: 60000 }) : lightText;
  const deepScopeTextLength = deep ? deep.textLength(root) : lightText.length;

  // 两个读数**都要输出**：差值本身就是「这一页有多少东西藏在 shadow DOM 里」。
  const lightDom = {
    tables: lightTables,
    filledCells: lightFilled,
    svgText: root.querySelectorAll('svg text').length,
    textLength: lightText.length,
  };
  const deepDom = {
    tables: deepTables,
    filledCells: deepFilled,
    svgText: svgTextNodes.length,
    textLength: deepScopeTextLength,
  };

  return {
    // 作用域自报家门。判据绑没绑上，下游得看得见。
    scopeSelector: scopeSelector || null,
    scopeResolved: Boolean(scoped),
    scopeIsUnverifiedDefault: scopeSelector === 'main',
    // 这份读数是不是穿透读的。**false ⇒ 一律不许分类**（见 classifyAdmissibility）。
    deepProbe: Boolean(deep),

    // 承重字段一律绑**深层**读数。浅层的 noTable 是「页面一小块里没有表」。
    noTable: deepTables === 0,
    filledCells: deepFilled,
    deepText: deepScopeText,
    contentTextLength: deepScopeTextLength,
    lightDom,
    deep: deepDom,
    hiddenBehindShadow: {
      tables: deepDom.tables - lightDom.tables,
      filledCells: deepDom.filledCells - lightDom.filledCells,
      svgText: deepDom.svgText - lightDom.svgText,
      textLength: deepDom.textLength - lightDom.textLength,
    },

    // ⚠️ 退役信号。继续量、继续记，**不参与任何判定**。见 RETIRED_STRUCTURAL_SIGNALS。
    chartHydrated,
    exportBtns: exportControls.length,
    exportControlLabels: exportControls,
    advisoryOnly: ['chartHydrated', 'exportBtns', 'loadingClassPresent',
      'visibilityStateAtVerdict', 'hasFocus'],

    ariaBusy: Boolean(root.querySelector('[aria-busy="true"]')),
    loadingClassPresent: Boolean(root.querySelector('[class*="skeleton" i], [class*="spinner" i]')),

    paginator: Boolean(root.querySelector('[class*="pagination" i], nav[aria-label*="page" i]')),
    rowCount: Boolean(root.querySelector('[data-testid*="row-count" i], [class*="total-rows" i]')),

    bodyText,
    target,
    markers,
    uiLocale: uiLocale !== undefined ? uiLocale : ((document.documentElement && document.documentElement.lang) || ''),
    pathname: (document.location && document.location.pathname) || '',

    // 只记录，永不作为判定依据。见 law 里 `vis` 那段更正。
    visibilityStateAtVerdict: document.visibilityState,
    hasFocus: typeof document.hasFocus === 'function' ? document.hasFocus() : null,
  };
}

/** 把页面读回来的原料拼成一次完整判定。纯函数。 */
export function classifyReportProbe(probe = {}) {
  const scope = classifyTargetScope({
    text: probe.bodyText,
    target: probe.target,
    documentLang: probe.uiLocale,
    pathname: probe.pathname,
    markers: probe.markers && probe.markers.length ? probe.markers : EMPTY_STATE_MARKERS,
  });
  // **闸门在分类之前跑。** 顺序不是风格问题：任何一次「先分类、再看闸门」都会在
  // 日志里留下一个可以被下游读走的分类名。
  const gate = classifyAdmissibility({
    landedUrl: probe.landedUrl,
    requestedPath: probe.requestedPath,
    headerTarget: probe.headerTarget,
    requestedTarget: probe.requestedTarget,
    deepText: probe.deepText,
    contentTextLength: probe.contentTextLength,
    filledCells: probe.filledCells,
    deepProbe: probe.deepProbe,
    scopeResolved: probe.scopeResolved,
    scopeIsUnverifiedDefault: probe.scopeIsUnverifiedDefault,
  });
  const structural = { ...probe, onTarget: scope.ok, admissible: gate.admissible };
  return {
    gate,
    admissible: gate.admissible,
    scope,
    onTarget: scope.ok,
    renderFinished: renderFinished(probe),
    noTableStructural: gate.admissible ? isNoTableStructural(structural) : false,
    verdict: classifyAbsence({
      admissible: gate.admissible,
      anchoredReady: probe.anchoredReady,
      noTableStructuralTwiceRunning: probe.noTableStructuralTwiceRunning,
      budgetExhausted: probe.budgetExhausted,
    }),
  };
}
