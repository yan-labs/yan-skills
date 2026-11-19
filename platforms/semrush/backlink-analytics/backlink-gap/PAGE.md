# Backlink Analytics · Backlink Gap（反向链接差异）

## 页面身份

结果页可 **URL 直达**，不需要走表单。三域名对比模板全文：

```
https://sem.proxy.example.com/analytics/gap/backlinks/?q=<you>&searchType=domain&compareWith=<comp1>%3Adomain%7C<comp2>%3Adomain
```

- 落点会 302 到 `/analytics/gap/backlinks/report/?…` 且**表格直接出数**——直达可重现。
- `compareWith` 语法与 Keyword Gap 同构但**少 `:organic` 段**：每条 = `<域名>:domain`
  → URL 编码 `<域名>%3Adomain`；**多个竞品用管道 `|`（%7C）分隔，绝不能用逗号**。
- 槽位：You + 最多 4 竞品（表单实见 5 槽）。

## 回答什么业务问题

谁链了竞品却没链我——外链拓展（outreach）名单的直接来源。默认「最佳」桶已经是
「竞品有、我没有」的清单。

## 数据清单（canva.com vs figma.com vs adobe.com，2026-08-30）

1. **潜在机会**：canva.com 视角 **506,817** 引荐域（首采 2026-08-30 上午；
   同日桶勘测时最佳桶计 507,776——日内增量正常）。
2. **分桶 tab**：最佳 / 弱 / 强 / 共享 / 唯一 / 所有（Keyword Gap 是
   缺失/弱/强/共享/未开发——**结构同构，桶名不同，且直达方式完全不同**，见下节）。
3. Authority Score 下拉 + 高级筛选器 + 导出；可折叠「图表」区。
4. **列**：引荐域名+类别 / AS / 每月访问量 / 匹配（n/3）/ 三个对比域各自的反链数。
5. 头部样例：investing.com AS 99 · 1.4亿 · 2/3 · 0·27·72；
   wiktionary.org AS 99 · 3,895万 · 2/3 · 0·2·379。

## 六桶勘测（2026-08-30 负面判决：桶不可 URL 直达）

- **`rankType=` 参数被静默忽略**：拼 `rankType=weak` 进 report URL，页面照常渲染
  「最佳」桶（507,776），href 里带着 rankType=weak、截图高亮却是最佳——双证人留档
  （`semrush-round4-backlinkgap-weak/`）。**Keyword Gap 的 rankType 直达经验不可
  迁移到本页。**
- **点击任意桶 pill，URL 纹丝不动**：六个桶点完 href 全同——桶是纯客户端状态。
- **点击也不稳**：页面每次加载后**只有第一次桶点击可靠落地**，后续 synthetic click
  （`el.click()` 或完整 pointer 事件序列）常被忽略。
- **唯一可靠配方 = 一桶一开页**：fresh open report URL → 等 `filledCells > 0` →
  点一次目标桶 → 轮询「1 – 100 (N)」计数变化确认落地 → 采证。
  落地判据绑计数变化，不绑点击返回值。
- **六桶实测计数**（canva.com vs figma.com vs adobe.com，2026-08-30）：

| 桶 | 引荐域计数 | 行形状 |
|---|---|---|
| 最佳（默认） | 507,776 | canva=0，竞品有（2/3；investing.com 99/1.4亿…） |
| 弱 | 14,803 | 3/3 全有、canva 列最小（freepik.com 100/1,770万 1↔986,621↔15） |
| 强 | 131,926 | canva 大、竞品 0（sp7.mielec.pl 1/3 1,626,721/0/0…） |
| 共享 | 14,803 | 3/3 全有（adobe.com 100/4.1亿 33/278/206,172、amazon、apple…） |
| 唯一 | 629,264 | 1/3 单域独有（amazon.co.uk 0/0/33、amazon.de 0/0/2,793…） |
| 所有 | 725,662 | 混合 1/3、2/3、3/3（amazon.co.jp 2/3、amazon.co.uk 1/3…） |

  观察：**弱与共享计数相同（14,803）但排序/行序不同**——canva 对这两个竞品的
  共链域上全部处于弱势，两桶集合疑似重合；行内数字已双证，不再深挖。

## 形状与就绪

- 形状：**真 `<table>` 元素**（tables=1，本批唯一；其余明细页全是 `role=grid` DIV），
  700 cells，readyBranch=table。
- 就绪判据：`filledCells > 0`，实测约 33 秒（含 1 次 stall-refresh）。

## 怎么采

```sh
platforms/semrush/backlink-analytics/backlink-gap/collect.sh [you] [comp1] [comp2]
# 例：collect.sh canva.com figma.com adobe.com
# 默认 canva.com figma.com adobe.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
semrush 机器锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。
**采非默认桶**：collect.sh 只落默认「最佳」桶；其余桶按上节「一桶一开页」配方用
一次性只读探针（fresh open → 首次点击 → 计数变化确认），**每桶重开一次页面**。

## 已知坑

| 坑 | 细节 |
|---|---|
| **桶不可 URL 直达** | `rankType=` 被静默忽略，页面恒渲染「最佳」桶；Keyword Gap 的直达经验不可迁移（2026-08-30 双证人证伪） |
| **每次加载仅首次桶点击可靠** | 后续 synthetic click 常被忽略；多桶采集唯一可靠配方 = 一桶一开页，落地判据绑「1 – 100 (N)」计数变化 |
| 302 前缀跳变 | `/gap/backlinks/` → `/gap/backlinks/report/`，前缀自检天然通过；要 `--accept-redirect` 显式声明也无害 |
| 分隔符 | compareWith 用逗号会触发假付费墙（Keyword Gap 实证同构坑）——看见升级弹窗先查自己的 URL 编码 |
| 「匹配」列没有 0/3 | 0/3 行不存在——默认「最佳」桶已经是「竞品有我没有」，别再自己过滤 |
| 桶名与 Keyword Gap 不同 | 结构同构但桶名不同（最佳/弱/强/共享/唯一/所有），别拿 missing/untapped 去找 tab |
| 弱=共享计数巧合 | 14,803 两桶同计数是本对比组的数据事实（行序不同），不是采集出错 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）双证人抽查：506,817 /
  investing.com 99·1.4亿·2/3·27·72 / unsplash 96·3,368万·14·24 / magnific 95·1,313——
  全部命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinkgap-3domain/`；
  判决书 `…/semrush-backlinks-audience-VERDICTS.md` 页卡 5。
- **2026-08-30**（round4）六桶勘测：`rankType=weak` 直达证伪（href 带参数、
  截图高亮最佳）；六桶在「开页即刷+一桶一开页」配方下逐桶截图高亮 tab + 计数 +
  行匹配数对质 **全 HIT**（弱/强/唯一为二采成功）。
  证据：`…/semrush-round4-backlinkgap-buckets/`（census-*.json + shot-*.png 成对）、
  `…/semrush-round4-backlinkgap-weak/`（rankType 证伪留档）；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 5。
- 截图档案：`assets/loaded.png`（分桶 tab + 三域名列主表首屏）、
  `assets/bucket-weak.png`（弱桶落地态）、`assets/bucket-all.png`（所有桶落地态）。
