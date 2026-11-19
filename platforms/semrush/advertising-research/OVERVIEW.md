# Advertising Research（广告研究）板块索引

URL 基式：`/analytics/adwords/<路由>/?db=us&q=<domain>&searchType=domain`（host: sem.proxy.example.com）。
`q=` / `db=` 参数**只对本 `/analytics/adwords/` 组生效**（.Trends 侧不吃 `q=`）。
2026-08-30 双证人（ground-truth.mjs，会话 `semrush-nav`，目标 canva.com）判决，判决书见
`backlink/SKILL.md` 的 `<semrush-ads-trends-capabilities>` 与
`<semrush-keyword-research-capabilities>`（round4 补测四 tab）块；本地全文
`backlink/evidence/ground-truth/semrush-ads-trends-VERDICTS.md`、
`…/semrush-round4-VERDICTS.md`（gitignore）。

顶部 tab 全集（实见）：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名 ——
organic 四件套的付费版；**六个 tab 已全部实测**（round4 补齐后四个）。

## 已判决路由

| 路由 | URL 模板 | 形状 | 规模（canva.com/us） | 回答什么 | PAGE.md |
|---|---|---|---|---|---|
| 排名 positions | `/analytics/adwords/positions/?db=us&q=<domain>&searchType=domain` | 摘要卡+趋势图+表格（readyBranch=table，31s） | 2,607 付费词，100 行/页×27 页 | 竞品投了哪些 Google Ads 词（已验证商业意图词） | **✅ `positions/PAGE.md`** |
| 广告创意 copies | `/analytics/adwords/copies/?db=us&q=<domain>&searchType=domain` | **卡片网格，无表格无图**（data-not-in-table） | 2,118 条广告创意 | 竞品广告文案原文 + 每条文案背书多少词 | **✅ `ad-copies/PAGE.md`** |
| 排名变化 changes | `/analytics/adwords/changes/?db=us&q=<domain>&searchType=domain` | 分桶 pill+日级增失图（svgText 18）+表 | 新增 0 / 丢失 99 / 上升 0 / 下降 0（@2026-08-28） | 竞品付费词的日级增失 | **✅ `changes/PAGE.md`** |
| 竞争对手 competitors | `/analytics/adwords/competitors/?db=us&q=<domain>&searchType=domain` | 气泡图（svgText 33）+表（700 格） | 631 个付费竞品，首行 picsart.com 21.2% | 付费词重合度最高的竞品 | **✅ `competitors/PAGE.md`** |
| 页面 pages | `/analytics/adwords/pages/?db=us&q=<domain>&searchType=domain` | 单表（360 格） | 付费页面 72，首行 www.canva.com/ 54K | 广告落地页分布 | **✅ `pages/PAGE.md`** |
| 子域名 subdomains | `/analytics/adwords/subdomains/?db=us&q=<domain>&searchType=domain` | 单表（4 格） | 1 行：www.canva.com 70,748/100% | 付费流量在哪些子域 | **✅ `subdomains/PAGE.md`** |

## 负面判决 / 死路由（不建目录，留档止损）

| 路由 | 判决 |
|---|---|
| ~~`/analytics/adwords/adshistory/`~~ ~~`/analytics/adwords/adhistory/`~~ | **两条路径都 302 回 positions**（hijack 自检 exit 3）。本账号/版本**无独立 Ads History 工具**：广告组左侧导航实见全集（开始 / Ads Launch Assistant / 广告 AI 代理 / 广告研究 / 谷歌购物广告研究 / AdClarity）里没有它。「某词连投 12 个月」矩阵在本版本 UI 无独立入口；未知 adwords 子路径统一回落 positions（本轮实证的四个真 tab 不在回落名单里）。**替身判决（2026-08-30 已探）**：Keyword Overview 页内**无**独立广告历史区块——底部只有「谷歌购物广告创意 / 广告创意」两个卡位，信息词下空卡位是正常态；商业词是否填充未测（仅剩候选探针）。证据：`semrush-adwords-adshistory/`、`semrush-adwords-adhistory-kw/`、`semrush-round4-keywordoverview/` |

## 板块级要点

- **exit 2 ≠ 空页**：copies 是全平台第一条 data-not-in-table 路由——table/chart 分支
  都不就绪，普通跑法 budget 退出，但 deepText 里数据齐全。判空前必须先 grep deepText；
  采集必须带 `--ready-text`。
- 镜像补丁坑（全平台通用）：gmitm 把 `document.referrer` 的 getter 换掉了，referrer 为空时
  读它直接抛 `Cannot read properties of undefined (reading 'charAt')`——页内 eval 读
  referrer 必须 try/catch。
- 表头词无障碍副本重复两遍（「关键词 关键词」），解析先去重；截图一屏只见约 7 列。
- 配额纪律见 `../OVERVIEW.md`：机器级 semrush 锁、单会话串行、30s 级间隔。
