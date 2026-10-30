# 需求调研验收清单

## 目录

- [使用规则](#使用规则)
- [第一节 · 亲眼看搜索结果首页（在任何取数之前）](#第一节--亲眼看搜索结果首页在任何取数之前)
- [第二节 · KD + SERP 盘面分析](#第二节--kd--serp-盘面分析)
- [第三节 · 搜索量验证（量 / KD / SERP 数据的三角校验）](#第三节--搜索量验证量--kd--serp-数据的三角校验)
- [第三·五节 · 社区验证（补面板的 28 天盲区，必做）](#第三五节--社区验证补面板的-28-天盲区必做)
- [第四节 · 竞品站真实流量（Similarweb + Semrush 域名维度）](#第四节--竞品站真实流量similarweb--semrush-域名维度)
- [第五节 · 收入信号验证](#第五节--收入信号验证)
- [第六节 · 折成钱（第四道闸门，不能跳过）](#第六节--折成钱第四道闸门不能跳过)
- [第七节 · 词表补全（反查竞品补第二轮）](#第七节--词表补全反查竞品补第二轮)
- [第八节 · 补充信号源（按需选用）](#第八节--补充信号源按需选用)
- [第九节 · 结论产出格式](#第九节--结论产出格式)
- [检查矩阵：一眼看清哪些跑了哪些没跑](#检查矩阵一眼看清哪些跑了哪些没跑)

**本清单只查段 1 产物与原始证据覆盖；完成态统一记在 [checklists.md 段 1](checklists.md#段-1--调研)。** 章节编号供旧记录定位，不表示执行顺序；顺序与两路裁决只见 [entry.md](playbooks/entry.md)。

**平台适用范围**：App 候选按 [research.md App 分支](playbooks/research.md#app-市场验证分支)与 [demand-sources.md](demand-sources.md)证据表核对，网页项不替代 App 市场验证；不适用记 N/A 与理由。

## 使用规则

| 核对 | 记录要求 | 唯一源 |
|---|---|---|
| 存量证据 | 先回读原始证据，补缺项、新意图及失效记录；保留原日期与口径 | [entry.md「省配额」](playbooks/entry.md#5--省配额) |
| 状态与落点 | 每项记证据路径、日期与完成/缺测/不适用状态 | [checklists.md](checklists.md#段-1--调研) |
| 工具与配额 | 调用前按既有工具口径查可用性，采集失败留原状态 | [research.md](playbooks/research.md)、[seo-webcafe.md](seo-webcafe.md) |


## 第一节 · 亲眼看搜索结果首页（在任何取数之前）

旧标题保留作兼容入口；当前顺序只见 [entry.md](playbooks/entry.md)，Google 产物只按 [seo-serp.md「逐问法 Google 读法」](seo-serp.md#逐问法-google-读法)核对。

| 编号 | 证据覆盖 | 落点 |
|---|---|---|
| 1.1 Google | 三清单中每条长尾问法的 Google 卡指针 | 入口卡③、`keywords.md` |
| 1.2–1.4 其他引擎 | 本轮补充采集有来源、市场、日期与差异；不替代 Google 或 ChatGPT | 研究报告背景 |
| 1.5 意图 | 意图证据可回读到对应问法及页面类型，与量记录分开 | Google 卡 |


## 第二节 · KD + SERP 盘面分析

旧标题保留作兼容入口；盘面与意图证据核对见 [seo-serp.md](seo-serp.md#逐问法-google-读法)，KD 的处理与两路裁决只见 [entry.md](playbooks/entry.md#选词判据只看两个)。本节不要求补采 KD 精评或派生指标。


## 第三节 · 搜索量验证（量 / KD / SERP 数据的三角校验）

旧标题保留作兼容入口；只核 GT 卡与面板读数的来源、市场、窗口、日期、量级及原始文件指针，缺测状态可回读。`gt.py compare` 的默认 gpts 参考与量级测量口径只见 [trends.md「gpts 基线判读」](trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)；工具单词/批量与全球口径见 [seo-webcafe.md](seo-webcafe.md)。


## 第三·五节 · 社区验证（补面板的 28 天盲区，必做）

旧标题保留作兼容入口；社区在当前调研中的用途与补漏动作只见 [P2「为什么社区验证必做」](playbooks/research/p2-keyword-root.md#为什么社区验证必做数据平台的-28-天盲区)。核对本轮采用的原话、链接、时间窗与来源状态，记录进研究报告背景，不在此另设倍数线或否决条件。


## 第四节 · 竞品站真实流量（Similarweb + Semrush 域名维度）

只核本轮采用的竞品背景记录，取数与口径见 [demand-sources.md](demand-sources.md)，不作为额外立项票。

| 旧编号 | 核对记录 | 落点 |
|---|---|---|
| 4.1/4.5/4.6 | 整站与自然流量各自的来源、日期、口径与缺测状态 | 研究报告竞品背景 |
| 4.2 | 相似站及发现来源 | 竞对清单指针 |
| 4.3 | 受众国家分布及来源 | 范围/竞品背景 |
| 4.4/4.7/4.8 | 排名词、落地页与问法池差集 | 入口卡③、补漏日志 |


## 第五节 · 收入信号验证

只核本轮引用的收入记录是否带来源、日期、可核验程度与局限，不能把估算写成实收。采集入口只见 [demand-sources.md](demand-sources.md)，记录进研究报告背景与 `decisions.md`。


## 第六节 · 折成钱（第四道闸门，不能跳过）

旧标题保留作兼容入口；折算只作规划背景，不再是第四道裁决闸。采用了估算时，核对面板流量与模型上界、假设、区间及差异说明，落在 `decisions.md` / `roadmap.md`；方法见 [validation-chain.md](demand-sources/validation-chain.md)，关键词与立项结论只见 [entry.md](playbooks/entry.md#4--判读)。


## 第七节 · 词表补全（反查竞品补第二轮）

只核竞对清单与问法池的差集、探索日志、新词/新意图补测状态、层级与停止原因；动作及工作量边界只见 [P2](playbooks/research/p2-keyword-root.md#否决前必须反查只看种子词判不做是禁止的)。落点为入口卡③与研究报告第 3 节，不另抄数量线或筛子。


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
| 新品多站同词 | `new-launches.mjs` | `--days 7 --sources taaft,toolify --snapshot-dir <dir> --compare --md --json`；TAAFT 为 `/just-released/`，仅候选 |
| TAAFT 许愿区 | `boards.mjs taaft` | `--board requests` |
| 游戏新词 | `game-newtitles.mjs` | `--source steam` |
| 竞品 sitemap 变化 | `sitemap-diff.mjs` | `--domain <d>` |
| 站群反查 | `site-network.mjs` | `--domain <d>` |
| 支付网关反查 | `payment-referrers.mjs` | `serp <网关>` / `similarweb <网关>` |
| 哥飞社区原文（保留本地） | `webcafe-forum.mjs` | `search "<词>"` / `chat-search "<词>"`；等价性与差异见下文 |
| AI 新词信号 | HuggingFace Trending + Arena.ai | AI 读 trending 页 / leaderboard 页，新模型名 = 新关键词 |
| 产品发现榜 | turbo0.com + Indie Hackers | AI 读 Collections 页 / 产品目录 |
| 平台子域名监控 | crt.sh CT logs | `https://crt.sh/?q=%.vercel.app&output=json` |
| 跨平台自动补全 | keywordtool.io / alphabet soup | 种子词 A–Z 前缀穷举，16 个平台对比差集 |
| 社交预搜索信号 | TikTok / YouTube / X | 高播放视频评论区的需求信号，领先搜索量数天 |
| 技术社区需求 | StackOverflow / V2EX | 高票未接受答案 = 没有好工具 = 可做成产品 |
| 博客评论监控 | Google Alerts + `site:` | 评论者措辞 = 长尾搜索查询词 |
| 品牌截流词 | 官方 Skill 调用 `keyword_ideas` / `keyword_difficulty` | `[brand] alternative/vs/review`；先看 SERP 是否真有独立站入口 |
| AppSumo 差评 | AppSumo 公开页面 | 付费用户差评极其具体，Q&A 区有「does it support...」句式 |

官方能力核对与只读试用（2026-09-30）：`knowledge_search --kind chat` 返回 `docId/title/date/speaker/snippet`，实测 `url=null`，只覆盖哥飞发言节选；目录明确 `knowledge_read` 提供相关段落、群聊去昵称，不是全文，本轮读取试用遇到 TLS 失败，不能视为成功覆盖。官方无论坛全集、悬赏投票榜或完整群聊消息字段的等价工具，因此保留 `webcafe-forum.mjs`：旧 HTTP 悬赏榜实测 20 条，浏览器群聊搜索实测 50 条上限；仍需会员访问权限，未出现工具箱每日配额扣费显示。原文取数与官方知识库积分调用分别记账。

---

## 第九节 · 结论产出格式

| 产物 | 核对内容 | 唯一结构源 |
|---|---|---|
| 入口卡 | 范围、GT、问法链路、Google/补漏、两路结论、页面移交的指针均可回读 | [entry.md「产出」](playbooks/entry.md#2--产出) |
| 问法链路与三清单 | 竞对、关键词与长尾问法、页面清单可关联原始问法、回答、追问与核实记录 | [seo-geo.md 步骤 2–3](seo-geo.md#步骤-2探针采样) |
| Google 卡 | 每条长尾问法有对应卡及原始证据 | [seo-serp.md](seo-serp.md#逐问法-serp-卡) |
| 两路结论 | 支持、反证、未知、路线、缺项与复测条件指向原证据 | [entry.md「判读」](playbooks/entry.md#4--判读) |
| 页面移交 | 承接问法簇、用户任务与真实页面能力的规划指针 | [stage-2-positioning.md](lifecycle/stage-2-positioning.md) |
| 局限与背景 | 采用的流量、收入、社区与估算有口径；未取到与不适用有说明 | 研究报告背景 |


## 检查矩阵：一眼看清哪些跑了哪些没跑

核对上表产物指针后，在 [checklists.md 段 1](checklists.md#段-1--调研)对应项记录状态、证据与日期；完成验收只在那一处，不另复制必做/应做/按需数量矩阵。
