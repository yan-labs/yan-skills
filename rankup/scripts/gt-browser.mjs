#!/usr/bin/env node
/**
 * gt-browser — Google Trends 的 OpenCLI 路由（新版 Explore UI，2026-09-09 切版）
 *
 * 旧版路由（/trends/explore + /trends/api/explore + /trends/api/widgetdata/*）已归档到
 * rankup/scripts/archive/gt-v1/，两套 UI 目前并存（旧版没被下线，只是不再是主用）。
 *
 * 新版 Explore 页（https://trends.google.com/explore?...）不再暴露旧版那套公开可读的
 * widget REST 接口。它改用 Google 通用的内部 RPC 框架 `batchexecute`
 * （POST https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=<ID>&f.sid=...），
 * 每个 widget 对应一个不透明的 rpcid，请求体的编码（f.req 里那一长串 200KB 级的签名
 * blob、`at` token）都是页面自己算出来/服务器发下来的，本脚本不重建它，而是像真人一样
 * 打开这次查询本身的 explore 页，让页面自己把请求发出去，再从**页面自身**读回去。
 *
 * === 取数点：2026-09-09 从「读 opencli 网络记录」改成「页面内 fetch/XHR 抓包」===
 * 上一版靠 `opencli browser <session> network` 读取「已经发生的请求」，这条命令在本机
 * 实测反复出现空列表（用非 Trends 站点复现过同样的问题，见 trends.md「未解决问题」），
 * 不是本脚本的 bug，但足以让 compare/region/related 整体不可用。
 *
 * 换成的新取数点（本文件 installCaptureJs + pollCapture）：在页面上下文里包一层
 * `window.fetch` / `XMLHttpRequest`，把匹配 `batchexecute` 的请求体与响应体原样存进
 * `window.__gtCapture`，再用 `opencli browser <session> eval` 把这个数组读出来解码。
 * 数据来源仍然是「用户已登录 Chrome 亲自发起的同源请求」，只是不再依赖 opencli 的
 * CDP 网络记录层，绕开了它的不稳定。
 *
 * 【实测确认，2026-09-09 反复验证】三个 rpcid 里 `qrLOJd`（地区分布）几乎总是在
 * `open` 命令返回之前——也就是本脚本能装上抓包壳子之前——就已经发出并完成，抓包壳子
 * 稳定抓不到它（不是偶发，是这个 widget 天生比任何「open 之后再 eval」的时序都快）。
 * 因此 region 命令**不走抓包路由，改走 DOM 解析**：地区列表本身就渲染在
 * `tr[data-geo-code]` 表格行里（`<div class="KlQbTb" ... aria-label="kw1: N%, kw2: M%">`
 * 或单关键词时 `aria-label="kw: N"`），滚动到可见后直接读 DOM 文本，配合
 * `button[aria-label="Go to next page"]` 翻页拿够 topN 条。这是**证据确认可靠**的路径，
 * 不是退而求其次的兜底——见 trends.md「新版接口勘探」一节的完整记录。
 * compare（g4kJzf）与 related（fXqlme）两个 widget 都在抓包壳子装上之后才发请求
 * （尤其 fXqlme 需要真实滚动触发懒加载），走抓包路由（dataPath: capture）。
 *
 * 实测确认的三个 rpcid（higgsfield/manus 两词，多次真实请求验证）：
 *   qrLOJd  地区热度分布——**不走抓包，走 DOM 解析**（见上）
 *   g4kJzf  热度对比曲线——抓包路由，通常在 settle 等待期间已经发出
 *   fXqlme  相关查询（top + rising）——抓包路由，**懒加载**，须真实滚动到底触发
 *   UZBRtc  地图色块的几何数据（choropleth shape），体积达 4-5MB，本脚本不取
 *   DqDTgb / Tnt4U 初始加载时一起触发，推测是 widget 配置/token 引导调用，
 *           未逐字节解出结构，不在本脚本的取数路径上——标记为【推测】，不影响功能。
 *
 * 子命令与选项跟旧版保持兼容，可互相替换：
 *   compare KW1 [KW2...]   热度对比曲线
 *   region  KW1 [KW2...]   地区热度分布
 *   related KW              相关查询（rising + top，只支持单个关键词）
 *   close                   释放浏览器会话
 *
 * 选项：--geo CODE  --time 1h|4h|1d|7d|28d|30d|1m|3m|12m|5y|all|START:END
 *       --top N  --raw  --property --category --resolution
 *       --session NAME  --keep-session
 *
 * 依赖：opencli（浏览器桥要绿，先跑 opencli doctor）
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { newEvidenceDir, captureScene, writeManifest, msleep, pollUntil } from "./lib-scene.mjs";

// 会话名要同时满足两件事，缺一个都会静默出错：
//   · 描述性——名字是唯一存在的标识，得能回答「这是谁的标签页」；
//   · 唯一性——一个字面常量会让两个并行任务（或两个 sub agent）算出同一个名字，
//     于是共用同一个标签页，第二个读到的是第一个打开的页面，**全程零报错**。
// 后缀按「每个对话」派生：CLAUDE_CODE_SESSION_ID 才是真正会并发的那个单位；
// HOST_SESSION_ID 是同一个桌面 app 里所有对话共享的，只能兜底。
// 并行 sub agent 继承同一份环境变量，必须各自显式传 --session。
function defaultSession() {
  const suffix = (
    process.env.OPENCLI_SESSION_SUFFIX ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.CLAUDE_CODE_HOST_SESSION_ID ||
    String(process.ppid)
  ).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "local";
  return `rankup-gt-trends-${suffix}`;
}

const EXPLORE_URL = "https://trends.google.com/explore?hl=en-US";
const OPENCLI = process.env.GT_OPENCLI ?? "opencli";

const PROPERTY_ALIASES = { web: "", "": "", images: "images", image: "images", news: "news", youtube: "youtube", yt: "youtube", shopping: "froogle", froogle: "froogle" };
function normalizeProperty(p) {
  if (p === undefined || p === null) return "";
  const key = String(p).toLowerCase();
  if (!(key in PROPERTY_ALIASES)) die(`--property 只能是 web / images / news / youtube / shopping，收到：${p}`);
  return PROPERTY_ALIASES[key];
}

/**
 * 新版 URL 参数编码【实测确认】与旧版一致：q（逗号分隔）、geo、date、hl。
 * cat（category）、gprop（property）沿用旧版参数名——这两个没有单独逐一实测
 * （higgsfield/manus 的勘探只验证了 q/geo/date），标记为【推测：沿用旧版命名】。
 */
function exploreUrlFor(keywords, geo, timeframe, opts = {}) {
  const u = new URL(EXPLORE_URL);
  if (opts.category && Number(opts.category)) u.searchParams.set("cat", String(Number(opts.category)));
  const gprop = normalizeProperty(opts.property);
  if (gprop) u.searchParams.set("gprop", gprop);
  if (timeframe && timeframe !== "all") u.searchParams.set("date", timeframe);
  if (geo) u.searchParams.set("geo", geo);
  if (keywords?.length) u.searchParams.set("q", keywords.join(","));
  return u.toString();
}

// 页面 bundle 启动 + 首批 batchexecute 请求打完需要的时间。
const SETTLE_MS = 4000;
// 等抓包壳子里出现目标 rpcid 的最长时间/轮询间隔。
const CAPTURE_TIMEOUT_MS = 15000;
const CAPTURE_POLL_MS = 1000;
// related 懒加载：真实滚动（不是 eval 硬改 scrollTop）触发的最多尝试次数。
const SCROLL_ATTEMPTS = 8;
const SCROLL_WAIT_MS = 2500;
// region DOM 翻页：每页 5 条，最多翻的页数上限（防止 topN 传得离谱时无限翻页）。
const REGION_MAX_PAGES = 20;

const PRESETS = {
  "1h": "now 1-H",
  "4h": "now 4-H",
  "1d": "now 1-d",
  "24h": "now 1-d",
  "7d": "now 7-d",
  "28d": "today 4-w",
  "30d": "today 1-m",
  "1m": "today 1-m",
  "3m": "today 3-m",
  "12m": "today 12-m",
  "1y": "today 12-m",
  "5y": "today 5-y",
  all: "all",
};

function die(msg) {
  console.error(`[gt-browser] 错误：${msg}`);
  process.exit(1);
}

function fail(stopReason, msg, extra) {
  throw Object.assign(new Error(msg), { stopReason, extra });
}

function toTimeframe(t = "12m") {
  if (PRESETS[t]) return PRESETS[t];
  if (t.includes(":")) return t.split(":").join(" ");
  return t;
}

function parseArgs(argv) {
  const kws = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--raw") opts.raw = true;
    else if (a === "--keep-session") opts.keepSession = true;
    else if (a === "--session") {
      if (i + 1 >= argv.length) die(`选项 ${a} 缺少值`);
      opts.session = argv[++i];
    } else if (a.startsWith("--")) {
      if (i + 1 >= argv.length) die(`选项 ${a} 缺少值`);
      opts[a.slice(2)] = argv[++i];
    } else kws.push(a);
  }
  return { kws, opts };
}

function opencliRaw(args, opts = {}) {
  return execFileSync(OPENCLI, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
}

/** 从 opencli 的输出里跳过 npm/extension 升级提示等噪音，取第一个 JSON 值。 */
function firstJson(raw) {
  const start = raw.search(/[[{]/);
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

function closeSession(session) {
  try {
    opencliRaw(["browser", session, "close"], { stdio: "ignore" });
  } catch {
    /* 关不掉不影响已经拿到的数据 */
  }
}

let openAttempted = false;

/**
 * 抓包壳子：包 window.fetch 与 XMLHttpRequest，把命中 batchexecute 的请求体/响应体
 * 存进 window.__gtCapture（数组，元素 {url, reqBody, resBody, ts, via}）。
 * 必须在 IIFE 里、且幂等（重复安装不报错，见 opencli eval 的「跨调用持续」约束）。
 * 只读值不受影响——这段代码本身会修改 window.fetch，属于「往页面里注入观察者」，
 * 不算用 eval 去点击/改状态，语义上与 opencli 的 network 抓包是等价物，只是实现点不同。
 */
const INSTALL_CAPTURE_JS = `(()=>{
  if (window.__gtCaptureInstalled) return {already:true};
  window.__gtCaptureInstalled = true;
  window.__gtCapture = [];
  var MAX = 40;
  function push(item){
    window.__gtCapture.push(item);
    if (window.__gtCapture.length > MAX) window.__gtCapture.shift();
  }
  var of = window.fetch;
  window.fetch = function(...a){
    var p = of.apply(this, a);
    p.then(function(res){
      try {
        var url = (typeof a[0] === "string") ? a[0] : (a[0] && a[0].url) || "";
        if (url.indexOf("batchexecute") === -1) return;
        var body = (a[1] && a[1].body) || null;
        res.clone().text().then(function(t){
          push({url: url, reqBody: body, resBody: t, ts: Date.now(), via: "fetch"});
        }).catch(function(){});
      } catch (e) {}
    }).catch(function(){});
    return p;
  };
  var OX = window.XMLHttpRequest;
  function WX(){
    var x = new OX();
    var u = "";
    var oo = x.open;
    x.open = function(m, uu){ u = uu; return oo.apply(x, arguments); };
    var os = x.send;
    x.send = function(b){
      x.addEventListener("loadend", function(){
        try {
          if (String(u).indexOf("batchexecute") !== -1) {
            push({url: u, reqBody: b, resBody: x.responseText, ts: Date.now(), via: "xhr"});
          }
        } catch (e) {}
      });
      return os.apply(x, arguments);
    };
    return x;
  }
  window.XMLHttpRequest = WX;
  return {installed: true};
})()`;

function openExploreWithCapture(session, url) {
  const commands = JSON.stringify([
    { cmd: "open", args: { url } },
    { cmd: "eval", args: { js: INSTALL_CAPTURE_JS } },
    // `wait time` 在已知的 opencli 版本里不准，用页内定时器代替（见旧版脚本同款注释）。
    { cmd: "eval", args: { js: `(async()=>{await new Promise(r=>setTimeout(r,${SETTLE_MS}));return true})()` } },
  ]);
  try {
    opencliRaw(["browser", session, "--window", "foreground", "batch", "--commands", commands]);
    openAttempted = true;
  } catch (e) {
    const msg = (e.stderr || e.message || "").toString();
    fail("opencli-open-failed", `打开 explore 页失败：${msg.trim().slice(0, 400)}`, { stderr: msg.slice(0, 2000) });
  }
}

/**
 * 从 window.__gtCapture 里按 rpcid 取最近一次匹配请求的 {reqBody, resBody}。
 * 【实测，2026-09-09】前台窗口（--window foreground）下抓包壳子普遍能在 g4kJzf/fXqlme
 * 真正发请求之前装好；qrLOJd 是例外，见文件头注释，不走这条路。
 */
function pollCapture(session, rpcid, { timeoutMs = CAPTURE_TIMEOUT_MS, intervalMs = CAPTURE_POLL_MS } = {}) {
  const js = `(()=>{var items=(window.__gtCapture||[]).filter(function(c){return c.url.indexOf("rpcids=${rpcid}")!==-1;});var last=items[items.length-1];return last?{resBody:last.resBody,via:last.via}:null;})()`;
  return pollUntil(
    () => {
      const raw = opencliRaw(["browser", session, "eval", js]);
      const parsed = firstJson(raw);
      return parsed && parsed.resBody ? parsed : null;
    },
    { timeoutMs, intervalMs },
  );
}

/**
 * 真实滚动（opencli 的 scroll 命令，模拟真实滚轮事件），不是 eval 硬改 scrollTop——
 * 【实测证伪】后者在这版新 UI 上经常不生效（div.scrollTop 赋值后原样弹回），
 * 前者能真正移动视口并触发懒加载渲染，见 trends.md「新版接口勘探」。
 */
function realScrollDown(session, times = 3) {
  for (let i = 0; i < times; i++) {
    try {
      opencliRaw(["browser", session, "scroll", "down", "--amount", "3000"]);
    } catch { /* 页面还没就绪，继续 */ }
    msleep(SCROLL_WAIT_MS);
  }
}

/**
 * 滚动 + 轮询，直到抓包壳子里出现目标 rpcid 或用完预算。超时不当成硬错误：把
 * scrolled/attempts 如实记进 manifest，取数仍然继续，让上层用「没取到 vs 没需求」的
 * 框架去判读。
 */
function scrollUntilCapture(session, rpcid) {
  for (let attempt = 1; attempt <= SCROLL_ATTEMPTS; attempt++) {
    const got = pollCapture(session, rpcid, { timeoutMs: 1, intervalMs: 1 });
    if (got) return { scrolled: true, attempts: attempt };
    realScrollDown(session, 1);
  }
  const got = pollCapture(session, rpcid, { timeoutMs: CAPTURE_TIMEOUT_MS, intervalMs: CAPTURE_POLL_MS });
  return got ? { scrolled: true, attempts: SCROLL_ATTEMPTS + 1 } : { scrolled: false, attempts: SCROLL_ATTEMPTS };
}

/**
 * batchexecute 的响应是 `)]}'` 反 XSSI 前缀 + 若干「长度\n内容」分块，真正的数据在
 * 第一个 `["wrb.fr","<rpcid>","<JSON 字符串>",...]` 三元组里，且这个 JSON 字符串是
 * **双重编码**的（外层反转义一次，得到的字符串本身还要再 JSON.parse 一次）。
 * 用括号计数而不是正则，是因为内容里带引号/反斜杠的关键词（用户查询词本身）会让
 * 天真的正则提前收尾。
 */
function decodeWrb(body, rpcid) {
  if (!body) return null;
  const marker = `["wrb.fr","${rpcid}",`;
  const idx = body.indexOf(marker);
  if (idx < 0) return null;
  let i = idx + marker.length;
  if (body[i] !== '"') return null;
  i++;
  let out = "";
  while (i < body.length) {
    const c = body[i];
    if (c === "\\") {
      out += c + body[i + 1];
      i += 2;
      continue;
    }
    if (c === '"') break;
    out += c;
    i++;
  }
  try {
    const inner = JSON.parse('"' + out + '"');
    return JSON.parse(inner);
  } catch (e) {
    fail("wrb-decode-failed", `解码 ${rpcid} 响应失败：${String(e.message || e).slice(0, 200)}`, { headOfBody: body.slice(0, 300) });
  }
}

function scopeLine(geo, timeframe) {
  return `\n> 范围：${geo || "全球"} · ${timeframe} · 数值为 0-100 归一化热度（100=区间内峰值）\n`;
}

function mdTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(String(h).length, ...rows.map((r) => String(r[i] ?? "").length)),
  );
  const line = (cells) => "| " + cells.map((c, i) => String(c ?? "").padEnd(widths[i])).join(" | ") + " |";
  return [line(headers), "|" + widths.map((w) => "-".repeat(w + 2)).join("|") + "|", ...rows.map(line)].join("\n");
}

function evidenceScene(dir, session) {
  captureScene({
    dir,
    tag: "final",
    screenshot: (p) => {
      if (!openAttempted) return;
      execFileSync(OPENCLI, ["browser", session, "screenshot", p], { stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
    },
    pageText: () => {
      if (!openAttempted) return "";
      return execFileSync(
        OPENCLI,
        ["browser", session, "eval", "(()=>{try{return document.body?document.body.innerText.slice(0,20000):''}catch(e){return 'PAGE_TEXT_FAILED:'+e}})()"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60_000 },
      );
    },
  });
}

/**
 * 一次运行的完整生命周期（compare / related 用，走抓包路由）：
 * 开页+装抓包壳子 → 等 settle → （related 额外滚动到底）→ 抓指定 rpcid 的响应 →
 * 落证据 → 关会话。取数失败/为空都不下结论，现场留给判读者。
 */
function runCaptureQuery(kws, opts, { rpcid, needScroll = false }) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  const kwSlug = kws.join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "kw";
  let stopReason = "completed";
  let scrollInfo = { scrolled: null, attempts: 0 };
  let decoded = null;
  let capturedVia = null;
  let openRounds = 0;
  // 抓包壳子装的时机跟页面自己发这个 widget 请求的时机是一场赛跑：多数情况下壳子能
  // 在请求发出前装好，但【实测，2026-09-09】即使同一个查询、同一套代码，个别整页
  // 加载会在壳子装好前就把请求发完（怀疑是 JS bundle 命中浏览器缓存、执行快到抢先），
  // 表现为「反复调大超时也没用，但整页重开常常就好」——所以重试策略是**重开整页**
  // 而不是加长单次等待。4 轮下（每轮独立同分布地"抢先"的概率若约 50%）失败概率
  // 压到 6% 左右，足够实用；仍然失败就如实把 openRounds/scrolled 记进 manifest，
  // 交给证据判读，不由脚本自己下"没有数据"的结论。
  // 懒加载路径（related）单轮本来就慢（真实滚动 + 长轮询），round 数給少一点，
  // 不然 4 轮 × 50s 会撞外层调用方的超时；非懒加载路径（compare）单轮便宜，多给几轮。
  // related（needScroll）只给 1 轮抓包：抓不到就有 DOM 兜底顶上（见 cmdRelated），
  // 把时间预算留给更可靠的那条路，而不是在抓包上重复赌概率。
  const MAX_OPEN_ROUNDS = needScroll ? 1 : 4;
  try {
    let cap = null;
    while (!cap && openRounds < MAX_OPEN_ROUNDS) {
      openRounds++;
      openExploreWithCapture(session, url);
      if (needScroll) {
        scrollInfo = scrollUntilCapture(session, rpcid);
      } else {
        // 非懒加载 widget（如 g4kJzf）不靠滚动触发，靠等：一次性给够时间窗，
        // 等不到就整页重开（见上），而不是死等更久——死等对"被抢跑"的场景没用。
        cap = pollCapture(session, rpcid, { timeoutMs: 8000, intervalMs: 800 });
        continue;
      }
      cap = pollCapture(session, rpcid);
    }
    if (cap) {
      capturedVia = cap.via;
      decoded = decodeWrb(cap.resBody, rpcid);
      try {
        writeFileSync(join(dir, `raw-${rpcid}.json`), (cap.resBody ?? "null") + "\n");
      } catch { /* 落盘失败不影响判读，manifest 会记录 */ }
    }
    try {
      writeFileSync(join(dir, `trends-${kwSlug}.json`), JSON.stringify({ keywords: kws, geo, timeframe, rpcid, decoded }, null, 2) + "\n");
    } catch { /* 同上 */ }
    return { decoded, geo, timeframe, evidenceDir: dir, session, capturedVia };
  } catch (e) {
    stopReason = e?.stopReason || "error";
    e.evidenceDir = dir;
    throw e;
  } finally {
    evidenceScene(dir, session);
    try {
      writeManifest(dir, {
        script: "gt-browser",
        route: "v2-explore",
        dataPath: "capture",
        keywords: kws,
        geo,
        timeframe,
        session,
        exploreUrl: url,
        rpcid,
        capturedVia,
        openRounds,
        scrolled: scrollInfo.scrolled,
        scrollAttempts: scrollInfo.attempts,
        lazyBlocksLoaded: scrollInfo.scrolled === true,
        stopReason,
        finishedAt: new Date().toISOString(),
      });
    } catch { /* manifest 写不进也不能拦住关会话 */ }
    if (opts.keepSession) {
      console.error(`[gt-browser] 会话 ${session} 已保留，用完请释放：\n  node gt-browser.mjs close --session ${session}`);
    } else {
      closeSession(session);
    }
  }
}

/**
 * region 专用生命周期：开页（不装抓包壳子，region 走 DOM）→ 等 settle → 滚动到地区表格
 * 可见 → 轮询 `tr[data-geo-code]` 出现 → 读当前 5 行 → 需要更多就点「Go to next page」
 * 翻页继续读，直到凑够 topN 或翻页按钮消失/变灰 → 落证据 → 关会话。
 */
function runRegionQuery(kws, opts, topN) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  const kwSlug = kws.join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "kw";
  let stopReason = "completed";
  const seen = new Map(); // geoCode -> {name, values: Map(kw->num)}
  let scrolled = false;
  let pages = 0;
  try {
    // region 不需要抓包壳子，但仍走同一个 open+settle 入口，保持行为一致（前台窗口、
    // 同样的 settle 等待），只是第二个 eval（装抓包壳子）对 region 无害地空跑。
    openExploreWithCapture(session, url);
    realScrollDown(session, 1);
    scrolled = true;

    const readRowsJs = `(()=>{
      var trs = [].slice.call(document.querySelectorAll("tr[data-geo-code]"));
      return trs.map(function(tr){
        var code = tr.getAttribute("data-geo-code");
        var nameCell = tr.children[1];
        var name = nameCell ? nameCell.textContent.trim() : code;
        var bar = tr.querySelector("div.KlQbTb");
        var al = bar ? bar.getAttribute("aria-label") || "" : "";
        return {code: code, name: name, al: al};
      });
    })()`;

    const gotFirst = pollUntil(
      () => {
        const raw = opencliRaw(["browser", session, "eval", readRowsJs]);
        const rows = firstJson(raw);
        return Array.isArray(rows) && rows.length ? rows : null;
      },
      { timeoutMs: CAPTURE_TIMEOUT_MS, intervalMs: CAPTURE_POLL_MS },
    );

    const ingest = (rows) => {
      for (const r of rows || []) {
        if (!r.code || seen.has(r.code)) continue;
        const values = new Map();
        // aria-label 两种形态【实测，2026-09-09】：
        //   多关键词："higgsfield: 57%, manus: 43%"（同区域内两词的相对份额，和为 100）
        //   单关键词："higgsfield: 100"（该关键词自身 0-100 归一化，跟旧版语义一致）
        const re = /([^:,]+):\s*(\d+)%?/g;
        let m;
        while ((m = re.exec(r.al))) values.set(m[1].trim(), Number(m[2]));
        seen.set(r.code, { name: r.name, values });
      }
    };

    if (gotFirst) ingest(gotFirst);

    while (seen.size < topN && pages < REGION_MAX_PAGES) {
      let clicked;
      try {
        clicked = opencliRaw(["browser", session, "click", "--role", "button", "--name", "Go to next page", "--nth", "0"]);
      } catch {
        break; // 按钮不存在/点不到 = 已经翻到底
      }
      const envelope = firstJson(clicked);
      if (!envelope?.clicked) break;
      pages++;
      msleep(SCROLL_WAIT_MS);
      const raw = opencliRaw(["browser", session, "eval", readRowsJs]);
      const rows = firstJson(raw);
      if (!Array.isArray(rows) || !rows.length) break;
      const before = seen.size;
      ingest(rows);
      if (seen.size === before) break; // 翻页后行没变化，说明已经到底
    }

    try {
      writeFileSync(
        join(dir, "raw-qrLOJd-dom.json"),
        JSON.stringify([...seen.entries()].map(([code, v]) => ({ code, name: v.name, values: Object.fromEntries(v.values) })), null, 2) + "\n",
      );
    } catch { /* 落盘失败不影响判读 */ }

    return { seen, geo, timeframe, evidenceDir: dir, session };
  } catch (e) {
    stopReason = e?.stopReason || "error";
    e.evidenceDir = dir;
    throw e;
  } finally {
    evidenceScene(dir, session);
    try {
      writeManifest(dir, {
        script: "gt-browser",
        route: "v2-explore",
        dataPath: "dom",
        keywords: kws,
        geo,
        timeframe,
        session,
        exploreUrl: url,
        rpcid: "qrLOJd",
        domRowsCollected: seen.size,
        domPagesClicked: pages,
        scrolled,
        stopReason,
        finishedAt: new Date().toISOString(),
      });
    } catch { /* 同上 */ }
    if (opts.keepSession) {
      console.error(`[gt-browser] 会话 ${session} 已保留，用完请释放：\n  node gt-browser.mjs close --session ${session}`);
    } else {
      closeSession(session);
    }
  }
}

function widgetEmptyExit(evidenceDir, whatFor, reasonLine) {
  console.error(`[gt-browser] ${reasonLine ?? `${whatFor}为空。「接口没给数」与「该范围内搜索量不足」在此不可分辨——不要读成零需求。`}`);
  console.error(`[gt-browser] 证据：${evidenceDir}（raw-*.json 原始响应 + final.png/final.txt + manifest），判读以它们为准。`);
  process.exit(1);
}

function cmdCompare(kws, opts) {
  if (!kws.length) die("compare 需要至少 1 个关键词，最多 5 个");
  if (kws.length > 5) die("Google Trends 一次最多对比 5 个关键词");
  const { decoded, geo, timeframe, evidenceDir } = runCaptureQuery(kws, opts, { rpcid: "g4kJzf", needScroll: false });
  // 【实测，2026-09-09】g4kJzf 解码后的真实结构比最初勘探时记的多包一层：
  // `[[[keyword, ?, ?, ?, [[value,...],...]], ...]]`——外层多一个只有一个元素的
  // 数组包着真正的「每关键词一条」数组。旧假设（decoded 直接就是那个数组）来自勘探
  // 早期的样例，这次拿真实响应核对后发现差一层，这里做兼容解包，不管是否多包一层
  // 都能取到正确的 series。
  let series = decoded;
  if (Array.isArray(series) && series.length === 1 && Array.isArray(series[0]) && Array.isArray(series[0][0])) {
    series = series[0];
  }
  if (!Array.isArray(series) || !series.length) {
    widgetEmptyExit(evidenceDir, "热度对比曲线（g4kJzf）");
  }
  // 结构【实测确认，2026-09-09】：[[keyword, ?, ?, ?, [[value, roundedValue, [[startEpoch],[endEpoch]], flag, ?], ...]], ...]
  const byKw = new Map(series.map((entry) => [entry[0], entry[4] || []]));
  const pointCount = Math.max(0, ...kws.map((k) => (byKw.get(k) || []).length));
  const rows = [];
  for (let i = 0; i < pointCount; i++) {
    const startEpoch = kws.map((k) => byKw.get(k)?.[i]?.[2]?.[0]?.[0]).find((v) => v != null);
    const date = startEpoch ? new Date(Number(startEpoch) * 1000).toISOString().slice(0, 10) : `#${i}`;
    const vals = kws.map((k) => {
      const p = byKw.get(k)?.[i];
      const v = p ? (p[1] ?? Math.round(p[0])) : null;
      return v == null ? "" : String(v);
    });
    rows.push([date, ...vals]);
  }
  if (!rows.length) widgetEmptyExit(evidenceDir, "热度对比曲线（g4kJzf，解析后为空）");
  console.log(`## 热度对比：${kws.join(" vs ")}`);
  console.log(scopeLine(geo, timeframe));
  console.log(mdTable(["date", ...kws], rows));
  const peaks = kws.map((k, i) => {
    let best = rows[0];
    for (const r of rows) if (Number(r[i + 1] || -1) > Number(best[i + 1] || -1)) best = r;
    return `${k} → ${best[i + 1]}（${best[0]}）`;
  });
  console.log(`\n**峰值**：${peaks.join("；")}`);
}

function cmdRegion(kws, opts) {
  if (!kws.length) die("region 需要至少 1 个关键词");
  const list = kws.slice(0, 5);
  const topN = Number(opts.top || 15);
  const { seen, geo, timeframe, evidenceDir } = runRegionQuery(list, opts, topN);
  if (!seen.size) {
    widgetEmptyExit(evidenceDir, "地区热度分布（qrLOJd，DOM 解析）");
  }
  // 多关键词时 aria-label 给的是「同区域内几个词的相对份额（和为 100）」，不是
  // 各自独立的 0-100 归一化值——跟旧版/单关键词的语义不同，见文件头与 trends.md 说明。
  const rows = [...seen.values()]
    .map((v) => [v.name, ...list.map((k) => String(v.values.get(k) ?? 0))])
    .filter((r) => r.slice(1).some((v) => Number(v) > 0))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, topN);
  if (!rows.length) widgetEmptyExit(evidenceDir, "地区热度分布（qrLOJd，DOM 解析后为空）");
  console.log(`## 地区热度分布：${list.join(" / ")}`);
  console.log(scopeLine(geo, timeframe));
  if (list.length > 1) {
    console.log("> 注：多关键词对比时下表数值是「同一地区内几个词的相对份额」（同一行加总为 100），不是各词独立的 0-100 热度；只查 1 个词时才是独立的 0-100 归一化值。\n");
  }
  console.log(mdTable(["region", ...list], rows));
}

/**
 * related 的 DOM 兜底：fXqlme 抓包路由跟 qrLOJd 一样，会在某些整页加载里怎么都抓不到
 * ——不是滚动没到位（【实测】DOM 里 h3「Top queries」/「Rising queries」标题已经挂载），
 * 是这次请求本身走了抓包壳子装上之前就缓存好的原生 fetch/XHR 引用，壳子天生看不到。
 * 抓包在 cmdRelated 里失败后，退化到直接读表格 DOM：`Top queries`/`Rising queries` 标题
 * 下面的表格行，第 2 列是查询词，第 3 列是「Search interest: N」（Top）或
 * 「Breakout」/百分比涨幅（Rising）。跟 region 的 DOM 兜底同一套「真实滚动 + 轮询」骨架。
 */
function runRelatedDom(kws, opts) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  let stopReason = "completed";
  let scrolled = false;
  const sections = { top: [], rising: [] };
  try {
    openExploreWithCapture(session, url); // 装抓包壳子对 DOM 兜底无害，跳过即可
    const readTablesJs = `(()=>{
      var h3s = [].slice.call(document.querySelectorAll("h3")).filter(function(e){return /Top queries|Rising queries/.test(e.textContent);});
      function rowsFor(h3){
        var c = h3.closest("div");
        var hops = 0;
        while (c && c.querySelectorAll("tr").length < 2 && c.parentElement && hops < 8) { c = c.parentElement; hops++; }
        var trs = c ? [].slice.call(c.querySelectorAll("tr")) : [];
        return trs.map(function(tr){
          var tds = tr.querySelectorAll("td");
          if (tds.length < 3) return null;
          var rank = (tds[0].textContent || "").trim();
          if (!/^\\d+$/.test(rank)) return null; // 跳过表头行
          var query = (tds[1].textContent || "").trim();
          var valueCell = tds[2];
          var bar = valueCell.querySelector("[aria-label]");
          var al = bar ? bar.getAttribute("aria-label") || "" : "";
          var text = (valueCell.textContent || "").trim();
          return { query: query, al: al, text: text };
        }).filter(Boolean);
      }
      var out = { top: [], rising: [] };
      h3s.forEach(function(h3){
        var key = /Rising/.test(h3.textContent) ? "rising" : "top";
        out[key] = rowsFor(h3);
      });
      return out;
    })()`;

    const got = pollUntil(
      () => {
        realScrollDown(session, 1);
        const raw = opencliRaw(["browser", session, "eval", readTablesJs]);
        const parsed = firstJson(raw);
        const total = (parsed?.top?.length || 0) + (parsed?.rising?.length || 0);
        return total > 0 ? parsed : null;
      },
      { timeoutMs: 60000, intervalMs: SCROLL_WAIT_MS },
    );
    scrolled = !!got;
    if (got) {
      for (const r of got.top || []) {
        const m = r.al.match(/Search interest:\s*(\d+)/i);
        sections.top.push([r.query, m ? m[1] : r.text.replace(r.query, "").trim() || "0"]);
      }
      for (const r of got.rising || []) {
        const isBreakout = /breakout/i.test(r.text) || /breakout/i.test(r.al);
        sections.rising.push([r.query, isBreakout ? "Breakout" : (r.text.replace(r.query, "").trim() || r.al || "0")]);
      }
    }
    try {
      writeFileSync(join(dir, "raw-fXqlme-dom.json"), JSON.stringify(sections, null, 2) + "\n");
    } catch { /* 落盘失败不影响判读 */ }
    return { sections, geo, timeframe, evidenceDir: dir, session };
  } catch (e) {
    stopReason = e?.stopReason || "error";
    e.evidenceDir = dir;
    throw e;
  } finally {
    evidenceScene(dir, session);
    try {
      writeManifest(dir, {
        script: "gt-browser",
        route: "v2-explore",
        dataPath: "dom",
        keywords: kws,
        geo,
        timeframe,
        session,
        exploreUrl: url,
        rpcid: "fXqlme",
        domTopRows: sections.top.length,
        domRisingRows: sections.rising.length,
        scrolled,
        stopReason,
        finishedAt: new Date().toISOString(),
      });
    } catch { /* 同上 */ }
    if (opts.keepSession) {
      console.error(`[gt-browser] 会话 ${session} 已保留，用完请释放：\n  node gt-browser.mjs close --session ${session}`);
    } else {
      closeSession(session);
    }
  }
}

function cmdRelated(kws, opts) {
  if (kws.length !== 1) die("related 只支持单个关键词");
  const capture = runCaptureQuery(kws, opts, { rpcid: "fXqlme", needScroll: true });
  const entry = Array.isArray(capture.decoded) ? capture.decoded.find((e) => e[0] === kws[0]) || capture.decoded[0] : null;

  let topList = null;
  let risingList = null;
  let geo = capture.geo;
  let timeframe = capture.timeframe;
  let evidenceDir = capture.evidenceDir;
  let dataPath = "capture";

  if (entry) {
    // entry[1]：value 接近/等于 5000 的封顶型数组 → 飙升（Rising，含 Breakout）
    // entry[2]：value 0-100 的常规相关度数组 → 高频（Top）
    // 【实测确认，2026-09-09】页面上「Top queries」区块 = 0-100 常规刻度 + 涨跌幅列，
    // 「Rising queries」区块 = 全部标 Breakout/百分比涨幅，与经典 API 语义一致，
    // 直接在页面 DOM 里核对过标题文字，不再是推断。
    risingList = entry[1];
    topList = entry[2];
  } else {
    // 抓包没抓到——不代表没数据，fXqlme 跟 qrLOJd 一样偶尔会在壳子装好前就把原生
    // fetch/XHR 引用缓存走，壳子看不到。退化到直接读页面表格 DOM。
    const dom = runRelatedDom(kws, opts);
    geo = dom.geo;
    timeframe = dom.timeframe;
    evidenceDir = dom.evidenceDir;
    dataPath = "dom";
    if (dom.sections.top.length || dom.sections.rising.length) {
      topList = dom.sections.top;
      risingList = dom.sections.rising;
    }
  }

  if (!topList?.length && !risingList?.length) {
    widgetEmptyExit(
      evidenceDir,
      "相关查询（fXqlme）",
      "相关查询为空——这块是懒加载的，抓包与 DOM 兜底都没取到；如果 manifest 里 scrolled=false，先看是不是滚动没触发到底，不要直接读成零相关词。",
    );
  }
  console.log(`## 相关查询：${kws[0]}`);
  console.log(scopeLine(geo, timeframe));
  if (dataPath === "dom") {
    console.log("> 注：本次走 DOM 兜底取数（抓包没拿到这次的请求），数值来自页面渲染文本，非原始接口值。\n");
  }
  const topN = Number(opts.top || 15);
  const sections = [
    ["飙升 Rising（对应页面「Rising queries」区块，含 Breakout）", risingList],
    ["高频 Top（对应页面「Top queries」区块，value 0-100 相对热度）", topList],
  ];
  for (const [label, list] of sections) {
    console.log(`### ${label}`);
    if (!Array.isArray(list) || !list.length) {
      console.log("（无数据）\n");
      continue;
    }
    console.log(mdTable(["query", "value"], list.slice(0, topN).map(([q, v]) => [q, String(v)])));
    console.log();
  }
}

function cmdHot(_kws, opts) {
  // Trending Now（原「每日热搜」）走 opencli 内建的 google trends adapter，跟 Explore 页
  // 新旧版切换无关——它抓的是独立的 trending feed，两次实测（切版前后）都能跑通。
  const region = opts.region || "US";
  if (region.toUpperCase() === "CN") die("Google Trends 没有中国大陆的每日热搜 feed，试试 TW/HK/JP/US");
  const limit = opts.limit || "20";
  let r;
  try {
    r = opencliRaw(["google", "trends", "--region", region, "--limit", limit, "-f", "md"]);
  } catch (e) {
    die(`opencli 调用失败：${String(e.stderr || e.message || e).slice(0, 400)}`);
  }
  console.log(`## 每日热搜榜（${region}）\n`);
  for (const line of r.split("\n")) {
    if (line.includes("Update available") || line.includes("npm install") || line.includes("Extension update") || line.includes("Download:")) continue;
    console.log(line);
  }
}

function cmdClose(kws, opts) {
  if (kws.length) die("close 不需要关键词");
  const session = opts.session ?? defaultSession();
  closeSession(session);
  console.log(`已释放 Trends 会话：${session}`);
}

const COMMANDS = { compare: cmdCompare, region: cmdRegion, related: cmdRelated, hot: cmdHot, close: cmdClose };

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || ["-h", "--help", "help"].includes(argv[0])) {
    console.log(
      [
        "gt-browser — Google Trends 新版 Explore UI 的 OpenCLI 路由",
        "",
        "  node gt-browser.mjs compare KW1 [KW2...]  热度对比",
        "  node gt-browser.mjs region  KW1 [KW2...]  地区分布",
        "  node gt-browser.mjs related KW             相关查询（仅单词）",
        "  node gt-browser.mjs hot                    每日热搜（走 opencli adapter）",
        "  node gt-browser.mjs close                  释放浏览器会话",
        "",
        "  --geo CODE   地区（留空=全球）   --time 1h|4h|1d|7d|28d|30d|1m|3m|12m|5y|all|START:END",
        "  --top N      条数（默认 15）     --raw（保留，compare 已是原始周级数据未聚合）",
        "  --session NAME  会话名（默认 rankup-gt-trends-<每对话唯一后缀>）",
        "  --keep-session  跑完保留会话，连续查询后用 close 释放",
        "",
        "取数机制：compare/related 抓页面自身发出的 batchexecute 请求（fetch/XHR 抓包壳子）；",
        "region 直接解析地区表格 DOM（不走抓包，见脚本头注释）。",
        "旧版（/trends/explore）路由已归档：rankup/scripts/archive/gt-v1/",
      ].join("\n"),
    );
    process.exit(0);
  }
  const cmd = argv[0];
  if (!COMMANDS[cmd]) die(`未知子命令 ${cmd}，可用：${Object.keys(COMMANDS).join(", ")}`);
  const { kws, opts } = parseArgs(argv.slice(1));
  try {
    COMMANDS[cmd](kws, opts);
  } catch (e) {
    console.error(`[gt-browser] 错误：${e?.message || e}`);
    if (e?.evidenceDir) console.error(`[gt-browser] 现场已落盘：${e.evidenceDir}（stopReason=${e.stopReason ?? "error"}），判读以截图与原始响应为准。`);
    process.exit(1);
  }
}

main();
