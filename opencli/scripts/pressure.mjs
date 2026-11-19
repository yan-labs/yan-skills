#!/usr/bin/env node
/**
 * pressure.mjs —— 开工前的一句自查：**我现在动手，会不会把事情搞砸？**
 *
 * ## 为什么有这个文件
 *
 * 2026-08-28 一天之内，同一个盲区造成三次浪费：
 *
 *   1. 一个 agent 等 Semrush 全局锁等了 **56 分钟**，颗粒无收——它无从知道
 *      锁被谁拿着、还要多久，只能干等到超时。
 *   2. 另一个 agent 卡了 4 分钟没开出标签页，看起来像脚本坏了，
 *      实际是在等**另一个 Claude 会话**的锁。
 *   3. 主控 agent 一口气扇出 **19 个标签页**全打同一个 Semrush 报表——
 *      因为它按 agent 数量扇出，而受限的资源是页面。
 *
 * 现有工具能回答「有哪些标签页」（`opencli browser sessions`），
 * 也能回答「我该用什么会话名」（`opencli-core.mjs` 的 `quotaSession()`），
 * **但没有任何东西能回答「现在能不能动手」。** 这就是那个东西。
 *
 * ## 三条设计红线
 *
 * - **脚本自己绝不删锁。** 删别人的锁比多等十分钟危险得多。陈旧锁（pid 已死）
 *   是唯一值得人工介入的情况，这里只报告 + 给出人工命令，不动手。
 * - **绝不输出令牌。** 会话 URL 带 `__gmitm=`，一律先剥掉整个 query 再输出。
 * - **拿不到会话列表 ≠ 0 个标签页。** `opencli-core.mjs:106` 那条注释记着一起
 *   真实事故：`sessions` 失败被吞掉 → 静默返回空数组 → 差集回收变成空操作。
 *   同样的坑这里必须避开：拿不到就报 `unknown`，绝不能报「0 个标签页，可以动手」——
 *   那是最危险的假阳性。
 *
 * ## 它回答不了什么（**别过度信任这个 `go`**）
 *
 * 裁决只覆盖「本机此刻已经发生的事」。以下全部在它的视野之外：
 *
 * - **别的机器。** 锁是 `tmpdir()` 里的目录，会话是本机 daemon 的。同一个
 *   Tools Share 账号如果还在另一台机器上被用，这里永远报 `go`。
 * - **还没开始的意图。** 十个 agent 同时跑 pressure、同时看到 `go`、同时动手，
 *   十个都是对的，结果还是 19 个标签页。**`go` 不是号码牌**——真正的互斥
 *   靠固定会话名 + `acquireToolsShareLock`，这里只是个前置体检。
 * - **未来。** 「pid 存活、持有 3 分钟」推不出「还要多久」。tools-share 锁默认
 *   超时 600 秒，但那是上界不是估计值。
 * - **账号侧的配额。** 面板的「API 今日配额」「订阅到期」它看不到，
 *   那要 `lib-tools-share.mjs` 启动面板才读得到。标签页没到线不等于额度还有。
 * - **标签页的健康度。** 只知道会话存在，不知道它停在错误页、空白页还是登录页。
 * - **陈旧锁到底该不该删。** 它只能证明「pid 不在了」，证明不了那个 pid 没被
 *   系统复用、也证明不了任务真的结束了。所以它只报告，判断留给人。
 *
 * ## 用法
 *
 *   node opencli/scripts/pressure.mjs              # 全看
 *   node opencli/scripts/pressure.mjs --tool semrush
 *   node opencli/scripts/pressure.mjs --json
 *
 * 退出码可以直接当闸门用（`... && node my-crawler.mjs`）：
 *   0 = go   2 = wait   3 = stale-lock   4 = unknown（会话列表拿不到）
 */

// --help 必须在任何探测之前早退：这个脚本的退出码是链式闸门（0/2/3/4 随现场变化），
// 没有守卫时 check-help.mjs 的体检会真跑一次压力探测，绿不绿全看当时有没有锁。
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`pressure.mjs —— 开工前自查：我现在动手，会不会把事情搞砸？

用法:
  node opencli/scripts/pressure.mjs              # 全看
  node opencli/scripts/pressure.mjs --tool semrush
  node opencli/scripts/pressure.mjs --json

退出码可以直接当闸门用（... && node my-crawler.mjs）:
  0 = go   2 = wait   3 = stale-lock   4 = unknown（会话列表拿不到）
细节与边界见文件头注释。`);
  process.exit(0);
}

import { existsSync, realpathSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  QUOTA_SITES, quotaSiteOf, defaultSession, opencli, firstJson, parseFlags, printJson,
} from './opencli-core.mjs';

/* ------------------------------------------------------------------ *
 * 常量
 * ------------------------------------------------------------------ */

/**
 * 实测：Semrush **大约 3 个标签页同时 load 就出问题**，
 * 一个个加载、中间隔几秒则没事。所以这是「同时存在的标签页数」的线，
 * 不是「今天一共开过几个」的线。见 SKILL.md「配额站：法律 1 的唯一例外」。
 */
export const QUOTA_TAB_LIMIT = 3;

/** 配额站的固定会话名（`semrush-nav` 等）。它们**不属于任何 agent**。 */
export const SHARED_SESSIONS = new Map(QUOTA_SITES.map((s) => [`${s.key}-nav`, s.key]));

/** tools-share 锁的目录名形状，来自 backlink/scripts/lib-tools-share.mjs 的 acquireToolsShareLock。 */
const LOCK_PREFIX = 'yan-tools-share-';
const LOCK_SUFFIX = '.lock';

/** 即使当前没有锁目录，这几个工具也要显式报「空闲」——静默的缺席读起来像没查过。 */
export const WELL_KNOWN_TOOLS = ['semrush', 'similarweb'];

/* ------------------------------------------------------------------ *
 * 纯函数层：全部可注入、可测，不碰浏览器也不碰磁盘
 * ------------------------------------------------------------------ */

/**
 * 输出前的清洗。**整个 query 一律剥掉**，不做选择性脱敏。
 *
 * 为什么不是「把 __gmitm 替换掉」就够了：面板会换参数名，工具页也会把
 * 会话票塞进别的 key。白名单式脱敏的失败模式是静默泄漏，而 query 对
 * 「现在能不能动手」这个问题一点信息量都没有——剥掉零成本。
 * 注意 `?` 可能出现在 `#` 之后（Similarweb 是 hash 路由），
 * 按第一个 `?` 切正好把两种情况都盖住。
 */
export function scrubUrl(url) {
  const raw = String(url ?? '').trim();
  if (!raw) return '';
  const noQuery = raw.split('?')[0];
  // 兜底：万一令牌被塞进了 hash 的路径段而不是 query。
  return noQuery.replace(/((?:__gmitm|token|access_token|auth|sid)=)[^&/\s]+/gi, '$1<redacted>');
}

/** 会话列表的形状随 CLI 版本变过（裸数组 / {sessions:[...]}），两种都收。 */
export function normalizeSessions(payload) {
  const list = Array.isArray(payload) ? payload : payload?.sessions;
  if (!Array.isArray(list)) return [];
  return list.map((entry) => ({
    session: String(entry?.session ?? entry?.name ?? ''),
    url: String(entry?.url ?? ''),
    windowId: entry?.windowId ?? null,
    tabId: entry?.tabId ?? null,
  })).filter((entry) => entry.session);
}

/** 本进程的会话后缀——`defaultSession()` 生成的名字长什么样，这里就认什么样。 */
export function currentSuffix() {
  const probe = defaultSession('x');
  return probe.slice(2); // 去掉 "x-"
}

/**
 * 一个会话归谁。**这一条是有代价的**：今天有 agent 差点去关别人的标签页。
 *
 *   mine   —— 后缀（或调用方给的前缀）对得上，关它是安全的
 *   shared —— 配额站的固定会话（semrush-nav）。谁都可能正在用，**永远不要关**
 *   other  —— 别人的。只看，不碰
 */
export function ownerOf(name, { suffix, prefix } = {}) {
  const session = String(name || '');
  if (SHARED_SESSIONS.has(session)) return 'shared';
  if (prefix && session.startsWith(prefix)) return 'mine';
  if (suffix && session.endsWith(`-${suffix}`)) return 'mine';
  return 'other';
}

/** 一个会话压在哪个配额站上：先看 URL，URL 空就看固定会话名。 */
export function siteOf(entry) {
  const bySession = SHARED_SESSIONS.get(entry.session);
  if (bySession) return bySession;
  return quotaSiteOf(entry.url)?.key ?? null;
}

export function formatDuration(ms) {
  const total = Math.max(0, Math.round(Number(ms) || 0) / 1000);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  return m > 0 ? `${m}m${s}s` : `${s}s`;
}

/**
 * 裁决。**唯一的入口**，所有判断都在这里，好让测试能整段钉住。
 *
 * @param sessions {{ ok: true, list: [] } | { ok: false, error: string }}
 *        —— 刻意做成显式的 ok 标记而不是「空数组」：见文件头第三条红线。
 * @param locks    每个 { tool, held, alive, pid, startedAt, heldMs, path }
 */
export function assessPressure({
  sessions,
  locks = [],
  suffix,
  prefix = null,
  limits = {},
  tabLimit = QUOTA_TAB_LIMIT,
} = {}) {
  const sessionsOk = sessions?.ok === true;
  const list = sessionsOk ? normalizeSessions(sessions.list) : [];

  const tabs = { total: 0, mine: 0, shared: 0, other: 0, bySite: {}, other_site: 0, entries: [] };
  for (const entry of list) {
    const owner = ownerOf(entry.session, { suffix, prefix });
    const site = siteOf(entry);
    tabs.total += 1;
    tabs[owner] += 1;
    tabs.entries.push({ session: entry.session, url: scrubUrl(entry.url), owner, site, windowId: entry.windowId });
    if (!site) { tabs.other_site += 1; continue; }
    const bucket = tabs.bySite[site] || (tabs.bySite[site] = { total: 0, mine: 0, shared: 0, other: 0, limit: limits[site] ?? tabLimit, atLimit: false });
    bucket.total += 1;
    bucket[owner] += 1;
  }
  for (const bucket of Object.values(tabs.bySite)) bucket.atLimit = atLimit(bucket.total, bucket.limit);
  const saturated = Object.keys(tabs.bySite).filter((key) => tabs.bySite[key].atLimit);

  const heldLive = locks.filter((lock) => lock.held && lock.alive === true);
  const stale = locks.filter((lock) => lock.held && lock.alive === false);

  const reasons = [];
  const actions = [];

  let verdict = 'go';
  if (!sessionsOk) {
    // 最重要的一条分支。拿不到列表就是**不知道**，不是「没有」。
    verdict = 'unknown';
    reasons.push(`拿不到会话列表：${sessions?.error || 'unknown error'}`);
    actions.push('→ 先跑 `opencli doctor` 和 `opencli browser sessions`，确认桥是活的。');
    actions.push('→ 在确认之前**不要当成 0 个标签页**——那正是 19 个标签页压在一个报表上的来源。');
  } else if (stale.length) {
    verdict = 'stale-lock';
  } else if (saturated.length || heldLive.length) {
    verdict = 'wait';
  }

  for (const lock of stale) {
    reasons.push(`锁 ${lock.tool} 的持有者 pid ${lock.pid} 已经不在了（陈旧锁，持有 ${formatDuration(lock.heldMs)}）`);
  }
  if (stale.length) {
    // 一把锁两行建议，七把锁就把裁决淹了。**陈旧锁总是一起处理的**，所以合成一条。
    actions.push(`→ 有 ${stale.length} 把陈旧锁（持有者进程已死）。脚本**不代劳删除**——删别人还活着的锁比多等十分钟糟得多。`);
    actions.push(`→ 先确认这些 pid 真的都不在：\`ps -p ${stale.map((l) => l.pid).join(',')}\``);
    actions.push(`→ 确认后人工清理：\`rm -rf ${stale.map((l) => l.path).join(' ')}\``);
  }
  for (const lock of heldLive) {
    reasons.push(`锁 ${lock.tool} 被 pid ${lock.pid} 持有 ${formatDuration(lock.heldMs)}，进程存活`);
  }
  if (heldLive.length) {
    const who = [...new Set(heldLive.map((l) => l.pid))].join(', ');
    actions.push(`→ ${heldLive.map((l) => l.tool).join('、')} 正在被 pid ${who} 用着。等它。`);
    actions.push('→ **不要换会话名绕过去**——绕过去等于两个 job 同时打同一个账号，正是这把锁要防的事。');
  }
  for (const key of saturated) {
    const bucket = tabs.bySite[key];
    reasons.push(`${key} 已有 ${bucket.total} 个标签页（线是 ${bucket.limit}）`);
    actions.push(`→ 不要给 ${key} 开新标签页，也不要加重试循环。撞上限的第一动作是 close 不是 sleep。`);
    if (bucket.mine > 0) actions.push(`→ 你自己占着 ${bucket.mine} 个，先 \`opencli browser <session> close\` 还回去。`);
    if (bucket.other > 0) actions.push(`→ 其中 ${bucket.other} 个不是你的，**不要关**——那是别的 agent 正在读的页面。`);
    actions.push(`→ 配额站请用固定会话名 \`${key}-nav\`（见 opencli SKILL「配额站：法律 1 的唯一例外」一节）。`);
  }
  if (verdict === 'go') {
    reasons.push('没有到线的配额站，也没有活着的锁');
    actions.push('→ 可以动手。配额站仍然走固定会话名 + `openAndExtract` 的原子 batch，采集写成顺序循环。');
  }

  return { verdict, sessionsOk, tabs, locks, saturated, reasons, actions, tabLimit };
}

/**
 * 到线判据抽成独立函数，只为一件事：变异测试能精确地打这一枪。
 * 把它改成永远 false，`opencli/tests/pressure.test.mjs` 必须变红。
 */
export function atLimit(count, limit) {
  return count >= limit;
}

/* ------------------------------------------------------------------ *
 * 采集层：跟外界打交道的部分，全部在这一段，纯函数层不依赖它
 * ------------------------------------------------------------------ */

/**
 * **刻意不用 `snapshotSessions()`**：它 `catch { return [] }`，
 * 失败和「真的没有会话」在返回值上完全一样。对回收来说那是空操作，
 * 对本工具来说那是「可以动手」的假阳性——同一个坑，后果严重得多。
 */
export async function gatherSessions() {
  let out;
  try {
    out = await opencli(['browser', 'sessions', '-f', 'json'], { allowFailure: true, timeoutMs: 20_000 });
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
  if (out.code !== 0) return { ok: false, error: out.stderr || out.stdout || `opencli exited ${out.code}` };
  try {
    return { ok: true, list: firstJson(out.stdout) };
  } catch (error) {
    return { ok: false, error: `会话列表不是合法 JSON：${String(error?.message || error)}` };
  }
}

/** pid 探活。EPERM = 进程在，只是不是我的用户，仍然算活着。 */
export function pidAlive(pid) {
  if (!Number.isInteger(pid)) return null;
  try { process.kill(pid, 0); return true; } catch (error) {
    if (error?.code === 'EPERM') return true;
    return false;
  }
}

export async function gatherLocks({ lockRoot = tmpdir(), tool = null, now = Date.now(), probe = pidAlive } = {}) {
  let names = [];
  try {
    names = (await readdir(lockRoot)).filter((n) => n.startsWith(LOCK_PREFIX) && n.endsWith(LOCK_SUFFIX));
  } catch { names = []; }

  const found = new Map();
  for (const name of names) {
    const key = name.slice(LOCK_PREFIX.length, -LOCK_SUFFIX.length);
    const path = join(lockRoot, name);
    let owner = null;
    try { owner = JSON.parse(await readFile(join(path, 'owner.json'), 'utf8')); } catch { /* mkdir 与写 owner 之间的短窗口 */ }
    const pid = Number.isInteger(owner?.pid) ? owner.pid : null;
    const startedAt = typeof owner?.startedAt === 'string' ? owner.startedAt : null;
    const started = startedAt ? Date.parse(startedAt) : NaN;
    found.set(key, {
      tool: key,
      held: existsSync(path),
      pid,
      startedAt,
      heldMs: Number.isFinite(started) ? now - started : null,
      // owner.json 还没写出来时 pid 未知：**不能当成陈旧锁**（alive=false 会
      // 触发「建议人工删锁」），未知就是未知。
      alive: pid === null ? null : probe(pid),
      path,
      kind: key.startsWith('opencli-session-') ? 'session' : 'tool',
    });
  }
  for (const key of WELL_KNOWN_TOOLS) {
    if (!found.has(key)) {
      found.set(key, { tool: key, held: false, pid: null, startedAt: null, heldMs: null, alive: null, path: join(lockRoot, `${LOCK_PREFIX}${key}${LOCK_SUFFIX}`), kind: 'tool' });
    }
  }
  // 工具锁排在前面：`opencli-session-*` 是每会话的浏览器锁，数量多、只是背景噪音，
  // 真正决定「能不能查这个站」的是 semrush / similarweb 这两把。
  const rank = (lock) => (lock.kind === 'tool' ? 0 : 1);
  const all = [...found.values()].sort((a, b) => rank(a) - rank(b) || a.tool.localeCompare(b.tool));
  return tool ? all.filter((lock) => lock.tool === tool || lock.tool.startsWith(`opencli-session-${tool}`)) : all;
}

/* ------------------------------------------------------------------ *
 * 渲染
 * ------------------------------------------------------------------ */

export function renderText(report) {
  const lines = [];
  const { tabs } = report;
  if (!report.sessionsOk) {
    lines.push('标签页 ??? 个 —— 会话列表拿不到，这不是 0');
  } else {
    lines.push(`标签页 ${tabs.total} 个（我的 ${tabs.mine} / 共享 ${tabs.shared} / 其他 ${tabs.other}）`);
    for (const [key, bucket] of Object.entries(tabs.bySite)) {
      const mark = bucket.atLimit ? `  ← 到线（实测约 ${bucket.limit} 个同时 load 就出问题）` : '';
      lines.push(`  ${key.padEnd(12)}${bucket.total} 个（我的 ${bucket.mine} / 共享 ${bucket.shared} / 其他 ${bucket.other}）${mark}`);
    }
    if (tabs.other_site) lines.push(`  ${'非配额站'.padEnd(10)}${tabs.other_site} 个`);
  }
  for (const lock of report.locks) {
    const state = !lock.held ? '空闲'
      : lock.pid === null ? '被持有，持有者未知（owner.json 还没写出来，稍后再看）'
      : lock.alive === false ? `pid ${lock.pid} 持有 ${formatDuration(lock.heldMs)}，**进程已死（陈旧锁）**`
      : `pid ${lock.pid} 持有 ${formatDuration(lock.heldMs)}，进程存活`;
    lines.push(`锁 ${lock.tool.padEnd(24)}: ${state}`);
  }
  lines.push(`裁决: ${report.verdict}`);
  for (const reason of report.reasons) lines.push(`  · ${reason}`);
  for (const action of report.actions) lines.push(`  ${action}`);
  return lines.join('\n');
}

export const EXIT_CODES = { go: 0, wait: 2, 'stale-lock': 3, unknown: 4 };

/* ------------------------------------------------------------------ *
 * CLI
 * ------------------------------------------------------------------ */

export async function main(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const tool = typeof flags.tool === 'string' ? flags.tool.toLowerCase() : null;
  const lockRoot = typeof flags['lock-root'] === 'string' ? flags['lock-root'] : tmpdir();

  const [sessions, locks] = await Promise.all([
    gatherSessions(),
    gatherLocks({ lockRoot, tool }),
  ]);
  const report = assessPressure({ sessions, locks, suffix: currentSuffix() });

  if (flags.json) printJson(report);
  else process.stdout.write(`${renderText(report)}\n`);
  return EXIT_CODES[report.verdict] ?? 4;
}

let isMain = false;
try {
  isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href;
} catch { /* argv[1] 缺失或不可解析 → 视为被 import */ }

if (isMain) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 4;
  });
}
