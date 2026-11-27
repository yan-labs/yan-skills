# 调研流水线（预制 playbook）

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

- **触发**：「做个研究」「帮我调研一下」这类判不出输入的说法，或「反查这个站」「竞品在做什么」。任务入口在 `SKILL.md` 任务表，本文件只管调研内部分流。
- **输入**：用户交给你的东西（一个词 / 别人的域名 / 什么都没有）。
- **步骤**：先跑 [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头)，再按 [P0 分流](#p0--分流器只看他交给你的是什么) 进 P1、P2 或 [P4](#p4--竞品调研--反查谁在赚钱)；App 走 [App 市场验证分支](#app-市场验证分支)。
- **读哪里**：[四条铁律](#四条贯穿全部流水线的铁律)、[五个取数动作](#五个取数动作与编排探索循环)；裁决只在 [`entry.md`](entry.md)。
- **完成标志与收尾**：各流水线的「收尾」一节。

## 导航

- [怎么用](#怎么用)
- [四条贯穿全部流水线的铁律](#四条贯穿全部流水线的铁律)
- [五个取数动作与编排（探索循环）](#五个取数动作与编排探索循环)
- [阶段 0 开工前 30 秒（每条流水线都以它开头）](#阶段-0-开工前-30-秒每条流水线都以它开头)
- [App 市场验证分支](#app-市场验证分支)
- [P0 · 分流器：只看他交给你的是什么](#p0--分流器只看他交给你的是什么)
- [P1 / P2 分册（2026-09-30 拆分）](#p1--p2-分册2026-09-30-拆分)
- [P4 · 竞品调研 / 反查谁在赚钱](#p4--竞品调研--反查谁在赚钱)
- [附 · 兄弟 Skill 在这条链路里的位置](#附--兄弟-skill-在这条链路里的位置)
- [维护契约](#维护契约)

**这个文件回答一件事：用户丢来一句模糊的话，从下一秒开始该跑哪几条命令、按什么顺序、哪些并行。**

入口 `SKILL.md` 的任务表是**索引**（一句话 → 第一站），
[`capability-map.md`](../capability-map.md) 是**底账**（有哪些能力），
[`research-checklist.md`](../research-checklist.md) 是**验收单**（跑完了没有，不是执行顺序）。
三者都不告诉你「先跑哪个、再跑哪个、谁能并行」——那是本文件。

本文件负责分流与开工，探索操作读 P2，采样、测量与判读按各自唯一源。

### 哥飞官方 Skill 入口

查关键词或竞品时先按 [`seo-webcafe.md`](../seo-webcafe.md) 检查、安装并加载官方 `gefei` 与 `gefei-keywords` / `gefei-competitor`。遇到不熟悉的规则或不知道下一步时，先读官方 `gefei` 总入口，按其方法查知识库或工具目录。Rankup 按 P2 编排探索、按 entry 判读；实际接口与参数听官方 Skill，不调用站内 AI 代做调研。

## 怎么用

1. 用户开口 → 进 [P0 分流器](#p0--分流器只看他交给你的是什么)，**按输入分流，不问问题**。
2. 落到 P1 / P2 / P4 中的一条 → 跑它的 [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头)，再照着阶段表往下走。
3. 每个阶段表的列固定是：**阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办**。
4. 一个简单查询或前后依赖的串行任务，主 Agent 可以自己做；多个独立调研动作需要同时运行时，按 [`discipline.md`](../discipline.md) 分派子 Agent，收回证据后由主 Agent 合流判读。「串行」表示上一步产出是下一步输入，或需独占配额/会话（见下方铁律三）。

**旧编号对照**（3.0 之前的项目笔记里会出现）：旧 P2「这个词能不能做」与旧 P3「扩词」
已合并成本文件的 **P2 词根调研**——用户给的任何词都是词根，「能不能做」与「扩成树」是同一条流水线的前后段，不是两条路。

### 路径变量（每个 sub agent 的 prompt 里都要带上这两行）

```bash
RANKUP=<rankup-skill-dir>
BACKLINK=<backlink-skill-dir>
```

**为什么必须写全路径**：Semrush / Similarweb / Tools Share 那一组脚本住在
`$BACKLINK/scripts/`，**不在 rankup 里**。`research-checklist.md` 里的命令已带 `backlink/scripts/` 前缀，
但旧项目笔记里仍有裸文件名（`semrush-keyword.mjs`），照抄会 `MODULE_NOT_FOUND`。

---

## 四条贯穿全部流水线的铁律

| # | 铁律 | 违反后长什么样 |
|---|---|---|
| 1 | **脚本只采集，判决由你下。** 2026-08-30 三波重构后，`revenue-site-audit` 不再出 verdict、`site-network` 不再出 strength、`keyword-value` 不再出 low/normal/high、`similarweb-query` 的 `belowFloor` 已改名 `noDataTextObserved`（观测事实，不是判决）。新脚本 `suggest.mjs` 同样不去重不打分。 | 把脚本某个字段当结论抄进报告，而那个字段现在只是「页面上写了一句话」 |
| 2 | **看到 0 条或空表，先开 `manifest.json`。** 落点 `.rankup/evidence/demand/<脚本>-<时间戳>/`。`sources` 里有任何一条非 `ok`，这次运行就不能当「真没需求」的证据；全 `ok` 且 `rawCount:0` 才允许读成真空态。`suggest.mjs` 里失败引擎是 `null` 不是 `[]`，就是为了让这两种情况长得不一样。 | 429 / CAPTCHA / 改版 / 超时全都产出 0 条，被写成「这个方向没人做」 |
| 3 | **一个配额工具只许有一个采集器。** Semrush / Similarweb 会话名固定（`semrush-nav` / `similarweb-nav`），**不要传 `--session`**；因此**同一时刻只能有一个 sub agent 在跑面板**。零配额源可以随便并行。 | 三个 agent 同时开 Similarweb → 触发上限，三个都拿不到数，且不报错 |
| 4 | **哥飞开放 API 直接取数，Rankup 自己判读。** 选词和竞品调研加载官方 `gefei-keywords` / `gefei-competitor`，按官方方法调用工具，搜索量用 `keyword_ideas` / `keyword_volume` 的 Google Ads 口径；不让站内 AI 代查。 | 只用 Semrush 单一来源，或把站内 AI 转述当原始数据 |

---

## 五个取数动作与编排（探索循环）

探索动作、竞品反查、扩词补漏、日志与工作量边界的唯一源在 [P2「五个取数动作与编排」](research/p2-keyword-root.md#五个取数动作与编排探索循环)；本节保留旧锚点，只作路由。

---

## 阶段 0 开工前 30 秒（每条流水线都以它开头）

**串行，主线自己跑，不派 agent。** 30 秒，决定后面整场调研的规模。

```bash
# ⓪ 先读项目记忆，别把上一轮 pass 掉的东西当新点子（没有 .rankup/ 的裸调研跳过这步）
grep -i "<词根>" .rankup/rejected.md .rankup/decisions.md .rankup/keywords.md 2>/dev/null
ls .rankup/research/ 2>/dev/null | grep -i "<词根>"     # 同词根有旧报告先读结论，再决定重跑哪几步

# ① 哥飞官方 Skill 与 API 状态：只在本轮需要其工具时检查
node <已安装的gefei目录>/scripts/webcafe.mjs tools
node <已安装的gefei目录>/scripts/webcafe.mjs me

# ② 有哪些钥匙（决定哪些凭据型脚本能跑；公开 SERP 不依赖 key，见 seo-serp.md「SERP 取数路线」）
cut -d= -f1 $RANKUP/.env 2>/dev/null; env | grep -oE 'SERPER_API_KEY|GITHUB_TOKEN|GH_TOKEN|PRODUCTHUNT_TOKEN|REDDIT_CLIENT_ID|IGDB_CLIENT_ID|TABAPI_KEY'

# ③ 面板节点（只在这一轮确实要用 Semrush/Similarweb 时才跑，它自己不耗配额）
node $BACKLINK/scripts/tools-share-node.mjs list --tool semrush
node $BACKLINK/scripts/tools-share-node.mjs list --tool similarweb
```

**⓪ 命中旧记录**：先读原始证据、日期与复测条件，复用仍有效结果；旧量筛、七闸或经营否决不沿用为本轮结论，按 [entry.md](entry.md#4--判读)补齐两路证据再判断。候选待验证与不做分开登记，收尾口径只见该入口。

**钥匙缺失时的降级路线（照抄，不要现想）**：

| 缺的钥匙 | 谁受影响 | 换成什么 |
|---|---|---|
| `SERPER_API_KEY` | 仅可选兜底 `demand/serp-query.mjs` 不可用 | 按 [SERP 取数路线](../seo-serp.md#serp-取数路线)继续浏览器采集 |
| `GITHUB_TOKEN` | `github-skill-search --mode code/recent` 不可用 | `--mode repo`（无 token 可跑）；`github-trending --source trending` 不受影响 |
| `PRODUCTHUNT_TOKEN` | 无 | `boards.mjs producthunt` 自动降级浏览器路径，**浏览器路径本来就更全** |
| `REDDIT_CLIENT_ID` | `reddit-wishes` 没有 score | 自动降级 RSS，能跑但慢（`--delay` 别低于 6000）；本机 Chrome 登录了 Reddit 时 auto 链会先走 opencli，全字段 |
| `IGDB_CLIENT_ID` | `game-newtitles --source igdb` | 换 `--source steam` / `steam-featured` / `itch` / `poki` |
| `TABAPI_KEY` | 无 | `domain-profile.mjs` 默认 `--provider webcafe` 经官方 gefei CLI，需其授权，当前 2 积分/域名（以目录为准） |

**`suggest.mjs`、`word-roots.mjs`、`keyword-value.mjs`、`gt.py`、`seo-webcafe.mjs kgr/money` 不需要任何钥匙**——扩树与折算那半永远能跑。

**Similarweb / Semrush 的配额读数只在面板启动那一次刷新**，之后会话复用就不再刷新。
所以整场调研要用多少次面板，必须在阶段 0 定死，不能边跑边加。

---

## App 市场验证分支

阶段 0 先记录拟交付平台、分发方式、国家/语种。产品形态不限，包括macOS、iOS、iPad、网站/SaaS；不做 Android App，但可读其数据作参考。P1 得到 App 候选、P2 收到 App 词根、P4 收到商店链接或原生竞品时，均进入本分支。不是等网页量通过才进入。

1. 保留网页任务表达、教程、竞品与获客证据；网页单项读数不能单独否决 App 市场，涉及关键词与网页获客的结论只按 [entry.md](entry.md#4--判读)，探索与反查只按 P2。商店采集保留为原生形态的市场背景，不新增关键词裁决票。
2. 识别同国家、设备和分发渠道的3–5个竞品，按 [`demand-sources.md` App证据表](../demand-sources.md#app-市场证据与原生分发) 逐项记录：商店搜索、榜单历史、下载估计、价格/IAP、收入、评论增量、使用/留存。公开数据与自有后台分列；缺项记未知，不能估成零。
3. 先用现成榜单/评论脚本、公开商店页与官方文档；历史和下载/收入估计仅用真实有权限的提供方。没有现成脚本不伪造API能力，按OpenCLI与agent-reach既有路线读取可访问页面。Mac App Store与iOS不同库，macOS直销另核支付/下载/激活/留存，不能借iOS或Android估计替代。
4. 至少两类独立证据支持同一任务；榜单、评分数、价格都不是收入，下载也不是活跃或留存。不能拿评论数乘一个比例声称真实安装；自有留存须有同期 cohort 分母和观测窗口。尚未上线时自有留存记N/A，竞品留存未知照记，后续小样本验证，不要求先有自家后台才准调研。只找到微额付费与单日榜单仍是RESEARCH，不能判已验证大市场。
5. 输出“任务→平台/分发→市场证据→收费方式→获客假设→缺口/继续条件”，与Web侧结论并列。阶段2再选形态，原生不强制套网站组件/Cloudflare部署。

## P0 · 分流器：只看他交给你的是什么

### 触发

「做个研究」「帮我调研一下」「调研一下这个关键词」「看看有什么能做的」「研究一下这块」「随便挖挖」

### 产出

一次分流判断 + 直接进入 P1 / P2 / P4 中的一条，**同一轮对话内就开始跑阶段 0**。
不产出「请问您想……」的选项清单。

### 分流规则：只看输入，三种形态

**方向已有但尚未落到主词**：按 [`demand-sources.md`](../demand-sources.md)收集来源线索，用 [`selection.md`](selection.md)记录方向背景；主词出现后先走 [`entry.md`](entry.md)，再回下表。无方向才走 P1；入口结果直接引用，不重复取数。

**唯一判据**：用户那句话里**他交给你的东西**是什么。他说出口的名词（「关键词」「长尾词」「赛道」）
是他要的结果，不是分流依据。任务入口只在 `SKILL.md` 的任务表，本表只细分调研的三种输入；
读到不一致，以本表分流；超出当前授权文件的迁移项只记录，不扩大批次。

| 用户交给你的输入 | 直接去 | 不要问 |
|---|---|---|
| **一个词**——不管他叫它「关键词」「词根」「这个词」「方向」（"kd 这个词能做吗"、"调研一下 clipboard history 这个关键词"、"围绕 converter 挖长尾"、"想做个 PDF 转换的站"、"找个 PDF 转换的关键词需求"） | 先过[入口环节](entry.md)，再进 [P2 词根调研](research/p2-keyword-root.md#p2--词根调研这个词能不能做扩成树)，按[五个取数动作与编排](#五个取数动作与编排探索循环)编排①全自动跑，不只在这一个词上换后缀 | 别问"您想了解哪方面"——按入口顺序取证、再补漏 |
| **别人的一个域名 / 竞品 / 帖子链接**（"这站月入 5k 真的吗"、"查查这个站"） | [P4](#p4--竞品调研--反查谁在赚钱) | 别问"要查哪些指标"——四件套全跑 |
| **什么都没有**（"不知道做什么"、"最近有什么能做的"、"帮我调研下关键词"——句子里一个词都没有） | [P1](research/p1-discovery.md#p1--挖需求--找方向--不知道做什么) | — |

**用户给的任何词都是词根，不是关键词。** 他说「调研一下这个关键词」，手里那个词依然是词根：
词根的端到端顺序与裁决只见 [entry.md](entry.md)，探索补漏只见 P2，不以孤立读数替代证据。

#### 三种最容易判反的形态

| 用户原话 | 他给了什么 | 落点 | 为什么不是另一条 |
|---|---|---|---|
| 「**帮我调研下关键词**」「找几个关键词」（句子里没有具体的词） | **什么都没有** | **P1** | 「关键词」是他要的产出。P1 跑出候选后，每个候选再进 P2 |
| 「**研究下长尾词**」「帮我扩词」「我这站还能做什么词」（没给词根） | **一个扩词动作** | **P2**，从 [阶段 0.5](research/p2-keyword-root.md#阶段-05--词根从哪来没给词根时必跑) 反推词根 | 不是 P1：他已经锁定「在既有盘子里往外扩」。**没给词根不构成回退到 P1 的理由** |
| 「**review 一下我这个网站**」 | **他自己的站** | 不在本文件——走 [`site-review.md`](site-review.md) 第一节 | 不是 P4：P4 是反查**别人**的站；这句要的是体检不是竞品情报 |

**共同的错误形状**：因为「他没给我 X」就退回去问一句。
**没给 X 时的正确动作是去把 X 挖出来**——P2 阶段 0.5 和 site-review 阶段 0.0 就是为此存在的。

### 只有一个问题值得问，且只在最后一行才问

> **「有没有已经想好的方向、词根或者感兴趣的领域？有的话给我一个；没有的话我直接开跑。」**

**问法纪律**：这句话和阶段 0 的自检**同一条消息发出**，不等回答就开始跑阶段 0 和 P1 的第一小时子集。
用户回了就切到 P2，没回就沿 P1 跑下去。**不许把这个问题当阻塞点**——
`discipline.md` 执行纪律：「不请示、不确认、不汇报选项」。

### 收尾

分流结论一行记进 `.rankup/decisions.md`：走了哪条 playbook、依据是用户话里的哪个信息。

---

## P1 / P2 分册（2026-09-30 拆分）

| 流水线 | 文件 |
|---|---|
| P1 · 挖需求 / 找方向 / 不知道做什么 | [`research/p1-discovery.md`](research/p1-discovery.md) |
| P2 · 词根调研：这个词能不能做、扩成树（含阶段 0.5–0.7、小语种三关、探索补漏、主流水线与八节证据报告） | [`research/p2-keyword-root.md`](research/p2-keyword-root.md) |
| P4 · 竞品调研 / 反查谁在赚钱 | 本文件下文 |

具体词按 [entry.md](entry.md#3--流水线)进入端到端验证，P2 负责探索与补漏，不重复采样和 GT 规则。

---

## P4 · 竞品调研 / 反查谁在赚钱

### 触发

「谁在赚钱」「反查这个站」「他还做了哪些站」「帖子说月入 X 是真的吗」「竞品调研」
「他排了哪些词」「这站流量哪来的」「竞品最近在做什么」

### 产出

1. `.rankup/decisions.md` —— 一份**跨源对照表**：每个数字带来源面板 + 报告页 + as-of 日期 + 口径（全球/国家库、总访问/自然流量），**并排列出，不做算术运算**
2. 一句明确的 verdict（证实 / 部分证实 / 无法证实 / 反证）**由你下**，附判据出处
3. 站群清单（如果有）+ 每个兄弟站「做成了 / 做了没跑起来」的分类——**后者才是机会**

### 页面竞争补充

需要判断竞品哪里可改时，复用 P2「关键词竞争与竞品页面证据」：取入选目标页的 AITDK 完整报告，再按 `seo-box.md` 的离线分流命令读取异常摘要。它补充产品/SEO 缺口，不能替代本节收入、渠道、目标页面自然量的核验，也不把正常项展开推送。

### 流水线

本节的站→词、站→站两个动作就是[「五个取数动作与编排」](#五个取数动作与编排探索循环)编排③（有域名）
的具体展开；反查出的头部词交 P2 后按编排①继续。

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 0 | 串行 | [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头) | 档位与钥匙 | — |
| **1 · 钱的信号** | **并行 F**（Stripe 按官方积分计费） | `node $RANKUP/scripts/demand/stripe-referring.mjs site --domain <域名>`<br>`node $RANKUP/scripts/demand/boards.mjs trustmrr --board mrr --limit 60 --json` | 该域名在 Stripe 引荐榜的**在榜轨迹**（官方 32 个月范围，实际在榜月数因站而异）；TrustMRR 上有没有它 | 不在 Stripe 榜 ≠ 没收钱——可能用长尾网关，去阶段 1' |
| **1' · 长尾网关**（Stripe 榜没有它时） | 并行 F | `node $RANKUP/scripts/demand/payment-referrers.mjs list`<br>`node $RANKUP/scripts/demand/payment-referrers.mjs serp <网关> --max-queries 2` | Creem / Lemon Squeezy / Paddle / Gumroad 等网关的引荐站 | `serp` 走官方 raw SERP，**每查询 2 积分**，默认 us/en，`--max-queries` 默认 2 就是为了省。逐 query 记状态进 manifest，**查询失败 ≠ 没人引用** |
| **2 · 域名画像** | 并行 F | `node $RANKUP/scripts/demand/domain-profile.mjs <域名>` | 注册日期 / 站龄 / 月访问 / 流量结构 / DR / 环比 / 核心搜索词 | 官方 CLI 报错 = 取数失败，不是没数据；核对积分/每日上限及上游错误 |
| **3 · 站群反查** | 并行 F | `node $RANKUP/scripts/demand/site-network.mjs --domain <域名> --confirm --max 25 --json --out net.json` | 同一主体运营的其它站 + 共同指纹 + 回访状态 | 脚本**只记事实不裁定强弱**。`revisit=fetch_failed` = 这次没看到，不是不共享指纹。**「无共同指纹」是站群的常态**（各站独立 GA4 / 埋点进 GTM 容器 / 服务端埋点），空结果读成「这条路没找到」 |
| **4 · 广告与供给侧** | 并行 F | `node $RANKUP/scripts/demand/ads-transparency.mjs creatives --domain <域名> --region US`<br>`node $RANKUP/scripts/demand/sitemap-diff.mjs --domain <域名> --all --slug-words --top-words 40` | 他在不在持续买流量（持续投放 = ROI > 1）；他用几页吃了多少词 | ads-transparency 不需要 token 不需要登录。**广告数值不准，趋势与量级对**（50K 真值 40K–60K），**不进任何财务测算** |
| **5 · 竞品真实流量** | 串行 | 官方 Skill 调用 `domain_overview <域名>` 读整站访问/渠道/地区/DR，`site_keywords <域名> --gl <目标国>` 读排名词与页面；多站批量用 `domain_traffic` / `domain_dr`；需要独立面板对账才补 Similarweb/Semrush | 总访问、渠道、国家、排名词与落地页；每项标口径 | `site_keywords` 快照的估算自然流量不能当总访问；两家数字差异先核国家和渠道口径 |
| **6 · 薄编排复核**（帖子声称数字时） | 串行，在 5 之后 | `node $RANKUP/scripts/demand/revenue-site-audit.mjs --domain <域名> --source-url <帖子链接> --claimed-visits <n> --claimed-organic-share <pct> --claimed-mrr <n> --keyword <主词> --db <目标国> --out audit.json` | 各源原始对照数据 + 倍差事实，**不含 verdict** | 它顺序调用现有 domain-profile / Similarweb 两张报表 / Semrush / sitemap 与官方 `keyword_difficulty`（gl=db、hl=en）。`--from <目录>` 可离线重整已保存的原始文件（**不重跑不再花配额**）。原始文件全保留在输出的 `rawFilesDir` |
| **7 · 定性背景**（可选，判断「他为什么能起来」） | 并行，与 5/6 无冲突 | `/deep-research` 或 `/agent-reach`：查这个品牌/产品在 Reddit / X / 小红书 / 播客里的讨论<br>`node $RANKUP/scripts/webcafe-forum.mjs chat-search "<品牌或赛道>"` | 叙事与打法（社群里有没有人拆过它） | **这一步只出定性叙事，不出任何数字**。哥飞社区那条**优先于问 AI**：`chat-search` 拿的是群聊归档原文，不经模型转述、零 AI 额度。**匿名不报错，只把正文抹成空串** |
| 8 | 串行 | 他排的头部词当**词根**进 [P2](research/p2-keyword-root.md#p2--词根调研这个词能不能做扩成树)，补齐问法与 Google 证据 | 入口卡结论与缺项 | — |

Stripe 前 20 名、单站与月度概要已迁官方 `stripe_checkout_referrals`（目录与试用：2026-09-30），每次官方业务调用 1 积分。月榜试用 `202608` 覆盖名次、份额、环比、新进/重返、全球排名与访问量（K）；官方 month 分支只返回前 20 名：`top --limit <=20` 且没有 `--new-only` 时走官方；默认 limit 25、limit>20 或 `--new-only` 仍走旧全榜入口，因官方无全榜等价能力。旧全榜沿用原不计每日配额记录，本轮受探测预算限制未重验当前可用性，不能宣称成功或下线；省略 `--m` 另用官方 overview（1 积分）取最新月份。单站 `monthly/stats` 范围为 2024-01 至 2026-08（32 个月），实际在榜月数因站而异（某个试用站点为 8 个月）；`overview` 最近最多 12 个月，不是全历史汇总。`overview.recentTotals` 实测覆盖 month/visits/listedShare/top10Share/longtailShare；只有缺失字段才输出 null/未知，不补 0。

官方哥飞知识库与 `webcafe-forum.mjs` 的能力边界（哪些只有本地脚本能取、各自的上限与记账）见 [`webcafe-forum.md`](../webcafe-forum.md)「七、站内搜索」末尾的 2026-09-30 核对记录。

### 判读

| 阶段 | 判据在 |
|---|---|
| 1 收入源 | [`demand-sources/revenue-and-ads.md`](../demand-sources/revenue-and-ads.md#收入数字该信谁)「收入数字该信谁」：TrustMRR = Stripe 实连（可当数字）；traffic.cv = 定性；Toolify 只说明「在收钱」。派生指标 `到达付费页比例 = Stripe 引荐 ÷ 总访问`（实测算例 ≈8.60%），**榜上的是优等生，保守按 1% 折算** |
| 3 站群 | [`demand-sources/competitors-and-roots.md`](../demand-sources/competitors-and-roots.md#九二一个站背后的整个站群) 九·二 strong/medium/weak 指纹表：GA4/AdSense/Clarity/Umami 账号 ID 相同 = strong；同一 `utm_source` 或共享 GTM 容器 = medium；**只有一条外链 = weak，不构成证据** |
| 4 广告 | [`demand-discovery.md`](../experiences/demand-discovery.md) 一·3：口径警告——数值不准，趋势与量级对，不进财务测算 |
| 5 两家打架 | [`validation-chain.md` ②·六·四](../demand-sources/validation-chain.md#②六四-semrush-的自然流量什么时候不能信先看它的词库分布再决定信不信总数) + [②·六](../demand-sources/validation-chain.md#②六-拆渠道时两个面板的口径必须各用各的不能交叉相减)：**Similarweb 默认全球，Semrush 只给一个国家库**。并排之前先看目标国占比（实测美国占比 21–39%，光这一条就是约 5 倍）。判断渠道构成用 Similarweb 自己的 channel mix，**不要跨面板相减**。差 >2 倍必须归因（地理？渠道口径？模型失真？） |
| 5 页数规划 | [`validation-chain.md` ②·七](../demand-sources/validation-chain.md#②七-别按词数规划页数查竞品的-sitemap看它用几页吃了多少词)：别按「词数」规划页数——查竞品 sitemap，看它**用几页吃了多少词** |
| 6 verdict | [`validation-chain.md`「十、候选验证链路」](../demand-sources/validation-chain.md#十候选验证链路)那四条：`estimateRatio > 2` → 两源打架，claimed「无法证实」，**不许引用较高的那个数**；`similarwebPerformanceVsChannelsRatio > 1.35` → 同一面板两张报表自相矛盾，两个原始字段都保留；自然占比 claimed 与面板差 ≤5pp 吻合 / ≤20 部分吻合 / 更大是反证；MRR 只在 `stripeVerifiedForThisDomain:true` 且 `claimedToVerifiedRatio ≤1.1` 才算证实——**Stripe 只证收入规模，不证「靠哪类页面/渠道赚的」** |
| 自有计数器 | [`demand-discovery.md`](../experiences/demand-discovery.md) 一·7：引用竞品页面上任何「实时数字」之前**先 `curl -sI` 看 `age` / `x-*-cache` / `cache-control`**——实测某站 Live Stats 三次不变，`age: 521292`（6 天前的缓存） |
| 站群里哪个是机会 | [`demand-sources/competitors-and-roots.md`](../demand-sources/competitors-and-roots.md#九二一个站背后的整个站群) 九·二末：价值在「哪几个赛道做成了、哪几个做了没跑起来」，**后者才是机会** |

### 省配额

| 档位 | 谁 |
|---|---|
| **旧独有入口** | `translatePage` / `translateAggregate` / `mineReport` 沿用旧站点不计每日配额口径；不代表官方积分余额，详见 `seo-webcafe.md` |
| **零配额** | `ads-transparency` · `site-network` · `sitemap-diff` · `boards`（浏览器但不计额度） |
| **官方 API 积分** | `stripe-referring` 官方分支每业务调用 1（全榜保留旧入口）；`payment-referrers serp` 每查询 2；以实时目录为准 |
| **官方 API 积分** | `domain-profile.mjs` 默认官方 `domain_overview`，当前 2 积分/域名（以官方目录为准），扣余额 |
| **面板配额** | 阶段 5 全部。**一个域名跑全 5 张 Similarweb 报表 + 4 张 Semrush 报表 = 9 次页面加载**，规模在阶段 0 定死 |
| **免费重跑的技巧** | `revenue-site-audit --from <已保存目录>` 离线重整，不重新取数 |
| **不要用** | `stripe-referring top --enrich` 的批量补总访问量（**每域名额外 2 积分**）——改用 `--visits <本地 JSON 映射>` |

### 收尾

- 跨源对照表 → `.rankup/decisions.md`。**每个数字四件套：来源面板 + 报告页 + as-of 日期 + 口径**；
  两源并排列出，**不做算术运算**，渠道行合计不得冒充 Performance 总访问
- 站群清单 → `.rankup/decisions.md`，逐个标「做成了 / 没跑起来」
- 原始采集文件留在 `rawFilesDir`（默认 `.rankup/evidence/demand/revenue-site-audit-<时间戳>/`），**不要清理**
- 非英语市场里查到的本地竞品（尤其三合一页面）→ 项目侧 `.rankup/competitors.md`（可选文件，模板见 [`project-memory.md`](../project-memory.md)）；文件不存在就照模板新建，不重新调研已收录过的竞品
- `.rankup/checks.md` 打勾 research-checklist 第四、五、六节

---

## 附 · 兄弟 Skill 在这条链路里的位置

全局装了一批 Skill，其中只有四个该进调研链路。**写死在这里，不要每次重新评估。** 这张表只定它们在调研链路里的位置；接与不接的取舍唯一源在 [`skill-ecosystem.md`](../skill-ecosystem.md)。

| Skill | 进不进 | 在哪一步用 | 硬约束 |
|---|---|---|---|
| **`/anysearch`** | **进** | P1 阶段 1f | 覆盖 capability-map「手工源」表里 turbo0 / IndieHackers / HuggingFace Trending / Arena.ai / StackOverflow / AppSumo / AlternativeTo 那几行——**它们没有脚本，此前只能靠人**。`batch_search` 一次并行多条；`extract` 取整页正文。**匿名可跑（已实测）**，零 rankup 配额 |
| **`/agent-reach`** | **进** | **P2 阶段 5（用户原话补充，按需）**、P1 阶段 1 补位、P4 阶段 7 | 覆盖 X / YouTube / B 站 / TikTok / V2EX / 小红书——rankup 只有 `reddit-wishes` 一个社区脚本，其余平台一个都没有。**只取原话，不出数字**；原话带来源、日期与链接 |
| **`/keyword-research`** | **半进** | P2 阶段 8，**只用第 4 相和第 7 相** | 它**没有任何数据源**（`Data Sources` 那节写明"Without tools, ask for seed keywords"）。它的第 5 相 Score 会凭空生成 volume 和 difficulty 1-100——那与 rankup「脚本只采集、数字必须有出处」的全部纪律直接冲突。**严禁跑它的 Score 相** |
| **`/deep-research`** | **半进** | P4 阶段 7、P1 用户提到陌生领域时 | 它是 WebSearch 的多角度方法论。**只用于赛道背景的定性理解**，产出不许进 `.rankup/keywords.md` 或任何带数字的表 |
| **`/opencli`** | **底座** | 所有需要真浏览器的阶段 | 会话纪律、`--window background` 默认、`close` 必须显式——`discipline.md`「浏览器与取数」一节已指向它，本文件不重复 |
| **`/backlink`** | **底座** | P2 阶段 2/3/7、P4 阶段 5 | Semrush / Similarweb / Tools Share 脚本的宿主。未装：`npx skills add $SKILLS_SOURCE --skill backlink -g -y` |
| `/ai-seo`、`/seo-geo`、`/seo-audit` | **不进** | — | 它们是**优化侧**（决定做了之后怎么做好），在调研阶段没有输入可给。立项之后才登场 |

---

## 维护契约

新增一个调研脚本或手工源时，**同时改四处**（少改一处，那条能力就只存在于那次对话里）：

1. [`capability-map.md`](../capability-map.md) —— 底账加一行
2. [`demand-sources.md`](../demand-sources.md) —— 源 → 脚本路由表加一行
3. [`research-checklist.md`](../research-checklist.md) —— 验收矩阵加一个勾选项
4. **本文件** —— 塞进 P1 / P2 / P4 中它真正该出现的那个阶段，标明并行/串行与配额档位

**只加进底账不加进本文件 = AI 知道有这个能力，但不知道什么时候跑它。**
