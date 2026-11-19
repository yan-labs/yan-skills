# Keyword Research · SERP 快照（serpsnapshot）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/keyword/organic/search/840/<YYYY.MM-YYYY.MM>/serpsnapshot?keyword=<URL编码词>&tab=0&mtd=false&webSource=Desktop`
  - 国家段本例 840（美国）；关键词只在 `?keyword=`

## 回答什么业务问题

这个词的 SERP 长什么样：谁排第几、位次怎么动、带哪些 SERP 功能——不用真开 Google。

## 数据清单（image editor，2026.07，US）

1. SERP 功能卡：Video / Related searches 等。
2. **29 位排名列表**：域 + 位次 + 变动（canva #1 ↑1）。DOM 列表，**无 table 无 svg**。

## 形状与就绪

- 形状：DOM 列表页型 → cells=0 且 svgText=0，**readyBranch=null，exit 2（机器盲）**。
  **exit 2 ≠ 空**——29 条结果在 deepText 与像素里俱全，判读靠 deepText grep + AI 读图。

## 怎么采

```sh
platforms/similarweb/keyword-research/serp-snapshot/collect.sh [keyword] [months] [out-dir]
```

exit 2 属预期。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 机器盲 | 三条就绪分支全盲；exit 2 不可信为空 |
| 国家段 | 落地实测 840；面板可能静默改写国家段，模板以落地 href 为准 |

## 验证记录

- **2026-08-30** round3 双证人；29 结果 + canva #1↑1 双证人一致。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-serpsnapshot/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #6。
- 截图档案：`assets/loaded.png`。
