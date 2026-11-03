#!/usr/bin/env node
/**
 * 只读读取 Microsoft Clarity：仪表盘概览（会话/机器人排除/新老用户/来源/国家设备/热门页/智能事件）+ 录屏列表（解析为 JSON）
 * + 按智能事件过滤的录屏列表（谁触发了 generate_click / buy_click 等）。已登录 Chrome + opencli。
 * 用法：node clarity-recordings-readback.mjs --project ytxts178ng --name effect.video --days 7 --out <目录> \
 *          [--events generate_click,login_success,buy_click,pricing_view] [--session ev-clarity-xxx]
 * 输出：<out>/clarity-dashboard-<days>d.txt、clarity-recordings-<days>d.json、clarity-event-<event>-<days>d.json；stdout 摘要。
 * 已知坑（2026-10-30 验证）：
 *  - 必须先开 https://clarity.microsoft.com/projects 再点项目行（td[title="<name>"]），直接打开 dashboard URL 可能失败；之后 location.href 改 ?date=Last%207%20days 可用。
 *  - date 取值 "Last 3 days" / "Last 7 days" / "Last 30 days"；智能事件过滤用 &smartEvents=<name>，录屏页路径是 /impressions。
 *  - 仪表盘“会话 N / M 排除机器人会话”：N 为展示的会话数，M 为被 Clarity 判为机器人而排除的会话（不计入 N）。
 *  - 录屏列表是虚拟滚动，只解析已渲染的前若干条（通常≈全部 7 天数据，若“N 个结果”大于解析条数会在输出里标 truncated）。
 *  - 录屏时间按浏览器本地时区显示；不等于 UTC。
 * 不改任何 Clarity 设置，不下载录屏。
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
for (const k of ['project', 'name', 'out']) if (!opt[k]) throw new Error(`缺少 --${k}`)
const days = Number(opt.days || 7)
if (![3, 7, 30].includes(days)) throw new Error('--days 仅支持 3 / 7 / 30')
const events = (opt.events || '').split(',').map((s) => s.trim()).filter(Boolean)
const session = opt.session || `clarity-readback-${Math.random().toString(36).slice(2, 6)}`
const out = resolve(opt.out)
mkdirSync(out, { recursive: true })
const sleep = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000)
const oc = (...a) => {
  const r = spawnSync('opencli', ['browser', session, '--window', 'dedicated', ...a], { encoding: 'utf8', timeout: 120000 })
  return (r.stdout || '') + (r.stderr || '')
}
const bodyText = () => {
  const raw = oc('eval', 'document.body.innerText')
  const i = raw.indexOf('"'), j = raw.lastIndexOf('"')
  try { return JSON.parse(raw.slice(i, j + 1)) } catch { return raw.replace(/\\n/g, '\n') }
}
const dateQ = encodeURIComponent(`Last ${days} days`)
const base = `https://clarity.microsoft.com/projects/view/${opt.project}`

function parseRecordings(text) {
  const resultN = /(\d+)\s*个结果/.exec(text)?.[1]
  const recs = []
  for (const p of text.split('更多详细信息')) {
    const L = p.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!L.includes('进入:')) continue
    const e = L.indexOf('退出:')
    const uid = L.find((l) => l.startsWith('用户 ID'))
    const u = L.indexOf(uid)
    const refLine = L.findIndex((l) => l.startsWith('引用者:'))
    recs.push({
      entry: L[L.indexOf('进入:') + 1], exit: L[e + 1], time: L[e + 2], date: L[e + 3],
      ref: refLine >= 0 ? (L[refLine].slice(4).trim() || L[refLine + 1]) : '',
      dur: L[L.indexOf('持续时间:') + 1], clicks: Number(L[L.indexOf('点击:') + 1]), pages: Number(L[L.indexOf('页面:') + 1]),
      uid: uid.split(':')[1].trim(), country: L[u + 1], browser: L[u + 2], device: L[u + 3],
    })
  }
  return { total: resultN ? Number(resultN) : null, parsed: recs.length, truncated: resultN ? recs.length < Number(resultN) : null, recs }
}

const summary = { project: opt.project, days, capturedAt: new Date().toISOString() }
try {
  oc('open', 'https://clarity.microsoft.com/projects')
  sleep(8)
  oc('click', `td[title="${opt.name}"]`)
  sleep(8)
  oc('eval', `location.href='${base}/dashboard?date=${dateQ}'; 'ok'`)
  sleep(12)
  const dash = bodyText()
  writeFileSync(`${out}/clarity-dashboard-${days}d.txt`, dash)
  summary.sessions = /会话\n(\d+)\n(\d+) 排除机器人会话/.exec(dash)?.slice(1, 3) || null
  oc('eval', `location.href='${base}/impressions?date=${dateQ}'; 'ok'`)
  sleep(14)
  const rec = parseRecordings(bodyText())
  writeFileSync(`${out}/clarity-recordings-${days}d.json`, JSON.stringify(rec, null, 1))
  summary.recordings = { total: rec.total, parsed: rec.parsed, truncated: rec.truncated }
  for (const ev of events) {
    oc('eval', `location.href='${base}/impressions?date=${dateQ}&smartEvents=${encodeURIComponent(ev)}'; 'ok'`)
    sleep(13)
    const r = parseRecordings(bodyText())
    writeFileSync(`${out}/clarity-event-${ev}-${days}d.json`, JSON.stringify(r, null, 1))
    summary[`event_${ev}`] = r.parsed
  }
} catch (e) {
  summary.error = String(e.message || e)
} finally {
  oc('close')
}
console.log(JSON.stringify(summary))
if (summary.error) process.exit(2)
