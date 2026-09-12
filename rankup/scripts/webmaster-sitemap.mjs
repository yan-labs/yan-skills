#!/usr/bin/env node
/**
 * webmaster-sitemap.mjs —— 在 Google Search Console、Bing Webmaster Tools、
 * Yandex Webmaster 里读取 / 提交 sitemap，驱动**用户自己已登录的浏览器**，
 * 不需要 OAuth、不需要 API key。
 *
 * 用法：
 *   # 读状态（只读，先跑这个）
 *   node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs gsc    status --property sc-domain:example.com
 *   node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs bing   status --site https://example.com
 *   node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs yandex status --site https://example.com
 *
 *   # 提交
 *   node ... gsc    submit --property sc-domain:example.com --sitemap sitemap.xml
 *   node ... bing   submit --site https://example.com --sitemap https://example.com/sitemap.xml
 *   node ... yandex submit --site https://example.com --sitemap https://example.com/sitemap.xml
 *
 * 标志：
 *   --property <id>   GSC 资源 ID（`sc-domain:example.com` 或 `https://example.com/`）
 *   --site <url>      Bing / Yandex 站点（协议 + 主机，例如 https://example.com）
 *   --sitemap <值>    GSC 要相对路径（`sitemap.xml`）；Bing / Yandex 要完整 URL
 *   --session <名>    opencli 会话名（默认 webmaster-sitemap-<每对话唯一后缀>，不用 pid）
 *   --keep-session    完成后不关闭会话
 *   --lang <zh|en>    界面语言，默认 auto（两套文案都试）
 *
 * 依赖：opencli，且用户浏览器已登录对应平台。
 *
 * ── 为什么是浏览器而不是 API ────────────────────────────────
 *
 * 本 Skill 的取数优先级是 API 高于浏览器，这里是**确实没有零配置的 API**：
 *   - GSC 的 Search Console API 能提交 sitemap，但要先建 GCP 项目、开 API、
 *     配 OAuth 同意屏幕、跑一次授权码流程。为了一次 sitemap 提交做这一整套，
 *     成本远高于收益，而且那串 refresh token 是要长期保管的凭据。
 *   - Bing Webmaster **有**一个 API key（后台 设置 → API 访问 一键生成），
 *     `POST https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed?apikey=…`。
 *     项目如果已经有那把 key，走 API 更好，本脚本不必用。
 *   - Yandex Webmaster 没有公开的零配置 API。
 * 所以这里的定位是：**零配置的默认路径**。拿到 Bing API key 之后，Bing 那半边
 * 应当换成纯 HTTP，GSC 这半边继续留在浏览器里。
 *
 * ── 四个实测的坑 ────────────────────────────────────────────
 *
 * 1. **不要用 `opencli browser <s> extract` 读这两个后台。** 它会把页面里的
 *    base64 内嵌图片一起吐出来——实测 Bing 后台一次 127 万字符，够把上下文
 *    冲掉一大半，而你只想要表格里的六个数。用 `eval` 取 `innerText` 并切片。
 *
 * 2. **两边的属性都由 URL 参数决定，不要去点属性选择器。**
 *    GSC 是 `?resource_id=<urlencoded 属性>`，Bing 是 `?siteUrl=<urlencoded 源>`。
 *    Yandex 是路径嵌入：`/site/https:<domain>:443/indexing/sitemap/`。
 *    直接带参数导航既快又不会选错——而选错属性是这类后台**最贵的错误**：
 *    父级网域属性覆盖子域，于是单条 URL 的操作照样成功，只有聚合数字是别人的，
 *    全程零报错。
 *
 * 3. **表格里的「已提交/上次读取」是上一次抓取的快照，不是实时值。**
 *    刚改完 sitemap 就来看，读到的条数是旧的。这不是失败，不要因此重复提交。
 *
 * 4. **登录态失效的样子不是登录页，是一个空白/骨架页。** 判据是页面里找不到
 *    任何一条已知文案；此时只能由用户自己去浏览器里重新登录，脚本不代填密码。
 *
 * 已验证：2026-08-23（GSC status/submit、Bing status/submit 中文界面；Yandex status/submit 英文界面）
 * 已验证：2026-09-12（Bing 中文 UI 支持修复：LABELS.bing 的「站点地图」是误译，
 * Bing 实际中文文案是「网站地图」——status 只读复测 crossword-game.com /
 * nonogram-game.com 两站，均读出 sitemap 行状态「正在处理」、提交日期 2026/9/12）
 *
 * ── 双证人化（2026-08-30，截图链路已实盘验证）────────────────
 * submit 的每次点击前后都落「截图 + 页面文本」进 `.rankup/evidence/webmaster-sitemap-<ts>/`，
 * 失败分支退出前必落现场并在 manifest.json 里写 stopReason。
 * 「提交后这条 sitemap 在不在列表里」只作为**解析出来的事实**输出（suggested 字段），
 * 结论由判读者拿着截图与文本对质——解析器对着改版页面报「找不到」时，
 * 截图是唯一能翻案的证人。
 */
import { execSync } from "node:child_process"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

// ── 参数 ──────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") { usage(); process.exit(argv.length === 0 ? 1 : 0) }
const platform = argv[0]
const action = argv[1]
let property = null
let site = null
let sitemap = null
// 会话名：描述性 + 每对话唯一后缀。**不用 pid**——Bash tool 里每次调用都是新进程，
// pid 每次都变，上一条命令打开的标签页会被遗弃成孤儿。
let session = `webmaster-sitemap-${sessionSuffix()}`
let keepSession = false
let lang = "auto"

for (let i = 2; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--property" && argv[i + 1]) { property = argv[++i]; continue }
  if (a === "--site" && argv[i + 1]) { site = argv[++i].replace(/\/+$/, ""); continue }
  if (a === "--sitemap" && argv[i + 1]) { sitemap = argv[++i]; continue }
  if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "--lang" && argv[i + 1]) { lang = argv[++i]; continue }
  if (a === "-h" || a === "--help") { usage(); process.exit(0) }
  console.error(`未知参数: ${a}`); usage(); process.exit(1)
}

function usage() {
  console.log(`用法:
  node webmaster-sitemap.mjs gsc    status|submit --property <id> [--sitemap sitemap.xml]
  node webmaster-sitemap.mjs bing   status|submit --site <url>    [--sitemap <完整URL>]
  node webmaster-sitemap.mjs yandex status|submit --site <url>    [--sitemap <完整URL>]`)
}

if (!["gsc", "bing", "yandex"].includes(platform) || !["status", "submit"].includes(action)) {
  usage(); process.exit(1)
}
if (platform === "gsc" && !property) { console.error("错误：gsc 需要 --property"); process.exit(1) }
if ((platform === "bing" || platform === "yandex") && !site) { console.error(`错误：${platform} 需要 --site`); process.exit(1) }
if (action === "submit" && !sitemap) {
  sitemap = platform === "gsc" ? "sitemap.xml" : `${site}/sitemap.xml`
  console.log(`未给 --sitemap，用默认值：${sitemap}`)
}

// 文案表。界面语言跟平台账号语言走，两套都试，命中即用。
const LABELS = {
  gsc: {
    anchor: ["站点地图", "Sitemaps"],
    // GSC 的输入框一直在页面上，没有这一步。
    openForm: null,
    input: ["输入站点地图网址", "Enter sitemap URL"],
    submit: ["提交", "Submit", "SUBMIT"],
  },
  bing: {
    // 2026-09-12 实测：Bing 后台中文 UI 现在把 sitemap 译成「网站地图」，
    // 不是「站点地图」（GSC 那边才是「站点地图」——两个产品各自的译名，
    // 不能互相假设）。「站点地图」保留在候选数组末尾兜底，以防个别账号
    // 语言/时点还停在旧译名；匹配时逐个尝试，命中优先级从前到后。
    anchor: ["网站地图", "站点地图", "Sitemaps"],
    // Bing 的输入框**默认不存在**，要先点开这个按钮才挂载。
    // 少了这一步，脚本会去填页面上唯一可见的那个 input——顶部的搜索框，
    // 然后点「提交」，报成功，什么都没提交。这类「填错了框还报成功」的失败
    // 不会有任何报错，只会在几天后表现为「Bing 一直没抓我的新 sitemap」。
    openForm: ["提交网站地图", "提交站点地图", "Submit sitemap"],
    input: ["输入网站地图网址", "输入站点地图网址", "Enter sitemap URL", "Sitemap URL", "sitemap"],
    submit: ["提交", "Submit"],
  },
  yandex: {
    anchor: ["Sitemap file", "Sitemap files", "Add Sitemap file"],
    // Yandex 的输入框一直在页面上（同 GSC）。
    openForm: null,
    // Yandex 的输入框没有 label/placeholder，靠位置定位（页面上唯一可见的 input）。
    input: [],
    submit: ["Add", "Добавить"],
  },
}
const wanted = (k) => {
  const all = LABELS[platform][k]
  if (!all) return null
  return lang === "auto" ? all : [all[lang === "zh" ? 0 : 1] ?? all[0]]
}

// ── OpenCLI 封装 ──────────────────────────────────────────
function cli(action_, { timeout = 60000 } = {}) {
  try {
    return execSync(`opencli browser "${session}" --window background ${action_}`,
      { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    // 报错必须带上真实成因。旧版只回显 stderr，而 Node 会把
    // `[UNDICI-EHPA] Warning: EnvHttpProxyAgent is experimental` 这类**无害警告**
    // 写进 stderr —— 于是一次 30 秒超时会被显示成那条警告，读的人以为是代理配置问题，
    // 实际是页面没在超时内加载完。2026-08-28 实测踩到，遂改。
    // 超时也从 30s 提到 60s：Bing Webmaster 的 sitemap 页首次加载经常超过 30 秒。
    const timedOut = e.killed || e.signal === "SIGTERM" || e.code === "ETIMEDOUT"
    const cause = timedOut
      ? `超时（>${timeout}ms）——页面没在时限内加载完，不是参数错`
      : `退出码 ${e.status ?? "?"}${e.signal ? ` / 信号 ${e.signal}` : ""}`
    const err = (e.stderr?.toString() || e.stdout?.toString() || "").trim()
    const noise = /^\(node:\d+\).*(Warning|trace-warnings)/
    const meaningful = err.split("\n").filter((l) => l.trim() && !noise.test(l)).join("\n")
    throw new Error(
      `opencli 失败: ${action_}\n  成因: ${cause}` +
        (meaningful ? `\n  输出: ${meaningful}` : "\n  （stderr 只有 Node 的无害警告，没有别的信息）")
    )
  }
}
/** eval 的 JS 一律包成 IIFE：本环境 eval 上下文跨调用持续，重复声明会抛错。 */
function evalJs(js) { return cli(`eval '${`(()=>{${js}})()`.replace(/'/g, "'\\''")}'`) }
function open(url) { cli(`open "${url}"`) }

/**
 * `wait time` is broken in opencli 1.8.7: it echoes the seconds back but returns
 * in well under a second, so the two settles below were reading the panel before
 * it had re-rendered. An in-page timer is accurate. Preferring `wait selector` or
 * `wait text` is still better whenever there is something concrete to wait for.
 * See backlink/tests/opencli-wait.test.mjs.
 */
/**
 * 轮询直到 `js` 返回真值，或超时。返回是否等到。
 *
 * 为什么不用 settle(n) 硬等：固定秒数在慢的时候不够、在快的时候白等，
 * 而「不够」的表现是下一步报一个**指向错误方向**的错（找不到元素 → 以为标签写错了）。
 */
function waitFor(js, seconds = 10) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try {
      if (String(evalJs(js)).includes("true")) return true
    } catch { /* 页面正在导航时 eval 会失败，继续等 */ }
    settle(0.5)
  }
  return false
}

function settle(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000))
  cli(`eval '(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()'`, { timeout: ms + 30000 })
}

/** 坑 1：只取文字，且切片。extract 会把内嵌 base64 图片一起吐出来。 */
function pageText(max = 4000) {
  return evalJs(`return (document.querySelector('main')||document.body).innerText.replace(/\\n{2,}/g,'\\n').slice(0,${max})`)
}

function findLabel(candidates) {
  const text = pageText(20000)
  return candidates.find((c) => text.includes(c)) ?? null
}

/* ── 取证：先取证后死、先取证后关 ─────────────────────────── */
let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("webmaster-sitemap")
  return evidence
}
/** 一幕现场 = 截图 + 页面文本，各自失败都不抛（错误进 manifest）。 */
function scene(tag, extra) {
  return captureScene({
    dir: evidenceDir(),
    tag,
    screenshot: (p) => cli(`screenshot "${p}"`, { timeout: 90000 }),
    pageText: () => pageText(20000),
    extra,
  })
}
/**
 * 失败退出的唯一出口：现场 → manifest(stopReason) → 关会话 → exit 1。
 *
 * 语言无关匹配失败时（anchor/button/input 三类 bail 都会走到这里）只报
 * `fail-xxx-not-found` 不够用——判读的人还得自己去翻截图，才知道当前页面
 * 到底长什么样。所以这里在退出前额外抓一段页面文本摘要，直接印进错误信息，
 * 截图路径也一并给出，两者都不齐才需要真的打开截图看。
 */
function bail(stopReason, msg, extra) {
  let stateSummary = "（取不到页面文本摘要）"
  try {
    stateSummary = pageText(500).replace(/\n{2,}/g, "\n").trim() || "（页面文本为空）"
  } catch { /* 页面可能正在导航，摘要拿不到也不影响主报错 */ }
  try {
    scene(`fail-${stopReason}`, extra)
    writeManifest(evidenceDir(), { script: "webmaster-sitemap", platform, action, stopReason, finishedAt: new Date().toISOString() })
  } catch (e) { console.error(`（取证失败：${String(e?.message || e).slice(0, 200)}）`) }
  console.error(msg)
  console.error(`── 当前页面文本摘要（前 500 字符）──\n${stateSummary}`)
  console.error(`现场已落盘：${evidenceDir()}（判读以截图与页面文本为准；--keep-session 可留标签页）`)
  if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
  process.exit(1)
}

// ── 平台地址（坑 2：属性由 URL 参数决定，不点选择器） ────────
// Yandex 的站点嵌在路径里，格式 `/site/https:<domain>:443/`。
function yandexSitePath() {
  const u = new URL(site)
  const port = u.port || (u.protocol === "https:" ? "443" : "80")
  return `/site/${u.protocol.replace(":", "")}:${u.hostname}:${port}`
}
const urls = {
  gsc: `https://search.google.com/search-console/sitemaps?resource_id=${encodeURIComponent(property ?? "")}`,
  bing: `https://www.bing.com/webmasters/sitemaps?siteUrl=${encodeURIComponent(site ?? "")}`,
  yandex: site ? `https://webmaster.yandex.com${yandexSitePath()}/indexing/sitemap/` : "",
}

const PLATFORM_NAMES = { gsc: "Google Search Console", bing: "Bing Webmaster Tools", yandex: "Yandex Webmaster" }
console.log(`${PLATFORM_NAMES[platform]} —— ${action}`)
console.log(`  目标: ${property ?? site}`)
console.log(`  会话: ${session}`)
console.log()

open(urls[platform])

// 坑 4：登录态失效表现为找不到任何已知文案，而不是一个登录页。
const anchor = findLabel(wanted("anchor"))
if (!anchor) {
  bail("anchor-not-found", `页面里找不到任何已知文案（试过：${(wanted("anchor") || []).join(" / ")}）。
  「登录态失效」「属性 ID 不对」「界面语言不在 LABELS 表里」「页面没加载完」在文本层不可分辨——看证据目录里的截图。
  1. 在浏览器里手动打开 ${urls[platform]} 确认能看到站点地图列表
  2. 属性 ID / 站点源是否与后台里的完全一致（核对 ID，不要核对名字）`, { url: urls[platform] })
}
scene("01-opened", { url: urls[platform], anchor })

/**
 * 点一个按钮：先在页面里**精确**认出它、打一个一次性属性，再让驱动按 CSS 选择器点。
 *
 * 两条都必要，各解决一个已实测的失败：
 *
 * - **不能用 `click --role button --name "提交"`**：`--name` 是「包含」匹配，
 *   而 GSC 的站点地图页上同时有「提交」和「提交反馈」两个按钮，于是多匹配报错。
 *   界面语言一换，这类撞词只会更多。精确匹配必须发生在页面里，不在 CLI 的匹配语义里。
 * - **不能在页面里直接 `el.click()`**：这两个后台的按钮多是挂 jsaction 的 `div`，
 *   合成 click 事件不触发它们的处理器——**报成功、什么都没发生**，
 *   而随后读面板会显示「没提交上」，把人引去查权限或网络。必须是驱动的真实 CDP 点击。
 *
 * 打属性再按选择器点，正好把「谁是目标」和「怎么点」分开，两边各用各擅长的那一半。
 */
/**
 * 找到按钮并点它。
 *
 * `viaJs` 用 `element.click()` 而不是 opencli 的合成点击。
 * **为什么需要这个开关**：2026-08-28 实测，Bing 的「Submit sitemap」按钮
 * （Fluent UI）对 opencli 的合成点击**没有反应** —— 而 opencli 仍然回报
 * `"hit": "target"`，看起来完全成功，只是对话框没开。
 * 这是最难查的一类失败：命令成功、元素命中、效果为零。
 * `element.click()` 能正常触发它的 handler。
 *
 * 只在**幂等**的动作上用 viaJs（开对话框、展开面板）。
 * 真正的提交仍走 opencli 的点击，那更接近真实用户操作。
 */
function stampAndClick(texts, { viaJs = false } = {}) {
  const js = `
    const want=${JSON.stringify(texts)};
    document.querySelectorAll('[data-rankup-target]').forEach(e=>e.removeAttribute('data-rankup-target'));
    const cands=[...document.querySelectorAll('button,[role=button],input[type=submit]')];
    const norm=e=>((e.innerText||e.value||e.getAttribute('aria-label')||'').trim().replace(/\\s+/g,' '));
    let el=cands.find(e=>want.includes(norm(e)));
    if(!el) el=cands.find(e=>want.some(w=>norm(e).includes(w)));
    if(!el) return 'NOT_FOUND';
    el.setAttribute('data-rankup-target','1');
    ${viaJs ? "el.click();" : ""}
    return 'OK:'+norm(el);`
  const r = evalJs(js)
  if (r.includes("NOT_FOUND")) {
    // 先取证后死：按钮找不到时页面到底长什么样，只有截图能回答。
    bail("button-not-found", `页面上找不到按钮（试过：${texts.join(" / ")}）。界面语言可能不是 zh/en，改 LABELS 表——是不是这个成因，看截图。`)
  }
  if (!viaJs) cli(`click '[data-rankup-target="1"]'`)
  return r
}

/**
 * 两边的表都把一行的各个字段拆成 innerText 的**独立行**，而且列序不同
 * （GSC：地址/类型/已提交/上次读取/状态/已发现；Bing：地址/类型/上次提交/上次抓取/状态/已发现）。
 *
 * 所以这里**不按列解析**，只做两件事：认出「哪几行是 sitemap 地址」，把紧随其后的
 * 若干行原样贴回同一行。列解析在任何一次改版后都会静默错位，而错位后的数字
 * 看起来完全正常——这类错误比解析失败危险得多。
 */
// 两边的 innerText 形状不同，这条正则必须两种都认：
//   GSC —— 整行一条记录，字段用制表符分隔（`https://…/sitemap.xml\t站点地图\t2026年…`）
//   Bing —— 只有地址，其余字段各占一行
// 所以匹配的是「以 URL 开头」，随后再按有没有后续内容分流。少了这一条，
// GSC 会稳定地报「列表里还没有 sitemap」——一个看起来完全正常的错误答案。
const URL_LINE = /^https?:\/\/\S+/
const STOP_LINE = /^(\d+\s*rows?|每页行数|第\s*[\d-]+\s*行.*|Rows per page.*)$/i

function printTable() {
  const lines = pageText(20000).split("\n").map((l) => l.trim()).filter(Boolean)

  // 汇总计数器：标签与数值也是相邻两行。有就打，没有就跳过。
  // 2026-09-12 核对 Bing 实际中文文案后补全（旧写法只覆盖了「站点地图」译名，
  // 「网站地图」译名下的四个计数器标题全部对不上，静默丢了这行汇总）。
  const counters = [
    "Known sitemaps", "已知站点地图", "已知的网站地图",
    "Total URLs discovered", "已发现的网址总数", "已发现的总 URL 数",
    "Sitemaps with errors", "有错误的站点地图", "存在错误的网站地图",
    "Sitemaps with warnings", "存在警告的网站地图",
  ]
  const summary = []
  lines.forEach((l, i) => {
    if (counters.includes(l) && lines[i + 1] && /^\d+$/.test(lines[i + 1])) summary.push(`${l}: ${lines[i + 1]}`)
  })
  if (summary.length) console.log(summary.join("  |  "))

  const rows = []
  for (let i = 0; i < lines.length; i++) {
    if (!URL_LINE.test(lines[i])) continue
    // GSC 形态：这一行本身就是完整记录。
    const inline = lines[i].split(/\t+/).map((f) => f.trim()).filter(Boolean)
    if (inline.length > 1) { rows.push(inline.join("  ·  ")); continue }
    // Bing 形态：字段散在随后的若干行里。
    const fields = [lines[i]]
    for (let j = i + 1; j < lines.length && fields.length < 10; j++) {
      if (URL_LINE.test(lines[j]) || STOP_LINE.test(lines[j])) break
      fields.push(lines[j])
    }
    rows.push(fields.filter(Boolean).join("  ·  "))
  }

  if (rows.length === 0) {
    console.log("（列表里还没有 sitemap）")
    return []
  }
  console.log("已提交的 sitemap：")
  rows.forEach((r) => console.log(`  ${r}`))
  console.log()
  console.log("注意：「已提交 / 上次读取 / 已发现网址数」是上一次抓取的快照，不是实时值。")
  console.log("刚改过 sitemap 就来看会读到旧数字，这不是失败，不要因此重复提交。")
  return rows
}

if (action === "status") {
  printTable()
} else {
  // Bing：先点开表单，输入框才存在。GSC：openForm 为 null，跳过。
  const openForm = wanted("openForm")
  if (openForm) {
    scene("02-before-open-form", { openForm })
    stampAndClick(openForm, { viaJs: true })
    scene("03-after-open-form")
    // **等对话框里的输入框真的出现，不要按固定秒数赌。**
    // 原来是 settle(2)：Bing 的提交对话框实测要 2–4 秒才渲染出 input，
    // 2 秒经常不够，于是下一步报「找不到 sitemap 输入框」，
    // 而那条报错会把人引去改 LABELS 表——**方向完全错了，标签一直是对的**。
    // 2026-08-28 实测：点开后手动等 4 秒，input（aria-label="Sitemap URL"）稳定出现。
    // 改成轮询到出现为止，最多 12 秒，比任何固定值都稳且通常更快。
    // 谓词必须**指名道姓找 sitemap 那个输入框**，不能只问「有没有可见 input」：
    // 后者在别的页面状态下会被导航里的搜索框满足，于是等到的是个假的 true。
    // 这一行是 2026-08-28 在真实页面上先验过的：开对话框前 false，开后 true。
    const SITEMAP_INPUT =
      'return [...document.querySelectorAll("input:not([type=hidden])")].some(e=>{' +
      'const s=getComputedStyle(e);if(s.display==="none"||s.visibility==="hidden")return false;' +
      'const t=((e.getAttribute("aria-label")||"")+" "+(e.placeholder||"")).toLowerCase();' +
      'return t.includes("sitemap")})'
    if (!waitFor(SITEMAP_INPUT, 15)) {
      bail("sitemap-input-not-found",
        "点开了提交表单，但 15 秒内没等到 sitemap 输入框出现。\n" +
          "  1. 确认该站点在 Bing 后台有「Submit sitemap」权限（只读账号点不开对话框）\n" +
          "  2. 若界面语言既不是 zh 也不是 en，改 LABELS 表的 openForm\n" +
          "  两种成因在文本层不可分辨——对话框到底开没开，看截图。")
    }
  }

  // 提交。输入框是受控组件（React/Angular 一类），直接改 .value 不触发框架状态，
  // 必须用原型上的原生 setter 再派发 input/change，否则点提交时框架读到的还是空串。
  const label = findLabel(wanted("input")) ?? ""
  const setJs = `
    const boxes=[...document.querySelectorAll('input:not([type=hidden])')]
      .filter(e=>{const s=getComputedStyle(e);return s.display!=='none'&&s.visibility!=='hidden'});
    const label=${JSON.stringify(label)};
    let el=label?boxes.find(e=>(e.getAttribute('aria-label')||e.placeholder||'').includes(label)):null;
    el=el||boxes[boxes.length-1];
    if(!el) return 'NO_INPUT';
    el.focus();
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el, ${JSON.stringify(sitemap)});
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
    return 'OK:'+el.value;`
  const r = evalJs(setJs)
  if (r.includes("NO_INPUT")) {
    bail("no-input", `找不到 sitemap 输入框。${platform === "bing" ? "Bing 的输入框藏在「提交站点地图」按钮后面，先点开它。" : ""}`)
  }
  console.log(`已填入: ${sitemap}`)
  scene("04-filled", { sitemap, evalResult: r.slice(0, 200) })

  const clicked = stampAndClick(wanted("submit"))
  console.log(`已点击提交按钮 ${clicked.replace(/^OK:/, "")}`)
  settle(3)
  scene("05-after-submit-click", { clicked })
  console.log()
  const rows = printTable()

  // 当场能拿到的**事实**只有一条：这条 sitemap 的地址现在有没有出现在解析出来的
  // 列表行里。GSC 用相对路径提交、表里显示绝对地址，所以按后缀匹配。
  // 这不是成功/失败的判决：解析器认不出改版后的表格时 listed 会是 false 而页面
  // 其实提交成功了；反过来提交前它就已在列表里（幂等）时 listed 恒 true。
  // 所以按 suggested 输出事实，判读交给拿着截图的人。
  const tail = sitemap.replace(/^https?:\/\/[^/]+/, "").replace(/^\//, "")
  const listed = rows.some((r) => r.includes(tail))
  console.log()
  console.log(`解析出的列表行数：${rows.length}；其中包含「${tail}」的行：${listed ? "有" : "没有"}（suggested: ${listed ? "listed" : "not-listed"}）`)
  writeManifest(evidenceDir(), {
    script: "webmaster-sitemap", platform, action, sitemap,
    parsedRows: rows.length, sitemapTail: tail, suggested: listed ? "listed" : "not-listed",
    stopReason: "completed", finishedAt: new Date().toISOString(),
  })
  if (!listed) {
    console.error(`「解析不到」有两个不可分辨的成因：真的没提交上（填错框/点错按钮），或表格改版让解析器失配。`)
    console.error(`以 ${evidenceDir()} 里 05-after-submit-click 的截图为准。`)
    if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
    process.exit(1)
  }
  console.log(`**在列表里 ≠ 已被抓取**：平台对同一地址的重复提交是幂等的，`)
  console.log(`所以「它在列表里」这件事在提交前后长得一模一样。真正的证据是`)
  console.log(`过一天再跑一次 status，看「上次读取」的日期和状态有没有前进。`)
  console.log(`本次提交的截图与页面文本在 ${evidenceDir()}。`)
}

if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
