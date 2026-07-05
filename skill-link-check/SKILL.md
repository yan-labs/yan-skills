---
name: skill-link-check
description: Audit the .agents/skills and .claude/skills directories at both the current project (./) and the global home (~/) to verify the convention where .agents/skills holds the real source files and .claude/skills mirrors them via symlinks — either a single parent-directory symlink or per-child symlinks. Use this whenever the user mentions a skill not loading or not appearing, a /command that should exist but doesn't, .claude/skills or .agents/skills by name, skill symlink, missing skill, ghost skill, "skill 没生效", "skill 不一致", "为什么 skill 没识别到", "检查 skill 链接", or wants to check, audit, verify, or diagnose the skills directory layout — even if they don't say "symlink" explicitly. Also use when the user reports a skill exists in one of the two directories but not the other.
---

# Skill link check

Audits the layout convention used in this user's setup:

- `.agents/skills/<name>/` holds the **real** source files.
- `.claude/skills/<name>` mirrors them via a **symlink** into `.agents/skills`.

The most common drift mode is a skill that ended up in `.claude/skills/`
directly as a real folder and was never copied back to `.agents/skills/`. It
appears installed but isn't tracked alongside the other sources, so it gets
forgotten on backup, sync, or migration.

## How to run it

```bash
python3 "$(dirname "$0")/check.py"
```

By default the script audits two scopes:

- **Project** — `$PWD/.agents/skills` and `$PWD/.claude/skills`
- **Global** — `$HOME/.agents/skills` and `$HOME/.claude/skills`

A scope where neither directory exists is silently skipped (the user just
hasn't set up skills there). Exit code is non-zero when issues are found, so
the same script works in CI or a git hook.

## Two valid layouts

Both pass the check:

1. **Parent symlink** — `.claude/skills` itself is a symlink to
   `.agents/skills`. Every entry is then automatically consistent. This is
   what the user's global home uses today.
2. **Per-child symlinks** — `.claude/skills` is a real directory, and each
   `.claude/skills/<name>` is a symlink to `../../.agents/skills/<name>`.
   This is what `skill-creator` produces by default.

The script detects which mode is in use and applies the right rules.

## What the script flags

- `orphan-in-claude` — entry exists in `.claude/skills/` but has no
  counterpart in `.agents/skills/`. **This is the failure mode the user
  usually hits.** Lead with these in the report.
- `missing-link` — `.agents/skills/<name>` exists but `.claude/skills/<name>`
  does not, so the runtime won't actually find the skill.
- `not-symlink` — in per-child mode, `.claude/skills/<name>` is a real
  directory or file when it should be a symlink. Often a forgotten duplicate
  of the real entry in `.agents/skills/`.
- `broken-symlink` — symlink target is missing.
- `wrong-target` — symlink resolves but doesn't point into `.agents/skills/`,
  or points at the wrong skill.

## Reporting back to the user

After running the check:

1. Lead with the headline: total issues, broken down by category. Mention
   `orphan-in-claude` first if any — that's the case the user cares about.
2. List each issue with its name and one-line detail.
3. Include the suggested fix commands verbatim. The user copy-pastes them.
4. Do **not** apply fixes automatically. An "orphan" might be in-progress
   work the user hasn't moved into `.agents/skills/` yet, and silently
   relocating it could surprise them.

If everything is clean, say so in one line and stop.
