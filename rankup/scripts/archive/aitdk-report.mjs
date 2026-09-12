#!/usr/bin/env node
/**
 * aitdk-report.mjs — 通过 Chrome DevTools Protocol (CDP) 连接用户正在运行的 Chrome，
 * 驱动 AITDK 扩展（Alt+D 打开的侧面板）对指定 URL 做 SEO 检测，导出为 JSON。
 *
 * 用法:
 *   node aitdk-report.mjs <url> [url2] [url3] ... [--port 9222] [--output report.json] [--sections Overview,Headings,...]
 *
 * 前置条件: Chrome 必须以调试端口启动，例如:
 *   /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
 * 且用户已安装并登录 AITDK 扩展。
 *
 * 依赖: chrome-remote-interface（本脚本会自动尝试全局 node_modules 兜底加载，
 * 不要求项目目录下有 node_modules）。
 */

import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';

// ---------- 解析 chrome-remote-interface（本地优先，找不到则回退到全局安装）----------
async function loadCDP() {
  try {
    const mod = await import('chrome-remote-interface');
    return mod.default ?? mod;
  } catch (err) {
    // 回退：从全局 node_modules 加载
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf8' }).trim();
      const require = createRequire(import.meta.url);
      const CDP = require(resolvePath(globalRoot, 'chrome-remote-interface'));
      return CDP;
    } catch (fallbackErr) {
      console.error('[aitdk-report] 找不到 chrome-remote-interface，请先安装:');
      console.error('  npm install -g chrome-remote-interface');
      console.error('原始错误:', err.message);
      console.error('回退错误:', fallbackErr.message);
      process.exit(1);
    }
  }
}

// ---------- CLI 参数解析 ----------
function parseArgs(argv) {
  const urls = [];
  let port = 9222;
  let output = null;
  let sections = null; // null = 全部
  let timeoutMs = 45000;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') {
      port = Number(argv[++i]);
    } else if (a === '--output') {
      output = argv[++i];
    } else if (a === '--sections') {
      sections = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    } else if (a === '--timeout') {
      timeoutMs = Number(argv[++i]);
    } else if (a.startsWith('--')) {
      console.error(`[aitdk-report] 未知参数: ${a}`);
      process.exit(1);
    } else {
      urls.push(a);
    }
  }

  if (urls.length === 0) {
    console.error('用法: node aitdk-report.mjs <url> [url2 ...] [--port 9222] [--output report.json] [--sections Overview,Headings]');
    process.exit(1);
  }

  return { urls, port, output, sections, timeoutMs };
}

const ALL_SECTIONS = [
  'Overview',
  'Traffic',
  'Backlinks',
  'Adsense',
  'Issues',
  'GEO',
  'SERP',
  'Density',
  'Headings',
  'Images',
  'Links',
  'Social',
  'Hreflangs',
  'Structured',
  'Whois',
  'Archive',
  'Similarweb',
  'Semrush',
  'Ahrefs',
  'PageSpeed',
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------- 检测 Chrome 调试端口是否可用 ----------
async function checkChromeDebugPort(port) {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`[aitdk-report] 无法连接 Chrome 调试端口 127.0.0.1:${port}`);
    console.error('请先用调试端口启动 Chrome，例如:');
    console.error('  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222');
    console.error('（如果 Chrome 已经在跑但没开调试端口，需要先完全退出再用上面的命令重新启动）');
    console.error('底层错误:', err.message);
    process.exit(1);
  }
}

// ---------- 在页面 frameTree 中递归查找目标 frame ----------
function findFrame(tree, urlPart) {
  if (tree.frame.url && tree.frame.url.includes(urlPart)) return tree.frame;
  for (const child of tree.childFrames || []) {
    const found = findFrame(child, urlPart);
    if (found) return found;
  }
  return null;
}

// ---------- 对单个 URL 跑一次 AITDK 分析 ----------
async function analyzeUrl(CDP, { url, port, sections, timeoutMs }) {
  const result = {
    url,
    fetchedAt: new Date().toISOString(),
    sections: {},
    errors: [],
  };

  let client;
  try {
    client = await CDP({ port });
  } catch (err) {
    result.errors.push(`CDP 连接失败: ${err.message}`);
    return result;
  }

  const { Page, Runtime, Input, DOM } = client;

  // 记录每个新建执行上下文，便于之后按 frame 匹配
  const executionContexts = []; // { id, frameId, origin, name }
  Runtime.executionContextCreated(({ context }) => {
    executionContexts.push({
      id: context.id,
      frameId: context.auxData?.frameId,
      origin: context.origin,
      name: context.name,
    });
  });
  Runtime.executionContextDestroyed(({ executionContextId }) => {
    const idx = executionContexts.findIndex((c) => c.id === executionContextId);
    if (idx >= 0) executionContexts.splice(idx, 1);
  });
  Runtime.executionContextsCleared(() => {
    executionContexts.length = 0;
  });

  try {
    await Page.enable();
    await Runtime.enable();
    await DOM.enable();

    // 1) 导航
    await Page.navigate({ url });
    await Page.loadEventFired();
    await sleep(1500); // 给页面 JS / 扩展注入一点缓冲时间

    // 2) 触发 Alt+D（模拟扩展快捷键打开侧面板）
    await triggerAltD(Input);

    // 3) 轮询等待 AITDK iframe 出现
    const aitdkFrame = await waitForAitdkFrame(Page, timeoutMs, findFrame);
    if (!aitdkFrame) {
      result.errors.push(
        'AITDK iframe 在超时时间内未出现。可能原因: 扩展未安装/未启用、Alt+D 快捷键被占用、' +
          '或该扩展在此页面被拦截（如 chrome:// 页面）。'
      );
      await client.close();
      return result;
    }
    result.aitdkFrameId = aitdkFrame.id;
    result.aitdkFrameUrl = aitdkFrame.url;

    // 4) 等待该 frame 的执行上下文出现
    const ctx = await waitForFrameContext(executionContexts, aitdkFrame.id, timeoutMs);
    if (!ctx) {
      result.errors.push('未能获取 AITDK iframe 的 Runtime executionContext（可能是跨域隔离导致未创建，或加载太慢）。');
      await client.close();
      return result;
    }

    // 5) 再等一会儿，让 AITDK 完成首轮分析（Overview 数据渲染）
    await sleep(3000);

    const wantedSections = sections && sections.length ? sections : ALL_SECTIONS;

    // 6) 提取 Overview（默认打开的那个 section）
    const overviewData = await extractCurrentSection(Runtime, ctx.id, 'Overview');
    if (wantedSections.includes('Overview')) {
      result.sections.Overview = overviewData;
    }

    // 7) 依次点击左侧菜单，提取其余 section
    for (const sectionName of wantedSections) {
      if (sectionName === 'Overview') continue;
      try {
        const clicked = await clickSidebarSection(Runtime, ctx.id, sectionName);
        if (!clicked.ok) {
          result.sections[sectionName] = { error: `未找到菜单项: ${sectionName}`, raw: null };
          continue;
        }
        await sleep(1200); // 给该 section 数据加载/渲染时间（部分 section 需要额外网络请求）
        const data = await extractCurrentSection(Runtime, ctx.id, sectionName);
        result.sections[sectionName] = data;
      } catch (err) {
        result.sections[sectionName] = { error: err.message, raw: null };
      }
    }

    await client.close();
  } catch (err) {
    result.errors.push(`分析过程出错: ${err.message}`);
    try {
      await client.close();
    } catch {
      /* noop */
    }
  }

  return result;
}

// ---------- 模拟 Alt+D 按键 ----------
async function triggerAltD(Input) {
  const modifiers = 1; // CDP: Alt = 1, Ctrl = 2, Meta/Cmd = 4, Shift = 8
  await Input.dispatchKeyEvent({
    type: 'rawKeyDown',
    key: 'Alt',
    code: 'AltLeft',
    modifiers,
  });
  await Input.dispatchKeyEvent({
    type: 'keyDown',
    key: 'd',
    code: 'KeyD',
    modifiers,
    text: 'd',
  });
  await Input.dispatchKeyEvent({
    type: 'keyUp',
    key: 'd',
    code: 'KeyD',
    modifiers,
  });
  await Input.dispatchKeyEvent({
    type: 'keyUp',
    key: 'Alt',
    code: 'AltLeft',
    modifiers: 0,
  });
}

// ---------- 轮询 frameTree 直到出现 extension.aitdk.com 的 frame ----------
async function waitForAitdkFrame(Page, timeoutMs, findFrameFn) {
  const start = Date.now();
  const pollInterval = 500;
  while (Date.now() - start < timeoutMs) {
    try {
      const { frameTree } = await Page.getFrameTree();
      const frame = findFrameFn(frameTree, 'extension.aitdk.com');
      if (frame) return frame;
    } catch {
      /* Page 可能还没就绪，继续轮询 */
    }
    await sleep(pollInterval);
  }
  return null;
}

// ---------- 轮询等待某 frameId 对应的 executionContext 出现 ----------
async function waitForFrameContext(executionContexts, frameId, timeoutMs) {
  const start = Date.now();
  const pollInterval = 300;
  while (Date.now() - start < timeoutMs) {
    const ctx = executionContexts.find((c) => c.frameId === frameId);
    if (ctx) return ctx;
    await sleep(pollInterval);
  }
  return null;
}

// ---------- 在 AITDK iframe 的执行上下文里点击左侧菜单某个 section ----------
async function clickSidebarSection(Runtime, contextId, sectionName) {
  const expression = `
    (function() {
      const target = ${JSON.stringify(sectionName)};
      // AITDK 左侧菜单的具体 DOM 结构未知，采用多重启发式查找可点击的菜单项:
      // 1) 精确文本匹配的常见可点击元素
      // 2) 忽略大小写 / 前后空白的宽松匹配
      const candidates = Array.from(
        document.querySelectorAll('a, button, li, div[role="button"], div[role="tab"], [class*="menu"] *, [class*="nav"] *, [class*="sidebar"] *')
      );
      function norm(s) { return (s || '').trim().replace(/\\s+/g, ' '); }
      let el = candidates.find((e) => norm(e.textContent) === target && e.children.length === 0);
      if (!el) {
        el = candidates.find((e) => norm(e.textContent).toLowerCase() === target.toLowerCase() && e.children.length === 0);
      }
      if (!el) {
        // 退而求其次：文本包含目标词的最小可点击祖先
        const textNodeHolders = candidates.filter((e) => norm(e.textContent).toLowerCase().includes(target.toLowerCase()));
        // 选择文本长度最短的（越具体越好）
        textNodeHolders.sort((a, b) => norm(a.textContent).length - norm(b.textContent).length);
        el = textNodeHolders[0];
      }
      if (!el) return { ok: false };
      el.scrollIntoView({ block: 'center' });
      el.click();
      return { ok: true, matchedText: norm(el.textContent) };
    })()
  `;
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: false,
  });
  if (exceptionDetails) {
    throw new Error(`点击 section [${sectionName}] 时出错: ${exceptionDetails.text}`);
  }
  return result.value || { ok: false };
}

// ---------- 提取当前 AITDK 面板显示的数据（结构化优先，回退全文本）----------
async function extractCurrentSection(Runtime, contextId, sectionName) {
  const expression = `
    (function() {
      function norm(s) { return (s || '').trim().replace(/\\s+/g, ' '); }

      const out = { structured: {}, tables: [], lists: [], headings: [], fullText: '' };

      // --- 全文本兜底 ---
      out.fullText = norm(document.body ? document.body.innerText : '');

      // --- 标题结构 (h1~h4) ---
      document.querySelectorAll('h1, h2, h3, h4').forEach((h) => {
        const t = norm(h.textContent);
        if (t) out.headings.push({ tag: h.tagName.toLowerCase(), text: t });
      });

      // --- dl/dt/dd 键值对（常见于 Overview 类信息面板）---
      document.querySelectorAll('dl').forEach((dl) => {
        const dts = Array.from(dl.querySelectorAll('dt')).map((e) => norm(e.textContent));
        const dds = Array.from(dl.querySelectorAll('dd')).map((e) => norm(e.textContent));
        dts.forEach((k, i) => {
          if (k) out.structured[k] = dds[i] || '';
        });
      });

      // --- label/value 常见 pattern: 两列 div，或 [class*="label"] + [class*="value"] ---
      document.querySelectorAll('[class*="label"], [class*="Label"]').forEach((labelEl) => {
        const key = norm(labelEl.textContent);
        if (!key || key.length > 60) return;
        let valueEl =
          labelEl.nextElementSibling ||
          (labelEl.parentElement ? labelEl.parentElement.querySelector('[class*="value"], [class*="Value"]') : null);
        if (valueEl) {
          const val = norm(valueEl.textContent);
          if (val && !(key in out.structured)) out.structured[key] = val;
        }
      });

      // --- table ---
      document.querySelectorAll('table').forEach((table) => {
        const rows = Array.from(table.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th, td')).map((cell) => norm(cell.textContent))
        );
        if (rows.length) out.tables.push(rows);
      });

      // --- ul/ol 列表 ---
      document.querySelectorAll('ul, ol').forEach((list) => {
        const items = Array.from(list.children)
          .map((li) => norm(li.textContent))
          .filter(Boolean);
        if (items.length) out.lists.push(items);
      });

      return out;
    })()
  `;
  const { result, exceptionDetails } = await Runtime.evaluate({
    expression,
    contextId,
    returnByValue: true,
    awaitPromise: false,
  });
  if (exceptionDetails) {
    return { error: exceptionDetails.text, sectionName };
  }
  return { sectionName, ...result.value };
}

// ---------- main ----------
async function main() {
  const { urls, port, output, sections, timeoutMs } = parseArgs(process.argv.slice(2));

  if (sections) {
    const invalid = sections.filter((s) => !ALL_SECTIONS.includes(s));
    if (invalid.length) {
      console.error(`[aitdk-report] --sections 包含未知项: ${invalid.join(', ')}`);
      console.error(`可用 section: ${ALL_SECTIONS.join(', ')}`);
      process.exit(1);
    }
  }

  await checkChromeDebugPort(port);
  const CDP = await loadCDP();

  const report = {
    generatedAt: new Date().toISOString(),
    port,
    sectionsRequested: sections || ALL_SECTIONS,
    results: [],
  };

  for (const url of urls) {
    console.error(`[aitdk-report] 分析中: ${url}`);
    const r = await analyzeUrl(CDP, { url, port, sections, timeoutMs });
    report.results.push(r);
    console.error(
      `[aitdk-report] 完成: ${url} — sections: ${Object.keys(r.sections).length}, errors: ${r.errors.length}`
    );
  }

  const json = JSON.stringify(report, null, 2);
  if (output) {
    writeFileSync(resolvePath(output), json, 'utf8');
    console.error(`[aitdk-report] 已写入: ${resolvePath(output)}`);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error('[aitdk-report] 未捕获错误:', err);
  process.exit(1);
});
