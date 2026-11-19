# Keyword Research · 搜索竞争对手（website-competitors）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/websiteanalysis/website-competitors/<域>/999/3m?webSource=Total&selectedPageTab=Organic&key=<域>`
  - **`&key=<域>` 必带**

## 回答什么业务问题

搜索侧谁和你抢同一批词：按重叠分数 × 有机访问量的竞品散点 + 1,500 域榜。

## 数据清单（canva.com，3m，全球）

1. 散点图：重叠分数 × 有机访问。
2. 域榜（DIV）：域 (1,500)。头部 adobe / picsart / iloveimg / pixlr…

## 形状与就绪

- 形状：**chart**（readyBranch=chart）。榜单 DIV 不产 cells，就绪看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/keyword-research/search-competitors/collect.sh [domain] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| DIV 榜不产 cells | 读数走 deepText / 像素 |
| 漏 `&key=` = 空态 | 同板块通则 |

## 验证记录

- **2026-08-30** round3 双证人。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-competitors/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #12。
- 截图档案：`assets/loaded.png`。
