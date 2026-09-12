#!/usr/bin/env node
/**
 * Cloudflare Web Analytics（RUM）接入。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/cf-analytics-setup.mjs status <domain>
 *   node <rankup-skill-dir>/scripts/cf-analytics-setup.mjs enable <domain>
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
 * 凭据：只从环境变量 CLOUDFLARE_API_TOKEN 读，读不到就退到 <repo>/.cf-token
 * （该文件已被 .gitignore 排除）。真实值不打印、不落盘、不进日志。
 *
 * 需要的权限：Account > Account Analytics > Edit（RUM）+ Zone > Zone > Read。
 * 不要用 Global API Key：它不能限定 scope，泄露即等于整个账号。
 *
 * 已验证：2026-08-21；auto_install 默认关闭复验：2026-09-12
 */
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"

const API = "https://api.cloudflare.com/client/v4"

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN.trim()
  const f = join(process.cwd(), ".cf-token")
  if (existsSync(f)) return readFileSync(f, "utf8").trim()
  console.error(`找不到 API token。二选一：
  export CLOUDFLARE_API_TOKEN=...        （当前 shell 有效）
  echo '...' > .cf-token                 （已 gitignore）

token 在 dash.cloudflare.com → My Profile → API Tokens → Create Token → Custom：
  权限  Zone > Zone > Edit
  范围  Zone Resources = All zones      ← 必须 All zones，不能选具体某个 zone
不要用 Global API Key。`)
  process.exit(2)
}

/**
 * 两种凭据的 header 完全不同，认错会得到一个极具误导性的
 * `6003 Invalid request headers`（看着像请求写错了，其实是凭据类型不匹配）：
 *   - API Token（40 字符）  → Authorization: Bearer <token>
 *   - Global API Key（37 字符）→ X-Auth-Email + X-Auth-Key，还必须带账号邮箱
 * 按长度判别，并允许 CLOUDFLARE_EMAIL 覆盖。
 */
function authHeaders() {
  const t = token()
  if (t.length === 37 && /^[0-9a-f]+$/.test(t)) {
    const email = process.env.CLOUDFLARE_EMAIL
    if (!email) {
      console.error(`检测到 Global API Key。它必须配合账号邮箱使用：
  export CLOUDFLARE_EMAIL=你的Cloudflare账号邮箱

强烈建议改用 scoped API Token（Zone>Zone>Edit，范围 All zones）：
Global Key 不能限定范围，泄露即等于整个账号。`)
      process.exit(2)
    }
    return { "X-Auth-Email": email, "X-Auth-Key": t }
  }
  return { Authorization: `Bearer ${t}` }
}

async function cf(path, init = {}) {
  const r = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })
  const j = await r.json().catch(() => ({}))
  if (!j.success) {
    const msg = (j.errors || []).map((e) => `${e.code} ${e.message}`).join("; ")
    throw new Error(`${init.method || "GET"} ${path} → HTTP ${r.status}: ${msg || "未知错误"}`)
  }
  return j.result
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


function reportSite(s) {
  console.log(`site tag     ${s.site_tag}   （这是查询/面板用的 ID，不是 beacon 里的 token）`)
  console.log(`site token   ${s.site_token || "(API 未返回，去面板取 snippet)"}   ← 手动嵌 beacon 时只能用这个`)
  console.log(`auto_install ${s.auto_install}`)
  console.log(`zone         ${s.ruleset?.zone_name || "(未绑定 zone)"}`)
  console.log(`规则启用     ${s.ruleset?.enabled}`)
  if (s.snippet) console.log(`snippet      ${s.snippet}`)
  if (!s.auto_install) {
    console.log(`\n✅ auto_install 已关闭（这是期望状态）—— 手动把上面的 snippet 嵌进页面，`)
    console.log(`   延迟到首次交互或 6s 兜底再注入，data-cf-beacon 里填 site_token，不是 site_tag。`)
    console.log(`   两个都是 32 位十六进制，填错不报错、beacon 照样 200 加载，只是永远 0 数据。`)
  } else {
    console.log(`\n⚠️ auto_install 为 true —— 边缘会在每次响应上自动注入 beacon，绕过代码里`)
    console.log(`   任何延迟加载逻辑，/cdn-cgi/rum 会成为最长关键请求链之一。`)
    console.log(`   【实测，多站复现】应改为手动嵌 snippet 并关闭 auto_install，去 Cloudflare`)
    console.log(`   Dashboard 的 Web Analytics 设置里关掉，或删除后用本脚本 enable 重建`)
    console.log(`   （enable 默认创建时就是 auto_install: false）。`)
  }
  console.log(`\n验收不能停在「HTML 里有 cloudflareinsights」。用 GraphQL 查 count：`)
  console.log(`  rumPageloadEventsAdaptiveGroups(filter:{siteTag:"${s.site_tag}", date_geq:"<7 天前>"}) { count }`)
  console.log(`  上线后一天仍是 [] 就是 token 填错或注入没生效。`)
}

const [cmd, domain] = process.argv.slice(2)
const askedForHelp = process.argv.slice(2).some((a) => a === "-h" || a === "--help")
if (askedForHelp || !cmd || !domain) {
  // 显式 `--help` 是成功，退出码 0；什么都不给才是用法错误。
  const out = askedForHelp ? console.log : console.error
  out("用法: cf-analytics-setup.mjs <status|enable> <domain>")
  process.exit(askedForHelp ? 0 : 2)
}

const zones = await cf(`/zones?name=${encodeURIComponent(domain)}`)
if (!zones.length) throw new Error(`${domain} 不在这个账号里，先跑 cf-zone-setup.mjs create`)
const zone = zones[0]

const accounts = await cf("/accounts")
const accountId = process.env.CF_ACCOUNT_ID || accounts[0].id

// 必须分页：默认每页 10 条，账号站点一多就会把已存在的条目判成「不存在」而重复创建。
const existing = await cf(`/accounts/${accountId}/rum/site_info/list?per_page=100`)
const hit = (existing || []).find((s) => s.ruleset?.zone_tag === zone.id)
if (hit) {
  console.log(`Web Analytics 已启用：\n`)
  reportSite(hit)
  process.exit(0)
}
if (cmd === "status") {
  console.log(`${domain} 尚未启用 Web Analytics。跑 enable 开启。`)
  process.exit(0)
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
