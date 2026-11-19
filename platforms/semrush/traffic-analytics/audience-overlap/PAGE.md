# Traffic Analytics · Audience Overlap（受众重叠）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/audience-overlap/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「受众重叠」；报表头维度：全球 / 月份 / 所有设备
- 表区控件：类别筛选、「安全模式」开关

## 回答什么业务问题

竞品的受众还访问哪些域名、重叠比例多少——找同受众的联合推广对象、
判断「我的用户还在用什么工具」（如 canva 受众 12.25% 也访问 chatgpt.com）从这页进。

## 数据清单

1. **主表「已访问域名」**：1-50 (429)，50 行 × **5 列** = 250 格，实测 **filledCells=204**
   （「类别」列大量为空，属数据本身缺失）。列：域名、类别、受众总数、潜在观众、受众重叠
   （重叠列同格含百分比 + 重叠人数两个值）。
2. **分页器**：Page 1 of **9**（共 429 个域名）。
3. 样例行（canva.com，2026-07）：chatgpt.com 受众总数 8.5亿 · 潜在观众 6.4亿 ·
   重叠 12.25% / 1亿；claude.ai 3.5亿 · 1.4亿 · 10.2% / 3523.8万；
   pinterest.com 9.38% / 4939.6万；adobe.com 9.24% / 3501万。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`）。就绪判据：**filledCells > 0**。
- 本页满值是 **204 而非 250**——「类别」列天然有空格，判稳定看 204。
- 实测时间线（2026-08-29）：**就绪 44.8 秒**，6 轮 poll，refreshCount=1，stopReason=stable。
  壳先齐、数据后落，刷新一次落地。

## 怎么采

```sh
platforms/semrush/traffic-analytics/audience-overlap/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
翻页批采：`node backlink/scripts/harvest-paginated.mjs --url '<本页 URL>' --out <dir> --max-pages 9`。
**本页是整棵树里唯一适合全量的（canva 9 页 / 429 个域名；nytimes 15 页）**，
也是翻页脚本 2026-08-30 的实盘验证目标——**已跑通**：机制判定 client、
每页 50 行、连点 `Next` 逐页翻动、断点续跑从第 3 页接着采 4/5/6、
6 页合计 300 行 300 唯一、`rowCountMismatch: false`。四个实盘 bug 的复盘见 [`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。

## 已知坑

| 坑 | 细节 |
|---|---|
| 空格是数据不是故障 | 「类别」列多数行为空/「无类别」——filledCells 204<250 是本页常态 |
| 重叠列一格两值 | 「受众重叠」单元格同时含百分比和人数（12.25% 与 1亿），解析要拆 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 表头词重复两遍 | columnheader innerText 形如「域名 域名」，解析去重 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读 `grids` 字段 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页，同板块其他路由实测被导走过；判决前核对每轮 href |
| 「导航成功」≠「有数据」 | open 秒回，数据 45 秒后才落 |

## 验证记录

- **2026-08-29**（UTC 08:11–08:12）双证人复核，canva.com，会话 `semrush-nav`。
  退出码 0（stable，readyBranch=table），就绪 44.8s，refreshCount=1，5 组截图+census。
  filledCells=204 与历史 204 **精确一致**；抽查 chatgpt.com 重叠 12.25%（重叠受众 1亿）、
  claude.ai 3523.8万 均在 census-s1 命中；受众总数亿级与 canva 量级相符。Page 1 of 9。
  裁决：**confirmed-data**。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-audience-overlap/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- **2026-08-30 翻页批采实盘**（nytimes.com，`lid=1234971`，会话 `semrush-nav`，
  整轮持机器级 semrush 锁）。`harvest-paginated.mjs` 两轮各 `--max-pages 3`：
  第 1 轮采 1/2/3、第 2 轮**续跑**自动接上 4/5/6，每页 50 行、`strategy=role-row`、
  `pagerCurrent` 与请求页号逐页一致；合并 300 行 / 300 唯一 / `rowCountMismatch: false`、
  `hijacked: false`、`finalHref` 里 `q=` 与 `lid=` 对得上。
  分页器读作 `Prev Next Page: of 15 Page: 1`（nytimes 15 页，canva 9 页）。
  **跳页（页码输入框）未跑通**——`no page input found`，客户端分页目前只能连点 `Next`。
  复盘（含四个实盘 bug）见
  [`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md) 第六节。
  证据（本地，gitignore）：`backlink/evidence/pagination/audience-overlap-live/`。
- 截图档案：`assets/loaded.png`（「受众重叠」标题 + 已访问域名表首行）。
