# 整理项目记录：doctor、清理、压缩记忆

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「/rankup doctor」「整理一下项目记录」「.rankup 太乱了」「整理一下 rankup」；「清理一下项目的旧报告、截图」（fleet 的日志与报告归 agent-fleet）；「记忆太大」「压缩 memory」「优化记忆」。

**输入**：项目 `.rankup/`（或工作区根层记录）；清理时的时限（默认 7 天）。只整理记录，不碰站点代码与线上，免版本更新与线上对账。

**doctor**：按 [maintenance.md 六](../maintenance.md#六rankup-doctor整理-rankup-的显式入口)的编排 0–6 走（先保底 → 只读诊断 → 经验分拣 → A/B/C 分类 → 执行 A、B → 回读 → 报告）。只读诊断命令：`node "<rankup-skill-dir>/scripts/maintain/rankup-doctor.mjs" --project-root . [--portfolio-root <工作区根>]`。C 类只列给用户，拿不准的不删。

**清理过程数据**：`node "<rankup-skill-dir>/scripts/maintain/rankup-clean.mjs" --workspace <工作区> --older-than 7d`（先预览，确认后加 `--apply`）；证据与备份只列待确认。

**压缩记忆**：按 [`agent-memory.md`](../agent-memory.md#流程) 逐条判留还是搬。

**读哪里**：清理参数与保护范围 [清理用法](../maintenance.md#清理用法)；三层归属 [maintenance.md 七](../maintenance.md#七三层归属与项目记忆维护规范)；目录规范 [project-memory.md](../project-memory.md#目录规范常驻文件保留什么去哪里多大)。

**完成标志**：整理报告交付；`rankup-doctor.mjs` 与 `doc-lint.mjs --root .rankup` 回读无已处理项残留。

**收尾**：`journal/<日期>.md` 写一行（整理了什么、报告在哪）。

## 引擎站步骤

站建在站点引擎上时（见 [`integrations/site-engine.md`](../integrations/site-engine.md)）：清理前 `trash_list` 看一眼；引擎里的东西只放回收站，彻底删除只有站长能做。发布史对账读 `list_versions`。
