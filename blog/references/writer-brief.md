# 成文与 Review 的 brief 模板

## 给 Gemini 3.8 Flash（写）
```sh
fleet-go new blog-<slug>-write --to gemini --report ~/.agent-reports/<日期>/blog-<slug>-write.md --goal "按资料写 <模型/主题> 文章" --body body.md
```
body 必含：
1. 输入：`sources/<slug>.json`（全部条目都要用上或说明为什么不用）、站内参数表数据（由代码生成的 JSON，直接引用，不改数字）、文章骨架（frontmatter 字段与章节顺序）。
2. 目标读者与搜索意图（来自 keyword 研究，主关键词）。
3. 写法：英文，正面表述（讲能做什么、带来什么好处）；只做衔接、梳理、对比归纳；每段事实后标注来源（链接到 sources 里的 URL）；评价类写成“某作者/账号在某日期说…”；不使用“最佳”“领先”等比较级，除非来源原文如此并已引用。
4. 禁止：编造数字、效果、日期、人名；写 sources 里没有的事实；改参数表数字；替赞助视频隐去赞助披露。
5. 输出：只输出 mdx 正文与 frontmatter 草案，缺口以 `<!-- GAP: ... -->` 标出，不要自己补。
文案语气遵守 agent-fleet 的 copy-voice 规范（自动注入）。

## 给 Claude Sonnet（review）
```sh
fleet-go new blog-<slug>-review --to claude --tier sonnet --goal "对照 sources 核对 <slug> 文章" --body body.md
```
清单（逐条答“通过/不通过/证据位置”，不通过的直接改文并列出改动）：
1. 每个事实/数字/引文 → 对得上 sources 的哪一条；对不上的删除或标缺口。
2. 引文长度、署名、日期；赞助披露是否保留。
3. 站内参数与价格 → 对得上参数表数据，不手写数字。
4. 有无夸大、绝对化、未经来源的比较级；对比文是否只含有出处的竞品数据。
5. YouTube iframe 在、X 评论墙在、Reddit 仅链接、Prompt 集合卡在（若有）、三处引导 card 在。
6. 语气正面、衔接自然、无 AI 腔套话；标题/描述含主关键词，不堆词。
7. 内链、related、FAQ 真实回答搜索意图。
Review 通过后才写入仓库。
