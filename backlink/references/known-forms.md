# Known-forms recipes: skip the re-exploration, keep every guard

`inspect-page.mjs` exists because a submission form is unknown territory: the
AI reads a full field census and a screenshot and decides what each control
is. That decision costs tokens, and it is wasted work the second time the
**same** target is submitted to again — the field names on `playlin.io` do
not change between one project's submission and the next one's.

A **known-forms recipe** is that one-time decision, written down once by a
human (or an AI, reviewed by a human) after a real, successful walk of the
target — inspect-page.mjs's census, a field-mapping call, and a confirmed
submission outcome. `scripts/submit-known.mjs` reads it and drives the same
target for a new project without re-deriving the mapping.

**What a recipe is not**: a way to skip any runtime safety check. Every guard
inspect-page.mjs / safe-fill.mjs / release-submit-guard.mjs carry still runs,
on the live page, every single time:

- the page is re-scanned with the exact same census `inspect-page.mjs` uses
  (`scripts/lib-form-scan.mjs`, extracted 2026-09-12 so there is only one copy
  of that DOM walk) — a recipe never fills blind from a cached page shape;
- `safe-fill.mjs` still does the actual write, with its own live re-check of
  page identity, form identity, field identity, CAPTCHA, and login, exactly
  as it does for an AI-derived fingerprint. `submit-known.mjs` only changes
  *how the fingerprint is built* — from the recipe's field-map rules instead
  of from inspect-page's heuristic classifier — not what safe-fill.mjs does
  with it;
- `release-submit-guard.mjs` is still the only thing that lifts the guard,
  immediately before the real click;
- a form's own terms/consent checkbox is still never ticked on the driver's
  own initiative (submission-lanes.md's hard rule). `submit-known.mjs` always
  stops at `staged-terms` unless the caller passes `--confirm-terms` on that
  exact run;
- an `account`-cohort recipe still refuses to run at all without
  `--confirmed-login` on that exact run — scripting the field mapping away
  must not also script away the human "is this login still valid right now"
  decision.

So: **a recipe only ever removes the AI-reads-the-census-and-guesses step.**
Whether a submission cohort runs unattended or needs a human in the loop is
still governed by `references/submission-lanes.md`, unchanged.

## When a recipe is valid — and when it is not

A recipe is valid **only** for the exact field structure it was verified
against. If the target's markup changes — a renamed field, a restructured
form, a newly added required field, a CAPTCHA that did not used to be there —
`submit-known.mjs`'s own form-picker (`pickForm()`) will fail to resolve the
recipe's rules against the live census and the run stops with
`state: "recipe-stale"`, pointing back at `inspect-page.mjs`. It does not fall
back to guessing. When that happens: re-run `inspect-page.mjs` on the URL by
hand, re-derive the field mapping from the fresh census, and update the
recipe file — do not try to patch around a stale rule.

A recipe is therefore a bet that a specific, already-vetted target's HTML is
stable between runs, not a claim that it will stay that way forever.

## The recipe file: `scripts/known-forms/<domain>.json`

One file per domain. Fields:

| Field | Meaning |
|---|---|
| `domain` | must match the filename stem; `submit-known.mjs` checks this |
| `route` | the submission URL |
| `cohort` | `open` / `account` / … — same vocabulary as `scripts/lib-cohort.mjs`, for a human reading the file, not machine-enforced by itself (`requireConfirmedLogin` is what the driver actually checks) |
| `requireConfirmedLogin` | `true` for any account-gated target. Forces `--confirmed-login` |
| `sessionPrefix` | base for the derived OpenCLI session name (`<prefix>-<project>`) |
| `refreshParam` | optional query param (e.g. `"ref"`) the driver sets to `<project>` to force a fresh, uncached load — see `submission-lanes.md`'s one-session-per-staged-site note; this is the equivalent for a repeatable open-form target |
| `verifiedAt` / `verifiedBy` | when and how the recipe was worked out — provenance, not enforced |
| `notes` | free text: WHY the field mapping looks the way it does, any known runtime quirks, anything a future reader needs before trusting this file. **Do not skip this** — see the two shipped recipes for the level of detail expected |
| `fieldMap` | `{ url, name, email, description } → { match: { name?, id?, type?, tag? } }`. Each `match` is matched **exactly** (no regex) against one fieldCensus entry's real `name`/`id`/`type`/`tag` from a live scan. This is the one-time human decision the recipe exists to record |
| `payloadRequired` / `payloadOptional` | which of the four kinds must be present in the payload before the driver will run |
| `extraFields` | fields outside safe-fill.mjs's four kinds — currently `<select>` pickers (category, pricing, …). Each entry: `match` (same shape as fieldMap), `payloadKey` (which payload field supplies the value), `default` (used when the payload omits it) |
| `termsCheckbox` | optional. `match` for a consent/terms checkbox. If present, the driver always stages (never ticks it) unless `--confirm-terms` |
| `submit` | `match` for the real submit control |
| `retryClickIfNoChange` | `true` if this target's submit handler is known to sometimes not fire on the first click (AJAX timing quirks). The driver retries the same real click exactly once, only when this is set |
| `success` | `{ type: "navigation", urlIncludes, textIncludes }` for a target that redirects to a thank-you page, or `{ type: "inline-text", textIncludes }` for one that confirms in place (AJAX). This is deliberately **not** routed through `lib-submit-outcome.mjs`'s generic classifier — that classifier treats a form that stays present-but-empty as a negative signal, which is exactly the confirmed-positive shape on some AJAX targets (see the `projectpedia.net` recipe's notes for why). A recipe's success rule only has to be right for the one target it was verified against |

## Adding a recipe for a new target

1. Run the full manual flow once, for real, on the actual target:
   `inspect-page.mjs` → read the census by hand (or let the AI read it) →
   decide the field mapping → `safe-fill.mjs` → review → `release-submit-guard.mjs`
   → the real submit → confirm the outcome the way `directory-run-playbook.md`
   describes (own eyes on a thank-you page or the inline success text, not the
   driver's self-report).
2. From that same census, write down the **exact** `name`/`id`/`type` for
   each control you used — copy them from the `fieldCensus` array in the scan
   output, do not retype from memory. Watch for a field whose internal name
   lies about what it holds (see `projectpedia.net.json`'s notes: its
   `form_fields[email]` is actually the site-URL field).
3. Write `scripts/known-forms/<domain>.json` using the table above. Fill in
   `notes` with anything a future run needs to know that is not obvious from
   the field names alone.
4. Validate the recipe without creating a duplicate submission: run
   `node scripts/submit-known.mjs --domain <domain> --project <any-slug> --payload <payload.json> --dry-run`
   (add `--confirmed-login` for an account-cohort recipe). This runs the
   entire pipeline — scan, form-pick, safe-fill's live guard, extra fields,
   terms-checkbox detection — and stops immediately before the real click,
   without touching the ledger. Compare the evidence screenshot against what
   you expect filled where.
5. Once the recipe is trusted, real runs for new projects are just
   `node scripts/submit-known.mjs --domain <domain> --project <slug> --payload <payload.json> --submit`
   (plus `--confirmed-login` / `--confirm-terms` as the recipe requires).
6. If a later run reports `recipe-stale`, or an `outcome-unknown` that turns
   out to mean the site changed, fix the recipe file the same way
   `directory-run-playbook.md` §六 says to fix `data/submission-targets.json`
   on a mismatch — do not leave a recipe silently wrong for the next run.

## Shipped recipes (as of 2026-09-12)

- **`playlin.io.json`** — `cohort: open`. inspect-page.mjs's heuristic
  classifier marks this form `qualifies: false` (three name-like fields —
  `game_name` / `submitter_name` / `creator_name` — collide under its generic
  "name" pattern with no way to disambiguate). The recipe's exact-name
  `fieldMap` resolves it in one deterministic pass. Verified end-to-end
  through the `/submit/thank-you/` page with "SUBMISSION RECEIVED".
- **`projectpedia.net.json`** — `cohort: account`. A Fluent-Forms-style
  WordPress form whose internal field ids are opaque (`form_fields[email]` is
  actually the site-URL field; the real contact email is a differently-named
  field) and which carries a genuine terms/consent checkbox — this recipe
  will always stop at `staged-terms` without an explicit `--confirm-terms`.
  Verified end-to-end through the inline "Your submission was successful."
  confirmation while logged in; also carries the known first-click-sometimes-
  does-not-fire AJAX quirk via `retryClickIfNoChange`.

Both were re-validated with `--dry-run` on 2026-09-12 against the live pages
(without re-submitting) as part of building this mechanism — evidence
screenshots confirmed the field mapping still lands in the right inputs.
