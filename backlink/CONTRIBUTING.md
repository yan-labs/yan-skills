# Contributing to the backlink Skill

This Skill is an open, shared database of **places where a link can actually be
published**, split into free channels and paid platforms. Pull requests are
welcome and are the point — one person can only verify so many channels, and
this genre decays fast enough that a list nobody maintains is worse than no list
at all.

Please read the one rule below before anything else.

## The one rule: record what you observed, never what you assume

The only thing that makes this database worth more than the dozens of
copy-pasted "500 free backlink sites" lists is that **every row here was seen in
a live page**. The moment unverified entries get in, and nobody can tell which
rows are observation and which are guesswork, the whole table's value does not
shrink — it goes to zero.

So: **a real entry rejected is a small loss; an unverified entry accepted is a
large one.** When you are not sure, open a PR with `status: "unverified"` and
say what you could not check. That is a genuinely useful contribution.

Concretely, do not write:

- a `rel` value you did not read out of the DOM;
- `indexable: true` without having looked at the `robots` meta **and** the
  `X-Robots-Tag` response header of the page carrying the link;
- "works / dead / no anchor" based only on `curl`. Many sites are
  client-rendered, and others answer 403 to scripted requests while serving
  browsers normally. **Plain HTTP can confirm that something IS present; it can
  never confirm that something is absent.** Negative claims need browser
  evidence, and the validator enforces this.

**The reverse trap exists too, so do not treat the browser as strictly better.**
A submission page can render with real fields, no visible login text and no
CAPTCHA badge anywhere in the DOM, and still be gated by an **invisible CAPTCHA
whose site key is only present as a string in the raw HTML** — inspecting the
rendered page misses it entirely. One sweep found exactly this on a page that
looked wide open. So the two methods catch different failures and neither
subsumes the other:

- grep the **raw HTML** for `recaptcha`, `hcaptcha`, `turnstile`, and
  `sitekey` — this catches invisible gating that rendering hides;
- **also grep for old-school CAPTCHA field names** — `name="CAPTCHA"`,
  `name="IMAGEHASH"`, `security_code`, `vercode`. A classic server-rendered
  image CAPTCHA loads no third-party script at all, so a service-name search
  returns clean on it. Measured: three sites running one legacy PHP directory
  script all returned `false` for recaptcha/hcaptcha/turnstile, yet two of them
  carried `IMAGEHASH` + `CAPTCHA` fields. Searching only for the modern services
  would have recorded both as open;
- use the **browser** to confirm anything absent, anything client-rendered,
  and the state of a form's later steps.

Related: when scanning visible text for a login wall or a price, **strip
`<script>` blocks first**. Minified JS is full of `$` and of words like
"signin", and matching against it produces confident false positives.

**HTTP 200 does not mean the channel is alive.** Domains get repurposed: one
sweep found former directories still serving 200 while now being a crypto
referral page, an unrelated consulting site, or someone's blog. Judge status on
what the page actually *is*, not on the status code — those are `dead`, and
recording them as reachable would keep a worthless row alive forever.

**A multi-step form is only verified as far as you actually walked it.** A first
step with no wall says nothing about step two, and a step literally named
something like "submission type" is usually where the free/paid choice lives.
Record such a channel as `unverified`, not `live`.

**Records go stale the same way lists elsewhere do.** If a real submission run
shows a field here no longer matches what you actually saw — a gate appeared
that the record doesn't list, a `captcha` value that was `none` now challenges
you, a `payment` that was free now gates the useful path — fixing the record is
part of finishing that run, not a separate task for later. See
`fix-data-on-mismatch` in `SKILL.md` and the write-back section of
`references/directory-run-playbook.md`.

## What a good contribution looks like

Ranked by how much they help:

1. **A trap.** A failure mode that produces a *plausible but wrong* result — a
   form that returns HTTP 200 and saves nothing, an editor whose value must be
   set through its own API, a bot check that only instantiates on submit. These
   save other people entire wasted campaigns. Adding one trap to an existing
   record beats adding a new record.
2. **A status correction.** A channel that died, started requiring an account,
   added a CAPTCHA, or went `noindex`. Decay is the main way this database goes
   wrong, and you are the only one who will notice.
3. **A verified new channel**, with evidence.
4. **A price check** on a paid platform, with the date you checked.

## How to submit

```bash
git clone https://github.com/yan-labs/yan-skills
cd yan-skills/backlink

# edit data/free-channels.json or data/paid-platforms.json

node scripts/validate-data.mjs      # must pass — CI runs exactly this
```

Then open a PR. In the description, say **how you verified it** — browser or
HTTP, what you saw, and ideally a link to a live page carrying a real
placement. A PR that adds rows without saying how they were checked will be
asked for that before anything else.

One channel or one correction per PR where practical. It keeps review honest.

### Never commit

- `.env`, tokens, cookies, session identifiers, or any credential. The
  repository ignores `*/.env`; do not work around that.
- Your own client's or employer's domain in `data/paid-platforms.json` — the
  registry merge script takes `--exclude-subject` for exactly this reason.
- Scraped personal data, or private URLs that were never meant to be public.

## Data model

Four files, four purposes. All live in `data/`, all have a JSON Schema in
`data/schema/`, and all are checked by `scripts/validate-data.mjs`.

### `data/free-channels.json` — publish at no cost

The fields that carry the weight:

| Field | Why it matters |
| --- | --- |
| `account` | `none` is the whole reason this file exists. Note that **"free" and "no registration" are different claims** — platforms conflate them, and at least one advertises a $0 fee behind a submit button that is literally labelled *Login*. That is `account: "required"`, not `"none"`. |
| `captcha` | `passive` clears itself in an ordinary browser with no user action. `interactive` means a real challenge; those are recorded as rejected. **This project does not solve or bypass CAPTCHAs.** |
| `anchorRendered` | Some platforms publish your URL as a plain text node. Those are worth nothing. Record `false` — do not omit the field and do not quietly drop the channel. |
| `relObserved` | The exact strings from the DOM. An empty string in the array means an anchor with no `rel` at all, i.e. dofollow. Omit the field entirely if you never checked. |
| `robotsObserved` | The exact `robots` meta content, or `null` when the tag is absent (absent means indexable). A page that links to you but cannot be indexed is not a win. |
| `scope` | `engine` means one codebase across many independent hosts. Engine records describe **mechanics only**. Per-host settings — `robots`, anti-bot questions, moderation — must be probed per host. A single-host sample once produced exactly the wrong generalisation here, so the validator rejects `scope: "engine"` combined with `indexable: true`. |
| `traps` | The highest-value field. See above. |
| `status` | `live` / `changed` / `dead` / `rejected` / `unverified`. `rejected` means it technically works but is disqualified — always give a `rejectReason`. |
| `lastVerifiedAt` | Anything `live` and older than 180 days gets a staleness warning. Re-verify or downgrade to `unverified`; do not just bump the date. |

**Dead records stay.** Set `status: "dead"` rather than deleting the row, and
never reuse an `id` for a different channel — the history would then point at
the wrong thing. The validator enforces id uniqueness.

### `data/submission-targets.json` — a route exists, nothing was published yet

This is the **first-pass library**, and it is deliberately a weaker claim than
`free-channels.json`. A row here says one thing: *somebody reached a submission
route on this domain and read what stands in front of it.* It says nothing about
`rel`, about whether an anchor is rendered, or about indexability — the validator
**rejects** those fields on this table, because a row that quietly acquires them
is a row that has started lying.

| Field | Why it matters |
| --- | --- |
| `gates` | **Every** gate observed, not just the first. A site can want an account and a CAPTCHA and an email confirmation; recording one of the three hides two thirds of what a submission costs. |
| `gate` | The one of `gates` that stops you first, ranked by **cost** — `personal-contact` > `reciprocal` > `account` > `captcha-interactive`. Not DOM order. |
| `cohort` | Which batch this belongs in, derived from `gates`. Campaigns are planned per cohort: `open` needs nobody present, `captcha` needs a human at the keyboard, `account` needs an identity decision up front. Mixing cohorts in one run is what makes a batch stall. |
| `status` | `usable` = route plus a form, no human-only gate. `gated` = route exists, a human must clear it. `unverified` = plain HTTP could not tell. `dead` = observed to be something else now. |
| `payment` | `optional` is the common and useful case: free listing behind a months-long queue, paid for fast-track. Record what the free path actually costs you in `notes`. |
| `evidence.finalUrl` | The only thing that catches a repurposed domain. A former directory still answering 200 from a crypto page is `dead`, and the status code alone will never tell you. |

`gates`, `gate` and `cohort` are **derived, never hand-written**: use
`cohortOf()` / `primaryGate()` from `scripts/lib-cohort.mjs`, and the validator
recomputes both and fails on a mismatch. Four hand-derivations produce four
answers, and a target that reads `account` in the data while a plan calls it
`open` is worse than an unlabelled row — somebody schedules a batch around it.

**Rows graduate.** The moment an actual anchor is observed on a live page, write
the channel into `free-channels.json` with its `relObserved` and
`anchorRendered`. Until then it stays here.

**Nothing is excluded for being low-quality.** Low DR, obscure, off-topic, and
ancient are all fine — those rank a target, they never disqualify one. See
[references/acquisition-doctrine.md](references/acquisition-doctrine.md). The
only exclusions are: unreachable, no route, or repurposed.

### `data/paid-platforms.json` — observed paid placement

This one is generated and merged by `scripts/paid-platform-registry.mjs` from
real backlink profiles, then annotated by hand. The column that matters is
`observedSites` — how many independent sites were seen placing links there.
A platform that keeps reappearing across unrelated subjects is one that is
actually being used; a platform seen once is an anecdote.

Tiers: `paid-listing` (a real directory charging a listing fee) ·
`link-package` (the offer is stated **in link count**) · `free-with-account` ·
`spam-net` (**blacklist**) · `not-a-platform` (a sitewide widget, genuine
editorial coverage, or an injection — big numbers, not an opportunity) ·
`unverified` (the default).

There are **two** admissible kinds of evidence here, and they are not the same
observation. `observedSites` records *who was seen buying* — the stronger signal,
and the reason this table exists. `observedPrice` records *what the platform
itself charges*, read off its own page; it needs `sourceUrl`, `checkedAt`, and a
`what` sentence. A row with neither is a rumour and the validator rejects it.
Do not fill `observedSites` with a site you did not actually see placed there in
order to get a priced row in — that corrupts the stronger signal to satisfy the
weaker one.

Never infer a price. Open the pricing page, fill in `price`, and fill in
`priceCheckedAt` — the validator requires the date, because a price without one
gets quoted as current long after it stops being true.

**Recording is not recommending.** This file exists so the decision is
*informed*. Whether to buy is the site owner's call. Do not relabel a
`link-package` as a "directory submission" to make it sound acceptable.

### `data/index-submission.json` — hand a URL to an engine, get no link

**Nothing in this file is a backlink.** These are index-submission endpoints:
you give a search engine a URL and receive a confirmation string. They earn a
place in a backlink Skill because the verify stage's `indexed` state never said
*whose* index, and because an engine outside the IndexNow membership receives
nothing from the usual automated push — so its pages have to be handed over by
hand.

Do not merge a row of this into `free-channels.json` to make the channel list
look longer. That file's contract is *a place that publishes a link*, and
`anchorRendered` / `relObserved` have no meaning here.

| Field | Why it matters |
| --- | --- |
| `independentIndex` + `indexNowMember` | Together they are the reason a row exists. An engine already covered by IndexNow, with no crawler of its own, needs no manual submission — the validator rejects that combination outright, because such a record invents work that accomplishes nothing. |
| `batch` | `false` means the cost of a site-wide submission is linear in page count. Say the number out loud before starting; 38 pages is 38 operations. |
| `aiGrounding` | The GEO argument, and the field most likely to rot into folklore. Record only what the operator publishes about its own index, with the URL that says it. **Never** record "assistant X uses index Y" — those pairings change quietly and are rarely confirmed by either party. |
| `traps` | Same role as in `free-channels.json`. Passive human checks are the recurring theme: one form ignores a synthesised `click()` entirely because the check demands a trusted event. Documenting that is not a bypass — the check still runs and clears itself, or the channel is rejected. |
| `evidence.what` | Say how many submissions were individually re-read. A campaign that confirmed 12 of 38 says 12 of 38; rounding that up to "all confirmed" is the exact failure this project exists to prevent. |

## Scope and conduct

Contributions are declined, regardless of technical merit, for: link farms and
auto-generated link networks; adult or malware surfaces; anything requiring a
CAPTCHA, login, paywall, or quota to be bypassed; hidden or cloaked links; and
channels whose live content is saturated with spam — that last one is a safety
judgement, and it is only visible if you read the neighbourhood before adding
the row.

Placement content is expected to be genuine and specific to the page it sits
on. Bulk-identical comments get deleted by moderators in batches, which wastes
the channel for everyone who comes after you. That is a practical argument, not
a moral one, and it is why these records track *mechanics* rather than supplying
templates to blast.
