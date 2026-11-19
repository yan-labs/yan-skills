# Backlink Analytics · 反向链接明细（backlinks）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/backlinks/backlinks/?q=<domain>&searchType=domain`
  - `q`：目标域名（如 `canva.com`）；`searchType`：固定 `domain`
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab 全集：概览 / 反向链接 / 网络图表 / 锚链接 / 编入索引页面 / 出站域名 /
  批量分析 /…（更多）。tab 行是 JS router 不是 `<a href>`，扒不到 href。

## 回答什么业务问题

逐条外链画像——谁的哪个页面、用什么锚文本、Follow 与否、什么时候来的什么时候丢的。
外链质量审计与竞品外链逐条摸底都从这页进。

## 数据清单（canva.com，2026-08-30）

1. **计数**：1-100（约 **127,977,174** 条），100 行/页。
2. **快捷分组卡**：所有 / 最佳（follow）/ 最新 / 丢失且重要。
3. **过滤**：所有/活跃/新增/丢失 × 所有/Follow/Nofollow/Sponsored/UGC + 添加筛选器 +
   按标题或 URL 筛选。
4. **列**：页面 AS / 源页面标题和 URL（带语言、移动友好标）/ 外部链接 / 内部链接 /
   锚链接和目标 URL（带 301 标记、链接类型 文本图片、链接放置 内容）/ 首次发现日期 /
   上次发现日期。可导出。
5. 行样例：AS 92 Grupo TecnoSpeed 外 7 内 8；AS 90 flippingbook 外 13 内 180。

## 形状与就绪

- 形状：**grid 表**（`role=grid` DIV，readyBranch=table），约 320 cells/屏。
- 就绪判据：`filledCells > 0`，实测 **73 秒**（含 1 次 stall-refresh）。壳文本 1.6M
  早就齐了，任何文本长度判据都会提前误判。

## 怎么采

```sh
platforms/semrush/backlink-analytics/backlinks/collect.sh [domain] [out-dir]
# 例：collect.sh figma.com   → 证据落 backlink/evidence/ground-truth/ 下带时间戳目录
# 默认 domain=canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`：自动持机器级
semrush 锁、会话 `semrush-nav`。采完由 AI 对质双证人出结论。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 丢失行的灰字注释 | 丢失链接行带「丢失:链接已移除」灰字，是**行内注释不是新行**，解析计数别多算 |
| overview 判空作废 | 概览摘要卡显示 0 时明细页照样 1.28 亿条——判空只认本页行数（见板块 OVERVIEW） |
| 未知子路径 302 | `/analytics/backlinks/<乱猜>` 统一 302 回 overview，回落页不是本页空态 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）双证人抽查：~127,977,174 /
  AS 92 Grupo TecnoSpeed 7·8 / AS 90 flippingbook 13·180 / 2026年7月5日·3 天前——
  像素↔DOM 全部命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinks-list/`；
  判决书 `…/semrush-backlinks-audience-VERDICTS.md` 页卡 1。
- 截图档案：`assets/loaded.png`（渲染完成首屏：分组卡 + 过滤条 + 表格头部）。
