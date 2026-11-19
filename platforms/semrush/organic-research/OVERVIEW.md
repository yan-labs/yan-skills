# Organic Research + Keyword Gap（抄竞品链路）板块索引

host: sem.proxy.example.com。6 条路由已于 2026-08-29 双证人判决（目标域名 canva.com，db=us），
判决书见 `backlink/SKILL.md` 的 `<semrush-organic-route-capabilities>` 块；本地全文在
`backlink/evidence/ground-truth/semrush-organic-VERDICTS.md`（gitignore）。

## 已判决路由

| 路由 | URL 模板 | 形状 | 规模（canva.com/us） | 回答什么 | PAGE.md |
|---|---|---|---|---|---|
| 排名 positions | `/analytics/organic/positions/?db=us&q=<domain>&searchType=domain` | 摘要卡+分布图+表格 | 990 格；总量 1,658,077 词 / 16,581 页 | 该域靠哪些词拿流量 | ✅ `positions/PAGE.md` |
| 排名变化 changes | `/analytics/organic/changes/?db=us&q=<domain>&searchType=domain` | 趋势图+变化卡+表格 | 1,230 格；45,382 条变化 | 竞品最近新增/上升/下跌/丢失的词（「新增」是纯 DOM 文本，可解析） | ✅ `changes/PAGE.md` |
| 主要页面 pages | **`/analytics/toppages/?db=us&q=<domain>&searchType=domain`**（`/analytics/organic/pages/` 会 302 到这里） | 摘要卡+3 线趋势+表格 | 997 格；33,931 页 | 哪些页面扛自然流量；含 2026 新列「大型语言模型提示」 | ✅ `pages/PAGE.md` |
| 竞争对手 competitors | `/analytics/organic/competitors/?db=us&q=<domain>&searchType=domain` | 气泡图+表格 | 700 格；305,726 个竞品 | 词重合度最高的竞品（首行 adobe.com 17%） | ✅ `competitors/PAGE.md` |
| 子域名 subdomains | `/analytics/organic/subdomains/?db=us&q=<domain>&searchType=domain` | 单表格 | 60 格（15 行×4 列），无分页 | 流量在哪些子域（www 100%，37.25M） | ✅ `subdomains/PAGE.md` |
| **Keyword Gap** | `/analytics/keywordgap/?q=<you>&searchType=domain&rankType=<bucket>&db=us&compareWith=…` | 机会卡+韦恩图+分桶表格 | 1,000 格；七分桶 45.4K～3.9M | 竞品有而你没有/你弱的词——选题直接来源 | **✅ `keyword-gap/PAGE.md`** |

## 同导航组、未采路由（待建候选）

| 路由 | 入口 | 备注 |
|---|---|---|
| Organic Research · 主题 topics | 顶部 tab（概览/排名/排名变化/竞争对手/**主题**/子域名） | 本轮未采 |
| 比较域名 | `/analytics/comparedomains/?db=us&q=<domain>&searchType=domain` | 未采 |
| 反向链接差异 Backlink Gap | `/analytics/gap/backlinks/?q=<domain>&searchType=domain` | 未采；外链拓展名单来源 |

## 板块级要点

- 五条 Organic 路由就绪都在 27–38 秒（含 stall-refresh 一次刷新），readyBranch 均为 table。
- 对比类工具（Gap / X vs Y）**单输入只测得退化表单态，不构成功能证据**——采集必须喂满
  对比集（3 域名 / 3–5 词）。keywordgap-entry 单域名样本已判 INVALID。
- pages 路由的 302 别名是「同查询重定向」不是接管：采集直接用 `/analytics/toppages/`，
  或给 ground-truth.mjs 传 `--accept-redirect /analytics/toppages/`。
