/** Temporary ChatGPT driver, checked 2026-10-11: temporary-chat=true plus page notice/banner; never changes personalization. */
import { spawnSync } from 'node:child_process';
import { lockChatgpt, reserveConversation, healthFailure, checkExit } from './_chatgpt_guard.mjs';

const SLD2 = new Set(['co.uk', 'org.uk', 'com.au', 'co.jp', 'com.br', 'co.in', 'com.cn', 'com.tw', 'co.kr', 'com.hk', 'com.sg', 'co.nz', 'com.mx', 'com.tr', 'co.za']);
// 多租户平台：子域名才是「一个产品」，不能折叠到主域
const MULTI_TENANT = ['itch.io', 'github.io', 'netlify.app', 'vercel.app', 'pages.dev', 'notion.site', 'substack.com', 'wordpress.com', 'blogspot.com', 'herokuapp.com', 'web.app', 'firebaseapp.com', 'gitlab.io', 'onrender.com', 'fly.dev', 'replit.app', 'glitch.me'];

export function regDomain(input) {
  let host = String(input || '').trim().toLowerCase();
  if (!host) return '';
  try { host = new URL(/^[a-z]+:\/\//.test(host) ? host : `https://${host}`).hostname; } catch { /* keep */ }
  host = host.replace(/^www\./, '').replace(/\.$/, '');
  const parts = host.split('.');
  if (parts.length <= 2) return host;
  const last2 = parts.slice(-2).join('.');
  if (MULTI_TENANT.includes(last2)) return parts.slice(-3).join('.');
  if (SLD2.has(last2)) return parts.slice(-3).join('.');
  return last2;
}

export function oc(args, { timeoutS = 180, env = process.env } = {}) {
  if (args[0] === 'chatgpt') lockChatgpt();
  const r = spawnSync('opencli', args, { env, encoding: 'utf8', timeout: timeoutS * 1000, maxBuffer: 64 * 1024 * 1024 });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '', spawnError: r.error ? (r.error.code || r.error.message) : null };
}

/** opencli browser eval 的输出：字符串结果原样打印（一行 JSON），对象结果会被美化；两种都兼容 */
export function parseEvalJson(stdout) {
  const t = String(stdout || '').trim();
  if (!t) return null;
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  for (const cand of [t, t.split('\n').filter(Boolean).pop()]) {
    let v = tryParse(cand);
    if (typeof v === 'string') v = tryParse(v);
    if (v && typeof v === 'object' && !Array.isArray(v)) return v;
  }
  return null;
}

export function classifyWebSend(text) {
  const t = String(text || '');
  if (/logged[- ]in|not logged|sign in|log in|login|unauthorized/i.test(t)) return 'auth';
  if (/rate.?limit|too many requests|usage limit|reached the limit/i.test(t)) return 'rate-limit';
  return 'send-failed';
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export function browserCommand(web, args, options = {}) {
  lockChatgpt();
  const command = ['browser', web.session, ...args, '--window', process.env.AI_PROBE_WEB_WINDOW || 'dedicated'];
  if (!web.keepAlive || args[0] !== 'open') return oc(command, options);
  if (!web.legacyKeepAlive) {
    const result = oc([...command, '--keep-alive'], options);
    if (result.status === 0 || !/unknown option[^\n]*--keep-alive/i.test(result.stderr + result.stdout)) return result;
    if (web.strictKeepAlive) throw new Error('固定话术模式要求 OpenCLI 支持 --keep-alive；请升级后续跑，不退回有限时保活。');
    web.legacyKeepAlive = true;
    console.error('[提示] OpenCLI 不支持 --keep-alive，退回旧版 24 小时保活；用完仍需 close。');
  }
  return oc(command, { ...options, env: { ...process.env, OPENCLI_BROWSER_IDLE_TIMEOUT: '86400' } });
}

/** 成功常驻可显式移交；其余退出及可捕获中断都关闭任务会话。 */
export function manageSession(web) {
  const cleanup = () => { if (web.opened && !web.retained) closeSession(web); };
  const interrupt = signal => { web.retained = false; cleanup(); process.exit(signal === 'SIGINT' ? 130 : 143); };
  process.prependOnceListener('exit', cleanup);
  process.once('SIGINT', () => interrupt('SIGINT'));
  process.once('SIGTERM', () => interrupt('SIGTERM'));
}

export function closeSession(web) {
  const result = browserCommand(web, ['close'], { timeoutS: 30 });
  if (result.status === 0) web.opened = false;
  return result;
}

/** URL 与临时页声明/横幅同时存在才放行；登录状态及个性化菜单不作判据。 */
export function temporaryPageNotice(state) {
  let url;
  try { url = new URL(state?.url); } catch { return ''; }
  if (url.origin !== 'https://chatgpt.com' || url.searchParams.get('temporary-chat') !== 'true') return '';
  const lines = String(state?.text || '').split('\n');
  return lines.filter(line => /不会.*记忆|不.*使用.*记忆|won.t.*memor|doesn.t.*memor|does not.*memor|won.t.*use.*memor/i.test(line) || /^\s*(临时聊天|temporary chat)\s*$/i.test(line)).join('\n');
}

export function ensurePrivacySwitches(web) {
  const state = parseEvalJson(browserCommand(web, ['eval', `JSON.stringify({
    url:location.href,
    mode:document.querySelector('[data-testid="app-shell-header-context-menu-surface"] button[aria-haspopup="menu"]')?.innerText.trim(),
    text:[document.querySelector('main,[role="main"]')?.innerText || '', ...[...document.querySelectorAll('header button,header h1')].map(el => el.innerText)].join('\\n')
  })`], { timeoutS: 15 }).stdout);
  const notice = temporaryPageNotice(state);
  if (!notice) {
    return { ...failedPage(web), ok: false, failure: 'privacy-switch',
      error: `隐私开关未确认：需 temporary-chat=true 且页面临时聊天声明或横幅；个性化模式=${state?.mode || '读不到'}；未发送问题。` };
  }
  web.temporaryNotice = notice;
  return { ok: true, mode: state.mode, temporaryNotice: notice };
}

/** Runs in the page; history/profile signals must not override an explicit login gate. */
export function sessionHealthState() {
  let text = document.body.innerText;
  for (const el of document.querySelectorAll('article,[data-message-author-role],textarea,[contenteditable="true"]')) text = text.replaceAll(el.innerText || el.value || '', '');
  const login = /^(?:auth\.)?(?:chatgpt|openai)\.com$/.test(location.hostname)
    && /^\/(?:auth\/(?:login|signup)|log-in|sign-up)(?:\/|$)/.test(location.pathname)
    || !!document.querySelector('[data-testid="login-button"],[data-testid="signup-button"],a[href*="/auth/login"],a[href*="/auth/signup"]')
    || [...document.querySelectorAll('button,a')].some(el => /^(登录|登入|注册|免费注册|Log in|Sign in|Sign up|Sign up for free)$/i.test((el.innerText || '').trim()));
  return {text, login,
    loggedIn: !login && (!!document.querySelector('[data-testid="accounts-profile-button"],[data-testid="user-menu-button"]')
      || !!document.querySelector('nav a[href^="/c/"],aside a[href^="/c/"],[data-testid="history"] a[href^="/c/"]'))};
}

export function checkSessionHealth(web) {
  const state = parseEvalJson(browserCommand(web, ['eval', `JSON.stringify((${sessionHealthState.toString()})())`], { timeoutS: 15 }).stdout);
  const failure = healthFailure(state || {});
  if (failure) throw new Error(`ChatGPT 会话健康检查失败：${failure}；停止，不自动登录或切换账号。`);
}

export async function openSession({ web, timeoutS = 150 }) {
  lockChatgpt();
  await reserveConversation({ limit: web.hourlyLimit || 18 });
  await checkExit(web);
  const t0 = Date.now();
  const deadline = t0 + timeoutS * 1000;
  const browser = (...args) => browserCommand(web, args, { timeoutS: Math.max(1, Math.floor((deadline - Date.now()) / 1000)) });
  let notice = web.temporaryNotice || '';
  {
    web.opened = true;
    const opened = browser('open', 'https://chatgpt.com/?temporary-chat=true');
    if (opened.status !== 0) return { ...failedPage(web), ok: false, failure: 'page', error: (opened.stderr || opened.stdout).trim(), durationMs: Date.now() - t0 };
    for (;;) {
      const state = parseEvalJson(browser('eval', `JSON.stringify({text:document.body.innerText,ready:!!document.querySelector('[contenteditable="true"][role="textbox"]')})`).stdout);
      const text = state?.text || '';
      if (/验证码|captcha|verify you are human|too many requests|usage limit|reached the limit|达到.*上限/i.test(text)) return { ...failedPage(web), ok: false, failure: 'rate-limit', error: '临时页出现验证码或限流提示', durationMs: Date.now() - t0 };
      if (!state?.ready && /登录|log in|sign in/i.test(text)) return { ...failedPage(web), ok: false, failure: 'auth', error: '临时页出现登录门', durationMs: Date.now() - t0 };
      notice = text.split('\n').filter((line) => /不会.*记忆|不.*使用.*记忆|won.t.*memor|doesn.t.*memor/i.test(line)).join('\n');
      if (state?.ready) break;
      if (Date.now() >= deadline) return { ...failedPage(web), ok: false, failure: 'page', error: '未核对到临时对话不使用记忆提示', durationMs: Date.now() - t0 };
      await sleep(1000);
    }
    web.temporaryNotice = notice;
  }
  checkSessionHealth(web);
  return { ...ensurePrivacySwitches(web), durationMs: Date.now() - t0 };
}

// 仅失败时读取可见文字；排除输入内容，简单缩短邮箱与长串，不读取凭据。
export function failedPage(web) {
  const page = parseEvalJson(browserCommand(web, ['eval', `JSON.stringify((() => {
    let text = document.body.innerText;
    for (const el of document.querySelectorAll('input,textarea,[contenteditable="true"]')) {
      const value = el.innerText || el.value || '';
      if (value) text = text.replaceAll(value, '');
    }
    return {pageText:text.slice(0,1500),pageUrl:location.href};
  })())`], { timeoutS: 15 }).stdout);
  const redact = value => String(value || '').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|[A-Z0-9_=-]{32,}/gi, token => token.slice(0,8) + '…' + token.slice(-8));
  return { answer: '', cited: [], pageText: redact(page?.pageText), pageUrl: redact(page?.pageUrl) };
}

export async function sendTurn(options) {
  try { return await sendTurnChecked(options); }
  catch (error) { return { ok: false, failure: 'session-health', error: error.message, answer: '', cited: [], durationMs: 0 }; }
}
async function sendTurnChecked({ prompt, timeoutS, web, continuation = false, natural = false }) {
  const t0 = Date.now();
  let deadline = t0 + timeoutS * 1000;
  const browser = (...args) => browserCommand(web, args, { timeoutS: Math.max(1, Math.floor((deadline - Date.now()) / 1000)) });
  let notice = web.temporaryNotice || '';
  if (!continuation) {
    const opened = await openSession({ web, timeoutS });
    if (!opened.ok) return opened;
    notice = web.temporaryNotice;
    deadline = Date.now() + timeoutS * 1000;
  }
  checkSessionHealth(web);
  if (web.fixedScript) {
    const privacy = ensurePrivacySwitches(web);
    if (!privacy.ok) return privacy;
  }
  await checkExit(web);
  const state = natural ? parseEvalJson(browser('eval', `JSON.stringify({count:document.querySelectorAll('[data-markdown-text-style="assistant-message"]').length,blocked:/验证码|captcha|verify you are human|too many requests|usage limit|reached the limit|达到.*上限/i.test(([...document.querySelectorAll('[data-markdown-text-style="assistant-message"]')].reduce((t,a)=>t.split(a.innerText).join(''),document.body.innerText))),auth:!document.querySelector('[contenteditable="true"][role="textbox"]') && /登录|log in|sign in/i.test(document.body.innerText)})`).stdout) : null;
  if (state?.blocked || state?.auth) return { ...failedPage(web), ok: false, failure: state.auth ? 'auth' : 'rate-limit', error: '临时页出现登录、验证码或限流提示', durationMs: Date.now() - t0 };
  const before = state?.count || 0;
  for (const args of [['type', '[contenteditable="true"][role="textbox"]', prompt], ['click', 'button[aria-label="发送"]']]) {
    let r = browser(...args);
    // 多轮对话页可能同时存在两个 contenteditable 文本框；选择器歧义时改用 ChatGPT 输入框固定 id 重试一次。
    if (r.status !== 0 && /selector_ambiguous/.test(r.stderr || r.stdout || '') && args[0] === 'type') r = browser('type', '[contenteditable="true"][role="textbox"]', prompt, '--nth', '1');
    if (r.status !== 0) return { ...failedPage(web), ok: false, failure: classifyWebSend(r.stderr || r.stdout), error: (r.stderr || r.stdout).trim().slice(-300), durationMs: Date.now() - t0 };
  }
  while (Date.now() < deadline) {
    const r = browser('eval', `JSON.stringify((() => {
      const text = document.body.innerText;
      const answers = [...document.querySelectorAll('[data-markdown-text-style="assistant-message"]')];
      const nonAnswer = answers.reduce((t,a)=>t.split(a.innerText).join(''),text);
      const answer = answers.pop();
      const busy = !!document.querySelector('[data-testid="stop-button"],button[aria-label*="Stop"],button[aria-label*="停止"]');
      const links = answer ? [...answer.querySelectorAll('a[href^="http"]')].map(a => ({url:a.href,title:a.innerText,via:'dom-link'})) : [];
      return {url:location.href,text:answer?.innerText || '',count:answers.length + (answer ? 1 : 0),sources:!!answer && /sources|来源|搜索|searching|searched/i.test(answer.closest('article')?.innerText || answer.innerText),links,busy,blocked:/验证码|captcha|verify you are human|too many requests|usage limit|reached the limit|达到.*上限/i.test(nonAnswer),blockedHit:(nonAnswer.match(/.{0,50}(验证码|captcha|verify you are human|too many requests|usage limit|reached the limit|达到.*上限).{0,50}/i)||[''])[0],auth:!document.querySelector('[contenteditable="true"][role="textbox"]') && /登录|log in|sign in/i.test(text),model:document.querySelector('button[aria-label="选择 ChatGPT 模型"]')?.innerText || null};
    })())`);
    const got = parseEvalJson(r.stdout);
    if (got?.blocked || got?.auth) return { ...failedPage(web), ok: false, failure: got.auth ? 'auth' : 'rate-limit', error: '临时页出现登录、验证码或限流提示 | hit=' + JSON.stringify(got.blockedHit||'') + ' auth=' + got.auth, durationMs: Date.now() - t0 };
    if (got?.text && !got.busy && (natural ? got.count > before : got.text.includes('---PROBE---'))) {
      if (web.fixedScript && (new URL(got.url).origin !== 'https://chatgpt.com' || new URL(got.url).searchParams.get('temporary-chat') !== 'true')) return { ...failedPage(web), ok: false, failure: 'privacy-switch', error: '答后 URL 已离开临时聊天；停止。' };
      const cited = [...new Map(got.links.map(c => [c.url, {...c, domain:regDomain(c.url)}])).values()];
      return { ok: true, answer:got.text, text:got.text, failure:null, pageText:'', cited, searched:got.sources || cited.length > 0, durationMs:Date.now()-t0,
        web:{is_temporary_chat:true,temporaryNotice:notice,memory_scope:null,model:got.model,conversationUrl:'https://chatgpt.com/?temporary-chat=true',citedCount:cited.length,payloadVerified:false},
        ev:{searches:cited.length ? [{queries:[],preSited:false,resultCount:cited.length}] : [],retrieved:[],usage:null} };
    }
    await sleep(Math.min(3000, Math.max(0, deadline-Date.now())));
  }
  return { ...failedPage(web),ok:false,failure:'timeout',error:`临时对话在 ${timeoutS} 秒内未读到完整回答`,durationMs:Date.now()-t0 };
}

