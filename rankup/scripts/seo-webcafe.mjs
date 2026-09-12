#!/usr/bin/env node
/**
 * seo.web.cafe 统一驱动 —— 一个脚本覆盖全部有后端的工具。
 *
 * 为什么是一个脚本而不是每个工具一个：这些工具的调用形状完全一致——
 * 抓工具页 HTML 拿到该工具专属的 X-<TOOL>-Token，再 POST 到 /<工具>/api/<动作>。
 * 差异只在端点名和请求体字段。拆成多个脚本会把同一段取令牌逻辑抄很多遍。
 *
 * 认证：**默认登录态，零配置即可跑到登录/VIP 档；游客是显式降级**。
 *   - 除 kd 外的全部工具：默认经 OpenCLI 驱动用户本机已登录的 Chrome 执行请求
 *     （浏览器天然带 Cookie，脚本从已登录页面的 HTML 里正则抽同一份令牌与请求头名，
 *     发 credentials:"include" 请求）。只有 `--guest` 显式要求，或 OpenCLI 不可用/
 *     驱动失败，才落回 node 侧裸 fetch——那条路径没有 Cookie，配额停在匿名档 10/日，
 *     回退时脚本会在 stdout 打印醒目警告，不会悄悄发生。
 *   - kd 走公开 API，需要 SEO_WEBCAFE_TOKEN（wc_mcp_ 开头，在 /kd/docs 自助生成）。
 *     **这条命令本身就是登录态**：登录态体现在生成令牌时的账号上，不是浏览器 Cookie 上
 *     （实测 `/kd/api/v1/kd` 带 Cookie 不带 Bearer 直接 401，两条鉴权路径不通用，
 *     不能像别的工具那样转发进浏览器执行）。quota 探测默认经浏览器读同一个
 *     `/kd/api/me`，比 node 侧裸 fetch（只认 IP，永远打「游客」）准得多。
 *
 * 边界：本脚本只读取服务端主动下发给当前访问者的令牌，等同于页面自身的行为。
 * 它不推导、不伪造令牌的生成算法——那属于绕过访问控制，不做。
 *
 * 已验证：2026-08-07（匿名与登录 VIP 两种身份都实测通过）；2026-09-11 加登录态浏览器默认路径
 * （事故：三个执行者把 kd 的访客 IP 计数误报当成令牌真实上限，批量刚起步就以为耗尽——
 * 同时实测证伪「chat 一次多词更省配额」：5 词一条消息扣 31 点，比逐词调 kd（1/词）贵得多，
 * 批量选词仍应走 kd，不要切去 chat）。
 * 双证人化改造 2026-08-30：本地命令只出数值（评级/命名迁 references/seo-webcafe.md）；
 * 非 200 / 解析失败的响应原文恒久化到 --out 目录或 .rankup/evidence/。
 * 验证过的端点见 ../references/seo-webcafe.md 的「补录」一节。
 *
 * 已知坑（都踩过，别再踩）：
 *   - worth / backlink / adsense 的请求体字段是 `input`，不是 domain 或 url。
 *     传错会得到「请输入有效的域名或网址」，读起来像值不合法，实际是字段名不对。
 *   - history/api/analyze 返回 SSE 流不是 JSON，本脚本已单独处理。
 *   - 各工具令牌互不通用，必须各取各的。
 *   - **adsense/api/audit 现在也是 SSE**（实测 2026-08-24），事件类型是
 *     `step`（逐项体检进度）/ `ping`（心跳，忽略）/ `ai`（AI 逐字生成的叙述，
 *     和 done.report 里的结论是同一份东西的两种呈现，别当成两份结论）/
 *     `done`（终态，`data.report` 才是唯一权威的结构化结论）。
 *     这套格式和 history 的 delta 拼接、chat 的 session/delta/done 都不一样，
 *     三个工具各写各的解析器，别互相套。
 *   - translate/api/search 的字段是 `query`，mine/api/search 的字段是 `keyword`——
 *     两个几乎同构的工具字段名不统一，抄错会得到「参数错误」而不是明显的报错。
 *     而且 mine 的 organic 结果多出 `domain`/`isHomepage`/`skip`
 *     （`skip:true` 是大站黑名单，实测 reddit.com / play.google.com 被标记），
 *     两个端点的返回结构也不共用同一个解析/摘要逻辑。
 */

import { writeFileSync, mkdirSync, readFileSync, realpathSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { newEvidenceDir, writeManifest } from "./lib-scene.mjs";

const BASE = "https://seo.web.cafe";
/**
 * 固定会话名，驱动用户本机已登录的真实 Chrome（OpenCLI）。这是配额站，
 * 所以按 discipline.md 六「配额站不传 --session」同一条纪律：会话名在脚本里
 * 写死成描述性字面常量，不暴露成 CLI 参数，也绝不用 `$$`（Bash tool 里 PID
 * 每次调用都变，`open` 和 `eval` 会话名对不上，`eval` 就会对着空标签页执行）。
 */
const WEBCAFE_SESSION = "webcafe-nav";
/**
 * **必须显式带 User-Agent。** 实测不带这个头，任何请求都直接 403 Forbidden，
 * 而且返回的是 HTML 错误页不是 JSON，脚本里表现为「解析失败」而非「被拒绝」，
 * 极难定位。此前能跑是因为运行时恰好带了默认值，属于运气不是设计。
 */
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const TOKEN_RE = /[0-9]{13}\.[0-9a-f]{64}/;
const HEADER_RE = /X-[A-Z]{2,8}-Token/;

/** 端点契约表。每加一个工具只动这里。 */
const TOOLS = {
  kd: {
    official: true, // 走公开 API + Bearer 令牌
    path: "/kd/api/v1/kd",
    method: "GET",
    query: (a) => ({ keyword: req(a.keyword, "--keyword"), gl: a.gl || "us", hl: a.hl || "en", ...(a.force ? { force: "1" } : {}), ...(a.format ? { format: a.format } : {}) }),
    spacingMs: 6000, // 每分钟 10 次的保险丝
    desc: "关键词难度估算，唯一有公开 API 的工具",
  },
  serp: { tool: "serp", path: "/serp/api/serp", body: (a) => ({ keyword: req(a.keyword, "--keyword"), gl: a.gl || "us" }), desc: "第一页逐位解密" },
  serpPage: { tool: "serp", path: "/serp/api/page", body: (a) => ({ url: req(a.url, "--url"), keyword: req(a.keyword, "--keyword") }), desc: "单个 SERP 结果页的评分" },
  audit: { tool: "audit", path: "/audit/api/analyze", body: (a) => ({ url: req(a.url, "--url"), keyword: req(a.keyword, "--keyword") }), desc: "On Page 体检，40+ 项" },
  review: { tool: "review", path: "/review/api/analyze", body: (a) => ({ url: req(a.url, "--url"), keyword: req(a.keyword, "--keyword") }), desc: "页面军师" },
  worth: { tool: "worth", path: "/worth/api/estimate", body: (a) => ({ input: req(a.input, "--input"), model: a.model || "ai" }), desc: "网站价值估算" },
  backlink: { tool: "backlink", path: "/backlink/api/evaluate", body: (a) => ({ input: req(a.input, "--input") }), desc: "外链报价评估" },
  /**
   * **实测 2026-08-24：这条端点现在返回 `content-type: text/event-stream`，不再是 JSON。**
   * 旧版本没有 `sse` 标记，走的是 safeJson → 静默解析成 null，是脚本注释里点名的
   * 「最坏的一种失败，因为不报错」——本次就是修这个。用 `stepSse` 而不是复用
   * history 的 `sse` 或 chat 的 `chatSse`，因为事件形状三者都不同（见文件头注释）。
   */
  adsense: { tool: "adsense", path: "/adsense/api/audit", body: (a) => ({ input: req(a.input, "--input") }), stepSse: true, desc: "AdSense 过审预检（返回 SSE 流）" },
  history: { tool: "history", path: "/history/api/analyze", body: (a) => ({ domain: req(a.input, "--input") }), sse: true, desc: "域名前世，返回 SSE 流" },
  referring: { tool: "referring", path: "/referring/api/summary", method: "GET", desc: "Stripe 引荐流量榜总览（不计配额）" },
  /**
   * 榜单三个端点都**不计配额**，是这个站里唯一能无限量取的真实商业数据。
   * 单位坑：`visits` 的单位是**千次**（K），2692.6 表示 269 万次，不是 2692 次。
   */
  referringMonth: {
    tool: "referring",
    path: "/referring/api/month",
    method: "GET",
    query: (a) => ({ m: req(a.m, "--m") }),
    desc: "某月榜单全量（--m YYYYMM），不计配额",
  },
  referringSite: {
    tool: "referring",
    path: "/referring/api/site",
    method: "GET",
    query: (a) => ({ domain: req(a.domain, "--domain") }),
    desc: "单域名在榜历史（--domain），不计配额",
  },
  /**
   * SEO Agent：站内十余个工具的对话入口，会自行调用它们查真实数据再给结论。
   *
   * **和其余工具不同，它强制要求登录**：匿名调用返回
   * `401 {"code":"login"}`，而不是像别的工具那样先放行再扣访客配额。
   * 所以这条命令必须提供 SEO_WEBCAFE_COOKIE，没有替代路径。
   */
  chat: {
    tool: "chat",
    path: "/chat/api/chat",
    body: (a) => ({
      messages: [{ role: "user", content: req(a.ask, "--ask") }],
    }),
    needsLogin: true,
    /**
     * **返回的是 SSE 流，不是 JSON。** `content-type: text/event-stream`，
     * 直接 JSON.parse 会失败并静默得到 null —— 脚本看起来"成功"但内容是空的，
     * 这是最坏的一种失败，因为不报错。
     *
     * 实测事件结构（2026-08-09，登录 VIP 会话）：
     *   event: session  data: {sessionId, created, title}
     *   event: delta    data: {text}                        逐块正文，要按序拼接
     *   event: done     data: {toolCalls, rounds, charged, sessionId}
     *
     * `done` 里的 toolCalls / rounds / charged 必须报出来：不知道它调了哪些
     * 站内工具就拿到结论，等于把一个黑箱当权威。
     */
    chatSse: true,
    desc: "SEO Agent 对话（**必须登录**，匿名 401；返回 SSE 流）",
  },

  // ---- /translate/ 需求翻译器（令牌头 X-TR-Token，从 <meta name="tr-token"> 抽） ----
  // 令牌抽取复用 toolAuth()：它不关心令牌具体嵌在 <meta> 还是别的标签里，
  // 只在整页 HTML 里正则找 TOKEN_RE / HEADER_RE，所以这个工具不用额外代码。
  translateSearch: { tool: "translate", path: "/translate/api/search", body: (a) => ({ query: req(a.query, "--query") }), desc: "需求翻译：关键词 SERP 拆解（计 1）" },
  translatePage: { tool: "translate", path: "/translate/api/page", body: (a) => ({ url: req(a.url, "--url") }), desc: "需求翻译：单页面信号分析（不计配额）" },
  translateDomain: { tool: "translate", path: "/translate/api/domain", body: (a) => ({ domain: req(a.domain, "--domain") }), desc: "需求翻译：域名流量与关键词画像（每站计 1，无数据自动退）" },
  /**
   * pages/related/sites 三个数组都是「先跑 page/search/domain 拿到的结果原样传回来聚合」，
   * 不是新查询，所以本命令不额外发起抓取，也不计配额。数组用 JSON 字符串传，
   * 例如 --pages '[{"url":"..."}]'。
   */
  translateAggregate: {
    tool: "translate",
    path: "/translate/api/aggregate",
    body: (a) => {
      const pages = jsonArg(a.pages, "--pages") ?? [];
      const related = jsonArg(a.related, "--related") ?? [];
      const sites = jsonArg(a.sites, "--sites") ?? [];
      // 三个都不传 == 忘了先跑 page/search/domain 就直接聚合，而不是"确实没有可聚合的数据"。
      // 之前 ?? [] 把这两种情况混成同一个「聚合了 0 条」的静默结果，服务端大概率原样接受
      // 一个空聚合请求返回一份空报告——看起来像跑成功了，实际什么都没聚合。
      if (!pages.length && !related.length && !sites.length) {
        die("--pages/--related/--sites 三个都是空数组——先用 translatePage/translateSearch/translateDomain 取到数据再聚合，不要直接跑空的。");
      }
      return { pages, related, sites, query: req(a.query, "--query") };
    },
    desc: "需求翻译：把已取的 page/related/site 数据聚合成选词表（不计配额）",
  },
  translateMe: { tool: "translate", path: "/translate/api/me", method: "GET", desc: "需求翻译：查配额档位（不计配额）" },

  // ---- /mine/ 需求挖掘机（令牌头 X-MN-Token） ----
  // ⚠️ 和 translate 几乎同构但字段名不同：mine/api/search 传的是 `keyword`，
  //    不是 translate 那边的 `query`。抄错这一个词就会拿到「参数错误」。
  mineSeed: { tool: "mine", path: "/mine/api/seed", body: (a) => ({ input: req(a.input, "--input") }), desc: "需求挖掘：把输入判定成关键词还是网址（不计配额）" },
  /**
   * mineSearch 返回的 organic 比 translateSearch 多 `domain`/`isHomepage`/`skip` 三个字段，
   * `skip:true` 是大站黑名单（实测 reddit.com / play.google.com 会被标记），
   * 所以摘要逻辑必须单独写，不能套 translateSearch 那份。
   */
  mineSearch: { tool: "mine", path: "/mine/api/search", body: (a) => ({ keyword: req(a.keyword, "--keyword") }), desc: "需求挖掘：关键词 SERP（计 1，命中缓存不重复扣）" },
  minePage: { tool: "mine", path: "/mine/api/page", body: (a) => ({ url: req(a.url, "--url") }), desc: "需求挖掘：单页面信号分析（不计配额）" },
  mineDomain: { tool: "mine", path: "/mine/api/domain", body: (a) => ({ domain: req(a.domain, "--domain") }), desc: "需求挖掘：域名流量/DR/建站年龄（每站计 1，缓存或无数据自动退）" },
  mineKd: { tool: "mine", path: "/mine/api/kd", body: (a) => ({ keyword: req(a.keyword, "--keyword") }), desc: "需求挖掘：关键词难度（已搜过的词免费）" },
  mineReport: {
    tool: "mine",
    path: "/mine/api/report",
    method: "GET",
    query: (a) => (a.seed ? { seed: a.seed } : a.id ? { id: a.id } : die("mineReport 需要 --seed 或 --id 其中一个")),
    desc: "需求挖掘：取回一份已生成的挖掘报告（不计配额，--seed 或 --id 二选一）",
  },

  // ---- /domain/ 网站起名 AI（令牌头 X-DF-Token）----
  // 8 个端点里 5 个是 SSE，且事件类型各不相同（raw/names/model-error/done、
  // result、dr/traffic/reg、item/summary、step/audit）——没有强行统一成一种输出，
  // 而是让它们都走 genericSse（parseEventStream 透传 {event,data} 数组），
  // 调用方自己按事件名取需要的字段。省事，也不容易漏事件。
  domainIntent: { tool: "domain", path: "/domain/api/intent", body: (a) => ({ text: req(a.text, "--text"), hasCandidates: !!a.hasCandidates }), desc: "网站起名：从描述提炼意图与 brief" },
  /**
   * models 是模型 id 数组，例如 --models '["deepseek-v4-flash"]'。
   * deepseek-v4-flash 计 1、deepseek-v4-pro 计 2——**模型侧失败会在 done 事件里
   * 带 refunded:true 自动退配额，那是正常行为，不要把 model-error 事件当脚本 bug。**
   */
  domainName: {
    tool: "domain",
    path: "/domain/api/name",
    body: (a) => ({ brief: req(a.brief, "--brief"), models: jsonArg(a.models, "--models") ?? (a.model ? [a.model] : ["deepseek-v4-flash"]), sessionId: a.sessionId ?? null }),
    genericSse: true,
    desc: "网站起名：按 brief 生成候选名（SSE：raw/names/model-error/done，计配额按模型）",
  },
  // names/tlds 都是数组，一次核验的是笛卡尔积：--names '["foo","bar"]' --tlds '["com","io"]'
  domainCheck: { tool: "domain", path: "/domain/api/check", body: (a) => ({ names: reqJsonArrayArg(a.names, "--names"), tlds: reqJsonArrayArg(a.tlds, "--tlds") }), genericSse: true, desc: "网站起名：域名可注册性核验（SSE：逐个 result 事件）" },
  domainCollision: { tool: "domain", path: "/domain/api/collision", body: (a) => ({ name: req(a.name, "--name") }), desc: "网站起名：品牌撞名风险（普通 JSON，非 SSE）" },
  domainInsight: { tool: "domain", path: "/domain/api/insight", body: (a) => ({ domain: req(a.domain, "--domain") }), genericSse: true, desc: "网站起名：候选域名的 DR/流量/注册情况（SSE：dr/traffic/reg）" },
  domainReview: { tool: "domain", path: "/domain/api/review", body: (a) => ({ brief: req(a.brief, "--brief"), candidates: reqJsonArrayArg(a.candidates, "--candidates") }), genericSse: true, desc: "网站起名：AI 给候选名打分点评（SSE：item/summary）" },
  domainAudit: { tool: "domain", path: "/domain/api/audit", body: (a) => ({ candidates: reqJsonArrayArg(a.candidates, "--candidates") }), genericSse: true, desc: "网站起名：候选名的现占用/侵权风险审计（SSE：step/audit）" },
  domainSessions: { tool: "domain", path: "/domain/api/sessions", method: "GET", desc: "网站起名：列出历史起名会话（不计配额）" },
};

/**
 * 解析数组类参数（--names/--tlds/--pages/--candidates/--models 等）。
 * CLI 参数只能是字符串，数组必须以 JSON 字符串形式传入，例如
 *   --names '["foo","bar"]'
 * 不给该参数时返回 undefined（区别于「给了但解析失败」），后者要报错。
 */
function jsonArg(v, flag) {
  if (v === undefined || v === true) return undefined;
  let parsed;
  try {
    parsed = JSON.parse(v);
  } catch {
    die(`${flag} 需要合法 JSON 数组字符串，例如 '["a","b"]'（实际传入：${v}）`);
  }
  // 本文件里 jsonArg 目前只用来传数组（names/tlds/candidates/models/pages/related/sites），
  // 从没用来传对象。不校验的话 --models '"x"' 这种传了合法 JSON 但不是数组的输入
  // 会原样发给服务端，服务端大概率报「参数错误」，但这属于本该在本地就能拦住的坑。
  if (!Array.isArray(parsed)) die(`${flag} 必须是 JSON 数组，例如 '["a","b"]'（实际传入：${v}）`);
  return parsed;
}
/**
 * jsonArg 的必填版：不传或传了标志没跟值都直接报错。
 *
 * domainCheck 的 names/tlds、domainReview/domainAudit 的 candidates 之前用的是可选版
 * jsonArg——不传就返回 undefined，`JSON.stringify({names: undefined})` 会把这个键
 * **整个删掉**，body 变成 `{}` 发出去，服务端才回「参数错误」。这几条端点是计配额的，
 * 失败请求打过去时配额可能已经被扣，本该在发请求前就地拦下来。
 */
function reqJsonArrayArg(v, flag) {
  if (v === undefined || v === true) die(`缺少必需参数 ${flag}（JSON 数组，例如 '["a","b"]'）`);
  return jsonArg(v, flag);
}

/**
 * 纯客户端工具，没有后端，别去探。8 个里 4 个已经把内联 JS 的公式抄下来，
 * 复刻成本地命令（见下面的 LOCAL 表），零网络零配额，价值是能批量算。
 * 剩下 4 个明确不做，理由各不相同，逐个写清楚，免得后来人以为是漏做：
 *
 *   - traffic：CSV 解析 + 可视化，强绑一条上传的曲线数据，没有可复用的公式，
 *     批量价值低，不做。
 *   - influencer：单次议价场景（一次报价 vs 一个 YouTuber），不是能批量跑的东西，不做。
 *   - level：纯静态说明页，实测页面里 0 个 <input>/<form>，没有算法可复刻，不做。
 *   - gsc：实测页面全文 `fetch(` 只命中两处——VIP 门禁用的 `/gsc/api/me` 和
 *     教程文案用的 `/gsc/api/tutorial`，都不是数据接口；模拟数据是浏览器里
 *     `Math.random()` 现算的，没有后端也没有可抄的公式，不做。
 *     （gsc 原本没被列进这张表，容易被漏判成"忘了做"，这次一并标出来。）
 */
const CLIENT_ONLY = ["kgr", "string", "money", "email"]; // 已复刻成 LOCAL 本地命令
const NOT_DONE = {
  traffic: "CSV 解析+可视化，强绑上传的曲线数据，没有可复用公式，批量价值低",
  influencer: "单次议价场景，不是能批量跑的东西",
  level: "纯静态说明页，0 个 input/form，没有算法可复刻",
  gsc: "全文 fetch( 只命中 VIP 门禁 /gsc/api/me 和教程文案 /gsc/api/tutorial；模拟数据是浏览器 Math.random() 现算，无数据后端",
};

function req(v, flag) {
  // parseArgs 对「给了 flag 但没跟值」的编码是把值设成布尔 true（当成开关标志）。
  // 对于 req() 覆盖的这些「必须带值」的参数，true 不是合法值，而是「少打了一个值」，
  // 必须当成缺失处理——否则 --volume（不跟数字）会被当作字符串/布尔值静默往下传。
  if (v === undefined || v === null || v === "" || v === true) die(`缺少必需参数 ${flag}（给了标志但没跟值？）`);
  return v;
}
function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const cmd = argv[0];
  const a = {};
  for (let i = 1; i < argv.length; i++) {
    const t = argv[i];
    if (!t.startsWith("--")) die(`未知参数：${t}（用 --help 看用法）`);
    const k = t.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) a[k] = true;
    else { a[k] = next; i++; }
  }
  return { cmd, a };
}

/**
 * 批量模式：每行一组参数，跟顶层 --xxx 合并（行内同名字段覆盖顶层）。
 * 抽成独立函数是因为本地命令（kgr/string/money/email）和远端命令共用同一套
 * batch 文件格式——之前只有远端命令走了这条路，LOCAL 分支在 batch 逻辑之前就
 * return 了，HELP 却写着本地命令「可批量」，实测直接报「缺少必需参数」，
 * 承诺和行为对不上（可批量本来就是复刻这四个公式的全部理由）。
 */
function parseBatchRows(a) {
  if (!a.batch) return [a];
  return readFileSync(a.batch, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => ({
      ...a,
      ...Object.fromEntries(
        l.split(/\s+(?=[a-z]+=)/).map((kv) => { const i = kv.indexOf("="); return [kv.slice(0, i), kv.slice(i + 1)]; })
      ),
    }));
}

/**
 * Cookie 是**可选**的，只影响配额档位（匿名 10/日、登录 100/日、VIP 500/日）。
 * 已实测：完全不带 Cookie 时，工具页照样下发可用令牌，API 调用正常返回。
 * 所以本脚本零配置即可跑，配额不够时再补 Cookie。
 */
function cookie() {
  return process.env.SEO_WEBCAFE_COOKIE || "";
}
function authHeaders() {
  const c = cookie();
  return c ? { "user-agent": UA, cookie: c } : { "user-agent": UA };
}

/** 抓工具页 HTML，自助取该工具的令牌与请求头名。这一步不消耗查询配额。 */
const tokenCache = new Map();
async function toolAuth(tool) {
  if (tokenCache.has(tool)) return tokenCache.get(tool);
  const r = await fetch(`${BASE}/${tool}/`, { headers: authHeaders() });
  if (!r.ok) die(`取 /${tool}/ 页面失败：HTTP ${r.status}`);
  const html = await r.text();
  const tok = (html.match(TOKEN_RE) || [])[0];
  const hdr = (html.match(HEADER_RE) || [])[0];
  if (!tok || !hdr) {
    die(
      `在 /${tool}/ 的 HTML 里没找到令牌或请求头名。\n` +
        "多半是站点改版了令牌注入方式（不带 Cookie 本来也应该能拿到令牌）。\n" +
        "后者属于正常损耗，请更新本脚本顶部的 TOKEN_RE / HEADER_RE 并回写已验证日期。"
    );
  }
  const auth = { [hdr]: tok };
  tokenCache.set(tool, auth);
  return auth;
}

/**
 * 登录态默认路径（2026-09-11 事故修复）：驱动用户本机已登录的真实 Chrome（OpenCLI），
 * 把请求发进已登录的页面里执行，而不是抠 httpOnly cookie。
 *
 * 之前的版本只在 quotaPreflight 里打一段文字提示「你可以这样手动跑」，从不真的执行——
 * 结果是没人愿意手动敲那几行 opencli 命令，脚本实际上永远走 node 侧裸 fetch，
 * 永远匿名，永远访客档 10/日。三个执行者今天用同一个 KD_TOKEN 批量跑 kd 很快耗尽，
 * 就是把这条误导性的访客计数当成了真实上限（见 officialQuotaPreflight 的实测修正）。
 * 这里把「能力」变成「默认行为」：session 类工具默认经浏览器执行，访客只在
 * OpenCLI 不可用或显式 --guest 时作为兜底，并且兜底必须在 stdout 打印醒目警告。
 */
let _opencliAvailable;
function opencliAvailable() {
  if (_opencliAvailable !== undefined) return _opencliAvailable;
  try {
    execFileSync("which", ["opencli"], { stdio: "ignore" });
    _opencliAvailable = true;
  } catch {
    _opencliAvailable = false;
  }
  return _opencliAvailable;
}

/** 一个进程内同一个工具页只 open 一次——批量模式下同一 spec 会调很多次，没必要每次都重新导航。 */
const browserOpenedTools = new Set();
function opencliOpenTool(tool) {
  if (browserOpenedTools.has(tool)) return;
  execFileSync("opencli", ["browser", WEBCAFE_SESSION, "open", `${BASE}/${tool}/`], {
    encoding: "utf8",
    timeout: 30000,
  });
  browserOpenedTools.add(tool);
}

/** 在已打开的工具页里跑一段 eval，返回其 stdout（opencli 把结果 JSON 打到 stdout，警告走 stderr）。 */
function opencliEval(code) {
  return execFileSync("opencli", ["browser", WEBCAFE_SESSION, "eval", code], {
    encoding: "utf8",
    timeout: 30000,
  }).trim();
}

/**
 * 把一次 HTTP 请求发进浏览器里执行：页面自己抽令牌（同 toolAuth 的正则，但读的是
 * 浏览器里已登录会话渲染出的 HTML，天然带 Cookie）+ `credentials:"include"` 发请求。
 * 返回值形状对齐 callOfficial/callSession 的 {status, raw}，调用方按 spec.*Sse 继续解析。
 */
async function browserRequest(spec, a) {
  opencliOpenTool(spec.tool);
  const method = spec.method || "POST";
  const bodyStr = method === "POST" ? JSON.stringify(spec.body(a)) : null;
  const qs = method === "GET" && spec.query ? `?${new URLSearchParams(spec.query(a))}` : "";
  const code = `(async()=>{
    const html = document.documentElement.outerHTML;
    const tok = (html.match(${TOKEN_RE.toString()})||[])[0];
    const hdr = (html.match(${HEADER_RE.toString()})||[])[0];
    if (!tok || !hdr) return {__err: "在页面 HTML 里没找到令牌或请求头名，多半是站点改版了"};
    const headers = {[hdr]: tok};
    const opts = {method: ${JSON.stringify(method)}, credentials: "include", headers};
    ${bodyStr ? `headers["content-type"] = "application/json"; opts.body = ${JSON.stringify(bodyStr)};` : ""}
    const r = await fetch(${JSON.stringify(spec.path + qs)}, opts);
    const raw = await r.text();
    return {__status: r.status, __raw: raw};
  })()`;
  let out;
  try {
    out = opencliEval(code);
  } catch (e) {
    throw new Error(`opencli eval 执行失败（session=${WEBCAFE_SESSION}）：${String(e?.message || e).slice(0, 300)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch {
    throw new Error(`opencli eval 返回的不是预期 JSON：${out.slice(0, 300)}`);
  }
  if (parsed.__err) throw new Error(parsed.__err);
  return { status: parsed.__status, raw: parsed.__raw };
}

/**
 * 经浏览器读 `/<tool>/api/me`：不耗配额、不需令牌，返回值天然带 Cookie，
 * 所以读到的是**当前登录账号的真实档位**，不是 node 侧裸 fetch 那个只认 IP 的访客计数。
 * 用于两条 quotaPreflight 的默认路径；失败（OpenCLI 不可用/未登录/接口变了）时返回 null，
 * 调用方退回旧的访客 IP 计数并打印「这不是真实余额」的提示。
 */
function browserMeQuota(tool) {
  if (!opencliAvailable()) return null;
  try {
    opencliOpenTool(tool);
    const out = opencliEval(
      `(async()=>{ const r = await fetch(${JSON.stringify(`/${tool}/api/me`)}, {credentials:"include"}); const j = await r.json().catch(()=>null); return j; })()`
    );
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** 打印醒目的访客档降级警告，回退时必须显式喊出来，不能悄悄跑。 */
function warnGuestFallback(reason) {
  console.error(
    `\n⚠️⚠️⚠️  当前为游客档 10/日（${reason}），请启用登录态浏览器再跑正式批量。\n` +
      "    默认应经 OpenCLI 驱动你本机已登录的 Chrome（登录 100/日、VIP 500/日）；\n" +
      "    确认 `opencli doctor` 是绿的、Chrome 里已登录 seo.web.cafe，再重跑本命令。\n" +
      "    只有确实要临时用访客档时，才显式加 --guest 消掉这条警告。\n"
  );
}

// gt 合并进来之前,KD 令牌是放在 Skill 目录的 .env 里的(键名 KD_TOKEN),
// 只装一次就一直能用。合并后若只认环境变量,等于要求用户每次 export,
// 是无声的体验倒退,所以这里保留 .env 兜底,两个键名都认。
function officialToken() {
  const fromEnv = process.env.SEO_WEBCAFE_TOKEN || process.env.KD_TOKEN;
  if (fromEnv) return fromEnv.trim();
  const envFile = join(dirname(dirname(fileURLToPath(import.meta.url))), ".env");
  try {
    for (const line of readFileSync(envFile, "utf8").split("\n")) {
      const m = line.match(/^\s*(SEO_WEBCAFE_TOKEN|KD_TOKEN)\s*=\s*(.+?)\s*$/);
      if (m) return m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* 没有 .env 是正常情况,继续走下面的报错 */
  }
  return null;
}

async function callOfficial(spec, a) {
  const t = officialToken();
  if (!t) {
    die(
      "缺少 KD 令牌(wc_mcp_ 开头,在 https://seo.web.cafe/kd/docs 自助生成)。\n" +
        "两种给法:export SEO_WEBCAFE_TOKEN=...,或写进本 Skill 目录的 .env(KD_TOKEN= 亦可)。",
    );
  }
  const qs = new URLSearchParams(spec.query(a)).toString();
  const r = await fetch(`${BASE}${spec.path}?${qs}`, {
    headers: { Authorization: `Bearer ${t}`, "user-agent": UA },
  });
  const txt = await r.text();
  // format=markdown 时服务端返回 text/markdown，不是 JSON。
  // 之前这里一律 safeJson，于是 data 变成 null：终端打印「（非 JSON 响应）」，
  // --out 落盘写进 "data": null —— 报告内容被静默丢掉，最坏的一种失败。
  const ct = r.headers.get("content-type") || "";
  if (/markdown|text\/plain/.test(ct)) return { status: r.status, data: { markdown: txt }, raw: txt };
  return { status: r.status, data: safeJson(txt), raw: txt };
}

/**
 * kd 专用重试包装（2026-09-11 加）：`keywordVolume==null && cached===false` 说明面板侧
 * Google Trends 锚点校验没在这次请求的超时内跑完，不代表真的没有搜索量——今天实测
 * kreuzworträtsel 首查「—」，`--force` 重跑一次就拿到 40,620。批量跑 kd 时如果每次命中
 * 这种情况都要人工重跑一遍，等于把「批量」拆成两轮体力活，所以这里自动做，而不是
 * 每次都在报告里堆一串「建议 --force 重跑」然后指望有人手动执行。
 *
 * 只重试一次（花一次配额），用 spec.spacingMs（或 --spacing-ms）同一档间隔——不用更短的
 * 间隔硬冲，避免把偶发的锚点校验超时误诊成「fetch 快点就行」。两次都拿不到值才真的标
 * `anchorPending: true`，交给 summarize() 打印成 anchor-pending，不再暗示还能再试。
 * `format=markdown` 响应（data.markdown 而非 data.keywordVolume）不适用这条判断，直接透传。
 */
async function callOfficialKdWithRetry(spec, a, spacing) {
  const res = await callOfficial(spec, a);
  if (res.status !== 200 || !res.data || res.data.markdown) return res;
  const missed = res.data.keywordVolume == null && res.data.cached === false;
  if (!missed || a.force) return res;
  console.error(`  ⏳ ${a.keyword || "(未知词)"} → 锚点校验未完成，自动 --force 重试`);
  if (spacing) await new Promise((r) => setTimeout(r, spacing));
  const retry = await callOfficial(spec, { ...a, force: true });
  if (retry.status !== 200 || !retry.data) return retry;
  if (retry.data.keywordVolume == null && retry.data.cached === false) {
    retry.data.anchorPending = true;
    retry.data.volume = null;
    retry.data.reason = "anchor-pending";
  }
  return retry;
}

/** 按 spec 的流类型把 {status, raw} 解析成 {status, data, raw}——guest/browser 两条路径共用。 */
function finalizeSessionResult(spec, status, txt) {
  if (spec.chatSse) return { status, data: parseChatSse(txt), raw: txt };
  if (spec.stepSse) return { status, data: parseAdsenseSse(txt), raw: txt };
  if (spec.genericSse) return { status, data: parseGenericSse(txt), raw: txt };
  if (spec.sse) return { status, data: { text: parseSse(txt) }, raw: txt };
  return { status, data: safeJson(txt), raw: txt };
}

/**
 * 访客/手动 Cookie 路径（node 侧裸 fetch）。**这是降级路径，不是默认路径**——
 * 只有 --guest 显式要求、或 SEO_WEBCAFE_COOKIE 手动给了、或 OpenCLI 不可用兜底时才走这里。
 * 默认路径是下面的 callSessionAuto → browserRequest。
 */
async function callSessionGuest(spec, a) {
  if (spec.needsLogin && !cookie()) {
    die(
      "这条命令必须登录，匿名会被服务端拒绝（401 code=login），且当前没有可用的登录态浏览器\n" +
        "（--guest 或 OpenCLI 不可用）。两种给法：\n" +
        "  1. 装好 OpenCLI 并确保 Chrome 已登录 seo.web.cafe，去掉 --guest 重跑（推荐，默认路径）；\n" +
        "  2. 登录 https://seo.web.cafe 后从开发者工具复制整个 Cookie 请求头，export SEO_WEBCAFE_COOKIE='...'。\n" +
        "本脚本不会代替你登录。"
    );
  }
  const auth = await toolAuth(spec.tool);
  const method = spec.method || "POST";
  const opt = { method, headers: { ...auth, ...authHeaders() } };
  if (method === "POST") {
    opt.headers["content-type"] = "application/json";
    opt.body = JSON.stringify(spec.body(a));
  }
  // GET 端点的参数走 query string。之前这里只拼 spec.path，
  // 于是 /referring/api/month 永远拿不到 ?m=，服务端回「参数错误」而不是数据。
  const qs = method === "GET" && spec.query ? `?${new URLSearchParams(spec.query(a))}` : "";
  const r = await fetch(`${BASE}${spec.path}${qs}`, opt);
  const txt = await r.text();
  return finalizeSessionResult(spec, r.status, txt);
}

/**
 * 默认入口：session 类工具（serp/audit/review/worth/backlink/adsense/history/chat/…）
 * 一律先尝试经 OpenCLI 驱动用户已登录的 Chrome；只有下面两种情况才降级到访客/手动 Cookie，
 * 且降级必须在 stdout 打一条醒目警告：
 *   1. `--guest` 显式要求（CI、沙箱、明确不想碰用户浏览器时用）；
 *   2. 本机 OpenCLI 不可用，或驱动浏览器这一步本身失败（`needsLogin` 的工具直接 die，
 *      因为它们匿名必 401，降级也没用）。
 * `SEO_WEBCAFE_COOKIE` 仍然认——手动给了 Cookie 就说明用户知道自己在干什么，跳过浏览器更快。
 */
async function callSessionAuto(spec, a) {
  if (a.guest) {
    if (spec.needsLogin && !cookie()) die("--guest 与这条命令冲突：它必须登录，匿名 401，没有降级路径。");
    return callSessionGuest(spec, a);
  }
  if (cookie()) return callSessionGuest(spec, a); // 手动给了 Cookie，跳过浏览器
  if (!opencliAvailable()) {
    if (spec.needsLogin) die("这条命令必须登录，且本机 OpenCLI 不可用（`opencli doctor` 先看红在哪），没有降级路径。");
    warnGuestFallback("本机 OpenCLI 不可用");
    return callSessionGuest(spec, a);
  }
  try {
    const { status, raw } = await browserRequest(spec, a);
    return finalizeSessionResult(spec, status, raw);
  } catch (e) {
    if (spec.needsLogin) die(`驱动登录态浏览器失败，这条命令没有降级路径：${e.message}`);
    warnGuestFallback(`驱动登录态浏览器失败：${String(e.message).slice(0, 150)}`);
    return callSessionGuest(spec, a);
  }
}

function safeJson(t) {
  try { return JSON.parse(t); } catch { return null; }
}

/** history 那类端点返回 `event: delta\ndata: {"text":"…"}`，拼回整段文本。 */
function parseSse(t) {
  return t
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => { try { return JSON.parse(l.slice(5).trim()).text ?? ""; } catch { return ""; } })
    .join("");
}

/**
 * 解析 SEO Agent 的 SSE 流。
 *
 * 与 `parseSse` 分开写，因为这条流有多种事件类型且尾部的 `done` 带元数据。
 * **拼不出正文时必须报错而不是返回空串** —— 静默的空结果会被当成"这个站没问题"。
 */
function parseChatSse(raw) {
  const out = { text: "", sessionId: null, title: null, toolCalls: null, rounds: null, charged: null };
  let sawEvent = false;
  for (const block of raw.split(/\n\n/)) {
    const ev = (block.match(/^event:\s*(\S+)/m) || [])[1];
    const dm = block.match(/^data:\s*(.+)$/m);
    if (!ev || !dm) continue;
    sawEvent = true;
    let d;
    try { d = JSON.parse(dm[1]); } catch { continue; }
    if (ev === "delta" && typeof d.text === "string") out.text += d.text;
    else if (ev === "session") { out.sessionId = d.sessionId ?? out.sessionId; out.title = d.title ?? out.title; }
    else if (ev === "done") {
      out.toolCalls = d.toolCalls ?? null;
      out.rounds = d.rounds ?? null;
      out.charged = d.charged ?? null;
      out.sessionId = d.sessionId ?? out.sessionId;
    } else if (ev === "error") out.error = d.error ?? d.message ?? JSON.stringify(d);
  }
  if (!sawEvent) {
    out.error = "响应里没有任何 SSE 事件。多半是站点改了返回格式，或者请求根本没走到 Agent。";
  } else if (!out.text && !out.error) {
    out.error = "SSE 事件解析到了，但一个 delta 都没有，正文为空。不要把这当作\"没问题\"。";
  }
  return out;
}

/**
 * 通用 SSE 收集器：把 `event: xxx\ndata: {...}` 的事件块原样解析成
 * `[{event, data}, ...]` 数组透传给调用方，data 解析失败就退回原始字符串。
 *
 * domain 工具下 5 个 SSE 端点（name/check/insight/review/audit）事件类型各不相同，
 * 硬要为每个都定制一套输出格式反而容易漏事件、漏字段；不如就地收集、原样交给
 * 调用方按 event 名取值——省事，也不容易因为「这个字段没在我的解析器里」而丢数据。
 */
function parseEventStream(raw) {
  const out = [];
  // 有些代理/环境会把 SSE 流的换行发成 CRLF，split(/\n\n/) 按 LF 配对就会
  // 少切一半事件（\r\n\r\n 里那个 \r 卡在中间）。统一先吃掉 \r。
  const norm = raw.replace(/\r\n/g, "\n");
  for (const block of norm.split(/\n\n/)) {
    if (!block.trim()) continue;
    // SSE 规范允许一个事件块里出现多行 data:，客户端要把它们按 \n 拼接成一段再解析
    // ——之前只抓第一行 data:，遇到跨行 JSON 会拿到被截断的半截字符串，
    // 还被 catch 悄悄伪装成"解析失败就原样保留"，看起来像是拿到了数据。
    const dataLines = [...block.matchAll(/^data:\s?(.*)$/gm)].map((m) => m[1]);
    if (!dataLines.length) continue;
    // SSE 规范：没写 event: 字段时默认事件名是 "message"，不是「跳过这条」。
    const ev = (block.match(/^event:\s*(\S+)/m) || [])[1] || "message";
    const dataStr = dataLines.join("\n");
    let d, parseError = false;
    try { d = JSON.parse(dataStr); } catch { d = dataStr; parseError = true; }
    const item = { event: ev, data: d };
    if (parseError) item.parseError = true; // 调用方必须能分辨"数据本来就是字符串"和"JSON 解析失败"
    out.push(item);
  }
  return out;
}

/**
 * domain 工具 5 个 SSE 端点的统一入口：包一层 parseEventStream，补上失败信号。
 *
 * 之前 genericSse 这条路径是全文件唯一一处「拿到什么就直接透传，没有 error 字段」的
 * 解析器——parseChatSse/parseAdsenseSse 都会在拿不到东西时写 out.error，唯独这条不会。
 * 结果是：同一次改动一边把 adsense 的静默失败修好，一边又在 domain 端点上开了个新的。
 * 这里补齐：一个事件都没解析到（不管是真的没数据、格式变了、还是服务端在 200 里
 * 塞了一个跟 SSE 无关的 JSON 错误体），都必须报出来，不能只留一个空数组当作正常。
 */
function parseGenericSse(raw) {
  const events = parseEventStream(raw);
  const out = { events };
  if (!events.length) {
    out.error = "响应里没有任何 SSE 事件。可能是站点改了返回格式，也可能是 200 状态码下塞了一个非 SSE 的错误体——原始响应见 --out 或加 --debug 自己核对。";
  } else if (events.some((e) => e.parseError)) {
    out.error = `${events.filter((e) => e.parseError).length}/${events.length} 个事件的 data 不是合法 JSON，已保留原始字符串在 data 里，别当成解析出的对象用。`;
  }
  return out;
}

/**
 * 解析 adsense/api/audit 的 SSE 流。**这条和 history/chat 都不一样**，别复用它俩的解析器：
 *   event: step  逐项体检进度 {key,status,note}，status 是 run/ok/fail
 *   event: ping  纯心跳，忽略
 *   event: ai    AI 逐字生成的叙述（delta 拼接起来就是一段人话解释 + 它自己吐出的 JSON 草稿），
 *                这是过程展示，不是权威结论——权威结论在 done.report 里
 *   event: done  终态，`data.report` 才是唯一该读的结构化结果：
 *                {domain, homepage, decision, counts:{total,pass,fail,blockers,...}, items:[...]}
 *
 * 实测（2026-08-24，匿名，example.com）：73 项体检、decision "not_ready"。
 * `report` 拿不到就必须报错，不能返回一个「看起来正常」的空对象——
 * 这正是本次要修的那个「静默失败」的反面教训。
 */
function parseAdsenseSse(raw) {
  const events = parseEventStream(raw);
  const steps = events.filter((e) => e.event === "step").map((e) => e.data);
  const aiText = events.filter((e) => e.event === "ai").map((e) => e.data?.delta ?? "").join("");
  const doneEv = [...events].reverse().find((e) => e.event === "done");
  const report = doneEv?.data?.report ?? null;
  const out = { steps, aiText, report };
  if (!events.length) out.error = "响应里没有任何 SSE 事件。多半是站点又改了返回格式。";
  else if (!report) out.error = "收到了事件，但没有 done.report——终态结论没拿到，不要当作审核通过或失败来用。";
  return out;
}

/** 零配额普查：抓每个工具页 HTML，抽出它引用的全部 api 路径。 */
async function discover() {
  // translate/mine/domain 已经在 TOOLS 里有条目了，不用再手写一遍；
  // 顺带把 NOT_DONE 里的几个也探一遍，普查结果能反过来验证「真的没后端」这个判断。
  const tools = [...new Set([...Object.values(TOOLS).map((s) => s.tool).filter(Boolean), ...CLIENT_ONLY, ...Object.keys(NOT_DONE)])];
  const out = {};
  for (const t of tools) {
    try {
      const html = await fetch(`${BASE}/${t}/`, { headers: authHeaders() }).then((r) => r.text());
      out[t] = {
        header: (html.match(HEADER_RE) || [])[0] || null,
        hasToken: TOKEN_RE.test(html),
        endpoints: [...new Set((html.match(/["'`]api\/[a-z0-9_-]+/g) || []).map((s) => s.slice(1)))],
      };
    } catch (e) {
      out[t] = { error: String(e).slice(0, 80) };
    }
  }
  return out;
}

function summarize(name, data) {
  if (!data) return "（非 JSON 响应）";
  if (name === "kd") {
    if (data.markdown) return `Markdown 报告 ${data.markdown.length} 字（--out xxx.md 可原样落盘）`;
    // keywordType=brand 时 score 是「衍生内容进入难度」,与通用词不同口径,不标出来会被误读。
    // keywordTrend.ratio >= 1 表示有站正靠这个词快速上升,是时机信号,官方文档专门点名。
    const brand = data.keywordType === "brand" ? " · 品牌词(衍生口径)" : "";
    const r = data.keywordTrend?.ratio;
    const rising = typeof r === "number" && r >= 1 ? ` · 上升期 ratio ${r.toFixed(2)}` : "";
    const newcomer = (data.details || []).some((d) => typeof d.ageYears === "number" && d.ageYears < 2)
      ? " · 有新站进前十"
      : "";
    // 盘面构成是选词时最常被追问的一件事，而它已经在 details 里躺着了。
    // 首页多 = 大站拿主页硬顶，内页多 = 有靠单页切进去的缝；dedicated 是「专门经营这个词」的站数。
    const det = data.details || [];
    const home = det.filter((d) => d.isHomepage === true || d.pageType === "首页").length;
    const ded = det.filter((d) => d.dedicated).length;
    const shape = det.length ? ` · 盘面 ${det.length} 位（首页 ${home}/内页 ${det.length - home}，专营 ${ded}）` : "";
    // 2026-09-11 实测：keywordVolume 偶发返回 null（面板侧的 Google Trends 锚点校验没在
    // 请求超时内跑完，score/details 等其余字段照常齐全，不是脚本没解析到）——同一个词
    // 原样重放一次（尤其加 --force）经常就能拿到数值，不是永久没数据。裸打一个「—」
    // 会被误读成"这个词真的没量"，所以命中这种情况时附一句可操作的提示。
    const volMiss = data.anchorPending
      ? "（自动 --force 重试后仍未命中锚点校验，reason: anchor-pending，非「确定无量」）"
      : data.keywordVolume == null && data.cached === false
      ? "（本次未命中锚点校验，非「确定无量」，建议 --force 重跑一次再下结论）"
      : "";
    return `KD ${data.score} ${data.level}${brand} · 月搜 ${data.keywordVolume ?? "—"}${volMiss} · 引用域中值 ${data.linkBudget?.quality?.mid ?? "—"}${shape}${rising}${newcomer}`;
  }
  // visits 单位是千次（K）。不换算就会把 2692.6 读成两千次而不是二百六十九万次。
  if (name === "referringMonth") {
    const rows = data.rows || [];
    const top = rows.slice(0, 3).map((r) => `${r.domain} ${Math.round(r.visits * 1000).toLocaleString()}`).join(" / ");
    return `${data.month} · ${rows.length} 个域名 · 榜单外总量 ${data.total?.visits ?? "—"} · 前三 ${top}`;
  }
  if (name === "referringSite") {
    const s = data.stats || {};
    return `${data.domain} · 在榜 ${s.monthsOn}/${s.monthsTotal} 月 · 最好名次 ${s.bestPos} · 累计送出 ${s.totalSentK}K 次 · 最新在榜 ${s.onLatest ? "是" : "否"}`;
  }
  if (name === "audit") return `得分 ${data.score} ${data.grade} · 失败项 ${(data.categories || []).flatMap((c) => c.checks).filter((c) => c.status === "fail").length}`;
  if (name === "backlink") return `${data.domain} · 质量 ${data.quality?.score ?? "—"}/${data.quality?.level ?? "—"} · 判定 ${data.verdict?.label ?? data.verdict?.text ?? JSON.stringify(data.verdict ?? "—").slice(0, 60)}`;
  if (name === "serp") {
    // data.kd 实测是对象不是数字，直接插值会打出 "KD [object Object]"（看着像取到了值，其实没有）。
    const k = data.kd;
    const kd = k == null ? "—" : typeof k === "object" ? (k.score ?? k.value ?? k.difficulty ?? JSON.stringify(k).slice(0, 60)) : k;
    return `top${(data.results || []).length} · KD ${kd}`;
  }
  if (name === "chat") {
    if (data.error) return `解析失败：${data.error}`;
    const tc = Array.isArray(data.toolCalls) ? data.toolCalls.join(",") : (data.toolCalls ?? "—");
    return `${data.text.length} 字 · 调用工具 [${tc}] · ${data.rounds ?? "—"} 轮 · 扣 ${data.charged ?? "—"} 积分`;
  }
  if (name === "adsense") {
    if (data.error) return `解析失败：${data.error}`;
    const r = data.report;
    const c = r.counts || {};
    return `${r.domain} · 判定 ${r.decision} · ${c.total} 项（通过 ${c.pass} / 失败 ${c.fail} / blocker ${c.blockers} / 待自查 ${c.unknown}） · AI 叙述 ${data.aiText.length} 字`;
  }
  if (name === "translateSearch") return `「${data.query ?? "—"}」 · 自然结果 ${(data.organic || []).length} 条 · 相关词 ${(data.related || []).length} 个 · PAA ${(data.paa || []).length} 个`;
  if (name === "translatePage") return `${data.title ?? data.url} · ${data.wordCount ?? "—"} 词 · 首页:${data.isHomepage ? "是" : "否"} · 关键词候选 ${(data.keywords || []).length} 个`;
  if (name === "translateDomain") return data.noData ? `${data.domain} · 无数据（已自动退配额）` : `${data.domain} · 访问量 ${data.visits ?? "—"} · 词库 ${(data.topKeywords || []).length} 个`;
  if (name === "translateAggregate") return `聚合 ${Object.values(data.aggregated || {}).flat().length} 词 · 精选 ${(data.picks || []).length} 个 · 未覆盖 ${(data.uncovered || []).length} 个`;
  if (name === "mineSeed") return `判定为「${data.type ?? "—"}」：${data.value ?? "—"}`;
  // ⚠️ mineSearch 的 organic 比 translateSearch 多 domain/isHomepage/skip，摘要必须分开写。
  if (name === "mineSearch") {
    const skipped = (data.organic || []).filter((o) => o.skip).length;
    return `「${data.keyword ?? "—"}」 · 自然结果 ${(data.organic || []).length} 条（黑名单跳过 ${skipped}） · 相关词 ${(data.related || []).length} 个${data.fromCache ? " · 命中缓存" : ""}`;
  }
  if (name === "minePage") return `${data.title ?? data.url} · ${data.wordCount ?? "—"} 词`;
  if (name === "mineDomain") return data.noData ? `${data.domain} · 无数据（已自动退配额）` : `${data.domain} · DR ${data.dr ?? "—"} · 建站 ${data.ageYears ?? "—"} 年 · 趋势 ${data.trend?.dir ?? "—"} ${data.trend?.changePct ?? ""}`;
  if (name === "mineKd") return `KD ${data.kd?.score ?? "—"} ${data.kd?.level ?? ""}`;
  if (name === "domainIntent") return `意图：${data.intent ?? "—"} · brief：${(data.brief || "").slice(0, 60)}`;
  if (name === "domainCollision") return `撞名风险 ${data.collision?.risk ?? "—"}：${(data.collision?.reason || "").slice(0, 60)}`;
  // domainName/domainCheck/domainInsight/domainReview/domainAudit 都走 genericSse，
  // 统一从 data.events 里摘：报「见到了几种事件、各多少条」，具体内容留给 --out 落盘细看。
  if (Array.isArray(data.events)) {
    if (!data.events.length) return "（SSE 无事件，多半是站点改了格式）";
    const counts = {};
    for (const e of data.events) counts[e.event] = (counts[e.event] || 0) + 1;
    return Object.entries(counts).map(([k, v]) => `${k}×${v}`).join(" · ");
  }
  if (data.error) return `错误 ${data.code}：${data.error}`;
  return Object.keys(data).slice(0, 8).join(", ");
}

/**
 * 本地命令：4 个纯前端工具的公式复刻，零网络、零配额、可批量。
 * 公式全部照抄自对应工具页面的内联 <script>（2026-08-24 抓取核对），
 * 不调用任何 seo.web.cafe 的接口，也不取令牌——LOCAL 命令走这条独立分支，
 * 绝不能不小心接进 callSession/callOfficial 那条会发请求的路径。
 */
const KD_DOMAINS = { 0: 0, 10: 10, 20: 22, 30: 36, 40: 56, 50: 84, 60: 129, 70: 202, 80: 353, 90: 756, 100: 1200 };
/** KD → 所需引荐域名数，Ahrefs 经验对照表，线性插值（抄自 /kgr/ 与 /money/ 页面内联 JS，两处实现一致）。 */
function requiredDomains(kd) {
  if (kd <= 0) return 0;
  const keys = Object.keys(KD_DOMAINS).map(Number).sort((x, y) => x - y);
  let lo = 0, hi = 100;
  for (const k of keys) {
    if (k <= kd && k > lo) lo = k;
    if (k >= kd && k < hi) hi = k;
  }
  if (lo === hi) return KD_DOMAINS[lo];
  return Math.round(KD_DOMAINS[lo] + (kd - lo) * (KD_DOMAINS[hi] - KD_DOMAINS[lo]) / (hi - lo));
}
/** 外链阶梯计价：前 10 条 $100；11~50 条每条 +1%；51~200 条每条 +1.5%；200+ 条每条 +2%。 */
function linkCost(n) {
  if (n <= 10) return 100;
  if (n <= 50) return 100 * (1 + (n - 10) * 0.01);
  if (n <= 200) return 100 * (1 + 40 * 0.01 + (n - 50) * 0.015);
  return 100 * (1 + 40 * 0.01 + 150 * 0.015 + (n - 200) * 0.02);
}
function totalLinkCost(total) {
  let s = 0;
  for (let i = 1; i <= total; i++) s += linkCost(i);
  return s;
}
function numArg(v, flag) {
  const n = Number(req(v, flag));
  if (Number.isNaN(n)) die(`${flag} 需要是数字（实际传入：${v}）`);
  return n;
}
/**
 * 带默认值的数字参数：不传就用默认值，传了就必须是合法数字。
 * money 命令的 6 个可选参数（sites/kws/rankpos/rpm/saas/pvuv/kd）此前直接
 * `Number(a.x)` 不校验——`--kd abc` 会得到 NaN，clamp(NaN,...) 还是 NaN，
 * 一路穿到 totalLinkCost(NaN) 里（`for(i=1;i<=NaN;i++)` 一次都不进）算出 cost=0，
 * 于是「参数打错了」被叙述成「外链投入 $0、ROI ∞x」这种看着极乐观的结果。
 * 所有可选数字参数都必须走这里，不能再裸 Number() 了。
 */
function optNumArg(v, flag, def) {
  if (v === undefined) return def;
  if (v === true) die(`${flag} 需要跟一个数字（给了标志但没跟值）`);
  const n = Number(v);
  if (Number.isNaN(n)) die(`${flag} 需要是数字（实际传入：${v}）`);
  return n;
}

const LOCAL = {
  kgr: {
    desc: "关键词价值评估：KGR / EKGR / KDROI（纯本地计算，零网络零配额）",
    help: "--volume <月搜索量> --intitle <intitle 结果数> --kd <0-100 难度分>",
    run: (a) => {
      const volume = numArg(a.volume, "--volume");
      const intitle = numArg(a.intitle, "--intitle");
      const kd = numArg(a.kd, "--kd");
      if (volume <= 0) die("--volume 必须大于 0");
      if (intitle < 0) die("--intitle 不能是负数（intitle 结果数没有负数这回事）");
      if (kd < 0 || kd > 100) die("--kd 必须在 0-100 之间");

      const kgr = intitle / volume;

      const kdFactor = 1 + kd / 100;
      const ekgr = (intitle * kdFactor) / volume;

      const domains = requiredDomains(kd);
      const invest = totalLinkCost(domains);
      // $0.1/次点击、日均按月搜索量/30 估，来自 /kgr/ 页面同一段公式。
      const revenue = (volume / 30) * 0.1 * 365;
      const roi = invest > 0 ? ((revenue - invest) / invest) * 100 : Infinity;

      // 只出数值，不出判决。「黄金词/中等竞争/高竞争」「极佳/放弃」这类评级
      // 是阈值判读，已迁到 references/seo-webcafe.md「本地命令数值判读指引」——
      // 阈值该不该信、对这个市场适不适用，由拿着上下文的判读者决定。
      return {
        kgr: { value: Number(kgr.toFixed(3)) },
        ekgr: { value: Number(ekgr.toFixed(3)), kdFactor: Number(kdFactor.toFixed(2)) },
        kdroi: {
          requiredDomains: domains,
          invest: Number(invest.toFixed(2)),
          yearRevenueCap: Number(revenue.toFixed(2)),
          roiPct: invest > 0 ? Number(roi.toFixed(1)) : null,
        },
      };
    },
    summarize: (d) =>
      `KGR ${d.kgr.value} · EKGR ${d.ekgr.value}（kdFactor ${d.ekgr.kdFactor}） · ` +
      `KDROI 需 ${d.kdroi.requiredDomains} 条外链/$${d.kdroi.invest}，ROI ${d.kdroi.roiPct ?? "∞"}%` +
      `（数值判读见 references/seo-webcafe.md）`,
  },

  string: {
    desc: "TDK 长度检查：字符/词/字节统计 + title(30-60)/desc(70-160) 有效长度（纯本地计算）",
    help: '--text "..." 或 --file <path>（必填，正文统计的输入）；再加 --title "..." / --desc "..." 可在同一次调用里附带查 title/desc 的 TDK 长度',
    run: (a) => {
      const text = a.file ? readFileSync(a.file, "utf8") : req(a.text, "--text 或 --file");
      const CJK = /[぀-ヿ㐀-鿿豈-﫿ｦ-ﾟ]/;
      const countWords = (t) => {
        let words = 0, inWord = false;
        for (const c of t) {
          if (CJK.test(c)) { words++; inWord = false; continue; }
          if (/[A-Za-z0-9_'-]/.test(c)) { if (!inWord) { words++; inWord = true; } }
          else inWord = false;
        }
        return words;
      };
      // TDK 有效长度：ASCII 记 1，其余（含中日韩/全角）记 2，近似像素占宽。
      const tdkLen = (t) => [...t].reduce((n, c) => n + (c.codePointAt(0) <= 0x7f ? 1 : 2), 0);
      const tdkCheck = (t, lo, hi) => {
        const n = tdkLen(t);
        const status = n === 0 ? "empty" : n < lo ? "short" : n <= hi ? "ok" : "over";
        return { text: t, len: n, range: [lo, hi], status };
      };
      const out = {
        chars: [...text].length,
        charsNoSpace: [...text.replace(/\s/g, "")].length,
        words: countWords(text),
        lines: text ? text.split("\n").length : 0,
        bytes: Buffer.byteLength(text, "utf8"),
        uniqueChars: new Set([...text]).size,
      };
      if (a.title) out.titleTdk = tdkCheck(a.title, 30, 60);
      if (a.desc) out.descTdk = tdkCheck(a.desc, 70, 160);
      return out;
    },
    summarize: (d) => {
      const tdk = [];
      if (d.titleTdk) tdk.push(`title ${d.titleTdk.len}/60（${d.titleTdk.status}）`);
      if (d.descTdk) tdk.push(`desc ${d.descTdk.len}/160（${d.descTdk.status}）`);
      return `${d.chars} 字符 · ${d.words} 词 · ${d.bytes} 字节 · ${d.uniqueChars} 个不同字符${tdk.length ? " · " + tdk.join(" · ") : ""}`;
    },
  },

  money: {
    desc: "月收入目标拆解：反推所需 UV / 关键词日搜索量 / 外链投入与 ROI（纯本地计算）",
    help: "--income <月收入$> [--sites 1] [--kws 5] [--rankpos 3] [--rpm 5] [--saas 0] [--pvuv 2] [--kd 30]",
    run: (a) => {
      const clamp = (v, lo, hi) => {
        // NaN 断言：clamp(NaN, lo, hi) 本会静默返回 NaN（Math.max/min 对 NaN 短路），
        // 之前正是这样把「参数打错了」伪装成「算出来是 0」。这里提前截断。
        if (Number.isNaN(v)) die("money 内部参数不是数字（不应该发生，说明 optNumArg 校验被绕过了）");
        return Math.min(hi, Math.max(lo, v));
      };
      const income = clamp(numArg(a.income, "--income"), 100, 100000);
      const sites = clamp(optNumArg(a.sites, "--sites", 1), 1, 20);
      const kws = clamp(optNumArg(a.kws, "--kws", 5), 1, 50);
      const rankpos = Math.round(clamp(optNumArg(a.rankpos, "--rankpos", 3), 1, 10));
      const rpm = clamp(optNumArg(a.rpm, "--rpm", 5), 1, 20);
      const saas = clamp(optNumArg(a.saas, "--saas", 0), 0, 500);
      const pvuv = clamp(optNumArg(a.pvuv, "--pvuv", 2), 1, 5);
      const kd = clamp(optNumArg(a.kd, "--kd", 30), 0, 100);
      // 行业 CTR 曲线，抄自 /money/ 页面内联 JS。
      const CTR = { 1: 39.8, 2: 18.7, 3: 10.2, 4: 7.2, 5: 5.1, 6: 4.4, 7: 3.0, 8: 2.1, 9: 1.9, 10: 1.6 };
      const ctr = CTR[rankpos] / 100;

      const daily = income / 30;
      const yearly = income * 12;
      const adPerUv = (rpm / 1000) * pvuv;
      const saasPerUv = saas / 1000;
      const perUv = adPerUv + saasPerUv;
      const totalUv = perUv > 0 ? daily / perUv : 0;
      const siteUv = totalUv / sites;
      const sitePv = siteUv * pvuv;
      const kwVol = siteUv / kws / ctr;
      const domains = requiredDomains(kd);
      const cost = sites * totalLinkCost(domains);
      const roi = cost > 0 ? yearly / cost : Infinity;

      // 风险判读（每词日搜索量过万、ROI<1、投入超 6 个月收入、难度产出不匹配……）
      // 已迁到 references/seo-webcafe.md「本地命令数值判读指引」：那些是阈值判决，
      // 不是计算结果。脚本只出数，判读者拿数对照指引。
      return {
        params: { income, sites, kws, rankpos, ctrPct: CTR[rankpos], rpm, saas, pvuv, kd },
        dailyIncome: Number(daily.toFixed(2)),
        perUvValue: Number(perUv.toFixed(4)),
        totalDailyUv: Math.round(totalUv),
        siteDailyUv: Math.round(siteUv),
        siteDailyPv: Math.round(sitePv),
        keywordDailyVolume: Math.round(kwVol),
        requiredDomainsPerSite: domains,
        totalLinkCost: Math.round(cost),
        yearlyRevenue: Math.round(yearly),
        roi: cost > 0 ? Number(roi.toFixed(2)) : null,
      };
    },
    summarize: (d) =>
      `每站需日 UV ${d.siteDailyUv}（${d.siteDailyPv} PV） · 每词日搜索量 ${d.keywordDailyVolume} · ` +
      `外链投入 $${d.totalLinkCost} · ROI ${d.roi ?? "∞"}x（数值判读见 references/seo-webcafe.md）`,
  },

  email: {
    desc: "从文本批量提取邮箱地址并去重（纯本地计算）",
    help: "--text \"...\" 或 --file <path>；--mode list|comma|domain（默认 list）",
    run: (a) => {
      const text = a.file ? readFileSync(a.file, "utf8") : req(a.text, "--text 或 --file");
      const RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const matched = text.match(RE) || [];
      const seen = new Set();
      const emails = [];
      for (const m of matched) {
        const e = m.toLowerCase();
        if (!seen.has(e)) { seen.add(e); emails.push(e); }
      }
      const mode = a.mode || "list";
      // 拼错 --mode（比如打成 --mode coma）之前会静默退回 list——用户以为自己拿到的是
      // comma 格式，实际是换行分隔的默认格式，粘贴到下一步会直接出错。白名单校验一下。
      if (!["list", "comma", "domain"].includes(mode)) die(`--mode 只能是 list/comma/domain 之一（实际传入：${mode}）`);
      let output;
      if (mode === "comma") output = emails.join(", ");
      else if (mode === "domain") {
        const dseen = new Set(), domains = [];
        for (const e of emails) { const d = e.split("@")[1]; if (d && !dseen.has(d)) { dseen.add(d); domains.push(d); } }
        output = domains.join("\n");
      } else output = emails.join("\n");
      return { count: emails.length, rawCount: matched.length, emails, output };
    },
    summarize: (d) => `找到 ${d.count} 个邮箱${d.rawCount > d.count ? `（去重前 ${d.rawCount} 个）` : ""}`,
    // --mode 指定成 comma/domain 就是为了直接拿现成文本用（贴邮件列表、贴 disallow 名单），
    // 不该逼用户自己 jq -r .output 从 JSON 里挖。没给 --out 落盘时，直接把这段文本打出来。
    rawOutput: (d, a) => (a.mode && a.mode !== "list" ? d.output : null),
  },
};

const HELP = `seo.web.cafe 统一驱动

用法:
  node seo-webcafe.mjs <命令> [选项]

命令（有后端，会发 HTTP 请求，多数计配额）:
${(() => {
    // 固定宽度 17 装不下 translateAggregate（18 字符），对齐直接错位。
    // 按实际最长命令名动态算宽度，不用每加一个长命令名就回头改这个数字。
    const w = Math.max(...Object.keys(TOOLS).map((k) => k.length)) + 1;
    return Object.entries(TOOLS).map(([k, v]) => `  ${k.padEnd(w)} ${v.desc}`).join("\n");
  })()}

本地命令（纯本地计算，零网络、零配额，可批量）:
${Object.entries(LOCAL).map(([k, v]) => `  ${k.padEnd(17)} ${v.desc}\n${" ".repeat(19)}用法：${v.help}`).join("\n")}

  endpoints         零配额普查：列出每个工具的请求头名与全部 api 端点
  tools             列出本地命令与确认无后端、不做的工具（附理由）

通用选项:
  --out <path>       把完整 JSON 写到文件
  --batch <file>     批量模式，每行一组参数（见下）
  --spacing-ms <ms>  批量时的请求间隔，默认按工具的保险丝取值
  --guest            显式要求访客档：跳过 OpenCLI 登录态浏览器，直接裸 fetch（10/日）。
                     默认不给这个 flag：session 类工具（serp/audit/worth/backlink/adsense/
                     history/chat/review/…）经 OpenCLI 驱动你本机已登录的 Chrome 执行，
                     自动拿到登录 100/日或 VIP 500/日；OpenCLI 不可用时才自动回退到访客档，
                     并在 stdout 打印醒目警告。kd 命令的鉴权是 Bearer 令牌（与浏览器 Cookie
                     是两条不通用的路径），--guest 对它只影响 quota 探测走不走浏览器实测。
  --help             本帮助

kd 专属选项（对齐 /kd/docs 的公开 API 参数表，无遗漏）:
  --keyword <kw>     英文关键词，必填
  --gl <cc>          Google 国家码，默认 us（gb/ca/au/de/jp/sg …）
  --hl <lang>        语言码，默认 en
  --force            跳过 7 天结论缓存强制重算（仍计配额）
  --format markdown  返回自包含 Markdown 报告；不给 --out 就直接打到 stdout，
                     --out xxx.md 原样落盘，--out xxx.json 包进 JSON

批量文件格式：每行一条，用 key=value 空格分隔，例如
  keyword=markdown to pdf
  url=https://example.com/a  keyword=pdf to markdown

环境变量（都是可选的，给了会跳过 OpenCLI 直接用）:
  SEO_WEBCAFE_COOKIE  站点登录会话 Cookie，手动从开发者工具复制。给了就跳过登录态浏览器，
                      直接拿这个 Cookie 发请求（更快，但要自己保证没过期）。不给也能跑：
                      默认经 OpenCLI 走登录态浏览器，只有 OpenCLI 不可用才落到访客档 10/日。
  SEO_WEBCAFE_TOKEN   仅 kd 命令使用的 wc_mcp_ 公开 API 令牌，在 /kd/docs 自助生成。
                      **令牌本身没有登录态一说**：它绑定生成时的账号，登录账号生成就是
                      登录 100/日或 VIP 500/日，匿名生成就是访客 10/日——想确认用哪个账号
                      生成的，登录后去 /kd/docs 页面重新生成一次。

chat 命令示例:
  node seo-webcafe.mjs chat --ask "帮我看看 https://example.com 这个站还有哪些 SEO 问题"

**chat 不是省配额的批量入口**：实测 2026-09-11，一条问 5 个关键词量/KD 的消息触发
9 次内部工具调用、扣 31 点配额（约 6.2/词），比直接调用 kd 逐词查（1/词）贵得多。
批量选词一律用 kd（本身按令牌账号计费，不受本文件档位切换影响），chat 只用于
需要模型综合判断/跨工具串联的定性分析，不用于跑量。

配额：访客 10/日、登录 100/日、VIP 500/日，三端（网页 + MCP + API）共用同一个每日额度池；
另有每分钟 10 次保险丝。**chat 强制登录**，匿名 401；其余命令匿名可用，但默认已经是
登录态浏览器执行，见上面 --guest 的说明。
/referring/* 不计入配额。7 天内重复查询命中缓存但仍计数。`;

/**
 * 开工前必做：先问配额档位，再决定这场调研怎么排。
 *
 * 2026-08-22 的真实事故：整场关键词调研按「匿名 10 次/日」规划，省着用，
 * 少测了 4 个词的 SERP，还在报告里写成「配额耗尽，无法验证」——
 * 而账号其实是 VIP 500/日，当天只用了 66 次。没人去问过档位，
 * 于是文档里的默认值被当成了事实。
 *
 * `/<tool>/api/me` 不耗配额、不需令牌，所以这个检查是白拿的。
 */
async function quotaPreflight(tool, a = {}) {
  try {
    // 默认路径：经登录态浏览器读真实档位（天然带 Cookie，读到的是账号真实用量）。
    if (!a?.guest) {
      const j = browserMeQuota(tool);
      if (j?.quota) {
        const q = j.quota;
        const left = q.unlimited ? "∞" : Math.max(0, (q.limit ?? 0) - (q.used ?? 0));
        console.error(`· 配额 ${q.tier}（登录态浏览器实测）：已用 ${q.used}/${q.limit}，剩 ${left}`);
        return;
      }
    }
    // 兜底：node 侧裸 fetch，只认 IP，永远访客档——这不是真实上限，只是没有登录态浏览器时的下限。
    const r = await fetch(`${BASE}/${tool}/api/me`, { headers: authHeaders() });
    if (!r.ok) return;
    const q = (await r.json())?.quota;
    if (!q) return;
    const left = q.unlimited ? "∞" : Math.max(0, (q.limit ?? 0) - (q.used ?? 0));
    console.error(`· 配额 ${q.tier}（按 IP 计的访客档，未经登录态浏览器确认）：已用 ${q.used}/${q.limit}，剩 ${left}`);
    const anonLimit = q?.tiers?.anon ?? 10;
    const isAnon = /anon|guest|游客/i.test(String(q.tier ?? "")) || (!q.unlimited && q.limit <= anonLimit);
    if (isAnon) warnGuestFallback(a?.guest ? "显式 --guest" : "登录态浏览器探测失败或 OpenCLI 不可用");
  } catch { /* 探测失败不该挡住正事 */ }
}

/**
 * kd 走的是令牌制公开 API（Bearer），档位跟着**令牌所属账号**走（登录 100/日、VIP 500/日），
 * 和上面那套按 Cookie/IP 计数的会话档不是一回事——**这条命令本身一直就是走登录态的**，
 * 只是「登录态」体现在 Bearer 令牌绑的账号上，不是浏览器 Cookie 上
 * （实测 2026-09-11：`/kd/api/v1/kd` 带 Cookie 不带 Bearer 直接 401，两条鉴权路径不通用，
 * 不能像 serp/audit 那样把请求转发进浏览器执行）。
 *
 * 这条 preflight 真正要修的是**误报**：`/kd/api/me` 只认 Cookie / IP，完全忽略 Bearer 令牌
 * （实测：带上有效 wc_mcp_ 令牌请求它，仍返回 `login:false, tier:游客`），所以 node 侧裸 fetch
 * 永远打出「游客 10/日」，跟令牌真实档位无关——2026-09-11 三个执行者把这行误报当成真实上限，
 * 批量刚起步就以为耗尽了，是 2026-08-22 那次事故的重演。
 *
 * 默认改成经登录态浏览器读同一个 `/kd/api/me`：如果浏览器登录的账号就是 KD_TOKEN 绑定的账号
 * （最常见情况——同一个人），读到的 `login:true` 那份就是令牌的真实档位，直接可信；
 * 如果浏览器没登录或登录的是另一个账号，明确告知这行数字对不上令牌，别据此限流。
 */
async function officialQuotaPreflight(a = {}) {
  try {
    const j = a?.guest ? null : browserMeQuota("kd");
    if (j?.quota) {
      const q = j.quota;
      const left = q.unlimited ? "∞" : Math.max(0, (q.limit ?? 0) - (q.used ?? 0));
      if (j.login) {
        console.error(
          `· 配额 ${q.tier}（登录态浏览器实测，若浏览器登录的就是 KD_TOKEN 绑定账号，此为真实余额）：` +
          `已用 ${q.used}/${q.limit}，剩 ${left}（三端共用：网页 + MCP + API）`
        );
        return;
      }
      console.error(`· 浏览器未登录，读到的仍是按 IP 计的访客档：已用 ${q.used}/${q.limit}——与 wc_mcp_ 令牌余额无关，忽略。`);
      return;
    }
    // 兜底：node 侧裸 fetch，同样只认 Cookie/IP，忽略 Bearer——这行数字从来不是令牌的真实余额。
    const r = await fetch(`${BASE}/kd/api/me`, { headers: authHeaders() });
    if (!r.ok) return;
    const j2 = await r.json();
    const q = j2?.quota;
    if (!q) return;
    const left = q.unlimited ? "∞" : Math.max(0, (q.limit ?? 0) - (q.used ?? 0));
    console.error(`· 配额 ${q.tier}（按 IP 计的访客档，未经登录态浏览器确认）：已用 ${q.used}/${q.limit}，剩 ${left}（三端共用：网页 + MCP + API）`);
    if (!j2.login) {
      console.error(
        "  ↑ 这是按 IP 计的网页档，**不是你 wc_mcp_ 令牌的余额**（/kd/api/me 不认 Bearer）。\n" +
        "    令牌绑定的账号是登录档 100/日或 VIP 500/日，真实余额通常比这里显示的高得多，\n" +
        "    也可能相反（令牌是匿名生成的，真实余额就是 10/日）——装好 OpenCLI 并确保 Chrome\n" +
        "    已登录 seo.web.cafe（和令牌同一账号）能拿到准数，别因为这行数字小就自我限流。"
      );
    }
  } catch { /* 探测失败不该挡住正事 */ }
}

async function main() {
  const argv = process.argv.slice(2);
  if (!argv.length || argv.includes("--help")) { console.log(HELP); return; }
  const { cmd, a } = parseArgs(argv);

  if (cmd === "tools") {
    console.log("已复刻成本地命令（零网络零配额）：" + Object.keys(LOCAL).map((k) => `${k}（${LOCAL[k].desc}）`).join("；"));
    console.log("确认无后端、不做的工具：" + Object.entries(NOT_DONE).map(([k, why]) => `${k}（${why}）`).join("；"));
    return;
  }
  if (cmd === "endpoints") {
    const map = await discover();
    console.log(JSON.stringify(map, null, 2));
    if (a.out) { writeFileSync(a.out, JSON.stringify(map, null, 2)); console.error(`已写入 ${a.out}`); }
    return;
  }

  // 本地命令走独立分支：不取令牌、不发 HTTP、不查配额档位，直接算完打印。
  // 支持 --batch，跟远端命令共用同一份批量文件格式——见 parseBatchRows。
  if (LOCAL[cmd]) {
    const local = LOCAL[cmd];
    const rows = parseBatchRows(a);
    const results = rows.map((args) => local.run(args));
    for (const data of results) console.log(`✓ ${cmd} → ${local.summarize(data)}`);
    const single = results.length === 1;
    const payload = single ? results[0] : results;
    if (a.out) {
      writeFileSync(a.out, JSON.stringify(payload, null, 2));
      console.error(`已写入 ${a.out}`);
    } else if (single && local.rawOutput) {
      const raw = local.rawOutput(results[0], rows[0]);
      if (raw != null) console.log(raw);
      else console.log(JSON.stringify(payload, null, 2));
    } else {
      console.log(JSON.stringify(payload, null, 2));
    }
    return;
  }

  const spec = TOOLS[cmd];
  if (!spec) die(`未知命令：${cmd}（用 --help 看全部命令）`);

  // 先报档位再干活：不这么做就会按错误的配额假设去规划整场调研。
  if (spec.official) await officialQuotaPreflight(a);
  else await quotaPreflight(spec.tool, a);

  const rows = parseBatchRows(a);

  const spacing = Number(a.spacingMs ?? spec.spacingMs ?? 0);
  const results = [];
  let failDir = null;
  for (let i = 0; i < rows.length; i++) {
    const args = { ...a, ...rows[i] };
    const res = spec.official
      ? (cmd === "kd" ? await callOfficialKdWithRetry(spec, args, spacing) : await callOfficial(spec, args))
      : await callSessionAuto(spec, args);
    const label = args.keyword || args.url || args.input || cmd;
    // HTTP 200 不等于「拿到了能用的结果」——adsense/chat/history/genericSse 这几个
    // 解析器在拿不到权威结论时会写 res.data.error，那也是失败，必须打 ✗ 且非零退出。
    // 之前只看 status，于是「解析失败：...」照样打 ✓、进程退出码 0，
    // 串在 && 或批处理脚本里的调用方会把这当成成功。
    const parseFailed = res.status === 200 && res.data && typeof res.data === "object" && res.data.error;
    if (res.status !== 200 || parseFailed) {
      const reason = parseFailed ? res.data.error : res.raw.slice(0, 120);
      console.error(`✗ ${label} → ${res.status !== 200 ? `HTTP ${res.status} ` : ""}${reason}`);
      // 失败的响应**原文**必须留下：`HTTP 500` 和「配额横幅 HTML 藏在 200 里」
      // 是完全不同的故障，只有原文分得出来。--out 会带上（results 里有 raw），
      // 没给 --out 也落 .rankup/evidence/seo-webcafe-<ts>/。
      try {
        if (!failDir) failDir = newEvidenceDir("seo-webcafe");
        const fn = `${String(i + 1).padStart(2, "0")}-${String(label).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 60)}.raw.txt`;
        writeFileSync(join(failDir, fn), `HTTP ${res.status}\n\n${res.raw ?? ""}`);
        writeManifest(failDir, { script: "seo-webcafe", cmd, stopReason: "request-failures", finishedAt: new Date().toISOString() });
        console.error(`  响应原文已落盘：${join(failDir, fn)}`);
      } catch (e) {
        console.error(`  （原文落盘失败：${String(e?.message || e).slice(0, 200)}）`);
      }
      process.exitCode = 1;
    } else {
      console.log(`✓ ${label} → ${summarize(cmd, res.data)}`);
    }
    results.push({ args: rows[i], status: res.status, data: res.data, ...(res.status !== 200 || parseFailed ? { raw: String(res.raw ?? "").slice(0, 20000) } : {}) });
    if (spacing && i < rows.length - 1) await new Promise((r) => setTimeout(r, spacing));
  }

  // format=markdown 拿到的是给人读/存档/喂 AI 的报告正文。没给 --out 就直接打到 stdout，
  // 否则用户只看到一行摘要，报告本身无处可去。
  const mds = results.map((r) => r.data?.markdown).filter(Boolean);
  if (mds.length && !a.out) console.log("\n" + mds.join("\n\n---\n\n"));

  if (a.out) {
    const path = a.out;
    // .md 落盘写原文，不要把报告包进 JSON 再转义一遍。
    if (mds.length && path.endsWith(".md")) {
      writeFileSync(path, mds.join("\n\n---\n\n"));
      console.error(`已写入 ${path}`);
      return;
    }
    if (path.endsWith("/")) { mkdirSync(path, { recursive: true }); writeFileSync(join(path, `${cmd}.json`), JSON.stringify(results, null, 2)); }
    else writeFileSync(path, JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
    console.error(`已写入 ${path}`);
  }
}

/**
 * 只有被当成命令行程序直接运行时才执行 main。
 * 加这道闸是为了让别的脚本可以 `import { toolAuth, BASE, UA }` 复用取令牌那一段，
 * 而不是把同一段正则和 User-Agent 再抄一份——抄一份就意味着站点改版时要改两处，
 * 而漏改的那一处会静默失败。**导入本模块不会发任何请求。**
 */
export { BASE, UA, toolAuth, authHeaders, TOOLS };

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  main().catch((e) => die(`执行失败：${e?.message || e}`));
}
