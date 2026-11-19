# Keyword Research · 网站搜索广告（website_ads）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/organicsearch/pageAnalysis/website_ads/false/999/<YYYY.MM-YYYY.MM>?webSource=Desktop&selectedPageTab=Text&key=<域>`
  - 路径段 `false` 为字面量；域**只在 `&key=`**（本路由路径里根本没有域段）

## 回答什么业务问题

一个域投了哪些搜索广告文案、各拿多少点击、CPC 多少——竞品付费打法全景。

## 数据清单（canva.com，2026.07，Desktop）

1. **真 table** 广告文案榜：文案 + 点击 + CPC + 落地页。
2. 规模：广告 (49,953)。样例：QR 广告 7K 点击 / $1.26。

## 形状与就绪

- 形状：**table**（readyBranch=table，filledCells=180）。就绪判据 `filledCells > 0`。

## 怎么采

```sh
platforms/similarweb/keyword-research/website-ads/collect.sh [domain] [months] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 域只在 `&key=` | 路径无域段，漏 key 落空态 |
| census href 剥值 | `key=` 值被剥空；核对用 manifest 的 `url` |

## 验证记录

- **2026-08-30** round3 双证人。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-website-ads/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #14。
- 截图档案：`assets/loaded.png`。
