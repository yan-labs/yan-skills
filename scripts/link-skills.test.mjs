import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

test("checks without writing, links nested and ordinary skills, and preserves local copies", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "link-skills-"));
  try {
    const repo = path.join(root, "repo");
    const home = path.join(root, "home");
    const skills = path.join(home, ".agents", "skills");
    const script = path.join(repo, "scripts", "link-skills.mjs");
    for (const dir of ["scripts", "agent-fleet/skill", "rankup"]) {
      await mkdir(path.join(repo, dir), { recursive: true });
    }
    await copyFile(new URL("./link-skills.mjs", import.meta.url), script);
    for (const dir of ["agent-fleet/skill", "rankup"]) {
      await writeFile(path.join(repo, dir, "SKILL.md"), "# Fixture");
    }
    const run = (...args) => spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8", env: { ...process.env, HOME: home },
    });
    assert.equal(run("--check").status, 1);
    await assert.rejects(lstat(skills), { code: "ENOENT" });
    await mkdir(path.join(skills, "agent-fleet"), { recursive: true });
    await writeFile(path.join(skills, "agent-fleet", "local.md"), "local");
    const linked = run();
    assert.equal(linked.status, 0, linked.stderr);
    for (const [name, dir] of [["agent-fleet", "agent-fleet/skill"], ["rankup", "rankup"]]) {
      assert.equal((await lstat(path.join(skills, name))).isSymbolicLink(), true);
      assert.equal(await realpath(path.join(skills, name)), await realpath(path.join(repo, dir)));
    }
    const backup = linked.stdout.match(/已备份被替换的实体目录 -> (.+)/)[1];
    assert.equal(await readFile(path.join(home, backup, "local.md"), "utf8"), "local");
    assert.equal(run("--check").status, 0);
    assert.match(run().stdout, /全局只有一份真源/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
