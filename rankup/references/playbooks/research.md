# 调研流水线（预制 playbook）

**这个文件回答一件事：用户丢来一句模糊的话，从下一秒开始该跑哪几条命令、按什么顺序、哪些并行。**

`SKILL.md` 的总路由表是**索引**（一句话 → 哪一段 → 哪个文件），
[`capability-map.md`](../capability-map.md) 是**底账**（有哪些能力），
[`research-checklist.md`](../research-checklist.md) 是**验收单**（跑完了没有，不是执行顺序）。
三者都不告诉你「先跑哪个、再跑哪个、谁能并行」——那是本文件。

读完本文件里对应的一节，**不需要再读第二个文档就能开跑**。判读环节才回去读判据文档。

## 怎么用

1. 用户开口 → 进 [P0 分流器](#p0--分流器只看他交给你的是什么)，**按输入分流，不问问题**。
2. 落到 P1 / P2 / P4 中的一条 → 跑它的 [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头)，再照着阶段表往下走。
3. 每个阶段表的列固定是：**阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办**。
4. 「并行」= **一条消息里派多个 sub agent**（`discipline.md` 执行纪律硬性要求）。
   「串行」= 上一阶段的产出是这一阶段的输入，或者它是配额站（见下方铁律三）。

**旧编号对照**（3.0 之前的项目笔记里会出现）：旧 P2「这个词能不能做」与旧 P3「扩词」
已合并成本文件的 **P2 词根调研**——用户给的任何词都是词根，「能不能做」与「扩成树」是同一条流水线的前后段，不是两条路。

### 路径变量（每个 sub agent 的 prompt 里都要带上这两行）

```bash
RANKUP=~/.agents/skills/rankup        # 本仓库开发时 = <repo>/rankup
BACKLINK=~/.agents/skills/backlink    # 本仓库开发时 = <repo>/backlink
```

**为什么必须写全路径**：Semrush / Similarweb / Tools Share 那一组脚本住在
`$BACKLINK/scripts/`，**不在 rankup 里**。`research-checklist.md` 里的命令已带 `backlink/scripts/` 前缀，
但旧项目笔记里仍有裸文件名（`semrush-keyword.mjs`），照抄会 `MODULE_NOT_FOUND`。

---

## 三条贯穿全部流水线的铁律

| # | 铁律 | 违反后长什么样 |
|---|---|---|
| 1 | **脚本只采集，判决由你下。** 2026-08-30 三波重构后，`revenue-site-audit` 不再出 verdict、`site-network` 不再出 strength、`keyword-value` 不再出 low/normal/high、`similarweb-query` 的 `belowFloor` 已改名 `noDataTextObserved`（观测事实，不是判决）。新脚本 `suggest.mjs` 同样不去重不打分。 | 把脚本某个字段当结论抄进报告，而那个字段现在只是「页面上写了一句话」 |
| 2 | **看到 0 条或空表，先开 `manifest.json`。** 落点 `.rankup/evidence/demand/<脚本>-<时间戳>/`。`sources` 里有任何一条非 `ok`，这次运行就不能当「真没需求」的证据；全 `ok` 且 `rawCount:0` 才允许读成真空态。`suggest.mjs` 里失败引擎是 `null` 不是 `[]`，就是为了让这两种情况长得不一样。 | 429 / CAPTCHA / 改版 / 超时全都产出 0 条，被写成「这个方向没人做」 |
| 3 | **一个配额工具只许有一个采集器。** Semrush / Similarweb 会话名固定（`semrush-nav` / `similarweb-nav`），**不要传 `--session`**；因此**同一时刻只能有一个 sub agent 在跑面板**。零配额源可以随便并行。 | 三个 agent 同时开 Similarweb → 触发上限，三个都拿不到数，且不报错 |

---

## 阶段 0 开工前 30 秒（每条流水线都以它开头）

**串行，主线自己跑，不派 agent。** 30 秒，决定后面整场调研的规模。

```bash
# ⓪ 先读项目记忆，别把上一轮 pass 掉的东西当新点子（没有 .rankup/ 的裸调研跳过这步）
grep -i "<词根>" .rankup/rejected.md .rankup/decisions.md .rankup/keywords.md 2>/dev/null
ls .rankup/research/ 2>/dev/null | grep -i "<词根>"     # 同词根有旧报告先读结论，再决定重跑哪几步

# ① seo.web.cafe 档位（脚本会自动把配额打在第一行；档位以脚本打印为准，不写死）
node $RANKUP/scripts/seo-webcafe.mjs tools 2>&1 | head -3

# ② 有哪些钥匙（决定哪些脚本今天能跑）
cut -d= -f1 $RANKUP/.env 2>/dev/null; env | grep -oE 'SERPER_API_KEY|GITHUB_TOKEN|GH_TOKEN|PRODUCTHUNT_TOKEN|REDDIT_CLIENT_ID|IGDB_CLIENT_ID|TABAPI_KEY'

# ③ 面板节点（只在这一轮确实要用 Semrush/Similarweb 时才跑，它自己不耗配额）
node $BACKLINK/scripts/tools-share-node.mjs list --tool semrush
node $BACKLINK/scripts/tools-share-node.mjs list --tool similarweb
```

**⓪ 命中否决清单怎么办（只有两种）**：直接跳过并在报告开头「已否决对照」段引用那一行；或者写明
「复活：<rejected.md 里的复活条件> 已于 <日期> 满足，证据 <链接>」再继续。**不允许默默重跑一遍然后得出和上次相反的结论**——
上次 pass 掉往往是因为意图撞词、量归了别的意思、或者商业上折不成钱，这些不会因为换了一天跑就变。
调研结束时，本轮 pass 掉的每个词/方向都要进 `rejected.md`（对象 / 类型 / 日期 / 一句理由 / 复活条件 / 证据链接），
只写「不做」不写理由的不算——下一轮的自己就是那个会重新捡起来的人。

**为什么是第一个动作**：2026-08-22 真实事故——整场调研按「匿名 10 次/日」规划、省着用、
少测 4 个词、报告写成「配额耗尽无法验证」，账号其实是 VIP 500/日、当天只用了 66 次。

**钥匙缺失时的降级路线（照抄，不要现想）**：

| 缺的钥匙 | 谁受影响 | 换成什么 |
|---|---|---|
| `SERPER_API_KEY` | `demand/serp-query.mjs` 完全跑不了 | `seo-webcafe.mjs serp --keyword "<词>"`（计 1 配额）；盘面构成仍以 P2 阶段 1 的人眼实勘为准 |
| `GITHUB_TOKEN` | `github-skill-search --mode code/recent` 不可用 | `--mode repo`（无 token 可跑）；`github-trending --source trending` 不受影响 |
| `PRODUCTHUNT_TOKEN` | 无 | `boards.mjs producthunt` 自动降级浏览器路径，**浏览器路径本来就更全** |
| `REDDIT_CLIENT_ID` | `reddit-wishes` 没有 score | 自动降级 RSS，能跑但慢（`--delay` 别低于 6000）；本机 Chrome 登录了 Reddit 时 auto 链会先走 opencli，全字段 |
| `IGDB_CLIENT_ID` | `game-newtitles --source igdb` | 换 `--source steam` / `steam-featured` / `itch` / `poki` |
| `TABAPI_KEY` | 无 | `aitdk-lookup` 默认 `--provider webcafe`，免费（但吃 seo.web.cafe 共享配额） |

**`suggest.mjs`、`word-roots.mjs`、`keyword-value.mjs`、`gt.py`、`seo-webcafe.mjs kgr/money` 不需要任何钥匙**——扩树与折算那半永远能跑。

**Similarweb / Semrush 的配额读数只在面板启动那一次刷新**，之后会话复用就不再刷新。
所以整场调研要用多少次面板，必须在阶段 0 定死，不能边跑边加。

---

## P0 · 分流器：只看他交给你的是什么

### 触发

「做个研究」「帮我调研一下」「调研一下这个关键词」「看看有什么能做的」「研究一下这块」「随便挖挖」

### 产出

一次分流判断 + 直接进入 P1 / P2 / P4 中的一条，**同一轮对话内就开始跑阶段 0**。
不产出「请问您想……」的选项清单。

### 分流规则：只看输入，三种形态

**唯一判据**：用户那句话里**他交给你的东西**是什么。他说出口的名词（「关键词」「长尾词」「赛道」）
是他要的结果，不是分流依据。这张表与 [`INDEX.md`](INDEX.md)「选哪条」表、`SKILL.md` 段 1 **必须三处一致**；
读到不一致，以本表为准并当场把另外两处改齐。

| 用户交给你的输入 | 直接去 | 不要问 |
|---|---|---|
| **一个词**——不管他叫它「关键词」「词根」「这个词」「方向」（"kd 这个词能做吗"、"调研一下 clipboard history 这个关键词"、"围绕 converter 挖长尾"、"想做个 PDF 转换的站"） | [P2 词根调研](#p2--词根调研这个词能不能做扩成树) | 别问"您想了解哪方面"——先搜、再扩树 |
| **别人的一个域名 / 竞品 / 帖子链接**（"这站月入 5k 真的吗"、"查查这个站"） | [P4](#p4--竞品调研--反查谁在赚钱) | 别问"要查哪些指标"——四件套全跑 |
| **什么都没有**（"不知道做什么"、"最近有什么能做的"、"帮我调研下关键词"——句子里一个词都没有） | [P1](#p1--挖需求--找方向--不知道做什么) | — |

**用户给的任何词都是词根，不是关键词。** 他说「调研一下这个关键词」，手里那个词依然是词根：
第一步拿它直接搜，第二步开枝散叶扩成树。**不存在「只查这一个词的 KD 然后回答能不能做」这条路**——
单个词的量和难度回答不了「这棵树值不值得进」。

#### 三种最容易判反的形态

| 用户原话 | 他给了什么 | 落点 | 为什么不是另一条 |
|---|---|---|---|
| 「**帮我调研下关键词**」「找几个关键词」（句子里没有具体的词） | **什么都没有** | **P1** | 「关键词」是他要的产出。P1 跑出候选后，每个候选再进 P2 |
| 「**研究下长尾词**」「帮我扩词」「我这站还能做什么词」（没给词根） | **一个扩词动作** | **P2**，从 [阶段 0.5](#阶段-05--词根从哪来没给词根时必跑) 反推词根 | 不是 P1：他已经锁定「在既有盘子里往外扩」。**没给词根不构成回退到 P1 的理由** |
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

## P1 · 挖需求 / 找方向 / 不知道做什么

### 触发

「不知道做什么」「找几个关键词」「挖点需求」「最近有什么能做的」「找个新方向」
「挖个新词的工具站」「有什么能做的方向」「找选题」「市场探测」「选品调研」

### 产出

1. `.rankup/decisions.md` —— 1–3 个候选方向，每个带：主词 + 支撑词矩阵（KD / 月搜 / CPC / SERP 盘面摘要）、竞品真实流量（Similarweb + Semrush **各标口径**）、收入估算区间、开发复杂度、量化的继续/停止标准。
2. `.rankup/keywords.md` —— 候选词表，每行带来源脚本 + 日期。
3. `.rankup/checks.md` —— [`research-checklist.md`](../research-checklist.md) 那张检查矩阵，逐项打勾。
4. **被排除的方向 + 排除理由（带数据）** 和 **数据局限性声明**（哪些没取到、为什么）——这两项不是可选的，见 research-checklist 第九节。

### 流水线

#### 第一小时最小可执行子集（面对 24 个脚本不要发呆，先跑这 6 个）

**全部零配额、零登录、零钥匙**，可以在**一条消息里派 6 个 sub agent 并行**。

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 1a | **并行 A** | `node $RANKUP/scripts/demand/stripe-referring.mjs top --new-only --limit 40 --json --out /tmp/r/stripe.json` | 本月**新进榜**的 Stripe 引荐域名 = 最强的「新机会」信号 | 不计配额，几乎不会失败；空了看 `months` 子命令确认榜单月份 |
| 1b | **并行 A** | `node $RANKUP/scripts/demand/boards.mjs trustmrr --board growth --limit 40 --json --out /tmp/r/mrr.json`<br>`node $RANKUP/scripts/demand/boards.mjs traffic-cv --type traffic --tab new --json --out /tmp/r/tcv.json` | TrustMRR 是 **Stripe 实连**（唯一能当数字用的收入源）；traffic.cv 是定性信号 | 需真实浏览器过 CF 质询，不需登录。失败带 `--keep-open` 保住现场 |
| 1c | **并行 A** | `node $RANKUP/scripts/demand/boards.mjs taaft --board requests-top --pages 2 --json --out /tmp/r/wish.json` | 许愿区**按票数排**——真实需求信号最强的一档 | 同上，CF 质询 |
| 1d | **并行 A** | `node $RANKUP/scripts/demand/reddit-wishes.mjs --subreddit SaaS,startups,SideProject,Entrepreneur --time month --limit 40 --json --out /tmp/r/reddit.json` | 用户**原话**（可直接当页面标题用） | 没 token 会走 RSS，`--delay` 别低于 6000，否则 429 |
| 1e | **并行 A** | `node $RANKUP/scripts/demand/hn-signals.mjs --mode ask --days 14 --limit 40 --json --out /tmp/r/hn.json`<br>`node $RANKUP/scripts/demand/github-trending.mjs --since weekly --limit 30 --json --out /tmp/r/gh.json` | 痛点讨论 + 唯一公开的 star 增速信号 | HN 走 Algolia，稳；GitHub trending 是公开 HTML |
| 1f | **并行 A** | `/anysearch` → `python3 ~/.agents/skills/anysearch/scripts/anysearch_cli.py batch_search --query "site:turbo0.com new tools" --query "huggingface trending spaces this week" --query "indie hackers revenue milestone 2026" --max_results 10` | 覆盖 **capability-map「手工源」表**里 turbo0 / IndieHackers / HuggingFace Trending / Arena.ai 那几行——它们**没有脚本**，此前只能靠人 | 匿名可跑（已实测）；要更高频率再配 `ANYSEARCH_API_KEY` |

**合流（串行，主线做）**：

```bash
mkdir -p /tmp/r && cat /tmp/r/*.json | jq -r '..|.domain? // empty' | sort -u > /tmp/r/candidates.txt
wc -l /tmp/r/candidates.txt
```

#### 第二小时起：候选池 → 域名画像 → 阈值初筛

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 2 | **串行**（吃 seo.web.cafe 共享配额） | `node $RANKUP/scripts/demand/aitdk-lookup.mjs --file /tmp/r/candidates.txt --out /tmp/r/profiles.jsonl --limit 60` | 每个域名的**注册日期 / 站龄 / 月访问 / 流量结构 / DR / 核心搜索词** | 带 `✗ HTTP 429/403` 的行 = 配额耗尽或被挡，**不是「该站没数据」**。加 `--via browser` 换高档配额，或次日重跑（`.jsonl` 可续跑，已取到的会跳过） |
| 3 | 串行，主线判读，**不跑脚本** | 对 `/tmp/r/profiles.jsonl` 套 [`demand-discovery.md`](../experiences/demand-discovery.md)「原帖给的阈值」：注册 <1 年 / 月访问 >3,000 / 搜索占比 >20% / 直接访问占比 >20% | 通常 60 个域名剩 0–2 个（**实测命中率约 300:1**，剩 0 个是正常结果，不是失败） | 剩 0 个 → 回阶段 1 换榜单源再来一轮，**不要放宽阈值**。阈值是可调的，但调之前要写明为什么调 |

#### 第三段：入选候选逐个走验证链路 → 进 P2

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 4 | **并行 B**（零配额那半） | 每个入选域名派一个 agent：<br>`node $RANKUP/scripts/demand/sitemap-diff.mjs --domain <域名> --all --slug-words --top-words 40`<br>`node $RANKUP/scripts/demand/site-network.mjs --domain <域名> --confirm --max 10 --json` | 它铺了哪些词族（slug 词频）、它背后还有哪些兄弟站 | `site-network` 空结果读成「这条路没找到」而不是「它没有兄弟站」——实测某组 10 个兄弟站没有一个共享指纹，绑住它们的是同一个 `utm_source` |
| 5 | **串行 · 独占面板**（铁律三） | **一个** agent 顺序跑完全部入选域名：<br>`node $BACKLINK/scripts/similarweb-query.mjs --domain <d> --report performance --out sw-<d>.json`<br>`node $BACKLINK/scripts/semrush-traffic.mjs --domain <d> --out semt-<d>.json`（**总访问口径，用来和上一行并排**）<br>`node $BACKLINK/scripts/semrush-overview.mjs --domain <d> --db <目标国> --out sem-<d>.json`（自然搜索口径，**不能和总访问裸比**） | 真实总访问、渠道构成 / 两家的总访问口径互证 / 单国家库自然流量 | `stable:false` 会直接抛错而不是给最后一次读数（**静默的错数比显式超时坏**）。失败前脚本已 `captureScene` 落截图+DOM 进 `--evidence-dir`，先开现场再下结论 |
| 6 | 与 5 并行（不同工具，不冲突） | `python3 $RANKUP/scripts/gt.py compare "<词1>" "<词2>" --geo <国> --time 12m` | 方向在涨还是在跌 | **全组连坐**：compare 里有一个词太冷，**整组**返回「没有数据」。处理顺序：先跑必然有量的词 → 逐个单跑 → 只把有量的进 compare。一次最多 5 个词 |
| 7 | 串行，本地零配额 | `node $RANKUP/scripts/seo-webcafe.mjs money --income 1000 --kws 5 --kd 30` | 目标收入需要多少 UV / 日搜索量 / 外链投入 / ROI | 纯本地计算，不会失败 |
| 8 | 串行 | 把每个存活候选的**主词当词根**交给 [P2](#p2--词根调研这个词能不能做扩成树) 走完整流水线 | 立项 / 否决 | — |

### 判读（每个阶段的结果对照哪份文档的哪一节）

| 阶段 | 判据在 |
|---|---|
| 1a/1b 收入信号 | [`demand-sources.md`](../demand-sources.md) 二「收入数字该信谁」：**TrustMRR 是 Stripe 实连（能当数字用），traffic.cv 是定性信号，Toolify 只说明「在收钱」**。三家域名集合几乎不相交，是互补候选池 |
| 1c/1d 用户原话 | [`experiences/demand-discovery.md`](../experiences/demand-discovery.md) 四·3「许愿句式」+ 四·2 高价值关键句（最值钱的一句是 `"I love this extension, but..."`） |
| 2/3 域名画像与阈值 | [`demand-sources.md`](../demand-sources.md) 十「常用的筛选阈值：判据在裁定集」→ [`demand-discovery.md`](../experiences/demand-discovery.md)；②·五「低 DR 站先查域名年龄」——**年龄 9–18 个月的高流量站是最强信号；<6 个月的低流量什么都不说明**（还在蜜月期） |
| 4 站群 | [`demand-sources.md`](../demand-sources.md) 九·二那张 strong/medium/weak 指纹表（**那是给你的判读指引，不是脚本输出**）。价值在「哪几个做成了、哪几个没跑起来」，后者才是机会 |
| 5 两个面板打架 | [`demand-sources.md`](../demand-sources.md) **②·六·四**：先拉排名词分布再决定信不信总数。第一大词占比 <20% 可信；**>50% 且位次 #5–#10 → 按高估 4–13 倍处理，以面板为准**；只有一套数时标「未验证」 |
| 6 趋势 | [`trends.md`](../trends.md) 〇「0-100 是组内归一化，必须双锚」——实测两个锚点系数差 1.33 倍，**Trends 相对刻度约 ±30% 失真，单锚必须报区间** |
| 7 折成钱 | [`demand-sources.md`](../demand-sources.md) **十·五**：低进入门槛恰恰是坏消息（没有护城河）；新进入者时间线在**加速**要读成「淘金潮末段」 |
| 元规则 | [`experiences/demand-discovery.md`](../experiences/demand-discovery.md) 〇「取数失败会伪装成一个否定答案」——**只有零需要被证明是零**：决定生死的零，必须换一种调用方式复查到两次一致 |

### 省配额

| 档位 | 这条链路里的谁 | 代价 |
|---|---|---|
| **零配额，放开跑** | 1a stripe-referring · 1e hn-signals / github-trending · 1f anysearch · 4 sitemap-diff / site-network · 6 gt.py · 7 money · `seo-webcafe.mjs kgr/string/money/email` | 只花时间。**并行度只受机器限制** |
| **零配额但要真浏览器**（过反爬，不需登录） | 1b boards trustmrr/traffic-cv · 1c taaft · reviews-mine 的 trustpilot/g2/capterra · chrome-stats | 每个源一个**描述性会话名**，跑完 `opencli browser <session> close`。sub agent 退出前必须显式关 |
| **吃 seo.web.cafe 共享池**（档位以阶段 0 脚本打印为准） | 2 aitdk-lookup（每域 1）· `kd`（每词 1，7 天缓存内免费）· `serp`（每次 1）· `payment-referrers serp`（每查询 1） | **整场规模在阶段 0 定死**。`--batch` 走保险丝间隔 |
| **面板配额，一次一个采集器** | 5 similarweb-query / semrush-overview / semrush-report / similarweb-keywords | 会话名固定，**不许并行**。`similarweb-batch` 单域 6–10 秒，可续跑 |
| **要钱的** | `aitdk-lookup --provider tabapi`（按 credit）· `serp-query`（serper 付费额度） | 有免费替代就别用：aitdk 默认 provider 是免费的 webcafe |

### 收尾

- 候选词表 → `.rankup/keywords.md`（每行带来源脚本 + 日期 + 引擎/国家）
- 方向级结论、排除理由、数据局限性 → `.rankup/decisions.md`
- [`research-checklist.md`](../research-checklist.md) 的检查矩阵复制进 `.rankup/checks.md` 并逐项打勾：
  **全部必做项 + 全部应做项 + 至少 3 个按需项**打完才算调研完成
- 证据目录留在 `.rankup/evidence/demand/`，**不要清理**——manifest 是下一轮判读的唯一依据

---

## P2 · 词根调研：这个词能不能做、扩成树

### 触发

「这个词能不能做」「调研一下这个关键词」「这词难不难」「值不值得进」「KD 才 12，能做吗」
「我想做个 XX 的站，行吗」「围绕 XX 挖点词」「帮我扩词」「研究一下长尾词」「我只有一个词根」
「这批词还能再扩吗」「我这站还能做什么词」

### 产出

1. `.rankup/research/<词根>-<YYYY-MM-DD>.md` —— 这棵树的完整报告，固定八节（见收尾）：国家与语种 / SERP 页面类型 / 扩树（两层） / 量·KD·CPC 表 / 筛子结果 / 社区验证 / 意图核验 / 折成钱。
2. `.rankup/keywords.md` —— 存活叶子逐行：`词 | 月搜 | KD | CPC | 意图 | 层级(根/L1/L2) | 来源 | 日期 | 口径(db/gl/hl)`。
3. `.rankup/decisions.md` —— 一行裁决：**「能排上去」与「排上去能赚多少钱」分开回答**，附意图核验结论与社区验证结论。
4. 一个**按量加权的 CPC**（扩树前 / 扩树后各一个）——唯一能揭穿「盘子更大了」这个假好消息的数字。

### 为什么社区验证必做：数据平台的 28 天盲区

> 盲区有两条补法，都在阶段 5：**社区**（Reddit / X / YouTube / B 站近 14 天）与 **Google Trends 短时窗口**（`gt.py compare <词> --time 1d|4h|1h`，小时级曲线，见 [`trends.md`](../trends.md)「短时窗口」）。新词单独查，别和大词同框——会被归一化压成 0。

Semrush / Similarweb / seo.web.cafe 这些面板给的月量，是**过去 28–30 天的滚动窗口**，且还要再滞后几天才更新。
一个昨天在 X 上炸开、前天在 YouTube 出了十条教程的词，在面板上**要么是 0，要么是上个月的老量**——
面板读不到「正在起来」。用户原话：「昨天火的词看不到」。

所以这条流水线里第 5 步（社区验证）**不是可选的补充信号，是与面板取量并列的第二条腿**：
面板回答「过去一个月有多少人搜」，社区回答「这两周有没有大量人在讨论」。两条腿都跑完才允许下结论。
只跑面板，会系统性地错过所有新起的词——而新起的词恰恰是新站唯一能抢到的。

### 流水线

**顺序固定：先搜（阶段 1），再扩（阶段 2），再取量（阶段 3）。** 反过来先取量再看 SERP，
量会先入为主，意图核验就成了走过场（[`lifecycle.md`](../lifecycle.md) 段 1 · 1.2 的教训）。

#### 阶段 0.5 · 词根从哪来（没给词根时必跑）

「研究下长尾词」「我这站还能做什么词」这类话里没有词根。**没给词根不是回退到 P1 的理由，也不是反问的理由**——
按下面的回退链把词根挖出来。**任何一档拿到 ≥3 个词根就停，进阶段 0。**前五档都不需要用户开口。

| 档 | 前提 | 跑什么 | 拿到什么 | 拿不到就下一档 |
|---|---|---|---|---|
| **a · 项目已有词表** | 在一个项目根里 | `test -f .rankup/keywords.md && head -80 .rankup/keywords.md` | 标「做」的那些词，直接就是词根；同时看到口径与日期 | 文件不存在 / 全是 ⬜ → b |
| **b · 项目定位** | `.rankup/` 存在 | `head -60 .rankup/PROJECT.md`；再 `head -40 .rankup/INDEX.md` | 定位与目标用户里的名词短语就是第一版词根 | `.rankup/` 不存在 → c |
| **c · 站点自己在打什么词**（**主力档**，和 [`site-review.md`](site-review.md) D1 同一招） | 手上有站点地址；**没有就先去 [`site-review.md` 阶段 0.0](site-review.md#阶段-00--站点地址从哪来先取址再体检)取址** | `node $RANKUP/scripts/seo-audit.mjs --sitemap <sitemap> --json > /tmp/k/audit.json`（**没有 `--out`**，用重定向）<br>`jq -r '.[].overview.title.text // empty' /tmp/k/audit.json \| sort \| uniq -c \| sort -rn \| head -30`<br>`jq -r '.[].headings[]? \| select(.level==1) \| .text' /tmp/k/audit.json \| sort \| uniq -c \| sort -rn \| head -30`<br>再 `node $RANKUP/scripts/seo-audit.mjs --sitemap <sitemap> --density-only`（全站聚合的 1/2/3-gram） | 全站 title/h1 里反复出现的名词短语 + 高频 2/3-gram = 站点**实际在打**的词 | 没有 sitemap 时改逐页：`node $RANKUP/scripts/seo-audit.mjs <url1> <url2> … --json`。全站抓不动 → d |
| **d · 从域名反查**（只有一个域名时） | 手上有域名 | `node $RANKUP/scripts/demand/sitemap-diff.mjs --domain <域名> --all --slug-words --top-words 40`（零配额）<br>`node $RANKUP/scripts/seo-webcafe.mjs mineSeed --input <站点URL>`（**不计配额**）<br>还不够再 `node $RANKUP/scripts/demand/aitdk-lookup.mjs <域名>`（**每域 1 配额**，出「核心搜索词」） | slug 词频里的词族 + 域名画像给的核心搜索词 | 全部空 → 先按 [铁律二](#三条贯穿全部流水线的铁律)开 manifest 分辨「采集失败」还是「站真的没内容」，再 e |
| **e · 转 P1 自造词根** | 什么都没有 | 直接跑 [P1 的第一小时子集](#第一小时最小可执行子集面对-24-个脚本不要发呆先跑这-6-个) 1a–1f，从榜单候选域名里挑 3–5 个同赛道站，再回本表 d 档对它们做 slug 词频 | 从真实需求信号里长出来的词根 | 这一档**不会失败**——1a/1e/1f 几乎不依赖任何前提 |
| **f · 只剩这一档才问** | 上面五档全落空 | 发一句话，**同一条消息里阶段 0 和 e 档已经在跑**，不等回答：「给我一个词根或者一个网址就行；没有的话我按 `<c/d/e 档里最像的那个方向>` 先跑一轮。」 | 一个词根，或者用户默认你的猜测 | 用户不回 → 按你自己反推出的方向跑下去，**不许停在这里等** |

反推出来的词根是「这个站现在在打的词」，不是「应该打的词」。写进 `.rankup/keywords.md` 时标来源 `阶段 0.5-<档>`，
阶段 2d 的竞品差集就是用来揭穿这批词根有多偏的。

#### 主流水线

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| **0 · 档位 + 定国家与语种** | 串行，主线 | [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头) 之后紧接着：<br>`python3 $RANKUP/scripts/gt.py region "<词根>" --time 12m --top 15`<br>对每个 over-index 的国家：`python3 $RANKUP/scripts/gt.py compare "<本地语词>" "<英语词>" --geo <国>`<br>把词根翻成该国语种（agent 自己翻，不用脚本） | 一张 `(gl, hl, db)` 三元组清单：**逐国查，每个国家一组**；每国一个「用本地语还是英语搜」的结论；每国一个本地语词根 | **市场是全球，不默认 us。** `--db` / `--gl` / `--hl` 三个参数后面每一步都要带，漏了会默默落到错误市场（`semrush-keyword` 不传 `--db` 落 `jp`）。region 空 → 词太冷或太新，先跑阶段 5 看社区，再定国家。判据 [`trends.md`](../trends.md) W1「印尼用户搜英语 remove background 压过本地语」 |
| **1 · 亲眼看 SERP**（在任何取数之前；**意图核验第一遍**） | **并行 C**，每个（引擎 × 国家）一个 agent | 沙箱浏览器（公开搜索**不需要**登录态），**无痕/隔离窗口 + 显式参数**：<br>Google `?q=<词根>&gl=<gl>&hl=<hl>`<br>Bing `?q=<词根>&mkt=<hl>-<GL>`<br>目标市场本地引擎（Naver / Yandex / 百度 / Seznam），非英语市场必做<br>有钥匙再补计数：`node $RANKUP/scripts/demand/serp-query.mjs "<词根>" --gl <gl> --json`，没钥匙 `node $RANKUP/scripts/seo-webcafe.mjs serp --keyword "<词根>"`（计 1） | 每个引擎的**七样**（[`demand-sources.md`](../demand-sources.md) 一·五）**外加一列「页面类型」**：前十每条是工具页 / 文章 / 商品 / 视频 / 论坛 / 维基 / 新闻 / 官方文档——**这一列就是这个词的真实意图**，阶段 6 要拿它对照 | **DuckDuckGo 不是独立样本**（结果主要来自 Bing 索引）。**不要用二手 SERP 接口代替人眼**：2026-08 起 Google 出站链接换成 `google.com/goto` 跳板，二手通道降级而接口照样 200。盘面里出现 DR 0–3 首页 → 对每个跑 `curl -s https://rdap.verisign.com/com/v1/domain/<域名> \| jq -r '.events[]\|select(.eventAction=="registration").eventDate'` + `aitdk-lookup <域名>`，**`dr:null` 不是 `dr<10`** |
| **2 · 扩树**（最多两层） | **并行 E**（2a–2c 零配额，一条消息三个 agent）→ **串行**（2d 独占面板） | **2a 本地模板**：`node $RANKUP/scripts/demand/word-roots.mjs list --grep <主题>`；`node $RANKUP/scripts/demand/word-roots.mjs expand <词根> --seeds a,b,c --json \| jq -r '.[]."候选串"' > /tmp/k/roots.txt`（**别用 `--out`**：它落 JSON 对象数组，下一步 `--seed-file` 按一行一个读，会把 `[`、`{` 当种子喂进面板，返回空且不报错）<br>**2b 三引擎下拉**：`node $RANKUP/scripts/demand/suggest.mjs "<词根>" --engine google,bing,ddg --hl <hl> --gl <gl> --json --out /tmp/k/suggest-L1.json`；要 26 个方向：`for c in {a..z}; do node $RANKUP/scripts/demand/suggest.mjs "<词根> $c" --hl <hl> --gl <gl> --json --out /tmp/k/soup-$c.json; done`<br>**2c 多语言**：每个国家用阶段 0 翻好的本地语词根把 2b 再跑一遍（`--hl ja --gl jp`）<br>**2d 面板相关词**（一个 agent 顺序跑）：`node $BACKLINK/scripts/similarweb-keywords.mjs --seed-file /tmp/k/roots.txt --tab relatedKeywords --out /tmp/k/sw-kw.jsonl --jsonl`（`--tab` 四选：`phraseMatch` / `relatedKeywords` **量最大** / `trending` / `questions` **专补问句**）；`node $BACKLINK/scripts/semrush-report.mjs --report keyword-magic --keyword "<词根>" --db <db>`；反查 3–5 个同赛道、站龄 9–24 个月的站 `node $BACKLINK/scripts/semrush-report.mjs --report organic-positions --domain <竞品> --db <db> --out /tmp/k/pos-<竞品>.json` 做差集<br>**第二层**：把第一层里过了阶段 4 筛子的叶子当新词根，再走一遍 2b + 2d（**只扩两层，到此为止**） | 一棵树：根 → L1 叶子（模板串 + 三引擎联想 + 面板相关词 + 竞品差集） → L2 叶子。三引擎的差集本身是信息（实测 Bing 独有 "not working"/"hotkey" 类问题串，Google 独有平台串） | **扩出来的是候选串，不是关键词**——没有量也没有难度。「我扩出了 300 个词」≠「找到 300 个词」。**停止条件**：某叶子在阶段 3 取到的月量低于筛子阈值、或 KD 高于阈值，**它不再往下扩**；整棵树最多两层。`suggest.mjs` 某引擎 `null` = 没取到（开 manifest），`[]` 才是真没联想。不知道竞品是谁：① `similarweb-query --report similar-sites`；② 阶段 1 前十里专门为该词做的独立站；③ `site-network.mjs --domain <已知竞品>` 拿兄弟站 |
| **3 · 取量 / KD / CPC** | **串行 · 独占面板**（铁律三），一个 agent 按国家逐库跑 | 初筛整棵树：`node $BACKLINK/scripts/semrush-keyword.mjs --kw-file /tmp/k/tree.txt --bulk --db <db> --out /tmp/k/kw-<db>.jsonl`（每个国家一次，100 词/次）<br>过筛叶子回单词模式：`node $BACKLINK/scripts/semrush-keyword.mjs --kw "<词>" --db <db> --out /tmp/k/kw-single.jsonl`（补 `globalVolume` / `byCountry`）<br>入选叶子逐个：`node $RANKUP/scripts/seo-webcafe.mjs kd --keyword "<词>" --gl <gl>`（每词 1，7 天缓存）<br>**量级交叉验证**（单词，决定生死时必做）：`node $RANKUP/scripts/seo-webcafe.mjs chat --ask "查一下 <词> 美国的月搜索量，以及全球搜索量"`（Google Ads 级精度，见 [`seo-webcafe.md`](../seo-webcafe.md)「SEO Agent 可以查关键词搜索量」）<br>本地折算：`node $RANKUP/scripts/demand/keyword-value.mjs --in /tmp/k/kw-<db>.jsonl --json` | 每片叶子的月量、`globalVolume`、KD、CPC、竞争密度、意图标签；top 9 盘面与 `linkBudget`；每个词的 CPC 与同批中位数之比 | **bulk 模式没有 `globalVolume` 也没有 `byCountry`**（恒为 null，不是查不到）。`--db` 别省。主指标不可用记 `volume:null + noData:true`，页面明确显示零才记 `volume:0`；`kd` 摘要行印「月搜 —」是**停止信号**不是「按 KD 走」。`cpc:null ≠ cpc:0`。**只有零需要被证明是零**：决定生死的零换一种调用复查到两次一致。**SEO Agent 搜索量核实的数据与 Google Ads Keyword Planner 完全一致**（2026-09-04 实测），Semrush 与 `kd` 的量级存疑时用它做仲裁 |
| **4 · 筛子** | 串行，主线判读，**不跑脚本** | 对阶段 3 的表逐行套两条（**本 playbook 裁定，来自用户硬规则**）：<br>① **月量太低且 CPC 低 → 直接否**：默认阈值 **月量 < 500 且 CPC 低于同批中位数**；做「精品工具页 + 关键词域名」时按 [`demand-discovery.md`](../experiences/demand-discovery.md) 二·规模化心得 2 放到「几千到一万出头就值得上」，做大站另换一套——**阈值写进报告第一节，改了要写为什么**<br>② **KD 分档**：<30 好上手（40 也可以看看）；30–70 看阶段 1 有没有新站信号（<18 个月新域名进前十）；>70 且无新站信号 → 淘汰。判据 [`trends.md`](../trends.md) W1「`score` <40 且 `keywordVolume` >1000 = 高价值蓝海」与 W2 第三步 | 存活叶子清单 + 每片叶子的档位；**存活叶子决定第二层扩不扩** | 全部叶子被筛掉 → 不是「这棵树死了」，先看阶段 3 的 manifest 与 `noData` 比例；面板 0 量的词**必须**经阶段 5 再判（28 天盲区）。导航类意图（品牌词）直接去掉——导航词抢不走 |
| **5 · 社区验证（必做，不许跳）** | **并行 G**（零配额，与阶段 3 同时开） | **先问一句要不要借浏览器**：Reddit / X / 小红书的采集后端是 OpenCLI，会在用户的 Chrome 里开标签页；用户没点头就只跑 HN、下拉、YouTube、B 站、V2EX、GitHub 与 Jina 读公开页这些纯 HTTP 通道，报告里写明跳过了哪个平台（判据 [`discipline.md`](../discipline.md) 五·5）。<br>**派 sub agent 跑这一步时，把本行「跑什么」整块原样贴进它的 prompt，并要求它产出四平台各一行状态**（2026-09-02 实盘：主线只写了「community demand signals」，子代理自己发挥，只跑了 Reddit 和 HN，X / YouTube / B 站一条没跑，报告里也没人发现）。<br>**Reddit 两个窗口对照**（脚本内部走 `opencli reddit search --site-session persistent`：整批复用一个 reddit.com 标签页，不再每次调用新开标签页导航首页；用户看到「一直刷新首页、从没搜索」是 v1.8.7-yan.3 及更早的行为；yan.4 起 `reddit search` 直接导航到这次查询的搜索结果页，标签页 URL 就是查询本身，搜索仍是页内 fetch）：<br>`node $RANKUP/scripts/demand/reddit-wishes.mjs --topic "<词根>" --time week --limit 40 --json --out /tmp/k/reddit-week.json`<br>`node $RANKUP/scripts/demand/reddit-wishes.mjs --topic "<词根>" --time month --limit 100 --json --out /tmp/k/reddit-month.json`<br>`node $RANKUP/scripts/demand/hn-signals.mjs --mode ask --q "<词根>" --days 14 --json`<br>**X / YouTube / B 站 / 小红书**走 `/agent-reach` 的命令组（下面四条 2026-09-03 在本机实跑通过；先 `agent-reach doctor --json` 看每个平台的 `active_backend`，doctor 说的优先）：<br>X：`opencli twitter search "<词根>" --limit 50 -f yaml --site-session persistent`（doctor 报 OpenCLI 后端时；`twitter search` 需要 twitter-cli 配好 cookie，没配会报 `not_authenticated`）<br>Reddit 补位（`reddit-wishes` 只抓许愿句式）：`opencli reddit search "<词根>" --limit 50 -f yaml --site-session persistent`<br>YouTube：`yt-dlp --dateafter now-14days --no-download --print "%(upload_date)s | %(title)s | %(view_count)s | %(webpage_url)s" "ytsearch30:<词根>"`（**不要加 `--flat-playlist`**，flat 模式拿不到 upload_date 全是 NA；`ytsearchdate` 前缀本版 yt-dlp 不支持；30 条要 1–2 分钟，空输出 = 前 30 条相关结果里没有 14 天内的，不是命令坏了）<br>B 站：`bili search "<词根>" --type video -n 50`（无需登录；B 站不要用 yt-dlp）<br>小红书 / V2EX：`opencli xiaohongshu search "<词根>" -f yaml`、`curl -s https://www.v2ex.com/api/topics/hot.json`<br>**搜索侧的短时信号**：`python3 $RANKUP/scripts/gt.py compare "<词根>" --time 1d`（24 小时、8 分钟一点）与 `--time 7d --raw`（7 天小时级），必要时 `related "<词根>" --time 1d` 看同期 rising 词；**新词单独查**，与大词同框会被归一化压成 0（2026-09-03 实跑：openclaw 与 chatgpt 同框全程 0，单独查 60 上下）。<br>没有登录态又不想开浏览器时，`/tuner` 的 social 端点是 API 替代；泛网页讨论用 `/anysearch` 的 `batch_search`；`/deep-research` 只做背景不出条数。按词根（含本地语词根）搜近 14 天的帖子/视频，逐条记 `平台 \| 日期 \| 标题 \| 互动数 \| 链接`，再取近 30 天做基线 | **四平台各一行**（Reddit / X / YouTube / B 站；做中文市场再加小红书）：`平台 \| 状态(ok/failed/skipped+原因) \| 近 14 天条数 / 日均 \| 前 30 天条数 / 日均`；以及最高互动的 3 条原话。**缺一行就是没做完**，不许只交 Reddit | **口径**：近 14 天有帖 **且** 14 天日均明显高于 30 天日均（≥2 倍）→ **新起话题**，面板 0 量不构成否决；14 天有帖但与 30 天持平 → 存量需求，以面板量为准；14 天无帖 → 先开 manifest（Reddit RSS 429 是常态），全 `ok` 才记「社区无讨论」。`/agent-reach` **只取原话不出数字**——条数由你数，写进报告时带链接。**只跑面板不跑这一步的报告不许下结论** |
| **6 · 意图核验**（与 [`lifecycle.md`](../lifecycle.md) 段 1 · 1.2 同名，独立成行） | 串行，主线判读，**不跑脚本** | 把三样东西并排：阶段 1 的**页面类型列**、阶段 5 的**原话**、阶段 3 的**意图标签**。问一句：**用户搜这个词时到底要什么？和我以为的一样吗？** | 一行结论：`意图核验：<词> 真实意图=<X>（SERP 前十 <n> 条是<页面类型>），我原以为=<Y>，一致/撞词` | **撞词案例（用户原话）**：以为「宠物诊断」是「测你内心是哪种动物」的娱乐测试，SERP 前十全是**给宠物看病**的兽医内容——两个意思共用一个串，面板月量全归了兽医意图，娱乐那个意思的真实搜索量极低。撞词时**把两个意思拆开各自估量**：拿阶段 2 的联想串看哪个意思占多数、拿阶段 5 的原话看社区在聊哪个；估不出就写「撞词，娱乐意图量未验证」，不许把总量当自己那个意思的量。医院案例见 lifecycle 6.2：量对、意图错，页面白建 |
| **7 · 折成钱**（不能跳过） | **串行 · 独占面板**（与阶段 3 同一个 agent 顺序跑）+ 本地 | ① 同类站真实流量：`node $BACKLINK/scripts/similarweb-query.mjs --domain <竞品> --report performance`；`node $BACKLINK/scripts/semrush-report.mjs --report organic-positions --domain <竞品> --db <db>`<br>② 本地折算（零配额）：`node $RANKUP/scripts/seo-webcafe.mjs money --income <目标$> --kws <存活叶子数> --kd <中位KD>`；`node $RANKUP/scripts/seo-webcafe.mjs kgr --volume <月搜> --intitle <allintitle 数> --kd <KD>`；`node $RANKUP/scripts/demand/keyword-value.mjs --in /tmp/k/kw-<db>.jsonl --json`（扩树后再算一次加权 CPC） | 同类站面板真实流量 → 收入区间；达到目标收入要的 UV / 日搜索量 / 外链投入 / ROI；KGR / EKGR / KDROI；扩树前后两个加权 CPC | 面板 `noDataTextObserved:true` 是观测事实（页面渲染出「没有此网站的数据」且连读三次一致），不是「流量小」。**扩完树加权 CPC 掉下来时，「盘子更大了」是假好消息**。CPC 是 U 型不是越高越好，参照系是这批词自己的中位数 |
| **7' · 趋势形状**（与 7 并行，不同工具） | 并行 | `python3 $RANKUP/scripts/gt.py compare "<词根>" "<参照词>" --geo <国> --time 5y`；`python3 $RANKUP/scripts/gt.py related "<词根>" --geo <国>` | 季节尖峰 / 长期衰退 / rising 飙升词（回填到树里） | 全组连坐，见 P1 阶段 6 |
| **8 · 收敛** | 串行，主线 | `/keyword-research` **只用第 4 相（意图分类）和第 7 相（聚簇）**，喂给它阶段 3 实测的量/KD/CPC | 意图标签 + pillar/cluster 骨架 | **严禁跑它的第 5 相 Score**：那个 skill 没有数据源，difficulty 与 volume 是编的。rankup 出数字，它只出分类骨架 |

### 判读

| 阶段 | 判据在 |
|---|---|
| 0 国家与语种 | [`trends.md`](../trends.md) W1 全部五步；[`demand-sources.md`](../demand-sources.md) 九·五「词根库全是英文，这是整个社群共同的盲区」 |
| 1 页面类型与盘面 | [`demand-sources.md`](../demand-sources.md) 一·五「SERP 盘面怎么读」：domainMatch 是启发式；精确域名命中多 → 成熟小生态，难度分往往低估；首页多 → 新站难插入，内页多 → 有缝。四类直接否的形状（[`demand-discovery.md`](../experiences/demand-discovery.md) 二·SOP 第 6 步）：搜索目标不可替代 / 引擎自己出答案 / 季节尖峰 / 对抗性工具。**首页全是新闻影视赛事成人 → 需求真实但不是工具需求，否**。低 DR 分叉：②·五「<6 个月低流量什么都不说明；9–18 个月高流量最强信号」 |
| 2 扩树 | [`demand-sources.md`](../demand-sources.md) 九·五「候选串 ≠ 关键词」；九·六「漏掉的三类构词」（泛型入口词 / 问句 / 拼写变体）与 4 条操作规则；九·七「跨平台自动补全」（Amazon 有而 Google 没有的常是高购买意图词）；九·六末「品牌截流词 KD 通常很低」 |
| 3 量 | [`demand-sources.md`](../demand-sources.md) ②·六·四（模型流量何时高估）；[`seo-webcafe.md`](../seo-webcafe.md)「月搜量必须配捕获率一起看」「零必须复查」 |
| 4 筛子 | 本 playbook 阶段 4 那两条（裁定）；[`experiences/webcafe-topics.md`](../experiences/webcafe-topics.md) 一~二「低 KD 不等于能做；词龄 >30 天且竞品域名 >20 天要考虑放弃」；[`demand-discovery.md`](../experiences/demand-discovery.md) 二·SOP 第 3 步「排除 NSFW；KD<30；导航类去掉」 |
| 5 社区验证 | 本 playbook 阶段 5 那条口径（14 天 vs 30 天日均）；[`demand-sources.md`](../demand-sources.md) 八「用户的原话」+ 28 天盲区那段；[`demand-discovery.md`](../experiences/demand-discovery.md) 四·3 许愿句式 |
| 6 意图核验 | [`lifecycle.md`](../lifecycle.md) 段 1 · 1.2「必须独立于搜索量做」；本 playbook 的宠物诊断撞词案例 |
| 7 钱 | [`demand-sources.md`](../demand-sources.md) 十·五 + [`demand-discovery.md`](../experiences/demand-discovery.md) 八·第六条：全绿指标下同类站真实流量几百–八千/月 = **$20–100/月**；搜索量→流量→收入两次折损各一个数量级。CPC 的 U 型：八「CPC 怎么读」。本地数值：[`seo-webcafe.md`](../seo-webcafe.md)「本地命令数值判读指引」 |
| 7' 趋势 | [`trends.md`](../trends.md) 〇「必须双锚」+ 〇·五「全组连坐」 |

### 省配额

一个词根跑完全套 = **seo.web.cafe 约 (存活叶子数 + 1) 次**（每叶 `kd` 1 + `serp` 1，若无 serper）+ **面板约 4–8 次**（每国 bulk 1 + 单词补跑 + 每竞品 1–2）。

| 档位 | 谁 |
|---|---|
| **零配额，放开跑** | 阶段 1 人眼实勘 · 2a `word-roots` · 2b/2c `suggest.mjs`（纯 HTTP，三引擎，不需要钥匙）· 5 `reddit-wishes` / `hn-signals` / `/agent-reach` · 7 `money` / `kgr` / `keyword-value` · 7' `gt.py` |
| **吃 seo.web.cafe 共享池** | 1 `serp`（每次 1）· 3 `kd`（每词 1，7 天缓存内免费，别为「刷新一下」加 `--force`） |
| **面板，一次一个采集器** | 2d `similarweb-keywords`（每个种子一次页面加载，`--settle` 默认 18 秒）· `semrush-report keyword-magic / organic-positions` · 3 `semrush-keyword`（bulk 100 词/次）· 7 `similarweb-query` |
| **省配额的关键动作** | **初筛用 bulk，入选才回单词模式**；**一次装一堆**：同一个面板窗口连续跑完所有国家库与所有竞品再关；阶段 1 人眼实勘完全不花配额而它最重要——省配额时砍二手 SERP，不砍实勘，**更不砍阶段 5** |

### 与全局 `/keyword-research` 的分工（写死，别每次重想）

| 谁 | 出什么 | 不许出什么 |
|---|---|---|
| **rankup（本 playbook）** | 所有**数字**：量、KD、CPC、盘面计数、竞品词库、加权 CPC、社区讨论条数 | — |
| **`/keyword-research`** | 意图分类骨架（第 4 相）、pillar/cluster 模板（第 7 相）、交付格式 | **任何量/难度/机会分**。它没有数据源，第 5 相 Score 的两个输入都是它自己编的 |

### 收尾

写 `.rankup/research/<词根>-<YYYY-MM-DD>.md`，八节固定，每节一张表或几行，**没跑的节写「未验证」不许留空**：

```
# <词根> 调研（YYYY-MM-DD）
## 1 国家与语种        (gl,hl,db) 清单 · 每国用本地语还是英语 · 筛子阈值及理由
## 2 SERP 页面类型      每引擎×每国前十的页面类型构成 + 七样
## 3 扩树              根 → L1 → L2；每片叶子标来源（模板/google/bing/ddg/面板/竞品差集）与层级；停在哪一层、为什么
## 4 量·KD·CPC         每叶一行，带口径(db/gl/日期)；bulk 与单词模式分开标
## 5 筛子结果           存活叶子 / 淘汰叶子 + 淘汰依据（哪条阈值）
## 6 社区验证           每平台：近 14 天条数·日均 / 前 30 天条数·日均 / 结论(新起/存量/无) / 3 条原话带链接
## 7 意图核验           真实意图 vs 我以为的；撞词则两个意思各自的量估计
## 8 折成钱             同类站面板真实流量(口径+日期) → $区间；money/kgr 输出；扩树前后加权 CPC
裁决：能排上去 <是/否/未验证，依据> ；排上去能赚 <$区间/未验证> ；下一步 <立项/否决/补哪一步>
```

再同步三处：`.rankup/keywords.md` 逐叶一行（带层级与口径）；`.rankup/decisions.md` 一行裁决；
`.rankup/checks.md` 打勾 [`research-checklist.md`](../research-checklist.md) 必做项（含 1.5 意图核验、3.7/3.8 社区验证）与第七节。

---

## P4 · 竞品调研 / 反查谁在赚钱

### 触发

「谁在赚钱」「反查这个站」「他还做了哪些站」「帖子说月入 X 是真的吗」「竞品调研」
「他排了哪些词」「这站流量哪来的」「竞品最近在做什么」

### 产出

1. `.rankup/decisions.md` —— 一份**跨源对照表**：每个数字带来源面板 + 报告页 + as-of 日期 + 口径（全球/国家库、总访问/自然流量），**并排列出，不做算术运算**
2. 一句明确的 verdict（证实 / 部分证实 / 无法证实 / 反证）**由你下**，附判据出处
3. 站群清单（如果有）+ 每个兄弟站「做成了 / 做了没跑起来」的分类——**后者才是机会**

### 流水线

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 0 | 串行 | [阶段 0](#阶段-0-开工前-30-秒每条流水线都以它开头) | 档位与钥匙 | — |
| **1 · 钱的信号** | **并行 F**（全部零配额或不计配额） | `node $RANKUP/scripts/demand/stripe-referring.mjs site --domain <域名>`<br>`node $RANKUP/scripts/seo-webcafe.mjs referringSite --domain <域名>`（**不计配额**）<br>`node $RANKUP/scripts/demand/boards.mjs trustmrr --board mrr --limit 60 --json` | 该域名在 Stripe 引荐榜的**在榜轨迹**（31 个月历史）；TrustMRR 上有没有它 | 不在 Stripe 榜 ≠ 没收钱——可能用长尾网关，去阶段 1' |
| **1' · 长尾网关**（Stripe 榜没有它时） | 并行 F | `node $RANKUP/scripts/demand/payment-referrers.mjs list`<br>`node $RANKUP/scripts/demand/payment-referrers.mjs serp <网关> --max-queries 2` | Creem / Lemon Squeezy / Paddle / Gumroad 等网关的引荐站 | `serp` 走 seo.web.cafe，**每查询 1 次配额**，`--max-queries` 默认 2 就是为了省。逐 query 记状态进 manifest，**查询失败 ≠ 没人引用** |
| **2 · 域名画像** | 并行 F | `node $RANKUP/scripts/demand/aitdk-lookup.mjs <域名>` | 注册日期 / 站龄 / 月访问 / 流量结构 / DR / 环比 / 核心搜索词 | `✗ HTTP 429/403` = 被挡，不是没数据 |
| **3 · 站群反查** | 并行 F | `node $RANKUP/scripts/demand/site-network.mjs --domain <域名> --confirm --max 25 --json --out net.json` | 同一主体运营的其它站 + 共同指纹 + 回访状态 | 脚本**只记事实不裁定强弱**。`revisit=fetch_failed` = 这次没看到，不是不共享指纹。**「无共同指纹」是站群的常态**（各站独立 GA4 / 埋点进 GTM 容器 / 服务端埋点），空结果读成「这条路没找到」 |
| **4 · 广告与供给侧** | 并行 F | `node $RANKUP/scripts/demand/ads-transparency.mjs creatives --domain <域名> --region US`<br>`node $RANKUP/scripts/demand/sitemap-diff.mjs --domain <域名> --all --slug-words --top-words 40` | 他在不在持续买流量（持续投放 = ROI > 1）；他用几页吃了多少词 | ads-transparency 不需要 token 不需要登录。**广告数值不准，趋势与量级对**（50K 真值 40K–60K），**不进任何财务测算** |
| **5 · 面板真实流量** | **串行 · 独占面板**（铁律三） | 一个 agent，一个会话，顺序跑完：<br>`node $BACKLINK/scripts/similarweb-query.mjs --domain <d> --report performance`<br>`--report channels` / `--report similar-sites` / `--report audience-geo` / `--report site-keywords`<br>**`node $BACKLINK/scripts/semrush-traffic.mjs --domain <d>`** ← 这一条是口径对齐的关键<br>`node $BACKLINK/scripts/semrush-overview.mjs --domain <d> --db <目标国>`<br>`node $BACKLINK/scripts/semrush-report.mjs --report organic-positions --domain <d> --db <目标国>`<br>`--report organic-pages` / `--report backlinks-overview` | 总访问 + 渠道构成 + 相似站 + 地理分布 + 站点词 / **Semrush 侧的总访问量口径（.Trends）** / 单国家库自然流量 + 排名词 + 主要页面 + 反链 | **两家「差三倍」多半是拿错了数**：`semrush-overview` 给的是**自然搜索**估算，Similarweb 给的是**总访问**，本来就不同量级。要并排就用 `semrush-traffic.mjs` 的 .Trends 总访问——2026-08-28 实测某大站两家差 2.4%。（该脚本 `--window` 默认 **foreground**，全仓唯一例外：这张报表在后台标签页里不水合。）<br>**只有 performance 报表有结构化 metrics**——在渠道页上跑 deriveMetrics 会把筛选器文字当数值抓（实测 globalRank 抓成 1）。<br>`organic-pages` 从 URL 后方读当前行（旧版向前读会整体错位）。<br>**一次装一堆**：同一个面板窗口跑完所有域名再 close |
| **6 · 薄编排复核**（帖子声称数字时） | 串行，在 5 之后 | `node $RANKUP/scripts/demand/revenue-site-audit.mjs --domain <域名> --source-url <帖子链接> --claimed-visits <n> --claimed-organic-share <pct> --claimed-mrr <n> --keyword <主词> --db <目标国> --out audit.json` | 各源原始对照数据 + 倍差事实，**不含 verdict** | 它顺序调用现有 AITDK / Similarweb 两张报表 / Semrush / sitemap / KD 脚本。`--from <目录>` 可离线重整已保存的原始文件（**不重跑不再花配额**）。原始文件全保留在输出的 `rawFilesDir` |
| **7 · 定性背景**（可选，判断「他为什么能起来」） | 并行，与 5/6 无冲突 | `/deep-research` 或 `/agent-reach`：查这个品牌/产品在 Reddit / X / 小红书 / 播客里的讨论<br>`node $RANKUP/scripts/webcafe-forum.mjs chat-search "<品牌或赛道>"` | 叙事与打法（社群里有没有人拆过它） | **这一步只出定性叙事，不出任何数字**。哥飞社区那条**优先于问 AI**：`chat-search` 拿的是群聊归档原文，不经模型转述、零 AI 额度。**匿名不报错，只把正文抹成空串** |
| 8 | 串行 | 他排的头部词当**词根**进 [P2](#p2--词根调研这个词能不能做扩成树)，看这棵树自己能不能进 | 立项 / 否决 | — |

### 判读

| 阶段 | 判据在 |
|---|---|
| 1 收入源 | [`demand-sources.md`](../demand-sources.md) 二「收入数字该信谁」：TrustMRR = Stripe 实连（可当数字）；traffic.cv = 定性；Toolify 只说明「在收钱」。派生指标 `到达付费页比例 = Stripe 引荐 ÷ 总访问`（实测算例 ≈8.60%），**榜上的是优等生，保守按 1% 折算** |
| 3 站群 | [`demand-sources.md`](../demand-sources.md) 九·二 strong/medium/weak 指纹表：GA4/AdSense/Clarity/Umami 账号 ID 相同 = strong；同一 `utm_source` 或共享 GTM 容器 = medium；**只有一条外链 = weak，不构成证据** |
| 4 广告 | [`demand-discovery.md`](../experiences/demand-discovery.md) 一·3：口径警告——数值不准，趋势与量级对，不进财务测算 |
| 5 两家打架 | [`demand-sources.md`](../demand-sources.md) **②·六·四** + **②·六**：**Similarweb 默认全球，Semrush 只给一个国家库**。并排之前先看目标国占比（实测美国占比 21–39%，光这一条就是约 5 倍）。判断渠道构成用 Similarweb 自己的 channel mix，**不要跨面板相减**。差 >2 倍必须归因（地理？渠道口径？模型失真？） |
| 5 页数规划 | [`demand-sources.md`](../demand-sources.md) **②·七**：别按「词数」规划页数——查竞品 sitemap，看它**用几页吃了多少词** |
| 6 verdict | [`demand-sources.md`](../demand-sources.md) 第十节那四条：`estimateRatio > 2` → 两源打架，claimed「无法证实」，**不许引用较高的那个数**；`similarwebPerformanceVsChannelsRatio > 1.35` → 同一面板两张报表自相矛盾，两个原始字段都保留；自然占比 claimed 与面板差 ≤5pp 吻合 / ≤20 部分吻合 / 更大是反证；MRR 只在 `stripeVerifiedForThisDomain:true` 且 `claimedToVerifiedRatio ≤1.1` 才算证实——**Stripe 只证收入规模，不证「靠哪类页面/渠道赚的」** |
| 自有计数器 | [`demand-discovery.md`](../experiences/demand-discovery.md) 一·7：引用竞品页面上任何「实时数字」之前**先 `curl -sI` 看 `age` / `x-*-cache` / `cache-control`**——实测某站 Live Stats 三次不变，`age: 521292`（6 天前的缓存） |
| 站群里哪个是机会 | [`demand-sources.md`](../demand-sources.md) 九·二末：价值在「哪几个赛道做成了、哪几个做了没跑起来」，**后者才是机会** |

### 省配额

| 档位 | 谁 |
|---|---|
| **不计配额**（seo.web.cafe 明确不扣） | `referring` / `referringMonth` / `referringSite` · `translatePage` · `translateAggregate` · `mineReport` |
| **零配额** | `stripe-referring` · `ads-transparency` · `site-network` · `sitemap-diff` · `boards`（浏览器但不计额度） |
| **吃 seo.web.cafe 共享池** | `aitdk-lookup`（每域 1）· `payment-referrers serp`（每查询 1） |
| **面板配额** | 阶段 5 全部。**一个域名跑全 5 张 Similarweb 报表 + 4 张 Semrush 报表 = 9 次页面加载**，规模在阶段 0 定死 |
| **免费重跑的技巧** | `revenue-site-audit --from <已保存目录>` 离线重整，不重新取数 |
| **不要用** | `stripe-referring top --enrich` 的批量补总访问量（**吃配额**）——改用 `--visits <本地 JSON 映射>` |

### 收尾

- 跨源对照表 → `.rankup/decisions.md`。**每个数字四件套：来源面板 + 报告页 + as-of 日期 + 口径**；
  两源并排列出，**不做算术运算**，渠道行合计不得冒充 Performance 总访问
- 站群清单 → `.rankup/decisions.md`，逐个标「做成了 / 没跑起来」
- 原始采集文件留在 `rawFilesDir`（默认 `.rankup/evidence/demand/revenue-site-audit-<时间戳>/`），**不要清理**
- `.rankup/checks.md` 打勾 research-checklist 第四、五、六节

---

## 附 · 兄弟 Skill 在这条链路里的位置

全局装了一批 Skill，其中只有四个该进调研链路。**写死在这里，不要每次重新评估。**

| Skill | 进不进 | 在哪一步用 | 硬约束 |
|---|---|---|---|
| **`/anysearch`** | **进** | P1 阶段 1f | 覆盖 capability-map「手工源」表里 turbo0 / IndieHackers / HuggingFace Trending / Arena.ai / StackOverflow / AppSumo / AlternativeTo 那几行——**它们没有脚本，此前只能靠人**。`batch_search` 一次并行多条；`extract` 取整页正文。**匿名可跑（已实测）**，零 rankup 配额 |
| **`/agent-reach`** | **进** | **P2 阶段 5（社区验证，必做）**、P1 阶段 1 补位、P4 阶段 7 | 覆盖 X / YouTube / B 站 / TikTok / V2EX / 小红书——rankup 只有 `reddit-wishes` 一个社区脚本，其余平台一个都没有。**只取原话，不出数字**；近 14 天条数由你数、带链接 |
| **`/keyword-research`** | **半进** | P2 阶段 8，**只用第 4 相和第 7 相** | 它**没有任何数据源**（`Data Sources` 那节写明"Without tools, ask for seed keywords"）。它的第 5 相 Score 会凭空生成 volume 和 difficulty 1-100——那与 rankup「脚本只采集、数字必须有出处」的全部纪律直接冲突。**严禁跑它的 Score 相** |
| **`/deep-research`** | **半进** | P4 阶段 7、P1 用户提到陌生领域时 | 它是 WebSearch 的多角度方法论。**只用于赛道背景的定性理解**，产出不许进 `.rankup/keywords.md` 或任何带数字的表 |
| **`/opencli`** | **底座** | 所有需要真浏览器的阶段 | 会话纪律、`--window background` 默认、`close` 必须显式——`discipline.md`「浏览器与取数」一节已指向它，本文件不重复 |
| **`/backlink`** | **底座** | P2 阶段 2d/3/7、P4 阶段 5 | Semrush / Similarweb / Tools Share 脚本的宿主。未装：`npx skills add yan-labs/yan-skills --skill backlink -g -y` |
| `/ai-seo`、`/seo-geo`、`/seo-audit` | **不进** | — | 它们是**优化侧**（决定做了之后怎么做好），在调研阶段没有输入可给。立项之后才登场 |

---

## 维护契约

新增一个调研脚本或手工源时，**同时改四处**（少改一处，那条能力就只存在于那次对话里）：

1. [`capability-map.md`](../capability-map.md) —— 底账加一行
2. [`demand-sources.md`](../demand-sources.md) —— 源 → 脚本路由表加一行
3. [`research-checklist.md`](../research-checklist.md) —— 验收矩阵加一个勾选项
4. **本文件** —— 塞进 P1 / P2 / P4 中它真正该出现的那个阶段，标明并行/串行与配额档位

**只加进底账不加进本文件 = AI 知道有这个能力，但不知道什么时候跑它。**
