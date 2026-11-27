#!/usr/bin/env node
/**
 * bing-import-from-gsc.mjs —— Bing Webmaster 默认从 Google Search Console 导入网站。
 * 用法：node bing-import-from-gsc.mjs --sites example.com,example.org [--session sp-gpt] [--sitemap]
 * 默认只检查指定站点是否已在 Bing；已有站点不重复导入。缺站时仅导入 --sites
 * 中尚未添加的站点，绝不导入 GSC 预选的其他站。--sitemap 为缺失的 sitemap 提交。
 * 登录态：OpenCLI 连接用户已登录 Bing 与 Google 的 Chrome；Bing 显示登录页时先点
 * 「登录」，再点「使用 Google 登录」恢复会话。Google 账户选择器选第一项；出现
 * 密码框、二次验证、验证码、首次授权同意页则停下，不代为填写或同意。
 * 已知坑（2026-09-28）：Bing /webmasters/about 初始可能只是加载中的公开页，
 * 需等可见登录按钮；左侧「选择网站」里才有「添加网站」。GSC 的 sc-domain
 * 在导入预览中显示为 https://domain/；默认预选全部，提交前必须逐项核对勾选。
 * 2026-09-28 五站通过 UI 导入，站点选择器及 sitemap 页面已回读；幂等检查在
 * 五个真实站点上验证。2026-10-02：等待 Google 账户选择器并处理既有关系重新登录继续页；使用 dedicated 窗口。
 * 2026-10-02：单域名导入、既有权限确认及重复导入检查已实测；sitemap 已入列。
 * 新增权限同意、密码与验证码仍停止；批量缺站分支未在本轮复测。
 */
import { execFileSync } from "node:child_process"

const argv = process.argv.slice(2)
if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
  console.log("用法: node bing-import-from-gsc.mjs --sites domain1,domain2 [--session sp-gpt] [--sitemap]")
  process.exit(argv.length ? 0 : 1)
}
function opt(name) { const index = argv.indexOf(name); return index === -1 ? undefined : argv[index + 1] }
const sites = (opt("--sites") || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
const session = opt("--session") || "bing-import-gsc"
const submitSitemap = argv.includes("--sitemap")
if (!sites.length || sites.some(s => !/^[a-z\d-]+(?:\.[a-z\d-]+)+$/i.test(s)) || new Set(sites).size !== sites.length) {
  throw new Error("--sites 需要不重复、逗号分隔的合法域名")
}
let opened = false
function browser(...parts) {
  return execFileSync("opencli", ["browser", "--session", session, "--window", "foreground", ...parts],
    { encoding: "utf8", timeout: 90000 }).trim()
}
function evalJs(source) { const raw= browser("eval", `(()=>{${source}})()`); try { const r=JSON.parse(raw); if(r.ok===true && Object.hasOwn(r,"data")) return typeof r.data==="string"?r.data:JSON.stringify(r.data); } catch {} return raw }
function open(url) {
  opened = true
  for (let attempt = 0; attempt < 3; attempt++) {
    try { browser("open", url); return } catch (error) {
      if (!/Navigation rejected/.test(String(error.stderr || error.message))) throw error
      browser("wait", "time", "2")
      if (evalJs(`return location.origin+location.pathname`) === new URL(url).origin+new URL(url).pathname) return
      if (attempt === 2) throw error
    }
  }
}
function inspect() {
  return JSON.parse(evalJs(`return {url:location.origin+location.pathname,
    text:(document.body?.innerText||'').slice(0,3000),password:!!document.querySelector('input[type=password]'),
    permissions:[...document.querySelectorAll('input[type=checkbox],[role=checkbox]')].some(e=>e.offsetParent!==null),
    navigation:!!document.querySelector('button[aria-label="显示导航面板"],button[aria-label="选择网站"]'),
    buttons:[...document.querySelectorAll('button,a,[role=button]')].filter(e=>e.offsetParent!==null)
      .map(e=>({text:(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,90),
        href:e.getAttribute('href')||''})).filter(e=>e.text).slice(0,90),
    dialogs:[...document.querySelectorAll('[role=dialog]')].map(e=>e.innerText.slice(0,2400))}`))
}
function existingConsent(page) {
  return /accounts\.google\.com\/.*consent/.test(page.url) &&
    /“bing\.com”已拥有部分访问权限|bing\.com.*already has some access/i.test(page.text) && !page.permissions
}
function stopIfSensitive(page) {
  if (page.password || /captcha|验证码|人机验证|recaptcha|二次验证|两步验证/i.test(page.text)) {
    throw new Error("遇密码框、二次验证或验证码；停止自动操作")
  }
  if (!existingConsent(page) && (/\/consent\b|\/oauth\d*\/.*consent/i.test(page.url) ||
    /授权同意|请求访问您的 Google|权限请求|选择您允许.*访问|wants access to your Google Account/i.test(page.text))) {
    throw new Error("遇首次授权同意页；需要用户亲自决定")
  }
}
function click(selector) { browser("click", selector) }
function waitFor(condition, label, seconds = 25) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    const page = inspect()
    stopIfSensitive(page)
    if (condition(page)) return page
    browser("wait", "time", "1")
  }
  throw new Error(`${label} 超过 ${seconds} 秒未出现`)
}
function clickVisible(js, label) {
  const found = evalJs(`document.querySelectorAll('[data-bing-target]').forEach(e=>e.removeAttribute('data-bing-target'));
    const el=${js};if(!el)return false;el.setAttribute('data-bing-target','1');return true`)
  if (found !== "true") throw new Error(`找不到 ${label}；停止`)
  click('[data-bing-target="1"]')
}
function isDashboard(page) {
  return page.url.replace(/\/$/, "").endsWith("/webmasters") && (page.navigation || /站点管理器|Site Explorer/i.test(page.text))
}
function recoverSession({ preview = false } = {}) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    const page = inspect()
    stopIfSensitive(page)
    if (preview && page.dialogs.some(d => /可导入的网站|Sites available for import/i.test(d))) return
    if (!preview && isDashboard(page)) return
    if (/accounts\.google\.com/.test(page.url)) {
      if (/您正在重新登录|signing back in/i.test(page.text) || existingConsent(page)) {
        try {
          clickVisible(`[...document.querySelectorAll('button')].find(e=>e.offsetParent!==null&&/^(继续|Continue)$/i.test(e.innerText.trim()))`, "Google 重新登录继续")
        } catch (error) {
          const current = inspect()
          if (current.url === page.url && current.text === page.text) throw error
        }
        browser("wait", "time", "1")
        continue
      }
      if (!/选择帐号|选择账号|Choose an account|Select an account/i.test(page.text)) {
        browser("wait", "time", "1")
        continue
      }
      if (evalJs("return !!document.querySelector('[data-identifier]')") !== "true") {
        browser("wait", "time", "1")
        continue
      }
      try { clickVisible(`[...document.querySelectorAll('[data-identifier]')].find(e=>e.offsetParent!==null)`, "Google 第一账户") }
      catch (error) {
        if (/No resolved element|找不到 Google 第一账户|selector_not_found/.test(error.message)) { browser("wait", "time", "1"); continue }
        throw error
      }
      browser("wait", "time", "1")
    } else if (page.buttons.some(b => /使用 Google 登录|Sign in with Google|Continue with Google/i.test(b.text))) {
      clickVisible(`[...document.querySelectorAll('button,a,[role=button]')]
        .find(e=>e.offsetParent!==null&&/使用 Google 登录|Sign in with Google|Continue with Google/i.test(e.innerText))`, "使用 Google 登录")
    } else if (page.buttons.some(b => /^(登录|Sign in|Log in)$/i.test(b.text))) {
      clickVisible(`[...document.querySelectorAll('button,a,[role=button]')]
        .find(e=>e.offsetParent!==null&&/^(登录|Sign in|Log in)$/i.test(e.innerText.trim()))`, "Bing 登录")
    } else {
      browser("wait", "time", "1")
    }
  }
  throw new Error("90 秒内未回到 Bing 已登录后台；停止")
}
function listedSites() {
  const rows = JSON.parse(evalJs(`return [...document.querySelectorAll('a[role=option][aria-label]')]
    .filter(e=>e.offsetParent!==null).map(e=>e.getAttribute('aria-label').toLowerCase())
    .filter(t=>/^[a-z\\d-]+(?:\\.[a-z\\d-]+)+$/.test(t))`))
  return new Set(rows)
}
function selectedSites() {
  return JSON.parse(evalJs(`const d=[...document.querySelectorAll('[role=dialog]')]
    .find(e=>e.innerText.includes('可导入的网站')||e.innerText.includes('Sites available for import'));
    if(!d)return null;return [...d.querySelectorAll('[role=row]')]
    .filter(e=>e.innerText.includes('https://')).map(e=>({text:e.innerText.slice(0,200),
      domain:(e.innerText.match(/https:\\/\\/([^\\s/]+)\\//)||[])[1]?.toLowerCase()||'',
      checked:e.querySelector('[role=checkbox]')?.getAttribute('aria-checked')}))`))
}
function selectOnly(missing) {
  const wanted = new Set(missing)
  let rows = selectedSites()
  if (!rows || missing.some(site => !rows.some(row => row.domain === site))) {
    throw new Error(`导入预览缺少目标站点；停止：${JSON.stringify(rows)}`)
  }
  for (const row of rows) {
    if (!row.domain) throw new Error(`无法辨认预览站点；停止：${JSON.stringify(row)}`)
    const shouldCheck = wanted.has(row.domain)
    if ((row.checked === "true") === shouldCheck) continue
    const marked = evalJs(`const d=[...document.querySelectorAll('[role=dialog]')]
      .find(e=>e.innerText.includes('可导入的网站')||e.innerText.includes('Sites available for import'));
      const row=[...d.querySelectorAll('[role=row]')].find(e=>e.innerText.includes(${JSON.stringify(`https://${row.domain}/`)}));
      const box=row?.querySelector('[role=checkbox]');if(!box)return false;
      document.querySelectorAll('[data-bing-checkbox]').forEach(e=>e.removeAttribute('data-bing-checkbox'));
      box.setAttribute('data-bing-checkbox','1');return true`)
    if (marked !== "true") throw new Error(`无法定位 ${row.domain} 的复选框；停止`)
    browser(shouldCheck ? "check" : "uncheck", '[data-bing-checkbox="1"]')
  }
  rows = selectedSites()
  if (!rows || rows.some(row => (row.checked === "true") !== wanted.has(row.domain)) ||
    missing.some(site => !rows.some(row => row.domain === site && row.checked === "true"))) {
    throw new Error(`导入预览勾选与目标站点不一致；停止：${JSON.stringify(rows)}`)
  }
  console.log(`Bing 预览已逐项核对，仅导入 ${missing.join(", ")}`)
}
function submitMissingSitemaps() {
  for (const domain of sites) {
    const site = `https://${domain}`
    const script = new URL("./webmaster-sitemap.mjs", import.meta.url).pathname
    const status = execFileSync(process.execPath,
      [script, "bing", "status", "--site", site, "--session", session],
      { encoding: "utf8", timeout: 120000 })
    if (status.includes(`${site}/sitemap.xml`)) {
      console.log(`${domain} Bing sitemap 已入列，跳过重复提交。`)
      continue
    }
    console.log(execFileSync(process.execPath,
      [script, "bing", "submit", "--site", site, "--sitemap", `${site}/sitemap.xml`, "--session", session],
      { encoding: "utf8", timeout: 120000 }))
  }
}
try {
  if (argv.includes("--resume-import")) {
    opened = true
    recoverSession({preview:true})
    selectOnly(sites)
    click('button[data-tag="importButton"]')
    waitFor(p => p.dialogs.some(d => /正在添加网站信息|Adding site|成功添加/i.test(d)) || p.dialogs.length === 0, "导入提交响应")
    console.log(`已导入指定站点 ${sites.join(", ")}；需后台回读。`)
  } else {
  open("https://www.bing.com/webmasters/")
  recoverSession()
  if (evalJs(`return !!document.querySelector('button[aria-label="选择网站"],button[aria-label="Select site"]')?.offsetParent`) !== "true") {
    click('button[aria-label="显示导航面板"],button[aria-label="Show navigation panel"]')
  }
  if (evalJs(`return !!document.querySelector('button[aria-label="选择网站"],button[aria-label="Select site"]')`) !== "true") {
    throw new Error("Bing 左侧网站选择器未出现；停止")
  }
  click('button[aria-label="选择网站"],button[aria-label="Select site"]')
  const existing = listedSites()
  const missing = sites.filter(site => !existing.has(site))
  if (!missing.length) {
    console.log(`Bing 已有 ${sites.join(", ")}；跳过重复导入。`)
  } else {
    click('button[aria-label="添加网站"],button[aria-label="Add site"]')
    waitFor(p => p.dialogs.some(d => /从 GSC 导入|Import from Google Search Console/i.test(d)), "Bing 添加网站弹窗")
    click('button[data-tag="importFromGSC"]')
    waitFor(p => p.dialogs.some(d => /我们将从你的 Google Search Console|what data.*Search Console/i.test(d)), "Bing 导入说明")
    click('button[data-tag="addSiteButton"]')
    recoverSession({ preview: true })
    waitFor(p => p.dialogs.some(d => /可导入的网站|Sites available for import/i.test(d)), "GSC 站点预览", 35)
    selectOnly(missing)
    click('button[data-tag="importButton"]')
    waitFor(p => p.dialogs.some(d => /正在添加网站信息|Adding site|成功添加/i.test(d)) || p.dialogs.length === 0, "导入提交响应")
    console.log(`已点击导入 ${missing.length} 站；需逐站读回 Bing sitemap 页面确认。`)
  }
  }
} finally {
  if (opened && !argv.includes("--keep-session")) { try { browser("close") } catch { /* avoid masking original failure */ } }
}
if (submitSitemap) submitMissingSitemaps()
