# 小游戏站：流量与变现执行链

用户提到「小游戏站」「游戏新词」「监控游戏站」「游戏 iframe」时，按本文件执行；建站、上线、
索引和分析平台接入继续走 [`lifecycle.md`](lifecycle.md)。

**Rankup 是唯一任务入口，负责发现 → 探索 → 研究 → 判断游戏网站能不能做 → 观察复查。**
本文件管理链路与判断方法；`game-opportunity` 是内部采集、取数和排版模块，命令与字段契约见
[`game-opportunity`](../../game-opportunity/SKILL.md)，不让定时器另起一套业务规则。

定时器只给任务方向（「小游戏机会每日采集」或「小游戏机会每日决策」）、项目位置，并要求先读
Rankup。项目 `.rankup/tasks/` 只保存时区、时间、名额分配和数据位置；通用执行步骤与判据以本文件
及其引用为准。用户明确的目标优先：广告流量型游戏站不套用订阅选品的「非 SaaS 即否决」，付费工具
则按实际使用频率和付费证据判断，不能把两种生意混为一谈。

### 每日采集

1. 读项目 INDEX、rejected、观察池及最近报告，命中否决项只在复活条件满足后重开。按项目本地日期
   显式传 `--date` 和 `--project-root`，调用内部 `collect-checklist`，保留逐源 manifest 和完整新增池。
2. 在 sitemap/发布源之外，每轮尝试三条路线，复用有效证据、只补变化：从种子词搜真实 SERP，找
   少量竞品反查近期自然流量词与增长页面（最多扩两层）；从具体游戏社区的原始提问找网页游玩、
   地图、计算器、配装等需求；结合 Trends Games rising、网页/YouTube Search 与稳定老玩法长尾。
   社区按 Agent Reach 的当前可用后端取数，登录态按 OpenCLI，配额站串行持锁。失败不算无需求。
3. 完整池轻筛，不把日报展示上限当候选上限。DLC、音轨、素材包、重复页单列噪声；数字 slug 补标题，
   无法识别就标待识别。记录平台首次收录和游戏实际发布时间，按作者/文案/落地链接合并推广 campaign。
4. 分类为直接玩 `playable`、衍生工具 `companion`、自制小游戏 `original`；保存玩家问题、原文/URL、
   时间、独立发布者与互动快照。补充线索落 `YYYY-MM-DD-opportunity-leads.json`：
   `{date, generatedAt, sources:[], candidates:[]}`；候选保留 `entityId/names/urls/sourceLinks/firstSeen/
   gameReleasedAt/opportunityType/playerNeed/evidence/status/nextAction`。保留原始 new-games，不能覆盖来源。
5. 所有输入写完后，最后写 `YYYY-MM-DD-collect-handoff.json`：日期、生成时间、ready/partial、输入路径、
   总数/噪声/有效/待识别数、逐源失败与待补步骤。交接后本轮停止改这些输入。C01–C10 与补充来源分别
   验收；修复后只重跑受影响项，持续不可用留 partial，不为全绿反复消耗配额。

### 每日决策

1. 核对当天交接日期、生成时间、输入路径及采集验收。上游未就绪只做独立观察工作，不能用昨日 latest
   冒充今日输入或另跑全量采集。partial 只使用已完整落盘的来源，并公开覆盖缺口。
2. 读完整 new-games、补充线索与观察池。补充候选按实体合并进当天 evaluation（保留已有字段，未经判读
   不填 action）。社区帖子先提炼成已核实的游戏/工具实体：社区来源放 sourceLinks/evidence，urls 放实体
   落地页，pageType/platforms 按实体实际类型和宿主填写（工具页可用 companion-tool），不沿用社交帖子或
   game-adjacent 标签；未取得实体页的保留 leads 待补。调用免费 plan 查看完整 pool，写 demand-selection，
   再重跑 plan 确认名单和真实查询词后才查付费数据；入选 ID 未出现在 plan 中必须调查过滤原因，不能宣称已深查。
   每日上限遵循内部模块，具体新机会/到期复查/老词或衍生工具的名额分配由项目配置；有合格新机会必须
   保留名额，旧观察项不能长期占满。合格指真实实体与可追溯外部需求线索，不要求面板已有量。
3. 在配额前先判断玩家任务、使用频率、实现/维护与获客方式是否可行。直接玩核对实际运行、移动操作、重开
   和使用许可；衍生工具核对数据、算法/内容增量与更新成本，无 iframe 不等于不能做工具；自制玩法估算最小
   测试成本。不具备相应证据时保留未知，HTTP 200 不能当实玩通过。
4. 按全球精确词及主要国家 → 当地量/KD/CPC → 真实目标市场 Google/Bing SERP → 趋势和独立需求验证。
   新词看 24h/7d 升温与搜索萌芽，老词看稳定需求、长尾与体验缺口；网页和 YouTube Search 分开。
   Trends 锚点当轮校准，不套历史每日曝光猜测；KD 冲突必须复查，不自动判机会。两个独立信号互证后才
   进入优先测试，官方同轮推广不能算多份独立需求。SERP 无结果、错误地区和验证码都标未测。
5. 小词按可获取流量、同一目标国家变现与维护成本判断；未形成面板量的新词可进入 research 的测试候选。
   `develop` 仍需适用开发闸门，不能把研究建议当批准上线。广告归属、内购和工具收费分别核实；CPC 不是
   RPM，第三方 iframe 内收益不是站长收益。收入缺来源时写未知，不套帖子分成比例或保证起量。
6. evaluation 是 action 唯一入口，用 evaluate/render 生成原有日报，再写 opportunity-brief，最多给少量优先
   机会：玩家问题、词/国家、产品形态、当前证据、竞争缺口、最小版本/估时、分发、变现、缺口与停止条件。
   附 7/14 天验证：搜索展示/点击；游戏加载/开玩/重玩/回访；工具成功使用/重复使用。未埋点、样本不足保留
   缺口，不凭短期零数据判失败。全池总数、轻筛数、深查与未深查数必须可对账。
7. 每轮维护观察池所有 active 的轻查状态；首次发现后第 3/7/14/28 天到期复查，漏跑跨过节点也补。到期超额
   写 backlog，保留原 dueDate、延期原因和 nextAttempt；只有实际完成才能推进 lastDeepCheck。合格 research
   自动加入，watch 有可玩、独立传播、精确量或明确复查事项才加入；按实体去重。升级 develop、确认非游戏或
   重复、连续两次确定 404/410 且无替代入口，或最后里程碑实查后需求/传播/相应产品供给均无信号时移出。
   失败和未知不能当删除理由，衍生工具按数据供给判断。日报列新增、更新、移出、到期、延期与下次复查。
8. 最后 decision-checklist --check-only 核验。字段齐全不代表证据真实；旧 D08 对衍生工具不适用、或取证失败时
   保留未通过并说明适用验证，不能填假可玩状态。修复重跑相关检查，持续阻塞记录现场与下一步。本链路止于
   研究决策，实际买域名、开发发布和社区分发按用户后续授权及生命周期执行。

## 一、目标

小游戏站是一门流量生意：尽早发现正在增长的游戏词，快速接入可玩的游戏供给，上线搜索页面，
获取玩家流量，再用广告、游戏内付费分成和持续扩页提高收入。

执行优先级：新词速度 → iframe / 游戏供给 → SERP 空位 → 上线速度 → 玩家留存 → 广告收入。

Web.Cafe 的流量、收入、上线过程和失败复盘是本链路的主要实战依据。项目自己的 GSC、分析和
收入数据负责每轮裁决。

## 二、每天发现游戏新词

### 上新平台

```bash
node scripts/demand/game-newtitles.mjs --source steam --json --out .rankup/demand/games-steam.json
node scripts/demand/game-newtitles.mjs --source itch --json --out .rankup/demand/games-itch.json
node scripts/demand/game-newtitles.mjs --source poki --json --out .rankup/demand/games-poki.json
```

更多源与字段见 [`demand-sources.md`](demand-sources.md)「持续涌现新词的平台」。

### 竞品 sitemap

把项目自己的平台与 sitemap 清单保存在 `.rankup/demand/game-platforms.json`。每天批量保存快照，
把新出现的游戏内页汇总成候选报告：

```bash
node scripts/demand/game-platform-monitor.mjs
node scripts/demand/game-platform-monitor.mjs --language de,pl,ja,ar,ru
node scripts/demand/game-platform-monitor.mjs --market KZ,UA,DE,JP
```

`.rankup/` 保存本项目的平台名单、快照、报告与候选，整目录由 Git 忽略。第一次运行建立 baseline，
之后的报告直接给出新增内页。单站深挖继续使用：

```bash
node scripts/demand/sitemap-diff.mjs --domain example.com --slug-words
```

每个平台可以在私有清单里配置 `include`、`exclude`、`kind` 和 `timeout`：保留游戏详情路径，滤掉
标签、分类、博客等杂页，同时标明它属于可玩游戏、游戏资讯或游戏相关内容。候选页先用 HTTP 验证
状态和正文，再用 Jina Reader 提取内容；需要登录态或浏览器渲染时交给 OpenCLI。同一游戏的多语言
页面合并成一个实体，并分别记录「平台首次收录时间」与「游戏发布时间」。

项目新增的平台写入项目 `.rankup/research.md`，记录站点、sitemap、语言、市场和最近有效信号；
验证稳定后再加入通用清单。

### 搜索与社区

- Trends：记录 12 个月、30 天、7 天斜率，以及增长地区和 related rising。
- Google SERP：记录首页/内页比例、结果类型、页面新鲜度和前十引荐域。
- 24 小时雷达：按最新排序读取 itch 最近 7 天、GameJolt Hot、Poki/CrazyGames 新游位、
  Scratch/Cocrea、SteamDB New & Trending、GitHub、应用商店、Reddit、YouTube 和 X；提取游戏名、
  别名、玩法词、发布时间、互动量和可玩链接。
- Reddit、短视频和论坛：按作者、文案和落地链接合并 `campaign`，记录非官方发布者、平台数、互动、
  4 小时/24 小时/7 天发布速率；同一开发者跨社区发布按一次推广计算。
- 站点与频道清单：筛选最近仍在更新、持续发布网页游戏的来源。
- Similarweb：用最近 28 天的关键词、国家和流量去向验证社区信号；Semrush 继续给分国家量与 KD。
- 新词在首次发现后的第 3、7、14、28 天复查；搜索量尚未形成时使用社区增速、跨平台重复、可玩供给
  与 Trends 共同排序。
- 站内新增页负责发现。外部需求用独立 SERP、本地搜索量、Trends、竞品自然搜索词和非官方传播验证。
- 早期爆发初始线：24 小时 ≥3 位非官方发布者、≥2 类平台、发布速率达到前 7 天日均 3 倍，并取得
  ≥20 次互动或 ≥500 次观看；4 小时后仍增长再升级。连续运行 1–2 周后按成功样本校准这些数字。
- Autocomplete / Related Searches 出现 `play X online`、`X unblocked`、`X html5` 等长尾时，记录为
  搜索萌芽；候选再用月搜、KGR、EMD 与前十专业站占位收敛。

## 三、建立候选卡

| 字段 | 内容 |
|---|---|
| `name / aliases / slug` | 主词、拼写、多语言变体 |
| `entity_type / keyword_clusters` | 品牌词、品类词或泛词；同义词与承接意图分簇 |
| `first_seen / sources` | 首次发现时间和两个独立信号 |
| `trend` | 12 月、30 日、7 日趋势与地区 |
| `serp_shape` | 前十页面类型、新鲜度和品牌强度 |
| `volume / KD / CPC` | 已取得的数据与查询日期 |
| `metric_scope` | 全球、国家、28 天总量、7 天方向与数据来源 |
| `competition_review` | KD 口径、SERP 意图、弱位、新站与数据冲突 |
| `internal_traffic_risk` | 平台内推荐与独立外部需求是否已经分开 |
| `top10_ref_domains` | 前十页面的真实引荐域 |
| `playable_source / embed` | iframe 来源、加载、移动端、全屏、声音 |
| `ship_time` | 最小版本预计上线时间 |
| `difference` | 页面体验、速度、玩法或工具优势 |
| `recheck_date` | 下一次复查日期 |

快速上线信号：两个独立来源同时出现、Trends 斜率向上、SERP 出现独立站空位、游戏稳定运行、
最小版本赶得上流量窗口、目标地区具备广告收入空间。

KD 执行线：`<20` 可直接复核，`20–39` 是新站主战场，`40–49` 必须同时看到 SERP 弱位/新站、
集中意图和可形成的体验差异，`>=50` 不作为 DR≈0 新站主攻词。近 28 天总量与最近 7 天方向分开写；
“月度仍高、短期回落”不能写成“仍在上涨”。同义词分别展示，不简单相加。

## 四、接入游戏供给

供给来源包括公开 iframe、发行平台、自研游戏和开源游戏。

公开 iframe 在桌面端与移动端正常渲染、操作和全屏，即进入上线测试。每个游戏在项目
`.rankup/integrations.md` 记录：

- 来源页、iframe URL、首次发现时间和可用地区；
- 加载时间、移动端、全屏、声音和游戏内广告/付费；
- 健康检查 URL、最近检查时间和替代源；
- 外层广告空间与页面布局。

供给状态使用三个值：`active` 正常供给、`watch` 需要观察、`replace` 切换替代源。

## 五、快速上线单游戏页

最小版本包括：

1. 一个稳定 URL，首屏直接展示游戏和开始入口；
2. 清楚的加载状态、操作方式、全屏、音量、暂停和重新开始；
3. 游戏目标、控制方式、玩法技巧、常见问题和来源说明；
4. title、description、canonical、语言、OG 和适用的结构化数据；
5. 成绩、每日挑战、重玩或分享入口；
6. 隐私、条款、联系入口、广告说明和 404；
7. 移动端与真实域名冒烟测试。

扩张顺序：单游戏首页 → 同游戏玩法/模式/每日挑战/攻略工具 → 相邻游戏 → 已验证市场的多语言页。

AI 用于整理元数据、翻译草稿、生成代码和维护模板；玩家体验、玩法信息和页面差异来自真实游戏。

## 六、获取流量

1. 让搜索意图与页面体验匹配；
2. 在游戏社区和垂直创作者渠道分发；
3. 用成绩、挑战和分享页带来自传播；
4. 从相关站点、游戏目录和评论区建立早期链接；
5. 使用 `backlink` Skill 扩展相关外链并验收真实落地结果；
6. 对表现最好的国家和语言增加本地化页面。

## 七、广告变现

1. 预留清晰的广告位，保持游戏控制区完整；
2. 接入站点分析、GSC 和广告平台；
3. 配置根路径 `ads.txt`；
4. 按国家、设备、页面和渠道观察覆盖率、RPM 与流量质量；
5. 使用 Web.Cafe 案例里的 UV、RPM 和审核周期作为初始基准；
6. 把高收入地区、页面和游戏加入下一轮扩张队列。

## 八、自动监控

| 频率 | 信号 | 现有能力 | 动作 |
|---|---|---|---|
| 每日 | 新游戏与新玩法 | `game-newtitles.mjs` | 新候选进入验证队列 |
| 每 4 小时 | 24 小时发布与社区信号 | Agent Reach + OpenCLI | 写入雷达并合并同名来源 |
| 每日 | 多语种游戏平台新增内页 | `game-platform-monitor.mjs` | 汇总候选并合并同名信号 |
| 每日 | iframe 加载与开始入口 | 项目冒烟测试 | 标记 `active/watch/replace` |
| 每日 | PV、UV、开始率、局数、分享率、国家 | GA/Cloudflare/项目事件 | 找到增长页面与地区 |
| 每日 | 广告覆盖、RPM、流量质量 | 广告后台 | 调整渠道与广告位 |
| 每日 | 候选 Trends、KD、SERP、搜索量 | `gt.py` + Web.Cafe + Semrush | 生成可上线、优先研究、观察三组 |
| 第 3/7/14/28 天 | 新词复查 | Similarweb + Semrush + Trends | 从未观察到量转入量化筛选 |
| 每周 | 竞品流量渠道与关键词 | Similarweb/Semrush | 更新候选与路线图 |
| 每周 | 新增/丢失引荐域 | `backlink` Skill | 验收并扩展有效来源 |
| 每周 | sitemap、索引率、GSC 查询/页面 | GSC + `seo-audit.mjs` | 更新页面与内链 |
| 每月 | iframe 稳定性与收入集中度 | 供给台账 | 增加替代源与新游戏 |

调度使用项目现有 CI、cron 或自动化平台。结果写入 `.rankup/demand/`，登录后台的任务复用固定
浏览器会话，每个站点保持一个会话。

## 九、持续加码

每天筛选新候选；每周汇总已上线站点：

- 搜索：曝光、点击、查询覆盖、排名、索引率；
- 产品：开始率、加载成功率、每用户局数、重玩、分享、7 日回访；
- 质量：移动端体验、退出点、广告位置、iframe 稳定性；
- 商业：国家/设备 RPM、覆盖率、收入集中度、流量质量；
- 外部：趋势斜率、SERP 新进入者、iframe 供给。

裁决动作：

- **加码**：扩展增长游戏的玩法、工具、语言、外链和分享能力；
- **优化**：提升加载、移动端、开始率、重玩和广告布局；
- **换源**：把 `watch/replace` 游戏切到稳定 iframe；
- **转向**：把开发和外链资源投向下一批上升词。

每轮结果写入项目 `.rankup/iterations.md`，下一轮从表现最好的游戏、地区和流量来源继续扩张。
