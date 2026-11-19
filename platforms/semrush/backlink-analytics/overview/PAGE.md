# Backlink Analytics · 反链概览（overview）——带陷阱记录

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/backlinks/overview/?q=<domain>&searchType=domain`
- 同时是本组的**302 回落汇聚点**：任何未知 backlinks 子路径
  （`/analytics/backlinks/refdomains/`、`/analytics/backlinks/indexed-pages/` 等）都
  302 落回这里——落在本页不代表你到了想去的页。
- 顶部有「添加多达 3 个竞争对手」对比槽。

## 回答什么业务问题

单域名外链体检的门面页：AS、反链/引荐域摘要、自然流量、网络图表（声誉）。
**但判「有没有外链」不能用这页**——见下方陷阱。

## 数据清单（canva.com，2026-08-30 实测，含故障态）

| 区块 | 本轮实测 | 可信度 |
|---|---|---|
| 引荐域名摘要卡 | 显示 **0** | **组件故障**——同一时刻明细页 628,658 域 |
| 反向链接摘要卡 | 显示 **0** | **组件故障**——同一时刻明细页 ~1.28 亿条 |
| Authority Score 两卡 | 「Data is unavailable · Reload」 | 故障态自报 |
| 自然流量 | 2.9亿，正常渲染 | 可信（与 .Trends 数量级一致） |
| 网络图表（声誉良好） | 正常渲染 | 可信 |

## 已知坑（本页存在的最大理由）

- **「overview 显示 0 是组件故障，不是域名事实」**：摘要卡渲染 0 / Data is unavailable
  时，census 与像素一致（census 0 cells / svgText 1）——坏的是那几张卡自己，
  不是域名没外链。**任何以 overview 摘要卡为准的判空作废**；判一个域名有没有外链，
  永远去明细路由（`../backlinks/`、`../refdomains/`）数行。
- 302 回落汇聚点：在本页看到「空」先自查 URL 是不是从死路由落回来的（hijack 自检 exit 3
  是正确行为）。

## 形状与就绪

- 摘要卡 + 图表卡混合页，无主表格：本轮 census 0 cells / svgText 1。
- 无可靠的 filledCells 就绪判据；采集按图表页对待，判读靠像素 + AI 对质。

## 怎么采

```sh
platforms/semrush/backlink-analytics/overview/collect.sh [domain] [out-dir]
# 默认 domain=canva.com
```

摘要卡数字**不作为域名事实来源**，采这页只为留档卡片状态（故障与否）与自然流量/网络图表。
要数字去明细页的 collect.sh。配额纪律见 `../../OVERVIEW.md`。

## 验证记录

- **2026-08-30**（会话 `semrush-nav`）顺手采到（非该轮主目标）：摘要卡 0/0 +
  Data is unavailable 与明细页 628K 域/1.28 亿条同时成立，census 与像素一致，
  判为组件故障。故障是否常态**待补测**（只此一轮实录）。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinks-overview-indexed/`
  （census-overview-s1 + shot-overview-s1）；判决书
  `…/semrush-backlinks-audience-VERDICTS.md` 附录。
- 截图档案：`assets/loaded.png`（故障态实录：摘要卡 0 + Data is unavailable +
  正常的自然流量/网络图表）。
