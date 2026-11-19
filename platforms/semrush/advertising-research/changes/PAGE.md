# Advertising Research · 排名变化（adwords changes）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/changes/?db=us&q=<domain>&searchType=domain`
  - slug 实证：点击「排名变化」tab 后读回 href 即此路径（真路由，不在
    「未知子路径 302 回 positions」的回落名单里）
  - 落点把 `db` 吃成 `date=YYYYMMDD`（最近数据日，实测 `date=20260828`）
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名

## 回答什么业务问题

竞品付费词的日级增失——哪些已验证商业词刚被加投/撤投。撤投的高价词可能是「买贵了」，
新加投的词是对方最新的商业判断。

## 数据清单（canva.com，date=20260828，2026-08-30）

1. **分桶 pill**：新增 0 / 丢失 99 / 排名上升 0 / 排名下降 0。
2. **「新增和丢失的关键词」日级柱状图**：时间档 1月 / 6月 / 1年 / 2年 / 全部。
3. **主表**：按当前桶过滤。**新增桶 0 行时显示「未找到任何数据 尝试更改筛选器」——
   这是筛选器空态，不是页面空**；丢失桶有 99 词。

## 形状与就绪

- 形状：**chart**（readyBranch=chart，svgText 18）——摘要在图里，表随桶变。
- **首采整轮 240s 卡 spinner（镜像抖动实锤样本，v1 留档），重跑 46s 就绪**——
  错误页/卡壳 reload 一次即愈，连刷 3 次仍坏才暂记待重测。

## 怎么采

```sh
platforms/semrush/advertising-research/changes/collect.sh [domain] [db]
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **筛选器空态 ≠ 页面空** | 「未找到任何数据 尝试更改筛选器」只说明当前桶 0 行；换桶（丢失 99）就有数据 |
| db 变 date | 落点参数是 `date=YYYYMMDD`，自检别按 `db=us` 比对 |
| 整轮 spinner 是镜像抖动 | 本页是实锤样本：首采 240s 全 spinner，重跑 46s 就绪；先 reload 再怀疑页面 |
| 表头词重复两遍 | 无障碍副本，解析先去重 |
| referrer eval 会炸 | gmitm 镜像补丁，页内 eval 必须 try/catch |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`。分桶计数 0/99/0/0、日级图、
  丢失桶表行 —— 像素↔DOM 抽查 **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-adwords-changes-v2/`
  （首采 spinner 留档 `…-adwords-changes/`）；判决书 `…/semrush-round4-VERDICTS.md` 页卡 4。
- 截图档案：`assets/loaded.png`（分桶 pill + 日级柱状图首屏）。
