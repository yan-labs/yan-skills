# Backlink operation safety

- Use the owner's truthful identity and product information.
- Never fabricate comments, endorsements, metrics, addresses, or personas.
- Require article-specific comments that add useful context; reject generic praise.
- Stop on login requirements, CAPTCHA, Turnstile, ambiguous forms, multiple
  candidate forms, paywalls, or changed DOM fingerprints.
- Default every OpenCLI browser session to background mode. Do not use foreground
  mode or click a launcher that steals focus unless the user explicitly requests it.
  Background mode is not headless — it drives the owner's real logged-in Chrome
  (`navigator.webdriver=false`, no Headless UA), so there is never a reason to
  reach for foreground to "look more human".
  ⚠️ **Corrected 2026-08-29.** This line used to claim background mode also gives
  you `visibilityState=visible`. It does not. The OpenCLI Skill's own measured
  record — repeated in its session-laws reference and its SKILL.md — is the
  opposite: throughout a background `open` / `eval` / `screenshot` / `click` /
  `type` run, the page reports `document.hasFocus()` permanently `false` and
  `visibilityState` permanently `hidden`. Read that as a *readiness* fact, not a
  stealth one: a background tab is not focused and not visible, which is exactly
  why the `hidden-tabs-do-not-hydrate` law in SKILL.md exists. Being unfocused is not a
  bot tell, so the conclusion (never reach for foreground) is unchanged.
  How the wrong version probably got in: the visibility-disguise patch — the one
  that redefines `document.visibilityState` to `visible` and used to also override
  `document.hasFocus` — makes *this exact claim* verify. Anyone who checked
  `visibilityState` with that patch installed saw "visible, confirmed", and the
  instrument, not the browser, is what answered. See the instrument-contamination
  lesson under `readiness-must-bind-to-this-query` in SKILL.md: before you take a
  signal as corroboration, confirm your own instrument has not touched it.
- Never hardcode a literal OpenCLI session name in a script. A session name is a
  tab claim; two concurrent tasks sharing one name share one tab and silently read
  back each other's pages. Suffix defaults with `CLAUDE_CODE_HOST_SESSION_ID` and
  always leave a `--session` override.
- Fill fields only. Keep the submit guard active and leave final submission to
  the user unless the user separately authorizes one exact submission after review.
- Never automate Google account-chooser clicks.
- Do not submit to adult, spam, malware, or link-farm pages.
- A different topic is NOT a reason to skip a target. Relevance ranks candidates,
  it does not gate them; when there is no relevant option, quantity wins. Keep the
  comment body specific to the article and put the link in the URL/name field.
  See [acquisition-doctrine.md](acquisition-doctrine.md).
- Do not use hidden reciprocal links, temporary eligibility pages, or cloaking.
- Do not resubmit an unconfirmed target; investigate its public state first.
- Before selecting any batch, read the project's `.backlink/ledger.json` and skip
  every domain already at submitted or later, plus rejected domains by default
  (`--include-rejected` only after confirming the rejection reason no longer
  applies). The Skill's target database is shared across projects; only the
  project's own ledger knows what that project has already sent. After the run,
  write every result back into the ledger — a run whose outcome never lands
  there is invisible to the next selection and gets submitted to again.
- Never call a link follow, indexed, authoritative, or traffic-producing without
  direct evidence for that exact claim.
- Respect robots.txt, terms, rate limits, paid-plan boundaries, and account scope.
