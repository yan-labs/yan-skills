# 页面组件与数据源（以代码为准）

> 回填于 2026-10-11（ev-article-arch / ev-article-visual / ev-article-fixA）。路径相对 `example-project/`；平台代码在 `packages/platform/src/`（下称 `src/`）。字段与校验以 `src/content/article-schema.ts` 为准，本页只是索引。

## 文件与管线

| 位置 | 作用 |
|---|---|
| `sites/effect-video/content/articles/<type>/<slug>.mdx` | 文章：YAML frontmatter + MDX 正文。`type` 必须等于目录名，`slug` 必须等于文件名 |
| `sites/effect-video/content/articles/sources/<slug>.json` | 资料清单（manifest），由 `scripts/merge-article-sources.mjs` 生成（格式见 `sources.md`） |
| `src/content/article-schema.ts` | 类型、`articleCheck` 校验、`mergeArticleSources` 合并、`ARTICLE_SECTION`（type→URL 段） |
| `src/lib/article-remark.ts` | 构建期 remark 插件：合并 manifest → 校验 → 写回 `export const frontmatter`（已合并）+ `articleSummary` + `articleBlocks`；发布冲突与封面 800w 变体检查；未发布文章在构建中只剩 type/slug |
| `src/content/articles.ts` | 只 eager 读取各文件的 `articleSummary`（`?summary` 导入，tree-shake 到这一个导出）；整篇（frontmatter+正文）按 slug 懒加载，一篇一个 chunk |
| `src/content/article-data.ts` | 路由 loader：加载该篇模块、PromptCollection 的服务端取数、`/compare` 反序 301 |
| `src/content/article-head.ts` | head 覆盖（og 图、关键词、日期） |
| `src/components/article-page.tsx` | 页面骨架与固定顺序、MDX 组件白名单映射、JSON-LD（FAQPage、BreadcrumbList、有 author 时 Article/BlogPosting） |
| `src/components/article/*.tsx` | 标准区块组件（下表） |
| `src/content/model-specs.ts`、`src/content/article-charts.ts` | 规格/价格与图表数据，全部由 `generation/create-models.ts` 的 `createModels/quoteCreateModel` 计算 |
| `scripts/migrate-articles.mjs` | 审定稿迁入仓库并生成 cover/guide/specTable/charts/promptCollection；`--charts-only` 只把图表改成声明式 |
| `scripts/article-cover-variants.mjs` | 生成封面 800w 变体 `<slug>-800.webp`（≤90KB），hero 的 srcset 用 |
| `scripts/article-render-snapshot.mjs` | SEO 快照与对比（title/h1/canonical/hreflang/meta/JSON-LD/内链） |

URL：`model`→`/models/<slug>`，`compare` 与 `product-compare`→`/compare/<slug>`（`b-vs-a` 301 到已发布的 `a-vs-b`；两者同时发布构建失败），`alternative`→`/images/<slug>`，`blog`→`/blog/<slug>`。草稿本地预览：`VITE_ARTICLE_DRAFTS=1 pnpm dev`（仅 dev；生产构建里没有草稿内容）。

## 组件（MDX 白名单 `ARTICLE_COMPONENTS`；其余标签构建失败）

| 组件 | 文件 | 数据 | 说明 |
|---|---|---|---|
| ArticleHero | `article/hero.tsx` | frontmatter | 标题、摘要、署名、封面（srcset 800w/1600w，`fetchpriority=high`）、事实条、首屏 GuideCard；无生成器 |
| GuideCard | `article/guide-card.tsx` | `guide` 或 props → `content/generator-link.ts` | 首屏 s / 文中 m / 文末 l 三处，整卡一个链接到 `/generator?model=…`；无 aria-label，可见文字即名称 |
| SpecTable | `article/spec-table.tsx` | `model-specs.ts` | Input、Output（MP4 video）、Length、Quality、Aspect ratio、Sound、Kept for（7 days after completion）+ 每条积分表；长度超过 8 档时只列最短、5/10/15、最长 |
| CompareTable | `article/compare-table.tsx` | `compareTable.ours`（报价生成）+ `competitors`（带日期出处） | 未核实格显示 Not verified；有 sr-only caption |
| YouTubeEmbed | `article/youtube-embed.tsx` | `media.youtube` | youtube-nocookie iframe，lazy，`sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"`，可全屏，标注赞助 |
| XPostWall | `article/x-post-wall.tsx` | `community.x`（构建期缓存的 post） | 运行时不请求 X；视频点击后才挂 `<video preload=none>`；外链 `nofollow ugc` |
| RedditLinks | `article/reddit-links.tsx` | `community.reddit` | 只放链接（`nofollow ugc`） |
| PromptCollection | `article/prompt-collection.tsx` | `promptCollection` → 服务端只取选中条目 | 复用 PromptCards，`quiet`：不输出整页 no-referrer meta、海报不抢高优先级、链接 `nofollow ugc` |
| Chart | `article/article-chart.tsx` + `packages/ui/src/components/simple-chart.tsx` | `charts[]` → `content/article-charts.ts` | 卡片进入视口附近才加载 Recharts；SSR 固定高度占位 + sr-only 数据表；`role="img"` 内无可聚焦元素 |
| References | `article/references.tsx` | `sources`（合并后） | 先“官方与提供方文档”（`source.official` 或 kind doc/pricing/site 或与 `model.officialUrl` 同域），再“独立测试与报道”（含 YouTube），编号贯通 |
| Faq / RelatedArticles | `article/faq.tsx`、`article/related.tsx` | frontmatter / 摘要 | |
| Callout / TryCard / EffectCards / ModelCompareStrip / VideoExample | `article/prose.tsx`、`article-page.tsx` | props | 旧件仍可在正文使用 |

正文 Markdown 链接由页面覆盖 `a`：站外 http(s) 加 `target=_blank rel="noopener noreferrer nofollow"`，x.com/twitter.com/reddit.com 再加 `ugc`；站内链接不变（直接写终点，如 `/effects/ai-dance`，不要写会 301 的旧路径）。

页面固定顺序：Hero → 锚点条 → 正文 → YouTube → 规格/对比 → Prompt → X + Reddit → 图表 → 文中 GuideCard → Try these effects（`related.effects`）→ FAQ → References → 文末 GuideCard → 相关文章。正文自己放了某块（如 `<XPostWall />`），默认位置就跳过；没数据的块不渲染。

## frontmatter 字段（新增/有约束的部分）

| 字段 | 形状 | 校验（失败即构建失败） |
|---|---|---|
| `cover` | `{ src, alt, og? }` | src/og 为站内路径 `/…`（不许 `//host`）或 http(s)；`/articles/covers/*.webp` 必须有 `-800.webp` 变体 |
| `media.youtube[]` | `{ videoId, title, channel, channelUrl?, published, sponsored?, note?, aspect? }` | 11 位 id；不许重复 id；已发布 model 文章至少 1 个（manifest 里的也算） |
| `community.x[]` | `{ url, id, author, handle, date, excerpt, hasVideo, kind, post? }` | url 为 `x.com/<h>/status/<id>`，`id` 必须等于 url 里的 id；不许重复；excerpt ≤30 词（超出报错，合并脚本会先截断并列出）；`post` 的 avatar/video/photo 只能在 `pbs.twimg.com`/`video.twimg.com` |
| `community.reddit[]` | `{ url, title, subreddit, date? }` | reddit.com；不许重复 url |
| `promptCollection` | `{ models?, slugs?, limit?≤24, title? }` | models 或 slugs 至少一个 |
| `guide` | `{ model, duration?, resolution?, audio?, aspect?, label? }` | model 必须是站内模型 id |
| `specTable` | `true` 或 `{ model }` | 能解析到站内模型 |
| `charts[]`（站内计价图） | `{ id, title, kind: line\|bar, model, xKind: duration\|quality, duration?, unit?, source }` | **不写 x/series/data**（写了报错）；数字在渲染时由报价函数算，改价后与 SpecTable 同步变 |
| `charts[]`（外部数据图） | `{ id, title, kind, x, series[{key,label}], data[], unit?, source }` | 每行有 x 且每个系列是数字；必须有 source；id 不许重复 |
| `compareTable` | `{ title?, ours: GeneratorPreset, competitors[{ name, model?, price, maxDuration?, resolutions?, notes?, source{label,url,date} }] }` | 竞品行必须带日期出处；product-compare 必填 |
| `sources[]` | `{ label, url, kind?, author?, date?, accessed?, official? }` | http(s)；不许重复 url |
| `author` / `reviewedBy` | `{ name, url?, type?: Person\|Organization }` | 有 author 才输出 Article/BlogPosting；团队署名写 `type: Organization` |
| `lastReviewed` | `YYYY-MM-DD` | 有 reviewedBy 时必填 |

旧版图表（手写 `data` 且 `source.url` 指向 `/pricing`）仍能构建：remark 自动转成计价图并打印 warning，`node scripts/migrate-articles.mjs --charts-only` 把文件改成短写法（只动 charts 块）。

## 合并规则（manifest → 页面）

frontmatter 已写的块原样保留，manifest 只补空块。`sources` 取并集：同一 url 按字段合并（frontmatter 已写的字段优先，manifest 补 kind/author/date/accessed/official）；manifest `official[]` 的条目带 `official: true`，References 据此分组。manifest 的 `gaps` 只用于内部，不进页面也不进构建产物。
