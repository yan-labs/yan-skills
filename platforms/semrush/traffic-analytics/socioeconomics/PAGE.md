# Traffic Analytics · Socioeconomics（社会经济）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/socioeconomics/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「社会经济」；报表头维度：月份（canva.com 实测 2026年7月）

## 回答什么业务问题

竞品受众的家庭规模、收入水平、就业状况、教育程度——定价分层、
判断「用户付费能力」和内容语气从这页进；年龄性别去 `demographics/`。

## 数据清单

**本页没有任何表格（grids=0、cells=0），但数值全部以 DOM 文本存在，可直接抽取
——九条无表格路由里数据最「密」的一条**（canva.com，2026-07）：

1. **摘要四联卡**：家庭规模 2 个人 23.21% / 收入水平 低 51.66% / 就业状况 全职 41.87% /
   知识 大学 45.6%。
2. **家庭规模柱状图**：分档 1 / 2 / 3-4 / 5-6 / 7+，y 轴 0%–40%。
3. **收入水平堆叠条**（比例+人数）：高 10.13% 2089.7万 / 中 38.2% 7878.7万 /
   低 51.66% 1.1亿。
4. **就业状况**（9 档全量）：全职 41.87% 8633.8万、无业 13.92% 2869.7万、
   兼职 11.04% 2275.9万、操持家务 10.22% 2107.7万、大学生 8.8% 1814.4万、
   企业主 8.52% 1757.8万、退休 3.99% 823.2万、请假 1.23% 253.6万、产假 0.42% 86.7万。
5. **知识（教育程度）**：义务教育 44.57% 9190.7万、大学 45.6% 9404.6万、
   研究生 6.61% 1364万、未结业 3.22% 663.5万。

## 形状与就绪

- 形状：**chart-only（图卡）**。filledCells 恒 0 是本页常态。
- census 关键指标（就绪时）：deep.grids=0、deep.cells=0、**svgText=13**——
  svgText 很低但数值都在普通 DOM 文本里，与 `behavior/` 同款；空态分界是 svgText=0。
- 就绪判据：**svgText > 0 且三轮稳定**（chart 分支）；更稳的人工判据是 deepText 里
  出现「档位 | 百分比 | 人数」三元组。
- 2026-08-29 证据采集时 collector 还只有 table 判据，故该轮退出码 2（budget，
  30 轮 poll、刷新 2 次无效也无害）；chart 分支上线后重跑应 stable 提前退出。

## 怎么采

```sh
platforms/semrush/traffic-analytics/socioeconomics/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
ground-truth.mjs 自动走 chart 就绪分支（svgText>0 三轮稳定），无需额外参数。
**取数配方**：全部数值在 census deepText 里按「标签 | 百分比 | 人数」解析，无需读图。


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
| **没有表格≠没有数据** | 历史 Class A「从来就没有表格」的「无数据」引申完全错——本页是 9 条里最富的数据页 |
| svgText=13 别当稀疏 | 数值主体在 DOM 文本不在 SVG；13 只是柱图轴刻度。判空态的分界是 0 |
| filledCells 判据永不触发 | 等 filledCells>0 会烧满预算退出码 2；认 svgText |
| 家庭规模柱图只有百分比轴 | 柱图各档精确值未以文本对形式出现在首屏 deepText 样本里，逐档数值待补测 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于内容到位；deepTextLength 阈值判据会误判 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页；判决前核对每轮 href |

## 验证记录

- **2026-08-29**（UTC 07:44–07:48）双证人重测，canva.com，会话 `semrush-nav`。
  退出码 2（budget，当时无 chart 分支——预期路径），30 轮 poll，refreshCount=2。
  filledCells=0；deep.tables 0 / deep.grids 0 / **svgText 13**。
  截图落点正确（标题「社会经济」、canva.com、2026年7月）：摘要四联卡 + 家庭规模柱图 +
  收入堆叠条全部渲染。抽查 23.21%/51.66%/41.87%/45.6%/10.13%/38.2%
  **全部命中 deepText**。
  裁决：**chart-only**（图表+统计卡带完整真数值，全部以 DOM 文本存在，可直接抽取）；
  历史 Class A 的「无表格」属实，但页面绝非空页。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/remeasure-socioeconomics/`，
  判决书 `backlink/evidence/ground-truth/remeasure-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（摘要四联卡 + 柱图 + 堆叠条）。
