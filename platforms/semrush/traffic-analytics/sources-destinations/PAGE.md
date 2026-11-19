# Traffic Analytics · Sources & Destinations（来源与目标）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/sources-destinations/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「来源与目标」；报表头维度：全球 / 月份 / 所有设备
- 顶部两个 tab：**来源 / 目标**。**目标 tab 无 URL 参数**——纯客户端切换，只能页内
  点「目标」；tab 状态会被记忆，重开页面可能直接落在目标 tab（2026-08-30 实测）

## 回答什么业务问题

竞品的流量从哪些域名来（来源 tab）、用户离开后去哪（目标 tab）——直接/搜索/AI/
社交/邮件各渠道背后具体是哪些站。找引荐外链源、看「谁在给竞品送 AI 流量」从这页进。

## 数据清单

1. **类别汇总卡**（来源 tab 顶部）：总计 46,486 个来源域，按渠道计数——AI 流量 26、
   引荐 45,065、自然搜索 488、谷歌 AI 模式 1、付费搜索 28、自然社交 614（canva.com，2026-07）。
2. **主表**：50 行 × **6 列** = 300 格，实测 **filledCells=272**（「类别」列部分行为空，
   属数据本身缺失，非渲染未完成）。列：来源、类别、渠道、流量比例、访问量、位差。
3. **分页器**：Page 1 of **930**。
4. 样例行（canva.com，2026-07）：canva.com 直接 79.32% 6.3亿 ↑4.4%；
   google.com「Google 自然搜索」自然搜索 11.06% 8785.3万 ↑3.79%；
   chatgpt.com AI 流量 0.46% 363.9万 ↑18.48%；mail.google.com 电子邮件 0.41% 325.8万。

## 目标 tab（2026-08-30 实测）

- **切换方式**：页内点「目标」——无 URL 参数可直达（见页面身份）。
- **回答什么**：用户离开该域后去哪（目标域 / 类别 / 流量比例 / 访问量 / 位差）。
- **数据清单**（canva.com，全球，2026-07）：grid 表 208 filledCells；
  google.com 34.01% 2155万 ↑10.12% / chatgpt.com 4.69% 297.4万 ↑24.26% /
  youtube.com 3.03% 191.7万 ↑5.81% / facebook.com 2.6% 164.6万 ↑15.57% /
  canva.me 2.03% / whatsapp.com 1.77% / microsoftonline.com 1.76% ↓14.68% /
  claude.ai 1.62% 102.9万；类别筛选下拉；可导出。表头无障碍副本重复两遍。
- **坑（重要）**：目标 tab 的表体**常整轮停在灰色骨架屏 + 分页计 0 + 导出置灰**
  （实测两轮 ~4 分钟都如此，第三轮才出数）——**骨架屏+0 是加载抖动，不是空态**，
  判空必须等到非骨架行出现或明确空文案。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`）。就绪判据：**filledCells > 0**。
- 注意：本页满值是 **272 而非 300**——「类别」列天然有空格。判「渲染完成」看
  filledCells 稳定在 272，不要等 300。
- 实测时间线（2026-08-29）：**就绪 36.9 秒**，5 轮 poll，refreshCount=1，stopReason=stable。

## 怎么采

```sh
platforms/semrush/traffic-analytics/sources-destinations/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
「目标」tab 采集：无 URL 直达，用一次性只读探针页内点「目标」后按上节判据等非骨架行
（骨架可持续 4 分钟+，budget 放宽）；翻页批采走 `node backlink/scripts/harvest-paginated.mjs`（930 页，机制为客户端分页；
**别全量**，头部 20–40 页 + `--mode stratified` 抽长尾）。注意本页骨架屏可达 4 分钟，
`--page-budget` 要放宽。配方与配额账见 [`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。

## 已知坑

| 坑 | 细节 |
|---|---|
| 空格是数据不是故障 | 「类别」列很多来源就是「无类别」或空——filledCells 272<300 是本页常态 |
| 首行是自己 | 来源表首行 canva.com 直接 79.32%——「直接流量」的来源记为域名自身，别当外部来源统计 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 表头词重复两遍 | columnheader innerText 形如「来源 来源」，解析去重 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读 `grids` 字段 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页，同板块其他路由实测被导走过；判决前核对每轮 href |
| 「导航成功」≠「有数据」 | open 秒回，数据 37 秒后才落 |
| 目标 tab 骨架屏可达 4 分钟+ | 骨架屏+分页计 0+导出置灰 ≠ 空态（两轮全骨架、第三轮出数）；判空等非骨架行或明确空文案 |
| tab 记忆 | 重开页面可能直接落在上次的目标 tab；采来源 tab 前先核对当前 tab 高亮 |
| **`q=` 被 `lid` 覆盖** | 整个 Traffic Analytics 树换域都被「未命名列表」压住，`q=` 是摆设；换域先换列表，详见 `../OVERVIEW.md` |

## 验证记录

- **2026-08-29**（UTC 08:08–08:09）双证人复核，canva.com，会话 `semrush-nav`。
  退出码 0（stable，readyBranch=table），就绪 36.9s，refreshCount=1，5 组截图+census。
  filledCells=272 与历史 272 **精确一致**；抽查 79.32%、8785.3万（google.com 自然搜索）
  均在 census-s1 命中；6.3亿直接访问与 canva 7.9 亿月访问量级一致。Page 1 of 930。
  裁决：**confirmed-data**。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-sources-destinations/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- **2026-08-30**（round4）目标 tab 双证人判决：抽查 34.01% / 2155万 / ↑10.12% /
  4.69% / 3.03% / 2.6% —— 像素↔DOM **全 HIT**（前两轮全骨架留档 `-dest/`、`-dest-v2/`）。
  证据：`…/semrush-round4-sources-destinations-dest-v3/`；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 6。
- 截图档案：`assets/loaded.png`（来源 tab + 类别汇总卡 + 主表首行）、
  `assets/destinations.png`（目标 tab 出数态）。
