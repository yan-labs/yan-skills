# 面板能力 × 现有脚本：缺口与优先级

配套 [`provider-capabilities.md`](provider-capabilities.md)（平台有什么）读。
**那份回答「面板能拿到什么」，这份回答「我们已经能自动拿到什么、还差什么、先补哪个」。**

分析日期 2026-08-27，依据是逐个读完现有脚本源码 + 对照 `references/` 里记录的真实工作流。

---

## 零、一句话结论

> **2026-08-30 复核**：本文件头部标的分析日期是 2026-08-27，而下面「4 个缺口」里的前两个、
> 以及第五节 Top 10 的第 1/2/9 名，都已在 2026-08-28 落地。已就地划掉并注明落点，
> 但**基准日仍是 08-27**——再读时先 `ls backlink/scripts/` 核一遍，不要拿本文件当能力底账。
> 底账是 [`capability-map.md`](capability-map.md)。

**卡住日常工作流的不是那 60 个没脚本的页面，而是 4 个具体缺口：**

| 缺口 | 卡住了什么 |
|---|---|
| ~~Similarweb **Keyword Generator**（词根批量扩词）~~ **→ 已实现 2026-08-28** | 曾是整条选词流水线的源头缺口（`demand-discovery.md` 记的规模是「1,309 个词根 → 扩出 97,681 个词」）。现在走 `backlink/scripts/similarweb-keywords.mjs`，四个 tab：`phraseMatch` / `relatedKeywords` / `trending` / `questions`。详见第六节 #1 |
| ~~Semrush **Keyword Magic Tool**（整包扩词/聚簇）~~ **→ 已实现 2026-08-28** | 落地形态不是新脚本，而是 `backlink/scripts/semrush-report.mjs --report keyword-magic`。实测种子词 `nonogram` 给出 20.1K 词 / 201 页 + Topics 聚簇。详见第六节 #2 |
| Similarweb **Audience → 国家分布** | 每次跨面板口径对齐都要手开浏览器看目标国占比 |
| Similarweb **Website → Search**（该站自然搜索词 + 占比） | 隐含点击率校验只能手工做 |

### 反例先记住：页面数排序会骗人

**Semrush 的「流量与市场工具箱」有 25 个页面，是两个平台里最大的单块，但它排第 9。**

理由：它给的是与 Similarweb 同类的流量估算，而
[`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 已经记过
「Similarweb 自己和自己就对不上」（同域名同窗口，Performance 总访问 vs Channels 行合计差 6–35%）。
**再加一个同类估算面板，边际价值低。**

**排优先级看的是"这个动作在工作流里一周出现几次"，不是"这个模块有几个页面"。**

---

## 一、明确判为「有了也不会用」的 60 个页面

**这些不要再出现在缺口清单里，也不要算进覆盖率分母。**

| 模块 | 页数 | 为什么不用 |
|---|---|---|
| Semrush Local Toolkit | 4 | 写操作 + 我们不做实体店 |
| Semrush Social Toolkit | 5 | 发布类（「做」层） |
| Semrush AI PR Toolkit | 5 | 发信类（「做」层） |
| Semrush My Reports | 3 | 导出与账号动作 |
| Semrush Content Toolkit | 7 | 生成类（「做」层） |
| Similarweb Advertiser Activity | 16 | 我们不投放广告 |
| Similarweb Rank Tracker | 11 | 需建项目（写），且排名跟踪 GSC 已覆盖 |
| Similarweb 5 个独立产品 | — | 不在当前订阅内 |

**合计约 60 页，占两个平台页面总数的 40%，在 `references/` 记录的全部工作流里一次都没出现过。**

---

## 二、已覆盖的部分（别重造）

| 脚本 | 覆盖的报表 | 必须知道的限制 |
|---|---|---|
| `semrush-overview.mjs` | 域名概览整页 23 区块，含 AI 可见度、按国家分布、反向链接明细，不止流量卡片 | **不传 `--db` 默认全球库，传 `--db xx` 才是该国**；实际口径由页面地区选择器核对，写进 `scopeEvidence`，读不出/不符会拦成 `incomplete`；**「自然搜索研究」「广告研究」两组跟随账号级国家、不跟页头走**，全球请求下要 `--organic-db xx` 钉住，否则如实标国家并拦成 `incomplete`（`sectionScopes`） |
| `semrush-batch.mjs` | 域名概览（批量流量卡片） | **没有全球选项**，`organicTraffic` 恒为某一个国家库；`db: null` 只表示"不知道是哪个库" |
| `semrush-report.mjs` | organic-overview / organic-positions / organic-pages / backlinks-list / backlinks-overview / keyword-overview | positions/pages 支持翻页；词维度刻意只留一张，指向 `semrush-keyword.mjs` |
| `semrush-keyword.mjs` | 关键词概览 | **唯一有 `globalVolume` 的口径**；`--db` 默认 `jp`（历史包袱）；**bulk 模式下 `globalVolume`/`byCountry` 恒为 `null`**；`byCountry` 只是页面 Top-N，加总 ≠ `globalVolume` |
| `similarweb-query.mjs` / `similarweb-batch.mjs` | performance / channels / similar-sites | **只有 performance 有结构化 metrics**；`similar-sites` 只给 bodyText；`noDataTextObserved` **是观测事实（页面正面写了那句话），既不是失败也不是判决**，它意味着什么由 AI 读证据判（旧字段名 `belowFloor` 已移除） |
| `payment-referrers.mjs similarweb` | 引荐域名 | **焊死在支付网关场景**，不是通用引荐域脚本；份额配对已知失败（29 个域名对 37 个百分比） |

---

## 三、缺口优先级 Top 10

每条的理由都来自 `references/` 里记录的真实工作流，**不是拍脑袋排的**。

| # | 缺口 | 为什么排这里 |
|---|---|---|
| 1 | ~~**Similarweb Keyword Generator**~~ **已实现** → `similarweb-keywords.mjs` | 选词流水线的入口。`demand-discovery.md` 闭环第②步就是"用词根批量查 Similarweb，下载 搜索量>3万 / KD<60 的词"。**2026-08-28 落地后此行不再是缺口** |
| 2 | ~~**Semrush Keyword Magic Tool**~~ **已实现** → `semrush-report.mjs --report keyword-magic` | `semrush-keyword.mjs` 注释里写明的分工，另一半已补齐。`game-sites.md` 的每日动作要"多语言关键词需求簇"，走整包导出 |
| 3 | **Similarweb Audience → 国家分布** | `demand-sources.md` 明确要求：并排 Semrush 国家库和 Similarweb 全球总访问之前**先看目标国占比**。实测"美国流量只占 21–39%，光这一条就是约 5 倍" |
| 4 | **Semrush Referring Domains 列表** | `webcafe-experiences.md` 外链 SOP 第 2–3 步就是"导出外链域名列表，按出现次数排序"。现在只有逐条链接的 `backlinks-list`，要域名级聚合得二次汇总，分页开销几十倍 |
| 5 | **Similarweb Website → Search** | `webcafe-experiences.md` 用"前 5 个词只占自然流量 15.5%"反证 Semrush 低估。这个数拿不到，隐含点击率校验就只能手工做 |
| 6 | **Similarweb Search Competitors** | 每个词在一段时间内各站的**市场占比**，谁起来了谁掉了。比 SERP 快照多一层时间维度 |
| 7 | **通用化 Similarweb Referrals** | **最低成本的一个缺口——代码已经跑通**，只是焊死在支付场景里。抽出来即可 |
| 8 | Semrush Keyword Gap / Backlink Gap | 一次给出差集，比逐个跑 `organic-positions` 再做集合运算省一个数量级配额。但频率是周级不是日级 |
| 9 | ~~Semrush Traffic Analysis~~ **已实现** → `semrush-traffic.mjs` | **页面最多但当时排第 9**，理由见开头的反例。2026-08-28 落地：读 .Trends 流量分析总览（总访问量口径），实测 canva.com 与 Similarweb 相差 2.4%——**跨面板并排时真正对得上的是这个数，不是 organic** |
| 10 | Semrush 多国家库求和封装 | 不是新能力，是把已经在做的人肉动作沉淀成脚本 |

---

## 四、写新脚本的硬约束

**动手前先读这一节，这些是从现有脚本读出来的既定风格，不是建议。**

| 约束 | 具体 |
|---|---|
| 零外部依赖 | `parseFlags` / `showHelpIfRequested` / `printJson` / `required` / `validateSession` / `defaultSession` 全来自 `opencli-core.mjs` |
| 启动方式 | 一律 `launchTool()` + `gotoInTool()`，不要自己拼 URL 打开 |
| **数值必须过 `captureStable()`** | 这是防占位值的**唯一护栏**。抄表格写法就必须连稳定性检查一起抄——"authorityScore 全 0"事故就是漏了它 |
| 错误文本必须过 `redactSecrets()` | 否则凭据会漏进日志 |
| 双出口 | `--out` 落盘 + `--json`/`printJson` |
| 批量三铁律 | 同步前台、逐条 JSONL 追加、可续跑（照 `semrush-batch.mjs`） |
| **解析逻辑放 lib，不放脚本** | Similarweb 的解析一律进 `lib-similarweb.mjs`。该 lib 头部注释就是为这条禁令存在的 |
| **新报表要同步登记存证** | 每加一个新脚本，同时在 `tools-share-evidence.mjs` 的 `REPORTS` 里加一条（path/ready/kind），`rankup audit` 才能自动获得它的存证能力。**这是唯一需要同步改的地方** |

### 反面写法

| 别这么写 | 该这么写 |
|---|---|
| 照抄 `websiteanalysis` 的 hash 路由形状去开 Keyword Research | Keyword Research 是另一段路由。**照抄带 `*` 的路由会让 SPA 整个重新初始化成空白页** |
| 就绪判据认筛选器 chip 出现了就开抓 | **只认表体里的数据行**。这个坑 `semrush-report.mjs` 记过三次 |
| 新脚本沿用 `--db` 默认 `jp` | 新脚本**强制必填 `--db`**，不要带历史包袱 |
| 虚拟滚动长表一次全抓 | 照 `tools-share-evidence.mjs` 的 `scrollToEnd` 分批取，**且必须有 `--limit` 硬上限防止一次打光配额** |
| 点「导出」按钮拿整包 | 走读页面。导出是否计入配额未验证，且违反红线 |

---

## 五、现有脚本的 10 个短板：兜还是不兜

**"兜住"的判据只有一条：这个短板会不会导致静默错数。会 → 兜；只是不方便 → 不兜。**

| # | 短板 | 判决 |
|---|---|---|
| 1 | Semrush 域名维度无全球字段 | **兜一半**。不要在脚本里偷偷求和当 `globalTraffic`——那会造出平台本身没有的字段。改为：`--db` 升级为**必填**；另出 `semrush-multi-db.mjs` 输出逐国家并列 + 标注清楚的 `sumOfListedCountries` + `countriesIncluded`。**求和是调用方的选择，不是脚本的默认** |
| 2 | Similarweb 自己和自己对不上（差 6–35%） | **兜住，但只报不改**。把 `revenue-site-audit.mjs` 已有的 `similarweb_report_conflict` 下沉到 `similarweb-query.mjs`，输出 `crossReport: {deltaPercent, conflict}`。**绝不取平均、绝不"以某张为准"** |
| 3 | `byCountry` 只是页面 Top-N，加总 ≠ `globalVolume` | **兜住**。加机器可读标记 `byCountryCoverage: {listedSum, globalVolume, coveredPercent, exhaustive: false}`——下游 `game-opportunity.mjs` 直接吃 `semrushByCountry`，现在会误当穷举用 |
| 4 | bulk 模式**静默**丢 `globalVolume`/`byCountry` | **兜住**。`null` 与"该词没有全球量"不可区分。加 `fieldsUnavailableInThisMode: ['globalVolume','byCountry']` |
| 5 | `below-floor` 是终局，续跑不重测 | **兜住**。占位值 bug 制造过一次假 below-floor（**月访 35 万的站被判无流量**）。加 `confirmedBy` 字段 + `--recheck-below-floor`，而不是要求人删文件 |
| 6 | `similar-sites` 无结构化解析 | **兜住**。竞品发现是高频动作，返回一坨文本 = 每个调用方各写一遍解析。在 lib 里补 `deriveSimilarSites()` |
| 7 | Referrals 份额配对失败 | **保持现状，不要"聪明"地兜**。对不上就只给域名清单 + 明说未配对，这是**正确**做法。抽通用脚本时照搬这个保守逻辑 |
| 8 | `lib-similarweb.mjs` 标签白名单是中文面板文案硬编码 | **兜住（便宜）**。面板切英文或改文案 → 全部字段静默变 null，与已记录的所有"静默错数"事故同型。解析全 null 且 bodyText 非空时返回 `{__parseFailed: true}`，**让调用方报错而不是写下一行空指标** |
| 9 | 存证脚本的自定义页只存证不解析 | **不建议兜**。存证与取数是两件事，混起来会让脱敏保证变复杂 |
| 10 | `captureStable` 是唯一护栏但容易抄漏 | **兜住**。加静态检查：任何 import 了 `launchTool` 且写出 metrics/JSONL 的脚本，必须同时 import `captureStable` |

---

## 六、Top 5 实现草案

> 以下是设计草案，**尚未实现**。动手前先读第四节的硬约束。

### 1. ~~`backlink/scripts/similarweb-keywords.mjs`~~ → **已实现**

**2026-08-28 落地。** 这是排第 1 的缺口——选词流水线的入口。

```bash
node backlink/scripts/similarweb-keywords.mjs --seed "nonogram" --tab relatedKeywords
node backlink/scripts/similarweb-keywords.mjs --seed-file roots.txt --tab relatedKeywords --jsonl --out kw.jsonl
```

路由是**点出来的不是猜的**（上一轮猜的那条不存在）：
`#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/<country>/28d?...&tab=<tab>&keyword=<seed>`
四个标签页各自的口径：`phraseMatch`（词组匹配）、`relatedKeywords`（相关词，量最大）、
`trending`、`questions`。实测 `nonogram` 在 relatedKeywords 下有 **8,888 个词**。

**为什么必须走 DOM 列**：这张表在 DOM 里**按列渲染**，`.swReactTable-column` 一个容器
装一整列，innerText 出来是「100 个行号一块、100 个关键词一块」。按行切分时只要某列
有空值就整列上移一格，得到一组读起来完全正常的错数据。按列取值由 DOM 结构保证对齐。

**不同标签页的列不一样**：实测 relatedKeywords 没有「28 天的体量」这一列。脚本按列名
取值，缺列会整列 null **并在 stderr 报 `[missing-columns]`**——不会把「平均体量」的
数字挪过去冒充它。

**只读当前页 100 行**，`shownTotal` / `complete` 如实报出总量差距，并打 `[partial]`。

### 旧草案（保留作对照）

### 1. `backlink/scripts/similarweb-keywords.mjs`
```
--seed "json editor" --mode generator|overview|competitors
[--country us] [--limit 500] [--min-volume 30000] [--max-kd 60]
[--seed-file roots.txt] [--out kw.jsonl] [--session x]
```
输出 JSONL：`{version, source, retrievedAt, seed, country, keyword, volume, kd, cpc, trafficShare, scope:'28d', session}`
难点：Keyword Research 是另一段 hash 路由（不能照抄）；虚拟滚动长表要分批 + 硬上限；就绪判据认数据行不认 chip。

### 2. ~~`backlink/scripts/semrush-keyword-magic.mjs`~~ → **已实现，但没有新建脚本**

**2026-08-28 落地为 `semrush-report.mjs --report keyword-magic`。**

不新建脚本的理由：那个文件已经有分页、逐页稳定性判定、覆盖率校验和「不许静默截断」的
全套机制，新写一个等于把这些复制一遍——正是本 Skill 的红线。实际改动只有三处：
给 REPORTS 加一条、把 DOM 单元格透传给解析器、让覆盖率检查按报表定义「一条记录长什么样」。

```bash
node backlink/scripts/semrush-report.mjs --report keyword-magic --keyword "nonogram" --db us
node backlink/scripts/semrush-report.mjs --report keyword-magic --keyword "nonogram" --db us --all-pages --max-pages 20
```

实测：`nonogram` 20.1K 词 / 201 页，`tower defense` 98.5K 词，每页 100 行 15 列。

**为什么走 DOM 而不是按行解析**：意图列可以是 0 到多个字母、趋势列是 sparkline 不进
innerText、指标可以整格「不可用」——同一页里第 1 行有 8 个尾值、第 3 行只有 7 个。
按位置切列会算出一组**读起来完全正常的错数字**。解析器按**列名**取值，列顺序变了
得到 null 并记进 `missingColumns`，不会静默错位。

**收回一条之前的结论**：指标不是配额门禁。「不可用 / 要更新指标数据」是渐进水合的中间态，
等解析结果稳定下来就全有了——两个种子词各 100/100 行的量、KD、CPC 都拿到了。

**但别把这条读成「凡空皆水合」。** 这里成立，是因为这张表本来就有那几列，只是值还没进来。
读到空还有并列的一类：**本来就没那个东西**——某些路由只提供图表，`visible` 下连读三次
仍然是 0 个表格元素，再等再读都一样。两类的判据和补救相反，读到空的第一个动作是
在页面里取 `document.visibilityState` 并数表格元素，而不是再读一次。
完整实测和判据在 backlink Skill 的 SKILL.md 里，id 为 `hidden-tabs-do-not-hydrate` 的那条 law。

### 旧草案（保留作对照）
### 2. `backlink/scripts/semrush-keyword-magic.mjs`
```
--seed "png to svg" --db us [--match broad|phrase|exact|related]
[--limit 1000] [--min-volume 500] [--max-kd 39] [--out magic.jsonl]
```
输出 JSONL：`{keyword, db, volume, kd, cpc, competition, results, intent, cluster, seed}`
难点：第一个「分页 + 侧边聚簇树」的 Semrush 表；`--db` 强制必填；默认读页面不点导出。
**关键约束（2026-08-28 实测）**：这个页面的**搜索量/KD/CPC 三列返回「不可用」**，
要点「刷新指标」才补齐，大概率消耗配额。所以脚本应当**先只取词表和聚簇**（便宜、可大量），
把指标标成 `null` + `metricsPending: true`，需要时再走 `semrush-keyword.mjs` 按需补。
**不要设计成一次拿全，那会在不知不觉中烧配额。**
顺手把 `semrush-keyword.mjs` 的 `parseCompact` 抽到共享 lib，**别第三次复制**。

### 3. `backlink/scripts/similarweb-audience.mjs`
```
--domain example.com [--report geography|demographics] [--window 28d] [--out geo.json]
```
输出：`{version, domain, window, scope:'global', countries:[{code,name,visits,sharePercent}], top1Share, retrievedAt, noDataTextObserved}`
难点：份额**由绝对值自己算**，别去页面捞百分比串；中文国家名 → ISO 映射，映射不上保留原文不要丢弃。
**这个脚本的价值全在下游**——同时给 `revenue-site-audit.mjs` 加可选入参，让地理错配自动算出来而不是靠人记。

### 4. `backlink/scripts/semrush-referring-domains.mjs`
```
--domain example.com [--limit 500] [--min-as 20] [--sort as|first-seen] [--out rd.jsonl]
--domains-file competitors.txt --out all.jsonl    # 批量+续跑
```
输出 JSONL：`{domain, referringDomain, authorityScore, backlinksCount, firstSeen, lastSeen, ipCountry}`
批量再给 `--rollup` 汇总 `{referringDomain, hitCount, fromDomains}`——**正好就是外链 SOP 第 3 步的"按出现次数排序"，让脚本一步做完**。

### 5. `backlink/scripts/similarweb-site-search.mjs`
```
--domain example.com [--channel organic|paid] [--limit 100] [--window 28d] [--out search.json]
```
输出：`{domain, channel, window, organicVisits, keywords:[{keyword,trafficShare,position,volume}], top5SharePercent, coverageNote}`
`top5SharePercent` 是这张表最有价值的派生量（隐含点击率校验就靠它），**必须显式给，别让调用方自己加**。
与 `channels` 的自然搜索访问数互核，差异过大按 `similarweb_report_conflict` 报冲突，**不要二选一**。
