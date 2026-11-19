# Backlink Analytics · 编入索引页面（indexed pages，slug 是 `pages`）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/backlinks/pages/?q=<domain>&searchType=domain`
- **tab 中文名「编入索引页面」，slug 却是 `pages`**。`/analytics/backlinks/indexed-pages/`
  是死路由，302 回 overview。
- tab 行不是 `<a href>`（JS router），href 扒不到——本判决是深点 tab 后读 location
  才拿到 slug 的。

## 回答什么业务问题

竞品哪些页面吃到最多外链——值得抄的 linkable asset 排行。选「做什么页面能自然拿链」
直接看这页头部。

## 数据清单（canva.com，2026-08-30）

1. **计数**：1-100（约 **89,284,236** 页），100 行/页。
2. **失效页面 checkbox**（过滤失效页）。
3. **列**：标题和 URL / 反向链接 / 域名 / 外部链接 / 内部链接 / 上次发现日期。可导出。
4. 头部样例：canva.com 主页 5,998,901 反链 / 152,092 域；ai-image-generator
   24,153 / 4,362；colors/color-wheel 8,892 / 3,339。

## 形状与就绪

- 形状：**grid 表**（readyBranch=table），约 600 cells/屏。
- 就绪判据：`filledCells > 0`。

## 怎么采

```sh
platforms/semrush/backlink-analytics/indexed-pages/collect.sh [domain] [out-dir]
# 默认 domain=canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
semrush 机器锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| slug 与 tab 名不一致 | 「编入索引页面」→ `pages`；猜 `indexed-pages` 会 302 回 overview 被自检判 hijack |
| **标题不可信** | 大量标题是「Unsupported client – Canva」（Semrush 爬虫被 Canva 前端拒了）——排行判读**以 URL 为准**，别按标题聚合 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）双证人抽查：89,284,236 /
  5,998,901·152,092 / 177,849·17,457 / 24,153·4,362——全部命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinks-overview-indexed/`
  （census-indexed-*.json + shot-indexed-*.png；overview 陷阱同目录）；
  判决书 `…/semrush-backlinks-audience-VERDICTS.md` 页卡 4。
- 截图档案：`assets/loaded.png`（失效页面 checkbox + 表格头部与主页首行）。
