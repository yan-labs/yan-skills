# Keyword Research · 着陆页（landing-pages-v2）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/organicsearch/pageAnalysis/landing-pages-v2/<域>/999/<YYYY.MM-YYYY.MM>?webSource=Total&selectedPageTab=Organic&key=<域>`
  - **`&key=<域>` 必带**

## 回答什么业务问题

一个域的自然流量落在哪些 URL 上、各占多少份额——竞品页面结构与承接页布局。

## 数据清单（canva.com，2026.07）

1. URL 榜（**DIV，不产 cells**）：URL + 流量 + 份额。
2. 趋势图。
3. 规模：URL (80,276)。首行 canva.com 主页 167.2M / 44.13%。

## 形状与就绪

- 形状：**chart**（readyBranch=chart，svgText=300）。榜单是 DIV，就绪看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/keyword-research/landing-pages/collect.sh [domain] [months] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| DIV 榜不产 cells | 80,276 条的数在 deepText / 像素里 |
| 漏 `&key=` = 空态 | 同板块通则 |

## 验证记录

- **2026-08-30** round3 双证人；167.2M / 44.13% 命中。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-landing-pages/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #11。
- 截图档案：`assets/loaded.png`。
