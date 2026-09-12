#!/usr/bin/env node
/**
 * ahrefs-setup.mjs —— 在 Ahrefs 里添加项目并启动网站审计，
 * 驱动用户已登录的浏览器，不需要 API key。
 *
 * 用法：
 *   # 查看 Dashboard 上的项目列表（只读）
 *   node <rankup-skill-dir>/scripts/ahrefs-setup.mjs status
 *
 *   # 为指定域名创建新项目
 *   node <rankup-skill-dir>/scripts/ahrefs-setup.mjs create --site example.com --name example
 *
 *   # 通过 GSC 验证项目所有权
 *   node <rankup-skill-dir>/scripts/ahrefs-setup.mjs verify --site example.com
 *
 *   # 启用 Web Analytics（总访问量监控）并获取追踪脚本
 *   node <rankup-skill-dir>/scripts/ahrefs-setup.mjs enable-wa --site example.com
 *
 * 标志：
 *   --site <域名>     要追踪的域名（不带协议，例如 example.com）
 *   --name <名称>     项目显示名，默认取 --site 的二级域名
 *   --project-id <ID> 直接指定 Ahrefs 项目 ID，跳过 Dashboard 自动查找
 *   --session <名>    opencli 会话名（默认 ahrefs-setup-<每对话唯一后缀>，不用 pid）
 *   --keep-session    完成后不关闭会话
 *
 * 依赖：opencli，且用户浏览器已登录 app.ahrefs.com。
 *
 * ── 为什么是浏览器而不是 API ────────────────────────────────
 *
 * Ahrefs API v3 只暴露数据查询端点（backlinks、keywords、SERPs），
 * 不暴露项目管理。创建项目 / 启动 Site Audit 只能走 Dashboard UI。
 *
 * ── 关于所有权验证 ────────────────────────────────────────
 *
 * 项目创建后处于「冻结」状态，需要验证所有权才能使用 Site Audit 等功能。
 * `verify` 子命令通过 GSC（谷歌搜索控制台）自动完成验证：
 *   导航到所有权设置 → 展开 GSC 区域 → 选择 Google 账号 → 等待验证 → 保存。
 * 前提：浏览器已登录 Google 且该 Google 账号在 GSC 中拥有目标站点。
 * 如果 Google 弹出授权窗口，需要用户手动点击同意。
 *
 * ── 关于 Web Analytics ──────────────────────────────────────
 *
 * Ahrefs Web Analytics 是 Ahrefs 自有的流量追踪（独立于 GA4）。
 * Dashboard「总访问量」列需要启用它才会显示数据。
 * `enable-wa` 子命令：导航到 Web Analytics 设置 → 提取 data-key → 保存。
 * 保存后需要将输出的 <script> 标签写入站点 <head> 并部署。
 * 注意：TanStack Start 的 head() scripts 不支持 data-* 属性，
 * 需要在 RootDocument 的 JSX <head> 中直接写 <script> 标签。
 *
 * 已验证：2026-08-23（中文界面）
 *
 * ── 双证人化（2026-08-30，截图链路已实盘验证）────────────────
 * 向导每一步（打开 / 每次点击后）都截图落 `.rankup/evidence/ahrefs-setup-<ts>/`；
 * `execSync("sleep")` 全部革除，换页内条件等待；**删除了无条件的「✅ 创建成功」**
 * ——create 只报告「流程分支走完了」这个事实，成没成以最后一张截图为准。
 * 会话名不再用 pid（Bash tool 里每次调用都是新进程）。
 */
import { execSync } from "node:child_process"
import { newEvidenceDir, captureScene, writeManifest, sessionSuffix } from "./lib-scene.mjs"

// ── 参数 ──────────────────────────────────────────────────
const argv = process.argv.slice(2)
if (argv.length === 0 || argv[0] === "-h" || argv[0] === "--help") { usage(); process.exit(argv.length === 0 ? 1 : 0) }
const action = argv[0]
let site = null
let name = null
let projectId = null
let session = `ahrefs-setup-${sessionSuffix()}`
let keepSession = false

for (let i = 1; i < argv.length; i++) {
  const a = argv[i]
  if (a === "--site" && argv[i + 1]) { site = argv[++i]; continue }
  if (a === "--name" && argv[i + 1]) { name = argv[++i]; continue }
  if (a === "--project-id" && argv[i + 1]) { projectId = argv[++i]; continue }
  if (a === "--session" && argv[i + 1]) { session = argv[++i]; continue }
  if (a === "--keep-session") { keepSession = true; continue }
  if (a === "-h" || a === "--help") { usage(); process.exit(0) }
  console.error(`未知参数: ${a}`); usage(); process.exit(1)
}

function usage() {
  console.log(`用法:
  node ahrefs-setup.mjs status
  node ahrefs-setup.mjs create --site <域名> [--name <项目名>]
  node ahrefs-setup.mjs verify --site <域名> [--project-id <ID>]
  node ahrefs-setup.mjs enable-wa --site <域名> [--project-id <ID>]`)
}

if (!["status", "create", "verify", "enable-wa"].includes(action)) { usage(); process.exit(1) }
if (["create", "verify", "enable-wa"].includes(action) && !site) { console.error(`错误：${action} 需要 --site`); process.exit(1) }
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
/** 页内定时器，替换 execSync("sleep")：那是壳层硬睡，页面快时白等、慢时不够。 */
function settle(ms) {
  cli(`eval '(async()=>{await new Promise(r=>setTimeout(r,${ms}));return true})()'`, { timeout: ms + 30000 })
}
/** 条件轮询：js 返回真值或超时。页面导航期间 eval 失败按「还没就绪」继续等。 */
function waitFor(js, seconds = 15) {
  const deadline = Date.now() + seconds * 1000
  while (Date.now() < deadline) {
    try { if (String(evalJs(js)).includes("true")) return true } catch { /* 导航中 */ }
    settle(500)
  }
  return false
}
/** 打开后等页面真的可读，代替原来的 settle(5000/8000) 赌秒数。 */
function waitPageReady(seconds = 20) {
  return waitFor(`return document.readyState==='complete' && ((document.body&&document.body.innerText)||'').length>50`, seconds)
}

/* ── 取证 ─────────────────────────────────────────────────── */
let evidence = null
function evidenceDir() {
  if (!evidence) evidence = newEvidenceDir("ahrefs-setup")
  return evidence
}
let sceneN = 0
function scene(tag, extra) {
  sceneN++
  return captureScene({
    dir: evidenceDir(),
    tag: `${String(sceneN).padStart(2, "0")}-${tag}`,
    screenshot: (p) => cli(`screenshot "${p}"`, { timeout: 90000 }),
    pageText: () => pageText(20000),
    extra,
  })
}
/** 失败退出：现场 → manifest(stopReason) → 关会话 → exit 1。 */
function bail(stopReason, msg, extra) {
  try {
    scene(`fail-${stopReason}`, extra)
    writeManifest(evidenceDir(), { script: "ahrefs-setup", action, site, stopReason, finishedAt: new Date().toISOString() })
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

/** opencli 新版 `type` 要求显式 target（不再支持只传 text 打到当前焦点元素）。
 *  这里复用 stampAndClick 的打标签思路：先用 evalJs 给目标元素打上唯一属性，
 *  再用该属性做 CSS 选择器传给 opencli type <target> <text>。 */
function stampAndType(js, text, label) {
  evalJs(`const el=${js};if(!el)throw new Error('找不到: ${label}');el.setAttribute('data-rankup-target','1')`)
  cli(`type "[data-rankup-target=\\"1\\"]" "${text}"`)
  evalJs(`document.querySelector('[data-rankup-target]')?.removeAttribute('data-rankup-target')`)
  scene(`typed-${label.replace(/[^\w一-鿿-]/g, "_")}`)
}

// ── status：列出所有项目 ──────────────────────────────────
async function doStatus() {
  open("https://app.ahrefs.com/dashboard")
  waitPageReady(25)

  const text = pageText(8000)
  if (text.includes("Log in") || text.includes("Sign in")) {
    bail("login-text-seen", "页面文本命中 Log in/Sign in——多半未登录 Ahrefs（也可能是页面自身内容撞词，看截图）。请先在浏览器中登录 app.ahrefs.com")
  }

  console.log("── Ahrefs 项目列表 ──")
  // 提取项目名和域名
  const projects = evalJs(`
    const cards = document.querySelectorAll('[class*="ProjectCard"],[class*="project"]');
    const items = [];
    cards.forEach(c => {
      const name = c.querySelector('h3,h2,[class*="name"],[class*="Name"]')?.textContent?.trim();
      const domain = c.querySelector('[class*="domain"],[class*="url"]')?.textContent?.trim();
      if (name) items.push(name + ' | ' + (domain || ''));
    });
    return items.length ? items.join('\\n') : document.body.innerText.slice(0, 3000);
  `)
  console.log(projects)
}

// ── create：新建项目 ──────────────────────────────────────
async function doCreate() {
  // 直接导航到手动添加项目页面
  open("https://app.ahrefs.com/add-project/scope")
  waitPageReady(20)

  const text = pageText()
  if (text.includes("Log in") || text.includes("Sign in")) {
    bail("login-text-seen", "页面文本命中 Log in/Sign in——多半未登录 Ahrefs（也可能是页面自身内容撞词，看截图）。请先在浏览器中登录 app.ahrefs.com")
  }

  // 如果到了选择页面（导入/手动），点"手动添加"
  if (text.includes("手动添加") || text.includes("Add manually")) {
    stampAndClick(
      `[...document.querySelectorAll('button,a')].find(b=>/手动添加|Add manually/i.test(b.textContent))`,
      "手动添加按钮"
    )
    settle(3000)
  }

  // 填写域名
  const domainInput = `document.querySelector('input[placeholder*="域" i],input[placeholder*="domain" i],input[placeholder*="路径" i],input[placeholder*="path" i]')`
  evalJs(`const el=${domainInput};if(!el)throw new Error('找不到域名输入框');el.value='';`)
  stampAndType(domainInput, site, "域名输入框")
  settle(1000)

  // 填写项目名称（如果输入框已自动填充则跳过）。
  // 中文界面下这个字段没有 name/id/placeholder 特征（标签在旁边的 <div> 里，
  // 不在 input 属性上），所以英文属性选择器会落空——改成：找所有可见文本
  // input，排除已经填过域名的那个，取第一个空的当作项目名称框；找不到就
  // 退化成"就近找标注为 项目名称/project name 的容器里的 input"。
  const nameInput = `(() => {
    const domainEl = ${domainInput};
    const texts = [...document.querySelectorAll('input[type="text"],input:not([type])')]
      .filter(el => el.offsetParent !== null && el !== domainEl);
    let byLabel = texts.find(el => {
      const label = el.closest('div')?.parentElement?.textContent || '';
      return /项目名称|project name/i.test(label);
    });
    return byLabel || texts.find(el => !el.value);
  })()`
  const currentName = evalJs(`const el=${nameInput};return el?.value||''`)
  if (!currentName || currentName === "") {
    evalJs(`const el=${nameInput};if(el){el.value='';}`)
    stampAndType(nameInput, name, "项目名称输入框")
    settle(500)
  }

  // 等待域名可访问性检查
  console.log("等待域名可访问性检查...")
  settle(8000)

  // 点击"继续"
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b=>/继续|continue|next/i.test(b.textContent))`,
    "继续按钮"
  )
  settle(3000)

  // 第 2 步：Web Analytics（跳过）
  const text2 = pageText()
  if (text2.includes("Web Analytics") || text2.includes("分析功能")) {
    stampAndClick(
      `[...document.querySelectorAll('button,a')].find(b=>/不使用.*继续|skip|跳过/i.test(b.textContent))`,
      "跳过分析按钮"
    )
    settle(3000)
  }

  // 第 3 步：所有权验证（跳过）
  const text3 = pageText()
  if (text3.includes("验证所有权") || text3.includes("Verify ownership")) {
    stampAndClick(
      `[...document.querySelectorAll('button,a')].find(b=>/继续而不验证|skip.*verif|without.*verif/i.test(b.textContent))`,
      "跳过验证按钮"
    )
    settle(2000)
    // 确认弹窗
    const confirm = pageText()
    if (confirm.includes("跳过验证") || confirm.includes("skip verification")) {
      stampAndClick(
        `[...document.querySelectorAll('button')].find(b=>/是的|yes|skip/i.test(b.textContent))`,
        "确认跳过按钮"
      )
      settle(3000)
    }
  }

  // 第 4 步：网站审计（使用默认设置完成）
  const text4 = pageText()
  if (text4.includes("网站审计") || text4.includes("Site Audit")) {
    stampAndClick(
      `[...document.querySelectorAll('button')].find(b=>/完成|finish|done/i.test(b.textContent))`,
      "完成按钮"
    )
    settle(5000)
  }

  // 不再无条件宣布「创建成功」：上面每个分支都是「文案命中才点」，全都没命中时
  // 流程一样会走到这里。只报告事实，成没成以最后一张截图与页面文本为准。
  const finalScene = scene("create-final")
  writeManifest(evidenceDir(), { script: "ahrefs-setup", action, site, name, stopReason: "flow-completed", finishedAt: new Date().toISOString() })
  console.log(`create 流程已走完（走没走到最后一步、项目建没建起来，以 ${evidenceDir()} 里 create-final 的截图与文本为准）`)
  console.log(`   项目名: ${name}`)
  console.log(`   域名:   ${site}`)
  console.log(`   （新建项目通常处于「冻结」状态，需验证所有权后激活 Site Audit）`)
  console.log(`\n验证方式推荐:`)
  console.log(`  - DNS TXT 记录（可通过 Cloudflare API 自动添加）`)
  console.log(`  - HTML 标签（写入站点 <head>）`)
  console.log(`  - 谷歌搜索控制台（如果已连接 Google 账号）`)
}

// ── 共通：Dashboard から項目 ID を取得 ──────────────────────
function findProjectId() {
  if (projectId) {
    console.log(`使用指定的项目 ID: ${projectId}`)
    return projectId
  }

  open("https://app.ahrefs.com/dashboard")
  waitPageReady(25)

  const text = pageText(8000)
  if (text.includes("Log in") || text.includes("Sign in")) {
    bail("login-text-seen", "页面文本命中 Log in/Sign in——多半未登录 Ahrefs（也可能是页面自身内容撞词，看截图）。请先在浏览器中登录 app.ahrefs.com")
  }

  let foundId = evalJs(`
    const links = [...document.querySelectorAll('a[href*="/project-settings/"]')];
    const results = [];
    for (const link of links) {
      const id = link.href.match(/project-settings\\/(\\d+)/)?.[1];
      if (!id) continue;
      let el = link.parentElement;
      let depth = 0;
      while (el && el !== document.body && depth < 8) {
        depth++;
        const count = el.querySelectorAll('a[href*="/project-settings/"]').length;
        if (count > 1) break;
        const ownText = el.textContent || '';
        if (ownText.includes('${site}')) {
          results.push({ id, depth });
          break;
        }
        el = el.parentElement;
      }
    }
    if (results.length === 1) return results[0].id;
    if (results.length > 1) {
      results.sort((a, b) => a.depth - b.depth);
      return results[0].id;
    }
    return '';
  `)

  if (!foundId) {
    bail("project-id-not-found", `Dashboard 上没解析到域名 ${site} 对应的项目链接（「没有这个项目」与「页面没渲染完/改版」看截图分辨）。
   请使用 --project-id <ID> 手动指定，或先用 create 创建。项目 ID 可在项目设置页 URL 中找到。`)
  }

  return foundId
}

// ── verify：通过 GSC 验证所有权 ─────────────────────────────
async function doVerify() {
  const projectId = findProjectId()
  await doVerifyWithId(projectId)
}

async function doVerifyWithId(projectId) {
  console.log(`项目 ID: ${projectId}，导航到所有权验证页面...`)

  // 1. 导航到所有权验证设置页
  open(`https://app.ahrefs.com/project-settings/${projectId}/ownership`)
  settle(5000)

  // 2. 展开「谷歌搜索控制台（建议）」折叠区域。
  // 实盘验证过（2026-09-10）：这个 Ahrefs 页面是 css-in-js 出来的哈希类名，
  // 没有任何 accordion/Accordion/details/section 标记——折叠标题就是一个
  // textContent 精确等于"谷歌搜索控制台（建议）"的最小 DIV，点它本身
  // （它自己挂了 onclick，cursor:pointer）。展开状态用"标题后面紧跟的正文
  // 是否已经出现"选择谷歌账号/连接您的谷歌帐号"这类展开态才有的文案"判断，
  // 而不是找 class 或 aria-expanded（页面上都没有）。
  const gscLabelJs = `[...document.querySelectorAll('div')].filter(el=>/谷歌搜索控制台|Google Search Console/i.test(el.textContent)).sort((a,b)=>a.textContent.length-b.textContent.length)[0]`
  const alreadyExpanded = evalJs(`
    const gsc = ${gscLabelJs};
    if (!gsc) return 'not_found';
    const t = document.body.innerText;
    const idx = t.indexOf(gsc.textContent.trim());
    const after = idx >= 0 ? t.slice(idx, idx + 200) : '';
    return /选择谷歌账号|连接您的谷歌帐号|Select.*Google.*account|Connect.*Google/i.test(after) ? 'expanded' : 'collapsed';
  `)

  if (alreadyExpanded === 'collapsed') {
    stampAndClick(gscLabelJs, "GSC 折叠标题")
    settle(2000)
  } else if (alreadyExpanded === 'not_found') {
    bail("gsc-section-not-found", "找不到 GSC 验证区域。页面结构可能已变化——现在长什么样，看截图。")
  }

  // 3. 检查是否已验证
  const verified = evalJs(`return document.body.innerText.includes('所有权已验证') || document.body.innerText.includes('Ownership verified')`)
  if (verified === "true") {
    console.log(`✅ ${site} 已通过 GSC 验证，无需再次操作。`)
    return
  }

  // 4. 点击「选择谷歌账号」下拉框
  stampAndClick(
    `[...document.querySelectorAll('button,[role="button"],[role="listbox"],[class*="select"],[class*="Select"],[class*="dropdown"],[class*="Dropdown"]')].find(el=>/选择谷歌账号|Select.*Google.*account|选择帐号/i.test(el.textContent))`,
    "选择谷歌账号下拉框"
  )
  settle(3000)

  // 5. 从下拉选项中选择第一个 Google 账号
  stampAndClick(
    `[...document.querySelectorAll('[role="option"],li[class*="option"],div[class*="option"],button[class*="option"]')].find(el => el.textContent.includes('@'))`,
    "Google 账号选项"
  )
  settle(8000)

  // 6. 等待验证完成（绿色横幅出现）
  let attempts = 0
  let isVerified = false
  while (attempts < 6 && !isVerified) {
    const check = evalJs(`return document.body.innerText.includes('所有权已验证') || document.body.innerText.includes('Ownership verified') || document.body.innerText.includes('已通过谷歌搜索控制台验证')`)
    if (check === "true") {
      isVerified = true
      break
    }
    settle(5000)
    attempts++
  }

  if (!isVerified) {
    bail("verify-banner-not-seen", "等了 6 轮没见到「所有权已验证」横幅。可能在等 Google 授权弹窗（需要用户手动同意）——当前卡在哪一步，看截图；手动完成授权后重新运行。")
  }

  // 7. 点击「保存」按钮
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b=>/^保存$|^Save$/i.test(b.textContent.trim()))`,
    "保存按钮"
  )
  settle(3000)

  // 「已验证」横幅是页面自己说的（上面轮询到才走到这），「已保存」是我们点了保存按钮——
  // 保存有没有生效以截图为准。
  scene("verify-final")
  console.log(`${site}：页面出现「所有权已验证」横幅，已点击保存（保存结果以 ${evidenceDir()} 的 verify-final 截图为准）`)
}

// ── enable-wa：启用 Web Analytics 并获取追踪脚本 ────────────
async function doEnableWa() {
  const projectId = findProjectId()
  console.log(`项目 ID: ${projectId}，导航到 Web Analytics 设置...`)

  // 1. 导航到 Web Analytics 设置页
  open(`https://app.ahrefs.com/project-settings/${projectId}/web-analytics`)
  settle(5000)

  // 2. 提取 data-key
  const dataKey = evalJs(`
    const codeBlock = document.querySelector('code,pre,[class*="code"],[class*="Code"]');
    if (codeBlock) {
      const m = codeBlock.textContent.match(/data-key="([^"]+)"/);
      if (m) return m[1];
    }
    const text = document.body.innerText;
    const m2 = text.match(/data-key="([^"]+)"/);
    if (m2) return m2[1];
    const m3 = text.match(/数据密钥值[：:] *([A-Za-z0-9+/=]+)/);
    return m3?.[1] || '';
  `)

  if (!dataKey) {
    bail("data-key-not-found", "无法从页面提取 data-key，页面结构可能已变化——页面现在长什么样，看截图。")
  }

  console.log(`   data-key: ${dataKey}`)

  // 3. 点击「保存」按钮
  stampAndClick(
    `[...document.querySelectorAll('button')].find(b=>/^保存$|^Save$/i.test(b.textContent.trim()))`,
    "保存按钮"
  )
  settle(5000)

  scene("enable-wa-final")
  console.log(`\nWeb Analytics 设置页已提取到 data-key 并点击了保存（是否真的启用，以 ${evidenceDir()} 的 enable-wa-final 截图为准）`)
  console.log(`   项目 ID: ${projectId}`)
  console.log(`   域名:    ${site}`)
  console.log(`   data-key: ${dataKey}`)
  console.log(`\n追踪脚本（写入站点 <head>）:`)
  console.log(`<script async src="https://analytics.ahrefs.com/analytics.js" data-key="${dataKey}"></script>`)
  console.log(`\n⚠️  TanStack Start 注意: head() 的 scripts 不支持 data-* 属性，`)
  console.log(`   需要在 RootDocument 的 JSX <head> 中直接写 <script> 标签。`)
}

// ── 执行 ──────────────────────────────────────────────────
try {
  if (action === "status") await doStatus()
  else if (action === "verify") await doVerify()
  else if (action === "enable-wa") await doEnableWa()
  else await doCreate()
} finally {
  if (!keepSession) {
    try { cli("close") } catch {}
  }
}
