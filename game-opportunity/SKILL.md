---
name: game-opportunity
description: Rankup 的小游戏机会专项 Skill。用于监测游戏平台 sitemap、发现 24 小时游戏新词、建立多语言关键词需求簇、核对 KD/SERP/近 7 天趋势/独立需求/可玩供给并生成每日决策报告；通用规则和脚本随 Rankup 提交，项目私有结果写进被 Git 忽略的 .rankup/。
---

# Game Opportunity

把游戏平台的新 URL 变成可直接挑选的建站候选。商业判断看今天的搜索需求、竞争盘面和可玩供给；
游戏发布时间只负责标注新旧，老游戏同样可以进入优先队列。

<intent-routing>

## 从一句话反查入口

用户不会说「跑 evaluate」，他会说「看看今天有什么游戏能做」。所有命令都是
`node game-opportunity/scripts/game-opportunity.mjs <子命令>`。

| 用户可能说的话 | 跑什么 → 判读依据在哪 |
|---|---|
| 「跑一下小游戏监测」「今天有什么游戏能做」 | `daily`（= `collect` + `demand` + `evaluate`）→ 日报 `.rankup/demand/game-review/latest.md`，分组判读看下方「外部需求双轨闸门」 |
| 「只看今天平台新增了什么」 | `discover`（平台 sitemap diff）；只要 24 小时新名字用 `radar` |
| 「查一下这批游戏的量和 KD」 | `plan` → `demand`（**每天只有 6 个深查名额**，名单由你写进 `YYYY-MM-DD-demand-selection.json`，见「深查名额」） |
| 「这些候选值不值得做」 | `evaluate` 排版事实 → **判读归你**：对照「搜索需求轨 / 早期爆发轨」分值表与 KD × 新站动作表，把结论写进 `YYYY-MM-DD-evaluation.json` |
| 「今天这轮算跑完了吗」 | `collect-checklist` / `decision-checklist`（各 10 项证据验收，查的是证据齐不齐，不是判决对不对） |
| 「不联网重建一下今天的清单」 | `dedupe`（读当天 discovery/radar，去重游戏与社交 campaign） |
| 「游戏站怎么搭、怎么变现」 | 不在本 Skill：读 `rankup/references/game-sites.md` + `rankup/references/lifecycle.md` |
| 「选词/外链/建站的通用问题」 | 回 `rankup`——本 Skill 只管「哪个游戏值得做」这一段 |

**任何来源采集失败或某行 `status:'not-queried'` 时，对应项标「未测」，不得当成 0 或「无需求」。**

</intent-routing>

## 分工铁律：脚本只采集，判断只归 AI

| 层 | 谁做 | 产出 |
|---|---|---|
| 采集 | `game-opportunity.mjs` 各子命令 | 原始 per-source 证据 + manifest（每源 `{source,status,count,error}`）、挑战页原始 HTML、`not-queried` 与实测零严格分开 |
| 判读 | AI 对着原始信号 | `YYYY-MM-DD-evaluation.json`（action/理由/缺失证据）与 `YYYY-MM-DD-demand-selection.json`（深查名单） |
| 排版 | `evaluate`/`render` | 只排事实与 AI 已写入的判读，不产生任何结论句 |

脚本里没有打分器、没有阈值门、没有 verdict。本文档下面的所有分值表和门槛数字都是
**AI 判读指引**，供 AI 对照原始信号使用；任何来源采集失败时，对应项在判读里标「未测」，
不允许当成 0 或「无需求」。

## 任务入口

| 任务 | 动作 | 固定产物 |
|---|---|---|
| `discover` | 抓取全部平台 sitemap、按站点路径过滤、与上次快照做 diff | `.rankup/demand/game-review/YYYY-MM-DD-discovery.json` |
| `radar` | 扫描 24 小时发布源与玩家社区，提取刚出现的游戏名、别名和玩法词 | `.rankup/demand/game-review/YYYY-MM-DD-radar.json` |
| `collect` | 依次完成 `discover` 和 `radar`，并合并当天新增游戏 | 上述两个输入文件与 `YYYY-MM-DD-new-games.json` |
| `collect-checklist` | 执行采集并完成 10 项硬验收 | `YYYY-MM-DD-collect-checklist.{json,md}` |
| `dedupe` | 不联网，读取当天 discovery/radar，去掉重复游戏与社交 campaign | `.rankup/demand/game-review/YYYY-MM-DD-new-games.json` |
| `plan` | 从真实游戏生成原名、英文名、本地名的全球优先查询计划；深查名单读 AI 写的 `YYYY-MM-DD-demand-selection.json`，缺省用机械顺序（到期复查 → 当天新发现 → 其余），完整候选池连同选中与否写进 plan | `YYYY-MM-DD-demand-plan.json` 与 `YYYY-MM-DD-global-keywords.txt` |
| `demand` | 先查全球量和主要国家，再一次性查询各国家库；未查询的市场落 `status:'not-queried'` 且数值为 null，与实测零严格分开 | `YYYY-MM-DD-demand-results.json` |
| `evaluate` | 验活、合并实体、叠加取数结果与 AI 判读、按机械顺序排版日报；挑战页原始 HTML 落 `YYYY-MM-DD-evidence/` 并标记，候选不被剔除 | `.rankup/demand/game-review/YYYY-MM-DD-candidates.json` 与 `YYYY-MM-DD-report.md` |
| `decision-checklist` | 执行需求调查、日报并完成 10 项硬验收 | `YYYY-MM-DD-decision-checklist.{json,md}` |
| `daily` | 依次完成 `collect`、`demand` 和 `evaluate` | 上述全部产物 |

所有任务都走同一个真实入口：

```bash
node game-opportunity/scripts/game-opportunity.mjs <discover|radar|collect|collect-checklist|dedupe|plan|demand|evaluate|decision-checklist|render|daily>
```

用户只说“运行小游戏监测”时执行 `daily`。自动任务分成 `collect` 和 `demand + evaluate` 两个时段：
平台增量与 24 小时雷达先形成稳定输入，需求阶段再按全球、国家、竞争顺序查数并生成日报。

## `radar`

24 小时内的新名字先从发布源和玩家现场发现，再进入搜索量验证：

1. 供给端：游戏平台 sitemap、itch.io 最近 7 天、GameJolt Hot、Poki / CrazyGames 新游位、
   Scratch / Cocrea、SteamDB New & Trending、GitHub 游戏仓库与 App Store / Google Play 新游戏；
2. 玩家端：Reddit 的 `r/WebGames`、`r/playmygame`、`r/IndieGaming`、玩法垂直社区；
3. 传播端：YouTube 当日上传、X 最新帖，以及目标语言的本地游戏论坛；
4. 搜索端：Google Trends 实时热搜、7 天曲线和 related rising，以及 Google Autocomplete / Related
   Searches 里的 `play <name> online`、`<name> unblocked`、`<name> html5` 等长尾萌芽；
5. 验证端：Similarweb 最近 28 天关键词与流量去向、Semrush 分国家搜索量与 KD。

使用 Agent Reach 当前可用后端读取社区；桌面登录态优先走 OpenCLI：

```bash
opencli reddit search "<游戏名>" --sort new --time day --limit 10 -f json
opencli youtube search "<游戏名> game" --upload today --sort date --limit 10 -f json
opencli twitter search '"<游戏名>" since:<YYYY-MM-DD>' --product live --limit 10 -f json
```

同时搜索 `new browser game`、`playable demo`、`release trailer`、`HTML5 game` 与各语言对应表达，
从正文、标题和落地链接提取新实体。每条雷达记录保存 `firstSeen`、来源 URL、发布时间、互动量、
可玩链接、语言、市场和别名。同一作者、官方账号及相同文案的跨社区发布合并为一个 `campaign`；
独立发布者、平台类型和非官方互动分别计数。雷达线索先进入验证队列，达到下方早期爆发闸门后升级。

新词按首次发现后的第 3、7、14、28 天复查。早期保存 `volumeStatus: not-yet-observed`，继续用
社区增速、跨平台重复、可玩供给和 Trends 判断；搜索量出现后再并入常规 KD、SERP 和国家筛选。
Similarweb 用于最近 28 天的关键词、国家和流量去向验证，Semrush 用于分国家搜索量与 KD。

## 外部需求双轨闸门（AI 判读指引，脚本不执行）

站内新增页、首页入口和 sitemap 批量更新时间负责发现候选。外部需求分从独立 Google SERP、本地
搜索量、Trends、竞品自然搜索词，以及非官方社区传播中取得。

下面两轨的分值和通过线是 **AI 对着原始信号打分判读时的参考口径**，不是脚本行为：
脚本只把每个来源的原始数值、状态和失败现场交出来。某来源 `status:'failed'` 或关键词行
`status:'not-queried'` 时，对应打分项标「未测」，整条判决按证据不全处理，不得按 0 分计。

### 搜索需求轨

| 项目 | 分值 |
|---|---:|
| 目标国家精确词月搜：1–99 / 100–499 / 500–1999 / 2000+ | 5 / 10 / 15 / 20 |
| Google 前十存在多个独立域名且意图与游戏一致 | 10 |
| 30 天或 7 天 Trends 形成连续曲线并向上 | 10 |
| Similarweb 能在竞品自然搜索词中看到该词 | 5 |
| KD：≤30 / 31–40 / 41–50 / >50 | 15 / 12 / 8 / 3 |
| SERP 有低权重、新页面或独立站空位 | 10 |
| 可玩供给 / 移动端稳定 / 两天内可上线 | 10 / 5 / 5 |
| 目标国家与搜索意图匹配 | 10 |

精确词、玩法大类和多语言变体分别打分。搜索量达到“全球精确词 1,000，或目标国家精确词 500”
只进入调研，不代表可以开发。AI 判 `develop` 的参考硬门槛是全球精确词至少 10,000、最高国家至少
2,000、KD 不高于 30、游戏意图已核实、存在独立外部需求并且可玩供给稳定；任一项缺失或未测就判
调研或观察。候选再计算 KGR
（`allintitle` 结果数 ÷ 月搜）：社区初筛线为 KGR <0.25 或 `allintitle` <100；同时查看 EMD 与前十
专业站占位。总分 70+ 判 `quick-ship`，50–69 判 `priority-research`，其余判 `watch`——这套打分
由 AI 完成并连同理由写进 evaluation 文件，脚本只透传。

### 早期爆发轨

面板尚未形成数据时，保存 4 小时、24 小时、7 天三个快照，并以去重后的 `campaign` 计算：

| 项目 | 初始通过线（先运行 1–2 周回测再校准） |
|---|---|
| 24 小时非官方独立发布者 | ≥3 |
| 独立平台类型 | ≥2（如 Reddit + YouTube） |
| 24 小时发布速率 / 前 7 天日均 | ≥3 倍 |
| 非官方互动或观看 | ≥20 次互动，或 ≥500 次观看 |
| 搜索萌芽 | Trends rising、Autocomplete 长尾、相关查询或新 SERP 页面命中一项 |
| 可玩供给 | 已有可打开的网页游戏、demo 或稳定 iframe |

前四项全部达到并在 4 小时复查后继续增长，进入 `priority-research`；再取得搜索萌芽与可玩供给，
升级为 `quick-ship`。这些数字是自动化的第一版校准值：每天保存命中与后续真实搜索结果，运行 1–2 周
后按成功样本调整。每个发布者的账号、文案、落地链接和发布时间都保存在证据里，方便识别自然扩散
与集中推广。

新词用 7 天、30 天窗口看加速度；有历史的玩法词再看 3 年、5 年窗口，区分长期向上与短时毛刺。
同一痛点在 3 个以上独立平台重复出现，记录为跨平台需求证据。

## 数据边界

本 Skill 是 Rankup 的可复用专项能力，不是项目 `.rankup/` 里的临时流程：

- 通用 SOP、Checklist 与脚本保存在 `game-opportunity*`、`rankup/` 和 `backlink/`；
- 每个网站自己的平台清单、快照、候选、取数结果与日报只保存在该项目 `.rankup/`；
- 项目中验证稳定的新规则写回通用 Skill，项目名、域名和私有数据不写入通用规则。

- 平台清单：`.rankup/demand/game-platforms.json`
- sitemap 快照：`.rankup/demand/game-sitemap-snapshots/`
- 发布源快照：`.rankup/demand/game-radar-snapshots/`
- 原始报告、KD 输入与结果、候选 JSON、日报：`.rankup/demand/game-review/`
- 长期候选与判断：`.rankup/research.md`

这些都是当前项目自己的数据。复用规则和脚本保存在本 Skill、Rankup 与 Backlink 中。

`collect` 会把当天 discovery URL 与 radar 的 Steam/itch/Poki 游戏标题合并成唯一的 `games[]`，社交
`campaign` 只保留在 radar 原始输入里，不计入新增游戏数。`dedupe` 可在不联网的情况下重建该文件。

## `discover`

在仓库根目录执行：

```bash
node game-opportunity/scripts/game-opportunity.mjs discover
```

平台配置里的 `include`、`exclude`、`kind` 和 `timeout` 分别负责游戏路径、杂页路径、内容类型和
单站抓取窗口。保留每个平台的独立快照与统计，让报告可以按平台、语言和市场回溯。

## `evaluate`

先运行入口脚本生成当天候选队列并验活：

```bash
node game-opportunity/scripts/game-opportunity.mjs evaluate
```

### 1. 验证并归并

读取当天 discovery JSON，对新增 URL 依次完成：

1. 直接 HTTP 检查状态、最终 URL、正文长度和标题；
2. 用 Jina Reader 提取可读正文；
3. 页面依赖登录态或浏览器渲染时，用 OpenCLI 读取；
4. 按 canonical、游戏名、slug 和 iframe URL 合并同一游戏的多语言页面；
5. 分成 `playable-game`、`new-on-platform`、`game-adjacent`、`stale-url`。

`new-on-platform` 表示监测站今天刚收录；另行查明游戏首次发布时间。两者同时写入报告。

### 2. 生成关键词

每个有效实体提取 1–3 个真实搜索表达：官方原名、官方英文名、已有本地名。大小写变体合并；`Demo`
只作为版本标记，不单独占一个词。平台所在国家只记录发现来源，不用于断定游戏产地或目标市场。

英文不能因为游戏来自小语种平台而省略：有官方英文名或通用英文名就进入全球查询。非英语原名也
单独查全球，因为全球查询只统计完全相同的字符串，不会自动把 `ノノグラム` 翻译成 `nonogram`。

先把候选标成 `brand`、`category` 或 `generic`，再建立需求簇：

1. `brand`：官方名、英文名、本地名，以及已有信号支持的 `pc`、`online`、`guide` 等承接意图；
2. `category`：本地用户对同一玩法的不同叫法、免费/在线/直接玩等意图词；
3. `generic`：先用 SERP 确认它确实指向同一种游戏需求，再决定是否保留。

Semrush/Similarweb 的相关词用于扩展候选，不能直接当开发证据；扩出的词仍要分别查国家量、KD 和
SERP。同义词可能由同一批用户搜索，报告分别列数，不把它们简单相加成市场总量。游戏平台所在国家
只代表发现来源；全球、英语大市场和真实有量国家不能因小语种来源而跳过。

先执行：

```bash
node game-opportunity/scripts/game-opportunity.mjs plan
node game-opportunity/scripts/game-opportunity.mjs demand
```

`demand` 固定按下面顺序运行：

1. 按优先级取前 6 个真实游戏，查询其原名、英文名和本地名，读取 `globalVolume` 与 Top-N `byCountry`；
2. 把发现市场、`byCountry` 中有量的国家合并成国家计划；
3. 在同一个 Semrush 页面会话中批量取完所有国家的当地量、KD、CPC 和意图；
4. 已完整取得的全球和国家结果直接复用，重跑时不重复打开浏览器。

Semrush 启动时出现一次工具主页属于初始化；国家查询不得为每个国家重新启动工具或反复跳主页。

### 3. 查询竞争与需求

全球与国家分布完成后，再对主要机会查询哥飞 Web.Cafe 的 KD 与 SERP 盘面：

```bash
node rankup/scripts/seo-webcafe.mjs kd \
  --batch ".rankup/demand/game-review/${TODAY}-kd-input.txt" \
  --spacing-ms 6500 \
  --out ".rankup/demand/game-review/${TODAY}-webcafe-kd.json"
```

**这条命令默认经 OpenCLI 驱动本机已登录的 Chrome 跑登录 100/日或 VIP 500/日**——不用额外传参。
终端第一行打印「配额 游客：已用 X/10」是**降级信号**，不是常态：要么 OpenCLI 不可用
（`opencli doctor` 先看红在哪），要么显式加了 `--guest`。批量跑一整批词前先确认第一行
打的是登录/VIP 档，别按游客 10/日的假设去规划这一批要测多少词（2026-09-11 三个执行者
在这条命令上重演过一次：把这行误报当真实上限，批量刚起步就以为耗尽了）。

Web.Cafe 结果用于 KD、首页/内页构成、最弱竞争者和链接预算。搜索量、CPC 与全球量使用：

```bash
node backlink/scripts/semrush-keyword.mjs \
  --kw-file ".rankup/demand/game-review/${TODAY}-keywords-<db>.txt" \
  --db <db> \
  --bulk \
  --out ".rankup/demand/game-review/${TODAY}-semrush-<db>.jsonl"
```

单个国家文件仍可独立补查，`--db` 始终显式填写；批量页一次提交最多 100 个词。跨国家自动任务使用：

```bash
node backlink/scripts/semrush-keyword.mjs \
  --bulk-plan ".rankup/demand/game-review/${TODAY}-country-plan.json" \
  --out ".rankup/demand/game-review/${TODAY}-semrush-countries.jsonl"
```

`globalVolume` 表示完全相同关键词的全球合计，`byCountry` 只表示页面列出的主要国家，不等于全部
国家。全球量不能证明搜索意图属于这款游戏：`Island Survival` 这类泛词必须再查 `<name> game`、
`play <name>`、SERP 实体和竞品页面。Semrush 的零值单词单独复查一次。趋势用
`rankup/scripts/gt.py` 查询 12 个月、30 天和 7 天窗口。对可玩候选提取 iframe 或游戏入口，记录
HTTP 状态、加载页、移动端与全屏线索。

#### KD 与 SERP 的统一判断

| KD | 新站动作 |
|---|---|
| `<20` | 有量、意图和供给成立时直接进入开发复核 |
| `20–39` | 新站主战场，完成 SERP 与独立需求核对后推进 |
| `40–49` | 只有前十存在弱位/新站、意图集中、页面能明显更好且接受外链成本时继续 |
| `>=50` | 不作为 DR≈0 新站主攻词，可留作需求簇副页或观察词 |

KD 40 是深查触发线，不是自动放弃线。品牌衍生 KD 只说明攻略、下载、评测等第三方页面的切入难度；
品类词用普通 KD。Semrush 与 Web.Cafe 相差 10 分以上、关键词类型不一致或某一方无数据时，必须写明
口径冲突并人工复核 SERP，不能挑较低数字下结论。竞争证据至少保存搜索意图、前十弱位、低权重/新站
是否存在，以及当前页面能否形成体验差异。

#### 总量与最近方向分开

Similarweb 的近 28 天总量回答“这个月有没有需求”，Google Trends 最近 7 天回答“现在还在加速、持平
还是回落”。每个深查候选同时保存 `28d/30d` 与 `7d`，结论只用 `rising`、`flat`、`cooling`、
`insufficient` 四种。近 28 天高于长期均值但最近 7 天回落，应写成“月度仍高、短期降温”，不能写成
“仍在上涨”。样本不足是 `insufficient`，不是零需求。

#### 独立需求与平台内流量分开

游戏平台新增页、首页推荐和站内入口只证明平台愿意推这个游戏。外部需求要从独立 Google SERP、
分国家搜索量、非官方社区/视频、竞品自然搜索词取得。每个候选记录 `internalTrafficRisk` 和
`independentDemand`；只有平台内信号时留在观察，不因该页存在或可 iframe 就升级。

### 4. 分组（AI 判）

AI 对照上面的判读指引把候选放进三组，写进 evaluation 文件：

- `quick-ship`：全球量、主要国家量、KD、游戏意图、独立需求与可玩供给全部通过开发硬门槛；
- `priority-research`：已有需求信号，还需要补一项供给、趋势或竞争证据；
- `watch`：游戏相关信号成立，等待下一次平台、趋势或搜索量信号。

AI 未判读的候选在日报里如实归入「未判」组，不由脚本代判。老游戏按当前量、当前 KD、当前
SERP 和当前供给进入同一套判读。失效 URL（全部实测 404/410）由脚本单独汇总为事实，便于清理
sitemap 噪声；被 Cloudflare 挑战页挡住的候选**不算失效也不被剔除**，其原始 HTML 在
`YYYY-MM-DD-evidence/`，由 AI 决定换通道重测还是换判定。

### 5. 写回并生成日报

把量化结果写成 `.rankup/demand/game-review/YYYY-MM-DD-evaluation.json`，格式为
`{"candidates":[...]}`；每项用 `entityId`、名称或 URL 与队列合并。

**这个文件是整条链路唯一的判断入口，由 AI 判读后写入。** 品牌词/品类词、SERP 意图、前十
弱位、7 天方向、站内流量风险，以及 `action`（develop/research/watch）、`reasons`、
`decisionAudit.missingEvidence`、`nextAction` 全部只能来自这里，脚本原样透传、缺失即「未判」；
D03、D06、D07、D08 四项验收查的就是它们。深查名单同理写
`YYYY-MM-DD-demand-selection.json`（entityId 数组），`plan` 的 `pool` 字段列出完整候选池
供挑选；不写名单时脚本用机械默认顺序（到期复查 → 当天新发现 → 其余）。
`evaluate` 与 `decision-checklist` 会**自动读取这个约定路径**，不需要每次传 `--evaluation`：

```bash
node game-opportunity/scripts/game-opportunity.mjs decision-checklist
```

只有要用别处的文件覆盖时才显式传参（显式传参优先）：

```bash
TODAY=$(date +%F)
node game-opportunity/scripts/game-opportunity.mjs render \
  --evaluation ".rankup/demand/game-review/${TODAY}-evaluation.json"
```

> **2026-08-27 修复**：此前 `evaluate` 只认显式 `--evaluation`，而 `decision-checklist`
> 调用它时不传参，于是人工判断**每次无人值守运行都被丢掉**，D03/D06/D07/D08 恒为 0/6。
> 现在两个阶段读同一个约定路径。

入口脚本固定生成日期文件和两个稳定入口：

- `.rankup/demand/game-review/latest.json`：机器可读候选；
- `.rankup/demand/game-review/latest.md`：给用户阅读的最新日报。

日报按 `develop`、`research`、`watch`、`未判` 四组展示（前三组标签来自 AI），每个候选必须有
发现页、可玩页或证据链接。搜索量分开显示“全球量、最高国家及其量、发现市场及其量”，不能把最高
国家的数字写到发现市场名下；同时带该主要市场 KD、未查询行数、可玩状态（是/否/未测）和 AI 写的
下一步。自动任务完成时直接把各组 List 与这些链接返回给用户，由用户决定继续调研或创建网站开发
任务。

日报本身不写结论句。「今天没有达到开发门槛的机会」这类判断由 AI 在判读完原始信号后自己说，
且说之前必须确认：不是因为某个来源失败或某些市场未查询才显得没有机会——未测项要么补测，
要么在结论里如实点名。不把中小词或意图未核实的泛词升级成建议开发。

前一日的 `research/watch` 会自动续带；首次发现后的第 3、7、14、28 天在 `carryForward.recheckDue`
标记复查。新候选始终排在续带候选之前。

### 深查名额：AI 定名单，脚本只有机械默认

每天只有 **6 个深查名额**（要花 Semrush 配额）。谁占名额是判断，所以由 AI 在跑 `plan`/`demand`
前看 `plan` 输出的完整候选池（`pool` 字段），把名单写进
`YYYY-MM-DD-demand-selection.json`（entityId 数组，按序取用）。

不写名单时脚本用**机械默认顺序**（只看日历和来源，不看好坏）：

| 顺位 | 情况 |
|---|---|
| 1 | 续带候选今天正好跨过第 3/7/14/28 天（复查是日历承诺） |
| 2 | 当天新发现（`new-games`） |
| 3 | 其余非续带候选 |
| 4 | 非复查日的续带候选（不占位——2026-08-27 实测续带常驻会让 224 个新发现只剩 1 个名额） |

> **2026-08-27 修复了两个会让流水线停止发现新机会的 bug：**
>
> 1. **复查判定用的是精确相等** `[3,7,14,28].includes(ageDays)`。流水线漏跑一天，
>    age 从 2 跳到 4，第 3 天的复查就**永久错过且不会补**——而且不会有任何报错。
>    改成「跨过里程碑就触发」。
> 2. **续带候选每天都占着全部名额**。实测 2026-08-27：6 个名额里 5 个被续带占住，
>    **224 个当天新发现的游戏只能抢 1 个**；而这些续带候选的证据缺口不会自己补上，
>    等于队列永久饱和。根因是 `inputCandidates` 规范化时把 `carryForward` 字段丢了，
>    续带候选在排序时看起来像全新的。

## JSON 产物

`YYYY-MM-DD-candidates.json` 至少包含：

```json
{
  "date": "YYYY-MM-DD",
  "sourceReport": "...-discovery.json",
  "stats": {},
  "candidates": [
    {
      "entityId": "...",
      "names": [],
      "urls": [],
      "platforms": [],
      "languages": [],
      "markets": [],
      "pageType": "playable-game",
      "firstSeen": "...",
      "gameReleasedAt": "...",
      "reachable": true,
      "playable": true,
      "embed": {},
      "keywords": [],
      "keywordStrategy": {"entityType": "brand", "clusters": []},
      "demandProof": {"track": "search", "score": 0, "evidence": []},
      "promotionRisk": {"internalTrafficRisk": "medium", "campaigns": 0, "independentPublishers": 0},
      "competitionReview": {"serpIntent": "", "weakPositions": [], "newSitePresent": false, "kdInterpretation": "", "metricConflict": "reviewed"},
      "trend": {"direction": "flat", "windows": {"28d": {}, "7d": {}}},
      "decisionAudit": {"missingEvidence": []},
      "decision": "quick-ship",
      "reasons": [],
      "nextAction": "..."
    }
  ]
}
```

每个 `keywords[]` 条目保存关键词、市场、语言、Web.Cafe KD、SERP 形态、Semrush 本地量、全球量、
主要国家量、CPC、Semrush KD、查询时间和原始结果文件。日报用表格列出候选、量、KD、可玩性、
结论和下一步。

## 完成判定：证据在场，而不是自评通过

完成与否看**证据是否都在盘上**：每个环节的原始产物存在、每个来源在 manifest 里有明确的
`collected/failed` 结果、每次失败留了现场（错误信息或原始 HTML）、每个判读字段能追溯到
evaluation 文件。`collect-checklist` / `decision-checklist` 是这套证据在场判定的机器化形式，
它们验证的是「证据齐不齐、账对不对」，不是「判决对不对」——判决质量由 AI 与用户对着证据复核。

- 早间任务以 `collect-checklist` 10 项证据验收为完成门槛；
- 决策任务以 `decision-checklist` 10 项证据验收为完成门槛；
- discovery 报告存在，并给出成功、baseline、失败和新增数量；失败平台在 manifest 里可见；
- 每条新增 URL 都有可访问性实测结果（是/否/未测；被挑战页挡住算未测且现场在 evidence 目录）；
- 多语言重复页已经合并；
- 每个进入排序的候选都有供给状态和至少一组市场关键词数据；
- 候选先有 `globalVolume/byCountry`，再有发现市场和主要国家的当地量；有英文名时英语词已进入全球查询；
- `demandCoverage` 明确记录查过的关键词和国家，日报不把平台国家当成游戏产地；
- 每个深查候选已标注品牌词/品类词，建立同义词与承接意图需求簇，并避免把重叠搜索量相加；
- KD 口径、SERP 弱位/新站、28 天总量、7 天方向和平台内流量风险均有明确字段；
- JSON 与 Markdown 数字一致，所有私有产物都位于 `.rankup/`。
- `latest.json` 与当日 candidates 一致，`latest.md` 与当日日报一致；
- 最终回复包含 `develop/research/watch/未判` 各组候选和可点击来源链接；未判与未测项如实点名，不得写成零或没有。
