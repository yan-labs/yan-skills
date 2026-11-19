# Organic Research · 竞争对手（competitors）

## 页面身份

```
https://sem.proxy.example.com/analytics/organic/competitors/?db=us&q=<domain>&searchType=domain
```

- `q`：目标域名；`searchType`：固定 `domain`；`db`：数据库（us）
- `document.title`：`canva.com：竞争对手，自然排名`——title 反映页面内容，可作落点旁证
- URL 直达，无需表单；`__gmitm=` 剥敏只留键名
- 单域名输入即可出结果——这页不是对比工具，别和 Keyword Gap 的「必须 2+ 域名」搞混

## 回答什么业务问题

和目标域词重合度最高的竞品是谁——**Keyword Gap 对比集的选材来源**：
先在这页拿到 top 竞品名单，再喂给 `../keyword-gap/collect.sh` 挖缺失词。

## 数据清单（canva.com，db=us，2026-08-29）

1. **竞争排名气泡图**（svgText=17，轴数值以文本存在于 SVG）。
2. **主表**（700 格 = 100 行 × 7 列，filled=cells 全满）：
   域名 / 竞争程度 / 通用关键词 / SE 关键词 / 流量 / 成本 / 付费关键词。
3. **总量**：305,726 个竞品。
4. 首行样例：adobe.com，竞争程度 17%，通用关键词 328.5K。
5. 抽查样例（双证人全 HIT）：305,726、adobe.com、figma.com、magnific.com、
   328.5K、43.7M。摘要数值与排名页同域数据（流量 37.3M 等）互证一致。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 27.6 秒就绪（含 stall-refresh 一次：前 3 轮停在 1.6M 壳 filledCells=0，
  reload 后 700 格一次性全落）。
- shadowRoots=36；表格主体在 light DOM（light = deep = 700）。
- 9 屏滚动到底（bodyScrollHeight≈5,343），stopReason=stable。

## 怎么采

```sh
platforms/semrush/organic-research/competitors/collect.sh [domain]
# 例：collect.sh figma.com     # 默认 canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
机器级 semrush 锁、会话 `semrush-nav`。采完由 AI 对质双证人出结论（脚本不判决），
配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,024 字符在数据到位前就齐了；就绪只认 filledCells |
| 卡壳是常规 | 首开常停壳态，stall-refresh 是标配不是异常 |
| 气泡图只在 SVG | 气泡位置/轴数值在 svgText 里；竞品名单以主表为准，别读图 |
| 首页≠全量 | 主表 100 行；305,726 个竞品的长尾在分页里，通常只需要前 100 行选对比集 |

## 验证记录

- **2026-08-29**（UTC 09:57–09:58）双证人判决，会话 `semrush-nav`，整轮持锁：
  抽查 305,726 / adobe.com / figma.com / magnific.com / 328.5K / 43.7M
  像素↔DOM 全命中；气泡图轴数值在 svgText 中确认。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-organic-competitors/`
  （manifest + 4 次 poll + 9 屏截图×census）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/bubble-table.png`（气泡图 + 主表首屏，首行 adobe.com）。
