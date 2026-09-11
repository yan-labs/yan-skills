/**
 * opencli-core.mjs —— OpenCLI 的最小 JS 封装。
 *
 * 这是本仓库的规范副本，配套文档见同 Skill 的 references/session-laws.md。
 * `backlink/scripts/opencli-core.mjs` 是同一份代码的 vendored 副本——
 * 那 17 个消费脚本必须在 opencli Skill 未安装时也能跑，所以两份并存；
 * 改动任何一份时同步另一份。
 *
 * 最重要的一个导出是 defaultSession(base)：它把会话名的后缀解析成
 * OPENCLI_SESSION_SUFFIX -> CLAUDE_CODE_SESSION_ID -> CLAUDE_CODE_HOST_SESSION_ID -> pid，
 * 绝不要直接用 HOST id（它被整个桌面应用共享，会把同一个标签页发给并行任务）。
 */

import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { appendFileSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

/* ------------------------------------------------------------------ *
 * 限流 / 降级判据
 * ------------------------------------------------------------------ *
 * 规则表放在文件最顶上，方便以后直接在这个数组里加一行，不用去翻整个文件。
 *
 * 背景：配额站（Semrush / Similarweb）的限流、设备上限、降级渲染全是
 * HTTP 200 + DOM 齐全，只是数据没来——`opencli daemon logs` 和访问日志的
 * `bytes` 字段都分不出来，只有页面原文能分。2026-08-28 实测抓到的降级
 * 形态是：标题正常显示 `Dashboards`，指标全是 `n/a`，页面上还留着一个
 * 没被解析的 i18n key `state.undefined`（详见 SKILL.md 第七节、
 * `captureSample` 的注释）。设备上限那次是原生 `alert`，把 JS 线程堵死，
 * 文案本身没能实测记录下来，只留下了「配额站上出现原生 dialog」这一个
 * 结构性信号。
 *
 * `detectDegradation` 是纯函数，不碰浏览器、不做 IO——方便直接单测。
 * 每条规则标了来源：「实测」是真的抓到过样本，「文档」是按 SKILL.md 和
 * 用户反馈整理的已知措辞，样本不够时先当第一版规则用，抓到真样本后
 * 再回来收紧或改成「实测」。
 *
 * `siteKeys` 为 `null`/未写表示所有站点都适用；否则只在列出的配额站
 * key（`QUOTA_SITES` 里的 `key`）上生效——例如设备上限规则依赖「原生
 * dialog」这个信号，只在配额站上出现才是已知问题，普通站弹一个
 * confirm/alert 太常见，不能当限流证据用。
 */
export const DEGRADATION_RULES = [
  {
    kind: 'degraded-render',
    siteKeys: ['semrush'],
    source: '实测 2026-08-28（sem.3ue.co 降级页抓样，SKILL.md 第七节记录原文）',
    detect(text) {
      const hasLeakedKey = /state\.undefined/.test(text);
      const naCount = (text.match(/\bn\/a\b/gi) || []).length;
      // 两个信号都要有：单独出现 n/a 不算数（正常报表里某几格是 n/a 很常见），
      // 单独出现 state.undefined 也不够——实测样本是两者同时出现。
      if (hasLeakedKey && naCount >= 3) {
        return [
          '未解析的 i18n key: state.undefined',
          `指标疑似全部 n/a（命中 ${naCount} 次）`,
        ];
      }
      return null;
    },
  },
  {
    kind: 'device-limit',
    siteKeys: ['semrush', 'similarweb'],
    source: '实测 2026-08-28（原生 alert 挡住 eval，逃生路径靠 close，文案本身未逐字记录）',
    detect(text, meta) {
      const dialog = meta?.dialogText;
      if (!dialog) return null;
      const raw = String(dialog);
      const evidence = [`配额站上出现原生 dialog: ${raw.slice(0, 200)}`];
      const knownWording = [
        /(maximum|max)\D{0,10}(number of\s+)?(devices|sessions|seats)/i,
        /already (logged in|signed in|active)\b[^.]{0,40}\b(device|session|browser)/i,
        /(one|1)\s+(device|session)\s+at a time/i,
      ];
      if (knownWording.some((re) => re.test(raw))) {
        evidence.push('命中已知的设备上限措辞');
      } else {
        evidence.push('措辞未命中已知列表，仅按「配额站上弹 dialog = 设备上限」这条结构性信号判定，建议人工复核');
      }
      return evidence;
    },
  },
  {
    kind: 'rate-limit',
    siteKeys: null,
    source: '文档整理（SKILL.md 第七节 + 用户反馈，尚无实测样本，命中即建议人工复核）',
    detect(text) {
      const patterns = [
        /you(?:'|’)ve reached (?:the|your) (?:daily |monthly |weekly )?limit/i,
        /usage limit reached/i,
        /rate limit exceeded/i,
        /too many requests/i,
        /request limit exceeded/i,
        /quota exceeded/i,
        /you have exceeded the (?:number of )?(?:requests|queries)/i,
      ];
      const hit = patterns.find((re) => re.test(text));
      return hit ? [`命中限流提示短语（正则 ${hit}）`] : null;
    },
  },
  {
    kind: 'auth',
    siteKeys: null,
    source: '文档整理（尚无实测样本）',
    detect(text) {
      const patterns = [
        /please (?:sign|log) in to continue/i,
        /your session has expired/i,
        /session expired[^.]{0,20}(?:sign|log) in/i,
      ];
      const hit = patterns.find((re) => re.test(text));
      return hit ? [`命中登录态失效短语（正则 ${hit}）`] : null;
    },
  },
];

// 一次页面文本可能同时踩中多条规则（比如既有 dialog 又有限流短语）。
// 优先级从高到低：设备上限和登录态是硬信号（结构性证据，误判成本低），
// 限流短语其次，降级渲染放最后——它只在没有更强信号时才作为兜底结论。
const DEGRADATION_KIND_PRIORITY = ['device-limit', 'auth', 'rate-limit', 'degraded-render'];

/**
 * 纯函数：从提取到的页面文本 + 可选元信息判断这次访问是不是限流/降级。
 *
 * @param {string} pageText 页面提取文本（`openAndExtract` 拿到的 body/innerText）
 * @param {{url?: string, siteKey?: string, bytes?: number, dialogText?: string}} [meta]
 *   `url` 用来按 `quotaSiteOf` 反查站点 key；没有 URL 时可以直接传 `siteKey`。
 *   `dialogText` 是 `captureSample` 里 `dialog accept` 拿到的原生弹窗文案。
 * @returns {{degraded: boolean, kind: ('rate-limit'|'device-limit'|'degraded-render'|'auth'|null), evidence: string[]}}
 */
export function detectDegradation(pageText, meta = {}) {
  const text = String(pageText ?? '');
  const siteKey = meta.siteKey ?? (meta.url ? quotaSiteOf(meta.url)?.key ?? null : null);
  const hits = new Map();
  for (const rule of DEGRADATION_RULES) {
    if (rule.siteKeys && (!siteKey || !rule.siteKeys.includes(siteKey))) continue;
    const evidence = rule.detect(text, meta);
    if (evidence && evidence.length) hits.set(rule.kind, evidence);
  }
  for (const kind of DEGRADATION_KIND_PRIORITY) {
    if (hits.has(kind)) return { degraded: true, kind, evidence: hits.get(kind) };
  }
  return { degraded: false, kind: null, evidence: [] };
}

export function parseFlags(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

export function required(flags, name) {
  const value = flags[name];
  if (typeof value !== 'string' || !value.trim()) throw new Error(`--${name} is required.`);
  return value;
}

export function validateSession(value) {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/i.test(value)) {
    throw new Error('Session names may contain only letters, numbers, and hyphens.');
  }
  return value;
}

/**
 * A session name is a tab claim: two tasks that pick the same name share one tab
 * and read back each other's pages, which looks exactly like the CLI stealing
 * tabs. So no script may ship a literal session name as its default — every
 * default gets a per-process suffix, with `--session` still overriding.
 */
export function defaultSession(base) {
  // Order matters. CLAUDE_CODE_SESSION_ID is per conversation — the unit that
  // actually runs concurrently on one machine. CLAUDE_CODE_HOST_SESSION_ID is
  // per desktop-app host and is SHARED by every conversation inside it, so it
  // is a fallback, never the first choice: keying off it hands two parallel
  // tasks the same tab, which is the exact bug this helper exists to prevent.
  const suffix = (
    process.env.OPENCLI_SESSION_SUFFIX ||
    process.env.CLAUDE_CODE_SESSION_ID ||
    process.env.CLAUDE_CODE_HOST_SESSION_ID ||
    `p${process.ppid}`
  ).replace(/[^a-zA-Z0-9]/g, '').slice(0, 12) || 'local';
  return validateSession(`${base}-${suffix}`);
}

/**
 * Subagents inherit the parent conversation's environment, so several agents
 * spawned inside ONE conversation still resolve to the same default. Any script
 * that fans browser work out across parallel agents must give each one an
 * explicit `--session` (or set OPENCLI_SESSION_SUFFIX per agent).
 */

/**
 * Node 的实验性警告会占住 stderr 的开头（`(node:123) [UNDICI-EHPA] Warning: …`
 * 加一行 `(Use \`node --trace-warnings …`），真正的失败原因排在它们后面。
 * 访问日志把 error 截到 200 字，于是那句 `✖ No active session …` 被挤掉了——
 * 4 小时里 36 条失败长得一模一样，每条都在说一件与失败无关的事。
 */
function meaningfulStderr(stderr) {
  return String(stderr)
    .split('\n')
    .filter((line) => !/^\(node:\d+\)/.test(line) && !/^\(Use `node --trace-warnings/.test(line))
    .join('\n')
    .trim();
}

export async function run(command, args, options = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${command} timed out after ${options.timeoutMs ?? 60_000}ms.`));
    }, options.timeoutMs ?? 60_000);
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('close', (code) => {
      clearTimeout(timeout);
      const result = { code, stdout: stdout.trim(), stderr: stderr.trim() };
      if (code === 0 || options.allowFailure) resolve(result);
      else reject(new Error(meaningfulStderr(stderr) || stdout.trim() || `${command} exited ${code}.`));
    });
  });
}

/* ------------------------------------------------------------------ *
 * 访问记账
 * ------------------------------------------------------------------ */

/**
 * 每次浏览器调用追一行 JSONL 到 ~/.opencli/logs/site-access.jsonl。
 *
 * 为什么必须在这一层记：OpenCLI 自己的日志**看不见限流**。守护进程记的是
 * 标签页租约、导航超时、窗口分组，没有 HTTP 状态码、没有响应体。而 Semrush
 * 的限流是 **HTTP 200 + 页面里写着「已达上限」**——对守护进程来说和一次
 * 完全正常的访问一模一样。限流只在**取数结果**里才现形，所以记账点得在
 * 拿得到 body 的地方，也就是这里。
 *
 * 这一层是纯观测，不改任何行为：不判限流、不退避、不重试。它只留下证据，
 * 让「哪几个路由值得封 adapter」和「限流页长什么样」这两件事以后有数据可查。
 *
 * 关掉：OPENCLI_ACCESS_LOG=0
 */
const ACCESS_LOG_MAX_BYTES = 8 * 1024 * 1024;
const lastUrlBySession = new Map();

// `sessions` / `cleanup` 是子命令本身，不是会话名。三处都得认它：会话归属、
// 动作归属，以及 opencli() 注入 --window 的时候。
const BARE_BROWSER_SUBCOMMANDS = new Set(['sessions', 'cleanup']);
// 带值的选项。动作扫描要跳过它们的值，否则 `--window background` 的
// `background` 会被当成动作。
const VALUE_FLAGS = new Set(['--window', '--source', '--commands', '-f', '--format']);

function accessLogPath() {
  return join(homedir(), '.opencli', 'logs', 'site-access.jsonl');
}

export function logSiteAccess(entry) {
  if (process.env.OPENCLI_ACCESS_LOG === '0') return;
  try {
    const path = accessLogPath();
    // 满了就滚一次。丢最老的一段，好过让它无限长下去——
    // 这是观测日志，不是账本，没人会去读半年前那一行。
    try {
      if (statSync(path).size > ACCESS_LOG_MAX_BYTES) renameSync(path, `${path}.1`);
    } catch { /* 文件还不存在 */ }
    appendFileSync(path, `${JSON.stringify(entry)}\n`);
  } catch { /* 记账绝不能把调用方搞挂 */ }
}

/**
 * 会话最后一次导航到哪儿——**跨进程**记住。
 *
 * 进程内的 Map 只在 open 和 eval 发生在同一个进程里时有用。实测不是：
 * 4 小时 1292 条调用来自 348 个进程，绝大多数脚本一次调用起一个进程，
 * 于是 629 条（近一半）的 site 记成了 null——而「按路由看频次」正是这个
 * 日志存在的理由，配额站的限流判据全挂在路由上。
 *
 * 一个会话一个文件，不需要锁：同一会话的调用本来就被守护进程的租约串行化。
 * OPENCLI_ACCESS_LOG=0 时连这份文件也不写，「关掉」就该是彻底不留痕。
 */
/**
 * 哪个脚本发起的这次调用。
 *
 * 为什么不能只靠会话名：配额站的会话名**由站点决定**（`quotaSession()` 把所有
 * Semrush 调用收敛成 `semrush-nav`），所以「按调用方」分组时它答的是「哪个站」，
 * 不是「谁开的」。而 `OPENCLI_ACCESS_TAG` 实测 4 小时 1292 条全是 null——
 * 一个要每个调用方自觉去设的字段，等于没有。
 *
 * 入口脚本名是白捡的：`process.argv[1]` 一定在，不需要任何人配合，而且
 * 正好是复盘时想知道的那个答案。显式的 tag 保留原义（任务级标注，比如
 * 「这一轮悬赏调研」），两者分开记，免得看日志的人分不清哪个是人写的。
 */
let cachedEntryScript;
function entryScript() {
  if (cachedEntryScript !== undefined) return cachedEntryScript;
  const entry = process.argv[1];
  cachedEntryScript = entry ? basename(entry).replace(/\.(mjs|cjs|js)$/, '') : null;
  return cachedEntryScript;
}

function lastUrlDir() {
  return join(homedir(), '.opencli', 'logs', 'last-url');
}

function lastUrlFile(session) {
  return join(lastUrlDir(), `${session.replace(/[^a-zA-Z0-9-]/g, '_')}.txt`);
}

function rememberUrl(session, url) {
  lastUrlBySession.set(session, url);
  if (process.env.OPENCLI_ACCESS_LOG === '0') return;
  try {
    mkdirSync(lastUrlDir(), { recursive: true });
    writeFileSync(lastUrlFile(session), url);
  } catch { /* 记账绝不能把调用方搞挂 */ }
}

/**
 * 标签页关了，记的那个 URL 就该跟着走：一是它已经不成立（同名会话下次可能
 * 开在别的站上），二是不清理的话每个一次性会话名都留一个文件——
 * `backlink-self-test-<时间戳>` 每跑一轮就多一个，永远不会有人回来收。
 */
function forgetUrl(session) {
  lastUrlBySession.delete(session);
  try { rmSync(lastUrlFile(session), { force: true }); } catch { /* 清理失败不值得打扰调用方 */ }
}

function recallUrl(session) {
  const inProcess = lastUrlBySession.get(session);
  if (inProcess) return inProcess;
  if (process.env.OPENCLI_ACCESS_LOG === '0') return null;
  try { return readFileSync(lastUrlFile(session), 'utf8').trim() || null; } catch { return null; }
}

/** 从一次调用的参数里认出目标 URL：open 的位置参数，或 batch 里第一个 open。 */
export function urlFromArgs(args) {
  for (const arg of args) {
    if (typeof arg !== 'string') continue;
    if (/^https?:\/\//.test(arg)) return arg;
    if (arg.startsWith('[') || arg.startsWith('{')) {
      const m = arg.match(/https?:\/\/[^"'\s\\]+/);
      if (m) return m[0];
    }
  }
  return null;
}

export function accessEntry(args, { ms, ok, bytes, error }) {
  const session = args[0] === 'browser' && args[1] && !BARE_BROWSER_SUBCOMMANDS.has(args[1])
    ? args[1] : null;
  // eval 的参数里没有 URL——页面是上一次 open 留下的。所以按会话记住最后
  // 一次导航目标，让 eval 也能归到路由上；否则「访问频次」只数得到 open，
  // 而真正的取数几乎全发生在 eval 里。
  let url = urlFromArgs(args.slice(2));
  if (url && session) rememberUrl(session, url);
  else if (session) url = recallUrl(session);

  let site = null; let route = null;
  if (url) {
    try { const u = new URL(url); site = u.hostname; route = u.pathname; } catch { /* 不是合法 URL */ }
  }
  // 动作名。两个坑，都是实测踩出来的：
  //   1. `browser sessions -f json` 的动作是 sessions——它在位置 1，而扫描从 2
  //      起步，于是第一个非 `--` 的词 `-f` 成了动作。4 小时的日志里 45 条会话
  //      列表全记成了 `-f`，按动作分组时它们既不算 sessions 也不算别的。
  //   2. 判据写的是 `--` 开头，短横线选项漏网。改成任何 `-` 开头都算选项。
  const action = args[0] === 'browser'
    ? (BARE_BROWSER_SUBCOMMANDS.has(args[1])
        ? args[1]
        : args.find((a, i) => i >= 2 && !a.startsWith('-') && !VALUE_FLAGS.has(args[i - 1])) || 'unknown')
    : args[0];
  return {
    ts: new Date().toISOString(),
    site, route, session, action, ms, ok,
    bytes: bytes ?? null,
    quota: site ? Boolean(quotaSiteOf(url)) : false,
    // 复盘时最想知道的是「这一串标签页是谁开的」。会话名答不了——配额站上它
    // 由站点决定。所以记四层归属：script 是入口脚本名（自动，永远有），
    // OPENCLI_ACCESS_TAG 给调用方自己标任务名（可选），who 是对话 id，
    // pid 用来把同一个进程里的一串调用串起来。
    who: (process.env.CLAUDE_CODE_SESSION_ID || '').slice(0, 12) || null,
    script: entryScript(),
    tag: process.env.OPENCLI_ACCESS_TAG || null,
    pid: process.pid,
    ...(error ? { error: String(error).slice(0, 200) } : {}),
  };
}

/** 包一次调用并记账。内部用；`opencli()` 和 `batchBrowser()` 都走它。 */
async function withAccessLog(args, fn) {
  const started = Date.now();
  try {
    const result = await fn();
    logSiteAccess(accessEntry(args, {
      ms: Date.now() - started, ok: true,
      bytes: typeof result?.stdout === 'string' ? result.stdout.length : null,
    }));
    return result;
  } catch (error) {
    logSiteAccess(accessEntry(args, { ms: Date.now() - started, ok: false, error: error?.message }));
    throw error;
  }
}

export async function opencli(args, options = {}) {
  const resolved = [...args];
  // `sessions` / `cleanup` 不是会话名，是子命令本身。给它们注入 --window 会让
  // CLI 把子命令当成会话名解析，命令整个失败——而调用方通常 allowFailure，
  // 于是失败被吞掉，snapshotSessions() 静默返回空数组，差集回收变成空操作。
  if (resolved[0] === 'browser' && resolved[1] && !BARE_BROWSER_SUBCOMMANDS.has(resolved[1])
      && !resolved.includes('--window')) {
    const requested = options.windowMode || options.env?.OPENCLI_WINDOW || 'background';
    const windowMode = requested === 'foreground' ? 'foreground' : 'background';
    resolved.splice(2, 0, '--window', windowMode);
  }
  // Default `state` snapshots to AX (accessibility-tree) format — compact,
  // fewer tokens than the full DOM tree.  Callers can still override with an
  // explicit `--source dom`.
  if (resolved[0] === 'browser' && !resolved.includes('--source')) {
    const sub = resolved.findIndex((a, i) => i >= 2 && a === 'state');
    if (sub >= 0) resolved.splice(sub + 1, 0, '--source', 'ax');
  }
  return await withAccessLog(resolved, () => run('opencli', resolved, options));
}

export function firstJson(text) {
  const source = String(text);
  const start = [...source].findIndex((character) => character === '{' || character === '[');
  if (start < 0) throw new Error('OpenCLI returned no JSON payload.');
  const stack = [];
  let quoted = false;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === '{' || character === '[') stack.push(character);
    else if (character === '}' || character === ']') {
      stack.pop();
      if (stack.length === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error('OpenCLI returned incomplete JSON.');
}

export function printJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Execute multiple browser operations in a single CLI call. Each command is
 * {cmd, args} matching the `opencli browser <session> batch` contract.
 * Returns the parsed results array; each element has {cmd, index, ok, result?, error?}.
 */
export async function batchBrowser(session, commands, options = {}) {
  const windowMode = options.windowMode || options.env?.OPENCLI_WINDOW || 'background';
  const args = [
    'browser', session, '--window', windowMode === 'foreground' ? 'foreground' : 'background',
    'batch', '--commands', JSON.stringify(commands),
  ];
  const result = await withAccessLog(args, () => run('opencli', args, options));
  return JSON.parse(result.stdout);
}

/**
 * Open a URL, optionally wait, then eval an expression — the most common
 * three-step browser sequence, collapsed into one CLI call.
 */
export async function openAndEval(session, url, expression, options = {}) {
  const wait = options.wait ?? 3;
  const commands = [
    { cmd: 'open', args: { url } },
    // **必须走 sleepStep，不能用 `wait`。** 本文件下面 sleepStep 的注释里记着：
    // opencli 1.8.7 的 `wait time <秒>` 把秒数原样报回来、却不到一秒就返回。
    // 这里曾经写成 `{ cmd: 'wait' }`，等于**根本没等**——页面还没渲染就被 eval 读了，
    // 而 vendored 副本早就改成 sleepStep 了，两份就此分叉。规则写在同一个文件里
    // 都能被绕过，所以现在有 vendored-core-sync.test.mjs 在守这两份的一致性。
    ...(wait > 0 ? [sleepStep(wait)] : []),
    { cmd: 'eval', args: { js: expression } },
  ];
  const results = await batchBrowser(session, commands, options);
  const last = results[results.length - 1];
  if (!last.ok) throw new Error(last.error || 'eval failed in openAndEval');
  return last.result;
}

export async function closeSession(session) {
  await opencli(['browser', session, 'close'], { allowFailure: true, timeoutMs: 20_000 });
  forgetUrl(session);
}

/* ------------------------------------------------------------------ *
 * 配额站：并发受限的站点
 * ------------------------------------------------------------------ */

/**
 * 一个真正的睡眠步骤。
 *
 * `wait time <seconds>` 在 opencli 1.8.7 是坏的：它把秒数原样报回来，
 * 但不到一秒就返回。实测（2026-08-28，扩展 1.0.32）`wait time 5` 报
 * "Waited 5s"，实际 928ms。`wait selector` / `wait text` 不受影响，
 * 仍然优先用它们——没有条件可等的时候才用这个。
 *
 * 这条对下面的节流是地基：配额站的间隔如果写成 `wait time 4`，
 * 整套节流就是个空操作，而且不会有任何报错。
 */
export function sleepStep(seconds) {
  const ms = Math.max(0, Math.round(Number(seconds) * 1000));
  return { cmd: 'eval', args: { js: `(async () => { await new Promise((resolve) => setTimeout(resolve, ${ms})); return true; })()` } };
}

/**
 * 配额站清单。
 *
 * 这些站不是「开太多标签页不礼貌」，是**同时加载会触发上限**。
 * 实测（用户反馈 2026-08-28）：Semrush 大约 3 个标签页同时 load 就出问题，
 * 一个个加载、中间隔几秒则没事。所以受限的资源是**导航事件**，不是标签页存在。
 *
 * 受限的既然是导航，解法就不是信号量，是串行 + 间隔——而串行 daemon 已经
 * 免费提供了：同名会话的写会在本机排队。于是「一个站一个固定会话名」
 * 就同时拿到了串行、标签页数量上限、以及不会读到别人的页面。
 */
export const QUOTA_SITES = [
  { match: /(^|\.)sem\.3ue\.co$/i,      key: 'semrush',    gapMs: 4000 },
  { match: /(^|\.)semrush\.com$/i,      key: 'semrush',    gapMs: 4000 },
  { match: /(^|\.)sim\.3ue\.co$/i,      key: 'similarweb', gapMs: 4000 },
  { match: /(^|\.)similarweb\.com$/i,   key: 'similarweb', gapMs: 4000 },
];

export function quotaSiteOf(url) {
  let host;
  try { host = new URL(String(url)).hostname; } catch { return null; }
  return QUOTA_SITES.find((site) => site.match.test(host)) || null;
}

/**
 * 配额站的会话名是**固定的**，不带任何 per-agent 后缀——这正是重点。
 * 十个 agent 拿到同一个名字，daemon 就把它们排成一队，Semrush 那边
 * 永远只看到一个标签页在一页页地翻。
 *
 * 这是四条会话法律里第 1 条（一个会话一个标签页、N 个页面 N 个会话名）
 * 的**唯一例外**，因为那条法律防的是「读到别人的页面」，而配额站靠
 * openAndExtract 的原子 batch 已经防住了同一件事。
 */
export function quotaSession(url) {
  const site = quotaSiteOf(url);
  return site ? `${site.key}-nav` : null;
}

/** 配额站用固定名，其余走 defaultSession 的 per-conversation 后缀。 */
export function sessionForUrl(url, base) {
  return quotaSession(url) || defaultSession(base);
}

/**
 * 同一条法则的 key 版入口，给「只知道自己在打哪个工具、手里没有 URL」的调用方用
 * （`resolveSession(flags, base, 'semrush')`）。
 *
 * 认的是 QUOTA_SITES 里真实存在的 key —— 不是把任何字符串都接上 `-nav`。
 * 传一个不在清单里的 key 返回 null，调用方据此退回 defaultSession：
 * 「不在配额站清单里」和「不受配额约束」必须是同一件事。
 */
export function quotaSessionForKey(key) {
  const k = String(key || '').toLowerCase();
  return QUOTA_SITES.some((site) => site.key === k) ? `${k}-nav` : null;
}

/**
 * 会话名长得像 `$$` 展开的结果就拒绝。
 *
 * Claude Code 的 Bash tool 每次调用都是新进程，`$$` 每次都变，于是
 * `probe-$$` 会变成一串各不相同的会话名，每个都开一个新标签页，
 * 上一个打开的页面被遗弃——agent 看到的永远是空白页。
 * 实测 2026-08-28：`opencli-wait-probe-<PID>` 一天出现 14 个不同后缀。
 *
 * 这个失败不报错，只表现为「页面怎么老是空的」，所以必须让它当场红。
 * defaultSession 的 pid 兜底会写成 `p12345`，不会被这条误伤。
 */
export function guardSessionName(value) {
  validateSession(value);
  if (/-\d{3,6}$/.test(value)) {
    throw new Error(
      `会话名 "${value}" 以 3~6 位数字结尾，这是 $$ / PID 的形状。\n` +
      'Bash tool 里 $$ 每次调用都变，会把同一件事拆成一串标签页。\n' +
      '改用描述性常量（backlink-probe-cn），或 scripts/session.sh 的 oc_session。',
    );
  }
  return value;
}

/**
 * 打开一个页面并就地取数——配额站上唯一允许的访问形态。
 *
 * 整个 open → wait → extract 打包成**一个 batch**。SKILL.md 记着
 * 「含任一写操作的混合 batch 整体按写处理」，所以这一整包是被会话锁
 * 保护的原子单元，别人插不进来。反过来说：**不允许** open 一次然后
 * 隔几轮对话再回来读——那样会话一直占着，后面所有人都在排队。
 *
 * 重试的关键在于**不重开**。导航超时（扩展硬编码 15s，改不了）不等于
 * 页面没开——标签页已经建好了，只是没加载完。所以第二次尝试先光跑一次
 * extract 探活，确认真的没内容才在**同一个会话**里重新导航。
 * 每开一个新会话去重试，就是今天日志里那些重复标签页的来源。
 */
/**
 * openAndExtract 的命令构造，抽成纯函数是为了能直接断言形状——
 * 「探活那一次不许带 open」这条规则如果只活在循环里，就只能靠跑真页面去验，
 * 而同 URL 的 open 在 Chrome 里可能根本不触发重新加载，测不出来。
 */
export function buildExtractCommands({ navigate, url, evalStep, selector, settleSeconds, gapMs, timeout }) {
  // 节流放在 batch 末尾：它把会话锁多握 gapMs，间隔就出现在两次导航之间，
  // 不用另造一个限流器。串行循环里其实用不到（循环自己 sleep），
  // 这是留给「真有并行 agent 在排队」的那种情况的。
  const throttle = gapMs > 0 ? [sleepStep(gapMs / 1000)] : [];
  if (!navigate) return [evalStep, ...throttle];
  const waitStep = selector ? [{ cmd: 'wait', args: { selector, timeout } }] : [];
  const settle = settleSeconds > 0 ? [sleepStep(settleSeconds)] : [];
  return [{ cmd: 'open', args: { url } }, ...waitStep, ...settle, evalStep, ...throttle];
}

export async function openAndExtract(session, url, expression, options = {}) {
  guardSessionName(session);
  const site = quotaSiteOf(url);
  const selector = options.selector || null;
  const settleSeconds = options.settleSeconds ?? (selector ? 0 : 3);
  const gapMs = options.gapMs ?? (site ? site.gapMs : 0);
  const retries = options.retries ?? 2;

  const evalStep = { cmd: 'eval', args: { js: expression } };
  const build = (navigate) => buildExtractCommands({
    navigate, url, evalStep, selector, settleSeconds, gapMs,
    timeout: options.timeout ?? 25_000,
  });

  // 第 0 次导航；第 1 次**只**跑 extract 探活——导航超时（扩展硬编码 15s）
  // 不等于页面没开，标签页已经建好了，很可能只是 load 事件没等到。
  // 确认真的没内容，第 2 次才在同一个会话里重新导航。
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const navigate = attempt !== 1;
    const commands = build(navigate);
    let results;
    try {
      results = await batchBrowser(session, commands, options);
    } catch (error) {
      if (attempt === retries) throw error;
      continue;
    }
    const extracted = results.find((r) => r.cmd === 'eval' && r.index === commands.indexOf(evalStep));
    if (extracted?.ok && extracted.result != null) {
      // 取到内容不等于取到了想要的内容——限流页、设备上限页、降级渲染
      // 全是 HTTP 200 + 有值的 eval 结果，只是内容不对。所以每次成功都要
      // 过一遍 detectDegradation，不能只在重试耗尽时才看。
      const text = typeof extracted.result === 'string' ? extracted.result : JSON.stringify(extracted.result);
      const verdict = detectDegradation(text, { url, siteKey: site?.key ?? null });
      if (verdict.degraded) {
        // 纯观测原则不变：这里不重试、不退避，只是不把它当成功处理——
        // 调用方拿到 degraded 标记自己决定怎么办（换路由、报给人、还是就此放弃）。
        const sample = await captureSample(session, `openAndExtract degraded (${verdict.kind}): ${url}`);
        let parsedUrl = null;
        try { parsedUrl = new URL(url); } catch { /* 不是合法 URL，site/route 留空 */ }
        logSiteAccess({
          ts: new Date().toISOString(),
          site: parsedUrl?.hostname ?? null,
          route: parsedUrl?.pathname ?? null,
          session,
          action: 'extract',
          ms: null,
          ok: true,
          bytes: text.length,
          quota: Boolean(site),
          who: (process.env.CLAUDE_CODE_SESSION_ID || '').slice(0, 12) || null,
          script: entryScript(),
          tag: process.env.OPENCLI_ACCESS_TAG || null,
          pid: process.pid,
          degraded_kind: verdict.kind,
          evidence: verdict.evidence,
          ...(sample ? { sample } : {}),
        });
        return { degraded: true, kind: verdict.kind, evidence: verdict.evidence, result: extracted.result };
      }
      return extracted.result;
    }
  }
  // 重试耗尽 = 页面上有东西但不是我们要的东西。这一刻的原文最值钱，
  // 限流页、设备上限页、降级渲染都在这里现形。
  const sample = await captureSample(session, `openAndExtract exhausted: ${url}`);
  throw new Error(`openAndExtract 在 ${retries + 1} 次尝试后仍未取到内容：${url}`
    + (sample ? `\n取样已存：${sample}` : ''));
}

/**
 * 顺序爬取——配额站的默认形态，也是本模块想让人走的那条路。
 *
 * 不要扇出 N 个 agent 各自去抢同一个会话锁。daemon 的排队是**兜底，
 * 不是调度器**：它默认只等 10 分钟，20 个词顺序跑就快贴到上限了，
 * 而且每 2 秒轮询一次会在 daemon.log 里刷一条 WARN
 * （实测一天 1016 条）。采集本来就该是一个进程里的一个循环。
 */
export async function sequentialCrawl(items, handler, options = {}) {
  const gapMs = options.gapMs ?? 4000;
  const results = [];
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) await new Promise((r) => setTimeout(r, gapMs));
    try {
      results.push({ item: items[index], ok: true, value: await handler(items[index], index) });
    } catch (error) {
      if (options.stopOnError) throw error;
      results.push({ item: items[index], ok: false, error: String(error.message || error) });
    }
  }
  return results;
}

/* ------------------------------------------------------------------ *
 * 会话回收
 * ------------------------------------------------------------------ */

export async function snapshotSessions() {
  const out = await opencli(['browser', 'sessions', '-f', 'json'], { allowFailure: true, timeoutMs: 20_000 });
  try { return firstJson(out.stdout); } catch { return []; }
}

/**
 * 差集回收：只关这一轮新出现的会话。
 *
 * **不要用 `opencli browser cleanup`**——它释放的是本机**全部**租约，
 * 并行扇出时会把兄弟 agent 正在读的页面一起关掉，而那些 agent 只会
 * 看到自己的页面莫名其妙不见了。
 *
 * 差集版能收掉崩溃的 sub agent 留下的标签页，一个兄弟的都不碰。也比
 * idle alarm 快——实测 2026-08-28 有 31 个标签页是靠 idle 自己掉的，
 * 在它掉之前用户的标签栏一直是脏的。
 */
export async function reconcileSessions(before, options = {}) {
  const seen = new Set((before || []).map((s) => s.session));
  const after = await snapshotSessions();
  let orphans = after.filter((s) => !seen.has(s.session));

  // 光靠「快照之后新出现的」还不够：兄弟 agent 在同一个时间窗里开的会话
  // 也是新出现的，无差别关掉就退化成了 cleanup——正是这个函数要替代的东西。
  // 实测 2026-08-28：一次 dry-run 里就混进了一个别人的 sweep2-* 会话。
  // 所以必须由调用方声明哪些是自己的；没声明就只报告、不动手。
  const owned = options.sessions ? new Set(options.sessions) : null;
  const prefix = options.prefix || null;
  if (owned) orphans = orphans.filter((s) => owned.has(s.session));
  else if (prefix) orphans = orphans.filter((s) => s.session.startsWith(prefix));

  if (options.dryRun || (!owned && !prefix)) return orphans;
  for (const orphan of orphans) await closeSession(orphan.session);
  return orphans;
}

/**
 * 配额站的会话名由**站点**决定，不由调用方决定。
 *
 * 这些脚本原本一律是 `flags.session ? ... : defaultSession(base)`，
 * 也就是每个 agent 一个名字——正是它让 19 个标签页同时压在一个 Semrush
 * 报表上。配额站上并发度就是会话名，所以名字得收归站点。
 *
 * `--session` 不再能悄悄恢复旧行为：传了会被忽略并打一行 stderr，
 * 真要并行得显式 `--allow-parallel-session`（几乎总是错的，留着是为了
 * 万一站点那边放宽了限制不用改代码）。
 */
export function resolveSession(flags, base, siteKey = null) {
  const explicit = flags.session ? guardSessionName(String(flags.session)) : null;
  // 固定名从 QUOTA_SITES 派生，不在这里拼字符串。拼字符串的版本有个隐蔽后果：
  // 把 semrush 从 QUOTA_SITES 里删掉，这里照样返回 semrush-nav，
  // 于是「配额站清单」变成一份没人读的注释，测试也照样绿。
  const fixed = quotaSessionForKey(siteKey);
  if (!fixed || flags['allow-parallel-session']) {
    return explicit || defaultSession(base);
  }
  if (explicit && explicit !== fixed) {
    console.error(
      `[opencli] ${siteKey} 是配额站：忽略 --session ${explicit}，改用固定会话 ${fixed}。\n` +
      '          同时加载会触发上限；固定会话名让 daemon 把并发排成一队。\n' +
      '          真要并行加 --allow-parallel-session。',
    );
  }
  return fixed;
}

/**
 * 出事的那一刻，把页面上到底写了什么留下来。
 *
 * **第一版是错的，用 eval 取页面原文——而在最需要它的场景里 eval 自己就挂住了。**
 * 2026-08-28 实测（扩展 1.0.32）把整条链跑通了：
 *
 *   1. 站点弹一个原生 alert（Semrush 的设备上限就是 alert，不是页面元素）
 *   2. alert 阻塞渲染进程的 JS 线程 → `eval` **永不返回**，只能等 CLI 超时
 *      （日志里的签名就是 `opencli timed out after 60000ms`）
 *   3. 会话锁被这个挂住的 eval 握着
 *   4. `dialog accept`——唯一能清掉 alert 的命令——排在同一把锁后面，轮不到
 *   5. 客户端进程被超时杀掉之后，守护进程**仍然认为它握着锁**
 *      （实测 `browser eval (pid 49191) has been driving it for 110s`，
 *      而那个 pid 早已不存在——这把锁不像 backlink 那层文件锁会探活回收）
 *
 * 逃生路径是 `opencli browser <session> close`：它同样要排队，但最终会成功，
 * 关掉标签页也就带走了 alert。**不是 `dialog accept`。**
 *
 * 另外两条实测顺带钉住，免得下次又用错测法：
 *   - 后台标签页的 setTimeout 会被冻结（visibilityState: hidden），
 *     所以用定时器造 alert 根本触发不了，要同步调；
 *   - alert 弹出后页面本身是 HTTP 200、DOM 齐全，降级形态只表现为
 *     指标全 n/a 和一个没解析的 i18n key `state.undefined`。
 *
 * 于是取样改成三级降级，每一级都带短超时，绝不把调用方拖住：
 *   1. `dialog accept` —— alert 的文案只有这里拿得到，而且顺手把它清掉
 *   2. `eval` —— 没有对话框时取页面原文
 *   3. 都不行就把**诊断本身**写下来：说清楚这是什么形态、怎么脱困
 */
export async function captureSample(session, reason = 'unspecified') {
  if (process.env.OPENCLI_ACCESS_LOG === '0') return null;
  const attempt = async (args, ms) => {
    try {
      const out = await run('opencli', ['browser', session, ...args],
        { allowFailure: true, timeoutMs: ms });
      return out.stdout || '';
    } catch { return ''; }
  };
  try {
    const dir = join(homedir(), '.opencli', 'logs', 'samples');
    mkdirSync(dir, { recursive: true });

    // 短超时是有意的：对话框卡住的会话里，任何命令都会排队，
    // 而取样宁可交白卷也不能变成第二个挂住的调用。
    let body = await attempt(['dialog', 'accept'], 8_000);
    let kind = 'dialog';
    if (!body || /no_javascript_dialog/.test(body)) {
      body = await attempt(['eval',
        '(() => JSON.stringify({ url: location.href, title: document.title, '
        + 'text: (document.body?.innerText || "").slice(0, 4000) }))()'], 12_000);
      kind = 'page';
    }
    if (!body) {
      kind = 'blocked';
      body = [
        '取样时会话无响应——dialog 和 eval 都没在短超时内返回。',
        '这本身就是判据：多半有一个原生对话框（alert/confirm）挡在前面，',
        '它阻塞了 JS 线程，而会话锁被那个挂住的调用握着，dialog accept 排不进去。',
        `脱困：opencli browser ${session} close（要排队，但会成功）。`,
      ].join('\n');
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = join(dir, `${stamp}-${session}-${kind}.txt`);
    writeFileSync(file, `reason: ${reason}\nkind: ${kind}\n\n${body}\n`);
    return file;
  } catch { return null; }
}

/** 用完必须还回去；崩溃时不会自动清理，所以 close 要在 finally 里。 */
export async function withSession(session, fn) {
  guardSessionName(session);
  try {
    return await fn(session);
  } finally {
    await closeSession(session);
  }
}
