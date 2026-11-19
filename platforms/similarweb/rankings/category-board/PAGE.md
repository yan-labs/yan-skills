# Website Rankings · 类目榜（mapping）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/markets/webmarketanalysis/mapping/<大类~子类>/<国>/1m?webSource=Total`
  - 行业 slug 可读可猜（`~` 分层级），猜测深链成功且 hash 不漂移
  - 国家段 999=全球、840=美国，但**深链改国家段会被静默改写回 999**——换国走 UI 下拉

## 回答什么业务问题

赛道地图 + 窜升榜：一个类目里 10,000 个域按流量排座次，按渠道切片
（「谁在吃生成式 AI 流量」直接有 tab）——选站的上帝视角表。

## 数据清单（Graphics_Multimedia_and_Web_Design，全球，1m，2026-08-29）

1. Top movers 三小表：Top climbers / Top fallers / New entrants
   （本类目 New entrants 空态「没有可用的数据」= 真空态，不是坏页）。
2. **主榜 10,000 域**，100 行/页、分页「N out of 100」，**13 列**（默认显示 12/13）：
   域 / 流量来源份额% / MoM 流量变化 / 排名变化 / 行业排名 / 每月访问量 /
   已消除重叠的受众 / 年度变化 / 桌面与移动 / 访问持续时间 / 页面数/访问 / 跳出率 / AdSense。
3. **9 个渠道 tab**：所有/搜索/社交/显示广告/外链/直接/电子邮件/生成式 AI/联盟合作方。
4. 筛选：网站类型下拉、表内搜索框、导出 Excel（未碰）。
5. 首行样例（全球）：canva.com 22.46% · #17 · 822.1M 月访问 · 158.2M 去重受众 · ↑9.73%。

## 形状与就绪

- **主榜是列主序 DIV，不产 cells**；filledCells=40 只来自 Top movers 小表——
  「cells>0」就绪早于主榜且主榜规模不可由 cells 读出。就绪判读靠 deepText grep + 读图。
- 主滚动条在内层 `.sw-layout-scrollable-element`；图表动画使截图 md5 恒变，
  census-stable-shot-unstable 是诚实到底信号。

## 怎么采

```sh
platforms/similarweb/rankings/category-board/collect.sh [slug] [out-dir]
# 例：collect.sh "Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design"
```

翻页：分页器是 input（深层探针 `[class*=pagination]` 找不到，像素证人先发现），
填页码+Enter 直跳（实测页 5 → 行号 401–500）。全量 100 页要另行设计，勿逐页点烧配额。

## 已知坑

| 坑 | 细节 |
|---|---|
| 深链换国无效 | 999→840 被改写回；UI 下拉（shadow DOM，deep `.click()`）换完可复制 URL |
| 语义点击不可靠 | 行业树 `click --text` 落第一项；进类目一律深链 slug |
| 换国后骨架条 | 底部列短暂骨架时 census cells=0 但主榜已有行——cells 不是本页判据 |
| New entrants 空态 | 真空态（有「没有可用的数据」文案），别当坏页重试 |

## 验证记录

- **2026-08-29** explore 轮双证人（窗口+内层滚动+翻页对+换国对）；
  twibbonize 1678/#947、canva 22.46%/#17/822.1M、页 5 行号 487–500 双向命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-rankings-graphics/`；
  判决书 `…/similarweb-explore-VERDICTS.md` 第 3–4 节。
- 截图档案：`assets/board.png`。
