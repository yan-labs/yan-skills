/**
 * gotoInTool() 的落地校验。
 *
 * 堵的是这条静默取错数据的路径：Similarweb 面板对未知路由**不报 404**，
 * 而是静默重定向到 `#/digitalsuite/ai-brand-visibility/home`。旧版 gotoInTool
 * 只把落地的 location.href 原样返回，从没跟请求的比过，于是别的页面上的数字
 * 会被标成「请求的那张报表」的结果输出出去。
 */
import { strict as assert } from 'node:assert';
import test from 'node:test';
import { gotoInTool, routeMismatch, routeWindow } from '../scripts/lib-tools-share.mjs';

const SW = 'https://sim.proxy.example.com';
const HIJACK = `${SW}/#/digitalsuite/ai-brand-visibility/home`;

/**
 * 假 evalPage：第一次调用是 `location.href = ...`（导航），之后的调用读回落地状态。
 * 落地 URL 由 `landedUrl` 决定——这就是被测的那个静默重定向。
 */
function fakeEvalPage(landedUrl, { title = 'Similarweb PRO', bodyText = 'ok' } = {}) {
  const calls = [];
  return {
    calls,
    evalPage: async (script) => {
      calls.push(script);
      // 真的 evalPage 会把页面回传的 JSON 解析好再交出来。
      if (script.includes('location.href =')) return { navigating: true };
      return { url: landedUrl, title, bodyText };
    },
  };
}

// settle 传 0，测试里不要真的睡 15 秒。
// windowRecheckMs 默认也关掉：补读是「以最终值为准」那条专门的测试要考的东西，
// 别让其余每条用例都白等 2 秒。
const goto = (evalPage, target, options) =>
  gotoInTool(evalPage, target, 0, { windowRecheckMs: 0, ...options });

test('landing on exactly the requested hash route passes', async () => {
  const route = `${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?webSource=Total&key=example.com`;
  const { evalPage } = fakeEvalPage(route);
  const landed = await goto(evalPage, route);
  assert.equal(landed.url, route);
});

test('a silent redirect to ai-brand-visibility throws, naming both routes', async () => {
  const route = `${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=example.com`;
  const { evalPage } = fakeEvalPage(HIJACK);
  await assert.rejects(
    () => goto(evalPage, route),
    (err) => {
      // 请求值和落地值都必须在错误信息里，否则读的人无从判断是哪条路由写错了。
      assert.match(err.message, /websiteanalysis\/overview\/website-performance/);
      assert.match(err.message, /ai-brand-visibility\/home/);
      // 必须明确说这是重定向，不是超时——否则下一个人会去加 --settle。
      assert.match(err.message, /redirect, not a timeout/);
      return true;
    },
  );
});

test('the app rewriting query parameters is not a mismatch', async () => {
  const requested = `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d/?webSource=Total&key=example.com`;
  // 落地时应用补了默认参数、改了参数顺序、丢了一个空参数，并且吃掉了尾斜杠。
  const landed = `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d?key=example.com&webSource=Total&comparedDuration=&isWWW=false`;
  const { evalPage } = fakeEvalPage(landed);
  const got = await goto(evalPage, requested);
  assert.equal(got.url, landed);
});

test('allowRedirect: true lets a redirect through', async () => {
  const route = `${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=example.com`;
  const { evalPage } = fakeEvalPage(HIJACK);
  const landed = await goto(evalPage, route, { allowRedirect: true });
  assert.equal(landed.url, HIJACK);
});

test('a non-hash Semrush pathname mismatch throws', async () => {
  const requested = 'https://sem.proxy.example.com/analytics/traffic/overview/?q=example.com&searchType=domain';
  // 实测：这条路由 302 到 Getting Started 落地页并丢掉 query。
  const landed = 'https://sem.proxy.example.com/analytics/traffic/getting-started/';
  const { evalPage } = fakeEvalPage(landed, { title: 'Traffic Analytics' });
  await assert.rejects(
    () => goto(evalPage, requested),
    (err) => {
      assert.match(err.message, /\/analytics\/traffic\/overview/);
      assert.match(err.message, /\/analytics\/traffic\/getting-started/);
      return true;
    },
  );
});

test('a hash route landing on a plain path is a mismatch', async () => {
  const requested = `${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=example.com`;
  const { evalPage } = fakeEvalPage(`${SW}/login`);
  await assert.rejects(() => goto(evalPage, requested), /landed route:\s+\/login/);
});

test('the redirect error is redacted', async () => {
  const secret = 'aVeryLongGmitmTokenValue123456';
  const requested = `${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=example.com&__gmitm=${secret}`;
  const { evalPage } = fakeEvalPage(`${HIJACK}?__gmitm=${secret}`);
  await assert.rejects(
    () => goto(evalPage, requested),
    (err) => {
      assert.ok(!err.message.includes(secret), 'the __gmitm value must not survive into the error text');
      // 键名要留着，否则读的人看不出这里本来带了什么。
      assert.match(err.message, /__gmitm=<redacted>/);
      return true;
    },
  );
});

test('routeMismatch normalizes trailing slashes but not the path itself', () => {
  assert.equal(routeMismatch('https://a.co/#/x/y/?q=1', 'https://a.co/#/x/y?q=2'), null);
  assert.equal(routeMismatch('https://a.co/p/', 'https://a.co/p'), null);
  assert.deepEqual(routeMismatch('https://a.co/#/x/y', 'https://a.co/#/x/z'), { requested: '/x/y', landed: '/x/z' });
});

test('a relative target is compared against the absolute landed url', async () => {
  const { evalPage } = fakeEvalPage(`${SW}/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=e.com`);
  const landed = await goto(evalPage, '/#/digitalsuite/websiteanalysis/overview/website-performance/*/999/28d?key=e.com');
  assert.ok(landed.url.includes('website-performance'));
});

/* ------------------------------------------------------------------ *
 * 时间窗口段被面板改写：容忍，但必须把真实窗口带回来
 *
 * 2026-08-28 实测（creem.io）：请求
 *   /digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d
 * 落到
 *   /digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/6m
 * 顶层报表没变，只有窗口段被改写（小站没有 28 天数据，面板自动放宽）。
 * **逐字节相同的这条路由在 canva.com 上完全不被改写**，所以拿大站永远测不出来,
 * 而 payment-referrers.mjs 的全部工作负载就是这类小站——它在真实用途上必炸。
 *
 * 光「忽略窗口段」是不够的：落地 6m 而脚本仍按 28d 标注输出，
 * 就是把 6 个月的数字标成 28 天,正是这道校验本来要防的那类错标。
 * ------------------------------------------------------------------ */

const CHANNELS = `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999`;

test('only the time-window segment differing is tolerated', () => {
  assert.equal(routeMismatch(`${CHANNELS}/28d?key=creem.io`, `${CHANNELS}/6m?key=creem.io`), null);
  assert.equal(routeMismatch(`${CHANNELS}/28d`, `${CHANNELS}/3m`), null);
  assert.equal(routeMismatch(`${CHANNELS}/28d`, `${CHANNELS}/1m`), null);
  assert.equal(routeMismatch(`${CHANNELS}/1m`, `${CHANNELS}/7d`), null);
});

test('a differing report segment still throws, window segment identical or not', () => {
  // 报表段变了：真重定向，照抛。
  assert.deepEqual(
    routeMismatch(`${CHANNELS}/28d`, `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/referrals/999/28d`),
    {
      requested: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d',
      landed: '/digitalsuite/websiteanalysis/traffic-overview/referrals/999/28d',
    },
  );
  // 报表段和窗口段一起变：更明显的重定向，同样照抛。
  assert.deepEqual(
    routeMismatch(`${CHANNELS}/28d`, `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/referrals/999/6m`),
    {
      requested: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d',
      landed: '/digitalsuite/websiteanalysis/traffic-overview/referrals/999/6m',
    },
  );
});

test('999 is not a window segment — changing it still throws', () => {
  // `999` 在多条路由上都是这个固定值，它不是时间窗口。
  // 把容忍放宽成「忽略最后一段」或「忽略任何纯数字段」，这条就会漏过去。
  const base = `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels`;
  assert.deepEqual(routeMismatch(`${base}/999/28d`, `${base}/123/28d`), {
    requested: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999/28d',
    landed: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/123/28d',
  });
  // 末段就是 999 时（没有窗口段的路由）也一样必须抛。
  assert.deepEqual(routeMismatch(`${base}/999`, `${base}/6m`), {
    requested: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999',
    landed: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/6m',
  });
  assert.deepEqual(routeMismatch(`${base}/28d`, `${base}/999`), {
    requested: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/28d',
    landed: '/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999',
  });
});

test('a window-looking segment that is not the last one is not tolerated', () => {
  // 只放宽末段：中间段变了属于路由形状变了，不是窗口放宽。
  const a = `${SW}/#/digitalsuite/websiteanalysis/28d/marketing-channels/999`;
  const b = `${SW}/#/digitalsuite/websiteanalysis/6m/marketing-channels/999`;
  assert.deepEqual(routeMismatch(a, b), {
    requested: '/digitalsuite/websiteanalysis/28d/marketing-channels/999',
    landed: '/digitalsuite/websiteanalysis/6m/marketing-channels/999',
  });
});

test('gotoInTool tolerates the window rewrite and reports the landed window', async () => {
  const requested = `${CHANNELS}/28d/?webSource=Total&key=creem.io`;
  const landedUrl = `${CHANNELS}/6m?webSource=Total&key=creem.io`;
  const { evalPage } = fakeEvalPage(landedUrl);
  const landed = await goto(evalPage, requested);
  assert.equal(landed.url, landedUrl);
  // 回传必须同时带上「请求的窗口」和「实际的窗口」——只有实际窗口的话，
  // 下游看到 6m 也不知道它本来要的是 28d。
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '6m', rewritten: true, source: 'path' });
});

test('gotoInTool reports the window even when it was not rewritten', async () => {
  const route = `${CHANNELS}/28d?key=canva.com`;
  const { evalPage } = fakeEvalPage(route);
  const landed = await goto(evalPage, route);
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '28d', rewritten: false, source: 'path' });
});

test('routeWindow is null for routes whose last segment is not a window', () => {
  const base = `${SW}/#/digitalsuite/websiteanalysis/traffic-overview/marketing-channels/999`;
  assert.equal(routeWindow(base, base), null);
  assert.equal(routeWindow('https://sem.proxy.example.com/analytics/overview/', 'https://sem.proxy.example.com/analytics/overview/'), null);
});

test('the referrals hop also carries its landed window', async () => {
  // payment-referrers.mjs:281 —— 在窗口误报修掉之前，这一跳从来没被执行到
  // （280 行那一跳先抛了错）。它的输出同样要带上落地窗口。
  const requested = `${SW}/#/digitalsuite/websiteanalysis/referrals/*/999/28d?selectedTab=incomingTraffic&key=creem.io`;
  const landedUrl = `${SW}/#/digitalsuite/websiteanalysis/referrals/*/999/6m?selectedTab=incomingTraffic&key=creem.io`;
  const { evalPage } = fakeEvalPage(landedUrl);
  const landed = await goto(evalPage, requested);
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '6m', rewritten: true, source: 'path' });
});

/* ---------------------------------------------------------------------------
 * 第二条通道：查询串里的窗口参数。
 *
 * 2026-08-29 实测（canva.com）：`#/…/backlinks/table/999?duration=365d` 在 settle 之后
 * 被面板改成 `?duration=28d`。这条路由的**末段是 `999`**，只看末段的判据返回 null，
 * 于是一张 28 天的反链表被标成 365 天，连一行日志都没有。
 * 而且它发生在大站上——拿 canva.com 复测「路径段那条」永远测不出这条。
 * ------------------------------------------------------------------------- */

const BACKLINKS = `${SW}/#/digitalsuite/websiteanalysis/backlinks/table/999`;

test('a rewritten window query param is reported, and says it came from the query', () => {
  const w = routeWindow(`${BACKLINKS}?duration=365d&key=canva.com`, `${BACKLINKS}?duration=28d&key=canva.com`);
  assert.deepEqual(w, { requested: '365d', landed: '28d', rewritten: true, source: 'query', param: 'duration' });
});

test('the missed combination: last path segment is 999 and the query window is rewritten', async () => {
  // 这就是漏掉的那个组合。末段 `999` 不是窗口 → 路径通道返回 null；
  // 在补上 query 通道之前，整个 routeWindow 是 null，什么都不会被报出来。
  const requested = `${BACKLINKS}?duration=365d&webSource=Total&key=canva.com`;
  const landedUrl = `${BACKLINKS}?duration=28d&webSource=Total&key=canva.com`;
  const { evalPage } = fakeEvalPage(landedUrl);
  const landed = await goto(evalPage, requested);
  assert.equal(landed.routeWindow?.rewritten, true);
  assert.equal(landed.routeWindow?.landed, '28d');
  assert.equal(landed.routeWindow?.source, 'query');
  // 路由校验的语义没变：query 被改写**不是** mismatch，这一跳不许抛。
  assert.equal(routeMismatch(requested, landedUrl), null);
});

test('an unrewritten window query param is still reported, with rewritten:false', () => {
  const url = `${BACKLINKS}?duration=365d&key=canva.com`;
  assert.deepEqual(routeWindow(url, url), {
    requested: '365d', landed: '365d', rewritten: false, source: 'query', param: 'duration',
  });
});

test('non-window query changes are NOT reported as a window rewrite', () => {
  // 这条是防误报泛滥的闸门。既有语义是「query 被改写是容忍的」，只有**窗口参数**
  // 才值得报出来。把判据放宽成「任何 query 变动都算」，这条立刻变红——
  // 而在实盘上它会变成每次导航都警告一次，一周内就没人再看这个信号了。
  assert.equal(routeWindow(`${BACKLINKS}?key=canva.com`, `${BACKLINKS}?key=canva.com&webSource=Total`), null);
  assert.equal(routeWindow(`${BACKLINKS}?webSource=Total`, `${BACKLINKS}?webSource=Desktop`), null);
  assert.equal(routeWindow(`${BACKLINKS}?selectedTab=incoming`, `${BACKLINKS}?selectedTab=outgoing`), null);
  // 名字对但值不是窗口形状 → 不认。`duration=custom` 变成一个日期区间，我们没有
  // 依据说「窗口从 A 变成 B」，宁可闭嘴也不要编一个窗口出来。
  assert.equal(routeWindow(`${BACKLINKS}?duration=custom`, `${BACKLINKS}?duration=2026-01-01`), null);
  // 值像窗口但名字不在白名单 → 不认。否则任何参数哪天取到 `30d` 都会被报成窗口改写。
  assert.equal(routeWindow(`${BACKLINKS}?key=30d`, `${BACKLINKS}?key=90d`), null);
});

test('the path channel still wins when both channels see a window', async () => {
  // 两条通道都认出窗口时，**被改写的那条**优先——报出改写是这个机制存在的全部理由。
  const requested = `${CHANNELS}/28d?duration=365d&key=creem.io`;
  const landedUrl = `${CHANNELS}/6m?duration=365d&key=creem.io`;
  const { evalPage } = fakeEvalPage(landedUrl);
  const landed = await goto(evalPage, requested);
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '6m', rewritten: true, source: 'path' });
});

/* ---------------------------------------------------------------------------
 * 改写发生在 settle **之后**：导航返回时读到的还是 365d，再读一次才是 28d。
 * 只读一次 = 把一个还会变的值当结论。
 * ------------------------------------------------------------------------- */

/** 每次读回一个不同的落地 URL，用来模拟「settle 之后才改写」。 */
function fakeEvalPageSequence(urls) {
  let i = 0;
  return async (script) => {
    if (script.includes('location.href =')) return { navigating: true };
    const url = urls[Math.min(i, urls.length - 1)];
    i += 1;
    return { url, title: 'Similarweb PRO', bodyText: 'ok' };
  };
}

test('a window rewritten after settle is taken at its final value', async () => {
  // read #0（导航返回那一刻）还是 365d，read #1 起才变成 28d —— 实测就是这个形状。
  const requested = `${BACKLINKS}?duration=365d&key=canva.com`;
  const evalPage = fakeEvalPageSequence([
    `${BACKLINKS}?duration=365d&key=canva.com`,
    `${BACKLINKS}?duration=28d&key=canva.com`,
  ]);
  const landed = await gotoInTool(evalPage, requested, 0, { windowRecheckMs: 5 });
  // 拿导航瞬间那次读的结论就是 rewritten:false / landed:'365d' —— 正好是错标。
  assert.equal(landed.routeWindow?.landed, '28d');
  assert.equal(landed.routeWindow?.rewritten, true);
  assert.equal(landed.routeWindow?.source, 'query');
});

test('the delayed re-read also catches a path-segment window rewritten after settle', async () => {
  const requested = `${CHANNELS}/28d?key=creem.io`;
  const evalPage = fakeEvalPageSequence([`${CHANNELS}/28d?key=creem.io`, `${CHANNELS}/6m?key=creem.io`]);
  const landed = await gotoInTool(evalPage, requested, 0, { windowRecheckMs: 5 });
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '6m', rewritten: true, source: 'path' });
});

test('a failing re-read falls back to the navigation-time window instead of failing the hop', async () => {
  // 补读只是想把窗口读准，它挂了不该让一次已经成功的导航失败。
  let n = 0;
  const evalPage = async (script) => {
    if (script.includes('location.href =')) return { navigating: true };
    n += 1;
    if (n > 1) throw new Error('page went away');
    return { url: `${CHANNELS}/6m?key=creem.io`, title: 'Similarweb PRO', bodyText: 'ok' };
  };
  const landed = await gotoInTool(evalPage, `${CHANNELS}/28d?key=creem.io`, 0, { windowRecheckMs: 5 });
  assert.deepEqual(landed.routeWindow, { requested: '28d', landed: '6m', rewritten: true, source: 'path' });
});
