---
name: rankup
description: 网站从零到一与长期增长的总控 Skill。用于新建网站、SaaS、工具站或内容站，规划或初始化 TanStack Start Monorepo，使用 Cloudflare Workers、D1、R2 部署全栈应用，接入支付，执行 SEO、内容、外链、上线验证和持续迭代；也负责 Google Trends 查询、关键词难度（KD）估算与选词工作流；2026 AI 搜索范式（AI Overviews、AI Mode、Preferred Sources、Discover 独立算法、Information Gain、引用优先于排名）；AI Agent 就绪度评分（is-agentic、agent readiness、llms.txt、MCP 可发现性、AI 代理优化）。用户提到 rankup、rankup init、rankup check、环节闸门、检查清单、checklist、"现在该做什么"、"到哪一步了"、"这个环节能不能过"、"本轮还差什么"、建站、网站改版、搜索流量、GSC、排名、关键词、CTR、索引、网站增长，或提到 谷歌趋势、Google Trends、搜索热度、热度对比、搜索趋势、trending、"XX 和 YY 哪个更火"、"今天美国/日本在搜什么"、每日热搜、"这个词能不能做站"、"哪个市场/国家有机会"、帮我选 SEO 关键词、选词、选品调研、市场探测、挖需求、找需求、需求挖掘、找方向、找选题、"最近有什么能做的"、"找几个关键词"、"挖个新词的工具站"、"看看有什么游戏站能做"、竞品调研、榜单调研、差评挖掘、反查谁在赚钱、关键词难度、KD、竞争度、SERP 分析、"这个词难不难做"、"做这个词要多少外链"，或提到 哥飞、web.cafe、哥飞论坛、哥飞的朋友们、悬赏、悬赏问答、经验帖、"群里怎么说的"、"社群里有没有讲过"、"论坛里搜一下"、"哥飞说过什么"、哥飞.ai，或提到 AI 搜索优化、AI Overviews、AI Mode、被 AI 引用、AEO、GEO、Preferred Sources、Discover 优化、Google 算法更新、核心更新、spam 更新、Information Gain，或提到 AI Agent 就绪度、is-agentic、agent readiness、llms.txt、对 AI 代理友好、AI 代理优化、agent-friendly、agentic score 时使用。也覆盖用户真正会打出来的模糊说法：我想让流量涨一点、今天弄下 SEO、帮我看看这个站有什么问题、优化一下我的网站、流量掉了、排名没了、是不是被 K 了、怎么一直不收录、新页面多久能进索引、提交 sitemap、IndexNow、站慢不慢、跑个性能、Core Web Vitals、PageSpeed、Lighthouse、全站内链失效、TDK、标题描述怎么写、关键词密度、能不能上线了、上线前还差什么、帮我搞点外链、外链、反链、去哪发外链、抓一下后台数据、导出报表、数据面板、这站没有 API、访客不注册、没人付费、定价怎么定、要不要上多语言、hreflang、发个 Product Hunt、跑一下小游戏监测。也覆盖：词根、扩词、扩词树、占位链接、占位文案、变现、PayPal、域名黑历史、域名前世、单语种、hello@、"这个域名能不能用"、"看下这批数据有没有能做的关键词"、"调研一下这个词"、"review 一下我的站"、"数据检测平台都接入了吗"、"把 Ahrefs 的检验结果都修了"、"我们开始执行这个项目的计划"、"一步步来"、"调研一下这关键词"、"我们做个网站吧"、"我们做个内页吧"、"把这个关键词做成内页"、"看一下 GEO 有没有问题"、"SEO 有没有问题"、"把这个经验写进 rankup"、"记下来更新到源码里"、"帮我生成 logo"、配图、封面、og 图、"写一下这页的文案"、"AI 味太重"、"帮我改稿"、"语言结构理顺"、"文案怎么写才有人点"、"用户为什么不买"、"Reddit 上怎么说"、"X 上有没有人讨论"、社区验证、社区调研、"做个好看的页面"、设计参考、组件库参考、"Hero 怎么设计"、"landing page 怎么排"、动画效果、动效、页面设计灵感、21st.dev。
metadata:
  version: "3.2.0"
---

# Rankup 3.0

给独立开发者用：做产品，也做关键词流量站、AI 工具、桌面客户端上架商店、付费订阅。
共同点是靠 SEO + GEO 拿免费曝光导到自己的平台；市场是全球，任何语种任何国家，有流量就做。
本文件只做两件事：把一句话落到七段生命周期的哪一段，以及每段的硬规则。怎么干活的纪律在 [`references/discipline.md`](references/discipline.md)。

## 一句话落到哪一段

用户不会说「跑一下 seo-audit.mjs」，他会说下面这些话。命中就照入口走，不要自己现编步骤。

| 用户会说的话 | 段 | 入口 |
|---|---|---|
| 「看下这批数据有没有能做的关键词」「找几个关键词」「挖点需求」「最近有什么能做的」 | 1 | [`playbooks/research.md`](references/playbooks/research.md)（P0 分流 → 词根调研） |
| 「调研一下这个词」「调研一下这关键词」「调研的关键词」「这个词能不能做站」「这词难不难」「帮我扩词」 | 1 | `research.md` **P2 词根调研**：任何词都是词根，先直接搜再扩树（旧 P3 已并入 P2，不再有单独的扩词流水线） |
| 「谁在赚钱」「反查这个站」「竞品最近在做什么」「帖子说月入 X 是真的吗」 | 1 | `research.md` P4 + [`demand-sources.md`](references/demand-sources.md) 第十节 |
| 「XX 和 YY 哪个更火」「今天美国/日本在搜什么」「哪个国家有机会」 | 1–2 | [`trends.md`](references/trends.md)，`scripts/gt.py` |
| 「有什么游戏站能做」「跑一下小游戏监测」 | 1 | `game-opportunity` Skill；建站再读 [`game-sites.md`](references/game-sites.md) |
| 「这个方向做不做」「做哪个语种」「要不要上多语言」「做成工具还是内容站」 | 2 | [`lifecycle.md`](references/lifecycle.md) 段 2 |
| 「我们做个网站吧」「新建个站」「想做个工具站」「帮我搭起来」 | 2→3 | 先过段 2 立项定位，再段 3 初始化；手上没有词树先回段 1，不许跳过 |
| 「一步步来」「我们开始执行这个项目的计划」 | check | 先 `rankup check` 定位当前段与第一个没过的闸，然后按 [`checklists.md`](references/checklists.md) 逐环节推进，每过一闸记 `checks.md`；不要跳过 check 直接猜段 |
| 「做个功能吧」「加个 X 功能」「把这个做出来」「实现一下这个」 | 3 | **红线先行：任何 UI 一律用脚手架自带的 shadcn 组件库**（`components/ui/`），缺的 `shadcn add` 或装同生态的现成组件，禁止手写下拉框 / 弹窗 / 日期选择 / 表格分页 / Toast；然后按段 3 硬规则与 `checklists.md` 段 3 做，做完段 4 全套体检 |
| 开发时挂着当规范：「按 rankup 规范来」「这个页面这样写行不行」「这块要不要 SSR」 | 3–4 | 本文段 3、段 4 硬规则 + `checklists.md` 对应段 |
| 「我们做个内页吧」「把这个关键词做成内页」「关键词没问题了，做成内页」 | 4 | **一个关键词对应一个内页**：目标词登记、TDK、独立 OG 含图、密度、无占位、体检全套；页面上的控件同样只准来自组件库（红线，见 `discipline.md` 十六）；`lifecycle.md` 段 4 + `checklists.md` 段 4 |
| 「看一下 SEO 有没有问题」「看一下 GEO 有没有问题」「GEO/SEO 有没有问题」 | 4 | 段 4 体检：`seo-audit.mjs`、`is-agentic.mjs`、`seo-webcafe.mjs audit`、哥飞 AI；分组见 [`playbooks/site-review.md`](references/playbooks/site-review.md) A / C / E 组 |
| 「能不能上线了」「上线前还差什么」「TDK」「关键词密度」「标题描述怎么写」 | 4 | `checklists.md` 段 4 + [`seo-box.md`](references/seo-box.md) |
| 「怎么被 AI 引用」「llms.txt」「对 AI 代理友好吗」「AEO/GEO」 | 4 | [`seo-growth.md`](references/seo-growth.md) 三-B |
| 「帮我生成 logo / 配图 / 封面 / 海报」「要张 og 图」「画个吉祥物」 | 3–4 | `/imagegen`：图片必须真实生成，不允许占位图 |
| 「做个好看的页面」「有没有什么好的设计参考」「Hero 怎么设计」「找个组件参考」「landing page 怎么排」「有什么动画效果」「页面设计灵感」 | 3 | 先浏览 [`design-references.md`](references/design-references.md) 收录站的相关分类，选 2–3 个案例参考后再实现；基础控件仍走 shadcn 组件库红线 |
| 「写一下这页的文案」「这稿子 AI 味太重」「帮我改稿」「语言结构理顺一点」「怎么写才会被 AI 引用」 | 4 | 中文：`/write`（先确认它的五个附属 Skill 都在，缺的用 `find-skills` 装齐；装不上才退到 `/human-writing` 起稿 → `/shuorenhua` 去 AI 味，见 [`skill-ecosystem.md`](references/skill-ecosystem.md)）；内容形状按 `/ai-seo` 的 content-patterns；JSON-LD 只取 `/seo-geo` 的模板 |
| 「文案怎么写才有人点」「定价页怎么排」「用户为什么不买」「还有什么渠道能推」 | 7 | `/marketing-psychology`（锚定、社会认同、损失厌恶等用在页面与定价上）+ `/marketing-ideas`（渠道清单）；判据仍以 [`conversion.md`](references/experiences/conversion.md) 为准 |
| 「站慢不慢」「跑个性能」「Core Web Vitals」 | 4 | `seo-box.md` 一，`scripts/pagespeed.mjs plan --strategy both` |
| 「这个域名能不能用」「域名前世」「域名黑历史」 | 5 | `lifecycle.md` 段 5 黑历史闸门 + [`seo-webcafe.md`](references/seo-webcafe.md) `history` |
| 「数据检测平台都接入了吗」「GSC 接了没」「提交 sitemap」「怎么一直不收录」 | 5 | [`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md) |
| 「把 Ahrefs 的检验结果都修了」「全站内链失效」「重定向链」 | 5→4 | `scripts/ahrefs-site-audit.mjs` 取清单，修完按段 4 全套重跑 |
| 「帮我搞点外链」「去哪发外链」「竞品的外链哪来的」「这些外链有没有毒」 | 6 | `backlink` Skill + [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五 |
| 「发个 Product Hunt」「上架发布平台」 | 6 | [`product-launch.md`](references/product-launch.md) |
| 「访客不注册」「没人付费」「定价怎么定」「接 PayPal」「AdSense 被拒」 | 7 | [`monetization.md`](references/monetization.md)、[`conversion.md`](references/experiences/conversion.md) |
| 「流量掉了」「排名没了」「是不是被 K 了」 | 7 | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 十七～十九 |
| 「现在该做什么」「到哪一步了」「本轮还差什么」 | check | 本文 `rankup check` → `site-review.md` 二 |
| 「review 一下我的站」「帮我看看这个站有什么问题」「查漏补缺」「这项目脱轨了」 | review | 本文 `rankup review` → `site-review.md` 一 |
| 「我想让流量涨一点」「今天弄下 SEO」「优化一下我的网站」 | check | 先 `rankup check` 定位第一个没过闸的段；默认打磨转化链路，不重构（[`zero-to-one.md`](references/experiences/zero-to-one.md)） |
| 「把这个老项目接进来」「rankup init」 | init | 本文 `rankup init` → [`project-memory.md`](references/project-memory.md) |
| 「群里怎么说的」「哥飞说过什么」「论坛里搜一下」 | 经验 | [`webcafe-forum.md`](references/webcafe-forum.md)，`scripts/webcafe-forum.mjs chat-search` 拿原文，不问 ask |
| 「我看到一个帖子分享 SEO 的东西，你把这东西记下来更新到源码里」「把这个经验写进 rankup」 | 维护 | 维护 Skill 本身：按 [`experiences/INDEX.md`](references/experiences/INDEX.md) 收录规则与 [`evolution.md`](references/evolution.md) 晋升门写进**对应的现有文件**，不新建文件；见文末「经验回流」 |
| 「抓一下后台数据」「导出报表」「数据面板」「Semrush 能查这个吗」 | 取数 | [`discipline.md`](references/discipline.md) 六 + [`provider-capabilities.md`](references/provider-capabilities.md)：有脚本先跑，没有才加载 `backlink` |
| 说的事这张表没有 | — | [`capability-map.md`](references/capability-map.md) → [`skill-ecosystem.md`](references/skill-ecosystem.md) → `/skillsmp` → 最后才按 [`integrations.md`](references/integrations.md) 用 find-skills；不要现写等价实现 |
| 本文点名的任何兄弟 Skill 本机没装 | — | 加载 `find-skills` 搜索并安装，装完再继续；不跳过、不现写替代。每台机器装的不一样，文档只保证「该用什么」（[`skill-ecosystem.md`](references/skill-ecosystem.md)「缺 Skill 的处置」） |

越模糊越不要盲跑全套：有明确对象就先跑最便宜的那个脚本；只有方向没对象就先 `rankup check`；连站都没有只问一个问题（有没有想好的词），不要连问三个。

## 七段生命周期

旧的 12 阶段编号与七段的映射表在 [`lifecycle.md`](references/lifecycle.md) 顶部；项目里旧 `checks.md` 按它对照。每段四块：触发 / 入口 / 硬规则 / 闸门。不写操作步骤。

### 1 调研

- **触发**：给了一批数据、一个词、一个帖子、一个域名，问「能不能做」。
- **入口**：[`playbooks/research.md`](references/playbooks/research.md)（P0 只看输入分流：什么都没有 → P1；一个词 → **P2 词根调研**；一个域名 → P4）；判读 [`demand-discovery.md`](references/experiences/demand-discovery.md)；意图核验在 [`lifecycle.md`](references/lifecycle.md) 段 1 · 1.2；验收单 `research-checklist.md`（不是入口）。常用脚本：`scripts/demand/suggest.mjs`（三引擎下拉联想）、`scripts/seo-webcafe.mjs kd`、`backlink/scripts/semrush-keyword.mjs`；面板取证 `scripts/rankup-cli.mjs`（`npx @yan-labs/rankup audit similarweb`）。

| 硬规则 | 为什么 |
|---|---|
| 用户给的任何词都是**词根**：先直接搜，再扩成树（面板相关词 + Google/Bing/DDG 下拉；叶子再扩，最多两层；叶子月量低于阈值或 KD 高于阈值就停） | 用户给的是方向不是答案，一个词查完就下结论会漏掉整棵树 |
| 筛子：月量太低且 CPC 低 = 否；KD 低好上手 | 量低又没人出价，说明没人为它付钱 |
| **社区验证是必走的一条腿**：Reddit / X / YouTube / B 站近 14 天讨论量。取数走兄弟 Skill：`/agent-reach`（先 `agent-reach doctor --json` 看各平台后端，再按 `research.md` 阶段 5 的命令组跑）、`/anysearch` 批量网页搜索、`/deep-research` 只做定性背景；rankup 自带的只有 `reddit-wishes.mjs` 与 `hn-signals.mjs`；搜索侧用 `scripts/gt.py compare <词> --time 1d`（Trends 过去 1 小时 / 4 小时 / 1 天的小时级曲线，新词单独查不和大词同框） | 数据平台只有 28 天窗口，昨天火起来的看不到；Trends 的 now 区间是唯一能看到小时级的公开源；论坛热度是第一手的，帖子一星期内炸开面板上还是 0 |
| 亲眼看 SERP，用页面类型核实**真实意图** | 宠物诊断那次：词看着是工具需求，首页全是兽医内容，做工具就错了 |
| 空结果先核 manifest：429 / CAPTCHA / 超时都产出 0 条 | 采集失败 ≠ 没需求，把失败读成结论是最贵的错 |
| **开跑前先 grep 项目的 `.rankup/rejected.md` 与 `research/`**：上一轮 pass 掉的词或方向，命中就跳过并引用，或写明复活条件已满足再重开；本轮 pass 掉的带理由与复活条件写回 `rejected.md` | 换个会话就把否决过的东西当新点子重做一遍、再踩同一个坑，是项目记忆最常见的失效形态；理由留着，条件变了才能有据翻案 |
| 结论要折成钱：查同类站真实流量，`seo-webcafe.mjs money` | 能排上去 ≠ 能赚钱，漏掉这道闸会得出 SEO 正确、商业错误的结论 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 1。

### 2 立项与定位

- **触发**：方向已有，问做不做、做哪个语种、做成什么形态。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 2；语种探测 [`trends.md`](references/trends.md) W1；裁定 [`zero-to-one.md`](references/experiences/zero-to-one.md)、[`webcafe-topics.md`](references/experiences/webcafe-topics.md) 七。

| 硬规则 | 为什么 |
|---|---|
| 第一目标是拿到流量，语种跟着流量走：先看哪个语种量大竞争小 | 没流量的定位再漂亮也验证不了 |
| 某语种流量大竞争小就**只做单语站**，不做多语言 | 多语言是翻车最多的路，还把权重摊薄；要上也是先 2–3 个语言、hreflang 代码统一生成、禁止按 IP 跳转 |
| 意图类型决定产品形态与变现方式：信息型 → 内容站 → 广告；工具型 → 在线工具 / 客户端 → 一次付费或订阅；持续使用型 → SaaS → 订阅 | 形态跟着意图走，不跟着技术偏好走 |
| 写清「1」的定义与放弃条件 | 0→1 最常见的死法是不知道什么时候该停 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 2。

### 3 建站与开发

- **触发**：「帮我搭起来」，或开发中把本 Skill 当规范挂着。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 3 + [`cloudflare-stack.md`](references/cloudflare-stack.md)（脚手架命令原文、资源选择、8.6 邮箱）；三方库/服务优先见 [`integrations.md`](references/integrations.md)。常用：`gh repo create --private`、`wrangler types`、对 dev server 跑 `scripts/seo-audit.mjs`。

| 硬规则 | 为什么 |
|---|---|
| **一律**用 `cloudflare-stack.md` 第 1 节那条 shadcn monorepo 初始化命令，禁止其他脚手架 | 一套栈一套坑，换脚手架等于把四个已踩过的坑重踩一遍 |
| **GitHub 私有仓** + Cloudflare（Workers / D1 / R2 / KV 按需启用，不为「以后可能」提前建） | 脚手架跑通就建仓推远端；未上线仓库里带着选题与定价，公开等于送人 |
| 不重复造轮子，优先接三方库/服务 | 自己写的登录、支付、邮件是最贵的技术债 |
| **任何功能、任何 UI 一律用脚手架自带的 shadcn 组件库**（`components/ui/`）；库里没有的先 `pnpm dlx shadcn@latest add <组件>` 或装现成的 shadcn / React 生态组件，**禁止手写下拉框、弹窗、日期选择、表格分页这类基础控件** | 脚手架初始化时组件库已经在了，手写一个下拉框等于放弃可访问性、键盘导航、暗色模式和一致的视觉，且每个站各写一遍没人维护 |
| **做页面级设计（Hero / landing page / 定价页 / 关于页 / 404 / 登录页）或需要动画动效时，先浏览 [`design-references.md`](references/design-references.md) 收录的组件库参考站**，选 2–3 个案例参考后再实现；基础控件红线不变 | 凭空设计的页面视觉质量不稳定，参考真人设计工程师的现成案例再适配，省时间且质量高；shadcn 生态的组件库（如 21st.dev）和我们的脚手架直接兼容 |
| 域名做成**一处配置留位**，开发期不接正式域名 | 域名在段 5 才定稿，提前硬编码会在换域名时漏改 |
| **任何页面不得出现占位链接 / 占位文案 / 占位图片** | Google 判垃圾站，红线；宁可整块删掉（[`discipline.md`](references/discipline.md) 十四） |
| 网站需要任何视觉素材（logo、favicon 源图、og:image、内页配图、用户场景图、插画）→ 加载 `/imagegen` 真实生成 | 占位图是红线，而段 4 要求每页独立 og:image 必须有图，没有生成能力就只剩占位一条路 |
| 邮箱一律 Cloudflare Email Routing 的 `hello@` | 一个约定，免得每个站各起一个、验证时各找一遍 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 3。

### 4 上线前 SEO / GEO

- **触发**：「能不能上线了」「TDK」「密度」「怎么被 AI 引用」「站慢不慢」。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 4；判读 [`seo-box.md`](references/seo-box.md)、[`seo-webcafe.md`](references/seo-webcafe.md)、[`seo-growth.md`](references/seo-growth.md) 三-B。常用：`scripts/seo-audit.mjs --sitemap`、`scripts/pagespeed.mjs plan --strategy both`、`scripts/is-agentic.mjs scan --save`、`seo-webcafe.mjs audit` / `chat`。写文案的兄弟 Skill：中文 `/write`（先确认它的五个附属 Skill 都在，缺的用 `find-skills` 装齐；装不上才退到 `/human-writing` 起稿 + `/shuorenhua` 去 AI 味）；被 AI 引用的内容形状读 `/ai-seo` 的 content-patterns；JSON-LD 模板只读 `/seo-geo` 的 schema-templates，不跑它的脚本；配图 `/imagegen`。分工与加载条件见 [`skill-ecosystem.md`](references/skill-ecosystem.md)。

| 硬规则 | 为什么 |
|---|---|
| 在预览域上做完，预览域 **noindex** | 半成品被收录，第一印象就是半成品 |
| **一个关键词对应一个内页**；「做成内页」必做：目标词登记进 `keywords.md`、TDK、独立 OG 含图、密度、无占位、体检全套 | 一页扛多个词会互相稀释，首页覆盖太多词是排名波动的常见根因 |
| 每页目标词 + 密度达标；价格表等无关区块改**客户端加载**，SSR 只输出目标文案（与 `seo-growth.md` 的「首次交互后注入」是同一节） | 密度按 SSR 输出的 HTML 算，无关区块会把目标词冲淡 |
| 每页独立 meta / OG 且**必须有图** | 共享 OG 让全站在社交分享里一张脸，没图的分享卡没人点 |
| 正文是给人读的，不是给密度工具凑的：起稿后必须过一遍去 AI 味与结构梳理（中文走 `/write` 阶段四或 `/shuorenhua`，英文按 `/ai-seo` 的 Information Gain 判据自查），首屏一句话说清这页解决什么。**中英文都查四样**：矫饰文风（用比喻花腔代替直说，有直说就直说）、句子密度（一句一个意思）、引文标记（别人的话打引号注出处，最多一处）、格式克制（列表只在内容确实多面时用）——判据与自查正则在 `/write` 阶段四 | 模板腔与空话会被 AI 搜索跳过、被读者秒关；Information Gain 是 2026 排名与被引用的共同判据；矫饰句读者一眼能认出是模型写的 |
| llms.txt / GEO 按 `seo-growth.md` 三-B 做：Google 定论 AEO/GEO 就是 SEO | 不需要第二套方法论，也不要加载会跑付费凭据的兄弟 Skill 脚本 |
| **每次页面改动全套检测重跑**：TDK、密度、seo.web.cafe audit、哥飞 AI 二次意见 | 只重跑改到的两项会漏掉连带影响 |
| 证据必填：控制台绿图标不算，`pagespeed` 现场那块不存在 = CrUX 流量不足，不是通过 | 这套东西唯一致命的失败形态是看着全绿、底下什么都没有 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 4。

### 5 上线与接入

- **触发**：「数据检测平台都接入了吗」「这个域名能不能用」「提交 sitemap」「把 Ahrefs 的检验结果都修了」。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 5；[`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md)；域名接入 [`cloudflare-stack.md`](references/cloudflare-stack.md) 8.5。常用：`scripts/cf-analytics-setup.mjs`、`scripts/indexnow-submit.mjs`、`scripts/webmaster-sitemap.mjs`、`scripts/ahrefs-site-audit.mjs`。

| 硬规则 | 为什么 |
|---|---|
| **部署一律走 Cloudflare 原生 Git 集成**（Pages「Git 存储库连接」/ Worker Workers Builds），push `main` 自动构建部署；**不写 GitHub Actions 部署 workflow**；本地 `wrangler deploy` 只作应急兜底。模板与坑见 [`cloudflare-stack.md`](references/cloudflare-stack.md) §9 | GitHub Actions 免费额度用完就断，Cloudflare 构建额度对站点几乎用不完 |
| 分两批：**批 A 域名无关**（GA4、Clarity、CF Web Analytics）在预览域接好并验证 → **域名定稿** → 绑域名 → **批 B 域名相关**（GSC、Bing、Yandex、Naver、IndexNow、Ahrefs WA + Site Audit、Email Routing）→ 放开索引 → 首页请求编入索引 | 批 A 不依赖域名，先做省一轮；批 B 换域名就作废，所以放在定稿之后 |
| 域名定稿前过**黑历史裁决闸门**：`seo-webcafe.mjs history`、Wayback、外链画像、`site:` 搜索；成人 / 赌博 / 被惩罚一律否 | 带惩罚的域名做什么都起不来，换域名比救域名便宜 |
| **一个不漏**，清单要有「其他能带流量的平台」兜底行 | 有站 80% 流量来自 Bing，有站几乎全部来自韩国 |
| IndexNow 排在站长工具前面 | 它一样账号都不欠，先推了再慢慢验证所有权 |
| 接入必须**线上实测**：`curl` grep beacon 只证脚本在，CF WA 还要 GraphQL `count > 0` | `site_token` 填成 `site_tag` 不报错，一个站空跑了 45 天 |
| **第三方分析脚本（GA4、Clarity）一律延迟加载**（`requestIdleCallback` / `setTimeout`），不许因为「脚本拖 LCP」把 GA4 标 ❌ 或推迟接入——延迟加载就完了，LCP 零影响 | 曾经因为这个理由把 GA4 标 ❌ 整整推迟了一天，纯属多此一举 |
| Ahrefs Site Audit 的问题按报告逐 URL 修完，回段 4 全套重跑 | 第二台爬虫的价值在它看得到你自己漏掉的整站问题 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 5。

### 6 外链

- **触发**：「帮我搞点外链」「去哪发」「竞品的外链哪来的」「有没有毒」「发个 Product Hunt」。
- **入口**：`backlink` Skill（未装：`npx skills add yan-labs/yan-skills --skill backlink -g -y`）；判据 [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五；发布平台 [`product-launch.md`](references/product-launch.md)。

| 硬规则 | 为什么 |
|---|---|
| rankup 只判**什么时候发、发多少**；发现、填表、台账全在 `backlink` | 两个 Skill 各管一层，不在两处各存一份流程 |
| 节奏按 KD → 引荐域对照表；新词上线 2–4 周内不改页面 | 外链过快与频繁改页都会被读成操纵 |
| 302 / 307 不传权重；导航站按过滤清单筛；新后缀域名在老博客发的不算链接 | 这三条都是花了钱才知道的 |
| 每条外链进台账，证据阶梯 submitted → public → indexed 每级都要证据 | 没证据的外链等于没发 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 6。

### 7 变现与监控

- **触发**：「没人付费」「定价怎么定」「接 PayPal」「AdSense 被拒」「流量掉了」「排名没了」。
- **入口**：[`monetization.md`](references/monetization.md)（Stripe / PayPal / 广告 / 订阅 / 商店上架）、[`conversion.md`](references/experiences/conversion.md)、[`evolution.md`](references/evolution.md)；掉量排查 [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 十七～十九。常用：`scripts/is-agentic.mjs diff`、`scripts/review.mjs`。转化文案与定价页用 `/marketing-psychology`（锚定、社会认同、损失厌恶、默认效应），找新渠道用 `/marketing-ideas`；两者只给角度，采不采纳按 `conversion.md` 的可采纳分档判，暗黑模式不采。

| 硬规则 | 为什么 |
|---|---|
| **Stripe + PayPal 先有** | 支付通道必须有备份，被关户不至于断粮 |
| 广告（AdSense / Adsterra）、订阅、商店上架后续沉淀；AdSense 先传 `ads.txt` 再申请审核 | 每条通道各有过审与关户的坑，边做边写回 `monetization.md` |
| 动页面之前先查上游流量意图 | 转化率低常常是词选错了，不是按钮颜色 |
| 流量掉了先查 GSC 与 TDK / canonical 有没有被改坏；退款全退不部分退 | 被 K 与被拦是不同的死法，先分清再动手；部分退款制造争议 |
| **监控读数触发回到段 1 开下一棵树** | 增长是循环不是终点，一棵树吃完就该扩下一棵 |
| 每轮收尾：调研报告进 `research/`、pass 掉的进 `rejected.md`（带理由与复活条件）、做了什么进 `iterations.md`、功能与实现的调研也一样沉淀 | 项目记忆是下一轮的起点；写的是判据与理由不是禁令，条件变了后来者才有据翻案 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 7。

## 红线速查

| 红线 | 细则在 [`discipline.md`](references/discipline.md) |
|---|---|
| 全权委托：不请示、不问「要不要继续」、连锁任务做到底 | 一 |
| 先查脚本清单，禁止现写等价实现或手点界面；脚本坏了修脚本 | 二 |
| 花配额前先看档位，**以脚本打印为准**，不信文档默认值 | 三 |
| 需要登录态一律用户的浏览器，沙箱浏览器只能看公开 SERP | 五 |
| 配额站（Semrush / Similarweb / Ahrefs）不传 `--session`；会话名不用 `$$` | 五、六 |
| 任何页面不得有占位链接 / 文案 / 图片 | 十四 |
| 做任何功能、任何页面，UI 只准来自脚手架的 shadcn 组件库或同生态现成组件；缺的先装，不许手写基础控件 | 十六 |
| 漏了不会变红的收尾动作（IndexNow 等）焊进 ship 命令 | 九 |
| 接入必须线上实测，不采信勾 | 十 |
| 真实令牌只在 Skill 的 `.env`，不进回复 / 日志 / git | 十一 |
| `check` 轻量零配额；命中升级条件要明说「这已经不是 check，是 review」 | 十三 |
| 面板 / 网页操作与文档对不上：先过五层分诊（重跑、浏览器与会话、额度配额、人眼截图、跨时段），确认是平台变了才改 Skill 原文档；环境问题只记项目 `journal/` | 十五 |
| IndexNow 推送默认 diff（只推新增 URL），全量用 `--all` 显式触发 | 十七 |
| ID / token / 密钥等标识符必须从页面 DOM 或复制按钮获取，禁止从截图、记忆、转录中抄录 | 十八 |

## 主线：维护 checklist，使用 checklist

每段都有一套 checklist。不过 check 不许进下一段；每轮迭代新做的东西，把相关 check 重新过一遍。这是硬门槛。

- **闸门 check** 在 [`references/checklists.md`](references/checklists.md)：每段一张表，判「这段能不能算完」。
- **步骤 check** 在 [`lifecycle.md`](references/lifecycle.md) 各段「步骤 check」，判「这一步做对了没有」，每做完一步就核。
- 状态记在项目侧 `.rankup/checks.md`：✅ + 证据在哪个文件哪一段 + 日期；做不了标 ⏸ 写清卡在哪；开新一轮把标「每轮」的打回 ⬜。
- **判断由你做，不找脚本代劳**：`scripts/review.mjs` 只给文件层面的缺口，500 字节的 `audit.md` 能让脚本变绿，里面是不是全站逐 URL 只有你看得出来。
- 判据在 `checklists.md`，操作在各自的 md，两处不得各存一份——同一件事写两遍，改了一处另一处就静默过期。
- 缺 check 时**先补进 `checklists.md` 再去做**，顺序反了这一条只会存在于那次对话里。

## 命令

### `rankup check`

用户说「现在该做什么」「一步步来」「我们开始执行这个项目的计划」时的唯一动作。编排在 [`playbooks/site-review.md`](references/playbooks/site-review.md) 第二节。

1. 读 [`references/checklists.md`](references/checklists.md) 与项目 `.rankup/checks.md`；跑一次 `scripts/review.mjs` 拿文件层线索。
2. 找到第一个没过闸的段，逐项去真实代码、线上响应、后台读数核对。
3. **保持轻量：零配额、不派七组 agent。** 命中升级判据（已上线但 `audit.md` 缺失、`.rankup/` 不存在、动过线上 URL 且超过一轮没体检、用户问的其实是「站有什么问题」）时，明说「这已经不是 check，是 review」，然后直接转全站体检，不回来问。
4. **直接照着做**，不把清单念给用户；做完逐项在 `checks.md` 记 ✅ 与证据。

### `rankup init`

适用于全新项目，也适用于做了很久但还没有 `.rankup/` 的项目——后者是常态，不得因为缺记忆就重建技术栈。

1. 摸清现状再写字：`package.json`、路由清单、部署配置、`git log`；已上线的再取线上 `sitemap.xml`、`robots.txt`、首页响应。
2. 外部系统一律实时查询（域名解析、Cloudflare、GSC、支付），不采信文档。
3. 按 [`project-memory.md`](references/project-memory.md) 建 `.rankup/` 全套；取不到的写 `待确认`，不猜。`integrations.md` 用完整平台表初始化全部 ⬜（[`discipline.md`](references/discipline.md) 十）。
4. 已运行项目补 `baseline.md` 与 `audit.md`；`roadmap.md` 写阶段目标与放弃条件。
5. 绿地项目脚手架跑通后立刻建**私有**远端仓并推送，`.rankup/` 随仓库提交。
6. 汇报：填了什么、哪些 `待确认`、哪些需要用户提供。凭据只登记名称与位置。已有 `.rankup/` 时不覆盖，转为补齐并提示用 `review`。

### `rankup review`

review 不是「查 `.rankup/` 缺哪个文件」，是对这个站本身做一次全面体检。编排在 [`playbooks/site-review.md`](references/playbooks/site-review.md) 第一节：先摸前提，再一条消息并行派七组 sub agent（技术 SEO / 速度 / GEO / 关键词长尾 SERP / 哥飞二次意见 / 市场规模 / 接入与记忆），最后汇总回写。`.rankup/` 不存在、站没上线、拿不到 GSC 三个分支都写死在 playbook 里，不要停下来先 init。

G 组那条线：`scripts/review.mjs --project-root .` 出五块报告；再挖会话记录 `scripts/sessions.mjs --project-root . --days 14 --new-only`（`--dump` 出浓缩稿，消化完才 `--mark`）。**默认加 `--new-only`**，水位线记在 `.rankup/review-state.json`，不加会把同样的对话重读一遍。浓缩稿里找四类东西：用户的纠正、验证过的结论、踩过的坑与根因、已推翻旧记录的事实（**修订**原条目，不并列）。
之后：三方对账 → 过全部闸门补缺口 → 接入清单线上实测 → 筛 `experience.md` → 剥离站点后仍成立的规则回流本 Skill → 补脚本 → 刷新登记表 → 一页结论。能当场修的直接修。

## 启动协议

1. 读同目录 `skill.json`，跑 `node "<rankup-skill-dir>/scripts/check-version.mjs" --project-root . --apply`；网络失败保留当前版本，不得伪称已更新。
2. 读 `.rankup/INDEX.md` 与 `.rankup/skill-state.json`；不存在按 [`project-memory.md`](references/project-memory.md) 初始化，不重建技术栈。只读任务相关文件，不无差别加载日志目录。**本轮要碰的每个词、方向、功能、渠道、域名先 `grep -i` 一遍 `.rankup/rejected.md`**，命中的只有跳过并引用、或写明复活条件已满足两种处置。
3. **三方对账门禁**：回答「接下来做什么」或宣称任何进度之前，交叉核对 `git log --oneline -25`、真实路由清单、线上 `sitemap.xml` 全量 `<loc>`。`plan.md` 的勾选、`progress.md`、autopilot 状态都是滞后指标；外部状态（Cloudflare、GSC、Stripe、索引、外链）以当前查询为准。不一致先回写 `.rankup/` 再继续。
4. 读 [`references/checklists.md`](references/checklists.md) 与 `.rankup/checks.md` 定段，不凭印象；需要可复用操作先查跨项目登记表。
5. 做完更新 `.rankup/` 事实、决策、计划；把本轮过掉的 check 逐条记进 `checks.md`，动过线上 URL 的把标「动了 URL」的打回 ⬜。
6. **沉淀义务与是否调用本 Skill 无关**：只要项目里有 `.rankup/`，任何任务完成后都要回写可复用结论，判据是「下次能否少走一遍」。

## 经验库：规划与迭代之前先翻一遍

[`references/experiences/`](references/experiences/INDEX.md) 是经验层，回答「该怎么判断、别人踩过什么坑」；方法层回答「怎么操作」。挖需求读 [`demand-discovery.md`](references/experiences/demand-discovery.md)；规划排优先级读 [`zero-to-one.md`](references/experiences/zero-to-one.md)；上线后决定改什么读 [`conversion.md`](references/experiences/conversion.md)；技术 SEO / 站群 / 多语言 / 索引读 [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 与 [`webcafe-topics.md`](references/experiences/webcafe-topics.md)；往里加东西看 [`INDEX.md`](references/experiences/INDEX.md) 收录规则。
三条硬约束：经验层不带任何项目信息；每条必须有出处与证据等级（【实测】/【经验】/【猜测】，猜测不得当结论执行）；这些是从业者单点实践，采纳前先问「我们的前提一样吗」，小步验证后写回项目侧。

## 可复用操作必须落成脚本

任何需要第二次执行的操作，第一次跑通就固化成脚本，不允许下次重新摸索——每次重试都在烧上下文，且结果不可比。判定：「会再做一次」或「换个站换个词就要重跑」。
固化到 `<project>/.rankup/scripts/<动词-对象>.mjs`，参数化（property、日期、词、国家），在 `.rankup/INDEX.md` 登记用途、参数、登录态依赖、已验证日期。脚本失败时**修脚本**，不绕过；失败原因写进脚本头部。登录态、property ID、账号配置属于项目侧，不进本 Skill。

## 跨项目资产登记表

各项目的 `.rankup/` 互不可见，登记表把可复用脚本索引到一处：`node "<rankup-skill-dir>/scripts/registry.mjs" scan --roots <存放项目的目录>` 整表重建，`list` 查看。
位置是 Skill 目录下的 `registry.md`，它必须写出项目名与绝对路径才有用，因此被 `.gitignore` 排除，并由 `scripts/validate-rankup.mjs` **断言绝不能被 git 追踪**——`.gitignore` 只是约定，`git add -f` 就能绕过。扫描根目录来自 `--roots`、`RANKUP_PROJECT_ROOTS` 或 `~/.rankup/config.json`，绝不写死。启动时查它；只索引不复制；某个脚本被第二个项目用上，考虑把做法回流本 Skill。

## 安装与版本

先装 `opencli`（`npx skills add yan-labs/yan-skills --skill opencli -g -y`）：凡是碰浏览器的动作都落在它那一层，且 OpenCLI 本体要装我们自己的构建，不是应用商店版（商店版默认前台抢标签页，失败不报错）。`opencli doctor` 报扩展版本过低时照它说的做。

```bash
npx skills add yan-labs/yan-skills --skill rankup -g -y   # 全局安装
npx skills update rankup -g -y                            # 全局更新
npx skills update rankup -p -y                            # 项目级更新
```

发布版本记录在 `skill.json`；项目的启用时间、已安装版本和最近检查状态记录在 `.rankup/skill-state.json`。`check-version.mjs` 最多每 24 小时访问一次远端，只更新本 Skill，不碰业务代码与 `.rankup/`；遇到源码检出（仓库根有 `.skill-source`）或工作区有未提交修改时拒绝更新并报告原因，链接被换成实体目录时在仓库里跑 `node scripts/link-skills.mjs` 恢复。
版本号：patch 文字与小经验；minor 向后兼容的新工作流；major 目录协议或核心行为破坏性变化。发版同时更新 `metadata.version`、`skill.json`、验证脚本预期和 README。

**经验回流**（用户说「把这个经验写进 rankup」「记下来更新到源码里」）：先按 [`experiences/INDEX.md`](references/experiences/INDEX.md) 收录规则定证据等级与归属层，再按 [`evolution.md`](references/evolution.md) 晋升门判它进 Skill 还是留项目侧；进 Skill 的写进**对应的现有文件**（选词进 `webcafe-topics.md` 一、外链进五、变现进 `monetization.md`……），不新建文件、不带站名与数字；改完跑 `node scripts/validate-rankup.mjs`，直接提 main。**面板与网页操作口径的修正**（Semrush、Similarweb、seo.web.cafe、哥飞论坛、站长工具、任何 OpenCLI 驱动的站）另有一道门：每轮跑完把「对不上」的地方按 [`discipline.md`](references/discipline.md) 十五分诊，五层全过才改原文档并同步 JSON 与脚本的已验证日期；没过的留在项目 `journal/`，一次环境故障写成「功能没了」比不回流更糟。

## 令牌与项目中立

- 第三方工具令牌只有一份，放 Skill 根目录 `.env`，环境变量优先；细则见 [`discipline.md`](references/discipline.md) 十一。
- 严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥、token、密码、私钥、webhook secret、支付敏感数据或个人敏感信息。
- **本 Skill 必须保持项目中立与机器中立**：站点名、域名、流量数字、证据出处、account/property ID、本机路径与代理、凭据位置一律不进 Skill；回流一条经验只带走剥离站点后仍成立的规则，证据留在项目侧 `experience.md`。此约束由 `scripts/validate-rankup.mjs` 断言，违反即构建失败。
- 不记录未验证猜测；旧经验被证伪时修订原条目，不并列保留冲突结论。
