#!/usr/bin/env node
// 用途：检查线上 sitemap（含索引）；参数：域名或站点根 URL；无需登录。
// 已知坑：单页或同日建站可能自然同日，需人工核实；静态快照无法证明改内容后会变。
// 验证日期：2026-11-05。
const input = process.argv[2]
if (!input) { console.error('用法: node sitemap-lastmod-check.mjs <域名>'); process.exit(2) }
const root = new URL('/sitemap.xml', input.includes('://') ? input : `https://${input}`).href
const visited = new Set(), pages = []
const tag = (s, name) => s.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}\\s*>`, 'i'))?.[1].trim()
const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
async function scan(url) {
  if (visited.has(url)) return
  visited.add(url)
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const xml = await response.text()
  if (/<(?:\w+:)?sitemapindex\b/i.test(xml)) {
    for (const block of xml.matchAll(/<(?:\w+:)?sitemap\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sitemap\s*>/gi)) {
      const loc = tag(block[1], '(?:\\w+:)?loc')
      if (!loc) throw new Error('子 sitemap 缺少 loc')
      await scan(new URL(decode(loc), url).href)
    }
  } else if (/<(?:\w+:)?urlset\b/i.test(xml)) {
    for (const block of xml.matchAll(/<(?:\w+:)?url\b[^>]*>([\s\S]*?)<\/(?:\w+:)?url\s*>/gi)) {
      const loc = tag(block[1], '(?:\\w+:)?loc'), lastmod = tag(block[1], '(?:\\w+:)?lastmod')
      if (!loc) throw new Error('URL 缺少 loc')
      pages.push({ loc: decode(loc), lastmod })
    }
  } else throw new Error(`${url}: 非 sitemap XML`)
}
try {
  await scan(root)
  const valid = pages.filter(p => /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(p.lastmod || '') && !Number.isNaN(Date.parse(p.lastmod)))
  const dates = [...new Set(valid.map(p => p.lastmod.slice(0, 10)))].sort()
  const today = new Date().toISOString().slice(0, 10)
  const future = dates.filter(d => d > today)
  const pass = pages.length > 0 && valid.length === pages.length && dates.length > 1 && !future.length
  console.log(JSON.stringify({ sitemap: root, urls: pages.length, withLastmod: pages.filter(p => p.lastmod).length, missingLastmod: pages.filter(p => !p.lastmod).length, invalidLastmod: pages.length - valid.length - pages.filter(p => !p.lastmod).length, distinctDates: dates.length, latest: dates.at(-1) ?? null, allSameDay: dates.length === 1 && valid.length === pages.length, futureDates: future, result: pass ? '通过' : '需修或人工核实', note: '快照不能证明内容变更后日期更新' }, null, 2))
  process.exitCode = pass ? 0 : 1
} catch (error) { console.error(`检查失败: ${error.message}`); process.exitCode = 2 }
