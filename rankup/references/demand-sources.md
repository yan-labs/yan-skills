# 需求挖掘数据源：源 → 脚本路由表

用户说「**找几个关键词**」「**挖点需求**」「**最近有什么能做的**」「**找个新方向/新词的工具站**」时，
本文件是入口。它只回答一件事：**要这个信号，跑哪条命令。**

- 「往哪儿看、怎么判断这个需求值不值得做」在
  [`experiences/demand-discovery.md`](experiences/demand-discovery.md)——那是裁定集。
- 「拿到候选之后怎么验证词」在 [`seo-webcafe.md`](seo-webcafe.md) 与 [`trends.md`](trends.md)。

全部脚本在 `<rankup-skill-dir>/scripts/demand/`。Node 22、零第三方依赖、
统一支持 `--help` / `--json` / `--out <file>`。**所有条目的取数路径都在 2026-08-23 逐个发过真请求验证**，
不是照文档抄的。

> **口径已变，验证日未重跑（2026-08-30 声明）。** 那次验证在三波去判决化重构**之前**：
> 此后脚本删掉了全部 verdict 与阈值分档（`level`、`belowFloor`、`strength` 等字段已不存在）、
> 失败改为落 `{url,status,body}` 现场 + manifest 逐源记状态。**取数路径本身仍然成立，
> 但输出形状变了**——本文件描述某个脚本「会输出什么」时，以 `--help` 和实际产物为准，
> 与本文措辞冲突时**信脚本**。判读一律看
> [`capability-map.md`](capability-map.md) 声明的当前行为与
> `backlink/SKILL.md` 法律 `scripts-collect-ai-judges`。

---

## 一、先决定：你现在缺的是哪一类信号

| 你想知道 | 去第几节 |
|---|---|
| 谁已经收到钱了 | [二](#二谁已经收到钱了) |
| 谁在用哪个支付网关（长尾反查） | [二·五](#二五长尾支付网关反查) |
| 谁在花钱买流量 | [三](#三谁在花钱买流量) |
| 谁做了但没做好（差评） | [四](#四谁做了但没做好差评矿) |
| 谁在为这件事付外包费 | [五](#五谁在为这件事付外包费) |
| 正在冒出来的新产品 | [六](#六正在冒出来的新产品) |
| 持续涌现新词的平台 | [七](#七持续涌现新词的平台) |
| 用户的原话（许愿与吐槽） | [八](#八用户的原话) |
| 竞品正在往哪儿下注 | [九](#九竞品正在往哪儿下注) |
| 我盯上了一个跑通的站，想把它整个站群拆开 | [九·二](#九二一个站背后的整个站群) |
| 我连方向都没有，只有一个词根 | [九·五](#九五从词根出发) |
| 正在上涨的新站（平台子域名监控） | [九·三](#九三平台子域名监控) |
| 跨平台自动补全扩词 | [九·七](#九七跨平台自动补全扩词) |
| **同行已经把答案写出来了，我只是没去读** | [九·八](#九八已经有人替你调研过了哥飞社区) |
| **不管缺哪类信号，先亲眼看一遍搜索结果首页** | [一·五](#一五先亲眼看一遍搜索结果首页多引擎实勘) |
| 拿到候选之后怎么验证 | [十](#十候选验证链路) |
| 排上去到底值不值 | [十·五](#十五能排上去和能赚钱是两个独立命题) |

**一条通则**：任何一节拿到的候选，最终都要汇成一份**域名清单**或**关键词清单**，
再走第十节验证。别在没验证之前就开工。

```bash
# 多个榜单合流成去重域名清单的标准姿势
node scripts/demand/boards.mjs traffic-cv --json \
  | jq -r '.[].domain' | sort -u > /tmp/candidates.txt
```

---

---

## 一·五、先亲眼看一遍搜索结果首页（多引擎实勘）

**任何调研的第一个动作，是去搜索引擎里把目标词搜一遍，亲眼看第一页排的是什么。**
不是第二步，不是补充材料，是第一步。

理由很硬：**数据平台给的都是加工过的二手结论**——Semrush 的自然流量是模型输出
（追踪到的关键词 × 搜索量 × 位次点击率），Similarweb 是面板外推，KD 是估算分。
而搜索结果首页是搜索引擎**此刻真正端给用户的东西**，没有中间层。
一个词的量再好看，首页十条全是平台自己的产品页，这个词就不该做——
这个判断只有亲眼看首页能得出，任何指标都给不了。

### 至少搜这几个，且知道哪些不是独立样本

| 引擎 | 为什么要看 | 注意 |
|---|---|---|
| **Google** | 绝大多数市场的主战场；AI Overviews / AI Mode 也在这里 | 必看 |
| **Bing** | 独立索引，与 Google 的取舍经常不同；也是 Copilot 的底座 | 必看 |
| **DuckDuckGo** | 隐私向用户的入口 | **网页结果主要来自 Bing 索引**——它和 Bing **不是两个独立样本**，两边一致不构成交叉验证 |
| **Brave Search** | 自有索引，是 Google/Bing 之外真正的第三个视角 | 想要第三个独立样本时用它，不要拿 DuckDuckGo 凑数 |
| **目标市场的本地引擎** | 韩国 Naver、俄语区 Yandex、中文区百度、捷克 Seznam | 做非英语市场时**必看**：本地引擎的首页构成常常和 Google 完全不同 |
| **AI 搜索**（AI Overviews / AI Mode / Perplexity / ChatGPT 搜索） | 2026 的分发里**引用优先于排名**，被引用的是谁比谁排第一更重要 | 记下它引用了哪几个域名，这就是这个主题的实际权威名单 |

### 怎么搜才算数

1. **无痕或隔离窗口。** 带着自己的登录态和历史搜，拿到的是个性化结果，
   不是这个词的公共盘面。OpenCLI 用 `--window isolated`，或直接开无痕。
2. **显式指定地区与语言**（`gl` / `hl`，或引擎自己的地区设置）。
   不指定就是按出口 IP 判定——用代理或沙箱时拿到的是机房所在国的结果，
   看起来完全正常，实际测的是另一个市场。
3. **这一步是少数可以用沙箱浏览器的场景**：公开搜索结果不需要登录态，
   沙箱的「干净无 cookie」在这里反而是优点。但**地区参数必须显式给**，理由同上。
4. **不要用二手 SERP 接口代替这一步。** `serp-query.mjs`、`seo-webcafe.mjs serp`
   是给规模化统计用的，返回的是结构化字段，看不到版式、看不到 SERP 特性占了多少屏、
   看不到 AI 答案。而且 2026-08 起 Google 把出站链接换成了 `google.com/goto` 跳板，
   二手通道更容易降级而接口照样回 200——见 [`seo-growth.md`](seo-growth.md) 对应一节。

### 每个引擎记下这七样

写进 `.rankup/keywords.md`（词级）或 `.rankup/decisions.md`（方向级），**带引擎、国家、日期**：

| 记什么 | 它回答的问题 |
|---|---|
| 前十的**页面类型构成** | 真工具站 / 论坛 UGC / 素材库 / 官方文档 / 平台商品页各占几席 |
| 有几个是**专门为该词制作的页面** | 这是唯一跨工具、跨时间可比的竞争强度指标 |
| **最弱的那个占位者**长什么样 | 免费托管页、个人子域、内容单薄的页面 = 可攻的缺口 |
| **SERP 特性**占了多少屏 | PAA、视频、图片包、商品卡、地图、论坛模块——自然结果被挤到哪里 |
| **有没有 AI 答案，引用了谁** | 引用名单就是这个主题的实际权威清单 |
| **广告几条、谁在投** | 有人持续买这个词 = 这个需求能变现（但不证明他在盈利） |
| **有没有独立站的空位** | 最终裁决：这盘面是「有空位没人争」，还是「没人打算把它交给独立站」 |

### SERP 盘面怎么读（`serp-query.mjs` 的派生计数）

`scripts/demand/serp-query.mjs` 输出的是**计数不是结论**（原始 serper 响应每次
都会落进证据目录，字段哪天解析错了拿 raw 对质）。判读归这里：

- **domainMatch 是启发式，不是事实。** 它只看域名主标签里有没有关键词的实义词素：
  命中不等于对方真的专营这个词，品牌名站漏判也常见。当信号看，别当判据。
- **精确域名命中多**（前十里好几个站把词做进主域名）→ 成熟小生态，垂直老站扎堆，
  难度分往往低估；**一个都没有** → 要么没人专门做，要么这个词根本不构成一个站的定位。
- **首页多** → 大站拿主页硬顶，新站单页难以插入；**内页多** → 有靠单页切进去的缝。
- **有答案框/知识图谱** → 零点击比例高，先估一眼自然结果还剩多少屏。
- 这些计数只看前十；第二页之后的盘面对「这个词好不好切」没有解释力。

### 引擎之间不一致，本身就是结论

不要急着把差异当噪声抹平：

- **Google 全是平台占位、Bing 首页有独立站** → Bing 那侧有空位，
  同时说明 Google 已经把这类意图判给了平台，Google 侧的天花板很低。
- **英语盘面被占满、目标语种的本地引擎首页还很空** → 机会在语言差里，
  不在词本身（验证方法见 [`seo-growth.md`](seo-growth.md) 的多语言一节）。
- **所有引擎首页都是新闻、影视、赛事或成人内容** → 需求真实但不是工具需求，
  这个种子直接否掉，不用再进横向比较。

**记录差异，不要只记一个「综合印象」。** 一句「竞争激烈」在下一轮复盘时什么都不是；
「2026-08-28 Google US 前十 8 个专门页 / Bing US 前十 3 个专门页，Bing 侧最弱位是一个免费托管页」
才能在两个月后拿来对比。

## 二、谁已经收到钱了

**最硬的信号。钱已经流过去了，不需要你再猜需求成不成立。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Stripe 引荐流量榜 | 域名、送往 Stripe 的月引荐量、名次、份额、环比、是否新进榜，**31 个月历史** | 公开 GET ×3，**不计配额** | 否 | `scripts/demand/stripe-referring.mjs`（含派生指标）；原始端点在 `scripts/seo-webcafe.mjs referring` / `referringMonth --m YYYYMM` / `referringSite --domain` |
| traffic.cv 流量榜/收入榜 | 名次、域名、月访问量与环比、Stripe 结账量、**域名注册时间**、TopKeywords | 纯 HTTP（解析 Next.js RSC flight） | 否 | `scripts/demand/boards.mjs traffic-cv` |
| TrustMRR | MRR、30 天营收、总营收、增速、每访客收入（Stripe 实连） | 纯 HTTP，首页一次带回 5 个榜各 100 条 | 否 | `scripts/demand/boards.mjs trustmrr` |
| Apple App Store 榜单 | 名次、App 名、开发者；`--lookup` 补价格/评分/评分数/品类。**`--list-genres` 枚举全部品类 id** | 公开 RSS JSON（脚本自动选新旧两套） | 否 | `scripts/demand/appstore-charts.mjs` |
| Google Play **真榜单** | **名次 + 名次涨跌**、评分、总安装、近 30 天安装估算，分国家分品类 | 纯 HTTP，**改从第三方榜单站取**（Google 侧走不通，见下） | 否 | `scripts/demand/gplay-charts.mjs --ranking top_free\|top_paid\|top_grossing\|top_new_free\|top_new_paid` |
| Google Play 商店页 | 包名、App 名、评分、安装量区间（**无名次**） | 公开 HTML（脆） | 否 | `scripts/demand/gplay-charts.mjs`（默认模式） |

### 收入数字该信谁

三个源给的「收入」不是一回事，**只有一个能当数字用**：

| 源 | 口径 | 怎么用 |
|---|---|---|
| TrustMRR | **Stripe 实连**的 MRR / 营收 | 唯一能当数字用的 |
| traffic.cv | 流量榜 + 自有 revenue 榜 | 定性信号 |
| Toolify | 检测到支付平台 + 按访问量排 | 只能说明「这站在收钱」 |

三家的域名集合几乎不相交，所以它们是**互补的候选池**，不是互相校验的三份证据。

### 派生指标：到达付费页比例

```
到达付费页比例 = 支付页引荐流量 ÷ 网站总访问量
月营收估算   ≈ 月访问量 × 到达付费页比例 × 支付成功率 × 客单价
```

`stripe-referring.mjs --enrich` 已内建这两个计算（支付成功率与客单价作为参数）。
读表时注意（2026-08-30）：「月总访问」一列的 `—` 只表示**没请求过**（没开 `--enrich`
也不在 `--visits` 映射里）；`失败(http_429)` 之类才是请求了没取到——配额耗尽的行
不许被读成「这个站没有总访问量数据」。

**【实测】一个必须知道的代数事实：月营收公式里的总访问量会自己约掉。**

```
月访问 × (Stripe引荐 ÷ 月访问) × 支付率 × 客单价  ≡  Stripe引荐 × 支付率 × 客单价
```

所以**补总访问量不会让营收估算更准一分**。总访问量真正的价值是让你算出
**到达付费页比例这个独立的诊断指标**——它衡量的是流量质量，不是收入：

| 实测样本 | 到达付费页比例 | 读法 |
|---|---|---|
| 某头部 AI 视频站 | 8.60% | 流量筛得准，进来的人就是要买的人 |
| 某巨头支付品牌自身 | 0.27% | 靠体量硬砸，转化极低 |

**边界必须一起记**：能进引荐榜的站本身是优等生，它的比例不是行业平均值；估算一律取保守值。

### 已验证的坑

| 坑 | 实测 |
|---|---|
| **Apple 新版 RSS 没有畅销榜** | `top-grossing` 直接 404，也不支持 genre 段。要 grossing/分类得走旧版 `itunes.apple.com/rss`，且**必须跟随 302**。旧版**没有弃用告示**（Apple 自己的 genres 接口至今仍在下发这套 URL），是当前最优路 |
| **两套 RSS 的深度硬上限都是 100** | 旧版 250 起 400，新版 150 起 500——**Top 200 拿不到**。`ws/charts` 那条路只回 resultIds 且同样卡 100，无增益 |
| ~~**Google 侧的真榜单彻底走不通**~~ **（2026-08-24 部分翻案）** | 原判据里「一次 batchexecute 都不发」**是错的观察**——那一轮跳过了 `network`、直接注入钩子。实测 `batchexecute?rpcids=vyAe2` **确实下发 50 条有序包名**，请求里的 base64 token 明文就是 `topselling_free_<CATEGORY>`，且认 `gl` 参数。PRODUCTIVITY/US 前三 = ChatGPT / com.facebook.stella / Microsoft Word，**与第三方榜单站这个独立来源一字不差**。原判据里对的那一半：**DOM 恒为空**（榜单 section 全文仅 25 字符）。**但没有脚本化**：8 次干净尝试只命中 2 次，触发条件复现不出。**生产路径不变，仍走第三方榜单站**——不把一条 8 次拿不到 6 次的路塞进脚本 |
| 第三方榜单站的两个坑 | 约 **7 次连续请求后 429**；分品类页比总榜**少一列**（脚本已改成从末尾倒着数） |
| **Google Play 商店页的 `position` 不是名次** | 只是版面顺序，脚本已标注。要名次必须用 `--ranking` |
| **Toolify 的「收入榜」不给收入** | 真实 URL 是 `/Best-AI-Tools-revenue`，实为「检测到支付平台的 AI 工具」按月访问量排序（站方文案自己承认这个口径）。逐个核过 `__NUXT__` 全字段，匹配 `rev\|mrr\|arr\|income` 的只有评论数与评分。有价值的字段是它标出的**支付平台** |
| **Toolify 与 traffic.cv 用的是同一份上游数据** | 实测五个域名在两家的访问量**逐位相同**（如 197,235,347 ↔ 197.24M）。**拿这两家互相「交叉验证」等于自证**，不构成任何验证 |
| **TrustMRR 的 `revenuePerVisitor` 分母不是站点流量** | 反推某站得到 9 个访客，而它在流量榜上是 73.45K。**不能当流量归一化指标用** |
| **TrustMRR 榜单里 `website` 恒为 null** | 域名要再打 `/startup/<slug>` 才有，故 `--resolve-domains` 默认关 |

---

## 二·五、长尾支付网关反查

**不要只盯最大的那家网关。** 专精小微商户的网关，用户多是个人开发者或极小团队——
**规模小意味着可复刻**。反查它们的引荐来源，等于拿到一份「我明天就能做一个」的清单。

已覆盖 11 个网关（含国内无执照场景常用的两家）。两条路互补：

| 路径 | 拿什么 | 取数方式 | 需登录 | 命令 |
|---|---|---|---|---|
| SERP 指纹反查 | 引用某网关结账域名/徽标的候选站 + 证据 URL | 走 seo.web.cafe 的 Google 通道，**1 次配额/查询** | 否 | `scripts/demand/payment-referrers.mjs serp <网关>` |
| Similarweb 引荐流量 | 给某网关送流量的**域名清单** | 面板 + OpenCLI 驱动已登录 Chrome，有配额 | **是**（面板登录态） | `scripts/demand/payment-referrers.mjs similarweb <网关>` |

实测规模：Similarweb 一条查询就能列出某中型网关 90 个引荐域名、另一家 29 个。

### 已验证的坑

- **Similarweb 的份额没能可靠配对**（域名数与百分比数不等，如 29 个域名对 37 个百分比）。
  脚本在数量不等时**直接放弃配对并打出说明**——错位的份额比没有份额更危险。
- Brave 搜索通道对这类指纹查询基本无效；`opencli google` 报 `Navigation rejected`。
  能用的只有 seo.web.cafe 的 Google 通道那一条。
- 失败留现场（2026-08-30，截图链路已实盘验证）：serp 逐 query 在 manifest 里记状态
  （查询失败 ≠ 没人引用这个网关）；similarweb 白屏/超时会先把**截图+页面文本**落进
  证据目录再退出，标签页留在原地供人工排查。

---

## 三、谁在花钱买流量

**持续投放 = ROI > 1。** 这是仅次于「已经收到钱」的硬信号，而且它还告诉你对方的落地页长什么样。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Google 广告透明度中心 | 广告主、在投广告数区间、相关网域、素材、落地域名、**首末投放日 + 已跑天数** | 内部 JSON RPC，**纯 curl 可打，无 token 无 cookie** | 否 | `scripts/demand/ads-transparency.mjs advertisers <词>` / `creatives --domain <域名>` |

**核心列是 `daysRunning`**：一条素材跑了一千多天，意味着这条广告的 ROI 被验证了一千多天。
拿到落地域名后回到第十节验证它的词。

已知边界：单次上限 100 条；**翻页 token 不可复用**。
现场恒久化（2026-08-30）：每次 RPC 的请求形状（`f.req` 原文）与响应体都会原样落进
证据目录（成功也落）——这是逆向端点，0 条结果时先开现场：是真没人投这个词，
还是协议变了/请求形状被拒，raw JSON 里分得清。

> 国内投放侧（内容平台的素材库、短视频投放平台）没有可自动化的公开入口，属人工动作。

### 另一条入口：谁在给应用商店买词（手工，但便宜）

Google 广告透明度中心覆盖的是**网页广告主**。想看**谁在给 App 买搜索词**，
哥飞 2024-08-22 在群里给过一条路子（`chat-search "付费搜索"` 可复现原话）：

1. Similarweb 里输入 **`apps.apple.com`**，在「自然搜索」下方找到**「付费搜索」**，
   点进去就是**正在给 App Store 落地页投广告的关键词与广告主**，分桌面/移动两份。
2. 看到投得猛的 App，记下它的 **App ID**（一串数字），
   自己拼 `https://app.sensortower.com/overview/<ID>` 查真名与收入
   ——**很多 App 会改名，商店里搜不到，但 ID 不变**。
3. 广告词里混着品牌词和需求词，**需求词才是你要的**。

**为什么值得单列**：它给的是「有人愿意为这个词付点击费」，
和第二节的「有人已经收到钱」是两条独立证据，交叉命中的方向可信度最高。
目前**没有脚本**——Similarweb 那一屏要登录且是图表渲染，属人工动作。

---

## 四、谁做了但没做好（差评矿）

**差评是唯一由用户掏钱之后给出的反馈**，可信度远高于任何免费调研。
功能列表告诉你他们做了什么，差评告诉你他们做了但没做好的——后者才是机会。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Apple App Store 评论 | 星级/标题/正文全文/日期/版本 | 公开 RSS JSON（每页 50、最多 10 页） | 否 | `scripts/demand/reviews-mine.mjs --source appstore` |
| Google Play 评论 | 星级/正文/日期/点赞数，**服务端可按星级筛** | 公开 batchexecute RPC | 否 | `scripts/demand/reviews-mine.mjs --source gplay` |
| Trustpilot | TrustScore、星级分布、1-2 星评论全文 | 页面 `__NEXT_DATA__` | 否，但**必须真实浏览器**（curl 被 WAF 403） | `scripts/demand/reviews-mine.mjs --source trustpilot` |
| G2 | 10 分制均分、结构化评论、公司规模/职位 | 页面 ld+json | 否，但**必须真实浏览器**（首屏挑战要等 30–60 秒） | `scripts/demand/reviews-mine.mjs --source g2` |
| Capterra | 均分、评论的 **Pros/Cons 分段** | ld+json + DOM 卡片 | 否，但**必须真实浏览器** | `scripts/demand/reviews-mine.mjs --source capterra` |
| Chrome Web Store | 扩展**用户数 + 精确评分 + 评分人数 + 分类**，以及最近 10 条评论原文/星级 | 公开 HTML 内联 JSON（`AF_initDataCallback`），**不用 token 不用浏览器** | 否 | `scripts/demand/chrome-ext-gap.mjs` |
| chrome-stats.com | 趋势榜、新增榜、**已下架榜**（`/chrome/obsolete`） | OpenCLI 真浏览器（CF 挡纯 HTTP），免费仅第 1 页 25 条 | 否，但要真浏览器 | `scripts/demand/chrome-stats.mjs` |
| **AppSumo** | 付费用户差评（极其具体）、Q&A 购前提问（"does it support..."）、热门 deal 的品类分析 | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |
| **AlternativeTo** | 替代理由（价格/复杂度/功能不足）、筛选器维度可组合成长尾词（"free X alternative for Linux"） | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |

### 扩展商店的「已验证市场 + 差执行」筛选

```bash
# 用户数 100 万以上、评分 4.1 以下，并拉出 3 星及以下的差评原文
node scripts/demand/chrome-ext-gap.mjs \
  --category productivity/workflow --min-users 1000000 --max-rating 4.1 \
  --reviews 6 --max-stars 3
```

这条命令直接落地经验层 4.4 节那个筛选形状：**用户量大 + 评分低 = Validated Market + Bad Execution**。
门槛数字（100 万 / 4.1）是**这里的判读指引，不是脚本默认值**——脚本默认不过滤
（`--min-users` 默认 0，2026-08-30 起），每次按赛道自己给门槛。跑完先看结尾的
「采集状态：N 路成功 / M 路失败」行和 manifest：失败那几路的原始 HTML 在证据目录里，
「结果少」可能只是「有几路没取到」。

### 差评里的高价值关键句（当过滤词用）

```
Doesn't work with…   Please add…      Too expensive     Slow
Stopped working      No longer works  Privacy           Need bulk…
Wish it could…       I love this extension, but…   ← 最值钱的一句
```

### 产品下线 = 强时效刚需

`chrome-stats.mjs --list obsolete` 给已下架扩展。**折扣要记住**：默认不按用户数排序，
前排全是几十用户的小扩展，且只有 25 条——**大产品下架不保证当天捞得到**，
要覆盖得自己维护一份关注 ID 名单定期探活。
失败留现场（2026-08-30，截图链路已实盘验证）：任何浏览器路径失败或 0 张卡片时，
脚本会先把**截图 + 页面全文**落进证据目录再关标签页（`--keep-open` 保住活现场）。
「0 张卡片」是留证陈述——CF 没过完、改版、还是真空榜，对着双证人判，别直接当空榜读。

### 已验证的坑

- **Chrome Web Store 深翻页做不到**：分类页 32 条 / 搜索页 10 条 / 评论页 10 条就到顶。
  扩样本靠多跑分类和搜索词，不是靠翻页。
- Trustpilot / G2 / Capterra 三家 **curl 一律 403 但都不需要登录**——
  这是「必须真实浏览器」和「必须登录态」两件事的分界线，别混为一谈。
- Capterra 的星级过滤**没有 URL 参数**，只能点按钮。
- 浏览器源提取失败时（2026-08-30，截图链路已实盘验证）：每个失败 URL 会留下
  **截图 + 页面全文**双证人加 manifest 状态——是挑战页、改版还是真没有 1-2 星评论，
  对着证据目录判，别把 extract_failed 读成「没有差评」。

---

## 五、谁在为这件事付外包费

**需求具体到能标价，是最不容易自欺的一类证据。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Freelancer.com | 项目标题/描述/**预算区间/币种/竞标数/平均报价**/技能标签 | **公开 REST API，无 token**（本类最好用） | 否 | `scripts/demand/freelance-demand.mjs --source freelancer` |
| Fiverr | 服务标题/起步价/评分/评价数（成交量代理） | DOM `[data-gig-id]` | 否，但**必须真实浏览器** | `--source fiverr` |
| Upwork | 职位标题/计价方式/预算/描述 | DOM `[data-test=JobTile]` | 否，但**必须真实浏览器** | `--source upwork` |
| 闲鱼 | 商品标题/价格/**「N 人想要」**（供需比） | DOM `a[href*=item?id=]` | **是，必须登录态** | `--source xianyu` |
| 淘宝 | —— | 未实测；反爬更重、强制登录 + 滑块 | 是 | 无，建议用闲鱼替代 |

**闲鱼有一个必须知道的失败形态**：未登录时搜索**恒返回「没有找到」并静默降级成「猜你喜欢」**——
页面看起来完全正常，但你拿到的是推荐流不是搜索结果。这正是「沙箱浏览器拿到看似正常
但内容不同的结果」那条规则的实例。

判据：**「想要」数多、商品数少 = 供不应求**；有人卖 + 有成交 = 有人真掏钱。
服务类需求（「XX 代做 5 元一张」）直接对应工具站机会。

---

## 六、正在冒出来的新产品

**中等强度信号：曝光 ≠ 留存。** 这一节拿到的域名必须过第十节验证才算数。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Product Hunt 每日榜 | 名次、票数、评论数、上线日期、**产品真实外链域名** | OpenCLI 真实 Chrome 读 Apollo 缓存；GraphQL v2 需 token；Atom feed 兜底 | 否，但**必须能过 CF 的真实浏览器** | `scripts/demand/boards.mjs producthunt` |
| Toolify `/new` + 榜单 | 工具名、官网、月访问量、分类、**支付平台** | OpenCLI 真实 Chrome 读 `window.__NUXT__` | 否，但要真实浏览器 | `scripts/demand/boards.mjs toolify` |
| Hacker News | Show HN 新产品、Ask HN 痛点原话、分数/评论数/评论全文 | 公开 JSON API（Algolia） | 否 | `scripts/demand/hn-signals.mjs` |
| GitHub Trending | **期内新增 star（升温速度）**、仓库/简介/语言；`--issues` 挖产品化机会 | 公开 HTML（`/trending`） | 否 | `scripts/demand/github-trending.mjs` |
| GitHub Search | 累计 star、创建/push 时间、topics、open issue 正文 | 公开 JSON API | 否（给 token 配额高 80 倍） | `scripts/demand/github-trending.mjs --source search` |
| GitHub SKILL.md 反查 | 别人沉淀的 skill 名 + description（= 反复出现的真实需求） | JSON API。**要「最近更新」用 `--mode recent`**：repo search `pushed:>` + Git Trees（一次请求拿全仓库文件清单，实测 34,019 节点 / 286 个 SKILL.md，**且不吃 code search 10 次/分的配额**） | code search 需 token | `scripts/demand/github-skill-search.mjs --mode recent\|repo\|code` |
| There's An AI For That `/new/` | 工具名、**未经跳转的真实官网**、saves / views / 评分 / 定价，一页 205 条 | OpenCLI 真实 Chrome（纯 HTTP 全路径 CF 403） | 否，但要真实浏览器 | `scripts/demand/boards.mjs taaft --board new` |
| **turbo0.com** | Fastest Growing（645 产品按 Similarweb 流量增速排，月更）、DR Climbers（888 域名按 Ahrefs DR 增速排，周更）、Hidden Gems（698 小产品异常增长）、New This Month（日更 400 新品） | 公开页面 | 否 | 暂无脚本——AI 读 Collections 页判断 |
| **Indie Hackers** | 创始人收入复盘帖（直接披露获客关键词和渠道）、产品目录按收入排序、「I'd pay for X」天然付费意图句式、失败案例中的用户反馈（项目失败 ≠ 需求不存在） | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |

### 关键字段：Product Hunt 的产品真实外链

最高分回答那条流水线（PH → 解析真实网站 → 查域名年龄/流量结构 → 筛非品牌词）
成立的前提就是这一个字段。**PH 的 `/r/p/<id>` 跳转纯 HTTP 也是 403，只能让浏览器跟跳转读 `location.href`**：

```bash
node scripts/demand/boards.mjs producthunt --date 2026-08-22 --resolve-urls --json
```

### 已验证的坑

| 坑 | 实测 |
|---|---|
| ~~现成的 `opencli producthunt` adapter 是坏的~~ **（2026-08-23 已修）** | 根因：`hot`/`browse` 装了网络拦截器等 XHR，但 **PH 是服务端渲染，导航后根本不会再发匹配的请求**，捕获必然超时——而超时发生在那段本来正确的 DOM 抓取之前；`today`/`posts` 的 Atom feed **按 `<updated>` 而非 `<published>` 排**，50 条横跨 17 个上线日。改为读页面自己 hydrate 的 Apollo store，四条命令均已出数 |
| **PH Atom feed 不能替代榜单** | `/feed` 返回 200 但**无名次无票数**，默认按分类混排、日期跨周 |
| ~~TAAFT 环境级不可达~~ **（2026-08-23 翻案，原判定是错的）** | 「TLS 握手被切断」的真因是**本机 DNS 把它解到了代理的 fake-IP 网段**，某条请求没走代理去连了个不存在的地址。DoH 查到的是正常记录。真实情况是**站点挡非浏览器客户端**（HTML 全 403 + `cf-mitigated: challenge`，只有 `robots.txt` 漏过），**真实 Chrome 一次就打开了**。诊断顺序见 `opencli` Skill 的 troubleshooting |
| **GitHub code search 限流 10 次/分** | 且 `sort=indexed` 已废弃并被**静默忽略**——带与不带前 5 条 repo+path 逐条相同，不报错也不 422。走不通的替代都试过了：GraphQL **没有 CODE 这个枚举值**、`/search/code` 没有开排序的参数或 header、Events API 的 PushEvent payload **只有 commit message 没有文件路径**。能用的是 `--mode recent` |
| **HN 不要用 Firebase API** | 它只回 id 数组，不能按关键词/时间过滤，捞最近 N 天要几百次请求。用 Algolia |
| **Toolify `/new` 没有提交日期字段** | 想按「最近新增」筛只能靠列表顺序 |
| **boards.mjs 的失败留现场（2026-08-30，截图链路已实盘验证）** | 浏览器源单页失败先落**截图+页面全文**再继续（不 die 全局，`--keep-open` 保住活现场）；HTTP 源失败响应体进证据目录；空结果先开 manifest——「0 条 + 源失败」不是「今天没有新品」 |

---

## 七、持续涌现新词的平台

**新游戏 = 新词 = 新需求，且没有老站霸占。** 新手拿第一次正反馈最快的一条线。

推广到 AI 领域同理：**新模型 = 新词**。每个新上榜的模型名都会触发一个可预测的关键词周期：
`[model] release date` → `[model] vs [competitor]` → `[model] pricing` → `[model] API tutorial`。
Hugging Face 的新 task tag 领先 Google 搜索 2–6 个月——这是游戏新词之外的第二条新词矿脉。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Steam 商店 | 新上架/即将发布的游戏名、appid、发售日、价格、genres | 公开 JSON（`store/search/results?infinite=1` + `appdetails`） | 否 | `scripts/demand/game-newtitles.mjs --source steam` |
| SteamDB | 即将发售游戏的 **Follows 关注人数 + 7 日增量**（= 发售前需求强度，Steam 官方没有）、价格、发售日 | OpenCLI 真浏览器（CF 挡纯 HTTP） | 否，但要真浏览器 | `--source steamdb` |
| itch.io | 独立游戏名、URL、作者、价格、简介（**无下载量无评分**） | 公开 `?format=json` | 否 | `--source itch` |
| Poki | web 小游戏名、URL、板块（**仅此三项，播放量不公开**） | 公开 HTML（按 `data-tile-*` 解析） | 否 | `--source poki` |
| IGDB | 跨平台新作名、首发日、total_rating、genres、platforms | 官方 API（Twitch OAuth） | 需 `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | `--source igdb` |
| **Hugging Face Trending** | 新 task tag → 新 AI 能力关键词（领先 Google 搜索 2–6 个月）；Trending Models / Trending Spaces / Trending Papers 三个信号源 | 公开页面 + API（`huggingface.co/api/trending`） | 否 | 暂无脚本——AI 读 trending 页 |
| **Arena.ai (lmarena.ai)** | 13 个 Leaderboard（Agent/Text/Vision/T2I/T2V 等）上新上榜的模型名 = 潜在高搜索量词（`[model] review/vs/tutorial`）；投票数激增 = 搜索需求正在爆发 | 公开页面 | 否 | 暂无脚本——AI 读 leaderboard 页 |

### 已验证的坑（两条会让人白跑一轮）

- **`api.steampowered.com/ISteamApps/GetAppList/v2/` 已经下线**：返回
  `Method 'GetAppList' not found in interface 'ISteamApps'`，v1/v0002/带不带尾斜杠四种写法全一样。
  替代的 `IStoreService/GetAppList/v1/` **需要 Steam Web API key**。
  免 key 还能用的是 `/api/featuredcategories`（new_releases + top_sellers + coming_soon 一次全拿）。
- **`appdetails` 的多 ID 查询已关闭**：`appids=440,570` 直接 400，body 是字面量 `null`。
  只有 `filters=price_overview` 还支持多 ID。
- **Poki 的 class 名是构建哈希**，没有 `__NEXT_DATA__`，只能靠 `data-tile-*` 属性定位——
  改版就会坏，坏了修脚本。
- **steamdb 分支的失败留现场（2026-08-30，截图链路已实盘验证）**：打不开 / eval 不回 /
  0 行表格都会先落**截图+页面全文**再关标签页（`--keep-open` 不关）；HTTP 源（steam/itch/
  poki 等）非 2xx 时响应体进证据目录。「没解析到表格」是留证陈述，不是「没有新游」。

> 这条线的通则：**换一个行业就换一批「持续上新」的平台**。
> 拿到一个好源之后，直接问 AI「推荐几个类似 X 的站」比自己想关键词去搜高效得多。

---

## 八、用户的原话

**用户自己写下来的需求，就是你的页面标题。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Reddit 许愿句式 | 标题（可直接当选题）、正文、子版、作者、时间 | RSS（零配置但限流狠）/ OAuth（CI 推荐）/ pullpush（兜底） | 否（CI 建议配 OAuth app） | `scripts/demand/reddit-wishes.mjs` |
| Hacker News 评论 | Ask HN 下的整棵评论树 | 公开 JSON API | 否 | `scripts/demand/hn-signals.mjs --comments` |
| **TAAFT 许愿区 `/requests/`** | **用户直接写下来的「我想要一个能做 X 的 AI」+ 票数 + 回答数**，实测 1,526 条 | OpenCLI 真实 Chrome | 否，但要真实浏览器 | `scripts/demand/boards.mjs taaft --board requests`（`--board requests-top` 按票数排） |
| Google SERP（许愿句式限站搜） | organic 前十 + relatedSearches + peopleAlsoAsk | serper.dev API | 需 `SERPER_API_KEY` | `scripts/demand/serp-query.mjs` |
| **StackOverflow** | 高票未接受答案 = 没有好的解决方案 = 可做成工具；报错信息就是关键词；tag 热度趋势 = 技术采用信号 | 公开页面 + API | 否 | 暂无脚本——AI 直接搜索判断 |
| **V2EX** | 中文技术社区的「求推荐」「有没有」「吐槽」类帖子——中文关键词竞争通常比英文低得多 | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |
| **TikTok / YouTube** | 播放量增长的视频中的需求信号（评论区「哪里可以用」「有没有网页版」）——**需求先在短视频平台爆发，再形成搜索需求**，抓住窗口期 | 公开页面 | 否 | 暂无脚本——人工探测 |
| **X / Twitter** | 高级搜索句式：`"looking for" OR "anyone know" "[category]"`、`"alternative to" "[competitor]"`、`#buildinpublic` 发现新兴品类。趋势常领先 Google 搜索量数天到数周 | 公开页面 | 否 | 暂无脚本——AI 直接搜索判断 |
| **行业博客评论** | 评论者措辞 = 他们在 Google 搜索时用的长尾查询词。监控目标：行业领袖博客、教程站（dev.to）、竞品产品博客 | Google Alerts + `site:` 操作符 / RSS | 否 | 暂无脚本——AI 判断 |

**本节信号密度最高的是 TAAFT 许愿区**：别的源要你从吐槽里推断需求，
它是用户自己写好的一句需求 + 一个票数。**票数就是现成的排序**，
不需要你再去猜哪条更值钱。

**本节还是面板 28 天盲区的唯一补位。** Semrush / Similarweb / seo.web.cafe 给的月量是过去 28–30 天的
滚动窗口，再滞后几天更新——昨天在 X 上炸开、前天 YouTube 出了十条教程的词，面板上要么是 0，
要么是上个月的老量，它读不到「正在起来」。所以词根调研里社区验证与面板取量是并列的两条腿
（[`playbooks/research.md`](playbooks/research.md) P2 阶段 5，必做）：Reddit 用 `reddit-wishes.mjs --time week`
与 `--time month` 两个窗口对照，X / YouTube / B 站走 `/agent-reach` 取近 14 天与近 30 天；
口径是**近 14 天有帖且 14 天日均明显高于 30 天日均（≥2 倍）才算新起话题**，此时面板 0 量不构成否决。

### 句式模板

```
"is there a tool that"      "I wish there was"      "does anyone know a"
"how do people make"        "alternative to"        "too expensive"
```

后两个是**迁移类**——这类用户需求已经明确，只是在换供应商，转化最快。

### 已验证的坑

**Reddit 的 `.json` 端点已彻底失效**：任何 UA 一律 403 并返回 189KB HTML。
现在能用的三条路依次是——RSS（**必须带浏览器 UA**，自定义 UA 一律 429，且限流极紧）、
OAuth（要自建 script app，CI 首选）、pullpush 第三方镜像（能出数但连着两次就 429）。
脚本已做三路自动降级。manifest 里逐 (句式, 子版) 组合记 `{status, rawCount, kept}`
（2026-08-30）：某个组合 fetch_failed 是被限流/被挡，不是「这个句式没帖子」；
本地句式二次过滤和跨查询去重各丢了多少条也会在 stderr 报出来。

> 中文内容平台（内容社区的搜索下拉与笔记数、短视频的播放量与评论）没有稳定的免登录入口，
> 属人工探测动作。判据在 [`experiences/demand-discovery.md`](experiences/demand-discovery.md) 第五节。

---

## 九、竞品正在往哪儿下注

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 竞品 sitemap 增量 | 全量 `<loc>` + lastmod，与上次快照 diff 出**新增/消失/更新**，并出 slug 词频 | 纯 HTTP（robots.txt → sitemap → 递归 index → gzip） | 否 | `scripts/demand/sitemap-diff.mjs` |
| 多语种游戏平台清单 | 项目关注市场的游戏平台新内页候选 | `.rankup/demand/game-platforms.json` 批量调用 sitemap 增量脚本 | 否 | `scripts/demand/game-platform-monitor.mjs` |
| Columbus AI 外链榜 | 目录站域名、被多少 AI 工具站引用、DR、dofollow、月访问量 | 纯 HTTP | 否 | `scripts/demand/boards.mjs columbus` |

**sitemap 增量是这一节的主力**：竞品新布的长尾词页面，是它花钱花时间调研出来的结论，
你只需要读。默认快照写在 `.rankup/demand/sitemap-snapshots/`（相对当前项目，不写死绝对路径）。

```bash
node scripts/demand/sitemap-diff.mjs --domain <域名> --slug-words
node scripts/demand/game-platform-monitor.mjs --language de,pl,ja,ar,ru
# monitor 逐平台把子进程 stdout/stderr 落进证据目录（2026-08-30）；
# 「候选 0｜失败 N」读法：失败的平台根本没被看过，不是「无新游」。
# → 「对比 <时间>：新增 24 / 消失 0（当前共 1724 条）」+ slug 词频
```

**Columbus 那张榜不是需求源，是外链落地清单**——它排的是「被多少 AI 工具站引用」，
用在 backlink 环节而不是选题环节。

---

## 九·二、一个站背后的整个站群

拆一个站，你拿到一个方向；**拆一个站群，你拿到的是「这套打法在哪些赛道上被验证过」**。
成规模的操盘手会把同一套已验证的关键词打法复制到十几个赛道上——
图片、视频、音乐、3D、试穿、学术、导航——每个站都是一次独立的市场验证。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 站群反查 | 同一主体运营的其它候选域名 + 事实字段（共同指纹 / 发现路径 / 回访状态） | 纯 HTTP 读首页 HTML | 否 | `scripts/demand/site-network.mjs --domain <域名> --confirm` |
| Reverse AdSense | 共用同一 AdSense Publisher ID 的所有域名 | OpenCLI 驱动 sitedata.dev | 是（SiteData 会员） | `scripts/sitedata.mjs --domain <域名> --report adsense` |

```bash
node scripts/demand/site-network.mjs --domain <种子域名> --confirm --max 10
```

**Reverse AdSense 是 `site-network.mjs` 的互补手段**：`site-network.mjs` 从首页 HTML 刮指纹，
对不挂 AdSense 的站无效；`sitedata.mjs --report adsense` 走 SiteData 的 Reverse AdSense 数据库，
只要目标域名的 `ads.txt` 声明过 Publisher ID 就能查到所有共用该 ID 的域名——这是 strong 级证据，
且 Ahrefs / Similarweb / Semrush 都没有这个能力。**两者一起跑**：先 `site-network.mjs` 拿指纹，
再 `sitedata.mjs --report adsense` 拿 AdSense 关联，合流去重。
【实测 2026-09-04，`toolify.ai`：pub-4273367302905582 DIRECT → songmeaning.io、toolify.ai、coloringbook.ai】

脚本只采集不裁定（2026-08-30 起不再输出 strength/confirmed，也不默认过滤弱行）：
每行给出发现路径、共同指纹、回访状态（`revisit=fetch_failed` 是「这次没看到」，
不是「不共享指纹」）。下面这张表是**AI 的判读指引**，不是脚本输出。

**三类指纹的证据等级不一样，别当成一回事**：

| 等级 | 指纹 | 为什么 |
|---|---|---|
| strong | GA4 / AdSense / Clarity / Umami 的账号 ID 相同 | 这些要登录后台才配得出来，撞上基本可断定同一主体 |
| medium | 同一个 `utm_source`，或共享 GTM 容器 ID | utm 说明是同一批推广位，但联盟客也可能带；GTM 容器代理商会给多个客户配同一个 |
| weak | 只有一条外链 | 一条外链谁都能发，**不构成证据** |

**已验证的坑（2026-08-24）**：

- **「无共同指纹」是站群的常态，不是失败。** 成规模的操盘手会给每个站单独建 GA4
  属性（好分开看数据），所以兄弟站之间**根本不共享埋点 ID**。实测某组 10 个兄弟站
  没有一个共享指纹，真正把它们绑在一起的是同一个 `utm_source`。
  判读时别只盯「共同指纹」一列——发现路径里的 utm 同样是证据。
- **没有指纹不等于不是站群。** 服务端埋点、或把 GA 装进 GTM 容器的站，
  首页 HTML 里什么都看不到。空结果的正确读法是「这条路没找到」，不是「它没有兄弟站」。
- CF 挡纯 HTTP 客户端的站取不到，需要时改走 opencli 的真实浏览器把 HTML 喂进去。

拿到站群清单之后**别停在清单**：逐个丢进第十节的验证链路，
真正有价值的是「哪几个赛道它做成了、哪几个它做了但没跑起来」——后者才是你的机会。

---

## 九·三、平台子域名监控（Certificate Transparency）

**原理**：Vercel、Cloudflare Pages、Netlify 这类平台的默认子域名（`*.vercel.app`、`*.pages.dev`、`*.netlify.app`）会在签发 TLS 证书时被写入公开的 Certificate Transparency（CT）日志。通过 crt.sh 或 Certstream 监控这些通配域名下的**新增子域名**，就能在一个站还没绑自定义域名、还没做 SEO 之前就发现它。

**为什么有效**：
- 绝大多数新站的第一步是部署到平台默认域名，再等跑通了才买域名绑定——**CT 日志比 Google 收录早几天到几周**。
- 子域名本身就是项目名/产品名，直接构成关键词候选（`photo-resizer.vercel.app` → 关键词 `photo resizer`）。
- 批量出现同一品类的子域名 = 那个品类正在爆发。

**操作**：

| 步骤 | 方法 |
|---|---|
| 单次查询 | `https://crt.sh/?q=%.vercel.app&output=json` — 返回最近签发的证书及子域名列表 |
| 实时流 | Certstream（`certstream.calidog.io`）WebSocket 接口，按 `*.vercel.app` 等通配过滤 |
| 品类聚合 | 把子域名分词后做频率统计，高频词根 = 热门品类（`ai-`、`chat-`、`resume-`） |

暂无脚本——AI 判断 crt.sh 返回的子域名列表，识别品类模式。

---

## 九·八、已经有人替你调研过了（哥飞社区）

前面八节都是**你去挖**。这一节是**别人挖完了，把结论和踩过的坑公开写了出来**——
`new.web.cafe` 上几百人在同一个问题下众筹提问、竞答、按票排名。
成本比自己从零跑一遍榜单低一个量级，而且带着「哪条真的有效」的投票信号。

脚本：[`../scripts/webcafe-forum.mjs`](../scripts/webcafe-forum.mjs)，
完整接口地图与坑见 [`webcafe-forum.md`](webcafe-forum.md)。

| 你要什么 | 命令 |
|---|---|
| 现在有哪些悬赏在问（18 场全站） | `webcafe-forum.mjs bounties --transport http` |
| 一场悬赏的全部答案正文 | `webcafe-forum.mjs bounty <uid> --transport browser --md` |
| **众人投票投出来的网站清单**（征集型） | `webcafe-forum.mjs bounty <uid> --transport browser`（读 `collect.board[]`） |
| **群里到底怎么说的**（原话，不是转述） | `webcafe-forum.mjs chat-search "挖掘需求"` |
| 站内搜经验帖/教程 | `webcafe-forum.mjs search "关键词"` |
| 哥飞的 91 条经验全文 | `webcafe-forum.mjs experiences --pages 10 --transport browser` |

### 已经沉淀进本库的几场

| 悬赏 | 主题 | 已收录到 |
|---|---|---|
| `fd0wrgx7fh` | 你有哪些私藏的挖掘需求的好方法（23 答 / 3760 元） | [`experiences/demand-discovery.md`](experiences/demand-discovery.md) |
| `fpswv8z126` | 从 0 到 1 哪三件事最重要（19 答） | [`experiences/zero-to-one.md`](experiences/zero-to-one.md) |
| `il1fmki1ih` | 访客→注册转化率 | [`experiences/conversion.md`](experiences/conversion.md) |
| `wlhmhdaoqg` | 去哪儿提交外链（**588 条榜单**） | [`../../backlink/references/authorized-data-sources.md`](../../backlink/references/authorized-data-sources.md) |
| `0jch5yv6g7` | 你都在哪些网站挖掘需求（**盲征中**，109 条待开榜） | 未开榜，`board` 还取不到 |
| `k3ivgzypq1` | 被验证过的找需求方法（**已研究**，37 个方法） | 本文件各节（13 个新方法已整合进 §四·§六·§七·§八·§九·三·§九·七），完整研究报告见 artifact `db25ad4e` |

**后两场值得盯**：它们正在征集，一旦状态变成 `open` 就能一次性拿到
一百多条「别人实际在用的需求挖掘站点」——那正是本文件第一节那张表的众包版本。
查状态：`webcafe-forum.mjs bounties --status open --transport http`。

### 三条必须知道的（否则你会拿到空结果且不报错）

1. **匿名不会 401。** 它返回 200 和完整条目，只把正文抹成空串、票数归零。
   判据是正文空不空，不是状态码。
2. **征集型的内容在 `collect.board[]`，不在 `answers[]`。** 只读 answers
   会对着 588 条榜单报「0 条答案」。
3. **`fold_count` > 0 不等于没价值。** `fd0wrgx7fh` 的 23 条里 17 条被折叠，
   而本库收录的最可执行的几条方法恰恰出自被折叠的答案。
   **按票排序读，但别按折叠丢弃。**

### 想要素材就搜群聊，别去问 AI

站内哥飞.ai（`/chat`）的知识库**就是**「哥飞的朋友们」14 个微信群的归档 + 站内教程。
`chat-search` 直接搜那份归档，拿到的是**原话**——不经模型转述、不消耗任何额度。
只有需要「让它替你跨来源综合归纳」时才值得走 `ask`（而且它默认 dry-run，要 `--send`）。

---

## 九·五、从词根出发

前面九节都是「先有站/先有信号，再有词」。这一节是反方向：**先有词根，扩成候选串，再去撞盘面。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 工具类词根库（51 条） | 词根 + 中文释义 + 常见搭配 + 8 个扩展模板 | 已固化成本地 JSON | 否 | `scripts/demand/word-roots.mjs` + `data/word-roots.json` |

```bash
node scripts/demand/word-roots.mjs list                       # 全部词根
node scripts/demand/word-roots.mjs seeds                      # 只要词根本身，喂给面板查询
node scripts/demand/word-roots.mjs expand converter \
  --seeds pdf,image --target word                             # 按 8 个模板扩展
```

扩展模板覆盖 `x-root` / `root-x` / `online` / `free` / `ai` / `a-to-b` / `best` / `bare` 八种形态。

### 两条必须一起记的约束

1. **扩展出来的是候选串，不是关键词。** 它们没有搜索量也没有难度——
   把「我扩出了 300 个词」当成「我找到了 300 个词」是这条路上最常见的自欺。
   脚本刻意在输出末尾打了这句提醒。**下一步必须过第十节。**
2. **词根库全是英文，这是整个社群共同的盲区。** 中国人搜「JSON 编辑器」不搜
   「JSON editor」。**词根 × 语言**的乘法会让量倍增——这正是只有 agent 跑得动的部分，
   也是目前最没被人挖的一片矿。

> 更大的扩展词根表（社群流传的百条版）实测**取不到**：非公开分享链接，
> 登录后表格是 canvas + WebSocket 渲染，试遍 export / meta / data 端点与全局对象都无解析路径。
> 需要时人工在表格里「下载为 CSV」，落进项目侧而不是 Skill。

---

## 九·六、自己扩的词表一定漏了一半：必须反查竞品的实际排名词库

【实测】按某一个维度把种子扩成几十个带量词，很容易自认为覆盖完整。
反查同赛道竞品的实际排名词报表（每站取前 100 词）之后，发现**整整三类构词一个都没有**：

| 漏掉的构词类型 | 例子形态 | 为什么会漏 |
|---|---|---|
| **泛型入口词** | 去掉限定语的那个大词，及其同义写法 | 自己先入为主判定「头词太难，不收进池子」，于是连量都没测 |
| **问句 / 信息词** | 「这个东西怎么算」「多少算够」「X 有多重」 | 扩词时想的是「用户会怎么称呼这个对象」，不是「用户会怎么问这件事」 |
| **口语与拼写变体** | 缩写、词序颠倒、**拼错的写法** | 没人会主动去想用户拼错了怎么办，但那些变体确实有量 |

补测之后，同一难度档的池子从几十词翻到一百多词，量接近翻倍。

操作规则：

1. **扩词不要只按自己想到的那一种构词模式展开。** 先按自己的思路扩一轮，
   然后**必须**用竞品词库反查补第二轮（`backlink/scripts/semrush-report.mjs` 取排名词报表）。
2. 反查对象选**同赛道、站龄 9–24 个月、已经有排名的站**，取 3–5 个，每站前 100 词，
   与自己的池子做差集。
3. 差集里的词**逐个补测量与难度**，不要凭印象取舍——被自己判过「太难」的头词尤其要测，
   它常常就是竞品流量的主要来源。
4. **池子变大不等于经济性变好。** 补漏进来的泛型大词常常是廉价流量（量很大、CPC 接近零）。
   **扩完词必须重算按量加权的 CPC**；加权 CPC 掉下来时，「盘子更大了」是个假的好消息。

### 品牌截流词（Brand Keyword Hijacking）

竞品的品牌词是一座被大多数人忽视的词矿：B2B SaaS 领域 **35–45% 的品牌 SERP 首页上有第三方内容**（`[brand] alternative`、`[brand] vs`、`[brand] review`、`[brand] pricing`）。

操作：
- 从第二节收集到的竞品列表中，取每个品牌名，构造 `[brand] alternative`、`[brand] vs [你的产品]`、`[brand] review`。
- 用 `seo-webcafe.mjs kd` 测量这些词的搜索量和难度——品牌修饰词通常 KD 很低，因为竞品自己不会做「自己的替代品」这种页面。
- 做法：建 `/compare/[brand]-vs-[你的产品]` 或 `/alternative/[brand]-alternative` 页面，内容是真实的功能对比。

**限制**：这是一个有争议的策略。只有在产品确实能替代竞品时才应该做，否则是误导用户。页面内容必须是真实的对比，不是纯粹的截流。

---

## 九·七、跨平台自动补全扩词

搜索引擎和平台的自动补全（autocomplete / suggest）是**用户真实搜索行为**的直接投射——它推荐的是有量的查询，且更新频率远快于任何第三方关键词数据库。

### 两个核心手法

**1. keywordtool.io — 16 个平台的自动补全聚合器**

一次输入种子词，同时从 Google、YouTube、Bing、Amazon、eBay、Play Store、Instagram、Twitter、Pinterest、TikTok 等 16 个平台拉取自动补全建议。免费版只看词不看量，但足以发现**你完全没想到的构词角度**——因为不同平台的用户用不同的方式描述同一个需求。

**2. Alphabet Soup（A–Z 前缀穷举）**

在 Google / YouTube / Amazon 的搜索框里输入 `[种子词] a`、`[种子词] b`、……`[种子词] z`，收集每一轮的下拉建议。这个技巧的价值在于**强制搜索引擎给出 26 个方向的建议**，而直接输入种子词只给 8–10 个最热的。

| 变体 | 前缀形式 | 适合发现什么 |
|---|---|---|
| 后缀法 | `种子词 a/b/c…` | 修饰语、使用场景、长尾 |
| 前缀法 | `a 种子词`、`b 种子词` | 品牌名、形容词、替代表述 |
| 填空法 | `种子词 _ 种子词2` | 中间连接词、介词搭配 |

### 操作建议

- 种子词取自第二节（需求信号源）的已验证关键词，不要凭空想。
- 对比多个平台的建议差集——Amazon 上出现而 Google 上不出现的词往往是高购买意图词。
- 批量操作可用 keywordtool.io，单次深挖用 alphabet soup 手动做（或 AI 通过搜索框自动化）。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Google / Bing / DuckDuckGo 搜索框下拉 | 三引擎各自的联想串（按 `--hl` 语种 `--gl` 国家分市场，utf-8） | 纯 HTTP 公开端点，零配额零钥匙；失败引擎为 `null` 并逐引擎落 manifest | 否 | `scripts/demand/suggest.mjs "<词根>" --engine google,bing,ddg --hl <hl> --gl <gl> --json`（alphabet soup：对 `"<词根> a"`…`z` 循环跑） |

keywordtool.io 那一档仍无脚本——AI 手动做或用 `/anysearch` 补 Amazon / YouTube 平台的差集。

---

## 十、候选验证链路

前九节产出的是**候选**，不是结论。候选必须走完这条链路才能开工。

```
候选域名 / 候选词
   ↓ ⓪ 亲眼看一遍搜索结果首页：Google / Bing / 目标市场本地引擎，各记七样
   见本文件第一·五节。这一步在任何取数之前，别拿二手 SERP 接口代替
   ↓ ① 这个站什么来历：注册日期 / 站龄 / 月访问 / DR / 环比 / 核心搜索词
   scripts/demand/aitdk-lookup.mjs <域名>           # 支持 --file 批量、jsonl 续跑；只采集不筛选，阈值判断按第二节的表由 AI 做
   ↓ ② 词有没有量、难不难做
   scripts/seo-webcafe.mjs kd --keyword <词>        # 零配置，含 top9 盘面
   ↓ ③ 盘面上都有谁、我能不能做得更好
   scripts/demand/serp-query.mjs <词>               # 域名命中 + 首页/内页构成
   ↓ ④ 这个站到底多大、流量从哪来
   backlink/scripts/similarweb-query.mjs            # 总访问量、渠道构成、相似站
   backlink/scripts/semrush-overview.mjs            # 自然流量、引荐域、关键词库
   scripts/sitedata.mjs --domain <域名>             # 第三方流量校验（免费、不扣配额）+ Reverse AdSense 站群关联
   # 这两家还有哪些面板能力、哪些是死路 → provider-capabilities.md（实测测绘，先查表再开浏览器）
   ↓ ⑤ 这个方向在涨还是在跌
   scripts/gt.py                                    # Google Trends
   ↓ ⑥ 排上去到底值多少钱（**不能跳过这一步**）
   把 ④ 拿到的同类站真实流量折成收入，与 ② 的词池上界对照
   scripts/seo-webcafe.mjs money --income <目标> …   # 纯本地计算，零配额
```

⓪–③ 衡量的是**能不能排上去**，④–⑥ 衡量的是**排上去值不值**。
只跑前半程会得出一个 SEO 上完全正确、商业上完全错误的结论——见第十·五节。

**每一步都有失败分支，失败 ≠ 该步的否定答案。** 脚本失败时会把 `{url,status,body}`
落进证据目录（默认 `.rankup/evidence/demand/<脚本>-<时间戳>/`）并在同目录 `manifest.json`
里逐源记 `{source,status,rawCount,error}`。逐步的失败读法：

| 步 | 失败长什么样 | 正确读法 |
|---|---|---|
| ① aitdk-lookup | 表格里带 `✗ HTTP 429/403` 的行；manifest 里该域 `http_*` | 配额耗尽/被挡，**不是「该站没数据」**。换 `--via browser` 档位或次日重试。脚本已不做阈值筛选——出错行永远显示在默认输出里 |
| ② kd | 非 200 或配额用尽 | 词的难度「未测得」，不是 KD=0 |
| ③ serp-query | serper 报错/超时 | 盘面「没看到」，不是「盘面是空的」 |
| ④ similarweb/semrush | 面板没渲染稳、登录态失效 | 流量「未取得」，不是流量小；查 backlink 侧证据目录 |
| ⑤ gt | 429/widget 空 | 趋势「未取得」，不是「没人搜」 |

判定规则：**看到 0 条或空表，先开 manifest**。`sources` 里有任何一条非 `ok`，
这次运行就不能当成「真没有需求/没有数据」的证据；全部 `ok` 且 rawCount 为 0，
才允许读成真空态。

社交帖子或收入榜案例要复核整条链路时，不要手工拼表，也不要重写采集逻辑：

候选发现先用 `boards.mjs trustmrr`；它负责从收入榜找候选。拿到对应 TrustMRR 详情链接后，
再交给 `revenue-site-audit.mjs` 读取公开 `.md`，核验 Stripe、MRR、订阅数、30 天收入与同步时间。
两者分工是“boards 发现 → audit 复核”，audit 不再造一套榜单发现器。

```bash
node scripts/demand/revenue-site-audit.mjs \
  --domain <域名> --source-url <原始说法链接> \
  --claimed-visits <声称月访> --claimed-organic-share <声称自然占比> \
  --keyword <主词> --db us --out audit.json
```

它顺序调用现有域名画像、Similarweb 两张报表、Semrush 国家库、sitemap 和 KD 脚本。
输出必须保留 `unavailable`，不能把失败写成 0；Semrush 的国家库自然流量只并列展示，
不和 Similarweb 全球总访问做倍数或渠道占比运算。用 `--from <目录>` 可离线重整已经
保存的 `aitdk.json` / `similarweb-*.json` / `semrush.json` / `sitemap.json` / `kd.json`。
报告必须留下页面 URL、as-of 日期、流量类型和原始字段名，渠道行合计不得悄悄冒充
Performance 总访问。

**它只产原始对照数据，verdict 由 AI 下**（2026-08-30 起脚本不再输出
证实/部分证实/反证与 alerts）。判据在这里，不在脚本里：

- `crossChecks.estimateRatio`（AITDK 与 Similarweb 近月估算的倍差）**> 2** →
  两个来源打架，claimed 值「无法证实」，不许引用较高的那个数；
- `crossChecks.similarwebPerformanceVsChannelsRatio` **> 1.35** → 同一家面板两张报表
  自相矛盾，两个原始字段都要保留，不许拿渠道行合计冒充 Performance 总访问；
- 自然占比：claimed 与面板差 ≤5 个百分点算吻合，≤20 算部分吻合，再大就是反证；
- MRR：`stripeVerifiedForThisDomain` 为 true 且 `claimedToVerifiedRatio` ≤1.1 算证实；
  false 时一律「无法证实」——Stripe 只证收入规模，不证「靠哪类页面/渠道赚的」。

**失败分支**：每个采集器的成败记在同目录 `manifest.json`（`unavailable` = 没取到，
不是该站没数据）；原始采集文件不再删除，全部保留在输出 `rawFilesDir` 指向的目录里
（默认 `.rankup/evidence/demand/revenue-site-audit-<时间戳>/`），复核时直接开原始文件。

### ②·五 盘面里有低 DR 站时，先查它的**域名年龄**，再查它的流量

看到「前十里有 DR 0 / DR 3 的首页」时，正确的下一步不是欢呼，也不是去查它流量然后
看到数字小就否掉。**先查注册日期。** 年龄决定那个流量数字能读出什么：

| 那个低 DR 站的年龄 | 它的低流量说明 | 它的高流量说明 |
|---|---|---|
| < 6 个月 | **什么都不说明**——还在蜜月排名期，没承接量很正常 | 赛道极友好（强信号） |
| 9–18 个月 | 该起没起，赛道可能有隐性门槛 | **赛道对新站友好（最强信号）** |
| > 3 年 | 天花板可能就这么高 | 说明不了新站可复制性 |

【实测 2026-08-24】同一个 SERP（一个游戏查询类英文词）里同时坐着两个低 DR 首页：

| 站 | 注册日期 | 年龄 | 引用域 | 真实流量 |
|---|---|---|---|---|
| A（精确匹配域名，DR 0，排 #6） | 2026-05-17 | **3.2 个月** | 108 | 总访问 9/月 |
| B（DR 3，排 #9） | 2025-10-31 | **9.8 个月** | 199 | **总访问 120,417/月，自然搜索占 76.39%** |

只看 A 会得出「低 KD 是海市蜃楼、这盘面进不去」；只看 B 会得出「十个月就能做到九万自然流量」。
**同一个盘面，两个相反的结论，区别只在年龄。** A 的首页 `<title>` 还是 WordPress 默认的
`My Blog`——它根本还没开始做。拿它当稳态天花板读，等于把「还没发生」当成「不会发生」。

操作规则：

1. **对每个低 DR 首页都查 RDAP 注册日期**（`https://rdap.verisign.com/com/v1/domain/<域名>` 的
   `events[].eventAction == "registration"`）。这一步几秒钟，却决定后面所有解读。
2. **优先分析年龄 9–24 个月的那个**，它是最接近「新站能做到什么」的样本。
3. **看它的品牌/非品牌构成与热门自然词**。上例中 B 的非品牌占 93%，热门词是
   「league of legends hours played」「time wasted on lol」这类**好奇心驱动的长尾**，
   而不是那个明面上的工具词。**真正的打法藏在竞品的实际取词里，不在你一开始盯的头部词上。**
4. SERP 工具返回的 `dr: null` **不是 `dr < 10`**。把 null 计入低 DR 会凭空造出机会——
   本次就因此把某词的「DR<10 首页数」记成 3，实际是 2。

### ②·六·四 Semrush 的自然流量什么时候不能信：先看它的词库分布，再决定信不信总数

面板打架时，**不要止步于「口径不同」，也不要各信一半。** 有一条可判定的规律：
**倍差的大小，和「单个大头词占该站 Semrush 流量的比例」正相关。**

【实测】同一批域名，Semrush 自然流量与 Similarweb（总访问 × 自然占比）并排：

| 站 | 第一大词占该站 Semrush 流量 | 该词位次 | 该词量级 | 两源倍差 |
|---|---|---|---|---|
| A | 13% | **#3** | 万级 | **0.94×（吻合）** |
| B | 58% | **#26** | 五十万级 | 1.67× |
| C | 分散，含十万级词在 #6 | — | — | **4.0×** |
| D | **72%** | **#7** | **三十万级** | **12.8×** |

机制：Semrush 自然流量是**模型**——追踪到的词 × 搜索量 × 位次 CTR 曲线。
一个站排在三十万量级泛型词的第 7 位，模型按通用曲线记下大几千次点击。
但那种泛型头词的真实首页上有搜索引擎自己的组件、AI 答案和一堆巨头，
**第 5–10 位的真实点击率远低于通用曲线**。面板看不到那些访问，因为它们不存在。
位次掉到 #26（B）反而不失真——模型给的 CTR 本来就近零。

操作规则：

1. **拿到域名维度的自然流量后，先拉它的排名词报表看分布，再决定信不信总数。**
2. 流量分散在长尾、第一大词占比 **< 20%** → 可信，可与面板互证；
3. 单个词占比 **> 50% 且位次在 #5–#10** → **按高估 4–13 倍处理，以面板数为准**；
4. 只有一套数时宁可标「未验证」，**不要把模型输出当观测值报出去**。

推论，也是最容易犯的那个错：**「这个站靠某个大词吃饭」这句话，在只有关键词模型一套数时不能说。**
那是「某个词贡献了模型值的 N%」，不是「贡献了真实访问的 N%」。

### ②·六·五 免密钥的两个独立流量佐证，以及一个不必再试的

面板打架时（Semrush 与 Similarweb 常差 2–4 倍），需要测量基础**完全不同**的第三方。
再加一个关键词模型估算器没有意义——它和 Semrush 是同一类偏差。下面三个基础各不相同，
且**全部免密钥**：

| 源 | 测量基础 | 怎么拿 | 实测结论 |
|---|---|---|---|
| **CrUX**（Chrome 真实用户） | 真实 Chrome 遥测 | `pagespeed.web.dev/analysis?url=<origin>` 的「真实用户体验」区块 | **最有用**。有无字段数据本身就是流量下限；页面还会标样本量档位（「许多样本」/「少量样本」） |
| **Tranco** | 多源 DNS 请求聚合 | `curl -s "https://tranco-list.eu/api/ranks/domain/<d>"` | 可用，但**必须拿已测过流量的同类站做标定**再插值，单看排名无意义 |
| **Cloudflare Radar** | DNS 解析器遥测 | `radar.cloudflare.com` 公开网页 | **这个量级别用**：实测 6 个域名 5 个「无排名」，含 2016 年老域名。分档是 Top-N 粗桶不是连续排名，分辨不出中小站 |

CrUX 的两个用法，一正一反都成立：

- **完全没有 CrUX 数据** → 该站真实 Chrome 流量低于收录门槛。实测一个「排在前十但没人来」
  的站正是零数据，与其他面板给的接近零互相印证。
- **在「许多样本」档** → 舒服地高于门槛，倾向支持高位估算。
  注意：**Google 没有公开这个档位的绝对阈值**，所以只能用于「更接近哪一端」的定性判断，
  不能反推出具体数字。把它当区间约束，不当测量值。

### ②·六·六 要密钥之前，先问这个数据有没有网页版

取数优先级里「HTTP API」排在「浏览器」前面，但那条排序的前提是**上一级可用**。
API 存在却需要一把我们没有的钥匙时，它对我们就是不可用的那一级——
而浏览器往往已经有访问权。

【实测教训】一次调研里连续把四个源判为「需要申请密钥」（SERP 查询、Chrome 真实用户数据、
DNS 遥测、代码搜索），实际全部有公开网页版，用户已登录的浏览器直接读得到。
**同一个数据源，脚本裸调 RPC 端点被 302 到机器人验证页，真实浏览器进去毫无阻碍。**

判据：**这个数据有没有一个人能用眼睛看到的网页？** 有 → 浏览器就是可用路径，不要去要钥匙。
真正需要密钥的只有两类：完全没有网页形态的服务，以及网页版做不了的大批量拉取。

**附带的产品级坑（一次踩过就该记住）**：广告透明度中心的搜索框**只按广告主名称或落地域名
做子串匹配，不支持按关键词/投放意图搜**。用它可以回答「这个域名在不在投广告」，
**不能**回答「谁在竞价这个词」。后者查不到时是工具能力缺失，不是「没有广告主」——
这两件事的结论方向完全相反。

### ②·七 别按「词数」规划页数——查竞品的 sitemap，看它用几页吃了多少词

规划一个工具站时容易掉进两个极端：要么盯着几个头部词做几页，要么以为要堆几百页做长尾。
**去看已经跑通的竞品实际用了几页**，这个数字通常出乎意料。

【实测 2026-08-24】某个 9.8 个月的工具站：**sitemap 里只有 16 个 URL**，
却排着 **911 个关键词**，拉六位数月访问。平均一页吃掉约 57 个词。

原因是那些词在关键词工具里是不同的行，在用户那里是同一个问题——
「我在这游戏上浪费了多少时间」有五六种说法，一个页面全接住。

这直接推翻了按「1 站 5 词」建模算出来的结论。用那个模型算，
月入目标要求每个词的日搜索量高到不现实；换成真实结构（少量页面 × 每页一整簇近义词），
需求量立刻回到可达范围。

操作上加一步，成本几乎为零：

```bash
node scripts/demand/sitemap-diff.mjs --domain <竞品域名>     # 页数与 slug 词频
node backlink/scripts/semrush-overview.mjs --domain <竞品域名>   # 关键词总数
```

两个数一除，就是这个赛道「一页该吃多少词」的经验值。**先量这个，再决定做几页。**
第一次跑还会落下快照，过一两周重跑就有真实的 added/removed 差分，
能看出对方在不在扩页——这是判断「它还在涨还是已经停了」最便宜的信号。

### ②·六 拆渠道时，两个面板的口径必须各用各的，不能交叉相减

要判断「某站的流量是不是来自搜索」，**必须用同一个面板内部的渠道构成**，
不能拿 A 面板的自然流量去比 B 面板的总访问——那是两套测量体系。

【实测教训】本次曾用「Semrush 自然流量」对比「Similarweb 总访问」，得出
「这批站的大流量都不来自搜索」。改用 Similarweb **自身的渠道构成**重算后，同一批站：

| 站 | Semrush 自然（先前用的） | Similarweb 自然搜索访问（正确口径） | 倍数 |
|---|---|---|---|
| 计算器站 | 16,900 | 61,705 | 3.7x |
| 竞技数据站 | 22,300 | 79,707 | 3.6x |
| 存档编辑器站 | 44,800 | 88,791 | 2.0x |

结论直接反转：这些站的搜索占比其实相当高。**跨面板相减会系统性地把搜索占比压低 2–4 倍**，
而这个方向的偏差正好会诱导出「SEO 没用」的错误结论。

两条硬规则：
- 判断渠道构成，用 Similarweb 的 channel mix（它内部自洽）。
- 判断绝对量级，两个面板各报各的，**并排列出、各自标注**，不做算术运算。

**上表那三个"Semrush 自然"读数还欠一层标注：是哪个国家库的。**
`semrush-overview.mjs` / `semrush-batch.mjs` 的域名自然流量永远是 `--db` 那一个国家的估算，
不传 `--db` 也不是全球合计。跟 Similarweb（默认全球）并排放之前，先看这个站的目标国
流量占比是多少——占比越低，两边差出来的倍数里地理错配贡献得越多，
容易和"渠道口径不同"的那部分混在一起，误判成同一个问题。两层要分开查：
先核实地理范围有没有对齐，再套上面两条硬规则核实渠道/绝对量。

### ⓪-前置：如果候选是「要注册的新域名」，先过三步闸门

上面那条链路的 ⓪ 问的是「这个**已经存在**的站什么来历」。
如果你手上是一批**打算注册**的域名，先过下面三步——**顺序不能换，一步都不能省**。

| 步 | 动作 | 它排除什么 | 别的方法看不看得见 |
|---|---|---|---|
| 1 | `whois -h <该 TLD 的注册局 whois 服务器> <域名>` | **注册局保留名单** | RDAP 完全看不见 |
| 2 | IANA bootstrap 给出的 per-TLD RDAP 端点，404=未注册 | 已被注册 | whois 也能看，但 RDAP 更规整 |
| 3 | 注册商结算页看该域名自己的价格行 | **溢价档**（注册价=续费价，可到常规价的数十倍） | 前两步都看不见 |

三条各自独立，任何一条单独通过都不等于"能买"。

**实测教训（2026-08-24）**：某个 TLD 的 28 个通用英文词候选，RDAP 全部 404，
按"未注册"报成可注册；whois 直连该注册局后发现 **23 个返回
`Second level domain name is reserved.`**。错误报告读起来完全自洽——
RDAP 是权威源、确实返回 404、逻辑无误——只有真去下单时才暴露。

另一类：某商业注册局把旗下短通用词整片划进溢价档，RDAP 同样 404，
结算页上却是常规价的 25–100 倍年费，且注册价与续费价相同。

两个必须记住的操作细节：

- **`whois` 不带 `-h` 会回退到 IANA 的 TLD 记录**，那份记录里永远有一行
  `domain: <TLD>`，于是每个域名看起来都被注册了。必须显式指定注册局服务器。
- **注册商结算页多为瀑布流布局**，域名与价格在纯文本里相邻，但相邻的那个价格
  也可能属于**下一个**域名。必须按 DOM 结构取（找 textContent 精确等于该域名的
  叶子节点，再上溯若干层取 innerText），不能按文本切片。

最省事的交叉验证：直接看主流注册商的搜索结果页——保留域名会显示
`TAKEN / Make offer`，可注册的显示 `$X/yr · Add to cart`，一屏同时覆盖三条。

### 域名有没有黑历史：用 Wayback CDX 自证，不要只信 AI 总结

带 LLM 总结的"域名前世"类工具**取数失败时不报错，而是把「没取到」叙述成
「不存在历史」**——这个失败形态最危险，因为结论读起来完全正常。

```bash
curl -s "http://web.archive.org/cdx/search/cdx?url=<域名>&matchType=domain&output=json&filter=statuscode:200&collapse=timestamp:6"
curl -s "http://web.archive.org/web/<timestamp>id_/<url>"   # 取当年内容判断用途
```

实测：某工具对一个域名断言"Internet Archive 中无任何历史快照记录"，
CDX 直查是 **41 条 200 快照，跨 2002–2010**，且能取回当年正文判断它当初是正经站
还是停放页/灰产。

### ⓪ 这一步的供应商选择

流传的做法是用某个域名数据面板的插件查这四个字段。**实测那个站已经没有域名查询功能了**
（只剩 AI 文案生成器，猜的端点全 404），它背后的官方 API 需要付费令牌。
所以脚本给了两个 provider：

| provider | 拿什么 | 代价 |
|---|---|---|
| `--provider webcafe`（默认） | 注册日期 / 站龄 / 月访问 / DR / 环比 / 核心搜索词 / 月度曲线 | 免费，但吃站点共享每日配额（游客 10 / 登录 100 / VIP 500）。**流量结构字段常为 null** |
| `--provider tabapi` | 月访问 / 流量来源 / 地区 / 核心词 / WHOIS / RDAP / 反链 | 需付费令牌 `TABAPI_KEY`，按 credit 计费 |

**流量结构（搜索占比 / 直接访问占比）拿不到时，退到 Similarweb 的渠道构成补这两格**——
它们正是下面那张阈值表里最关键的两行。

**两个口径必须标明**：Similarweb 给**总访问量**（默认全球），Semrush 给**某一个国家库的
自然搜索流量估算**（`--db`，省略也不是全球）。同一个站差三倍以上是常态，
但先看这个差有多少是地理范围不同造成的——目标国占比越低，裸比出来的倍数越吓人，
也越没意义。写结论时不标口径、不标国家等于没写。

### 常用的筛选阈值：判据在裁定集，不在这里

「新站能不能拿到非品牌词流量」那套四行阈值（域名注册时间 / 月访问量 /
搜索流量占比 / 直接访问占比）、命中率实测、以及「精品工具页 + 关键词域名」
换哪一套阈值，**全部以
[`experiences/demand-discovery.md`](experiences/demand-discovery.md) 的
「原帖给的阈值（可按自己标准调整）」一节为准**，本文件不再留副本。

本节只负责它的**取数前提**：上面那两个 provider 里，
`搜索流量占比` / `直接访问占比` 这两格常常是 null，
拿不到就退到 Similarweb 的渠道构成补——**阈值表里最关键的正是这两行，
补不上就不要按那张表下结论**。

---

## 十·五、「能排上去」和「能赚钱」是两个独立命题 → 判据见裁定集

**这一条的完整案例与判据在
[`experiences/demand-discovery.md`](experiences/demand-discovery.md) 的
「第六条：能排上去 ≠ 能赚钱，这两件事要分开验」一节**（含实测数字、
「进入门槛低是坏消息」与「搜索量不是流量，流量不是收入」两条判据）。
本文件不再复述那组数字——同一组实测抄两份，改了一处另一处就静默过期。

在取数配方这一侧只留一条**操作规则**：

> **量 / KD / SERP 窗口三道闸全过之后，还有第四道——用本节上面那套面板取数
> 查同类站的真实流量并折成钱，再谈立项。** 漏掉第四道，调研会在每一项技术指标上
> 都正确，而结论整个是错的。

折算时注意搜索量与真实点击的落差，泛型头词上可以差一个数量级，
见本文件「②·六·四 Semrush 的自然流量什么时候不能信」一节。

## 十一、令牌与登录态

需要凭据的源，键名统一放 `<rankup-skill-dir>/.env`（`KEY=value` 每行一个，已被 gitignore
排除并由 `scripts/validate-rankup.mjs` 断言不被 git 追踪）。读取顺序一律**环境变量优先，
再退到 `.env`**。

| 键名 | 谁用 | 没有会怎样 |
|---|---|---|
| `GITHUB_TOKEN` / `GH_TOKEN` | `github-trending`（search/issues）、`github-skill-search` | trending 照跑；search 降到 10 次/分；**code search 直接不可用**，脚本提示改 `--mode repo` |
| `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET` | `reddit-wishes` | 自动降级 RSS，能跑但慢且没有 score |
| `SERPER_API_KEY` | `serp-query` | 报错并指路；保底改用 `seo-webcafe.mjs serp` |
| `PRODUCTHUNT_TOKEN` | `boards.mjs producthunt` | 自动降级到浏览器路径（浏览器路径本来就更全） |
| `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | `game-newtitles --source igdb` | 清晰报错；其余 game 源不受影响 |
| `TABAPI_KEY` | `aitdk-lookup --provider tabapi` | 默认 provider 是免费的 webcafe，不配也能跑 |

**需要登录态**（不是需要令牌）的只有两处：闲鱼、以及 `payment-referrers.mjs similarweb`
所依赖的数据面板。其余「必须真实浏览器」的源
（Trustpilot / G2 / Capterra / Fiverr / Upwork / PH / Toolify / SteamDB / chrome-stats）
都**不需要登录**，只是要绕过反爬质询。

### 浏览器纪律

凡是走 OpenCLI 的脚本，都必须遵守 `opencli` Skill 的会话法律：
一个会话一个标签页、**会话名描述性但必须带并发后缀**、
默认 `--window background`、用完 `close`、**sub agent 绝不跑 `cleanup`**。
本目录的脚本已在 `finally` 里自动 close。

**会话名不许是字面常量**（2026-08-24 修）：`boards.mjs` 曾把三个会话名写死成
`demand-b-taaft` 这样的常量，两个 agent 同跑就共用同一个标签页，各自读回对方的页面——
**导航报成功、数据是别人的、全程不报错**。现在统一走 `sessionName(base)`，
后缀取 `OPENCLI_SESSION_SUFFIX` → `CLAUDE_CODE_SESSION_ID` → `CLAUDE_CODE_HOST_SESSION_ID`
→ `ppid`。注意 `HOST_SESSION_ID` 是整个桌面端共用的，只能垫底；
**Bash tool 里绝不用 `$$`**（每次调用都是新进程，PID 都不同）。

**不要用 `opencli doctor` 的文案判断桥能不能用**（2026-08-24 实测坑）：
`reddit-wishes.mjs` 原来匹配 `"Everything looks good"` 来决定走不走 OpenCLI，
而 doctor 只要有任何 Issue 就不再打印那句话——哪怕三行全 `[OK]`、桥完全可用。
结果是**静默降级回 RSS**：输出少了「赞 / 评论数」两列，不报任何错。
判据应当用 `[OK] Connectivity` 这类结构化行，不是吉祥话。

**`opencli doctor` 的退出码同样不能当判据**：它汇报的是「诊断本身跑完了」，
不是「被诊断的东西是健康的」——扩展断连时退出码依然是 0，状态只写在 stdout 里。
两个脚本曾把连通性检查写成「`doctor` 抛异常或退出非 0 才算坏」，这个条件因此**永远不成立**，
后面那个没设超时的调用就在扩展断连的情况下挂到天荒地老，零输出、零报错。
判据必须是探这行具体的 stdout（`[OK] Connectivity`），不是退出码，也不是任何一句汇总文案——
**一个永远不触发的检查和一个永远通过的检查，行为上没有区别，而且要等到卡死才会被发现。**

---

## 十二、维护契约

- **每个源的取数路径都会坏。** 站点改版、反爬升级、API 下线都是正常损耗。
  坏了**修脚本**，不要绕过去手工点一遍——手工的结果不可比，且下次还得再摸一遍。
- 修完更新脚本头部注释的**已验证日期**，并把失败原因写进去，下次少走一遍。
- **「空」不等于「坏」**：平台会在反爬启发式下主动降级结果，也会用 200 + 空 body 代替 404。
  换个查询词、在普通标签页里肉眼看一下，能复现再进修复流程。
- 新增源时，先按第一节判断它属于哪一类信号，再决定放进哪一节——
  **按「回答什么问题」分类，不按站点类型分类**。
