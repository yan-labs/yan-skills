# Referrals（引荐进出）板块索引

host: sim.proxy.example.com，hash 路由。2 条路由已于 2026-08-30 round3 双证人判决，判决书见
`backlink/SKILL.md` 的 `<similarweb-round3-capabilities>` 块（路由 #16/#17）；本地全文
`backlink/evidence/ground-truth/similarweb-round3-VERDICTS.md`（gitignore）。

## 已判决路由

| 路由 | hash 模板 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| 导入 incoming | `websiteanalysis/referrals/*/999/1m?webSource=Total&selectedTab=incomingTraffic&key=<域>` | 指标卡+分布+域榜 | chart | ✅ `incoming/PAGE.md` |
| 出站 outgoing | 同上 `selectedTab=outgoingTraffic` | 同构 | null（机器盲，exit 2） | ✅ `outgoing/PAGE.md` |

## 板块级要点

- 域走 `&key=<域>`（路径段是字面量 `*`）；漏 key 落「输入查询」空态。
- 时长段 1m 落地会被面板静默改写（incoming 实测 1m→6m）——模板以落地 href 为准。
- 两条路由页面结构相同，但机器就绪分支只有 incoming 触发（svgText=15）；
  **outgoing 是机器盲路由，exit 2 ≠ 空**（59.7M 导出访问在 deepText 与像素里俱全）。
- 这是外链选站的直接底表：incoming = 竞品的外链来源清单（2,329 域，100 行/页）。
