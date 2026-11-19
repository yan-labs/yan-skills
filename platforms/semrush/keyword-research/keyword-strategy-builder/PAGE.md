# Keyword Research · Keyword Strategy Builder（关键词策略构建器）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/keywordmanager/?db=us&q=<kw>`
  - 落点 href 变为 `?q=<kw>&owning=all`；左侧导航「关键词研究」组第三项
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- **feature-map 旧路由 `/keyword-manager/` 是 404 死路由**（「我们迷路了」页，
  census 全零），2026-08-30 实测**证伪**——别再照旧文档开那条路
  （留档 `semrush-round4-kw-strategy-builder/`）

## 回答什么业务问题

输入最多 5 个主关键词（或用自己的词建列表）→ 自动聚类生成 pillar/cluster 站点结构；
列表页存共享账号全部词表。选好方向后规划整站信息架构从这页进——但见下方只读纪律。

## 数据清单（2026-08-30）

1. **表单入口**：主关键词 1/5（预填种子词）、US 库选择、「创建 50/50」按钮
   （50/50 = 剩余创建额度）、「或使用您自己的关键词创建列表」。
2. **关键词列表 grid**：所有 59 / 我自己 59 / 与我分享 0；
   行 = 列表名 + 关键词摘要 + 更新时间 + 操作。
3. 列表明细页（点入单个列表）**未采**。

## 只读纪律（本页的红线，比数据更重要）

- **「创建”按钮绝不点击**：会消耗共享账号的创建额度（50/50）并新建列表——
  这是写操作，双证人采集只读表单态和列表 grid。
- **列表行是其他用户的资产**：不点入、不改名、不删除、不碰「操作」列。
- 采集本页只回答两个问题：路由是否活着、共享账号有多少列表。

## 形状与就绪

- 形状：**table**（readyBranch=table，grid 40 格，1 poll 即就绪）；表单+列表混合页。

## 怎么采

```sh
platforms/semrush/keyword-research/keyword-strategy-builder/collect.sh [keyword] [db]
# 例：collect.sh "graphic design" us
# 默认 "graphic design" us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持机器级
semrush 锁、会话 `semrush-nav`。只读采集，不触发任何表单提交。
配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **旧路由 404** | `/keyword-manager/` 是死路由；真路由 `/analytics/keywordmanager/` |
| **创建=写操作** | 「创建 50/50」消耗共享额度并新建列表，只读纪律禁止点击 |
| 列表是他人资产 | 59 个列表属共享账号各用户；不点入不改动 |
| 落点参数变形 | `db=us&q=<kw>` 落点变 `?q=<kw>&owning=all`，自检别按原参数比对 |
| 明细页未采 | 单个列表的 pillar/cluster 明细结构尚无判决，别引用 |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，逐轮持机器级 semrush 锁。
  抽查 59/59/0、iwallets/plush 行、创建 50/50 —— 像素↔DOM **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-keywordmanager/`
  （死路由留档 `…-kw-strategy-builder/`）；判决书 `…/semrush-round4-VERDICTS.md` 页卡 3。
- 截图档案：`assets/loaded.png`（表单入口+列表 grid 首屏）。
