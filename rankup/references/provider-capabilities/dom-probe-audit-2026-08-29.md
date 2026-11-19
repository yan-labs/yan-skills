# DOM 探针作废公告与旧分类（2026-08-29）

> 本文件从 [`provider-capabilities.md`](../provider-capabilities.md) 拆出（2026-09-30）。历史证据：保留原样，供复核旧判定时读。改这里同样要同步 [`../../data/provider-capabilities.json`](../../data/provider-capabilities.json)，规矩见主文件「五」。

## 目录

- ⛔ 2026-08-29 作废公告：本节以下所有基于 DOM 探针的分类，全部受一个失明的探针污染
  - 根因：探针对 shadow DOM 结构性失明
  - 对照组：分类零区分力
  - `exportBtns` 是伪造的证据，`chartHydrated` 无法复现
  - 判定变更
  - `<面板授权基址，见平台配置>` 是唯一授权基址，写错会静默走到销售页
  - 分类之前的三条硬闸门（新增）
  - 滚动不是根因，但那次观测有限度

## ⛔ 2026-08-29 作废公告：本节以下所有基于 DOM 探针的分类，全部受一个失明的探针污染

**本节保留原样，一个字没删。** 但在读下面任何一行之前，先读这一段——
它推翻了 9 条判定，并把另外 10 条降级为「待复查」。

### 根因：探针对 shadow DOM 结构性失明

同一页、同一时刻，只读实盘：

| 量 | 读数 |
|---|---|
| `document.body.innerText.length` | **59** |
| 穿透 shadow DOM 的深层文本长度 | **1,605,054** |
| 文档里的 shadow root 数量 | **44** |

**Semrush 把外壳和报表挂件渲染在 44 个 shadow root 里。**
`innerText` 不穿透 shadow DOM，`querySelectorAll` 也不穿透。
**所以本节里所有按 `table` / 单元格 / `innerText` 计数的数字，量到的都是页面的一小块。**
同一页穿透前后的对照：svg 从 32 → 45、从 3 → 16、从 49 → 62。

⚠️ **这个教训本仓库已经交过一次学费。** Semrush 的**侧栏**也在 shadow DOM 里，
当时的结论是「侧栏看不见」，直到改用
`document.querySelectorAll('snav-sidebar-ribbon-item, snav-sidebar-list-item')`
+ `el.shadowRoot.querySelector('a')` 才拿到 15 个额外页面。
**那次只修了侧栏这一处，没有推广到取数探针。**

### 对照组：分类零区分力

`top-pages`——本文件里写着 **850 个非空单元格**的那条路由——现在读到
`tables:0, grids:0, cells:0, innerText:59`，**持续 150 秒**。
**一条已知有数据的路由，和那 9 条「无表格」读出来完全一样。**
所以「9 条通过结构判据」这个结论，不是一个弱结论，而是**没有分辨力的读数上做出的结论**。

### `exportBtns` 是伪造的证据，`chartHydrated` 无法复现

- `daily-trends` 内容区**一片空白**，却量到 `exportBtns: 12`，
  **与本文件记录的 `exp=12` 完全一致**。那 12 个匹配全在 shadow DOM 的**导航壳**里，
  不在任何报表内。这正是 `readiness-must-bind-to-this-query` 那条 law 描述的形态。
- `chartHydrated` 在三条路由上**全部读到 0**，包括记录里写着 `chart=122` 的那条。
  一个在同一页上既能读到 122 又能读到 0 的量，不能证明任何事。

**处置：两个信号已在 backlink Skill 与 `scripts/lib-report-readiness.mjs` 里退役**——
继续量、继续记进证据，**不再参与任何判定**。下面那张「档」表里的 `chart/exp` 计数
从此只能当史料读，不能当依据。

### 判定变更

| 原判定 | 条数 | 新状态 | 说明 |
|---|---|---|---|
| `no-table-structural` | **9** | **`voided-blind-probe`，回到 `pending-remeasure`** | 成因三条：浅层 DOM 探针 + 空白模块 + 伪造的 `exportBtns` |
| `data` | **10** | **待复查（`pending-recheck-blind-probe`），判定未作废** | 有**正向**证据（真实的非空单元格字符串），更可能保得住；但**是同一个失明探针产出的**，`filledCells` 只能当**下界**读，而且要复查那些数**是不是这个域名的** |

### `<面板授权基址，见平台配置>` 是唯一授权基址，写错会**静默**走到销售页

`www.semrush.com/analytics/traffic/...` **不是授权基址**
（见 `backlink/references/authorized-data-sources.md`）。**它不报错**：
渲染骨架 → 弹到 `/analytics/traffic/`（**公开营销页**，`innerText` 514、10 张图、标题
`Traffic Analytics: Estimate Any Website's Traffic | Semrush`）→ 再弹到 overview。
**一个扫描器会从销售页上记下「无表格、有 svg、有导出按钮」。**

而且弹完之后标签页停在 **`mmradar.gg`** 的完整域名概览
（23 个非空单元格、AS 22、自然流量 23.9K）。
**任何当时读到 `cells > 0` 的探针，都会把 mmradar.gg 的数字记到 canva.com 名下。**
这就是上面那 10 条 `data` 必须复查「数是不是这个域名的」的原因。

### 分类之前的三条硬闸门（新增）

任一不满足 ⇒ 输出 `inconclusive`，**绝不输出 `no-table` 或 `empty`**：

1. **落地 URL 的 path == 请求的路由**（防销售页/弹跳）；
2. **页头的域名 == 请求的目标**（防 mmradar.gg 那类错配）；
3. **穿透之后的报表区内容非空**——承重的是**正向**证据（非空单元格 / 值形数字 /
   页面自己渲染的空态），字符数地板只是**兜底**，从属于正向证据，只会把结论推向
   `inconclusive`，永远不能反过来用。

另加两条同级前提：读数必须来自**穿透遍历**，报表区的根必须是**实测确认过的**（不是 `main` 这个惯例）。
**今天这轮扫描本该全部 `inconclusive`。**
实现在 `backlink/scripts/lib-deep-dom.mjs` + `backlink/scripts/lib-report-readiness.mjs`，
判据全文仍然只写在 backlink Skill 里 id 为 `readiness-must-bind-to-this-query` 的那条 law 里。

### 滚动不是根因，但那次观测有限度

实测 `body.scrollHeight === window.innerHeight`（772）、`scrollY` 滚 8 次从没动过、
350 秒内所有数字冻结。**但那是因为整个报表模块渲染空白**——一个什么都没渲染的页面
当然没有首屏之下的内容。**不能推广成「这个站不需要滚动」。**
另外在一个把外壳挂在 44 个 shadow root 里的页面上，真正的滚动容器很可能**不是 window**，
「滚 window 不动」和「没有可滚内容」读数一模一样。
分段滚动 + 每段等待的能力已加进取数探针，**默认关闭**（默认开启就是把一个没测过的假设
写进默认行为），探针每轮回报 `scrollContainers`，下一次实盘用数据来定这个默认值。

---

| 类别 | 旧计数（v4，早停） | 现计数 | 一句话含义 | 路由 |
|---|---|---|---|---|
| `data` | 2 | **10**（⛔ 全部**待复查**，见上面的作废公告；`filledCells` 只能当下界读） | 有表且有行，**只有这一类能直接喂给取数脚本** | `subfolders-subdomains`(900)、`usa`(459)、`sources-destinations`(272)、`audience-overlap`(204)、`geographical-regions`(198)、`trending-websites`(140)、`ai-traffic`(120)、`business-regions`(36)、`page-groups`(20)、`demographics`(20) |
| `chart-only` | 10 | **9** ⛔ **9 条判定已于 2026-08-29 全部作废**（`voided-blind-probe`），回到 `pending-remeasure` | ~~没有 table 元素，数在图里。9 条全部通过结构判据，判定 `no-table-structural`~~ —— **那个「没有 table 元素」是浅层探针读出来的，穿透之后不成立；见上面的作废公告** | `referral`、`organic-search`、`paid-search`、`organic-social`、`paid-social`、`email`、`display-ads`、`daily-trends`、`socioeconomics` |
| `data-not-in-table` | —— | **1** | **新分类。** 没有 table 元素，但**数据就在 DOM 文本里**（列表 + 条形图）。⚠️ **按非空单元格判会得 0，但不是没数据** | `behavior` |
| `pending` | —— | **0** | 还没拿到可采信判据。**这是待办，不是结论** | ——（B 的最终报告后已清零） |
| `empty-silent` | 8 | **0** | 列头齐全、0 行。⚠️ **8 条全部改判为 `data`，这一类在 node 5 上已经清零** | —— |
| `requires-input` | 1 | **1** | 路由正常，但要人先贴输入才产出。不是「空」 | `industry-and-bulk-analysis` |
| `not-a-report-route` | 1 | **1** | 压根不返回报表——是营销/定价页 | `trends-api` |

> 总数仍是 22（data 10 / chart-only 9 / data-not-in-table 1 / requires-input 1 / not-a-report-route 1）。
> 另外还有不在这次 sweep 里的 `top-pages`（850 格），见上面「节点差异是观测假象」一节——
> 它就是「能出表格数据 11 条」里的第 11 条。

#### ⚠️ 测量方 B 的界限声明：node 8 只完整测过 3 条路由

**JSONL 里 node 8 那几条 `empty-silent` 是早停协议下的旧观测，请当作未测，不要引用。**
既不要拿它们写「这条路由真的空」，也不要拿它们做节点对比。
这一轮唯一完整的结果是 node 5 那 22 条。

#### `empty-silent` 这一类已经归零 —— 8 条全部改判为 `data`

**先记住这一句：这条工具线上目前没有任何一条路由被判为「静默空表」。**
2026-08-28 那 8 条判定**全部是判据缺陷的产物**，耐心模式重测下逐条出数：

| 路由 | 老判定 | 新判定 | 非空单元格 | 前几格原文 |
|---|---|---|---|---|
| `/analytics/traffic/page-groups/` | empty-silent | **data** | 20 | `美国 / 18.73%·1.5亿 / 81.88% / 18.12% / 巴西` |
| `/analytics/traffic/demographics/` | empty-silent | **data** | 20 | `美国 / 18.73%·1.5亿 / 81.88% / 18.12% / 巴西` |
| `/analytics/traffic/business-regions/` | empty-silent | **data** | 36 | `APAC / 34.96% / 2.8亿 / 6769.9万 / 85.84%` |
| `/analytics/traffic/geographical-regions/` | empty-silent | **data** | 198 | `北美 / 20.69% / 1.6亿 / 4752.6万 / 82.63%` |
| `/analytics/traffic/audience-overlap/` | empty-silent | **data** | 204 | `chatgpt.com / 无类别 / 8.5亿 / 6.4亿 / 12.25%·1亿` |
| `/analytics/traffic/sources-destinations/` | empty-silent | **data** | 272 | `canva.com / 直接 / 79.32% / 6.3亿 / ↑4.4%` |
| `/analytics/traffic/usa/` | empty-silent | **data** | **459** | `加利福尼亚 / 13.92% / 1811.9万 / 531.5万 / 82.66%` |
| `/analytics/traffic/subfolders-subdomains/` | empty-silent | **data** | **900** | `/design/ / 35.74% / 6.1亿 / 1.4亿 / 2.8亿` |

**实盘那边的原话，原样记在这里：「我判过的每一条『空』，最后都是我等得不够。零例外。」**

`page-groups` 另有一条跨节点对照：**node 5 的结果与 node 8 逐格相同**（都是 20 格）。
这是继 `top-pages`（两节点都 850 格、前 5 格逐字相同）之后**第二条**跨节点一致的路由。

##### 为什么会错两次 —— 而且第二次是第一次的「修复」

**第一次（判据 v4）**：「`vis === 'visible'` 且累计 3 次可见读 → 采信为空」，
可见读间隔 6 秒，**最快 18 秒就下了「空」的结论**。而这些页面的渲染顺序是
**摘要 → 图表 → 表格，表格永远最后**——表格还没开始渲染的时候，连续读多少次都是
**稳定的空**。**「稳定」不等于「完成」。**

> **这条实测机制值得单独记住**：**摘要区已经出数、表格仍 0 行，是正常中间态，不是空表。**
> 而 `captureStable` 那套「读两次一致就收下」在这里**恰好会被稳定的空态骗过**——
> 0 行本身就是完全稳定的，两次一致来得又快又毫无意义。

**第二次（判据 v5，也就是第一次的修复）**：给它加一个「最小等待下限」——
「可见读满 3 次 **且** 本轮等满 100 秒」，每轮上限 150 秒。**这个下限同样不够。**
上表 8 条里，`geographical-regions` 和 `business-regions` 是**第二次重测**才出的数——
100 秒没兜住它们，而且**同一页两次表现不一样**。重表格页的水合时间跨度大而且不稳定。

##### 正确的方向不是把下限调大

**固定时间下限本身也不是充分条件。** 100 秒被证明不够，600 秒是现在的经验值而不是保证。
**只要判据的形状是「等够久 + 还是空 → 判空」，它就永远只是在赌一个阈值**，
而阈值随页面、随目标、随负载变化。所以规矩改成：

- **「空」这个结论默认就是暂定的**，不是等够时间就能转正的；
- **判空必须绑定到一个正向的「本页已渲染完成」信号**——分页器出现、行数计数出现、
  加载指示消失、某个只在数据到位后才出现的控件。这种信号和「非空单元格」一样，
  是**本次查询的产物**；等待时长不是；
- **拿不到那种信号时，输出 `inconclusive` 而不是 `empty`。** 这两个词对下游的意义完全不同，
  本仓库的规矩是宁可显式失败；
- **时间下限保留，但它是兜底不是判据**：它约束一轮能跑多久，不构成下结论的理由。

现行协议 **`v6-patient-signal-gated`**：每轮 200 秒、3 轮跑满不早停、单条最长 600 秒。

**被推翻的记录一律保留，标注在 JSON 的 `supersededObservation` 里，不删。**
正是因为旧记录还在，才比得出「摘要有数、表格 0 行」这个关键对照。

这两次分别是那条 law 的**实例 5 和实例 6**。另外：仓库里 `captureStable` 的注释早就写过同一件事
（这些厂商的指标区分两拍渲染，只认标签的就绪判据会在中间态通过，错得很安静），
**这次等于又犯了一遍**——教训当时被记成了「关于 `captureStable` 的事实」，
而不是「关于判据的事实」，所以没有迁移过来。

#### `chart-only` 那 10 条：拆成四档，只有一档可采信（2026-08-29）

> ⛔ **本小节整节的结论已于同日晚些时候作废**，见本节开头的作废公告：
> 下面的 `chartHydrated` / `exportBtns` 计数出自一个对 shadow DOM 失明的探针，
> 两个信号已退役，9 条 `structural-confirmed` 全部回到 `pending-remeasure`。
> **原文保留，只标注被什么推翻。**

它们原本是**同一个早停判据下测出来的**，同一个 bug。表现确实和「静默空表」不同——
**连 `table` 元素都不存在**，而不是有表 0 行——但这不构成免测的理由，原话：
**「虽然它们的表现不同，但我不能凭这个就免测。」** 耐心模式重跑之后结果如下。

**判据不在这里。** 区分「这条路由本来就没有表格」和「表格还在路上」，
用的是一条四条件、连续两次读都要满足的**结构判据**，以及两个刻意分开的判定名
`no-table-structural`（可采信）/ `no-table`（不可采信），2026-08-29 又加了第三个
`data-not-in-table`。**判据全文和三个判定名只写在**
backlink Skill 里 id 为 `readiness-must-bind-to-this-query` 的那条 law 的 `<correct>` 块里，
这里不复述，也不要在别处再抄一份。只记住它的含义一句话：
**「页面别的部分都好了，就是没有表格这个东西」**——光是「没有 table 元素」证明不了任何事，
因为还没开始渲染的页面同样没有 table 元素。

**2026-08-29 判据修订：结构判据去掉了 `vis === 'visible'` 那一项，保留「目标已生效」那半。**
去掉的理由两条，互相独立：

1. **没必要。** `chartHydrated` 和 `exportBtns` 已经**直接**证明「页面其余部分渲染完了」，
   而且这些页面的渲染顺序是 摘要 → 图表 → 表格，**图表数字渲染出来 = 流水线已经走到表格的前一站**。
   可见性只是同一件事的代理项，效果本身可观测时，代理项不增加任何信息。
2. **有害。** 一次 foreground attach 会把 `visibilityState` **永久锁死在 `visible`**
   （铁证：同一个 Chrome 窗口里两个标签页同时报 `visible`）。于是这个条件
   **在被污染的会话上恒真**（形同虚设），**在诚实的纯后台会话上反而可能为假**（误杀一条成立的结构判定）。
   一个「在它恒真的地方不增加信息、在它诚实的地方偶尔为假」的条件，比没有还差。
   ⚠️ **措辞收窄 2026-08-29（Experiment F）**：被钉住的会话不是在「撒谎」——
   rAF 帧数证明它**真的按 visible 调度**（181 帧）。它只是把 `visibilityState`
   变成了一个恒定值，因此**不再是一次测量**。去掉这一项的结论不变，理由更准确了。

**保留「目标已生效」那半是必须的**：空态落地页是一个**完美的 `noTable === true`**。
条件一被满足得最彻底的那个页面，恰恰是根本不是你那份报表的页面。

**连带结论：4 条 `structural-confirmed` 的判定不受 `visible` 锁死污染影响**，
因为它们靠的是图表数字和导出按钮，都是页面产出。
`referral` / `organic-search` 那 98 / 96 次「visible 读」**作为可见性证据不成立**
（`semrush-traffic.mjs` 的 `DEFAULT_WINDOW = 'foreground'`，那个字段在这些会话上是恒定值），
但它们从来不是可见性证据——是 98 / 96 次「0 个 table 元素」的 DOM 观测，这一点不受影响。
**所以那批读数的可信度既不提升也不下降。**
⚠️ **收窄 2026-08-29（Experiment F）**：这里说的「作废」只是**作废它作为可见性证据的身份**，
不是作废读数。这些标签页建时就是 foreground，**它们确实是 visible 的**，
DOM 观测本身有效。**不要因为这条去重跑它们。**

⚠️ **这不动摇「可见性伪空」那条 law。** 两者说的是两件事：
可见性管的是**表格里的行会不会水合**（`top-pages`：hidden 0 格 / visible 850 格，三次交叉验证），
不是**`table` 这个元素存不存在**。结构问题和取值问题，别合并。

| 档 | 条数 | 路由（括号内为 `chartHydrated / exportBtns`） | 能不能用 |
|---|---|---|---|
| **structural-confirmed** ⛔ 已作废 | 9 | `organic-social`(30/5)、`paid-social`(34/5)、`email`(23/4)、`display-ads`(29/4)、`referral`、`organic-search`、`paid-search`、`daily-trends`、`socioeconomics` | **能**。判定 `no-table-structural`。后 5 条 B 的最终报告只给了「均通过结构判据」，没逐条转述 chart/exp 计数，JSON 里那两个字段记 `null` 而不是编一个 |
| **data-not-in-table** | 1 | `behavior` | **能，但不是这一类的用法**。它没有 table，可**数据在 DOM 文本里**，见下一节 |

**`behavior` 从「弱证据 pending」翻案成一个独立类别，方向和原来相反。**
原来记的是 `chart=0 / exp=0`，读作「整页章节都没渲染，等于什么都没测到」。
实测复查发现它**根本没有 table 元素，而数据一直在页面上**，用列表 + 条形图呈现：

> `YouTube 71.8% 1.5亿 | Facebook 49.36% 1亿 | Instagram 48.61% | Reddit 33.71% | TikTok 28.06%`

另有兴趣度和设备分布。**按「非空单元格 > 0」判，它得 0——而正确结论绝不是「没数据」。**
那次 `chart=0 / exp=0` 的读数本身没错，错的是拿它去回答「这条路由有没有数据」；
它只能回答「有没有**表格型**数据」。

取数方式：**按路由声明 `presentationShape` 和本路由自己的锚点维度名**
（`behavior` 是 社交媒体 / 兴趣度 / 设备），在锚点标题所属的 section 子树里取数值。
⚠️ **绝不能改成「页面上有数字就算有数据」**——那正是 `axa.fr` 挂件那个假阳性。

⚠️ **`chart-only` 和 `empty-silent` 的补救方式相反**（前者重读没用、后者要等），
这个区分本身仍然成立；`empty-silent` 已清零，`chart-only` 9 条全部结案。
**`data-not-in-table` 是第三种，两种补救都不适用**：重读没用，等也没用，要换读取形状。

#### 三条容易被记错的判定

1. **`industry-and-bulk-analysis` 不是「没数据」，是「需要输入才产出」。**
   主体区原文：`批量分析 | 商家类别 | 竞争对手 | 0/100 | of 100 lines | 将文件拖放到此处或浏览 | CSV 或 TXT 小于 5MB | 文件每行必须包含一个 URL | 分析`。
   它**不吃 URL 上的目标**，要人贴最多 100 行域名（或传 <5MB 的 CSV/TXT）。
   sweep 把它记成 `inconclusive-target-lost`，只是因为页头没有 `canva.com`——**页头本来就不会有**。

2. **`trends-api` 是纯营销页，不是数据路由，而且它的定价要单独记。**
   页面原文：`基础版 | 访问流量摘要 | 每月 10,000 个 API 单位 | API 文档和设置指南 | $1000 | /月`，
   `高级版 | 自定义套餐和定价 | 联系销售团队`（含 16 种额外数据类型、每日和每周流量数据、购买转化洞察见解），
   另有「通过 MCP 将 Trends API 连接到 Claude、Cursor 或 VS Code」的宣传。
   **`Trends API $1000/月` 独立于 App Center 里那条 `semrush-traffic-and-market` $289/月**——
   两条不同产品线的价格，别混着报。

3. **`trending-websites` 出数，但它不吃目标域名。**
   它是全球榜单（样本原文 `google.com | 105.85B | 30.22%/31.99B | 69.78%/73.86B | ↑7.8%`），
   所以它 `targetVisible=false` 是**正常的，不是「目标丢了」，更不是一次失败的读**。
   以后看到这条记录别再把它当成需要重跑的失败。

#### 一个渲染 bug（如实记录，成因未查）

`/analytics/traffic/usa/` 的主体区漏出未解析的 i18n key，原文：
`state.undefined | state.undefined | 流量比例 | n/a | 访问量 | n/a`——汇总值是 `n/a`，
表格 0 行。**这是观测，不是结论。**

#### 顺带修正两个口述数字

写这一节时的口头摘要说「出数 3 条：`ai-traffic` / `top-pages` / `trending-websites`，
图表型 9 条」。**以落盘的 sweep 文件为准，两处都不对**：

- `top-pages` **根本不在这次 node 5 的 22 条里**（它只在文件末尾以 node 8 的复测行出现，
  当时读到 `no-table`、0 格，那一轮还在跑）。所以本次 sweep 里出数的是 **2** 条。
  `top-pages` 的 850 格是**另一次**实测，那条结论不受影响。
- 图表型是 **10** 条，不是 9——上表已列全。
  **再更新 2026-08-29：现在是 9 条。** 原来那 10 条里的 `behavior` 已经拆出去，
  单列为 `data-not-in-table`；剩下 9 条全部通过结构判据。

