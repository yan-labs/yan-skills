# Organic Research · 排名（positions）

## 页面身份

```
https://sem.proxy.example.com/analytics/organic/positions/?db=us&q=<domain>&searchType=domain
```

- `q`：目标域名（如 `canva.com`）；`searchType`：固定 `domain`；`db`：数据库（us）
- `document.title`：`canva.com：排名，自然排名`——**本板块 title 反映页面内容**
  （区别于 Traffic Analytics 的恒定 `Dashboards`），可作落点旁证但就绪仍看 filledCells
- URL 直达，无需表单；`__gmitm=` 剥敏只留键名

## 回答什么业务问题

该域靠哪些词拿自然流量——竞品关键词全量清单的入口，抄竞品选题先从这页拉词库。

## 数据清单（canva.com，db=us，2026-08-29）

1. **顶部摘要卡**：关键词 1.7M（-3.54%）、流量 37.3M、成本 $65.7M
   （与竞争对手页同域数值互证一致）。
2. **排名分布图**（svgText=19，轴数值以文本存在于 SVG）。
3. **主表**（990 格 ≈ 99 行 × 10 列，grid=1，cells=1,100 含表头）：
   关键词 / 意图 / 排名 / SERP features / 流量 / 流量% / 搜索量 / KD% / URL / 上次更改。
4. **总量**：1,658,077 个关键词，16,581 个页面。
5. 抽查样例（双证人全 HIT）：remove background、meme generator、12.3K、673K。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 31.7 秒就绪（含 stall-refresh 一次：前 3 轮停在 1.6M 壳
  deepTextLength=1,599,007 / filledCells=0，reload 后一轮内 990 格全落）。
- shadowRoots=36；表格主体在 light DOM（light cells = deep cells = 990）。
- 10 屏滚动到底（bodyScrollHeight≈6,548），stopReason=stable。

## 怎么采

```sh
platforms/semrush/organic-research/positions/collect.sh [domain]
# 例：collect.sh figma.com     # 默认 canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,007 字符在数据到位**之前**就齐了；任何 deepTextLength 阈值都会把壳当货，就绪只认 filledCells |
| 卡壳是常规 | 同 URL 首开常停壳态，stall-refresh（3 轮 census 不变且 filledCells=0 → reload）是标配不是异常 |
| 分布图只在 SVG | 排名分布的轴数值在 svgText 里，不在表格格子里；要分布数据得单独解析 SVG 文本 |
| 摘要卡≠表格 | 关键词总量 1.7M 在摘要卡，主表只渲染首页 ~100 行；「采到 990 格」不等于「采到全量」，全量要另行设计分页 |

## 验证记录

- **2026-08-29**（UTC 09:51–09:52）双证人判决，会话 `semrush-nav`，整轮持锁：
  抽查 1,658,077 / 16,581 / 37.3M / 1.7M / 65.7M / remove background / 12.3K /
  673K / meme generator 像素↔DOM 全命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-organic-positions/`
  （manifest + 4 次 poll + 10 屏截图×census）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（摘要卡 + 分布图 + 主表首屏）。
