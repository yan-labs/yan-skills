# Keyword Research · 网站关键词（website-keyword-v2）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/organicsearch/pageAnalysis/website-keyword-v2/<域>/999/3m?webSource=Total&selectedPageTab=Total&key=<域>`
  - **`&key=<域>` 必带**（同板块通则）

## 回答什么业务问题

一个域靠哪些词拿流量、每个词多难多贵——竞品词库的主表，本组规模最大的真 table。

## 数据清单（canva.com，3m，全球）

1. **真 table 13 列**：词 / 流量 / 份额 / KD / 意图 / CPC / 零点击 / 排位 / SERP features 等。
2. 规模：关键词 (2,827,877)。首行 canva 236M / 61.83% / KD80。
3. 机会卡：长尾机会 406,744。

## 形状与就绪

- 形状：**table**（readyBranch=table，**filledCells=1,597**，本组最大）。
  就绪判据 `filledCells > 0`。

## 怎么采

```sh
platforms/similarweb/keyword-research/site-keywords/collect.sh [domain] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 漏 `&key=` = 空态 | 同板块通则 |
| 壳骗文本判据 | deepText 1.6M 先于数据到位；就绪只认 filledCells |

## 验证记录

- **2026-08-30** round3 双证人。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-site-keywords/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #9。
- 截图档案：`assets/loaded.png`。
