import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// 三条命令只走旧版 Explore 页的 REST；REST 失败直接报错，无新版兜底。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const gt = path.join(root, "rankup/scripts/gt.py");
const base = await mkdtemp(path.join(tmpdir(), "gt-browser-test-"));
const fakeOpencli = path.join(base, "opencli");
const log = path.join(base, "opencli.log");

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

const REST_FIXTURES = ${JSON.stringify(REST_FIXTURES)};
const args = process.argv.slice(2);
appendFileSync(process.env.GT_FAKE_LOG, JSON.stringify(args) + "\\n");

if (args.includes("close")) process.exit(0);

// OpenCLI 2 的调用形状是 browser --session <名> <sub> ...；旧形状是 browser <名> <sub> ...，两种都认。
const si = args.indexOf("--session");
const rest = si >= 0 ? args.slice(si + 2) : args.slice(2);
const sub = rest[0];
if (sub === "eval") {
  const js = rest[1] || "";

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

  console.log(JSON.stringify({ installed: true, value: true }));
  process.exit(0);
}
if (sub === "screenshot") {
  writeFileSync(rest[1], "");
  console.log("Screenshot saved to: " + rest[1]);
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
  const compare = run(["compare", "demo", "--time", "2024-01-01:2024-01-08", "--session", "gt-browser-test"]);
  assert.equal(compare.status, 0, compare.stderr);
  assert.match(compare.stdout, /2024-01-01/, "compare 应按 timelineData.time 的 epoch 换算出日期");
  assert.match(compare.stdout, /2024-01-01\s*\|\s*10\b/, "compare 应取 value[i]");
  assert.match(compare.stdout, /峰值/);

  // --- compare：REST 失败直接报错 ---
  const compareFallback = run(["compare", "demo", "--time", "2024-01-01:2024-01-08", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.notEqual(compareFallback.status, 0);
  assert.match(compareFallback.stderr, /fake REST failure; HTTP=unknown/);

  const wrongWindow = run(["compare", "demo", "--time", "28d", "--session", "gt-browser-test"]);
  assert.notEqual(wrongWindow.status, 0, "old timestamps must not pass a current 28-day request");
  assert.match(wrongWindow.stderr, /do not match requested/);

  // --- region：REST 主路（comparedgeo）---
  const region = run(["region", "demo", "--top", "5", "--session", "gt-browser-test"]);
  assert.equal(region.status, 0, region.stderr);
  assert.match(region.stdout, /United States\s*\|\s*42/, "region 应从 geoMapData.value 解析出数值");
  assert.match(region.stdout, /Japan\s*\|\s*7\s*\|/);

  // --- region：REST 失败直接报错 ---
  const regionFallback = run(["region", "demo", "--top", "5", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.notEqual(regionFallback.status, 0);
  assert.match(regionFallback.stderr, /fake REST failure; HTTP=unknown/);

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

  // --- related：REST 失败直接报错 ---
  const relatedFallback = run(["related", "demo", "--session", "gt-browser-test"], { GT_FAKE_REST_FAIL: "1" });
  assert.notEqual(relatedFallback.status, 0);
  assert.match(relatedFallback.stderr, /fake REST failure; HTTP=unknown/);

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
