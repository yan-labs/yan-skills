# Traffic Analytics · Subfolders & Subdomains（子文件夹和子域名）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/subfolders-subdomains/?q=<domain>&searchType=domain`
  - `q`：目标域名（如 `canva.com`）
  - `searchType`：固定 `domain`
  - 面板可能自动附加 `lid=<列表id>` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「子文件夹和子域名」；报表头维度：全球 / 月份 / 所有设备
- 顶部两个 tab：**子文件夹 / 子域名**，另有「包括子域名」开关（默认落在子文件夹 tab）

## 回答什么业务问题

竞品的流量按 URL 目录（或子域）怎么分——哪个目录是流量主体、每个目录各渠道
（直接/AI/引荐/自然搜索/付费/社交/邮件/广告）占比多少。选站时定站点结构、
判断「该抄哪个目录」从这页进。

## 数据清单

1. **主表**（`role=grid` DIV，页面 `<table>`=0）：50 行 × **18 列** = **900 个数据单元格**，
   渲染完成时全部非空（filledCells=900）。列：子文件夹、流量比例、唯一页面浏览量、唯一、
   访问量、页数/访问、平均访问时长、跳出率、直接、AI 流量、引荐、自然搜索、谷歌 AI 模式、
   付费搜索、自然社交、付费社交、电子邮件、展示广告。
2. **分页器**：Page 1 of **2,611**（canva.com，规模比 top-pages 的 1,430 页还大）。
3. 首行样例（canva.com，2026-07）：`/design/` 35.74% · 6.1亿唯一页面浏览量 · 1.4亿唯一 ·
   2.8亿访问 · 页数/访问 4.1 · 时长 09:07 · 跳出率 20.66% · 直接 2.5亿。
   次行 `/design/editor/` 3.87% · 5559.7万唯一；`/projects/` 2.52% · 6210万唯一页面浏览量。

## 形状与就绪

- 形状：**table**。就绪判据：**filledCells > 0**（本页满值 900）。
- 实测时间线（2026-08-29）：**就绪 36.5 秒**，5 轮 poll，stopReason=stable。
  前 3 轮 census 冻结在 0 cells / 1,599,006 壳文本——**壳先齐、数据后落**，
  与 top-pages 同款；ground-truth.mjs 判 stall 后刷新 1 次，数据落地。
- 表头词重复两遍（「子文件夹 子文件夹」，无障碍副本），解析先去重。
- 更多数据在分页里（2,611 页），不在滚动里。

## 怎么采

```sh
platforms/semrush/traffic-analytics/subfolders-subdomains/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
**这只采第 1 页（50 行 / 2,611 页 = 0.04%）。** 翻页批采走
`node backlink/scripts/harvest-paginated.mjs --url '<本页 URL>' --out <dir> --max-pages 40`
（机制已判定为客户端分页）。**2,611 页全量按实测节奏是 7–15 小时且全程占锁——不要做**；
头部 20–40 页 + `--mode stratified` 抽长尾。配方与配额账见 [`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,006 字符在数据到位前就齐了；deepTextLength 阈值判据会把壳当货 |
| 前 3 轮 census 冻结 | filledCells 恒 0 + census 不变是 stall，刷新一次即落地——别把冻结当「无数据」 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读拆分后的 `grids` 字段 |
| 表头词重复两遍 | columnheader innerText 形如「流量比例 流量比例」，解析去重 |
| 截图漏列漏行 | 18 列一屏只见前几列，只靠截图严重漏读；数字以 census deepText 为准 |
| 共享标签页会被抢 | 会话 `semrush-nav` 是共享标签页，同板块其他路由实测发生过被别的 agent 导走；判决前核对每轮 census 的 href |
| 「导航成功」≠「有数据」 | open 秒回，数据 36 秒后才落 |

## 验证记录

- **2026-08-29**（UTC 07:59–08:00）双证人复核，canva.com，会话 `semrush-nav`。
  退出码 0（stable），就绪 36.5s，refreshCount=1，5 组截图+census。
  filledCells=900 与历史 900 **精确一致**；抽查 35.74%、5559.7万、6210万 均在
  census-s1 深层文本命中；首行 /design/ 6.1亿唯一页面浏览量与 canva 7.9 亿月访问量级相符。
  裁决：**confirmed-data**。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-subfolders-subdomains/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（渲染完成首屏：tab 区 + 表头 + 首行）。
