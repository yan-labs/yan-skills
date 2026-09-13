/**
 * 配额站的默认会话名不许带 per-agent 后缀。
 *
 * 背景：会话名就是并发度。`defaultSession(base)` 会接一个 per-conversation 后缀，
 * 于是每个 agent 拿到一个自己的名字、一个自己的标签页——2026-08-28 实测的后果是
 * **19 个标签页同时压在同一张 Semrush 报表上**。Similarweb 那边由 opencli daemon
 * 强制兜底（脚本传什么都被覆盖成 similarweb-nav），Semrush 没有任何东西兜底，
 * 所以只要还靠「每个调用方自己记得传 --session semrush-nav」，第一个忘记的人就带回归。
 *
 * 这份测试**不扫源码文本**。本仓库出过「测试只测正则、功能删了照样绿」的事故，
 * 所以这里真的把每个脚本作为子进程跑起来，把 PATH 上的 `opencli` 换成一个
 * 只记录 argv 就退出的桩，然后断言它**实际发出去**的那条命令用的是哪个会话名。
 * 子进程的 OPENCLI_SESSION_SUFFIX 被设成一个显眼的值：任何一条退回 defaultSession
 * 的路径都会把它带进会话名里，当场被抓住。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { toolSession } from '../scripts/lib-tools-share.mjs';
import { defaultSession, quotaSessionForKey, resolveSession, sessionForUrl } from '../scripts/opencli-core.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const backlinkScripts = path.join(repo, 'backlink', 'scripts');
const demandScripts = path.join(repo, 'rankup', 'scripts', 'demand');

/** 一个显眼的后缀：只要它出现在会话名里，就说明某条路径退回了 defaultSession。 */
const AGENT_SUFFIX = 'agentzzz';

/**
 * 每个驱动配额站的脚本一行。`expect` 是它在**没有 --session** 时必须用的会话名。
 * `exempt` 只给「一个会话一个节点」的探测器——它的全部意义就是不共用会话。
 */
const DRIVERS = {
  'backlink/scripts/semrush-overview.mjs':     { args: ['--domain', 'example.com', '--db', 'us'], expect: 'semrush-nav' },
  'backlink/scripts/semrush-batch.mjs':        { args: ['--domains-file', '@DOMAINS@', '--db', 'us', '--out', '@OUT@'], expect: 'semrush-nav' },
  'backlink/scripts/semrush-keyword.mjs':      { args: ['--kw', 'test', '--db', 'us'], expect: 'semrush-nav' },
  // keyword-magic has no worldwide selector and lands on an unpredictable country
  // without --db (2026-09-13), so it now hard-exits before ever reaching opencli —
  // --db must be passed here just to get far enough to observe the session name.
  'backlink/scripts/semrush-report.mjs':       { args: ['--report', 'keyword-magic', '--keyword', 'test', '--db', 'us'], expect: 'semrush-nav' },
  'backlink/scripts/semrush-traffic.mjs':      { args: ['--domain', 'example.com'], expect: 'semrush-nav' },
  'backlink/scripts/similarweb-batch.mjs':     { args: ['--domains', 'example.com', '--out', '@OUT@'], expect: 'similarweb-nav' },
  'backlink/scripts/similarweb-keywords.mjs':  { args: ['--domain', 'example.com', '--seed', 'test'], expect: 'similarweb-nav' },
  'backlink/scripts/similarweb-query.mjs':     { args: ['--domain', 'example.com'], expect: 'similarweb-nav' },
  'backlink/scripts/tools-share-open.mjs':     { args: ['--tool', 'semrush'], expect: 'semrush-nav' },
  'backlink/scripts/tools-share-evidence.mjs': { args: ['--tool', 'semrush', '--report', 'backlinks-overview', '--domain', 'example.com', '--out-dir', '@OUT@'], expect: 'semrush-nav' },
  'rankup/scripts/demand/payment-referrers.mjs': { args: ['similarweb', 'creem'], expect: 'similarweb-nav' },
  // 唯一的豁免：它逐个节点探测，每个节点必须是独立会话，否则第二个节点会直接复用
  // 第一个节点已经停在工具域名上的标签页，探测结果全部错误归属。串行跑，仍然只有
  // 一个标签页在导航。豁免必须是**显式**的（allowParallelSession），不是忘了改。
  'backlink/scripts/tools-share-node.mjs': {
    args: ['probe', '--tool', 'similarweb', '--nodes', '3'],
    exempt: 'per-node probe',
    expect: `tools-share-node-${AGENT_SUFFIX}-n3`,
  },
};

/** 扫出所有真正调用 launchTool 的脚本——表少一行就红，不靠人记得来加。 */
function discoverDrivers() {
  const found = [];
  for (const dir of [backlinkScripts, demandScripts]) {
    const rel = path.relative(repo, dir);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith('.mjs')) continue;
      if (name === 'lib-tools-share.mjs') continue; // 定义 launchTool，不调用它
      const source = readFileSync(path.join(dir, name), 'utf8');
      if (/(?<![A-Za-z0-9_$.])launchTool\(|\.launchTool\(/.test(source)) found.push(`${rel}/${name}`.split(path.sep).join('/'));
    }
  }
  return found.sort();
}

let stubDir = null;
function opencliStub() {
  if (stubDir) return stubDir;
  stubDir = mkdtempSync(path.join(tmpdir(), 'quota-session-stub-'));
  mkdirSync(path.join(stubDir, 'bin'));
  const bin = path.join(stubDir, 'bin', 'opencli');
  // argv 记一行就退出。非零退出让被测脚本立刻停下——我们只需要它发出的第一条命令。
  writeFileSync(bin, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$OPENCLI_STUB_LOG"\necho "opencli stub" >&2\nexit 3\n');
  chmodSync(bin, 0o755);
  return stubDir;
}

/** 跑一个脚本，返回它发给 opencli 的第一条 `browser <session> …` 用的会话名。 */
function sessionUsedBy(relScript, args) {
  const root = opencliStub();
  const work = mkdtempSync(path.join(root, 'run-'));
  const log = path.join(work, 'opencli.log');
  writeFileSync(log, '');
  const script = path.join(repo, relScript);
  const domainsFile = path.join(work, 'domains.txt');
  writeFileSync(domainsFile, 'example.com\n');
  const resolved = args.map((a) => {
    if (a === '@OUT@') return path.join(work, 'out.json');
    if (a === '@DOMAINS@') return domainsFile;
    return a;
  });
  spawnSync(process.execPath, [script, ...resolved], {
    cwd: path.dirname(script),
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      PATH: `${path.join(root, 'bin')}${path.delimiter}${process.env.PATH}`,
      OPENCLI_STUB_LOG: log,
      // 测试不许写进真实的访问日志。桩的 stderr 是 `opencli stub` + 退出码 3，
      // 每跑一轮就往 ~/.opencli/logs/site-access.jsonl 里灌一批「失败」——
      // 实测 4 小时的日志里 220 条失败有 182 条是这个桩，真实故障只有 2 条。
      // access-report.mjs 为此专门写了一条噪声正则，但在源头不写显然更对。
      OPENCLI_ACCESS_LOG: '0',
      OPENCLI_SESSION_SUFFIX: AGENT_SUFFIX,
      // 令牌在环境或 .env 里时会走「直连兜底」，那条路一样要用收敛后的会话名，
      // 但它的第一条命令是 open 而不是 eval。清空以让每台机器上的结果一致。
      SEM_GMITM: '',
      SIM_GMITM: '',
      // 锁目录隔离：别去抢真实任务留在系统 tmp 里的 tools-share 锁。
      TMPDIR: work,
      // 2026-09-14：几个脚本默认走虚拟屏幕策略，启动前会读本机屏幕（osascript）并查
      // `browser sessions`。这条测试只关心会话名，不许依赖跑测试那台机器接没接虚拟屏幕。
      BACKLINK_AUTOMATION_DISPLAY: 'off',
    },
  });
  // `browser sessions` / `browser cleanup` 是子命令，不是会话名（同 opencli-core 的 BARE_BROWSER_SUBCOMMANDS）。
  const line = readFileSync(log, 'utf8').split('\n')
    .find((l) => l.startsWith('browser ') && !/^browser (sessions|cleanup)\b/.test(l));
  assert.ok(line, `${relScript} 没有向 opencli 发出任何 browser 命令——参数表可能过时了，先修参数再谈会话名`);
  return line.split(/\s+/)[1];
}

test('每个驱动配额站的脚本都在表里——新增一个就必须在这里表态', () => {
  assert.deepEqual(discoverDrivers(), Object.keys(DRIVERS).sort());
});

for (const [script, spec] of Object.entries(DRIVERS)) {
  const label = spec.exempt
    ? `${script}：显式豁免（${spec.exempt}），用自己的会话名`
    : `${script}：缺省会话名收敛成 ${spec.expect}`;
  test(label, () => {
    const used = sessionUsedBy(script, spec.args);
    assert.equal(used, spec.expect, `${script} 实际用了会话 ${used}`);
    if (!spec.exempt) {
      assert.ok(
        !used.includes(AGENT_SUFFIX),
        `${script} 的会话名带上了 per-agent 后缀（${used}）——每个 agent 一个标签页，正是这条法则要防的`,
      );
    }
  });
}

test('端到端：显式 --session 被收敛掉，--allow-parallel-session 才放行', () => {
  // 单元测的是 toolSession；这里测的是同一条策略在**整条链路**上还成立——
  // 脚本里的 resolveSession 与 launchTool 里的收敛各判一次，两处判不一致
  // 就会出现「加了逃生舱还是被覆盖」这种只在真跑时才暴露的坑。
  assert.equal(
    sessionUsedBy('backlink/scripts/semrush-overview.mjs',
      ['--domain', 'example.com', '--db', 'us', '--session', 'my-own']),
    'semrush-nav',
    '光传 --session 不该能恢复 per-agent 并发',
  );
  assert.equal(
    sessionUsedBy('backlink/scripts/semrush-overview.mjs',
      ['--domain', 'example.com', '--db', 'us', '--session', 'my-own', '--allow-parallel-session']),
    'my-own',
    '显式声明并行的逃生舱必须真的通到浏览器那一层',
  );
});

test('会话名解析层：配额站给固定名，普通站给带后缀的名', () => {
  assert.equal(toolSession('semrush', {}), 'semrush-nav');
  assert.equal(toolSession('similarweb', {}), 'similarweb-nav');
  // 普通站走同一条函数链（sessionForUrl），必须退回 defaultSession 的 per-agent 后缀，
  // 否则两个 agent 会读到彼此的页面——收敛只对配额站成立。
  const ordinary = sessionForUrl('https://example.com/report', 'page-recon');
  assert.match(ordinary, /^page-recon-/);
  assert.notEqual(ordinary, 'page-recon');
  assert.equal(ordinary, defaultSession('page-recon'));

  assert.equal(quotaSessionForKey('semrush'), 'semrush-nav');
  assert.equal(quotaSessionForKey('ahrefs'), null, '不在 QUOTA_SITES 里的 key 不该凭空得到 -nav');
  assert.match(resolveSession({}, 'page-recon', 'ahrefs'), /^page-recon-/);
});

test('显式 --session 被覆盖并出声；要并行得显式声明', () => {
  const errs = [];
  const real = console.error;
  console.error = (m) => errs.push(String(m));
  try {
    assert.equal(toolSession('semrush', { session: 'my-own' }), 'semrush-nav', '显式 --session 也照样收敛');
    assert.equal(errs.length, 1, '忽略调用方的显式输入必须出声，不能静默');
    assert.match(errs[0], /配额站/);
    // 已经就是固定名的不该再刷一行噪音。
    assert.equal(toolSession('semrush', { session: 'semrush-nav' }), 'semrush-nav');
    assert.equal(errs.length, 1);
    // 逃生舱：A/B 对比这类正当需求走这里，代价是显式的。
    assert.equal(toolSession('semrush', { session: 'my-own', allowParallelSession: true }), 'my-own');
    assert.match(toolSession('semrush', { allowParallelSession: true }), /^tools-share-semrush-/);
    // 守卫仍然拦 $$ 形状的会话名。
    assert.throws(() => toolSession('semrush', { session: 'probe-48321' }), /PID 的形状/);
    assert.throws(() => toolSession('ahrefs', {}), /tool must be one of/);
  } finally { console.error = real; }
});
