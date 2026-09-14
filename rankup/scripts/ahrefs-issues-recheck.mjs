#!/usr/bin/env node
/**
 * ahrefs-issues-recheck.mjs —— 读取导出的 Ahrefs issues JSON，对受影响 URL
 * 做当前线上状态的复核，输出「仍存在 / 已不存在 / 需浏览器或 PSI 判」表。
 * 纯 HTTP（`fetch`），不驱动浏览器——这类判据（状态码、重定向目标、
 * meta description 长度、资源是否 404）本来就不需要登录态或渲染。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/ahrefs-issues-recheck.mjs <issues.json> [--json]
 *   node <rankup-skill-dir>/scripts/ahrefs-issues-recheck.mjs <issues.json> --sample 20
 *   node <rankup-skill-dir>/scripts/ahrefs-issues-recheck.mjs <issues.json> --min-description-length 70
 *
 * 输入格式（灵活读取，兼容多种字段命名）：
 *   一个 issue 对象，或 `{ issues: [...] }` 数组，每个 issue 至少要有
 *   `category`/`name`（用于判断该按哪条规则复核）与下列字段之一：
 *   `allCapturedUrls` / `exampleUrls` / `urls`（字符串数组），或 `rows`
 *   （`ahrefs-site-audit.mjs report ... data-explorer?...` 的原始行数组，
 *   每行是一个 cell 字符串数组，本脚本从每行里抠出第一个 URL）。
 *
 * ── 为什么需要这个脚本（真实项目复盘，2026-09-13）─────────────────
 *
 * Ahrefs Site Audit 报告常常滞后于最近部署：一个真实项目复核发现 11 类
 * 报出的问题里，7 类在抓取之后的一次大规模重构里已经被顺带修掉，逐条手工
 * 核实耗时且容易漏。Basic 的项目历史/报告页「新的抓取」已实测可手动重抓
 * （2026-09-14，入口区别见 `ahrefs-site-audit.mjs` 头部），但新抓取完成前，
 * 「报告说有问题」与「现在还有没有问题」之间必然存在时间差，需要一个独立
 * 的线上复核步骤，不能假设报告永远反映当前状态。
 *
 * ── 复核能力边界：诚实分类，不是每类问题都能靠单次 HTTP 判定 ─────────
 *
 * 按 issue 的 category/name 关键词分流到四类判据：
 *   1. **redirect-canonical**（协议/host/sitemap 重复类）：请求原始 URL，看
 *      是否仍直接 200（问题仍存在）还是已经 301 跳到规范 URL（已修复）。
 *   2. **meta-description**（元描述过长/过短）：抓最终页面，量 meta
 *      description 的字符长度，与 `--min-description-length`（默认 70，
 *      粗略近似值，不是 Ahrefs 的官方阈值）比较，仅供参考。
 *   3. **resource-status**（JS/资源 404、加载错误引用的资源）：直接请求该
 *      URL，报告当前状态码——**只回答"这个资源现在是不是 404"，不回答
 *      "有没有页面还在引用它"**，后者需要另外抓取引用它的页面才能确认。
 *   4. **not-checkable-via-http**（孤岛页面、内链数量、加载速度、AI 爬虫
 *      响应慢等）：**诚实标为「需要浏览器或 PSI 判」，不猜测结果**——内链
 *      计数需要全站爬取（`seo-audit.mjs`），速度类判据需要 PageSpeed
 *      （`pagespeed.mjs collect`），单次 HTTP 请求回答不了这些问题。
 *
 * 分类靠关键词匹配（中英文都有），不是穷举——遇到匹配不上任何规则的 issue，
 * 归入 `generic-http`，只报原始状态码/重定向链事实，不下修没修的结论。
 *
 * 已验证：2026-09-14，对已有报告各类问题运行 --sample 3 并人工比对。
 * 注意启发式局限：正常规范页 200 不能证明仍在多个 sitemap；该类必须核对
 * sitemap 集合与成员，不能直接采信 redirect-canonical 的 still-present。
 * 旧 hash 资源仍 404 也不代表当前页面仍引用它；资源判定与引用图分开核验。

 */
import { readFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

/* ── 纯函数：JSON 读取、分类、判定，可脱离网络单测 ─────────────── */

/** 从一行 data-explorer 的 cell 数组里抠第一个 URL（与 ahrefs-site-audit.mjs 的 extractRowUrl 同逻辑）。 */
function extractUrlFromCells(cells) {
  for (const c of cells || []) {
    const m = String(c || "").match(/https?:\/\/\S+/);
    if (m) return m[0];
  }
  return null;
}

/**
 * 灵活读取一份 issues 导出：接受单个 issue 对象，或 `{issues:[...]}`。
 * 每条 issue 的 URL 列表按优先级从 `allCapturedUrls` → `exampleUrls` →
 * `urls` → `rows`（逐行抠 URL）取第一个非空来源，不强求所有字段都存在。
 */
export function readIssuesFromExport(parsed) {
  const list = Array.isArray(parsed?.issues) ? parsed.issues : [parsed];
  return list.map((issue) => {
    const urls =
      issue.allCapturedUrls ||
      issue.exampleUrls ||
      issue.urls ||
      (Array.isArray(issue.rows) ? issue.rows.map(extractUrlFromCells).filter(Boolean) : []) ||
      [];
    return {
      category: issue.category || null,
      subcategory: issue.subcategory || null,
      name: issue.name || null,
      sourceRoute: issue.sourceRoute || issue.route || null,
      urls: [...new Set(urls)],
    };
  });
}

const KEYWORD_RULES = [
  {
    type: "redirect-canonical",
    re: /http\b|https\b|www\b|规范|canonical|重定向|sitemap|网站地图|协议/i,
  },
  { type: "meta-description", re: /meta description|元描述|description too/i },
  {
    type: "resource-status",
    re: /javascript|js 错误|js error|404|错误|error/i,
  },
  {
    type: "not-checkable-via-http",
    re: /孤岛|内链|dofollow|island|isolated|inbound link|slow|缓慢|响应|response time|crawler/i,
  },
];

/**
 * 按 category/subcategory/name 拼起来的文本关键词匹配，判定这条 issue 该走
 * 哪条复核规则。**规则顺序即优先级**——先匹配 redirect-canonical 是因为
 * 真实项目里"仅一个 dofollow 内链，不可索引"这类问题本质常常是重定向缺失
 * 而不是内链数量问题（不可索引 + 变体 host 同时出现时优先按重定向判）；
 * 都不命中归为 generic-http，只报事实不下结论。
 */
export function classifyIssueCheckType(issue) {
  const text = [issue?.category, issue?.subcategory, issue?.name].filter(Boolean).join(" ");
  for (const rule of KEYWORD_RULES) {
    if (rule.re.test(text)) return rule.type;
  }
  return "generic-http";
}

/**
 * 判定一条"协议/host 重复"类 issue 的某个 URL 现状：仍直接 200（问题仍存在）、
 * 已单跳 301 到规范 URL（已修复）、还是其它情况（人工看 facts）。
 * 纯函数：接收已经取到的事实（不发请求）。
 */
export function judgeRedirectCanonical({ initialStatus, hops }) {
  if (initialStatus >= 200 && initialStatus < 300) {
    return { verdict: "still-present", reason: `直接返回 ${initialStatus}，未跳转到规范 URL` };
  }
  if (initialStatus >= 300 && initialStatus < 400) {
    if (hops === 1) return { verdict: "resolved", reason: "单跳 301/302 到规范 URL" };
    return { verdict: "unknown", reason: `跳转了 ${hops} 跳，不是预期的单跳——人工核对是否有多余的中间跳转` };
  }
  return { verdict: "unknown", reason: `状态码 ${initialStatus}，不属于已知的 2xx/3xx 情形` };
}

/** meta description 长度判定，阈值是粗略近似值，不是 Ahrefs 官方口径。 */
export function judgeMetaDescriptionLength(length, minLength) {
  if (length === null) return { verdict: "unknown", reason: "页面上没找到 meta description" };
  if (length < minLength) return { verdict: "still-present", reason: `长度 ${length} 字符，仍短于阈值 ${minLength}` };
  return { verdict: "resolved", reason: `长度 ${length} 字符，达到阈值 ${minLength}` };
}

/** 资源状态判定：只回答"现在是不是 404"，不回答"有没有页面还在引用它"。 */
export function judgeResourceStatus(status) {
  if (status === 404) {
    return {
      verdict: "unknown",
      reason: "资源现在确实 404——若这就是问题描述的现象则可能仍在被引用；若问题是"
        + "旧资源已废弃，本身返回 404 是预期行为。需要另外检查引用它的页面。",
    };
  }
  if (status >= 200 && status < 300) return { verdict: "resolved", reason: `资源现在返回 ${status}，可正常加载` };
  return { verdict: "unknown", reason: `状态码 ${status}` };
}

/* ── 网络部分：不纯，用真实 fetch ─────────────────────────────── */

async function checkRedirect(url, { maxHops = 5, timeoutMs = 10000 } = {}) {
  let current = url;
  let hops = 0;
  let initialStatus = null;
  for (let i = 0; i < maxHops; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res;
    try {
      res = await fetch(current, { method: "GET", redirect: "manual", signal: controller.signal });
    } catch (e) {
      clearTimeout(timer);
      return { initialStatus: initialStatus ?? null, finalUrl: current, finalStatus: null, hops, error: String(e?.message || e) };
    }
    clearTimeout(timer);
    if (initialStatus === null) initialStatus = res.status;
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      hops += 1;
      current = new URL(res.headers.get("location"), current).toString();
      continue;
    }
    return { initialStatus, finalUrl: current, finalStatus: res.status, hops };
  }
  return { initialStatus, finalUrl: current, finalStatus: null, hops, error: "超过最大跳转次数" };
}

async function fetchMetaDescriptionLength(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal });
    const html = await res.text();
    const m = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
    return m ? m[1].length : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchResourceStatus(url, { timeoutMs = 10000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { redirect: "follow", signal: controller.signal, method: "GET" });
    return res.status;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 有界并发跑一批异步任务，避免对目标站发起过多并发请求。 */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function recheckUrl(url, checkType, opts) {
  if (checkType === "redirect-canonical") {
    const r = await checkRedirect(url);
    const judged = r.error ? { verdict: "unknown", reason: r.error } : judgeRedirectCanonical(r);
    return { url, checkType, ...r, ...judged };
  }
  if (checkType === "meta-description") {
    const length = await fetchMetaDescriptionLength(url);
    const judged = judgeMetaDescriptionLength(length, opts.minDescriptionLength);
    return { url, checkType, length, ...judged };
  }
  if (checkType === "resource-status") {
    const status = await fetchResourceStatus(url);
    const judged = status === null ? { verdict: "unknown", reason: "请求失败" } : judgeResourceStatus(status);
    return { url, checkType, status, ...judged };
  }
  if (checkType === "not-checkable-via-http") {
    return {
      url,
      checkType,
      verdict: "needs-browser-or-psi",
      reason: "内链计数需要全站爬取（seo-audit.mjs），速度类判据需要 PageSpeed（pagespeed.mjs collect）——单次 HTTP 请求回答不了",
    };
  }
  // generic-http：只报事实，不下结论。
  const r = await checkRedirect(url);
  return { url, checkType: "generic-http", ...r, verdict: "unknown", reason: "未识别的 issue 类型，只报状态码/跳转事实" };
}

/* ── CLI ──────────────────────────────────────────────────────── */

function usage() {
  console.log(`用法:
  node ahrefs-issues-recheck.mjs <issues.json> [--json]
  node ahrefs-issues-recheck.mjs <issues.json> --sample <n>
  node ahrefs-issues-recheck.mjs <issues.json> --min-description-length <n> [--concurrency <n>]`);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") {
    usage();
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const file = argv[0];
  let json = false;
  let sample = null;
  let minDescriptionLength = 70;
  let concurrency = 5;
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") { json = true; continue; }
    if (a === "--sample" && argv[i + 1]) { sample = Number(argv[++i]); continue; }
    if (a === "--min-description-length" && argv[i + 1]) { minDescriptionLength = Number(argv[++i]); continue; }
    if (a === "--concurrency" && argv[i + 1]) { concurrency = Number(argv[++i]); continue; }
    if (a === "-h" || a === "--help") { usage(); process.exit(0); }
    console.error(`未知参数: ${a}`);
    usage();
    process.exit(1);
  }

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`读取/解析 ${file} 失败：${e.message}`);
    process.exit(1);
  }

  const issues = readIssuesFromExport(parsed);
  const report = [];
  for (const issue of issues) {
    const checkType = classifyIssueCheckType(issue);
    const urls = sample ? issue.urls.slice(0, sample) : issue.urls;
    const results = await mapWithConcurrency(urls, concurrency, (u) =>
      recheckUrl(u, checkType, { minDescriptionLength }),
    );
    const counts = { resolved: 0, "still-present": 0, unknown: 0, "needs-browser-or-psi": 0 };
    for (const r of results) counts[r.verdict] = (counts[r.verdict] || 0) + 1;
    report.push({
      category: issue.category,
      subcategory: issue.subcategory,
      name: issue.name,
      checkType,
      totalUrls: issue.urls.length,
      checkedUrls: urls.length,
      counts,
      results,
    });
  }

  if (json) {
    console.log(JSON.stringify({ file, issues: report }, null, 2));
    return;
  }
  for (const r of report) {
    console.log(`\n=== ${[r.category, r.subcategory, r.name].filter(Boolean).join(" / ") || "(未命名 issue)"} ===`);
    console.log(`判据类型: ${r.checkType}  已检查 ${r.checkedUrls}/${r.totalUrls} 个 URL`);
    console.log(
      `已不存在: ${r.counts.resolved}  仍存在: ${r.counts["still-present"]}  ` +
        `需浏览器或PSI判: ${r.counts["needs-browser-or-psi"]}  不确定: ${r.counts.unknown}`,
    );
    for (const one of r.results.slice(0, 10)) {
      console.log(`  [${one.verdict}] ${one.url} — ${one.reason || ""}`);
    }
    if (r.results.length > 10) console.log(`  …其余 ${r.results.length - 10} 条见 --json 输出`);
  }
}

// argv[1] 保留调用时写的路径，import.meta.url 已经过符号链接解析——两边取真实路径
// 再比较，同 check-version.mjs 的 invokedAsScript()。让测试可以只 import 上面的
// 纯函数而不触发真的网络请求。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false;
  try {
    const resolved = await realpath(resolve(process.argv[1]));
    return pathToFileURL(resolved).href === import.meta.url;
  } catch {
    return false;
  }
}

if (await invokedAsScript()) {
  await main();
}
