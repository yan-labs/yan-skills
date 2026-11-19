# AI Traffic（AI 流量）板块索引

host：`sim.proxy.example.com`。2026-08-30 第四轮判决，判决书见 `backlink/SKILL.md` 的
`<similarweb-round4-capabilities>` 块与本地
`backlink/evidence/ground-truth/similarweb-round4-VERDICTS.md`（证据目录 gitignore）。

## ⚠️ 本板块是一次翻案，先读这段

第三轮把 AI Traffic 记成「**空态等待输入**」并据此没有深挖。**那条记录是错的。**
页面既不是空态，也不是「只有某些域有数据」——**URL 少了 `&key=<域>`**。
补上 key 之后这是第四轮数据最厚的一条路由：真 table + 两张图 + 22 个 AI 平台明细。

由此固化两条通用法则（已写进 SKILL.md）：

1. **「空态等输入」从来不是一条能写进档案的判决**，它只说明 URL 没带全上下文。
   任何以「空态」结案的旧记录，都应当先补 `&key=` 重测一次。
2. **「冷深链落错误页/空页」有两种成因，别混**：
   (a) 参数值不在枚举里 → 功能真的没有；
   (b) 少了必需的上下文参数 → 功能在，是 URL 写错了。
   **判别子：先把 UI 的下拉/选择器枚举出来**，枚举里有就是 (b)，没有就是 (a)。

## 已判决路由

| 页面 | 路由 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| AI 流量概览 | `#/digitalsuite/ai-traffic/overview/*/999/6m?webSource=Total&key=<域>` | 顶部卡 + 堆叠条 + 面积图 + 平台复选列表 + 真 table | `table`（cells 105 / filled 100，svgText 16；2 poll 就绪） | **✅ `overview/PAGE.md`** |

同一模块下的其他 tab 未探测。**未探 ≠ 不存在。**

## 板块级要点

- 与 Semrush 的口径分工：Semrush 的「AI 流量」只是流量渠道表里的**一列**；
  这一页给的是**按 AI 平台 × 按落地页 URL** 的两维明细，细得多。
- 对 AI SEO / AEO 是硬证据来源：「谁在吃 AI 引荐、AI 把流量送到我哪些页面」直答。
- 平台级坑（hash 路由、镜像抖动、配额纪律、URL 模板以落地 href 为准）见 `../OVERVIEW.md`。
