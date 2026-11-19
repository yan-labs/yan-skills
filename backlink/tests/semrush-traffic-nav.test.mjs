/**
 * semrush-traffic.mjs 的**驱动层**测试。
 *
 * 这个脚本从来没有跑通过一次。根因（2026-08-29 持锁实盘 3 次干净复现）：
 * `/analytics/traffic/traffic-overview/` 这条路由上**没有查询表单**——裸导航过去
 * 标题是 `Dashboards`，整页唯一的 input 是 13 个 checkbox，前台轮询 36 秒也不会
 * 出现任何文本框。于是旧代码里等 `input[aria-label="Input target"]` 的那段
 * 永远不可能成功，它后面的提交函数是死代码。
 *
 * 页面从 **query string** 取目标：`?q=<域名>&searchType=domain`。
 * （旧档案写着「`?q=<domain>` 不被识别」——那次测试漏了 `searchType=domain`。）
 *
 * 解析层（parseHeader / parseTrafficSummary）实盘验过 15 个字段零容差全对，
 * **本文件一个字都不碰它**，只测导航/落地校验这一段。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TRAFFIC_PATH,
  TRAFFIC_SEARCH_TYPE,
  buildTrafficUrl,
  classifyDeepLink,
  verifyReportTarget,
} from '../scripts/semrush-traffic.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const scriptPath = path.join(here, '..', 'scripts', 'semrush-traffic.mjs');
const source = await readFile(scriptPath, 'utf8');

test('导航 URL 必须同时带 q= 和 searchType=domain', () => {
  const url = buildTrafficUrl('https://sem.proxy.example.com', 'canva.com');
  const parsed = new URL(url);
  assert.equal(parsed.pathname, TRAFFIC_PATH);
  assert.equal(parsed.searchParams.get('q'), 'canva.com');
  assert.equal(parsed.searchParams.get('searchType'), TRAFFIC_SEARCH_TYPE);
  assert.equal(TRAFFIC_SEARCH_TYPE, 'domain');
  // 尾斜杠不许翻倍——`origin` 带不带 `/` 都得拼出同一条 URL。
  assert.equal(buildTrafficUrl('https://sem.proxy.example.com/', 'canva.com'), url);
});

test('主流程真的把带 query 的深链传给 gotoInTool，而不是裸路由', () => {
  // 变异守卫：把 `buildTrafficUrl(origin, domain)` 换回 `${origin}${TRAFFIC_PATH}`
  // （2026-08-29 之前的写法）这条会红。
  assert.match(source, /const requested = buildTrafficUrl\(origin, domain\);/);
  assert.match(source, /gotoInTool\(evalPage, requested,/);
  assert.ok(
    !/gotoInTool\([^)]*\$\{origin\}\$\{TRAFFIC_PATH\}/.test(source),
    '裸导航 `${origin}${TRAFFIC_PATH}` 会落在没有表单的 Dashboards 页上',
  );
});

test('落地校验是结构信号：query 被吞掉必须判失败', () => {
  const domain = 'canva.com';
  const good = buildTrafficUrl('https://sem.proxy.example.com', domain);
  assert.equal(classifyDeepLink({ landedUrl: good, domain }).ok, true);

  // `/analytics/traffic/overview/` 会 302 到落地页并把 query 丢掉——正是这一类。
  const cases = {
    'https://sem.proxy.example.com/analytics/traffic/traffic-overview/': 'query-dropped',
    'https://sem.proxy.example.com/analytics/traffic/traffic-overview/?q=canva.com': 'search-type-dropped',
    'https://sem.proxy.example.com/analytics/traffic/': 'path-drift',
    'https://sem.proxy.example.com/analytics/traffic/traffic-overview/?q=figma.com&searchType=domain': 'query-target-mismatch',
    '': 'unparsable-url',
  };
  for (const [landedUrl, reason] of Object.entries(cases)) {
    const got = classifyDeepLink({ landedUrl, domain });
    assert.equal(got.ok, false, `${landedUrl} 不该判通过`);
    assert.equal(got.reason, reason, landedUrl);
  }

  // 尾斜杠差异不是漂移；页面自己加的额外参数也不是。
  assert.equal(classifyDeepLink({
    landedUrl: 'https://sem.proxy.example.com/analytics/traffic/traffic-overview?q=canva.com&searchType=domain&db=us',
    domain,
  }).ok, true);
});

test('只有 checkbox 的假页面：不许再报「输入框没出现」', async () => {
  const { summaryHasValues } = await import('../scripts/semrush-traffic.mjs');
  // 这就是实盘裸导航落地页的形状——标题 Dashboards、13 个 checkbox、零个文本框、
  // URL 上没有 query。旧代码在这里会等满 40s 然后报「主体输入框没出现」，
  // 那句话把「路由不提供表单」说成了「输入框水合慢」，误导了三次实盘。
  const checkboxOnlyPage = {
    title: 'Dashboards',
    url: 'https://sem.proxy.example.com/analytics/traffic/traffic-overview/',
    inputs: Array.from({ length: 13 }, () => ({ type: 'checkbox' })),
    bodyText: ['Dashboards', '我的仪表板', '创建新列表'].join('\n'),
  };
  assert.equal(checkboxOnlyPage.inputs.filter((i) => i.type !== 'checkbox').length, 0);

  // 现在这一页的判定必须落在**结构信号**上：query 被丢了 → query-dropped，
  // 而不是任何关于输入框的结论。
  const verdict = classifyDeepLink({ landedUrl: checkboxOnlyPage.url, domain: 'canva.com' });
  assert.equal(verdict.reason, 'query-dropped');
  assert.ok(!JSON.stringify(verdict).includes('input'), '判定结果里不许再提输入框');
  // 而且这一页本来就没有摘要数值，解析层照旧判 unavailable（这条没变，顺手锁住）。
  assert.equal(summaryHasValues(checkboxOnlyPage.bodyText), false);

  // 驱动层里**任何一处**依赖输入框的痕迹都不许再有。
  for (const dead of ['Input target', 'INPUT_SELECTOR', 'waitForInput', 'submitTarget', 'input-timeout']) {
    // 头部注释里允许出现（那是在解释为什么删掉），代码里不许。
    const code = source.split('\n')
      .filter((line) => !/^\s*(\*|\/\*|\/\/)/.test(line))
      .join('\n');
    assert.ok(!code.includes(dead), `驱动层还残留着 ${dead}`);
  }
  // 那句错误文案也不许再出现——它一次都没有诚实过。
  assert.ok(!source.includes('没有出现主体输入框'), '「输入框没出现」这条错误路径必须消失');
});

test('页头主体对不上是硬失败，不是一行 console.error', () => {
  assert.equal(verifyReportTarget({ headerTarget: 'canva.com', domain: 'canva.com' }).status, 'match');
  assert.equal(verifyReportTarget({ headerTarget: 'www.canva.com', domain: 'canva.com' }).status, 'match');
  // 「元素/页面在，就当成功」是旧 submitTarget 的病：读到 axa.fr 也照样出数。
  assert.equal(verifyReportTarget({ headerTarget: 'axa.fr', domain: 'canva.com' }).status, 'mismatch');
  assert.equal(verifyReportTarget({ headerTarget: '', domain: 'canva.com' }).status, 'unknown');

  // mismatch 必须 throw，不能只是打日志。
  assert.match(source, /targetCheck\.status === 'mismatch'[\s\S]{0,200}throw new Error\(/);
  assert.ok(
    !/\[target-mismatch\]/.test(source),
    'mismatch 不许退回成只打一行 console.error 就照常出数',
  );
});

test('失败诊断走 locale 表，未覆盖的 locale 判 unknown 而不是默认通过', async () => {
  const { classifyTargetScope } = await import('../scripts/lib-report-readiness.mjs');
  // 这个共享账号的 UI 是中文：写死英文标记的判据在它上面一次都匹配不上。
  assert.equal(classifyTargetScope({ text: '创建新列表', target: 'canva.com', documentLang: 'zh-Hans' }).emptyState, 'yes');
  // 没覆盖的 locale：**不许**默认判成「不在空态」。
  assert.equal(classifyTargetScope({ text: '아무것도', target: 'canva.com', documentLang: 'ko' }).emptyState, 'unknown');

  // 驱动层确实接了这套判据，而不是自己另写一个写死语言的。
  assert.match(source, /classifyTargetScope\(/);
  assert.match(source, /from '\.\/lib-report-readiness\.mjs'/);
});
