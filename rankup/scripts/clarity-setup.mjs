#!/usr/bin/env node
/**
 * clarity-setup.mjs —— 在 Microsoft Clarity 里创建项目并拿到追踪 ID，
 * 驱动用户已登录的浏览器，不需要 API key。
 *
 * 用法：
 *   # 查看当前账号下所有项目（只读）
 *   node <rankup-skill-dir>/scripts/clarity-setup.mjs status
 *
 *   # 为指定域名创建新项目，返回 project ID
 *   node <rankup-skill-dir>/scripts/clarity-setup.mjs create --site example.com --name example
 *   node <rankup-skill-dir>/scripts/clarity-setup.mjs create --site example.com --industry Other
 *
 * 标志：
 *   --site <域名>     要追踪的域名（不带协议，例如 example.com）
 *   --name <名称>     项目显示名，默认取 --site 的二级域名
 *   --industry <行业> 网站行业下拉（必填，不选提交按钮会禁用）。默认 Other
 *   --session <名>    opencli 会话名（默认 clarity-setup-<每对话唯一后缀>，不用 pid）
 *   --keep-session    完成后不关闭会话
 *
 * 依赖：opencli，且用户浏览器已登录 clarity.microsoft.com。
 *
 * ── 为什么是浏览器而不是 API ────────────────────────────────
 *
 * Clarity 有 REST API（api.clarity.ms），但截至 2026-08 它只暴露数据读取端点
 * （heatmaps、session recordings、metrics），不暴露项目创建。
 * 创建项目只能走控制台 UI，所以这里用 OpenCLI 自动化。
 *
 * ── 拿到 ID 之后做什么 ────────────────────────────────────
 *
 * 脚本输出 Clarity project ID（形如 `xzmumryb8r`）。把它写进站点的 <head>：
 *
 *   <script>
 *   (function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
 *   t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
 *   y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
 *   })(window, document, "clarity", "script", "<ID>");
 *   </script>
 *
 * 这段代码是公开值（会出现在页面 HTML 里），不是秘密。
 *
 * 已验证：2026-08-23（中文界面）
 *
 * ── 双证人化（2026-08-30，截图链路已实盘验证）────────────────
 * 每步截图落 `.rankup/evidence/clarity-setup-<ts>/`；`execSync("sleep")` 革除；
 * create 不再宣布「✅ 创建成功」——**URL 里出现项目 ID 只说明页面跳到了那里**，
 * 项目建没建好以截图为准；「无法自动提取 ID」路径退出前补截图。
 * 会话名不再用 pid。
 */
import { execSync } from "node:child_process"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

// ── 参数 ──────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") { usage(); process.exit(argv.length === 0 ? 1 : 0) }
const action = argv[0]
let site = null
let name = null
let industry = "Other"
// 会话名：描述性 + 每对话唯一后缀，不用 pid（Bash tool 里每次调用都是新进程）。
let session = `clarity-setup-${sessionSuffix()}`
let keepSession = false

for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--site" && argv[i + 1]) { site = argv[++i]; continue }
  if (a === "--name" && argv[i + 1]) { name = argv[++i]; continue }
  if (a === "--industry" && argv[i + 1]) { industry = argv[++i]; continue }
  if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "-h" || a === "--help") { usage(); process.exit(0) }
  console.error(`未知参数: ${a}`); usage(); process.exit(1)
}

function usage() {
  console.log(`用法:
  node clarity-setup.mjs status
  node clarity-setup.mjs create --site <域名> [--name <项目名>] [--industry <行业>]
  行业下拉必填（不选提交按钮禁用）。默认 Other，也可用 Entertainment / 其他 等实际选项文字。`)
}

if (!["status", "create"].includes(action)) { usage(); process.exit(1) }
if (action === "create" && !site) { console.error("错误：create 需要 --site"); process.exit(1) }
if (action === "create" && !name) name = site.split(".")[0]

// ── OpenCLI 封装 ──────────────────────────────────────────
function cli(action_, { timeout = 30000 } = {}) {
  try {
    return execSync(`opencli browser "${session}" --window background ${action_}`,
      { encoding: "utf-8", timeout, stdio: ["pipe", "pipe", "pipe"] }).trim()
  } catch (e) {
    const err = (e.stderr?.toString() || e.stdout?.toString() || e.message).trim()
    throw new Error(`opencli 失败: ${action_}\n  ${err}`)
  }
}
function evalJs(js) { return cli(`eval '${`(()=>{${js}})()`.replace(/'/g, "'\\''")}'`) }
function open(url) { cli(`open "${url}"`) }
function pageText(max = 4000) {
  return evalJs(`return (document.querySelector('main')||document.body).innerText.replace(/\\n{2,}/g,'\\n').slice(0,${max})`)
}
/** 页内定时器，替换 execSync("sleep")。 */
function settle(ms) {
  cli(`eval '(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()'`, { timeout: ms + 30000 })
}
function waitFor(js, seconds = 15) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try { if (String(evalJs(js)).includes("true")) return true } catch { /* 导航中 */ }
    settle(500)
  }
  return false
}
function waitPageReady(seconds = 20) {
  return waitFor(`return document.readyState==='complete' && ((document.body&&document.body.innerText)||'').length>50`, seconds)
}

/* ── 取证 ─────────────────────────────────────────────────── */
let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("clarity-setup")
  return evidence
}
let sceneN = 0
function scene(tag, extra) {
  sceneN++
  return captureScene({
    dir: evidenceDir(),
    tag: `${String(sceneN).padStart(2, "0")}-${tag}`,
    screenshot: (p) => cli(`screenshot "${p}"`, { timeout: 90000 }),
    pageText: () => { try { return pageText(20000) } catch (e) { return `PAGE_TEXT_FAILED:${e.message}` } },
    extra,
  })
}
function bail(stopReason, msg, extra) {
  try {
    scene(`fail-${stopReason}`, extra)
    writeManifest(evidenceDir(), { script: "clarity-setup", action, site, stopReason, finishedAt: new Date().toISOString() })
    console.error(`现场已落盘：${evidenceDir()}`)
  } catch (e) { console.error(`（取证失败：${String(e?.message || e).slice(0, 200)}）`) }
  console.error(msg)
  if (!keepSession) { try { cli("close") } catch { /* ignore */ } }
  process.exit(1)
}

function stampAndClick(js, label) {
  evalJs(`const el=${js};if(!el)throw new Error('找不到: ${label}');el.setAttribute('data-rankup-target','1')`)
  cli('click "[data-rankup-target=\\"1\\"]"')
  evalJs(`document.querySelector('[data-rankup-target]')?.removeAttribute('data-rankup-target')`)
  scene(`clicked-${label.replace(/[^\w一-鿿-]/g, "_")}`)
}

/** 网站行业下拉是必填项，不选提交按钮一直禁用。兼容 native <select> 和 Fluent combobox。 */
function selectIndustry(wanted) {
  const wantLit = JSON.stringify(wanted)
  const found = evalJs(`
    const want = ${wantLit};
    const norm = s => String(s || "").trim().toLowerCase();
    const wantN = norm(want);
    const isIndustryText = t => /行业|industry|categor(y|ies)|类别/.test(norm(t));
    const controls = [...document.querySelectorAll('select,[role="combobox"],button[aria-haspopup="listbox"],button[aria-haspopup="true"],input[role="combobox"],[class*="Dropdown"],[class*="dropdown"]')];
    let el = controls.find(c => isIndustryText([c.getAttribute("aria-label"), c.getAttribute("placeholder"), c.getAttribute("name"), c.id, c.textContent].join(" ")));
    if (!el) {
      const lab = [...document.querySelectorAll("label,[class*=label],[class*=Label],span,div,p")].find(n => {
        const t = (n.textContent || "").trim();
        return t.length > 0 && t.length < 80 && isIndustryText(t);
      });
      if (lab) {
        const forId = lab.getAttribute("for");
        if (forId) el = document.getElementById(forId);
        if (!el) {
          const root = lab.closest("div,fieldset,li,section,form") || lab.parentElement;
          el = root?.querySelector('select,[role="combobox"],button[aria-haspopup],input,[class*="Dropdown"],[class*="dropdown"]');
        }
      }
    }
    if (!el) throw new Error("找不到行业下拉");
    if (el.tagName === "SELECT") {
      const opts = [...el.options];
      const hit = opts.find(o => norm(o.text) === wantN)
        || opts.find(o => { const t = norm(o.text); return t && (t.includes(wantN) || wantN.includes(t)); })
        || opts.find(o => /^(other|其他|entertainment|娱乐)$/i.test(o.text.trim()));
      if (!hit) throw new Error("行业下拉里没有匹配项: " + want);
      el.value = hit.value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return "select:" + hit.text;
    }
    el.setAttribute("data-rankup-field", "industry");
    return "open";
  `)
  if (String(found).startsWith("select:")) {
    scene("industry-selected", { industry: wanted, via: found })
    return
  }
  stampAndClick(`document.querySelector('[data-rankup-field="industry"]')`, "行业下拉")
  settle(800)
  evalJs(`
    const want = ${wantLit};
    const norm = s => String(s || "").trim().toLowerCase();
    const wantN = norm(want);
    const opts = [...document.querySelectorAll('[role="option"],[role="listbox"] [role="option"],li[role="option"],li,div[class*="option"],button[class*="option"]')];
    const visible = opts.filter(o => o.getAttribute("role") === "option" || o.offsetParent !== null);
    const textOf = o => (o.getAttribute("aria-label") || o.textContent || "").replace(/\\s+/g, " ").trim();
    const hit = visible.find(o => norm(textOf(o)) === wantN)
      || visible.find(o => { const t = norm(textOf(o)); return t && t.length < 80 && (t.includes(wantN) || wantN.includes(t)); })
      || visible.find(o => /^(other|其他|entertainment|娱乐)$/i.test(textOf(o)));
    if (!hit) throw new Error("打开行业下拉后没有匹配项: " + want + " options=" + visible.slice(0, 16).map(textOf).join("|"));
    hit.setAttribute("data-rankup-target", "1");
    return textOf(hit);
  `)
  cli('click "[data-rankup-target=\\"1\\"]"')
  evalJs(`document.querySelector('[data-rankup-target]')?.removeAttribute('data-rankup-target')`)
  scene("industry-selected", { industry: wanted })
  settle(400)
}

// ── status：列出所有项目 ──────────────────────────────────
async function doStatus() {
  open("https://clarity.microsoft.com/projects")
  waitPageReady(20)

  const text = pageText(8000)
  if (text.includes("Sign in") || text.includes("登录")) {
    bail("login-text-seen", "页面文本命中 Sign in/登录——多半未登录 Clarity（也可能是撞词，看截图）。请先在浏览器中登录 clarity.microsoft.com")
  }

  console.log("── Clarity 项目列表 ──")
  console.log(text)
}

// ── create：新建项目 ──────────────────────────────────────
async function doCreate() {
  open("https://clarity.microsoft.com/projects")
  waitPageReady(20)

  const text = pageText()
  if (text.includes("Sign in") || text.includes("登录")) {
    bail("login-text-seen", "页面文本命中 Sign in/登录——多半未登录 Clarity（也可能是撞词，看截图）。请先在浏览器中登录 clarity.microsoft.com")
  }

  // /projects can restore the last dashboard; return via the project header first.
  if (!String(evalJs(`return !!document.querySelector('[data-clarity-id="addNewProjectButton"]')`)).includes("true")) {
    stampAndClick(`document.querySelector('button[class*="myProjectsButton"]')`, "项目列表")
    settle(1000)
  }
  // 点击 "+ Add new project" 按钮
  stampAndClick(
    `document.querySelector('[data-clarity-id="addNewProjectButton"]')`,
    "Add new project 按钮"
  )
  settle(3000)

  // 填写项目名称
  const nameInput = `document.querySelector('input[placeholder*="name" i],input[placeholder*="名称" i],input[type="text"]')`
  evalJs(`const el=${nameInput};if(!el)throw new Error('找不到名称输入框');el.setAttribute('data-rankup-field','name');`)
  cli(`fill '[data-rankup-field=name]' '${name.replace(/'/g, "'\\''")}'`)
  settle(500)

  // 填写网站 URL
  const urlInput = `[...document.querySelectorAll('input[type="text"],input[type="url"]')].find(i=>/url|网站|site/i.test([i.placeholder,i.labels?.[0]?.textContent,i.getAttribute('aria-label')].join(' ')))`
  evalJs(`const el=${urlInput};if(!el)throw new Error('找不到 URL 输入框');el.setAttribute('data-rankup-field','url');`)
  cli(`fill '[data-rankup-field=url]' 'https://${site.replace(/'/g, "'\\''")}'`)
  settle(500)

  // 网站行业下拉是必填项；不选则提交按钮保持 disabled。
  selectIndustry(industry)

  // 点击 "Add" / "添加" 按钮
  stampAndClick(
    `[...document.querySelectorAll('button[type="submit"],button')].find(b=>/^(add|create|add new project|添加|创建|添加新项目)$/i.test(b.textContent.trim()))`,
    "Add/创建 按钮"
  )
  settle(5000)

  // 从跳转后的 URL 或页面内容中提取 project ID
  const finalUrl = evalJs(`return window.location.href`)
  const idMatch = finalUrl.match(/\/projects\/(?:view\/)?(?!view(?:[/?#]|$))([a-z0-9]+)(?:[/?#]|$)/) || finalUrl.match(/projectId=([a-z0-9]+)/)
  if (idMatch) {
    // URL 命中 ≠ 创建成功：页面跳到 /projects/<id> 只说明导航发生了，
    // 项目建没建好（有没有报错横幅）以截图为准。
    scene("create-final", { finalUrl, idFromUrl: idMatch[1] })
    writeManifest(evidenceDir(), { script: "clarity-setup", action, site, name, idFromUrl: idMatch[1], stopReason: "flow-completed", finishedAt: new Date().toISOString() })
    console.log(`create 流程已走完，跳转 URL 中出现项目 ID（是否创建成功以 ${evidenceDir()} 的 create-final 截图为准）`)
    console.log(`   项目名: ${name}`)
    console.log(`   域名:   ${site}`)
    console.log(`   ID:     ${idMatch[1]}（提取自 URL）`)
    console.log(`\n追踪代码:`)
    console.log(`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${idMatch[1]}");`)
    return
  }

  // fallback: 从页面内容提取
  const page = pageText(10000)
  const tagMatch = page.match(/clarity\.ms\/tag\/([a-z0-9]+)/)
  if (tagMatch) {
    scene("create-final", { idFromPage: tagMatch[1] })
    writeManifest(evidenceDir(), { script: "clarity-setup", action, site, name, idFromPage: tagMatch[1], stopReason: "flow-completed", finishedAt: new Date().toISOString() })
    console.log(`create 流程已走完，页面内容中出现追踪 ID（是否创建成功以 ${evidenceDir()} 的 create-final 截图为准）`)
    console.log(`   项目名: ${name}`)
    console.log(`   域名:   ${site}`)
    console.log(`   ID:     ${tagMatch[1]}（提取自页面文本）`)
    return
  }

  // 「无法自动提取 ID」：项目可能建了也可能没建，文本层分不出来——落现场再退出。
  bail("project-id-not-extracted", "create 流程走完但 URL 和页面文本里都没提取到项目 ID。项目建没建成，以截图为准；页面文本前 2000 字已入 extra。", { finalUrl, textHead: page.slice(0, 2000) })
}

// ── 执行 ──────────────────────────────────────────────────
try {
  if (action === "status") await doStatus()
  else await doCreate()
} catch (e) {
  bail("execution-error", e.message)
} finally {
  if (!keepSession) {
    try { cli("close") } catch {}
  }
}
