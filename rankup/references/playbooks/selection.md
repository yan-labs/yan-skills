# 选品：从方向到裁决与完整开发方案

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「帮我选几个能做的方向」「选品」「有什么能做的」「这个方向值不值得做」「帮我看看这个想法」。

**输入**：用户约束（平台、预算、范围）；全局偏好里的前置闸门（若有）；用户给的方向或已有候选。什么都没有时先跑 [`research/p1-discovery.md`](research/p1-discovery.md) 收候选。

**步骤**

1. **收候选**：有方向时按 [`demand-sources.md`](../demand-sources.md) 与 [`selection/generator.md`](selection/generator.md) 采集；每个候选记来源、用户任务与日期。
2. **先过前置闸门**：全局偏好设了（例如只做有搜索量证据的需求）就先过，没过的直接出局并写理由；没设就跳过。闸门写在全局偏好里，不写进 Skill。
3. **逐个裁决**：每个候选的主词走 [`entry.md`](entry.md) 四步验证与两路裁决，已有证据直接复用；结论只有「做 / 不做 / 未知待补」。
4. **给完整开发方案**：每个「做」的候选按下面模板写一份方案，不给一张清单让用户自己挑；「不做」写进 `.rankup/rejected.md` 并带复活条件；「未知」写缺什么、怎么补、补完谁来判。
5. **候选域名**：可注册与价格在站点引擎上用 `domain_search`（见 [`integrations/site-engine.md`](../integrations/site-engine.md)）；域名黑历史仍按段 5。

**读哪里**：裁决判据只在 [`entry.md` 判读](entry.md#4--判读)；问法簇到页面的映射见 [段 2](../lifecycle/stage-2-positioning.md)；付费、频次、护城河这类经营观察只描述候选、不单独否决，字段见 [`experiences/selection-gates.md`](../experiences/selection-gates.md)；旧七闸的复盘与历史读数见 [`experiences/selection-history.md`](../experiences/selection-history.md)。

**完成标志**：每个候选有裁决与证据指针；每个「做」的候选有一份完整开发方案；用户拿到的是排好序的方案，不是待挑的名单。

**收尾**：裁决写 `.rankup/decisions.md`（不做的进 `rejected.md`）；开发方案写 `.rankup/plan.md` 或 `.rankup/research/<词根>-<日期>.md`；覆盖接力；要建站的交 [`build.md`](build.md)。

## 开发方案模板（每个「做」的候选一份）

| 段 | 写什么 |
|---|---|
| 裁决摘要 | 主词、市场与语言、两路结论与证据指针（入口卡位置）、前置闸门结果 |
| 页面清单 | 每页：path、承接的目标短语或问法簇、用户任务、页面要给的东西 |
| 工作包 | 按顺序 WP1…WPn；每包写做什么、产出、依赖、谁做 |
| 第一个工作包的验证与止损 | 验证哪个假设、看什么读数、观察窗口多长；继续与停的条件都写成可核对的读数 |
| 定价假设 | 免费与付费的界线、价格档、收款通道；标为假设并写验证方式 |
| 建在哪 | 站点引擎（默认）或自建的理由；成批时归哪一批 |
| 风险与未知 | 缺测项、反证、依赖外部或站长确认的步骤 |

排序：先按两路结论的强弱，再按第一个工作包的成本；同一批里共用项多的放在一起做。

## 与其他文件的分工

- 候选从哪来、采集工具与可选通道：[`selection/generator.md`](selection/generator.md)。
- 验证顺序、入口卡、两路判读：[`entry.md`](entry.md)；深查补漏：[`research/p2-keyword-root.md`](research/p2-keyword-root.md)。
- 旧 `gate-runner.mjs` 的七闸记录只作历史，不用它登记本轮裁决。
