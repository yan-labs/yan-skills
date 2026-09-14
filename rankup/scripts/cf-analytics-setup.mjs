#!/usr/bin/env node
/**
 * Cloudflare Web Analytics（RUM）接入。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/cf-analytics-setup.mjs status <domain>
 *   node <rankup-skill-dir>/scripts/cf-analytics-setup.mjs enable <domain>
 *   node <rankup-skill-dir>/scripts/cf-analytics-setup.mjs verify <domain>
 *
 * 站点由 Cloudflare 代理时可以用 auto_install：beacon 由边缘在 HTML 响应经过时注入，
 * 不需要改代码、不需要发版。Workers custom domain 本身就是代理态，满足条件。
 *
 * 【实测，多站复现，2026-09-12】auto_install 默认必须关闭：边缘在每次响应上注入 beacon
 * 会绕过代码里的任何延迟加载逻辑，beacon 请求（/cdn-cgi/rum）因此成为最长关键请求链之一，
 * 与「第三方分析脚本一律延迟到首次交互或 6s 兜底再加载」的硬规则冲突。本脚本 enable 默认
 * 以 auto_install: false 创建站点记录，改由代码延迟注入 beacon；status 对已存在且
 * auto_install 为 true 的站点会打印告警。
 *
 * verify 只读：用 Accept: text/html 请求首页，分别检查 API 配置与响应中的
 * 静态自动 beacon、静态手动 beacon、动态初始化。auto_install=false 不证明
 * 边缘没有注入。token 仅在内存比较，输出只含脱敏状态和数量。
 * HTML 检查不执行初始化器；真实加载、SPA 去重与成功发送另用浏览器核验。
 * RUM 404 必须查实际注入路径、失败请求和浏览器环境，不推测为反刷而豁免。
 *
 * 【留给未来：给已存在的 site_info 记录改 auto_install】本脚本目前只有创建
 * （`enable`，新建时就是 `auto_install:false`），没有针对已存在记录去改
 * `auto_install` 的写路径；真要加，PUT 到 `/rum/site_info/<site_tag>`，
 * **body 只需要 `{"auto_install": false}`**——site_tag 已经在 URL 路径里了，
 * 模仿 `enable` 那个 POST 端点的 body 形态多带一个 `zone_tag` 会被 CF 拒绝，
 * 报 `HTTP 400: 10004 web_analytics.configuration.api.malformedParams`
 * （2026-09-13 真实项目踩过一次）。
 *
 * 凭据解析统一走 ./lib-cf-auth.mjs 的 resolveCfAuth（2026-09-13 收敛，历史原因见
 * 该文件头注释）：API Token 认 CLOUDFLARE_API_TOKEN 或 CF_API_TOKEN，都没有则
 * 退到 Global API Key（CF_EMAIL/CLOUDFLARE_EMAIL 配 CF_GLOBAL_KEY/CLOUDFLARE_API_KEY，
 * 必须成对）。这些都没配时还会退到 <repo>/.cf-token（该文件已被 .gitignore 排除，
 * 只当 API Token 用，不支持在这里塞 Global Key）。真实值不打印、不落盘、不进日志。
 *
 * 需要的权限：Account > Account Analytics > Edit（RUM）+ Zone > Zone > Read。
 * 不要用 Global API Key：它不能限定 scope，泄露即等于整个账号。
 *
 * 已验证：2026-08-21；auto_install 默认关闭复验：2026-09-12；
 * verify 三件套（token 比对 / 重复注入判定 / GraphQL count）：2026-09-13
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { realpath } from "node:fs/promises"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { cfAuthHeaders, resolveCfAccountId } from "./lib-cf-auth.mjs"

const API = "https://api.cloudflare.com/client/v4"

/** 项目根目录下的 .cf-token（已 gitignore）：环境变量都没设置时的最后兜底，
 * 只当 API Token 用——想用 Global Key 请直接设 CF_EMAIL/CF_GLOBAL_KEY 这对环境变量。 */
function fileToken() {
  const f = join(process.cwd(), ".cf-token")
  return existsSync(f) ? readFileSync(f, "utf8").trim() : undefined
}

/**
 * 两种凭据的 header 完全不同，认错会得到一个极具误导性的
 * `6003 Invalid request headers`（看着像请求写错了，其实是凭据类型不匹配）。
 * 具体的环境变量名、优先级与两种 header 的拼法见 ./lib-cf-auth.mjs。
 */
function authHeaders() {
  try {
    return cfAuthHeaders({ token: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || fileToken() })
  } catch (e) {
    console.error(
      `${e.message}\n\n` +
        `也可以把 API Token 写进 <repo>/.cf-token（已 gitignore），环境变量都没设置时会读它。\n\n` +
        `token 在 dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom：\n` +
        `  权限  Zone > Zone > Edit\n` +
        `  范围  Zone Resources = All zones      ← 必须 All zones，不能选具体某个 zone`,
    )
    process.exit(2)
  }
}

async function cf(path_, init = {}) {
  const r = await fetch(`${API}${path_}`, {
    ...init,
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const j = await r.json().catch(() => ({}))
  if (!j.success) {
    const msg = (j.errors || []).map((e) => e.code).join("; ")
    throw new Error(`${init.method || "GET"} ${path_} → HTTP ${r.status}: ${msg || "未知错误"}`)
  }
  return j.result
}

/**
 * GraphQL 走同一个 API host 的 /graphql 端点，鉴权与 REST 端点一致。
 * `errors` 数组存在时 GraphQL 惯例是仍然 200，所以不能只看 HTTP 状态。
 */
async function cfGraphQL(query, variables) {
  const r = await fetch(`${API}/graphql`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  })
  const j = await r.json().catch(() => ({}))
  if (j.errors?.length) {
    throw new Error("GraphQL 返回错误（响应内容不输出）")
  }
  return j.data
}

async function rumPageloadCount(accountId, siteTag, sinceIso) {
  const data = await cfGraphQL(
    `query ($accountTag: string!, $siteTag: string!, $since: string!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          rumPageloadEventsAdaptiveGroups(filter: { siteTag: $siteTag, date_geq: $since }, limit: 1) {
            count
          }
        }
      }
    }`,
    { accountTag: accountId, siteTag, since: sinceIso },
  )
  const count = data?.viewer?.accounts?.[0]?.rumPageloadEventsAdaptiveGroups?.[0]?.count
  return typeof count === "number" ? count : null
}

function reportZone(z) {
  console.log(`zone       ${z.name}`)
  console.log(`状态       ${z.status}`)
  console.log(`zone id    ${z.id}`)
  if (z.original_name_servers?.length) console.log(`原 NS      ${z.original_name_servers.join(", ")}`)
  console.log(`\n把注册商的 NS 整体替换成这两个（是替换，不是追加）：`)
  for (const ns of z.name_servers || []) console.log(`  ${ns}`)
  if (z.status !== "active") {
    console.log(`\n⚠️ 状态还不是 active。换 NS 之前先在注册商关掉 DNSSEC——`)
    console.log(`   带着旧 DS 记录换 NS 会 SERVFAIL，症状伪装成「NS 还没生效」。`)
    console.log(`   核验：whois -h whois.registry.co ${z.name} | grep -i dnssec   → 要看到 unsigned`)
  }
}


export function formatSiteStatus(s) {
  return [
    `site tag     ${s.site_tag || "(未返回)"} （查询 ID）`,
    `site token   ${s.site_token ? "[REDACTED]" : "(API 未返回)"}`,
    `snippet      ${s.snippet ? "[REDACTED]" : "(API 未返回)"}`,
    `auto_install ${s.auto_install} （API 配置，不代表实际 HTML 注入情况）`,
    `规则启用     ${s.ruleset?.enabled}`,
    s.auto_install === false
      ? "API 已关闭自动安装；仍需 verify 核对浏览器型 HTML 响应。"
      : "需核对自动安装配置；手动延迟加载不得与边缘注入并存。",
    "token 经受控 API 通道用于代码配置，不从终端输出、聊天或其他项目复制。",
    "运行 cf-analytics-setup.mjs verify <domain> 核对配置与 HTML；另用浏览器验证实际发送及 SPA 去重。",
  ].join("\n")
}

function reportSite(s) { console.log(formatSiteStatus(s)) }

/* ── 纯函数：token 抠取与三件套判定（可脱离网络单测） ──────────── */

/**
 * 从线上 HTML 里抠出所有 `data-cf-beacon` 出现处附带的 token。
 *
 * 【实测，2026-09-13，真实项目复盘】早期版本只认标准 CF 静态 snippet 形态
 * `data-cf-beacon="..."`（HTML 属性赋值），认不出「统一延迟加载器里用 JS
 * `setAttribute('data-cf-beacon', '{"token":...}')` 动态注入」这种同样常见的写法——
 * 两者字符串里都有 `data-cf-beacon`，但一个后面跟 `=`，一个后面跟函数调用的逗号，
 * 正则字面量匹配不上。对这类项目跑旧版会得到假阴性「线上找不到任何手嵌 beacon」，
 * 即使 beacon 其实工作正常（`/cdn-cgi/rum` 也真的发出去了）。
 *
 * 现在的判据不再纠结「这段代码长什么语法形状」，只认**事实**：不管是静态属性、
 * `setAttribute()` 调用参数、还是字符串拼接拼出来的 JSON，CF 的 token 本身
 * 固定是 32 位十六进制——`data-cf-beacon` 出现之后，到下一个语法收尾符号
 * （`>` 收静态属性、`)` 收函数调用，取先出现的那个）之间的窗口里找这个形状，
 * 三种写法通吃。解析不出十六进制 token 的片段不丢弃——记一条 `UNPARSED:`
 * 前缀的脱敏标记，让「抓到了但读不出 token」和「压根没有这个属性」在返回值里
 * 可分辨，不静默合并成同一个「没有」。
 */
export function extractCfBeaconTokens(html) {
  const text = String(html || "")
  const tokens = []
  const anchorRe = /data-cf-beacon/gi
  let m
  while ((m = anchorRe.exec(text))) {
    const rest = text.slice(m.index, m.index + 500)
    const gt = rest.indexOf(">")
    const paren = rest.indexOf(")")
    const closers = [gt, paren].filter((i) => i >= 0)
    const closeIdx = closers.length ? Math.min(...closers) : rest.length - 1
    const windowText = rest.slice(0, closeIdx + 1)
    const hex = windowText.match(/\b[a-f0-9]{32}\b/i)
    if (hex) tokens.push(hex[0].toLowerCase())
    else tokens.push("UNPARSED:[REDACTED]")
  }
  return tokens
}

// Keep offsets so only executable call sites are inspected, not quoted hydration data.
function maskJsLiteralsAndComments(source) {
  return source.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\n\r]*/g,
    part => part.replace(/[^\n\r]/g, " "))
}

function scriptAttributes(source) {
  const attributes = new Map()
  for (const match of source.matchAll(/([^\s=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s]+))?/g)) {
    const value = match[2] || ""
    attributes.set(match[1].toLowerCase(), /^["']/.test(value) ? value.slice(1, -1) : value)
  }
  return attributes
}

// ponytail: Keep this a narrow source reader; do not execute JavaScript or build a browser here.
// Declarations and automatic-injection markers need DOM/network evidence to establish execution/source.
export function extractCfBeaconEvidence(html) {
  const text = String(html || "").replace(/<!--[\s\S]*?-->/g, "")
  let staticAuto = 0, staticManual = 0, dynamicInitializers = 0, unclassified = 0
  const tokens = []
  const scripts = /<script\b((?:[^>"']|"[^"]*"|'[^']*')*)>([\s\S]*?)<\/script\s*>/gi
  for (const match of text.matchAll(scripts)) {
    const attrs = scriptAttributes(match[1])
    const body = match[2]
    // A JSON data block cannot execute a beacon, even if its tag carries beacon attributes.
    if (attrs.get("type") && !/^(?:module|(?:text|application)\/javascript)$/i.test(attrs.get("type"))) continue
    if (attrs.has("data-cf-beacon")) {
      const decoded = attrs.get("data-cf-beacon").replace(/&quot;|&#34;|&#x22;/gi, '"').replace(/&#39;|&#x27;|&apos;/gi, "'")
      if (/["']version["']\s*:/.test(decoded)) staticAuto++
      else staticManual++
      tokens.push(...extractCfBeaconTokens(`data-cf-beacon=${attrs.get("data-cf-beacon")}`))
    } else if (/cloudflareinsights\.com\/beacon(?:\.min)?\.js/i.test(attrs.get("src") || "")) {
      unclassified++ // e.g. tag-manager query-token form: present, but not parsed here
    }
    const code = maskJsLiteralsAndComments(body)
    for (const call of code.matchAll(/\bsetAttribute\s*\(/g)) {
      const rest = body.slice(call.index)
      if (!/^setAttribute\s*\(\s*["']data-cf-beacon["']\s*,/.test(rest)) continue
      dynamicInitializers++
      tokens.push(...extractCfBeaconTokens(rest.slice(0, rest.indexOf(")") + 1)))
    }
    // Other executable injection shapes cannot be safely counted by this narrow reader.
    if (/\b(?:innerHTML|outerHTML|insertAdjacentHTML|cfBeacon)\b/.test(code) && /data-cf-beacon|cloudflareinsights/.test(body)) unclassified++
  }
  return { staticAuto, staticManual, dynamicInitializers, unclassified, tokens }
}

export function diagnoseCfWebAnalytics({ siteToken, autoInstall, tokensInHtml = [], evidence }) {
  const validTokens = tokensInHtml.filter((t) => !t.startsWith("UNPARSED:"))
  const tokenKnown = Boolean(siteToken)
  const normalized = (s) => String(s || "").toLowerCase()
  const tokenMismatch = tokenKnown && validTokens.some(t => normalized(t) !== normalized(siteToken))
  const declarationCount = evidence
    ? evidence.staticAuto + evidence.staticManual + evidence.dynamicInitializers
    : null
  const duplicateInjection = declarationCount === null ? null : declarationCount > 1 ? true : evidence.unclassified ? null : false
  const noBeaconFound = declarationCount === null || evidence.unclassified ? null : declarationCount === 0
  // Compatibility field: means a version marker was observed, not proven edge provenance.
  const automaticBeaconObserved = evidence ? evidence.staticAuto > 0 : null
  const configurationConflict = autoInstall === true
  const incomplete = automaticBeaconObserved === true || !evidence || typeof autoInstall !== "boolean" || Boolean(evidence.unclassified) || !tokenKnown || validTokens.length !== tokensInHtml.length || validTokens.length === 0
  const failed = tokenMismatch || duplicateInjection === true || noBeaconFound === true || configurationConflict
  const status = failed ? "fail" : incomplete ? "needs-verification" : "pass"
  const ok = status === "pass"
  return { status, ok, tokenKnown, tokenMismatch, duplicateInjection, noBeaconFound, validTokens,
    configurationConflict, automaticBeaconObserved, incomplete }
}

export async function fetchHtmlEvidence(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { redirect: "follow", headers: { Accept: "text/html" } })
  const contentType = response.headers.get("content-type") || ""
  if (!response.ok || !/^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(contentType)) {
    await response.body?.cancel()
    throw new Error(`首页没有返回成功 HTML（HTTP ${response.status}）`)
  }
  return { html: await response.text(), status: response.status, contentType }
}

export function formatVerification({ autoInstall, evidence, diag, status, contentType, count }) {
  return [
    `API auto_install：${autoInstall}（配置与响应独立判断）`,
    `首页响应：HTTP ${status} / ${contentType} / Accept: text/html`,
    `HTML 声明：带自动注入特征的静态声明 ${evidence.staticAuto}（来源待核）；其他静态声明 ${evidence.staticManual}；动态初始化 ${evidence.dynamicInitializers}；待浏览器核实 ${evidence.unclassified || 0}`,
    `token(API)：${diag.tokenKnown ? "[REDACTED]" : "未返回"}；HTML 有效 token 数：${diag.validTokens.length}（值均脱敏）`,
    `token 比对：${!diag.tokenKnown || !diag.validTokens.length ? "未完成" : diag.tokenMismatch ? "不一致" : "一致"}`,
    `重复声明路径：${diag.duplicateInjection === null ? "未知" : diag.duplicateInjection ? "失败（实际 HTML 中多条声明路径；执行份数待 DOM 核实）" : "未发现"}`,
    `自动注入策略：${diag.configurationConflict ? "需处理（API 自动安装开启）" : diag.automaticBeaconObserved ? "静态声明带自动注入特征，来源待核" : "未发现冲突"}`,
    `beacon 声明：${diag.noBeaconFound === null ? "未知" : diag.noBeaconFound ? "缺失" : "存在"}；完整性：${diag.incomplete ? "未完成" : "已解析"}`,
    `GraphQL 近 7 天 pageload：${count === null ? "不可用" : count}（历史参考，不证明本次发送）`,
    diag.ok ? "HTML 与配置核验通过；尚未验证初始化器执行、SPA 去重和实际发送。" : "HTML/配置核验未通过，或证据不完整。",
    "后续运行 analytics-beacon-check.mjs 验证浏览器加载、导航及真实请求；不以 HTML 声明代替运行结果。",
  ].join("\n")
}

/* ── 命令 ─────────────────────────────────────────────────── */

async function findSite(domain) {
  const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`)
  if (!zones.length) throw new Error(`${domain} 不在这个账号里，先跑 cf-zone-setup.mjs create`)
  const zone = zones[0]

  const accountId = await resolveCfAccountId({ headers: authHeaders() })

  // 必须分页：默认每页 10 条，账号站点一多就会把已存在的条目判成「不存在」而重复创建。
  const existing = await cf(`/accounts/${accountId}/rum/site_info/list?per_page=100`)
  const hit = (existing || []).find((s) => s.ruleset?.zone_tag === zone.id)
  return { zone, accountId, site: hit }
}

async function doStatusOrEnable(cmd, domain) {
  const { zone, accountId, site: hit } = await findSite(domain)
  if (hit) {
    console.log(`Web Analytics 已启用：\n`)
    reportSite(hit)
    return
  }
  if (cmd === "status") {
    console.log(`${domain} 尚未启用 Web Analytics。跑 enable 开启。`)
    return
  }

  // auto_install 默认 false：【实测，多站复现】边缘自动注入的 beacon 会绕过代码里的延迟
  // 加载逻辑，成为最长关键请求链之一。需要手动把 snippet 写进页面，延迟到首次交互或 6s
  // 兜底后注入，见 references/analytics-platforms.md「CF WA」节。
  const site = await cf(`/accounts/${accountId}/rum/site_info`, {
    method: "POST",
    body: JSON.stringify({ zone_tag: zone.id, auto_install: false }),
  })
  console.log(`✅ 已启用 Web Analytics（auto_install: false，需手动嵌延迟加载的 snippet）\n`)
  reportSite(site)
}

/** verify：只读三件套核验，不改任何 CF 配置。 */
async function doVerify(domain) {
  const { accountId, site: hit } = await findSite(domain)
  if (!hit) {
    console.log(`${domain} 尚未启用 Web Analytics，无法 verify。先跑 enable。`)
    process.exitCode = 1
    return
  }

  const url = `https://${domain}`
  let response
  try {
    response = await fetchHtmlEvidence(url)
  } catch {
    console.error("抓取首页失败或不是成功 HTML；未进行配置通过判定。")
    process.exitCode = 1
    return
  }
  const evidence = extractCfBeaconEvidence(response.html)
  const diag = diagnoseCfWebAnalytics({
    siteToken: hit.site_token, autoInstall: hit.auto_install,
    tokensInHtml: evidence.tokens, evidence,
  })
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  let count = null
  try { count = await rumPageloadCount(accountId, hit.site_tag, since) } catch { /* unavailable, not zero */ }
  console.log(formatVerification({ autoInstall: hit.auto_install, evidence, diag,
    status: response.status, contentType: response.contentType, count }))
  if (!diag.ok) process.exitCode = diag.status === "fail" ? 1 : 2
}

function usage() {
  console.log(`用法: cf-analytics-setup.mjs <status|enable|verify> <domain>

  status <domain>   查询是否已启用，打印配置状态（token/snippet 脱敏）
  enable <domain>   启用（auto_install 默认 false，需手动嵌延迟加载的 snippet）
  verify <domain>   只读核验：抓线上 HTML 比对 data-cf-beacon token、判断是否与
                    实际 beacon 路径重复、查 GraphQL 近 7 天 pageload 数`)
}

async function main() {
  const [cmd, domain] = process.argv.slice(2)
  const askedForHelp = process.argv.slice(2).some((a) => a === "-h" || a === "--help")
  if (askedForHelp || !cmd || !domain) {
    // 显式 `--help` 是成功，退出码 0；什么都不给才是用法错误。
    if (askedForHelp) {
      usage()
      process.exit(0)
    }
    usage()
    process.exit(2)
  }
  if (!["status", "enable", "verify"].includes(cmd)) {
    usage()
    process.exit(2)
  }

  if (cmd === "verify") await doVerify(domain)
  else await doStatusOrEnable(cmd, domain)
}

// argv[1] 保留调用时写的路径，import.meta.url 已经过符号链接解析——两边取真实路径
// 再比较，同 check-version.mjs 的 invokedAsScript()，让测试可以只 import 纯函数
// （extractCfBeaconTokens / diagnoseCfWebAnalytics）而不触发真的网络请求。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false
  try {
    const resolved = await realpath(path.resolve(process.argv[1]))
    return pathToFileURL(resolved).href === import.meta.url
  } catch {
    return false
  }
}

if (await invokedAsScript()) {
  await main()
}
