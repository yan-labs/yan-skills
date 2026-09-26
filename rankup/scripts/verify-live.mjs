#!/usr/bin/env node
/**
 * verify-live.mjs —— 一条命令核验一个或多个上线 URL 是否健康。
 *
 * 对每个 URL 检查：HTTP 最终状态、title、H1 数量、canonical、robots meta、
 * JSON-LD、sitemap 收录、og:image，以及可选的 --contains / --not-contains。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/verify-live.mjs <url1> [url2 ...] \
 *     [--contains "字符串"] [--not-contains "字符串"] \
 *     [--canonical-self] [--json]
 *
 * 标志：
 *   --contains <str>      可多次。页面 HTML 或纯文本必须包含该原样子串
 *   --not-contains <str>  可多次。页面 HTML 或纯文本不得包含该原样子串
 *   --canonical-self      额外断言 canonical href 规范化后等于请求 URL
 *   --json                只向 stdout 打印结构化 JSON（无其它行）
 *   -h, --help            打印本说明
 *
 * 依赖：无。Node 18+ 内置 fetch。可无人值守，可进 CI。
 *
 * 退出码：任意检查 FAIL → 1；全部 PASS → 0。
 */

const TIMEOUT_MS = 15_000
const MAX_REDIRECTS = 10
const MAX_SITEMAP_CHILDREN = 50
const MAX_SITEMAP_DEPTH = 4
const UA = "rankup-verify-live/1.0 (+https://github.com/kcsx)"

function usage(stream = console.error) {
  stream(`用法: node scripts/verify-live.mjs <url1> [url2 ...] [选项]

选项:
  --contains <字符串>       可多次。HTML 或渲染文本必须包含该原样子串
  --not-contains <字符串>   可多次。HTML 或渲染文本不得包含该原样子串
  --canonical-self          canonical href 规范化后须等于请求 URL
  --json                    stdout 只输出 JSON
  -h, --help                显示帮助

检查项（每个 URL）: http / title / h1 / canonical / robots / json-ld / sitemap / og:image
退出码: 有 FAIL 为 1，全 PASS 为 0。`)
}

function parseArgs(argv) {
  const urls = []
  const contains = []
  const notContains = []
  let canonicalSelf = false
  let jsonOut = false

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "-h" || a === "--help") return { help: true }
    if (a === "--json") { jsonOut = true; continue }
    if (a === "--canonical-self") { canonicalSelf = true; continue }
    if (a === "--contains" && argv[i + 1] != null) { contains.push(argv[++i]); continue }
    if (a.startsWith("--contains=") && a.length > 11) { contains.push(a.slice(11)); continue }
    if (a === "--not-contains" && argv[i + 1] != null) { notContains.push(argv[++i]); continue }
    if (a.startsWith("--not-contains=") && a.length > 15) { notContains.push(a.slice(15)); continue }
    if (a.startsWith("-")) {
      return { error: `未知参数: ${a}` }
    }
    urls.push(a)
  }

  return { urls, contains, notContains, canonicalSelf, jsonOut }
}

function isHttpUrl(s) {
  try {
    const u = new URL(s)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

function normalizeUrl(input, { keepQuery = true } = {}) {
  const u = new URL(input)
  let path = u.pathname || "/"
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  const query = keepQuery ? u.search : ""
  return `${u.protocol}//${u.host.toLowerCase()}${path}${query}`
}

function urlsMatch(a, b) {
  try {
    return normalizeUrl(a) === normalizeUrl(b)
  } catch {
    return false
  }
}

function decodeEntities(s) {
  return String(s)
    .replace(/&/gi, "&")
    .replace(/</gi, "<")
    .replace(/>/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => {
      const code = parseInt(h, 16)
      return Number.isFinite(code) ? String.fromCodePoint(code) : _
    })
}

function stripTags(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function attr(tag, name) {
  const re = new RegExp(
    `(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i",
  )
  const m = tag.match(re)
  if (!m) return null
  return decodeEntities((m[1] ?? m[2] ?? m[3] ?? "").trim())
}

function findTags(html, tagName) {
  const re = new RegExp(`<${tagName}\\b[^>]*>`, "gi")
  return html.match(re) || []
}

function extractTitle(html) {
  const m = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
  if (!m) return null
  return decodeEntities(m[1].replace(/\s+/g, " ").trim())
}

function countH1(html) {
  return findTags(html, "h1").length
}

function extractCanonical(html) {
  for (const tag of findTags(html, "link")) {
    const rel = (attr(tag, "rel") || "").toLowerCase().split(/\s+/)
    if (rel.includes("canonical")) {
      const href = attr(tag, "href")
      if (href) return href
    }
  }
  return null
}

function extractRobotsMetas(html) {
  const out = []
  for (const tag of findTags(html, "meta")) {
    const name = (attr(tag, "name") || "").toLowerCase()
    if (name === "robots" || name === "googlebot") {
      out.push({ name, content: attr(tag, "content") || "" })
    }
  }
  return out
}

function extractOgImage(html) {
  for (const tag of findTags(html, "meta")) {
    const prop = (attr(tag, "property") || attr(tag, "name") || "").toLowerCase()
    if (prop === "og:image") {
      const content = attr(tag, "content")
      if (content) return content
    }
  }
  return null
}

function extractJsonLdBlocks(html) {
  const blocks = []
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    const attrs = m[1] || ""
    const type = attr(`<script${attrs}>`, "type") || ""
    if (type.toLowerCase() === "application/ld+json") {
      const raw = m[2]
        .replace(/^\s*<!--/, "")
        .replace(/-->\s*$/, "")
        .replace(/^\s*<!\[CDATA\[/, "")
        .replace(/\]\]>\s*$/, "")
        .trim()
      blocks.push(raw)
    }
  }
  return blocks
}

function collectTypes(node, acc) {
  if (node == null) return
  if (Array.isArray(node)) {
    for (const item of node) collectTypes(item, acc)
    return
  }
  if (typeof node !== "object") return
  if (node["@type"] != null) {
    const t = node["@type"]
    if (Array.isArray(t)) acc.push(...t.map(String))
    else acc.push(String(t))
  }
  if (node["@graph"] != null) collectTypes(node["@graph"], acc)
}

async function fetchFollow(url, { method = "GET", timeoutMs = TIMEOUT_MS, maxRedirects = MAX_REDIRECTS } = {}) {
  let current = url
  const chain = []
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const ac = new AbortController()
    const timer = setTimeout(() => ac.abort(), timeoutMs)
    let res
    try {
      res = await fetch(current, {
        method,
        redirect: "manual",
        signal: ac.signal,
        headers: { "user-agent": UA, accept: "*/*" },
      })
    } catch (err) {
      clearTimeout(timer)
      if (err?.name === "AbortError") {
        throw new Error(`超时 ${timeoutMs}ms: ${current}`)
      }
      throw new Error(`网络错误: ${err?.message || err}`)
    } finally {
      clearTimeout(timer)
    }

    chain.push({ url: current, status: res.status })

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location")
      try { await res.arrayBuffer() } catch { /* ignore */ }
      if (!loc) {
        return { ok: res.ok, status: res.status, url: current, body: "", chain, error: "重定向缺少 Location" }
      }
      if (hop === maxRedirects) {
        throw new Error(`重定向超过 ${maxRedirects} 次`)
      }
      current = new URL(loc, current).href
      continue
    }

    let body = ""
    if (method !== "HEAD") {
      try { body = await res.text() } catch (err) {
        throw new Error(`读取响应体失败: ${err?.message || err}`)
      }
    } else {
      try { await res.arrayBuffer() } catch { /* ignore */ }
    }
    return { ok: res.status >= 200 && res.status < 300, status: res.status, url: current, body, chain }
  }
  throw new Error(`重定向超过 ${maxRedirects} 次`)
}

function parseSitemapKind(xml) {
  if (/<sitemapindex\b/i.test(xml)) return "index"
  if (/<urlset\b/i.test(xml)) return "urlset"
  return "unknown"
}

function extractLocs(xml) {
  const locs = []
  const re = /<loc\b[^>]*>([\s\S]*?)<\/loc>/gi
  let m
  while ((m = re.exec(xml))) {
    const loc = decodeEntities(m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim())
    if (loc) locs.push(loc)
  }
  return locs
}

async function sitemapContains(pageUrl) {
  let origin
  try {
    const u = new URL(pageUrl)
    origin = `${u.protocol}//${u.host}`
  } catch {
    return { found: false, reason: "无法从 URL 推导站点根" }
  }

  const rootSitemap = `${origin}/sitemap.xml`
  const queue = [{ url: rootSitemap, depth: 0 }]
  const seen = new Set()
  let childCount = 0
  let fetchedAny = false

  while (queue.length) {
    const { url, depth } = queue.shift()
    const key = normalizeUrl(url, { keepQuery: true })
    if (seen.has(key)) continue
    seen.add(key)

    let res
    try {
      res = await fetchFollow(url)
    } catch (err) {
      if (!fetchedAny && url === rootSitemap) {
        return { found: false, reason: `sitemap.xml 请求失败（网络错误: ${err.message}）` }
      }
      continue
    }
    fetchedAny = true

    if (!res.ok) {
      if (url === rootSitemap) {
        return { found: false, reason: `sitemap.xml 请求失败（${res.status}）` }
      }
      continue
    }

    const xml = res.body || ""
    if (!xml.trim()) {
      if (url === rootSitemap) {
        return { found: false, reason: "sitemap.xml 解析失败（空文档）" }
      }
      continue
    }

    const kind = parseSitemapKind(xml)
    if (kind === "unknown") {
      if (url === rootSitemap) {
        return { found: false, reason: "sitemap.xml 解析失败（非 sitemapindex/urlset）" }
      }
      continue
    }

    const locs = extractLocs(xml)
    if (kind === "urlset") {
      for (const loc of locs) {
        let abs
        try { abs = new URL(loc, res.url).href } catch { continue }
        if (urlsMatch(abs, pageUrl)) {
          return { found: true, where: res.url }
        }
      }
    } else if (kind === "index") {
      for (const loc of locs) {
        if (childCount >= MAX_SITEMAP_CHILDREN) break
        if (depth + 1 > MAX_SITEMAP_DEPTH) continue
        let abs
        try { abs = new URL(loc, res.url).href } catch { continue }
        childCount++
        queue.push({ url: abs, depth: depth + 1 })
      }
    }
  }

  return { found: false, reason: "未在 sitemap 中找到该 URL" }
}

function pass(check, detail) {
  return { check, status: "pass", detail }
}
function fail(check, detail) {
  return { check, status: "fail", detail }
}

async function checkUrl(pageUrl, opts) {
  const checks = []
  let html = ""
  let finalUrl = pageUrl
  let pageOk = false

  try {
    const res = await fetchFollow(pageUrl)
    finalUrl = res.url
    html = res.body || ""
    pageOk = true
    const redirected = res.chain.length > 1
    const detail = redirected
      ? `${res.status} → ${finalUrl}`
      : String(res.status)
    checks.push(res.ok ? pass("http", detail) : fail("http", `最终状态码 ${res.status}${redirected ? ` @ ${finalUrl}` : ""}`))
  } catch (err) {
    checks.push(fail("http", err.message || String(err)))
  }

  if (!pageOk) {
    const why = "页面请求失败，跳过解析"
    checks.push(fail("title", why))
    checks.push(fail("h1", why))
    checks.push(fail("canonical", why))
    checks.push(fail("robots", why))
    checks.push(fail("json-ld", why))
    checks.push(fail("og:image", why))
    for (const s of opts.contains) checks.push(fail("contains", `页面请求失败，无法检查: ${s}`))
    for (const s of opts.notContains) checks.push(fail("not-contains", `页面请求失败，无法检查: ${s}`))
  } else {
    const title = extractTitle(html)
    if (title) checks.push(pass("title", title.length > 80 ? `${title.slice(0, 77)}...` : title))
    else checks.push(fail("title", html.match(/<title\b/i) ? "title 为空" : "未找到 <title>"))

    const h1n = countH1(html)
    if (h1n === 1) checks.push(pass("h1", "1"))
    else checks.push(fail("h1", `实际 ${h1n} 个`))

    const canonical = extractCanonical(html)
    if (!canonical) {
      checks.push(fail("canonical", "未找到 rel=canonical"))
    } else {
      let abs
      try { abs = new URL(canonical, finalUrl).href } catch { abs = canonical }
      if (opts.canonicalSelf) {
        const match = urlsMatch(abs, pageUrl)
        checks.push(match
          ? pass("canonical", abs)
          : fail("canonical", `与请求 URL 不一致: ${abs}`))
      } else {
        checks.push(pass("canonical", abs))
      }
    }

    const robots = extractRobotsMetas(html)
    const blocked = robots.find(r => /\bnoindex\b/i.test(r.content))
    if (blocked) {
      checks.push(fail("robots", `${blocked.name} 含 noindex (${blocked.content})`))
    } else if (robots.length === 0) {
      checks.push(pass("robots", "无 robots/googlebot meta（默认可索引）"))
    } else {
      checks.push(pass("robots", robots.map(r => `${r.name}=${r.content || "(空)"}`).join("; ")))
    }

    const ldBlocks = extractJsonLdBlocks(html)
    if (ldBlocks.length === 0) {
      checks.push(fail("json-ld", "未找到 JSON-LD"))
    } else {
      const types = []
      let parseFail = null
      for (let i = 0; i < ldBlocks.length; i++) {
        try {
          const parsed = JSON.parse(ldBlocks[i])
          collectTypes(parsed, types)
        } catch (err) {
          parseFail = `#${i + 1}: ${err.message || err}`
          break
        }
      }
      if (parseFail) {
        checks.push(fail("json-ld", `解析失败 ${parseFail}`))
      } else {
        const uniq = [...new Set(types)]
        checks.push(pass("json-ld", uniq.length ? uniq.join(", ") : `${ldBlocks.length} 块（无 @type）`))
      }
    }

    const og = extractOgImage(html)
    if (!og) {
      checks.push(fail("og:image", "未找到 og:image"))
    } else {
      let abs
      try { abs = new URL(og, finalUrl).href } catch { abs = null }
      if (!abs || !isHttpUrl(abs)) {
        checks.push(fail("og:image", `无法解析为绝对 URL: ${og}`))
      } else {
        try {
          const img = await fetchFollow(abs)
          checks.push(img.ok
            ? pass("og:image", `${img.status} ${abs}`)
            : fail("og:image", `最终状态码 ${img.status} ${abs}`))
        } catch (err) {
          checks.push(fail("og:image", `${err.message || err} (${abs})`))
        }
      }
    }

    const haystackHtml = html
    const haystackText = stripTags(html)
    for (const s of opts.contains) {
      if (haystackHtml.includes(s) || haystackText.includes(s)) {
        checks.push(pass("contains", s))
      } else {
        checks.push(fail("contains", `缺失: ${s}`))
      }
    }
    for (const s of opts.notContains) {
      if (haystackHtml.includes(s) || haystackText.includes(s)) {
        checks.push(fail("not-contains", `命中: ${s}`))
      } else {
        checks.push(pass("not-contains", s))
      }
    }
  }

  try {
    const sm = await sitemapContains(pageUrl)
    checks.push(sm.found
      ? pass("sitemap", sm.where ? `收录于 ${sm.where}` : "已收录")
      : fail("sitemap", sm.reason || "未收录"))
  } catch (err) {
    checks.push(fail("sitemap", `sitemap.xml 请求失败（网络错误: ${err.message || err}）`))
  }

  return { url: pageUrl, finalUrl, checks }
}

function shortUrl(u) {
  try {
    const x = new URL(u)
    const path = x.pathname === "/" ? "/" : x.pathname.replace(/\/$/, "")
    return x.host + path
  } catch {
    return u
  }
}

function printText(results) {
  let passed = 0
  let failed = 0
  for (const r of results) {
    console.log(`# ${r.url}`)
    for (const c of r.checks) {
      if (c.status === "pass") passed++
      else failed++
      const tag = c.status === "pass" ? "PASS" : "FAIL"
      console.log(`${tag} ${shortUrl(r.url)} ${c.check} ${c.detail}`)
    }
  }
  console.log(`SUMMARY: ${passed} passed, ${failed} failed (${results.length} URL${results.length === 1 ? "" : "s"} checked)`)
}

function printJson(results) {
  let passed = 0
  let failed = 0
  for (const r of results) {
    for (const c of r.checks) {
      if (c.status === "pass") passed++
      else failed++
    }
  }
  const payload = {
    urls: results.map(r => ({
      url: r.url,
      finalUrl: r.finalUrl,
      checks: r.checks,
    })),
    summary: {
      total: passed + failed,
      passed,
      failed,
      urls: results.length,
    },
  }
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2))
  if (parsed.help) {
    usage(console.log)
    process.exit(0)
  }
  if (parsed.error) {
    console.error(parsed.error)
    usage()
    process.exit(1)
  }
  if (!parsed.urls.length) {
    console.error("请至少提供一个 URL")
    usage()
    process.exit(1)
  }
  for (const u of parsed.urls) {
    if (!isHttpUrl(u)) {
      console.error(`非法 URL: ${u}`)
      process.exit(1)
    }
  }

  const results = []
  for (const u of parsed.urls) {
    try {
      results.push(await checkUrl(u, parsed))
    } catch (err) {
      results.push({
        url: u,
        finalUrl: u,
        checks: [fail("http", `未捕获异常: ${err?.message || err}`)],
      })
    }
  }

  if (parsed.jsonOut) printJson(results)
  else printText(results)

  const anyFail = results.some(r => r.checks.some(c => c.status === "fail"))
  process.exit(anyFail ? 1 : 0)
}

main().catch((err) => {
  console.error(`verify-live 崩溃: ${err?.message || err}`)
  process.exit(1)
})
