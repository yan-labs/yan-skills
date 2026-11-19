# Keyword Research（关键词研究工具组）板块索引

host：`sem.proxy.example.com`。左侧导航「关键词研究」组实见三项：关键词概览 / 关键词魔法工具 /
关键词策略构建器。三条路由已于 2026-08-30 用双证人（`backlink/scripts/ground-truth.mjs`，
机器级 semrush 锁逐轮持有，会话 `semrush-nav`；tab 交互用一次性只读探针）全部判决，
判决书见 `backlink/SKILL.md` 的 `<semrush-keyword-research-capabilities>` 块与本地
`backlink/evidence/ground-truth/semrush-round4-VERDICTS.md`（证据目录 gitignore）。
种子词 `graphic design`（db=us）。

## 已判决路由

| 页面 | 路由 | 形状 | 规模（graphic design/us） | PAGE.md |
|---|---|---|---|---|
| 关键词概览 | `/analytics/keywordoverview/?db=us&q=<kw>` | 摘要卡+趋势+意见卡+SERP 表（table，33s） | 量 1.2M / KD 77% / CPC $4.13 / 变体 277.8K | **✅ `keyword-overview/PAGE.md`** |
| 关键词魔法工具 | `/analytics/keywordmagic/?db=us&q=<kw>&type=<tab>` | Topics 树+主表（table，31s） | all 149.8K 词 / 总量 10.6M / 平均 KD 40% | **✅ `keyword-magic/PAGE.md`** |
| 关键词策略构建器 | `/analytics/keywordmanager/?db=us&q=<kw>` | 表单入口+列表 grid | 共享账号现存 59 个列表 | **✅ `keyword-strategy-builder/PAGE.md`** |

## 死路由更正（不建目录，进来的先读这里）

- **`/keyword-manager/` 是 404 死路由**（「我们迷路了」页，census 全零）——
  `backlink/references/semrush-feature-map.md` 里写的这条旧路径已被实测**证伪**。
  关键词策略构建器的真路由是 **`/analytics/keywordmanager/`**（落点 href 变为
  `?q=<kw>&owning=all`）。留档：`semrush-round4-kw-strategy-builder/`。

## 板块级要点

- **只读纪律在本板块有真金白银的落点**：Keyword Strategy Builder 的「创建」按钮
  消耗共享配额并新建列表（表单显示「创建 50/50」剩余额度）——**绝不点击**；
  Keyword Magic 的「发送关键词」（加列表入口）与行内勾选框同理不碰。
- Keyword Overview 右上有配额计数（实测 5,000/5,000，即 GURU 每日报表额度），
  是全平台少见的自带配额读数页。
- 页面没水合完时一切 synthetic 点击静默无效——tab 探针必须先轮询到 tab 条出现再点
  （Keyword Magic 实测踩过）。
- 镜像瞬时抖动（「出错了」错误页/白屏/整轮 spinner）reload 一次通常即愈，
  连刷 3 次仍坏才暂记待重测。
- 配额纪律、假付费墙、壳先到货后到等平台级坑见 `../OVERVIEW.md`。
