# seo.web.cafe（哥飞的 SEO 工具箱）接口地图

哥飞做的中文 SEO 工具集合，域名 `seo.web.cafe`，每个工具是一个独立子路径（`/<tool>/`），
多数工具页面下面挂了一个同名的小后端，路径规律是 **`/<tool>/api/<action>`**，
不是 `/api/v1/...`（那是 `/kd/` 一个工具专属的公开 API 前缀，其余工具都没有）。

本文档 2026-08-07 用真实浏览器会话（未登录、访客身份）逐个工具点了一遍网络面板得到，
每个工具在探索阶段只发了一次请求，没有跑循环、没有登录、没有绕过配额；随后额外用
`curl` 单独重放了一次某个端点，专门用来搞清楚请求头到底是不是硬性必需的（见「认证与配额」）。

## 这是什么，每个工具答什么问题

| 工具 | 一句话 |
|---|---|
| `/translate/` 需求翻译器 | 一句英文需求，翻译成谷歌前十结果里真实出现的关键词 |
| `/mine/` 需求挖掘机 | 一个词或一个网址，滚雪球挖出关键词簇与同类网站 |
| `/serp/` SERP 排名解密 | 逐位点评谷歌第一页每个结果凭什么排在那 |
| `/domain/` 网站起名 AI | 描述产品，AI 起名并核验域名是否能注册 |
| `/history/` 域名前世档案 | 这个域名历史上被谁用过、改过几次版 |
| `/worth/` 网站价值估算器 | 按流量和变现方式估算网站值多少钱 |
| `/backlink/` 外链价值计算器 | 对方开的外链报价值不值这个钱 |
| `/audit/` On Page SEO 体检 | 40+ 项页面体检，给分和逐项建议（已确认，见下方说明） |
| `/review/` 页面军师 | 针对一个具体页面的多维点评与优化建议 |
| `/string/` 文本长度计算器 | 字符/字节统计与 TDK 长度检查 |
| `/adsense/` AdSense 过审预检 | 规则引擎 + 内容抽样，预判能不能过 AdSense 审核 |
| `/money/` 收入目标拆解 | 把月收入目标拆解成每天要做到的量 |
| `/influencer/` YouTube 红人报价 | 红人开的价该不该接 |
| `/referring/` Stripe 引荐流量榜 | 谁在给 Stripe 收银台送付费流量，月度榜单 |
| `/traffic/` 流量数据分析器 | 上传流量 CSV，自动识别曲线上的关键节点 |
| `/email/` 邮箱提取器 | 从文本里批量提取邮箱地址 |
| `/kgr/` 关键词价值评估 | KGR / EKGR / KDROI 三个指标算值不值得做 |
| `/level/` SEO 赚钱进阶之路 | 静态说明页，SEO 赚钱的十个等级 |
| `/gsc/` GSC 模拟器 | 90 天模拟数据，教你看懂 GSC 排名/曝光/点击怎么算出来的 |

## 接口表

`认证` 列里「令牌 + 访客配额」指该接口既要带上该工具专属的 `X-<TOOL>-Token` 请求头
（见下方「认证与配额」一节，这是**每个工具都要**的硬门槛，和登录无关），又计入访客每日
10 次的共享额度；「仅令牌」指只要带对令牌就放行，不计入那个配额池。

| 工具路径 | 端点 | 方法 | 请求字段 | 关键响应字段 | 认证 | 纯前端 |
|---|---|---|---|---|---|---|
| `/kd/` | `/kd/api/v1/kd` | GET | `keyword, gl, hl, force, format` | 难度分、SERP 盘面（已有独立公开 API + MCP 文档，本次未重测） | `Authorization: Bearer wc_mcp_...`（和下面 `X-<TOOL>-Token` 体系无关，是唯一对外文档化的认证方式） | 否 |
| `/audit/` | `/audit/api/analyze` | POST | `{url, keyword}` | `score, grade, categories[].checks[], page{}, ngramTop{}, serpInsight{}` | `X-AUDIT-Token` + 访客配额 | 否 |
| `/audit/` | `/audit/api/mine` | GET | 无 | 当前会话下已跑过的体检列表（未展开） | `X-AUDIT-Token` | 否 |
| `/translate/` | `/translate/api/search` | POST | `{query}` | `organic[], related[], paa[], fromCache` | `X-TR-Token` + 访客配额 | 否 |
| `/translate/` | `/translate/api/page`（对每条搜索结果各发一次） | POST | `{url}` | `title, wordCount, ngramTop, signals{title,description,h1,h2h3}` | 同上 | 否 |
| `/translate/` | `/translate/api/domain`（部分结果域名） | POST | `{domain}` | 域名侧信号（未展开，见下方"未查清"） | 同上 | 否 |
| `/translate/` | `/translate/api/aggregate` | POST | `{pages:[...]}` | 跨页聚合后的密度榜、最终结论 | 同上 | 否 |
| 各工具通用 | `/<tool>/api/me` | GET | 无 | `{login, oauthEnabled, quota:{used,limit,tier,unlimited,tiers:{anon,user,vip}}}` | 无需令牌，本身就是查配额状态 | — |
| `/mine/` | `/mine/api/seed` | POST | `{input}` | `{type: "keyword"\|"url", value}`（先判断输入类型） | `X-MN-Token`，不计配额 | 否 |
| `/mine/` | `/mine/api/report?seed=` | GET | `seed` | 是否已有落库报告可复用（`{found:false}` 未命中） | `X-MN-Token`，不计配额 | 否 |
| `/mine/` | `/mine/api/search` | POST | `{query}` | 同 translate 的 search | `X-MN-Token` + 访客配额 | 否 |
| `/mine/` | `/mine/api/page`（逐条结果） | POST | `{url}` | 同 translate 的 page | `X-MN-Token` + 访客配额 | 否 |
| `/mine/` | `/mine/api/domain`（逐个候选域名，实测 6 个左右就把当日额度打光） | POST | `{domain}` | `{domain, dr, visits, registeredAt, ageYears, trend{changePct,dir,last,prev}, topKeywords[]}` | `X-MN-Token` + 访客配额，消耗最快的一步 | 否 |
| `/serp/` | `/serp/api/serp` | POST | `{keyword, gl}` | 逐位归因点评（配额耗尽后仅拿到错误体，字段未展开） | `X-SR-Token` + 访客配额 | 否 |
| `/domain/` | `/domain/api/intent` | POST | `{text, hasCandidates}` | `{intent, brief}`（判断你是要起名还是别的意图） | `X-DF-Token`，不计配额 | 否 |
| `/domain/` | `/domain/api/name` | POST | `{brief, models:["deepseek-v4-flash"], sessionId}` | 候选名 + 域名注册核验（配额耗尽未展开） | `X-DF-Token` + 访客配额 | 否 |
| `/history/` | `/history/api/timeline` | POST | `{domain, force}` | 快照时间线（配额耗尽未展开） | `X-HIS-Token` + 访客配额 | 否 |
| `/worth/` | `/worth/api/estimate` | POST | `{input, model}` | 估值明细（配额耗尽未展开） | `X-WT-Token` + 访客配额 | 否 |
| `/backlink/` | `/backlink/api/evaluate` | POST | `{input, price, linkType}` | 外链价值评估（配额耗尽未展开） | `X-*-Token`（具体前缀本次未记下，规律同其他工具）+ 访客配额 | 否 |
| `/review/` | `/review/api/analyze` | POST | `{url}` | 页面点评（配额耗尽未展开） | `X-*-Token` + 访客配额 | 否 |
| `/adsense/` | `/adsense/api/audit` | POST | `{domain}`（表单只有一个域名框，具体字段名以此推断） | 过审预检结果（配额耗尽未展开） | `X-*-Token` + 访客配额 | 否 |
| `/adsense/` | `/adsense/api/me` | GET | 无 | 同 `/api/me` 模式 | 无需令牌 | — |
| `/referring/` | `/referring/api/summary` | GET | 无 | 榜单总览（页面一加载就发，参数在 query string，未展开） | `X-REF-Token`，**不计配额**（实测已确认，见下方认证一节） | 否 |
| `/referring/` | `/referring/api/month?m=YYYYMM` | GET | `m` | 该月榜单数据 | `X-REF-Token`，不计配额 | 否 |
| `/referring/` | `/referring/api/site?domain=` | GET | `domain` | `{domain, months:[...], stats{monthsOn,monthsTotal,firstMonth,lastMonth,bestPos,avgPos,totalSentK,latestPos,latestVisits,onLatest}}` | `X-REF-Token`，不计配额 | 否 |

### 2026-08-24 补全：`translate` / `mine` / `domain` 三个工具其实有后端

上表长期缺了这三个，不是它们没后端，是早期探索时**配额先耗尽了**。
2026-08-24 复查（靠零配额静态发现，见下）补齐：

| 工具 | 端点 | 请求体 | 计配额 |
|---|---|---|---|
| `/translate/` | `api/search` | **`{query}`** | 计 1 |
| | `api/page` · `api/aggregate` · `api/me` | `{url}` / `{pages,related,sites,query}` / — | **不计** |
| | `api/domain` | `{domain}` | 每站 1，无数据自动退 |
| `/mine/` | `api/search` | **`{keyword}`** | 计 1（同词命中缓存不重复扣） |
| | `api/seed` · `api/page` · `api/report` | `{input}` / `{url}` / `?seed=` 或 `?id=` | **不计** |
| | `api/domain` · `api/kd` | `{domain}` / `{keyword}` | 每站 1 / 已搜过的词免费 |
| `/domain/` | `api/intent` · `api/sessions` | `{text,hasCandidates}` / — | 不计 |
| | `api/name` · `api/review` | `{brief,models:[id],sessionId}` / `{brief,candidates}` | **按模型**：flash=1，pro=2 |
| | `api/check` · `api/insight` · `api/audit` · `api/collision` | `{names:[],tlds:[]}` 等 | 计 |

令牌头分别是 `X-TR-Token` / `X-MN-Token` / `X-DF-Token`，取法与其它工具一致。

> **⚠️ 这个站最容易踩的坑：`translate/api/search` 的字段是 `query`，
> `mine/api/search` 的字段是 `keyword`。** 两个工具几乎同构，字段名却不统一，
> 抄错只会得到一句「参数错误」。而且 mine 的 `organic[]` 比 translate 多出
> `domain` / `isHomepage` / **`skip`**（`skip:true` 是大站黑名单，实测 reddit.com、
> play.google.com 被标记）——**两个端点不能共用解析器。**

> **`domain` 的五个 SSE 端点事件名各不相同**：`name` 是 raw/names/model-error/done，
> `check` 是 result，`insight` 是 dr/traffic/reg，`review` 是 item/summary，
> `audit` 是 step/audit。**不要假设站内 SSE 都长一样**——连 `adsense`（step+done）
> 和 `history`（delta 拼正文）、`chat`（session/delta/done）都是三套。
> 脚本对这五个端点统一透传 `{event,data}[]`，不强行归一。

> `domain/api/name` 模型侧失败会返回 `done{refunded:true}` **自动退配额**，
> 别把 `model-error` 当成脚本 bug。BYOK 能免掉 name/review 的模型配额，
> 但**域名核验（check）照常计**。
>
> **`refunded: true` 是一句声明，不是到账凭证。** 实测紧跟在 `model-error` +
> `refunded: true` 后面立刻查配额，`used` 没有回退。别按「已退款」直接规划下一步
> 调用，退款声明之后要重新读一次真实配额，两者不同步时以配额读数为准。

### 确认没有后端的工具（有证据，不是漏做）

`traffic` `kgr` `money` `influencer` `level` `string` `email` `gsc` —— 2026-08-24 复验，
**8 个全部仍是纯前端**（页面 footer 明写「纯本地运算，数据不上传」；`level` 连
一个 `<input>`/`<form>` 都没有）。

`gsc` 值得单独说：它的 90 天模拟数据是浏览器里 `Math.random()` **现算的**，
全文 `fetch(` 只命中两处——`/gsc/api/me`（**VIP 门禁**，不是登录即可）和
`/gsc/api/tutorial`（16 步教程文案懒加载，返回的是可执行 JS 片段不是数据）。
**没有数据接口可调。**

其中 4 个的公式已从页面内联 JS 抓出并**复刻成本地命令**（零网络零配额、可批量）：
`kgr`（KGR/EKGR/KDROI）、`string`（TDK 长度）、`money`（收入目标拆解）、`email`（邮箱提取）。
另外 4 个不复刻，理由：`traffic` 算法强绑可视化曲线且单份 CSV 一次性用；
`influencer` 是单次议价场景不是批量工作流；`level` 是静态说明页没有算法；
`gsc` 复刻出来和站点免费展示的没有本质区别。跑 `tools` 命令可以看到这份清单和理由。

## 怎么用：一个脚本，零配置

```bash
# 零配额普查：每个工具的请求头名 + 全部端点，什么都不消耗
node <rankup-skill-dir>/scripts/seo-webcafe.mjs endpoints

# 单次查询
node scripts/seo-webcafe.mjs kd       --keyword "markdown to pdf" --gl us
node scripts/seo-webcafe.mjs audit    --url https://example.com/ --keyword "your keyword"
node scripts/seo-webcafe.mjs serp     --keyword "your keyword"
node scripts/seo-webcafe.mjs backlink --input example.com
node scripts/seo-webcafe.mjs worth    --input example.com
node scripts/seo-webcafe.mjs history  --input example.com     # SSE，脚本已拼回整段文本

# 批量：每行一组 key=value，自动按保险丝间隔
node scripts/seo-webcafe.mjs kd --batch words.txt --out kd.json

# 需求挖掘两条主线（translate 偏「一个词的 SERP 怎么拆」，mine 偏「顺着一个种子滚雪球」）
node scripts/seo-webcafe.mjs translateSearch --query "markdown to pdf"   # 计 1
node scripts/seo-webcafe.mjs translatePage   --url https://example.com   # 不计配额
node scripts/seo-webcafe.mjs mineSeed        --input "ai image upscaler" # 不计配额
node scripts/seo-webcafe.mjs mineSearch      --keyword "ai image upscaler"

# 起名 + 域名核验（多数是 SSE，脚本统一透传 {event,data}[]）
node scripts/seo-webcafe.mjs domainIntent --text "一个 AI 图片压缩工具站"
node scripts/seo-webcafe.mjs domainCheck  --names '["pikaz","zipwise"]' --tlds '["com","ai"]'

# 本地命令：零网络、零配额、可 --batch 批量
node scripts/seo-webcafe.mjs kgr    --volume 1000 --intitle 5 --kd 20
node scripts/seo-webcafe.mjs string --text "..." --title "..." --desc "..."
node scripts/seo-webcafe.mjs money  --income 3000 --sites 2 --kd 40
node scripts/seo-webcafe.mjs email  --file page.html --mode domain
node scripts/seo-webcafe.mjs kgr    --batch words.txt        # 本地命令同样支持批量

# 本地命令清单 + 确认无后端且不复刻的工具（附理由）
node scripts/seo-webcafe.mjs tools
```

**`kgr` 和 `kd` 串起来用最省事**：`kd` 给难度分，`kgr` 拿这个分算 KGR/EKGR/KDROI 和
所需外链投入——后者纯本地、零配额，可以对着一整批词跑。

### 本地命令数值判读指引（脚本只出数，评级在这里）

2026-08-30 起，`kgr` / `money` **只输出数值，不再输出评级字符串**（「黄金词」「极佳」
「放弃」这类判决从脚本里删除了）。理由：那些是阈值判读不是计算结果，写死在脚本里
会被当成客观输出引用，而阈值对不同市场/语言未必成立。原评级阈值（抄自 seo.web.cafe
`/kgr/` 与 `/money/` 页面内联 JS）保留在此，**作为参照而非判决**——判读时结合市场
上下文取舍：

| 指标 | 页面原阈值 | 页面原话 |
|---|---|---|
| KGR（intitle/月搜） | < 0.25 | 「黄金词（低竞争）」 |
| | 0.25 – 1.0 | 「中等竞争」 |
| | > 1.0 | 「高竞争」 |
| EKGR（KGR × (1+KD/100)） | < 0.25 且 KD < 30 | 「优先级最高」 |
| | ≤ 1.0 且 KD ≤ 50 | 「中等，需评估资源」 |
| | 其余 | 「高竞争或高难度，新站慎入」 |
| KDROI 的 roiPct | invest = 0（KD=0） | 「理论上不需要外链投入」 |
| | > 500% | 「极佳」 |
| | > 300% | 「不错」 |
| | > 100% | 「偏低」 |
| | ≤ 100% | 「回报覆盖不了成本，放弃」 |

`money` 原先自带的 `risks[]` 也一并移到这里（按输出字段对照）：

- `keywordDailyVolume` > 10000 → 每词日搜索量要求过高，考虑加词或加站分摊；
- `roi` < 1 → 年收入覆盖不了外链投入；
- `totalLinkCost` > 6 × 月收入目标 → 前期现金流压力大；
- `params.kd` ≥ 30 且 `keywordDailyVolume` < 1000 → 难度产出不匹配。

引用这些阈值下结论时，注明「阈值来自 seo.web.cafe 页面模型」，别让它伪装成实测。

#### `string` 的判读：三套 TDK 长度口径，别混着引

`string` 的 `titleTdk` / `descTdk` 输出 `{ text, len, range, status }`，`status`
只有四个机械值：`empty`（空）/ `short`（短于下界）/ `ok`（在区间内）/ `over`（超上界）。
**`status` 是「在不在这个脚本的区间里」，不是「这条 TDK 好不好」。**

关键在 `len` 的口径与区间的来源，两者都不通用：

| 口径 | title | desc | 计长方式 | 出处 |
|---|---|---|---|---|
| `seo-webcafe.mjs string` | 30–60 | 70–160 | **ASCII 记 1、其余记 2**（近似像素占宽） | seo.web.cafe `/string/` 页面模型 |
| `seo-audit.mjs`（判读表见 [`seo-box.md`](seo-box.md)「原分级表」） | 10–60 | 50–160 | 字符数（码点） | 本仓脚本自带的宽松典型范围 |
| Ahrefs 站点审计的警告线（见 [`seo-growth.md`](seo-growth.md) 五「经验库」2026-07-17 那条） | —— | 110–160 | 字符数（码点） | Ahrefs 外部工具 |

三者不是互相矛盾，是**三把不同的尺**：`string` 量的是近似展示宽度（所以 CJK 每字算 2，
中文标题 30 个字会报 `over`，那不是错误）；`seo-audit.mjs` 量的是码点数且区间放得最宽，
只用来筛「明显异常」；Ahrefs 的 110–160 最严，是把「太短浪费展示位」也算成警告。

判读规矩：

- **说「超长/过短」时必须点名是哪把尺量的**，只写「desc 长度不达标」等于没说。
- 中日韩文案用 `string` 的 `len` 判展示是否会被截断；用码点数对 Ahrefs 报告
  对账。两个数不一样是正常的，不要去「统一」它们。
- `status: ok` 不等于这条 desc 写得好——它只说明落在区间里。内容是否覆盖主词、
  有没有点击理由，`string` 一概不看。
- 量的是**解码后的文本**，不是构建产物里的 HTML 实体（`&#34;` 是 5 个码点、
  实际 1 个字符），先 decode 再喂给 `--desc`。

**`kgr` 的 `--intitle` 算不出来时不要拿关键词面板的数字凑**。这个参数要的是
`allintitle:` 的 SERP 结果计数，关键词量能面板不返回这个字段；实测拿一个通用网页搜索
工具去代替也不行——它会**静默忽略 `allintitle:` 操作符**，照常返回普通排序结果，
不报错也不提示语法被丢弃。结论：没有能返回 `allintitle` 计数的 SERP API 时，
KGR/EKGR 就是算不出来，不要用 KD 分数或普通搜索结果凑一个数字出来充当 KGR
结论。`allintitle` 加不加引号的口径差异见 [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md)
「六、KGR 用 `intitle` 加引号」一节。

**`money` 拆解收入目标时，先看它默认套的是什么模型，再引用它的数字。** 实测跑出来：
每站 **5 个关键词**、目标排名第 3（CTR 10.2%）、RPM $5、每 UV 2 PV、KD 30 —— 这些是
写死的假设，不是可调参数会提示的默认值。带着这套假设算 $500/月，需要单个关键词
日搜索量约 3,268；算 $2,000/月，需要约 13,072/词/天，工具自己都会标「不现实」。
**让它看起来不可能的不是收入目标，是「只压 5 个头部词」这个假设。** 引用这个工具
的输出时必须带上假设一并说明，并且拿真实站点结构核对量级——参见
[`demand-sources.md`](demand-sources.md) 「②·七」一节的实测：一个 16 个 URL 的
工具站排着 911 个关键词，平均一页吃 57 个词，和「5 词/站」的模型完全是两个世界。

**AdSense 过审预检（`adsense`）的实测基线**：对一个典型的「单功能免费小工具站」
（正是最常被担心「太单薄过不了审」的那种形状）跑了一次，结果是 **73 项检查、
0 个阻断项**，14 项通过、2 项不通过、53 项工具判不了要么等站长自己确认要么要
AI 主观判断。2 项不通过是抽样页面字数不足 250 与 ads.txt 尚未发布。**据此，
「内容单薄的工具站过不了 AdSense」这个担心本身没有证据支持**——真正的门槛是
几篇有实字数的页面加上把 ads.txt 发出去。但要记住这份「干净」只是部分通过：
73 项里约 53 项本来就不归工具判，一次 0 阻断的跑分说明「没有硬伤」，不等于
「已经全部核验完毕」。

**不需要任何配置就能跑。** 令牌由脚本自己从工具页 HTML 取；不带 Cookie 时配额停在
匿名档的额度以脚本第一行打印为准（不要照抄任何文档里的数字），一般够做一次小范围核验。要提额再 `export SEO_WEBCAFE_COOKIE='...'`
（登录 100/日、VIP 500/日）；`kd` 命令另需 `SEO_WEBCAFE_TOKEN`。

配额打完时脚本会如实打出 `HTTP 429 今日游客额度已用完`，不会静默失败或返回空结果。

> 早期版本拆成了 `seo-webcafe-kd.mjs` / `-audit.mjs` / `-referring.mjs` 三个脚本，
> 已被本脚本取代并删除。拆分是错的：这些工具的调用形状完全一致（抓页面取令牌 → POST
> 到 `/<工具>/api/<动作>`），差异只在端点名和请求体字段，拆开等于把同一段取令牌逻辑
> 抄三遍，而新增一个工具要新建一个文件。现在只需要往脚本里的 `TOOLS` 表加一行。

## SEO Agent（`/chat/`）：整个工具箱的对话入口

站内十余个工具的总入口。你给它一个网址加几个问题，它自行决定调用哪些工具、
查完真实数据再给结论。实测一次审站请求：**4 轮推理、14 次工具调用、5036 字回答**。

它和逐个调工具的区别在于**横向对比**：它会把你的页面和 top10 占位者的源码一起抓下来比，
这是单个工具做不到的。

```bash
node scripts/seo-webcafe.mjs chat --ask "审阅 https://example.com ……"
```

### 三条必须知道的差异

**1. 它强制登录，其余工具不用。** 匿名调用直接
`401 {"code":"login"}`，不像别的工具先放行再扣访客配额。所以这条命令必须
`SEO_WEBCAFE_COOKIE`，**没有替代路径**。脚本做了前置检查，缺凭据时直接报这一条，
而不是等 401 才发现。

**2. 返回的是 SSE 流，不是 JSON。** `content-type: text/event-stream`。
**直接 `JSON.parse` 会失败并静默得到 `null`——脚本看起来"成功"但内容是空的。**
这是最坏的一种失败，因为不报错；对一个用来审站的工具，你会把空结果读成"没问题"。

实测事件结构（2026-08-09，登录 VIP 会话）：

| 事件 | data 字段 | 说明 |
|---|---|---|
| `session` | `sessionId, created, title` | 开头一次 |
| `delta` | `text` | 逐块正文，**按序拼接** |
| `done` | `toolCalls, rounds, charged, sessionId` | 结尾一次 |

脚本的 `parseChatSse` 在两种情况下**主动报错而不是返回空串**：一个 SSE 事件都没有
（多半是站点改了格式，或请求根本没走到 Agent）；解析到事件但一个 `delta` 都没有。

**3. `done` 里的三个元数据必须打印出来。** `toolCalls` 是它调了哪些站内工具、
`rounds` 是推理轮数、`charged` 是扣了多少积分。**不知道它查了什么就拿到结论，
等于把一个黑箱当权威。** 上面那次审站调了 14 个工具跑了 4 轮，看得见这个才知道
该给结论多少权重。

### 怎么用它的结论

**逐条评估，不要照单全收，也不要一概不理。** 实测一次审站给出 4 条「你判断错了」：
1 条完全成立并暴露了真实的前提缺失，1 条实质有效但论据用错了口径（它拿一个数字
反驳这个数字自己的口径），1 条不成立，1 条被输出截断需要追问。

**不采纳的要写下理由**，否则下次会重开同一场争论。

### SEO Agent 可以查关键词搜索量，数据等同 Google Ads Keyword Planner

【实测 2026-09-04】直接在对话里让 SEO Agent 查某个关键词的月搜索量，它会调用内部的搜索量核实工具（`搜索量核实` / `搜索量核实（全球）`），返回分国家和全球的月均搜索量、近 3 月趋势、广告竞争度、顶部 CPC。

实测 `ai image generator`：

| 口径 | 美国月均 | 全球月均 |
|---|---|---|
| SEO Agent | 823,000 | 2,240,000 |
| Google Ads Keyword Planner（同期） | 823,000 | 2,240,000 |

两个数字完全一致，说明 SEO Agent 背后拉的是 Google Ads 的搜索量数据库，不是 `kd` 端点那个已被证伪的估算模型。

**和 `kd` 的月搜量是两套东西。** `kd` 的 `keywordVolume` 在日文词上被证伪过（差 19–58 倍），但 SEO Agent 的搜索量核实工具走的是 Google Ads 原始数据，精度等级不同。需要可信的月搜量时，优先用 SEO Agent 对话查，不要只看 `kd` 的摘要行。

用法：

```
# 直接在 chat 里问
node scripts/seo-webcafe.mjs chat --ask "查一下 <关键词> 美国的月搜索量，以及全球搜索量"
```

返回内容包含：月均搜索量、近 3 月趋势（涨/跌/平稳 + 百分比）、广告竞争度（0–100）、顶部 CPC 范围。比 `kd` 的单个 `keywordVolume` 数字丰富得多，且和 Semrush 不同的是**不消耗 Semrush 配额**。

**限制**：强制登录（需 `SEO_WEBCAFE_COOKIE`），每次查询消耗 Agent 积分；批量查词不如 Semrush 脚本高效，适合单词验证或少量词的精确量级确认。

### 读 `kd` 的输出：月搜量必须配捕获率一起看

`kd` 返回的 `keywordTrend` 里有一个 `ratio` —— **首位结果实际拿到的流量 ÷ 名义月搜量**。
这个数比 `keywordVolume` 重要得多，而它容易被跳过，因为摘要行只印月搜量。

判据（实测标定）：

| ratio | 含义 | 动作 |
|---|---|---|
| ≥ 40% | 正常盘面，名义量基本可信 | 按月搜量估算 |
| 15–25% | 社交/UGC/图片包吃掉大头 | **名义量打二折再谈** |
| < 5% | 知识面板 + 百科通吃 | **视同没有量**，无论月搜量多大 |

**高量低捕获比低量更危险**，因为那个大数字会说服人开工。实测同一批调研里，
一个 80 万月搜的词首位只捕获 1.3%（百科 + 知识面板），
一个 1.7 万月搜的壁纸词首位只捕获 19.6%（首页 9 条有 5 条是 Pinterest /
Reddit / X / Instagram / DeviantArt）。两个数字都不能直接当收益看。

> **⚠️ 2026-08-22：`kd` 的 `keywordVolume`（月搜量估算）已被闭环验证证伪，`serp` 端点不受影响。**
> 日文关键词 `悪口診断` 系列，seo.web.cafe 给出的月搜量比 Semrush 低 19–58 倍
> （4,210 vs 201,000–246,000）。用第三个指标闭环验证：该词 #1 站
> `waruguchi16.jp` 的 Similarweb 真实自然搜索点击约 35,834 次/月；按
> seo.web.cafe 的量级，六个主力词加总只有约 5,985 次/月，隐含点击率
> = 35,834 / 5,985 ≈ 599%——平均每次搜索点将近六次，算术上不可能，**证伪**。
> 同一批数据下 Semrush 的量级隐含点击率约 12.5%，落在合理区间（该站 94%
> 移动流量，日文移动 SERP 广告/feature 分流多，可信但可能虚高 2–3 倍）。
> 完整算式见 `backlink/references/authorized-data-sources.md` 「两个搜索量数字打架时」一节。
>
> **这条证伪只打中 `kd` 的月搜量估算，不牵连 `serp` 端点。** `serp`
> 读的是搜索结果页实际排名的站点构成，不含估算模型，依然是这里能拿到的最硬
> 证据（例如靠它发现某词前十全是医院站而弃用）。判断要不要信一个数字，先看
> 它是不是这次被证伪的那个功能。

### 摘要行印出 `月搜 —` 时，那不是"未知，先按 KD 走"，是停止信号

`kd` 的一行摘要形如：

```
✓ <词> → KD 38.3 容易 · 月搜 — · 引用域中值 55 · 盘面 9 位（首页 3/内页 6）
```

**那个破折号意味着这次调用根本没拿到月搜量**，不是"量很小"，也不是"稍后再说"。
KD、引用域中值、盘面构成三项照常返回，读起来一切正常——于是很容易把
"KD 容易 + 盘面松"当成绿灯直接开工。

**难度分从来不隐含量。** 一个没人搜的词当然不难做，低 KD 在零量词上是必然结果，
不是机会信号。要量就必须去有量的数据源拿——优先 SEO Agent 对话（Google Ads 级精度，零 Semrush 配额），少量词直接问；批量走 Semrush 脚本：

```bash
# 单词精确量：SEO Agent 对话（Google Ads 级数据，见上方「SEO Agent 可以查关键词搜索量」）
node scripts/seo-webcafe.mjs chat --ask "查一下 <关键词> 美国的月搜索量，以及全球搜索量"

# 批量查词：Semrush
node backlink/scripts/semrush-keyword.mjs --kw "a,b,c" --db us
```

`--db` **默认是 `jp`**，查任何非日本市场都必须显式传国家码，否则拿到的是另一个
国家的量，而它同样不会报错。返回体里的 `noData` 与 `volume` 要原样转述，
不许把 `volume: 0` 美化成"量较小"。

### 但 `volume: 0 / noData: true` 本身也可能是假的——零必须复查

这一条是 2026-08-24 的实战教训，代价是一条写错的结论加一次返工。

同一个英文词 `bulk rename files`，在**同一个晚上、同一台机器、同一个脚本**下：

| 第几次 | 返回 |
|---|---|
| 第 1 次（批量查两个词） | `volume: 0, noData: true, kd: null, cpc: null` |
| 第 2、3 次（另一个执行者独立复查） | `volume: 320, noData: false, kd: 48, cpc: $1.34` |
| 第 4 次（单词单查，最终确认） | `volume: 320, noData: false, kd: 48, cpc: $1.34, globalVolume: 1900` |

真值是 320。第一次是**瞬时读取失败**——面板渲染没完成时脚本解析到空值，
于是把"没读到"写成了 `noData: true`。

**这个失败形态和 `kd` 那个"月搜 —"是同一个病**：取数失败被叙述成一个有意义的
否定答案。区别在于这次更毒——`noData: true` 看起来是工具在明确告诉你"确认无数据"，
比一个破折号更有说服力，于是更不会被质疑。

硬规则：

| 情况 | 动作 |
|---|---|
| 拿到 `volume: 0` 或 `noData: true` | **必须单词单独复查一次**，两次一致才采信 |
| 批量查询里出现零值 | 优先怀疑批量渲染丢帧，拆成单查复验 |
| 零值将决定"做不做" | 复查到两次一致为止，不许一次定生死 |

反过来的方向不需要这么防：**非零值不必复查**——渲染失败会产出空值，不会
凭空产出一个带 KD、CPC、globalVolume、byCountry 的完整结构。
**只有零需要被证明是零。**

### KD「容易」而首页全是 Pinterest / Instagram：这是社交原生意图，不是机会

`details` 里若前十有一半是社交站，低 KD 的成因是**没人来争**，不是**有空位**。
建站进不去这类盘面，Google 也不打算把这个意图交给独立站。
判据是看 `details` 的域名构成，不是看 `score`。

### 两条取答路径怎么选：`chat` 命令 vs `gefei-ask.mjs`

上面的 `seo-webcafe.mjs chat` 走 HTTP，需要 `SEO_WEBCAFE_COOKIE`——但那枚会话
Cookie 是 HttpOnly，脚本读不到，要拿就得去翻浏览器的 Cookie 存储，等于把用户的
登录凭据抠出来落盘。`scripts/gefei-ask.mjs`（配 `scripts/gefei-chat.browser.js`）
是另一条路：**把请求发到用户已登录的浏览器页面上下文里**，Cookie 由浏览器自动
附带，脚本全程碰不到它。两者服务不同前提，不是谁取代谁：

| 场景 | 用哪个 |
|---|---|
| 已经愿意把会话 Cookie 存进 `SEO_WEBCAFE_COOKIE` | `seo-webcafe.mjs chat --ask "..."`，纯 HTTP，不用开浏览器 |
| 不想 / 不能保存会话 Cookie，但有一个已登录的浏览器可用 | `gefei-ask.mjs`，驱动那个浏览器，全程不碰凭据 |
| 要跑无人值守批量任务、没有浏览器可用 | 只能用 `seo-webcafe.mjs chat`，先解决 Cookie 怎么来 |

`gefei-ask.mjs` 用法：

```bash
opencli browser <名> --window background open https://seo.web.cafe/chat/   # 会话名描述性且唯一，先 tab list 确认没被占用
node rankup/scripts/gefei-ask.mjs --session <名> --slice <名> \
  --question "一次问完，别指望靠追问补"
```

标志：`--session`（必需）`--slice`（必需，落盘名）`--question` / `--question-file` /
`--continue-from` / `--resume`（四选一给问题来源）`--out-dir`（默认 `./gefei-out`）
`--timeout`（分钟，默认 10）。不需要额外起任何本机进程——脚本自己从磁盘读取
`gefei-chat.browser.js` 的源码注入进页面。

必须遵守的规则（都是实测踩出来的，不是猜的）：

- **配额不是按消息计的，问题要一次问完。** 一次带调研的长回答实测扣 **52 分**
  （它自己要跑 DR / SERP / 知识库检索），日额度上限见页面「今日已用 N/M」
  （VIP 档 500）。「再顺手多问几句」不是小决定，开工前先按额度预算好整场对话。
  历史回答重新取回不扣费，别为了拿全文重新提问。
- **判完成不能只看发送按钮的文案。**「停止」这个文案在流结束后会滞留一会儿，
  中间过程（如「让我换几个角度继续挖」）的长度也会长时间不变。唯一可靠的判据是
  **回答长度连续两次不变，且按钮文案恰好回到「发送」**，两条都满足才算完；
  只满足一条都会给出假完成。
- **重抓要换 `--slice` 名，同名文件不会被覆盖。** `gefei-ask.mjs` 在写入前会先
  查重，文件已存在直接报错退出——不会像"接收端返回 200 但不覆盖"那种设计一样
  只在响应体里说实话、状态码骗人。但效果等价：**同名 slice 永远拿不到新内容**，
  以为刷新了数据、实际磁盘上还是旧的那份，这个坑本身与实现方式无关。
- **回答会被服务端拦腰截断，而按钮照样回到「发送」。** 落盘前必须看结尾是不是
  完整句子——`gefei-ask.mjs` 会自己检查（剥掉 Markdown 收尾标记后看末字符）
  并在 `truncated` 字段报出来。截断了就续问（`--continue-from`），不要重新提问：
  续问保留着已查到的数据，重问要再扣一次积分且从零开始。

## 认证与配额

### 第零层：不带 `User-Agent` 一律 403

**任何请求不带 `User-Agent` 都会被直接拒绝**，返回的还是 HTML 错误页不是 JSON，
在脚本里表现为「解析失败」而不是「被拒绝」，**极难定位**。

此前脚本能跑纯粹是因为运行时恰好带了默认 UA，属于运气不是设计。现在全部请求显式带上。
判据：探测任何站点接口时，把 UA 当必需项而不是可选项。

这里另有**两层独立的门槛**，容易混淆，务必分开看：

### 第一层：每个工具专属的 `X-<TOOL>-Token`，和登录无关，人人都要带

每个工具页面加载时，前端会签发一个自己专属的请求头，例如 `/translate/` 用
`X-TR-Token`，`/mine/` 用 `X-MN-Token`，`/domain/` 用 `X-DF-Token`，`/history/` 用
`X-HIS-Token`，`/worth/` 用 `X-WT-Token`，`/audit/` 用 `X-AUDIT-Token`，`/referring/`
用 `X-REF-Token`，值形如 `<13位时间戳>.<64位十六进制>`。

**一开始误判过这个头的作用**——最初看到未登录也能发出成功请求，以为这个头只是
防重放或统计用的会话标识、不是访问控制关键。后来用 `curl` 单独重放才发现完全不是这样：

```bash
# 不带这个头，或者带一个瞎编的值：一律 403
curl -s "https://seo.web.cafe/referring/api/site?domain=stripe.com"
# → {"error":"令牌无效或已过期","code":"token"}   HTTP 403

# 从真实浏览器网络面板复制出来的真实值，重放：正常返回数据
curl -s "https://seo.web.cafe/referring/api/site?domain=stripe.com" \
  -H 'X-REF-Token: <浏览器里复制的值>'
# → 200，正常 JSON
```

也就是说：**这是一道真实存在、服务端会校验的门槛，任何工具的任何端点都要带对**，
包括「不计配额」的 `/referring/*` 三个端点也不例外。已验证的性质：

> **令牌怎么拿：抓工具页 HTML 即可，不需要人工从开发者工具复制。**
>
> 令牌**明文嵌在该工具页面的 HTML 里**，请求头名也在同一份 HTML 里。脚本 `GET /<工具>/`
> 之后，用 `/[0-9]{13}\.[0-9a-f]{64}/` 取值、用 `/X-[A-Z]{2,8}-Token/` 取头名即可，
> **每个工具的令牌互不通用，要各取各的**。
>
> **而且连 Cookie 都不需要。** 实测：完全匿名 `curl` 抓 `/backlink/` 拿到令牌，
> 直接 POST `/backlink/api/evaluate` 返回 200 完整 JSON。Cookie 的作用只有提额
> （匿名 10/日 → 登录 100/日 → VIP 500/日）。
>
> 这条经历了两次修正，值得记：先被写成「让用户从 Network 面板复制」，
> 再被改成「脚本带会话 cookie 自取」，最后实测发现**匿名就能拿**。
> 每修一次，脚本的可用性都上一个台阶——从「每次要人工介入」到「要先配 Cookie」
> 再到「零配置开箱即用」。**判据：凡是写下「需要凭据」的结论，都该反过来验一次
> 不带凭据会怎样**，很多门槛是想象出来的。
>
> **边界仍然不变**：这是读取服务端主动下发给当前访问者的令牌，属于正常自动化；
> 而推导令牌的**生成/签名算法**等于绕过访问控制，不做。两者不要混为一谈。
>
> 同理可用于零配额普查：`GET` 各工具页 HTML，正则抽 `["'`]api/[a-z0-9_-]+` 就能拿到
> 该工具的全部端点清单，**完全不消耗配额**。先普查再决定测哪几个，比逐个点界面省得多。

- 从任意一次真实浏览器会话里复制出来的值，可以**跨端点、跨参数重复使用多次**
  （同一个 `X-REF-Token` 连续查了两个不同域名和一个月份榜单都成功）；
- 具体过期时间未知，没有专门去测生命周期上限；
- 生成算法未知——没有找到内嵌的、可读的前端 JS 源码（页面加载的 script 标签只有
  第三方统计脚本，应用本身的逻辑没有以独立可读文件的形式出现在 `document.scripts` 或
  `performance` 资源列表里），**没有去做进一步的逆向**：这需要拆解混淆过的前端逻辑或
  签名算法，属于绕过站点访问控制的范畴，不在"记录已观察到的契约"这个任务范围内，
  也不建议后续脚本往这个方向走。

给脚本用这个门槛的**唯一正当方式**：从你自己已经建立的浏览器会话里读出来复用，
不是账号登录、不是破解、只是把浏览器已经拿到的东西转手给脚本用，省得每次都开浏览器。
本 Skill 提供的 `seo-webcafe-audit.mjs`、`seo-webcafe-referring.mjs` 都是这个模式：
必须从环境变量传入令牌，脚本本身完全不生成、不猜测、不逆向它。

### 第二层：访客配额，按站点级共享池计算，和 `X-<TOOL>-Token` 是两回事

`/<tool>/api/me` 返回的 `quota.used` 是一个**全站共享的计数器**：在 `/translate/`
页面查询几次后，`used` 就已经涨到 4，切到 `/mine/`、`/serp/`、`/domain/`、`/history/`、
`/worth/`、`/backlink/`、`/review/`、`/adsense/`、`/audit/` 后第一次提交全部直接吃到

```json
{"error":"今日游客额度已用完。使用 Web.Cafe 登录可获得更高额度","code":"quota"}
```

HTTP 状态码 429（注意和上面第一层的 403 `code:"token"` 是不同的错误，报错顺序是
先过令牌校验，令牌对了才轮到配额判断）。实测**同一访客 IP 一天大概率撑不到把全部
吃配额的工具都跑一遍**，规划批量脚本或测试顺序时要按这个假设来，不要指望每个工具
单独有 10 次。

三档配额：访客（`anon`）10/天、登录用户（`user`）100/天、VIP（`vip`）500/天，和
`/kd/` 文档里写的一致，说明这是站点级的统一配额系统。`/referring/*` 三个端点
实测**不计入这个配额池**（多次调用 `used` 都没有变化，也没吃到 429），这一点已经
用真实请求核实，不是猜测。

### `/kd/` 是完全独立的另一套认证，且**只走 HTTP，不走 MCP**

`/kd/` 是唯一有文档化公开 API 的工具，和上面两层门槛都不是一回事。
站主的决定（2026-08-16）：**KD 一律走 HTTP，不用它的 MCP server。**
`seo.web.cafe` 提供 `https://seo.web.cafe/kd/mcp`，但它与 HTTP API 打的是同一份
额度、返回同一份数据，多一层连接只多一个故障点——实测那个 MCP 端点当时正
`Failed to connect (ECONNRESET)`，而同一时刻 HTTP 一次就通。
对应的全局 MCP 注册已用 `claude mcp remove` 摘掉（本机配置，不属于本 Skill）。
以后需要 KD，跑
`node scripts/seo-webcafe.mjs kd --keyword ...`，不要去找 MCP 工具。

**完整契约**（2026-08-16 由站主提供的官方文档核对，脚本已实现全部参数）：

```
GET https://seo.web.cafe/kd/api/v1/kd
```

鉴权二选一：请求头 `Authorization: Bearer wc_mcp_<令牌>`（推荐），
或查询参数 `&token=wc_mcp_<令牌>`（URL 即凭证，会进日志和历史，非必要不用）。

| 参数 | 必填 | 默认 | 说明 |
|---|---|---|---|
| `keyword` | 是 | — | **只支持英文关键词**，URL 编码 |
| `gl` | 否 | `us` | 国家码 us/gb/ca/au/de/jp/sg… |
| `hl` | 否 | `en` | 语言码 |
| `force` | 否 | — | `1` = 跳过 7 天缓存强制重算 |
| `format` | 否 | `json` | `markdown` = 自包含报告，适合存档或转发 |

**额度是三端合并计的**：网页 + MCP + API 共用同一个池子。游客 10 次/天（按 IP），
登录用户 100 次/天（按账号，跨设备共享），VIP 500 次/天。另有**每分钟 10 次**的
瞬时保险丝（仅 MCP/API），所以批量查询间隔 **≥6 秒**——脚本的 `spacingMs: 6000`
就是为这个设的。7 天内重复查同一词命中缓存，**秒回但照样计额度**。

| HTTP | `code` | 含义与处理 |
|---|---|---|
| 401 | `auth` | 令牌缺失或无效 → 先怀疑令牌过期，别怀疑脚本 |
| 429 | `rate` | 撞上每分钟保险丝 → 间隔 ≥6 秒重试 |
| 429 | `quota` | 今日额度用完（三端共用）→ 明天恢复或升 VIP |
| 400 | — | 参数错误（keyword 缺失或过长） |
| 502 | `upstream` | 上游数据源故障，可重试；部分降级时会正常返回并在 `reasons` 里标注【纯 DR 模式】 |

**下结论时必看的字段**（不止 `score`）：

- `keywordType` —— `brand` 时 `score` 的口径变成「以衍生内容进入这个 SERP 有多难」，
  另有 `genericScore` 是正面争夺主词的对照分，**没有行动意义**，别拿它做决策。
- `keywordVolume` —— 月搜索量绝对值，是 Trends 相对值收口的唯一来源。
- `keywordTrend.ratio ≥ 1` —— 有站正靠这个词快速上升，时机窗口开着。
- `linkBudget.quality.mid` —— 外链建设的靶子；`targetDr` 是目标 DR 量级。
- `details[].ageYears < 2` —— 新域名已排进前十 = 赛道对新站友好，比 `score` 更能
  决定「值不值得做」。
- `details[].searchShare` 很低但 DR 高且域名年轻 = 疑似域名迁移承接，DR 是 301 传过来的，
  不代表它真的强。

### 登录

Web.Cafe OAuth（`GET /api/oauth/me` 是全局登录态查询端点）**没有验证**——按任务要求
不代替用户登录、不生成账号级 token。上面提到的所有令牌复用方式都不涉及登录，只是读取
匿名访客身份下浏览器已经拿到的会话令牌。

## 值得写脚本的 vs 不值得

- **`/kd/`**：已有独立文档化的公开 API 契约（Bearer token，和 `X-<TOOL>-Token` 无关），
  稳定、单次请求就能拿到完整结果，脚本化成本最低，见 `seo-webcafe-kd.mjs`。
- **`/audit/`**：请求/响应契约已确认，但要带 `X-AUDIT-Token` 且吃访客配额。脚本
  (`seo-webcafe-audit.mjs`) 要求调用方从自己的浏览器会话里复制一次令牌传进来，
  不解决配额问题——批量跑之前先想清楚这批 URL 是否真的值得那 10 次/天。
- **`/referring/`**：三个 GET 端点**不吃**访客配额（已用真实请求核实），数据是月度
  榜单快照，适合按域名批量核对"谁在薅 Stripe 引荐流量"，复用价值最高，见
  `seo-webcafe-referring.mjs`。仍然要带 `X-REF-Token`，但因为不计配额、且令牌可重复
  使用，一次从浏览器复制的令牌够支撑一整批域名查询，是三个脚本里最适合"复制一次令牌、
  跑一整批"这种用法的。
- **`/translate/`、`/mine/`、`/serp/`、`/domain/`、`/history/`、`/worth/`、`/backlink/`、
  `/review/`、`/adsense/`**：既要各自的 `X-<TOOL>-Token`，又要吃那个全站共享的访客
  配额（10/天），而且 `translate`、`mine` 是内部多步骤编排（一次查询连续打好几个子端点：
  `search` → 多个 `page` → 多个 `domain` → `aggregate`），字段结构本次只部分展开。
  **不建议现在就封装脚本**——配额太薄，脚本化后很容易一次批量调用就把当天额度打光。
  等以后需要高频用其中某个工具、且有账号提额时，再针对那一个工具单独补脚本和字段全表。
- **`string`、`money`、`influencer`、`kgr`、`email`、`traffic`、`level`、`gsc`**：
  纯前端计算/模拟，页面上明确写了或实测确认提交后**零网络请求**。不要再为这些猜端点、
  也不用写脚本——本地一个小函数就能复刻，没必要过网络。`traffic` 页面上直接写着
  "纯本地解析，文件不会离开你的浏览器"；`level` 甚至没有任何输入控件，是静态说明页。

## 已知死路（别再踩）

- **`/domain/*` 和 `/referring/*` 盲猜路径全部 403**——早前用 curl 盲测过（没带
  `X-<TOOL>-Token`，也没找真实端点名），这其实就是上面「认证与配额」第一层门槛的表现：
  没令牌一律 403，和路径猜没猜对没关系，不是什么"这两个前缀被特殊拦截"。本文档表格里
  列出的路径都是从浏览器网络面板实测到的真实调用，不是猜的；带对令牌之后这些路径本身
  是能访问的（`/domain/api/intent`、`/referring/api/*` 均已验证）。
- **`/api/v1/...` 前缀是错的**，只有 `/kd/` 这一个工具在用这个风格，其余工具一律是
  `/<tool>/api/<action>`，没有版本号。
- **不要以为访客配额是按工具算的**——上面已经说明是全站共享池，规划测试顺序时要把
  "全站只有约 10 次"当作硬约束，不是"每个工具 10 次"。
- **`X-<TOOL>-Token` 请求头不是"可有可无的统计标识"，是真实生效的访问门槛**——
  这个坑本文档自己踩过一次：一开始看到未登录也能发出成功请求，就误判成"不参与鉴权"，
  写了个不带这个头的纯 `fetch` 脚本，结果对 `/referring/*` 一律吃 403
  `{"error":"令牌无效或已过期","code":"token"}`。用 curl 单独重放一个从浏览器复制出来的
  真实值才验证清楚：这个头是硬性必需的，且是可重复使用的会话令牌，不是一次性的。
  规划任何脚本前，先用 curl 不带这个头测一次，别假设"访客能用就是不需要认证"。
- **不要去逆向这个令牌的生成算法**——页面没有把应用逻辑放在可读的独立 JS 文件里
  （`document.scripts`/`performance` 资源列表里只看到第三方统计脚本），要破解生成规则
  得拆混淆过的前端代码，这已经越过"记录观察到的契约"，滑向绕过访问控制，不建议做。
  正当路径是"从自己的浏览器会话复制令牌喂给脚本"，不是"让脚本自己伪造令牌"。

## 补录（登录 VIP 会话，配额充足时重测）

首轮以访客身份测，配额中途耗尽，多个端点只拿到请求契约没拿到成功响应。
换成已登录会话（VIP 每日 500 次）重测后补齐如下，**以下均为实测 200 响应的顶层字段**：

| 端点 | 方法 | 请求头 | 请求体 | 响应顶层字段 |
|---|---|---|---|---|
| `/serp/api/serp` | POST | `X-SR-Token` | `{keyword, gl}` | `keyword, gl, kd, results, related, paa, fromCache` |
| `/serp/api/page` | POST | `X-SR-Token` | `{url, keyword}` | `url, finalUrl, title, score, grade, focus, rTitle, rH1, rUrl, density, wordCount, elapsedMs, bytes, fulfillment, rendering, framework` |
| `/review/api/analyze` | POST | `X-RV-Token` | `{url, keyword}` | `url, finalUrl, domain, isHomepage, inferred, page, site` |
| `/backlink/api/evaluate` | POST | `X-BL-Token` | `{input}` | `domain, userPrice, linkType, linkTypeLabel, quality, fair, verdict, live, market, dataSource, fromCache, noData` |
| `/referring/api/summary` | GET | `X-REF-Token` | — | `months, totals, fluidity, latest` |
| `/worth/api/estimate` | POST | `X-WT-Token` | `{input, model}` | **未取到**（见下） |
| `/history/api/analyze` | POST | `X-HIS-Token` | `{domain}` | **不是 JSON，是 SSE 流**（见下） |

### 两个必须记住的契约细节

1. **字段名是 `input` 而不是 `domain`/`url`。** `/worth/`、`/backlink/`、`/adsense/`
   三个工具的请求体都是 `{input: "域名或网址"}`。用 `domain` 或 `url` 会拿到
   `400 {"error":"请输入有效的域名或网址…","code":"param"}` —— 这个报错读起来像「值不合法」，
   实际是「字段名不对导致读到 undefined」，**极容易被误判成输入格式问题而反复调值**。
   判据：换字段名之前先确认报错是不是恒定的，值怎么改都不变就说明是字段名问题。
2. **`/history/api/analyze` 返回 SSE 流不是 JSON**：`event: delta\ndata: {"text":"…"}` 逐块推送。
   按 JSON 解析必然失败。凡是「AI 生成结论」类的端点都要先确认响应类型再写解析。

### 仍未取到的

- `/worth/api/estimate` 与 `/adsense/api/audit` 的成功响应字段：请求契约已确认
  （都是 `{input}`，worth 另带 `model`），但抓响应时被本地权限策略拦下，未强行绕过。
- `/translate/api/domain`、`/domain/api/name`、`/mine/api/*` 的成功响应结构。

---

## 开工前必做：先问配额档位，再规划怎么花（2026-08-22，踩过）

**症状**：整场调研按「匿名 10 次/日」规划，把配额当稀缺资源省着用，
少测了 4 个词的 SERP，还在报告里写成「配额耗尽，无法验证」。
**实际上账号是 VIP，500 次/日，当天只用了 66 次——还剩 434 次。**

成因不是账号问题，是**从没去问过**。本文档写了三档配额（匿名 10 / 登录 100 / VIP 500），
但没有任何一步要求「开工前先确认自己在哪一档」，于是默认值被当成了事实。

**规矩：任何要花配额的调研，第一个动作是查档位，不是查词。**

```bash
# 不耗配额、不需令牌，在浏览器页面里发：
fetch("/serp/api/me",{credentials:"include"}).then(r=>r.json())
# → {"login":true,"vip":true,"quota":{"used":66,"limit":500,"tier":"VIP",
#    "tiers":{"anon":10,"user":100,"vip":500}}}
```

`/<tool>/api/me` 每个工具都有，返回真实档位与已用量。**先读它再排计划。**

### 补充根因（2026-08-23 实测，推翻上面「成因是从没去问过」的说法）

上面写的成因只对了一半。真正的坑是：**`/kd/api/me` 完全忽略 `Authorization: Bearer` 令牌。**

带一枚**有效的** `/kd` 令牌去打它，返回的仍然是：

```json
{"login": false, "tier": "游客", "limit": 10}
```

也就是说，**在 node 侧脚本里查档位，无论令牌配得多正确，答案永远是「游客 10 次」**。
按这个读数排计划，必然重演 08-22 那次事故——而且这次连「去问了」都不管用。

| 查档位的姿势 | 结果 |
|---|---|
| node 脚本带 Bearer 打 `/kd/api/me` | ❌ 恒为游客 10 次，**读数是假的** |
| 在**已登录的浏览器页面里** `fetch("/<tool>/api/me",{credentials:"include"})` | ✅ 真实档位与已用量 |

**规矩修订为：查档位必须在浏览器页面里查，不能在 node 脚本里查。**
`seo-webcafe.mjs` 的配额前置检查已按此实现；看到脚本打印「游客 10」时，
先确认它是不是走的 node 侧路径，再下「配额不够」的结论。

### `kd` 的另外两个实测契约

- **`format=markdown` 返回 `text/markdown` 而不是 JSON。** 早期脚本一律走 `safeJson`，
  于是 4580 字节的报告被解析成 `null` **并且不报错**——静默丢数据。
  现已按 `content-type` 分流，`--out xxx.md` 原样落盘。
- **`details[]` 实测长度是 9 不是 10**，且文档的字段表漏了 5 个实际返回的字段
  （`url`、`isHomepage`、`kwHitTerm`、`kwDataKnown`、`dataNote`）。**下游别硬编码长度。**
- 批量端点**不存在**（`/batch`、`/kd/batch`、`/keywords` 全 404），只能客户端循环，
  脚本的 `--batch` + 请求间隔已覆盖。

## httpOnly 会话：不要去取凭据，把请求发到页面里去

`seo-webcafe.mjs` 是 node 侧 HTTP 脚本，没有浏览器会话，所以**永远跑在匿名档**，
除非显式给 `SEO_WEBCAFE_COOKIE`。而这个 cookie **取不出来**：

- `document.cookie` 只有统计 cookie（`_clck`、`_pv_*`），会话 cookie 是 **httpOnly**；
- OpenCLI 1.8.6 **没有** cookie 导出命令（`get` 只有 title/url/text/value/html/attributes）；
- `browser network` 抓的是请求体形状，不给请求头。

**正确解法是绕开取凭据这件事本身：在已登录的页面上下文里 `fetch`。**
浏览器会自动带上 httpOnly 会话，凭据从头到尾没有离开浏览器，
不写进 `.env`、不进日志、不进 git。

```bash
S="webcafe-serp"                          # 描述性；绝不用 work 这种通用字面量，
                                         # 也绝不用 $$——Bash tool 每次调用都是新进程
opencli browser "$S" --window background open "https://seo.web.cafe/serp/"
# 等 ~5 秒加载完，然后：
opencli browser "$S" --window background eval '(async()=>{
  const h=document.documentElement.outerHTML;
  const m=h.match(/[0-9]{13}\.[0-9a-f]{64}/);       // 页面 HTML 里的 X-<TOOL>-Token
  if(!m) return JSON.stringify({err:"no token"});
  const r=await fetch("/serp/api/serp",{method:"POST",credentials:"include",
    headers:{"content-type":"application/json","X-SR-Token":m[0]},
    body:JSON.stringify({keyword:"メンヘラ診断",gl:"jp"})});
  return JSON.stringify(await r.json());
})()'
opencli browser "$S" close && opencli browser "$S" tab list   # 期望 []
```

两个必须注意的点：

1. **eval 体一律包成 IIFE**。本环境的 eval 上下文跨调用持续，重复声明同名 `const`
   会抛 `Identifier already declared`，而那次调用**根本没执行**——
   报错信息和「请求失败」长得毫不相干。
2. 每个工具的令牌前缀不同（`X-SR-Token`、`X-AUDIT-Token`、`X-TR-Token`…），
   见上方接口表；但**正则是同一个**，令牌值就明文躺在页面 HTML 里。

**可推广的形式**：凡是「脚本没有登录态、而用户浏览器有」的场景，
第一反应不该是「把 cookie 抠出来喂给脚本」——httpOnly 本来就是为了防这个。
应该是**把调用挪到浏览器里去执行**。前者要处理凭据存储、轮换、泄露；后者一样都不用。
