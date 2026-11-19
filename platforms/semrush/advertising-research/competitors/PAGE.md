# Advertising Research · 竞争对手（adwords competitors）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/competitors/?db=us&q=<domain>&searchType=domain`
  - slug 实证：点击「竞争对手」tab 后读回 href 即此路径（真路由）
  - 落点把 `db` 吃成 `date=YYYYMMDD`（最近数据日）
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名

## 回答什么业务问题

付费词重合度最高的竞品是谁——organic competitors 的付费版。挑对标域名、
找「同一批商业词在投放的对手」从这页进。

## 数据清单（canva.com，2026-08-30）

1. **气泡图**：竞争定位（svgText 33）。
2. **主表**（700 格）：域名 / 竞争程度 / 通用关键词 / 广告关键词 / 付费流量 /
   付费流量价格 / SE Keywords。
3. 规模：**631 个付费竞品**；首行 picsart.com 21.2% / 584 / 2.9K / 92,581 /
   100K / 171.3K。

## 形状与就绪

- 形状：**table + chart**（表 700 格 filledCells 就绪；气泡图 svgText 33）。

## 怎么采

```sh
platforms/semrush/advertising-research/competitors/collect.sh [domain] [db]
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| db 变 date | 落点参数是 `date=YYYYMMDD`，自检别按 `db=us` 比对 |
| 图例别当读数 | 气泡图读定位趋势可以，数字以表格列为准（全平台通例） |
| 表头词重复两遍 | 无障碍副本，解析先去重 |
| 截图漏列 | 一屏只见约 7 列，只靠截图严重漏读 |
| referrer eval 会炸 | gmitm 镜像补丁，页内 eval 必须 try/catch |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`。631 竞品总数、picsart.com 首行
  21.2%/584/2.9K/92,581 —— 像素↔DOM 抽查 **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-adwords-competitors/`；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 4。
- 截图档案：`assets/loaded.png`（气泡图 + 主表首屏）。
