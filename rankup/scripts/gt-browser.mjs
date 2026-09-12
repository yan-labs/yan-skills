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
 * compare（g4kJzf）走抓包路由（dataPath: capture）。
 *
 * === related：2026-09-09 四次修订，彻底放弃「滚动 → 懒加载」这条路 ===
 * 【实测，本轮直接在页面上验证，这是之前三轮全部失败的真正根因】opencli 驱动的标签页
 * 在本机环境里 `document.visibilityState === "hidden"`（即使 `--window foreground`、
 * `tab select` 之后、`document.hasFocus()` 已经是 true，仍然是 hidden——Chrome 窗口被
 * 遮挡/最小化就会这样）。隐藏标签页里 Chrome **完全停掉渲染生命周期**：
 *   · `requestAnimationFrame` 一次都不回调（实测 4 秒内 __raf 恒为 0）；
 *   · `IntersectionObserver` 一条记录都不投递（实测回调没跑、takeRecords() 也是 0）；
 *   · 内部滚动容器的 `scroll-behavior` 是 `smooth`，而平滑滚动动画由渲染生命周期驱动，
 *     所以 `pane.scrollTop = pane.scrollHeight` **赋值后同步读回来仍然是 0**，永远滚不动
 *     （把 `style.scrollBehavior = "auto"` 强制成瞬时滚动之后，同一行赋值立刻生效：
 *     scrollTop 0 → 1400.5）；
 *   · 页面隐藏超过 5 分钟后 `setTimeout` 被 intensive throttling 压到 1 次/分钟，
 *     于是「页内滚动 + setTimeout 等待」的循环 eval 必然撞 opencli 的 115s CDP 硬超时。
 * 「Top queries / Rising queries」这块的数据请求就是挂在 IntersectionObserver 上的：
 * 块的 DOM 骨架（h3 标题 + 空表格 + 两个 disabled 的 Download CSV 按钮）确实会挂载，
 * 但**数据永远不会加载**——所以之前「加长等待」的方向从原理上就走不通，
 * 「点 Download CSV 读文件」也走不通（按钮 `disabled=""`，因为它下面没有数据）。
 *
 * 换的路子：**旧版 REST 接口在新版页面上依然可用**【实测，10/10 成功，单次 1-2.5 秒】。
 * 在同一个 trends.google.com 页面上下文里同源 fetch：
 *   GET /trends/api/explore?hl&tz&req=<JSON>            → widgets[]，取 id=RELATED_QUERIES
 *   GET /trends/api/widgetdata/relatedsearches?req=<widget.request>&token=<widget.token>
 *       → { default: { rankedList: [ TOP, RISING ] } }
 * 这条路不依赖滚动、不依赖可见性、不依赖懒加载，也不依赖抓包时序，是目前唯一
 * 稳定的 related 取数路径（dataPath: rest）。DOM 解析保留成最后兜底（dataPath: dom），
 * 但在隐藏标签页里它基本永远是空的，不再为它付滚动/等待的时间。
 *
 * 实测确认的三个 rpcid（higgsfield/manus 两词，多次真实请求验证）：
 *   qrLOJd  地区热度分布——**不走抓包，走 DOM 解析**（见上）
 *   g4kJzf  热度对比曲线——抓包路由，通常在 settle 等待期间已经发出
 *   fXqlme  相关查询（top + rising）——**在隐藏标签页里永远不会发出**（挂在
 *           IntersectionObserver 上，见上）。改走旧版 REST 接口，本脚本不再抓这个 rpcid
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
// === 页内等待的硬规则【实测，2026-09-09】===
// 标签页是隐藏的（见文件头），隐藏超过 5 分钟后 Chrome 把 setTimeout 压到 1 次/分钟。
// 所以**任何等待都必须放在 Node 侧**（msleep）：页内 eval 一律写成同步的、立刻返回的，
// 绝不在 eval 里 `await new Promise(r=>setTimeout(...))` 循环——那必然撞 opencli 的
// 115s CDP 硬超时，连现场状态都读不回来（上一版 related 每次失败要烧近 3 分钟就是这个）。
const SCROLL_WAIT_MS = 2500;
// related 走 REST 路：单次 eval 的超时 + 重试轮数。整条命令（开页 + 取数）预算 ≤ 45s。
const REST_EVAL_TIMEOUT_MS = 25_000;
const REST_TRIES = 2;
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

function openExploreWithCapture(session, url, { settleMs = SETTLE_MS } = {}) {
  const commands = JSON.stringify([
    { cmd: "open", args: { url } },
    { cmd: "eval", args: { js: INSTALL_CAPTURE_JS } },
  ]);
  try {
    opencliRaw(["browser", session, "--window", "foreground", "batch", "--commands", commands]);
    openAttempted = true;
    // settle 等待放在 **Node 侧**：页内 `setTimeout` 在隐藏标签页里会被 Chrome 的
    // intensive throttling 压到 1 次/分钟（【实测】），上一版把它写成页内定时器，
    // 于是一个 4 秒的 settle 有时要等 60 秒，还会把整条 eval 拖进 CDP 硬超时。
    if (settleMs > 0) msleep(settleMs);
  } catch (e) {
    const msg = (e.stderr || e.message || "").toString();
    fail("opencli-open-failed", `打开 explore 页失败：${msg.trim().slice(0, 400)}`, { stderr: msg.slice(0, 2000) });
  }
}

/**
 * === 就绪探测（诊断用，非阻塞）===【新增，2026-09-12 实测后加固】
 *
 * 背景：本脚本在 `settleMs: 0` 的两个调用点（compare/related 的首轮 REST）open 页面后
 * 零等待就直接打 REST，理论风险是页面 session/cookie/token 还没建立、REST 会返回
 * 结构合法但数据为空的响应。2026-09-12 用 5 个真实场景（英文热词、意大利语、阿拉伯语、
 * related、region）实测：**5/5 首轮 REST 就拿到非空数据，openRounds/restTries 全部
 * 等于 1**，settleMs:0 没有触发过一次「假空」。之所以安全：REST 走的是同源 fetch
 * （`credentials:"include"`），只需要浏览器已经带着登录态 cookie 落在 trends.google.com
 * 这个origin 上就能发起请求并拿到服务器计算好的 token/数据，不依赖页面把 widget
 * 渲染出来或者 JS bundle 跑完——`settleMs:0` 省掉的 4 秒 sleep 本来就是在等
 * **前端渲染**，跟 REST 请求能不能成功没有因果关系。
 *
 * 保留的安全网：runCaptureQuery / runRelated 里已有的「REST 返回空 → 重开整页
 * （settleMs 恢复正常）再打一次」逻辑（2026-09-10 加）覆盖了万一真的撞上没就绪的
 * 极端情况，不依赖这个探测函数做拦截。
 *
 * 下面这个探测函数只做**诊断记录**，不参与控制流、不阻塞、不重试：读一次输入框的
 * value（页面把 URL 里的关键词回填进去，代表查询已被页面处理）和 body 文本里有没有
 * "Download CSV"（widget 数据加载完成的标志），单次 eval，超时 5s 也不重试，失败就
 * 返回 null。结果写进 manifest 的 readyProbe 字段，供以后如果哪天 5/5 变成 3/5 时
 * 判读用——不会因为探测结果不理想就改变本次请求的行为。
 */
const READY_PROBE_JS = `(()=>{
  try {
    var inputs = document.querySelectorAll('input[type="text"], input:not([type])');
    var inputValue = null;
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value && inputs[i].value.length > 1) { inputValue = inputs[i].value.slice(0, 80); break; }
    }
    var text = document.body ? document.body.innerText : "";
    return { inputValue: inputValue, hasDownloadCsv: text.indexOf("Download CSV") !== -1 };
  } catch (e) {
    return { error: String(e && e.message || e) };
  }
})()`;

function quickReadyProbe(session) {
  try {
    return firstJson(opencliRaw(["browser", session, "eval", READY_PROBE_JS], { timeout: 5000 }));
  } catch {
    return null; // 诊断性探测，失败不影响主流程，也不重试
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
 * === 滚动，2026-09-09 四次修订：只剩「同步滚一次」，不再有滚动等待循环 ===
 *
 * 【实测】新版 Explore 页的 `<html>` 根本不滚动
 * （`document.scrollingElement.scrollHeight === clientHeight`），真正的滚动容器是页面
 * 内部一个 `overflow-y:auto` 的 div（本机实测类名 `Jh24Ne`，scrollHeight 2036 /
 * clientHeight 636-692）。opencli 的 `scroll` 命令滚的是窗口/根元素，对这一页无效。
 *
 * 但**光找对容器还不够**，这是之前三轮都卡死的地方：该容器的 `scroll-behavior` 计算值是
 * `smooth`，平滑滚动动画由渲染生命周期驱动，而 opencli 标签页是 `visibilityState:"hidden"`
 * 的，渲染生命周期整个停摆（rAF 一次都不回调）——于是 `pane.scrollTop = pane.scrollHeight`
 * 赋值后**同步读回来仍然是 0**，看起来就像「滚不动」。修法是先把 `style.scrollBehavior`
 * 强制成 `"auto"`：【实测】同一行赋值立刻生效，scrollTop 从 0 变成 1400.5（到底）。
 *
 * 第二条硬规则：eval 里**不准有 setTimeout 等待**（见上方常量区注释）。所以这个函数是
 * 纯同步的一次性调用，需要等就由 Node 侧 msleep 之后再调一次。
 *
 * 注意：滚动只能让块的 DOM 骨架进入视口，**不能**让它加载数据——数据挂在
 * IntersectionObserver 上，隐藏标签页里永远不回调。滚动现在只用来让 region 的表格
 * 和截图证据好看一点，不再承担「触发懒加载」的职责。
 */
const SCROLL_PANES_JS = `(()=>{
  var out = [], all = document.querySelectorAll("div,main,section");
  for (var i = 0; i < all.length; i++) {
    var e = all[i];
    if (e.scrollHeight <= e.clientHeight + 50) continue;
    var s = getComputedStyle(e);
    if (s.overflowY !== "auto" && s.overflowY !== "scroll") continue;
    e.style.scrollBehavior = "auto";      // 关键：不改成 auto，隐藏标签页里 scrollTop 永远回弹到 0
    e.scrollTop = e.scrollHeight;
    out.push({ top: Math.round(e.scrollTop), height: e.scrollHeight });
  }
  var se = document.scrollingElement;
  if (se && se.scrollHeight > se.clientHeight + 50) {
    se.style.scrollBehavior = "auto";
    se.scrollTop = se.scrollHeight;
    out.push({ top: Math.round(se.scrollTop), height: se.scrollHeight });
  }
  return { panes: out.length, moved: out.some(function(p){ return p.top > 0; }),
    top: out.reduce(function(a,p){ return Math.max(a, p.top); }, 0),
    height: out.reduce(function(a,p){ return Math.max(a, p.height); }, 0) };
})()`;

/** 把所有可滚动容器同步滚到底。永远不抛；返回 { scrolled, top, height, panes }。 */
function scrollPanesToBottom(session) {
  try {
    const r = firstJson(opencliRaw(["browser", session, "eval", SCROLL_PANES_JS], { timeout: 30_000 }));
    return { scrolled: !!r?.moved, top: r?.top ?? null, height: r?.height ?? null, panes: r?.panes ?? 0 };
  } catch {
    return { scrolled: false, top: null, height: null, panes: 0 };
  }
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
function runCaptureQuery(kws, opts, { rpcid }) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  const kwSlug = kws.join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "kw";
  let stopReason = "completed";
  let decoded = null;
  let capturedVia = null;
  let openRounds = 0;
  let restBody = null;
  let restErr = null;
  let dataPath = "capture";
  let readyProbe = null; // 诊断字段，见 quickReadyProbe 注释；不参与控制流
  // 抓包壳子装的时机跟页面自己发这个 widget 请求的时机是一场赛跑：多数情况下壳子能
  // 在请求发出前装好，但【实测，2026-09-09】即使同一个查询、同一套代码，个别整页
  // 加载会在壳子装好前就把请求发完（怀疑是 JS bundle 命中浏览器缓存、执行快到抢先），
  // 表现为「反复调大超时也没用，但整页重开常常就好」——所以重试策略是**重开整页**
  // 而不是加长单次等待。4 轮下（每轮独立同分布地"抢先"的概率若约 50%）失败概率
  // 压到 6% 左右，足够实用；仍然失败就如实把 openRounds/scrolled 记进 manifest，
  // 交给证据判读，不由脚本自己下"没有数据"的结论。
  // related 已经有自己的生命周期（runRelated，抓包 + DOM 同一次滚动里一起探），
  // 这里实际只服务 compare（g4kJzf，非懒加载，单轮便宜，多给几轮）。
  const MAX_OPEN_ROUNDS = 4;
  try {
    // === REST 主路【2026-09-09 四次修订】===
    // 抓包路由跟 related 踩的是同一个坑：隐藏标签页渲染生命周期停摆，widget 的请求
    // 可能压根不发（本轮实测 compare 连开 4 轮整页、capturedVia 全 null）。旧版
    // /trends/api/widgetdata/multiline 在同一个页面上下文里同源打就能拿到完整曲线，
    // 不依赖页面有没有把 widget 渲染出来，所以改成 REST 优先、抓包兜底。
    openExploreWithCapture(session, url, { settleMs: 0 });
    openRounds = 1;
    // 就绪探测：诊断用，不阻塞、不影响下面的 REST 调用，见 quickReadyProbe 注释。
    readyProbe = quickReadyProbe(session);
    const rest = fetchRestWidget(session, kws, geo, timeframe, opts, "TIMESERIES", "multiline");
    // === 空结果校验【新增，2026-09-10】===
    // 旧逻辑只看 rest.ok（HTTP/解析成功就算数），但「200 + 能 parse」不等于「里面真有
    // 数据」——token 刚生成、页面还没完全稳定时，Google 有时会回一个结构合法但
    // timelineData 是空数组的响应。旧逻辑遇到这种情况会直接把 dataPath 标成 "rest" 并
        // return，调用方看到 rows.length===0 就直接判「无数据」退出，一次重试都没有——
    // 这正是「浏览器里明明看到有数据，脚本却报 no data」的根因之一。现在先把 timeline
    // 解出来验证非空，验证通过才当作成功返回；否则当作一次失败，往下走重试路径。
    let restTimeline = [];
    if (rest.ok) {
      try {
        restTimeline = JSON.parse(rest.body)?.default?.timelineData || [];
      } catch { restTimeline = []; }
    }
    if (rest.ok && restTimeline.length) {
      restBody = rest.body;
      restErr = null;
      try {
        writeFileSync(join(dir, "raw-multiline.json"), rest.body + "\n");
      } catch { /* 落盘失败不影响判读 */ }
      try {
        writeFileSync(join(dir, `trends-${kwSlug}.json`), JSON.stringify({ keywords: kws, geo, timeframe, dataPath: "rest", restBody: JSON.parse(rest.body) }, null, 2) + "\n");
      } catch { /* 同上 */ }
      dataPath = "rest";
      return { decoded: null, restBody, dataPath, geo, timeframe, evidenceDir: dir, session, capturedVia: null };
    }
    restErr = rest.ok ? "REST 返回 200 但 timelineData 为空（很可能是页面/token 尚未就绪，不代表真的没有数据）" : rest.err;

    // 重开一次整页再试一次 REST，比直接判空更可靠，也比掉到抓包轮询更快（REST 通常
    // 1-2.5s，抓包轮询单轮就要等到 8s 超时）。这一步就是「重试页面加载而不只是重新
    // 轮询」的落地：见文件头/任务要求。
    openRounds++;
    openExploreWithCapture(session, url, { settleMs: SETTLE_MS });
    const rest2 = fetchRestWidget(session, kws, geo, timeframe, opts, "TIMESERIES", "multiline");
    let restTimeline2 = [];
    if (rest2.ok) {
      try {
        restTimeline2 = JSON.parse(rest2.body)?.default?.timelineData || [];
      } catch { restTimeline2 = []; }
    }
    if (rest2.ok && restTimeline2.length) {
      restBody = rest2.body;
      restErr = null;
      try {
        writeFileSync(join(dir, "raw-multiline.json"), rest2.body + "\n");
      } catch { /* 落盘失败不影响判读 */ }
      try {
        writeFileSync(join(dir, `trends-${kwSlug}.json`), JSON.stringify({ keywords: kws, geo, timeframe, dataPath: "rest", restBody: JSON.parse(rest2.body) }, null, 2) + "\n");
      } catch { /* 同上 */ }
      dataPath = "rest";
      return { decoded: null, restBody, dataPath, geo, timeframe, evidenceDir: dir, session, capturedVia: null };
    }
    restErr = rest2.ok
      ? "重开页面后 REST 仍然返回空 timelineData（两轮都空，大概率是这个词/范围真的没有数据，而非脚本故障）"
      : (rest2.err || restErr);

    let cap = null;
    while (!cap && openRounds < MAX_OPEN_ROUNDS) {
      openRounds++;
      openExploreWithCapture(session, url);
      // g4kJzf 不靠滚动触发，靠等：一次性给够时间窗，等不到就整页重开（见上），
      // 而不是死等更久——死等对"被抢跑"的场景没用。
      cap = pollCapture(session, rpcid, { timeoutMs: 8000, intervalMs: 800 });
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
    return { decoded, restBody, dataPath, geo, timeframe, evidenceDir: dir, session, capturedVia };
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
        // rest = 旧版 REST 接口（主路）；capture = batchexecute 抓包兜底
        dataPath,
        restErr,
        keywords: kws,
        geo,
        timeframe,
        session,
        exploreUrl: url,
        rpcid,
        capturedVia,
        openRounds,
        scrolled: null,
        lazyBlocksLoaded: null,
        readyProbe, // 诊断字段：settleMs:0 之后页面就绪信号的一次性快照，见 quickReadyProbe
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
  let dataPath = "dom";
  let restTries = 0;
  let restErr = null;
  try {
    // region 不需要抓包壳子，但仍走同一个 open 入口，保持行为一致（前台窗口）；
    // 第二个 eval（装抓包壳子）对 region 无害地空跑。
    openExploreWithCapture(session, url);
    scrolled = scrollPanesToBottom(session).scrolled;

    // === REST 主路：/trends/api/widgetdata/comparedgeo【2026-09-09 四次修订】===
    // DOM 路要靠页面把地区表格渲染出来 + 点「Go to next page」翻页，一次只能拿 5 行，
    // 而且在隐藏标签页里随时可能是空的。REST 一次就把**全部**地区拿回来，
    // 语义跟 DOM 完全一致（多关键词时 value 也是「同地区内的相对份额，和为 100」）。
    // --resolution 通过 reqPatch 直接改 widget.request.resolution，
    // 取值 COUNTRY / REGION / CITY（旧版归档脚本同款命名）。
    const resMap = { country: "COUNTRY", region: "REGION", city: "CITY" };
    const reqPatch = opts.resolution ? { resolution: resMap[String(opts.resolution).toLowerCase()] || String(opts.resolution).toUpperCase() } : null;
    const rest = fetchRestWidget(session, kws, geo, timeframe, opts, "GEO_MAP", "comparedgeo", { reqPatch });
    restTries = rest.tries;
    restErr = rest.err;
    if (rest.ok) {
      let geoRows = [];
      try {
        geoRows = JSON.parse(rest.body)?.default?.geoMapData || [];
      } catch { geoRows = []; }
      for (const g of geoRows) {
        if (!g?.geoCode) continue;
        const values = new Map();
        kws.forEach((k, i) => values.set(k, Number(g.value?.[i] ?? 0)));
        seen.set(g.geoCode, { name: g.geoName || g.geoCode, values });
      }
      if (seen.size) {
        dataPath = "rest";
        try {
          writeFileSync(join(dir, "raw-comparedgeo.json"), rest.body + "\n");
        } catch { /* 落盘失败不影响判读 */ }
        return { seen, geo, timeframe, evidenceDir: dir, session };
      }
    }

    // === 空结果重试【新增，2026-09-10】===
    // 跟 compare 同一个坑：REST 200 + 能 parse，但 geoMapData 是空数组，不等于「真的没有
    // 地区数据」，也可能是页面/token 还没就绪。直接掉进下面的 DOM 兜底之前，先整页重开
    // 一次再打一遍 REST——这条路比等 DOM 表格渲染快得多，也更可靠。
    if (!seen.size) {
      restErr = restErr || "REST 返回 200 但 geoMapData 为空（可能是页面/token 尚未就绪，不代表真的没有数据）";
      openExploreWithCapture(session, url, { settleMs: SETTLE_MS });
      scrolled = scrollPanesToBottom(session).scrolled || scrolled;
      const rest2 = fetchRestWidget(session, kws, geo, timeframe, opts, "GEO_MAP", "comparedgeo", { reqPatch });
      restTries += rest2.tries;
      if (rest2.ok) {
        let geoRows2 = [];
        try {
          geoRows2 = JSON.parse(rest2.body)?.default?.geoMapData || [];
        } catch { geoRows2 = []; }
        for (const g of geoRows2) {
          if (!g?.geoCode) continue;
          const values = new Map();
          kws.forEach((k, i) => values.set(k, Number(g.value?.[i] ?? 0)));
          seen.set(g.geoCode, { name: g.geoName || g.geoCode, values });
        }
        if (seen.size) {
          dataPath = "rest";
          try {
            writeFileSync(join(dir, "raw-comparedgeo.json"), rest2.body + "\n");
          } catch { /* 落盘失败不影响判读 */ }
          return { seen, geo, timeframe, evidenceDir: dir, session };
        }
        restErr = "重开页面后 REST 仍然返回空 geoMapData（两轮都空，大概率是这个词/范围真的没有地区数据）";
      } else {
        restErr = rest2.err || restErr;
      }
    }

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
        // rest = 旧版 REST 接口（主路，一次拿全量）；dom = 表格 DOM + 翻页兜底
        dataPath,
        restTries,
        restErr,
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
  const { decoded, restBody, dataPath, geo, timeframe, evidenceDir } = runCaptureQuery(kws, opts, { rpcid: "g4kJzf" });

  // === REST 主路：/trends/api/widgetdata/multiline ===
  // 结构【实测，2026-09-09】：{default:{timelineData:[{time:"<epoch秒>", formattedTime,
  // value:[每个关键词一个 0-100 整数], hasData:[...], formattedValue:[...]}, ...]}}
  // 关键词顺序与请求里的 comparisonItem 顺序一致，直接按下标取。
  if (dataPath === "rest") {
    let timeline = [];
    try {
      timeline = JSON.parse(restBody)?.default?.timelineData || [];
    } catch { timeline = []; }
    const rows = timeline.map((pt) => [
      pt.time ? new Date(Number(pt.time) * 1000).toISOString().slice(0, 10) : (pt.formattedAxisTime || ""),
      ...kws.map((_, i) => (pt.value?.[i] == null ? "" : String(pt.value[i]))),
    ]);
    if (!rows.length) widgetEmptyExit(evidenceDir, "热度对比曲线（multiline，REST）");
    printCompare(kws, geo, timeframe, rows);
    return;
  }

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
  printCompare(kws, geo, timeframe, rows);
}

/** compare 的输出（REST 主路与抓包兜底共用，两条路解析出来的 rows 形状一样）。 */
function printCompare(kws, geo, timeframe, rows) {
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
 * === related 主路：旧版 REST 接口（dataPath: rest）【实测，2026-09-09 四次修订】===
 *
 * 新版页面的相关查询 widget（rpcid `fXqlme`）挂在 IntersectionObserver 上，而 opencli
 * 标签页是隐藏的、渲染生命周期停摆，IO 永远不回调 —— 所以它在自动化里**永远拿不到**
 * （完整根因见文件头）。但旧版那对 REST 接口在 trends.google.com 的页面上下文里
 * **依然可用**（同源 fetch，带用户已登录的 cookie）：
 *
 *   1) GET /trends/api/explore?hl=en-US&tz=0&req=<JSON>
 *      req = {comparisonItem:[{keyword, geo, time}], category, property}
 *      响应带 `)]}'` 前缀，去掉后是 {widgets:[{id, request, token}, ...]}，
 *      取 id === "RELATED_QUERIES" 的那个。
 *   2) GET /trends/api/widgetdata/relatedsearches?hl=en-US&tz=0&req=<widget.request>&token=<widget.token>
 *      响应同样带前缀，去掉后是 { default: { rankedList: [ TOP, RISING ] } }。
 *
 * 【实测，higgsfield / manus 各 5 次，10/10 成功，单次 1.0-2.5 秒】rankedList 恒为 2 条，
 * **下标 0 = Top queries**（formattedValue 是 0-100 的整数，如 "100"/"13"），
 * **下标 1 = Rising queries**（formattedValue 是 "Breakout" 或 "+3,450%"）——
 * 语义由数据本身自证，并与页面上「Top queries / Rising queries」两块标题对得上。
 *
 * 注意：这条路**只解决 related**。旧版 RELATED_TOPICS 仍然恒回空（接口把脚本会话标成
 * USER_TYPE_SCRAPER），跟归档版记录一致，本命令不提供相关主题。
 */
/**
 * 通用：在 trends.google.com 的页面上下文里打旧版那对 REST 接口，取某个 widget 的原始响应。
 *
 *   1) GET /trends/api/explore?hl=en-US&tz=0&req=<JSON>  → {widgets:[{id, request, token}, ...]}
 *   2) GET /trends/api/widgetdata/<path>?req=<widget.request>&token=<widget.token>
 *
 * 两个响应都带 `)]}'` 反 XSSI 前缀，去掉到第一个 `{` 为止即可 JSON.parse。
 * 全同步风格的 promise 链，页内没有任何 setTimeout（隐藏标签页里定时器会被压到
 * 1 次/分钟，见常量区注释）。失败统一 catch 成 {ok:false, err}，不让 eval 抛。
 *
 * widgetId / path 的对应【实测，2026-09-09】：
 *   TIMESERIES      → multiline        （热度曲线，compare）
 *   GEO_MAP         → comparedgeo      （地区分布，region）
 *   RELATED_QUERIES → relatedsearches  （相关查询，related）
 * RELATED_TOPICS（相关主题）仍然恒回空 rankedList，跟归档版记录一致，本脚本不用它。
 */
function restWidgetJs(kws, geo, timeframe, opts, widgetId, path, reqPatch = null) {
  const req = {
    comparisonItem: kws.map((k) => ({ keyword: k, geo: geo || "", time: timeframe })),
    category: Number(opts.category) || 0,
    property: normalizeProperty(opts.property),
  };
  const exploreApi =
    "https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=" +
    encodeURIComponent(JSON.stringify(req));
  return `(function(){
  function strip(t){ var i = t.indexOf("{"); return i < 0 ? t : t.slice(i); }
  return fetch(${JSON.stringify(exploreApi)}, {credentials:"include"})
    .then(function(r){ if(!r.ok) throw new Error("explore HTTP " + r.status); return r.text(); })
    .then(function(t){
      var d = JSON.parse(strip(t));
      var w = (d.widgets || []).filter(function(x){ return x.id === ${JSON.stringify(widgetId)}; })[0];
      if (!w) throw new Error("explore 响应里没有 ${widgetId} widget");
      var patch = ${JSON.stringify(reqPatch)};
      if (patch) for (var k in patch) w.request[k] = patch[k];
      var u2 = "https://trends.google.com/trends/api/widgetdata/${path}?hl=en-US&tz=0&req="
        + encodeURIComponent(JSON.stringify(w.request)) + "&token=" + encodeURIComponent(w.token);
      return fetch(u2, {credentials:"include"}).then(function(r2){
        if (!r2.ok) throw new Error("${path} HTTP " + r2.status);
        return r2.text();
      });
    })
    .then(function(t2){ return {ok:true, body: strip(t2)}; })
    .catch(function(e){ return {ok:false, err: String((e && e.message) || e)}; });
})()`;
}

/**
 * 跑 restWidgetJs，最多 tries 次（重试之间在 **Node 侧** msleep）。永远不抛。
 * 返回 { ok, body, err, tries }。
 */
function fetchRestWidget(session, kws, geo, timeframe, opts, widgetId, path, { tries = REST_TRIES, reqPatch = null } = {}) {
  const js = restWidgetJs(kws, geo, timeframe, opts, widgetId, path, reqPatch);
  let err = null;
  let used = 0;
  while (used < tries) {
    used++;
    let r = null;
    try {
      r = firstJson(opencliRaw(["browser", session, "eval", js], { timeout: REST_EVAL_TIMEOUT_MS }));
    } catch (e) {
      err = `eval 失败/超时：${String(e?.message || e).slice(0, 200)}`;
    }
    if (r?.ok && r.body) return { ok: true, body: r.body, err: null, tries: used };
    if (r && r.ok === false) err = String(r.err || "unknown").slice(0, 300);
    if (used < tries) msleep(1500);
  }
  return { ok: false, body: null, err, tries: used };
}

/**
 * 把 relatedsearches 的响应体解成两张表。
 * 【实测】rankedList[0] = Top（formattedValue 是 0-100 整数），[1] = Rising（Breakout/百分比）。
 * 取 formattedValue 而不是 value：Rising 的 value 是原始涨幅整数（Breakout 时是哨兵大数），
 * formattedValue 才是页面上真正显示的那个字符串，直接可读、也不需要再猜封顶阈值。
 */
function parseRelatedRest(body) {
  let d;
  try {
    d = JSON.parse(body);
  } catch (e) {
    fail("rest-decode-failed", `解析 relatedsearches 响应失败：${String(e.message || e).slice(0, 200)}`, { head: String(body).slice(0, 300) });
  }
  const lists = d?.default?.rankedList || [];
  const pick = (i) =>
    (lists[i]?.rankedKeyword || [])
      .map((k) => [String(k.query ?? ""), String(k.formattedValue ?? k.value ?? "")])
      .filter((r) => r[0]);
  return { top: pick(0), rising: pick(1) };
}

/**
 * DOM 兜底（dataPath: dom）：REST 两次都失败时才走。锚点是数值单元格上的 data-* 属性
 * （`<div class="GaWfqe" aria-label="Search interest: 100" data-query="ai"
 * data-search-interest="100">`），按 `[data-query][data-search-interest]` 找行，
 * 天然跳过表头与 `aria-live` 占位行。Top / Rising 的归属用页面上的区块标题文字判定。
 *
 * 【实测，本轮】在隐藏标签页里这条路基本恒空——块的骨架挂载了，数据永远不来。
 * 保留它只是为了「万一哪天标签页真的是可见的」，而且它只是一次同步 eval，成本可忽略，
 * **不再为它做任何滚动等待循环**。
 */
const RELATED_DOM_PROBE_JS = `(()=>{
function __sect(re){
  var h = [].slice.call(document.querySelectorAll("h3")).filter(function(e){ return re.test(e.textContent); })[0];
  if (!h) return null;
  var n = h.parentElement;
  for (var j = 0; j < 8 && n; j++) { if (n.querySelector("table")) break; n = n.parentElement; }
  return n;
}
function __rows(n){
  if (!n) return [];
  return [].slice.call(n.querySelectorAll("tr")).map(function(tr){
    var d = tr.querySelector("[data-query][data-search-interest]");
    if (!d) return null;
    var tds = tr.querySelectorAll("td");
    return {
      query: d.getAttribute("data-query"),
      value: d.getAttribute("data-search-interest"),
      change: (tds[3] ? tds[3].innerText : "").replace(/\\s+/g, " ").replace(/^(south|north)\\s*/, "").trim()
    };
  }).filter(Boolean);
}
var __t = __rows(__sect(/Top queries/i)), __g = __rows(__sect(/Rising queries/i));
return { top: __t, rising: __g,
  h3: [].slice.call(document.querySelectorAll("h3")).map(function(e){ return e.textContent.trim(); }) };
})()`;

/**
 * related 的完整生命周期【2026-09-09 四次修订】：
 *   开页（同时装抓包壳子，纯粹是为了跟 compare 共用一个入口）→ 同步滚一次（只为截图证据）
 *   → REST 取数（最多 REST_TRIES 次，每次一个 eval）→ 还不行才做一次 DOM 兜底探测
 *   → 落证据 → 关会话。
 * 预算：开页 ~20s + settle 4s + REST 1-3s ≈ 30s；最坏（REST 两次都超时）也被
 * `REST_EVAL_TIMEOUT_MS` 卡住，整条命令不会像上一版那样一失败就烧掉近 3 分钟。
 */
function runRelated(kws, opts) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  const kwSlug = kws.join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "kw";

  let stopReason = "completed";
  let dataPath = "none";
  let restTries = 0;
  let restErr = null;
  let scrolled = false;
  let domH3 = null;
  let readyProbe = null; // 诊断字段，见 quickReadyProbe 注释；不参与控制流
  const sections = { top: [], rising: [] };
  const t0 = Date.now();
  try {
    // related 走 REST，只需要「页面已经落在 trends.google.com 同源上下文」，
    // 不需要等 widget 起来，所以 settle 直接给 0（省掉 4 秒）。【实测，2026-09-12】
    // 5 次真实场景重跑（含 related 本身）里首轮 REST 都是非空——settleMs:0 没有暴露过
    // 「页面未就绪导致假空」的问题，见 quickReadyProbe 顶部的完整说明。
    openExploreWithCapture(session, url, { settleMs: 0 });
    readyProbe = quickReadyProbe(session); // 诊断用，不阻塞、不改变下面的取数路径
    scrolled = scrollPanesToBottom(session).scrolled;

    const rest = fetchRestWidget(session, kws, geo, timeframe, opts, "RELATED_QUERIES", "relatedsearches");
    restTries = rest.tries;
    restErr = rest.err;
    if (rest.ok) {
      try {
        writeFileSync(join(dir, "raw-relatedsearches.json"), rest.body + "\n");
      } catch { /* 落盘失败不影响判读，manifest 会记录 */ }
      const parsed = parseRelatedRest(rest.body);
      if (parsed.top.length || parsed.rising.length) {
        sections.top = parsed.top;
        sections.rising = parsed.rising;
        dataPath = "rest";
      } else {
        restErr = "REST 返回了合法响应但两张榜都是空的（Google 侧没给数据）";
      }
    }

    if (dataPath === "none") {
      // === 空结果重试【新增，2026-09-10】===
      // 同一个坑：REST 200 + 能 parse，但两张榜都是空，不等于「这个词真的没有相关查询」，
      // 也可能是页面/token 还没就绪。掉进 DOM 兜底（在隐藏标签页里基本恒空，见文件头）
      // 之前，先整页重开一次再打一遍 REST——这一步比 DOM 兜底更可能救回真实数据。
      openExploreWithCapture(session, url, { settleMs: SETTLE_MS });
      scrolled = scrollPanesToBottom(session).scrolled || scrolled;
      const rest2 = fetchRestWidget(session, kws, geo, timeframe, opts, "RELATED_QUERIES", "relatedsearches");
      restTries += rest2.tries;
      if (rest2.ok) {
        try {
          writeFileSync(join(dir, "raw-relatedsearches-retry.json"), rest2.body + "\n");
        } catch { /* 落盘失败不影响判读 */ }
        const parsed2 = parseRelatedRest(rest2.body);
        if (parsed2.top.length || parsed2.rising.length) {
          sections.top = parsed2.top;
          sections.rising = parsed2.rising;
          dataPath = "rest";
        } else {
          restErr = "重开页面后 REST 仍然返回空榜（两轮都空，大概率是这个词真的没有相关查询数据，而非脚本故障）";
        }
      } else {
        restErr = rest2.err || restErr;
      }
    }

    if (dataPath === "none") {
      // 一次性 DOM 兜底探测（同步 eval，不做任何滚动等待循环）。
      try {
        const dom = firstJson(opencliRaw(["browser", session, "eval", RELATED_DOM_PROBE_JS], { timeout: 30_000 }));
        domH3 = dom?.h3 ?? null;
        const t = (dom?.top || []).map((r) => [String(r.query), String(r.value ?? ""), r.change || ""]);
        const g = (dom?.rising || []).map((r) => [String(r.query), String(r.value ?? ""), r.change || ""]);
        if (t.length || g.length) {
          sections.top = t;
          sections.rising = g;
          dataPath = "dom";
        }
      } catch { /* DOM 兜底失败就保持 none，证据目录里有截图 */ }
    }

    try {
      writeFileSync(
        join(dir, `trends-${kwSlug}.json`),
        JSON.stringify({ keywords: kws, geo, timeframe, dataPath, sections, restTries, restErr }, null, 2) + "\n",
      );
    } catch { /* 同上 */ }
    return { sections, dataPath, geo, timeframe, evidenceDir: dir, session, restErr };
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
        // rest = 旧版 REST 接口（主路）；dom = 页面表格兜底；none = 两条都没拿到。
        dataPath,
        keywords: kws,
        geo,
        timeframe,
        session,
        exploreUrl: url,
        restEndpoint: "/trends/api/widgetdata/relatedsearches",
        restTries,
        restErr,
        // scrolled 只说明「滚动容器动了」，跟能不能取到数已经没有因果关系了
        // （related 走 REST，不依赖滚动）——留着是为了对拍截图里看到的画面。
        scrolled,
        // 新版懒加载块在隐藏标签页里永远不会加载数据（IntersectionObserver 不回调），
        // 所以这一项现在只反映「DOM 兜底有没有读到行」，正常情况下就是 false。
        lazyBlocksLoaded: dataPath === "dom",
        domH3,
        readyProbe, // 诊断字段：settleMs:0 之后页面就绪信号的一次性快照，见 quickReadyProbe
        topRows: sections.top.length,
        risingRows: sections.rising.length,
        elapsedMs: Date.now() - t0,
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

function cmdRelated(kws, opts) {
  if (kws.length !== 1) die("related 只支持单个关键词");
  const { sections, dataPath, geo, timeframe, evidenceDir, restErr } = runRelated(kws, opts);

  if (!sections.top.length && !sections.rising.length) {
    widgetEmptyExit(
      evidenceDir,
      "相关查询（/trends/api/widgetdata/relatedsearches）",
      `相关查询为空——REST 主路和 DOM 兜底都没取到${restErr ? `（最后一次失败：${restErr}）` : ""}。` +
        "先看 manifest 里的 restErr：HTTP 429/302 是 Google 侧限流（隔几分钟重试）；" +
        "「没有 RELATED_QUERIES widget」通常是这个词太冷、Google 本来就不给相关查询。" +
        "别直接读成零相关词。",
    );
  }

  console.log(`## 相关查询：${kws[0]}`);
  console.log(`\n> 范围：${geo || "全球"} · ${timeframe} · Top 是 0-100 相对搜索热度，Rising 是区间内涨幅（Breakout = 涨幅超出可测量范围）\n`);
  if (dataPath === "dom") {
    console.log("> 注：本次走 DOM 兜底取数（REST 接口没取到），数值来自页面渲染的 data-* 属性，只覆盖两张表的当前页（各 10 条）。\n");
  }
  const topN = Number(opts.top || 15);
  // 两张表的列义本来就不同，所以表头分开写，不硬凑成同一组列：
  // Top 是 0-100 的相对搜索热度，Rising 是涨幅（Breakout / +N%），没有可比性。
  const groups = [
    ["飙升 Rising（对应页面「Rising queries」区块，含 Breakout）", sections.rising, "growth"],
    ["高频 Top（对应页面「Top queries」区块，0-100 相对热度）", sections.top, "value"],
  ];
  for (const [label, list, valueHeader] of groups) {
    console.log(`### ${label}`);
    const rows = Array.isArray(list) ? list.slice(0, topN) : [];
    if (!rows.length) {
      console.log("（无数据）\n");
      continue;
    }
    // DOM 兜底给的是 3 列（query / value / change），REST 主路给 2 列。
    const headers = rows[0].length >= 3 ? ["query", "value", "change"] : ["query", valueHeader];
    console.log(mdTable(headers, rows));
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
        "取数机制：compare 抓页面自身发出的 batchexecute 请求（fetch/XHR 抓包壳子）；",
        "region 直接解析地区表格 DOM；related 在页面上下文里打旧版 REST 接口",
        "（/trends/api/explore + /trends/api/widgetdata/relatedsearches，见脚本头注释）。",
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
