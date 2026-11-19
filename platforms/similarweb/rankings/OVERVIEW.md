# Website Rankings（站点排名·万域榜）板块索引

host: sim.proxy.example.com，hash 路由。1 条路由已于 2026-08-29 双证人判决（explore 轮），判决书见
`backlink/SKILL.md` 的 `<similarweb-explore-capabilities>` 块；本地全文
`backlink/evidence/ground-truth/similarweb-explore-VERDICTS.md`（gitignore）。

## 已判决路由

| 路由 | hash 模板 | 形状 | 规模 | PAGE.md |
|---|---|---|---|---|
| 类目榜 | `markets/webmarketanalysis/mapping/<大类~子类>/<国>/1m?webSource=Total` | 3 小表 + 列主序 DIV 大榜 | 10,000 域 × 13 列 × 100 页，9 渠道 tab | ✅ `category-board/PAGE.md` |

| 行业选择器 | `markets/webmarketanalysis/home`（无参数） | 搜索式覆盖层 + 空报表壳 | 217 行业（26 大类 + 子类），9 渠道 tab | ✅ `industry-picker/PAGE.md` |

**更正（2026-08-30 round4）**：行业选择器此前记作「待补测 / 无独立证据目录」，
现已双证人采过——它**不是行业树页面**，是一张自动弹出的搜索式选择器覆盖层压在空报表壳上。
`readyBranch=null`、`stopReason=budget`、**exit 2 在这页不是「空」**：cells 与 svgText 为零
是对的（本页确实没表没图），但 217 个行业名在 deepText 里一个不少。
选择走「打开选择器 → 输入过滤 → CDP 点结果行（`--nth 0`）」三步，落地即 mapping 路由；
**落地国家段是 `840` 不是 `999`**（面板记住了上次 UI 选的国家）。三步只在不知道 slug 时跑一次。

## 板块级要点

- 行业 slug 可读、可猜：`~` 分层级
  （如 `Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design`），猜测直达成功。
- **换国家必须走 UI**：深链改 999→840 被静默改写回 999；UI 换完的 URL 含 840 可复制。
- 主榜是列主序 DIV，**不产 cells**；`filledCells=40` 只来自旁边 Top movers 小表。
