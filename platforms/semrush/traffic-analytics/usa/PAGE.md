# Traffic Analytics · USA（美国）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/usa/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「美国」；报表头维度：月份 / 每月 / 所有设备（无「全球」选择器——本页就是美国切片）

## 回答什么业务问题

竞品在美国市场按州怎么分——哪个州是流量大头、桌面/移动占比、停留质量如何。
面向美国市场选站、判断州级投放侧重从这页进。

## 数据清单

1. **流量地图**（按州着色，访问量/唯一 两个指标切换，图例 0% / <10% / 10-40% / 40-70% / >70%，
   可导出为 PNG）。地图本身是像素+SVG，州名悬浮值不在表格里。
2. **流量趋势**折线图：加利福尼亚/得克萨斯/佛罗里达/纽约/伊利诺伊 五州序列，
   y 轴 0–3000万，横轴近 7 个月（2026年2月–2026年8月）。
3. **主表「按州划分的流量」**：**51 行**（1-51，全美 50 州+DC，无分页）× **9 列** =
   **459 个数据单元格**（filledCells=459）。列：州、流量比例、访问量、唯一、桌面设备、
   移动设备、页数/访问、平均访问时长、跳出率。
4. 首行样例（canva.com，2026-07）：加利福尼亚 13.92% · 1811.9万访问 · 531.5万唯一 ·
   桌面 82.66% / 移动 17.34% · 页数 5.1 · 时长 11:41 · 跳出率 33.76%。
   得克萨斯 10.5% 1366.8万；伊利诺伊 4.04% 525.3万。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`）。就绪判据：**filledCells > 0**（满值 459）。
- 实测时间线（2026-08-29 重跑）：**就绪 42.0 秒**，5 轮 poll，refreshCount=1，
  stopReason=stable。壳先齐、数据后落，与本板块其他表格路由一致。
- 51 行一次性落 DOM，无分页、无滚动懒加载。

## 怎么采

```sh
platforms/semrush/traffic-analytics/usa/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **共享标签页被抢（实测发生）** | 第一次复核（recheck-usa/）poll3 起 href 被另一个 agent 的 referral 验证导走，截图全是引荐报表——该目录只作事故存证。**判决前必须核对每轮 census 的 href 停在 `/analytics/traffic/usa/`** |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 地图值不在表里 | 州级悬浮提示只在地图交互里；结构化数据以下方 459 格主表为准 |
| 表头词重复两遍 | columnheader innerText 形如「州 州」，解析去重 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读 `grids` 字段 |
| 「导航成功」≠「有数据」 | open 秒回，数据 42 秒后才落 |

## 验证记录

- **2026-08-29**（UTC 08:04–08:05，recheck-usa-v2 重跑）双证人复核，canva.com，
  会话 `semrush-nav`。退出码 0（stable，readyBranch=table），就绪 42.0s，refreshCount=1。
  filledCells=459 与历史 459 **精确一致**；历史样例行「加利福尼亚 13.92% 1811.9万
  531.5万 82.66%」逐字出现在截图与 census 文本；1811.9万、525.3万 均命中，
  加州 1800 万月访问与 canva 7.9 亿全球量级相符。裁决：**confirmed-data**。
  第一次运行（recheck-usa/）被标签页劫持污染，仅存证不出裁决。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-usa-v2/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（「美国」高亮 + 地图/趋势 + 州表首行）。
