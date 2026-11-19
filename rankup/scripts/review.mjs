#!/usr/bin/env node
// 项目记忆体检:把 `rankup review` 里可机械判定的部分压成脚本,人只处理需要判断的部分。
//
//   node scripts/review.mjs --project-root <项目目录> [--days 30] [--json]
//
// 只读,不修改任何文件。输出缺口清单交给 review 流程去补。
// 报告分五块:缺失文件、陈旧记录、脚本体检、生命周期检查点、经验库信号。
//
// ── 覆盖范围边界（2026-09-13 独立验收澄清）──────────────────────────
// 本文件 checkIntegrationRows() 逐行核对的只是 discipline.md 十「接入看板」
// 表格里的账号/平台接入行(Cloudflare Web Analytics、GA4、GSC、Yandex 这类需要
// 在第三方后台开账号/拿到验证凭据的平台)。同一张表里 favicon/manifest、
// SEO 元素(title/description/OG)、JSON-LD、is-agentic、hreflang 这些代码级
// 行,不需要账号、靠代码/页面本身满足,不在 REQUIRED_INTEGRATION_PLATFORMS
// 之列——它们由段 4 上线前闸门(references/lifecycle/stage-4-prelaunch.md 段 4 C 节「上线前闸门」0–6 + 4b)
// 覆盖检查,不是本脚本的漏检,是职责分工。

import { experienceEntry } from "./maintain/memory-lint.mjs";
import { readdir, readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REQUIRED = ["INDEX.md", "PROJECT.md", "plan.md", "decisions.md"];
const RECOMMENDED = ["roadmap.md", "iterations.md", "experience.md", "baseline.md", "rejected.md"];

// 生命周期检查点：review 不仅看文件有没有，还看关键环节有没有走过。
// 已上线的站缺这些 = 应该做但没做；新引入 Skill 的老站靠这张表查漏补缺。
const LIFECYCLE_CHECKS = [
  // -- 通用基础（任何阶段都适用）--
  {
    id: "keywords",
    name: "关键词规划",
    group: "基础",
    evidence: "keywords.md",
    minBytes: 50,
    fix: "加载官方 gefei-keywords Skill，用 keyword_difficulty 查询目标市场",
    tool: "官方 gefei-keywords",
    why: "SEO 的基底——目标词定了，密度/排名/进度才有锚点",
  },
  {
    id: "roadmap",
    name: "路线图",
    group: "基础",
    evidence: "roadmap.md",
    minBytes: 50,
    fix: "写 .rankup/roadmap.md：阶段目标与放弃条件",
    tool: null,
    why: "阶段目标不写下来就会漂移，放弃条件不写就永远不会放弃",
  },
  // -- 上线后（项目有部署/域名/扫描记录时才检查）--
  {
    id: "agentic",
    name: "AI Agent 就绪度基线",
    group: "上线后",
    evidence: "agentic/",
    checkDir: true,
    fix: "node <rankup>/scripts/is-agentic.mjs scan <domain> --save",
    tool: "is-agentic.mjs",
    why: "AI 代理能否发现和使用站点——零配置可跑，有基线才能量化后续改进",
  },
  {
    id: "audit",
    name: "技术审计（段 4 上线前闸门 8 行：0–6 + 4b）",
    group: "上线后",
    evidence: "audit.md",
    minBytes: 500,
    fix: "执行 references/lifecycle/stage-4-prelaunch.md 段 4 C 节「上线前闸门」0–6 + 4b 逐行留证据",
    tool: "is-agentic.mjs + 官方 gefei-page onpage_audit/page_coach",
    why: "站点身份/SEO/TDK/密度/GEO/哥飞审阅/性能——逐项要证据",
  },
  {
    id: "baseline",
    name: "性能与流量基线",
    group: "上线后",
    evidence: "baseline.md",
    minBytes: 200,
    // Lighthouse 只给实验室数据,闸门 6 要的是实验室+现场两套(seo-box.md 一)。
    // 单跑 Lighthouse 会让这条闸门只过一半而表面是绿的。
    fix: "node <rankup>/scripts/pagespeed.mjs plan <三类页面 URL> --strategy both 出链接，再读 pagespeed.web.dev 记进 baseline.md",
    tool: "pagespeed.mjs",
    why: "没有基线的「优化」只是猜测——改了不知道改了多少",
  },
  {
    id: "integrations",
    name: "平台接入记录",
    group: "上线后",
    evidence: "integrations.md",
    minBytes: 100,
    fix: "node <rankup>/scripts/cf-analytics-setup.mjs status <domain>",
    tool: "cf-analytics-setup.mjs",
    why: "数据越早接越值钱——历史数据晚接一天永久少一天",
  },
  {
    id: "indexnow",
    name: "索引推送（IndexNow）",
    group: "上线后",
    evidence: "integrations.md",
    // 按内容判定而不是按体积:integrations.md 记着一堆别的平台时体积早就够了,
    // 而"IndexNow 到底接没接"仍然是未知。体积检查在这里会给出一个假的绿灯。
    mustContain: ["IndexNow", "indexnow"],
    fix: "node <rankup>/scripts/indexnow-submit.mjs --generate-key，然后按 search-platforms.md 接",
    tool: "indexnow-submit.mjs",
    why: "唯一一个零账号的索引通道——一个密钥文件就是全部凭据，没有理由不接",
  },
  {
    id: "sitemap-submitted",
    name: "两边站长工具的 sitemap 已提交",
    group: "上线后",
    evidence: "integrations.md",
    mustContain: ["sitemap"],
    fix: "node <rankup>/scripts/webmaster-sitemap.mjs <gsc|bing> submit …，结果记进 integrations.md",
    tool: "webmaster-sitemap.mjs",
    why: "资源验证通过 ≠ sitemap 已提交，这两件事经常只做了前一件",
  },
  {
    id: "infrastructure",
    name: "基础设施记录",
    group: "上线后",
    evidence: "infrastructure.md",
    minBytes: 50,
    fix: "记录域名/zone/NS/部署配置到 infrastructure.md",
    tool: null,
    why: "部署验证的事实源——缺了就不知道该在哪个环境核对",
  },
  {
    id: "iterations",
    name: "迭代记录",
    group: "上线后",
    evidence: "iterations.md",
    minBytes: 1,
    fix: "每轮优化后记录假设、改动、结果到 iterations.md",
    tool: null,
    why: "失败轮次不写清被证伪的假设，下次会重走弯路",
  },
  {
    id: "experiments",
    name: "优化实验记录",
    group: "上线后",
    evidence: "experiments.md",
    minBytes: 1,
    fix: "node <rankup>/scripts/is-agentic.mjs diff <domain> + pagespeed.mjs plan --strategy both 后重读网页版",
    tool: "is-agentic.mjs diff",
    why: "进步或倒退要用对比数字说话，不能只断言「应该更好了」",
  },
];

// 批 A / 批 B 必需平台的逐行检查：判据来自 discipline.md 十「完整清单」、
// checklists.md 段 5「批 B 清单逐行有状态」、references/lifecycle/stage-5-launch.md 段 5「批 B 平台清单」——
// 三处口径一致，这里只是把它断言成脚本，不是又开一份新判据。
// 上面 LIFECYCLE_CHECKS 里的 "integrations" 只判"文件在不在、够不够大"；
// 曾经出现过文件存在、体积也够，但整整两个必需平台（Ahrefs Site Audit、Yandex）
// 从未单独成行的情况——那种缺口只有把表格逐行摊开才看得见。
// 别名做宽松匹配（大小写不敏感、常见简称/长写法），因为项目侧抄录这张清单时
// 措辞不会跟本文件的中文平台名逐字一致。
const REQUIRED_INTEGRATION_PLATFORMS = [
  { id: "cf-web-analytics", batch: "A", name: "Cloudflare Web Analytics", aliases: ["cloudflare web analytics", "cf web analytics", "cf wa"] },
  { id: "ga4", batch: "A", name: "GA4", aliases: ["ga4", "google analytics"] },
  { id: "clarity", batch: "A", name: "Microsoft Clarity", aliases: ["microsoft clarity", "clarity"] },
  { id: "indexnow", batch: "B", name: "IndexNow", aliases: ["indexnow"] },
  { id: "gsc", batch: "B", name: "Google Search Console", aliases: ["google search console", "gsc"] },
  { id: "bing", batch: "B", name: "Bing Webmaster", aliases: ["bing webmaster", "bing"] },
  { id: "yandex", batch: "B", name: "Yandex Webmaster", aliases: ["yandex webmaster", "yandex"] },
  { id: "naver", batch: "B", name: "Naver Search Advisor", aliases: ["naver search advisor", "naver"] },
  {
    id: "ahrefs-wa",
    batch: "B",
    name: "Ahrefs Webmaster Tools（Ahrefs WA）",
    aliases: ["ahrefs webmaster tools", "ahrefs web analytics", "ahrefs wa", "ahrefs site explorer", "ahrefs awt"],
  },
  { id: "ahrefs-site-audit", batch: "B", name: "Ahrefs Site Audit", aliases: ["ahrefs site audit"] },
  { id: "email-routing", batch: "B", name: "Cloudflare Email Routing hello@", aliases: ["email routing", "hello@"] },
  { id: "preferred-sources", batch: "B", name: "Preferred Sources 引导按钮", aliases: ["preferred sources", "preferred source"] },
  { id: "fallback-platform", batch: "B", name: "兜底：其他能带流量的平台", aliases: ["兜底"], matchWholeRow: true },
];

const STATUS_GLYPHS = ["✅", "⬜", "❌", "⏸"];

// integrations.md 是项目自己写的 markdown 表格，列顺序不保证一致——
// 先找表头把"平台/状态/证据"列的下标定位出来，找不到表头就退化成整行做宽松匹配。
function parseIntegrationsTable(text) {
  let headerCells = null;
  const rows = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
    if (cells.length === 0) continue;
    if (cells.every((cell) => /^:?-{2,}:?$/.test(cell))) continue; // |---|---| 分隔行
    if (headerCells === null && cells.some((cell) => cell.includes("平台"))) {
      headerCells = cells;
      continue;
    }
    rows.push(cells);
  }
  return { headerCells, rows };
}

function findColumnIndex(headerCells, keyword) {
  if (!headerCells) return -1;
  return headerCells.findIndex((cell) => cell.includes(keyword));
}

// 单个平台在弱证据判定里,"-"/"—"/"无"/"n/a"/"待定"/"TBD" 这类占位符视同空,
// 不算真的留了证据或写清楚了裁决依据/卡点。
function looksLikeEmptyEvidence(text) {
  return !text || /^[\s\-—–无]*$|^n\/?a$|^tbd$|^待定$/i.test(text.trim());
}

function checkIntegrationRows(text) {
  const { headerCells, rows } = parseIntegrationsTable(text);
  const platformIdx = findColumnIndex(headerCells, "平台");
  const statusIdx = findColumnIndex(headerCells, "状态");
  const evidenceIdx = findColumnIndex(headerCells, "证据");

  const gaps = [];
  for (const platform of REQUIRED_INTEGRATION_PLATFORMS) {
    const matchRow = rows.find((cells) => {
      // "兜底"这一行的"平台"列内容按目标市场变化（日本填 Yahoo! JAPAN、韩国填 Daum……），
      // 不是固定平台名，所以它按整行匹配"兜底"这个类别词，其余平台仍只认平台列。
      const haystack = (
        platform.matchWholeRow || platformIdx < 0 ? cells.join(" ") : (cells[platformIdx] ?? "")
      ).toLowerCase();
      return platform.aliases.some((alias) => haystack.includes(alias));
    });

    if (!matchRow) {
      gaps.push({
        id: platform.id,
        batch: platform.batch,
        name: platform.name,
        issue: "missing-row",
        detail: "看板里没有这一行（对照 discipline.md 十，逐行独立，不许合并或省略）",
      });
      continue;
    }

    const statusCell = statusIdx >= 0 ? (matchRow[statusIdx] ?? "") : matchRow.join(" ");
    const glyph = STATUS_GLYPHS.find((candidate) => statusCell.includes(candidate));

    if (!glyph || glyph === "⬜") {
      gaps.push({
        id: platform.id,
        batch: platform.batch,
        name: platform.name,
        issue: "blank-status",
        detail: "状态是 ⬜（待做）或没有可识别的状态标记，还不能算已核实",
      });
      continue;
    }

    if (glyph === "✅") {
      const evidenceCell = evidenceIdx >= 0 ? (matchRow[evidenceIdx] ?? "") : "";
      const inlineEvidence = statusCell.replace(glyph, "").trim();
      const evidence = evidenceCell || inlineEvidence;
      if (looksLikeEmptyEvidence(evidence)) {
        gaps.push({
          id: platform.id,
          batch: platform.batch,
          name: platform.name,
          issue: "weak-evidence",
          detail: "标了 ✅ 但证据列是空的，不采信勾",
        });
      }
    }

    // ⏸(卡点)/❌(裁决不接入)同样必须写清楚原因——discipline.md 十要求「❌ 并写
    // 裁决依据」「⏸ 写卡点」，只打个占位符（"-"/"待定"/"TBD"）等于没写,
    // 跟完全空着一样查不出下一步该做什么，也无法区分"暂时卡住"和"想不起来了"。
    if (glyph === "⏸" || glyph === "❌") {
      const evidenceCell = evidenceIdx >= 0 ? (matchRow[evidenceIdx] ?? "") : "";
      const inlineReason = statusCell.replace(glyph, "").trim();
      const reason = evidenceCell || inlineReason;
      if (looksLikeEmptyEvidence(reason)) {
        gaps.push({
          id: platform.id,
          batch: platform.batch,
          name: platform.name,
          issue: "missing-reason",
          detail: `标了 ${glyph} 但说明/证据列是空的或只有占位符（如"-"/"待定"/"TBD"），未写清楚${glyph === "❌" ? "裁决依据" : "卡点"}`,
        });
      }
    }
  }
  return gaps;
}

function parseArgs(argv) {
  const options = { projectRoot: process.cwd(), days: 30, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--project-root") options.projectRoot = argv[++index] ?? options.projectRoot;
    else if (arg === "--days") options.days = Number(argv[++index]);
    else if (arg === "--json") options.json = true;
    else if (arg === "-h" || arg === "--help") {
      // 显式 `--help` 是成功，不是用法错误——批处理里 set -e 会把非零码当脚本坏了。
      console.log("用法: review.mjs [--project-root <路径>] [--days <n>] [--json]");
      process.exit(0);
    }
    else throw new TypeError(`未知参数: ${arg}`);
  }
  if (!Number.isFinite(options.days) || options.days <= 0) {
    throw new TypeError("--days 必须是正数");
  }
  return options;
}

async function exists(target) {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function ageInDays(file, now) {
  try {
    return Math.floor((now - (await stat(file)).mtimeMs) / 86_400_000);
  } catch {
    return null;
  }
}

async function fileBytes(filepath) {
  try {
    return (await stat(filepath)).size;
  } catch {
    return 0;
  }
}

// 域名定稿的判据不能只看 infrastructure.md 存不存在——实测有过一个早已上线、
// 域名定稿多时的项目从来没建过 infrastructure.md，于是批 B 逐行核对整段被跳过，
// 零报警地漏查了搜索平台/Ahrefs WA 等一整批接入。改成多信号 OR：
// infrastructure.md 有内容，或 integrations.md/checks.md 里出现非 example 的正式
// 域名/https URL，或项目代码/配置里 SITE_URL 是非占位域名，或 wrangler 配置里有
// routes/custom_domain——任一命中都说明域名已经不是「待定项」了。
const PLACEHOLDER_HOST_RE = /\b(example\.(com|org|net)|yourdomain\.[a-z]+|localhost|127\.0\.0\.1|workers\.dev)\b/i;
const DOMAIN_SCAN_EXCLUDE_DIRS = new Set([
  "node_modules",
  ".git",
  ".wrangler",
  "dist",
  "build",
  ".output",
  ".turbo",
  ".rankup",
]);
const DOMAIN_SCAN_FILE_RE = /\.(mjs|js|jsx|ts|tsx|json|jsonc|toml|env|env\.example)$/i;
const DOMAIN_SCAN_MAX_FILES = 3000;
const DOMAIN_SCAN_MAX_DEPTH = 6;

// 找 integrations.md / checks.md 里出现的非占位真实域名(https:// 开头,排除 example.*)。
async function findRealDomainIn(rankupDir, filename) {
  let text;
  try {
    text = await readFile(path.join(rankupDir, filename), "utf8");
  } catch {
    return null;
  }
  const matches = text.match(/https?:\/\/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}[^\s|)\]"'>]*/gi) || [];
  const real = matches.find((url) => !PLACEHOLDER_HOST_RE.test(url));
  return real ?? null;
}

// 有界的项目文件扫描:找 SITE_URL 的非占位赋值,以及 wrangler 配置里的 routes/custom_domain。
// 深度与文件数都设了上限——这是一次「有没有信号」的扫描,不是完整索引,大仓库不该被拖慢。
async function scanProjectForDomainSignals(projectRoot) {
  const signals = { siteUrl: null, wranglerRoute: null };
  let scanned = 0;

  async function walk(dir, depth) {
    if (depth > DOMAIN_SCAN_MAX_DEPTH || scanned >= DOMAIN_SCAN_MAX_FILES) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanned >= DOMAIN_SCAN_MAX_FILES) return;
      if (entry.name.startsWith(".") && entry.name !== ".env") continue;
      if (entry.isDirectory()) {
        if (DOMAIN_SCAN_EXCLUDE_DIRS.has(entry.name)) continue;
        await walk(path.join(dir, entry.name), depth + 1);
        continue;
      }
      if (!DOMAIN_SCAN_FILE_RE.test(entry.name) && entry.name !== "wrangler.jsonc" && entry.name !== "wrangler.toml") {
        continue;
      }
      scanned += 1;
      let text;
      try {
        text = await readFile(path.join(dir, entry.name), "utf8");
      } catch {
        continue;
      }
      if (!signals.siteUrl) {
        const m = text.match(/SITE_URL\s*[:=]\s*["'`](https?:\/\/[^"'`]+)["'`]/);
        if (m && !PLACEHOLDER_HOST_RE.test(m[1])) signals.siteUrl = m[1];
      }
      if (!signals.wranglerRoute && /wrangler\.(jsonc|toml)$/i.test(entry.name)) {
        if (/"routes"\s*:\s*\[\s*[^\]]*\S/.test(text) || /\broutes\s*=/.test(text)) {
          signals.wranglerRoute = "routes";
        } else if (/custom_domain\s*[:=]\s*true/i.test(text)) {
          signals.wranglerRoute = "custom_domain";
        }
      }
    }
  }

  await walk(projectRoot, 0);
  return signals;
}

async function detectDomainFinalized(rankupDir, projectRoot) {
  const signals = [];

  const infraBytes = await fileBytes(path.join(rankupDir, "infrastructure.md"));
  if (infraBytes >= 50) signals.push(`infrastructure.md 有内容（${infraBytes} 字节）`);

  const fromIntegrations = await findRealDomainIn(rankupDir, "integrations.md");
  if (fromIntegrations) signals.push(`integrations.md 出现正式域名 ${fromIntegrations}`);

  const fromChecks = await findRealDomainIn(rankupDir, "checks.md");
  if (fromChecks) signals.push(`checks.md 出现正式域名 ${fromChecks}`);

  if (projectRoot) {
    const projectSignals = await scanProjectForDomainSignals(projectRoot);
    if (projectSignals.siteUrl) signals.push(`项目配置 SITE_URL=${projectSignals.siteUrl}`);
    if (projectSignals.wranglerRoute) {
      signals.push(`wrangler 配置含 ${projectSignals.wranglerRoute}`);
    }
  }

  return { domainFinalized: signals.length > 0, signals };
}

async function checkLifecycle(rankupDir, projectRoot) {
  // 上线与否这里**猜不准，也不假装准**：只看有没有 infrastructure/integrations/agentic
  // 三个证据之一，据此决定要不要把「上线后」那组检查点纳进来。报告里会写明这是推断。
  const looksLive =
    (await fileBytes(path.join(rankupDir, "infrastructure.md"))) > 0 ||
    (await fileBytes(path.join(rankupDir, "integrations.md"))) > 0 ||
    (await exists(path.join(rankupDir, "agentic")));

  const results = [];
  for (const check of LIFECYCLE_CHECKS) {
    if (check.group === "上线后" && !looksLive) continue;

    let done = false;
    if (check.checkDir) {
      // 检查目录下是否有域名子目录且含 JSON 快照
      const dir = path.join(rankupDir, check.evidence);
      if (await exists(dir)) {
        try {
          const entries = await readdir(dir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const files = await readdir(path.join(dir, entry.name));
            if (files.some((f) => f.endsWith(".json"))) {
              done = true;
              break;
            }
          }
        } catch {
          /* ignore */
        }
      }
    } else if (check.mustContain) {
      // 内容检查:文件在、体积够,不代表这一项真的做了。
      try {
        const text = await readFile(path.join(rankupDir, check.evidence), "utf8");
        done = check.mustContain.some((needle) => text.includes(needle));
      } catch {
        done = false;
      }
    } else {
      const size = await fileBytes(path.join(rankupDir, check.evidence));
      done = size >= (check.minBytes ?? 1);
    }
    results.push({ ...check, done });
  }

  // 批 B（域名相关的接入）只在项目已经定稿域名时才要求——判断方式仿照上面 looksLive
  // 的做法：不猜"是不是上线了"，而是多信号 OR 判定（见 detectDomainFinalized 的注释），
  // 全部落空才说明域名还没定稿，批 B 逐行检查在这个阶段全部跳过、不报错。
  const { domainFinalized, signals: domainFinalizedSignals } = await detectDomainFinalized(
    rankupDir,
    projectRoot,
  );

  let integrationGaps = [];
  if (looksLive) {
    try {
      const integrationsText = await readFile(path.join(rankupDir, "integrations.md"), "utf8");
      integrationGaps = checkIntegrationRows(integrationsText).filter(
        (gap) => gap.batch === "A" || domainFinalized,
      );
    } catch {
      // integrations.md 读不到:上面的 "integrations" 文件级检查已经会报这个缺口,
      // 这里不重复报,避免同一件事在报告里出现两次。
      integrationGaps = [];
    }
  }

  return { checks: results, looksLive, domainFinalized, domainFinalizedSignals, integrationGaps };
}

// 记录是否落后于代码:有提交而记忆没动,就是漂移信号。滞后指标不能当进度依据。
async function commitsSince(projectRoot, since) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", projectRoot, "log", "--oneline", `--since=${since}`],
      { maxBuffer: 4 * 1024 * 1024 },
    );
    return stdout.trim() ? stdout.trim().split("\n").length : 0;
  } catch {
    return null;
  }
}

function splitEntries(text) {
  return text
    .split(new RegExp(`(?=${experienceEntry.source})`, "m"))
    .filter((block) => new RegExp(experienceEntry.source).test(block))
    .map((block) => block.trim());
}

function headline(entry) {
  return (entry.match(/^- \*\*\[[^\]]+\]\s*([^*]+)/) ?? [, entry.split(/(?:[。；][ \t]*|\n[ \t]{2,})适用[：:]/u, 1)[0].slice(2)])[1].trim().replace(/[。；]$/, "");
}

async function reviewProject(projectRoot, days) {
  const now = Date.now();
  const rankupDir = path.join(projectRoot, ".rankup");
  const report = {
    projectRoot,
    hasRankup: await exists(rankupDir),
    missingRequired: [],
    missingRecommended: [],
    stale: [],
    scripts: [],
    experience: { total: 0, malformed: false, duplicates: [], promotionCandidates: [] },
    lifecycle: { checks: [], looksLive: false },
    commitsSince: null,
  };
  if (!report.hasRankup) return report;

  for (const file of REQUIRED) {
    if (!(await exists(path.join(rankupDir, file)))) report.missingRequired.push(file);
  }
  for (const file of RECOMMENDED) {
    if (!(await exists(path.join(rankupDir, file)))) report.missingRecommended.push(file);
  }

  for (const file of [...REQUIRED, ...RECOMMENDED]) {
    const age = await ageInDays(path.join(rankupDir, file), now);
    if (age !== null && age > days) report.stale.push({ file, days: age });
  }
  report.stale.sort((a, b) => b.days - a.days);

  const scriptsDir = path.join(rankupDir, "scripts");
  if (await exists(scriptsDir)) {
    for (const entry of await readdir(scriptsDir, { withFileTypes: true })) {
      if (!entry.isFile() || entry.name.startsWith(".")) continue;
      const file = path.join(scriptsDir, entry.name);
      const text = await readFile(file, "utf8");
      const head = text.split("\n").slice(0, 20).join("\n");
      report.scripts.push({
        name: entry.name,
        // 脚本会因页面改版而腐坏,所以头部必须留"已验证"日期;没有就无从判断新鲜度。
        hasVerifiedDate: /已验证|verified/i.test(head),
        // 写死具体值的脚本换个站/换个词就得改,等于没有复用价值。
        parameterized: /process\.argv|argparse|sys\.argv|getopts/.test(text),
        days: await ageInDays(file, now),
      });
    }
    report.scripts.sort((a, b) => a.name.localeCompare(b.name));
  }

  const experiencePath = path.join(rankupDir, "experience.md");
  if (await exists(experiencePath)) {
    const raw = await readFile(experiencePath, "utf8");
    const entries = splitEntries(raw);
    report.experience.total = entries.length;

    // 文件里明明有内容却一条都切不出来 = 格式不对(多半是用 `## 标题` 分的条),
    // 而不是「还没积累经验」。不报出来的话重复检测与回流候选会长期空转,
    // 报告却完全正常——实测有过一个 12 条的库被静默报成 0 条。
    // 判据取「有 `##` 分条却切不出条目」为主,纯长度阈值为辅——
    // 只用长度会漏掉短条目的库(标题行被剔掉后正文可能不足两百字)。
    const hasHeadingSections = /^##\s+\S/m.test(raw);
    const bodyLength = raw.replace(/^#.*$/gm, "").trim().length;
    if (entries.length === 0 && (hasHeadingSections || bodyLength > 200)) {
      report.experience.malformed = true;
    }

    const seen = new Map();
    for (const entry of entries) {
      const key = headline(entry).slice(0, 24);
      if (!key) continue;
      if (seen.has(key)) report.experience.duplicates.push(key);
      else seen.set(key, true);
    }

    // 既不提本站域名、也不含本站专属数字的条目,很可能是通用规则,值得考虑回流 Skill。
    const projectName = path.basename(projectRoot).toLowerCase();
    for (const entry of entries) {
      const lower = entry.toLowerCase();
      const mentionsSite =
        lower.includes(projectName) || /https?:\/\/|\b[a-z0-9-]+\.(com|store|guide|support|io|dev)\b/.test(lower);
      if (!mentionsSite) report.experience.promotionCandidates.push(headline(entry).slice(0, 60));
    }
  }

  report.lifecycle = await checkLifecycle(rankupDir, projectRoot);
  report.commitsSince = await commitsSince(projectRoot, `${days} days ago`);
  return report;
}

function renderText(report, days) {
  const lines = [`# .rankup 体检 — ${report.projectRoot}`, ""];
  if (!report.hasRankup) {
    lines.push("未找到 `.rankup/`。先运行 `rankup init` 初始化项目记忆。", "");
    return lines.join("\n");
  }

  lines.push("## 缺失文件", "");
  if (report.missingRequired.length === 0 && report.missingRecommended.length === 0) {
    lines.push("无。", "");
  } else {
    for (const file of report.missingRequired) lines.push(`- 必需：\`${file}\``);
    for (const file of report.missingRecommended) lines.push(`- 建议：\`${file}\``);
    lines.push("");
  }

  lines.push(`## 超过 ${days} 天未更新`, "");
  if (report.stale.length === 0) {
    lines.push("无。", "");
  } else {
    for (const item of report.stale) lines.push(`- \`${item.file}\` — ${item.days} 天`);
    if (report.commitsSince !== null && report.commitsSince > 0) {
      lines.push(
        "",
        `同期仓库有 ${report.commitsSince} 个提交：记录已落后于代码，进度以 git、路由与 sitemap 为准。`,
      );
    }
    lines.push("");
  }

  lines.push("## 脚本体检", "");
  if (report.scripts.length === 0) {
    lines.push("尚无可复用脚本。会做第二次的操作，第一次跑通就该固化到 `.rankup/scripts/`。", "");
  } else {
    lines.push("| 脚本 | 已验证日期 | 参数化 | 距上次改动 |", "|---|---|---|---|");
    for (const script of report.scripts) {
      lines.push(
        `| \`${script.name}\` | ${script.hasVerifiedDate ? "有" : "**缺**"} | ${script.parameterized ? "是" : "**否**"} | ${script.days ?? "?"} 天 |`,
      );
    }
    lines.push("");
  }

  // 生命周期检查点
  const { checks: lcChecks, looksLive, integrationGaps, domainFinalized, domainFinalizedSignals } =
    report.lifecycle;
  if (lcChecks.length > 0) {
    const missing = lcChecks.filter((c) => !c.done);
    const passed = lcChecks.filter((c) => c.done);

    lines.push(
      // looksLive 是从「有没有 infrastructure/integrations/agentic 证据」推出来的**猜测**，
      // 不是观测到的上线状态，所以标出它是怎么推的。
      `## 生命周期检查点${looksLive ? "（按 infrastructure/integrations/agentic 的存在推断为已上线，上线后那组检查点因此纳入）" : ""}`,
      "",
    );

    // 措辞刻意保守：`done` 测的是**证据文件在不在、够不够大、含不含指定字样**，
    // 不是「这一项真的做了」。文件在而内容是占位符、或者做了但没记下来，
    // 在这里长得一模一样——所以只说「有/没有证据文件」，做没做由读的人判。
    if (missing.length === 0) {
      lines.push("✓ 每个检查点都找到了对应的证据文件（文件在 ≠ 这一项真的做完了，还得打开看）。", "");
    } else {
      lines.push(
        `${lcChecks.length} 个检查点里 ${passed.length} 个找到了证据文件，${missing.length} 个没找到：`,
        "",
      );

      // 按 group 分组显示缺失项
      const groups = new Map();
      for (const check of missing) {
        const g = groups.get(check.group) ?? [];
        g.push(check);
        groups.set(check.group, g);
      }

      for (const [group, items] of groups) {
        lines.push(`### ${group}`, "");
        lines.push(
          "| 检查项 | 修复命令 | 为什么需要 |",
          "|---|---|---|",
        );
        for (const item of items) {
          const fixCmd = item.fix.replace(/</g, "\\<").replace(/>/g, "\\>");
          lines.push(
            `| ${item.name} | \`${fixCmd}\` | ${item.why} |`,
          );
        }
        lines.push("");
      }
    }

    if (passed.length > 0) {
      lines.push("已完成：" + passed.map((c) => c.name).join("、"), "");
    }
  }

  // 接入看板逐行核对：上面的 "integrations" 检查点只看文件在不在、够不够大，
  // 这里把批 A/批 B 每个必需平台摊开逐行判——行缺失、状态还是 ⬜、
  // 或者标了 ✅ 但证据列是空的，三类缺口分开报。
  if (looksLive) {
    lines.push(
      `## 接入看板逐行核对（批 A${domainFinalized ? " + 批 B" : "，批 B 待域名定稿后再查"}）`,
      "",
    );
    if (domainFinalized) {
      lines.push(`域名定稿判据：${domainFinalizedSignals.join("；")}`, "");
    }
    if (integrationGaps.length === 0) {
      lines.push(
        "✓ 批 A" +
          (domainFinalized ? "/批 B" : "") +
          " 必需平台逐行核对无缺口（行都在、状态非 ⬜、✅ 都有证据——文件层面而言；线上是否真的接了仍需 `rankup review` 实测）。",
        "",
      );
    } else {
      lines.push("| 平台 | 批次 | 缺口 |", "|---|---|---|");
      for (const gap of integrationGaps) {
        lines.push(`| ${gap.name} | 批 ${gap.batch} | ${gap.detail} |`);
      }
      lines.push("");
    }
  }

  lines.push("## 经验库信号", "");
  lines.push(`- 条目总数：${report.experience.total}`);
  if (report.experience.malformed) {
    lines.push(
      "- **格式异常**：文件有内容但一条都切不出来。条目使用 `- 规则。适用：条件` 格式,",
      "  用 `## 标题` 分条会让本脚本读出 0 条,重复检测与回流候选因此全部空转。",
    );
  }
  if (report.experience.duplicates.length > 0) {
    lines.push(`- 疑似重复（应合并）：${report.experience.duplicates.join("、")}`);
  }
  if (report.experience.promotionCandidates.length > 0) {
    lines.push(`- 候选回流 Skill（未提及本站，疑为通用规则）：${report.experience.promotionCandidates.length} 条`);
    for (const candidate of report.experience.promotionCandidates.slice(0, 10)) {
      lines.push(`  - ${candidate}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const report = await reviewProject(path.resolve(options.projectRoot), options.days);
process.stdout.write(
  options.json ? `${JSON.stringify(report, null, 2)}\n` : renderText(report, options.days),
);
