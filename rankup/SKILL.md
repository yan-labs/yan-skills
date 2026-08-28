---
name: rankup
description: 网站从零到一与长期增长的总控 Skill。用于新建网站、SaaS、工具站或内容站，规划或初始化 TanStack Start Monorepo，使用 Cloudflare Workers、D1、R2 部署全栈应用，接入支付，执行 SEO、内容、外链、上线验证和持续迭代；也负责 Google Trends 查询、关键词难度（KD）估算与选词工作流；2026 AI 搜索范式（AI Overviews、AI Mode、Preferred Sources、Discover 独立算法、Information Gain、引用优先于排名）；AI Agent 就绪度评分（is-agentic、agent readiness、llms.txt、MCP 可发现性、AI 代理优化）。用户提到 rankup、rankup init、rankup check、环节闸门、检查清单、checklist、"现在该做什么"、"到哪一步了"、"这个环节能不能过"、"本轮还差什么"、建站、网站改版、搜索流量、GSC、排名、关键词、CTR、索引、网站增长，或提到 谷歌趋势、Google Trends、搜索热度、热度对比、搜索趋势、trending、"XX 和 YY 哪个更火"、"今天美国/日本在搜什么"、每日热搜、"这个词能不能做站"、"哪个市场/国家有机会"、帮我选 SEO 关键词、选词、选品调研、市场探测、挖需求、找需求、需求挖掘、找方向、找选题、"最近有什么能做的"、"找几个关键词"、"挖个新词的工具站"、"看看有什么游戏站能做"、竞品调研、榜单调研、差评挖掘、反查谁在赚钱、关键词难度、KD、竞争度、SERP 分析、"这个词难不难做"、"做这个词要多少外链"，或提到 哥飞、web.cafe、哥飞论坛、哥飞的朋友们、悬赏、悬赏问答、经验帖、"群里怎么说的"、"社群里有没有讲过"、"论坛里搜一下"、"哥飞说过什么"、哥飞.ai，或提到 AI 搜索优化、AI Overviews、AI Mode、被 AI 引用、AEO、GEO、Preferred Sources、Discover 优化、Google 算法更新、核心更新、spam 更新、Information Gain，或提到 AI Agent 就绪度、is-agentic、agent readiness、llms.txt、对 AI 代理友好、AI 代理优化、agent-friendly、agentic score 时使用。
metadata:
  version: "2.60.1"
---

# Rankup 2.0

`rankup` 是网站全生命周期的总控 Skill：恢复项目上下文，判断当前阶段，加载必要的专项能力，完成真实验证，并把项目事实、决策与经验写回 `.rankup/`。

它不重复实现 Wrangler、Stripe、趋势研究或外链工具；它负责把这些能力串成一条长期可维护的网站工作流。

## 主线：维护 checklist，使用 checklist

**每个环节都有一套 checklist。不过 check 不许进下一个环节；每一轮迭代新做的东西，也要把相关的 check 重新过一遍。这是硬性门槛，不是建议。**

清单分两层：

- **闸门 check** 在 [`references/checklists.md`](references/checklists.md)——12 个环节，每环节一张表：
  **检查项 / 客观通过条件 / 证据落点 / 怎么做（一句话加指路）/ 复查口径**。判「这个环节能不能算完」。
- **步骤 check** 在各阶段自己的 md 里，紧跟必做动作后面（[`lifecycle.md`](references/lifecycle.md)
  每个阶段的「步骤 check」一节，共 92 步）。判「这一步做对了没有」，**每做完一步就核，不要攒到闸门**。

**闸门过不了，一定是某条步骤 check 没过**；反过来不成立——闸门还要判跨步骤的一致性。
状态都记在项目侧 `.rankup/checks.md`。

**判断由你做，不要找脚本代劳。** 「三方对账一致吗」「全站每一个 URL 的 TDK 都核过了吗」
「每条 AI 建议都有采纳或拒绝理由吗」——这些要去看真实代码、真实线上响应、真实后台读数。
只有「`.rankup/` 里某个文件在不在、够不够大」这一层交给 `scripts/review.mjs`，
它给的是**文件层面的缺口清单，不是「这一项做对了」**：一个 500 字节的 `audit.md`
能让脚本变绿，里面写的是不是全站逐 URL 的结果只有你看得出来。

### 用法

| 场景 | 动作 |
|---|---|
| 开工 / 用户问「现在该做什么」 | 读 `checklists.md` + 项目的 `checks.md`，找到第一个没过闸的环节，报出它还差哪几项，然后**直接照着做** |
| 做完一项 | 在 `.rankup/checks.md` 记一行：✅ + 证据在哪个文件的哪一段 + 日期 |
| 开新一轮 | 把标「每轮」的 check 全部打回 ⬜；本轮动过线上 URL 的把标「动了 URL」的也打回 |
| 收尾 | 本环节全 ✅ 才算这个环节完成；做不了的标 ⏸ 并写明卡在哪、需要用户做什么 |

### 三条硬约束

1. **证据是必填的。** 只跑了命令、没留下证据不算过；控制台一个绿色图标不是证据。
   这套东西唯一致命的失败形态是**看着全绿、底下什么都没有**。
2. **判据在 `checklists.md`，操作说明在各自的 md，两处不得各存一份。**
   同一件事写两遍，改了一处另一处就静默过期，而两边看起来都正常。
3. **不打回等于默认继承上一轮的绿灯。** 新一轮开工的第一个动作是打回「每轮」那一批——
   这是清单腐坏最常见的起点。

### 缺 check 的时候

发现某个环节有该做、而清单里没有的动作时，**先补进 `checklists.md`，再去做**——
顺序反了，这一条就只会存在于那次对话里。补的时候只写判据不写教程，
并按 [`evolution.md`](references/evolution.md) 的晋升门判断它该进 Skill 还是留在项目侧。

## 红线：先查脚本清单，禁止重造轮子

**动手之前先看这一节。凡是本清单里已经有的能力，一律调用现成脚本；不准在对话里现写一段等价实现，也不准手工点一遍界面。**

这是被明确指出过的红线，理由不是洁癖：现写的实现每次形状都不一样，结果不可比、踩过的坑要重踩、上下文白烧，而且下次换个报表还得再写一遍。**脚本坏了就修脚本**（改完更新头部的已验证日期），不要绕过它。只有清单里确实没有的能力，才允许新写——写完立刻按「可复用操作必须落成脚本」固化并登记。

判定顺序，从上往下，命中即停：

1. 本清单（本 Skill + 兄弟 Skill 的脚本）；
2. 跨项目资产登记表 `registry.md`（别的项目已经写好的，直接去那个路径取）；
3. 当前项目的 `<project>/.rankup/scripts/`；
4. 都没有 → 才新写。

### 数据获取的强制优先级

找到能力之后，**按此优先级选实现路径，禁止跳级**：

1. **现有脚本**（`node scripts/xxx.mjs`）→ 直接跑，不要现写等价实现；
2. **HTTP/REST API**（`fetch` / `curl`）→ 没脚本但服务有 API 时，先用 API，再固化成脚本；
3. **用户浏览器 + 现有自动化脚本**（底层走 OpenCLI）→ 没有 API 且需要登录态时；
4. **用户浏览器 + 手动 OpenCLI 或 Claude in Chrome** → 一次性探路或脚本不覆盖时。

每一级向下的**唯一理由**是「上一级确实不存在」，不是「我对下一级更熟」。
沙箱浏览器（Claude Browser pane）不在这个阶梯上——它没有登录态，用它查需要登录的面板必然拿到错误数据。

**这个阶梯管的是「取数」，不替代「亲眼看」。** 任何调研在动用上面任何一级之前，先去 Google、Bing、以及目标市场的本地引擎把词搜一遍，看第一页排的是什么——数据平台给的是模型输出与面板外推，首页是搜索引擎此刻真正端给用户的东西。方法与要记的七样见 [`demand-sources.md`](references/demand-sources.md) 第一·五节；这是 [`checklists.md`](references/checklists.md) 阶段 1 的一条硬性 check。（公开搜索结果不需要登录态，**这是少数可以用沙箱浏览器的场景**，但地区与语言必须显式指定。）

### 配额前置检查（花配额之前的第一个动作）

**凡是有配额的数据源，开工的第一个动作是问自己在哪一档，不是查第一个词。**

真实事故（2026-08-22）：整场关键词调研按「匿名 10 次/日」规划，省着用，
少测 4 个词，报告里写成「配额耗尽，无法验证」——**账号其实是 VIP 500/日，
当天只用了 66 次**。没人去问过档位，文档里的默认值就被当成了事实。

- seo.web.cafe：`node seo-webcafe.mjs <任意命令>` 现在会**自动先打印档位**
  （`· 配额 VIP：已用 66/500，剩 434`），匿名档还会打印一整段提示。不用记，跑就行。
- Similarweb / Semrush：档位与到期日在面板启动时打印一次；**会话复用会跳过启动，
  配额读数就不再刷新**，所以整场调研的规模要在开工时定死。

### 脚本没有登录态、而用户浏览器有：把请求发进浏览器，不要去抠 cookie

httpOnly 会话**故意**不让 JS 读到，OpenCLI 也没有导出 cookie 的命令。
遇到这种情况，正确解法不是想办法取出凭据，而是**把调用挪到已登录的页面里执行**——
浏览器自动带会话，凭据全程不离开浏览器，不写 `.env`、不进日志、不进 git。

```bash
S="webcafe-serp"          # Bash tool 里用描述性常量，不要用 $$（每次调用 PID 都变）
opencli browser "$S" open "https://seo.web.cafe/serp/"
opencli browser "$S" eval '(async()=>{ /* fetch(..., {credentials:"include"}) */ })()'
```

写法与令牌提取见 [`seo-webcafe.md`](references/seo-webcafe.md) 的「httpOnly 会话」一节。
**eval 体一律包 IIFE**——本环境 eval 上下文跨调用持续，重复声明会抛错且那次调用根本没执行。

### 已证实的高频错误（禁止再犯）

以下错误在过去 14 天的会话中反复出现，多数来自跳过了上面的优先级。

| 错误做法 | 正确做法 | 为什么是错的 |
|---|---|---|
| 为了拿哥飞论坛的内容去问 `ask`（哥飞.ai） | 先用 `webcafe-forum.mjs chat-search`/`search` 拿原文 | 哥飞.ai 的语料**就是**群聊归档 + 站内教程，直接搜拿到的是原文，不经模型转述、不消耗额度 |
| 以为 `seo.web.cafe` 只有 kd/audit/serp 那几个工具 | 跑 `seo-webcafe.mjs --help` 或 `tools` | 21 个工具全部有归属了：有后端的都有命令，没后端的 4 个复刻成了本地命令，另 4 个附理由标注不做 |
| 为了算 KGR/TDK 去开网页或消耗配额 | 用本地命令 | `kgr`/`string`/`money`/`email` 是纯本地计算，零网络零配额且支持 `--batch` |
| 拿 `new.web.cafe` 的 HTTP 200 当「取到了」 | 看 `access` 字段 / 正文空不空 | 该站匿名**不返回 401**：照样给全部条目和作者名，只把正文抹成空串、票数归零 |
| 对 `kind:collect` 的悬赏只读 `answers[]` | 读 `collect.board[]` | 征集型的内容不在 answers 里；只读 answers 会对着 588 条榜单报「0 条答案」且不报错 |
| 用通用 `chatbot-drive.browser.js` 问哥飞 AI（seo.web.cafe） | 有 Cookie 用 `seo-webcafe.mjs chat`；没有就用 `gefei-ask.mjs` | 两条专用路径都封装过配额与完成判定；通用驱动会重踩已解决的坑 |
| 用 Claude in Chrome / 手动 OpenCLI 操作 Similarweb 面板 | `node similarweb-query.mjs` / `similarweb-batch.mjs` | 脚本已存在，手操浪费上下文且结果不可复现 |
| 用 Claude in Chrome / 手动 OpenCLI 操作 Semrush 面板 | `node semrush-overview.mjs` / `semrush-keyword.mjs` 等 | 同上 |
| OpenCLI 会话名用字面常量如 `work`、`backlink-panel` | `defaultSession('base')` 或会话名带 `$$` 后缀 | 多任务同时跑时撞名 → 拿到别人的页面，全程零报错 |
| 用沙箱浏览器访问需要登录的数据面板 | 用户的浏览器（通过 OpenCLI 或 Claude in Chrome） | 沙箱没有 cookie，返回的数据是匿名态，看起来正常但内容不同 |
| 手工去 GSC / Bing 后台点「提交站点地图」 | `node webmaster-sitemap.mjs <gsc\|bing> submit …` | 两个后台都有各自的坑（Bing 的输入框要先点开、GSC 的「提交」会和「提交反馈」撞词），手操每次重踩一遍 |
| 在项目里维护一份「要推给 IndexNow 的 URL 数组」 | `indexnow-submit.mjs` 默认从线上 sitemap 取 | 硬编码数组必然与实际发布的页面漂移，且漂移方向永远是「新页面没推」 |
| 把 IndexNow 推送写成「文档里的一条命令」交给人记 | 焊进项目自己的 `ship` 命令（见下方「静默收尾动作」） | 漏推不会让任何东西变红——**没有失败信号的遗漏最难自查**；且指向 Skill 目录的脚本换台机器就不存在 |
| 用 Claude in Chrome 手动逐个点 GSC 移除工具 | `node gsc-remove-urls.mjs --property sc-domain:xxx url1 url2 ...` | 脚本已存在，手操 6 个 URL 要点 30+ 次按钮且每次按钮位置漂移 |

### 静默收尾动作：焊进命令，不要交给人记（编码完成时必须自查）

**判据一句话：问「漏掉这一步，会有什么东西变红吗？」答案是「不会」，那它就不该由人来记。**

改完代码、准备出荷时，凡是命中下面这个形状的动作，**必须在同一个任务里焊进出荷命令**，
不允许以「记得跑一下 xxx」的形式交付：

> 主要工作做完之后**还必须做**、但**漏了不会有任何报错**的收尾动作。
> 典型：推送索引（IndexNow）、清 CDN 缓存、打版本标签、发 webhook、重新抓 OG 图。

这类动作的危险不在于难，而在于**失败是静默的**：新页面只是晚几天被发现，
构建绿、测试绿、页面 200，没有任何信号提示你漏了。

正确形态（三条都要满足，详见 [`search-platforms.md`](references/search-platforms.md)「挂进发布流程」）：

1. **脚本放进项目仓库**，不引用 Skill 目录——否则换台机器/CI 里那个路径不存在，
   而报错长得像「脚本坏了」而不是「少装了东西」；
2. **配置从项目内单一事实源读**，并把「两处必须一致」这类不变条件写成**断言**挂进
   `test` 任务，而不是写成源码注释拜托后人维护；
3. **接到出荷命令的后段**，让「不做」变成做不到：
   `"ship": "… && build && deploy && <收尾动作>"`。

出荷前自查：**这次改动新增或修改了线上可访问的 URL 吗？** 是 → 出荷命令里必须含索引推送。

### 本 Skill 自带

| 脚本 | 干什么 | 什么时候用 |
|---|---|---|
| `scripts/seo-webcafe.mjs` | **一个脚本覆盖 seo.web.cafe 全部 21 个工具**：`kd` 关键词难度+top9 盘面、`audit` 页面体检、`serp` 排名归因、`backlink` 外链估价、`worth` 网站估值、`history` 域名前世、`adsense` 过审预检、`chat` 站内 SEO Agent、`referring*` Stripe 引荐流量榜（不计配额）；**`translate*` 需求翻译器 / `mine*` 需求挖掘机 / `domain*` 起名+域名核验**（2026-08-24 补全）；**4 个本地命令 `kgr`/`string`/`money`/`email`**（纯本地计算、零网络零配额、可 `--batch` 批量）；`endpoints` 零配额普查、`tools` 列出确认无后端的工具及理由 | 问「这个词难不难做」「这盘面能不能进」「这条外链值不值」「这域名什么来历」「帮我想个站名」。零配置可跑，匿名 10 次/日。**本地那 4 个命令不消耗任何配额，可以放开批量跑** |
| **`scripts/demand/` 一整组（21 个）** | **需求挖掘取数**：榜单、差评、外包、广告、新词平台、竞品 sitemap、站群反查、词根库、域名画像。全部零依赖、`--json`/`--out` 统一 | 用户说「找几个关键词」「挖点需求」「最近有什么能做的」时。**先读 [`demand-sources.md`](references/demand-sources.md) 那张源→脚本路由表，不要逐个翻脚本** |
| `scripts/demand/revenue-site-audit.mjs` | **收入站案例复核薄编排**：调用现有 AITDK、Similarweb、Semrush、sitemap、KD 脚本，统一标明月份/国家/报告页，流量估算相差 >2 倍自动报警并生成 claim verdict 骨架 | 社交帖子或榜单声称「新站、月访、自然占比、MRR」时；它只整证据，不替采集器和人工因果审计 |
| `scripts/rankup-cli.mjs` | **Semrush / Similarweb 能力目录与可续跑取证入口**：`catalog` 看能力（`--modules` 展开工具箱树、`--gaps` 只看没摸到的地方），`capture` 抓一个报告，`audit` 按 manifest 逐页保存原图、全文 HTML、DOM、AX、解析结果、应用 JSON、网络结构和哈希回执 | 第一次摸平台功能、复查页面能力、或把已发现的页面清单重复跑一遍时；底层复用 OpenCLI 登录态。**判断「这个面板能不能拿到 X」先读 [`provider-capabilities.md`](references/provider-capabilities.md)，不要现开浏览器翻** |
| `scripts/gt.py` | Google Trends 统一入口：热度对比、地区分布、相关飙升词、每日热搜 | 问「XX 和 YY 哪个更火」「哪个国家有机会」「最近什么在涨」。**默认走浏览器路由，不需要 venv** |
| `scripts/gt-browser.mjs` | gt 的 OpenCLI 取数层：驱动已登录 Chrome，在 trends.google.com 页面里 fetch Trends 内部 widget 接口 | 一般不直接调，由 `gt.py` 转发。pytrends 的 429 就是靠它绕开的；要它工作先 `opencli doctor` |
| `scripts/chatbot-drive.browser.js` | 驱动只有网页形态的 AI Chatbot（要登录、按条扣费、**且确实没有 HTTP API**）。**seo.web.cafe 有 HTTP API，用 `seo-webcafe.mjs chat`，不要用这个** | 确认目标聊天工具没有 HTTP API 后才使用 |
| `scripts/cf-analytics-setup.mjs` | **开通 Cloudflare Web Analytics 并读回 beacon**。`status` 只读探测，`enable` 开启 | 新站上线后接测量时。不依赖任何第三方账号，应排在 GSC/GA 之前做 |
| `scripts/cf-zone-setup.mjs` | **把域名加进 Cloudflare（zone onboarding）并读回 NS 对**——Wrangler 没有 zone 命令，这是补它的缺口。`status` 只读探测，`create` 建 zone | 新域名接入 Cloudflare 时。**优先仍是操作用户浏览器**，本脚本是浏览器不可用时的退路 |
| `scripts/is-agentic.mjs` | AI Agent 就绪度：`scan` 评分+待修项、`diff` 与上次对比、`history` 历史。**先打 is-agentic.com 的报告 API，404 才回退 `npx is-agentic` 触发扫描**——两条路都只取「最新已存在的报告」，**没有强制重扫**，详见 `seo-growth.md` | 上线后评估 AI 代理友好度、每轮优化收尾对比改进。结果可 `--save` 存入 `.rankup/agentic/` |
| `scripts/cf-agent-baseline.mjs` | Cloudflare Radar「AI Agent Readiness」**全网基线**——不是站点扫描器（无 `url` 参数），返回全网聚合通过率 | 给 `is-agentic.mjs` 的单站分数配分母。`--compare` 把某次单站扫描的失败项与全网通过率并排 |
| **`scripts/webcafe-forum.mjs`** + `webcafe-transport.mjs` + `webcafe-rsc.mjs` | **new.web.cafe（哥飞论坛）全站取数**：`get <任意站内 URL>` 万能入口；悬赏问答（含 `collect` 征集榜单与提交理由）、经验 91 条 / 帖子 722 条 / 教程专栏 40 个、站内搜索、**14 个微信群归档搜索**、哥飞.ai 历史对话 | 要哥飞社区里的原始素材、经验帖、悬赏答案、群里的原话时。**先读 [`webcafe-forum.md`](references/webcafe-forum.md)**——这个站匿名不会 401，它返回 200 但把正文抹成空串 |
| `scripts/gefei-ask.mjs` + `gefei-chat.browser.js` | 驱动**用户已登录的浏览器**问哥飞 SEO Agent 并取回全文，不需要 `SEO_WEBCAFE_COOKIE`（那枚是 httpOnly） | 需要问哥飞但拿不到 Cookie 时。与 `seo-webcafe.mjs chat` 是两条路径，选哪个见 `references/seo-webcafe.md` |
| `scripts/gsc-remove-urls.mjs` | **GSC 批量提交「暂时移除网址」请求**。驱动用户已登录的浏览器操作 GSC 移除工具，逐个提交 URL。支持 `--file` 从文件读 URL 列表、`--property` 指定 GSC 资源、`--dry-run` 预览 | 废弃页面需要从 Google 搜索结果中移除时。GSC 没有公开的移除 API，只能通过 UI 操作 |
| `scripts/indexnow-submit.mjs` | **把站点 URL 推给 IndexNow**（Bing/Yandex/Seznam/Naver 共用一张网，Google 不参与）。URL 列表默认从线上 sitemap 取，`--generate-key` 生成密钥。**提交前先校验密钥文件**——密钥不可达时整批被丢弃而接口照样回 200 | 新站上线接索引推送时；之后每次内容变更部署完成后。零账号、纯 HTTP，可进 CI |
| `scripts/webmaster-sitemap.mjs` | **在 GSC 与 Bing Webmaster 里读/提交 sitemap**，驱动用户已登录的浏览器。`gsc\|bing status` 只读，`gsc\|bing submit` 提交 | 站长工具资源验证通过之后。GSC 无零配置 API；Bing 若已有 API key 则改走纯 HTTP，见 `search-platforms.md` |
| `scripts/clarity-setup.mjs` | **在 Microsoft Clarity 里建项目并拿到 project ID**（会话录制 / 热图），驱动用户已登录的浏览器。`status` 只读，`create` 新建 | 上线后接行为分析时。Clarity 的 REST API 只读不建项目，只能走 UI |
| `scripts/naver-setup.mjs` | **在 Naver Search Advisor 里注册站点、获取验证 meta 标签、提交 sitemap**。`status` / `register` / `submit-sitemap`。CAPTCHA 无法自动化，需要用户手动完成验证 | 韩国市场站点上线后接 Naver 站长工具时。Naver 内部 API 有 CSRF 保护，注册和 sitemap 提交走 UI 更稳定 |
| `scripts/ahrefs-setup.mjs` | **在 Ahrefs 里建项目、经 GSC 验证所有权、启用 Web Analytics 并取回 `data-key`**。`status` / `create` / `verify` / `enable-wa` | 上线后接外链视角与总访问量时。Ahrefs API v3 只有数据查询，项目管理只能走 UI |
| `scripts/seo-audit.mjs` | **AITDK 相当の全ページ SEO 監査**（零依赖、Node 20+）。title/desc/keywords/canonical/robots/charset/lang/h1/OGP/Twitter Card/構造化データ/画像 alt/リンク分析/hreflang、**キーワード密度（1/2/3-gram、日本語 `Intl.Segmenter` 対応）**。`--sitemap <url>` で全ページ一括、`--json` で機械可読、`--density-only` で密度のみ、`--fix-report` で修正リスト | **構建完成後の SEO 検証に必須**。阶段 7.5 闸门第 2、3 行（TDK + 关键词密度）的取数工具；阶段 8 每轮新页面上线后重跑。零配额、零登录、纯 HTTP fetch，可对 localhost dev server 或线上域名跑 |
| `scripts/registry.mjs` | 扫描各项目 `.rankup/` 重建跨项目资产登记表 | 开工前查「别的项目有没有现成的」；收工时刷新 |
| `scripts/review.mjs` | 项目记忆体检：缺失文件、超期记录、脚本体检、**生命周期检查点**（查漏补缺——哪些工具和环节还没跑过）、经验库信号 | `rankup review` 第一步；新引入 Skill 的老站第一件事就跑它 |
| `scripts/sessions.mjs` | 找出并浓缩本项目的 Claude Code / Codex 会话，供 review 提取信号 | `rankup review` 第二步，默认加 `--new-only` |
| `scripts/check-version.mjs` | Skill 版本检查与自更新 | 每次激活 |
| `scripts/validate-rankup.mjs` | 项目中立性与凭据泄露的机械门禁 | 改完 Skill 必跑 |

### backlink Skill：数据调研、浏览器自动化与外链的专项能力

**backlink 是 rankup 最重要的专项 Skill。** 下面列出它覆盖的全部能力领域，
你可以只用 rankup 来路由，到需要深入操作时再加载 backlink。

```bash
# 如果还没安装 backlink，先装上：
npx skills add yan-labs/yan-skills --skill backlink -g -y

# 需要深入操作时加载它（在对话中）：
/backlink
```

#### 能力一览：什么时候需要加载 backlink

| 你要做什么 | 对应脚本 | 是否需要加载 backlink |
|---|---|---|
| **查一个站的流量、渠道、同类站** | `similarweb-query.mjs` | 直接跑脚本即可；复杂场景或首次使用加载 backlink 读 `authorized-data-sources.md` |
| **批量筛几百个域名的流量** | `similarweb-batch.mjs` | 直接跑；首次使用加载 backlink 了解配额与续跑机制 |
| **查关键词搜索量、KD、CPC** | `semrush-keyword.mjs` | 同一国家最多 100 词用 `--bulk --db <cc>`；入选词单查全球量和主要国家 |
| **查域名自然流量、引荐域、关键词库** | `semrush-overview.mjs` | 直接跑脚本 |
| **导 Semrush 的四个无导出报表** | `semrush-report.mjs` | 加载 backlink 读 `authorized-data-sources.md` 了解分页与解析陷阱 |
| **批量 Semrush 有机流量** | `semrush-batch.mjs` | 直接跑脚本 |
| **从登录态后台抓表格（无 API）** | `harvest.browser.js` + `harvest-collect.sh` + `harvest-merge.mjs` | **必须加载 backlink** 读 `harvest.md`——虚拟滚动、节流、静默丢行的陷阱全在那里 |
| **探一个页面有没有提交入口** | `inspect-page.mjs` | 加载 backlink 读 `safety-policy.md` |
| **受控填表** | `safe-fill.mjs` + `release-submit-guard.mjs` | **必须加载 backlink** 读 `submission-lanes.md` + `safety-policy.md` |
| **外链机会发现、竞品反链分析** | `discovery-queue.mjs` + `harvest-commenters.mjs` | **必须加载 backlink** 读 `discovery-loop.md` |
| **外链投放台账与进度跟踪** | `ledger.mjs` (`stats` / `remaining` / `upsert` / `transition`) | **必须加载 backlink** 了解证据阶梯（submitted/public/indexed 每级都要证据）。`stats` 看覆盖率、`remaining` 看还差多少、`--ledger` 传给 `targets-select.mjs` 自动排除已发的 |
| **付费外链平台登记** | `paid-platform-registry.mjs` | 加载 backlink 读 `paid-platforms.md` |
| **外链质量评估、毒性检测** | 无专用脚本，靠参考文档 | **必须加载 backlink** 读 `link-quality-rubric.md` + `analysis-templates.md` |
| **100+ 行的批量提交 campaign** | `targets-select.mjs` + `submit-directory.mjs` | **必须加载 backlink** 读 `batch-campaign.md` |
| **引用第三方给的外链清单** | `third-party-list-ingest.mjs` | 加载 backlink 读 `instant-publish.md` 的第三方清单章节 |
| **OpenCLI 浏览器自动化的法律与陷阱** | `opencli-core.mjs`（defaultSession、batchBrowser） | 加载 backlink 读 `browser-runtime.md`——5 条法律与实测数据 |
| **只是用 OpenCLI 打开一个页面看一下** | 直接用 `opencli browser` | 不需要加载 backlink，按本 Skill 的会话命名规则即可 |

**判断原则：直接跑脚本不需要加载 backlink；需要读参考文档（法律、陷阱、流程）或操作外链相关工作流时必须加载。**

#### 数据面板的脚本速查

用户说「数据面板」「数据勘测」「查一下数据」「用 Similarweb 看看」「Semrush 拉一下」时，直接用脚本，不要打开浏览器手动操作：

| 问题 | 用哪个脚本 | 拿得到什么 |
|---|---|---|
| 这个站多大、流量从哪来、还有哪些同类站 | `node backlink/scripts/similarweb-query.mjs` | 总访问量、渠道构成、相似站、地理分布 |
| 几百个域名批量筛流量 | `node backlink/scripts/similarweb-batch.mjs` | 逐域名追加写盘，单域名 5 秒，可续跑 |
| 这个词多少量、多难 | `node backlink/scripts/semrush-keyword.mjs` | 分国家搜索量与 KD、CPC，**外加全球合计 `globalVolume`** |
| 这个站自然流量多大、有多少外链 | `node backlink/scripts/semrush-overview.mjs` | AS、自然流量、引荐域名数、关键词数——**只有分国家的，没有全球合计** |
| 这个站排了哪些词、主要页面、反链详情 | `node backlink/scripts/semrush-report.mjs` | 自然排名、主要页面、反链概览、关键词报表 |
| 批量域名有机流量 | `node backlink/scripts/semrush-batch.mjs` | 逐域名，与 similarweb-batch 同模式 |

#### 先查能力表，再决定开不开浏览器

**「这个面板能不能拿到 X」这个问题，答案已经写在
[`provider-capabilities.md`](references/provider-capabilities.md) 里了**——
2026-08-27 用真实登录态逐页点出来的：**Semrush 10 大工具箱 102 页、Similarweb 23 个模块**，
外加一节明确的「没摸到的地方」。**先查表，不要现开浏览器翻一遍。**

四条最省事的结论，先记住：

1. **两家的 API 和 MCP 全是死路，别再试。** 共享账号代理**出借的是会话，不是账号**；
   API key 和 OAuth 同意页都住在账号设置区，面板不会递出来。
   **浏览器抓取不是临时替代方案，它是这个账号形态下唯一正确的方案。**
2. **Semrush 有 49 个页面是「做」层**（写文章、发帖、建项目）——本项目**一个都不会用**。
   连同 Similarweb 那边，**约 60 页（占两平台总页数 40%）在全部工作流里一次都没出现过**，
   规划取数覆盖率时不要把它们算进分母。缺口与优先级见
   [`provider-script-gaps.md`](references/provider-script-gaps.md)。
3. **页面卡在「一直加载」时主动刷新重试**（刷 2–3 次才判 `unavailable`）。
   **绝对不要把「卡加载」写成「功能不存在」或「零流量」**——静默错数是这里最贵的错误。
4. **上一版审计报的 4 个「功能缺失」，3 个是误报**（PLA Research 存在、Link Building 是合并、
   Content Analyzer 是改名）。判「缺失」前必须走三步：搜界面名 → 试旧路径看跳转 → 查更新日志。

#### Rankup CLI：把探路结果变成可重复执行的清单

```bash
npx @yan-labs/rankup catalog semrush --json
npx @yan-labs/rankup catalog semrush --modules     # 展开工具箱 → 功能页树
npx @yan-labs/rankup catalog --gaps                # 只看两家没摸到的地方
npx @yan-labs/rankup capture semrush keyword-overview \\
  --keyword "photo signature resizer" --db us \\
  --out-dir .rankup/provider-audit/keyword-us \\
  --session rankup-semrush-keyword
npx @yan-labs/rankup audit similarweb \\
  --manifest .rankup/provider-audit/similarweb.json \\
  --out-dir .rankup/provider-audit/live/similarweb \\
  --session rankup-similarweb-audit --resume
```

- 一个任务固定一个明确的 `--session`；只操作自己的 session。看到别人的 session 不代表浏览器被占用，不得等待、复用或关闭它。
- 同一个平台首页最多用于首次启动一次。进入工具域名后始终复用当前 session 并走内页，不要每项报告重新经过首页。
- `audit` 的 manifest 既是页面目录也是续跑入口；可保留 `module`、`label`、`status`、`receiptPath`、`dataCompleteness` 供审计，人类字段不会传给网页。
- 每页证据固定为八件：`page.txt`、完整分块 `page.html`、DOM、AX、parsed、app JSON、network shape、原始 full-page screenshot，再加带 SHA-256 的 `receipt.json`。截图不做遮罩；只有 Cookie、登录令牌等可直接接管账号的凭据不落盘。
- 国家数据库不能只看默认美国。先看 global/country distribution，主要需求在别国时主动切到该国家库复核；抓取失败或权限不足不能写成零需求。

**两边的「流量」口径不同，对不上很正常，但对不上的具体原因要查清楚，不能止步于「口径不同」：**

1. **地理范围**——Semrush 域名维度给的是**一个国家库**（`--db`，省略也不是全球，只是落到 Semrush 自己的默认库），Similarweb 默认给**全球**。真实事故：同一个域名 Semrush 报 5,900/月（`--db us`）、Similarweb 报约 92,000/月，看着是 15 倍的矛盾，换算成同一地理范围（该站美国流量仅占约两成）之后倍数就收窄到个位数。关键词维度不受此限——Semrush 关键词有 `globalVolume` 字段，不必再拿多个 `--db` 求和。
2. **面板页面**——Similarweb 自己不同页面（如「网站表现」总量 vs「流量来源渠道」渠道加总）之间也能差 6–35%，报数字要写清楚是哪一页。
3. **口径定义**——Semrush 自然流量是**模型**（追踪到的关键词 × 搜索量 × 位次点击率），Similarweb 是**面板外推**，一个是模型输出一个是观测外推，不要相减或相除，各自标清楚。

4. **模型侧的失真有一条可判定的规律**——Semrush 的自然流量在**单个大头词以第 5–10 位
   撑起该站过半模型流量**时会高估 4–13 倍（泛型头词首页有搜索引擎自己的组件和 AI 答案，
   真实 CTR 远低于通用曲线）。**拿到域名自然流量后先拉它的排名词分布再决定信不信总数**，
   判据与实测表见 [`demand-sources.md`](references/demand-sources.md) 的 ②·六·四。

三条都对齐了还差几倍，才是真的矛盾，值得深入查；对不上先怀疑口径，不要先怀疑数据源坏了。方法细节见 `backlink/references/authorized-data-sources.md` 的「Semrush role」一节和 `rankup/references/experiences/webcafe-experiences.md` 十六·五。

### 落盘：抓到的数据不许留在下载目录

配合上面任一抓取脚本时，**首选本地接收端**（页面 `fetch` POST 到只监听 `127.0.0.1` 的服务，直接写进项目目录），退路才是下载目录 + `harvest-collect.sh`。完整规则见 `opencli` Skill 的 `references/data-extraction.md`。接收端脚本属于项目侧，在登记表里找现成的，不要重写。

## 安装、版本与自动更新

来源：[Skills.sh](https://skills.sh/yan-labs/yan-skills)

**先装 `opencli`。** 本 Skill 里凡是碰浏览器的动作——查数据面板、抓没有 API 的后台表格、
提交 sitemap、验证站长工具、问哥飞 AI——都落在它那一层：

```bash
npx skills add yan-labs/yan-skills --skill opencli -g -y
```

它还要求 OpenCLI 本体（CLI + 浏览器扩展）装**我们的构建**，来源是
[yan-labs/OpenCLI 的 Release](https://github.com/yan-labs/OpenCLI/releases/latest)，
**不是 Chrome 应用商店那个版本**——商店版默认前台，会抬窗口、抢走用户正在看的标签页，
而且这类失败不报错，只表现为「行为和文档不一样」。装法与判据见 `opencli` Skill。
`opencli doctor` 会在扩展版本过低时主动报这一条，**看到就照它说的做**。

```bash
# 全局安装
npx skills add yan-labs/yan-skills --skill rankup -g -y

# 全局更新
npx skills update rankup -g -y

# 项目级更新
npx skills update rankup -p -y
```

本 Skill 的发布版本记录在同目录 `skill.json`。项目的启用时间、已安装版本和最近检查状态记录在 `.rankup/skill-state.json`。

每次激活 `rankup` 时，定位当前 `SKILL.md` 所在目录并执行：

```bash
node "<rankup-skill-dir>/scripts/check-version.mjs" \
  --project-root . \
  --apply
```

检查脚本默认最多每 24 小时访问一次远端清单。它只更新 `rankup` Skill，不修改业务代码、不部署网站，也不覆盖项目 `.rankup/`。

自动更新在两种情况下必须拒绝执行并报告原因：

- **源码检出**（`source-checkout`）：仓库根存在 `.skill-source` 标记，说明当前运行的就是 Skill 源码本身，通常还被全局技能目录符号链接过来。此时更新会覆盖未发布的改动，并把符号链接换回实体目录副本，重新变回双份维护。该标记只在仓库根，`skills add/update` 只复制单个 Skill 子目录，因此不会随安装副本分发，也不会误伤项目级安装。
- **工作区有未提交修改**（`dirty-skill-checkout`）。

若链接已被 `skills update` 换成实体目录，在仓库里运行 `node scripts/link-skills.mjs` 即可恢复；被替换掉的实体目录会先备份而不是删除。

`installedAt` 是当前项目第一次由 `rankup` 初始化或识别时记录的启用时间；Skills CLI 没有可靠的安装后钩子，不得把它描述成 CLI 精确复制文件的时间。

## 强制启动协议

每次使用必须按顺序执行：

1. 读取同目录 `skill.json`，运行上面的版本检查；网络失败时保留当前版本继续，不得伪称已经更新。
2. 读取项目 `.rankup/INDEX.md` 和 `.rankup/skill-state.json`；目录不存在时按 [`references/project-memory.md`](references/project-memory.md) 初始化。
3. 读取 `.rankup/PROJECT.md` 及当前任务相关文件，不要无差别加载整个日志目录。
4. **三方对账门禁**：在回答“接下来做什么”或宣称任何进度之前，必须交叉核对三个来源——`git log --oneline -25`、真实路由/页面清单、线上 `sitemap.xml` 的全量 `<loc>`。`.rankup/plan.md` 的勾选框、仓库根的 `progress.md`、autopilot 状态文件都是**滞后指标**，读到“未开始”要先去代码里验证。三方结果与记录不一致时，先回写 `.rankup/` 再继续，不能只在回复里口头更正。Cloudflare、GSC、Stripe、索引、外链等外部状态一律以当前查询结果为准，知识库只当线索不当证据。
5. **读 [`references/checklists.md`](references/checklists.md) 与项目的 `.rankup/checks.md`**，确定当前在哪个环节、本环节还差哪几项。判断阶段以此为准，不凭印象。只读取需要的参考文件和专项 Skill。若本轮需要某类可复用操作（导数据、查词、抓 SERP 等），先查跨项目资产登记表看别的项目有没有现成脚本，有就取用，不要重写。
6. 实施请求范围内的工作，执行与风险相称的测试，并验证真实目标环境。
7. 更新 `.rankup/` 中的事实、决策、计划、发布或日志；同步 `INDEX.md` 的更新时间和导航。
8. **把本轮过掉的 check 逐条记进 `.rankup/checks.md`**，带证据与日期；本轮动过线上 URL 的，把标「动了 URL」的那批打回 ⬜。没记 = 下一轮会重跑一遍，且中间那段时间无人知道它到底过没过。

已有项目没有 `.rankup/` 时，只补建项目记忆，不得因此重新初始化技术栈。只有用户确实要求创建新站时才执行建站脚手架。

## 执行纪律（强制）

**用了这个 Skill，就意味着全权委托。不存在「要不要继续」「需要我处理吗」的问题——答案永远是「做」。**

### 主线只调度，sub agent 做事

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| **所有实际工作都派 sub agent**，主线只负责摸现状、分解任务、派发、收结果、回写 `.rankup/` | 主线上下文是全局视野，烧在一个站的构建日志里是浪费；sub agent 崩了不影响其他任务 | 在主线里跑 `pnpm run build`、`wrangler deploy`、逐行读源码改 key——把调度员变成了搬砖工 |
| 独立任务**必须并行派发**（一条消息多个 Agent 调用），不许串行等一个完了再派下一个 | 三个站各自接 Ahrefs WA，互不依赖，串行跑等于白白浪费 2/3 的时间 | 先派 agent 做 A 站，等它完成，再派 agent 做 B 站，再等，再派 C 站 |
| sub agent 的 prompt 必须**自包含**：要改哪个文件、改成什么、改完怎么验证、验证完怎么回写 `.rankup/` | sub agent 看不到主线上下文，信息不全就会猜，猜就会错 | prompt 只写「给某站接 Ahrefs WA」，没给项目路径、没给 data-key、没说怎么验证 |

### 全量执行，不问不等

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 用户一开口的目标、你中途发现的缺口、上轮留下的待办、本轮可能产生的新待办——**全部做完** | 这个 Skill 的用户不是在试探，是在执行；问一遍等于白白多一轮对话 | 做完主线任务后说「还有几项待办未处理，需要我继续处理吗？」 |
| **不请示、不确认、不汇报选项**。发现问题就修，发现缺口就补，补完在回复里说一句做了什么 | 请示的成本不是一句话，是用户切回来看、理解、回复、你再继续的整条链路 | 「发现某站的 key 是错的。要不要我修？」——废话，当然修 |
| 连锁任务不截断。A 做完发现 B 需要做，B 做完发现 C 需要做——**一路做到底** | 截断让用户变成人肉任务队列 | 修了 key，发现脚本有 bug，汇报 bug 然后等用户说「那你修一下」 |

### 人机验证：自动化到最后一步，不许甩给用户从头来

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 遇到 CAPTCHA / 人机验证 / 短信验证码等**无法自动化的节点**，**把前面所有能自动完成的步骤全部做完**——表单填好、选项选好、页面打开好——只把那一下点击留给用户 | 用户不应该重复做机器能做的事；一个 CAPTCHA 不是放弃整条流程的理由 | 「Naver 需要人机验证，请您手动去 searchadvisor.naver.com 注册站点、填入域名、选择验证方式、获取 meta 标签……」——把整条 SOP 甩给用户 |
| **必须用用户的浏览器打开到那个页面**（OpenCLI 或 Claude in Chrome），不是告诉用户一个 URL 让他自己打开 | 用户看到的应该是一个已经填好的表单，只差点一下；不是一段操作指南 | 在回复里写「请前往 https://xxx，然后输入 yyy，然后点击 zzz」 |
| 做完能做的之后，**明确告诉用户现在浏览器里哪个标签页、需要点什么** | 用户切到浏览器应该一眼就知道该干什么 | 「已打开页面，请完成验证」——没说在哪个标签页、没说点哪个按钮 |

**典型流程（以 Naver Search Advisor 注册为例）**：
1. 用 API 或浏览器自动化完成站点添加
2. 获取验证 meta 标签的 content 值
3. 把 meta 标签写进代码、构建、部署
4. 打开验证页面，填好所有字段
5. → **到这里才交给用户**：「浏览器里 Naver Search Advisor 标签页已打开，只需点击 CAPTCHA 然后点确认按钮」

这条规则适用于所有平台，不仅限于 Naver：Cloudflare 的 Turnstile、Google reCAPTCHA、任何短信验证码、任何需要人眼识别的步骤。**目标是让用户的操作量从「一整套 SOP」降到「一次点击」。**

### 收尾不留尾巴

做完之后的产出是**一段简报**，不是待办清单：

- 做了什么（每项一行）
- 验证结果（通过/失败）
- 如果有**确实无法自动完成的事项**（需要 CAPTCHA、需要用户的物理操作、需要付费决策），列出来并说清为什么不能自动做，**以及你已经自动化到了哪一步**（见上一节「人机验证」）

「还有 X 没做，要不要做？」这种结尾**禁止出现**。

## 可复用操作必须落成脚本

**任何需要第二次执行的操作，第一次跑通时就必须固化成脚本，不允许下次重新摸索。** 浏览器操作是最主要的适用对象：切换 GSC property、导出效果报告、在关键词工具里查一批词、抓 SERP 前十结构——这些每次重新试探都在重复烧上下文，且每次的做法都不一样，结果不可比。

判定与动作：

1. **判定**：操作满足“会再做一次”或“换个站/换个词就要重跑”时，即为可复用操作。一次性排查不适用。
2. **固化**：跑通后立即写入 `<project>/.rankup/scripts/<动词-对象>.mjs`（如 `gsc-switch-property.mjs`、`gsc-export-queries.mjs`、`serp-top10.mjs`）。脚本必须参数化（property、日期范围、词、国家），不得把某一次的具体值写死。
3. **登记**：在 `.rankup/INDEX.md` 记一行——用途、参数、依赖的登录态、已验证日期。
4. **复用**：之后先执行脚本，不重新摸索 DOM。
5. **维护**：脚本失败时**修脚本**，不是绕过它手工再点一遍。页面改版属于正常损耗，修完更新已验证日期。失败原因写进脚本头部注释，下次少走一遍。

脚本与它依赖的登录态、property ID、账号配置都属于项目侧，只放 `<project>/.rankup/`，不进本 Skill。本 Skill 只描述方法，不携带任何具体站点的操作参数。

## 浏览器与取数：规则在 `opencli` Skill 里

**凡是需要登录态的页面操作，必须驱动用户本机那个真实的、已登录的浏览器，
不得使用运行环境自带的沙箱浏览器。** 沙箱是干净的独立实例，没有用户的 cookie，
于是要登录的目标要么跳登录页，要么以匿名身份返回**看起来正常但内容不同**的结果
（配额更低、字段更少、国家库不同）——这种失败会伪装成「这个工具没有这项数据」，
而正确的结论其实是「你没登录」。

**判据：这个页面如果用无痕窗口打开，还是不是同一个东西？** 答案是「不是」，
就必须走用户的浏览器。

完整的机制、法律与踩坑清单在 **`opencli` Skill**——那是唯一事实源，本节只留判据：

```bash
npx skills add yan-labs/yan-skills --skill opencli -g -y   # 未安装时
```

| 你要做什么 | 读 `opencli` Skill 的 |
|---|---|
| 会话命名、标签页归属、「我的页面被抢了」 | `references/session-laws.md` |
| 点击/填表/等待/读取/截图 | `references/browser-driving.md` |
| 取数与**导出物落盘 SOP**（本地接收端、等齐、归并、manifest） | `references/data-extraction.md` |
| adapter 的编写与自修复 | `references/adapters.md` |
| `doctor` 红、桥接坏了 | `references/troubleshooting.md` |

### 四条最常被违反的，写在这里免得漏

1. **一个会话一个标签页，N 个页面就要 N 个会话名。** 同名会话共用同一个标签页——
   「标签页被别人抢了」只有这一个成因，且全程零报错。
2. **不要硬编码会话名，也不要在 Bash tool 里用 `$$`。**
   `$$` 在 Node 脚本里安全（同一个进程），在 Claude Code 的 Bash tool 里**每次调用都变**——
   第一条命令 `open` 的会话名和第二条 `eval` 的对不上，`eval` 对着空白新标签页执行。
   用描述性字面常量（`naver-birthstone`），或把 `S=$(uuidgen | cut -c1-8)` 存进文件再读回。
3. **不要加 `--window foreground`。** 后台是默认值，不需要显式传——它开在用户当前那个
   窗口里，不抬窗口、不切走他正在看的标签页，也不是无头模式（不会触发反爬）。
   前台会**把用户的活动标签页切走**，只有需要他亲自过验证码时才用。
   要把标签页完全挪出用户窗口用 `--window isolated`。
   （需要 OpenCLI 扩展 ≥ 1.0.32，`opencli doctor` 那行就是判据；旧版默认是前台，
   那种环境下每条命令都要显式带 `--window background`。）
4. **用完 `opencli browser <session> close`；sub agent 必须在退出前显式关。**
   崩溃时不会自动清理，残留会话在用户 Chrome 里看起来就是别人正在做的活儿。

### 抓到的数据不许留在下载目录

首选**本地接收端**（页面 `fetch` POST 到只监听 `127.0.0.1` 的服务，直接写进项目目录），
退路才是下载目录 + 落盘脚本。**接收端的端口不能写死**，理由和会话名不能写死完全同构：
端口被另一个任务占用时，常见的后台常驻写法会静默失败，而页面的 `fetch` 照样返回 200——
**打到的是另一个项目的接收端**。完整 SOP 见 `opencli` Skill 的 `references/data-extraction.md`。

落盘脚本属于项目侧，按上一节固化进 `<project>/.rankup/scripts/` 并登记到 `INDEX.md`。

## 跨项目资产登记表

各项目的 `.rankup/` 互不可见，默认是信息孤岛：A 项目已经写好的 GSC 导出脚本，在 B 项目里不会有人知道。登记表把这些资产索引到一处。

```bash
# 重建名单(扫描各项目 .rankup/,整表覆盖)
node "<rankup-skill-dir>/scripts/registry.mjs" scan --roots <存放项目的目录>

# 查看名单
node "<rankup-skill-dir>/scripts/registry.mjs" list
```

- **位置**：Skill 目录下的 `registry.md`，挨着 `SKILL.md`，用的时候一眼看得到（可用 `RANKUP_REGISTRY_PATH` 改道）。它必须写出项目名与绝对路径才有用，因此被 `rankup/.gitignore` 排除，并由 `scripts/validate-rankup.mjs` **断言绝不能被 git 追踪**——`.gitignore` 只是约定，一个 `git add -f` 就能绕过。名单也因此被豁免参与项目中立扫描，而这条豁免的唯一依据就是那条断言。
- **扫描根目录**：来自 `--roots`、环境变量 `RANKUP_PROJECT_ROOTS`，或 `~/.rankup/config.json` 的 `projectRoots`。绝不写死在脚本里。
- **生成而非手写**：每次 `scan` 整表重建，读到的永远是磁盘当前事实。手工维护的索引必然过期，这是已验证的反模式。
- **启动时读它**：本 Skill 激活后若发现当前任务需要某类可复用操作，先查名单看别的项目有没有现成的，有就去对应路径取，不要重写一遍。
- **只索引不复制**：名单不搬运内容。取用别的项目的脚本时连同参数约定一起看；登录态、property ID、账号配置不跨项目照抄。
- **回流信号**：某个脚本被第二个项目用上，说明它足够通用，考虑把**做法**提炼成规则回流本 Skill（仍然不带任何项目信息）。

## 命令

三个入口，覆盖「刚接手」「我现在该做什么」和「回头看」，用户只说 `rankup init` / `rankup check` / `rankup review` 即可，不必描述要做什么。

### `rankup check` — 我现在该做什么

**用户说 `rankup check` 或「现在该干嘛」「到哪一步了」时的唯一动作。**

1. 读 [`references/checklists.md`](references/checklists.md) 与项目的 `.rankup/checks.md`；
2. 跑一次 `review.mjs` 拿文件层面的缺口（只是线索，不是判定）；
3. 找到**第一个没过闸的环节**，逐项去真实代码、线上响应、后台读数里核对，得出还差哪几项；
4. **直接照着做**，不要把清单原样念给用户——这个 Skill 的用户不是在问路，是在执行。

逐项做完、逐项在 `.rankup/checks.md` 记 ✅ 与证据，做到本环节过闸，再进下一个环节。
遇到确实做不了的（要 CAPTCHA、要付费决策、要用户的物理操作），标 ⏸ 写清卡在哪、
**以及你已经自动化到了哪一步**，不要留一个悬空的空格。

### `rankup init` — 把项目接入 rankup

适用于全新项目，也适用于**已经做了很久但还没有 `.rankup/`** 的项目。后者是常态，不得因为缺记忆就重建技术栈。

1. **摸清现状再写字**：读 `package.json`、路由/页面清单、部署配置、`git log`，确认框架、技术栈、部署目标与真实生产域名。已上线的再取 `sitemap.xml`、`robots.txt`、首页与关键页的线上响应。
2. **查外部系统**：域名是否解析、Cloudflare/托管方是否在跑、GSC 是否接入、是否有支付。**一律实时查询，不采信任何文档里的说法。**
3. **建目录**：按 [`references/project-memory.md`](references/project-memory.md) 创建 `.rankup/` 全套。已有事实直接填，取不到的写 `待确认`，**不要猜**。`integrations.md` 用「接入清单跟踪」的完整平台表初始化，已上线的逐项实测填状态，未上线的全部 ⬜。
4. **已运行项目补基线**：记一次当前流量、索引、性能与收入基线到 `baseline.md`，作为后续对比的起点；同时做一轮技术体检写入 `audit.md`。
5. **定方向**：`roadmap.md` 写阶段目标与放弃条件，`plan.md` 写 P0–P2 及完成判定。
6. **建仓并推远端**（绿地项目在脚手架跑通后立刻做，不要等「做出点东西再说」）：
   先确认脚手架是否已自带本地仓库，避免重复 `git init`；提交前扫一遍将要入库的内容，
   凭据与账号配置一律不得入库；**远端默认私有**——未上线项目的仓库里带着选题、
   竞品调研与定价策略，公开等于把选题送人，要公开必须用户明确要求。
   `.rankup/` 随仓库一起提交，它是这个项目最贵的资产。细节见
   [`lifecycle.md`](references/lifecycle.md) 阶段 3 的「Git 与远端」。
7. **汇报**：填了什么、哪些是 `待确认`、哪些需要用户提供（账号授权、token、DNS 等）。凭据只登记名称与存放位置，真实值不入库。

已有 `.rankup/` 时 `init` 不覆盖，转为补齐缺失文件并提示用 `review`。

### `rankup review` — 回顾、查漏补缺、全盘验证

**review 的核心价值：把一个陌生的、或已经偏离 Rankup 预期轨道的项目，重新拉回正轨。**

三种场景：**定期回顾**（阶段结束时）、**接手补齐**（已有网站新引入 Skill 后立刻跑一次）和**轨道修正**（项目长期没有按 Skill 规范维护，一次 review 补全所有缺口）。先跑体检脚本拿机械结论，再全盘验证接入状态，最后处理需要判断的部分。

```bash
node "<rankup-skill-dir>/scripts/review.mjs" --project-root . --days 30
```

脚本只读不改，给出五块报告：

1. **缺失文件**：必需与建议的 `.rankup/` 文件。
2. **陈旧记录**：超过 N 天未更新的文件，对比同期提交数判断记忆是否落后于代码。
3. **脚本体检**：项目自有脚本有无已验证日期、是否参数化。
4. **生命周期检查点**：Skill 全部关键环节有没有走过——缺了哪个、用什么命令补、为什么需要。已上线项目（有 `infrastructure.md`/`integrations.md`/`agentic/` 任一）会额外检查上线后环节：

   | 检查项 | 证据文件 | 修复工具 |
   |---|---|---|
   | 关键词规划 | `keywords.md` ≥50B | `seo-webcafe.mjs kd` |
   | 路线图 | `roadmap.md` ≥50B | 手写 |
   | AI Agent 就绪度基线 | `agentic/*/` 有 JSON | `is-agentic.mjs scan --save` |
   | 技术审计（闸门 7 项）| `audit.md` ≥500B | `is-agentic.mjs` + `seo-webcafe.mjs audit/chat` |
   | 性能与流量基线 | `baseline.md` ≥200B | Lighthouse |
   | 平台接入记录 | `integrations.md` ≥100B | `cf-analytics-setup.mjs status` |
   | 基础设施记录 | `infrastructure.md` ≥50B | 手写 |
   | 迭代记录 | `iterations.md` | 手写 |
   | 优化实验记录 | `experiments.md` | `is-agentic.mjs diff` |

   **这张表就是 Skill 的"宝藏工具"发现机制**——新用户跑一次 review 就知道还有哪些零配置可跑的工具没用过。

5. **经验库信号**：重复条目、候选回流 Skill 的条目。

拿到报告后，**按生命周期检查点的待补清单顺序执行**——每补一个就产出真实证据，不是只建空文件。

再挖会话记录——**最有价值的经验往往还留在对话里，从没进过 `.rankup/`**：

```bash
# 先看有哪些会话、各自还有多少没读
node "<rankup-skill-dir>/scripts/sessions.mjs" --project-root . --days 14 --new-only

# 输出浓缩对话（只留人说的话与结论，丢掉工具调用与系统注入）
node "<rankup-skill-dir>/scripts/sessions.mjs" --project-root . --days 14 --new-only --dump

# 全部消化完之后，才落水位线
node "<rankup-skill-dir>/scripts/sessions.mjs" --project-root . --days 14 --mark
```

**默认加 `--new-only`。** 水位线按字节偏移记在 `.rankup/review-state.json`：上次 review 读到哪，这次就从哪接着读；同一个会话后续续聊也只读新增那段。不加的话每次 review 都会把同样的对话重读一遍，纯属浪费。

`--mark` 是**独立一步，必须等信号真的提取完再执行**。中途失败或输出被预算截断时不落水位，下次仍会重读那一段——宁可重读，不可漏读。

覆盖当前项目的 Claude Code 与 Codex 会话，按记录里的 `cwd` 归属，worktree 与含空格的路径都能认。读浓缩稿时找四类东西：

- **用户的纠正**——「不对，应该是……」后面那句通常就是一条该沉淀的规则。
- **验证过的结论**——附了证据的判断；只有猜测没有验证的不要收。
- **踩过的坑与其根因**——尤其是排查花了很久的，写清判据让下次一眼认出。
- **已经推翻旧记录的事实**——`.rankup/` 里的对应条目要**修订**，不是并列再写一条。

在此之上完成：

1. **对账**：`plan.md` 的勾选是滞后指标，与 `git log`、路由清单、线上 `sitemap.xml` 三方交叉；不一致先回写再继续。
   接着对着 [`references/checklists.md`](references/checklists.md) 过一遍全部环节闸门，未过闸的按环节顺序补，补完逐条记进 `.rankup/checks.md`。
2. **补生命周期缺口**：按体检报告「生命周期检查点」的待补清单，**逐项执行**——每项产出真实证据落进 `.rankup/` 对应文件，不是只建空文件。已上线项目典型补法：先跑 `is-agentic.mjs scan --save`（零配置，秒出），再跑 `cf-analytics-setup.mjs status`，再按 lifecycle.md 闸门逐项走。这一步是新引入 Skill 的老站最大的价值：一次 review 就能用上 Skill 里全部零配置工具。
3. **全盘验证接入**：对照上方「接入清单跟踪」的完整平台表，逐项线上实测。`curl` 首页 HTML grep 各平台 beacon、后台查验证状态、请求品牌资产路径。backlink 台账除外（无法自动验证）。SEO 元素（title / description / robots / OG / hreflang）、结构化数据、多语言标记在同一趟 `curl` 里一并检查。结果写回 `.rankup/integrations.md`：通过的 ✅ 记证据+日期，失效的改回 ⬜ 记原因，缺失的当场补接。**这是 review 把偏离轨道的项目拉回来的核心动作**——跑完这张表就知道差多少、从哪补。
4. **筛信号**：`experience.md` 里合并重复、删除已过时、修订被证伪的条目——**修订原条目，不并列保留冲突结论**。未验证的猜测直接删。
5. **提炼回流**：剥离站点后仍成立的规则回流本 Skill，证据出处与数字留在项目侧。回流内容不得含站名、域名、流量数字、property ID。
6. **补脚本**：本轮有没有第二次重复的操作却没固化？脚本头部的已验证日期是否过期、还能不能跑？坏了就修，不绕过。
7. **补文件缺口**：`roadmap.md` 是否断更、`iterations.md` 是否漏记失败轮次（失败必须写清被证伪的假设）。
8. **刷新名单**：`node "<rankup-skill-dir>/scripts/registry.mjs" scan --roots <存放项目的目录>`。
9. **产出**：一页结论——修了什么、删了什么、回流了什么、下一轮唯一改进。能当场修的直接修，不要只列清单。

## 经验库：规划与迭代之前先翻一遍

`references/experiences/` 是本 Skill 的**经验层**——从业者用真金白银换来的裁定，
按「规划网站 / 前期调研 / 后续迭代」三个使用时机组织。
**它和方法层是两种东西**：方法层回答「怎么操作」，经验层回答「该怎么判断、别人踩过什么坑」。

| 你现在在干什么 | 先读 |
|---|---|
| 还没定方向，在挖需求、找选题 | [`experiences/demand-discovery.md`](references/experiences/demand-discovery.md) |
| 方向定了，在规划怎么做、排优先级、定阶段目标与止损线 | [`experiences/zero-to-one.md`](references/experiences/zero-to-one.md) |
| 站已上线有流量，在决定这一轮改什么 | [`experiences/conversion.md`](references/experiences/conversion.md) |
| 技术 SEO、站群、多语言、索引类决策 | [`experiences/webcafe-experiences.md`](references/experiences/webcafe-experiences.md) |
| 技术 SEO、站群、多语言、索引类决策 | [`experiences/webcafe-topics.md`](references/experiences/webcafe-topics.md)（群友复盘，带数字与失败根因） |
| 要往经验库里加东西 | [`experiences/INDEX.md`](references/experiences/INDEX.md) 的「收录规则」 |

三条硬约束：

1. **经验层不带任何项目信息**——站名、域名、流量数字、account/property ID 一律不进这里；
   验证过的真实数字留在项目的 `.rankup/experience.md`。
2. **每条必须有出处与证据等级**（【实测】/【经验】/【猜测】）。
   标为【猜测】的不得当作结论执行，只能当待验证假设。
3. **这些是社群从业者的单点实践，不是官方文档。** 采纳前先问「我们这个站的前提条件
   和它一样吗」，按小步验证执行，验证结果（成立或不成立）写回项目侧。

## 任务路由

| 请求 | 必读参考 | 专项能力 |
|---|---|---|
| **「现在该做什么」「到哪一步了」「这个环节能不能过」「本轮还差什么」** | [`checklists.md`](references/checklists.md) —— 12 个环节的判据表，操作说明在各条指向的 md | 判断靠你自己核对真实状态；`scripts/review.mjs` 只给文件层面的缺口线索。**先过一遍清单再决定做什么，不要凭印象判断阶段** |
| 新站、SaaS、工具站、产品设计、架构 | [`lifecycle.md`](references/lifecycle.md)、[`cloudflare-stack.md`](references/cloudflare-stack.md)、[`project-memory.md`](references/project-memory.md) | 设计或开发相关 Skill |
| Cloudflare、Worker、数据库、存储、部署 | [`cloudflare-stack.md`](references/cloudflare-stack.md)、[`integrations.md`](references/integrations.md) | Wrangler、workers-best-practices |
| **上线后接测量与品牌资产（favicon/图标集、分析、站长工具）** | [`lifecycle.md`](references/lifecycle.md) 阶段 7.5、[`search-platforms.md`](references/search-platforms.md) | `scripts/cf-analytics-setup.mjs`、`scripts/indexnow-submit.mjs`、`scripts/webmaster-sitemap.mjs` |
| **新域名接入 Cloudflare、拿 NS、切 NS、DNSSEC** | [`cloudflare-stack.md`](references/cloudflare-stack.md) 的「8.5 接入域名」 | 优先驱动**用户的浏览器**点 Add a domain；不可用时 `scripts/cf-zone-setup.mjs` |
| 支付、订阅、账单、Stripe | [`integrations.md`](references/integrations.md)、[`project-memory.md`](references/project-memory.md) | stripe-best-practices |
| SEO、GSC、排名、关键词、CTR、索引、内容 | [`seo-growth.md`](references/seo-growth.md)、[`trends.md`](references/trends.md)、[`project-memory.md`](references/project-memory.md) | SEO 或研究能力 |
| **「Semrush/Similarweb 能不能查 X」「这个面板有什么功能」「这两家有什么区别」「该用哪个」「能不能走 API」** | [`provider-capabilities.md`](references/provider-capabilities.md) —— 实测测绘表 + 明确的知识边界 | `scripts/rankup-cli.mjs catalog`。**先查表再开浏览器**；判「功能缺失」前必须走该文件第二节末尾的三步核查。**API/MCP 已整条判死，见四·五节** |
| **「要不要给这个报表写个脚本」「先补哪个」「现有脚本有什么坑」** | [`provider-script-gaps.md`](references/provider-script-gaps.md) —— 能力 × 脚本覆盖矩阵、Top 10 优先级、10 个已知短板的兜/不兜判决 | **按工作流频率排，不按页面数排**。写新脚本前先读该文件第四节的硬约束和反面写法 |
| **接搜索平台：Bing Webmaster、GSC、Naver Search Advisor（韩国市场）、Yandex Webmaster、IndexNow、提交 sitemap、主动推送索引** | [`search-platforms.md`](references/search-platforms.md) | `scripts/indexnow-submit.mjs` + `scripts/webmaster-sitemap.mjs`。**IndexNow 排在站长工具前面**——它一样账号都不欠。DuckDuckGo 无需额外操作（用 Bing 索引） |
| **GSC 移除 URL、废弃页面从搜索结果中去掉** | — | `scripts/gsc-remove-urls.mjs`（驱动用户浏览器批量提交，GSC 没有公开 API） |
| **AI 搜索优化、AI Overviews、AI Mode、被 AI 引用、AEO、GEO、Preferred Sources、Discover 优化** | [`seo-growth.md`](references/seo-growth.md) section 三-B「2026 AI 搜索范式」 | 无需额外工具——Google 官方定论：AEO/GEO 就是 SEO |
| **AI Agent 就绪度、is-agentic、agent readiness、llms.txt、AI 代理优化、agentic score** | [`seo-growth.md`](references/seo-growth.md) section 三-B「AI Agent 就绪度」 | `scripts/is-agentic.mjs`（`scan` 评分、`diff` 对比、`history` 历史，零配置可跑） |
| 关键词难度、SERP 盘面、页面体检、域名与外链估值 | [`seo-webcafe.md`](references/seo-webcafe.md) | `scripts/seo-webcafe.mjs`（一个脚本覆盖全部工具，零配置可跑） |
| **前期调研、挖需求、「做什么方向」、反推别人在赚什么钱、选题验证** | 判断先读 [`experiences/demand-discovery.md`](references/experiences/demand-discovery.md)（裁定集），取数直接查 [`demand-sources.md`](references/demand-sources.md)（源 → 脚本路由表） | `scripts/demand/` 整组 + `scripts/gt.py` + `seo-webcafe.mjs kd` 收敛成词 |
| **「找几个关键词」「找点需求」「挖个新方向」「有什么新词的工具站能做」「挖游戏站/AI 产品」** | [`demand-sources.md`](references/demand-sources.md) —— **按「你现在缺哪一类信号」查表，不要凭印象挑站** | `scripts/demand/`。拿到候选后一律走该文件第十节的验证链路，别跳过 |
| **「这个词能不能做站」「这条赛道值不值得进」「窗口还开着吗」** | [`demand-sources.md`](references/demand-sources.md) **十·五**（能排上去 ≠ 能赚钱）+ **九·六**（自己扩的词表一定漏了一半）+ **②·六·四**（模型流量什么时候高估） | 量/KD/SERP 窗口三道闸之后**还有第四道**：查同类站真实流量并用 `seo-webcafe.mjs money` 折成钱。**漏掉它会得出 SEO 正确、商业错误的结论**。「新域两个月能进前十」要读成没有护城河，不是机会刚出现 |
| **小游戏站、游戏新词、监控游戏站、游戏 iframe、游戏站变现** | 加载 Rankup 的专项模块 `game-opportunity`；建站阶段再读 [`game-sites.md`](references/game-sites.md) + [`lifecycle.md`](references/lifecycle.md) | 通用 SOP/Checklist/脚本属于 Rankup 仓库；项目 `.rankup/` 只存平台清单、快照、取数和日报 |
| **0→1 怎么排优先级、「1」怎么定义、虚荣指标、要不要重构、什么时候止损、新站上线执行清单** | [`experiences/zero-to-one.md`](references/experiences/zero-to-one.md) | 无需工具，是裁定集。**接到「优化一下这个站」时默认打磨转化链路，不是重构架构** |
| **转化率上不去、访客不注册、注册不付费、定价怎么定、用户行为数据怎么提** | [`experiences/conversion.md`](references/experiences/conversion.md) | 无需工具，是裁定集。**动页面之前先查上游流量意图** |
| 老站救不救、多站会不会自我重复、品牌名不显示、KGR 怎么算、页面下限 | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) | 无需工具，是裁定集 |
| **这个词到底做不做、KD 低能不能上、新词还剩多少窗口、非英语版本值不值得** | [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 一 ~ 二 | 判断在这里，取数用 `seo-webcafe.mjs kd` + `gt.py`。**低 KD ≠ 能做；词龄 >30 天且竞品域名 >20 天就放弃** |
| **买外链要花多少钱、导航站外链值不值、新后缀域名发不出链、外链多快算太快** | [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 五 + `backlink` Skill | 有 KD→引荐域数量对照表和一张导航站过滤清单。**302/307 不传权重；`.ai` 在老博客上发出去的不是链接** |
| **多语言上线后流量暴跌、收录大规模掉、hreflang 配错** | [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 七 | 无需工具，是排查表。**先做 2–3 个语言；hreflang 用代码统一生成，不要手写** |
| **支付被关户、退款争议、API Key 被盗刷** | [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 八 | 无需工具，是裁定集。**支付通道必须有备份；退款要全退不要部分退** |
| **AI 改长文案只改了一半、AI 拒绝做某事、要不要照抄竞品** | [`webcafe-topics.md`](references/experiences/webcafe-topics.md) 十 | 无需工具。**需求可以借鉴，代码/UI/素材/品牌不能抄** |
| **排名起不来、被 K 站/deindex、GSC 报索引异常、首页覆盖了太多词、新站排名波动** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 十七 ~ 十九 | 无需工具，是裁定集。**新词上线 2–4 周内不要改页面** |
| **外链发哪里、相关性 vs 数量、nofollow 要不要、发了怎么验收、抄竞品外链** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 二十 + `backlink` Skill | 判断在这里，执行在 `backlink`。**抄竞品外链要按「首次发现日期从旧到新」排** |
| **AdSense 申请被拒、千展偏低、要不要加会员、Adsterra、第三方 API 成本、Creem 税** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 二十二 | 无需工具，是裁定集。**AdSense 先传 ads.txt 验证、别急着点「申请审核」** |
| **什么时候该发布、要不要做差异化、要不要先做登录注册支付** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 二十三 + [`zero-to-one.md`](references/experiences/zero-to-one.md) | 无需工具，是裁定集。**核心功能先推出去，登录/支付/性能后置** |
| **网站打不开、CF Pages 无效路径返回首页、图片慢、Vercel 绑域名跳两次、按国家投广告** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 二十四 | 无需工具，是排查表。**CF Pages 根目录必须有 `404.html`，否则被当 SPA** |
| **GA 里 direct 占大头是不是被刷量** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 二十五 | 无需工具。**用停留时间/人均页面数/跳出率三项对比其他渠道** |
| **多语言怎么上、URL 结构、`<html lang>`、hreflang、语言检测与跳转、中文繁简分治** | [`webcafe-experiences.md`](references/experiences/webcafe-experiences.md) 三·五 + [`seo-growth.md`](references/seo-growth.md)「多语言站架构参考（Apple 模型）」+ [`lifecycle.md`](references/lifecycle.md) 阶段 3 第 5 条 | 无需工具，是规则集。**核心禁令：不得根据 IP 自动跳转语言** |
| 搜索热度对比、地区分布、相关飙升词、每日热搜、模糊方向扩词并收敛成可做站的词 | [`trends.md`](references/trends.md) | `scripts/gt.py`（默认走 `gt-browser.mjs` 的浏览器路由，零 venv；`--via pytrends` 可切回匿名 HTTP） |
| 从登录态后台批量取数（没有 API / API 收费 / 导出扣点数） | [`integrations.md`](references/integrations.md) | **加载 backlink**（`/backlink`），读 `references/harvest.md`。未安装：`npx skills add yan-labs/yan-skills --skill backlink -g -y` |
| **「数据面板」「数据勘测」「查一下这个站/这个词的数据」** —— 用户说这些词时指的是第三方数据平台 | — | **直接跑脚本**（见上方「数据面板的脚本速查」），不要打开浏览器手操。首次使用或遇到问题时**加载 backlink** 读 `authorized-data-sources.md` |
| **要一整条流的正文**（722 条帖子 / 91 条经验），不是单条 | [`webcafe-forum.md`](references/webcafe-forum.md) | `webcafe-forum.mjs bodies topics --out f.jsonl`。**可续跑**；站点会限流（表现是重定向到登录页，不是 429），脚本连撞 5 次即熔断 |
| **哥飞论坛（new.web.cafe）的任何内容**：悬赏答案、经验帖、教程、帖子、站内搜索 | [`webcafe-forum.md`](references/webcafe-forum.md) —— **先看第一节**：匿名不报错，只是把正文换成空串 | `scripts/webcafe-forum.mjs get <url>`（万能入口，认不出的 URL 也能退回通用抓取） |
| **「哥飞群里怎么说的」「社群里有没有讲过 X」** | [`webcafe-forum.md`](references/webcafe-forum.md) 第八节 | `webcafe-forum.mjs chat-search "词"` —— 14 个微信群归档，**就是哥飞.ai 的知识库**。拿原文、不消耗任何 AI 额度，优先于 `ask` |
| **需求翻译 / 需求挖掘 / 给新站起名并核验域名** | [`seo-webcafe.md`](references/seo-webcafe.md) 的「translate / mine / domain 补全」一节 | `seo-webcafe.mjs translateSearch`（字段是 `query`）· `mineSearch`（字段是 **`keyword`**，别抄反）· `domainIntent` → `domainName` → `domainCheck` |
| **算 KGR/EKGR/KDROI、查 TDK 长度、拆解收入目标、批量提邮箱** | 同上「确认没有后端的工具」一节 | `seo-webcafe.mjs kgr` / `string` / `money` / `email` —— **纯本地、零配额、支持 `--batch`**，和 `kd` 串起来能对一整批词算投入产出 |
| **问哥飞 AI / seo.web.cafe 的 SEO Agent** | [`seo-webcafe.md`](references/seo-webcafe.md) 的「两条取答路径怎么选」 | 有 `SEO_WEBCAFE_COOKIE` → `seo-webcafe.mjs chat`（纯 HTTP，可无人值守）；只有登录态浏览器 → `gefei-ask.mjs`（那枚 Cookie 是 httpOnly，取不出来）。**两条是互补不是替代**；都不要用通用 `chatbot-drive.browser.js` |
| 其他只有聊天网页形态的 AI 工具（要登录、按条扣费、**确认没有 HTTP API**） | [`integrations.md`](references/integrations.md) 的「网页版 AI Chatbot 取答」 | `scripts/chatbot-drive.browser.js`——仅限确认没有 HTTP API 的工具 |
| **发 Product Hunt / 产品发布平台、排期上线、画廊图上传** | [`product-launch.md`](references/product-launch.md) | 需要能设置 file input 的浏览器连接器；**不要点上传按钮**（会弹系统对话框冻死标签页） |
| 外链、分发、竞品引用域 | [`integrations.md`](references/integrations.md)、[`seo-growth.md`](references/seo-growth.md) | **加载 backlink**（`/backlink`）。未安装：`npx skills add yan-labs/yan-skills --skill backlink -g -y` |
| 付费外链平台、「竞品在哪买的链接」、投放平台估价 | [`integrations.md`](references/integrations.md) | **加载 backlink**（读 `references/paid-platforms.md`，喂 `data/paid-platforms.json`） |
| 复盘、经验沉淀、自我进化、规则升级 | [`evolution.md`](references/evolution.md)、[`project-memory.md`](references/project-memory.md) | 必要时使用独立 checker |
| 已有项目下一步、迭代、排障 | [`project-memory.md`](references/project-memory.md) 加任务相关参考 | 按缺口选择 |

找不到合适能力时，先按 [`integrations.md`](references/integrations.md) 使用 find-skills 搜索，不要先在 `rankup` 中复制一个新的专项 Skill。

## 网站生命周期

完整输入、动作、产出和完成门槛见 [`references/lifecycle.md`](references/lifecycle.md)。总流程为：

0. 恢复项目上下文并与真实状态对账。
1. 调研用户、需求、竞争、关键词和付费机会。
2. 定义产品、页面、数据模型、架构和实施计划。
3. 初始化或审计 Monorepo；新站使用批准的 TanStack Start 脚手架。
4. 建立 Cloudflare SSR、API、数据、存储、环境和 bindings。
5. 小步开发，完成类型、测试、构建和迁移验证。
6. 按需接入 Stripe、邮件、分析、搜索平台等专项能力。
7. 部署并验证真实域名、SSR、API、数据、上传、鉴权和回调。
8. 执行技术 SEO、内容、索引和转化优化。
9. 分析并执行合规的分发与外链工作。
10. 监控、实验、复盘、记录并进入下一轮。

已有网站从当前相关阶段进入，不要求从阶段 1 重走全部流程。

## 默认建站栈

新建项目默认使用：

```bash
pnpm dlx shadcn@latest init \
  --preset b1D0eCA4 \
  --template start \
  --monorepo \
  --rtl \
  --pointer
```

默认采用 Cloudflare-first：

- TanStack Start SSR、API 与服务端逻辑：Workers。
- 关系型和事务型数据：D1。
- 文件、图片、导出物和用户上传：R2。
- 缓存与读多写少配置：KV，不作为事务真源。
- 异步和多步骤任务：Queues / Workflows。
- 强一致协调与有状态实例：Durable Objects。
- 真实密钥：Worker Secrets、Cloudflare Secrets Store 或 CI Secrets。

资源必须按实际需求启用，不因“以后可能需要”提前创建。具体配置、环境隔离、迁移和线上验证见 [`references/cloudflare-stack.md`](references/cloudflare-stack.md)。

## `.rankup/` 项目记忆

`.rankup/` 是当前网站的**一部持续维护的 Wiki**，不是日志堆，也不是 Skill 发布目录。
日志回答「某天发生了什么」，只追加；Wiki 回答「现在什么是真的、为什么」，**就地修订**——
被推翻的说法要在它原来的位置改掉，而不是在更新的地方另说一遍。完整结构、时效契约和提升路径见 [`references/project-memory.md`](references/project-memory.md)。

最低要求：

- `INDEX.md`：导航、推荐阅读顺序、最近更新时间。
- `PROJECT.md`：用户、定位、商业模式、目标和非目标。
- `architecture.md`：应用、数据、服务边界。
- `infrastructure.md`：环境、域名、Cloudflare 资源和非敏感 bindings。
- `integrations.md`：**所有平台接入的唯一看板**。每项标 ✅（已接+证据+验证日期）/ ⬜（待做）/ ❌（不接+裁决依据）。完成一项立刻打勾，`rankup review` 逐项线上实测验证。格式和规则见下方「接入清单跟踪」。
- `secrets.md`：只记录名称、用途、环境、保管位置、负责人、访问与轮换状态。
- `skill-state.json`：本地版本、启用时间、检查与更新时间。
- `checks.md`：**环节闸门的状态**——一个环节一段，每条 check 标 ✅ / ⬜ / ⏸ / ❌ 加证据与日期。格式见 [`references/checklists.md`](references/checklists.md)。它只存状态，判据在 Skill 侧，两边不得各存一份。
- `roadmap.md`：长期方向、阶段目标、各阶段的判定条件与放弃条件。跨会话可续，不随单轮任务改写。
- `iterations.md`：每轮迭代一段——做了什么、判据是什么、结果、下一轮唯一改进。失败轮次同样要记，且必须写清被证伪的假设。
- `scripts/`：可复用操作脚本（见「可复用操作必须落成脚本」）。
- `experience.md`：本站可复用结论的完整原文，含证据出处与数字。
- `baseline.md`、`keywords.md`、`decisions.md`、`audit.md`、`plan.md`、`experiments.md`、`releases.md`。
- `journal/`：按日期记录有复用价值的实施、运营、排障和增长过程。

**沉淀义务与是否调用本 Skill 无关。** 只要项目里存在 `.rankup/`，该项目中任何任务——不限于 SEO，包括功能开发、重构、排障、发版——完成后都必须回写可复用结论、裁决与长期规划。判据是“下次遇到同类问题能否少走一遍”，不是“这轮有没有走 rankup 流程”。用户没有显式要求也要写，写完在回复里提一句即可，不必请示。

严禁在 Skill、`.rankup/`、Git、测试或回复中保存真实密钥、token、密码、私钥、webhook secret、支付敏感数据或个人敏感信息。

### 接入清单跟踪（强制）

`.rankup/integrations.md` 是项目所有平台接入的**唯一看板**——做了什么、没做什么、为什么不做，一张表说清。和 backlink 台账同理：每完成一条外链就记一条，每完成一项接入就打一个勾。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 完成一项接入，**立刻**打 ✅ 并写证据和验证日期 | 不记就等于没做，下次 review 会重新来一遍 | 接完 Clarity 但没记，review 判定「未接入」又走一遍流程 |
| `rankup review` 必须**线上实测**逐项验证，不采信勾 | 代码改了、键换了、部署覆盖了——✅ 不代表线上还活着 | 清单写着 GA4 ✅，线上 HTML 里 script 被删了三个月没人发现 |
| `rankup init` 用完整清单初始化全部 ⬜ | 新项目一开始就知道要做多少事，不靠记忆 | 建站时忘了接 IndexNow，上线两个月没被 Bing 收录 |
| 「不接」标 ❌ 并写裁决依据 | 区分「还没做」和「决定不做」，review 不会反复催 | AdSense 标了 ⬜，每次 review 都建议接入，其实早就决定不挂广告 |

已上线站点的清单至少覆盖以下平台（`rankup review` 逐项验证）：

| 类别 | 平台 | 验证方式 |
|---|---|---|
| 托管方分析 | Cloudflare Web Analytics | `curl` 线上 HTML grep `cloudflareinsights` |
| 产品分析 | GA4 | `curl` 线上 HTML grep `gtag` 或 `googletagmanager` |
| 行为分析 | Microsoft Clarity | `curl` 线上 HTML grep `clarity.ms` |
| 外链视角 | Ahrefs Site Explorer | Ahrefs 后台查项目验证状态 |
| 外链视角 | Ahrefs Web Analytics | `curl` 线上 HTML grep `analytics.ahrefs.com`；Dashboard「总访问量」的 **G** 图标是 Google 估算，WA 脚本是第一方实测，两者并存不冲突 |
| 搜索平台 | Google Search Console | 后台查验证 + sitemap 状态 |
| 搜索平台 | Bing Webmaster | 后台查验证 + sitemap 状态 |
| 搜索平台 | Yandex Webmaster | `curl` 线上 HTML grep `yandex-verification` |
| 搜索平台 | Naver Search Advisor | `curl` 线上 HTML grep `naver-site-verification` |
| 索引推送 | IndexNow | `curl` 线上密钥文件 HTTP 200 |
| 品牌资产 | favicon / manifest / icons | `curl` 各路径 HTTP 200 |
| SEO 元素 | title / description / robots / OG | `curl` 线上 HTML grep 各标签 |
| 结构化数据 | JSON-LD（WebSite / Organization） | `curl` 线上 HTML grep `application/ld+json` |
| AI 就绪度 | is-agentic | `is-agentic.mjs scan` |
| 多语言 | hreflang / `<html lang>` | `curl` 线上 HTML 检查标签存在且值正确（仅多语言站点） |

## 令牌统一放 Skill 根目录的 `.env`

**本 Skill 依赖的第三方令牌，只有一份，放在 Skill 根目录的 `.env`，所有项目共用。**

```
<rankup-skill-dir>/.env      # KEY=value，每行一个；已被本仓库 .gitignore 排除
```

为什么是这里而不是各项目自己存：这些令牌属于**工具账号**（关键词难度、SERP、体检这类第三方服务），不属于任何一个站点。放进项目就会出现同一个令牌在 N 个项目里各存一份，过期时要改 N 处，而漏掉的那几处会以“配额用尽”“未授权”的面貌出现，排查方向完全错。放在 Skill 这一层，一处更新，全部项目立刻生效。

与项目侧 `secrets.md` 的分工不变，且不冲突：

| | 放什么 | 例子 |
|---|---|---|
| Skill 的 `.env` | **跨项目的工具账号令牌真实值** | 关键词/SERP 服务的 API 令牌 |
| 项目的 `secrets.md` | **本项目专属凭据的名称、用途、保管位置**，绝不写真实值 | 站点的部署密钥、支付密钥 |

规则：

1. **必须被 `.gitignore` 排除，且要断言。** 只写进 `.gitignore` 不够——一个 `git add -f` 就能绕过，所以由 `scripts/validate-rankup.mjs` 断言它不被 git 追踪，违反即构建失败。这与登记表 `registry.md` 用的是同一条防线。
2. **脚本读取顺序统一为：环境变量优先，再退到 Skill 的 `.env`。** 两处都读得到时以环境变量为准，便于临时覆盖。
3. **调用方脚本必须和驱动脚本用同一套解析。** 只看环境变量的调用方会在令牌明明配好的情况下判定“没有令牌”，退回匿名档并撞上配额，而报错却在教人去设一个已经设好的变量——这类误诊极难排查，属于必须避免的失败形态。
4. **令牌失效时更新这一个文件，不要在项目里另建副本。** 发现某处读不到，正确动作是修读取逻辑，不是再抄一份。
5. **真实值不出现在任何回复、日志、提交或落盘数据里。** 需要说明时只说键名与所在文件。

安装本 Skill 后 `.env` 不存在是正常状态：首次需要令牌时创建它，写入键值即可，无需其他配置。

## 完成标准

一次 `rankup` 工作只有同时满足以下条件才算完成：

1. 用户要求的产出已经存在。
2. 相关类型检查、测试、构建或迁移验证通过。
3. 若涉及发布，真实线上目标和关键路径已验证；上传成功或 Worker Ready 不能单独证明完成。
   若本轮初始化了绿地项目，**远端仓库必须存在且当前状态已推送**——
   只存在于单机上的脚手架不算完成。
4. **本环节 [`checklists.md`](references/checklists.md) 的 check 全部过闸**，本轮过掉的每一项都在 `.rankup/checks.md` 里记了证据；确实做不了的标 ⏸ 并写明原因。
5. 相关 `.rankup/` 文件已更新，过时的交叉引用已一并修正。
6. 说明完成内容、验证证据、仍存在的风险和需要用户处理的外部事项。

## 经验回流与版本升级

详细的失败分类、证据阶梯、适应性重试、规则晋升和淘汰流程见 [`references/evolution.md`](references/evolution.md)。

- 只对当前项目成立的事实、数字和排障过程写入项目 `.rankup/`。
- 换一个项目仍成立且经过验证的规则，才可回流本 Skill 的相关参考文件。
- **本 Skill 必须保持项目中立与机器中立**：站点名、域名、流量数字、证据出处、account/property ID、本机路径与代理、凭据位置一律不进 Skill。回流一条经验时只带走剥离站点后仍成立的规则，证据留在项目侧的 `experience.md`。此约束由 `scripts/validate-rankup.mjs` 断言，违反即构建失败。
- 不记录未验证猜测；若旧经验被证伪，应修订原条目而不是并列保留冲突结论。
- patch：文字、兼容性修复和小经验补充。
- minor：向后兼容的新工作流、集成或模板。
- major：目录协议、核心行为或兼容性发生破坏性变化。
- 发布新版本时，同时更新 `SKILL.md` 的 `metadata.version`、`skill.json`、验证脚本预期和 README。
