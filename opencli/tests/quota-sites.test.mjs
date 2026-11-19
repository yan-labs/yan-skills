/**
 * 配额站护栏的纯函数测试——不碰浏览器，可以随时跑。
 *   node --test opencli/tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  quotaSession, quotaSiteOf, sessionForUrl, guardSessionName,
  sleepStep, buildExtractCommands, QUOTA_SITES, resolveSession, urlFromArgs, logSiteAccess, captureSample,
  accessEntry,
} from '../scripts/opencli-core.mjs';

test('配额站收敛成固定会话名，普通站不受影响', () => {
  process.env.TOOLS_SHARE_DOMAIN = 'proxy.example.com';
  assert.equal(quotaSession('https://sem.proxy.example.com/analytics/overview/'), 'semrush-nav');
  assert.equal(quotaSession('https://www.semrush.com/analytics/'), 'semrush-nav');
  assert.equal(quotaSession('https://sim.proxy.example.com/#/digitalsuite'), 'similarweb-nav');
  assert.equal(quotaSession('https://example.com'), null);
  assert.match(sessionForUrl('https://example.com', 'recon'), /^recon-/);
  assert.equal(sessionForUrl('https://sem.proxy.example.com/x', 'recon'), 'semrush-nav');
});

test('主机名要精确匹配，不能被撞名域名骗到', () => {
  assert.equal(quotaSiteOf('https://not-semrush.com.evil.test/'), null);
  // 子域**要**算进配额：cdn.semrush.com 打的还是 Semrush，
  // 漏掉它等于让一部分导航绕过节流。
  assert.equal(quotaSiteOf('https://cdn.semrush.com/')?.key, 'semrush');
  assert.equal(quotaSiteOf('https://semrush.com.evil.test/'), null, '后缀撞名不算');
  assert.equal(quotaSiteOf('https://cdn.sem.proxy.example.com/')?.key, 'semrush');
  assert.equal(quotaSiteOf('https://sem.proxy.example.com.evil.test/'), null);
  assert.ok(QUOTA_SITES.every((s) => s.gapMs > 0), '每个配额站都要有间隔');
});

test('拒绝 $$ 形状的会话名', () => {
  for (const bad of ['probe-483', 'probe-48321', 'opencli-wait-probe-11706']) {
    assert.throws(() => guardSessionName(bad), /PID 的形状/, bad);
  }
  for (const good of ['semrush-nav', 'backlink-probe-cn', 'recon-339e827ccb35']) {
    assert.equal(guardSessionName(good), good);
  }
});

test('节流使用原生 batch wait', () => {
  const step = sleepStep(4);
  assert.deepEqual(step, { cmd: 'wait', args: { seconds: 4 } });
});

test('探活那一次不许带 open', () => {
  const evalStep = { cmd: 'eval', args: { js: 'X' } };
  const base = { url: 'https://x.test', evalStep, selector: 'h1', settleSeconds: 0, gapMs: 4000, timeout: 9 };
  const nav = buildExtractCommands({ ...base, navigate: true });
  const probe = buildExtractCommands({ ...base, navigate: false });

  assert.equal(nav[0].cmd, 'open');
  assert.equal(nav[1].args.selector, 'h1');
  assert.ok(!probe.some((c) => c.cmd === 'open'), '导航超时后重开新标签页正是要防的事');
  assert.deepEqual(probe[0], evalStep);
  assert.deepEqual(nav.at(-1), { cmd: 'wait', args: { seconds: 4 } }, '节流挂在 batch 末尾');
  assert.equal(buildExtractCommands({ ...base, gapMs: 0, navigate: true }).at(-1), evalStep);
});

test('配额站的会话名由站点决定，--session 不能悄悄恢复旧行为', () => {
  const errs = [];
  const real = console.error; console.error = (m) => errs.push(m);
  try {
    assert.equal(resolveSession({}, 'semrush-overview', 'semrush'), 'semrush-nav');
    assert.equal(resolveSession({ session: 'my-own' }, 'x', 'semrush'), 'semrush-nav',
      '传了 --session 也照样收敛');
    assert.equal(errs.length, 1, '忽略 --session 必须出声，不能静默');
    assert.match(errs[0], /配额站/);

    // 逃生舱：显式声明才放行
    assert.equal(resolveSession({ session: 'my-own', 'allow-parallel-session': true }, 'x', 'semrush'), 'my-own');
    // 非配额站不受影响
    assert.equal(resolveSession({ session: 'my-own' }, 'x'), 'my-own');
    assert.match(resolveSession({}, 'recon'), /^recon-/);
    // 守卫仍然拦 $$ 形状
    assert.throws(() => resolveSession({ session: 'probe-48321' }, 'x'), /PID 的形状/);
  } finally { console.error = real; }
});

test('访问记账能从各种参数形状里认出 URL', () => {
  assert.equal(urlFromArgs(['open', 'https://sem.proxy.example.com/analytics/overview/']),
    'https://sem.proxy.example.com/analytics/overview/');
  // batch 的 URL 埋在 --commands 的 JSON 里
  assert.equal(urlFromArgs(['batch', '--commands',
    JSON.stringify([{ cmd: 'open', args: { url: 'https://example.com/a' } }])]),
    'https://example.com/a');
  assert.equal(urlFromArgs(['state', '--source', 'ax']), null, '没有 URL 就是 null');
});

test('访问记账认得出动作名，短横线选项不冒充动作', () => {
  const meta = { ms: 1, ok: true, bytes: 0 };
  // 真实形状：opencli() 会在位置 2 插入 --window <mode>，子命令因此排在第 4 位。
  assert.equal(accessEntry(['browser', 'access-entry-test', '--window', 'background', 'open', 'https://sem.proxy.example.com/x'], meta).action, 'open');
  assert.equal(accessEntry(['browser', 'access-entry-test', '--window', 'background', 'eval', '1+1'], meta).action, 'eval');
  // 回归：`sessions` 是子命令而不是会话名，动作曾被记成 `-f`。
  const listing = accessEntry(['browser', 'sessions', '-f', 'json'], meta);
  assert.equal(listing.action, 'sessions');
  assert.equal(listing.session, null, 'sessions 不是会话名');
  assert.equal(accessEntry(['browser', 'cleanup'], meta).action, 'cleanup');
  assert.equal(accessEntry(['doctor'], meta).action, 'doctor', '非 browser 命令按 argv[0] 记');
});

test('调用方归属：入口脚本名自动记，显式 tag 压过它', () => {
  const meta = { ms: 1, ok: true, bytes: 0 };
  // 会话名故意不用真的 `semrush-nav`：accessEntry 会把 open 的 URL 按会话名
  // 落到 ~/.opencli/logs/last-url/ 下，测试用真名就会覆盖线上会话的归属，
  // 让之后每一条真实 eval 都记到测试造的假路由上。（本条注释是踩过之后写的。）
  const call = ['browser', 'access-entry-test', '--window', 'background', 'eval', '1+1'];
  // 会话名在配额站上由站点决定，所以它答不了「谁开的」——script 才能。
  // 这里跑在 node --test 里，argv[1] 是测试文件本身。
  assert.equal(accessEntry(call, meta).script, 'quota-sites.test');
  const prev = process.env.OPENCLI_ACCESS_TAG;
  process.env.OPENCLI_ACCESS_TAG = 'bounty-sweep';
  try {
    const tagged = accessEntry(call, meta);
    assert.equal(tagged.tag, 'bounty-sweep');
    assert.equal(tagged.script, 'quota-sites.test', '显式 tag 不该顶掉脚本名，两者分开记');
  } finally {
    if (prev === undefined) delete process.env.OPENCLI_ACCESS_TAG;
    else process.env.OPENCLI_ACCESS_TAG = prev;
  }
});

test('OPENCLI_ACCESS_LOG=0 时记账彻底闭嘴', () => {
  const prev = process.env.OPENCLI_ACCESS_LOG;
  process.env.OPENCLI_ACCESS_LOG = '0';
  try {
    // 不抛异常即可——记账绝不能把调用方搞挂，关掉时更不该有任何副作用
    assert.doesNotThrow(() => logSiteAccess({ ts: 'x', site: 'y' }));
  } finally {
    if (prev === undefined) delete process.env.OPENCLI_ACCESS_LOG;
    else process.env.OPENCLI_ACCESS_LOG = prev;
  }
});

test('OPENCLI_ACCESS_LOG=0 时取样也不动手', async () => {
  const prev = process.env.OPENCLI_ACCESS_LOG;
  process.env.OPENCLI_ACCESS_LOG = '0';
  try {
    // 关掉记账就等于关掉观测的全部——取样也不能偷偷开一次浏览器调用
    assert.equal(await captureSample('whatever', 'test'), null);
  } finally {
    if (prev === undefined) delete process.env.OPENCLI_ACCESS_LOG;
    else process.env.OPENCLI_ACCESS_LOG = prev;
  }
});
