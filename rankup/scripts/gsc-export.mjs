#!/usr/bin/env node
/**
 * 只读导出 GSC 界面数据。依赖已登录 Chrome 的 opencli 专用窗口。
 * 用法：node scripts/gsc-export.mjs --property sc-domain:example.com --out ./gsc [--sections performance,countries,compare,slices,indexing,sitemaps,inspect] [--range 90d] [--langs es,zh-hant] [--countries esp,mex] [--top 10] [--inspect-urls url1,url2] [--session name] [--dry-run]
 * 未指定 langs 时从 pages URL 首段识别 xx 或 xx-yyyy；未指定 countries 时按 countries 表点击、展示排序取前 top 个。单跑 slices 也会先读取所需表。
 * GSC 只公开页面级 UI 的部分行；脚本按页面报告总行数核对，不把截断写成完整。
 * 支持中英文界面。验证日期：2026-09-28。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ALL = ['performance', 'countries', 'compare', 'slices', 'indexing', 'sitemaps', 'inspect']
const args = process.argv.slice(2)
const opt = {}
for (let i = 0; i < args.length; i++) {
  const key = args[i]
  if (key === '--dry-run') { opt.dryRun = true; continue }
  if (key === '--help' || key === '-h') { console.log('用法：node gsc-export.mjs --property <GSC资源> --out <目录> [--sections 列表] [--range 90d] [--langs es,zh-hant] [--countries esp,mex] [--top 10] [--inspect-urls URL,URL] [--session 名] [--dry-run]\n默认从 pages URL 首段识别 xx / xx-yyyy 语言前缀；无法识别则跳过语言切片并注明。国家按 countries 表点击、展示降序取前 --top 个（默认 10）；单跑 slices 会先读取所需表。'); process.exit(0) }
  if (!['--property','--out','--sections','--range','--langs','--countries','--top','--inspect-urls','--session'].includes(key) || !args[i + 1]) throw new Error(`未知或缺值参数：${key}`)
  opt[key.slice(2)] = args[++i]
}
if (!opt.property || !opt.out) throw new Error('必须提供 --property 和 --out')
if (!/^(sc-domain:[^\s/]+|https?:\/\/[^\s]+\/)$/i.test(opt.property)) throw new Error('--property 格式不正确')
const sections = opt.sections ? opt.sections.split(',').map(x => x.trim()) : ALL
if (!sections.length || sections.some(x => !ALL.includes(x))) throw new Error(`--sections 仅支持 ${ALL.join(',')}`)
const days = Number((opt.range || '90d').replace(/d$/, ''))
if (!Number.isInteger(days) || days < 1 || days > 3650 || !/^\d+d$/.test(opt.range || '90d')) throw new Error('--range 格式如 90d')
const inspectUrls = (opt['inspect-urls'] || '').split(',').map(x => x.trim()).filter(Boolean)
if (inspectUrls.some(x => !/^https?:\/\//.test(x))) throw new Error('--inspect-urls 必须是逗号分隔的完整 URL')
const langs = opt.langs?.split(',').map(x => x.trim().toLowerCase())
const countries = opt.countries?.split(',').map(x => x.trim().toLowerCase())
if (langs && (langs.some(x => !/^[a-z]{2}(?:-[a-z]{4})?$/.test(x)) || !langs.length)) throw new Error('--langs 必须是逗号分隔的 xx 或 xx-yyyy 路径前缀')
if (countries && (countries.some(x => !/^[a-z]{3}$/.test(x)) || !countries.length)) throw new Error('--countries 必须是逗号分隔的三字母 GSC 国家代码')
const top = Number(opt.top || 10)
if (!Number.isInteger(top) || top < 1 || (opt.top && !/^\d+$/.test(opt.top))) throw new Error('--top 必须是正整数')
const session = opt.session || `gsc-export-${opt.property.replace(/[^a-z0-9]+/gi, '-').slice(0, 22)}-${process.pid}`
const root = 'https://search.google.com/search-console/'
const resource = `resource_id=${encodeURIComponent(opt.property)}`
const reportUrl = (path) => `${root}${path}?${resource}`
const perfUrl = (breakdown, rowLimit, extra = {}, period = days) => {
  const u = new URL(reportUrl('performance/search-analytics'))
  u.searchParams.set('num_of_days', String(period))
  u.searchParams.set('metrics', 'CLICKS,IMPRESSIONS,CTR,POSITION')
  u.searchParams.set('num_of_rows', String(rowLimit))
  u.searchParams.set('breakdown', breakdown)
  for (const [k, v] of Object.entries(extra)) u.searchParams.set(k, v)
  return u.href
}
const urls = {
  performance: [perfUrl('query', 500), perfUrl('page', 500)],
  countries: [perfUrl('country', 500)],
  compare: [perfUrl('query', 250, { compare_date: 'PREV' }, 28)],
  indexing: [reportUrl('index')],
  sitemaps: [reportUrl('sitemaps')],
  inspect: [reportUrl('')]
}
// ISO 3166-1 alpha-2 → alpha-3；显示名由运行时 Intl 对照中文和英文 GSC 界面。
const isoCodes = 'AW:abw AF:afg AO:ago AI:aia AX:ala AL:alb AD:and AE:are AR:arg AM:arm AS:asm AQ:ata TF:atf AG:atg AU:aus AT:aut AZ:aze BI:bdi BE:bel BJ:ben BF:bfa BD:bgd BG:bgr BH:bhr BS:bhs BA:bih BL:blm SH:shn BY:blr BZ:blz BM:bmu BO:bol BQ:bes BR:bra BB:brb BN:brn BT:btn BV:bvt BW:bwa CF:caf CA:can CC:cck CH:che CL:chl CN:chn CI:civ CM:cmr CD:cod CG:cog CK:cok CO:col KM:com CV:cpv CR:cri CU:cub CW:cuw CX:cxr KY:cym CY:cyp CZ:cze DE:deu DJ:dji DM:dma DK:dnk DO:dom DZ:dza EC:ecu EG:egy ER:eri EH:esh ES:esp EE:est ET:eth FI:fin FJ:fji FK:flk FR:fra FO:fro FM:fsm GA:gab GB:gbr GE:geo GG:ggy GH:gha GI:gib GN:gin GP:glp GM:gmb GW:gnb GQ:gnq GR:grc GD:grd GL:grl GT:gtm GF:guf GU:gum GY:guy HK:hkg HM:hmd HN:hnd HR:hrv HT:hti HU:hun ID:idn IM:imn IN:ind IO:iot IE:irl IR:irn IQ:irq IS:isl IL:isr IT:ita JM:jam JE:jey JO:jor JP:jpn KZ:kaz KE:ken KG:kgz KH:khm KI:kir KN:kna KR:kor XK:unk KW:kwt LA:lao LB:lbn LR:lbr LY:lby LC:lca LI:lie LK:lka LS:lso LT:ltu LU:lux LV:lva MO:mac MF:maf MA:mar MC:mco MD:mda MG:mdg MV:mdv MX:mex MH:mhl MK:mkd ML:mli MT:mlt MM:mmr ME:mne MN:mng MP:mnp MZ:moz MR:mrt MS:msr MQ:mtq MU:mus MW:mwi MY:mys YT:myt NA:nam NC:ncl NE:ner NF:nfk NG:nga NI:nic NU:niu NL:nld NO:nor NP:npl NR:nru NZ:nzl OM:omn PK:pak PA:pan PN:pcn PE:per PH:phl PW:plw PG:png PL:pol PR:pri KP:prk PT:prt PY:pry PS:pse PF:pyf QA:qat RE:reu RO:rou RU:rus RW:rwa SA:sau SD:sdn SN:sen SG:sgp GS:sgs SJ:sjm SB:slb SL:sle SV:slv SM:smr SO:som PM:spm RS:srb SS:ssd ST:stp SR:sur SK:svk SI:svn SE:swe SZ:swz SX:sxm SC:syc SY:syr TC:tca TD:tcd TG:tgo TH:tha TJ:tjk TK:tkl TM:tkm TL:tls TO:ton TT:tto TN:tun TR:tur TV:tuv TW:twn TZ:tza UG:uga UA:ukr UM:umi UY:ury US:usa UZ:uzb VA:vat VC:vct VE:ven VG:vgb VI:vir VN:vnm VU:vut WF:wlf WS:wsm YE:yem ZA:zaf ZM:zmb ZW:zwe'
const countryNames = new Map()
for (const pair of isoCodes.split(' ')) {
  const [alpha2, alpha3] = pair.split(':')
  for (const locale of ['zh-CN', 'en']) countryNames.set(new Intl.DisplayNames([locale], { type: 'region' }).of(alpha2).toLowerCase(), alpha3)
}
function inferredCountries(rows) {
  const ranked = [...rows].sort((a, b) => Number(b[1].replaceAll(',', '')) - Number(a[1].replaceAll(',', '')) || Number(b[2].replaceAll(',', '')) - Number(a[2].replaceAll(',', ''))).slice(0, top)
  const unknown = ranked.filter(r => !countryNames.has(r[0].toLowerCase())).map(r => r[0])
  return { codes: ranked.map(r => countryNames.get(r[0].toLowerCase())).filter(Boolean), unknown }
}
if (opt.dryRun) {
  for (const section of sections) {
    if (section === 'slices') {
      if (!langs) console.log(`slices/pages prerequisite\t${urls.performance[1]}`)
      if (!countries) console.log(`slices/countries prerequisite\t${urls.countries[0]}`)
      for (const c of langs || []) for (const url of [perfUrl('query', 250, { page: `*/${c}/` }), perfUrl('page', 500, { page: `*/${c}/` })]) console.log(`slices\t${url}`)
      for (const c of countries || []) console.log(`slices\t${perfUrl('query', 100, { country: c })}`)
      if (!langs || !countries) console.log('slices\t其余 URL 待读取 GSC 表后推断')
    } else for (const url of urls[section]) console.log(`${section}\t${url}`)
  }
  for (const url of inspectUrls) console.log(`inspect URL\t${url}`)
  process.exit(0)
}
const out = resolve(opt.out)
mkdirSync(out, { recursive: true })
function cli(...parts) {
  const r = spawnSync('opencli', ['browser', "--session", session, '--window', 'dedicated', ...parts], { encoding: 'utf8', timeout: 45000, maxBuffer: 20 * 1024 * 1024 })
  if (r.error || r.status !== 0) throw new Error(`opencli ${parts[0]} 失败：${(r.error?.message || r.stderr || r.stdout || `退出码 ${r.status}`).trim().slice(0, 400)}`)
  return r.stdout.trim()
}
function pause(ms = 1000) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms) }
function extract(url, marker, allowEmpty = false) {
  try { cli('open', url) } catch (e) {
    // opencli 偶发返回 Navigation rejected，但租约标签已经导航成功；以下读取再裁决。
    if (!e.message.includes('Navigation rejected')) throw e
  }
  for (let n = 0; n < 8; n++) {
    pause(n ? 700 : 1200)
    const data = JSON.parse(cli('extract'))
    if (data.url?.includes('accounts.google.com')) throw new Error('GSC 登录态不可用')
    if (data.url && !data.url.includes('search.google.com/search-console')) throw new Error(`页面跳转到非 GSC：${data.url}`)
    if ((marker instanceof RegExp ? marker.test(data.content || '') : data.content?.includes(marker)) || (allowEmpty && /(?:无数据|No data)/i.test(data.content || '') && data.url === url)) return data
  }
  throw new Error(`等待页面内容超时：${marker}`)
}
const time = () => new Date().toISOString()
const esc = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
function save(name, value, lines) {
  writeFileSync(`${out}/${name}.json`, JSON.stringify(value, null, 2) + '\n')
  writeFileSync(`${out}/${name}.md`, lines.join('\n') + '\n')
}
function heading(title, source, status) { return [`# ${title}`, '', `- 数据来源：${source}`, `- 抓取时间：${time()}`, `- 完整性：${status}`, ''] }
function table(cols, rows) { return [`| ${cols.join(' | ')} |`, `|${cols.map(() => '---').join('|')}|`, ...rows.map(r => `| ${r.map(esc).join(' | ')} |`), ''] }
function pagination(content) {
  const m = [...content.matchAll(/(?:第\s*)?([\d,]+)\s*[-–]\s*([\d,]+)(?:\s*行)?\s*(?:[，,]\s*共|of)\s*([\d,]+)/gi)].at(-1)
  return m ? { first: Number(m[1].replaceAll(',', '')), last: Number(m[2].replaceAll(',', '')), total: Number(m[3].replaceAll(',', '')) } : null
}
function readTable(index = 0) {
  return JSON.parse(cli('eval', `(()=>{const t=Array.from(document.querySelectorAll('table')).at(${index});if(!t)return null;let box=t;while(box&&!box.querySelector('[data-paginate]'))box=box.parentElement;return {headers:Array.from(t.querySelectorAll('th')).map(c=>c.getAttribute('data-label')||c.innerText.trim()),rows:Array.from(t.querySelectorAll('tbody tr')).map(r=>Array.from(r.cells).map(c=>c.querySelector('[title^="http"]')?.getAttribute('title')||c.innerText.trim())),footer:box?.innerText.slice(-150)||''}})()`))
}
function parsePerf(data, dimension, count) {
  const t = readTable()
  if (!t || t.headers[0] !== { query: 'QUERIES', page: 'PAGES', country: 'COUNTRIES' }[dimension]) throw new Error(`未确认 ${dimension} 维度表头`)
  const rows = t.rows
  if (rows.some(r => r.length !== count)) throw new Error(`效果表列数不符，预期每行 ${count} 列`)
  const page = pagination(t.footer)
  if (!page) throw new Error('GSC 未报告总行数，不能核对完整性')
  if (rows.length > page.total) throw new Error('解析行数大于 GSC 总行数，疑似读到错误表格')
  return { source: data.url, rows, reportedTotal: page.total, complete: rows.length === page.total, truncated: rows.length < page.total }
}
function fetchPerf(url, dimension, compare = false) {
  const d = extract(url, /(?:上次更新日期|Last update|无数据|No data)/i, true)
  if (/(?:无数据|No data)/i.test(d.content) && !readTable()?.rows.length) return { source: d.url, rows: [], reportedTotal: 0, complete: true, truncated: false }
  for (let n = 0; n < 8; n++) {
    try { return parsePerf(d, dimension, compare ? 13 : 5) } catch (e) { if (n === 7) throw e; pause(700) }
  }
}
const sectionData = {}
function perfSection(name, specs, note = '') {
  const items = []
  const errors = []
  for (const [label, url, dimension, compare] of specs) {
    try { items.push({ label, ...fetchPerf(url, dimension, compare) }); console.log(`  ${name}/${label}: ${items.at(-1).rows.length} 行`) }
    catch (e) { errors.push({ label, error: e.message }); console.error(`  ${name}/${label}: ${e.message}`) }
  }
  const status = !errors.length && items.every(x => x.complete) ? '完整' : '截断或失败，见各表行数和错误'
  const result = { property: opt.property, range: name === 'compare' ? '28d vs previous 28d' : opt.range || '90d', capturedAt: time(), complete: !errors.length && items.every(x => x.complete), note, items, errors }
  const md = heading(`GSC ${name}`, items.map(x => x.source).join(' ; '), status)
  if (note) md.push(`- 推断：${note}`, '')
  for (const x of items) {
    md.push(`## ${x.label}`, '', `- 行数：${x.rows.length}/${x.reportedTotal}；${x.complete ? '完整' : '截断'}`, '')
    md.push(...table(name === 'compare' ? ['query','clicks_28d','clicks_prev28d','clicks_diff','impressions_28d','impressions_prev28d','impressions_diff','ctr_28d','ctr_prev28d','ctr_diff','position_28d','position_prev28d','position_diff'] : [x.label.includes('pages') || x.label === 'pages' ? 'page' : x.label === 'countries' ? 'country' : 'query','clicks','impressions','ctr','position'], x.rows))
  }
  for (const x of errors) md.push(`- ${x.label}：失败，${x.error}`)
  save(name, result, md)
  if (errors.length) throw new Error(`${errors.length} 个子表失败：${errors.map(x => x.label).join(', ')}`)
  sectionData[name] = items
  return items.reduce((n, x) => n + x.rows.length, 0)
}
function slices() {
  const pageRows = langs ? [] : (sectionData.performance?.find(x => x.label === 'pages') || fetchPerf(urls.performance[1], 'page')).rows
  const foundLangs = langs || [...new Set(pageRows.map(r => {
    try { return new URL(r[0]).pathname.split('/')[1]?.match(/^[a-z]{2}(?:-[a-z]{4})?$/i)?.[0].toLowerCase() } catch { return null }
  }).filter(Boolean))]
  const countryRows = countries ? [] : (sectionData.countries?.[0] || fetchPerf(urls.countries[0], 'country')).rows
  const inferred = countries ? { codes: countries, unknown: [] } : inferredCountries(countryRows)
  const note = [langs ? '语言由 --langs 指定' : foundLangs.length ? `语言来自 pages URL 首段：${foundLangs.join(',')}` : 'pages URL 首段未识别到 xx 或 xx-yyyy，跳过语言切片', countries ? '国家由 --countries 指定' : `国家来自 countries 点击/展示前 ${top}：${inferred.codes.join(',') || '无可识别代码'}`, inferred.unknown.length ? `无法映射并跳过：${inferred.unknown.join(',')}` : ''].filter(Boolean).join('；')
  console.log(`  slices 推断：${note}`)
  const specs = [...foundLangs.flatMap(c => [[`lang-${c}-queries`,perfUrl('query', 250, { page: `*/${c}/` }),'query'],[`lang-${c}-pages`,perfUrl('page', 500, { page: `*/${c}/` }),'page']]), ...inferred.codes.map(c => [`country-${c}-queries`,perfUrl('query', 100, { country: c }),'query'])]
  return perfSection('slices', specs, note)
}
function indexing() {
  const d = extract(urls.indexing[0], /(?:未编入索引|Not indexed)/i)
  const counts = JSON.parse(cli('eval', `(()=>{const n={};for(const e of document.querySelectorAll('[title]'))if(['已编入索引','Indexed','未编入索引','Not indexed'].includes(e.title))n[e.title]=Number(e.nextElementSibling?.getAttribute('title')?.replaceAll(',',''));return n})()`))
  const rows = JSON.parse(cli('eval', `(()=>Array.from(document.querySelectorAll('table tr')).map(r=>r.innerText.trim()))()`))
  const reasons = []
  for (const row of rows) {
    const cells = row.split(/[\n\t]+/).map(x => x.trim()).filter(Boolean)
    const count = Number(cells.at(-1)?.replaceAll(',', ''))
    if (!Number.isInteger(count) || !cells[0] || /原因|Reason/.test(cells[0])) continue
    const reason = { reason: cells[0], count, source: null, examples: [], reportedTotal: null, complete: false }
    {
      // GSC 的原因行可点击，但通常没有 <a href>；点该行只做页面导航。
      extract(urls.indexing[0], /(?:未编入索引|Not indexed)/i)
      const click = `(()=>{const r=Array.from(document.querySelectorAll('table tr')).find(r=>r.innerText.trim().startsWith(${JSON.stringify(cells[0])}));if(!r)return false;r.click();return true})()`
      if (cli('eval', click) !== 'true') throw new Error(`无法打开索引原因：${cells[0]}`)
      let detail = null
      for (let n = 0; n < 8; n++) {
        pause(900)
        const next = JSON.parse(cli('extract'))
        const table = readTable(-1)
        if (next.url?.includes('/index/drilldown') && table?.rows[0]?.[0]?.startsWith('http') && pagination(table.footer)) { detail = next; break }
      }
      if (!detail) throw new Error(`索引原因明细未加载：${cells[0]}`)
      reason.source = detail.url
      const table = readTable(-1)
      const pairs = table.rows.map(r => ({ url: r[0], lastCrawled: r[1] }))
      reason.examples = [...new Map(pairs.map(x => [x.url, x])).values()]
      reason.reportedTotal = pagination(table.footer)?.total ?? null
      reason.complete = reason.reportedTotal !== null && reason.examples.length === reason.reportedTotal
    }
    reasons.push(reason)
  }
  if (!reasons.length) throw new Error('未解析到索引原因表')
  const result = { property: opt.property, source: d.url, capturedAt: time(), lastUpdated: d.content.match(/(?:上次更新日期|Last update)[:：]\s*([^\n]+)/i)?.[1] || null, indexed: counts['已编入索引'] ?? counts.Indexed ?? null, notIndexed: counts['未编入索引'] ?? counts['Not indexed'] ?? null, reasons, complete: reasons.every(x => x.complete) }
  const md = heading('GSC 网页索引编制', d.url, result.complete ? '示例完整' : '有未取全的示例或未知总数')
  md.push(`- 报告最后更新：${result.lastUpdated ?? '未取到'}`, `- 已编入：${result.indexed ?? '未取到'}`, `- 未编入：${result.notIndexed ?? '未取到'}`, '', ...table(['原因','数量','示例行数','完整'], reasons.map(x => [x.reason,x.count,`${x.examples.length}/${x.reportedTotal ?? '?'}`,x.complete ? '是' : '否'])))
  for (const r of reasons) md.push(`## ${r.reason}`, '', ...table(['URL','上次抓取'], r.examples.map(x => [x.url,x.lastCrawled])))
  save('indexing', result, md)
  if (!result.complete) throw new Error('索引原因示例未取全，详见 indexing.json 的 complete/reportedTotal')
  return reasons.reduce((n, x) => n + x.examples.length, 0)
}
function sitemaps() {
  const d = extract(urls.sitemaps[0], /(?:已提交的站点地图|Submitted sitemaps)/i)
  const grid = JSON.parse(cli('eval', `(()=>Array.from(document.querySelectorAll('table tr')).map(r=>Array.from(r.querySelectorAll('td,th')).map(c=>c.innerText.trim())))()`))
  const headers = grid[0]?.filter(Boolean) || []
  const rows = grid.slice(1).map(r => r.slice(0, headers.length))
  if (!headers.length) throw new Error('未找到站点地图表格')
  const total = pagination(d.content)?.total ?? null
  const result = { property: opt.property, source: d.url, capturedAt: time(), headers, rows, reportedTotal: total, complete: total !== null && rows.length === total }
  save('sitemaps', result, [...heading('GSC 站点地图', d.url, result.complete ? '完整' : `截断或未知：${rows.length}/${total ?? '?'}`), ...table(headers, rows)])
  return rows.length
}
function inspect() {
  if (!inspectUrls.length) {
    save('inspect', { property: opt.property, capturedAt: time(), rows: [], complete: true, note: '未指定 --inspect-urls' }, heading('GSC 网址检查', urls.inspect[0], '未指定 URL，零行'))
    return 0
  }
  const result = { property: opt.property, capturedAt: time(), rows: [] }
  for (const url of inspectUrls) {
    extract(urls.inspect[0], /(?:主菜单|Main menu)/i)
    const box = 'form[role=search] input[role=combobox]'
    cli('click', box)
    cli('keys', process.platform === 'darwin' ? 'cmd+a' : 'ctrl+a')
    cli('keys', 'Backspace')
    cli('type', '--nth', '0', box, url)
    pause(1000)
    const option = `(()=>{const u=${JSON.stringify(url)};const e=Array.from(document.querySelectorAll('[role=option]')).find(e=>e.offsetParent&&(e.innerText||'').includes(u));if(!e)return false;e.setAttribute('data-gsc-export-option','1');return true})()`
    if (cli('eval', option) === 'true') cli('click', '[data-gsc-export-option="1"]')
    else {
      cli('keys', 'Enter')
      pause(900)
      const button = `(()=>{const e=Array.from(document.querySelectorAll('form[role=search] [aria-label]')).find(e=>e.offsetParent&&['搜索','Search'].includes(e.getAttribute('aria-label')));if(!e)return false;e.setAttribute('data-gsc-export-search','1');return true})()`
      if (cli('eval', button) === 'true') cli('click', '[data-gsc-export-search="1"]')
    }
    let found = null
    for (let n = 0; n < 12; n++) {
      pause(1000)
      const d = JSON.parse(cli('extract'))
      if (d.url?.includes('/inspect?') && d.content.includes(url) && /规范网址|canonical/i.test(d.content)) { found = d; break }
    }
    if (found) {
      const text = found.content
      const declared = text.match(/(?:用户声明的规范网址|User-declared canonical)\s*\n+([^\n]+)/i)?.[1] || null
      const googlePart = text.split(/Google 选择的规范网址|Google-selected canonical/i)[1] || ''
      const googleCanonical = /所检查的网址|Inspected URL/i.test(googlePart) ? url : googlePart.match(/https?:\/\/[^\s)]+/)?.[0] || null
      result.rows.push({ url, source: found.url, status: /网址已收录到 Google|URL is on Google/i.test(text) ? 'indexed' : /网址尚未收录|URL is not on Google/i.test(text) ? 'not_indexed' : 'unknown', declaredCanonical: declared, googleCanonical })
    } else result.rows.push({ url, error: '未等到该 URL 的索引判词' })
  }
  result.complete = result.rows.every(x => !x.error)
  const md = heading('GSC 网址检查', urls.inspect[0], result.complete ? '完整' : '部分未取到')
  for (const row of result.rows) md.push(`## ${row.url}`, '', row.error || `- 状态：${row.status}\n- 用户声明的规范网址：${row.declaredCanonical ?? '未取到'}\n- Google 选择的规范网址：${row.googleCanonical ?? '未取到'}\n- 来源：${row.source}`, '')
  save('inspect', result, md)
  if (!result.complete) throw new Error(result.rows.filter(x => x.error).map(x => `${x.url}: ${x.error}`).join('; '))
  return result.rows.length
}
const actions = {
  performance: () => perfSection('performance', [['queries',urls.performance[0],'query'],['pages',urls.performance[1],'page']]),
  countries: () => perfSection('countries', [['countries',urls.countries[0],'country']]),
  compare: () => perfSection('compare', [['queries',urls.compare[0],'query',true]]),
  slices,
  indexing, sitemaps, inspect
}
const sessions = spawnSync('opencli', ['browser', 'sessions', '-f', 'json'], { encoding: 'utf8', timeout: 10000 })
if (sessions.status !== 0) throw new Error('无法查询现有 opencli 会话，停止以免误用他人会话')
if (JSON.parse(sessions.stdout).some(x => x.session === session)) throw new Error(`会话名已被占用：${session}`)
let opened = false
const results = []
try {
  for (const section of sections) {
    try {
      // open() 只负责导航；会话由本脚本创建且仅在 finally 中释放。
      opened = true
      const rows = actions[section]()
      results.push({ section, ok: true, rows })
      console.log(`成功 ${section}: ${rows} 行`)
    } catch (e) {
      results.push({ section, ok: false, rows: 0, error: e.message })
      if (!existsSync(`${out}/${section}.json`)) save(section, { property: opt.property, capturedAt: time(), error: e.message, complete: false }, heading(`GSC ${section}`, (urls[section] || []).join(' ; '), `失败：${e.message}`))
      console.error(`失败 ${section}: ${e.message}`)
    }
  }
} finally {
  if (opened) { try { cli('close'); console.log(`会话已释放：${session}`) } catch (e) { console.error(`会话释放失败：${e.message}`); process.exitCode = 1 } }
}
console.log(`汇总：成功 ${results.filter(x => x.ok).length}，失败 ${results.filter(x => !x.ok).length}；行数 ${results.reduce((n,x) => n+x.rows,0)}`)
if (results.some(x => !x.ok)) process.exitCode = 1
