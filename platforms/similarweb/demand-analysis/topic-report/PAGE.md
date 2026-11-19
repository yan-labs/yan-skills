# Demand Analysis · 主题报表（demand-search-trends）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/marketresearch/keywordmarketanalysissearch/demand-search-trends?country=999&webSource=Total&duration=12m&id=AiTopic%3B<URL编码主题>%3B999`
  - id 格式 `AiTopic;<主题>;999`（分号编码 %3B）；**可冷深链直达**，hash 不漂移

## 回答什么业务问题

一个主题赛道的总需求规模、增速、词构成、地域分布——选词/选赛道核心报表。

## 数据清单（image editor，Aug 2025–Jul 2026，全球）

1. 总搜索量 74M（0% 增长，基于 1,000 个关键词）。
2. 健康度与动态趋势（趋势方向/一致性/峰值近期性三档刻度）。
3. 新关键词 Top5 卡 + **完整关键词表 1,000 行**（photoshop 1.5M 24.23%、
   ai photo editor 583.5K 9.46%…）；新兴/热度下滑/新关键词三 tab；有导出图标（未碰）。
4. 动态搜索量月度折线（5M–7M/月）。
5. 热门国家表（美国 16.8M 22.63%、印度 14.1M 19%…，分页 /29 ≈145 国）。
6. 关键词趋势折线（可叠加 10 词，默认 3）。

## 形状与就绪

- 形状：卡 + 图 + **4 张真表**（readyBranch=table，filledCells=180，23s 就绪）。
  就绪判据 `filledCells > 0`。
- 内层容器 scrollHeight ~4363，window 滚动无效；下半页像素靠内层滚动补拍。

## 怎么采

```sh
platforms/similarweb/demand-analysis/topic-report/collect.sh [topic] [out-dir]
# 例：collect.sh "image editor"
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| window 滚动假到底 | scrollY 恒 0 而截图 md5 因图表动画恒变；到底要靠内层容器滚动 |
| 主题名要走首页联想 | 任意词不保证有 AiTopic 主题；从首页搜索框联想确认存在再深链 |

## 验证记录

- **2026-08-29** explore 轮双证人（8 对窗口 + 6 对内层滚动补拍到底）；
  1.5M/24.23%、583.5K/9.46% 等逐个命中。证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-demand-image-editor/`；
  判决书 `…/similarweb-explore-VERDICTS.md` 第 2 节。
- 截图档案：`assets/loaded.png`。
