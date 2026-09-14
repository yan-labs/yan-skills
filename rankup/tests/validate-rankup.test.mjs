import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function withSkillCopy(run) {
  const temporaryRoot = await mkdtemp(
    path.join(tmpdir(), "rankup-validator-test-"),
  );
  const skillRoot = path.join(temporaryRoot, "rankup");
  try {
    await cp(sourceRoot, skillRoot, { recursive: true });
    return await run(skillRoot);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

function validate(skillRoot, { env } = {}) {
  return spawnSync(
    process.execPath,
    [path.join(skillRoot, "scripts", "validate-rankup.mjs")],
    { encoding: "utf8", env: env ? { ...process.env, ...env } : process.env },
  );
}

test("release validator accepts the complete installed Skill", async () => {
  await withSkillCopy(async (skillRoot) => {
    const result = validate(skillRoot);
    assert.equal(result.status, 0, result.stderr);
    // 版本从 skill.json 读取,避免每次发版都要手改断言而漏改。
    const { version } = JSON.parse(
      await readFile(path.join(skillRoot, "skill.json"), "utf8"),
    );
    assert.equal(result.stdout.trim(), `rankup ${version} validation passed`);
  });
});

test("release validator rejects a stale repository README version", async () => {
  await withSkillCopy(async (skillRoot) => {
    await writeFile(path.join(skillRoot, "..", "README.md"), "# yan-skills\n\n版本 `0.0.0`。\n");
    const result = validate(skillRoot);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /README\.md version must be/);
  });
});

// Skill 必须保持项目中立:项目可归属内容属于 <project>/.rankup/。
// 每种泄漏形态都单独负向测试,否则闸门可能只是看起来存在。
for (const [label, leak] of [
  ["project identifier", "实证:bettercallsaul 的首页转化率。"],
  ["absolute host path", "脚本位于 /Users/someone/Project/site/run.mjs。"],
  ["hardcoded local proxy", "代理走 127.0.0.1:7890。"],
]) {
  test(`release validator rejects a ${label} leak`, async () => {
    await withSkillCopy(async (skillRoot) => {
      const target = path.join(skillRoot, "references", "lifecycle.md");
      await writeFile(target, `${await readFile(target, "utf8")}\n${leak}\n`);
      const result = validate(skillRoot);
      assert.equal(result.status, 1, "泄漏内容必须让验证失败");
      assert.match(result.stderr, new RegExp(label));
    });
  });
}

// ── 运行时补充的项目名泄露检测(2026-09-13 独立验收澄清后新增)──────────────
// projectLeakPatterns 静态清单只收"已经泄漏过"的代号,不该继续手工往里加真实
// 项目名(那本身就是又一次把项目代号提交进要开源的 Skill)。新项目改走
// RANKUP_PROJECT_ROOTS/config.json 的扫描根,运行时把子目录名当额外泄露词——
// 与 registry.mjs scan 同源的读取逻辑。这里验证:配置了才拦、没配置时安静跳过
// (CI 现有行为不变)。

test("release validator 从 RANKUP_PROJECT_ROOTS 动态识别项目名泄露", async () => {
  await withSkillCopy(async (skillRoot) => {
    const rootsParent = await mkdtemp(path.join(tmpdir(), "rankup-fake-roots-"));
    // 隔离 HOME,让 resolveRoots 读 ~/.rankup/config.json 时查到的是一个必定不存在
    // 的空目录——不依赖运行测试的这台机器上到底有没有配置真实的 config.json,
    // 保证"没配置时不拦"这一半断言在任何机器上都成立,不是只在开发者本机凑巧成立。
    const isolatedHome = await mkdtemp(path.join(tmpdir(), "rankup-isolated-home-"));
    try {
      const fakeProjectName = "totally-fake-leaktest-project-xyz123";
      await mkdir(path.join(rootsParent, fakeProjectName), { recursive: true });

      const target = path.join(skillRoot, "references", "lifecycle.md");
      await writeFile(target, `${await readFile(target, "utf8")}\n实证:${fakeProjectName} 的转化率。\n`);

      // 没配置 RANKUP_PROJECT_ROOTS/config.json 时,这个虚构项目名不在任何清单里,应该照常通过。
      const withoutConfig = validate(skillRoot, { env: { RANKUP_PROJECT_ROOTS: "", HOME: isolatedHome } });
      assert.equal(withoutConfig.status, 0, "没有配置扫描根时不应该报这个新模式的错，CI 行为不能变");

      // 配置了 RANKUP_PROJECT_ROOTS 后,子目录名应该被当成额外泄露词拦下来。
      const withConfig = validate(skillRoot, { env: { RANKUP_PROJECT_ROOTS: rootsParent, HOME: isolatedHome } });
      assert.equal(withConfig.status, 1, "配置了扫描根之后应该拦下这个项目名");
      assert.match(withConfig.stderr, new RegExp(fakeProjectName));
    } finally {
      await rm(rootsParent, { recursive: true, force: true });
      await rm(isolatedHome, { recursive: true, force: true });
    }
  });
});

test("release validator 在扫描根不存在时安静跳过，不报错、不炸", async () => {
  await withSkillCopy(async (skillRoot) => {
    const missingRoot = path.join(tmpdir(), "rankup-does-not-exist-" + Date.now());
    const result = validate(skillRoot, { env: { RANKUP_PROJECT_ROOTS: missingRoot } });
    assert.equal(result.status, 0, result.stderr);
  });
});

test("release validator ignores leak patterns inside its own source", async () => {
  await withSkillCopy(async (skillRoot) => {
    const validator = path.join(skillRoot, "scripts", "validate-rankup.mjs");
    const text = await readFile(validator, "utf8");
    assert.ok(
      text.includes("bettercallsaul"),
      "验证脚本自身含有模式字面量,本测试才有意义",
    );
    assert.equal(validate(skillRoot).status, 0, "守卫不得自我告警");
  });
});

test("release validator cannot satisfy commands from its own source", async () => {
  await withSkillCopy(async (skillRoot) => {
    const referencePath = path.join(
      skillRoot,
      "references",
      "cloudflare-stack.md",
    );
    const original = await readFile(referencePath, "utf8");
    await writeFile(
      referencePath,
      original.replace(
        "pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer",
        "pnpm dlx shadcn@latest init",
      ),
    );

    const result = validate(skillRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required content in references\/cloudflare-stack\.md/);
  });
});

test("release validator requires the secret prohibition in SKILL.md", async () => {
  await withSkillCopy(async (skillRoot) => {
    const skillPath = path.join(skillRoot, "SKILL.md");
    const original = await readFile(skillPath, "utf8");
    await writeFile(
      skillPath,
      original.replace(
        "严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥",
        "不要在项目中保存敏感材料",
      ),
    );

    const result = validate(skillRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing required content in SKILL\.md/);
  });
});

test("release validator requires the individual backlink install command", async () => {
  await withSkillCopy(async (skillRoot) => {
    const integrationPath = path.join(
      skillRoot,
      "references",
      "integrations.md",
    );
    const original = await readFile(integrationPath, "utf8");
    await writeFile(
      integrationPath,
      original.replace(
        "npx skills add yan-labs/yan-skills --skill backlink -g -y",
        "npx skills add yan-labs/yan-skills -g --all",
      ),
    );

    const result = validate(skillRoot);
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /missing required content in references\/integrations\.md/,
    );
  });
});

test("release validator rejects a broken linked reference", async () => {
  await withSkillCopy(async (skillRoot) => {
    await unlink(
      path.join(skillRoot, "references", "project-memory.md"),
    );
    const result = validate(skillRoot);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing reference: references\/project-memory\.md/);
    assert.match(result.stderr, /broken local Markdown link/);
  });
});

test("release validator keeps release checks in their owning stage", async () => {
  await withSkillCopy(async (skillRoot) => {
    const target = path.join(skillRoot, "references", "checklists.md");
    const original = await readFile(target, "utf8");
    for (const label of [
      "D1 · `SITE_URL` 构建期注入客户端",
      "D4 · 分析脚本延迟加载",
      "D12 · JSON-LD 注入方式与类型选择已定",
      "D13 · a11y 属性组件级核对",
      "P3 · 独立 og + 内链闭环",
      "分析通道在采集",
      "索引已放开并复核",
      "图标专项（上线前必过）",
    ]) {
      const row = original.split("\n").find(line => line.startsWith("| ") && line.includes(label));
      assert.ok(row, label);
      // All wording survives, but the operative row is moved outside its stage.
      await writeFile(target, original.replace(row, "") + `\n${row}\n`);
      const result = validate(skillRoot);
      assert.equal(result.status, 1, label);
      assert.match(result.stderr, /checklist gate must occur once as a table row/);
    }
  });
});

test("release validator rejects removal of substantive release criteria", async () => {
  await withSkillCopy(async (skillRoot) => {
    const target = path.join(skillRoot, "references", "checklists.md");
    const original = await readFile(target, "utf8");
    for (const phrase of [
      "production 开与 preview 关两条构建回归",
      "robots meta 恰好一条",
      "不能以 JSON.parse 成功代替",
      "grid → row → gridcell",
      "内链图与可索引路由清单对账无遗漏",
      "HTML Accept 原始响应与真实浏览器分别核验",
      "实际远端上报证据",
    ]) {
      assert.ok(original.includes(phrase));
      await writeFile(target, original.replaceAll(phrase, "[removed]"));
      const result = validate(skillRoot);
      assert.equal(result.status, 1, phrase);
      assert.match(result.stderr, /missing required content in references\/checklists\.md/);
    }
  });
});
