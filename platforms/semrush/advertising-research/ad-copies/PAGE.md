# Advertising Research · 广告创意（adwords copies）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/copies/?db=us&q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`；`db`：数据库（`us`）
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 广告研究顶部 tab 之一（排名 / 排名变化 / 竞争对手 / **广告创意** / 页面 / 子域名）

## 回答什么业务问题

竞品广告的标题、落地页、文案原文长什么样，以及**每条文案背书多少个关键词**——
关键词数高 = 被反复投放的验证文案，抄文案句式和卖点从这页进。

## 数据清单（canva.com，db=us，2026-08）

1. **计数**：2,118 条广告创意。
2. **卡片网格**，4 卡/行，每卡 =
   标题 + ad 标记 + display URL（`›` 分级路径）+ 正文文案 + 关键词数。
3. **排序依据**可切换（默认 关键词的数量——文案被多少词背书）。
4. 有**导出**按钮。
5. 样例：Free image editor 系列文案的关键词数 24 / 15 / 11；T-Shirt Design Maker。

## 形状与就绪

- 形状：**data-not-in-table**——本板块第一条无 cells 无 svgText 的路由。
  **table/chart 两个就绪分支永远不点火**，普通跑法 ground-truth 会 budget 退出
  （exit 2），但 deepText 里数据齐全。
- **采这页必须 `--ready-text '广告创意'`**（text 分支就绪：穿透文本命中正则且稳定）。
- **判空前先 grep deepText**——exit 2 不是空页证据。

## 怎么采

```sh
platforms/semrush/advertising-research/ad-copies/collect.sh [domain] [db]
# 例：collect.sh figma.com us
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --ready-text '广告创意' --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`。数据读法：卡片文本全在 census 的 deepText 里，
不要指望 cells/svgText 字段。采完由 AI 对质双证人出结论，配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **exit 2 假阴性** | table/chart 分支都不就绪 → 不带 `--ready-text` 的采集稳定 budget 退出；别把 exit 2 当空页，deepText 里 2,118 条数据齐全 |
| 无 cells 可数 | filledCells 恒 0，「filledCells>0」通例对本页失效——这是全平台就绪判据的已知例外 |
| 截图只见首屏 | 卡片网格纵向很长，单屏截图只覆盖前几行卡片 |
| referrer eval 会炸 | 同板块通病：页内 eval 读 `document.referrer` 必须 try/catch（gmitm getter 坑） |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，整轮持机器级 semrush 锁，canva.com。
  抽查 总数 2,118 / Free image editor 关键词数 24/15/11 / T-Shirt Design Maker ——
  像素↔DOM **全 HIT**（DOM 侧证人 = deepText，非 cells）。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-adwords-copies/`；
  判决书 `…/semrush-ads-trends-VERDICTS.md`。
- 截图档案：`assets/cards.png`（计数 + 卡片网格首屏）。
