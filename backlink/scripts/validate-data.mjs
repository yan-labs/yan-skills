#!/usr/bin/env node
// 数据层的机械门禁。**每个 PR 都必须跑通这个**，CI 也跑它。
//
// 【为什么校验器比清单本身更重要】
// 这个 Skill 的价值主张是「这里的每一条都被真的验证过」。
// 一旦有人凭印象写进来一条「XX 站可以发、dofollow」，而没人能分辨它是观察还是猜测，
// 整张表就退化成又一份网上到处都是的复制粘贴清单——**那时它的价值不是变小，是归零**。
// 所以规则是：**宁可拒绝一条真的记录，也不放进一条没有证据的记录。**
//
// 校验分两层：
//   1. 结构：字段、枚举、日期格式、id 唯一且不复用；
//   2. 语义：证据与断言必须自洽——这一层才是真正在挡人。
//
// 用法：
//   node scripts/validate-data.mjs            # 校验全部
//   node scripts/validate-data.mjs --quiet    # 只在失败时输出

import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cohortOf, primaryGate, COHORTS } from './lib-cohort.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const quiet = process.argv.includes('--quiet');

const errors = [];
const warns = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warns.push(`${where}: ${msg}`);

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const daysAgo = (s) => Math.floor((Date.now() - Date.parse(s)) / 86_400_000);

// —— free-channels ————————————————————————————————————————————————
const free = JSON.parse(await readFile(join(DATA, 'free-channels.json'), 'utf8'));
const KIND = new Set(['publish-platform', 'guestbook-engine', 'domain-report', 'comment-form', 'forum', 'wiki', 'paste', 'profile', 'directory']);
const STATUS = new Set(['live', 'changed', 'dead', 'rejected', 'unverified']);
const CAPTCHA = new Set(['none', 'passive', 'interactive', 'unknown']);
const METHOD = new Set(['browser-dom', 'anonymous-http', 'both']);
const seen = new Set();

for (const c of free.channels) {
  const at = `free-channels[${c.id || '?'}]`;
  if (!c.id || !/^[a-z0-9][a-z0-9-]*$/.test(c.id)) err(at, 'id 缺失或不是小写短横线 slug');
  if (seen.has(c.id)) err(at, 'id 重复。**死掉的记录要保留并标 status: dead，绝不回收 id 给别的渠道**——回收会让历史证据指向错误的对象');
  seen.add(c.id);
  if (!KIND.has(c.kind)) err(at, `kind 非法：${c.kind}`);
  if (!STATUS.has(c.status)) err(at, `status 非法：${c.status}`);
  if (!CAPTCHA.has(c.captcha)) err(at, `captcha 非法：${c.captcha}`);
  if (!isDate(c.lastVerifiedAt)) err(at, 'lastVerifiedAt 必须是 YYYY-MM-DD');
  if (!c.evidence || !METHOD.has(c.evidence.method)) err(at, 'evidence.method 必须是 browser-dom / anonymous-http / both');
  if (!c.evidence?.what || c.evidence.what.length < 10) err(at, 'evidence.what 太短：写清楚**看到了什么**，不是「测过了」');
  if ('notes' in c && (typeof c.notes !== 'string' || c.notes.length < 5)) err(at, 'notes 太短或类型不对——写清楚字段值的来源，或本轮改回了什么');

  // —— 语义层：证据要撑得住断言 ————————————————————————————
  // 「没有 rel」= dofollow，是这张表里最有价值也最容易被凭空写上去的一条。
  if (Array.isArray(c.relObserved) && c.relObserved.some((r) => r === '')) {
    if (c.evidence?.method === 'anonymous-http' && c.browserRequired) {
      err(at, '声称观察到 dofollow（空 rel），但证据只来自匿名 HTTP 而该渠道又标了 browserRequired —— 两者不能同时成立');
    }
  }
  // 「没有锚点」「渠道已死」这类**否定结论**，纯 HTTP 撑不住：
  // 大量站点是客户端渲染，或对脚本请求直接回 403。
  if ((c.anchorRendered === false || c.status === 'dead') && c.evidence?.method === 'anonymous-http') {
    err(at, '否定结论（anchorRendered=false 或 status=dead）只有匿名 HTTP 证据。纯 HTTP 只能用来确认「存在什么」，不能确认「不存在」——必须有 browser-dom 证据');
  }
  if (c.status === 'rejected' && !c.rejectReason) err(at, 'status=rejected 必须写 rejectReason');
  if (c.captcha === 'interactive' && c.status === 'live') {
    err(at, 'captcha=interactive 不能标 live —— 需要人点选/解题的挑战一律记为拒绝，本 Skill 不绕验证码');
  }
  if (c.scope === 'engine' && c.indexable === true) {
    err(at, 'scope=engine 不得断言整体 indexable=true —— 引擎决定怎么发，宿主/板主决定 robots，必须逐个探测，用 "per-host"');
  }
  if (/noindex/i.test(String(c.robotsObserved || '')) && c.indexable === true) {
    err(at, 'robotsObserved 含 noindex 却标 indexable=true');
  }
  if (c.status === 'live' && isDate(c.lastVerifiedAt) && daysAgo(c.lastVerifiedAt) > 180) {
    warn(at, `标为 live 但已 ${daysAgo(c.lastVerifiedAt)} 天未复验。这一类渠道消失得比改版还快——复验或改成 unverified`);
  }
}

// —— network-fingerprints —————————————————————————————————————
// Family-level negatives stay separate from individual channels. A domain in
// this file is evidence to stop and cluster, never evidence that a link exists.
const networkData = JSON.parse(await readFile(join(DATA, 'network-fingerprints.json'), 'utf8'));
const networkIds = new Set();
const networkDomains = new Set();
for (const network of networkData.networks || []) {
  const at = `network-fingerprints[${network.id || '?'}]`;
  if (!network.id || !/^[a-z0-9][a-z0-9-]*$/.test(network.id)) err(at, 'id 缺失或不是小写短横线 slug');
  if (networkIds.has(network.id)) err(at, 'id 重复');
  networkIds.add(network.id);
  if (network.policy !== 'exclude-family') err(at, `policy 非法：${network.policy}`);
  if (!Array.isArray(network.evidence) || network.evidence.length < 2 || network.evidence.some((u) => !/^https?:\/\//.test(u))) {
    err(at, 'evidence 至少需要两个 http(s) 来源，避免单帖传闻直接变成族级黑名单');
  }
  if (!Array.isArray(network.fingerprints) || network.fingerprints.length < 2) err(at, 'fingerprints 至少需要两个独立指纹');
  if (!Array.isArray(network.domains) || network.domains.length < 2) err(at, 'domains 至少需要两个域名，单域名不构成网络');
  const local = new Set();
  for (const domain of network.domains || []) {
    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(domain)) err(at, `非法域名：${domain}`);
    if (local.has(domain)) err(at, `域名重复：${domain}`);
    if (networkDomains.has(domain)) err(at, `域名跨网络重复：${domain}`);
    local.add(domain);
    networkDomains.add(domain);
  }
  const exceptions = new Set((network.exceptions || []).map((x) => x.domain));
  for (const domain of exceptions) if (local.has(domain)) err(at, `例外域名仍在 domains 中：${domain}`);
  if (network.observed?.excludedDomains !== local.size) err(at, 'observed.excludedDomains 必须等于 domains 数');
  if (network.observed?.listedDomains !== local.size + exceptions.size) err(at, 'observed.listedDomains 必须等于 domains + exceptions 数');
  if (!isDate(network.observed?.checkedAt)) err(at, 'observed.checkedAt 必须是 YYYY-MM-DD');
}

// —— index-submission ————————————————————————————————————————
// **这张表里没有一条外链。** 它记的是「把 URL 交给谁去收录」，
// 和 free-channels 是两类东西，混进去会直接毁掉那张表的语义
// （那边每条都要回答 anchorRendered / relObserved，这边这两个字段根本不存在）。
// 它之所以属于本 Skill：verify 阶段的 `indexed` 一直没说清是**谁的** index，
// 而不在 IndexNow 成员里的引擎，我们那套自动推送一条都没送到。
const idx = JSON.parse(await readFile(join(DATA, 'index-submission.json'), 'utf8'));
const idxSeen = new Set();
for (const e of idx.engines || []) {
  const at = `index-submission[${e.id || '?'}]`;
  if (!e.id || !/^[a-z0-9][a-z0-9-]*$/.test(e.id)) err(at, 'id 缺失或不是小写短横线 slug');
  if (idxSeen.has(e.id)) err(at, 'id 重复');
  idxSeen.add(e.id);
  if (!STATUS.has(e.status)) err(at, `status 非法：${e.status}`);
  if (!CAPTCHA.has(e.captcha)) err(at, `captcha 非法：${e.captcha}`);
  if (typeof e.independentIndex !== 'boolean') err(at, 'independentIndex 必填');
  if (typeof e.indexNowMember !== 'boolean') err(at, 'indexNowMember 必填');
  if (typeof e.batch !== 'boolean') err(at, 'batch 必填');
  if (!isDate(e.lastVerifiedAt)) err(at, 'lastVerifiedAt 必须是 YYYY-MM-DD');
  if (!e.evidence || !METHOD.has(e.evidence.method)) err(at, 'evidence.method 必须是 browser-dom / anonymous-http / both');
  if (!e.evidence?.what || e.evidence.what.length < 10) err(at, 'evidence.what 太短：写清楚确认文案说了什么、以及有几条是逐条复读过的');

  // —— 语义层 ————————————————————————————————————————————
  // 手工提交的**唯一**理由是「自动推送送不到」。两个都为真的记录是在凭空造工作量。
  if (e.indexNowMember === true && e.independentIndex === false) {
    err(at, 'indexNowMember=true 且 independentIndex=false —— 这种引擎既被自动推送覆盖、又没有自己的索引，手工提交毫无意义，不该收进这张表');
  }
  // GEO 论据最容易退化成传闻（「某某助手用的是它」）。只收运营方自己publish的说法 + 出处。
  if (e.aiGrounding && (e.aiGrounding.claimed !== true || !/^https?:\/\//.test(e.aiGrounding.source || ''))) {
    err(at, 'aiGrounding 必须带 claimed=true 和一个 http(s) 出处 —— 这一格是 GEO 论据，没有出处就是传闻');
  }
  if (e.captcha === 'interactive' && e.status === 'live') {
    err(at, 'captcha=interactive 不能标 live —— 需要人解题的挑战一律记为拒绝，本 Skill 不绕验证码');
  }
  if (e.status === 'rejected' && !e.rejectReason) err(at, 'status=rejected 必须写 rejectReason');
  if (e.batch === false && !e.howToSubmit) {
    warn(at, 'batch=false 却没写 howToSubmit —— 逐条提交的成本随页数线性增长，动手前必须能算出这个数');
  }
  if (e.status === 'live' && isDate(e.lastVerifiedAt) && daysAgo(e.lastVerifiedAt) > 180) {
    warn(at, `标为 live 但已 ${daysAgo(e.lastVerifiedAt)} 天未复验`);
  }
}

// —— submission-targets ————————————————————————————————————————
// 这张表是**第一轮筛选的产物**，语义和 free-channels 不同，绝不能混：
// free-channels 的每一条都观察到过一个**已发布的链接**（所以要回答 anchorRendered /
// relObserved）；这张表只观察到「有一个能提交的入口」，对 rel、锚点、收录**不做任何断言**。
// 它存在的理由见 references/acquisition-doctrine.md 第 3 条：第一轮的结果本身就是资产，
// 而且是跨站复用的资产——相关性和权重只用来排序，永远不作为准入门槛。
const targets = JSON.parse(await readFile(join(DATA, 'submission-targets.json'), 'utf8'));
const T_KIND = new Set(['product-directory', 'ai-directory', 'startup-launch', 'saas-review', 'web-directory', 'business-directory', 'dev-community', 'publish-platform', 'comment-form', 'search-engine', 'contact-form', 'unknown']);
const T_GATE = new Set(['open-form', 'account', 'captcha-interactive', 'captcha-passive', 'email-verify', 'personal-contact', 'reciprocal', 'manual-review', 'none-found', 'unknown']);
const T_STATUS = new Set(['usable', 'gated', 'unverified', 'dead']);
const T_PAY = new Set(['none-seen', 'optional', 'required', 'unknown']);
const tSeen = new Set();
let legacyVerdicts = 0;
for (const t of targets.targets || []) {
  const at = `submission-targets[${t.domain || '?'}]`;
  if (!t.domain || !/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(t.domain)) err(at, 'domain 必须是小写可注册域名，不带 scheme 也不带 www');
  if (tSeen.has(t.domain)) err(at, 'domain 重复 —— 同一个站的多个提交入口合成一条，route 记你真正走通的那个');
  tSeen.add(t.domain);
  if (!T_KIND.has(t.kind)) err(at, `kind 非法：${t.kind}`);
  if (!T_GATE.has(t.gate)) err(at, `gate 非法：${t.gate}`);
  if (!Array.isArray(t.gates) || !t.gates.length) err(at, 'gates 必填且非空 —— 一个站可以同时要账号、验证码和邮箱确认，只记最早那道会把另外两道的成本藏掉，而成本决定它能进哪一批');
  else {
    for (const g of t.gates) if (!T_GATE.has(g)) err(at, `gates 含非法值：${g}`);
    if (new Set(t.gates).size !== t.gates.length) err(at, 'gates 有重复项');
    if (!t.gates.includes(t.gate)) err(at, `gate=${t.gate} 不在 gates 里 —— gate 是从 gates 里选出来的那一个，不是另写的`);
    // 分组必须是算出来的。四个地方各算一遍就会出现四个答案，
    // 而「数据里写 account、报告里写 open」比没有标签更糟：会有人照着它排一整批。
    const want = cohortOf(t.gates);
    if (t.cohort !== want) err(at, `cohort=${t.cohort} 与 gates=[${t.gates.join(', ')}] 不一致，应为 ${want}（用 scripts/lib-cohort.mjs 的 cohortOf 算，不要手写）`);
    const wantGate = primaryGate(t.gates);
    if (t.gate !== wantGate) err(at, `gate=${t.gate} 与 gates 不一致，应为 ${wantGate}（按代价排序，不是按 DOM 出现顺序）`);
  }
  if (!COHORTS.includes(t.cohort)) err(at, `cohort 非法：${t.cohort}`);
  if (!T_STATUS.has(t.status)) err(at, `status 非法：${t.status}`);
  if (!T_PAY.has(t.payment)) err(at, `payment 非法：${t.payment}`);
  if (!isDate(t.lastProbedAt)) err(at, 'lastProbedAt 必须是 YYYY-MM-DD');
  if (!t.evidence || !METHOD.has(t.evidence.method)) err(at, 'evidence.method 必须是 browser-dom / anonymous-http / both');
  if (!t.evidence?.what || t.evidence.what.length < 10) err(at, 'evidence.what 太短：写清楚**看到了什么**');

  // —— 语义层 ————————————————————————————————————————————
  // 「死了」是否定结论，纯 HTTP 撑不住——除非它 200 到了一个明显不是提交面的页面，
  // 那属于「观察到了存在什么」，是允许的。
  if (t.status === 'dead' && t.evidence?.method === 'anonymous-http' && !t.evidence?.finalUrl) {
    err(at, 'status=dead 只有匿名 HTTP 证据且没记 finalUrl。纯 HTTP 不能证明「不存在」；域名被改作他用要靠 finalUrl + title 来证');
  }
  const humanGate = (t.gates || []).find((g) => ['captcha-interactive', 'account', 'reciprocal', 'personal-contact'].includes(g));
  if (t.status === 'usable' && humanGate) {
    err(at, `status=usable 但 gates 含 ${humanGate} —— 需要人过的闸一律记 gated，本 Skill 不绕验证码也不替站主注册账号`);
  }
  if (t.status === 'usable' && t.gate === 'none-found') err(at, 'status=usable 却没找到入口，两者不能同时成立');
  // 价格会被当事实引用。
  if (t.price && !isDate(t.priceCheckedAt || '')) err(at, '写了 price 就必须写 priceCheckedAt：没有日期的价格是误导');
  if (t.payment === 'required' && !t.price) warn(at, 'payment=required 却没记 price —— 「要钱」而说不出多少钱，下次还得再查一遍');
  // 这张表不许悄悄升格成 free-channels。
  for (const k of ['relObserved', 'anchorRendered', 'indexable']) {
    if (k in t) err(at, `不得出现字段 ${k} —— 这张表没有观察过任何已发布的链接。观察到了就把它升进 free-channels.json`);
  }
  // 流量是测量不是判决：表里落的是实测数字 + 证据指针，门槛由 targets-select
  // 在查询时现算，「空值意味着什么」由 AI 读证据下判。所以这里校验的是
  // 「测量自洽」：说得出什么时候测的、用什么口径测的。
  if (t.traffic !== undefined && t.traffic !== null) {
    const tr = t.traffic;
    if (!tr.checkedAt || Number.isNaN(Date.parse(tr.checkedAt))) err(at, 'traffic 必须写 checkedAt：流量是会变的，没有日期的流量数字不能当门槛用');
    if (!tr.source) err(at, 'traffic 必须写 source：不同数据源的口径不同，不标来源就没法互相核对');
    const v = tr.monthlyVisits;
    if (v !== null && typeof v !== 'number') err(at, `traffic.monthlyVisits 必须是数字或 null，读到 ${JSON.stringify(v)}`);
    // verdict 是 legacy 字段（判断已上交 AI，2026-08-30 起新写入不再落它）。
    // 旧值保留作历史参考：只可当「当时的脚本这么判过」，不可当测量事实。
    if (tr.verdict !== undefined) {
      if (!['pass', 'fail', 'below-floor'].includes(tr.verdict)) {
        err(at, `traffic.verdict 非法：${tr.verdict}（error 从来不是结论；合法的 legacy 值只有 pass/fail/below-floor）`);
      } else {
        legacyVerdicts += 1; // 逐行各报一条会淹掉别的警告，循环后汇总报一次
      }
    }
    // 新写入应带证据指针；没有的（legacy 行）提醒但不拦——那正是「无现场可复核」的历史债。
    if (tr.verdict === undefined && !tr.evidence) {
      warn(at, 'traffic 没有 evidence 指针（stopReason/screenshot/raw/jsonl）：无现场可复核的测量，建议重测');
    }
  }
  if (t.status !== 'dead' && isDate(t.lastProbedAt) && daysAgo(t.lastProbedAt) > 180) {
    warn(at, `已 ${daysAgo(t.lastProbedAt)} 天未复探。目录类渠道消失得比改版还快`);
  }
}
if (legacyVerdicts > 0) {
  warn('submission-targets', `${legacyVerdicts} 行 traffic 仍带 legacy verdict 字段（判断已上交 AI，新写入不再落 verdict）。旧值只可当历史参考；重测即替换，或 apply-traffic-screen --strip-legacy-verdicts 一次清除`);
}

// —— paid-platforms ————————————————————————————————————————————
const paid = JSON.parse(await readFile(join(DATA, 'paid-platforms.json'), 'utf8'));
const TIER = new Set(['paid-listing', 'link-package', 'free-with-account', 'spam-net', 'not-a-platform', 'unverified']);
for (const [host, p] of Object.entries(paid.platforms || {})) {
  const at = `paid-platforms[${host}]`;
  if (!TIER.has(p.tier)) err(at, `tier 非法：${p.tier}`);
  // 价格是会被当成事实引用的东西，所以必须能说出「什么时候看的」。
  if (p.price && !isDate(p.priceCheckedAt || '')) err(at, '写了 price 就必须写 priceCheckedAt（YYYY-MM-DD）：价格会被直接引用，没有日期的价格是误导');
  if (p.tier !== 'unverified' && p.tier !== 'spam-net' && !p.notes) warn(at, '已分档但没写 notes，别人无法复核你凭什么这么分');
  // 这张表原本只收「被观察到有人在这里买过位置」的平台，因为一张没有观察对象的价目表
  // 就是又一份传闻。但「谁买过」和「它要多少钱」是两种不同的观察，后者同样是我们亲眼看的：
  // 打开它自己的提交/定价页读到的报价。所以放行第二种，条件是必须说得出**在哪一页、哪一天**读到的。
  // 两者都没有，才是真的没有证据。
  const hasPlacements = Array.isArray(p.observedSites) && p.observedSites.length;
  const hasPriceObs = p.observedPrice && isDate(p.observedPrice.checkedAt || '') && /^https?:\/\//.test(p.observedPrice.sourceUrl || '') && typeof p.observedPrice.what === 'string' && p.observedPrice.what.length >= 10;
  if (!hasPlacements && !hasPriceObs) {
    err(at, 'observedSites 为空，且没有合格的 observedPrice —— 这张表只收观察：要么观察到有人在这里投放过（observedSites），要么观察到它自己标的价（observedPrice 需 sourceUrl + checkedAt + what）。两者皆无就是传闻');
  }
  if (p.observedPrice && !hasPriceObs) err(at, 'observedPrice 不完整：需要 sourceUrl（http 开头）、checkedAt（YYYY-MM-DD）和 what（读到了什么，≥10 字）');
}

if (!quiet || errors.length) {
  process.stdout.write(`free-channels: ${free.channels.length} 条（live ${free.channels.filter((c) => c.status === 'live').length}）\n`);
  process.stdout.write(`network-fingerprints: ${networkIds.size} 个网络（排除域名 ${networkDomains.size}）\n`);
  process.stdout.write(`paid-platforms: ${Object.keys(paid.platforms || {}).length} 条\n`);
  process.stdout.write(`index-submission: ${(idx.engines || []).length} 条（收录提交口，**不是外链**）\n`);
  const tl = (targets.targets || []);
  process.stdout.write(`submission-targets: ${tl.length} 条（可提交入口，**尚未观察到任何已发布链接**；usable ${tl.filter((t) => t.status === 'usable').length} / gated ${tl.filter((t) => t.status === 'gated').length}）\n`);
  const cohorts = tl.reduce((m, t) => ((m[t.cohort] = (m[t.cohort] || 0) + 1), m), {});
  process.stdout.write(`  批次：${Object.entries(cohorts).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(' · ')}\n`);
  const live = tl.filter((t) => t.status !== 'dead');
  const measured = live.filter((t) => t.traffic);
  const withNumber = measured.filter((t) => typeof t.traffic.monthlyVisits === 'number');
  const atLeast100 = withNumber.filter((t) => t.traffic.monthlyVisits >= 100);
  process.stdout.write(`  流量测量：有数字 ${withNumber.length}/${live.length}（其中 >=100 月访问 ${atLeast100.length}，供参考——门槛由 targets-select 现算），无数字 ${measured.length - withNumber.length}，未测 ${live.length - measured.length}\n`);
  if (live.length - measured.length > 0) {
    process.stdout.write(`  ⓘ 未测的不等于合格。填表前先跑 similarweb-batch.mjs，再用 targets-select --min-traffic 100 选批次\n`);
  }
  if (measured.length - withNumber.length > 0) {
    process.stdout.write(`  ⓘ 无数字也不等于低流量：可能是数据源空态或采集未完成，看 traffic.evidence 分辨\n`);
  }
  for (const w of warns) process.stdout.write(`  ⚠ ${w}\n`);
}
if (errors.length) {
  process.stderr.write(`\n校验失败，${errors.length} 个问题：\n`);
  for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
  process.exit(1);
}
if (!quiet) process.stdout.write(`\n✓ 校验通过${warns.length ? `（${warns.length} 条警告）` : ''}\n`);
