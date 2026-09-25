#!/usr/bin/env node
// webcafe — 哥飞 SEO 工具箱官方命令行（https://seo.web.cafe/api/）
// Rankup 集成：2026-09-25 下载官方脚本；仅增加 Skill .env 读取，接口定义仍实时从服务端获取。
// 零依赖，Node.js 18+。接口清单从服务端实时拉取，新接口上线不用更新本脚本。
//
//   webcafe login <令牌>                     保存令牌（在 https://seo.web.cafe/api/ 登录后生成）
//   webcafe tools                            列出全部接口与价格
//   webcafe <接口> [主参数] [--参数 值 ...]   调用接口，例如：
//     webcafe keyword_difficulty "ai image editor"
//     webcafe domain_traffic canva.com figma.com
//     webcafe keyword_ideas "ai headshot" --limit 100 --gl us
//   webcafe me                               积分余额（API 只扣余额，每日赠送仅限网站使用）
//   webcafe usage [--limit 50] [--api]       扣费明细（网站 + API 同一本账）
//
// 令牌也可以放在环境变量 WEBCAFE_TOKEN；接口地址可用 WEBCAFE_API 覆盖（默认 https://seo.web.cafe）。
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.0.0";
const CONF_DIR = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "webcafe");
const CONF_FILE = join(CONF_DIR, "config.json");
const TOOLS_FILE = join(CONF_DIR, "tools.json");
const TOOLS_TTL_MS = 6 * 3600 * 1000;
// 从 Claude Skills 目录里跑的，扣费明细里记成「Skills」，方便用户分清是谁花的
const SELF = (() => { try { return fileURLToPath(import.meta.url); } catch { return ""; } })();
const CLIENT = process.env.WEBCAFE_CLIENT === "skill" || /[\\/]skills[\\/]/.test(SELF) ? "webcafe-skill" : "webcafe-cli";

function readJson(file) { try { return JSON.parse(readFileSync(file, "utf8")); } catch { return null; } }
function writeJson(file, obj) {
  mkdirSync(CONF_DIR, { recursive: true });
  writeFileSync(file, JSON.stringify(obj, null, 2), { mode: 0o600 });
}
const conf = () => readJson(CONF_FILE) || {};
const apiBase = () => String(process.env.WEBCAFE_API || conf().api || "https://seo.web.cafe").replace(/\/+$/, "");
function skillToken() {
  try {
    const env = readFileSync(join(dirname(SELF), "..", ".env"), "utf8");
    const line = env.split(/\r?\n/).find((s) => /^\s*WEBCAFE_TOKEN\s*=/.test(s));
    return line ? line.slice(line.indexOf("=") + 1).trim().replace(/^(['"])(.*)\1$/, "$2") : "";
  } catch { return ""; }
}
const token = () => process.env.WEBCAFE_TOKEN || skillToken() || conf().token || "";

function die(msg, code = 2) { process.stderr.write(msg + "\n"); process.exit(code); }

async function request(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "User-Agent": `${CLIENT}/${VERSION}`, Accept: "application/json" };
  if (auth) {
    const t = token();
    if (!t) die("还没有令牌：先到 https://seo.web.cafe/api/ 登录生成，再运行 webcafe login <令牌>（或设置环境变量 WEBCAFE_TOKEN）");
    headers.Authorization = "Bearer " + t;
  }
  if (body) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetch(apiBase() + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    die("网络错误：" + (e?.cause?.message || e.message), 1);
  }
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text.slice(0, 300) || "HTTP " + res.status }; }
  return { status: res.status, headers: res.headers, data };
}

async function loadTools(force = false) {
  const cached = readJson(TOOLS_FILE);
  if (!force && cached && cached.api === apiBase() && Date.now() - cached.at < TOOLS_TTL_MS) return cached.tools;
  const r = await request("/api/v1/tools", { auth: false });
  if (r.status !== 200 || !Array.isArray(r.data?.tools)) {
    if (cached?.tools) return cached.tools;
    die("拉取接口清单失败：" + (r.data?.error || "HTTP " + r.status), 1);
  }
  try { writeJson(TOOLS_FILE, { api: apiBase(), at: Date.now(), tools: r.data.tools }); } catch {}
  return r.data.tools;
}

// 开关类参数：后面跟的不是 true/false 就不吃掉它（否则 --json "ai image" 会把关键词当成开关的值）
const OUTPUT_FLAGS = new Set(["json", "md", "raw", "quiet", "api", "refresh"]);
const BOOL_WORD = /^(true|false|1|0|yes|no|on|off)$/i;

/** 解析 --k v / --k=v / --flag；其余是位置参数。boolKeys 里的参数只在后面跟着布尔词时才取值 */
function parseArgv(argv, boolKeys = OUTPUT_FLAGS) {
  const opts = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) { opts[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const k = a.slice(2), next = argv[i + 1];
      const takes = next !== undefined && !next.startsWith("--") && (!boolKeys.has(k) || BOOL_WORD.test(next));
      if (takes) { opts[k] = next; i++; } else opts[k] = true;
    } else pos.push(a);
  }
  return { opts, pos };
}

const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** 按接口的参数表把命令行参数变成请求体：数组可以写 a,b,c 或重复位置参数，第一个必填参数可以直接写成位置参数 */
function buildArgs(tool, opts, pos) {
  const params = tool.params || {};
  const args = {};
  if (typeof opts.data === "string") {
    try { Object.assign(args, JSON.parse(opts.data)); } catch { die("--data 不是合法 JSON"); }
  }
  for (const [rawKey, v] of Object.entries(opts)) {
    const k = params[rawKey] ? rawKey : camel(rawKey);
    if (!params[k]) continue;
    const t = params[k].type;
    if (t === "array") args[k] = String(v).split(",").map((s) => s.trim()).filter(Boolean);
    else if (t === "number" || t === "integer") args[k] = Number(v);
    else if (t === "boolean") args[k] = v === true || /^(1|true|yes|on)$/i.test(String(v));
    else args[k] = String(v);
  }
  if (pos.length) {
    const first = (tool.required || [])[0] || Object.keys(params)[0];
    if (!first) die(`${tool.id} 不接受位置参数`);
    if (args[first] !== undefined) die(`参数 ${first} 重复给了`);
    args[first] = params[first]?.type === "array" ? pos.flatMap((p) => p.split(",")).map((s) => s.trim()).filter(Boolean) : pos.join(" ");
  }
  return args;
}

function toolHelp(tool) {
  const lines = [`${tool.id} — ${tool.title}`, "", tool.summary, "", `计费：${tool.price?.label || "-"}`, "", "参数："];
  for (const [k, p] of Object.entries(tool.params || {})) {
    const req = (tool.required || []).includes(k) ? "（必填）" : "";
    lines.push(`  --${k.padEnd(22)} ${p.type}${req}  ${p.description || ""}${p.enum ? "  可选：" + p.enum.join("/") : ""}`);
  }
  lines.push("", "示例：", `  webcafe ${tool.id} ` + Object.entries(tool.example || {}).map(([k, v]) => `--${k} ${JSON.stringify(Array.isArray(v) ? v.join(",") : v)}`).join(" "));
  return lines.join("\n");
}

function help() {
  return `webcafe ${VERSION} — 哥飞 SEO 工具箱命令行（按次扣 seo.web.cafe 的积分余额）

用法：
  webcafe login <令牌>            保存令牌（https://seo.web.cafe/api/ 登录后生成）
  webcafe logout                  删除本机保存的令牌
  webcafe tools [--refresh]       列出全部接口与价格
  webcafe help <接口>             查看某个接口的参数
  webcafe <接口> [主参数] [--参数 值]
  webcafe me                      积分余额（API 只扣余额）
  webcafe usage [--limit 50] [--api]   扣费明细

输出：默认有报告就打印报告、否则打印 JSON；--json 只要 JSON 数据，--md 只要报告，
      --raw 打印完整响应（含扣费与请求号），--out 文件 写到文件，--quiet 不打印扣费提示。
参数：数组写成 a,b,c；也可以 --data '{"keywords":["a","b"]}' 整体传 JSON。
环境变量：WEBCAFE_TOKEN（令牌）、WEBCAFE_API（接口地址）`;
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || "help").toLowerCase();
  let { opts, pos } = parseArgv(argv.slice(1));

  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    if (pos[0]) {
      const tools = await loadTools();
      const id = pos[0].replace(/-/g, "_");
      const tool = tools.find((t) => t.id === id);
      if (!tool) die(`没有接口 ${pos[0]}，运行 webcafe tools 看全部`);
      return console.log(toolHelp(tool));
    }
    return console.log(help());
  }
  if (cmd === "version" || cmd === "--version" || cmd === "-v") return console.log(VERSION);

  if (cmd === "login") {
    const t = pos[0] || process.env.WEBCAFE_TOKEN;
    if (!t) die("用法：webcafe login <令牌>");
    writeJson(CONF_FILE, { ...conf(), token: t.trim() });
    const r = await request("/api/v1/me");
    if (r.status !== 200) die("令牌无效：" + (r.data?.error || "HTTP " + r.status), 1);
    return console.log(`已登录：${r.data.user?.name || r.data.user?.sub}（${r.data.user?.tier}），令牌保存在 ${CONF_FILE}`);
  }
  if (cmd === "logout") {
    const c = conf();
    delete c.token;
    if (Object.keys(c).length) writeJson(CONF_FILE, c); else if (existsSync(CONF_FILE)) rmSync(CONF_FILE);
    return console.log("已删除本机保存的令牌");
  }
  if (cmd === "tools") {
    const tools = await loadTools(!!opts.refresh);
    if (opts.json) return console.log(JSON.stringify(tools, null, 2));
    for (const group of ["composed", "method", "raw"]) {
      console.log({ composed: "\n【哥飞组装】", method: "\n【方法论与知识库】", raw: "\n【原始数据】" }[group]);
      for (const t of tools.filter((x) => x.group === group)) console.log(`  ${t.id.padEnd(26)} ${t.title}  ·  ${t.price?.label || ""}`);
    }
    return console.log("\n查看参数：webcafe help <接口>");
  }
  if (cmd === "me" || cmd === "balance" || cmd === "whoami") {
    const r = await request("/api/v1/me");
    if (r.status !== 200) die(r.data?.error || "HTTP " + r.status, 1);
    if (opts.json) return console.log(JSON.stringify(r.data, null, 2));
    const d = r.data;
    console.log(`${d.user?.name || d.user?.sub}（${d.user?.tier}）`);
    console.log(`积分余额：${d.wallet ? d.wallet.balance : 0}${d.wallet?.dayCap ? `（今日已扣 ${d.wallet.daySpent} / 每日上限 ${d.wallet.dayCap}）` : ""}`);
    console.log(`API 现在可用：${d.apiAvailable == null ? "不限" : d.apiAvailable} 积分（每日赠送额度仅限网站使用，API 不扣）`);
    return console.log(`购买积分：${d.buy}`);
  }
  if (cmd === "usage") {
    const q = new URLSearchParams({ limit: String(opts.limit || 50), scope: opts.api ? "api" : "all" });
    const r = await request("/api/v1/usage?" + q);
    if (r.status !== 200) die(r.data?.error || "HTTP " + r.status, 1);
    if (opts.json) return console.log(JSON.stringify(r.data, null, 2));
    for (const it of r.data.items || []) {
      const sign = it.delta > 0 ? "+" + it.delta : String(it.delta);
      console.log(`${it.at.replace("T", " ").slice(0, 19)}  ${sign.padStart(6)}  ${it.pool === "gift" ? "赠送" : "余额"}  ${it.reason}${it.detail ? "  " + it.detail : ""}`);
    }
    return;
  }

  // 其余都当接口名
  const tools = await loadTools();
  const id = cmd.replace(/-/g, "_");
  let tool = tools.find((t) => t.id === id);
  if (!tool) { tool = (await loadTools(true)).find((t) => t.id === id); }
  if (!tool) die(`没有接口 ${cmd}，运行 webcafe tools 看全部`);
  // 知道是哪个接口之后按它的参数表重新解析一遍：接口自己的布尔参数（force / onlyAvailable）也不该吃掉位置参数
  const boolKeys = new Set([...OUTPUT_FLAGS, ...Object.entries(tool.params || {}).filter(([, p]) => p.type === "boolean").map(([k]) => k)]);
  ({ opts, pos } = parseArgv(argv.slice(1), boolKeys));
  const toolOpts = Object.fromEntries(Object.entries(opts).filter(([k]) => !OUTPUT_FLAGS.has(k) && k !== "out"));
  const args = buildArgs(tool, toolOpts, pos);
  const missing = (tool.required || []).filter((k) => args[k] === undefined || (Array.isArray(args[k]) && !args[k].length));
  if (missing.length) die(`缺少参数：${missing.join(", ")}\n\n${toolHelp(tool)}`);

  const r = await request("/api/v1/" + tool.id, { method: "POST", body: args });
  const d = r.data || {};
  if (!d.ok) {
    process.stderr.write(`✗ ${d.error || "HTTP " + r.status}${d.requestId ? "（" + d.requestId + "）" : ""}\n`);
    if (d.code === "quota" && d.buy) process.stderr.write(`  购买积分：${d.buy}\n`);
    if (d.code === "day_cap") process.stderr.write(`  余额还在，不用购买：每日上限北京时间早上 8 点清零\n`);
    process.exit(1);
  }
  let out;
  if (opts.raw) out = JSON.stringify(d, null, 2);
  else if (opts.md) out = d.markdown || JSON.stringify(d.data, null, 2);
  else if (opts.json) out = JSON.stringify(d.data, null, 2);
  else out = d.markdown && process.stdout.isTTY ? d.markdown : JSON.stringify(d.data, null, 2);
  if (typeof opts.out === "string") writeFileSync(opts.out, out + "\n");
  else console.log(out);
  const c = d.credits || {};
  const left = c.balance == null ? "" : ` · 剩余 ${c.balance}${c.dayLeft != null && c.dayLeft < c.balance ? `（今日还可用 ${c.dayLeft}）` : ""}`;
  if (!opts.quiet) process.stderr.write(`✓ 扣 ${c.charged ?? "?"} 积分${left} · ${d.requestId}${typeof opts.out === "string" ? " · 已写入 " + opts.out : ""}\n`);
  // 快见底了不管 --quiet 都说一声：用到一半被拒比多一行提示糟得多
  if (c.low?.reason === "balance") process.stderr.write(`! 积分余额不多了，购买：${c.low.buy}\n`);
  else if (c.low?.reason === "day_cap") process.stderr.write(`! 今日上限快到了，北京时间早上 8 点清零\n`);
}

main().catch((e) => die("出错了：" + (e?.message || e), 1));
