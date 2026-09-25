# 兄弟 Skill 编排表：什么时候不该自己动手

**这份文件的用途只有一个**：rankup 不是机器上唯一的 Skill。同一台机器上还装着一批
和网站增长直接相关的 Skill，其中几个能干 rankup 干不了或干得差的事。
这份表告诉你**哪几个值得加载、加载它们解决什么、以及和 rankup 自己的脚本怎么分工**。

三条阅读约定：

1. **加载有成本。** 每个 `/skill-name` 都会把它的 SKILL.md 灌进上下文，大的上千行。
   本表的默认答案是**不加载**——只有下面明确写了「接」的才值得，且要满足它的触发条件。
2. **接入的唯一理由是「rankup 现在做不到或做得差」。** 重复造轮子和盲目堆 Skill
   是同一个问题的两面。下表每一条都写了取舍理由，不同意就别接。
3. **本表描述的是本机磁盘上的实际情况**（全局 Skill 目录 `~/.claude/skills/`）。
   每条都是读过对方 SKILL.md 之后写的，不是按名字猜的。换台机器先确认它装没装。

---

## 一、一句话 → 该不该叫兄弟 Skill

| 用户大概会这么说 | 谁来干 |
|---|---|
| 「这个词能不能做」「这词多少量」「难不难」 | **rankup 自己**（官方 `gefei-keywords` Skill + `backlink/scripts/semrush-keyword.mjs`）。不要叫 keyword-research，它不带取数 |
| 「帮我挖一批长尾词」→ 已经**有**几十上百个词，要分组排序 | **`/keyword-research`**。rankup 取数，它做意图分层与簇排序 |
| 「帮我挖一批长尾词」→ 手上**只有**一个词根 | **rankup 自己**（`demand/word-roots.mjs` 扩形态 → `demand/serp-query.mjs --expand` 拿 relatedSearches/PAA → 再交给 keyword-research 分层） |
| 「怎么被 AI 引用」「AEO/GEO 怎么做」→ 问的是**为什么、值不值** | **rankup 自己**（[`seo-growth.md`](seo-growth.md) 三-B：Google 官方指南、Information Gain、Preferred Sources） |
| 「怎么被 AI 引用」→ 问的是**这篇文章要写成什么形状** | **`/ai-seo`**（逐平台来源选择机制 + 内容改写模式 + llms.txt/OKF 知识包） |
| 「加个结构化数据」「JSON-LD 怎么写」 | **`/seo-geo`**，且只读它的 `references/schema-templates.md`。rankup 全仓没有模板库 |
| 「帮我看看这站有什么 SEO 问题」 | **rankup 自己**（`seo-audit.mjs --sitemap` + `pagespeed.mjs collect`（`plan` 只出链接不采数，仅兜底）+ `ahrefs-site-audit.mjs`）。**不要加载 seo-audit Skill**，理由见第三节 |
| 「查一下 X 是怎么回事」「这个 Google 更新到底改了什么」 | **`/deep-research`**（方法论）+ **`/anysearch`**（执行）。rankup 的 demand/ 只吃结构化源 |
| 「大家怎么评价 X」「小红书/推特/B站上怎么说」 | **`/agent-reach`**。这正是 capability-map §二「用户的原话」那一行缺的取数通路 |
| 「这个领域现在有哪些 skill」「别人写过没」 | **`/skillsmp`**（1.6M 索引）。要「最近 7 天新冒出来的」才用 `demand/github-skill-search.mjs --mode recent` |
| 「写篇中文长文」「这稿子 AI 味太重」 | **`/human-writing`** 起稿 → **`/shuorenhua`** 过滤。仅限中文；英文站内容两个都不适用 |
| 「扩词想不出角度了」 | **`/marketing-psychology`**（痛点/对比/决策词）+ **`/marketing-ideas`**（场景/人群词）。用法已写在 [`trends.md`](trends.md) W2 第一步 |
| 「部署 Worker」「wrangler 报错」 | **`/wrangler`**（已在 [`cloudflare-stack.md`](cloudflare-stack.md) 接入）；要 D1/R2/Vectorize/Agents SDK 的深度用法才升到 `/cloudflare` |
| 上面都不是 | **rankup 自己**。先查 [`capability-map.md`](capability-map.md) |

---

## 二、判定「接」的：分工与加载条件

### `/keyword-research` —— 词表的分层与聚类，不是取数

| | |
|---|---|
| **它能干什么** | 按搜索量、难度、意图、簇给关键词排优先级。带四份判读参考：`keyword-intent-taxonomy.md`（意图分类法）、`keyword-prioritization-framework.md`（优先级框架）、`topic-cluster-templates.md`（簇模板）、`example-report.md` |
| **关键事实** | 它的 description 原文是「from provided or connected data」——**它自己不联网、不带任何取数脚本**，`references/` 之外只有一个 SKILL.md |
| **与 rankup 的分工** | **零冲突，是纯补充。** rankup 负责把数拿到：官方 `gefei-keywords` Skill（KD + top9 盘面 + linkBudget）、`backlink/scripts/semrush-keyword.mjs`（分国家量/KD/CPC + globalVolume，`--bulk` 一次 100 词）、`demand/serp-query.mjs`（SERP + relatedSearches + PAA）、`demand/word-roots.mjs`（词根扩形态）、`demand/keyword-value.mjs`（CPC 折算）。**这些都只出数值，不出分组。** 一旦词表超过二三十条、需要按意图切成 informational/commercial/transactional 并聚成内容簇，rankup 没有任何文档写这件事 |
| **什么时候加载** | 手上**已经有**一张词表（≥20 条，带 volume/kd），要决定先写哪几篇、怎么组内链簇 |
| **什么时候不要加载** | 只想知道单个词难不难（用 `kd`）；还没有词表（先用 rankup 取数）；只要 CPC 折算（用 `keyword-value.mjs`） |
| **取舍理由** | 接。rankup 的选词链条到「拿到数值」为止就断了，[`trends.md`](trends.md) W2 第四步那张决策表是**单词维度**的，没有簇维度。这是真缺口 |

### `/ai-seo` —— 被 LLM 引用的内容形状

| | |
|---|---|
| **它能干什么** | 逐平台的来源选择机制（AI Overviews / ChatGPT / Perplexity / Gemini / Copilot / Claude 各自怎么挑源）、内容形态模式、「被引用」与「被推荐」的区别、llms.txt 与 OKF（Open Knowledge Format）知识包 |
| **与 rankup 的分工** | **补充，边界很清楚。** rankup 的 [`seo-growth.md`](seo-growth.md) 三-B 是**范式与算法时间线**——为什么引用比排名值钱、Google 2026-05-15 官方指南要点、Information Gain、Preferred Sources、Discover 独立算法、2026 更新时间线（用于排障定位）。它回答「值不值得做、做了会怎样」。ai-seo 回答**「一篇文章要写成什么形状才会被挑中」**，以及各平台的差异。rankup 还有 `is-agentic.mjs`（站点层的 Agent 就绪度打分）和 `cf-agent-baseline.mjs`（全网分母），那是**站点结构**层，ai-seo 是**内容**层 |
| **什么时候加载** | 要动手改一篇/一批内容的结构去争取被引用时；要写 llms.txt 的内容而不只是检查它存不存在时 |
| **什么时候不要加载** | 只是问「AEO 是什么」「这轮要不要管 AI 搜索」（读 seo-growth.md 三-B）；只是要 llms.txt 的存在性检查（`is-agentic.mjs scan`） |
| **取舍理由** | 接。rankup 有判据没有做法，且这一层写起来很长，不该复制进 rankup |

### `/seo-geo` —— **只取 schema 模板，其余全部不用**

| | |
|---|---|
| **它能干什么** | `references/schema-templates.md`（JSON-LD 模板库）、`platform-algorithms.md`、`geo-research.md`；另有 `scripts/`：`seo_audit.py`、`keyword_research.py`、`related_keywords.py`、`backlinks.py`、`domain_overview.py`、`competitor_gap.py`、`autocomplete_ideas.py`、`dataforseo_api.py` |
| **和 rankup 正面重叠的部分** | 它的脚本几乎每一个都在 rankup 已有能力的正下方，且更弱：`seo_audit.py` 只做单页 title/meta/H1/robots/sitemap/加载时间，rankup 的 `seo-audit.mjs` 是全站 sitemap 遍历 + canonical/lang/OGP/结构化数据/alt/hreflang + 1/2/3-gram 密度（含日文 `Intl.Segmenter`）+ `--fix-report`；`keyword_research.py` / `domain_overview.py` / `backlinks.py` 走 DataForSEO **付费** API，rankup 有 官方 `gefei-keywords` Skill（按 API 实时价格扣积分）、`semrush-keyword.mjs`、`semrush-overview.mjs` 和整个 `/backlink` |
| **唯一值得取的** | **JSON-LD schema 模板库。** rankup 全仓只有「检测有没有结构化数据」（`seo-audit.mjs`），没有一处「该写哪种 schema、字段怎么填」 |
| **什么时候加载** | 要给页面加结构化数据、需要现成 JSON-LD 模板时 |
| **什么时候不要加载** | 任何取数、审计、关键词、外链场景——**用 rankup 自己的，别开它的脚本**，那会同时浪费上下文和 DataForSEO 额度 |
| **取舍理由** | 有条件接。它是本表里唯一「大部分该拒、一小块该收」的 Skill，所以边界必须写死，否则 AI 会顺手把它的脚本也用上 |

### `/deep-research` + `/anysearch` —— 非结构化调研通路

| | |
|---|---|
| **deep-research 能干什么** | 一个纯方法论文件（单 SKILL.md，零脚本）：先广后深的分层检索、从初检结果里识别维度、多角度交叉。它自称「用它替代 WebSearch」 |
| **anysearch 能干什么** | 带 CLI 的实时检索：`search`、`batch_search`（并行多查询）、`extract`（URL 全文抽取）、`get_sub_domains`（垂直领域检索，finance/academic/security/gaming 等）。匿名可用，有 key 则限流更松 |
| **与 rankup 的分工** | **补充。** rankup 的 `demand/` 全是**结构化源**——榜单接口、商店 API、sitemap、SERP JSON。一旦问题变成「这个赛道 2026 年发生了什么」「这次核心更新到底改了什么」「这个平台的政策变了没」，rankup 手上一件工具都没有，只剩裸 WebSearch。deep-research 给方法，anysearch 给执行 |
| **和 `demand/serp-query.mjs` 的区别** | 不是一回事。`serp-query.mjs` 要的是**「谁排在前面」**（organic 名次、首页/内页构成、域名命中计数——用来判竞争度），走 serper.dev，`SERPER_API_KEY` 免费 2500 次。anysearch 要的是**「这件事的事实是什么」**（正文内容）。**判竞争度不要用 anysearch，查事实不要用 serp-query** |
| **什么时候加载** | 对账与段 1 的赛道与市场调研；排障时要搞清某次算法更新的事实；写内容前的素材收集（这也是 human-writing「五件材料」门槛的补料通道） |
| **什么时候不要加载** | 已知要查的是榜单/商店/sitemap/SERP（rankup 有专用脚本，更准更快） |
| **取舍理由** | 接。deep-research 只有一个文件，成本近乎为零；anysearch 补的是 rankup 结构性缺失的一整类通路 |

### `/agent-reach` —— 「用户的原话」那一行缺的取数通路

| | |
|---|---|
| **它能干什么** | 15 个平台的多后端取数：小红书、推特/X、B 站、Reddit、Facebook、Instagram、V2EX、LinkedIn、YouTube、GitHub 代码检索、播客、RSS、任意网页。6 个通道零配置，`agent-reach doctor --json` 看当前每个平台走哪条后端 |
| **与 rankup 的分工** | **补一个已知的空位。** [`capability-map.md`](capability-map.md) §二「没有脚本、但一样是正式来源的手工源」里明写着一行：`StackOverflow · V2EX · TikTok / YouTube · X（Twitter）· 行业博客评论 → 用户没被满足时的原话`，配方在 [`demand-sources.md`](demand-sources.md) §八——但**取数方式写的是「浏览器或搜索」，没有工具**。agent-reach 正好覆盖其中 V2EX / X / YouTube / Reddit。rankup 自己只有 `demand/reddit-wishes.mjs`（Reddit 许愿句式）和 `demand/hn-signals.mjs`（HN），中文社媒一个都没有 |
| **什么时候加载** | 要中文社媒（小红书 / B 站 / V2EX）或推特上的用户原话；做中文市场的需求挖掘 |
| **什么时候不要加载** | 只要 Reddit 许愿句式（`reddit-wishes.mjs` 更专、直接出 template 字段）；只要 HN（`hn-signals.mjs`）；要发帖/评论（agent-reach 只读不写，rankup 也不做写操作） |
| **取舍理由** | 接。这是本表里最实的一条——它填的是 capability-map 自己标注过的空白 |

### `/skillsmp` —— 和 `demand/github-skill-search.mjs` 是**两个不同的问题**

| | |
|---|---|
| **它能干什么** | 在 SkillsMP（1.6M+ 公开 SKILL.md 的索引，覆盖 Claude Code / Codex / ChatGPT）里按关键词、分类、职业、语言检索，并专门挖冷门但写得好的 |
| **rankup 已有的** | `demand/github-skill-search.mjs`：三种模式。`--mode recent`（需 GITHUB_TOKEN，**唯一真的按 push 时间排**）、`--mode code`（按相关性，不按时间）、`--mode repo`（无 token 可跑） |
| **分工（这条最容易搞混）** | 问「**这个领域现在都有什么**」「有没有人做过 X」「别重复造轮子」→ **skillsmp**，索引大两个数量级，且带分类/星数/语言过滤。问「**最近 7 天新冒出来什么**」→ **`github-skill-search.mjs --mode recent --pushed-days 7`**，skillsmp 给不了时间序。需求挖掘要的是后者（新 SKILL.md 出现 = 有人刚开始反复做这件事 = 需求信号），盘点现状要的是前者 |
| **什么时候加载** | 动手写任何新脚本/新 Skill 之前先搜一遍；判断某个方向的供给饱和度 |
| **取舍理由** | 接，但必须带上分工那一行——否则 AI 会拿 skillsmp 去做时间序信号，那是错的 |

### `/human-writing` + `/shuorenhua` —— 中文内容的起稿与去 AI 味

| | |
|---|---|
| **human-writing 能干什么** | 中文长内容创作与改稿（知乎回答、论坛长帖、公众号、博客、教程、评测、人物稿）。核心是一道前置门槛：**非虚构长文动笔前必须列出至少五件具体材料，并注明各自来自用户哪句话或哪份可靠来源**；列不出就先研究、追问，或缩短成六百字短答，**不许用重复解释灌字数** |
| **shuorenhua 能干什么** | 初稿之后的去 AI 味过滤：判场景（chat/status/docs/public-writing）→ 划 protected spans（术语、系统主语、引用原文不许动）→ 判力度档位 → 改写。它明确不是敏感词替换器，保留技术性 |
| **与 rankup 的分工** | **补一整个空白。** rankup 生命周期段 7（7.2）起要持续产内容，但全仓**没有一条关于「文章怎么写」的规则**——[`seo-growth.md`](seo-growth.md) 只讲 Information Gain 要求内容含一手素材，不讲怎么落成句子。更巧的是这两件事是同一条判据的两侧：Google 的「非大众化内容才会被引用」和 human-writing 的「列不出五件材料就别写长稿」，说的是一回事 |
| **顺序** | human-writing 起稿 → shuorenhua 过一遍 → 再按 `/ai-seo` 调结构 → 上线后 `seo-audit.mjs` 查 TDK 与密度 |
| **硬边界** | **两个都是中文视角。** 英文站、日文站的内容两个都不适用，别硬套 |
| **取舍理由** | 接。但只在真的要产中文长内容时加载，两个都不小 |

### `/marketing-psychology` + `/marketing-ideas` —— 扩词的角度，不是词

| | |
|---|---|
| **它们能干什么** | marketing-psychology：心理原理与思维模型（锚定、社会认同、稀缺、损失厌恶、框架效应、JTBD）。marketing-ideas：139 条 SaaS 营销打法，按品类索引（内容与 SEO、竞品、免费工具、投放、社群、邮件、合作、发布、PLG、平台、国际化） |
| **与 rankup 的分工** | **补扩词角度。** rankup 的 `demand/word-roots.mjs` 只有 51 条词根 + 8 个模板，做的是**形态扩展**（`{seed} to {target} {root}`），补不出「痛点词 / 对比词 / 决策词」（心理角度）和「不同职业 / 不同平台 / 不同用例」（场景角度）。[`trends.md`](trends.md) W2 第一步已经把它们写进扩词流程，本条只是把它登记进能力底账 |
| **什么时候加载** | 扩词卡住、只剩形态变体想不出新角度时；marketing-ideas 另可用于段 6/7 的增长手段盘点 |
| **什么时候不要加载** | 已经有足够词表（去 `/keyword-research` 分层）；定价与转化问题（rankup 有 [`experiences/conversion.md`](experiences/conversion.md)，是带数字的实战裁定，比通用心理学更该先看） |
| **取舍理由** | 接（维持现状并登记）。[`trends.md`](trends.md) 里已有的那句「这些 skill 不可用时自己顶上做扩词即可，角度不变」是对的，保留 |

### `/wrangler`、`/cloudflare` —— 已接入，本条只做登记

`/wrangler` 已经写在 [`cloudflare-stack.md`](cloudflare-stack.md)（`npx skills add cloudflare/skills --skill wrangler -g -y`，
且被 `validate-rankup.mjs` 的必需内容断言锁住）。分工：日常 `wrangler deploy` / `wrangler types` / D1 迁移用 `/wrangler`；
要 Workers AI、Vectorize、Agents SDK、WAF、Tunnel 这类平台深度用法才升到 `/cloudflare`。
rankup 自己只保留 `cf-zone-setup.mjs`（zone onboarding，**Wrangler 没有 zone 命令**）、
`cf-analytics-setup.mjs`、`cf-agent-baseline.mjs` 三个补缺口的脚本。

---

## 三、判定「不接」的：以及为什么

### `seo-audit` Skill —— **和 `rankup/scripts/seo-audit.mjs` 同名，但完全不是一回事**

**这一条必须读完，否则一定会搞混。**

| | `rankup/scripts/seo-audit.mjs`（脚本，rankup 自带） | `seo-audit` Skill（全局 Skill） |
|---|---|---|
| 是什么 | 一个零依赖 Node 脚本 | 一份面谈式审计框架文档 |
| 怎么用 | `node rankup/scripts/seo-audit.mjs --sitemap <url>` | `/seo-audit`，然后它开始向用户提问 |
| 产出 | 全站每页的 TDK/canonical/robots/lang/h1/OGP/结构化数据/alt/hreflang + 1/2/3-gram 密度，**只出观察记录 `{code, observed}`，不带分级也不带修复建议**（2026-08-30 降级为纯机械工具；`--fix-report` 现在只是把原始 `issues` 逐行 dump 成机器可读格式）。分级表迁到 [`seo-box.md`](seo-box.md)「seo-audit 判读指引」，判读归你 | 一套审计优先级顺序（可抓取性 → 技术基础 → 页面优化 → 内容质量）与建议话术 |
| 前提 | 无。零配额零登录纯 HTTP | 要先问清楚：什么类型的站、SEO 的业务目标、优先关键词、当前流量、最近有没有改版、有没有 GSC 权限 |

**为什么不接这个 Skill：**

1. **和 rankup 的执行纪律直接冲突。** `SKILL.md` 写着「用了这个 Skill，就意味着全权委托。
   不存在『要不要继续』『需要我处理吗』」。seo-audit Skill 的第一步是**向用户提六个问题**。
   加载它会让 AI 从「直接跑」切回「先问一轮」，这是倒退。
2. **它的核心限制条款 rankup 早就绕过了。** 它花了整节警告「`web_fetch`/`curl` 看不到 JS 注入的
   schema，请改用浏览器或 Rich Results Test」——rankup 有 opencli 真浏览器、有 `rankup-cli.mjs audit`
   逐页存 DOM/AX/网络结构，这个限制对 rankup 不成立。
3. **判读层 rankup 更全。** 它的阈值建议是通用的；rankup 的 [`seo-box.md`](seo-box.md)
   有「seo-audit 判读指引」的 error/warning 分级实测、Ahrefs 档位实测、第三方工具接不接的对账。

**结论：不加载。**「帮我看看这站有什么 SEO 问题」的正确链路是
`seo-audit.mjs --sitemap` → `pagespeed.mjs collect`（默认路径，直接落 LHR JSON；`plan` 只出链接、不采数，仅兜底）读实验室+现场两套 → `ahrefs-site-audit.mjs report`（第二双眼睛）
→ 判读对 [`seo-box.md`](seo-box.md) + [`checklists.md`](checklists.md) 段 4。

### `/write` —— 附属 Skill 装齐才加载，缺就用 find-skills 装齐

`write` 是中文写作的**路由入口**，它把任务分派给 `writing-fragments`、`writing-shape`、
`writing-beats`、`edit-article`、`humanizer-zh` 五个附属 Skill。它们不一定装在当前机器上：
加载 `write` 之前先 `ls` 全局 Skill 目录确认五个都在；缺任何一个就按下面「缺 Skill 的处置」用
`find-skills` 装上，再加载 `write`。装不上（源不存在、网络不通）时才退到 `/human-writing`（自带
`references/` 五份，不依赖外部 Skill）+ `/shuorenhua`，并把退路原因写进回复。

### 缺 Skill 的处置：一律 find-skills 安装，不跳过、不现写替代

本 Skill 点名的任何兄弟 Skill（`agent-reach`、`anysearch`、`deep-research`、`tuner`、`human-writing`、
`shuorenhua`、`ai-seo`、`seo-geo`、`marketing-psychology`、`marketing-ideas`、`imagegen`、`backlink`、
`opencli`、`keyword-research`、`skillsmp`……）在当前机器上不存在时，处置只有一种：加载 `find-skills`，
按名字搜索并安装（它会给出 `npx skills add <owner/repo> --skill <name> -g -y` 这类命令），装完再继续。
为什么写死：每台机器、每个用户装的 Skill 集合都不一样，本文件只能保证「该用什么」，不能保证「已经装了」；
遇缺就跳过会让流水线静默少一条腿（社区验证没跑、文案没去 AI 味），现写替代又回到「重造轮子」。
装完的 Skill 若是 yan-labs 自家的，`node scripts/link-skills.mjs` 会把它链回仓库真源。

### 其余：明确不接的清单

| Skill | 判定 | 理由 |
|---|---|---|
| `gh-cli` | **不接** | 单文件 `gh` 命令手册。rankup 不做 GitHub 运维；真需要时 Bash 里 `gh <cmd> --help` 就够，加载纯耗上下文 |
| `skill-creator` | **不接** | 只在改 rankup 自身时才用得上，而那不是 rankup 的工作范围。改 Skill 走 [`evolution.md`](evolution.md) 的晋升门 |
| `find-skills` | **已接入，但优先级降到 skillsmp 之后** | 它已经写在 [`integrations.md`](integrations.md)（安装命令被 `validate-rankup.mjs` 的必需内容断言锁住），是「能力缺口 → 搜 Skill → 记进 `decisions.md`」那条流程的一环，**不要删**。但纯搜索场景 `/skillsmp` 的索引大得多（1.6M SKILL.md），**先 skillsmp 搜、搜到了再按 integrations.md 的流程装与登记** |
| `agent-browser` | **不接** | 另一套浏览器自动化。rankup 全线绑 `opencli`（会话纪律、落盘 SOP、adapter 都在那）。两套混用会撞标签页与会话名 |
| `tuner` / `tuner-ci` | **暂不接** | tuner 是按 credit 计费的取数中转（转录、社媒、检索、抓取）。它的检索与抓取能力已被 anysearch（匿名可用）、agent-reach（6 通道零配置）、`serp-query.mjs`（免费 2500 次）覆盖。**触发条件**：上述三条全部不可用，且用户已有 key，才谈 |
| `macmini` | **与 rankup 无关，不要加载** | 远程 Mac Mini 的 SSH 与 OpenClaw 诊断 |
| `ops` | **与 rankup 无关，不要加载** | 另一个项目（K12）的服务器运维中枢，含该项目专有的域名、日志通道与 runbook |
| `kollab-cli` | **与 rankup 无关，不要加载** | 另一个工作区平台的资源管理 CLI |
| `learned` | **不是能力** | 全局目录下有这个文件夹，但**它是空的，没有 SKILL.md**。别去加载它，也别在文档里当它存在 |
| `autopilot` / `codex` / `skill-link-check` | **不接（正交）** | 分别是任务编排、图像生成与代码子代理、Skill 链接体检。和网站增长正交，按各自触发词单独使用即可 |
| `backlink` / `game-opportunity` / `opencli` | **已接入** | 它们不是「兄弟 Skill」而是 rankup 的专项与底座，路由写在 [`capability-map.md`](capability-map.md) §十、§十二、§十三和 `SKILL.md`，不重复 |

---

## 四、取舍原则（下次有新 Skill 装进来时按这个判）

1. **先问「rankup 现在做不到什么」，不要问「这个 Skill 能干什么」。** 后者永远回答「能干不少」，
   然后就接了。本表拒掉的六个通用 Skill 全都「能干不少」。
2. **重叠不等于该拒，也不等于该接——要能写出一行分工。**
   写不出「什么情况用它、什么情况用 rankup 自己的」，就是没想清楚，先别接。
   `skillsmp` vs `github-skill-search.mjs`、`anysearch` vs `serp-query.mjs` 都是靠这一行才留下的。
3. **同名是最大的陷阱。** `seo-audit` Skill 与 `seo-audit.mjs` 是本机上唯一一对同名冲突，
   它已经在第三节写死。以后再出现同名，第一件事就是在这里建一张对照表。
4. **和执行纪律冲突的一律拒。** rankup 是「全权委托、直接做」；任何以「先问用户几个问题」
   开场的 Skill 都会把这条纪律带偏。
5. **接了就要登记。** 判定为「接」的必须同时进 [`capability-map.md`](capability-map.md)
   的「兄弟 Skill 提供的能力」一节，否则它对用户等于不存在。
6. **登记的是「该用什么」，不是「已经装了」。** 本机没装的一律用 `find-skills` 装，见第三节前的
   「缺 Skill 的处置」；文档里不许再出现「本机没有所以不要加载」这种把一台机器的状态写成规则的话。
