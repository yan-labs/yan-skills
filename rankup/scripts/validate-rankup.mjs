#!/usr/bin/env node
// 用法：node scripts/validate-rankup.mjs（只读、本地校验）。
// 动态中立扫描：RANKUP_PROJECT_ROOTS 为按系统路径分隔符分隔的项目父目录列表；
// 未配置 ~/.rankup/config.json 时也可仅用该环境变量，扫描其下真实项目目录名。
// RANKUP_PROJECT_NAME_EXCLUDES 为逗号分隔的通用目录名排除表，例如 docs,scripts；
// 仅从动态候选词中排除这些目录名，不豁免文件，也不排除真实项目名。

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";
import { resolveRoots } from "./registry.mjs";
import { lint as lintDocs } from "./maintain/doc-lint.mjs";

const execFileAsync = promisify(execFile);

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedVersion = "3.38.13";
const requiredReferences = [
  "integrations/kie.md",
  "integrations/kie-models.md",
  "registry.md",
  "discipline.md",
  "monetization.md",
  "playbooks/research.md",
  "playbooks/site-review.md",
  "checklists.md",
  "lifecycle.md",
  "lifecycle/stage-1-research.md",
  "lifecycle/stage-2-positioning.md",
  "lifecycle/stage-3-build.md",
  "lifecycle/stage-4-prelaunch.md",
  "lifecycle/stage-5-launch.md",
  "lifecycle/stage-6-backlinks.md",
  "lifecycle/stage-7-monetize.md",
  "maintenance.md",
  "playbooks/entry.md",
  "cloudflare-stack.md",
  "project-memory.md",
  "integrations.md",
  "seo-growth.md",
  "seo-serp.md",
  "seo-data-channels.md",
  "seo-opportunity.md",
  "seo-ai-search.md",
  "seo-agentic-scan.md",
  "seo-geo.md",
  "seo-ssr.md",
  "seo-workflow.md",
  "seo-experiences.md",
  "seo-experiences-2026-07.md",
  "evolution.md",
  "trends.md",
  "search-platforms.md",
  "game-sites.md",
  "experiences/INDEX.md",
  "experiences/webcafe-experiences.md",
  "experiences/demand-discovery.md",
  "experiences/zero-to-one.md",
  "experiences/conversion.md",
];

const requiredContent = {
  "references/seo-webcafe.md": ["gefei-keywords", "gefei-competitor", "gefei-domain", "gefei-page", "knowledge_ask", "disable-model-invocation"],
  "references/seo-geo.md": ["GEO 反推测试", "推荐位竞争分析", "证据边界", "内页测试"],
  "SKILL.md": [
    "npx skills add yan-labs/yan-skills --skill rankup -g -y",
    "npx skills update rankup -g -y",
    ".rankup/skill-state.json",
    "严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥",
    "## 可复用操作必须落成脚本",
    "三方对账门禁",
    "沉淀义务与是否调用本 Skill 无关",
    "本 Skill 必须保持项目中立与机器中立",
    "## 跨项目资产登记表",
    "### `rankup init`",
    "### `rankup review`",
    "## 哥飞官方 Skill",
    "disable-model-invocation",
    "scripts/sessions.mjs",
    "scripts/indexnow-submit.mjs",
    "scripts/webmaster-sitemap.mjs",
    "scripts/rankup-cli.mjs",
    "npx @yan-labs/rankup audit similarweb",
    "断言绝不能被 git 追踪",
    "--new-only",
    "review-state.json",
    "## 经验库：规划与迭代之前先翻一遍",
    "## 主线：维护 checklist，使用 checklist",
    "### `rankup check`",
    "references/checklists.md",
    "品牌图标在开发当天做齐",
    "图标专项未通过不许上线",
    "上线前与发布后复核入口",
    "references/design-references.md#多功能工具站侧栏统一规范",
    "npx skills add yan-labs/yan-skills --skill cf-cli -g -y",
    "## 强制流程（先读这张表，再做任何事）",
    "### `rankup doctor`",
    "scripts/maintain/rankup-doctor.mjs",
    "ref-scan.mjs",
    "SEO/GEO 是主要手段，不是适用边界",
  ],
  "references/maintenance.md": [
    "## 一、什么时候必须走本章",
    "## 二、收尾维护：五步，顺序固定",
    "## 三、可检查判据（清理）",
    "## 四、决策与结论类文档怎么维护",
    "## 五、维护 Skill 源码（rankup 本身）",
    "## 六、`/rankup doctor`：整理 `.rankup/` 的显式入口",
    "scripts/maintain/ref-scan.mjs",
    "不能丢的东西",
    "## 七、经验分层与回流：四层归属（唯一判定表）",
    "RANKUP_HOME",
    "upstream-candidates.md",
  ],
  "references/playbooks/entry.md": [
    "① Google 趋势与量（必须同框 `gpts` 基线）",
    "不算减分",
    "需求信号与难度信号分开记，不互相抵消",
    "待验证的机会假设",
  ],
  "references/trends.md": [
    "### gpts 基线判读：到底怎么才算「有搜索量」（唯一判据源）",
    "【经验·起步阈值】",
  ],
  "references/demand-sources.md": ["## App 市场证据与原生分发", "macOS 直销另开一行", "评分数不是安装数"],
  "references/playbooks/research.md": ["## App 市场验证分支", "不能单独否决 App 市场"],
  // 2026-09-30 lifecycle.md 按七段拆分，原断言随内容迁到对应段文件，一条未删。
  "references/lifecycle/stage-3-build.md": [
    "cloudflare-stack.md#89-循环消耗与账单熔断红线",
    "清除 React / Vite / TanStack 脚手架默认图标",
    "域名与索引开关共享构建期配置",
    "合法 JSON 不等于 Schema 语义合法",
    "https://validator.schema.org/",
    "grid → row → gridcell",
  ],
  "references/lifecycle/stage-4-prelaunch.md": [
    "Cloudflare 循环消耗红线未通过",
    "SSR HTML 与浏览器水合后 DOM",
    "逐个 GET 并解码实际图片",
    "Googlebot-Image",
    "技术检查通过不等于 Google 搜索结果已更新",
    "包含 sitemap 外页面",
  ],
  "references/checklists.md": [
    "Cloudflare 循环消耗红线",
    "共享预算副作用前原子预留",
    "D15 · 品牌图标当天做齐",
    "图标专项（上线前必过）",
    "正式域名图标回读",
    "production 开与 preview 关两条构建回归",
    "robots meta 恰好一条",
    "不能以 JSON.parse 成功代替",
    "属性 domain / 继承关系",
    "grid → row → gridcell",
    "内链图与可索引路由清单对账无遗漏",
    "HTML Accept 原始响应与真实浏览器分别核验",
    "实际远端上报证据",
    "API 开关关闭不等于 HTML 无注入",
    "性能优化后仍须通过相关回归",
    "**多功能工具站侧栏模式**",
    "design-references.md#多功能工具站侧栏统一规范",
  ],
  "references/design-references.md": [
    "### 多功能工具站侧栏统一规范",
    "实施并经用户确认的统一规范",
    "不再增加重复的全局 Home / All tools 菜单",
    "PanelLeftClose / PanelLeftOpen",
    "仅 SidebarContent 滚动",
    "首页 → 工具页 → 首页",
  ],
  "references/experiences/INDEX.md": [
    "## 收录规则（强制）",
    "### 证据等级标记",
    "三层归属",
  ],
  "references/discipline.md": [
    "### 测试身份与登录通路",
    "已有测试身份就直接用，不向用户重复索要",
    "缺登录通道不等于缺输入",
    "只动该账号自己拥有的测试空间与测试页面",
    "不购买、不升级套餐、不绕过产品权益限制",
  ],
  "references/project-memory.md": [
    "测试身份：位置/取 token 命令",
    "## 沉淀义务",
    "## 可复用操作脚本",
    "## 三层归属",
    "roadmap.md",
    "iterations.md",
    "experience.md",
    "## 目录规范：常驻文件、保留什么、去哪里、多大",
  ],
  "references/playbooks/site-review.md": [
    "G6 循环与费用止损",
  ],
  "references/cloudflare-stack.md": [
    "## 8.9 循环消耗与账单熔断红线",
    "应用重新 `setAlarm()`",
    "预算告警不是消费硬顶",
    "持久化计数",
    "正常任务仍完成",
    "pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer",
    "npm i -g cf",
    "npx skills add yan-labs/yan-skills --skill cf-cli -g -y",
    "npx skills add cloudflare/skills --skill wrangler -g -y",
    "wrangler types",
  ],
  "references/integrations.md": [
    "npx skills add stripe/ai --skill stripe-best-practices -g -y",
    "npx skills add vercel-labs/skills --skill find-skills -g -y",
    "npx skills add yan-labs/yan-skills -g --all",
    "npx skills add yan-labs/yan-skills --skill backlink -g -y",
  ],
  "references/evolution.md": [
    "失败分类",
    "证据阶梯",
    "Maker–Checker",
    "通用规则晋升门",
    "no-promotion",
    "一个匹配源代码文本的门禁,只要把它保护的那一行注释掉就能通过",
    "风格门禁不能靠删掉实质内容来满足",
  ],
};

const secretPatterns = [
  ["Stripe secret key", /\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g],
  ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{8,}\b/g],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/g],
  [
    "private key",
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
  ],
  [
    "assigned bearer token",
    /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi,
  ],
];

// Skill 必须保持项目中立与机器中立:任何可归属到某个具体项目、账号或本机环境的内容
// 都属于 <project>/.rankup/,不进本 Skill。经验条目只保留"剥离站点后仍成立"的规则,
// 证据出处、流量数字、凭据位置一律留在项目侧。
// 名单里为什么是这些名字:它们是**已经泄漏过或最可能泄漏**的自有项目代号。
// 这不是「这些项目特殊」,而是黑名单只能拦住它认识的词——2026-08-21 发现
// `intabtools` / `toolpear` 有四处漏进 backlink/,根因就是它们不在这张表里。
// **新开一个项目时把它的代号加进来**,否则这个守卫对它等于不存在。
const projectLeakPatterns = [
  ["advertising publisher ID", /\b(?:ca-)?pub-\d{10,}\b/g],
  ["analytics account ID", /\b(?:UA-\d+-\d+|G-[A-Z0-9]{8,})\b/g],
  ["shared panel authorization/callback base", /\b(?:[a-z0-9-]+\.)*3ue\.co\b/gi],
  ["project identifier", /\b(?:bettercallsaul|birthstonemeaning|crystalhealing|sbti|intabtools|toolpear|shindan-lab|shindan|butterflydream|sgsz-alliance|xueer)\b/gi],
  ["absolute host path", /\/Users\/[A-Za-z0-9._-]+\//g],
  ["hardcoded local proxy", /\b127\.0\.0\.1:\d{2,5}\b/g],
  ["credential store location", /\.claude\.json\b/g],
];

// 上面这张静态清单本身已经是独立验收指出的问题:它只能拦住"已经写进去"的
// 代号,新开项目永远要靠人记得手工补一行,忘了补 = 这道防线对新项目形同虚设;
// 而"往这张要开源的表里继续手打真实项目代号"这个动作本身就是又一次泄漏,
// 不该是长期做法。因此**不再往这张静态表里追加新项目名**,新项目改走运行时
// 补充:复用 registry.mjs 里"扫描根目录从哪来"的同一份逻辑(`resolveRoots`——
// RANKUP_PROJECT_ROOTS 环境变量,或 `~/.rankup/config.json` 的 `projectRoots`),
// 把这些根目录下的子目录名当额外泄露词。这份配置只存在于本机、从不进 Skill
// 仓库;CI 环境和全新安装都没有这个文件,`resolveRoots` 返回空数组,本函数
// 安静地不产出任何额外模式——不改变 CI 现有行为,也不会在没配置的机器上报错。
async function buildDynamicProjectLeakPatterns() {
  let roots;
  try {
    roots = await resolveRoots([]);
  } catch {
    return [];
  }
  if (!roots.length) return [];

  const excludedNames = new Set((process.env.RANKUP_PROJECT_NAME_EXCLUDES || "")
    .split(",").map((name) => name.trim()).filter(Boolean));
  const names = new Set();
  for (const root of roots) {
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch {
      continue; // 根目录不存在或不可读——本机配置漂移了,安静跳过,不阻断校验
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".") || entry.name === "node_modules" || excludedNames.has(entry.name)) continue;
      names.add(entry.name);
    }
  }
  if (!names.size) return [];

  const escaped = [...names].map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return [
    [
      "project identifier (scanned from RANKUP_PROJECT_ROOTS/config.json)",
      new RegExp(`\\b(?:${escaped.join("|")})\\b`, "gi"),
    ],
  ];
}

// 这两个文件按职责必须包含上述模式的字面量(守卫本体与它的负向测试夹具),
// 扫描时排除,否则守卫永远自我告警。除此之外任何文件都不得豁免。
const leakScanExcludes = new Set([
  "scripts/validate-rankup.mjs",
  "tests/validate-rankup.test.mjs",
  // 跨项目登记表按定义就含项目名与绝对路径。豁免它参与项目中立扫描是安全的,
  // 但**唯一**的依据是下面 assertRegistryUntracked 证明它绝不会进 git;
  // 那条断言若被删掉,这一行豁免立刻变成一个泄漏口子。
  "registry.md",
  // `.env` 按定义就是真实令牌本身。豁免它参与扫描的**唯一**依据同样是
  // assertRegistryUntracked 证明它绝不进 git。
  ".env",
]);

// .gitignore 只是约定,一个 `git add -f` 就能绕过。把"绝不被追踪"变成断言。
// 非 git 环境(已安装副本)下无从判断,跳过而不是误报。
//
// 两个文件走同一条防线,但泄漏的是不同东西:
//   registry.md — 项目名与绝对路径
//   .env        — 第三方工具账号的真实令牌(SKILL.md「令牌统一放 .env」那一节)
// 后者一旦提交,令牌就进了公开仓库的历史,改密码都追不回来。
const MUST_STAY_UNTRACKED = [
  {
    file: "registry.md",
    why: "它含项目名与绝对路径",
  },
  {
    file: ".env",
    why: "它含第三方工具账号的真实令牌",
  },
];

async function assertRegistryUntracked(errors) {
  try {
    await execFileAsync("git", ["-C", skillRoot, "rev-parse", "--git-dir"]);
  } catch {
    return;
  }
  for (const { file, why } of MUST_STAY_UNTRACKED) {
    const { stdout } = await execFileAsync("git", [
      "-C",
      skillRoot,
      "ls-files",
      "--",
      file,
    ]);
    if (stdout.trim().length > 0) {
      errors.push(
        `${file} 已被 git 追踪 — ${why},绝不能提交;` +
          `执行 git rm --cached rankup/${file} 并确认 rankup/.gitignore 生效`,
      );
    }
  }
}

async function read(relativePath) {
  return readFile(path.join(skillRoot, relativePath), "utf8");
}

async function collectTextFiles(directory = skillRoot) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      // `.rankup/` 是项目侧证据目录(脚本以 Skill 目录为 cwd 试跑时会落在这里),
      // 被 .gitignore 排除、不随 Skill 分发;它里面天然带本机路径,不该让发布门禁挂掉。
      if (entry.name === ".rankup" || entry.name === "node_modules" || entry.name === ".git") continue;
      files.push(...(await collectTextFiles(absolutePath)));
    } else if (/\.(?:md|json|mjs|sh)$/.test(entry.name)) {
      files.push(absolutePath);
    }
  }
  return files;
}

async function validate() {
  const errors = [];
  let manifest;
  let skillMarkdown = "";

  try {
    manifest = JSON.parse(await read("skill.json"));
  } catch (error) {
    errors.push(`skill.json is not valid JSON: ${error.message}`);
  }

  try {
    skillMarkdown = await read("SKILL.md");
  } catch (error) {
    errors.push(`SKILL.md cannot be read: ${error.message}`);
  }

  const frontmatterVersion = skillMarkdown.match(
    /^---[\s\S]*?^metadata:\s*\n(?: {2}.+\n)*? {2}version:\s*["']?([^"'\n]+)["']?\s*$/m,
  )?.[1];

  if (manifest?.version !== expectedVersion) {
    errors.push(
      `skill.json version must be ${expectedVersion}, found ${manifest?.version ?? "missing"}`,
    );
  }
  if (frontmatterVersion !== expectedVersion) {
    errors.push(
      `SKILL.md metadata.version must be ${expectedVersion}, found ${frontmatterVersion ?? "missing"}`,
    );
  }

  try {
    const repositoryReadme = await readFile(path.join(skillRoot, "..", "README.md"), "utf8");
    if (repositoryReadme.startsWith("# yan-skills") && !repositoryReadme.includes(`版本 \`${expectedVersion}\``)) {
      errors.push(`README.md version must be ${expectedVersion}`);
    }
  } catch {}

  for (const reference of requiredReferences) {
    try {
      await read(path.join("references", reference));
    } catch {
      errors.push(`missing reference: references/${reference}`);
    }
    // 渐进式加载:允许经由 seo-growth.md 索引一跳可达,不必 SKILL.md 直链
    const indexMarkdown = await read("references/seo-growth.md").catch(() => "");
    if (
      !skillMarkdown.includes(`references/${reference}`) &&
      !(indexMarkdown.includes(reference) && skillMarkdown.includes("references/seo-growth.md"))
    ) {
      errors.push(`SKILL.md does not link references/${reference} (even via index)`);
    }
  }

  for (const [relativePath, snippets] of Object.entries(requiredContent)) {
    let text;
    try {
      text = await read(relativePath);
    } catch {
      errors.push(`missing required content file: ${relativePath}`);
      continue;
    }
    for (const snippet of snippets) {
      if (!text.includes(snippet)) {
        errors.push(`missing required content in ${relativePath}: ${snippet}`);
      }
    }
    if (relativePath === "references/checklists.md") {
      const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```[^\n]*$/gm, "");
      for (const [stage, label, bold = true] of [
        [3, "D15 · 品牌图标当天做齐"],
        [4, "图标专项（上线前必过）"],
        [5, "正式域名图标回读"],
        [3, "Cloudflare 循环消耗红线"],
        [3, "D1 · `SITE_URL` 构建期注入客户端"],
        [3, "D4 · 分析脚本延迟加载", false],
        [3, "D12 · JSON-LD 注入方式与类型选择已定", false],
        [3, "D13 · a11y 属性组件级核对", false],
        [4, "P3 · 独立 og + 内链闭环"],
        [5, "分析通道在采集", false],
        [5, "索引已放开并复核"],
      ]) {
        const row = `| ${bold ? `**${label}**` : label} |`;
        const section = prose.split(new RegExp(`^## 段 ${stage} ·`, "m"))[1]?.split(/^## /m)[0] ?? "";
        if (text.split(row).length !== 2 || !section.includes(`|\n${row}`)) {
          errors.push(`checklist gate must occur once as a table row in stage ${stage}: ${label}`);
        }
      }
    }
  }

  const linkedReferences = [
    ...skillMarkdown.matchAll(/\]\((references\/[^)#?]+\.md)\)/g),
  ].map((match) => match[1]);
  for (const linkedReference of new Set(linkedReferences)) {
    try {
      await read(linkedReference);
    } catch {
      errors.push(`broken local Markdown link in SKILL.md: ${linkedReference}`);
    }
  }

  const allFiles = await collectTextFiles();
  const contents = await Promise.all(
    allFiles.map(async (file) => ({
      file,
      text: await readFile(file, "utf8"),
    })),
  );
  const dynamicLeakPatterns = await buildDynamicProjectLeakPatterns();
  const allLeakPatterns = [...projectLeakPatterns, ...dynamicLeakPatterns];
  for (const { file, text } of contents) {
    const relativePath = path.relative(skillRoot, file);
    for (const [label, pattern] of secretPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(text)) {
        errors.push(`${label} pattern found in ${relativePath}`);
      }
    }
    if (leakScanExcludes.has(relativePath)) {
      continue;
    }
    for (const [label, pattern] of allLeakPatterns) {
      pattern.lastIndex = 0;
      const match = pattern.exec(text);
      if (match) {
        errors.push(
          `${label} "${match[0]}" found in ${relativePath} — 项目可归属内容属于 <project>/.rankup/,不进 Skill`,
        );
      }
    }
  }

  await assertRegistryUntracked(errors);

  for (const requiredFile of [
    "scripts/check-version.mjs",
    "scripts/registry.mjs",
    "scripts/review.mjs",
    "scripts/sessions.mjs",
    "scripts/demand/game-platform-monitor.mjs",
    "tests/check-version.test.mjs",
    "tests/registry.test.mjs",
    "tests/review.test.mjs",
    "tests/sessions.test.mjs",
    "tests/game-platform-monitor.test.mjs",
    "tests/eval-guard-source-match.test.mjs",
    "tests/eval-guard-style-vs-substance.test.mjs",
    "scripts/maintain/doc-lint.mjs",
    "scripts/maintain/ref-scan.mjs",
    "scripts/maintain/split-doc.mjs",
    "scripts/maintain/rankup-doctor.mjs",
  ]) {
    try {
      await read(requiredFile);
    } catch {
      errors.push(`missing required file: ${requiredFile}`);
    }
  }

  // 拆分、改名、改标题后，references 之间的相对链接与锚点会静默断掉；
  // 上面只查 SKILL.md 直链的文件存在，这里补上全量断链与断锚检查。
  // 用户全局层（$RANKUP_HOME，默认 ~/.rankup/）的内容只属于这个用户或这台机器，
  // Skill 目录里出现这几个文件就说明有人把个人层写进了要开源的 Skill。
  for (const { file } of contents) {
    const base = path.basename(file);
    if (["preferences.md", "lessons.md", "upstream-candidates.md"].includes(base)) {
      errors.push(`user-global layer file ${path.relative(skillRoot, file)} must live in $RANKUP_HOME, not in the Skill`);
    }
  }

  const docReport = await lintDocs({ root: skillRoot });
  for (const broken of docReport.broken) {
    errors.push(`broken Markdown link ${broken.where} → ${broken.target} (${broken.reason})`);
  }

  return errors;
}

const errors = await validate();
if (errors.length > 0) {
  for (const error of errors) {
    console.error(`ERROR: ${error}`);
  }
  process.exitCode = 1;
} else {
  console.log(`rankup ${expectedVersion} validation passed`);
}
