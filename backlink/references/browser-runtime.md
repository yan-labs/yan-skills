# Browser runtime — where the laws live now

**The measurements and the full laws moved to the `opencli` Skill.** That is now the
single source of truth for OpenCLI mechanics; this file keeps only the part that is
specific to backlink work, plus pointers.

```bash
npx skills add $SKILLS_SOURCE --skill opencli -g -y   # if not installed
```

| You need | Read |
|---|---|
| The four session laws + the measurements behind them (isolation counts, theft counts across concurrent agents, background-mode probes) | `opencli` Skill → `references/session-laws.md` |
| Diagnosing "something stole my tab", in the order the causes actually occur | `opencli` Skill → `references/session-laws.md` |
| The other two drivers and what they cost (agent-browser's two walls, Claude in Chrome's leak counts) | `opencli` Skill → `references/drivers.md` |
| Page driving: target contract, `match_level`, error codes, compounds, cost table | `opencli` Skill → `references/browser-driving.md` |
| `batch`, `sessions`, `cleanup` and which of them need our rebuilt extension | `opencli` Skill → `references/our-fork.md` |
| Bridge is red, `doctor` fails, contradictory error hints | `opencli` Skill → `references/troubleshooting.md` |

## The one-paragraph version, so you do not have to leave

`$backlink → scripts and policy → OpenCLI → the owner's authorized Chrome → website`.
A session name owns exactly one tab, so **N pages need N session names**; never hardcode a
session name (`opencli browser --help` opens with `work`, and everyone who copies it
collides); never use `tab new` / `tab select` / `open --tab` to hold several pages under one
name — all three fail **silently**; open every session you need up front before starting the
work loop. **Dedicated is the default**: an unfocused automation window, placed on a secondary display when available. CLI, extension 1.5.x and the JS wrapper agree on this default. Explicit `--window` or `OPENCLI_WINDOW` can override it. `--window foreground` steals the active tab; use it only through an explicit option when the person has to finish something by hand (a CAPTCHA or login). Quota-report scripts retain their existing virtual-display strategy. Older extensions must be updated to obtain dedicated placement.

If a read returns a page you did not navigate to, **suspect a session-name collision first**,
the site or the CLI last.

## Backlink-specific residue

- **JS callers use `scripts/opencli-core.mjs`** (in this Skill, not the `opencli` one).
  `defaultSession(base)` is the only correct way to build a session name — it resolves
  `OPENCLI_SESSION_SUFFIX` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_CODE_HOST_SESSION_ID` → pid.
  Never key off the HOST id directly: it is shared by every conversation inside one desktop
  app host, so it hands parallel tasks the same tab.

  That file is a vendored copy of `opencli/scripts/opencli-core.mjs`. It stays vendored on
  purpose — the 17 scripts here must run when the `opencli` Skill is not installed. Change
  one, change the other.

- **Subagents inherit the parent environment**, so several agents spawned inside one
  conversation resolve to the same default session. When fanning link work out across
  parallel agents, give each an explicit `--session` or a distinct `OPENCLI_SESSION_SUFFIX`.

- **This Skill has caused the collision itself**: `scripts/tools-share-open.mjs` once defaulted
  to the literal session `backlink-panel`, two concurrent tasks each ran it, and each read
  back pages the other had opened. Treat any literal default session name in this directory
  as a bug.

- Submission lanes lean on Law 2 (one session, one page) — see
  [submission-lanes.md](submission-lanes.md). Bulk table harvesting has its own throttling and
  silent-row-drop traps in [harvest.md](harvest.md); the `opencli` Skill covers the generic
  extraction ladder and the landing SOP, this Skill covers the campaign side.
