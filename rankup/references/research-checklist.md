# 需求调研验收清单

**本清单是段 1「调研」的验收单——每次调研（词根、选题、竞品、赛道）收尾时逐项对照，勾不满不算完成。**

> **本文件是验收单，不是执行顺序，也不是入口。** 「一句话进来 → 先跑哪条命令、哪些能并行、
> 谁的产出喂给谁」在 [`playbooks/research.md`](playbooks/research.md)
> （3 条预制流水线 P1 / P2 词根调研 / P4 + 1 个分流器）。**先照 playbook 跑，跑完回本清单逐项打勾。**
> 下面各节的编号是勾选项的编号，不是先后顺序；只有两条硬先后写在使用规则里。

> **脚本路径**：`seo-webcafe.mjs` / `gt.py` / `webcafe-forum.mjs` 在 `<rankup>/scripts/`，
> `demand/*` 在 `<rankup>/scripts/demand/`，
> **Semrush / Similarweb / Tools Share 那一组在 `<backlink>/scripts/`——不在 rankup 里**，
> 第三～七节里已把它们写成 `backlink/scripts/<文件>`，照抄时把 `backlink/` 换成你机器上的 `$BACKLINK`。

不是建议，不是最佳实践。跳过任何一节，调研结论就少一个维度的验证，
而缺维度的调研最危险的失败形态是「每一项都对，结论整个是错的」。

**平台适用范围**：App候选按 `playbooks/research.md` App市场验证分支与 `demand-sources.md` App证据表验收。公开网页搜索仍保留；以下KD、网页月量、站找词、网站流量折算只裁决Web获客，不作为App市场通过前置条件。不适用项记N/A及理由；只要声称SEO量或网页收益，对应项仍必做。

## 使用规则

1. **每次调研收尾时打开本清单，做完一项勾一项。** 状态记在项目的 `.rankup/checks.md` 段 1 下。
2. **执行顺序由 playbook 定，本清单只守两条硬先后**：第一节（亲眼看）必须在取数之前；
   第六节（折成钱）必须在宣布结论之前。其余节之间没有顺序含义。
3. **每个工具的输出都要落盘。** 跑完没存证据 = 没跑。落盘路径统一写进 `.rankup/keywords.md`
   或 `.rankup/decisions.md`，带日期。
4. **配额前置检查。** 开工第一个动作：确认 seo.web.cafe 档位（脚本自动打印）、
   Semrush/Similarweb 节点可用性（`<backlink>/scripts/tools-share-node.mjs list --tool semrush`
   与 `--tool similarweb`，`--tool` 是必填的；`list` 本身不点「打开」，不消耗任何节点配额）。
   同时确认钥匙（`cut -d= -f1 <rankup>/.env`）：缺 `SERPER_API_KEY` 时 `demand/serp-query.mjs`
   完全跑不了，缺 `GITHUB_TOKEN` 时 `github-skill-search` 只剩 `--mode repo`——
   逐条降级路线见 [`playbooks/research.md`](playbooks/research.md) 阶段 0 那张表。
   不要查到一半发现没配额了。

---

## 第一节 · 亲眼看搜索结果首页（在任何取数之前）

**所有取数工具给的都是二手结论。搜索结果首页是搜索引擎此刻真正端给用户的东西。这一步在最前面，不是补充材料。**

| 步骤 | 工具 | 输出 | 备注 |
|---|---|---|---|
| 1.1 Google 搜索（无痕，显式 gl/hl） | 沙箱浏览器（公开搜索不需要登录态） | 七样记录（见下） | 必做 |
| 1.2 Bing 搜索（无痕，显式 mkt） | 沙箱浏览器 | 七样记录 | 必做 |
| 1.3 目标市场本地引擎 | 沙箱浏览器 | 七样记录 | 非英语市场必做 |
| 1.4 AI 搜索（AI Overviews / Perplexity） | 沙箱浏览器 | 引用了谁 | 推荐 |
| 1.5 **意图核验**（与 [`lifecycle.md`](lifecycle.md) 段 1 · 1.2 同名） | 1.1–1.3 记下的**页面类型列** + 社区原话（3.7/3.8） | 一行：`真实意图=<X>（前十 <n> 条是<页面类型>），我以为=<Y>，一致/撞词` | **必做**，独立于搜索量成行；撞词时两个意思各自估量 |

**「七样记录」是什么、每样回答什么问题、写进哪个文件，见
[`demand-sources.md`](demand-sources.md) 的「每个引擎记下这七样」一节**——
那是这张表的唯一权威版本，此处不复制，改判据只改那边。
七样之外，**每条结果多记一列「页面类型」**（工具页 / 文章 / 商品 / 视频 / 论坛 / 维基 / 新闻），
1.5 就是拿这一列对照词根字面——撞词案例（「宠物诊断」字面像娱乐测试，SERP 全是兽医）在
[`playbooks/research.md`](playbooks/research.md) P2 阶段 6。

**引擎之间不一致本身就是结论，必须写出来。**

---

## 第二节 · KD + SERP 盘面分析

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 2.1 关键词难度 + Top 9 盘面 | `seo-webcafe.mjs` | `kd --keyword "<词>"` | KD 分、top 9 结果的 DR / 首页内页 / 专营非专营、引用域中值 |
| 2.2 批量词的 KD | `seo-webcafe.mjs` | `kd --batch <file>` | 同上，批量 |
| 2.3 KGR / EKGR / KDROI 计算 | `seo-webcafe.mjs` | `kgr --volume <n> --intitle <n> --kd <n>` | 纯本地，零配额 |

**判断读 [`webcafe-topics.md`](experiences/webcafe-topics.md) 一~二：低 KD 不等于能做；词龄 >30 天且竞品域名 >20 天要考虑放弃。**

---

## 第三节 · 搜索量验证（量 / KD / SERP 数据的三角校验）

**只有零需要被证明是零。** KD 工具返回「月搜 —」的词，必须用第二个源核实。

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 3.1 Semrush 关键词概览（单词，含全球量） | `backlink/scripts/semrush-keyword.mjs` | `--kw "<词>" --db <目标国>` | Volume, globalVolume, KD, CPC, 竞争密度, 意图, byCountry |
| 3.2 Semrush 批量搜索量 | `backlink/scripts/semrush-keyword.mjs` | `--kw-file words.txt --bulk --db <目标国>` | Volume, KD, CPC（**bulk 模式无 globalVolume**） |
| 3.3 多国家库搜索量 | `backlink/scripts/semrush-keyword.mjs` | `--kw "<词>" --db <cc>` 逐国跑 | 市场是全球：入选词必须逐国查，**不默认 us** |
| 3.4 Google Trends 趋势方向 | `gt.py` | `compare <词1> <词2> ...` | 12 个月热度曲线，判断涨还是跌 |
| 3.5 Google Trends 地区分布 | `gt.py` | `region <词>` | 哪些国家/州有需求（P2 阶段 0 定国家用它） |
| 3.6 Google Trends 相关飙升词 | `gt.py` | `related <词>` | rising 飙升词 = 新机会信号 |

**3.1 和 3.2 的区别**：单词模式有 `globalVolume` 和 `byCountry`（全球口径），bulk 模式没有。
入选词用单词模式跑全球量，初筛阶段用 bulk 批量跑。`--db` 不传会默默落到 `jp`，别省。

---

## 第三·五节 · 社区验证（补面板的 28 天盲区，必做）

**面板月量是过去 28–30 天的滚动窗口，还要再滞后几天——昨天火的词在面板上要么是 0，要么是老量。**
社区回答的是面板答不了的那个问题：这两周有没有大量人在讨论。只跑面板不跑本节，报告不许下结论。

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 3.7 Reddit 近 7 天 vs 近 30 天 | `demand/reddit-wishes.mjs` | `--topic "<词根>" --time week --json` 与 `--time month --json` 各跑一次 | 两个窗口的条数与日均；最高互动的 3 条原话 |
| 3.8 X / YouTube / B 站近 14 天 | `/agent-reach` | 按词根（含本地语词根）搜近 14 天帖子/视频，再取 30 天做基线 | 每平台：`14 天条数·日均 / 30 天条数·日均 / 3 条原话带链接`；条数由你数，agent-reach 只取原话 |
| 3.9 HN 近 14 天 | `demand/hn-signals.mjs` | `--mode ask --q "<词根>" --days 14 --json` | 痛点讨论条数 |

**口径（写死）**：近 14 天有帖 **且** 14 天日均 ≥ 30 天日均的 2 倍 → **新起话题**，面板 0 量不构成否决；
有帖但持平 → 存量需求，以面板量为准；无帖 → 先开 manifest（Reddit RSS 429 是常态），全 `ok` 才记「社区无讨论」。

---

## 第四节 · 竞品站真实流量（Similarweb + Semrush 域名维度）

**这一节回答「排上去之后一个月有多少人来」。不跑这一节就只有 SEO 结论，没有商业结论。**

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 4.1 Similarweb 总流量 + 渠道构成 | `backlink/scripts/similarweb-query.mjs` | `--domain <d> --report performance` | 总访问量（全球）、渠道构成、跳出率、人均页面数 |
| 4.2 Similarweb 相似站 | `backlink/scripts/similarweb-query.mjs` | `--domain <d> --report similar-sites` | 同类站清单（扩大候选池） |
| 4.3 Similarweb 受众地理 | `backlink/scripts/similarweb-query.mjs` | `--domain <d> --report audience-geo` | 流量国家分布 |
| 4.4 Similarweb 站点关键词 | `backlink/scripts/similarweb-query.mjs` | `--domain <d> --report site-keywords` | 该站排了哪些词 |
| 4.5 Similarweb 批量域名流量 | `backlink/scripts/similarweb-batch.mjs` | `--domains-file d.txt --out out.jsonl` | 批量快筛。**单域名 6-10 秒不是节流间隔，是「读数稳定」要花的时间**：脚本没有固定 sleep，它按 `--stable-interval`（默认 3 秒）反复读页面，要连续 2 次读数一致才收（判成空态要连续 3 次），所以下限约 6 秒、空态约 9 秒；渲染慢的站按 `--domain-timeout`（默认 75 秒）封顶后记成未完成 |
| 4.6 Semrush 域名概览（整页 23 区块） | `backlink/scripts/semrush-overview.mjs` | `--domain <d>`（全球库）或 `--domain <d> --db <目标国>`（该国） | 自然/付费流量估算、引荐域数、自然/付费关键词数、AI 可见度、按国家分布、反向链接明细；口径核对写进 `scopeEvidence`，`status: complete` 才算数，超时或口径读不出/不符是 `incomplete`；全球库下关键词表/竞争对手/广告区块属于独立国家分组，要用就加 `--organic-db <国家>`，看 `sectionScopes` |
| 4.7 Semrush 排名词报表 | `backlink/scripts/semrush-report.mjs` | `--report organic-positions --domain <d> --db <目标国>` | 该站排了哪些词、每个词的位次 |
| 4.8 Semrush 主要页面 | `backlink/scripts/semrush-report.mjs` | `--report organic-pages --domain <d> --db <目标国>` | 哪些页面吃了最多流量 |
| 4.9 Semrush 反链概览 | `backlink/scripts/semrush-report.mjs` | `--report backlinks-overview --domain <d> --db <目标国>` | 外链数、引荐域分布 |
| 4.10 Semrush 批量域名自然流量 | `backlink/scripts/semrush-batch.mjs` | `--domains-file d.txt --out out.jsonl --db <目标国>` | 批量快筛 |
| 4.11 Semrush 总访问口径（与 4.1 并排用） | `backlink/scripts/semrush-traffic.mjs` | `--domain <d>` | .Trends 总访问——和 Similarweb 同量级，`semrush-overview` 的自然流量不能和总访问裸比 |

### 口径对齐规则（强制）

- **Similarweb 默认全球，Semrush 只给一个国家库。** 并排放之前先看目标国占比。
- **判断渠道构成用 Similarweb 自己的 channel mix**（它内部自洽），不要跨面板相减。
- **Semrush 自然流量占比 >50% 来自单个大词且位次在 #5–#10** → 按高估 4–13 倍处理，以面板为准。
- 两源标各自口径并排列出，不做算术运算。差 >2 倍时必须归因（地理范围？渠道口径？模型失真？）。

---

## 第五节 · 收入信号验证

**钱流过去了，不需要再猜需求成不成立。**

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 5.1 Stripe 引荐流量榜 | `seo-webcafe.mjs` | `referringMonth --m YYYYMM` | 域名、月引荐量、名次、份额、环比（**不计配额**） |
| 5.1b **本月新进榜的域名** | `demand/stripe-referring.mjs` | `top --new-only --limit 40` | 只留 `isNew` 的域名——**最强的「新机会」信号**，5.1 的原始端点给不了这个筛选 |
| 5.2 单域名 Stripe 在榜历史 | `seo-webcafe.mjs` | `referringSite --domain <d>` | 在榜轨迹（**不计配额**） |
| 5.2b 同上（带派生指标） | `demand/stripe-referring.mjs` | `site --domain <d>` | 在榜轨迹 + 到达付费页比例；`top --enrich` **吃配额**，改用 `--visits <本地JSON>` |
| 5.3 traffic.cv 流量榜 | `boards.mjs` | `traffic-cv --type traffic --tab new` | 名次、域名、月访问量、域名注册时间 |
| 5.4 traffic.cv 收入榜 | `boards.mjs` | `traffic-cv --type revenue --tab top` | Stripe 结账量排名 |
| 5.5 TrustMRR 实连收入 | `boards.mjs` | `trustmrr --board mrr` | MRR（Stripe 实连，唯一能当数字用） |
| 5.6 TrustMRR 增长榜 | `boards.mjs` | `trustmrr --board growth` | 30 天增速排名 |
| 5.7 收入目标拆解 | `seo-webcafe.mjs` | `money --income <$> --kws <n> --kd <n>` | 反推所需 UV / 日搜索量 / 外链投入（纯本地，零配额） |

**三个源给的「收入」不是一回事：TrustMRR 是 Stripe 实连（能当数字用），traffic.cv 是定性信号，Toolify 只能说明「在收钱」。三家域名集合几乎不相交，是互补候选池。**

---

## 第六节 · 折成钱（第四道闸门，不能跳过）

**量 / KD / SERP 窗口三道闸全过之后，还有第四道——查同类站的真实流量并折成钱。**

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 6.1 竞品真实流量 → 收入区间 | `seo-webcafe.mjs` | `money --income <目标>` | 需要多少 UV、多少词、多少外链 |
| 6.2 域名画像 | `aitdk-lookup.mjs` | `<域名>` 或 `--file <文件>` | 注册日期 / 站龄 / 月访问 / DR / 环比 |
| 6.3 竞品 sitemap 结构 | `sitemap-diff.mjs` | `--domain <d>` | 页数、slug 词频（一页吃多少词） |
| 6.4 收入站案例复核 | `revenue-site-audit.mjs` | `--domain <d> --keyword <词> --db us` | 跨源交叉验证声称的流量/收入 |

> 表格命令里的 `--db us` 只是占位，不代表默认或标准做法——按目标市场换国家库，见
> [`discipline.md`](discipline.md)「脚本的国家/地区/语言参数默认值不代表全球」。

**判据一句话：你要的是「能不能排上去」还是「排上去能赚多少钱」？前者不蕴含后者。**

---

## 第七节 · 词表补全（反查竞品补第二轮）

**自己扩的词表一定漏了一半。**

| 步骤 | 工具 | 命令 | 输出 |
|---|---|---|---|
| 7.1 词根扩展（本地模板） | `demand/word-roots.mjs` | `expand <词根>` | 51 条词根库 + 8 个扩展模板 |
| 7.1b 三引擎搜索框下拉 | `demand/suggest.mjs` | `"<词根>" --engine google,bing,ddg --hl <hl> --gl <gl> --json` | Google / Bing / DDG 各自的联想串（按语种分国家；失败引擎为 `null`，开 manifest） |
| 7.2 竞品排名词反查 | `backlink/scripts/semrush-report.mjs` | `--report organic-positions --domain <竞品> --db <目标国>` | 竞品前 100 词，与自己的池子做差集 |
| 7.3 Semrush Keyword Magic | `backlink/scripts/semrush-report.mjs` | `--report keyword-magic --keyword <词> --db <目标国>` | 整包词 + 聚簇（Topics） |
| 7.4 Similarweb 扩词 | `backlink/scripts/similarweb-keywords.mjs` | `--seed <词> --tab phraseMatch` | 匹配词（relatedKeywords 量最大） |
| 7.5 补测差集词的量与难度 | `backlink/scripts/semrush-keyword.mjs` + `seo-webcafe.mjs kd` | 逐个补测 | 被自己判过「太难」的头词也测 |
| 7.6 重算按量加权的 CPC | 手算或 `demand/keyword-value.mjs` | `--in <关键词JSON>` | 扩完词后 CPC 可能掉 |
| 7.7 树只扩两层、停止条件写明 | 人工核对 | 报告第 3 节 | 每片叶子标层级；月量低于筛子阈值或 KD 高于阈值的叶子没有往下扩 |

---

## 第八节 · 补充信号源（按需选用）

不是每次调研都要全跑，按信号缺口选用。

> **这张表是「选用视图」，不是底账，也不是配方。** 三处分工写死如下，
> 改动只改权威那一处，别在这里补细节——同一件事两处各存一份，
> 改了一处另一处就静默过期，而两边看起来都正常：
>
> | 问题 | 权威在哪 |
> |---|---|
> | **有哪些源**（底账，含没有脚本的手工源） | [`capability-map.md`](capability-map.md) 第二节 |
> | **怎么取**（配方、参数、坑） | [`demand-sources.md`](demand-sources.md) 对应小节 |
> | **这次调研做没做**（勾选） | 本节 + 本文件底部的验收矩阵 |
>
> 本表只保留「信号缺口 → 用哪个」这一层映射，供快速选用。

| 信号缺口 | 工具 | 命令 |
|---|---|---|
| 谁在花钱买流量 | `ads-transparency.mjs` | `advertisers <词>` / `creatives --domain <d>` |
| 差评里的机会 | `reviews-mine.mjs` | `--source appstore --target <id>` |
| Chrome 扩展生态 | `chrome-ext-gap.mjs` | `--search <q>` / `--category <c>` |
| 外包需求信号 | `freelance-demand.mjs` | `--source fiverr --query <词>` |
| 新产品信号 | `boards.mjs producthunt` | `--date YYYY-MM-DD` |
| AI 工具榜 | `boards.mjs toolify` | `--board new` / `--board revenue` |
| Hacker News 信号 | `hn-signals.mjs` | `--mode show --q <词>` |
| GitHub 趋势 | `github-trending.mjs` | `--source trending` |
| 用户许愿 | `reddit-wishes.mjs` | `--topic <词>` |
| TAAFT 许愿区 | `boards.mjs taaft` | `--board requests` |
| 游戏新词 | `game-newtitles.mjs` | `--source steam` |
| 竞品 sitemap 变化 | `sitemap-diff.mjs` | `--domain <d>` |
| 站群反查 | `site-network.mjs` | `--domain <d>` |
| 支付网关反查 | `payment-referrers.mjs` | `serp <网关>` / `similarweb <网关>` |
| 哥飞社区经验 | `webcafe-forum.mjs` | `search "<词>"` / `chat-search "<词>"` |
| AI 新词信号 | HuggingFace Trending + Arena.ai | AI 读 trending 页 / leaderboard 页，新模型名 = 新关键词 |
| 产品发现榜 | turbo0.com + Indie Hackers | AI 读 Collections 页 / 产品目录 |
| 平台子域名监控 | crt.sh CT logs | `https://crt.sh/?q=%.vercel.app&output=json` |
| 跨平台自动补全 | keywordtool.io / alphabet soup | 种子词 A–Z 前缀穷举，16 个平台对比差集 |
| 社交预搜索信号 | TikTok / YouTube / X | 高播放视频评论区的需求信号，领先搜索量数天 |
| 技术社区需求 | StackOverflow / V2EX | 高票未接受答案 = 没有好工具 = 可做成产品 |
| 博客评论监控 | Google Alerts + `site:` | 评论者措辞 = 长尾搜索查询词 |
| 品牌截流词 | `seo-webcafe.mjs kd` | `[brand] alternative/vs/review`，KD 通常很低 |
| AppSumo 差评 | AppSumo 公开页面 | 付费用户差评极其具体，Q&A 区有「does it support...」句式 |

---

## 第九节 · 结论产出格式

调研完成后，结论必须包含以下结构：

1. **候选方案**（1-3 个），每个方案包含：
   - 主词 + 支撑词矩阵，每个词带 KD / 月搜 / CPC / SERP 盘面摘要
   - 竞品真实流量（Similarweb + Semrush，标口径）
   - 收入估算区间（面板流量折算，不是模型流量折算）
   - 开发复杂度评估
   - 量化的继续/停止标准
2. **排除的方案**及排除理由（带数据）
3. **数据局限性声明**（哪些词/站没取到数据，为什么）

---

## 检查矩阵：一眼看清哪些跑了哪些没跑

每次调研开工时复制这张表到 `.rankup/checks.md`，逐项打勾：

```
## 调研 checklist（<主题>，<日期>）

### 必做项
- [ ] 1.1 Google 首页实勘（记页面类型列）
- [ ] 1.2 Bing 首页实勘
- [ ] 1.5 意图核验（独立成行，晚于取量、早于裁决）
- [ ] 2.1 KD + SERP 盘面（seo-webcafe kd）
- [ ] 3.1 Semrush 搜索量验证
- [ ] 3.3 多国家库搜索量（逐国，不默认 us）
- [ ] 3.4 Google Trends 趋势方向
- [ ] 3.7 社区验证：Reddit 近 7 天 vs 近 30 天
- [ ] 3.8 社区验证：X / YouTube / B 站近 14 天（/agent-reach）
- [ ] 4.1 Similarweb 竞品真实流量
- [ ] 4.6 Semrush 竞品自然流量
- [ ] 5.1 Stripe 引荐流量榜
- [ ] 5.5 TrustMRR 实连收入
- [ ] 6.1 竞品流量折成钱

### 应做项（初筛过后的入选词/站必须跑）
- [ ] 3.2 Semrush 批量搜索量
- [ ] 3.5 Google Trends 地区分布
- [ ] 3.6 Google Trends 相关飙升词
- [ ] 3.9 HN 近 14 天
- [ ] 4.2 Similarweb 相似站
- [ ] 4.3 Similarweb 受众地理
- [ ] 4.4 Similarweb 站点关键词
- [ ] 4.7 Semrush 排名词报表
- [ ] 4.8 Semrush 主要页面
- [ ] 5.3 traffic.cv 流量榜
- [ ] 6.2 域名画像
- [ ] 6.3 竞品 sitemap 结构
- [ ] 7.1 词根扩展（本地模板）
- [ ] 7.1b 三引擎搜索框下拉（suggest.mjs，按目标语种）
- [ ] 7.2 竞品排名词反查
- [ ] 7.7 树只扩两层、停止条件写明

### 按需项（按信号缺口选用，至少选 3 个）
- [ ] 广告透明度
- [ ] 差评挖掘
- [ ] 外包需求
- [ ] 新产品信号（PH/Toolify/HN/GitHub）
- [ ] 用户许愿（Reddit/TAAFT）
- [ ] 哥飞社区
- [ ] 支付网关反查
- [ ] AI 新词信号（HuggingFace/Arena.ai）
- [ ] 产品发现榜（turbo0/Indie Hackers）
- [ ] 平台子域名监控（CT logs）
- [ ] 跨平台自动补全（keywordtool.io / alphabet soup）
- [ ] 社交预搜索信号（TikTok/YouTube/X）
- [ ] 技术社区需求（StackOverflow/V2EX）
- [ ] 博客评论监控
- [ ] 品牌截流词
- [ ] AppSumo 差评
```

**全部必做项 + 全部应做项 + 至少 3 个按需项打完勾，调研才算完成。**
