# 资料采集规范

目标：让每篇文章的每个事实都有一条可点击的来源，EEAT 结构完整（文章介绍、YouTube、X share card、参考资料）。

## 文件
采集稿放 `~/.agent-reports/<日期>/sources/<slug>.json`，用 `node scripts/merge-article-sources.mjs --from <目录>` 规范化后写入 `sites/effect-video/content/articles/sources/<slug>.json`（X 帖子在这一步缓存，超过 30 词的 excerpt 会被截断并列出）。`official[]` 里的条目在页面 References 归入“官方”组；`gaps` 只给内部看，不进页面和构建产物。

```json
{
  "slug": "seedance-2-mini",
  "collectedAt": "2026-10-11",
  "official": [{ "label": "", "url": "", "kind": "doc|blog|pricing|site", "accessed": "" }],
  "youtube": [{ "videoId": "", "title": "", "channel": "", "published": "", "sponsored": false, "note": "一句话说明，来自视频本身" }],
  "x": [{ "url": "", "author": "", "handle": "", "date": "", "hasVideo": true, "kind": "official|creator|user", "excerpt": "≤30 词原文片段" }],
  "reddit": [{ "url": "", "title": "", "subreddit": "", "date": "" }],
  "other": [{ "label": "", "url": "", "author": "", "date": "" }],
  "gaps": ["没有找到的内容，如“无官方定价页”"]
}
```

## 规则
- 只收录真实打开过的链接；日期、作者、赞助披露照实记，视频里有赞助披露要标 `sponsored: true`。
- 一手资料（官方文档、官方账号）优先；二手评测要带作者与日期，文章里写成“某作者在某日期的测试”，不写成我们的结论。
- 引用原文不超过 30 词，其余用转述并保留出处；不整段搬运。
- 价格、参数以站内计价与官方文档为准，冲突时记录在 `gaps`，不替他们圆。
- 竞品价格/功能只收有出处的；没有就不放对比表那一行。
- X：用 Grok 找；帖子内容的事实性不由 Grok 判断，Review 环节再对。Reddit 只存链接。
- 每篇至少：1 条官方、1 个 YouTube（模型文章必备）、X 评论墙 3–6 条（有就放）、Reddit 若干链接。缺哪类写进 `gaps`，不凑数。
- 摘录要短、署名、链到出处，同一家来源的摘录加起来只占全文一小部分；几家一致处写「多家来源一致」，不同处并排列。整段搬运既侵权，也会被判为重复的低价值内容，这条不放宽。
- 图片只用来源明确允许外链或转载的（CC、官方媒体包、自有）；没有许可的只给出处链接，不外链、不下载后当作自己的图。每个媒体写 alt 和一句说明，并标出处。
- 页面写明整合方式（如「本页整合自以下公开资料」）和最近核对日期；来源失效或内容变化就更新或删掉。
- 项目自己的红线（不出现的人名、不能用的素材等）记在该项目的 `.rankup/` 里，采集和成文前先读。
