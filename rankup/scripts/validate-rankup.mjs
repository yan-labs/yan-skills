#!/usr/bin/env node

import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const expectedVersion = "2.60.1";
const requiredReferences = [
  "checklists.md",
  "lifecycle.md",
  "cloudflare-stack.md",
  "project-memory.md",
  "integrations.md",
  "seo-growth.md",
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
  ],
  "references/experiences/INDEX.md": [
    "## 收录规则（强制）",
    "### 证据等级标记",
    "三层归属",
  ],
  "references/project-memory.md": [
    "## 沉淀义务",
    "## 可复用操作脚本",
    "## 三层归属",
    "roadmap.md",
    "iterations.md",
    "experience.md",
  ],
  "references/cloudflare-stack.md": [
    "pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer",
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
  ["project identifier", /\b(?:bettercallsaul|birthstonemeaning|crystalhealing|sbti|intabtools|toolpear|shindan-lab|shindan|butterflydream|sgsz-alliance|xueer)\b/gi],
  ["absolute host path", /\/Users\/[A-Za-z0-9._-]+\//g],
  ["hardcoded local proxy", /\b127\.0\.0\.1:\d{2,5}\b/g],
  ["credential store location", /\.claude\.json\b/g],
];

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
      files.push(...(await collectTextFiles(absolutePath)));
    } else if (/\.(?:md|json|mjs)$/.test(entry.name)) {
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
    if (!skillMarkdown.includes(`references/${reference}`)) {
      errors.push(`SKILL.md does not link references/${reference}`);
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
    for (const [label, pattern] of projectLeakPatterns) {
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
  ]) {
    try {
      await read(requiredFile);
    } catch {
      errors.push(`missing required file: ${requiredFile}`);
    }
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
