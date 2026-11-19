// backlink/scripts/lib-report-readiness.mjs 的行为断言。
//
// 这一族判据同属 <law-ref id="readiness-must-bind-to-this-query"/>，讽刺的是它们正是
// **那条 law 自己的承重条件**，而且犯着 law 要防的同一个病：「页面上出现了 X」没有先问
// 「X 有没有可能由别处提供？」。这里锁四件事：
//
//   1. `exportBtns` 绑到传进来的作用域根（默认仍是 main，行为不变）；
//   2. `chartHydrated` 同上——邻居挂件的 svg 数字不许算进本报表；
//   3. `spinnerGone` 被拆开：aria-busy 是否决项，猜类名那半只记录、不判定；
//   4. `onTarget` 的否定半边不再是中文字面量，且**匹配不到标记不等于不在空态**。
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHART_HYDRATED_MIN,
  CONTENT_FLOOR_CHARS,
  DEFAULT_SCOPE_SELECTOR,
  EMPTY_STATE_MARKERS,
  EXPORT_CONTROLS_MIN,
  RETIRED_STRUCTURAL_SIGNALS,
  checkHeaderTarget,
  checkLandedRoute,
  classifyAbsence,
  classifyAdmissibility,
  classifyContentEvidence,
  classifyReportProbe,
  classifyTargetScope,
  detectUiLocale,
  isNoTableStructural,
  primaryLanguageSubtag,
  readBusyState,
  readReportProbe,
  renderFinished,
} from '../scripts/lib-report-readiness.mjs';

// ---------------------------------------------------------------------------
// 一个只够跑这几条选择器的迷你 DOM。仓库没有依赖，也不该为一个判据引 jsdom。
// 支持：标签、[attr]、[attr="v"]、[attr*="v" i]、逗号列表、后代组合。
// ---------------------------------------------------------------------------
function element(tag, attributes = {}, children = []) {
  const node = {
    tag,
    attrs: attributes,
    children: typeof children === 'string' ? [] : children,
    ownText: typeof children === 'string' ? children : '',
    parent: null,
    // 真实 DOM 的默认值就是 null（也是闭合 shadow root 的返回值）。
    shadowRoot: null,
  };
  for (const child of node.children) child.parent = node;
  Object.defineProperty(node, 'textContent', { get: () => text(node) });
  Object.defineProperty(node, 'innerText', { get: () => text(node) });
  node.querySelectorAll = (selector) => queryAll(node, selector);
  node.querySelector = (selector) => queryAll(node, selector)[0] || null;
  return node;
}

/**
 * 给一个宿主元素挂一个 open shadow root。**这是本次修复的整个战场**：
 * `innerText` 与 `querySelectorAll` 都到此为止，所以挂在这里面的东西对浅层探针
 * 完全不存在——实盘里 Semrush 的外壳和报表挂件就挂在 44 个这样的 root 里。
 */
function attachShadow(host, children = []) {
  const root = element('#shadow-root', {}, children);
  root.parent = null;
  host.shadowRoot = root;
  return host;
}

function text(node) {
  return node.ownText + node.children.map(text).join('\n');
}

function descendants(node, out = []) {
  for (const child of node.children) {
    out.push(child);
    descendants(child, out);
  }
  return out;
}

function parseCompound(part) {
  const tag = (part.match(/^[a-zA-Z][\w-]*/) || [''])[0];
  const attributes = [...part.matchAll(/\[([\w-]+)(?:([*^$]?=)"([^"]*)"(\s*i)?)?\]/g)].map((m) => ({
    name: m[1],
    operator: m[2] || null,
    value: m[3] ?? null,
    insensitive: Boolean(m[4]),
  }));
  return { tag, attributes };
}

function matchesCompound(node, compound) {
  if (compound.tag && node.tag !== compound.tag) return false;
  return compound.attributes.every((attribute) => {
    const raw = node.attrs[attribute.name];
    if (raw === undefined || raw === null) return false;
    if (!attribute.operator) return true;
    const actual = attribute.insensitive ? String(raw).toLowerCase() : String(raw);
    const expected = attribute.insensitive ? attribute.value.toLowerCase() : attribute.value;
    return attribute.operator === '*=' ? actual.includes(expected) : actual === expected;
  });
}

function queryAll(root, selector) {
  const found = [];
  for (const branch of selector.split(',')) {
    const compounds = branch.trim().split(/\s+(?![^[]*\])/).filter(Boolean).map(parseCompound);
    for (const node of descendants(root)) {
      if (!matchesCompound(node, compounds[compounds.length - 1])) continue;
      let cursor = node.parent;
      let index = compounds.length - 2;
      while (index >= 0 && cursor) {
        if (matchesCompound(cursor, compounds[index])) index -= 1;
        cursor = cursor.parent;
      }
      if (index < 0 && !found.includes(node)) found.push(node);
    }
  }
  return found;
}

function makeDocument({ body, lang = '', pathname = '/', visibilityState = 'visible' }) {
  const documentElement = element('html', { lang }, [body]);
  return {
    documentElement,
    body,
    location: { pathname },
    visibilityState,
    hasFocus: () => false,
    querySelector: (selector) => queryAll(documentElement, selector)[0] || null,
    querySelectorAll: (selector) => queryAll(documentElement, selector),
  };
}

const svgLabel = (value) => element('svg', {}, [element('text', {}, value)]);
const exportButton = (label = '导出') => element('button', {}, label);

// ---------------------------------------------------------------------------
// 1 + 2：作用域可传参，默认值不变
// ---------------------------------------------------------------------------
function pageWithForeignWidget() {
  // 邻居挂件（实例 1 那张 axa.fr 对比卡片，这次假设它是 svg 画的）挂在 main 之外，
  // 全局工具栏的「导出」按钮也在 main 之外；本报表区自己什么都没渲染。
  const widget = element('aside', { class: 'local-visibility-widget' }, [
    svgLabel('axa.fr'), svgLabel('42'), svgLabel('758'), svgLabel('15%'),
    exportButton('导出对比'),
  ]);
  const report = element('section', { 'data-testid': 'report-region' }, []);
  const main = element('main', {}, [report, widget, exportButton('Export')]);
  return { main, report, body: element('body', {}, [main]) };
}

test('默认作用域仍是 main，两个退役信号照旧被量出来', () => {
  assert.equal(DEFAULT_SCOPE_SELECTOR, 'main');
  const { body } = pageWithForeignWidget();
  const probe = readReportProbe(makeDocument({ body, lang: 'zh-Hans' }), { target: 'canva.com' });
  assert.equal(probe.scopeSelector, 'main');
  assert.equal(probe.scopeResolved, true);
  // 挂件的 4 个 svg 数字 + 两个导出按钮照旧被量到 —— **量还是要量**，
  // 它们是证据，只是不再是判据。
  // axa.fr 不含数字，42 / 758 / 15% 含 —— 挂件自己**刚好凑够旧阈值 3**。
  assert.equal(probe.chartHydrated, 3);
  assert.equal(probe.exportBtns, 2);
  // ⚠️ 2026-08-29 改判：这一行以前断言 `true`，注释写着「这就是病灶」。
  // 病灶已经切掉——退役了这两个信号，并且加了分类前的硬闸门。
  assert.equal(
    isNoTableStructural({ ...probe, onTarget: true }), false,
    '邻居挂件不许再独自满足结构判据：两个信号已退役，且没有 admissible 就不许出结论',
  );
  assert.deepEqual(RETIRED_STRUCTURAL_SIGNALS, ['chartHydrated', 'exportBtns']);
  assert.ok(probe.advisoryOnly.includes('exportBtns'));
  assert.ok(probe.advisoryOnly.includes('chartHydrated'));
  assert.equal(probe.scopeIsUnverifiedDefault, true, '默认作用域必须自报「未验证」');
});

test('退役的两个信号即使拉满，也不能让结构判定成立', () => {
  // 这是 daily-trends 的形态：内容区一片空白，exportBtns 却量到 12。
  const blank = { admissible: true, deepProbe: true, noTable: true, onTarget: true };
  assert.equal(isNoTableStructural({ ...blank, chartHydrated: 0, exportBtns: 12 }), true,
    '判定只看闸门 + 深层 noTable + onTarget');
  assert.equal(isNoTableStructural({ ...blank, chartHydrated: 122, exportBtns: 0 }), true,
    '同一份判定，两个退役信号取任何值都不许改变结果');
  // 反过来：闸门没过，两个信号再漂亮也不许出结论。
  assert.equal(
    isNoTableStructural({ ...blank, admissible: false, chartHydrated: 122, exportBtns: 12 }),
    false, '闸门是第一位的',
  );
  assert.equal(
    isNoTableStructural({ ...blank, deepProbe: false }), false,
    '浅层探针的 noTable 只是「页面一小块里没有表」，不许升格成结论',
  );
});

test('把作用域根传成本报表区，邻居挂件与全局工具栏就都掉出判据', () => {
  const { body } = pageWithForeignWidget();
  const probe = readReportProbe(
    makeDocument({ body, lang: 'zh-Hans' }),
    { scopeSelector: '[data-testid="report-region"]', target: 'canva.com' },
  );
  assert.equal(probe.scopeResolved, true);
  assert.equal(probe.scopeIsUnverifiedDefault, false);
  assert.equal(probe.chartHydrated, 0, '挂件的 svg 数字不是本报表的图表');
  assert.equal(probe.exportBtns, 0, '别处的导出按钮不证明本报表章节渲染完了');
  // 于是那个假的 no-table-structural 不成立了。
  assert.equal(isNoTableStructural({ ...probe, onTarget: true }), false);
});

test('作用域根找不到时退回 body，并且这件事必须写在输出里', () => {
  const { body } = pageWithForeignWidget();
  const probe = readReportProbe(makeDocument({ body }), { scopeSelector: '[data-testid="nope"]' });
  assert.equal(probe.scopeResolved, false, '绑没绑上，下游得看得见');
  assert.equal(probe.scopeIsUnverifiedDefault, false);
});

test('导出按钮的文案清单被记下来，作用域绑不上时它是唯一线索', () => {
  const { body } = pageWithForeignWidget();
  const probe = readReportProbe(makeDocument({ body }), {});
  assert.deepEqual(probe.exportControlLabels, ['导出对比', 'Export']);
});

test('阈值仍是 3 / 1，且是 svg 里含数字的文本节点', () => {
  assert.equal(CHART_HYDRATED_MIN, 3);
  assert.equal(EXPORT_CONTROLS_MIN, 1);
  const main = element('main', {}, [
    svgLabel('访问量'), svgLabel('12'), svgLabel('34'), svgLabel('56'), exportButton(),
  ]);
  const probe = readReportProbe(makeDocument({ body: element('body', {}, [main]) }), {});
  assert.equal(probe.chartHydrated, 3, '不含数字的坐标轴标题不算水合');
  const admitted = { ...probe, admissible: true, onTarget: true };
  assert.equal(isNoTableStructural(admitted), true);
  // 旧阈值不再是门槛：调低到 2 / 0 都不影响判定。
  assert.equal(isNoTableStructural({ ...admitted, chartHydrated: 2 }), true);
  assert.equal(isNoTableStructural({ ...admitted, exportBtns: 0 }), true);
  assert.equal(isNoTableStructural({ ...admitted, onTarget: false }), false, 'onTarget 不可丢');
  assert.equal(isNoTableStructural({ ...admitted, noTable: false }), false);
  assert.equal(isNoTableStructural({ ...admitted, admissible: undefined }), false,
    '闸门漏传等于没过 —— 不许「不传就按通过算」');
});

// ---------------------------------------------------------------------------
// 3：spinnerGone 拆开
// ---------------------------------------------------------------------------
test('aria-busy 是否决项，猜类名那半只记录、不参与判定', () => {
  const busy = element('main', {}, [element('div', { 'aria-busy': 'true' }, [])]);
  const skeleton = element('main', {}, [element('div', { class: 'ChartSkeleton' }, [])]);
  assert.deepEqual(readBusyState(busy), { ariaBusy: true, loadingClassPresent: false });
  assert.deepEqual(readBusyState(skeleton), { ariaBusy: false, loadingClassPresent: true });

  // 正向信号在 + 页面没自称在忙 → 完成。
  assert.equal(renderFinished({ paginator: true, ariaBusy: false }), true);
  assert.equal(renderFinished({ rowCount: true, ariaBusy: false }), true);
  // 页面自称还在忙 → 否决。
  assert.equal(renderFinished({ paginator: true, ariaBusy: true }), false);
  // ⚠️ 关键：猜类名那半**不许**改变判定。厂商换了类名它恒为真，
  // 一个从未开始渲染的页面就会被判成「加载指示已消失」。
  assert.equal(
    renderFinished({ paginator: true, ariaBusy: false, loadingClassPresent: true }),
    true,
    'loadingClassPresent 是记录项，不得阻断一个有正向完成信号的判定',
  );
  // 而且没有正向信号时，「没有 spinner」永远不构成完成 —— 这才是那条 law 要的方向。
  assert.equal(renderFinished({ loadingClassPresent: false }), false);
  assert.equal(renderFinished({}), false, '什么都没有 ⇒ 未完成，不是「已完成」');
});

test('renderFinished 的入参名里不再有 spinnerGone 这种否定式信号', () => {
  assert.equal(renderFinished({ paginator: true, spinnerGone: true, ariaBusy: true }), false,
    '外部传一个 spinnerGone 进来也不许绕过 aria-busy 否决');
});

// ---------------------------------------------------------------------------
// 4：onTarget 的否定半边
// ---------------------------------------------------------------------------
test('中文空态标记照旧命中', () => {
  const scope = classifyTargetScope({
    text: '创建新列表\ncanva.com', target: 'canva.com', documentLang: 'zh-Hans',
  });
  assert.equal(scope.hasTarget, true, '空态的已存列表选择器里就列着目标 —— 正向半边独自不够用');
  assert.equal(scope.emptyState, 'yes');
  assert.equal(scope.listPickerVisible, true);
  assert.equal(scope.ok, false);
});

test('英文空态落地页不再被判成 ok —— 实例 4 换个语言的原样复现', () => {
  const scope = classifyTargetScope({
    text: 'Create a new list\ncanva.com', target: 'canva.com', documentLang: 'en-US',
  });
  assert.equal(scope.emptyState, 'yes');
  assert.equal(scope.emptyStateMarkerLocale, 'en');
  assert.equal(scope.ok, false, '英文空态必须和中文空态一样被拦下');
});

test('没匹配到标记，但 locale 不在覆盖表里 → unknown，不是 ok', () => {
  const scope = classifyTargetScope({
    text: 'Créer une nouvelle liste\ncanva.com', target: 'canva.com', documentLang: 'fr-FR',
  });
  assert.equal(scope.localeCovered, false);
  assert.equal(scope.emptyState, 'unknown', '「没匹配到」不等于「不在空态」');
  assert.equal(scope.ok, false, '拿不准就显式失败，不许默认通过');
});

test('locale 覆盖得到、且没有空态标记 → 正常放行', () => {
  const zh = classifyTargetScope({ text: 'canva.com 概览', target: 'canva.com', documentLang: 'zh-Hans' });
  assert.equal(zh.emptyState, 'no');
  assert.equal(zh.ok, true);
  const en = classifyTargetScope({ text: 'canva.com Overview', target: 'canva.com', documentLang: 'en' });
  assert.equal(en.ok, true);
  // 正向半边不成立时照旧不通过。
  assert.equal(classifyTargetScope({ text: 'other.com', target: 'canva.com', documentLang: 'en' }).ok, false);
});

test('locale 从 URL 段里也能取到，两者都取不到就是 unknown', () => {
  assert.equal(detectUiLocale({ documentLang: 'zh-Hans' }), 'zh-Hans');
  assert.equal(detectUiLocale({ pathname: '/zh-Hans/analytics/traffic/' }), 'zh-Hans');
  assert.equal(detectUiLocale({}), '');
  assert.equal(primaryLanguageSubtag('zh-Hans'), 'zh');
  assert.equal(primaryLanguageSubtag('en_US'), 'en');
  const blind = classifyTargetScope({ text: 'canva.com', target: 'canva.com' });
  assert.equal(blind.emptyState, 'unknown');
  assert.equal(blind.ok, false, '连 locale 都读不到时，否定半边根本没有依据');
});

test('新 locale 的正确接法是补标记，不是让判据默认通过', () => {
  const markers = [...EMPTY_STATE_MARKERS, { locale: 'fr', marker: 'Créer une nouvelle liste' }];
  assert.equal(
    classifyTargetScope({ text: 'Créer une nouvelle liste\ncanva.com', target: 'canva.com', documentLang: 'fr', markers }).emptyState,
    'yes',
  );
  assert.equal(
    classifyTargetScope({ text: 'canva.com 概览', target: 'canva.com', documentLang: 'fr', markers }).ok,
    true,
  );
});

// ---------------------------------------------------------------------------
// 判定名与端到端
// ---------------------------------------------------------------------------
test('三个判定名，只有两个是结果，且先查 data-not-in-table', () => {
  const ok = { admissible: true };
  assert.equal(classifyAbsence({ ...ok, anchoredReady: true, noTableStructuralTwiceRunning: true }), 'data-not-in-table');
  assert.equal(classifyAbsence({ ...ok, noTableStructuralTwiceRunning: true }), 'no-table-structural');
  assert.equal(classifyAbsence({ ...ok, budgetExhausted: true }), 'no-table');
  assert.equal(classifyAbsence(ok), 'inconclusive');
});

test('闸门没过 ⇒ 一律 inconclusive，绝不输出 no-table 或 empty', () => {
  // 今天这轮扫描的每一种输入，闸门后都只能是 inconclusive。
  for (const admissible of [false, undefined, null, 'true', 1]) {
    assert.equal(classifyAbsence({ admissible, budgetExhausted: true }), 'inconclusive');
    assert.equal(classifyAbsence({ admissible, noTableStructuralTwiceRunning: true }), 'inconclusive');
    assert.equal(classifyAbsence({ admissible, anchoredReady: true }), 'inconclusive');
  }
  assert.equal(classifyAbsence(), 'inconclusive', '什么都不传也不许分类');
});

test('端到端：英文空态落地页是一个完美的 noTable===true，仍然不许过', () => {
  const main = element('main', {}, [
    svgLabel('12'), svgLabel('34'), svgLabel('56'),
    exportButton('Export'),
    element('button', {}, 'Create a new list'),
    element('div', {}, 'canva.com'),
  ]);
  const document = makeDocument({ body: element('body', {}, [main]), lang: 'en-US' });
  const probe = readReportProbe(document, { target: 'canva.com' });
  const verdict = classifyReportProbe(probe);
  assert.equal(probe.noTable, true);
  assert.equal(verdict.scope.emptyState, 'yes');
  assert.equal(verdict.onTarget, false);
  assert.equal(verdict.noTableStructural, false, '空态落地页不许拿到结构判定');
});

test('可见性只记录，不参与任何判定', () => {
  const main = element('main', {}, [svgLabel('1'), svgLabel('2'), svgLabel('3'), exportButton()]);
  const hidden = makeDocument({ body: element('body', {}, [main]), lang: 'zh', visibilityState: 'hidden' });
  const probe = readReportProbe(hidden, { target: 'canva.com' });
  assert.equal(probe.visibilityStateAtVerdict, 'hidden');
  assert.equal(probe.hasFocus, false);
  assert.equal(isNoTableStructural({ ...probe, admissible: true, onTarget: true }), true,
    'hidden 不得否决结构判定');
});

// ---------------------------------------------------------------------------
// 穿透 shadow DOM：2026-08-29 的根因
//
// 同一页同一刻：`body.innerText` 59 字符 / 深层 1,605,054 字符 / 44 个 shadow root。
// 下面这个假页面是那件事的最小复现——报表区的表格挂在 shadow root 里，浅层探针
// 读到 `noTable: true`，穿透探针读到 `noTable: false`。
// ---------------------------------------------------------------------------
function pageWithShadowReport() {
  const cell = (value) => element('td', {}, value);
  const table = element('table', {}, [
    element('tr', {}, [cell('canva.com'), cell('7.9亿'), cell('84.26%')]),
  ]);
  const host = attachShadow(element('sm-report-grid', {}, []), [table]);
  const report = element('section', { 'data-testid': 'report-region' }, [host]);
  // 导航壳里的 12 个导出按钮，也在 shadow DOM 里 —— 这正是 daily-trends 那个
  // 「内容区空白但 exportBtns=12」的形状。
  const navShell = attachShadow(
    element('snav-sidebar', {}, []),
    Array.from({ length: 12 }, () => exportButton('导出')),
  );
  return { body: element('body', {}, [element('main', {}, [navShell, report])]) };
}

test('浅层探针在 shadow DOM 前失明，穿透探针读得到，两个读数都要输出', () => {
  const { body } = pageWithShadowReport();
  const probe = readReportProbe(
    makeDocument({ body, lang: 'zh-Hans' }),
    { scopeSelector: '[data-testid="report-region"]', target: 'canva.com' },
  );
  assert.equal(probe.deepProbe, true, '探针必须自报它是穿透读的');

  // 浅层：报表区里一个 table、一个单元格都看不到 —— 就是今天那份 `tables:0, cells:0`。
  assert.equal(probe.lightDom.tables, 0);
  assert.equal(probe.lightDom.filledCells, 0);
  assert.equal(probe.lightDom.textLength, 0);

  // 深层：表在、三个非空单元格在。
  assert.equal(probe.deep.tables, 1);
  assert.equal(probe.deep.filledCells, 3);
  assert.ok(probe.deep.textLength > 0);

  // 承重字段绑深层。浅层会得出「这条路由没有表格」，那正是被作废的那 9 条结论。
  assert.equal(probe.noTable, false, '穿透之后表是在的 —— no-table 是失明的产物');
  assert.equal(probe.filledCells, 3);
  assert.ok(probe.deepText.includes('7.9亿'));

  // 差值本身是诊断信号：这一页有多少东西藏在 shadow DOM 里。
  assert.equal(probe.hiddenBehindShadow.tables, 1);
  assert.equal(probe.hiddenBehindShadow.filledCells, 3);
  assert.ok(probe.hiddenBehindShadow.textLength > 0);
});

test('注入不进穿透遍历时，探针必须自报 deepProbe:false 而不是悄悄退回浅层', () => {
  const { body } = pageWithShadowReport();
  const probe = readReportProbe(
    makeDocument({ body }),
    { scopeSelector: '[data-testid="report-region"]', deep: null },
  );
  assert.equal(probe.deepProbe, false);
  assert.equal(probe.noTable, true, '浅层确实读不到那张表');
  assert.equal(isNoTableStructural({ ...probe, admissible: true, onTarget: true }), false,
    'deepProbe:false 的读数一律不许出结构判定');
});

// ---------------------------------------------------------------------------
// 分类之前的硬闸门：路由 / 页头 / 内容区
// ---------------------------------------------------------------------------
const ADMISSIBLE = {
  landedUrl: 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&searchType=domain',
  requestedPath: '/analytics/traffic/top-pages/',
  headerTarget: 'canva.com',
  requestedTarget: 'canva.com',
  deepText: '主要页面 /design/ 35.74% 6.1亿',
  filledCells: 900,
  deepProbe: true,
  scopeResolved: true,
  scopeIsUnverifiedDefault: false,
};

test('三条闸门全过才 admissible', () => {
  const gate = classifyAdmissibility(ADMISSIBLE);
  assert.deepEqual(gate.reasons, []);
  assert.equal(gate.admissible, true);
  assert.equal(gate.contentEvidence.kind, 'filled-cells');
});

test('闸门 1 —— 落地 URL 的 path 必须等于请求的路由（销售页那次）', () => {
  // 深链域名写错（www.semrush.com 不是授权基址 sem.proxy.example.com）**不报错**：
  // 渲染骨架 → 弹到 /analytics/traffic/（公开营销页）→ 再弹到 overview。
  const gate = classifyAdmissibility({
    ...ADMISSIBLE,
    landedUrl: 'https://www.semrush.com/analytics/traffic/',
    deepText: 'Traffic Analytics: Estimate Any Website\u2019s Traffic 100%',
    filledCells: 0,
  });
  assert.equal(gate.admissible, false);
  assert.ok(gate.reasons.includes('path-drift'), JSON.stringify(gate.reasons));
  assert.equal(classifyAbsence({ admissible: gate.admissible, budgetExhausted: true }), 'inconclusive');

  assert.equal(checkLandedRoute({ landedUrl: '/relative', requestedPath: '/x' }).reason, 'landing-url-unparsable');
  // 尾斜杠不作数。
  assert.equal(checkLandedRoute({
    landedUrl: 'https://sem.proxy.example.com/analytics/traffic/top-pages', requestedPath: '/analytics/traffic/top-pages/',
  }).ok, true);
});

test('闸门 2 —— 页头的域名必须等于请求的目标（mmradar.gg 那次）', () => {
  // 弹完之后标签页停在 mmradar.gg 的域名概览：23 个非空单元格、AS 22。
  // 任何当时读到 cells > 0 的探针，都会把 mmradar.gg 的数记到 canva.com 名下。
  const gate = classifyAdmissibility({ ...ADMISSIBLE, headerTarget: 'mmradar.gg', filledCells: 23 });
  assert.equal(gate.admissible, false);
  assert.ok(gate.reasons.includes('header-target-mismatch'));
  // 页头读不到 ⇒ 同样不放行。这里和 verifyReportTarget 的 unknown 口径故意不同：
  // 这是最后一道闸门，后面没有别的东西兜着了。
  const unknown = classifyAdmissibility({ ...ADMISSIBLE, headerTarget: '' });
  assert.equal(unknown.admissible, false);
  assert.ok(unknown.reasons.includes('header-target-unknown'));
  assert.equal(checkHeaderTarget({ headerTarget: 'WWW.Canva.com.', requestedTarget: 'canva.com' }).ok, true);
});

test('闸门 3 —— 内容区非空，地板是兜底、正向证据才是判据', () => {
  // 今天的实测形态：整页 innerText 59 字符，持续 150 秒。
  const blank = classifyAdmissibility({ ...ADMISSIBLE, deepText: 'x'.repeat(59), filledCells: 0 });
  assert.equal(blank.admissible, false);
  assert.ok(blank.reasons.includes('content-below-floor'));
  assert.ok(blank.reasons.includes('no-content-evidence'));
  assert.equal(CONTENT_FLOOR_CHARS, 60, '地板 = 已知空壳 59 字符 + 1，是观测下界不是估计');

  // 过了地板但没有正向证据 ⇒ 仍然不放行。**地板只会把结论往 inconclusive 推。**
  const chrome = classifyAdmissibility({ ...ADMISSIBLE, deepText: 'y'.repeat(5000), filledCells: 0 });
  assert.equal(chrome.admissible, false);
  assert.deepEqual(chrome.reasons, ['no-content-evidence']);

  // 三条正向证据。
  assert.equal(classifyContentEvidence({ filledCells: 1 }).kind, 'filled-cells');
  assert.equal(classifyContentEvidence({ deepText: '访问量 7.9亿' }).kind, 'value-token');
  assert.equal(classifyContentEvidence({ deepText: '未找到结果' }).kind, 'rendered-empty-state',
    '页面自己渲染的空态是页面产出的事实，必须算作内容区已渲染');
  assert.equal(classifyContentEvidence({ deepText: '摘要 导出 访问量' }).has, false,
    '光有标签不算 —— 那是空壳');
});

test('闸门 3 的两个前提：穿透读数 + 报表区根已实测', () => {
  const shallow = classifyAdmissibility({ ...ADMISSIBLE, deepProbe: false });
  assert.ok(shallow.reasons.includes('shallow-probe'));
  const unbound = classifyAdmissibility({ ...ADMISSIBLE, scopeResolved: false });
  assert.ok(unbound.reasons.includes('scope-unresolved'));
  const guessed = classifyAdmissibility({ ...ADMISSIBLE, scopeIsUnverifiedDefault: true });
  assert.ok(guessed.reasons.includes('scope-unverified-default'),
    '`main` 是 DOM 惯例不是实测结论 —— 绑在猜的根上不算绑上');
});

test('对照组：top-pages（记录 850 格）今天读到 0 格，分类零区分力', () => {
  // 一条**已知有数据**的路由，和那 9 条「无表格」在浅层探针下读出来完全一样。
  const blindReading = {
    landedUrl: 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&searchType=domain',
    requestedPath: '/analytics/traffic/top-pages/',
    headerTarget: 'canva.com', requestedTarget: 'canva.com',
    deepText: 'x'.repeat(59), filledCells: 0, deepProbe: false,
    scopeResolved: false, scopeIsUnverifiedDefault: true,
  };
  const gate = classifyAdmissibility(blindReading);
  assert.equal(gate.admissible, false);
  assert.equal(classifyAbsence({ admissible: gate.admissible, budgetExhausted: true }), 'inconclusive',
    '这一读本该是 inconclusive，而不是 no-table');
});

test('端到端：闸门跑在分类之前，不 admissible 时 verdict 就是 inconclusive', () => {
  const { body } = pageWithShadowReport();
  const probe = readReportProbe(makeDocument({ body, lang: 'zh-Hans' }), {
    scopeSelector: '[data-testid="report-region"]', target: 'canva.com',
  });
  const blind = classifyReportProbe({
    ...probe,
    landedUrl: 'https://www.semrush.com/analytics/traffic/',
    requestedPath: '/analytics/traffic/top-pages/',
    headerTarget: 'mmradar.gg', requestedTarget: 'canva.com',
    budgetExhausted: true,
  });
  assert.equal(blind.admissible, false);
  assert.equal(blind.noTableStructural, false);
  assert.equal(blind.verdict, 'inconclusive');
  assert.ok(blind.gate.reasons.includes('path-drift'));
  assert.ok(blind.gate.reasons.includes('header-target-mismatch'));
});

// ---------------------------------------------------------------------------
// SKILL.md 的 <correct> 块是实盘 agent 直接抄进页面执行的那一份。它和这个模块
// 只要有一处漂回旧形状，下面就红。
// ---------------------------------------------------------------------------
test('SKILL.md 的判据片段不许漂回旧形状', async () => {
  const { readFile } = await import('node:fs/promises');
  const skill = await readFile(new URL('../SKILL.md', import.meta.url), 'utf8');

  // 3：spinnerGone 这个否定式、猜类名的门必须已经不在判定式里。
  assert.doesNotMatch(skill, /spinnerGone:/, 'spinnerGone 已降级，不该再作为字段被算出来');
  assert.doesNotMatch(skill, /done\.spinnerGone/, 'renderFinished 不许再由 spinnerGone 把关');
  assert.match(skill, /renderFinished = \(done\.paginator \|\| done\.rowCount\) && !done\.ariaBusy/);
  assert.match(skill, /loadingClassPresent:/, '猜类名那半必须仍被记录下来');

  // 4：空态标记必须是按 locale 声明的表，且有 unknown 这一态。
  assert.match(skill, /EMPTY_STATE_MARKERS = \[/);
  assert.match(skill, /Create a new list/);
  assert.match(skill, /emptyState === 'no'/, "ok 必须绑到 'no'，而不是「没匹配到标记」");
  assert.doesNotMatch(skill, /ok: t\.includes\('canva\.com'\) && !emptyStateMarker/);

  // 1 + 2：作用域必须是参数，且默认值自报「未验证」。
  assert.match(skill, /SCOPE_SELECTOR = 'main';\s+\/\/ <- UNVERIFIED DEFAULT/);
  assert.match(skill, /scopeIsUnverifiedDefault: SCOPE_SELECTOR === 'main'/);
  assert.doesNotMatch(
    skill,
    /const structural = \(\(\) => \{\n  const root = document\.querySelector\('main'\)/,
    '结构探针不许再把 main 写死',
  );

  // 5（2026-08-29 根因）：所有计数必须穿透 shadow DOM，浅层读数只许留在 lightDom 里。
  assert.match(skill, /noTable: deepQueryAll\(root, 'table, \[role="grid"\]'\)\.length === 0/,
    '结构探针的 noTable 必须走穿透遍历');
  assert.match(skill, /deepProbe: true,\s+\/\/ this reading pierced shadow DOM/);
  assert.match(skill, /lightDom: \{/, '浅层读数必须保留并与深层并列输出');
  assert.doesNotMatch(skill, /noTable: root\.querySelectorAll\('table, \[role="grid"\]'\)\.length === 0/,
    '不许漂回浅层计数');
  assert.match(skill, /1,605,054/, '根因的三个实测数字要留在文档里');
  assert.match(skill, /scripts\/lib-deep-dom\.mjs/, '穿透遍历只有一份，必须被指到');

  // 6：两个伪证据退役 —— 不许再出现在任何判定式里。
  assert.doesNotMatch(skill, /structural\.chartHydrated >= 3/, 'chartHydrated 已退役');
  assert.doesNotMatch(skill, /structural\.exportBtns >= 1/, 'exportBtns 已退役');
  assert.match(skill, /advisoryOnly: \['chartHydrated', 'exportBtns'/, '退役了仍要记录');
  assert.match(skill, /exportBtns: 12/, 'daily-trends 那个 12 是这条更正的证据');

  // 7：硬闸门必须跑在分类之前，且三条都在。
  assert.match(skill, /const noTableStructural = gate\.admissible && structural\.deepProbe &&/);
  assert.match(skill, /const absence = !gate\.admissible \? 'inconclusive'/,
    '闸门必须是 absence 判定的第一个分支');
  for (const reason of ['path-drift', 'header-target-mismatch', 'header-target-unknown',
    'no-content-evidence', 'content-below-floor', 'shallow-probe']) {
    assert.match(skill, new RegExp(`'${reason}'`), `闸门的失败原因 ${reason} 必须写出来`);
  }
  // 阈值必须自称兜底，而且从属于正向判据。
  assert.match(skill, /BACKSTOP SUBORDINATE TO THE POSITIVE HALF/);
  assert.match(skill, /rendered-empty-state/,
    '页面自己渲染的空态必须算作内容证据，否则真空报表会永远 inconclusive');
});
