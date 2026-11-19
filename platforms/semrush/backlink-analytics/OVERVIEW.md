# Backlink Analytics（外链全家桶 + Backlink Gap + 竞争对手监控）板块索引

host：`sem.proxy.example.com`。7 条路由已于 2026-08-30 用双证人（`backlink/scripts/ground-truth.mjs`，
整轮持机器级 semrush 锁，会话 `semrush-nav`）全部判决，判决书见 `backlink/SKILL.md` 的
`<semrush-backlinks-monitoring-capabilities>` 块与本地
`backlink/evidence/ground-truth/semrush-backlinks-audience-VERDICTS.md`（证据目录 gitignore）。
目标域名 canva.com；Gap 对比组 canva.com vs figma.com vs adobe.com。

注意：这组页面**不共享一个 URL 前缀**——明细四件套在 `/analytics/backlinks/` 下，
引荐域名却是 `/analytics/refdomains/report/`（左栏「外链建设」组的独立工具），
Backlink Gap 在 `/analytics/gap/backlinks/`，竞争对手监控在
`/analytics/traffic/competitor-monitoring`（.Trends 路由，但判决与本批同轮，故归本板块）。

## 已判决可用页面

| 页面 | 路由 | 形状 | 规模（canva.com） | PAGE.md |
|---|---|---|---|---|
| 反链概览 | `/analytics/backlinks/overview/` | 摘要卡 + 图表卡（本轮多卡故障） | AS/自然流量 2.9亿/网络图表正常 | **✅ `overview/PAGE.md`** |
| 反向链接明细 | `/analytics/backlinks/backlinks/` | grid 表（73s 就绪，320 cells/屏） | ~127,977,174 条，100 行/页 | **✅ `backlinks/PAGE.md`** |
| 引荐域名 | `/analytics/refdomains/report/` | grid 表（40s，600 cells/屏） | ~628,658 域，100 行/页 | **✅ `refdomains/PAGE.md`** |
| 锚链接 | `/analytics/backlinks/anchors/` | grid 表（40s，500 cells/屏） | 100 行/页，总数不显示 | **✅ `anchors/PAGE.md`** |
| 编入索引页面 | `/analytics/backlinks/pages/` | grid 表（600 cells/屏） | ~89,284,236 页，100 行/页 | **✅ `indexed-pages/PAGE.md`** |
| Backlink Gap | `/analytics/gap/backlinks/` → 302 `…/report/` | 真 `<table>`（700 cells，本批唯一） | 潜在机会 506,817 引荐域（3 域对比） | **✅ `backlink-gap/PAGE.md`** |
| 竞争对手监控（EyeOn 后继） | `/eyeon/` → 302 `/analytics/traffic/competitor-monitoring?lid=<listId>` | **DOM 全盲页**（像素-only） | 谷歌搜索广告 2572 / 博文 0 / 新页面 1656 | **✅ `competitor-monitoring/PAGE.md`** |

## 死路由更正（不建目录，进来的先读这里）

- **`/analytics/backlinks/refdomains/` 是死路由**，302 回 `/analytics/backlinks/overview/`
  （hijack 自检 exit 3 留档：`semrush-backlinks-refdomains/`）。引荐域名不是 backlinks 的
  tab，正路是 `/analytics/refdomains/report/?q=<domain>&searchType=domain`。
- **`/analytics/backlinks/indexed-pages/` 是死路由**，302 回 overview。tab 中文名
  「编入索引页面」，slug 却是 **`pages`**：`/analytics/backlinks/pages/`。
- 规律：**未知 backlinks 子路径统一 302 回落 overview**（与 adwords 组回落 positions
  同模式）。302 回落是「路由不存在」的形状，不是「无数据」——别把回落页当目标页的空态读。
- 旧 app 路径（`/trends/one2target/` 型）在本镜像一律 404。

## One2Target：负面判决（独立工具不存在，不建目录）

- `/trends/one2target/` → 404「我们迷路了」；.Trends 左栏 28 项实扒无此条目。
- 其四个 tab = 流量与市场「受众」组四条路由，均已有双证人判决：
  `demographics`（20 filledCells）/ `audience-overlap`（204）/ `socioeconomics`
  （chart-only）/ `behavior`（data-not-in-table）。
- 找受众画像走 `/analytics/traffic/{demographics|socioeconomics|behavior|audience-overlap}/
  ?q=<domain>&searchType=domain`（见 `../traffic-analytics/OVERVIEW.md`），**别再找 One2Target 入口**。

## 板块级要点

- **overview 摘要卡的 0 是组件故障，不是域名事实**：本轮 overview 渲染「引荐域名 0 /
  反向链接 0」+ Authority Score「Data is unavailable · Reload」，而同一时刻明细页有
  628K 域 / 1.28 亿条。判一个域名有没有外链，永远去明细路由数行（详见 `overview/PAGE.md`）。
- 明细四件套 + Gap 都是 table 分支（`filledCells > 0` 就绪），唯独 Backlink Gap 是真
  `<table>` 元素，其余全是 `role=grid` DIV。
- **Backlink Gap 六桶不可 URL 直达（2026-08-30 round4 负面判决）**：`rankType=` 被
  静默忽略、桶点击不改 URL、每次加载仅首次桶点击可靠——多桶采集唯一可靠配方是
  **一桶一开页**；六桶实测计数（最佳 507,776 / 弱 14,803 / 强 131,926 / 共享 14,803 /
  唯一 629,264 / 所有 725,662）与配方详见 `backlink-gap/PAGE.md`。
  **桶类筛选器的 URL 参数不可信，需逐工具实证**——Keyword Gap 直达可用，本页证伪。
- 竞争对手监控是全平台唯一 **DOM 全盲页型**：census 全 0 而像素满数据，三条就绪分支失明，
  只能像素采集（详见 `competitor-monitoring/PAGE.md`）。
- 配额纪律、假付费墙、壳先到货后到等平台级坑见 `../OVERVIEW.md`。
