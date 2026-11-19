# Advertising Research · 子域名（adwords subdomains）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/subdomains/?db=us&q=<domain>&searchType=domain`
  - slug 实证：直开落点确认（真路由，未被 302 回 positions）
  - 落点把 `db` 吃成 `date=YYYYMMDD`（最近数据日）
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名

## 回答什么业务问题

付费流量落在哪些子域——organic subdomains 的付费版。单品牌站通常只有一行（www），
多产品线域名在这里现形。

## 数据清单（canva.com，2026-08-30）

1. **主表**（4 格）：仅 1 行——www.canva.com 70,748 / 100.00% / 2.6K。
   canva 的付费流量全部落在 www。

## 形状与就绪

- 形状：**table**（单表，本例只有 4 格——**格子极少是数据事实，不是渲染未完成**；
  filledCells>0 即就绪）。

## 怎么采

```sh
platforms/semrush/advertising-research/subdomains/collect.sh [domain] [db]
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 一行是常态 | 单品牌站付费流量集中在 www；4 格 ≠ 页面没渲染完 |
| db 变 date | 落点参数是 `date=YYYYMMDD`，自检别按 `db=us` 比对 |
| 表头词重复两遍 | 无障碍副本，解析先去重 |
| referrer eval 会炸 | gmitm 镜像补丁，页内 eval 必须 try/catch |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`。唯一行
  www.canva.com 70,748/100%/2.6K —— 像素↔DOM **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-adwords-subdomains/`；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 4。
- 截图档案：`assets/loaded.png`（主表全貌）。
