import assert from "node:assert/strict";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// gt-browser.mjs 2026-09-09 二次切版：取数点从「读 opencli 网络记录」（network 命令，
// 本机实测反复返回空列表）改成「页面内 fetch/XHR 抓包」（compare/related）+
// 「DOM 解析」（region，因为 qrLOJd 几乎总是在抓包壳子装好前就已经发完，抓不到）。
// 这份 fake opencli 模拟的就是这条新链路：
//   - batch: open + eval(装抓包壳子) + eval(settle)
//   - eval: pollCapture 的轮询 JS（从 js 源码里正则出 rpcid，查 FIXTURES 命中就回)
//   - eval: region 的 readRowsJs（查 DOM 行，只模拟单页，够 --top 5 用）
//   - scroll: 真实滚动命令，no-op 即可
//   - click: region 翻页按钮，测试里不需要翻页，直接回 clicked:false 结束分页
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

// g4kJzf 真实响应【实测确认，2026-09-09】比最初勘探记的多包一层：
// [[[keyword, ?, ?, ?, [[value, roundedValue, [[startEpoch],[endEpoch]], flag, ?], ...]], ...]]
// 这份 fixture 特意保留这层多余的外层数组，用来校验 cmdCompare 的兼容解包逻辑。
const FIXTURES = {
  g4kJzf: wrbBody("g4kJzf", [
    [
      ["demo", null, null, 40, [
        [10.4, 10, [[1704067200], [1704672000]], false, 1],
        [20.6, 20, [[1704672000], [1705276800]], false, 1],
      ]],
    ],
  ]),
  fXqlme: wrbBody("fXqlme", [
    ["demo", [["demo breakout term", 5000, 1]], [["demo top term", 100, -1]]],
  ]),
};

await writeFile(fakeOpencli, `#!/usr/bin/env node
import { appendFileSync, writeFileSync } from "node:fs";

const FIXTURES = ${JSON.stringify(FIXTURES)};
const args = process.argv.slice(2);
appendFileSync(process.env.GT_FAKE_LOG, JSON.stringify(args) + "\\n");

if (args.includes("close")) process.exit(0);

const sub = args[2]; // browser <session> <sub> ...
if (sub === "batch") {
  const commands = JSON.parse(args[args.indexOf("--commands") + 1]);
  console.log(JSON.stringify(commands.map((c, index) => ({ cmd: c.cmd, index, ok: true, result: { installed: true, value: true } }))));
  process.exit(0);
}
if (sub === "scroll") {
  console.log("Scrolled down");
  process.exit(0);
}
if (sub === "click") {
  // region 分页：测试用例里 --top <= 5，第一页就够，直接告诉调用方翻页到底了。
  console.log(JSON.stringify({ clicked: false }));
  process.exit(0);
}
if (sub === "eval") {
  const js = args[3] || "";
  const rpcMatch = js.match(/rpcids=([a-zA-Z0-9]+)/);
  if (rpcMatch && js.includes("__gtCapture")) {
    const rpcid = rpcMatch[1];
    const body = FIXTURES[rpcid];
    console.log(JSON.stringify(body ? { resBody: body, via: "fake" } : null));
    process.exit(0);
  }
  if (js.includes("data-geo-code") && js.includes("querySelectorAll")) {
    // region 的 readRowsJs：模拟两行数据，aria-label 覆盖单/多关键词两种真实格式。
    console.log(JSON.stringify([
      { code: "US", name: "United States", al: "demo: 42" },
      { code: "JP", name: "Japan", al: "demo: 7" },
    ]));
    process.exit(0);
  }
  // INSTALL_CAPTURE_JS / settle sleep 等其它 eval：只读探测，回个通用真值即可。
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

function run(args) {
  return spawnSync("python3", [gt, ...args], {
    encoding: "utf8",
    env: { ...process.env, GT_OPENCLI: fakeOpencli, GT_FAKE_LOG: log },
  });
}

try {
  const compare = run(["compare", "demo", "--time", "1m", "--session", "gt-browser-test"]);
  assert.equal(compare.status, 0, compare.stderr);
  assert.match(compare.stdout, /2024-01-01/, "compare 应按 g4kJzf 的 epoch 换算出日期");
  assert.match(compare.stdout, /\b10\b/, "compare 应取 roundedValue（第二个字段），不是浮点原值");

  const region = run(["region", "demo", "--top", "5", "--session", "gt-browser-test"]);
  assert.equal(region.status, 0, region.stderr);
  assert.match(region.stdout, /United States/);
  assert.match(region.stdout, /United States\s*\|\s*42/, "region 应从 DOM aria-label 里解析出 value");
  assert.match(region.stdout, /Japan\s*\|\s*7\s*\|/);

  const related = run(["related", "demo", "--session", "gt-browser-test"]);
  assert.equal(related.status, 0, related.stderr);
  assert.match(related.stdout, /demo breakout term/);
  assert.match(related.stdout, /demo top term/);
  assert.match(related.stdout, /Rising/, "related 输出应标注 Rising 区块（fXqlme entry[1]）");
  assert.match(related.stdout, /Top/, "related 输出应标注 Top 区块（fXqlme entry[2]）");

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
