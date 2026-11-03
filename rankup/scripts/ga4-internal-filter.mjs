#!/usr/bin/env node
/**
 * ga4-internal-filter.mjs —— GA4「内部流量规则 + Internal Traffic 数据过滤器」的读取 / 建规则 / 激活。
 * 驱动用户已登录的 Chrome（opencli），不需要 API token。中文界面。
 *
 * 用法：
 *   node ga4-internal-filter.mjs status      --account A --property P --stream S
 *   node ga4-internal-filter.mjs ensure-rule --account A --property P --stream S [--ip auto|<ipv4>] [--rule-name ev-dev-mac-egress]
 *   node ga4-internal-filter.mjs activate    --account A --property P --stream S
 *
 *   status       只读：打印过滤器行（名称/类型/运算/状态）、过滤器匹配的 traffic_type 值、内部流量规则
 *                （规则名、traffic_type、条件类型+脱敏 IP）。不改任何东西。
 *   ensure-rule  没有任何内部流量规则 → 新建一条（traffic_type 取过滤器参数值，默认 internal；IP「等于」本机出口 IP，精确匹配）；
 *                已有规则且已含该 IP → 不动；已有规则但不含该 IP → 退出码 3，不改（追加条件的路径没实现，先人工看规则是否过宽）。
 *   activate     把 Internal Traffic 过滤器从「测试」切到「有效」（不可逆、不可回溯）。先核对：存在 traffic_type 与过滤器参数值一致的规则，
 *                否则退出码 4 不动。已是有效则不动。
 *   --ip auto    用 curl https://api.ipify.org 取本机出口 IP（默认）。IP 只用于填表和比对，输出一律脱敏成前两段。
 *   --session    opencli 会话名，默认 ev-ga4-filter-<4 个随机字母>；用完 close。
 *
 * 退出码：0 成功/无需改动；2 页面结构读不到（界面改版）；3 规则存在但不含本机 IP；4 激活前置不满足。
 *
 * ── 已知坑（2026-10-30 实测，effect.video）──
 *  - 管理首页（#/…/admin）的链接组渲染为空、顶部搜索报「内部错误」，不能点导航；过滤器页只能直链
 *    #/a<acct>p<prop>/admin/datapolicies/datafilters（路由从 GA 前端 JS 里 grep 出来的）。
 *  - 内部流量规则不在管理页里：数据流行 → 抽屉「配置代码设置」→ 跨域 iframe（tagmanager.google.com/lite）里点「展开」→「指定内部流量」。
 *    iframe 内只能用 `eval --frame <N>`（原生 setter + input/change/blur 事件填表）；opencli fill/type 不带 --frame。
 *  - 规则表单默认匹配类型是「IP 地址在以下范围内（CIDR）」，必须改成「IP 地址等于」；traffic_type 默认已是 internal。
 *  - 抽屉右上角与底层列表各有一个「创建」按钮，提交的是 getBoundingClientRect().top < 40 的那个。
 *  - 启用过滤器会弹确认框「启用过滤器？…无法撤销…不具有追溯性」，要再点「启用过滤器」。
 *  - 规则/过滤器生效有延迟（数小时到约 24 小时）；页面显示已启用不等于已排除，别据此推断。
 *  - 不要打开 admin/property/settings（页面上有「移入回收站」/「移动媒体资源」）。
 * 验证日期：2026-10-30（property 557873305；status / ensure-rule(无需改动路径) / activate(无需改动路径) 真实跑过；
 *   新建规则与激活的写路径是同日在 opencli 里手工逐步执行后沉淀的）。
 */
import { spawnSync, execFileSync } from 'node:child_process'

const argv = process.argv.slice(2)
const action = argv[0]
if (!['status', 'ensure-rule', 'activate'].includes(action)) {
  console.error('用法: ga4-internal-filter.mjs status|ensure-rule|activate --account A --property P --stream S [--ip auto|x.x.x.x] [--rule-name N] [--session S]')
  process.exit(1)
}
const opt = {}
for (let i = 1; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || argv[i + 1] === undefined) { console.error(`参数错误：${argv[i]}`); process.exit(1) }
  opt[argv[i].slice(2)] = argv[i + 1]
}
for (const k of ['account', 'property', 'stream']) if (!opt[k]) { console.error(`缺少 --${k}`); process.exit(1) }
const letters = () => Array.from({ length: 4 }, () => 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]).join('')
const session = opt.session || `ev-ga4-filter-${letters()}`
const ruleName = opt['rule-name'] || 'ev-dev-mac-egress'
const base = `https://analytics.google.com/analytics/web/#/a${opt.account}p${opt.property}`
const sleep = (s) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, s * 1000)
const mask = (s) => String(s).replace(/\b(\d{1,3}\.\d{1,3})\.\d{1,3}\.\d{1,3}\b/g, '$1.x.x')

function oc(...a) {
  const r = spawnSync('opencli', ['browser', session, ...a], { encoding: 'utf8', timeout: 120000 })
  return (r.stdout || '').trim()
}
function ev(js, frame) {
  return oc('eval', ...(frame == null ? [] : ['--frame', String(frame)]), js)
}
function poll(fn, { tries = 20, every = 1.5 } = {}) {
  for (let i = 0; i < tries; i++) { const v = fn(); if (v) return v; sleep(every) }
  return null
}
function frameIndex() {
  const out = oc('frames')
  const i = out.indexOf('[')
  if (i < 0) return null
  try { return JSON.parse(out.slice(i, out.lastIndexOf(']') + 1)).find((f) => f.url.includes('tagmanager.google.com/lite'))?.index ?? null } catch { return null }
}

// ── 过滤器 ───────────────────────────────────────────────
function openFilters() {
  oc('open', `${base}/admin/datapolicies/datafilters`)
  sleep(10)
  const rows = poll(() => {
    const t = ev(`JSON.stringify([...document.querySelectorAll('mat-row')].map(r=>r.innerText.replace(/\\s+/g,' ').trim()))`)
    try { const a = JSON.parse(t); return a.length ? a : null } catch { return null }
  })
  if (!rows) throw Object.assign(new Error('读不到过滤器行（界面改版或未加载）'), { code: 2 })
  return rows
}
function openFilterEditor() {
  ev(`document.querySelector('mat-row').click(); 'x'`)
  const state = poll(() => {
    // 6 个 mat-radio-button：前 3 个是过滤器类型（开发者/内部/主机名），后 3 个是状态（测试/有效/未启用）
    const t = ev(`(()=>{const rs=[...document.querySelectorAll('mat-radio-button')];if(rs.length<6)return '';const sm=(document.body.innerText.match(/排除参数[^\\n]*/)||[''])[0];return JSON.stringify({type:rs.slice(0,3).filter(r=>r.classList.contains('mat-mdc-radio-checked')).map(r=>r.textContent.trim().slice(0,6)),checked:rs.slice(3).filter(r=>r.classList.contains('mat-mdc-radio-checked')).map(r=>r.textContent.trim().slice(0,6)),param:(sm.match(/确切值为\\s*(\\S+)\\s*的事件/)||[])[1]||'',summary:sm})})()`)
    try { return JSON.parse(t) } catch { return null }
  })
  if (!state) throw Object.assign(new Error('读不到过滤器编辑面板'), { code: 2 })
  return state
}

// ── 内部流量规则（数据流抽屉 → 配置代码设置 → iframe）───────────────
function openRulesPanel() {
  oc('open', `${base}/admin/streams/table`)
  sleep(10)
  if (!poll(() => ev(`!!document.querySelector('mat-row')`) === 'true')) throw Object.assign(new Error('数据流列表未加载'), { code: 2 })
  ev(`document.querySelector('mat-row').click(); 'x'`)
  sleep(6)
  ev(`(()=>{const s=[...document.querySelectorAll('slat')].find(e=>e.textContent.includes('配置代码设置'));if(s)s.click();return !!s})()`)
  const fi = poll(() => frameIndex(), { tries: 15, every: 2 })
  if (fi == null) throw Object.assign(new Error('没出现 tagmanager lite iframe'), { code: 2 })
  // 展开设置列表，再点「指定内部流量」
  poll(() => ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='展开');if(!b)return /指定内部流量/.test(document.body.innerText);b.click();return false})()`, fi) === 'true' || (sleep(1), ev(`/指定内部流量/.test(document.body.innerText)`, fi) === 'true'), { tries: 10, every: 2 })
  ev(`(()=>{const el=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()==='指定内部流量');if(!el)return false;(el.closest('button,[role=button],a,[role=listitem]')||el).click();return true})()`, fi)
  poll(() => ev(`/内部流量规则/.test(document.body.innerText)`, fi) === 'true', { tries: 10, every: 1.5 })
  sleep(2)
  return fi
}
function readRuleList(fi) {
  const t = ev(`document.body.innerText`, fi)
  const s = t.slice(t.lastIndexOf('内部流量规则'))
  if (/尚未创建规则/.test(s)) return []
  const lines = s.split('\n').map((x) => x.trim()).filter(Boolean)
  const h = lines.indexOf('traffic_type 值')
  const body = h >= 0 ? lines.slice(h + 1) : []
  const rules = []
  for (let i = 0; i + 2 < body.length; i += 3) if (/^\d+$/.test(body[i])) rules.push({ order: body[i], name: body[i + 1], trafficType: body[i + 2] })
  return rules
}
function readRuleConditions(fi, name) {
  ev(`(()=>{const r=[...document.querySelectorAll('*')].find(e=>e.children.length===0&&e.textContent.trim()===${JSON.stringify(name)});if(!r)return false;(r.closest('tr,[role=row],a,button,div[role=button]')||r).click();return true})()`, fi)
  sleep(4)
  const t = ev(`(()=>{const sels=[...document.querySelectorAll('select')].map(s=>s.options[s.selectedIndex]?.textContent.trim()||'');const ins=[...document.querySelectorAll('input')].map(i=>i.value).filter(Boolean);return JSON.stringify({sels,ins})})()`, fi)
  try {
    const { sels, ins } = JSON.parse(t) // ins = [规则名, traffic_type, 条件值...]
    return { trafficType: ins[1], conds: sels.map((type, i) => ({ type, value: ins[2 + i] || '' })) }
  } catch { return null }
}
function readRules() {
  const fi = openRulesPanel()
  const rules = readRuleList(fi)
  const detail = []
  for (let i = 0; i < rules.length; i++) {
    const f2 = i === 0 ? fi : openRulesPanel()
    detail.push({ ...rules[i], cond: readRuleConditions(f2, rules[i].name) })
  }
  return detail
}

function myIp() {
  if (opt.ip && opt.ip !== 'auto') return opt.ip
  return execFileSync('curl', ['-s', '-m', '10', 'https://api.ipify.org'], { encoding: 'utf8' }).trim()
}

let exitCode = 0
const report = { action, session, at: new Date().toISOString() }
try {
  if (action === 'status' || action === 'activate') {
    report.filters = openFilters().map(mask)
  }
  if (action === 'status') {
    const st = openFilterEditor()
    report.filterEditor = { type: st.type, status: st.checked, trafficTypeParam: st.param, summary: st.summary }
    report.rules = readRules().map((d) => ({ order: d.order, name: d.name, trafficType: d.trafficType, conditions: d.cond ? d.cond.conds.map((c) => `${c.type} ${mask(c.value)}`) : null }))
  } else if (action === 'ensure-rule') {
    const ip = myIp()
    const fi = openRulesPanel()
    const rules = readRuleList(fi)
    if (rules.length === 0) {
      ev(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='创建'&&b.offsetParent);if(b)b.click();return !!b})()`, fi)
      sleep(4)
      const filled = ev(`(()=>{
        const set=(el,v)=>{const p=el.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(el,v);['input','change','blur'].forEach(t=>el.dispatchEvent(new Event(t,{bubbles:true})))};
        const ins=[...document.querySelectorAll('input')];
        const name=ins.find(e=>e.placeholder==='示例：公司总部'), val=ins.find(e=>e.placeholder==='示例：192.0.2.0/24'), sel=document.querySelector('select');
        if(!name||!val||!sel)return 'missing-fields';
        const opt=[...sel.options].find(o=>o.textContent.trim()==='IP 地址等于'); if(!opt)return 'missing-equals-option';
        set(sel,opt.value); set(name,${JSON.stringify(ruleName)}); set(val,${JSON.stringify(ip)});
        const tt=ins.find(e=>e.value==='internal');
        return 'ok tt='+(tt?'internal':'?')+' sel='+sel.options[sel.selectedIndex].textContent.trim()
      })()`, fi)
      report.fill = filled
      if (!filled.startsWith('ok')) throw Object.assign(new Error('填表失败：' + filled), { code: 2 })
      sleep(1)
      const clicked = ev(`(()=>{const bs=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='创建'&&!b.disabled&&b.offsetParent&&Math.round(b.getBoundingClientRect().top)<40);if(bs.length!==1)return 'n='+bs.length;bs[0].click();return 'clicked'})()`, fi)
      if (clicked !== 'clicked') throw Object.assign(new Error('找不到唯一的提交「创建」按钮：' + clicked), { code: 2 })
      sleep(5)
      report.created = readRuleList(fi)
      report.result = 'created'
    } else {
      let has = false
      for (const r of rules) {
        const f2 = r === rules[0] ? fi : openRulesPanel()
        const c = readRuleConditions(f2, r.name)
        if (c && c.conds.some((x) => x.type === 'IP 地址等于' && x.value === ip)) has = true
      }
      report.rules = rules
      report.result = has ? 'already-contains-ip' : 'rule-exists-without-ip'
      if (!has) exitCode = 3
    }
    report.ip = mask(ip)
  } else if (action === 'activate') {
    const st = openFilterEditor()
    report.before = st.checked
    if (st.checked.some((s) => s.startsWith('有效'))) { report.result = 'already-active' }
    else {
      const fi = openRulesPanel()
      const rules = readRuleList(fi)
      if (!rules.some((r) => r.trafficType === st.param)) { report.result = `prereq-failed: 无 traffic_type=${st.param} 的规则`; exitCode = 4 }
      else {
        openFilters(); openFilterEditor()
        ev(`(()=>{const r=[...document.querySelectorAll('mat-radio-button')].find(e=>e.textContent.trim().startsWith('有效'));const i=r.querySelector('input');i.scrollIntoView({block:'center'});i.click();return true})()`)
        sleep(1)
        ev(`(()=>{const b=[...document.querySelectorAll('ga-slider-panel-container button')].find(b=>b.textContent.trim()==='保存'&&!b.disabled);if(b)b.click();return !!b})()`)
        sleep(3)
        ev(`(()=>{const b=[...document.querySelectorAll('mat-dialog-container button')].find(b=>b.textContent.trim()==='启用过滤器');if(b)b.click();return !!b})()`)
        sleep(6)
        report.after = openFilters().map(mask)
        report.result = report.after.some((r) => /已启用/.test(r)) ? 'activated' : 'not-confirmed'
        if (report.result !== 'activated') exitCode = 2
      }
    }
  }
} catch (e) {
  report.error = String(e.message || e)
  exitCode = e.code || 2
} finally {
  oc('close')
}
console.log(JSON.stringify(report, null, 2))
process.exit(exitCode)
