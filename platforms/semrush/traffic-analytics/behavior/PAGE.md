# Traffic Analytics · Behavior（行为）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/behavior/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「行为」；报表头维度：全球 / 月份 / 所有设备

## 回答什么业务问题

竞品受众在网上还干什么——用哪些社交平台、对什么品类感兴趣、桌面还是移动。
选社媒投放渠道、判断内容分发阵地从这页进。

## 数据清单

**本页没有任何表格（grids=0、cells=0），但数据齐全——全部以 DOM 文本形式
存在于摘要卡、条图和环图里**（canva.com，2026-07）：

1. **摘要卡**：社交媒体 YouTube 71.8% / 兴趣度 在线服务 99.72% / 设备 桌面 67.23%。
2. **社交媒体条图**（8 个平台，比例+人数）：YouTube 71.8% 1.5亿、Facebook 49.36% 1亿、
   Instagram 48.61% 1亿、Reddit 33.71% 6952.5万、TikTok 28.06% 5786.1万、
   Pinterest 23.95% 4939.6万、LinkedIn 23.71% 4890万、X (Twitter) 20.77% 4283.5万。
3. **兴趣度进度条**（Top 5）：在线服务 99.72% 2.1亿、大众媒体 99.4% 2亿、出版 98.17% 2亿、
   计算机软件和开发 87.96% 1.8亿、报纸 87.23% 1.8亿。
4. **设备环图**：2.1亿唯一——桌面 67.23% 1.4亿 / 移动 32.77% 6758.8万。

## 形状与就绪

- 形状：**图卡（data-not-in-table）**——manifest `readyBranch=chart`，
  filledCells 恒 0 是本页常态，不是故障。
- census 关键指标（就绪时）：deep.grids=0、deep.cells=0、**svgText=3**（九条无表格
  路由里最低之一——本页数值主要在普通 DOM 文本，不在 SVG 里）。
- 就绪判据：chart 分支（svgText>0 三轮稳定）；更稳的人工判据是 deepText 里
  出现平台名+百分比对（如「YouTube | 71.8%」）。
- 实测时间线（2026-08-29 重跑）：**就绪 52.2 秒**，7 轮 poll，refreshCount=1，
  stopReason=stable，全程 href 停在 `/analytics/traffic/behavior/`。

## 怎么采

```sh
platforms/semrush/traffic-analytics/behavior/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
ground-truth.mjs 自动走 chart 就绪分支，无需额外参数。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
**取数配方**：所有数值都在 census 的 deepText 里，按「标签 | 百分比 | 人数」三元组解析即可，
无需读图。


**图表读数器（2026-08-30）**：走 chart 分支就绪后，ground-truth.mjs 会自动多打一次
带几何的读数，把提取结果写进 manifest 的 `chartRead`（见
[`../OVERVIEW.md`](../OVERVIEW.md) 板块级要点，实现在
`backlink/scripts/lib-chart-read.mjs`）。`chartRead.text` 给每张图的标题、系列名、
y 轴刻度与范围、x 轴标签；`chartRead.geometry` 给逐点值。**读数器只提取不判断**：
读不出的点是 `value: null` + 理由码，绝不猜数——「读不出」和「值是 0」必须分得开。
`chartRead.capability` 说的是读数器做到了什么（`points` / `axis-only` / `none`），
**不是页面有没有数据**，后者照旧由你对质双证人来判。
2026-08-29 那批历史证据没有几何面，复读只能到 `axis-only`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 没有表格≠没有数据 | filledCells=0 是本页常态；数据在 DOM 文本里。历史上把「无表格」引申成「无数据」在本板块错了 8/9 条 |
| **共享标签页被抢（实测发生）** | 第一次复核（recheck-behavior/）poll5 起被「aries birthstone」keywordoverview 接管，其 30/104 cells 属别人页面——仅存证。**别人页面的 cells 会冒充「有表格」**，判决前逐轮核对 href |
| svgText 很低别慌 | 本页 svgText 仅 3——不能拿 top 路由的 40+ 当阈值；判空态的分界是 0（见 email 页） |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 「导航成功」≠「有数据」 | open 秒回，数据 52 秒后才落 |

## 验证记录

- **2026-08-29**（UTC 08:42–08:43，recheck-behavior-v2 重跑）双证人复核，canva.com，
  会话 `semrush-nav`。退出码 0（stable，readyBranch=chart），就绪 52.2s，refreshCount=1。
  filledCells=0 与历史 data-not-in-table 定性一致；抽查 YouTube 71.8% / 1.5亿、
  Reddit 6952.5万、在线服务 99.72% 均在 census-s1 深层文本命中；
  2.1 亿唯一访客与 canva 量级一致。裁决：**confirmed-data**（0 表格格，数据以图卡形式存在）。
  第一次运行被劫持，仅存证。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-behavior-v2/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（摘要卡 + 社媒条图 + 设备环图）。
