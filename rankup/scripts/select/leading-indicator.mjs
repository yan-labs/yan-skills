#!/usr/bin/env node
/**
 * 用途：候选生成器——从"领先指标"里挖选品候选，而不是从搜索量（滞后指标）。
 *
 *   核心链路：谁在买量 / 谁在冲榜 / 谁在真收钱 → 这需求是什么 → 网页端有没有人做 → 候选。
 *
 *   搜索量反映的是"已经有很多人在搜"——这是滞后指标，等你看到高搜索量，
 *   别人早就在做了。真正领先的信号是：广告主已经在这个方向持续投放
 *   （ads-transparency）、App 已经在这个品类冲进付费/畅销榜（appstore-charts /
 *   gplay-charts）、或者已经有人靠这个方向真金白银收到了钱（stripe-referring）——
 *   这些人比我们更早、用更贵的方式验证过需求。
 *
 *   **我们自己不买量，只读别人的买量行为当信号。** 这是硬约束，不是选项：
 *   本脚本没有任何"投广告"“提交榜单"之类的写操作，全部是只读采集。
 *
 * 依赖：无外部依赖（Node 内置 fs/path/crypto/child_process），复用同仓库
 *       scripts/demand/_lib.mjs 的 parseArgs/die/printTable/readToken（只读
 *       import，不修改 demand/ 下任何文件）；`scan` 通过子进程调用
 *       scripts/demand/{ads-transparency,appstore-charts,gplay-charts,
 *       stripe-referring}.mjs；`--web-check` 通过子进程调用本机的 `opencli`
 *       可执行文件（默认路径）或 scripts/demand/serp-query.mjs（付费兜底）。
 *
 * 缺 key 的降级策略（2026-09-12 修正，之前的草稿把"缺 key"当成能力开关，是错的）：
 *   四个主信号源 ads-transparency / appstore-charts / gplay-charts /
 *   stripe-referring **默认路径全部免 token**（不需要 SERPER_API_KEY、
 *   PRODUCTHUNT_TOKEN、TABAPI_KEY 这些），所以 `scan` 本身不存在"缺 key 降级"
 *   的问题——它就是直接可用的。
 *   唯一涉及 key 的地方是可选的 `--web-check`（"网页端有没有人做"初判）：
 *     1) 默认路径：`opencli google search`，免费，走本机已登录的 Chrome
 *        （opencli doctor 连通即可用，不需要任何 API key）。
 *     2) 只有 opencli 这条路径本身失败（没连上/超时/解析不出结果）时，
 *        才会看有没有配 SERPER_API_KEY，配了就用 serp-query.mjs 兜底。
 *     3) 两条都不行，才输出降级说明——说明里给的是**具体绕法**
 *        （跑 opencli doctor 检查连通性、加大 --timeout、改用 agent-reach
 *        的搜索路由手动查一次），不是"去申请一个 key"。
 *   也就是说，key 只被当成配额/性能提示，从来不是功能开关。
 *
 * 已知坑：
 *   - `opencli google search -f json` 的输出字段**已于 2026-09-12 真实联网验证**
 *     （`opencli doctor` 连通 OK 后跑了 `opencli google search "invoice generator"
 *     --lang en --limit 5 -f json`）：顶层直接是数组（不是 `{results:[...]}` 之类的
 *     包裹），每条形如 `{type:"result", title, url, snippet}`——和文档字段
 *     （type/title/url/snippet）完全一致，解析函数（extractOpencliSearchRows /
 *     factsFromOpencliSearch）不需要改。之后又用真实的 `scan --source ads
 *     --web-check` 跑通了完整链路（ads-transparency 拿候选 → opencli 搜索 →
 *     webPresence 落进 candidates.json，organicCount/topDomains 都对），
 *     `extractOpencliSearchRows` 里对"万一不是纯数组"的多种包裹形状防御
 *     保留下来纯粹是兜底（真实响应就是纯数组），字段一旦对不上，不会崩，
 *     只会把这一步标成"没解析出结果"进入降级说明。
 *   - "网页端有没有人做" 给出的是**计数事实**（有几条结果、涉及几个域名），
 *     不是判定——判读交给人，这一点和仓库里其它脚本（suggest.mjs/
 *     keyword-value.mjs/serp-query.mjs）的"只采集不判读"原则一致。
 *   - 候选去重键是 `${source}::${name的小写}`——同一个域名/App 在多次 scan
 *     里反复出现会累加 seenCount 而不是重复占位，**seenCount 本身就是一种
 *     信号**（同一个域名反复出现在"谁在买量/冲榜"里，说明这不是偶然）。
 *   - **2026-09-12 review 修正（静态核对 demand/ 源码发现的真实字段不一致，不是假设）**：
 *     1) ads-transparency 的 advertisers/creatives 两个子命令行形状不同，旧版靠
 *        `'domain' in row` 探测，探测不出来时默认当成 advertisers——字段一旦改名会
 *        静默映射错而不报错。现在改成 resolveAdsMode：优先用显式 `--ads-mode`（或从
 *        透传子命令自动识别），两种已知形状都不匹配时直接抛错并打印实际字段/期望字段/
 *        绕法，不会再悄悄摆烂成 advertisers。
 *     2) gplay-charts.mjs 的 `--ranking` 模式（HELP 里推荐的"更可信"模式）用字段名
 *        `rank`，默认搜索/分类列表模式才是 `position`——旧版只认 position，
 *        --ranking 模式下 extra.position 会一直悄悄是 null。现在 position/rank 都认。
 *     3) stripe-referring.mjs 的 `--json` 输出是给人读的中文列（域名/月份/…），真正
 *        的英文字段被塞进每行的 `_raw`——旧版只认顶层 `row.domain`，对着真实的
 *        `top --json`/`site --json` 输出永远拿不到值，每一行都会静默变成候选名
 *        "(unknown)"。现在依次试 `row.domain` → `row._raw.domain` → `row["域名"]`，
 *        三条都没有就抛错（并提示：多半是喂了 `months`/`site` 子命令，这两个子命令的
 *        行本来就没有"一行一个域名"的形状，候选生成器只认 `top`）。
 *
 * 产出：默认写进 <调用方 cwd>/.rankup/leading-indicator/candidates.json（机器读，
 *       累积型）+ candidates.md（人读表格），可用 --out-dir 覆盖目录。
 *       这里只产出候选，不做闸门判断——候选清单的下一步是喂进
 *       scripts/select/gate-runner.mjs 走七道闸门。
 *
 * 已验证：--help / --self-test 已跑通；`scan --dry-run` 对四个信号源都跑通过
 *   （只验证命令构造与落盘逻辑，没有真的 spawn 子进程/没有联网）。
 *   2026-09-12 补：真实联网跑通了 `scan --source ads --ads-mode advertisers
 *   --web-check -- advertisers "invoice generator" --region us --limit 3`——
 *   ads-transparency RPC 拿到候选、opencli google search 拿到 web-check 结果，
 *   candidates.json/candidates.md 落盘正确，全链路（含 --web-check）跑通。
 *
 * 2026-09-13 首跑复盘修复（344 候选：ads=1/appstore=150/gplay=150/stripe=43，
 * 暴露出 5 个毛病，逐条记录修法和已知局限，别再踩同样的坑）：
 *   1) **ads 源快速连续查询会撞 Google reCAPTCHA，撞上后原地重试仍然被封。**
 *      遵照 opencli skill 的既有结论（「撞上限的第一动作是 close，不是 sleep 重试；
 *      释放标签页本身就是退避」）——但要注意：ads-transparency.mjs 走的是纯
 *      fetch/curl 直连内部 RPC，**不经过 opencli、没有 Chrome 标签页可关**，
 *      所以这里"close 优先"的落地方式不是字面上关标签页，而是同一层意思的
 *      翻译：**侦测到被墙特征后立刻停手，不在原地重试同一件事**，并用跨进程
 *      持久化的冷却状态（`<out-dir>/block-state.json`）挡住"人/agent 手动连续
 *      再跑几次 scan"这种等价于重试的行为。`--web-check` 那条路径是真的走
 *      opencli（google search adapter），它默认 `--site-session ephemeral`，
 *      官方语义是每次命令结束就释放标签页——已经天然满足"close 优先"，这里
 *      补的是"侦测到被墙就不再让 opencli 打第二枪"+ 查询间真实节流（不用
 *      `opencli browser wait time`，1.8.7 版本这个命令报 "Waited 5s" 实测
 *      928ms 就返回，见 opencli skill 187 行；改用子进程 `sleep` 做真实阻塞）。
 *      详见 `detectBlockedSignal` / `checkCooldown` / `recordBlockEvent` /
 *      `syncSleepMs`。
 *   2) **`advertisers` 是广告主展示名/域名的字面子串匹配，不是语义搜索**，
 *      B2B 式长描述词几乎必然 0 命中。`--help` 和 0 命中时的运行时提示
 *      （见 `adsZeroHitAdvice`）都明确说清楚这一点，并给可操作的换词方向，
 *      **绝不能让 0 命中读成"这个方向没人投广告"**。
 *   3) **`--web-check` 默认查询对域名型候选（ads creatives / stripe）没用**——
 *      旧版拼 `<域名> online tool`，域名字面量本身就是最强 token，Google 只会
 *      把这个域名自己的页面搜出来。现在 `defaultWebCheckQuery` 会先判断候选是
 *      不是域名型（`isDomainLikeName`），域名型改查"这个域名背后的品牌名
 *      （ads creatives 有 `extra.advertiserName` 就优先用）+ alternative"，
 *      而不是查域名字面量本身；非域名型（appstore/gplay/ads advertisers 的
 *      公司名）保持原来的 `<名字> online tool`。
 *   4) **appstore/gplay 榜单前列全是巨头，独立开发者没有参考价值。**
 *      `classifyGiant`/`partitionGiants` 按「开发者名撞已知巨头名单
 *      （`KNOWN_GIANT_PUBLISHERS`，appstore 用 `extra.artist`、gplay 用
 *      `extra.developer`——后者是这次顺手从 gplay-charts.mjs 的 `--ranking`
 *      行里补进 `mapRowToCandidate` 的，原来这个字段被吞掉了）」或「gplay
 *      安装量 ≥ 阈值（默认 5000 万，`--max-installs` 可调）」两条判据过滤，
 *      默认开启、`--no-filter` 可关；过滤掉的不丢弃，累积写进
 *      `<out-dir>/filtered-giants.json`，`report --giants` 能单独看。
 *      **巨头名单是人工维护的示例清单，不是权威数据源，覆盖不全是已知局限**
 *      （见 `KNOWN_GIANT_PUBLISHERS` 顶部注释）。
 *   5) **跨源不聚类——本来是这个生成器最强的信号，之前被留在地上。**
 *      `clusterCandidates` 用「归一化后名字完全相等」做聚类判据（域名型剥
 *      TLD、公司名型去掉 Inc/LLC/App 等噪声词后逐字比较），**刻意不用任何
 *      模糊相似度/编辑距离/embedding**——宁可漏合并，不错误合并两个不同需求。
 *      除了候选名本身，appstore/gplay 候选还会用 `extra.artist`/
 *      `extra.developer`（开发者名）当第二把聚类钥匙，去匹配 ads 里同名的
 *      广告主候选——这是这次顺手打通的关键路径，否则"App 开发商同时也在
 *      投广告"这种最有价值的撞车信号会因为候选名和公司名字面不同而永远聚不上。
 *      每个簇保留全部原始候选（含各自的证据链接），不做任何字段合并/覆盖；
 *      按命中的独立信号源数量降序排序。挂在 `report --cluster` 下，落盘
 *      `<out-dir>/clusters.md`。**已知局限**：exact-match 聚类召回率不高，
 *      两个措辞不同但其实是同一需求的候选（比如 "Invoice Maker" vs
 *      "Invoice Pro"）不会被聚到一起——这是刻意的保守取舍，不是遗漏。
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { parseArgs, die, printTable, readToken } from '../demand/_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEMAND_DIR = path.resolve(HERE, '../demand');
const DEFAULT_DIR = '.rankup/leading-indicator';

// ── 信号源定义 ──────────────────────────────────────────────────────────────

export const SOURCE_META = {
  ads: { script: 'ads-transparency', signal: 'ads-spend', label: '广告投放透明度中心（谁在持续买量）' },
  appstore: { script: 'appstore-charts', signal: 'appstore-chart', label: 'App Store 付费/畅销榜' },
  gplay: { script: 'gplay-charts', signal: 'gplay-chart', label: 'Google Play 榜单' },
  stripe: { script: 'stripe-referring', signal: 'stripe-referrer', label: 'Stripe 引荐流量榜（谁在真收钱）' },
};
export const SOURCE_IDS = Object.keys(SOURCE_META);

// ── 纯函数：解析 / 映射 / 去重 / 渲染（自测只测这一段，离线可跑）───────────

/** demand 脚本 --json 的输出统一是一个"行对象数组"（见文件头 4 个源的确认）；
 * 这里额外防御几种"万一不是纯数组"的包裹形状，找不到就返回 []（不是崩溃）。 */
export function extractRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.rows)) return parsed.rows;
    for (const v of Object.values(parsed)) {
      if (Array.isArray(v) && (v.length === 0 || typeof v[0] === 'object')) return v;
    }
  }
  return [];
}

/** ads-transparency 的 advertisers/creatives 两个子命令，行形状不同。
 * 用于「显式声明的模式对不对得上实际字段」以及「探测两种形状都不匹配时该不该报错」。
 * 字段名照抄 scripts/demand/ads-transparency.mjs 文件头的「输出字段」注释（2026-09-12 静态核对，
 * 未联网重新验证——ads-transparency 本身是逆向内部 RPC，字段一旦变化只会体现在这份静态代码里，
 * 所以本文件也只能保证「和 ads-transparency.mjs 现在写的字段一致」，保证不了「Google 没有偷偷改协议」）。
 * creatives 独有：domain/daysRunning/creativeId/previewUrl/firstShown/lastShown/advertiserName/format；
 * advertisers 独有：kind/name/minAds/maxAds/verified/country（这两组字段名互不重叠，不存在两边都命中的情况——
 * 除非未来 ads-transparency.mjs 改了字段名，那正是本文件要报错提醒的场景）。 */
export const ADS_ROW_SHAPE = {
  creatives: ['domain', 'daysRunning', 'creativeId', 'previewUrl', 'firstShown', 'lastShown', 'advertiserName', 'format'],
  advertisers: ['kind', 'name', 'minAds', 'maxAds', 'verified', 'country'],
};

function fieldList(row) {
  return Object.keys(row || {}).join(', ') || '(空对象)';
}

/** 决定 ads 行到底是 creatives 还是 advertisers 形状。
 * declaredMode 有值（来自 --ads-mode 或从透传子命令自动识别）时以它为准，但仍会核对实际字段
 * 撑不撑得起这个声明——对不上就大声报错，而不是硬着头皮按声明的模式瞎映射。
 * declaredMode 没有值时退回字段探测，但两种形状都不匹配（或都匹配，说明字段被改到无法区分）
 * 时同样报错，不再像旧版那样直接默认成 advertisers。 */
export function resolveAdsMode(row, declaredMode = null) {
  const looksLike = (mode) => ADS_ROW_SHAPE[mode].some((f) => f in (row || {}));
  if (declaredMode) {
    if (!['creatives', 'advertisers'].includes(declaredMode)) {
      throw new Error(`--ads-mode 只能是 creatives 或 advertisers，收到「${declaredMode}」`);
    }
    if (!looksLike(declaredMode)) {
      throw new Error(
        `声明的 --ads-mode ${declaredMode} 和这一行实际字段对不上，没有命中任何期望字段。\n` +
        `实际字段：${fieldList(row)}\n` +
        `期望字段（命中任一即可）：${ADS_ROW_SHAPE[declaredMode].join(', ')}\n` +
        `说明 ads-transparency.mjs 的子命令和 --ads-mode 传的不是同一个，或者 ads-transparency.mjs 改了字段名——` +
        '后者需要同步更新本文件的 ADS_ROW_SHAPE。',
      );
    }
    return declaredMode;
  }
  const isCreatives = looksLike('creatives');
  const isAdvertisers = looksLike('advertisers');
  if (isCreatives && !isAdvertisers) return 'creatives';
  if (isAdvertisers && !isCreatives) return 'advertisers';
  throw new Error(
    (isCreatives && isAdvertisers
      ? '这一行同时命中了 creatives 和 advertisers 两种形状的特征字段，探测不出唯一结论。'
      : '这一行既不像 creatives 也不像 advertisers，两种已知形状都没命中——ads-transparency.mjs 可能改了字段名。') +
      `\n实际字段：${fieldList(row)}` +
      `\n期望 creatives 字段（任一）：${ADS_ROW_SHAPE.creatives.join(', ')}` +
      `\n期望 advertisers 字段（任一）：${ADS_ROW_SHAPE.advertisers.join(', ')}` +
      '\n绕法：① 显式传 --ads-mode creatives|advertisers 跳过探测（推荐，scan --source ads --ads-mode <mode> -- ...）；' +
      '② 如果确认是 ads-transparency.mjs 改了字段名，同步更新本文件的 ADS_ROW_SHAPE。',
  );
}

/** scan 时决定 ads 模式：显式 --ads-mode 优先；其次从透传给 ads-transparency.mjs 的子命令
 * （passthrough[0]）自动识别——那个子命令本来就必须是 advertisers/creatives 之一，
 * 否则 ads-transparency.mjs 自己会直接报错退出，所以这个推断是可靠的、不是猜。
 * 两条都没有时返回 null，交给 resolveAdsMode 退回字段探测（仍然会在两种形状都不匹配时报错）。 */
export function deriveAdsMode(args, passthrough) {
  const explicit = args?.['ads-mode'];
  if (explicit) {
    if (typeof explicit !== 'string' || !['creatives', 'advertisers'].includes(explicit)) {
      throw new Error(`--ads-mode 只能是 creatives 或 advertisers，收到「${explicit}」`);
    }
    return explicit;
  }
  const sub = passthrough?.[0];
  return sub === 'creatives' || sub === 'advertisers' ? sub : null;
}

/** 把某个信号源的一行原始数据，映射成统一的候选形状 {name, evidenceUrl, extra}。
 * 硬要求（2026-09-12 补）：任何一个源的行形状对不上代码里假设的字段，必须可见地报错或告警，
 * 不能静默退化成"这个数据源没数据"——这是本项目反复吃过亏的失败模式。
 *   - ads：见上面 resolveAdsMode，显式声明或探测都对不上就报错，不再默认落到 advertisers。
 *   - gplay：scripts/demand/gplay-charts.mjs 的 --ranking 模式用字段名 rank，默认列表/搜索模式
 *     用字段名 position（2026-09-12 静态核对 gplay-charts.mjs 源码发现，此前只认 position，
 *     --ranking 模式——也是 HELP 里推荐的模式——下 extra.position 会一直是 null）；两个字段同一个
 *     语义（排名），一并接受，不当成异常。
 *   - stripe：scripts/demand/stripe-referring.mjs 的 --json 出的是给人读的中文列（月份/域名/…），
 *     真正的英文字段被塞进每行的 _raw（2026-09-12 静态核对 stripe-referring.mjs 源码发现，此前
 *     只认顶层 row.domain，对着 `top --json`/`site --json` 的真实输出永远拿不到值，
 *     每一行都会静默变成候选名"(unknown)"）；这里改成顶层 domain → _raw.domain → 中文列「域名」
 *     依次兜底，三条都没有就报错，不再吞成"(unknown)"。 */
export function mapRowToCandidate(source, row, opts = {}) {
  switch (source) {
    case 'ads': {
      const mode = resolveAdsMode(row, opts.adsMode ?? null);
      if (mode === 'creatives') {
        return {
          name: row.domain || row.advertiserId || '(unknown)',
          evidenceUrl: row.previewUrl || row.url || null,
          extra: {
            mode: 'creatives', advertiserId: row.advertiserId ?? null, format: row.format ?? null,
            daysRunning: row.daysRunning ?? null, firstShown: row.firstShown ?? null, lastShown: row.lastShown ?? null,
            // advertiserName 之前被吞掉了：它是「这个域名背后是哪家公司」的关键字段，
            // domain-aware web-check（defaultWebCheckQuery）和跨源聚类（candidateClusterKeys）
            // 都要靠它把「同一家公司」从 ads/appstore/gplay 里连起来。
            advertiserName: row.advertiserName ?? null,
          },
        };
      }
      return {
        name: row.name || row.advertiserId || '(unknown)',
        evidenceUrl: row.url || null,
        extra: { mode: 'advertisers', advertiserId: row.advertiserId ?? null, country: row.country ?? null, minAds: row.minAds ?? null, maxAds: row.maxAds ?? null, verified: row.verified ?? null },
      };
    }
    case 'appstore':
      return {
        name: row.name || row.appId || '(unknown)', evidenceUrl: row.url || null,
        extra: { rank: row.rank ?? null, chart: row.chart ?? null, country: row.country ?? null, artist: row.artist ?? null, genres: row.genres ?? null },
      };
    case 'gplay':
      return {
        name: row.name || row.appId || '(unknown)', evidenceUrl: row.url || null,
        extra: {
          position: row.position ?? row.rank ?? null, rating: row.rating ?? null, installs: row.installs ?? null,
          // developer 之前没有被映射进来：--ranking 模式（HELP 推荐的模式）的行里一直带着这个
          // 字段，是「按开发者规模过滤巨头」（classifyGiant）和跨源聚类的开发者钥匙的数据来源。
          developer: row.developer ?? null,
        },
      };
    case 'stripe': {
      const raw = row && typeof row._raw === 'object' && row._raw ? row._raw : null;
      const domain = row.domain ?? raw?.domain ?? row['域名'] ?? null;
      if (!domain) {
        throw new Error(
          '这一行 stripe-referring 数据找不到域名字段（依次试过 row.domain / row._raw.domain / row["域名"]，都没有）。\n' +
          `实际字段：${fieldList(row)}\n` +
          '最常见原因：用的是 `months` 子命令——那是按月汇总，本来就没有单个域名，不该喂给候选生成器；\n' +
          '候选生成器要用 `top` 子命令（`site` 子命令也不行，它是单个已知域名的历史曲线，同样没有逐行域名）。\n' +
          '如果确实用的是 `top --json` 还报这个错，说明 stripe-referring.mjs 改了输出字段，需要同步更新本文件。',
        );
      }
      const visits = row.visits ?? raw?.visits ?? null;
      const isNew = row.isNew ?? raw?.isNew ?? null;
      return { name: domain, evidenceUrl: `https://${domain}`, extra: { visits, isNew } };
    }
    default:
      throw new Error(`未知信号源：${source}（可选 ${SOURCE_IDS.join(', ')}）`);
  }
}

/** 原始行 → 完整候选记录（带去重键、来源标签、发现时间）。
 * adsMode 只对 source==='ads' 有意义，透传给 mapRowToCandidate 的 resolveAdsMode。 */
export function buildCandidate(source, row, { discoveredAt = new Date().toISOString(), rawEvidenceFile = null, adsMode = null } = {}) {
  const meta = SOURCE_META[source];
  if (!meta) throw new Error(`未知信号源：${source}（可选 ${SOURCE_IDS.join(', ')}）`);
  const mapped = mapRowToCandidate(source, row, { adsMode });
  const key = `${source}::${String(mapped.name).toLowerCase()}`;
  return {
    key, source, script: meta.script, signal: meta.signal, signalLabel: meta.label,
    name: mapped.name, evidenceUrl: mapped.evidenceUrl, extra: mapped.extra,
    webPresence: null, discoveredAt,
    rawEvidenceFiles: rawEvidenceFile ? [rawEvidenceFile] : [],
  };
}

/** 累积合并：同一 key 再次出现时 seenCount++（这本身是信号，不是噪音要去掉），
 * 并用新的证据/网页检测结果覆盖旧的（越新越准）。纯函数，不做文件 I/O。 */
export function mergeCandidates(existing, incoming) {
  const map = new Map(existing.map((c) => [c.key, c]));
  for (const inc of incoming) {
    const prev = map.get(inc.key);
    if (prev) {
      map.set(inc.key, {
        ...prev,
        evidenceUrl: inc.evidenceUrl || prev.evidenceUrl,
        extra: { ...prev.extra, ...inc.extra },
        webPresence: inc.webPresence ?? prev.webPresence ?? null,
        rawEvidenceFiles: [...(prev.rawEvidenceFiles || []), ...(inc.rawEvidenceFiles || [])],
        seenCount: (prev.seenCount || 1) + 1,
        firstSeenAt: prev.firstSeenAt || prev.discoveredAt,
        lastSeenAt: inc.discoveredAt,
      });
    } else {
      map.set(inc.key, { ...inc, seenCount: 1, firstSeenAt: inc.discoveredAt, lastSeenAt: inc.discoveredAt });
    }
  }
  return [...map.values()];
}

/** opencli `google search -f json` 输出的防御性解析：字段是 type/title/url/snippet，
 * 2026-09-12 真实联网跑过，响应外层就是纯数组，不是包裹形状——`for` 循环那几种包裹
 * 只是兜底防御（万一以后套了一层），不是"实测出来的真实形状"。 */
export function extractOpencliSearchRows(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    for (const k of ['rows', 'results', 'data', 'items']) if (Array.isArray(parsed[k])) return parsed[k];
    for (const v of Object.values(parsed)) if (Array.isArray(v)) return v;
  }
  return [];
}

/** opencli 搜索结果 → 网页端信号事实（计数，不是判定）。 */
export function factsFromOpencliSearch(rows, query) {
  const withUrl = rows.filter((r) => r && r.url);
  const domains = withUrl.map((r) => { try { return new URL(r.url).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean);
  return {
    query, organicCount: rows.length, topDomains: [...new Set(domains)].slice(0, 10),
    note: '这些是 Google 搜索结果页的计数事实（免费路径，走已登录 Chrome），不是"网页端有没有人做"的结论——仍需人工过一遍搜索结果页确认。',
  };
}

/** serp-query.mjs（serper.dev）的 --json 结果 → 网页端信号事实，付费兜底路径专用。 */
export function extractWebPresenceFacts(serpResult, query) {
  if (!serpResult || !serpResult.derived) return null;
  const d = serpResult.derived;
  const domains = (serpResult.organic || []).slice(0, 10)
    .map((r) => { try { return new URL(r.link).hostname.replace(/^www\./, ''); } catch { return null; } }).filter(Boolean);
  return {
    query: query ?? serpResult.keyword, organicCount: (serpResult.organic || []).length,
    exactDomainMatch: d.exactDomainMatch ?? null, partialDomainMatch: d.partialDomainMatch ?? null,
    homepages: d.homepages ?? null, innerPages: d.innerPages ?? null,
    topDomains: [...new Set(domains)].slice(0, 10),
    note: '这些是 SERP 盘面的计数事实，不是"网页端有没有人做"的结论——判读见 references/demand-sources.md「SERP 盘面怎么读」。',
  };
}

/** 候选清单渲染成人读 Markdown。纯函数。 */
export function renderCandidatesMarkdown(candidates) {
  const L = [];
  L.push('# 领先指标候选清单');
  L.push('');
  L.push('谁在买量 / 谁在冲榜 / 谁在真收钱 → 这需求是什么 → 网页端有没有人做 → 候选。');
  L.push('**这里不产生选品结论，只是候选**——我们自己不买量，只读别人的买量行为当信号。');
  L.push('下一步：把想深挖的候选喂进 `gate-runner.mjs` 走七道闸门。');
  L.push('');
  L.push(`共 ${candidates.length} 条，来自：${[...new Set(candidates.map((c) => c.source))].join(', ') || '（无）'}`);
  L.push('');
  L.push('| 候选 | 信号来源 | 出现次数 | 证据 | 网页端信号 | 最近一次出现 |');
  L.push('|---|---|---|---|---|---|');
  const sorted = [...candidates].sort((a, b) => (b.seenCount || 1) - (a.seenCount || 1));
  for (const c of sorted) {
    const name = String(c.name).replace(/\|/g, '\\|');
    const web = !c.webPresence ? '未检测'
      : c.webPresence.checked === false ? `未检测（${String(c.webPresence.note || '').replace(/\|/g, '\\|').slice(0, 50)}…）`
        : `${c.webPresence.method}：${c.webPresence.facts?.organicCount ?? '?'} 条结果 / ${(c.webPresence.facts?.topDomains || []).length} 个域名`;
    L.push(`| ${name} | ${c.signalLabel} | ${c.seenCount || 1} | ${c.evidenceUrl ? `[链接](${c.evidenceUrl})` : '—'} | ${web} | ${(c.lastSeenAt || c.discoveredAt || '').slice(0, 19)} |`);
  }
  return L.join('\n');
}

// ── 纯函数（续）：2026-09-13 首跑复盘修复（1 被墙检测 / 2 0命中提示 /
//    3 域名型 web-check 默认查询 / 4 榜单巨头过滤 / 5 跨源聚类）──────────────

/** 【修复 1】被墙/验证码特征侦测。纯字符串匹配，喂 stdout+stderr 拼接文本。
 * 覆盖两类真实会遇到的响应：(a) opencli 走真实 Chrome 撞到 Google 的人机校验页；
 * (b) ads-transparency.mjs 的纯 fetch/curl 直连 RPC 被 Google 判定成异常流量时
 * 返回的不是 JSON 而是一段人机校验 HTML（这种情况下 ads-transparency.mjs 自己会
 * JSON.parse 失败并把响应体前 200 字符打进 stderr——那段文本里通常就带着这里列的
 * 特征词）。命中即返回 {blocked:true, matched:<命中的正则源码>}，方便日志定位是
 * 哪条判据触发的；没命中返回 null（不是「一定没被墙」，只是「这次没找到已知特征」，
 * 这一点在调用方的报告文案里要说清楚，不能包装成「确认没被墙」）。 */
const BLOCK_SIGNAL_PATTERNS = [
  /recaptcha/i,
  /unusual traffic/i,
  /captcha/i,
  /automated (queries|requests)/i,
  /our systems have detected/i,
  /verify (you're|you are)( a| not a)? ?(human|robot)/i,
  /too many requests/i,
  /rate[-\s]?limit(ed|ing)?/i,
  /\bHTTP\/?\s*429\b/i,
  /google\.com\/sorry\//i,
];
export function detectBlockedSignal(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  for (const re of BLOCK_SIGNAL_PATTERNS) {
    if (re.test(s)) return { blocked: true, matched: re.source };
  }
  return null;
}

/** 【修复 1】跨进程持久化的"被墙冷却"状态，落在 `<out-dir>/block-state.json`。
 * 为什么要跨进程持久化：ads 源一次 scan 只发一次请求，"连续撞墙"这件事发生在
 * 「人/agent 手动连续跑了好几次 scan」的时间尺度上，不是单个进程内的循环——
 * 单进程内部状态防不住这个，必须落盘。channel 用来区分不同的被墙对象（比如
 * `scan:ads` 和 `web-check:opencli` 该分开计数，一个被墙不该连累另一个）。 */
const BLOCK_THRESHOLD = 2; // 连续几次判定被墙，就触发熔断冷却（不是「第一次就封杀」，避免误判一次就长时间不可用）
const BLOCK_COOLDOWN_MINUTES_LADDER = [5, 15, 60]; // 第 N 次熔断（N=threshold, threshold+1, ...）分别退避多久，封顶最后一档

function blockStatePath(outDir) { return path.join(outDir, 'block-state.json'); }

export function loadBlockState(outDir) {
  const p = blockStatePath(outDir);
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}

function saveBlockState(outDir, state) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(blockStatePath(outDir), JSON.stringify(state, null, 2) + '\n');
}

/** 冷却期检查：调用真正的网络动作之前先问一句"这个 channel 现在能不能跑"。
 * 这是"close 优先于 sleep"落地成跨进程状态之后的效果——被墙过的 channel 在
 * 冷却期内会被这里直接挡住，不会再发起新的请求，不需要靠调用方记得"别重试"。 */
export function checkCooldown(outDir, channel, now = Date.now()) {
  const entry = loadBlockState(outDir)[channel];
  if (entry && entry.cooldownUntil && entry.cooldownUntil > now) {
    return { blocked: true, until: entry.cooldownUntil, consecutiveBlocks: entry.consecutiveBlocks, reason: entry.lastReason || null };
  }
  return { blocked: false };
}

/** 记一次判定结果：blocked=true 时连续计数 +1，达到阈值就设置/续期冷却截止时间
 * （退避时长按 BLOCK_COOLDOWN_MINUTES_LADDER 阶梯式变长，封顶最后一档，避免
 * 无限增长）；blocked=false 时清零计数（说明这个 channel 又正常了，不该被
 * 上一次的旧记录一直拖着）。返回写回去的那条记录，调用方直接用来拼报告文案。 */
export function recordBlockEvent(outDir, channel, { blocked, reason = null, now = Date.now(), threshold = BLOCK_THRESHOLD } = {}) {
  const state = loadBlockState(outDir);
  const prev = state[channel] || { consecutiveBlocks: 0, cooldownUntil: 0 };
  const consecutiveBlocks = blocked ? prev.consecutiveBlocks + 1 : 0;
  let cooldownUntil = 0;
  if (blocked && consecutiveBlocks >= threshold) {
    const rung = Math.min(consecutiveBlocks - threshold, BLOCK_COOLDOWN_MINUTES_LADDER.length - 1);
    cooldownUntil = now + BLOCK_COOLDOWN_MINUTES_LADDER[rung] * 60_000;
  } else if (blocked) {
    cooldownUntil = prev.cooldownUntil || 0;
  }
  state[channel] = { consecutiveBlocks, cooldownUntil, lastAt: now, lastReason: blocked ? reason : null };
  saveBlockState(outDir, state);
  return state[channel];
}

/** 【修复 1】查询间的真实节流。**不用 `opencli browser wait time`**——opencli skill
 * 187 行记录过它在 1.8.7 是坏的（报 "Waited 5s"，实测 928ms 就返回），写错了整套
 * 节流会静默失效。这里改用子进程 `sleep`（macOS/Linux 都有）做同步阻塞，拿不到
 * `sleep` 命令时退化成忙等——忙等也是真实阻塞，不是挂一个没人 await 的 Promise。 */
export function syncSleepMs(ms) {
  if (!ms || ms <= 0) return;
  const r = spawnSync('sleep', [String(ms / 1000)], { stdio: 'ignore' });
  if (r.error) {
    const end = Date.now() + ms;
    while (Date.now() < end) { /* 忙等兜底：没有 sleep 命令的环境也要是真阻塞 */ }
  }
}

/** 【修复 2】advertisers 0 命中时的可操作提示。核心是不能让人把"0 命中"读成
 * "这个方向没人投广告"——它就是字面子串匹配，B2B 式长描述词天然容易扑空。 */
export function adsZeroHitAdvice(query) {
  const q = query ? `本次查询词「${query}」` : '本次查询词';
  return [
    '0 命中 ≠ 这个方向没人投广告：ads-transparency 的 advertisers 子命令做的是',
    '「按广告主展示名/域名做字面子串匹配」，不是语义搜索，B2B 式长描述词天然容易扑空。',
    `${q}很可能只是没有广告主把这几个字原样放进公司名/域名里。`,
    '可操作的改法（任选其一再试）：',
    '  1) 换更短的词根——去掉修饰词，只留核心名词（如把 "invoice generator online" 缩成 "invoice"）',
    '  2) 换成已知品牌名而不是品类词——广告主登记的是公司/产品名，不是品类描述',
    '     （如用具体产品名而不是 "accounting software" 这种品类词）',
    '  3) 先用已知能命中的示例词确认链路本身没坏：advertisers "canva"、advertisers "notion"、advertisers "shopify"',
    '  4) 结果里也会混入网域建议（不只是公司名），0 条也可能是这批词恰好两类都没压中，换个域名片段再试',
  ].join('\n');
}

/** 从透传给 ads-transparency.mjs 的参数里抠出那个查询词，纯粹用于拼诊断文案，
 * 抠不出来就返回 null（提示文案会退化成不带具体查询词的版本，不影响功能）。 */
export function extractAdsQueryArg(passthrough) {
  for (let i = 1; i < passthrough.length; i++) {
    const a = passthrough[i];
    if (a.startsWith('--')) { i++; continue; }
    return a;
  }
  return null;
}

/** 【修复 3】域名型 vs 品类型候选的判据：有没有"至少一个点分隔、且看起来像域名"的形状。
 * 不追求 RFC 精确，只要求"像域名"，够用于挑选 web-check 默认查询策略。 */
export function isDomainLikeName(name) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(String(name || '').trim());
}

const COMPOUND_TLDS = new Set(['co.uk', 'com.cn', 'com.au', 'co.jp', 'com.br', 'co.in', 'com.mx', 'co.nz', 'com.hk', 'co.kr']);

/** 从域名里剥掉 TLD（含常见双段 TLD），把剩下的标签用空格连起来当查询短语。
 * 不是"注册域名"精确算法，是够用于拼搜索词的启发式——TLD 剥不干净不会崩，
 * 顶多查询词里多带一段，不影响功能，只是不够精准。 */
export function domainKeywordPhrase(domain) {
  const host = String(domain || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) return host;
  const lastTwo = labels.slice(-2).join('.');
  const stripCount = labels.length >= 3 && COMPOUND_TLDS.has(lastTwo) ? 2 : 1;
  const kept = labels.slice(0, Math.max(1, labels.length - stripCount));
  const phrase = kept.join(' ').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  return phrase || host;
}

/** 【修复 3】--web-check 默认查询策略：域名型候选不再把域名字面量拼进查询词
 * （旧版 `<域名> online tool` 只会搜到域名自己）——改查"这个域名/品牌背后是什么
 * 需求、网页端还有谁在做"，有 advertiserName（ads creatives 才有）就优先用它，
 * 没有就退回从域名本身剥出来的短语。非域名型（品类型：公司名/App 名）维持原策略。 */
export function defaultWebCheckQuery(candidate) {
  const name = String(candidate?.name ?? '');
  if (isDomainLikeName(name)) {
    const brand = candidate?.extra?.advertiserName;
    const phrase = brand && String(brand).trim() ? String(brand).trim() : domainKeywordPhrase(name);
    return `"${phrase}" alternative`;
  }
  return `${name} online tool`;
}

/** 【修复 4】人工维护的"已知巨头"名单——不是权威数据源，覆盖不全是已知局限。
 * 只收全球级、大到不需要证明的发行商，避免误伤中大型但仍在独立开发者可参考
 * 范围内的公司。命中方式是大小写不敏感子串匹配（"Google LLC" 命中 "google"）。 */
export const KNOWN_GIANT_PUBLISHERS = [
  'google', 'alphabet inc', 'meta platforms', 'facebook', 'microsoft', 'apple inc',
  'amazon', 'bytedance', 'tiktok', 'tencent', 'netease', 'alibaba', 'samsung',
  'adobe', 'salesforce', 'sony', 'electronic arts', 'ea games', 'ea mobile', 'zynga',
  'activision', 'king digital', 'spotify', 'netflix', 'twitter', 'x corp', 'snap inc',
  'linkedin', 'yahoo', 'baidu', 'xiaomi', 'huawei', 'gameloft', 'ubisoft', 'disney',
  'warner bros', 'warnermedia', 'nbcuniversal', 'ibm', 'oracle', 'sap se', 'intuit',
  'shopify', 'paypal', 'riot games', 'supercell', 'rovio', 'miniclip', 'glu mobile',
  'take-two', 'garena', 'sega', 'nintendo', 'square enix', 'capcom', 'bandai namco',
];
export function isLikelyGiantPublisher(nameOrArtist) {
  const s = String(nameOrArtist || '').toLowerCase().trim();
  if (!s) return false;
  return KNOWN_GIANT_PUBLISHERS.some((g) => s.includes(g));
}

/** 把 "1.2M+" / "500K+" / "1B+" / "1,234,567" 这类安装量文案解析成数值，
 * 解析不出来返回 null（不当 0 处理——"没解析出来"和"确实是 0"是两回事）。 */
export function parseInstallsApprox(installsStr) {
  const m = String(installsStr || '').trim().match(/^([\d,.]+)\s*([KMB])?\+?$/i);
  if (!m) return null;
  const num = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(num)) return null;
  const mult = { K: 1e3, M: 1e6, B: 1e9 }[m[2]?.toUpperCase()] ?? 1;
  return num * mult;
}

/** 【修复 4】判定一条 appstore/gplay 候选是不是"巨头条目"：开发者名撞已知巨头
 * 名单，或者（仅 gplay，appstore 榜单没有安装量字段）安装量 ≥ 阈值。任一条件
 * 命中就判定为巨头，附上人读的判定理由（写进 giantFilterReason，方便复核）。 */
export function classifyGiant(candidate, { maxInstalls = 50_000_000 } = {}) {
  const dev = candidate?.source === 'appstore' ? candidate?.extra?.artist
    : candidate?.source === 'gplay' ? candidate?.extra?.developer : null;
  if (dev && isLikelyGiantPublisher(dev)) return { giant: true, reason: `发行商「${dev}」命中已知巨头名单` };
  if (candidate?.source === 'gplay' && candidate?.extra?.installs) {
    const n = parseInstallsApprox(candidate.extra.installs);
    if (n != null && n >= maxInstalls) {
      return { giant: true, reason: `安装量 ${candidate.extra.installs} ≥ 阈值 ${maxInstalls.toLocaleString()}` };
    }
  }
  return { giant: false, reason: null };
}

/** 【修复 4】把一批候选分成 kept/filtered 两组，纯函数，不做任何 I/O——
 * filtered 组不是被丢弃，调用方要把它落盘保留，"过滤掉的要能查看"是硬要求。 */
export function partitionGiants(candidates, opts = {}) {
  const kept = [], filtered = [];
  for (const c of candidates) {
    const verdict = classifyGiant(c, opts);
    if (verdict.giant) filtered.push({ ...c, giantFilterReason: verdict.reason });
    else kept.push(c);
  }
  return { kept, filtered };
}

/** 【修复 5】公司名/App 名归一化：小写化、去掉 Inc/LLC/Ltd 等法律实体后缀和
 * for iOS/for Android 这类平台后缀噪声、去掉标点，只留下核心词。**刻意不做
 * 任何模糊匹配**——两个归一化后不完全相等的名字就是不算同一簇，哪怕看起来很像
 * （"Invoice Maker" 和 "Invoice Pro" 不合并）。低于 4 个字符的归一化结果视为
 * "太短太通用，不能当聚类钥匙"（比如公司名剩下 "co"/"labs" 这类高碰撞风险的
 * 残片），返回 null 让调用方跳过——宁可漏合并，不错误合并。 */
function normalizeCompanyName(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const stripped = s
    .replace(/[™®©]/g, '')
    .replace(/\b(inc|llc|ltd|co|corp|corporation|gmbh|app|apps|for ios|for android)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim().replace(/\s+/g, ' ');
  return stripped.replace(/\s+/g, '').length >= 4 ? `name:${stripped}` : null;
}

/** 【修复 5】候选名归一化成聚类判据用的 key：域名型剥 TLD、品类型走
 * normalizeCompanyName。返回 null 表示这个候选没有可用的聚类钥匙（太短/太空），
 * 调用方要让它独立成簇，而不是强行塞进某个聚类。 */
export function normalizeForCluster(candidate) {
  const raw = String(candidate?.name || '').trim();
  if (!raw) return null;
  if (isDomainLikeName(raw)) {
    const compact = domainKeywordPhrase(raw).replace(/\s+/g, '');
    return compact.length >= 4 ? `domain:${compact}` : null;
  }
  return normalizeCompanyName(raw);
}

/** 【修复 5】一个候选可能贡献 1-2 把聚类钥匙：候选名本身，加上"这个候选背后的公司名"
 * （appstore 的 extra.artist、gplay 的 extra.developer、ads creatives 的
 * extra.advertiserName——后者是「同一个域名，既在投广告又在冲榜」这种跨源信号
 * 真正连起来的关键：ads creatives 候选名是域名，devKey 用公司名去匹配 ads
 * advertisers 或 appstore/gplay 里同一家公司，否则域名字面量和公司名/App 名
 * 永远聚不到一起）。两把钥匙都走同一套归一化，保证能互相匹配上。 */
export function candidateClusterKeys(candidate) {
  const keys = [];
  const nameKey = normalizeForCluster(candidate);
  if (nameKey) keys.push(nameKey);
  const devRaw = candidate?.source === 'appstore' ? candidate?.extra?.artist
    : candidate?.source === 'gplay' ? candidate?.extra?.developer
    : candidate?.source === 'ads' && candidate?.extra?.mode === 'creatives' ? candidate?.extra?.advertiserName
    : null;
  if (devRaw) {
    const devKey = normalizeForCluster({ name: devRaw });
    if (devKey && !keys.includes(devKey)) keys.push(devKey);
  }
  return keys;
}

/** 【修复 5】跨源聚类主函数：并查集，任何两个候选只要共享一把聚类钥匙
 * （candidateClusterKeys）就合并到同一簇。没有可用钥匙的候选各自独立成
 * 单元素簇（sourceCount=1，仍然是合法输出，只是不构成"多源撞车"信号）。
 * 每个簇原样保留全部原始候选对象（含各自的证据链接），不做任何字段合并/
 * 覆盖——"保留每个原始来源的证据链接，不要合并时丢证据"是硬要求。
 * 按命中的独立信号源数量降序排序，其次按累计出现次数降序。 */
export function clusterCandidates(candidates) {
  const n = candidates.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };

  const keyToFirstIdx = new Map();
  candidates.forEach((c, i) => {
    for (const key of candidateClusterKeys(c)) {
      if (keyToFirstIdx.has(key)) union(i, keyToFirstIdx.get(key));
      else keyToFirstIdx.set(key, i);
    }
  });

  const groups = new Map();
  candidates.forEach((c, i) => {
    const root = find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  });

  return [...groups.values()].map((members) => {
    const sourcesHit = [...new Set(members.map((m) => m.source))].sort();
    return {
      clusterKey: normalizeForCluster(members[0]) || members.map((m) => m.name).join(' / '),
      sourcesHit,
      sourceCount: sourcesHit.length,
      members,
      totalSeen: members.reduce((sum, m) => sum + (m.seenCount || 1), 0),
      evidence: members.filter((m) => m.evidenceUrl).map((m) => ({ source: m.source, name: m.name, url: m.evidenceUrl })),
    };
  }).sort((a, b) => b.sourceCount - a.sourceCount || b.totalSeen - a.totalSeen);
}

/** 【修复 5】聚类清单渲染成人读 Markdown，只列出命中 ≥2 个独立信号源的簇
 * （单源的簇本质就是普通候选，去看 candidates.md 就够了，这里只突出"撞车"信号）。 */
export function renderClustersMarkdown(clusters) {
  const L = [];
  L.push('# 跨源聚类（同一需求被几个独立信号源命中）');
  L.push('');
  L.push('聚类判据是"归一化后名字完全相等"（域名剥 TLD、公司名去掉 Inc/LLC 等噪声词后逐字比较）——');
  L.push('**刻意不做模糊相似度匹配**：错误合并两个不同需求，比漏合并更糟。');
  L.push('只列出命中 ≥ 2 个独立信号源的聚类；命中 1 个源的候选去看 candidates.md。');
  L.push('');
  const multi = clusters.filter((c) => c.sourceCount >= 2);
  L.push(`共 ${clusters.length} 个聚类，其中 ${multi.length} 个被 ≥2 个独立信号源命中。`);
  L.push('');
  L.push('| 聚类 | 命中源数 | 命中来源 | 候选（来源:名称） | 证据 |');
  L.push('|---|---|---|---|---|');
  for (const c of multi) {
    const names = c.members.map((m) => `${m.source}:${String(m.name).replace(/\|/g, '\\|')}`).join('; ');
    const ev = c.evidence.map((e) => `[${e.source}](${e.url})`).join(' ') || '—';
    L.push(`| ${String(c.clusterKey).replace(/\|/g, '\\|')} | ${c.sourceCount} | ${c.sourcesHit.join(', ')} | ${names} | ${ev} |`);
  }
  return L.join('\n');
}

// ── 有副作用的部分：子进程调用、文件落盘 ────────────────────────────────────

function scriptPathFor(source) {
  return path.join(DEMAND_DIR, `${SOURCE_META[source].script}.mjs`);
}

/** 同 gate-runner.mjs 的 shQuote：让 dry-run 打印出来的命令能安全复制粘贴回 shell
 * （实际 spawnSync 走数组，不受这个影响，这里只影响人读的展示）。 */
export function shQuote(arg) {
  const s = String(arg);
  if (s !== '' && /^[A-Za-z0-9_\-.\/:=@]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

const WEB_CHECK_CHANNEL = 'web-check:opencli';

/** "网页端有没有人做"的初判：免费路径优先，key 只是失败后的兜底，不是开关。
 * 【修复 1】被墙检测：任何真正调用 opencli 之前先查冷却状态（checkCooldown），
 * 冷却期内直接跳过、不发起请求；调用之后检测响应里有没有验证码/限流特征
 * （detectBlockedSignal），命中就记一次被墙事件（recordBlockEvent）并在返回值
 * 里显式标 blocked:true——这条候选的 webPresence 会因此长得和"真的没查到网页
 * 端信号"不一样，调用方（渲染/报告）不会把两者读混。opencli google search 走
 * `--site-session ephemeral` 默认模式，官方语义是命令结束就释放标签页，已经
 * 天然满足"close 优先于 sleep"；这里不再额外发 close，只做"别再打第二枪"。
 * 命中付费兜底（serper）不算"原地重试同一件事"——不同服务商、不同网络路径，
 * 所以被墙时仍然允许往下试一次 serper。 */
function runWebCheck(query, { dryRun, timeout, evDir, lang = 'en', outDir }) {
  const cooldown = checkCooldown(outDir, WEB_CHECK_CHANNEL);
  if (cooldown.blocked) {
    return {
      checked: false, blocked: true, query,
      note: `🚫 web-check 处于被墙冷却期，直到 ${new Date(cooldown.until).toISOString()} 才会再尝试` +
        `（连续 ${cooldown.consecutiveBlocks} 次判定被墙/限流，见 ${blockStatePath(outDir)}）。` +
        '已跳过本次调用，不再原地重试——这不是"这条候选没有网页端信号"，是信号源本身被墙。',
    };
  }

  const at = new Date().toISOString();
  const slugTs = at.replace(/[:.]/g, '-');
  fs.mkdirSync(evDir, { recursive: true });

  if (dryRun) {
    const cmd = `opencli google search ${shQuote(query)} --limit 10 --lang ${lang} -f json`;
    const noteFile = path.join(evDir, `webcheck-${slugTs}.dryrun.json`);
    fs.writeFileSync(noteFile, JSON.stringify({ dryRun: true, wouldRun: cmd, at }, null, 2) + '\n');
    return { checked: false, dryRun: true, query, wouldRun: cmd, note: 'dry-run：未真实执行网页检测' };
  }

  // 1) 默认免费路径：opencli 驱动已登录 Chrome 搜 Google，不需要任何 key。
  const r1 = spawnSync('opencli', ['google', 'search', query, '--limit', '10', '--lang', lang, '-f', 'json'],
    { encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024 });
  const out1 = path.join(evDir, `webcheck-opencli-${slugTs}.stdout.txt`);
  const err1 = path.join(evDir, `webcheck-opencli-${slugTs}.stderr.txt`);
  fs.writeFileSync(out1, r1.stdout ?? '');
  fs.writeFileSync(err1, r1.stderr ?? '');

  const blockSignal = detectBlockedSignal(`${r1.stdout ?? ''}\n${r1.stderr ?? ''}`);
  const blockState = recordBlockEvent(outDir, WEB_CHECK_CHANNEL, { blocked: !!blockSignal, reason: blockSignal?.matched });
  if (blockSignal) {
    const cooldownNote = blockState.cooldownUntil > Date.now()
      ? `，已进入冷却直到 ${new Date(blockState.cooldownUntil).toISOString()}` : '（未达阈值，仍可继续，但建议人工确认）';
    console.error(`🚫 opencli google search 命中疑似 reCAPTCHA/限流特征（${blockSignal.matched}），已停止本次调用，不原地重试。` +
      `连续 ${blockState.consecutiveBlocks} 次被墙${cooldownNote}。现场：${out1} / ${err1}`);
    // 被墙时仍然允许尝试付费兜底——不同服务商/网络路径，不算"原地重试同一件事"。
    const key = readToken('SERPER_API_KEY');
    if (key) {
      const r2 = spawnSync('node', [path.join(DEMAND_DIR, 'serp-query.mjs'), query, '--json'],
        { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
      const out2 = path.join(evDir, `webcheck-serper-${slugTs}.stdout.txt`);
      fs.writeFileSync(out2, r2.stdout ?? '');
      if (r2.status === 0) {
        try {
          const facts = extractWebPresenceFacts(JSON.parse(r2.stdout), query);
          if (facts) return { checked: true, method: 'serper-serp-query', query, facts, stdoutFile: out2 };
        } catch { /* 继续往下走降级说明 */ }
      }
    }
    return {
      checked: false, blocked: true, query,
      note: `🚫 opencli google search 命中疑似 reCAPTCHA/限流特征（${blockSignal.matched}），已停止本次调用。` +
        `连续 ${blockState.consecutiveBlocks} 次被墙${cooldownNote}。现场：${out1} / ${err1}`,
    };
  }

  if (r1.status === 0 && r1.stdout && r1.stdout.trim()) {
    try {
      const rows = extractOpencliSearchRows(JSON.parse(r1.stdout));
      return { checked: true, method: 'opencli-google-search', query, facts: factsFromOpencliSearch(rows, query), stdoutFile: out1 };
    } catch { /* 解析失败，往下走兜底/降级 */ }
  }

  // 2) 免费路径这次失败了（不是被墙，是别的原因），才看有没有 SERPER_API_KEY 可以兜底——
  //    key 只是备胎，不是入场券。
  const key = readToken('SERPER_API_KEY');
  if (key) {
    const r2 = spawnSync('node', [path.join(DEMAND_DIR, 'serp-query.mjs'), query, '--json'],
      { encoding: 'utf8', timeout, maxBuffer: 16 * 1024 * 1024 });
    const out2 = path.join(evDir, `webcheck-serper-${slugTs}.stdout.txt`);
    fs.writeFileSync(out2, r2.stdout ?? '');
    if (r2.status === 0) {
      try {
        const facts = extractWebPresenceFacts(JSON.parse(r2.stdout), query);
        if (facts) return { checked: true, method: 'serper-serp-query', query, facts, stdoutFile: out2 };
      } catch { /* 继续往下走降级说明 */ }
    }
  }

  // 3) 两条路径都没拿到结果：给具体绕法，不是"去申请 key"。
  return {
    checked: false, query,
    note: `opencli google search 这次没拿到可解析结果（现场见 ${out1} / ${err1}）。` +
      '具体绕法：① 跑 `opencli doctor` 确认 Connectivity 是 [OK]；② 如果是超时/限流，加大 --timeout 或 --web-check-lang 换一批结果重试；' +
      '③ 改用 agent-reach 的搜索路由手动查一次这个词，把结果作为 --evidence 记进候选。' +
      (key ? '（本机已配置 SERPER_API_KEY，但兜底那次调用也没成功，见对应证据文件）' : '（本机未配置 SERPER_API_KEY，不影响——它从来不是必需的兜底）'),
  };
}

/** 跑（或 dry-run）一次信号源采集，返回 {candidates, runRecord}。
 * 【修复 1】ads-transparency.mjs 走的是纯 fetch/curl 直连内部 RPC，不经过
 * opencli，被墙时没有 Chrome 标签页可关——"close 优先于 sleep"落地成：调用
 * 之前先查跨进程冷却状态（同一台机器上人/agent 连续跑了好几次 scan，等价于
 * "原地重试"，冷却期内直接拒绝再发一次请求）；调用之后检测 stdout+stderr
 * 里有没有验证码/限流特征，命中就记一次被墙事件，返回值里显式标 blocked:true，
 * 调用方（cmdScan）要把这和"真的 0 条"分开报告，不能读成"这个源没数据"。 */
function runScan(source, passthroughArgs, { dryRun, timeout, evDir, outDir }) {
  const meta = SOURCE_META[source];
  const channel = `scan:${source}`;
  const cooldown = checkCooldown(outDir, channel);
  if (cooldown.blocked) {
    console.error(`🚫 信号源「${source}」处于被墙冷却期，直到 ${new Date(cooldown.until).toISOString()} 才会再尝试` +
      `（连续 ${cooldown.consecutiveBlocks} 次判定被墙/限流，见 ${blockStatePath(outDir)}）。`);
    console.error('这不是"没有数据/没有需求"——是主动退避，不再原地重试。冷却期内可以换其它信号源，或等冷却结束后再跑这一个。');
    return { rows: [], rawEvidenceFile: null, exitCode: null, blocked: true, blockedReason: 'cooldown', cooldownUntil: cooldown.until };
  }

  const scriptPath = scriptPathFor(source);
  if (!fs.existsSync(scriptPath)) die(`找不到脚本：${scriptPath}（scripts/demand/ 目录可能变了，需要人工检查）`);
  fs.mkdirSync(evDir, { recursive: true });
  const at = new Date().toISOString();
  const slugTs = at.replace(/[:.]/g, '-');
  const runArgs = passthroughArgs.includes('--json') ? passthroughArgs : [...passthroughArgs, '--json'];

  if (dryRun) {
    const cmd = `node ${shQuote(scriptPath)} ${runArgs.map(shQuote).join(' ')}`;
    const noteFile = path.join(evDir, `${source}-${slugTs}.dryrun.json`);
    fs.writeFileSync(noteFile, JSON.stringify({ dryRun: true, wouldRun: cmd, at }, null, 2) + '\n');
    console.log(`[dry-run] 不会真的执行子脚本。将要跑的命令：\n  ${cmd}`);
    return { rows: [], rawEvidenceFile: noteFile, exitCode: null, blocked: false };
  }

  const r = spawnSync('node', [scriptPath, ...runArgs], { cwd: process.cwd(), encoding: 'utf8', timeout, maxBuffer: 32 * 1024 * 1024 });
  const stdoutFile = path.join(evDir, `${source}-${slugTs}.stdout.txt`);
  const stderrFile = path.join(evDir, `${source}-${slugTs}.stderr.txt`);
  fs.writeFileSync(stdoutFile, r.stdout ?? '');
  fs.writeFileSync(stderrFile, r.stderr ?? '');

  const blockSignal = detectBlockedSignal(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  const blockState = recordBlockEvent(outDir, channel, { blocked: !!blockSignal, reason: blockSignal?.matched });
  if (blockSignal) {
    const cooldownNote = blockState.cooldownUntil > Date.now()
      ? `，已进入冷却直到 ${new Date(blockState.cooldownUntil).toISOString()}` : '（未达阈值，仍可重试，但建议人工确认）';
    console.error(`🚫 检测到疑似 reCAPTCHA/限流特征（命中模式：${blockSignal.matched}），来源 ${source}。` +
      `不再原地重试——已记录第 ${blockState.consecutiveBlocks} 次连续被墙${cooldownNote}。现场：${stdoutFile} / ${stderrFile}`);
    return { rows: [], rawEvidenceFile: stdoutFile, exitCode: r.status, blocked: true, blockedReason: 'signal-detected', cooldownUntil: blockState.cooldownUntil };
  }

  if (r.status !== 0) console.log(`注意：${meta.script} 退出码 ${r.status}，stderr 见 ${stderrFile}（非 0 不等于「0 条=没需求」，可能是某个数据源采集失败）。`);
  let rows = [];
  try { rows = extractRows(JSON.parse(r.stdout)); } catch { /* 非 JSON：rows 留空，人工去看 stdoutFile */ }
  if (!rows.length) console.log(`(没有解析出候选行——看 ${stdoutFile} 确认是「真的 0 条」还是「没走 --json」/「源失败」)`);
  return { rows, rawEvidenceFile: stdoutFile, exitCode: r.status, blocked: false };
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const HELP = `
leading-indicator.mjs — 候选生成器：领先指标而不是滞后指标

搜索量是滞后指标（等你看到高搜索量，别人早做了）。这个脚本走的链路是：
谁在买量 / 谁在冲榜 / 谁在真收钱 → 这需求是什么 → 网页端有没有人做 → 候选。
**我们自己不买量，只读别人的买量行为当信号**——脚本里没有任何写操作。

四个信号源全部免 token（不需要 SERPER_API_KEY / PRODUCTHUNT_TOKEN 这些），
scan 本身没有"缺 key 降级"的问题。唯一可能用到 key 的地方是 --web-check：
默认走 \`opencli google search\`（免费，走本机已登录 Chrome），只有这条免费
路径本身失败时才会看有没有 SERPER_API_KEY 可以兜底——key 是性能兜底，不是开关。

⚠️ ads 源的 advertisers 子命令是【广告主展示名/域名的字面子串匹配】，不是语义搜索——
B2B 式长描述词天然容易 0 命中，0 命中不代表"这个方向没人投广告"，见下面「已知坑」。
⚠️ ads/appstore/gplay 连续快速查询可能被 Google 判定成异常流量并弹验证码/限流。
本脚本会侦测这个特征并进入跨进程冷却（<out-dir>/block-state.json），冷却期内
拒绝再发请求——**看到"🚫 被墙"字样时不要立刻重跑**，等冷却结束或换个信号源。

用法:
  node leading-indicator.mjs scan --source ads|appstore|gplay|stripe [选项] -- <透传给对应 demand 脚本的参数>
  node leading-indicator.mjs report [--out-dir <dir>] [--source <s>] [--json] [--cluster] [--giants]
  node leading-indicator.mjs --self-test
  node leading-indicator.mjs --help

scan 选项:
  --source <s>            ads | appstore | gplay | stripe（必须）
  --ads-mode <m>           仅 --source ads 有意义：creatives | advertisers，显式声明这次
                            ads-transparency.mjs 透传的子命令是哪个，跳过字段探测。不传时会从
                            "-- " 之后的第一个透传参数（就是那个子命令本身）自动识别；两条都没有
                            才退回字段探测——字段对不上期望形状会直接报错，不会静默瞎猜。
  --out-dir <dir>          候选清单落盘目录，默认 <cwd>/.rankup/leading-indicator/
  --dry-run                不真的执行子脚本/网页检测，只打印并记录将要跑的命令
  --timeout <ms>            子进程超时，默认 120000
  --web-check               对本次新增/更新的候选跑一次"网页端有没有人做"初判
  --web-check-query <q>     覆盖默认查询词。默认按候选类型分策略（defaultWebCheckQuery）：
                            域名型候选（ads creatives / stripe）不再拿域名字面量去搜——查
                            "品牌名（有就用 advertiserName）/ 从域名剥出来的短语 + alternative"；
                            品类型候选（公司名/App 名）维持 "<名字> online tool"。
  --web-check-lang <l>      web-check 查询语言，默认 en
  --web-check-limit <n>     最多对前 n 条候选做 web-check，默认 5（控制耗时/配额）
  --web-check-interval-ms <ms>  多条候选之间的真实节流间隔，默认 3000。**不是**
                            \`opencli browser wait time\`（1.8.7 版本那个命令是坏的，见 opencli
                            skill），是子进程 \`sleep\` 做的真实阻塞。
  --no-filter               关掉 appstore/gplay 的巨头过滤（默认开启，见下）
  --max-installs <n>        gplay 巨头过滤的安装量阈值，默认 50000000（5000 万）
  -- <...>                  之后的参数原样透传给 --source 对应的 demand 脚本

report 选项:
  --out-dir <dir>           同 scan
  --source <s>              只看某个信号源（和 --cluster 同传时会被忽略并提示，聚类本来就是要跨源看）
  --json                    输出 JSON 而不是表格
  --cluster                 【推荐】按跨源聚类展示——把指向同一需求的候选合并，按"被几个独立
                            信号源命中"降序排。这是本脚本最有价值的视角：单个源出现一次不算什么，
                            三个独立方法论（买量/冲榜/收钱）撞到同一个方向才是硬信号。落盘
                            <out-dir>/clusters.md。
  --giants                  查看被巨头过滤掉的 appstore/gplay 条目（<out-dir>/filtered-giants.json）

四个信号源对应的脚本与典型用法:
  ads       scripts/demand/ads-transparency.mjs（子命令 advertisers/creatives，透传；
            建议显式加 --ads-mode 跟子命令保持一致，见上面 scan 选项说明。
            advertisers 是字面子串匹配广告主展示名/域名，不是语义搜索——0 命中先看
            运行时提示给的换词建议，别直接读成"没人做"）
  appstore  scripts/demand/appstore-charts.mjs（--chart/--country，透传；默认过滤掉
            开发者命中已知巨头名单的条目，--no-filter 关闭）
  gplay     scripts/demand/gplay-charts.mjs（--ranking/--rank-category 更可信，透传；
            --ranking 模式的名次字段是 rank，默认搜索/分类列表模式是 position，
            两个本文件都认，语义相同；默认过滤掉开发者命中巨头名单或安装量超阈值的条目）
  stripe    scripts/demand/stripe-referring.mjs（months/top/site 子命令，透传；
            **候选生成只认 top**——months 是按月汇总、site 是单域名历史曲线，
            两者的行都没有"一行一个域名"的形状，喂进来会被当成映射失败跳过）

示例:
  node leading-indicator.mjs scan --source ads --ads-mode advertisers --dry-run -- advertisers "invoice generator" --region us --limit 40
  node leading-indicator.mjs scan --source appstore -- --chart top-grossing --country us
  node leading-indicator.mjs scan --source gplay -- --ranking top_grossing --rank-category productivity
  node leading-indicator.mjs scan --source stripe --web-check --web-check-query "invoice automation saas" -- top --new-only --limit 20
  node leading-indicator.mjs report --cluster
  node leading-indicator.mjs report --giants

设计说明:
  - 候选去重键是 source+name；同一个候选反复出现会累加 seenCount 而不是重复
    占位——seenCount 本身就是信号（同一个域名反复冒头，不是偶然）。
  - scan/report 只产出候选清单，不做"能不能做"的判断；下一步是把候选喂进
    scripts/select/gate-runner.mjs 走七道闸门。
  - 被墙/限流是"信号源暂时不可用"，不是"没有数据"——两者在输出里长得不一样
    （前者带 🚫，后者是普通的"0 条"/"未检测"），报告结论前先分清楚是哪一种。
`.trim();

function cmdScan(args, passthrough) {
  const source = args.source;
  if (!source || !SOURCE_META[source]) die(`--source 必须是 ${SOURCE_IDS.join('|')}，收到「${source}」`);
  const outDir = path.resolve(process.cwd(), args['out-dir'] || DEFAULT_DIR);
  fs.mkdirSync(outDir, { recursive: true });
  const evDir = path.join(outDir, 'evidence');
  const dryRun = !!args['dry-run'];
  const timeout = Number(args.timeout || 120000);

  // ads 的行形状（advertisers/creatives）不能靠猜——显式声明优先，其次从透传子命令自动识别，
  // 两条都没有才落回字段探测（见 mapRowToCandidate 里 resolveAdsMode 的报错逻辑）。
  let adsMode = null;
  if (source === 'ads') {
    try { adsMode = deriveAdsMode(args, passthrough); }
    catch (e) { die(e.message); }
  }

  const scanResult = runScan(source, passthrough, { dryRun, timeout, evDir, outDir });
  const { rows, rawEvidenceFile } = scanResult;
  const discoveredAt = new Date().toISOString();
  let incoming = rows.map((row) => {
    try { return buildCandidate(source, row, { discoveredAt, rawEvidenceFile, adsMode }); }
    catch (e) { console.error(`跳过一行（映射失败）：${e.message}`); return null; }
  }).filter(Boolean);
  if (rows.length && incoming.length < rows.length) {
    console.error(`注意：${rows.length - incoming.length}/${rows.length} 行因字段形状不符被跳过（不是"这次没有候选"，是"这些行解析失败"，看上面每行的报错定位原因）。`);
  }

  // 【修复 2】advertisers 是字面子串匹配，0 命中不是"没人做"——被墙的情况已经在 runScan
  // 里单独报过了，这里只在"确实是 0 条、且不是被墙"时给可操作的换词建议。
  if (source === 'ads' && passthrough[0] === 'advertisers' && !scanResult.blocked && rows.length === 0) {
    console.log('\n' + adsZeroHitAdvice(extractAdsQueryArg(passthrough)));
  }

  // 【修复 4】appstore/gplay 榜单默认过滤掉疑似巨头条目，过滤掉的不丢弃、累积落盘。
  let filteredGiants = [];
  if ((source === 'appstore' || source === 'gplay') && !args['no-filter'] && incoming.length) {
    const maxInstalls = Number(args['max-installs'] || 50_000_000);
    const partition = partitionGiants(incoming, { maxInstalls });
    incoming = partition.kept;
    filteredGiants = partition.filtered;
    if (filteredGiants.length) {
      console.log(`过滤掉 ${filteredGiants.length} 条疑似巨头条目（开发者命中已知巨头名单，或 gplay 安装量 ≥ ${maxInstalls.toLocaleString()}）——` +
        '用 --no-filter 可以关掉这个过滤，或用 report --giants 看完整清单。');
      const giantsPath = path.join(outDir, 'filtered-giants.json');
      const existingGiants = fs.existsSync(giantsPath) ? JSON.parse(fs.readFileSync(giantsPath, 'utf8')) : [];
      fs.writeFileSync(giantsPath, JSON.stringify(mergeCandidates(existingGiants, filteredGiants), null, 2) + '\n');
    }
  }

  if (args['web-check'] && incoming.length) {
    const limit = Number(args['web-check-limit'] || 5);
    const lang = args['web-check-lang'] || 'en';
    const intervalMs = Number(args['web-check-interval-ms'] ?? 3000);
    const targets = incoming.slice(0, limit);
    targets.forEach((c, i) => {
      // 【修复 1】查询之间真实节流（不用 opencli browser wait time，见文件头/HELP），
      // 第一条不用等；dry-run 不需要真的睡。
      if (i > 0 && !dryRun) syncSleepMs(intervalMs);
      const q = args['web-check-query'] || defaultWebCheckQuery(c);
      c.webPresence = runWebCheck(q, { dryRun, timeout, evDir, lang, outDir });
    });
    if (incoming.length > limit) console.log(`--web-check 只对前 ${limit} 条候选做了检测（--web-check-limit 可调），其余 webPresence 为 null。`);
    const blockedCount = targets.filter((c) => c.webPresence?.blocked).length;
    if (blockedCount) {
      console.log(`⚠️ 本次 web-check 中有 ${blockedCount}/${targets.length} 次被判定为「被墙/限流」而不是「没有网页端信号」——` +
        `不要把这些候选的 webPresence 读成"没人做"，详见每条候选的 webPresence.note，以及 ${path.join(outDir, 'block-state.json')}。`);
    }
  }

  const storePath = path.join(outDir, 'candidates.json');
  const existing = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const merged = mergeCandidates(existing, incoming);
  fs.writeFileSync(storePath, JSON.stringify(merged, null, 2) + '\n');
  const mdPath = path.join(outDir, 'candidates.md');
  fs.writeFileSync(mdPath, renderCandidatesMarkdown(merged) + '\n');

  // 【修复 1】被墙这件事必须在最终总结里可见，不能被"新增 0 条"这种平淡的措辞盖过去。
  if (scanResult.blocked) {
    console.log(`\n⚠️ 来源 ${source} 本次判定为「被墙/限流」，不是「0 条候选」——` +
      (scanResult.blockedReason === 'cooldown'
        ? `仍处于冷却期，直到 ${new Date(scanResult.cooldownUntil).toISOString()}。`
        : '已停止本次调用，不做原地重试；详情见上面的错误信息与证据文件。'));
  }
  console.log(`\n来源 ${source}（${SOURCE_META[source].label}）：本次新增/更新候选 ${incoming.length} 条，累计候选 ${merged.length} 条。`);
  console.log(`候选清单：${storePath}\n           ${mdPath}`);
  if (rawEvidenceFile) console.log(`原始证据：${rawEvidenceFile}`);
}

function cmdReport(args) {
  const outDir = path.resolve(process.cwd(), args['out-dir'] || DEFAULT_DIR);

  // 【修复 4】--giants：看被过滤掉的疑似巨头条目，不需要 candidates.json 也能独立工作。
  if (args.giants) {
    const giantsPath = path.join(outDir, 'filtered-giants.json');
    if (!fs.existsSync(giantsPath)) { console.log(`(${giantsPath} 不存在——这次还没有被过滤掉的巨头条目，或者 scan 时传了 --no-filter)`); return; }
    const giants = JSON.parse(fs.readFileSync(giantsPath, 'utf8'));
    if (args.json) { console.log(JSON.stringify(giants, null, 2)); return; }
    printTable(giants.map((g) => ({ name: g.name, source: g.signalLabel, reason: g.giantFilterReason || '—' })), [
      { key: 'name', label: '候选', max: 30 },
      { key: 'source', label: '信号来源', max: 26 },
      { key: 'reason', label: '过滤原因', max: 48 },
    ]);
    console.log(`\n共 ${giants.length} 条被过滤的疑似巨头条目——scan 时加 --no-filter 可以关掉这个过滤。`);
    return;
  }

  const storePath = path.join(outDir, 'candidates.json');
  if (!fs.existsSync(storePath)) { console.log(`(${storePath} 不存在，还没跑过 scan)`); return; }
  const candidates = JSON.parse(fs.readFileSync(storePath, 'utf8'));

  // 【修复 5】--cluster：跨源聚类视角，本来就是要跨源看，--source 在这里没意义、直接忽略并提示。
  if (args.cluster) {
    if (args.source) console.log(`注意：--cluster 会忽略 --source（聚类本来就是要跨源看），已按全部 ${candidates.length} 条候选聚类。`);
    const clusters = clusterCandidates(candidates);
    const clusterMdPath = path.join(outDir, 'clusters.md');
    fs.writeFileSync(clusterMdPath, renderClustersMarkdown(clusters) + '\n');
    if (args.json) { console.log(JSON.stringify(clusters, null, 2)); return; }
    const multi = clusters.filter((c) => c.sourceCount >= 2);
    printTable(multi.map((c) => ({
      cluster: c.clusterKey, sources: c.sourceCount, hit: c.sourcesHit.join(', '),
      names: c.members.map((m) => m.name).join('; '),
    })), [
      { key: 'cluster', label: '聚类', max: 26 },
      { key: 'sources', label: '命中源数' },
      { key: 'hit', label: '命中来源', max: 24 },
      { key: 'names', label: '候选（去重前）', max: 40 },
    ]);
    console.log(`\n共 ${clusters.length} 个聚类，其中 ${multi.length} 个被 ≥2 个独立信号源命中。完整聚类清单：${clusterMdPath}`);
    console.log('三个独立方法论（买量/冲榜/收钱）撞到同一个方向，是这个生成器最强的信号——优先看命中源数多的簇。');
    return;
  }

  const filtered = args.source ? candidates.filter((c) => c.source === args.source) : candidates;
  if (args.json) { console.log(JSON.stringify(filtered, null, 2)); return; }
  const rows = [...filtered].sort((a, b) => (b.seenCount || 1) - (a.seenCount || 1)).map((c) => ({
    name: c.name, source: c.signalLabel, seen: c.seenCount || 1,
    web: !c.webPresence ? '未检测' : c.webPresence.checked === false ? '未检测(见note)' : `${c.webPresence.facts?.organicCount ?? '?'} 条结果`,
    evidence: c.evidenceUrl || '—',
  }));
  printTable(rows, [
    { key: 'name', label: '候选', max: 30 },
    { key: 'source', label: '信号来源', max: 26 },
    { key: 'seen', label: '出现次数' },
    { key: 'web', label: '网页端信号', max: 16 },
    { key: 'evidence', label: '证据', max: 40 },
  ]);
  console.log(`\n共 ${filtered.length} 条（累计信号库 ${candidates.length} 条），来源：${[...new Set(candidates.map((c) => c.source))].join(', ')}`);
  console.log('这仍然只是"谁在买量/冲榜/收钱"的候选清单，不是选品结论——下一步喂进 gate-runner.mjs 走七道闸门。');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--self-test')) { selfTest(); return; }
  if (!argv.length || argv[0] === '--help') { console.log(HELP); process.exit(argv.length ? 0 : 1); }

  const [cmd, ...rest] = argv;
  const sepIdx = rest.indexOf('--');
  const ownArgs = sepIdx === -1 ? rest : rest.slice(0, sepIdx);
  const passthrough = sepIdx === -1 ? [] : rest.slice(sepIdx + 1);
  const args = parseArgs(ownArgs);
  if (args.help) { console.log(HELP); return; }

  switch (cmd) {
    case 'scan': return cmdScan(args, passthrough);
    case 'report': return cmdReport(args);
    default: die(`未知命令：${cmd}\n\n${HELP}`);
  }
}

// ---------------------------------------------------------------- self-test
function selfTest() {
  const ok = [];
  const check = (name, cond) => ok.push([name, !!cond]);

  // shQuote：dry-run 展示用的命令要能安全复制粘贴回 shell
  check('shQuote: 纯字母数字不加引号', shQuote('top') === 'top');
  check('shQuote: 带空格的参数会加引号', shQuote('invoice generator') === "'invoice generator'");

  // SOURCE_META 完整性
  check('SOURCE_META 覆盖 4 个信号源', SOURCE_IDS.length === 4 && ['ads', 'appstore', 'gplay', 'stripe'].every((s) => SOURCE_IDS.includes(s)));
  check('每个信号源都带 script/signal/label', SOURCE_IDS.every((s) => SOURCE_META[s].script && SOURCE_META[s].signal && SOURCE_META[s].label));
  for (const s of SOURCE_IDS) check(`信号源脚本确实存在：${SOURCE_META[s].script}.mjs`, fs.existsSync(scriptPathFor(s)));
  check('serp-query.mjs（web-check 付费兜底）确实存在', fs.existsSync(path.join(DEMAND_DIR, 'serp-query.mjs')));

  // extractRows
  check('extractRows: 顶层数组原样返回', extractRows([{ a: 1 }]).length === 1);
  check('extractRows: {rows:[...]} 形状能取出', extractRows({ rows: [{ a: 1 }, { a: 2 }] }).length === 2);
  check('extractRows: 找不到数组时返回 []（不抛错）', extractRows({ foo: 'bar' }).length === 0);
  check('extractRows: 非对象输入不崩，返回 []', extractRows(null).length === 0 && extractRows(undefined).length === 0);

  // mapRowToCandidate —— 覆盖 4 个源 + ads 的两个子命令形状（探测 fallback，不传 adsMode）
  const adsAdv = mapRowToCandidate('ads', { name: 'Acme Inc', advertiserId: 'AR123', country: 'US', minAds: 5, maxAds: 20, url: 'https://x.com' });
  check('mapRowToCandidate ads(advertisers): name 取 name 字段', adsAdv.name === 'Acme Inc');
  check('mapRowToCandidate ads(advertisers): extra.mode 标记正确', adsAdv.extra.mode === 'advertisers');
  const adsCre = mapRowToCandidate('ads', { domain: 'acme.com', advertiserId: 'AR123', daysRunning: 200, previewUrl: 'https://p.example/x' });
  check('mapRowToCandidate ads(creatives): name 取 domain 字段', adsCre.name === 'acme.com');
  check('mapRowToCandidate ads(creatives): extra.mode 标记正确', adsCre.extra.mode === 'creatives');
  check('mapRowToCandidate ads(creatives): evidenceUrl 优先用 previewUrl', adsCre.evidenceUrl === 'https://p.example/x');

  const app = mapRowToCandidate('appstore', { rank: 3, name: 'Invoice Pro', appId: '123', url: 'https://apps.apple.com/x', chart: 'top-grossing', country: 'us' });
  check('mapRowToCandidate appstore: name/extra.rank 正确', app.name === 'Invoice Pro' && app.extra.rank === 3);

  const gp = mapRowToCandidate('gplay', { position: 5, name: 'Invoice Maker', appId: 'com.x', rating: 4.5, url: 'https://play.google.com/x' });
  check('mapRowToCandidate gplay: name/extra.position 正确', gp.name === 'Invoice Maker' && gp.extra.position === 5);
  // gplay --ranking 模式真实字段是 rank 不是 position（2026-09-12 静态核对 gplay-charts.mjs 发现）
  const gpRank = mapRowToCandidate('gplay', { rank: 7, change: 'up', appId: 'com.y', name: 'Invoice Ranker', developer: 'X Inc', category: 'productivity', rating: '4.3', installs: '1M+', recentInstalls: '10K+', url: 'https://play.google.com/y', chart: 'top_grossing', rankCategory: 'productivity', country: 'US' });
  check('mapRowToCandidate gplay(--ranking 形状): extra.position 落到 rank 字段', gpRank.extra.position === 7);
  check('mapRowToCandidate gplay(--ranking 形状): name 仍然正确', gpRank.name === 'Invoice Ranker');

  const st = mapRowToCandidate('stripe', { domain: 'billing.example.com', visits: 1200, isNew: true });
  check('mapRowToCandidate stripe: name 取 domain，evidenceUrl 拼 https', st.name === 'billing.example.com' && st.evidenceUrl === 'https://billing.example.com');
  check('mapRowToCandidate stripe: extra.isNew 透传', st.extra.isNew === true);
  // stripe-referring `top --json` 的真实形状：中文展示列 + 英文字段塞进 _raw（2026-09-12 静态核对发现）
  const stripeRealShape = {
    月份: '2026-08', 名次: 3, 域名: 'invoice-app.example.com', Stripe引荐: '1,234',
    月总访问: '—', 到达付费页比例: '—', 月营收估算: '—', 榜内份额: '2.10%', 环比: '+5%', 新进: '新', 全球排名: '12,345',
    _raw: { pos: 3, domain: 'invoice-app.example.com', share: 2.1, change: 5, isNew: true, isReturn: false, globalRank: 12345, stripeVisits: 1234, monthlyVisitsStatus: 'not_requested' },
  };
  const stReal = mapRowToCandidate('stripe', stripeRealShape);
  check('mapRowToCandidate stripe(真实 top --json 形状): name 从 _raw.domain 拿到，不是 "(unknown)"', stReal.name === 'invoice-app.example.com');
  check('mapRowToCandidate stripe(真实 top --json 形状): extra.isNew 从 _raw 拿到', stReal.extra.isNew === true);
  // 中文列「域名」也要能兜底（没有 _raw 的极端情况）
  const stChineseOnly = mapRowToCandidate('stripe', { 域名: 'fallback.example.com', Stripe引荐: '999' });
  check('mapRowToCandidate stripe: 顶层/_raw 都没有 domain 时退到中文列「域名」', stChineseOnly.name === 'fallback.example.com');
  // stripe-referring `months --json` 的真实形状：按月汇总，完全没有域名——必须报错，不能静默变 "(unknown)"
  let stripeMonthsThrew = null;
  try { mapRowToCandidate('stripe', { 月份: '2026-08', 榜单总引荐: '12,345', 上榜集中度: '40%', 前十占比: '60%', 长尾占比: '20%' }); }
  catch (e) { stripeMonthsThrew = e; }
  check('mapRowToCandidate stripe(months 形状): 找不到域名时抛错而不是返回 "(unknown)"', stripeMonthsThrew instanceof Error);
  check('mapRowToCandidate stripe(months 形状): 错误信息提示"months"这个常见原因', /months/.test(stripeMonthsThrew?.message || ''));
  check('mapRowToCandidate stripe(months 形状): 错误信息带上了实际字段名', /榜单总引荐/.test(stripeMonthsThrew?.message || ''));
  // buildCandidate 应该原样把这个报错传上去（不吞掉）
  let buildStripeThrew = null;
  try { buildCandidate('stripe', { 月份: '2026-08' }); } catch (e) { buildStripeThrew = e; }
  check('buildCandidate: stripe 形状不符时报错会一路传上去，不被吞掉', buildStripeThrew instanceof Error);

  // ── resolveAdsMode / deriveAdsMode：显式声明 vs 探测 vs 报错（本次修复的核心）
  check('resolveAdsMode: 显式 creatives 且字段对得上 → 放行', resolveAdsMode({ domain: 'a.com', daysRunning: 5 }, 'creatives') === 'creatives');
  check('resolveAdsMode: 显式 advertisers 且字段对得上 → 放行', resolveAdsMode({ name: 'A', minAds: 1 }, 'advertisers') === 'advertisers');
  let mismatchThrew = null;
  try { resolveAdsMode({ domain: 'a.com', daysRunning: 5 }, 'advertisers'); } catch (e) { mismatchThrew = e; }
  check('resolveAdsMode: 声明 advertisers 但字段是 creatives 形状 → 抛错（不是静默按声明瞎映射）', mismatchThrew instanceof Error);
  check('resolveAdsMode: 声明不合法值 → 抛错', (() => { try { resolveAdsMode({}, 'foo'); return false; } catch { return true; } })());
  let bothUnknownThrew = null;
  try { resolveAdsMode({ someNewField: 1, anotherNewField: 2 }, null); } catch (e) { bothUnknownThrew = e; }
  check('resolveAdsMode: 不声明模式 + 两种已知形状都不命中 → 抛错（不再静默默认成 advertisers）', bothUnknownThrew instanceof Error);
  check('resolveAdsMode: 报错信息带上了实际拿到的字段名', /someNewField/.test(bothUnknownThrew?.message || ''));
  check('resolveAdsMode: 报错信息带上了期望的字段名（两种形状都列出来）', /daysRunning/.test(bothUnknownThrew?.message || '') && /minAds/.test(bothUnknownThrew?.message || ''));
  check('resolveAdsMode: 报错信息给了具体绕法（--ads-mode），不是让人"去申请 key"那种空话', /--ads-mode/.test(bothUnknownThrew?.message || ''));
  check('resolveAdsMode: 不声明 + 探测出 creatives（老逻辑照常工作）', resolveAdsMode({ domain: 'a.com', daysRunning: 5 }, null) === 'creatives');
  check('resolveAdsMode: 不声明 + 探测出 advertisers（老逻辑照常工作）', resolveAdsMode({ name: 'A', country: 'US' }, null) === 'advertisers');

  check('deriveAdsMode: 显式 --ads-mode 优先生效', deriveAdsMode({ 'ads-mode': 'creatives' }, ['advertisers', 'foo']) === 'creatives');
  check('deriveAdsMode: 没有显式声明时从透传子命令自动识别', deriveAdsMode({}, ['creatives', '--domain', 'a.com']) === 'creatives');
  check('deriveAdsMode: 透传子命令不是合法值时返回 null（交给字段探测兜底）', deriveAdsMode({}, ['--domain', 'a.com']) === null);
  check('deriveAdsMode: 两条都没有时返回 null', deriveAdsMode({}, []) === null);
  let deriveInvalidThrew = null;
  try { deriveAdsMode({ 'ads-mode': 'bogus' }, []); } catch (e) { deriveInvalidThrew = e; }
  check('deriveAdsMode: --ads-mode 传了不合法值时抛错', deriveInvalidThrew instanceof Error);

  // mapRowToCandidate 接收显式 adsMode：匹配时放行，不匹配时抛错（覆盖 --ads-mode 端到端语义）
  const adsExplicit = mapRowToCandidate('ads', { domain: 'explicit.com', daysRunning: 30, previewUrl: 'https://p.example/e' }, { adsMode: 'creatives' });
  check('mapRowToCandidate: 显式 adsMode=creatives 且字段匹配 → 正常返回', adsExplicit.name === 'explicit.com' && adsExplicit.extra.mode === 'creatives');
  let adsExplicitMismatchThrew = null;
  try { mapRowToCandidate('ads', { domain: 'explicit.com', daysRunning: 30 }, { adsMode: 'advertisers' }); }
  catch (e) { adsExplicitMismatchThrew = e; }
  check('mapRowToCandidate: 显式 adsMode 和实际字段形状对不上 → 抛错', adsExplicitMismatchThrew instanceof Error);

  // buildCandidate + key 唯一性
  const c1 = buildCandidate('stripe', { domain: 'foo.com', visits: 100 }, { discoveredAt: '2026-01-01T00:00:00.000Z' });
  check('buildCandidate: key = source::name(小写)', c1.key === 'stripe::foo.com');
  check('buildCandidate: webPresence 初始为 null', c1.webPresence === null);
  check('buildCandidate: rawEvidenceFiles 有传就是长度 1 的数组', buildCandidate('stripe', { domain: 'x.com' }, { rawEvidenceFile: '/tmp/a.txt' }).rawEvidenceFiles.length === 1);

  // mergeCandidates —— 累加 seenCount、合并 extra、不丢证据文件
  const first = [buildCandidate('stripe', { domain: 'foo.com', visits: 100 }, { discoveredAt: '2026-01-01T00:00:00.000Z', rawEvidenceFile: '/tmp/run1.txt' })];
  const second = [buildCandidate('stripe', { domain: 'foo.com', visits: 150, isNew: false }, { discoveredAt: '2026-02-01T00:00:00.000Z', rawEvidenceFile: '/tmp/run2.txt' })];
  const merged = mergeCandidates(first, second);
  check('mergeCandidates: 同 key 只出现一次', merged.length === 1);
  check('mergeCandidates: seenCount 累加到 2', merged[0].seenCount === 2);
  check('mergeCandidates: firstSeenAt 保留第一次', merged[0].firstSeenAt === '2026-01-01T00:00:00.000Z');
  check('mergeCandidates: lastSeenAt 更新为最新一次', merged[0].lastSeenAt === '2026-02-01T00:00:00.000Z');
  check('mergeCandidates: extra 字段合并（新覆盖旧）', merged[0].extra.visits === 150);
  check('mergeCandidates: rawEvidenceFiles 累加不覆盖', merged[0].rawEvidenceFiles.length === 2);
  const thirdNewKey = [buildCandidate('stripe', { domain: 'bar.com', visits: 10 }, { discoveredAt: '2026-03-01T00:00:00.000Z' })];
  check('mergeCandidates: 不同 key 各自独立累加', mergeCandidates(merged, thirdNewKey).length === 2);

  // extractOpencliSearchRows + factsFromOpencliSearch（免费默认路径）
  check('extractOpencliSearchRows: 顶层数组直接返回', extractOpencliSearchRows([{ url: 'https://a.com' }]).length === 1);
  check('extractOpencliSearchRows: {results:[...]} 包裹能取出', extractOpencliSearchRows({ results: [{ url: 'https://a.com' }, { url: 'https://b.com' }] }).length === 2);
  const opRows = [
    { type: 'organic', title: 'A', url: 'https://foo.com/x', snippet: '...' },
    { type: 'organic', title: 'B', url: 'https://foo.com/y', snippet: '...' }, // 同域名，应去重
    { type: 'organic', title: 'C', url: 'https://bar.com/z', snippet: '...' },
  ];
  const opFacts = factsFromOpencliSearch(opRows, 'invoice tool');
  check('factsFromOpencliSearch: organicCount 统计正确', opFacts.organicCount === 3);
  check('factsFromOpencliSearch: topDomains 按域名去重', opFacts.topDomains.length === 2 && opFacts.topDomains.includes('foo.com') && opFacts.topDomains.includes('bar.com'));
  check('factsFromOpencliSearch: 只给事实不给判定（note 里没有"应该/建议做"这类结论词）', !/应该做|值得做|可以做/.test(opFacts.note));

  // extractWebPresenceFacts（serper 付费兜底路径）
  const serpFixture = {
    keyword: 'invoice tool',
    derived: { exactDomainMatch: 2, partialDomainMatch: 1, homepages: 3, innerPages: 7 },
    organic: [{ link: 'https://a.com/1' }, { link: 'https://a.com/2' }, { link: 'https://b.com/1' }],
  };
  const wpf = extractWebPresenceFacts(serpFixture, 'invoice tool');
  check('extractWebPresenceFacts: 域名去重后 2 个', wpf.topDomains.length === 2);
  check('extractWebPresenceFacts: exactDomainMatch 透传', wpf.exactDomainMatch === 2);
  check('extractWebPresenceFacts: 无 derived 字段时返回 null（不是抛错）', extractWebPresenceFacts({ organic: [] }) === null);
  check('extractWebPresenceFacts: 输入为 null 时安全返回 null', extractWebPresenceFacts(null) === null);

  // renderCandidatesMarkdown
  const md = renderCandidatesMarkdown(merged);
  check('renderCandidatesMarkdown: 包含候选名', md.includes('foo.com'));
  check('renderCandidatesMarkdown: 包含"不产生选品结论"的免责声明', md.includes('不产生选品结论'));
  check('renderCandidatesMarkdown: 提示下一步喂进 gate-runner', md.includes('gate-runner.mjs'));
  const mdWithWebcheck = renderCandidatesMarkdown([{ ...merged[0], webPresence: { checked: false, note: 'opencli 没连上，具体绕法见上' } }]);
  check('renderCandidatesMarkdown: webPresence.checked=false 渲染成"未检测(...)"', mdWithWebcheck.includes('未检测'));

  // ══════════════════════════════════════════════════════════════════════
  // 2026-09-13 首跑复盘修复：回归测试
  // ══════════════════════════════════════════════════════════════════════

  // ── 【修复 1】detectBlockedSignal：被墙/验证码特征侦测（纯函数）
  check('detectBlockedSignal: 命中 recaptcha', detectBlockedSignal('Please complete the reCAPTCHA below').blocked === true);
  check('detectBlockedSignal: 命中 "unusual traffic"（Google 标准封禁文案）',
    detectBlockedSignal('Our systems have detected unusual traffic from your computer network.').blocked === true);
  check('detectBlockedSignal: 命中 429', detectBlockedSignal('HTTP 429 Too Many Requests').blocked === true);
  check('detectBlockedSignal: 命中 google.com/sorry/ 拦截页', detectBlockedSignal('redirected to https://www.google.com/sorry/index?continue=...').blocked === true);
  check('detectBlockedSignal: 正常 JSON 响应不误判', detectBlockedSignal('{"1":[{"kind":"advertiser","name":"Acme"}]}') === null);
  check('detectBlockedSignal: 正常的 ads-transparency 协议错误不误判成被墙',
    detectBlockedSignal('advertisers 请求形状被拒（协议可能变了）：BadRequestException: Trouble converting f.req') === null);
  check('detectBlockedSignal: 空字符串/空值安全返回 null', detectBlockedSignal('') === null && detectBlockedSignal(null) === null && detectBlockedSignal(undefined) === null);
  check('detectBlockedSignal: 命中时带上了具体命中的模式（方便定位日志）', typeof detectBlockedSignal('captcha required').matched === 'string');

  // ── 【修复 1】checkCooldown / recordBlockEvent：跨进程持久化冷却状态（有 I/O，用独立 tmp 目录）
  const blockTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leading-indicator-block-selftest-'));
  try {
    check('checkCooldown: 从没记录过的 channel 不阻塞', checkCooldown(blockTmp, 'scan:ads').blocked === false);
    const t0 = Date.parse('2026-01-01T00:00:00.000Z');
    const s1 = recordBlockEvent(blockTmp, 'scan:ads', { blocked: true, reason: 'recaptcha', now: t0 });
    check('recordBlockEvent: 第 1 次被墙，连续计数=1，未达阈值不设冷却', s1.consecutiveBlocks === 1 && s1.cooldownUntil === 0);
    check('checkCooldown: 未达阈值时不阻塞', checkCooldown(blockTmp, 'scan:ads', t0 + 1000).blocked === false);
    const s2 = recordBlockEvent(blockTmp, 'scan:ads', { blocked: true, reason: 'recaptcha', now: t0 + 2000 });
    check('recordBlockEvent: 第 2 次连续被墙（= 阈值）触发冷却，cooldownUntil > now', s2.consecutiveBlocks === 2 && s2.cooldownUntil > t0 + 2000);
    const cd = checkCooldown(blockTmp, 'scan:ads', t0 + 3000);
    check('checkCooldown: 冷却期内明确报告 blocked:true + 具体截止时间', cd.blocked === true && typeof cd.until === 'number' && cd.until > t0 + 3000);
    check('checkCooldown: 冷却期外（模拟冷却已过）恢复不阻塞', checkCooldown(blockTmp, 'scan:ads', s2.cooldownUntil + 1).blocked === false);
    const s3 = recordBlockEvent(blockTmp, 'scan:ads', { blocked: false, now: t0 + 4000 });
    check('recordBlockEvent: 成功一次后连续计数清零、冷却解除（这个 channel 又正常了）', s3.consecutiveBlocks === 0 && s3.cooldownUntil === 0);
    // 两个 channel 互不连累：ads 被墙不该影响 web-check 的冷却状态
    check('checkCooldown: 不同 channel 互相独立', checkCooldown(blockTmp, 'web-check:opencli', t0 + 3000).blocked === false);
  } finally {
    fs.rmSync(blockTmp, { recursive: true, force: true });
  }

  // ── 【修复 1】syncSleepMs：真实节流（不是挂一个没人 await 的 Promise）
  {
    const before = Date.now();
    syncSleepMs(30);
    check('syncSleepMs: 确实阻塞了约定的时长（不是空转立刻返回）', Date.now() - before >= 20);
  }

  // ── 【修复 2】adsZeroHitAdvice：0 命中时的可操作提示，不能读成"没人做"
  const advice = adsZeroHitAdvice('invoice generator online');
  check('adsZeroHitAdvice: 明确说是字面子串匹配，不是语义搜索', advice.includes('字面子串匹配') && advice.includes('不是语义搜索'));
  check('adsZeroHitAdvice: 明确否定"0 命中=没人做"这个误读', advice.includes('0 命中 ≠'));
  check('adsZeroHitAdvice: 带上了传入的查询词', advice.includes('invoice generator online'));
  check('adsZeroHitAdvice: 给了具体的换词方向（词根/品牌名）', advice.includes('词根') && advice.includes('品牌名'));
  check('adsZeroHitAdvice: 给了已知能命中的示例词，而不是空话', /advertisers "/.test(advice));
  check('adsZeroHitAdvice: 没有查询词时也能工作，不抛错', typeof adsZeroHitAdvice(null) === 'string' && adsZeroHitAdvice(null).length > 0);
  check('extractAdsQueryArg: 从透传参数里抠出查询词', extractAdsQueryArg(['advertisers', 'invoice generator', '--region', 'us']) === 'invoice generator');
  check('extractAdsQueryArg: 抠不出来时返回 null 而不是抛错', extractAdsQueryArg(['advertisers', '--region', 'us']) === null || typeof extractAdsQueryArg(['advertisers', '--region', 'us']) === 'string');

  // ── 【修复 3】域名型 vs 品类型候选的 web-check 默认查询
  check('isDomainLikeName: 域名判定为真', isDomainLikeName('invoiceapp.com') === true && isDomainLikeName('billing.example.com') === true);
  check('isDomainLikeName: 公司名/App 名判定为假', isDomainLikeName('Acme Inc') === false && isDomainLikeName('Notion') === false);
  check('domainKeywordPhrase: 剥掉 .com 只留主标签', domainKeywordPhrase('invoiceapp.com') === 'invoiceapp');
  check('domainKeywordPhrase: 双段 TLD（.co.uk）也能剥干净', domainKeywordPhrase('acme.co.uk') === 'acme');
  const domainCand = { name: 'invoiceapp.com', source: 'stripe', extra: {} };
  check('defaultWebCheckQuery: 域名型候选不再把域名字面量拼进查询词', !defaultWebCheckQuery(domainCand).includes('invoiceapp.com'));
  check('defaultWebCheckQuery: 域名型候选查询词改成"品牌/短语 + alternative"', defaultWebCheckQuery(domainCand) === '"invoiceapp" alternative');
  const domainCandWithBrand = { name: 'acme-app.example.com', source: 'ads', extra: { mode: 'creatives', advertiserName: 'Acme Inc' } };
  check('defaultWebCheckQuery: 域名型候选有 advertiserName 时优先用品牌名而不是域名短语', defaultWebCheckQuery(domainCandWithBrand) === '"Acme Inc" alternative');
  const nonDomainCand = { name: 'Invoice Pro', source: 'appstore', extra: {} };
  check('defaultWebCheckQuery: 品类型候选维持旧策略（<名字> online tool）', defaultWebCheckQuery(nonDomainCand) === 'Invoice Pro online tool');

  // ── 【修复 4】appstore/gplay 巨头过滤
  check('isLikelyGiantPublisher: 命中已知巨头（大小写不敏感子串）', isLikelyGiantPublisher('Google LLC') === true && isLikelyGiantPublisher('bytedance pte ltd') === true);
  check('isLikelyGiantPublisher: 独立开发者名不误伤', isLikelyGiantPublisher('Acme Invoice Studio') === false);
  check('isLikelyGiantPublisher: 空值安全返回 false', isLikelyGiantPublisher(null) === false && isLikelyGiantPublisher('') === false);
  check('parseInstallsApprox: 解析 "50M+"', parseInstallsApprox('50M+') === 50_000_000);
  check('parseInstallsApprox: 解析带逗号的精确数字', parseInstallsApprox('1,234,567') === 1234567);
  check('parseInstallsApprox: 解析不出来时返回 null（不是 0）', parseInstallsApprox('N/A') === null);
  const giantByDev = { source: 'appstore', name: 'Google Docs', extra: { artist: 'Google LLC' } };
  const giantByInstalls = { source: 'gplay', name: 'Mega App', extra: { developer: 'Some Small Studio', installs: '100M+' } };
  const normalApp = { source: 'gplay', name: 'Invoice Maker', extra: { developer: 'Acme Invoice Studio', installs: '10K+' } };
  check('classifyGiant: appstore 开发者命中巨头名单 → giant:true', classifyGiant(giantByDev).giant === true);
  check('classifyGiant: gplay 安装量超阈值 → giant:true（哪怕开发者不是巨头）', classifyGiant(giantByInstalls, { maxInstalls: 50_000_000 }).giant === true);
  check('classifyGiant: 独立开发者、安装量不高 → giant:false', classifyGiant(normalApp, { maxInstalls: 50_000_000 }).giant === false);
  check('classifyGiant: 判定理由是人读文案，不是空的', classifyGiant(giantByDev).reason.includes('Google LLC'));
  const partition = partitionGiants([giantByDev, giantByInstalls, normalApp], { maxInstalls: 50_000_000 });
  check('partitionGiants: kept 只留下独立开发者条目', partition.kept.length === 1 && partition.kept[0] === normalApp);
  check('partitionGiants: filtered 保留了另外两条，没有被丢弃', partition.filtered.length === 2);
  check('partitionGiants: filtered 条目带上了 giantFilterReason，方便复核（不是被静默吞掉）', partition.filtered.every((g) => typeof g.giantFilterReason === 'string' && g.giantFilterReason.length > 0));

  // ── 【修复 5】跨源聚类：宁可保守，不做模糊匹配
  // 设计成"传递闭包"场景：ads(creatives, 候选名是域名) 靠 advertiserName 和
  // ads(advertisers, 候选名是公司名) 连起来，ads(advertisers) 又靠公司名和
  // appstore(开发者名) 连起来，stripe 靠同一个域名直接和 ads(creatives) 连起来——
  // 四条候选应该经由钥匙传递闭包合并成一个跨 3 个独立信号源（ads/appstore/stripe）
  // 的聚类，这正是"三个独立方法论撞到同一个方向"这个核心价值主张的最小复现。
  const clusterFixture = [
    buildCandidate('ads', { domain: 'invoiceapp.com', advertiserId: 'AR1', daysRunning: 90, advertiserName: 'Acme Inc', previewUrl: 'https://ads.example/prev1' }, { discoveredAt: '2026-01-01T00:00:00.000Z' }),
    buildCandidate('stripe', { domain: 'invoiceapp.com', visits: 500 }, { discoveredAt: '2026-01-02T00:00:00.000Z' }),
    buildCandidate('ads', { name: 'Acme Inc', advertiserId: 'AR2', minAds: 5, maxAds: 20, url: 'https://adstransparency.google.com/advertiser/AR2' }, { discoveredAt: '2026-01-03T00:00:00.000Z' }),
    buildCandidate('appstore', { name: 'Acme Invoice Tracker', appId: 'id1', artist: 'Acme Inc', rank: 3, url: 'https://apps.apple.com/id1' }, { discoveredAt: '2026-01-04T00:00:00.000Z' }),
    buildCandidate('gplay', { name: 'Invoice Maker', appId: 'com.x', developer: 'Totally Different Studio', rating: 4.2, url: 'https://play.google.com/com.x' }, { discoveredAt: '2026-01-05T00:00:00.000Z' }),
    buildCandidate('appstore', { name: 'Invoice Pro', appId: 'id2', artist: 'Another Studio', rank: 5, url: 'https://apps.apple.com/id2' }, { discoveredAt: '2026-01-06T00:00:00.000Z' }),
  ];
  const clusters = clusterCandidates(clusterFixture);
  const megaCluster = clusters.find((c) => c.members.some((m) => m.name === 'invoiceapp.com'));
  check('clusterCandidates: 域名(ads creatives+stripe) 经由 advertiserName 钥匙和公司名(ads advertisers+appstore) 传递闭包合并',
    megaCluster && megaCluster.members.length === 4);
  check('clusterCandidates: 合并后的簇命中 3 个独立信号源（ads/appstore/stripe），这正是本脚本要挖的核心信号',
    megaCluster && megaCluster.sourceCount === 3 && megaCluster.sourcesHit.join(',') === 'ads,appstore,stripe');
  check('clusterCandidates: 簇内保留了每条原始候选各自的证据链接，没有合并时丢证据（4 条候选各自的证据 URL 都在）',
    megaCluster && megaCluster.evidence.length === 4 && new Set(megaCluster.evidence.map((e) => e.url)).size === 4);
  const invoiceMakerCluster = clusters.find((c) => c.members.length === 1 && c.members[0].name === 'Invoice Maker');
  const invoiceProCluster = clusters.find((c) => c.members.length === 1 && c.members[0].name === 'Invoice Pro');
  check('clusterCandidates（保守边界）: "Invoice Maker" 和 "Invoice Pro" 措辞不同，不做模糊合并，各自独立成单源簇',
    !!invoiceMakerCluster && !!invoiceProCluster && invoiceMakerCluster.sourceCount === 1 && invoiceProCluster.sourceCount === 1);
  check('clusterCandidates（保守边界）: 两个不相关的开发者名（Totally Different Studio / Another Studio）不会被误撞到一起',
    invoiceMakerCluster.clusterKey !== invoiceProCluster.clusterKey);
  check('clusterCandidates: 按命中源数降序排序（多源命中的簇排在前面）',
    clusters[0].sourceCount >= clusters[clusters.length - 1].sourceCount && clusters[0] === megaCluster);
  check('normalizeForCluster: 太短/太通用的名字返回 null，不当聚类钥匙（避免误撞）', normalizeForCluster({ name: 'Co' }) === null);
  check('candidateClusterKeys: stripe 候选即使 extra 里塞了 artist 字段也不会被当开发者钥匙用（只认 appstore/gplay/ads-creatives）',
    candidateClusterKeys({ name: 'Foo Widgets', source: 'stripe', extra: { artist: 'Bar Corp' } }).length === 1);
  check('candidateClusterKeys: ads advertisers 模式（非 creatives）不会额外贡献开发者钥匙（只有候选名本身这一把）',
    candidateClusterKeys({ name: 'Foo Widgets', source: 'ads', extra: { mode: 'advertisers', country: 'US' } }).length === 1);
  const clustersMd = renderClustersMarkdown(clusters);
  check('renderClustersMarkdown: 声明"刻意不做模糊相似度匹配"', clustersMd.includes('不做模糊相似度匹配'));
  check('renderClustersMarkdown: 包含跨源命中的聚类内容', clustersMd.includes('invoiceapp.com') && clustersMd.includes('Acme'));
  check('renderClustersMarkdown: 单源簇（Invoice Maker/Invoice Pro）不出现在多源表格里（只列 ≥2 源的簇）',
    !new RegExp(`\\|[^|]*Invoice Maker[^|]*\\|`).test(clustersMd) && !new RegExp(`\\|[^|]*Invoice Pro[^|]*\\|`).test(clustersMd));

  // ── 端到端集成自测：scan --dry-run（只做本地文件 I/O，不 spawn 子进程、不联网）
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'leading-indicator-selftest-'));
  try {
    const evDir = path.join(tmp, 'evidence');
    const { rows, rawEvidenceFile, blocked: scanBlocked } = runScan('stripe', ['top', '--new-only'], { dryRun: true, timeout: 5000, evDir, outDir: tmp });
    check('集成: dry-run 的 runScan 不产生候选行', rows.length === 0);
    check('集成: dry-run 且没有冷却记录时 blocked 为 false', scanBlocked === false);
    check('集成: dry-run 会落一份 note 文件', rawEvidenceFile && fs.existsSync(rawEvidenceFile));
    const noteContent = JSON.parse(fs.readFileSync(rawEvidenceFile, 'utf8'));
    check('集成: dry-run note 里带上了将要跑的真实命令', noteContent.wouldRun.includes('stripe-referring.mjs') && noteContent.wouldRun.includes('top'));

    const wc = runWebCheck('invoice tool', { dryRun: true, timeout: 5000, evDir, lang: 'en', outDir: tmp });
    check('集成: web-check dry-run 不发起真实调用', wc.checked === false && wc.dryRun === true);
    check('集成: web-check dry-run 命令用的是免费的 opencli 路径，不是付费 serper', wc.wouldRun.startsWith('opencli google search'));

    // 集成: 冷却期内的 runScan/runWebCheck 必须明确报告 blocked:true，不能静默返回一个和
    // "真的 0 条/真的没查到"长得一样的结果——这是"被墙时确实报错而非静默"的端到端验证。
    recordBlockEvent(tmp, 'scan:stripe', { blocked: true, now: Date.now() });
    recordBlockEvent(tmp, 'scan:stripe', { blocked: true, now: Date.now() });
    const cooledScan = runScan('stripe', ['top'], { dryRun: true, timeout: 5000, evDir, outDir: tmp });
    check('集成: 连续被墙达到阈值后，runScan 直接拒绝执行并显式标 blocked:true（不是静默返回空结果）',
      cooledScan.blocked === true && cooledScan.blockedReason === 'cooldown' && cooledScan.rows.length === 0);
    recordBlockEvent(tmp, 'web-check:opencli', { blocked: true, now: Date.now() });
    recordBlockEvent(tmp, 'web-check:opencli', { blocked: true, now: Date.now() });
    const cooledWc = runWebCheck('invoice tool', { dryRun: true, timeout: 5000, evDir, lang: 'en', outDir: tmp });
    check('集成: 连续被墙达到阈值后，runWebCheck 直接拒绝执行并显式标 blocked:true + 带 🚫 的说明',
      cooledWc.blocked === true && cooledWc.checked === false && cooledWc.note.includes('🚫'));

    // 完整走一遍 cmdScan 的落盘部分（不经过 CLI 入口，直接调用内部逻辑验证文件产出）
    const candA = buildCandidate('stripe', { domain: 'demo.com', visits: 500, isNew: true }, { discoveredAt: new Date().toISOString(), rawEvidenceFile });
    const storePath = path.join(tmp, 'candidates.json');
    fs.writeFileSync(storePath, JSON.stringify(mergeCandidates([], [candA]), null, 2) + '\n');
    fs.writeFileSync(path.join(tmp, 'candidates.md'), renderCandidatesMarkdown(JSON.parse(fs.readFileSync(storePath, 'utf8'))) + '\n');
    check('集成: candidates.json 落盘且可读回', fs.existsSync(storePath) && JSON.parse(fs.readFileSync(storePath, 'utf8')).length === 1);
    check('集成: candidates.md 落盘且含候选名', fs.readFileSync(path.join(tmp, 'candidates.md'), 'utf8').includes('demo.com'));

    // 集成: report --giants 依赖的 filtered-giants.json 落盘格式（cmdScan 里用 mergeCandidates 累积写）
    const giantsPath = path.join(tmp, 'filtered-giants.json');
    fs.writeFileSync(giantsPath, JSON.stringify(mergeCandidates([], [{ ...partition.filtered[0], key: 'appstore::google docs' }]), null, 2) + '\n');
    check('集成: filtered-giants.json 落盘且可读回、带着过滤理由（不是静默丢弃）', JSON.parse(fs.readFileSync(giantsPath, 'utf8'))[0].giantFilterReason.includes('Google LLC'));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  const failed = ok.filter(([, c]) => !c);
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  if (failed.length) { console.error(`leading-indicator self-test: ${failed.length}/${ok.length} FAILED`); process.exit(1); }
  console.log(`leading-indicator self-test: PASS (${ok.length} checks)`);
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try { return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(path.resolve(process.argv[1])); }
  catch { return false; }
})();
if (invokedDirectly) main().catch((e) => die(e?.message || String(e)));
