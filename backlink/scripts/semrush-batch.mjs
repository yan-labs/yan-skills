#!/usr/bin/env node
/**
 * semrush-batch.mjs —— similarweb-batch.mjs 的 Semrush 版，同样是「登录做一次，
 * 之后只换路由」。存在的理由是**配额**：两张卡片的每日配额是分开的，
 * 一张打满了另一张往往还满着，批量筛选不该因为其中一张见底就整个停下。
 *
 * **只采集，不判断。** 每域一行 JSONL：
 *   { domain, db, scope, scopeEvidence, rpcEvidence,
 *     organicTraffic, authorityScore, unconfirmedOrganicTraffic, unconfirmedAuthorityScore,
 *     parse: parsed|none, stopReason, suspectedPlaceholder, rawExcerpt,
 *     evidence: { screenshot, raw, screenshotError }, error, checkedAt }
 * `rpcEvidence`（2026-09-14 追加）是参与 `scopeEvidence` 判定的原始 rpc 记录的精简
 * 审计信息——`[{ id, kind, timestamp, msFromNavStart }]`，**不含响应正文**，供多域批量
 * 场景事后审计"这条证据是不是这一域自己的"（见 `readRpcWitness()` 的实现注释）。
 * `pass/fail/below-floor` 不再产出；流量值缺失只说明这次没解析到数字，
 * 是「未测成」还是「真没有自然流量」由 AI 拿证据（截图 + 原文摘录 + stopReason）
 * 下判。行契约与完成语义见 lib-batch-evidence.mjs。
 *
 * **口径闸门（2026-09-13 追加）**：数值稳定读出之后，只有 `scopeEvidence.verdict ===
 * 'confirmed'` 才收进 `organicTraffic`/`authorityScore`；`mismatch`/`unverified` 时数值
 * 挪进 `unconfirmedOrganicTraffic`/`unconfirmedAuthorityScore`，主字段置 `null`，
 * `stopReason` 记 `'scope-unconfirmed'`——这个值不在 `lib-batch-evidence.mjs` 的
 * `COMPLETE_STOP_REASONS` 里，天然被 `isRowComplete()` 判成未完成，续跑会重测，不需要
 * 也不允许改那份两个脚本共用的 lib。
 *
 * **口径不同，别混着比。** 这里给的是 `organicTraffic`（自然搜索流量估算），
 * Similarweb 给的是总访问量（含直接、社交、买量）。同一个站两个数字差几倍是正常的。
 * 所以写回目标表时 `traffic.source` 必须标明是哪一个——两个数字并列进同一列，
 * 比没有数字更糟。
 *
 * **本脚本打开的页面（`/analytics/overview/` 域名概览）与 semrush-overview.mjs 同一张，
 * 有全球选项**：不传 `--db` = 全球库（`scope: "global"`），传 `--db xx` = 该国家库
 * （`scope: "xx"`）。2026-09-13 实测确认（见 backlink/references/authorized-data-sources.md）。
 *
 * **口径判定需要两个证人，DOM 单独一个不够**（2026-09-13 与 semrush-overview.mjs 同一轮结论）：
 *   - DOM 证人：地区选择器的选中态（`SCOPE_PROBE_JS`）——国家 pill 是否 `aria-checked`、
 *     落地 URL 是否带 `db`、「全世界」按钮是否存在；
 *   - 接口证人：`/dpa/rpc` 的国家流量列表 + 趋势序列（`rpcScopeWitness`）——趋势最新点的
 *     关键词数，全球库严格大于每一个国家库，单国库则恰好等于那一国的行。
 * 两个都到位、且互相印证时 `judgeScope()` 才判 `confirmed`；`lib-semrush-overview.mjs`
 * 与 `semrush-overview.mjs` 不许改，本文件全部原样复用它们的导出：`judgeScope`/
 * `SCOPE_PROBE_JS`/`flattenRpc`/`rpcScopeWitness`/`HOOK_JS`/`trendContextFromText`/
 * `armNetworkCapture`/`drainRpcWitness`。
 *
 * **本脚本怎么拿接口证人（2026-09-14 改用 lib 的 `armNetworkCapture`/`drainRpcWitness`，
 * 不再自己手搓布防+drain 的胶水代码）**：
 *   1. 导航前 `armNetworkCapture()` 布防 CDP 网络捕获（跟 semrush-overview.mjs 同一份实现，
 *      抓首屏那批 rpc）；因为本脚本是同一个标签页循环导航很多个域名，**每域都要重新布防
 *      一次**，不能假设上一域的布防还在管用；
 *   2. 落地后装 `HOOK_JS`（补抓布防之后、稳定判据轮询期间陆续发出的 rpc；每域都是全新的
 *      `location.href` 整页导航，旧文档的 `window.__ovRpc`/`__ovHookAt` 随文档一起销毁，
 *      钩子侧天然不会跨域残留——真正的风险只在 CDP 捕获这一路，见下一条）；
 *   3. 数值稳定之后调 `drainRpcWitness()`：它内部会读当前文档的 `performance.timeOrigin`
 *      （这一次导航的起点），把 CDP 捕获里时间戳早于它的条目（也就是**上一个域名的迟到
 *      响应**）先剔除掉，再跟本域的钩子记录合并——这正是 2026-09-13 checker 指出的缺口
 *      （本脚本原来的手写版本没有任何导航边界过滤，多域循环里有极窄的时间窗口会把上一域
 *      的响应错记成当前域的证人）。**修法是直接换用 lib 这个函数，不是自己重新发明一遍
 *      过滤逻辑。**
 *   4. `drainRpcWitness()` 拿到的 `rpcEntries` 再用 `flattenRpc()` 摊平一次、喂给
 *      `trendContextFromText(rpc, bodyText, {})`（lib 新增：只吃 `innerText`，截「Authority
 *      Score」之后 SEO 卡片那段文字去匹配页面级趋势序列的显示值），拿到的 `ctx` 再传进
 *      `rpcScopeWitness(rpc, ctx)` 重新算一遍——**这一步是纯内存重算，不再碰网络/钩子**
 *      （`drainRpcWitness` 已经把该拿的都拿到了，`flattenRpc`/`rpcScopeWitness` 都是纯函数，
 *      同一份 `rpcEntries` 算几次结果都一样）。有了这个 `ctx`，即使同一次加载里存在两套趋势
 *      序列（页面级 + 「自然搜索研究/广告研究」分组级），也能像 semrush-overview.mjs 一样
 *      精确挑出页面级那一套，不再是"唯一序列就用、两套就放弃"的粗糙兜底
 *      （2026-09-13 checker 指出的已知限制，现已解决）。SEO 卡片文字认不出来（比如页面还没
 *      渲染到那一步）时 `trendContextFromText` 自己会退化成旧的"唯一序列"规则，不会更差。
 * 每域读数落地时都会核对页面地区选择器的实际选中项，写进该行的 `scopeEvidence`；读不出或和
 * 请求的口径不一致时 `scopeEvidence.verdict` 是 `unverified`/`mismatch`，该行的
 * `organicTraffic`/`authorityScore` 记 `null`，数值挪进 `unconfirmedOrganicTraffic`/
 * `unconfirmedAuthorityScore`（见下面「口径闸门」）。批量跑一批域名要按国家对比时，仍应
 * 显式传同一个 `--db`，避免全球与国家口径混着比。
 *
 * **本脚本只读顶部卡片（Authority Score / 自然流量），不读「自然搜索研究」「广告研究」
 * 分组，分组各自的国家徽标（`readGroupBadges`/`judgeSectionScopes`）跟本脚本的字段无关**——
 * 每行的 `scopeEvidence.sectionScopeNotApplicable` 固定为 `true` 并附一句说明，避免下游
 * 把「本行没有分组口径信息」误读成「分组口径已确认」。
 *
 * 三条铁律同 similarweb-batch：同步前台跑、逐条追加写盘（正文与截图落
 * `<out>.evidence/`）、按已有输出续跑（**未完成不算跑过**，旧格式 verdict=error
 * 同样视为未完成）。外加连续失败熔断——会话挂掉后每个域名都要付满超时。
 *
 * 用法：node scripts/semrush-batch.mjs --domains-file d.txt --out out.jsonl --db us [--node 3]
 *   # --db 省略 = 全球（scope: "global"，与 semrush-overview.mjs 一致）；--db xx = 该国家库
 *
 * 截图链路（opencli browser screenshot）2026-08-30 重构后已实盘验证（见 backlink/evidence/screenshot-chain-VERDICTS.md）；
 * 拍不到时行内记 screenshotError，不影响采集本身。
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { resolveSession, parseFlags, showHelpIfRequested, required, validateSession, opencli } from './opencli-core.mjs';
import { captureStable, expiryWarning, gotoInTool, launchTool, redactSecrets } from './lib-tools-share.mjs';
import { isRowComplete, rawExcerptOf, screenshotPaths, writeRawEvidence } from './lib-batch-evidence.mjs';
import {
  SCOPE_PROBE_JS, judgeScope, HOOK_JS, flattenRpc, rpcScopeWitness, trendContextFromText,
  armNetworkCapture, drainRpcWitness,
} from './lib-semrush-overview.mjs';

const flags = parseFlags(process.argv.slice(2));
showHelpIfRequested(flags, import.meta.url);

if (flags['self-test']) {
  const assert = (await import('node:assert/strict')).default;
  const confirmed = { verdict: 'confirmed', requested: 'global', reason: 'ok' };
  const mismatch = { verdict: 'mismatch', requested: 'global', reason: 'landed URL carries db=jp' };
  const unverified = { verdict: 'unverified', requested: 'us', reason: 'no RPC witness' };
  const metrics = { organicTraffic: 7800, authorityScore: 30 };

  const ok = applyScopeGate(metrics, confirmed);
  assert.equal(ok.organicTraffic, 7800);
  assert.equal(ok.authorityScore, 30);
  assert.equal(ok.stopReason, 'stable');
  assert.equal(ok.error, null);
  assert.equal(ok.unconfirmedOrganicTraffic, undefined, 'confirmed rows must not also carry unconfirmed fields');

  for (const bad of [mismatch, unverified, null, undefined]) {
    const gated = applyScopeGate(metrics, bad);
    assert.equal(gated.organicTraffic, null, `${bad?.verdict ?? 'missing scopeEvidence'}: organicTraffic must be withheld`);
    assert.equal(gated.authorityScore, null, `${bad?.verdict ?? 'missing scopeEvidence'}: authorityScore must be withheld`);
    assert.equal(gated.unconfirmedOrganicTraffic, 7800);
    assert.equal(gated.unconfirmedAuthorityScore, 30);
    assert.equal(gated.stopReason, 'scope-unconfirmed');
    assert.match(gated.error, /scope not confirmed/);
  }

  // The new stopReason must NOT be in lib-batch-evidence.mjs's COMPLETE_STOP_REASONS —
  // that is what makes an unconfirmed-scope row retry on the next run, without needing
  // to touch the lib the two batch scripts share.
  assert.equal(isRowComplete({ domain: 'x', stopReason: 'scope-unconfirmed' }), false);
  assert.equal(isRowComplete({ domain: 'x', stopReason: 'stable' }), true);

  // Every scopeEvidence this script produces must say the group-level (organic/ads)
  // scope question does not apply here, so a reader never mistakes "not measured"
  // for "confirmed global/country" at the section level.
  const annotated = attachSectionScopeNote(confirmed);
  assert.equal(annotated.verdict, 'confirmed', 'the underlying judgeScope verdict must survive untouched');
  assert.equal(annotated.sectionScopeNotApplicable, true);
  assert.match(annotated.sectionScopeNote, /organic|ads|分组/i);
  assert.equal(attachSectionScopeNote(null).sectionScopeNotApplicable, true, 'must annotate even a missing scopeEvidence');

  console.log('semrush-batch self-test passed');
  process.exit(0);
}

const outPath = required(flags, 'out');
const session = resolveSession(flags, 'sem-batch', 'semrush');
const appOrigin = (process.env.TOOLS_SHARE_APP_ORIGIN_SEMRUSH || 'https://sem.3ue.co').replace(/\/+$/, '');
// 口径：不传 --db = 全球（这张域名概览页有全球选项，与 semrush-overview.mjs 一致）；
// --db xx = 该国家库。是否真的落在这个口径由每域读数落地时的 scopeEvidence 核对。
const db = String(flags.db || '').trim().toLowerCase();
const scope = db || 'global';
// 超时与 settle 在 2026-08-24 调大过一次，**不要为了快再调回去**：
// 旧默认（settle 5s / 轮询间隔 2s / 超时 40s）下，占位值能安安稳稳撑过两次读，
// 「连读两次一致」这条判据整个失效——实测 4 个域名，1 个 AS 读成 0，3 个被读成空，
// 而它们的真值是 22 / 29 / 38 / 22。慢十几秒换一个不会骗人的数，这笔账是划算的。
const perDomainTimeout = Math.max(10_000, Number(flags['domain-timeout'] || 75) * 1000);
const settle = Number(flags.settle || 8);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalizeDomain(v) {
  const c = v.includes('://') ? new URL(v).hostname : v.split('/')[0];
  const n = c.trim().toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,63}$/.test(n) ? n : null;
}
function parseCompact(v) {
  const m = String(v || '').replace(/,/g, '').trim().match(/^([\d.]+)\s*([KMB])?$/i);
  if (!m) return null;
  return Math.round(Number(m[1]) * ({ k: 1e3, m: 1e6, b: 1e9 }[(m[2] || '').toLowerCase()] || 1));
}
function pick(lines, label, pattern) {
  const i = lines.findIndex((l) => l === label);
  if (i < 0) return null;
  return lines.slice(i + 1, i + 6).find((l) => pattern.test(l)) || null;
}

/**
 * 一次读出这一屏要用到的全部数值。**解析和「是否稳定」的指纹共用同一个函数**，
 * 否则指纹盯着 A、写出去的是 B，稳定性检查等于没做。
 * authorityScore 不能写 `Number(x) || null`：AS=0 是真实值（新站常见），与「没数据」相反。
 */
function readMetrics(bodyText) {
  const lines = String(bodyText || '').split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const as = pick(lines, 'Authority Score', /^\d+$/);
  return {
    organicTraffic: parseCompact(pick(lines, '自然流量', /^[\d.,]+\s*[KMB]?$/i)),
    authorityScore: as === null ? null : Number(as),
  };
}

/**
 * 口径闸门（纯函数，见文件头「口径闸门」一节）。数值已经稳定读出之后，只有
 * `scopeEvidence.verdict === 'confirmed'` 才收进 `organicTraffic`/`authorityScore`；
 * 其余一律置 `null`、把数值挪进 `unconfirmed*`、`stopReason` 记 `'scope-unconfirmed'`——
 * 这个值特意不在 lib-batch-evidence.mjs 的 COMPLETE_STOP_REASONS 里，续跑会重测。
 * `scopeEvidence` 缺失（探测本身失败）按 `unverified` 处理，不当成 confirmed 的默认值。
 */
function applyScopeGate(metrics, scopeEvidence) {
  if (scopeEvidence?.verdict === 'confirmed') {
    return {
      organicTraffic: metrics.organicTraffic,
      authorityScore: metrics.authorityScore,
      parse: 'parsed',
      stopReason: 'stable',
      error: null,
    };
  }
  const verdict = scopeEvidence?.verdict || 'unverified';
  const reason = scopeEvidence?.reason || 'scope evidence unavailable';
  return {
    organicTraffic: null,
    authorityScore: null,
    unconfirmedOrganicTraffic: metrics.organicTraffic,
    unconfirmedAuthorityScore: metrics.authorityScore,
    parse: 'parsed',
    stopReason: 'scope-unconfirmed',
    error: `scope not confirmed (${verdict}): ${reason} — values withheld from organicTraffic/authorityScore, see unconfirmedOrganicTraffic/unconfirmedAuthorityScore`,
  };
}

/**
 * 本脚本只读顶部卡片，不滚动、不读「自然搜索研究」「广告研究」分组，所以分组级口径
 * （`readGroupBadges`/`judgeSectionScopes`，跟随账号级「最近一次显式选择的国家」，
 * 可能与页头口径不同）本脚本完全没有证据。**不产出就是不产出**，不能让下游看到
 * `scopeEvidence` 里没提分组就默认「分组也是这个口径」——所以每行都显式贴一句说明。
 */
function attachSectionScopeNote(scopeEvidence) {
  // 字符串字面量特意写在函数体内、不提到模块顶层 const——self-test 在文件很靠前的位置
  // 就会调用这个函数（在别的顶层 const 之前），提到外层 const 会撞 TDZ。
  const note = '本行只覆盖顶部卡片（Authority Score/自然流量）的口径；未抓取「自然搜索研究」/「广告研究」分组，分组各自的国家徽标可能与本行口径不同，不适用/未测。';
  return { ...scopeEvidence, sectionScopeNotApplicable: true, sectionScopeNote: note };
}

const wanted = [];
for (const line of readFileSync(required(flags, 'domains-file'), 'utf8').split('\n')) {
  const d = normalizeDomain(line.trim());
  if (d && !wanted.includes(d)) wanted.push(d);
}
const done = new Set();
if (existsSync(outPath)) {
  for (const line of readFileSync(outPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try { const r = JSON.parse(line); if (isRowComplete(r)) done.add(r.domain); } catch { /* 半行 */ }
  }
}
const todo = wanted.filter((d) => !done.has(d));
console.error(`[sem] ${wanted.length} requested, ${done.size} already done, ${todo.length} to go`);
if (!todo.length) process.exit(0);

const launched = await launchTool({
  session, tool: 'semrush', node: flags.node,
  window: flags.window === 'foreground' ? 'foreground' : 'background',
  wait: Number(flags.wait || 7), timeout: Number(flags.launchTimeout || 60),
  allowParallelSession: Boolean(flags['allow-parallel-session']),
});
try {
const evaluate = launched.evalPage;
if (expiryWarning(launched.state)) console.error(`[sem] ${expiryWarning(launched.state)}`);

/** 该域采集时刻的现场：正文全文 + 截图，尽力而为，绝不反噬采集本身。 */
async function captureEvidence(domain, bodyText) {
  const evidence = { screenshot: null, raw: null, screenshotError: null };
  if (bodyText) {
    try {
      evidence.raw = writeRawEvidence({ outPath, domain, text: bodyText, redact: redactSecrets });
    } catch (e) { console.error(`[sem] raw evidence failed for ${domain}: ${redactSecrets(e.message || e)}`); }
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

// rpcScopeWitness() 真正会读的记录种类——见 lib-semrush-overview.mjs 里它自己的实现
// （国家流量表 + 趋势序列 + 本域名那一行竞争对手记录）。精简证据只留这三类，别的 kind
// （meta:dates 之类）没有参与判定，混进来只会让人误以为它们也是证据的一部分。
const WITNESS_KINDS = new Set(['googleCountries', 'trend', 'competitorRowsWithoutTraffic']);

/**
 * 接口证人：`drainRpcWitness()`（lib 导出，原样复用）drain 一次 CDP 捕获 + 取一次页内钩子，
 * 内部已按当前文档的 `performance.timeOrigin` 剔除掉时间戳早于本次导航的条目——这就是
 * 2026-09-13 checker 指出的多域串扰缺口的修法，本函数不再自己重新实现一遍过滤逻辑。
 * 拿到 `rpcEntries` 后在内存里（不再碰网络）用 `trendContextFromText()` 从 `bodyText` 认出
 * 页面级那套趋势序列，喂给 `rpcScopeWitness()` 算出最终证人——两套趋势序列同时存在时也能
 * 挑对，不再是「只有一套才用」的粗糙兜底。任何一步失败都不让采集本身陪葬——拿不到证人就
 * 返回 `witness: null`，`judgeScope()` 没有 rpcWitness 时最多判 `unverified`，绝不会因为
 * 这里出错而误判成 `confirmed`。
 *
 * **2026-09-14 独立 checker 第四轮**：多域场景下批量脚本自己不落盘任何原始 rpc 条目，
 * 跨域串扰想事后审计（"这条国家流量表数据到底是不是这一域的、还是上一域迟到的响应"）
 * 完全没有抓手——`drainRpcWitness()` 的 navStart 过滤解决了判定本身的正确性，但过程
 * 留不下痕迹。这里补一份精简证据 `rpcEvidence: [{id, kind, timestamp, msFromNavStart}]`：
 * 只留参与判定的三类记录（`WITNESS_KINDS`）、只留元数据，**不带响应正文**（`result`/
 * `next` 一律不进这份证据，避免行内输出被响应体撑大，也避免把整段业务数据在审计证据
 * 的名义下重复导出一遍）；`msFromNavStart` 是这条记录相对本域导航起点
 * （`performance.timeOrigin`）的时间差——离谱的负数或很大的正数是"这条数据看起来不像
 * 这次导航自己的"的信号，供事后人工审计，不参与判定本身（判定仍完全交给
 * `drainRpcWitness()` 内置的 navStart 过滤，这里只是把它的"料"摆出来给人看）。
 */
async function readRpcWitness(bodyText) {
  try {
    const drained = await drainRpcWitness({
      runOpencli: opencli, session: launched.session || session, env: launched.env, evaluate,
    });
    const rpc = flattenRpc(drained.rpcEntries);
    const ctx = trendContextFromText(rpc, bodyText, {});   // {} = 没有分组徽标，本脚本不读研究分组
    const witness = rpcScopeWitness(rpc, ctx);
    let navStart = null;
    try {
      const t = Number(await evaluate('(() => performance.timeOrigin)()'));
      navStart = Number.isFinite(t) ? t : null;
    } catch { /* 拿不到导航起点就只留原始时间戳，msFromNavStart 记 null，不是 0 */ }
    const rpcEvidence = rpc
      .filter((r) => WITNESS_KINDS.has(r.kind))
      .slice(0, 20)
      .map((r) => {
        // r.timestamp == null (missing, e.g. a hook entry that never got one) must
        // stay null — `Number(null) === 0` would otherwise silently turn "no
        // timestamp" into "timestamp 0", producing a nonsense large-negative
        // msFromNavStart instead of an honest "can't compute this".
        const hasTs = r.timestamp !== null && r.timestamp !== undefined && Number.isFinite(Number(r.timestamp));
        return {
          id: r.id ?? null,
          kind: r.kind,
          timestamp: r.timestamp ?? null,
          msFromNavStart: navStart !== null && hasTs ? Math.round(Number(r.timestamp) - navStart) : null,
        };
      });
    return { witness, rpcEvidence };
  } catch {
    return { witness: null, rpcEvidence: [] };
  }
}

/**
 * 口径核对：域名概览页有全球选项，但账号状态是共享的（backlink/references/
 * authorized-data-sources.md 记过实测：并发操作能悄悄改写"当前选中的国家"）。
 * 每域读数落地前都读一次页面地区选择器的实际选中项 + 接口证人，绝不能只把请求参数
 * 原样回填——那等于假装选择器读回来的和请求的永远一致。两个证人都要到位且互相印证
 * 才是 confirmed；读不出来、或只有 DOM 没有接口，都是 unverified，不是 confirmed。
 * 每次返回都附一句「分组口径不适用」的说明（见 attachSectionScopeNote）。
 */
async function readScope(rpcWitness) {
  try {
    return attachSectionScopeNote(judgeScope({ requestedDb: db, probe: await evaluate(SCOPE_PROBE_JS), rpcWitness }));
  } catch (error) {
    return attachSectionScopeNote({ requested: scope, verdict: 'unverified', reason: `scope probe failed: ${redactSecrets(error.message || String(error)).slice(0, 160)}` });
  }
}

let n = 0, consecutiveIncomplete = 0;
for (const domain of todo) {
  n += 1;
  const startedAt = Date.now();
  let row;
  let lastRead = null;
  try {
    // 布防必须在导航之前——首屏那批 rpc 在页面脚本一启动就发出（见文件头第 1 条）。
    await armNetworkCapture({ runOpencli: opencli, session: launched.session || session, env: launched.env }).catch(() => {
      /* 布防失败不影响采集本身，只是这一域的接口证人可能拿不全——readRpcWitness 会照常尝试 drain。 */
    });
    await gotoInTool(evaluate, `${appOrigin}/analytics/overview/?q=${encodeURIComponent(domain)}&searchType=domain${db ? `&db=${encodeURIComponent(db)}` : ''}`, settle);
    // 补抓布防之后陆续发出的 rpc（稳定判据轮询期间那几轮）。装晚了也没关系，
    // 首屏那批已经由上面的 CDP 布防兜底。
    await evaluate(HOOK_JS).catch(() => {});
    // 就绪判据认「Authority Score」而不是标题；**但认到标签也还不算数**——
    // 标签挂上来时数值区还停在占位上，晚几秒才水合出真值。
    // **而且「连读两次一致」也不够**（2026-08-24 实测打脸）：占位值本身是稳定的，
    // 两次快读之间它根本没变。所以这里再加两条，都是从实测的错法反推出来的：
    //
    //   1. **一个字段都没解析出来 = 还没渲染，永远不收。** 旧代码把它当空读数收下，
    //      于是 na.whatismymmr.com（AS 29）、saveeditonline.com（AS 38）、
    //      vgcmulticalc.com（AS 22）三个站被读成空。超时了就记未完成，
    //      让续跑重测——**渲染慢和没有数据在超时那一刻不可区分，而含义相反**。
    //   2. **自然流量 > 0 却 AS = 0 是矛盾的**，说明 AS 还停在占位（AS 比流量晚水合）。
    //      这种指纹要连读六次才认（约 18 秒）——真的是 0 就该一直是 0；
    //      是占位就会在这段时间里翻成真值。这是**采集侧的稳定性判据**，不是闸门：
    //      六次仍矛盾就带着 suspectedPlaceholder 标记落盘，判断交给 AI。
    const suspicious = (print) => {
      const m = JSON.parse(print);
      return m.organicTraffic !== null && m.organicTraffic > 0 && m.authorityScore === 0;
    };
    const settled = await captureStable({
      read: async () => {
        const s = await evaluate(`(() => ({
        url: location.href,
        ready: /Authority Score|权威分数/.test(document.body?.innerText || ''),
        bodyText: (document.body?.innerText || '').slice(0, 20000)
      }))()`);
        lastRead = s;
        return s;
      },
      fingerprint: (s) => {
        if (!s?.ready || !String(s.url || '').includes(encodeURIComponent(domain))) return null;
        const m = readMetrics(s.bodyText);
        if (m.organicTraffic === null && m.authorityScore === null) return null;   // 一个都没解析出来
        return JSON.stringify(m);
      },
      needed: (print) => (suspicious(print) ? 6 : 2),
      timeoutMs: perDomainTimeout - (Date.now() - startedAt),
      intervalMs: Number(flags['stable-interval'] || 3) * 1000,
    });
    const bodyText = settled.capture?.bodyText ?? lastRead?.bodyText ?? '';
    const evidence = await captureEvidence(domain, bodyText);
    const { witness: rpcWitness, rpcEvidence } = await readRpcWitness(bodyText);
    const scopeEvidence = await readScope(rpcWitness);
    const base = {
      domain,
      db: db || null,
      scope,
      scopeEvidence,
      rpcEvidence,
      rawExcerpt: rawExcerptOf(redactSecrets(bodyText)),
      evidence,
      checkedAt: new Date().toISOString(),
    };
    if (!settled.stable) {
      // **超时/不稳定记未完成，绝不当读数。** 两种成因分开写，因为后续动作不同：
      // 「什么都没解析出来」多半是慢/节点，重跑即可；「AS 一直是 0」要么这个站真是 0，
      // 要么这个节点水合特别慢——两次都这样就该换 --node 或调大 --domain-timeout。
      const placeholder = settled.fingerprint ? suspicious(settled.fingerprint) : false;
      row = {
        ...base,
        organicTraffic: null,
        authorityScore: null,
        parse: 'none',
        stopReason: settled.fingerprint ? 'unstable' : 'timeout',
        suspectedPlaceholder: placeholder,
        error: settled.fingerprint
          ? `unstable: ${settled.fingerprint} held for ${settled.reads} reads but looks like a placeholder (traffic > 0 with AS 0)`
          : 'timeout: overview rendered no parseable metric',
      };
    } else {
      const m = readMetrics(settled.capture.bodyText);
      row = {
        ...base,
        // 到这里至少有一个字段解析出来了。流量没解析出来而 AS 有值意味着什么，
        // 由 AI 对着 rawExcerpt / 截图判——脚本只记录两个原始值。
        // 口径闸门（applyScopeGate）决定这两个数是进 organicTraffic/authorityScore
        // 还是被挪进 unconfirmed*——见文件头「口径闸门」一节。
        ...applyScopeGate(m, scopeEvidence),
        suspectedPlaceholder: m.organicTraffic !== null && m.organicTraffic > 0 && m.authorityScore === 0,
      };
    }
  } catch (error) {
    const evidence = await captureEvidence(domain, lastRead?.bodyText).catch(() => ({ screenshot: null, raw: null, screenshotError: 'evidence capture itself failed' }));
    const { witness: rpcWitness, rpcEvidence } = await readRpcWitness(lastRead?.bodyText ?? '').catch(() => ({ witness: null, rpcEvidence: [] }));
    const scopeEvidence = await readScope(rpcWitness);
    row = {
      domain,
      db: db || null,
      scope,
      scopeEvidence,
      rpcEvidence,
      organicTraffic: null,
      authorityScore: null,
      parse: 'none',
      stopReason: 'exception',
      suspectedPlaceholder: false,
      rawExcerpt: rawExcerptOf(redactSecrets(lastRead?.bodyText ?? '')),
      evidence,
      error: redactSecrets(error.message || error),
      checkedAt: new Date().toISOString(),
    };
  }
  appendFileSync(outPath, `${JSON.stringify(row)}\n`, 'utf8');
  if (!isRowComplete(row)) {
    consecutiveIncomplete += 1;
    if (consecutiveIncomplete >= 5) {
      console.error(`[sem] ABORT: ${consecutiveIncomplete} consecutive incomplete rows — session dead or quota exhausted, not the domains. Check the panel's 今日配额 before rerunning.`);
      process.exit(3);
    }
  } else consecutiveIncomplete = 0;
  console.error(`[sem] ${n}/${todo.length} ${domain} → ${row.stopReason}${row.organicTraffic != null ? ` (${row.organicTraffic})` : ''} ${Math.round((Date.now() - startedAt) / 1000)}s`);
}
console.error('[sem] done');
} finally {
  await launched.releaseBrowserLocks?.();
}
