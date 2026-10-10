---
name: rankup
description: 独立开发者的项目全生命周期管理：需求验证、选词选品、建站或做原生 App、上线接入、SEO/GEO 获客、支付变现、监控迭代与跨会话接力。以下情况使用：用户提到 rankup 或 /rankup（check、review、init；doctor 仅指整理项目 .rankup 记录）；当前目录或工作区有 .rankup/，或要读取、续做、整理项目计划、路线图、待办、PRD、交接或进度文档；在这些项目记录上下文里说「继续」「接着做」「上次做到哪」「下一步做什么」；以及项目规划、需求验证、关键词调研与 SERP、独立 Google Trends 热度查询或对比、AI 搜索推荐（GEO）、网站体检、sitemap/IndexNow/Search Console、流量、建站、上线、支付（Stripe、Anyway、PayPal）、变现与增长。SEO/GEO 是主要手段，不是适用边界，非 SEO 的项目计划与 macOS、iOS、iPad 原生 App 同样适用。纯文案（含 SEO 趋势博客等主题写作）、纯视觉设计、与项目管理无关的通用开发及基础设施排错（含 Cloudflare 部署报错、普通 CLI doctor）不触发；目录内有 .rankup/ 时仅叠加项目记录维护义务；外链执行交 backlink，浏览器驱动交 opencli，配图生成交 imagegen，多模型派单交 agent-fleet。
metadata:
  version: "3.38.3"
---

# Rankup

**Rankup 是独立开发者的项目全生命周期管理 Skill**：调研与需求验证 → 立项与定位 → 建站或做原生 App（macOS、iOS、iPad；不做 Android App，Android 商店只作需求参考）→ 上线前 SEO / GEO → 上线与接入 → 外链获客 → 变现与监控迭代。
SEO 与 GEO 是最主要的获客与验证手段，**不是适用边界**：项目计划、交接文档、功能迭代、上线运维、项目记录整理都归这里。
每个项目的 `.rankup/` 记录长远规划与当前进展，负责跨会话接力；本文件只做入口与路由，细节在 `references/`，一次任务只读需要的那部分。
取不到的数据写「未知 / 不可用」，不写 0；区分「官方要求」「工具建议」「项目经验」；阶段性汇报不等于完成。

## 强制流程（先读这张表，再做任何事）

项目任务按下表读取相关入口与接力，再选择任务分支，避免依据过期印象执行；纯只读与轻量任务按对应例外执行。

| 触发条件 | 必须先读 | 必须做 | 完成标志 |
|---|---|---|---|
| **开工**：项目任务（含工作区根） | [接力协议](references/project-memory.md#接力协议任务随时可能中断新会话必须立即接上)、项目接力记录 | 按接力与下文启动协议恢复、对账和记录状态 | 接力可续做 |
| **里程碑**：产物、决定或后台任务状态变化 | 同上接力协议 | 覆盖当前接力与产物指针 | 接力反映最新状态 |
| **收尾**：完成、放弃、叫停或等用户决定 | [维护「一」「二」](references/maintenance.md#二收尾维护五步顺序固定) | 按轻量路径或五步维护收口；扫描用 `scripts/maintain/ref-scan.mjs` | 回复有维护摘要与证据 |
| 有项目记录上下文的「继续」「接着做」「上次做到哪」「我们开始执行这个项目的计划」，或读计划 / 交接 / 进度文档 | 同上「新会话怎么接」 | 定位项目 → 读接力（无 `.rankup/` 用 `HANDOFF.md`）→ 核对后台产物与改动 → 直接执行下一步 | 下一步已有执行证据 |
| 选词、调研、找需求（**已有主词**） | [`playbooks/entry.md`](references/playbooks/entry.md) → [`research.md`](references/playbooks/research.md) | 按入口四步顺序与两路判读执行；方向未落主词先走 [`selection.md`](references/playbooks/selection.md)，无方向先走 [P1](references/playbooks/research/p1-discovery.md)，主词出现后回本行 | 入口卡写进 `.rankup/research/<词根>-<日期>.md` |
| ChatGPT 问法链路、自然推荐验证 | [`seo-geo.md`](references/seo-geo.md) 步骤 2–3 | 问法、采样、追问与三清单只按该唯一源；词级编排与裁决回 [`entry.md`](references/playbooks/entry.md) | 入口卡②有三清单与原始证据指针 |
| 「谷歌质量」「HCU」「E-E-A-T」「AI 内容会不会被打」「内容 review」「垃圾内容政策」 | [`seo-helpful-content.md`](references/seo-helpful-content.md) | 区分官方口径与业内推断；按单页或站点级自检表核对并留证据 | 对应自检表通过且无红线 |
| 建站、做功能、写 UI | [`lifecycle/stage-3-build.md`](references/lifecycle/stage-3-build.md)、[`cloudflare-stack.md`](references/cloudflare-stack.md) | 用 shadcn 脚手架与组件库，不手写基础控件；当天过完 Day-1 清单 | [`checklists.md`](references/checklists.md) 段 3 通过 |
| 做内页、「把这个词做成页面」 | [`lifecycle/stage-4-prelaunch.md`「新增内页随手清单」](references/lifecycle/stage-4-prelaunch.md#新增内页--新模板的随手清单2026-09-12-回流) | 页面映射按 [段 2 §2.3](references/lifecycle/stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)；目标词登记到 `keywords.md`；按段 4 完成页面与体检 | `checks.md` 记 ✅ 与证据 |
| 上线前体检、「能不能上线」 | `checklists.md` 段 4、[`lifecycle/stage-4-prelaunch.md`](references/lifecycle/stage-4-prelaunch.md) | 全套体检：AITDK、PageSpeed、图标专项、占位专项；重跑不采信上一轮 | 段 4 闸门全绿，或写明改不动的理由 |
| 接入、绑域名、提交 sitemap、「怎么不收录」 | [`lifecycle/stage-5-launch.md`](references/lifecycle/stage-5-launch.md)、[`search-platforms.md`](references/search-platforms.md) | 先 `site-onboard.mjs --check` 再执行；接入一律线上实测 | `.rankup/integrations.md` 逐行有证据与日期 |
| 外链 | `backlink` Skill、[`lifecycle/stage-6-backlinks.md`](references/lifecycle/stage-6-backlinks.md) | Rankup 只判时机与数量；提交前把候选清单给用户圈定 | 台账有 submitted → public → indexed 证据 |
| 变现、支付、定价 | [`monetization.md`](references/monetization.md)、[`lifecycle/stage-7-monetize.md`](references/lifecycle/stage-7-monetize.md) | 按分发方式选主通道与备份，目标环境端到端验证 | 验证记录进 `.rankup/integrations.md` |
| 维护 Skill 本身：改 rankup 源码，或「把这个经验写进 rankup」 | [`maintenance.md`「五」](references/maintenance.md#五维护-skill-源码rankup-本身)、[`evolution.md`](references/evolution.md) | 全量扫描后改；拆移文档用 `scripts/maintain/split-doc.mjs`；`scripts/maintain/doc-lint.mjs` 断链为 0；validate 与相关测试通过；按规则升版本 | `node scripts/validate-rankup.mjs` 通过 |
| 「/rankup doctor」「doctor」（整理项目 `.rankup/` 记录）、「整理一下项目记录」「.rankup 太乱了」「整理一下 rankup」「把这个项目的 .rankup 重新整理」 | [`maintenance.md`「六」](references/maintenance.md#六rankup-doctor整理-rankup-的显式入口)、[`project-memory.md` 目录规范](references/project-memory.md#目录规范常驻文件保留什么去哪里多大) | 免版本更新与线上对账；`rankup-doctor.mjs` 只读诊断 → **经验分拣与回流**（按四层归属逐条判去向）→ 分三类出计划 → 执行 A、B → 回读校验；C 类与别的 Skill 的经验只列给用户 | 整理报告：改了、删了（从哪找回）、留了、经验分拣表、待用户决定 |

## 一句话落到哪

本表是已进入 rankup 项目流程后的路由，不扩大触发范围。

用户不会说「跑一下 seo-audit.mjs」。命中就照入口走，不要现编步骤；越模糊越不盲跑全套：有明确对象先选对应 playbook，已有项目没有明确动作先 `rankup check`，连项目与方向都没有时只问一句有没有想好的词或方向。

| 用户会说的话 | 段 | 入口 |
|---|---|---|
| 「做网站时需要 AI 视频/图片生成」「接 Kie」「Kie 音频可不可以用」 | 3 | [Kie 可选分支](references/integrations/kie.md) → [模型快照](references/integrations/kie-models.md)、[登记](references/registry.md)，按能力选供应商，Kie 不是必选 |
| 有项目记录上下文的「继续」「接着上次做」「上次做到哪了」「看看这份计划」「我们开始执行这个项目的计划」 | 当前段 | 见「强制流程」开工与继续行 |
| 「挖点需求」「最近有什么能做的」「找几个关键词」（没给具体词） | 1 | [`research/p1-discovery.md`](references/playbooks/research/p1-discovery.md) |
| 「调研一下这个词」「这个词能不能做」「帮我扩词」「找个 xxx 的需求」 | 1 | [`entry.md`](references/playbooks/entry.md) → [`research/p2-keyword-root.md`](references/playbooks/research/p2-keyword-root.md)（任何词都是词根，按[五个取数动作](references/playbooks/research.md#五个取数动作与编排探索循环)全自动跑完，不反问） |
| 「做小语种」「这个词在德语怎么搜」「某国市场找词」 | 1 | P2 [阶段 0.7 开工卡](references/playbooks/research/p2-keyword-root.md#阶段-07--非英语市场开工卡目标市场非英语时必填) + [三关](references/playbooks/research/p2-keyword-root.md#小语种候选词三关与本地竞品取词)；语种探测 [`trends.md`](references/trends.md) W1 |
| 「找个方向」「这个方向值不值得做」「选品」「帮我看看这个想法」 | 1 | [`selection.md`](references/playbooks/selection.md) 收集方向候选；主词出现后按 [`entry.md`](references/playbooks/entry.md) 验证与裁决 |
| 「App 有没有需求」「找 iOS/iPad/macOS 产品」 | 1–2 | [`research.md` App 分支](references/playbooks/research.md#app-市场验证分支) → [段 2](references/lifecycle/stage-2-positioning.md) 2.2 |
| 「谁在赚钱」「反查这个站」「帖子说月入 X 是真的吗」 | 1 | `research.md` P4 + [`demand-sources/validation-chain.md`](references/demand-sources/validation-chain.md) |
| 「筛这批 AITDK 报告」「只看竞品异常」 | 1 | [`seo-box.md`](references/seo-box.md#aitdk-研究报告离线分流)：`aitdk-triage.mjs` 离线分流 |
| 「运行趋势监控」「扫描种子 Rising」「美日韩趋势追踪」 | 1–2 | [`trends-system.md`](references/trends-system.md)：三区串行扫描、去重、健康台账与追踪复查 |
| 「XX 和 YY 哪个更火」「今天美国在搜什么」「这个词有没有量」 | 1–2 | [`trends.md`](references/trends.md)（[gpts 基线判读](references/trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)），`scripts/gt.py` |
| 「这个词在 AI 里有多大需求」「候选会不会被 ChatGPT 推荐」「竞品为什么被 AI 推荐」 | 1 / 4 验证 | 词级编排先读 [`entry.md`](references/playbooks/entry.md)，问法链路只按 [`seo-geo.md`](references/seo-geo.md)；面板数据见 [`provider-capabilities.md`](references/provider-capabilities.md)「三·五」 |
| 「已上线站 ChatGPT 会不会推荐我们」「问 ChatGPT 为什么不推荐」「推荐位整改」「GEO 闭环」「复审」 | 5 / 6 上线后 | [`seo-geo-recommendation-loop.md`](references/seo-geo-recommendation-loop.md)：复用问法与三清单 → 建议甄别 → 整改发布 → 复审；采样规则只指 [`seo-geo.md`](references/seo-geo.md) |
| 「有什么游戏站能做」「小游戏机会采集 / 决策」 | 1–2 | [`game-sites.md`](references/game-sites.md)：平台监控、sitemap 差分、新标题筛选；旧每日决策协议仅部分覆盖 |
| 「做不做」「做哪个语种」「要不要多语言」「做成工具还是内容站」 | 2 | [`lifecycle/stage-2-positioning.md`](references/lifecycle/stage-2-positioning.md) |
| 「我们做个网站吧」「帮我搭起来」 | 2→3 | 先过段 2 立项，再段 3 初始化；手上没有词树先回段 1 |
| 「做个功能」「加个 X」 / 开发中「按 rankup 规范来」 | 3–4 | [`lifecycle/stage-3-build.md`](references/lifecycle/stage-3-build.md)：UI 一律来自 shadcn 组件库，多功能工具站导航先读[侧栏统一规范](references/design-references.md#多功能工具站侧栏统一规范)；做完段 4 全套体检 |
| 「做个好看的页面」「Hero 怎么设计」「找个组件参考」 / 任何整站设计、改版 | 3 | **必须走 `/design` 并逐字带上获奖标准 prompt**（全文见 [`stage-3-build.md`](references/lifecycle/stage-3-build.md) 硬规则「设计一律走 `/design`」），再用 [`design-references.md`](references/design-references.md) 选 2–3 个案例再实现 |
| 「我们做个内页吧」「关键词没问题了，做成内页」 | 4 | 见「强制流程」做内页一行 |
| 「看一下 SEO / GEO 有没有问题」「能不能上线」「TDK」「密度」 | 4 | `checklists.md` 段 4 + [`seo-box.md`](references/seo-box.md)；第三方复核加载官方 `gefei-page`（[`seo-webcafe.md`](references/seo-webcafe.md)） |
| 「怎么被 AI 引用」「llms.txt」「对 AI 代理友好吗」 | 4 | [`seo-ai-search.md`](references/seo-ai-search.md)；推荐位做法见 `seo-geo.md`；SEO 专题索引 [`seo-growth.md`](references/seo-growth.md) |
| 「生成 logo / 配图 / og 图」「做一整套网站图标」 | 3–4 | `/imagegen` 真实生成；图标集 `scripts/make-favicons.mjs --src <logo.png> --out <public目录>` |
| 「写一下这页的文案」「AI 味太重」 | 4 | 中文 `/write`（自带起稿、改稿与去 AI 味体检，不依赖别的 Skill）；内容形状按 `/ai-seo`，见 [`skill-ecosystem.md`](references/skill-ecosystem.md) |
| 「站慢不慢」「Core Web Vitals」 | 4 | `scripts/pagespeed.mjs collect --strategy both`，判读 `seo-box.md` 一 |
| 「这个域名能不能用」「域名黑历史」 | 5 | [段 5](references/lifecycle/stage-5-launch.md) 黑历史闸门 + 官方 `gefei-domain` |
| 「域名买完了」「帮我绑域名」 | 5 | [`cloudflare/domain-email.md`](references/cloudflare/domain-email.md) §8.5 全 API 绑定 → [`cloudflare-stack.md`](references/cloudflare-stack.md) §8.8 基础安全 → `domain-email.md` §8.6 邮箱 → 上线验收 |
| 「数据平台都接了吗」「GSC 接了没」「提交 sitemap」「怎么一直不收录」 | 5 | `node scripts/site-onboard.mjs --domain <域名> --repo <仓库> --check`；[`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md) |
| 「把 Ahrefs 的检验结果都修了」 | 5→4 | `scripts/ahrefs-site-audit.mjs` 取清单 → `scripts/ahrefs-issues-recheck.mjs` 线上复核 → 修完段 4 全套重跑 |
| 「帮我搞点外链」「竞品外链哪来的」「发个 Product Hunt」 | 6 | `backlink` Skill + [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五；发布平台 [`product-launch.md`](references/product-launch.md) |
| 「没人付费」「文案怎么写才有人点」「定价页怎么排」「渠道」「定价怎么定」「接 PayPal / Anyway」「AdSense 被拒」 | 7 | [`monetization.md`](references/monetization.md)、[`payments-anyway.md`](references/payments-anyway.md)、[`conversion.md`](references/experiences/conversion.md)；角度用 `/marketing-psychology`、`/marketing-ideas` |
| 「流量掉了」「排名没了」「是不是被 K 了」 | 7 | [`webcafe-experiences-2.md`](references/experiences/webcafe-experiences-2.md) 十七～十九 |
| 「流量涨了」「这两天为什么涨」「why is traffic up」 | 7 | 先读项目 `.rankup/INDEX.md` 与 `.rankup/decisions.md`，结合线上页面和代码核对已下线功能、重定向及实际能力；再按 GSC 日期/页面/查询与分析来源拆增量，URL 迁移按 [`seo-experiences-2026-07-late.md`](references/seo-experiences-2026-07-late.md)「[2026-07-30] URL 迁移期的页面报表必须把旧 URL 与新 canonical 合并看」判读。未显示查询与未定稿日期单列未知 |
| 「现在该做什么」「一步步来」「到哪一步了」「让流量涨一点」「优化一下我的网站」「今天弄下 SEO」 | check | `rankup check`（下文「命令」）；默认打磨转化链路，见[段 7 段首](references/lifecycle/stage-7-monetize.md) |
| 「review 一下我的站」「查漏补缺」「这项目脱轨了」 | review | `rankup review` |
| 「把这个老项目接进来」「rankup init」 | init | `rankup init` → [`project-memory.md`](references/project-memory.md) |
| 「/rankup doctor」「doctor」（整理项目 `.rankup/` 记录）、「整理一下项目记录」「.rankup 太乱了」「整理一下 rankup」 | doctor | `rankup doctor` → [`maintenance.md`](references/maintenance.md)「六」 |
| 「群里怎么说的」「哥飞说过什么」 | 经验 | 官方 `gefei` Skill 知识库工作流；公开论坛 [`webcafe-forum.md`](references/webcafe-forum.md) |
| 「把这个经验写进 rankup」 | 维护 | [`maintenance.md`](references/maintenance.md)「五」第 2 条 |
| 「抓一下后台数据」「Semrush 能查这个吗」 | 取数 | 哥飞工具先加载官方 `gefei`；其他面板看 [`provider-capabilities.md`](references/provider-capabilities.md) |
| 说的事这张表没有，或点名的兄弟 Skill 本机没装 | — | [`capability-map.md`](references/capability-map.md) → [`skill-ecosystem.md`](references/skill-ecosystem.md) → [`integrations.md`](references/integrations.md) 用 `find-skills` 搜索并安装；不现写等价实现 |

## 七段生命周期

每段保留适用场景、入口、原则摘要与闸门指针。硬规则全文（含「为什么」）在各段文件，步骤 check 与操作也在那里；[`lifecycle.md`](references/lifecycle.md) 是总述、旧编号映射与对账。**完成验收只在 [`checklists.md`](references/checklists.md)，关键词与立项裁决只在 [`entry.md`](references/playbooks/entry.md)。**

### 1 调研 · [全文](references/lifecycle/stage-1-research.md)

- **触发**：一批数据、一个词、一个帖子、一个域名，问能不能做；或只有模糊方向问值不值得做（先进 `selection.md`）。
- **入口**：词级先过[入口环节](references/playbooks/entry.md) → [`research.md`](references/playbooks/research.md)（P0 分流：没东西 P1、一个词 P2、一个域名 P4）；裁决只见 [`entry.md`](references/playbooks/entry.md)，历史经验见 [`demand-discovery.md`](references/experiences/demand-discovery.md)；证据覆盖见 `research-checklist.md`。常用：`scripts/demand/suggest.mjs`、官方 `gefei-keywords` / `gefei-competitor`、`backlink/scripts/semrush-keyword.mjs`、面板取证 `scripts/rankup-cli.mjs`（`npx @yan-labs/rankup audit similarweb`）；问法与采样工具见 [`seo-geo.md`](references/seo-geo.md)。
- **原则与范围**：顺序与两路判读只按 [入口环节](references/playbooks/entry.md)；GT 测量只按 [gpts 基线判读](references/trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)，ChatGPT 问法链路只按 [`seo-geo.md`](references/seo-geo.md)。
- **闸门**：`checklists.md` 段 1。

### 2 立项与定位 · [全文](references/lifecycle/stage-2-positioning.md)

- **触发**：方向已有，问做不做、做哪个语种、做成什么形态；主词出现后先读 [`entry.md`](references/playbooks/entry.md)。立项后的经营经验见 [`zero-to-one.md`](references/experiences/zero-to-one.md)。
- **原则与范围**：立项裁决只见 [`entry.md`](references/playbooks/entry.md)；市场选择、产品形态及问法簇到页面的移交见 [段 2](references/lifecycle/stage-2-positioning.md)。
- **闸门**：`checklists.md` 段 2。

### 3 建站与开发 · [全文](references/lifecycle/stage-3-build.md)

- **适用**：shadcn、TanStack、Cloudflare 与段 4–6 的网页规则只约束 Web 面；macOS 按 `build-macos-apps` 专项 Skill，iOS/iPad 按对应原生工具，商店分发读 `monetization.md` 五；只有 App 时网页项标 N/A。
- **入口**：[`cloudflare-stack.md`](references/cloudflare-stack.md)（脚手架命令、资源选择）；三方库优先见 [`integrations.md`](references/integrations.md)。
- **原则与范围**：Web 面复用现有可访问组件与 shadcn 初始化流程，保留键盘、焦点与 ARIA 能力；基础控件边界见[纪律十六](references/discipline.md#十六组件库红线段-3--段-4ui-只准来自组件库不许自己造控件)。**品牌图标在开发当天做齐**，Day-1 清单见[段 3](references/lifecycle/stage-3-build.md)。
- **闸门**：`checklists.md` 段 3。

### 4 上线前 SEO / GEO · [全文](references/lifecycle/stage-4-prelaunch.md)

- **入口**：判读 [`seo-box.md`](references/seo-box.md)、[`seo-webcafe.md`](references/seo-webcafe.md)、[`seo-ai-search.md`](references/seo-ai-search.md)。常用：`scripts/seo-audit.mjs --sitemap`、`scripts/pagespeed.mjs collect --strategy both`、`scripts/is-agentic.mjs scan --save`、`scripts/ai-crawler-access.mjs --url <正式域名>`、`scripts/ua-parity.mjs <url>`。
- **原则与范围**：本段每次改动后按[段 4 全套验收](references/lifecycle/stage-4-prelaunch.md)重跑，因为 TDK、布局与性能会相互影响；适用范围与全部闸门按原规则执行。**图标专项未通过不许上线**。
- **上线前与发布后复核入口**：复用 `checklists.md` D1 / D4 / D12 / D13 / P3（索引水合、Schema 语义、网格与键盘、SSR 可达性、分析去重与真实上报）；操作见段 4 文件与 `analytics-platforms.md`。
- **闸门**：`checklists.md` 段 4。

### 5 上线与接入 · [全文](references/lifecycle/stage-5-launch.md)

- **入口**：[`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md)、域名接入 [`cloudflare/domain-email.md`](references/cloudflare/domain-email.md)。常用：`scripts/site-onboard.mjs`、`scripts/gsc-domain-verify.mjs`、`scripts/bing-import-from-gsc.mjs`、`scripts/cf-analytics-setup.mjs`、`scripts/indexnow-submit.mjs`、`scripts/webmaster-sitemap.mjs`、`scripts/yandex-setup.mjs`、`scripts/ahrefs-site-audit.mjs`、`scripts/analytics-beacon-check.mjs`。
- **原则与范围**：按[段 5](references/lifecycle/stage-5-launch.md)完成部署、索引与接入，并以真实线上证据收口，避免用勾选代替生效状态。
- **闸门**：`checklists.md` 段 5。

### 6 外链 · [全文](references/lifecycle/stage-6-backlinks.md)

- **入口**：`backlink` Skill（未装：`npx skills add yan-labs/yan-skills --skill backlink -g -y`）；判据 `webcafe-topics.md` 五；发布平台 `product-launch.md`。
- **原则与范围**：外链执行、范围圈定与证据台账见[段 6](references/lifecycle/stage-6-backlinks.md)，技术可提交不等于本轮已授权投递。
- **闸门**：`checklists.md` 段 6。

### 7 变现与监控 · [全文](references/lifecycle/stage-7-monetize.md)

- **入口**：[`monetization.md`](references/monetization.md)、[`conversion.md`](references/experiences/conversion.md)、[`evolution.md`](references/evolution.md)；掉量排查 `webcafe-experiences-2.md` 十七～十九；常用 `scripts/is-agentic.mjs diff`、`scripts/review.mjs`。
- **原则与范围**：支付、变现、监控与回流见[段 7](references/lifecycle/stage-7-monetize.md)，按目标分发方式和真实业务证据判断。
- **闸门**：`checklists.md` 段 7。

## 红线速查

先查脚本清单，禁止现写等价实现或手点界面，脚本坏了修脚本（[`discipline.md`](references/discipline.md) 二）；执行、取数、完成标准与事故判据统一查 [`discipline.md`](references/discipline.md)，AI 探针的通道与证据边界查 [`seo-geo.md`](references/seo-geo.md)。

- **一切浏览器动作一律 OpenCLI 驱动用户的浏览器**，以复用登录态与可复现会话；见[纪律五](references/discipline.md#五浏览器与取数规则在-opencli-skill这里只留判据)。
- **所有 AI 爬虫必须放行**并逐 UA 实测，使公开内容具备被发现与读取的资格；见[基础安全](references/cloudflare-stack.md)与 `checklists.md` 段 5。
- 令牌保护见文末「令牌与项目中立」；密钥不进回复、日志或仓库，防止泄漏与误提交。

## 主线：维护 checklist，使用 checklist

每段都有一套 checklist，不过 check 不许进下一段；每轮迭代新做的东西，把相关 check 重新过一遍。

- **闸门 check** 在 `checklists.md`，判「这段能不能算完」；**步骤 check** 在各段文件，判「这一步做对了没有」。
- 状态记在项目 `.rankup/checks.md`：✅ + 证据位置 + 日期；做不了标 ⏸ 写清卡在哪；开新一轮把标「每轮」的打回 ⬜。
- 判断由你做，不找脚本代劳：`scripts/review.mjs` 只给文件层面的缺口。
- 判据只在 `checklists.md`，操作只在各自文档；缺 check 先补进 `checklists.md` 再去做。

## 命令

### `rankup check`

「现在该做什么」「一步步来」时的唯一动作，编排在 [`playbooks/site-review.md`](references/playbooks/site-review.md) 第二节。读 `checklists.md` 与 `.rankup/checks.md`，跑一次 `scripts/review.mjs`，找到第一个没过闸的段，逐项去真实代码、线上响应、后台读数核对，直接照着做并在 `checks.md` 记证据。**零配额、不派七组 agent**；命中升级判据（已上线但 `audit.md` 缺失、`.rankup/` 不存在、动过线上 URL 且超过一轮没体检、用户问的其实是站有什么问题）就明说「这已经不是 check，是 review」并转全站体检。

### `rankup init`

全新项目，或做了很久还没有 `.rankup/` 的项目（常态，不得因为缺记忆就重建技术栈）：摸清 `package.json`、路由、部署配置、`git log`，已上线的再取线上 `sitemap.xml`、`robots.txt`、首页；外部系统一律实时查询；按 [`project-memory.md`](references/project-memory.md) 建 `.rankup/` 全套，取不到的写 `待确认`；`integrations.md` 用完整平台表初始化全部 ⬜（`discipline.md` 十）；已运行项目补 `baseline.md` 与 `audit.md`，`roadmap.md` 写阶段目标与放弃条件；绿地项目脚手架跑通即建**私有**远端仓。已有 `.rankup/` 时不覆盖，转为补齐并提示用 `review` 或 `doctor`。

### `rankup review`

对站本身做全面体检，编排在 `site-review.md` 第一节：先摸前提，再把可独立运行的组按可用并发派出（技术 SEO / 速度 / GEO / 关键词长尾 SERP / 哥飞官方 Skill 数据复核 / 市场规模 / 接入与记忆），主 Agent 汇总回写。A 组含 AITDK 全站报告，Issues 与未满分项一律必修（`checklists.md`「闸门 4c」）。G 组：`scripts/review.mjs --project-root .` 出五块报告；会话记录 `scripts/sessions.mjs --project-root . --days 14 --new-only`（水位线在 `.rankup/review-state.json`，`--dump` 消化完才 `--mark`），从中找用户纠正、验证过的结论、坑与根因、已推翻旧记录的事实（**修订**原条目）。review 发现 Day-1 项缺失，先回流进段 3 / 段 4 清单再修站。

### `rankup doctor`

整理项目记录，是「维护」章节的显式入口：在用了很久、文档很多的项目上，按 [`maintenance.md`「六」](references/maintenance.md#六rankup-doctor整理-rankup-的显式入口) 全量扫描、**做经验分拣与回流**（项目 / 用户全局层 / Skill 源码 / 别的 Skill，判定见「七」）、清理过时 / 重复 / 任务型内容、原地修订被推翻的结论、目录归位、校验根层 `portfolio.md` 与 `projects.json` 条目数、输出整理报告。第一步永远是只读诊断 `node "<rankup-skill-dir>/scripts/maintain/rankup-doctor.mjs" --project-root . [--portfolio-root <工作区根>]`；拿不准的只列给用户，不删。与 `check`（定位下一步）、`review`（修站）的分工见该节表格。

## 启动协议

1. 常规执行读 `skill.json`，跑 `node "<rankup-skill-dir>/scripts/check-version.mjs" --project-root . --apply`；网络失败保留当前版本，不得伪称已更新。**doctor 只整理记录，免版本更新与线上三方对账**；任务明确禁止联网、Git 或改动时遵守其范围。
2. **三方对账门禁**：回答「接下来做什么」或宣称执行进度前，核对 `git log --oneline -25`、真实路由与线上 `sitemap.xml` 全量 `<loc>`；按任务适用面核对，记录与现实不一致先回写。只读问答只核对所问事实，不为此制造状态变化。
3. 其余读取、接力与收尾只按表首指针执行。**沉淀义务与是否调用本 Skill 无关**，细则见 [`project-memory.md`](references/project-memory.md#沉淀义务)。

## 经验库：规划与迭代之前先翻一遍

[`references/experiences/`](references/experiences/INDEX.md) 回答「该怎么判断、别人踩过什么坑」：挖需求读 `demand-discovery.md`，规划读 `zero-to-one.md`，上线后改什么读 `conversion.md`，技术 SEO / 站群 / 多语言 / 索引读 [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 与 `webcafe-topics.md`。经验层不带项目信息；每条有出处与证据等级（【实测】/【经验】/【猜测】，猜测不当结论）；采纳前先问「我们的前提一样吗」。

## 可复用操作必须落成脚本

在授权修改范围内，将确定会重复的链路本轮参数化并跑通，省掉下轮重写；只读或禁止改脚本的任务只列候选。触发条件、落点与验收见 [`maintenance.md`「五」第 1 条](references/maintenance.md#五维护-skill-源码rankup-本身)。

## 跨项目资产登记表

各项目的 `.rankup/` 互不可见，登记表把可复用脚本索引到一处：`node "<rankup-skill-dir>/scripts/registry.mjs" scan --roots <存放项目的目录>` 整表重建，`list` 查看。它是 Skill 目录下的 `registry.md`，含项目名与绝对路径，因此被 `.gitignore` 排除，并由 `scripts/validate-rankup.mjs` **断言绝不能被 git 追踪**。扫描根目录来自 `--roots`、`RANKUP_PROJECT_ROOTS` 或 `~/.rankup/config.json`，绝不写死；只索引不复制。

## 哥飞官方 Skill

查关键词、竞品、域名、页面、哥飞经验，按 [`seo-webcafe.md`](references/seo-webcafe.md) 检查并加载**哥飞官方 Skill 包**；未安装则按[官方页面](https://seo.web.cafe/api/)安装，再主动读取官方 `gefei/SKILL.md` 与对应专用 `SKILL.md`。专用 Skill 设了 `disable-model-invocation: true`，不会自动触发，必须主动加载。工具怎么调听官方，市场证据与闸门仍由 Rankup 判断。单一查询主 Agent 直接调；多个独立问题才分给子 Agent，收回后统一判读。

## 安装与版本

先装 `opencli`（`npx skills add yan-labs/yan-skills --skill opencli -g -y`）：OpenCLI 本体装我们自己的构建，不是应用商店版（商店版默认前台抢标签页，失败不报错）；`opencli doctor` 报扩展版本过低时照它说的做。一切浏览器动作用 `opencli browser <描述性会话名>` 的 dedicated 窗口，理由见 `discipline.md` 五。Web 项目的 Cloudflare 工具链：`npm i -g cf`、`npx skills add yan-labs/yan-skills --skill cf-cli -g -y`；现有项目继续用项目锁定的 Wrangler。

```bash
npx skills add yan-labs/yan-skills --skill rankup -g -y   # 全局安装
npx skills update rankup -g -y                            # 全局更新
npx skills update rankup -p -y                            # 项目级更新
```

发布版本记录在 `skill.json`；项目的启用时间、已安装版本和最近检查状态记录在 `.rankup/skill-state.json`。`check-version.mjs` 最多每 24 小时访问一次远端，只更新本 Skill；源码检出（仓库根有 `.skill-source`）或工作区有未提交修改时拒绝更新并报告原因，链接被换成实体目录时在仓库里跑 `node scripts/link-skills.mjs` 恢复。版本号规则见 `maintenance.md`「五」第 6 条。

## 令牌与项目中立

- 第三方工具令牌只有一份，放 Skill 根目录 `.env`，环境变量优先；细则见 `discipline.md` 十一。
- 严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥、token、密码、私钥、webhook secret、支付敏感数据或个人敏感信息。
- **本 Skill 必须保持项目中立与机器中立**：不带本项目私有出处或身份（站点名、域名、流量数字、account/property ID、本机路径与代理、私有凭据位置）；公开供应商地址与必要的公开来源可保留。回流经验只带走剥离站点后仍成立的规则。由 `scripts/validate-rankup.mjs` 断言。
- 不记录未验证猜测；旧经验被证伪时修订原条目，不并列保留冲突结论。
