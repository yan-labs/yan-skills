# Backlink discovery loop

Use this reference when the user asks to find new backlink opportunities rather
than operate an already-known target.

## Source idea

The workflow comes from the Web.Cafe post “博客评论外链自动发现和自动发布插件原理讲解”.
Its useful insight is a recursive graph, not blind mass commenting:

1. Start with a relevant competitor or known successful site.
2. Obtain its backlink rows from a logged-in Semrush/Ahrefs browser session,
   an authorized export, or another permitted source.
3. Classify each backlink URL. Keep real articles with public comments, profile
   pages, directories, resource pages, and editorial mentions separate.
4. Open likely article pages and inspect the comment area.
5. Extract external commenter website domains with
   `scripts/harvest-commenters.mjs`.
6. Add those domains to `scripts/discovery-queue.mjs`.
7. Fetch backlinks for the new domains and repeat at the next depth.
8. Stop expansion when new qualified domains per batch falls sharply, the
   configured depth is reached, or sources become off-topic/spam-heavy.

## Data-source rule

Prefer an existing OpenCLI adapter. If none exists, use a named OpenCLI browser
session and inspect `opencli browser <session> network` only inside the user's
authorized, logged-in account. Do not bypass CAPTCHA, rate limits, subscription
gates, or export limits. Never print cookies, authorization headers, or raw
credentials into logs or Skill files.

## Qualification

Score candidates on:

- topical relevance to the promoted page;
- public page quality and recent maintenance;
- content originality / Information Gain — does the page show original data,
  first-hand experience, or genuine expertise, or does it just restate what
  other pages already say? Post-March-2026-Core-Update, a page with real
  Information Gain is a stronger link source: it is more likely to rank and
  more likely to be cited in AI Overviews/AI Mode, both of which raise what a
  link from it is worth. [2026-08] This supplements traffic, quality, and
  maintenance below — it does not replace any of them;
- visible organic traffic or ranking evidence when available;
- outbound-domain saturation;
- no-login/public form availability;
- moderation and brand safety;
- whether the resulting link is publicly visible;
- observed `rel` attribute, recorded only after publication.

Treat comment links as auxiliary links. Low-authority comment volume may help a
low-competition site discover opportunities, but it is not a substitute for
editorial links in a competitive niche. Do not repeat unsupported causal claims
that backlinks alone caused traffic growth.

## Parallel lane: forum lists and automation-network footprints

Run this lane beside competitor/commenter expansion when a forum post or shared
table claims hundreds of comment targets:

1. Save the exact source URL and ingest the list as assertions, not verified
   channels, with `third-party-list-ingest.mjs`.
2. Match the normalized roots against `data/network-fingerprints.json` using
   `--blocklist`. A family match is emitted as `excluded`; it is never silently
   deleted, because the negative result is reusable backlink-audit evidence.
3. Cluster the remainder by repeated page title, form-field signature, template
   copy, CSS class, analytics ID, and shared comment backend. Count a cluster as
   one network event until independent operation is actually demonstrated.
4. Send only independent survivors into the ordinary traffic screen and page
   inspection loop. DR, DA, a live homepage, a visible Register button, or a
   third-party “dofollow” column cannot undo a network-family rejection.
5. Keep explicit exceptions. A legitimate platform accidentally mixed into a
   network list must be verified on its own; it does not inherit either the
   family rejection or the list's claimed authority.

```bash
node scripts/third-party-list-ingest.mjs \
  --input forum-list.md \
  --known data/free-channels.json \
  --blocklist data/network-fingerprints.json \
  --out .backlink/forum-leads.json
```

Measured 2026-08-27: the BlackHatWorld Money Robot thread contained 246 unique
roots. `full-design.com` was row 14; 172 roots still shared the fixed homepage
copy plus `motive-2017`. `edublogs.org` was retained as an explicit independent
exception, leaving 245 family-blocked roots. This is a discovery/filter source,
not a submission queue.

## Footprint discovery（搜索指令挖提交页）

A third, independent lane, beside competitor-backlink expansion and third-party
list ingestion: use Google search operators (a "footprint") to find submission
pages directly, without needing a seed competitor's backlink export at all.
Run it with `scripts/footprint-discover.mjs`. Everything below is
【实测 2026-09-12】 unless marked otherwise.

### The four-step pipeline

1. **footprint** — `scripts/footprint-discover.mjs` runs a small set of
   `<keyword> <operator>` queries against real Google, collects raw results,
   and shape-scores each URL. Collect-only, per
   <law-ref id="scripts-collect-ai-judges"/>: no row here is a verdict.
2. **形态过滤（shape filter）** — keep rows with `shapeScore >= 1` (the URL path
   itself contains `submit`/`submission`/`write-for-us`/`guest-post`/
   `add-your`/`directory`/`suggest`) and drop rows already `inLibrary` or
   `fingerprintHit`. This is a mechanical filter on the script's own output,
   not a new judgment.
3. **probe** — feed the survivors' domains into
   `scripts/probe-submission-targets.mjs` to confirm there is an actual
   reachable submission route and read off the gate.
4. **人工核（human review）→ 流量闸门 → 入库** — read the dumped raw HTML in
   `<probe-out>.evidence/` before trusting any `usable`/`open-form`
   suggestion (see "Probe false positives" below), run the traffic screen
   (references/traffic-screen.md) on survivors, then merge with
   `scripts/merge-submission-targets.mjs`. Nothing from this lane skips the
   ordinary qualification gates just because it came from a search operator.

```bash
node scripts/health.mjs
node scripts/footprint-discover.mjs --keyword "browser games" --preset submit \
  --num 20 --out .backlink/footprint-browser-games.jsonl
# build a lead list from the new/unlibraried/non-fingerprinted rows — the
# script prints the exact one-liner for this in its own final summary
node scripts/probe-submission-targets.mjs \
  --input .backlink/footprint-browser-games.jsonl.leads.json \
  --out .backlink/footprint-browser-games.probed.json --concurrency 8
```

### Why real Google, and nothing else

Tried and rejected as substitutes, in two rounds of manual testing:

- **General search APIs** (this repo tried `anysearch`) do not execute
  `inurl:`/`intitle:` at all — they silently run the plain-keyword part of the
  query and drop the operator, with no signal in the response that this
  happened. A footprint query through one of these degrades to an ordinary
  keyword search without anyone noticing.
- **Bing**, driven from a sandboxed browser, redirects by egress IP to a
  localized subdomain (`cn.bing.com` from a CN egress) and drops the operators
  there too — it cannot be a fallback for operator queries.
- **DuckDuckGo's HTML endpoint** answers without JS but also does not honor
  the operators — usable only as a last-resort plain-keyword degrade, never as
  an operator-query substitute.
- Only a **real Google SERP**, opened in the user's own logged-in Chrome via
  OpenCLI, actually executes `inurl:`/`intitle:`/quoted-phrase operators. This
  is why `footprint-discover.mjs` has exactly one engine implementation.

### CAPTCHA policy

In a sandboxed browser, Google starts showing a CAPTCHA / "unusual traffic"
interstitial from roughly the 4th query onward in one session (measured: 3
queries clean, the 4th blocked). `footprint-discover.mjs` does not evade,
retry through, or solve it — on any CAPTCHA signal it stops the run
immediately, writes a scene (census + screenshot) to `<out>.evidence/`, and
exits non-zero. Everything already written to `--out` before the stop is
kept; `--resume` continues later without re-running completed queries. This
is a real operating constraint, not a bug to route around — plan a sweep as
several short runs, not one long one.

### Effective footprints

| footprint | operator-hit rate | notes |
|---|---|---|
| `<kw> inurl:submit` | ~70% | best single footprint |
| `<kw> inurl:links "submit"` | ~56% | of 27 hits read by hand, ~25 were real submission pages |
| `<kw> "write for us"` | lower hit rate, but | fewest false positives of anything tried |

### Noisy footprints — kept out of the built-in templates on purpose

| footprint | why excluded |
|---|---|
| `<kw> inurl:resources` | only 4–12% real hit rate on real Google; almost every hit is a resource round-up post or a `.edu` page, not a submission form |
| `"add your site"` | dominated by SEO-agency sales pages and "how to submit your site to search engines" tutorials, not real targets |

### Keyword specificity matters

A specific vertical keyword ("browser games", "ai tools") beats a generic one
("web tools") — generic keywords pull in bulk directory-submission services
as noise, not real per-niche submission pages.

### Japanese footprints did not work

Two rounds of Japanese-language footprints (登録, 申請, 相互リンク募集中) produced
**zero** usable leads. Japanese-site submission-page slugs were plain English
(`/contact`, `/apply`) rather than a Japanese equivalent of "submit" — this
needs a different approach (probably: probe likely English slugs directly,
not a Japanese-language footprint), not more footprint variants in this
script.

### Overlap and yield, one measured run

Against the existing library, a footprint sweep's leads overlapped only ~8.5%
with what was already known, and known spam-network fingerprints matched
**zero** results — this lane finds genuinely different targets, not the same
ones by another route. After the URL-shape filter, probing confirmed a real
submission path on ~77% of survivors; the fraction that were zero-account
open forms ranged 22–48% depending on how vertical the seed keyword was (more
vertical → higher open-form share).

### Probe false positives — read the HTML before trusting `open-form`

`probe-submission-targets.mjs`'s classification is a suggestion (see
<law-ref id="scripts-collect-ai-judges"/>), and footprint-sourced leads hit its
blind spots more than curated lists do. Observed false positives labelled
`open-form`/`usable` that were not real submission pages:

- a WordPress theme's plain site-search box, not a submission form;
- `developer.apple.com` and other huge platform docs pages that happen to
  contain a form-shaped element;
- a company's own marketing homepage with a contact or newsletter form.

Always open `<probe-out>.evidence/<domain>.html` (or the live page) before
merging a footprint-sourced `open-form` row into the library.

## State separation

Keep these states distinct:

`candidate → qualified → drafted → filled → submitted → public → indexed → rel_verified`

Never infer a later state. In particular, a filled form, confirmation screen,
email, or pending moderation notice is not a public backlink.
