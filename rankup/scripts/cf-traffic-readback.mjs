#!/usr/bin/env node
/**
 * 只读：用 Cloudflare GraphQL Analytics API 读单个 zone 的流量（请求数、访客、状态码、国家、路径、浏览器/非浏览器 UA、
 * Verified bot、Web Analytics(RUM) 入库）。不改任何配置，不打印凭据。
 * 用法：node cf-traffic-readback.mjs --zone effect.video [--days 7] [--rum-site-tag <site_tag>] [--out <目录>]
 * 注意：--rum-site-tag 要的是 `cf rum site-info list --per-page 100` 里的 site_tag，不是页面 data-cf-beacon 里的 token（site_token）；传 token 会返回空数组，被误判为“未入库”（2026-10-30 实踩）。
 * 凭据：lib-cf-auth.mjs 解析（CLOUDFLARE_API_TOKEN 或 CLOUDFLARE_EMAIL+CLOUDFLARE_API_KEY）。
 * 口径与已知坑：
 *  - httpRequests1dGroups：免费套餐可读，按日聚合；pageViews 仅统计 HTML 的 200 GET（浏览器类 UA），可当“真人页面浏览”的上界；
 *    uniq.uniques 是 CF 按 IP 估算的唯一访客，含 bot。
 *  - httpRequestsAdaptiveGroups：免费套餐窗口有限（常见仅最近 1~3 天，视账号），超窗口会报错，脚本会降级并在输出里标 error，不静默。
 *  - bot 分数（botScore）需 Bot Management 付费；免费套餐只能用 verifiedBotCategory + UA 家族区分，只能给“浏览器 vs 非浏览器”口径。
 *  - rumPageloadEventsAdaptiveGroups：Web Analytics 入库；空数组 = 未入库（不是 0 访问）。
 * 验证日期：2026-10-30（effect.video）。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cfAuthHeaders, resolveCfAccountId } from './lib-cf-auth.mjs'

const args = process.argv.slice(2)
const opt = {}
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--') || args[i + 1] === undefined) throw new Error(`参数错误：${args[i]}`)
  opt[args[i].slice(2)] = args[++i]
}
if (!opt.zone) throw new Error('缺少 --zone <域名>')
const days = Number(opt.days || 7)
const base = 'https://api.cloudflare.com/client/v4'
const headers = { ...cfAuthHeaders(), 'content-type': 'application/json' }
const api = async (path) => (await fetch(base + path, { headers })).json()
const gql = async (query, variables) => {
  const r = await fetch(base + '/graphql', { method: 'POST', headers, body: JSON.stringify({ query, variables }) })
  return r.json()
}
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10)
const out = { zone: opt.zone, days, capturedAt: new Date().toISOString(), range: { from: day(-days), to: day(-1) } }

const z = await api(`/zones?name=${encodeURIComponent(opt.zone)}`)
const zone = z.result?.[0]
if (!zone) throw new Error(`找不到 zone：${opt.zone}（${JSON.stringify(z.errors || [])}）`)
out.zoneTag = zone.id
out.plan = zone.plan?.name

// 1) 按日聚合
const q1 = `query($z:String!,$a:Date!,$b:Date!){viewer{zones(filter:{zoneTag:$z}){httpRequests1dGroups(limit:100,filter:{date_geq:$a,date_leq:$b},orderBy:[date_ASC]){dimensions{date} sum{requests cachedRequests pageViews threats bytes responseStatusMap{edgeResponseStatus requests} countryMap{clientCountryName requests} browserMap{uaBrowserFamily pageViews}} uniq{uniques}}}}}`
out.daily = await gql(q1, { z: zone.id, a: out.range.from, b: out.range.to })

// 2) Adaptive：路径/国家/UA/ASN/referer/verified bot/botScore（窗口受限：先试 --days，失败逐级降到 3d、1d，并记录实际窗口）
const adaptive = async (dims, label, extraFilter = '') => {
  for (const d of [days, 3, 1].filter((v, i, a) => a.indexOf(v) === i)) {
    const since = new Date(Date.now() - d * 86400000).toISOString()
    const until = new Date().toISOString()
    const q = `query($z:String!,$a:Time!,$b:Time!){viewer{zones(filter:{zoneTag:$z}){httpRequestsAdaptiveGroups(limit:30,filter:{datetime_geq:$a,datetime_leq:$b${extraFilter}},orderBy:[count_DESC]){count dimensions{${dims}}}}}}`
    const r = await gql(q, { z: zone.id, a: since, b: until })
    if (!r.errors?.length) { r.windowDays = d; out[label] = r; return }
    out[label] = { ...r, windowDays: d }
  }
}
const HTML200 = ',edgeResponseContentTypeName:"html",edgeResponseStatus:200'
await adaptive('clientRequestPath', 'adaptive_paths_all')
await adaptive('clientRequestPath', 'adaptive_paths_html200', HTML200)
await adaptive('verifiedBotCategory', 'adaptive_verified_bot')
await adaptive('userAgent', 'adaptive_ua')
await adaptive('clientCountryName', 'adaptive_country')
await adaptive('clientASNDescription', 'adaptive_asn_html200', HTML200)
await adaptive('clientRefererHost', 'adaptive_referer_html200', HTML200)
await adaptive('botScoreBucketBy10 jsDetectionPassed', 'adaptive_botscore_html200', HTML200)
await adaptive('userAgentBrowser', 'adaptive_browser_html200', HTML200)
await adaptive('clientDeviceType', 'adaptive_device_html200', HTML200)

// 3) Web Analytics (RUM) 入库
const until = new Date().toISOString()
if (opt['rum-site-tag']) {
  const accountId = await resolveCfAccountId({ headers })
  const q3 = `query($acc:String!,$tag:String!,$a:Time!,$b:Time!){viewer{accounts(filter:{accountTag:$acc}){rumPageloadEventsAdaptiveGroups(limit:20,filter:{siteTag:$tag,datetime_geq:$a,datetime_leq:$b},orderBy:[count_DESC]){count sum{visits} dimensions{countryName requestPath refererHost}}}}}`
  out.rum = await gql(q3, { acc: accountId, tag: opt['rum-site-tag'], a: new Date(Date.now() - days * 86400000).toISOString(), b: until })
}

if (opt.out) {
  mkdirSync(resolve(opt.out), { recursive: true })
  writeFileSync(resolve(opt.out, `cf-traffic-${opt.zone}-${day(0)}.json`), JSON.stringify(out, null, 2))
}
console.log(JSON.stringify(out, null, 1).slice(0, Number(opt.max || 60000)))
