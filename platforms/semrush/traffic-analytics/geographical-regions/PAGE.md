# Traffic Analytics · Geographical Regions（地理区域）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/geographical-regions/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「地理区域」；报表头维度：月份 / 每月 / 所有设备（范围选择器为「全球」）

## 回答什么业务问题

竞品流量按 22 个地理大区（北美/南美/南亚/东南亚/西欧…）怎么分——
哪个大区是主战场、各区桌面/移动占比与停留质量。选目标市场的大区颗粒从这页进
（州级颗粒去 `usa/`，商业四大区去 `business-regions/`）。

## 数据清单

1. **流量地图**（按大区着色，访问量/唯一切换，图例 0% / <10% / 10-40% / 40-70% / >70%，
   可导出为 PNG）。
2. **流量趋势**折线图：北美/南美/南亚/东南亚/西欧 五区序列，y 轴 0–3亿，
   横轴近 7 个月（2026年2月–2026年8月）。
3. **主表「按地理区域划分的流量」**：**22 行**（1-22，无分页）× **9 列** =
   **198 个数据单元格**（filledCells=198）。列：地区、流量比例、访问量、唯一、
   桌面设备、移动设备、页数/访问、平均访问时长、跳出率。
4. 样例行（canva.com，2026-07）：北美 20.69% · 1.6亿访问 · 4752.6万唯一 ·
   桌面 82.63% · 时长 12:05 · 跳出率 32.98%；南美 15.71% 1.2亿；南亚 14.01% 1.1亿；
   中美 4.2% 3339.1万；东亚桌面占比 90.98%（各区里最高）。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`）。就绪判据：**filledCells > 0**（满值 198）。
- 实测时间线（2026-08-29）：**就绪 67.8 秒**——**复核批次里最慢的一条**，8 轮 poll，
  refreshCount=1，stopReason=stable。预算 240s 足够，但别拿其他路由的 40s 经验设超时。
- 22 行一次性落 DOM，无分页、无滚动懒加载。

## 怎么采

```sh
platforms/semrush/traffic-analytics/geographical-regions/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 本批最慢就绪 | 67.8s 才落数据——超时阈值/预算别按快路由拍；判「无数据」前先等够 |
| 地图值不在表里 | 大区悬浮提示只在地图交互里；结构化数据以 198 格主表为准 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 表头词重复两遍 | columnheader innerText 形如「地区 地区」，解析去重 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读 `grids` 字段 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页，同板块其他路由实测被导走过；判决前核对每轮 href |
| 「导航成功」≠「有数据」 | open 秒回，数据 68 秒后才落——中间近一分钟全是壳 |

## 验证记录

- **2026-08-29**（UTC 08:14–08:16）双证人复核，canva.com，会话 `semrush-nav`。
  退出码 0（stable，readyBranch=table），就绪 67.8s（本批最慢），refreshCount=1，
  5 组截图+census。filledCells=198 与历史 198 **精确一致**；抽查 中美 3339.1万、
  澳大利亚和新西兰 1748.7万 均在 census-s5 命中；各大区千万级访问量合计与
  canva 7.9 亿全球量级相符。裁决：**confirmed-data**。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-geographical-regions/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（「地理区域」高亮 + 流量地图 + 大区表）。
