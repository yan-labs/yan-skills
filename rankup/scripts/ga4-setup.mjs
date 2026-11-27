#!/usr/bin/env node
/**
 * ga4-setup.mjs —— 在 Google Analytics 4 控制台创建媒体资源 + 网站数据流，
 * 拿到 Measurement ID。驱动用户已登录的 Chrome，不需要 API key。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/ga4-setup.mjs status
 *   node <rankup-skill-dir>/scripts/ga4-setup.mjs create --domain example.com --name Example
 *
 * 标志：
 *   --domain <域名>           网站数据流 URL（不带协议）
 *   --name <名称>             媒体资源显示名，默认取 --domain 的二级域名
 *   --country <国>            报告时区所在国家（界面文字）。默认「冰岛」
 *   --timezone <时区>         报告时区（界面文字，如 UTC、GMT+00:00、America/Sao_Paulo）。
 *                             时区列表没有 UTC 时用这个显式选；不传则只按 --country 选
 *   --timezone-country <国>   --country 的别名（兼容旧调用）
 *                             面向巴西的站点传 --country 巴西 [--timezone America/Sao_Paulo]
 *   --currency <币种>         界面文字或代码。默认匹配 /美元|USD/
 *   --industry <行业>         商家详情行业类别。默认「其他业务活动」
 *   --session <名>            opencli 会话名（默认 ga4-setup-<每对话唯一后缀>，不用 pid）
 *   --window-slot <slot>      dedicated 窗口 slot，默认 ga4-setup
 *   --keep-session            完成后不关闭会话
 *
 * 依赖：opencli，且用户浏览器已登录 analytics.google.com。
 *
 * ── 为什么是浏览器而不是 API ────────────────────────────────
 *
 * GA4 Admin API 可以建媒体资源和数据流，但本机没有配 Google Cloud OAuth
 * 客户端；控制台本来就已登录。创建只能走 UI，所以这里用 OpenCLI 自动化。
 *
 * ── 拿到 ID 之后做什么 ────────────────────────────────────
 *
 * 脚本输出 Measurement ID（形如 `G-<Measurement-ID>`）。这是公开值，会出现在
 * 页面 HTML 里，不是秘密。写进站点延迟加载器（首次交互或 6s 兜底）以及
 * Workers Builds 的 GA4_MEASUREMENT_ID 环境变量。
 *
 * 已有同域名媒体资源时直接复用，不重复创建。
 *
 * create 不宣布「✅ 创建成功」——页面出现 Measurement ID 只说明导航到了
 * 数据流详情，成没成以截图为准。
 */
import { execFileSync } from "node:child_process"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") { usage(); process.exit(argv.length === 0 ? 1 : 0) }
const action = argv[0]
let domain = null
let name = null
let timezoneCountry = "冰岛"
let timezone = null
let currency = "USD"
let industry = "其他业务活动"
let session = `ga4-setup-${sessionSuffix()}`
let windowSlot = "ga4-setup"
let keepSession = false
let streamAccount, streamProperty

for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--account") { streamAccount = argv[++i]; continue }
  if (a === "--property") { streamProperty = argv[++i]; continue }
  if (a === "--domain" && argv[i + 1]) { domain = argv[++i]; continue }
  if (a === "--name" && argv[i + 1]) { name = argv[++i]; continue }
  if ((a === "--country" || a === "--timezone-country") && argv[i + 1]) { timezoneCountry = argv[++i]; continue }
  if (a === "--timezone" && argv[i + 1]) { timezone = argv[++i]; continue }
  if (a === "--currency" && argv[i + 1]) { currency = argv[++i]; continue }
  if (a === "--industry" && argv[i + 1]) { industry = argv[++i]; continue }
  if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
  if (a === "--window-slot" && argv[i + 1]) { windowSlot = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "-h" || a === "--help") { usage(); process.exit(0) }
  console.error(`未知参数: ${a}`); usage(); process.exit(1)
}

function usage() {
  console.log(`用法:
  node ga4-setup.mjs create-stream --domain <域名> --account <账号号> --property <既有资源号>
  node ga4-setup.mjs status [--domain <域名>]
  node ga4-setup.mjs create --domain <域名> [--name <媒体资源名>] [--country 冰岛|巴西] [--timezone UTC] [--currency USD]
  --timezone-country 是 --country 的别名。时区列表没有 UTC 时用 --country/--timezone 显式指定。
  已有同域名媒体资源则复用，输出 Measurement ID（形如 G-<Measurement-ID>）。`)
}

if (!["status", "create", "create-stream"].includes(action)) { usage(); process.exit(1) }
if (action === "create" && !domain) { console.error("错误：create 需要 --domain"); process.exit(1) }
if (domain && !name) name = domain.split(".")[0]
domain = domain ? domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "") : domain

function cli(args, { timeout = 30000 } = {}) {
  try {
    const windowArgs = ["--window", "foreground"]
    return execFileSync("opencli", ["browser", "--session", session, ...windowArgs, ...args],
      { encoding: "utf8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const err = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim()
    throw new Error(`opencli 失败: ${args[0]}\n  ${err}`)
  }
}
function evalJs(js) { const raw=cli(["eval", `(()=>{${js}})()`]); try { const r=JSON.parse(raw); if(r.ok===true && Object.hasOwn(r,"data")) return typeof r.data==="string"?r.data:JSON.stringify(r.data); } catch {} return raw }
function open(url) { cli(["open", url], { timeout: 45000 }) }
function pageText(max = 4000) {
  return evalJs(`return (document.body.innerText||"").replace(/\\n{2,}/g,"\\n").slice(0,${max})`)
}
function settle(ms) {
  cli(["eval", `(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()`], { timeout: ms + 30000 })
}
function waitFor(js, seconds = 15) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try { if (String(evalJs(js)).includes("true")) return true } catch { /* 导航中 */ }
    try { settle(500) } catch { /* 导航中 eval 会失败，下一轮再探 */ }
  }
  return false
}
function waitNetworkQuiet(seconds = 20) {
  return waitFor(`
    if (document.readyState !== 'complete') return false;
    const t = performance.getEntriesByType('resource');
    const last = t.length ? Math.max(...t.map(e => e.responseEnd || 0)) : 0;
    return (performance.now() - last) > 800;
  `, seconds)
}
function waitPageReady(seconds = 30) {
  const ready = waitFor(`
    const text = (document.body && document.body.innerText) || '';
    const loading = /正在加载|Loading Google Analytics|正在载入/.test(text) && !/管理|创建媒体资源|媒体资源名称|报告/.test(text);
    return document.readyState==='complete' && !loading && /管理|创建媒体资源|媒体资源名称|报告|账号|媒体资源/.test(text);
  `, seconds)
  if (!ready) return false
  waitNetworkQuiet(Math.min(10, seconds))
  return true
}
function waitForFilterBox(seconds = 15) {
  return waitFor(`return !![...document.querySelectorAll('input')].find(el => el.offsetParent && /过滤|filter|搜索|search/i.test((el.getAttribute('aria-label')||'')+(el.placeholder||'')))`, seconds)
}
function dismissOverlays() {
  try { cli(["keys", "Escape"]) } catch { /* ignore */ }
  settle(300)
  try {
    evalJs(`
      const btn = [...document.querySelectorAll("button")].find(el => /清除过滤器|关闭|Clear filter|Close/.test((el.getAttribute("aria-label")||"")+(el.innerText||"")));
      if (btn) { btn.click(); return "clicked"; }
      return "none";
    `)
  } catch { /* ignore */ }
  settle(300)
}

let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("ga4-setup")
  return evidence
}
let sceneN = 0
function scene(tag, extra) {
  if (action === "status") return
  sceneN++
  return captureScene({
    dir: evidenceDir(),
    tag: `${String(sceneN).padStart(2, "0")}-${tag}`,
    screenshot: (p) => cli(["screenshot", p], { timeout: 90000 }),
    pageText: () => { try { return pageText(20000) } catch (e) { return `PAGE_TEXT_FAILED:${e.message}` } },
    extra,
  })
}
function bail(stopReason, msg, extra) {
  if (action !== "status") try {
    scene(`fail-${stopReason}`, extra)
    writeManifest(evidenceDir(), { script: "ga4-setup", action, domain, name, stopReason, finishedAt: new Date().toISOString() })
    console.error(`现场已落盘：${evidenceDir()}`)
  } catch (e) { console.error(`（取证失败：${String(e?.message || e).slice(0, 200)}）`) }
  console.error(msg)
  if (!keepSession) { try { cli(["close"]) } catch { /* ignore */ } }
  process.exit(1)
}

function stampAndClick(js, label, attr = "data-rankup-target") {
  evalJs(`document.querySelectorAll('[${attr}]').forEach(el=>el.removeAttribute('${attr}')); const el=${js};if(!el)throw new Error('找不到: ${label}');el.setAttribute('${attr}','1')`)
  cli(["click", `[${attr}="1"]`])
  try { evalJs(`document.querySelector('[${attr}]')?.removeAttribute('${attr}')`) } catch { /* ignore */ }
  scene(`clicked-${label.replace(/[^\w一-鿿-]/g, "_")}`)
}

function clickExactButton(text, label = text) {
  const lit = JSON.stringify(text)
  stampAndClick(
    `[...document.querySelectorAll('button,[role="menuitem"],[role="option"]')].find(b=>((b.innerText||'').trim()===${lit}) && b.offsetParent)`,
    label,
  )
}

function fillVisibleFilter(value) {
  if (!waitForFilterBox(15)) {
    waitNetworkQuiet(8)
    if (!waitForFilterBox(10)) throw new Error("找不到过滤框（已等待目标 input 出现并重试）")
  }
  const id = evalJs(`
    const inp = [...document.querySelectorAll('input')].find(el => el.offsetParent && /过滤|filter|搜索|search/i.test((el.getAttribute('aria-label')||'')+(el.placeholder||'')));
    if (!inp) throw new Error('找不到过滤框');
    if (!inp.id) inp.id = 'rankup-filter';
    return inp.id;
  `)
  cli(["fill", `#${id}`, value])
  settle(800)
}

function pickOption(matcher, label) {
  const lit = JSON.stringify(matcher)
  stampAndClick(
    `[...document.querySelectorAll('[role="option"]')].find(el => { const t=(el.innerText||'').trim(); return t===${lit} || t.includes(${lit}); })`,
    label,
    "data-rankup-opt",
  )
}

function extractMeasurementIds() {
  const raw = evalJs(`return JSON.stringify((document.body.innerText||'').match(/G-[A-Z0-9]{6,}/g) || [])`)
  try { return JSON.parse(raw) } catch { return [] }
}

function goAdmin() {
  try {
    open("https://analytics.google.com/analytics/web/")
  } catch (e) {
    if (!/Navigation rejected/i.test(String(e.message || e))) throw e
  }
  if (!waitPageReady(40)) {
    waitNetworkQuiet(10)
    if (!waitPageReady(20)) {
      bail("ga-loading-stuck", "GA 后台加载页超时：目标元素未出现且网络未空闲。请确认已登录 analytics.google.com 后重试。")
    }
  }
  settle(800)
  try {
    stampAndClick(
      `[...document.querySelectorAll('a[role="link"],a')].find(a => (a.innerText||'').trim()==='管理' && a.offsetParent && a.closest('mat-nav-list'))`,
      "管理",
    )
  } catch {
    try { open("https://analytics.google.com/analytics/web/#/admin") } catch { /* hash open often rejected */ }
  }
  waitFor(`return /创建/.test(document.body.innerText||'') && !!document.querySelector('button.create-entity-menu-trigger')`, 25)
  settle(800)
  const text = pageText(2000)
  if (/Sign in|登录 Google|账号登录/.test(text) && !/媒体资源|管理/.test(text)) {
    bail("login-text-seen", "页面文本命中登录墙——请先在浏览器中登录 analytics.google.com")
  }
  scene("admin")
}

function openPicker() {
  stampAndClick(
    `document.querySelector('button[aria-label*="通用选择器"],button.gmp-popup-button')`,
    "账号选择器",
  )
  settle(1000)
}

function pickerText() {
  return evalJs(`
    const root = document.querySelector('[class*="gmp-popup"],[class*="picker"],[role="dialog"]') || document.body;
    return (root.innerText||'').slice(0,8000);
  `)
}

async function doStatus() {
  if (domain) {
    goAdmin()
    openPicker()
    cli(["fill", "xap-open-search input", name.slice(0, 3)])
    waitFor(`return !!document.querySelector('a[href*="/admin"]')`, 10)
    const candidates = JSON.parse(evalJs(`return JSON.stringify([...document.querySelectorAll('a[href*="/admin"]')]
      .filter(a => /a\\d+p\\d+/.test(a.getAttribute('href')||''))
      .map(a => ({ href: a.getAttribute('href'), name: (a.getAttribute('aria-label')||a.innerText||'').trim() })))`))
    for (const candidate of candidates) {
      const ids = candidate.href.match(/a(\d+)p(\d+)/)
      if (!ids) continue
      open(`https://analytics.google.com/analytics/web/#/a${ids[1]}p${ids[2]}/admin/streams/table`)
      waitFor(`return (document.body.innerText||'').includes(${JSON.stringify(domain)})`, 25)
      const rowFound = evalJs(`return !![...document.querySelectorAll('mat-row,[role="row"]')]
        .find(el => (el.innerText||'').includes(${JSON.stringify(domain)}))`)
      if (rowFound !== "true") continue
      stampAndClick(`[...document.querySelectorAll('mat-row,[role="row"]')]
        .find(el => (el.innerText||'').includes(${JSON.stringify(domain)}))`, "网站数据流", "data-rankup-row")
      waitFor(`return /G-[A-Z0-9]{6,}/.test(document.body.innerText||'')`, 15)
      const measurementId = extractMeasurementIds()[0]
      if (measurementId) {
        const [accountName, propertyName] = candidate.name.replace(/^Navigate to /, "").split(",")
        console.log(`${domain} 已找到网站数据流：账号 ${accountName} (${ids[1]})，资源 ${propertyName} (${ids[2]})，Measurement ID ${measurementId}`)
        return
      }
    }
    const html = await fetch(`https://${domain}/`).then(r => r.ok ? r.text() : "").catch(() => "")
    console.log(/G-[A-Z0-9]{6,}/.test(html)
      ? `${domain} 线上已部署 GA4 Measurement ID（所查资源未找到网站数据流）`
      : `${domain} 未找到网站数据流`)
    return
  }
  goAdmin()
  openPicker()
  scene("picker", { text: pickerText() })
  console.log("── GA4 账号 / 媒体资源 ──")
  console.log(pickerText())
}

function reuseExisting() {
  goAdmin()
  openPicker()
  fillVisibleFilter(domain)
  settle(1000)
  scene("picker-search", { domain })
  const found = evalJs(`
    const want = ${JSON.stringify(domain)};
    const wantName = ${JSON.stringify(name)};
    const items = [...document.querySelectorAll('[role="option"],button,a')].filter(el => {
      const t = (el.innerText||'').replace(/\\s+/g,' ').trim();
      return t && t.length < 80 && (t.toLowerCase() === want.toLowerCase() || t.toLowerCase() === wantName.toLowerCase());
    });
    const hit = items.sort((a,b)=>a.innerText.length-b.innerText.length)[0];
    if (!hit) return '';
    hit.setAttribute('data-rankup-reuse','1');
    return (hit.innerText||'').trim().slice(0,80);
  `)
  if (!String(found).trim()) return null
  cli(["click", '[data-rankup-reuse="1"]'])
  settle(2000)
  scene("reused-property", { found })
  stampAndClick(
    `[...document.querySelectorAll('a,button')].find(el => /数据流|Data streams/.test((el.innerText||'').trim()) && el.offsetParent)`,
    "数据流",
  )
  settle(2500)
  scene("data-streams")
  try {
    stampAndClick(
      `[...document.querySelectorAll('mat-row,[role="row"]')].find(el => (el.innerText||'').split('\\n').some(t => ['https://','http://'].some(prefix => t.trim() === prefix + ${JSON.stringify(domain)})) && el.offsetParent)`,
      "已有数据流",
      "data-rankup-row",
    )
    settle(2000)
    scene("existing-stream")
    const ids2 = extractMeasurementIds()
    return ids2[0] || null
  } catch {
    return null
  }
}

function createProperty() {
  goAdmin()
  dismissOverlays()
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b => (b.innerText||'').trim()==='创建' && b.className.includes('create-entity-menu-trigger') && b.offsetParent)`,
    "创建",
  )
  settle(600)
  stampAndClick(
    `[...document.querySelectorAll('[role="menuitem"]')].find(b => /媒体资源|Property/.test((b.innerText||'').trim()))`,
    "创建媒体资源",
  )
  waitFor(`return /创建媒体资源|媒体资源名称/.test(document.body.innerText||'')`, 20)
  settle(1000)
  scene("create-step1")

  cli(["fill", "#name", name])
  settle(400)

  stampAndClick(
    `document.querySelector('searchable-select.country-selector button.menu-open-button')`,
    "时区国家",
  )
  settle(600)
  fillVisibleFilter(timezoneCountry)
  pickOption(timezoneCountry, "时区国家选项")
  settle(800)
  if (timezone) {
    try {
      stampAndClick(
        `[...document.querySelectorAll('time-zone-selector button.menu-open-button, button.menu-open-button')].find(b => b.offsetParent && /UTC|GMT|时区|Time zone|America\\/|Europe\\/|Asia\\//.test(b.innerText||'') && !/下一步|返回|Next|Back/.test(b.innerText||''))`,
        "报告时区",
      )
      settle(600)
      fillVisibleFilter(timezone)
      pickOption(timezone, "时区选项")
      settle(800)
    } catch (e) {
      throw new Error(`时区列表里找不到 ${timezone}（--timezone）。可用 --country/--timezone 指定实际界面文字。原错误: ${e.message}`)
    }
  }

  stampAndClick(
    `[...document.querySelectorAll('button')].find(b => /人民币|USD|美元|币种|Currency/.test(b.innerText||'') && b.offsetParent && (b.innerText||'').trim().length < 40)`,
    "币种",
  )
  settle(600)
  fillVisibleFilter(currency)
  stampAndClick(
    `[...document.querySelectorAll('[role="option"]')].find(el => { const t=(el.innerText||'').trim(); return t.includes(${JSON.stringify(currency)}) || /美元|USD/.test(t); })`,
    "币种选项",
    "data-rankup-opt",
  )
  settle(500)
  scene("create-step1-filled")

  clickExactButton("下一步", "下一步-详情")
  waitFor(`return /商家详情|行业类别|Business details/.test(document.body.innerText||'')`, 15)
  settle(800)
  dismissOverlays()
  scene("create-step2")

  stampAndClick(
    `[...document.querySelectorAll('button')].find(b => /请选择一项|Select|行业/.test((b.innerText||'').trim()) && b.offsetParent)`,
    "行业类别",
  )
  settle(600)
  pickOption(industry, "行业选项")
  settle(400)
  stampAndClick(
    `document.querySelector('input[type="radio"]') || document.querySelector('mat-radio-button')`,
    "业务规模小型",
  )
  settle(400)
  clickExactButton("下一步", "下一步-商家")
  waitFor(`return /业务目标|Business objectives/.test(document.body.innerText||'')`, 15)
  settle(800)
  dismissOverlays()
  scene("create-step3")

  evalJs(`
    const cards = [...document.querySelectorAll('mat-checkbox.objective')];
    const inp = cards[2] && cards[2].querySelector('input');
    if (inp) inp.click();
    else {
      const title=[...document.querySelectorAll('div,h3,span')].find(el => /了解网站和\\/或应用流量/.test((el.innerText||'').trim()));
      let node=title; for(let i=0;i<8 && node;i++){ const box=node.querySelector('input[type="checkbox"]'); if(box){ box.click(); break; } node=node.parentElement; }
    }
  `)
  scene("clicked-了解网站流量")
  settle(400)
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b => /^(创建|Create)$/.test((b.innerText||'').trim()) && b.offsetParent && !b.disabled)`,
    "创建媒体资源提交",
    "data-rankup-create",
  )
  waitFor(`return /开始收集数据|选择平台|网站/.test(document.body.innerText||'')`, 25)
  settle(1500)
  scene("create-step4")

  return createWebStream()
}

function createWebStream() {
  stampAndClick(
    `[...document.querySelectorAll('button,[role="menuitem"]')].find(b => (b.innerText||'').trim()==='网站' && b.offsetParent)`,
    "网站平台",
    "data-rankup-web",
  )
  if (!waitFor(`return !![...document.querySelectorAll('input')].find(el => el.offsetParent && /网站网址|Website URL|www\\.mywebsite/.test((el.getAttribute('aria-label')||'')+(el.placeholder||'')))`, 15)) {
    stampAndClick(`[...document.querySelectorAll('button,[role="menuitem"]')].find(b => (b.innerText||'').trim()==='网站' && b.offsetParent)`, "重试网站平台")
    waitFor(`return !!document.querySelector('input[placeholder]')`, 15)
  }
  scene("web-stream-form")

  const urlId = evalJs(`
    const inp = [...document.querySelectorAll('input')].find(el => /网站网址|Website URL|www\\.mywebsite/.test((el.getAttribute('aria-label')||'')+(el.placeholder||'')) && el.offsetParent);
    if (!inp) throw new Error('找不到网站网址输入框');
    if (!inp.id) inp.id = 'rankup-url';
    return inp.id;
  `)
  const streamNameId = evalJs(`
    const inp = [...document.querySelectorAll('input')].find(el => /我的网站|Stream name|数据流名称/.test((el.placeholder||'')+(el.getAttribute('aria-label')||'')) && el.offsetParent);
    if (!inp) throw new Error('找不到数据流名称输入框');
    if (!inp.id) inp.id = 'rankup-stream-name';
    return inp.id;
  `)
  cli(["fill", `#${urlId}`, domain])
  cli(["fill", `#${streamNameId}`, domain])
  settle(400)
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b => /创建并继续|Create and continue|创建数据流/.test((b.innerText||'').trim()) && b.offsetParent)`,
    "创建并继续",
    "data-rankup-stream",
  )
  waitFor(`return /数据流|Measurement ID|衡量 ID|未收到数据/.test(document.body.innerText||'')`, 25)
  settle(2000)
  scene("stream-created")

  let ids = extractMeasurementIds()
  if (!ids.length) {
    stampAndClick(
      `[...document.querySelectorAll('mat-row')].find(el => new RegExp(${JSON.stringify(domain.replace(".", "\\."))},'i').test(el.innerText||'') && el.offsetParent)`,
      "新数据流行",
      "data-rankup-row",
    )
    settle(2000)
    scene("stream-detail")
    ids = extractMeasurementIds()
  }
  return ids[0] || null
}

function doCreate() {
  let id = null
  try { id = reuseExisting() } catch (e) {
    scene("reuse-error", { message: String(e?.message || e).slice(0, 400) })
  }
  if (id) {
    writeManifest(evidenceDir(), { script: "ga4-setup", action, domain, name, id, reused: true, stopReason: "reused-existing", finishedAt: new Date().toISOString() })
    console.log(`create 流程复用已有媒体资源（是否属实以 ${evidenceDir()} 截图为准）`)
    console.log(`   项目名: ${name}`)
    console.log(`   域名:   ${domain}`)
    console.log(`   ID:     ${id}（提取自页面文本）`)
    return
  }
  dismissOverlays()
  id = createProperty()
  if (!id) {
    bail("measurement-id-not-extracted", "create 流程走完但页面文本里没提取到 Measurement ID。以截图为准。", { textHead: pageText(2000) })
  }
  scene("create-final", { id })
  writeManifest(evidenceDir(), { script: "ga4-setup", action, domain, name, id, reused: false, stopReason: "flow-completed", finishedAt: new Date().toISOString() })
  console.log(`create 流程已走完，页面出现 Measurement ID（是否创建成功以 ${evidenceDir()} 的 create-final 截图为准）`)
  console.log(`   项目名: ${name}`)
  console.log(`   域名:   ${domain}`)
  console.log(`   ID:     ${id}（提取自页面文本）`)
}

try {
  if (action === "status") await doStatus()
  else if (action === "create-stream") {
    if (!domain || !/^\d+$/.test(streamAccount) || !/^\d+$/.test(streamProperty)) throw new Error("create-stream 需要 domain/account/property")
    goAdmin()
    evalJs(`location.hash=${JSON.stringify(`#/a${streamAccount}p${streamProperty}/admin/streams/table`)};return true`)
    waitFor(`return /添加数据流|Add stream/.test(document.body.innerText||'')`, 30)
    const row = evalJs(`return !![...document.querySelectorAll('mat-row,[role="row"]')].find(x=>(x.innerText||'').split('\\n').some(t=>t.trim()==='https://'+${JSON.stringify(domain)}))`)
    if (row === "true") throw new Error("已有同域名数据流，请先 status 读取；不重复创建")
    if (evalJs(`return !![...document.querySelectorAll('button')].find(x=>(x.innerText||'').trim()==='网站' && x.offsetParent)`) !== "true") {
      stampAndClick(`[...document.querySelectorAll('button')].find(x=>/添加数据流|Add stream/.test(x.innerText||'') && x.offsetParent)`, "添加数据流")
    }
    const id = createWebStream()
    if (!id) throw new Error("未读到 Measurement ID")
    scene("create-final", {id})
    console.log(`ID: ${id}（既有媒体资源 ${streamProperty} 的数据流）`)
  } else doCreate()
} catch (e) {
  bail("execution-error", e.message)
} finally {
  if (!keepSession) {
    try { cli(["close"]) } catch {}
  }
}
