# Semrush and Similarweb route capability findings

Dated platform observations and routes. Check the current rendered page before treating any dated capability or metric as current. Paths and pointers are relative to `backlink/SKILL.md`.

<semrush-traffic-route-capabilities date="2026-08-29">
<summary>
**Route capability map for Semrush Traffic Analytics — double-witness
re-measurement, 2026-08-29.** All nine routes whose historical verdicts had
been voided were re-measured with <ref file="scripts/ground-truth.mjs"/>
(census + screenshot pairs, session `semrush-nav`, strictly serial), and the
AI cross-examined both witnesses per route. The full judge's write-up is
`backlink/evidence/ground-truth/remeasure-VERDICTS.md` — **kept local**: the
evidence directory is gitignored, so that path does not resolve in a clean
checkout. This table is the durable summary.
</summary>

| route | shape | magnitude (canva.com, monthly) | historical verdict vs now |
|---|---|---|---|
| `referral` | chart-only | 40M–60M | "no table" holds; "no data" was false |
| `organic-search` | chart-only | 100M–130M, axis top 150M | same |
| `paid-search` | chart-only | 0.8M–1.15M, axis top 1.5M | historical "chart values never rendered" (`chart=0/exp=6`) did not reproduce — the chart carries real digits |
| `organic-social` | chart-only | 11M–24M, axis top 30M | "no table" holds; data lives in the chart |
| `paid-social` | chart-only | 140K–170K, axis top 200K | same |
| `email` | **time-varying: empty-state OR chart-only** | 2026-08-29: grey jagged placeholder, svgText 0; 2026-08-30 (same domain canva.com): real charts, svgText 31, axes 0–1000万 | the earlier "true empty state" verdict is DOWNGRADED — the route is not permanently empty even for canva; the empty rendering is time-varying / hydration-related. Judge each run on its own two witnesses |
| `display-ads` | chart-only | 45K–170K | "no table" holds; data lives in the chart |
| `socioeconomics` | chart-only | summary cards + bar/stacked charts; every value present as DOM text — densest of the nine | Class A "no table" holds, but the page is the richest, not empty |
| `daily-trends` | chart-only | daily visits 20M–35M, axis top 40M | historical "BLANK content area, exportBtns===12" did not reproduce — the same 12 export controls sit beside a full page of charts |
| `top-pages` (control) | **table** | 850 filled cells | the known-good table route, included as the positive control |

**Data-route recheck, same day.** The nine routes historically recorded as
*having* data were re-measured with the same collector — **2026-08-29 双证人复核
确认，计数与历史精确一致**, every route's filled-cell count matching its
historical record exactly (judge's write-up:
`backlink/evidence/ground-truth/recheck-VERDICTS.md`, kept local, gitignored):

| route | filledCells (recheck = historical) | verdict |
|---|---|---|
| `subfolders-subdomains` | 900 | confirmed-data |
| `usa` | 459 | confirmed-data |
| `sources-destinations` | 272 | confirmed-data |
| `audience-overlap` | 204 | confirmed-data |
| `geographical-regions` | 198 | confirmed-data |
| `business-regions` | 36 | confirmed-data |
| `page-groups` | 20 | confirmed-data |
| `demographics` | 20 | confirmed-data |
| `behavior` | data-not-in-table — summary cards, social-media bars, interest bars, device donut; values live in DOM text, not grid cells | confirmed-data (chart-card shape upheld) |

Attribution anchor, one line: **business-regions' four regions sum to ≈790M
(2.8亿+1.9亿+1.6亿+1.6亿), matching canva.com's ~7.9 亿 monthly visits** — the
counts above are anchored to the right domain, not to a hijacked page.

**Collection guidance for the chart-only routes.** They need a chart reader:
after piercing shadow DOM the axis labels, series names and data values are
present in the deep DOM text (`deep.svgText` 13–1132 nodes across these
routes), and every spot-checked pixel number was found there. **Never again
derive "no data" from "no table"** — that inference was wrong on 8 of 9
routes. The collector's readiness now has a matching second branch:
`filledCells > 0` (table, checked first) else `svgText > 0` stable three
polls (chart), recorded as `readyBranch` in the manifest.

**The email lesson, one line: a copy-free placeholder empty state exists, and
`svgText: 0` is the discriminator.** The placeholder has no "no data" text, so
marker-based empty-state detection never fires; among these routes only the
census's `svgText` separates it from chart-only (0 vs 13–1132). The collector
marks it `suspectedEmptyState: true` in the manifest; the verdict still
belongs to the AI with both witnesses. **2026-08-30 correction: the same
canva.com email route rendered real charts (svgText 31)** — so `svgText: 0`
still discriminates *this load's* rendering, but a stable-zero run only proves
"empty this session", never "route permanently empty"; see the round-4 block
below.

**Corrections to the historical record.** "No table" was confirmed 9/9; the
"no data / feature does not exist" extension was wrong 8/9 (all but `email`).
The historical magnitude clues (referral 60M, organic-search axis 150M,
organic-social 30M, paid-search 1.5M) matched the re-measured axis tops
route by route. Neither historical anomaly — "paid-search chart values never
drew" and "daily-trends blank content area" — reproduced; both were
un-rendered loading states filed as page truth.
</semrush-traffic-route-capabilities>

<semrush-organic-route-capabilities date="2026-08-29">
<summary>
**Route capability map for Semrush Organic Research + Keyword Gap — the
"copy the competitor" chain, double-witness ground-truth run, 2026-08-29.**
Collector: <ref file="scripts/ground-truth.mjs"/>, session `semrush-nav`,
machine lock held for the whole run, strictly serial. Target domain canva.com
(db=us). Judge's write-up: `backlink/evidence/ground-truth/semrush-organic-VERDICTS.md`
— **kept local** (the evidence directory is gitignored). This block is the
durable summary. Host is the authorized panel origin (`sem.proxy.example.com`); URL
templates below are paths on it.
</summary>

<routes><![CDATA[
| route | URL template | shape | scale (canva.com/us) | answers |
|---|---|---|---|---|
| positions | /analytics/organic/positions/?db=us&q=<domain>&searchType=domain | summary cards + distribution chart + table | 990 cells (~99 rows × 10 cols); totals 1,658,077 keywords / 16,581 pages | which keywords carry the domain's traffic (keyword / intent / position / SERP features / traffic / traffic% / volume / KD% / URL / last change) |
| changes | /analytics/organic/changes/?db=us&q=<domain>&searchType=domain | trend chart + top-page-change cards + table | 1,230 cells; 45,382 total changes | what the competitor recently gained / improved / declined / lost (previous vs current position, delta, traffic change; "new" labels are plain DOM text, parseable) |
| pages | /analytics/toppages/?db=us&q=<domain>&searchType=domain — /analytics/organic/pages/ 302s HERE; collect via the toppages URL directly, or pass --accept-redirect /analytics/toppages/ | summary cards + 3-line trend chart + table | 997 cells; 33,931 pages | which pages carry organic traffic (URL / traffic / change / traffic% / keyword count / **LLM prompts (大型语言模型提示) — new 2026 column** / referring domains / top keyword / intent) |
| competitors | /analytics/organic/competitors/?db=us&q=<domain>&searchType=domain | competitive-position bubble chart + table | 700 cells (100 rows × 7 cols); 305,726 competitors | highest keyword-overlap rivals (domain / competition level / common keywords / SE keywords / traffic / cost / paid keywords); first row adobe.com, 17%, 328.5K common |
| subdomains | /analytics/organic/subdomains/?db=us&q=<domain>&searchType=domain | single table | 60 cells (15 rows × 4 cols), all on first screen, no pagination | where the traffic sits by subdomain (canva.com: www = 100%, 37.25M) |
| Keyword Gap (results) | /analytics/keywordgap/?q=<you>&searchType=domain&rankType=<bucket>&db=us&compareWith=<comp1>%3Adomain%3Aorganic%7C<comp2>%3Adomain%3Aorganic | best-opportunity cards + 3-circle Venn + bucketed table | 1,000 cells; buckets for canva vs figma vs express.adobe.com: common 45.4K / missing 24.9K / weak 8.2K / strong 24.6K / untapped 3.1M / unique 288.1K / all 3.9M | keywords rivals rank for and you don't (missing) or rank weakly for — the direct topic source |
]]></routes>

<keyword-gap-deep-link>
The hardest-won finding of the run: **the Keyword Gap results page is directly
addressable by URL** — no form walk needed. Verified reproducible template:
<cmd><![CDATA[
/analytics/keywordgap/?q=canva.com&searchType=domain&rankType=common&db=us&compareWith=figma.com%3Adomain%3Aorganic%7Cexpress.adobe.com%3Adomain%3Aorganic
]]></cmd>
- Each `compareWith` entry is `域名:searchType:关键词类型` (`domain:organic`,
  URL-encoded `%3Adomain%3Aorganic`); **multiple competitors are separated by a
  pipe `|` (`%7C`)** — never a comma.
- `rankType` switches the bucket in the same parameter slot: `common` and
  `missing` both verified by direct navigation; the bucket bar also offers
  weak / strong / untapped / unique / all.
- A subdomain (express.adobe.com) is accepted as a comparison column.
- The **entry page** (`?db=us&q=&lt;domain&gt;&amp;searchType=domain` with no
  `compareWith`) is a form with "you + up to 4 competitors" slots and **no
  results — a single domain never reaches the results page**.
</keyword-gap-deep-link>

<lesson id="fake-paywall-is-a-url-encoding-error">
**A "upgrade to Business" full-page blur modal can be a URL-encoding error, not
a plan limit.** Joining two `compareWith` entries with a comma (`%2C`) swallows
the second entry's `:domain:organic` suffix and stably reproduces the Business
upgrade modal ("谷歌购物广告数据有限…升级到 Business", page blurred behind it).
Switching the separator to `|` (`%7C`) made the same three domains return full
data immediately. **When an upgrade modal appears, suspect your own URL encoding
first, the subscription second.**
</lesson>

<lesson id="comparison-tools-need-full-inputs">
**A comparison tool probed with a single input measures a degraded form state,
not the feature.** The single-domain keywordgap entry renders only the empty
form and was ruled INVALID as capability evidence. Any Gap / "X vs Y" style
tool must be fed a full comparison set — 3 domains, or 3–5 keywords — before
any verdict about what it can do is admissible.
</lesson>

<lesson id="semrush-shadow-form-recipe">
**The Keyword Gap form (and its siblings) is a React controlled combobox buried
in shadow DOM.** Measured interaction results, 2026-08-29:
- opencli's AX layer (`find` / `click` / `state`) is completely blind to it;
- a synthetic `value` setter **crashes the component** — after the re-render
  even `deepQueryAll` no longer finds the input;
- the working combination: `el.focus()` +
  `document.execCommand("insertText")` to type, `opencli keys Enter` to
  commit, plain `button.click()` to press 比较;
- **do not use Escape to dismiss the dropdown** — it clears the uncommitted
  text.
Related read-out trap: the Venn diagram legend normalises subdomains to the
root domain (express.adobe.com shows as "adobe.com 3.5M"); **read domains from
the table column headers, never from the chart legend**.
</lesson>

<footnote>
Organic Research tab set observed: 概览 / 排名 / 排名变化 / 竞争对手 / 主题 /
子域名 — "主题 (topics)" not yet measured. Same nav group also holds 域名概览,
比较域名 (`/analytics/comparedomains/`), 关键词差异, and 反向链接差异
(`/analytics/gap/backlinks/`). The keyword-gap entry page's hydration is
moody — same URL often parks at a 1.6M-char shell; the collector's
stall-refresh handles it.
</footnote>
</semrush-organic-route-capabilities>

<semrush-ads-trends-capabilities date="2026-08-30">
<summary>
**Route capability map for Semrush 广告研究 (Advertising Research) + .Trends
市场概览/批量分析 — double-witness ground-truth run, 2026-08-30.** Collector:
<ref file="scripts/ground-truth.mjs"/> (machine-wide semrush lock held for each
run), session `semrush-nav`, target domain canva.com. Judge's write-up:
`backlink/evidence/ground-truth/semrush-ads-trends-VERDICTS.md` — **kept
local** (the evidence directory is gitignored). Host is the authorized panel
origin; URL templates below are paths on it.
</summary>

<routes><![CDATA[
| page | URL template | shape | scale (canva.com) | answers |
|---|---|---|---|---|
| 广告研究 · 排名 | /analytics/adwords/positions/?db=us&q=<domain>&searchType=domain | summary cards + trend chart + table (readyBranch=table, ~31s) | 2,607 paid keywords, $94.4K traffic cost; 100 rows/page × 27 pages | which Google Ads keywords the rival pays for (keyword / position / delta / volume / CPC / URL / traffic / cost / competition) — verified commercial-intent words |
| 广告研究 · 广告创意 | /analytics/adwords/copies/?db=us&q=<domain>&searchType=domain | card grid, NO table NO chart (data-not-in-table): table/chart ready branches never fire, so a plain run budget-exits 2 while deepText holds all the data — MUST collect with --ready-text '广告创意'; grep deepText before ever calling it empty | 2,118 ad copies; each card = title + display URL + body + keyword count | what the rival's ad copy says, and how many keywords back each copy (high count = a proven copy) |
| Ads History | ~~/analytics/adwords/adshistory/~~ ~~/adhistory/~~ | BOTH paths 302 back to positions (hijack self-check exit 3) | — | NEGATIVE, on record to stop re-searching: this account/version has NO standalone Ads History tool — the ads nav group (实见截图) has no such entry, and unknown adwords sub-paths all fall back to positions. The "12-months-running" matrix has no entry here; untested candidate: Keyword Overview's ad-history block |
| .Trends 市场概览 (Market Explorer 后继) | entry form /analytics/traffic/market-overview/ → results ?lid=<listId> (directly addressable; q= is NOT accepted — identity lives in lid) | summary cards + SVG four-quadrant + participants grid (346 filledCells); quadrant names AND domain labels are svg text nodes, bubble coords are SVG attributes — parseable from DOM, no pixel reading needed | market of 99 domains + canva; market traffic 49.4亿 ↑9.23%; TAM 70亿 / SAM 68.6亿 (97.95%); traffic cost $10.7亿 | a niche's market size / growth / consolidation / player quadrants (规则改变者/领导者/利基市场参与者/已有参与者) — pick an ecosystem niche |
| .Trends 行业与批量分析 (= Bulk Analysis) | /analytics/traffic/industry-and-bulk-analysis/ (remembers lid; tabs 批量分析/商家类别) | form (self-drawn row editor + TXT/CSV upload) → results grid (filledCells>20 ready, ~60-90s) | up to 100 domains per run; 6 domains → 42/42 cells in ONE request (genuinely quota-friendly vs 6 separate /analytics/traffic/ reports); exportable | bulk visits / uniques / purchase conversion / pages-per-visit / duration / bounce across a candidate pool — the quota-friendly screen for rival/backlink prospects |
]]></routes>

Dead-route corrections, same run: the old feature-map's
`/analytics/backlinks/bulk/` 302s to the `/analytics/backlinks/` landing form —
**that route no longer exists**; the real bulk entry is .Trends' 行业与批量分析.
`/trends/market-explorer/` is a 404 and `/market-explorer/` 302s to
`/analytics/traffic/market-overview/` — Market Explorer has been folded into
「流量与市场」.

<lesson id="market-overview-async-is-computing-not-empty">
**A newly created market list computes asynchronously and can sit on a skeleton
for 40+ minutes — that state is "computing", never "empty" and never a
paywall.** When done, filledCells 346 + svgText &gt; 10; the collector's ready
criterion is filledCells &gt; 40 or svgText &gt; 10, and a short budget exits 2.
Revisit later instead of writing a verdict. Two entry traps: (a) the bare
`/analytics/traffic/market-overview/` path 302-remembers the LAST `lid` once
any list exists — a **new** market must go through 「保存的列表 → 创建新列表」;
(b) the form shell can fail to hydrate — reload once and the input appears
within ~10s (same disease as keywordgap), then `el.focus()` +
`execCommand('insertText')` + click 分析, and come back in 15-60 minutes. The
「编辑」competitors dialog has a single-slot input — one domain per Enter, and
a dialog opened by mistake is discarded with 取消 (read-only discipline).
</lesson>

<lesson id="trends-pages-are-ax-blind">
**These .Trends pages defeat BOTH the AX tree (state shows only RootWebArea)
and CSS `find` — only <ref file="scripts/lib-deep-dom.mjs"/> shadow-piercing
reads them.** The iframe hypothesis is ruled out (deep iframe count 0). Do not
conclude "blank page" from a blind AX read; go straight to the deep-DOM
witness.
</lesson>

<lesson id="bulk-form-wants-a-file-not-keystrokes">
**The bulk-analysis domain form is a self-drawn row editor ("N/100 of 100
lines"), NOT a textarea — typed input silently loses every line after the
first.** `insertText` with `\n` keeps the counter at 1/100; `insertParagraph`
concatenates lines (`capcut.comcanva.com`). The working recipe (4 failures
deep): synthesize the upload in-page —
`new File([domains.join('\n')], 'domains.txt', {type:'text/plain'})` into a
`DataTransfer`, assign to the deep-DOM `input[type=file]` (accept=.csv,.txt),
dispatch `change` — counter flips to N/100 immediately ("文件已上传"), then
click 分析 via deep button-text match and read the results grid.
</lesson>

<footnote>
Parameter scope: `q=` / `db=` work on the `/analytics/adwords/` group only;
market-overview ignores `q=` (identity is `lid=`). Adwords tab set observed:
排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名 — the paid twin of the
organic set; only 排名 and 广告创意 measured. Cross-check anchor: canva.com
7.9亿 monthly visits agrees three ways (market participants table, bulk
analysis, historical semrush-traffic run).
</footnote>
</semrush-ads-trends-capabilities>

<semrush-backlinks-monitoring-capabilities date="2026-08-30">
<summary>
**Route capability map for Semrush 外链四件套 + Backlink Gap + 竞争对手监控
(EyeOn 后继) — double-witness ground-truth run, 2026-08-30.** Collector:
<ref file="scripts/ground-truth.mjs"/> (machine-wide semrush lock held per
command for the whole run), session `semrush-nav`, target domain canva.com;
Gap comparison canva.com vs figma.com vs adobe.com. Judge's write-up:
`backlink/evidence/ground-truth/semrush-backlinks-audience-VERDICTS.md` —
**kept local** (the evidence directory is gitignored). Host is the authorized
panel origin; URL templates below are paths on it.
</summary>

<routes><![CDATA[
| page | URL template | shape | scale (canva.com) | answers |
|---|---|---|---|---|
| 反向链接明细 | /analytics/backlinks/backlinks/?q=<domain>&searchType=domain | grid 表 (readyBranch=table, ~73s, 320 cells/屏) | ~127,977,174 条, 100 行/页 | 逐条外链画像: 源页 AS/标题/URL/语言/内外链数/锚文本+目标 URL/链接类型(文本图片)/位置(内容)/Follow 属性/首末发现日期; 丢失行带「丢失:链接已移除」灰字行内注释, 不是新行 |
| 引荐域名 | /analytics/refdomains/report/?q=<domain>&searchType=domain — 不在 /backlinks/ 下; /analytics/backlinks/refdomains/ 是死路由, 302 回 /analytics/backlinks/overview/(hijack 自检 exit 3 留档)。引荐域名是左栏「外链建设」组的独立工具, 不是 backlinks 的 tab | grid 表 (~40s, 600 cells/屏); 表头中英混排, 别按中文列名解析 | ~628,658 域, 100 行/页 | 谁在链我(outreach 名单原料): AS/Root Domain+Category/Backlinks/Country IP/First Seen/Last Seen; 顶部「新增和丢失」图表区自己的空态不代表下方表空 |
| 锚链接 | /analytics/backlinks/anchors/?q=<domain>&searchType=domain | grid 表 (~40s, 500 cells/屏) | 100 行/页, 总数不显示 | 锚文本分布: 锚文本/反向链接/域名/首末发现。站群模板链样例: edit image 32,105,651 条却仅 3 域, 与 canva 4,132,305 条 142,440 域相差 7 个数量级 — 读分布必须反链数+域名数双列一起读 |
| 编入索引页面 | /analytics/backlinks/pages/?q=<domain>&searchType=domain — tab 中文名「编入索引页面」slug 却是 pages; /analytics/backlinks/indexed-pages/ 是死路由 302 回 overview; tab 行是 JS router 不是 <a href>, 扒不到 href, 深点 tab 后读 location 才拿到 slug | grid 表 (600 cells/屏) | ~89,284,236 页, 100 行/页 | 竞品哪些页面吃到最多外链(linkable asset 排行): 标题 URL/反链/域名/外内链/上次发现; 大量标题是「Unsupported client – Canva」(爬虫被前端拒), 以 URL 为准 |
| Backlink Gap (反向链接差异) | /analytics/gap/backlinks/?q=<you>&searchType=domain&compareWith=<d2>%3Adomain%7C<d3>%3Adomain → 302 到 /analytics/gap/backlinks/report/?… 且表格直接出数 — URL 直达可重现, 无需走表单。compareWith 与 Keyword Gap 同构但少 :organic 段: <domain>:domain, 竞品间用竖线 %7C 分隔(绝不是逗号), 槽位 You+最多 4 竞品 | 真 <table> 元素 (tables=1, 本批唯一; 其余全是 role=grid DIV), 700 cells, filledCells 就绪 | 潜在机会 506,817 引荐域 (canva vs figma vs adobe) | 谁链竞品没链我: 分桶 最佳/弱/强/共享/唯一/所有 (Keyword Gap 是 缺失/弱/强/共享/未开发 — 结构同构桶名不同) + AS 下拉 + 高级筛选器; 列: 引荐域名+类别/AS/每月访问量/匹配 n\/3/逐域反链数。默认「最佳」桶已是"竞品有我没有" |
| One2Target | ~~/trends/one2target/~~ 404「我们迷路了」 | 独立工具不存在 — 负结论入册, 别再找入口 | — | .Trends 左栏 28 项实扒无此条; 其四个 tab = 流量与市场「受众」组四条路由, 均有既有双证人判决: demographics (20 cells) / audience-overlap (204) / socioeconomics (chart-only) / behavior (data-not-in-table)。找受众画像走 /analytics/traffic/{demographics, socioeconomics, behavior, audience-overlap}/?q=<domain>&searchType=domain |
| 竞争对手监控 (= EyeOn 后继) | /eyeon/ → 302 /analytics/traffic/competitor-monitoring?lid=<listId>; 直达带 lid 可重现 (lid = .Trends 列表身份, 与市场概览共用) | **DOM 全盲页 — 本批新页型** (census 全 0: tables/grids/cells/svgText/canvas/iframe=0, deepText 恒 1.6M 纯壳; 唯一可用证人=像素, 见 every-measurement-needs-two-witnesses 的极端案例) | 零配置出数 (直接吃 .Trends lid, 不用建监控): canva.com 近月 谷歌搜索广告 2572 (创意带日期/国旗/文案/落地 URL 时间轴) / 博文 0 / 新页面 1656; 仅社交媒体维度需点「设置」 | 盯竞品动态: 新广告创意时间轴/新博文/新页面/社交帖与参与度 |
]]></routes>

<lesson id="unknown-backlinks-subpath-302s-to-overview">
**未知 backlinks 子路径统一 302 回落 overview(与 adwords 组回落 positions
同模式)。302 回落是「路由不存在」的形状,不是「无数据」** — hijack 自检 exit 3
是正确留档,别把回落页当目标页的空态读。本轮两条死路由实测:
`/analytics/backlinks/refdomains/` 与 `/analytics/backlinks/indexed-pages/`。
旧 app 路径(`/trends/one2target/` 型)在本镜像一律 404。
</lesson>

<lesson id="backlinks-overview-zero-is-component-failure">
**反链 overview 摘要卡的 0 是组件故障,不是域名事实。**
`/analytics/backlinks/overview/` 实测渲染「引荐域名 0 / 反向链接 0」+
Authority Score 两卡「Data is unavailable · Reload」,而**同一时刻**明细页有
628K 域 / 1.28 亿条(自然流量与网络图表卡正常渲染,census 与像素一致——
坏的是那几张卡自己)。**任何以 overview 摘要卡为准的判空作废**;判一个域名
有没有外链,永远去明细路由数行。
</lesson>

<lesson id="competitor-monitoring-pixel-only-collection">
**竞争对手监控页只能像素采集**:foreground 开页 → 固定等待(实测约 90-120s)→
截图为准;census 仅作「壳基线」记录,读数靠 AI 读图。三条就绪分支
(cells/svg/text)对它全部失明;`--ready-text` 的 regex 必须避开左栏导航词,
否则会在 spinner 上提前触发(本轮踩过:census-stable-shot-unstable 停在
加载态)。时间轴广告创意多语种(pt/es/…),像素抽查用整句文案。
详见 <law-ref id="every-measurement-needs-two-witnesses"/> 的 DOM 全盲页补条。
</lesson>
</semrush-backlinks-monitoring-capabilities>

<semrush-keyword-research-capabilities date="2026-08-30">
<summary>
**Route capability map for Semrush 关键词研究工具组 (Keyword Overview / Keyword
Magic / Keyword Strategy Builder) + adwords 其余四 tab + round-4 补测判决 —
double-witness ground-truth run, 2026-08-30.** Collector:
<ref file="scripts/ground-truth.mjs"/> (machine-wide semrush lock held per run),
session `semrush-nav`; tab/bucket interaction via one-shot scratchpad probes
(same `acquireToolsShareBrowserLocks`, read-only clicks, zero list-creation,
zero exports). Seed keyword `graphic design` (db=us), ads/gap target canva.com.
Judge's write-up: `backlink/evidence/ground-truth/semrush-round4-VERDICTS.md`
— **kept local** (the evidence directory is gitignored). Durable manual:
`platforms/semrush/keyword-research/` + the round-4 amendments in
`advertising-research/`, `backlink-analytics/backlink-gap/`,
`traffic-analytics/`. Host is the authorized panel origin; URL templates below
are paths on it.
</summary>

<routes><![CDATA[
| page | URL template | shape | scale (measured 2026-08-30) | answers |
|---|---|---|---|---|
| Keyword Overview | /analytics/keywordoverview/?db=us&q=<kw> (spaces as +) | summary cards + trend + opinion cards + SERP table (readyBranch=table, ~33s, 82 cells, svgText 0 — the bars are divs) | graphic design: volume 1.2M US / 1.9M global, KD 77% (~99 ref domains), intent 信息, CPC $4.13, variations 277.8K, questions 18.5K, SERP top-10 with AS/backlinks/traffic; quota widget 5,000/5,000 | is one keyword worth doing — volume/KD/intent/CPC/global split/SERP strength on one screen |
| Keyword Magic Tool | /analytics/keywordmagic/?db=us&q=<kw>&type=<tab>[&questions=true] — type=all|phrase|exact|related all verified by reading back href after clicks; 广泛匹配 = NO type param (clicking it removes type); questions=true is an independent toggle stackable on any type; mode=0 is always present (meaning unknown, carry it verbatim); type=related direct-open verified: 57.1K words / 5,218,520 volume / avg KD 43% | left Topics tree + main table (readyBranch=table, ~31s, 1344 filledCells/screen) | graphic design all: 149.8K words, total volume 10,592,470, avg KD 40% | expand a seed into mass long-tail: per-word intent/relevance/volume/trend/KD/CPC/competition/SF; Topics/Groups clustering tree |
| Keyword Strategy Builder | /analytics/keywordmanager/?db=us&q=<kw> (landing href becomes ?q=<kw>&owning=all) — the feature-map's old /keyword-manager/ path is a 404 dead route («我们迷路了», census all-zero), FALSIFIED on record | form entry + existing-lists grid (40 cells, ready in 1 poll) | shared account holds 59 lists (所有 59 / 我自己 59 / 与我分享 0); form shows 主关键词 1/5 + 创建 50/50 remaining quota | up to 5 main keywords → auto-clustered pillar/cluster site structure. READ-ONLY: 创建 consumes shared quota and creates lists — never click; list rows are other users' assets |
| 广告研究 · 排名变化 | /analytics/adwords/changes/?db=us&q=<domain>&searchType=domain | bucket pills + daily gained/lost chart (readyBranch=chart, svgText 18) + table filtered by current bucket | canva.com @date=20260828: 新增 0 / 丢失 99 / 上升 0 / 下降 0; a 0-row bucket shows «未找到任何数据 尝试更改筛选器» — that is a FILTER empty state, not an empty page (丢失 bucket has 99 words) | a rival's paid keywords gained/lost day by day |
| 广告研究 · 竞争对手 | /analytics/adwords/competitors/?db=us&q=<domain>&searchType=domain | bubble chart (svgText 33) + table (700 cells) | 631 paid competitors; first row picsart.com 21.2% / 584 / 2.9K / 92,581 | rivals with the highest paid-keyword overlap |
| 广告研究 · 页面 | /analytics/adwords/pages/?db=us&q=<domain>&searchType=domain | single table (360 cells) | 72 paid pages; first row www.canva.com/ 54K / 76.36% / 1.6K | which landing pages carry the ad traffic |
| 广告研究 · 子域名 | /analytics/adwords/subdomains/?db=us&q=<domain>&searchType=domain | single table (4 cells) | 1 row: www.canva.com 70,748 / 100% / 2.6K | which subdomains take the paid traffic |
]]></routes>

All four adwords slugs are verified real routes (first two read back from tab
clicks, last two by direct-open landing check); the standing rule "unknown
adwords sub-paths 302 back to positions" still holds around them. Common
parameter note: the landing swallows `db=us` into `date=YYYYMMDD` (latest data
day).

<lesson id="backlinkgap-buckets-are-not-url-addressable">
**Backlink Gap's six buckets can NOT be reached by URL — `rankType=` is
silently ignored** (page renders the default 最佳 bucket regardless; double
witness on record: href carries `rankType=weak`, screenshot highlights 最佳).
**The Keyword Gap `rankType` deep-link experience does not transfer to
`/analytics/gap/backlinks/`.** Clicking a bucket pill never changes the URL —
buckets are pure client state. Worse, **per page load only the FIRST bucket
click lands reliably**; subsequent synthetic clicks (both `el.click()` and full
pointer sequences) are routinely swallowed. The only reliable recipe is
**one bucket = one fresh page open**: open the report URL → wait
`filledCells > 0` → click the target bucket ONCE → poll the "1 – 100 (N)"
counter for a change to confirm landing → collect. Bind the landing check to
the counter change, never to the click's return value. Measured bucket counts
(canva.com vs figma.com vs adobe.com, 2026-08-30): 最佳 507,776 / 弱 14,803 /
强 131,926 / 共享 14,803 / 唯一 629,264 / 所有 725,662. (弱 and 共享 share a
count but differ in ordering — canva is weak on every shared domain against
these two rivals; row-level numbers double-witnessed, not dug further.)
Generalized: **bucket/tab filter URL params must be proven per tool — never
assume transfer between sibling tools.**
</lesson>

<lesson id="traffic-analytics-q-is-overridden-by-lid">
**The entire Traffic Analytics tree ignores `q=` whenever a `lid=` (未命名列表)
is attached — and the panel attaches it automatically.**
`/analytics/traffic/email/?q=nytimes.com&searchType=domain` lands with
q=nytimes.com in the href yet renders canva.com (the list's domain); so does
`/analytics/traffic/traffic-overview/?q=nytimes.com`. **Switching domains
requires switching the shared list's domain chip (or building a new list) —
the sub-routes' `q=` is decoration.** That shared list (`lid=1234565`) is
referenced by this round's and prior rounds' evidence; changing it would
poison shared state and historical reproducibility, so under read-only
discipline it was NOT touched. It is a platform trap, not a bug.

**RESOLVED 2026-08-30 (user-authorised): create a NEW list for the target
domain and address every sub-route by `lid=&lt;new lid&gt;`; the old list stays
untouched.** Verified end to end (`semrush-lid-switch-VERDICTS.md`): new
lid 1234971 → nytimes.com, top-pages readyBranch=table filledCells=850 and
email svgText=31 both double-witness HITs, old lid 1234565 still renders
canva.com. Recipe: header list button → dropdown "+ 创建新列表" → editor's
domain input (`input[data-testid="input-target-input"]`), fill via
`focus()+execCommand('insertText')`, then **commit the chip by dispatching a
synthetic KeyboardEvent Enter (keyCode 13, bubbles) ON the input — a real
CDP `keys Enter` and clicking the ✓ icon both do nothing**; success = the
0/100 counter ticking to 1/100; then click 保存更改 and read the new lid off
the landing URL. Traps: a fresh list renders full-page skeleton for minutes
while the server computes (skeleton ≠ empty — wait and re-collect, then it
hydrates in ~10s); the list name typed in the editor does not persist (lists
stay "未命名列表", identity is the lid); each list caps at 100 domains
(X/100 counter), and no list-count quota or asset cost surfaced anywhere in
the flow.

**AFTERMATH 2026-08-30 — the new list became the panel default, and that is
a live trap for every later run.** A screenshot-chain validation run aimed at
`?q=canva.com` (no lid written) came back showing nytimes.com: the panel had
silently appended `lid=1234971`. Creating a list does not merely add an
option — it moves the default. So: **write `lid=` explicitly on every
Traffic Analytics collection, never omit it**, and check the landing URL, not
the URL you sent. The route self-check compares path/hash only, so a swapped
subject domain passes it silently; `manifest.finalHref` (added the same day)
is where `q=` and `lid=` can be seen disagreeing — the AI reads that pair,
the script still judges nothing.
</lesson>

<lesson id="ads-history-standin-verdict">
**The Ads History stand-in candidate is now judged: Keyword Overview has NO
ad-history block.** The page bottom offers only 谷歌购物广告创意 / 广告创意
card slots, both "我们没有要显示的数据" for the informational seed word, with
the top summary cards reading 不可用 — **an empty slot under an informational
keyword is the normal state, and the "12-months-running" ad matrix still has
no entry anywhere in this version.** Whether a commercial keyword (e.g. vpn)
fills the slots remains untested — that is the only remaining candidate probe.
</lesson>

<lesson id="sources-destinations-dest-tab">
**The 目标 (destinations) tab of `/analytics/traffic/sources-destinations/`
has no URL parameter — pure client-side switch, click 「目标」 in-page** (tab
state is remembered; a reopened page may land on it directly). Measured
(canva.com, 2026-07): grid of 208 filledCells, google.com 34.01% / 2155万
leading, claude.ai 1.62% on the board. Trap: the tab's table body can sit on a
grey skeleton with the paginator at 0 and export greyed **for entire ~4-minute
rounds** (twice in a row; the third round rendered) — **skeleton + count 0 is
loading jitter, never an empty state**; judge empty only on non-skeleton rows
or explicit empty copy.
</lesson>

<footnote>
Round-wide traps, additive to the standing laws: (a) mirror flakiness — the
「出错了」error page / white screen / whole-round spinner heals on one reload;
only after 3 consecutive failed reloads park it as "mirror fault, re-measure
later" (adwords/changes first run spun 240s, rerun succeeded in 46s);
(b) before hydration completes, ALL synthetic clicks are silent no-ops — poll
for the target control (census or leaf-text hit) before clicking; (c)
`document.referrer` still throws under the mirror patch — keep the try/catch.
</footnote>
</semrush-keyword-research-capabilities>

<semrush-content-audit-capabilities date="2026-08-30">
<summary>
**Route capability map for the content-tools group + the site-audit门 pages —
14 routes, double-witness, 2026-08-30.** Session `semrush-nav`, machine-level
`semrush` lock held per route, one <ref file="scripts/ground-truth.mjs"/> run
each. **Zero consuming writes this round**: no SEO project created, no template
created, nothing published, exported or subscribed; the only two clicks were
read-only (`/siteaudit/`「显示所有项目」 and `/topic-research/`'s history
「查看内容创意」). Judge's write-up:
`backlink/evidence/ground-truth/semrush-content-audit-VERDICTS.md` (local,
gitignored). Markdown manual: `platforms/semrush/content-tools/` (repo root).
**Split: 3 read-layer routes · 7 do-layer routes behind a REAL paywall ·
2 project-gate empty states · 2 dead routes.**
</summary>

<routes><![CDATA[
| # | route (sem.proxy.example.com) | layer | shape | readyBranch / --ready-text | verdict |
|---|---|---|---|---|---|
| 1 | /topic-research/ | READ | form + 5-row history list; tables=grids=cells=svgText=0 | none of the 3 branches fires → budget/exit 2; MUST pass --ready-text | alive; entry only, the report id is behind a click |
| 2 | /topic-research/<24hex>/ | READ | CARD report, 10 subtopic cards; cells=0 svgText=0 canvas=0 | `text` — `--ready-text "Volume:"`, ready in 18.9s | **the only content report with real data this round** |
| 3 | /swa/ | READ (list) + DO (editor) | card list, 10 documents; cells=0 svgText=0 | `text` — `--ready-text "质量分数为"`, ready in 18.7s | alive; list face is harvestable, the editor behind「分析新文本」is do-layer |
| 4 | /content/ | DO | English marketing landing page | `table` (10–19s) — **the ready table is a PRICING table** | **REAL paywall**: Content Toolkit, $60/month, this account has not bought it |
| 5 | /content/topic-finder/ | DO | same | same | same |
| 6 | /content/briefs/create/ | DO | same | same | same (this one would have been a read-layer spec generator) |
| 7 | /content/articles/ | DO | same | same | same |
| 8 | /content/articles/create/ | DO | same | same | same |
| 9 | /content/articles/optimize/ | DO | same | same | same |
| 10 | /content/articles/repurpose/ | DO | same | same | same |
| 11 | /seo-content-template/ | — | — | — | **DEAD ROUTE — 302 → /swa/** (exit 3 hijack unless --accept-redirect /swa/) |
| 12 | /siteaudit/ | gate | table EMPTY state, 12 column headers, 0 data rows | `table` at 23.3s with **filledCells=1** — that 1 cell IS the empty-state copy | 0 SEO projects on the account → no report reachable (see <semrush-siteaudit-capabilities> for the state after a project exists) |
| 13 | /on-page-seo-checker/ | gate | onboarding page + promo illustration; all counts 0 | all 3 branches blind → budget/exit 2 | project gate; no project = no data |
| 14 | /log-file-analyzer/ | — | — | — | **DEAD ROUTE — 302 → /siteaudit/** |
]]></routes>

<read-vs-do>
**The whole `/content/*` subtree is do-layer AND paywalled — two independent
reasons it is unusable, so it is judged dead without deeper interaction.**
Semrush has rebuilt the content-marketing group into **Content Toolkit and
split it out of the plan as a separate $60/month subscription**; all seven
routes render an English sales page ("Try it now for free / 7-day free trial,
then $60/month"). What GURU still carries are the two *old* standalone tools —
Topic Research and SEO Writing Assistant — and neither lives under `/content/`.
This contradicts `references/semrush-feature-map.md` §5 ("Content Marketing
工具组 = GURU 独占解锁"), which is wrong as of 2026-08-30.

This is **not** the `fake-paywall-is-a-url-encoding-error` shape:
no blur modal, no「升级到 Business」, clean URL, correct landing, and the `fid=`
on the landing href is the panel's own folder context. It is simply not bought.
</read-vs-do>

<lesson id="ready-branch-is-not-a-data-verdict">
**`readyBranch` only proves the page finished painting. It never proves the
page has data.** Two proofs from one round: the seven `/content/*` sales pages
all reach `readyBranch=table` in 10–19 seconds — the table that satisfied the
branch is the **pricing/feature-comparison table** of a marketing page; and
`/siteaudit/` reaches `readyBranch=table` with `filledCells=1`, where that
single filled cell **is the「未找到任何数据」copy itself**. On this page
`table + filledCells=1` means *confirmed empty*, not "one row of data".
→ Presence of data is decided by reading census body text **and** the
screenshot, per <law-ref id="every-measurement-needs-two-witnesses"/>. Never by
a branch name.
</lesson>

<lesson id="pixels-can-be-a-promo-illustration">
**Sharpest double-witness catch of the round.** `/on-page-seo-checker/`'s
screenshot shows a bold donut chart reading `243 Total Ideas for 24 pages`,
`Strategy 9 / Backlinks 24 / Technical 39 / Content 142 / Semantic 21 /
SERP Features 8 / UX 12`, `Over 240%`, `Current 300K → Potential 720K`.
**None of those strings exist in the DOM** — full-text search of the census for
`243` / `Total Ideas` / `240` returns false, and `svgText=0`. It is a raster
sales illustration. A screenshot-only reader copies a promotional mock-up into
the archive as this account's real report.
→ **Any number taken from pixels must be findable in the census full text.
Not findable = illustration, not data.** This is the mirror image of the
DOM-blind page type: there, pixels were the only witness; here, pixels are the
lying witness. Neither witness is trusted alone, in either direction.
</lesson>

<lesson id="nav-entry-is-not-availability">
The left sidebar lists all six Content Toolkit sub-tools (AI 文章生成器 /
内容优化工具 / 转换为社交媒体管理或电子邮件 / 主题查找器 / SEO 概要生成器 /
我的内容) while every one of the seven routes is a $60/month wall. **A sidebar
entry proves the route exists; availability is decided only by double-witness
reading of the landed page.** Same family as the dead-route lesson: the panel's
own navigation is not a capability inventory.
</lesson>

<lesson id="topic-research-report-id-has-no-deep-link">
`/topic-research/&lt;24-hex savedSearchId&gt;/` is the report; the entry form is a
POST-shaped React form and **no `?q=` deep link was proven this round**. The id
observed (`<SAVED_SEARCH_ID>`) came only from clicking a row of
「近期搜索」. `document.title` is identical on entry page and report page, so
**landing checks read `finalHref`'s path, never the title.** This is the
biggest open harvesting gap in this section; the next attempt drives the entry
form with the React controlled-combobox recipe (`el.focus()` +
`execCommand("insertText")` + `keys Enter`) and records how the id is minted.
</lesson>
</semrush-content-audit-capabilities>

<semrush-siteaudit-capabilities date="2026-08-30">
<summary>
**Site Audit is the one Semrush module with no stateless entry: every route is
bound to a project id.** One project was created this round (user's own site,
campaign `<CAMPAIGN_ID>`), consuming 1 of the account's 15 Projects slots — the
create recipe below is therefore recorded once and **must be reused, not
repeated**. 6 report routes judged double-witness, 2026-08-30. Judge's
write-up: `backlink/evidence/ground-truth/semrush-siteaudit-VERDICTS.md`
(local, gitignored). Markdown manual: `platforms/semrush/site-audit/`.
Nothing was exported, subscribed, or PDF'd; project settings were not changed
after creation.
</summary>

<create-recipe><![CDATA[
CREATING A PROJECT IS TWO INDEPENDENT DIALOGS, NOT ONE WIZARD.

  段 1  「创建 SEO 项目」 (2 inputs)   ← button 「创建 SEO 项目」 on /siteaudit/
  段 2  「新检测」 (5-step wizard)     ← auto-pops 1–2s after 段 1 submits
                                        (also re-openable from the row's 「设置」)

*** THE TRAP ***  After 段 1 submits, 段 1's dialog DOES NOT DISAPPEAR.
Both dialogs hang in the DOM at once (evidence create/wizard-log.json step
`13-submitted`: dialogs.length === 2). Any locator written as "the current
single dialog" hits the STALE one.
    → ALWAYS TAKE THE LAST ELEMENT OF THE dialogs ARRAY.

段 1 fields
  domain   input#cpmProjectDomain   placeholder domain.com   (subfolders rejected:
                                    「输入域名或子域名。不支持子文件夹」)
  name     input#cpmProjectName     optional, leave blank = auto-generated
  submit   click the button BY VISIBLE TEXT 「创建 SEO 项目」
           (the button list contains several text:"" icon buttons; matching by
            text avoids them for free)
  Fill values with opencli's controlled set-value (assert action.ok + read the
  value back). Do NOT simulate per-character typing.

段 2 — 「新检测」, 5 steps, steps 2–5 all marked 可选
  1 常规      scope / 每次检测的限额 / 抓取源 / 排期 / 完成邮件
  2 抓取器    user agent, crawl delay, JS rendering
  3 允许/禁止规则   two textareas
  4 URL 参数规则    「要忽略的参数」 textarea, max 100
  5 绕过的限制      3 checkboxes (bypass robots.txt / use my credentials /
                    Web Bot Auth signing) — default ALL OFF
  submit  button 「开始检测」

DEFAULTS THAT SILENTLY SHAPE THE REPORT (measured, step 1 + step 2)
  每次检测的限额  = 100 pages   (account-tier default; it is why the report says
                                「已抓取页面 88/100」)
  抓取源          = 网站 (internal links from the homepage)
  用户代理        = SiteAuditBot (Mobile)  → report header says「移动设备」
  抓取延迟        = radio value 1「最短」
  JS 渲染         = checkbox UNCHECKED → report header「JS 渲染：已禁用」
      ⚠ On an SPA / client-rendered site this default systematically depresses
        the content metrics (word count, text-HTML ratio). Re-run with JS
        rendering ON before believing a「单词数量少」warning.

排期下拉 HAS a 「一次」 OPTION — full option set measured (start/log.json
`41-schedule-options`): 每周，每周一 … 每周，每周日 / 每日 / 一次.
The selector implementation missed it and kept the default WEEKLY, so the
project now re-runs itself every week. Pick 「一次」 explicitly for one-shot
recon.
  → Second trap: the dropdown's CURRENT-VALUE LABEL CHANGES WITH THE WEEKDAY
    (「每周一」/「每周五」/「每周六」 all appear across one evidence bundle).
    Locating the schedule button by a hard-coded weekday string always breaks;
    locate it as the sibling of the 「排期」 label.

AFTER 「开始检测」
  the row shows 「正在检测站点…… 1 /100」; 88 pages took ~13 minutes.
  The project row is a DIV with href=null (hash-mangled CSS-module class), so
  THE CAMPAIGN ID CANNOT BE READ FROM A LINK — click in and read it off the URL.
]]></create-recipe>

<routes><![CDATA[
URL template, uniform:  https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/<route>
There is NO domain-query entry — unlike /analytics/*, every Site Audit route
binds the project id. Parameterise it in any script.

| route | shape | readyBranch | --ready-text | measured scale | landing |
|---|---|---|---|---|---|
| review/overview | cards + gauge + small table | table (filledCells=15) | not needed | 15 cells / 4 svgText | unchanged |
| review/issues | **DIV card list** | **text** | `如何解决` | 5 issue rows, cells=0 svgText=0 | `?restrictions=<base64>` appended by the page itself |
| review/pagereport | real table | table (filledCells=608) | not needed | 88 rows × 9 of 22 columns | → `/pagereport/pages?sort=prScore_desc&page=1` (needs --accept-redirect) |
| review/crawlability | cards + chart dashboard | nominally table (filledCells=**1**, pure luck) | `分数：` (use it) | 1 cell / 22 svgText, data lives in DIV cards | unchanged |
| review/https | **11 check-cards** | **text** | `分数：` | 11 checks, cells=0 svgText=0 | unchanged |
| statistics / compare-crawls / progress / JS-impact / 站点架构 | NOT SURVEYED | — | — | — | — |

`restrictions` decodes to {"search":"","severity":"all","checks":"nonzero"} —
it lands on the QUERY, not the pathname, so the landing self-check passes and
**--accept-redirect is NOT needed** for issues. The only route that needs it is
pagereport.

pagereport, on "did we lose rows": NO. The earlier run stopped on `max-screens`,
which truncates SCREENSHOT COVERAGE only — census was always complete: every
census s1–s6 held all 88 URL rows, matching the page's own「已抓取页面 88/100」
and the pager「页码 1 / 每页 100 / 共 1 页」. `max-screens` is not a failure and
also not "reached the bottom": before judging, check whether
scrollY + innerHeight covers `bodyScrollHeight`.
]]></routes>

<lesson id="ready-text-regex-must-not-hard-code-spaces">
**The 200-second lesson.** `review/issues` was first collected with
`--ready-text "错误 \(\d+\)"` and burned the full 200s budget plus two useless
refreshes before `stopReason=budget`. The page renders that string as
**「错误」+ NEWLINE + 「(1)」** — the literal space in the regex can never match.
Rules that follow:
- **Never hard-code a space between a Chinese label and its number** in a
  ready-text regex; the separator is routinely `\n`.
- Prefer **one stable word**: `如何解决` for issues, `分数：` for https and
  crawlability.
- Never pick a word that also appears in the left nav (`网站检测`, `概览`) —
  the shell satisfies it instantly, which is the same as having no criterion.
- The text branch requires **two consecutive polls with an unchanged
  `deepTextLength`**, so one extra poll after the word hits is normal.
</lesson>

<lesson id="transient-nav-failure-masquerades-as-hijack">
`hijacked=true` + `finalHref=/` + a tiny `deepTextLength` (88 characters) is
**not an alias redirect — it is a navigation that never happened**, typically
right after the previous route burned its whole budget with refreshes and left
the tab unsettled. Same URL, one retry later, landed cleanly
(`route-https-v2`, `stopReason=stable`).
→ **The fix is to retry, NOT to add `--accept-redirect`.** `/` is not a legal
alias of anything; whitelisting it teaches the collector to archive a blank
page as data. Reserve `--accept-redirect` for a real alias with a real
destination path (here: `pagereport` → `/pagereport/pages`).
</lesson>

<lesson id="siteaudit-census-constants">
Two census numbers that look informative and are not:
- **`census.deep.textLength` ≈ 1,599,xxx is a shell constant** on every Site
  Audit page (differences of a few dozen characters). It carries **zero
  information about whether the page has data**; its only use is spotting a
  blank page (the failed navigation above read 88).
- **`deepText` is truncated at ~20,000 characters** (every census in this
  bundle is exactly 20,034). The 88-row table survived because business content
  comes first and the tail that got cut was injected CSS variables — but a
  bigger table WILL be eaten. Count rows by `filledCells` or by paging, never
  by grepping `deepText`.
</lesson>
</semrush-siteaudit-capabilities>

<similarweb-explore-capabilities date="2026-08-29">
<summary>
**Route capability map for Similarweb's "pick the racetrack" chain — Demand
Analysis + Website Rankings, double-witness run, 2026-08-29.** Session
`similarweb-nav`, machine lock held throughout. Judge's write-up:
`backlink/evidence/ground-truth/similarweb-explore-VERDICTS.md` — kept local.
Everything here is **hash routing**: `location.pathname` is permanently `/`,
so landing checks compare the first 3 hash segments and plain `open` of a deep
link can load an empty shell — the collector's hash-aware self-check and
`--scroll-container` / `--ready-text` flags (see
<ref file="scripts/ground-truth.mjs"/>) exist precisely for this surface.
</summary>

<routes><![CDATA[
| page | URL shape (hash on the panel origin) | shape | scale | answers |
|---|---|---|---|---|
| Demand Analysis home | #/digitalsuite/marketresearch/keywordmarketresearch/home | search box + topic cards + lists (no table, cells=0) | 4 trending-topic cards + 217-industry topic tree (in-page overlay) | topic radar entry: which topics' demand is rising |
| Demand Analysis topic report | #/digitalsuite/marketresearch/keywordmarketanalysissearch/demand-search-trends?country=999&webSource=Total&duration=12m&id=AiTopic%3B<topic>%3B999 | cards + charts + 4 tables (table-ready in 23s, filledCells=180) | 74M total searches on 1,000 keywords; 12-month curve; countries table paginated /29 ≈ 145 countries | a topic's total demand, growth, keyword mix, geography — the core pick-a-keyword report. Deep-linkable: the id format is AiTopic;<topic>;999 |
| Website Rankings selector | #/digitalsuite/markets/webmarketanalysis/home | industry tree only, no table | 217 industries (26 top-level + subcategories) | entry into a category board |
| Website Rankings category board | #/digitalsuite/markets/webmarketanalysis/mapping/<Top_Level~Sub_Category>/<country>/1m?webSource=Total | 3 Top-movers tables + main board as a COLUMN-MAJOR DIV layout (produces no cells — census is blind to it) | 10,000 domains × 13 columns × 100 pages (100 rows/page); 9 channel tabs (all/search/social/display/referral/direct/email/generative AI/affiliates) | the god-view for site picking: category map, climbers/fallers, per-channel slices ("who is eating generative-AI traffic" is just a tab) |
| AI traffic | #/digitalsuite/ai-traffic/overview/*/999/6m?webSource=Total | **CORRECTED 2026-08-30 — this row's "empty state" was WRONG**: the URL was missing `&key=<domain>`. With the key it is a real table + 2 charts + 22 AI platforms. See <similarweb-round4-capabilities> row 18. | table | who gets AI referrals, per AI platform per landing-page URL |
]]></routes>

<rankings-mechanics>
- **Industry slug is guessable**: readable, `~`-separated levels
  (`Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design`);
  a guessed slug deep-linked successfully with no hash drift.
- **Page jump is direct**: the paginator ("N out of 100") is an `input` — type
  a page number + Enter and it jumps (verified page 5 → rows 401–500 with real
  long-tail data). Deep probes for `[class*=pagination]` find nothing; the
  pixel witness located it first.
- **Country change MUST go through the UI**: 999=worldwide, US=840 in the hash
  segment, but editing the hash segment directly gets silently rewritten back
  to 999. Use the header country dropdown (shadow DOM — semantic `find` fails,
  deep `.click()` works); after the UI switch the URL contains /840/ and is
  copyable.
- On the industry tree, `click --text` lands on the first clickable item, not
  the named one — deep-link the slug instead.
- The main board produces **no cells** (column-major DIVs), so `cells &gt; 0`
  is not a readiness criterion here — that is what the collector's
  `--ready-text` branch is for; the main scrollbar lives in an inner div
  (`.sw-layout-scrollable-element`, window scrollY stays 0), which is what
  `--scroll-container auto` handles, and chart animation keeps screenshot md5
  changing forever — a census-stable/shot-unstable stop is the honest outcome,
  not `stable`.
</rankings-mechanics>
</similarweb-explore-capabilities>

<similarweb-round3-capabilities date="2026-08-30">
<summary>
**Route capability map, round 3 — the whole Keyword Research group (14
sub-pages), Audience Overlap (3-domain), and Referrals incoming/outgoing.
17 routes, double-witness, 2026-08-30.** Session `similarweb-nav`, the
machine-level `tools-share-similarweb` lock held for the entire round,
one <ref file="scripts/ground-truth.mjs"/> run per route. Judge's write-up:
`backlink/evidence/ground-truth/similarweb-round3-VERDICTS.md` (local,
gitignored). Markdown manual for every judged route lives in
`platforms/similarweb/` (repo root) — read that first when you actually
need to collect. Quota note: the previous night's web-quota lockout
(explore2: &lt;3s bounce back to dash, reason only in `document.referrer`
as `gmitm.redirect.dash?msg=…`) had fully reset by this round; web quota
and the panel card's "API quota" are two separate pools.
</summary>

<routes><![CDATA[
| # | route (hash on sim.proxy.example.com) | shape | readyBranch | measured scale |
|---|---|---|---|---|
| 1 | KW home #/organicsearch/websiteanalysis/home | search box + recents + keyword-list cards (no table/svg) | null (machine-blind, exit 2) | 13 sub-page nav; 5 recent domains; 16 keyword lists |
| 2 | Keyword overview #/digitalsuite/acquisition/keyword/organic/search/999/<YYYY.MM-YYYY.MM>/overview_2?keyword=<kw> | metric cards + SERP-composition ring + trend + top sites/URLs/related | chart (svgText 48, 21s) | image editor: volume 312.6K, clicks 262.2K, zero-click 31%, KD 95, CPC $0.01–6.52 |
| 3 | SERP players …999/28d/keywordAnalysis_2?keyword=<kw> | stacked area + 170-domain DIV board (cells=0) | chart | domains (170); canva 44K / 29.20% / ↓11.65%; has "keyword gap" entry |
| 4 | Keyword pages …999/<months>/trafficAnalysis_2?keyword=<kw> | total/organic/paid tabs + stacked trend + URL board | chart | canva.com/photo-editor weekly avg 11.5K; long tail to <50 |
| 5 | Search ads (keyword) …999/<months>/ads?keyword=<kw> | REAL table: ad copy + clicks + change + domain + landing page | table (filled 120) | ads (849); canva 220 / 2.86% / +266% |
| 6 | SERP snapshot …840/<months>/serpsnapshot?keyword=<kw> | SERP-feature cards + 29-position DOM list (no table/svg) | null (exit 2 = blind, data present) | 29 results + movement (canva #1 ↑1); features Video/Related |
| 7 | Keyword generator #/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&tab=phraseMatch&keyword=<kw> | 4 tabs (phrase/related/trending/questions) + 100-row/page DIV board | null (exit 2 = blind) | phrase 3,722 / related 280,240 / questions 139; total traffic 2.236M; ai image editor 293.1K |
| 8 | SEO overview #/organicsearch/pageAnalysis/seo-overview/<domain>/999/3m?webSource=Total&vennDiagramSourceType=Total&key=<domain> | summary cards + intent split + ranking opportunities + keyword-gap venn (auto-adds competitors) + top words/pages | table (filled 40) | keywords 2.8M, pages 109K; opportunities 16.7K / losing 1.4M / winning 269.5K |
| 9 | Site keywords #/organicsearch/pageAnalysis/website-keyword-v2/<domain>/999/3m?webSource=Total&selectedPageTab=Total&key=<domain> | REAL 13-column table (KD/intent/CPC/zero-click/position/SERP features) + opportunity cards | table (filled 1,597) | keywords (2,827,877); canva 236M / 61.83% / KD80; long-tail opportunities 406,744 |
| 10 | Keyword clusters #/digitalsuite/acquisition/websiteanalysis/topics/<domain>/999/<months>?webSource=Total&selectedPageTab=Total&key=<domain> | REAL table, cluster board | table (filled 120) | clusters (1,813); Canva 240 words 7.3M clicks |
| 11 | Landing pages #/organicsearch/pageAnalysis/landing-pages-v2/<domain>/999/<months>?webSource=Total&selectedPageTab=Organic&key=<domain> | URL board (DIV) + trend | chart (svgText 300) | URLs (80,276); canva.com homepage 167.2M / 44.13% |
| 12 | Search competitors #/digitalsuite/acquisition/websiteanalysis/website-competitors/<domain>/999/3m?webSource=Total&selectedPageTab=Organic&key=<domain> | scatter (overlap score × organic visits) + 1,500-domain board | chart | domains (1,500); adobe/picsart/iloveimg/pixlr… |
| 13 | Ranking distribution #/organicsearch/pageAnalysis/ranking-distribution-v2/<domain>/840/<months>?webSource=Total&key=<domain> | position-summary bars + 142,895-word DIV board | null (exit 2 = blind) | 1-3: 37.5K / 4-10: 49.6K / 11-20: 29K / >20: 26.8K |
| 14 | Website search ads #/organicsearch/pageAnalysis/website_ads/false/999/<months>?webSource=Desktop&selectedPageTab=Text&key=<domain> | REAL table, ad-copy board | table (filled 180) | ads (49,953); QR ad 7K clicks / $1.26 |
| 15 | Audience overlap #/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&key=<d1>,<d2>,<d3>&selectedTab=overlap | 3-circle venn + shared-audience matrix + trend + exclusivity bars | chart (svgText 33) | canva 214.7M / figma 15.39M / adobe 183.6M; total unique 371.3M; canva∩adobe 16.6% = 35.61M |
| 16 | Referrals incoming #/digitalsuite/websiteanalysis/referrals/*/999/1m?webSource=Total&selectedTab=incomingTraffic&key=<domain> | metric cards + industry/topic split + 2,329-domain 100-row/page board | chart (svgText 15) | referral visits 227.9M; linking sites 2,329; bit.ly 8.77% |
| 17 | Referrals outgoing (same, selectedTab=outgoingTraffic) | same structure | null (exit 2 = blind) | outgoing visits 59.7M; destination domains 866; google.com / chatgpt.com / youtube.com on top |
]]></routes>

<url-template-laws>
Three template rules worth the whole round:
1. **Keyword context travels in `?keyword=&lt;url-encoded term&gt;`** — the path
   segment `/keyword/organic/search/` is a fixed literal. Rewriting the path
   segment with the term gets a SILENT redirect to
   `ai-brand-visibility/home`; the collector's hash-prefix self-check judges
   it hijacked (exit 3) — a real hijack was recorded this round proving the
   defense fires.
2. **Site-context cold deep links MUST carry `&amp;key=&lt;domain&gt;`.** Putting the
   domain only in the path segment lands on the "enter a query to see this
   report" empty state (path segment ignored on cold load). After landing,
   the panel expands key into `pageFilter=[{"url":…}]`.
3. **Audience-overlap `key=` accepts comma-separated multi-domain**
   (`key=a,b,c&selectedTab=overlap`, lowercase tab name) — one deep link is
   a full 3-site comparison, no UI adding. Comparison tools' "must feed the
   full input set" rule is satisfied in the URL itself.
</url-template-laws>

<lesson id="mirror-jitter-vs-empty-vs-paywall">
**Three failure shapes on sim.proxy.example.com that must never be confused** (mirror
jitter confirmed by the user 2026-08-30, same error page refreshed into full
data on the Semrush side too):
- **Mirror jitter / cold SPA shell**: blank page, a few-dozen-byte empty
  response, or the "出错了…请稍后重试" error component. The top document can
  sit at ~258 nodes / body 0 chars with five 0×0 hook iframes for 60s+.
  `location.reload()` heals it in one shot — the collector's stall-refresh
  branch saved two routes this round. Only after **3 consecutive reloads
  still broken** do you note it for re-measure. Unrelated to quota.
- **True empty state**: svgText=0 AND no data anywhere in deepText, with no
  "no data" copy to grep for (marker-based detection fails; see the Semrush
  email lesson).
- **Fake paywall**: an upgrade modal — on this stack usually your own URL's
  fault, not the plan's.
Also: `body.innerText` is NEVER a hydration criterion here — a hydrated page
can show 1,072 light-DOM chars while deepText holds 1.6M inside 3 shadow
roots. Judge hydration by deep-penetrating counts only.
</lesson>

<lesson id="round3-machine-blind-routes">
**5 of 17 routes are machine-blind to all three readiness branches**
(#1 KW home, #6 SERP snapshot, #7 keyword generator, #13 ranking
distribution, #17 outgoing referrals): search-box or DOM-list page types
where cells=0 and svgText=0, so the collector exits 2 on budget. **On these
page types exit 2 does not mean "empty" — it means "the instrument cannot
see".** The data is fully present in deepText and pixels; grep deepText for
the numbers and have the AI read the shots. Same family as the Semrush
competitor-monitoring lesson, but lighter: deepText is greppable here, so
half the verdict can still be automated.
</lesson>

<lesson id="round3-misc-traps">
- **The panel silently rewrites URL segments**: country 999→840 (clusters /
  ranking distribution auto-jump to US), duration 1m→6m (incoming
  referrals). Hijack detection compares only the first 3 hash segments so no
  false alarms, but **record URL templates from the landed href**, not from
  what you typed.
- **`sanitizeUrlString` strips `keyword=` / `key=` VALUES from census
  hrefs** (the `key` sensitive-param rule keeps the key name, drops the
  value). Verdicts are unaffected (the path identifies the route), but when
  auditing keyword context read the manifest's `targetUrl`/`url`, not census
  hrefs.
- **Generator's Amazon/YouTube dictionaries: "not verified" ≠ "does not
  exist".** The dropdown exists in the UI, but `searchEngine=amazon` as a
  cold deep link lands on the error page and synthetic events could not open
  the portal dropdown. Next attempt: real CDP click, or switch once in the
  UI and copy the URL.
  **→ SETTLED 2026-08-30 (round 4): a real CDP click opened the dropdown on
  the first try, and it enumerates EXACTLY TWO options, Google and YouTube.
  Amazon is not "unverified" — it does not exist on this account/build
  (DOM enumeration + screenshot). YouTube is real and fully collected.**
- Typeahead dropdowns: React controlled inputs need the native value setter
  + input event; option clicks need the full
  pointerdown→mousedown→pointerup→mouseup→click sequence.
</lesson>
</similarweb-round3-capabilities>

<similarweb-round4-capabilities date="2026-08-30">
<summary>
**Round 4 closes the four gaps round 3 left open: the generator's
Amazon/YouTube dictionaries, `monitorkeywords`, the rankings industry picker,
and AI Traffic — which turned out to be a WRONGFUL CONVICTION.** Session
`similarweb-nav`, machine lock `tools-share-similarweb` held per run, one
<ref file="scripts/ground-truth.mjs"/> run per route; the manual probing (CDP
dropdown clicks, industry search box) ran inside a scratchpad script that
acquired the same two locks first and released on exit. **Read-only
throughout**: nothing exported, no list created, no workspace created, no
subscription, account untouched — `monitorkeywords`'「+ 创建新列表」was
photographed, never clicked. Judge's write-up:
`backlink/evidence/ground-truth/similarweb-round4-VERDICTS.md` (local,
gitignored). Markdown manuals: `platforms/similarweb/ai-traffic/`,
`.../keyword-research/keyword-generator-youtube/`, `.../keyword-lists/`,
`.../rankings/industry-picker/`. Quota probe before any collection: landed on
the target route and was still there 12s later, `document.referrer` carried no
`gmitm.redirect.dash?msg=` — **web quota available**, no lockout this round.
</summary>

<routes><![CDATA[
| # | route (hash on sim.proxy.example.com) | shape | readyBranch | measured scale |
|---|---|---|---|---|
| 18 | AI Traffic #/digitalsuite/ai-traffic/overview/*/999/6m?webSource=Total&key=<domain> | total card + stacked split + area chart w/ 22-platform checklist + REAL table of chatbot landing pages | table (cells 105 / filled 100, svgText 16; ready in 2 polls) | openai.com 6m: total 275.2M, AI share 23%, ChatGPT 96.08%; 22 AI platforms; 999 URLs / 20 per page / pager 1 of 50 |
| 19 | Keyword generator · YouTube …/keyword-generator-tool/999/28d?searchEngine=youtube&keyword=<kw>&webSource=Total&isWWW=*&tab=phraseMatch | 12-month YouTube trend line + 2 tabs + 5-column board (关键字/规模/流量趋势/点击量/热门国家 地区) | chart (svgText 18, 21s) | `ai image editor`: phrase 106 / related 3,465 — two orders of magnitude below the Google dictionary, which is normal |
| 20 | Keyword lists #/digitalsuite/acquisition/monitorkeywords/home | REAL 4-column table (关键词列表 (11) / 关键词 / 持有人 / 最近修改) + 3 tabs + search box | table (cells 60 / filled 44, stable) | 11 lists, account-level page, NO domain/keyword context params |
| 21 | Rankings industry picker #/digitalsuite/markets/webmarketanalysis/home | auto-opening search overlay 「行业 (217)」 over an EMPTY report shell (9 channel tabs) | **null, stopReason=budget, exit 2 — and NOT empty** | 217 industries (26 top categories + children) all present in deepText |
]]></routes>

<ai-traffic-reversal>
**A verdict is being overturned here, so it is stated explicitly.** Round 3
recorded AI Traffic as "empty state awaiting a domain query". **That was
wrong.** The page is not empty and the behaviour is not domain-dependent — the
URL was simply missing `&amp;key=&lt;domain&gt;`. With the key supplied it is the
richest route of the round: a real table plus two charts plus 22 AI platforms
broken out.

Consequences, both of them general:
1. **"Empty state awaiting input" is never a verdict that may be archived.**
   It only says the URL did not carry full context. Every old record closed
   with「空态」must be re-measured once with `&amp;key=` before it is believed.
2. **"Cold deep link lands on an error/empty page" has two causes, and round 3
   collapsed them into one**: (a) the parameter VALUE is not in the enum — the
   feature genuinely does not exist; (b) a required context parameter is
   MISSING — the feature is there and the URL is wrong. **Discriminator: first
   enumerate the UI's own dropdown.** In the enum → (b). Not in the enum → (a).

The same discriminator settles the generator's dictionaries. A real CDP click
on `[class*=GeneratorTypeDropdownContainer] button` opened the engine dropdown
first try (`click_method: "cdp"`, `hit: "target"`); piercing shadow DOM
enumerated **exactly two option rows: `Google` and `YouTube`**, and the
screenshot shows the same two and nothing else. So **Amazon is case (a):
「本账号/本构建不提供」, backed by DOM enumeration plus a screenshot — not
"unverified"**, which is what round 3's `round3-misc-traps` had to say. YouTube
is real, fully collected, and its URL survives a cold deep link unchanged.
</ai-traffic-reversal>

<rankings-industry-picker><![CDATA[
The picker page is NOT an industry tree page. It is a search overlay over an
empty report shell, and its only purpose is to learn a slug you do not know.

  1. if the overlay is not already open, CDP-click [class*=CategoryItemWrapper]
     (the 「行业无效 / 不适用」 block in the page header)
  2. type into input.sc-ligLZB — the overlay's only placeholder-less input.
     The list filters live and the label counts down 行业 (217) → 行业 (1).
     Result rows are BREADCRUMBS: 计算机电子技术 > 多媒体图像和网站设计
  3. CDP-click the result row [class*=sc-bACmPo] --nth 0
     (without --nth the CLI refuses with matches_n: 3)

Landing URL actually observed:
  #/digitalsuite/markets/webmarketanalysis/mapping/
    Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design/840/1m?webSource=Total

  slug levels joined by `~`, exactly the shape round 2 guessed.
  *** THE COUNTRY SEGMENT LANDS AS 840 (US), NOT 999. ***
  The panel remembered the country last picked in the UI and wrote it into the
  new URL — one more confirmation that URL TEMPLATES ARE RECORDED FROM THE
  LANDED HREF, never from what you typed.

Practical rule: never run these three steps to collect. Go straight to the
mapping deep link with a known slug. Run them once, only when the slug for
some industry is unknown, and copy the landed href.

Semantic clicking stays useless on this tree (`click --text 行业无效` →
semantic_not_found). A bare `open` hit a white shell once; one
`location.reload()` healed it (mirror jitter, not a block).
]]></rankings-industry-picker>

<lesson id="round4-exit2-is-not-empty-again">
The rankings picker is the **sixth** instance of `round3-machine-blind-routes`
and the cleanest: cells=0 and svgText=0 are *correct* (the page has neither a
table nor a chart), `deep.textLength` = 1,600,394, and deepText holds all 217
industry names. The two automatic stall-refreshes were the stall branch
spinning on a page that has nothing left to hydrate — **it will never move,
because it was already finished.** The right reading of exit 2 on this page
type is "grep deepText", not "raise the budget".
</lesson>

<lesson id="round4-cdp-click-is-the-real-click">
**A dropdown that synthetic events cannot open opens under a real CDP click:**
`opencli browser &lt;session&gt; click &lt;css-selector&gt;`. Verify the return body —
only `click_method: "cdp"` **plus** `hit: "target"` counts as landing on the
element you meant; `click_method: "js"` or `hit: "other"` means it fell onto
something else, so move the selector inward or outward and retry. Multiple
matches require `--nth`, or the CLI reports `matches_n: N` and refuses. Round
3's failure to open this same dropdown was a synthetic-event failure, not a
permission problem; `--text` semantic targeting remains unreliable on this
site.
</lesson>

<lesson id="round4-remaining-unknowns">
Recorded as unverified, which is not the same as "does not exist":
- **The YouTube dictionary's second tab** (相关关键词) — its `tab=` value is
  unknown; this round only ever landed on `tab=phraseMatch`. Switch it once in
  the UI and copy the URL; do not guess by analogy with the Google dictionary,
  whose tab set (4 tabs) is different anyway.
- **AI Traffic was measured on exactly one domain** (openai.com). The mechanism
  (missing `key=` produces the empty state) is URL-level and domain-independent,
  but "every domain has AI-traffic data" has no second data point behind it.
- `monitorkeywords` reports **11 lists**, while round 3 read「关键词列表 16」off
  the KW home page. Different counters; the page's own header `(11)` wins.
</lesson>
</similarweb-round4-capabilities>

<other-drivers>
<driver name="agent-browser" verdict="no logged-in identity, ever">
It attaches over CDP, and CDP cannot reach the owner's Chrome: Chrome 136+
silently ignores `--remote-debugging-port` on the default user-data-dir
(verified on 151 — the flag is passed, no port is opened), and macOS TCC blocks
copying the profile out. Relaunching Chrome is wasted effort; do not suggest it.
Its `--profile` means a separate directory you log into once, unrelated to the
owner's sessions. Use it only for tasks needing **no** logged-in identity, and
address tabs by `--label`, never by the `t1`/`t2` positional index, which is a
shared namespace across agents.
</driver>
<driver name="Claude in Chrome" verdict="single agent, ad-hoc, prefer OpenCLI anyway">
It reaches the owner's Chrome but has no isolation boundary of any kind: one
flat tab group shared by every concurrent agent, and omitting `tabId` resolves
to "first tab in the shared group". It also has a reproducible bug where closing
one of your own tabs tears down your session's tab-group tracking and orphans
the rest. It is Claude-only, so anything built on it cannot be replayed from
another runtime.
</driver>
</other-drivers>

<preflight>
<cmd>node scripts/health.mjs</cmd>
Run before browser work. Use `--check-update` only when the user asks about
versions; an available update is informational, and upgrading OpenCLI needs a
separate request.

Read <ref file="references/safety-policy.md"/> before any fill, submission,
account, or logged-in operation.

Confirm ownership rather than assuming it:
<cmd>opencli browser "$SESSION" tab list   # should show only your own tab</cmd>
</preflight>
