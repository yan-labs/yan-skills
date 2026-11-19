# Traffic Analytics · Top Pages（主要页面）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/top-pages/?q=<domain>&searchType=domain`
  - `q`：目标域名（如 `canva.com`）
  - `searchType`：固定 `domain`
  - 面板可能自动附加 `lid=<列表id>`（「未命名列表」）与 `__gmitm=`（剥敏，只留键名）——两者都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 报表头可选维度：全球 / 月份 / 所有设备（默认取最近完整月）

## 回答什么业务问题

竞品哪些页面扛住了流量、每页各渠道（直接/搜索/AI/社交/邮件/广告）占比多少——
选站抄页面结构、看「谁在吃 AI 流量」都从这页进。

## 数据清单

1. **趋势页面卡片区**（增长 / 下降 / 新近检测 三个 tab）：横向卡片，每张 = 涨跌幅 + URL +
   数值 + 迷你趋势线。例：剧增 33.7万% `canva.com/vi_vn/policies/privacy-policy` 6742。
2. **主表**：`role=grid` 的 DIV（页面上 `<table>` 元素为 0），50 行 + 表头，**17 列**：
   页数、流量比例、1年趋势、唯一页面浏览量、唯一、访问量、平均访问时长、直接、AI 流量、
   引荐、自然搜索、谷歌 AI 模式、付费搜索、自然社交、付费社交、电子邮件、展示广告。
   50×17 = 850 个数据单元格，渲染完成时全部非空。
3. **分页器**：Page 1 of **1,430**（canva.com，总量约 71,500 行；每页 50 行）。
4. 首行样例（canva.com，2026-07）：主页 39.47% · 4.1 亿唯一页面浏览量 · 1.1 亿唯一。

## 形状与就绪

- 形状：**table**（readyBranch=table）。
- 时间线（实测）：`open` 约 1 秒返回；**9 秒时壳已齐**（深层文本 1.6M、42 个 shadow root）
  但 filledCells=0；**数据 61–76 秒才落进 DOM**（850 格一次性到位）。
- **就绪判据：filledCells > 0。** 文本长度判据会提前 1 分钟误判。
- 遇 stall（3 轮 census 不变且 filledCells=0）刷新一次可加速，ground-truth.mjs 已内置。
- 滚动：主滚动条在 window 上（scrollY 0→2156），`opencli browser scroll down` 直接可用。
  **无滚动懒加载**——50 行渲染完成即全在 DOM，滚动只动视口；更多数据在分页里，不在滚动里。
- 到底判据：census 与截图 md5 双双不变（双证人同时冻结）。

## 怎么采

```sh
platforms/semrush/traffic-analytics/top-pages/collect.sh [domain] [out-dir]
# 例：collect.sh figma.com        → 证据落 backlink/evidence/ground-truth/ 下带时间戳目录
# 默认 domain=canva.com
```

内部就是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

**这只采第 1 页（50 行 / 1,430 页 = 0.07%）。** 要更多行走翻页批采：

```sh
# 先判机制（约 2 次加载，不采数据）
node backlink/scripts/harvest-paginated.mjs --url '<本页 URL>' --out <dir> --probe
# 试水 2 页 → 确认翻页真的动了 → 再加到 --max-pages 40
node backlink/scripts/harvest-paginated.mjs --url '<本页 URL>' --out <dir> --max-pages 40
```

分页机制已判定为**客户端分页**（分页器在页面底部，URL 里没有任何页码参数）。
**1,430 页全量按实测节奏是 4–8 小时、且全程占着机器级 semrush 锁——不要做。**
头部 20–40 页就是这张表要回答的问题的正确样本；长尾走 `--mode stratified`。
配方、配额账、抽样偏差与行数自检见
[`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。

## 已知坑

| 坑 | 细节 |
|---|---|
| 壳会骗文本判据 | 深层文本 1,599,006 字符在数据到位**之前**就齐了；任何 deepTextLength 阈值判据都会把壳当货 |
| 截图会漏 2/3 列 | 一屏只见约 6-7 列（访问量之后的 11 列在水平滚动区外）、约 16 行；只靠截图严重漏读 |
| `tables=1` 有歧义 | census 老字段把 `[role=grid]` DIV 计入 tables；页面真实 `<table>`=0，读拆分后的 `grids` 字段 |
| 表头词重复两遍 | columnheader innerText 形如「页数 页数」（无障碍副本），解析先去重 |
| 报表主体在 light DOM | light cells = deep cells = 850；shadow 里埋的是壳。这是本页特例，**不能推广到其他路由** |
| 「导航成功」≠「有数据」 | open 1 秒返回、数据 76 秒落——两者相隔 75 秒，谁也不能替代谁 |
| 迷你趋势线只有像素 | 曲线形状不以文本存在（对应行数字都在 DOM），要曲线只能读图 |
| **`q=` 被 `lid` 覆盖** | 面板自动附加 `lid=` 后，整个 Traffic Analytics 树渲染的都是「未命名列表」域的数据，`q=` 换域是摆设（2026-08-30 实锤）；换域先换列表域名 chip，详见 `../OVERVIEW.md` |

## 验证记录

- **2026-08-29**（UTC 06:40–06:43）双证人试点采集，canva.com，会话 `semrush-nav`。
  7 张截图 × 10 次 census 逐张对质，抽查 11 个数字（39.47%、5853.7万、2.2亿、6742、
  Page 1 of 1,430 等）像素↔DOM **全部命中**，无单证人独有的矛盾。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-top-pages-canva/`
  （判决书 `CARD.md`）；复测 `…/semrush-top-pages-canva-v2/`、`…/recheck-VERDICTS.md`
  确认 850 格与历史精确一致。
- 截图档案：`assets/loaded.png`（渲染完成的首屏：趋势卡 + 表格头 + 首行）。
