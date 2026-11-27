#!/usr/bin/env node
/**
 * 在 GA4 管理后台关联同域名的 Search Console 网域资源。
 * 用法：node scripts/ga4-gsc-link.mjs list [--json]
 *       node scripts/ga4-gsc-link.mjs status|link --domain example.com [--account <账号号>] [--property <媒体资源号>]
 *       node scripts/ga4-gsc-link.mjs link --all [--exclude a.com,b.com]
 * 通用参数：[--session <名>] [--window dedicated|background] [--window-slot <slot>] [--screenshot <路径>] [--keep-session]
 * 依赖：OpenCLI 连接的 Chrome 已登录 GA4，且账号有目标 GSC 资源权限。
 * 已知坑：GA4 hash URL 直接 open 可能报 Navigation rejected；先开 /analytics/web/ 再改 hash。
 * 主机名比较有意去掉前导 www.：GSC 网域资源 example.com 可对应 www 数据流。
 * 验证日期：2026-09-29。
 */
import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sessionSuffix } from "./lib-scene.mjs"

const argv = process.argv.slice(2)
const action = argv[0]
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("用法：node scripts/ga4-gsc-link.mjs list [--json] | status|link --domain <域名> | link --all [--exclude a.com,b.com] [--account <号>] [--property <号>] [--session <名>] [--window dedicated|background] [--window-slot <slot>] [--screenshot <路径>]")
  process.exit(0)
}
let domain, account, property, screenshot, exclude = ""
let session = `ga4-gsc-link-${sessionSuffix()}`
let windowMode = "dedicated", explicitWindow = false
let windowSlot = null
let keepSession = false
let all = false, json = false
for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--domain") { domain = argv[++i]; continue }
  if (a === "--account") { account = argv[++i]; continue }
  if (a === "--property") { property = argv[++i]; continue }
  if (a === "--session") { session = argv[++i]; continue }
  if (a === "--window") { windowMode = argv[++i]; explicitWindow = true; continue }
  if (a === "--window-slot") { windowSlot = argv[++i]; continue }
  if (a === "--screenshot") { screenshot = argv[++i]; continue }
  if (a === "--exclude") { exclude = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "--all") { all = true; continue }
  if (a === "--json") { json = true; continue }
  throw new Error(`未知参数: ${a}`)
}
if (!["list", "status", "link"].includes(action) || (action !== "list" && !all && !domain)) throw new Error("需要 list、status --domain 或 link --domain|--all")
function host(value) {
  try { return new URL(/^https?:\/\//i.test(value) ? value : `https://${value.replace(/^sc-domain:/i, "")}`).hostname.toLowerCase().replace(/^www\./, "") }
  catch { return "" }
}
domain = domain && host(domain)
const excluded = new Set(exclude.split(",").filter(Boolean).map(host))
const requestedAccount = account, requestedProperty = property

function cli(args, timeout = 30000) {
  try {
    return execFileSync("opencli", ["browser", "--session", session, "--window", windowMode, ...args],
      { encoding: "utf8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const message = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim()
    throw new Error(message)
  }
}
const evaluate = js => { const raw=cli(["eval", `(()=>{${js}})()`]); try { const r=JSON.parse(raw); if(r.ok===true && Object.hasOwn(r,"data")) return typeof r.data==="string"?r.data:JSON.stringify(r.data); } catch {} return raw }
const pause = ms => evaluate(`return new Promise(r=>setTimeout(()=>r(true),${ms}))`)
function waitFor(js, seconds = 25) {
  const end = Date.now() + seconds * 1000
  while (Date.now() < end) {
    try { if (evaluate(js) === "true") return } catch { /* navigation */ }
    pause(500)
  }
  throw new Error(`页面未出现预期内容：${evaluate("return (document.body.innerText||'').slice(0,1200)")}`)
}
function click(js, label) {
  evaluate(`document.querySelectorAll('[data-rankup-ga4-gsc]').forEach(x=>x.removeAttribute('data-rankup-ga4-gsc'));const x=${js};if(!x)throw new Error(${JSON.stringify(`找不到${label}`)});x.setAttribute('data-rankup-ga4-gsc','1');return true`)
  cli(["click", "[data-rankup-ga4-gsc='1']"])
  pause(700)
}
const button = label => `[...document.querySelectorAll('button,[role="button"]')].find(x=>x.offsetParent && (x.innerText||'').trim()===${JSON.stringify(label)})`
function linked() {
  const rows = JSON.parse(evaluate(`return JSON.stringify([...document.querySelectorAll('tr,[role="row"],mat-row')].map(x=>[...x.querySelectorAll('td,mat-cell,[role="cell"]')].map(c=>(c.innerText||'').trim())))`))
  const matches = rows.filter(c => host(c[0] || "") === domain)
  if (!matches.length) return false
  if (matches.some(c => /^https?:\/\//i.test(c[2] || "") && host(c[2]) === domain)) return true
  const ids = matches.filter(c => !/^https?:\/\//i.test(c[2] || "")).map(c => (c[3] || "").trim())
  if (ids.some(id => !/^\d+$/.test(id))) throw new Error(`${domain} 的关联数据流 ID 无法确认`)
  const details = streams(account, property, true)
  goToLinks()
  if (details.some(x => ids.includes(x.id) && host(x.url) === domain)) return true
  if (ids.some(id => !details.some(x => x.id === id && x.url))) throw new Error(`${domain} 的关联数据流 URL 无法确认`)
  return false
}
function openHome() {
  try { cli(["open", "https://analytics.google.com/analytics/web/"], 45000) }
  catch (e) { if (!/Navigation rejected/i.test(e.message)) throw e }
  waitFor("return /管理|Admin|媒体资源/.test(document.body.innerText||'')", 40)
}
function properties(strict = false) {
  waitFor("return !!document.querySelector('button[aria-label*=\"通用选择器\"],button.gmp-popup-button')", 40)
  click("document.querySelector('button[aria-label*=\"通用选择器\"],button.gmp-popup-button')", "账号选择器")
  if (strict && evaluate("const v=document.querySelector('cdk-virtual-scroll-viewport');return v.scrollHeight>v.clientHeight+2") === "true") throw new Error("GA 账号列表未读全，停止提交")
  const accounts = JSON.parse(evaluate(`return JSON.stringify([...document.querySelector('cdk-virtual-scroll-viewport').querySelectorAll('li[role="option"][value]')].filter(x=>/^\\d+$/.test(x.getAttribute('value')||'')).map(x=>x.getAttribute('value')))`))
  const found = new Map()
  for (const a of accounts) {
    let complete = false
    if (evaluate("return !!document.querySelector('cdk-virtual-scroll-viewport')") === "false") click("document.querySelector('button.gmp-popup-button')", "账号选择器")
    click(`document.querySelector('cdk-virtual-scroll-viewport li[role="option"][value="${a}"] button')`, "GA 账号")
    for (let n = 0; n < 40; n++) {
      const result = JSON.parse(evaluate(`const v=[...document.querySelectorAll('cdk-virtual-scroll-viewport')].at(-1);return JSON.stringify({top:v.scrollTop,end:v.scrollTop+v.clientHeight>=v.scrollHeight-2,links:[...v.querySelectorAll('a[href*="reports/intelligenthome"]')].map(x=>x.getAttribute('href'))})`))
      for (const href of result.links) {
        const ids = href.match(/a(\d+)p(\d+)/)
        if (ids) found.set(ids[2], { account: ids[1], property: ids[2] })
      }
      if (result.end) { complete = true; break }
      cli(["scroll", "down", "--amount", "300"])
      pause(150)
      if (evaluate(`return [...document.querySelectorAll('cdk-virtual-scroll-viewport')].at(-1).scrollTop>${result.top}`) !== "true") throw new Error("GA 媒体资源选择器未滚动，列表不完整")
    }
    if (!complete) throw new Error(`GA 账号 ${a} 的媒体资源列表不完整`)
  }
  click("document.querySelector('button.gmp-popup-button')", "关闭账号选择器")
  return [...found.values()]
}
function streams(a, p, withIds = false) {
  evaluate(`location.hash=${JSON.stringify(`#/a${a}p${p}/admin/streams/table`)};return true`)
  waitFor("return /添加数据流|Add stream/.test(document.body.innerText||'')", 30)
  const rows = JSON.parse(evaluate(`return JSON.stringify([...document.querySelectorAll('mat-row,[role="row"]')].map(x=>({id:(x.className||'').match(/stream-row-(\\d+)/)?.[1]||'',url:[...x.querySelectorAll('mat-cell,[role="cell"]')].flatMap(c=>(c.innerText||'').split(/\\n/)).find(t=>/^https?:\\/\\//i.test(t))||''})).filter(x=>x.url))`))
  return withIds ? rows : rows.map(x=>x.url)
}
function discover(strict = false) {
  const available = account && property && action !== "list" && !all ? [{ account, property }] : properties(strict)
  const matches = new Map()
  for (const item of available) for (const url of streams(item.account, item.property)) {
    const h = host(url)
    if (h) matches.set(h, [...(matches.get(h) || []), item])
  }
  return { available, matches }
}
function resolve(matches, target) {
  const found = matches.get(target) || []
  if (found.length !== 1) throw new Error(`${target} 的 GA 媒体资源匹配 ${found.length} 个，停止提交`)
  if (requestedAccount && requestedAccount !== found[0].account || requestedProperty && requestedProperty !== found[0].property) throw new Error(`${target} 的 GA 媒体资源与指定账号或资源不一致`)
  account = found[0].account
  property = found[0].property
}
function goToLinks() {
  evaluate(`location.hash=${JSON.stringify(`#/a${account}p${property}/admin/integrations/search-console`)};return true`)
  waitFor("return /Search Console/.test(document.body.innerText||'') && /关联|Link/.test(document.body.innerText||'')", 40)
  pause(1500)
}
function drawer(strict = false) {
  click(button("关联"), "关联")
  waitFor("return /选择 Search Console 媒体资源/.test(document.body.innerText||'')")
  click(button("选择账号"), "选择账号")
  waitFor("return /关联到我管理的某个媒体资源/.test(document.body.innerText||'')")
  waitFor("return /每页项数/.test(document.body.innerText||'')")
  const rows = JSON.parse(evaluate(`return JSON.stringify([...document.querySelectorAll('tr,[role="row"],mat-row')].map(x=>({name:(x.querySelector('[class*="column-propertyName"]')?.innerText||'').trim(),checkbox:!!x.querySelector('input[type="checkbox"],[role="checkbox"]')})).filter(x=>x.name))`))
  if (strict) {
    const page = JSON.parse(evaluate(`const p=document.querySelector('mat-paginator');const label=(p?.querySelector('[class*="paginator-range-label"]')?.innerText||'').trim();const next=p?.querySelector('button[class*="paginator-navigation-next"]');return JSON.stringify({label,next:!!next,disabled:next?.disabled||next?.getAttribute('aria-disabled')==='true'})`))
    const counts = page.label.match(/([\d,]+)\s*[-–]\s*([\d,]+)[^\d]+([\d,]+)/)
    if (!counts || !page.next || !page.disabled || Number(counts[1].replaceAll(',', '')) !== 1 || Number(counts[2].replaceAll(',', '')) !== Number(counts[3].replaceAll(',', '')) || rows.length !== Number(counts[3].replaceAll(',', ''))) throw new Error('GSC 资源列表未读全，停止提交')
  }
  return rows.map(x=>({ name: x.name, domain: host(x.name), linked: !x.checkbox })).filter(x=>x.domain)
}
function list(matches, available, strict = false) {
  for (const item of available) {
    account = item.account; property = item.property
    goToLinks()
    if (evaluate(`return ${button("关联")}?.getAttribute('aria-disabled')!=='true'`) !== "true") continue
    return drawer(strict).map(x=>({ ...x, properties: (matches.get(x.domain)||[]).map(p=>`p${p.property}`) }))
  }
  throw new Error("所有 GA 媒体资源的关联按钮均不可用，无法打开 GSC 选择抽屉")
}
function printTable(rows, summary = false) {
  console.log(`GSC 资源\t${summary ? "结果" : "状态"}\tGA 媒体资源`)
  for (const x of rows) console.log(`${x.domain}\t${summary ? x.result : x.linked ? "已关联" : "未关联"}\t${x.properties.length ? x.properties.join(",") : "无"}`)
}
function judge(resultText) {
  const dir = mkdtempSync(join(tmpdir(), "ga4-gsc-judge-"))
  try {
    const state = join(dir, "state.txt"), questions = join(dir, "questions.json")
    writeFileSync(state, resultText)
    writeFileSync(questions, JSON.stringify({ created: { type: "noul", instructions: "关联是否已成功创建？" } }))
    const out = JSON.parse(execFileSync("fleet", ["judge", state, questions, "--json"], { encoding: "utf8", timeout: 60000, stdio: ["ignore", "pipe", "pipe"] }))
    if (!out.ok) throw new Error(out.error || "JEV 未返回结果")
    const value = Number(out.answers?.created?.confidence ?? out.answers?.created?.value)
    // 2026-10-03：JEV 未返回数值时 Number(undefined)=NaN，原先会把已成功的关联误报为失败；
    // 非有限值按「无判断」处理，成败以 linked() 回读为准。
    return Number.isFinite(value) ? value : null
  } catch (e) {
    console.error(`JEV 不可用，改用 status 回读：${e.message}`)
    return null
  } finally { rmSync(dir, { recursive: true, force: true }) }
}
function link() {
  goToLinks()
  if (linked()) return "已关联"
  goToLinks()
  const choices = drawer().filter(x=>x.domain===domain)
  if (choices.length !== 1) throw new Error(`${domain} 的 GSC 资源匹配 ${choices.length} 个，停止提交`)
  if (choices[0].linked) throw new Error(`${domain} 已关联其他 GA4 媒体资源`)
  const row = `[...document.querySelectorAll('tr,[role="row"],mat-row')].filter(x=>{const c=x.querySelector('[class*="column-propertyName"]');return c && (c.innerText||'').trim()===${JSON.stringify(choices[0].name)}})`
  click(`${row}[0].querySelector('input[type="checkbox"],[role="checkbox"]')`, "GSC 网域资源")
  click(button("确认"), "确认")
  click(button("下一步"), "下一步")
  waitFor(`return !!document.querySelector('button[aria-label="选择网站数据流"]')`)
  click(`document.querySelector('button[aria-label="选择网站数据流"]')`, "选择数据流")
  waitFor("return [...document.querySelectorAll('tr,[role=\"row\"],mat-row')].some(x=>/https?:\\/\\//.test(x.innerText||''))")
  const streamRows = JSON.parse(evaluate(`return JSON.stringify([...document.querySelectorAll('tr,[role="row"],mat-row')].map((x,index)=>({url:[...x.querySelectorAll('td,mat-cell,[role="cell"]')].flatMap(c=>(c.innerText||'').split(/\\n/)).find(t=>/^https?:\\/\\//i.test(t))||'',index})))`))
  const streams = streamRows.filter(x=>host(x.url)===domain)
  if (streams.length !== 1) throw new Error(`${domain} 的数据流匹配 ${streams.length} 个，停止提交`)
  click(`[...document.querySelectorAll('tr,[role="row"],mat-row')][${streams[0].index}]`, "匹配域名的数据流")
  click(button("下一步"), "下一步")
  waitFor("return [...document.querySelectorAll('button')].some(x=>(x.innerText||'').trim()==='提交')", 60)
  click(button("提交"), "提交")
  waitFor("return /链接已创建|关联已创建|Link created/.test(document.body.innerText||'')", 30)
  const confidence = judge(evaluate("return (document.body.innerText||'').slice(0,12000)"))
  goToLinks()
  if (!linked()) throw new Error("提交后关联列表未显示目标 GSC 资源")
  if (confidence !== null && !(confidence >= 0.55)) throw new Error(`JEV 成功置信度 ${confidence} 低于 0.55`)
  if (screenshot) cli(["screenshot", screenshot], 90000)
  return "已关联"
}
function run() {
  openHome()
  const { available, matches } = discover(all && action === "link")
  if (action === "list") {
    const rows = list(matches, available)
    if (json) console.log(JSON.stringify(rows, null, 2)); else printTable(rows)
    return
  }
  if (all) {
    const rows = list(matches, available, true).map(x=>({ ...x, result: excluded.has(x.domain) ? "排除" : x.linked ? "已关联" : x.properties.length !== 1 ? x.properties.length ? "歧义，未提交" : "无匹配，未提交" : "待关联" }))
    for (const x of rows.filter(x=>x.result==="待关联")) {
      domain = x.domain
      try { resolve(matches, domain); x.result = link() }
      catch (e) { x.result = `失败：${e.message}`; process.exitCode = 1 }
    }
    printTable(rows, true)
    return
  }
  resolve(matches, domain)
  goToLinks()
  if (action === "status") { console.log(`${domain} ${linked() ? "已关联" : "未关联"} GA4 Search Console`); return }
  console.log(`${domain} ${link()} GA4 Search Console`)
}
try { run() } catch (e) { console.error(e.message); process.exitCode = 1 } finally { if (!keepSession) try { cli(["close"]) } catch { /* no session */ } }
