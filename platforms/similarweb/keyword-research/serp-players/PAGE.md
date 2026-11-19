# Keyword Research · SERP 市场参与者（keywordAnalysis_2）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/keyword/organic/search/999/28d/keywordAnalysis_2?keyword=<URL编码词>&tab=0&mtd=false&webSource=Desktop&selectedPageTab=Total&graphDuration=28d&timeGranularity=Weekly`
  - 关键词只在 `?keyword=`；时长段本例 `28d`（也接受月段）

## 回答什么业务问题

这个词的 SERP 被哪些域瓜分、份额怎么变——竞争格局与「谁在涨」一眼看清；
页内还有「关键词差距分析」入口。

## 数据清单（image editor，28d，Desktop）

1. 堆叠面积图：头部域份额随时间。
2. **域榜 (170)**：DIV 榜单（**不是 table，cells=0**），域 + 流量 + 份额 + 变化。
   首行样例：canva 44K / 29.20% / ↓11.65%。
3. 「关键词差距分析」入口按钮。

## 形状与就绪

- 形状：**chart**（readyBranch=chart）。榜单是 DIV，不产 cells——
  `filledCells>0` 在本页永远不触发，就绪只看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/keyword-research/serp-players/collect.sh [keyword] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| DIV 榜不产 cells | 170 域的数在 deepText 里，cells 判据全盲 |
| 路径段 hijack | 同组通病：词只走 `?keyword=` |

## 验证记录

- **2026-08-30** round3 双证人；抽查 44K / 29.20% / 96.28% 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-serp-players/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #3。
- 截图档案：`assets/loaded.png`。
