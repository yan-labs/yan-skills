# 开工卡 · 站内 SEO 内容（工具首页、长尾内页、FAQ、title 与 description）

适用：一页或一批站内页面的可见文案与 title、description，任何语言。文章类页面（blog、模型页、对比文）走 blog Skill；做哪些页、目标词由 rankup 给。

## 输入（缺的写「未提供」交回，不自己编）

- 页面清单：URL｜目标短语（原字符串）｜搜索意图｜要承接的问法
- 产品事实：功能、限制、价格，每条能指到代码或线上页面
- 语言、输出格式（引擎数据的 JSON 字段、mdx 或纯文本）

## 必读（按顺序）

1. `../executor.md`
2. `../official/google-content.md` 全文。这是官方要求，和下面任何一条冲突时它赢；看文件头的 `last_verified`，距今超过 90 天在报告写一行「官方层已 N 天未核对」
3. `../site-copy.md` 里对应页型的小节
4. `../practice/site-seo-notes.md`。这是经验做法，可取舍，用了哪条在报告里点名编号
5. 英文读 `../patterns-en.md`，中文读 `../patterns-zh.md`

## 步骤

1. 每页先写一句「搜这个词的人来这页要办成什么」。写不出来，这页的词或意图有问题，交回 rankup。
2. 先写页面可见内容，再写 title 和 description：它们是正文的承诺，正文没有的不写进去。
3. 批量页逐页写只属于这一页的东西（步骤、限制、例子、数字）。把两页的目标词对调后仍读得通，就是模板换词，重写或建议合并。
4. FAQ 只收真实问法，答案第一句直接回答，再补条件和限制。
5. 只写输入里能核实的功能与数字；证明不了的删掉，在缺口清单里记一行。
6. 体检：`check.py --meta`（JSON 稿件加 `--json`），硬禁清零。
7. 对照官方层逐条自查，不通过的改到通过或写明原因。

## 落稿与验收：有站点引擎时

站建在站点引擎上、会话里接了它的 MCP（如 GeFeiSites 引擎）时按这一节落稿。工具的参数和返回以引擎的 `get_guide` 与工具说明为准，这里只写什么时候用哪个工具。

1. 开写前：`get_site`、`page_get` 看同类页面用的模板和 content 键，照着写。改线上页先看 `pvuv_report` 的搜索来源流量，有流量的页只小修，不动 title、description、H1、URL 和主话题。
2. 稿件包：每页一个 JSON，键为 path、kind、title、description、content、body、status（一律 draft）。content 里的键以该站模板在读的为准，FAQ 放 `content.faq`。不写结构化数据、canonical、og 标签，引擎会出；页面任何位置不写引擎的名字；链接写目标页的规范地址。
3. 先体检再写入：`check.py --json --meta` 对稿件包跑，硬禁清零才写入。
4. 单页：`page_upsert` 写入 → `preview` 核渲染后的 H1、H2 和正文是否真的显示 → `check` 传 path 到无 error。体检清零、preview 核过、单页 check 无 error，三样齐了这页才算验收通过。
5. 成批写长尾内页：引擎没有批量写入工具，`page_upsert` 逐页写，全部 draft。全部写完再整站 `check`，`title_duplicate`、`orphan_page` 清零，每个新页至少被一个已有页链接。status 改 ready、`publish` 和分天放量不在本卡，交回派单方。
6. 改线上页：只用 `page_edit` 改几处；返回 `tdh_warning` 就停下交回。
7. 降级：没有引擎 MCP，只交稿件包，报告写「未写入」。工具不全（缺 `page_upsert`、`preview`、`check` 之一）先开新会话核对；新会话仍缺，就在报告写缺哪几个，稿件包照做。
8. 引擎做不到的功能：先 `feedback_search`，没人报过再 `feedback_submit`，报告写一行；不改引擎仓库。

## 完成标志

- 每页 title、description、H1、正文、FAQ 齐全，页与页之间互不重复
- 体检硬禁为 0
- 每条事实有出处，缺口已列出
- 报告写明：官方层核对日期、未通过的 G 编号、采用了哪些经验做法
- 有站点引擎时：单页 check 无 error；报告列出每页的 path 与 check 结果

## 交回

只交各字段文本（或稿件包）和一行缺口清单，不附草稿和分数。
