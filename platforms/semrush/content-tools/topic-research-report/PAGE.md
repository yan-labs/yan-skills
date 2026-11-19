# 内容工具组 · 主题研究报表（内容创意）

## 页面身份

- URL 模板：`https://sem.3ue.co/topic-research/<24 位十六进制 savedSearchId>/`
  - 实测 id 样例：`<SAVED_SEARCH_ID>`
  - **id 从哪来：只能由入口页「近期搜索」的「查看内容创意」按钮点出来，或提交一次新查询。
    本轮未实证任何 `?q=` 深链写法**——这是本板块最大的采集缺口。
- `document.title` 与入口页**完全相同**，落点判据只看 `finalHref` 的 path。
- 上级：`../OVERVIEW.md`；入口页：`../topic-research/PAGE.md`

## 回答什么业务问题

给一个主题词，产出可写的副主题清单：每个副主题的搜索量 + 现成候选标题。
**本轮内容工具组里唯一有真数据的报表**——其余全在付费墙后。

## 数据清单

1. **10 张副主题卡片**（默认「卡片」视图）：每张 = 副主题名 + `Volume:` 数值 +
   3 条候选标题 + 「展示更多」。搜索量按降序排。
2. **4 个视图 tab**：卡片 / 资源管理器 / 概览 / 思维导图（本轮**只采了默认的「卡片」**）。
3. **2 个内容 tab**：内容创意 / 收藏的创意。
4. **筛选条**：主题 chip、国家（默认 United States）、「搜索内容的域名」、「获取内容创意」。
5. **排序**：「主题优先级排序依据：搜索量」+「优先显示热门副主题」开关。
6. **导出**：「将主题导出为 XLSX」存在——**导出属写/消耗操作，按纪律不点。**

## 形状与就绪

- 形状：**卡片（card）**，非表格非图表。
  `tables=0 grids=0 cells=0 filledCells=0 svgText=0 canvas=0`，
  deep textLength 1,601,846 / light 2,898。
- **readyBranch=`text`**：`--ready-text "Volume:"`，2 轮 poll、**18.9 秒就绪**、
  `stopReason=stable`。
- **table 与 chart 分支在这一页永远不就绪**，而且**连 SVG 都没有**——
  这是继 `/analytics/traffic/behavior/` 之后第二类 `data-not-in-table` 页型，
  只能走 text 分支。
- **滚动分页未验**：10 张卡片是否为全部、「展示更多」会不会追加，本轮未测。

## 怎么采

```sh
platforms/semrush/content-tools/topic-research-report/collect.sh <24hex-id> [out-dir]
```

拿 id 的唯一已知办法：先采 `../topic-research/`，从证据里读出历史条目，
再在入口页点该条的「查看内容创意」，从落点 URL 抄 id。

## 已知坑

| 坑 | 细节 |
|---|---|
| **没有 `?q=` 深链** | 入口页表单是 POST 型；id 只能点出来。想直达必须先拿到 id |
| **必须 `--ready-text "Volume:"`** | 三分支里只有 text 能接；不传必然 `budget/exit=2` |
| **只靠截图会漏读 70% 的卡片** | 首屏只见 3 张，DOM 侧另有 7 张在屏外——这正是双证人法则的日常形态 |
| **title 与入口页相同** | 落点判据只看 path |
| 另外 3 个视图的直达参数未知 | 按「桶参数不可信」纪律**逐个实证**，不做同构迁移 |
| 导出按钮别点 | 「将主题导出为 XLSX」是写/消耗操作 |

## 验证记录

- **2026-08-30** 双证人采集，会话 `semrush-nav`。截图 `shot-s1.png` ↔ `census-s1.json`
  对质了副主题名 + `Volume:` 数值、四个视图 tab 名、报表子标题等
  **≥10 个数值/文本，像素↔DOM 全部命中**。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/semrush-content-audit-topic-research-ideas/`。
- 截图档案：`assets/loaded.png`。
