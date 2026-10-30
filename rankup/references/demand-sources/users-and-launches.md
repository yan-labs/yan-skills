# 需求数据源 · 差评、外包、新产品、新词平台与用户原话

> 本文件从 [`demand-sources.md`](../demand-sources.md) 拆出（2026-09-30），含原文 第四至八节。来源分流、令牌与维护契约仍在主文件；候选验证顺序与裁决只见 [`entry.md`](../playbooks/entry.md)。

## 四、谁做了但没做好（差评矿）

**差评用于发现未满足的用户任务和候选问法；评论者是否付费、问题是否仍存在要分别核实。**
功能列表告诉你产品做了什么，差评提供可能的体验缺口。

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

【经验】这条命令沿用经验层 4.4 节的采集示例：用户量大、评分低的产品可补差评候选。
数字（100 万 / 4.1）只是**示例过滤条件，不是立项门槛或脚本默认值**——脚本默认不过滤
（`--min-users` 默认 0，2026-08-30 起）。跑完先看结尾的
「采集状态：N 路成功 / M 路失败」行和 manifest：失败那几路的原始 HTML 在证据目录里，
「结果少」可能只是「有几路没取到」。

### 差评里的高价值关键句（当过滤词用）

```
Doesn't work with…   Please add…      Too expensive     Slow
Stopped working      No longer works  Privacy           Need bulk…
Wish it could…       I love this extension, but…   ← 最值钱的一句
```

### 产品下线 = 强时效刚需

旧标题保留作兼容入口；下线提供替代需求线索，不直接证明刚需。

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

**外包报价与岗位描述用于发现具体任务、措辞和预算背景。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Freelancer.com | 项目标题/描述/**预算区间/币种/竞标数/平均报价**/技能标签 | **公开 REST API，无 token**（本类最好用） | 否 | `scripts/demand/freelance-demand.mjs --source freelancer` |
| Fiverr | 服务标题/起步价/评分/评价数（成交量代理） | DOM `[data-gig-id]` | 否，但**必须真实浏览器** | `--source fiverr` |
| Upwork | 职位标题/计价方式/预算/描述 | DOM `[data-test=JobTile]` | 否，但**必须真实浏览器** | `--source upwork` |
| 闲鱼 | 商品标题/价格/**「N 人想要」**（供需比） | DOM `a[href*=item?id=]` | **是，必须登录态** | `--source xianyu` |
| 淘宝 | —— | 未实测；反爬更重、强制登录 + 滑块 | 是 | 无，建议用闲鱼替代 |
| **招聘平台**（综合招聘站 / 远程岗位板 / 初创招聘板） | 岗位标题、JD 里反复出现的固定能力要求、同一类重复岗位同时有多少家公司在招 | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |

**闲鱼有一个必须知道的失败形态**：未登录时搜索**恒返回「没有找到」并静默降级成「猜你喜欢」**——
页面看起来完全正常，但你拿到的是推荐流不是搜索结果。这正是「沙箱浏览器拿到看似正常
但内容不同的结果」那条规则的实例。

「想要」数、商品数和成交记录分别记作供需线索，不据此确认供不应求。
服务类描述（「XX 代做 5 元一张」）可提炼成工具任务候选。

**本节两类源要分开读**（【经验】）：服务交易平台给的是「**一次任务值多少钱**」，
招聘平台给的是「**企业愿意长期为这一类工作发工资**」。两者都不等于「他会买软件」——
软件化与付费方式的规划观察见
[`stage-2-positioning.md`](../lifecycle/stage-2-positioning.md)，本文件不另设选词门槛。

---

## 六、正在冒出来的新产品

**曝光 ≠ 留存。** 本节发现产品候选；域名背景核对见[第十节](validation-chain.md#十候选验证链路)。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Product Hunt 每日榜 | 名次、票数、评论数、上线日期、**产品真实外链域名** | OpenCLI 真实 Chrome 读 Apollo 缓存；GraphQL v2 需 token；Atom feed 兜底 | 否，但**必须能过 CF 的真实浏览器** | `scripts/demand/boards.mjs producthunt` |
| Toolify `/new` + 榜单 | 工具名、官网、月访问量、分类、**支付平台** | OpenCLI 真实 Chrome 读 `window.__NUXT__` | 否，但要真实浏览器 | `scripts/demand/boards.mjs toolify` |
| Hacker News | Show HN 新产品、Ask HN 痛点原话、分数/评论数/评论全文 | 公开 JSON API（Algolia） | 否 | `scripts/demand/hn-signals.mjs` |
| GitHub Trending | **期内新增 star（升温速度）**、仓库/简介/语言；`--issues` 挖产品化机会 | 公开 HTML（`/trending`） | 否 | `scripts/demand/github-trending.mjs` |
| GitHub Search | 累计 star、创建/push 时间、topics、open issue 正文 | 公开 JSON API | 否（给 token 配额高 80 倍） | `scripts/demand/github-trending.mjs --source search` |
| GitHub SKILL.md 反查 | 别人沉淀的 skill 名 + description（= 反复出现的真实需求） | JSON API。**要「最近更新」用 `--mode recent`**：repo search `pushed:>` + Git Trees（一次请求拿全仓库文件清单，实测 34,019 节点 / 286 个 SKILL.md，**且不吃 code search 10 次/分的配额**） | code search 需 token | `scripts/demand/github-skill-search.mjs --mode recent\|repo\|code` |
| There's An AI For That `/just-released/` | 工具名、**未经跳转的真实官网**、saves / views / 评分 / 定价、估算发布时间与根域；按天数滚动去重 | OpenCLI 真实 Chrome（纯 HTTP 全路径 CF 403） | 否，但要真实浏览器 | `scripts/demand/boards.mjs taaft --board new --days 7` |
| **turbo0.com** | Fastest Growing（645 产品按 Similarweb 流量增速排，月更）、DR Climbers（888 域名按 Ahrefs DR 增速排，周更）、Hidden Gems（698 小产品异常增长）、New This Month（日更 400 新品） | 公开页面 | 否 | 暂无脚本——AI 读 Collections 页判断 |
| **Indie Hackers** | 创始人收入复盘帖（直接披露获客关键词和渠道）、产品目录按收入排序、「I'd pay for X」天然付费意图句式、失败案例中的用户反馈（项目失败 ≠ 需求不存在） | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |
| **产品目录站 / 竞品地图**（SaaSHub、BetaList、Uneed 及各行业工具目录） | 这个领域现在有哪些产品、各自服务谁、怎么收费、用户在找哪些替代品——用来画一张竞品地图，不是用来判断谁做得好 | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |

### 新品快照与多站同词候选

```bash
node scripts/demand/new-launches.mjs --days 7 --sources taaft,toolify --snapshot-dir <snapshot-dir> --md --json
node scripts/demand/new-launches.mjs --days 7 --sources taaft,toolify --snapshot-dir <snapshot-dir> --compare --md --json
```

TAAFT `new` 取 `/just-released/`（Newest AI Tools），滚动至最老发布时间越过 `--days`、无新 ID 或 40 次上限；
未知发布时间保留 null。`releasedAt` 以抓取时刻估算，月按 30 天、年按 365 天；覆盖不足看 notes 与 evidence manifest，不能当成完整一周。
Toolify `new` 仅当前列表，未提供可靠发布时间或定价时保留 null，不把抓取日冒充发布日期。
可在 `--sources` 加 `producthunt`；缺 `PRODUCTHUNT_TOKEN` 时跳过并注明。

当日快照为 `<snapshot-dir>/YYYY-MM-DD.json`，包含来源原始行 `rawRows`、根域合并行 `rows`、来源统计和两张候选榜；
`--md` 同时写日期 `.md`。`--json --md` 同用时 stdout 保持纯 JSON。每天文件保留最后一次采集。
`--compare` 在写入前读取最近 28 天快照，同日第二次运行也能读取上一轮；首次运行明确没有基线。
本周按抓取时刻向前滚动 7 天；新增域名、首次出现都指**首次观察**，首次出现日期仅限保存的 28 天。
“本周 1→多”表示此前观察到 1 个域名，本周累计达到至少 2 个；同日基线不等于跨周覆盖。

按名称、TAAFT task、tagline 依次抽取英文 generator / maker / changer / creator / remover / editor / converter /
swap / upscaler / enhancer / animator 等词尾，去虚词、明确分隔的品牌前缀与标点，简单单复数归一。
跨来源同根域只计一次；多站榜至少 2 个根域，新出现单站榜排除历史已见词。
这是词法候选，可能把描述性句子误当主词，也会漏掉隐含功能与无分隔的品牌；保留站点、定价与发布时间供复核。
根域沿用现有常见后缀/多租户规则，未使用完整 Public Suffix List。
候选词下一步交给 [`gpts 基线判读`](../trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)，再按 [`entry.md`](../playbooks/entry.md) 入口环节推进；
本脚本不判断搜索需求、KD、CPC 或是否值得做。

### 目录收录不是流量证明，更不是销量证明

【经验】目录站回答的是「这个领域有哪些产品」，不回答「这些产品有没有人在用」。被收录**最多说明
它出现过**；而提交目录本身就是一个常见的外链动作（见 `backlink` Skill），所以一条目录记录同样
可能只意味着有人花钱买下了这个位置。拿它画竞品地图、找替代关系、抄它的分类维度都成立；
把「被 N 个目录收录」读成流量或销量证据不成立——那要走[第十节](validation-chain.md#十候选验证链路)的验证链路。
这与本节开头「曝光 ≠ 留存」是同一条纪律的两种说法。

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

**新游戏与新模型名用于发现候选词；是否有需求和可做切口不能由上新直接推出。**

推广到 AI 领域同理：**新模型 = 新词**。每个新上榜的模型名都会触发一个可预测的关键词周期：
`[model] release date` → `[model] vs [competitor]` → `[model] pricing` → `[model] API tutorial`。
Hugging Face 的新 task tag 领先 Google 搜索 2–6 个月——这是游戏新词之外的第二条新词矿脉。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Steam 商店 | 新上架/即将发布的游戏名、appid、发售日、价格、genres | 公开 JSON（`store/search/results?infinite=1` + `appdetails`） | 否 | `scripts/demand/game-newtitles.mjs --source steam` |
| SteamDB | 即将发售游戏的 **Follows 关注人数 + 7 日增量**（发售前关注线索，Steam 官方没有）、价格、发售日 | OpenCLI 真浏览器（CF 挡纯 HTTP） | 否，但要真浏览器 | `--source steamdb` |
| itch.io | 独立游戏名、URL、作者、价格、简介（**无下载量无评分**） | 公开 `?format=json` | 否 | `--source itch` |
| Poki | web 小游戏名、URL、板块（**仅此三项，播放量不公开**） | 公开 HTML（按 `data-tile-*` 解析） | 否 | `--source poki` |
| IGDB | 跨平台新作名、首发日、total_rating、genres、platforms | 官方 API（Twitch OAuth） | 需 `IGDB_CLIENT_ID` / `IGDB_CLIENT_SECRET` | `--source igdb` |
| **Hugging Face Trending** | 新 task tag → 新 AI 能力关键词（领先 Google 搜索 2–6 个月）；Trending Models / Trending Spaces / Trending Papers 三个信号源 | 公开页面 + API（`huggingface.co/api/trending`） | 否 | 暂无脚本——AI 读 trending 页 |
| **Arena.ai (lmarena.ai)** | 13 个 Leaderboard（Agent/Text/Vision/T2I/T2V 等）上新上榜的模型名及投票变化 → 候选词（`[model] review/vs/tutorial`） | 公开页面 | 否 | 暂无脚本——AI 读 leaderboard 页 |

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

**用户原话用于补问法池；页面承接见 [`stage-2-positioning.md`](../lifecycle/stage-2-positioning.md)。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Reddit 许愿句式 | 标题（可直接当选题）、正文、子版、作者、时间 | RSS（零配置但限流狠）/ OAuth（CI 推荐）/ pullpush（兜底） | 否（CI 建议配 OAuth app） | `scripts/demand/reddit-wishes.mjs` |
| Hacker News 评论 | Ask HN 下的整棵评论树 | 公开 JSON API | 否 | `scripts/demand/hn-signals.mjs --comments` |
| **TAAFT 许愿区 `/requests/`** | **用户直接写下来的「我想要一个能做 X 的 AI」+ 票数 + 回答数**，实测 1,526 条 | OpenCLI 真实 Chrome | 否，但要真实浏览器 | `scripts/demand/boards.mjs taaft --board requests`（`--board requests-top` 按票数排） |
| Google SERP（许愿句式限站搜） | organic 前十 + relatedSearches + peopleAlsoAsk | 浏览器默认，serper.dev API 可选兜底 | 默认不需 key | [SERP 取数路线](../seo-serp.md#serp-取数路线) |
| **StackOverflow** | 高票未接受答案的问题、报错信息与 tag 热度变化 → 待核实任务与候选词 | 公开页面 + API | 否 | 暂无脚本——AI 直接搜索判断 |
| **问答站**（Quora 及各垂直问答社区） | 一个具体到能被回答的问题：用户卡在哪一步、已经试过哪些办法；**问题标题本身常常就是长尾词的原句** | 公开页面 | 否 | 暂无脚本——AI 直接搜索判断 |
| **半封闭社群**（Discord 服务器、社交平台的兴趣/行业群组、职业社交平台的动态） | 搜索引擎索引不到的日常吐槽与临时解法——同一个痛点在这里出现，通常早于它出现在公开论坛 | 公开或需入群的页面 | 视社群而定 | 暂无脚本——人工探测 |
| **V2EX** | 中文技术社区的「求推荐」「有没有」「吐槽」类帖子——中文关键词竞争通常比英文低得多 | 公开页面 | 否 | 暂无脚本——AI 直接读页面判断 |
| **TikTok / YouTube** | 播放量增长的视频中的需求信号（评论区「哪里可以用」「有没有网页版」）——**需求先在短视频平台爆发，再形成搜索需求**，抓住窗口期 | 公开页面 | 否 | 暂无脚本——人工探测 |
| **X / Twitter** | 高级搜索句式：`"looking for" OR "anyone know" "[category]"`、`"alternative to" "[competitor]"`、`#buildinpublic` 发现新兴品类。趋势常领先 Google 搜索量数天到数周 | 公开页面 | 否 | 暂无脚本——AI 直接搜索判断 |
| **行业博客评论** | 评论者措辞 = 他们在 Google 搜索时用的长尾查询词。监控目标：行业领袖博客、教程站（dev.to）、竞品产品博客 | Google Alerts + `site:` 操作符 / RSS | 否 | 暂无脚本——AI 判断 |

**本节信号密度最高的是 TAAFT 许愿区**：别的源要你从吐槽里推断需求，
它是用户自己写好的一句需求 + 一个票数；票数只供安排采集顺序，不说明哪条更值钱。

社区原话可补面板更新滞后的候选；新词、低量与缺测口径只见 [`trends.md`](../trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)。
Reddit 可用 `reddit-wishes.mjs --time week` 与 `--time month` 对照，X / YouTube / B 站走 `/agent-reach` 取近 14 天与近 30 天；保留窗口与原文，不另设增速裁决线。补漏编排只见 [P2](../playbooks/research/p2-keyword-root.md)。

### 句式模板

```
"is there a tool that"      "I wish there was"      "does anyone know a"
"how do people make"        "alternative to"        "too expensive"
```

后两个是**迁移类**，可用于采集替代关系和用户约束。

### 已验证的坑

**Reddit 的 `.json` 端点已彻底失效**：任何 UA 一律 403 并返回 189KB HTML。
现在能用的三条路依次是——RSS（**必须带浏览器 UA**，自定义 UA 一律 429，且限流极紧）、
OAuth（要自建 script app，CI 首选）、pullpush 第三方镜像（能出数但连着两次就 429）。
脚本已做三路自动降级。manifest 里逐 (句式, 子版) 组合记 `{status, rawCount, kept}`
（2026-08-30）：某个组合 fetch_failed 是被限流/被挡，不是「这个句式没帖子」；
本地句式二次过滤和跨查询去重各丢了多少条也会在 stderr 报出来。

> 中文内容平台（内容社区的搜索下拉与笔记数、短视频的播放量与评论）没有稳定的免登录入口，
> 属人工探测动作。来源经验在 [`experiences/demand-discovery-sources.md`](../experiences/demand-discovery-sources.md)，不作现行裁决。

---

