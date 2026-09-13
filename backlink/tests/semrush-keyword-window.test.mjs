// semrush-keyword.mjs 虚拟屏幕窗口接入（2026-09-14 补齐）。
//
// 同一缺口、同一批修复，见 semrush-report-window.test.mjs 顶部注释——这里是
// semrush-keyword.mjs 的对应测试。脚本顶层同样直接执行（launchTool 等），
// 不能整体 import，沿用 semrush-keyword-scope.test.mjs / semrush-keyword-summary.test.mjs
// 的 vm 抽取 + 正则钉接线点手法。
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { plainAutomationSummary, VIRTUAL_DISPLAY_WINDOW } from '../scripts/lib-automation-window.mjs';

const source = await readFile(new URL('../scripts/semrush-keyword.mjs', import.meta.url), 'utf8');

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

test('launchTool() receives window/fallbackWindow and automation is captured right after', () => {
  assert.match(
    source,
    /const launched = await launchTool\(\{[\s\S]*?window: launchWindow,\s*\n\s*fallbackWindow: windowStrategy\.fallbackWindowMode,[\s\S]*?\}\);\s*\nautomation = launched\.automationWindow \|\| null;/,
  );
  // 旧版直接透传 flags.window——接入虚拟屏幕之后不应该再原样出现这一行。
  assert.doesNotMatch(source, /window: flags\.window,/);
});

test('ensureVisible is called before both the bulk-mode navigation and the per-keyword navigation', () => {
  assert.match(source, /await automation\?\.ensureVisible\('bulk-navigation'\);\s*\n\s*await gotoInTool\(\s*\n\s*launched\.evalPage,/);
  assert.match(source, /await automation\?\.ensureVisible\('keyword-navigation'\);\s*\n\s*await gotoInTool\(launched\.evalPage, url,/);
});

test('the per-keyword polling read gates recovery on lastVis, captures vis, and records every read', () => {
  assert.match(source, /if \(lastVis === 'hidden'\) await automation\?\.ensureVisible\('keyword-read-hidden'\);/);
  assert.match(source, /vis: document\.visibilityState,/);
  assert.match(source, /lastVis = cap\?\.vis \?\? lastVis;/);
  assert.match(source, /automation\?\.recordRead\(\{ vis: cap\?\.vis \?\? null, label: 'keyword-read' \}\);/);
});

test('the top-level printJson output and the per-keyword error row both carry automationWindow', () => {
  assert.match(source, /subscription: \{ expiry: launched\.state\.expiry, daysLeft: launched\.state\.daysLeft, warning: warn \|\| null \},\s*\n\s*automationWindow: automationWindowOutput\(\),\s*\n\s*results,/);
  assert.match(
    source,
    /row = \{ keyword: kw, db: database \|\| null, status: 'error', error: redactSecrets\(error\.message\), evidence: scene, automationWindow: automationWindowOutput\(error\?\.automationWindow\) \};/,
  );
});

// ---------------------------------------------------------------------------
// automationWindowOutput() 本身是纯函数，但引用了模块级自由变量
// (automation/windowStrategy/launchWindow) 和两个 import——用 vm 抽取，
// 自由变量作为 context 全局量注入，逐个分支验证（与 semrush-report-window.test.mjs
// 完全对称，因为两个脚本这一段函数体是逐字复制的）。
// ---------------------------------------------------------------------------
function extractFunction(src, name) {
  const re = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\([^)]*\\)\\s*\\{`);
  const m = re.exec(src);
  assert.ok(m, `could not find function ${name}() in semrush-keyword.mjs`);
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
  const fakeSummary = { mode: 'virtual-display', strategy: 'dedicated', windowMode: 'dedicated' };
  const fn = loadAutomationWindowOutput({
    automation: { summary: () => fakeSummary },
    windowStrategy: { strategy: VIRTUAL_DISPLAY_WINDOW, fallbackWindowMode: 'active' },
    launchWindow: VIRTUAL_DISPLAY_WINDOW,
  });
  assert.equal(fn(), fakeSummary);
});

test('automationWindowOutput: launchTool threw with an automationWindow already attached to the error → that summary wins over a synthesized placeholder', () => {
  const errorSummary = { mode: 'fallback', fallbackReason: 'no-virtual-display' };
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
    windowStrategy: { strategy: 'plain', fallbackWindowMode: 'foreground' },
    launchWindow: 'foreground',
  });
  const out = fn(null);
  assert.deepEqual(out, plainAutomationSummary({ windowMode: 'foreground', reason: 'explicit-window-mode' }));
});

// ---------------------------------------------------------------------------
// --self-test must remain unaffected: it exits before launchTool() is ever called.
// ---------------------------------------------------------------------------
test('self-test path never reaches launchTool()', () => {
  const selfTestStart = source.indexOf("if (flags['self-test']) {");
  const selfTestEnd = source.indexOf('const launched = await launchTool({');
  assert.ok(selfTestStart >= 0 && selfTestEnd > selfTestStart, 'could not locate the --self-test block relative to launchTool()');
  const body = source.slice(selfTestStart, selfTestEnd);
  assert.match(body, /process\.exit\(0\);/, 'self-test must exit before falling through to launchTool()');
});
