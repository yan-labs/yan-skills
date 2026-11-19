// backlink/scripts/ground-truth.mjs 纯函数断言 —— 全部注入假数据，不碰浏览器。
//
// 锁四件事（对应 2026-08-29 试点的三个实测事实 + 剥敏红线）：
//   1. 就绪判据绑 filledCells > 0，**不是文本长度**：deep text 9 秒就 1.6M（壳），
//      数据 76 秒才落（850 格）。文本长度判据会提前约 1 分钟误判。
//   2. 到底判据 = 双证人同时不变：census 指纹相同 **且** 截图 md5 相同。
//      单证人不变不算到底。
//   3. manifest 形状：下游（AI 对质、后续脚本）按这些键读，漂了要立刻红。
//   4. URL / eval 载荷剥敏：__gmitm 只留空值键名，token/jwt/auth 类删除，
//      cookie/authorization 形状的串替换为 [REDACTED]。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CENSUS_EXPR,
  buildManifest,
  buildScrollExpr,
  censusFingerprint,
  detectEmptyState,
  hashSegments,
  isCensusStableShotUnstable,
  isChartReady,
  isHijacked,
  isReady,
  isStalled,
  isSuspectedEmptyState,
  isTextReady,
  pairsIdentical,
  parseAcceptRedirects,
  pickScrollContainer,
  resolveReadyText,
  resolveScrollMode,
  sanitizeUrlString,
  scrubEvalPayload,
} from '../scripts/ground-truth.mjs';

// ---------------------------------------------------------------------------
// 1. 就绪判据
// ---------------------------------------------------------------------------

test('就绪判据：filledCells > 0 才算就绪', () => {
  assert.equal(isReady({ deep: { filledCells: 850, textLength: 1_605_808 } }), true);
  assert.equal(isReady({ deep: { filledCells: 1, textLength: 100 } }), true);
});

test('就绪判据：1.6M 的深层文本、0 个非空单元格 —— 这是壳，不是货，不许判就绪', () => {
  // 试点 9 秒时刻的真实读数形状：textLength 已经 1,599,006，数据一个格都没落。
  const shellOnly = { deep: { filledCells: 0, textLength: 1_599_006 }, lightDom: { textLength: 59 } };
  assert.equal(isReady(shellOnly), false, '用文本长度当就绪判据会提前 1 分钟误判');
});

test('就绪判据：缺字段 / 非数字一律不就绪，不许静默放行', () => {
  assert.equal(isReady(undefined), false);
  assert.equal(isReady({}), false);
  assert.equal(isReady({ deep: {} }), false);
  assert.equal(isReady({ deep: { filledCells: 'yes' } }), false);
});

// ---------------------------------------------------------------------------
// 2. 到底判据：双证人同时不变
// ---------------------------------------------------------------------------

const pairAt = (scrollY, md5, filled = 850) => {
  const capture = { scrollY, census: { deep: { filledCells: filled, textLength: 1_605_808 } } };
  return { capture, md5, fingerprint: censusFingerprint(capture) };
};

test('到底判据：census 指纹相同 且 md5 相同 → 到底', () => {
  assert.equal(pairsIdentical(pairAt(2156, 'aaa'), pairAt(2156, 'aaa')), true);
});

test('到底判据：只有一个证人不变不算到底', () => {
  // 像素证人变了（虚拟滚动/动画），DOM 证人没变 → 不算。
  assert.equal(pairsIdentical(pairAt(2156, 'aaa'), pairAt(2156, 'bbb')), false);
  // DOM 证人变了（scrollY 或 census 任一），像素证人没变 → 不算。
  assert.equal(pairsIdentical(pairAt(1987, 'aaa'), pairAt(2156, 'aaa')), false);
  assert.equal(pairsIdentical(pairAt(2156, 'aaa', 850), pairAt(2156, 'aaa', 851)), false);
});

test('到底判据：首步没有上一步可比 → 不算到底', () => {
  assert.equal(pairsIdentical(null, pairAt(0, 'aaa')), false);
  assert.equal(pairsIdentical(undefined, pairAt(0, 'aaa')), false);
});

test('census 指纹不含时间戳：同一画面两次读，when 不同不影响指纹', () => {
  const a = { when: '2026-08-29T06:42:20.063Z', scrollY: 586.5, census: { deep: { filledCells: 850 } } };
  const b = { when: '2026-08-29T06:42:29.999Z', scrollY: 586.5, census: { deep: { filledCells: 850 } } };
  assert.equal(censusFingerprint(a), censusFingerprint(b));
});

// ---------------------------------------------------------------------------
// 3. manifest 形状
// ---------------------------------------------------------------------------

test('manifest 形状：顶层键齐全，步与轮各带承重字段', () => {
  const manifest = buildManifest({
    url: 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&searchType=domain&__gmitm=SECRET123',
    session: 'semrush-nav',
    startedAt: '2026-08-29T06:40:25.000Z',
    finishedAt: '2026-08-29T06:43:00.000Z',
    readyAfterMs: 76_000,
    budgetSeconds: 180,
    maxScreens: 12,
    stopReason: 'stable',
    polls: [
      { poll: 1, file: 'census-poll1.json', when: '2026-08-29T06:40:34.000Z', elapsedMs: 9000, scrollY: 0, filledCells: 0, deepTextLength: 1_599_006 },
    ],
    steps: [
      { step: 1, censusFile: 'census-s1.json', shotFile: 'shot-s1.png', when: '2026-08-29T06:41:45.000Z', scrollY: 0, filledCells: 850, screenshotMd5: 'aaa', sameAsPrevious: null },
      { step: 2, censusFile: 'census-s2.json', shotFile: 'shot-s2.png', when: '2026-08-29T06:41:52.000Z', scrollY: 2156, filledCells: 850, screenshotMd5: 'aaa', sameAsPrevious: true },
    ],
  });

  for (const key of ['schemaVersion', 'url', 'session', 'startedAt', 'finishedAt', 'budgetSeconds',
    'maxScreens', 'readyAfterMs', 'pollCount', 'stepCount', 'stopReason', 'error', 'polls', 'steps']) {
    assert.ok(key in manifest, `manifest 缺 ${key}`);
  }
  assert.equal(manifest.pollCount, 1);
  assert.equal(manifest.stepCount, 2);
  assert.equal(manifest.stopReason, 'stable');
  // 顶层 URL 必须已剥敏：__gmitm 只留空值键名。
  assert.ok(!manifest.url.includes('SECRET123'), '__gmitm 的值不许进 manifest');
  assert.ok(manifest.url.includes('__gmitm='), '__gmitm 键名（空值）保留，它是页面身份的一部分');
  // 每步都带「同一停留位置」声明所需的字段。
  for (const step of manifest.steps) {
    for (const key of ['step', 'censusFile', 'shotFile', 'when', 'scrollY', 'filledCells', 'screenshotMd5', 'sameAsPrevious']) {
      assert.ok(key in step, `step 缺 ${key}`);
    }
  }
});

// ---------------------------------------------------------------------------
// 4. 剥敏
// ---------------------------------------------------------------------------

test('URL 剥敏：__gmitm 留空值键名，token/jwt/auth 类参数整个删除，普通参数保留', () => {
  const out = sanitizeUrlString(
    'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&searchType=domain&__gmitm=abc123def456&access_token=tok999&jwt=eyJx&auth=1',
  );
  assert.ok(out.includes('q=canva.com'));
  assert.ok(out.includes('searchType=domain'));
  assert.ok(out.includes('__gmitm='), '键名保留');
  assert.ok(!out.includes('abc123def456'), '__gmitm 的值必须消失');
  assert.ok(!/access_token|jwt=|auth=/.test(out), '凭证形状的参数整个删除');
});

test('URL 剥敏：相对 href（pathname + search）也接 —— census 里存的就是这个形状', () => {
  const out = sanitizeUrlString('/analytics/traffic/top-pages/?q=canva.com&__gmitm=abc123def456');
  assert.equal(out.startsWith('/analytics/traffic/top-pages/'), true);
  assert.ok(!out.includes('abc123def456'));
  assert.ok(out.includes('__gmitm='));
});

test('eval 载荷剥敏：cookie / authorization / bearer 形状替换为 [REDACTED]', () => {
  const dirty = JSON.stringify({
    deepText: 'Cookie: sid=SECRETCOOKIE111; authorization: Bearer eyJSECRET222 done',
    note: 'set-cookie=SECRET333',
  });
  const clean = scrubEvalPayload(dirty);
  assert.ok(!clean.includes('SECRETCOOKIE111'));
  assert.ok(!clean.includes('eyJSECRET222'));
  assert.ok(!clean.includes('SECRET333'));
  assert.ok(clean.includes('[REDACTED]'));
  // 剥敏后仍是合法 JSON —— 落盘的就是这份字符串。
  assert.doesNotThrow(() => JSON.parse(clean));
});

test('eval 载荷剥敏：__gmitm 值经 redactSecrets 一并抹掉', () => {
  const clean = scrubEvalPayload('failed at https://sem.proxy.example.com/home/?__gmitm=abc123def456');
  assert.ok(!clean.includes('abc123def456'));
});

// ---------------------------------------------------------------------------
// 卡住判据：停滞（3 轮完全不变 + 0 格），不是耗时
// ---------------------------------------------------------------------------

const pollOf = (fingerprint, filledCells = 0) => ({ fingerprint, filledCells });

test('卡住判据：连续 3 轮 census 完全不变且 0 格 → 卡住，触发刷新', () => {
  assert.equal(isStalled([pollOf('shell'), pollOf('shell'), pollOf('shell')]), true);
  // 前面有过变化不影响：看的是**最近** 3 轮。
  assert.equal(isStalled([pollOf('a'), pollOf('shell'), pollOf('shell'), pollOf('shell')]), true);
});

test('卡住判据：有进展就不是卡 —— 试点 61 秒 light innerText 59 → 127 属于进展', () => {
  // 指纹里带着 light/deep 文本长度，任何一轮变化都打断停滞计数。
  assert.equal(isStalled([pollOf('light:59'), pollOf('light:59'), pollOf('light:127')]), false);
  assert.equal(isStalled([pollOf('a'), pollOf('b'), pollOf('c')]), false);
});

test('卡住判据：正常 76 秒慢加载不触发 —— 只要窗口里有一轮不同', () => {
  // 试点节奏：9s/45s 两轮相同，61s 变化，76s 数据落地。任何以耗时为判据的
  // 实现（「等了 60 秒还是 0 格 ⇒ 卡了」）都会在这条上翻车。
  const timeline = [pollOf('9s-shell'), pollOf('45s-shell'), pollOf('61s-progress'), pollOf('76s-data', 850)];
  assert.equal(isStalled(timeline), false);
});

test('卡住判据：不足 3 轮不触发；已有数据（filledCells > 0）不触发', () => {
  assert.equal(isStalled([]), false);
  assert.equal(isStalled([pollOf('shell'), pollOf('shell')]), false);
  assert.equal(isStalled([pollOf('x', 850), pollOf('x', 850), pollOf('x', 850)]), false, '数据已就绪的稳定不是卡住');
});

test('manifest：refreshes / refreshCount 进 manifest —— 「刷了 2 次没起来」和「从没刷过」必须可分辨', () => {
  const refreshes = [
    { refresh: 1, at: '2026-08-29T07:00:30.000Z', afterPoll: 3, reason: 'stalled: 3 consecutive polls with identical census and filledCells=0', lastCensus: { filledCells: 0, deepTextLength: 1_599_006, lightTextLength: 59 } },
  ];
  const manifest = buildManifest({
    url: 'https://sem.proxy.example.com/x', session: 'semrush-nav',
    startedAt: 'a', finishedAt: 'b', readyAfterMs: null,
    polls: [], steps: [], stopReason: 'budget', budgetSeconds: 180, maxScreens: 12,
    refreshes,
  });
  assert.equal(manifest.refreshCount, 1);
  assert.deepEqual(manifest.refreshes, refreshes);
  for (const key of ['refresh', 'at', 'afterPoll', 'reason', 'lastCensus']) {
    assert.ok(key in manifest.refreshes[0], `refresh 事件缺 ${key}`);
  }
  // 不传 refreshes 时是空数组而不是 undefined —— 「从没刷过」也要显式可读。
  const bare = buildManifest({ url: 'https://x.example/', session: 's', startedAt: 'a', finishedAt: 'b', readyAfterMs: 1, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 180, maxScreens: 12 });
  assert.equal(bare.refreshCount, 0);
  assert.deepEqual(bare.refreshes, []);
  // 打开即刷新（2026-08-30 用户令）：默认必须是 true——镜像抖动首开常白屏,
  // 「默认关」会让这条防线静默失效;显式传 false 才关,且首刷不计入 refreshCount。
  assert.equal(bare.eagerReload, true, 'eagerReload 默认必须为 true');
  const noEager = buildManifest({ url: 'https://x.example/', session: 's', startedAt: 'a', finishedAt: 'b', readyAfterMs: 1, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 180, maxScreens: 12, eagerReload: false });
  assert.equal(noEager.eagerReload, false);
  assert.equal(noEager.refreshCount, 0, '首刷/关闭首刷都不动 refreshCount');
});

// 2026-08-30 实盘发现：`?q=canva.com` 被面板追加的 `lid=` 悄悄改写成了别的域，
// path/hash 全程没变，落点自检看不见。manifest 必须把最后的 href 摆到表面，
// 否则 AI 要发现域名漂移只能自己翻 census。**只摆事实，不判断。**
test('manifest 记录最终 href，未就绪时也记', () => {
  const base = { url: 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com', session: 'semrush-nav', startedAt: 'a', finishedAt: 'b', readyAfterMs: 1, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 180, maxScreens: 12 };
  const drifted = buildManifest({ ...base, finalHref: '/analytics/traffic/top-pages/?q=canva.com&lid=1234971' });
  assert.equal(drifted.finalHref, '/analytics/traffic/top-pages/?q=canva.com&lid=1234971');
  // 没读到任何 census 时是 null，而不是缺字段——「没记到」要能和「记到了空」分开。
  assert.equal(buildManifest(base).finalHref, null);
});

// ---------------------------------------------------------------------------
// 空态标记（采集侧停轮询用，不构成结论）
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// chart 分支就绪（2026-08-29 重测：9 条 chart-only 路由 filledCells 恒 0）
// ---------------------------------------------------------------------------

const chartPoll = (svgText, deepTextLength, filledCells = 0, fingerprint = `fp:${svgText}:${deepTextLength}`) => (
  { fingerprint, filledCells, svgText, deepTextLength }
);

test('chart 分支：svgText>0 且连续 3 轮 svgText 与 deepTextLength 稳定 → 就绪', () => {
  // referral 的真实形状：svgText 44，filledCells 恒 0。
  assert.equal(isChartReady([chartPoll(44, 900_000), chartPoll(44, 900_000), chartPoll(44, 900_000)]), true);
  // 前面有过变化不影响：看的是最近 3 轮。
  assert.equal(isChartReady([chartPoll(0, 100), chartPoll(44, 900_000), chartPoll(44, 900_000), chartPoll(44, 900_000)]), true);
});

test('chart 分支：svgText 为 0 绝不就绪 —— email 空态（svgText 0）不许走 chart 分支', () => {
  assert.equal(isChartReady([chartPoll(0, 900_000), chartPoll(0, 900_000), chartPoll(0, 900_000)]), false);
});

test('chart 分支：仍在变化不就绪 —— svgText 或 deepTextLength 任一漂移都打断稳定', () => {
  assert.equal(isChartReady([chartPoll(30, 900_000), chartPoll(40, 900_000), chartPoll(44, 900_000)]), false);
  assert.equal(isChartReady([chartPoll(44, 800_000), chartPoll(44, 850_000), chartPoll(44, 900_000)]), false);
});

test('chart 分支：不足 3 轮不就绪；filledCells>0 归 table 分支，chart 分支不越权', () => {
  assert.equal(isChartReady([]), false);
  assert.equal(isChartReady([chartPoll(44, 900_000), chartPoll(44, 900_000)]), false);
  assert.equal(isChartReady([chartPoll(44, 900_000, 850), chartPoll(44, 900_000, 850), chartPoll(44, 900_000, 850)]), false);
});

test('分支相互作用：svgText>0 的 3 轮稳定是就绪不是卡住 —— 不许触发刷新', () => {
  // chart-only 页面稳定后 census 指纹逐轮相同：isStalled 会把它当卡住去刷新。
  // 主循环必须先查 isChartReady（就绪）再查 isStalled（刷新）——这里锁住
  // 两个判据在同一序列上的取值，证明「就绪检查先于 stall 检查」是必要的。
  const stableChart = [chartPoll(44, 900_000, 0, 'same'), chartPoll(44, 900_000, 0, 'same'), chartPoll(44, 900_000, 0, 'same')];
  assert.equal(isChartReady(stableChart), true, 'svgText>0 稳定 → 就绪');
  assert.equal(isStalled(stableChart), true, 'stall 判据本身也会命中——所以顺序承重');
  // 全零的稳定：只有 stall 命中，chart 分支不命中 → 走刷新。
  const stableShell = [chartPoll(0, 100, 0, 'shell'), chartPoll(0, 100, 0, 'shell'), chartPoll(0, 100, 0, 'shell')];
  assert.equal(isChartReady(stableShell), false);
  assert.equal(isStalled(stableShell), true);
});

test('疑似空态打标：svgText===0 且 deepTextLength 稳定 且无 filledCells → true', () => {
  // email 的真实形状：svgText 0，deepText 稳定，无任何表格。
  assert.equal(isSuspectedEmptyState([chartPoll(0, 500_000), chartPoll(0, 500_000), chartPoll(0, 500_000)]), true);
});

test('疑似空态打标：svgText>0 / 文本仍在变 / 有 filledCells / 不足 3 轮 都不打标', () => {
  assert.equal(isSuspectedEmptyState([chartPoll(44, 500_000), chartPoll(44, 500_000), chartPoll(44, 500_000)]), false, '有 svg 文本是 chart 不是空态');
  assert.equal(isSuspectedEmptyState([chartPoll(0, 100), chartPoll(0, 200), chartPoll(0, 300)]), false, '还在加载');
  assert.equal(isSuspectedEmptyState([chartPoll(0, 500_000, 850), chartPoll(0, 500_000, 850), chartPoll(0, 500_000, 850)]), false);
  assert.equal(isSuspectedEmptyState([chartPoll(0, 500_000), chartPoll(0, 500_000)]), false);
});

test('manifest：readyBranch 与 suspectedEmptyState 进 manifest，缺省为 null / false', () => {
  const base = {
    url: 'https://sem.proxy.example.com/x', session: 'semrush-nav', startedAt: 'a', finishedAt: 'b',
    readyAfterMs: 30_000, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 240, maxScreens: 12,
  };
  const chart = buildManifest({ ...base, readyBranch: 'chart' });
  assert.equal(chart.readyBranch, 'chart');
  assert.equal(chart.suspectedEmptyState, false);
  const table = buildManifest({ ...base, readyBranch: 'table' });
  assert.equal(table.readyBranch, 'table');
  const never = buildManifest({ ...base, readyAfterMs: null, stopReason: 'budget', suspectedEmptyState: true });
  assert.equal(never.readyBranch, null, '从未就绪 → null');
  assert.equal(never.suspectedEmptyState, true);
});

test('空态标记：命中已知空态文案返回标记，普通文本返回 null', () => {
  assert.ok(detectEmptyState('该报告没有数据可显示'));
  assert.ok(detectEmptyState('No data available for this query'));
  assert.equal(detectEmptyState('主页 39.47% 4.1亿'), null);
  assert.equal(detectEmptyState(''), null);
  assert.equal(detectEmptyState(undefined), null);
});

// ---------------------------------------------------------------------------
// 落点自检（isHijacked）：2026-08-29 复核抓到 4 次现行接管，判据是 path 前缀
// ---------------------------------------------------------------------------

test('落点自检：href 离开目标路由 path → hijacked（4 次现行接管的真实形状）', () => {
  // usa v1：被另一个 agent 的 referral 验证导走。
  assert.equal(isHijacked('/analytics/traffic/usa/', '/analytics/traffic/referral/?q=canva.com'), true);
  // page-groups v2：被导经 /home/ 后停在 sylviejewelry.com 的 toppages（942 格差点记到 canva 名下）。
  assert.equal(isHijacked('/analytics/traffic/page-groups/', '/home/'), true);
  assert.equal(isHijacked('/analytics/traffic/page-groups/', '/analytics/traffic/top-pages/?q=sylviejewelry.com'), true);
  // demographics/behavior：被别的会话的 keywordoverview 抢走。
  assert.equal(isHijacked('/analytics/traffic/demographics/', '/analytics/keywordoverview/?q=december+birthstone+color'), true);
  assert.equal(isHijacked('/analytics/traffic/behavior/', '/analytics/keywordoverview/?q=aries+birthstone'), true);
});

test('落点自检：同路由的 query / 子路径 / 末尾斜杠差异都不算离开', () => {
  assert.equal(isHijacked('/analytics/traffic/usa/', '/analytics/traffic/usa/?q=canva.com&searchType=domain'), false);
  assert.equal(isHijacked('/analytics/traffic/usa/', '/analytics/traffic/usa'), false);
  assert.equal(isHijacked('/analytics/traffic/usa', '/analytics/traffic/usa/'), false);
  assert.equal(isHijacked('/analytics/traffic/usa/', '/analytics/traffic/usa/california/'), false);
});

test('落点自检：前缀必须按路径段对齐，/usa2/ 不是 /usa/ 的子路径', () => {
  assert.equal(isHijacked('/analytics/traffic/usa/', '/analytics/traffic/usa2/'), true);
});

test('落点自检：目标 path 为根或空 → 判不了，不误报', () => {
  assert.equal(isHijacked('/', '/anything/'), false);
  assert.equal(isHijacked('', '/anything/'), false);
});

test('manifest：lockHeld / lockWaitMs / hijacked / hijackedHref 进 manifest，缺省 false/null', () => {
  const base = {
    url: 'https://sem.proxy.example.com/x', session: 'semrush-nav', startedAt: 'a', finishedAt: 'b',
    readyAfterMs: 30_000, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 240, maxScreens: 12,
  };
  const plain = buildManifest(base);
  assert.equal(plain.lockHeld, false);
  assert.equal(plain.lockWaitMs, null);
  assert.equal(plain.hijacked, false);
  assert.equal(plain.hijackedHref, null);
  const locked = buildManifest({ ...base, lockHeld: true, lockWaitMs: 1234 });
  assert.equal(locked.lockHeld, true);
  assert.equal(locked.lockWaitMs, 1234);
  const stolen = buildManifest({
    ...base, stopReason: 'hijacked', hijacked: true,
    hijackedHref: '/analytics/traffic/top-pages/?q=sylviejewelry.com',
  });
  assert.equal(stolen.hijacked, true);
  assert.equal(stolen.hijackedHref, '/analytics/traffic/top-pages/?q=sylviejewelry.com');
  assert.equal(stolen.stopReason, 'hijacked');
});

// ---------------------------------------------------------------------------
// hash 感知落点自检（2026-08-29 Similarweb 开荒：pathname 恒为 /，path 比对全盲）
// ---------------------------------------------------------------------------

test('hash 自检：目标含 # 时比 hash 前 3 段 —— 同报表树的国家/窗口段变化不算离开', () => {
  const mapping = '#/digitalsuite/markets/webmarketanalysis/mapping/Computers~Graphics/999/1m';
  // 换国（999→840）、换类目：前 3 段 digitalsuite/markets/webmarketanalysis 不变。
  assert.equal(isHijacked(mapping, '/#/digitalsuite/markets/webmarketanalysis/mapping/Other~Cat/840/1m'), false);
  assert.equal(isHijacked(mapping, '/?webSource=Total#/digitalsuite/markets/webmarketanalysis/home'), false);
});

test('hash 自检：跨到别的报表树 → hijacked（markets vs marketresearch）', () => {
  const mapping = '#/digitalsuite/markets/webmarketanalysis/mapping/X/999/1m';
  assert.equal(isHijacked(mapping, '/#/digitalsuite/marketresearch/keywordmarketresearch/home'), true);
  // hash 消失（整文档被导走）也是离开。
  assert.equal(isHijacked(mapping, '/home/'), true);
});

test('hash 自检：hashSegments 取 # 后前 3 段，空 hash 目标判不了不误报', () => {
  assert.deepEqual(hashSegments('#/digitalsuite/markets/webmarketanalysis/mapping/X/999'), ['digitalsuite', 'markets', 'webmarketanalysis']);
  assert.deepEqual(hashSegments('#/a/b'), ['a', 'b']);
  assert.equal(isHijacked('#/', '/#/anything/else/here'), false);
  assert.equal(isHijacked('#', '/#/anything'), false);
});

test('census 表达式带 location.hash —— hash 自检的输入端，掉了整条防线全盲', () => {
  assert.ok(CENSUS_EXPR.includes('location.hash'), 'census 的 href 必须包含 location.hash');
});

// ---------------------------------------------------------------------------
// --accept-redirect：合法重定向别名（Semrush /organic/pages/ → /toppages/ 的 302）
// ---------------------------------------------------------------------------

test('accept-redirect：命中声明的别名不算 hijack，未声明照旧算', () => {
  const target = '/analytics/organic/pages/';
  const landed = '/analytics/toppages/?db=us&q=canva.com&searchType=domain';
  // 未声明别名：302 落点被当 hijack —— 这就是 2026-08-29 exit 3 的真实形状。
  assert.equal(isHijacked(target, landed), true);
  // 声明后：合法跳转形状。
  assert.equal(isHijacked(target, landed, ['/analytics/toppages/']), false);
  // 别名不豁免无关路由。
  assert.equal(isHijacked(target, '/home/', ['/analytics/toppages/']), true);
  assert.equal(isHijacked(target, '/analytics/keywordoverview/?q=x', ['/analytics/toppages/']), true);
});

test('accept-redirect：解析逗号分隔列表，未传/布尔为空数组', () => {
  assert.deepEqual(parseAcceptRedirects('/analytics/toppages/, /analytics/comparedomains/'), ['/analytics/toppages/', '/analytics/comparedomains/']);
  assert.deepEqual(parseAcceptRedirects(undefined), []);
  assert.deepEqual(parseAcceptRedirects(true), []);
  assert.deepEqual(parseAcceptRedirects(''), []);
});

// ---------------------------------------------------------------------------
// text 分支就绪（--ready-text，默认不启用）
// ---------------------------------------------------------------------------

const textPoll = (readyTextHit, deepTextLength) => ({ readyTextHit, deepTextLength, filledCells: 0, svgText: 0, fingerprint: `t:${deepTextLength}` });

test('text 分支：regex 命中且 2 轮 deepTextLength 稳定 → 就绪', () => {
  assert.equal(isTextReady([textPoll(true, 500_000), textPoll(true, 500_000)]), true);
  assert.equal(isTextReady([textPoll(false, 100), textPoll(true, 500_000), textPoll(true, 500_000)]), true);
});

test('text 分支：未命中 / 文本仍在变 / 不足 2 轮 都不就绪', () => {
  assert.equal(isTextReady([textPoll(false, 500_000), textPoll(false, 500_000)]), false);
  assert.equal(isTextReady([textPoll(true, 400_000), textPoll(true, 500_000)]), false);
  assert.equal(isTextReady([textPoll(true, 500_000)]), false);
  assert.equal(isTextReady([]), false);
});

test('text 分支红线：未传 --ready-text 时绝不生效', () => {
  // 未启用时 resolveReadyText 必须是 null —— 主循环以 readyText && isTextReady 双重把关。
  assert.equal(resolveReadyText({}), null);
  assert.equal(resolveReadyText({ 'ready-text': true }), null);
  assert.equal(resolveReadyText({ 'ready-text': '' }), null);
  // 未启用的 poll 里 readyTextHit 是 null（不是 true）：isTextReady 也必须拒绝。
  assert.equal(isTextReady([textPoll(null, 500_000), textPoll(null, 500_000)]), false);
  assert.equal(isTextReady([textPoll(undefined, 500_000), textPoll(undefined, 500_000)]), false);
  // 显式传参时才是 RegExp。
  const re = resolveReadyText({ 'ready-text': '域\\s*\\(10,000\\)' });
  assert.ok(re instanceof RegExp);
  assert.ok(re.test('域 (10,000)'));
});

// ---------------------------------------------------------------------------
// 内层滚动容器（--scroll-container，auto 优先内层最大者但要过文档滚动 sanity）
// ---------------------------------------------------------------------------

test('scroll-container 解析：缺省/auto → auto，window → window，其余当选择器', () => {
  assert.deepEqual(resolveScrollMode(undefined), { mode: 'auto', selector: null });
  assert.deepEqual(resolveScrollMode('auto'), { mode: 'auto', selector: null });
  assert.deepEqual(resolveScrollMode('window'), { mode: 'window', selector: null });
  assert.deepEqual(resolveScrollMode('.sw-layout-scrollable-element'), { mode: 'selector', selector: '.sw-layout-scrollable-element' });
});

test('auto 挑选：Similarweb 形状 —— window 滚不动、内层容器装得更多 → 选内层', () => {
  // 实测形状：bodyScrollHeight === innerHeight（window 空操作），内层 scrollHeight 4363。
  const choice = pickScrollContainer(
    [{ tag: 'div', scrollHeight: 4363, clientHeight: 772 }],
    { bodyScrollHeight: 772, innerHeight: 772 },
  );
  assert.deepEqual(choice, { kind: 'container', index: 0 });
});

test('auto 挑选：Semrush 形状 —— window 正常滚、内层只是小部件 → 选 window', () => {
  // 500px 的下拉列表不许抢走一个 6000px 文档的滚动权。
  const choice = pickScrollContainer(
    [{ tag: 'div', scrollHeight: 500, clientHeight: 200 }],
    { bodyScrollHeight: 6000, innerHeight: 772 },
  );
  assert.deepEqual(choice, { kind: 'window' });
});

test('auto 挑选：多个内层容器取 scrollHeight 最大者；两头都滚不动兜底 window', () => {
  const choice = pickScrollContainer(
    [
      { tag: 'div', scrollHeight: 900, clientHeight: 300 },
      { tag: 'div', scrollHeight: 4363, clientHeight: 772 },
    ],
    { bodyScrollHeight: 772, innerHeight: 772 },
  );
  assert.deepEqual(choice, { kind: 'container', index: 1 });
  assert.deepEqual(pickScrollContainer([], { bodyScrollHeight: 772, innerHeight: 772 }), { kind: 'window' });
});

test('滚动表达式：window 用 scrollBy；selector 内嵌选择器；auto 内嵌同一份挑选源码', () => {
  assert.ok(buildScrollExpr({ mode: 'window', amount: 700 }).includes('window.scrollBy(0, 700)'));
  const sel = buildScrollExpr({ mode: 'selector', selector: '.sw-layout-scrollable-element', amount: 700 });
  assert.ok(sel.includes('".sw-layout-scrollable-element"'));
  assert.ok(sel.includes('scrollTop'));
  const auto = buildScrollExpr({ mode: 'auto', amount: 700 });
  assert.ok(auto.includes('pickScrollContainer'), 'auto 的页面内挑选必须是 pickScrollContainer 的同一份源码');
});

// ---------------------------------------------------------------------------
// 假到底：census 恒定 + 截图 md5 恒变（图表动画）→ census-stable-shot-unstable
// ---------------------------------------------------------------------------

const shotPair = (fingerprint, md5) => ({ fingerprint, md5 });

test('假到底：连续 3 步 census 指纹相同、相邻 md5 各不相同 → 命中', () => {
  assert.equal(isCensusStableShotUnstable([shotPair('fp', 'a'), shotPair('fp', 'b'), shotPair('fp', 'c')]), true);
  // 前面有变化不影响：看最近 3 步。
  assert.equal(isCensusStableShotUnstable([shotPair('x', 'a'), shotPair('fp', 'b'), shotPair('fp', 'c'), shotPair('fp', 'd')]), true);
});

test('假到底：census 在变 / md5 有重复 / 不足 3 步 都不命中', () => {
  assert.equal(isCensusStableShotUnstable([shotPair('a', 'a'), shotPair('b', 'b'), shotPair('c', 'c')]), false, 'census 在变是正常滚动');
  assert.equal(isCensusStableShotUnstable([shotPair('fp', 'a'), shotPair('fp', 'a'), shotPair('fp', 'b')]), false, 'md5 重复该走 stable 判据');
  assert.equal(isCensusStableShotUnstable([shotPair('fp', 'a'), shotPair('fp', 'b')]), false);
  assert.equal(isCensusStableShotUnstable([]), false);
});

test('manifest：acceptRedirects / readyTextPattern / scrollMode / scrolls 进 manifest，缺省齐全', () => {
  const base = {
    url: 'https://sim.proxy.example.com/x', session: 'similarweb-nav', startedAt: 'a', finishedAt: 'b',
    readyAfterMs: 23_000, polls: [], steps: [], stopReason: 'stable', budgetSeconds: 240, maxScreens: 12,
  };
  const plain = buildManifest(base);
  assert.deepEqual(plain.acceptRedirects, []);
  assert.equal(plain.readyTextPattern, null);
  assert.equal(plain.scrollMode, 'auto');
  assert.equal(plain.scrollSelector, null);
  assert.deepEqual(plain.scrolls, []);
  const full = buildManifest({
    ...base, readyBranch: 'text', readyTextPattern: '域\\s*\\(10,000\\)',
    acceptRedirects: ['/analytics/toppages/'], scrollMode: 'selector', scrollSelector: '.sw-layout-scrollable-element',
    scrolls: [{ afterStep: 1, amount: 694, kind: 'container', tag: 'div', scrollTop: 694, scrollHeight: 4363, scrollY: 0 }],
    stopReason: 'census-stable-shot-unstable',
  });
  assert.equal(full.readyBranch, 'text');
  assert.equal(full.readyTextPattern, '域\\s*\\(10,000\\)');
  assert.deepEqual(full.acceptRedirects, ['/analytics/toppages/']);
  assert.equal(full.scrollMode, 'selector');
  assert.equal(full.scrollSelector, '.sw-layout-scrollable-element');
  assert.equal(full.scrolls.length, 1);
  assert.equal(full.stopReason, 'census-stable-shot-unstable');
});
