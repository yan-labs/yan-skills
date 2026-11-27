# 上线前体检

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「能不能上线」「帮我过一遍 SEO / GEO」「TDK」「密度」「站慢不慢」「把 Ahrefs 的检验结果都修了」，以及每次页面改动之后。

**输入**：预览域（自建站保持 `noindex`）；`.rankup/keywords.md` 的页面 ↔ 目标短语；`.rankup/checks.md` 上一轮状态（只作对照，不采信）。

**步骤**（全套重跑，不采信上一轮的 ✅）

1. 开工对账：`.rankup/checks.md` 里标「每轮」「动了页面」的项打回 ⬜。
2. 逐项过 [`checklists.md` 段 4](../checklists.md#段-4--上线前-seogeo预览域-noindex九行闸门)，操作按 [`stage-4-prelaunch.md` 必做动作](../lifecycle/stage-4-prelaunch.md#必做动作)。
3. 技术与 TDK：`node scripts/seo-audit.mjs --sitemap <sitemap-url>`；密度 `--density-only`；判读按 [`seo-box.md` 判读指引](../seo-box.md#seo-audit-判读指引分级表从脚本迁来)。
4. 性能：`node scripts/pagespeed.mjs collect --strategy both`，判读按 [`seo-box.md` 一](../seo-box.md#一--pagespeed-网页版--补上闸门-6-缺的那一半)。
5. GEO 与 AI 代理：`scripts/is-agentic.mjs scan --save`、`scripts/ai-crawler-access.mjs --url <域名>`、`scripts/ua-parity.mjs <url>`。
6. **图标专项**：按 [`stage-4-prelaunch.md` A 节](../lifecycle/stage-4-prelaunch.md#必做动作)逐个取图并解码核对。图标专项未通过不许上线。
7. **占位专项**：按 sitemap 逐 URL grep（正则见 [纪律十四](../discipline.md)）加人工抽查首页、定价、关于、联系、法律页。
8. 第三方复核：AITDK 全站报告（闸门 4c）；哥飞页面体检加载官方 `gefei-page`（[`seo-webcafe.md`](../seo-webcafe.md#谁来调用)）。
9. 上线前与发布后复核入口：`checklists.md` D1 / D4 / D12 / D13 / P3，上线前核一次、发布后在正式域名再核一次。
10. 修 Ahrefs 检验结果时：`scripts/ahrefs-site-audit.mjs` 取清单 → `scripts/ahrefs-issues-recheck.mjs` 线上复核 → 修完回到第 2 步全套重跑。

**读哪里**：判据只在 `checklists.md` 段 4；为什么这样做看 [`stage-4-prelaunch.md` 硬规则](../lifecycle/stage-4-prelaunch.md#硬规则全文含为什么)；内容质量与 HCU 看 [`seo-helpful-content.md`](../seo-helpful-content.md)；新增内页看[随手清单](../lifecycle/stage-4-prelaunch.md#新增内页--新模板的随手清单)。

**完成标志**：段 4 闸门全绿，或逐条写明改不动的理由；每项在 `.rankup/checks.md` 记 ✅、证据位置与日期。

**收尾**：问题与复验结果写 `.rankup/audit.md`；按 [maintenance.md 二](../maintenance.md#二收尾维护五步顺序固定)收口。
