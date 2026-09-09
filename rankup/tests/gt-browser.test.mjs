import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// gt-browser.mjs 2026-09-09 四次切版：三条命令的**主路**都改成「在 trends.google.com
// 页面上下文里同源打旧版 REST 接口」（dataPath: rest）——
//   compare → /trends/api/widgetdata/multiline      （TIMESERIES widget）
//   region  → /trends/api/widgetdata/comparedgeo    （GEO_MAP widget）
//   related → /trends/api/widgetdata/relatedsearches（RELATED_QUERIES widget）
// 换路的原因是 opencli 标签页在本机是 visibilityState:"hidden"，渲染生命周期停摆，
// IntersectionObserver 不回调 → 新版页面的懒加载 widget（尤其 related）永远不发请求，
// 抓包/DOM 两条路都拿不到（完整根因见 gt-browser.mjs 文件头与 references/trends.md）。
// 兜底仍在：compare 保留 batchexecute 抓包，region 保留表格 DOM + 翻页，related 保留表格 DOM。
//
// 这份 fake opencli 模拟的就是这条新链路：
//   - batch: open + eval(装抓包壳子)
//   - eval(含 "widgetdata/"): REST 主路，按 widget id 回对应 fixture；
//     GT_FAKE_REST_FAIL=1 时统一回 {ok:false}，用来逼出兜底路径
//   - eval(含 "data-search-interest"): related 的 DOM 兜底探测
//   - eval(含 "data-geo-code"): region 的 DOM 兜底行读取
//   - eval(含 "rpcids=" + "__gtCapture"): compare 的抓包兜底
//   - eval(含 "scrollBehavior"): 同步滚动，回个现场
//   - click: region 翻页按钮，直接回 clicked:false 结束分页
//   - screenshot / close: 落空文件 / 退出 0

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const gt = path.join(root, "rankup/scripts/gt.py");
const base = await mkdtemp(path.join(tmpdir(), "gt-browser-test-"));
const fakeOpencli = path.join(base, "opencli");
const log = path.join(base, "opencli.log");

/** 把 payload 编码成 batchexecute 的 `)]}'` 分块响应体，decodeWrb() 能解出来的那种。 */
function wrbBody(rpcid, payload) {
  const inner = JSON.stringify(payload);
  const literal = JSON.stringify(inner); // 带引号、已转义的字符串字面量
  const triplet = `[["wrb.fr","${rpcid}",${literal},null,null,null,"generic"]]`;
  return `)]}'\n\n${triplet.length}\n${triplet}\n`;
}

// g4kJzf（compare 的抓包兜底）真实响应【实测，2026-09-09】比最初勘探记的多包一层。
const CAPTURE_FIXTURES = {
  g4kJzf: wrbBody("g4kJzf", [
    [
      ["demo", null, null, 40, [
        [10.4, 10, [[1704067200], [1704672000]], false, 1],
        [20.6, 20, [[1704672000], [1705276800]], false, 1],
      ]],
    ],
  ]),
};

// REST fixtures：结构照抄本机实测响应（去掉 `)]}'` 前缀后的那段 JSON）。
const REST_FIXTURES = {
  TIMESERIES: {
    default: {
      timelineData: [
        { time: "1704067200", value: [10], hasData: [true], formattedValue: ["10"] },
        { time: "1704672000", value: [20], hasData: [true], formattedValue: ["20"] },
      ],
    },
  },
  GEO_MAP: {
    default: {
      geoMapData: [
        { geoCode: "US", geoName: "United States", value: [42], formattedValue: ["42"], hasData: [true] },
        { geoCode: "JP", geoName: "Japan", value: [7], formattedValue: ["7"], hasData: [true] },
      ],
    },
  },
  // 【实测】rankedList[0] = Top（formattedValue 是 0-100 整数），[1] = Rising（Breakout/百分比）。
  // 这份 fixture 特意把两张榜的语义写死，用来把「下标 0/1 别搞反」钉在测试里。
  RELATED_QUERIES: {
    default: {
      rankedList: [
        { rankedKeyword: [{ query: "demo top term", value: 100, formattedValue: "100" }] },
        { rankedKeyword: [{ query: "demo breakout term", value: 5000, formattedValue: "Breakout" }] },
      ],
    },
  },
};

await writeFile(fakeOpencli, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";

const CAPTURE_FIXTURES = ${JSON.stringify(CAPTURE_FIXTURES)};
const REST_FIXTURES = ${JSON.stringify(REST_FIXTURES)};
const args = process.argv.slice(2);
appendFileSync(process.env.GT_FAKE_LOG, JSON.stringify(args) + "\\n");

if (args.includes("close")) process.exit(0);

const sub = args[2]; // browser <session> <sub> ...
if (sub === "batch") {
  const commands = JSON.parse(args[args.indexOf("--commands") + 1]);
  console.log(JSON.stringify(commands.map((c, index) => ({ cmd: c.cmd, index, ok: true, result: { installed: true, value: true } }))));
  process.exit(0);
}
if (sub === "scroll") { console.log("Scrolled down"); process.exit(0); }
if (sub === "click") {
  // region 的 DOM 兜底分页：测试用例 --top <= 5，第一页就够，直接说翻到底了。
  console.log(JSON.stringify({ clicked: false }));
  process.exit(0);
}
if (sub === "eval") {
  const js = args[3] || "";

  // 1) REST 主路
  if (js.includes("widgetdata/")) {
    if (process.env.GT_FAKE_REST_FAIL === "1") {
      console.log(JSON.stringify({ ok: false, err: "fake REST failure" }));
      process.exit(0);
    }
    const id = ["RELATED_QUERIES", "TIMESERIES", "GEO_MAP"].find((k) => js.includes('"' + k + '"'));
    const fx = id && REST_FIXTURES[id];
    console.log(JSON.stringify(fx ? { ok: true, body: JSON.stringify(fx) } : { ok: false, err: "no fixture for " + id }));
    process.exit(0);
  }

  // 2) related 的 DOM 兜底探测
  if (js.includes("data-search-interest")) {
    console.log(JSON.stringify({
      top: [{ query: "dom top term", value: "55", change: "+10%" }],
      rising: [{ query: "dom rising term", value: "3", change: "BREAKOUT" }],
      h3: ["Top queries", "Rising queries"],
    }));
    process.exit(0);
  }

  // 3) region 的 DOM 兜底：aria-label 覆盖单关键词格式。
  if (js.includes("data-geo-code")) {
    console.log(JSON.stringify([
      { code: "US", name: "United States", al: "demo: 42" },
      { code: "JP", name: "Japan", al: "demo: 7" },
    ]));
    process.exit(0);
  }

  // 4) compare 的抓包兜底
  const rpcMatch = js.match(/rpcids=([a-zA-Z0-9]+)/);
  if (rpcMatch && js.includes("__gtCapture")) {
    const body = CAPTURE_FIXTURES[rpcMatch[1]];
    console.log(JSON.stringify(body ? { resBody: body, via: "fake" } : null));
    process.exit(0);
  }

  // 5) 同步滚动（SCROLL_PANES_JS）与其它只读探测
  if (js.includes("scrollBehavior")) {
    console.log(JSON.stringify({ panes: 1, moved: true, top: 1400, height: 2036 }));
    process.exit(0);
  }
  console.log(JSON.stringify({ installed: true, value: true }));
  process.exit(0);
}
if (sub === "screenshot") {
  writeFileSync(args[3], "");
  console.log("Screenshot saved to: " + args[3]);
  process.exit(0);
}
console.log("{}");
`);
await chmod(fakeOpencli, 0o755);

function run(args, extraEnv = {}) {
  return spawnSync("python3", [gt, ...args], {
    encoding: "utf8",
    env: { ...process.env, GT_OPENCLI: fakeOpencli, GT_FAKE_LOG: log, ...extraEnv },
  });
}

try {
  // --- compare：REST 主路（multiline）---
  const compare = run(["compare", "demo", "--time", "1m", "--session", "gt-browser-test"]);
  assert.equal(compare.status, 0, compare.stderr);
  assert.match(compare.stdout, /2024-01-01/, "compare 应按 timelineData.time 的 epoch 换算出日期");
  assert.match(compare.stdout, /2024-01-01\s*\|\s*10\b/, "compare 应取 value[i]");
  assert.match(compare.stdout, /峰值/);

  // --- compare：REST 挂掉时回落到 batchexecute 抓包 ---
  const compareFallback = run(["compare", "demo", "--time", "1m", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.equal(compareFallback.status, 0, compareFallback.stderr);
  assert.match(compareFallback.stdout, /2024-01-01/, "抓包兜底也应换算出日期");
  assert.match(compareFallback.stdout, /\b10\b/, "抓包兜底应取 roundedValue（第二个字段），不是浮点原值");

  // --- region：REST 主路（comparedgeo）---
  const region = run(["region", "demo", "--top", "5", "--session", "gt-browser-test"]);
  assert.equal(region.status, 0, region.stderr);
  assert.match(region.stdout, /United States\s*\|\s*42/, "region 应从 geoMapData.value 解析出数值");
  assert.match(region.stdout, /Japan\s*\|\s*7\s*\|/);

  // --- region：REST 挂掉时回落到表格 DOM ---
  const regionFallback = run(["region", "demo", "--top", "5", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.equal(regionFallback.status, 0, regionFallback.stderr);
  assert.match(regionFallback.stdout, /United States\s*\|\s*42/, "DOM 兜底应从 aria-label 解析出 value");

  // --- related：REST 主路（relatedsearches）---
  const related = run(["related", "demo", "--session", "gt-browser-test"]);
  assert.equal(related.status, 0, related.stderr);
  assert.match(related.stdout, /demo breakout term\s*\|\s*Breakout/, "rankedList[1] 是 Rising，取 formattedValue");
  assert.match(related.stdout, /demo top term\s*\|\s*100/, "rankedList[0] 是 Top，取 formattedValue");
  // 顺序不能搞反：Rising 区块必须在 Top 区块之前，且各自的词落在自己的区块里。
  const risingIdx = related.stdout.indexOf("Rising");
  const topIdx = related.stdout.indexOf("高频 Top");
  assert.ok(risingIdx > -1 && topIdx > risingIdx, "输出顺序应是 Rising 区块在前、Top 区块在后");
  assert.ok(related.stdout.indexOf("demo breakout term") < topIdx, "Breakout 词必须落在 Rising 区块里，不能串到 Top");
  assert.ok(related.stdout.indexOf("demo top term") > topIdx, "0-100 的词必须落在 Top 区块里");

  // --- related：REST 挂掉时回落到表格 DOM ---
  const relatedFallback = run(["related", "demo", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.equal(relatedFallback.status, 0, relatedFallback.stderr);
  assert.match(relatedFallback.stdout, /dom rising term/);
  assert.match(relatedFallback.stdout, /dom top term\s*\|\s*55\s*\|\s*\+10%/, "DOM 兜底给的是 query/value/change 三列");
  assert.match(relatedFallback.stdout, /DOM 兜底取数/, "走兜底时要在输出里明说，别让判读者以为是主路数据");

  const related2kw = run(["related", "a", "b", "--session", "gt-browser-test"]);
  assert.notEqual(related2kw.status, 0, "related 应拒绝多个关键词（跟旧版契约一致）");

  const pytrends = run(["compare", "demo", "--via", "pytrends"]);
  assert.notEqual(pytrends.status, 0, "新版主用脚本不应静默接受 --via pytrends");
  assert.match(pytrends.stderr, /archive\/gt-v1/, "报错应指向归档版而不是静默失败");

  const close = run(["close", "--session", "gt-browser-test"]);
  assert.equal(close.status, 0, close.stderr);

  console.log("gt-browser: PASS");
} finally {
  await rm(base, { recursive: true, force: true });
}
