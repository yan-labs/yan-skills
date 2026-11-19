# Rankup Website Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Release `rankup` `2.0.0` as a Cloudflare-first website lifecycle orchestrator with project memory, Skill dependency routing, and verifiable automatic update support.

> **Update 2026-08-16 (this is a 2026-07-30 record; the body is left as written):**
> `backlink-analyzer`, `browser-harvest`, and `gt` have been merged into `backlink`
> and `rankup` respectively, and deleted. The dependency-routing conclusions still
> hold; there are simply three fewer Skills carrying them. See `README.md` and each
> `SKILL.md` for the current state.

**Architecture:** Keep `rankup/SKILL.md` as the compact routing and safety entrypoint, and move detailed lifecycle, Cloudflare, project-memory, integrations, and existing SEO guidance into focused files under `rankup/references/`. Publish static version metadata in `rankup/skill.json`; use a dependency-free Node script to compare that manifest with GitHub, maintain `<project>/.rankup/skill-state.json`, and apply the native Skills CLI update command when requested.

**Tech Stack:** Markdown Skill instructions, JSON manifests, Node.js ESM with built-in modules, Node test runner, Skills CLI, Wrangler, TanStack Start, Cloudflare Workers/D1/R2/KV/Queues/Workflows/Durable Objects.

## Global Constraints

- Publish the redesigned Skill as exact version `2.0.0`.
- Use `pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer` as the default greenfield scaffold command.
- Default new website infrastructure to Cloudflare Workers, D1, R2, and needs-based Cloudflare bindings.
- Never write secret values to `rankup`, `.rankup/`, Git, command output, or tests.
- `.rankup/secrets.md` may contain only secret name, purpose, environment, storage location, owner, access status, and rotation metadata.
- Existing data-driven SEO knowledge must remain available through progressive disclosure.
- Version checks must be rate-limited to once per 24 hours unless explicitly forced.
- Automatic Skill update must never modify business code, deploy a website, or overwrite a dirty source checkout.
- Use only Node built-in modules; do not add a repository package manager manifest or runtime dependency.
- Verify installation from the repository with `npx skills add $SKILLS_SOURCE --skill rankup`.

---

## File Map

- Create `rankup/skill.json`: published version and source manifest.
- Create `rankup/scripts/check-version.mjs`: manifest comparison, project state maintenance, dirty-checkout guard, and optional Skills CLI update.
- Create `rankup/tests/check-version.test.mjs`: deterministic tests for version comparison, staleness, state creation, and command selection.
- Rewrite `rankup/SKILL.md`: lifecycle router, update entrypoint, dependency routing, safety rules, and progressive-disclosure map.
- Create `rankup/references/lifecycle.md`: detailed ten-stage workflow and completion gates.
- Create `rankup/references/cloudflare-stack.md`: Cloudflare resource selection, scaffold, Wrangler, environments, deployment, and live verification.
- Create `rankup/references/project-memory.md`: `.rankup/` schema, initialization templates, read/write rules, and secret metadata contract.
- Create `rankup/references/integrations.md`: Skills CLI dependency installation, Stripe routing, GT, backlinks, and capability discovery.
- Create `rankup/references/seo-growth.md`: existing SEO data channels, opportunity model, execution loop, and validated experience library migrated from the old `SKILL.md`.
- Create `rankup/scripts/validate-rankup.mjs`: structural validation for metadata, references, commands, safety language, and forbidden secret-shaped values.
- Modify `README.md`: document `rankup` `2.0.0`, repository-wide installation, single-Skill installation, and update commands.

---

### Task 1: Add Version Manifest and Version-Comparison Tests

**Files:**
- Create: `rankup/skill.json`
- Create: `rankup/scripts/check-version.mjs`
- Create: `rankup/tests/check-version.test.mjs`

**Interfaces:**
- Produces `compareSemver(left: string, right: string): -1 | 0 | 1`.
- Produces `isCheckDue(lastCheckedAt: string | null, now: Date, intervalMs?: number): boolean`.
- Produces `updateArgs(scope: "global" | "project"): string[]`.
- Produces `createInitialState(manifest, options): SkillState`.
- Later tasks call the CLI as `node rankup/scripts/check-version.mjs [--project-root PATH] [--scope global|project] [--force] [--apply]`.

- [ ] **Step 1: Add failing unit tests**

Create tests using `node:test` and `node:assert/strict`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  compareSemver,
  createInitialState,
  isCheckDue,
  updateArgs,
} from "../scripts/check-version.mjs";

test("compareSemver orders semantic versions", () => {
  assert.equal(compareSemver("2.0.0", "2.0.1"), -1);
  assert.equal(compareSemver("2.1.0", "2.0.9"), 1);
  assert.equal(compareSemver("2.0.0", "2.0.0"), 0);
});

test("isCheckDue enforces a 24 hour interval", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");
  assert.equal(isCheckDue(null, now), true);
  assert.equal(isCheckDue("2026-07-29T11:59:59.000Z", now), true);
  assert.equal(isCheckDue("2026-07-30T11:00:00.000Z", now), false);
});

test("createInitialState records project activation metadata", () => {
  const state = createInitialState(
    { name: "rankup", version: "2.0.0", source: "example-owner/yan-skills" },
    {
      scope: "global",
      now: new Date("2026-07-30T12:00:00.000Z"),
    },
  );
  assert.equal(state.installedVersion, "2.0.0");
  assert.equal(state.installedAt, "2026-07-30T12:00:00.000Z");
  assert.equal(state.scope, "global");
  assert.equal(state.lastUpdatedAt, null);
});

test("updateArgs selects the installed scope", () => {
  assert.deepEqual(updateArgs("global"), [
    "skills",
    "update",
    "rankup",
    "-g",
    "-y",
  ]);
  assert.deepEqual(updateArgs("project"), [
    "skills",
    "update",
    "rankup",
    "-p",
    "-y",
  ]);
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```bash
node --test rankup/tests/check-version.test.mjs
```

Expected: FAIL because `rankup/scripts/check-version.mjs` does not exist.

- [ ] **Step 3: Add the published manifest**

Create `rankup/skill.json` with:

```json
{
  "schemaVersion": 1,
  "name": "rankup",
  "version": "2.0.0",
  "releasedAt": "2026-07-30T00:00:00.000Z",
  "source": "example-owner/yan-skills",
  "manifestUrl": "https://raw.githubusercontent.com/example-owner/yan-skills/main/rankup/skill.json"
}
```

- [ ] **Step 4: Implement the pure version helpers**

In `check-version.mjs`, export the four tested functions. Accept only three numeric semantic-version components, reject other forms with a clear error, use `24 * 60 * 60 * 1000` as the default interval, and return the exact `npx` argument arrays shown in the tests.

- [ ] **Step 5: Run the tests and confirm success**

Run:

```bash
node --test rankup/tests/check-version.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 6: Commit the version foundation**

```bash
git add rankup/skill.json rankup/scripts/check-version.mjs rankup/tests/check-version.test.mjs
git commit -m "feat(rankup): add version manifest"
```

---

### Task 2: Implement Project State and Safe Update Execution

**Files:**
- Modify: `rankup/scripts/check-version.mjs`
- Modify: `rankup/tests/check-version.test.mjs`

**Interfaces:**
- Produces `loadOrCreateState(projectRoot, manifest, scope, now): Promise<SkillState>`.
- Produces `writeState(projectRoot, state): Promise<void>`.
- Produces `checkForUpdate(options): Promise<CheckResult>`.
- `CheckResult.status` is one of `current`, `update-available`, `updated`, `skipped`, or `blocked`.
- State is written atomically to `<projectRoot>/.rankup/skill-state.json`.

- [ ] **Step 1: Add state and remote-manifest tests**

Add tests using a temporary directory and injected `fetchManifest`/`runUpdate` functions. Cover:

```js
test("checkForUpdate creates project state without exposing secrets", async () => {
  // Use mkdtemp, a fixed clock, and a remote 2.0.0 manifest.
  // Assert status === "current".
  // Assert .rankup/skill-state.json has installedAt, lastCheckedAt,
  // installedVersion, latestVersion, scope, and no token/password/secretValue keys.
});

test("checkForUpdate reports a newer version without applying it", async () => {
  // Local 2.0.0, remote 2.1.0, apply false.
  // Assert status === "update-available" and runUpdate was not called.
});

test("checkForUpdate applies the update for the recorded scope", async () => {
  // Local 2.0.0, remote 2.1.0, apply true.
  // Stub runUpdate and post-update manifest read as 2.1.0.
  // Assert the command arguments are global or project as recorded.
  // Assert installedVersion and lastUpdatedAt change only after verification.
});

test("checkForUpdate blocks a dirty source checkout", async () => {
  // Inject dirtySkillCheckout returning true.
  // Assert status === "blocked" and runUpdate was not called.
});
```

- [ ] **Step 2: Run the tests and confirm failure**

Run:

```bash
node --test rankup/tests/check-version.test.mjs
```

Expected: the new tests fail because state and update functions are not implemented.

- [ ] **Step 3: Implement atomic project state**

Use `node:fs/promises` to create `.rankup`, write JSON to `skill-state.json.tmp`, and rename it to `skill-state.json`. Preserve the original `installedAt`; update `lastCheckedAt` after a successful remote check; update `lastUpdatedAt` only after the installed manifest matches the advertised version.

- [ ] **Step 4: Implement rate-limited remote comparison**

Fetch `manifest.manifestUrl` with `Accept: application/json`, validate matching `name` and a valid semantic version, and skip the network when the last successful check is under 24 hours old unless `--force` is supplied.

- [ ] **Step 5: Implement guarded update execution**

Before applying:

1. Run `git -C <skill-directory> rev-parse --show-toplevel`.
2. When inside a source checkout, run `git status --porcelain -- rankup`.
3. Return `blocked` if output is non-empty.
4. Otherwise spawn `npx skills update rankup -g -y` or `npx skills update rankup -p -y`.
5. Re-read `skill.json`; record success only if the installed version equals the remote version.

Do not shell-concatenate arguments. Use `spawn`/`spawnSync` with an argument array and inherited stdio.

- [ ] **Step 6: Add the executable CLI**

Parse:

```text
--project-root <absolute-or-relative-path>
--scope <global|project>
--force
--apply
--json
```

Default `projectRoot` to `process.cwd()`. Default scope to the existing state, otherwise `global`. Exit `0` for `current`, `updated`, and `skipped`; exit `2` for `update-available`; exit `3` for `blocked` or invalid remote data. `--json` prints only the result object.

- [ ] **Step 7: Run unit and CLI smoke tests**

Run:

```bash
node --test rankup/tests/check-version.test.mjs
node rankup/scripts/check-version.mjs --project-root . --scope global --json
```

Expected: all tests pass; the CLI creates or updates `.rankup/skill-state.json` without applying an update. Remove the repository-root `.rankup/` smoke artifact after inspecting it because this repository is the Skill source, not a managed website project.

- [ ] **Step 8: Commit safe version updates**

```bash
git add rankup/scripts/check-version.mjs rankup/tests/check-version.test.mjs
git commit -m "feat(rankup): track and update installed version"
```

---

### Task 3: Create Project-Memory and Integration References

**Files:**
- Create: `rankup/references/project-memory.md`
- Create: `rankup/references/integrations.md`

**Interfaces:**
- `SKILL.md` will route context recovery and all `.rankup/` writes to `project-memory.md`.
- `SKILL.md` will route dependency discovery, Wrangler, Stripe, GT, and backlink work to `integrations.md`.

- [ ] **Step 1: Write the project-memory reference**

Document the exact `.rankup/` tree from the design. Include:

- Read order: `INDEX.md` → `skill-state.json` → `PROJECT.md` → task-specific files.
- A required live reconciliation step for code, Git history, Cloudflare, GSC, Stripe, or other external systems.
- Minimal templates for `INDEX.md`, `PROJECT.md`, `decisions.md`, `plan.md`, `releases.md`, and journal entries.
- The exact allowed `secrets.md` columns: name, purpose, environment, provider/storage location, owner, access status, rotated at, next rotation.
- A prohibited-data list covering values, tokens, private keys, webhook secrets, passwords, payment data, and personal identifiers.
- Rules for updating every stale cross-reference when an external status changes.

- [ ] **Step 2: Write the integrations reference**

Include exact install/update commands:

```bash
npx skills add $SKILLS_SOURCE -g --all
npx skills update rankup -g -y
npx skills add cloudflare/skills --skill wrangler -g -y
npx skills add cloudflare/skills --skill workers-best-practices -g -y
npx skills add stripe/ai --skill stripe-best-practices -g -y
npx skills add vercel-labs/skills --skill find-skills -g -y
```

Define routing:

- Wrangler for Cloudflare authentication, resources, bindings, migrations, secrets, tailing, and deployment.
- workers-best-practices for Worker code and runtime review.
- stripe-best-practices only when payment or billing is in scope.
- GT for trend and keyword evidence.
- backlink-analyzer before backlink execution.
- backlink for approved link acquisition and verification.
- find-skills when no listed dependency covers the request.

State that dependency installation does not authorize account mutation, purchases, production deletion, or deployment outside the user’s request.

- [ ] **Step 3: Review for secret leakage and command accuracy**

Run:

```bash
rg -n '(sk_live_|sk_test_|whsec_|Bearer [A-Za-z0-9]|api[_-]?key\s*[:=]\s*\S+)' rankup/references
rg -n 'npx skills (add|update)' rankup/references/integrations.md
```

Expected: the first command returns no matches; the second prints all six documented commands.

- [ ] **Step 4: Commit the project protocol**

```bash
git add rankup/references/project-memory.md rankup/references/integrations.md
git commit -m "docs(rankup): define project memory and integrations"
```

---

### Task 4: Create Lifecycle and Cloudflare References

**Files:**
- Create: `rankup/references/lifecycle.md`
- Create: `rankup/references/cloudflare-stack.md`

**Interfaces:**
- `lifecycle.md` defines stages `0` through `10` and a completion gate for each.
- `cloudflare-stack.md` defines the needs-based mapping from requirements to Workers, D1, R2, KV, Queues, Workflows, Durable Objects, and Secrets.

- [ ] **Step 1: Write the lifecycle reference**

Translate the approved design into operational steps:

0. restore and reconcile context;
1. opportunity research;
2. product and architecture design;
3. scaffold;
4. Cloudflare foundation;
5. develop and test;
6. integrate specialist capabilities;
7. deploy and live-verify;
8. SEO and content;
9. distribution and backlinks;
10. monitor, learn, and iterate.

For every stage, include inputs, required actions, output files under `.rankup/`, and an observable completion gate. Make clear that existing sites enter at the relevant stage rather than being reinitialized.

- [ ] **Step 2: Write the Cloudflare stack reference**

Include the exact scaffold command:

```bash
pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer
```

Document:

- TanStack Start SSR/API on Workers with `@cloudflare/vite-plugin`.
- D1 for relational data and migrations.
- R2 for objects and uploads.
- KV only for cache/read-heavy configuration, not transactional truth.
- Queues/Workflows for asynchronous and multi-step jobs.
- Durable Objects for coordinated state and strong consistency.
- Worker Secrets/Secrets Store/CI secrets for secret values.
- `wrangler types` after binding changes.
- separate preview/staging/production resources and migration checks.
- post-deploy verification of real SSR HTML, API paths, bindings, uploads, auth, payment callbacks, and rollback information.

- [ ] **Step 3: Verify required stack language**

Run:

```bash
rg -n 'b1D0eCA4|TanStack Start|Workers|D1|R2|KV|Queues|Workflows|Durable Objects|wrangler types|live|线上' rankup/references/lifecycle.md rankup/references/cloudflare-stack.md
```

Expected: every required platform component and live-verification concept is present.

- [ ] **Step 4: Commit the lifecycle references**

```bash
git add rankup/references/lifecycle.md rankup/references/cloudflare-stack.md
git commit -m "docs(rankup): add website lifecycle and Cloudflare stack"
```

---

### Task 5: Preserve the Existing SEO System

**Files:**
- Create: `rankup/references/seo-growth.md`
- Modify: `rankup/SKILL.md`

**Interfaces:**
- `seo-growth.md` retains the old data-channel map, opportunity-pool model, SEO loop, and validated experience library.
- `SKILL.md` links to `seo-growth.md` for SEO, indexing, content, performance, and growth tasks.

- [ ] **Step 1: Move SEO details into the reference**

Copy and reorganize, without dropping validated knowledge:

- data-channel map;
- `D+C+W+M` opportunity-pool framework;
- opportunity card;
- data-first SEO loop;
- validated experience library;
- self-update criteria distinguishing reusable knowledge from project-specific history.

Remove any live token location or credential detail. Replace such entries with a generic instruction to use user-level secret storage and verify provider access at runtime.

- [ ] **Step 2: Add a compact SEO route to the main Skill**

Add a main-file rule that reads `references/seo-growth.md` when the request involves SEO, GSC, indexing, rankings, keywords, CTR, content growth, performance affecting search, or backlink strategy. Make the first action read `.rankup/INDEX.md` and reconcile stale external-state claims.

- [ ] **Step 3: Check coverage against the old main file**

Run:

```bash
rg -n '数据通道|D\\+C\\+W\\+M|机会池卡|GSC|Suggest|SERP|自更新协议|经验库' rankup/references/seo-growth.md
```

Expected: each concept appears in the new reference.

- [ ] **Step 4: Commit the SEO migration**

```bash
git add rankup/SKILL.md rankup/references/seo-growth.md
git commit -m "refactor(rankup): preserve SEO guidance as reference"
```

---

### Task 6: Rewrite the Rankup Entrypoint

**Files:**
- Modify: `rankup/SKILL.md`

**Interfaces:**
- Frontmatter `metadata.version` is `2.0.0`, matching the Skill schema.
- The description triggers website lifecycle, Cloudflare deployment, SEO/growth, payment integration, and long-term site iteration without claiming unrelated software work.
- The entrypoint routes to all five reference files and the version-check script.

- [ ] **Step 1: Rewrite frontmatter and introduction**

Use frontmatter fields:

```yaml
---
name: rankup
description: 网站从零到一与长期增长的总控 Skill。用于新建网站、SaaS、工具站或内容站，规划或初始化 TanStack Start Monorepo，使用 Cloudflare Workers/D1/R2 部署全栈应用，接入支付，执行 SEO、内容、外链、上线验证和持续迭代；也在用户提到 rankup、rankup init、建站、网站改版、搜索流量、GSC、排名、关键词、CTR、索引或网站增长时使用。
metadata:
  version: "2.0.0"
---
```

- [ ] **Step 2: Add install and update commands**

Document:

```bash
npx skills add $SKILLS_SOURCE --skill rankup -g -y
npx skills update rankup -g -y
node <rankup-skill-dir>/scripts/check-version.mjs --project-root . --apply
```

Explain `-p -y` for project installs and the 24-hour check interval.

- [ ] **Step 3: Add the mandatory startup protocol**

Order:

1. Read local `skill.json`.
2. Run the version checker; automatically apply when the check is due.
3. Read `.rankup/INDEX.md` and `skill-state.json`; initialize when absent.
4. Reconcile relevant facts with code, Git, and live providers.
5. Classify the request into lifecycle stages.
6. Read only the necessary references.
7. Execute, verify, and write back project knowledge.

- [ ] **Step 4: Add routing and completion rules**

Include a compact table mapping:

- greenfield/build/architecture → lifecycle + Cloudflare;
- Cloudflare/resource/deploy → Cloudflare + integrations;
- payment/billing → integrations + project memory;
- SEO/content/indexing → SEO growth;
- backlink/distribution → integrations + SEO growth;
- existing project/next step/debugging → project memory + relevant technical reference.

Define “done” as verified output plus `.rankup/` update, not merely a generated file, successful build, or upload.

- [ ] **Step 5: Add safety and self-learning rules**

Require:

- no secret values in repository files;
- no destructive production changes without explicit scope;
- no stale note treated as current provider truth;
- project facts stay in `.rankup/`;
- only cross-project, verified knowledge may update the Skill repository;
- version bump follows semantic-version rules.

- [ ] **Step 6: Check entrypoint size and links**

Run:

```bash
wc -l rankup/SKILL.md
rg -n 'references/(lifecycle|cloudflare-stack|project-memory|integrations|seo-growth)\\.md' rankup/SKILL.md
```

Expected: main file is under 500 lines and links all five references.

- [ ] **Step 7: Commit the entrypoint**

```bash
git add rankup/SKILL.md
git commit -m "feat(rankup): orchestrate the website lifecycle"
```

---

### Task 7: Add Structural Validation and Documentation

**Files:**
- Create: `rankup/scripts/validate-rankup.mjs`
- Modify: `README.md`

**Interfaces:**
- `validate-rankup.mjs` exits `0` on a complete, internally consistent release and nonzero with one error per line otherwise.

- [ ] **Step 1: Write the release validator**

The script must:

1. Parse `rankup/skill.json`.
2. Parse `version` from `rankup/SKILL.md` frontmatter.
3. Fail unless both versions equal `2.0.0`.
4. Confirm every linked reference exists.
5. Confirm the exact scaffold, install, Wrangler, Stripe, and update commands appear.
6. Confirm `SKILL.md` contains the secret-value prohibition and `.rankup/skill-state.json`.
7. Scan all `rankup/**/*.md` and `rankup/**/*.json` files for common secret patterns.
8. Confirm `check-version.mjs` and its test file exist.

- [ ] **Step 2: Update repository README**

Add:

- `rankup 2.0.0` description as the website lifecycle orchestrator;
- all-Skill install command `npx skills add $SKILLS_SOURCE -g --all`;
- single install command `npx skills add $SKILLS_SOURCE --skill rankup -g -y`;
- update command `npx skills update rankup -g -y`;
- note that project memories live in `.rankup/` and real secrets do not.

- [ ] **Step 3: Run validation**

Run:

```bash
node rankup/scripts/validate-rankup.mjs
node --test rankup/tests/check-version.test.mjs
git diff --check
```

Expected: validator passes, all tests pass, and Git reports no whitespace errors.

- [ ] **Step 4: Commit validation and docs**

```bash
git add rankup/scripts/validate-rankup.mjs README.md
git commit -m "test(rankup): validate lifecycle release"
```

---

### Task 8: Test Real Skills CLI Discovery and Installation

**Files:**
- Modify only if validation exposes an error.

**Interfaces:**
- The published repository must be discoverable as `example-owner/yan-skills`.
- The CLI must identify `rankup` and install its complete directory, including references and scripts.

- [ ] **Step 1: Validate repository discovery**

Run:

```bash
npx skills add $SKILLS_SOURCE --list
```

Expected: output includes `rankup`.

- [ ] **Step 2: Install into an isolated temporary project**

Create an explicit `mktemp -d` directory and run:

```bash
cd "$TEMP_PROJECT"
npx skills add <本仓库的本地路径> --skill rankup -y --copy
```

Expected: the temporary project receives `rankup/SKILL.md`, `skill.json`, five reference files, both scripts, and tests or the CLI’s documented installation layout equivalents.

- [ ] **Step 3: Test the installed copy**

From the installed Skill path, run:

```bash
node scripts/validate-rankup.mjs
node --test tests/check-version.test.mjs
```

Expected: validation and tests pass from the copied installation, proving relative paths do not depend on the source checkout.

- [ ] **Step 4: Remove the temporary directory**

Delete only the explicit path returned by `mktemp -d`; confirm it is non-empty and not a repository or home-directory path before removal.

- [ ] **Step 5: Fix and retest any installation-layout defects**

If files are missing, update the Skill layout or validator to match the actual Skills CLI copy contract, rerun Tasks 7 and 8, and commit only the concrete fix with:

```bash
git add rankup README.md
git commit -m "fix(rankup): support Skills CLI installation"
```

---

### Task 9: Final Review, Publish, and Verify Remote

**Files:**
- Modify only if final review finds a release blocker.

**Interfaces:**
- Publishes branch `main` to `origin`.
- Remote commit must contain `rankup` `2.0.0` and pass the same local validator.

- [ ] **Step 1: Review the full change**

Run:

```bash
git status --short --branch
git diff origin/main...HEAD --stat
git diff origin/main...HEAD -- rankup README.md
```

Confirm no unrelated files, secrets, generated project `.rankup/`, or temporary installation artifacts are included.

- [ ] **Step 2: Run the complete release check**

Run:

```bash
node rankup/scripts/validate-rankup.mjs
node --test rankup/tests/check-version.test.mjs
git diff --check origin/main...HEAD
```

Expected: all checks pass.

- [ ] **Step 3: Push**

Run:

```bash
git push origin main
```

Expected: remote `main` advances to local `HEAD`.

- [ ] **Step 4: Verify the remote manifest and Skills listing**

Run:

```bash
curl --fail --silent --show-error \
  https://raw.githubusercontent.com/example-owner/yan-skills/main/rankup/skill.json
npx skills add $SKILLS_SOURCE --list
```

Expected: remote JSON reports `2.0.0`; the listing includes `rankup`.

- [ ] **Step 5: Report the release**

Report the final commit, pushed branch, tested install/update commands, the version-state behavior, and links to the updated Skill and repository. Do not claim the exact installation timestamp is known before a project first initializes `rankup`; describe it as the recorded project activation time.

---

## Self-Review

- Spec coverage: all ten lifecycle stages, Cloudflare resource selection, Wrangler and Stripe routing, `.rankup/` memory, secret safety, versioning, automatic update, existing SEO knowledge, testing, installation, and publishing are mapped to Tasks 1–9.
- Placeholder scan: the plan contains no deferred implementation markers; conditional fix work is bounded by an observable installation test.
- Type consistency: version helpers, state fields, CLI flags, result statuses, file paths, and update commands use the same names throughout.
- Scope: this is one releasable subsystem—the `rankup` Skill—and every task contributes to the independently testable `2.0.0` release.
