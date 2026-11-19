import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryScript = path.join(skillRoot, "scripts", "registry.mjs");

// 名单默认写在 Skill 目录里,测试必须用 RANKUP_REGISTRY_PATH 改道,
// 否则会覆盖使用者本机的真实名单。
function runScan(roots, home) {
  return spawnSync(process.execPath, [registryScript, "scan"], {
    encoding: "utf8",
    env: {
      ...process.env,
      HOME: home,
      RANKUP_REGISTRY_PATH: path.join(home, "registry.md"),
      RANKUP_PROJECT_ROOTS: roots.join(path.delimiter),
    },
  });
}

function runList(home) {
  return spawnSync(process.execPath, [registryScript, "list"], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, RANKUP_REGISTRY_PATH: path.join(home, "registry.md") },
  });
}

async function withWorkspace(run) {
  const base = await mkdtemp(path.join(tmpdir(), "rankup-registry-test-"));
  try {
    return await run({ base, home: path.join(base, "home"), roots: path.join(base, "roots") });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

async function makeProject(root, name, { script, entries = 0 } = {}) {
  const rankupDir = path.join(root, name, ".rankup");
  await mkdir(rankupDir, { recursive: true });
  if (script) {
    await mkdir(path.join(rankupDir, "scripts"), { recursive: true });
    await writeFile(
      path.join(rankupDir, "scripts", script.name),
      `#!/usr/bin/env node\n// ${script.purpose}\n`,
    );
  }
  if (entries > 0) {
    const body = Array.from(
      { length: entries },
      (_, index) => index === 0 ? "- 核对发布结果。适用：发布后。" : `- **[2026-08-0${index + 1}] 结论 ${index}**:证据。`,
    ).join("\n");
    await writeFile(path.join(rankupDir, "experience.md"), `${body}\n`);
  }
}

test("scan 汇总各项目的脚本与经验条目", async () => {
  await withWorkspace(async ({ home, roots }) => {
    await makeProject(roots, "alpha", {
      script: { name: "gsc-export-queries.mjs", purpose: "导出 GSC 查询表(参数: --property --range)" },
      entries: 3,
    });
    await makeProject(roots, "beta", { entries: 1 });

    const scan = runScan([roots], home);
    assert.equal(scan.status, 0, scan.stderr);
    assert.match(scan.stdout, /已登记 2 个项目、1 个可复用脚本/);

    const list = runList(home);
    assert.equal(list.status, 0, list.stderr);
    assert.match(list.stdout, /gsc-export-queries\.mjs/);
    // 用途取自脚本头部注释,保证名单说明与脚本同源、不会各自漂移。
    assert.match(list.stdout, /导出 GSC 查询表/);
    assert.match(list.stdout, /\| alpha \| 3 \| 1 \|/);
    assert.match(list.stdout, /\| beta \| 1 \| 0 \|/);
  });
});

test("scan 能找到装在一层容器目录里的项目", async () => {
  await withWorkspace(async ({ home, roots }) => {
    await makeProject(path.join(roots, "group"), "nested", { entries: 2 });
    const scan = runScan([roots], home);
    assert.equal(scan.status, 0, scan.stderr);
    assert.match(scan.stdout, /已登记 1 个项目/);
    assert.match(runList(home).stdout, /nested/);
  });
});

test("scan 整表重建,移除已消失的项目", async () => {
  await withWorkspace(async ({ base, home, roots }) => {
    await makeProject(roots, "temporary", { entries: 1 });
    runScan([roots], home);
    assert.match(runList(home).stdout, /temporary/);

    await rm(path.join(roots, "temporary"), { recursive: true, force: true });
    runScan([roots], home);
    // 手工维护的索引必然过期;整表重建是这里唯一可接受的语义。
    assert.doesNotMatch(runList(home).stdout, /temporary/);
    assert.ok(base);
  });
});

test("未配置扫描根目录时明确报错而不是静默生成空表", async () => {
  await withWorkspace(async ({ home }) => {
    const result = spawnSync(process.execPath, [registryScript, "scan"], {
      encoding: "utf8",
      env: {
        ...process.env,
        HOME: home,
        RANKUP_REGISTRY_PATH: path.join(home, "registry.md"),
        RANKUP_PROJECT_ROOTS: "",
      },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /未指定扫描根目录/);
  });
});

test("名单尚不存在时 list 给出可执行的下一步", async () => {
  await withWorkspace(async ({ home }) => {
    const result = runList(home);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /registry\.mjs scan/);
  });
});
