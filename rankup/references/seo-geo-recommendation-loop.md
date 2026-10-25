# ChatGPT 推荐位整改闭环

## 适用范围与入口

本篇是**固定四问话术与整改复审的唯一源**（2026-10-25）。采样隔离、临时聊天判据、节奏、统计与三清单只在 [seo-geo.md 步骤 2–3](seo-geo.md#步骤-2探针采样)，这里不再复制；词级裁决见 [entry.md](playbooks/entry.md)。已有有效问法和证据先复用，不全批重跑。

路径：原问法 → 第 2 问理由 → 第 3 问亮出本站与差距 → 合并建议、甄别、整改、发布回读 → 原聊天先发链接 → 等答完 → 第 4 问。每个聊天都用同样几问，不加字数/格式要求，不喂竞品统计，不预告本站缺什么；不因首问已经推荐本站而改写固定话术，记录该前提不适用即可。没有本站的立项采样只问前两问，不虚构域名。

## 固定四问（中英对照）

中文保留用户原意；英文为固定发送版。项目保存一份话术文件，复制下列四个英文代码块，GAPS 的站点统一使用 `〔网址〕`，由脚本替换。第 1 问由项目原文件/参数提供，**不改已存开场**；不同开场各开独立临时聊天。

### 第 1 问：普通用户随口问需求

中文：像普通用户一样随口描述需求（可说想做的视频关键词或扔链接），问「有哪些爆火的同款工具可以在线直接使用」。已存开场不改，不为套模板追加句子。

英文意图示例（仅无已存问法时参考，不替换项目原话）：What tools can I use online to make something like this viral video?

### WHY

中文：你为什么会推荐这些产品？这些产品有哪些优势，让你觉得值得推荐给我？

```text
Why did you recommend these products? What are their advantages that make them worth recommending to me?
```

### GAPS

中文：亮出〔网址〕，问为什么没推荐，是没看到还是网站有缺陷；希望以后别人问同样问题也推荐本站，需要做哪些优化。明确四点：①差距与竞争力：缺点、不如名单的地方、怎么才能立刻被推荐；②搜索数据优化：它搜索时不会把每个网站看全，所以在搜索时能拿到的数据上下功夫，做成更高质量的网站；③优化原则：不要加太多不必要的功能，以产品、用户体验、功能为主；④推荐权重与对比：它更看重哪里，本站不足在哪里，怎么改才能更有优势、更符合用户习惯。

```text
Actually, I have a website too: 〔网址〕. Why didn't you recommend it to me? Is it because you didn't see it, or because there's something wrong with my site? If other people ask you the same question, I'd like you to recommend my site to them too, so what do I need to optimize and improve? Specifically: 1) Gaps and competitiveness: what are the weaknesses of my site, or where does it fall short of the list you just gave me? What should I do to be more competitive and good enough that you'd recommend it to users right away? 2) Search data: when you search you don't read every site fully, right? So I need to work on the data you can actually get when searching. Help me see how to build a higher-quality site that you can recommend to users. 3) Please don't make me add a lot of unnecessary features or changes; focus on product, user experience and functionality. 4) What do you weigh most when recommending? Compared with the other products, where am I behind or where could I improve? What would I need to do for you to feel my product is better than them, closer to what users want, and worth recommending?
```

第 2 问之前、第 3 问之后，仅摘录回答中的实际读页自陈；没有就记「未自陈/未知」。不追加读页问题，不替 ChatGPT 判断它看过本站；自陈不是独立抓取证明。

### 整改发布（此时不发送任何话）

收齐本轮各聊天前三问的完整回答，合并建议，按下节甄别。只做与产品、体验、功能及搜索可读事实相关、真实可做的必要整改；不为迎合推荐堆附加功能。付款/生成实测、第三方评价、素材授权或需外部权限的事项单列「需要用户或外部动作」。完成检查、发布并回读后，才进入下两步。发布仍须有任务授权，不由话术自动授权。

### FRESH-LOOK

第 4 问前先在**各自原聊天**发首页及本轮已上线、已回读的页面链接，请它重新抓一遍/重新看。等回答完整结束，再问 REVIEW。

中文：我按你的建议更新了网站，这里是链接，你能重新看一遍吗？

```text
I've updated the site based on your suggestions. Here are the links, could you take a fresh look?
〔网址〕
{changed_page_urls}
```

### REVIEW

中文：我已按建议改动。如果采纳全部或多数建议、修好核心问题，你愿意再看整个网站、继续向用户推荐吗？重新搜索现有产品后，差距是否小很多？能进入推荐名单或至少参考名单吗？**第 4 问只在优化完成后问。**

```text
I've now made changes based on your suggestions. If I adopt all of your advice, or most of it, and fix the core problems, would you be willing to look at my whole site again and keep recommending it to users? And if you search the existing products and tools again, would the gap between me and them be much smaller? Could I get onto your recommendation list or at least your reference list?
```

以上是知情复审，不能计入自然推荐出现率。需要自然复测时另开独立临时聊天，仍按原问法与步骤 2 的统计规则记录；不能拿原聊天的承诺当未来推荐保证。

## 页面、会话与锁的生命周期

采样页面、OpenCLI 会话/标签在整个流程（含整改、部署等待与复审后）保持打开，`--keep-alive` 禁止空闲回收；不在 finally、样本结束、错误或完成时关闭，不自动释放共享锁。**只有用户明确要求才关闭和释放**。不修改全局配置；OpenCLI 不支持无限保活时停止发送并升级，不退回有限时保活。共享锁被占时最多等 60 分钟，每 30 秒重查，等持有者正常退出，不删活锁、不绕守卫；到期仅暂停相关路径并报告。

聊天因故丢失才允许新建临时聊天，简短交代前情，仍先给链接、等答完再问第 4 问，报告记偏差；脚本遇丢页停止，不自动重建或重复发问。进程意外退出保留租约；同输出目录 `--resume` 接手原会话，须先人工核验未确认的发送结果。

## 建议甄别与落地

| 建议类型 | 决定 | 必填原因/证据 |
|---|---|---|
| 补真实功能、说明、价格/限制、对比、可靠来源、自然标题 | 核实后采纳，仅落地与目标及核心体验相关的必要项 | 页面/功能现状、可复现缺口、对应改动 |
| 补结构化数据 | 核实后采纳 | 与可见事实一致；不宣称它保证推荐，证据入口见 seo-ai-search.md |
| 补真实外部可验证提及 | 核实后采纳 | 实际公开 URL、真实关系及披露；不虚构第三方背书 |
| 事实暂不可核实、抓取失败 | 待核实 | 具体缺什么证据；不当作已成立缺口或已完成 |
| 伪造评价、案例、数据、作者、资历、测试、第三方背书 | 已拒绝 | 原建议原话 + “需要编造事实” |
| Google 垃圾内容政策或 helpful-content 红线冲突 | 已拒绝 | 原建议原话 + 对应政策/红线条目 |
| 站点体量/品牌权威目前做不到 | 本轮停止项 | 具体理由与现有证据，不循环生成空任务 |

建议涉及 FAQ、内页或 description 时，按 [段 2 §2.3 页面映射](lifecycle/stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构) 回填页面清单，关联问法簇、理由样本与真实能力；新增长尾问法的 Google 核验只见 [seo-serp.md](seo-serp.md#逐问法-google-读法)。

每条建议的链路：**建议原话 → 核实与采纳/拒绝 → 站点改动及 URL/版本 → 每个改动页过 seo-helpful-content.md 单页自检 → 发布并回读页面事实 → 复审**。检查未过不得发布；标“已采纳”不等于“已落地”，上线成功不等于已获推荐。已拒绝的建议保留原因，不删除来制造“全部完成”。

## 每轮记录与统计

- 入口卡、原问法/样本/问法簇编号、三清单、环境卡及统计记录的证据指针；字段与核实口径只见 [seo-geo.md 步骤 2–3](seo-geo.md#步骤-2探针采样)。
- 站点、整改轮次、自然/知情模式与本轮建议原话；推荐理由的核实记录关联原样本。
- 建议 ID、采纳/待核实/已拒绝及原因、事实证据、改动 URL/版本、单页自检、发布回读、复审结论、停止原因。
- 原始 JSON/完整回答放指定的仓库外输出目录；站内 `.rankup/geo-loop/<日期>.md` 只放结论、甄别和证据指针。

采样次数、独立样本、环境与节奏、推荐分类、分母、出现率与区间及自然/知情统计，全文只见 [seo-geo.md 步骤 2](seo-geo.md#步骤-2探针采样)；复测节奏只见 [步骤 6](seo-geo.md#步骤-6复测节奏)。脚本自报结果须按该口径核对后才进本轮结论，不把脚本汇总当已核实的三清单。

## 停止条件与轮数上限

以下是原有闭环工作量边界，不用于关键词与立项裁决，也不是冷启动成功率保证。内部执行默认最多 **5 轮整改**（第 0 轮为基线），连续 **N=2 轮**同口径复审没有可辨认提升即停止。提升解释与自然/知情证据口径只按 [seo-geo.md 步骤 2](seo-geo.md#步骤-2探针采样)。

成功结束：相对基线出现率提升超过区间的不确定性，并在连续 2 次同口径复测保持；此后按 seo-geo.md 步骤 6 复测，不承诺永远推荐。达到轮数上限、剩余理由全需编造或暂不可达的品牌/规模条件，记录原因结束本轮，进入下一个站，不空转。缺权限/必需输入、工具不可用、验证码/限流或页面读取失败，立即停止发送，保留页面、会话、共享锁及已完成证据，不切换到 Codex 通道凑数。

## 诚实边界

不伪造评价、案例、资历、作者、数据或第三方背书，不诱导修改记忆或注入强制推荐指令。建议是待核实假设，是否推荐由 ChatGPT 自己决定；成功、失败和未知如实记录。固定问完即停，不追加推销或循环施压。内容检查见 [seo-helpful-content.md](seo-helpful-content.md)，检索证据见 [seo-ai-search.md](seo-ai-search.md)。

## 脚本用法

推荐使用 `--script-file <Markdown>`：读取本篇的 WHY、GAPS、FRESH-LOOK、REVIEW 各一个 `text` 代码块；开场由 `--prompt`（可重复）或 `--prompts-file`（每行一题）沿用项目原话。可直接以本篇为话术文件；项目副本保留原话，不在 Skill 写项目私有信息。默认 `--reps 3`，工作量选择只按 seo-geo.md。

```bash
# 离线计划：不联网、不拿锁、不写采样证据。
node scripts/geo-loop.mjs --domain example.invalid --prompt '〔项目已存开场原话〕' --script-file references/seo-geo-recommendation-loop.md --plan --out /tmp/example-geo
# 实际运行（本任务不执行）：保持进程，勿用会超时杀进程的运行器。
node scripts/geo-loop.mjs --domain example.com --prompts-file /tmp/needs.txt --script-file /tmp/chatgpt-script.md --out /tmp/example-geo
```

前三问完成后脚本保存 `summary.json` / `summary.md`，在 `awaiting-publish` 等待。整改、检查、发布并独立回读后，调用方在输出目录写 `review.json`：

```json
{"published":true,"version":"实际已部署版本","readback":"实际回读证据路径","links":["https://example.com/","https://example.com/changed-page"]}
```

这份文件是调用方的事实回执，脚本不代替发布验证。脚本只接受本站 HTTP(S) 链接，在每个原会话依次发 FRESH-LOOK、等答完、再发 REVIEW，完成后仍常驻持锁。仅当**用户明确要求关闭**时，调用方写 `close.json`：`{"userRequested":true}`，才关闭页面并释放锁。暂停/错误仍保留原文、会话与租约。重启同目录需 `--resume` 且原参数一致；不自动重发 pending/失败轮次，先人工核对原聊天。不要把其他任务的 lease 当死锁删掉。

节奏参数沿用 `--sample-min/--sample-max`、`--followup-min/--followup-max`、`--hourly-limit`；单轮保留所有会话，超过 `--max-conversations`（默认 25）需显式调大或缩小本轮，不能用自动关页腾位置。`NODE_USE_ENV_PROXY=1` 沿用已有代理。原始回答原样保存，推荐名单、统计、建议和读页自陈由调用方按 seo-geo.md 核对，不要求模型输出 JSON。

旧 `--pitch` / `--pitch-file` 模式**已弃用，仅保留历史调用兼容**；`--no-pitch`、旧 `--recheck`、`--smoke` 也属历史工作流，不用于新采样/复审。它们原有计划与续跑行为保持；不可与 `--script-file` 混用。

## 每站输出模板：`.rankup/geo-loop/<日期>.md`

```markdown
# 〔域名〕推荐位整改闭环 · 〔日期〕
入口卡/原问法池/三清单：〔证据指针〕
环境卡与采样记录：〔按 seo-geo.md 步骤 2–3，原始证据指针〕
轮次：〔0–5〕；模式：〔自然采样/知情复审〕；证据目录：〔仓库外路径〕
| 问法 | 已核对有效 n | 本站 k/n、出现率与 95% 区间 | 竞品 k/n、出现率与区间 | 未知样本 |
|---|---|---|---|---|
| 〔逐字问法〕 |  |  |  |  |
原始位置/名单/理由摘录/优劣势：〔样本证据指针，保留原话〕
| ID | 建议及理由原话、样本/问法簇/页面清单指针 | 核实证据 | 采纳/待核实/已拒绝及原因 | 改动 URL/版本 | 单页自检 | 发布回读 | 复审 |
|---|---|---|---|---|---|---|---|
| S1 |  |  |  |  |  |  |  |
与基线比较：〔同口径出现率与区间；自然/知情分别写〕
结论：〔继续下一轮/稳定提升/本轮结束/阻塞〕
停止原因/剩余不可达项：〔原话和事实〕
下次复测：〔按 seo-geo.md 步骤 6〕
```
