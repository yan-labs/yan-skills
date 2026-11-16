#!/usr/bin/env node
/**
 * tools-share-node.mjs —— 枚举 Tools Share 面板某个工具卡片下的节点，或逐个探测节点是否可用。
 *
 * 起因：共享账号的每一个节点是**不同的账号**。2026-08-27 实测过一次——默认节点跑 Semrush
 * 报表返回「已达到每日报告限额」（每日报告配额用完），换到 `节点2` 之后同一份报表立刻跑通，
 * 因为节点2 是一个还没被今天的额度打满的账号。这条经验之前只在人的脑子里，本脚本把它
 * 变成一个能跑的命令。
 *
 * 用法：
 *   node scripts/tools-share-node.mjs list --tool semrush|similarweb [--session <名>] [--window bg|fg] [--wait N]
 *   node scripts/tools-share-node.mjs probe --tool semrush|similarweb [--nodes 1,2,3] [--all] [--session <名>] [--window bg|fg] [--wait N] [--timeout N]
 *   node scripts/tools-share-node.mjs --self-test
 *
 * list  —— 只读节点下拉里有哪些节点、各自的「倍率」和标签文案，**不点「打开」**，
 *          不消耗任何节点的配额。probe 不传 --nodes 时会先内部跑一遍这个来发现节点号，
 *          并按倍率从低到高排队去试（没有特别理由就该先试 X1 的）。
 * probe —— 依次用 lib-tools-share.mjs 的 launchTool() 真正启动每个节点，报告能否进去、
 *          订阅到期/剩余天数、面板配额读数、以及是否命中已知的会话拦截（过期/冻结/冷却）。
 *          每探测完一个节点就关闭该节点用的会话，逼下一次 launchTool 重新从面板导航——
 *          否则 launchTool 会直接复用已经停在工具域名上的会话，等于没换节点。
 *          默认一找到一个能用的节点就停（每个探测都是真实启动一个共享账号会话，
 *          20-40 秒起步，没理由的话不该把没被问到的节点也点一遍）；要把清单里
 *          每个节点都测一遍，显式传 --all。
 *
 * 【比功能本身更重要的一条：探测结果必须能归属到真的被选中的那个节点】
 * `launchTool()` 有两条早退路径完全跳过节点选择——`state.via === 'existing-tool-session'`
 * （会话已经停在工具域名上，直接复用）和 `state.via === 'direct-token'`（环境里有令牌，
 * 直连工具域名；它自己的注释写着"省掉整套面板交互，也省掉节点挑选"）。这两条路径下
 * `launched.index` 也一律是 -1（从没在下拉里点过任何一项）。**一旦命中这两条路径中的
 * 任意一条，这次启动就不能被记成"节点 N 探测成功"——因为面板压根没有走到替你选节点
 * 那一步，实际用的是哪个账号完全不知道。** 本脚本对每一次 launchTool() 返回值都显式检查
 * `reused` / `index` / `state.via`，命中任一个就把这个节点记成 unknown，错误信息里写清楚
 * "节点选择被绕过，这次结果不能算在节点 N 头上"。`--self-test` 里专门有一条用例钉死这个
 * 判断：一个 `via: 'direct-token'` 的返回值必须不是 ok。
 *
 * 【必须诚实说清楚的一条】
 * 面板卡片上的「API 今日配额 N%」和单份报表触发的「已达到每日报告限额」**是否是同一个
 * 配额口径，本脚本没有验证过**。probe 的 recommendation 因此只回答「这个节点现在能不能
 * 进去」，绝不会说「这个节点报表不会被限额」——过度承诺比不给判断更危险。真正会不会被
 * 限额，只有实际去跑那份报表、看有没有弹出「已达到每日报告限额」才知道。
 *
 * 【读不出来 ≠ 正常】任何一个节点连不上、超时、节点选择被绕过、或返回意料之外的内容，
 * 一律记 status: "unknown"，绝不写成 "ok"。写成 "ok" 意味着"验证过是好的"，
 * 读不出来（或者根本没验证到那个节点）都不算数。
 *
 * 本脚本从不点「导出 / 升级 / 购买 / 创建项目」，从不输入密码，也从不把 Cookie /
 * Authorization / token / JWT / `__gmitm=` 值写进任何输出——所有会外发的错误文本都过
 * `redactSecrets`。
 */
import {
  closeSession,
  defaultSession,
  firstJson,
  opencli,
  parseFlags,
  printJson,
  showHelpIfRequested,
  validateSession,
} from './opencli-core.mjs';
import {
  acquireToolsShareBrowserLocks,
  DEFAULT_DASHBOARD,
  launchTool,
  redactSecrets,
  scrub,
  TOOLS,
  toolsShareBlockReason,
} from './lib-tools-share.mjs';

// 每探测一个节点，lib-tools-share.mjs 里的 acquireToolsShareBrowserLocks() 都会给
// `process` 挂一个 `once('exit', ...)` 清理钩子（那份逻辑不在本文件，改不了）。
// 探测十个以上节点就会撞 Node 默认的 10-listener 警告，纯噪音，不是真的泄漏——
// 这些钩子各管各的锁，`once` 保证最多触发一次。调大上限而不是放任告警吓唬人。
process.setMaxListeners(Math.max(50, process.getMaxListeners()));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ── 纯函数：节点下拉文案解析 ──────────────────────────────────────────────
// 面板下拉里一条节点的文案长这样：「节点3 倍率 X 1 🔖 PRO 全球版」。
// 「倍率」是这个节点消耗配额的速率，没有特别理由就挑 X 1 的。
export function parseNodeOption(text) {
  const m = String(text || '').trim()
    .match(/^节点\s*(\d+)\s*倍率\s*[×xX]\s*([\d.]+)\s*(?:🔖\s*)?(.*)$/u);
  if (!m) return null;
  return { node: Number(m[1]), multiplier: Number(m[2]), label: m[3].trim() };
}

/** 把一批下拉选项文案批量解析；解析不出来的记 null 字段而不是丢弃——数量要对得上。 */
export function parseNodeOptions(rawTexts) {
  return (rawTexts || []).map((raw) => {
    const parsed = parseNodeOption(raw);
    return parsed ? { ...parsed, raw } : { node: null, multiplier: null, label: null, raw };
  });
}

/**
 * 判断一次 launchTool() 的返回值有没有真的走过"选节点"那一步。
 *
 * 三个信号,命中任意一个就是绕过：
 *   - `reused`           —— 会话已经停在工具域名上,launchToolInner 直接复用,从头到尾没碰下拉
 *   - `index < 0`        —— 从没在"打开"按钮列表里点过任何一个,只有绕过路径会是 -1
 *   - `state.via` 有值    —— 只有 'existing-tool-session' / 'direct-token' 这两条绕过路径会设置它;
 *                            真·选节点的那条路径最后返回的 state 是纯面板抓取结果,没有这个字段
 *
 * 三个信号原则上应该总是同时成立或同时不成立,分开判断纯粹是防御性的——
 * 少查一个都可能被以后 lib-tools-share.mjs 里新增的某条早退路径绕过去。
 */
export function classifyLaunch(launched) {
  const via = launched?.state?.via || null;
  const reused = Boolean(launched?.reused);
  const noIndex = typeof launched?.index !== 'number' || launched.index < 0;
  if (reused || noIndex || via) {
    return { bypassed: true, via: via || (reused ? 'existing-tool-session' : 'unknown-bypass') };
  }
  return { bypassed: false, via: 'panel-node-select' };
}

/**
 * 把一次节点探测的原始结果（成功 / 拦截 / 读不出来）收敛成三态之一：
 * ok / blocked / unknown。**"读不出来"（含"节点选择被绕过"）必须落进 unknown，
 * 不能落进 ok**——这是本脚本诚实性的核心断言，--self-test 专门盯着它。
 */
export function buildProbeResult(node, outcome) {
  if (outcome?.blocked) {
    return { node, status: 'blocked', blockReason: outcome.message || null, subscription: null, landedUrl: null, title: null, via: null, error: null };
  }
  if (outcome?.ok) {
    return {
      node, status: 'ok', blockReason: null,
      subscription: outcome.subscription || null,
      landedUrl: outcome.landedUrl || null,
      title: outcome.title || null,
      via: outcome.via || null,
      error: null,
    };
  }
  // 落到这里的包括：显式失败、"没抛错但也没读出个所以然"、以及节点选择被绕过——三者都不是 ok。
  return { node, status: 'unknown', blockReason: null, subscription: null, landedUrl: null, title: null, via: null, error: outcome?.message || 'node could not be read' };
}

// ── 面板交互：只到"能看见节点下拉"为止，不点「打开」──────────────────────
// 这一段和 lib-tools-share.mjs 里 launchToolInner 的"等面板渲染"那一步在做同一件事，
// 是刻意的最小重复：那份逻辑（含会话焊死检测、节点选择、点「打开」）整段没有导出，
// 而 list 命令的要求恰恰是**不能**走到"选节点 + 点打开"那一步。这里只做只读的子集，
// 从不点选项、从不点「打开」。真正的启动仍然 100% 走 launchTool()，见 runProbe()。
async function ensurePanelRendered({ session, env, dashboardUrl, wait }) {
  const evalPage = async (expression, timeoutMs = 60_000) =>
    firstJson((await opencli(['browser', session, 'eval', expression], { env, timeoutMs })).stdout);

  await opencli(['browser', session, 'open', dashboardUrl], { env, timeoutMs: 90_000 });
  await sleep(Math.max(4, Number(wait)) * 1000);

  const readPanel = () => evalPage(`(() => {
    const text = document.body.innerText.replace(/\\s+/g, ' ');
    return JSON.stringify({ len: text.trim().length, hasCard: /打开/.test(text), url: location.href, title: document.title, bodyText: text.slice(0, 1000) });
  })()`);

  const deadline = Date.now() + Math.max(60, Number(wait) * 4) * 1000;
  let seen = await readPanel();
  while (!seen.hasCard && Date.now() < deadline) {
    if (/没有账号|去注册/.test(seen.bodyText || '')) throw new Error('Tools Share dashboard is not logged in.');
    const blocked = toolsShareBlockReason(seen);
    if (blocked) throw Object.assign(new Error(`${blocked}; stopped immediately without retrying.`), { code: 'TOOLS_SHARE_BLOCKED' });
    await evalPage('(() => { location.reload(); return JSON.stringify({ r: 1 }); })()').catch(() => {});
    await sleep(12_000);
    seen = await readPanel();
  }
  const blocked = toolsShareBlockReason(seen);
  if (blocked) throw Object.assign(new Error(`${blocked}; stopped immediately without retrying.`), { code: 'TOOLS_SHARE_BLOCKED' });
  if (!seen.hasCard && seen.len < 40) {
    throw new Error('Tools Share panel never rendered (body is blank after reloads). Retry, or check the panel by hand.');
  }
  return evalPage;
}

/** 打开某工具卡片的节点下拉，读出全部选项文案，再关掉下拉——绝不点任何一个选项。 */
async function readNodeOptionTexts(evalPage, tool) {
  let found = { ok: false, seen: [] };
  const openDeadline = Date.now() + 20_000;
  while (Date.now() < openDeadline) {
    found = await evalPage(`(() => {
      const selects = [...document.querySelectorAll('nb-select')];
      const texts = selects.map((e) => (e.innerText || '').trim());
      const i = texts.findIndex((t) => /^节点\\d+/.test(t) && ${tool.label}.test(t));
      if (i < 0) return JSON.stringify({ ok: false, seen: texts });
      const btn = selects[i].querySelector('button.select-button') || selects[i];
      btn.click();
      return JSON.stringify({ ok: true, current: texts[i] });
    })()`);
    if (found.ok) break;
    await sleep(1000);
  }
  if (!found.ok) {
    throw new Error(`Could not find a node selector for ${tool.name}. Seen: ${JSON.stringify(found.seen || [])}`);
  }
  await sleep(1200);
  const opts = await evalPage(`(() => {
    const texts = [...document.querySelectorAll('nb-option')].map((e) => (e.innerText || '').trim());
    return JSON.stringify({ texts });
  })()`);
  // 关掉下拉但不选任何一项：点页面空白处让 Nebular 的浮层自己收起。
  await evalPage('(() => { document.body.click(); return JSON.stringify({ closed: true }); })()').catch(() => {});
  return opts.texts || [];
}

async function runList({ session, toolKey, window: windowMode, wait, dashboardUrl }) {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`tool must be one of: ${Object.keys(TOOLS).join(', ')}`);
  const env = { OPENCLI_WINDOW: windowMode || process.env.OPENCLI_WINDOW || 'dedicated' };
  const locks = await acquireToolsShareBrowserLocks(session, toolKey);
  try {
    const evalPage = await ensurePanelRendered({ session, env, dashboardUrl, wait });
    const rawTexts = await readNodeOptionTexts(evalPage, tool);
    const nodes = parseNodeOptions(rawTexts);
    return { tool: tool.name, nodes };
  } finally {
    await closeSession(session);
    await locks.release();
  }
}

/**
 * 清理一个探测用的会话。两步分开 try/catch：`releaseBrowserLocks` 抛出不该
 * 连带跳过 `closeSession`——之前两步写在同一个 finally 块里,前一步一炸,
 * 后一步就漏跑,留下一个没人管的标签页。
 */
async function cleanupProbeSession(launched, nodeSession) {
  if (launched) {
    try { await launched.releaseBrowserLocks(); } catch { /* 锁清理失败不该拖垮下面的关闭标签页 */ }
  }
  try { await closeSession(nodeSession); } catch { /* 尽力关闭;真关不掉不该让整个探测循环崩掉 */ }
}

async function probeOneNode({ toolKey, node, session, windowMode, wait, timeout }) {
  const nodeSession = validateSession(`${session}-n${node}`);
  let launched = null;
  try {
    // 唯一一个正当地**不**收敛到配额站固定会话的调用点：本脚本的全部意义就是
    // 「一个节点一个会话，探完就关」，收敛成 similarweb-nav 会让第二个节点直接复用
    // 第一个节点已经停在工具域名上的标签页——探测结果全部错误归属。
    // 代价可控：candidates 是**串行**跑的，任一时刻仍然只有一个标签页在导航。
    launched = await launchTool({
      session: nodeSession, tool: toolKey, node, window: windowMode, wait, timeout,
      allowParallelSession: true,
    });
    const classified = classifyLaunch(launched);
    if (classified.bypassed) {
      return {
        ok: false,
        message: `Node selection was bypassed (via=${classified.via}); this result cannot be attributed to node ${node}. ` +
          'launchTool short-circuited to an already-open tool session or a direct token instead of picking a node from the dropdown.',
      };
    }
    return {
      ok: true,
      subscription: { expiry: launched.state.expiry, daysLeft: launched.state.daysLeft, quotas: launched.state.quotas },
      landedUrl: scrub(launched.landed.url),
      title: launched.landed.title,
      via: classified.via,
    };
  } catch (error) {
    const message = redactSecrets(error?.message || String(error));
    return error?.code === 'TOOLS_SHARE_BLOCKED' ? { blocked: true, message } : { ok: false, message };
  } finally {
    // 探测完就关会话：launchTool 一旦已经停在工具域名上就会直接复用它，
    // 下一个节点就等于根本没换——这是 lib-tools-share.mjs 里明确注释过的复用规则,
    // 对这里的"逐个节点探测"反而是坑，必须每探测一个就切断一次。
    await cleanupProbeSession(launched, nodeSession);
  }
}

async function runProbe({ session, toolKey, nodes, all, window: windowMode, wait, timeout, dashboardUrl }) {
  const tool = TOOLS[toolKey];
  if (!tool) throw new Error(`tool must be one of: ${Object.keys(TOOLS).join(', ')}`);

  // 有倍率信息就用它排队：没有特别理由该先试 X1 的节点。显式传 --nodes 时
  // 没有走 list，拿不到倍率，就按调用方给的顺序试——不编造数据支撑一条排序建议。
  let candidates;
  let multiplierOf = new Map();
  if (nodes && nodes.length) {
    candidates = nodes;
  } else {
    const listed = await runList({ session: validateSession(`${session}-list`), toolKey, window: windowMode, wait, dashboardUrl });
    const parseable = listed.nodes.filter((n) => Number.isFinite(n.node));
    if (!parseable.length) {
      throw new Error('Could not discover any node from the panel (list returned none parseable); pass --nodes explicitly.');
    }
    for (const n of parseable) if (Number.isFinite(n.multiplier)) multiplierOf.set(n.node, n.multiplier);
    candidates = parseable
      .slice()
      .sort((a, b) => (a.multiplier ?? Infinity) - (b.multiplier ?? Infinity) || a.node - b.node)
      .map((n) => n.node);
  }

  const results = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const node = candidates[i];
    const outcome = await probeOneNode({ toolKey, node, session, windowMode, wait, timeout });
    results.push(buildProbeResult(node, outcome));
    if (!all && results[results.length - 1].status === 'ok') {
      const remaining = candidates.slice(i + 1);
      for (const skipped of remaining) {
        results.push({ node: skipped, status: 'skipped', reason: `节点${node} 已经探测成功；默认探测到第一个可用节点就停。要测完这一批，传 --all。` });
      }
      break;
    }
  }

  const okNodes = results.filter((r) => r.status === 'ok');
  const recommendation = okNodes.length
    ? {
      node: okNodes[0].node,
      reason: `节点${okNodes[0].node} 成功启动 ${tool.name} 且未触发已知的会话拦截（过期/冻结/冷却）` +
        (multiplierOf.has(okNodes[0].node) ? `，倍率 X${multiplierOf.get(okNodes[0].node)}` : '，倍率未知（--nodes 是显式传入的，没有经过 list，拿不到倍率）') +
        '。这只说明这个节点现在能进去，不代表它的每日报告配额没用完——面板「API 今日配额」读数与单份' +
        '报表触发的「已达到每日报告限额」是否同一口径未经验证，实际会不会被限额仍要以跑报表时是否' +
        '弹出该提示为准。',
    }
    : { node: null, reason: '这一批节点没有一个成功启动，见每个节点的 blockReason / error。' };

  return { tool: tool.name, results, recommendation };
}

// ── CLI 外壳 ──────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
if (argv.includes('--self-test')) {
  runSelfTest();
  process.exit(0);
}

const sub = argv[0] && !argv[0].startsWith('--') ? argv[0] : null;
const flags = parseFlags(sub ? argv.slice(1) : argv);
showHelpIfRequested(flags, import.meta.url);

if (sub !== 'list' && sub !== 'probe') {
  throw new Error('Usage: tools-share-node.mjs list|probe --tool semrush|similarweb [...]. See --help.');
}

const toolKey = String(flags.tool || '').toLowerCase();
if (!TOOLS[toolKey]) throw new Error(`--tool is required and must be one of: ${Object.keys(TOOLS).join(', ')}`);

const session = flags.session ? validateSession(flags.session) : defaultSession('tools-share-node');
// --window foreground 仅供人工登录或亲自查看面板时显式使用。
const windowMode = flags.window || process.env.OPENCLI_WINDOW || 'dedicated';
const wait = Number(flags.wait || 7);
const dashboardUrl = process.env.TOOLS_SHARE_DASHBOARD_URL || DEFAULT_DASHBOARD;

try {
  if (sub === 'list') {
    const result = await runList({ session, toolKey, window: windowMode, wait, dashboardUrl });
    printJson({
      tool: result.tool,
      nodes: result.nodes,
      note: '只读了节点下拉的选项文案，没有点「打开」，没有消耗任何一个节点的配额。',
    });
  } else {
    const nodeList = typeof flags.nodes === 'string'
      ? flags.nodes.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n))
      : null;
    const timeout = Number(flags.timeout || 40);
    const all = Boolean(flags.all);
    const result = await runProbe({ session, toolKey, nodes: nodeList, all, window: windowMode, wait, timeout, dashboardUrl });
    printJson(result);
  }
} catch (error) {
  printJson({
    status: 'error',
    tool: TOOLS[toolKey]?.name || toolKey,
    error: { message: redactSecrets(error?.message || String(error)) },
  });
  process.exitCode = 1;
}

// ── 离线自检：不连浏览器 ────────────────────────────────────────────────
function runSelfTest() {
  const assertEqual = (label, actual, expected) => {
    const a = JSON.stringify(actual);
    const e = JSON.stringify(expected);
    if (a !== e) throw new Error(`tools-share-node self-test failed [${label}]\n  actual:   ${a}\n  expected: ${e}`);
  };
  const assert = (label, cond) => {
    if (!cond) throw new Error(`tools-share-node self-test failed [${label}]`);
  };

  // 节点下拉文案解析：面板真实格式,「倍率」和 emoji 书签之间的间距不总是一致。
  assertEqual('parseNodeOption basic', parseNodeOption('节点3 倍率 X 1 🔖 PRO 全球版'), { node: 3, multiplier: 1, label: 'PRO 全球版' });
  assertEqual('parseNodeOption no bookmark', parseNodeOption('节点10 倍率 X 2 GURU'), { node: 10, multiplier: 2, label: 'GURU' });
  assertEqual('parseNodeOption unparseable', parseNodeOption('这不是节点文案'), null);
  assertEqual('parseNodeOption empty', parseNodeOption(''), null);

  // 批量解析要保序、保数量：解析不出来的记 null 字段，不能整条丢弃。
  const batch = parseNodeOptions(['节点1 倍率 X 1 🔖 PRO 全球版', 'garbage', '节点2 倍率 X 1.5 🔖 PRO 全球版']);
  assert('parseNodeOptions length', batch.length === 3);
  assertEqual('parseNodeOptions[0]', batch[0], { node: 1, multiplier: 1, label: 'PRO 全球版', raw: '节点1 倍率 X 1 🔖 PRO 全球版' });
  assertEqual('parseNodeOptions[1] unknown stays null-fielded', batch[1], { node: null, multiplier: null, label: null, raw: 'garbage' });

  // 核心诚实性断言 1：读不出来必须是 unknown，绝不能是 ok。
  assertEqual('buildProbeResult ok', buildProbeResult(2, { ok: true, subscription: { expiry: '2027-01-01', daysLeft: 10, quotas: ['50%'] }, landedUrl: 'https://sem.3ue.co/x', title: 't', via: 'panel-node-select' }).status, 'ok');
  assertEqual('buildProbeResult unreadable -> unknown, not ok', buildProbeResult(3, { ok: false, message: 'timed out' }).status, 'unknown');
  assertEqual('buildProbeResult empty outcome -> unknown', buildProbeResult(4, {}).status, 'unknown');
  assertEqual('buildProbeResult blocked', buildProbeResult(5, { blocked: true, message: 'Tools Share session is expired, frozen, or cooling down' }).status, 'blocked');
  assert('buildProbeResult unknown never claims ok fields', buildProbeResult(6, { ok: false, message: 'x' }).subscription === null);

  // 核心诚实性断言 2（本次审计新增）：launchTool 走了绕过路径时必须被判定为绕过，
  // 绕过必须变成 unknown，绝不能变成 ok——这条钉住的正是评审指出的那个反转 bug。
  assertEqual('classifyLaunch direct-token is bypassed', classifyLaunch({ reused: false, index: -1, state: { via: 'direct-token' } }).bypassed, true);
  assertEqual('classifyLaunch existing-tool-session is bypassed', classifyLaunch({ reused: true, index: -1, state: { via: 'existing-tool-session' } }).bypassed, true);
  assertEqual('classifyLaunch index -1 alone is bypassed', classifyLaunch({ reused: false, index: -1, state: {} }).bypassed, true);
  assertEqual('classifyLaunch real node selection is not bypassed', classifyLaunch({ reused: false, index: 4, state: {} }).bypassed, false);
  const directTokenOutcome = probeOutcomeFromClassification(classifyLaunch({ reused: false, index: -1, state: { via: 'direct-token' } }), 7);
  assertEqual('a direct-token launch is NOT reported ok', buildProbeResult(7, directTokenOutcome).status, 'unknown');
  assert('a direct-token launch carries an explanatory error, not silence', /bypassed/.test(buildProbeResult(7, directTokenOutcome).error));

  // redactSecrets 必须在这个脚本自己拼的错误消息路径上依旧生效（不是重新实现一份）。
  assert('redactSecrets strips gmitm', !redactSecrets('failed at https://sem.3ue.co/home/?__gmitm=abc123def456').includes('abc123def456'));

  process.stdout.write('tools-share-node self-test: PASS\n');
}

/** 自检专用：把 classifyLaunch 的判断结果转成 probeOneNode 在真实路径上会产出的同形状 outcome。 */
function probeOutcomeFromClassification(classified, node) {
  if (!classified.bypassed) return { ok: true, subscription: null, landedUrl: null, title: null, via: classified.via };
  return { ok: false, message: `Node selection was bypassed (via=${classified.via}); this result cannot be attributed to node ${node}.` };
}
