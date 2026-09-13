# The traffic screen: qualify a target before you fill its form

The qualifying test is **real traffic, not DR**, and it runs **before** the form
does. A directory with no measurable traffic cannot send a referral, cannot pass
a useful signal, and its DR is whatever its own network linked into it.

**Who does what is fixed: scripts collect, the AI judges, a human can re-check.**
The batch scripts produce evidence per domain — the measured raw value, a parse
status (`parsed` / `no-data-marker` / `none`), a raw-text excerpt, a screenshot
and full-text dump in `<out>.jsonl.evidence/`, and a `stopReason` saying how the
capture ended. They produce **no verdict**: whether a domain qualifies is
computed from the number at query time, and what an *absent* number means is a
judgment the AI makes by reading the evidence — never something a script bakes
into the data. A one-off mirror hiccup must stay re-checkable, not become a
permanent "fail" that silently kills a good target.

## The commands

```bash
# hundreds of domains, one login, ~5-10s each, resumable
node scripts/similarweb-batch.mjs --domains-file domains.txt --out sw.jsonl
node scripts/semrush-batch.mjs   --domains-file domains.txt --out sem.jsonl
# evidence lands next to the output: sw.jsonl.evidence/<domain>.png / .txt

# copy numbers + evidence paths into the table (repeatable --in; an incomplete
# row clears any stale same-source measurement instead of writing one)
node scripts/apply-traffic-screen.mjs --in sw.jsonl --source similarweb

# the threshold is computed here, from the measured number, at query time
node scripts/targets-select.mjs --cohort open --min-traffic 100
```

`traffic >= 100` monthly visits qualifies. That comparison lives in
`targets-select`'s filter, nowhere else — the data file stores measurements,
not conclusions. (`traffic.verdict` values still present in old rows are legacy:
historical script output, not measurement facts. Re-measuring replaces them;
`apply-traffic-screen --strip-legacy-verdicts` clears them wholesale.)

## Budget by quota, not by clock

Amortising the login gets a domain down to ~5s, which makes "a few hundred in
half an hour" look right. It is not: the panel's *API 今日配额* went from 13% to
100% at around domain 110, and every call after that timed out —
indistinguishable from a dead session, and the launcher's own error message
sends you off to change nodes.

Plan on **~120 domains per card per day**. Quota is per card, so when Similarweb
is spent, Semrush usually is not — switch and keep going, but record which one
measured each row. Similarweb reports *total visits* (global by default) and
Semrush reports *organic traffic* for whatever single country `--db` names (or
Semrush's own default if you omit it — never a global figure); those are not
the same number even before the geography difference, which is what
`traffic.source` exists for. Pass `--db` explicitly to `semrush-batch.mjs` when
comparing rows across a run, or the country underneath each `organicTraffic`
value is whatever Semrush happened to default to that day.

Both batch scripts break the circuit after 5 consecutive errors. Without it one
dead session burned 48 domains at 60s each before anyone noticed.

## "No data" and "timed out" are opposite evidence

**A domain the data source explicitly reports no data for is a completed
capture, not a tool failure** — the page rendered its own empty-state sentence,
and the row records `stopReason: empty-state` with `parse: no-data-marker`,
plus the screenshot and raw text in which the source said so. Whether that
means "below the measurement floor, effectively zero" is the **AI's judgment**,
made against that pair of witnesses — the script records the sentence, it does
not convert it into a conclusion.

**A timeout is not that evidence.** A slow render and a genuinely empty record
look identical at the moment the clock runs out, and they mean opposite things:
two directories with 2.4K and 4.6K organic visits were once written off as "no
traffic" by exactly that confusion. Timeouts and unstable reads are recorded as
`stopReason: timeout` / `unstable`, meaning *this check did not complete*;
resume retries them, and applying such a row **clears** any stale same-source
measurement it previously left on that domain — an incomplete capture must
never sit in the table impersonating one.

Before treating any row as "no data", be able to name the sentence in which the
source said so — it is in `rawExcerpt`, the `.txt` dump, and the screenshot.

## A rendered label is not a rendered number

These panels render metrics in **two beats**: first the label plus a placeholder
(`Authority Score` above a `0`, `总访问量` above a dash or the empty-state
sentence), then, seconds later, the real figure hydrates in. A readiness check
that fires on the label passes during the gap and reads the placeholder.

**It fails silently.** No error, no timeout — just a small or zero number that
travels all the way into a report. On 2026-08-23, `semrush-overview.mjs` over 8
domains returned `authorityScore: 0` for **6 of them**; the real values were 22,
29, 38, 15, 22, 26. The same beat cost `similarweb-batch.mjs` mmradar.gg, which
was written `below-floor` while actually serving 351,111 visits/mo.

The rule, for any script that scrapes a rendered number:

| Readiness judged on | Verdict |
|---|---|
| Page title / left-nav menu item | Wrong — present in the skeleton |
| The label (`Authority Score`, `总访问量`) | **Still wrong** — present before the value hydrates |
| **The value itself, identical across two consecutive reads** | Correct **for a value that is there** — see the limit below |

**Stability is a check on a value, not a licence to call an absence a result.**
Two identical reads of *nothing* is the normal picture for a page that loaded
`hidden` and for a route that never had a table at all; in both cases the check
passes and the run reports an emptiness that is not a fact about the domain. So
a stable **empty** parse needs the `visibilityState` triage below before it may
be recorded as a completed capture, while a stable non-empty value may be
written straight out.

`lib-tools-share.mjs` exports `captureStable({ read, fingerprint, timeoutMs,
intervalMs, needed, abortIf })` for exactly this. Fingerprint **every field you
are going to write out** — a fingerprint that watches A while the parser emits B
is not a stability check; the strongest form is to fingerprint the parser's own
output, which is what `semrush-report.mjs` does. Every other script that
scrapes a number goes through it (`--stable-interval` everywhere):

| Script | Fingerprint |
|---|---|
| `semrush-batch.mjs` | organic traffic + Authority Score |
| `similarweb-batch.mjs` | total visits + ranks, or the empty-state marker |
| `similarweb-query.mjs` | the report's own payload (metrics / channels / page text) **plus** the page's own rendered window label — a same-tab query can inherit the previous navigation's stale date range even though the new URL asked for a different one, so the window label is folded into the fingerprint rather than left out of what "stable" means |
| `semrush-report.mjs` | `spec.parse()`'s entire return value, all 6 reports |

`semrush-overview.mjs` (rewritten 2026-09-13) no longer goes through this
shared helper — its per-section readiness rule in `lib-semrush-overview.mjs`
is stricter: **each of the 23 sections** gets its own fingerprint that must
read stable twice **and** the page's network must be quiet in the same round
(CDP-captured `/dpa/rpc` sent count == resource-timing completed count, no
in-flight request, hook pending 0) before that section — and the whole page —
counts as done. See `SKILL.md`'s 「semrush-overview.mjs：整页抓取与完成判定」
subsection and `lib-semrush-overview.mjs` for the full state machine.

`abortIf` exists for states where waiting cannot help — the transient 「出错了」
page wants a reload, not a longer timeout, and without an early exit it burns
the whole budget first.

### Two identical reads is the floor, not the ceiling

Stability alone is **not sufficient**, because a placeholder is itself stable.
Live run, 2026-08-24, `semrush-batch.mjs` at its old defaults (settle 5s, 2s
interval, 40s cap): mmradar.gg came back `authorityScore: 0` again, and
na.whatismymmr.com / saveeditonline.com / vgcmulticalc.com were all written
`below-floor`. Real values: AS 22 / 29 / 38 / 22, traffic 22.3K / 2.9K / 175.7K
/ 16.9K. Two reads 2s apart both landed inside the same placeholder window.

Three rules came out of that run, and they are what makes the check hold:

| Rule | Why |
|---|---|
| **An all-null parse is never a result.** Keep polling; on timeout record `stopReason: timeout` | "Nothing parsed" and "nothing exists" are the same picture. This is what once turned three healthy sites into "no traffic" |
| **A self-contradictory parse needs ~6 reads, not 2.** Traffic > 0 with AS = 0 means AS has not hydrated (it lands after traffic) | A real 0 stays 0 for 18s; a placeholder flips |
| **Give the page room: settle 8s, poll 3s, cap 75s** | The old 5s/2s/40s budget could not outlast the placeholder window. ~25s per domain instead of ~16s |

After: 4/4 correct on the same domains, on both cards.

**Unstable is `stopReason: unstable`, never a number and never an empty-state
record.** If the values never settle, the run did not complete; say so and let
the resume retry it. The empty-state marker needs **three** consecutive reads,
not two, because it also shows up mid-hydration and `empty-state` is a
*completed* capture — resume never revisits it, so writing it off a hydration
flicker is permanent. An **empty parse** gets the same third read — but only
after you have ruled out the two failure shapes below, because a third read is
the wrong move for both of them.

### Read an empty table? Check `visibilityState` before you read again

There are **three** different things behind an empty parse, and re-reading only
fixes one of them. The first action after an empty read is to sample
`document.visibilityState` **inside the page, in the same eval as the data** —
not to read a third time.

| what you actually have | how you tell | what to do |
|---|---|---|
| **Not hydrated yet** | the read was taken under `visibilityState === 'hidden'` | a `visible` read is the cure; measured 0 cells hidden / 850 cells visible on the same route |
| **Class A — there was never a table** | **three consecutive reads under `visible`** still find zero table elements, charts only | re-reading is **wasted time**. The data exists as a chart, not a table; it needs a chart reader, and it is never a "no data" record |
| **Genuinely empty** | stable, `visible`, table present, zero rows | the empty state is the completed capture — what it *means* is judged from the evidence pair |

Never record a completed capture from a read taken while `hidden` — that read
is `inconclusive-hidden`, not an empty state and not "no data".

The measurements, the route lists, and the admissible-verdict protocol live in
one place: the `hidden-tabs-do-not-hydrate` law in this Skill's SKILL.md, which
is the authority. Read it before writing any readiness check, and extend it
there rather than growing a second account of the rule somewhere else.

The same beat governs **pagination**: the page-number indicator advances before
the table body swaps. Reading straight after the click yields the previous page's
rows, and row-level dedup then swallows them silently — five pages turned, twelve
new rows. `semrush-report.mjs --all-pages` now waits for a parse that is both
stable **and different from the previous page**, and when it cannot get one it
stops and says so: `pagination.complete: false` plus `stoppedBecause`, and a
`[truncated]` line on stderr. Silent truncation is the failure mode this Skill
bans outright.

Cost: two to three extra seconds per domain. That is the price of the number
being real.

## Scanning past a missing value invents one

Similarweb writes `-` for a metric it has no data for. The old `nextValue()`
scanned the eight lines after a label for anything matching `#?\s*[\d,]+`, with
no boundary and no whole-line anchor — so when the value was `-` it kept going
and grabbed a number from further down the page. Live, 2026-08-24:
na.whatismymmr.com reported `countryRank: 28` and `industryRank: 28`. The page
said `-` for all three ranks. The 28 came from **"Last 28 days (As of Aug 21)"**.

A site with 20K monthly visits ranked #28 in its country is absurd on its face,
which is the only reason it got caught. **A wrong number is worse than a missing
one** — it is not marked, not retried, and reads as data.

| Guard | Rule |
|---|---|
| Boundary | Stop at the next known label. Never scan into the following metric's block |
| Anchor | Match the **whole line** (`^#?[\d,]+$`), not a substring |
| Explicit empty | `-` / `—` / `N/A` means *this metric has no value*. Return null; do not keep looking |

`semrush-report.mjs` already had all three in its `pick()`. Similarweb did not,
because its parser had been **copied into two scripts** — so the fix had to land
twice and landed once. There is now exactly one copy, in `lib-similarweb.mjs`,
imported by both `similarweb-query.mjs` and `similarweb-batch.mjs`.

## Do not substitute a popularity list for measured traffic

Tranco's top-1M was tried as a cheap stand-in and failed on the labelled set:
**48 of the 73 known link-farm domains sat inside it**, spread from rank 134k to
998k, so no cutoff separates a farm from a small honest directory. Popularity
rank is fed by DNS resolutions and crawler requests — exactly the signals a
network manufactures for itself, the same reason DR is worthless here.

The general rule, which outlives this particular list: **validate a proposed
gate against known-bad domains, never against famous ones.** Recognising big
sites is not the problem a gate exists to solve.

Speed is not a reason to downgrade the metric. The panel login costs ~20s and
the query itself ~5s, so amortise the login across the batch (that is all
`similarweb-batch.mjs` does) instead of reaching for a weaker free signal.

## Three field signs that a batch is one link network

Any one of these means measure first:

- one site script across the batch, with field names identical to the character;
- a promotional sentence repeated **word for word** across dozens of domains — 
  similar pricing across a niche is a market, one sentence twenty times is a
  codebase;
- DR that exists while traffic does not.

## Why the order is not negotiable

One run filled every form across a 73-domain family and only then sampled five
of them for traffic: four returned no DR and no traffic at all, the fifth scored
bottom-tier with traffic down 89% in three months and a suspected penalty. Every
filled form was discarded.

Measuring a domain costs one query. Filling its form costs two orders of
magnitude more.

Submitting to N domains of one network buys **one** link's worth of value and
accrues **N times** the footprint, because the buyer's and the seller's link
graphs are the same graph. See [acquisition-doctrine.md](acquisition-doctrine.md)
§1.1 — and note that the doctrine's "post everywhere you can" was never a licence
to skip this: it governs topical irrelevance, and it always excluded link farms
in the same breath.

## Unmeasured is not qualified — and it is not unqualified either

The gate only works if rows without a measured number stay out of a batch
rather than being waved through. `targets-select.mjs --min-traffic` computes
the threshold from `traffic.monthlyVisits` at query time and excludes them by
design — but it reports them **separately on stderr as 未测/无数字, never as
failures**. A missing number has three possible causes (never measured, the
source printed its own empty state, the capture did not complete), they are
told apart by reading `traffic.evidence` (stopReason / screenshot / raw), and
that reading is the AI's or a human's job. `--unmeasured` lists these rows as
the next screening or review queue, never as a batch.

## 两家数字对不上，先问哪个问题

`traffic-crosscheck.mjs`（离线，吃一份 `semrush-traffic.mjs` 的 JSON 和一份
`similarweb-query.mjs --report performance` 的 JSON）**只出差值，不出判定**。
它给每个指标 `{semrush, similarweb, diff, diffUnit, diffBasis}`，两侧齐全标
`comparable: true`，缺一侧标 `comparable: false` 加缺值原因。没有 `verdict`
字段，没有 agree/diverge/conflict 分档，也**不因差异大小改退出码**。

以前它有一张写死的分档表（visits ≤15% 判「一致」、>50% 判「冲突」，占比 5pp，
页数/访问 25%），那些阈值没有任何一次实测支撑，却被输出成看起来像测量结论的
字段，还让一次成功的采集被 CI 读成失败。判读现在在这里，按这个顺序问：

| 先问 | 因为 |
|---|---|
| **1. 两侧窗口重合吗？** `caveats` 里逐条写着 | 实测那次 Semrush 是整月、Similarweb 的总访问量标 `Jul 2026 - Aug 2026`、参与度标 `Last 28 days`——**本来就不重合**。窗口错开一周，一个季节性站点差 30% 很正常 |
| **2. 口径是同一个吗？** | `.Trends` 的总访问量 vs `semrush-report.mjs` / `semrush-overview.mjs` 的自然搜索流量，两者不要混用也不要相加。移动/桌面的采样面板也不同 |
| **3. 这个站多大？** | 小站在两家的建模误差都大得多。canva.com 这个量级落在 2.4% 以内，一个月访问三千的站落在 ±60% 属于常态 |
| **4. 你要拿这个数干什么？** | 「够不够 100 月访问，值不值得填表」和「这个站到底多少流量，写进报告」对精度的要求差一个数量级 |
| **5. `orderOfMagnitude: true` 出现了吗？** | 这是**算术事实**（一侧是另一侧的 ≥10 倍或 ≤1/10 倍），不是「有一边错了」。最常见的成因排序：域名/子域搞错 → 一侧读到的是占位值（见上面「A rendered label is not a rendered number」）→ 窗口差太远 → 真的分歧。**先回去看那一侧的截图和 rawText**，再考虑第四种 |

三条不随场景改变的硬约束，脚本会替你守住：

- **平均访问时长永远不并列。** 两家对「一次访问」的定义不同，实测差 86%
  （11:02 vs 05:56），窗口不重合解释不了这个量级。脚本对它 `comparable: false`
  且**连 diff 都不算**——一个百分比摆在那里，读者就会拿去用。
- **域名对不上就拒绝，读不出域名也拒绝**，输出只有一个 `status: 'refused'`
  的壳、一条 metrics 都没有。2026-08-28 差点把 engineeringhardware.com 的数据
  记成 canva.com；「就当是同一个」比下去，产出的是一份看起来很像真的假报告。
- **缺值是缺值，不是 0，也不代表两家一致。** `missingValueMetrics` 单独列出，
  免得「没比成」被读成「比过了没问题」。

`noDataTextObserved: true`（Similarweb 侧页面正面渲染了「没有此网站的数据」
那句话）**不是拒绝互校的理由**，它是一条观测事实：脚本照常出报告，该侧各指标
落成 `comparable: false`，并在 `caveats` 里说明这句话是什么。它意味着「低于
测量下限」还是「域名写错了」还是「镜像抖动」，是读 rawText 和现场证据判的事。
