# Similarweb 功能全景 + 我们的探索缺口

**调研日期**:2026-08-29。方式:纯外网调研(官方产品页/知识库检索 + 英文评测 + 中文站长圈教程),
**未触碰** sim.proxy.example.com 或任何登录面板。
对照基线:`backlink/scripts/similarweb-query.mjs` 五类报表(performance / channels /
similar-sites / audience-geo / site-keywords)+ `similarweb-keywords.mjs` +
`rankup/references/provider-capabilities.md` 的 73 条路由旧地图(23 个可用模块 + 5 个买不起的独立产品)。

图例:✅ 已有脚本覆盖 ⬜ 未探索(账号内可达或大概率可达) ❓ PRO/当前套餐可能不含(注明依据)

---

## 一、先立骨架:Similarweb 是一堆分开卖的产品

| 产品线 | 一句话 | 我们的账号 |
|---|---|---|
| **Web Intelligence(网站情报)** | 主产品,即俗称的 Similarweb PRO。网站/行业/关键词/广告/AI 流量全在这里 | ✅ 唯一订阅的一档(内部实测确认) |
| App Intelligence | 4M+ App 的下载量、DAU/WAU/MAU、留存、ASO,58 国 | ❓ 独立计价(G2/官方 packages 页:enterprise custom quote,每模块 $20k–60k+/年;试用也不含——contentforce/试用条款) |
| Sales Intelligence | 销售找线索:流量信号+技术栈变更+意图+联系人 | ❓ 同上,独立产品 |
| Shopper/Retail Intelligence | Amazon 等电商站内:ASIN 级销量、站内搜索词、品类份额 | ❓ 独立产品(官方 corp/shopper 页) |
| Stock Intelligence | 给投资人的另类数据 | ❓ 独立产品 |
| Data Studio / DaaS / API | 原始数据打包(Batch API / datasets) | ❓ 独立计价;网页版 PRO 不带 REST API 配额 |

**套餐分档参考**(searchatlas/stylefactory/saaspricepulse 评测,自助套餐):
Starter $199/月(1 用户、3 个月历史、1000 词/表、**无国家过滤、无外链/站体检/排名追踪**);
Professional $399/月(3 用户、15 个月历史、5000 词/表、含 Rank Tracker / Backlinks / Site Audit);
Team/Enterprise 谈价(最长 37 个月历史、100+ 国、API)。
**我们的共享账号历史上能看 2013-09 至今的趋势**(出海指南实测帖同样描述),说明不是 Starter 档。

---

## 二、Web Intelligence 功能清单(按模块,对照我们的覆盖)

### 1. 网站分析 Website Analysis(内部地图:15 页,核心)

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| 网站表现 Overview(全球排名/总访问/参与度/跳出率/设备占比) | 这个站到底多大、健康不健康 | ✅ `--report performance` |
| 营销渠道 Marketing Channels(直接/搜索/引荐/社交/展示/邮件/AI 六渠道) | 流量从哪来,增长引擎是什么 | ✅ `--report channels` |
| 相似网站 / 竞争对手识别 | 这个赛道还有谁,扩展竞品池 | ✅ `--report similar-sites` |
| 受众地理 Geography | 主力市场是哪几个国家 | ✅ `--report audience-geo` |
| 网站关键词(自然+付费搜索词) | 它靠哪些词吃饭 | ✅ `--report site-keywords` |
| **热门页面 Pages Report**(整体/桌面/移动,含各页流量占比) | 竞品哪些页面在扛流量,内容结构怎么抄 | ⬜ 内部实测有 850 格满表(canva 主页 39.47%/3.1亿),**无脚本** |
| 子域名 & 子文件夹 Subdomains/Subfolders | 对手网站架构与内容布局优先级 | ⬜ |
| 引荐流量 Incoming / **Outgoing Traffic** | 谁在给它导流、它把流量导给谁(联盟/合作线索) | ⬜(channels 只有渠道占比,没有具体引荐站清单) |
| 社交流量明细(分平台、来源页) | 它在哪个社媒起量 | ⬜ |
| 展示广告流量(广告平台/展示站点/素材) | 它买了什么展示广告 | ⬜ |
| 受众人口统计 Demographics(年龄/性别)+ 受众兴趣 Interests | 用户是谁、还爱逛哪些站(合作与外链目标库) | ⬜ |
| **受众重叠 Audience Overlap**(去重受众,最多对比 5 站) | 我和竞品用户重合多少,抢的是不是同一批人 | ⬜ 评测圈公认的 Similarweb 招牌能力(trafficthinktank/99signals) |
| 网站技术栈 Website Technologies | 对手用什么建站/统计/支付 | ⬜(知识库确认存在;是否在我们档位未验证) |
| 流量趋势拐点(2013 至今月度) | 它哪个月起飞/崩盘,反推动作 | ✅ 部分(performance 带趋势;长历史逐月导出无脚本) |

### 2. 关键词研究 Keyword Research(内部地图:15 页,核心)

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| 种子词 → 相关词(量/难度/CPC/意图) | 选词 | ✅ `similarweb-keywords.mjs` |
| **关键词缺口 Keyword Gap**(我 vs 竞品) | 竞品有排名而我没有的词 | ⬜ |
| 关键词季节性 Seasonality | 这个词什么时候爆 | ⬜ |
| SERP 快照 / SERP 机会 | 这个词的搜索结果页长什么样、有没有空位 | ⬜ |
| 搜索竞品 / 排名分布 | 一个词位上大家的份额 | ⬜ |
| **Amazon / YouTube 关键词**(多平台) | 站外平台的搜索需求 | ⬜ 99signals 点名的 Semrush 没有的能力;Amazon 词是否要 Shopper 档 **未验证** |
| Keywords by Industry(整行业词库) | 一个行业在搜什么 | ❓ trafficthinktank:仅 custom plan 提供 |

### 3. 行业与市场 Market/Industry Research

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| **站点排名 Website Rankings**(跨站排行,14 列,上限 1 万域名,按渠道分标签) | 一个行业 Top 站是谁,谁在窜升——**选站/选赛道的地图** | ⬜ 内部已枚举,无脚本 |
| 行业分析 Industry Analysis(行业总量/份额/新兴玩家) | 赛道多大、格局怎样 | ⬜ |
| **需求分析 Demand Analysis**(主题搜索量+增长率,内部实测**无需配置直接读**) | 哪些主题需求在涨——选题雷达 | ⬜ 高价值且零门槛 |
| 转化分析 Conversion Analysis | 品类的访问→转化漏斗基准 | ⬜ 内部更正过「不是空壳」 |
| 网站区段 Website Segments(按品类/品牌/主题切一个站) | 大站里某条业务线的真实流量 | ⬜ 需先建区段(写操作,内部为空态);知识库确认按 Category/Conversion/Brand/Topic 四型 |
| 自定义行业 Custom Industry | 自己圈一批站当赛道 | ⬜ 写操作 |

### 4. SEO 套件(Professional 档能力)

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| 外链 Backlinks(概览/引荐站点/外链表,3 页) | 谁在链它 | ⬜(我们外链主力在 Semrush/Ahrefs,但可当第三信源) |
| 排名跟踪器 Rank Tracker(11 页) | 天天盯自己和竞品的词位 | ⬜ 写操作(需建跟踪) |
| 站点体检 Site Audit / 推荐建议 | 技术 SEO 问题 | ⬜ 写操作,内部红线不触发 |

### 5. 广告情报 Ad Intelligence

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| 广告主活动(16 页,内部页面最多的模块) | 谁在投、投哪些渠道、素材长什么样、落地页是啥(付费历史最长 3 年,trafficthinktank) | ⬜ |
| 发布方分析 Publisher Analysis(3 页) | 一个流量站靠谁变现、广告位卖给谁 | ⬜ |
| (变现-广告商/广告网络) | — | ⛔ 官方公告 2025-12-01 已停,别碰 |

### 6. AI / 生成式搜索情报(2025-26 新)

| 报表 | 回答什么问题 | 状态 |
|---|---|---|
| **AI 流量 AI Traffic**(ChatGPT/Perplexity 等给站导流) | AI 渠道给谁导了多少流量 | ⬜ 内部两次独立跑数值一致、可采信,无脚本 |
| AI 品牌可见度 Brand Visibility in AI | AI 回答里怎么提我的品牌/竞品 | ⬜ |
| AI 研究 | AI 搜索里的行业格局 | ⬜ |

### 7. 其他

| 功能 | 状态 |
|---|---|
| 数据看板 Dashboards(10 模板) | ⬜ 写操作,内部标记「不用」 |
| 监测和保护(品牌词被抢投/侵权) | ⬜ 有只读演示入口 |
| 高级版功能页 | ❓ 内部实测 route-exists-content-empty,疑似档位墙 |
| Chrome 扩展 / 免费工具(AI Traffic Checker、SERP Seismograph、Top Websites) | ⬜ 免登录,可作轻量旁路 |

---

## 三、实战经验精华(别人认为最值钱的用法)

1. **流量拐点反推打法**(出海指南 chuhaizhinan.com Pro 指南):看竞品 2013 至今月度曲线,
   找暴涨/暴跌月份,逐渠道下钻反推它那个月干了什么——比看当前快照值钱得多。
2. **「趋势比绝对值重要」**(猎者出海 liezhe.com 教程五步法):Similarweb 是抽样外推,
   绝对数在小站上能偏 40–60%(getspike/derrick 评测),但同一口径下的**相对趋势和渠道占比**可信。
   <5k 访问的站直接不显示(trafficthinktank)——查不到本身就是「太小」的结论。
3. **受众兴趣库当外链/合作靶单**(出海指南):Audience Interests 列出"你的用户还在逛哪些站",
   天然是 guest post / 联盟合作的候选清单——Semrush 没有对应物。
4. **Audience Overlap 判「真竞品」**(trafficthinktank/99signals):流量像不等于用户重合,
   重叠率高才是抢同一批人;也用来判断收购/换量对象的增量价值。这是 Similarweb 独有维度。
5. **Website Rankings + 行业分析做赛道扫描**(getspike:「no alternative replicates its
   category-level analysis at scale」):按行业+渠道拉 Top 1 万域名榜,看谁在窜升,
   是「选站」环节最接近上帝视角的一张表。
6. **Incoming/Outgoing + 展示广告扒竞品投放**(trafficthinktank):竞品付费历史最长 3 年、
   落地页与素材可见——照抄它已验证过的投放组合。
7. **多平台关键词**(99signals):Google 之外还能查 Amazon/YouTube 搜索词,Semrush 不能。
8. **总访问量跨平台互校**(本仓库实测,provider-capabilities.md 〇·五节):Similarweb 与
   Semrush .Trends 总访问量差仅 2.4%,可互为合理性检查;但**访问时长差 86%,禁止并列**。
9. **AI 流量报表**(searchatlas 2025-26 评测点名的差异化能力):量化 ChatGPT/Perplexity 引荐,
   目前多数竞品没有等价物;配合免费 AI Traffic Checker 可先验。
10. **健康度自诊**(知乎 zhuanlan.zhihu.com/p/483275040 等中文教程):拿自己站和标杆比
    渠道结构(SEO 占比过低=结构不健康),把 Similarweb 当体检表用而不只是侦察器。

---

## 四、未探索缺口 TOP 清单(按对「选站/选词/抄竞品」主流程的价值排序)

| # | 缺口 | 服务哪一步 | 为什么排这里 |
|---|---|---|---|
| 1 | **需求分析 Demand Analysis** | 选词/选赛道 | 主题级搜索量+增长率,内部实测零配置直接读,是唯一「躺着就能拿」的选题雷达 |
| 2 | **站点排名 Website Rankings(行业 Top 1 万,按渠道)** | 选站 | 赛道地图+窜升榜,评测圈公认的 Similarweb 不可替代项 |
| 3 | **热门页面 Pages + 子域名/子文件夹** | 抄竞品 | 已证实有满表数据(850 格),直接给出「对手哪些页在扛流量」 |
| 4 | **关键词研究余下报表:Keyword Gap / 季节性 / SERP 机会 / Amazon·YouTube 词** | 选词 | 现脚本只吃了种子词扩展一页,缺口最大的模块之一 |
| 5 | **AI 流量 / AI 品牌可见度** | 选站+新渠道 | 数据已验证可采信;2026 年选站需要「谁在吃 AI 引荐」这个维度 |
| 6 | **受众重叠 + 人口统计 + 兴趣** | 选站/外链 | 判真竞品、产合作靶单,Semrush 无对应物 |
| 7 | **引荐明细 Incoming/Outgoing** | 抄竞品/外链 | 具体引荐站清单是外链 discovery 的直接原料,现 channels 报表只有占比 |
| 8 | **广告主活动(16 页)+ 发布方分析** | 抄竞品 | 3 年付费历史+素材+落地页,照抄已验证投放;页数最多说明信息量最大 |
| 9 | 行业分析 / 转化分析 / 网站区段 | 选赛道 | 区段需写操作(建区段),优先级放后但对大站拆业务线独一无二 |
| 10 | 外链 3 页 + 网站技术栈 | 外链/竞品 | 与既有 Semrush/Ahrefs 重叠,当第三信源与技术栈补充 |

**探索时注意**(内部既有教训,提前避坑):未知路由会静默重定向,必须记录落地 hash;
读数要等两拍水合;「空表」≠「无数据」,chart-only 页数据在 SVG 里;`sem.proxy.example.com`/`sim` 基址别写错。

---

## 主要出处

- 官方:similarweb.com/corp/pricing、corp/shopper、corp/sales、corp/stocks、corp/apps、packages/app、support.similarweb.com(Website Analysis / Industry Analysis / Segment Analysis / Pages Report / Website Rankings 条目)
- 英文评测:trafficthinktank.com/semrush-vs-similarweb、99signals.com/semrush-vs-similarweb、searchatlas.com/blog/similarweb-review、stylefactoryproductions.com/blog/similarweb-review、getspike.ai/blog/similarweb-vs-semrush、derrick-app.com/tools/similarweb-review
- 中文实战:chuhaizhinan.com(Similarweb Pro 使用指南)、liezhe.com/similarweb-jiaocheng、zhuanlan.zhihu.com/p/483275040、p/473063238、shannote.com
- 内部基线:rankup/references/provider-capabilities.md(2026-08-27/28/29 实测)、backlink/references/authorized-data-sources.md
