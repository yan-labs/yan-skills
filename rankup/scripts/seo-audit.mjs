#!/usr/bin/env node
/**
 * seo-audit.mjs — AITDK-equivalent SEO audit (zero deps, Node 20+)
 *
 * 双证人化第二波（2026-08-30）：本脚本降级为**纯机械工具**——只输出事实
 * （标签存在与否、长度、计数、密度），不再给 error/warning/info 分级，也不给
 * 修复建议。分级与阈值判读表迁到 references/seo-box.md「seo-audit 判读指引」，
 * 由拿着上下文的判读者决定哪条算致命。每页抓取失败也进输出
 * （`{url, fetchError}`），不再只在 stderr 里喊一声就丢掉。
 *
 * Usage:
 *   node seo-audit.mjs https://example.com/
 *   node seo-audit.mjs --sitemap https://example.com/sitemap.xml
 *   node seo-audit.mjs --sitemap https://example.com/sitemap.xml --json
 *   node seo-audit.mjs --sitemap https://example.com/sitemap.xml --pages quiz   # filter
 *   node seo-audit.mjs --sitemap https://example.com/sitemap.xml --density-only
 *   node seo-audit.mjs --sitemap http://localhost:3000/sitemap.xml   # dev server
 *
 * --json 的输出结构（2026-09-03 按实际输出补记，别再猜）：
 *   顶层是**以 "0"、"1"… 为键的对象**，不是数组（历史原因，改成数组会破坏已有解析脚本）；
 *   每个值是一页：{ url, title:{text,length}, description:{text,length}, h1:[…], canonical, robots,
 *   og:{…}, twitter:{…}, images:{total, missingAlt}, links:{…}, density:{…}, issues:[…] } 或 { url, fetchError }。
 *   读法：Object.values(JSON.parse(out))。title / description 是对象，取 .text 与 .length。
 */

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flags = {};
const urls = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--sitemap') { flags.sitemap = args[++i]; continue; }
  if (args[i] === '--json') { flags.json = true; continue; }
  if (args[i] === '--pages') { flags.pages = args[++i]; continue; }
  if (args[i] === '--density-only') { flags.densityOnly = true; continue; }
  if (args[i] === '--fix-report') { flags.fixReport = true; continue; }
  if (args[i] === '--help' || args[i] === '-h') { printHelp(); process.exit(0); }
  urls.push(args[i]);
}

function printHelp() {
  console.log(`seo-audit.mjs — AITDK-equivalent SEO audit

Usage:
  node seo-audit.mjs <url> [<url> ...]
  node seo-audit.mjs --sitemap <sitemap-url>

Options:
  --sitemap <url>   Fetch all URLs from a sitemap XML
  --pages <filter>  Only audit pages whose path contains <filter>
  --density-only    Only show keyword density analysis
  --fix-report      Output machine-readable fix suggestions
  --json            Output as JSON
  -h, --help        Show this help

占位检测（PLACEHOLDER_* issue codes）已内置在每页的 issues 里，
正则口径见 references/discipline.md 十四，无需单独开关。`);
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────
async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; seo-audit/1.0)' },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return { html: await res.text(), finalUrl: res.url, status: res.status };
}

/**
 * 取 sitemap 里的全部页面 URL，**自动跟进 sitemap index**。
 *
 * 为什么必须跟进：`<sitemapindex>` 里的 `<loc>` 指向的是**子 sitemap 文件**，
 * 不是页面。不跟进就会把那几个 .xml 当成 HTML 页面去体检，于是每个 XML 都报
 * NO_TITLE / NO_H1 / NO_VIEWPORT……一个 7 条子 sitemap 的站会报出 28 个 error，
 * 看起来像全站崩了，实际站点完全正常。
 *
 * 这是**静默给出错误答案**的失败形态，比报错更危险：读数看着像真的。
 * 2026-08-28 实测踩到，遂修。判据是根元素是 `<sitemapindex` 还是 `<urlset`。
 *
 * `seen` 防自引用死循环；深度上限 3 层足够覆盖现实中的分片 sitemap。
 */
async function fetchSitemapUrls(sitemapUrl, seen = new Set(), depth = 0) {
  if (seen.has(sitemapUrl) || depth > 3) return [];
  seen.add(sitemapUrl);
  const { html } = await fetchHtml(sitemapUrl);
  const locs = [];
  const re = /<loc>(.*?)<\/loc>/g;
  let m;
  while ((m = re.exec(html))) locs.push(m[1].trim());

  // 根元素决定这些 loc 是子 sitemap 还是页面
  if (/<sitemapindex[\s>]/i.test(html)) {
    const out = [];
    for (const child of locs) {
      out.push(...(await fetchSitemapUrls(child, seen, depth + 1)));
    }
    return out;
  }
  return locs;
}

// ─── HTML parsing helpers ───────────────────────────────────────────────────
function meta(html, name) {
  // <meta name="X" content="Y"> or <meta property="X" content="Y">
  const re = new RegExp(
    `<meta\\s+(?:name|property)=["']${escRe(name)}["']\\s+content=["']([^"']*)["']` +
    `|<meta\\s+content=["']([^"']*)["']\\s+(?:name|property)=["']${escRe(name)}["']`,
    'i'
  );
  const m = html.match(re);
  return m ? (m[1] ?? m[2]) : null;
}

function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function extractTag(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, 'is');
  const m = html.match(re);
  return m ? stripTags(m[1]).trim() : null;
}

function extractAllTags(html, tag) {
  const re = new RegExp(`<${tag}([^>]*)>(.*?)</${tag}>`, 'gis');
  const results = [];
  let m;
  while ((m = re.exec(html))) results.push({ attrs: m[1], text: stripTags(m[2]).trim() });
  return results;
}

function extractAttr(attrStr, name) {
  const re = new RegExp(`${name}=["']([^"']*)["']`, 'i');
  const m = attrStr.match(re);
  return m ? m[1] : null;
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '); }

function extractVisibleText(html) {
  let text = html;
  // Remove script, style, noscript
  text = text.replace(/<(script|style|noscript)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');
  // Remove tags
  text = stripTags(text);
  // Decode entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

function extractCanonical(html) {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']*)["']/i)
    || html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["']canonical["']/i);
  return m ? m[1] : null;
}

function extractCharset(html) {
  const m = html.match(/<meta[^>]+charSet=["']([^"']*)["']/i)
    || html.match(/<meta[^>]+charset=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

function extractLang(html) {
  const m = html.match(/<html[^>]+lang=["']([^"']*)["']/i);
  return m ? m[1] : null;
}

// ─── Analysis: Overview ─────────────────────────────────────────────────────
function analyzeOverview(html, url) {
  const title = extractTag(html, 'title');
  const description = meta(html, 'description');
  const keywords = meta(html, 'keywords');
  const canonical = extractCanonical(html);
  const robots = meta(html, 'robots');
  const charset = extractCharset(html);
  const lang = extractLang(html);
  const viewport = meta(html, 'viewport');

  return {
    url,
    title: title ? { text: title, length: title.length } : null,
    description: description ? { text: description, length: description.length } : null,
    keywords,
    canonical,
    robots,
    charset,
    lang,
    viewport,
  };
}

// ─── Analysis: Issues ───────────────────────────────────────────────────────
function analyzeIssues(html, url, overview) {
  const issues = [];
  // 只记录 {code, observed}。第 1 参（旧 severity）与第 4 参（旧修复建议）
  // 被有意丢弃：分级与建议是判读，已迁 references/seo-box.md，脚本只留事实。
  const push = (_severityMovedToReferences, code, observed) =>
    issues.push({ code, observed });

  // Title
  if (!overview.title) {
    push('error', 'NO_TITLE', 'ページにtitleタグがありません', 'titleタグを追加してください');
  } else {
    if (overview.title.length < 10)
      push('warning', 'TITLE_LEN', `title ${overview.title.length}文字（典型范围外，判读见 references/seo-box.md）`);
    if (overview.title.length > 60)
      push('warning', 'TITLE_LEN', `title ${overview.title.length}文字（典型范围外，判读见 references/seo-box.md）`);
  }

  // Description
  if (!overview.description) {
    push('error', 'NO_DESCRIPTION', 'meta descriptionがありません', 'meta descriptionを追加してください');
  } else {
    if (overview.description.length < 50)
      push('warning', 'DESC_LEN', `description ${overview.description.length}文字（典型范围外，判读见 references/seo-box.md）`);
    if (overview.description.length > 160)
      push('warning', 'DESC_LEN', `description ${overview.description.length}文字（典型范围外，判读见 references/seo-box.md）`);
  }

  // Keywords
  if (!overview.keywords)
    push('info', 'NO_KEYWORDS', 'meta keywordsがありません', 'SEO効果は低いが設定推奨');

  // Canonical
  if (!overview.canonical)
    push('warning', 'NO_CANONICAL', 'canonicalタグがありません', '<link rel="canonical">を追加してください');
  else if (overview.canonical !== url && overview.canonical !== url.replace(/\/$/, ''))
    push('info', 'CANONICAL_MISMATCH', `canonicalがURLと異なります: ${overview.canonical}`, '意図的でなければURLと一致させてください');

  // Lang
  if (!overview.lang)
    push('warning', 'NO_LANG', 'html lang属性がありません', '<html lang="ja">を追加してください');

  // Viewport
  if (!overview.viewport)
    push('error', 'NO_VIEWPORT', 'viewport metaタグがありません', 'モバイル対応にviewportを設定してください');

  // Charset
  if (!overview.charset)
    push('warning', 'NO_CHARSET', 'charset指定がありません', '<meta charset="utf-8">を追加してください');

  // H1
  const h1s = extractAllTags(html, 'h1');
  if (h1s.length === 0)
    push('error', 'NO_H1', 'h1タグがありません', 'ページに1つのh1を追加してください');
  else if (h1s.length > 1)
    push('warning', 'MULTIPLE_H1', `h1タグが${h1s.length}個あります`, 'h1は1ページ1つが推奨');

  // Heading hierarchy
  const headings = analyzeHeadings(html);
  let prevLevel = 0;
  for (const h of headings) {
    if (h.level - prevLevel > 1 && prevLevel > 0)
      push('warning', 'HEADING_SKIP', `見出しレベルが飛んでいます: h${prevLevel} → h${h.level}`, '見出しレベルは順番に使ってください');
    prevLevel = h.level;
  }

  // Images without alt (alt="" is intentional for decorative/duplicate images per WCAG)
  const images = analyzeImages(html);
  const noAlt = images.filter(i => i.altMissing);
  if (noAlt.length > 0)
    push('warning', 'IMG_NO_ALT', `alt属性のない画像が${noAlt.length}枚あります`, 'すべての画像にalt属性を追加してください');
  const emptyAlt = images.filter(i => !i.altMissing && i.alt === '');
  if (emptyAlt.length > 0)
    push('info', 'IMG_EMPTY_ALT', `alt=""（装飾扱い）の画像が${emptyAlt.length}枚あります`, 'WCAG準拠の装飾マークなら問題なし');

  // Images without dimensions
  const noDimensions = images.filter(i => !i.width || !i.height);
  if (noDimensions.length > 0)
    push('info', 'IMG_NO_DIMENSIONS', `幅・高さ未指定の画像が${noDimensions.length}枚あります (CLS対策)`, 'width/heightを指定してください');

  // Open Graph
  if (!meta(html, 'og:title'))
    push('warning', 'NO_OG_TITLE', 'og:titleがありません', 'SNSシェア用にog:titleを追加してください');
  if (!meta(html, 'og:description'))
    push('warning', 'NO_OG_DESC', 'og:descriptionがありません', 'og:descriptionを追加してください');
  if (!meta(html, 'og:image'))
    push('warning', 'NO_OG_IMAGE', 'og:imageがありません', 'OGP画像を設定してください');

  // Twitter Card
  if (!meta(html, 'twitter:card'))
    push('info', 'NO_TWITTER_CARD', 'twitter:cardがありません', 'twitter:cardを追加してください');

  // Structured data
  const structured = analyzeStructured(html);
  if (structured.length === 0)
    push('info', 'NO_STRUCTURED', '構造化データ(JSON-LD)がありません', 'Schema.orgの構造化データを追加してください');

  // Robots
  if (overview.robots && /noindex/i.test(overview.robots))
    push('error', 'NOINDEX', 'robotsにnoindexが設定されています', '意図的でなければnoindexを削除してください');

  // Placeholder（占位专项，正则口径见 references/discipline.md 十四）
  for (const p of analyzePlaceholders(html)) push('error', p.code, p.observed);

  return issues;
}

// ─── Analysis: Placeholders（占位专项，口径见 references/discipline.md 十四）───
function analyzePlaceholders(html) {
  const hits = [];
  const count = (re) => (html.match(re) || []).length;
  const addIf = (re, code, label) => {
    const n = count(re);
    if (n > 0) hits.push({ code, observed: `${label}：命中 ${n} 处` });
  };

  // 占位链接
  addIf(/href\s*=\s*["']#["']/gi, 'PLACEHOLDER_LINK_HASH', 'href="#" 占位链接');
  addIf(/href\s*=\s*["']javascript:void\(0?\)?["']/gi, 'PLACEHOLDER_LINK_VOID', 'javascript:void 占位链接');
  addIf(/href\s*=\s*["'][^"']*example\.(com|org|net)[^"']*["']/gi, 'PLACEHOLDER_LINK_EXAMPLE', 'example.com/org 占位链接');
  addIf(/<a\b[^>]*>\s*coming soon\s*<\/a>/gi, 'PLACEHOLDER_LINK_COMING_SOON', '"coming soon" 占位链接文案');

  // 占位文案
  addIf(/lorem ipsum/gi, 'PLACEHOLDER_TEXT_LOREM', 'lorem ipsum 占位文案');
  addIf(/\b(TODO|TBD|FIXME)\b/g, 'PLACEHOLDER_TEXT_TODO', 'TODO/TBD/FIXME 占位标记');
  addIf(/your text here/gi, 'PLACEHOLDER_TEXT_YOUR_TEXT', '"Your text here" 占位文案');
  addIf(/\[(Company|Company Name|Product|Product Name|Your Name|Address)\]/gi, 'PLACEHOLDER_TEXT_BRACKET', '方括号模板占位文案（如 [Company]）');
  addIf(/\bcoming soon\b/gi, 'PLACEHOLDER_TEXT_COMING_SOON', '"Coming soon" 占位文案');
  addIf(/\{\{\s*[\w.]+\s*\}\}/g, 'PLACEHOLDER_TEXT_TEMPLATE_VAR', '未替换的模板变量（如 {{title}}）');

  // 占位图片
  addIf(/(placehold\.co|via\.placeholder\.com|picsum\.photos|dummyimage\.com)/gi, 'PLACEHOLDER_IMAGE_SERVICE', '占位图床（placehold.co / via.placeholder / picsum / dummyimage）');
  addIf(/src\s*=\s*["'][^"']*placeholder[^"']*\.(png|jpg|jpeg|svg|webp)["']/gi, 'PLACEHOLDER_IMAGE_FILENAME', '文件名含 placeholder 的图片');
  addIf(/<img\b[^>]*\bsrc\s*=\s*["']["'][^>]*>/gi, 'PLACEHOLDER_IMAGE_EMPTY_SRC', '空 src 的 <img>');

  // 占位联系方式
  addIf(/your@email\.com/gi, 'PLACEHOLDER_CONTACT_EMAIL', 'your@email.com 占位邮箱');
  addIf(/\+1\s*234[\s.-]*567[\s.-]*(89(0|01)?)?/g, 'PLACEHOLDER_CONTACT_PHONE', '+1 234 567 占位电话');

  return hits;
}

// ─── Analysis: Keyword Density ──────────────────────────────────────────────
const JA_STOPWORDS = new Set([
  'の', 'に', 'は', 'を', 'た', 'が', 'で', 'て', 'と', 'し', 'れ', 'さ',
  'ある', 'いる', 'も', 'する', 'から', 'な', 'こと', 'として', 'い', 'や',
  'れる', 'など', 'なっ', 'ない', 'この', 'ため', 'その', 'あっ', 'よう',
  'また', 'もの', 'という', 'あり', 'まで', 'られ', 'なる', 'へ', 'か',
  'だ', 'これ', 'によって', 'により', 'おり', 'より', 'による', 'ず', 'なり',
  'られる', 'において', 'ば', 'なかっ', 'なく', 'しかし', 'について',
  'せ', 'だっ', 'その他', 'です', 'ます', 'よ', 'ね', 'わ', 'けど',
  'って', 'じゃ', 'でも', 'それ', 'あの', 'この', 'その', 'どの',
  'だけ', 'しか', 'ほど', 'くらい', 'ぐらい', 'まで', 'だから',
]);

function analyzeDensity(html) {
  const text = extractVisibleText(html);
  const segmenter = new Intl.Segmenter('ja', { granularity: 'word' });
  const segments = [...segmenter.segment(text)]
    .filter(s => s.isWordLike)
    .map(s => s.segment.toLowerCase());

  const totalWords = segments.length;

  // Filter out stopwords and very short tokens
  const meaningful = segments.filter(w =>
    w.length > 1 && !JA_STOPWORDS.has(w) && !/^\d+$/.test(w) && !/^[a-z]$/.test(w)
  );

  // 1-gram frequency
  const freq1 = countFreq(meaningful);
  // 2-gram frequency
  const freq2 = countNgramFreq(meaningful, 2);
  // 3-gram frequency
  const freq3 = countNgramFreq(meaningful, 3);

  // Top results
  const top1 = topN(freq1, 20).map(([word, count]) => ({
    word, count, density: ((count / totalWords) * 100).toFixed(2) + '%',
  }));
  const top2 = topN(freq2, 15).map(([phrase, count]) => ({
    phrase, count, density: ((count / totalWords) * 100).toFixed(2) + '%',
  }));
  const top3 = topN(freq3, 10).map(([phrase, count]) => ({
    phrase, count, density: ((count / totalWords) * 100).toFixed(2) + '%',
  }));

  return { totalWords, unigrams: top1, bigrams: top2, trigrams: top3 };
}

function countFreq(words) {
  const freq = new Map();
  for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);
  return freq;
}

function countNgramFreq(words, n) {
  const freq = new Map();
  for (let i = 0; i <= words.length - n; i++) {
    const gram = words.slice(i, i + n).join(' ');
    freq.set(gram, (freq.get(gram) || 0) + 1);
  }
  return freq;
}

function topN(freq, n) {
  return [...freq.entries()]
    .filter(([, c]) => c >= 2) // at least 2 occurrences
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}

// ─── Analysis: Headings ─────────────────────────────────────────────────────
function analyzeHeadings(html) {
  const re = /<(h[1-6])([^>]*)>(.*?)<\/\1>/gis;
  const headings = [];
  let m;
  while ((m = re.exec(html))) {
    headings.push({
      level: parseInt(m[1][1]),
      text: stripTags(m[3]).trim(),
    });
  }
  return headings;
}

// ─── Analysis: Images ───────────────────────────────────────────────────────
function analyzeImages(html) {
  const re = /<img([^>]*)>/gi;
  const images = [];
  let m;
  while ((m = re.exec(html))) {
    const attrs = m[1];
    const alt = extractAttr(attrs, 'alt');
    const hasAltAttr = /\balt\s*=/i.test(attrs);
    images.push({
      src: extractAttr(attrs, 'src'),
      alt,
      altMissing: !hasAltAttr, // true only when attr is absent, not when alt=""
      width: extractAttr(attrs, 'width'),
      height: extractAttr(attrs, 'height'),
      loading: extractAttr(attrs, 'loading'),
    });
  }
  return images;
}

// ─── Analysis: Links ────────────────────────────────────────────────────────
function analyzeLinks(html, pageUrl) {
  const re = /<a([^>]*)>(.*?)<\/a>/gis;
  const links = { internal: [], external: [], nofollow: [], total: 0 };
  const pageOrigin = new URL(pageUrl).origin;
  let m;
  while ((m = re.exec(html))) {
    const href = extractAttr(m[1], 'href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;
    const rel = extractAttr(m[1], 'rel') || '';
    const text = stripTags(m[2]).trim();
    const entry = { href, text: text.substring(0, 80), rel };
    links.total++;

    try {
      const resolved = new URL(href, pageUrl);
      if (resolved.origin === pageOrigin) {
        links.internal.push(entry);
      } else {
        links.external.push(entry);
      }
    } catch {
      links.internal.push(entry);
    }

    if (/nofollow/i.test(rel)) links.nofollow.push(entry);
  }
  return links;
}

// ─── Analysis: Social ───────────────────────────────────────────────────────
function analyzeSocial(html) {
  return {
    og: {
      title: meta(html, 'og:title'),
      description: meta(html, 'og:description'),
      image: meta(html, 'og:image'),
      url: meta(html, 'og:url'),
      type: meta(html, 'og:type'),
      siteName: meta(html, 'og:site_name'),
      locale: meta(html, 'og:locale'),
      imageWidth: meta(html, 'og:image:width'),
      imageHeight: meta(html, 'og:image:height'),
    },
    twitter: {
      card: meta(html, 'twitter:card'),
      title: meta(html, 'twitter:title'),
      description: meta(html, 'twitter:description'),
      image: meta(html, 'twitter:image'),
    },
  };
}

// ─── Analysis: Hreflangs ────────────────────────────────────────────────────
function analyzeHreflangs(html) {
  const re = /<link[^>]+rel=["']alternate["'][^>]+hreflang=["']([^"']*)["'][^>]+href=["']([^"']*)["']/gi;
  const hreflangs = [];
  let m;
  while ((m = re.exec(html))) hreflangs.push({ lang: m[1], href: m[2] });
  return hreflangs;
}

// ─── Analysis: Structured Data ──────────────────────────────────────────────
function analyzeStructured(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const items = [];
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      items.push({
        type: data['@type'] || (Array.isArray(data['@graph']) ? 'Graph' : 'Unknown'),
        summary: summarizeLD(data),
      });
    } catch (e) {
      items.push({ type: 'PARSE_ERROR', summary: e.message });
    }
  }
  return items;
}

function summarizeLD(data) {
  if (Array.isArray(data['@graph'])) {
    return data['@graph'].map(item => item['@type']).join(', ');
  }
  const type = data['@type'];
  if (type === 'FAQPage') return `${(data.mainEntity || []).length} questions`;
  if (type === 'WebSite') return data.name || data.url || '';
  if (type === 'Organization') return data.name || '';
  if (type === 'BreadcrumbList') return `${(data.itemListElement || []).length} items`;
  return type || JSON.stringify(data).substring(0, 60);
}

// ─── Full page audit ────────────────────────────────────────────────────────
async function auditPage(url) {
  const { html, finalUrl } = await fetchHtml(url);
  const overview = analyzeOverview(html, finalUrl);
  const issues = analyzeIssues(html, finalUrl, overview);
  const density = analyzeDensity(html);
  const headings = analyzeHeadings(html);
  const images = analyzeImages(html);
  const links = analyzeLinks(html, finalUrl);
  const social = analyzeSocial(html);
  const hreflangs = analyzeHreflangs(html);
  const structured = analyzeStructured(html);

  return {
    url: finalUrl,
    overview,
    issues,
    density,
    headings,
    images: { total: images.length, withoutAlt: images.filter(i => i.altMissing).length, emptyAlt: images.filter(i => !i.altMissing && i.alt === '').length, items: images },
    links,
    social,
    hreflangs,
    structured,
  };
}

// ─── Report formatting ──────────────────────────────────────────────────────
function printReport(result) {
  const { url, overview, issues, density, headings, images, links, social, structured, hreflangs } = result;

  console.log('\n' + '═'.repeat(78));
  console.log(`  ${url}`);
  console.log('═'.repeat(78));

  // Overview
  console.log('\n┌─ Overview ────────────────────────────────────────────────');
  if (overview.title) {
    console.log(`│ Title [${overview.title.length}文字]  ${overview.title.text}`);
  } else {
    console.log('│ Title: (なし)');
  }
  if (overview.description) {
    console.log(`│ Desc  [${overview.description.length}文字]  ${overview.description.text.substring(0, 100)}…`);
  } else {
    console.log('│ Desc:  (なし)');
  }
  console.log(`│ Keywords: ${overview.keywords || 'N/A'}`);
  console.log(`│ Canonical: ${overview.canonical || 'N/A'}`);
  console.log(`│ Lang: ${overview.lang || 'N/A'}  Charset: ${overview.charset || 'N/A'}  Robots: ${overview.robots || 'N/A'}`);
  console.log('└───────────────────────────────────────────────────────────');

  // Observations：事实清单，无分级。哪条算致命见 references/seo-box.md。
  console.log(`\n┌─ Observations (${issues.length} 条，分级判读见 references/seo-box.md) ─`);
  for (const i of issues) {
    console.log(`│ [${i.code}] ${i.observed}`);
  }
  if (issues.length === 0) console.log('│ （无记录项）');
  console.log('└───────────────────────────────────────────────────────────');

  // Density
  console.log('\n┌─ Keyword Density ─────────────────────────────────────────');
  console.log(`│ Total words: ${density.totalWords}`);
  if (density.unigrams.length > 0) {
    console.log('│');
    console.log('│ 1-word:');
    for (const u of density.unigrams.slice(0, 15)) {
      const bar = '█'.repeat(Math.min(Math.round(parseFloat(u.density) * 10), 30));
      console.log(`│   ${u.word.padEnd(12)} ${String(u.count).padStart(3)}× ${u.density.padStart(6)} ${bar}`);
    }
  }
  if (density.bigrams.length > 0) {
    console.log('│');
    console.log('│ 2-word:');
    for (const b of density.bigrams.slice(0, 10)) {
      console.log(`│   ${b.phrase.padEnd(20)} ${String(b.count).padStart(3)}× ${b.density.padStart(6)}`);
    }
  }
  if (density.trigrams.length > 0) {
    console.log('│');
    console.log('│ 3-word:');
    for (const t of density.trigrams.slice(0, 8)) {
      console.log(`│   ${t.phrase.padEnd(28)} ${String(t.count).padStart(3)}× ${t.density.padStart(6)}`);
    }
  }
  console.log('└───────────────────────────────────────────────────────────');

  // Headings
  console.log('\n┌─ Headings ────────────────────────────────────────────────');
  for (const h of headings) {
    console.log(`│ ${'  '.repeat(h.level - 1)}h${h.level}: ${h.text.substring(0, 60)}`);
  }
  if (headings.length === 0) console.log('│ 見出しタグがありません');
  console.log('└───────────────────────────────────────────────────────────');

  // Images
  console.log(`\n┌─ Images (${images.total} total, ${images.withoutAlt} without alt) ─`);
  if (images.withoutAlt > 0) {
    for (const img of images.items.filter(i => !i.alt).slice(0, 5)) {
      console.log(`│ ✗ no alt: ${(img.src || '').substring(0, 60)}`);
    }
  }
  console.log('└───────────────────────────────────────────────────────────');

  // Links
  console.log(`\n┌─ Links (${links.total}: ${links.internal.length} internal, ${links.external.length} external, ${links.nofollow.length} nofollow) ─`);
  if (links.external.length > 0) {
    console.log('│ External:');
    for (const l of links.external.slice(0, 8)) {
      console.log(`│   ${l.href.substring(0, 60)}  "${l.text.substring(0, 30)}"`);
    }
  }
  console.log('└───────────────────────────────────────────────────────────');

  // Social
  console.log('\n┌─ Social / OGP ────────────────────────────────────────────');
  const og = social.og;
  console.log(`│ og:title:       ${og.title ? '✓' : '✗'}`);
  console.log(`│ og:description: ${og.description ? '✓' : '✗'}`);
  console.log(`│ og:image:       ${og.image ? '✓ ' + og.image.substring(0, 50) : '✗'}`);
  console.log(`│ og:url:         ${og.url || 'N/A'}`);
  console.log(`│ twitter:card:   ${social.twitter.card || 'N/A'}`);
  console.log('└───────────────────────────────────────────────────────────');

  // Structured
  console.log(`\n┌─ Structured Data (${structured.length}) ─`);
  for (const s of structured) {
    console.log(`│ ${s.type}: ${s.summary}`);
  }
  if (structured.length === 0) console.log('│ なし');
  console.log('└───────────────────────────────────────────────────────────');

  // Hreflangs
  if (hreflangs.length > 0) {
    console.log(`\n┌─ Hreflangs (${hreflangs.length}) ─`);
    for (const h of hreflangs) console.log(`│ ${h.lang}: ${h.href}`);
    console.log('└───────────────────────────────────────────────────────────');
  }
}

function printDensityOnly(result) {
  const { url, density } = result;
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${url}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`Total words: ${density.totalWords}\n`);

  if (density.unigrams.length > 0) {
    console.log('1-word keywords:');
    console.log('  Word'.padEnd(14) + 'Count'.padStart(5) + '  Density');
    for (const u of density.unigrams) {
      console.log(`  ${u.word.padEnd(12)} ${String(u.count).padStart(5)}  ${u.density}`);
    }
  }
  if (density.bigrams.length > 0) {
    console.log('\n2-word phrases:');
    for (const b of density.bigrams) {
      console.log(`  ${b.phrase.padEnd(22)} ${String(b.count).padStart(5)}  ${b.density}`);
    }
  }
  if (density.trigrams.length > 0) {
    console.log('\n3-word phrases:');
    for (const t of density.trigrams) {
      console.log(`  ${t.phrase.padEnd(30)} ${String(t.count).padStart(5)}  ${t.density}`);
    }
  }
}

// ─── Summary across all pages ───────────────────────────────────────────────
function printSummary(results) {
  console.log('\n' + '═'.repeat(78));
  console.log('  SUMMARY');
  console.log('═'.repeat(78));

  const audited = results.filter(r => !r.fetchError);
  const failed = results.filter(r => r.fetchError);
  const issueCounts = new Map();
  for (const r of audited) {
    for (const i of r.issues) issueCounts.set(i.code, (issueCounts.get(i.code) || 0) + 1);
  }

  console.log(`\nPages audited: ${audited.length}${failed.length ? `（另有 ${failed.length} 页抓取失败，见下）` : ''}`);
  console.log(`Total observations: ${audited.reduce((n, r) => n + r.issues.length, 0)}（分级判读见 references/seo-box.md）\n`);

  if (issueCounts.size > 0) {
    console.log('Most common observations:');
    const sorted = [...issueCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [code, count] of sorted) {
      console.log(`  ${code.padEnd(22)} ${count} pages`);
    }
  }
  if (failed.length) {
    console.log('\nFetch failures（抓取失败 ≠ 页面没问题——这些页这次根本没看到）:');
    for (const r of failed) console.log(`  ${r.url}: ${r.fetchError}`);
  }

  // Keyword density across all pages
  console.log('\n┌─ Site-wide keyword distribution ─────────────────────────');
  const siteFreq = new Map();
  let siteTotalWords = 0;
  for (const r of audited) {
    siteTotalWords += r.density.totalWords;
    for (const u of r.density.unigrams) {
      siteFreq.set(u.word, (siteFreq.get(u.word) || 0) + u.count);
    }
  }
  const siteTop = [...siteFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);
  for (const [word, count] of siteTop) {
    const density = ((count / siteTotalWords) * 100).toFixed(2);
    console.log(`│ ${word.padEnd(14)} ${String(count).padStart(5)}×  ${density}%`);
  }
  console.log('└───────────────────────────────────────────────────────────');
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  let targetUrls = [...urls];

  if (flags.sitemap) {
    const sitemapUrls = await fetchSitemapUrls(flags.sitemap);
    targetUrls.push(...sitemapUrls);
  }

  if (targetUrls.length === 0) {
    console.error('Error: No URLs provided. Use --sitemap <url> or pass URLs as arguments.');
    process.exit(1);
  }

  if (flags.pages) {
    targetUrls = targetUrls.filter(u => u.includes(flags.pages));
  }

  process.stderr.write(`Auditing ${targetUrls.length} page(s)...\n\n`);

  const results = [];
  for (let i = 0; i < targetUrls.length; i++) {
    const url = targetUrls[i];
    process.stderr.write(`[${i + 1}/${targetUrls.length}] ${url}...\r`);
    try {
      const result = await auditPage(url);
      results.push(result);

      if (flags.json) continue;
      if (flags.densityOnly) {
        printDensityOnly(result);
      } else {
        printReport(result);
      }
    } catch (e) {
      // 抓取失败必须进输出：只在 stderr 喊一声就丢掉，--json 的读者会把
      // 「没审到」当成「没问题」。
      console.error(`\n✗ Error auditing ${url}: ${e.message}`);
      results.push({ url, fetchError: e.message, issues: [] });
    }
  }

  if (flags.json) {
    console.log(JSON.stringify(results, null, 2));
  } else if (results.length > 1) {
    printSummary(results);
  }

  // Fix report: machine-readable list of all issues
  if (flags.fixReport) {
    console.log('\n\n=== FIX REPORT (machine-readable) ===');
    for (const r of results) {
      if (r.fetchError) { console.log(JSON.stringify({ url: r.url, fetchError: r.fetchError })); continue; }
      for (const i of r.issues) {
        console.log(JSON.stringify({ url: r.url, ...i }));
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
