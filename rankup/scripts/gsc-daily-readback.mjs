#!/usr/bin/env node
/**
 * 只读：GSC 效果报告的“按日”表 + 汇总卡（总点击/展示/CTR/平均排名），可带上一周期对比。已登录 Chrome + opencli。
 * 用法：node gsc-daily-readback.mjs --property sc-domain:example.com --days 28 [--compare] --out <目录> [--session 名]
 * 输出：<out>/gsc-daily-<days>d.json（totals + 每日行 {date,clicks,impressions,ctr,position}），stdout 摘要。
 * 补 gsc-export.mjs 的缺口：它不读按日趋势，且 compare 子表在中文界面报“未确认 query 维度表头”。
 * 已知坑（2026-10-30 验证）：
 *  - URL 参数 breakdown=date 直接给按日表；compare_date=PREV 时汇总卡变成“过去 28 天/先前 28 天”两个值。
 *  - GSC 数据滞后约 2 天，最后一行不是今天；站点首次出现数据之前的日期没有行（不是 0）。
 *  - 每日表在中文界面里每个值是独立块：日期、点击、展示、点击率、排名；无数据日显示“—”。
 * 验证：effect.video，2026-10-30。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const args = process.argv.slice(2)
const opt = { compare: false }
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--compare') { opt.compare = true; continue }
  if (!args[i].startsWith('--') || args[i + 1] === undefined) throw new Error(`参数错误：${args[i]}`)
  opt[args[i].slice(2)] = args[++i]
}
for (const k of ['property', 'out']) if (!opt[k]) throw new Error(`缺少 --${k}`)
const days = Number(opt.days || 28)
const session = opt.session || `gsc-daily-${Math.random().toString(36).slice(2, 6)}`
const out = resolve(opt.out)
mkdirSync(out, { recursive: true })
const sleep = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000)
const oc = (...a) => {
  const r = spawnSync('opencli', ['browser', session, '--window', 'dedicated', ...a], { encoding: 'utf8', timeout: 120000 })
  return (r.stdout || '') + (r.stderr || '')
}
const url = `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent(opt.property)}&num_of_days=${days}${opt.compare ? '&compare_date=PREV' : ''}&metrics=CLICKS%2CIMPRESSIONS%2CCTR%2CPOSITION&num_of_rows=500&breakdown=date`
const result = { property: opt.property, days, compare: opt.compare, capturedAt: new Date().toISOString() }
try {
  oc('open', url)
  sleep(8)
  const raw = oc('extract')
  const c = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)).content
  const grab = (label) => {
    const i = c.indexOf(label)
    if (i < 0) return null
    const seg = c.slice(i + label.length, i + label.length + 400).split('\n\n').map((s) => s.trim()).filter(Boolean)
    return opt.compare ? { current: seg[0], previous: seg[2] } : seg[0]
  }
  result.totals = { clicks: grab('总点击次数'), impressions: grab('总曝光次数'), ctr: grab('平均点击率'), position: grab('平均排名') }
  // 表头锚点：「天\n\n点击次数\n\n展示\n\n点击率\n\n排名\n\n」之后才是按日行
  const anchor = '点击次数\n\n展示\n\n点击率\n\n排名\n\n'
  const head = c.lastIndexOf(anchor)
  result.rows = []
  if (head >= 0) {
    const body = c.slice(head + anchor.length, c.indexOf('每页行数', head)).split('\n\n').map((s) => s.trim()).filter(Boolean)
    for (let i = 0; i + 4 < body.length; i += 5) {
      const m = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(body[i])
      if (!m) continue
      result.rows.push({ date: `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, clicks: body[i + 1], impressions: body[i + 2], ctr: body[i + 3], position: body[i + 4] })
    }
  }
  if (c.includes('表格已被忽略')) result.note = '界面提示“表格已被忽略，因为它不含任何其他信息”：对比周期无数据，没有按日行'
  if (!result.rows.length && !result.note) result.error = '未解析到按日行（界面改版或未加载完）'
} catch (e) {
  result.error = String(e.message || e)
} finally {
  oc('close')
}
writeFileSync(`${out}/gsc-daily-${days}d${opt.compare ? '-compare' : ''}.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ totals: result.totals, rows: result.rows?.length, first: result.rows?.at(-1)?.date, last: result.rows?.[0]?.date, error: result.error }))
if (result.error) process.exit(2)
