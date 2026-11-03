#!/usr/bin/env node
/**
 * 只读读取 GA4 标准报表（已登录 Chrome + opencli）：按日趋势 / 渠道 / 来源媒介 / 着陆页 / 国家 / 实时。
 * 用法：
 *   node ga4-report-readback.mjs --account 284256639 --property 557873305 --from 2026-10-06 --to 2026-10-29 \
 *        --mode daily|channel|sourcemedium|landing|country|realtime --out <目录> [--session ga4-readback-xxx] [--rows 50]
 * 输出：<out>/ga4-<mode>-<from>-<to>.json（解析后的行）+ .txt（页面文本原文），stdout 打印摘要。
 * 依赖：Chrome 已登录有权限的 Google 账号；中文界面（"总计""会话数"等关键字）。不改任何 GA4 设置。
 * 已知坑：
 *  - 打开 analytics.google.com 默认落在最近访问的媒体资源；脚本用「通用选择器」搜 property id 后点击进入，再用 location.hash 切报表。
 *  - daily 模式 = 每天一次 landing-page 报表读「总计」行（会话/活跃用户/新用户），一天约 12 秒，24 天约 5 分钟；GA4 标准报表无日期维度表格。
 *  - 切主维度（来源/媒介）靠点维度下拉 + 文本点击；界面改版时可能失效，失败会在 json 里 error 标记，不静默。
 *  - 数据延迟：GA4 当天数据不完整，to 一般取昨天。
 * 验证日期：2026-10-30（effect.video，property 557873305）。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = {}
for (let i = 0; i < args.length; i++) {
  if (!args[i].startsWith('--') || args[i + 1] === undefined) throw new Error(`参数错误：${args[i]}`)
  opt[args[i].slice(2)] = args[++i]
}
for (const k of ['account', 'property', 'from', 'to', 'mode', 'out']) if (!opt[k]) throw new Error(`缺少 --${k}`)
const MODES = ['daily', 'channel', 'sourcemedium', 'landing', 'country', 'realtime']
if (!MODES.includes(opt.mode)) throw new Error(`--mode 仅支持 ${MODES.join(',')}`)
const session = opt.session || `ga4-readback-${opt.property}-${Math.random().toString(36).slice(2, 6)}`
const out = resolve(opt.out)
mkdirSync(out, { recursive: true })
const d8 = (s) => s.replace(/-/g, '')
const sleep = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000)

function oc(...a) {
  const r = spawnSync('opencli', ['browser', session, ...a], { encoding: 'utf8', timeout: 120000 })
  return (r.stdout || '') + (r.stderr || '')
}
function extractContent() {
  const raw = oc('extract')
  const i = raw.indexOf('{'), j = raw.lastIndexOf('}')
  if (i < 0) return ''
  try { return JSON.parse(raw.slice(i, j + 1)).content.replace(/\n\s*\n/g, '\n') } catch { return '' }
}
const hashOf = (report, coll, a, b) =>
  `#/a${opt.account}p${opt.property}/reports/explorer?params=_u..nav%3Dmaui%26_u.date00%3D${a}%26_u.date01%3D${b}&r=${report}&collectionId=${coll}`
function gotoHash(h) { oc('eval', `location.hash='${h}'; 'ok'`) }
function clickText(text) {
  return oc('eval', `(()=>{const els=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&e.textContent.trim()==='${text}');els.forEach(e=>e.click());return els.length})()`)
}

// 进入目标媒体资源（通用选择器搜 property id）
function enterProperty() {
  oc('open', `https://analytics.google.com/analytics/web/#/a${opt.account}p${opt.property}/reports/intelligenthome`)
  sleep(9)
  const cur = oc('eval', 'location.hash')
  if (cur.includes(`p${opt.property}`)) return true
  oc('click', 'button[aria-label*=通用选择器]')
  sleep(2)
  const find = oc('find', '--css', 'input.gmp-search-input')
  const ref = /"ref":\s*(\d+)/.exec(find)?.[1]
  if (!ref) return false
  oc('type', ref, opt.property)
  sleep(3)
  const link = /"ref":\s*(\d+)/.exec(oc('find', '--css', `a[href*=p${opt.property}]`))?.[1]
  if (!link) return false
  oc('click', link)
  sleep(9)
  return oc('eval', 'location.hash').includes(`p${opt.property}`)
}

// 解析 explorer 表：返回 {total:[..], rows:[[idx,name,...]]}
function parseTable(content) {
  const t = content.split('\n')
  const i = t.indexOf('总计')
  if (i < 0) return null
  const body = t.slice(i)
  const rows = []
  for (let j = 14; j < body.length; j++) {
    if (/^\d+$/.test(body[j]) && body[j + 1] && !body[j + 1].startsWith('©')) {
      rows.push(body.slice(j + 1, j + 10))
    }
  }
  return { total: body.slice(1, 9), rows }
}

const result = { mode: opt.mode, property: opt.property, from: opt.from, to: opt.to, capturedAt: new Date().toISOString() }
try {
  if (!enterProperty()) throw new Error('无法进入目标媒体资源（通用选择器失败）')
  if (opt.mode === 'realtime') {
    gotoHash(`#/a${opt.account}p${opt.property}/realtime/overview`)
    sleep(12)
    const c = extractContent()
    writeFileSync(`${out}/ga4-realtime.txt`, c)
    result.text = c.slice(0, 1500)
  } else if (opt.mode === 'daily') {
    result.days = []
    const start = new Date(opt.from + 'T00:00:00Z'), end = new Date(opt.to + 'T00:00:00Z')
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      const day = d.toISOString().slice(0, 10)
      gotoHash(hashOf('landing-page', 'business-objectives', d8(day), d8(day)))
      sleep(11)
      const tb = parseTable(extractContent())
      // landing-page 报表总计行：total=[会话,占比,活跃用户,占比,新用户,占比,...]，取 [0],[2],[4]
      const num = (v) => (v && /^[\d,]+$/.test(v) ? Number(v.replace(/,/g, '')) : 0) // 当天无数据时总计行没有数值，记 0
      result.days.push(tb ? { day, sessions: num(tb.total[0]), activeUsers: num(tb.total[2]), newUsers: num(tb.total[4]) } : { day, error: '未读到总计行' })
      console.log(JSON.stringify(result.days.at(-1)))
    }
  } else {
    const spec = {
      channel: ['lifecycle-traffic-acquisition-v2', 'life-cycle', null],
      sourcemedium: ['lifecycle-traffic-acquisition-v2', 'life-cycle', '带来会话的来源/媒介'],
      landing: ['landing-page', 'business-objectives', null],
      country: ['user-demographics-detail', 'users', null],
    }[opt.mode]
    gotoHash(hashOf(spec[0], spec[1], d8(opt.from), d8(opt.to)))
    sleep(14)
    if (spec[2]) {
      oc('click', 'ga-dimension-picker, [aria-label*="带来会话的主渠道组"]')
      sleep(2)
      const n = clickText(spec[2])
      result.dimensionClick = n.trim()
      sleep(6)
    }
    // 把每页行数调大（默认 10 行会截断来源/国家等长表）；找不到控件时保持原样并在输出里标记 rowsClick
    const rp = oc('eval', `(()=>{const sel=[...document.querySelectorAll('mat-select,ga-paginator mat-select,[aria-label*="每页行数"]')].find(e=>/每页行数|10/.test((e.getAttribute('aria-label')||'')+e.textContent));if(!sel)return 'no-select';sel.click();return 'opened'})()`)
    result.rowsClick = rp.trim().slice(0, 40)
    if (rp.includes('opened')) {
      sleep(1)
      oc('eval', `(()=>{const o=[...document.querySelectorAll('mat-option')].find(e=>e.textContent.trim()==='${opt.rows || 50}');if(o)o.click();return !!o})()`)
      sleep(5)
    }
    const c = extractContent()
    writeFileSync(`${out}/ga4-${opt.mode}-${opt.from}-${opt.to}.txt`, c)
    result.table = parseTable(c) || { error: '未读到表格' }
  }
} catch (e) {
  result.error = String(e.message || e)
} finally {
  oc('close')
}
writeFileSync(`${out}/ga4-${opt.mode}-${opt.from}-${opt.to}.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result).slice(0, 1500))
if (result.error) process.exit(2)
