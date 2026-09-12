#!/usr/bin/env node
/**
 * similarweb-batch.mjs —— 一次登录，批量**采集**流量证据。只采集，不判断。
 *
 * 为什么要有它：`similarweb-query.mjs` 每跑一个域名都要重走一遍「开面板 → 选节点 →
 * 点打开 → 等落地」，实测单域名 27 秒，其中 20 秒是启动。批量筛选外链目标动辄几百个
 * 域名，按单域名脚本跑要三个多小时，而这套面板是**共享订阅、随时会到期**的，
 * 慢就等于拿不到。本脚本把启动做一次，之后只换 hash 路由，单域名摊到 6-10 秒。
 *
 * **输出是证据，不是判决。** 每域一行 JSONL：
 *   { domain, totalVisits, monthlyVisits, windowLabel, globalRank, countryRank,
 *     parse: parsed|no-data-marker|none, stopReason, rawExcerpt,
 *     evidence: { screenshot, raw, screenshotError }, error, checkedAt }
 * `pass/fail/below-floor` 不再产出——「查不到数据」只是数据源明说了空态
 * （stopReason: empty-state），是不是低流量由 AI 拿证据（截图 + 原文）下判；
 *
 * **`totalVisits` 的窗口不固定，2026-09-12 实测发现。** 面板会把请求的 28
 * 天窗口悄悄改写成别的窗口（实测落地成 6 个月累计），而「总访问量」标签在
 * 两种窗口下长得一模一样——`totalVisits` 可能是 28 天数字，也可能是 6 个月
 * 累计数字，字段名本身分不出来。`windowLabel` 原样记下页面自己的窗口文案
 * （「最后 28 天数 (As of ...)」或「Mon YYYY - Mon YYYY (N 月)」），
 * `monthlyVisits` 是页面「参与度概览」区另给的月度数字，窗口被改写时应优先
 * 拿它过 `>= 100` 月访问闸门，而不是拿改写窗口后的 `totalVisits` 硬当月度用。
 * 两个数字该用哪个、要不要换算，是读证据的人的判断，脚本只负责把两个都放出来。
 * 超时/不稳定/异常是「这次没测成」，**绝不能当成任何结论**。
 * 行契约与完成语义见 lib-batch-evidence.mjs。
 *
 * 三条硬约束，照抄别改：
 *   1. **同步前台跑，不许后台化。** 这是一长串网络调用，后台化之后没有任何东西会叫醒
 *      调用方，任务会在写下零行输出的情况下"完成"。要跑很久就调大超时，不要放后台。
 *   2. **每测完一个域名立刻追加写盘（JSONL）**，同时把该域采集时刻的正文全文与截图
 *      落进 `<out>.evidence/`。中途挂掉时已测的部分必须留下现场。
 *   3. **可续跑。** 启动时读一遍输出文件，stopReason 已完成（stable/empty-state）的
 *      域名直接跳过；未完成（unstable/timeout/exception）的重测。旧格式行
 *      （verdict 字段）按 legacy 规则识别，verdict=error 视为未完成。
 *
 * 「没有数据」的空态**必须正面认出，不能靠超时兜底**。下限之下的域名页面是**正常渲染
 * 完成**的，只是把指标区换成了「抱歉，未找到与该搜索匹配的内容」+ 一排 N/A。第一版只认
 * 「总访问量」，于是每个这类域名都白等满一整个超时。判据：**「没有数据」几乎总有一个
 * 自己的页面形态，去把那句话找出来，不要用超时代替它。**
 *
 * 用法：
 *   node scripts/similarweb-batch.mjs --domains-file d.txt --out traffic.jsonl [--session x] [--node 3]
 *   # 证据落在 traffic.jsonl.evidence/<domain>.png / .txt
 *
 * 截图链路（opencli browser screenshot）2026-08-30 重构后已实盘验证（见 backlink/evidence/screenshot-chain-VERDICTS.md）；
 * 拍不到时行内记 screenshotError，不影响采集本身。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolveSession, parseFlags, showHelpIfRequested, required, validateSession, opencli } from './opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
// 解析只有一份，住在 lib-similarweb.mjs。**不要在这里再抄一份 deriveMetrics。**
import { deriveMetrics } from './lib-similarweb.mjs';
import { isRowComplete, rawExcerptOf, screenshotPaths, writeRawEvidence } from './lib-batch-evidence.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);
const outPath = required(flags, 'out');
const session = resolveSession(flags, 'sw-batch', 'similarweb');
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN || 'https://sim.3ue.co').replace(/\/+$/, '');
// settle 与超时在 2026-08-24 调大过一次，**不要为了快调回去**：占位值本身是稳定的，
// 两次快读之间它根本不变，「连读两次一致」这条判据在小 settle 下整个失效
// （同一天 semrush-batch 就是这么把 3 个正常站的读数读成空的）。
const perDomainTimeout = Math.max(10_000, Number(flags['domain-timeout'] || 75) * 1000);
const settle = Number(flags.settle || 6);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeDomain(value) {
  const c = value.includes('://') ? new URL(value).hostname : value.split('/')[0];
  const n = c.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(n) ? n : null;
}

const wanted = [];
{
  const raw = flags['domains-file']
    ? readFileSync(flags['domains-file'], 'utf8')
    : required(flags, 'domains').split(',').join('\n');
  for (const line of raw.split('\n')) {
    const d = normalizeDomain(line.trim());
    if (d && !wanted.includes(d)) wanted.push(d);
  }
}

// 续跑：已完成的域名不再测。**未完成不算跑过**——它是「这次没测成」，不是结论。
// 把它当已完成会让一次会话挂掉造成的整段空洞永久固化下来，而且完全看不出来。
const done = new Set();
if (existsSync(outPath)) {
  for (const line of readFileSync(outPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (isRowComplete(r)) done.add(r.domain);
    } catch { /* 半行，忽略 */ }
  }
}
const todo = wanted.filter((d) => !done.has(d));
console.error(`[batch] ${wanted.length} requested, ${done.size} already done, ${todo.length} to go`);
if (!todo.length) process.exit(0);

const launched = await launchTool({
  session,
  tool: 'similarweb',
  node: flags.node,
  window: flags.window === 'foreground' ? 'foreground' : 'background',
  wait: Number(flags.wait || 7),
  timeout: Number(flags.launchTimeout || 60),
  allowParallelSession: Boolean(flags['allow-parallel-session']),
});
try {
const evaluate = launched.evalPage;
const subscription = {
  expiry: launched.state.expiry,
  daysLeft: launched.state.daysLeft,
  warning: expiryWarning(launched.state),
};
if (subscription.warning) console.error(`[batch] ${subscription.warning}`);

const ROUTE = '/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?webSource=Total&key=';

/**
 * 该域采集时刻的现场：正文全文进 raw 文件，截图一张进 evidence 目录。
 * 两者都是尽力而为——现场拿不全要记下为什么，但不能反过来毁掉这一行采集。
 */
async function captureEvidence(domain, bodyText) {
  const evidence = { screenshot: null, raw: null, screenshotError: null };
  if (bodyText) {
    try {
      evidence.raw = writeRawEvidence({ outPath, domain, text: bodyText, redact: redactSecrets });
    } catch (e) { console.error(`[batch] raw evidence failed for ${domain}: ${redactSecrets(e.message || e)}`); }
  }
  const shot = screenshotPaths(outPath, domain);
  try {
    await opencli(['browser', launched.session || session, 'screenshot', shot.abs], { env: launched.env, timeoutMs: 60_000 });
    evidence.screenshot = shot.rel;
  } catch (e) {
    evidence.screenshotError = redactSecrets(e.message || String(e)).slice(0, 300);
  }
  return evidence;
}

let n = 0;
let consecutiveIncomplete = 0;
for (const domain of todo) {
  n += 1;
  const startedAt = Date.now();
  let row;
  let lastRead = null;
  try {
    await gotoInTool(evaluate, `${appOrigin}${ROUTE}${encodeURIComponent(domain)}`, settle);
    // 轮询认「总访问量」——那是只有数据渲染完才出现的内容词。左侧导航里的「网站表现」
    // 是骨架挂载就有的菜单项，认它会秒过并读到空指标。
    //
    // **认到内容词也还不算数。** 「总访问量」和空态文案都会在真实数字水合之前
    // 先出现一会儿，此时读到的是占位值。2026-08-23 实测：月访问 35 万的
    // mmradar.gg 被读成 totalVisits: null。所以要连读到**指纹一致**才收下——
    // 数值要两次一致，空态标记要三次，因为「没有数据」在加载中途出现得更频繁。
    const settled = await captureStable({
      read: async () => {
        const s = await evaluate(`(() => ({
        url: location.href,
        ready: /总访问量/.test(document.body?.innerText || ''),
        noData: /抱歉，未找到与该搜索匹配的内容|没有足够的数据|Not enough data|我们没有此网站的数据/.test(document.body?.innerText || ''),
        bodyText: (document.body?.innerText || '').slice(0, 20000)
      }))()`);
        lastRead = s;
        return s;
      },
      fingerprint: (s) => {
        if (!String(s?.url || '').includes(`key=${encodeURIComponent(domain)}`)) return null;
        if (s.ready) {
          const m = deriveMetrics(s.bodyText.split(/\n+/).map((l) => l.trim()).filter(Boolean));
          // **「标签在、一个字段都没解析出来」= 还没渲染，永远不收。**
          // 旧代码会让它稳定通过并把空读数当采集完成。超时了记未完成，续跑会重测。
          if (Object.values(m).every((v) => v === null)) return s.noData ? 'no-data' : null;
          return JSON.stringify(m);
        }
        return s.noData ? 'no-data' : null;
      },
      // 空态多要一次确认：它出现得比真实数字早，只确认两次仍可能把水合中的页面判死。
      needed: (print) => (print === 'no-data' ? 3 : 2),
      timeoutMs: perDomainTimeout - (Date.now() - startedAt),
      intervalMs: Number(flags['stable-interval'] || 3) * 1000,
    });
    const bodyText = settled.capture?.bodyText ?? lastRead?.bodyText ?? '';
    const evidence = await captureEvidence(domain, bodyText);
    const base = {
      domain,
      rawExcerpt: rawExcerptOf(redactSecrets(bodyText)),
      evidence,
      checkedAt: new Date().toISOString(),
    };
    if (!settled.stable) {
      // **超时/不稳定不是结论，是这次没测成。** 记未完成，下次续跑会重测。
      // 曾经把它当「没有数据」，结果一个自然流量 2.4K 的站被写成空读数——
      // 渲染慢和没有数据在超时这一刻长得一模一样，而两者的含义正好相反。
      row = {
        ...base,
        totalVisits: null,
        globalRank: null,
        countryRank: null,
        parse: 'none',
        stopReason: settled.fingerprint ? 'unstable' : 'timeout',
        error: settled.fingerprint
          ? `unstable: the page kept changing across ${settled.reads} reads (values still hydrating)`
          : 'timeout: no parseable metric and no empty-state marker',
      };
    } else if (settled.fingerprint === 'no-data') {
      // 页面正面写了「未找到匹配内容」，而且连着三次都这么写。这是**数据源自己的空态**，
      // 采集到此完成——它是不是「流量太小」由 AI 对着截图和原文下判，脚本不下。
      row = { ...base, totalVisits: null, globalRank: null, countryRank: null, parse: 'no-data-marker', stopReason: 'empty-state', error: null };
    } else {
      const lines = settled.capture.bodyText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const m = deriveMetrics(lines);
      row = {
        ...base,
        totalVisits: m.totalVisits,
        // 面板会把请求的时间窗口悄悄改写（28d 请求可能落地成 6 个月累计），
        // 而「总访问量」标签在两种窗口下长一个样。windowLabel 原样记录页面
        // 自己的窗口文案，monthlyVisits 是页面另给的月度数字（窗口被改写时
        // 尤其该用它，而不是拿 totalVisits 当月度硬用）。是否需要换算、
        // 换算完拿哪个数字过闸门，是 AI/apply-traffic-screen 读证据时的判断，
        // 这里只把两个数字和窗口原文都放出去，不替下游做选择。
        monthlyVisits: m.monthlyVisits,
        windowLabel: m.windowLabel,
        globalRank: m.globalRank,
        countryRank: m.countryRank,
        parse: 'parsed',
        stopReason: 'stable',
        error: null,
      };
    }
  } catch (error) {
    const evidence = await captureEvidence(domain, lastRead?.bodyText).catch(() => ({ screenshot: null, raw: null, screenshotError: 'evidence capture itself failed' }));
    row = {
      domain,
      totalVisits: null,
      globalRank: null,
      countryRank: null,
      parse: 'none',
      stopReason: 'exception',
      rawExcerpt: rawExcerptOf(redactSecrets(lastRead?.bodyText ?? '')),
      evidence,
      error: redactSecrets(error.message || error),
      checkedAt: new Date().toISOString(),
    };
  }
  appendFileSync(outPath, `${JSON.stringify(row)}\n`, 'utf8');
  // 熔断：会话一旦挂了，后面每一个域名都要付满一整个超时，而且全部记成未完成。
  // 实测挂过一次，连烧 48 个域名 60 秒。**连续失败就停下换新会话，不要跑完整张表。**
  if (!isRowComplete(row)) {
    consecutiveIncomplete += 1;
    if (consecutiveIncomplete >= 5) {
      console.error(`[batch] ABORT: ${consecutiveIncomplete} consecutive incomplete rows — the browser session is dead, not the domains. Rerun with a fresh --session; incomplete rows are retried automatically.`);
      process.exit(3);
    }
  } else consecutiveIncomplete = 0;
  console.error(`[batch] ${n}/${todo.length} ${domain} → ${row.stopReason}${row.totalVisits !== null && row.totalVisits !== undefined ? ` (${row.totalVisits})` : ''} ${Math.round((Date.now() - startedAt) / 1000)}s`);
}
console.error('[batch] done');
} finally {
  await launched.releaseBrowserLocks?.();
}
