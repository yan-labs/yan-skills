---
name: codex
description: Run Codex CLI as a background sub-agent that doesn't block the main conversation. Use when the user asks to run Codex, spawn a Codex worker, or assemble an agent team where Codex handles code analysis/refactoring/editing in parallel with other agents. Always runs in background; uses Codex's default model (no `-m` flag) unless the user explicitly overrides.
---

# Codex Sub-Agent Skill

Codex runs as a **background sub-agent**: you launch it, immediately return control to the user, and poll or read output only when needed. This makes it usable both as a standalone background worker and as one member of a multi-agent team.

## Core Principle

**Never block the main conversation on a `codex exec` call.** Always launch via `Bash` with `run_in_background: true`. The only exception is a trivial `codex --version` health check.

## Launching a Codex Sub-Agent

1. **Pick reasoning effort + sandbox** from context — do not interrupt the user with `AskUserQuestion` unless they explicitly ask to be prompted. **Do not pass `-m` / `--model`**; let Codex use its default model from `~/.codex/config.toml`. Defaults:
   - Reasoning effort: `medium` (use `high`/`xhigh` for refactors, architecture, deep analysis; `low` for trivial edits)
   - Sandbox: `read-only` unless the task clearly needs edits (`workspace-write`) or network (`danger-full-access`)
2. **Write the prompt to a temp file** when it's non-trivial (multi-line, contains quotes, long context). Pipe it via stdin so quoting never breaks:
   ```bash
   cat /tmp/codex-prompt-<tag>.md | codex exec --skip-git-repo-check \
     --config model_reasoning_effort="medium" \
     --sandbox read-only \
     -C <workdir> 2>/dev/null
   ```
3. **Launch with `run_in_background: true`**. Record the returned shell id and a short tag (e.g. `codex-review`, `codex-refactor-auth`) so you can reference it later.
4. **Report the launch to the user in one line** — e.g. "Launched Codex sub-agent `codex-review` (medium effort, read-only) in background." Then continue with other work or wait for user input. Do NOT sit and poll.
5. **Always append `2>/dev/null`** to suppress thinking tokens on stderr unless the user is debugging Codex itself.
6. **Always pass `--skip-git-repo-check`**. Put all flags between `exec` and `resume` (if resuming).

## Checking Results

- When the background shell finishes, the harness notifies you. Read its output with `BashOutput` (or `Read` on the captured log file) — do not re-run the command.
- If the user asks for status mid-run, read the current buffer once and summarize progress; don't busy-loop.
- Summarize Codex's findings in the main thread in a few sentences. Link file:line references so the user can jump directly.
- After completion, tell the user they can resume with: `codex resume <tag>` → you will run `echo "<new prompt>" | codex exec --skip-git-repo-check resume --last 2>/dev/null` (no other flags on resume; session inherits model/effort/sandbox).

## Agent Teams (Parallel Codex Workers)

Codex sub-agents compose cleanly. To run an agent team:

1. Split the task into **independent** slices (e.g. "review auth layer", "review billing layer", "draft migration", "write tests"). Dependent steps must stay sequential.
2. For each slice, write a prompt file and launch a separate background `Bash` call in the **same message** (parallel tool calls). Give each a distinct tag and, if they write, a distinct `-C` workdir or separate git worktree to avoid edit collisions.
3. Track the set: tag → shell id → one-line goal. Keep this list short in the user-facing update.
4. As workers finish, fold their findings into a single synthesis. If two workers disagree, surface the disagreement explicitly instead of silently picking one.
5. **Edit collisions:** never run two `workspace-write` Codex workers against the same files concurrently. Either serialize them, scope them to disjoint directories, or run each in its own `git worktree`.

### Team composition guidance
- **Reviewer team:** multiple `read-only` workers, each with a different lens (security, perf, API design). Cheap and fully parallel.
- **Builder + reviewer:** one `workspace-write` worker implements, then a `read-only` worker reviews the diff. Sequential, not parallel.
- **Cross-model adversarial:** pair a Codex worker with a Claude sub-agent (`Agent` tool) to challenge each other's output. See `adversarial-review` skill for the pattern.

## Model Selection

**Default behavior: do not pass `-m` / `--model`.** Codex picks the model from `~/.codex/config.toml`, which is where the user manages their preferred default. Only add an explicit `-m` flag when the user asks for a specific model by name in the current request.

**Reasoning effort:** `xhigh` (deep analysis) · `high` (refactor/architecture/security) · `medium` (standard default) · `low` (trivial).

Cached input is 90% off for 24h — reuse the same prompt prefix across workers when possible.

## Error Handling

- If `codex --version` or a launch fails, stop and report. Do not retry blindly.
- High-impact flags (`--full-auto`, `--sandbox danger-full-access`) still require explicit user permission before first use in a session — ask once, then reuse within scope.
- If a background worker exits non-zero, read its tail output, summarize the failure, and ask the user how to proceed.

## CLI Version

Check with `codex --version`. Default model is configured in `~/.codex/config.toml` — do not override it unless the user explicitly requests a different model.

## Anti-patterns

- Running `codex exec` in the foreground and making the user wait.
- Calling `AskUserQuestion` before every launch — decide from context.
- Spawning parallel `workspace-write` workers on overlapping paths.
- Polling a background shell in a tight loop instead of waiting for the completion notification.
- Forgetting `2>/dev/null` and flooding the main thread with thinking tokens.
