---
name: blog
description: |
  示例站点（及同模板站点）文章类页面的书写与上线流程：模型页 /models/<slug>、blog、模型对比、产品对比。
  这不是通用写作 Skill，它把我们已定的分工（X 调研交 Grok、成文交 Gemini 3.8 Flash、review 交 Claude Sonnet、设计与实现交 Claude）、
  资料采集规范（只拼别人的资料、来源可核实）、页面组件标准（YouTube iframe、X 评论墙、Prompt 集合卡、参数表/对比表、shadcn 图表、引导 card）、
  以及最后的评判阶段（哥飞 AI 评分、AITDK 的 SEO/关键词密度/GEO 监测、ChatGPT 匿名问答）串在一起，并和 rankup、agent-fleet、write、gefei、opencli、design 联动。
  只要任务是“写/改/迁移一篇站内文章或模型页”“给模型页补视频/评价/参数表”“写模型对比或产品对比文”“把页面内容写出来”，就用它；rankup 里凡是要写页面内容都引导到这里。
  触发词：/blog、封面图、配图、文章封面、写文章、写 blog、model 页面、模型介绍页、模型对比、产品对比、seedance 文章、补参考视频、评论墙、X share card、文章标准化。
---

# blog · 我们自己的文章流程

这个 Skill 记录文章类页面做法，只服务 示例站点 一类站点。它不重复别的 Skill 的内容，只规定“谁做什么、按什么顺序、哪些不许做”，细节指到对应 Skill 去读。

配图（封面图）与正文同等重要，是写文章的一部分：每篇文章都要有一张海报式封面，走 `/imagegen`，见 `references/cover.md`。

## 为什么这样做

文章的价值在可信：写的是别人已经说清楚的东西，我们负责挑选、衔接、梳理。自己编的数字、效果、评价一出错，就是 EEAT 的硬伤。所以流程把“找资料”和“写”拆开，资料先落成带出处的文件，写作模型只能用这个文件里的东西，再由另一个模型对着文件逐条核对。

## 一条铁律（其余规则都从它来）

**不自编。** 文章里每一个事实、数字、引文、评价都要能指回一条真实可访问的来源（`sources/<slug>.json` 里的一项）。我们自己的东西只有两类：衔接与梳理的话，以及站内计价/参数（由代码生成，不手写）。拿不到来源的内容宁可不写，写进报告“缺口”。

## 谁做什么

| 环节 | 执行者 | 说明 |
|---|---|---|
| X 平台上的任何调研（找帖子、热点、社区评价、对比资料） | **Grok**（`fleet-go new … --to grok`） | 帖子要带原始链接、作者、日期、是否含视频 |
| YouTube 参考视频、Reddit、官方 blog/文档/定价 | **Claude**（`fleet-go new … --to claude --tier sonnet`，需浏览器时 `opencli`） | 官方与一手资料优先 |
| 画布设计（UI library 与“文章页标准”页） | **Claude**（画布 agent，executor-sonnet；读写画布需本应用 Artifact 工具） | 先 UI library，后页面（见 `/design`） |
| 组件/schema/深链接/数据源等架构决策 | **Claude Opus** | 复杂取舍 |
| 套用模板、页面迁移、机械编辑 | **Claude Sonnet** | |
| **成文** | **Gemini 3.8 Flash**（`fleet-go new … --to gemini`） | 把全部资料写进去，只做衔接与梳理，正面表述 |
| **成文后 review** | **Claude Sonnet** | 对着 sources 核对事实、引用、语气、夸大 |
| 代码/SEO 复核 | **Claude Opus**（只读）；Sol 只读也可 | maker 与 checker 不同人 |
| **封面图**（每篇文章一张海报式封面） | **Codex `image_gen`**（`/imagegen`，`fleet-go new … --to gpt --make image`） | 好莱坞大片感：夸张、强冲击力、视觉焦点鲜明；不出现文字/logo/商标/真实人物；详见 `references/cover.md` |
| 部署与线上回读 | 按 agent-fleet 的部署模板，生产只读回读 | 生产不做真实付费验证 |

派单一律用 `agent-fleet` 的 `fleet-go new`（run_in_background，不加 `&`），写作 brief 模板见 `references/writer-brief.md`。

## 流程（一次做完，不往后排期）

每一步都有产物文件，写进 `~/.agent-reports/<日期>/` 并更新项目接力记录（`rankup` 的接力协议）。

1. **摸底**：当前路由/组件/schema/深链接/计价数据源（只读，Sol 或 Claude）。
2. **画布**：在同一张设计画布新建/更新“文章页标准”页，UI library 先定组件，再画 model 页、blog、模型对比、产品对比四种模板（`/design`，一页一页发布）。
3. **组件实现**：公共组件 + 内容 schema（向后兼容）+ `/generator` 按模型参数深链接 + X 嵌入 + shadcn 图表 + 参数表与积分图表数据由站内计价自动生成（frontmatter 只声明 `model`/`xKind`，不写数字）。URL、canonical 不变，JSON-LD 只增不改。草稿与 manifest 的 `gaps` 不进构建产物。详见 `references/components.md`。
4. **资料采集**：每篇文章一份 `sources/<slug>.json`，格式与来源规则见 `references/sources.md`。X 交 Grok，其余交 Claude。采集后逐条验证链接可打开、日期与作者对得上。
5. **成文**：Gemini 3.8 Flash 按 `references/writer-brief.md` 写；输入是 sources 文件、站内参数表数据、文章骨架。
6. **Review**：Claude Sonnet 按 `references/writer-brief.md` 的清单核对，改动写回；通过后才进仓库。
6.5 **封面图**：每篇文章一张，按 `references/cover.md` 用 `/imagegen` 生成，落盘并转 webp，写进 frontmatter（cover、og 图同源）。
7. **迁移与接入**：写入 `content/articles/**`，页面三处引导 card（首屏、文中、文末），YouTube iframe 必备，X 评论墙，Reddit 仅链接，Prompt 集合卡（有则内置），参数表/对比表。
8. **复核**：Opus 只读复核代码与 SEO，Sonnet 复核内容；修必修项。
9. **部署与回读**：生产部署后只读回读（页面、嵌入可播放、JSON-LD、canonical、截图并排）；IndexNow。
10. **评判**：见 `references/review-eval.md`（哥飞 AI 评分、AITDK 监测、ChatGPT 匿名问答），分数不达标回到第 5 步。

## 页面必备件（模型页）

首屏（封面、标题、摘要、事实条、引导 card）→ 文章介绍 → YouTube 参考视频（宽屏 iframe，可全屏播放）→ 参数/价格表（入参出参、时长、每条与每秒积分）→ Prompt 集合卡（该模型有集合时）→ 社区评价墙（X share card，含可播放视频）+ Reddit 超链接 → 积分图表 → 文中引导 card → FAQ → 资料来源（官方文档/定价页在前，独立评测在后）→ 文末引导 card → 相关内链。引导 card 点击跳 `/generator` 并带模型参数。对比类文章把“参数表”换成“我们 vs 他们”的价格与功能表，竞品数据只引用有出处的采集。顺序与组件以 `references/components.md` 为准。

## 联动的 Skill

- `agent-fleet`：派单与插话；`rankup`：接力记录、SEO/GEO 判据、评判阶段的脚本与清单。
- `write`：中文稿的去 AI 味体检（站内英文稿不用）；`gefei` 系列：评分与关键词；`opencli`：登录态浏览器取数；`design`/画布：组件设计；`imagegen`：配图。
- 评判标准与脚本都在 rankup，不要在这里复制一份。

## 做完怎么交

报告给：每篇文章的 sources 条数与类型、缺口、Gemini 初稿与 Sonnet review 的改动摘要、评判分数、线上回读证据。没验证的写“未验证”。
