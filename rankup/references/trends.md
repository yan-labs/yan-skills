
# 趋势查询、关键词难度与选词工作流

> 本文原为独立的 `gt` Skill，2026-08-16 并入 `rankup`。
> 两层能力：**基础查询**（趋势四个子命令 + KD）和**工作流**（把查询串成选词决策）。
> 用户问单点问题走基础查询；用户给的是模糊方向、要选词选市场时，走工作流。

**触发面注意**：合并前 `gt` 有自己的触发词（谷歌趋势、热搜、"这两个词哪个火"）。
现在这些请求要经由 `rankup` 才能到达本文，`rankup` 的 description 已补上这批词。
纯查热度、跟建站无关的问题也照样加载 `rankup` 再读这一篇。

## 〇、Trends 只给形状，不给量——必须双锚换算，且要地理对齐

**Google Trends 的 0-100 是组内归一化，没有单位。** 它可能对应每月 100 次搜索，
也可能是 10 万次。单独引用一条 Trends 曲线得不出任何可执行结论。

### 换算方法：同组放入已知绝对量的词当锚

把 1-2 个**已经用关键词工具实测过绝对量**的词放进同一次 `compare`，
用它们把指数换算成搜索次数。**必须用两个锚**，因为两个锚给出的系数之差
就是这次换算的误差下限。

【实测标定】某次美国口径的四词对比，两个锚的实测月搜分别是 4,400 与 1,900：

| 锚 | 实测月搜 | 12 月指数均值 | 换算系数 |
|---|---|---|---|
| 锚 A | 4,400 | 52.4 | 1 指数点 ≈ 84 次/月 |
| 锚 B | 1,900 | 30.1 | 1 指数点 ≈ 63 次/月 |

两系数相差 **1.33 倍**。等价说法：Trends 认为两词热度比 1.74，
而实测量比是 2.32。**Trends 的相对刻度本身就有约 ±30% 的失真**，
所以任何单锚换算都要按区间报，不要报单值。

用双锚夹出区间后，可以给未知词换算出绝对量。实测该次的两个冷门品牌词
换算结果与另一个独立数据源（按已确立的全球/美国倍数折算后）落在同一区间，
互相印证——**这是验证换算成立的正确做法：找第三条独立路径对撞，不是自证。**

### 地理必须对齐，否则锚是歪的

`--geo` 留空是**全球**，而关键词工具的量能通常是**单一国家库**。
拿全球指数去配美国量能，换算系数从一开始就是错的。
**锚的地理口径和 `--geo` 必须一致。**

### 三个工具的分工（缺一条就得不出可用结论）

| 工具 | 提供什么 | 单独用的后果 |
|---|---|---|
| Google Trends | 时间形状、相对关系、季节性、是涨是跌 | 没有单位，无法判断值不值得做 |
| 关键词工具（按国家库） | 绝对量的刻度 | 没有趋势，看不出这个量在涨还是在死 |
| 流量面板 | 这些搜索最后有没有变成访问 | 前两者都成立仍可能没人来 |

顺序：**先用 Trends 看形状 → 再用关键词工具定量 → 最后用流量面板验证落地。**

## 〇·五、对比是全组连坐：一个词太冷，整组返回「没有数据」

**Trends 的 `compare` 里只要有一个词低于阈值，整组都会被丢弃**，不是只丢那一个。
而报错文案说的是「关键词太冷门，或该地区/时间范围内无足够搜索量」——
极易被读成「这些词都没量」，实际可能只有其中一个拖累了全组。

实测：五个品牌词一起跑返回「没有数据」；逐个单跑，其中多个都有数据，
且分开写的变体峰值反而更高。

处理顺序，不要跳步：

1. **先拿一个必然有量的词单跑**，确认管道是通的（区分「没数据」与「取数坏了」）；
2. **再逐个单跑**，定位到底哪个太冷；
3. **只把有量的词放进同一次 compare**，取相对刻度；
4. 冷门词只能单跑看自己的形状，**不能与他词同组比较**——它的曲线是按自己的峰值归一化的。

## 〇·六、锚点体量的选择：用中等量词作锚，细分词才能看清形状

**不同体量的锚点给出完全不同的细分词形状。** 用超大词（如 `ai image generator`）作锚时，细分词会被压到曲线底部 0–1 的噪声区间，根本看不出涨跌态势；用太小的锚则误差过大，换算系数不可信。

**【经验】用 `gpts` 作锚点和候选词同框对比**，比起跟随大热词有明显优势：

- **体量中等且相对稳定**：`gpts` 的搜索量稳定在可测范围内，不会因单点事件剧烈波动，适合作长期基准。
- **细分词能落在可读区间**：候选词的曲线会落在 20–80 而不是 0–5，从而清晰展现涨跌周期与季节性。【猜测】`gpts` 约 5K/日曝光，仅作参考——实际绝对量由 KD 工具给出。
- **过线判据**：候选词 12 个月均值达到 `gpts` 的**一半**就值得看，四分之一到一半算接近但需谨慎。

**前置条件**：先在 Google Trends 上单独查 `gpts` 在目标国家过去 12 个月的曲线，确认自身稳定；若曲线明显上涨、下跌或周期波动大，就换用另一个体量相近但趋势更平稳的词作锚，否则这轮对比的刻度会偏离历史基准。

## 核心概念

选词的完整公式是 **潜在价值 = 需求 × (1 - 竞争)**：
- **需求侧**（Google Trends）：谁在搜、搜多少、趋势涨跌、哪些国家热 → `compare` / `region` / `related` / `hot`
- **竞争侧**（KD 难度估算）：排上去有多难、前十是谁、要多少外链 → `kd`

两侧都查完才能下"值不值得做"的结论。

## 基础查询

| 用户想要 | 子命令 | 数据源 |
|---|---|---|
| 热度对比 / 趋势曲线 / "XX 和 YY 哪个火" | `compare` | opencli 驱动新版 Explore UI |
| 地区分布 / "哪个国家搜得多" | `region` | opencli 驱动新版 Explore UI |
| 相关词 / 飙升查询 / "大家搜 XX 时还搜什么" | `related` | opencli 驱动新版 Explore UI |
| 今日热搜 / "美国现在在搜什么" | `hot` | opencli |
| 关键词难度 / SERP 盘面 / "这个词能排上去吗" | `seo-webcafe.mjs kd` | Web.Cafe KD API |

### 取数路由：新版 Explore UI（2026-09-09 切版）与旧版归档

2026-09-09，Google Trends 上线了新版 Explore UI（`https://trends.google.com/explore?...`，
注意路径是 `/explore` 不是 `/trends/explore`）。两套 UI**目前并存**——旧版没有被下线，
页面右上角互相留着切换入口（旧版 "Go to new Explore" / 新版 "Back to Classic Explore"）。
`gt.py` / `gt-browser.mjs` 已切到新版路由为主用；**旧版整套（含 `--via pytrends`）归档在
`rankup/scripts/archive/gt-v1/`**，新版接口失效或要对拍时用它兜底：

```bash
python3 rankup/scripts/archive/gt-v1/gt.py compare higgsfield manus --via pytrends
```

新旧两版的取数机制完全不同：

| 路由 | 怎么取的 | 现状 |
|---|---|---|
| 新版（**主用**，`gt.py` 默认） | OpenCLI 打开新版 explore 页，读页面自己发出的 `batchexecute` 内部 RPC 响应（见下方「新版接口勘探」） | 主用。要求 `opencli doctor` 绿 |
| 旧版 browser（归档） | OpenCLI 打开旧版 `/trends/explore`，在页面上下文里 fetch `api/explore` + `api/widgetdata/*` | 归档兜底，`archive/gt-v1/` |
| 旧版 pytrends（归档） | 匿名 HTTP 打旧版 widget 接口，无凭据，429 是常态 | 仅归档版支持，新版路由不再提供 `--via pytrends`（会报错并指向归档版） |

`hot` 一直走 `opencli google trends` adapter，跟新旧版 Explore 切换无关，两边行为一致。

### Trends 查询（compare / region / related / hot）

脚本位于 `scripts/gt.py`（以下示例用 `$GT` 代指，实际执行时替换为本 Skill base directory + `/scripts/gt.py`）：

```bash
python3 $GT <子命令> [关键词...] [选项]

# 热度对比（默认全球、近 12 个月，>30 行自动按月聚合）
python3 $GT compare ChatGPT Claude Gemini
python3 $GT compare "wireless charger" --geo US --time 5y
python3 $GT compare sunscreen --time 2024-01-01:2025-12-31 --geo AU

# 地区分布（不带 --geo 按国家列，带 --geo 按州/省列）
python3 $GT region "remove background" --top 15

# 相关查询（单关键词；rising=飙升词，top=高频词）
python3 $GT related Claude --geo US

# 每日热搜榜（走 opencli，未安装 opencli 则此命令不可用，其余三个不受影响）
python3 $GT hot --region JP --limit 10
```

选项速查：`--geo`（US/JP/ID…，留空=全球，任意 ISO 国家码都行）、`--time`（**1h/4h/1d**/7d/28d/30d/1m/3m/12m/5y/all 或 起:止 日期；1h/4h/1d 见下面「短时窗口」）、`--raw`（compare 不聚合）、`--top N`、`--region`/`--limit`（仅 hot）。

连续查多个时间窗或国家时，给这批命令加 `--keep-session`，脚本会复用同一个 Trends 页面，不会每条命令重新打开；全部查完后释放会话：

```bash
python3 $GT compare "keyword" --geo JP --time 30d --keep-session
python3 $GT compare "keyword" --geo JP --time 7d --keep-session
python3 $GT close
```

单条查询默认跑完即释放会话。**`--keep-session` 之后一定要记得 `close`**——
它留下的标签页会一直停在空白的 explore 界面上（取数全在页面内 fetch，DOM 不会变），
在用户的 Chrome 里看起来就是「一个卡死的标签页」，而漏掉释放**不会有任何报错**。
脚本会把释放命令打到 stderr，看到就照着跑。

`--session NAME` 可为并行任务指定独立会话名。默认会话名已经带每对话唯一后缀
（`rankup-gt-trends-<后缀>`），但**同一个对话里 fan-out 的多个 sub agent 继承同一份
环境变量、会算出同一个名字**——那种情况必须各自显式传 `--session`，否则它们共用
一个标签页，第二个读到的是第一个打开的页面，且全程零报错。

### KD 难度估算

KD **不再有独立脚本**。合并时发现 `gt/scripts/kd.py` 与 `scripts/seo-webcafe.mjs`
打的是同一个端点（`https://seo.web.cafe/kd/api/v1/kd`）、用的是同一种令牌
（`wc_mcp_` 开头，`gt` 那边叫 `KD_TOKEN`，这边叫 `SEO_WEBCAFE_TOKEN`），
只是两套实现、两个变量名。删掉重复的那份，KD 统一走：

```bash
node scripts/seo-webcafe.mjs kd --keyword "ai photo editor"
node scripts/seo-webcafe.mjs kd --keyword "remove background" --gl JP
```

令牌两种给法，`export SEO_WEBCAFE_TOKEN=...`，或写进本 Skill 目录的 `.env`
（`KD_TOKEN=` 亦可，两个键名都认）。`.env` 兜底是合并时特意加的：
`gt` 那边只要装一次 `.env` 就一直能用，若合并后只认环境变量，等于要求每次 export，
是无声的体验倒退。

**KD 不走 MCP。** `seo.web.cafe` 有 `/kd/mcp` 端点，但它与 HTTP API 同额度、同数据，
多一层连接只多一个故障点。完整契约（参数、额度、错误码、下结论该看哪些字段）见
[`seo-webcafe.md`](seo-webcafe.md) 的「`/kd/` 是完全独立的另一套认证」一节。

> **2026-08-16 记录**：从 `gt/.env` 带过来的旧令牌已失效（`curl` 直打同一端点
> 同样 401 `code: auth`，与合并无关），站主当天在 https://seo.web.cafe/kd/docs
> 重新生成并换入 `rankup/.env`，实测通过：
> `ai photo editor --gl us` → KD 60.5 困难 · 月搜 103500 · 引用域中值 130。
> 以后再遇到 401 `code: auth`，先怀疑令牌过期，不要怀疑脚本。

**KD 输出包含：**
- **难度分** (0-100) + 中文等级（极易/容易/中等/困难/极难）
- **月搜索量**（绝对值，非 Trends 的相对值）
- **品牌词/通用词** 自动识别
- **判断原因**（每条信号的加减分明细，中文）
- **链接预算**（进入前十需要多少引用域，质量型/目录型双轨）
- **前十盘面**（逐个站点的 DR、流量、年龄、是否专门经营、主力词命中）
- **新站信号**（< 18 个月的新域名已排进前十 = 赛道对新站友好）
- **上升期信号**（trend ratio ≥ 1 = 快速增长中）

**KDROI 不在 `kd` 的输出里。** `kd` 分支不产出该字段——KDROI 由本地命令
`seo-webcafe.mjs kgr` 算（纯本地、零配额，输出 `kdroi.requiredDomains` /
`invest` / `yearRevenueCap` / `roiPct`），把 `kd` 拿到的难度分喂给 `kgr` 才有。
公式与外链阶梯定价、以及 `roiPct` 的档位参照，**只在**
[`seo-webcafe.md`](seo-webcafe.md) 「本地命令数值判读指引」一节，此处不复述阈值。

**KD 关键字段怎么读（脚本只出数值，档位是判读参照不是判决）：**
- `score` 只回答「能不能打」，不回答「值不值得打」——后半个问题要看需求真实性、
  终局流量、变现路径和交付速度，见
  [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 「一·一、判据不是一个数，是五件事」。
- 看盘面而不是看分数：`details` 的域名构成才是判据。低 KD 但前十一半是社交站 =
  没人来争而不是有空位，见 [`seo-webcafe.md`](seo-webcafe.md)
  「KD『容易』而首页全是 Pinterest / Instagram」一节。
- `score` 高低配合**新站信号**（< 18 个月新域名已排进前十）一起读：新站信号在，
  说明赛道结构上对新站开放，分数偏高也未必是禁区。
- `linkBudget.quality.mid` = 优质外链中值，这是外链建设的靶子
- `details` 里 `dedicated=true` 密度高 = 正面争夺的词（不是大站顺路排的）
- `keywordTrend.ratio ≥ 1` = 有站正在靠这个词快速增长，时机窗口在

### KD 模型方法论（解读分数时参考）

每个分数都附带完整的中文判断原因。模型不只数外链——它回答的是：一个聚焦做这个词的新站，结构上有没有机会。

**基础强度**：站点强度 = 0.6×DR + 0.4×流量分（对数归一化）。普通内页 45% 折算、专门经营页面 65% 折算、首页全额，按位置加权汇总。巨头挂个内页 vs 小站押上首页，威胁完全不同，模型分得清。

**信号修正**（十余类）：弱站/弱首页出现（新站可进的直接证据）、专门经营密度（全员定制 = 正面争夺红海）、强首页密度与拥挤度、Top3 封锁、体量先验、上升期趋势（单站获词流量超年均搜索量 = 快速上升期）、盘面体验脆弱度（停留/跳出中位数）、新域名信号（< 18 个月已排进）、域名迁移识别（年轻高 DR 但搜索占比低 = DR 由旧域名 301 传递）。

**品牌词识别**：同名官方域名 + 展开式 Sitelinks + 平台型结果密度三重指纹。识别后剔除品牌本尊与平台生态页（固定位），只对可竞争位计分，回答「以衍生内容进入这个 SERP 有多难」。

**链接预算**：按 Ahrefs 官方 KD→引用域曲线插值，区分优质编辑型 / 目录收录型双轨，反推目标 DR 量级。

**体验分**：停留时间、跳出率、人均页数在本 SERP 内的相对排位（0-100）。YouTube/应用商店等平台型域名不参与对比。

## 关键约束

### Trends 侧
- **数值是 0-100 归一化的相对值**，100 = 所选范围内峰值。某小国 100 ≠ 搜索量大，只代表"占该国总搜索的比例高"。绝对量用 KD 的 `keywordVolume` 收口。
- **关键词语言要匹配地区**：查德国用德语词、查日本用日语词。用户给中文词但查英语区时，先翻译再查。
- **compare 一次最多 5 个词**；多于 5 个分簇查，同簇内才可直接比较。
- **hot 不支持 CN**（无大陆 feed），建议 TW/HK，或改用 agent-reach 查微博/百度热搜。
- **429 限流**：连续查询过快会被拒；工作流里每次调用间隔几秒，被限就等 1-2 分钟。
- 太冷门的词在小国会返回空数据——这本身就是信号（需求不足）。
- **venv 只属于归档版的 `--via pytrends` 分支**：主用 `gt.py`（新版路由）**不建 venv、不装
  依赖**，`--via pytrends` 在主用版本下直接报错并指向归档版。要用 pytrends，跑
  `python3 rankup/scripts/archive/gt-v1/gt.py <子命令> --via pytrends`，首次运行会在
  `~/.cache/gt-skill/venv` 建虚拟环境，约 30 秒。
- **懒加载：related / region 的数据不是页面一打开就有的**，新版 Explore UI 要滚动到页面
  底部、触发对应区块渲染后才会发出请求；`gt-browser.mjs` 已经把「滚动到底 → 轮询目标请求
  是否已发出」封装成可复用逻辑（`scrollUntilRpc`），超时会如实记进 manifest 的
  `scrolled`/`scrollAttempts` 字段，不会静默当成「没有数据」。

### KD 侧
- **每日额度 100 次**（Web.Cafe 登录用户），网页/MCP/API 三端共用（我们只用 API，但额度是合并计的），VIP 500 次。
- **每分钟 ≤10 次**保险丝，批量查询间隔 ≥6 秒。
- **7 天缓存**：重复查同一词秒回但仍计额度；需强制重算用 `--force`。
- **仅支持英文关键词**（API 分析的是 Google 英语 SERP）；查非英语市场用 `--gl` 切国家但词仍是英文。
- **结果是选词参考，不是排名保证**。
- 令牌从环境变量或 `rankup/.env` 读，**脚本里没有任何默认令牌**（原 `gt/SKILL.md` 写「令牌存在脚本默认值中」是错的，实现从来不是这样）。令牌获取/重置: https://seo.web.cafe/kd

## 工作流

### W1 · 小语种/小国市场竞争力探测

输入：一个产品关键词。产出：值得做的市场清单 + 内容语言决策 + 各市场难度评估。

1. **全球扫描**：`region <词> --time 12m --top 15` → 圈出 over-index 的国家（相对热度高 = 该国用户格外关心这个需求）。
2. **趋势健康度**：对每个候选国 `compare <词> --geo <国> --time 5y` → 只留上升或平稳的市场，衰退的淘汰；顺便记录季节性。
3. **语言决策**：同一国家内 `compare "本地语词" "英语词" --geo <国>` → 哪个赢就做哪种语言的内容。不要想当然——实测中印尼用户搜 "remove background"（英语）反而压过 "hapus background"（本地语）。
4. **挖本地搜法**：`related <词> --geo <国>` → rising 词往往是当地真实长尾，回填候选词表。
5. **竞争侧收口**：对幸存的候选词 `seo-webcafe.mjs kd --keyword <词> --gl <国>` → 查难度分 + 搜索量 + SERP 盘面。重点看：
   - `score` < 40 且 `keywordVolume` > 1000 = 高价值蓝海
   - 有新站信号（< 18 个月新域名排进前十）= 赛道对新站友好
   - `linkBudget.quality.mid` 决定外链建设预算

### W2 · 模糊关键词 → 可做站的 SEO 词（扩词 → 验证 → 收口）

输入：用户只给一个模糊词或产品方向（如"图片处理"）。产出：一张可执行的选词决策表。

**第一步：多角度扩词（发散）。** 调用以下 skill，各自从不同角度产出候选词，汇成 3-6 个词簇（每簇 ≤5 个词，正好一批 compare）：

- **brainstorming** → 先澄清：产品到底解决什么问题、目标用户是谁。扩词前置，防止方向跑偏。
- **marketing-psychology** → 买家心理角度的词：痛点词（"photo too blurry"）、对比词（"X vs Y"、"X alternative"）、决策词（"best X"、"X free"）。
- **marketing-ideas** → 使用场景/人群角度的词：不同职业、不同平台、不同用例的搜法。
- **ai-seo** → 问句型和 AI 搜索引擎偏好引用的 query 形态（"how to X without Y"）。

**第二步：用 Trends 验证趋势（收敛需求侧）。**

1. 每簇 `compare ... --time 5y`：淘汰长期衰退的词，标注上升词。
2. 对幸存词 `related`：rising 列表里常有比原词更好的变体，发现了就回填词簇再比一轮。
3. 对最终幸存词 `region`：标注每个词的机会市场（可衔接 W1 深挖）。

**第三步：用 KD 验证难度（收敛竞争侧）。**

对通过趋势筛选的词逐个 `seo-webcafe.mjs kd --keyword <词>`（注意每分钟 ≤10 次限流，间隔 ≥6 秒）：

1. `score` > 70 且无新站信号的词先降权——但别只看这个数，翻 `details` 的域名构成
   确认是「老站围死」还是「社交原生意图」，两者对新站的含义不同。
2. 标注有新站信号的词（即使 score 偏高，新站已证明可入场）。
3. 对比同簇词的 `keywordVolume`，选搜索量和难度最优组合。
4. 记录 `linkBudget` 作为外链建设的量化目标。

**第四步：交付决策表。**

| 词簇 | 代表词 | 趋势(5y) | 月搜索量 | KD 难度 | KDROI | 新站信号 | 链接预算 | 建议 |
|---|---|---|---|---|---|---|---|---|

（KDROI 列的数值来自本地 `kgr`，不是 `kd` 的输出，要单独跑一次。）

建议列不是套阈值算出来的，是判读出来的。三个输入各自的口径：

- **KDROI 的档位参照**见 [`seo-webcafe.md`](seo-webcafe.md)「本地命令数值判读指引」
  的 `roiPct` 那几行——**注意那里的口径比直觉严**，不要照着「>100% 就是高回报」下结论。
- **KD 分数**只答「能不能打」，且要配 `details` 域名构成与新站信号一起读（见上文
  「KD 关键字段怎么读」）。
- **值不值得打**是另一个判断：需求真实性、终局流量、变现路径、交付速度，见
  [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md)「一、选词：低 KD 不等于能做」。

只有三项都指向同一个方向才写 ✅；任一项存疑写 ⚠️ 并记下存疑点；明确不划算
（外链投入回不来）、盘面进不去、或月搜索量低到撑不起终局流量，写 ❌。

选定词后建站阶段 → **seo-geo**（站内优化、schema、传统+AI 搜索）和 **ai-seo**（被 LLM 引用的内容策略）接棒。

> 这些 skill 不可用时（比如换了环境），自己顶上做扩词即可，角度不变：痛点/对比/场景/问句四个方向。

**2026 AI 搜索补充**（详见 [`seo-growth.md`](seo-growth.md) section 三-B）：选词时除了传统 KD/SERP 分析，还要考虑 AI 引用可能性。Google 官方指南（2026-05-15）明确：只有「非大众化内容」——一手评测、原创数据、亲历经验——才会被 AI 引用。泛泛的信息摘要 AI 自己就能生成，不会引用你。这对选词的影响是：**偏工具/体验型的词比纯信息型的词更有 AI 引用价值**，因为工具本身就是「非大众化内容」。

### W3 · 新兴趋势捕捉

- `related` 的 **rising 列表是最强信号源**：+several-thousand-% 的词 = 正在起飞的需求。
- 疑似新词 `compare <新词> <类目老词> --time 12m` → 判断是昙花一现还是持续爬坡（连续 3 个月以上抬升才算数）。
- 对确认上升的词 `seo-webcafe.mjs kd --keyword <词>` → 如果 `keywordTrend.ratio ≥ 1` 且 `score` < 50，这是最佳时机窗口。
- `hot` 只用于时效性话题，不作为选词依据。

## 输出处理

脚本输出 markdown 表格，可直接引用。回答用户时：

1. 先给结论（谁更火、趋势方向、哪个市场有机会、难度是否可接受），再贴数据表。
2. compare 指出峰值和拐点（脚本末尾已给峰值行）；解读时提醒数值是相对值。
3. KD 结果重点解读：难度等级 + 新站信号 + 链接预算 + 最弱竞争者是谁（用户的锚点）。
4. 工作流产出优先用 W2 的决策表格式，让用户能直接行动。
5. 用户要图表时，用已有输出数据画，不要重复查询。


## 短时窗口：用 Trends 的「过去 1 小时 / 4 小时 / 1 天 / 7 天」验证刚出现的新词

Semrush / Similarweb 这类面板只有最近 28 天口径，昨天才火的词在那里要么是 0 要么是上个月的老量。
Google Trends 的 `now` 区间是唯一能看到**小时级**曲线的公开源，`gt.py` 从 3.1.1 起直接支持：

```bash
GT=<rankup-skill-dir>/scripts/gt.py
python3 $GT compare "<新词>" --time 1d            # 过去 24 小时，8 分钟一个点
python3 $GT compare "<新词>" --time 4h            # 过去 4 小时，1 分钟一个点
python3 $GT compare "<新词>" --time 1h            # 过去 1 小时
python3 $GT compare "<新词>" --time 7d --raw      # 过去 7 天，小时级
python3 $GT related "<新词>" --time 1d            # 这 24 小时里跟它一起被搜的 rising 词
python3 $GT compare "<新词>" --geo JP --time 1d   # 按国家看
```

标签页打开的就是这次查询的 explore 页（`explore?date=now 1-d&q=openclaw&geo=…`），趋势图和你肉眼看到的一致；取数走页内接口。

2026-09-03 实跑：`compare openclaw --time 1d` 拿到 24 小时 180 个点（63、65、62…），`compare chatgpt --time 4h` 拿到分钟级点。
时间戳是 UTC（列里带 `Z`），判读时换成目标市场的本地时区再看「几点起来的」。

**四条判读纪律（都是实跑撞出来的）：**

1. **新词单独查，或只和同量级的词同框。** 同一次 `compare` 里数值按区间内峰值归一化到 0–100，
   `compare chatgpt openclaw --time 7d` 里 openclaw 全程是 0——不是没人搜，是被 chatgpt 压扁了；
   单独 `compare openclaw --time 1d` 立刻看到 60 上下的曲线。要比规模用 `region` 或分别查再看绝对趋势形状。
2. **`now` 区间的 100 只是「这几小时里的峰值」，不代表量大。** 一个日搜 50 次的词在 4h 窗口里也能画出漂亮的 100。
   短时窗口回答的是「有没有在起来、什么时候起来的」；量的问题回到面板与 `seo-webcafe.mjs kd`。
3. **全 0 先看证据目录再下结论。** `gt-browser` 每次都落 `.rankup/evidence/gt-browser-<ts>/`（JSON + 截图 + manifest）；
   consent 弹窗、限流插页、未登录都会给一条全 0 的曲线，与「真没人搜」在接口上同形。
4. **别连着打。** 同一分钟内跑 5 条查询，第 5 条 `compare chatgpt --time 1h` 回了 `multiline_429`（Trends 接口限流）。批量时每条之间隔 10 秒以上，撞 429 等一分钟再来，不要换关键词硬试。
5. **用法定位：它是社区验证那条腿的第三根手指。** 调研 playbook 阶段 5 的口径是「Reddit / X / YouTube / B 站近 14 天」，
   Trends 短时窗口补的是「近 24 小时到 7 天的搜索侧信号」；两边都起来才算新起话题，只有社区起来是讨论热，只有搜索起来要去看是谁在推。


## 新版接口勘探（2026-09-09）

Google Trends 新版 Explore UI（`https://trends.google.com/explore?...`）不再暴露旧版那套
公开可读的 widget REST 接口（`/trends/api/explore` + `/trends/api/widgetdata/*`）。**实测确认**：

- **URL 参数编码不变**：`q`（逗号分隔关键词）、`geo`、`date`、`hl` 三个跟旧版完全一致，
  实测 `?q=higgsfield&geo=US&date=today 5-y` 在新版页面上正确显示成 "United States · Past
  5 years"。`cat`（类目）、`gprop`（搜索类型）沿用旧版参数名，未逐一单独实测，标记为
  【推测：沿用旧版命名】。
- **取数机制换成了 Google 通用的 `batchexecute` RPC 框架**：所有 widget 数据都走
  `POST https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=<ID>&f.sid=...`，
  响应是 `)]}'` 反 XSSI 前缀 + 分块编码，真正数据在 `["wrb.fr","<rpcid>","<JSON 字符串>",...]`
  三元组里，且是**双重 JSON 编码**（要 `JSON.parse` 两次）。请求体（`f.req`）里带一段
  ~2500 字符的签名 blob（【实测】用页面上下文抓过一次真实请求体核对过），推断是服务端
  为这次查询状态签发的 token，本工具**不重建这段请求**，而是打开这次查询本身的 explore
  页，让页面自己把请求发出去，从**页面自身**读回去（见下一条），数据来源仍然是
  「用户已登录 Chrome 亲自发起的同源请求」。
- **取数点（2026-09-09 二次修订）：从「读 opencli 网络记录」改成「页面内 fetch/XHR
  抓包」，region 改成 DOM 解析**。最初实现靠 `opencli browser <session> network` 读取
  「已经发生的请求」，这条命令在本机【实测】反复返回空列表（用非 Trends 站点也复现过），
  见下方「已解决问题」。改用的办法：在页面上下文里包一层 `window.fetch` /
  `XMLHttpRequest`，把命中 `batchexecute` 的请求体/响应体存进 `window.__gtCapture`，
  再用 `eval` 把这个数组读出来解码（`gt-browser.mjs` 里的 `INSTALL_CAPTURE_JS` /
  `pollCapture`）。**但这条路对 `qrLOJd`（地区分布）几乎必然抓不到**——【实测反复验证】
  `qrLOJd` 几乎总是在 `open` 命令返回、抓包壳子装上之前就已经发出并完成，不是「时序竞
  争偶尔输」，是这个 widget 的请求天生比任何「open 之后再 eval」的时序都快。所以
  `region` 命令**不走抓包，改走 DOM 解析**：地区列表本身渲染在 `tr[data-geo-code]`
  表格行里（`aria-label="kw: N"` 单关键词，或 `"kw1: N%, kw2: M%"` 多关键词——后者是
  「同一地区内几个词的相对份额，和为 100」，语义跟旧版/单关键词的独立 0-100 值不同，
  已经在 `region` 输出里加了这条注），滚动可见后直接读 DOM，配合
  `button[aria-label="Go to next page"]` 翻页凑够 `--top N`。`compare`（`g4kJzf`）和
  `related`（`fXqlme`）两个 widget 会在抓包壳子装上之后才发请求，走抓包路由，manifest
  里记 `dataPath: capture`（region 记 `dataPath: dom`）。
- **抓包也不是 100% 稳**：【实测】即使是 compare/related，个别整页加载仍会在壳子装好前
  把请求发完——同一份代码同一个查询，多次真实运行里观察到的样子是「反复调大单次等待
  没用，但整页重开常常就好」，猜测是 JS bundle 命中浏览器缓存后执行快到抢先。因此重试
  策略是**重开整页**（最多 4 轮，`openRounds` 记进 manifest），不是加长单次超时——
  4 轮下让「每轮独立约 50% 概率被抢跑」的失败率压到个位数百分比，仍不够就如实报空，
  证据目录里的截图能证明「页面数据其实是好的，只是没抓到请求」。
- **实测确认的三个 rpcid**（higgsfield / manus 两词反复验证，拿到真实数据后解出结构）：
  - `qrLOJd` = 地区热度分布（interest by region）——**不走抓包，走 DOM 解析**，见上。
  - `g4kJzf` = 热度对比曲线（interest over time）。响应结构比最初勘探记的**多包一层**
    【实测，二次核对修正】：`[[[keyword, ?, ?, ?, [[value, roundedValue,
    [[startEpoch],[endEpoch]], flag, ?], ...]], ...]]`——外层是只有一个元素的数组，
    包着「每关键词一条」的那个数组；脚本对两种形态（多包一层 / 不多包）都做了兼容解包。
  - `fXqlme` = 相关查询（top + rising）。响应结构：`[[keyword, arrayA, arrayB]]`，只支持
    单关键词。**Top/Rising 映射已从【推测】转【实测】**：在页面 DOM 上直接核对过区块标题
    文字——「Top queries」区块 = 0-100 常规相关度 + 涨跌幅列（对应 `arrayB`/`entry[2]`），
    「Rising queries」区块 = 全部标 Breakout/百分比涨幅（对应 `arrayA`/`entry[1]`，value
    大量逼近/等于 5000 是封顶哨兵），跟经典 Google Trends API 的语义一致，不再是推断。
  - 另有 `UZBRtc`（4-5MB，推测是地图色块的几何数据，不取）、`DqDTgb`/`Tnt4U`（初始加载即触发，
    推测是 widget 配置/token 引导调用，未解出结构，不在取数路径上）——都标记为【推测】。
- **懒加载不止 related 一项，但没有统一规律**：【实测，反复验证】`qrLOJd`（地区分布）
  初始加载几秒内即触发，不需要滚动；`fXqlme`（相关查询）明确需要真实滚动到底才触发；
  `g4kJzf`（热度曲线）【实测，二次修正】大多数情况下**不需要滚动**，settle 等待期间
  （抓包壳子装好后几秒内）就会自己发出，脚本因此对 compare 不再做滚动等待，只做一次性
  轮询+失败重开整页（见上），对 related 仍然做「真实滚动（`opencli scroll`，不是
  `eval` 硬改 `scrollTop`）→ 轮询抓包壳子里出现目标 rpcid」。**`eval` 硬改
  `div.scrollTop` 在这版新 UI 上被证伪**：赋值后经常原样弹回、不触发任何懒加载，
  必须用 opencli 的 `scroll` 命令（真实滚轮事件）才能移动视口。
- **已解决问题（原「未解决问题 2」，opencli 侧）**：`opencli browser <session> network`
  这条读取命令在本次勘探中【实测】反复出现「页面上数据其实已经正确渲染出来了（截图能
  看到真实的 region 列表 "1-5 of 87"），但 `network --since` 列出的 entries 是空的」——
  用同一批 fetch/XHR 打非 Trends 的站点（`httpbin.org`）复现过同样的空结果，说明这不是
  Trends 专属问题，是 opencli 网络抓包本身不稳定。**解法**：不再依赖 `network` 命令，
  改成页面内 fetch/XHR 抓包（compare/related）+ DOM 解析（region），两条路都不经过
  opencli 的 CDP 网络记录层，绕开了这个不稳定点。
- **未解决问题（Google 侧，遗留）**：勘探期间（连续对同一批关键词打了十几次 explore 页
  之后）新版页面出现过"连查询词的 chip 都长时间不渲染"的卡滞现象，怀疑是触发了 Google
  对该账号/网络的软限流或异常检测，性质与旧版遇到 429 类似，但表现不是标准 HTTP 429，
  而是页面停在加载态。**这不是本工具的 bug**，意味着短时间内高频调用新版路由可能被
  降级，工作流里要控制调用频率、间隔几秒到几十秒，撞上就等几分钟。
- **已知限制**：region 命令翻页读 DOM 时用 `--role button --name "Go to next page"
  --nth 0` 定位翻页按钮，假定它在 DOM 里排第一个（因为地区表格通常先于「Commonly
  searched queries」的翻页按钮挂载）。`--top` 传得很大、需要翻很多页、且页面在翻页
  期间又新挂载了别的分页控件时，`--nth 0` 可能定位到错的按钮——`--top 15` 这种常规
  用量下（3 页以内）没观察到这个问题，大批量用量下如果 region 输出行数不对，先怀疑这里。
- **未解决问题（related 命令，最不稳的一个，2026-09-09 收尾时仍未彻底解决）**：
  `related` 同时踩了两个坑——(1) `fXqlme` 抓包和 `qrLOJd` 一样有概率被"原生 fetch/XHR
  引用抢跑"问题命中（不是每次，命中率没有精确测出，实测中反复出现过）；(2) 更麻烦的是
  【实测，2026-09-09】**opencli 的 `scroll` 命令本身在部分整页加载里完全不生效**——
  连续多次 `scroll down --amount 5000`（含 `--window foreground`）后，用
  `document.querySelectorAll('h3')` 探测都拿不到「Top queries」/「Rising queries」
  标题，说明「Commonly searched queries」区块压根没被触发挂载；但同一个会话换个方式
  等待更长时间后，标题**有时**会自己挂载出来（`h3count` 从 0 变成 2），挂载之后
  内部的查询行仍可能长时间保持空表格（`tr` 只有表头，没有数据行）。这三层现象叠加
  （抓包抢跑 / 滚动不生效 / 挂载后仍空表）导致 `related` 目前在自动化里是**三条命令
  里最容易拿到空结果的一个**，即使页面本身最终会正常渲染出数据（本次收尾验证中，
  同一个 `higgsfield` 单词在更早的手工探测里明确渲染出过真实的 Top/Rising 词表，
  证明数据链路整体是通的，问题在自动化触发的时序/可靠性上，不是取数逻辑错了）。
  `gt-browser.mjs` 已经做了两层兜底（抓包失败 → DOM 兜底 → DOM 也空则如实报错 +
  留证据目录），但**没有把成功率提到可接受水平**——**这是本轮遗留给下一次迭代的
  头号问题**，建议方向：查 opencli `scroll` 命令在这类虚拟滚动（`overflow:auto` 但
  `scrollTop` 赋值不生效）页面上到底是怎么派发事件的，或者换成能强制组件挂载的其它
  手段（如缩小视口高度、编辑 CSS 强制展开、或直接等一个更长的固定时长再探测）。

## 旧版 explore 页每一块与归档版 gt.py 的对应（2026-09-03 逐块实跑，仅归档版适用）

| explore 页上的块 | 命令 | 状态 |
|---|---|---|
| 热度曲线（Interest over time） | `compare KW…`，`--time` 全部档位含 1h/4h/1d | ✅ 实跑；now 区间分钟/8 分钟级 |
| 地区分布（Interest by region） | `region KW…`，`--resolution country\|region\|city` | ✅ 实跑；`city` 对小词常为全 0（Google 就是没给），不是命令坏了 |
| 相关查询（Search queries：Rising / Top） | `related KW` | ✅ 实跑 |
| 相关主题（Search topics：Rising / Top） | `related KW` 的「相关主题」段 | ❌ **拿不到**：接口把脚本会话标为 `USER_TYPE_SCRAPER`，`RELATED_TOPICS` 恒回空 `rankedList`；把 userType 改成 LEGIT_USER 会 401（token 绑定）；后台标签页里 DOM 也不渲染。相关主题是 Google 的实体归并，`related` 的相关查询已覆盖绝大多数用法；确实要主题时让用户在前台标签页里看 |
| 地区 / 时间 / 类目 / 搜索类型四个下拉 | `--geo`、`--time`、`--category N`、`--property web\|images\|news\|youtube\|shopping` | ✅ 实跑（`--property youtube`、`--category 5` 的 explore URL 与取数都对上） |
| Trending Now（每日热搜） | `hot --region US` | ✅ 实跑 |
| 多词对比（最多 5 个） | `compare A B C` | ✅ 实跑；标签页 URL 带全部关键词；**归一化按同框峰值**，大小词别同框 |

标签页打开的是这次查询本身的 explore 页（带 q / date / geo / cat / gprop），取数走页内接口，证据落 `.rankup/evidence/gt-browser-<ts>/`（原始 JSON + 截图 + manifest）。上表描述的是**旧版**（`archive/gt-v1/`）行为；新版路由（主用）见上一节「新版接口勘探（2026-09-09）」。
