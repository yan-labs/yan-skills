# Organic Research · 排名变化（changes）

## 页面身份

```
https://sem.proxy.example.com/analytics/organic/changes/?db=us&q=<domain>&searchType=domain
```

- `q`：目标域名；`searchType`：固定 `domain`；`db`：数据库（us）
- `document.title`：`canva.com：排名变化，自然排名`——title 反映页面内容，可作落点旁证
- URL 直达，无需表单；`__gmitm=` 剥敏只留键名

## 回答什么业务问题

竞品最近新增 / 上升 / 下跌 / 丢失了哪些词——盯竞品动作的雷达页。
「新增」「丢失」状态字样是**纯 DOM 文本**，直接可解析，不用读图。

## 数据清单（canva.com，db=us，2026-08-29）

1. **趋势图**（svgText=18，轴数值以文本存在于 SVG）。
2. **主要页面变化卡片区**（与主表分属两个 grid，census grids=2）。
3. **主表**（1,230 格，cells=1,420 含表头）：关键词 + 状态（新增/上升/下跌/丢失）+
   先前排名 / 当前排名 / 位差 / 流量变化 等列。
4. **总量**：45,382 条变化。
5. 抽查样例（双证人全 HIT）：how to make a vision board、qr code generator（丢失）、
   -9.6K、165K、december 2025 calendar。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 37.9 秒就绪（本板块五路由里最慢的一条；含 stall-refresh 一次：
  前 3 轮停在 1.6M 壳 filledCells=0，reload 后第 5 轮 1,230 格全落）。
- shadowRoots=36；表格主体在 light DOM（light = deep = 1,230）。
- 12 屏滚动到底（bodyScrollHeight≈7,719），stopReason=stable。

## 怎么采

```sh
platforms/semrush/organic-research/changes/collect.sh [domain]
# 例：collect.sh figma.com     # 默认 canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
机器级 semrush 锁、会话 `semrush-nav`。采完由 AI 对质双证人出结论（脚本不判决），
配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,024 字符在数据到位前就齐了；就绪只认 filledCells |
| 卡壳是常规 | 首开常停壳态，stall-refresh 是标配不是异常；本页刷新后仍要多等一轮（37.9s） |
| grids=2 | census 的 filledCells 混计「变化卡」与主表两个 grid；逐列解析时先按 grid 拆开再对行 |
| 趋势图只在 SVG | 趋势曲线数值在 svgText 里，不在表格格子里 |
| 首页≠全量 | 主表只渲染首页；45,382 条变化的全量要另行设计分页，勿逐页点击烧配额 |

## 验证记录

- **2026-08-29**（UTC 09:55–09:56）双证人判决，会话 `semrush-nav`，整轮持锁：
  抽查 45,382 / how to make a vision board / qr code generator（丢失）/ -9.6K /
  165K / december 2025 calendar 像素↔DOM 全命中；「新增/丢失」标签在 DOM 原样存在。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-organic-changes/`
  （manifest + 5 次 poll + 12 屏截图×census）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（趋势图 + 变化卡 + 主表首屏）。
