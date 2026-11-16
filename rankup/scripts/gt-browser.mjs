#!/usr/bin/env node
/**
 * gt-browser — Google Trends 旧版 Explore 页的 OpenCLI 取数（2026-10-01）。
 * compare / region / related 在 /trends/explore 页内同源调用旧版 REST。
 * 不再使用新版 RPC / DOM 兜底；失败明确报错。Oops、HTTP 429/302 最多
 * 三轮整页加载，重试前等待 30 / 60 秒；Google 明示数据不足记为 no-data。
 * 参数保持兼容，--help 查看用法。依赖用户 Chrome 与 OpenCLI 浏览器桥。
 */

import { execFileSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { newEvidenceDir, captureScene, writeManifest, msleep } from "./lib-scene.mjs";

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

const EXPLORE_URL = "https://trends.google.com/trends/explore?hl=en-US";
const OPENCLI = process.env.GT_OPENCLI ?? "opencli";

const PROPERTY_ALIASES = { web: "", "": "", images: "images", image: "images", news: "news", youtube: "youtube", yt: "youtube", shopping: "froogle", froogle: "froogle" };
function normalizeProperty(p) {
  if (p === undefined || p === null) return "";
  const key = String(p).toLowerCase();
  if (!(key in PROPERTY_ALIASES)) die(`--property 只能是 web / images / news / youtube / shopping，收到：${p}`);
  return PROPERTY_ALIASES[key];
}

/** 旧版 URL 沿用 q / date / geo / cat / gprop / hl 编码。 */
function exploreUrlFor(keywords, geo, timeframe, opts = {}) {
  const u = new URL(EXPLORE_URL);
  if (opts.category && Number(opts.category)) u.searchParams.set("cat", String(Number(opts.category)));
  const gprop = normalizeProperty(opts.property);
  if (gprop) u.searchParams.set("gprop", gprop);
  if (timeframe) u.searchParams.set("date", timeframe);
  if (geo) u.searchParams.set("geo", geo);
  if (keywords?.length) u.searchParams.set("q", keywords.join(","));
  return u.toString();
}

const REST_EVAL_TIMEOUT_MS = 25_000;

const PRESETS = {
  "1h": "now 1-H",
  "4h": "now 4-H",
  "1d": "now 1-d",
  "24h": "now 1-d",
  "7d": "now 7-d",
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
  // Google rejects today 4-w; express 28 days explicitly instead of falling back to 12 months.
  if (t === "28d") {
    const end = new Date();
    return `${new Date(end.getTime() - 28 * 86400000).toISOString().slice(0, 10)} ${end.toISOString().slice(0, 10)}`;
  }
  if (PRESETS[t]) return PRESETS[t];
  if (t.includes(":")) return t.split(":").join(" ");
  return t;
}

function parseArgs(argv) {
  const kws = [];
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--rising-only") opts.risingOnly = true;
    else if (a === "--raw") opts.raw = true;
    else if (a === "--no-gpts") opts.noGpts = true;
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
  if (args[0] === "browser") {
    args = ["browser", "--session", args[1], ...args.slice(2)];
    const i = args.indexOf("--window");
    if (i >= 0 && !["foreground", "background"].includes(args[i + 1])) args[i + 1] = "background";
  }
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
    const value = JSON.parse(raw.slice(start));
    if (value && value.ok === true && Object.hasOwn(value, "data")) {
      if (typeof value.data === "string") { try { return JSON.parse(value.data); } catch { return value.data; } }
      return value.data;
    }
    return value;
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

function openExplore(session, url, attempts) {
  for (let retries = 0; retries <= 2; retries++) {
    try {
      openAttempted = true;
      opencliRaw(["browser", session, "--window", process.env.OPENCLI_WINDOW || "dedicated", "open", url]);
      msleep(4000);
      return;
    } catch (e) {
      const error = String(e.stderr || e.message);
      if (!error.includes("Navigation rejected") || retries === 2)
        fail("opencli-open-failed", `打开旧版 explore 页失败（重试 ${retries} 次）：${error.slice(0, 400)}`);
      attempts.push({ attempt: retries + 1, reason: "open: Navigation rejected", waitSeconds: 5 });
      msleep(5000);
    }
  }
}

// 按 widget 识别数据不足；整页 Oops 与其区分，文案来自用户截图和前台实测。
function pageState(session, widgetId) {
  const titles = { TIMESERIES: "Interest over", GEO_MAP: "Interest by", RELATED_QUERIES: "Related queries", RELATED_TOPICS: "Related topics" };
  return firstJson(opencliRaw(["browser", session, "eval", `(()=>{
    const text = document.body ? document.body.innerText : "";
    const widgets = [...document.querySelectorAll("widget")];
    const target = widgets.find(w => w.innerText.startsWith(${JSON.stringify(titles[widgetId] || widgetId)}));
    const errors = text.split("\\n").filter(t => /Oops|Something went wrong|Please try again in a bit/i.test(t));
    return { url: location.href, redirectedToNew: location.pathname === "/explore",
      captcha: location.pathname.includes("/sorry/") || !!document.querySelector("#captcha-form") || /unusual traffic|verify you are human|not a robot/i.test(text),
      visibilityState: document.visibilityState, widgetLoaded: widgets.length > 0,
      targetWidgetLoaded: !!target, targetText: target ? target.innerText.slice(0, 700) : "",
      noData: !!target && target.innerText.includes("Hmm, your search doesn't have enough data to show here."),
      oops: /Oops! Something went wrong\\.\\s+Please try again in a bit\\.?/i.test(text), summary: errors.join(" ") || (target ? target.innerText.slice(0, 700) : text.slice(-700)) };
  })()`], { timeout: 10_000 }));
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

/** REST 生命周期：只对已知可恢复失败整页重载，绝不改走另一条取数路。 */
function runRestQuery(kws, opts, widgetId, path, reqPatch = null) {
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const quiet = opts.evidence === "off";
  const dir = quiet ? opts.out : newEvidenceDir("gt-browser");
  const url = exploreUrlFor(kws, geo, timeframe, opts);
  const attempts = [];
  const t0 = Date.now();
  let stopReason = "completed", restErr = null, state = null, restBody = null, status = null;
  try {
    for (let attempt = 1; attempt <= (opts.restAttempts ?? 3); attempt++) {
      openExplore(session, url, attempts);
      state = pageState(session, widgetId);
      if (opts.batch && state.captcha) fail("captcha", "Google 验证码，停止采集");
      let rest = state.oops ? { ok: false, err: "页面显示 Oops / Something went wrong" }
        : fetchRestWidget(session, kws, geo, timeframe, opts, widgetId, path, { reqPatch });
      status = rest.status ?? null;
      state = pageState(session, widgetId);
      if (opts.batch && state.captcha) fail("captcha", "Google 验证码，停止采集");
      if (state.oops) rest = { ...rest, ok: false, err: "页面显示 Oops / Something went wrong" };
      if (state.redirectedToNew) rest = { ...rest, ok: false, err: "旧版页面被重定向到新版" };
      restErr = rest.err || null;
      const retry = status !== 400 && (state.oops || status === 429 || status === 302 || rest.redirected);
      const waitSeconds = !rest.ok && retry && attempt < (opts.restAttempts ?? 3) ? attempt * 30 : 0;
      attempts.push({ attempt, reason: restErr || "REST success", waitSeconds, status, page: state });
      if (!quiet) writeManifest(dir, { route: "old-explore", dataPath: "rest", attempts });
      if (!rest.ok) {
        if (waitSeconds) { msleep(waitSeconds * 1000); continue; }
        fail("rest-failed", `${restErr}; HTTP=${status ?? "unknown"}; redirectedToNew=${state.redirectedToNew}; widgetLoaded=${state.widgetLoaded}; targetWidgetLoaded=${state.targetWidgetLoaded}; 页面文案：${state.summary}`);
      }
      restBody = rest.body;
      writeFileSync(join(dir, quiet ? `${encodeURIComponent(kws[0])}-raw.json` : `raw-${path}.json`), restBody + "\n");
      const body = JSON.parse(restBody);
      const rows = path === "multiline" ? body.default?.timelineData : path === "comparedgeo" ? body.default?.geoMapData : body.default?.rankedList?.flatMap(x => x.rankedKeyword || []);
      if (!rows?.length) {
        if (state.noData || (opts.batch && path === "relatedsearches" && Array.isArray(body.default?.rankedList))) stopReason = "no-data";
        else fail("rest-empty-unconfirmed", `REST HTTP=${status} 返回空数据但目标 widget 未明示 no-data; redirectedToNew=${state.redirectedToNew}; widgetLoaded=${state.widgetLoaded}; targetWidgetLoaded=${state.targetWidgetLoaded}; 页面文案：${state.summary}`);
      }
      return { restBody, dataPath: "rest", geo, timeframe, evidenceDir: dir, session, attempts, noData: stopReason === "no-data" };
    }
  } catch (e) {
    stopReason = e.stopReason || "error";
    restErr = e.message;
    e.evidenceDir = dir;
    e.attempts = attempts;
    throw e;
  } finally {
    if (!quiet) evidenceScene(dir, session);
    try {
      if (!quiet) writeManifest(dir, { script: "gt-browser", route: "old-explore", dataPath: "rest", keywords: kws,
        geo, timeframe, session, exploreUrl: url, restEndpoint: `/trends/api/widgetdata/${path}`,
        attempts, restTries: attempts.filter(a => a.reason !== "open: Navigation rejected").length, restErr, status, page: state, stopReason,
        elapsedMs: Date.now() - t0, finishedAt: new Date().toISOString() });
    } catch { /* manifest 写不进也不能拦住关会话（沿用原行为） */ }
    if (!opts.keepSession) closeSession(session);
    else if (!opts.batch) console.error(`[gt-browser] 会话 ${session} 已保留，用完请 close。`);
  }
}

function runRegionQuery(kws, opts) {
  const resMap = { country: "COUNTRY", region: "REGION", city: "CITY" };
  const reqPatch = opts.resolution ? { resolution: resMap[String(opts.resolution).toLowerCase()] || String(opts.resolution).toUpperCase() } : null;
  const result = runRestQuery(kws, opts, "GEO_MAP", "comparedgeo", reqPatch);
  const seen = new Map();
  for (const g of JSON.parse(result.restBody).default?.geoMapData || []) {
    if (!g?.geoCode) continue;
    seen.set(g.geoCode, { name: g.geoName || g.geoCode, values: new Map(kws.map((k, i) => [k, Number(g.value?.[i] ?? 0)])) });
  }
  return { ...result, seen };
}

function widgetEmptyExit(evidenceDir, whatFor, reasonLine) {
  console.error(`[gt-browser] ${reasonLine ?? `${whatFor}为空。「接口没给数」与「该范围内搜索量不足」在此不可分辨——不要读成零需求。`}`);
  console.error(`[gt-browser] 证据：${evidenceDir}（raw-*.json 原始响应 + final.png/final.txt + manifest），判读以它们为准。`);
  process.exit(1);
}

function cmdCompare(kws, opts) {
  if (!kws.length) die("compare 需要至少 1 个关键词");
  const gptsAdded = !opts.noGpts && !kws.some(k => k.toLowerCase() === "gpts");
  const anchor = Number(opts.anchor ?? process.env.RANKUP_GPTS_ANCHOR ?? 5000);
  const candidates = opts.noGpts ? kws : kws.filter(k => k.toLowerCase() !== "gpts");
  const size = opts.noGpts ? 5 : 4;
  const batches = [];
  for (let i = 0; i < candidates.length; i += size)
    batches.push(opts.noGpts ? candidates.slice(i, i + size) : [...candidates.slice(i, i + size), "gpts"]);
  if (!batches.length) batches.push(["gpts"]);
  const session = opts.session ?? defaultSession();
  console.log(`对比共分 ${batches.length} 批；每批独立查询与判读${gptsAdded ? "；自动追加 gpts" : ""}。`);
  if (opts.noGpts) console.log("未同框 gpts（用户显式 --no-gpts）");
  try {
    for (const [index, list] of batches.entries()) {
      if (index) msleep(30_000);
      console.log(`\n### 第 ${index + 1}/${batches.length} 批`);
      const { restBody, geo, timeframe, evidenceDir, noData } = runRestQuery(list,
        { ...opts, session, keepSession: true, batch: true, restAttempts: 2 }, "TIMESERIES", "multiline");
      const timeline = JSON.parse(restBody).default?.timelineData || [];
      const rows = timeline.map(pt => [pt.time ? epochDay(pt.time) : (pt.formattedAxisTime || ""),
        ...list.map((_, i) => pt.hasData?.[i] === false || pt.value?.[i] == null ? "" : String(pt.value[i]))]);
      if (noData) console.log("热度曲线：Google 明示数据不足（no-data）");
      printCompare(list, geo, timeframe, rows, evidenceDir, { gptsAdded, anchor, batch: index + 1 });
      if (!opts.noGpts) printGptsBaseline(list, geo, rows, anchor, opts.anchor !== undefined);
    }
  } finally {
    if (!opts.keepSession) closeSession(session);
    else console.error(`[gt-browser] 会话 ${session} 已保留，用完请 close。`);
  }
}

function printGptsBaseline(kws, geo, rows, anchor, explicitAnchor) {
  const mean = i => {
    const values = rows.map(r => r[i + 1]).filter(v => v !== "").map(Number);
    return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
  };
  const baseline = mean(kws.indexOf("gpts"));
  const monthly = geo === "US" || explicitAnchor;
  console.log("\n## gpts 基线判读\n");
  if (!monthly) console.log(`锚点 ${anchor} 为美国口径，非 US 只比较相对大小\n`);
  console.log("100 是组内窗口峰值；0 是低于展示分辨率或样本不足，不是零搜索。\n");
  const readings = kws.flatMap((k, i) => {
    if (k === "gpts") return [];
    const value = mean(i);
    let ratio = "—", interval = "—", judgment;
    if (baseline === null || baseline === 0) judgment = "gpts 数据缺失，无法判读";
    else if (value === null) judgment = "候选词数据缺失，无法判读";
    else {
      const r = value / baseline;
      ratio = r.toFixed(3);
      if (value === 0) judgment = "低于展示分辨率（≠ 零搜索）";
      else {
        judgment = r > 1.35 ? "大于 gpts 量级" : r < 0.65 ? "小于 gpts 量级" : "约等于 gpts 量级（区间重叠）";
        if (monthly) interval = [.65, 1.35].map(f => (Math.round(r * anchor * f / 100) * 100).toLocaleString("en-US")).join("–");
      }
    }
    return [[k, value === null ? "—" : value.toFixed(3), baseline === null ? "—" : baseline.toFixed(3), ratio,
      ...(monthly ? [interval] : []), judgment]];
  });
  console.log(mdTable(["词", "周读数均值", "gpts 周读数均值", "r", ...(monthly ? ["折合月量区间"] : []), "判读"], readings));
  if (baseline === null || baseline === 0) console.log("\ngpts 数据缺失，无法判读");
  console.log("\ngpts 自身有涨落周期，判读只用窗口均值；锚点 ≈5000/月为用户定的衡量标准，详见 references/trends.md「gpts 基线判读」");
}

function epochDay(epoch) { return new Date(Number(epoch) * 1000).toISOString().slice(0, 10); }

function assertTimelineWindow(rows, timeframe, now = Date.now()) {
  if (timeframe === "all") return;
  let start, end = now, tolerance = 86400000;
  const exact = timeframe.match(/^(\d{4}-\d{2}-\d{2}) (\d{4}-\d{2}-\d{2})$/);
  const relative = timeframe.match(/^(now|today) (\d+)-(h|d|m|y)$/);
  if (exact) { start = Date.parse(exact[1]); end = Date.parse(exact[2]) + 86400000; }
  else if (relative) {
    const unit = {h: 3600000, d: 86400000, m: 31 * 86400000, y: 366 * 86400000}[relative[3]];
    start = now - Number(relative[2]) * unit;
    tolerance = relative[3] === 'm' || relative[3] === 'y' ? 8 * 86400000 : 86400000;
  } else return;
  const times = rows.map(r => Date.parse(r[0]));
  if (times.some(t => !Number.isFinite(t) || t < start - tolerance || t > end + 86400000)
      || Math.max(...times) < end - Math.max(tolerance, 2 * 86400000)) {
    fail("timeline-window-mismatch", `Returned dates ${rows[0]?.[0]}–${rows.at(-1)?.[0]} do not match requested ${timeframe}`);
  }
}

function printCompare(kws, geo, timeframe, rows, evidenceDir, metadata) {
  if (rows.length) assertTimelineWindow(rows, timeframe);
  const measured = rows.some(r => r.slice(1).some(v => v !== ""));
  writeFileSync(join(evidenceDir, "compare-result.json"), JSON.stringify({keywords:kws, geo, timeframe, ...metadata,
    status: measured ? "ok" : "insufficient", start:rows[0]?.[0], end:rows.at(-1)?.[0], rows}, null, 2) + "\n");
  console.log(`## 热度对比：${kws.join(" vs ")}`);
  console.log(scopeLine(geo, timeframe));
  console.log(mdTable(["date", ...kws], rows));
  if (!measured) { console.log("\n样本不足：源数据未给出可测热度，空值不代表零需求。"); return; }
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
  const { seen, geo, timeframe, evidenceDir, noData } = runRegionQuery(list, opts);
  if (noData) { console.log("地区热度：Google 明示数据不足（no-data）"); return; }
  if (!seen.size) {
    widgetEmptyExit(evidenceDir, "地区热度分布（comparedgeo，REST）");
  }
  // 多关键词时 aria-label 给的是「同区域内几个词的相对份额（和为 100）」，不是
  // 各自独立的 0-100 归一化值——跟旧版/单关键词的语义不同，见文件头与 trends.md 说明。
  const rows = [...seen.values()]
    .map((v) => [v.name, ...list.map((k) => String(v.values.get(k) ?? 0))])
    .filter((r) => r.slice(1).some((v) => Number(v) > 0))
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, topN);
  if (!rows.length) widgetEmptyExit(evidenceDir, "地区热度分布（comparedgeo，REST后为空）");
  console.log(`## 地区热度分布：${list.join(" / ")}`);
  console.log(scopeLine(geo, timeframe));
  if (list.length > 1) {
    console.log("> 注：多关键词对比时下表数值是「同一地区内几个词的相对份额」（同一行加总为 100），不是各词独立的 0-100 热度；只查 1 个词时才是独立的 0-100 归一化值。\n");
  }
  console.log(mdTable(["region", ...list], rows));
}

/** 页内同源 REST：保留 HTTP 与重定向诊断，不返回 token / 请求 URL。 */
function restWidgetJs(kws, geo, timeframe, opts, widgetId, path, reqPatch = null) {
  const req = {
    comparisonItem: kws.map((k) => ({ keyword: k, geo: geo || "", time: timeframe })),
    category: Number(opts.category) || 0,
    property: normalizeProperty(opts.property),
  };
  const exploreApi =
    "https://trends.google.com/trends/api/explore?hl=en-US&tz=0&req=" +
    encodeURIComponent(JSON.stringify(req));
  return `(async function(){
    let status = null, redirected = false;
    function strip(t){ const i = t.indexOf("{"); return i < 0 ? t : t.slice(i); }
    async function read(url, name){
      const r = await fetch(url, {credentials:"include", redirect:"manual"});
      status = r.status;
      redirected = r.type === "opaqueredirect" || r.redirected;
      if (redirected || !r.ok) throw new Error(name + " HTTP " + status + (redirected ? " redirect（浏览器隐藏原始 3xx 状态）" : ""));
      return strip(await r.text());
    }
    try {
      const d = JSON.parse(await read(${JSON.stringify(exploreApi)}, "explore"));
      const w = (d.widgets || []).find(x => x.id === ${JSON.stringify(widgetId)});
      if (!w) throw new Error("explore HTTP " + status + ": 没有 ${widgetId} widget");
      const patch = ${JSON.stringify(reqPatch)};
      if (patch) Object.assign(w.request, patch);
      const u = "/trends/api/widgetdata/${path}?hl=en-US&tz=0&req="
        + encodeURIComponent(JSON.stringify(w.request)) + "&token=" + encodeURIComponent(w.token);
      const body = await read(u, ${JSON.stringify(path)});
      JSON.parse(body);
      return {ok:true, body, status, redirected};
    } catch(e) { return {ok:false, err:String(e.message || e), status, redirected}; }
  })()`;
}

function fetchRestWidget(session, kws, geo, timeframe, opts, widgetId, path, { reqPatch = null } = {}) {
  try {
    return firstJson(opencliRaw(["browser", session, "eval", restWidgetJs(kws, geo, timeframe, opts, widgetId, path, reqPatch)], { timeout: REST_EVAL_TIMEOUT_MS }))
      || { ok: false, err: "REST eval 未返回结果" };
  } catch (e) {
    return { ok: false, err: `REST eval 失败/超时：${String(e.message).slice(0, 200)}` };
  }
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

function runRelated(kws, opts) {
  const result = runRestQuery(kws, opts, "RELATED_QUERIES", "relatedsearches");
  return { ...result, sections: parseRelatedRest(result.restBody) };
}

function cmdRelated(kws, opts) {
  if (kws.length !== 1) die("related 只支持单个关键词");
  const { sections, geo, timeframe, noData } = runRelated(kws, opts);
  if (noData) { console.log("相关查询：Google 明示数据不足（no-data）"); return; }
  console.log(`## 相关查询：${kws[0]}`);
  console.log(`\n> 范围：${geo || "全球"} · ${timeframe} · Top 是 0-100 相对搜索热度，Rising 是区间内涨幅（Breakout = 涨幅超出可测量范围）\n`);
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
    const headers = ["query", valueHeader];
    console.log(mdTable(headers, rows));
    console.log();
  }
}

function cmdRelatedBatch(kws, opts) {
  if (opts["keywords-file"]) {
    const input = readFileSync(opts["keywords-file"], "utf8");
    kws = input.trim().startsWith("[") ? JSON.parse(input) : input.trim().split(/\r?\n/);
  }
  const session = opts.session ?? defaultSession();
  mkdirSync(opts.out, { recursive: true });
  const results = [];
  let stop = null;
  try {
    for (const keyword of kws) {
      const file = join(opts.out, `${encodeURIComponent(keyword)}-result.json`);
      if (existsSync(file)) {
        const saved = JSON.parse(readFileSync(file, "utf8"));
        results.push(saved);
        continue;
      }
      if (results.length) msleep(Number(opts["sleep-sec"] ?? 10) * 1000);
      let result;
      try {
        const data = runRelated([keyword], { ...opts, time: opts.time ?? "7d", session, keepSession: true, batch: true });
        const compact = rows => rows.map(([query, formattedValue]) => ({ query, formattedValue }));
        result = { keyword, status: data.noData || !data.sections.rising.length ? "empty" : "ok",
          rising: compact(data.sections.rising), top: opts.risingOnly ? [] : compact(data.sections.top), attempts: data.attempts };
      } catch (e) {
        stop = e.stopReason === "captcha" || e.stopReason === "opencli-open-failed" || !e.stopReason
          || /eval 失败|eval 未返回|timeout|disconnected|bridge/i.test(e.message) ? e.message : null;
        result = { keyword, status: "fail", rising: [], top: [], attempts: e.attempts || [], reason: e.message, stop };
        if (opts.evidence === "off" && !existsSync(join(opts.out, `${encodeURIComponent(keyword)}-raw.json`)))
          writeFileSync(join(opts.out, `${encodeURIComponent(keyword)}-raw.json`), JSON.stringify({ error: e.message, attempts: result.attempts }, null, 2) + "\n");
      }
      writeFileSync(file, JSON.stringify(result, null, 2) + "\n");
      results.push(result);
      console.error(`[gt-browser] ${keyword}: ${result.status}`);
      if (stop) break;
    }
    console.log(JSON.stringify({ results, stop }));
  } finally {
    if (!opts.keepSession) closeSession(session);
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

const COMMANDS = { compare: cmdCompare, region: cmdRegion, related: cmdRelated, "related-batch": cmdRelatedBatch, hot: cmdHot, close: cmdClose };

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || ["-h", "--help", "help"].includes(argv[0])) {
    console.log(
      [
        "gt-browser — Google Trends 旧版 Explore 页的 OpenCLI 路由",
        "",
        "  node gt-browser.mjs compare KW1 [KW2...]  热度对比（默认追加 gpts，不重复）",
        "    超过 4 个候选词顺序分批，每批最多 4 词 + gpts，独立判读；批间等待 30 秒",
        "  --no-gpts  compare 独立窗口，不加基线、不判读；每批最多 5 词",
        "  --anchor N  gpts 月量锚点（默认 RANKUP_GPTS_ANCHOR 或 5000），误差 ±35%",
        "    默认仅 --geo US 折合月量；显式 --anchor 可用于其他地区",
        "  node gt-browser.mjs region  KW1 [KW2...]  地区分布",
        "  node gt-browser.mjs related KW             相关查询（仅单词）",
        "  node gt-browser.mjs related-batch KW... --out DIR [--keywords-file FILE]",
        "    --time 7d --sleep-sec 10 --rising-only --evidence off；已有结果跳过",
        "  node gt-browser.mjs hot                    每日热搜（走 opencli adapter）",
        "  node gt-browser.mjs close                  释放浏览器会话",
        "",
        "  --geo CODE   地区（留空=全球）   --time 1h|4h|1d|7d|28d|30d|1m|3m|12m|5y|all|START:END",
        "  --top N      条数（默认 15）     --raw（保留，compare 已是原始周级数据未聚合）",
        "  --session NAME  会话名（默认 rankup-gt-trends-<每对话唯一后缀>）",
        "  --keep-session  跑完保留会话，连续查询后用 close 释放",
        "",
        "取数机制：旧版 /trends/explore 页面内同源 REST，失败报错，无新版兜底。",
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
