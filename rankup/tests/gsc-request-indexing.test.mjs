import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decodeXmlEntities,
  extractLocs,
  collectSitemapUrls,
  filterPending,
  loadState,
  saveState,
  wanted,
  includesAny,
  quotaHit,
  shq,
  findExactThenIncludesMatch,
  findButtonMatch,
} from "../scripts/gsc-request-indexing.mjs";

// ── sitemap 解析 ────────────────────────────────────────────────

test("decodeXmlEntities 解码常见 XML 实体", () => {
  assert.equal(decodeXmlEntities("a&amp;b"), "a&b");
  assert.equal(decodeXmlEntities("&lt;tag&gt;"), "<tag>");
  assert.equal(decodeXmlEntities("&quot;q&quot; &apos;a&apos;"), `"q" 'a'`);
});

test("extractLocs 从 <loc> 标签抠 URL，忽略首尾空白", () => {
  const xml = `<urlset><url><loc>
      https://example.com/a
    </loc></url><url><loc>https://example.com/b</loc></url></urlset>`;
  assert.deepEqual(extractLocs(xml), ["https://example.com/a", "https://example.com/b"]);
});

test("collectSitemapUrls 解析普通 sitemap，按注入的 fetchImpl 取数不打真实网络", async () => {
  const xml = `<?xml version="1.0"?><urlset><url><loc>https://x.com/</loc></url><url><loc>https://x.com/a</loc></url></urlset>`;
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => xml });
  const { urls, sitemapsVisited } = await collectSitemapUrls("https://x.com/sitemap.xml", { fetchImpl, log: () => {}, logError: () => {} });
  assert.deepEqual(urls.sort(), ["https://x.com/", "https://x.com/a"]);
  assert.deepEqual(sitemapsVisited, ["https://x.com/sitemap.xml"]);
});

test("collectSitemapUrls 递归展开 sitemap index", async () => {
  const index = `<sitemapindex><sitemap><loc>https://x.com/s1.xml</loc></sitemap><sitemap><loc>https://x.com/s2.xml</loc></sitemap></sitemapindex>`;
  const s1 = `<urlset><url><loc>https://x.com/a</loc></url></urlset>`;
  const s2 = `<urlset><url><loc>https://x.com/b</loc></url></urlset>`;
  const pages = { "https://x.com/sitemap.xml": index, "https://x.com/s1.xml": s1, "https://x.com/s2.xml": s2 };
  const fetchImpl = async (url) => ({ ok: true, status: 200, text: async () => pages[url] ?? "" });
  const { urls, sitemapsVisited } = await collectSitemapUrls("https://x.com/sitemap.xml", { fetchImpl, log: () => {}, logError: () => {} });
  assert.deepEqual(urls.sort(), ["https://x.com/a", "https://x.com/b"]);
  assert.equal(sitemapsVisited.length, 3);
});

test("collectSitemapUrls 跳过 HTTP 错误与抛错的子 sitemap，不中止整体展开", async () => {
  const index = `<sitemapindex><sitemap><loc>https://x.com/bad.xml</loc></sitemap><sitemap><loc>https://x.com/throws.xml</loc></sitemap><sitemap><loc>https://x.com/ok.xml</loc></sitemap></sitemapindex>`;
  const ok = `<urlset><url><loc>https://x.com/good</loc></url></urlset>`;
  const fetchImpl = async (url) => {
    if (url === "https://x.com/sitemap.xml") return { ok: true, status: 200, text: async () => index };
    if (url === "https://x.com/bad.xml") return { ok: false, status: 404, text: async () => "" };
    if (url === "https://x.com/throws.xml") throw new Error("network down");
    if (url === "https://x.com/ok.xml") return { ok: true, status: 200, text: async () => ok };
    throw new Error("unexpected url " + url);
  };
  const { urls } = await collectSitemapUrls("https://x.com/sitemap.xml", { fetchImpl, log: () => {}, logError: () => {} });
  assert.deepEqual(urls, ["https://x.com/good"]);
});

test("collectSitemapUrls 防环：index 指向自己不会死循环", async () => {
  const selfIndex = `<sitemapindex><sitemap><loc>https://x.com/sitemap.xml</loc></sitemap></sitemapindex>`;
  const fetchImpl = async () => ({ ok: true, status: 200, text: async () => selfIndex });
  const { urls, sitemapsVisited } = await collectSitemapUrls("https://x.com/sitemap.xml", { fetchImpl, log: () => {}, logError: () => {} });
  assert.deepEqual(urls, []);
  assert.deepEqual(sitemapsVisited, ["https://x.com/sitemap.xml"]);
});

// ── 断点续跑（state 文件） ──────────────────────────────────────

test("filterPending 跳过 indexed/requested，保留其它状态与未知 URL", () => {
  const state = {
    urls: {
      "https://x.com/a": { status: "indexed" },
      "https://x.com/b": { status: "requested" },
      "https://x.com/c": { status: "quota-stopped" },
      "https://x.com/d": { status: "failed" },
    },
  };
  const urls = ["https://x.com/a", "https://x.com/b", "https://x.com/c", "https://x.com/d", "https://x.com/e"];
  assert.deepEqual(filterPending(urls, state), ["https://x.com/c", "https://x.com/d", "https://x.com/e"]);
});

test("filterPending --force 时全部重新处理，忽略历史状态", () => {
  const state = { urls: { "https://x.com/a": { status: "indexed" } } };
  assert.deepEqual(filterPending(["https://x.com/a"], state, { force: true }), ["https://x.com/a"]);
});

test("filterPending 对空/缺失 state 不抛错", () => {
  assert.deepEqual(filterPending(["https://x.com/a"], { urls: {} }), ["https://x.com/a"]);
  assert.deepEqual(filterPending(["https://x.com/a"], {}), ["https://x.com/a"]);
});

test("loadState/saveState 往返：写回读出内容一致，且写会建目录", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsc-idx-test-"));
  try {
    const statePath = join(dir, "nested", "gsc-indexing.json");
    const state = { property: "sc-domain:example.com", urls: { "https://example.com/": { status: "requested" } } };
    saveState(statePath, state);
    const reloaded = loadState(statePath);
    assert.deepEqual(reloaded, state);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadState 对不存在的文件返回空状态，不抛错", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsc-idx-test-"));
  try {
    assert.deepEqual(loadState(join(dir, "missing.json")), { urls: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadState 对损坏 JSON 回退空状态，不抛错", () => {
  const dir = mkdtempSync(join(tmpdir(), "gsc-idx-test-"));
  try {
    const p = join(dir, "broken.json");
    writeFileSync(p, "{ not json");
    assert.deepEqual(loadState(p), { urls: {} });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ── 文案候选表（中英文界面） ──────────────────────────────────────

test("wanted 按 --lang 精确取一种语言，不再混入另一种（回归：旧版按奇偶下标切分会把英文候选混进中文结果）", () => {
  assert.deepEqual(wanted("requestButton", "zh"), ["请求编入索引"]);
  assert.deepEqual(wanted("requestButton", "en"), ["REQUEST INDEXING", "Request Indexing", "Request indexing"]);
  assert.ok(!wanted("requestButton", "zh").some((s) => /[A-Za-z]/.test(s)), "zh 候选不该混入英文文案");
});

test("wanted lang=auto 时中英文候选都在，中文在前", () => {
  const all = wanted("notIndexed", "auto");
  assert.ok(all.includes("网址尚未收录到 Google"));
  assert.ok(all.includes("URL is not on Google"));
  assert.equal(all[0], "网址尚未收录到 Google");
});

test("wanted 对未知 key 返回空数组而不是抛错", () => {
  assert.deepEqual(wanted("no-such-key", "auto"), []);
});

test("includesAny 命中候选词表中的第一个匹配，否则 null", () => {
  assert.equal(includesAny("网址尚未收录到 Google，请稍候", ["网址在 Google 上", "网址尚未收录到 Google"]), "网址尚未收录到 Google");
  assert.equal(includesAny("无关文本", ["a", "b"]), null);
});

test("quotaHit：中文要求「配额」与索引/收录语境同时出现", () => {
  assert.equal(quotaHit("已达到每日索引配额上限"), true);
  assert.equal(quotaHit("配额"), false, "只有「配额」两个字没有索引/收录语境不该误判");
  assert.equal(quotaHit("今天午餐配额已用完"), false);
});

test("quotaHit：英文关键词命中即判", () => {
  assert.equal(quotaHit("You have reached your limit for today"), true);
  assert.equal(quotaHit("Daily quota exceeded"), true);
  assert.equal(quotaHit("Please try again later"), true);
  assert.equal(quotaHit("Everything looks fine"), false);
});

// ── shell 转义 ────────────────────────────────────────────────

test("shq 生成的单引号字符串经真实 shell 求值后还原原始文本", () => {
  const cases = [
    "https://example.com/a",
    "it's a test",
    `back\`tick\`and$dollar`,
    `already 'quoted' string`,
    "换行\n和中文",
    "",
  ];
  for (const s of cases) {
    const out = execSync(`printf '%s' ${shq(s)}`, { encoding: "utf8" });
    assert.equal(out, s, `shq 往返失败: ${JSON.stringify(s)}`);
  }
});

// ── 搜索框 / 按钮匹配算法（与页面内联 JS 手动保持同步的纯函数版本） ──

test("findExactThenIncludesMatch 精确匹配优先，即使排在包含匹配之后", () => {
  const candidates = ["https://example.com/about-us", "https://example.com/about"];
  assert.equal(findExactThenIncludesMatch(candidates, "https://example.com/about"), 1);
});

test("findExactThenIncludesMatch 没有精确匹配时退化为包含匹配", () => {
  const candidates = ["历史记录: https://example.com/about"];
  assert.equal(findExactThenIncludesMatch(candidates, "https://example.com/about"), 0);
});

test("findExactThenIncludesMatch 都不匹配返回 -1", () => {
  assert.equal(findExactThenIncludesMatch(["https://example.com/x"], "https://example.com/y"), -1);
});

test("findExactThenIncludesMatch 对候选文本的首尾空白不敏感", () => {
  assert.equal(findExactThenIncludesMatch(["  https://example.com/a  "], "https://example.com/a"), 0);
});

test("findButtonMatch 大小写不敏感、空白归一，精确优先于包含", () => {
  assert.equal(findButtonMatch(["Request   Indexing"], ["request indexing"]), 0);
  const candidates = ["请求编入索引再来一次", "请求编入索引"];
  assert.equal(findButtonMatch(candidates, ["请求编入索引"]), 1, "精确匹配的按钮应该优先于文案更长的包含匹配");
});

test("findButtonMatch 候选词列表任一命中即可", () => {
  assert.equal(findButtonMatch(["Request Indexing"], ["请求编入索引", "REQUEST INDEXING", "Request Indexing"]), 0);
});

test("findButtonMatch 都不匹配返回 -1", () => {
  assert.equal(findButtonMatch(["取消"], ["请求编入索引"]), -1);
});
