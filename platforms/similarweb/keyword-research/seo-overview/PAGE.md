# Keyword Research · SEO 概览（seo-overview）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/organicsearch/pageAnalysis/seo-overview/<域>/999/3m?webSource=Total&vennDiagramSourceType=Total&key=<域>`
  - **`&key=<域>` 必带**：只把域写进路径段（无 key）会落「输入查询以查看此报告」空态
    （round3 的 seo-overview 首采就栽在这里，v2 补 key 后成功）

## 回答什么业务问题

一个域的自然搜索全景：词量、页量、意图分布、排名机会、与竞品的关键词差距（venn）。

## 数据清单（canva.com，3m，全球）

1. 概要卡：关键词 2.8M、网页 109K。
2. 意图分布。
3. 排名机会卡：机会 16.7K / 失败 1.4M / 胜出 269.5K。
4. **关键词差距 venn**：自动带上 adobe / figma 两个竞品（无需手动添加）。
5. 热门关键词 / 热门落地页小表。

## 形状与就绪

- 形状：**table**（readyBranch=table，filledCells=40，来自小表）。
- venn 与卡片是 svg/文本；主判据 `filledCells > 0` 可用。

## 怎么采

```sh
platforms/similarweb/keyword-research/seo-overview/collect.sh [domain] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **漏 `&key=` = 空态** | 冷深链路径段被忽略；空态不是功能不存在。反面样本 `…-kw-seo-overview/`（无 key，exit 2 budget） |
| census href 剥值 | `key=` 值被剥空（留键名）；核对用 manifest 的 `url` |

## 验证记录

- **2026-08-30** round3 双证人（v2 带 key）；抽查 16.7K / 1.4M 命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-seo-overview-v2/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #8。
- 截图档案：`assets/loaded.png`。
