# Traffic Analytics · Daily Trends（每日趋势）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/daily-trends/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「每日趋势」；维度：全球 / 月份 / **每日** / 所有设备（粒度自动是每日）

## 回答什么业务问题

竞品流量的**日粒度**波动——周末回落节奏、近三个月哪天有异动、各渠道日线怎么走。
月度总量看别的路由，「什么时候涨的」只有这页能答。

## 数据清单

**本页没有任何表格（grids=0、cells=0），数据在一组日线图里**（canva.com，2026-07 实测）：

1. **流量趋势**日线图：指标 tab 访问量/唯一/购买转化率/页数访问，y 轴顶 **4000万**，
   日值 **2000万–3500万**，横轴约 3 个月日刻度（7月1日–9月28日），
   **周期性锯齿清晰（周末回落）**。
2. **流量渠道趋势**第二张图（0–3000万轴，同横轴），渠道图例 10 项：直接/AI 流量/引荐/
   自然搜索/谷歌 AI 模式/付费搜索/自然社交/付费社交/电子邮件/展示广告。
3. **每渠道小图**（各带导出与「查看信息中心」链接）：直接 0–3000万轴、引荐 0–300万轴、
   AI 流量 0–40万轴、谷歌 AI 模式 0–2万轴……逐渠道一张。
4. deepText 里「导出」出现 **12 次**（每图一个导出控件）。
5. 轴刻度密集：**svgText=1132 个 SVG 文本节点**——日粒度刻度使本页在 9 条无表格路由里最高
   （其余 3–49）。

## 形状与就绪

- 形状：**chart-only**。filledCells 恒 0 是本页常态。
- 就绪判据：**svgText > 0 且三轮稳定**（chart 分支）；本页就绪后 svgText 高达 1132，
  与空态（0）差距悬殊。
- 2026-08-29 证据采集时 collector 还只有 table 判据，故该轮退出码 2（budget，
  30 轮 poll、刷新 2 次无效也无害）；chart 分支上线后重跑应 stable 提前退出。

## 怎么采

```sh
platforms/semrush/traffic-analytics/daily-trends/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
ground-truth.mjs 自动走 chart 就绪分支（svgText>0 三轮稳定），无需额外参数。
采完由 AI 对质双证人出结论：量级从截图读曲线区间、从 deepText 核对轴刻度，两证互验。


**图表读数器（2026-08-30）**：走 chart 分支就绪后，ground-truth.mjs 会自动多打一次
带几何的读数，把提取结果写进 manifest 的 `chartRead`（见
[`../OVERVIEW.md`](../OVERVIEW.md) 板块级要点，实现在
`backlink/scripts/lib-chart-read.mjs`）。`chartRead.text` 给每张图的标题、系列名、
y 轴刻度与范围、x 轴标签；`chartRead.geometry` 给逐点值。**读数器只提取不判断**：
读不出的点是 `value: null` + 理由码，绝不猜数——「读不出」和「值是 0」必须分得开。
`chartRead.capability` 说的是读数器做到了什么（`points` / `axis-only` / `none`），
**不是页面有没有数据**，后者照旧由你对质双证人来判。
2026-08-29 那批历史证据没有几何面，复读只能到 `axis-only`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **历史「空白内容区」是假的** | 历史记录「BLANK content area, exportBtns===12」不复现——12 个导出按钮伴随的是满页图表；历史空白是未渲染态被当成了页面真容。抓到「有按钮没内容」先刷新重采 |
| **没有表格≠没有数据** | 历史「无数据」引申是错的——数据存在，形状是图 |
| exportBtns 不是内容判据 | 12 个导出控件在内容落地前就可能齐——按钮数说明壳齐了，不说明图画了 |
| 周末锯齿是数据不是噪声 | 日线周期性回落是真实流量节律；平滑/取样时别把它抹掉 |
| filledCells 判据永不触发 | 等 filledCells>0 会烧满预算退出码 2；认 svgText |
| 逐日精确值不在文本里 | svgText 是轴刻度/日期标签；逐日精确值要读图或悬浮交互，能落的结论是区间（日访问 2000万–3500万） |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页；判决前核对每轮 href |

## 验证记录

- **2026-08-29**（UTC 07:52–07:56）双证人重测，canva.com，会话 `semrush-nav`。
  退出码 2（budget，当时无 chart 分支——预期路径），30 轮 poll，refreshCount=2。
  filledCells=0；deep.tables 0 / deep.grids 0 / **svgText 1132**（9 条里最高）。
  截图落点正确（标题「每日趋势」、canva.com、粒度「每日」）：日线图 y 轴顶 4000万、
  日值 2000万–3500万、周末锯齿清晰；流量渠道趋势第二张图在位。
  抽查 1000万/2000万/3000万/4000万/导出（12 次）**全部命中 deepText**。
  裁决：**chart-only**（每日访问量 2000万–3500万 量级）；历史「空白内容区+12 导出」不复现。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/remeasure-daily-trends/`，
  判决书 `backlink/evidence/ground-truth/remeasure-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（日线图 + 渠道趋势图首屏）。
