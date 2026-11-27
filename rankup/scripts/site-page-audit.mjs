#!/usr/bin/env node
// site-page-audit.mjs — 段 4 上线前「额外自查」一条命令版（零依赖、零配额、零登录）
//
// 对 sitemap（或给定 URL 列表）里的每个页面抓 raw HTML，并核对：
//   1. head：title/description 长度与重复、robots、canonical、og:*、twitter:*、theme-color、
//      所有 icon/manifest link 声明
//   2. 占位专项：discipline.md 十四那批正则 + 空 alt / 空 src / 占位图床
//   3. JSON-LD：逐块 JSON.parse，列 @type（含 @graph），报解析失败
//   4. FAQ：页面上 H3 提问 与 FAQPage JSON-LD 的 Question 逐条对照（集合差集）
//   5. 全部唯一的内链、<img>/<source>、og:image、twitter:image、icon、manifest 图标逐个 GET：
//      状态、Content-Type、字节数、图片真实宽高（PNG/JPEG/WebP/ICO 各层）
//   6. 附带 /robots.txt、/sitemap.xml、/llms.txt、一个必然不存在路径的 404 状态与 404 页 head
//
// 用法：
//   NODE_USE_ENV_PROXY=1 node site-page-audit.mjs --sitemap https://example.com/sitemap.xml [--extra /,/x] [--out DIR]
//   NODE_USE_ENV_PROXY=1 node site-page-audit.mjs https://example.com/ https://example.com/a
// 输出：<out>/site-page-audit.json 与 <out>/site-page-audit.md（默认 ./site-page-audit-out/）
// 只出事实，不分级；判读按 seo-audit-reading.md「seo-audit 判读指引」与 checklists.md 段 4。

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { scanDocument } from "./no-wip-check.mjs";

const argv = process.argv.slice(2);
let sitemap = null, out = "./site-page-audit-out", extra = [], urls = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--sitemap") sitemap = argv[++i];
  else if (a === "--out") out = argv[++i];
  else if (a === "--extra") extra = argv[++i].split(",").filter(Boolean);
  else if (a === "-h" || a === "--help") { console.log("用法见文件头注释；建设中命中退出 1 并打印 URL/行/位置。\n本地构建期与自测：node scripts/no-wip-check.mjs --help（可单文件拷贝）。"); process.exit(0); }
  else urls.push(a);
}
if (!sitemap && !urls.length) { console.error("需要 --sitemap <url> 或 URL 列表"); process.exit(1); }
mkdirSync(out, { recursive: true });

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 site-page-audit";
// 传输层失败（ECONNRESET / fetch failed，常见于本机代理偶发抖动）最多重试 3 次，HTTP 状态码不重试
async function get(u, opts = {}) {
  let r;
  for (let i = 0; i < 3; i++) { r = await get1(u, opts); if (r.ok) return r; await new Promise((s) => setTimeout(s, 800 * (i + 1))); }
  return r;
}
async function get1(u, opts = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(u, { headers: { "user-agent": UA, ...(opts.headers || {}) }, redirect: opts.manual ? "manual" : "follow", signal: AbortSignal.timeout(25000) });
    const buf = Buffer.from(await r.arrayBuffer());
    return { ok: true, status: r.status, ctype: r.headers.get("content-type") || "", buf, url: r.url, headers: Object.fromEntries(r.headers), ms: Date.now() - t0 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.cause?.code || e.message || e), buf: Buffer.alloc(0), ms: Date.now() - t0 };
  }
}
const dec = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&#x2F;/g, "/");
const norm = (s) => dec(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().toLowerCase();

function imgSize(buf, ctype, url) {
  try {
    if (buf.length > 24 && buf.slice(0, 8).toString("hex") === "89504e470d0a1a0a") return { fmt: "png", w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let o = 2;
      while (o < buf.length) {
        if (buf[o] !== 0xff) { o++; continue; }
        const m = buf[o + 1];
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { fmt: "jpeg", h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
        o += 2 + buf.readUInt16BE(o + 2);
      }
    }
    if (buf.slice(0, 4).toString() === "RIFF" && buf.slice(8, 12).toString() === "WEBP") {
      const k = buf.slice(12, 16).toString();
      if (k === "VP8X") return { fmt: "webp", w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
      if (k === "VP8 ") return { fmt: "webp", w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
      if (k === "VP8L") { const b = buf.readUInt32LE(21); return { fmt: "webp", w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 }; }
    }
    if (buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1) {
      const n = buf.readUInt16LE(4), layers = [];
      for (let i = 0; i < n; i++) { const w = buf[6 + 16 * i] || 256, h = buf[7 + 16 * i] || 256; layers.push(`${w}x${h}`); }
      return { fmt: "ico", layers };
    }
    if (/svg/.test(ctype) || /\.svg(\?|$)/.test(url)) return { fmt: "svg" };
    if (buf.slice(0, 6).toString().startsWith("GIF8")) return { fmt: "gif", w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  } catch {}
  return { fmt: "unknown" };
}

const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i")); return m ? dec(m[2] ?? m[3]) : null; };
const tagsOf = (html, name) => html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) || [];

const PLACEHOLDER = [
  ["PH_LINK_HASH", /href\s*=\s*["']#["']/gi], ["PH_LINK_VOID", /href\s*=\s*["']javascript:void\(0?\)?["']/gi],
  ["PH_LINK_EXAMPLE", /href\s*=\s*["'][^"']*example\.(com|org|net)[^"']*["']/gi], 
  ["PH_TEXT_LOREM", /lorem ipsum/gi], ["PH_TEXT_FIXME", /\bFIXME\b/gi],  ["PH_TEXT_YOUR_TEXT", /your text here/gi],
  ["PH_TEXT_BRACKET", /\[(Company|Company Name|Product|Product Name|Your Name|Address)\]/gi], 
  ["PH_TEXT_TEMPLATE_VAR", /\{\{\s*[\w.]+\s*\}\}/g], ["PH_IMAGE_SERVICE", /(placehold\.co|via\.placeholder\.com|picsum\.photos|dummyimage\.com)/gi],
  ["PH_IMAGE_FILENAME", /src\s*=\s*["'][^"']*placeholder[^"']*\.(png|jpg|jpeg|svg|webp)["']/gi], ["PH_IMAGE_EMPTY_SRC", /<img\b[^>]*\bsrc\s*=\s*["']["'][^>]*>/gi],
  ["PH_CONTACT_EMAIL", /your@email\.com/gi], ["PH_CONTACT_PHONE", /\+1\s*234[\s.-]*567/g], ["PH_ASSET_LOCALHOST", /https?:\/\/(localhost|127\.0\.0\.1)[:/]/gi],
];

function flattenLd(node, acc) {
  if (Array.isArray(node)) node.forEach((n) => flattenLd(n, acc));
  else if (node && typeof node === "object") {
    if (node["@type"]) acc.push(node);
    if (node["@graph"]) flattenLd(node["@graph"], acc);
  }
  return acc;
}

async function main() {
  let origin;
  const noWipFailures = [];
  const checkNoWip = (source, url, format = 'html') => {
    const hits = scanDocument(source, { format });
    if (hits.length) noWipFailures.push({ url, hits });
    return hits;
  };
  if (sitemap) {
    const r = await get(sitemap);
    if (r.status !== 200) { console.error("sitemap 抓取失败", r.status, r.error); process.exit(1); }
    checkNoWip(r.buf.toString(), sitemap, "xml");
    urls = [...r.buf.toString().matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => dec(m[1]));
  }
  origin = new URL(urls[0]).origin;
  for (const e of extra) urls.push(new URL(e, origin).href);
  urls = [...new Set(urls)];

  const pages = [];
  const assets = new Map(); // url -> {kinds:Set, from:Set}
  const addAsset = (u, kind, from) => { if (!u) return; let a = assets.get(u); if (!a) assets.set(u, (a = { kinds: new Set(), from: new Set() })); a.kinds.add(kind); a.from.add(from); };
  const abs = (u, base) => { try { return new URL(u, base).href; } catch { return null; } };

  for (const u of urls) {
    const r = await get(u);
    const html = r.buf.toString("utf8");
    const p = { url: u, status: r.status, finalUrl: r.url, ctype: r.ctype, bytes: r.buf.length, fetchError: r.error || null };
    p.noWip = checkNoWip(html, u, /text\/plain/i.test(r.ctype || "") ? "text" : /xml/i.test(r.ctype || "") ? "xml" : "html");
    if (r.status !== 200) { pages.push(p); continue; }
    const head = html.slice(0, html.indexOf("</head>") > 0 ? html.indexOf("</head>") : 20000);
    p.title = dec((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, null])[1] || "") || null;
    const metas = tagsOf(head, "meta");
    const metaBy = (key, val) => metas.filter((m) => (attr(m, key) || "").toLowerCase() === val);
    p.titleCount = (head.match(/<title\b/gi) || []).length;
    p.descCount = metaBy("name", "description").length;
    p.description = metaBy("name", "description").map((m) => attr(m, "content"))[0] ?? null;
    p.robots = metaBy("name", "robots").map((m) => attr(m, "content"));
    p.themeColor = metaBy("name", "theme-color").map((m) => attr(m, "content"));
    p.viewport = metaBy("name", "viewport").map((m) => attr(m, "content"));
    const links = tagsOf(head, "link");
    p.canonical = links.filter((l) => /canonical/i.test(attr(l, "rel") || "")).map((l) => attr(l, "href"));
    p.iconLinks = links.filter((l) => /icon|manifest/i.test(attr(l, "rel") || "")).map((l) => ({ rel: attr(l, "rel"), href: attr(l, "href"), sizes: attr(l, "sizes"), type: attr(l, "type") }));
    const og = {}; for (const m of metas) { const k = attr(m, "property") || ""; if (/^og:/.test(k)) (og[k] ||= []).push(attr(m, "content")); }
    p.og = og;
    const tw = {}; for (const m of metas) { const k = attr(m, "name") || ""; if (/^twitter:/.test(k)) (tw[k] ||= []).push(attr(m, "content")); }
    p.twitter = tw;
    p.h1 = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => norm(m[1]));
    const hs = [...html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ l: +m[1], t: dec(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim() }));
    p.headingOutline = hs;
    p.headingSkips = hs.slice(1).filter((h, i) => h.l - hs[i].l > 1).map((h, i) => `h${hs[hs.indexOf(h) - 1].l}->h${h.l} @ "${h.t.slice(0, 40)}"`);

    // placeholders
    p.placeholders = {};
    for (const [code, re] of PLACEHOLDER) { const m = (code === "PH_TEXT_FIXME" ? html.replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]*>/g, " ") : html).match(re); if (m) p.placeholders[code] = m.slice(0, 3); }
    // images
    const imgs = tagsOf(html, "img");
    p.images = imgs.map((t) => ({ src: attr(t, "src"), srcset: attr(t, "srcset"), alt: attr(t, "alt"), w: attr(t, "width"), h: attr(t, "height"), loading: attr(t, "loading") }));
    p.imgNoAlt = p.images.filter((i) => i.alt === null).length;
    p.imgEmptyAlt = p.images.filter((i) => i.alt === "").length;
    for (const i of p.images) { addAsset(abs(i.src, u), "img", u); }
    for (const t of tagsOf(html, "source")) { for (const s of (attr(t, "srcset") || "").split(",")) addAsset(abs(s.trim().split(/\s+/)[0], u), "source", u); }
    // anchors
    const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => ({ href: attr(`<a ${m[1]}>`, "href"), text: dec(m[2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim(), aria: attr(`<a ${m[1]}>`, "aria-label") }));
    p.anchorCount = anchors.length;
    p.anchorsNoName = anchors.filter((a) => !a.text && !a.aria).length;
    for (const a of anchors) { const h = abs(a.href, u); if (h && new URL(h).origin === origin && !/^(mailto|tel):/.test(a.href)) addAsset(h.split("#")[0], "link", u); }
    p.externalLinks = anchors.filter((a) => a.href && /^https?:/.test(a.href) && new URL(a.href).origin !== origin).map((a) => a.href);
    p.mailto = anchors.filter((a) => /^mailto:/.test(a.href || "")).map((a) => a.href);
    // Public feed text is covered even when absent from sitemap.
    for (const l of links) if (/alternate/i.test(attr(l, "rel") || "") && /(?:rss|atom)/i.test(attr(l, "type") || "")) addAsset(abs(attr(l, "href"), u), "feed", u);
    // head assets
    for (const k of ["og:image", "og:image:secure_url"]) for (const v of og[k] || []) addAsset(abs(v, u), "og:image", u);
    for (const v of tw["twitter:image"] || []) addAsset(abs(v, u), "twitter:image", u);
    for (const l of p.iconLinks) addAsset(abs(l.href, u), l.rel.includes("manifest") ? "manifest" : "icon", u);
    // JSON-LD
    p.jsonld = [];
    const lds = [...html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
    for (const m of lds) {
      try { const j = JSON.parse(m[1]); const nodes = flattenLd(j, []); p.jsonld.push({ ok: true, types: nodes.map((n) => [].concat(n["@type"]).join("/")), nodes: nodes.map((n) => ({ type: [].concat(n["@type"]).join("/"), keys: Object.keys(n) })) });
        for (const n of nodes) { for (const key of ["image", "url", "@id"]) { const v = n[key]; for (const s of [].concat(v || [])) if (typeof s === "string" && /^https?:/.test(s) && key === "image") addAsset(s, "jsonld:image", u); } } p.jsonld[p.jsonld.length - 1]._raw = j;
      } catch (e) { p.jsonld.push({ ok: false, error: String(e.message), head: m[1].slice(0, 80) }); }
    }
    // FAQ vs FAQPage
    const faqNodes = p.jsonld.flatMap((b) => (b.ok ? flattenLd(b._raw, []) : [])).filter((n) => [].concat(n["@type"]).includes("FAQPage"));
    if (faqNodes.length) {
      const qs = faqNodes.flatMap((n) => [].concat(n.mainEntity || [])).map((q) => ({ q: norm(q.name || ""), a: norm((q.acceptedAnswer || {}).text || "") }));
      const h3 = hs.filter((h) => h.l === 3 || h.l === 2).map((h) => norm(h.t));
      const bodyText = norm(html.replace(/<script[\s\S]*?<\/script>/gi, " "));
      p.faq = { ldQuestions: qs.length, ldQuestionsNotInPageHeadings: qs.filter((x) => !h3.includes(x.q)).map((x) => x.q), ldAnswersNotInPageText: qs.filter((x) => !bodyText.includes(x.a.slice(0, 60))).map((x) => x.q) };
      const faqHeadings = hs.filter((h) => h.l === 3).map((h) => norm(h.t)).filter((t) => t.endsWith("?"));
      p.faq.pageQuestionHeadingsNotInLd = faqHeadings.filter((t) => !qs.some((x) => x.q === t));
    }
    // visible text volume
    p.textChars = norm(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")).length;
    for (const b of p.jsonld) delete b._raw;
    pages.push(p);
  }

  // cross-page duplicates
  const dup = (key) => { const m = {}; for (const p of pages) { const v = typeof key === "function" ? key(p) : p[key]; if (v) (m[v] ||= []).push(p.url); } return Object.fromEntries(Object.entries(m).filter(([, a]) => a.length > 1)); };
  const dupes = { title: dup("title"), description: dup("description"), ogImage: dup((p) => (p.og?.["og:image"] || [])[0]), canonical: dup((p) => (p.canonical || [])[0]) };

  // fetch assets
  const list = [...assets.entries()];
  const results = {};
  let idx = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (idx < list.length) {
      const [u, meta] = list[idx++];
      const r = await get(u);
      const info = { status: r.status, ctype: r.ctype, bytes: r.buf.length, kinds: [...meta.kinds], from: [...meta.from].slice(0, 5), error: r.error || null, finalUrl: r.url !== u ? r.url : undefined };
      if (r.status === 200 && (meta.kinds.has("img") || meta.kinds.has("og:image") || meta.kinds.has("twitter:image") || meta.kinds.has("icon") || meta.kinds.has("source") || meta.kinds.has("jsonld:image"))) info.image = imgSize(r.buf, r.ctype, u);
      if (r.status === 200 && meta.kinds.has("link")) info.isHtml = /text\/html/.test(r.ctype);
      if (meta.kinds.has("manifest") && r.status === 200) { try { const mj = JSON.parse(r.buf.toString()); info.manifest = mj; for (const ic of mj.icons || []) { const iu = abs(ic.src, u); if (iu && !results[iu] && !assets.has(iu)) { const ir = await get(iu); results[iu] = { status: ir.status, ctype: ir.ctype, bytes: ir.buf.length, kinds: ["manifest-icon"], declared: `${ic.sizes} ${ic.type || ""}`, image: ir.status === 200 ? imgSize(ir.buf, ir.ctype, iu) : undefined }; } } } catch (e) { info.manifestParseError = String(e.message); } }
      if (meta.kinds.has("feed")) info.noWip = checkNoWip(r.buf.toString(), u, "xml");
      results[u] = info;
    }
  }));

  // site-level files
  const site = {};
  for (const p of ["/robots.txt", "/sitemap.xml", "/llms.txt", "/favicon.ico", "/apple-touch-icon.png", "/.well-known/security.txt", "/__audit-404-probe-" + Date.now().toString(36)]) {
    const r = await get(origin + p, { manual: true });
    site[p] = { status: r.status, ctype: r.ctype, bytes: r.buf.length, location: r.headers?.location, cache: r.headers?.["cf-cache-status"], cacheControl: r.headers?.["cache-control"] };
    if (p === "/llms.txt" || p === "/sitemap.xml" || p.startsWith("/__audit-404")) site[p].noWip = checkNoWip(r.buf.toString(), origin + p, p === "/llms.txt" ? "text" : p === "/sitemap.xml" ? "xml" : "html");
    if (p.startsWith("/__audit-404")) { const h = r.buf.toString(); site[p].title = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, null])[1]; site[p].robots = (h.match(/<meta[^>]*name="robots"[^>]*>/i) || [null])[0]; site[p].h1 = (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, null])[1]?.replace(/<[^>]+>/g, " "); }
  }

  const report = { origin, generatedAt: new Date().toISOString(), pageCount: pages.length, dupes, pages, assets: results, site, noWipFailures };
  writeFileSync(join(out, "site-page-audit.json"), JSON.stringify(report, null, 1));

  // markdown summary
  const L = [];
  L.push(`# site-page-audit ${origin}  ${report.generatedAt}`, "", "## 页面");
  L.push("| URL | st | title(len) | desc(len) | h1 | canonical | og:image(w×h) | LD types | text | PH | skips | imgEmptyAlt |", "|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const p of pages) {
    if (p.status !== 200) { L.push(`| ${p.url} | ${p.status} ${p.fetchError || ""} |||||||||||`); continue; }
    const o = p.og?.["og:image"]?.[0];
    L.push(`| ${p.url.replace(origin, "") || "/"} | ${p.status} | ${(p.title || "").length} | ${(p.description || "").length} | ${p.h1.length} | ${p.canonical.length === 1 && p.canonical[0] === p.url ? "self" : p.canonical.join(",") || "NONE"} | ${o ? o.replace(origin, "") + " " + (assets.get(o) ? (results[o]?.image?.w + "×" + results[o]?.image?.h) : "") : "NONE"} | ${p.jsonld.map((b) => (b.ok ? b.types.join("+") : "PARSE-ERR")).join(";")} | ${p.textChars} | ${Object.keys(p.placeholders).join(",") || "0"} | ${p.headingSkips.length} | ${p.imgEmptyAlt} |`);
  }
  L.push("", "## 重复", "```json", JSON.stringify(dupes, null, 1), "```", "", "## 非 200 / 异常资源");
  for (const [u, r] of Object.entries(results)) if (r.status !== 200 || (r.kinds.includes("link") && r.isHtml === false) || r.error) L.push(`- ${r.status} ${u} (${r.kinds.join(",")}) from ${r.from?.join(", ")} ${r.error || ""}`);
  L.push("", "## 站点文件");
  for (const [p, s] of Object.entries(site)) L.push(`- ${p}: ${JSON.stringify(s)}`);
  L.push("", "## 建设中红线");
  for (const { url, hits } of noWipFailures) for (const hit of hits) L.push(`- ${url}:${hit.line} ${hit.location}: ${hit.term} — ${hit.excerpt}`);
  if (!noWipFailures.length) L.push("词表命中 0；功能与设计仍需人工核验。");
  writeFileSync(join(out, "site-page-audit.md"), L.join("\n"));
  console.log(join(out, "site-page-audit.md"));
  console.log(`pages=${pages.length} assets=${Object.keys(results).length} nonOk=${Object.values(results).filter((r) => r.status !== 200).length}`);
  for (const { url, hits } of noWipFailures) for (const hit of hits) console.error(`${url}:${hit.line} ${hit.location}: ${hit.term} — ${hit.excerpt}`);
  if (noWipFailures.length) process.exitCode = 1;
}
main().catch((e) => { console.error(e); process.exit(2); });
