import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const scripts = new URL("../scripts/maintain/", import.meta.url);

test("启动索引先读全局层，再读项目层，缺失时跳过", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "rankup-index-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const env = { ...process.env, RANKUP_HOME: path.join(root, "global") };
  const project = path.join(root, ".rankup");
  const run = () => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL("read-memory-index.mjs", scripts)), root], { env, encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  assert.equal(run(), "");
  await mkdir(env.RANKUP_HOME);
  await mkdir(project);
  await writeFile(path.join(env.RANKUP_HOME, "README.md"), "全局规则导航");
  await writeFile(path.join(project, "README.md"), "组合导航");
  assert.match(run(), /全局规则导航[\s\S]*组合导航/);
  await writeFile(path.join(project, "INDEX.md"), "项目接力导航");
  assert.match(run(), /全局规则导航[\s\S]*项目接力导航/);
  assert.doesNotMatch(run(), /组合导航/);
});

test("doctor 在两层的规则上只告警，略过记录", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "rankup-memory-lint-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const globalDir = path.join(root, "global");
  const project = path.join(root, ".rankup");
  await mkdir(globalDir);
  await mkdir(path.join(project, "journal"), { recursive: true });
  await mkdir(path.join(project, "evidence"));
  await mkdir(path.join(project, "topics"));
  const legacy = [
    "- 用户 9-12 定调",
    "- [2026-09-13] 旧观察",
    "- [2026-09-14] 另一条观察",
    `- 「${"一".repeat(40)}」`,
    "- 核对发布后的实际页面内容。适用：发布之后。",
    "- 核对发布后的实际页面文案。适用：发布之后。",
    "- 禁止继续推进",
    "- 一律先回读。适用：写入以后。",
  ].join("\n");
  await writeFile(path.join(root, "shared.md"), legacy);
  await symlink(path.join(root, "shared.md"), path.join(globalDir, "preferences.md"));
  await writeFile(path.join(project, "experience.md"), legacy);
  await writeFile(path.join(project, "topics", "release.md"), "复读\n".repeat(151));
  await writeFile(path.join(project, "journal", "history.md"), legacy);
  await writeFile(path.join(project, "evidence", "report.md"), legacy);
  await writeFile(path.join(project, "decisions.md"), [
    "## 历史",
    legacy,
    "## 规则",
    "- 从不跳过回读",
    "## 授权原话",
    legacy,
    "## DEC-00000000-00",
    "- 规则：一律先回读。",
    "  适用：写入之后。",
  ].join("\n"));
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("rankup-doctor.mjs", scripts)), "--project-root", root, "--json",
  ], { env: { ...process.env, RANKUP_HOME: globalDir }, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const { memoryWarnings } = JSON.parse(result.stdout);
  for (const name of ["preferences.md", "experience.md"]) {
    const checks = memoryWarnings.filter((warning) => warning.where.endsWith(name)).map((warning) => warning.check).sort();
    assert.deepEqual(checks, ["原话或日期出处", "原话或日期出处", "日期密度", "缺适用条件", "近似重复"].sort());
  }
  assert.deepEqual(memoryWarnings.filter((warning) => warning.where.endsWith("decisions.md")).map((warning) => warning.check), ["缺适用条件"]);
  assert.ok(memoryWarnings.some((warning) => warning.where.endsWith("release.md") && warning.check === "超长"));
  assert.ok(memoryWarnings.every((warning) => !/history\.md|report\.md/.test(warning.where)));
});
