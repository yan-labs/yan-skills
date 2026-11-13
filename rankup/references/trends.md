
# 趋势查询、量级校准与测量工作流

> 本文原为独立的 `gt` Skill，2026-08-16 并入 `rankup`。
> 本文是 GT 趋势、量级校准、新词与失败口径的唯一源；基础查询与 W1/W2/W3 只负责采集和测量。
> 端到端顺序与业务裁决只见 [entry.md](playbooks/entry.md)；问法链路见 [seo-geo.md](seo-geo.md)，逐问法 Google 读法见 [seo-serp.md](seo-serp.md)。
> 旧标题中的「必须双锚」「有搜索量」「竞争力」保留作兼容入口，含义以正文测量口径为准。

**触发面注意**：合并前 `gt` 有自己的触发词（谷歌趋势、热搜、"这两个词哪个火"）。
现在这些请求要经由 `rankup` 才能到达本文，`rankup` 的 description 已补上这批词。
纯查热度、跟建站无关的问题也照样加载 `rankup` 再读这一篇。

## 目录

- [〇、Trends 只给形状，不给量——必须双锚换算，且要地理对齐](#〇trends-只给形状不给量必须双锚换算且要地理对齐)
- [〇·五、对比是全组连坐：一个词太冷，整组返回「没有数据」](#〇五对比是全组连坐一个词太冷整组返回没有数据)
- [〇·六、锚点体量的选择：Semrush 月量的交叉验证是硬规则](#〇六锚点体量的选择用中等量词作锚细分词才能看清形状semrush-月量的交叉验证是硬规则不是可选步骤)（默认锚点、换锚、误差区间、[gpts 基线判读表](#gpts-基线判读到底怎么才算有搜索量唯一判据源)、方向性偏差）
- [核心概念](#核心概念)
- [基础查询](#基础查询)（取数路由：新版 Explore UI 与旧版归档）
- [关键约束](#关键约束)
- [工作流](#工作流)（W1 小语种探测 / W2 扩词验证 / W3 新兴趋势）
- [输出处理](#输出处理)
- [短时窗口](#短时窗口用-trends-的过去-1-小时--4-小时--1-天--7-天验证刚出现的新词)
- [新版接口勘探（2026-09-09）](#新版接口勘探2026-09-09)
- [旧版 explore 页每一块与归档版 gt.py 的对应](#旧版-explore-页每一块与归档版-gtpy-的对应2026-09-03-逐块实跑仅归档版适用)

## 〇、Trends 只给形状，不给量——必须双锚换算，且要地理对齐

**Google Trends 的 0-100 是组内归一化，没有单位。** 它可能对应每月 100 次搜索，
也可能是 10 万次。单独引用一条 Trends 曲线得不出任何可执行结论。

### 换算方法：同组放入已知绝对量的词当锚

默认比较、折量与第二锚复核统一按下方 [gpts 基线判读](#gpts-基线判读到底怎么才算有搜索量唯一判据源)。以下双锚例子保留为校准证据，两个锚给出的系数之差可提示换算误差。

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

地理与锚点口径统一见 [gpts 基线判读](#gpts-基线判读到底怎么才算有搜索量唯一判据源)，不把全球曲线直接配美国月量。

### 三个工具的分工（缺一条就得不出可用结论）

| 工具 | 提供什么 | 证据用途 |
|---|---|---|
| Google Trends | 时间形状、相对关系、季节性 | 趋势与相对量级测量 |
| 关键词工具（注明国家/全球库） | 绝对月量与来源日期 | 校准、交叉核对；估算不当实量 |
| 流量面板 | 同类站访问与渠道 | 按需补背景；不能代替搜索量或推荐证据 |

测量完成后的验证顺序只见 [entry.md](playbooks/entry.md)。

## 〇·五、对比是全组连坐：一个词太冷，整组返回「没有数据」

【实测】五个品牌词一起跑返回「没有数据」；逐个单跑，其中多个都有数据，且分开写的变体峰值反而更高。这是整组失败的观察，不推断所有空结果都由冷词造成。

| 顺序 | 处理 | 记录 |
|---|---|---|
| 1 | 看 manifest、HTTP 状态与页面错误；用已知有数据的参考词复核管道 | Oops、429、302、会话/解析错误是取数失败，不是无需求 |
| 2 | 逐个单跑，隔离组内缺测词；单跑方法见下方基线节 | 区分取数失败、样本不足与量级失配 |
| 3 | 有可读数据再同框，必要时换同量级锚 | 分组及窗口原样记录；不同组的指数不能直接拼接 |
| 4 | 单跑仍不足 | 记「Trends 无法分辨」；失败不记 0，折量与面板保留方式见基线节 |

## 〇·六、锚点体量的选择：用中等量词作锚，细分词才能看清形状（**Semrush 月量的交叉验证是硬规则，不是可选步骤**）

**不同体量的锚点给出完全不同的细分词形状。** 用超大词（如 `ai image generator`）作锚时，细分词会被压到曲线底部 0–1 的噪声区间，根本看不出涨跌态势；用太小的锚则误差过大，换算系数不可信。

月量交叉验证、换锚与误差统一按 [gpts 基线判读](#gpts-基线判读到底怎么才算有搜索量唯一判据源)。本节保留历史实测，不能把旧业务量档当放行线。

### 锚点本身不稳定，这是【实测】结论，不是【猜测】

**修订**：本节此前把 `gpts` 标注为「体量中等且相对稳定，不会因单点事件剧烈波动」，是未经验证的【猜测】。2026-09-09 用 Semrush（US 单点量）+ Google Trends（52 周曲线）对 `gpts` 做了完整实测，结论相反：

- **美国月搜索量基准：`5,400`**（Semrush 实测，2026-09-09，KD 77，CPC $0.05）——比早前【猜测】的「约 5K」高约 8%，基本吻合，这个绝对值本身可以采信。**`byCountry` 里 NO/NZ 两国都报 90,500 是异常值**（两国数字完全相等，且 12 个月趋势里有 6 个月卡在同一个封顶值 100），判定为 Semrush 估算口径异常，不能用；全球量（Semrush 201,900 / Similarweb 268,200）本身也应打折扣看待。
- **12 个月曲线不是平线，是一次完整的涨落周期**：起点（2025-09~10）37–46 的低位 → 快速爬升 → 高原期（2026-01~06）61–100（6 次触及 90+，2 次打满 100）→ 明显回落（2026-07~09）26–68，且逐周下滑。**最近 8 周均值只有 32.8，只有全年均值 67.8 的 48%**——如果这个时间点临时拉一次 `gpts` 当锚点、只看最近几周的读数，会把它自己的低谷误算成候选词偏冷的信号。
- **换算系数对校准窗口极其敏感**：用「全年 12 个月均值」（67.8）校准得到 1 指数点 ≈ 79.7 次/月；换成「最近 8 周均值」（32.8）校准，系数跳到 164.9/点，**相差 2.07 倍**。同一批候选词，两种校准口径下的偏差倍数从 0.31–1.40x 挪到 0.43–0.86x——差出接近一倍，足以把「疑似低估」翻成「基本吻合」。

### 换锚：大词小词不能同框，同量级选第二锚点

换锚条件与复核方法见下方基线节；历史实测第二锚例子是 `virtual staging`（US 4,400）与 `ai ad generator`（US 1,900），不是当轮量值。

### 折算结果只能当区间读，不能当精确值用

区间、分辨率与缺测记录统一见下方基线节。

### gpts 基线判读：到底怎么才算「有搜索量」（唯一判据源）

**本节只定义测量，不定义立项票**；选词与立项判据只见 [entry.md「选词判据：只看两个」](playbooks/entry.md#选词判据只看两个)。旧锚点 5,400 与默认衡量标准 5,000 分开记录，不能冒充当轮实测。

| 项 | 当前测量口径 |
|---|---|
| 默认参考 | `gt.py compare` 默认追加一个 `gpts`，已有则不重复；超过四个候选词按「四候选 + gpts」分批，每批独立判读，不拼接归一化指数。`region` / `related` / `hot` 不追加比较词。 |
| 取消默认参考 | 用户显式 `--no-gpts` 时只查传入词，输出「未同框 gpts（用户显式 --no-gpts）」且没有基线判读块；单跑隔离或新词短窗可用该例外，原因写入 GT 卡。 |
| 地理与窗口 | 同框词用同 geo、同时间窗；留空 geo 为全球。指数 0–100 是组内归一化，100 只是窗口峰值，不是搜索次数。 |
| 相对比值 | r = 同框候选周读数算术均值 ÷ gpts 周读数算术均值；输出 r（三位小数）、两词均值和窗口。gpts 有周期，窗口均值不能冒充全年均值。 |
| 月量参考 | gpts 约 5,000/月是用户衡量标准，脚本锚点优先 `--anchor`、其次 `RANKUP_GPTS_ANCHOR`、默认 5000；这不是实时月量。默认只有 US 折月量；全球与非 US 只比相对大小。显式 `--anchor` 为非 US 折量的例外，须提供同市场锚点依据，不能借美国量。 |
| 区间 | 可折量时月量约 r × 锚点，按 ±35% 报区间、百位四舍五入；这是粗估，不能当精确值或业务门槛。 |
| 当轮校准 | 引用面板月量时交叉核对：重取目标国家锚点月量与最近 12 个月曲线，用全年均值校准；未取到才沿用最近有效值，标来源日期与「未重取」。脚本默认窗口估算与全年校准分列，不能互换。 |
| 第二锚 | 量级差超过约 10 倍、候选或锚点被压到个位数、折量与面板冲突时，拆组并用同量级且有同市场绝对量依据的第二锚复核；只报可辨区间，找独立来源交叉核对。 |
| 无法分辨 | 候选全 0 或 12 个月多数月份为 0，记「低于展示分辨率 / Trends 无法分辨（≠ 零搜索）」，不拿 0 算月量；gpts 缺失/均值 0 则无法判读，不编造 r。整组空先按〇·五排查。 |
| 面板与合并量 | Trends 判不了时保留有来源的面板数；没有可用量写「未知 / 待验证」。多个近义词月量完全相同且曲线一致时标疑似合并量，不能加总成独立短语量；单短语核验入口见 [checklists.md](checklists.md#主词与域名用词实测闸门)。 |
| 新词例外 | 出现不足 12 个月按 [短时窗口纪律](#短时窗口用-trends-的过去-1-小时--4-小时--1-天--7-天验证刚出现的新词)；单查或仅与同量级词比较时显式 `--no-gpts`，避免默认参考压扁曲线。记录出现时间及 7 天/30 天等实际窗口，不用出现前的 0 拉低全年 r，不把短窗折成月量。 |
| 趋势形状 | 看候选自身，记录上升、平稳、缩量、季节性或脉冲；平稳可以保留，不要求连续上涨。新词/前期均值 0 不算全年缩量比，形状不承担淘汰。 |

| 同框 r | 脚本判读 | 含义 |
|---|---|---|
| r > 1.35 | 大于 gpts 量级 | 同窗口相对均值更高 |
| 0.65 ≤ r ≤ 1.35 | 约等于 gpts 量级（区间重叠） | 按现有 ±35% 容差比较 |
| r < 0.65（且候选均值非 0） | 小于 gpts 量级 | 同窗口相对均值更低，不能称「无量」 |
| 候选或 gpts 缺测 / 全 0 | 无法判读或低于展示分辨率 | 保留缺项，不记零需求 |

【经验·起步阈值】（2026-09-30；已被取代）旧 0.5/0.25/0.1 量档、CPC/付费例外及缩量 0.7/0.5 线曾用于业务放行；缩量线无对照实验，本批退出现行流程，不保留可执行裁决表。当前相对档位与 ±35% 来源是 2026-10-03 脚本约定，非市场成功率验证。

### 已验证的交叉核对价值：Semrush 的方向性偏差

【实测，2026-09-09，两次独立锚点法互相印证】：

- **头部通用新词，Semrush 容易高估**：`ai headshot generator` Semrush 报 US 月量 22,200，用 `gpts` 锚点折算只有 0.07–0.18 倍（换两种校准窗口都稳定落在这个区间）；另一批锚点（`virtual staging`/`ai ad generator`）折算也只有 0.18x。两次锚点完全独立，结论方向一致，是本轮唯一「不再是方法论噪声，可以下结论」的发现。
- **冷门新方向词，Semrush 容易低估**：`ugc ads ai` Semrush 报 210，折算区间 1.4–3.3 倍（不同锚点给出的幅度差较大，但方向一致）。
- 【经验·历史判读】当时把偏差 0.5x–2x 看作基本吻合；不同锚重复验证方向一致时调整量估计。当前只据此提示测量冲突，校准方法按上文基线节，不恢复业务定档。

### 取数路径

先在 Google Trends 上单独查锚点在目标国家过去 12 个月的曲线，确认它现在处于曲线的哪个阶段（不要求平线，只要求知道自己在哪）；主用新版 Explore UI 路由（`scripts/gt.py`），命中〇·五的「热度曲线为空」间歇性故障或撞 429 限流时，退避重试，仍不行才切归档版 `scripts/archive/gt-v1/gt.py --via pytrends`（同样会撞 429，是常态不是异常，加长退避到 150–240 秒陆续能跑通）。两条链路都要留着——新版接口失效时旧版就是唯一的取数兜底。

## 核心概念

本文回答「曲线形状、相对量级与测量是否可靠」。业务判读只见 [entry.md](playbooks/entry.md)；ChatGPT 问法与 Google 结果页的方法分别只见 [seo-geo.md](seo-geo.md) 和 [seo-serp.md](seo-serp.md)。

## 基础查询

| 用户想要 | 子命令 | 数据源 |
|---|---|---|
| 热度对比 / 趋势曲线 / "XX 和 YY 哪个火" | `compare` | opencli 驱动新版 Explore UI |
| 地区分布 / "哪个国家搜得多" | `region` | opencli 驱动新版 Explore UI |
| 相关词 / 飙升查询 / "大家搜 XX 时还搜什么" | `related` | opencli 驱动新版 Explore UI |
| 今日热搜 / "美国现在在搜什么" | `hot` | opencli |
| 月量或其他工具读数补充 | 官方 `gefei` / `gefei-keywords` Skill，调用口径见 [seo-webcafe.md](seo-webcafe.md) | 官方工具 |

**付费备选 / 交叉核验**：加载官方 `gefei` Skill，通过官方 CLI 调用 `google_trends`；用于 W1/W2 候选曲线对比或 W3 新词复核，共享缓存优先，附「是不是新词 / 处于什么时期」的测量说明，省浏览器会话。`--keyword` 加 `--compare` 合计最多 5 词，`--range 7d/30d/90d/12m/5y`、`--geo`（不传为全球）；`--related true` 仅用于单词查询，不能与多词对比同用。`gt.py` 仍是零配额主线，地区分布、热搜及 1h/4h/1d 短时窗口仍走它；API 的曲线读数与锚点处理按上文基线节，后续验证只见 [entry.md](playbooks/entry.md)。价格以实时 `tools` 目录为准，保存原始结果与 `credits.charged`。

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
| 新版（**主用**，`gt.py` 默认） | OpenCLI 打开新版 explore 页，然后**在这个页面的上下文里同源打旧版 REST 接口**（`api/explore` + `api/widgetdata/{multiline,comparedgeo,relatedsearches}`）；兜底才是读页面自己发出的 `batchexecute` RPC / 表格 DOM（见下方「新版接口勘探」） | 主用。要求 `opencli doctor` 绿 |
| 旧版 browser（归档） | OpenCLI 打开旧版 `/trends/explore`，在页面上下文里 fetch `api/explore` + `api/widgetdata/*` | 归档兜底，`archive/gt-v1/` |
| 旧版 pytrends（归档） | 匿名 HTTP 打旧版 widget 接口，无凭据，429 是常态 | 仅归档版支持，新版路由不再提供 `--via pytrends`（会报错并指向归档版） |

`hot` 一直走 `opencli google trends` adapter，跟新旧版 Explore 切换无关，两边行为一致。

### Trends 查询（compare / region / related / hot）

脚本位于 `scripts/gt.py`（以下示例用 `$GT` 代指，实际执行时替换为本 Skill base directory + `/scripts/gt.py`）：

```bash
python3 $GT <子命令> [关键词...] [选项]

# 热度对比（默认同框与分批口径见上文基线节；>30 行自动按月聚合）
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

兼容旧入口；工具调用只见 [seo-webcafe.md](seo-webcafe.md)，读数在裁决中的处理只见 [entry.md](playbooks/entry.md#选词判据只看两个)。

### KD 模型方法论（解读分数时参考）

兼容旧入口；模型读数口径只见官方 `gefei-keywords` Skill，业务判据只见 [entry.md](playbooks/entry.md#选词判据只看两个)。

## 关键约束

### Trends 侧
- 数值、地理、绝对量与失败口径统一见上文基线节；`region` 的相对热度不等于当地绝对搜索量。
- **关键词语言要匹配地区**：查德国用德语词、查日本用日语词。用户给中文词但查英语区时，先翻译再查。
- compare 的默认分批与新词例外见上文基线节。
- **hot 不支持 CN**（无大陆 feed），建议 TW/HK，或改用 agent-reach 查微博/百度热搜。
- **429 限流**：连续查询过快会被拒；工作流里每次调用间隔几秒，被限就等 1-2 分钟。
- 空数据的排查只按〇·五，不能由空结果推出需求不足。
- **Trends 只反映 Google 搜索侧**：不与 AI 对话需求作固定倍数换算；后续主链只见 [entry.md](playbooks/entry.md)。
- **venv 只属于归档版的 `--via pytrends` 分支**：主用 `gt.py`（新版路由）**不建 venv、不装
  依赖**，`--via pytrends` 在主用版本下直接报错并指向归档版。要用 pytrends，跑
  `python3 rankup/scripts/archive/gt-v1/gt.py <子命令> --via pytrends`，首次运行会在
  `~/.cache/gt-skill/venv` 建虚拟环境，约 30 秒。
- **懒加载：related / region 的数据不是页面一打开就有的**，新版 Explore UI 要滚动到页面
  底部、触发对应区块渲染后才会发出请求；`gt-browser.mjs` 已经把「滚动到底 → 轮询目标请求
  是否已发出」封装成可复用逻辑（`scrollUntilRpc`），超时会如实记进 manifest 的
  `scrolled`/`scrollAttempts` 字段，不会静默当成「没有数据」。

### KD 侧

兼容旧入口；官方工具调用、价格与空值口径只见 [seo-webcafe.md](seo-webcafe.md)，业务判据只见 [entry.md](playbooks/entry.md#选词判据只看两个)。

## 工作流

### W1 · 小语种/小国市场竞争力探测

输入：产品关键词。产出：各国与语言的测量候选表；市场和内容语言规划只见 [stage-2-positioning.md](lifecycle/stage-2-positioning.md)。

| 步 | 采集动作 | 记录与移交 |
|---|---|---|
| 1 全球扫描 | `region <词> --time 12m --top 15` | 相对热度高的国家是线索，仍需当地量与来源 |
| 2 趋势形状 | 各国 `compare <词> --geo <国> --time 5y` | 记录涨跌与季节性；校准按基线节，不按衰退淘汰 |
| 3 语言比较 | 同一国家 `compare "本地语词" "英语词" --geo <国>` | 记录实际搜法；同语言的不同国家逐国测，不合并人群 |
| 4 本地相关词 | `related <词> --geo <国>` | 回填候选；探索与本地竞品取词只见 [P2](playbooks/research/p2-keyword-root.md#小语种候选词三关与本地竞品取词) |
| 5 移交 | 引用已有 GT 卡，不另查 KD 收口 | 后续验证与裁决只见 [entry.md](playbooks/entry.md) |

【实测】印尼用户搜 "remove background"（英语）反而压过 "hapus background"（本地语）；语言选择不能想当然。

### W2 · 模糊关键词 → 可做站的 SEO 词（扩词 → 验证 → 收口）

本节只交付词簇与测量记录；候选探索只见 [P2](playbooks/research/p2-keyword-root.md)，后续顺序只见 [entry.md](playbooks/entry.md)。

**第一步：多角度扩词（发散）。** 按需用 **marketing-psychology** 补痛点/对比/决策词，**marketing-ideas** 补场景/人群词，**ai-seo** 补问句候选；它们不代替真实回答证据。

> 这些 skill 不可用时（比如换了环境），自己顶上做扩词即可，角度不变：痛点/对比/场景/问句四个方向。

**第二步：用 Trends 测量。** 候选词簇 `compare`，按基线节记录量级、趋势与缺测；`related` 补变体，`region` 补市场线索，不按量档或衰退筛掉候选。

**第三步：移交问法验证。** 首要测试的执行方法只见 [seo-geo.md](seo-geo.md#geo-反推测试ai-需求验证流程)，逐问法 Google 方法只见 [seo-serp.md](seo-serp.md#逐问法-google-读法)。

**第四步：交付测量表（旧决策表入口）。**

| 词簇 / 候选词 | 国家 / 语言 | 窗口 / 日期 | 趋势形状 | 两词均值 / r / 相对量级 | 面板月量及来源 | 实际锚点 / 校准口径 / 折量区间 | 缺测 / 新词说明 | 原始证据 / GT 卡指针 |
|---|---|---|---|---|---|---|---|---|

表格移交 [entry.md 的入口卡](playbooks/entry.md#2--产出)，不再输出 KDROI、KD 派生预算或业务建议列。

**2026 AI 搜索补充（历史观察）**：以下带日期内容原样保留，不承担现行推荐裁决，当前采样只见 [seo-geo.md](seo-geo.md)。

Google 官方指南（2026-05-15）对 Google 自己的 AI 功能（AI 概览、AI 模式）明确：「非大众化内容」——一手评测、原创数据、亲历经验——才有引用价值，泛泛的信息摘要 AI 自己就能生成。**这个口径不能外推到 ChatGPT**：ChatGPT 侧的引用主要看检索名次与标题匹配，小样本探针中付费工具、游戏、平台各 1 词的推荐位均被占（[`seo-geo.md`](seo-geo.md)，【实测，2026-09-29，Codex low，小样本】），所以「工具型词更有 AI 引用价值」不能当选词依据。

### W3 · 新兴趋势捕捉

| 来源 | 采集用途 | 移交 |
|---|---|---|
| `related` rising | 上升相关词是候选线索，不把涨幅当绝对量 | 回填词簇，疑似新词按短时窗口节 |
| 官方 `trends_rising` | 按需补批量候选；调用参数、价格与产物口径只见 [seo-webcafe.md](seo-webcafe.md) | 复用候选后按基线节测量 |
| `hot` | 时效性话题线索 | 不直接作选词依据 |

后续探索只见 [P2](playbooks/research/p2-keyword-root.md)，验证与裁决只见 [entry.md](playbooks/entry.md)。

## 输出处理

脚本输出 markdown 表格，可直接引用。回答用户时：

1. 先给测量结论（相对量级、趋势形状与缺项），再贴 W2 测量表或原始读数；不从量级推出立项。
2. 峰值、拐点与窗口一起报，说明指数是相对值；用户要图表时用已有数据，不重复查询。
3. GT 卡落点只见 [entry.md「产出」](playbooks/entry.md#2--产出)，后续问法与三清单字段只见 [seo-geo.md](seo-geo.md)。

## 短时窗口：用 Trends 的「过去 1 小时 / 4 小时 / 1 天 / 7 天」验证刚出现的新词

Semrush / Similarweb 这类面板只有最近 28 天口径，昨天才火的词在那里要么是 0 要么是上个月的老量。
Google Trends 的 `now` 区间是唯一能看到**小时级**曲线的公开源，`gt.py` 从 3.1.1 起直接支持：

```bash
GT=<rankup-skill-dir>/scripts/gt.py
python3 $GT compare "<新词>" --no-gpts --time 1d            # 过去 24 小时，8 分钟一个点
python3 $GT compare "<新词>" --no-gpts --time 4h            # 过去 4 小时，1 分钟一个点
python3 $GT compare "<新词>" --no-gpts --time 1h            # 过去 1 小时
python3 $GT compare "<新词>" --no-gpts --time 7d --raw      # 过去 7 天，小时级
python3 $GT related "<新词>" --time 1d            # 这 24 小时里跟它一起被搜的 rising 词
python3 $GT compare "<新词>" --geo JP --no-gpts --time 1d   # 按国家看
```

标签页打开的就是这次查询的 explore 页（`explore?date=now 1-d&q=openclaw&geo=…`），趋势图和你肉眼看到的一致；取数走页内接口。

2026-09-03 实跑：`compare openclaw --time 1d` 拿到 24 小时 180 个点（63、65、62…），`compare chatgpt --time 4h` 拿到分钟级点。
时间戳是 UTC（列里带 `Z`），判读时换成目标市场的本地时区再看「几点起来的」。

**当前新词调用**：上列示例显式 `--no-gpts`，只看短窗形状；量级、校准与缺测处理只见上文基线节。

**短时窗口判读纪律（实测，2026-09-03；历史记录）：**

以下实跑数字与结论原样保留；旧「两边都起来才算新起话题」不作当前业务门槛，探索编排只见 [P2](playbooks/research/p2-keyword-root.md)。

1. **新词单独查，或只和同量级的词同框。** 同一次 `compare` 里数值按区间内峰值归一化到 0–100，
   `compare chatgpt openclaw --time 7d` 里 openclaw 全程是 0——不是没人搜，是被 chatgpt 压扁了；
   单独 `compare openclaw --time 1d` 立刻看到 60 上下的曲线。要比规模用 `region` 或分别查再看绝对趋势形状。
2. **`now` 区间的 100 只是「这几小时里的峰值」，不代表量大。** 一个日搜 50 次的词在 4h 窗口里也能画出漂亮的 100。
   短时窗口回答的是「有没有在起来、什么时候起来的」；量的问题回到面板与官方 `gefei-keywords` Skill。
3. **全 0 先看证据目录再下结论。** `gt-browser` 每次都落 `.rankup/evidence/gt-browser-<ts>/`（JSON + 截图 + manifest）；
   consent 弹窗、限流插页、未登录都会给一条全 0 的曲线，与「真没人搜」在接口上同形。
4. **别连着打。** 同一分钟内跑 5 条查询，第 5 条 `compare chatgpt --time 1h` 回了 `multiline_429`（Trends 接口限流）。批量时每条之间隔 10 秒以上，撞 429 等一分钟再来，不要换关键词硬试。
5. **用法定位：它是社区验证那条腿的第三根手指。** 调研 playbook 阶段 5 的口径是「Reddit / X / YouTube / B 站近 14 天」，
   Trends 短时窗口补的是「近 24 小时到 7 天的搜索侧信号」；两边都起来才算新起话题，只有社区起来是讨论热，只有搜索起来要去看是谁在推。


## 新版接口勘探（2026-09-09）

2026-10-01 起脚本已全部改走旧版页面，本节保留作历史勘探记录。

Google Trends 新版 Explore UI（`https://trends.google.com/explore?...`）不再暴露旧版那套
公开可读的匿名 widget REST 接口，改用 Google 通用的 `batchexecute` RPC 框架。但**在页面
自己的上下文里同源 fetch 时，旧版 REST 接口依然可用**——这是本轮（第四轮修订）把三条命令
全部改成 REST 主路的依据。以下全部是【实测】。

### 结论先行：现在三条命令怎么取数

| 命令 | 主路（dataPath: `rest`） | 兜底 | 实测耗时 |
|---|---|---|---|
| `compare` | `GET /trends/api/widgetdata/multiline`（widget `TIMESERIES`） | batchexecute 抓包 `g4kJzf`（dataPath: `capture`） | 26s（含开页） |
| `region` | `GET /trends/api/widgetdata/comparedgeo`（widget `GEO_MAP`） | 表格 DOM + 「Go to next page」翻页（dataPath: `dom`） | 12s，一次拿全量（实测 250 行） |
| `related` | `GET /trends/api/widgetdata/relatedsearches`（widget `RELATED_QUERIES`） | 表格 DOM（dataPath: `dom`，隐藏标签页里恒空） | 7-8s |

两步都在 trends.google.com 的页面上下文里同源 fetch（带用户已登录的 cookie）：

1. `GET /trends/api/explore?hl=en-US&tz=0&req=<JSON>`，
   `req = {comparisonItem:[{keyword, geo, time}, ...], category, property}`
   → 响应带 `)]}'` 前缀，去掉到第一个 `{` 后是 `{widgets:[{id, request, token}, ...]}`。
2. `GET /trends/api/widgetdata/<multiline|comparedgeo|relatedsearches>?hl=en-US&tz=0&req=<widget.request>&token=<widget.token>`
   → 同样带前缀，去掉后即可 `JSON.parse`。

`--resolution` 通过直接改 `widget.request.resolution`（`COUNTRY`/`REGION`/`CITY`）实现。
`RELATED_TOPICS`（相关主题）仍然恒回空 `rankedList`（接口把脚本会话标成
`USER_TYPE_SCRAPER`），跟归档版记录一致，本工具不提供相关主题。

### related 长期取不到数的**真正根因**（三轮修订、95 分钟白烧之后才定位到）

【实测，2026-09-09 直接在页面上验证】opencli 驱动的标签页在本机环境里
`document.visibilityState === "hidden"`——即使用了 `--window foreground`、`tab select`
把它选成活动标签、`document.hasFocus()` 已经返回 `true`，它**仍然是 hidden**
（Chrome 窗口被别的窗口遮挡或最小化就会这样，macOS 的窗口遮挡检测会把渲染器标为不可见）。

隐藏标签页里 Chrome **完全停掉渲染生命周期**，实测到的四个后果，每一个都单独致命：

1. `requestAnimationFrame` 一次都不回调（注册后 4 秒内计数器恒为 0）。
2. `IntersectionObserver` 一条记录都不投递——回调不跑，`takeRecords()` 也是 0。
3. 页面内部滚动容器（`div.Jh24Ne`，`overflow-y:auto`，scrollHeight 2036 / clientHeight 636）
   的计算样式是 **`scroll-behavior: smooth`**，而平滑滚动动画由渲染生命周期驱动，于是
   `pane.scrollTop = pane.scrollHeight` **赋值之后同步读回来仍然是 0**，永远滚不动。
   把 `pane.style.scrollBehavior = "auto"` 强制成瞬时滚动之后，同一行赋值立刻生效
   （scrollTop 0 → 1400.5）。**这就是前几轮「eval 硬改 scrollTop 无效」「opencli scroll
   无效」两个互相矛盾的观察的统一解释**：不是滚错了对象，是平滑滚动动画没人推。
4. 页面隐藏超过 5 分钟后，Chrome 的 intensive throttling 把 `setTimeout` 压到 **1 次/分钟**。
   于是「页内循环滚动 + `await new Promise(r=>setTimeout(...))` 等待」的 eval 必然撞
   opencli 的 115s CDP 硬超时（`cdp_timeout`），连现场状态都读不回来——上一版 related
   每失败一次要烧近 3 分钟，就是这么烧掉的。

「Commonly searched queries」（Top queries / Rising queries）这一块的数据请求就挂在
IntersectionObserver 上。所以在隐藏标签页里，**块的 DOM 骨架会挂载**（`h3` 标题拿得到、
空表格在、右上角两个 Download CSV 按钮也在），但**数据永远不会加载**。
因此：

- **「加长等待」这个方向从原理上就走不通**，不是等得不够久。
- **「点 Download CSV 读文件」也走不通**：那两个按钮的实际 DOM 是
  `<button ... disabled="" aria-label="Download top queries CSV">`——**它们是 disabled 的**，
  因为下面没有数据。实测点击（`button.click()`）不发任何请求、不创建 blob、不触发
  `<a download>`、`~/Downloads` 里也不落文件。CSV 按钮只有在数据已经加载出来时才可用，
  所以它**不是**绕过懒加载的入口，反而是懒加载有没有成功的一个现成探针。
- 唯一走得通的是**绕开页面渲染**，直接在页面上下文里打 REST 接口。

### related 的响应结构与 Top / Rising 归属

`relatedsearches` 响应：`{ default: { rankedList: [ <Top>, <Rising> ] } }`，恒为 2 条。

- **`rankedList[0]` = Top queries**：`formattedValue` 是 0-100 的整数字符串（`"100"`/`"13"`）。
- **`rankedList[1]` = Rising queries**：`formattedValue` 是 `"Breakout"` 或 `"+3,450%"`。

【实测，higgsfield / manus 各 5 次，10/10 成功，单次 1.0-2.5 秒】归属由数据自证（一张全是
0-100、一张全是 Breakout/百分比），并与页面上「Top queries」/「Rising queries」两个 `h3`
标题的语义一致。注意 Top 与 Rising 的列义不同、没有可比性，所以 `gt.py related` 的输出把
两张表分开出（Top 出 `value` 列 = 0-100 相对热度，Rising 出 `growth` 列 = 涨幅），
不硬凑成同一组列。取 `formattedValue` 而不是 `value`：Rising 的 `value` 是原始涨幅整数
（Breakout 时是哨兵大数），`formattedValue` 才是页面上真正显示的那个字符串。

### 工程规则（写进脚本，别再踩）

- **任何等待都放在 Node 侧**（`msleep`），页内 `eval` 一律写成同步的、立刻返回的。
  隐藏标签页里的定时器不可信；一个 4 秒的 settle 有时要等 60 秒。
- **要滚动就先 `style.scrollBehavior = "auto"`**，否则赋值 `scrollTop` 无效。
  滚动现在只用于让截图证据好看、让 region 的 DOM 兜底能读到行，**不再承担
  「触发懒加载」的职责**（在隐藏标签页里它做不到这件事）。
- **失败预算要短**：`related` 单条从开页到报错 ≤ 45 秒（实测成功路径 7-8 秒）。
  REST 最多重试 2 次，每次 eval 25 秒超时；两次都不行就做一次同步 DOM 兜底探测，然后如实报错。
- **失败要可判读**：manifest 记 `dataPath`（`rest`/`capture`/`dom`/`none`）、`restTries`、
  `restErr`、`scrolled`、`lazyBlocksLoaded`、`elapsedMs`。`restErr` 里的 HTTP 429/302
  是 Google 侧限流；「没有 RELATED_QUERIES widget」通常是这个词太冷、Google 本来就不给。

### batchexecute 抓包路由（现在只当兜底，记录保留）

新版页面自己发的请求是
`POST https://trends.google.com/_/TrendsUi/data/batchexecute?rpcids=<ID>&f.sid=...`，
响应是 `)]}'` 反 XSSI 前缀 + 分块编码，真正数据在 `["wrb.fr","<rpcid>","<JSON 字符串>",...]`
三元组里且是**双重 JSON 编码**。请求体 `f.req` 里带一段 ~2500 字符的签名 blob，本工具不重建。
抓法是在页面上下文里包一层 `window.fetch` / `XMLHttpRequest`（`INSTALL_CAPTURE_JS`）。
已实测确认的 rpcid：

- `qrLOJd` 地区热度分布——几乎总是在抓包壳子装上之前就发完，抓不到（现在走 REST）。
- `g4kJzf` 热度曲线——compare 的兜底路由。**注意【实测，本轮】它也不是稳的**：本轮
  compare 连开 4 轮整页、`capturedVia` 全 `null`，一条都没抓到，正是这次把 compare
  也改成 REST 主路的直接原因。解码后结构是
  `[[[keyword, ?, ?, ?, [[value, roundedValue, [[startEpoch],[endEpoch]], flag, ?], ...]], ...]]`
  （比最初勘探记的多包一层，脚本对两种形态都兼容解包）。
- `fXqlme` 相关查询——**在隐藏标签页里永远不会发出**（挂 IntersectionObserver），
  脚本已不再尝试抓它。
- `UZBRtc`（4-5MB，【推测】地图色块几何数据，不取）、`DqDTgb`/`Tnt4U`（初始加载即触发，
  【推测】widget 配置/token 引导调用，未解出结构，不在取数路径上）。

- **已解决（opencli 侧）**：`opencli browser <session> network` 读取命令在本机【实测】
  反复返回空列表（用 `httpbin.org` 也复现过），不是 Trends 专属问题。解法是不依赖它，
  改用页内抓包 / DOM / REST，三条路都不经过 opencli 的 CDP 网络记录层。

### 未解决问题 / 已知限制

- **Google 侧软限流（遗留）**：短时间内高频打新版 explore 页，页面会停在加载态、
  查询词 chip 都不渲染；REST 接口对应的表现是 HTTP 429/302。**这不是本工具的 bug**，
  工作流里要控制调用频率、间隔几秒到几十秒，撞上就等几分钟。
- **相关主题（RELATED_TOPICS）拿不到**：恒回空 `rankedList`，见上。确实要主题时让用户
  在前台标签页里自己看。
- **标签页可见性依赖【推测】**：本轮所有结论都是在「Chrome 窗口被遮挡 → 标签页 hidden」
  这个状态下测的。如果哪天 Chrome 窗口真的在前台可见，渲染生命周期恢复，新版页面的
  懒加载 widget 应该会正常加载，DOM 兜底也会有数——但本轮**没有在可见窗口下验证过**，
  标记为【推测】。REST 主路不受这件事影响，两种状态下都能用。
- **region 的 DOM 兜底翻页按钮定位**：用 `--role button --name "Go to next page" --nth 0`，
  假定它在 DOM 里排第一。只在 REST 失败时才会走到，`--top 15` 这种常规用量（3 页以内）
  没观察到问题。现在 REST 一次拿全量（实测 250 行），这条兜底基本不会被触发。

## 旧版 explore 页每一块与归档版 gt.py 的对应（2026-09-03 逐块实跑，仅归档版适用）

| explore 页上的块 | 命令 | 状态 |
|---|---|---|
| 热度曲线（Interest over time） | `compare KW…`，`--time` 全部档位含 1h/4h/1d | ✅ 实跑；now 区间分钟/8 分钟级 |
| 地区分布（Interest by region） | `region KW…`，`--resolution country\|region\|city` | ✅ 实跑；`city` 对小词常为全 0（Google 就是没给），不是命令坏了 |
| 相关查询（Search queries：Rising / Top） | `related KW` | ✅ 实跑 |
| 相关主题（Search topics：Rising / Top） | 不提供 `topics` 命令 | ❌ **前台窗口实测：不可，2026-10-01**。OpenCLI 旧版页、minecraft、美国 7 天，首次 `visibilityState=visible` 时主题块已渲染，但显示 `Hmm, your search doesn't have enough data to show here.`；相关查询同页有 Breakout。页面自身 ENTITY 请求 HTTP 200，同 URL 回读 `{"default":{"rankedList":[]}}`（原始响应抓包不可用，回读不是原始响应）；保存证据时可见性变为 hidden。仅为自动化会话实测，不推断普通 Chrome；ai generator / chatgpt 前台补验因浏览器桥断线未完成。报告与截图：`gt-old-ui.md`、`gt-old-ui-minecraft.png`。 |
| 地区 / 时间 / 类目 / 搜索类型四个下拉 | `--geo`、`--time`、`--category N`、`--property web\|images\|news\|youtube\|shopping` | ✅ 实跑（`--property youtube`、`--category 5` 的 explore URL 与取数都对上） |
| Trending Now（每日热搜） | `hot --region US` | ✅ 实跑 |
| 多词对比（最多 5 个） | `compare A B C` | ✅ 实跑；标签页 URL 带全部关键词；**归一化按同框峰值**，大小词别同框 |

标签页打开的是这次查询本身的 explore 页（带 q / date / geo / cat / gprop），取数走页内接口，证据落 `.rankup/evidence/gt-browser-<ts>/`（原始 JSON + 截图 + manifest）。上表描述的是**旧版**（`archive/gt-v1/`）行为；新版路由（主用）见上一节「新版接口勘探（2026-09-09）」。

## 趋势候选的验证与反查

【经验·2026-10-01】趋势监控命令、三区台账、限流恢复与产物约定见 [趋势系统入口](trends-system.md)。以下从监控方法论抽取通用流程，私有案例与实测数字留项目数据目录。

- **收益假设**：点击/天约为去重后的词簇月量 × CTR ÷ 30。CTR 与转化率须注明假设；低竞争前三位可作乐观情景，不能承诺排名。能卖产出的工具按付费转化算，游戏内容按广告 RPM 算。该式只作经营情景，不作为关键词与立项门禁；裁决只见 [entry.md](playbooks/entry.md)。
- **精确意图与归一化**：歧义词换精确词形；量级失配、新词与窗口处理只见上文基线节。
- **搜索与 AI 需求分开**：GT 见顶不证明 GEO 窗口已关，推荐侧滞后仅为待验证假设；问法采样与证据口径只见 [seo-geo.md](seo-geo.md)。反方向也有实例：旧词、Google 侧几乎没有流量的站，访客可以基本来自 ChatGPT（哥飞群聊截图，2026-11-03，单站自报；数字与边界见 [seo-geo.md「GT 盲区修正」](seo-geo.md#gt-盲区修正经验)），所以 GT 平淡不证明 AI 侧没需求。
- **低成本付费验证**：先用现有站内页测试新需求，记录渠道和转化，再决定独立站与域名；低价验证之后按真实付费反馈定价。精确匹配首页或域名可能影响推荐，仅作待验证假设；定价页把积分翻译成可得到的产出，提供一次完整体验，说明实际关联与使用限制。
- **反查三条证据链**：定价档位组合用来发现候选，不能因价格不符直接排除（可能调价）；按 TLD 的 IANA RDAP bootstrap 找注册局，以 registration 事件核对上线时间；结合产品形态、收款与关键词交叉归因，单一 mismatch 先找变化解释。证书日志可辅助，新站的历史快照可能为空，服务失败不当作无记录。
- **前端包反查矩阵**：公开 JS 中的站点 ID 分支、共享资源与注册表可生成候选，再逐站验证相同工程特征；这些通常是打包副产物，不证明页面存在外链或 SEO 收益。数据实证与运营者身份归因分开。
- **聪明钱跟进**：检查候选精确或近似域名近期注册作为竞争/学习信号，再查一次性付费工具作为变现信号；不能仅凭注册就立项。AI 模型词关注周边能力机会，脉冲先观察；主词抢不动时从 related queries 与关键词库反推长尾。
- **调查纪律**：二手转述的材料（「某人说截图里是某组价格」）先向用户确认一手来源再用，用户手里没有的一律标「未证实」，不当指纹用；同赛道的站共用同一套 SaaS 模板，路由、后台路径、统计工具、关键词和注册时间人人都有，只能淘汰不能指认；先消化已有材料，不重复索取同批截图；同一维度卡住就换定价、时间或产品维度。种子 Rising 是线索，峰值进入 7 天窗口也会造成涨幅，不能当点火时间；社交平台点火信号是现有监控的盲区。
