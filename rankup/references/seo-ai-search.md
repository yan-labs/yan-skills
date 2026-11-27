# SEO：2026 AI 搜索范式（引用 > 排名）

> 渐进式加载：本篇讲 AI 搜索范式、官方指南与算法更新，以及 ChatGPT 侧的爬虫与检索证据（三-D）。AI 需求验证与推荐位流程见 [seo-geo.md](seo-geo.md)。

## 目录

- 三-B、2026 AI 搜索范式：引用 > 排名（Google 官方指南 + @googlesearchc 实测）
  - 核心判断：被 AI 引用比排第一更值钱
  - Google 官方 AI 优化指南要点（2026-05-15 发布）
  - Preferred Sources：品牌忠诚度成为 SEO 因子
  - Search Console 新工具：Generative AI 效果报告（2026-06）
  - February 2026 Discover Core Update：Discover 独立算法
  - 2026 算法更新时间线（用于排障定位）
  - Information Gain：内容独特性成为排名信号
  - 2026 年 Google 十大排名因素（哥飞解读版）
  - Back Button Hijacking：新增 Spam 政策（2026-04 发布，06-15 执行）
  - FAQ Rich Results 下架（2026-05-07 生效）
  - Information Agents：Google 的后台持续搜索
  - 落地清单：每轮 SEO 工作流新增检查项
  - AI Agent 就绪度：让 AI 代理能发现和使用你的站点
- 三-D、ChatGPT 侧证据（OpenAI 爬虫、JS 渲染、`site:` 与自有索引）
  - OpenAI 三个爬虫：用途与 UA 官方原文
  - JS 渲染：证据与它的局限
  - `site:` 查询与自有索引：证据等级
  - 与 Google 侧的差异

## 三-B、2026 AI 搜索范式：引用 > 排名（Google 官方指南 + @googlesearchc 实测）

> **定位**：本节整合 Google Search Central 2026 年全年官方博客、@googlesearchc 推文、
> Google I/O 2026 公告、以及 Google 首份 AI 优化指南（2026-05-15）。
> 三-B 只收录 Google 官方发布或其官方账号确认的信息，第三方解读仅作佐证。
> 「三-D」是 ChatGPT 侧证据（OpenAI 官方文档加带样本量的第三方研究，逐条标等级与日期）。
> 2026-08 更新，三-D 与本轮修订 2026-09-29。

### 核心判断：被 AI 引用比排第一更值钱

网站上线时先按 [`checklists.md`](checklists.md) 段 4、段 5 的 AI 爬虫可访问性判据逐 UA 实测；robots.txt 放行不能排除 Cloudflare 边缘 403。

Google I/O 2026（5 月 19 日）宣布搜索 25 年来最大改版：AI Mode 月活突破 10 亿、
查询量每季度翻倍。**AI Mode 是全页替换，不显示传统结果；AI Overviews 叠在有机结果上方。**
被 AI 引用的品牌获得的有机点击比未被引用的竞品高 35%（Digital Applied，2026-03，【未核实】：未找到方法与样本，只作线索）；
而 Position 1 的 CTR 从 27% 跌到 11%（SISTRIX，2026-03，限有 AI 功能的查询）。
零点击搜索已达 58.5%（SparkToro/Datos）。

**对我们的影响**：传统排名仍有价值但不再是唯一目标。每轮 SEO 规划必须同时回答两个问题：
1. 这个词我能排进前十吗？（看 Google SERP；KD 的处理与选词判据见 [`entry.md`「选词判据：只看两个」](playbooks/entry.md#选词判据只看两个)）
2. 这个词的 AI 回答会引用我吗？（下面的新流程）

### Google 官方 AI 优化指南要点（2026-05-15 发布）

Google 的意思是**基础 SEO 实践对 AI 搜索仍然适用**，并点名有些 AEO/GEO 技巧无效或没有支持（「不是独立学科」是我们的概括，不是官方原话；[官方层](official/search-technical.md) G05.11）。以下是官方指南要点：

**该做的：**
1. **写非大众化（non-commodity）内容**——官方鼓励超出通识的独特见解（写作侧 G34.1）；一手评测、原创数据、亲历经验是常见做法，
   但官方没有说只有这三种才会被引用。
2. **保持可抓取**——AI 模型用的是公开可抓取的内容。技术 SEO 基础不变。
3. **页面结构清晰**——段落、小节、描述性标题，为人类写而不是为 AI 写。
4. **加多媒体**——高质量相关图片和视频，遵循既有图片/视频 SEO。
5. **负责任地用 AI 辅助写作**——内容必须达到 Search Essentials 标准。
6. **Merchant Center + Google Business Profile**——适用时（本地商家、电商）官方建议用这两个帮助可见，不是唯一来源或必需条件。
7. **关注 agent-readiness**——交易型站点为 AI agent 做好准备（Universal Commerce Protocol）。

**不该做的（Google 明确否定）：**
1. ❌ **不需要 `llms.txt` 或任何特殊 AI 文件**——Google Search 不使用它们。
   其他引擎同样没有收益证据：约 30 万域名（10.13% 有 `llms.txt`）的相关检验与模型都看不出它与 AI 引用有关联，GPTBot 偶尔抓取 `llms.txt` 但与引用结果无关（SE Ranking，2025-11-20，【实测，厂商】）。所以它对被 ChatGPT 引用**无收益证据，成本低**；闸门 1、4 仍按 [`checklists.md`](checklists.md) 执行（要求它存在且与 sitemap 一致），不把它写成被 AI 引用的收益依据。
2. ❌ **不需要把内容切成小块（chunking）**——Google 系统理解多主题页面。
3. ❌ **不需要为 AI 改写内容**——AI 理解同义词和通用含义。
4. ❌ **不需要在全网刷品牌提及**——虚假提及无效且有反噬风险。
5. ❌ **结构化数据不是 AI 引用的前提**——继续用它拿 rich results，但别指望它是 AI 通行证。

### Preferred Sources：品牌忠诚度成为 SEO 因子

2026-01-30 上线，04-30 全球全语言推出，05-27 扩展到 AI Overviews 和 AI Mode。
用户可以标记信任的出版商，标记后的来源在搜索结果中获得视觉标记且排名提升。
截至 05-27 已有 34.5 万个被标记的来源。**用户标记为 Preferred 的站点点击率翻倍。**

**对我们的影响**：经营自有受众（邮件订阅、注册用户、回头客）不再只是产品运营，
它直接影响 AI 搜索可见性。08-20 更新的文档还增加了自定义按钮引导用户设为 Preferred Source。

### Search Console 新工具：Generative AI 效果报告（2026-06）

2026-06-03 上线，2026-08-31 起向所有网站推出【官方，2026-09-29 读 Search Console 帮助页；旧稿写「按子集推出」已过期】。报告包含：AI 功能（AI 概览与 AI 模式合并显示）中的曝光次数、页面、国家、设备、日期。
**暂无点击/CTR/查询词数据**（Google 称后续会加）；常规「效果」报告把 AI 功能计入 Web 类型且不可拆分。
另有 opt-out 开关：可以阻止内容出现在 AI 功能中，且不影响传统有机排名。

**对我们的影响**：段 7（7.2 与 7.3）的监控清单必须加入 AI 曝光指标。
在 `.rankup/baseline.md` 里新增 AI 曝光基线（可用时）。

### February 2026 Discover Core Update：Discover 独立算法

Google 首次为 Discover 发布独立核心更新（02-05 至 02-27）。
**Discover 现在使用独立于搜索的排名算法**，不再是搜索算法的副产品。
三个新信号：

1. **Topic Authority**——在特定主题上持续发布建立 Discover 可见性；追热点不再管用。
2. **反 Clickbait**——标题必须兑现内容承诺；依赖煽情标题的站流量跌 30-60%。
3. **本地相关性**——针对特定地区的内容优先推送给该地区用户。

**对我们的影响**：工具站受影响较小（Discover 偏内容消费），
但内容站必须把 Discover 当独立渠道规划，不能假设「搜索排好了 Discover 自然有」。
图片要求：1200px+ 宽度 + `max-image-preview:large` meta 标签，实测 CTR 高 45%。

### 2026 算法更新时间线（用于排障定位）

| 日期 | 更新 | 完成 | 要点 |
|---|---|---|---|
| 02-05 | February Discover Core Update | 02-27 | Discover 独立算法、Topic Authority |
| 03-24 | March Spam Update | 一天内 | 反垃圾 |
| 03-27 | March Core Update | 04-08 | E-E-A-T 仍核心（官方说它不是单独的排名因素，写作侧 G03.5）；Information Gain 信号是业内推论，未证实 |
| 04-13 | Back Button Hijacking 政策 | 06-15 执行 | 新 spam 类型，劫持浏览器后退按钮 |
| 05-07 | FAQ Rich Results 下架 | 06 月移除工具 | FAQPage schema 仍有效但不再产生富结果 |
| 05-15 | AI 优化指南发布 | — | AEO/GEO = SEO 的官方定论 |
| 05-21 | May Core Update | 06-02 | 常规核心更新 |
| 06-03 | GSC Gen AI 效果报告 | 08-31 起向所有网站推出 | AI 功能曝光数据 |
| 06-15 | FAQ Rich Results 从 GSC 移除 | 08 月移除 API | — |
| 06-24 | June Spam Update | 06-26 | 年度第二次反垃圾 |
| 08-01~03 | 未确认排名波动 | — | 多工具检测到大幅波动，Google 未确认 |
| 08-18 | August Spam Update | 08-22 | 年度第三次反垃圾 |

**排障用法**：站点流量异常时，先对照此表看是否落在更新窗口内。
官方建议更新完成后至少等一整周再分析，改进效果可能要数日到数月（[官方层](official/search-technical.md) G31.11）；没有统一的「2–4 周必然稳定」。

### Information Gain：内容独特性成为排名信号

【未证实】业内说法是 March 2026 Core Update 重新加权了 Information Gain（Google 鼓励原创增量，但所读官方页面没有确认存在这个名字的独立信号）——衡量一篇内容相对于
已排名内容增加了多少**真正新知识**。这不是新概念（Google 2020 年专利），
但 2026 是它被明确观察到影响排名的一年。

**对我们的影响**：
- 工具站的内容页不能只是同类工具页的改写，必须有独特切角。
- 「原创数据」「一手测评」「独特方法论」是 Information Gain 的三大来源。
- 与 experiences/webcafe-experiences.md 第九条（「已抓取但未编入索引」是内容问题）互证：
  Google 不只是不收低质量内容，它现在主动降权「没有新信息增量」的内容。

### 2026 年 Google 十大排名因素（哥飞解读版）

来源：@gefei55 2026-09-10 [X](https://x.com/gefei55/status/2098068562237890880)｜证据等级：【经验】（哥飞基于 Google 官方信息的个人解读，非原始实测数据）

哥飞对 Google 排名因素的十条个人排序，供交叉验证用，不当作独立判据：

1. **内容相关性**——网页内容与用户搜索词之间的相关性，最基础的一条。
2. **反向链接**——反链没死，依然有用；有真实流量页面给的外链效果更好。
   → 见 `experiences/webcafe-topics.md` 五「外链」章节。
   → 旁注：外链只做拿得到的真实引用，不用低价批量链接，也不把 DR、DA、外链条数或文章篇数当完成指标（【猜测】从业者笔记，见 [`experiences/content-seo-notes.md`](experiences/content-seo-notes.md)）；段 6 外链照做。
3. **内容质量**——原创性、准确性、时效性。→ 与上方「Information Gain」小节同一判断的另一种表述。
4. **权威性和信任度**——谷歌对网站所属公司、品牌、创建者等多维度评估。
   → 对应算法更新时间线里「E-E-A-T 仍核心」（March Core Update）。
5. **行为数据**——可以提升权重，能以小博大、以弱胜强。
6. **品牌信号**——有唯一品牌名称，真的有人搜索，散布在互联网各角落，被谷歌识别为实体。
   → 与上方「Preferred Sources」小节互证：经营自有受众和品牌搜索量直接影响 AI 搜索可见性。
7. **用户满意度**——与行为数据相关但不同，好的行为数据不一定是最佳体验；别乱搞假排队。
8. **技术 SEO 健康度**——页面是否后端渲染、On Page SEO 细节是否到位。
   → 对应段 4 闸门 1（技术 SEO），见 [`checklists.md`](checklists.md)。
9. **主题权威性/聚焦度**——全站聚焦一个大主题，比什么关键词都做的站更容易拿排名；
   对应三大原则「一个关键词组一个页面」「举全站之力打一个词」。
   → 与[seo-opportunity.md](seo-opportunity.md)「机会池选型」和 `experiences/webcafe-topics.md` 一·三（词龄比 KD 更能决定难度）呼应。
10. **内部链接**——合理分配权重，让爬虫更容易理解网站结构。
    → 对应段 4 闸门 1 的「内链零 404、零 `href="#"`」，见 [`checklists.md`](checklists.md)。

**用法**：这十条是解读而非实测，不新增独立检查项；已有对应判据/闸门的条目按交叉引用核对，
没有对应判据的（#1、#5、#7）先记录为观察方向，等实测积累后再考虑收编。

### Back Button Hijacking：新增 Spam 政策（2026-04 发布，06-15 执行）

劫持浏览器后退按钮现在是明确的 spam 违规，可触发人工处罚或算法降权。
**站主对第三方广告网络或互动脚本注入的劫持代码同样负责。**

**必检项**（加入技术审计清单）：
- 审计所有第三方脚本，确认无 `history.pushState` 滥用或后退拦截。
- 测试方法：从搜索结果进入页面 → 点后退 → 必须回到搜索结果页。

### FAQ Rich Results 下架（2026-05-07 生效）

FAQ 富结果不再出现在 Google Search 中。FAQPage schema 仍是有效的 Schema.org 类型，
但不再产生任何搜索可见性收益。

**「FAQ schema 被 ChatGPT/Perplexity 优先引用」降为【猜测】**（旧稿写「已实测，80-150 词答案」，无来源，且与下面的对照数据矛盾；「80-150 词」的出处补不出来，已删）。要拆开看两件事：

| 对象 | 证据 | 等级 |
|---|---|---|
| JSON-LD（含 FAQPage） | 1,885 个新增 schema 的页面对匹配对照，前后各 30 天（Ahrefs，2026-05-11）：AI 概览 −4.6%，AI 模式 +2.4%，ChatGPT +2.2%，后两者与随机不可分。局限：这些页面本就是已被引用 100 次以上的「考虑集」页面，说明不了 schema 对新页面的作用 | 【实测，厂商】 |
| 同上 | 域名级统计里有 FAQ schema 的页面平均 3.6 次引用，无的 4.2 次（SE Ranking，2025-11） | 【实测，厂商】 |
| 同上（单点案例） | 单站 4 页、7 个平台的测试里 6 个平台读不出 schema（OtterlyAI，2025-12 到 2026-03） | 【经验】 |
| 反向单点 | Bing 的一位负责人在 SMX Munich（2025-03）称 Bing 的 LLM 会用 schema | 【经验，二手】 |
| FAQ 的可见文本 | 未找到独立证据说明有无引用收益 | 未知 |

（`seo-experiences.md` 2026-08-22 的同题条目仍沿用旧说法，以本节为准。）

**对我们的影响**：
- 现有 FAQ schema 不删（成本低、Google 侧仍是有效类型），不再为获取 Google 富结果而新增，也**不写成被 AI 引用的收益依据**。
- FAQ 内容本身仍有承接长尾查询的价值，它对被 AI 引用是否有用未证实。

### Information Agents：Google 的后台持续搜索

Google I/O 2026 推出的 Information Agents 是 24/7 后台运行的 AI 程序，
可同时发出 16 个子查询，扫描博客、新闻、社交帖、实时数据，
在匹配条件时向用户推送综合更新。

**对我们的影响**：你的内容可能被 AI agent 阅读而非人类阅读，
因此**机器可读的准确性**在任何时候都至关重要——不只是发布时。
这强化了已有的「结构化数据 + 语义 HTML + 事实准确」要求，不需要新流程。

### 落地清单：每轮 SEO 工作流新增检查项

在现有工作流（section 四）基础上，每轮额外检查：

1. **AI 引用检查（Google 侧）**：目标页面是否出现在 AI Overviews / AI Mode 的引用中？
   （用 Search Console Gen AI 报告，或手动搜索目标词观察；ChatGPT 侧要重复采样，见 [seo-geo.md](seo-geo.md)，手动查一次不能当结论）
2. **非大众化内容审计**：页面有没有 AI 自己就能生成的泛泛之谈？
   有就加独特切角或一手数据。
3. **Back Button 审计**：第三方脚本有无后退劫持？
4. **Discover 适配**（内容站）：OG image ≥ 1200px？`max-image-preview:large`？
   主题是否持续发布而非追热点？
5. **Preferred Sources 引导**：有无引导忠实用户设为 Preferred Source？

### AI Agent 就绪度：让 AI 代理能发现和使用你的站点

> **与 AEO/GEO 的区别**：AEO/GEO 关心「被 AI 搜索引用」（Google 说等于 SEO）；
> Agent Readiness 关心「AI 代理（编码助手、购物机器人、自动化助手等）能不能
> 发现、访问、理解、使用你的站点」。两者互补，不互相替代。
> Google 说不需要 llms.txt；对被 ChatGPT 引用无收益证据（见上），对 AI 代理生态（MCP、编码助手等）是否有用也没有找到可靠来源。成本低，闸门仍按 checklists 执行。
> 2026 年 Vercel 推出 is-agentic.com 和开源 CLI，这是第一个系统化的评分工具。

**工具**：`scripts/is-agentic.mjs`（包装 is-agentic.com 公开 API，零配置可跑）。命令用法见 [seo-agentic-scan.md](seo-agentic-scan.md)。

## 三-D、ChatGPT 侧证据（OpenAI 爬虫、JS 渲染、`site:` 与自有索引）

> 2026-09-29 整理。引用选择、多阶段流水线、影响因素与漂移见 [seo-geo.md](seo-geo.md)；本节只放爬虫、渲染与检索方式这三类可复用结论。**采纳前先问「我们的前提一样吗」**：下面多数数据是 2024 到 2026 年的英文站样本，OpenAI 的抓取与检索栈随时会变。

### OpenAI 三个爬虫：用途与 UA 官方原文

【官方，2026-09-29 取自 OpenAI 爬虫文档，两次取样一致】

| 爬虫 | 用途 | UA 原文 |
|---|---|---|
| OAI-SearchBot | 在 ChatGPT 搜索里呈现网站；管理「是否出现在搜索答案里」用它 | `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36; compatible; OAI-SearchBot/1.4; +https://openai.com/searchbot` |
| GPTBot | 训练，不决定搜索可见性 | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.4; +https://openai.com/gptbot` |
| ChatGPT-User | 用户触发的抓取（用户在对话里让它读某页）；robots 规则可能不适用；不决定是否进入搜索 | `Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; ChatGPT-User/1.0; +https://openai.com/bot` |

- robots.txt 改动约 24 小时生效。OpenAI 还要求放行它官方发布的 IP 段（OAI-SearchBot 与 GPTBot 各有清单），WAF 与 Cloudflare 规则可能在 robots 之外拦截。
- 只有 OAI-SearchBot 声明桌面 Chrome，另两个不声明平台，三个都不带 Mobile；Google 是移动优先索引，抓取主体是 Googlebot Smartphone【官方】。
- 「UA 是桌面」**只影响服务端按 UA 或视口返回不同 HTML 的站**；纯响应式、同一份 HTML 的站没有差别。官方没有「不是移动优先就降权」的说法。检查方法见 [seo-ssr.md](seo-ssr.md)「三-E」，判据在 [checklists.md](checklists.md) 段 4。
- 判断有没有进搜索要看 OAI-SearchBot，不要拿 ChatGPT-User 的 200 当证据。ChatGPT 引荐会自动带 `utm_source=chatgpt.com`【官方，OpenAI 发布者说明】。

### JS 渲染：证据与它的局限

| 说法 | 证据 | 等级 | 局限 |
|---|---|---|---|
| OpenAI 是否声明爬虫执行 JS | 文档只描述用途，没有声明 | 【官方】 | 官方沉默，不能据此反推 |
| 三个 OpenAI 爬虫都不渲染 JS | Vercel 与 MERJ，2024-12-17，一个月的 Vercel 网络日志，GPTBot 5.69 亿次请求：三者会下载 JS 文件（ChatGPT 约 11.5% 的请求）但不执行；Gemini 借 Googlebot 基础设施能渲染 | 【实测】 | **单一独立实测，2024-12**；没有按 bot 拆开的独立实验；其后是否变化未知 |
| 2026 年多篇文章复述同一结论 | 核对后都是引用上面那份数据的二手汇总，没有自己的复测 | 【经验】 | 不算新增证据 |
| 例外路径 | ChatGPT Atlas 浏览器与 Agent 模式是真 Chromium，UA 与普通 Chrome 相同，会渲染 JS 且难以用 UA 识别，但那是人在用的路径，不是搜索爬取。ChatGPT 搜索另有一条经第三方 SERP 提供方取结果的路径，那些索引由渲染型爬虫建立 | 【经验】 | 提供方构成 OpenAI 未确认 |

可复用结论：JS 站对 ChatGPT 不是完全不可见，但**直接抓取路径与 `site:` 定向检索路径依赖 raw HTML**。想被 AI 引用的区块（价格表、推荐位、FAQ）要进 raw HTML，见 [seo-ssr.md](seo-ssr.md)。

### `site:` 查询与自有索引：证据等级

| 说法 | 证据 | 等级 |
|---|---|---|
| ChatGPT 有自有索引或缓存 | OpenAI 帮助中心「Offline web search for ChatGPT workspaces」称启用后使用其索引与缓存的网页内容（该页对抓取返回 403，内容取自搜索摘要，需人工复核原文）；Peec（厂商，2026-09-29）称 2026-05 到 07 的会话事件里 `result_source` 有自有索引与多种外部来源，自有索引占全部查询的比例未知 | 【官方，间接，摘要】与【经验，厂商】 |
| ChatGPT 用不用 Bing | OpenAI 官方页当日抓取返回 403，没有取到原文；第三方观测 Bing 占比在 27% 到 87% 之间摆动 | 【未知】与【实测，厂商】 |
| `site:` 定向检索变多 | 没有官方文档披露。Promptwatch（厂商，2026-08-10）称 2026-08-08 起扩展查询里 `site:` 从约 0.37% 升到约 16.8%；Peec（2026-07-22）称 ChatGPT 5.6 约 43%、5.5 仅 0.004%，其中约 84% 指向品牌自家域名；Peec 另一份 2026-04 的五百万条分析里 ChatGPT 基本不用。三份是单厂商样本，模型版本与时点不同，17% 与 43% 不可互相印证 | 【经验，厂商】 |

可确认的趋势只有一条：2026-07、08 之后 ChatGPT 搜索确有明显的 `site:` 定向检索，且常指向品牌自家站。可执行含义：内页要能被 `site:` 命中，sitemap 完整、内页 title 与首屏直接对应需求、品牌词页面可达；上线后在 Bing 与 Google 里手工查 `site:<域名> <关键词>`，看内页是否出现。

### 与 Google 侧的差异

ChatGPT 引用的 URL 与 Google 前 10 的重合很低（短尾词约 10%，长尾查询约 8%，Ahrefs，2025，【实测，厂商】），所以**在 Google 高 KD 词上排前的站，不等于 ChatGPT 会推荐的站**，要看 ChatGPT 的推荐得在它自己的输出上采样（[seo-geo.md](seo-geo.md)）。Bing Webmaster Tools 的 AI Performance 报告覆盖 Copilot 与部分合作方，不含 ChatGPT【官方，2026-02】。
