# Keyword Research · 排名分配（ranking-distribution-v2）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/organicsearch/pageAnalysis/ranking-distribution-v2/<域>/840/<YYYY.MM-YYYY.MM>?webSource=Total&key=<域>`
  - **`&key=<域>` 必带**；国家段实测被面板自动跳 840（美国）——模板以落地 href 为准

## 回答什么业务问题

一个域的词都排在第几档：1-3 / 4-10 / 11-20 / >20 的量级分布，冲页一/守排名的盘子有多大。

## 数据清单（canva.com，2026.07，US）

1. 职位摘要条：1-3 位 37.5K / 4-10 位 49.6K / 11-20 位 29K / >20 位 26.8K。
2. 142,895 词的 DIV 榜（词 + 位次 + 流量）。

## 形状与就绪

- 形状：摘要条 + DIV 榜 → cells=0 且 svgText=0，**readyBranch=null，exit 2（机器盲）**。
  **exit 2 ≠ 空**——四档数字与词榜在 deepText 与像素里俱全，判读靠 deepText grep + AI 读图。

## 怎么采

```sh
platforms/similarweb/keyword-research/ranking-distribution/collect.sh [domain] [months] [out-dir]
```

exit 2 属预期。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 机器盲 | 三条就绪分支全盲；exit 2 不可信为空 |
| 国家段被静默改写 | 自动跳美国 840 |
| 漏 `&key=` = 空态 | 同板块通则 |

## 验证记录

- **2026-08-30** round3 双证人；四档 37.5K/49.6K/29K/26.8K 双证人一致。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-ranking-distribution/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #13。
- 截图档案：`assets/loaded.png`。
