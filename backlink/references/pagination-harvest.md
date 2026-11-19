# 大表翻页批采

`ground-truth.mjs` 一次只看**第 1 页**。这在勘测阶段是对的——判「这页有没有数据」
只需要第一屏。但一旦要用数据，第 1 页往往只是零头：

| 路由（canva.com，2026-08） | 分页器自报 | 第 1 页拿到 | 占比 |
|---|---|---|---|
| `top-pages` | Page 1 of **1,430** | 50 行 | 0.07% |
| `subfolders-subdomains` | Page 1 of **2,611** | 50 行 | 0.04% |
| `sources-destinations` | Page 1 of **930** | 50 行 | 0.1% |
| `audience-overlap` | Page 1 of **9**（共 429 个域名） | 50 行 | 12% |

本文回答四件事：**这张表怎么分页 / 三种机制各自怎么采 / 采多少才不烧配额 /
采完怎么知道没丢行**。脚本是 [`scripts/harvest-paginated.mjs`](../scripts/harvest-paginated.mjs)
（纯函数层在 [`scripts/lib-pagination.mjs`](../scripts/lib-pagination.mjs)）。

先读 [`harvest.md`](harvest.md)：那里的坑（虚拟滚动、URL 列必须读属性、后台标签节流、
失败的抓取不许写进正式路径）**在翻页场景里一条都没消失，只是重复了 N 遍**。

---

## 一、先判机制，再动手

**在一个新页面上花两分钟判机制，能省掉几小时的白跑。** 四种机制，判据都在下面这张表里。

| 机制 | 判据（怎么看出来的） | 翻页动作 | 断点续跑的代价 |
|---|---|---|---|
| **URL 驱动** | URL 里已有 `page`/`offset`/`start` 之类参数，**且**改掉它重载后表格内容变了 | 直接 `open` 新 URL | 零：页码就是地址，任意页随时可达 |
| **客户端分页** | 页面底部有分页器（`Page 1 of N` / `Prev` `Next` / 页码输入框），但 URL 里没有页码 | 点 `Next` 或往页码输入框里填数字 | 中：续跑要么从第 1 页顺序点回去，要么用输入框跳 |
| **虚拟滚动 / 懒加载** | 没有分页器；行数随滚动增长 | 滚（见 harvest.md 的坐标重建行） | 高：没有页号这个坐标，只能从头滚 |
| **一屏到底** | 没有分页器；滚动时行数不变 | 无 | — |

### 判定流程（离线一半，实盘一半）

**离线那一半**（不烧配额，能从已有证据里读出来）：

1. 拿这一页任意一份 `census-*.json`，在 `census.deepText` 里搜 `Page` / `第` / `共`
   （**别只看尾部**，见下面的警告）。`parsePager()` 认得四种形态：

   | 形态 | 实际文本 | 出处 |
   |---|---|---|
   | 碎片式 | `Prev\nNext\nPage:\nof\n1,430\nPage: 1` | Semrush Traffic Analytics（`Page:` 后面是输入框，文本里只剩标签；当前页在无障碍副本里） |
   | 行内式 | `Page 3 of 1,430` | 多数英文后台 |
   | 中文式 | `第 3 页，共 2,611 页` | 中文后台 |
   | 行区间式 | `1 - 100 (~50,988)` | Semrush backlinks（**没有页号，只有行区间**；总行数照样能做自检） |

   ⚠️ **两个陷阱，2026-08-30 实盘各踩一次：**
   - `census` 默认只采 `sampleChars: 20000` 的样本，分页器不一定在里面。
     **「census 里没有分页器」判不了「这页没有分页」。**
   - **「深层文本的尾部」不是「页面的底部」。** `deepTextSample` 逐 shadow root 取
     `innerText`、取不到就退 `textContent`——于是 `<style>` 里的 CSS 全进了样本。
     实测取 40 万字符样本的尾部 3000 字，全是 `semi-popover-wrapper{...}` 这类样式规则，
     一个分页器字样都没有。所以 `harvest-paginated.mjs` 不取尾部，而是**定点找**：
     先找文本恰好是 `Prev`/`Next`/`Page:`/`of`/`第`/`共` 的叶子，再往上爬到一个
     文本量还小（≤300 字符）的祖先，取它的文本。

2. 看 URL 里有没有页码类参数（`findUrlPageParam()`）。
   Semrush Traffic Analytics 的 URL 是
   `/analytics/traffic/top-pages/?q=<domain>&searchType=domain&lid=<lid>`——
   **一个页码参数都没有**，所以它不可能是 URL 驱动的形状。

**实盘那一半**（约两次页面加载，不采数据）：

```sh
node backlink/scripts/harvest-paginated.mjs \
  --url 'https://sem.proxy.example.com/analytics/traffic/top-pages/?q=canva.com&searchType=domain&lid=<lid>' \
  --out backlink/evidence/pagination/probe-top-pages --probe
```

它做的事：采第 1 页 → 往 URL 上加 `?page=2` 重开 → 采第 2 页 → 比两页的**行指纹**。
产物 `manifest.json` 的 `probe` 段里有 `contentChanged`。

**`contentChanged: true` 不等于「URL 驱动」**——内容变了也可能只是重新取了一次数、
或者换了排序。判 URL 驱动要再看一眼：第 2 页的第 1 行，是不是接着第 1 页的最后一行？
这一步脚本不做，因为它是判断（`scripts-collect-ai-judges`）。两份 census 摆在一起，
你自己看。

### 已判定：Semrush Traffic Analytics = 客户端分页

- 分页器文本在（`Prev / Next / Page: [输入框] of 1,430`），**URL 里没有任何页码参数**
  （2026-08-29 的 `census-s5.json`，href 全程是
  `/analytics/traffic/top-pages/?q=canva.com&searchType=domain&lid=…`）。
- **无滚动懒加载**：滚动全程 `filledCells` 恒为 850、深层文本恒定。
  50 行在渲染完成那一刻就全在 DOM 里，更多数据在分页里、不在滚动里。
- 每页 50 行；`top-pages` 17 列、`subfolders` 18 列。
- **2026-08-30 实盘证实**（`audience-overlap`，nytimes.com，15 页）：
  `mechanism.kind = client`、`confidence = high`，分页器读作
  `Prev Next Page: of 15 Page: 1`，连点 `Next` 逐页翻动、每页 50 行。详见第六节。
- **`--probe` 仍未跑过**：「加 `?page=2` 会不会意外生效」是未知数。
  它只可能让事情变简单（真生效就升级成 URL 驱动），判不成也不影响客户端分页这条路。

---

## 二、三种机制的采集配方

三条配方共用同一套纪律，差别只在「怎么到下一页」。

### 共用纪律（四条，脚本里已经写死）

1. **绝不默认全量。** `--max-pages` 默认 **5**，硬上限 **200**。计划被截断时，
   stderr 与 `manifest.notice` 里必须出现「本轮只采了 N/M 页……这是抽样，不是全量」。
   静默截断就是把抽样冒充全量。
2. **每页都要有证据。** 每页固定落一份 `census-p<N>.json`（DOM 证人）+
   `page-<N>.tsv`（行）。截图按 `--shot-every` 抽样（默认每 5 页一张，
   **首页与末页必留**），抽样规则写进 `manifest.shotEvery` / `shotPages`。
   只留一个合并结果 = 出了错没有现场。
3. **翻页成功要绑内容，不绑页码——而且「内容」必须是数据。** 四条同时成立才算这一页到了：
   `filledCells > 0` + 取行策略与第 1 页一致 + 行指纹与上一页不同 + 连续两读一致。
   两边都有实测教训：**页码变了表格没换**（harvest.md：Semrush backlinks 连点 12 次
   `Next` 抓回 1200 行、去重只有 90 个唯一源），以及反过来——**表格正在重建、
   取行降级抓到了导航栏，指纹也「变了」也「稳定」**（2026-08-30 实盘，第六节）。
   `pageFingerprint()` 刻意只用行内容、不含页号，就是为了让第一种情况暴露出来。
4. **对不上就打标，不下判断。** 见第四节。

### 配方 A：URL 驱动

最省事。`--pager url --page-param page`，每页一次 `open`。
断点续跑天然成立（页码就是地址）。注意 URL 里带页码后 `q=`/`lid=` 一个都不能少——
Semrush 这棵树上 `q=` 会被 `lid` 覆盖（见 `platforms/semrush/traffic-analytics/OVERVIEW.md`）。

### 配方 B：客户端分页（Semrush TA 属于这一类）

**只有 `Next` 是可靠的。** 2026-08-30 实盘：页码输入框**根本定位不到**
（`no page input found`，连采三页全废）。所以脚本的主路是**连点 `Next` 走过去**：
目标页在当前页之后、距离不超过 `--max-next-walk`（默认 25）时逐跳前进，
中间那些页只导航不落盘，每一跳都要满足上面那四条就绪条件。
`Next` 的定位是自己按 `textContent` 精确匹配再爬到可点祖先——
`opencli click --text` 在 Semrush 上大量多重匹配，`matches_n>1` 时它根本不点。

跳页那条路（`focus()` + `execCommand('insertText')` + **合成 KeyboardEvent Enter
三连**，keyCode 13、bubbles）仍然留着——受控输入直接改 `value` React 状态不更新，
CDP 真键在 Semrush 的同类输入上实测也不生效（`traffic-analytics/OVERVIEW.md`
的建列表配方里踩过同一个坑）——但**它没跑通过**。失败时会落一份
`pager-diag-p<N>.json` 记下当时找到了哪些候选输入框，下次接着修。

**续跑的代价在这里最高，而且是真的要付**：客户端分页没有把页码写进 URL，
浏览器一关状态就回到第 1 页。所以续跑要采第 40 页，就得**真的点 39 次 `Next`**
（不重采、只重导航，但仍占时间和锁）。`--max-next-walk` 就是这笔开销的闸门：
走不到的抽样点，脚本会记失败而不是偷偷少采。

### 配方 C：虚拟滚动 / 懒加载

没有页号，只有滚动位置。用 `ground-truth.mjs` 的分屏循环（双证人到底判据）
或 harvest.browser.js 的坐标重建行 + Blob 导出。两个必须记住的判据：

- **「行数不涨」不等于「到底了」**：也可能是滚错了对象（主滚动条在内层 div，
  window 滚动是空操作）。到底 = census 与截图 md5 **双双**不变。
- 后台标签的定时器节流会随时间恶化到**每分钟一步**（harvest.md）。长滚动任务必须前台。

---

## 三、配额成本：1,430 页要多久，什么时候该改抽样

### 时间账（按已实测的数字算）

已实测：
- 冷启动到数据落进 DOM：**61–76 秒**（top-pages）；`sources-destinations` 的骨架屏
  可达 **4 分钟**才出数。
- 翻页后的重渲染耗时：**未实测**。脚本的节奏是 `PAGE_POLL_MS = 2 秒`，
  就绪要求「变了 + 连续两读一致」，所以下界是 ~4 秒 + 每次 `eval` 的往返开销。
  合理估计带 **5–20 秒/页**，但这是估计不是测量。

于是：

| 规模 | 10 秒/页 | 20 秒/页 |
|---|---|---|
| 5 页（默认） | ~1 分钟 | ~2 分钟 |
| 40 页（2,000 行） | ~7 分钟 | ~13 分钟 |
| 200 页（硬上限） | ~33 分钟 | ~67 分钟 |
| **1,430 页（top-pages 全量）** | **~4 小时** | **~8 小时** |
| **2,611 页（subfolders 全量）** | **~7 小时** | **~15 小时** |

**第一件事不是决定采多少页，是把「秒/页」测出来。** 跑一次 `--max-pages 5`，
拿 `manifest.pages` 里的时间戳差算出实测值，再往上推。**不许拿上表当结论用**。

### 为什么全量不是「慢一点」而是「不行」

采集期间**整轮持机器级 semrush 锁**（`one-collector-per-quota-tool`）。
一个 4 小时的进程握着锁，意味着这台机器上**所有**其他 Semrush 工作流停摆 4 小时。
锁的默认超时是 600 秒，等锁的 agent 会一个个超时失败——2026-08-28 已经发生过
一个 agent 等锁 56 分钟颗粒无收。**所以单轮不该超过 200 页（硬上限），
超过就拆成多轮，每轮之间放锁**：脚本的断点续跑就是为这个存在的，
同一条命令重复跑，每次推进 `--max-pages` 页。

### 配额本身：**未测量，按未知处理**

「翻一页会不会扣 Semrush 的报表额度」这件事**本仓库没有测过**，不要凭感觉断言。
可测的做法：

1. 采集前读一次账号页头的额度指示器（截图 + census 留证）；
2. 跑一次 `--max-pages 5`；
3. 再读一次额度指示器。差值 ÷ 5 = 每页成本。

测出来之前，`--max-pages` 就保持在个位数。

### 还有一种上限：**账号本身就不给你翻**

harvest.md 记着 Tools Share 共享账号在 `/analytics/backlinks/backlinks/` 上的硬顶：
`Next` 可点、无 `disabled`、`click` 返回 `clicked:true`，但范围指示始终停在
`1 - 100 (~50,988)`。**这不是脚本坏了，是套餐边界。**

好消息是**这种情况第 2 页就能识破，成本约 30 秒**：两页行指纹相同 →
`verifyRowCount` 报 `duplicatePages` → `rowCountMismatch: true`。
所以**任何新表的第一轮都先跑 `--max-pages 2`**，确认翻页真的动了，再往上加。

### 什么规模该放弃全量，抽样怎么抽才不偏

**判据：预计耗时 > 30 分钟（约 200 页）就别想全量了。** 按上面的表，
这条线大约落在「总页数 > 200」——`audience-overlap`（canva 9 页 / nytimes 15 页）可以全量，
`top-pages`（1,430）、`subfolders`（2,611）、`sources-destinations`（930）都不行。

抽样怎么抽，取决于**你要回答什么问题**。这三种表都是**按流量降序排的**，
这一点决定了一切：

| 你要回答 | 抽法 | 为什么 |
|---|---|---|
| 「哪些页面扛流量」「抄谁的页面结构」 | **`--mode head`，前 20–40 页**（1,000–2,000 行） | 幂律分布，头部就是答案。这不是「有偏样本」，这是**正确的样本**——你要的本来就是头部 |
| 「这个站一共有多少 XX 类页面」「长尾长什么样」 | **`--mode stratified`，等距系统抽样** | 按秩分层，每层抽一页 |
| 「总流量怎么分配」「头部占比多少」 | **头部全采 + 尾部分层抽样，分开报** | 见下 |

**系统抽样的两条纪律**：

1. **`--offset` 必须落盘并在续跑时原样传回。** `planPages` 的样本是
   `offset + 1 + k·step`——offset 换了，样本就换了，两轮的结果拼在一起不再是
   一个概率样本。脚本把它记进 `state.json` 与 `manifest.offset`。
2. **`offset` 要随机取（0 到 step-1），不要恒为 0。** 恒为 0 就永远抽第
   1、201、401… 页，如果表里有周期性结构（比如每 200 行一个语言块）就系统性偏了。

**绝对不许做的事：拿头部样本外推总量。** 头部 40 页的每行平均流量比全表高几个数量级，
乘以 71,500 会得到一个比该站总流量还大的数。要总量就报「前 N 行合计 = X，
占分页器自报总行数 71,500 的 2.8%」，把口径写在数字旁边。

---

## 四、静默丢行：采完怎么知道自己没丢

这是整件事里最危险的一段，因为**丢行不报错**。harvest.md 的实测：某报表 100 行里
78 行是长 URL，长 URL 在单元格里换行 → 该格跨两个 Y 分桶 → 整行被拆散 →
被 `minCells` 过滤掉，**坐标法只回收到 18 行，没有任何报错，肉眼看输出也很正常**。

`verifyRowCount()` 在合并后跑四条机器判据，任一命中 → `manifest.rowCountMismatch: true`：

| 判据 | 抓的是什么 | 命中后先怀疑什么 |
|---|---|---|
| `shortPages` | 非末页却少于 `rowsPerPage` 行 | 静默丢行（长 URL 换行、Y 聚类被拆）。看那一页的 `strategy` 字段：从 `role-row` 掉到 `leaf-ycluster` 就是降级了 |
| `duplicatePages` | 两页行指纹相同 | 翻页没生效（套餐硬顶，或 `Next` 点了没反应） |
| `duplicateRows` | 跨页重复行 | 同上，或表在采集期间被重排了 |
| `totalMismatch` | 全量采完时唯一行数 ≠ 页面自报总行数 | 口径不同（自报的是"域名数"不是"行数"），或真丢了 |

**这四条都只是「对不上」，不是「丢了」。** 判断归 AI：拿 `manifest.audit`、
出问题那一页的 `census-p<N>.json`、以及（如果抽到了）`shot-p<N>.png` 三样对质。
`rowCountMismatch: true` 的退出码仍是 **0**——采集本身完成了，别让下游脚本
把「对不上」当成「跑失败了」而重跑一遍烧配额。

### 除了脚本能查的，还有两条要人看

- **`strategy` 要在所有页上一致。** 一页 `role-row`、下一页 `leaf-ycluster`，
  说明 DOM 形状变了（或者那一页压根没渲染完），两页的列序很可能对不齐。
- **抽到截图的那几页要真的看一眼。** 双证人的意义就在这里：census 说 50 行、
  截图上却是骨架屏，那 50 行是壳不是货（`sources-destinations` 的骨架屏可达 4 分钟）。

---

## 五、脚本速查

```sh
# 0. 开工前：这台机器现在能不能动手（锁被谁拿着）
node opencli/scripts/pressure.mjs --tool semrush

# 1. 判机制（约 2 次加载，不采数据）
node backlink/scripts/harvest-paginated.mjs --url '<url>' --out <dir> --probe

# 2. 试水：先 2 页，确认翻页真的动了（duplicatePages 会当场抓出套餐硬顶）
node backlink/scripts/harvest-paginated.mjs --url '<url>' --out <dir> --max-pages 2

# 3. 正式采：头部
node backlink/scripts/harvest-paginated.mjs --url '<url>' --out <dir> --max-pages 40 --shot-every 10

# 4. 长尾分层抽样（offset 随机取一次，之后所有轮次都用同一个）
node backlink/scripts/harvest-paginated.mjs --url '<url>' --out <dir> \
  --mode stratified --max-pages 30 --offset 17

# 5. 中断了？原样再跑同一条命令 —— 读 <dir>/state.json，已采的页不重采
```

产物（`<dir>/`）：

| 文件 | 是什么 |
|---|---|
| `manifest.json` | 机制判定、本轮计划与 `notice`（「只采了 N/M 页」）、每页记录、`audit`、`rowCountMismatch`、锁与落点自检 |
| `state.json` | 断点续跑状态。**版本/URL 对不上就整份作废重来**，绝不在不认识的状态上续跑 |
| `census-p<N>.json` | 每页的 DOM 证人（行数、`strategy`、分页器文本、census 读数、前 3 行样本） |
| `shot-p<N>.png` | 抽样截图（像素证人）。抽样规则见 `manifest.shotEvery` |
| `page-<N>.tsv` | 每页的行。首列是该行第一个链接的**完整** href/title（URL 列必须读属性） |
| `rows.tsv` | 跨页去重后的合并结果 |

---

## 六、实盘验证记录（2026-08-30）

**跑过了，而且第一次就没跑通——四个 bug 全是实盘抓出来的，离线测试一个都看不见。**

目标：`audience-overlap`（nytimes.com，`lid=1234971`），**15 页**。
选它是因为它小：一次能采完，翻页失控也只有 15 页可烧。会话 `semrush-nav`，
整轮持机器级 semrush 锁，`pressure.mjs --tool semrush` 报 go 之后才动手。

### 实盘抓出来的四个 bug（都已修，都写进了脚本注释）

1. **就绪判据被兜底策略骗了（两次）。** 第一版写的是
   `isReady(census) || rows.length > 1`。页面外壳里有 6 个空的 `role=row`，
   于是脚本在 `filledCells=0`（一个数据都没有）时就判了就绪，接着报 `no-pager` 退出。
   修了第一处之后，续跑那轮又栽在同一个坑的变体上：兜底策略 `leaf-ycluster`
   从**导航栏**里聚出了 2 行，`rows.length >= 2` 再次成立。
   现在的判据是 `filledCells > 0` 或（`role-row` 且 ≥2 行）——
   `leaf-ycluster` 出的行不构成就绪证据。
   这就是 `readiness-must-bind-to-this-query` 那条法律的第 N 次现形：
   **「有东西」不等于「有这一查询的数据」。**
2. **分页器文本不能靠「深层文本的尾部」取。** `deepTextSample` 逐 root 取
   `innerText`、取不到退 `textContent`——于是 `<style>` 里的 CSS 全进了样本，
   40 万字符的尾部 3000 字全是 `semi-popover-wrapper` 之类的样式规则，
   一个分页器字样都没有。**「分页器在页面底部」这件事，在「按 root 顺序拼接的
   文本」里根本不成立。** 改成定点找：先找分页器关键词的叶子，再往上爬到一个
   文本量还小的祖先取它的文本。改完当场读出 `Prev Next Page: of 15 Page: 1`。
3. **翻页中途的重渲染被当成了「第 2 页」。** 点完 `Next`，表体被整个卸掉重建，
   那一瞬 `filledCells=0`、`role=row` 一个不剩，取行降级到 `leaf-ycluster`
   抓到了导航栏（「流量与市场 价格 Enterprise…」）。指纹确实变了、也连着两读一致
   （因为壳是静止的），于是导航栏被存成了第 2 页。
   **行数自检当场报了 `shortPages`（2 行 vs 50 行）——它按设计工作了**，
   但脚本本就不该把它当成功。现在每页要四条同时成立才算到：
   `filledCells>0` + 取行策略与第 1 页一致 + 指纹变了 + 连续两读一致；
   凑不齐就记失败、留 `census-p<N>-failed.json` 现场，不存那一页。
4. **失败的抓取覆盖了正本。** 续跑那轮的 `no-pager` 分支调了
   `capturePage(1, …)`，把上一轮采到的 50 行 `page-1.tsv` **覆盖成了 2 行导航栏垃圾**。
   [`harvest.md`](harvest.md) 开头第一条写的就是这个，本脚本还是犯了一遍。
   现在失败路径一律写 `-nopager` / `-unready` / `-failed` 后缀，正式产物一个字节不碰。

### 还有一个设计假设被实盘证伪

**页码输入框跳页不可用。** 浏览器一关，页码状态回到第 1 页；续跑要采第 4 页时
走了输入框那条路，结果 `no page input found`，连采三页全废。
分页器上真正稳的控件只有 `Next`。所以客户端分页现在**一步一步走**：
目标页在当前页之后、距离不超过 `--max-next-walk`（默认 25）时连点 `Next` 过去，
中间那些页只导航不落盘。**代价是真实的**——走到第 40 页要点 39 次，
这正是「客户端分页的续跑代价最高」那句话的实测形态。
（跳页那条路仍然留着给 `--mode stratified`，但**它没跑通过**；
失败时会落一份 `pager-diag-p<N>.json` 记下当时找到了哪些候选输入框。）

### 修完之后的实测结果

| 轮次 | 命令 | 结果 |
|---|---|---|
| 第 1 轮 | `--max-pages 3` | page 1/2/3 各 50 行，`strategy=role-row`，`pagerCurrent` 依次 1/2/3 |
| 第 2 轮（续跑，同一条命令） | `--max-pages 3` | `resumedFrom=3`，计划自动变成 4/5/6，各 50 行，`pagerCurrent` 依次 4/5/6 |

合并后 **300 行、300 个唯一行、`rowCountMismatch: false`**，
`lockHeld: true`、`hijacked: false`、`finalHref` 里 `q=` 与 `lid=` 对得上、
`__gmitm=` 只剩键名。截图按 `--shot-every` 抽样，`manifest.shotPages` 记着抽了哪几页。
证据（本地，gitignore）：`backlink/evidence/pagination/audience-overlap-live/`。

**`pagerCurrent` 与请求页号逐页一致，是「Next-walk 真的走到了目标页」的独立旁证**——
它不参与就绪判据（判据只看内容），所以它是第二个证人。

### 仍未验证的部分

- **`--probe`（URL 参数驱动的实证）没跑过。** Semrush TA 的 URL 里没有页码参数，
  加 `?page=2` 会怎样仍是未知；不影响客户端分页这条路。
- **跳页（页码输入框）没跑通**，因此 `--mode stratified` 在 Semrush TA 上
  目前只能靠 Next-walk 走到抽样点（步数受 `--max-next-walk` 限制），
  抽样点太靠后就走不到。要在这张表上做长尾抽样，得先把输入框的定位解决。
- **每页耗时没有正式计量**（第三节的秒/页仍是估计）。`manifest.pages[*].at`
  里有时间戳，下次跑的人顺手算一下并把实测值填回第三节。
- **翻页扣不扣配额仍未测量**，第三节的测量配方照旧有效。
- **只在 15 页的小表上验证过。** 1,430 页的表上会不会出现新形状（比如页码超过
  某个值后分页器换形态）未知。
