import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const collectScript = path.join(skillRoot, "scripts", "harvest-collect.sh");
const mergeScript = path.join(skillRoot, "scripts", "harvest-merge.mjs");

async function withTempDir(run) {
  const root = await mkdtemp(path.join(tmpdir(), "backlink-harvest-test-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// harvest-collect.sh
// ─────────────────────────────────────────────────────────────────────────

// 「文件不够」这一支要空转 60 轮 × sleep 3 = 3 分钟。测试只需要验证退出码和
// 提示语,不需要真的等,所以给它一个立刻返回的 sleep 垫片。垫片只改测试环境的
// PATH,脚本本身一个字没动 —— 轮询次数、计数逻辑、退出码全部照原样跑完。
async function fastSleepEnv(root) {
  const bin = path.join(root, "bin");
  await mkdir(bin, { recursive: true });
  const shim = path.join(bin, "sleep");
  await writeFile(shim, "#!/bin/sh\nexit 0\n");
  await chmod(shim, 0o755);
  return { ...process.env, PATH: `${bin}:${process.env.PATH}` };
}

function runCollect(expected, dest, downloads, env = process.env) {
  return spawnSync("bash", [collectScript, String(expected), dest, downloads], {
    encoding: "utf8",
    env,
  });
}

async function seedDownloads(root, names) {
  const downloads = path.join(root, "Downloads");
  await mkdir(downloads, { recursive: true });
  for (const name of names) {
    await writeFile(path.join(downloads, name), "1\talpha\t1\t2\t3\t4\n");
  }
  return downloads;
}

test("collect 等不齐文件时拒绝复制", async () => {
  await withTempDir(async (root) => {
    const downloads = await seedDownloads(root, ["harvest_20260101_s_a.tsv"]);
    const dest = path.join(root, "dest");

    const result = runCollect(2, dest, downloads, await fastSleepEnv(root));

    assert.equal(result.status, 1, "少一个数据源必须失败,不能静默复制");
    assert.match(result.stderr, /只等到 1\/2/);
    // 宁可什么都不复制,也不要让下游合并出一份"看起来正常"的残缺数据。
    assert.deepEqual(await readdir(dest).catch(() => []), []);
  });
});

test("collect 拦截浏览器 (1) 重名产物", async () => {
  await withTempDir(async (root) => {
    const downloads = await seedDownloads(root, [
      "harvest_20260101_s_a.tsv",
      "harvest_20260101_s_a (1).tsv",
    ]);
    const dest = path.join(root, "dest");

    const result = runCollect(2, dest, downloads);

    assert.equal(result.status, 1, "重名产物内容可能与正本不同,必须拦下");
    assert.match(result.stderr, /重名产物/);
    assert.match(result.stderr, /\(1\)\.tsv/);
    assert.deepEqual(await readdir(dest).catch(() => []), []);
  });
});

test("collect 拦截无扩展名残片", async () => {
  await withTempDir(async (root) => {
    const downloads = await seedDownloads(root, [
      "harvest_20260101_s_a.tsv",
      "harvest_20260101_s_b.tsv",
      // 浏览器对同名下载的另一种处理:直接把扩展名去掉。
      // 数量已经达标,只有单独的残片检测才能发现它。
      "harvest_20260101_s_b",
    ]);
    const dest = path.join(root, "dest");

    const result = runCollect(2, dest, downloads);

    assert.equal(result.status, 1, "残片必须拦下,否则 *.tsv 通配会漏读它");
    assert.match(result.stderr, /harvest_20260101_s_b$/m);
    assert.deepEqual(await readdir(dest).catch(() => []), []);
  });
});

test("collect 干净路径:等齐、无重名,复制并报数", async () => {
  await withTempDir(async (root) => {
    const downloads = await seedDownloads(root, [
      "harvest_20260101_s_a.tsv",
      "harvest_20260101_s_b.tsv",
    ]);
    const dest = path.join(root, "dest");

    const result = runCollect(2, dest, downloads);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /✓ 已收拢 2 个文件/);
    assert.deepEqual((await readdir(dest)).sort(), [
      "harvest_20260101_s_a.tsv",
      "harvest_20260101_s_b.tsv",
    ]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// harvest-merge.mjs
// ─────────────────────────────────────────────────────────────────────────

function runMerge(args) {
  return spawnSync(process.execPath, [mergeScript, ...args], {
    encoding: "utf8",
  });
}

test("merge 拒绝浏览器重复下载文件", async () => {
  await withTempDir(async (root) => {
    const dir = path.join(root, "in");
    await mkdir(dir, { recursive: true });
    await writeFile(
      path.join(dir, "harvest_20260101_s_a.tsv"),
      "1\talpha\t1\t2\t3\t4\n",
    );
    await writeFile(
      path.join(dir, "harvest_20260101_s_a (1).tsv"),
      "1\talpha\t9\t9\t9\t9\n",
    );

    const result = runMerge([dir, "--out", path.join(root, "out")]);

    assert.equal(result.status, 1, "同名两份内容不同,静默合并 = 数据污染");
    assert.match(result.stderr, /重复下载文件/);
    assert.match(result.stderr, /\(1\)\.tsv/);
  });
});

test("merge 拒绝同一目标的多份文件", async () => {
  await withTempDir(async (root) => {
    const dir = path.join(root, "in");
    await mkdir(dir, { recursive: true });
    // 第二道守卫:剥掉 (n) 之后同名。`(n)` 不在末尾时第一道守卫看不见它,
    // 这条才是它独立存在的理由 —— 没有它,两份内容不同的文件会被静默合并。
    await writeFile(
      path.join(dir, "harvest_20260101_s_a.tsv"),
      "1\talpha\t1\t2\t3\t4\n",
    );
    await writeFile(
      path.join(dir, "harvest_20260101_s (1)_a.tsv"),
      "1\talpha\t9\t9\t9\t9\n",
    );

    const result = runMerge([dir, "--out", path.join(root, "out")]);

    assert.equal(result.status, 1, "无法判定哪份是新的时,必须停下让人处理");
    assert.match(result.stderr, /同一目标出现多份文件/);
  });
});

test("merge 丢掉主键是数值/百分比/徽章/占位符的脏行", async () => {
  await withTempDir(async (root) => {
    const dir = path.join(root, "in");
    await mkdir(dir, { recursive: true });
    // keyCol 默认 1(第二列)。列错位时,数值/百分比/徽章会顶到主键位上,
    // 于是"12.3K"这种东西被当成名称写进最终报告 —— 全程不报错。
    await writeFile(
      path.join(dir, "harvest_20260101_s_a.tsv"),
      [
        "1\tblue topaz\t12.3K\t45%\t8\tabc",
        "2\t12.3K\tblue topaz\t45%\t8\tabc",
        "3\t45%\tblue topaz\t12.3K\t8\tabc",
        "4\tNEW\tblue topaz\t12.3K\t8\tabc",
        "5\t-\tblue topaz\t12.3K\t8\tabc",
        "6\t1,234\tblue topaz\t12.3K\t8\tabc",
      ].join("\n"),
    );

    const out = path.join(root, "out");
    const result = runMerge([dir, "--out", out]);

    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.parsed, 1, "只有主键像名字的那一行该留下");
    assert.equal(report.dropped, 5);

    // 只看主键列:脏值出现在其它列是正常的(它们本来就是数值/百分比)。
    const csv = await readFile(`${out}.csv`, "utf8");
    const keys = csv
      .split("\n")
      .slice(1)
      .filter(Boolean)
      .map((line) => line.match(/^"((?:[^"]|"")*)"/)[1]);
    assert.deepEqual(keys, ["blue topaz"]);
  });
});

test("merge 去重时保留另一来源独有的字段", async () => {
  await withTempDir(async (root) => {
    const dir = path.join(root, "in");
    await mkdir(dir, { recursive: true });
    // 实测过的 bug:直接覆盖会让"字段更少"的那条抹掉独有列(比如落地页 URL),
    // 报表头号条目因此缩水两个数量级,而报告本身毫无异常。
    await writeFile(
      path.join(dir, "harvest_20260101_s_alpha.tsv"),
      "1\twidget\tfromA\t-\t\ttail\n",
    );
    await writeFile(
      path.join(dir, "harvest_20260101_s_beta.tsv"),
      "1\twidget\t-\tfromB2\tfromB3\ttail\n",
    );

    const out = path.join(root, "out");
    const result = runMerge([dir, "--out", out]);

    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).unique, 1);

    const csv = await readFile(`${out}.csv`, "utf8");
    assert.match(csv, /fromA/, "先到的非空值不该被覆盖");
    assert.match(csv, /fromB2/, "先到的 '-' 占位必须被后到的真值补上");
    assert.match(csv, /fromB3/, "先到的空列必须被后到的真值补上");
    assert.match(csv, /s_alpha;s_beta|s_beta;s_alpha/, "来源必须双记");
  });
});

test("merge 没有输入时失败而不是产出空文件", async () => {
  await withTempDir(async (root) => {
    const result = runMerge([
      path.join(root, "nope"),
      "--out",
      path.join(root, "out"),
    ]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /没有找到任何 \.tsv 输入/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 项目中立性:Skill 里不得出现任何可归属到具体项目、账号或本机环境的内容。
// 模式与 rankup/scripts/validate-rankup.mjs 的 projectLeakPatterns 保持一致。
// ─────────────────────────────────────────────────────────────────────────

// 名单里为什么是这些名字:它们是**已经泄漏过或最可能泄漏**的自有项目代号。
// 这不是「这些项目特殊」,而是黑名单只能拦住它认识的词——2026-08-21 发现
// `intabtools` / `toolpear` 有四处漏进 backlink/,根因就是它们不在这张表里。
// **新开一个项目时把它的代号加进来**,否则这个守卫对它等于不存在。
const projectLeakPatterns = [
  ["project identifier", /\b(?:bettercallsaul|birthstonemeaning|crystalhealing|sbti|intabtools|toolpear|shindan-lab|butterflydream|sgsz-alliance|xueer)\b/gi],
  ["absolute host path", /\/Users\/[A-Za-z0-9._-]+\//g],
  ["hardcoded local proxy", /\b127\.0\.0\.1:\d{2,5}\b/g],
  ["credential store location", /\.claude\.json\b/g],
];

// 本文件按职责必须含上述模式的字面量(它就是守卫本体),扫描时排除。
// 除此之外 backlink/ 下任何文件都不得豁免。
const leakScanExcludes = new Set(["tests/harvest.test.mjs"]);

async function collectSkillFiles(directory = skillRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSkillFiles(absolute)));
    } else {
      files.push(absolute);
    }
  }
  return files;
}

test("Skill 内容保持项目中立", async () => {
  const files = await collectSkillFiles();
  assert.ok(files.length >= 4, "扫描必须真的看到文件,空扫等于没测");

  const findings = [];
  for (const absolute of files) {
    const relative = path.relative(skillRoot, absolute);
    if (leakScanExcludes.has(relative)) continue;
    const text = await readFile(absolute, "utf8");
    for (const [label, pattern] of projectLeakPatterns) {
      for (const match of text.matchAll(pattern)) {
        findings.push(`${relative}: ${label} → ${match[0]}`);
      }
    }
  }

  assert.deepEqual(findings, [], `发现项目泄漏:\n${findings.join("\n")}`);
});

test("SKILL.md frontmatter 的 name 等于目录名", async () => {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(frontmatter, "SKILL.md 必须有 frontmatter");
  const name = frontmatter[1].match(/^name:\s*(.+)$/m)?.[1].trim();
  assert.equal(name, path.basename(skillRoot));
  const description = frontmatter[1].match(/^description:\s*(.+)$/m)?.[1].trim();
  assert.ok(
    description && description.length > 80,
    "description 必须写足触发词,太短会 undertrigger",
  );
});

// 每个 scripts/ 下的入口都必须在 SKILL.md 里被提到。
//
// **为什么是扫目录而不是写死清单。** 这条检查原本枚举三个文件名，于是
// semrush-traffic.mjs 加进仓库后一直没被 SKILL.md 收录，CI 也一直是绿的——
// 写死的清单只能证明「清单里的东西还在」，永远证明不了「没有漏」。
// 本仓库反复栽在这个形态上，所以这里改成扫目录 + 显式豁免。
//
// 豁免要写理由，并且被下面的测试校验「豁免的文件确实还存在」，
// 免得删了文件之后豁免条目变成永久的死规则。
const SKILL_MAP_EXEMPT = new Map([
  // 目前没有豁免。加条目前先想清楚：读者要用这个脚本时，怎么知道它存在？
]);

async function skillMapCoverage(skillText) {
  const entries = await readdir(path.join(skillRoot, "scripts"), { withFileTypes: true });
  const names = entries
    .filter((e) => e.isFile() && /\.(mjs|js|sh)$/.test(e.name))
    .map((e) => e.name)
    .sort();
  return {
    names,
    missing: names.filter(
      (name) => !SKILL_MAP_EXEMPT.has(name) && !skillText.includes(name),
    ),
  };
}

test("每个 scripts/ 入口都被 SKILL.md 提到（扫目录，不是写死清单）", async () => {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const { names, missing } = await skillMapCoverage(text);
  // 扫描本身坏掉时（改了后缀、挪了目录）会一个文件都扫不到，那样这条检查
  // 会「全绿地什么也没测」。先给扫描结果本身设一个下界。
  assert.ok(names.length >= 20, `scripts/ 扫描只找到 ${names.length} 个入口，扫描逻辑可能坏了`);
  assert.deepEqual(missing, [], `这些脚本没有出现在 SKILL.md 里:\n${missing.join("\n")}`);

  for (const [name, reason] of SKILL_MAP_EXEMPT) {
    assert.ok(names.includes(name), `豁免清单里的 ${name} 已经不存在了，删掉这条豁免（理由曾是：${reason}）`);
  }
});

// 变异测试：把某个脚本的提及从 SKILL.md 文本里删掉，上面那条检查必须变红。
// 没有这一条，覆盖检查可能因为某个恒真的写法而永远通过。
test("SKILL.md 覆盖检查会因为漏掉一个脚本而变红", async () => {
  const text = await readFile(path.join(skillRoot, "SKILL.md"), "utf8");
  const { missing: baseline } = await skillMapCoverage(text);
  assert.deepEqual(baseline, [], "变异测试的基线必须是干净的");

  for (const victim of ["semrush-traffic.mjs", "harvest.browser.js"]) {
    const mutated = text.split(victim).join("REMOVED-BY-MUTATION-TEST");
    assert.ok(!mutated.includes(victim), `变异没生效：SKILL.md 里本来就没有 ${victim}`);
    const { missing } = await skillMapCoverage(mutated);
    assert.deepEqual(missing, [victim], `删掉 ${victim} 的提及之后，覆盖检查还是绿的`);
  }
});

test("semrush-traffic.mjs 默认走前台标签页", async () => {
  // 这张报表在后台标签页里不水合（2026-08-28 控制变量实测），
  // 见 SKILL.md 的 <law id="hidden-tabs-do-not-hydrate">。
  // 谁把默认改回后台，这条会红——这正是它存在的理由。
  const mod = await import(new URL("../scripts/semrush-traffic.mjs", import.meta.url));
  assert.equal(mod.DEFAULT_WINDOW, "foreground");

  const source = await readFile(path.join(skillRoot, "scripts", "semrush-traffic.mjs"), "utf8");
  // 2026-09-14：默认先走虚拟屏幕策略（可见且不抢焦点），DEFAULT_WINDOW（foreground）是检测不到
  // 虚拟屏幕时的回退；显式 --window 必须仍然能覆盖默认值（resolveWindowStrategy 原样透传四档）。
  assert.match(source, /resolveWindowStrategy\(\{\s*windowFlag:\s*flags\.window,\s*fallbackWindowMode:\s*DEFAULT_WINDOW\s*\}\)/);
  assert.match(source, /window:\s*windowStrategy\.launchWindow/);
  // 公共默认不许被改成前台：那会让所有脚本都去抢用户的活动标签页。
  const shared = await readFile(path.join(skillRoot, "scripts", "lib-tools-share.mjs"), "utf8");
  assert.match(shared, /windowMode\s*=\s*'background'/);
});

test("import semrush-traffic.mjs 不会启动 CLI", async () => {
  // 2026-08-28：没有 import 守卫时，只想单测解析函数的人意外开了一个浏览器会话。
  const mod = await import(new URL("../scripts/semrush-traffic.mjs", import.meta.url));
  assert.equal(typeof mod.parseTrafficSummary, "function");
  const parsed = mod.parseTrafficSummary(
    ["摘要", "摘要", "导出", "访问量", "访问量", "7.9亿", "↑4.53%", "84.26%", "15.74%", "流量趋势"].join("\n"),
  );
  assert.equal(parsed.visits, 790000000);
  assert.equal(parsed.mobileSharePercent, 15.74);

  const source = await readFile(path.join(skillRoot, "scripts", "semrush-traffic.mjs"), "utf8");
  assert.match(source, /invokedAsScript/, "CLI 必须被 import 守卫包住");
  // 顶层不许有裸的 launchTool 调用（那正是 import 会开浏览器的写法）。
  assert.ok(
    !/^\s*(?:await\s+)?launchTool\(/m.test(source.replace(/^ {2,}.*$/gm, "")),
    "launchTool 只能出现在 main() 里面",
  );
});
