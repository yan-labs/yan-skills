import { execFileSync } from 'node:child_process'

export function parseCname(text, domain) {
  const match = String(text).match(/\bname\s*[:：]?\s*([a-f0-9]{32})(?:\.[a-z0-9.-]+)?\s+and\s+value\s*[:：]?\s*(verify\.bing\.com\.?)\b/i)
  if (!match) return null
  return { name: `${match[1].toLowerCase()}.${domain}`, content: 'verify.bing.com', type: 'CNAME', proxied: false, ttl: 1 }
}
export function verificationBranch(mode, page) {
  if (mode === 'cname') return 'cname'
  if (page && /accounts\.google\.com/i.test(page.url) && (page.password || /\/signin\/challenge\/(?:pk|pwd|password)|captcha|验证码|人机验证|recaptcha|二次验证|两步验证/i.test(`${page.url} ${page.text}`))) return 'cname'
  return 'gsc'
}
export async function ensureCname(domain, record) {
  let { CLOUDFLARE_EMAIL: email, CLOUDFLARE_API_KEY: key } = process.env
  if (!email || !key) {
    try {
      const raw = execFileSync('zsh', ['-c', 'set -a; . "$HOME/.config/cloudflare/global.env"; set +a; node -e \'process.stdout.write(JSON.stringify([process.env.CLOUDFLARE_EMAIL,process.env.CLOUDFLARE_API_KEY]))\''], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
      ;[email, key] = JSON.parse(raw)
    } catch { throw new Error('无法加载 Cloudflare 凭据，请设置 CLOUDFLARE_EMAIL 和 CLOUDFLARE_API_KEY') }
  }
  if (!email || !key) throw new Error('缺少 Cloudflare 凭据')
  async function cf(path, options = {}) {
    const res = await fetch(`https://api.cloudflare.com/client/v4${path}`, { ...options, headers: { 'X-Auth-Email': email, 'X-Auth-Key': key, 'Content-Type': 'application/json' } })
    const data = await res.json()
    if (!res.ok || !data.success) throw new Error(`Cloudflare 请求失败 HTTP ${res.status}`)
    return data.result
  }
  const parts = domain.split('.')
  let zone
  for (let i = 0; i < parts.length - 1; i++) {
    const name = parts.slice(i).join('.')
    const zones = await cf(`/zones?name=${encodeURIComponent(name)}`)
    zone = zones.find(z => z.name === name)
    if (zone) break
  }
  if (!zone) return 'no-zone'
  const path = `/zones/${encodeURIComponent(zone.id)}/dns_records`
  const records = await cf(`${path}?name=${encodeURIComponent(record.name)}`)
  if (records.some(r => r.type === 'CNAME' && r.content.replace(/\.$/, '').toLowerCase() === record.content && r.proxied === false)) return 'existing'
  if (records.length) throw new Error(`DNS 记录 ${record.name} 已存在且不匹配，停止以避免覆盖`)
  await cf(path, { method: 'POST', body: JSON.stringify(record) })
  const checked = await cf(`${path}?name=${encodeURIComponent(record.name)}`)
  if (!checked.some(r => r.type === 'CNAME' && r.content.replace(/\.$/, '').toLowerCase() === record.content && r.proxied === false)) throw new Error('Cloudflare CNAME 写入后回读失败')
  return 'created'
}
