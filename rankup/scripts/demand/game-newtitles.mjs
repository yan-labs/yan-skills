#!/usr/bin/env node
/**
 * game-newtitles.mjs —— 「持续涌现新词」的游戏源取数
 *
 * 用途：
 *   新游戏 = 新词 = 新需求。游戏标题在发布当天基本没有竞争页面，对新站极友好
 *   （攻略 / 兑换码 / 是否免费 / unblocked / 类似游戏 / 能不能联机……都是现成长尾）。
 *   本脚本从多个源批量拉「新上架 / 即将发布 / 最近新增」的游戏标题，
 *   下游再交给 KD / Trends 脚本验证词的热度与难度。
 *
 * 支持的源 (--source)：
 *   steam    Steam 商店搜索的 infinite JSON 端点（公开、无 token）—— 首选
 *   itch     itch.io 列表页的 ?format=json 端点（公开、无 token）
 *   poki     poki.com 列表页 HTML 解析（公开、无 token）
 *   igdb     IGDB 官方 API，走 Twitch OAuth（需要 IGDB_CLIENT_ID / IGDB_CLIENT_SECRET）
 *   steamdb  steamdb.info —— 纯 HTTP 403，必须走 OpenCLI 真浏览器；独有「Follows
 *            关注人数 + 7 日增量」= 发售前的需求强度排序（Steam 官方端点没有这个）
 *
 * 示例命令：
 *   node game-newtitles.mjs --source steam --count 40
 *   node game-newtitles.mjs --source steam --sort Released_DESC --details --count 10
 *   node game-newtitles.mjs --source steam --upcoming --count 40
 *   node game-newtitles.mjs --source itch --pages 2 --json
 *   node game-newtitles.mjs --source poki --path /en/new
 *   node game-newtitles.mjs --source igdb --days 7 --count 50 --out games.jsonl --jsonl
 *   node game-newtitles.mjs --source steamdb --sdb-path /upcoming/ --session demand-x-sdb
 *
 * 依赖：
 *   - steam / itch / poki：无 token、无登录态
 *   - igdb：IGDB_CLIENT_ID + IGDB_CLIENT_SECRET
 *     读取顺序：环境变量 → rankup/.env（每行 KEY=value）
 *
 * 已验证日期：2026-08-24
 *
 * 已知坑：
 *   - steam：用的是 /search/results/?infinite=1，返回 {success, total_count, results_html}，
 *     里面是 HTML 片段，靠 class 选择器解析（search_result_row / .title / .search_released）。
 *     Valve 改版会断。返回里混着 DLC、原声带、软件；用 --details 调 appdetails 拿 type
 *     再过滤（appdetails 有速率限制，约每分钟 200 次，脚本默认串行 + sleep）。
 *   - steam --upcoming：未定档的作品 Steam 会填占位日期（"To be announced" / "Coming soon"
 *     或 2099/9998 这类假年份），别把 date 当真，判定用 extra.releasedRaw。
 *   - steam --details 每个 appid 一次请求，count 开大会很慢，且 429 后要等几分钟。
 *   - itch：?format=json 返回的是 {page, num_items, content:"<html片段>"}，仍要解析 HTML。
 *     未登录时列表按站点默认排序，没有下载量/评分字段（itch 不公开这些）。
 *   - poki：页面 class 名是构建期哈希（每次发版都变），所以只用 data-tile-* 属性定位，
 *     相对稳；但 Poki 完全不公开游戏数量/播放量，只能拿到标题 + URL。
 *   - igdb：Twitch token 有效期约 60 天，脚本每次现取不缓存。APICalypse 是自定义查询语言，
 *     不是 JSON；速率限制 4 请求/秒。
 *   - steamdb：https://steamdb.info/ 全站 Cloudflare 托管挑战，curl / fetch 一律 403
 *     （返回 "Just a moment..." 页，2026-08-23 实测 /upcoming/ 与站点根路径均 403）。
 *   - Steam「全量 app 清单」实测结论（2026-08-23 复测）：
 *     `api.steampowered.com/ISteamApps/GetAppList/v2/` → 404
 *     `Method 'GetAppList' not found in interface 'ISteamApps'`；
 *     `IStoreService/GetAppList/v1/` → 403（要 Steam Web API key）。
 *     key 的门槛：需要一个已登录的 Steam 账号 + 该账号必须**不是受限账号**
 *     （即累计消费达到 Valve 的解锁门槛）+ 填一个域名并同意 Web API 条款，
 *     领取页 `steamcommunity.com/dev/apikey` 匿名访问只会拿到登录页。
 *     免 key 的替代是 `--source steam-applist`（公开镜像快照，**有滞后**）。
 *   - `store.steampowered.com/feeds/newreleases.xml` 看着像「新品 RSS」，其实是
 *     人工策展的 "Now Available" 新闻，实测 30 条里最新一条是几周前、最老到 2020 年，
 *     **不能当新品清单用**。
 *   - steamspy.com/api.php 整站在 Cloudflare 挑战后面，任何 UA 都 403 + "Just a moment"，
 *     纯 HTTP 拿不到；要用得走真浏览器。
 *   - search 端点 `count` 的真实上限是 **100**：传 200 也只回 100 行，脚本按 100 分页。
 * *     所以 --source steamdb 走 OpenCLI 驱动用户本机真实 Chrome（不需要 SteamDB 账号，
 *     只是需要真浏览器过挑战）。列名随页面变（/upcoming/ 是 Name/%/Price/Rating/
 *     Release/Follows/7d Gain），脚本按表头名映射，换页面就换字段。
 *     价格按浏览器所在区服显示，不是美元。
 *     会话纪律：默认跑完自动 close；并行时用 --session 传带自己前缀的**字面常量**，
 *     绝不要用 $$，也绝不要跑 `opencli browser cleanup`。
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  sessionName, requireBrowserBridge, initEvidence, saveEvidence, recordSource,
  writeManifest, captureBrowserScene, evidenceDir,
} from './_lib.mjs';

const execFileP = promisify(execFile);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

const HELP = `game-newtitles.mjs — 新游戏标题批量取数（新游戏 = 新词 = 新需求）

用法:
  node game-newtitles.mjs --source <steam|steam-featured|steam-applist|itch|poki|igdb|steamdb> [选项]

通用:
  --count <n>        拉多少条            (默认 30)
  --json             输出 JSON 数组
  --jsonl            输出 JSON Lines
  --out <file>       落盘
  --sleep <ms>       请求间隔            (默认 500)
  -h, --help         本帮助

steam:
  --term <q>         搜索词              (默认 空 = 全部)
  --sort <key>       Released_DESC | Name_ASC | Price_ASC | Reviews_DESC ...
                                         (默认 Released_DESC)
  --upcoming         只看即将发布        (等价于 filter=comingsoon)
  --start <n>        偏移                (默认 0)
  --cc <cc>          区服                (默认 us)
  --lang <l>         语言                (默认 english)
  --details          对每条调 appdetails 补 type/genres/release (慢，有限流)
  --only-games       配合 --details，过滤掉 DLC / 原声带 / 软件

steam-featured (Valve 自己排的策展榜，一次请求四组):
  --bucket <b>       coming_soon | new_releases | top_sellers | specials
                     逗号分隔可多组，不传则四组全要
  --cc / --lang      同 steam

steam-applist (全量 appid↔名称快照，GetAppList 下线后的替代):
  --term <q>         只保留名字里含该词的（本地过滤）
  --applist-url <u>  换一个镜像 URL
                     ⚠️ 是快照不是实时，不能当「最近上架」用

itch:
  --path <p>         列表路径            (默认 /games/newest)
  --pages <n>        翻几页              (默认 1，每页约 36 条)

poki:
  --path <p>         列表路径            (默认 /en/new)
  --tile-list <n>    只要某个板块的磁贴，如 basic-game（主列表）/ popularWeekGames
                     不传则全要。板块名见输出的 extra.list

igdb:
  --days <n>         最近 n 天内首发      (默认 7)
  --platform <id>    IGDB platform id 过滤，可逗号分隔 (默认 不限)

steamdb (需要 OpenCLI 真浏览器，Cloudflare 挡纯 HTTP):
  --sdb-path <p>     SteamDB 列表路径     (默认 /upcoming/)
  --session <s>      OpenCLI 会话名，带你自己前缀的字面常量 (默认 demand-steamdb)
  --keep-open        跑完/失败都不关标签页（排查时保住活现场）
  --timeout <ms>     页面就绪轮询预算     (默认 9000)
  --evidence-dir <d> 失败现场与 manifest 落点

输出字段: {source, name, url, domain, users, rating, ratingCount, date, extra}
`;

// ---------- env ----------
const __dir = dirname(fileURLToPath(import.meta.url));
function loadEnv(key) {
  if (process.env[key]) return process.env[key];
  const envPath = resolve(__dir, '../../.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && m[1] === key) return m[2].replace(/^["']|["']$/g, '');
    }
  }
  return null;
}

// ---------- args ----------
function parseArgs(argv) {
  const o = {
    source: null, count: 30, json: false, jsonl: false, out: null, sleep: 500,
    term: '', sort: 'Released_DESC', upcoming: false, start: 0, cc: 'us', lang: 'english',
    details: false, onlyGames: false,
    path: null, pages: 1, tileList: null,
    days: 7, platform: null,
    sdbPath: '/upcoming/', session: sessionName('demand-steamdb'), keepOpen: false, timeout: 9000,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const next = () => argv[++i];
    switch (a) {
      case '-h': case '--help': o.help = true; break;
      case '--source': o.source = next(); break;
      case '--count': o.count = Number(next()); break;
      case '--json': o.json = true; break;
      case '--jsonl': o.jsonl = true; break;
      case '--out': o.out = next(); break;
      case '--sleep': o.sleep = Number(next()); break;
      case '--term': o.term = next(); break;
      case '--sort': o.sort = next(); break;
      case '--upcoming': o.upcoming = true; break;
      case '--start': o.start = Number(next()); break;
      case '--cc': o.cc = next(); break;
      case '--lang': o.lang = next(); break;
      case '--details': o.details = true; break;
      case '--only-games': o.onlyGames = true; o.details = true; break;
      case '--path': o.path = next(); break;
      case '--pages': o.pages = Number(next()); break;
      case '--tile-list': o.tileList = next(); break;
      case '--days': o.days = Number(next()); break;
      case '--platform': o.platform = next(); break;
      case '--bucket': o.bucket = next(); break;
      case '--applist-url': o.applistUrl = next(); break;
      case '--sdb-path': o.sdbPath = next(); break;
      case '--session': o.session = next(); break;
      case '--keep-open': o.keepOpen = true; break;
      case '--timeout': o.timeout = Number(next()); break;
      case '--evidence-dir': o.evidenceDir = next(); break;
      default:
        if (a.startsWith('-')) { console.error(`未知参数: ${a}\n${HELP}`); process.exit(2); }
    }
  }
  return o;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)));
const strip = (s) => decode(s.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
const domainOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return null; } };

async function get(url, headers = {}) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', ...headers } });
  if (!res.ok) {
    // HTTP 源失败先存响应体：403 挑战页/429 配额页和「端点变了」在响应体里长得不一样。
    const body = await res.text().catch(() => null);
    const f = saveEvidence(`http-${Date.now()}-${res.status}.json`, { url, status: res.status, body });
    throw new Error(`HTTP ${res.status} ${url}（响应体已留 ${f}）`);
  }
  return res;
}

function rec(source, name, url, extra = {}, over = {}) {
  return {
    source, name, url, domain: domainOf(url),
    users: null, rating: null, ratingCount: null, date: null,
    ...over, extra,
  };
}

// ---------- steam ----------
function parseSteamRows(html) {
  const out = [];
  const re = /<a href="(https:\/\/store\.steampowered\.com\/app\/(\d+)\/[^"]*)"[\s\S]*?data-ds-appid="\d+"[\s\S]*?<span class="title">([\s\S]*?)<\/span>[\s\S]*?<div class="search_released[^"]*">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({
      url: m[1].split('?')[0],
      appid: Number(m[2]),
      name: strip(m[3]),
      released: strip(m[4]) || null,
    });
  }
  return out;
}

async function sourceSteam(o) {
  const rows = [];
  let start = o.start;
  while (rows.length < o.count) {
    const want = Math.min(100, o.count - rows.length);
    const p = new URLSearchParams({
      start: String(start), count: String(want), sort_by: o.sort,
      infinite: '1', cc: o.cc, l: o.lang,
    });
    if (o.term) p.set('term', o.term);
    if (o.upcoming) p.set('filter', 'comingsoon');
    const res = await get(`https://store.steampowered.com/search/results/?query&${p}`);
    const data = await res.json();
    const batch = parseSteamRows(data.results_html || '');
    if (!batch.length) break;
    rows.push(...batch);
    start += want;
    await sleep(o.sleep);
  }
  const out = rows.slice(0, o.count).map((r) =>
    rec('steam', r.name, r.url, { appid: r.appid, releasedRaw: r.released }, { date: normDate(r.released) }));

  if (o.details) {
    for (const r of out) {
      try {
        const res = await get(`https://store.steampowered.com/api/appdetails?appids=${r.extra.appid}&cc=${o.cc}&l=${o.lang}&filters=basic,genres,release_date,price_overview`);
        const j = await res.json();
        const d = j?.[r.extra.appid]?.data;
        if (d) {
          r.extra.type = d.type;
          r.extra.genres = (d.genres || []).map((g) => g.description);
          r.extra.isFree = d.is_free;
          r.extra.price = d.price_overview?.final_formatted ?? null;
          if (d.release_date?.date) r.date = normDate(d.release_date.date) ?? r.date;
        }
      } catch (e) { r.extra.detailError = e.message; }
      await sleep(o.sleep);
    }
  }
  return o.onlyGames ? out.filter((r) => r.extra.type === 'game') : out;
}

function normDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// ---------- steam-featured（Steam 官方策展榜，不是搜索结果） ----------
// store.steampowered.com/api/featuredcategories 一次请求给回 6 个策展分组：
//   coming_soon / new_releases / top_sellers / specials（另有若干横幅位）。
// 和 --source steam（search 端点）的区别：这里是 Valve 自己排的序，
// 「即将发售」和「新品」两块的口径比 sort_by=Released_DESC 干净（不含 DLC / 原声带堆量），
// 但每组只有 10~30 条，要深翻仍然得回 --source steam。
const STEAM_FEATURED_BUCKETS = ['coming_soon', 'new_releases', 'top_sellers', 'specials'];

async function sourceSteamFeatured(o) {
  const buckets = (o.bucket ? String(o.bucket).split(',') : STEAM_FEATURED_BUCKETS)
    .map((s) => s.trim()).filter(Boolean);
  const bad = buckets.filter((b) => !STEAM_FEATURED_BUCKETS.includes(b));
  if (bad.length) throw new Error(`未知 --bucket ${bad.join(',')}；可选：${STEAM_FEATURED_BUCKETS.join(' / ')}`);

  const res = await get(`https://store.steampowered.com/api/featuredcategories?cc=${o.cc}&l=${o.lang}`);
  const data = await res.json();
  const out = [];
  for (const b of buckets) {
    const items = data?.[b]?.items ?? [];
    items.forEach((it, i) => {
      const appid = it.id ?? it.appid;
      out.push(rec('steam-featured', it.name, `https://store.steampowered.com/app/${appid}/`, {
        appid,
        bucket: b,
        rankInBucket: i + 1,
        discountPercent: it.discount_percent ?? null,
        finalPrice: typeof it.final_price === 'number' ? it.final_price / 100 : null,
        currency: it.currency ?? null,
        // coming_soon 里这个字段是发售日的 unix 秒；其它组通常没有
        releaseUnix: it.discount_expiration ?? null,
      }));
    });
  }
  return out.slice(0, o.count);
}

// ---------- steam-applist（全量 appid ↔ 名称，GetAppList 的替代） ----------
// api.steampowered.com/ISteamApps/GetAppList/v2 已下线，IStoreService/GetAppList/v1 要 API key。
// 唯一实测可用的免 key 全量表是 SteamCMD-AppID-List 这个公开镜像（~14MB JSON）。
// **它是快照，不是实时的**：实测最大 appid 明显落后于 Steam 现网，只适合做
// 「这个 appid 叫什么 / 这个名字有没有被占」的离线查表，不能当「最近上架」用。
const STEAM_APPLIST_MIRROR =
  'https://raw.githubusercontent.com/dgibbs64/SteamCMD-AppID-List/master/steamcmd_appid.json';

async function sourceSteamApplist(o) {
  const res = await get(o.applistUrl || STEAM_APPLIST_MIRROR);
  const data = await res.json();
  let apps = data?.applist?.apps ?? [];
  if (o.term) {
    const q = String(o.term).toLowerCase();
    apps = apps.filter((a) => String(a.name || '').toLowerCase().includes(q));
  }
  // appid 越大越新，倒序更接近「近期」
  apps = apps.slice().sort((a, b) => b.appid - a.appid);
  return apps.slice(0, o.count).map((a) =>
    rec('steam-applist', a.name, `https://store.steampowered.com/app/${a.appid}/`, {
      appid: a.appid,
      snapshot: true,
    }));
}

// ---------- itch ----------
function parseItchCells(html) {
  // 2026-08-23 修：itch 把 <a> 的属性顺序换成了 href 在前、class 在后，
  // 原来那条要求 `<a class="title game_link" ... href=` 的正则于是一条都匹配不上，
  // 而失败形态是「返回 0 条」而不是报错——静默的空结果，最难自查。
  // 现在改成先按 data-game_id 切块，再在块内按属性名各自取值，不依赖属性顺序。
  const out = [];
  const chunks = html.split(/<div[^>]*data-game_id="(\d+)"/).slice(1);
  for (let i = 0; i + 1 < chunks.length; i += 2) {
    const gameId = Number(chunks[i]);
    const cell = chunks[i + 1];
    const titleBlock = /<div class="game_title">([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? '';
    const titleA = /<a\b([^>]*)>([\s\S]*?)<\/a>/.exec(titleBlock);
    if (!titleA) continue;
    const url = /href="([^"]+)"/.exec(titleA[1])?.[1] ?? null;
    const name = strip(titleA[2]);
    if (!url || !name) continue;
    const authorBlock = /<div class="game_author">([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? '';
    const author = strip(/<a\b[^>]*>([\s\S]*?)<\/a>/.exec(authorBlock)?.[1] ?? '') || null;
    const price = /<div class="price_value">([^<]*)<\/div>/.exec(cell)?.[1] ?? null;
    const desc = /<div class="game_text">([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? null;
    const genre = strip(/<div class="game_genre">([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? '') || null;
    const platform = strip(/<div class="game_platform">([\s\S]*?)<\/div>/.exec(cell)?.[1] ?? '') || null;
    out.push({
      gameId, url, name, author,
      price: price ? decode(price) : null,
      summary: desc ? strip(desc) : null,
      genre, platform,
    });
  }
  return out;
}

async function sourceItch(o) {
  const path = o.path || '/games/newest';
  const out = [];
  try {
    for (let p = 1; p <= o.pages && out.length < o.count; p++) {
      const sep = path.includes('?') ? '&' : '?';
      const res = await get(`https://itch.io${path}${sep}page=${p}&format=json`, { Accept: 'application/json' });
      const j = await res.json();
      const html = typeof j === 'string' ? j : (j.content || '');
      for (const c of parseItchCells(html)) {
        // itch 也有 genre 字段，抓不到就算了
        out.push(rec('itch.io', c.name, c.url,
          { gameId: c.gameId, author: c.author, price: c.price, summary: c.summary,
            genre: c.genre, platform: c.platform }));
        if (out.length >= o.count) break;
      }
      await sleep(o.sleep);
    }
    return out;
  } catch (error) {
    if (!/HTTP 429\b/.test(String(error?.message ?? error))) throw error;
  }

  // itch 的公开 JSON 偶发按请求 UA 限流；真实浏览器能读取同一份公开列表。
  const session = sessionName('demand-itch');
  const run = async (args) => (await execFileP('opencli', args, { maxBuffer: 32 * 1024 * 1024 })).stdout;
  const rows = [];
  const extractor = `(()=>({rows:[...document.querySelectorAll('[data-game_id]')].map((cell)=>{const text=(node)=>node?.textContent?.replace(/\\s+/g,' ').trim()||null;const title=cell.querySelector('.game_title a');const summary=cell.querySelector('.game_text');return {gameId:Number(cell.dataset.game_id)||null,url:title?.href||null,name:text(title),author:text(cell.querySelector('.game_author a')),price:text(cell.querySelector('.price_value')),summary:summary?.getAttribute('title')||text(summary),genre:text(cell.querySelector('.game_genre')),platform:text(cell.querySelector('.game_platform'))}}).filter((row)=>row.url&&row.name)}))()`;
  const close = async () => { try { await run(['browser', session, 'close']); } catch { /* 已关闭 */ } };
  requireBrowserBridge();
  try {
    for (let p = 1; p <= o.pages && rows.length < o.count; p++) {
      const sep = path.includes('?') ? '&' : '?';
      const url = `https://itch.io${path}${sep}page=${p}`;
      await run(['browser', session, '--window', 'isolated', 'open', url]);
      let payload = null;
      const deadline = Date.now() + 15000;
      do {
        await sleep(800);
        try {
          const raw = await run(['browser', session, 'eval', extractor]);
          const start = raw.indexOf('{'), end = raw.lastIndexOf('}');
          payload = start < 0 ? null : JSON.parse(raw.slice(start, end + 1));
        } catch { payload = null; }
      } while (!Array.isArray(payload?.rows) && Date.now() < deadline);
      if (!Array.isArray(payload?.rows)) throw new Error(`浏览器未能读取 itch 列表：${url}`);
      rows.push(...payload.rows);
    }
  } catch (error) {
    const scene = captureBrowserScene(session, 'itch-browser-fallback');
    recordSource({ source: 'itch.io', status: 'browser_error', rawCount: 0, error: String(error?.message ?? error), scene });
    writeManifest(`died: ${String(error?.message ?? error).slice(0, 200)}`);
    throw error;
  } finally {
    await close();
  }
  const result = rows.slice(0, o.count).map((c) => rec('itch.io', c.name, c.url,
    { gameId: c.gameId, author: c.author, price: c.price, summary: c.summary, genre: c.genre, platform: c.platform }));
  const evidence = saveEvidence('itch-browser-fallback.json', { rows: result });
  recordSource({ source: 'itch.io', status: 'ok', rawCount: result.length, transport: 'browser-fallback', evidence });
  writeManifest('completed');
  return result;
}

// ---------- poki ----------
async function sourcePoki(o) {
  const path = o.path || '/en/new';
  const res = await get(`https://poki.com${path}`);
  const html = await res.text();
  const out = [];
  const seen = new Set();
  const re = /<a[^>]*data-tile-url="([^"]+)"[^>]*data-tile-list="([^"]+)"[\s\S]{0,1600}?<span class="summaryTile__title[^"]*">([\s\S]*?)<\/span>/g;
  let m;
  while ((m = re.exec(html)) !== null && out.length < o.count) {
    const url = `https://poki.com${m[1]}`;
    if (seen.has(url)) continue;
    if (o.tileList && m[2] !== o.tileList) continue;
    seen.add(url);
    out.push(rec('poki', strip(m[3]), url, { list: m[2], slug: m[1].split('/').pop() }));
  }
  return out;
}

// ---------- igdb ----------
async function igdbToken() {
  const id = loadEnv('IGDB_CLIENT_ID');
  const secret = loadEnv('IGDB_CLIENT_SECRET');
  if (!id || !secret) {
    throw new Error(
      'IGDB 需要 IGDB_CLIENT_ID 和 IGDB_CLIENT_SECRET。\n' +
      '  取得方式：在 Twitch 开发者后台注册一个应用，拿 Client ID / Client Secret。\n' +
      '  设置方式：导出为环境变量，或写进 rankup/.env（每行 KEY=value）。');
  }
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`,
    { method: 'POST' });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) {
    throw new Error(`Twitch OAuth 失败 (HTTP ${res.status}): ${JSON.stringify(j)}`);
  }
  return { clientId: id, token: j.access_token };
}

async function sourceIgdb(o) {
  const { clientId, token } = await igdbToken();
  const since = Math.floor(Date.now() / 1000) - o.days * 86400;
  const now = Math.floor(Date.now() / 1000);
  const where = [`first_release_date > ${since}`, `first_release_date < ${now + 86400 * 400}`];
  if (o.platform) where.push(`platforms = (${o.platform})`);
  const body =
    `fields name,slug,url,first_release_date,total_rating,total_rating_count,` +
    `genres.name,platforms.abbreviation,summary;\n` +
    `where ${where.join(' & ')};\n` +
    `sort first_release_date desc;\nlimit ${Math.min(500, o.count)};`;
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
    body,
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`IGDB HTTP ${res.status}: ${txt.slice(0, 300)}`);
  const list = JSON.parse(txt);
  return list.map((g) => rec('igdb', g.name, g.url || `https://www.igdb.com/games/${g.slug}`, {
    id: g.id, slug: g.slug, summary: g.summary ?? null,
    genres: (g.genres || []).map((x) => x.name),
    platforms: (g.platforms || []).map((x) => x.abbreviation).filter(Boolean),
  }, {
    rating: g.total_rating != null ? Math.round(g.total_rating * 10) / 10 : null,
    ratingCount: g.total_rating_count ?? null,
    date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
  }));
}

// ---------- steamdb (OpenCLI 真浏览器) ----------
const SDB_EXTRACTOR = `(()=>{
  const t = document.querySelector('table');
  if (!t) return { count: 0, text: document.body.innerText.slice(0, 400), title: document.title };
  const hdr = [...t.querySelectorAll('thead th')].map((e) => e.innerText.trim());
  const rows = [...t.querySelectorAll('tbody tr')].map((tr) => {
    const cells = [...tr.querySelectorAll('td')];
    const o = { appid: tr.getAttribute('data-appid') };
    const link = tr.querySelector('a.b') || [...tr.querySelectorAll('a[href^="/app/"]')].find((a) => a.innerText.trim());
    o.name = link ? link.innerText.trim() : null;
    cells.forEach((td, i) => {
      const key = hdr[i] || ('col' + i);
      if (!key) return;
      const sort = td.getAttribute('data-sort');
      o[key] = { text: td.innerText.trim().replace(/\\s+/g, ' '), sort: sort === null ? null : sort };
    });
    return o;
  });
  return { count: rows.length, hdr, rows, title: document.title, url: location.href };
})()`;

async function sourceSteamdb(o) {
  const url = `https://steamdb.info${o.sdbPath}`;
  const run = async (args) => (await execFileP('opencli', args, { maxBuffer: 32 * 1024 * 1024 })).stdout;
  // `opencli doctor` 桥没连上也退出码 0，只是文案带 [FAIL]——单纯 catch 从来没生效过。
  // 真正判据在 requireBrowserBridge()：认 `[OK] Connectivity`，探测本身失败/超时就放行。
  requireBrowserBridge();
  initEvidence('game-newtitles', { dir: o.evidenceDir ?? null });

  // 先取证后关：失败路径先把截图+页面全文落证据目录，再关标签页（--keep-open 不关）。
  // 截图链路已实盘验证（2026-08-30 重构第二波）。
  const closeTab = async () => {
    if (o.keepOpen) return;
    try { await run(['browser', o.session, 'close']); } catch { /* 已关 */ }
  };
  const bail = async (tag, err, extra = null) => {
    const scene = captureBrowserScene(o.session, tag);
    if (extra != null) saveEvidence(`${tag}.json`, extra);
    recordSource({ source: `steamdb:${o.sdbPath}`, status: 'browser_error', rawCount: 0, error: String(err), scene });
    writeManifest(`died: ${String(err).slice(0, 200)}`);
    await closeTab();
    throw new Error(`${err}\n现场已留（截图+页面文本）：${evidenceDir()}${o.keepOpen ? '，标签页保持打开' : ''}`);
  };

  let payload = null;
  try {
    await run(['browser', o.session, '--window', 'background', 'open', url]);
  } catch (e) {
    await bail('steamdb-open-failed', `打开 ${url} 失败：${e.message}`);
  }
  // waitFor 不 sleep：在 --timeout 预算内轮询提取器，出表格就走，不傻等整个预算。
  const deadline = Date.now() + Math.max(o.timeout, 3000);
  do {
    await sleep(1200);
    try {
      const out = await run(['browser', o.session, 'eval', SDB_EXTRACTOR]);
      const i = out.indexOf('{'), j = out.lastIndexOf('}');
      payload = i < 0 ? null : JSON.parse(out.slice(i, j + 1));
    } catch { payload = null; /* CF 挑战期间 eval 可能不回，继续轮询 */ }
    if (payload?.count) break;
  } while (Date.now() < deadline);

  if (!payload) {
    await bail('steamdb-eval-failed', '轮询预算内 OpenCLI eval 一直没有返回 JSON（页面可能没打开/挑战没过）');
  }
  if (!payload.count) {
    // 留证陈述，不是结论：0 行表格可能是 Cloudflare 挑战没过完（加大 --timeout）、
    // 站点改版、或该列表真为空——哪一种由 AI 对着截图+全文判。
    await bail('steamdb-zero-rows', 'SteamDB 页面没解析到表格——这是「这次没取到」，不是「没有新游」。', payload);
  }
  recordSource({ source: `steamdb:${o.sdbPath}`, status: 'ok', rawCount: payload.count });
  writeManifest('completed');
  await closeTab();
  const num = (v) => { if (v == null) return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null; };
  return payload.rows.slice(0, o.count).map((r) => {
    const rel = r['Release'];
    const relTs = rel && rel.sort ? Number(rel.sort) : null;
    const follows = r['Follows'];
    const gain = r['7d Gain'];
    const rating = r['Rating'];
    const price = r['Price'];
    const raw = {};
    for (const [k, v] of Object.entries(r)) if (v && typeof v === 'object') raw[k] = v.text;
    const name = r.name || (r['Name'] ? r['Name'].text : null);
    return rec('steamdb', name, `https://steamdb.info/app/${r.appid}/`, {
      appid: r.appid ? Number(r.appid) : null,
      storeUrl: r.appid ? `https://store.steampowered.com/app/${r.appid}/` : null,
      follows: follows ? num(follows.sort ?? follows.text) : null,
      gain7d: gain ? num(gain.sort ?? gain.text) : null,
      price: price ? price.text : null,
      list: o.sdbPath,
      cells: raw,
    }, {
      rating: (() => { const v = rating ? num(rating.sort ?? rating.text) : null; return v == null || v < 0 ? null : v; })(),
      date: relTs && relTs > 1e9 && relTs < 4e9
        ? new Date(relTs * 1000).toISOString().slice(0, 10)
        : (rel ? normDate(rel.text) : null),
    });
  });
}

// ---------- output ----------
function printTable(rows) {
  if (!rows.length) { console.log('(无结果)'); return; }
  const head = ['date', 'source', 'name', 'url'];
  const body = rows.map((r) => [r.date || '-', r.source, (r.name || '').slice(0, 52), r.url]);
  const w = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  console.log(head.map((h, i) => h.padEnd(w[i])).join('  '));
  console.log(w.map((n) => '-'.repeat(n)).join('  '));
  for (const b of body) console.log(b.map((v, i) => (i === 3 ? v : v.padEnd(w[i]))).join('  '));
  console.log(`\n共 ${rows.length} 条`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help || !o.source) { console.log(HELP); if (!o.source && !o.help) process.exit(2); return; }

  const fn = {
    steam: sourceSteam, 'steam-featured': sourceSteamFeatured,
    'steam-applist': sourceSteamApplist,
    itch: sourceItch, poki: sourcePoki,
    igdb: sourceIgdb, steamdb: sourceSteamdb,
  }[o.source];
  if (!fn) { console.error(`未知 --source ${o.source}\n${HELP}`); process.exit(2); }

  const rows = await fn(o);
  const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
  if (o.out) {
    writeFileSync(o.out, o.jsonl ? jsonl + '\n' : JSON.stringify(rows, null, 2));
    console.error(`已写入 ${o.out} (${rows.length} 条)`);
  }
  if (o.jsonl) console.log(jsonl);
  else if (o.json) console.log(JSON.stringify(rows, null, 2));
  else printTable(rows);
}

main().catch((e) => { console.error(`错误: ${e.message}`); process.exit(1); });
