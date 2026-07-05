---
name: agent-mode
description: >
  Switch the current task into English sub-agent dispatch mode. Translate the
  user's request into a self-contained English brief, then dispatch one or more
  sub-agents to own planning, implementation, verification, and iteration
  end-to-end. Activate when the user types /agent-mode, says "agent mode",
  "sub-agent mode", "agent team", "派给 agent", "让 sub agent 跑",
  "用英文 agent", or otherwise asks to hand the task off to sub-agents.
---

<SUBAGENT-STOP>
If you were dispatched as a sub-agent to execute a specific task, skip this skill. You are the executor; do not recursively dispatch.
</SUBAGENT-STOP>

# Agent Mode

You are switching from "do the task in this conversation" to "package the task into an English brief and dispatch a sub-agent (or a team) who owns it end-to-end". Stay in the user's language when talking to the user; the sub-agent and everything you write into its prompt must be in English.

## Why this mode exists

Two concrete reasons, in priority order:

1. **Token efficiency.** Chinese characters tokenize roughly 2-3× heavier than English under common BPE tokenizers. A sub-agent run that reads files, runs tests, and iterates through a fix can easily burn 50K-200K tokens. The same run in English fits in a smaller window and costs less. Over a long conversation this is the difference between "we can keep going" and "context exhausted".
2. **Documentation alignment.** Almost every library, framework, SDK, and CLI you'll touch has English identifiers, English error messages, English docs, and English commit conventions. An English brief lets the sub-agent grep / search / reason in the same language as the code, which removes a translation hop and reduces the chance of a near-miss like translating a CamelCase identifier into a Chinese paraphrase.

You should mention these reasons to the user only if they ask why; don't lecture them about it.

## Simplify principles every sub-agent must follow when coding

Every dispatched sub-agent must apply these three pillars while writing or editing code. They are the embedded core of the `/simplify` skill — applying them up-front prevents a rework round after merge. **Paste this whole section verbatim into the brief's `Constraints` block** when filling out the template; do not paraphrase, do not summarize, do not assume the sub-agent already knows it.

### Pillar 1 — Reuse

1. Search for existing utilities, helpers, and types before writing new ones. Common spots: util directories, shared modules, files adjacent to the change site.
2. Do not write a new function if an existing one already does the job. Use it.
3. Do not hand-roll inline logic — string manipulation, path handling, env checks, ad-hoc type guards, date formatting — when a project utility already covers the case.

### Pillar 2 — Quality (no hacky patterns)

1. **No redundant state.** Don't duplicate existing state, cache values that can be derived, or add observers/effects when a direct call works.
2. **No parameter sprawl.** Don't keep tacking new params onto a function — generalize or restructure instead.
3. **No copy-paste with slight variation.** Unify near-duplicate blocks into one shared abstraction.
4. **No leaky abstractions.** Don't expose internals that belong inside the module; don't break existing abstraction boundaries.
5. **No stringly-typed code.** Use the existing constants, string-union enums, or branded types instead of raw strings.
6. **No unnecessary JSX nesting.** Don't wrap with extra Boxes/elements when the inner component's own props (`flexShrink`, `alignItems`, etc.) already cover the layout.
7. **No nested conditionals 3+ levels deep.** Flatten ternary chains, nested if/else, and nested switch with early returns, guard clauses, lookup tables, or an if/else-if cascade.
8. **No unnecessary comments.** Don't narrate WHAT the code does (good names already do that), don't reference the task or caller, don't write change-history. Keep only non-obvious WHY: hidden constraints, subtle invariants, workarounds. (Aligns with the Kollab CLAUDE.md "注释规范".)

### Pillar 3 — Efficiency

1. **No unnecessary work.** Eliminate redundant computations, repeated file reads, duplicate API calls, N+1 patterns.
2. **Don't miss concurrency.** Independent operations should run in parallel, not sequentially.
3. **Don't bloat the hot path.** Don't add blocking work to startup, per-request, or per-render hot paths.
4. **Guard against recurring no-op updates.** State/store writes inside polling loops, intervals, or event handlers must be gated by change-detection. If a wrapper takes an updater/reducer callback, ensure it honors same-reference returns — otherwise upstream early-return no-ops are silently defeated.
5. **No TOCTOU existence checks.** Don't pre-check whether a file/resource exists before operating on it — operate directly and handle the error.
6. **Watch memory.** No unbounded growth, no missing cleanup, no leaked event listeners.
7. **Don't load more than you need.** Don't read whole files when a slice will do, don't load all items when filtering to one.

After every sub-agent commits, the main thread reviews the diff itself (Step 5c), merges the worktree back if one was used, then runs a real `/simplify` pass on the new commits (see Step 5). The three layers — sub-agent self-discipline, the main-thread review, and the post-commit `/simplify` — are all required; skipping any one leaves the loop half-open.

## When to activate

Activate without confirmation when the user types `/agent-mode` or any close variant ("agent mode", "sub-agent mode", "agent team", "subagent 模式", "派给 agent", "让 sub agent 跑", "用英文 agent 派发", "switch to agent mode", "hand this off"). The user has already decided.

Also activate proactively, with a one-line check-in, when the current task fits **all** of these:

- Multi-step work that will involve at least 5 tool calls
- The work is closed-loop (read → edit → verify) and doesn't need user check-ins along the way
- You're about to do the work yourself in the main thread

In that case, ask once: "用 agent-mode 派发？" and proceed if they say yes. Don't ask twice.

## The five-step workflow

### Step 1 — Lock the task scope before translating

Read enough of the user's recent messages and the relevant code to be sure you understand:

- What is the deliverable? (file changes, a research report, a plan, a verification result)
- What constraints exist? (don't touch X, must use Y framework, must follow `dev-kollab` rules, etc.)
- What's already known so the sub-agent doesn't re-investigate? (file paths with line numbers, validated facts, ruled-out hypotheses)
- What does "done" look like? (tests pass, a specific command succeeds, a doc is written)

If any of these is unclear, ask the user a single tight clarifying question in their language. Don't translate unfinished requirements into English — that just hands the sub-agent your confusion.

### Step 2 — Translate the task into a self-contained English brief

The sub-agent has zero conversation history. It cannot see what the user said five turns ago, cannot see your earlier diagnosis, cannot see the file you read. Everything it needs goes into the prompt.

Translate, don't summarize. Lossy translation is the most common failure mode. Specifically:

- Keep file paths, identifiers, function names, error messages, command snippets, log lines, and CLI flags **verbatim**. They're already English; don't paraphrase them.
- Keep numbers, IDs, version strings, and dates verbatim.
- Convert Chinese explanatory text into English at the same level of detail. If the user wrote a 5-sentence explanation, you write 5 English sentences, not "user wants to fix the bug".
- Keep the user's stated constraints as constraints, not as suggestions. "不要动 X" → "Do not modify X." Not "consider not modifying X."
- Preserve project conventions explicitly when relevant: "Follow `.claude/rules/coding-style.md`", "Follow the dev-kollab skill", "Use the existing `isWithinCooldown` pattern".

### Step 3 — Pick the right `subagent_type` and shape

| Situation | `subagent_type` | Notes |
| --- | --- | --- |
| Implementing code changes (most common) | `general-purpose` | All tools available |
| Read-only investigation, locating files, "where is X defined" | `Explore` | Cannot edit, faster, cheaper |
| Independent code review of a fix | `code-reviewer` | Adversarial lens |
| Architecture or refactor planning, not yet writing code | `planner` or `Plan` | Returns a plan, not edits |
| Cross-cutting redesign across many files | `architect` | Read-only with system-design framing |
| TDD-strict feature work | `tdd-guide` | Enforces write-tests-first |

When in doubt about the type, use `general-purpose`.

**The model is not a choice: every dispatch must pass `model="opus"` (Claude Opus), regardless of `subagent_type`.** Sub-agents own planning, implementation, and verification end-to-end with no user in the loop, so per-edit accuracy dominates token cost. Do not drop to a smaller model to save tokens, and do not omit the parameter — omitting it silently inherits the main-thread model instead of pinning Opus. (The Agent tool only accepts tier aliases, so `opus` resolves to whatever Claude Opus version the environment currently maps it to.)

### Step 4 — Single agent vs agent team, and decide whether to isolate

Default to a **single sub-agent** for one focused deliverable. A single agent runs in the main thread's checkout and commits directly to the current branch — no worktree, no merge-back step. This is the cheap path; pick anything else only when you have a concrete reason.

Spawn an **agent team** (multiple sub-agents) when:

- The work decomposes into independent subtasks that don't share state — for example, "fix bug A in file X" and "fix bug B in file Y" with no overlap.
- You want adversarial review: one agent implements, another reviews on a different model.
- You're running an investigation across multiple parts of a large codebase and you want parallel coverage.

Avoid teams for tightly-coupled work where one agent's output is another's input — sequential beats parallel-with-coordination-overhead in that case.

#### When to use `isolation="worktree"` (it's a fallback, not the default)

Worktree isolation is **not free**. It adds a verify-the-other-checkout step, a merge-back step, and any merge-conflict resolution that comes with it. Use it only when the cost is justified.

Decision tree:

1. **Single sub-agent → no worktree.** There is no concurrent peer to collide with. Run in the current checkout, commit on the current branch, done.
2. **Read-only team (review, investigation) → no worktree.** Nothing is being written, so there's nothing to merge.
3. **Writing team — first try sequential dispatch with no worktree.** Dispatch agent A, wait for its commit on the current branch, then dispatch agent B with A's commit hash already in its context. Same checkout, same branch, no worktree, no merge-back. This handles the common case cleanly.
4. **Writing team in parallel → worktree (the fallback).** Only when sequential is genuinely too slow *and* the speedup is worth the merge-back cost. In parallel without worktree, the agents share a single working tree and git index, which silently corrupts each other's edits and commits — so once you've decided you truly need parallelism, `isolation="worktree"` becomes mandatory for that dispatch.

If you do go parallel-with-worktree, dispatch all members in **a single message** with multiple `Agent` tool-use blocks (so they actually run concurrently), pass `isolation="worktree"` on each, and `run_in_background=true` so the main thread stays responsive.

#### Edit-conflict pre-check (do this whenever multiple agents will write code)

Whether you serialize in the main checkout or fan out with worktrees, list every file each agent will read or write and confirm:

1. **No two agents write the same file.** If they do, sequential is mandatory (parallel-with-worktree will just defer the conflict to merge time). Either re-scope so each agent owns disjoint files, or run them serially with the second agent told what the first one already changed.
2. **No two agents touch the same exported function/class/type — even across files.** Cross-file rename or signature changes will conflict on imports.
3. **Shared lockfiles, generated files, and snapshot files are write hot-spots.** `pnpm-lock.yaml`, `Cargo.lock`, generated SDK clients, OpenAPI snapshots — only one agent should touch them per dispatch round.
4. **Schema, migration, and config files are append-order sensitive.** If both agents add a migration, the second one must be re-numbered after merge.
5. **Same-area UI / i18n changes overlap silently.** Two agents adding strings to the same `locales/zh/<ns>.json` will JSON-merge-conflict on the trailing brace.

The pre-check is what tells you whether to serialize or to pay for parallel-with-worktree. Lots of expected overlap → serialize, or pay for worktree only if speed forces your hand. Truly disjoint writes → serialize is still simpler and avoids the worktree tax. Pick worktree only when the merge cost is unavoidable.

### Step 5 — Dispatch, verify, review, (merge back if you used worktree), then `/simplify`

Dispatching is only the first half. The full chain is **dispatch → verify commit → main-thread review → merge back (worktree only) → `/simplify` → report**. Skipping any applicable step leaves the loop half-open.

#### 5a — Dispatch

Dispatch the agent(s) per the Step 4 decision: in the main checkout for the default path, or with `isolation="worktree"` for the parallel-writing fallback. When a worktree is used, remember that **the worktree is not the deliverable** — the deliverable lives on the branch the main thread started on.

#### 5b — Verify the commit actually landed

The agent's reply is intent, not evidence. Always inspect the commit before trusting it.

Without worktree (default), the agent committed onto the current branch:

```bash
git log --oneline -5                    # does the new commit exist on this branch?
git show <hash>                         # does the diff match expectations?
```

With worktree, inspect the isolated checkout instead:

```bash
git worktree list                       # is the worktree dir still present?
git -C <worktree> log --oneline -5      # does HEAD have the expected commits?
git -C <worktree> show <hash>           # does the diff match expectations?
```

If the agent reported "done" but no commit landed (in either mode), the work is at risk. In a worktree, the working tree may already be cleaned up if the agent made no changes, in which case the work is gone — re-dispatch with corrected commit instructions, do not try to rescue. In the main checkout, uncommitted edits may still be sitting in the working tree; commit them or re-dispatch with explicit commit instructions, then move on.

#### 5c — Review the diff in the main thread (mandatory)

The main thread owns quality; the sub-agent's self-review is not a substitute. Once the commit is verified, read the actual diff (`git show <hash>`, or `git -C <worktree> show <hash>` for worktree dispatches) and review it against:

- **The brief.** Does the change do what the Goal says — and nothing else? Out-of-scope edits get reverted or split into their own commit, not waved through.
- **Correctness.** Edge cases, error handling, async/ordering issues, broken invariants in the surrounding code the agent may not have read.
- **Project rules.** The repo skills and conventions named in the brief (e.g. dev-kollab comment rules, i18n, store boundaries) — verify they were actually followed, not just acknowledged.
- **The Simplify pillars.** Obvious violations get fixed now or sent back.

If the project has a dedicated review skill (e.g. `review-kollab`) or `/code-review`, prefer running it over an ad-hoc read-through. When the review finds real problems, re-dispatch the same agent with the findings as a new brief section, or fix small issues directly in the main thread as a follow-up commit. Never merge or report a diff you wouldn't have written yourself.

#### 5d — Merge back to the current branch (only when a worktree was used)

Skip this step entirely if you dispatched without `isolation="worktree"` — the commit is already on the current branch.

When a worktree was used, its branch must be merged back into the branch the main thread started on. Without this step the user's branch never sees the change.

```bash
# from the main checkout (not from inside the worktree)
git fetch <worktree-path> <worktree-branch>:<worktree-branch>
git merge --no-ff <worktree-branch>     # or rebase, per repo convention
git worktree remove <worktree-path>     # clean up only after a successful merge
```

For multi-agent teams, merge them back **one at a time** in the order that minimizes conflicts (smaller / leaf-level changes first), and re-run the verification suite after each merge. If a conflict surfaces here, it means the Step 4 conflict pre-check was incomplete — resolve it now and tighten the pre-check next time.

Do not push. Do not delete the worktree until the merge has succeeded and tests are green; the worktree is the only safe rollback point.

#### 5e — Run `/simplify` on the new commits

Run `/simplify` once everything has landed on the current branch. Even when every sub-agent followed the simplify principles while coding, cross-agent duplication and near-misses (e.g., two agents independently writing the same helper) only show up after the commits sit side by side. `/simplify` will diff against the pre-dispatch ref, fan out three parallel review agents (reuse / quality / efficiency), and fix what they find.

If `/simplify` proposes large changes, treat them as ordinary edits and commit them on top of the existing commits — do not amend.

Only after this pass is the chain complete. Skipping it negates half the value of dispatching in the first place.

#### 5f — Report back to the user

Summarize back to the user **in their original language** (e.g., Chinese if they wrote Chinese). Include:

- What was changed (high level)
- Each sub-agent's commit hash (and, if worktrees were used, the merge commit hash plus a note that the worktrees were cleaned up after merge)
- The main-thread review result (clean, or what was found and how it was resolved — re-dispatched, fixed in a follow-up commit, or reverted)
- The `/simplify` pass result (what was fixed, or that the diff was already clean)
- Verification command output (last lines of `tsc` / `test` / `build`)

Don't paste full English agent transcripts — translate the result, keep the technical names verbatim.

## The brief template

Use this shape for every dispatched sub-agent prompt. Fill every section. Skip a section only if it genuinely doesn't apply, not because you're unsure.

```text
## Goal
<One sentence. The deliverable.>

## Context
<2-5 sentences explaining why this matters and what surrounding system this fits into. Pretend the agent just walked into the room.>

## What's already known (don't re-investigate)
- <Validated fact, file:line reference, or ruled-out hypothesis>
- <Another>

## Constraints
- <Hard rule from the user, e.g., "Do not touch apps/agentcore/**">
- <Project convention, e.g., "Follow .claude/rules/coding-style.md">
- <Repo-specific skill, e.g., "Follow the dev-kollab skill in .claude/skills/dev-kollab/">
- Apply the Simplify pillars while coding. Paste the three pillars VERBATIM here from the agent-mode skill — do not paraphrase:
  Pillar 1 — Reuse: <copy the 3 numbered items>
  Pillar 2 — Quality: <copy the 8 numbered items>
  Pillar 3 — Efficiency: <copy the 7 numbered items>

## Files in scope
This list is a CONTRACT. Do not edit files outside it. Do not make changes inside listed files beyond what the brief specifies. If you think you've found a bug or refactor opportunity that isn't listed, surface it under `Risks and follow-ups` in your reply — do not fix it.
- Read: <path:line-range>
- Modify: <path> — <one-line of what change is authorized in this file>
- Create: <path>
- Test: <path>

## Acceptance criteria
- <Concrete observable, e.g., "pnpm --filter fe-app test passes">
- <Another, e.g., "No new TypeScript errors when running tsc --noEmit">
- Self-review the final diff against the three Simplify pillars before commit; fix violations now rather than leaving them for the post-merge `/simplify` pass.

## Working agreement
- Make a single local commit with a clear conventional-commit message before exiting. Do NOT push. The main thread will review your diff and run `/simplify` afterward (and merge the worktree back first if you were dispatched into one).
- Do NOT merge to any other branch yourself. The main thread owns any merge step.
- If you cannot complete the task, still commit any partial progress with a "wip:" prefix and a note explaining what's left.
- If the task description seems wrong (e.g., the file doesn't exist, the constraint contradicts the goal), stop and report back rather than guessing.
- **Stay strictly in scope. Report, don't fix.** The `Files in scope` list is a contract: only edit files listed there, only make changes that directly serve the `Goal`. If while reading the code you spot something that looks broken, stale, inefficient, or "while I'm here I should also..." — do NOT fix it. Add it to the `Risks and follow-ups` section of your reply so the main thread can decide. This applies even to changes you believe are *related* or *required by* the goal — if the brief did not list it, you do not have authority to merge it into this commit. Mixing in opportunistic refactors makes review impossible and pollutes the commit history.
- If you genuinely believe the goal cannot be achieved without an out-of-scope change, STOP, do not edit, and report back with: (a) what you'd need to change, (b) why the listed scope is insufficient, (c) what you'd recommend. Wait for the main thread to expand scope.

## Deliverables I expect in your reply
- Files changed (path list)
- Verification output (last lines of relevant `tsc` / `test` / `build` runs)
- Checkout path and branch name (`git rev-parse --show-toplevel`, `git branch --show-current`) — useful in either mode, and required when you were dispatched into a worktree
- Commit hash (`git rev-parse HEAD`)
- A short note confirming you self-reviewed against the three Simplify pillars
- Risks and follow-ups worth flagging
```

The "make a commit before exiting" rule is the single most important line. In a worktree dispatch, an empty exit can let the worktree get auto-cleaned and the work disappears even though the reply will say "done". In the default no-worktree dispatch, uncommitted edits sit in the main checkout's working tree and quietly contaminate the next dispatch. Either way, a clean commit is the only safe handoff — always include this rule.

## Common pitfalls

- **Translating the user's task too lossy.** "Fix the perf issue on /organization" is not a brief; it's a hint. Read the relevant files yourself first, then write a brief that names the actual files, the actual symptom, the actual root cause if known.
- **Forgetting the project's own dispatch rules.** If the project has a `dev-kollab` / `test-kollab` / similar skill, the sub-agent must be told to follow it. Otherwise it'll skip project-specific verification and you'll re-dispatch.
- **Dropping the Simplify pillars from the brief.** If you summarize them as "follow good practice", the sub-agent will not apply them. Paste the three pillars verbatim every time.
- **Spawning a team for sequential work.** If task B needs task A's output, run them serially, not in parallel.
- **Skipping the edit-conflict pre-check.** Two agents writing the same file (or the same exported symbol across files, or the same migration slot) will conflict on merge no matter how clean each branch is. Disjoint the writes before dispatching, or serialize.
- **Reaching for `isolation="worktree"` by default.** Worktree adds verify + merge-back overhead and only earns its cost when you're truly dispatching parallel writers that would otherwise corrupt each other's index. Single-agent and sequential-team dispatches should run in the main checkout — see Step 4's decision tree.
- **Trusting the agent's "done" without verifying.** Always inspect the diff and the commit (in the main checkout, or in the worktree if one was used). The summary is intent, not evidence.
- **Confusing "the commit exists" with "the commit was reviewed".** Step 5b only proves something landed; Step 5c's main-thread review of the actual diff is a separate, mandatory gate. Never merge or report a diff the main thread hasn't read.
- **Dispatching on a smaller model to save tokens.** Every dispatch pins `model="opus"`. A cheaper sub-agent that gets the edit subtly wrong costs more in review findings and re-dispatch rounds than Opus costs up front.
- **Scope-creep masquerading as "while I'm here..."** A common failure: the agent is editing file X for goal A, notices what looks like a real bug in adjacent code, and quietly fixes it in the same commit. Even well-intentioned, this poisons the diff: review can no longer separate "the change I asked for" from "an unrelated behavior change", and any regression in the unrelated fix shows up under the wrong commit message. Counter it with two layers: (a) write the brief's `Files in scope` as a *contract* with one-line authorized-changes per file, and (b) include the explicit "Stay strictly in scope. Report, don't fix." rule in `Working agreement` so the agent knows the right move when they spot something extra is to surface it under `Risks and follow-ups`, not silently bundle it in.
- **Stopping at "agent committed in worktree".** A worktree commit is not a delivered change. The full chain is dispatch → verify → review → merge back → `/simplify` → report. Without merge-back the user's branch never sees the work. (Default no-worktree dispatch skips the merge-back, but still owes verify, review, and `/simplify`.)
- **Skipping the post-dispatch `/simplify` pass.** Each sub-agent self-applied the principles, but cross-agent duplication only shows up once the commits sit side by side. Run `/simplify` once after every dispatch round.
- **Removing the worktree before the merge succeeds.** The worktree is your only safe rollback point. Clean up only after merge + tests are green.
- **Letting the agent reply in English bleed into your user-facing message.** Stay in the user's language when talking to the user. The sub-agent's English output is internal — translate the result.
- **Asking the user to confirm the brief before dispatching.** Unless the goal is genuinely ambiguous, don't. The user already said `/agent-mode`; that's the green light.

## When NOT to dispatch

This skill is not a hammer. Skip dispatch when:

- The task is a one-line edit you can finish in 30 seconds
- The user is mid-conversation about a decision and needs your direct response
- The task requires interactive back-and-forth (e.g., visual UI iteration where the user wants to see each step)
- The user explicitly says "do it yourself" / "不要派 agent"

In those cases, do the work in the main thread and tell the user briefly why you didn't dispatch.
