# Backlink Analytics · 引荐域名（refdomains）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/refdomains/report/?q=<domain>&searchType=domain`
- **不在 `/analytics/backlinks/` 下**。`/analytics/backlinks/refdomains/` 是死路由，
  302 回 `/analytics/backlinks/overview/`（hijack 自检 exit 3 留档）。引荐域名不是
  backlinks 的 tab，是左栏「外链建设」组里的独立工具。

## 回答什么业务问题

谁在链我（按域聚合的外链池）——outreach 名单的直接原料。竞品外链域画像也从这页拉。

## 数据清单（canva.com，2026-08-30）

1. **计数**：1-100（约 **628,658** 域），100 行/页。
2. **顶部「新增和丢失的引荐域名」图表区**：本次为「我们没有要显示的数据」空态 +
   清除筛选器按钮——是图表区自己的空态。
3. **过滤**：所有/活跃/新增/丢失 × 所有/Follow/Nofollow。
4. **列（英文表头）**：AS / Root Domain+Category / Backlinks / Country IP /
   First Seen / Last Seen。可导出。
5. 行样例：pixabay AS 91，43,790,730 条反链，172.64.147.160，2025年2月12日；
   pexels 11,127,958 条。

## 形状与就绪

- 形状：**grid 表**（readyBranch=table），约 600 cells/屏。
- 就绪判据：`filledCells > 0`，实测 **40 秒**（含 1 次 stall-refresh）。

## 怎么采

```sh
platforms/semrush/backlink-analytics/refdomains/collect.sh [domain] [out-dir]
# 默认 domain=canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
semrush 机器锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 死路由别名 | `/analytics/backlinks/refdomains/` 302 回 overview；采集必须用 `/analytics/refdomains/report/` |
| 图表空态 ≠ 表空 | 顶部「新增和丢失」图表区自己的空态**不代表下方表空**——本次图表空态同屏 628K 域 |
| 表头中英混排 | 表头是英文（AS/Root Domain/…），解析别按中文列名找 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）双证人抽查：628,658 /
  pixabay 91 43,790,730 172.64.147.160 2025年2月12日 / pexels 11,127,958——全部命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinks-refdomains-v2/`
  （`semrush-backlinks-refdomains/` 是死路由 302 的 hijack 实录，exit 3）；
  判决书 `…/semrush-backlinks-audience-VERDICTS.md` 页卡 2。
- 截图档案：`assets/loaded.png`（图表区空态 + 表格头部与首行）。
