import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkForUpdate,
  fetchRemoteManifest,
  compareSemver,
  createInitialState,
  isCheckDue,
  runTrustedSkills,
  updateArgs,
} from "../scripts/check-version.mjs";

const localManifest = {
  schemaVersion: 1,
  name: "rankup",
  version: "2.0.0",
  releasedAt: "2026-07-30T00:00:00.000Z",
  source: "example-owner/yan-skills",
  manifestUrl:
    "https://raw.githubusercontent.com/example-owner/yan-skills/main/rankup/skill.json",
};

test("manifest source comes from configuration and rejects invalid sources", async () => {
  const priorSource = process.env.SKILLS_SOURCE;
  const priorFetch = globalThis.fetch;
  try {
    process.env.SKILLS_SOURCE = "fixture-owner/fixture-repo";
    let requested;
    globalThis.fetch = async (url) => {
      requested = url;
      return new Response(JSON.stringify(localManifest), { headers: { "content-type": "application/json" } });
    };
    await fetchRemoteManifest(localManifest);
    assert.equal(requested, "https://raw.githubusercontent.com/fixture-owner/fixture-repo/main/rankup/skill.json");
    process.env.SKILLS_SOURCE = "fixture-owner/../other";
    await assert.rejects(fetchRemoteManifest(localManifest), /Set SKILLS_SOURCE/);
  } finally {
    globalThis.fetch = priorFetch;
    if (priorSource === undefined) delete process.env.SKILLS_SOURCE;
    else process.env.SKILLS_SOURCE = priorSource;
  }
});

async function withTempProject(run) {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "rankup-version-test-"));
  try {
    return await run(projectRoot);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
}

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
  assert.equal(isCheckDue("2026-07-31T11:00:00.000Z", now), true);
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
  assert.equal(state.skill, "rankup");
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

test("checkForUpdate creates project state without exposing secrets", async () => {
  await withTempProject(async (projectRoot) => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now,
      fetchManifest: async () => localManifest,
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "current");
    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.installedAt, now.toISOString());
    assert.equal(state.lastCheckedAt, now.toISOString());
    assert.equal(state.installedVersion, "2.0.0");
    assert.equal(state.latestVersion, "2.0.0");
    assert.equal(state.scope, "global");
    assert.equal(
      Object.keys(state).some((key) =>
        /token|password|secretvalue/i.test(key),
      ),
      false,
    );
  });
});

test("checkForUpdate reports a newer version without applying it", async () => {
  await withTempProject(async (projectRoot) => {
    let updateCalls = 0;
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-07-30T12:00:00.000Z"),
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      runUpdate: async () => {
        updateCalls += 1;
      },
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "update-available");
    assert.equal(result.installedVersion, "2.0.0");
    assert.equal(result.latestVersion, "2.1.0");
    assert.equal(updateCalls, 0);
  });
});

test("checkForUpdate reconciles state after an external Skill update", async () => {
  await withTempProject(async (projectRoot) => {
    const firstRun = new Date("2026-07-29T12:00:00.000Z");
    await checkForUpdate({
      projectRoot,
      manifest: { ...localManifest, version: "1.9.0" },
      scope: "global",
      now: firstRun,
      fetchManifest: async () => ({ ...localManifest, version: "1.9.0" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    const secondRun = new Date("2026-07-30T12:00:00.000Z");
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: secondRun,
      force: true,
      fetchManifest: async () => localManifest,
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "current");
    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.installedVersion, "2.0.0");
    assert.equal(state.installedAt, firstRun.toISOString());
    assert.equal(state.lastUpdatedAt, secondRun.toISOString());
  });
});

test("external update clears a cached blocked outcome without fetching", async () => {
  await withTempProject(async (projectRoot) => {
    const firstRun = new Date("2026-07-30T10:00:00.000Z");
    await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: firstRun,
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => true,
    });

    let fetchCalls = 0;
    const result = await checkForUpdate({
      projectRoot,
      manifest: { ...localManifest, version: "2.1.0" },
      scope: "global",
      now: new Date("2026-07-30T11:00:00.000Z"),
      fetchManifest: async () => {
        fetchCalls += 1;
        return { ...localManifest, version: "2.1.0" };
      },
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "skipped");
    assert.equal(result.installedVersion, "2.1.0");
    assert.equal(fetchCalls, 0);
  });
});

test("checkForUpdate applies the update for the recorded scope", async () => {
  await withTempProject(async (projectRoot) => {
    const executingSkillDirectory = path.join(
      projectRoot,
      ".agents",
      "skills",
      "rankup",
    );
    await mkdir(executingSkillDirectory, { recursive: true });
    const updateCalls = [];
    const now = new Date("2026-07-30T12:00:00.000Z");
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "project",
      executingSkillDirectory,
      now,
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      runUpdate: async (args) => {
        updateCalls.push(args);
      },
      readInstalledManifest: async () => ({
        ...localManifest,
        version: "2.1.0",
      }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "updated");
    assert.deepEqual(updateCalls, [
      ["skills", "update", "rankup", "-p", "-y"],
    ]);
    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.installedVersion, "2.1.0");
    assert.equal(state.lastUpdatedAt, now.toISOString());
    assert.equal(state.installedAt, now.toISOString());
  });
});

// 全局技能目录符号链接到本仓库时,自更新会用远端副本覆盖真源、并把链接换回实体目录。
// 源码检出必须整体拒绝自更新,且不依赖"工作区是否干净"——提交之后工作区就是干净的。
test("checkForUpdate blocks a source checkout even when it is clean", async () => {
  await withTempProject(async (projectRoot) => {
    let updateCalls = 0;
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-08-02T12:00:00.000Z"),
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "9.9.9" }),
      runUpdate: async () => {
        updateCalls += 1;
      },
      sourceCheckout: async () => true,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "source-checkout");
    assert.equal(updateCalls, 0, "源码检出绝不能执行更新命令");

    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.lastReason, "source-checkout");
  });
});

test("checkForUpdate still updates an installed copy that is not a source checkout", async () => {
  await withTempProject(async (projectRoot) => {
    let updateCalls = 0;
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-08-02T12:00:00.000Z"),
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "9.9.9" }),
      runUpdate: async () => {
        updateCalls += 1;
      },
      readInstalledManifest: async () => ({ ...localManifest, version: "9.9.9" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
    });

    assert.equal(result.status, "updated");
    assert.equal(updateCalls, 1, "普通安装副本必须仍然可以自更新");
  });
});

test("checkForUpdate blocks a dirty source checkout", async () => {
  await withTempProject(async (projectRoot) => {
    let updateCalls = 0;
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-07-30T12:00:00.000Z"),
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      runUpdate: async () => {
        updateCalls += 1;
      },
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => true,
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "dirty-skill-checkout");
    assert.equal(updateCalls, 0);

    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.lastOutcome, "blocked");
    assert.equal(state.lastReason, "dirty-skill-checkout");
  });
});

test("checkForUpdate uses a cached newer version and applies without fetching", async () => {
  await withTempProject(async (projectRoot) => {
    const firstNow = new Date("2026-07-30T12:00:00.000Z");
    await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: firstNow,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
    });

    let fetchCalls = 0;
    const updateCalls = [];
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      now: new Date("2026-07-30T13:00:00.000Z"),
      apply: true,
      fetchManifest: async () => {
        fetchCalls += 1;
        throw new Error("network must be rate-limited");
      },
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
      runUpdate: async (args, options) => updateCalls.push({ args, options }),
      readInstalledManifest: async () => ({
        ...localManifest,
        version: "2.1.0",
      }),
    });

    assert.equal(result.status, "updated");
    assert.equal(fetchCalls, 0);
    assert.deepEqual(updateCalls[0].args, [
      "skills",
      "update",
      "rankup",
      "-g",
      "-y",
    ]);
  });
});

test("checkForUpdate auto-detects project scope and uses the project cwd", async () => {
  await withTempProject(async (projectRoot) => {
    const executingSkillDirectory = path.join(
      projectRoot,
      ".agents",
      "skills",
      "rankup",
    );
    await mkdir(executingSkillDirectory, { recursive: true });
    const realProjectRoot = await realpath(projectRoot);
    const realSkillDirectory = await realpath(executingSkillDirectory);
    const calls = [];
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      now: new Date("2026-07-30T12:00:00.000Z"),
      apply: true,
      executingSkillDirectory,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
      runUpdate: async (args, options) => calls.push({ args, options }),
      readInstalledManifest: async (target) => {
        assert.equal(target, realSkillDirectory);
        return { ...localManifest, version: "2.1.0" };
      },
    });

    assert.equal(result.status, "updated");
    assert.equal(result.scope, "project");
    assert.equal(calls[0].options.cwd, realProjectRoot);
    assert.deepEqual(calls[0].args, [
      "skills",
      "update",
      "rankup",
      "-p",
      "-y",
    ]);
  });
});

test("checkForUpdate blocks an explicit scope that targets another copy", async () => {
  await withTempProject(async (projectRoot) => {
    const executingSkillDirectory = path.join(
      projectRoot,
      ".agents",
      "skills",
      "rankup",
    );
    await mkdir(executingSkillDirectory, { recursive: true });
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      executingSkillDirectory,
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
    });

    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "scope-target-mismatch");
  });
});

test("checkForUpdate preserves update command failures in project state", async () => {
  await withTempProject(async (projectRoot) => {
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-07-30T12:00:00.000Z"),
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
      runUpdate: async () => {
        throw new Error("failed");
      },
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.reason, "update-command-failed");

    const state = JSON.parse(
      await readFile(
        path.join(projectRoot, ".rankup", "skill-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.lastOutcome, "blocked");
    assert.equal(state.lastReason, "update-command-failed");
  });
});

test("checkForUpdate accepts an installed version newer than the checked version", async () => {
  await withTempProject(async (projectRoot) => {
    const result = await checkForUpdate({
      projectRoot,
      manifest: localManifest,
      scope: "global",
      now: new Date("2026-07-30T12:00:00.000Z"),
      apply: true,
      fetchManifest: async () => ({ ...localManifest, version: "2.1.0" }),
      sourceCheckout: async () => false,
      dirtySkillCheckout: async () => false,
      runUpdate: async () => {},
      readInstalledManifest: async () => ({
        ...localManifest,
        version: "2.2.0",
      }),
    });
    assert.equal(result.status, "updated");
    assert.equal(result.installedVersion, "2.2.0");
  });
});

test("trusted Skills execution ignores a project-local fake binary", async () => {
  await withTempProject(async (projectRoot) => {
    const fakeBin = path.join(projectRoot, "node_modules", ".bin");
    const marker = path.join(projectRoot, "hijacked");
    await mkdir(fakeBin, { recursive: true });
    await writeFile(
      path.join(fakeBin, "skills"),
      `#!/bin/sh\ntouch ${JSON.stringify(marker)}\n`,
      { mode: 0o755 },
    );

    const calls = [];
    await runTrustedSkills(["skills", "update", "rankup", "-p", "-y"], {
      cwd: projectRoot,
      spawnProcess: async (command, args, options) => {
        calls.push({ command, args, options });
      },
    });

    assert.equal(calls[0].command, "npm");
    assert.equal(calls[0].options.cwd, projectRoot);
    assert.ok(calls[0].args.includes("--package=skills@1.5.21"));
    const prefixIndex = calls[0].args.indexOf("--prefix");
    assert.notEqual(prefixIndex, -1);
    assert.equal(
      path.resolve(calls[0].args[prefixIndex + 1]).startsWith(
        `${path.resolve(projectRoot)}${path.sep}`,
      ),
      false,
    );
    await assert.rejects(readFile(marker), { code: "ENOENT" });
  });
});

test("project state refuses a symlinked .rankup directory", async () => {
  await withTempProject(async (projectRoot) => {
    const outside = await mkdtemp(path.join(tmpdir(), "rankup-outside-"));
    try {
      await import("node:fs/promises").then(({ symlink }) =>
        symlink(outside, path.join(projectRoot, ".rankup")),
      );
      await assert.rejects(
        checkForUpdate({
          projectRoot,
          manifest: localManifest,
          scope: "global",
          fetchManifest: async () => localManifest,
        }),
        /symlink/i,
      );
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
