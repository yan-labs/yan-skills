#!/usr/bin/env node
/**
 * gsc-domain-verify.mjs —— 添加 GSC 网域资源；自动验证失败时从 DOM 读取 DNS TXT，
 * 仅在 Cloudflare 新增验证用 TXT，再在 GSC 点击验证（绝不授权 Google 访问 DNS 账号）。
 * 用法：node gsc-domain-verify.mjs status|add-site --domain example.com [--session sp-gpt]
 * 登录态：用户浏览器须已登录 Search Console；DNS API 凭据通过 lib-cf-auth.mjs 解析。
 * 已知坑：GSC SPA 保留隐藏的旧面板，input[aria-label="example.com"] 常有两份；
 * OpenCLI 1.12.1 不接受单参数 type，须指定目标并使用 fill；Google 有时检测到
 * 已有 DNS 验证记录直接显示「已自动完成所有权验证」，这种情况不再新增 TXT。
 * 遇到授权 DNS 服务商、登录或验证码立即停止；TXT 传播未就绪最多每 60 秒
 * 检查一次、单站最多 20 分钟。2026-09-28：一站实测自动验证，
 * 另一站实测已存在；2026-09-28 两站 status 再次实测可进入 sitemap 页面。
 * 2026-10-02：轮询资源弹窗与验证结果；DNS 提供商从 listbox 选择。
 * TXT 传播查询公共 DNS，避免本机负缓存阻塞；2026-10-02 实测 TXT 新增后 GSC 自动验证成功。
 * 2026-10-27：实测新版欢迎页与已有未验证资源入口；遮挡窗口用截图推进绘制，手动 TXT 验证后可进入站点地图页。
 * 本机若设 HTTPS_PROXY，须将 api.cloudflare.com 加入 NO_PROXY（走代理会丢 TLS 握手）；例：NODE_USE_ENV_PROXY=1 NO_PROXY=api.cloudflare.com node scripts/gsc-domain-verify.mjs add-site --domain <域名>
 */
import { execFileSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { cfAuthHeaders } from "./lib-cf-auth.mjs"

const [action, ...rest] = process.argv.slice(2)
const args = Object.fromEntries(rest.flatMap((part, i) => part.startsWith("--") ? [[part, rest[i + 1]]] : []))
if (action === "--help" || action === "-h") {
  console.log("用法: node gsc-domain-verify.mjs status|add-site --domain example.com [--session sp-gpt]")
  process.exit(0)
}
const domain = args["--domain"]
const session = args["--session"] || `gsc-domain-verify-${randomUUID().slice(0,8)}`
if (!["status", "add-site"].includes(action) || !domain || !/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(domain)) {
  throw new Error("需要 status|add-site --domain <合法域名>")
}
const property = `sc-domain:${domain}`
const propertyUrl = `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(property)}`
let opened = false
let sitemapListed = false
function browser(...parts) {
  return execFileSync("opencli", ["browser", session, "--window", "dedicated", ...parts],
    { encoding: "utf8", timeout: 90000, stdio: ["ignore", "pipe", "pipe"] }).trim()
}
function render() {
  // 被遮挡的专用窗口会暂停 GSC 的绘制；截图只推进合成帧，丢弃图像，不落盘或输出。
  execFileSync("opencli", ["browser", session, "--window", "dedicated", "screenshot"],
    { stdio: ["ignore", "ignore", "pipe"], timeout: 90000 })
}
function evalJs(source) { return browser("eval", `(()=>{${source}})()`) }
function open(url) { opened = true; browser("open", url) }
function text() {
  // 2026-10-02：页面跳转瞬间 document.body 为 null，原写法会抛 TypeError；最多等 10 秒重取。
  for (let i = 0; i < 10; i++) {
    const t = evalJs("return document.body ? document.body.innerText.slice(0,10000) : '__NO_BODY__'")
    if (t !== "__NO_BODY__") return t
    browser("wait", "time", "1")
  }
  return ""
}
function guard() {
  const body = text()
  if (/请登录|登录以继续|sign in to continue|验证码|captcha|recaptcha/i.test(body)) {
    throw new Error("遇到登录或验证码，停止自动操作")
  }
  return body
}
function stamp(js, label) {
  const code = `document.querySelectorAll('[data-gsc-target]').forEach(e=>e.removeAttribute('data-gsc-target'));` +
    `const el=${js};if(!el)throw new Error(${JSON.stringify(`找不到${label}`)});` +
    `el.setAttribute('data-gsc-target','1');return el.innerText||el.value||el.getAttribute('aria-label')||'OK'`
  evalJs(code)
  guard()
  browser("click", "[data-gsc-target=\"1\"]")
  render()
}
function dialogText() {
  render()
  guard()
  return evalJs("return [...document.querySelectorAll('[role=dialog]')].filter(e=>e.offsetParent!==null).map(e=>e.innerText).join('\\n').slice(0,8000)")
}
function accessible() {
  try { open(propertyUrl) } catch (error) {
    if (!evalJs("return location.pathname").includes("/search-console/not-verified")) throw error
    return false
  }
  render()
  const body = guard()
  sitemapListed = body.includes("sitemap.xml")
  return /站点地图|Sitemaps/.test(body) && evalJs(`return new URL(location.href).searchParams.get("resource_id")===${JSON.stringify(property)} && !![...document.querySelectorAll('input')].find(e=>e.offsetParent!==null&&/输入站点地图网址|Enter sitemap URL/i.test(e.getAttribute("aria-label")||""))`).includes("true")
}
function visibleDomainInput() {
  return "[...document.querySelectorAll('input[aria-label=\"example.com\"]')].find(e=>e.offsetParent!==null)"
}
function verificationTxt(value) {
  return String(value).match(/google-site-verification=[A-Za-z0-9_-]+/)?.[0] || null
}
async function cf(path, options = {}) {
  const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...options, headers: { ...cfAuthHeaders(), "Content-Type": "application/json" },
  })
  const json = await res.json()
  if (!json.success) throw new Error(`Cloudflare HTTP ${res.status}: ${(json.errors || []).map(e => e.message).join('; ')}`)
  return json.result
}
async function ensureTxt(content) {
  const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`)
  const zone = zones.find(z => z.name === domain)
  if (!zone) throw new Error(`Cloudflare 找不到 ${domain} zone`)
  const records = await cf(`/zones/${zone.id}/dns_records?type=TXT&name=${encodeURIComponent(domain)}`)
  if (records.some(r => r.content.replace(/^"|"$/g, "") === content)) return false
  await cf(`/zones/${zone.id}/dns_records`, {
    method: "POST", body: JSON.stringify({ type: "TXT", name: domain, content, ttl: 1 }),
  })
  return true
}
async function queryTxt(deadline) {
  for (const endpoint of ["https://cloudflare-dns.com/dns-query", "https://dns.google/resolve"]) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    try {
      const res = await fetch(`${endpoint}?name=${encodeURIComponent(domain)}&type=TXT`, {
        headers: { accept: "application/dns-json" },
        signal: AbortSignal.timeout(Math.min(10000, remaining)),
      })
      if (!res.ok) continue
      return await res.json()
    } catch { /* 首选失败后尝试下一通道；瞬时 DNS 失败不终止轮询。 */ }
  }
  console.warn("警告：TXT 公共 DNS 查询失败，本次未见记录，继续轮询。")
  return {}
}
try {
  if (accessible()) {
    console.log(`${property} 已验证；${sitemapListed ? "页面显示 sitemap.xml。" : "站点地图尚无 sitemap.xml。"}`)
  } else if (action === "status") {
    console.log(`${property} 未在当前账号的站点地图页面显示；请用 add-site。`)
    process.exitCode = 1
  } else {
    const ownership = "[...document.querySelectorAll('button,[role=button]')].find(e=>e.offsetParent!==null&&/^(验证您的所有权|验证所有权|Verify (your )?ownership)$/i.test(e.innerText.trim()))"
    if (evalJs(`return !!(${ownership})`).includes("true")) {
      stamp(ownership, "验证所有权")
    } else {
      open("https://search.google.com/search-console/welcome")
      render()
      guard()
      stamp("[...document.querySelectorAll('button')].find(e=>e.offsetParent!==null&&/添加网站|Add (a )?(site|property)/i.test(e.innerText))", "添加网站")
      const inputDeadline = Date.now() + 15000
      while (!evalJs(`return !!(${visibleDomainInput()})`).includes("true") && Date.now() < inputDeadline) {
        browser("wait", "time", "1")
        render()
        guard()
      }
      if (!evalJs(`return !!(${visibleDomainInput()})`).includes("true")) {
        throw new Error("资源类型弹窗未打开，不能输入域名")
      }
      evalJs(`const el=${visibleDomainInput()};el.setAttribute('data-gsc-input','1');return true`)
      const filled = JSON.parse(browser("fill", "[data-gsc-input=\"1\"]", domain))
      if (!filled.verified || filled.actual !== domain) throw new Error("网域输入未被 GSC 接受")
      stamp("[...document.querySelectorAll('[role=dialog] [role=button]')].find(e=>e.offsetParent!==null&&e.getAttribute('aria-disabled')!=='true'&&/^(继续|Continue)$/i.test(e.innerText.trim()))", "网域继续")
    }
    let result = dialogText()
    const verificationDeadline = Date.now() + 30000
    while (!/通过 DNS|DNS record|所有权验证|Ownership.*verified/i.test(result) && Date.now() < verificationDeadline) {
      browser("wait", "time", "1")
      result = dialogText()
    }
    if (/已自动完成所有权验证|Ownership auto verified|Ownership verified/i.test(result)) {
      console.log(`${property} 已自动完成所有权验证（既有验证记录，不新增 TXT）。`)
    } else {
      if (/授权访问|授权.*DNS|Authorize.*DNS|Connect.*provider/i.test(result)) {
        stamp("[...document.querySelectorAll('[role=dialog] [role=listbox]')].find(e=>e.offsetParent!==null&&/任何 DNS 提供商|Any DNS provider/i.test(e.innerText))", "DNS 提供商下拉")
        stamp("[...document.querySelectorAll('[role=option]')].find(e=>e.offsetParent!==null&&/任何 DNS 提供商|Any DNS provider/i.test(e.innerText))", "任何 DNS 提供商")
        result = dialogText()
      }
      if (/授权访问|授权.*DNS|Authorize.*DNS|Connect.*provider/i.test(result)) throw new Error("页面仍在 DNS 授权路径，停止")
      const txt = verificationTxt(result) || verificationTxt(evalJs("return [...document.querySelectorAll('[role=dialog] input, [role=dialog] textarea')].filter(e=>e.offsetParent!==null).map(e=>e.value).join('\\n')"))
      if (!txt) throw new Error("未从验证弹窗读到 TXT，停止；不输出可能包含凭据的弹窗内容")
      console.log(`Cloudflare 验证 TXT ${await ensureTxt(txt) ? "已新增" : "已存在"}。`)
      const deadline = Date.now() + 20 * 60 * 1000
      while (true) {
        if (Date.now() >= deadline) throw new Error("等待 TXT 传播超过 20 分钟")
        const dns = await queryTxt(deadline)
        if ((dns.Answer || []).some(record => record.data.replace(/"/g, "") === txt)) break
        if (Date.now() + 60000 >= deadline) throw new Error("等待 TXT 传播超过 20 分钟")
        await new Promise(resolve => setTimeout(resolve, 60000))
      }
      stamp("[...document.querySelectorAll('[role=dialog] [role=button], [role=dialog] button')].find(e=>e.offsetParent!==null&&/^(验证|Verify)$/.test(e.innerText.trim()))", "验证")
      let final = dialogText()
      const finalDeadline = Date.now() + 30000
      while (!/已完成所有权验证|Ownership verified|验证成功|验证失败|Verification failed/i.test(final) && Date.now() < finalDeadline) {
        browser("wait", "time", "1")
        final = dialogText()
      }
      if (!/已完成所有权验证|Ownership verified|验证成功/i.test(final) && !accessible()) {
        throw new Error("验证点击后没有成功判据；请检查 GSC 所有权状态")
      }
      console.log(`${property} GSC 验证成功。`)
    }
    if (!accessible()) throw new Error("验证后站点地图页面不可访问")
    console.log(`验证后的 ${property} 可进入站点地图页面；使用 webmaster-sitemap.mjs gsc submit/status 提交并检查。`)
  }
} finally {
  if (opened) { try { browser("close") } catch { /* avoid masking original failure */ } }
}
