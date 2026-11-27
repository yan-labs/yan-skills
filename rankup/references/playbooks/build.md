# 建站与加功能：引擎优先、多站成批、自建回退

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「做个站」「把这个词做成站」「这三个词各做一个站，一起弄」「批量建站」「加个功能」「改一下首页」「加一个页面」。

**输入**：每个站的主词与入口卡结论（[`entry.md`](entry.md)）、页面清单与开发方案（[`selection.md`](selection.md)）；域名或候选域名；站建在哪：项目 `.rankup/infrastructure.md` 有 site id，或全局层配了默认站点引擎。

**步骤**

1. **定走哪条路**：有站点引擎就默认走引擎，动手前先调引擎的 `get_guide`（下一节）；只有引擎做不到（先在引擎侧报过需求）、用户指定模板或不是网页项目时，才走[自建站回退](#自建站回退)。理由：引擎已带渲染、SEO 发布闸门、发布回滚、统计与收款，从零搭是重复造轮子，还跟引擎升级脱节。
2. **成批时先定共用项**：同一批的站建在同一个引擎上、用同一张设计画布；引擎指南、经验本、已有站点清单这类各站都要的东西由派单方取一次再分发，各站单不再各自去取。每站一个写入负责人，同一站不并发写。
3. **设计**：走 `/design` 并逐字带获奖标准（[段 3 硬规则](../lifecycle/stage-3-build.md#硬规则全文含为什么)）；画布共用的是组件规范，每站的配色、版式、文案各做各的。
4. **素材与内容**：配图用 `/imagegen`；文章类页面走 blog Skill，工具首页、长尾内页、FAQ、title、description 走 write Skill；本卡只管把它们落进站里。
5. **当天做齐**：品牌图标在开发当天做齐（引擎站 `brand_set`，自建站按段 3 D15）；多功能工具站导航按[侧栏统一规范](../design-references.md#多功能工具站侧栏统一规范)。
6. **体检**：每站写完先过本卡的体检步骤，再交 [`prelaunch.md`](prelaunch.md)。

**页面规划两条规则**（写页面清单时逐条过）：① 一组不互相竞争的词一个 URL，同一意图不开第二页；② 每个可索引页都要有这页独有的数据或工具结果，给不出就合并或不做。依据：[官方层](../official/search-technical.md) G02.12、G02.11 与[批量工具站红线](../official/search-technical.md#九批量工具站红线结构与批量造页)。 写页面前先读[官方层必读精简版](../official/search-technical.md#必读精简版)。

**读哪里**：两条路共用的硬规则 [`stage-3-build.md`](../lifecycle/stage-3-build.md#硬规则全文含为什么)；闸门 [`checklists.md` 段 3](../checklists.md#段-3--建站与开发)（引擎站按「引擎站」列取值）；引擎工具与返回字段 [`integrations/site-engine.md`](../integrations/site-engine.md)。

**完成标志**：每站段 3 闸门逐行有状态（不适用的闸门标 N/A 并写原因）；站点标识、版本与域名状态记进 `.rankup/infrastructure.md`；体检计数与日期记进 `.rankup/checks.md`。

**收尾**：成批时看板写 `.rankup/batch-<日期>.md`（站｜域名就绪｜体检 errors｜未关待办｜下一项｜待站长确认）；覆盖接力。

## 引擎站步骤

1. 开工核对（[`integrations/site-engine.md`](../integrations/site-engine.md#开工核对每次任务第一步)）。调 `get_guide`；`lessons_list` 读经验本；`list_sites` 看已有站，题材与设计不能雷同。
2. 第一件事 `create_site`（多引擎先问清建在哪个引擎）。返回 `tell_owner_now` 立刻转告站长改 DNS，然后继续；成批时合并成一张 DNS 清单一次发。
3. `update_site` 写简报（主词、搜索的人要什么、设计方向）与语言；站点标识、引擎标识与版本记进 `.rankup/infrastructure.md`。
4. 五行设计说明先给站长确认，再 `asset_list` 看站长传的素材。
5. `theme_put` 写主题，`page_upsert` 写页面（先 draft），`brand_set` 做图标与分享图；工具站 `site_tool_put`，游戏站 `game_upsert` 后 `game_check_embed`。
6. `preview` 看结构，整站 `check` 调到 `done: true` 且 errors 为 0，计数与日期记进 `.rankup/checks.md`。
7. 成批：批内先发布一个站，其余站再整站 `check`，雷同比对才有对象；被雷同拒发时回设计，不改 class 名凑差异。
8. 引擎做不到的：`feedback_search` 后 `feedback_submit`，并告诉站长；不改引擎代码，不绕到自建。
9. 没有引擎 MCP 的执行者只交稿件包（格式见集成文件），不调用线上写入。

## 自建站（回退）

引擎做不到、用户指定模板或不是网页项目时：按 [`stage-3-scaffold.md`](../lifecycle/stage-3-scaffold.md) 的 3.1 初始化 → 3.2 Cloudflare 全栈基础与 Day-1 清单 → 3.3 开发与测试 → 3.4 集成走，段 3 闸门全部按原判据。
原生 App 按 [`stage-2-positioning.md`](../lifecycle/stage-2-positioning.md) 2.2 与平台专项工具，网页项标 N/A。
