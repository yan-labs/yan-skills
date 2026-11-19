import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewScript = path.join(skillRoot, "scripts", "review.mjs");

function runReview(projectRoot, extra = []) {
  return spawnSync(process.execPath, [reviewScript, "--project-root", projectRoot, ...extra], {
    encoding: "utf8",
  });
}

async function withProject(run) {
  const root = await mkdtemp(path.join(tmpdir(), "rankup-review-test-"));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function seed(root, files) {
  const rankupDir = path.join(root, ".rankup");
  await mkdir(rankupDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const target = path.join(rankupDir, name);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  return rankupDir;
}

test("没有 .rankup 时指向 init，而不是报一堆缺失文件", async () => {
  await withProject(async (root) => {
    const result = runReview(root);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /rankup init/);
  });
});

test("报出缺失的必需与建议文件", async () => {
  await withProject(async (root) => {
    await seed(root, { "INDEX.md": "# index\n" });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.ok(report.missingRequired.includes("PROJECT.md"));
    assert.ok(report.missingRecommended.includes("roadmap.md"));
    assert.ok(!report.missingRequired.includes("INDEX.md"));
  });
});

test("超过阈值未更新的记录被标为陈旧", async () => {
  await withProject(async (root) => {
    const rankupDir = await seed(root, { "plan.md": "# plan\n", "INDEX.md": "# index\n" });
    const old = new Date(Date.now() - 90 * 86_400_000);
    await utimes(path.join(rankupDir, "plan.md"), old, old);

    const report = JSON.parse(runReview(root, ["--json", "--days", "30"]).stdout);
    const stalePlan = report.stale.find((item) => item.file === "plan.md");
    assert.ok(stalePlan, "plan.md 应被判为陈旧");
    assert.ok(stalePlan.days >= 89);
    assert.ok(!report.stale.some((item) => item.file === "INDEX.md"));
  });
});

test("脚本缺已验证日期或写死具体值时被点名", async () => {
  await withProject(async (root) => {
    await seed(root, {
      "scripts/good.mjs": "// 导出 GSC 查询表\n// 已验证:2026-08-02\nprocess.argv.slice(2);\n",
      "scripts/bad.mjs": "// 导出某个固定站点的数据\nconst property = 'fixed-value';\n",
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    const good = report.scripts.find((item) => item.name === "good.mjs");
    const bad = report.scripts.find((item) => item.name === "bad.mjs");
    assert.equal(good.hasVerifiedDate, true);
    assert.equal(good.parameterized, true);
    // 没有已验证日期就无从判断脚本是否还能跑;写死具体值等于没有复用价值。
    assert.equal(bad.hasVerifiedDate, false);
    assert.equal(bad.parameterized, false);
  });
});

test("经验库重复条目与候选回流条目被分别识别", async () => {
  await withProject(async (root) => {
    await seed(root, {
      "experience.md": [
        "- **[2026-08-01] LCP 图被 lazy 拖死**:通用机制说明。",
        "- LCP 图被 lazy 拖死。\n  适用：首屏加载。",
        "- **[2026-08-02] 本站首页转化**:example.com 实测 3%。",
      ].join("\n\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.equal(report.experience.total, 3);
    assert.equal(report.experience.duplicates.length, 1);
    // 提到具体域名的条目属于项目侧,不该被建议回流到要开源的 Skill。
    assert.equal(report.experience.promotionCandidates.length, 2);
    assert.ok(report.experience.promotionCandidates.every((item) => !item.includes("本站首页转化")));
  });
});

test("非法 --days 直接报错而不是静默取默认值", async () => {
  await withProject(async (root) => {
    const result = runReview(root, ["--days", "0"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--days/);
  });
});

test("用 ## 分条的经验库被判为格式异常,而不是静默报 0 条", async () => {
  await withProject(async (root) => {
    // 这是本协议里最容易发生的静默失效:切分器认 `- **[日期] 标题**`,
    // 用 `## 标题` 分条会读出 0 条,于是重复检测与回流候选长期空转,
    // 而报告看起来完全正常。实测有过一个 12 条的库被静默报成 0 条。
    await seed(root, {
      "experience.md": ["# 经验", "", "## 一条结论", "", "正文。", "", "## 又一条", "", "正文。"].join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.equal(report.experience.total, 0);
    assert.equal(report.experience.malformed, true);
    assert.match(runReview(root).stdout, /格式异常/);
  });
});

test("空的经验库不报格式异常", async () => {
  await withProject(async (root) => {
    await seed(root, { "experience.md": "# 本项目可复用经验\n\n还没有条目。\n" });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.equal(report.experience.total, 0);
    assert.equal(report.experience.malformed, false);
  });
});

// 接入看板逐行核对:回归 discipline.md 十 / checklists.md 段 5「批 B 清单逐行有状态」/
// references/lifecycle/stage-5-launch.md 段 5「批 B 平台清单」三处判据曾经对不上执行链路的那次事故——
// integrations.md 文件存在且体积够,但 Ahrefs Site Audit 从未单独成行、Yandex 整行缺失,
// 旧版 review.mjs 只判"文件在不在"看不出这种缺口。

const FULL_INTEGRATIONS_TABLE = [
  "| 类别 | 平台 | 状态 | 证据 / 原因 | 日期 |",
  "|---|---|---|---|---|",
  "| 托管方分析 | Cloudflare Web Analytics | ✅ | site tag `abc123`，数据流状态条显示正在接收 | 2026-09-10 |",
  "| 产品分析 | GA4 | ✅ | property `G-XXXX1` | 2026-09-10 |",
  "| 行为分析 | Microsoft Clarity | ✅ | project id `clarity-1` | 2026-09-10 |",
  "| 索引推送 | IndexNow | ✅ | 密钥文件校验通过，推送 12 条 HTTP 200 | 2026-09-11 |",
  "| 搜索平台 | Google Search Console | ✅ | 网域资源已验证，sitemap 已提交 | 2026-09-11 |",
  "| 搜索平台 | Bing Webmaster | ✅ | sitemap 提交状态成功 | 2026-09-11 |",
  "| 搜索平台 | Yandex Webmaster | ✅ | HTML meta 验证通过 | 2026-09-11 |",
  "| 搜索平台 | Naver Search Advisor | ✅ | HTML meta 验证通过 | 2026-09-11 |",
  "| 外链视角 | Ahrefs Webmaster Tools（Ahrefs WA） | ✅ | 项目 id 12345678 | 2026-09-12 |",
  "| 站点体检 | Ahrefs Site Audit | ✅ | 抓取已完成，0 严重问题 | 2026-09-12 |",
  "| 邮箱 | Cloudflare Email Routing hello@ | ✅ | 转发规则已建，测试邮件已收到 | 2026-09-12 |",
  "| 受众忠诚度 | Preferred Sources 引导按钮 | ✅ | 引导组件已上线 | 2026-09-12 |",
  "| 兜底 | 其他能带流量的平台 | ❌ | 目标市场仅英语，裁决为不需要额外引擎 | 2026-09-12 |",
].join("\n");

test("批 A/批 B 齐全且逐行有证据时不报接入缺口", async () => {
  await withProject(async (root) => {
    await seed(root, {
      "infrastructure.md": "zone: example-good.com 已定稿域名，Cloudflare 托管，2026-09-01 绑定生效\n",
      "integrations.md": FULL_INTEGRATIONS_TABLE,
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.deepEqual(report.lifecycle.integrationGaps, []);
    assert.equal(report.lifecycle.domainFinalized, true);
  });
});

test("缺 Yandex 整行、Ahrefs Site Audit 仍是 ⬜ 时报出这两条缺口", async () => {
  await withProject(async (root) => {
    const rows = FULL_INTEGRATIONS_TABLE.split("\n").filter(
      (line) => !line.includes("Yandex Webmaster"),
    );
    const withBlankSiteAudit = rows.map((line) =>
      line.includes("Ahrefs Site Audit")
        ? "| 站点体检 | Ahrefs Site Audit | ⬜ | | |"
        : line,
    );
    await seed(root, {
      "infrastructure.md": "zone: example-bad.com 已定稿域名，Cloudflare 托管\n",
      "integrations.md": withBlankSiteAudit.join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    const ids = report.lifecycle.integrationGaps.map((gap) => gap.id).sort();
    assert.deepEqual(ids, ["ahrefs-site-audit", "yandex"]);
    const siteAudit = report.lifecycle.integrationGaps.find((gap) => gap.id === "ahrefs-site-audit");
    assert.equal(siteAudit.issue, "blank-status");
    const yandex = report.lifecycle.integrationGaps.find((gap) => gap.id === "yandex");
    assert.equal(yandex.issue, "missing-row");
    assert.match(runReview(root).stdout, /Ahrefs Site Audit/);
  });
});

test("标 ✅ 但证据列是空的被判为弱证据，不是通过", async () => {
  await withProject(async (root) => {
    await seed(root, {
      "infrastructure.md": "zone: example-weak.com 已定稿域名\n",
      "integrations.md": [
        "| 类别 | 平台 | 状态 | 证据 / 原因 | 日期 |",
        "|---|---|---|---|---|",
        "| 托管方分析 | Cloudflare Web Analytics | ✅ | | |",
      ].join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    const gap = report.lifecycle.integrationGaps.find((g) => g.id === "cf-web-analytics");
    assert.ok(gap, "空证据的 ✅ 应该被报出来");
    assert.equal(gap.issue, "weak-evidence");
  });
});

// 回归:一个早已上线、域名早已定稿的项目从来没建过 infrastructure.md(旧版
// domainFinalized 只看这一个文件,于是批 B 整段被静默跳过、零报警)。
// integrations.md 里出现的正式域名本身就应该足以判定域名已定稿。
test("没有 infrastructure.md 但 integrations.md 出现正式域名时，批 B 仍被检查", async () => {
  await withProject(async (root) => {
    const rows = FULL_INTEGRATIONS_TABLE.split("\n").filter(
      (line) => !line.includes("Yandex Webmaster"),
    );
    await seed(root, {
      "integrations.md": [
        "站点：https://example-live.com",
        ...rows,
      ].join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.equal(report.lifecycle.domainFinalized, true);
    assert.ok(
      report.lifecycle.domainFinalizedSignals.some((s) => s.includes("example-live.com")),
      "判据里应该点名找到的那个域名",
    );
    const ids = report.lifecycle.integrationGaps.map((gap) => gap.id);
    assert.ok(ids.includes("yandex"), "批 B 的 Yandex 缺口应该被查出来,而不是因为没有 infrastructure.md 就跳过整批");
  });
});

// ⏸/❌ 行必须写清楚卡点/裁决依据——discipline.md 十明确要求，只打占位符
// 等于没写，跟完全空着一样查不出下一步该做什么。
test("❌ 行说明列是空的或只有占位符时报 missing-reason", async () => {
  await withProject(async (root) => {
    const rows = FULL_INTEGRATIONS_TABLE.split("\n").map((line) =>
      line.includes("其他能带流量的平台")
        ? "| 兜底 | 其他能带流量的平台 | ❌ | | |"
        : line,
    );
    await seed(root, {
      "infrastructure.md": "zone: example-reason.com 已定稿域名，Cloudflare 托管\n",
      "integrations.md": rows.join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    const gap = report.lifecycle.integrationGaps.find((g) => g.id === "fallback-platform");
    assert.ok(gap, "❌ 且说明为空应该被报出来");
    assert.equal(gap.issue, "missing-reason");
  });
});

test("⏸ 行说明列只有占位符（-/待定/TBD）时报 missing-reason，不是空字符串才算", async () => {
  await withProject(async (root) => {
    for (const placeholder of ["-", "待定", "TBD"]) {
      const rows = FULL_INTEGRATIONS_TABLE.split("\n").map((line) =>
        line.includes("Ahrefs Site Audit")
          ? `| 站点体检 | Ahrefs Site Audit | ⏸ | ${placeholder} | |`
          : line,
      );
      await seed(root, {
        "infrastructure.md": "zone: example-pause.com 已定稿域名，Cloudflare 托管\n",
        "integrations.md": rows.join("\n"),
      });
      const report = JSON.parse(runReview(root, ["--json"]).stdout);
      const gap = report.lifecycle.integrationGaps.find((g) => g.id === "ahrefs-site-audit");
      assert.ok(gap, `占位符 "${placeholder}" 应该被判定为没写清楚卡点`);
      assert.equal(gap.issue, "missing-reason");
    }
  });
});

test("⏸/❌ 行写了真实的卡点/裁决依据时不报 missing-reason", async () => {
  await withProject(async (root) => {
    const rows = FULL_INTEGRATIONS_TABLE.split("\n").map((line) =>
      line.includes("Ahrefs Site Audit")
        ? "| 站点体检 | Ahrefs Site Audit | ⏸ | 抓取任务排队中，预计次日出结果 | 2026-09-12 |"
        : line,
    );
    await seed(root, {
      "infrastructure.md": "zone: example-real-reason.com 已定稿域名，Cloudflare 托管\n",
      "integrations.md": rows.join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    const gap = report.lifecycle.integrationGaps.find((g) => g.id === "ahrefs-site-audit");
    assert.equal(gap, undefined, "写了真实卡点说明不该被报缺口");
  });
});

test("域名未定稿（没有 infrastructure.md）时批 B 不报错，只查批 A", async () => {
  await withProject(async (root) => {
    await seed(root, {
      "integrations.md": [
        "| 类别 | 平台 | 状态 | 证据 / 原因 | 日期 |",
        "|---|---|---|---|---|",
        "| 托管方分析 | Cloudflare Web Analytics | ✅ | site tag abc | 2026-09-01 |",
        "| 产品分析 | GA4 | ⬜ | | |",
        "| 行为分析 | Microsoft Clarity | ✅ | project id clarity-1 | 2026-09-01 |",
      ].join("\n"),
    });
    const report = JSON.parse(runReview(root, ["--json"]).stdout);
    assert.equal(report.lifecycle.domainFinalized, false);
    const ids = report.lifecycle.integrationGaps.map((gap) => gap.id);
    assert.deepEqual(ids, ["ga4"]);
    assert.ok(!ids.includes("yandex") && !ids.includes("ahrefs-site-audit"));
  });
});
