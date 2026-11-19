---
name: backlink
description: Use for backlink work - finding, qualifying, submitting, analyzing or verifying backlinks, directory and blog-comment placements, competitor link sources, anchors, toxic links and disavow, outreach templates, and reading Ahrefs, Semrush or Similarweb backlink and traffic reports (外链、反链、去哪发、提交目录、评论外链、发出去没有、毒性、disavow、竞品外链、竞品导流、数据面板). This Skill owns what to read from those reports and which placements to pursue. Not for generic logged-in browser driving, sessions or doctor faults (use opencli), and not for sitemap, IndexNow or Search Console indexing operations (use rankup); index-submission here is only a reference kept apart from backlinks.
---

共享工具地址示例使用 `proxy.example.com` 占位；运行前在本机环境设置 `TOOLS_SHARE_DOMAIN` 为实际服务域名，backlink 脚本也可写入本机 `backlink/.env`。

<skill name="backlink" version="3.3.1" body-format="xml">

<why-xml>
The frontmatter above stays YAML because the Skill loader reads it for
discovery. Everything below is XML because this Skill is mostly laws and
routing, and a law that is easy to skim past is a law that gets broken. Tagged
blocks make "which rule did I just violate" answerable by name.
</why-xml>

<mission>
One business Skill for the complete backlink lifecycle. Do not split it back
apart, and do not create another browser-extension Skill — OpenCLI and its
Chrome extension are the connector underneath this Skill, never a separate
business workflow.

Two former Skills were merged in on 2026-08-16 and deleted: `backlink-analyzer`
(analysis templates, toxicity rubric, outreach — now in three references under
its original Apache-2.0 licence) and `browser-harvest` (pulling tables out of
logged-in dashboards — now <ref file="references/harvest.md"/>). The harvest
knowledge is general-purpose: ad platforms, e-commerce backends, any no-API
SaaS report. When a harvesting task has nothing to do with links, load this
Skill anyway and read that one reference.
</mission>

<map>
<summary>
Two things live here and they answer different questions. **The data files are
the asset; the references are how to use them and how not to fool yourself.**
</summary>
<tree><ref file="references/skill-inventory.md"/> — data files, script commands, and reference index; read when locating a tool.</tree>
<path-rule>Resolve every path in this file and its references relative to this SKILL.md.</path-rule>
</map>

<routing>
Choose the closest entry. For more user phrasings and specific platform pages, read <ref file="references/intent-routing.md"/>.

| Ask | Start |
|---|---|
| 去哪发、批量提交 | `node scripts/targets-select.mjs --stats`; <ref file="references/submission-lanes.md"/>; 100+ targets: <ref file="references/batch-campaign.md"/> |
| 免费免注册、即时发布 | `data/free-channels.json` (`account:none`, `status:live`); <ref file="references/instant-publish.md"/> |
| 竞品外链、新机会 | <ref file="references/discovery-loop.md"/> and Semrush platform manual; write leads back to registry |
| 质量、毒性、要不要 disavow | <ref file="references/link-quality-rubric.md"/> and `data/network-fingerprints.json` |
| 发出去了没有 | <workflow-ref id="verify"/>; inspect exact public anchor and rel |
| 索引提交 | <ref file="references/index-submission.md"/>; it publishes no backlink |
| Semrush/Similarweb 报表、流量 | <ref file="references/authorized-data-sources.md"/>; platform manuals under `../platforms/` |
| 没有 API 的后台表格 | <ref file="references/harvest.md"/> |

Query the database instead of guessing from examples:
<cmd><![CDATA[
node scripts/targets-select.mjs --stats
node scripts/paid-platform-registry.mjs list --min-sites 2
]]></cmd>
</routing>

<browser-runtime>
<summary>Use OpenCLI with the owner's authorized Chrome. Run `node scripts/health.mjs` before browser work; read <ref file="references/browser-runtime.md"/>. The full measurements, failure cases, and commands are in <ref file="references/browser-runtime-detail.md"/>. For dated Semrush/Similarweb route findings read <ref file="references/platform-capabilities.md"/>.</summary>
<law id="one-session-one-tab">One descriptive session name owns one tab; give parallel pages distinct sessions and close each after use.</law>
<law id="tools-share-is-a-global-mutex">Hold the shared dashboard tool lock for a whole collection; use the existing launcher and its session.</law>
<law id="no-multi-tab-api">Do not use `tab new`, `tab select`, or `open --tab` to hold several pages under one session name; use separate sessions.</law>
<law id="no-literal-session-name">Never use a shared literal default session name; use `defaultSession(base)` or an explicit descriptive, unique name.</law>
<law id="claim-handles-first">Claim all needed session handles before starting a parallel browser loop.</law>
<law id="background-by-default">Use dedicated for routine page work: a separate, unfocused window on a secondary display when available. Foreground requires an explicit option for human interaction. Quota-report routes retain their script's existing virtual-display/active strategy.</law>
<law id="hidden-tabs-do-not-hydrate">A hidden, empty report is inconclusive. Check actual visibility and the value-bearing region; follow the route-specific readiness rule before calling it empty.</law>
<law id="readiness-must-bind-to-this-query">Bind a report to the requested route, target, scope, and content before classifying values. Headers, skeletons, or a prior target's numbers do not prove readiness.</law>
<law id="every-measurement-needs-two-witnesses">For unfamiliar report routes use `scripts/ground-truth.mjs`: pair a deep DOM census with a screenshot; scripts collect and the AI judges.</law>
<law id="one-collector-per-quota-tool">One collector at a time for a shared quota tool; keep one session through the task and budget quota before the batch.</law>
<law id="scripts-collect-ai-judges">Treat machine classifications and empty states as suggestions until the evidence scene supports the verdict.</law>
</browser-runtime>

<data-sources>
<terminology lang="zh">
**当用户说「数据面板」「数据勘测」「查一下数据」「用 Similarweb 看看」「Semrush 拉一下」，
指的都是同一件事：走那个共享账号的代理面板，用 Similarweb 或 Semrush 查。**
这两个产品是这里唯一的第三方数据源，没有别的候选，不需要反问用户指的是哪个平台。
</terminology>
<division lang="zh">
分工固定，按问题类型选，一次只开一个：

| 问题 | 用哪个 | 拿得到什么 |
| --- | --- | --- |
| 这个站多大、流量从哪来、还有哪些同类站 | **Similarweb** | 总访问量（含直接/推荐）、渠道构成、相似站、地理分布 |
| 这个词多少量、多难、谁在排、它的外链长什么样 | **Semrush** | 分国家搜索量与 KD、关键词全库导出、自然排名、主要页面、引荐域名与反链 |

**两边的「流量」口径不同，对不上很正常。** Semrush 域名概览给的是**自然搜索流量估算**，
Similarweb 给的是**总访问量**。同一个站两边差三倍以上是常态，写结论时必须标明口径，
否则会得出「竞品比想象中弱」这种错误判断。绝不放进同一列。
</division>
<panel-launch>
Use `node scripts/tools-share-open.mjs --tool semrush` or `--tool similarweb`; reuse the same session for a task and check the landed route, target and quota. Semrush organic estimates and Similarweb total visits have different denominators. Panel launch, node quotas, and the Semrush overview criteria: <ref file="references/data-source-operations.md"/>. Tool account and source details: <ref file="references/authorized-data-sources.md"/>.
</panel-launch>
</data-sources>

<workflows>
<workflow id="explore" when="the user just wants to see what is on a page">
<statement>
Ad-hoc looking is still scripted work. Use OpenCLI so the look is replayable.
</statement>
<cmd><![CDATA[
# Name it after what you are looking at, per <law id="no-literal-session-name">:
# a unique-but-meaningless name still cannot answer "whose tab is this".
# Do NOT use $$ here — in Claude Code's Bash tool it changes every call.
S="explore-pricing"
opencli browser "$S" open "https://example.com/pricing"
opencli browser "$S" get url     # confirm you landed
opencli browser "$S" extract
opencli browser "$S" close
opencli browser "$S" tab list                        # expect [] 
]]></cmd>
<or>
For a public page where you want prices and paywall signals pulled out:
<cmd>node scripts/page-read.mjs --url https://example.com/pricing --out .backlink/pricing.json</cmd>
`page-read.mjs` reads only; it never fills or submits. `curl | grep` returns an
empty shell on the SPAs these sites are built with. Its `paywallSignals` are
matched text spans with context, paired with a screenshot in the evidence dir —
the one-time/subscription call is yours to make from those, the script no
longer emits verdict booleans.
</or>
<promote>
If you find yourself running the same exploration twice, that is the signal to
write a script for it. That is how every script in `scripts/` started.
</promote>
</workflow>

<workflow id="discover" when="the user wants new opportunities">
<read><ref file="references/discovery-loop.md"/></read>
<method>
Recursive discovery: seed competitors → get their backlink rows from an
authorized Semrush/Ahrefs export or logged-in browser → classify source URLs
(editorial, resource, directory, profile, comment, login wall, paid, CAPTCHA,
rejected) → harvest commenter domains on real article pages → feed those back
into the queue → repeat to a bounded depth. Rank by topical fit, page quality,
moderation, public visibility, and referral potential. Low-quality comment
volume is auxiliary, never the goal.
</method>
<cmd><![CDATA[
node scripts/discovery-queue.mjs seed --file .backlink/discovery.json --domain competitor.com

# bulk: feed an authorized referring-domains export straight in.
# Edges are typed `refdomain` — do NOT route these through import-commenters,
# which would record a commenter relationship nobody observed.
node scripts/discovery-queue.mjs import-refdomains --file .backlink/discovery.json \
  --source competitor.com --input .backlink/competitor-refdomains.csv

node scripts/harvest-commenters.mjs --session "discovery-commenters" --url https://example.com/article --out .backlink/commenters.json
node scripts/discovery-queue.mjs import-commenters --file .backlink/discovery.json --input .backlink/commenters.json
node scripts/discovery-queue.mjs next --file .backlink/discovery.json --limit 10
]]></cmd>
<footprint>
A second, non-recursive lane: search-operator footprints instead of competitor
backlink rows. `footprint-discover.mjs` prefers Serper.dev's API (a real
Google SERP over HTTP, no browser, no CAPTCHA) when `SERPER_API_KEY` is set —
its free tier caps operator queries at 10 results. Without a key it falls
back to the owner's own logged-in Chrome via OpenCLI, where a session hits a
CAPTCHA / "unusual traffic" wall after roughly 4 operator queries, and a
flagged exit IP gets blocked even from a fresh independent profile
(2026-09-12 agent-browser finding). General search APIs and Bing/DuckDuckGo
still do not execute `inurl:`/`intitle:` operators either way. See
references/discovery-loop.md § "Footprint discovery" for the effective/noisy
footprint table and the CAPTCHA policy before running a real sweep.
<cmd><![CDATA[
node scripts/health.mjs   # confirm opencli before opening a browser
node scripts/footprint-discover.mjs --keyword "browser games" --preset submit \
  --num 20 --out .backlink/footprint-browser-games.jsonl
# writes JSONL incrementally; stops and leaves a scene under
# .backlink/footprint-browser-games.jsonl.evidence/ on any CAPTCHA signal.
# --resume picks a stopped run back up later without re-running done queries.
]]></cmd>
</footprint>
<recon>
Domain overview is one page; `semrush-report.mjs` covers the other eight, which
have no export button and are where competitor recon actually happens. Five of
those eight (organic-overview/organic-positions/organic-pages/keyword-magic/
keyword-overview) have no worldwide option and land on an unpredictable country
without `--db` — pass it explicitly or the script exits with an error; the
other three (backlinks-list/referring-domains/backlinks-overview) aren't
country-scoped. **Pass the same
`--session` across the whole recon** — the panel launch costs 20–40s and a
login, the report itself ~15s, and `semrush-report.mjs` skips the launch when
the session is already parked on the tool origin (`sessionReused: true` says
which happened).
<cmd><![CDATA[
# Semrush is a quota site: the script resolves the session to the fixed
# `semrush-nav` itself, so do NOT pass --session. Passing one is ignored with a
# warning; the fixed name is what serialises concurrent callers into one tab.
node scripts/semrush-report.mjs --report keyword-overview --keyword 'grid maker' --db us
node scripts/semrush-report.mjs --report backlinks-overview --domain rival.com
node scripts/semrush-report.mjs --report organic-positions --domain rival.com --db us
opencli browser semrush-nav close
]]></cmd>
<note>
This is the one place a session legitimately handles several *reports* — it is
still one page at a time, navigated in sequence, which is what
<law-ref id="one-session-one-tab"/> allows. Holding them open simultaneously
would need N session names.
</note>
</recon>
<caution>
These metrics help discover and prioritize candidates. They never prove a
backlink is public, indexed, followable, or causally producing traffic. The
parsing traps that make a report silently return zeros are documented in
<ref file="references/authorized-data-sources.md"/> — read it before writing any
new reader, especially the rule that a readiness predicate must key on a **data
row**, never on a tab name, column header, or filter chip.

**Then check the parser against itself.** A ready page and a correct parse are
different claims, and the second one fails silently. One live run under-reported
**all five** domains it touched — the worst lost 91 rows of 93, and the one that
looked healthiest still lost 49 — with no error anywhere and a wrong written
conclusion on top.

The check is **two comparisons, and conflating them produces false alarms**:

<check level="1" compares="rawText vs parsed.rows.length">
Count the record-shaped lines in `rawText`, compare with `parsed.rows.length`.
A gap here means **your regex has a blind spot** — the rows arrived and you
dropped them. This is the silent, dangerous one. Fix the parser.
</check>
<check level="2" compares="the page's own headline count vs rawText">
Semrush prints its own total (`自然搜索排名: N`). If that exceeds what `rawText`
even contains, the rows **never reached you**: these tables are virtual-scroll
and only mount a fraction at a time, so a full pull needs the export, which
costs quota. This is a known ceiling, not a bug — say so rather than "fixed
the parser".
</check>

A live re-run shows both at once: three domains matched their headline exactly
(14/14, 22/22, 5/5) while one read 91 against a claimed 430. The first three
prove the parser; the fourth is level 2 and needs no fix.
</caution>
</workflow>

<workflow id="screen" when="before filling anything, always">
<statement>
The qualifying test is real traffic (`&gt;= 100` monthly visits), never DR, and it
runs BEFORE the form does. The division of labour is fixed: **scripts collect
evidence, the AI reads the evidence and judges, a human can re-check both.**
The batch scripts emit measured raw values plus a parse status, a raw-text
excerpt, a screenshot in `&lt;out&gt;.jsonl.evidence/`, and a `stopReason` — never a
pass/fail verdict. `apply-traffic-screen` copies numbers and evidence paths into
the table; the threshold is computed at query time by `targets-select`.
</statement>
<read><ref file="references/traffic-screen.md"/></read>
<cmd><![CDATA[
node scripts/similarweb-batch.mjs --domains-file domains.txt --out sw.jsonl
# rows: {totalVisits, parse, stopReason, rawExcerpt, evidence:{screenshot,raw}}
node scripts/apply-traffic-screen.mjs --in sw.jsonl --source similarweb
node scripts/targets-select.mjs --cohort open --min-traffic 100
]]></cmd>
<caution>
**A null value is NOT low traffic — it is an unmeasured or failed capture, and
treating it as a conclusion is banned.** `stopReason` tells you which:
`stable`/`empty-state` mean the capture completed (and `empty-state` means the
source itself printed a no-data sentence — whether that means "too small to
measure" is the AI's call, made against the screenshot and raw text);
`unstable`/`timeout`/`exception` mean *this check did not finish* — resume
retries them, and applying such a row clears any stale same-source measurement
instead of writing one. Rows without a number never fall into the "unqualified"
bucket: `targets-select --min-traffic` lists them separately and
`--unmeasured` queues them.
</caution>
<headline>
Measuring a domain costs one query; filling its form costs two orders of
magnitude more. One run filled every form across a 73-domain family and only
then sampled five for traffic — every filled form was discarded.
</headline>
</workflow>

<workflow id="submit" when="a route exists and the target passed the screen">
<read><ref file="references/submission-lanes.md"/></read>
<inspect>
Inspect every target independently. Never infer a form from a sibling site.
`inspect-page.mjs` outputs a **full form census** — every form, every field
(visible and hidden) with its semantic tuple and stable marker — plus a
captureScene pair (piercing census + screenshot) in the evidence dir. Its
`fillable` / `blocker` / `reason` / `selectedForm` fields are **heuristic
suggestions** (see the `suggested` note in the output), not verdicts: the AI
judges "can this page be filled, and what gates it" from the census and the
screenshot, and may overrule the suggestion. The mechanical rule safe-fill
still enforces: it only proceeds on one unambiguous qualifying form. A CAPTCHA
page may be staged only when the owner explicitly accepts normal human
completion; never bypass or solve it by an external CAPTCHA service.
<cmd><![CDATA[
node scripts/inspect-page.mjs --session "inspect-comment-scan" --mode comment \
  --url https://example.com/article --out .backlink/scan.json
]]></cmd>
Modes are `comment`, `directory`, or `auto`. Evidence lands in
`.backlink/scan.json.evidence/` (override with `--evidence-dir`).
</inspect>
<payload>
Create a reviewed JSON payload with truthful values. For comment mode,
`description` is the comment body.
<cmd><![CDATA[
{
  "url": "https://owned.example/relevant-page",
  "name": "Real owner or product name",
  "email": "owner@example.com",
  "description": "A page-specific, useful comment or truthful listing description"
}
]]></cmd>
</payload>
<fill>
<cmd><![CDATA[
node scripts/safe-fill.mjs --session "fill-submission" \
  --scan .backlink/scan.json --payload .backlink/payload.json
]]></cmd>
It revalidates the URL, form identity, field semantics, login state, and CAPTCHA
state, installs a submit guard, and never submits. The human reviews the
rendered page and performs final submission. Only after the user explicitly
authorizes one exact reviewed submission may the agent run
`release-submit-guard.mjs` — and releasing the guard still does not click
Submit.
When the owner has explicitly accepted normal CAPTCHA completion, add
`--allow-captcha`; this only permits guarded filling and leaves the CAPTCHA and
final submission untouched. CAPTCHA routes are always handoff-only. Once the
filled form is visibly ready for the owner, release only the guard with
`release-submit-guard.mjs --human-handoff`, then stop. The agent must not solve
the challenge or click Submit, even when a batch authorization already exists.
</fill>
<staged-queue>
Lane B leaves forms on screen for the owner to finish. **One session name per
staged site** — a session owns one tab, so reusing one session overwrites the
previous staged form while the report still says N staged. `adapter-phpld.mjs`
carries the reference implementation.
</staged-queue>
</workflow>

<workflow id="analyze" when="the user has exported backlink data already">
<statement>
Analyze referring-domain quality and topical relevance; suspicious networks,
sitewide links, and toxic patterns; anchor and target-page diversity;
follow/nofollow/UGC/sponsored distribution **when observed**; competitor gaps
and prioritized next opportunities.
</statement>
<read>
<ref file="references/link-quality-rubric.md"/> — scoring, toxicity, disavow.
<ref file="references/analysis-templates.md"/> — report shapes.
<ref file="references/outreach-templates.md"/> — frameworks; sending needs the
user's explicit approval per message.
</read>
<hard-limit>
These templates assume you already have the data. They do not fetch it. **A
report built from templates alone, with no observed rows behind it, is
fabrication.** Do not disavow links, contact site owners, or change production
sites unless the user separately asks. Treat third-party authority and traffic
estimates as directional and time-sensitive.
</hard-limit>
</workflow>

<workflow id="harvest" when="the numbers are visible in a logged-in dashboard with no API">
<read>
<ref file="references/harvest.md"/> before writing any scraping loop. It
documents failures that produce **plausible, silently wrong output**: virtual
scroll tables that are not `&lt;table&gt;` and drop rows without erroring, long URLs
that make whole rows vanish, execution-channel timeouts that look like failure
while the page loop is still running, and Chrome's intensive throttling
stretching a four-second loop into twenty-five minutes.
</read>
<cmd><![CDATA[
sh scripts/harvest-collect.sh          # wait for downloads to settle, then collect
node scripts/harvest-merge.mjs         # merge by field shape, refuse duplicate files
]]></cmd>
<note>
`scripts/harvest.browser.js` is the in-page collector. Its output arrives via a
Blob download rather than a return value, because the execution channel
truncates at roughly 1 KB.

**Reach for it only when you need the whole table as a file.** For reading a
report — "what does this page say", "is there data here at all" — use
<ref file="scripts/ground-truth.mjs"/> instead: it is the collector
<law-ref id="every-measurement-needs-two-witnesses"/> names, and harvest.browser.js
has exactly one witness (the DOM), no manifest, and no screenshot to contradict
it. When you do use harvest.browser.js, take the screenshots yourself.
</note>
</workflow>

<workflow id="verify" when="closing the loop on any placement">
<states>candidate → qualified → drafted → filled → submitted → public → indexed → rel_verified</states>
<cmd><![CDATA[
# Track a submission
node scripts/ledger.mjs upsert --file .backlink/ledger.json --url https://target.example/page
node scripts/ledger.mjs transition --file .backlink/ledger.json \
  --url https://target.example/page --state public \
  --evidence "Observed the exact public anchor on 2026-07-30"

# Per-project progress: what have I submitted vs what's left?
node scripts/ledger.mjs stats --file .backlink/ledger.json
node scripts/ledger.mjs remaining --file .backlink/ledger.json --min-traffic 100
node scripts/ledger.mjs remaining --file .backlink/ledger.json --cohort open --free-only

# Select next batch — reads .backlink/ledger.json by default (relative to
# cwd) and excludes submitted-or-later AND rejected domains with no flag needed
node scripts/targets-select.mjs --cohort open --min-traffic 100
]]></cmd>
<evidence-bar>
`submitted`, `public`, `indexed`, and `rel_verified` each require an evidence
note. Never promote a record from a filled form, a pending notice, or a
historical assumption. **`indexed` must name the engine** — `indexed@google`,
`indexed@brave`. An unqualified "indexed" is a claim about the whole web built
from one crawler's opinion.
</evidence-bar>
</workflow>
</workflows>

<rules type="non-negotiable">
<rule id="no-coordinate-clicking">No coordinate-based "human-like" clicking.</rule>
<rule id="no-bypass">No CAPTCHA, Turnstile, login, paywall, quota, or account-scope bypass.</rule>
<rule id="unmeasured-is-not-qualified">
Never treat "not yet measured" as "qualified". The traffic gate only works if
unmeasured rows are excluded from a batch rather than waved through.
`--min-traffic` drops them by design; `--unmeasured` lists them as the next
screening queue, never as a batch.
</rule>
<rule id="validate-gates-against-known-bad">
A gate metric is validated against known-bad domains, never against famous ones.
Any signal a link network can manufacture for itself — DR, popularity rank,
index size — will pass a farm. Tranco's top-1M failed exactly this way: 48 of 73
confirmed farm domains sat inside it, from rank 134k to 998k.
</rule>
<rule id="no-fabrication">
No generic praise, fake identity, invented metrics, or a comment body that
ignores the article it sits under. Never invent a product fact to fill a field —
founder, pricing, address, launch date, user count, ownership, legal, contact.
Leave optional unknowns blank and stop a row whose required field is unknown.
</rule>
<rule id="relevance-ranks-never-gates">
A host site on a different topic is fine. Relevance and DR **rank** candidates,
they never **gate** them, and `nofollow` is an observation to record rather than
a reason to skip. Read <ref file="references/acquisition-doctrine.md"/> before
rejecting any target on quality grounds.
</rule>
<rule id="no-link-farms">
No link farms, spam generators, adult/malware surfaces, hidden reciprocal links,
temporary eligibility pages, or cloaking. Two identical give-aways in one place
— one site script across dozens of domains, and a promotional sentence repeated
word for word — mean one operator. Submitting to N of its domains buys one
link's value while accruing N times the footprint.
</rule>
<rule id="submission-is-not-a-backlink">
Do not record a submission as a backlink. This includes handing a URL to a
search engine: that is an index-submission channel, it publishes no link, and it
belongs in `data/index-submission.json` rather than the placement ledger.
</rule>
<rule id="observe-before-recording">
Do not record `follow`, `nofollow`, `ugc`, `sponsored`, or `indexed` without
observing it for the exact URL. A click, a completed registration, a saved
draft, a form that cleared itself, or a generic thank-you URL is **not** evidence
of a submission — those record what you did, and the ledger records what the
site did.
</rule>
<rule id="never-retry-ambiguous">
Do not automatically resubmit an unconfirmed target. Never retry an ambiguous
final action — one where the submit happened and the result was not observed.
Check the account backend, then the mailbox, then the public page. That state is
`outcome-unknown`, and it is not a failure.
</rule>
<rule id="check-ledger-before-selecting">
Before selecting any batch, read the project's own `.backlink/ledger.json`.
A domain already at `submitted` or later (`public`, `indexed`, `rel_verified`)
is not selected again — the Skill's target database is shared across every
project, so "already submitted" is only ever true per-project, and only the
project's ledger knows it. `rejected` domains are skipped by the same default;
reopen one only after re-reading its notes and confirming the reason no longer
holds, via `--include-rejected`. `scripts/targets-select.mjs` does this
automatically from `.backlink/ledger.json` relative to the working directory —
running it from inside the project is enough, no flag required.
</rule>
<rule id="write-back-or-repeat">
A run that ends without writing its results back into the ledger (`ledger.mjs
upsert` + `transition`, with evidence for `submitted`/`public`/`indexed`/
`rel_verified`) is a run the next selection cannot see. The domain stays
eligible and gets submitted to again. Writing back is part of finishing the
batch, not an optional follow-up.
</rule>
<rule id="fix-data-on-mismatch">
The ledger records what a project did; `data/submission-targets.json` and
`data/free-channels.json` record what a channel **is**, and that second layer
goes stale the same way the first one does. Every time a real submission shows
the recorded gates or fields were wrong — a site the record marks open-form
now demands a login, a `captcha` the record calls `none` actually challenges
you, a channel the record calls free turns out to gate the useful path behind
payment, the route redirects somewhere new, or the site is dead — correcting
that record is part of finishing the run, not a follow-up. Fix the field
before the batch ends, append the date and what was observed to `notes`, and
run `scripts/validate-data.mjs` before you call the run done. A record left
wrong is not a neutral gap: the next selection reads it as true and repeats
the same mistake against the same site.
</rule>
<rule id="anchor-policy">
Anchor text is the brand, the product name, or the naked canonical URL. Never
request dofollow treatment, never repeat a commercial exact-match anchor across
a campaign, and treat a paid or incentivised placement that publishes as a plain
follow link as **noncompliant** rather than as a win.
</rule>
<rule id="secrets">
Records carry aliases and evidence IDs. Passwords, OTPs, recovery codes,
cookies, OAuth parameters, magic links, raw session IDs, raw email addresses,
and phone numbers belong in none of them. Keep raw cookies, tokens,
authorization headers, and credentials out of logs.
</rule>
<rule id="traffic-figures-need-six-fields">
A third-party traffic figure without `source · metric · month · geography ·
device · date verified` is not a number. Store all six or store none.
</rule>
<rule id="http-over-mcp">
Prefer a documented HTTP endpoint over an MCP server when both serve the same
data from the same quota — the MCP adds a connection and a process without
adding capability, and a failure there is harder to tell apart from the service
being down. Keep MCP where it is the only authorized channel; never retire a
working path before the replacement has run successfully once.
</rule>
<rule id="verify-before-trusting-a-row">
Records carry `lastVerifiedAt` because this genre dies faster than it changes. A
channel that worked three months ago may be gone, gated, or `noindex` today.
Re-verify before a campaign; the validator warns on anything `live` older than
180 days. **Fixing a wrong row is worth more than adding a new channel.**
</rule>
<rule id="two-tables-two-claims">
`free-channels.json` records **a published link on a live page** and requires
`relObserved`/`anchorRendered`. `submission-targets.json` records **a submission
route that exists** and the validator rejects those fields there. A target
graduates from the second into the first the moment an actual anchor is
observed; until then it makes no promise about `rel`, anchor text, or
indexability, and the report must not imply one.
</rule>
<rule id="closed-loop-volume-check">
Two volume sources disagreeing by more than ~3× is not evidence that "volume
is unreliable" — it is a resolvable arithmetic question, and you MUST resolve
it before either number enters a decision. Pick a domain ranking #1 for the
disputed keyword, get its real traffic and Organic-Search share from
Similarweb, and get its ranked keywords with volumes from Semrush. Divide
observed organic clicks by the candidate volume total to get an implied CTR:
under 40% is plausible, over 100% falsifies that volume. This validates
**volume only, never intent** — a keyword can clear the CTR check and still be
worthless if the SERP shows the searchers do not want what you sell. A
falsification of one function of a tool (its volume model) says nothing about
another function of the same tool (e.g. SERP-composition reads have no
estimation model and are unaffected). Full worked example:
<ref file="references/authorized-data-sources.md"/>.
</rule>

<rule id="volume-durability-check">
A closed-loop volume check validates **magnitude at one point in time**. It says
nothing about whether that demand persists, and the two questions need separate
evidence. Traffic tools report a trailing window, so a keyword measured during a
viral spike passes the CTR check with real, correctly-computed, and
already-obsolete numbers. Before a keyword is allowed to anchor a product line,
a page build, or a link campaign, pull a multi-year **Google Trends** curve for
it alongside a known-evergreen term in the same category. A term that is flat at
zero until one month, spikes, and decays is a fad — entering it means fighting
for a shrinking pool, and the incumbent's traffic collapse will be invisible in
rank data. The diagnostic that separates the two causes: if the incumbent still
holds #1 while its traffic falls, **demand fell, not rankings** — that is decay,
not a penalty, and no amount of link building recovers it. Real case: a keyword
verified closed-loop at 72k–143k/mo went to 2.2/100 on Trends within three
months while the #1 site kept its position and lost 87% of its traffic.
</rule>
</rules>

<escalation>
<summary>Read the reference **before** acting, not after the run goes wrong.</summary>
<when trigger="any browser work at all">references/browser-runtime.md</when>
<when trigger="any fill, submit, account, or logged-in action">references/safety-policy.md</when>
<when trigger="a supplied list of 100+ rows, or anything that must survive interruption">references/batch-campaign.md — the single-target loop deduplicates too late, stalls behind the first CAPTCHA, cannot tell an interrupted row from an unstarted one, and produces a number that counts forms instead of links</when>
<when trigger="about to actually submit to directories — authorization, hidden free tiers, no-fabrication, ledger hygiene">references/directory-run-playbook.md — a real run's difficulty is before and after the form, not in it: 4 of 5 successful submissions hid their free tier behind a paid upsell, one target was already listed without any submission, and a driver's ledger row went stale the moment someone else finished the job</when>
<when trigger="a first submission campaign">references/field-notes.md — personal-contact requirements outrank CAPTCHAs, and landing-page CAPTCHA scans give false negatives</when>
<when trigger="someone hands you a 'places to get backlinks' list">the "Reading a third-party list" section of references/instant-publish.md — a Dofollow column is an assertion about a platform, never an observation of a link</when>
<when trigger="the ask is about paid placement">references/paid-platforms.md</when>
<when trigger="the ask is about getting pages into an index rather than getting a link">references/index-submission.md</when>
<when trigger="about to reject a target on quality grounds">references/acquisition-doctrine.md</when>
<when trigger="BacklinkDirs eligibility">references/backlinkdirs.md</when>
<when trigger="the user wants a ready-to-copy prompt">references/prompts.md</when>
<when trigger="whose work is this built on">references/credits.md</when>
</escalation>

<output-contract>
<item n="1">data sources and authorization boundary</item>
<item n="2">candidates by type, and the reason for qualification or rejection</item>
<item n="3">current ledger state, never an inferred later state</item>
<item n="4">evidence links or local evidence files</item>
<item n="5">the next safe action, and whether human review or submission is required</item>
</output-contract>

<install>
Source: [Skills.sh](https://skills.sh/example-owner/yan-skills)
<cmd><![CDATA[
npx skills add $SKILLS_SOURCE --skill opencli -g -y    # install this FIRST
npx skills add $SKILLS_SOURCE --skill backlink -g -y   # first install
npx skills update backlink -g -y                            # update
]]></cmd>
For a project-level install omit `-g`; update with `npx skills update backlink -p -y`.

**`opencli` comes first.** Every browser action in this Skill runs through it, and
it carries the rules this Skill only summarises.

It also requires the OpenCLI binary **and browser extension** from
example-owner/OpenCLI releases（地址见本机配置） —
**not the Chrome Web Store build**. The store build defaults to foreground: it raises
a window and steals the tab the person is reading. That failure is silent — commands
still succeed, only the behaviour is wrong — so `opencli doctor` flags an extension
older than 1.0.32 explicitly. **When it does, act on it rather than working around it.**
</install>

</skill>
