# Keyword Research · 关键词概况（overview_2）

## 页面身份

- URL 模板（以落地 href 为准）：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/keyword/organic/search/999/<YYYY.MM-YYYY.MM>/overview_2?keyword=<URL编码词>&tab=0&mtd=false&webSource=Total&graphGranularity=Weekly&graphDuration=1m&keywordIdeasTab=relatedKeywords`
  - 路径段 `/keyword/organic/search/` 是**固定字面量**，关键词只在 `?keyword=` 里
  - `999`=全球；`<YYYY.MM-YYYY.MM>` 月段如 `2026.07-2026.07`
- 把词写进路径段 → 静默重定向到 `ai-brand-visibility/home`（hijack，exit 3）

## 回答什么业务问题

一个词值不值得做：规模、点击率、零点击占比、KD、CPC、SERP 成分、谁在吃它。

## 数据清单（image editor，2026.07，全球）

1. 指标卡：搜索量 312.6K、点击 262.2K、零点击 31%、KD 95、CPC $0.01–6.52。
2. SERP 成分环图 + 趋势折线（周粒度）。
3. 头部网站 / 头部网址 / 相关关键词卡（keywordIdeasTab 切换）。

## 形状与就绪

- 形状：**chart**（readyBranch=chart，svgText=48，实测 21s 就绪）。
- filledCells 恒 0——本页无真 table，就绪只看 svgText 三轮稳定。
- 主滚动条在内层 div（`--scroll-container auto` 已处理）。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-overview/collect.sh [keyword] [months] [out-dir]
# 例：collect.sh "image editor" 2026.07-2026.07
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 300`，
自动持 similarweb 机器锁、会话 `similarweb-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 路径段 hijack | 词进路径段 → 静默重定向；关键词永远走 `?keyword=` |
| census href 剥值 | sanitizeUrlString 把 `keyword=` 值剥空（留键名）；核对上下文读 manifest 的 `url` |
| 镜像抖动 | 白屏/错误组件页 reload 一次即愈，连刷 3 次仍坏才记待重测（平台 OVERVIEW） |

## 验证记录

- **2026-08-30** round3 双证人；抽查 312.6K / 262.2K / 31% / 70.47K 像素↔DOM 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-overview/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #2。
- 截图档案：`assets/loaded.png`。
