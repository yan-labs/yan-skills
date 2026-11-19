# Traffic Analytics（流量与市场）板块索引

URL 基式：`/analytics/traffic/<路由>/?q=<domain>&searchType=domain`（host: sem.proxy.example.com）。
19 条路由已于 2026-08-29 用双证人（ground-truth.mjs）全部判决，判决书见
`backlink/SKILL.md` 的 `<semrush-traffic-route-capabilities>` 块（证据目录 gitignore，本地在
`backlink/evidence/ground-truth/remeasure-*` 与 `recheck-*`）。

## 有表格数据的路由（readyBranch=table）

| 路由 | filledCells (canva.com) | 回答什么 | PAGE.md |
|---|---|---|---|
| `top-pages` | 850（50 行×17 列，共 1,430 页） | 竞品哪些页面扛流量、各渠道占比 | **✅ `top-pages/PAGE.md`** |
| `subfolders-subdomains` | 900 | 流量按子目录/子域怎么分 | ✅ [`subfolders-subdomains/PAGE.md`](subfolders-subdomains/PAGE.md) |
| `usa` | 459 | 美国市场切片 | ✅ [`usa/PAGE.md`](usa/PAGE.md) |
| `sources-destinations` | 272 | 流量从哪来、往哪去 | ✅ [`sources-destinations/PAGE.md`](sources-destinations/PAGE.md) |
| `audience-overlap` | 204 | 受众与谁重合 | ✅ [`audience-overlap/PAGE.md`](audience-overlap/PAGE.md) |
| `geographical-regions` | 198 | 地理分布 | ✅ [`geographical-regions/PAGE.md`](geographical-regions/PAGE.md) |
| `business-regions` | 36 | 商业大区分布（四区合计 ≈7.9 亿，与月访问量对齐） | ✅ [`business-regions/PAGE.md`](business-regions/PAGE.md) |
| `page-groups` | 20 | 页面分组 | ✅ [`page-groups/PAGE.md`](page-groups/PAGE.md) |
| `demographics` | 20 | 人口画像 | ✅ [`demographics/PAGE.md`](demographics/PAGE.md) |

## 数据不在表格里的路由

| 路由 | 形状 | 规模（canva.com 月度） | PAGE.md |
|---|---|---|---|
| `behavior` | 摘要卡+社媒条+兴趣条+设备环图（值在 DOM 文本） | — | ✅ [`behavior/PAGE.md`](behavior/PAGE.md) |
| `socioeconomics` | 卡片+条图/堆叠图，九条 chart 路由里最稠 | — | ✅ [`socioeconomics/PAGE.md`](socioeconomics/PAGE.md) |
| `referral` | chart-only | 40M–60M | ✅ [`referral/PAGE.md`](referral/PAGE.md) |
| `organic-search` | chart-only | 100M–130M（轴顶 150M） | ✅ [`organic-search/PAGE.md`](organic-search/PAGE.md) |
| `paid-search` | chart-only | 0.8M–1.15M（轴顶 1.5M） | ✅ [`paid-search/PAGE.md`](paid-search/PAGE.md) |
| `organic-social` | chart-only | 11M–24M（轴顶 30M） | ✅ [`organic-social/PAGE.md`](organic-social/PAGE.md) |
| `paid-social` | chart-only | 140K–170K（轴顶 200K） | ✅ [`paid-social/PAGE.md`](paid-social/PAGE.md) |
| `display-ads` | chart-only | 45K–170K | ✅ [`display-ads/PAGE.md`](display-ads/PAGE.md) |
| `daily-trends` | chart-only | 日访问 20M–35M（轴顶 40M） | ✅ [`daily-trends/PAGE.md`](daily-trends/PAGE.md) |
| `email` | **时变**：2026-08-29 空态（svgText=0）→ 2026-08-30 同域有图（svgText=31）；nytimes.com（lid=1234971）也 svgText=31、月度 600–950万——空态是域/水合相关，非路由恒空 | 轴顶 1000万（有图轮） | ✅ [`email/PAGE.md`](email/PAGE.md) |

## 板块级要点

- **「没有表格」≠「没有数据」**——历史上这条错误推断在 9 条路由里错了 8 条。
- ⚠️ **本文档曾写「轴标签、系列名、数值都在 `deep.svgText` 里」，那是错的**
  （2026-08-30 读透 11 份实盘 census 后更正）。`deep.svgText` **是一个计数**
  （13–1132 个 svg 文本节点），不是文本。census 里唯一带文本的字段是 `deepText`，
  它有**轴刻度、轴标签、系列名**，**没有任何一个数据点的值**——面板的折线图不渲染
  数据标签，逐点数值只存在于点的**像素位置**里。所以「只能读出量级区间」不是读得
  不够仔细，是采集面缺了几何。
- 就绪判据两分支：`filledCells > 0`（先查）→ `svgText > 0` 三轮稳定（chart 分支），
  manifest 记 `readyBranch`。
- **chart 读数器（2026-08-30 上线）**：走 chart 分支就绪后，
  `backlink/scripts/ground-truth.mjs` 会自动多打一次带几何的读数，把提取结果写进
  manifest 的 `chartRead` 字段（失败不影响主流程）。读的是
  `backlink/scripts/lib-chart-read.mjs`，**它只提取与换算，不下判断**：
  - `chartRead.capability`：`points`（读到逐点值）/ `axis-only`（只有轴与标签）/
    `none`。它说的是**读数器做到了什么**，不是页面有没有数据——后者仍归 AI 对质双证人。
  - `chartRead.text`：每张图的标题、系列名、y 轴刻度与范围、x 轴标签。
    **2026-08-29 那批历史证据只有这一路**，逐点值一律标 `uncertain: no-geometry`。
  - `chartRead.geometry`：逐点值（由轴刻度的像素位置标定「像素→数值」反推）。
    轴刻度不足或对数轴时点仍在，但 `value: null` + 理由码——**「读不出」和「值是 0」
    永远可分辨，读数器绝不猜一个数填上**。
  - 想复读历史证据：`node -e "import('./backlink/scripts/lib-chart-read.mjs')…"`
    直接喂 `census-s1.json`，纯离线不烧配额。
- `email` 曾被判唯一真空态（svgText=0，2026-08-29），**2026-08-30 同域（canva.com）
  渲染出真图（svgText=31）——判决降级为「时变/水合相关」**：svgText=0 只能判
  「本轮空」，判不了「该路由恒空」；详见 `email/PAGE.md`。
- **平台坑：全树 `q=` 被 `lid` 覆盖（2026-08-30 round4 实锤）**。面板会自动附加
  `lid=<列表>`，此后**所有** `/analytics/traffic/*` 子路由渲染的都是列表域的
  数据，href 里的 `q=` 是摆设。判决书：`semrush-round4-VERDICTS.md` 页卡 7。
- **换域配方（2026-08-30 已解决，判决书 `semrush-lid-switch-VERDICTS.md`）**：
  为目标域**新建一个列表**（历史列表照旧不动），之后任意子路由带
  `lid=<新lid>` 直达：`/analytics/traffic/<路由>/?q=<domain>&searchType=domain&lid=<lid>`。
  已知 lid：`1234565`=canva.com（历史，只读）、`1234971`=nytimes.com（probe）。
  建列表：页头列表按钮 → 下拉底部「+ 创建新列表」→ 编辑器右侧域名输入
  （`input[data-testid="input-target-input"]`）用 `focus()+execCommand('insertText')`
  填域，**提交 chip 必须在 input 上 dispatch 合成 KeyboardEvent Enter 三连
  （keyCode:13，bubbles:true）——CDP 真键与点 ✓ 图标都不生效**，成功判据是计数
  0/100→1/100；再点「保存更改」，落点 URL 里就是新 lid。三个坑：①新列表刚建成
  全页骨架数分钟（服务端算数据，「正在收集洞察」），骨架≠空态，等几分钟重采即
  10 秒级就绪；②创建编辑器里填的列表名不落库，新列表仍叫「未命名列表」，靠 lid
  区分即可（改名入口未找到）；③每列表上限 100 个域（编辑器计数 X/100），列表总数
  未见限额提示，也未见消耗其他配额。
- **⚠ 建完新列表，它就成了面板默认——不带 `lid` 的链接会渲染它，不是你写的 `q=`。**
  2026-08-30 实盘复现：`?q=canva.com`（没带 lid）截图上是 nytimes 的页面，因为面板
  自动补了 `lid=1234971`。`q=` 在这棵树上**始终**是装饰，建新列表只是把默认值换了个人。
  所以：**每次采集都显式写 `lid=`，一个都别省**；核对落点看 `manifest.finalHref`
  里 `q=` 与 `lid=` 对不对得上——路由自检只比 path/hash，域名被换掉它看不见。
- **骨架屏 + 分页计 0 + 导出置灰 ≠ 空态**：sources-destinations 目标 tab 实测两轮
  ~4 分钟全骨架、第三轮出数——判空必须等到非骨架行或明确空文案。
