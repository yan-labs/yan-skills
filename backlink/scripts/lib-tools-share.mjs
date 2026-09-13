/**
 * lib-tools-share.mjs — 共享账号面板的启动器，**唯一一份**。
 *
 * 面板是一个共享订阅代理：订阅挂在它上面，每张卡片的「打开」按钮临时给你签一张
 * 进入该工具自有域名的会话票。**在点「打开」之前直接深链到工具域名会落到空白页**——
 * 建立会话的正是那次点击，所以这一步永远跳不过去。
 *
 * 为什么要抽成 lib：这套启动流程有四个必须踩对的细节（会话焊死、卡片是 logo 图、
 * nb-select 水合晚、节点会挂），任何一个抄漏都表现为「脚本坏了」而不是「启动失败」。
 * 之前 similarweb-query.mjs 自己写了一份简化版启动器，漏掉了其中三个，
 * 于是稳定报 shared_proxy_blank_or_unavailable。**要用就用这一份。**
 *
 * 本模块从不输入密码。面板未登录就明确报错并停下，登录是机主自己在自己的 Chrome 里做的事。
 * 已验证 2026-08-26：同一 session 已在目标工具页时必须原地复用；重复打开 dashboard
 * 可能被面板计作新的客户端登录。
 */
import {
  defaultSession, firstJson, guardSessionName, normalizeWindowMode, opencli, quotaSession, sessionForUrl,
} from './opencli-core.mjs';
import {
  VIRTUAL_DISPLAY_WINDOW, createAutomationWindow, defaultAutomationDeps, fallbackHint, resolveDisplayMatcher,
} from './lib-automation-window.mjs';
import { readFileSync } from 'node:fs';
import { rmSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const DEFAULT_DASHBOARD = 'https://dash.3ue.co/zh-Hans/#/page/m/home';

// 卡片按自己的标签识别，不按位置：面板按订阅顺序渲染，加一个套餐或到期一个就会错位。
/**
 * Skill 根目录的 `.env`（已被 .gitignore 排除）里存放面板令牌等账号配置。
 * Node 不会自动加载它，而这些脚本是直接 `node scripts/x.mjs` 跑的，没有外层加载器，
 * 所以在这里读一次。**已存在的环境变量优先**，不覆盖调用方显式传入的值。
 */
function loadSkillEnv() {
  try {
    const file = new URL('../.env', import.meta.url);
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, '');
      if (value && process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  } catch { /* 没有 .env 是正常情况，走面板登录即可 */ }
}
loadSkillEnv();

export const TOOLS = {
  similarweb: { label: /PRO\s*全球版|similarweb/i, origin: 'sim.3ue.co', name: 'Similarweb PRO', tokenEnv: 'SIM_GMITM' },
  semrush:    { label: /GURU|地区数据库|semrush/i,  origin: 'sem.3ue.co', name: 'Semrush GURU', tokenEnv: 'SEM_GMITM' },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Tools Share 会按账号统计并发与请求频率。真实 Chrome 不等于真人节奏：多个 agent
 * 仍会共用同一张会话票，同时撞同一上游。用 mkdir 的原子性做跨进程单实例锁，避免
 * 两个脚本同时消耗同一个账号；锁文件只记 PID，不读取、更不落盘令牌。
 */
export async function acquireToolsShareLock(toolKey, {
  timeoutMs = 10 * 60_000,
  pollMs = 500,
  lockRoot = tmpdir(),
} = {}) {
  const key = String(toolKey || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!key) throw new Error('A tool key is required for the Tools Share lock.');
  const path = join(lockRoot, `yan-tools-share-${key}.lock`);
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      await mkdir(path);
      await writeFile(join(path, 'owner.json'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
      let released = false;
      return {
        path,
        async release() {
          if (released) return;
          released = true;
          await rm(path, { recursive: true, force: true });
        },
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      // 崩溃遗留的锁可以回收；活进程的锁必须等，不能靠换 OpenCLI session 绕开。
      let owner = null;
      try { owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')); } catch { /* mkdir 与写 owner 之间的短窗口 */ }
      if (Number.isInteger(owner?.pid)) {
        try { process.kill(owner.pid, 0); } catch (probe) {
          if (probe?.code === 'ESRCH') { await rm(path, { recursive: true, force: true }); continue; }
        }
      }
      if (Date.now() >= deadline) {
        throw new Error(`Another ${key} Tools Share job is still running; waited ${Math.round(timeoutMs / 1000)}s and stopped without querying.`);
      }
      await sleep(pollMs);
    }
  }
}

export async function acquireToolsShareBrowserLocks(session, tool, options = {}) {
  const locks = [];
  try {
    for (const key of ['opencli-session-' + session, tool]) {
      locks.push(await acquireToolsShareLock(key, { timeoutMs: options.timeoutMs ?? 10 * 60_000, lockRoot: options.lockRoot }));
    }
  } catch (error) {
    await Promise.all(locks.reverse().map((lock) => lock.release()));
    throw error;
  }
  let released = false;
  const onExit = () => {
    if (released) return;
    released = true;
    for (const lock of locks.slice().reverse()) {
      try { rmSync(lock.path, { recursive: true, force: true }); } catch {}
    }
  };
  process.once('exit', onExit);
  return {
    async release() {
      if (released) return;
      released = true;
      process.removeListener('exit', onExit);
      await Promise.all(locks.reverse().map((lock) => lock.release()));
    },
    keys: ['opencli-session-' + session, tool],
  };
}

const BLOCKED_PAGE = /(?:登录|登入|login|session|会话).{0,20}(?:过期|失效|无效|expired|invalid)|(?:冻结|封禁|冷却|cooldown|frozen|temporarily blocked|too many requests|请求过于频繁)/i;

/** 返回可公开的原因，不返回页面正文，避免错误日志夹带会话信息。 */
export function toolsShareBlockReason({ url = '', title = '', bodyText = '' } = {}) {
  let host = '';
  let path = '';
  let message = '';
  try {
    const parsed = new URL(url);
    host = parsed.hostname;
    path = parsed.pathname;
    message = parsed.searchParams.get('msg') || '';
  } catch { /* 非 URL 交给正文判据 */ }
  if (host === 'gmitm.redirect.dash' || host.endsWith('.gmitm.redirect.dash')) return 'Tools Share redirected to its access-denied page';
  // 实际错误页仍挂在工具 host 下：/gmitm.redirect.dash?msg=登录过期或无效。
  if (path === '/gmitm.redirect.dash' || BLOCKED_PAGE.test(`${message}\n${title}\n${bodyText}`)) {
    return 'Tools Share session is expired, frozen, or cooling down';
  }
  return null;
}

export function assertToolsShareAvailable(capture) {
  const reason = toolsShareBlockReason(capture);
  if (reason) {
    const error = new Error(`${reason}; stopped immediately without retrying.`);
    error.code = 'TOOLS_SHARE_BLOCKED';
    throw error;
  }
  return capture;
}

export function isReusableToolCapture(capture, origin) {
  let host = '';
  try { host = new URL(capture?.url || '').hostname; } catch { return false; }
  const bodyLength = Number(capture?.len) || String(capture?.bodyText || '').trim().length;
  return (host === origin || host.endsWith(`.${origin}`)) && bodyLength > 40;
}

/** 启动 URL 的查询串里带会话令牌。**任何时候都不要打印它。** */
export const scrub = (url) => String(url || '').split('?')[0];

/**
 * 把令牌从**任意一段文本**里抹掉，用于所有会被打印或写盘的错误消息。
 *
 * 为什么不是「小心点别打印」就够了：令牌是**经由第三方的输出**漏出来的。
 * `opencli` 命令失败时会把当前活动会话连同完整 URL 打进 stderr，
 * 而 `run()` 会把那段 stderr 原样抛成 Error.message，脚本再把它塞进
 * `output.error.message` —— 于是 `printJson` 打出来、`--out` 写进文件、
 * 整段进日志。2026-08-24 实测到一次：`__gmitm=<redacted>` 完整出现在报错里。
 * **凡是要外发的错误文本都要过这一层**，别指望每个调用点自己记得。
 */
export function redactSecrets(text) {
  let out = String(text ?? '');
  out = out.replace(/([?&]__gmitm=)[^&\s"'\\]+/gi, '$1<redacted>');
  for (const tool of Object.values(TOOLS)) {
    const token = (process.env[tool.tokenEnv] || '').trim();
    if (token.length >= 8) out = out.split(token).join('<redacted>');
  }
  return out;
}

/**
 * 复用探针。**注意 `vis`**：它和 url/title/len 在同一次 eval 里取回来，
 * 所以判可见性不多花一个 round-trip —— 这正是「探测再决定」比「直接禁用复用」划算的原因。
 */
export const REUSE_PROBE = '(() => { const bodyText = (document.body?.innerText||"").trim(); return JSON.stringify({ url: location.href, title: document.title, vis: document.visibilityState, len: bodyText.length, bodyText: bodyText.slice(0, 1000) }); })()';

/**
 * 复用快路径要不要认这张标签页。导出只为可测。
 *
 * 2026-08-28 实测（同一条 `/analytics/traffic/top-pages/`、同一 session/lid/域名/月份，
 * 唯一变量是读取瞬间的 `document.visibilityState`）：
 *   紧接 foreground 全新 launch → visible → 850 个非空单元格
 *   复用已有会话、未重新 launch  → hidden  → 0 个非空单元格
 *   close 会话后 foreground 全新 launch → visible → 850 个非空单元格
 *
 * 机制：把窗口抬到前台的是面板上点「打开」那一下，而复用快路径**不点卡片**，
 * 于是标签页停在 hidden，后续页内导航出来的报表永远卡在半水合。
 * 所以 `semrush-traffic.mjs` 的 `DEFAULT_WINDOW = 'foreground'` 单靠自己不够：
 * 它只在走完整启动流程时生效，复用会绕过去。
 *
 * 判据只在调用方**要求 foreground 或 active** 时才收紧：background/isolated 调用方
 * 是明确不要抢焦点的（见 SKILL.md 的 background-by-default），不能因为这条修复把它们
 * 全推去抢窗口。
 *
 * 2026-09-14 加入 `active`：它和 `foreground` 一样是"调用方明确要这个标签页可见/
 * 不节流"的请求，只是不夺 OS 焦点；`hidden` 判据要认的是"调用方想不想要可见"，
 * 不是"愿不愿意抢 OS 焦点"，所以这两档要一起收紧。`background`/`isolated` 仍然
 * 保持旧行为不变——它们从来没有触发过这条 relaunch 分支，这次也不会。
 *
 * 2026-09-14 再加入 `dedicated`：它和 foreground/active 同属"调用方明确要可见"这一档——
 * dedicated 窗口默认开着 auto-select（契约：每次页面级命令前都把会话标签页选成活动
 * 标签），意图就是保持可见，不是"不在乎可不可见"。复用快路径不点卡片、不触发这次
 * auto-select，如果探针读到 hidden，说明这次复用不会真的可见（窗口被恢复中/摆放中/
 * 扩展状态还没追上），必须和 foreground/active 一样拒绝复用、close 掉让完整启动流程
 * 重新来一遍——而不是被当成"不要求可见"的 background/isolated 悄悄放过去。
 */
export function reuseDecision(capture, { origin, windowMode } = {}) {
  if (!isReusableToolCapture(capture, origin)) return { reuse: false, relaunch: false, reason: 'not-on-tool-origin' };
  if ((windowMode === 'foreground' || windowMode === 'active' || windowMode === 'dedicated') && capture?.vis === 'hidden') {
    return { reuse: false, relaunch: true, reason: 'hidden-tab' };
  }
  return { reuse: true, relaunch: false, reason: 'existing-tool-session' };
}

/**
 * 跑一次复用探针并按 reuseDecision 处置。**最多 close 一次、绝不自我重入**——
 * 拒绝复用之后就交回给调用方走完整启动流程，那条路自己会点卡片、把窗口抬起来。
 * 因此「hidden → close → 又 hidden」不会变成循环：每次 launchToolInner 只探一次。
 */
export async function attemptToolSessionReuse({ evalPage, origin, windowMode, closeSession }) {
  let capture;
  try {
    capture = assertToolsShareAvailable(await evalPage(REUSE_PROBE));
  } catch (error) {
    if (error?.code === 'TOOLS_SHARE_BLOCKED') throw error;
    if (!/No active session|No tab with given id|session.+not found/i.test(String(error?.message || ''))) throw error;
    return { reused: false, closed: false, reason: 'no-session', capture: null };
  }
  const decision = reuseDecision(capture, { origin, windowMode });
  if (decision.reuse) return { reused: true, closed: false, reason: decision.reason, capture };
  if (decision.relaunch) {
    await closeSession?.();
    return { reused: false, closed: true, reason: decision.reason, capture };
  }
  return { reused: false, closed: false, reason: decision.reason, capture };
}

/**
 * launchToolInner 的 env 组装，抽成纯函数是为了能直接断言——不用真的起 opencli 子进程
 * 就能钉住"dedicated 的 slot/display 只在 automationWindow 真正走了 dedicated 策略时
 * 才出现"这条规则。`opencliEnv` 来自 `automationWindow.opencliEnv`（见
 * lib-automation-window.mjs）：非 dedicated 时恒为 `{}`，这里的行为就退回接入前的
 * 唯一一行，一字不差。
 */
export function buildToolLaunchEnv(windowMode, opencliEnv = {}) {
  return { OPENCLI_WINDOW: normalizeWindowMode(windowMode, 'background'), ...opencliEnv };
}

/**
 * 打开面板、（可选）选节点、点「打开」、等落到工具域名。
 * 返回 { evalPage, state, landed, tool }，evalPage 已绑定会话，供调用方继续驱动工具页。
 */
async function launchToolInner({
  session,
  tool: toolKey,
  node,
  window: windowMode = 'background',
  opencliEnv = {},
  wait = 7,
  timeout = 40,
  evalTimeoutMs = 60_000,
  dashboardUrl = process.env.TOOLS_SHARE_DASHBOARD_URL || DEFAULT_DASHBOARD,
}) {
  const tool = TOOLS[String(toolKey || '').toLowerCase()];
  if (!tool) throw new Error(`tool must be one of: ${Object.keys(TOOLS).join(', ')}`);
  // 单一入口：foreground/active/background/isolated/dedicated 五档原样透传给 opencli，
  // 不认识的值退回 background（见 opencli-core.mjs 的 normalizeWindowMode 注释）。
  // dedicated 时 opencliEnv 还带着 OPENCLI_WINDOW_SLOT/_DISPLAY，让面板导航、eval 等
  // 后续调用都落在 automationWindow 摆好的那扇 dedicated 窗口里,而不是被扩展当成
  // 一个没有 slot 的新窗口。
  const env = buildToolLaunchEnv(windowMode, opencliEnv);

  const evalPage = async (expression, timeoutMs = evalTimeoutMs) =>
    firstJson((await opencli(['browser', session, 'eval', expression], { env, timeoutMs })).stdout);

  // 同一任务会连续查很多域名/关键词。先复用已经停在目标工具 origin 的 session；
  // dashboard 每次打开都可能被平台计作一个新客户端登录，不能拿它当普通导航页反复进。
  const reuse = await attemptToolSessionReuse({
    evalPage,
    origin: tool.origin,
    windowMode,
    closeSession: () => opencli(['browser', session, 'close'], { env, timeoutMs: 30_000 }).catch(() => {}),
  });
  if (reuse.reused) {
    return {
      tool,
      state: { loggedIn: true, cards: [], expiry: null, daysLeft: null, quotas: [], via: 'existing-tool-session' },
      landed: { url: scrub(reuse.capture.url), title: reuse.capture.title },
      visibilityState: reuse.capture.vis ?? null,
      evalPage, env, index: -1, reused: true,
    };
  }

  // ── 直连兜底 ───────────────────────────────────────────────────────────────
  // 面板的 dashboard 登录态**会单独掉**，而工具域的会话令牌此时往往还活着
  // （2026-08-21 实测：dashboard 判为未登录，同一时刻带令牌直连 sem 域正常出数）。
  // 所以令牌在环境里就先走直连，省掉整套面板交互，也省掉节点挑选。
  // **令牌是密钥**：只从环境读，永远不要打印、不要写进 .rankup、不要提交。
  // 代价：直连拿不到订阅到期与配额（面板才有），state 里这几项为 null，
  // 调用方的 expiryWarning() 因此静默——这是已知取舍，不是 bug。
  const directToken = (process.env[tool.tokenEnv] || '').trim();
  if (directToken) {
    const entry = `https://${tool.origin}/home/?__gmitm=${encodeURIComponent(directToken)}`;
    await opencli(['browser', session, 'open', entry], { env, timeoutMs: 90_000 });
    await sleep(Math.max(4, Number(wait)) * 1000);
    const here = assertToolsShareAvailable(await evalPage('(() => { const bodyText = (document.body?.innerText||"").trim(); return JSON.stringify({ url: location.href, title: document.title, len: bodyText.length, bodyText: bodyText.slice(0, 1000) }); })()'));
    const onTool = (() => { try { return new URL(here.url).hostname.endsWith(tool.origin); } catch { return false; } })();
    if (onTool && here.len > 40) {
      return {
        tool,
        state: { loggedIn: true, cards: [], expiry: null, daysLeft: null, quotas: [], via: 'direct-token' },
        landed: { url: scrub(here.url), title: here.title },
        evalPage, env, index: -1,
      };
    }
    // 直连没成立就继续走面板，令牌可能已过期。**不要在这里抛错**——
    // 抛了就把一条还能走的路（面板登录态尚在）也堵死了。
  }

  await opencli(['browser', session, 'open', dashboardUrl], { env, timeoutMs: 90_000 });
  await sleep(wait * 1000);

  // **会话会卡在上一次落地的工具 origin 上。** 点过一次「打开」之后这个会话的标签页就在
  // sim/sem 那边了；再 open 面板**不保证**导航回来。表现是面板上一个 nb-select 都找不到，
  // 看起来完全像选择器写错了，能查很久。判据是当前 host。
  const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
  const panelHost = new URL(dashboardUrl).hostname;
  {
    const here = await evalPage('JSON.stringify({ url: location.href })');
    if (hostOf(here.url) !== panelHost) {
      await opencli(['browser', session, 'close'], { env, timeoutMs: 30_000 }).catch(() => {});
      await opencli(['browser', session, 'open', dashboardUrl], { env, timeoutMs: 90_000 });
      await sleep(wait * 1000);
      const retry = await evalPage('JSON.stringify({ url: location.href })');
      if (hostOf(retry.url) !== panelHost) {
        throw new Error(
          `This OpenCLI session is stuck on ${hostOf(retry.url) || 'an unknown page'} and will not navigate back ` +
            `to the panel; close + open did not recover it. Do not debug the selectors — they are fine. ` +
            `Rerun with a fresh --session name, or do this one by hand in the owner's Chrome. ` +
            `See references/authorized-data-sources.md → "节点会挂，会话会焊死".`,
        );
      }
    }
  }

  // 面板是 Angular SPA，首屏经常要 20-40 秒才渲染，期间 body.innerText 是空白。
  // **空白页和「未登录」在这里长得一模一样**，而下面的 loggedIn 判据（没有卡片 = 未登录）
  // 会把前者读成后者，抛出一条「请手动登录」——于是人跑去看，发现明明是登录着的。
  // 2026-08-21 实测：连抛两次，reload 一次之后面板正常显示订阅到期 2027-02-21。
  // 所以先轮询等「渲染完成」，只有渲染完了才允许判断登录态。
  const readPanel = () => evalPage(`(() => {
    const text = (document.body?.innerText || '').replace(/\\s+/g, ' ');
    return JSON.stringify({ len: text.trim().length, hasCard: /打开/.test(text), text: text.slice(0, 200) });
  })()`);
  {
    const deadline = Date.now() + Math.max(60, Number(wait) * 4) * 1000;
    let seen = await readPanel();
    while (!seen.hasCard && Date.now() < deadline) {
      await evalPage(`(() => { location.reload(); return JSON.stringify({ r: 1 }); })()`).catch(() => {});
      await sleep(12_000);
      seen = await readPanel();
    }
    if (!seen.hasCard && seen.len < 40) {
      throw new Error(
        'Tools Share panel never rendered (body is blank after reloads). This is NOT a logged-out panel — '
        + 'a logged-out one still renders text. Most likely a dead node or a slow SPA boot; '
        + 'open the panel by hand in the owner\'s Chrome and check, or retry with a fresh --session.',
      );
    }
  }

  const state = await evalPage(`(() => {
    const text = document.body.innerText.replace(/\\s+/g, ' ');
    const cards = [...document.querySelectorAll('button')]
      .filter((b) => /^打开$/.test((b.innerText || '').trim()))
      .map((b) => {
        let card = b;
        for (let i = 0; i < 10 && card; i += 1) {
          const parent = card.parentElement;
          if (!parent) break;
          card = parent;
          if (/倍率/.test(card.innerText) && card.innerText.length < 400) break;
        }
        return (card.innerText || '').replace(/\\s+/g, ' ').trim();
      });
    const expiry = (text.match(/到期时间\\s*([0-9-]{8,10}\\s*[0-9:]{4,5})/) || [])[1] || null;
    const daysLeft = (text.match(/剩余天数\\s*(\\d+)/) || [])[1] || null;
    const quotas = [...text.matchAll(/API\\s*今日配额\\s*(\\d+%)/g)].map((m) => m[1]);
    return JSON.stringify({
      loggedIn: !/没有账号|去注册/.test(text) && cards.length > 0,
      cards, expiry, daysLeft: daysLeft ? Number(daysLeft) : null, quotas,
    });
  })()`);

  if (!state.loggedIn) {
    // 到这里页面确定已经渲染过了（上面的轮询保证），所以「没有卡片」才真的意味着未登录。
    throw new Error(
      `Tools Share is not logged in for this Chrome profile. Sign in manually at ${dashboardUrl} — ` +
        'this script does not handle credentials.',
    );
  }

  const index = state.cards.findIndex((label) => tool.label.test(label));
  if (index === -1) {
    throw new Error(
      `No card matching ${tool.name} on the panel. Cards present: ${JSON.stringify(state.cards)}. ` +
        'The subscription may have changed — update TOOLS in lib-tools-share.mjs rather than guessing an index.',
    );
  }

  // 节点：每张卡片一个「选择节点」下拉（节点1..N）。**节点会挂**——挂掉的节点点「打开」后
  // 落到空白页或长时间不渲染，看起来完全像脚本坏了，换一个节点即可。下拉里的「倍率」是
  // 配额消耗速率，没有特别理由就用 X 1 的。**这一段必须在点「打开」之前跑**：点完之后
  // 标签页已经在工具域，面板上什么都找不到了。
  if (node) {
    const wanted = `节点${String(node).trim().replace(/^节点/, '')}`;
    // 面板是 Angular + Nebular：节点选择器是 <nb-select>，触发器是它内部的
    // button.select-button，选项是 <nb-option>。三点实测教训：
    //   1. 卡片上的产品名是 **logo 图片**，没有文字——按卡片文案找卡片会找不到。
    //      产品名真正出现在节点选择器自己的文案里（「节点3 倍率 X 1 🔖 PRO 全球版」），
    //      所以直接在 nb-select 里按 label 挑。
    //   2. 触发器带子元素，用 children.length === 0 过滤会把它整个漏掉。
    //   3. **eval 必须 JSON.stringify 再返回**。返回裸对象经 opencli 序列化后
    //      firstJson 解析不出字段，表现为 seen 永远是 []，会被误判成「页面上没有节点选择器」。
    // Angular 水合比「打开」按钮出现晚：state 已读到卡片时 nb-select 可能还是 0 个，所以轮询。
    let picked = { ok: false, why: 'node selector never appeared', seen: [] };
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      picked = await evalPage(`(() => {
        const selects = [...document.querySelectorAll('nb-select')];
        const texts = selects.map((e) => (e.innerText || '').trim());
        const i = texts.findIndex((t) => /^节点\\d+/.test(t) && ${tool.label}.test(t));
        if (i < 0) return JSON.stringify({ ok: false, why: 'no node selector matches this tool', seen: texts });
        const btn = selects[i].querySelector('button.select-button') || selects[i];
        btn.click();
        return JSON.stringify({ ok: true, current: texts[i] });
      })()`);
      if (picked.ok) break;
      await sleep(1000);
    }
    if (!picked.ok) {
      throw new Error(`Could not open the node selector: ${picked.why}. Seen: ${JSON.stringify(picked.seen || [])}`);
    }
    await sleep(1200);
    const chosen = await evalPage(`(() => {
      const opts = [...document.querySelectorAll('nb-option')];
      const texts = opts.map((e) => (e.innerText || '').trim());
      const i = texts.findIndex((t) => t.startsWith(${JSON.stringify(wanted)} + ' '));
      if (i < 0) return JSON.stringify({ ok: false, options: texts });
      opts[i].click();
      return JSON.stringify({ ok: true, picked: texts[i] });
    })()`);
    if (!chosen.ok) throw new Error(`Node "${wanted}" not offered. Available: ${JSON.stringify(chosen.options)}`);
    await sleep(800);
  }

  await evalPage(`(() => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => /^打开$/.test((b.innerText || '').trim()));
    buttons[${index}].click();
    return JSON.stringify({ clicked: ${index} });
  })()`);

  // 启动器在同一个标签页里导航，轮询到工具域名出现为止。
  let landed = null;
  const deadline = Date.now() + timeout * 1000;
  while (Date.now() < deadline) {
    await sleep(3000);
    const here = assertToolsShareAvailable(await evalPage('(() => JSON.stringify({ url: location.href, title: document.title, bodyText: (document.body?.innerText||"").slice(0, 1000) }))()'));
    if (here.url && hostOf(here.url).endsWith(tool.origin)) { landed = here; break; }
  }
  if (!landed) {
    throw new Error(
      `${tool.name} did not reach ${tool.origin} within the timeout. Two causes, in order of likelihood: ` +
        `(1) **the node is down** — rerun with a different node (the panel offers 节点1..N); ` +
        `(2) the panel is out of quota. A dead node looks exactly like a broken script: the launch reports ` +
        `fine and the tool page never renders. Change the node before debugging anything else.`,
    );
  }

  return { tool, state, landed, evalPage, env, index };
}

/**
 * 一次工具启动该用哪个会话名——**由工具决定，不由调用方决定**。
 *
 * TOOLS 里这两个工具的 origin 都在 opencli-core 的 QUOTA_SITES 上：同时加载会撞
 * 上游的并发上限。而会话名就是并发度——`defaultSession()` 给每个 agent 一个后缀，
 * 于是 19 个 agent 就是 19 个标签页同时压同一张 Semrush 报表（2026-08-28 实测）。
 * 收敛成一个固定名之后，daemon 会把同名会话的写排成一队。
 *
 * 固定名走 `quotaSession(origin)`，也就是从 QUOTA_SITES 查出来的，不是在这里拼的：
 * 谁把一个站从那份清单里去掉，这里必须立刻跟着退回 defaultSession，
 * 否则「配额站清单」就成了没人读的注释。
 *
 * 显式 `--session` 的处置是**覆盖 + 出声**，与 opencli daemon 对 Similarweb 的
 * 既有行为一致：静默照用等于第一个忘记传 `--session semrush-nav` 的人就把回归带回来，
 * 而直接拒绝会把「我就是要两个独立会话做 A/B」这种正当需求逼进复制粘贴的分叉。
 * 正当需求走 `allowParallelSession`，代价是显式的、看得见的。
 */
export function toolSession(toolKey, { session, allowParallelSession = false, base } = {}) {
  const key = String(toolKey || '').toLowerCase();
  const tool = TOOLS[key];
  if (!tool) throw new Error(`tool must be one of: ${Object.keys(TOOLS).join(', ')}`);
  const url = `https://${tool.origin}/`;
  const fallbackBase = base || `tools-share-${key}`;
  const explicit = session ? guardSessionName(String(session)) : null;

  if (allowParallelSession) return explicit || defaultSession(fallbackBase);
  // 没传 --session：这一行就是整条法则的落点。非配额站在 sessionForUrl 里
  // 自动退回 defaultSession，所以将来往 TOOLS 里加一个不限额的工具也不用改这里。
  if (!explicit) return sessionForUrl(url, fallbackBase);

  const fixed = quotaSession(url);
  if (!fixed || explicit === fixed) return explicit;
  console.error(
    `[opencli] ${key} 是配额站：忽略 --session ${explicit}，改用固定会话 ${fixed}。\n` +
    '          同时加载会触发上限；固定会话名让 daemon 把并发排成一队。\n' +
    '          真要并行传 allowParallelSession（脚本上是 --allow-parallel-session）。',
  );
  return fixed;
}

/**
 * `window: 'virtual-display'`（2026-09-14）：不是 opencli 的窗口模式，是本启动器的一个策略——
 * 持锁之后、启动之前先把本 session 的自动化窗口放到虚拟屏幕上并选中标签页（见
 * lib-automation-window.mjs 头注），然后整个启动流程用 `--window isolated` 跑；
 * 检测不到虚拟屏幕就用 `fallbackWindow`（默认 active）跑，与接入前一致。
 * 返回值多一个 `automationWindow` 控制器（其它 window 值时为 null），调用方在导航/读数前
 * 调 `ensureVisible()`，输出里写 `summary()`。
 *
 * opencli 支持 dedicated 窗口模式时，`automationWindow.windowMode` 会是 `'dedicated'`
 * 而不是 `'isolated'`——这里不用特殊分支，`window = automationWindow.windowMode` 已经
 * 原样接住了。唯一要额外做的是把 `automationWindow.opencliEnv`（dedicated 时带
 * OPENCLI_WINDOW_SLOT/_DISPLAY，否则是 `{}`）传给 `launchToolInner`，让面板导航/eval
 * 这些后续调用也落在同一扇 dedicated 窗口里，见 `buildToolLaunchEnv`。
 *
 * 其它 window 值（foreground/active/background/isolated/dedicated/未传）走的路径一个
 * 字节都没变。
 */
export async function launchTool(options) {
  const toolKey = String(options.tool || '').toLowerCase();
  // 收敛放在这里而不是每个脚本里：这是 11 个调用方唯一都要经过的地方，
  // 逐个脚本改的话，第一个忘记的人就把 19 个标签页带回来了。
  const session = toolSession(toolKey, options);
  const locks = await acquireToolsShareBrowserLocks(session, toolKey);
  let automationWindow = null;
  try {
    let window = options.window;
    if (window === VIRTUAL_DISPLAY_WINDOW) {
      const fallbackWindowMode = normalizeWindowMode(options.fallbackWindow, 'active');
      automationWindow = createAutomationWindow({
        session,
        deps: options.automationDeps || defaultAutomationDeps({ session }),
        matcher: resolveDisplayMatcher({ flag: options.automationDisplay }),
        fallbackWindowMode,
        log: (m) => console.error(m),
      });
      await automationWindow.prepare();
      window = automationWindow.windowMode;
      if (automationWindow.mode !== 'virtual-display') {
        console.error(`[automation-window] ${fallbackHint({
          reason: automationWindow.fallbackReason,
          maxActivations: Number(options.fallbackMaxActivations) || 0,
          fallbackWindowMode,
        })}`);
      }
    }
    const launched = await launchToolInner({ ...options, window, session, opencliEnv: automationWindow ? automationWindow.opencliEnv : {} });
    // 启动流程可能 close + 重开标签页（会话焊死 / hidden 复用），新标签页在 isolated 窗口里默认不是活动标签。
    if (automationWindow) await automationWindow.ensureVisible('after-launch');
    return { ...launched, session, automationWindow, releaseBrowserLocks: locks.release };
  } catch (error) {
    if (automationWindow && error && typeof error === 'object') error.automationWindow = automationWindow.summary();
    await locks.release();
    throw error;
  }
}

/**
 * 把一个 URL 归一成「路由」——只保留决定「这是哪一张报表」的那一段。
 *
 * 两种模式，因为两个工具的路由形状不同：
 *   - `hash`：Similarweb 是 hash 路由的 SPA，报表身份写在 `#` 后面的路径里。
 *   - `path`：Semrush 是普通路由，报表身份写在 pathname 里。
 *
 * **query 一律丢掉**：应用会自己改写 query（补默认 `webSource`、把日期窗口回填成
 * 具体区间、删掉空参数），拿整串比会满屏误报。尾斜杠也归一，
 * `.../28d/?key=` 和 `.../28d?key=` 是同一张页面。
 */
function routeOf(url) {
  const s = String(url ?? '');
  const hashAt = s.indexOf('#');
  if (hashAt >= 0) return { mode: 'hash', path: normalizeRoutePath(s.slice(hashAt + 1).split('?')[0]) };
  const noQuery = s.split('?')[0];
  const m = noQuery.match(/^[a-z][a-z0-9+.-]*:\/\/[^/]*(\/.*)?$/i);
  return { mode: 'path', path: normalizeRoutePath(m ? m[1] || '/' : noQuery) };
}

function normalizeRoutePath(p) {
  let out = String(p ?? '');
  if (!out.startsWith('/')) out = `/${out}`;
  out = out.replace(/\/+$/, '');
  return out || '/';
}

/**
 * 「时间窗口段」的判据：**纯数字 + 单个时间单位字母**，如 `28d` / `6m` / `3m` / `1y`。
 *
 * 为什么卡得这么死：路由里还有别的纯数字段——`999`（实测在 marketing-channels、
 * referrals、website-performance 多条路由上都是这个固定值）和 `*`。它们**不是窗口**，
 * 一起放宽就等于「路由最后一段随便变都不管」，这道校验能防住的东西直接归零。
 * 所以只认 `\d+[dwmy]`，`999` 不匹配（没有单位字母），`*` 也不匹配。
 */
const WINDOW_SEG = /^\d+[dwmy]$/i;

/**
 * 只在**最后一段**上认窗口。窗口位在实测见过的每条路由里都是末段
 * （`.../marketing-channels/999/28d`、`.../referrals/*​/999/28d`、
 * `.../website-performance/*​/999/28d`），而「只放宽末段」比「在任意位置找窗口段」
 * 少放宽一大片：中间某段被改成 `6m` 属于路由形状变了，仍旧照抛。
 *
 * 返回 `{ requested, landed }`（两边窗口不同）或 null（不是纯窗口改写）。
 */
function windowSegDrift(want, got) {
  if (want.mode !== got.mode) return null;
  const a = want.path.split('/');
  const b = got.path.split('/');
  if (a.length !== b.length) return null;
  const last = a.length - 1;
  // 其余路径段仍然必须逐字节相同：这次只有窗口段被改，顶层报表没变；
  // 哪天报表段也变了，那就是真重定向。
  for (let i = 0; i < last; i += 1) if (a[i] !== b[i]) return null;
  if (a[last] === b[last]) return null;
  if (!WINDOW_SEG.test(a[last]) || !WINDOW_SEG.test(b[last])) return null;
  return { requested: a[last], landed: b[last] };
}

/**
 * **窗口改写有两条通道，路径段只是其中一条。**
 *
 * 2026-08-29 实测（canva.com，`#/digitalsuite/websiteanalysis/backlinks/table/999?duration=365d`）：
 * 请求 `duration=365d`，settle 之后被面板改成 `duration=28d`。这条路由的**末段是 `999`**，
 * 不是窗口，所以只看末段的判据返回 null，一张 28 天的反链表被标成 365 天，
 * 而且一行日志都没有——正是这个机制要防的错标，从另一扇门进来了。
 * 而且它在 canva.com 这种大站上就会发生，不像 `28d → 6m` 那次是小站特有的。
 *
 * 判据 = **参数名白名单 ∩ 值的形状 `\d+[dwmy]`**，两个条件都要满足。为什么是交集：
 *   - 只看形状：`webSource`、`key`、任何别的参数哪天取到一个形如 `30d` 的值就会被
 *     报成「窗口改写」。
 *   - 只看名字：`duration=custom`、`duration=2026-01-01_2026-03-01` 这种非窗口取值
 *     也会被当成窗口对比。
 *   - 「query 被改写是容忍的」是既有语义（见 routeOf），**必须保持**。放宽到
 *     「任何 query 变动都报」等于每次导航都报一次，这个信号一周内就会被人无视。
 * 白名单只收窗口语义的参数名；`duration` 是实测到的那一个，其余几个是同类同义词，
 * 有形状判据兜着，多收几个名字并不会把口子放大。
 */
const WINDOW_QUERY_PARAMS = new Set([
  'duration', 'period', 'timeframe', 'timerange', 'range', 'window', 'daterange', 'date_range',
]);

/**
 * 取一个 URL 上的 query 参数。hash 路由的 query 挂在 `#` **后面**
 * （`#/…/table/999?duration=365d`），普通路由挂在前面，两边都要看；
 * 同名参数以 hash 侧为准，因为报表状态写在 hash 里。
 */
function queryParams(url) {
  const s = String(url ?? '');
  const hashAt = s.indexOf('#');
  const parts = hashAt >= 0 ? [s.slice(0, hashAt), s.slice(hashAt + 1)] : [s];
  const out = new Map();
  for (const part of parts) {
    const q = part.indexOf('?');
    if (q < 0) continue;
    let pairs;
    try { pairs = new URLSearchParams(part.slice(q + 1)); } catch { continue; }
    for (const [k, v] of pairs) out.set(k.toLowerCase(), v);
  }
  return out;
}

/**
 * query 通道的窗口漂移。返回形状和路径通道**完全一致**，只是多一个 `param`——
 * 调用方不该关心窗口是从路径还是 query 来的，但排查的人需要知道是哪一扇门。
 */
function windowQueryDrift(requestedUrl, landedUrl) {
  const want = queryParams(requestedUrl);
  const got = queryParams(landedUrl);
  let fallback = null;
  for (const [name, value] of want) {
    if (!WINDOW_QUERY_PARAMS.has(name)) continue;
    // 请求值本身不是窗口形状就不认：`duration=custom` 变成别的东西，我们没有
    // 依据说那是「窗口从 A 变成 B」，宁可什么都不说。
    if (!WINDOW_SEG.test(value)) continue;
    const landedValue = got.get(name);
    const landed = landedValue != null && WINDOW_SEG.test(landedValue) ? landedValue : null;
    const drift = {
      requested: value, landed, rewritten: landed !== null && landed !== value,
      source: 'query', param: name,
    };
    if (drift.rewritten) return drift;
    fallback ??= drift;
  }
  return fallback;
}

/** 路径通道的窗口：只认**末段**，判据同 windowSegDrift。 */
function windowPathDrift(requestedUrl, landedUrl) {
  const wantSeg = routeOf(requestedUrl).path.split('/').pop();
  if (!WINDOW_SEG.test(wantSeg)) return null;
  const gotSeg = routeOf(landedUrl).path.split('/').pop();
  const landed = WINDOW_SEG.test(gotSeg) ? gotSeg : null;
  return {
    requested: wantSeg, landed, rewritten: landed !== null && landed !== wantSeg, source: 'path',
  };
}

/**
 * 请求路由与落地路由的**时间窗口**，不管有没有被改写都回传，供调用方标注输出。
 *
 * 2026-08-28 实测（creem.io）：请求 `.../marketing-channels/999/28d` 落到
 * `.../marketing-channels/999/6m`——顶层报表没变，只有窗口段被面板改写了。
 * 合理解释是小站没有 28 天数据，面板自动把窗口放宽。逐字节相同的这条路由在
 * canva.com 上完全没被改写，所以**拿大站永远测不出来**。
 * 2026-08-29 实测（canva.com）：`backlinks/table` 的 `?duration=365d` 被改成 `28d`，
 * 而那条路由的末段是 `999`——**两条通道都要看**，见 WINDOW_QUERY_PARAMS。
 *
 * 光容忍不够：落地是 `6m` 而脚本仍按 `28d` 标注输出，就是把 6 个月的数字标成 28 天,
 * 正是这道校验本来要防的那类错标。所以窗口必须回传到调用方并写进输出。
 *
 * 返回 `{ requested, landed, rewritten, source }`（`source: 'query'` 时多一个 `param`），
 * 或 null（这条路由的末段和 query 里都找不到窗口）。两条通道都能认出窗口时，
 * **被改写的那条优先**——报出改写是这个机制存在的全部理由；都没被改写就以路径为准。
 *
 * ⚠️ **已知残留缺口**：7 个 gotoInTool 调用点里只有
 * `rankup/scripts/demand/payment-referrers.mjs` 把 `routeWindow` 写进了输出，
 * 其余 6 个（similarweb-query / similarweb-batch / similarweb-keywords /
 * semrush-* 等）拿到返回值就丢掉。它们目前只在窗口被改写时收到一行 stderr 警告，
 * **输出文件里没有窗口字段**，下游无从判断那些数字是哪个时间窗口的。
 * 补的时候照 payment-referrers 的字段抄：`requestedWindow` / `window` /
 * `windowRewritten` / `windowSource`。
 */
export function routeWindow(requestedUrl, landedUrl) {
  const path = windowPathDrift(requestedUrl, landedUrl);
  const query = windowQueryDrift(requestedUrl, landedUrl);
  if (path?.rewritten) return path;
  if (query?.rewritten) return query;
  return path ?? query ?? null;
}

/**
 * 比对「请求的路由」和「落地的路由」，一致返回 null，不一致返回两边的路由。
 *
 * **唯一容忍的差异是末段时间窗口被面板改写**（见 windowSegDrift / routeWindow）——
 * 容忍是为了不误报，而不是为了忘掉它：真正的窗口由 gotoInTool 回传给调用方。
 * 导出只为可测。
 */
export function routeMismatch(requestedUrl, landedUrl) {
  const want = routeOf(requestedUrl);
  const got = routeOf(landedUrl);
  if (want.mode === got.mode && want.path === got.path) return null;
  if (windowSegDrift(want, got)) return null;
  return { requested: want.path, landed: got.path };
}

/**
 * 在已登录的工具页内部深链跳转。**只有在 launchTool 跑完之后才有效。**
 *
 * **导航之后必须校验落地页就是请求的那一页。** 2026-08-28 实测：Similarweb 面板
 * 对未知路由**不报 404**，而是静默重定向到 `#/digitalsuite/ai-brand-visibility/home`。
 * 旧版这里只把落地的 `location.href` 原样返回，没有任何地方拿它跟请求的比过，
 * 于是链条是：请求报表 A → 被静默换成另一张页面 → 就绪判据碰巧被满足 →
 * **解析出来的数字被标成「报表 A 的结果」写进输出**。
 * 一个看起来对的错数字比一次显式失败坏得多，所以这里宁可抛错。
 *
 * `{ allowRedirect: true }` 是给**已知会合法重定向**的调用方留的出口。
 * 默认必须是严格的——默认宽松等于没修。
 *
 * 返回值在落地状态上多带一个 `routeWindow`：`{ requested, landed, rewritten, source }`
 * （`source: 'query'` 时还有 `param`），路径末段和 query 里都没有窗口时为 null。
 * `source` 说明窗口是从**路径段**还是**查询串**认出来的——两条通道都会被面板改写，
 * 排查时必须能分清是哪一扇门。**报表窗口跟报表身份一样是数据的一部分**——
 * 面板会在小站上把 `28d` 悄悄放宽成 `6m`（见 routeWindow 的实测记录），
 * 调用方必须把 `routeWindow.landed` 写进输出，否则就是把 6 个月的数字标成 28 天。
 * 放在这里而不是让每个调用方自己解析落地 URL：7 个调用点一次性受益，
 * 而且「窗口段怎么认」只有这一处判据，不会各写各的。
 */
export async function gotoInTool(evalPage, target, settleSeconds = 15, { allowRedirect = false, windowRecheckMs = 2000 } = {}) {
  const url = target.startsWith('http') ? target : target.replace(/^\/?/, '/');
  await evalPage(`(() => { location.href = ${JSON.stringify(url)}; return JSON.stringify({ navigating: true }); })()`);
  await sleep(settleSeconds * 1000);
  const landed = assertToolsShareAvailable(await evalPage('(() => JSON.stringify({ url: location.href, title: document.title, bodyText: (document.body?.innerText||"").slice(0, 1000) }))()'));
  if (!allowRedirect) {
    const drift = routeMismatch(url, landed.url);
    if (drift) {
      throw new Error(redactSecrets(
        `Navigation landed on a different page than requested — this is a redirect, not a timeout, ` +
          `and waiting longer will not fix it.\n` +
          `  requested route: ${drift.requested}\n` +
          `  landed route:    ${drift.landed}\n` +
          `  requested url:   ${url}\n` +
          `  landed url:      ${landed.url}\n` +
          `Whatever renders on the landed page belongs to that page, so parsing it would file ` +
          `someone else's numbers under the requested report. Fix the route. If this redirect is ` +
          `known-legitimate, pass { allowRedirect: true } at the call site and say in a comment ` +
          `where it redirects to and why that is fine.`,
      ));
    }
  }
  // 窗口以**最终值**为准，不是导航瞬间的值。
  //
  // 2026-08-29 实测（canva.com / backlinks/table）：改写发生在 settle **之后**——
  // 导航返回时读到的还是 `duration=365d`，再读一次才变成 `28d`。只读一次就等于
  // 把一个还会变的值当结论，和这个机制要防的错标是同一类错误。
  //
  // 为什么补在 gotoInTool 而不是 captureStable：captureStable 只拿到 read/fingerprint，
  // 它**根本不知道请求的是哪个 URL**，没有对比的另一半；而且 7 个调用点里只有 1 个
  // 走 captureStable 读窗口，补在那里等于只修 1/7。gotoInTool 是唯一一处所有调用点
  // 都必经、且同时握着「请求 URL」和「页面」的地方。
  //
  // 代价：每次 gotoInTool 多睡 windowRecheckMs（默认 2s）并多一次极轻的 location.href 读。
  // 相对于 settle 的 12~15s 是 ~15%，可以传 `{ windowRecheckMs: 0 }` 关掉。
  // **它是下限不是保证**：面板哪天在第 10 秒才改写，这一读同样会漏。真正兜底的做法是
  // 调用方在自己的轮询收敛时拿 `location.href` 再算一次（payment-referrers.mjs 就是这么做的）。
  let window = routeWindow(url, landed.url);
  let windowUrl = landed.url;
  if (windowRecheckMs > 0) {
    await sleep(windowRecheckMs);
    try {
      const again = await evalPage('(() => JSON.stringify({ url: location.href }))()');
      const laterWindow = again?.url ? routeWindow(url, again.url) : null;
      // 只在后一次真的认出窗口时才替换；读失败/读不出窗口都退回前一次的结论。
      // 注意返回的 `url` 仍是导航落地那一刻的值——路由校验校的是它，不动它的语义。
      if (laterWindow) { window = laterWindow; windowUrl = again.url; }
    } catch { /* 补读失败不该让一次成功的导航失败 */ }
  }
  if (window?.rewritten) {
    // 说出来，不只是塞进返回值：跑批的人看日志，不看每条记录的 routeWindow。
    const via = window.source === 'query' ? `query param \`${window.param}\`` : 'route path segment';
    console.error(redactSecrets(
      `[gotoInTool] the app rewrote the report time window (via ${via}): ` +
      `requested ${window.requested}, landed ${window.landed}. ` +
      `The numbers on this page are ${window.landed} numbers — label them as such.\n` +
      `  landed url: ${windowUrl}`,
    ));
  }
  return { ...landed, routeWindow: window };
}

/** 订阅快到期时的提醒文案，几个脚本都要用。 */
export function expiryWarning(state) {
  return state.daysLeft !== null && state.daysLeft <= 7
    ? `Subscription expires in ${state.daysLeft} day(s) — pull what you need now.`
    : null;
}

/**
 * 轮询到**数值稳定**为止，而不是到「标签出现」为止。
 *
 * 为什么必须有这一步：Semrush / Similarweb 的指标区是分两拍渲染的——先把
 * 「Authority Score」「总访问量」这些**标签**连同一个占位的 `0` / 空态一起挂上，
 * 真实数字晚几秒才水合进去。只认标签的就绪判据会在这个中间态通过，
 * 于是脚本读到的是占位值：**不报错，只是数字偏小或为 0**。
 * 2026-08-23 实测：8 个域名跑 semrush-overview，6 个被记成 authorityScore: 0，
 * 真值是 15~29；同一天 similarweb-batch 把月访问 35 万的 mmradar.gg 记成 below-floor。
 * 静默的错数比一次显式超时坏得多——后者会被续跑重测，前者会一路进报告。
 *
 * 判据：**同一组数值连续读到 needed 次完全一致**才收下。fingerprint 返回 null
 * 表示这一次读到的还不算就绪（会重置计数）。始终返回 { stable }，
 * 调用方必须在 stable === false 时记 error / 抛错，不许把最后一次读数当结论。
 *
 * needed 可以是数字，也可以是 (fingerprint) => number ——空态标记（「未找到匹配内容」）
 * 值得比数字多要一次确认，因为它同样会在数据水合前短暂出现。
 *
 * abortIf(capture) 为真时立刻返回 { stable: false, aborted: true }：给「等下去也没用」的
 * 页面状态留出口（瞬时错误页要的是重载，不是更长的超时）。
 *
 * ---------------------------------------------------------------------------
 * **`renderSignal` —— 「连续读到一样」这条判据自己的破绽，以及唯一的补法。**
 *
 * `needed` 计数是**重复**，重复不是完成。见
 * <law-ref id="readiness-must-bind-to-this-query"/>：*一个还没开始渲染的区域是完美稳定的*，
 * 所以「稳定的空」瞬间就能满足 needed=2，而它什么都不证明。加大 needed、加长 interval
 * 都只是把同一个赌换个数字——**时长和读数都不是页面产出的东西**。
 *
 * 补法只有一个形状：把结论绑到**页面产出的「已渲染完成」信号**上——分页器出现了、
 * 行数计数出现了、加载指示消失了、整页根本不存在 table（「本来就没有表」是结构事实，
 * 和「表来得晚」互斥且可观测）。调用方传 `renderSignal(capture) => boolean`：
 *
 *   - 不传（默认）：**行为与从前逐字一致**。既有 7 个调用点一个都不受影响。
 *   - 传了、且在收下之前见过一次为真：照常 `{ stable: true }`。
 *   - 传了、指纹一直稳定但信号始终拿不到：熬到 deadline，返回
 *     `{ stable: false, inconclusive: true, fingerprint }` ——
 *     **inconclusive，不是 empty，也不是确认过的稳定值**。这两个词对下游意思完全不同，
 *     本仓库的立场是显式失败，而不是安静地交一个可能是空壳的读数。
 *
 * 信号见过一次就记住（`sawSignal` 不回退）：分页器渲染出来之后又被虚拟列表回收掉，
 * 不该把已经成立的完成事实撤销。
 * ---------------------------------------------------------------------------
 */
export async function captureStable({ read, fingerprint, timeoutMs, intervalMs = 2500, needed = 2, abortIf, renderSignal }) {
  const deadline = Date.now() + Math.max(0, timeoutMs);
  const want = (print) => Math.max(2, Number(typeof needed === 'function' ? needed(print) : needed) || 2);
  const gated = typeof renderSignal === 'function';
  let last = null;
  let lastPrint = null;
  let repeats = 0;
  let reads = 0;
  let sawSignal = false;
  while (Date.now() < deadline) {
    let capture = null;
    try { capture = await read(); } catch { capture = null; }
    reads += 1;
    // abortIf 是「别再等了，等下去也不会变」的出口——瞬时错误页就是这种：
    // 它要的是重载，不是更长的超时。没有这个出口，一张错误页会白白吃满整个 timeout。
    if (capture != null && typeof abortIf === 'function' && abortIf(capture)) {
      return { capture, stable: false, aborted: true, inconclusive: false, reads, fingerprint: null };
    }
    if (gated && capture != null && !sawSignal) {
      try { sawSignal = Boolean(renderSignal(capture)); } catch { /* 读不出信号 = 还没拿到信号 */ }
    }
    const print = capture == null ? null : fingerprint(capture);
    if (print == null) {
      repeats = 0;
      lastPrint = null;
    } else {
      repeats = print === lastPrint ? repeats + 1 : 1;
      lastPrint = print;
      last = capture;
      // 指纹够稳了，但只有拿到页面产出的完成信号才允许把它当结论。
      // 没拿到就继续等——等到 deadline 为止，然后交 inconclusive。
      if (repeats >= want(print) && (!gated || sawSignal)) {
        return { capture, stable: true, aborted: false, inconclusive: false, reads, fingerprint: print };
      }
    }
    if (Date.now() + intervalMs >= deadline) break;
    await sleep(intervalMs);
  }
  // gated 且指纹其实一直是稳的，只差那个信号 —— 这不是「值一直在跳」，
  // 也不是「什么都没读到」，调用方必须能把它和那两种分开，所以单开一个字段。
  const inconclusive = gated && !sawSignal && lastPrint != null && repeats >= want(lastPrint);
  return { capture: last, stable: false, aborted: false, inconclusive, reads, fingerprint: lastPrint };
}
