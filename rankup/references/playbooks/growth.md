# 上线后增长：外链、推荐位、变现、流量涨跌

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「帮我搞点外链」「发个 Product Hunt」「ChatGPT 会不会推荐我们」「为什么不推荐」「推荐位整改」「没人付费」「定价怎么定」「接 PayPal / Anyway」「AdSense 被拒」「流量掉了」「流量涨了」。

**输入**：已上线的站；`.rankup/baseline.md`、`integrations.md`、`experiments.md`；本次要看的观察窗口。

**按问题选一条走**

| 问题 | 步骤 | 判读在哪 |
|---|---|---|
| 外链 | Rankup 只判时机与数量，执行交 `backlink` Skill；提交前把候选清单给用户圈定，技术可提交不等于本轮已授权投递；发布平台见 [`product-launch.md`](../product-launch.md) | [`stage-6-backlinks.md`](../lifecycle/stage-6-backlinks.md#什么时候发)；[`webcafe-topics.md`](../experiences/webcafe-topics.md) 五 |
| 推荐位 | 固定四问 → 建议甄别 → 整改发布 → 原聊天发链接复审 | [`seo-geo-recommendation-loop.md`](../seo-geo-recommendation-loop.md)；采样规则只按 [`seo-geo.md`](../seo-geo.md) |
| 变现与定价 | 按分发方式选主通道与备份，目标环境端到端验证；角度可用 `/marketing-psychology`、`/marketing-ideas` | [`monetization.md`](../monetization.md)、[`stage-7` 7.1](../lifecycle/stage-7-monetize.md#71-变现)、[`payments-anyway.md`](../payments-anyway.md)、[`conversion.md`](../experiences/conversion.md) |
| 流量涨跌 | 先读项目 `INDEX.md` 与 `decisions.md` 核对已下线功能与重定向，再按 GSC 日期 / 页面 / 查询拆 | [`stage-7` 流量涨跌怎么拆](../lifecycle/stage-7-monetize.md#流量涨跌怎么拆) |
| 要不要开下一棵树 | 对照三类读数的触发条件 | [`stage-7` 回到段 1 的判据](../lifecycle/stage-7-monetize.md#回到段-1-的判据监控读数说了算) |

读数脚本（只读）：`scripts/gsc-export.mjs`、`scripts/gsc-daily-readback.mjs`、`scripts/ga4-report-readback.mjs`、`scripts/cf-traffic-readback.mjs`、`scripts/clarity-recordings-readback.mjs`。

**完成标志**：对应台账有证据：外链 submitted → public → indexed；推荐位复审结果；支付在目标环境的验证记录进 `.rankup/integrations.md`；读数带日期进 `baseline.md`。

**收尾**：实验与结论写 `experiments.md`、`decisions.md`；判定回段 1 的，在接力里写清新词根。

## 引擎站步骤

站建在站点引擎上时（工具与返回字段见 [`integrations/site-engine.md`](../integrations/site-engine.md)）：
1. 读数：`pvuv_report`（总览、按页、搜索来源、漏斗）、`engage_stats`、`orders_list`、`subscriptions_list`，带日期写进 `.rankup/baseline.md`；查询词与排名仍读 GSC。
2. 动线上页之前先看它的搜索来源流量：有流量的只用 `page_edit` 小修，不动标题、描述、H1、URL 与主话题；要新词就加新页。
3. 有假设就开实验：`experiment_create` → `experiment_arm_put` → `publish` → 到观察窗口后 `experiment_end` 写结论，赢的版本再写回。
4. 收款：`saas_status`、`stripe_status` 看现状；没到账先 `orders_reconcile`。退款、收回积分、换密钥要站长在后台确认。
5. 有依据的结论 `lesson_add` 记进引擎经验本，同时按 rankup 的晋升门写项目经验。
