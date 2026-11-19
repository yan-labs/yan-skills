# Site Audit · 网页可爬性（review/crawlability）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/crawlability`
- 落点：**原样**，不重定向
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「爬虫能不能顺利读完这个站、预算浪费在哪」——可索引性、抓取预算浪费、
点击深度、站点地图与实抓的差额、HTTP 状态码分布，都在这一页。

## 数据清单

1. **网页可爬性分数**（顶部，`分数：N%`）。
2. **站点可索引性**甜甜圈：总抓取页数 / 不可索引 / 可索引。
3. **抓取预算浪费** 10 项计数：临时重定向、永久重定向、重复内容、
   标准化到其他页面、页面容量太大、页面加载慢、4xx、5xx、被阻止抓取、重定向链和循环。
4. **页面抓取深度**分布：1 次点击可达 / 2 次点击 / …（分布越靠前站点结构越扁）。
5. **站点地图 vs 已抓取**：sitemap 条数与实抓页数的差额。
6. **HTTP 状态码分布**：2xx / 3xx / 4xx / 5xx 各多少页。

## 形状与就绪

- 形状：**卡片 + 图表仪表盘**混合。数据主体在 **DIV 卡片**里，不在表格单元格里。
- `filledCells=1`、`svgText=22`。**那 1 个 filled cell 是页面里某个孤立单元格，
  纯属侥幸让它走进 table 分支**——不要指望它。
- **建议显式传 `--ready-text "分数："`**。实测 `stopReason=stable`、4 步到底，
  `manifest.suspectedEmptyState=false`。

> **`filledCells=1` 曾被怀疑成空态，判决是「数据在，只是不在 cells 里」**：
> census 的 deepText 完整含可索引性、抓取预算浪费、点击深度、站点地图差额、
> 状态码分布五组数字，`shot-s1.png` 的甜甜圈与右侧条形图逐项对得上。
> 这正是「卡片型页面双零盲区」的近亲——本页只是侥幸多了 1 格。

## 怎么采

```sh
platforms/semrush/site-audit/crawlability/collect.sh [campaign-id] [out-dir]
```

等价于：

```sh
node backlink/scripts/ground-truth.mjs \
  --url "https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/crawlability" \
  --out <dir> --budget 120 --max-screens 8 \
  --ready-text "分数："
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **`filledCells=1` 是侥幸不是判据** | 那 1 格是孤立单元格，不是数据行；换个版本就可能变 0 而三分支全盲 |
| `filledCells` 少 ≠ 空态 | 数据全在 DIV 卡片与 SVG 里；`suspectedEmptyState=false` 也是这么来的 |
| `分数：` 的冒号是**全角** | 写 regex 时照抄，别换成半角 `:` |
| 「被阻止抓取」不一定是问题 | 站点有意挡掉的中间页（答题页、跳转页）会计入这一栏，是**有意为之且正确**的 |
| 站点地图与实抓的差额是正常现象 | 差额多半是不在 sitemap 里的中间页与 txt/xml 文件 |

## 验证记录

- **2026-08-30** 双证人采集，campaign `<CAMPAIGN_ID>`，会话 `semrush-nav`。
  census 的可索引性 / 预算浪费 / 点击深度 / 状态码四组读数 ↔ `shot-s1.png`
  的甜甜圈中央数字与右侧条形图逐项一致。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/semrush-siteaudit-example/route-crawlability/`。
- 截图档案：`assets/loaded.png`。
