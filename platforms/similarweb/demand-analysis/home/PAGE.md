# Demand Analysis · 首页

## 页面身份

- URL 模板：`https://sim.proxy.example.com/#/digitalsuite/marketresearch/keywordmarketresearch/home`
- 侧栏「市场研究 → 需求分析」直达，无需配置。

## 回答什么业务问题

选题雷达入口：哪些主题需求在涨（「发掘」卡）、从搜索框进主题报表。

## 数据清单（2026-08-29，最近 28 天·全球）

1. 主题搜索框（输入出联想词，如 image editor / image editor online / image editor ai）。
2. 「发掘」4 张主题卡：主题名 + 搜索量 + 增长率（如 Wrestling Equipment 849.8K ↑19.52%）。
3. 「查看全部主题」页内浮层：217 行业主题树（hash 不变）。
4. 关键词列表区：我的列表 11 / 已与我共享 5，分页 1 out of 2。

## 形状与就绪

- 形状：搜索框 + 卡片 + 列表，无表格（cells=0，svgText=12）；explore 轮 chart 分支
  ~57s 才就绪——按 round3 经验这类页更接近机器盲，就绪宜按 deepText grep + 读图判。
- deepText 恒 1.6M（壳），文本长度判据无效。

## 怎么采

```sh
platforms/similarweb/demand-analysis/home/collect.sh [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 主滚动条在内层 div | `.sw-layout-scrollable-element`，window scrollY 恒 0 |
| 搜索框 React 受控 | 选中联想词才落主题报表；深链主题报表更稳（见 topic-report） |

## 验证记录

- **2026-08-29** explore 轮双证人；4 张卡数值（355.8K/249.5K/849.8K/817.3K）逐个命中 DOM。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-demand-home/`；
  判决书 `…/similarweb-explore-VERDICTS.md` 第 1 节。
- 截图档案：`assets/loaded.png`。
