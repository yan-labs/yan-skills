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
  ["absolute host path", "脚本位于 /Users/someone/Project/site/run.mjs。"],
  ["hardcoded local proxy", "代理走 127.0.0.1:7890。"],
  ["Clarity project ID", "脚本地址 https://www.clarity.ms/tag/ab12cd34ef 已接入。"],
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

// 项目代号、项目域名不写在源码里,只来自本机配置 $RANKUP_HOME/config.json。
// 用隔离的 RANKUP_HOME 验证:没有配置时放行,配置了才拦,排除表里的目录名不拦。
test("release validator 从本机配置读取项目代号、项目域名与目录名排除表", async () => {
  await withSkillCopy(async (skillRoot) => {
    const home = await mkdtemp(path.join(tmpdir(), "rankup-local-config-"));
    const rootsParent = await mkdtemp(path.join(tmpdir(), "rankup-fake-roots-"));
    try {
      await mkdir(path.join(rootsParent, "fake-generic-tool-qq1"), { recursive: true });
      const target = path.join(skillRoot, "references", "lifecycle.md");
      const original = await readFile(target, "utf8");
      const env = { RANKUP_HOME: home, RANKUP_PROJECT_ROOTS: "" };
      const writeConfig = (config) => writeFile(path.join(home, "config.json"), JSON.stringify(config));
      const config = {
        projectRoots: [rootsParent],
        projectRootsExclude: ["fake-generic-tool-qq1"],
        projectIdentifiers: ["fakecodename-zz9"],
        projectDomains: ["fake-site-zz9.example"],
      };

      for (const [label, leak] of [
        ["project identifier", "实证:fakecodename-zz9 的首页转化率。"],
        ["project domain", "见 https://www.fake-site-zz9.example/pricing 的定价页。"],
      ]) {
        await writeFile(target, `${original}\n${leak}\n`);
        await rm(path.join(home, "config.json"), { force: true });
        assert.equal(validate(skillRoot, { env }).status, 0, `没有本机配置时不拦: ${label}`);
        await writeConfig(config);
        const blocked = validate(skillRoot, { env });
        assert.equal(blocked.status, 1, `有本机配置时必须拦: ${label}`);
        assert.match(blocked.stderr, new RegExp(label));
      }

      await writeFile(target, `${original}\n用 fake-generic-tool-qq1 取数。\n`);
      assert.equal(validate(skillRoot, { env }).status, 0, "排除表里的目录名是合法通用词,不拦");
      await writeConfig({ ...config, projectRootsExclude: [] });
      assert.equal(validate(skillRoot, { env }).status, 1, "去掉排除后同一个目录名要被拦");
    } finally {
      await rm(home, { recursive: true, force: true });
      await rm(rootsParent, { recursive: true, force: true });
    }
  });
});

test("release validator ignores leak patterns inside its own source", async () => {
  await withSkillCopy(async (skillRoot) => {
    const validator = path.join(skillRoot, "scripts", "validate-rankup.mjs");
    const text = await readFile(validator, "utf8");
    assert.ok(
      text.includes("127\\.0\\.0\\.1"),
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
        "npx skills add $SKILLS_SOURCE --skill backlink -g -y",
        "npx skills add $SKILLS_SOURCE -g --all",
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


test("release validator rejects missing Cloudflare loop cost protections", async () => {
  await withSkillCopy(async (skillRoot) => {
    for (const [file, phrase] of [
      ["references/cloudflare-stack.md", "应用重新 `setAlarm()`"],
      ["references/cloudflare-stack.md", "## 8.9 循环消耗与账单熔断红线"],
      ["references/cloudflare-stack.md", "预算告警不是消费硬顶"],
      ["references/checklists.md", "Cloudflare 循环消耗红线"],
      ["references/lifecycle/stage-3-build.md", "cloudflare-stack.md#89-循环消耗与账单熔断红线"],
      ["references/lifecycle/stage-4-prelaunch.md", "Cloudflare 循环消耗红线未通过"],
      ["references/playbooks/site-review.md", "G6 循环与费用止损"],
    ]) {
      const target = path.join(skillRoot, file);
      const original = await readFile(target, "utf8");
      assert.ok(original.includes(phrase), phrase);
      await writeFile(target, original.replaceAll(phrase, "[removed]"));
      try {
        const result = validate(skillRoot);
        assert.equal(result.status, 1, `${file}: ${phrase}`);
        assert.match(result.stderr, /missing required content|checklist gate/);
      } finally {
        await writeFile(target, original);
      }
    }
  });
});

test("release validator requires production-line staging and post-deploy self-test rules", async () => {
  await withSkillCopy(async (skillRoot) => {
    for (const phrase of [
      "测试线通过不等于生产线通过",
      "预发验证",
      "发布后自测",
    ]) {
      const target = path.join(skillRoot, "references/discipline.md");
      const original = await readFile(target, "utf8");
      assert.ok(original.includes(phrase), phrase);
      await writeFile(target, original.replaceAll(phrase, "[removed]"));
      try {
        const result = validate(skillRoot);
        assert.equal(result.status, 1, phrase);
        assert.match(result.stderr, /missing required content/);
      } finally {
        await writeFile(target, original);
      }
    }
  });
});

test("release validator requires reusable test identity and login route rules", async () => {
  await withSkillCopy(async (skillRoot) => {
    for (const [file, phrase] of [
      ["references/discipline.md", "已有测试身份就直接用，不向用户重复索要"],
      ["references/discipline.md", "缺登录通道不等于缺输入"],
      ["references/discipline.md", "只动该账号自己拥有的测试空间与测试页面"],
      ["references/discipline.md", "不购买、不升级套餐、不绕过产品权益限制"],
      ["references/project-memory.md", "测试身份：位置/取 token 命令"],
    ]) {
      const target = path.join(skillRoot, file);
      const original = await readFile(target, "utf8");
      assert.ok(original.includes(phrase), phrase);
      await writeFile(target, original.replaceAll(phrase, "[removed]"));
      try {
        const result = validate(skillRoot);
        assert.equal(result.status, 1, `${file}: ${phrase}`);
        assert.match(result.stderr, /missing required content/);
      } finally {
        await writeFile(target, original);
      }
    }
  });
});

test("release validator 认 references/INDEX.md 为一跳可达的全量目录，并校验其中的链接", async () => {
  await withSkillCopy(async (skillRoot) => {
    const catalogPath = path.join(skillRoot, "references", "INDEX.md");
    const original = await readFile(catalogPath, "utf8");
    assert.ok(original.includes("](game-sites.md)"), "全量目录应链接 game-sites.md");
    assert.equal(validate(skillRoot).status, 0, "入口不直链、只经目录一跳可达时应通过");

    await writeFile(catalogPath, original.replace("](game-sites.md)", "](game-sites-missing.md)"));
    const broken = validate(skillRoot);
    assert.equal(broken.status, 1);
    assert.match(broken.stderr, /broken local Markdown link in references\/INDEX\.md/);
    assert.match(broken.stderr, /does not link references\/game-sites\.md/);
  });
});


test("release validator 只允许站点引擎产品名出现在集成文件里", async () => {
  await withSkillCopy(async (skillRoot) => {
    const isolated = { RANKUP_PROJECT_ROOTS: "", RANKUP_HOME: path.join(skillRoot, "..", "no-home") };
    assert.equal(validate(skillRoot, { env: isolated }).status, 0, "集成文件里的产品名应放行");
    const card = path.join(skillRoot, "references", "playbooks", "build.md");
    await writeFile(card, (await readFile(card, "utf8")) + "\n站建在 GeFeiSites 上时照做。\n");
    const result = validate(skillRoot, { env: isolated });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /site engine product name found in references\/playbooks\/build\.md/);
  });
});
