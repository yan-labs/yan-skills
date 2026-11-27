#!/usr/bin/env node
/**
 * yandex-setup.mjs —— 在 Yandex Webmaster 里添加站点、拿 DNS TXT 验证值、
 * 自动把 TXT 记录写进 Cloudflare、点 Verify 并以网络请求为判据确认，
 * 驱动用户已登录的浏览器（Yandex 部分）+ Cloudflare API（DNS 部分）。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/yandex-setup.mjs status --site https://example.com
 *   node <rankup-skill-dir>/scripts/yandex-setup.mjs add-site --site https://example.com [--submit-sitemap]
 *   node <rankup-skill-dir>/scripts/yandex-setup.mjs verify --site https://example.com
 *
 * 标志：
 *   --site <url>          完整站点 URL（协议 + 主机，例如 https://example.com）（必须）
 *   --submit-sitemap      add-site 完成后串起 webmaster-sitemap.mjs yandex submit
 *                         （验证 pending 也能提交，见下「边界事实」）
 *   --sitemap <url>       配合 --submit-sitemap，默认 <site>/sitemap.xml
 *   --session <名>        opencli 会话名（默认 yandex-setup-<每对话唯一后缀>，不用 pid）
 *   --keep-session        完成后不关闭会话
 *   --max-retries <n>     Add / Verify 按钮点击重试上限，默认 3（见下「点击竞态」）
 *
 * 依赖：opencli，且用户浏览器已登录 webmaster.yandex.com；
 * Cloudflare 凭据（DNS TXT 那一步）统一走 ./lib-cf-auth.mjs 的 resolveCfAuth
 * （2026-09-13 收敛，历史原因见该文件头注释）：API Token 认 CLOUDFLARE_API_TOKEN
 * 或 CF_API_TOKEN，都没有则退到 Global API Key（CF_EMAIL/CLOUDFLARE_EMAIL 配
 * CF_GLOBAL_KEY/CLOUDFLARE_API_KEY，必须成对）。这些都没配时还会退到
 * <cwd>/.cf-token（已 gitignore，只当 API Token 用）。真实值不打印、不落盘、不进日志。
 *
 * ── 为什么 Yandex 部分是浏览器而不是 API ──────────────────────
 *
 * Yandex Webmaster 没有公开的零配置 API（webmaster-sitemap.mjs 已经记过这一条：
 * 「Yandex Webmaster 没有公开的零配置 API」）。添加站点、选验证方式、点 Verify
 * 只能走控制台 UI。DNS 那一半（写 TXT 记录）确实有 API，直接走 Cloudflare API，
 * 不开浏览器——这条路径本身就是 discipline.md 五推荐的参照。
 *
 * ── 三个已实测的坑（2026-09-13，两个真实站点上复现）──────────
 *
 * 1. **Add 按钮首次点击常常不生效**：`fill` 返回 verified:true（值确实写进了
 *    input），但第一次点 Add 后页面停在原地（URL、文案都不变，输入框有时甚至
 *    被清空）。对同一个元素原样再点一次，两次都立刻跳转到 Verify 页。疑似
 *    Yandex 这个表单的 React 组件「输入完成 → 校验 → 按钮才真正可点」这条链路
 *    与 CDP 合成点击的时间点撞上了竞态窗口，不是 opencli 的 `click` 坏了
 *    （`click_method: cdp` 是真实点击）。**对策：点击后等 2 秒查 URL 有没有
 *    变化，没变就对同一个目标再点一次，上限 `--max-retries`（默认 3）。**
 * 2. **Verify 按钮同理，且更隐蔽**：点击后**页面文案完全不变**（不像 Add 那样
 *    连文案都没变化很好判断——这里是文案本来就要等请求成功才会更新），opencli
 *    的 `click` 本身永远返回成功。**唯一可靠判据是网络请求**：点击生效的那次
 *    会打一个 `POST .../gate/verification/verify/` 并返回 2xx；不生效的那几次
 *    这个请求压根没发出去（不是 4xx/5xx，是没发）。用
 *    `opencli browser <s> network --since Ns` 判定，命中就停，没命中就重试。
 * 3. **两个坑同属一类**：Yandex 这一整块 UI 疑似都有「组件重渲染瞬间事件监听器
 *    脱钩」的通病，不是某一个按钮的个案，写新命令时默认都要按「点击 → 判据 →
 *    没达成就重试」的模式写，不要假设点一次就够。
 * 4. **OpenCLI 1.12.1 的 type 不接受只有文本的写法**（2026-09-28 真实
 *    添加站点复现 usage_error: Missing text）。必须显式给 target 和 text；这里用
 *    唯一的站点 URL 输入框 CSS 定位，再用 fill 的 verified 回执核对。
 * 5. **Verify 后状态可能先于网络判据更新**（2026-09-28 三站复现）：
 *    当页面已经显示验证日期，Verify 按钮会消失；旧循环仍继续点第三次，反而
 *    抛找不到按钮。每次点击后先读状态，verified 即停止；若仍 pending，则
 *    以验证请求 2xx 确认点击生效，不把 pending 误报成已验证。2026-09-28
 *    五站 status 实测均 verified，sitemap 均入列。
 *
 * ── 边界事实：验证 pending 也能提交 sitemap（2026-09-13 实测）───────
 *
 * 两个站点在 DNS 验证仍处于「Check is in progress, it can take up to two days」
 * 的待定状态时，`webmaster-sitemap.mjs yandex status/submit` 依然能正常访问
 * Indexing/Sitemap 页面并成功提交——**站点加入账号（哪怕验证 pending）就已经
 * 解锁这个功能，不需要先等验证通过**。所以 `add-site` 提供 `--submit-sitemap`
 * 直接把这一步串起来，不用等两天。
 *
 * ── 幂等 ─────────────────────────────────────────────────────
 *
 * `add-site`：站点已存在（直接导航到该站的 access 设置页不会被重定向回添加页）
 * 就跳过整套 Add 流程，只补取 TXT 值与 Cloudflare 记录；Cloudflare 那一步查到
 * 同内容的 TXT 记录已存在也跳过创建，不重复加。`status` 全程只读。
 *
 * 已验证：2026-09-13（status 在两个真实已验证站点上跑通；add-site/verify 的
 * 交互序列取自同日真实跑通的手工操作记录，脚本化后未在真实账号里重新执行写
 * 操作——写操作的等价性由上面记录的 DOM 结构与网络判据保证，下次真正用到
 * add-site/verify 时如页面结构有出入，按 discipline/drift-triage.md 分诊后回写这里）。
 */
import { execSync, execFileSync } from "node:child_process"
import { dirname, join, resolve as resolvePath } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { realpath } from "node:fs/promises"
import { readFileSync, existsSync } from "node:fs"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"
import { cfAuthHeaders as sharedCfAuthHeaders } from "./lib-cf-auth.mjs"

const BASE = "https://webmaster.yandex.com"
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))

/* ── 参数（延到 main() 里解析，见文件末尾的 invokedAsScript 守卫：
 * 纯函数导出给测试 import 时不能触发真的参数校验/浏览器调用） ────── */
let action = null
let site = null
let submitSitemap = false
let sitemapUrl = null
let session = `yandex-setup-${sessionSuffix()}`
let keepSession = false
let maxRetries = 3

function parseArgs(argv) {
  if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") { usage(); process.exit(argv.length === 0 ? 1 : 0) }
  action = argv[0]
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--site" && argv[i + 1]) { site = argv[++i].replace(/\/+$/, ""); continue }
    if (a === "--submit-sitemap") { submitSitemap = true; continue }
    if (a === "--sitemap" && argv[i + 1]) { sitemapUrl = argv[++i]; continue }
    if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
    if (a === "--keep-session") { keepSession = true; continue }
    if (a === "--max-retries" && argv[i + 1]) { maxRetries = Number(argv[++i]); continue }
    if (a === "-h" || a === "--help") { usage(); process.exit(0) }
    console.error(`未知参数: ${a}`); usage(); process.exit(1)
  }
  if (!["status", "add-site", "verify"].includes(action)) { usage(); process.exit(1) }
  if (!site) { console.error(`错误：${action} 需要 --site`); process.exit(1) }
}

function usage() {
  console.log(`用法:
  node yandex-setup.mjs status   --site <url>
  node yandex-setup.mjs add-site --site <url> [--submit-sitemap] [--sitemap <url>]
  node yandex-setup.mjs verify   --site <url>`)
}

/* ── 纯函数：站点路径拼接、TXT 值抠取、Verify 网络判据（可脱离浏览器单测） ── */

/** Yandex 把站点嵌在路径里：/site/https:<host>:<port>/…，与 webmaster-sitemap.mjs 同款。 */
export function yandexSitePath(siteUrl) {
  const u = new URL(siteUrl)
  const port = u.port || (u.protocol === "https:" ? "443" : "80")
  return `/site/${u.protocol.replace(":", "")}:${u.hostname}:${port}`
}

/** 从页面文本里抠 DNS TXT 验证值。DOM 正则提取，不是截图/记忆抄录（discipline.md 十八）。 */
export function extractYandexVerificationValue(pageText) {
  const m = String(pageText || "").match(/yandex-verification:\s*(\S+)/)
  return m ? m[1] : null
}

/**
 * Verify 按钮点击是否真的生效的唯一可靠判据：网络请求里有没有一条
 * `POST .../gate/verification/verify/`（或路径含 `verification/verify`）且状态 2xx。
 * 页面文案在请求成功之前和点击前一模一样，不能作为判据。
 */
export function hasVerifyRequestSucceeded(networkResult) {
  const entries = networkResult?.entries || []
  return entries.some((e) => {
    const url = String(e?.url || "")
    const status = Number(e?.status)
    return /verification\/verify\/?/.test(url) && status >= 200 && status < 300
  })
}

/**
 * add-site 的第一次导航是不是落在了目标站点自己的 access 设置页——落在了就是
 * 「已存在」，被重定向去别处（添加页、站点列表、404）就是「不存在」。
 * 只看 pathname 是否仍以 `/site/` 开头且包含目标 host，不认字面量一致
 * （编码、端口显式与否可能有差异）。
 */
export function siteAlreadyRegistered(finalUrl, siteUrl) {
  try {
    const finalPath = new URL(finalUrl).pathname
    const host = new URL(siteUrl).hostname
    return finalPath.startsWith("/site/") && finalPath.toLowerCase().includes(host.toLowerCase())
  } catch {
    return false
  }
}

/** 从页面文本判定验证状态。三态：verified / pending / not-added / unknown。 */
export function parseVerificationStatus(pageText) {
  const t = String(pageText || "")
  if (/verification date|owner|verified/i.test(t) && /\d{2}\/\d{2}\/\d{4}/.test(t)) {
    const date = t.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] ?? null
    return { status: "verified", date }
  }
  if (/check is in progress|verification is being checked|проверка выполняется/i.test(t)) {
    return { status: "pending", date: null }
  }
  return { status: "unknown", date: null }
}

/* ── Cloudflare：凭据解析统一走 ./lib-cf-auth.mjs 的 resolveCfAuth（2026-09-13
 * 收敛，历史原因见该文件头注释——本来 cf-zone-setup.mjs / cf-analytics-setup.mjs /
 * cf-agent-baseline.mjs / cf-builds-connect.mjs / 本文件各自手搓一份，读的
 * 环境变量名不统一，这正是要修的 bug，已经超出 discipline.md 二「两处几十行
 * 的重复优于共享文件」判断的适用范围——那条判断针对的是只服务 1-2 个调用点、
 * 且实现本身没有分歧的情况，不是这次涨到 5 处、分歧本身就是 bug 的情况）。
 * 凭据只从环境变量或 .cf-token 读，真实值不打印、不落盘。 ── */
const CF_API = "https://api.cloudflare.com/client/v4"

/** 项目根目录下的 .cf-token（已 gitignore）：环境变量都没设置时的最后兜底，
 * 只当 API Token 用——想用 Global Key 请直接设 CF_EMAIL/CF_GLOBAL_KEY 这对环境变量。 */
function cfFileToken() {
  const f = join(process.cwd(), ".cf-token")
  return existsSync(f) ? readFileSync(f, "utf8").trim() : undefined
}

function cfAuthHeaders() {
  try {
    return sharedCfAuthHeaders({ token: process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || cfFileToken() })
  } catch (e) {
    throw new Error(`${e.message}\n\n也可以把 API Token 写进 <cwd>/.cf-token（已 gitignore），环境变量都没设置时会读它。`)
  }
}
async function cf(path_, init = {}) {
  const r = await fetch(`${CF_API}${path_}`, {
    ...init,
    headers: { ...cfAuthHeaders(), "Content-Type": "application/json", ...(init.headers || {}) },
  })
  const j = await r.json().catch(() => ({}))
  if (!j.success) {
    const msg = (j.errors || []).map((e) => `${e.code} ${e.message}`).join("; ")
    throw new Error(`${init.method || "GET"} ${path_} → HTTP ${r.status}: ${msg || "未知错误"}`)
  }
  return j.result
}

/** 幂等加 TXT：同内容的记录已存在就跳过，不重复加。 */
async function ensureCloudflareTxt(domain, content) {
  const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`)
  if (!zones.length) throw new Error(`${domain} 不在这个 Cloudflare 账号里，先跑 cf-zone-setup.mjs create`)
  const zoneId = zones[0].id
  const existing = await cf(`/zones/${zoneId}/dns_records?type=TXT&name=${encodeURIComponent(domain)}`)
  const normalize = (s) => String(s || "").replace(/^"|"$/g, "").trim()
  const hit = (existing || []).find((r) => normalize(r.content) === normalize(content))
  if (hit) return { created: false, record: hit }
  const record = await cf(`/zones/${zoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({ type: "TXT", name: domain, content, ttl: 1 }),
  })
  return { created: true, record }
}

/* ── OpenCLI 封装（execSync + eval + stampAndClick，风格同 naver/clarity-setup.mjs） ── */
function cli(action_, { timeout = 30000 } = {}) {
  try {
    return execSync(`opencli browser --session "${session}" --window foreground ${action_}`,
      { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const err = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim()
    throw new Error(`opencli 失败: ${action_}\n  ${err}`)
  }
}
function evalJs(js) { const raw= cli(`eval '${`(()=>{${js}})()`.replace(/'/g, "'\\''")}'`); try { const r=JSON.parse(raw); if(r.ok===true && Object.hasOwn(r,"data")) return typeof r.data==="string"?r.data:JSON.stringify(r.data); } catch {} return raw }
function open(url) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { cli(`open "${url}"`); return } catch (error) {
      if (!/Navigation rejected/.test(error.message)) throw error
      settle(2000)
      if (evalJs("return location.origin+location.pathname") === new URL(url).origin+new URL(url).pathname) return
      if (attempt === 2) throw error
    }
  }
}
function pageText(max = 4000) {
  return evalJs(`return ((document.querySelector('main')||document.body)?.innerText||'').replace(/\\n{2,}/g,'\\n').slice(0,${max})`)
}
function currentUrl() { return evalJs(`return location.href`) }
function settle(ms) {
  cli(`eval '(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()'`, { timeout: ms + 30000 })
}
function waitFor(js, seconds = 15) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try { if (String(evalJs(js)).includes("true")) return true } catch { /* 导航中 */ }
    settle(500)
  }
  return false
}
function waitPageReady(seconds = 20) {
  return waitFor(`return document.readyState==='complete' && ((document.body&&document.body.innerText)||'').length>50`, seconds)
}
/** opencli browser network，JSON 输出。第 6 条坑：判据是网络请求，不是页面文案。 */
function networkSince(seconds) {
  const raw = cli(`network --since ${seconds}s`, { timeout: 15000 })
  try { return JSON.parse(raw) } catch { return { entries: [] } }
}

/* ── 取证 ─────────────────────────────────────────────────── */
let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("yandex-setup")
  return evidence
}
let sceneN = 0
function scene(tag, extra) {
  if (action === "status") return
  sceneN++
  return captureScene({
    dir: evidenceDir(),
    tag: `${String(sceneN).padStart(2, "0")}-${tag}`,
    screenshot: (p) => cli(`screenshot "${p}"`, { timeout: 90000 }),
    pageText: () => { try { return pageText(20000) } catch (e) { return `PAGE_TEXT_FAILED:${e.message}` } },
    extra,
  })
}
function bail(stopReason, msg, extra) {
  if (action !== "status") try {
    scene(`fail-${stopReason}`, extra)
    writeManifest(evidenceDir(), { script: "yandex-setup", action, site, stopReason, finishedAt: new Date().toISOString() })
    console.error(`现场已落盘：${evidenceDir()}`)
  } catch (e) { console.error(`（取证失败：${String(e?.message || e).slice(0, 200)}）`) }
  console.error(msg)
  if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
  process.exit(1)
}

function stampAndClick(js, label) {
  evalJs(`const el=${js};if(!el)throw new Error('找不到: ${label}');el.setAttribute('data-rankup-target','1')`)
  cli('click "[data-rankup-target=\\"1\\"]"')
  evalJs(`document.querySelector('[data-rankup-target]')?.removeAttribute('data-rankup-target')`)
  scene(`clicked-${label.replace(/[^\w一-鿿-]/g, "_")}`)
}

/** 点击 → 判据 → 没达成就重试的通用模式（三个已实测坑的共同对策）。 */
function clickUntil(js, label, judge, { retries = maxRetries, waitMs = 2000 } = {}) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    stampAndClick(js, `${label}-attempt${attempt}`)
    settle(waitMs)
    if (judge()) return attempt
  }
  return 0
}

/* ── 命令 ─────────────────────────────────────────────────── */

function accessUrl() { return `${BASE}${yandexSitePath(site)}/settings/access/` }

async function doStatus() {
  open(accessUrl())
  waitPageReady(20)
  const finalUrl = currentUrl()
  if (!siteAlreadyRegistered(finalUrl, site)) {
    console.log(`── Yandex Webmaster: ${site} ──`)
    console.log(`未注册（导航到该站 access 设置页被重定向到 ${finalUrl}）`)
    console.log(`跑 add-site --site ${site} 添加。`)
    return
  }
  const text = pageText(6000)
  const { status, date } = parseVerificationStatus(text)
  console.log(`── Yandex Webmaster: ${site} ──`)
  console.log(`状态: ${status}${date ? `（验证日期 ${date}）` : ""}`)
  if (status === "unknown") {
    console.log(`未命中已知文案，原文前 500 字：\n${text.slice(0, 500)}`)
  }
}

async function doAddSite() {
  // 幂等：先直接导航到目标 access 设置页，能到达就说明站点已存在。
  open(accessUrl())
  waitPageReady(15)
  if (siteAlreadyRegistered(currentUrl(), site)) {
    console.log(`${site} 已在 Yandex Webmaster 里，跳过 Add 流程，直接取 DNS 验证值。`)
  } else {
    open(`${BASE}/sites/add/`)
    waitPageReady(15)
    const text = pageText(4000)
    if (/log ?in|войти/i.test(text)) {
      bail("login-text-seen", "页面文本命中登录相关字样——多半未登录 Yandex（也可能撞词，看截图）。请先在浏览器中登录 webmaster.yandex.com")
    }

    const inputSelector = 'input[placeholder="Enter the site URL"]'
    const inputJs = `document.querySelector(${JSON.stringify(inputSelector)})`
    const filled = cli(`fill '${inputSelector}' '${site.replace(/'/g, "'\\''")}'`)
    if (!filled.includes('"verified": true')) {
      bail("site-url-fill-unverified", `站点 URL 输入框未确认填入 ${site}：${filled.slice(0, 400)}`)
    }
    settle(500)
    scene("filled-site-url", { site })

    // 坑 1：Add 按钮首次点击常常不生效，判据是 URL 有没有变成 access 设置页。
    const submitJs = `document.querySelector('button[type=submit]')`
    const attempts = clickUntil(submitJs, "add-button", () => siteAlreadyRegistered(currentUrl(), site))
    if (!attempts) {
      bail(
        "add-button-no-effect",
        `点了 ${maxRetries} 次 Add 按钮，URL 始终没变成站点的 access 设置页。` +
          `当前 URL：${currentUrl()}。看截图判断卡在哪一步。`,
      )
    }
    console.log(`Add 按钮第 ${attempts} 次点击生效（URL 已变为站点 access 设置页）。`)
  }

  // 选 DNS record 验证方式（幂等：重复点选同一个选项无副作用）。
  const dnsLabelJs = `[...document.querySelectorAll('label,button,[role=radio],div')].find(el=>/^DNS record$/i.test((el.textContent||'').trim()))`
  const hasDnsOption = evalJs(`return !!(${dnsLabelJs})`)
  if (hasDnsOption.includes("true")) {
    stampAndClick(dnsLabelJs, "dns-record-option")
    settle(1500)
  }

  const text = pageText(6000)
  const value = extractYandexVerificationValue(text)
  if (!value) {
    bail(
      "verification-value-not-found",
      `页面文本里没找到 "yandex-verification: <值>"。当前是不是 DNS record 验证方式，看截图。`,
      { textHead: text.slice(0, 500) },
    )
  }
  const txtValue = `yandex-verification: ${value}`
  console.log("DNS TXT 验证值已从页面 DOM 读取（值不输出）。")
  scene("verification-value-extracted", { value })

  // Cloudflare：幂等加 TXT。
  const domain = new URL(site).hostname
  let cfResult
  try {
    cfResult = await ensureCloudflareTxt(domain, txtValue)
  } catch (e) {
    console.error(`Cloudflare TXT 记录添加失败：${e.message}`)
    console.error(`可以手动在 Cloudflare DNS 里给 ${domain} 加一条 TXT 记录，内容：${txtValue}`)
    process.exitCode = 1
    return
  }
  console.log(
    cfResult.created
      ? `✅ 已在 Cloudflare 给 ${domain} 新增 TXT 记录。`
      : `TXT 记录已存在（内容一致），跳过重复添加。`,
  )
  console.log(`\n下一步：等 DNS 传播到权威 NS 后跑 verify --site ${site}。`)
  console.log(`（不需要等验证通过才能提交 sitemap——见头部注释「边界事实」。）`)

  if (submitSitemap) {
    const sitemap = sitemapUrl || `${site}/sitemap.xml`
    console.log(`\n── 串起 webmaster-sitemap.mjs yandex submit ──`)
    try {
      const out = execFileSync(
        process.execPath,
        [join(SCRIPT_DIR, "webmaster-sitemap.mjs"), "yandex", "submit", "--site", site, "--sitemap", sitemap],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      )
      console.log(out)
    } catch (e) {
      console.error(`webmaster-sitemap.mjs 调用失败：${(e.stdout || "") + (e.stderr || e.message)}`)
    }
  }
}

async function doVerify() {
  open(accessUrl())
  waitPageReady(15)
  if (!siteAlreadyRegistered(currentUrl(), site)) {
    bail("not-added", `${site} 还没加进 Yandex Webmaster（导航到 access 设置页被重定向到 ${currentUrl()}）。先跑 add-site。`)
  }

  const before = pageText(4000)
  const { status } = parseVerificationStatus(before)
  if (status === "verified") {
    console.log(`${site} 已经验证通过，无需再点 Verify。`)
    return
  }

  // 坑 2：Verify 点击是否生效，唯一判据是网络请求，不是页面文案。
  const verifyJs = `[...document.querySelectorAll('button')].find(b=>/^Verify$/i.test((b.textContent||'').trim()))`
  let attempts = 0
  for (let attempt = 1; attempt <= Math.max(maxRetries, 3); attempt++) {
    if (parseVerificationStatus(pageText(4000)).status === "verified") break
    stampAndClick(verifyJs, `verify-button-attempt${attempt}`)
    settle(1500)
    attempts = attempt
    if (parseVerificationStatus(pageText(4000)).status === "verified") break
    if (hasVerifyRequestSucceeded(networkSince(10))) break
  }
  const after = parseVerificationStatus(pageText(4000))
  if (after.status !== "verified" && !hasVerifyRequestSucceeded(networkSince(30))) {
    bail(
      "verify-request-not-seen",
      `点了 ${attempts} 次 Verify，网络请求未出现 gate/verification/verify/ 的 2xx 响应，页面也未显示已验证。`,
      { network: networkSince(30) },
    )
  }
  console.log(`Verify 第 ${attempts} 次点击后，页面状态: ${after.status}${after.date ? `（${after.date}）` : ""}。`)
  if (after.status !== "verified") console.log(`Yandex 原话是「最多两天」完成检查，稍后用 status 复查。`)
  scene("verify-request-confirmed")
}

/* ── 执行 ──────────────────────────────────────────────────── */
async function main() {
  parseArgs(process.argv.slice(2))
  try {
    if (action === "status") await doStatus()
    else if (action === "add-site") await doAddSite()
    else if (action === "verify") await doVerify()
  } finally {
    if (!keepSession) {
      try { cli("close") } catch { /* ignore */ }
    }
  }
}

// argv[1] 保留调用时写的路径，import.meta.url 已经过符号链接解析——两边取真实路径
// 再比较，同 check-version.mjs 的 invokedAsScript()。让测试可以只 import 上面的纯函数
// （yandexSitePath / extractYandexVerificationValue / hasVerifyRequestSucceeded /
// siteAlreadyRegistered / parseVerificationStatus）而不触发参数校验或真的浏览器调用。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false
  try {
    const resolved = await realpath(resolvePath(process.argv[1]))
    return pathToFileURL(resolved).href === import.meta.url
  } catch {
    return false
  }
}

if (await invokedAsScript()) {
  await main()
}
