# 哥飞工具箱：使用官方 Skill

Rankup 只负责判断**什么时候需要哥飞数据、结果如何进入本项目决策**。工具清单、参数、价格和调用顺序，以[哥飞官方 API 与 Skill 页面](https://seo.web.cafe/api/)及已安装的官方 `SKILL.md` 为准。Rankup 不保存其 Skill、CLI 或接口实现。

## 安装与加载

需要选词、拆竞品、查域名、审页面或查哥飞经验时，先检查当前 Agent 的 Skill 目录是否已有 `gefei/SKILL.md`。未安装就从[官方 Skill 包](https://seo.web.cafe/api/skills/gefei-skills.zip)安装到当前客户端支持的 Skills 目录；不要从 Rankup 仓库复制旧版。安装后读取官方总入口 `gefei/SKILL.md`，再按任务读取对应的专用 `SKILL.md` 并执行。**四个专用 Skill 都设置了 `disable-model-invocation: true`，仅加载 Rankup 不会让它们自动触发；必须由 Rankup 主动读取文件，或由用户手动调用对应的 `/gefei-*` 命令。**

| 任务 | 加载的官方 Skill |
|---|---|
| 找关键词、扩词、核实量和难度 | `gefei-keywords` |
| 拆竞品流量、排名词和页面 | `gefei-competitor` |
| 域名注册、历史、估值尽调 | `gefei-domain` |
| 页面 SEO 体检和优化 | `gefei-page` |
| 查经验规则、遇到不知道如何处理的问题、其他工具需求 | `gefei` 总入口 |

官方包自带 CLI；若当前客户端已接入哥飞 MCP，按官方 Skill 的说明使用 MCP。**不要再调用站内哥飞 AI 来代做调研。** `gefei` 总入口会按问题选 `load_guide`、`knowledge_ask`、原始数据或组装接口；工具的实际名称与参数从官方 Skill 和实时目录读取，不以 Rankup 的旧清单为准。

官方 CLI 可用 `node <已安装的gefei目录>/scripts/webcafe.mjs tools` 查看实时接口与价格，`me` 查看可用积分，`usage --api` 对账。令牌按官方 Skill 的说明保存在本机受控配置或进程环境，绝不进入 Rankup 源码、项目报告、命令参数或对话。开放 API 只扣积分余额，网站每日赠送额度不适用；调用失败、余额不足或限速都不能记为「数据为零」。

## 谁来调用

- 只查一个词、一条经验或一个页面：主 Agent 读取官方 Skill 后直接调用。
- 词→站→词等前后依赖的串行研究：主 Agent 可以连续完成。
- 关键词、竞品、经验规则等多个独立问题需要同时研究：主 Agent 按问题分派子 Agent。每个子 Agent 自己读取所需官方 Skill、调用工具并交回原始来源、市场、日期、请求号、扣费和结论；主 Agent 汇总核验并写入项目记录。共用积分和浏览器会话的步骤要避免重复或冲突。

## Rankup 如何使用结果

1. 关键词研究按 [entry.md](playbooks/entry.md) 编排；上线体检按 [checklists.md](checklists.md) 段 4。明确问题和目标国家后加载对应官方 Skill，不为模糊问题把工具全跑一遍。
2. 让官方 Skill 按其工作流取数。能批量就批量；已有同口径数据不重复付费。每条结果保留工具名、市场、日期、快照/缓存口径、原始请求号与实际扣费。
3. 数据口径分开记：哥飞版 KD 与 Semrush KD、整站访问与估算自然流量各标来源；`null`、未收录、429、上游失败都不等于 0。全球需求必须有全球口径，默认美国值不能冒充全球。
4. 问法生成、ChatGPT 自然采样、追问与三清单只见 [seo-geo.md](seo-geo.md)；逐问法 Google 核验只见 [seo-serp.md](seo-serp.md#逐问法-google-读法)。工具意图标签与建议只作待核实材料，关键词裁决与 KD 的处理只见 [entry.md「选词判据：只看两个」](playbooks/entry.md#选词判据只看两个)。

若官方 Skill 未安装或令牌无效，只标记该依赖步骤待完成；仍可推进不依赖它的本地与公开来源检查。不要改用旧网页登录端点或站内 AI 来伪装成同一份证据。

## 官方研究工具口径

本表登记当前文档使用的工具身份；实际名称、参数与价格仍以官方 Skill 和实时目录为准。

| 用途 | 工具与调用口径 | 产物去向 / 权威指针 |
|---|---|---|
| 难度读数与竞争页画像 | `keyword_difficulty`；保存国家与原始读数 | 仅数据补充；裁决见 [entry.md](playbooks/entry.md#选词判据只看两个) |
| Google 盘面 | `serp` 取原始结果，`serp_review` 取点评，两者分列 | 对应问法的 SERP 卡；判读见 [seo-serp.md](seo-serp.md#逐问法-google-读法) |
| 趋势曲线付费备选 | `google_trends`：共享缓存，最多 5 词；`--range 7d/30d/90d/12m/5y`、`--geo`，单词可 `--related true` | 不替代 `gt.py`；默认 gpts 与测量完整口径见 [trends.md](trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源) |
| 批量趋势候选 | `trends_rising`：`--roots` 最多 20 或 `--preset default/ai`，`--range 7d/30d/90d`、`--geo`、`--max_fetch` 最多 8 | 上升相关查询只生成候选；后续编排见 [P2](playbooks/research/p2-keyword-root.md) |
| 意图标签 | `search_intent`：`--keywords` 每批最多 200 词、`--hl` | 信息/导航/商业/交易与次意图只作补充，不替代逐问法 Google 核验 |
| 扩词 / 需求翻译 / 起名核域名 | `keyword_ideas`、`translate_demand`、`brand_naming`、`domain_availability` | 回填候选与词池；探索动作见 [P2](playbooks/research/p2-keyword-root.md) |

各调用保留原始结果、市场、日期、请求号与 `credits.charged`；不把工具缓存当当轮实时实测。

## 本地脚本与保留的旧能力（2026-09-30）

`stripe-referring.mjs` 的前20名查询、月份汇总及单站历史已迁到官方 `stripe_checkout_referrals`，每业务调用 1 积分；超过20名或 `--new-only` 保留旧全榜，官方目录暂无等价能力（2026-09-30）。旧全榜原记录不计每日配额，本轮探测预算内未重验可用性；`payment-referrers.mjs serp` 改用官方 `serp`，每查询 2 积分，默认 gl=us/hl=en；`revenue-site-audit.mjs` 的 KD 直接调用官方 `keyword_difficulty`，国家取 `--db`。`domain-profile.mjs` 继续使用官方 `domain_overview`。这些脚本不读官方令牌或配置。

已知坑：设了 HTTP(S) 环境代理的机器上，官方 CLI 的 Node 需要 `NODE_USE_ENV_PROXY=1`，上述 Rankup 脚本已自动处理（保留显式设置）。手动直接运行官方 CLI 遇到 TLS 建连失败时，先检查这一点。

旧站内 SEO Agent 入口已从 Rankup 移除。review 用官方 `gefei-page` 的数据和建议，由当前 Agent 判读；查哥飞说法用 `knowledge_ask`，不再委托站内 AI 代做审查。

`seo-webcafe.mjs` 不再是统一网络工具箱，不保留已迁命令的兼容壳。它只提供：

| 用途 | 保留命令 | 官方等价与旧口径 |
|---|---|---|
| 本地计算 | `kgr` / `string` / `money` / `email`，支持 `--batch` | 零网络、零积分；兼容公式的当前边界见下文「本地命令数值判读指引」 |
| 输入判型 | `mineSeed --input <词或网址>` | 官方目录暂无等价能力；本日旧接口实跑 HTTP 200，返回 type/value；旧记录不计每日配额 |
| 单页评分/需求信号 | `serpPage` / `translatePage` / `minePage` | 官方 `serp_review` 是搜索结果盘面，`onpage_audit` 是页面体检，不能据名称宣称这些独有字段覆盖；暂无等价能力。translatePage/minePage 旧记录不计每日配额；serpPage 扣费未显示 |
| 已取数据聚合/报告 | `translateAggregate` / `mineReport` | 官方 `translate_demand` 不提供原数组聚合或取回旧报告的字段合同；暂无等价能力；旧记录不计每日配额。page 可用保留命令，search/domain 数据另从官方取，格式需人工核对 |
| 起名意图/撞名/历史会话 | `domainIntent` / `domainCollision` / `domainSessions` | 官方 `brand_naming` / `domain_review` 没有承诺独立意图、单名撞名或旧会话读取的同一输出；暂无等价能力。Sessions 旧记录不计每日配额；其余实际扣费未显示 |
| 旧网站额度读数 | `translateMe` | 只读网站每日配额，不是官方 API 余额，不用于规划官方调用 |

依据是 2026-09-30 的官方实时目录与本轮试用，不是凭旧文档推测供应商完全没有该能力。保留脚本的 mineSeed 已验证可用；其他独有端点在本轮探测上限内没有逐项实跑，不能把共享脚本通过说成每个端点均已验证。失败时显示失败，不回退到已移除的旧取数命令。

论坛原文、悬赏投票榜与完整群聊搜索继续用 [`webcafe-forum.md`](webcafe-forum.md) 的保留入口；官方知识库只返回相关节选，不能冒充论坛全集或全部群友原文。

## 本地命令数值判读指引

兼容旧入口；关键词裁决只见 [entry.md](playbooks/entry.md#选词判据只看两个)。当前 `kgr` 仍返回 KGR、EKGR、KDROI，`money` 仍按 KD 推导引荐域、投入与 ROI；这些兼容公式不提供当前研究的排序、通过或出局结论，也不是已验证的获客成本。脚本字段与文案调整归 B16，本批未改实现。

### `string` 的判读：三套 TDK 长度口径，别混着引

| 工具 | 当前文档 / 源码口径 | 判读入口 |
|---|---|---|
| `seo-audit.mjs` | title 10–60 / description 50–160，字符数 | 分级只见 [seo-audit-reading.md「seo-audit 判读指引」](seo-audit-reading.md#seo-audit-判读指引分级表从脚本迁来) |
| `seo-webcafe.mjs string` | title 30–60 / description 70–160；ASCII 记 1，其他字符记 2，近似展示宽度 | 本地长度观察，不是实际像素测量 |
| Ahrefs | 既有文档记录 description 110–160；随报告口径与抓取日期核对 | 档位与报告边界见 [seo-box.md「Ahrefs AWT 免费档」](seo-box.md#ahrefs-awt-免费档边界在哪能拿什么) |

报告说「超长」时点名工具与计长口径；不同尺的结果不能混引成同一项失败。
