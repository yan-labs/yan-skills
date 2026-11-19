# Traffic Analytics · Organic Search（自然搜索）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/organic-search/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题/左侧导航「自然搜索」高亮；维度：全球 / 月份 / 所有设备

## 回答什么业务问题

竞品自然搜索渠道的月流量走势和量级——SEO 盘子有多大、谷歌 AI 模式吃掉多少。
评估「竞品 SEO 值不值得对标」的量级基准从这页进；具体关键词去 Organic Research 板块。

## 数据清单

**本页没有任何表格（grids=0、cells=0），数据在图表里**（canva.com，2026-07 实测）：

1. **流量趋势**折线图：y 轴顶 **1.5亿**。两个序列——自然搜索（红）在 **1亿–1.3亿** 波动；
   **「谷歌 AI 模式」（黄）单列一条，贴 0 轴**（量级远小于自然搜索）。
2. **桌面设备趋势**（1.5亿轴）/ **移动设备趋势**（3000万轴）两张分图。
3. 轴刻度、系列名都在穿透后的 `deep.svgText` 里（**48 个 SVG 文本节点**，light=deep）。

**没有表格 ≠ 没有数据**：历史判决曾把本页记成「无数据」，2026-08-29 双证人重测推翻。

## 形状与就绪

- 形状：**chart-only**。filledCells 恒 0 是本页常态。
- 就绪判据：**svgText > 0 且三轮稳定**（chart 分支）；空态分界是 svgText=0（见 `email/`）。
- 2026-08-29 证据采集时 collector 还只有 table 判据，故该轮退出码 2（budget，
  30 轮 poll、刷新 2 次无效也无害）；chart 分支上线后重跑应 stable 提前退出。

## 怎么采

```sh
platforms/semrush/traffic-analytics/organic-search/collect.sh [domain] [out-dir]
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
| **没有表格≠没有数据** | 历史「无数据」引申是错的——数据存在，形状是图（本板块 9 条里错了 8 条） |
| 谷歌 AI 模式序列贴 0 轴 | 黄色序列几乎贴地不代表没画——是量级差距（对照自然搜索亿级）；别把贴 0 当渲染故障 |
| filledCells 判据永不触发 | 等 filledCells>0 会烧满预算退出码 2；认 svgText |
| 曲线精确值不在文本里 | `deep.svgText` **是节点计数不是文本**；带文本的是 `deepText`，里面只有轴刻度/系列名，逐月精确值要读图；能落的结论是区间量级（1亿–1.3亿） |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于图表到位；deepTextLength 阈值判据会误判 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页；判决前核对每轮 href |

## 验证记录

- **2026-08-29**（UTC 07:13–07:17）双证人重测，canva.com，会话 `semrush-nav`。
  退出码 2（budget，当时无 chart 分支——预期路径），30 轮 poll，refreshCount=2。
  filledCells=0；deep.tables 0 / deep.grids 0 / **svgText 48**。
  截图落点正确（「自然搜索」高亮、canva.com），y 轴顶 1.5亿，红色序列 1亿–1.3亿，
  黄色「谷歌 AI 模式」贴 0 轴；桌面 1.5亿轴 / 移动 3000万轴分图。
  抽查 1.5亿/5000万/3000万/谷歌 AI 模式/2026年2月 **全部命中 deepText**。
  裁决：**chart-only**（自然搜索月流量 1亿–1.3亿 量级，轴顶 1.5亿 与历史线索
  「organic-search axis to 150M」吻合）；历史「无数据」判决被推翻。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/remeasure-organic-search/`，
  判决书 `backlink/evidence/ground-truth/remeasure-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（双序列趋势图 + 桌面/移动分图）。
