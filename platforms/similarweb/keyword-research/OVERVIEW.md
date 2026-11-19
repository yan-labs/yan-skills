# Keyword Research（关键词研究）板块索引

host: sim.proxy.example.com，全 hash 路由。14 条路由已于 2026-08-30 双证人判决（种子词 image editor /
站点 canva.com），判决书见 `backlink/SKILL.md` 的 `<similarweb-round3-capabilities>` 块；
本地全文 `backlink/evidence/ground-truth/similarweb-round3-VERDICTS.md`（gitignore）。

## URL 模板三定律（进任何子页之前先记住）

1. **关键词上下文走 `?keyword=<URL编码词>` query 参数**；路径段 `/keyword/organic/search/`
   是固定字面量——把词改进路径段会被**静默重定向**到 `ai-brand-visibility/home`（hijack，exit 3）。
2. **站点路由冷深链必须带 `&key=<域>`**，否则落「输入查询以查看此报告」空态；
   落地后面板把 key 展开成 `pageFilter=[{"url":…}]`。
3. 面板会静默改写国家段（999→840）与时长段——**模板以落地 href 为准**。

## 已判决路由（关键词上下文，`?keyword=`）

| 路由 | hash 模板尾段 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| 首页 | `organicsearch/websiteanalysis/home` | 搜索框+最近浏览+列表卡 | null（机器盲，exit 2） | ✅ `home/PAGE.md` |
| 概况 | `…/overview_2?keyword=<词>` | 指标卡+SERP环+趋势 | chart（21s） | ✅ `keyword-overview/PAGE.md` |
| SERP 市场参与者 | `…/keywordAnalysis_2?keyword=<词>` | 面积图+170 域 DIV 榜 | chart | ✅ `serp-players/PAGE.md` |
| 网页 | `…/trafficAnalysis_2?keyword=<词>` | tab+趋势+URL 榜 | chart | ✅ `keyword-pages/PAGE.md` |
| 搜索广告（关键词） | `…/ads?keyword=<词>` | **真 table** | table（120 格） | ✅ `keyword-ads/PAGE.md` |
| SERP 快照 | `…/serpsnapshot?keyword=<词>` | DOM 列表（无表无图） | null（机器盲） | ✅ `serp-snapshot/PAGE.md` |
| 关键词生成器 | `findkeywords/keyword-generator-tool/…?keyword=<词>` | 4 tab DIV 榜 | null（机器盲） | ✅ `keyword-generator/PAGE.md` |

## 已判决路由（站点上下文，`&key=<域>`）

| 路由 | hash 模板尾段 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| SEO 概览 | `pageAnalysis/seo-overview/<域>/…&key=<域>` | 概要卡+venn | table（40 格） | ✅ `seo-overview/PAGE.md` |
| 网站关键词 | `pageAnalysis/website-keyword-v2/<域>/…&key=<域>` | **真 table** 13 列 | table（1,597 格） | ✅ `site-keywords/PAGE.md` |
| 关键词集群 | `websiteanalysis/topics/<域>/…&key=<域>` | **真 table** | table（120 格） | ✅ `keyword-clusters/PAGE.md` |
| 着陆页 | `pageAnalysis/landing-pages-v2/<域>/…&key=<域>` | URL 榜（DIV）+趋势 | chart | ✅ `landing-pages/PAGE.md` |
| 搜索竞争对手 | `websiteanalysis/website-competitors/<域>/…&key=<域>` | 散点+1,500 域榜 | chart | ✅ `search-competitors/PAGE.md` |
| 排名分配 | `pageAnalysis/ranking-distribution-v2/<域>/840/…&key=<域>` | 摘要条+DIV 榜 | null（机器盲） | ✅ `ranking-distribution/PAGE.md` |
| 网站搜索广告 | `pageAnalysis/website_ads/false/…&key=<域>` | **真 table** | table（180 格） | ✅ `website-ads/PAGE.md` |

## 板块级要点

- **5 条机器盲路由**（home / serp-snapshot / keyword-generator / ranking-distribution，
  加 referrals 板块的 outgoing）：cells=0 且 svgText=0，采集 exit 2。**exit 2 ≠ 空**，
  数据在 deepText 与像素里俱全——判读靠 deepText grep + AI 读图。
- 平台级坑与配额纪律见 `../OVERVIEW.md`。

## 第四轮补齐（2026-08-30，判决书 `<similarweb-round4-capabilities>`）

| 路由 | hash 模板尾段 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| 关键词生成器 · YouTube 词库 | `findkeywords/keyword-generator-tool/999/28d?searchEngine=youtube&keyword=<词>&…&tab=phraseMatch` | 趋势折线 + 2 tab + 5 列榜 | chart（svgText 18，21s） | ✅ `keyword-generator-youtube/PAGE.md` |
| 关键词列表 | `acquisition/monitorkeywords/home` | **真 table** 4 列（账号级，无上下文参数） | table（60 格 / 44 填充） | ✅ `keyword-lists/PAGE.md` |

**两条旧记录已更正：**

1. ~~「关键词列表页 monitorkeywords 只录了入口未采」~~ → **已只读采过一次**，是真 table
   的列表管理页，有可读数据（11 个列表），不是空壳；两个写入口都在页面边缘，未触碰。
   注意 KW home 上记的「关键词列表 16」与本页表头的 `(11)` 是**两处不同计数**，以本页为准。
2. ~~「生成器的 Amazon/YouTube 词库：UI 下拉里存在……未验证成功 ≠ 不存在」~~ →
   **真 CDP 点击一次即开下拉，穿透 shadow DOM 枚举出的选项恰好 2 个：`Google` / `YouTube`。**
   **Amazon 判定为「本账号/本构建不提供」**（DOM 枚举 + 截图双证），不是「未验证」；
   第三轮之所以打不开下拉，是因为用的不是真 CDP 输入。YouTube 词库已完整采集，
   且与 Google 词库**不是同一张表换数据源**（多一张趋势图、tab 少 2 个、列结构不同）。
   → 由此固化的通用判别子：**「冷深链落错误页」有两种成因**——
   (a) 参数值不在枚举里（功能真没有）；(b) 少了必需的上下文参数（功能在，URL 写错）。
   **先把 UI 的下拉枚举出来**，枚举里有就是 (b)，没有就是 (a)。
