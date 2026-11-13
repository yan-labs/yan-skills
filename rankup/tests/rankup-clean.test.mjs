import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, stat, utimes, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { lint as lintDocs } from "../scripts/maintain/doc-lint.mjs";
import { diagnose } from "../scripts/maintain/rankup-doctor.mjs";
import {
  MAX_RETAINED_DATA_BYTES,
  applyClean,
  installPreCommitHook,
  planClean,
  writeRankupGitignore,
} from "../scripts/maintain/rankup-clean.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const cleanScript = path.resolve(here, "../scripts/maintain/rankup-clean.mjs");

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

test("rankup-clean classifies process data vs retained files and rewrites broken links on --apply", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "rankup-clean-unit-"));
  const projectRoot = path.join(tempRoot, "demo-project");
  const rankupDir = path.join(projectRoot, ".rankup");
  const rankupHome = path.join(tempRoot, "rankup-home");

  try {
    await mkdir(path.join(rankupDir, "reports"), { recursive: true });
    await mkdir(path.join(rankupDir, "artifacts"), { recursive: true });
    await mkdir(path.join(rankupDir, "scripts"), { recursive: true });
    await mkdir(path.join(rankupDir, "state"), { recursive: true });

    // Resident docs referencing a small structured JSON and an oversized JSON
    await writeFile(
      path.join(rankupDir, "INDEX.md"),
      [
        "# Demo Index",
        "- 当前阶段：段 3",
        "- 上一个完成的关卡：段 2（2026-11-01）",
        "- 下一步动作：执行清理测试",
        "- 当前阻塞：无阻塞",
        "",
        "## 接力",
        "- 下一条要执行的动作：核对 [小体积摘要](reports/resident-small.json) 与 [超大原始文件](reports/resident-huge.json)。",
      ].join("\n"),
    );
    await writeFile(
      path.join(rankupDir, "decisions.md"),
      "# 决策\n- DEC-1：保留 `reports/decision-ref.csv`。\n",
    );

    // Report referencing another report's raw JSON (must NOT count as resident reference)
    await writeFile(
      path.join(rankupDir, "reports/analysis.md"),
      [
        "# 分析报告",
        "结论正文保持不变。参见 [过程抓包](capture.har)、![截图](../artifacts/shot.png) 与 [报告私有数据](report-only.json)。",
        "代码块里的链接不应改动：`[code-link](report-only.json)`。",
      ].join("\n"),
    );

    // .keep-data whitelist
    await writeFile(
      path.join(rankupDir, ".keep-data"),
      [
        "# 白名单测试",
        "artifacts/keep-me.json # 用户显式保留",
        "reports/golden-*.jsonl 金标样本",
      ].join("\n"),
    );

    // Retained files: code, state/config, keep-data, and small resident-referenced data
    await writeFile(path.join(rankupDir, "scripts/helper.mjs"), "export const ok = true;\n");
    await writeFile(path.join(rankupDir, "scripts/query.sql"), "SELECT 1;\n");
    await writeFile(path.join(rankupDir, "skill-state.json"), '{"version":"3.40.0"}\n');
    await writeFile(path.join(rankupDir, "review-state.json"), '{"lastRun":"2026-11-05"}\n');
    await writeFile(path.join(rankupDir, "projects.json"), '{"projects":[]}\n');
    await writeFile(path.join(rankupDir, "state/checkpoint-1.json"), '{"step":1}\n');
    await writeFile(path.join(rankupDir, "artifacts/keep-me.json"), '{"kept":true}\n');
    await writeFile(path.join(rankupDir, "reports/golden-case1.jsonl"), '{"id":1}\n');
    await writeFile(path.join(rankupDir, "reports/resident-small.json"), '{"ok":true}\n');
    await writeFile(path.join(rankupDir, "reports/decision-ref.csv"), "k,v\na,1\n");

    // Cleaned files: screenshot, log, trace/har, surefire xml, archive, report-only json, oversized json
    await writeFile(path.join(rankupDir, "artifacts/shot.png"), Buffer.alloc(1024, 0x89));
    await writeFile(path.join(rankupDir, "artifacts/run.log"), "step 1\n");
    await writeFile(path.join(rankupDir, "reports/capture.har"), '{"log":{}}\n');
    await writeFile(path.join(rankupDir, "reports/TEST-unit.xml"), "<testsuite></testsuite>\n");
    await writeFile(path.join(rankupDir, "reports/capture.tar.gz"), Buffer.alloc(512, 0x1f));
    await writeFile(path.join(rankupDir, "reports/report-only.json"), '{"temp":true}\n');
    await writeFile(
      path.join(rankupDir, "reports/resident-huge.json"),
      Buffer.alloc(MAX_RETAINED_DATA_BYTES + 2048, 0x61),
    );

    // 1. Dry-run plan
    const plan = await planClean({ projectRoot });
    const cleanedRels = plan.toClean.map((item) => item.rel).sort();
    assert.deepEqual(cleanedRels, [
      "artifacts/run.log",
      "artifacts/shot.png",
      "reports/TEST-unit.xml",
      "reports/capture.har",
      "reports/capture.tar.gz",
      "reports/report-only.json",
      "reports/resident-huge.json",
    ]);

    const keptRels = plan.toKeep.map((item) => item.rel);
    for (const mustKeep of [
      "INDEX.md",
      "decisions.md",
      "reports/analysis.md",
      "scripts/helper.mjs",
      "scripts/query.sql",
      "skill-state.json",
      "review-state.json",
      "projects.json",
      "state/checkpoint-1.json",
      "artifacts/keep-me.json",
      "reports/golden-case1.jsonl",
      "reports/resident-small.json",
      "reports/decision-ref.csv",
    ]) {
      assert.ok(keptRels.includes(mustKeep), `expected ${mustKeep} to be kept`);
    }

    // 2. Apply clean with isolated RANKUP_HOME
    process.env.RANKUP_HOME = rankupHome;
    const applyRes = await applyClean(plan, { date: "2026-11-05" });
    assert.equal(applyRes.deletedCount, 7);
    assert.equal(await exists(path.join(rankupHome, "trash")), false);
    assert.equal(await exists(path.join(rankupDir, "artifacts/shot.png")), false);

    // Check Markdown link rewriting and doc-lint 0 broken links
    const updatedReport = await readFile(path.join(rankupDir, "reports/analysis.md"), "utf8");
    assert.match(updatedReport, /结论正文保持不变。参见 （原始数据已清理 2026-11-05）、（原始数据已清理 2026-11-05） 与 （原始数据已清理 2026-11-05）。/);
    assert.match(updatedReport, /`\[code-link\]\(report-only\.json\)`/);

    const lintReport = await lintDocs({ root: rankupDir });
    assert.equal(lintReport.broken.length, 0, `expected 0 broken links, got ${JSON.stringify(lintReport.broken)}`);
  } finally {
    delete process.env.RANKUP_HOME;
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rankup-clean --install-hook and --write-gitignore are idempotent and pre-commit unstages process data", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "rankup-clean-git-"));
  const repoRoot = path.join(tempRoot, "repo");
  const rankupDir = path.join(repoRoot, ".rankup");
  const rankupHome = path.join(tempRoot, "rankup-home");

  try {
    await mkdir(rankupDir, { recursive: true });
    execFileSync("git", ["init", repoRoot], { stdio: "ignore" });
    execFileSync("git", ["-C", repoRoot, "config", "user.email", "test@example.com"]);
    execFileSync("git", ["-C", repoRoot, "config", "user.name", "Tester"]);

    // Existing pre-commit hook to verify non-destructive append + idempotency
    const hooksDir = path.join(repoRoot, ".git", "hooks");
    await mkdir(hooksDir, { recursive: true });
    const existingHookPath = path.join(hooksDir, "pre-commit");
    await writeFile(existingHookPath, "#!/usr/bin/env sh\necho 'custom-hook-ok'\n", { mode: 0o755 });

    const firstHook = await installPreCommitHook(repoRoot);
    assert.equal(firstHook.changed, true);
    const secondHook = await installPreCommitHook(repoRoot);
    assert.equal(secondHook.changed, false);

    const hookContent = await readFile(existingHookPath, "utf8");
    assert.match(hookContent, /echo 'custom-hook-ok'/);
    assert.equal(hookContent.split("# >>> rankup-clean pre-commit >>>").length - 1, 1);

    const firstGitignore = await writeRankupGitignore(rankupDir);
    assert.equal(firstGitignore.changed, true);
    const secondGitignore = await writeRankupGitignore(rankupDir);
    assert.equal(secondGitignore.changed, false);

    // Stage one PNG and one MD in .rankup/ and commit
    await writeFile(path.join(rankupDir, "shot.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await writeFile(path.join(rankupDir, "note.md"), "# 笔记\n见 ![截图](shot.png)。\n");
    execFileSync("git", ["-C", repoRoot, "add", "-f", ".rankup/shot.png", ".rankup/note.md"]);

    const commitRes = spawnSync("git", ["-C", repoRoot, "commit", "-m", "test pre-commit clean"], {
      encoding: "utf8",
      env: { ...process.env, RANKUP_HOME: rankupHome },
    });
    assert.equal(commitRes.status, 0, `${commitRes.stdout}\n${commitRes.stderr}`);

    const committedFiles = execFileSync("git", ["-C", repoRoot, "show", "--name-only", "--format=", "HEAD"], {
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .filter(Boolean);
    assert.deepEqual(committedFiles, [".rankup/note.md"]);

    const committedMd = execFileSync("git", ["-C", repoRoot, "show", "HEAD:.rankup/note.md"], {
      encoding: "utf8",
    });
    assert.match(committedMd, /（原始数据已清理 \d{4}-\d{2}-\d{2}）/);
    assert.equal(await exists(path.join(rankupDir, "shot.png")), false);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rankup-doctor reports process data as bucket A while keeping backups as bucket C", async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), "rankup-doctor-clean-"));
  const rankupDir = path.join(tempRoot, ".rankup");
  try {
    await mkdir(path.join(rankupDir, "artifacts"), { recursive: true });
    await writeFile(
      path.join(rankupDir, "INDEX.md"),
      [
        "# Index",
        "- 当前阶段：段 3",
        "- 上一个完成的关卡：段 2（2026-11-05）",
        "- 下一步动作：检查 doctor",
        "- 当前阻塞：无阻塞",
        "",
        "## 接力",
        "- 下一条要执行的动作：执行检查",
      ].join("\n"),
    );
    await writeFile(path.join(rankupDir, "plan.md.bak"), "backup content\n");
    await writeFile(path.join(rankupDir, "artifacts/shot.png"), Buffer.alloc(256, 1));

    const result = await diagnose({ rankupDir });
    const processDataFinding = result.findings.find((f) => f.check === "过程数据残留");
    assert.ok(processDataFinding, "expected rankup-doctor to report 过程数据残留");
    assert.equal(processDataFinding.bucket, "A");

    const backupFinding = result.findings.find((f) => f.check === "备份副本");
    assert.ok(backupFinding, "expected rankup-doctor to report 备份副本");
    assert.equal(backupFinding.bucket, "C");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
});

test("rankup-clean CLI --help exits 0", () => {
  const res = spawnSync(process.execPath, [cleanScript, "--help"], { encoding: "utf8" });
  assert.equal(res.status, 0);
  assert.match(res.stdout, /rankup-clean\.mjs/);
});

test("rankup-clean works when .rankup is its own git repo and the project root is not", async () => {
  const projectRoot = await mkdtemp(path.join(tmpdir(), "rankup-clean-standalone-"));
  const rankupDir = path.join(projectRoot, ".rankup");
  const git = (...args) =>
    execFileSync("git", ["-C", rankupDir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const script = fileURLToPath(new URL("../scripts/maintain/rankup-clean.mjs", import.meta.url));
  try {
    await mkdir(rankupDir, { recursive: true });
    git("init", "-q");
    git("config", "user.email", "test@example.com");
    git("config", "user.name", "test");
    execFileSync("node", [script, "--project-root", projectRoot, "--install-hook"], {
      encoding: "utf8",
      env: { ...process.env, RANKUP_HOME: path.join(projectRoot, "home") },
    });
    await writeFile(path.join(rankupDir, "note.md"), "# note\n");
    await writeFile(path.join(rankupDir, "shot.png"), "png");
    git("add", "note.md", "shot.png");
    execFileSync("git", ["-C", rankupDir, "commit", "-q", "-m", "test"], {
      env: { ...process.env, RANKUP_HOME: path.join(projectRoot, "home") },
      stdio: "pipe",
    });
    assert.equal(git("show", "--name-only", "--format=", "HEAD").trim(), "note.md");
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});


test("age cutoff, workspace, permanent deletion and backup/state/whitelist retention", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rankup-age-"));
  const home = path.join(root, "home");
  const project = path.join(root, "project");
  const dir = path.join(project, ".rankup");
  const previous = process.env.RANKUP_HOME;
  process.env.RANKUP_HOME = home;
  try {
    const old = new Date(Date.now() - 15 * 86400000);
    const fixtures = ["INDEX.md", "plan.md", "decisions.md", "reports/INDEX.md", "reports/old.md", "research/temp.py", "journal/old.md", "artifacts/old.png", "reports/fresh.md", "reports/keep.md", "state/data.log", "review-state.json", "artifacts/DB-BACKUP/old.png", "reports/myBackup.md"];
    for (const rel of fixtures) {
      const f = path.join(dir, rel);
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, rel === "INDEX.md" ? "[report](reports/old.md)" : "fixture");
      if (!rel.includes("fresh")) await utimes(f, old, old);
    }
    await writeFile(path.join(dir, ".keep-data"), "reports/keep.md\n");
    await mkdir(path.join(home, "trash", "demo"), { recursive: true });
    await writeFile(path.join(home, "trash", "demo", "old.log"), "trash");
    const plan = await planClean({ projectRoot: project, olderThan: "1w" });
    assert.deepEqual(plan.toClean.map(e => e.rel).sort(), ["artifacts/old.png", "journal/old.md", "reports/old.md", "research/temp.py"]);
    assert.ok(plan.pendingConfirmation.some(e => e.path.endsWith("myBackup.md")));
    const cli = spawnSync(process.execPath, [cleanScript, "--workspace", root, "--older-than", "7d", "--dry-run"], { encoding: "utf8" });
    assert.equal(cli.status, 0, cli.stderr);
    assert.equal(JSON.parse(cli.stdout).projects.length, 1);
    assert.equal(await exists(path.join(dir, "reports/old.md")), true);
    await applyClean(plan);
    assert.equal(await exists(path.join(home, "trash")), false);
    assert.match(await readFile(path.join(dir, "INDEX.md"), "utf8"), /原始数据已清理/);
    for (const rel of fixtures.filter(f => !plan.toClean.some(e => e.rel === f))) assert.equal(await exists(path.join(dir, rel)), true, rel);
    await mkdir(path.join(home, "trash", "DBBackup"), { recursive: true });
    await writeFile(path.join(home, "trash", "DBBackup", "safe.log"), "safe");
    await applyClean(await planClean({ projectRoot: project, olderThan: "7d" }));
    assert.equal(await exists(path.join(home, "trash", "DBBackup", "safe.log")), true);
    const outside = path.join(root, "outside");
    await mkdir(outside);
    await writeFile(path.join(outside, "safe.log"), "safe");
    await rm(path.join(home, "trash"), { recursive: true });
    await symlink(outside, path.join(home, "trash"));
    await applyClean(await planClean({ projectRoot: project, olderThan: "7d" }));
    assert.equal(await exists(path.join(outside, "safe.log")), true);
    assert.notEqual(spawnSync(process.execPath, [cleanScript, "--older-than", "0d"]).status, 0);
  } finally {
    if (previous === undefined) delete process.env.RANKUP_HOME; else process.env.RANKUP_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});


test("evidence/backups are pending with metadata; explicit paths keep age and resident protection", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "rankup-confirm-"));
  const home = path.join(root, "home");
  const projectRoot = path.join(root, "project");
  const dir = path.join(projectRoot, ".rankup");
  const previous = process.env.RANKUP_HOME;
  process.env.RANKUP_HOME = home;
  try {
    const old = new Date(Date.now() - 15 * 86400000);
    const rels = ["evidence/shot.png", "reports/snapshot.md", "scripts/db.sql", "data/dump.gz", "Backup/old.log", "evidence/keep.png", "evidence/new.png", "state/backup.json"];
    for (const rel of rels) {
      const f = path.join(dir, rel);
      await mkdir(path.dirname(f), { recursive: true });
      await writeFile(f, "fixture");
      if (!rel.includes("new")) await utimes(f, old, old);
    }
    await writeFile(path.join(dir, "INDEX.md"), "[proof](evidence/shot.png)\n");
    await writeFile(path.join(dir, ".keep-data"), "evidence/keep.png\n");
    const plan = await planClean({ projectRoot, olderThan: "7d" });
    assert.equal(plan.toClean.length, 0);
    assert.equal(plan.pendingConfirmation.length, rels.length);
    const pending = plan.pendingConfirmation.find(e => e.path.endsWith("shot.png"));
    assert.equal(pending.bytes, 7);
    assert.equal(pending.modifiedAt, old.toISOString());
    assert.equal(pending.taskOrProject, projectRoot);
    assert.deepEqual(pending.referencedBy, [path.join(dir, "INDEX.md")]);
    assert.match(pending.usefulness, /无法自动判断/);
    await mkdir(path.join(home, "trash", "Backup"), { recursive: true });
    const trashBackup = path.join(home, "trash", "Backup", "db.sql");
    await writeFile(trashBackup, "backup");
    const approved = await planClean({ projectRoot, olderThan: "7d", includeBackups: [dir, trashBackup] });
    assert.deepEqual(approved.toClean.map(e => e.rel).sort(), rels.filter(e => !["evidence/keep.png", "evidence/new.png", "state/backup.json"].includes(e)).sort());
    await applyClean(approved);
    assert.equal(await exists(trashBackup), false);
    assert.equal(await exists(path.join(dir, "evidence/new.png")), true);
    assert.equal(await exists(path.join(dir, "evidence/keep.png")), true);
    assert.equal(await exists(path.join(dir, "state/backup.json")), true);
    assert.match(await readFile(path.join(dir, "INDEX.md"), "utf8"), /原始数据已清理/);
  } finally {
    if (previous === undefined) delete process.env.RANKUP_HOME; else process.env.RANKUP_HOME = previous;
    await rm(root, { recursive: true, force: true });
  }
});
