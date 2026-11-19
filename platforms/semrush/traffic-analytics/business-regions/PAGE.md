# Traffic Analytics · Business Regions（业务区域）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/business-regions/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「业务区域」；报表头维度：月份 / 每月 / 所有设备

## 回答什么业务问题

竞品流量按商业四大区（APAC / EMEA / NA / LATAM）怎么分——给商务口径的
市场汇报、判断「先做哪个大区」用这页；更细颗粒去 `geographical-regions/`（22 区）
或 `usa/`（州级）。

## 数据清单

1. **流量地图**（四区着色，访问量/唯一切换，可导出为 PNG）。
2. **流量趋势**折线图：APAC/EMEA/NA/LATAM 四区序列，y 轴 0–4亿，
   横轴近 7 个月（2026年2月–2026年8月）。
3. **主表「按业务区域划分的流量」**：**4 行**（1-4，无分页）× **9 列** =
   **36 个数据单元格**（filledCells=36，本板块表格路由里最小的表）。
   列：地区、流量比例、访问量、唯一、桌面设备、移动设备、页数/访问、平均访问时长、跳出率。
4. 全量数据（canva.com，2026-07）：APAC 34.96% · 2.8亿 · 6769.9万唯一 · 桌面 85.84%；
   EMEA 24.02% · 1.9亿 · 5195.3万；NA 20.69% · 1.6亿 · 4752.5万；LATAM 20.33% · 1.6亿 ·
   3905.1万。**四区合计 ≈7.9 亿，与 canva 月访问量精确对齐**——这页是归属锚点：
   四区求和对不上目标域名月访问量时，先怀疑采错了页/错了域。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`）。就绪判据：**filledCells > 0**（满值 36）。
- 实测时间线（2026-08-29）：**就绪 16.1 秒**——**复核批次里最快的一条，唯一无需刷新**
  （refreshCount=0），2 轮 poll，stopReason=stable。
- 4 行一次性落 DOM，无分页、无滚动懒加载。

## 怎么采

```sh
platforms/semrush/traffic-analytics/business-regions/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
本页 36 格 + 快落地，适合当**便宜的归属自检页**：怀疑会话被劫持时先采这页对总量。

## 已知坑

| 坑 | 细节 |
|---|---|
| 36 格别当「数据少」 | 本页天然只有 4 行——filledCells=36 就是满值，不是渲染残缺 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| 表头词重复两遍 | columnheader innerText 形如「地区 地区」，解析去重 |
| `tables=1` 有歧义 | 真实 `<table>`=0，主表是 `[role=grid]` DIV，读 `grids` 字段 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页，同板块其他路由实测被导走过；判决前核对每轮 href |
| deepText 尾部混入侧栏 | census 深层文本尾部带整条产品侧栏菜单（市场概览/主要页面…），解析主表时按表头定位截取 |

## 验证记录

- **2026-08-29**（UTC 08:18）双证人复核，canva.com，会话 `semrush-nav`。
  退出码 0（stable，readyBranch=table），就绪 16.1s（本批最快），refreshCount=0，
  3 组截图+census。filledCells=36 与历史 36 **精确一致**（4 区 × 9 列）；
  抽查 APAC 34.96% / 6769.9万 均在 census-s3 命中；四区访问量
  2.8亿+1.9亿+1.6亿+1.6亿 ≈ 7.9 亿，与 canva 全球月访问量级精确吻合
  ——归属锚点成立。裁决：**confirmed-data**。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-business-regions/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（「业务区域」高亮 + 地图/趋势 + 四区表全量）。
