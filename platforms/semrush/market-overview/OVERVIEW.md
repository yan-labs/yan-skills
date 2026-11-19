# .Trends 市场概览 + 行业与批量分析 板块索引

URL 基式：`/analytics/traffic/<路由>/`（host: sem.proxy.example.com）。本板块是 .Trends 的「流量与市场」
侧栏两件套：市场概览（Market Explorer 后继）+ 行业与批量分析（Bulk Analysis）。
**页面身份不在 `q=` 而在 `lid=<listId>`**（列表 id），这是与 traffic-analytics 板块最大的差别。
2026-08-30 双证人（ground-truth.mjs，会话 `semrush-nav`，目标 canva.com）判决，判决书见
`backlink/SKILL.md` 的 `<semrush-ads-trends-capabilities>` 块；本地全文
`backlink/evidence/ground-truth/semrush-ads-trends-VERDICTS.md`（gitignore）。

## 已判决路由

| 路由 | URL 模板 | 形状 | 规模（canva.com 市场） | 回答什么 | PAGE.md |
|---|---|---|---|---|---|
| 市场概览 | 入口表单 `/analytics/traffic/market-overview/` → 结果 `?lid=<listId>`（可直达重现） | 摘要卡+SVG 四象限+参与者 grid（346 filledCells） | 99 域名+canva；市场流量 49.4亿↑9.23%；TAM 70亿 / SAM 68.6亿 | 一个 niche 的市场规模/增速/玩家四象限（选生态位） | **✅ `overview/PAGE.md`** |
| 行业与批量分析 | `/analytics/traffic/industry-and-bulk-analysis/`（带 lid 记忆；tab：批量分析 / 商家类别） | 表单（自绘行编辑器+TXT/CSV 上传）→ 结果 grid | 上限 100 域名/次；6 域名 42/42 格一次出全 | 批量对比 访问量/唯一/购买转化率/页数每访/时长/跳出率——配额友好的竞品池筛查 | **✅ `bulk-analysis/PAGE.md`** |

## 死路由更正（不建目录，留档止损）

| 老路由 | 判决 |
|---|---|
| ~~`/analytics/backlinks/bulk/`~~ | 302 回 `/analytics/backlinks/` 落地表单——老外链 Bulk Analysis 路由**已不存在**；真正的批量入口是本板块的「行业与批量分析」 |
| ~~`/trends/market-explorer/`~~ | 404 |
| ~~`/market-explorer/`~~ | 302 → `/analytics/traffic/market-overview/`——Market Explorer 已并入「流量与市场」 |

## 板块级要点

- **AX 全盲**：这批 .Trends 页面同时骗过 AX 树（state 只有 RootWebArea）和 CSS find，
  iframe 假设已排除（deep iframe=0）——只有 `backlink/scripts/lib-deep-dom.mjs`
  穿透可读。别从盲读推「空白页」。
- **computing ≠ empty**：新建市场异步计算，能空骨架屏 40+ 分钟；短 budget exit 2 是
  「还在算」，不是空页也不是付费墙——回访即可。算完的判别子：filledCells 346 + svgText>10。
- 表单页壳都会卡水合（与 keywordgap 同病）：reload 一次，10 秒内出表单。
- 只读纪律：误开的「编辑」弹窗一律「取消」退出；表单「分析」动作会固有产生
  「未命名列表」（与 keywordgap 同类，不算污染）。
- 交叉锚点：canva.com 月访问 7.9亿 在 市场参与者表 / 批量分析结果 / 历史
  semrush-traffic 实测（790,000,000 / 11:02）三方一致。
- 配额纪律见 `../OVERVIEW.md`。
