# Organic Research · 子域名（subdomains）

## 页面身份

```
https://sem.proxy.example.com/analytics/organic/subdomains/?db=us&q=<domain>&searchType=domain
```

- `q`：目标域名；`searchType`：固定 `domain`；`db`：数据库（us）
- `document.title`：`canva.com：子域名，自然排名`——title 反映页面内容，可作落点旁证
- URL 直达，无需表单；`__gmitm=` 剥敏只留键名

## 回答什么业务问题

目标域的自然流量落在哪些子域上——判断竞品是主站吃流量还是子域（blog/help/shop）
吃流量，决定自己要不要拆子域，一眼看完。

## 数据清单（canva.com，db=us，2026-08-29）

1. **单表格**（60 格 = 15 行 × 4 列，全量在首屏，**无分页**）：
   子域名 / 流量 / 流量% / 关键词。
2. 首行样例：www.canva.com，37,250,720，100.00%，1.7M——www 占了全部流量。
3. 其余子域样例：status、shop、designschool（流量占比可忽略）。
4. 本页没有摘要卡、没有图表（svgText=0）——是本板块唯一的纯表格页。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 27.6 秒就绪（含 stall-refresh 一次：前 3 轮停在 1.6M 壳 filledCells=0）。
  页面极简但壳的开销一分不少——就绪耗时和大表格页同级。
- shadowRoots=36；表格主体在 light DOM（light = deep = 60）。
- bodyScrollHeight≈1,022，一屏装完；3 步即 stable，本板块最快收工的采集。

## 怎么采

```sh
platforms/semrush/organic-research/subdomains/collect.sh [domain]
# 例：collect.sh figma.com     # 默认 canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
机器级 semrush 锁、会话 `semrush-nav`。采完由 AI 对质双证人出结论（脚本不判决），
配额纪律见 `../../OVERVIEW.md`。15 行首屏全量，**这页不存在分页/滚动补采问题**。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,007 字符在 60 格数据到位前就齐了；哪怕这页只有 743 字符的真实数据（lightTextLength），壳判据照样误报，就绪只认 filledCells |
| 卡壳是常规 | 首开常停壳态，stall-refresh 是标配不是异常 |
| 行数因域而异 | canva.com 是 15 行；换域名行数不同，60 格是样本值不是常量，就绪判据别写死格数 |

## 验证记录

- **2026-08-29**（UTC 09:58–09:59）双证人判决，会话 `semrush-nav`，整轮持锁：
  抽查 www.canva.com 37,250,720 100.00 1.7M / status / shop / designschool
  像素↔DOM 全命中；15 行全量确认在首屏、无分页。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-organic-subdomains/`
  （manifest + 4 次 poll + 3 屏截图×census）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/full-table.png`（15 行全量单表）。
