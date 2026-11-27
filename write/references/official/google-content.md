---
last_verified: 2026-11-27
source: Google 官方 SEO 与 AI 搜索汇编（独立复核于 2026-11-27）；每行链接指向官方原页
---

# 官方层：Google 要求里和「写」有关的条目

站内页面的文字要过的官方要求。用法和规矩：

- 这是官方层。和经验层（`../practice/site-seo-notes.md`）、卡、参考文件里任何说法冲突时，以本文件为准。
- 默认先读「必读精简版」；写 title 与 description、结构化数据会用到的文案、评价或对比、AI 生成的稿时，再读对应小节全文。
- 每行一条，可执行。「写的时候怎么做」写不出动作的不收；只是背景知识的留在汇编原文。
- 每条带官方链接、页面标示的更新日期和核对日期。编号全文唯一：前半是汇编里的来源编号（G 是 Google 文档，Q01 是搜索质量评估员指南），后半是序号。别的文件（包括 rankup）只引用编号，不抄内容。
- 性质沿用汇编的四类：政策（违反会被处置）、技术要求、官方建议、官方说明（如明说不是排名因素）。政策类不照做就是违规；建议类不照做多半写不好；说明类告诉你别在哪儿白费力气。
- 长度类数字只在官方文档写了时收；没写的进经验层并标来源。
- 只收和写有关的：抓取、索引、sitemap、robots、hreflang、迁移、结构化数据实现、性能、AI 爬虫等技术条目在 rankup。
- `last_verified` 距今超过 90 天：用的人在报告写一行「官方层已 N 天未核对」，不阻塞。Google 公布核心更新或垃圾内容更新时立即核对。
- 更新办法：派一单逐条重读链接，对照改动，改条目和日期；汇编原文更新时同一次提交更新本文件。

## 必读精简版

1. 每页说清用途、对象和真实能力，不承诺做不到的功能。（G03.1、G02.4）
2. 每个长尾页自己完成一个具体任务；只为相似词把人导到同一目的地的页可能是门页。（G03.2、G02.2）
3. 不为操纵排名批量生成缺乏原创价值的换词页，人工、自动、混合制作都算。（G02.1）
4. 按读者合理期待交代谁做的、怎么做的（包括用没用自动化或 AI）、为什么做。（G03.3）
5. 发布前人工核对 AI 生成的正文、title、description、结构化数据会用到的值和图片 alt。（G04.1）
6. title 描述性、简洁、每页不同、和正文同语言；不堆词、不套换词模板、不留过时日期。（G07.1、G07.2）
7. description 每页准确且不同，可写真实价格、作者等事实，不罗列关键词。（G08.2）
8. 字数、title 与 description 的字符数、H 标签数量都不是官方要求，别为它们改稿。（G06.2、G06.4、G07.3、G08.3）
9. 不写只给爬虫看的隐藏文字，不堆关键词。（G02.3）
10. 转述他站内容要加上实质价值，注明来源不等于安全。（G02.5）
11. 对比和测评给第一手证据、优缺点和适用对象。（G32.1）
12. 结构化数据里的值都要在页面上看得见；不编评价，不搬他站评分。（G17.1、G24.1）
13. 不为富结果写 FAQ；FAQ 只在对读者有用时保留。（G19.1）
14. 写出超出通识的东西；同一任务的不同问法在一页里回答，不各开一页。（G34.1、G34.2）

## 一、有用内容与以人为本

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G03.1 | 内容要有原创信息、充分有深度的描述、清楚的标题、可靠的事实，以及相对其他搜索结果的实质价值 | 每页写出只有这页才有的东西：真实功能、限制、步骤、测试结果；写不出就不发 | 官方建议 | [有用内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | 2026-10-05 | 2026-11-27 |
| G03.2 | 内容要有既定的读者、第一手经验和网站的主要目的，读者来了能完成目标；不要只为搜索流量大量覆盖自己不熟的主题 | 每页先写一句「来这页要办成什么」；站点主题以外的页交回 rankup | 官方建议 | [有用内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | 2026-10-05 | 2026-11-27 |
| G03.3 | 信任是 E-E-A-T 里最重要的一环；按读者合理期待交代谁做的（Who）、怎么做的（How，含自动化）、为什么做（Why），主要目的应是帮助人 | 文章写明作者和方法；工具页写清数据来源、限制和工作方式；读者会在意时说明用了 AI | 官方建议 | [有用内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | 2026-10-05 | 2026-11-27 |
| G03.4 | 健康、财务、安全、社会福祉等 YMYL 主题需要更强的可信度 | 这类页面的事实只用权威来源，拿不准的写明，不写个人推测 | 官方建议 | [有用内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | 2026-10-05 | 2026-11-27 |
| G06.1 | 用自然、清楚、组织良好的内容帮读者，用可描述的词和有意义的链接帮助发现 | 标题和正文用读者会搜的说法；锚文本写目的页讲什么，不写「点这里」 | 官方建议 | [SEO 入门](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | 2025-12-10 | 2026-11-27 |
| G32.1 | 评价类内容要展示第一手证据、比较选项、解释优缺点，并用定量测量支持判断 | 对比、测评页写真实测试的输入、结果和适用对象；没测过的不下结论 | 官方建议 | [高质量评价](https://developers.google.com/search/docs/specialty/ecommerce/write-high-quality-reviews) | 2025-12-10 | 2026-11-27 |
| Q01.1 | 评估员指南：主内容是直接帮页面实现目的的部分，可以包括工具功能；按投入、原创性、技能评判，信息类还看准确性 | 首页展示真实功能，长尾页真的完成任务，文章提供准确有用的信息 | 官方说明（评估员指南，评分不直接决定排名） | [评估员指南 PDF](https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf) | 2025-09-11（版本） | 2026-11-27 |
| Q01.2 | 评估员指南：几乎全部主内容是复制、改写、嵌入、自动或 AI 生成，又几乎没有投入、原创和增值的评最低；单用 AI、复制或注明来源本身不决定等级，做工具功能也算投入 | 可以用 AI 起稿，但每页要有人加进去的东西：核过的事实、真实运行结果、本页独有的限制 | 官方说明（评估员指南，评分不直接决定排名） | [评估员指南 PDF](https://static.googleusercontent.com/media/guidelines.raterhub.com/en//searchqualityevaluatorguidelines.pdf) | 2025-09-11（版本） | 2026-11-27 |

## 二、垃圾内容政策里和写页面有关的

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G02.1 | 规模化内容滥用：主要为操纵排名而批量生成大量缺乏原创价值的页面；人工、自动化、混合制作都适用 | 批量页逐页写本页独有的内容；两页目标词对调仍读得通的重写或建议合并 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |
| G02.2 | 门页：为相似查询做页面，把用户引向比最终目的地更没用的中间页 | 长尾页自己完成用户任务（工具可用或答案完整），不做只为导流的中转页 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |
| G02.3 | 隐藏文本与关键词堆砌：为操纵搜索对人隐藏文字，或不自然地堆词 | 不写只给爬虫看的文字；目标词自然出现，不设密度目标；title、description 不罗列关键词 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |
| G02.4 | 误导功能：承诺无法提供的工具功能 | 标题、描述、正文只写产品真能做的；做不到的场景不写成能做到 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |
| G02.5 | 抓取复制：对他站内容稍作修改、拼接或嵌入而没有实质附加价值，注明来源也不自动安全 | 转述别人的资料后加上本站独有的结果或分析；整合型文章页按 blog 的摘录规则 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |
| G02.6 | 薄弱联盟：照搬商家的商品描述或评价，没有原创或增值；联盟链接本身不违规 | 推荐页写实测、独立比较和有用信息，不照搬对方描述 | 政策 | [垃圾内容政策](https://developers.google.com/search/docs/essentials/spam-policies) | 2026-11-23 | 2026-11-27 |

## 三、AI 生成内容

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G04.1 | 生成式 AI 可以辅助研究或组织原创内容；内容、元数据和结构化数据都要注意准确、质量和相关性，批量生成又没有增益的页可能违规（见 G02.1） | 发布前人工核对 AI 生成的正文、title、description、结构化数据会用到的值和图片 alt；批量生成后逐页补独有内容再交 | 官方建议 | [使用生成式 AI 内容](https://developers.google.com/search/docs/fundamentals/using-gen-ai-content) | 2026-10-01 | 2026-11-27 |

## 四、标题链接（title）

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G07.1 | Google 会从 title、页面上的标题等来源自动生成标题链接；title 要描述性强、简洁、能区分页面，匹配页面的语言和内容 | 每页 title 写这页独有的用途，和正文同语言；批量页逐页不同 | 官方建议 | [标题链接](https://developers.google.com/search/docs/appearance/title-link) | 2025-12-10 | 2026-11-27 |
| G07.2 | 避免堆词、重复的模板化标题和过时的日期 | 不在 title 罗列关键词；不用只换一个词的模板；title 里的年份和日期跟着内容更新 | 官方建议 | [标题链接](https://developers.google.com/search/docs/appearance/title-link) | 2025-12-10 | 2026-11-27 |
| G07.3 | title 没有固定的字符上限，显示会自动调整 | 字符数只当提示（`check.py --meta` 的区间是经验口径，见经验层 E12），不为凑字数改 title | 官方说明 | [标题链接](https://developers.google.com/search/docs/appearance/title-link) | 2025-12-10 | 2026-11-27 |

## 五、摘要与 meta description

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G08.1 | 摘要主要来自页面内容，也可能用 meta description | 正文开头就写清这页能办成什么；description 和正文说的是同一件事 | 官方说明 | [摘要](https://developers.google.com/search/docs/appearance/snippet) | 2026-04-20 | 2026-11-27 |
| G08.2 | 每页写准确且有差别的描述，可以包含真实的价格、作者等事实，避免罗列关键词 | description 写一两句具体结果和一个真实事实；批量页逐页不同 | 官方建议 | [摘要](https://developers.google.com/search/docs/appearance/snippet) | 2026-04-20 | 2026-11-27 |
| G08.3 | description 没有固定长度上限，展示会按设备截断 | 长度只当提示，不为凑长度加内容 | 官方说明 | [摘要](https://developers.google.com/search/docs/appearance/snippet) | 2026-04-20 | 2026-11-27 |

## 六、结构化数据的内容侧

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G17.1 | 结构化数据要和用户可见的内容一致、相关、完整；符合政策也不保证富结果 | 价格、评分、作者、日期、FAQ 等值都要在页面上看得见；页面没有的不交给结构化数据 | 政策 | [结构化数据政策](https://developers.google.com/search/docs/appearance/structured-data/sd-policies) | 2026-07-10 | 2026-11-27 |
| G24.1 | 评价要反映真实评价；机构或本地商家对自己服务的星级评价不显示星级；不得聚合他站评分，不得发布虚假或没披露利益交换的评价 | 不编评价，不搬他站评分；有利益交换的评价写明 | 政策 | [评价摘要](https://developers.google.com/search/docs/appearance/structured-data/review-snippet) | 2026-09-08 | 2026-11-27 |
| G18.1 | 软件应用富结果要名称、报价价格以及评分或评价；免费应用价格为 0 | 页面上写的价格和评分要与交给结构化数据的一致，免费就写免费 | 官方建议 | [软件应用](https://developers.google.com/search/docs/appearance/structured-data/software-app) | 2026-09-08 | 2026-11-27 |
| G19.1 | FAQ 富结果自 2026-05-07 不再显示，文档 2026-06-15 移除；HowTo 富结果 2023-09 已停止 | 不为富结果加 FAQ；FAQ 只在对读者有用时保留，并在页面上显示 | 官方说明 | [文档更新日志](https://developers.google.com/search/updates) | 2026-11-24 | 2026-11-27 |

## 七、AI 功能（AI Overviews、AI Mode）

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G34.1 | 要提供超出通识的独特见解；不必为 AI 把内容拆成小块 | 写本站独有的数据、限制和操作结果；按读者阅读需要分段，不为 AI 刻意切段 | 官方建议 | [AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | 2026-07-10 | 2026-11-27 |
| G34.2 | 不需要为每种查询变体单独建页；以操纵排名或 AI 回答为主要目的、为查询变体大量单独造页可触犯规模化内容滥用 | 同一任务的不同问法在一页里回答（小节或 FAQ），不各开一页 | 官方建议 | [AI 优化指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) | 2026-07-10 | 2026-11-27 |
| G05.1 | 页面要成为 AI 功能的支持链接，须已收录、能显示摘要，且站点允许纳入；符合也不保证展示 | 写作上不另做 AI 版本，按普通页面把答案写清；是否阻止摘要是技术决定，交 rankup | 技术要求 | [AI 功能](https://developers.google.com/search/docs/appearance/ai-features) | 2025-12-10 | 2026-11-27 |

## 八、官方明确说不是排名因素或没有用的做法

写作时别追这些：

| G 编号 | 官方要求（一句话） | 写的时候怎么做 | 性质 | 官方链接 | 页面更新日期 | 核对日期 |
|---|---|---|---|---|---|---|
| G06.2 | 字数没有排名需要的最小、最大或理想目标，长度本身不决定排名 | 不设字数目标；页面能完成任务就停，薄了补本页独有的事实 | 官方说明：这不是排名因素 | [SEO 入门](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | 2025-12-10 | 2026-11-27 |
| G06.3 | meta keywords 不用于 Google 搜索排名 | 不写 meta keywords | 官方说明：这不是排名因素 | [SEO 入门](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | 2025-12-10 | 2026-11-27 |
| G06.4 | 没有理想的标题（H 标签）数量，也没有必须的排列顺序；语义顺序有利于读屏 | H2、H3 按内容需要写，不凑数量；层级保持语义顺序 | 官方说明：这不是排名因素 | [SEO 入门](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) | 2025-12-10 | 2026-11-27 |
| G03.5 | E-E-A-T 不是单独的特定排名因素；评估员的分数不直接决定页面排名 | 把 E-E-A-T 和评估员指南当写作自查，不当打分公式 | 官方说明：这不是排名因素 | [有用内容](https://developers.google.com/search/docs/fundamentals/creating-helpful-content) | 2026-10-05 | 2026-11-27 |
| G05.2 | AI 功能不要求新建 AI 文本文件或特殊 schema；llms.txt 不影响 Search 的可见度或排名 | 不为 AI 另写一份文字或 llms.txt 指望排名 | 官方说明：这不是排名因素 | [AI 功能](https://developers.google.com/search/docs/appearance/ai-features)；[文档更新日志](https://developers.google.com/search/updates) | 2025-12-10；2026-11-24 | 2026-11-27 |
