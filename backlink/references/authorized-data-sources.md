# Authorized backlink data sources

Use this reference for logged-in research surfaces.

## 哥飞社区的众筹外链榜（可脚本刷新）

`new.web.cafe` 上有一场**征集型悬赏**「网站上线之后，你会去哪些地方提交外链？」
（`/ask/bounty/wlhmhdaoqg`），162 人提交、汇成一个 **588 条**的按票排序榜单，
**每条还带提交者写的理由**（免费/付费、价格、能不能被 GSC 收录、有没有真实流量）。
这是一份**众人真金白银试过之后投票投出来的**外链目标清单，
比任何一份「100 个外链平台」的博客汇总都可信。

刷新它不需要人肉抄：

```bash
node ../../rankup/scripts/webcafe-forum.mjs bounty wlhmhdaoqg \
     --transport browser --json --out board.json
```

**三件必须知道的事：**

1. 内容在 `collect.board[]`，**不在 `answers[]`**。只读 answers 会得到「0 条答案」
   ——不报错、不为空，就是答错了数组。
2. **匿名拿不到**：`board` 会是空数组（HTTP 仍是 200）。必须 `--transport browser`。
3. 榜单要到状态 `open`（已开榜）才可见；`collecting` 阶段登录也是空的。

字段与全站接口地图见 [`../../rankup/references/webcafe-forum.md`](../../rankup/references/webcafe-forum.md)。
**注意那是只读的**——脚本对该站只发 GET，绝不解锁/支付/提交。

**2026-09-09 把整张榜单打回数据集**：`submission-targets.json` 的 target 定义和
`paid-platforms.json` 的每个平台条目上都可以带 `communityBoards[]`——每条记
`board`（榜单 id，这份榜单固定是 `webcafe-bounty-wlhmhdaoqg`）、`rank`（按票排
序的名次）、`votes`（票数）、`submitterNote`（提交者理由原文，多人重复提交时
合并去重，截断到 500 字）、`boardUrl`（帖子本身）、`boardEntryUrl`（榜单条目里
写的原始 URL）、`capturedAt`（抓取日期）。它只是「多少人推荐在这提交」的排序信
号，不是外链证据——不能替代 `evidence`/`status` 该有的探测。取数走本节前面的
`webcafe-forum.mjs bounty wlhmhdaoqg --transport browser --json`；回写时按域名
（不带 scheme/www）匹配已有条目追加 `communityBoards`，榜单里有但数据集没有的
域名，按 `status: "unverified"` 补一条新 target（`sourceList` 仍写
`"web.cafe bounty wlhmhdaoqg"`），解析不出域名或不是外链平台的条目（纯描述性
文字如「导航站」「各种可以带链接的论坛」）不硬塞，弃掉。


## Tools Share dashboard

Entry point, hardcoded because it is a public URL and every owner of this Skill
lands on their **own** account there:

```
https://dash.3ue.co/zh-Hans/#/page/m/home
```

`TOOLS_SHARE_DASHBOARD_URL` still overrides it, for anyone on a different panel.
There is nothing secret in the URL — the account lives in the browser session,
so a reader of this file gains nothing without the owner's logged-in Chrome.

Tools Share is a **shared-account proxy**: it holds one paid subscription and
lends it out through its own origins. As measured 2026-08-19 the panel carried
two SEO cards, and the card labels describe the *plan*, not the product:

| Card label on the panel | What it actually launches | Origin |
| --- | --- | --- |
| `🔖 PRO 全球版` | Similarweb PRO | `https://sim.3ue.co` |
| `🔖 GURU 地区数据库` | Semrush GURU | `https://sem.3ue.co` |

So the mapping is not guessable from the label — verify the landed origin
rather than trusting the card text, which is what `tools-share-open.mjs` does.

⚠️ **`sem.3ue.co` is the ONLY authorised Semrush base, and typing the wrong host
fails SILENTLY onto a sales page.** Measured 2026-08-29: a deep link built on
`www.semrush.com/analytics/traffic/...` **does not error**. It renders a
skeleton, bounces to `/analytics/traffic/` — the **public marketing page**
(`innerText` 514, 10 images, title
`Traffic Analytics: Estimate Any Website's Traffic | Semrush`) — then bounces
again to overview. **A scanner will record "no table, has svg, has export
buttons" off a sales page and file it as a finding about your target.** After
those bounces the tab was sitting on **`mmradar.gg`**'s domain overview (23
filled cells, AS 22, organic 23.9K), so any probe reading `cells > 0` at that
moment files someone else's numbers under your domain. Assert **landed path ==
requested route** and **header domain == requested target** before classifying
anything — see <law-ref id="readiness-must-bind-to-this-query"/> and
`scripts/lib-report-readiness.mjs`.

### Use the script, not hand-driven clicks

```bash
node scripts/tools-share-open.mjs --tool semrush
node scripts/tools-share-open.mjs --tool similarweb
node scripts/tools-share-open.mjs --tool semrush \
  --goto '/analytics/backlinks/referring-domains/?q=example.com&searchType=domain'
```

It opens the panel in a named background OpenCLI session, picks the card by
matching its label, clicks `打开`, polls until the expected origin appears, and
prints the subscription expiry and today's quota. It **never types a password**:
a logged-out panel is an error telling the owner to sign in themselves.

### 节点：会挂，而且必须在点「打开」之前选

每张卡片上有一个**节点选择器**（`节点1`…`节点N`），面板是 Angular + Nebular，
结构是 `<nb-select>` 里一个 `button.select-button` 触发，选项是 `<nb-option>`。

```bash
node scripts/tools-share-open.mjs --tool similarweb --node 5
```

四条实测规则：

1. **节点会挂，而且挂的样子很像脚本坏了。** 挂掉的节点点「打开」之后，工具页落到一个
   空白页或者长时间不渲染（`bodyText` 为空、标题却是对的）。这时**先换节点**，
   不要去调选择器、加等待、怀疑登录态——那些都不是原因。
2. **选节点必须在点「打开」之前。** 点完「打开」标签页就跳到工具域了，
   那边一个 `nb-select` 都没有。（这个顺序错误的症状是 `Seen: []`，
   读起来像「面板上没有节点选择器」，实际是你已经不在面板上了。）
3. **倍率越高，配额消耗越快**（面板自己的提示原文）。没有特别理由就用 `X 1` 的节点。
4. **卡片上的产品名是 logo 图片，没有文字。** 想按卡片文案定位卡片会失败；
   产品名真正出现在节点选择器自己的文案里（`节点3 倍率 X 1 🔖 PRO 全球版`），
   所以直接在 `nb-select` 列表里按 label 挑。

### 会话会停在工具 origin 上

**硬规则（2026-08-26 用户现场发现）**：同一任务、同一工具从头到尾固定一个 session；
零值或异常复查仍复用它，整批完成后只 `close` 一次。每次重新打开 dashboard 都可能被平台
计作新的客户端登录。共享启动器已增加 `existing-tool-session` 快速路径，但调用脚本仍必须
显式传同一个 `--session`，不能靠默认名碰运气。

点过一次「打开」之后，这个 OpenCLI 会话的标签页就留在 `sim`/`sem` 那边了。
**再 `open` 面板不保证把它导航回来**，`close` + 重新 `open` 实测也可能救不回来。
脚本已经在 `open` 之后核对当前 host，两次都不对就直接报错并指路，
而不是带着一个读不到面板的会话继续跑。

会话名之间的隔离本身是好的——三个不同 session 名实测拿到三个不同的 `page` id，
互不干扰。所以遇到这种情况，**换一个 `--session` 名重跑**是最省事的解法，
或者干脆在所有者的 Chrome 里手工走一遍：打开面板 → 在那张卡上选节点 → 点「打开」→
在落地的那个标签页里继续操作。

### Three things that will waste an hour if you do not know them

**The launcher is what mints the session.** Navigating straight to
`https://sem.3ue.co/analytics/...` before clicking `打开` lands on
**`about:blank`** — not an error page, not a redirect to a login, just blank.
Launch first, then navigate inside the established session (`--goto` does
exactly this). A blank page here means "no session yet", not "the tool is down".

**The launch URL carries a session token** as a `__gmitm=` query parameter.
Never log it, never paste it into a file, never commit it. Strip the query
string before printing any URL from these origins.

**The subscription is short-dated and the panel says so.** The instance measured
on 2026-08-19 had **2 days left** (expiry `2026-08-20 21:56`) with per-tool daily
quotas at 2% and 15%. Read `到期时间` / `剩余天数` / `API 今日配额` off the panel
before planning a campaign around this data source; the script returns all three
and warns at 7 days or fewer. Plan the pull around the expiry, not the other way
around.

### Similarweb role

Use Similarweb to:

- discover similar and competing domains;
- estimate traffic/channel mix;
- compare geographic and topical fit;
- prioritize which domains enter backlink research.

Do not treat estimated traffic as proof of link quality or causal SEO impact.

Use `scripts/similarweb-query.mjs` for repeatable domain research through this
owner-authorized session. It performs DOM-based navigation and readiness
polling; it does not use screen coordinates or expose session cookies.

```bash
node scripts/similarweb-query.mjs --domain example.com --report performance \
  --out .backlink/similarweb-example.com.json
```

The app can take 20–60 seconds to initialize. A completed report with N/A or no
similar sites is evidence of sparse Similarweb coverage, not a script failure.
Traffic, rank, channel, and competitive-site values remain directional and
time-sensitive.

**Scope evidence, direction fields, and coverage (2026-09-13 audit fix).** The
report page's own "变动" (change) columns encode up/down through an SVG icon
plus color, not through any arrow character in the text — reading only the
text used to make every change value come out non-negative. `clicksChangePercent` /
`rankChangePercent` / geo `changePercent` are now `null` with a sibling
`...DirectionUnknown: true` flag whenever the direction can't be resolved from
text glyphs or the DOM hint (`data-icon` / computed color) captured alongside
it — never silently defaulted to positive. The same-tab session can also carry
a stale date-range window over into the next navigation even though the
request asked for a different one; every report now returns a `scopeEvidence`
object (`windowLabel`, `windowRequested`, `windowMatchesRequest`,
`windowUnverified`, plus country/device observation flags) built from what the
page itself renders, cross-checked against the navigation's own landed-route
evidence (`navRouteWindow`).

**A confirmed window mismatch stops the query outright (2026-09-13 second
review), it is not just noted and passed through.** `similarweb-query.mjs`
detects this the moment the report settles (no extra waiting, and no reliance
on a timeout) and reports `status: "scope-mismatch"` with a non-zero exit
code; the parsed values are moved to `unconfirmedMetrics` / `unconfirmedGeo` /
`unconfirmedKeywords` instead of the normal fields, so a caller that only
checks the normal fields for presence cannot mistake widened-window data for
the requested window. `similarweb-batch.mjs` marks only the affected JSONL row
this way (`stopReason: "window-scope-mismatch"`, values under
`unconfirmedTotalVisits` etc.) — other domains in the same run are unaffected,
and because that `stopReason` is not in the resumable-complete set, a later
`--domains-file` run retries it automatically. `similarweb-keywords.mjs` does
the same per seed (`unconfirmedRows` instead of `rows`). Since Similarweb
legitimately widens a small site's window on its own, all three scripts accept
`--accept-window-fallback` to treat the rendered window as authoritative and
proceed normally (still labelled, via `status: "ok-window-fallback-accepted"`
and a `windowActual` field, so it is never confused with a request that
matched outright). Anything that could not be independently confirmed but was
not a confirmed mismatch — window text unreadable, the "全球"/"所有流量"
selector text unreadable, `audience-geo`'s row-count-vs-header-total check
inconclusive, or the (currently unconfirmed) loading-indicator DOM check —
surfaces as `status: "ok-unverified"` plus a `warnings` array naming each
unverified dimension, and a non-zero exit code, rather than looking identical
to a fully-confirmed `"ok"` result. The audience-geo tab has no country
selector at all, so `country` in its URL is a positional parameter only;
`scopeEvidence.countryApplicable` is `false` for that report and is not the
same signal as "unverified". Table-shaped reports (`audience-geo`,
`site-keywords`) also carry `rowsExpected` / `rowsCaptured` / `truncated` so a
caller can tell a fully-read table from one still batching in more rows; when
the page's own row total can't be parsed, that is reported as
`rowsCompletenessUnverified` (feeding into `ok-unverified`) rather than
treated as confirmed-complete.
Output additionally carries a static `notCovered` list of report sections the
scripts do not extract yet (chart panels, some audience tabs) — see
`similarweb-query.mjs`'s `NOT_COVERED` map for the current list and reasons.

**2026-09-13 second review, confirmed by live DOM (not inference).** The
"变动" (change) direction turned out to be **two distinct real mechanisms**,
not one mechanism guessed two ways: the `.swReactTable-column` family
(`audience-geo`, and the `channels` report's newly-added detail table,
`channelDetail`) marks direction via a wrapper `div.changePercentage` class
(`positive`/`negative`) with no SVG involved at all; the Ant Design row table
(`site-keywords`) carries a precise signed ratio in
`[data-automation="cell-value"]`'s `data-automation-value` attribute, with an
`.SWReactIcons[data-automation-icon-name]` ("arrow-up"/"arrow-down") and an
icon fill color (`#4FBF40` up, `#FF442D` down — both directions now confirmed,
not just the "red = down" half) as fallbacks; a `"NEW"` value
(`data-automation-value="New"`, a keyword with no prior-period data) is a
third state, not a placeholder and not an unresolved direction. The
`.app-loader`/`.sw_loader`/`.first-time-loader` classes present in the DOM
turned out to be a one-time account-onboarding overlay unrelated to report
loading (zero-size once past first boot); `audience-geo` and `channels` were
specifically tested for a per-table loading indicator and confirmed to have
none, so `loadingIndicatorUnverified` no longer applies to those two —
`site-keywords`'s main table still carries it (untested this round). Its 5
stat cards (`statCards`: Cannibalization / long-tail / SERP-opportunity /
high-traffic / low-potential) do have a confirmed per-card signal instead
(`data-automation-button-loading`), extracted via `deriveSiteKeywordStatCards`.
Full live-DOM notes: see the `similarweb-live-dom.md` scratchpad referenced in
the corresponding session record.

**2026-09-13 third review (fully offline, no browser).** Three new report
values reuse the confirmed structures above: `--report audience-interests`
(the "cross-visited sites" table, same `.swReactTable-column`/mechanism-A
framework as `audience-geo`), `--report audience-overlap` (a text block, not a
table — "average unique visitors" per site plus a total), and
`--report audience-demographics` — the last one is deliberately thin: the one
live sample for that tab had incomplete data, so instead of a full extractor
it ships a three-way signal (section title found / confirmed empty text
observed / neither) and is documented as low-confidence rather than pretending
otherwise. Also fixed: `suspectColumns:["点击量"]` on `site-keywords` traced to
a real bug — the clicks/share cell regex didn't accept the `< 0.01%`
below-threshold form Similarweb uses for long-tail rows (over half of a real
75-row page), so the whole column was mis-flagged; fixed and regression-tested.
Same live-run's "LOST" value (a keyword that dropped out of rankings — the
mirror of `"NEW"`) was found miscounted as a parse failure; also fixed.
**Scroll-to-bottom, requested but not yet confirmable:** unlike a known Semrush
issue where a report requires scrolling all the way down before every section
loads, four already-completed live runs of `similarweb-query.mjs` (no scroll
code existed) captured full bottom-of-page content on the first read —
evidence, not assumption, that these specific pages don't gate content on
scroll position. As a defensive measure anyway, every table-shaped report now
attempts a generic scroll-to-bottom (window plus any element that looks
internally scrollable) and reports what it found in `scrollEvidence`, but
because the real scroll container was never confirmed live, that evidence is
**not** wired into the pass/fail gate — a wrong guess there would turn four
currently-reliable reports into reliable timeouts instead. Consistent with
this file's "never claim confirmed without evidence" rule, those reports
carry `scrollUnverified: true` unconditionally until a live session confirms
the mechanism, which keeps `status` at `ok-unverified` rather than `ok` even
when everything else checks out.

**2026-09-13 fourth review (live, Chrome exclusive; ≤6 verification runs on
howolddoyoulook.com plus one read-only comparison-domain check, not persisted
in this repo).** The real scroll container is now confirmed:
`.sw-layout-scrollable-element` (non-hashed class, present on
performance/audience-geo/audience-interests/channels), not `window` — this
layout's `window.scrollY`/`document.documentElement.scrollHeight` are always
pinned to the viewport height, so a window-based bottom check would always be
a false positive. `SCROLL_TO_BOTTOM` now scrolls that real element and records
`{containerFound, containerSelector, scrollTop, scrollHeight, clientHeight,
atBottom, hidden, visibilityState}` on every poll into a new `scrollTrace`
array (plus the final read's `scrollEvidence`), following the same shape as
`lib-semrush-overview.mjs`'s scroll instrumentation (read-only reference, not
copied). **This still stops short of a hard gate.** Direct evidence (fresh
tab, zero scroll, `hidden: true`) showed full bottom-of-page content already
present on two pages — the opposite of Semrush's IntersectionObserver-gated
case — and no hidden-vs-visible controlled experiment could be run this round
(the exploration tool's tab is permanently `document.hidden === true`,
unaffected by `open -a`/`osascript activate`). So `scrollUnverified` stays
unconditionally `true` for the same four gated reports — not because the
selector is unconfirmed (it is), but because the causal claim "hidden tabs
block this specific page's lazy content" has real counter-evidence and no
controlled test yet. What *did* ship as a genuinely low-risk, evidence-aligned
change: `windowMode` now forces `foreground` for
`audience-geo`/`channels`/`audience-interests`/`site-keywords` regardless of
`--window`, matching the Semrush precedent on the same `launchTool`
infrastructure. A production run of `--report audience-geo` this round (real
`opencli`-driven Chrome, not the exploration tool) recorded `scrollTrace` with
`hidden: false, visibilityState: "visible", atBottom: true` on every poll —
one supporting data point that forcing foreground does yield a visible tab in
production, still not a substitute for a real A/B.

**site-keywords loading indicator: confirmed, no longer a candidate.**
`.ant-spin-spinning`, `.ant-table-placeholder`, and `[aria-busy="true"]` were
caught firing together with `rows: 0` mid-load and clearing together once
`rows > 0`; this is now wired into the read loop as a real blocking gate
(a fingerprint read returns `null` — "keep polling" — while any of them is
present), and `loadingIndicatorUnverified` no longer applies to
`site-keywords`. It still applies to `audience-interests`/`audience-overlap`/
`audience-demographics`, which were not tested for an independent loading
indicator this round.

**A real, previously-latent pagination bug.** `audience-geo`/`channels`/
`audience-interests` (the `.swReactTable-column` family) turned out to
paginate too, once past roughly 100 rows — an "out of N" footer
(`SWReactTableWrapperFooter-*` hashed class, stable "out of \d+" text) rather
than Ant Design's pager. Every `howolddoyoulook.com` table stayed ≤52 rows so
this never surfaced before; a large comparison domain checked read-only this
round had 38,818 interest-graph rows against ~100 rendered per page, and the
old `RENDER_SIGNAL` (`rowsRead >= totalRowsOnPage`, where the total is the
site-wide header count) could never be satisfied — any large-enough domain
would time out as `inconclusive` forever. Fixed: a `MULTI_PAGE_FOOTER` match
now also counts as a legitimate stopping point (page 1 of many, truncated but
not "still loading"), OR'd into all three affected `RENDER_SIGNAL` functions.

**audience-interests fixes from the same comparison-domain check (domain name
not persisted here or in any repo file; fixtures use `example-site.test`).**
`crossVisit` is a percentage (`"86.51%"`), not a plain number as assumed last
round — fixed to parse with `{percent: true}`. `AdSense` is a conditional
column present only on some sites (7 headers on howolddoyoulook.com, 6 on the
comparison domain) — moved out of the required `wanted` map into a standalone
optional lookup so its absence no longer produces a false `missingColumns`
alarm.

**audience-demographics: upgraded from a 3-state signal to real field
extraction**, using the comparison domain's full (English-labelled, despite
an otherwise Chinese UI) structure: `Male\n(\d+)%\nFemale\n(\d+)%` →
`genderMalePercent`/`genderFemalePercentConfirmed`; six percentage lines
positionally paired with the six age-bracket labels (`18-24` … `65+`) →
`ageDistribution`; and the "域/竞争对手份额/受众群体份额/访问持续时间/页面数/
访问/跳出率" segment table → `segment` (reads the two filter lines before the
header, then six data-row lines after). The old Chinese-label heuristic
(`hasGenderSplit`/`genderFemalePercent`) is kept as a fallback signal, not
replaced — the confirmed structure is additive. All three fragility points
(English labels despite Chinese UI, positional not label-adjacent age
pairing, segment table shows only the currently-selected dropdown
combination) are documented next to `deriveAudienceDemographicsSignal`.

**site-keywords sub-tab implemented: `--traffic-tab total|organic|paid`**
(default `total`, unchanged from before). The three tabs are a `react-tabs`
list (`li[data-automation-item="total"|"organic"|"paid"]`, confirmed live) —
but the script does **not** click them. Clicking was tested and silently
flips the requested window to `6m` as a side effect of that interaction path
(reproduced even switching into `total`/`organic`, not just `paid`);
constructing the destination URL directly with
`selectedPageTab=Total|Organic|Paid` and cold-navigating avoids that
entirely, confirmed for both `total` (pre-existing) and `organic` (this
round) staying at the requested `1m`. `paid` is the one genuine exception:
even a direct URL requesting `1m` gets silently upgraded to `6m` by the page
itself, every time (howolddoyoulook.com has no paid keywords at all, so the
result is that report's own legitimate "似乎没有足够的数据" empty-state text,
not an error) — rather than surface that as a `scope-mismatch` on every paid
run, the script's requested window for `paid` is itself set to `6m`, so
`windowActual` and `windowRequested` agree honestly instead of needing
`--accept-window-fallback` as a permanent workaround. Both `total` and
`organic` were verified against the real 75-row page that originally
triggered the `suspectColumns`/`"LOST"` bugs (see above) and came back clean
(`suspectColumns: []`, `partialLossColumns: []`) on both tabs in this round's
live runs. `trafficTab` is echoed in the output for `site-keywords` only.

**2026-09-13 fifth review (offline design, then live-confirmed same day once
Chrome was free; two mid-round scope corrections from the coordinator, both
applied).** The `ok-unverified`-forever problem this created for the four
scroll-gated reports now has an off switch: `similarweb-query.mjs` gained
`SCROLL_AB_CONCLUSIONS`, a per-report table (`{concluded, verdict, date,
notes}`) plus a pure `scrollGateSatisfied()` function wired into each affected
`RENDER_SIGNAL` (including a new entry for `site-keywords`, which previously
had none). Once a report's entry is flipped to `concluded: true`,
`scrollUnverified` stops firing regardless of which verdict — `'not-needed'`
because the pre-existing row/pagination/loading-placeholder signals already
cover completeness, `'needed'` because reaching that RENDER_SIGNAL check at
all now requires a confirmed stopped-at-bottom-and-visible read.

**All four entries are now `concluded: true` / `'not-needed'`**, switched
after a real `similarweb-scroll-ab.mjs --activate-chrome true` run against
howolddoyoulook.com for each report: zero-scroll and scrolled-to-bottom
returned identical row counts and `scrollHeight` in all four cases (11/51/
19/75 rows; 2004/2898/1581/3837px), so content does not gate on scroll
position for this site. Explicitly logged sample limitation (in each entry's
`notes`, not just here): one small site, 11–75 rows, well under the ~100-row
threshold where these tables switch to pagination instead of more scrolling —
whether a *large* site's *single page* ever lazy-mounts rows was not tested.
The `channels` conclusion carries the least risk from that gap (its channel
taxonomy is a small fixed enum, unrelated to site size); the other three
inherit a partial backstop from the pre-existing row-count/pagination-footer
signals, which should catch an incomplete read as `inconclusive` even if this
particular conclusion turns out not to generalize to a much larger single
page. `audience-interests`'s run happened to catch `hidden: true` in both
groups (the foreground request didn't actually win focus that time) and still
matched — an unplanned but consistent data point, not a designed hidden-vs-
visible test.

**`backlink/scripts/dev/similarweb-scroll-ab.mjs`** does the zero-scroll-vs-
scrolled-to-bottom comparison, reusing `lib-tools-share.mjs`'s real
`launchTool`/`gotoInTool`/`captureStable` (not the hidden-by-construction
exploration tool) and the already-tested `derive*Rows` row counts from
`lib-similarweb.mjs` instead of a second row-counting implementation; it also
now surfaces `subscription` (quota/expiry) like the main script does, added
after the first live runs showed the diagnostic output was missing it.
Verdicts are never written back automatically — the table above was edited by
hand after reading each run's output.

**Live-run confirmation, same session, official `similarweb-query.mjs`
against howolddoyoulook.com (global scope):** `channels` and `site-keywords`
now come back `status: "ok"` with zero warnings — the scroll dimension was
their only remaining gap. `audience-geo` and `audience-interests` still come
back `ok-unverified`, but for reasons unrelated to scrolling:
`page_hidden_during_capture` fired on both (a real hidden read was caught
mid-poll, independent of the AB conclusion, exactly the safety net's intended
job), and `audience-interests` additionally still carries
`loading_indicator_unverified` (never confirmed for that tab, untouched by
this round). One `channels` attempt hit a transient
`shared_proxy_blank_or_unavailable`-style node timeout unrelated to this
work and succeeded on retry.

**Mid-round correction: stop auto-raising Chrome without being asked.** The
existing `windowMode` auto-foreground for `audience-geo`/`channels`/
`audience-interests`/`site-keywords` (round 3) was reported to visibly steal
OS focus during normal use. `similarweb-query.mjs` now gates that forcing
behind `--activate-chrome` (same name as the Semrush scripts' switch, though
the underlying mechanism differs — this flips the `window` argument passed
into the shared `launchTool`, not a separate `open -a` call): default stays
`true` (current behavior preserved) until told to flip the default; passing
`false` drops back to the plain `--window`-controlled default. Turning it off
does **not** relax the correctness bar — a new `pageWasHiddenDuringCapture`
flag inspects every polled `scrollTrace` entry (not just the final one) and,
if any read caught `document.hidden === true`, forces a dedicated
`page_hidden_during_capture` warning independent of `scrollUnverified`/the
AB-conclusion state, so a report can never look confirmed-clean after a run
that is known to have gone hidden. The new `similarweb-scroll-ab.mjs` was
written after this correction landed and never had the forcing behavior in
the first place — it defaults `--activate-chrome` to `false` (unlike the main
script's preserved-default `true`), since adding a fresh instance of the
just-reported pattern to brand-new code would be worse than not testing
visibility by default.

**2026-09-14: `--activate-chrome` default flips to `false`, and `windowMode`
stops being a foreground/background binary.** Two changes, driven by a
focus-stealing audit that measured `--activate-chrome true` (the then-default)
issuing 31–32 `open -a`/foreground-window requests in one normal run:

1. `opencli-core.mjs`/`lib-tools-share.mjs` used to collapse any `windowMode`
   that wasn't exactly `'foreground'` down to `'background'` — `active` and
   `isolated` were silently unreachable through those three call sites, even
   though opencli itself has always supported all four
   (`foreground|active|background|isolated`; see opencli's own `src/runtime.ts`
   `BrowserWindowMode`). Fixed to a single `normalizeWindowMode()` pass-through
   used by all three, plus `reuseDecision()`'s hidden-tab relaunch check now
   also fires for `active` (not just `foreground`) since both are "caller wants
   this tab visible" requests, unlike `background`/`isolated`.
2. `similarweb-query.mjs`'s own `resolveWindowMode()` default flips from
   `background` to `active` (tab selected, un-throttled, but never raises the
   OS window), and `--activate-chrome` itself defaults to `false` (was `true`).
   `FOREGROUND_FORCED_REPORTS` still exists for the four scroll-gated reports,
   but only fires when a caller explicitly passes `--activate-chrome true` —
   the round-5 scroll A/B evidence above already showed `active`-level
   visibility is sufficient for all four, so the stronger, focus-stealing
   `foreground` default is no longer needed. `page_hidden_during_capture` keeps
   independently forcing `ok-unverified` for `audience-geo`/`channels`/
   `site-keywords` (their round-5 A/B samples were all captured under
   `hidden:false`, so they say nothing about the hidden case) — the one
   exception is `audience-interests`, whose round-5 sample was captured with
   **both** A/B groups at `hidden:true` and matching row counts (see above:
   "an unplanned but consistent data point"), which is exactly the kind of
   direct hidden-case evidence needed to relax it; output now carries
   `hiddenCaptureRelaxed` per report so this isn't silent. `similarweb-batch.mjs`
   and `similarweb-keywords.mjs` get the same `active` default via a shared
   `resolveSimilarwebWindowMode()` in `lib-similarweb.mjs` — the latter had a
   dead-on-arrival bug fixed as part of this change: it used to pass the whole
   `flags` object into `launchTool({ tool, session, flags, ... })`, a key
   `launchToolInner` never destructures, so `--window` never reached opencli at
   all and every run was an implicit `background`.
3. `semrush-overview.mjs`'s own `DEFAULT_WINDOW` flips from `foreground` to
   `active` for the same reason (moved into `lib-semrush-overview.mjs` as
   `resolveOverviewWindowMode()`, so it's offline-testable without a browser).
   `--activate-chrome` keeps its `true` default here (unlike `similarweb-query.mjs`)
   because it now means something narrower and safer: it only gates the OS-level
   `open -a "Google Chrome"` calls (`createChromeActivator()`, also moved into
   the lib), which are capped at `--max-activations` (default 3) for the whole
   run instead of firing on every hidden read unconditionally; past the cap the
   existing tab-hidden block still applies, and `readiness.visibilityActions.hint`
   tells the human to keep the Chrome window visible. `--activate-chrome false`
   also downgrades an explicit `--window foreground` down to `active`, since
   `foreground` is itself an OS-level raise and letting it through would defeat
   the `false` promise.

**Offline notCovered backfill (`deriveOverviewSupplementalBlocks` /
`deriveAudienceInterestsSupplemental` in `lib-similarweb.mjs`), built only
from rawText already captured in earlier live runs this session — no new
browser use.** Every sub-block resolves to one of `data` / `legit-empty` /
`locked` / `confirmed-absent` / `unresolved` (found the anchor, matched none
of the known shapes — never guessed into a shape). Confirmed real:
performance-page device split, brand-vs-non-brand share, top organic+paid
search terms (Top5, with `changePercentDirectionUnknown: true` throughout —
this text card carries no color/arrow evidence, so direction is never
assumed), a reusable 3-column domain/share/change block (confirmed by the
5-row "leading display advertisers" sample, reused for the 1-row "top
referral sites" and the geography Top5 mini-table), and the channel-summary
mini chart (chart axis-tick count is unpredictable, so the parser counts
known channel labels instead and takes the trailing N value tokens right
before the stop anchor — validated against the real 7-channel sample
including two `N/A` entries). `audience-interests`'s industry-distribution pie
and topic word-cloud are both implemented too (the word cloud has no
recoverable weight/rank, so it ships as an ordered word list with an explicit
`topicsOrderConfidence` caveat rather than pretending to be ranked).
Deliberately left `notCovered`: the trend chart (axis labels only, no
per-point series text — the coordinator's own stated exception), and
`audience-overlap`'s "exclusive/shared audience" breakdown, whose real
sample's token counts (7 site-name tokens, 3 percentages, 9 numbers) don't
divide evenly against each other — there is no DOM row/column boundary
recoverable from `innerText` order alone, so guessing a mapping was rejected
even though the raw numbers are visible in the text. `audience-demographics`'s
NOT_COVERED entry was also corrected: round 3 had already shipped
gender/age/segment extraction, so the entry no longer claims that's missing —
the one real remaining gap is that the segment table only ever shows
whichever gender×age combination is currently selected in the page's own
dropdown.

**2026-09-13 sixth review: real cross-check against a data-rich site
(canva.com — user's own suggestion, named directly in this task, not a
privately-chosen comparison domain that needs scrubbing; unlike the earlier
round-4 domain it is used directly in code/tests here, the same way
howolddoyoulook.com already is).** The round-5 offline blocks had never been
checked against a site large enough to actually populate the "only ever seen
empty" widgets or trigger real pagination. They now have been (9 page reads +
9 script runs; one extra page read and one extra script re-run beyond the
planned 8+8, both to chase down real findings below — disclosed, not hidden).

*Three round-5 "empty-only" blocks now have real, implemented shapes*: top
referral industries (`网站类别`/`流量份额`, 2 columns — **no** change column,
different from the other "3-column" widgets it was assumed to match);
outbound link destinations (3 columns, confirmed, but the label header is the
English `"Domain"`, not `"域"` — `deriveColumnTripleBlock`'s header params now
accept either a string or an array of acceptable header strings); and the
social-traffic breakdown (same "labels, then unpredictable axis-tick count,
then the trailing N values" shape as the channel-summary chart, except
platform names are open-vocabulary — two live reads of the same site produced
different platform lists — so `deriveOverviewChannelSummary`'s hardcoded
Chinese-channel-name list was replaced with a vocabulary-free
`deriveLeadingLabelsTrailingValues` helper: count the leading run of
non-percentage tokens instead of matching a fixed enum, which both new and old
callers now share).

**A block round 5 had completely missed, not just left empty:** "显示广告"
(Display Ads) has its own "热门媒体" (top publishers) sub-widget, distinct
from "导出广告 → 领先广告主" which round 5's `displayAdvertisers` field
actually covers — the two were conflated because both showed the identical
empty-state text on the round-5 sample site. Implemented as a new
`topMediaPublishers` field (3 columns, label header `"发布商"`). Its real data
surfaced two previously-unseen values worth a permanent fix: a literal `"新"`
("new" — no prior-period baseline, the same concept as English `"NEW"`
elsewhere, now recognized and reported as `changeIsNew: true` rather than
silently nulled indistinguishably from "-"), and a genuine negative change
value (`"-96%"`) that `parseNumber()` used to reject outright — its regex
never allowed a leading minus sign, so every negative change on every column
using it silently became `null`. Fixed by allowing an optional leading `-`;
audited every other `parseNumber` call site and found no real data anywhere
that would start legitimately parsing as a spurious negative.

**A real, silent false-positive in `deriveSiteKeywordRows`, caught by
diffing the script's own output against the same page read by hand:**
`site-keywords --traffic-tab paid` reported `missingColumns: ["KD", "排位变动"]`
on every run, even though both are absent from the paid tab's header row by
design (paid traffic has no organic keyword-difficulty or ranking-position
concept) — the same category of bug as the `AdSense` conditional-column fix
from an earlier round, just not caught until a data-rich site's paid tab was
actually read side-by-side with the script's JSON. `KD` moved out of the
required `wanted` map into a standalone optional lookup, mirroring `AdSense`;
`排位变动`'s missing-check now keys off whether `"排位"` itself appears in the
headers at all, not off "how many `变动` columns exist" (that broader-looking
fix would have silently defeated an existing, correct regression test for a
genuinely different failure mode: a header row that still has `"排位"` but
lost its paired `"变动"` column to an extraction glitch — that case must still
be reported, and now is, alongside the paid-tab case that must not be).

**A/B `'not-needed'` conclusions re-checked at real scale, all held.**
canva.com's `channels` (1,213 channel-detail rows, `truncated: true`),
`audience-interests` (36,921 cross-visit rows, `truncated: true`), and
`site-keywords` (157,515 organic + a separate paid corpus, 7,221 and 1,576
pages respectively) all settled to a clean `ok` (or `ok-unverified` for an
unrelated, already-known reason) via the existing pagination-footer /
Ant-Design-pager signals alone — no scrolling involved, matching the earlier
small-site conclusion. This is exactly the scale case the round-5 notes had
flagged as untested; it now is, and the conclusion was not narrowed to
"only holds for small sites" as a result. `page_hidden_during_capture` did
fire once (on the `channels` run) — logged as designed, did not block the
report from otherwise resolving on retry-free single attempts elsewhere.

### Semrush role

Use Semrush to:

- retrieve authorized backlink rows for a seed domain;
- inspect referring pages/domains and anchors;
- expand the recursive discovery queue;
- compare backlink gaps.

Respect plan quotas and exports. Never capture or print session secrets.

**每一个 Semrush 数字都挂着一个国家库，读数字之前先确认是哪一个。**

| 维度 | 脚本 | `--db` 的含义 | 有没有全球合计 |
|---|---|---|---|
| 关键词单词模式（`semrush-keyword.mjs`，不带 `--bulk`/`--bulk-plan`） | `volume`＝该国搜索量；`--bulk`/`--bulk-plan` 同库一次最多 100 词 | 单词模式省略 `--db`（2026-09-13 起不再默认 `jp`）时，主输出 `volume` 改用 `globalVolume`（`volumeScope:"global"`），KD/CPC/竞争度/结果数一律置空（`countryMetricsAvailable:false`，理由见 `countryMetricsUnavailableReason`）；批量模式仍必须显式国家 | 单词模式**有**——`globalVolume` 与 Top-N `byCountry`；批量模式没有，专注当前国家库 |
| 域名概览（`semrush-overview.mjs`、`semrush-batch.mjs`，2026-09-13 起） | `organicTraffic`/`authorityScore` 等＝请求口径的估算 | **省略＝全球库**（`scope:"global"`）；传 `--db xx` 才是该国——两个脚本打开的是同一张 `/analytics/overview/` 页 | **有**——省略 `--db` 就是全球；实际口径由 `judgeScope()` 核对，**DOM（地区选择器）与接口（国家流量表+趋势序列，`rpcScopeWitness()`）两个证人都到位且互相印证才判 `confirmed`**，只有一个证人、两者矛盾、或探测失败都是 `unverified`/`mismatch`，不会悄悄当成全球收下；`semrush-batch.mjs` 只读顶部卡片，接口证人用 `drainRpcWitness()`（内置按当前文档
`performance.timeOrigin` 剔除跨域串扰的旧响应）+ `trendContextFromText()`（从 `innerText`
认 SEO 卡片显示值挑页面级趋势序列，两套序列同时存在时也能挑对；卡片文字读不出来才退化成
「本域只有一条趋势序列」的兜底），矮一档但同样绝不假装确认了没确认的口径——
`scopeEvidence.verdict !== 'confirmed'` 时该行数值挪进 `unconfirmedOrganicTraffic`/
`unconfirmedAuthorityScore`，`stopReason: 'scope-unconfirmed'`；每行另附精简的
`rpcEvidence: [{id, kind, timestamp, msFromNavStart}]`（2026-09-14 起，只留参与判定的
三类记录、不含响应正文，供多域批量场景事后审计"这条证据是不是这一域自己的"，见
`readRpcWitness()` 的实现注释） |
| 国家库报表（`semrush-report.mjs` 的 `organic-overview`/`organic-positions`/`organic-pages`/`keyword-magic`/`keyword-overview`） | 对应字段＝该国估算 | **必须显式传，省略直接报错退出**（2026-09-13 起）——这五张页面都没有全球选项，且省略时落地的国家不可预测 | **没有**——想要全球规模只能换独立信源（比如 Similarweb）按国家占比折算，或改用关键词维度的 `globalVolume`，不能靠不传 `--db` 拿到 |
| 反链报表（`semrush-report.mjs` 的 `backlinks-list`/`referring-domains`/`backlinks-overview`） | 反链条目/汇总，不分国家 | 不接受 `--db`，与国家口径无关 | 不适用——本身就不按国家拆分 |

**域名概览页内的研究分组口径（仅 `semrush-overview.mjs`，2026-09-13 实测）**：页头选到「全世界」
不代表整页都是全球。「自然搜索研究」「广告研究」两个分组标题旁有独立的国家徽标，跟随账号级
「最近一次显式选择的国家」，全球页面上实测显示过别的国家——这两组的关键词表、竞争对手、
广告区块是那个国家的数据。脚本给每个区块输出自己的 `scope`、顶层汇总 `sectionScopes`；
请求全球而没传 `--organic-db` 时如实标出实际国家并记 `section-scope-unpinned`，不会 `complete`；
传 `--organic-db xx` 会先显式访问一次带 `db=xx` 的自然排名概览把账号状态钉住（改写记进
`accountStateWrites`，会影响同账号其它不带 db 的域名报表）。反链分节不分国家，过滤条应为「全世界」。

多个国家已经由全球结果筛出时，把 `{ "us": ["keyword"], "de": ["keyword"] }` 写进 JSON，使用
`--bulk-plan <file> --out <jsonl>`。脚本只启动一次 Semrush，再通过同一页面会话取完各国家库，避免
每个国家都回到工具主页。

2026-09-13 实测把上面这张表从"部分未验证"坐实成结论：`semrush-overview.mjs` 与
`semrush-batch.mjs` 打开的是同一张域名概览页，页头选择器确认有「全世界/Worldwide」；
`semrush-report.mjs` 的 `organic-overview`/`organic-positions`/`organic-pages`/
`keyword-magic`/`keyword-overview` 和 `semrush-keyword.mjs` 用的关键词概览页，选择器
都只是纯国家列表，搜索"world"/"全球"没有任何结果——**这几张确认没有全球选项**。
且不传 `--db` 时落地的国家不可预测：实测同一账号连续访问域名类报表先落 `us`、
关键词类报表落 `jp`，又在同一 session 里意外跳到 `kr`——账号状态是共享的，会被
并发的其它操作悄悄改写，不是"退回某个固定默认库"这么简单，所以这五张报表和
关键词单词模式都不再允许沉默地省略 `--db`（分别是硬报错退出、和主输出改走
`globalVolume` 两种处理，视是否有全球替代指标而定）。

关键词先按国家分文件，用 `--bulk --db <cc>` 一次筛最多 100 个；入选词再用单词模式读取
`globalVolume` 和 `byCountry`，随后对主要国家与项目目标市场分别跑对应 `--db`。这样美国库的零值
不会覆盖其他国家的真实需求。

单词模式会自动做一次 **geo-hop**（2026-08-30 起只报事实）：`byCountry` 第一大国家
不是当前 `db` 时，脚本在**同一个 session**里追加该国复查并写进 `geoHop.result`，
同时给出 `share`（第一大国家占 `globalVolume` 的百分比）与两边的量；只追一层，
不递归，也不回 dashboard。用 `--no-follow-top-country` 才会明确关闭。旧版
「份额 >=35% 或当前库量 <500 才追查」的阈值已从脚本移出——**显著与否由 AI 拿
share/volume 判**。这样 US 低量但印度等市场占绝对多数的词不会被误判为
“没有需求”，判断也不再被写死的阈值遮住。

跟别的面板对比时（尤其是 Similarweb），三件事都要对齐，缺一个都能吵出一个假的倍数差：
1. **地理范围**——Semrush 的数字是一个国家库，Similarweb 默认是全球，先把两边扳到同一个地理范围（乘目标国占比，或用 Semrush 关键词维度的 `globalVolume`）再比；
2. **报表页面**——Similarweb 自己的「网站表现」总量和「流量来源渠道」的渠道加总就能对不上（实测差 6–35%），报数字时必须写清楚是哪一页；
3. **口径定义**——Semrush 的自然流量是**模型**（追踪到的词 × 搜索量 × 位次假设点击率算出来的，它数据库之外的搜索词完全看不见），Similarweb 是**面板外推**（基于抽样设备的点击流数据放大），两者一个是模型输出、一个是观测外推，标清楚各自是什么，不要相减或相除。

下面「两个搜索量数字打架」「闭环的两端不能接在同一个模型上」两节就是踩过这三条坑之后的处理方法，遇到数字对不上先看这张表和那两节，而不是怀疑哪个工具坏了。

## 虚拟屏幕模式：可见但不抢焦点（2026-09-14）

懒加载报表要求标签页 `visible`；Chrome 窗口被别的应用完全遮挡时，macOS 会让活动标签页也读成
`hidden`，下方区块不再挂载。以前靠 `open -a "Google Chrome"` 抬前台，会打断正在用电脑的人。
现在默认给自动化窗口一块「虚拟屏幕」：任何在系统里注册为显示器、平时没人看的屏幕都可以。

**哪些脚本默认用**（不传 `--window` 即生效）：`semrush-overview.mjs`、`semrush-traffic.mjs`、
`similarweb-query.mjs`、`similarweb-batch.mjs`、`similarweb-keywords.mjs`——它们的数据依赖首次水合
或懒加载时标签页可见。`semrush-report.mjs`、`semrush-keyword.mjs`、`tools-share-open.mjs` 原样转发
`--window`，可显式 `--window virtual-display` 开启，默认不变（表格/关键词接口数据长期在后台模式下正常取数，
改默认只会多一次屏幕检测和移窗）。`semrush-batch.mjs`（只读顶部卡片 + 接口证人）、
`tools-share-evidence.mjs`、`tools-share-node.mjs`（启动探测）保持固定窗口模式。
显式传 opencli 四档之一（foreground/active/background/isolated）时一律原样透传，不走虚拟屏幕。

**流程**（`scripts/lib-automation-window.mjs`，由 `launchTool({ window: 'virtual-display' })` 在持锁之后调用）：

1. JXA 读 NSScreen，按名称匹配**非主屏**，换算成全局左上原点坐标（与 Chrome `bounds`、页面 `screenX` 同一坐标系）；
2. `opencli browser sessions` 找本 session 的 `windowId`；没有就用 `--window isolated` 打开一个公共占位页，
   让扩展建出不聚焦的独立窗口（`open` 只接受 http(s)）。本 session 的标签页若落在用户窗口里
   （之前用 active/background 跑过），只释放本 session 自己的租约再重开，不碰那个窗口；
3. 窗口中心不在虚拟屏上才 AppleScript `set bounds`；窗口里只要有一个 opencli 不认识的标签页，就拒绝移动并回退；
4. `tab select` 让本 session 标签成为窗口活动标签（同一窗口只有活动标签 visible），读回 `visibilityState`
   后调用方才导航（报表导航仍走 `location.href`）；
5. 之后每次读到 hidden：重新检测屏幕 → 移回 → `tab select`，整次运行有次数上限；屏幕没了就降级为回退路径。

**为什么不抢焦点**：`--window isolated` 建窗时 `focused:false`；AppleScript `set bounds` 与扩展侧
`tabs.update({active:true})` 都不激活应用（实测前台应用前后不变）；模块里没有 `activate`、`open -a`、
调整窗口层级的指令（`tests/automation-window.test.mjs` 有源码守卫）；对 Chrome 的查询先判 `running()`，
不会因为 `tell` 把它拉起；System Events 只用于只读查询前台应用名。

**配置**：`--automation-display <名称子串|/正则/|off>`，或环境变量 `BACKLINK_AUTOMATION_DISPLAY`
（可写进 Skill 根目录的 `.env`，启动器会加载）；`off` 关闭虚拟屏幕策略。默认匹配名字含「虚拟」或
`Virtual` 的非主屏。占位页可用 `BACKLINK_AUTOMATION_PLACEHOLDER_URL` 覆盖（必须 http(s)、无登录、无配额）。

**回退**：检测不到虚拟屏幕、配置关闭、自动化窗口里混入外来标签页、找不到会话窗口时，`automationWindow.mode`
为 `"fallback"` 并写 `fallbackReason`，脚本沿用接入前的行为——域名概览：`active` + 限次 `open -a`，
stderr 提示「未检测到虚拟屏幕，回退为抢焦点（最多 N 次）」；Similarweb 三个脚本：`active`（`--activate-chrome true`
时长表报表为 `foreground`）；.Trends 流量：`foreground`。

**输出**：`automationWindow: {mode, fallbackReason?, display: {name, bounds}, windowId, moves, tabSelects, recoveries,
visibility: {reads, visible, hidden, visibleRatio}, frontmostAppSamples: [{at, label, app}], frontmost: {samples, chromeFrontmost}}`；
`similarweb-batch.mjs` 写在 `--out` 旁边的 `<out>.automation-window.json`，每行另带 `visibilityState`。

**运行期间不要把非自动化标签页拖进自动化窗口，也不要在那个窗口里手动开新标签页。** 扩展会把含外来标签页的窗口
判为「借用窗口」，下一次 isolated 会在主屏另开一个新窗口；本模块也会因为认不出那个标签页而拒绝移动它、回退为抢焦点。
同理，一个自动化窗口同时只有一个标签页可见——需要可见性的报表串行跑（配额锁本来就串行）。
自动化窗口里也不要打开浏览器扩展类助手的会话。

## Non-interruptive OpenCLI policy

The dashboard's `打开` controls may create or activate a browser window. Default
to a named OpenCLI browser session with `--window background` (the
visibility-dependent report scripts instead default to the virtual-display
strategy above, which is equally non-interruptive). Inspect the card
and launcher first. If a stable target URL or already-open tool tab is available,
open or bind that target directly instead of clicking the launcher.

Do not automate while the user is actively using the same Chrome window if the
site cannot remain backgrounded. Stop and report the limitation rather than
stealing foreground focus.

## Search Console role

Google Search Console is a verification and monitoring surface, not the primary
recursive discovery source. Keep these facts separate:

- performance clicks and queries;
- indexed/not-indexed page counts;
- link existence in a report;
- exact public anchor and `rel` attributes on the live referring page.

Authenticated access does not authorize account switching, property changes,
user management, removals, or other mutations.

## columbus.tools —— AI 工具站的外链榜（免费层可用）

`https://columbus.tools/ai-backlink-rank` 把「被 AI 工具站引用最多的外链来源域名」
按**出现频次**排好了，每行带 DR、月访问量、Dofollow/Nofollow、自然搜索占比。
这正是我们想要的「出现在多少个独立同行身上」信号，只不过它的样本池是 3,640 个 AI 站。

- **免费能拿到的**：默认排序前 100 名，无需登录。
- **要钱的**：翻页（共 126 页 / 6,254 个域名）、按 DR/流量/搜索占比筛选，
  以及 MCP 的 `list_backlink_domains` 等 6 个工具（只有 `list_model_releases` 免费）。
- **采集注意**：虚拟滚动 + Tab 分隔字段，做法见
  [harvest.md](harvest.md) 的「columbus.tools 免费层只给前 100 名」。

**2026-08-19 对账结果：前 100 名里我们已收录 22 个，78 个是新的。**
新增里判为可用 45 个、判为垃圾 33 个（短链农场与镜像站：`*-links-bhs.xyz` 系列、
`buzzshrink.website`、`anchorurl.cloud`、`urls-shortener.eu`、`shortenurls.eu`、
`bye.fyi`、`quero.party` 等，共同特征是 0 流量 + 0 自然搜索占比 + 短链形态）。
原始数据落在项目侧的 `<项目>/.backlink/columbus-top100.json`——**采集产物属于项目，不进本 Skill**。

> 这份榜是**平台层面的断言**，不是对某一条链的观测。
> 它的 Dofollow 列和第三方名单的 Dofollow 列性质一样——
> 按 [instant-publish.md](instant-publish.md) 的「Reading a third-party list」对待：
> 可以拿来排候选，不可以直接写进 ledger 当 `rel_verified`。

### 瞬时错误页：刷新即恢复，不是节点挂了（2026-08-21，站主口述 + 实测）

面板和工具页偶尔整页变成：

> **出错了**
> 别担心，我们已经发现了问题并正在处理。
> 请稍后重试。

**这是瞬时的，重载页面即恢复，多刷几次一定回来。**
不要因此换节点、改选择器、怀疑登录态——那些都不是原因。

**与「节点会挂」是两件事，症状可以区分：**

| | 瞬时错误页 | 节点挂了 |
|---|---|---|
| 页面长什么样 | **有明确错误文案**（上面那三行） | **白页 / 长时间不渲染**，`bodyText` 为空但标题是对的 |
| 怎么办 | **重载当前页**，重试几次 | **换 `--node`**，重载没用 |

`semrush-report.mjs` 已经按这条实现：命中错误文案就 `location.reload()` 重试，
默认 3 次（`--retries`），失败时的报错文案会把两种成因分开列。

### 标签出现 ≠ 数值出现（2026-08-23 实测，静默错数）

指标区分两拍渲染：先挂标签和占位值（`Authority Score` 下面一个 `0`、
`总访问量` 下面一个空态句），几秒后真值才水合进来。**只认标签的就绪判据会在
这个缝里通过，读到的是占位值，而且不报错。** 8 个域名跑 `semrush-overview.mjs`，
6 个被记成 `authorityScore: 0`（真值 22/29/38/15/22/26）；同一天
`similarweb-batch.mjs` 把月访问 351,111 的 mmradar.gg 记成 `below-floor`。

判据与实现见 [traffic-screen.md](traffic-screen.md#a-rendered-label-is-not-a-rendered-number)：
`lib-tools-share.mjs` 的 `captureStable()`，**同一组数值连读两次一致才收下，
读不稳记 error**。`semrush-batch.mjs` / `similarweb-batch.mjs` 已按此实现。

**`semrush-overview.mjs`（2026-09-13 重写）不再借 `lib-tools-share.mjs` 的
`captureStable()`，改用自己 `lib-semrush-overview.mjs` 里更细的判据**：每个区块
的 DOM 指纹要连续两次读一致，且同一轮页面网络也要静默（CDP 发出数=资源计时完成
数、drain 无在途、页内钩子在途为 0）才算终态；这条判据顺带修掉了本节的事故——
**AS 恰好为 0 且没有等级徽标，现在被显式判成占位值，而不是收下**。

**五个脚本走 `captureStable()` 这条路**：`semrush-batch.mjs`、
`similarweb-batch.mjs`、`similarweb-query.mjs`，以及 `semrush-report.mjs` 的全部六张报告
（它拿 `parse()` 的完整输出当指纹——**指纹就是要写出去的那个对象**，
不存在「盯着 A、写出去 B」的漏洞）。`spec.ready` 从此只是入场券，不是结论。

**「连读两次一致」是下限，不是上限**（2026-08-24 实跑打脸补充）：占位值本身是稳定的，
两次快读之间它根本不变。`semrush-batch` 在旧默认（settle 5s / 间隔 2s / 超时 40s）下
仍然把 mmradar.gg 的 AS 读成 0，并把另外三个正常站判成 below-floor。补了三条才真正拦住：
**一个字段都没解析出来永不收下**（超时记 error）、**自相矛盾的指纹要连读六次**
（自然流量 > 0 却 AS = 0 说明 AS 还没水合）、**settle/间隔/超时调大到 8s/3s/75s**。
改后同样四个域名 4/4 正确，单域名从 16 秒涨到 25 秒。

**注意这一整段只管一个轴：占位值 vs 真值。** 它默认「表在那儿，只是数还没进来」，
所以补救永远是「再读一次」。**读到空还有另一个轴，判据和补救都不一样**：
一是**没水合**（读的那一刻 `document.visibilityState === 'hidden'`，换一次 `visible` 读就有了），
二是**这条路由本来就没有表**（`visible` 下连读三次仍是 0 个表格元素，只有图表——
再读多少次都一样，数据存在，但取数形态是图不是表）。
所以读到空之后第一个动作是**在页面里取 `visibilityState`**，不是再读一次；
`hidden` 下的读一律记 `inconclusive-hidden`，不许记 `below-floor`、不许记「空」。
实测、路由清单和可下判定的协议只有一份权威，在本 Skill SKILL.md 里
id 为 `hidden-tabs-do-not-hydrate` 的那条 law，要改就改在那儿。

**Similarweb 的取值曾经会「扫过头」**：页面上没有数据时写的是 `-`，而旧模式
`#?\s*[\d,]+` 既不限整行也没有标签边界，于是一路扫到「Last 28 days (As of Aug 21)」，
把 **28** 抓成了国家排名和行业排名（na.whatismymmr.com，真实是三个 `-`）。
三条守则照抄 `semrush-report.mjs` 的 `pick()`：**碰到下一个标签就停、整行匹配、
`-`/`N/A` 直接返回 null**。解析器同时从两份拷贝合并成一份 `lib-similarweb.mjs`——
之前两份各抄一遍，同一个 bug 要修两次，实际只修了一次。

**令牌会经由第三方输出漏出去**：`opencli` 命令失败时把活动会话连同完整 URL 打进 stderr，
`run()` 原样抛成 Error.message，脚本再塞进 `output.error.message`——
`__gmitm=ayWzA3*...` 就这样进了 stdout、`--out` 文件和日志（2026-08-24 实测到一次）。
现在所有外发的错误文本一律过 `redactSecrets()`。**不要指望每个调用点自己记得。**

顺带修掉的四个同源问题：
- **`semrush-report.mjs` 在全新 `--session` 下根本跑不起来**：`ensureTool()` 的复用探测
  在会话不存在时让 opencli 非零退出，而那层 try 只兜 JSON 解析——整张报告变成
  `report_failed`，报错写着「No active session」，读起来像 OpenCLI 坏了。
  探测的语义只有一句「我是不是已经站在工具页上」，答不上来就当没有，去启动。
- **翻页**：页码指示器先走，表体后换。点完就读会把上一页再读一遍，而行级去重
  把它悄悄吞掉（翻五页只多十二行）。现在要求新页的解析结果**稳定且与上一页不同**，
  拿不到就停下并写明 `pagination.stoppedBecause` + stderr `[truncated]`。
- **静默截断**：`--max-pages` 到顶、下一页按钮没了、某页始终没稳——三种都会明确报出来。
- **`parsePages` 的字段名对不上内容**（`rowsVisible` 里装的是行数组），
  导致 `--all-pages` 翻 `organic-pages` 时 `parsed.rows` 是 undefined，
  push 抛 TypeError，整张报告变成 `report_failed`——看起来像数据源坏了。

### Semrush 的八张「没有导出按钮」的报告，以及会话复用的经济账

`semrush-overview.mjs` 只覆盖域名概览一张。真正做竞品勘测要的是其余八张，
全部由 `semrush-report.mjs` 覆盖：

| `--report` | 路由 | 拿得到什么 | 需要显式 `--db`？ |
|---|---|---|---|
| `organic-overview` | `/analytics/organic/overview/` | 关键词数、自然流量、流量成本、分国家 | **是**（2026-09-13 起省略直接报错退出） |
| `organic-positions` | `/analytics/organic/positions/` | **全量排名词**（页面只显示 10 行，DOM 里是全部） | **是** |
| `organic-pages` | `/analytics/organic/pages/` | 哪些页在带流量、各自几个词、引荐域名数 | **是** |
| `keyword-magic` | `/analytics/keywordmagic/` | 种子词批量扩词 + 侧栏聚簇（词表/聚簇，指标常「不可用」） | **是** |
| `keyword-overview` | `/analytics/keywordoverview/` | 量、KD、**要多少引荐域名**、CPC、分国家 | **是** |
| `backlinks-list` | `/analytics/backlinks/backlinks/` | 反链明细：follow/nofollow、锚文本、来源页类型 | 否——不分国家 |
| `referring-domains` | `/analytics/refdomains/report/` | 按引荐域名分组聚合、排序 | 否——不分国家 |
| `backlinks-overview` | `/analytics/backlinks/overview/` | 引荐域名、反链、AS、月访问、**有没有 follow 反链** | 否——不分国家 |

前五张都没有全球选项，且省略 `--db` 时落地的国家不可预测——实测同一账号连续访问，
域名类先落 `us`，关键词类落 `jp`，又在同一 session 里意外跳到 `kr`，账号状态是共享的，
会被并发的其它操作悄悄改写。2026-09-13 起这五张改成省略 `--db` 直接报错退出（exit 2），
不再只是打印警告；输出里也带 `scope`/`scopeEvidence`，与请求口径不一致时能看出来。
后三张反链报表不分国家，不受影响。

#### report.mjs 口径证据现状与实测结论（2026-09-14 实测，8 次页面访问，配额见下）

**结论：五张报表全部维持 `dom-only`，没有一张升级到 `confirmed`。** 这不是"没时间/没查"，
是实测查过、且查到的证据不足以支撑一个可信的接口见证——细节如下，供以后想再尝试的人
不用重新踩一遍。

**实测怎么做的**：查询对象固定 `howolddoyoulook.com` / 关键词 `how old do i look`，不传
`--session`（用固定 `semrush-nav`），前台窗口、每次落地后 settle 15 秒。接口证据抓两路：
① `armNetworkCapture()`/`drainRpcWitness()`（lib 原样复用，导航前布防+落地后 drain，自带
navStart 过滤）拿 CDP 捕获到的响应体；② 额外在页面里装了一个只读的自定义钩子，专门摘
`fetch`/`XHR` 请求 URL 与请求体里 `db`/`database`/`country`/`region`/`gl` 这几个键的值
（不落盘 cookie/token/账号信息，`__gmitm` 令牌一律替换成 `REDACTED`）。8 次访问：
`keyword-overview`×2（us/de）、`organic-overview`×2（us/de）、`organic-positions`×1（us）、
`organic-pages`×1（us，产品路由 `/analytics/organic/pages/` 会被 Semrush 自己 302/前端路由
改写到 `/analytics/toppages/`——**这是页面自己的行为，生产 `semrush-report.mjs` 用
`location.href` 直接赋值导航、从不检查落地路由，不受影响；只有本次实测脚本借用了
`gotoInTool` 的严格路由校验才会看到这个提示，加 `allowRedirect:true` 即可**）、
`keyword-magic`×1（us）。

**逐张发现**：
- **`keyword-overview`、`keyword-magic`**：两张页面在 CDP 捕获与自定义钩子里都**一条
  `/dpa/rpc` 或 `/kwogw/*` 请求都没抓到**（`rpcEntriesCount: 0`，钩子 `reqsSeen: 0`）。
  `semrush-keyword.mjs` 的 bulk 模式走的 `/kwogw/v2/webapi` 是另一套代码路径（直接发
  RPC 请求，不经 UI 轮询）；这两张报表用的 DOM 轮询模式看起来根本不触发任何可辨识的
  XHR/fetch——**没有接口流量可看，谈不上"接口证据形状不好"，是压根没有接口证据**。
  `keyword-magic` 的 `SCOPE_PROBE_JS` 也没找到真正的国家选择器按钮（`domCandidates`
  只有 `KD`/`SF` 这两个碰巧匹配两位字母正则的界面标签，`pillsWithState: 0`）——DOM 证据
  本身也比另外三张弱，只能靠落地 URL 的 `db=` 参数撑住 `dom-only`。
- **`organic-overview`/`organic-positions`/`organic-pages`**：三张都**真的会调
  `/dpa/rpc`**（7-13 条响应，含 `googleCountries`/`topKeywords`/`serpFeatureCounts` 等
  kind），DOM 侧也确认了真正的国家选择按钮（US/UK/DE 等，`aria-checked` 正确反映选中
  国家）——DOM 证据比 keyword 那两张扎实。但**接口侧缺一样关键的东西：这三张页面完全
  不返回 `trend` 这个 kind**（`rpcKinds` 里没有）——`rpcScopeWitness()`/
  `trendContextFromText()` 整套判据都是靠"趋势序列最新点的关键词数"做比较，这里根本没有
  趋势序列可用。仅有的 `googleCountries`（"按国家/地区划分"表）**在 db=us 与 db=de 两次
  实测里返回的国家数完全一样（64 个）**，看起来是域名维度的固定分国家分布表，**不随当前
  选中的报表国家变化**，不能当"这次是不是 db=xx"的证人。`organic-positions` 的自定义钩子
  额外抓到一条 `POST /mini-kwogw/v2/webapi`（另一个此前未记录过的关键词网关变体），但
  这条请求体里没能解出 `db`/`database` 字段（可能是字段名不同、嵌套更深，或负载本身
  不是纯 JSON）——记录在此供以后专门查这一条线索，本轮预算已经打完，没有继续深挖。
- **共同结论**：没有找到任何"响应内容随 `--db` 切换而变化，且变化方式适合拿来做通用
  比较"的信号；唯一贴近的候选（`topKeywords`——理论上应该是这个国家自己的排名词表，
  应该会随国家变）本轮没有采集到足够细节直接比对 us/de 两份内容（预算已在验证"有没有
  `/dpa/rpc` 流量"“`googleCountries` 是否随国家变”这两问上用完）。**如果以后要继续查，
  从这里接着做**：同一报表同一目标分别拉 `db=us`/`db=de`，把两次的 `topKeywords`
  响应体整段落盘比对（关键词集合、`position`、`trafficPercent` 是否明显不同）；如果确实
  随国家变，可以用"响应非空 + 内容与另一国家不同"做一个比"两个证人互相印证"弱、但比
  `dom-only` 强的候选判据，同样需要先离线定好判据再实测验证，不能又是"看着像就上"。

**因此维持 `dom-only`**：`judgeScope()`（`lib-semrush-overview.mjs`）的国家分支要求 DOM
证据（地区选择器/落地 URL）与接口（RPC）证据同时印证才给 `confirmed`；`semrush-report.mjs`
本轮实测确认这五张报表都拿不出满足这个判据的接口证据（两张完全没有可用流量，三张有流量
但没有随 db 变化的可比较字段），继续不传 `rpcWitness`，`rpcOk` 恒为 `false`。2026-09-14
做的是**诚实改名**：`judgeScope()` 在没有 `rpcWitness` 时如果 DOM 本身已经完全确认了
请求口径（reason 以 `"DOM ok,"` 开头），`verdict` 改标成 `dom-only`——跟"DOM 也读不
出来"的真正 `unverified`、"DOM 明确矛盾"的 `mismatch` 区分开；后两者原样透传，不软化。
`dom-only` 附带 `domOnlyNote` 字段解释含义，`reason` 字段保留 `judgeScope()` 的原文
不覆盖。

**账号级国家状态（本轮实测按访问顺序：keyword-overview us→de，organic-overview us→de，
organic-positions us，organic-pages us，keyword-magic us，结束）**：域名类报表最后一次
显式访问是 `organic-pages --db us`，**域名类账号状态应停在 `us`**；关键词类报表最后一次
显式访问是 `keyword-magic --db us`，**关键词类账号状态应停在 `us`**——但 `keyword-overview`
与 `keyword-magic` 是否共用同一份账号级状态本轮未单独验证，不确定它们是同一条状态还是
两条独立状态，只能确认两者各自最后一次都传的是 `us`。域名类与关键词类是两条独立状态
（与本文件前面"域名类报表之间会沿用上一次显式选择的国家；关键词类会自己单独漂"的结论
一致），下一次任何不显式传 `--db` 的调用都可能读到这些"上次停留的国家"，不是全球也不是
固定默认值。

**完成判定同步补强（2026-09-14，独立于口径证据这条线，第三轮起步、第四轮补齐）**：
核对生产代码时发现分页/懒加载表格的完成判定只在 `console.error` 里报过
`virtualScrollTruncated`/`parserAligned` 问题，`output` 顶层从没有一个字段告诉调用方
"这份结果不能当完整的收下"——一个只看 JSON 不翻 stderr 的下游会把截断的数据当完整数据用。
补了 `assessCompleteness()` 把这两个信号接到顶层 `status`。

**第四轮独立 checker 实测揪出一条更根本的旁路**：`virtualScrollTruncated` 的判据是
`headlineTotal!==null && headlineTotal>rawRecordCount`——**页面自报总数解析不出时
（`headlineTotal===null`）恒为 `false`，静默当成"没截断"**。实测 `keyword-magic --db us`
（283 页，`checker4-runE.json`）就撞上了 `pageSelfReportedTotal:null`，这次靠
`pagination-incomplete`（1/283 页）独立兜住没有酿成误判，但假设某张报表不分页、纯虚拟
滚动截断、又读不到总数，三条判据会全部放行，错判 `complete`。同一次审查还发现
`readPageInfo()` 有同类、更危险的缺口：解析不到「页码：X / Y」时旧代码直接
`return {current:1, total:1}`——把"不知道有几页"悄悄当成"只有一页"，直接喂进分页机制
本身的完成判据。

修法（均为纯函数改动，未实跑验证，逻辑已用 `checker4-runE.json` 的实测形状脱敏后钉进
离线测试）：
- `readPageInfo()` 解析不到分页器文字时返回 `unverifiable:true`（`total`/`current`
  仍填 1 只是占位，调用方必须先看 `unverifiable`），不再默认"只有一页"。
- `reportCoverage()` 新增 `totalUnverifiable`：非 `crossPageTotal` 报表读不到页面自报
  总数时置真（`crossPageTotal` 报表——keyword-magic/referring-domains——总数由
  `pagination` 字段负责，这条判据本来就不适用它们，不受影响）。
- `assessCompleteness()` 新增两条阻断：`page-count-unverifiable`（分页器读不出来）、
  `total-unverified`（总数读不到，且分页也没能替代性证明抓全——"分页翻完+行数对齐+
  没有可归责的虚拟滚动截断"三者都成立才算"有其他确证已抓全的证据"，对应用户原话
  "分页 footer 显示最后一页且各页行数累加一致"）；且修正了
  `virtualScrollTruncated`——分页本身还没翻完时它跟 `pagination-incomplete` 说的是
  同一件事，不再重复计一条 blocker，只有分页已翻完（或报表本身不分页）时命中才算独立
  信号。
- **区分"设计内只抓第一页"与"本该抓全却没抓全"**：`keyword-magic` 这类大表默认只抓
  首页是正常用法——若唯一命中的 blocker 就是"没传 `--all-pages`"，标
  `status:'partial-by-design'`（退出码 0，不算失败）而不是 `unverified`；其余任何情况
  （包括同时命中别的问题，或因限额/渲染失败等其它原因中途停下）一律 `unverified`
  （退出码 3）。`status:'complete'` 只在所有信号都干净时出现，三态都带
  `pagesCaptured`/`pagesTotal`（不分页报表 `pagesTotal` 为 `null`），不用再翻
  `pagination` 字段算比例。八张报表通用。

（本条目全部改动均在离线状态下完成，未开浏览器实跑验证——按要求逐条补了脱敏离线测试，
但"这些修法上线后遇到真实页面是否还有没预料到的情况"仍待下一轮实跑确认。）

**同一个 `--session` 贯穿整轮勘测，面板只启动一次。**
启动一次 20–40 秒并消耗一次登录，报告本身只要十几秒。
一轮读十几张报告，每张都重新启动等于把时间和配额乘以十几倍。
脚本会检测会话是否已停在工具 origin 上并跳过启动，输出里的 `sessionReused` 说明走了哪条。

**`backlinks-overview` 有一个别处拿不到的强信号**：全站一条 follow 反链都没有时，
Semrush 会直接写「找不到 Follow 反向链接」。脚本解析成 `noFollowBacklinks: true`。
它比 `AS = 0` 更明确——AS 0 也可能只是数据太新，而这句话是关于 rel 的断言。

### 两条走不通的路由，别再花一小时重新发现

- **批量关键词分析不能用 URL 驱动。** 把换行连接的关键词塞进 `?q=`，
  页面会落在「批量分析」标签页上、参数被丢弃、表格为空。**一次查一个词。**
- **Keyword Magic 的关键词表格渲染不出来。** 主题云会水合，行不会，
  于是采集「成功」但一个关键词都没有。**改用 `--report keyword` 逐词查。**

### `opencli eval` 返回裸字符串时没有 JSON 信封

`eval` 的返回值是字符串时，stdout 里就是那个裸字符串，`firstJson()` 会抛
`OpenCLI returned no JSON payload`。**所有 eval 表达式都用 `JSON.stringify(...)` 包一层**，
调用侧再兜一层 try。2026-08-21 有个一次性脚本因为这个在第一步直接崩掉，
现象是「OpenCLI 坏了」，实际是返回值形状。


### `backlinks-overview` 的「找不到 Follow 反向链接」不等于零（2026-08-21 实测）

概览页会在 Authority Score 旁边打一句「**找不到 Follow 反向链接**」。
**不要把它当成「一条 follow 都没有」的字面结论。** 同一个域名、同一时刻，
`backlinks-list` 报告顶部的卡片写着「最佳 **2** · 带 follow 属性的反向链接」，
而逐条到源页面用 `curl` 核实，**至少 7 个来源发的是无 `rel` 属性的 follow 链**。

三个数字都是 Semrush 自己给的，口径各不相同：概览那句大概率是**质量过滤后**的说法
（垃圾网络发的 follow 不计入它的权重模型），不是爬虫计数。

**规矩：`rel` 只有一个可信来源——源页面上那个 `<a>` 标签本身。**
任何第三方面板的 follow/nofollow 列都只能用来排候选，不能写进 ledger 的 `rel_verified`。
这与「Reading a third-party list」里对 Dofollow 列的处置是同一条。

### 排名页全落在裸根域名时，解析器会静默吐空（2026-08-21 实战测试）

`semrush-report.mjs --report organic-positions` 的 URL 行匹配器曾经写成
`/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S/i`——**斜杠后面必须还有一个非空白字符**。
于是每一条排名页是裸根（`snapgen.ai/`，斜杠后面什么都没有）的行都被丢掉，
既不报错，也不留痕迹。

这不是边缘情况，是这个人群的**中位数情况**：新上线的 SaaS / AI 工具站，
自然流量基本全压在 `/` 上。2026-08-21 实测一批榜单站，**五个域名无一幸免**：

| 域名 | 修复前解析出 | 修复后 | 丢失 |
|---|---|---|---|
| snapgen.ai | 2 | 93 | 91 |
| ezmaker.ai | 51 | 100 | 49 |
| logomotion.design | 2 | 22 | 20 |
| foziscribe.ai | 8 | 14 | 6 |
| agenton.me | 2 | 5 | 3 |

危险的地方在 `ezmaker.ai` 那一行：51 行看着完全正常，没有任何理由去怀疑它。
测试者当场只发现了 snapgen.ai 一个，并且据 `logomotion.design` 那 2 行写下
「这个站几乎没有自然排名」——**结论是错的，而他不知道**。

已修（斜杠后不再要求字符）。留在这里是因为它示范了一类比选择器写错更难发现的
故障：**页面完全就绪、渲染完整、脚本退出码 0，错的是解析器自己的正则。**
Skill 里原有的四个坑全都是「页面还没好就去读」，这一个不是，所以四条老经验
一条都拦不住它。

推论，写给下一个写解析器的人：**行数是可以被证伪的。** 拿 `rawText` 里符合
「一行一条记录」特征的行数，和 `parsed.rows.length` 对一次，差额就是你正则的
盲区。这个自查比任何就绪判定都便宜。

### 会话复用之后，配额读数就消失了（2026-08-21 实战测试）

`lib-tools-share.mjs` 只在面板/仪表盘页面上刮 `API 今日配额` 那段文字。
复用会话跳过启动器——也就是本文件明确推荐、用来省时间省配额的那条路——
页面不会重新渲染那段文字，所以**后续每一次 `semrush-report.mjs` /
`semrush-keyword.mjs` 调用都不再打印配额**。

后果很具体：「配额过 80% 就停」这类预算纪律，在推荐工作流下**无法在中途执行**。
实测一轮 5 份域名报表 + 13 个关键词查询，全程只有最开始那一次启动打印过
`["3%", "33%"]`，跑完拿不到第二个读数。

所以：**按启动时那一个读数给整轮 recon 做预算**，别指望中途还能看到。
真要中途复核，只能额外付一次启动的钱（20–40 秒），值不值自己权衡。

### 行数对不上的两种原因，别混为一谈（2026-08-21 复跑）

上一节的自查——「拿 `rawText` 的记录行数和 `parsed.rows.length` 对一次」——
在复跑里当场抓到了问题，也当场制造了一次假警报。差额有两个来源，方向相反：

| 比较 | 差额说明什么 | 该怎么办 |
|---|---|---|
| `rawText` 的记录行 **>** `parsed.rows.length` | **正则有盲区**，行到手了被你丢了 | 修解析器 |
| 页面自报的总数（`自然搜索排名: N`）**>** `rawText` 里的行 | 行**根本没到你手上**：这些表是虚拟滚动，一次只挂载一部分 | 已知天花板，要全量只能走导出，而导出计入配额 |

复跑同一批域名，两种同时出现：`foziscribe.ai` 14/14、`logomotion.design` 22/22、
`agenton.me` 5/5 与页面自报完全吻合（证明解析器是对的），而 `ezmaker.ai`
解析出 91 行、页面自报 430——那是第二种，`semrush-report.mjs:288` 的注释里
早就写着「页面只渲染前 10 行……想要全量必须走导出」。

**报告时必须说清是哪一种。** 把虚拟滚动写成「解析器修好了」，
等于承诺了一份你并没有拿到的全量数据。

### 两个搜索量数字打架时，别停在「工具不可信」——拿第三个指标闭环（2026-08-22）

`keyword-research` 项目里，同一批日文关键词的搜索量，Semrush 和 seo.web.cafe
（`rankup` skill 记录的另一个工具，见 `rankup/references/seo-webcafe.md`）给出的数字
差了 19–58 倍：

| 词 | Semrush | seo.web.cafe | 倍数 |
|---|---|---|---|
| 悪口診断 | 201,000–246,000 | 4,210 | 约 48–58× |

第一反应是「两边都错过一次，所以谁的数字都不能当绝对值用，只能拿来排序」——
这个结论**当场看似谨慎，实际是错的**，而且错了一周：一个本可以证伪的问题被
当成了不可证伪的问题去搁置。

**方法：换一个测的是不同东西的第三个指标，把两边都摁到算术里。** 搜索量是估算，
但一个域名的**真实访问量**不是估算，是观测。选一个在争议词上排名 #1 的域名，
反推它需要多少次搜索才能撑起观测到的点击量，谁的数字撑不住谁就被证伪。

以 `waruguchi16.jp`（悪口診断系列词的 #1 站）为例，完整算式：

1. **拿真实流量。** Similarweb：`totalVisits` 28 天 55,947 次 → 折合每月约
   59,943 次；`Organic Search` 渠道占比 59.78%。两个数字相乘：
   **59,943 × 59.78% ≈ 35,834 次/月的自然搜索点击**。这里用的是 Similarweb 的
   **渠道占比**，不是总访问量本身——「Similarweb 流量 vs Semrush 流量口径不同」
   （见本文件上方 Similarweb/Semrush role 两节，以及 `SKILL.md` 的 division 表）
   在这里不是要回避的坑，而是**闭环成立的前提**：总访问量里混着直接访问、社媒、
   买量，不能拿来跟自然搜索关键词的搜索量比，必须先用 Organic Search 占比把它
   过滤成「自然搜索贡献了多少访问」，才能跟搜索量做除法。
2. **拿候选站的关键词全库。** 用 Semrush 拉这个域名的 `organic-positions`，
   六个主力词全部排名 #1 附近，量加总 **287,300 次/月**。
3. **除一下。** Semrush 口径下，这个站要撑起 35,834 次点击，隐含点击率
   = 35,834 / 287,300 ≈ **12.5%**。#1 位置的典型 CTR 是 25–35%，12.5% 偏低但
   不是不可能——这个站 94% 流量来自移动端，日文移动 SERP 的广告位和 SERP
   feature 会吃掉大量点击。**判定：Semrush 的量级站得住，可能虚高 2–3 倍。**
4. **反过来验证 seo.web.cafe。** 它给的量比 Semrush 低 48 倍，六个词加总只有
   约 5,985 次/月，而这个站实打实收到 35,834 次自然点击。隐含点击率
   = 35,834 / 5,985 ≈ **599%**——平均每次搜索点了接近六次。**这在算术上不可能，
   证伪。**

**规矩，写成动作而不是提醒：两个搜索量数字差出 3 倍以上时，必须在数字进入任何
决策之前跑完这四步**（选 #1 域名 → Similarweb 拿自然搜索点击 → Semrush 拿该域名
关键词量加总 → 除出隐含 CTR，判断落在合理区间还是超出 100%）。
「两边方法论不同，谨慎使用」这种提醒在真实事故里试过——带着这两个数字的
subagent 依然回报「无法判定」，因为没人告诉它要去做这个除法。提醒不会让人
动手，写成必须执行的检查步骤才会。

**这一步验证的是「量」，不是「意图」。** 一个词哪怕真实搜索量被验证到
20 万/月，如果 SERP 显示搜索者要的东西你根本不卖，这个词照样没用——那是
SERP 构成的问题，不是任何搜索量数字能回答的，见
`rankup/references/webcafe-experiences.md`。

**证伪一个工具的一个功能，不等于证伪它的另一个功能。** seo.web.cafe 的
**搜索量估算**在这次闭环里被证伪了；它的 **SERP 构成读取**（把结果页实际排名
的站点列出来）不含估算模型，读的是页面本身，是目前拿得到的最硬证据，没有被
这次证伪波及。用哪张表做过哪个判断，必须分开记账。

### 闭环的两端不能接在同一个模型上（2026-08-22，独立 checker 抓到）

上一节的闭环之所以成立，是因为**分母来自一个独立信源**：Similarweb 的真实流量
和 Semrush 的关键词量是两家公司各自测的，一边错另一边不会跟着错。

**换一种域名，这个前提就没了。** 同一次调研里遇到一个综合工具站
（`took.jp`，约 10,500 个关键词，BMI 计算器、扑克牌型、彩票模拟器…诊断只是其中
一个工具）。全域闭环在这里没有意义——会把两百个不相关工具的点击混进来。
于是改用 **Semrush 自己的「页面流量份额 %」当分配键**，把真实自然点击摊到那一页上：

```
真实自然点击 66,550/月 × 该页份额 16.07% ≈ 10,700/月
10,700 ÷ 该词 165,000 = 6.5% 隐含 CTR   → 折价后 13–19%，看似过关
```

**但这个「过关」证明不了任何事。** 那个 16.07% 的份额是 Semrush 用它自己的量模型
算出来的，而**该页份额几乎全部由正在被检验的那个词贡献**。如果 165,000 是虚高的，
份额会朝同一个方向一起虚高，分子分母同步放大，**检查照样通过**。

**判据：一个分不清「量是对的」和「量以自洽的方式错着」的检查，不是闭环。**
它只能得出「真实流量没有反驳这个量」，不能得出「真实流量证实了这个量」——
这两句话的强度差得很远，写结论时不能混用。

所以：
- **分配键必须来自被检验模型之外**。拿不到独立的分配键，就承认这个词没做过闭环。
- 报告里给这类结果**单独一个证据等级**（例如 `proxy-only`），不要写成
  `closed-loop-verified` 的括号变体——读者扫表格时看到的是类别，不是括号里的让步。

### KD 显示 null 时，换一个端点再问一次（2026-08-22）

`semrush-keyword.mjs`（关键词概览端点）对一批词返回 `KD: null`，当时记成了
「不知道是真没评分还是页面没渲染完」。**同一次会话拉的 organic-positions 报告里
就有这些词的非空 KD**（陰キャ診断 KD 18、性格の悪さ診断 KD 19）。

这是**端点差异，不是谜**。关键词概览拿不到 KD 时，先去 `semrush-report.mjs
--report organic-positions` 的表里找——那里按词逐行带 KD。把一个能查证的差异
写成「原因不明」，会让后来的人重新花时间查一遍。
