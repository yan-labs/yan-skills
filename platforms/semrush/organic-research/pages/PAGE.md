# Organic Research · 主要页面（pages / toppages）

## 页面身份

```
https://sem.proxy.example.com/analytics/toppages/?db=us&q=<domain>&searchType=domain
```

- `q`：目标域名；`searchType`：固定 `domain`；`db`：数据库（us）
- **重定向别名**：`/analytics/organic/pages/` 会 302 到 `/analytics/toppages/`。
  这是同查询重定向不是接管，但 ground-truth.mjs 的 href 落点自检会把它当 hijack
  （exit 3）——采集**直接用 toppages URL**，或传 `--accept-redirect /analytics/toppages/`
- `document.title`：`canva.com：主要页面`；`__gmitm=` 剥敏只留键名
- 注意与 Traffic Analytics 的 `/analytics/traffic/top-pages/` 是**两个不同页面**：
  这页是自然搜索视角（词/意图/引荐域名），那页是全渠道流量视角

## 回答什么业务问题

竞品哪些页面扛住了自然流量、每页吃多少词——抄页面结构、定 pSEO 模板的入口。
2026 新列「**大型语言模型提示**」（LLM prompts）直接回答「谁的页面在被 AI 引用」。

## 数据清单（canva.com，db=us，2026-08-29）

1. **顶部摘要卡** + **3 线趋势图**（svgText=23，轴数值以文本存在于 SVG）。
2. **主表**（997 格，cells=1,000 含表头）：URL / 流量 / 变化 / 流量% / 关键词数 /
   **大型语言模型提示** / 引荐域名 / 主要关键词 / 意图。
3. **总量**：33,931 个页面。
4. 抽查样例（双证人全 HIT）：18.4M、-954.9K、694.2K、faq templates、29.8K、20K。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 29.1 秒就绪（含 stall-refresh 一次：前 3 轮停在 1.6M 壳 filledCells=0）。
- shadowRoots=36；表格主体在 light DOM（light = deep = 997）。
- 12 屏打满 maxScreens（bodyScrollHeight≈11,338，本板块最长的页），stopReason=max-screens
  ——**budget 240s 下未确证滚动到底**，长尾行要么加 maxScreens 要么走分页。

## 怎么采

```sh
platforms/semrush/organic-research/pages/collect.sh [domain]
# 例：collect.sh figma.com     # 默认 canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`（URL 直接用
toppages，绕开 302），自动持机器级 semrush 锁、会话 `semrush-nav`。采完由 AI 对质
双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **302 假 hijack** | 用 `/analytics/organic/pages/` 采集会被 collector 判 hijack（exit 3）。历史记录 `semrush-organic-pages/` 就是这样死的；正主永远是 `/analytics/toppages/` |
| 壳会骗文本判据 | 深层文本 1,599,007 字符在数据到位前就齐了；就绪只认 filledCells |
| 卡壳是常规 | 首开常停壳态，stall-refresh 是标配不是异常 |
| max-screens 截断 | 12 屏没滚到底，census/截图对到第 12 屏为止；「双证人冻结」到底判据本页未触发 |
| LLM 提示列易漏 | 「大型语言模型提示」列在水平滚动区里，截图单证人会漏；以 DOM census 为准 |
| 首页≠全量 | 主表只渲染首页；33,931 页全量要另行设计分页 |

## 验证记录

- **2026-08-29**（UTC 10:01–10:02）双证人判决，会话 `semrush-nav`，整轮持锁：
  抽查 18.4M / -954.9K / 694.2K / faq templates / 33,931 / 29.8K / 20K
  像素↔DOM 全命中；「大型语言模型提示」列名与计数在 DOM 确认（2026 新列）。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-organic-pages-v2/`
  （toppages 正主）；`…/semrush-organic-pages/`（302 hijack 记录，exit 3，留作
  redirect 证据）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（摘要卡 + 3 线趋势 + 主表首屏）。
