# Keyword Research · Keyword Overview（关键词概览）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/keywordoverview/?db=us&q=<kw>`
  - `q`：种子关键词，**多词用 `+` 连接**（如 `graphic+design`）
  - `db`：数据库（`us`）；落点 href 原样保留 `db=us`
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 页顶两个 tab：**概览 / 批量分析**（批量=一次贴 100 词，未采）
- 页面标题区无 searchType；分析按钮为黑色「分析」
- 左侧导航「关键词研究」组实见三项：关键词概览 / 关键词魔法工具 / 关键词策略构建器
  （feature-map 里的 `/keyword-manager/` 是 **404 死路由**，真路由见
  `../keyword-strategy-builder/PAGE.md`）

## 回答什么业务问题

一个词值不值得做，一屏定夺：搜索量 / KD（附「需要多少引荐域名」的口播）/ 意图 / CPC /
竞争激烈程度 / 全球国家分布 / 趋势 / 关键词变体 / 问题词 / 关键词策略聚类预览 /
SERP 前 10 强度。

## 数据清单（graphic design，db=us，2026-08-30）

1. **摘要卡组**：搜索量 1.2M（US）/ 全球 1.9M（US 1.2M、IN 246K、DE 49.5K…）/
   KD 77% 困难（需 ~99 个高权威引荐域名）/ 意图 信息 / CPC $4.13 / 竞争 0.10。
2. **趋势柱状图**（div 柱，非 SVG）。
3. **意见卡**：关键词变体 277.8K（总量 4.2M）/ 问题 18.5K（总量 181.1K）/
   关键词策略聚类卡。
4. **SERP 分析表**：域名 / AS / 反链 / 搜索流量（wikipedia 100/5.3B/1.3B、
   figma 86/23.5M/3.4M…）；SERP 精选结果标记（AI 概览/视频/讨论）。
5. **右上配额计数**：5,000/5,000（GURU 每日报表额度的自带读数）。

## 广告历史区块（Ads History 替身判决，2026-08-30）

页内**没有**独立「广告历史」区块。底部只有「谷歌购物广告创意 / 广告创意」两个卡位，
graphic design（信息意图）下都是「我们没有要显示的数据」，顶部摘要卡「谷歌购物广告
不可用 / 广告 不可用」。→ **信息词上该区块为空是正常态；「12 个月投放矩阵」在本版本
仍无独立入口。** 商业词（如 vpn）是否填充未测——那是仅剩的候选探针。

## 形状与就绪

- 形状：**table**（readyBranch=table），实测 33.5s，refreshCount=0，stopReason=stable。
- cells 82（SERP 表+意见卡）；**svgText 0**——趋势图是 div 柱，不是 SVG，
  别拿 chart 分支等它。

## 怎么采

```sh
platforms/semrush/keyword-research/keyword-overview/collect.sh [keyword] [db]
# 例：collect.sh "graphic design" us
# 默认 "graphic design" us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`：自动持机器级
semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。采完由 AI 对质双证人
出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 多词空格用 `+` | `graphic+design`；别用 `%20` 之外的花活 |
| svgText 恒 0 | 趋势图是 div 柱；chart 就绪分支在本页永远不触发，就绪只认 filledCells |
| 广告卡位空 ≠ 页面故障 | 信息词下「我们没有要显示的数据」是正常态（见上文替身判决） |
| 死路由陷阱 | `/keyword-manager/` 404；策略构建器真路由 `/analytics/keywordmanager/` |
| referrer eval 会炸 | gmitm 镜像补丁换掉 `document.referrer` getter，页内 eval 必须 try/catch |
| 镜像抖动 | 「出错了」错误页/白屏 reload 一次即愈；连刷 3 次仍坏才暂记待重测 |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，逐轮持机器级 semrush 锁。
  抽查 1.2M / 77% / $4.13 / 1.9M / 277.8K / 18.5K / 5,000/5,000 —— 像素↔DOM **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-round4-keywordoverview/`；
  判决书 `…/semrush-round4-VERDICTS.md` 页卡 1。
- 截图档案：`assets/loaded.png`（摘要卡+趋势+SERP 表首屏）。
