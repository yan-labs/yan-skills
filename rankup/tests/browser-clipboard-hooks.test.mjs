// 为什么有这个文件（2026-08-29）：
//
// `chatbot-drive.browser.js` 要注入页面才能干活——
// 包一层 `navigator.clipboard.writeText`，再挂一个捕获阶段的 `copy` 监听。
// 老版本**装上就不拆**（chatbot-drive 甚至在 init() 里装、用 window.__rkHooked
// 做守卫），于是此后页面每一次复制都先经过我们的手：任何「页面复制了什么」的观测，
// 答案都来自我们自己的仪器。这正是 backlink/SKILL.md 里
// `readiness-must-bind-to-this-query` 那条 law 记的教训——注入进页面的任何东西
// 都会成为后续观测的一部分，哪怕它从没被当成判据。
//
// 三条不变量，这个文件盯住它们：
//   1. **可卸载**：grab()/capture() 走完，页面必须回到我们来之前的样子
//      （writeText 是原来那个函数、copy 监听为零、不留 window 全局）。
//   2. **每次采集前归零**：上一次的原文绝不能被读成这一次的产物。
//   3. **三种失败可分辨**：钩子没装上 / 装上了但页面没触发 / 页面换了复制实现。
//      老版本这三种全塌成一句「拿不到内容」。
//
// 纯离线：不开浏览器、不联网。做法是把**真实源码**读进来，在一个假 DOM 里
// `new Function` 执行一次——测的是仓库里那份文件本身，不是它的复刻。
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHATBOT = path.join(root, "rankup/scripts/chatbot-drive.browser.js");

/**
 * 一个刚好够跑浏览器脚本的假页面。
 *
 * `clickBehavior` 就是「页面点了复制按钮之后到底干了什么」——把四种真实世界的
 * 行为参数化：走 clipboard API、走 copy 事件、什么都不做、以及在我们之上再换一次
 * writeText 实现。
 */
function makePage({ clickBehavior = "writeText", text = "完整的 Markdown 原文", withClipboard = true, withAddEventListener = true } = {}) {
  const listeners = [];
  const passedThrough = [];
  const origWriteText = function (t) {
    passedThrough.push(t);
    return Promise.resolve();
  };
  const navigator = withClipboard ? { clipboard: { writeText: origWriteText } } : {};
  let pageOwnWriteText = null;

  const fireCopy = (payload) => {
    for (const l of [...listeners]) {
      l.fn({ clipboardData: { getData: () => payload } });
    }
  };

  const button = {
    textContent: "复制本段",
    className: "anscopy",
    click() {
      switch (clickBehavior) {
        case "writeText":
          navigator.clipboard.writeText(text);
          break;
        case "copyEvent":
          fireCopy(text);
          break;
        case "emptyCopy":
          fireCopy("");
          break;
        case "displaced":
          // 页面在我们之上又装了一层自己的实现（懒加载的复制模块常见）。
          pageOwnWriteText = function (t) {
            passedThrough.push("page:" + t);
            return Promise.resolve();
          };
          navigator.clipboard.writeText = pageOwnWriteText;
          navigator.clipboard.writeText(text);
          break;
        case "silent":
        default:
          break;
      }
    },
  };

  const answer = {
    innerText: "回答正文",
    querySelector: () => button,
    querySelectorAll: () => [button],
  };

  const document = {
    querySelectorAll: (sel) => (sel === ".msg.ai" || sel === ".answer" ? [answer] : []),
    querySelector: () => null,
    getElementById: () => null,
  };
  if (withAddEventListener) {
    document.addEventListener = (type, fn, capture) => listeners.push({ type, fn, capture });
    document.removeEventListener = (type, fn, capture) => {
      const i = listeners.findIndex((l) => l.type === type && l.fn === fn && !!l.capture === !!capture);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  const window = { setTimeout };
  return {
    window,
    document,
    navigator,
    listeners,
    passedThrough,
    origWriteText,
    pageOwn: () => pageOwnWriteText,
    setBehavior: (b) => {
      clickBehavior = b;
    },
  };
}

function load(file, page) {
  const src = readFileSync(file, "utf8");
  const fn = new Function("window", "document", "navigator", "setTimeout", src);
  fn(page.window, page.document, page.navigator, setTimeout);
  return page.window;
}

// ── 共通断言：页面被还原成我们来之前的样子 ─────────────────────────────────
function assertPageRestored(page, label) {
  assert.equal(
    page.navigator.clipboard.writeText,
    page.origWriteText,
    `${label}：writeText 没还原成原实现（钩子留在页面上了）`,
  );
  assert.equal(page.listeners.length, 0, `${label}：copy 监听没摘掉`);
  assert.equal("__cap" in page.window, false, `${label}：不许往页面写 __cap 这类全局`);
  assert.equal("__rkHooked" in page.window, false, `${label}：不许留 __rkHooked 这类守卫`);
}

// chatbot-drive.browser.js —— __rk.init() / __rk.capture() / __rk.uninstall()
// ═══════════════════════════════════════════════════════════════════════════

const PROFILE = { input: "#q", send: "#send", answer: ".answer", copy: "button.anscopy" };

test("chatbot init: 不装任何钩子（钩子只在 capture 期间存在）", () => {
  const page = makePage();
  const win = load(CHATBOT, page);
  const r = win.__rk.init(PROFILE);
  assert.equal(r.ok, true);
  assert.equal(r.hooked, false);
  assertPageRestored(page, "chatbot init");
});

test("chatbot capture: 拿到原文，并把页面还原", async () => {
  const page = makePage({ clickBehavior: "writeText", text: "abcdef" });
  const win = load(CHATBOT, page);
  win.__rk.init(PROFILE);
  const got = await win.__rk.capture();
  assert.equal(got.ok, true);
  assert.equal(got.chars, 6);
  assert.equal(got.reason, "ok");
  assert.equal(win.__rk.raw(), "abcdef");
  assert.deepEqual(page.passedThrough, ["abcdef"]);
  assertPageRestored(page, "chatbot capture 成功路径");
});

test("chatbot capture: 三种失败各有各的 reason", async () => {
  const silent = makePage({ clickBehavior: "silent" });
  const winA = load(CHATBOT, silent);
  winA.__rk.init(PROFILE);
  const a = await winA.__rk.capture();
  assert.equal(a.ok, false);
  assert.equal(a.reason, "no-copy-observed");
  assert.deepEqual(a.armed, ["copy-listener", "clipboard.writeText"]);
  assertPageRestored(silent, "chatbot 未触发路径");

  const displaced = makePage({ clickBehavior: "displaced" });
  const winB = load(CHATBOT, displaced);
  winB.__rk.init(PROFILE);
  const b = await winB.__rk.capture();
  assert.equal(b.reason, "hook-displaced");
  assert.equal(displaced.navigator.clipboard.writeText, displaced.pageOwn());

  const bare = makePage({ clickBehavior: "silent", withClipboard: false, withAddEventListener: false });
  const winC = load(CHATBOT, bare);
  winC.__rk.init(PROFILE);
  const c = await winC.__rk.capture();
  assert.equal(c.reason, "hook-not-installed");
  assert.deepEqual(c.armed, []);
});

test("chatbot capture: 每次采集前归零 —— 跨调用不许累积", async () => {
  const page = makePage({ clickBehavior: "writeText", text: "第一次" });
  const win = load(CHATBOT, page);
  win.__rk.init(PROFILE);
  const first = await win.__rk.capture();
  assert.equal(first.ok, true);

  page.setBehavior("silent");
  const second = await win.__rk.capture();
  assert.equal(second.ok, false, "第二次不许把上一次的原文当成这一次的产物");
  assert.equal(second.reason, "no-copy-observed");
  assert.equal(win.__rk.raw(), null, "read()/raw() 也必须跟着归零");
});

test("chatbot uninstall: 注入清单可关闭 —— window.__rk 拿得掉", () => {
  const page = makePage();
  const win = load(CHATBOT, page);
  win.__rk.init(PROFILE);
  const r = win.__rk.uninstall();
  assert.deepEqual(r.removed, ["window.__rk"]);
  assert.equal(win.__rk, undefined);
  assertPageRestored(page, "chatbot uninstall");
});

// ═══════════════════════════════════════════════════════════════════════════
// search-platforms.md 里的 captureDownloadedBlob 范本（2026-11-27 从 integrations.md 并入）
//
// 它是**文档里的代码片段**，没有任何执行路径会跑到它——所以更容易悄悄烂掉，
// 而它偏偏是别人会照抄的范本。老版本三行搞定：永久换掉 URL.createObjectURL、
// blob 攒进 window.__cap 从不清空，于是「这个页面产生下载了吗」这个问题的答案
// 永远来自我们自己的钩子，而 __cap[0] 可能是上一个页面留下的。
// 这里把范本从 Markdown 里抠出来真跑一遍，钉住还原、归零、失败可分辨三条。
// ═══════════════════════════════════════════════════════════════════════════

function loadSnippet() {
  const md = readFileSync(path.join(root, "rankup/references/search-platforms.md"), "utf8");
  const block = md
    .split(/```js\n/)
    .map((chunk) => chunk.split("```")[0])
    .find((chunk) => chunk.includes("async function captureDownloadedBlob"));
  assert.ok(block, "search-platforms.md 里找不到 captureDownloadedBlob 范本");
  const body = block.split("// 用法：")[0];
  return new Function("URL", "setTimeout", `${body}\nreturn captureDownloadedBlob`);
}

function fakeUrl(behavior) {
  const orig = function (b) {
    return "blob:orig/" + b.id;
  };
  const URL = { createObjectURL: orig };
  const blob = { id: "1", text: async () => "google-site-verification: real-file-contents" };
  const click = () => {
    if (behavior === "blob") URL.createObjectURL(blob);
    if (behavior === "displaced") {
      URL.createObjectURL = function pageOwn(b) {
        return "blob:page/" + b.id;
      };
      URL.createObjectURL(blob);
    }
    // "direct" —— 直链下载，压根不走 createObjectURL
  };
  return { URL, click, orig };
}

test("integrations 范本: 抓到 blob 内容，并把 URL.createObjectURL 还原", async () => {
  const page = fakeUrl("blob");
  const capture = loadSnippet()(page.URL, setTimeout);
  const got = await capture(page.click, 1);
  assert.equal(got.ok, true);
  assert.equal(got.个数, 1);
  assert.match(got.内容, /real-file-contents/);
  assert.equal(page.URL.createObjectURL, page.orig, "钩子没还原，页面被永久改了");
});

test("integrations 范本: 每次调用一份新的 blobs —— 上一次的产物不许算到这一次头上", async () => {
  const page = fakeUrl("blob");
  const capture = loadSnippet()(page.URL, setTimeout);
  const first = await capture(page.click, 1);
  assert.equal(first.个数, 1);
  const second = await capture(() => {}, 1); // 这一次什么也没下载
  assert.equal(second.ok, false);
  assert.match(second.原因, /no-blob-observed/);
});

test("integrations 范本: 三种失败可分辨", async () => {
  const direct = fakeUrl("direct");
  const a = await loadSnippet()(direct.URL, setTimeout)(direct.click, 1);
  assert.match(a.原因, /no-blob-observed/);
  assert.equal(direct.URL.createObjectURL, direct.orig);

  const displaced = fakeUrl("displaced");
  const b = await loadSnippet()(displaced.URL, setTimeout)(displaced.click, 1);
  assert.match(b.原因, /hook-displaced/);
  assert.notEqual(displaced.URL.createObjectURL, displaced.orig, "被顶掉时不许把页面的实现覆盖回去");

  // 属性被冻住 = 装不上，和「装上了但没触发」是两回事。
  const frozen = fakeUrl("direct");
  Object.defineProperty(frozen.URL, "createObjectURL", { value: frozen.orig, writable: false, configurable: false });
  const c = await loadSnippet()(frozen.URL, setTimeout)(frozen.click, 1);
  assert.match(c.原因, /hook-not-installed/);
});
