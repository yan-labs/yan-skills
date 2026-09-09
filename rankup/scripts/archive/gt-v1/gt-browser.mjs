#!/usr/bin/env node
/**
 * gt-browser — Google Trends 的 OpenCLI 路由
 * 状态：双证人化改造 2026-08-30（截图链路已实盘验证）——每次运行落
 * trends-<kw>.json + 截图 + manifest(stopReason/attempt/emptyResultCount)
 * 进 `.rankup/evidence/gt-browser-<ts>/`；空结果不再被叙述成「太冷门」。
 *
 * pytrends 走的是没有凭据的匿名请求，Google 对它限流极狠（429 是常态）。
 * 这个脚本改走用户本机那个已登录的 Chrome：打开**这次查询本身**的 explore 页（带 q/date/geo），
 * 在页面上下文里 fetch Trends 自己的内部 widget 接口（同源 + 带 cookie），
 * 拿到的是和你肉眼在页面上看到的完全同一份数据。
 *
 * 子命令与 gt.py 一致，输出格式也一致，可以互相替换：
 *   compare KW1 [KW2...]   热度对比曲线
 *   region  KW1 [KW2...]   地区热度分布
 *   related KW             相关查询（rising + top）
 *
 * 选项：--geo CODE  --time 1m|3m|12m|5y|all|START:END  --top N  --raw
 *       --session NAME  --keep-session
 *
 * 会话默认跑完即释放。--keep-session 会保留标签页，脚本会把释放命令打到 stderr——
 * 忘了释放不会报错，只会在用户的 Chrome 里留下一个看起来卡死的标签页。
 *
 * 依赖：opencli（浏览器桥要绿，先跑 opencli doctor）
 */

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { newEvidenceDir, captureScene, writeManifest } from "../../lib-scene.mjs";

// 会话名要同时满足两件事，缺一个都会静默出错：
//   · 描述性——名字是唯一存在的标识，得能回答「这是谁的标签页」；
//   · 唯一性——一个字面常量会让两个并行任务（或两个 sub agent）算出同一个名字，
//     于是共用同一个标签页，第二个读到的是第一个打开的页面，**全程零报错**。
// 后缀按「每个对话」派生：CLAUDE_CODE_SESSION_ID 才是真正会并发的那个单位；
// HOST_SESSION_ID 是同一个桌面 app 里所有对话共享的，只能兜底。
// 不要在 Bash tool 里用 $$ 自己拼——那里每次调用都是新进程，PID 每次都变，
// 于是每条命令都开一个新标签页，上一条打开的被遗弃。
// 并行 sub agent 继承同一份环境变量，必须各自显式传 --session。
function defaultSession() {
  const suffix = (
    process.env.OPENCLI_SESSION_SUFFIX ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.CLAUDE_CODE_HOST_SESSION_ID ||
    String(process.ppid)
  ).replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "local";
  return `rankup-gt-v1-${suffix}`;
}
const EXPLORE_URL = "https://trends.google.com/trends/explore?hl=en-US";
const OPENCLI = process.env.GT_OPENCLI ?? "opencli";

/**
 * 标签页要打开的是「这次查询本身」的 explore 页，不是空白 explore 页。
 * 取数仍走页内 fetch（同源带 cookie），但用户在浏览器里看到的必须是带关键词、时间范围、地区的
 * 真实趋势图——和 reddit search 那次一样：只在页内取数、页面停在空白首页，用户会以为它什么都没查。
 */
const PROPERTY_ALIASES = { web: "", "": "", images: "images", image: "images", news: "news", youtube: "youtube", yt: "youtube", shopping: "froogle", froogle: "froogle" };
/** --property web|images|news|youtube|shopping → Trends 接口的 property 值（web 是空串） */
function normalizeProperty(p) {
  if (p === undefined || p === null) return "";
  const key = String(p).toLowerCase();
  if (!(key in PROPERTY_ALIASES)) die(`--property 只能是 web / images / news / youtube / shopping，收到：${p}`);
  return PROPERTY_ALIASES[key];
}

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
// How long to let the Trends bundle boot before querying its APIs from the page.
const SETTLE_MS = 5000;
// The bridge intermittently drops a large eval result; reopening clears it.
const EMPTY_RESULT_ATTEMPTS = 3;

const PRESETS = {
  // 短时窗口：验证「刚出现的新词」用。面板类工具只有 28 天口径，Trends 的 now 区间能看到小时级曲线
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

/**
 * 取数路径上的失败不再直接 die：抛一个带 stopReason 的错误，让 fetchTrends 的
 * finally 先把现场（截图 + 页面文本 + manifest）落进证据目录、再关会话。
 * 旧版在 runBatch 里 process.exit(1)，finally 根本不会执行——会话泄漏、
 * 现场全毁，AI 拿到的只有一句结论文案。
 */
function fail(stopReason, msg, extra) {
  throw Object.assign(new Error(msg), { stopReason, extra });
}

/** 本次取数的统计，进 manifest。每次 fetchTrends 重置。 */
let runStats = null;
/** 本次查询对应的 explore 页 URL（带 q / date / geo），每次 fetchTrends 重置。 */
let currentExploreUrl = EXPLORE_URL;

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
    }
    else if (a.startsWith("--")) {
      if (i + 1 >= argv.length) die(`选项 ${a} 缺少值`);
      opts[a.slice(2)] = argv[++i];
    } else kws.push(a);
  }
  return { kws, opts };
}

/** 在 Trends 页面上下文里跑的取数器。返回三个 widget 的原始数据。 */
function extractor({ keywords, geo, timeframe, resolution, category = 0, property = "" }) {
  return `(async () => {
  // Never throw. opencli reports a rejected promise as ok:true with an empty
  // result, which used to surface as "关键词太冷门" — Google answering with a
  // consent page, an interstitial, or 429 HTML behind a 200 would parse-fail here
  // and be read as an absence of search demand. Return the reason instead.
  const strip = (t, what) => {
    try { return JSON.parse(t.replace(/^\\)\\]\\}'?,?\\n?/, '')); }
    catch { return {__parseFailed: what, head: String(t).slice(0, 120)}; }
  };
  const tz = new Date().getTimezoneOffset();
  const kws = ${JSON.stringify(keywords)};
  if (location.hostname !== 'trends.google.com') return {error: 'wrong_page'};
  const req = {comparisonItem: kws.map(k => ({keyword: k, geo: ${JSON.stringify(geo)}, time: ${JSON.stringify(timeframe)}})), category: ${Number(category) || 0}, property: ${JSON.stringify(property || "")}};
  const eu = 'https://trends.google.com/trends/api/explore?hl=en-US&tz=' + tz + '&req=' + encodeURIComponent(JSON.stringify(req));
  const er = await fetch(eu, {credentials: 'include'});
  if (!er.ok) return {error: 'explore_' + er.status};
  const j = strip(await er.text(), 'explore');
  if (j.__parseFailed) return {error: 'explore_not_json', head: j.head};
  if (!Array.isArray(j.widgets)) return {error: 'explore_no_widgets'};
  const pick = id => j.widgets.find(w => w.id === id);
  const wd = async (path, w, patch) => {
    if (!w) return null;
    const rq = patch ? Object.assign({}, w.request, patch) : w.request;
    const u = 'https://trends.google.com/trends/api/widgetdata/' + path
      + '?hl=en-US&tz=' + tz
      + '&req=' + encodeURIComponent(JSON.stringify(rq))
      + '&token=' + encodeURIComponent(w.token);
    const r = await fetch(u, {credentials: 'include'});
    if (!r.ok) return {error: path + '_' + r.status};
    const parsed = strip(await r.text(), path);
    return parsed.__parseFailed ? {error: path + '_not_json', head: parsed.head} : parsed;
  };
  const geoWidget = pick('GEO_MAP') || pick('GEO_MAP_0');
  const out = {keywords: kws};
  try {
  out.timeseries = await wd('multiline', pick('TIMESERIES'));
  out.geo = await wd('comparedgeo', geoWidget, ${resolution ? JSON.stringify({ resolution }) : "null"});
  out.related = [];
  out.topics = [];
  for (let i = 0; i < kws.length; i++) {
    const w = pick('RELATED_QUERIES_' + i) || (kws.length === 1 ? pick('RELATED_QUERIES') : null);
    out.related.push(await wd('relatedsearches', w));
    const t = pick('RELATED_TOPICS_' + i) || (kws.length === 1 ? pick('RELATED_TOPICS') : null);
    out.topics.push(await wd('relatedsearches', t));
  }
  } catch (e) { return {error: 'extractor_threw', head: String(e && e.message || e).slice(0, 200)}; }
  return out;
})()`;
}

// 租约还在、标签页已经没了的时候，opencli 报的是这个。它不会自愈，必须先 close
// 把旧租约丢掉再重开——所以这里只重试一次，重试前无条件 close。
const SESSION_NOT_FOUND = /session_not_found|No active session/i;
const STALE = /stale page identity|Page not found/i;

function runBatch(js, session, { retry = true, open = false, attempt = 1 } = {}) {
  if (runStats) runStats.attempt = Math.max(runStats.attempt, attempt);
  const settleMs = SETTLE_MS * attempt;
  const commands = JSON.stringify([
    ...(open ? [
      { cmd: "open", args: { url: currentExploreUrl } },
      // `wait time` is broken in opencli 1.8.7 — it returns in well under a second
      // whatever you ask for, so Trends got queried before its bundle had booted.
      // An in-page timer is accurate. See backlink/tests/opencli-wait.test.mjs.
      // Two seconds still left the odd run reading an unbooted page, and each
      // retry waits proportionally longer.
      { cmd: "eval", args: { js: `(async()=>{await new Promise(r=>setTimeout(r,${settleMs}));return true})()` } },
    ] : []),
    { cmd: "eval", args: { js } },
  ]);
  let raw;
  try {
    raw = execFileSync(
      OPENCLI,
      ["browser", session, "--window", "background", "batch", "--commands", commands],
      { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch (e) {
    const msg = (e.stderr || e.message || "").toString();
    if (retry && SESSION_NOT_FOUND.test(msg)) {
      return runBatch(js, session, { retry: false, open: true });
    }
    if (retry && STALE.test(msg)) {
      closeSession(session);
      return runBatch(js, session, { retry: false, open: true });
    }
    fail("opencli-failed", `opencli 调用失败：${msg.trim().slice(0, 400)}`, { stderr: msg.slice(0, 2000) });
  }
  // opencli 会在 stdout 里混 npm 升级提示，取第一个 JSON 数组
  const start = raw.indexOf("[");
  if (start < 0) fail("no-json", `opencli 没有返回 JSON：${raw.slice(0, 300)}`, { rawHead: raw.slice(0, 2000) });
  let steps;
  try {
    steps = JSON.parse(raw.slice(start));
  } catch {
    fail("json-parse-failed", `解析 opencli 输出失败：${raw.slice(0, 300)}`, { rawHead: raw.slice(0, 2000) });
  }
  // The extractor is the LAST eval, not the first. The settle is an eval too now
  // that `wait time` turned out to be broken, and picking the first one handed
  // back the settle's `true` — which then looked like an empty result and burned
  // every retry. It only showed up when the session had to be opened, because
  // that is the only path with two evals in the batch.
  const evalStep = [...steps].reverse().find((s) => s.cmd === "eval");
  if (!evalStep?.ok) {
    const err = String(evalStep?.error || "eval 步骤缺失");
    if (retry && SESSION_NOT_FOUND.test(err)) {
      return runBatch(js, session, { retry: false, open: true });
    }
    if (retry && STALE.test(err)) {
      closeSession(session);
      return runBatch(js, session, { retry: false, open: true });
    }
    fail("eval-failed", `页面取数失败：${err}`, { steps });
  }
  const data = evalStep.result?.value ?? evalStep.result;
  if (retry && data?.error === "wrong_page") {
    return runBatch(js, session, { retry: false, open: true });
  }
  if (!data || data.error) {
    if (String(data?.error).includes("_429")) {
      fail("rate-limited-429", "Google 在浏览器里也限流了（429）。**这不是「没有搜索量」**，等一会儿或换网络重试", { data });
    }
    fail("api-error", `Trends 接口返回异常：${data?.error || "空结果"}`, { data });
  }
  // An empty object means the eval result never came back. The extractor itself
  // always returns at least `keywords`, so this is the bridge dropping it rather
  // than Trends answering — reopening with a longer settle clears it most of the
  // time. Never report it as "no search volume"; that is a wrong answer that looks
  // like a real one.
  if (!Object.keys(data).length) {
    if (runStats) runStats.emptyResultCount++;
    if (attempt < EMPTY_RESULT_ATTEMPTS) {
      closeSession(session);
      return runBatch(js, session, { retry, open: true, attempt: attempt + 1 });
    }
    fail(
      "empty-result-exhausted",
      `Trends 连续 ${EMPTY_RESULT_ATTEMPTS} 次返回空结果——页面脚本没跑完或结果没回传，不是没有搜索量。稍后重试`,
      { attempts: attempt },
    );
  }
  return data;
}

/**
 * Turn a missing widget into the reason it is missing.
 *
 * `explore` hands back tokens and then each `widgetdata` call can be throttled on
 * its own, landing in data.timeseries.error rather than data.error. The top-level
 * check never saw those, so a 429 arrived here as an empty timeline and got
 * announced as "关键词太冷门" — a rate limit reported as an absence of demand. For
 * a keyword tool that is the worst failure mode there is, because the wrong answer
 * is the believable one. Each command asks only about the widget it needs, so a
 * throttled geo widget no longer sinks a compare that already has its timeline.
 */
function widgetUnavailable(widget, whatFor) {
  const error = widget && typeof widget === "object" ? widget.error : null;
  if (!error) return null;
  if (String(error).includes("_429")) {
    return `Google 限流了${whatFor}接口（${error}）。**这不是「没有搜索量」，是没取到数**——等一会儿或换网络重试`;
  }
  return `${whatFor}接口失败：${error}。不要把它当成零需求`;
}

function closeSession(session) {
  try {
    execFileSync(OPENCLI, ["browser", session, "close"], { stdio: "ignore" });
  } catch {
    /* 关不掉不影响已经拿到的数据 */
  }
}

/**
 * 每次运行都落证据（双证人化 2026-08-30，截图链路已实盘验证）：
 * `.rankup/evidence/gt-browser-<ts>/` 里有 trends-<kw>.json（原始 widget 数据）、
 * final.png / final.txt（页面双证人）、manifest.json（stopReason / attempt /
 * emptyResultCount）。取证发生在 finally 里、**关会话之前**——失败时现场不毁。
 * 截图对着的是 explore 空页（取数走页内 fetch，DOM 不变），它的价值是能看出
 * consent 弹窗 / 限流插页 / 未登录这类「接口层看不见」的状态。
 */
function fetchTrends(keywords, opts, { resolution } = {}) {
  if (keywords.length > 5) die("Google Trends 一次最多对比 5 个关键词");
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  const dir = newEvidenceDir("gt-browser");
  runStats = { attempt: 1, emptyResultCount: 0 };
  currentExploreUrl = exploreUrlFor(keywords, geo, timeframe, opts);
  const kwSlug = keywords.join("_").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "kw";
  let stopReason = "completed";
  let data = null;
  try {
    data = runBatch(extractor({ keywords, geo, timeframe, resolution, category: opts.category, property: normalizeProperty(opts.property) }), session);
    try {
      writeFileSync(join(dir, `trends-${kwSlug}.json`), JSON.stringify(data, null, 2) + "\n");
    } catch (e) {
      console.error(`[gt-browser] 原始数据落盘失败：${String(e?.message || e).slice(0, 200)}`);
    }
    return { data, geo, timeframe, evidenceDir: dir };
  } catch (e) {
    stopReason = e?.stopReason || "error";
    e.evidenceDir = dir;
    throw e;
  } finally {
    captureScene({
      dir,
      tag: "final",
      screenshot: (p) => execFileSync(OPENCLI, ["browser", session, "screenshot", p], { stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 }),
      pageText: () =>
        execFileSync(OPENCLI, ["browser", session, "eval", "(()=>{try{return document.body?document.body.innerText.slice(0,20000):''}catch(e){return 'PAGE_TEXT_FAILED:'+e}})()"], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
          timeout: 60_000,
        }),
    });
    try {
      writeManifest(dir, {
        script: "gt-browser",
        keywords,
        geo,
        timeframe,
        session,
        stopReason,
        attempt: runStats.attempt,
        emptyResultCount: runStats.emptyResultCount,
        finishedAt: new Date().toISOString(),
      });
    } catch { /* manifest 写不进也不能拦住关会话 */ }
    if (opts.keepSession) {
      // 保留会话是合法用法（连续查多个词时省掉重开页面），但它留下的标签页
      // 会一直停在空白的 explore 界面上——取数全在页面内 fetch，DOM 不会变，
      // 在用户的 Chrome 里看起来就是「一个卡死的标签页」。忘了释放不会有任何
      // 报错，所以这里必须把释放命令喊出来，别让它变成一个静默的遗留。
      console.error(`[gt-browser] 会话 ${session} 已保留，用完请释放：` +
        `\n  node gt-browser.mjs close --session ${session}`);
    } else {
      closeSession(session);
    }
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

/**
 * widget 空/失败时的退出：不下「太冷门」的结论。「没取到数」（限流/插页/改版）
 * 与「确实没有足够搜索量」在这一层**不可分辨**——如实说不可分辨，把证据目录
 * 指给判读者（原始 JSON + 截图 + manifest 都已在 fetchTrends 里落盘）。
 */
function widgetEmptyExit(evidenceDir, whatFor, widget, reasonLine) {
  writeManifest(evidenceDir, { stopReason: `empty-${whatFor}` });
  console.error(`[gt-browser] ${reasonLine ?? `${whatFor}为空。「接口没给数」与「该范围内搜索量不足」在此不可分辨——不要读成零需求。`}`);
  console.error(`[gt-browser] 证据：${evidenceDir}（trends-*.json 原始响应 + final.png/final.txt + manifest），判读以它们为准。`);
  if (widget !== undefined) console.error(`[gt-browser] widget 原始值头部：${JSON.stringify(widget ?? null).slice(0, 300)}`);
  process.exit(1);
}

function cmdCompare(kws, opts) {
  if (!kws.length) die("compare 需要至少 1 个关键词，最多 5 个");
  const { data, geo, timeframe, evidenceDir } = fetchTrends(kws, opts);
  const tl = data.timeseries?.default?.timelineData;
  if (!tl?.length) widgetEmptyExit(evidenceDir, "热度曲线", data.timeseries, widgetUnavailable(data.timeseries, "热度曲线"));

  let rows;
  let note = "";
  // 只有超过两个月的日级数据才按月聚合；30 天的曲线聚成一个「月均值」等于什么都没看到
  if (!opts.raw && tl.length > 62 && !/^now /.test(timeframe)) {
    // 按月聚合（now 区间不聚合：它本来就是为了看小时级形状）。formattedAxisTime 的粒度随 timeframe 变，用 time 时间戳更可靠。
    const buckets = new Map();
    for (const p of tl) {
      const key = new Date(Number(p.time) * 1000).toISOString().slice(0, 7);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(p.value);
    }
    rows = [...buckets.entries()].map(([month, vals]) => [
      month,
      ...kws.map((_, i) => (vals.reduce((s, v) => s + v[i], 0) / vals.length).toFixed(1)),
    ]);
    note = "（月均值；--raw 查看原始数据）";
  } else {
    // now 区间（1h/4h/1d/7d）的点是分钟级或小时级，只打日期会把一整天的点印成同一个字符串；
    // 保留到分钟（UTC），判读时按本地时区换算。
    const subDaily = /^now /.test(timeframe);
    rows = tl.map((p) => [
      subDaily
        ? new Date(Number(p.time) * 1000).toISOString().slice(0, 16).replace("T", " ") + "Z"
        : new Date(Number(p.time) * 1000).toISOString().slice(0, 10),
      ...p.value.map(String),
    ]);
  }

  console.log(`## 热度对比：${kws.join(" vs ")} ${note}`);
  console.log(scopeLine(geo, timeframe));
  console.log(mdTable(["date", ...kws], rows));

  const peaks = kws.map((k, i) => {
    let best = rows[0];
    for (const r of rows) if (Number(r[i + 1]) > Number(best[i + 1])) best = r;
    return `${k} → ${best[i + 1]}（${best[0]}）`;
  });
  console.log(`\n**峰值**：${peaks.join("；")}`);
}

function cmdRegion(kws, opts) {
  if (!kws.length) die("region 需要至少 1 个关键词");
  const list = kws.slice(0, 5);
  const { data, geo, timeframe, evidenceDir } = fetchTrends(list, opts, {
    resolution: opts.resolution ? String(opts.resolution).toUpperCase() : (opts.geo ? "REGION" : "COUNTRY"),
  });
  const gm = data.geo?.default?.geoMapData;
  if (!gm?.length) widgetEmptyExit(evidenceDir, "地区分布", data.geo, widgetUnavailable(data.geo, "地区分布"));
  const topN = Number(opts.top || 15);
  const rows = gm
    .filter((g) => g.value.some((v) => v > 0))
    .sort((a, b) => b.value[0] - a.value[0])
    .slice(0, topN)
    .map((g) => [g.geoName, ...g.value.map(String)]);
  console.log(`## 地区热度分布：${list.join(" / ")}`);
  console.log(scopeLine(geo, timeframe));
  console.log(mdTable(["region", ...list], rows));
}

function cmdRelated(kws, opts) {
  if (kws.length !== 1) die("related 只支持单个关键词");
  const { data, geo, timeframe, evidenceDir } = fetchTrends(kws, opts);
  const ranked = data.related?.[0]?.default?.rankedList;
  const relatedProblem = widgetUnavailable(data.related?.[0], "相关查询");
  if (!ranked && relatedProblem) widgetEmptyExit(evidenceDir, "相关查询", data.related?.[0], relatedProblem);
  console.log(`## 相关查询：${kws[0]}`);
  console.log(scopeLine(geo, timeframe));
  const topN = Number(opts.top || 15);
  // rankedList[0] = top（相对热度），[1] = rising（增长百分比）
  const sections = [
    ["飙升（value=增长百分比）", ranked?.[1]],
    ["高频（value=相对热度）", ranked?.[0]],
  ];
  for (const [label, section] of sections) {
    console.log(`### ${label}`);
    const items = section?.rankedKeyword;
    if (!items?.length) {
      console.log("（无数据）\n");
      continue;
    }
    console.log(
      mdTable(
        ["query", "value"],
        items.slice(0, topN).map((k) => [k.query, k.formattedValue ?? String(k.value)]),
      ),
    );
    console.log();
  }
  // 相关主题（explore 页左栏「Search topics」）：Google 的实体，不是查询串；title 后带类型
  const topicRanked = data.topics?.[0]?.default?.rankedList;
  console.log(`## 相关主题：${kws[0]}`);
  const topicSections = [
    ["飙升主题（value=增长百分比）", topicRanked?.[1]],
    ["高频主题（value=相对热度）", topicRanked?.[0]],
  ];
  for (const [label, section] of topicSections) {
    console.log(`### ${label}`);
    const items = section?.rankedKeyword;
    if (!items?.length) {
      console.log("（无数据）\n");
      continue;
    }
    console.log(
      mdTable(
        ["topic", "type", "value"],
        items.slice(0, topN).map((k) => [k.topic?.title ?? "", k.topic?.type ?? "", k.formattedValue ?? String(k.value)]),
      ),
    );
    console.log();
  }
}

function cmdClose(kws, opts) {
  if (kws.length) die("close 不需要关键词");
  const session = opts.session ?? defaultSession();
  closeSession(session);
  console.log(`已释放 Trends 会话：${session}`);
}

const COMMANDS = { compare: cmdCompare, region: cmdRegion, related: cmdRelated, close: cmdClose };

function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || ["-h", "--help", "help"].includes(argv[0])) {
    console.log(
      [
        "gt-browser — Google Trends 的 OpenCLI 路由（走已登录 Chrome，避开 pytrends 的 429）",
        "",
        "  node gt-browser.mjs compare KW1 [KW2...]  热度对比",
        "  node gt-browser.mjs region  KW1 [KW2...]  地区分布",
        "  node gt-browser.mjs related KW            相关查询",
        "  node gt-browser.mjs close                 释放浏览器会话",
        "",
        "  --geo CODE   地区（留空=全球）   --time 7d|28d|30d|1m|3m|12m|5y|all|START:END",
        "  --top N      条数（默认 15）     --raw  compare 不做月度聚合",
        "  --session NAME  会话名（默认 rankup-gt-v1-<每对话唯一后缀>）",
        "  --keep-session  跑完保留会话，连续查询后用 close 释放",
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
    // fail() 抛出的取数失败在这里落地：现场已经在 fetchTrends 的 finally 里
    // 采好了（截图 + 文本 + manifest），这里只负责把话说全再退出。
    console.error(`[gt-browser] 错误：${e?.message || e}`);
    if (e?.evidenceDir) console.error(`[gt-browser] 现场已落盘：${e.evidenceDir}（stopReason=${e.stopReason ?? "error"}），判读以截图与原始响应为准。`);
    process.exit(1);
  }
}

main();
