---
last_verified: 2026-11-27
source: Google 官方 SEO 与 AI 搜索汇编（独立复核于 2026-11-27）；每行链接指向官方原页
---

# 官方层：搜索与 AI 爬虫的技术条目

抓取、索引、规范化、结构化数据实现、页面体验、多语言、迁移、AI 功能与爬虫，以及和站点结构、批量造页有关的垃圾政策。用法和规矩：

- 这是 rankup 的官方层。和经验层、闸门表里的项目自设口径冲突时，以本文件为准；闸门不因此删除，只在 [`checklists.md`](../checklists.md#闸门性质官方要求与项目自设) 标性质。
- 和「写」有关的条目（有用内容、垃圾政策的内容侧、title、description、结构化数据的内容侧、AI 生成内容）只在 write Skill 的官方层（`write/references/official/google-content.md`）。这里按编号引用（如 G02.1），不抄内容。
- 编号全文唯一：前半是汇编的来源编号（G 是 Google 搜索文档，S 是 Search Console 帮助，O01 是 OpenAI 爬虫文档；汇编里没编号的三家由本文件补：B01 Bing、P01 Perplexity、A01 Anthropic），后半从 .11 起，避开 write 用的 .1–.10。
- 性质沿用汇编的四类：政策（违反会被处置）、技术要求、官方建议、官方说明（含「不是排名因素」）。「推论」单独标明，不是官方条文。
- 每行带官方链接、页面标示的更新日期和核对日期。「怎么做」写的是 rankup 里落到哪个动作或闸门。
- `last_verified` 距今超过 90 天：用的人在报告写一行「官方层已 N 天未核对」，不阻塞。Google 公布核心更新或垃圾内容更新时立即核对；更新办法是逐条重读链接，改条目、日期和本文件头。

## 必读精简版

写页面、规划页面、上线体检之前先读这 12 条；括号里是编号，全文在下面各节。

1. 每类模板页 Googlebot 能抓、返回 200、有可索引正文；满足了也不保证收录。（G01.11）
2. 导航、分类、分页用带 `href` 的真实链接，URL 可读稳定，内链不带统计参数。（G09.11、G10.11）
3. 一组不互相竞争的词一个 URL，同一意图不开第二页；同内容的变体选定规范 URL。（G11.11、G02.12；写作侧 G34.2）
4. noindex 用 robots meta 或 `X-Robots-Tag`，并允许抓取；robots.txt 只管抓取，不当防收录用。（G13.11、G14.11）
5. 关键内容和链接不靠用户交互才加载；手机版与桌面版是同一份内容和同样的 robots 指令。（G16.11、G26.11）
6. 结构化数据选对类型、值与页面可见内容一致；不为 FAQ 或 HowTo 富结果加标记。（G18.11、G20.11、G19.11；内容侧 G17.1）
7. 页面体验看整体与 Core Web Vitals 现场数据；Lighthouse 分数和 TBT 是项目门槛，不是官方门槛。（G25.11）
8. 多语言用独立 URL 和完整互指的 hreflang，不只靠按 IP 或语言自动跳转。（G27.11）
9. 改版、换域逐 URL 映射并用永久服务端重定向。（G33.11）
10. 想进 AI 搜索：已收录、能显示摘要、Search Console 生成式 AI 控制允许；不需要专门 schema 或 llms.txt。（G05.11、S01.11；写作侧 G05.2）
11. AI 爬虫按用途分开看：搜索、训练、用户触发访问是不同的 UA 和规则。（O01.11、P01.11、A01.11）
12. 批量工具站红线：规模化造页、门页、伪装、过期域名滥用、网站声誉滥用。（第九节；内容侧 G02.1–G02.6）

## 一、抓取与索引

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G01.11 | Googlebot 能访问、不被封锁，页面返回 HTTP 200 且有可索引内容；满足这些仍不保证收录 | 段 4、段 5 每类模板页至少一个 URL 核状态码、raw HTML 正文与 robots；「通过」不写成「已收录」 | 技术要求 | [G01](https://developers.google.com/search/docs/essentials/technical)（更新 2025-12-18；核对 2026-11-27） |
| G09.11 | 可抓取的链接通常是带 `href` 的 `<a>`；锚文本说明目的页 | 分类、Hub、分页、上一项下一项都用真实 `<a href>`，不靠搜索框、按钮或无限滚动 | 官方建议 | [G09](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)（更新 2025-12-10；核对 2026-11-27） |
| G10.11 | URL 描述性、易读、稳定，避免不必要的参数组合和重复路径 | 长尾页用稳定路径、词之间用连字符；筛选与统计参数不进内链 | 官方建议 | [G10](https://developers.google.com/search/docs/crawling-indexing/url-structure)（更新 2026-10-21；核对 2026-11-27） |
| G12.11 | sitemap 列希望作为规范版本的绝对 URL；它是提示，不保证抓取或收录 | sitemap 只放规范 URL，`lastmod` 跟真实改动走（发布流程见 [`search-platforms.md`](../search-platforms.md)） | 官方建议 | [G12](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)（更新 2025-12-10；核对 2026-11-27） |
| G13.11 | robots.txt 按爬虫和路径管理抓取，不是可靠的防收录机制；被挡的 URL 仍可能因外链出现 | 不拿 robots.txt 藏页面；检查没挡住要索引的页和渲染需要的资源 | 官方建议 | [G13](https://developers.google.com/search/docs/crawling-indexing/robots/intro)（更新 2025-12-10；核对 2026-11-27） |
| G14.11 | 禁止索引用 robots meta 或 `X-Robots-Tag`；Google 必须能抓到页面才看得到指令 | 预览域 noindex 的同时不在 robots.txt 里挡住这些页；正式域名放开时两处一起改 | 技术要求 | [G14](https://developers.google.com/search/docs/crawling-indexing/block-indexing)（更新 2025-12-10；核对 2026-11-27） |
| G15.11 | 抓取预算主要关系到特定规模和更新频率的大站，一般网站不需要专门优化 | 小站先解决可发现性和页面价值；页数多时上线后对「计划页数、收录数、爬虫看到的数」 | 官方说明 | [G15](https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget)（更新 2026-07-22；核对 2026-11-27） |
| G16.11 | Google 会抓取、渲染和索引 JavaScript；关键内容、链接和状态码要可访问，不要求用户交互才加载关键内容 | 工具结果、价格、限制、示例输出不靠点击才出现；SSR 是 rankup 的可靠性选择，不是官方要求 | 官方建议 | [G16](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)（更新 2026-03-04；核对 2026-11-27） |
| G26.11 | Google 以移动版内容索引和排名；移动版要能访问关键内容、资源和相同的 robots 指令 | 手机与桌面同一份正文，不用隐藏样式放第二套，不做独立 `m.` 子域；`ua-parity.mjs` 对比 | 官方建议 | [G26](https://developers.google.com/search/docs/crawling-indexing/mobile/mobile-sites-mobile-first-indexing)（更新 2025-12-10；核对 2026-11-27） |

## 二、规范化与重复

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G11.11 | 重定向、`rel=canonical` 和 sitemap 都是规范化信号，Google 自己选规范页；重复内容本身不是垃圾违规 | 同功能的多个 URL 合并信号（canonical 自引、301、sitemap 一致）；查重复时别直接当成处罚 | 官方建议 | [G11](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)（更新 2026-07-10；核对 2026-11-27） |
| G30.11 | 排名系统里有去重系统，避免相似结果重复展示；精确匹配域名系统防止域名里的关键词获得过高权重 | 同意图的第二页不会多拿一个位置；选域名不指望关键词域名加权 | 官方说明 | [G30](https://developers.google.com/search/docs/appearance/ranking-systems-guide)（更新 2025-12-10；核对 2026-11-27） |

## 三、结构化数据的实现

内容侧（值要在页面上看得见、不编评价、不搬他站评分）见 write 官方层 G17.1、G18.1、G24.1、G19.1。

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G17.11 | 结构化数据要遵守技术与质量政策；符合也不保证富结果 | 每类模板页用富结果测试与 Schema 校验各跑一次；「合法 JSON」不等于通过 | 政策 | [G17](https://developers.google.com/search/docs/appearance/structured-data/sd-policies)（更新 2026-07-10；核对 2026-11-27） |
| G18.11 | 软件应用用 `SoftwareApplication` 及其子类型；按富结果要求给名称、报价价格以及评分或评价；免费为 0，付费建议带币种 | 工具页只在条件满足且数据真实时标；`offers.price` 免费写 0，付费带 `priceCurrency` | 官方建议 | [G18](https://developers.google.com/search/docs/appearance/structured-data/software-app)（更新 2026-09-08；核对 2026-11-27） |
| G20.11 | `BreadcrumbList` 表达典型用户导航路径，至少两个有顺序的 `ListItem`，末项可省 URL | 面包屑按真实层级生成，不虚构路径 | 官方建议 | [G20](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb)（更新 2026-09-08；核对 2026-11-27） |
| G21.11 | Organization 标记帮助 Google 理解站点的组织身份 | 首页标准确的组织名称、标识和适用的联系方式；没有的字段不输出空值 | 官方建议 | [G21](https://developers.google.com/search/docs/appearance/structured-data/organization)（更新 2026-09-08；核对 2026-11-27） |
| G22.11 | Article 标记帮助理解文章及作者、日期；不保证特殊展示 | 文章页作者与日期取页面可见值 | 官方建议 | [G22](https://developers.google.com/search/docs/appearance/structured-data/article)（更新 2026-09-08；核对 2026-11-27） |
| G23.11 | Product / Offer 用于具体商品的价格、可用性等信息，适用产品结果与商家政策 | 工具的付费方案只在类型适用且价格真实时用 | 官方建议 | [G23](https://developers.google.com/search/docs/appearance/structured-data/product)（更新 2025-12-10；核对 2026-11-27） |
| G19.11 | FAQ 富结果自 2026-05-07 不再显示，2026-06-15 移除文档；HowTo 富结果 2023-09 已停止 | 不为富结果新增 `FAQPage` / `HowTo` 标记；已有标记不计收益，FAQ 正文按读者需要留 | 官方说明 | [更新日志](https://developers.google.com/search/updates)（更新 2026-11-24；核对 2026-11-27）；[G35](https://developers.google.com/search/blog/2023/08/howto-faq-changes)（更新 2023-09-14；核对 2026-11-27） |

## 四、页面体验

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G25.11 | 没有单一的页面体验信号；关注整体体验和 Core Web Vitals，优秀体验也不保证排名 | 速度以 CrUX 现场数据为准，实验室分数用来排查；段 4 闸门 6 的分数线与 TBT 标为项目自设 | 官方建议 | [G25](https://developers.google.com/search/docs/appearance/page-experience)（更新 2026-09-22；核对 2026-11-27） |
| G25.12 | HTTPS、不用妨碍使用的侵入式插页，是页面体验自查的一部分 | 首页、工具页、文章全站 HTTPS；弹窗不挡主要内容 | 官方建议 | [G25](https://developers.google.com/search/docs/appearance/page-experience)（更新 2026-09-22；核对 2026-11-27） |

## 五、多语言与地区

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G27.11 | 语言或地区版本用不同 URL；hreflang 每个版本列出自己和全部变体、互相引用、用完整 URL，可用 `x-default` 指向后备页；不只靠自动跳转 | 每个 locale 一套独立 URL 与完整互指；不按 IP 自动跳语言 | 官方建议 | [G27](https://developers.google.com/search/docs/specialty/international/localized-versions)（更新 2026-09-21；核对 2026-11-27） |

## 六、图片与视频

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G28.11 | 图片与周边内容相关，用描述性 alt、可抓取的图片 URL 和合适格式 | 图片 URL 不被 robots 挡、格式与体积合适；alt 按这一张图写（文案按 write 的站内页面卡） | 官方建议 | [G28](https://developers.google.com/search/docs/appearance/google-images)（更新 2026-03-02；核对 2026-11-27） |
| G29.11 | 视频要能被抓取和理解，有稳定可访问的观看页和缩略图；视频模式要求视频是观看页的主要内容 | 要视频进索引就做独立观看页和缩略图；视频只是配角的页不指望视频模式 | 官方建议 | [G29](https://developers.google.com/search/docs/appearance/video)（更新 2025-12-18；核对 2026-11-27） |

## 七、迁移与核心更新

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G33.11 | 逐 URL 映射，用永久服务端重定向，更新规范链接、内链和 sitemap 并监测；不把全部旧 URL 重定向到无关首页，大站分批迁 | 改版、换域、改 URL 前先出一对一映射表，冻结新旧 URL 版本；迁完按映射逐条回读 | 官方建议 | [G33](https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes)（更新 2026-08-20；核对 2026-11-27） |
| G31.11 | 核心更新后先用 Search Console 比较时间和页面；更新完成后至少等一整周再分析，改进效果可能要数日到数月；大幅下降后整体审视内容，避免匆忙大规模删除或表面修补 | 掉量排查先对更新窗口，不按固定周数判稳定；不为一次更新批量删页 | 官方建议 | [G31](https://developers.google.com/search/docs/appearance/core-updates)（更新 2025-12-10；核对 2026-11-27） |

## 八、AI 功能与 AI 爬虫

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G05.11 | 页面要成为 AI Overview / AI Mode 的支持链接，须已收录、有资格显示摘要，且 Search Console 的生成式 AI 控制允许纳入；符合也不保证展示 | AI 可见度排查先核这三件事，再谈内容形状 | 技术要求 | [G05](https://developers.google.com/search/docs/appearance/ai-features)（更新 2025-12-10；核对 2026-11-27）；[G34](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)（更新 2026-07-10；核对 2026-11-27） |
| G05.12 | 用 `nosnippet`、`data-nosnippet`、`max-snippet`、noindex 控制展示；Web 搜索报告包含 AI 功能流量 | 要进 AI 答案的页不加摘要限制；AI 曝光看生成式 AI 效果报告，总流量仍看 Web 搜索报告 | 官方建议 | [G05](https://developers.google.com/search/docs/appearance/ai-features)（更新 2025-12-10；核对 2026-11-27） |
| S01.11 | 生成式 AI 控制默认纳入，子属性通常继承上级；可排除 AI 功能里的链接和 grounding；不改变普通搜索排名，也不控制模型训练 | 段 5 核每个 Search Console 属性的实际继承值；排除会失去 AI 功能曝光 | 官方建议 | [S01](https://support.google.com/webmasters/answer/16908024)（更新未标注；核对 2026-11-27） |
| S02.11 | 生成式 AI 效果报告显示 AI Overview 和 AI Mode 的曝光及页面、国家、设备；曝光不足可能看不到报告 | 报告缺失记「曝光不足或未开放」，不记 0 | 官方建议 | [S02](https://support.google.com/webmasters/answer/16984139)（更新未标注；核对 2026-11-27） |
| O01.11 | OAI-SearchBot 用于搜索，GPTBot 用于可能的训练，robots 控制相互独立；ChatGPT-User 是用户触发访问，robots 规则可能不适用；禁了 OAI-SearchBot 就不会出现在 ChatGPT 搜索答案里 | rankup 的「AI 爬虫全部放行」是项目选择，比官方要求宽；只想要搜索可见、不想给训练时，官方允许放 OAI-SearchBot、禁 GPTBot | 官方建议 | [O01](https://platform.openai.com/docs/bots)（更新未标注；核对 2026-11-27） |
| P01.11 | PerplexityBot 用于发现并链接搜索结果、不用于训练基础模型，官方建议放行它和官方 IP；Perplexity-User 是用户触发访问，通常不遵守 robots.txt | robots 与 WAF 都放行 PerplexityBot 和官方 IP 段 | 官方建议 | [P01](https://docs.perplexity.ai/guides/bots)（更新未标注；核对 2026-11-27） |
| A01.11 | ClaudeBot 收集可能的训练内容，Claude-SearchBot 用于搜索，Claude-User 用于用户触发访问；三者各自可用 robots.txt 控制 | 按搜索、训练、用户访问三种目的分别写 robots 规则并逐 UA 实测 | 官方建议 | [A01](https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web-and-how-can-site-owners-block-the-crawler)（页面只标相对时间；核对 2026-11-27） |
| B01.11 | 提交规范 URL 的 sitemap、用可抓取的内链和 IndexNow，`lastmod` 要反映实际更新；伪装、操纵性堆词被禁止；这些信号帮助发现和 grounding，不保证收录或展示 | IndexNow 挂进发布流程，`lastmod` 只在内容真改时更新 | 官方建议；伪装与堆词属政策 | [B01](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a)（更新未标注；核对 2026-11-27） |

## 九、批量工具站红线（结构与批量造页）

内容侧（规模化内容滥用 G02.1、门页 G02.2、隐藏文本与堆词 G02.3、误导功能 G02.4、抓取复制 G02.5、薄弱联盟 G02.6）只在 write 官方层。这里收的是选品、页面规划、建站结构上会撞到的部分。

| 编号 | 官方条目 | 落到 rankup 怎么做 | 性质 | 来源（页面更新；核对） |
|---|---|---|---|---|
| G02.11 | 规模化内容滥用不看制作方式：人工、自动化、混合批量造出的低原创价值页面都可能适用 | 页面清单阶段就判：每个可索引页有没有这页独有的数据或工具结果；没有的不进清单 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27） |
| G02.12 | 门页：为相似查询做站点或页面，把用户引向比最终目的地更没用的中间页；如大量地域页通往同一目的地，或实质相似、更像搜索结果的页面 | 一组不互相竞争的词一个 URL，同一意图不开第二页；地域、型号这类批量维度先证明每页任务不同再拆 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27） |
| G02.13 | 伪装：给搜索引擎和用户看不同的内容 | raw HTML 与渲染后、爬虫 UA 与浏览器、手机与桌面是同一份正文；`ua-parity.mjs` 每类模板页一次 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27） |
| G02.14 | 过期域名滥用：买下过期域名改作主要为操纵排名、几乎没有用户价值的用途 | 买老域名只为承接同主题的真实产品；域名历史按段 5 核 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27） |
| G02.15 | 网站声誉滥用：主要借宿主网站既有排名信号发布第三方内容；第三方内容和联盟链接本身不自动违规，欧洲经济区政策另有差异 | 不在站内开放与主题无关的第三方子目录或子域借排名 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27） |
| G02.16 | 重复本身不等于垃圾违规，规范化用来合并 URL；但为操纵排名批量制造无价值的重复页可能触犯规模化或薄弱联盟政策 | 模板换词生成的近似页先合并到规范页，不靠 canonical 掩盖批量重复 | 政策 | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27）；[G11](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)（更新 2026-07-10；核对 2026-11-27） |
| G02.17 | 什么样的长尾页更不容易落入门页定义：页面自己满足不同的用户任务，有真实独立的功能或信息，而不是只为相似词设的中转页 | 页面规划两条规则的依据（见 [`playbooks/selection.md`](../playbooks/selection.md)、[`playbooks/build.md`](../playbooks/build.md)） | 推论（据 G02 与有用内容指南，不是官方豁免或保证） | [G02](https://developers.google.com/search/docs/essentials/spam-policies)（更新 2026-11-23；核对 2026-11-27）；[G03](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)（更新 2026-10-05；核对 2026-11-27） |
