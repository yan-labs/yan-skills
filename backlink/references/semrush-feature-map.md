# Semrush 功能全景 + 探索缺口(GURU 套餐)

> 调研日期 2026-08-29。只做调研,未触碰 sem.proxy.example.com。
> 图例:✅ 我们已实测 / ⬜ 未探索 / ❓ GURU 可能不含(注明依据)。
> 注意:2025-2026 Semrush 官网已把新客套餐改名为 SEO/Starter/Pro+/Advanced/Enterprise,
> 但存量 GURU 订阅仍按老结构运行,本文按 GURU 老结构(经典侧边栏)整理。

## 0. GURU 套餐边界(先看这个)

| 维度 | PRO | GURU | BUSINESS |
|---|---|---|---|
| Projects | 5 | **15** | 40 |
| 跟踪关键词 | 500 | **1,500** | 5,000 |
| 每报表结果数 | 10,000 | **30,000** | 50,000 |
| 每日报表请求 | 3,000 | **5,000** | 10,000 |
| 月爬取页面(Site Audit) | 100,000 | **300,000** | 1,000,000 |

GURU 独占(PRO 没有):Content Marketing 工具组、历史数据(可回溯到 2012)、Looker Studio 集成、多地点/多设备排名跟踪。
GURU 没有(BUSINESS 独占):**API 访问**、PLA(购物广告)分析、SEO Share of Voice、扩展限额。
❓ **.Trends(Traffic Analytics/Market Explorer/EyeOn/One2Target)对任何主套餐都是 $200-289/月的付费 add-on**——但我们的账号 Traffic Analytics 22 条路由实测有真数据,说明该共享账号已带 .Trends,四件套应全部可用。
❓ Local(Listing Management/Map Rank Tracker)、Social 全家桶、Agency Growth Kit、App Center 内多数应用:各自单独付费,GURU 不含(依据:semrush.com/kb/1011-subscriptions 的 specialist toolkits 定价结构)。

## 1. 竞争研究(Competitive Research)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ✅(AS 概况) | Domain Overview | 一眼看任意域名的 AS、自然/付费流量、外链、关键词国别分布、竞品图 | /analytics/overview/ |
| ⬜ | Organic Research · Positions | 该域名靠哪些词拿流量(词/排名/量/KD/流量占比/意图/SERP 特性) | /analytics/organic/positions/ |
| ⬜ | Organic Research · Position Changes | 竞品最近新增/上升/下跌/丢失了哪些词(抄竞品新动作的核心报表) | /analytics/organic/changes/ |
| ⬜ | Organic Research · Top Pages(按页聚合) | 竞品哪几个页面扛流量、每页多少词——**选站抄页面结构的关键**(与 Traffic Analytics top-pages 不同:这是按"自然搜索流量"聚合) | /analytics/organic/pages/ |
| ⬜ | Organic Research · Competitors | 与该域名词重合度最高的竞品列表(顺藤摸瓜找同生态位站) | /analytics/organic/competitors/ |
| ⬜ | Keyword Gap | 你 vs 最多 4 个竞品:哪些词他们有你没有(missing/weak/untapped 分桶+意图过滤) | /analytics/keywordgap/ |
| ⬜ | Backlink Gap | 谁给竞品发链接但没给你(外链拓展名单直接来源) | /analytics/gap/backlinks/ |
| ⬜ | Bulk Analysis | 一次贴 200 个域名批量看 AS/外链/流量(筛外链机会站、筛竞品池的批处理入口) | /analytics/backlinks/bulk/ |

## 2. 关键词研究(Keyword Research)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ✅ | Keyword Overview | 单词的量/KD/CPC/意图/趋势/SERP 分析 | /analytics/keywordoverview/ |
| ✅ | Keyword Magic Tool | 种子词扩出海量长尾(问句/相关/精确分组+KD/量过滤) | /analytics/keywordmagic/ |
| ⬜ | Keyword Manager / Keyword Strategy Builder | 存词、聚类成 pillar+cluster 页面结构,一键刷新实时指标(选题→站点结构的桥) | /keyword-manager/ |
| ⬜ | Position Tracking | 自己项目的词每日排名(GURU 支持多地点+多设备+每日更新);含 Cannibalization 报告 | 项目内 Position Tracking |
| ⬜ | Organic Traffic Insights | 打通 GA/GSC 后还原 (not provided) 关键词 | 项目内 |
| ⬜ | Keyword Overview · Bulk(批量 100 词) | 一次贴 100 个词批量出量/KD——**比逐词查快一个数量级** | Keyword Overview 输入框贴多行 |

## 3. 外链(Link Building)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ✅ | Backlink Analytics · Overview | 域名外链总量/referring domains/AS/锚文本概况 | /analytics/backlinks/overview/ |
| ⬜ | Backlink Analytics · Backlinks 明细 | 每条外链的来源页/锚文本/dofollow/新增丢失(过滤器很强:按 AS、链接类型、平台类型) | /analytics/backlinks/backlinks/ |
| ⬜ | Backlink Analytics · Referring Domains / Anchors / Indexed Pages | 按域聚合、锚文本分布、竞品被链最多的页面(=值得抄的 linkable asset) | 同上子 tab |
| ⬜ | Backlink Audit | 自己站的毒链评分(Toxicity Score)+ disavow 文件生成 | 项目内 |
| ⬜ | Link Building Tool | 按目标词自动出 prospect 名单+内置 outreach 邮件管理 | 项目内 |

## 4. 流量与市场(.Trends,账号已带)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ✅ | Traffic Analytics 22 条路由 | top-pages/渠道/受众/地理/子域名等(已固化 ground-truth.mjs) | /analytics/traffic/ |
| ⬜ | Market Explorer | 一个 niche 的市场大小、增长率、玩家四象限(Game Changers/Leaders/Niche Players)——**选站定生态位** | /trends/market-explorer/ |
| ⬜ | One2Target | 竞品受众画像:人口/社会经济/行为/受众重合 | /trends/one2target/ |
| ⬜ | EyeOn | 自动盯竞品:新页面、新博文、广告投放动态,周报推送 | /trends/eyeon/ |

## 5. 内容营销(Content,GURU 独占解锁)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ⬜ | Topic Research | 种子话题扩出卡片式子话题+高分享标题+常见问句(选题批发) | /topic-research/ |
| ⬜ | SEO Content Template | 输入目标词,基于 Top10 竞品生成写作模板(建议字数/语义相关词/该拿谁的外链) | /seo-content-template/ |
| ⬜ | SEO Writing Assistant | 实时打分改稿(可读性/SEO/原创性/语气),带抄袭检查 | /swa/ |
| ⬜ | ContentShake AI | AI 生成 SEO 文章草稿(可能按额度另计费) | App 内 |
| ⬜ | Brand Monitoring | 全网监测品牌/竞品被提及(找未链接提及→转外链) | App Center 内,❓可能另付费 |
| ⬜ | Marketing Calendar / Post Tracking | 内容排期、已发文章表现跟踪 | 内容组 |

## 6. 站点审计(Technical SEO)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ⬜ | Site Audit | 140+ 技术检查(抓取/HTTPS/CWV/内链/hreflang/结构化数据),GURU 月配额 30 万页 | 项目内 |
| ⬜ | On Page SEO Checker | 按页给优化 idea(内容/语义/外链/SERP 特性抢占建议) | 项目内 |
| ⬜ | Log File Analyzer | Googlebot 抓取日志分析(抓取预算浪费在哪) | /log-file-analyzer/ |
| ⬜ | Listing Management | 本地目录一键分发 NAP | ❓ Local 单独付费 |

## 7. 广告研究(Advertising)

| 状态 | 工具 | 回答什么 | 入口 |
|---|---|---|---|
| ⬜ | Advertising Research | 竞品投了哪些 Google Ads 词、广告文案、着陆页、预算估算(**付费词=已验证的商业意图词**,反哺自然选词) | /analytics/adwords/positions/ |
| ⬜ | Ads History | 某词过去 12 个月谁在持续投(持续投=真赚钱) | /analytics/adwords/adshistory/ |
| ⬜ | PLA Research | 购物广告数据 | ❓ BUSINESS 独占 |

## 8. 社媒 / 本地 / Agency / 其他

| 状态 | 工具 | 回答什么 | 备注 |
|---|---|---|---|
| ⬜ | Social Poster/Tracker/Analytics/Inbox | 发帖排期、竞品社媒对标 | ❓ Social 套件单独付费 |
| ⬜ | Map Rank Tracker / Review Management | 本地地图排名、评论管理 | ❓ Local 单独付费 |
| ⬜ | My Reports(PDF 报告) | 拖拽拼装跨工具 PDF 报告,GURU 可白标+定时发送 | GURU 含 |
| ⬜ | Looker Studio 集成 | Semrush 数据进 Looker Studio 仪表盘 | GURU 独占 |
| ⬜ | AI Toolkit / AI Visibility | 品牌在 ChatGPT/Perplexity/AIO 里的出现与情感(2025 新) | ❓ 新套餐主推,GURU 老账号可能仅部分可见 |
| ⬜ | App Center | Surround Sound、AdClarity 等第三方应用 | ❓ 逐个另付费 |
| ⬜ | Sensor / Notes | Google 算法波动监测 | 免费公开 |

## 9. 实战经验精华(别人认为最值钱的用法)

1. **KD<30 + 量 500-2000 是中小站黄金区间**——85% 站长只看量不看 KD 是最大误区;先 Keyword Magic 按 KD≤29 过滤再看量(知乎实战帖 zhuanlan.zhihu.com/p/1999586184930821080;serp.cn KD 解析)。
2. **Keyword Gap 的 missing+untapped 分桶 + 意图过滤**是最快的抄竞品选题法:4 个竞品都排名而你没有的词,基本就是该 niche 的必做题(supademo/flyingvgroup 教程、Search Engine Land gap analysis 指南)。
3. **Organic Research → Top Pages 反推站点结构**:看竞品哪个页面模板扛住了最多词(一页排几百词的模板页=可复制的 programmatic 结构)(robbierichards.com 关键词研究模板)。
4. **Position Changes 盯竞品"新增词"**:竞品最近 30 天新拿排名的词=市场刚验证过的新需求,比自己拍脑袋快(出海笔记/知乎 p/386674282 竞品分析流程)。
5. **Ads History 验证商业价值**:一个词有人连投 12 个月广告=真金白银验证过转化,自然位做上去就是白捡(99signals review)。
6. **Backlink Gap + Bulk Analysis 组合**:先 Gap 拿到"链给竞品没链给我"的域名池,再 Bulk Analysis 批量过 AS/流量筛选,直接生成 outreach 名单(backlinko/99signals)。
7. **Site Audit 是被低估的转化项**:99signals 作者称修完技术问题直接影响了排名表现;GURU 30 万页配额足够扫大站。
8. **Market Explorer 四象限选生态位**:进一个市场前先看 Game Changers 象限里谁在快速增长,抄增长者而不是抄 Leader(99signals .Trends 指南)。
9. **SEO Content Template 决定"写多长、提哪些词、找谁要链接"**,把 Top10 逆向成 spec,配合 SWA 实时打分,内容团队零经验也能交付(多篇 review 共识,GURU 才解锁)。
10. **一次贴 100 词的 Bulk Keyword Overview / 200 域名的 Bulk Analysis**是配额友好的批处理入口,比逐条查省 report 配额(官方 KB)。

## 10. 未探索缺口 TOP(按选站/选词/抄竞品价值排序)

1. **Organic Research 四件套**(Positions/Position Changes/Top Pages/Competitors)——抄竞品主流程的心脏,当前完全未探索。
2. **Keyword Gap**——多竞品交叉找必做词。
3. **Backlink Gap + Backlink 明细/Anchors/Indexed Pages**——外链主流程只测了 overview 一层。
4. **Advertising Research + Ads History**——商业意图验证,零覆盖。
5. **Market Explorer / One2Target / EyeOn**——.Trends 已付费但只用了 Traffic Analytics 一件。
6. **Bulk Analysis + Bulk Keyword Overview**——批处理入口,直接降低配额消耗。
7. **Keyword Strategy Builder**——词→站点结构聚类。
8. **Topic Research / SEO Content Template**——GURU 独占的内容组完全未碰。
9. **Position Tracking(建项目)**——每日排名+Cannibalization,需要占用项目额度,共享账号慎用。
10. **Site Audit / On Page SEO Checker**——同样吃项目额度与爬取配额,共享账号使用前先确认额度归属。

主要参考:semrush.com/kb/1011-subscriptions、semrush.com/blog/semrush-pro-vs-guru、demandsage.com/semrush-pro-vs-guru、99signals.com/semrush-review 与 semrush-traffic-analytics-ultimate-guide、backlinko.com/semrush-review、explodingtopics.com/semrush-pricing、supademo/flyingvgroup Keyword Gap 教程、知乎 p/386674282、p/1999586184930821080、chuhaizhinan.com 关键词调研。
