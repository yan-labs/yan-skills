# 继续上次的项目

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「继续」「接着做」「上次做到哪」「下一步做什么」「开始执行这个项目的计划」，或要读计划、交接、进度文档。

**输入**：当前目录的 `.rankup/`；在工作区根时是根层 `.rankup/portfolio.md` 与 `projects.json`；没有 `.rankup/` 时是项目根 `HANDOFF.md` 或已有进度文件。

**步骤**

1. 定位项目：当前目录有 `.rankup/` 就用它；在工作区根优先按 `projects.json` 的 `last_activity` 找最新且接力未完成的项目，只有一个候选就直接进，多个才列给用户选。
2. 读 `INDEX.md` 顶部四个字段和「接力」一节；有后台任务先查结果文件是否已产出；有未提交改动先 `git status`。
3. **三方对账门禁**：回答「接下来做什么」或宣称执行进度前，核对 `git log --oneline -25`、真实路由与线上 `sitemap.xml` 全量 `<loc>`，按任务适用面核对；记录与现实不一致先回写。只读问答只核对所问事实，不为此制造状态变化；doctor 免对账。
4. 本轮要碰的对象先 `grep -i` 一遍 `rejected.md`。
5. 直接执行「下一条要执行的动作」，不再问用户要不要继续；接力缺失或对不上，先按 git 日志、`journal/` 最新一篇、`plan.md` 还原并回写。
6. 有状态变化前先写接力，每个里程碑覆盖一次，派出或收回后台任务立刻记。

**读哪里**：写入时机与格式见[接力协议](../project-memory.md#接力协议任务随时可能中断新会话必须立即接上)；`INDEX.md` 四个字段见[同文件](../project-memory.md#indexmd任何人一分钟内看懂项目现在在哪)。不为接力去通读 `checklists.md`，下一步属于哪一段再去读那一段。

**完成标志**：下一步已有执行证据（提交、线上回读或产物路径），接力已覆盖为当前状态。

**收尾**：按 [maintenance.md 一](../maintenance.md#一什么时候必须走本章)选轻量路径或五步维护；回复末尾一行维护摘要。

## 引擎站步骤

站建在站点引擎上时（见 [`integrations/site-engine.md`](../integrations/site-engine.md)）：三方对账改为 `plan.md` 勾选 ↔ `get_site` 的页面清单与状态 ↔ 线上 `sitemap.xml`；发布史读 `list_versions`。
接手先读 `launch_checklist` 的下一项与 `issue_list` 未关项。
