# Demand Analysis（需求分析·选题雷达）板块索引

host: sim.proxy.example.com，hash 路由。2 条路由已于 2026-08-29 双证人判决（explore 轮，swgt.mjs +
innerscroll.mjs 驱动），判决书见 `backlink/SKILL.md` 的 `<similarweb-explore-capabilities>` 块；
本地全文 `backlink/evidence/ground-truth/similarweb-explore-VERDICTS.md`（gitignore）。

## 已判决路由

| 路由 | hash 模板 | 形状 | 规模 | PAGE.md |
|---|---|---|---|---|
| 首页 | `marketresearch/keywordmarketresearch/home` | 搜索框+主题卡+列表 | 4 主题卡 + 217 行业主题树 | ✅ `home/PAGE.md` |
| 主题报表 | `marketresearch/keywordmarketanalysissearch/demand-search-trends?…&id=AiTopic%3B<主题>%3B999` | 卡+图+4 表 | 1,000 词 + 145 国 + 12 月曲线 | ✅ `topic-report/PAGE.md` |

## 板块级要点

- 主题报表**可深链**：id 格式 `AiTopic;<主题>;999`（URL 编码分号 %3B），hash 不漂移。
- 主滚动条在内层 `.sw-layout-scrollable-element`（window scrollY 恒 0）；
  图表动画让截图 md5 恒变——census-stable-shot-unstable 是诚实的到底信号。
- 「查看全部主题」是页内浮层（hash 不变），217 行业主题树在浮层里。
