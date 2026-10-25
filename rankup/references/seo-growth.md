# Rankup SEO 与增长参考

> **渐进式加载入口**：本文件只是索引，按任务只读下面对应的子文档，不要一次全读。
> 关键词任务从 [entry.md](playbooks/entry.md) 进入，方法按下表唯一源加载，立项后再进入推荐位整改闭环。项目特有的事实和结果写入项目 `.rankup/`，不要追加到参考文件。

| 子文档 | 解决什么问题 | 什么时候读 |
|---|---|---|
| [`playbooks/entry.md`](playbooks/entry.md) | 关键词端到端顺序、SEO/GEO 两路裁决与未知 | 选词、立项或新增内页选词时先读 |
| [`trends.md`](trends.md) | GT 趋势与量、默认 gpts 基线及测量口径 | 入口①趋势与量验证 |
| [`seo-serp.md`](seo-serp.md) | 每条长尾问法的 Google 盘面、意图与任务缺口 | 入口③逐问法核验与补漏 |
| [`seo-data-channels.md`](seo-data-channels.md) | 数据通道地图、SEO 项目接入 | 接新项目、选数据通道时 |
| [`seo-opportunity.md`](seo-opportunity.md) | 候选池与冷启动背景；裁决回 entry.md | 收集候选与规划背景时 |
| [`seo-ai-search.md`](seo-ai-search.md) | 2026 AI 搜索范式：引用 > 排名（官方指南、算法更新、十大排名因素）与 ChatGPT 侧爬虫、JS 渲染、`site:` 证据（三-D） | AEO/GEO、被 AI 引用、算法排障 |
| [`seo-agentic-scan.md`](seo-agentic-scan.md) | AI Agent 就绪度扫描脚本（`is-agentic.mjs` 全套用法） | 测站点的 AI 代理就绪度时 |
| [`seo-geo.md`](seo-geo.md) | 多模型问法、ChatGPT 自然采样与三清单；采样规则唯一源 | 入口②首要测试，或补采/复测时 |
| [`lifecycle/stage-2-positioning.md`](lifecycle/stage-2-positioning.md) | 问法簇到页面、FAQ/description 与站点结构 | 入口④页面移交时 |
| [`seo-geo-recommendation-loop.md`](seo-geo-recommendation-loop.md) | 固定四问正文、建议核实、整改发布与原聊天知情复审；采样规则见 seo-geo.md | 已上线站推荐位整改与复审时 |
| [`seo-ssr.md`](seo-ssr.md) | 无关区块 SSR：价格表/推荐位客户端加载与交互门控注入 | 写页面、算词密度前 |
| [`seo-workflow.md`](seo-workflow.md) | 每轮优化工作流、经验沉淀协议 | 每轮 SEO 开工、沉淀经验时 |
| [`seo-experiences.md`](seo-experiences.md) | 历史经验索引（带日期与证据等级）；当前关键词裁决回 entry.md | 查历史证据及其适用边界时 |
| [`seo-experiences-2026-07.md`](seo-experiences-2026-07.md) | 经验库归档（2026-07 上半，07-17 ～ 07-21） | 查 7 月的旧条目时 |
| [`seo-experiences-2026-07-late.md`](seo-experiences-2026-07-late.md) | 经验库归档（2026-07 下半，07-21 ～ 07-31） | 同上 |

> **官方口径入口**（引用前核对当前日期与版本）：Google 对关键词密度、工具评分与 AI 搜索的口径见 [官方 SEO 问答](https://developers.google.com/search/help/office-hours/2023/january)、[页面体验指南](https://developers.google.com/search/docs/appearance/page-experience)、[生成式 AI 搜索指南](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)（2026-09-30 从 `SKILL.md` 开头移到这里）。

> **经验库原则**：凭数据说话，不凭直觉。只有跨项目成立、经过验证且剥离了站点敏感信息的结论，才允许回流参考文件。

*2026-09-29：原单文件（1080 行 / 169KB）按主题拆分为 9 个子文档 + 本索引；新增 `seo-geo.md`（AI 需求验证与推荐位流程）。*
