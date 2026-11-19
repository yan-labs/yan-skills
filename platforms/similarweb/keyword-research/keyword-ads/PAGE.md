# Keyword Research · 搜索广告—关键词（ads）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/keyword/organic/search/999/<YYYY.MM-YYYY.MM>/ads?keyword=<URL编码词>&tab=0&mtd=false&webSource=Desktop&selectedPageTab=Text`
  - 关键词只在 `?keyword=`；`selectedPageTab=Text` 为文字广告

## 回答什么业务问题

谁在这个词上投搜索广告、投什么文案、拿了多少点击——付费竞争强度与文案参考。

## 数据清单（image editor，2026.07，Desktop）

1. **真 table**：广告文案 + 点击 + 更改 + 域 + 落地页。
2. 规模：广告 (849)。首行样例：canva 220 点击 / 2.86% / +266%。

## 形状与就绪

- 形状：**table**（readyBranch=table，filledCells=120）。就绪判据 `filledCells > 0`。
- 本组 14 路由里 4 条真 table 之一（ads / site-keywords / topics / website_ads）。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-ads/collect.sh [keyword] [months] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 路径段 hijack | 词只走 `?keyword=` |
| census href 剥值 | 核对上下文读 manifest 的 `url` |

## 验证记录

- **2026-08-30** round3 双证人；抽查 220 / 2.86% / 266% 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-ads/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #5。
- 截图档案：`assets/loaded.png`。
