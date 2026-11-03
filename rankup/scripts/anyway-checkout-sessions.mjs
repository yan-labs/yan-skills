#!/usr/bin/env node
/**
 * anyway-checkout-sessions.mjs
 *
 * 用途：只读导出 https://app.anyway.sh/checkout-sessions 的全部结账会话（Anyway 没有
 *       Merchant API 能列会话，只能读后台页面），逐行点开右侧详情，输出 JSON 供分类。
 *       每行 = 列表七列（创建时间/商品/类型/状态/支付方式/金额/订单）
 *              + 详情（会话 ID、Payment Link ID、商户业务单号、过期时间、商品/价格 ID、客户、订单、metadata）。
 *
 * 用法：node anyway-checkout-sessions.mjs --out <json 路径> [--session <名>] [--no-detail] [--max-pages N]
 *
 * 登录态：本机 Chrome 已登录 app.anyway.sh（opencli 专用窗口，不抢焦点）。会话名默认
 *         anyway-sessions-<suffix>，跑完 finally 里 close。只读：不点付款/退款/删除/设置，
 *         也不点详情里的“刷新”按钮；仅点击 来源下拉、分页数字、表格行、详情“关闭”。
 *
 * 已知坑（2026-10-30 实测）：
 *   1. 来源下拉默认“API 创建”，该项下为空；必须切到“全部来源”，Payment Link 的会话才出现。
 *   2. 页面时间是浏览器本地时区（此机 Chrome = Asia/Bangkok UTC+7，不是北京时间），
 *      脚本把浏览器时区一并写进输出 meta.browserTz，换算由调用方负责。
 *   3. 分页是 <a href="#">，只露出 1 2 … N；逐页点“下一个数字”即可，eval 里 .click() 有效。
 *   4. 详情是无 role 的 <section>（含 h2“会话详情”），行用 tr.click() 触发，轮询会话 ID 变化再读。
 *   5. 客户邮箱若出现在详情里会被脱敏成 x***@domain 后再落盘。
 *   6. 会话 ID 有两种前缀：CS…（新）和 CKA…（早期，无购买快照、商品列显示“—”，详情页写“这条早期会话没有保存购买快照”）。
 *
 * 验证：2026-10-30 全量 9 页成功（见 ~/.agent-reports/2026-10-30/anyway-sessions-triage.md）。
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined }
const OUT = flag('--out')
if (!OUT) { console.error('需要 --out <json 路径>'); process.exit(2) }
const NO_DETAIL = argv.includes('--no-detail')
const MAX_PAGES = Number(flag('--max-pages') || 0)
const suffix = (process.env.OPENCLI_SESSION_SUFFIX || process.env.CLAUDE_CODE_SESSION_ID || `p${process.ppid}`).replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'local'
const SESSION = flag('--session') || `anyway-sessions-${suffix}`
const URL = 'https://app.anyway.sh/checkout-sessions'
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

function oc(parts, timeout = 90000) {
  const r = spawnSync('opencli', ['browser', SESSION, '--window', 'dedicated', ...parts], { encoding: 'utf8', timeout, maxBuffer: 50 * 1024 * 1024 })
  if (r.status !== 0) throw new Error(`opencli ${parts[0]} failed: ${(r.stderr || r.stdout || '').slice(0, 300)}`)
  return r.stdout
}
function firstJson(text) {
  const s = String(text)
  const start = [...s].findIndex((c) => c === '{' || c === '[')
  if (start < 0) return null
  let depth = 0, q = false, esc = false
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (q) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') q = false; continue }
    if (c === '"') q = true
    else if (c === '{' || c === '[') depth++
    else if (c === '}' || c === ']') { depth--; if (depth === 0) return JSON.parse(s.slice(start, i + 1)) }
  }
  return null
}
function ev(js, timeout) {
  const out = oc(['eval', js], timeout).split('\n').filter((l) => !/^\s*(Update available|Run: npm)/.test(l)).join('\n').trim()
  try { return JSON.parse(out) } catch { /* 非纯 JSON，退回首个 JSON 片段或原文 */ }
  return firstJson(out) ?? out
}
const mask = (v) => String(v).replace(/([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+)/g, '$1***@$2')

const LABELS = ['会话 ID', '类型', 'Payment Link', '支付方式', '商户业务单号', '创建时间', '过期时间', '商品', '数量', '商品 ID', '价格 ID', '价格类型', '客户', '订单', 'merchant_reference']
function parseDetail(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean)
  const kv = {}
  for (let i = 0; i < lines.length - 1; i++) {
    if (LABELS.includes(lines[i]) && !(lines[i] in kv)) kv[lines[i]] = mask(lines[i + 1])
  }
  const meta = lines.slice(lines.indexOf('商户 metadata') + 1).map(mask)
  return { kv, metadata: lines.includes('商户 metadata') ? meta : [] }
}

const ROWS_JS = `(()=>Array.from(document.querySelectorAll('tbody tr')).map(tr=>Array.from(tr.querySelectorAll('td')).map(td=>td.innerText.trim())))()`
const detailJs = (from, to) => `(async()=>{const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const panel=()=>{const h=Array.from(document.querySelectorAll('h2')).find(e=>e.textContent.trim()==='会话详情');return h?h.closest('section'):null};
const sid=p=>{const m=p&&p.innerText.match(/会话 ID\\s*\\n\\s*(C[A-Z]\\w+)/);return m?m[1]:null};
const closeP=async()=>{for(let k=0;k<10&&panel();k++){const b=Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')==='关闭');if(b)b.click();await sleep(250)}};
const out=[];const getRows=()=>document.querySelectorAll('tbody tr');
for(let i=${from};i<Math.min(${to},getRows().length);i++){
  const prod=getRows()[i].querySelectorAll('td')[1].innerText.trim();const ct=getRows()[i].querySelectorAll('td')[0].innerText.trim();
  let cur=null,txt=null,ok=false;
  for(let attempt=0;attempt<3&&!ok;attempt++){
    await closeP();await sleep(200);getRows()[i].click();
    for(let t=0;t<30;t++){await sleep(150);const p=panel();cur=sid(p);if(cur){await sleep(250);txt=panel().innerText;break}}
    ok=!!(txt&&txt.includes(prod)&&txt.includes(ct));
  }
  out.push({i,sid:cur,changed:ok,text:txt});
}
await closeP();
return out})()`

const result = { meta: { url: URL, capturedAt: new Date().toISOString(), session: SESSION }, pages: [], rows: [] }
try {
  oc(['open', URL])
  for (let t = 0; t < 30; t++) { const n = ev(`(()=>({n:document.querySelectorAll('tbody tr').length,empty:/没有找到结账会话/.test(document.body.innerText)}))()`); if (n && (n.n > 0 || n.empty)) break; sleep(1000) }
  result.meta.browserTz = ev(`(()=>({tz:Intl.DateTimeFormat().resolvedOptions().timeZone,offsetMin:-new Date().getTimezoneOffset()}))()`)
  // 来源切到“全部来源”
  oc(['click', 'button[aria-label=会话来源]']); sleep(700)
  oc(['click', '[role=option]', '--nth', '2']); sleep(1800)
  const src = ev(`(()=>document.querySelector('button[aria-label=会话来源]').innerText.trim())()`)
  result.meta.source = src
  if (!/全部来源/.test(JSON.stringify(src))) throw new Error('来源未切到全部来源: ' + JSON.stringify(src))
  for (let t = 0; t < 20; t++) { const n = ev(`document.querySelectorAll('tbody tr').length`); if (n > 0) break; sleep(1000) }
  const total = ev(`(()=>Math.max(...Array.from(document.querySelectorAll('a[data-slot=pagination-link]')).map(a=>+a.textContent.trim()||0)))()`)
  const last = MAX_PAGES > 0 ? Math.min(total, MAX_PAGES) : total
  result.meta.totalPages = total
  for (let p = 1; p <= last; p++) {
    if (p > 1) {
      const before = ev(`(()=>document.querySelector('tbody tr')?.innerText||'')()`)
      let clicked = false
      for (let t = 0; t < 10 && !clicked; t++) {
        clicked = ev(`(()=>{const a=Array.from(document.querySelectorAll('a[data-slot=pagination-link]')).find(x=>x.textContent.trim()==='${p}');if(!a)return false;a.click();return true})()`)
        if (!clicked) sleep(500)
      }
      if (!clicked) throw new Error('找不到页码 ' + p)
      for (let t = 0; t < 30; t++) { sleep(500); const cur = ev(`(()=>({cur:document.querySelector('a[aria-current=page]')?.textContent.trim(),first:document.querySelector('tbody tr')?.innerText||''}))()`); if (cur && cur.cur === String(p) && cur.first && cur.first !== before) break }
    }
    const rows = ev(ROWS_JS)
    result.pages.push({ page: p, count: rows.length })
    const details = []
    if (!NO_DETAIL) for (let from = 0; from < rows.length; from += 7) details.push(...ev(detailJs(from, from + 7), 120000))
    rows.forEach((r, idx) => {
      const d = details.find((x) => x.i === idx)
      const parsed = d && d.text ? parseDetail(d.text) : null
      result.rows.push({ page: p, idx, created: r[0], product: r[1], type: r[2], status: r[3], pay: r[4], amount: r[5], order: mask(r[6] || ''), detail: parsed, detailOk: !!(d && d.changed) })
    })
    process.stderr.write(`page ${p}/${last}: ${rows.length} rows\n`)
  }
  // 关闭详情
  try { ev(`(()=>{const b=Array.from(document.querySelectorAll('button')).find(b=>b.getAttribute('aria-label')==='关闭');if(b)b.click();return true})()`) } catch {}
} finally {
  spawnSync('opencli', ['browser', SESSION, 'close'], { encoding: 'utf8', timeout: 20000 })
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(result, null, 2))
  process.stderr.write(`wrote ${OUT}: ${result.rows.length} rows\n`)
}
