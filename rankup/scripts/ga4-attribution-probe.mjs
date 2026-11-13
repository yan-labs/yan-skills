#!/usr/bin/env node
/**
 * GA4 来源归因探针：用真实 Chrome（opencli browser）从「来源页」跳到目标站，读 GA4 collect 请求里的 dl/dr。
 * 用途：确认 utm 与 referrer 是否真的进了 GA4（session source 由首个命中的 dl 里的 utm 或 dr 决定）。
 *
 * 用法：
 *   node ga4-attribution-probe.mjs --url 'https://example.com/?utm_source=chatgpt.com' [--from https://www.bing.com/] [--session ga4-attribution-probe] [--wait 9]
 * 参数：
 *   --url   目标落地页（可带 utm）。--from 来源页，默认 https://www.bing.com/（无需登录，referrer 策略会传 origin）。
 *   --wait  跳转后等待秒数，期间会滚动一次以触发「交互或 6 秒后才加载」的延迟 SDK。默认 20（轮询，读到即停）。
 * 输出：JSON {landing, documentReferrer, hits:[{tid,en,dl,dr,ss,seg}]}；不输出 cid/uid 等标识。
 * 判读：首个命中 dr 为空且 dl 不含 utm → GA4 记 direct。exit 2 = 没抓到 collect 请求（需复查，不算通过）。
 * 依赖：Mac Mini 上 opencli 扩展已连接（opencli doctor）。不注入、不重放分析请求；每次运行 = 目标站 1 次真实访问，注意别刷量。
 * 已知坑：collect 请求可能走 sendBeacon/fetch，靠 Resource Timing 读 URL（请求体里的批量事件读不到，dl/dr 在 URL 上）；
 *         重页面（rapselfie、aivideoraindance）collect 常在 10 秒后才发，脚本每 2 秒轮询直到 --wait 用完；opencli network 抓不到 collect URL，别用。
 *         来源页若有人机验证会停在来源页，此时换 --from。
 * 验证：2026-11-13 在 rapselfie.com / hotellobby.live 等模板站跑通。
 */
import { execFileSync } from "node:child_process";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, cur, i, arr) => {
  if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "true" : arr[i + 1]]);
  return acc;
}, []));
if (!args.url) { console.error("缺 --url"); process.exit(1); }
const session = args.session || "ga4-attribution-probe";
const from = args.from || "https://www.bing.com/";
const waitSec = Number(args.wait || 20);
const run = (...a) => execFileSync("opencli", ["browser", session, ...a], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const evalJson = (js) => {
  const out = run("eval", js).trim();
  const m = out.match(/\{[\s\S]*\}|\[[\s\S]*\]|"[\s\S]*"/);
  let v = JSON.parse(m ? m[0] : out);
  if (typeof v === "string") { try { v = JSON.parse(v); } catch {} }
  return v;
};

try {
  run("open", from);
  run("wait", "time", "2");
  run("eval", `location.href = ${JSON.stringify(args.url)}; "ok"`);
  run("wait", "time", "3");
  try { run("scroll", "down"); } catch {}
  const read = () => evalJson(`JSON.stringify({
    landing: location.href,
    documentReferrer: document.referrer,
    hits: performance.getEntriesByType("resource").filter(e => /\\/g\\/collect/.test(e.name)).map(e => {
      const u = new URL(e.name), p = u.searchParams;
      return { host: u.host, tid: p.get("tid"), en: p.get("en"), dl: p.get("dl"), dr: p.get("dr"), ss: p.get("_ss"), seg: p.get("seg") };
    })
  })`);
  let result = read();
  for (let waited = 3; !result.hits?.length && waited < waitSec; waited += 2) {
    run("wait", "time", "2");
    result = read();
  }
  console.log(JSON.stringify(result, null, 2));
  if (!result.hits?.length) process.exitCode = 2;
} finally {
  try { run("close"); } catch {}
}
