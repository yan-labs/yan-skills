---
name: rankup
description: 独立开发者的项目全生命周期管理：需求验证、选词选品、建站或做原生 App、上线接入、SEO/GEO 获客、支付变现、监控迭代与跨会话接力。以下情况使用：用户提到 rankup 或 /rankup（check、review、init；doctor 仅指整理项目 .rankup 记录）；当前目录或工作区有 .rankup/，或要读取、续做、整理项目计划、路线图、待办、PRD、交接或进度文档；在这些项目记录上下文里说「继续」「接着做」「上次做到哪」「下一步做什么」；精简、压缩 Agent 记忆文件（memory 太大、清理记忆）；说“清理一下”“清理 N 天/一周之前的日志/报告/截图”来清理项目过程数据；以及项目规划、需求验证、关键词调研与 SERP、独立 Google Trends 热度查询或对比、AI 搜索推荐（GEO）、网站体检、sitemap/IndexNow/Search Console、流量、建站、上线、支付（Stripe、Anyway、PayPal）、变现与增长。SEO/GEO 是主要手段，不是适用边界，非 SEO 的项目计划与 macOS、iOS、iPad 原生 App 同样适用。纯文案（含 SEO 趋势博客等主题写作）、纯视觉设计、与项目管理无关的通用开发及基础设施排错（含 Cloudflare 部署报错、普通 CLI doctor）不触发；目录内有 .rankup/ 时仅叠加项目记录维护义务；外链执行交 backlink，浏览器驱动交 opencli，配图生成交 imagegen，多模型派单交 agent-fleet。
metadata:
  version: "4.1.0"
---

# Rankup

独立开发者的项目全生命周期管理：调研与需求验证 → 立项与定位 → 建站或做原生 App（macOS、iOS、iPad；不做 Android App，Android 商店只作需求参考）→ 上线前 SEO/GEO → 上线与接入 → 外链 → 变现与监控迭代。SEO 与 GEO 是最主要的获客与验证手段，**不是适用边界**：项目计划、交接文档、功能迭代、上线运维、项目记录整理都归这里。

每个项目的 `.rankup/` 记录长远规划与当前进展，负责跨会话接力。本文件只做入口与路由，细节在 `references/`，一次任务只读需要的那部分。

三条贯穿始终的口径，因为下一个会话会把记录当事实用：取不到的数据写「未知 / 不可用」，不写 0；区分「官方要求」「工具建议」「项目经验」；阶段性汇报不等于完成。

## 启动协议

每次使用 rankup 先读全局层索引，再读当前项目索引。以下命令按此顺序注入，缺文件即跳过：

!`node "${CLAUDE_SKILL_DIR}/scripts/maintain/read-memory-index.mjs"`

未展开命令的客户端，开工先用实际 Skill 路径运行 `node "<rankup-skill-dir>/scripts/maintain/read-memory-index.mjs" [<项目目录>]`。工作目录与目标项目不一致时显式传入项目目录。按索引读取相关全局规则，再进入项目接力与任务路由。[三层归属与项目记忆维护规范](references/maintenance.md#七三层归属与项目记忆维护规范)定义写入与整理方式。

1. **版本**：常规执行读 `skill.json`，跑 `node "<rankup-skill-dir>/scripts/check-version.mjs" --project-root . --apply`；网络失败保留当前版本，不得伪称已更新。doctor 只整理记录，免版本更新与线上三方对账；任务明确禁止联网、Git 或改动时遵守其范围。
2. **三方对账门禁**：回答「接下来做什么」或宣称执行进度前，核对 `git log --oneline -25`、真实路由与线上 `sitemap.xml` 全量 `<loc>`；按任务适用面核对，记录与现实不一致先回写。只读问答只核对所问事实，不为此制造状态变化。
3. 其余读取、接力与收尾只按上表指针执行。**沉淀义务与是否调用本 Skill 无关**，细则见 [`project-memory.md`](references/project-memory.md#沉淀义务)。

## 收尾协议

- 规则被证伪：当场原地修订或删除。
- 用户纠正做法：当场按规范蒸馏，原话存记录。
- 用户改调度：用 `fleet-go order set` 更新调度状态。
- 同一坑多花一轮以上：收尾时蒸馏。
- 每次收尾自问「这单改变了哪条规则」。没有就不写。

## 强制流程（先读这张表，再做任何事）

项目任务按下表读入口与接力，再选任务分支，避免依据过期印象执行；纯只读问答与轻量任务按[维护「一」的轻量路径](references/maintenance.md#一什么时候必须走本章)。

| 时点 | 先读 | 做什么 | 完成标志 |
|---|---|---|---|
| **开工**：项目任务（含工作区根） | [接力协议](references/project-memory.md#接力协议任务随时可能中断新会话必须立即接上)、项目接力记录 | 按接力与下文「启动协议」恢复、对账、记录状态 | 接力可续做 |
| **里程碑**：产物、决定或后台任务状态变化 | 同上 | 覆盖当前接力与产物指针 | 接力反映最新状态 |
| **收尾**：完成、放弃、叫停或等用户决定 | [维护「一」「二」](references/maintenance.md#二收尾维护五步顺序固定) | 按轻量路径或五步维护收口；扫描用 `scripts/maintain/ref-scan.mjs`，清过程数据用 `scripts/maintain/rankup-clean.mjs --apply` | 回复有维护摘要与证据 |
| 「继续」「接着做」「上次做到哪」「开始执行这个项目的计划」，或读计划 / 交接 / 进度文档 | 同上「新会话怎么接」 | 定位项目 → 读接力（无 `.rankup/` 用 `HANDOFF.md`）→ 核对后台产物与改动 → 直接执行下一步 | 下一步已有执行证据 |

需要登录态的验收先按[测试身份与登录通路](references/discipline.md#测试身份与登录通路)复用已有身份、自查通路并遵守测试边界。

## 命令

三个命令的分工、init 与 review 的全文见 [`references/commands.md`](references/commands.md)。

### `rankup check`

「现在该做什么」「一步步来」「到哪一步了」「让流量涨一点」「优化一下我的网站」「今天弄下 SEO」时的唯一动作，编排在 [`playbooks/site-review.md`](references/playbooks/site-review.md) 第二节。读 [`references/checklists.md`](references/checklists.md) 与 `.rankup/checks.md`，跑一次 `scripts/review.mjs`，找到第一个没过闸的段，逐项去真实代码、线上响应、后台读数核对，直接照着做并在 `checks.md` 记证据。零配额、不派多组 agent；发现用户问的其实是站有什么问题，就明说转 review（升级判据见 commands.md）。默认方向是打磨转化链路，见[段 7 段首](references/lifecycle/stage-7-monetize.md)。

### `rankup init`

「把这个老项目接进来」。全新项目，或做了很久还没有 `.rankup/` 的项目：摸清真实代码与线上现状，按 [`project-memory.md`](references/project-memory.md) 建 `.rankup/` 全套，取不到的写 `待确认`；不因缺记忆重建技术栈，已有 `.rankup/` 不覆盖。步骤全文见 [commands.md](references/commands.md#rankup-init)。

### `rankup review`

「review 一下我的站」「查漏补缺」「这项目脱轨了」。对站本身做全面体检：按组并发（技术 SEO / 速度 / GEO / 关键词 SERP / 哥飞数据复核 / 市场规模 / 接入与记忆），主 Agent 汇总回写，并从会话记录里回收用户纠正与已推翻的结论。编排见 [`site-review.md`](references/playbooks/site-review.md) 第一节，分组与脚本参数见 [commands.md](references/commands.md#rankup-review)。

### `rankup doctor`

「/rankup doctor」「整理一下项目记录」「.rankup 太乱了」「整理一下 rankup」「把这个项目的 .rankup 重新整理」。只整理项目记录，不碰站点代码与线上，免版本更新与线上对账。按 [`maintenance.md`「六」](references/maintenance.md#六rankup-doctor整理-rankup-的显式入口)与[目录规范](references/project-memory.md#目录规范常驻文件保留什么去哪里多大)执行：

1. 只读诊断：`node "<rankup-skill-dir>/scripts/maintain/rankup-doctor.mjs" --project-root . [--portfolio-root <工作区根>]`。
2. **经验分拣与回流**：按三层归属（源码层 / 全局层 / 项目层，其他经验归对应 Skill）逐条判去向。
3. 分三类出计划：A 安全直接改、B 下沉并保留证据、C 需要用户决定。执行 A、B，C 类与别的 Skill 的经验只列给用户，拿不准的不删。
4. 回读校验（含根层 `portfolio.md` 与 `projects.json` 条目数），输出整理报告：改了、删了（从哪找回）、留了、经验分拣表、待用户决定。

## 清理

用户说“清理一下”默认 7 天，普通清理直接执行不先问；本节是清理用法的唯一源。

```bash
node "<rankup-skill-dir>/scripts/maintain/rankup-clean.mjs" --workspace <工作区> --older-than 7d --apply   # 单项目用 --project-root <项目>；一周可写 1w
```

- 不加 `--apply` 只预览（`--dry-run` 始终只预览）；`--apply` 直接删除，不进回收站、不备份。
- 删什么：按修改时间删过程数据，以及 `research/`、`journal/`、`reports/`、`evidence/` 里的旧报告和临时脚本；历史 trash 按同一时限清。指向被删文件的链接改成行内文字。
- 不删什么：Git 已跟踪的文件（列入待确认）、常驻文件、`.keep-data` 白名单、状态文件。Git 索引无法核实时整个项目不删并写明原因。
- 证据和备份（路径含 backup/evidence/snapshot/dump，或 SQL、bak、数据库副本等）只列「待确认」，按目录或项目聚合成约 50 行以内的清单（路径前缀、文件数、总大小、最新时间、是否被引用）；`--json` 保留每项明细。未发现引用不等于无用。
- 待确认项由主线程逐项核实后问用户，同意的才加 `--include-backups <路径…>` 删除，仍受时限与常驻、状态、运行中保护约束。

## 一句话落到哪

已进入 rankup 流程后的路由，不扩大触发范围。用户不会说「跑一下 seo-audit.mjs」：命中就照入口走，不现编步骤。越模糊越不盲跑全套：有明确对象先选对应入口，已有项目没有明确动作先 `rankup check`，连项目与方向都没有时只问一句有没有想好的词或方向。

### 段 1–2：调研、选词、立项

| 用户会说 | 入口 | 做到什么算完 |
|---|---|---|
| 「调研一下这个词」「这个词能不能做」「帮我扩词」「找个 xxx 的需求」（**已有主词**） | [`entry.md`](references/playbooks/entry.md) → [`research.md`](references/playbooks/research.md) → [`p2-keyword-root.md`](references/playbooks/research/p2-keyword-root.md)。任何词都是词根，按[五个取数动作](references/playbooks/research.md#五个取数动作与编排探索循环)全自动跑完，不反问 | 入口卡写进 `.rankup/research/<词根>-<日期>.md` |
| 「挖点需求」「最近有什么能做的」「找几个关键词」（没给词） | [`p1-discovery.md`](references/playbooks/research/p1-discovery.md)；数据源选型 [`demand-sources.md`](references/demand-sources.md) | 主词出现后回上一行 |
| 「找个方向」「这个方向值不值得做」「选品」「帮我看看这个想法」 | [`selection.md`](references/playbooks/selection.md) 收集方向候选；主词出现后按 `entry.md` 验证与裁决 | 同上 |
| 「做小语种」「这个词在德语怎么搜」「某国市场找词」 | P2 [阶段 0.7 开工卡](references/playbooks/research/p2-keyword-root.md#阶段-07--非英语市场开工卡目标市场非英语时必填) + [三关](references/playbooks/research/p2-keyword-root.md#小语种候选词三关与本地竞品取词)；语种探测 [`trends.md`](references/trends.md) W1 | 同上 |
| 「XX 和 YY 哪个更火」「今天美国在搜什么」「这个词有没有量」 | [`trends.md`](references/trends.md)（[gpts 基线判读](references/trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)），`scripts/gt.py` | 结论带基线与测量口径 |
| 「运行趋势监控」「扫描种子 Rising」「美日韩趋势追踪」 | [`trends-system.md`](references/trends-system.md) | 三区扫描、去重、健康台账已更新 |
| 「这个词在 AI 里有多大需求」「候选会不会被 ChatGPT 推荐」「竞品为什么被 AI 推荐」、ChatGPT 问法链路 | 词级编排 [`entry.md`](references/playbooks/entry.md)；采样与三清单只按 [`seo-geo.md`](references/seo-geo.md) 步骤 2–3；面板数据 [`provider-capabilities.md`](references/provider-capabilities.md)「三·五」 | 入口卡②有三清单与原始证据指针 |
| 「App 有没有需求」「找 iOS/iPad/macOS 产品」 | [`research.md` App 分支](references/playbooks/research.md#app-市场验证分支) → [段 2](references/lifecycle/stage-2-positioning.md) 2.2 | 网页指标标 N/A |
| 「谁在赚钱」「反查这个站」「帖子说月入 X 是真的吗」 | `research.md` P4 + [`validation-chain.md`](references/demand-sources/validation-chain.md) | 收入信号有可复核证据 |
| 「筛这批 AITDK 报告」「只看竞品异常」 | [`seo-box.md`](references/seo-box.md#aitdk-研究报告离线分流)：`aitdk-triage.mjs` 离线分流 | — |
| 「有什么游戏站能做」「小游戏机会采集 / 决策」 | [`game-sites.md`](references/game-sites.md) | — |
| 「做不做」「做哪个语种」「要不要多语言」「做成工具还是内容站」 | [`stage-2-positioning.md`](references/lifecycle/stage-2-positioning.md)；裁决只见 `entry.md` | `checklists.md` 段 2 |

### 段 3–4：建站、内容、上线前体检

| 用户会说 | 入口 | 做到什么算完 |
|---|---|---|
| 「我们做个网站吧」「帮我搭起来」、建站、做功能、写 UI、「按 rankup 规范来」 | 先过段 2 立项（没有词树回段 1），再 [`stage-3-build.md`](references/lifecycle/stage-3-build.md) + [`cloudflare-stack.md`](references/cloudflare-stack.md)。用用户指定模板，未指定用默认 shadcn 命令；UI 来自组件库，不手写基础控件；多功能工具站导航先读[侧栏统一规范](references/design-references.md#多功能工具站侧栏统一规范)；当天过完 Day-1 清单；核[建设中红线](references/discipline.md#二十一禁止建设中内容与功能区域) | `checklists.md` 段 3 |
| 「做个好看的页面」「Hero 怎么设计」「找个组件参考」、任何整站设计或改版 | **走 `/design` 并逐字带上获奖标准 prompt**（全文在 `stage-3-build.md` 硬规则「设计一律走 `/design`」），再用 [`design-references.md`](references/design-references.md) 选 2–3 个案例后实现 | — |
| 「做网站时需要 AI 视频/图片生成」「接 Kie」「Kie 音频可不可以用」 | [Kie 可选分支](references/integrations/kie.md) → [模型快照](references/integrations/kie-models.md)、[登记](references/registry.md)。按能力选供应商，Kie 不是必选 | — |
| 写页面内容、写文章、写 blog、「写这个模型页」、模型对比、产品对比、补参考视频、封面图、「写一下这页的文案」 | 站内英文页面内容一律走 [`blog`](../blog/SKILL.md)，不自己编内容；中文稿走 `/write`；内容形状按 `/ai-seo`（[`skill-ecosystem.md`](references/skill-ecosystem.md)） | sources、成文、review、评判、回读证据齐全 |
| 做内页、「把这个词做成页面」「关键词没问题了，做成内页」 | [`stage-4-prelaunch.md`「新增内页随手清单」](references/lifecycle/stage-4-prelaunch.md#新增内页--新模板的随手清单)；页面映射按[段 2 §2.3](references/lifecycle/stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)；目标词登记到 `keywords.md`；核建设中红线 | `checks.md` 记 ✅ 与证据 |
| 「能不能上线」「看一下 SEO / GEO 有没有问题」「TDK」「密度」 | `checklists.md` 段 4 + [`stage-4-prelaunch.md`](references/lifecycle/stage-4-prelaunch.md) + [`seo-box.md`](references/seo-box.md)。全套体检（AITDK、PageSpeed、图标专项、占位专项），重跑不采信上一轮；第三方复核加载官方 `gefei-page`（[`seo-webcafe.md`](references/seo-webcafe.md)） | 段 4 闸门全绿，或写明改不动的理由 |
| 「谷歌质量」「HCU」「E-E-A-T」「AI 内容会不会被打」「内容 review」「垃圾内容政策」 | [`seo-helpful-content.md`](references/seo-helpful-content.md)，`scripts/hcu-audit.mjs`；区分官方口径与业内推断 | 对应自检表通过且无红线 |
| 「怎么被 AI 引用」「llms.txt」「对 AI 代理友好吗」 | [`seo-ai-search.md`](references/seo-ai-search.md)、[`seo-agentic-scan.md`](references/seo-agentic-scan.md)；推荐位做法见 `seo-geo.md` | — |
| 「站慢不慢」「Core Web Vitals」 | `scripts/pagespeed.mjs collect --strategy both`，判读 `seo-box.md` 一 | — |
| 「生成 logo / 配图 / og 图」「做一整套网站图标」 | `/imagegen` 真实生成；图标集 `scripts/make-favicons.mjs --src <logo.png> --out <public目录>` | 图标专项通过 |

### 段 5–7：上线、外链、变现与监控

| 用户会说 | 入口 | 做到什么算完 |
|---|---|---|
| 「数据平台都接了吗」「GSC 接了没」「提交 sitemap」「怎么一直不收录」、接入 | 先 `node scripts/site-onboard.mjs --domain <域名> --repo <仓库> --check` 再执行；[`stage-5-launch.md`](references/lifecycle/stage-5-launch.md)、[`search-platforms.md`](references/search-platforms.md)、[`analytics-platforms.md`](references/analytics-platforms.md)。接入一律线上实测 | `.rankup/integrations.md` 逐行有证据与日期 |
| 「这个域名能不能用」「域名黑历史」 | [段 5](references/lifecycle/stage-5-launch.md) 黑历史闸门 + 官方 `gefei-domain` | — |
| 「域名买完了」「帮我绑域名」 | [`domain-email.md`](references/cloudflare/domain-email.md) §8.5 全 API 绑定 → [`cloudflare-stack.md`](references/cloudflare-stack.md) §8.8 基础安全 → `domain-email.md` §8.6 邮箱 → 上线验收；部署见 [`cloudflare/deploy.md`](references/cloudflare/deploy.md) | — |
| 「把 Ahrefs 的检验结果都修了」 | `scripts/ahrefs-site-audit.mjs` 取清单 → `scripts/ahrefs-issues-recheck.mjs` 线上复核 → 修完段 4 全套重跑 | — |
| 「帮我搞点外链」「竞品外链哪来的」「发个 Product Hunt」 | `backlink` Skill + [`stage-6-backlinks.md`](references/lifecycle/stage-6-backlinks.md)。Rankup 只判时机与数量；提交前把候选清单给用户圈定，技术可提交不等于本轮已授权投递。判据 [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五；发布平台 [`product-launch.md`](references/product-launch.md) | 台账有 submitted → public → indexed 证据 |
| 「已上线站 ChatGPT 会不会推荐我们」「为什么不推荐」「推荐位整改」「GEO 闭环」「复审」 | [`seo-geo-recommendation-loop.md`](references/seo-geo-recommendation-loop.md)：固定四问 → 建议甄别 → 整改发布 → 原聊天发链接再复审；采样规则只指 `seo-geo.md` | — |
| 「没人付费」「定价怎么定」「定价页怎么排」「渠道」「接 PayPal / Anyway」「AdSense 被拒」、变现、支付 | [`monetization.md`](references/monetization.md)、[`stage-7-monetize.md`](references/lifecycle/stage-7-monetize.md)、[`payments-anyway.md`](references/payments-anyway.md)、[`conversion.md`](references/experiences/conversion.md)；角度用 `/marketing-psychology`、`/marketing-ideas`。按分发方式选主通道与备份，目标环境端到端验证 | 验证记录进 `.rankup/integrations.md` |
| 「流量掉了」「排名没了」「是不是被 K 了」 | [`webcafe-experiences-2.md`](references/experiences/webcafe-experiences-2.md) 十七～十九 | — |
| 「流量涨了」「这两天为什么涨」 | 先读项目 `.rankup/INDEX.md` 与 `decisions.md`，结合线上页面和代码核对已下线功能、重定向及实际能力；再按 GSC 日期/页面/查询与分析来源拆增量。URL 迁移按 [`seo-experiences-2026-07-late.md`](references/seo-experiences-2026-07-late.md)「URL 迁移期的页面报表必须把旧 URL 与新 canonical 合并看」判读；未显示查询与未定稿日期单列未知 | — |

### 记忆、经验与取数

| 用户会说 | 入口 |
|---|---|
| 「优化记忆」「记忆太大」「压缩 memory」「清理记忆」 | [`agent-memory.md`](references/agent-memory.md)：项目与顶层 memory、全局规则精简，经验搬去 Skill、注释或文档 |
| 维护 Skill 本身：改 rankup 源码，或「把这个经验写进 rankup」 | [`maintenance.md`「五」](references/maintenance.md#五维护-skill-源码rankup-本身)、[`evolution.md`](references/evolution.md)。全量扫描后改；拆移文档用 `scripts/maintain/split-doc.mjs`；`scripts/maintain/doc-lint.mjs` 断链为 0；`node scripts/validate-rankup.mjs` 与相关测试通过；按规则升版本 |
| 「群里怎么说的」「哥飞说过什么」 | 官方 `gefei` Skill 知识库工作流；公开论坛 [`webcafe-forum.md`](references/webcafe-forum.md) |
| 「抓一下后台数据」「Semrush 能查这个吗」 | 哥飞工具先加载官方 `gefei`；其他面板看 [`provider-capabilities.md`](references/provider-capabilities.md)，登录态批量取数 [`integrations/browser-data.md`](references/integrations/browser-data.md) |
| 说的事这里没有，或点名的兄弟 Skill 本机没装 | [`capability-map.md`](references/capability-map.md)（全量能力底账）→ [`skill-ecosystem.md`](references/skill-ecosystem.md) → [`integrations.md`](references/integrations.md) 用 `find-skills` 搜索并安装；不现写等价实现 |

## 七段生命周期

每段的硬规则全文（含「为什么」）、步骤 check 与操作在各段文件；各段判读入口与常用脚本见 [`lifecycle.md`「速查」](references/lifecycle.md#各段入口与常用脚本速查)。**完成验收只在 [`checklists.md`](references/checklists.md)，关键词与立项裁决只在 [`entry.md`](references/playbooks/entry.md)。**

| 段 | 全文 | 进段前要知道的 |
|---|---|---|
| 1 调研 | [stage-1](references/lifecycle/stage-1-research.md) | 顺序与两路判读只按入口环节；GT 测量只按 gpts 基线判读；ChatGPT 问法链路只按 `seo-geo.md` |
| 2 立项与定位 | [stage-2](references/lifecycle/stage-2-positioning.md) | 主词出现后先读 `entry.md`；市场选择、产品形态及问法簇到页面的移交在本段 |
| 3 建站与开发 | [stage-3](references/lifecycle/stage-3-build.md) | shadcn、TanStack、Cloudflare 与段 4–6 的网页规则只约束 Web 面；macOS 按 `build-macos-apps` 专项 Skill，iOS/iPad 按对应原生工具，商店分发读 `monetization.md` 五，只有 App 时网页项标 N/A。**品牌图标在开发当天做齐**。新站内容页一律构建时预渲染成静态资产，Worker 只管 API 与必须动态的页面，每页都 SSR 需写明原因（[静态优先](references/cloudflare-stack.md#20-默认静态优先)）。建站、上线前与每次 review 必查 [Cloudflare 循环消耗与账单熔断](references/cloudflare-stack.md#89-循环消耗与账单熔断红线)：不能证明有界的付费后台触发不得启用，预算告警不当消费硬顶 |
| 4 上线前 SEO/GEO | [stage-4](references/lifecycle/stage-4-prelaunch.md) | 每次改动后按段 4 全套验收重跑，因为 TDK、布局与性能会相互影响。**图标专项未通过不许上线**。上线前与发布后复核入口：`checklists.md` D1 / D4 / D12 / D13 / P3（索引水合、Schema 语义、网格与键盘、SSR 可达性、分析去重与真实上报） |
| 5 上线与接入 | [stage-5](references/lifecycle/stage-5-launch.md) | 以真实线上证据收口，不用勾选代替生效状态 |
| 6 外链 | [stage-6](references/lifecycle/stage-6-backlinks.md) | 执行归 `backlink` Skill；范围圈定与证据台账在本段 |
| 7 变现与监控 | [stage-7](references/lifecycle/stage-7-monetize.md) | 按目标分发方式和真实业务证据判断；监控读数触发回段 1 |

## 主线：维护 checklist，使用 checklist

每段都有一套 checklist，不过 check 不许进下一段；每轮迭代新做的东西，把相关 check 重新过一遍。

- **闸门 check** 在 `checklists.md`，判「这段能不能算完」；**步骤 check** 在各段文件，判「这一步做对了没有」。
- 状态记在项目 `.rankup/checks.md`：✅ + 证据位置 + 日期；做不了标 ⏸ 写清卡在哪；开新一轮把标「每轮」的打回 ⬜。
- 判断由你做，不找脚本代劳：`scripts/review.mjs` 只给文件层面的缺口。
- 判据只在 `checklists.md`，操作只在各自文档；缺 check 先补进 `checklists.md` 再去做。

## 红线速查

执行、取数、完成标准与事故判据统一查 [`discipline.md`](references/discipline.md)；AI 探针的通道与证据边界查 [`seo-geo.md`](references/seo-geo.md)。

- **先查脚本清单，不现写等价实现或手点界面，脚本坏了修脚本**（`discipline.md` 二）。可复用操作必须落成脚本：确定会重复的链路在授权范围内本轮参数化并跑通，只读或禁止改脚本的任务只列候选；触发条件、落点与验收见 [`maintenance.md`「五」第 1 条](references/maintenance.md#五维护-skill-源码rankup-本身)。
- **浏览器通道与公开页面例外统一按纪律五执行**，以复用登录态与可复现会话；见[纪律五](references/discipline.md#五浏览器与取数规则在-opencli-skill这里只留判据)。
- **所有 AI 爬虫必须放行**并逐 UA 实测，使公开内容具备被发现与读取的资格；见[基础安全](references/cloudflare-stack.md)与 `checklists.md` 段 5。
- **部署前必须先把代码合并到对应环境的分支并推送，再经项目现有流水线部署**，防止别人发布时冲掉我们、或我们覆盖别人；生产线改动另须在目标线验证、先发预发、发布后自测，测试线通过不代表生产线通过；见[纪律二十二](references/discipline.md#二十二部署红线先合入对应环境分支并推送再部署)。
- **令牌**：第三方工具令牌只有一份，放 Skill 根目录 `.env`，环境变量优先（`discipline.md` 十一）。严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥、token、密码、私钥、webhook secret、支付敏感数据或个人敏感信息。
- **本 Skill 必须保持项目中立与机器中立**：不带私有出处或身份（站点名、域名、流量数字、account/property ID、本机路径与代理、私有凭据位置）；公开供应商地址与必要的公开来源可保留。回流经验只带走剥离站点后仍成立的规则，由 `scripts/validate-rankup.mjs` 断言。
- 不记录未验证猜测；旧经验被证伪时修订原条目，不并列保留冲突结论。

## 经验库：规划与迭代之前先翻一遍

[`references/experiences/`](references/experiences/INDEX.md) 回答「该怎么判断、别人踩过什么坑」。经验层不带项目信息；每条有出处与证据等级（【实测】/【经验】/【猜测】，猜测不当结论）；采纳前先问「我们的前提一样吗」。

| 什么时候 | 读 |
|---|---|
| 挖需求 | [`demand-discovery.md`](references/experiences/demand-discovery.md)；分册：用户原话与信号源 [`demand-discovery-sources.md`](references/experiences/demand-discovery-sources.md)、值不值得做（历史判据，现行裁决回 `entry.md`）[`demand-judgment.md`](references/experiences/demand-judgment.md) |
| 规划、0→1 节奏 | [`zero-to-one.md`](references/experiences/zero-to-one.md) |
| 上线后改什么、转化 | [`conversion.md`](references/experiences/conversion.md) |
| 技术 SEO、站群、多语言、索引 | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md)、[`webcafe-experiences-2.md`](references/experiences/webcafe-experiences-2.md)、[`webcafe-topics.md`](references/experiences/webcafe-topics.md) |
| 查带日期的 SEO 实测判断 | [`seo-experiences.md`](references/seo-experiences.md)；归档 [`seo-experiences-2026-07.md`](references/seo-experiences-2026-07.md)、[`seo-experiences-2026-07-late.md`](references/seo-experiences-2026-07-late.md) |

## 哥飞官方 Skill

查关键词、竞品、域名、页面、哥飞经验，按 [`seo-webcafe.md`](references/seo-webcafe.md) 检查并加载**哥飞官方 Skill 包**；未安装则按[官方页面](https://seo.web.cafe/api/)安装，再主动读取官方 `gefei/SKILL.md` 与对应专用 `SKILL.md`。专用 Skill 设了 `disable-model-invocation: true`，不会自动触发，必须主动加载。工具怎么调听官方，市场证据与闸门仍由 Rankup 判断。单一查询主 Agent 直接调；多个独立问题才分给子 Agent，收回后统一判读。

## 其余参考：上面没直接点到的文件

上面各表已给出主入口；下面这些是它们的分册与专题，同样从这里一跳可达，按「何时读」取用。

| 文件 | 何时读 |
|---|---|
| [`commands.md`](references/commands.md) | init / review 全文、三个命令的分工、安装更新与版本检查行为、跨项目资产登记表（`scripts/registry.mjs`） |
| [`lifecycle.md`](references/lifecycle.md) | 七段总述、各段常用脚本速查、旧阶段号映射、每段开头的对账动作 |
| [`playbooks/INDEX.md`](references/playbooks/INDEX.md) | 不确定选哪条预制流水线，或要写新 playbook |
| [`research-checklist.md`](references/research-checklist.md) | 调研交付前核对证据覆盖（哪些跑了、哪些没跑） |
| [`playbooks/selection/gates.md`](references/playbooks/selection/gates.md)、[`generator.md`](references/playbooks/selection/generator.md) | 方向候选的经营观察字段与历史案例；候选采集工具（领先指标法等）及其边界 |
| [`demand-sources/competitors-and-roots.md`](references/demand-sources/competitors-and-roots.md) | 看竞品往哪下注、站群与子域名监控、从词根扩词、反查竞品词库 |
| [`demand-sources/revenue-and-ads.md`](references/demand-sources/revenue-and-ads.md) | 找谁已经收到钱、谁在花钱买流量（支付网关反查、广告透明度） |
| [`demand-sources/users-and-launches.md`](references/demand-sources/users-and-launches.md) | 差评矿、外包需求、新产品与新词平台、用户原话 |
| [`seo-growth.md`](references/seo-growth.md) | SEO 专题索引：按任务挑下面几篇 |
| [`seo-serp.md`](references/seo-serp.md) | 逐问法读 Google 盘面、判难度、SERP 快照复测 |
| [`seo-ssr.md`](references/seo-ssr.md) | 写页面、算词密度前：无关区块不进 SSR；AI 爬虫 UA 一致性（`scripts/ua-parity.mjs`） |
| [`seo-opportunity.md`](references/seo-opportunity.md) | 收集候选池与规划冷启动的背景框架（裁决回 `entry.md`） |
| [`seo-data-channels.md`](references/seo-data-channels.md) | 接新项目时选数据通道 |
| [`seo-workflow.md`](references/seo-workflow.md) | 每轮 SEO 优化的工作流与经验沉淀协议 |
| [`provider-capabilities/semrush.md`](references/provider-capabilities/semrush.md)、[`similarweb.md`](references/provider-capabilities/similarweb.md) | 要某个面板页面的能力明细时 |
| [`provider-script-gaps.md`](references/provider-script-gaps.md) | 判断要不要给某张面板报表写脚本 |
| [`provider-capabilities/dom-probe-audit-2026-08-29.md`](references/provider-capabilities/dom-probe-audit-2026-08-29.md) | 只在追溯 2026-08-29 之前的 DOM 探针分类为何作废时 |
| [`discipline/browser-rendering.md`](references/discipline/browser-rendering.md) | 驱动浏览器等第三方页面渲染卡住时的三层判断 |
| [`templates/kie/README.md`](templates/kie/README.md) | 复制 Kie Worker 接入模板时 |

## 安装与版本

```bash
npx skills add yan-labs/yan-skills --skill rankup -g -y   # 全局安装
npx skills update rankup -g -y                            # 全局更新
```

先装 `opencli`；Web 项目另装 Cloudflare 工具链。发布版本记录在 `skill.json`，项目侧状态在 `.rankup/skill-state.json`。安装细节、更新被拒的原因与恢复办法见 [commands.md「安装与版本」](references/commands.md#安装与版本)。
