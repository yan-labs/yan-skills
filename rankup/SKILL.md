---
name: rankup
description: 管理网站和原生 App 的需求验证、立项、开发、上线及增长。用户明确提到 rankup，或任务涉及选词、SERP、SEO/GEO、索引、搜索平台、流量、网站体检、建站和增长时使用。先定位项目与具体问题，再按七段生命周期加载对应参考文件；单纯写文案、做设计或问通用开发问题，不因关键词碰巧出现就强制启动完整流程。
metadata:
  version: "3.22.0"
---

# Rankup 3.0

给独立开发者用：做产品，也做关键词流量站、AI 工具、桌面客户端上架商店、付费订阅。
产品形态不限，包括macOS、iOS、iPad App、网站与 SaaS 均可，唯独不做 Android App；Android 商店只作需求参考。按用户任务和真实市场证据选平台，不把所有 App 机会改成网站。SEO + GEO 保留为网页获客验证，App 同时验证商店及原生分发市场，见 [`research.md` App 分支](references/playbooks/research.md#app-市场验证分支)。
本文件负责定位生命周期和选择相关入口；具体操作与证据判据在 [`references/discipline.md`](references/discipline.md) 及对应参考文件。只加载本次任务需要的部分。搜索平台、工具评分和模型能力可能变化，查询时核对当前来源、日期、市场与目标环境；历史经验不自动变成当前事实。Google 对关键词密度、工具评分和 AI 搜索的当前口径见 [官方 SEO 问答](https://developers.google.com/search/help/office-hours/2023/january)、[页面体验指南](https://developers.google.com/search/docs/appearance/page-experience) 和 [生成式 AI 搜索指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)。

**执行原则**：先明确用户真正要解决的问题和目标市场，再查已有 `.rankup/` 证据。取不到数据写“未知/不可用”，不要写成 0。对官方指南、第三方工具和本 Skill 的结论区分“官方要求”“工具建议”“项目经验”。具体做法参考 [Claude Opus 5.5 官方提示指南](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-opus-5-5)：指令要明确，长任务用可核验的完成条件，阶段性汇报不等于完成。

## 哥飞官方 Skill

查关键词、竞品、域名、页面、哥飞经验规则，或遇到不熟悉的 SEO 问题时，按 [`seo-webcafe.md`](references/seo-webcafe.md) 检查并加载**哥飞官方 Skill 包**。未安装则按[官方页面](https://seo.web.cafe/api/)的 Skills 说明安装到当前 Agent 的 Skill 目录，再主动读取官方 `gefei/SKILL.md` 与对应专用 `SKILL.md` 并执行；专用 Skill 设置了 `disable-model-invocation: true`，禁止模型自动触发，不能只等它自己出现。Rankup 不内置哥飞的 Skill、CLI 或接口表；工具如何调用听官方 Skill，市场证据与项目闸门仍由 Rankup 判断。

**执行分工**：单一查询或前后依赖的串行任务，主 Agent 可直接调用官方工具；需要同时调研多个独立问题时，主 Agent 把各问题及官方 Skill 入口交给子 Agent，收回证据后统一判读和回写。不要为了用哥飞工具而专门创建子 Agent；细则见 [`discipline.md`](references/discipline.md) 与 [`seo-webcafe.md`](references/seo-webcafe.md)。

## 一句话落到哪一段

用户不会说「跑一下 seo-audit.mjs」，他会说下面这些话。命中就照入口走，不要自己现编步骤。

| 用户会说的话 | 段 | 入口 |
|---|---|---|
| 「看下这批数据有没有能做的关键词」「找几个关键词」「挖点需求」「最近有什么能做的」 | 1 | [`playbooks/research.md`](references/playbooks/research.md)（P0 分流 → 词根调研） |
| 「调研一下这个词」「调研一下这关键词」「调研的关键词」「这个词能不能做站」「这词难不难」「帮我扩词」 | 1 | `research.md` **P2 词根调研**：任何词都是词根，先直接搜再扩树（旧 P3 已并入 P2，不再有单独的扩词流水线） |
| 「找个 xxx 关键词需求」「找个 xxx 的词」「xxx 这块有什么词能做」「帮我找 xxx 的需求」 | 1 | xxx 当词根进 `research.md` P2，按[「五个取数动作与编排」](references/playbooks/research.md#五个取数动作与编排探索循环)编排①全自动跑完（词→站看 SERP → 词→词浅扩 → 站→词反查竞品 → 站→站 → 取量/KD/CPC → 筛子 → 社区 → 意图 → 折成钱），不反问、不只在种子词上换后缀 |
| 「做小语种」「这个词在德语/葡语/印尼语怎么搜」「本地化关键词」「某国市场找词」「别机翻」 | 1 | `research.md` P2 [阶段 0.7 开工卡](references/playbooks/research.md#阶段-07--非英语市场开工卡目标市场非英语时必填) + [三关小节](references/playbooks/research.md#小语种候选词三关与本地竞品取词)；语种探测见 [`trends.md`](references/trends.md) W1 |
| 「找个方向」「这个方向能不能做」「值不值得做」「选品」「有什么能做的」「帮我看看这个想法」 | 1 | [`playbooks/selection.md`](references/playbooks/selection.md)：先过七道选品闸门判"该不该做"（硬约束/频次/痛点/付费信号/护城河/获客可行性，几乎零配额），过闸的候选才把主词交给 `research.md` P2 花配额查清楚——不要跳过闸门直接进 P2 |
| 「App 有没有需求」「找 iOS/iPad/macOS 产品」「商店里哪个方向能做」 | 1–2 | `research.md` App 市场验证分支 → `lifecycle.md` 2.2 按任务选择平台；不做 Android App |
| 「谁在赚钱」「反查这个站」「竞品最近在做什么」「帖子说月入 X 是真的吗」 | 1 | `research.md` P4 + [`demand-sources.md`](references/demand-sources.md) 第十节 |
| 「筛这批 AITDK 报告」「只看竞品异常」「先压缩报告再给 AI」 | 1 | [`seo-box.md`](references/seo-box.md#aitdk-研究报告离线分流)：`aitdk-triage.mjs` 离线读取已有 JSON → 异常 Markdown → `file#JSON-pointer` 定点复核；只作 P2/P4 研究分流，不替代上线前的真实问题核验 |
| 「XX 和 YY 哪个更火」「今天美国/日本在搜什么」「哪个国家有机会」 | 1–2 | [`trends.md`](references/trends.md)，`scripts/gt.py` |
| 「有什么游戏站能做」「跑一下小游戏监测」「游戏关键词怎么找」 | 1 | [`game-sites.md`](references/game-sites.md)：Rankup 总控发现、探索、研究和是否值得做的判断，内部按需调用 `game-opportunity` |
| 「小游戏机会每日采集」 | 1 | [`game-sites.md` 每日采集](references/game-sites.md#每日采集)：读项目参数，采集、全池轻筛、写当天交接 |
| 「小游戏机会每日决策」 | 1–2 | [`game-sites.md` 每日决策](references/game-sites.md#每日决策)：读当天交接，选深查名单、验证、判读并维护观察池 |
| 「这个方向做不做」「做哪个语种」「要不要上多语言」「做成工具还是内容站」 | 2 | [`lifecycle.md`](references/lifecycle.md) 段 2 |
| 「我们做个网站吧」「新建个站」「想做个工具站」「帮我搭起来」 | 2→3 | 先过段 2 立项定位，再段 3 初始化；手上没有词树先回段 1，不许跳过 |
| 「一步步来」「我们开始执行这个项目的计划」 | check | 先 `rankup check` 定位当前段与第一个没过的闸，然后按 [`checklists.md`](references/checklists.md) 逐环节推进，每过一闸记 `checks.md`；不要跳过 check 直接猜段 |
| 「做个功能吧」「加个 X 功能」「把这个做出来」「实现一下这个」 | 3 | **红线先行：任何 UI 一律用脚手架自带的 shadcn 组件库**（`components/ui/`），缺的 `shadcn add` 或装同生态的现成组件，禁止手写下拉框 / 弹窗 / 日期选择 / 表格分页 / Toast；多功能工具站导航先读[侧栏统一规范](references/design-references.md#多功能工具站侧栏统一规范)；然后按段 3 硬规则与 `checklists.md` 段 3 做，做完段 4 全套体检 |
| 开发时挂着当规范：「按 rankup 规范来」「这个页面这样写行不行」「这块要不要 SSR」 | 3–4 | 本文段 3、段 4 硬规则 + `checklists.md` 对应段 |
| 「我们做个内页吧」「把这个关键词做成内页」「关键词没问题了，做成内页」 | 4 | 一个明确搜索意图对应可解决任务的页面：目标词登记、TDK、适用的 OG、无占位、相关体检；页面上的控件同样只准来自组件库（红线，见 `discipline.md` 十六）；**按 `lifecycle.md` 段 4「新增内页 / 新模板的随手清单」逐条带上，不是等段 4 集中体检才补**；`lifecycle.md` 段 4 + `checklists.md` 段 4 |
| 「看一下 SEO 有没有问题」「看一下 GEO 有没有问题」「GEO/SEO 有没有问题」 | 4 | 先跑 Rankup 自有体检；第三方页面复核加载官方 `gefei-page`，见 [`seo-webcafe.md`](references/seo-webcafe.md) 与 [`playbooks/site-review.md`](references/playbooks/site-review.md) |
| 「能不能上线了」「上线前还差什么」「TDK」「关键词密度」「标题描述怎么写」 | 4 | `checklists.md` 段 4 + [`seo-box.md`](references/seo-box.md) |
| 「怎么被 AI 引用」「llms.txt」「对 AI 代理友好吗」「AEO/GEO」 | 4 | [`seo-growth.md`](references/seo-growth.md) 三-B |
| 「AI 会不会推荐我们」「GEO 反推」「试试 AI 搜这个词会推荐谁」 | 4 | `seo-growth.md` 三-B GEO 反推测试 |
| 「帮我生成 logo / 配图 / 封面 / 海报」「要张 og 图」「画个吉祥物」 | 3–4 | `/imagegen`：图片必须真实生成，不允许占位图 |
| 「建站当天做图标」「生成一整套网站图标」「favicon 怎么做」「标准图标集」 | 3–4 | `scripts/make-favicons.mjs --src <logo.png> --out <public目录>`：由一张 ≥512×512 品牌源图生成标准图标全集（`favicon.ico`/48/96/192/180/512） |
| 「做个好看的页面」「有没有什么好的设计参考」「Hero 怎么设计」「找个组件参考」「landing page 怎么排」「有什么动画效果」「页面设计灵感」 | 3 | 先浏览 [`design-references.md`](references/design-references.md) 收录站的相关分类，选 2–3 个案例参考后再实现；基础控件仍走 shadcn 组件库红线 |
| 「写一下这页的文案」「这稿子 AI 味太重」「帮我改稿」「语言结构理顺一点」「怎么写才会被 AI 引用」 | 4 | 中文：`/write`（先确认它的五个附属 Skill 都在，缺的用 `find-skills` 装齐；装不上才退到 `/human-writing` 起稿 → `/shuorenhua` 去 AI 味，见 [`skill-ecosystem.md`](references/skill-ecosystem.md)）；内容形状按 `/ai-seo` 的 content-patterns；JSON-LD 只取 `/seo-geo` 的模板 |
| 「文案怎么写才有人点」「定价页怎么排」「用户为什么不买」「还有什么渠道能推」 | 7 | `/marketing-psychology`（锚定、社会认同、损失厌恶等用在页面与定价上）+ `/marketing-ideas`（渠道清单）；判据仍以 [`conversion.md`](references/experiences/conversion.md) 为准 |
| 「站慢不慢」「跑个性能」「Core Web Vitals」 | 4 | `seo-box.md` 一，`scripts/pagespeed.mjs collect --strategy both`（`plan` 只打印链接不采数，仅兜底） |
| 「这个域名能不能用」「域名前世」「域名黑历史」 | 5 | `lifecycle.md` 段 5 黑历史闸门 + 官方 `gefei-domain` Skill |
| 「域名买完了」「帮我绑域名」「这个域名绑一下」 | 5 | `cloudflare-stack.md` §8.5「域名绑定到 Workers（全 API，零界面操作）」：添加 zone → 绑 Workers 自定义域名 → 设 SITE_URL → 告知 NS → 等激活 → §8.8 基础安全与 §8.6 邮箱核验 → 上线验收 → 放开索引 |
| 「数据检测平台都接入了吗」「GSC 接了没」「提交 sitemap」「怎么一直不收录」 | 5 | [`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md) |
| 「把 Ahrefs 的检验结果都修了」「全站内链失效」「重定向链」 | 5→4 | `scripts/ahrefs-site-audit.mjs` 取清单，`scripts/ahrefs-issues-recheck.mjs <导出的issues.json>` 线上复核哪些已经不存在、哪些仍存在、哪些需要浏览器或 PSI 判（报告常滞后于最近部署，别假设报告永远反映当前状态），修完按段 4 全套重跑 |
| 「帮我搞点外链」「去哪发外链」「竞品的外链哪来的」「这些外链有没有毒」 | 6 | `backlink` Skill + [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五 |
| 「发个 Product Hunt」「上架发布平台」 | 6 | [`product-launch.md`](references/product-launch.md) |
| 「访客不注册」「没人付费」「定价怎么定」「接 PayPal」「AdSense 被拒」 | 7 | [`monetization.md`](references/monetization.md)、[`conversion.md`](references/experiences/conversion.md) |
| 「流量掉了」「排名没了」「是不是被 K 了」 | 7 | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 十七～十九 |
| 「现在该做什么」「到哪一步了」「本轮还差什么」 | check | 本文 `rankup check` → `site-review.md` 二 |
| 「review 一下我的站」「帮我看看这个站有什么问题」「查漏补缺」「这项目脱轨了」 | review | 本文 `rankup review` → `site-review.md` 一 |
| 「我想让流量涨一点」「今天弄下 SEO」「优化一下我的网站」 | check | 先 `rankup check` 定位第一个没过闸的段；默认打磨转化链路，不重构（[`zero-to-one.md`](references/experiences/zero-to-one.md)） |
| 「把这个老项目接进来」「rankup init」 | init | 本文 `rankup init` → [`project-memory.md`](references/project-memory.md) |
| 「群里怎么说的」「哥飞说过什么」「论坛里搜一下」 | 经验 | 先加载官方 `gefei` Skill，按其知识库工作流取原文与出处；公开论坛资料见 [`webcafe-forum.md`](references/webcafe-forum.md) |
| 「我看到一个帖子分享 SEO 的东西，你把这东西记下来更新到源码里」「把这个经验写进 rankup」 | 维护 | 维护 Skill 本身：按 [`experiences/INDEX.md`](references/experiences/INDEX.md) 收录规则与 [`evolution.md`](references/evolution.md) 晋升门写进**对应的现有文件**，不新建文件；见文末「经验回流」 |
| 「抓一下后台数据」「导出报表」「数据面板」「Semrush 能查这个吗」 | 取数 | 哥飞工具先加载官方 `gefei` Skill；其他面板看 [`provider-capabilities.md`](references/provider-capabilities.md) |
| 说的事这张表没有 | — | [`capability-map.md`](references/capability-map.md) → [`skill-ecosystem.md`](references/skill-ecosystem.md) → `/skillsmp` → 最后才按 [`integrations.md`](references/integrations.md) 用 find-skills；不要现写等价实现 |
| 本文点名的任何兄弟 Skill 本机没装 | — | 加载 `find-skills` 搜索并安装，装完再继续；不跳过、不现写替代。每台机器装的不一样，文档只保证「该用什么」（[`skill-ecosystem.md`](references/skill-ecosystem.md)「缺 Skill 的处置」） |

越模糊越不要盲跑全套：有明确对象就先跑最便宜的那个脚本；只有方向没对象就先 `rankup check`；连站都没有只问一个问题（有没有想好的词），不要连问三个。

## 七段生命周期

旧的 12 阶段编号与七段的映射表在 [`lifecycle.md`](references/lifecycle.md) 顶部；项目里旧 `checks.md` 按它对照。每段四块：触发 / 入口 / 硬规则 / 闸门。不写操作步骤。

### 1 调研

- **触发**：给了一批数据、一个词、一个帖子、一个域名，问「能不能做」；或者只有一个模糊方向，问「该不该做」「值不值得做」——后者先进 `selection.md`，不要直接进 `research.md`。
- **入口**：候选方向先过 [`playbooks/selection.md`](references/playbooks/selection.md)（七道选品闸门：硬约束/频次/痛点/付费信号/护城河/获客可行性/量化验证，前六道几乎零配额，判"该不该做"）；过闸的候选，或用户已经给了一个具体词/域名，再进 [`playbooks/research.md`](references/playbooks/research.md)（P0 只看输入分流：什么都没有 → P1；一个词 → **P2 词根调研**；一个域名 → P4，判"怎么把它查清楚"）；判读 [`demand-discovery.md`](references/experiences/demand-discovery.md)；意图核验在 [`lifecycle.md`](references/lifecycle.md) 段 1 · 1.2；验收单 `research-checklist.md`（不是入口）。常用脚本：`scripts/demand/suggest.mjs`（三引擎下拉联想）、官方 `gefei-keywords` / `gefei-competitor` Skill（按 `seo-webcafe.md` 安装并加载）、`backlink/scripts/semrush-keyword.mjs`；面板取证 `scripts/rankup-cli.mjs`（`npx @yan-labs/rankup audit similarweb`）；`selection.md` 自己的两个
脚本——`scripts/select/leading-indicator.mjs`（候选生成器，扫 ads/appstore/gplay/stripe 信号源产出候选）
与 `scripts/select/gate-runner.mjs`（七道闸门判定，自动写 `.rankup/decisions.md`/`rejected.md`）。

| 硬规则 | 为什么 |
|---|---|
| 新方向/候选先过 `selection.md` 七道闸门（0 硬约束、1 使用频次、2 痛点证据、3 付费信号、4 护城河、5 获客可行性、6 量化验证），闸门 6 才移交 `research.md` P2 花配额 | 六轮 546 次搜索证明：旧顺序把最贵的关键词配额放第一步，绝大多数配额烧在了后来被免费判据（硬约束/低频/无护城河）就能秒杀的候选身上——最便宜、最能杀死候选的判据必须排最前 |
| 用户给的任何词都是**词根**：先直接搜，再扩成树（面板相关词 + Google/Bing/DDG 下拉；叶子再扩，最多两层；停止扩展须依实量与竞争复核，KD 不作硬闸） | 用户给的是方向不是答案，一个词查完就下结论会漏掉整棵树 |
| **探索广度闸**：下筛子结论前必须跑过词→词/词→问题/词→站/站→词/站→站五个动作各一轮，词池里出现过不含种子字面串的新词根，见 [`research.md`](references/playbooks/research.md#五个取数动作与编排探索循环) | 种子词只是入口不是答案；agent 曾反复停在种子词的后缀/修饰语变体里，只得出片面结论，漏掉更大、更容易的流量 |
| 筛子：月量太低且 CPC 低 = 否；KD 只安排竞争复核，不直接判输赢 | 量与 CPC 用于获客筛选，竞争另查前 10–20 自然结果、产品上线证据及目标 URL 非品牌自然量 |
| **候选被判「量太少、不做」前必须先完成站找词 + 词找站反查**（找同类站用面板汇出赛道真实带量词表，再反查这批词的 SERP 归属），不许只凭词根/种子词自己的量下结论 | 【实测】站找词/词找站对照实验：只查种子词会系统性低估长尾盘子，反查能同时防止误杀真有量的方向与误留假冷门方向（详见 `research.md` P2「否决前必须反查」） |
| **Semrush / Similarweb 报的月量必须用 Google Trends 锚点法交叉验证**：默认锚点 `gpts`（美国实测约 5,400/月，KD 77，2026-09-09 Semrush 实测），量级差 10 倍以上再换同量级第二锚点；每轮都要重拉一次锚点自己的 12 个月曲线取均值校准，不能沿用旧均值或只看最近几周（`references/trends.md`「〇·六」） | 面板对刚起量的新词有滞后、对头部通用词又容易估得偏宽，本轮实测两个方向的偏差都到过 6–14 倍（`ai headshot generator` 报 22,200 被两次独立锚点判定只有 0.07–0.18 倍；`ugc ads ai` 报 210 被判定低估到 1.4–3.3 倍）；不交叉验证就是直接把面板的方向性误差当结论用 |
| **社区验证是必走的一条腿**：Reddit / X / YouTube / B 站近 14 天讨论量。取数走兄弟 Skill：`/agent-reach`（先 `agent-reach doctor --json` 看各平台后端，再按 `research.md` 阶段 5 的命令组跑）、`/anysearch` 批量网页搜索、`/deep-research` 只做定性背景；rankup 自带的只有 `reddit-wishes.mjs` 与 `hn-signals.mjs`；搜索侧用 `scripts/gt.py compare <词> --time 1d`（Trends 过去 1 小时 / 4 小时 / 1 天的小时级曲线，新词单独查不和大词同框） | 数据平台只有 28 天窗口，昨天火起来的看不到；Trends 的 now 区间是唯一能看到小时级的公开源；论坛热度是第一手的，帖子一星期内炸开面板上还是 0 |
| **非英语市场的候选词必过三关**（语义确认 → 搜索确认 → SERP 确认）才能写进 `keywords.md`；翻译工具/AI 产出的词只算 `翻译假设`，不能直接当结论 | 语法正确不等于当地人这么搜，直译词表会系统性打偏。源自【经验】（独立开发者出海经验分享），完整判法见 [`research.md`](references/playbooks/research.md#小语种候选词三关与本地竞品取词) |
| 亲眼看 SERP，用页面类型核实**真实意图** | 宠物诊断那次：词看着是工具需求，首页全是兽医内容，做工具就错了 |
| 空结果先核 manifest：429 / CAPTCHA / 超时都产出 0 条 | 采集失败 ≠ 没需求，把失败读成结论是最贵的错 |
| **开跑前先 grep 项目的 `.rankup/rejected.md` 与 `research/`**：上一轮 pass 掉的词或方向，命中就跳过并引用，或写明复活条件已满足再重开；本轮 pass 掉的带理由与复活条件写回 `rejected.md` | 换个会话就把否决过的东西当新点子重做一遍、再踩同一个坑，是项目记忆最常见的失效形态；理由留着，条件变了才能有据翻案 |
| 结论要折成钱：Web 同类站流量按官方 `gefei-competitor` 核实并折成收入区间；App 按 `research.md` App 分支核对收入、下载与留存 | 能排上去 ≠ 能赚钱；网页低量也不能否决 App 市场 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 1。

### 2 立项与定位

- **触发**：方向已有，问做不做、做哪个语种、做成什么形态。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 2；语种探测 [`trends.md`](references/trends.md) W1；裁定 [`zero-to-one.md`](references/experiences/zero-to-one.md)、[`webcafe-topics.md`](references/experiences/webcafe-topics.md) 七。

| 硬规则 | 为什么 |
|---|---|
| 第一目标是拿到流量，语种跟着流量走：先看哪个语种量大竞争小 | 没流量的定位再漂亮也验证不了 |
| 某语种流量大竞争小就**只做单语站**，不做多语言 | 多语言是翻车最多的路，还把权重摊薄；要上也是先 2–3 个语言、hreflang 代码统一生成、禁止按 IP 跳转 |
| 意图类型与使用环境决定产品形态：信息型可做内容站；工具型及持续使用型可做网站/SaaS或macOS/iOS/iPad App；按 `lifecycle.md` 2.2 选择买断、IAP或订阅 | 形态跟着意图走，不跟着技术偏好走 |
| 写清「1」的定义与放弃条件 | 0→1 最常见的死法是不知道什么时候该停 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 2。

### 3 建站与开发

**适用范围**：本段 shadcn、TanStack、Cloudflare 和段 4–6 的网页 SEO/部署规则只约束 Web 面，不套到原生控件、App 包或商店发布。macOS 实现按已安装的 `build-macos-apps` 专项 Skill；iOS/iPad 按对应原生开发工具，商店分发读 `monetization.md` 五。仅有 App 时网页项标 N/A 并写明原因，不强建网站。

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
| **发布页面不得出现会误导用户的占位链接、文案或图片** | Google 判垃圾站，红线；宁可整块删掉（[`discipline.md`](references/discipline.md) 十四）。开发期写占位、上线时无人复查是实际发生过的漏法——多个站上线后仍被发现有占位超链接、占位文案，所以段 3（开发自查）/ 4（上线前 review）/ 5（放开索引前）各设一道占位专项闸，不是只在段 3 提一句禁令 |
| **品牌图标在开发当天做齐**：按 [`lifecycle.md`](references/lifecycle.md) 段 4 · A 节制作与核验，段 3 Day-1 D15 当天通过 | 清除全部脚手架默认图标及引用，不能只换 SVG、留下默认 `favicon.ico` 或 manifest 图标 |
| 网站需要任何视觉素材（logo、favicon 源图、og:image、内页配图、用户场景图、插画）→ 加载 `/imagegen` 真实生成 | 占位图是红线，而段 4 要求每页独立 og:image 必须有图，没有生成能力就只剩占位一条路 |
| 邮箱一律 Cloudflare Email Routing 的 `hello@`；新建/绑定域名、接邮箱、上线及现站 review 主动核查 SPF / DKIM / DMARC，按 [`cloudflare-stack.md`](references/cloudflare-stack.md) §8.6 补齐并验证 | 收信成功不等于防冒充完成；先确认用途与发信子域，CLI 支持则 CLI，否则官方 API |
| 开发时在实际 API 的共享入口做好输入、大小、超时与权限边界，复用已有防护 | 域名 HTTPS 与线上响应头加固在段 5 绑定正式域名后完成，见 §8.8 |
| **匿名页面 HTML 必须走边缘缓存**（Worker 里 `caches.default` match/put），不能每次请求都冷启动加现场 SSR | Workers 每个节点冷启动 + 现场 SSR，不缓存则 TTFB 随地区漂 1 秒以上；实测两个上线站没做这条，同一页 PageSpeed 在两个节点测出 95 与 78 分，LCP 从 1.7s 拉到 4.7s |
| **脚手架初始化当天必须过完「Day-1 默认清单」**（`lifecycle.md` 段 3 · 3.2），判据见 `checklists.md` 段 3 对应行；不是等段 4 上线前体检才补 | 四个同栈站点复盘发现：清单里的项目晚做一天，返工成本呈指数增长——改一处域名硬编码是分钟级，改一批已发布页面的图片格式是天级 |

Day-1 清单里最容易漏、也最贵的三条单列在这里，其余见 `lifecycle.md` 对应节：

1. **域名与索引开关共享构建期配置**：按 `lifecycle.md` D1 验证 SSR、水合及真实 SPA 导航的 canonical/robots 一致，并保留 preview 封锁；缺域名构建失败。
2. **边缘缓存中间件随脚手架当天就位**，不留到上线前；验证用 GET 不用 HEAD（多数实现的缓存键只对 GET 生效）。
3. **字体策略当天定死**：CJK 系统字体栈，拉丁自托管子集化；`preload` 本身会抢带宽，实测反而把 LCP 推后一个 RTT，不要「先 preload 保险」；装饰字体走两全法，不必为分数放弃品牌字体。

- **闸门**：[`checklists.md`](references/checklists.md) 段 3。

### 4 上线前 SEO / GEO

- **触发**：「能不能上线了」「TDK」「密度」「怎么被 AI 引用」「站慢不慢」。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 4；判读 [`seo-box.md`](references/seo-box.md)、[`seo-webcafe.md`](references/seo-webcafe.md)、[`seo-growth.md`](references/seo-growth.md) 三-B。常用：`scripts/seo-audit.mjs --sitemap`、`scripts/pagespeed.mjs collect --strategy both`（`plan` 只打印链接不采数，仅兜底）、`scripts/is-agentic.mjs scan --save`、官方 `gefei-page` Skill（按其说明直接使用工具）。写文案的兄弟 Skill：中文 `/write`（先确认它的五个附属 Skill 都在，缺的用 `find-skills` 装齐；装不上才退到 `/human-writing` 起稿 + `/shuorenhua` 去 AI 味）；被 AI 引用的内容形状读 `/ai-seo` 的 content-patterns；JSON-LD 模板只读 `/seo-geo` 的 schema-templates，不跑它的脚本；配图 `/imagegen`。分工与加载条件见 [`skill-ecosystem.md`](references/skill-ecosystem.md)。

| 硬规则 | 为什么 |
|---|---|
| 在预览域上做完，预览域 **noindex** | 半成品被收录，第一印象就是半成品 |
| 一个明确搜索意图对应可解决任务的页面；「做成内页」需登记目标词、编写独立标题与描述、提供有用正文和真实功能、检查内链与占位，并做相关体检；相同意图的词可由同一页承接 | 一页扛多个词会互相稀释，首页覆盖太多词是排名波动的常见根因 |
| 每页以真实任务与读者可读性为准；SSR 输出应包含完成该任务所需的主要内容，不为提高词频把有用内容移到客户端 | 关键词密度是诊断线索，不是 Google 的通过阈值；异步加载不应遮蔽重要内容或损害用户体验 |
| **占位专项复查**是上线 review 必做项：按 sitemap 逐 URL grep（正则见 `discipline.md` 十四）+ 人工抽查首页/定价/关于/联系/法律页每个链接可点、每张图有内容，重跑不采信上一轮 | 段 3 的开发期禁令拦不住上线后仍有占位——这是漏法本身，闸门必须落在「上线前」这个时间点上才管用 |
| **图标专项未通过不许上线**：段 4 必过 `checklists.md` 图标专项，操作统一见 `lifecycle.md` 段 4 · A 节；发布后正式域名回读 | 必须核对全部实际引用与图案，文件存在、200 或标签页正常都不能代替实图核验；搜索结果刷新单独观察 |
| 可索引的重要页面有独立且准确的 meta / OG；需要分享卡的页面提供真实图片 | 分享卡应反映页面内容，图片需求依实际分享场景判定 |
| 正文是给人读的，不是给密度工具凑的：起稿后必须过一遍去 AI 味与结构梳理（中文走 `/write` 阶段四或 `/shuorenhua`，英文按 `/ai-seo` 的 Information Gain 判据自查），首屏一句话说清这页解决什么。**中英文都查四样**：矫饰文风（用比喻花腔代替直说，有直说就直说）、句子密度（一句一个意思）、引文标记（别人的话打引号注出处，最多一处）、格式克制（列表只在内容确实多面时用）——判据与自查正则在 `/write` 阶段四 | 模板腔与空话会被 AI 搜索跳过、被读者秒关；Information Gain 是 2026 排名与被引用的共同判据；矫饰句读者一眼能认出是模型写的 |
| GEO 先按 Google 搜索基础实践和目标用户任务检查；`llms.txt` 仅在其他明确消费它的系统有需求时做，不能当作 Google 搜索优化闸门 | Google 表示其搜索系统不使用 `llms.txt`；第三方 AI 产品的可发现性另按其实际协议验证 |
| **上线前（段 4）与 `rankup review` 全站体检可用 AITDK 作补充复核**（按 sitemap 抽样：首页 + 每类模板页各至少一个 + 全部法律/关于/联系页）；把报告中的问题逐条与实际页面、官方要求和用户目标核对；真实缺陷修复并重跑，工具建议、不可用结果和误报标明依据，不以满分为上线条件 | AITDK 是与 Google 视角独立的第三双眼睛，看得到自家 `seo-audit.mjs` / `is-agentic.mjs` 漏掉的项；第三方工具可发现自家脚本遗漏的问题，但评分和告警需要按真实影响判读 |
| **页面改动后重跑受影响的检查**：标题、描述、可索引性、渲染内容和实际用户路径；模板或全站配置改变时扩大到相应页面类型与站点范围 | 验证范围由改动影响面决定，并记录未覆盖范围 |
| 证据必填：控制台绿图标不算；PageSpeed 移动 + 桌面都跑、记录实验室分数与真实用户 Core Web Vitals；优先修复用户可感知的瓶颈，CrUX 无数据写“未知”；TTFB 异常时核对缓存与服务端耗时，LCP 异常时检查关键资源、脚本与渲染路径。工具机会项按实际影响排序，不要求每条都修 | 第三方报告和实验室分数不能代替真实用户体验；Google 明确不建议只为 SEO 追求工具满分 |

- **上线前与发布后复核入口**：复用 `checklists.md` D1 / D4 / D12 / D13 / P3，覆盖索引水合、Schema 语义、网格父子与键盘、SSR 可达性、分析去重与真实上报；操作见 `lifecycle.md` 与 `analytics-platforms.md`，图标专项仍完整执行。

- **闸门**：[`checklists.md`](references/checklists.md) 段 4。

### 5 上线与接入

- **触发**：「数据检测平台都接入了吗」「这个域名能不能用」「提交 sitemap」「把 Ahrefs 的检验结果都修了」。
- **入口**：[`lifecycle.md`](references/lifecycle.md) 段 5；[`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md)；域名接入 [`cloudflare-stack.md`](references/cloudflare-stack.md) 8.5。常用：`scripts/cf-analytics-setup.mjs`、`scripts/indexnow-submit.mjs`、`scripts/webmaster-sitemap.mjs`、`scripts/yandex-setup.mjs`、`scripts/ahrefs-site-audit.mjs`、`scripts/analytics-beacon-check.mjs`。

| 硬规则 | 为什么 |
|---|---|
| **部署一律走 Cloudflare 原生 Git 集成**（Pages「Git 存储库连接」/ Worker Workers Builds），push `main` 自动构建部署；**不写 GitHub Actions 部署 workflow**；本地 `wrangler deploy` 只作应急兜底。模板与坑见 [`cloudflare-stack.md`](references/cloudflare-stack.md) §9 | GitHub Actions 免费额度用完就断，Cloudflare 构建额度对站点几乎用不完 |
| 分两批：**批 A 域名无关**（GA4、Clarity、CF Web Analytics）在预览域接好并验证 → **域名定稿** → 绑域名并部署验证（**索引开关随之翻开，不等批 B**）→ **批 B 域名相关**（GSC、Bing、Yandex、Naver、IndexNow、Ahrefs WA + Site Audit、Email Routing）→ 提交 sitemap（默认不逐 URL 请求编入索引，需要催收录见 `search-platforms.md` 的可选脚本） | 批 A 不依赖域名，先做省一轮；批 B 换域名就作废，所以放在定稿之后。**正式域名不再靠 `noindex`/`Disallow: /` 拖到批 B 接完才放开**——曾有项目这样做，Google 抓到过屏蔽状态的 robots.txt，放开后 GSC 仍长期报「已编入索引，尽管遭到 robots.txt 屏蔽」，理由与替代方案见 `lifecycle.md` 段 5.4 第 22 条 |
| 域名定稿前过**黑历史裁决闸门**：官方 `gefei-domain` Skill、Wayback、外链画像、`site:` 搜索；成人 / 赌博 / 被惩罚一律否 | 带惩罚的域名做什么都起不来，换域名比救域名便宜 |
| **一个不漏**，清单要有「其他能带流量的平台」兜底行 | 有站 80% 流量来自 Bing，有站几乎全部来自韩国 |
| IndexNow 排在站长工具前面 | 它一样账号都不欠，先推了再慢慢验证所有权 |
| **绑定正式域名后、上线验收前主动完成基础安全**：按 [`cloudflare-stack.md`](references/cloudflare-stack.md) §8.8 核对 HTTPS、响应头及实际 API 防护，生产验证后记证据；已上线站 review 补查 | 属于上站后的检查优化；小改优先，嵌入/CSP/HSTS 先核用途，不批量上验证码或复杂 WAF |
| 接入必须**线上实测**：`curl` grep beacon 只证脚本在，CF WA 还要 GraphQL `count > 0` | `site_token` 填成 `site_tag` 不报错，一个站空跑了 45 天 |
| **第三方分析脚本（GA4、Clarity）一律延迟到首次交互或 6s 兜底再加载**（单用 `requestIdleCallback` 不够——空闲回调仍会落在 TBT 观测窗内），不许因为「脚本拖 LCP」把 GA4 标 ❌ 或推迟接入——延迟加载就完了，LCP 零影响 | 曾经因为这个理由把 GA4 标 ❌ 整整推迟了一天，纯属多此一举；【实测】单靠 `requestIdleCallback` 仍会被计入 TBT 观测窗 |
| Ahrefs Site Audit 的问题按报告逐 URL 修完，回段 4 全套重跑 | 第二台爬虫的价值在它看得到你自己漏掉的整站问题 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 5。

### 6 外链

- **触发**：「帮我搞点外链」「去哪发」「竞品的外链哪来的」「有没有毒」「发个 Product Hunt」。
- **入口**：`backlink` Skill（未装：`npx skills add yan-labs/yan-skills --skill backlink -g -y`）；判据 [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五；发布平台 [`product-launch.md`](references/product-launch.md)。

| 硬规则 | 为什么 |
|---|---|
| rankup 只判**什么时候发、发多少**；发现、填表、台账全在 `backlink` | 两个 Skill 各管一层，不在两处各存一份流程 |
| 候选站点调研判定**技术上可以对外提交**，只说明这个站没有硬伤、值得摆上桌，不代表这一轮就该把它排进提交队列；批量投递前必须把完整的候选清单摆给用户过一遍，等用户明确圈定这一轮实际要提交的子集，才能进入实际提交执行阶段 | 技术判定（存活状态、内容是否完整、是否占位页、是否公开产品）覆盖不到用户自己的曝光意愿与节奏考量——要不要让某个项目这一轮被公开曝光，这类判断只有用户能给；把技术清单默认当提交清单，等于拿技术判定替用户做了一次范围决策 |
| 节奏按 KD → 引荐域对照表；新词上线 2–4 周内不改页面 | 外链过快与频繁改页都会被读成操纵 |
| 302 / 307 不传权重；导航站按过滤清单筛；新后缀域名在老博客发的不算链接 | 这三条都是花了钱才知道的 |
| 每条外链进台账，证据阶梯 submitted → public → indexed 每级都要证据 | 没证据的外链等于没发 |

- **闸门**：[`checklists.md`](references/checklists.md) 段 6。

### 7 变现与监控

- **触发**：「没人付费」「定价怎么定」「接 PayPal」「AdSense 被拒」「流量掉了」「排名没了」。
- **入口**：[`monetization.md`](references/monetization.md)（Stripe / PayPal / 广告 / 订阅 / 商店上架）、[`conversion.md`](references/experiences/conversion.md)、[`evolution.md`](references/evolution.md)；掉量排查 [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 十七～十九。常用：`scripts/is-agentic.mjs diff`、`scripts/review.mjs`。转化文案与定价页用 `/marketing-psychology`（锚定、社会认同、损失厌恶、默认效应），找新渠道用 `/marketing-ideas`；两者只给角度，采不采纳按 `conversion.md` 的可采纳分档判，暗黑模式不采。

| 硬规则 | 为什么 |
|---|---|
| **Web/站外直销支付有备份**：优先 Stripe + PayPal；App商店按目标市场当前IAP/买断/订阅规则 | 按分发方式验证支付，不强制原生App接网页支付 |
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
| 有 API/CLI 且本机有凭据能证明，一律走 API/CLI，禁止开浏览器点后台；只在 API 不覆盖或需一次性 OAuth 授权时开，且只做那一步 | 五 |
| 配额站（Semrush / Similarweb / Ahrefs）不传 `--session`；会话名不用 `$$` | 五、六 |
| 发布页面不得有误导用户的占位链接 / 文案 / 图片 | 十四 |
| 做任何功能、任何页面，UI 只准来自脚手架的 shadcn 组件库或同生态现成组件；缺的先装，不许手写基础控件 | 十六 |
| 漏了不会变红的收尾动作（IndexNow 等）焊进 ship 命令 | 九 |
| 接入必须线上实测，不采信勾；批 A/批 B 接入看板逐行由 `scripts/review.mjs` 断言 | 十 |
| 真实令牌只在 Skill 的 `.env`，不进回复 / 日志 / git | 十一 |
| `check` 轻量零配额；命中升级条件要明说「这已经不是 check，是 review」 | 十三 |
| 面板 / 网页操作与文档对不上：先过五层分诊（重跑、浏览器与会话、额度配额、人眼截图、跨时段），确认是平台变了才改 Skill 原文档；环境问题只记项目 `journal/` | 十五 |
| IndexNow 推送默认 diff（只推新增 URL），全量用 `--all` 显式触发 | 十七 |
| ID / token / 密钥等标识符必须从页面 DOM 或复制按钮获取，禁止从截图、记忆、转录中抄录 | 十八 |
| 省 token 工作流（verify-live 验收、排查派便宜模型、换乘新会话、防 rtk 篡改循环） | 二十 |

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

review 不是「查 `.rankup/` 缺哪个文件」，是对这个站本身做一次全面体检。编排在 [`playbooks/site-review.md`](references/playbooks/site-review.md) 第一节：先摸前提，再把可独立运行的组按可用并发派给子 Agent（技术 SEO / 速度 / GEO / 关键词长尾 SERP / 哥飞官方 Skill 数据复核 / 市场规模 / 接入与记忆），最后由主 Agent 汇总回写。**A 组（技术 SEO）可纳入 AITDK 报告**，Issues 与未满分项先核对真实影响再决定修复范围，判据 [`checklists.md`](references/checklists.md) 段 4「闸门 4c」。`.rankup/` 不存在、站没上线、拿不到 GSC 三个分支都写死在 playbook 里，不要停下来先 init。**段 3 Day-1 清单与段 4 内页清单做到位时，review 应该只剩「补漏」；review 若发现 Day-1 项本该在脚手架当天做却缺失，先把它回流进这两份清单，再回去修站**——否则同一个坑会在下一个项目原样重演。

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

先装 `opencli`（`npx skills add yan-labs/yan-skills --skill opencli -g -y`）：OpenCLI 本体要装我们自己的构建，不是应用商店版（商店版默认前台抢标签页，失败不报错）。`opencli doctor` 报扩展版本过低时照它说的做。**凡是碰用户已登录浏览器的动作，一律走它，不得用其他浏览器自动化工具（含 Claude 自带的 Claude in Chrome 一类）替代**——理由与判据见 [`discipline.md`](references/discipline.md) 五。

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
