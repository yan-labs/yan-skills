#!/usr/bin/env node
/**
 * 已部署 Cloudflare 站点的上线接入总入口；--check 只读，统计需在线上 HTML 回读。
 * 用法：node scripts/site-onboard.mjs --domain example.com [--repo <仓库>] [--branch <生产分支>] [--session 名] [--only cf,ga4,...] [--skip cf,ga4,...] [--check]
 * 依赖：cf-analytics-setup、ga4-setup、ga4-gsc-link、clarity-setup、indexnow-submit、gsc-domain-verify、
 * sitemap 内容日期检查另用 sitemap-lastmod-check.mjs <域名>。
 * bing-import-from-gsc、yandex-setup、ahrefs-setup、webmaster-sitemap（均在同目录）。
 * 登录态：OpenCLI 所连接的 Chrome 已登录 GA4、Clarity、GSC、Bing、Yandex、Ahrefs；
 * Cloudflare API 凭据沿用各脚本。Bing 掉线时点「使用 Google 登录」；Ahrefs 冻结项目
 * 会挡新建，GSC 验证不过才考虑 DNS；Google 账户下拉默认选第一项。
 * 统计资源创建后写入 Workers Builds trigger env；需 push 重建部署后复查。
 * 验证日期：2026-09-28。
 */
import { execFileSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { cfAuthHeaders, resolveCfAccountId } from "./lib-cf-auth.mjs"

const argv = process.argv.slice(2)
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("用法：node scripts/site-onboard.mjs --domain <域名> [--repo <仓库>] [--branch <生产分支>] [--session <名>] [--only cf,ga4,clarity,indexnow,gsc,ga4gsc,bing,yandex,ahrefs] [--skip <列表>] [--check]")
  process.exit(0)
}
const arg = name => argv[argv.indexOf(name) + 1]
const domain = argv.includes("--domain") ? arg("--domain") : null
const repo = argv.includes("--repo") ? resolve(arg("--repo")) : null
const requestedBranch = argv.includes("--branch") ? arg("--branch") : null
const session = argv.includes("--session") ? arg("--session") : `onboard-${domain?.replaceAll(".", "")}`
const only = argv.includes("--only") ? new Set(arg("--only").split(",").flatMap(x => x === "analytics" ? ["cf", "ga4", "clarity"] : [x])) : null
const skip = argv.includes("--skip") ? new Set(arg("--skip").split(",")) : new Set()
const check = argv.includes("--check")
const names = ["cf", "ga4", "clarity", "indexnow", "gsc", "ga4gsc", "bing", "yandex", "ahrefs"]
if (!domain || (!repo && (!only || only.has("indexnow")) && !skip.has("indexnow"))) {
  console.error("需要 --domain；执行 IndexNow 还需要 --repo")
  process.exit(1)
}
const site = `https://${domain}`
const script = name => new URL(`./${name}.mjs`, import.meta.url).pathname
const run = (name, ...args) => execFileSync(process.execPath, [script(name), ...args],
  { encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "pipe"] })
const browser = name => ["--session", `${session}-${name}`]
const has = (name, args, pattern) => pattern.test(run(name, ...args))
const sitemap = (platform, id, value) => has("webmaster-sitemap",
  [platform, "status", id, value, ...browser(platform)], /sitemap\.xml/i)
let html
const homepage = async () => html ??= await fetch(`${site}/`).then(r => r.ok ? r.text() : "")
const live = async (name, id) => Boolean(id) && (await homepage()).includes(id) &&
  (name !== "cf" || /beacon\.min\.js/.test(await homepage()))
const ids = {}
function skillEnv() {
  const file = join(new URL("..", import.meta.url).pathname, ".env")
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^([A-Z_]+)=(.*)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "")
  }
}
async function cfApi(method, path, body) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    method, headers: { ...cfAuthHeaders(), "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
  })
  const json = await response.json()
  if (!json.success) throw new Error(`Cloudflare ${method} ${path} → HTTP ${response.status}`)
  return json.result
}
async function cfToken() {
  skillEnv()
  const account = await resolveCfAccountId({ headers: cfAuthHeaders() })
  const zones = await cfApi("GET", `/zones?name=${encodeURIComponent(domain)}`)
  const sites = await cfApi("GET", `/accounts/${account}/rum/site_info/list?per_page=100`)
  return sites.find(s => s.ruleset?.zone_tag === zones[0]?.id)?.site_token
}
async function buildTrigger() {
  if (!repo) throw new Error("写入 Workers Builds 构建变量需要 --repo")
  skillEnv()
  const account = await resolveCfAccountId({ headers: cfAuthHeaders() })
  const config = readFileSync(join(repo, "apps/web/wrangler.jsonc"), "utf8")
  const worker = config.match(/"name"\s*:\s*"([^"]+)"/)?.[1]
  const service = await cfApi("GET", `/accounts/${account}/workers/services/${worker}`)
  const triggers = await cfApi("GET", `/accounts/${account}/builds/workers/${service.default_environment.script_tag}/triggers`)
  const branch = requestedBranch || config.match(/"production_branch"\s*:\s*"([^"]+)"/)?.[1] ||
    (() => {
      const production = triggers.filter(t => t.branch_includes?.length === 1 && !/[*!]/.test(t.branch_includes[0]))
      return production.length === 1 ? production[0].branch_includes[0] : null
    })()
  const matches = triggers.filter(t => t.branch_includes?.length === 1 && t.branch_includes[0] === branch)
  if (matches.length !== 1) throw new Error(`生产分支${branch ? ` ${branch}` : "无法唯一确定"}；候选 trigger 与分支：${triggers.map(t => `${t.trigger_name} (${t.branch_includes?.join(",") || "无分支"})`).join("；")}`)
  return { account, trigger: matches[0].trigger_uuid }
}
async function buildEnv() {
  if (check && repo) {
    const siteConfig = join(repo, "sites", domain.replaceAll(".", "-"), "wrangler.jsonc")
    if (existsSync(siteConfig)) {
      const source = readFileSync(siteConfig, "utf8")
      return Object.fromEntries(["GA4_MEASUREMENT_ID", "CLARITY_PROJECT_ID"].map(name =>
        [name, { value: source.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`))?.[1] }]))
    }
  }
  if (!repo) {
    const page = await homepage()
    return {
      GA4_MEASUREMENT_ID: { value: page.match(/G-[A-Z0-9]{6,}/)?.[0] },
      CLARITY_PROJECT_ID: { value: page.match(/"clarity",\s*"script",\s*"([a-z0-9]+)"/)?.[1] },
    }
  }
  const { account, trigger } = await buildTrigger()
  return cfApi("GET", `/accounts/${account}/builds/triggers/${trigger}/environment_variables`)
}
async function wireAnalytics() {
  if (!repo) return
  const { account, trigger } = await buildTrigger()
  const variables = Object.fromEntries(Object.entries(ids).map(([name, value]) => [name, { is_secret: false, value }]))
  await cfApi("PATCH", `/accounts/${account}/builds/triggers/${trigger}/environment_variables`, variables)
}
function existingAnalyticsId(name, code) {
  const currentSession = `${session}-${name}`
  const window = name === "ga4" ? ["--window", "dedicated", "--window-slot", "ga4-setup"] : ["--window", "dedicated"]
  try {
    run(`${name}-setup`, "status", ...(name === "ga4" ? ["--domain", domain] : []), ...browser(name), "--keep-session")
    return execFileSync("opencli", ["browser", currentSession, ...window, "eval", code],
      { encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }).trim()
  } finally {
    try { execFileSync("opencli", ["browser", currentSession, ...window, "close"], { stdio: "ignore", timeout: 10000 }) } catch {}
  }
}
function ga4Scope() {
  try {
    const out = run("ga4-setup", "status", "--domain", domain, ...browser("ga4"))
    const m = out.match(/账号[^(\n]*\((\d+)\)[，,]\s*资源[^(\n]*\((\d+)\)/)
    if (process.env.RANKUP_DEBUG) console.error("ga4Scope:", m ? m.slice(1) : `未匹配：${out.slice(0, 120)}`)
    return m ? ["--account", m[1], "--property", m[2]] : []
  } catch (error) {
    if (process.env.RANKUP_DEBUG) console.error("ga4Scope 失败：", (error.stderr?.toString() || error.message).slice(-200))
    return []
  }
}
let submittedIndexNow = false
const steps = {
  cf: {
    done: async () => has("cf-analytics-setup", ["status", domain], /Web Analytics 已启用/) &&
      await live("cf", ids.CF_WEB_ANALYTICS_TOKEN || await cfToken()),
    apply: async () => {
      ids.CF_WEB_ANALYTICS_TOKEN = await cfToken()
      if (!ids.CF_WEB_ANALYTICS_TOKEN) {
        run("cf-analytics-setup", "enable", domain)
        ids.CF_WEB_ANALYTICS_TOKEN = await cfToken()
      }
      await wireAnalytics()
    },
  },
  ga4: {
    done: async () => has("ga4-setup", ["status", "--domain", domain, ...browser("ga4")], /已找到网站数据流|线上已部署 GA4 Measurement ID/) &&
      await live("ga4", ids.GA4_MEASUREMENT_ID || (await buildEnv()).GA4_MEASUREMENT_ID?.value),
    apply: async () => {
      const status = run("ga4-setup", "status", "--domain", domain, ...browser("ga4"))
      const existing = (await buildEnv()).GA4_MEASUREMENT_ID?.value
      ids.GA4_MEASUREMENT_ID = existing || (/已找到网站数据流/.test(status)
        ? existingAnalyticsId("ga4", `(async()=>{const row=[...document.querySelectorAll('mat-row,[role="row"],tr')].find(x=>x.innerText.includes(${JSON.stringify(domain)}));if(row)row.click();await new Promise(r=>setTimeout(r,1500));return (document.body.innerText.match(/G-[A-Z0-9]{6,}/g)||[])[0]||''})()`)
        : run("ga4-setup", "create", "--domain", domain, ...browser("ga4")).match(/ID:\s*(G-[A-Z0-9]{6,})/)?.[1])
      if (!ids.GA4_MEASUREMENT_ID) throw new Error("GA4 未返回 Measurement ID")
      await wireAnalytics()
    },
  },
  clarity: {
    done: async () => has("clarity-setup", ["status", ...browser("clarity")], new RegExp(domain.replaceAll(".", "\\."), "i")) &&
      await live("clarity", ids.CLARITY_PROJECT_ID || (await buildEnv()).CLARITY_PROJECT_ID?.value),
    apply: async () => {
      const status = run("clarity-setup", "status", ...browser("clarity"))
      const existing = (await buildEnv()).CLARITY_PROJECT_ID?.value
      ids.CLARITY_PROJECT_ID = existing || (new RegExp(domain.replaceAll(".", "\\."), "i").test(status)
        ? existingAnalyticsId("clarity", `(async()=>{const row=[...document.querySelectorAll('tr')].find(x=>x.innerText.includes(${JSON.stringify(domain)}));if(row)(row.querySelector('a')||row).click();await new Promise(r=>setTimeout(r,1500));return location.href.match(/\/projects\/(?:view\/)?([a-z0-9]+)/)?.[1]||''})()`)
        : run("clarity-setup", "create", "--site", domain, ...browser("clarity")).match(/ID:\s*([a-z0-9]+)/)?.[1])
      if (!ids.CLARITY_PROJECT_ID) throw new Error("Clarity 未返回 Project ID")
      await wireAnalytics()
    },
  },
  indexnow: {
    async done() {
      const dir = join(repo, "apps/web/public")
      const file = existsSync(dir) && readdirSync(dir).find(x => /^[a-f0-9]{32}\.txt$/.test(x))
      if (!file) return false
      const key = file.slice(0, -4)
      const response = await fetch(`${site}/${file}`)
      const online = response.status === 200 && (await response.text()).trim() === key
      const record = join(repo, ".rankup/integrations.md")
      return online && (submittedIndexNow || (existsSync(record) &&
        readFileSync(record, "utf8").split("\n").some(line => {
          if (!/IndexNow[^\n]*(?:HTTP 20[02]|返回[^\n]*20[02]|推送[^\n]*20[02])/i.test(line)) return false
          return line.includes(file)
        })))
    },
    async apply() {
      const dir = join(repo, "apps/web/public")
      let file = existsSync(dir) && readdirSync(dir).find(x => /^[a-f0-9]{32}\.txt$/.test(x))
      if (!file) {
        execFileSync("git", ["check-ignore", "-q", ".env"], { cwd: repo })
        const key = run("indexnow-submit", "--generate-key").match(/^[a-f0-9]{32}/)?.[0]
        file = `${key}.txt`
        writeFileSync(join(dir, file), `${key}\n`, { flag: "wx" })
        const envFile = join(repo, ".env")
        const old = existsSync(envFile) ? readFileSync(envFile, "utf8") : ""
        writeFileSync(envFile, /^INDEXNOW_KEY=/m.test(old)
          ? old.replace(/^INDEXNOW_KEY=.*$/m, `INDEXNOW_KEY=${key}`)
          : `${old}${old && !old.endsWith("\n") ? "\n" : ""}INDEXNOW_KEY=${key}\n`)
        throw new Error("密钥文件已写入仓库；需要提交部署后再推送")
      }
      const key = file.slice(0, -4)
      const response = await fetch(`${site}/${file}`)
      if (response.status !== 200 || (await response.text()).trim() !== key) throw new Error("密钥文件尚未在线上返回 200 且正文匹配；需要提交部署")
      run("indexnow-submit", "--site-url", site, "--key", key)
      submittedIndexNow = true
    },
  },
  gsc: {
    done: () => has("gsc-domain-verify", ["status", "--domain", domain, ...browser("gsc")], /已验证；页面显示 sitemap\.xml/) &&
      sitemap("gsc", "--property", `sc-domain:${domain}`),
    apply: () => {
      run("gsc-domain-verify", "add-site", "--domain", domain, ...browser("gsc"))
      if (!sitemap("gsc", "--property", `sc-domain:${domain}`))
        run("webmaster-sitemap", "gsc", "submit", "--property", `sc-domain:${domain}`, "--sitemap", "sitemap.xml", ...browser("gsc"))
    },
  },
  ga4gsc: {
    // 2026-10-03：账号下媒体资源多时 ga4-gsc-link 自己的资源发现会报「选择器未滚动，列表不完整」；
    // 先用 ga4-setup status 读出账号号与媒体资源号，直接传 --account/--property 绕过发现。
    done: () => has("ga4-gsc-link", ["status", "--domain", domain, ...ga4Scope(), ...browser("ga4gsc")], /已关联 GA4 Search Console/),
    apply: () => run("ga4-gsc-link", "link", "--domain", domain, ...ga4Scope(), ...browser("ga4gsc")),
  },
  bing: {
    done: () => sitemap("bing", "--site", site),
    apply: () => run("bing-import-from-gsc", "--sites", domain, "--sitemap", ...browser("bing")),
  },
  yandex: {
    done: () => has("yandex-setup", ["status", "--site", site, ...browser("yandex")], /状态: verified/) &&
      sitemap("yandex", "--site", site),
    apply: () => {
      run("yandex-setup", "add-site", "--site", site, "--submit-sitemap", ...browser("yandex"))
      run("yandex-setup", "verify", "--site", site, ...browser("yandex"))
      if (!sitemap("yandex", "--site", site))
        run("webmaster-sitemap", "yandex", "submit", "--site", site, "--sitemap", `${site}/sitemap.xml`, ...browser("yandex"))
    },
  },
  ahrefs: {
    done: () => has("ahrefs-setup", ["status", "--site", domain, ...browser("ahrefs")], /所有权已验证.*已保存/),
    apply: () => {
      run("ahrefs-setup", "create", "--site", domain, ...browser("ahrefs"))
      run("ahrefs-setup", "verify", "--site", domain, ...browser("ahrefs"))
    },
  },
}

const result = []
for (const name of names) {
  if ((only && !only.has(name)) || skip.has(name)) continue
  try {
    if (await steps[name].done()) {
      result.push([name, "已完成"])
      console.log(`${name}: 已完成`)
    } else if (check) {
      result.push([name, "失败（未完成）"])
      console.log(`${name}: 未完成`)
    } else {
      await steps[name].apply()
      const deployed = await steps[name].done()
      const guidance = !repo && ({ cf: "CF_WEB_ANALYTICS_TOKEN", ga4: "GA4_MEASUREMENT_ID", clarity: "CLARITY_PROJECT_ID" })[name]
      const status = guidance ? `未完成（需配置构建变量：${guidance}=${ids[guidance]}）` : !deployed && ["cf", "ga4", "clarity"].includes(name)
        ? "需重建部署后复查" : deployed ? "本次完成" : "失败（执行后状态仍未完成）"
      result.push([name, status])
      console.log(`${name}: ${status}`)
    }
  } catch (error) {
    const reason = (error.stderr?.toString() || error.message).trim().split("\n").at(-1)
      .replace(/[a-f0-9]{32}/gi, "[REDACTED]").replace(/google-site-verification=\S+/g, "[REDACTED]").slice(0, 240)
    result.push([name, `失败（${reason}）`])
    console.log(`${name}: 失败（${reason}）`)
  }
}
console.log("\n| 步骤 | 状态 |\n|---|---|")
for (const [name, status] of result) console.log(`| ${name} | ${status} |`)
if (result.some(([, status]) => status.startsWith("失败") || status.startsWith("未完成"))) process.exitCode = 1
