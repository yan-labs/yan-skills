#!/usr/bin/env node
/**
 * reviews-mine.mjs —— 从「差评」里挖需求。
 *
 * 核心假设：差评是唯一由用户「掏了钱之后」给出的反馈。
 * 用户骂竞品什么，什么就是还没被满足的需求。
 * 所以本脚本默认只要 1-2 星，把它们的原文捞出来做聚类。
 *
 * 支持的源：
 *   appstore    Apple App Store 评论（公开 RSS，零配置，最好用）
 *   gplay       Google Play 评论（公开 batchexecute RPC，零配置，可按星级筛）
 *   trustpilot  Trustpilot（页面内嵌 __NEXT_DATA__，被 AWS WAF 挡，必须走 opencli）
 *   g2          G2（B2B SaaS，Cloudflare，必须走 opencli；读页面 ld+json）
 *   capterra    Capterra（Cloudflare，必须走 opencli；ld+json + DOM 里的 Pros/Cons）
 *
 * 用法：
 *   # App Store：直接用数字 app id
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source appstore --target 1234567890 --pages 3
 *
 *   # App Store：--target 不是纯数字时自动走 iTunes search 解析成 app id
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source appstore --target "<搜索词>" --country us
 *
 *   # Google Play：--target 是包名，--rating 是服务端星级过滤
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source gplay --target com.example.app --rating 1 --pages 2
 *
 *   # Trustpilot / G2 / Capterra：需要 opencli 驱动真实 Chrome（不需要登录）
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source trustpilot --target example.com --stars 1,2
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source g2 --target <product-slug>
 *   node <rankup-skill-dir>/scripts/demand/reviews-mine.mjs --source capterra --target /p/<id>/<Name>/reviews/
 *
 * 标志：
 *   --source <名>       appstore|gplay|trustpilot|g2|capterra（必须）
 *   --target <值>       app id / 包名 / 域名 / 产品 slug / Capterra 路径（必须）
 *   --country <cc>      国家码，默认 us
 *   --lang <l>          语言码，默认 en（gplay 用）
 *   --pages <n>         翻几页，默认 1
 *   --rating <1-5>      服务端星级过滤，仅 gplay 支持
 *   --stars <a,b>       Trustpilot 星级过滤，默认 1,2
 *   --max-rating <n>    客户端过滤：只保留 <= n 星，默认 2（设 5 表示不过滤）
 *   --limit <n>         最多输出多少条，默认 200
 *   --session <名>      opencli 会话名（默认 demand-reviews-<source>）
 *   --keep-session      跑完不关闭 opencli 会话
 *   --json              输出 JSON 数组
 *   --out <file>        落盘（.jsonl 写 JSON Lines，其它写 JSON）
 *   --evidence-dir <d>  失败现场与 manifest 落点，默认 .rankup/evidence/demand/reviews-mine-<ts>/
 *
 * 失败留现场（2026-08-30）：每页采集状态记进 manifest.json，失败页的原始响应
 * 落进证据目录。空结果时逐源报状态——「0 条 + 页失败」不是「没有差评」。
 *
 * 依赖：
 *   - appstore / gplay：无，纯 HTTP，可进 CI
 *   - trustpilot / g2 / capterra：需要本机 opencli + 真实 Chrome（不需要登录任何账号）
 *
 * 统一输出字段：{source, target, rating, title, text, date, country, lang, author, url}
 *   country 与 lang 不是同一件事，2026-09-13 前 appstore 分支把这两个字段混用过：
 *     - country：App Store / Google Play 是分国家店面的（Apple 各国是独立店面，
 *       Google Play 的 gl 决定的也是店面），这里放请求时用的店面/国家码
 *       （--country），appstore/gplay 两个源都会带。
 *     - lang：评论正文实际的语言。App Store RSS 不返回这个信息，appstore 分支
 *       里固定是 null，不要用 country 猜语言；gplay 分支放 --lang（请求参数，
 *       服务端按此渲染但不保证评论本身就是这个语言）。
 *     trustpilot/g2/capterra 三个浏览器源没有 country 概念（不是分国家店面的
 *       产品），只有 lang（页面/评论自带的真实语言），维持原样不变。
 *
 * 已验证日期：2026-08-24
 *
 * 已知坑：
 *   - App Store RSS 每页固定 50 条，最多 10 页（≈500 条），再往后返回空 feed。
 *     RSS 不支持按星级过滤，只能取回来再本地筛，所以 1 星评论少的 app 要多翻几页。
 *   - App Store RSS 第 1 页的第一个 entry 有时是 app 元信息而不是评论，已跳过。
 *   - Google Play 的 batchexecute 是内部 RPC，字段是数字下标，Google 改版会断；
 *     一次最多 ~100 条，靠返回的 token 翻页。包名错会返回空数组而不是报错。
 *   - Trustpilot / G2 / Capterra 纯 curl 一律 403（AWS WAF / Cloudflare），
 *     必须用真实浏览器；G2 首次加载可能要 30-60 秒过挑战。
 *   - Capterra 的 ld+json 里 reviewBody 只有标题那一句，完整 Pros/Cons 在 DOM 里，
 *     脚本两边都取，DOM 优先。
 */
import { execFileSync } from "node:child_process"
import { writeFileSync, realpathSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { requireBrowserBridge, initEvidence, recordSource, writeManifest, saveEvidence, sourceStatusSummary, captureBrowserScene } from "./_lib.mjs"

const SOURCES = ["appstore", "gplay", "trustpilot", "g2", "capterra"]
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

// isMain 守卫（同 footprint-discover.mjs 的模式）：只有被当命令行直接跑时才解析
// argv、发请求；纯 import（供 node --test 拿 mapAppstoreEntry / mapGplayRow 这
// 两个纯函数做离线断言，见 rankup/tests/reviews-mine-locale.test.mjs）不会碰
// 参数解析、不会碰网络、不会 process.exit。本文件不提供那个常见的独立调试开关，
// 离线断言走上面说的 node --test，不是走命令行参数。
let isMain = false
try {
  isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
} catch { /* argv[1] missing/unresolvable → treat as imported */ }

// opt 在 isMain 分支里才会被真正赋值；appstore()/gplay()/browserSource() 等函数
// 只有在 isMain（也就是 run() 被调用）时才会执行，所以它们读到的 opt 一定已初始化。
let opt = null

// ── 参数（只在 isMain 时跑；见上方 isMain 守卫注释） ────────
if (isMain) {
const argv = process.argv.slice(2)
if (argv.includes("-h") || argv.includes("--help") || argv.length === 0) {
  usage()
  process.exit(argv.length === 0 ? 1 : 0)
}
opt = {
  source: null,
  target: null,
  country: "us",
  lang: "en",
  pages: 1,
  rating: null,
  stars: "1,2",
  maxRating: 2,
  limit: 200,
  session: null,
  keepSession: false,
  json: false,
  out: null,
}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--source" && argv[i + 1]) { opt.source = argv[++i]; continue }
  if (a === "--target" && argv[i + 1]) { opt.target = argv[++i]; continue }
  if (a === "--country" && argv[i + 1]) { opt.country = argv[++i].toLowerCase(); continue }
  if (a === "--lang" && argv[i + 1]) { opt.lang = argv[++i]; continue }
  if (a === "--pages" && argv[i + 1]) { opt.pages = Number(argv[++i]); continue }
  if (a === "--rating" && argv[i + 1]) { opt.rating = Number(argv[++i]); continue }
  if (a === "--stars" && argv[i + 1]) { opt.stars = argv[++i]; continue }
  if (a === "--max-rating" && argv[i + 1]) { opt.maxRating = Number(argv[++i]); continue }
  if (a === "--limit" && argv[i + 1]) { opt.limit = Number(argv[++i]); continue }
  if (a === "--session" && argv[i + 1]) { opt.session = argv[++i]; continue }
  if (a === "--keep-session") { opt.keepSession = true; continue }
  if (a === "--json") { opt.json = true; continue }
  if (a === "--out" && argv[i + 1]) { opt.out = argv[++i]; continue }
  if (a === "--evidence-dir" && argv[i + 1]) { opt.evidenceDir = argv[++i]; continue }
  fail(`未知参数：${a}`)
}
if (!opt.source) fail("缺少 --source")
if (!SOURCES.includes(opt.source)) fail(`--source 只能是 ${SOURCES.join("|")}`)
if (!opt.target) fail("缺少 --target")
if (!opt.session) opt.session = `demand-reviews-${opt.source}`
initEvidence("reviews-mine", { dir: opt.evidenceDir || null })

// ── 主流程 ────────────────────────────────────────────────
const rows = await run()
const kept = rows
  .filter((r) => r.rating == null || r.rating <= opt.maxRating)
  .slice(0, opt.limit)

if (opt.out) {
  const body = opt.out.endsWith(".jsonl")
    ? kept.map((r) => JSON.stringify(r)).join("\n") + "\n"
    : JSON.stringify(kept, null, 2)
  writeFileSync(opt.out, body)
  process.stderr.write(`已写入 ${opt.out}（${kept.length} 条）\n`)
}
const manifestPath = writeManifest("completed")
if (opt.json) console.log(JSON.stringify(kept, null, 2))
else printTable(kept)
if (!kept.length) {
  // 「0 条 + 源失败」和「0 条 + 源成功」必须长得不一样：这里逐源报状态。
  const s = sourceStatusSummary()
  if (s?.failed) {
    process.stderr.write(`没有取到条目——但 ${s.failed}/${s.total} 次采集失败，这不是「该产品没有差评」的证据：\n`)
    for (const l of s.lines) process.stderr.write(`${l}\n`)
  } else {
    process.stderr.write("没有取到条目（各页采集本身成功）：确认 --target 是否正确，或放宽 --max-rating / 增加 --pages\n")
  }
}
if (manifestPath) process.stderr.write(`manifest：${manifestPath}\n`)
} // end if (isMain)

async function run() {
  if (opt.source === "appstore") return await appstore()
  if (opt.source === "gplay") return await gplay()
  return browserSource()
}

/**
 * 纯函数，供 node --test 离线断言（不依赖模块级 opt，不发请求）。
 * App Store RSS 的一条 entry → 统一输出行。country 是请求用的店面代码；
 * lang 固定 null——RSS 不返回评论语言，2026-09-13 前这里错把 country 塞进
 * lang，字段名和语义对不上，容易被下游误读成"评论语言"。见文件头注释。
 */
export function mapAppstoreEntry(e, { appId, country }) {
  return {
    source: "appstore",
    target: appId,
    rating: Number(e["im:rating"].label),
    title: e.title?.label ?? null,
    text: e.content?.label ?? null,
    date: e.updated?.label ?? null,
    country,
    lang: null,
    author: e.author?.name?.label ?? null,
    url: e.link?.attributes?.href ?? null,
  }
}

/**
 * 纯函数，供 node --test 离线断言。Google Play batchexecute 的一条评论行
 * （数字下标数组）→ 统一输出行。country 是请求用的店面代码（拼进 gl 参数）；
 * lang 是请求参数 --lang（服务端按此渲染，不保证等于评论真实语言，但这是
 * 本源唯一的语言信号）。与 mapAppstoreEntry 共用同一组字段名/语义。
 */
export function mapGplayRow(r, { target, lang, country }) {
  return {
    source: "gplay",
    target,
    rating: typeof r[2] === "number" ? r[2] : null,
    title: null, // Google Play 评论没有标题
    text: r[4] ?? null,
    date: r[5]?.[0] ? new Date(r[5][0] * 1000).toISOString() : null,
    country,
    lang,
    author: r[1]?.[0] ?? null,
    url: null,
    thumbsUp: typeof r[6] === "number" ? r[6] : null,
  }
}

// ── App Store（公开 RSS） ─────────────────────────────────
async function appstore() {
  let appId = opt.target
  if (!/^\d+$/.test(appId)) {
    const u = `https://itunes.apple.com/search?term=${encodeURIComponent(opt.target)}&country=${opt.country}&entity=software&limit=1`
    const j = await getJSON(u)
    if (!j.results?.length) fail(`iTunes search 找不到「${opt.target}」`)
    appId = String(j.results[0].trackId)
    process.stderr.write(`解析到 app：${j.results[0].trackName} (${appId})\n`)
  }
  const out = []
  for (let p = 1; p <= opt.pages; p++) {
    const u = `https://itunes.apple.com/${opt.country}/rss/customerreviews/page=${p}/id=${appId}/sortby=mostrecent/json`
    let j
    try { j = await getJSON(u) } catch (e) {
      // 以前这里是 catch{break}：429/超时 和「评论翻完了」输出字节级相同。
      // 现在把该页状态记进 manifest 再停，空结果就能被读成「采集失败」而不是「没有差评」。
      const f = saveEvidence(`appstore-page${p}-${e.status ?? "neterr"}.json`, { url: u, status: e.status ?? null, error: String(e.message), body: e.body ?? null })
      recordSource({ source: `appstore:page${p}`, status: e.status ? `http_${e.status}` : "network_error", rawCount: 0, error: `${e.message}（现场已留 ${f}）` })
      process.stderr.write(`[warn] appstore 第 ${p} 页取数失败，停止翻页：${e.message}\n`)
      break
    }
    const entries = j?.feed?.entry
    if (!Array.isArray(entries) || !entries.length) {
      recordSource({ source: `appstore:page${p}`, status: "ok", rawCount: 0, note: "空 feed（RSS 到底或该页无评论）" })
      break
    }
    recordSource({ source: `appstore:page${p}`, status: "ok", rawCount: entries.length })
    for (const e of entries) {
      if (!e["im:rating"]) continue // 第一条有时是 app 元信息
      out.push(mapAppstoreEntry(e, { appId, country: opt.country }))
    }
  }
  return out
}

// ── Google Play（公开 batchexecute RPC） ──────────────────
async function gplay() {
  const out = []
  let token = null
  const per = 100
  for (let p = 0; p < opt.pages; p++) {
    const inner = JSON.stringify([
      null, null,
      [2, null, [per, null, token], null, opt.rating ? [null, opt.rating] : null],
      [opt.target, 7],
    ])
    const body = new URLSearchParams({
      "f.req": JSON.stringify([[["UsvDTd", inner, null, "generic"]]]),
    })
    const url =
      "https://play.google.com/_/PlayStoreUi/data/batchexecute" +
      `?rpcids=UsvDTd&source-path=%2Fstore%2Fapps%2Fdetails&hl=${encodeURIComponent(opt.lang)}&gl=${opt.country.toUpperCase()}`
    let res
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
          "user-agent": UA,
        },
        body,
      })
    } catch (e) {
      // play.google.com 在部分网络/代理环境下会在 TLS 阶段被重置（ECONNRESET），
      // 表现为 fetch 直接抛出而不是返回非 2xx。这里必须显式接住：本文件其余的
      // 网络路径都会给出可诊断的信息，只有这一条以前是裸抛 Node 堆栈。
      // 判据：报错要说清「打不通这个主机」而不是「这个 app 没有评论」——
      // 后者会被误读成一个有意义的否定答案。
      recordSource({ source: `gplay:page${p}`, status: "network_error", rawCount: 0, error: String(e?.cause?.code || e?.code || e?.message || "unknown") })
      fail(
        `连不上 play.google.com（${e?.cause?.code || e?.code || e?.message || "未知网络错误"}）。\n` +
        `  这是主机不可达，不是「该 app 没有评论」。\n` +
        `  代理/沙箱环境常见；换网络重试，或改用 --source appstore。`,
      )
    }
    const txt = (await res.text()).replace(/^\)\]\}'\s*/, "")
    let payload
    try {
      const row = JSON.parse(txt).find((r) => r[0] === "wrb.fr" && r[2])
      payload = JSON.parse(row[2])
    } catch (e) {
      // 以前是 catch{break}：Google 改版/非 200 响应 和「包名没有评论」同形。
      const f = saveEvidence(`gplay-page${p}-${res.status}.txt`, txt)
      recordSource({ source: `gplay:page${p}`, status: res.ok ? "parse_error" : `http_${res.status}`, rawCount: 0, error: `batchexecute 响应解析失败（HTTP ${res.status}，原始响应已留 ${f}）` })
      process.stderr.write(`[warn] gplay 第 ${p + 1} 页响应解析失败（HTTP ${res.status}），停止翻页；原始响应已留 ${f}\n`)
      break
    }
    const list = payload?.[0]
    if (!Array.isArray(list) || !list.length) {
      recordSource({ source: `gplay:page${p}`, status: "ok", rawCount: 0, note: "返回空列表（包名错也会走这里而不报错）" })
      break
    }
    recordSource({ source: `gplay:page${p}`, status: "ok", rawCount: list.length })
    for (const r of list) {
      out.push(mapGplayRow(r, { target: opt.target, lang: opt.lang, country: opt.country }))
    }
    token = payload?.[1]?.[1] ?? null
    if (!token) break
  }
  return out
}

// ── 需要真实浏览器的三个源 ────────────────────────────────
function browserSource() {
  // trustpilot / g2 / capterra 都走这里（appstore / gplay 不经过这个函数）。
  // 桥没连上时原来会在下面的 ocli() 上无声挂到 execFileSync 的 timeout（180s）
  // 才报错，还很容易被误读成「这个源没有评论数据」而不是「取数根本没发生」。
  requireBrowserBridge()
  const s = opt.session
  const urls = pageUrls()
  const out = []
  try {
    for (const u of urls) {
      // G2 / Capterra 首次要过 Cloudflare 挑战，open 可能超时断连但页面其实在加载，
      // 所以这里吞掉 open 的错误，交给下面的 eval 重试去判定。
      try { ocli(["browser", s, "--window", "background", "open", u]) }
      catch (e) { process.stderr.write(`[warn] open 未确认完成，继续轮询：${u}\n`) }
      if (opt.source === "capterra") {
        // Capterra 的星级过滤没有 URL 参数，只能点左侧 filter-overallRating-N 按钮
        const star = Math.min(...opt.stars.split(",").map((x) => Number(x.trim())).filter(Boolean))
        if (Number.isFinite(star)) {
          try {
            ocli(["browser", s, "eval",
              `(()=>{const b=document.querySelector('[data-testid=filter-overallRating-${star}]');
                if(!b) return "no-filter-button"; b.click(); return "clicked";})()`])
            sleepSync(8000)
          } catch {}
        }
      }
      const raw = ocliEval(s, extractor(), 6)
      if (!raw || raw.error) {
        const f = saveEvidence(`${opt.source}-${encodeURIComponent(u).slice(0, 80)}.json`, { url: u, error: raw?.error ?? "eval 无返回", raw })
        // 双证人：第一波记了状态（DOM 侧），本波补视觉证人——截图+页面全文在关 tab
        // 之前落盘（截图链路已实盘验证）。是 WAF 拦截页还是真没有评论，AI 看图判。
        const scene = captureBrowserScene(s, `${opt.source}-${encodeURIComponent(u).slice(0, 60)}`)
        recordSource({ source: `${opt.source}:${u}`, status: "extract_failed", rawCount: 0, error: `${raw?.error ?? "eval 无返回"}（现场已留 ${f}）`, scene })
        process.stderr.write(`[warn] ${u}: ${raw?.error ?? "eval 无返回"}（截图 ${scene.shot ?? "未取到"}）\n`)
        continue
      }
      recordSource({ source: `${opt.source}:${u}`, status: "ok", rawCount: (raw.items ?? []).length })
      for (const r of raw?.items ?? []) out.push({ source: opt.source, target: opt.target, ...r })
      if (raw?.meta) process.stderr.write(`[meta] ${JSON.stringify(raw.meta)}\n`)
    }
  } finally {
    if (!opt.keepSession) try { ocli(["browser", s, "close"]) } catch {}
  }
  return out
}

function pageUrls() {
  const list = []
  for (let p = 1; p <= opt.pages; p++) {
    if (opt.source === "trustpilot") {
      const stars = opt.stars.split(",").filter(Boolean).map((x) => `stars=${x.trim()}`).join("&")
      list.push(`https://www.trustpilot.com/review/${opt.target}?${stars}&page=${p}`)
    } else if (opt.source === "g2") {
      const f = opt.stars.split(",").filter(Boolean)
        .map((x) => `filters%5Bnps_score%5D%5B%5D=${x.trim()}`).join("&")
      list.push(`https://www.g2.com/products/${opt.target}/reviews?${f}&page=${p}`)
    } else {
      const path = opt.target.startsWith("/") ? opt.target : `/p/${opt.target}/reviews/`
      list.push(`https://www.capterra.com${path}?page=${p}&sort=LOWEST_RATED`)
    }
  }
  return list
}

/** 返回一个 IIFE 字符串，在页面里跑，产出 {items:[...], meta:{...}} */
function extractor() {
  if (opt.source === "trustpilot") {
    return `(()=>{const e=document.getElementById("__NEXT_DATA__");
      if(!e) return {error:"没有 __NEXT_DATA__（可能被 WAF 拦了或页面改版）"};
      const p=JSON.parse(e.textContent).props.pageProps;const b=p.businessUnit||{};
      const items=(p.reviews||[]).map(r=>({rating:r.rating,title:r.title||null,
        text:(r.text||"").trim()||null,
        date:(r.dates&&(r.dates.publishedDate||r.dates.experiencedDate))||null,
        lang:r.language||null,author:(r.consumer&&r.consumer.displayName)||null,
        url:r.id?("https://www.trustpilot.com/reviews/"+r.id):null}));
      return {items,meta:{name:b.displayName,trustScore:b.trustScore,stars:b.stars,
        totalReviews:b.numberOfReviews,
        pagination:p.filters&&p.filters.pagination}};})()`
  }
  if (opt.source === "g2") {
    return `(()=>{const lds=[...document.querySelectorAll('script[type="application/ld+json"]')]
        .map(x=>{try{return JSON.parse(x.textContent)}catch(e){return null}}).filter(Boolean);
      const app=lds.find(x=>x["@type"]==="SoftwareApplication");
      if(!app) return {error:"没有 SoftwareApplication ld+json（多半没过 Cloudflare 挑战）"};
      const best=(app.aggregateRating&&app.aggregateRating.bestRating)||10;
      const items=(app.review||[]).map(r=>{
        const rv=r.reviewRating&&r.reviewRating.ratingValue;
        return {rating:rv==null?null:Math.round(rv/((r.reviewRating&&r.reviewRating.bestRating)||best)*5*10)/10,
          title:r.name||null,text:(r.reviewBody||"").trim()||null,
          date:r.datePublished||null,lang:document.documentElement.lang||null,
          author:(r.author&&r.author.name)||null,url:location.href};});
      return {items,meta:{name:app.name,aggregate:app.aggregateRating}};})()`
  }
  return `(()=>{const lds=[...document.querySelectorAll('script[type="application/ld+json"]')]
      .map(x=>{try{return JSON.parse(x.textContent)}catch(e){return null}}).filter(Boolean);
    const app=lds.find(x=>x["@type"]==="SoftwareApplication");
    const cards=[...document.querySelectorAll('[data-testid=reviewer-profile-pic]')].map(e=>{
      let p=e;for(let i=0;i<8&&p;i++){p=p.parentElement;
        if(p&&p.innerText&&p.innerText.length>300)return p.innerText.replace(/\\s+/g," ").trim();}
      return null;}).filter(Boolean);
    const dom=cards.map(t=>{const m=t.match(/"([^"]{4,200})"\\s+([A-Z][a-z]+ \\d{1,2}, \\d{4})\\s+([0-9.]+)/);
      return {rating:m?Number(m[3]):null,title:m?m[1]:null,text:t,
        date:m?m[2]:null,lang:document.documentElement.lang||null,author:t.split(" ")[0]||null,
        url:location.href};});
    const ld=(app&&app.review||[]).map(r=>({rating:(r.reviewRating&&r.reviewRating.ratingValue)??null,
      title:null,text:(r.reviewBody||"").trim()||null,date:r.datePublished||null,
      lang:document.documentElement.lang||null,author:(r.author&&r.author.name)||null,url:location.href}));
    const items=dom.length?dom:ld;
    if(!items.length) return {error:"页面上没找到评论卡片（多半没过 Cloudflare 挑战）"};
    return {items,meta:{name:app&&app.name,aggregate:app&&app.aggregateRating,
      ldReviews:ld.length,domReviews:dom.length}};})()`
}

// ── 工具 ──────────────────────────────────────────────────
async function getJSON(url) {
  const res = await fetch(url, { headers: { "user-agent": UA } })
  const text = await res.text()
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${url}`)
    err.status = res.status
    err.body = text
    throw err
  }
  try { return JSON.parse(text) } catch {
    const err = new Error(`响应不是 JSON：${url}`)
    err.status = res.status
    err.body = text
    throw err
  }
}

function ocli(args) {
  return execFileSync("opencli", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 180000 })
}

/** opencli eval 有时首次返回时页面还没渲染完，重试几次 */
function ocliEval(session, js, tries) {
  let last = null
  for (let i = 0; i < tries; i++) {
    try {
      const raw = ocli(["browser", session, "eval", js])
      const start = raw.indexOf("{")
      if (start >= 0) {
        const parsed = JSON.parse(raw.slice(start))
        if (!parsed.error) return parsed
        last = parsed
      }
    } catch (e) { last = { error: String(e.message || e).slice(0, 200) } }
    sleepSync(6000)
  }
  return last
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function printTable(rows) {
  if (!rows.length) return
  const w = (s, n) => String(s ?? "").replace(/\s+/g, " ").slice(0, n).padEnd(n)
  console.log(`${w("★", 3)}${w("日期", 12)}${w("标题", 40)}正文`)
  console.log("-".repeat(110))
  for (const r of rows) {
    console.log(`${w(r.rating, 3)}${w((r.date || "").slice(0, 10), 12)}${w(r.title, 40)}${w(r.text, 55)}`)
  }
  console.log(`\n共 ${rows.length} 条 · source=${rows[0].source} target=${rows[0].target}`)
}

function fail(msg) {
  // 采集已经开始过的失败要先落 manifest（initEvidence 之前的参数错误不会建目录）。
  try {
    const f = writeManifest(`died: ${String(msg).replace(/\s+/g, " ").slice(0, 300)}`)
    if (f) process.stderr.write(`现场已留：${f}\n`)
  } catch {}
  process.stderr.write(`错误：${msg}\n\n`); usage(); process.exit(1)
}

function usage() {
  process.stdout.write(`reviews-mine.mjs —— 从差评里挖需求

  --source appstore|gplay|trustpilot|g2|capterra   （必须）
  --target <app id | 包名 | 域名 | 产品 slug | Capterra 路径>  （必须）
  --country <cc>     默认 us
  --lang <l>         默认 en
  --pages <n>        默认 1
  --rating <1-5>     服务端星级过滤（仅 gplay）
  --stars <a,b>      星级过滤，默认 1,2（trustpilot / g2）
  --max-rating <n>   本地过滤，只留 <= n 星，默认 2
  --limit <n>        默认 200
  --session <名>     opencli 会话名
  --keep-session     跑完不关会话
  --json             输出 JSON
  --out <file>       落盘（.jsonl 为 JSON Lines）
  --evidence-dir <d> 失败现场与 manifest 落点

示例：
  reviews-mine.mjs --source appstore --target "<搜索词或 app id>" --pages 3
  reviews-mine.mjs --source gplay --target <包名> --rating 1
  reviews-mine.mjs --source trustpilot --target <域名> --stars 1,2 --json
`)
}
