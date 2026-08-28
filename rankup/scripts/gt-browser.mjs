#!/usr/bin/env node
/**
 * gt-browser — Google Trends 的 OpenCLI 路由
 *
 * pytrends 走的是没有凭据的匿名请求，Google 对它限流极狠（429 是常态）。
 * 这个脚本改走用户本机那个已登录的 Chrome：打开 trends.google.com，
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
  return `rankup-gt-trends-${suffix}`;
}
const EXPLORE_URL = "https://trends.google.com/trends/explore?hl=en-US";
const OPENCLI = process.env.GT_OPENCLI ?? "opencli";
// How long to let the Trends bundle boot before querying its APIs from the page.
const SETTLE_MS = 5000;
// The bridge intermittently drops a large eval result; reopening clears it.
const EMPTY_RESULT_ATTEMPTS = 3;

const PRESETS = {
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
function extractor({ keywords, geo, timeframe, resolution }) {
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
  const req = {comparisonItem: kws.map(k => ({keyword: k, geo: ${JSON.stringify(geo)}, time: ${JSON.stringify(timeframe)}})), category: 0, property: ""};
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
  for (let i = 0; i < kws.length; i++) {
    const w = pick('RELATED_QUERIES_' + i) || (kws.length === 1 ? pick('RELATED_QUERIES') : null);
    out.related.push(await wd('relatedsearches', w));
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
  const settleMs = SETTLE_MS * attempt;
  const commands = JSON.stringify([
    ...(open ? [
      { cmd: "open", args: { url: EXPLORE_URL } },
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
    die(`opencli 调用失败：${msg.trim().slice(0, 400)}`);
  }
  // opencli 会在 stdout 里混 npm 升级提示，取第一个 JSON 数组
  const start = raw.indexOf("[");
  if (start < 0) die(`opencli 没有返回 JSON：${raw.slice(0, 300)}`);
  let steps;
  try {
    steps = JSON.parse(raw.slice(start));
  } catch {
    die(`解析 opencli 输出失败：${raw.slice(0, 300)}`);
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
    die(`页面取数失败：${err}`);
  }
  const data = evalStep.result?.value ?? evalStep.result;
  if (retry && data?.error === "wrong_page") {
    return runBatch(js, session, { retry: false, open: true });
  }
  if (!data || data.error) {
    if (String(data?.error).includes("_429")) {
      die("Google 在浏览器里也限流了（429）。这次是真的要等，或者换网络");
    }
    die(`Trends 接口返回异常：${data?.error || "空结果"}`);
  }
  // An empty object means the eval result never came back. The extractor itself
  // always returns at least `keywords`, so this is the bridge dropping it rather
  // than Trends answering — reopening with a longer settle clears it most of the
  // time. Never report it as "no search volume"; that is a wrong answer that looks
  // like a real one.
  if (!Object.keys(data).length) {
    if (attempt < EMPTY_RESULT_ATTEMPTS) {
      closeSession(session);
      return runBatch(js, session, { retry, open: true, attempt: attempt + 1 });
    }
    die(`Trends 连续 ${EMPTY_RESULT_ATTEMPTS} 次返回空结果——页面脚本没跑完或结果没回传，不是没有搜索量。稍后重试`);
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

function fetchTrends(keywords, opts, { resolution } = {}) {
  if (keywords.length > 5) die("Google Trends 一次最多对比 5 个关键词");
  const geo = opts.geo ?? "";
  const timeframe = toTimeframe(opts.time);
  const session = opts.session ?? defaultSession();
  try {
    return { data: runBatch(extractor({ keywords, geo, timeframe, resolution }), session), geo, timeframe };
  } finally {
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

function cmdCompare(kws, opts) {
  if (!kws.length) die("compare 需要至少 1 个关键词，最多 5 个");
  const { data, geo, timeframe } = fetchTrends(kws, opts);
  const tl = data.timeseries?.default?.timelineData;
  if (!tl?.length) die(widgetUnavailable(data.timeseries, "热度曲线") ?? "没有数据：关键词太冷门，或该地区/时间范围内无足够搜索量");

  let rows;
  let note = "";
  if (!opts.raw && tl.length > 30) {
    // 按月聚合。formattedAxisTime 的粒度随 timeframe 变，用 time 时间戳更可靠。
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
    rows = tl.map((p) => [
      new Date(Number(p.time) * 1000).toISOString().slice(0, 10),
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
  const { data, geo, timeframe } = fetchTrends(list, opts, {
    resolution: opts.geo ? "REGION" : "COUNTRY",
  });
  const gm = data.geo?.default?.geoMapData;
  if (!gm?.length) die(widgetUnavailable(data.geo, "地区分布") ?? "没有地区数据");
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
  const { data, geo, timeframe } = fetchTrends(kws, opts);
  const ranked = data.related?.[0]?.default?.rankedList;
  const relatedProblem = widgetUnavailable(data.related?.[0], "相关查询");
  if (!ranked && relatedProblem) die(relatedProblem);
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
        "  --session NAME  会话名（默认 rankup-gt-trends-<每对话唯一后缀>）",
        "  --keep-session  跑完保留会话，连续查询后用 close 释放",
      ].join("\n"),
    );
    process.exit(0);
  }
  const cmd = argv[0];
  if (!COMMANDS[cmd]) die(`未知子命令 ${cmd}，可用：${Object.keys(COMMANDS).join(", ")}`);
  const { kws, opts } = parseArgs(argv.slice(1));
  COMMANDS[cmd](kws, opts);
}

main();
