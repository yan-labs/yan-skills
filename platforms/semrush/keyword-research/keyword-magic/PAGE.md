# Keyword Research · Keyword Magic Tool（关键词魔法工具）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/keywordmagic/?db=us&q=<kw>&type=<tab>[&questions=true]`
  - `q`：种子关键词（多词用 `+`）；`db`：数据库（us）
  - 基准入口 `/analytics/keywordmagic/?db=us&q=<kw>`，落点自动补 `type=all&mode=0`
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- **匹配模式 `type`（tab 参数全部实证，点击后读回 href）**：
  - `all`（所有关键词）/ `phrase`（词组匹配）/ `exact`（完全匹配）/ `related`（相关性）
  - **广泛匹配 = 不带 type 参数**（点击广泛匹配时 type 被移除）
- **问题筛选 `questions=true`**：独立开关，可与任意 type 叠加；「所有」pill 清掉它
- **`mode=0` 恒在**（含义未明，原样携带即可）
- **`type=related` 直达已实证**：直接开 URL 得 57.1K 词 / 总量 5,218,520 /
  平均 KD 43%，相关性 tab 高亮

## 回答什么业务问题

种子词扩海量长尾：每词 意图 / Relevance / 搜索量 / 趋势 / KD / CPC / 竞争程度 / SF /
结果数；左侧 Topics(new)/Groups 聚类树按主题切子集；筛选器（搜索量/KD%/意图/CPC/
包含/排除/高级）+ 语言切换。

## 数据清单（graphic design，db=us，2026-08-30）

1. **主表**（all）：149.8K 词，总搜索量 10,592,470，平均 KD 40%；首屏 50 行，滚动分页。
2. **Topics 树**：All 149.8K + 数十主题子节点。
3. related tab：57.1K 词 / 总量 5,218,520 / 平均 KD 43%。
4. 种子词行：graphic design 1.2M / KD 77 / CPC 4.13（与 Keyword Overview 互证一致）。

## 形状与就绪

- 形状：**table**（readyBranch=table），实测 31.5s（含 1 次 stall-refresh），
  filledCells 1344/屏。

## 怎么采

```sh
platforms/semrush/keyword-research/keyword-magic/collect.sh [keyword] [type] [db]
# 例：collect.sh "graphic design" related us
# type 传 all|phrase|exact|related，或传 broad 表示广泛匹配（不带 type 参数）
# 默认 "graphic design" all us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。换 tab 优先 URL 直达（type 参数已实证），
不用页内点击。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **「发送关键词」不碰** | 加列表入口，会写共享账号资产——只读纪律禁止点击 |
| 行内勾选框不勾 | 主表每行有勾选框，纯读不勾 |
| **没水合完点击全无效** | tab pill 是 React 受控 BUTTON，leaf 文本精确匹配可点，但页面没水合完时 synthetic 点击全部静默无效——探针必须先轮询到 tab 条出现再点 |
| 广泛匹配没有 type 值 | `type=broad` 之类猜测无效；广泛匹配就是移除 type 参数 |
| mode=0 别删 | 恒在参数，含义未明，原样携带 |
| 壳会骗文本判据 | 与全平台一致：就绪只认 filledCells |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，逐轮持机器级 semrush 锁。
  抽查 149.8K / 10,592,470 / 40% / graphic design 1.2M·77·4.13 / 相关性 57.1K ——
  像素↔DOM **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-keywordmagic/`、
  `…-keywordmagic-related/`；判决书 `…/semrush-round4-VERDICTS.md` 页卡 2。
- 截图档案：`assets/loaded.png`（Topics 树+主表首屏）、`assets/related-tab.png`
  （related 直达落点）。
