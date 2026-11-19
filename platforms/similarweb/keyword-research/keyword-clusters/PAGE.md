# Keyword Research · 关键词集群（topics）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/websiteanalysis/topics/<域>/999/<YYYY.MM-YYYY.MM>?webSource=Total&selectedPageTab=Total&key=<域>`
  - **`&key=<域>` 必带**；国家段会被面板静默改写（实测自动跳 840=美国），模板以落地 href 为准

## 回答什么业务问题

一个域的词按主题聚成了哪些簇、每簇多少词多少点击——内容板块规划的直接输入。

## 数据清单（canva.com，2026.07）

1. **真 table** 集群榜：集群名 + 词数 + 点击。
2. 规模：集群 (1,813)。首行样例：Canva 簇 240 词 7.3M 点击。

## 形状与就绪

- 形状：**table**（readyBranch=table，filledCells=120）。就绪判据 `filledCells > 0`。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-clusters/collect.sh [domain] [months] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 国家段被静默改写 | 999 落地可能变 840；hijack 判定只比 hash 前 3 段所以不误报，记模板看落地 href |
| 漏 `&key=` = 空态 | 同板块通则 |

## 验证记录

- **2026-08-30** round3 双证人。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round3-kw-topics/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #10。
- 截图档案：`assets/loaded.png`。
