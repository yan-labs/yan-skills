# Advertising Research · 页面（adwords pages）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/pages/?db=us&q=<domain>&searchType=domain`
  - slug 实证：直开落点确认（真路由，未被 302 回 positions）
  - 落点把 `db` 吃成 `date=YYYYMMDD`（最近数据日）
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名

## 回答什么业务问题

竞品的广告落地页分布——哪个页面扛付费流量。抄落地页结构、看对方把预算砸向
哪类页面从这页进。

## 数据清单（canva.com，2026-08-30）

1. **主表**（360 格）：URL / 流量 / 流量% / 关键词 / 反向链接；
   行内「Show」弹广告预览（只读采集不点）。
2. 规模：**付费页面 72**；首行 www.canva.com/ 54K / 76.36% / 1.6K。

## 形状与就绪

- 形状：**table**（单表 360 格，filledCells 就绪）。

## 怎么采

```sh
platforms/semrush/advertising-research/pages/collect.sh [domain] [db]
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| db 变 date | 落点参数是 `date=YYYYMMDD`，自检别按 `db=us` 比对 |
| 「Show」弹层不点 | 广告预览弹层是额外请求，纯读采集不触发 |
| 表头词重复两遍 | 无障碍副本，解析先去重 |
| referrer eval 会炸 | gmitm 镜像补丁，页内 eval 必须 try/catch |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`。72 页总数、首行
  www.canva.com/ 54K/76.36%/1.6K —— 像素↔DOM 抽查 **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-adwords-pages/`；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 4。
- 截图档案：`assets/loaded.png`（主表首屏）。
