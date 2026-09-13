// semrush-report.mjs 虚拟屏幕窗口接入（2026-09-14 补齐）。
//
// 背景：semrush-overview.mjs / semrush-traffic.mjs / similarweb-*.mjs 都已经接上了
// lib-automation-window.mjs 的 automationWindow 控制器——输出带 automationWindow 字段，
// 导航/关键读数前调用 ensureVisible()，可见性读数记 recordRead()。semrush-report.mjs
// 只在 launchTool() 里透传了 --window，此外全无这套接线，是一个缺口。这里补上后同样
// 需要离线测试钉住。
//
// 与 semrush-report-scope.test.mjs 同一套手法：脚本顶层是直接执行、缺 --report/--domain
// 就 process.exit(2) 的脚本体，不能直接 import——用 vm 抽取纯函数、用正则钉住接线点。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { plainAutomationSummary, VIRTUAL_DISPLAY_WINDOW } from '../scripts/lib-automation-window.mjs';

const source = await readFile(new URL('../scripts/semrush-report.mjs', import.meta.url), 'utf8');

// ---------------------------------------------------------------------------
// 接线点：照 semrush-overview.mjs 的用法（import、windowStrategy、launchTool 的
// window/fallbackWindow、automation 赋值）逐条钉住，不许漏掉任何一个。
// ---------------------------------------------------------------------------
test('imports resolveWindowStrategy/plainAutomationSummary/VIRTUAL_DISPLAY_WINDOW from lib-automation-window.mjs', () => {
  assert.match(
    source,
    /import \{ plainAutomationSummary, resolveWindowStrategy, VIRTUAL_DISPLAY_WINDOW \} from '\.\/lib-automation-window\.mjs';/,
  );
});

test('windowStrategy is resolved from --window with fallbackWindowMode active, same as semrush-overview.mjs', () => {
  assert.match(source, /const windowStrategy = resolveWindowStrategy\(\{/);
  assert.match(source, /windowFlag: typeof flags\.window === 'string' \? flags\.window : null,/);
  assert.match(source, /fallbackWindowMode: 'active',/);
  assert.match(source, /const launchWindow = windowStrategy\.launchWindow;/);
});

test('ensureTool() passes window/fallbackWindow into launchTool() and captures automationWindow', () => {
  const start = source.indexOf('async function ensureTool()');
  const end = source.indexOf('\n}', source.indexOf('const launched = await launchTool({', start));
  assert.ok(start >= 0 && end > start, 'could not locate ensureTool()');
  const body = source.slice(start, end);
  assert.match(body, /window: launchWindow,/);
  assert.match(body, /fallbackWindow: windowStrategy\.fallbackWindowMode,/);
  assert.match(body, /automation = launched\.automationWindow \|\| null;/);
  // 旧版直接透传 flags.window——接入虚拟屏幕之后不应该再原样出现这一行。
  assert.doesNotMatch(body, /window: flags\.window,/);
});

test('ensureVisible is called before every report navigation/reload/pagination-click', () => {
  assert.match(source, /await automation\?\.ensureVisible\('report-navigation'\);\s*\n\s*await evalPage\(`\(\(\) => \{ location\.href/);
  assert.match(source, /await automation\?\.ensureVisible\('report-reload'\);\s*\n\s*await evalPage\(`\(\(\) => \{ location\.reload\(\)/);
  assert.match(source, /await automation\?\.ensureVisible\('paginate-next'\);\s*\n\s*const advance = await clickNextPage\(evalPage, pagesRead\);/);
  assert.match(source, /await automation\?\.ensureVisible\('diagnose-unrendered'\);/);
  assert.match(source, /await automation\?\.ensureVisible\('paginate-quota-probe'\);/);
});

test('the two polling reads (report body + next-page body) gate recovery on lastVis and record every read', () => {
  const hiddenGates = source.match(/if \(lastVis === 'hidden'\) await automation\?\.ensureVisible\('[\w-]+'\);/g) || [];
  assert.equal(hiddenGates.length, 2, `expected exactly 2 hidden-gated recovery sites, found: ${JSON.stringify(hiddenGates)}`);
  const recordReads = source.match(/automation\?\.recordRead\(\{ vis: cap\?\.vis \?\? null, label: '[\w-]+' \}\);/g) || [];
  assert.equal(recordReads.length, 2, `expected exactly 2 recordRead sites, found: ${JSON.stringify(recordReads)}`);
  // 两处读数的 JS 里都要带 document.visibilityState，否则 recordRead 拿到的 vis 恒为 null。
  const visFields = source.match(/vis: document\.visibilityState,/g) || [];
  assert.equal(visFields.length, 2, 'both read closures must capture document.visibilityState');
});

test('both success and failure output objects carry automationWindow via automationWindowOutput()', () => {
  assert.match(source, /rawPages: spec\.paginated \? rawPages : null,\s*\n\s*automationWindow: automationWindowOutput\(\),\s*\n\s*\};/);
  assert.match(source, /status: 'unavailable', error: \{ code: 'report_failed', message: redactSecrets\(error\.message\) \},\s*\n\s*automationWindow: automationWindowOutput\(error\?\.automationWindow\),/);
});

// ---------------------------------------------------------------------------
// automationWindowOutput() 本身是纯函数，但引用了模块级自由变量
// (automation/windowStrategy/launchWindow) 和两个 import——用同一份 vm 抽取手法
// （见 semrush-report-scope.test.mjs 的 extractFunction），把这些自由变量作为
// context 全局量注入，逐个分支验证。
// ---------------------------------------------------------------------------
function extractFunction(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  assert.ok(m, `could not find function ${name}() in semrush-report.mjs`);
  let depth = 1;
  let i = m.index + m[0].length;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  return src.slice(m.index, i);
}

function loadAutomationWindowOutput({ automation, windowStrategy, launchWindow }) {
  const context = vm.createContext({
    automation, windowStrategy, launchWindow, plainAutomationSummary, VIRTUAL_DISPLAY_WINDOW,
  });
  vm.runInContext(`${extractFunction(source, 'automationWindowOutput')};this.automationWindowOutput = automationWindowOutput;`, context);
  return context.automationWindowOutput;
}

test('automationWindowOutput: virtual-display success → returns the live controller summary()', () => {
  const fakeSummary = { mode: 'virtual-display', strategy: 'osascript', windowMode: 'isolated' };
  const fn = loadAutomationWindowOutput({
    automation: { summary: () => fakeSummary },
    windowStrategy: { strategy: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode: 'active' },
    launchWindow: VIRTUAL_DISPLAY_WINDOW,
  });
  assert.equal(fn(), fakeSummary);
});

test('automationWindowOutput: launchTool threw with an automationWindow already attached to the error → that summary wins over a synthesized placeholder', () => {
  const errorSummary = { mode: 'fallback', fallbackReason: 'automation-window-has-foreign-tabs' };
  const fn = loadAutomationWindowOutput({
    automation: null,
    windowStrategy: { strategy: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode: 'active' },
    launchWindow: VIRTUAL_DISPLAY_WINDOW,
  });
  assert.equal(fn(errorSummary), errorSummary);
});

test('automationWindowOutput: virtual-display strategy but launchTool failed before ever creating a controller → plainAutomationSummary with launch-failed-before-prepare', () => {
  const fn = loadAutomationWindowOutput({
    automation: null,
    windowStrategy: { strategy: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode: 'active' },
    launchWindow: VIRTUAL_DISPLAY_WINDOW,
  });
  const out = fn(null);
  assert.deepEqual(out, plainAutomationSummary({ windowMode: 'active', reason: 'launch-failed-before-prepare' }));
});

test('automationWindowOutput: explicit non-virtual-display --window → plainAutomationSummary with explicit-window-mode and the real window mode', () => {
  const fn = loadAutomationWindowOutput({
    automation: null,
    windowStrategy: { strategy: 'plain', fallbackWindowMode: 'background' },
    launchWindow: 'background',
  });
  const out = fn(null);
  assert.deepEqual(out, plainAutomationSummary({ windowMode: 'background', reason: 'explicit-window-mode' }));
});

// ---------------------------------------------------------------------------
// --self-test must remain unaffected: it never touches ensureTool()/loadReport(),
// which is exactly why the wiring above had to be verified via source-text/vm
// extraction instead of exercising the real harness offline.
// ---------------------------------------------------------------------------
test('self-test path never calls ensureTool/loadReport (so it stays offline-safe)', () => {
  const selfTestStart = source.indexOf("if (flags['self-test']) {");
  const selfTestEnd = source.indexOf("\n// ---------- 主流程 ----------");
  assert.ok(selfTestStart >= 0 && selfTestEnd > selfTestStart, 'could not locate the --self-test block');
  const body = source.slice(selfTestStart, selfTestEnd);
  assert.doesNotMatch(body, /ensureTool\(\)/);
  assert.doesNotMatch(body, /loadReport\(/);
});
