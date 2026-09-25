#!/usr/bin/env node
/**
 * gsc-request-indexing.mjs —— 读 sitemap（支持 sitemap index），在 Google Search
 * Console「网址检查」工具里逐个 URL 检查索引状态，未收录的点「请求编入索引」，
 * 一条命令跑完，配额用尽自动停、记断点、下次续跑。
 *
 * 驱动用户已登录的浏览器（走 opencli），不需要 API key 或 OAuth——GSC 没有公开的
 * 「请求编入索引」API，这一步官方就只给了 UI。
 *
 * 定位：**默认流程不用这个脚本**——GSC 接入只做到「加资源 + 验证所有权 + 提交
 * sitemap」，收录进度看 sitemap 报告与覆盖率。本脚本是**可选加速工具**：需要
 * 催某批页面尽快被抓取时，一条命令跑完，不需要 agent 在 GSC 页面里逐条手工点击
 * （那样费 token 又慢）。见 `references/search-platforms.md`「GSC 不再手动
 * 『请求编入索引』」一节的完整取舍。
 *
 * 用法：
 *   # 先 dry-run：只解析 sitemap，不碰浏览器
 *   node <rankup-skill-dir>/scripts/gsc-request-indexing.mjs \
 *     --property sc-domain:example.com --sitemap https://example.com/sitemap.xml --dry-run
 *
 *   # 小流量验证流程（先 --limit 2，别一上来就跑全量）
 *   node <rankup-skill-dir>/scripts/gsc-request-indexing.mjs \
 *     --property sc-domain:example.com --sitemap https://example.com/sitemap.xml \
 *     --state <project>/.rankup/state/gsc-indexing.json --limit 2
 *
 *   # 全量（受配额限制，遇配额提示自动停，断点记在 --state）
 *   node <rankup-skill-dir>/scripts/gsc-request-indexing.mjs \
 *     --property sc-domain:example.com --sitemap https://example.com/sitemap.xml \
 *     --state <project>/.rankup/state/gsc-indexing.json
 *
 *   # 也支持直接给 URL 列表，不从 sitemap 取
 *   node ... --property sc-domain:example.com --urls urls.txt
 *   node ... --property sc-domain:example.com https://example.com/a https://example.com/b
 *
 * 标志：
 *   --property <id>   GSC 资源 ID（`sc-domain:example.com` 或 `https://example.com/`）。必填。
 *   --site <id>        `--property` 的别名，等价。
 *   --sitemap <url>    sitemap 地址；自动识别并递归展开 sitemap index。
 *   --urls <路径>       从文件读 URL，每行一个（空行、# 开头忽略）。可与 --sitemap 同时给，合并去重。
 *   --limit <n>        本次最多处理多少条 URL（跳过已完成的之后再数）。不给则处理全部待办。
 *   --state <路径>      断点状态文件。默认 `.rankup/state/gsc-indexing.json`（相对当前工作目录，
 *                       即调用方项目目录，不是本 Skill 目录——状态是项目数据，不随 Skill 分发）。
 *   --session <名>      opencli 会话名。默认 `gsc-request-indexing-<每对话唯一后缀>`。
 *   --keep-session      完成后不关闭浏览器会话。
 *   --force             忽略状态文件里已记的 indexed/requested，重新检查这些 URL。
 *   --lang <zh|en>      界面语言，默认 auto（两套文案都试）。
 *   --dry-run           只解析 URL 列表并打印，不打开浏览器、不动 GSC。
 *
 * 依赖：opencli（用户浏览器已登录 Google Search Console，且该账号在 --property 上有权限）。
 *
 * ── 网址检查怎么驱动（2026-09-25 修复） ──────────────────────────
 * 最初的实现假设 GSC「网址检查」页面能靠深链直接跳到某个 URL 的检测结果——
 * `.../inspect?resource_id=<property>&id=<url>`。**这个假设是错的**：GSC 的
 * `id` 参数是不透明 token（内部索引条目 ID），不是把 URL 编码一下就能拼出来的东西；
 * 带着猜测的 `id` 打开这个链接，GSC 会静默跳回资源概览页，脚本会一直等不到判词、
 * 全部超时失败。**没有已知的方法从 URL 反查这个 token**，所以深链方案在写完之后、
 * 真正跑通之前就被这一步拦住了。
 *
 * 正确做法是走 GSC 每个页面顶部都有的「检查 `<domain>` 中的任何网址」搜索框
 * （`form[role=search] input[role=combobox]`）：清空 → 输入完整 URL → 尝试提交
 * （见下「提交这一步不稳定」）→ 轮询页面文本读判词 → 未收录则点「请求编入索引」
 * 按钮 → 轮询结果。全程只导航一次（脚本启动时打开资源概览页），后续每个 URL 都
 * 在**同一个页面**里通过搜索框切换，不再逐条整页刷新——比深链方案更快，也避免了
 * GSC 单页应用把「网址检查」结果挂载成新的 `[role=main]` 面板、旧面板仍留在 DOM 里
 * （只是 `offsetParent === null`）导致 `document.querySelector('[role=main]')`
 * 抓到隐藏旧面板的坑——所以判词一律读 `document.body.innerText`（原生
 * innerText 天然只算可见文本），点击目标也一律先按 `offsetParent` 过滤可见元素、
 * 再匹配 `.innerText`（不用 `aria-label`——实测「请求编入索引」按钮的
 * `aria-label` 是「请求编入索引再次提交请求」，把按钮态和成功态两句文案拼在了
 * 一起，用它做精确匹配会长期失配；按钮自身的 `innerText` 是干净的
 * 「请求编入索引」）。
 *
 * **提交这一步实测不稳定，没找到确定性的判据。** 多数情况下输入会触发自动完成、
 * Google 把刚输入的文本回显成一个 `[role=option]` 建议项，点它就能提交；但同一
 * 账号同一天、相同的输入+等待流程，对不同 URL 有时不出现建议项——直接按 Enter
 * 或点搜索图标有时能顶上、有时也不生效，三种方式各自都观察到过成功和失败
 * （2026-09-25 对 `sc-domain:morsecodebox.com` 的 4 个 URL 实测：/ 与 /about
 * 靠建议项点击成功过，/translate/binary-code 靠 Enter 成功过，/privacy 三种
 * 方式加长等待都没能确认成功，见 `.rankup/integrations.md` 当天记录）。账号短
 * 时间内大量操作时更容易不出现建议项，疑似与 GSC 前端的节流/防抖有关，但没有
 * 做到能稳定复现的程度，检查过 Sitemaps 报告排除了「Google 还不认识这个 URL」
 * 这个猜测（4 条 URL 当时都已算入已提交的站点地图）。应对办法不是找到「唯一
 * 正确」的触发方式，而是**依次尝试三种已知能触发提交的动作**（见
 * `submitUrlInSearchBox()`），是否真的提交成功由判词轮询确认；三种都没能让判词
 * 出现时，这条 URL 记 `verdict-not-recognized` 失败，下次重跑会重新尝试，不会
 * 被误记成任何终态。
 *
 * ── 已知限制 ──────────────────────────────────────────────────
 *
 * 1. **配额提示的文案未实测。**「网址尚未收录」「已请求编入索引」两句文案，以及
 *    搜索框交互流程（清空 → 输入 → 提交 → 判词 → 点请求 → 成功提示），都是
 *    2026-09-25 在真实账号（中文界面，`sc-domain:morsecodebox.com`）上完整跑通
 *    验证过的（含真实点击「请求编入索引」并等到成功提示「已请求编入索引 /
 *    已将网址添加到优先抓取队列中」，见项目 `.rankup/integrations.md` 当天
 *    记录）。但配额用尽时 GSC 具体弹出什么文案本次验证**没有真的把一个资源的
 *    配额打满去看**——故意没做：那会真的消耗掉当天的配额去验证一个字符串，
 *    代价大于收益。`QUOTA_KEYWORDS_*` 目前是关键词组合（「配额」+「索引」一类），
 *    不是逐字匹配，命中即按配额处理并停止；如果真的踩到配额但没被识别成
 *    quota-stopped（而是被归类 failed），把当时的页面文本摘要（在失败证据目录
 *    里）加进 `QUOTA_KEYWORDS_*` 或作为新的精确文案，不要绕过这一步。
 * 2. **每个资源每天的请求编入索引配额官方没有公开精确数字**，社区经验是
 *    「大概 10 个」（见 `references/experiences/webcafe-topics.md` 六·一），
 *    以 GSC 页面当时的实际提示为准，本脚本不假设具体数字，只认文案。
 *    配额通常按 GSC 账号所在时区午夜重置。
 * 3. **实时测试实测比官方文档说的「1–2 分钟」快**（2026-09-25 实测多次在
 *    10～20 秒内出结果），但本脚本仍按官方文档留足 `REQUEST_RESULT_TIMEOUT_MS`
 *    （默认 150 秒）的等待上限，不够时该条会被记成 `failed`（原因 timeout），
 *    下次重跑会重新检查（不会被当成已处理跳过），不会丢。
 * 4. **按钮/文案是中文优先，英文兜底**，跟随 GSC 账号的界面语言。界面语言若不是
 *    zh/en，把 `--lang` 加一档、把下面 `L` 表补一条候选文案即可，不用改主逻辑。
 * 5. **一次运行只服务一个 --property。** 一个 sitemap 通常只属于一个资源，
 *    多资源要跑多次，state 文件里按 `property` 分区，不会互相覆盖。
 * 6. **提交检测这一步的不确定性是本脚本目前最大的已知弱点**，见上面「提交这
 *    一步实测不稳定」。三种触发方式都失败时会如实记 `verdict-not-recognized`，
 *    不会假装成功；下次重跑会重新尝试同一条 URL。
 * 7. **已修复的真实 bug（2026-09-25）：「已请求编入索引」成功提示是悬浮
 *    toast，不会因为清空搜索框、输入下一条 URL 就消失**——实测验证过：toast
 *    出现后，在同一页面清空搜索框、输入一个完全没提交过的 URL，
 *    `document.body.innerText` 仍然包含「已请求编入索引」。如果处理下一条
 *    URL 时不刷新页面，判词轮询会把上一条 URL 的 toast 误读成这一条也已经
 *    请求成功——比误判失败危险得多（失败会重试，误判成功会被状态文件当成
 *    已完成永久跳过）。现在每条 URL、每次重试都会先 `reloadInspectPage()`
 *    整页刷新，不复用上一条 URL 留下的 SPA 状态，从根上消掉这个串扰窗口。
 *    改这段逻辑时如果又把「跳过刷新、复用现有标签页」当成性能优化加回去，
 *    先看这一条。
 *
 * ── 断点续跑 ──────────────────────────────────────────────────
 * 状态文件按 URL 记 `status`：
 *   - `indexed`    —— GSC 判定已在 Google 上。跳过，不占配额。
 *   - `requested`  —— 已成功点过「请求编入索引」。跳过（Google 收录需要时间，
 *                     不要每次重跑都重新申请同一条）。
 *   - `quota-stopped` —— 本次因命中配额提示未处理。下次运行会重新尝试。
 *   - `failed`     —— 上次尝试失败（原因记在 `error`）。下次运行会重新尝试。
 * `--force` 让所有 URL 都重新走一遍检查，不看历史状态（但仍会写回新状态）。
 *
 * ── 退出码 ────────────────────────────────────────────────────
 *   0 —— dry-run，或本次待办 URL 全部处理完且没有失败、没有触发配额停止。
 *   1 —— 至少一条 URL 失败（选择器找不到 / 检测超时 / 结果无法识别等）。
 *   2 —— 命中配额提示而提前停止，且没有其它失败（正常的「今天先到这」）。
 *   失败优先于配额：同一次运行既有 failed 又有 quota-stopped 时退出码是 1。
 *
 * ── 与本 Skill 其它 GSC 脚本的分工 ───────────────────────────────
 * `webmaster-sitemap.mjs gsc submit` 负责把 sitemap 文件本身提交给 GSC；
 * 本脚本负责 sitemap 里**每一条 URL** 的收录状态与索引请求，两者互补，
 * 不重复。落地位置与取证策略沿用 `gsc-remove-urls.mjs`（同样驱动 GSC UI，
 * 同样的双证人取证）。
 *
 * 已验证：2026-09-25（sitemap 解析对真实线上 sitemap dry-run 验证；GSC 搜索框
 * 检测流程 + 「请求编入索引」点击 + 成功提示，对真实账号 `sc-domain:
 * morsecodebox.com` 完整跑通，含真实点击提交）。
 *
 * ── 测试 ──────────────────────────────────────────────────────
 * 纯函数（sitemap 解析、断点过滤、文案候选、shell 转义、搜索框/按钮匹配算法）
 * 全部 `export`，main() 延到文件末尾的 invokedAsScript() 守卫里才跑——
 * 同 yandex-setup.mjs / check-version.mjs 的写法，测试 import 这些函数不会
 * 触发参数校验或真的浏览器调用。离线测试：
 * `node --test tests/gsc-request-indexing.test.mjs`。
 */
import { execSync } from "node:child_process"
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs"
import { realpath } from "node:fs/promises"
import { dirname, resolve as resolvePath } from "node:path"
import { pathToFileURL } from "node:url"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

/* ── 参数（延到 main() 里解析，见文件末尾的 invokedAsScript 守卫：
 * 纯函数导出给测试 import 时不能触发真的参数校验/浏览器调用） ────── */
let property = null // 必填，不给默认值：默认成某个具体站点既是项目泄漏，也会让忘记传参的调用静默操作到错误资源上
let sitemapUrl = null
let urlsFile = null
let limit = null
let statePath = ".rankup/state/gsc-indexing.json"
// 会话名：描述性 + 每对话唯一后缀。**不用 pid**——Bash tool 里每次调用都是新进程。
let session = `gsc-request-indexing-${sessionSuffix()}`
let keepSession = false
let force = false
let lang = "auto"
let dryRun = false
let positionalUrls = []

function parseArgs(argv) {
  if (argv.includes("-h") || argv.includes("--help")) { usage(); process.exit(0) }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if ((a === "--property" || a === "--site") && argv[i + 1]) { property = argv[++i]; continue }
    if (a === "--sitemap" && argv[i + 1]) { sitemapUrl = argv[++i]; continue }
    if (a === "--urls" && argv[i + 1]) { urlsFile = argv[++i]; continue }
    if (a === "--limit" && argv[i + 1]) { limit = Number(argv[++i]); continue }
    if (a === "--state" && argv[i + 1]) { statePath = argv[++i]; continue }
    if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
    if (a === "--keep-session") { keepSession = true; continue }
    if (a === "--force") { force = true; continue }
    if (a === "--lang" && argv[i + 1]) { lang = argv[++i]; continue }
    if (a === "--dry-run") { dryRun = true; continue }
    if (a.startsWith("http")) { positionalUrls.push(a); continue }
    console.error(`未知参数: ${a}`); usage(); process.exit(1)
  }
  if (!property) { console.error("错误：缺少 --property（如 sc-domain:example.com）"); usage(); process.exit(1) }
  if (!sitemapUrl && !urlsFile && positionalUrls.length === 0) {
    console.error("错误：至少给一个 URL 来源（--sitemap / --urls / 位置参数）")
    usage(); process.exit(1)
  }
  if (limit !== null && (!Number.isFinite(limit) || limit <= 0)) {
    console.error("错误：--limit 必须是正整数"); process.exit(1)
  }
}

function usage() {
  console.log(`用法:
  node gsc-request-indexing.mjs --property sc-domain:example.com --sitemap <url> [--limit N] [--state <路径>] [--dry-run]
  node gsc-request-indexing.mjs --property sc-domain:example.com --urls urls.txt
  node gsc-request-indexing.mjs --property sc-domain:example.com <url1> <url2> ...
  node gsc-request-indexing.mjs --help

这是默认流程之外的可选加速工具——默认 GSC 只提交 sitemap，不逐页催收录，见
references/search-platforms.md。离线测试见 tests/gsc-request-indexing.test.mjs（node --test）。`)
}

/* ── 纯函数：sitemap 解析、断点过滤、文案候选、shell 转义、匹配算法
 *   （可脱离浏览器单测） ──────────────────────────────────────── */

export function decodeXmlEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
}
export function extractLocs(xml) {
  return [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)].map((m) => decodeXmlEntities(m[1].trim()))
}

/**
 * 取 sitemap 用 `curl`，不用 Node 全局 `fetch`：这台机器所有出站流量走本地代理
 * （`HTTP_PROXY`/`HTTPS_PROXY` 常驻，见 CLAUDE.md「绝不退出 Clash Party」），
 * `curl` 会自动读这两个环境变量，Node 的 `fetch`（undici）**不会**——实测直接
 * `fetch()` 对这台机器上的真实域名一律 `ENOTFOUND`（DNS 解析都出不去），要么显式
 * `node --use-env-proxy`（Node ≥ 26 才有这个新 flag，且要求调用方记得加，一旦漏
 * 加就静默退回直连失败）、要么用一个已经在走代理的子进程。选了后者，和本 Skill
 * 其它脚本一样只信任子进程（`opencli`/`curl`）会遵守外部代理配置，脚本本身不用
 * 关心代理细节。返回值特意做成和 `fetch()` 的 Response 同形状的最小子集
 * （`ok`/`status`/`text()`），这样调用方代码（以及需要打真实网络请求的测试）
 * 可以照常用，只有默认实现换了底层。
 */
function curlFetch(url, { headers = {} } = {}) {
  const headerArgs = Object.entries(headers).map(([k, v]) => `-H ${shq(`${k}: ${v}`)}`).join(" ")
  let out
  try {
    out = execSync(`curl -sS -L --max-time 20 -w ${shq("\n%{http_code}")} ${headerArgs} ${shq(url)}`, { encoding: "utf8" })
  } catch (e) {
    const msg = (e.stderr?.toString() || e.message || "curl 失败").trim()
    return Promise.resolve({ ok: false, status: 0, text: async () => "", _error: msg })
  }
  const idx = out.lastIndexOf("\n")
  const body = idx >= 0 ? out.slice(0, idx) : ""
  const status = Number((idx >= 0 ? out.slice(idx + 1) : out).trim()) || 0
  return Promise.resolve({ ok: status >= 200 && status < 300, status, text: async () => body })
}

/**
 * BFS 展开 sitemap（可能是 index）为最终的页面 URL 集合。
 * `visited` 防环、`maxDepth` 防止异常配置（比如 index 指向自己）无限展开。
 * `fetchImpl` 默认用 `curlFetch`（见上）；测试可以注入桩函数，不用打真实网络
 * 请求也不用真的有 `curl`。
 */
export async function collectSitemapUrls(rootUrl, { maxDepth = 5, fetchImpl = curlFetch, log = console.log, logError = console.error } = {}) {
  const visited = new Set()
  const pageUrls = []
  const queue = [{ url: rootUrl, depth: 0 }]
  while (queue.length) {
    const { url, depth } = queue.shift()
    if (visited.has(url)) continue
    visited.add(url)
    if (depth > maxDepth) { logError(`  sitemap 递归深度超过 ${maxDepth}，跳过: ${url}`); continue }
    let xml
    try {
      const res = await fetchImpl(url, { headers: { accept: "application/xml" } })
      if (!res.ok) { logError(`  跳过（HTTP ${res.status}）：${url}`); continue }
      xml = await res.text()
    } catch (e) {
      logError(`  跳过（请求失败）：${url} — ${e.message}`)
      continue
    }
    if (/<sitemapindex[\s>]/i.test(xml)) {
      const children = extractLocs(xml)
      log(`  ${url} 是 sitemap index，含 ${children.length} 个子 sitemap`)
      for (const c of children) queue.push({ url: c, depth: depth + 1 })
    } else {
      const locs = extractLocs(xml)
      log(`  ${url} 解析到 ${locs.length} 条 URL`)
      pageUrls.push(...locs)
    }
  }
  return { urls: [...new Set(pageUrls)], sitemapsVisited: [...visited] }
}

/** 断点续跑的核心过滤：已 indexed/requested 且非 --force 时跳过。 */
export function filterPending(urls, state, { force: forceAll = false } = {}) {
  return urls.filter((u) => {
    if (forceAll) return true
    const s = state?.urls?.[u]?.status
    return s !== "indexed" && s !== "requested"
  })
}

export function loadState(path) {
  if (!existsSync(path)) return { urls: {} }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"))
    if (!parsed.urls) parsed.urls = {}
    return parsed
  } catch (e) {
    console.error(`状态文件解析失败（${path}），当成空状态处理：${e.message}`)
    return { urls: {} }
  }
}
export function saveState(path, state) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(state, null, 2) + "\n")
}

// 文案表（中文优先，英文兜底；跟随 GSC 账号界面语言）。
// 已验证（2026-09-25，真实中文账号）：notIndexed、requestButton、requestedSuccess 三条，
// 含完整搜索框交互与真实点击提交。其余为候选/兜底，命中即用，见文件头「已知限制」。
const L = {
  requestButton: { zh: ["请求编入索引"], en: ["REQUEST INDEXING", "Request Indexing", "Request indexing"] },
  indexed: { zh: ["网址在 Google 上"], en: ["URL is on Google", "This URL is on Google"] },
  notIndexed: { zh: ["网址尚未收录到 Google", "网址不在 Google 上"], en: ["URL is not on Google", "This URL is not on Google"] },
  requestedSuccess: { zh: ["已请求编入索引", "已将网址添加到优先抓取队列"], en: ["Indexing requested", "URL indexing requested"] },
  ownershipError: { zh: ["您没有此网址的所有权"], en: ["not verified as an owner", "no permission"] },
}
// 配额：关键词组合判据，不是逐字匹配——见文件头「已知限制」第 1 条。
const QUOTA_KEYWORDS_ZH = ["配额"]
const QUOTA_KEYWORDS_EN = ["quota", "reached your limit", "try again"]

/** 文案候选表查询。`currentLang` 默认取模块当前的 `--lang`（CLI 用法），
 *  测试可以显式传 "zh" / "en" / "auto" 而不依赖 parseArgs() 先跑过。 */
export function wanted(k, currentLang = lang) {
  const entry = L[k]
  if (!entry) return []
  if (currentLang === "auto") return [...(entry.zh || []), ...(entry.en || [])]
  return entry[currentLang] || []
}
export function includesAny(text, candidates) { return (candidates || []).find((c) => text.includes(c)) ?? null }
export function quotaHit(text) {
  const zh = QUOTA_KEYWORDS_ZH.every((k) => text.includes(k)) && /索引|收录|inspect/i.test(text)
  const en = QUOTA_KEYWORDS_EN.some((k) => text.toLowerCase().includes(k))
  return zh || en
}

/** shell 安全的单引号包裹：所有嵌入 opencli 命令行的字面量字符串都走这个，
 *  不用双引号插值——避免 URL / 文案里出现 `$`、反引号被 shell 展开。 */
export function shq(s) { return `'${String(s).replace(/'/g, "'\\''")}'` }

/**
 * 搜索框自动完成建议项匹配：精确文本优先，找不到再退化成包含匹配；都没有
 * 返回 -1。跟 `submitUrlInSearchBox()` 注入到页面里的匹配逻辑是同一个算法
 * （那份是浏览器内联版，两边手动保持同步，改一边记得改另一边）。
 */
export function findExactThenIncludesMatch(candidateTexts, want) {
  const norm = (s) => String(s ?? "").trim()
  const target = norm(want)
  const exact = candidateTexts.findIndex((t) => norm(t) === target)
  if (exact !== -1) return exact
  return candidateTexts.findIndex((t) => norm(t).includes(target))
}

/**
 * 按钮文案匹配：候选词列表任一先精确、后包含命中（大小写不敏感、连续空白
 * 归一）；都没有返回 -1。跟 `stampAndClick()` 注入到页面里的匹配逻辑是同一个
 * 算法（那份是浏览器内联版，两边手动保持同步，改一边记得改另一边）。
 */
export function findButtonMatch(candidateTexts, wantList) {
  const norm = (s) => String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase()
  const wants = wantList.map(norm)
  const exact = candidateTexts.findIndex((t) => wants.includes(norm(t)))
  if (exact !== -1) return exact
  return candidateTexts.findIndex((t) => wants.some((w) => norm(t).includes(w)))
}

/* ── OpenCLI 封装（沿用 webmaster-sitemap.mjs 的错误处理：区分超时与真实报错，
 *    过滤 Node 的无害告警，否则一次页面慢加载会被误读成别的故障）。
 *    以下函数都读模块级 `session`/`lang`，只在 main() 的真实运行里被调用，
 *    测试不会碰到它们。 ─────────────────────────────────────────── */
function cli(action, { timeout = 60000 } = {}) {
  try {
    return execSync(`opencli browser "${session}" --window background ${action}`,
      { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const timedOut = e.killed || e.signal === "SIGTERM" || e.code === "ETIMEDOUT"
    const cause = timedOut ? `超时（>${timeout}ms）` : `退出码 ${e.status ?? "?"}${e.signal ? ` / 信号 ${e.signal}` : ""}`
    const err = (e.stderr?.toString() || e.stdout?.toString() || "").trim()
    const noise = /^\(node:\d+\).*(Warning|trace-warnings)/
    const meaningful = err.split("\n").filter((l) => l.trim() && !noise.test(l)).join("\n")
    throw new Error(`opencli 失败: ${action}\n  成因: ${cause}` + (meaningful ? `\n  输出: ${meaningful}` : ""))
  }
}
/** eval 的 JS 一律包成 IIFE：本环境 eval 上下文跨调用持续，重复声明会抛错。 */
function evalJs(js) { return cli(`eval ${shq(`(()=>{${js}})()`)}`) }
function open(url) { cli(`open ${shq(url)}`) }
function typeInto(target, text) { cli(`type --nth 0 ${shq(target)} ${shq(text)}`) }
function pressKey(k) { cli(`keys ${shq(k)}`) }
function clickTarget(target) { cli(`click ${shq(target)}`) }
function waitSelector(sel, timeoutMs) { cli(`wait selector ${shq(sel)} --timeout ${timeoutMs}`, { timeout: timeoutMs + 15000 }) }
/** 页面文本判词一律读 body.innerText——GSC 单页应用把旧面板留在 DOM 里
 *  （只是 offsetParent===null），innerText 天然只算可见文本，比
 *  `querySelector('[role=main]')`（会抓到隐藏旧面板）稳。见文件头说明。 */
function pageText(max = 8000) {
  return evalJs(`return document.body.innerText.replace(/\\n{2,}/g,'\\n').slice(0,${max})`)
}
function settle(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000))
  cli(`eval ${shq(`(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()`)}`, { timeout: ms + 30000 })
}
/** 轮询直到 predicate(text) 为真或超时。GSC 的检测/实时测试都没有稳定的 selector 挂钉，只能认文案。 */
function pollPageText(predicate, timeoutMs, intervalMs = 2000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    let text = ""
    try { text = pageText(8000) } catch { /* 导航中，继续等 */ }
    const hit = predicate(text)
    if (hit) return { hit, text }
    if (Date.now() >= deadline) return { hit: null, text }
    settle(intervalMs / 1000)
  }
}

const SEARCH_BOX_SELECTOR = "form[role=search] input[role=combobox]"

/** 每个 GSC 页面顶部都有「检查 <domain> 中的任何网址」搜索框，是本脚本驱动
 *  「网址检查」的唯一入口——深链方案已被证伪，见文件头说明。 */
function ensureSearchBoxReady(baseUrl, timeoutMs = 20000) {
  // 会话可能还没有任何标签页（第一次调用，或上一个标签页被用户/空闲超时关掉），
  // 这种情况下 eval 会直接报「No active session」——不是「页面上没有搜索框」，
  // 不能让这个异常冒泡炸整个脚本，按「需要重新 open」处理即可。
  let found = "MISSING"
  try {
    found = evalJs(`return document.querySelector(${JSON.stringify(SEARCH_BOX_SELECTOR)})?'OK':'MISSING'`)
  } catch { /* 没有活动会话/标签页，走下面的 open() 重建 */ }
  if (found.includes("OK")) return
  open(baseUrl)
  waitSelector(SEARCH_BOX_SELECTOR, timeoutMs)
}

/**
 * 每个新 URL 的检测周期开始前**一律整页刷新**，不复用上一个 URL 留下的 SPA
 * 状态——2026-09-25 实测抓到一个真实的串扰 bug：「已请求编入索引」的成功提示
 * 是一个悬浮 toast，点「请求编入索引」后出现，**不会因为清空/重新输入搜索框
 * 就消失**（实测验证：toast 出现后，在同一页面清空搜索框、输入一个完全不同
 * 且从未提交过的 URL，`body.innerText` 仍然包含「已请求编入索引」）。如果不
 * 刷新页面就直接处理下一个 URL，判词轮询读到的可能是上一条 URL 遗留的 toast，
 * 会把下一条 URL 错误地记成「已请求」，即使它根本没有被真的点过——比误判成
 * 失败危险得多（失败会重试，误判成功会被状态文件当成已完成永久跳过）。整页
 * 刷新的代价是比复用 SPA 状态慢几秒，相对于本来就以十秒到分钟计的判词等待，
 * 这个代价可以接受。 */
function reloadInspectPage(baseUrl, timeoutMs = 20000) {
  open(baseUrl)
  waitSelector(SEARCH_BOX_SELECTOR, timeoutMs)
}

/** 清空搜索框：点进去、全选、删除。不假设上一次检测完会自动清空（实测会，但
 *  不能把未验证的 UI 副作用当契约）。 */
function clearSearchBox() {
  clickTarget(SEARCH_BOX_SELECTOR)
  pressKey(process.platform === "darwin" ? "cmd+a" : "ctrl+a")
  pressKey("Backspace")
}

/**
 * 找到搜索框旁边的「搜索」提交按钮并点击（`aria-label` 中英各一种候选，跟随
 * GSC 账号界面语言）。只在可见元素里找。找不到返回 false，不抛错——它只是
 * `submitUrlInSearchBox()` 的第二道保险，不是必须存在的元素。
 */
function clickSearchSubmitButton() {
  const js = `
    document.querySelectorAll('[data-rankup-target]').forEach(e=>e.removeAttribute('data-rankup-target'));
    const want=['搜索','Search'];
    const cands=[...document.querySelectorAll('form[role=search] [aria-label]')].filter(e=>e.offsetParent);
    const el=cands.find(e=>want.includes((e.getAttribute('aria-label')||'').trim()));
    if(!el) return 'NOT_FOUND';
    el.setAttribute('data-rankup-target','1');
    return 'OK';`
  const r = evalJs(js)
  if (r.includes("NOT_FOUND")) return false
  clickTarget('[data-rankup-target="1"]')
  return true
}

/**
 * 在搜索框里的可见自动完成建议项（`[role=option]`）里找精确匹配当前 URL 的
 * 一条并点击，触发检测提交。按可见 + `findExactThenIncludesMatch()` 同款算法
 * 匹配（避免历史记录里文案相近的另一条被误点，那会检测/请求错 URL——比找
 * 不到更危险）。建议项不是每次都会出现——只在找到时才返回 true。
 */
function findAndClickOption(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const js = `
      const want=${JSON.stringify(url)};
      document.querySelectorAll('[data-rankup-target]').forEach(e=>e.removeAttribute('data-rankup-target'));
      const opts=[...document.querySelectorAll('[role=option]')].filter(e=>e.offsetParent);
      const norm=e=>(e.innerText||e.textContent||'').trim();
      let el=opts.find(e=>norm(e)===want);
      if(!el) el=opts.find(e=>norm(e).includes(want));
      if(!el) return 'NOT_FOUND';
      el.setAttribute('data-rankup-target','1');
      return 'OK';`
    const r = evalJs(js)
    if (r.includes("OK")) { clickTarget('[data-rankup-target="1"]'); return true }
    if (Date.now() >= deadline) return false
    settle(0.5)
  }
}

/**
 * 在搜索框里输入完整 URL 并尝试提交检测。**这一步实测不稳定**（2026-09-25，
 * 真实账号 `sc-domain:morsecodebox.com`）：多数情况下输入会触发自动完成、
 * Google 把刚输入的文本回显成一个 `[role=option]` 建议项，点它就能提交；但
 * 同一账号同一天、相同的输入+等待流程，对不同 URL 有时不出现建议项——原因
 * 没能定位到一个确定性的判据（不是「没有该建议项就代表 Enter/搜索图标也不会
 * 生效」：三种方式各自都观察到过成功和失败，账号短时间内大量操作时更容易
 * 不出现建议项，疑似与 GSC 前端的节流/防抖有关，但没有做到能稳定复现的程度）。
 * 应对办法不是找到「唯一正确」的触发方式，而是**依次尝试三种已知能触发提交
 * 的动作**（建议项点击 → 回车 → 点搜索图标），全程不清空/不重填输入框，
 * 值不变——多触发几次不会把检测发去错的 URL，也不占「请求编入索引」配额
 * （配额只在后面真正点「请求编入索引」按钮时消耗，见调用方）。是否真的提交
 * 成功由调用方轮询判词文案确认，这里只负责把能触发的动作都触发一遍。
 */
function submitUrlInSearchBox(url, optionTimeoutMs = 6000) {
  clearSearchBox()
  typeInto(SEARCH_BOX_SELECTOR, url)
  const gotOption = findAndClickOption(url, optionTimeoutMs)
  if (!gotOption) {
    pressKey("Enter")
    settle(1)
    clickSearchSubmitButton()
  }
}

/**
 * 找到按钮并用真实点击触发（GSC 对合成点击响应正常，`gsc-remove-urls.mjs`
 * 2026-08-23 已验证同类按钮不需要 viaJs workaround）。先在页面里精确认出目标、
 * 打一次性属性，再按选择器点——避免 `--name` 的「包含」匹配在同一页面上
 * 撞到文案相近的另一个按钮。
 *
 * 只用元素自己的 `innerText`，不用 `aria-label`——实测「请求编入索引」按钮的
 * `aria-label` 是「请求编入索引再次提交请求」（把按钮态和成功态两句文案拼在
 * 一起），拿它做精确匹配会长期失配；`innerText` 干净。同时只在可见元素里找
 * （`offsetParent` 非空），排除 GSC 单页应用里残留的隐藏旧面板。匹配算法同
 * `findButtonMatch()`。
 */
function stampAndClick(texts) {
  const js = `
    const want=${JSON.stringify(texts)};
    document.querySelectorAll('[data-rankup-target]').forEach(e=>e.removeAttribute('data-rankup-target'));
    const cands=[...document.querySelectorAll('button,[role=button],div[jsaction]')].filter(e=>e.offsetParent);
    const norm=e=>((e.innerText||'').trim().replace(/\\s+/g,' '));
    let el=cands.find(e=>want.some(w=>norm(e).toLowerCase()===w.toLowerCase()));
    if(!el) el=cands.find(e=>want.some(w=>norm(e).toLowerCase().includes(w.toLowerCase())));
    if(!el) return 'NOT_FOUND';
    el.setAttribute('data-rankup-target','1');
    return 'OK:'+norm(el);`
  const r = evalJs(js)
  if (r.includes("NOT_FOUND")) return null
  clickTarget('[data-rankup-target="1"]')
  return r
}

/* ── 取证 ─────────────────────────────────────────────────────── */
let evidenceDirCache = null
function evidenceDir() {
  if (!evidenceDirCache) evidenceDirCache = newEvidenceDir("gsc-request-indexing")
  return evidenceDirCache
}
function scene(tag, extra) {
  return captureScene({
    dir: evidenceDir(),
    tag,
    screenshot: (p) => cli(`screenshot ${shq(p)}`, { timeout: 90000 }),
    pageText: () => { try { return pageText(20000) } catch { return "" } },
    extra,
  })
}

const REQUEST_RESULT_TIMEOUT_MS = 150_000 // 官方文档说实时测试通常 1–2 分钟，见文件头「已知限制」3
// 判词出现的延迟实测波动很大（几秒到 30+ 秒都见过，同一账号同一天、
// 不同 URL 之间没有稳定规律），给足预算比给短超时更符合真实观测。
const VERDICT_TIMEOUT_MS = 90_000
const SEARCH_OPTION_TIMEOUT_MS = 8_000

/* ── 执行 ──────────────────────────────────────────────────────── */
async function main() {
  parseArgs(process.argv.slice(2))

  let allUrls = [...positionalUrls]
  if (urlsFile) {
    if (!existsSync(urlsFile)) { console.error(`文件不存在: ${urlsFile}`); process.exit(1) }
    for (const line of readFileSync(urlsFile, "utf8").split("\n")) {
      const t = line.trim()
      if (t && !t.startsWith("#")) allUrls.push(t)
    }
  }
  if (sitemapUrl) {
    console.log(`解析 sitemap: ${sitemapUrl}`)
    const { urls, sitemapsVisited } = await collectSitemapUrls(sitemapUrl)
    console.log(`共展开 ${sitemapsVisited.length} 个 sitemap 文件，得到 ${urls.length} 条去重后的 URL\n`)
    allUrls.push(...urls)
  }
  allUrls = [...new Set(allUrls)]
  if (allUrls.length === 0) { console.error("没有 URL 可处理。"); process.exit(1) }

  const state = loadState(statePath)
  if (!state.property) state.property = property
  if (state.property !== property) {
    console.log(`注意：状态文件记的资源是 ${state.property}，本次是 ${property}——按 URL 独立记录，不冲突，但不是同一个资源的续跑。`)
  }

  const pending = filterPending(allUrls, state, { force })
  const skippedAlready = allUrls.length - pending.length
  const todo = limit ? pending.slice(0, limit) : pending

  console.log(`GSC 请求编入索引`)
  console.log(`  资源: ${property}`)
  console.log(`  URL 总数: ${allUrls.length}（状态文件里已 indexed/requested 跳过 ${skippedAlready} 条）`)
  console.log(`  本次待处理: ${todo.length}${limit ? `（--limit ${limit}）` : ""}`)
  console.log(`  状态文件: ${resolvePath(statePath)}`)
  console.log(`  会话: ${session}`)
  console.log()

  if (dryRun) {
    console.log("dry-run 模式，本次会处理的 URL：")
    todo.forEach((u, i) => console.log(`  [${i + 1}] ${u}  当前状态: ${state.urls[u]?.status ?? "(无)"}`))
    process.exit(0)
  }
  if (todo.length === 0) {
    console.log("没有待处理的 URL（全部已 indexed/requested，或 --limit 为 0 覆盖后为空）。")
    process.exit(0)
  }

  const results = []
  let quotaStopped = false
  function persist() {
    saveState(statePath, state)
    writeFileSync(
      `${evidenceDir()}/results.json`,
      JSON.stringify({ property, sitemapUrl, total: allUrls.length, todo: todo.length, results }, null, 2) + "\n",
    )
  }

  const baseUrl = `https://search.google.com/search-console?resource_id=${encodeURIComponent(property)}`
  ensureSearchBoxReady(baseUrl)

  for (let i = 0; i < todo.length; i++) {
    const url = todo[i]
    console.log(`[${i + 1}/${todo.length}] ${url}`)

    try {
      // 提交这一步实测不稳定（见文件头说明），失败一次不代表真的失败——先按
      // 正常流程重新打开一次资源概览页（刷新可能清掉某种没定位到成因的前端
      // 卡住状态）整套重试一遍，两次都没等到判词才真的记失败。
      let verdict = null
      let verdictText = ""
      for (const attempt of [1, 2]) {
        // 一律整页刷新，不复用上一个 URL 的 SPA 状态——见 reloadInspectPage() 的
        // 「串扰 toast」说明，这是本脚本目前最重要的一条正确性护栏。
        reloadInspectPage(baseUrl)
        submitUrlInSearchBox(url, SEARCH_OPTION_TIMEOUT_MS)
        const polled = pollPageText((t) => {
          if (includesAny(t, wanted("indexed"))) return "indexed"
          if (includesAny(t, wanted("notIndexed"))) return "not-indexed"
          if (includesAny(t, wanted("ownershipError"))) return "ownership-error"
          return null
        }, attempt === 1 ? VERDICT_TIMEOUT_MS : Math.round(VERDICT_TIMEOUT_MS * 0.7))
        verdict = polled.hit
        verdictText = polled.text
        if (verdict) break
        if (attempt === 1) console.error(`  … 第 1 次没等到判词，刷新页面重试一次`)
      }

      if (verdict === "ownership-error") {
        throw new Error(`该账号在 ${property} 上没有权限（页面文案：${includesAny(verdictText, wanted("ownershipError"))}）`)
      }
      if (!verdict) {
        const s = scene(`url-${String(i + 1).padStart(2, "0")}-verdict-unknown`, { url })
        console.error(`  ✗ 重试后仍没认出检测结果文案（既不是「已收录」也不是「未收录」候选词）——GSC 搜索框提交这一步实测偶发不稳定，见文件头说明，下次重跑会重新尝试`)
        results.push({ url, status: "failed", reason: "verdict-not-recognized", scene: s.files })
        state.urls[url] = { status: "failed", checkedAt: new Date().toISOString(), error: "verdict-not-recognized" }
        persist()
        continue
      }

      if (verdict === "indexed") {
        console.log(`  已收录，跳过（不占配额）`)
        results.push({ url, status: "indexed" })
        state.urls[url] = { status: "indexed", checkedAt: new Date().toISOString() }
        persist()
        continue
      }

      // verdict === "not-indexed" —— 点「请求编入索引」。同样重试一次：实测点击
      // 偶尔以 opencli 的 JS 回退方式落地（而不是真实 CDP 点击），那种点击有时
      // 不会触发 GSC 自己的 jsaction 处理器——界面上完全看不出来，按钮不报错、
      // 也不进入「正在测试」状态，就是静默没反应。重新找一次按钮再点一次，
      // 命中「已请求编入索引」就早停，不会因为按钮已经点过就重复计入配额
      // （GSC 自己的判词就是「多次提交同一网页并不能改变该网页的队列顺序」）。
      let outcome = null
      let outcomeText = ""
      for (const attempt of [1, 2]) {
        const clicked = stampAndClick(wanted("requestButton"))
        if (!clicked) {
          const s = scene(`url-${String(i + 1).padStart(2, "0")}-button-not-found`, { url })
          console.error(`  ✗ 找不到「请求编入索引」按钮（候选：${wanted("requestButton").join(" / ")}）`)
          results.push({ url, status: "failed", reason: "button-not-found", scene: s.files })
          state.urls[url] = { status: "failed", checkedAt: new Date().toISOString(), error: "button-not-found" }
          persist()
          outcome = "__button_not_found__"
          break
        }
        const polled = pollPageText((t) => {
          if (quotaHit(t)) return "quota"
          if (includesAny(t, wanted("requestedSuccess"))) return "success"
          return null
        }, attempt === 1 ? REQUEST_RESULT_TIMEOUT_MS : Math.round(REQUEST_RESULT_TIMEOUT_MS * 0.4))
        outcome = polled.hit
        outcomeText = polled.text
        if (outcome) break
        if (attempt === 1) console.error(`  … 点「请求编入索引」后没等到结果，再点一次`)
      }
      if (outcome === "__button_not_found__") continue

      if (outcome === "success") {
        const s = scene(`url-${String(i + 1).padStart(2, "0")}-requested`, { url })
        console.log(`  ✓ 已请求编入索引`)
        results.push({ url, status: "requested", scene: s.files })
        state.urls[url] = { status: "requested", checkedAt: new Date().toISOString() }
        persist()
        continue
      }
      if (outcome === "quota") {
        const s = scene(`url-${String(i + 1).padStart(2, "0")}-quota`, { url, outcomeText: outcomeText.slice(0, 500) })
        console.error(`  ⏸ 命中配额提示，本次到此为止（页面片段：${outcomeText.slice(0, 200).replace(/\n/g, " ")}）`)
        results.push({ url, status: "quota-stopped", scene: s.files })
        state.urls[url] = { status: "quota-stopped", checkedAt: new Date().toISOString() }
        quotaStopped = true
        persist()
        break
      }
      // 既不是成功也不是配额：超时或未知结果
      const s = scene(`url-${String(i + 1).padStart(2, "0")}-request-timeout`, { url })
      console.error(`  ✗ 点击后 ${REQUEST_RESULT_TIMEOUT_MS / 1000}s 内没等到已知结果文案`)
      results.push({ url, status: "failed", reason: "request-result-timeout", scene: s.files })
      state.urls[url] = { status: "failed", checkedAt: new Date().toISOString(), error: "request-result-timeout" }
      persist()
    } catch (e) {
      const s = scene(`url-${String(i + 1).padStart(2, "0")}-error`, { url, error: e.message })
      console.error(`  ✗ ${e.message}`)
      results.push({ url, status: "failed", reason: "exception", error: e.message, scene: s.files })
      state.urls[url] = { status: "failed", checkedAt: new Date().toISOString(), error: e.message.slice(0, 500) }
      persist()
    }
  }

  console.log(`\n─── 结果 ───`)
  const counts = { indexed: 0, requested: 0, "quota-stopped": 0, failed: 0 }
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1
  console.log(`已收录跳过: ${counts.indexed}  已请求: ${counts.requested}  配额停止: ${counts["quota-stopped"]}  失败: ${counts.failed}`)
  if (counts.failed > 0) {
    console.log(`失败明细：`)
    results.filter((r) => r.status === "failed").forEach((r) => console.log(`  ${r.url}: ${r.reason}${r.error ? ` (${r.error})` : ""}`))
  }
  if (skippedAlready > 0) console.log(`另有 ${skippedAlready} 条 URL 在状态文件里已是 indexed/requested，本次未处理（用 --force 可强制重查）。`)
  if (pending.length > todo.length) console.log(`还有 ${pending.length - todo.length} 条待处理 URL 未在本次 --limit 内，下次不加 --limit 或调大即可续跑。`)

  writeManifest(evidenceDir(), {
    script: "gsc-request-indexing", property, sitemapUrl,
    ...counts, total: allUrls.length, processedThisRun: todo.length,
    stopReason: quotaStopped ? "quota-stopped" : (counts.failed > 0 ? "completed-with-failures" : "completed"),
    finishedAt: new Date().toISOString(),
  })
  persist()
  console.log(`\n状态文件: ${resolvePath(statePath)}`)
  console.log(`证据目录: ${evidenceDir()}`)

  if (!keepSession) { try { cli("close") } catch { /* ignore */ } }

  process.exitCode = counts.failed > 0 ? 1 : (quotaStopped ? 2 : 0)
}

// argv[1] 保留调用时写的路径，import.meta.url 已经过符号链接解析——两边取真实路径
// 再比较，同 check-version.mjs / yandex-setup.mjs 的 invokedAsScript()。让测试可以
// 只 import 上面的纯函数而不触发参数校验或真的浏览器调用。
async function invokedAsScript() {
  if (process.argv[1] === undefined) return false
  try {
    const resolved = await realpath(resolvePath(process.argv[1]))
    return pathToFileURL(resolved).href === import.meta.url
  } catch {
    return false
  }
}

if (await invokedAsScript()) {
  await main()
}
