#!/usr/bin/env node
/**
 * ahrefs-site-audit.mjs —— 读取 Ahrefs Site Audit 已有的抓取结果，
 * 驱动用户已登录的浏览器。与 ahrefs-setup.mjs 互补：那个负责建项目和验证，这个负责取数。
 *
 * 状态：2026-09-14 已验证已知报告路由保留 ?current= 指定抓取日期；未知路由/外域仍拒绝。
 * 双证人化改造 2026-08-30（截图链路已实盘验证）。
 * 失败分支不再只留一句结论文案：退出前把「截图 + 页面文本 + manifest(stopReason)」
 * 落进 `.rankup/evidence/ahrefs-site-audit-<ts>/`，会话关闭发生在取证**之后**；
 * `--keep-session` 可以连现场标签页一起留下。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/ahrefs-site-audit.mjs projects [--json]
 *   node <rankup-skill-dir>/scripts/ahrefs-site-audit.mjs report <项目|域名片段> <报告> [--json] [--out f]
 *   node <rankup-skill-dir>/scripts/ahrefs-site-audit.mjs schedule <项目ID> [--json]
 *   node <rankup-skill-dir>/scripts/ahrefs-site-audit.mjs routes
 *
 * 标志：
 *   --session <名>   opencli 会话名。**默认固定 `ahrefs-nav`，不要传**——理由见下。
 *   --wait <毫秒>    报告渲染等待上限，默认 20000。不再硬睡这么久：页内轮询到
 *                    「正文长度 > 阈值且连续两拍不变」就提前返回，这个值只是封顶。
 *   --retries <n>    `open` 步骤遇到瞬时性错误（见下「间歇性 Navigation rejected」）
 *                     时的重试次数，默认 2（即最多尝试 3 次）。
 *   --max-pages <n>  `report <id> data-explorer?...` 页大小固定 50 且无翻页/无限
 *                     滚动时，换排序重新抓取合并去重的最多尝试次数，默认 5（见下）。
 *   --keep-session   完成后不关闭（失败时想留现场标签页也用它）
 *
 * ── 间歇性 "Navigation rejected"（2026-09-13 实测确认为瞬时性）─────
 *
 * `projects` 等导航偶发报 `Navigation rejected`，从现场日志看是浏览器扩展/CDP
 * 层面的瞬时拒绝，不是页面真的打不开——原样重跑一次往往就好（分诊阶梯第 1 层）。
 * 之前脚本对此直接 bail，把偶发问题升级成任务失败；现在 `open` 步骤命中
 * `isTransientOpenError` 判定为瞬时错误时，内建自动重试（`--retries`，默认 2 次，
 * 间隔 2 秒），仍然失败才 bail 并把最后一次的错误原样报出。
 *
 * ── data-explorer 页大小固定 50、无翻页（2026-09-13 实测确认）─────
 *
 * **穷举验证过三条路都不通**：(1) DOM 里没有任何"下一页"/页码控件（按钮、链接
 * 逐个枚举过，wrapper 容器里零交互元素）；(2) 真实 CDP 滚轮事件 + 程序化设置
 * `scrollTop` 都不会让虚拟化表格加载更多行（表格本身就只渲染了这一页，不是
 * 虚拟滚动）；(3) 表格自带的"导出"按钮点击后既不弹对话框也不触发下载（`wait
 * download` 4 秒超时），在免费/Basic 档位上似乎完全没有可观测效果。
 *
 * 因此 `report <id> data-explorer?...` 改成**换排序重新抓取、按 URL 去重合并**
 * 的折中方案：首次抓取按路由自带的 `sorting` 参数（通常是某个数值列降序）；
 * 若页面提供的总数（"N 个结果"）大于已捕获的唯一 URL 数，依次尝试路由
 * `columns=` 参数里列出的其它列的升/降序，每次都是新的一次导航，合并去重直到
 * 覆盖总数或达到 `--max-pages` 上限（默认 5）。**这是尽力而为，不是保证全量**：
 * 输出里 `complete: true/false` 如实标注，`>50` 且排序尝试仍未覆盖全部的
 * issue，`complete` 为 false 且列出已尝试过的排序变体，不假装拿到了全量。
 * 行的抽取方式也从旧版的"整页拍平文本"改成**真实 DOM 表格逐行逐格读取**
 * （`table tbody tr > td`），比文本形状正则更不容易受列结构变化影响。
 *
 * ── schedule：只读查看下次排程抓取时间（2026-09-13 新增）───────────
 *
 * **先区分入口，不要按 Basic 档位一概判成不能手动重抓。**
 * 2026-09-13 实测项目列表的「开始」进入 Always-On Audit 付费升级向导，
 * 不是立即抓取；不要购买/升级或开启付费开关。
 * 2026-09-14 同档位项目历史/报告页的「新的抓取」可直接启动手动抓取：
 * 点击后先显示「开始新的抓取」，随后进入 crawl-log，顶部出现「停止抓取」，
 * 新时间戳、已抓取URL与排队数持续增长。必须以这些实际运行证据确认，
 * 不能仅凭按钮 enabled 或一次点击成功宣称重抓成功；完成后再读取新健康分。
 * 触发前先完成当前站点修复与线上复核，并确认属于用户授权范围。
 * 若当前账户/入口只提供 Always-On 升级，则保留现状并读取下次免费排程。
 *
 * `schedule` 子命令**不导航到上面这个设置页**——项目列表（`projects` 命令）的
 * 表格里本来就有一列"已排程"，直接给出下一次具体的日期与时间窗（形如
 * "9月18日, 3—4 凌晨"），比设置页里的周期性规则（"每周五 03:00–03:59"，
 * 不含具体下次日期）更直接。`schedule <项目ID>` 复用 `projects` 页面的同一次
 * 抓取，改成真实 DOM 表格逐行读取（`table tbody tr`，不是拍平文本），定位到
 * 目标项目所在行后取出"已排程"单元格，全程只读、零点击，不会碰到升级向导。
 *
 * ── 为什么是浏览器而不是 API（实测 2026-08-29）────────────────────
 *
 * 本机这个账号的套餐是**「网站管理员工具（免费）」（AWT）**，不是付费版。
 * AWT 的能力边界很明确：**只能看自己已验证所有权的站点**，
 * 但在这个边界内 Site Audit 是完整的——定期抓取、健康评分、逐类问题报告，
 * 且不消耗任何按次配额。
 *
 * 账号里确实有 API 密钥（范围 `MCP`、限制「无限制」），但：
 *   1. 密钥在页面上是打码的，取出来要么抠 network、要么读剪贴板——
 *      为了省一次浏览器调用去搬运一枚凭据，不划算；
 *   2. `api.ahrefs.com/v3/*` 不带鉴权一律 403，**猜不出免费档到底放行哪几个端点**；
 *      实测 `/v3/public/keyword-difficulty` 之类的猜测路径全是 404，
 *      唯二匿名可用的是 `/v3/public/crawler-ip-ranges` 与 `/v3/public/crawler-ips`（爬虫 IP 段）。
 *   3. 浏览器路径此刻就是通的，且不碰凭据。
 * 想走 API/MCP 的话密钥已经在账号里了（帐号设置 → API密钥），
 * 那是用户自己配 MCP server 的事，不该由脚本去搬。
 *
 * ── 会话名为什么固定 ────────────────────────────────────────
 *
 * Site Audit 的报告页很重，同时加载多个是 Semrush 那类配额站一样的失败形态。
 * 固定会话名 = 并发度 1，daemon 会把多个调用排成一队。**不要给每个 agent 一个名字。**
 *
 * ── 已验证（2026-08-29，扩展 1.0.32 / CLI 1.8.7）──────────────
 *   * `projects` 在 9 个真实项目上跑通（健康评分、已抓取 URL、内链错误数）。
 *   * `report <id> overview` 跑通，返回完整概述文本。
 *   * 报告页需要 ~12 秒渲染；固定短等待会拿到半张页面而**不报错**——
 *     这正是改成「长度稳定判据」的原因。
 *   * `/all-issues` 不是有效路由（返回站内 404 页面），正确的是 `/issues`。
 *   * 2026-09-02：`report <id> data-explorer?...` 直接吃 `issues --json` 里 links 给的原始路径，
 *     拿某条问题的逐 URL 清单（filterId 是动态的，登记不进 ROUTES）。在 4 类问题上跑通。
 */

import { execFileSync } from "node:child_process";
import { dirname, resolve as resolvePath } from "node:path";
import { realpath } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { newEvidenceDir, captureScene, writeManifest, msleep } from "./lib-scene.mjs";

const BASE = "https://app.ahrefs.com/site-audit";
const SCRIPT = "ahrefs-site-audit";

// 项目内报告路由，2026-08-29 从真实项目页的导航里读出来的。
const ROUTES = {
  overview: "概述：健康评分、抓取分布、HTTP 状态码分布、问题分布",
  issues: "所有问题：逐条问题与影响 URL 数",
  links: "链接：内部链接问题，闸门 1「内链零 404」的取数处",
  redirects: "重定向：301/302/307 与重定向链，配合 seo-box.md 二",
  "html-tags": "HTML 标签：title/description/h1，闸门 2 TDK 的第二双眼睛",
  indexability: "可索引性：noindex、canonical、robots 阻挡",
  performance: "效果：慢页面、体积过大的资源",
  images: "图片：过大 / 缺 alt",
  localization: "本地化：hreflang 问题（多语言站）",
  "content-quality": "内容：重复、字数过少",
  "social-tags": "社交标签：OG / Twitter Card",
  "internal-urls": "内部页面：全部已抓取内部 URL",
  "external-urls": "外部页面：出站链接",
  "crawl-log": "抓取日志：这次抓了什么、什么被拦了",
  "project-history": "项目历史：健康评分随时间变化",
};

export function isKnownReportRoute(route) {
  return Object.hasOwn(ROUTES, String(route).split("?")[0]) || /^data-explorer\?/.test(route);
}

export function parseArgs(argv) {
  const pos = [];
  const o = {
    session: "ahrefs-nav",
    wait: 20000,
    json: false,
    out: null,
    keep: false,
    retries: 2,
    maxPages: 5,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--session") o.session = argv[++i];
    else if (a === "--wait") o.wait = Number(argv[++i]);
    else if (a === "--out") o.out = argv[++i];
    else if (a === "--json") o.json = true;
    else if (a === "--keep-session") o.keep = true;
    else if (a === "--retries") o.retries = Number(argv[++i]);
    else if (a === "--max-pages") o.maxPages = Number(argv[++i]);
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("--")) {
      console.error(`未知参数：${a}`);
      process.exit(1);
    } else pos.push(a);
  }
  return { pos, o };
}

/* ── 纯函数：可脱离浏览器单测 ─────────────────────────────────── */

/**
 * `open` 步骤的错误信息是不是看着像瞬时性拒绝（浏览器扩展/CDP 层面），
 * 而不是「这个站真的打不开」。命中就值得重试，不命中直接 bail——
 * 不是所有 open 失败都该重试（比如登录态失效、目标本来就不存在）。
 */
export function isTransientOpenError(message) {
  return /navigation rejected|net::err_aborted|econnreset|frame was detached|target closed|timed out/i.test(
    String(message || ""),
  );
}

/**
 * 从 data-explorer 页面文本里抠总数（"189 个 结果" / "189 results"）。
 * 找不到就是 null，不当 0——0 和"没解析到"是两件事。
 */
export function parseDataExplorerTotal(pageText) {
  // 不能在末尾加 `\b`：CJK 字符不是正则的"单词字符"，"结果"后面紧跟空格时
  // 两边都不是 word char，`\b` 反而匹配不上——之前踩过这个坑，2026-09-13 修。
  const m = String(pageText || "").match(/(\d[\d,]*)\s*(?:个\s*结果|results?)/i);
  return m ? Number(m[1].replace(/,/g, "")) : null;
}

/** 从一行的各格文本里找第一个看起来像 URL 的字段——data-explorer 每行都带受影响页面的地址。 */
export function extractRowUrl(cells) {
  for (const c of cells || []) {
    const m = String(c || "").match(/https?:\/\/\S+/);
    if (m) return m[0];
  }
  return null;
}

/**
 * 合并多次换排序抓到的行，按抽取出的 URL 去重。抽不出 URL 的行不丢弃
 * （不能因为解析不出关键字段就假装它不存在），但不参与去重计数。
 */
export function mergeDataExplorerRows(pages) {
  const seen = new Map();
  const noUrl = [];
  for (const page of pages || []) {
    for (const cells of page || []) {
      const url = extractRowUrl(cells);
      if (url) {
        if (!seen.has(url)) seen.set(url, cells);
      } else {
        noUrl.push(cells);
      }
    }
  }
  return { rows: [...seen.values(), ...noUrl], uniqueUrlCount: seen.size, noUrlCount: noUrl.length };
}

/**
 * 给定路由自带的列清单，按顺序尝试每列的降序、升序，跳过已经用过的变体。
 * 没有更多可试的变体就返回 null（调用方据此停止翻页尝试）。
 * 通用化的理由：不同 issue 类型的 `columns=` 参数不同，硬编码一个列名
 * 只对某一类问题有效，换一类问题就要重写；按路由自己声明的列走，
 * 同一份逻辑对所有 data-explorer 路由都成立。
 */
export function nextSortingVariant(columns, usedVariants) {
  for (const col of columns || []) {
    for (const variant of [`-${col}`, col]) {
      if (!usedVariants.has(variant)) return variant;
    }
  }
  return null;
}

function browser(session, args, timeoutMs = 200_000) {
  return execFileSync("opencli", ["browser", session, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
}

/* ── 取证（铁律 1/2：先取证，后死；先取证，后关） ───────────── */

let evidence = null; // 惰性建目录：routes/help 这类不碰浏览器的路径不留空目录
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir(SCRIPT);
  return evidence;
}

/** 采一幕现场。截图与页面文本各自失败都不抛，错误进 manifest。 */
function scene(o, tag, extra) {
  return captureScene({
    dir: evidenceDir(),
    tag,
    screenshot: (p) => browser(o.session, ["screenshot", p], 90_000),
    pageText: () =>
      browser(o.session, [
        "eval",
        `(()=>{try{return document.body?document.body.innerText:''}catch(e){return 'PAGE_TEXT_FAILED:'+e}})()`,
      ]),
    extra,
  });
}

function closeSession(o) {
  if (o.keep) return;
  try {
    browser(o.session, ["close"], 30_000);
  } catch {
    /* 会话本来就不存在是正常情况 */
  }
}

/**
 * 失败退出的唯一出口：先落现场，再写 stopReason，**然后**才关会话、退出。
 * `extra` 里放已经在手的事实（原始响应、URL、页面对象），不做结论转译。
 */
function bail(o, stopReason, msg, extra) {
  let dir = null;
  try {
    scene(o, `fail-${stopReason}`, extra);
    dir = writeManifest(evidenceDir(), { script: SCRIPT, stopReason, finishedAt: new Date().toISOString() });
  } catch (e) {
    console.error(`（取证失败：${String(e?.message || e).slice(0, 200)}）`);
  }
  console.error(msg);
  if (dir) console.error(`现场已落盘：${dirname(dir)}（截图 + 页面文本 + manifest，判读以它们为准）`);
  if (o.keep) console.error(`会话 ${o.session} 已保留，可去浏览器里看现场标签页。`);
  closeSession(o);
  process.exit(1);
}

// 一次访问打包成一个 batch：含写操作的 batch 整体按写处理，别人插不进来。
function openAndEval(o, url, js) {
  const maxAttempts = Math.max(1, (Number(o.retries) || 0) + 1);
  let lastOpenError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let raw;
    try {
      raw = browser(o.session, [
        "batch",
        "--commands",
        JSON.stringify([{ cmd: "open", args: { url } }, { cmd: "eval", args: { js } }]),
      ]);
    } catch (e) {
      // batch 本身没跑起来（daemon 掉线 / 超时），此时可能连会话都没有，
      // 截图多半也采不到——captureScene 会把这一点如实记进 manifest。
      bail(o, "opencli-failed", `opencli batch 失败：${String(e?.stderr || e?.message || e).slice(0, 400)}`, { url });
    }
    const arr = JSON.parse(raw.slice(raw.indexOf("[")));
    const open = arr.find((x) => x.cmd === "open");
    if (!open?.ok) {
      const errText = JSON.stringify(open?.error);
      // 间歇性 "Navigation rejected" 一类瞬时拒绝（浏览器扩展/CDP 层面，不是站点真的
      // 打不开）：实测原样重跑一次往往就好（分诊阶梯第 1 层）。命中就重试，不命中
      // （比如登录态失效、目标本来就不存在）直接 bail，不浪费时间重试注定失败的事。
      if (attempt < maxAttempts && isTransientOpenError(errText)) {
        lastOpenError = errText;
        console.error(`打开 ${url} 遇到疑似瞬时错误（第 ${attempt}/${maxAttempts} 次）：${errText}，2 秒后重试。`);
        msleep(2000);
        continue;
      }
      bail(o, "open-failed", `打开失败（已尝试 ${attempt} 次）：${errText}`, { url, steps: arr, lastOpenError });
    }
    const ev = arr.find((x) => x.cmd === "eval");
    if (!ev?.ok) bail(o, "eval-failed", `读取失败：${JSON.stringify(ev?.error)}`, { url, steps: arr });
    return JSON.parse(ev.result);
  }
  // 理论上到不了这里（循环内要么 return 要么 bail/continue），留一个防御性出口。
  bail(o, "open-retries-exhausted", `打开 ${url} 重试 ${maxAttempts} 次仍失败：${lastOpenError}`, { url });
}

// eval 体一律包 IIFE：本环境 eval 上下文跨调用持续，重复声明会抛错且那次调用不执行。
//
// 等待不再是「硬睡 wait 毫秒」：页内轮询，正文长度超过阈值且连续两拍（1s）不变
// 即认为渲染稳定，提前返回；waitMs 只是封顶。慢页面不至于拿到半张页（那不报错、
// 只给一个看着正常的错误答案），快页面也不用白等十几秒。
const readPage = (waitMs) => `(async()=>{
  const deadline = Date.now() + ${Math.max(1000, Number(waitMs) || 20000)};
  let prev = -1, stable = 0;
  while (Date.now() < deadline) {
    const len = document.body ? document.body.innerText.length : 0;
    if (len > 500 && len === prev) { stable++; if (stable >= 2) break; }
    else stable = 0;
    prev = len;
    await new Promise(r=>setTimeout(r,1000));
  }
  const t = document.body ? document.body.innerText.replace(/\\s+/g,' ') : '';
  const links = [...new Set([...document.querySelectorAll('a')]
    .map(a=>a.getAttribute('href')||'').filter(h=>/^\\/site-audit\\/\\d+\\//.test(h)))];
  return JSON.stringify({url: location.href, text: t, textLen: t.length, settled: stable >= 2, links});
})()`;

// data-explorer 是真实 DOM 表格（`table tbody tr > td`），不是拍平文本能可靠解析的
// 形状——2026-09-13 实测确认没有翻页/无限滚动控件，页大小固定 50；轮询判据改成
// 「行数稳定」而不是「文本长度稳定」，因为表格首屏渲染完之后文本长度本来就不再变。
const readDataExplorerPage = (waitMs) => `(async()=>{
  const deadline = Date.now() + ${Math.max(1000, Number(waitMs) || 20000)};
  let prevRowCount = -1, stable = 0;
  while (Date.now() < deadline) {
    const rc = document.querySelectorAll('table tbody tr').length;
    if (rc > 0 && rc === prevRowCount) { stable++; if (stable >= 2) break; }
    else stable = 0;
    prevRowCount = rc;
    await new Promise(r=>setTimeout(r,1000));
  }
  const rows = [...document.querySelectorAll('table tbody tr')]
    .map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent.trim()))
    .filter(cells => cells.some(c => c.length > 3));
  const t = document.body ? document.body.innerText.replace(/\\s+/g,' ') : '';
  return JSON.stringify({url: location.href, text: t, textLen: t.length, settled: stable >= 2, rows});
})()`;

// 项目列表同样是真实表格；用于 `schedule` 子命令定位单个项目那一行，
// 不复用 cmdProjects 已经在用、且已实盘验证过的 readPage/links 逻辑，
// 避免为了新增一个只读命令去改一个已经在用的路径。
const readProjectsTable = (waitMs) => `(async()=>{
  const deadline = Date.now() + ${Math.max(1000, Number(waitMs) || 20000)};
  let prevRowCount = -1, stable = 0;
  while (Date.now() < deadline) {
    const rc = document.querySelectorAll('table tbody tr').length;
    if (rc > 0 && rc === prevRowCount) { stable++; if (stable >= 2) break; }
    else stable = 0;
    prevRowCount = rc;
    await new Promise(r=>setTimeout(r,1000));
  }
  const rows = [...document.querySelectorAll('table tbody tr')].map(tr => {
    const link = tr.querySelector('a[href^="/site-audit/"]');
    const idMatch = link ? (link.getAttribute('href')||'').match(/^\\/site-audit\\/(\\d+)\\//) : null;
    const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim()).filter(Boolean);
    return { id: idMatch ? idMatch[1] : null, cells };
  }).filter(r => r.id);
  const t = document.body ? document.body.innerText.replace(/\\s+/g,' ') : '';
  return JSON.stringify({url: location.href, text: t, textLen: t.length, settled: stable >= 2, rows});
})()`;

/**
 * 从项目列表某一行的原始格文本里找"已排程"那一格——判据是形状（日期 + 时间段
 * 破折号 + 可选的时段词），不是列下标（表格里有多个装饰性空 `<td>`，下标不稳定）。
 * "最后一次抓取" 格是单个具体时间（没有时间段破折号），靠这条差异区分两者。
 */
export function parseScheduledCell(cells) {
  const re = /^(?:\d{1,2}月\d{1,2}日|[A-Za-z]{3}\s\d{1,2}),?\s*\d{1,2}\s*[—-]\s*\d{1,2}\s*(?:凌晨|上午|中午|下午|晚上|AM|PM)?$/i;
  return (cells || []).find((c) => re.test(String(c || "").trim())) || null;
}

// 登录判据**只看 URL**，绝不看正文。
// 实测 2026-08-29：早先按正文子串判，被审计站点自己的报告数据触发了误报——
// 一条锚文本 "Sign In →" 和一个 `https://<被审计站>/auth/signin` 链接出现在链接报告里，
// 于是脚本对着一张加载完好的页面报「未登录」。**把目标站的数据读成平台状态，
// 是这类脚本最贵的错误**：它不报错，只是给出一个反向的结论。
function requireLogin(o, page) {
  if (/\/(user\/)?(login|signin|sign-in)(\/|\?|$)/i.test(page.url)) {
    bail(
      o,
      "redirected-to-login",
      "页面被重定向到登录页（判据：URL，不是正文）。请在用户的 Chrome 里登录 app.ahrefs.com 后重试。",
      { finalUrl: page.url },
    );
  }
}

async function cmdProjects(o) {
  const page = openAndEval(o, `${BASE}`, readPage(o.wait));
  requireLogin(o, page);
  const ids = [...new Set(page.links.map((h) => h.match(/^\/site-audit\/(\d+)\//)?.[1]).filter(Boolean))];
  // 项目名与域名从概览表格文本里取；表格是 innerText，Ahrefs 改版会让这里失配，
  // 所以 ids 与 raw 都原样返回，解析失败时仍有东西可用。
  const domains = [...page.text.matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)+)\//g)].map((m) => m[1]);
  const out = { projectIds: ids, domainsSeen: [...new Set(domains)], settled: page.settled, raw: page.text };
  if (!ids.length) {
    // 「没解析到 ID」有两个不可分辨的成因：账号确实没有项目，或页面没渲染完/改版。
    // 落现场，让判读者对着截图分辨，不在这里替他选一个。
    scene(o, "projects-no-ids", { finalUrl: page.url, textLen: page.textLen, settled: page.settled });
    writeManifest(evidenceDir(), { script: SCRIPT, stopReason: "projects-empty", finishedAt: new Date().toISOString() });
    console.error(
      `没解析到任何项目 ID（正文 ${page.textLen} 字，渲染稳定=${page.settled}）。` +
        `「账号没有项目」与「页面没渲染完/改版」在此不可分辨——看 ${evidenceDir()} 里的截图与文本判断。`,
    );
  }
  if (o.json) return JSON.stringify(out, null, 2);
  return (
    `项目 ID：${ids.join(", ") || "（没解析到——成因见 stderr 与证据目录）"}\n` +
    `域名：${out.domainsSeen.join(", ")}\n\n${page.text}`
  );
}

async function cmdReport(pos, o) {
  const [, target, route] = pos;
  if (!target || !route) {
    console.error("用法：report <项目ID|域名片段> <报告>。报告清单跑 `routes`。");
    process.exit(1);
  }
  // 2026-09-02：允许直接传 issues 页里抠出来的 data-explorer 相对路径
  // （形如 `data-explorer?columns=...&issueId=...`），用来拿某个问题的逐 URL 清单。
  // 这些路径带 filterId，只能从 `issues --json` 的 links 里取，没法预先登记进 ROUTES。
  const isRawPath = /^data-explorer\?/.test(route);
  if (!isKnownReportRoute(route)) {
    console.error(`未知报告 ${route}。可用：${Object.keys(ROUTES).join(", ")}，或 data-explorer?... 原始路径`);
    process.exit(1);
  }

  let id = /^\d+$/.test(target) ? target : null;
  if (!id) {
    // 域名片段 → 项目 ID 只能靠列表页的顺序对齐，Ahrefs 没在链接上带域名。
    // 对不上就直接报错，不猜——猜错会静默地把另一个站的报告写进 audit.md。
    console.error(
      `本命令需要项目 ID。先跑 \`projects\` 拿到 ID 列表，再用 ID 调本命令。\n` +
        `（Ahrefs 的项目链接里不带域名，"${target}" → ID 的映射只能靠人对一次。）`,
    );
    process.exit(1);
  }

  if (isRawPath) return cmdReportDataExplorer(o, id, route);

  const page = openAndEval(o, `${BASE}/${id}/${route}`, readPage(o.wait));
  requireLogin(o, page);
  if (/Page not found|找不到|couldn.t find that page/i.test(page.text)) {
    // 这句正则命中的是**站内 404 的文案**，但它也可能来自报告数据本身
    // （被审计站点的页面标题里就含 "Page not found" 的情况见 requireLogin 注释）。
    // 所以不下「路由 404」的结论，落现场让判读者看截图。
    bail(
      o,
      "page-text-matched-404",
      `路由 ${route} 在项目 ${id} 上的页面文本命中了「Page not found」类字样。\n` +
        `可能是项目 ID 不对 / 路由改版，也可能是报告数据本身含这几个词——两者在文本层不可分辨，看截图。`,
      { finalUrl: page.url, route, id, textHead: page.text.slice(0, 500) },
    );
  }
  return o.json ? JSON.stringify({ projectId: id, route, ...page }, null, 2) : page.text;
}

/**
 * data-explorer 的翻页折中方案（2026-09-13，见文件头「data-explorer 页大小固定
 * 50、无翻页」）：真实 DOM 表格逐行读取，首次抓取按路由自带的排序；总数大于已
 * 捕获的唯一 URL 数时，依次换路由 `columns=` 里列出的其它列的降/升序重新抓取，
 * 按抽取出的 URL 去重合并，直到覆盖总数或达到 `--max-pages` 上限。**尽力而为，
 * 不保证全量**——`complete` 如实标注，覆盖不到时列出已尝试的排序变体。
 */
async function cmdReportDataExplorer(o, id, route) {
  const initialUrl = `${BASE}/${id}/${route}`;
  const usedVariants = new Set();
  const initialSortMatch = route.match(/[?&]sorting=([^&]+)/);
  if (initialSortMatch) usedVariants.add(decodeURIComponent(initialSortMatch[1]));
  const columnsMatch = route.match(/[?&]columns=([^&]+)/);
  const columns = columnsMatch ? decodeURIComponent(columnsMatch[1]).split(",").filter(Boolean) : [];

  const firstPage = openAndEval(o, initialUrl, readDataExplorerPage(o.wait));
  requireLogin(o, firstPage);
  if (/Page not found|找不到|couldn.t find that page/i.test(firstPage.text)) {
    bail(
      o,
      "page-text-matched-404",
      `路由 ${route} 在项目 ${id} 上的页面文本命中了「Page not found」类字样，看截图。`,
      { finalUrl: firstPage.url, route, id },
    );
  }

  const total = parseDataExplorerTotal(firstPage.text);
  const pagesRows = [firstPage.rows];
  const sortingVariantsUsed = [...usedVariants];
  let attempts = 1;

  while (
    total !== null &&
    mergeDataExplorerRows(pagesRows).uniqueUrlCount < total &&
    attempts < Math.max(1, Number(o.maxPages) || 5)
  ) {
    const variant = nextSortingVariant(columns, usedVariants);
    if (!variant) break;
    usedVariants.add(variant);
    sortingVariantsUsed.push(variant);
    const u = new URL(initialUrl);
    u.searchParams.set("sorting", variant);
    const nextPage = openAndEval(o, u.toString(), readDataExplorerPage(o.wait));
    pagesRows.push(nextPage.rows);
    attempts += 1;
  }

  const merged = mergeDataExplorerRows(pagesRows);
  const complete = total === null ? null : merged.uniqueUrlCount >= total;
  const allCapturedUrls = merged.rows.map((cells) => extractRowUrl(cells)).filter(Boolean);
  const out = {
    projectId: id,
    route,
    total,
    rowsCapturedInThisPull: merged.uniqueUrlCount,
    parsedRowCount: merged.rows.length,
    complete,
    pagesFetched: attempts,
    sortingVariantsUsed,
    exampleUrls: allCapturedUrls.slice(0, 5),
    allCapturedUrls,
    rows: merged.rows,
  };
  if (total !== null && !complete) {
    console.error(
      `注意：data-explorer 报总数 ${total}，本次换排序合并抓取到 ${merged.uniqueUrlCount} 条唯一 URL，` +
        `未覆盖全部（已尝试排序变体：${sortingVariantsUsed.join(", ") || "（无更多可试）"}）。` +
        `Ahrefs Basic 档位这个视图既没有翻页/无限滚动控件，"导出"按钮点击也无可观测效果` +
        `（2026-09-13 实测确认，见文件头注释），这是尽力而为的折中结果，不代表脚本有 bug。`,
    );
  }
  return o.json ? JSON.stringify(out, null, 2) : (allCapturedUrls.join("\n") || "(no urls captured)");
}

/**
 * schedule：只读查看项目下次排程抓取时间，复用 projects 页面（不额外导航），
 * 全程零点击；手动重抓的入口区别与实测证据见文件头「schedule」一节。
 */
async function cmdSchedule(pos, o) {
  const [, target] = pos;
  if (!target) {
    console.error("用法：schedule <项目ID> [--json]");
    process.exit(1);
  }
  const page = openAndEval(o, `${BASE}`, readProjectsTable(o.wait));
  requireLogin(o, page);
  const row = (page.rows || []).find((r) => r.id === target);
  if (!row) {
    bail(
      o,
      "project-not-found-in-list",
      `项目 ID ${target} 没有出现在项目列表里。先跑 \`projects\` 拿到有效 ID 列表。`,
      { availableIds: (page.rows || []).map((r) => r.id) },
    );
  }
  const scheduledNext = parseScheduledCell(row.cells);
  const note =
    "本命令只读下次排程。Basic 项目历史/报告页的「新的抓取」已实测可手动重抓；" +
    "项目列表「开始」曾进入 Always-On 付费向导，两入口不可混为一谈，按当前实际页面核验。";
  const out = { projectId: target, scheduledNext, cellsRaw: row.cells, note };
  if (o.json) return JSON.stringify(out, null, 2);
  return (
    `项目 ${target} 下次排程抓取：${scheduledNext || "（未解析到，见 cellsRaw 原始数据）"}\n${note}`
  );
}

async function main() {
  const { pos, o } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];

  if (o.help || !cmd) {
    console.log(
      "用法：\n" +
        "  ahrefs-site-audit.mjs projects [--json]\n" +
        "  ahrefs-site-audit.mjs report <项目ID> <报告> [--json] [--out f] [--wait ms] [--max-pages n]\n" +
        "  ahrefs-site-audit.mjs schedule <项目ID> [--json]\n" +
        "  ahrefs-site-audit.mjs routes\n\n" +
        "会话名固定 ahrefs-nav（并发度 1），不要传 --session。\n" +
        "--retries（默认 2）控制 open 步骤遇到瞬时错误时的重试次数；\n" +
        "--max-pages（默认 5）控制 data-explorer 页大小固定 50 时换排序重抓的最多尝试次数。\n" +
        "失败时现场（截图+文本+manifest）落 .rankup/evidence/ahrefs-site-audit-<ts>/。",
    );
    process.exit(0);
  }

  if (cmd === "routes") {
    for (const [k, v] of Object.entries(ROUTES)) console.log(`${k.padEnd(18)} ${v}`);
    process.exit(0);
  }

  let text;
  try {
    if (cmd === "projects") text = await cmdProjects(o);
    else if (cmd === "report") text = await cmdReport(pos, o);
    else if (cmd === "schedule") text = await cmdSchedule(pos, o);
    else {
      console.error(`未知子命令：${cmd}`);
      process.exit(1);
    }
  } catch (e) {
    // 走到这里说明是没被 bail 接住的意外错误（bail 自己 process.exit，不会到这）。
    // 同样先取证再关——finally 关会话毁现场正是旧版最大的坑。
    bail(o, "unexpected-error", `执行失败：${String(e?.message || e).slice(0, 400)}`, { stack: String(e?.stack || "").slice(0, 1000) });
  }

  // 成功路径：关会话（崩溃时 daemon 不会自动清理，残留会话在用户 Chrome 里就是一个孤儿标签页）。
  closeSession(o);

  if (o.out) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(o.out, text + "\n");
    console.error(`已写入 ${o.out}`);
  } else {
    console.log(text);
  }
}

// argv[1] 保留调用时写的路径，import.meta.url 已经过符号链接解析——两边取真实路径
// 再比较，同 check-version.mjs / cf-analytics-setup.mjs 的 invokedAsScript()。
// 让测试可以只 import 上面的纯函数而不触发参数校验或真的浏览器调用。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false;
  try {
    const resolved = await realpath(resolvePath(process.argv[1]));
    return pathToFileURL(resolved).href === import.meta.url;
  } catch {
    return false;
  }
}

if (await invokedAsScript()) {
  await main();
}
