#!/usr/bin/env node
/**
 * boards.mjs —— AI 工具榜单 / 新品发现站统一取数器。
 *
 * 用途：
 *   把「今天有哪些新产品上线 / 哪些站在涨流量 / 哪些站在赚钱 / 哪些目录站值得发外链」
 *   这几类公开榜单，统一成同一套字段吐出来，供下游批量灌进 Similarweb / Semrush /
 *   KD 脚本做验证。核心字段固定为：
 *     { source, rank, name, url, domain, metric, metricLabel, date }
 *   （另有 extra 放各源特有字段，下游可忽略。）
 *
 * 子命令（source）：
 *   producthunt   每日新品榜（名次 / 票数 / 上线日期，可解析产品真实外链域名）
 *   toolify       最新收录的 AI 工具 + 「有收入」榜（按月访问量排，带支付平台标记）
 *   taaft         There's An AI For That：最新收录的 AI 工具 + 许愿区（requests）
 *   traffic-cv    流量榜 / 收入榜，可按年月与榜单类型参数化
 *   trustmrr      Stripe 实连的 SaaS 收入榜（MRR / 增长 / 流量 / 总营收 / 每访客收入）
 *   columbus      AI 站外链榜（哪些目录站被最多 AI 工具站引用，DR / dofollow / 频次）
 *
 * 示例：
 *   node boards.mjs producthunt --date 2026-08-22 --limit 30
 *   node boards.mjs producthunt --resolve-urls --resolve-limit 10 --json
 *   node boards.mjs toolify --board new --limit 20
 *   node boards.mjs toolify --board revenue --limit 50 --out revenue.jsonl
 *   node boards.mjs toolify --board trending --limit 20 --resolve-domains --resolve-limit 20
 *   node boards.mjs traffic-cv --type traffic --tab new --year 2026 --month 7
 *   node boards.mjs traffic-cv --type revenue --tab top
 *   node boards.mjs trustmrr --board mrr --limit 20 --resolve-domains
 *   node boards.mjs columbus --board ai-backlink-rank --limit 30
 *   node boards.mjs producthunt --json | jq -r '.[].domain' | sort -u   # 喂给下游
 *
 * 依赖：
 *   - Node 22+，零第三方依赖。
 *   - traffic-cv / trustmrr / columbus：**纯 HTTP，无需登录、无需 token**，可进 CI。
 *   - producthunt / toolify：目标站挂了 Cloudflare 托管质询，纯 HTTP 一律 403，
 *     必须用 OpenCLI 驱动本机真实 Chrome（`opencli doctor` 要绿）。不需要登录账号，
 *     只是需要一个能过 CF 质询的真实浏览器。
 *   - producthunt 另有官方 GraphQL API v2 路径：设置环境变量 PRODUCTHUNT_TOKEN
 *     或在 rankup/.env 里写 `PRODUCTHUNT_TOKEN=...`（developer token，
 *     自助申请见 https://api.producthunt.com/v2/docs）。缺失时自动降级到浏览器路径。
 *     **不要把真实 token 写进脚本或文档。**
 *
 * 失败留现场（2026-08-30 重构第二波，截图链路已实盘验证）：
 *   - 浏览器源（producthunt / toolify / taaft）单页失败：先把**截图+页面全文**落进
 *     证据目录、状态记进 manifest，再继续/收尾——不再 die 全局，也不再让 finally
 *     的 browserClose 先毁现场（--keep-open 连关都不关）。
 *   - HTTP 源（traffic.cv / trustmrr / columbus）失败：响应体原样落证据目录，
 *     异常带落点路径。
 *   - 每次运行落 manifest.json；「0 条 + 源失败」和「0 条 + 源成功」长得不一样。
 *
 * 已验证：2026-08-23；toolify trending / revenue / new 分支 2026-09-13 复验
 *   producthunt（浏览器路径）/ toolify（浏览器路径）/ traffic-cv / trustmrr / columbus
 *   都真跑出数。producthunt 的 GraphQL 路径**未验证**（手上没有 token），
 *   代码按官方文档写，首次使用请以浏览器路径的结果为准做交叉核对。
 *   taaft（浏览器路径）也真跑出数（工具榜 + 许愿区，两块都验证过）。
 *
 * 已知坑（都踩过）：
 *   - taaft：**是站点在挡我们，不是环境不可达**（2026-08-23 更正了之前的判断）。
 *     纯 HTTP 一律 403 + `cf-mitigated: challenge`（/new/ /requests/ /sitemap.xml
 *     /api/ 全挂，只有 /robots.txt 能过），但 OpenCLI 驱动真实 Chrome 一次就打开了。
 *     apex 域用 curl 直连时报的「TLS 握手被切断」是本机代理的 fake-IP（198.18.x.x）
 *     假象，走 HTTPS_PROXY 就正常。判据：DNS 解到 198.18/15 网段 = 本机代理接管，
 *     此时任何「连不上」的结论都要先换代理路径复验。
 *   - taaft 只给相对时间（「Released 5mo ago」「25d ago」），没有绝对日期字段。
 *   - taaft 工具榜一页就出 200 条上下、没有分页；许愿区每页 24 条，用
 *     /requests/page/<n>/ 翻页，--pages 控制。
 *   - producthunt 的外链是 /r/p/<id> 跳转，纯 HTTP 跟随重定向同样被 CF 挡（403）。
 *     真实域名只能靠浏览器实际跳一次拿 location.href，所以 --resolve-urls 很慢
 *     （每个产品一次导航），默认关闭，用 --resolve-limit 控制条数。
 *   - toolify 的 `Best-AI-Tools-revenue` **不给收入数字**，站方自己的说明就是
 *     「基于支付平台检测 + 实际月访问量」的推断排名。整个 __NUXT__ 负载里没有任何
 *     revenue / mrr / arr 字段（2026-08-23 逐字段核过），metric 因此只能是访问量，
 *     支付平台放在 extra.paymentPlatform。要真收入数字去 trustmrr（Stripe 实连）。
 *   - **toolify 与 traffic.cv 的访问量是同一份上游数据**：chatgpt.com / claude.ai /
 *     openai.com / perplexity.ai / spicychat.ai 五个域名在两站的数字逐位相同
 *     （如 openai.com toolify 197,235,347 ↔ traffic.cv 197.24M）。
 *     **拿这两家互相「交叉验证」等于自证，没有独立性。**
 *   - toolify /new 没有提交日期字段，顺序即新旧，date 只能记成抓取日。
 *   - toolify `/Best-trending-AI-Tools`（2026-09-13 实测）：负载 data[0].tableData 300 行，
 *     行字段只有 name / handle / month_visited_count / growth / growth_rate / date（榜单月份）/
 *     tags，**没有 website**；渲染出的表格也只链到站内 /tool/<handle>。旧解析器只认带
 *     website 的列表，于是整页判「结构改了」、0 条。现在退到带 handle+name 的列表，
 *     url 记 toolify 工具页、domain=null、extra.websiteMissing=true；要域名加
 *     --resolve-domains（读 /tool/<handle> 的 data[0].tool.website）。
 *     该行的 created_at 是榜单记录写入时间，不是工具收录时间，date 取榜单月份。
 *     是不是平台最近才去掉 website 未能证实（没有更早的 trending 实跑记录），
 *     按 discipline.md 十五只修脚本、不改参考文档。
 *   - toolify 榜单页（trending / revenue）一页即全量 300 条：?page=2 被忽略、原样返回
 *     第一页、next_page_url=null。旧代码 --pages 2 会灌出整页重复行；现在按
 *     next_page_url / total 停止翻页，并按 handle 去重。/new 的 total 上千、next_page_url=1，
 *     但 ?page=2 同样原样返回第一页的 56 条——整页都是重复时停止翻页并打 note，
 *     manifest 的 newRows=0 就是证据。要更多新品得换取数方式（滚动加载），不是加 --pages。
 *   - trustmrr 榜单本身不带官网域名（website 字段在列表里恒为 null），
 *     必须再打一次 /startup/<slug> 详情页才有，故 --resolve-domains 默认关闭。
 *   - traffic.cv / trustmrr / columbus 都是 Next.js App Router，数据在 RSC flight
 *     分片里，本脚本先把 self.__next_f 分片拼回来再解析；columbus 走服务端渲染的
 *     <table>，选择器（列顺序）比 JSON 更易变，改版会先在这里断。
 *   - OpenCLI 会话名必须是字面常量且带组前缀，脚本用 `demand-b-*`；跑完自动 close。
 *     绝对不要跑 `opencli browser cleanup`，会关掉别人的标签页。
 */

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  requireBrowserBridge, sessionName, die, emit, initEvidence, saveEvidence,
  recordSource, writeManifest, captureBrowserScene, evidenceDir,
} from "./_lib.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = resolve(HERE, "..", "..", ".env");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ utils */

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function envVar(key) {
  if (process.env[key]) return process.env[key];
  if (!existsSync(ENV_FILE)) return undefined;
  for (const line of readFileSync(ENV_FILE, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i < 0) continue;
    if (t.slice(0, i).trim() === key) return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

async function httpText(url, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), opts.timeoutMs || 30000);
  try {
    const res = await fetch(url, {
      ...opts,
      signal: ctl.signal,
      headers: { "user-agent": UA, accept: "*/*", ...(opts.headers || {}) },
    });
    const body = await res.text();
    return { status: res.status, body, url: res.url };
  } finally {
    clearTimeout(t);
  }
}

/** Cloudflare 托管质询的指纹。命中说明必须换浏览器路径，不是解析写错了。 */
const isCfChallenge = (r) => r.status === 403 && /Just a moment|cf_chl_opt|challenges\.cloudflare/.test(r.body);

/** 把 Next.js App Router 的 RSC flight 分片拼回一整条字符串。 */
function flightPayload(html) {
  let out = "";
  const re = /self\.__next_f\.push\(\[1,\s*"((?:[^"\\]|\\.)*)"\]\)/g;
  let m;
  while ((m = re.exec(html))) {
    try {
      out += JSON.parse('"' + m[1] + '"');
    } catch {
      /* 分片本身损坏就跳过，别让一片坏数据废掉整页 */
    }
  }
  return out;
}

/** 从 s 的 startIdx 处开始，按括号配平截出一个完整的 JSON 数组/对象并解析。 */
function sliceJson(s, startIdx) {
  const open = s[startIdx];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = startIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return JSON.parse(s.slice(startIdx, i + 1));
    }
  }
  throw new Error("unbalanced JSON while slicing embedded payload");
}

/** 在 flight 文本里找 `"<key>":[` 并解析出那个数组。 */
function arrayAfterKey(payload, key) {
  const needle = `"${key}":[`;
  const i = payload.indexOf(needle);
  if (i < 0) return null;
  return sliceJson(payload, i + needle.length - 1);
}

function hostOf(u) {
  if (!u) return null;
  try {
    return new URL(u.startsWith("http") ? u : `https://${u}`).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function stripTracking(u) {
  if (!u) return u;
  try {
    const url = new URL(u);
    for (const k of [...url.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_|source$)/i.test(k)) url.searchParams.delete(k);
    }
    return url.toString().replace(/\?$/, "");
  } catch {
    return u;
  }
}

const today = () => new Date().toISOString().slice(0, 10);

/* -------------------------------------------------------------- opencli io */
// 会话名纪律见 _lib.sessionName()：绝不能是字面常量，后缀取真正会并发的那个单位。

function opencli(args, timeoutMs = 180000) {
  const r = spawnSync("opencli", args, { encoding: "utf8", timeout: timeoutMs });
  if (r.error) throw new Error(`opencli 调不起来（装了吗？）：${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`opencli ${args.slice(0, 3).join(" ")} 失败：${(r.stderr || r.stdout || "").trim().slice(-500)}`);
  }
  return r.stdout;
}

function browserEval(session, code) {
  const out = opencli(["browser", session, "--window", "background", "eval", code]);
  const i = out.indexOf("{");
  const j = out.indexOf("[");
  const start = i < 0 ? j : j < 0 ? i : Math.min(i, j);
  if (start < 0) return null;
  return JSON.parse(out.slice(start));
}

/** 打开页面并等它真的 ready；返回最终 URL（跟完重定向后的）。 */
function browserOpen(session, url, { waitMs = 25000 } = {}) {
  // producthunt（浏览器路径）/ toolify / taaft 三条命令全走这一个函数，
  // 桥没连上时原来会在这里的 spawnSync 上无声挂到 timeoutMs（180s）才报错，
  // 而且报的是「eval 超时」这种症状性错误，容易被当成「站点没数据」。
  requireBrowserBridge();
  opencli(["browser", session, "--window", "background", "open", url]);
  const deadline = Date.now() + waitMs;
  let last = null;
  while (Date.now() < deadline) {
    sleep(1200);
    try {
      last = browserEval(session, "(()=>({rs:document.readyState,u:location.href,err:location.href.startsWith('chrome-error')}))()");
    } catch {
      continue;
    }
    if (last && last.err) throw new Error(`浏览器连不上 ${url}（chrome-error），多半是本机网络/代理够不着这个站`);
    if (last && last.rs === "complete") return last.u;
  }
  if (!last) throw new Error(`打开 ${url} 后拿不到页面状态`);
  return last.u;
}

function browserClose(session) {
  try {
    opencli(["browser", session, "--window", "background", "close"], 60000);
  } catch {
    /* 关不掉不该让整次取数失败，但也别静默到看不见 */
    console.error(`warn: 会话 ${session} 没关干净，手动跑 opencli browser ${session} close`);
  }
}

/**
 * 浏览器源失败：**先取证后关**。截图+页面全文成对落进证据目录，状态记进 manifest，
 * 然后由调用方决定继续跑其它页/其它步骤（单页失败不 die 全局）。
 * 截图链路已实盘验证（2026-08-30 重构第二波）。
 */
function leaveSceneAndRecord(session, source, tag, error) {
  const scene = captureBrowserScene(session, tag);
  recordSource({ source, status: "browser_error", rawCount: 0, error: String(error?.message ?? error), scene });
  console.error(`warn: ${source} 取数失败，现场已留 ${evidenceDir()}：${String(error?.message ?? error).slice(0, 200)}`);
  return scene;
}

/** HTTP 源失败：把响应体原样落证据目录再抛，异常里带落点路径。 */
function httpFailure(source, url, r, note) {
  const file = saveEvidence(`${source.replace(/[^a-zA-Z0-9_-]/g, "_")}-${r?.status ?? "neterr"}.html`, r?.body ?? "");
  recordSource({ source, status: r?.status ? `http_${r.status}` : "bad_payload", rawCount: 0, error: note, evidence: file });
  return new Error(`${note}（响应体已留 ${file}）`);
}

/* ------------------------------------------------------------ arg parsing */

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--") {
      out._.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      const key = (eq < 0 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      let val = eq < 0 ? undefined : a.slice(eq + 1);
      if (val === undefined) {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("-")) {
          val = next;
          i++;
        } else val = true;
      }
      out[key] = val;
    } else if (a.startsWith("-") && a.length > 1) {
      const key = a.slice(1);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        out[key] = next;
        i++;
      } else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

const num = (v, d) => (v === undefined || v === true ? d : Number(v));

/* -------------------------------------------------------------- 输出与落盘 */
// 输出走 _lib.emit：--out / --json / 表格之外还会落 manifest.json，
// 且空结果时逐源报采集状态——「0 条 + 源失败」和「0 条 + 源成功」长得不一样。

const FIELDS = ["source", "rank", "name", "url", "domain", "metric", "metricLabel", "date"];
const COLS = FIELDS.map((f) => ({ key: f, label: f, max: 46 }));

/* ============================================================ PRODUCT HUNT */

const PH_GQL = "https://api.producthunt.com/v2/api/graphql";

async function phViaGraphql(token, date, limit) {
  const after = `${date}T00:00:00Z`;
  const before = `${date}T23:59:59Z`;
  const query = `query($after:DateTime,$before:DateTime,$n:Int!){
    posts(postedAfter:$after, postedBefore:$before, order:VOTES, first:$n){
      edges{node{ id name tagline slug votesCount commentsCount website url featuredAt }}
    }
  }`;
  const r = await httpText(PH_GQL, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { after, before, n: Math.min(limit, 50) } }),
  });
  let json;
  try {
    json = JSON.parse(r.body);
  } catch {
    throw new Error(`GraphQL 返回不是 JSON（HTTP ${r.status}）：${r.body.slice(0, 200)}`);
  }
  if (json.errors || json.error) {
    throw new Error(`GraphQL 报错：${JSON.stringify(json.errors || json.error).slice(0, 300)}`);
  }
  const edges = json?.data?.posts?.edges || [];
  return edges.map((e, i) => ({
    source: "producthunt",
    rank: i + 1,
    name: e.node.name,
    // website 是 PH 的跳转链接，真实域名仍需 --resolve-urls 跟一次
    url: e.node.website || e.node.url,
    domain: hostOf(e.node.website),
    metric: e.node.votesCount,
    metricLabel: "upvotes",
    date,
    extra: {
      id: e.node.id,
      slug: e.node.slug,
      tagline: e.node.tagline,
      comments: e.node.commentsCount,
      phUrl: e.node.url,
      via: "graphql",
    },
  }));
}

const PH_EXTRACT = `(()=>{
  const c = window.__APOLLO_CLIENT__ && window.__APOLLO_CLIENT__.cache.extract();
  if(!c) return {error:"no apollo cache"};
  const posts = Object.values(c).filter(v=>v&&v.__typename==="Post"&&v.shortenedUrl);
  return {posts: posts.map(p=>({
    id:p.id, name:p.name, slug:p.slug, tagline:p.tagline,
    dailyRank:p.dailyRank, weeklyRank:p.weeklyRank, monthlyRank:p.monthlyRank,
    votes:p.latestScore, launchDayScore:p.launchDayScore, comments:p.commentsCount,
    featuredAt:p.featuredAt, shortenedUrl:p.shortenedUrl
  }))};
})()`;

async function phViaBrowser(session, date, limit, scrolls) {
  const [y, m, d] = date.split("-").map(Number);
  browserOpen(session, `https://www.producthunt.com/leaderboard/daily/${y}/${m}/${d}`);
  for (let i = 0; i < scrolls; i++) {
    browserEval(session, "(()=>{window.scrollTo(0,document.body.scrollHeight);return 1;})()");
    sleep(1800);
  }
  const res = browserEval(session, PH_EXTRACT);
  if (!res || res.error) throw new Error(`PH 页面里没找到 Apollo 缓存：${res && res.error}`);
  const posts = res.posts
    .filter((p) => !p.featuredAt || p.featuredAt.slice(0, 10) === date)
    .sort((a, b) => Number(a.dailyRank || 999) - Number(b.dailyRank || 999))
    .slice(0, limit);
  return posts.map((p) => ({
    source: "producthunt",
    rank: Number(p.dailyRank) || null,
    name: p.name,
    url: `https://www.producthunt.com${p.shortenedUrl}`,
    domain: null, // 需要 --resolve-urls 才有
    metric: p.votes,
    metricLabel: "upvotes",
    date,
    extra: {
      id: p.id,
      slug: p.slug,
      tagline: p.tagline,
      comments: p.comments,
      weeklyRank: p.weeklyRank,
      monthlyRank: p.monthlyRank,
      phUrl: `https://www.producthunt.com/products/${p.slug}`,
      via: "browser",
    },
  }));
}

/** 无 token、无浏览器时的最后兜底：官方 Atom feed。没有名次、没有票数。 */
async function phViaFeed(limit, date) {
  const r = await httpText("https://www.producthunt.com/feed");
  if (r.status !== 200) throw new Error(`PH feed HTTP ${r.status}`);
  const entries = r.body.split("<entry>").slice(1);
  const rows = [];
  for (const e of entries) {
    const name = (e.match(/<title>([^<]*)<\/title>/) || [])[1];
    const published = (e.match(/<published>([^<]*)<\/published>/) || [])[1];
    const rlink = (e.match(/\/r\/p\/(\d+)/) || [])[1];
    if (!name) continue;
    const day = published ? published.slice(0, 10) : null;
    if (date && day && day !== date) continue;
    rows.push({
      source: "producthunt",
      rank: null,
      name,
      url: rlink ? `https://www.producthunt.com/r/p/${rlink}` : null,
      domain: null,
      metric: null,
      metricLabel: "upvotes",
      date: day,
      extra: { id: rlink, via: "atom-feed" },
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/** 用浏览器把 /r/p/<id> 跳转跟到底，拿产品真实外链域名。慢，按条计费。 */
function phResolveUrls(session, rows, max) {
  let done = 0;
  for (const row of rows) {
    if (done >= max) break;
    if (!row.url || !/\/r\/(p|ad)\//.test(row.url)) continue;
    try {
      const final = browserOpen(session, `${row.url}${row.url.includes("?") ? "&" : "?"}app_id=339`);
      const host = hostOf(final);
      if (host && !/producthunt\.com$/.test(host)) {
        row.url = stripTracking(final);
        row.domain = host;
      }
    } catch (e) {
      row.extra = { ...row.extra, resolveError: String(e.message).slice(0, 120) };
    }
    done++;
  }
  return rows;
}

async function cmdProducthunt(args) {
  const date = args.date && args.date !== true ? String(args.date) : today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) die("--date 要 YYYY-MM-DD");
  const limit = num(args.limit, 30);
  const token = envVar("PRODUCTHUNT_TOKEN");
  const wantBrowser = args.noBrowser !== true && args.browser !== "false";
  const session = sessionName("demand-producthunt");

  let rows = null;
  let needSession = false;

  if (token) {
    try {
      rows = await phViaGraphql(token, date, limit);
      recordSource({ source: "producthunt:graphql", status: "ok", rawCount: rows.length });
    } catch (e) {
      recordSource({ source: "producthunt:graphql", status: "graphql_error", rawCount: 0, error: String(e.message) });
      console.error(`warn: GraphQL 路径失败，降级：${e.message}`);
    }
  } else {
    console.error("note: 没有 PRODUCTHUNT_TOKEN（环境变量或 rankup/.env），走浏览器路径");
  }

  try {
    if (!rows || !rows.length) {
      if (!wantBrowser) {
        rows = await phViaFeed(limit, args.date ? date : null);
        recordSource({ source: "producthunt:atom-feed", status: "ok", rawCount: rows.length });
        console.error("note: --no-browser，只有 Atom feed 兜底：没有名次、没有票数");
      } else {
        needSession = true;
        try {
          rows = await phViaBrowser(session, date, limit, num(args.scrolls, 2));
          recordSource({ source: "producthunt:browser", status: "ok", rawCount: rows.length });
        } catch (e) {
          // 先取证后关：截图+页面全文进证据目录，空结果由 manifest 说明是「没取到」。
          leaveSceneAndRecord(session, "producthunt:browser", "producthunt-failed", e);
          rows = [];
        }
      }
    }
    if (args.resolveUrls && rows.length) {
      needSession = true;
      rows = phResolveUrls(session, rows, num(args.resolveLimit, 10));
    }
  } finally {
    if (needSession && !args.keepOpen) browserClose(session);
  }
  return rows;
}

/* ================================================================= TOOLIFY */

const TOOLIFY_BOARDS = {
  new: { path: "/new", label: "monthly visits" },
  revenue: { path: "/Best-AI-Tools-revenue", label: "monthly visits" },
  trending: { path: "/Best-trending-AI-Tools", label: "monthly visits" },
  "most-saved": { path: "/most-saved", label: "monthly visits" },
  "most-used": { path: "/most-used", label: "monthly visits" },
};

export const TOOLIFY_EXTRACT = `(()=>{
  const n = window.__NUXT__;
  if(!n || !n.data || !n.data[0]) return {error:"no __NUXT__ payload"};
  const d = n.data[0];
  const prefer = ["toolsList","tableData","list","data","items"];
  const keys = [...prefer, ...Object.keys(d).filter(k=>!prefer.includes(k))];
  const listWhere = ok => keys.find(k=>Array.isArray(d[k]) && d[k].length && d[k][0] && ok(d[k][0]));
  // 先找带 website 的列表；找不到再退到「像工具条目」的列表（handle + name + 访问量字段）。
  // /Best-trending-AI-Tools 的 tableData 行只有 handle/name/访问量/增长，没有 website
  // （2026-09-13 实测，DOM 里也只有 /tool/<handle> 站内链接），外链域名要靠 --resolve-domains。
  // 回退必须要求 month_visited_count：/most-saved、/most-used 负载里的 category_group_list
  // 也有 handle+name，只认这两个会把分类当工具、以 ok 状态吐出来，绕过失败留现场。
  const key = listWhere(t=>t.website) || listWhere(t=>t.handle && t.name && Object.prototype.hasOwnProperty.call(t,"month_visited_count"));
  if(!key) return {error:"payload 里找不到工具列表（既没有带 website 的，也没有带 handle+name+month_visited_count 的），页面结构可能改了"};
  // 「Payment Platform」优先从负载里的 t.payment_platform 数组取（2026-08-23 实测
  // 这个字段确实存在，早期版本误判为「只在 DOM 里」）。渲染出来的表格作为兜底，
  // 万一字段被改名还能救回来。social_media_site_id 是内部枚举，不可靠，别用。
  const ths=[...document.querySelectorAll("th")].map(x=>x.innerText.trim());
  const payIdx=ths.indexOf("Payment Platform");
  const payBy={};
  if(payIdx>=0){
    for(const tr of document.querySelectorAll("tbody tr")){
      const c=[...tr.querySelectorAll("td")];
      if(c.length<=payIdx) continue;
      const site=(c[2]&&c[2].innerText.trim())||"";
      const host=site.replace(/^https?:\\/\\//,"").split(/[/?]/)[0];
      if(host) payBy[host]=c[payIdx].innerText.trim()||null;
    }
  }
  const hostOf=u=>String(u||"").replace(/^https?:\\/\\//,"").split(/[/?]/)[0];
  // 翻页元信息：榜单页（trending / revenue）一页就是全量 300 条，?page=2 被忽略、
  // 原样返回第一页且 next_page_url 为 null；/new 才是真分页。调用方据此停止翻页。
  const paging = {page:d.page, perPage:d.per_page, total:d.total,
    next: Object.prototype.hasOwnProperty.call(d,"next_page_url") ? d.next_page_url : undefined};
  return {key, total:d.total, paging, rows: d[key].map(t=>({
    name:t.name||t.website_name, website:t.website||null, visits:t.month_visited_count,
    handle:t.handle, desc:t.what_is_summary||t.description,
    growth:t.growth ?? null, growthRate:t.growth_rate ?? null, rankingMonth:t.date || null,
    payment: (Array.isArray(t.payment_platform) && t.payment_platform.length)
      ? t.payment_platform.join(", ")
      : (payBy[hostOf(t.website)] || null),
    traffic: t.traffic ? {
      topRegion: t.traffic.top_region,
      growthRate: t.traffic.growth_rate,
      sources: t.traffic.top_traffic_sources
    } : null,
    createdAt:t.created_at, isAd:!!t.is_ad,
    categories:(t.categories||[]).map(c=>c.name).slice(0,3)
  }))};
})()`;

const numOrNull = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const toolifyToolUrl = (handle) => (handle ? `https://www.toolify.ai/tool/${handle}` : null);

/**
 * TOOLIFY_EXTRACT 的一页结果 → 统一字段行，追加进 rows。纯函数（离线测试直接喂它）。
 * 没有 website 的行（trending 榜）url 退到 toolify 工具页、domain 记 null、
 * extra.websiteMissing=true——**不许把站内工具页的 toolify.ai 当成产品域名**。
 * seen 按 handle/website 去重，防止「翻页参数被忽略、同一页返回两次」灌出重复行。
 */
export function appendToolifyRows(rows, res, { boardKey, limit, skipAds = false, date, seen = new Set() }) {
  let added = 0;
  for (const t of res.rows) {
    if (rows.length >= limit) break;
    if (skipAds && t.isAd) continue;
    const dedupeKey = t.handle || t.website || t.name;
    if (dedupeKey && seen.has(dedupeKey)) continue;
    if (dedupeKey) seen.add(dedupeKey);
    const website = t.website ? stripTracking(t.website) : null;
    rows.push({
      source: `toolify:${boardKey}`,
      rank: rows.length + 1,
      name: t.name,
      url: website || toolifyToolUrl(t.handle),
      domain: hostOf(website),
      metric: numOrNull(t.visits),
      metricLabel: "monthly visits",
      // 月度榜（trending）行上的 date 是榜单月份；/new 没有提交日期字段，只能记抓取日；
      // 其它榜单页有 created_at（工具收录时间）时用它。trending 行的 created_at 是
      // 榜单记录的写入时间，不是工具收录时间，所以 rankingMonth 优先。
      date: t.rankingMonth ? String(t.rankingMonth).slice(0, 10) : t.createdAt ? String(t.createdAt).slice(0, 10) : date,
      extra: {
        handle: t.handle,
        toolifyUrl: toolifyToolUrl(t.handle),
        websiteMissing: !website,
        tagline: t.desc ? String(t.desc).slice(0, 160) : null,
        paymentPlatform: t.payment,
        traffic: t.traffic,
        growth: numOrNull(t.growth),
        growthRate: numOrNull(t.growthRate),
        categories: t.categories,
        isAd: t.isAd,
        listKey: res.key,
      },
    });
    added++;
  }
  return added;
}

/** 这一页之后还值得翻下一页吗？next_page_url 明确为 null、或本页已覆盖 total，就停。 */
export function toolifyHasMorePages(res) {
  const p = res?.paging;
  if (!p) return true;
  if (p.next === null) return false;
  const page = numOrNull(p.page);
  const perPage = numOrNull(p.perPage);
  const total = numOrNull(p.total);
  if (page && perPage && total !== null && page * perPage >= total) return false;
  return true;
}

const TOOLIFY_DETAIL_WEBSITE = `(()=>{
  const d = window.__NUXT__ && window.__NUXT__.data && window.__NUXT__.data[0];
  if(!d || !d.tool) return {error:"工具详情页 __NUXT__ 里没有 tool 对象"};
  return {website: d.tool.website || null, handle: d.tool.handle || null};
})()`;

/**
 * 逐条打开 /tool/<handle> 读 tool.website，补 trending 榜缺的外链域名。慢（每条一次导航）。
 * 只补 websiteMissing 的行；单条失败写 extra.resolveError，汇总状态进 manifest。
 */
function toolifyResolveDomains(session, rows, boardKey, max) {
  let tried = 0;
  let resolved = 0;
  const errors = [];
  for (const row of rows) {
    if (tried >= max) break;
    if (!row.extra?.websiteMissing || !row.extra.handle) continue;
    tried++;
    try {
      browserOpen(session, toolifyToolUrl(row.extra.handle));
      const r = browserEval(session, TOOLIFY_DETAIL_WEBSITE);
      if (!r || r.error) throw new Error(r?.error ?? "eval 无返回");
      const website = r.website ? stripTracking(r.website) : null;
      const host = hostOf(website);
      if (!host || /(^|\.)toolify\.ai$/.test(host)) throw new Error(`详情页没有可用的外链 website（${r.website ?? "null"}）`);
      row.url = website;
      row.domain = host;
      row.extra.websiteMissing = false;
      row.extra.websiteVia = "tool-detail";
      resolved++;
    } catch (e) {
      row.extra.resolveError = String(e.message).slice(0, 160);
      errors.push(`${row.extra.handle}: ${row.extra.resolveError}`);
    }
  }
  recordSource({
    source: `toolify:${boardKey}:resolve-domains`,
    status: errors.length ? "resolve_error" : "ok",
    rawCount: resolved,
    ...(errors.length ? { error: `${errors.length}/${tried} 条没解析出域名：${errors.slice(0, 3).join("；")}` } : {}),
  });
}

async function cmdToolify(args) {
  const boardKey = args.board && args.board !== true ? String(args.board) : "new";
  const path = args.path && args.path !== true ? String(args.path) : (TOOLIFY_BOARDS[boardKey] || {}).path;
  if (!path) die(`--board 只认 ${Object.keys(TOOLIFY_BOARDS).join(" / ")}，或用 --path /任意路径`);
  const limit = num(args.limit, 50);
  const pages = num(args.pages, 1);
  const session = sessionName("demand-toolify");
  const date = today();
  const rows = [];
  const seen = new Set();
  try {
    for (let page = 1; page <= pages && rows.length < limit; page++) {
      const url = `https://www.toolify.ai${path}${page > 1 ? `?page=${page}` : ""}`;
      let res;
      try {
        browserOpen(session, url);
        res = browserEval(session, TOOLIFY_EXTRACT);
        if (!res || res.error) throw new Error(`toolify 取数失败：${res?.error ?? "eval 无返回"}`);
      } catch (e) {
        // 单页失败不 die 全局：先取证（截图+全文）再停止翻页，已取到的页照常输出。
        leaveSceneAndRecord(session, `toolify:${boardKey}:page${page}`, `toolify-${boardKey}-page${page}`, e);
        break;
      }
      const missing = res.rows.filter((t) => !t.website).length;
      const added = appendToolifyRows(rows, res, { boardKey, limit, skipAds: Boolean(args.skipAds), date, seen });
      recordSource({
        source: `toolify:${boardKey}:page${page}`,
        status: "ok",
        rawCount: res.rows.length,
        newRows: added,
        listKey: res.key,
        ...(missing ? { websiteMissing: missing } : {}),
      });
      if (page > 1 && res.rows.length && added === 0) {
        console.error(`note: toolify ${path}?page=${page} 返回的全是前页已有条目（翻页参数无效），不再翻页`);
        break;
      }
      if (page < pages && !toolifyHasMorePages(res)) {
        console.error(`note: toolify ${path} 这一页已是全量（next_page_url=null 或已覆盖 total=${res.paging?.total}），不再翻页`);
        break;
      }
    }
    const missingRows = rows.filter((r) => r.extra.websiteMissing).length;
    if (missingRows && args.resolveDomains) {
      toolifyResolveDomains(session, rows, boardKey, num(args.resolveLimit, 10));
      const left = rows.filter((r) => r.extra.websiteMissing).length;
      if (left) console.error(`note: 仍有 ${left} 条 domain 为 null（超出 --resolve-limit 或解析失败，见 extra.resolveError）`);
    } else if (missingRows) {
      console.error(
        `note: ${missingRows} 条没有外链 website（该榜单负载本身不带），url 记成 toolify 工具页、domain 为 null；` +
          `要域名加 --resolve-domains [--resolve-limit n]`,
      );
    }
  } finally {
    if (!args.keepOpen) browserClose(session);
  }
  return rows;
}

/* =================================================================== TAAFT */

/* 「最新收录的 AI 工具」列表页。每个条目是一个 <li class="li">，
   真正有用的东西全在 data-* 属性上（含未经跳转的真实外链），统计数字在几个
   有语义的 class 里。 */
const TAAFT_TOOLS_EXTRACT = `(()=>{
  const items = [...document.querySelectorAll("li.li")];
  if(!items.length) return {error:"页面上没有 li.li，选择器改了或者页面还没渲染完"};
  const txt = (el,sel) => { const e = el.querySelector(sel); return e ? e.innerText.trim() : null; };
  const numOf = v => v==null ? null : (Number(String(v).replace(/[^0-9.]/g,"")) || null);
  return {rows: items.map(li => {
    // 「Released 5mo ago」里的相对时间：站点只给相对值，没有绝对日期
    let released = null;
    for(const r of li.querySelectorAll(".relative")){
      const prev = r.previousElementSibling;
      if(prev && /released/i.test(prev.innerText||"")){ released = r.innerText.trim(); break; }
    }
    return {
      id: li.getAttribute("data-id"),
      name: li.getAttribute("data-name"),
      task: li.getAttribute("data-task"),
      taskSlug: li.getAttribute("data-task_slug"),
      rank: li.getAttribute("data-rank"),
      website: li.getAttribute("data-url"),
      featured: li.getAttribute("data-featured") === "true",
      desc: txt(li, ".short_desc"),
      views: numOf(txt(li, ".stats_views") || txt(li, ".views_count")),
      saves: numOf(txt(li, ".saves")),
      rating: numOf(txt(li, ".average_rating")),
      pricing: txt(li, ".ai_launch_date"),
      released,
    };
  })};
})()`;

/* 许愿区。每条 .row.request 带票数、回答数、分类、提交人、相对时间。 */
const TAAFT_REQUESTS_EXTRACT = `(()=>{
  const rows = [...document.querySelectorAll(".requests_wrap .row.request")];
  if(!rows.length) return {error:"页面上没有 .requests_wrap .row.request"};
  const txt = (el,sel) => { const e = el.querySelector(sel); return e ? e.innerText.trim() : null; };
  const numOf = v => v==null ? null : (Number(String(v).replace(/[^0-9.]/g,"")) || 0);
  const total = (()=>{ const e=document.querySelector(".requests-pg-hero-card strong"); return e?numOf(e.innerText):null; })();
  const hasNext = [...document.querySelectorAll("a")].some(a => (a.innerText||"").trim().toLowerCase()==="next");
  return {total, hasNext, rows: rows.map(r => {
    const a = r.querySelector("a.request_title");
    return {
      id: (r.querySelector("[data-request]")||{}).getAttribute ? r.querySelector("[data-request]").getAttribute("data-request") : null,
      title: a ? a.innerText.trim() : null,
      url: a ? a.getAttribute("href") : null,
      votes: numOf(txt(r, ".votes_count")),
      answers: numOf(txt(r, ".votes_answers")),
      type: txt(r, ".request_type"),
      user: txt(r, ".request_user_link"),
      age: txt(r, ".launch_date_top"),
    };
  })};
})()`;

const TAAFT_BOARDS = {
  new: { path: "/new/", kind: "tools" },
  requests: { path: "/requests/", kind: "requests" },
  "requests-top": { path: "/requests/most-voted/", kind: "requests" },
};

async function cmdTaaft(args) {
  const boardKey = args.board && args.board !== true ? String(args.board) : "new";
  const spec = TAAFT_BOARDS[boardKey];
  if (!spec) die(`--board 只认 ${Object.keys(TAAFT_BOARDS).join(" / ")}`);
  const limit = num(args.limit, 50);
  const pages = num(args.pages, 1);
  const session = sessionName("demand-taaft");
  const date = today();
  const rows = [];

  try {
    if (spec.kind === "tools") {
      let res;
      try {
        browserOpen(session, `https://theresanaiforthat.com${spec.path}`);
        res = browserEval(session, TAAFT_TOOLS_EXTRACT);
        if (!res || res.error) throw new Error(`taaft 取数失败：${res?.error ?? "eval 无返回"}`);
      } catch (e) {
        // 失败先取证（截图+全文），状态进 manifest；返回空行集而不是 die 全局。
        leaveSceneAndRecord(session, `taaft:${boardKey}`, `taaft-${boardKey}`, e);
        return rows;
      }
      recordSource({ source: `taaft:${boardKey}`, status: "ok", rawCount: res.rows.length });
      for (const t of res.rows) {
        if (rows.length >= limit) break;
        if (args.skipAds && t.featured) continue;
        const url = stripTracking(t.website);
        rows.push({
          source: `taaft:${boardKey}`,
          rank: rows.length + 1,
          name: t.name,
          url,
          domain: hostOf(url),
          metric: t.saves ?? null,
          metricLabel: "saves",
          // 站点只给「5mo ago」这种相对时间，没有绝对收录日期，date 记抓取日
          date,
          extra: {
            id: t.id,
            task: t.task,
            taskSlug: t.taskSlug,
            tagline: t.desc ? String(t.desc).slice(0, 160) : null,
            views: t.views,
            rating: t.rating,
            pricing: t.pricing,
            releasedAgo: t.released,
            siteRank: t.rank ? Number(t.rank) : null,
            featured: t.featured,
          },
        });
      }
    } else {
      for (let page = 1; page <= pages && rows.length < limit; page++) {
        const path = page > 1 ? `${spec.path}page/${page}/` : spec.path;
        let res;
        try {
          browserOpen(session, `https://theresanaiforthat.com${path}`);
          res = browserEval(session, TAAFT_REQUESTS_EXTRACT);
          if (!res || res.error) throw new Error(`taaft 取数失败：${res?.error ?? "eval 无返回"}`);
        } catch (e) {
          // 单页失败不 die 全局：先取证再停止翻页，已取到的页照常输出。
          leaveSceneAndRecord(session, `taaft:${boardKey}:page${page}`, `taaft-${boardKey}-page${page}`, e);
          break;
        }
        recordSource({ source: `taaft:${boardKey}:page${page}`, status: "ok", rawCount: res.rows.length });
        for (const q of res.rows) {
          if (rows.length >= limit) break;
          rows.push({
            source: `taaft:${boardKey}`,
            rank: rows.length + 1,
            name: q.title,
            url: q.url,
            domain: null, // 许愿条目还没有产品，本来就没有域名
            metric: q.votes,
            metricLabel: "request votes",
            date,
            extra: {
              id: q.id,
              answers: q.answers,
              type: q.type,
              user: q.user,
              postedAgo: q.age ? q.age.replace(/^[\s·]+/, "") : null,
              visibleRequestsTotal: res.total,
              page,
            },
          });
        }
        if (!res.hasNext) break;
      }
    }
  } finally {
    if (!args.keepOpen) browserClose(session);
  }
  return rows;
}

/* =============================================================== TRAFFIC.CV */

async function cmdTrafficCv(args) {
  const type = String(args.type && args.type !== true ? args.type : "traffic");
  if (!["traffic", "revenue"].includes(type)) die("--type 只认 traffic / revenue");
  const tab = String(args.tab && args.tab !== true ? args.tab : "new");
  if (!["new", "top", "trending"].includes(tab)) die("--tab 只认 new / top / trending");
  const limit = num(args.limit, 50);

  let path = `/leaderboard/${type}/${tab}`;
  if (type === "traffic" && args.year && args.month) {
    path = `/leaderboard/traffic/${Number(args.year)}/${Number(args.month)}/${tab}`;
  }
  const url = `https://traffic.cv${path}`;
  const r = await httpText(url);
  if (r.status !== 200) throw httpFailure("traffic.cv", url, r, `traffic.cv HTTP ${r.status} @ ${url}`);
  const payload = flightPayload(r.body);
  const data = arrayAfterKey(payload, "data");
  if (!data || !data.length) throw httpFailure("traffic.cv", url, r, "traffic.cv 页面里没解析出 data 数组（改版了？）");
  recordSource({ source: `traffic.cv:${type}-${tab}`, status: "ok", rawCount: data.length });

  const monthTag = data[0].year && data[0].month ? `${data[0].year}-${String(data[0].month).padStart(2, "0")}` : today().slice(0, 7);
  // 付费墙后的条目 hostname 被打成 `***`，域名对下游没用。默认剔掉，
  // 想看完整名次分布再加 --include-restricted。
  const usable = args.includeRestricted ? data : data.filter((d) => d.hostname && !/^\*+$/.test(d.hostname));
  return usable.slice(0, limit).map((d, i) => {
    const host = d.hostname;
    const isRev = type === "revenue";
    return {
      source: `traffic.cv:${type}-${tab}`,
      rank: d.rank ?? i + 1,
      name: host,
      url: `https://${host}`,
      domain: host,
      metric: isRev ? d.volume : d.visits,
      metricLabel: isRev ? "est. monthly payment volume" : "monthly visits",
      date: monthTag,
      extra: {
        previousVisits: d.previous_visits,
        growth: d.growth,
        deltaSign: d.delta_sign,
        domainCreatedAt: d.domain_created_at ? String(d.domain_created_at).slice(0, 10) : null,
        platform: d.platform,
        share: d.share,
        change: d.change,
        categories: d.categories,
        restricted: !!d.restricted,
        topKeywords: (d.raw?.TopKeywords || []).map((k) => ({ name: k.Name, volume: k.Volume })).slice(0, 5),
      },
    };
  });
}

/* ================================================================ TRUSTMRR */

const TRUSTMRR_BOARDS = {
  mrr: { field: "currentMrr", label: "MRR (USD)" },
  growth: { field: "cachedGrowth30d", label: "30d revenue growth (%)" },
  traffic: { field: "currentLast30DaysRevenue", label: "30d revenue (USD)" },
  revenuePerVisitor: { field: "revenuePerVisitorLast30Days", label: "revenue per visitor (USD)" },
  allTimeRevenue: { field: "currentTotalRevenue", label: "all-time revenue (USD)" },
};

async function trustmrrDomain(slug) {
  const r = await httpText(`https://trustmrr.com/startup/${slug}`).catch(() => null);
  if (!r || r.status !== 200) return null;
  const p = flightPayload(r.body);
  const m = p.match(/"website":"(https?:\/\/[^"]+)"/);
  return m ? m[1] : null;
}

async function cmdTrustmrr(args) {
  const board = String(args.board && args.board !== true ? args.board : "mrr");
  const spec = TRUSTMRR_BOARDS[board];
  if (!spec) die(`--board 只认 ${Object.keys(TRUSTMRR_BOARDS).join(" / ")}`);
  const limit = num(args.limit, 50);

  const r = await httpText("https://trustmrr.com/");
  if (r.status !== 200) throw httpFailure("trustmrr", "https://trustmrr.com/", r, `trustmrr HTTP ${r.status}`);
  const payload = flightPayload(r.body);
  const list = arrayAfterKey(payload, board);
  if (!list || !list.length) throw httpFailure("trustmrr", "https://trustmrr.com/", r, `trustmrr 首页里没解析出 "${board}" 榜（改版了？）`);
  recordSource({ source: `trustmrr:${board}`, status: "ok", rawCount: list.length });

  const rows = list.slice(0, limit).map((s, i) => ({
    source: `trustmrr:${board}`,
    rank: i + 1,
    name: s.name,
    url: `https://trustmrr.com/startup/${s.slug}`,
    domain: hostOf(s.website), // 列表里恒为 null，靠 --resolve-domains 补
    metric: s[spec.field] ?? null,
    metricLabel: spec.label,
    date: today(),
    extra: {
      slug: s.slug,
      tagline: s.description ? String(s.description).slice(0, 160) : null,
      mrr: s.currentMrr,
      totalRevenue: s.currentTotalRevenue,
      last30dRevenue: s.currentLast30DaysRevenue,
      growth30d: s.cachedGrowth30d,
      xHandle: s.xHandle,
      founder: s.xFounderName,
      onSale: s.onSale,
      stealth: s.stealthMode,
    },
  }));

  if (args.resolveDomains) {
    const max = num(args.resolveLimit, rows.length);
    for (let i = 0; i < Math.min(max, rows.length); i++) {
      if (rows[i].domain) continue;
      const site = await trustmrrDomain(rows[i].extra.slug);
      if (site) {
        rows[i].url = stripTracking(site);
        rows[i].domain = hostOf(site);
      }
    }
  }
  return rows;
}

/* ================================================================ COLUMBUS */

const COLUMBUS_BOARDS = {
  "ai-backlink-rank": { metricIdx: 8, label: "citing AI sites" },
  "ai-rank": { metricIdx: null, label: "rank" },
  "ai-keyword-rank": { metricIdx: null, label: "rank" },
};

/**
 * 单元格取文本。**必须先砍掉开标签剩下的属性串**——我们是按 `<td` 切片的，
 * 切完每片开头还挂着 `data-slot="…" class="…">`，不砍就会把 class 里的数字
 * （tabular-nums 之类）当成指标读进来，症状是「排名 1 的频次莫名变成 20537」。
 */
const textOf = (cell) =>
  cell
    .slice(cell.indexOf(">") + 1)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

async function cmdColumbus(args) {
  const board = String(args.board && args.board !== true ? args.board : "ai-backlink-rank");
  if (!COLUMBUS_BOARDS[board]) die(`--board 只认 ${Object.keys(COLUMBUS_BOARDS).join(" / ")}`);
  const limit = num(args.limit, 50);
  const url = `https://columbus.tools/${board}`;
  const r = await httpText(url);
  if (r.status !== 200) throw httpFailure("columbus", url, r, `columbus HTTP ${r.status} @ ${url}`);

  const tb = r.body.slice(r.body.indexOf("<tbody"), r.body.indexOf("</tbody>"));
  if (!tb) throw httpFailure("columbus", url, r, "columbus 页面里没有 <tbody>（改版了？）");
  const trs = tb.split("<tr").slice(1);
  const rows = [];
  for (const tr of trs) {
    if (rows.length >= limit) break;
    const tds = tr.split("<td").slice(1);
    if (tds.length < 3) continue;
    const cells = tds.map(textOf);
    // 列顺序：# | 域名(+简介) | 近3月 | 站点类型 | 月访问量 | DR | dofollow | 搜索占比 | 出现频次 | 操作
    // 注意：不是每一行都有后两列（非 AI 工具站的行只到「搜索占比」就结束），
    // 所以只能按前 8 列定位，第 9 列存在才当频次读，缺了就是 null。
    const href = (tr.match(/href="(https?:\/\/[^"]+)"/) || [])[1];
    const domain = hostOf(href) || cells[1].split(" ")[0];
    const rank = Number(cells[0]) || rows.length + 1;
    rows.push({
      source: `columbus:${board}`,
      rank,
      name: domain,
      url: href ? stripTracking(href) : `https://${domain}`,
      domain,
      metric: cells[8] ? Number(String(cells[8]).replace(/[^\d.]/g, "")) || cells[8] : null,
      metricLabel: COLUMBUS_BOARDS[board].label,
      date: today(),
      extra: {
        siteType: cells[3] || null,
        monthlyVisits: cells[4] || null,
        dr: cells[5] || null,
        linkType: cells[6] || null,
        searchShare: cells[7] || null,
        tagline: cells[1].replace(domain, "").trim().slice(0, 160) || null,
      },
    });
  }
  if (!rows.length) throw httpFailure("columbus", url, r, "columbus 解析出 0 行（列结构变了？）");
  recordSource({ source: `columbus:${board}`, status: "ok", rawCount: rows.length });
  return rows;
}

/* ==================================================================== main */

const SOURCES = {
  producthunt: cmdProducthunt,
  toolify: cmdToolify,
  taaft: cmdTaaft,
  "traffic-cv": cmdTrafficCv,
  trustmrr: cmdTrustmrr,
  columbus: cmdColumbus,
};

const HELP = `boards.mjs —— AI 工具榜单 / 新品发现站统一取数器

用法：
  node boards.mjs <source> [options]

source：
  producthunt   PH 每日新品榜（名次/票数/日期，可解析真实外链域名）
  toolify       Toolify 最新收录 / 有收入榜
  taaft         There's An AI For That 最新收录 + 许愿区
  traffic-cv    traffic.cv 流量榜 / 收入榜
  trustmrr      TrustMRR Stripe 实连收入榜
  columbus      columbus.tools AI 站外链榜

通用选项：
  --limit <n>        取前 n 条（默认按源 30~50）
  --json             输出结构化 JSON（默认人类可读表格）
  --out <file>       落盘；.jsonl 结尾写 JSON Lines，否则写 JSON
  --keep-open        浏览器源失败/跑完都不关标签页（排查时保住活现场）
  --evidence-dir <d> 失败现场与 manifest 落点（默认 .rankup/evidence/demand/boards-<ts>/）
  -h, --help         本帮助

producthunt：
  --date <YYYY-MM-DD>   榜单日期，默认今天（本地 UTC 日）
  --resolve-urls        跟随 /r/p/ 跳转拿产品真实外链域名（慢，逐条导航）
  --resolve-limit <n>   最多解析几条外链（默认 10）
  --scrolls <n>         榜单页下滑几次以加载更多（默认 2）
  --no-browser          不用浏览器，只用官方 Atom feed 兜底（无名次、无票数）
  token：PRODUCTHUNT_TOKEN（环境变量 → rankup/.env）。有则走官方 GraphQL，无则走浏览器。

taaft（需浏览器；不需要登录账号，只需要一个能过 CF 质询的真实 Chrome）：
  --board <k>        new | requests | requests-top（默认 new）
                     new          = 最新收录的 AI 工具（metric = saves）
                     requests     = 许愿区最新（metric = 票数）
                     requests-top = 许愿区按票数排（真实需求信号最强的一档）
  --pages <n>        许愿区翻几页（每页 24 条，默认 1）
  --skip-ads         工具榜过滤 data-featured 的推广位

toolify：
  --board <k>        new | revenue | trending | most-saved | most-used（默认 new）
  --path </x>        直接指定任意榜单路径，覆盖 --board
  --pages <n>        翻几页（默认 1；榜单页一页即全量，next_page_url=null 时自动停）
  --skip-ads         过滤 is_ad 的推广位
  --resolve-domains  trending 榜负载不带外链 website：逐条打开 /tool/<handle> 补域名（慢）
  --resolve-limit <n>  最多补几条（默认 10）

traffic-cv：
  --type <t>         traffic | revenue（默认 traffic）
  --tab <t>          new | top | trending（默认 new）
  --year <y> --month <m>   仅 traffic 支持按年月取历史榜
  --include-restricted     保留付费墙后 hostname 被打码成 *** 的条目（默认剔除）

trustmrr：
  --board <k>        mrr | growth | traffic | revenuePerVisitor | allTimeRevenue
  --resolve-domains  逐条打详情页补官网域名（榜单本身不带）
  --resolve-limit <n>

columbus：
  --board <k>        ai-backlink-rank | ai-rank | ai-keyword-rank

输出字段（所有源统一）：
  source, rank, name, url, domain, metric, metricLabel, date  (+ extra)

示例：
  node boards.mjs producthunt --date 2026-08-22 --limit 20 --resolve-urls
  node boards.mjs traffic-cv --type traffic --tab new --year 2026 --month 7 --json
  node boards.mjs columbus --limit 30 --out backlink.jsonl
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const source = args._[0];
  const askedForHelp = Boolean(args.h || args.help);
  if (askedForHelp || !source) {
    console.log(HELP);
    // 显式 `--help` 是成功，退出码 0；什么都不给才是用法错误，退出码 1。
    // 原来写成 `source ? 0 : 1`，于是 `boards.mjs --help` 退 1——
    // 任何 set -e 的批处理或「所有脚本 --help 都要能跑」的自检都会误判成脚本坏了。
    process.exit(askedForHelp ? 0 : 1);
  }
  const fn = SOURCES[source];
  if (!fn) die(`未知 source「${source}」。可选：${Object.keys(SOURCES).join(", ")}`);
  initEvidence("boards", { dir: args.evidenceDir ?? null });
  try {
    const rows = await fn(args);
    emit(rows, args, COLS); // _lib.emit：落 manifest + 空结果逐源报状态
  } catch (e) {
    die(e.message); // _lib.die：先落 manifest（stopReason=died）再退出
  }
}

// 只有直接执行时才跑 main；被测试 import 时保持零副作用（tests/boards-toolify.test.mjs）。
// 两边都取 realpath：经 ~/.claude/skills/rankup 软链调用时 argv[1] 是链接路径。
const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
})();
if (invokedDirectly) main();
