# Site Audit · 已抓取页面（review/pagereport）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/pagereport`
- **落点会重定向**：→ `…/review/pagereport/pages?sort=prScore_desc&page=1`
  → 采集必须传 `--accept-redirect "/siteaudit/campaign/<CAMPAIGN_ID>/review/pagereport/pages"`，
  否则被落点自检判 hijack（exit 3）。**这是本板块唯一真正需要 `--accept-redirect` 的路由。**
- 默认排序：`sort=prScore_desc`
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

逐页级的清单：每个被抓到的 URL 各自的内链权重、状态码、问题数、抓取深度、
被哪些 AI 搜索机器人挡住。是「哪些页有问题」的最细一层，也是导出修复清单的来源。

## 数据清单

1. **主表**：默认可见 **9 列 / 共 22 列**——
   `ILR`（内链权重）、`页面 URL`、`标题`、`状态代码`、`问题`、
   `被阻止的 AI 搜索机器人`、`抓取深度`、`页面浏览量`、`重新检测`。
   其余 13 列通过「**管理列**」加出来（本轮未动）。
2. **行数 = 本次实际抓取的页数**，与报告头「已抓取页面 N/限额」一致。
   本轮实测 88 行（限额 100）。
3. **分页器**：「页码 1 / 每页 100 / 共 1 页」——每页 100 行，
   所以限额 100 的项目只有 1 页；限额调大后要走翻页批采。
4. 行内「重新检测」按钮是**写操作入口**，按纪律不碰。

## 形状与就绪

- 形状：**真表格**。`readyBranch=table`，`filledCells=608`，不需要 `--ready-text`。
- 到底：`stopReason=stable`，**12 步**到底，scrollY 0→6829，`bodyScrollHeight` 7630。
  `--max-screens` 给小了（如 8）会以 `stopReason=max-screens` 收尾。
- **`max-screens` 收尾不是失败，也不是「到底」**：它只截断**截图覆盖**，
  census 从来是全量的——前一轮 s1–s6 每一份 census 的 deepText 都稳定含全部 88 条 URL 行，
  与页面自报的抓取页数和分页器三方吻合。判「到底」看 `scrollY + innerHeight`
  有没有覆盖 `bodyScrollHeight`。

## 怎么采

```sh
platforms/semrush/site-audit/pagereport/collect.sh [campaign-id] [out-dir]
```

等价于：

```sh
node backlink/scripts/ground-truth.mjs \
  --url "https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/pagereport" \
  --out <dir> --budget 180 --max-screens 16 \
  --accept-redirect "/siteaudit/campaign/<CAMPAIGN_ID>/review/pagereport/pages"
```

行数多于 100 时走翻页批采，配方见
[`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。

## 已知坑

| 坑 | 细节 |
|---|---|
| **必须放行 `/pagereport/pages`** | 不传 `--accept-redirect` 会被判 hijack。注意 accept 的是**真别名的具体路径**，绝不是 `/` |
| `--max-screens` 太小会误导人 | 收尾理由变成 `max-screens`，看起来像没采完；census 其实是全量的 |
| **`deepText` 截断在 ~20,000 字符** | 本轮所有 census 的 `deepText` 长度恰好 20,034。88 行侥幸没被切（业务内容在前，被切的是页脚 CSS 变量表），**行数一多必然吃截断**——大表格按 `filledCells` 计数或按分页拆，别拿 `deepText` 数行数 |
| 默认只有 9/22 列 | 要更多列得点「管理列」，属交互，先确认是只读改动 |
| 「重新检测」是写操作 | 行内按钮，别误触 |

## 验证记录

- **2026-08-30** 双证人采集（`route-pagereport-v2/`），campaign `<CAMPAIGN_ID>`，会话 `semrush-nav`。
  census 的 URL 行 ↔ `shot-s1.png` 表首行（站点首页，ILR 100）一致；
  s12 复核仍是同样的行数，**确认前一轮没有漏行**。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/semrush-siteaudit-example/route-pagereport-v2/`。
- 截图档案：`assets/loaded.png`。
