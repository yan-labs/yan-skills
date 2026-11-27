#!/usr/bin/env node
/**
 * gsc-remove-urls.mjs —— 在 GSC「移除」工具中批量提交「暂时移除网址」请求。
 *
 * 驱动用户已登录的浏览器，不需要 API key 或 OAuth。
 * GSC 没有公开的移除 API，只能通过 UI 操作。
 *
 * 用法：
 *   node <rankup-skill-dir>/scripts/gsc-remove-urls.mjs \
 *     --property sc-domain:example.com \
 *     https://example.com/old-page-1 \
 *     https://example.com/old-page-2
 *
 *   # 从文件读 URL（每行一个）
 *   node <rankup-skill-dir>/scripts/gsc-remove-urls.mjs \
 *     --property sc-domain:example.com \
 *     --file urls.txt
 *
 * 标志：
 *   --property <id>   GSC 资源 ID（必填，如 sc-domain:example.com）
 *   --file <路径>      从文件读取 URL，每行一个（空行和 # 开头的行忽略）
 *   --session <名>     opencli 浏览器会话名（默认：gsc-remove-<pid>）
 *   --keep-session     完成后不关闭浏览器会话
 *   --dry-run          只打印要提交的 URL，不实际操作
 *
 * 依赖：opencli（用户浏览器已登录 Google Search Console）
 *
 * 已知限制：
 *   - 按钮文案为中文（新要求 / 仅移除此网址 / 下一页 / 提交请求），
 *     如果用户的 Google 语言不是中文需改文案映射。
 *   - GSC「暂时移除」有效期约 6 个月，之后需要重新提交或确认页面已返回 404/410。
 *   - 同一 URL 重复提交不会报错，GSC 会显示已有的请求。
 *
 * 已验证：2026-08-23
 *
 * ── 双证人化（2026-08-30，截图链路已实盘验证）────────────────
 * 写操作脚本，证据义务最重：每条 URL 提交后截图；results.json **逐条落盘**
 * 到 `.rankup/evidence/gsc-remove-urls-<ts>/`——中途被打断（超时/Ctrl-C 之外的
 * 崩溃）时已提交的部分也有案可查，不会「提交了 7 条、账面上一条都没有」。
 * 页面打不开等失败分支退出前同样落现场（截图 + 页面文本 + manifest）。
 */
import { execSync } from "node:child_process"
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

// ── 按钮文案（中文 GSC） ──────────────────────────────────
// GSC 页面语言跟 Google 账号语言走。如需其他语言，改这里。
const L = {
  newRequest: "新要求",
  tempRemoveTab: "暂时移除网址",
  removeThisUrl: "仅移除此网址",
  nextPage: "下一页",
  confirmTitle: "移除网址",
  submitRequest: "提交请求",
  submitting: "正在提交请求",
  submittedList: "已提交的申请",
}

// ── 参数解析 ──────────────────────────────────────────────
const argv = process.argv.slice(2)
let property = null // 必填。**不给默认值**：默认成某个具体站点既是项目泄漏，
// 也会让忘记传 --property 的调用静默操作到错误的资源上。
// 会话名：描述性 + 每对话唯一后缀。**不用 pid**——Bash tool 里每次调用都是新进程。
let session = `gsc-remove-${sessionSuffix()}`
let urlFile = null
let keepSession = false
let dryRun = false
const urls = []

for (let i = 0; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--property" && argv[i + 1]) { property = argv[++i]; continue }
  if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
  if (a === "--file" && argv[i + 1]) { urlFile = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "--dry-run") { dryRun = true; continue }
  if (a === "-h" || a === "--help") { usage(); process.exit(0) }
  if (a.startsWith("http")) { urls.push(a); continue }
  console.error(`未知参数: ${a}`); usage(); process.exit(1)
}

if (urlFile) {
  if (!existsSync(urlFile)) { console.error(`文件不存在: ${urlFile}`); process.exit(1) }
  const lines = readFileSync(urlFile, "utf8").split("\n")
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith("#")) urls.push(trimmed)
  }
}

if (!property) {
  console.error("错误：缺少 --property（如 sc-domain:example.com）")
  usage()
  process.exit(1)
}

if (urls.length === 0) {
  console.error("错误：至少提供一个 URL（命令行参数或 --file）")
  usage()
  process.exit(1)
}

function usage() {
  console.log(`用法: node gsc-remove-urls.mjs --property sc-domain:xxx [--file urls.txt] <url1> <url2> ...
       node gsc-remove-urls.mjs --help`)
}

// ── OpenCLI 封装 ─────────────────────────────────────────
function cli(action, { timeout = 15000 } = {}) {
  const cmd = `opencli browser --session "${session}" ${action}`
  try {
    return execSync(cmd, { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const stderr = e.stderr ? e.stderr.toString().trim() : ""
    const stdout = e.stdout ? e.stdout.toString().trim() : ""
    throw new Error(`opencli 失败: ${action}\n  ${stderr || stdout || e.message}`)
  }
}

function waitText(text, timeout = 15000) {
  cli(`wait text "${text}" --timeout ${timeout}`)
}

// `wait time` is broken in opencli 1.8.7 — it returns in well under a second no
// matter what you ask for, so this used to hand back control before the panel had
// caught up. Sleeping inside the page is accurate. The cli() timeout has to clear
// the sleep itself, or execSync kills the call it is waiting on.
// See backlink/tests/opencli-wait.test.mjs.
function waitTime(sec) {
  const ms = Math.max(0, Math.round(Number(sec) * 1000))
  const js = `(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()`
  cli(`eval '${js}'`, { timeout: ms + 15000 })
}

function click(text) {
  cli(`click --text "${text}"`)
}

/* ── 取证 ─────────────────────────────────────────────────── */
let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("gsc-remove-urls")
  return evidence
}
function scene(tag, extra) {
  return captureScene({
    dir: evidenceDir(),
    tag,
    screenshot: (p) => cli(`screenshot "${p}"`, { timeout: 90000 }),
    pageText: () => cli(`eval '(()=>{try{return document.body?document.body.innerText.slice(0,20000):""}catch(e){return "PAGE_TEXT_FAILED:"+e}})()'`),
    extra,
  })
}
/** results.json 逐条落盘：每处理完一条 URL 就写一次，中止也有账。 */
function persistResults(results, done) {
  try {
    writeFileSync(join(evidenceDir(), "results.json"), JSON.stringify({ property, urls: urls.length, done, results }, null, 2) + "\n")
  } catch (e) { console.error(`（results.json 落盘失败：${String(e?.message || e).slice(0, 200)}）`) }
}

function clickRole(role, name) {
  cli(`click --role "${role}" --name "${name}"`)
}

// ── 主流程 ───────────────────────────────────────────────
console.log(`GSC 移除工具 —— 批量提交「暂时移除网址」`)
console.log(`  资源: ${property}`)
console.log(`  会话: ${session}`)
console.log(`  URL 数量: ${urls.length}`)
console.log()

if (dryRun) {
  console.log("dry-run 模式，只列出 URL：")
  urls.forEach((u, i) => console.log(`  [${i + 1}] ${u}`))
  process.exit(0)
}

// 1. 打开 GSC 移除页面
const gscUrl = `https://search.google.com/search-console/removals?resource_id=${encodeURIComponent(property)}`
console.log(`打开 GSC 移除页面...`)
cli(`open "${gscUrl}" --window dedicated`)

try {
  waitText(L.submittedList, 20000)
} catch {
  // 先取证后死：页面到底停在哪（登录页 / 无权限提示 / 白屏没加载完），截图才分得清。
  scene("open-failed", { url: gscUrl })
  writeManifest(evidenceDir(), { script: "gsc-remove-urls", property, stopReason: "open-failed", finishedAt: new Date().toISOString() })
  console.error(`20 秒内没等到「${L.submittedList}」文案。可能成因（文本层不可分辨，看 ${evidenceDir()} 的截图）：
  1. 浏览器未登录 Google 账号
  2. 该账号没有 ${property} 的 GSC 权限
  3. 页面没加载完 / 界面语言不是中文（改 L 文案表）`)
  if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
  process.exit(1)
}
console.log("  页面已加载\n")

// 2. 逐个提交
const results = []

for (let i = 0; i < urls.length; i++) {
  const url = urls[i]
  console.log(`[${i + 1}/${urls.length}] ${url}`)

  try {
    // 点「新要求」
    click(L.newRequest)
    waitText(L.tempRemoveTab, 10000)
    waitTime(1.5)

    // 填 URL —— 用 eval 直接设值，比 fill/type 更可靠
    // GSC 的 input 是 Material Design 组件，直接 querySelector 找 input[type=url] 或第一个可见 input
    const fillJs = `(()=>{
      const d = document.querySelector('[role=dialog]') || document;
      const inp = d.querySelector('input[type=url]') || d.querySelector('input:not([type=hidden])');
      if (!inp) return 'NO_INPUT';
      inp.focus();
      inp.value = ${JSON.stringify(url)};
      inp.dispatchEvent(new Event('input', {bubbles:true}));
      inp.dispatchEvent(new Event('change', {bubbles:true}));
      return 'OK';
    })()`
    const fillResult = cli(`eval '${fillJs.replace(/'/g, "'\\''")}'`)
    if (fillResult.includes("NO_INPUT")) {
      throw new Error("找不到 URL 输入框")
    }
    waitTime(0.5)

    // 选「仅移除此网址」
    try {
      clickRole("radio", L.removeThisUrl)
    } catch {
      // 备选：用 eval 点击
      cli(`eval '(()=>{const labels=document.querySelectorAll("[role=dialog] label, [role=dialog] span");for(const l of labels){if(l.textContent.includes("仅移除此网址")){l.click();return "OK"}}return "NOT_FOUND"})()'`)
    }
    waitTime(0.5)

    // 点「下一页」
    click(L.nextPage)
    waitText(L.confirmTitle, 10000)
    waitTime(0.5)

    // 点「提交请求」
    click(L.submitRequest)

    // 等待提交完成（"正在提交请求" 消失，列表刷新）
    waitTime(2)
    try {
      waitText(L.submittedList, 15000)
    } catch {
      // 有时 dialog 会卡住，再点一次
      try { click(L.submitRequest) } catch { /* ignore */ }
      waitTime(3)
      waitText(L.submittedList, 15000)
    }

    // 每条提交后截图：submitted 记录的是「走完了点击流程且面板回到列表」，
    // 这条请求有没有真的进「已提交的申请」，以这张截图为准。
    const s = scene(`url-${String(i + 1).padStart(2, "0")}-submitted`, { url })
    console.log(`  ✓ 流程走完（截图 ${s.files[0] ?? "失败：" + s.errors.join("; ")}）`)
    results.push({ url, status: "submitted", scene: s.files, sceneErrors: s.errors })
  } catch (e) {
    console.error(`  ✗ 失败: ${e.message}`)
    const s = scene(`url-${String(i + 1).padStart(2, "0")}-failed`, { url, error: e.message })
    results.push({ url, status: "failed", error: e.message, scene: s.files, sceneErrors: s.errors })

    // 尝试关闭可能残留的 dialog
    try { click("取消") } catch { /* ignore */ }
    waitTime(1)
  }
  // 逐条落盘：中止时已处理的部分也有案可查。
  persistResults(results, i + 1)
}

// 3. 收尾
console.log(`\n─── 结果 ───`)
const ok = results.filter(r => r.status === "submitted").length
const fail = results.filter(r => r.status === "failed").length
console.log(`流程走完: ${ok}/${urls.length}（是否真的进了「已提交的申请」，以每条的截图为准）`)
if (fail > 0) {
  console.log(`流程失败: ${fail}`)
  results.filter(r => r.status === "failed").forEach(r => console.log(`  ${r.url}: ${r.error}`))
}
writeManifest(evidenceDir(), {
  script: "gsc-remove-urls", property,
  submitted: ok, failed: fail, total: urls.length,
  stopReason: fail > 0 ? "completed-with-failures" : "completed",
  finishedAt: new Date().toISOString(),
})
persistResults(results, urls.length)
console.log(`results.json 与每条截图在 ${evidenceDir()}`)

if (!keepSession) {
  try { cli("close") } catch { /* ignore */ }
}

process.exit(fail > 0 ? 1 : 0)
