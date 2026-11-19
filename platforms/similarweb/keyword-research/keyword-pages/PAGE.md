# Keyword Research · 网页（trafficAnalysis_2）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/keyword/organic/search/999/<YYYY.MM-YYYY.MM>/trafficAnalysis_2?keyword=<URL编码词>&tab=0&mtd=false&webSource=Desktop&selectedPageTab=Total&graphDuration=28d&timeGranularity=Weekly`
  - 关键词只在 `?keyword=`；`selectedPageTab` = Total/Organic/Paid

## 回答什么业务问题

这个词的流量落到了哪些具体 URL——竞品用哪个页面接词，抄页面结构的直接来源。

## 数据清单（image editor，2026.07，Desktop）

1. 总/自然/付费 三 tab。
2. 堆叠趋势图（头部 URL 份额随时间）。
3. URL 榜（DIV）：URL + 周均流量。首行 canva.com/photo-editor 周均 11.5K；长尾至 <50。

## 形状与就绪

- 形状：**chart**（readyBranch=chart）。URL 榜是 DIV 不产 cells，就绪看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-pages/collect.sh [keyword] [months] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| DIV 榜不产 cells | 榜单读数走 deepText / 像素 |
| 路径段 hijack | 词只走 `?keyword=` |

## 验证记录

- **2026-08-30** round3 双证人。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-pages/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #4。
- 截图档案：`assets/loaded.png`。
