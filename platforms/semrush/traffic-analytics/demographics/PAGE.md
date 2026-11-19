# Traffic Analytics · Demographics（人口统计）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/demographics/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「人口统计」；报表头维度：全球 / 月份 / 所有设备

## 回答什么业务问题

竞品受众是谁——年龄段、男女比例、唯一访客走势、访客来自哪些国家。
写投放人群包、判断内容语言/风格取向从这页进。

## 数据清单

1. **受众区**（可导出为 PNG）：年龄分组条图（18-24 / 25-34 / 35-44 / 45-54 / 55-64 / 65+，
   男/女双序列，y 轴 0%–60%）+ 性别环图：**2.1亿用户**，男性 41.04% 8464.6万 /
   女性 58.96% 1.2亿。**这些值在 DOM 文本里，不在表格单元格里**。
2. **唯一（访客）趋势图**：时间范围 tab 月/季度/6 个月/1 年/2 年/全部时间，
   y 轴 0–3亿，横轴 2026年1月–2026年8月。
3. **地理位置分布表**（filledCells=20 全部来自这块）：**5 行 × 4 个数据列 = 20 格**。
   按国家，指标切换 访问量/唯一身份访问量；列：国家、流量比例、所有设备（访问量）、
   桌面设备、移动设备占比。底部「查看详情」链接。
4. 表内全量（canva.com，2026-07）：美国 18.73% 1.5亿（桌面 81.88%/移动 18.12%）、
   巴西 7.06% 5608.7万、印度 6.5% 5166万、孟加拉国 5.89% 4678.3万（桌面 98.86%）、
   印度尼西亚 4.21% 3341.9万。

## 形状与就绪

- 形状：**混合**——上半页图卡（值在 DOM 文本），下半页一张小表；
  manifest `readyBranch=table`，就绪判据：**filledCells > 0**（本页满值 20）。
- 实测时间线（2026-08-29 重跑）：**就绪 27.1 秒**，4 轮 poll，refreshCount=1，
  stopReason=stable，全程 href 停在 `/analytics/traffic/demographics/`。
- 年龄/性别的数字不计入 filledCells——20 格只覆盖国家表；读图卡值要走 deepText。

## 怎么采

```sh
platforms/semrush/traffic-analytics/demographics/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。
国家全量列表在「查看详情」后面，尚未测量。

## 已知坑

| 坑 | 细节 |
|---|---|
| **共享标签页被抢（实测发生）** | 第一次复核（recheck-demographics/）poll2 起被「december birthstone color」keywordoverview 接管，全部 census 都在别人页面上——仅存证。判决前核对每轮 href |
| filledCells 只见一角 | 20 格只统计国家表；年龄/性别/趋势的数字全在 DOM 文本（图卡），别拿 20 当本页数据总量 |
| 国家表只有 Top 5 | 首屏只列 5 国，全量藏在「查看详情」里 |
| 壳会骗文本判据 | 深层壳文本 ~1.6M 字符先于数据到位；deepTextLength 阈值判据会误判 |
| `tables=1` 有歧义 | 真实 `<table>`=0，表是 `[role=grid]` DIV，读 `grids` 字段 |
| 「导航成功」≠「有数据」 | open 秒回，数据 27 秒后才落 |

## 验证记录

- **2026-08-29**（UTC 08:36，recheck-demographics-v2 重跑）双证人复核，canva.com，
  会话 `semrush-nav`。退出码 0（stable，readyBranch=table），就绪 27.1s，refreshCount=1，
  全程 href 未被抢。filledCells=20 与历史 20 **精确一致**；抽查 男性 8464.6万 /
  女性 58.96%（census-s1）、美国 18.73% 1.5亿（census-s3）均命中；2.1 亿用户、
  美国 1.5 亿访问与 canva 7.9 亿量级一致。裁决：**confirmed-data**。
  第一次运行被 keywordoverview 劫持，仅存证不出裁决。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-demographics-v2/`，
  判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（年龄/性别图卡首屏；地理分布表见证据目录 shot-s3）。
