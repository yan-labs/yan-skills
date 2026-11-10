---
name: codex
description: >-
  当用户明确要求直接操作 Codex CLI 作为后台代理（自选 sandbox、codex review、apply、resume 等原生命令，或用 git worktree 并行布置多个 worker）做代码分析、编辑、审查时使用。普通的“让 Codex 或 GPT-6 写代码、调研、review”派单走 agent-fleet（fleet code）；图片生成与网站视觉素材走 imagegen。
---

# Codex 后台代理

用 Codex CLI 承接用户指定的代码分析、编辑、审查或并行代理任务。图片生成的当前流程见 [`imagegen/SKILL.md`](../imagegen/SKILL.md)；旧版操作与实验记录保存在 [`references/image-experiments.md`](references/image-experiments.md)。

**路由前提**：按全局 `CLAUDE.md` §2，编码、修 bug、调研与 review 默认用 Terra（`fleet-go new --to gpt --simple`，见 [`agent-fleet`](../agent-fleet/skill/SKILL.md)），不手写 `codex exec`。本 Skill 只在用户明确要求直接操作 Codex CLI（自选 sandbox、`codex review`/`apply`/`resume` 等原生子命令、并行 worker 的 worktree 布置）时使用；简单派单不要先读本文件。

## Core Principle

**Never block the main conversation on a `codex exec` call.** Always launch via `Bash` with `run_in_background: true`. The only exception is a trivial `codex --version` health check.

## Launching a Codex Sub-Agent

1. **Pick reasoning effort + sandbox** from context — do not interrupt the user with `AskUserQuestion` unless they explicitly ask to be prompted. Model is `gpt-6.1-sol` (the default in `~/.codex/config.toml`; pass `-m` only when the user names another model in the current request). Defaults:
   - Reasoning effort: `medium`; `low` for single-file edits with clear boundaries. **Never escalate to `high`/`xhigh` on your own** (global §2); only when the user asks for it explicitly
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
5. 默认加 `2>/dev/null` 压低 stderr 噪音；排查启动失败或调试 CLI 时保留错误输出。
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
- **Independent review:** maker and checker must be different executors. Have another read-only Terra worker (`fleet-go new --to gpt --simple`) check the diff against the brief (global §4.3). Do not pair a Codex worker with a Claude sub-agent as the reviewer.

## Model Selection

**Default model: `gpt-6.1-sol`**, which `~/.codex/config.toml` already sets. Only add an explicit `-m` flag when the user asks for a different model by name in the current request.

**Reasoning effort:** `medium` (standard default) · `low` (single-file, clear boundaries). `high` and above are never chosen automatically; use them only on the user's explicit request.

Cached input is 90% off for 24h — reuse the same prompt prefix across workers when possible.

**Do not ration Codex calls and set no turn, context or time cap** (global §3). The owner's plan does not need protecting from extra workers; optimize for the right answer and run to the acceptance condition. A limit the user states explicitly always wins.

## Error Handling

- 如果 `codex --version` 或启动失败，先运行 `codex doctor` 并读取错误，**最多重试一次**；仍失败（含 402、登录失效、模型被拒、产物为空或含裸 tool-call 控制 token）就**停下并如实告知用户**，由用户决定。**不许静默改派 Claude subagent**，Claude subagent 也不得再派 Claude subagent。
- **Sandbox flags need no permission prompt on this machine.** The owner has granted
  standing authorization for `--full-auto` and `--sandbox danger-full-access`: it is
  their own single-user machine and they prefer agents to act rather than ask. Pick the
  sandbox the task needs and run. **Still disclose it** — the one-line launch report
  names the sandbox, so "no gate" never becomes "no visibility". Never use
  `AskUserQuestion` for a sandbox flag.
- If a background worker exits non-zero, read its tail output, summarize the failure, retry at most once after diagnosing, and if it still fails stop and tell the user. Exit code 0 is not acceptance: check the diff and artifacts.

## CLI surface worth knowing (verified against codex-cli 0.147.0, 2026-08-22)

The skill used to describe `exec` as if it were the whole CLI. It is not. Commands that
change what you would reach for:

| Command | What it does | When it beats `exec` |
|---|---|---|
| `codex review` | Non-interactive code review of the repo (also `codex exec review`) | A purpose-built reviewer — use it instead of hand-writing a "review this diff" prompt |
| `codex apply` | Applies the agent's latest diff to the working tree via `git apply` | Lets a `read-only` worker propose changes you land separately — safer than `workspace-write` |
| `codex doctor` | Diagnoses install, config, auth, runtime health | First move when a launch fails, before any retry |
| `codex fork` | Forks a past session | Explore a variant without destroying the original thread |
| `codex resume` / `archive` / `delete` / `unarchive` | Session lifecycle | Long-running work across days |
| `codex mcp` / `mcp-server` | Manage MCP servers, or run Codex itself as one | Codex can be a tool *for* another agent |
| `codex cloud` | Browse Codex Cloud tasks, apply locally (experimental) | Work started elsewhere |
| `codex update` · `codex features` | Self-update; inspect feature flags | Check before assuming a capability is missing |

Two `exec` flags the recipes above should use more:

- **`-o <FILE>` / `--output-last-message <FILE>`** — writes the agent's final message to a
  file. **Prefer this over scraping stdout**: stdout carries progress chatter, and parsing
  it is exactly the kind of silently-wrong extraction this workspace has been bitten by.
- **`--output-schema <FILE>`** — a JSON Schema constraining the final response shape. Use it
  whenever you need a structured result back, instead of asking for JSON in prose and hoping.

## CLI Version

Check with `codex --version`. Default model `gpt-6.1-sol` is configured in `~/.codex/config.toml` — do not override it unless the user explicitly requests a different model.

本 Skill 当前位于 `yan-skills/codex/`；安装位置和符号链接以实际工作树为准。

## Anti-patterns

- Running `codex exec` in the foreground and making the user wait.
- Calling `AskUserQuestion` before every launch — decide from context.
- **Asking permission for a sandbox flag.** Standing authorization exists on this machine; asking is friction, not safety. Disclose the sandbox in the launch line instead.
- Spawning parallel `workspace-write` workers on overlapping paths.
- Polling a background shell in a tight loop instead of waiting for the completion notification.
- Forgetting `2>/dev/null` and flooding the main thread with thinking tokens.
