# seo.box：一张外部工具清单，用来给 rankup 的工具地图做对账

## 先说清它是什么，免得按错的期待去用

**[seo.box](https://seo.box/) 不是工具站，是一张单页静态导航。**
全站一个 HTML、28 条外链、三个分区（工具 16 条含一条重复、浏览器扩展 8 条、博客 4 条），
**没有 API、没有子页、没有 sitemap、没有登录态、没有任何自己的计算**。
`robots.txt` 只有一条空 `Disallow:`，`/sitemap.xml` 返回 404。（实测 2026-08-29）

所以**不要把它当数据源，也不要写脚本去抓它**——抓回来的就是那 28 个域名，
而这 28 个域名此刻已经全部誊在下面这张表里了。它对 rankup 的唯一价值是**外部对账**：
一份别人整理的「做 SEO 该有哪些工具」清单，拿来逐条比对我们缺不缺，
比自己凭印象回忆要可靠。这一节记录的就是那次对账的结论。

**下次再遇到同类导航站（工具聚合页、awesome 列表、"100 个 SEO 工具"贴），
按同一个套路处理：不接入，只对账，把结论写成「已覆盖 / 接了 / 不接 + 裁决依据」三态。**

## 对账结果：28 条逐条判定

判定口径与 `.rankup/integrations.md` 一致：**✅ 已覆盖**（rankup 里已有等价或更好的路径）/
**➕ 值得接**（真缺口，本轮已处理）/ **❌ 不接**（附裁决依据，`rankup review` 不要反复催）。

### 工具区（16 条）

| 工具 | 判定 | 依据 |
|---|---|---|
| Google Search | ✅ | [`demand-sources.md`](demand-sources.md) 第一·五节的「亲眼看首页」已经是段 1 硬 check，且规定了地区与语言必须显式指定 |
| Similarweb | ✅ | `backlink/scripts/similarweb-query.mjs` / `similarweb-batch.mjs`，能力边界见 [`provider-capabilities.md`](provider-capabilities.md) |
| Semrush | ✅ | `backlink/scripts/semrush-*.mjs` 一组 |
| Ahrefs（主站） | ✅ **且被低估了** | 见下方「会员实测」一节：免费 AWT 档的 Site Audit 是完整的，`scripts/ahrefs-site-audit.mjs` 取它 |
| Ahrefs Keyword Difficulty Checker | ❌ | KD 已有两条更好的路：`seo-webcafe.mjs kd`（带 top9 盘面，零配置）与 `semrush-keyword.mjs`（带 `globalVolume`）。Ahrefs 免费版一次一个词、要账号、给不出盘面，接了是**第三个口径**，只会制造对不上的数字 |
| Ahrefs Backlink Checker | ❌ | 同上。外链走 `backlink` Skill 的既有链路（Semrush 引荐域 + `ledger.mjs` 证据阶梯）。免费版只给 Top 100 外链且要注册，**不足以支撑任何判断，却足以让人以为查过了** |
| Ahrefs Website "Authority" Checker | ❌ | AS/DR 这类第三方权重分在 rankup 里只作为**相对参照**出现，`semrush-overview.mjs` 已经给 AS。再引一个厂商的分数会诱发跨厂商比大小，那是无意义的 |
| WooRank SEO Health Checker | ❌ | 站点体检已有两条自有路径：`scripts/seo-audit.mjs`（全站逐 URL、零配额、可对 localhost 跑）与 `seo-webcafe.mjs audit`。WooRank 免费额度极小且要注册，**覆盖不了「全站每一个 URL」这条闸门 2 的硬判据** |
| Google Search Console | ✅ | `scripts/webmaster-sitemap.mjs gsc`、`scripts/gsc-remove-urls.mjs`，见 [`search-platforms.md`](search-platforms.md) |
| Google Analytics（清单里重复了两次） | ✅ | 接入清单里的 GA4 一行，验证方式 `curl` grep `gtag` |
| Microsoft Clarity | ✅ | `scripts/clarity-setup.mjs`，见 [`analytics-platforms.md`](analytics-platforms.md) 第 1 节 |
| Google Tag Manager | ❌ | 本栈是 TanStack Start SSR，埋点直接进 `<head>`，**引入 GTM 等于多一层「线上到底加载了什么」的不确定性**，而接入清单的验证方式恰恰是 `curl` 线上 HTML grep beacon——GTM 会让这条验证失效 |
| PageSpeed Insights | ➕ | **本轮补上**：`scripts/pagespeed.mjs`，**走网页版 pagespeed.web.dev，不走带 key 的 API**（2026-08-31 改）。理由见下一节 |
| GTmetrix | ❌ | REST API 要登录拿 key，免费账号只给 **5 个 trial credit**，之后按 plan 日额度补（实测 2026-08-29 读其 API 文档）。同样的指标 PageSpeed 网页版**连 key 都不要**就给了，还多给 CrUX 现场数据与样本量档位 |
| WhereGoes（重定向追踪） | ➕ | **能力值得要，网站不值得用**：`curl -sIL` 本地就能完整打印跳转链，零网络依赖、可进 CI、可批量。见下方「重定向链」一节 |
| Similarweb（重复出现于扩展区） | ✅ | 同上 |

### 浏览器扩展区（8 条）

扩展这一类**天然与 rankup 的浏览器纪律契合**：它们装在用户那个已登录的 Chrome 里，
而 rankup 本来就规定「需要登录态的页面操作必须驱动用户本机浏览器」（见 `opencli` Skill）。
多数扩展不能被脚本调用，只在人眼看页面时有用，判定是「给人用，不进自动化链路」。**唯一的例外是 AITDK**：它的分析面板是一个跨源 iframe，opencli 能直接读，2026-09-11 起已被 `scripts/aitdk-opencli.sh` 全自动驱动（见下方「AITDK 面板全自动取数」一节），所以它既给人用，也进自动化链路。

| 扩展 | 判定 | 依据 |
|---|---|---|
| Detailed SEO Extension | ➕ 建议用户装 | 免费。在**人工复看 SERP 首页**（段 1 与段 7 都有这条 check）时，一眼看到对方的 TDK / H 结构 / schema，比开脚本快得多。属于「省人的时间」，不属于取数链路 |
| Ahrefs SEO Toolbar | ❌ | 要 Ahrefs 账号，且给的 DR/UR 与上面「不引第三方权重分」的裁决冲突 |
| Similarweb Website Traffic Rank | ❌ | 数据与 `similarweb-query.mjs` 同源，脚本已覆盖且可复现 |
| Similarsites Finder | ❌ | 同类站发现走 `similarweb-query.mjs` 的 similar sites 字段，已在脚本里 |
| Keywords Everywhere | ❌ | 付费按量。其站点确实有 API 与 MCP Server 入口（实测 2026-08-29），但我们的词量口径已经是 Semrush + seo.web.cafe 双源，**第三个付费口径的边际价值为负** |
| WooRank Extension | ❌ | 同 WooRank 主站 |
| AITDK Extension | ✅（SEO 标签页）/ ✅（GEO 标签页，2026-09-11 起可脚本化） | AITDK **SEO** 标签页的能力已被 `scripts/seo-audit.mjs` 复刻（它的头部注释就写着「AITDK 相当」），且脚本能跑全站，扩展只能看当前页。**GEO 标签页**（引用 / 表格 / 数字 / 作者 / 日期 / sameAs / H3，2026-09-02 在 vidown 实测 76/100）`seo-audit.mjs` 不覆盖，判据在 `checklists.md` 闸门 4b。**旧结论「报告靠用户贴回」已作废**：2026-09-11 起 `scripts/aitdk-opencli.sh` 用 opencli 直接读面板 iframe，15 个标签页（含 GEO）一次跑完，详见下方「AITDK 面板全自动取数」 |
| Wappalyzer | ➕ 能力值得要 | **技术栈识别在段 1 的竞品拆解里有真实用途**（对方用什么建站、挂了哪些分析/广告/支付 → 反推变现方式，直接喂 [`lifecycle.md`](lifecycle.md) 6.3 竞品变现分析）。但其 API 是付费 `x-api-key`（实测 2026-08-29），**免费替代见下方「技术栈指纹」一节** |

### AITDK 面板全自动取数（`scripts/aitdk-opencli.sh`）

**【实测 2026-09-11】** 一条命令把 AITDK 面板的 15 个标签页全抓下来，不需要人手点、不需要贴回。
**2026-09-12 复测通过（扩展 1.1.1，两站 16 个 URL 全部 15/15 section）**——修的是上面那条 1.1.0 已知回归。

```bash
bash <rankup-skill-dir>/scripts/aitdk-opencli.sh <url> [session-name] [output.json] [--skip-panel]
```

- `session-name` 默认 `aitdk`；`output.json` 默认 `./aitdk-report-<domain>-<时间戳>.json`。
- `--skip-panel` 只跑 Part A（页面自身 HTML/robots/sitemap/whois），不碰扩展——**没装扩展、或只想要页面事实时走这条**。

**前置条件（少一条就白跑）：**

| 条件 | 说明 |
|---|---|
| Chrome 里装了 AITDK 扩展并已登录 | 面板数据要账号，未登录只会拿到空壳 |
| opencli 扩展 ≥ 1.1.0 | 跨源 iframe 支持是这一版才有的；改过扩展要去 `chrome://extensions` reload |
| OpenCLI 扩展 ≥ 1.1.1（1.1.0 下多 section 会报 sidebar button not found） | 1.1.0 有 OOPIF context 缓存撞号的已知回归，面板 toggle 几次后 `eval` 静默落回主页面，脚本表现为定位不到侧栏按钮；升级到 1.1.1 修复，见 opencli skill 的 `references/our-fork.md` |
| opencli CLI 用仓库构建 | 脚本默认把 `OPENCLI_BIN` 指向本机 opencli checkout 的 `dist/src/main.js`（默认值写在脚本头部）。**全局 npm 装的那个 1.8.7 tgz 没有跨源 iframe 支持，会失败**；本地 checkout 挪了位置就覆盖 `OPENCLI_BIN` |
| `jq` + `python3` | 缺任一则 Part B 自动跳过（只剩 Part A） |

**抓的 15 个 section**（侧栏顺序）：Overview、Traffic、Backlinks、Adsense、Issues、GEO、SERP、Density、Headings、Images、Links、Social、Hreflangs、Structured、Whois。
**故意不抓**：Settings / Archive（本地 UI）、Similarweb / Semrush / Ahrefs / PageSpeed / Twitter（点了会跳外站，不是面板内容）。

**实测成绩**：nonogram-game.com，15/15 有内容、0 错误、2 分 08 秒，结束后无残留会话（脚本自己关面板、关 session）。**每抓完一个 section 落盘一次**，所以中途被打断也留得下半份结果。

**输出 JSON 的形状：**

| 字段 | 内容 |
|---|---|
| Part A 字段 | `url` / `title` / `metaDescription` / `canonical` / OGP / Twitter card / `robots` / `hreflang` / `headings` / `links` / `images` / `structuredData` / `robotsTxt` / `sitemapExcerpt` / `whois` |
| `issues` | 页面级问题数组。含 `placeholder-domain-leak`——**`og:url` / `canonical` / `og:image` / `twitter:image` 里出现 `example.com` 时触发**，正是 nonogram-jp / crossword-ar 那个 `SITE_URL` 没在构建期注入、占位域名泄到线上的失败模式 |
| `aitdkPanel.sections.<name>` | 每个 section 一个对象，含 `raw`（面板全文）与 `fields`（尽力配对出来的键值） |

**解析器短板（消费这份 JSON 之前必须知道）：**

- **Overview 的 Title / Description / Keywords 是三行一组**（标签、字数计数、值），`fields` 里拿到的是**计数**不是真值；真值在 `unpaired` 或 `raw` 里，要读文本。
- **Issues、Structured、Headings 是散文式排版**，`fields` 基本为空——直接读 `raw`。
- **重复标签会合并成数组**（例如面板里两个 `Unique`）。

判读时的规矩不变：**脚本只采集，判读归你**；`fields` 空 ≠ 这项没问题，先看 `raw`。

**原理一句话**：AITDK 面板是挂在页面里的 `https://extension.aitdk.com/` 跨源 iframe，脚本走 opencli 的 `frames` + `eval --frame` 直接读它的 DOM——不用剪贴板、不用坐标、不靠截图。为什么必须用合成键盘事件开面板、为什么不能 reload 页面、为什么点击要发完整指针序列，这些细节在 `opencli` Skill 的 `references/browser-driving.md` 与脚本头部注释里，本文件不重复。

**什么时候用**：段 3 / 段 4 的上线前自检（闸门 4b 的 GEO 那半截），以及竞品或自站的 SEO 体检。比人工打开面板逐页复制快得多，且能批量跑一批域名。

**作为段 4 / `rankup review` 闸门用时**：跑全部 15 个标签页而不只是 GEO 一页，判据见 [`checklists.md`](checklists.md) 闸门 4c，本节不重复写。

### 博客区（4 条）

| 来源 | 判定 | 依据 |
|---|---|---|
| Google Search Central Blog | ✅ 已是一手源 | [`seo-growth.md`](seo-growth.md) 的算法更新时间线与 2026 AI 搜索范式整节就是从它整合来的。**排障定位时先查它，不要查二手解读** |
| Google Search Blog（blog.google） | ✅ | 面向大众的产品公告，与上面那条互补；算法细节仍以 Search Central 为准 |
| Semrush Blog | ❌ | 厂商内容营销，结论普遍缺前提条件。同类判断我们用 [`experiences/`](experiences/) 那一组——**那里每条都带证据等级** |
| Backlinko Blog | ❌ | 同上 |

## 会员实测：判定不能靠推断，要用登录态验

上面那张表的第一版是**按各站的公开页面推断**写的。后来用用户已登录的浏览器逐个验了一遍
（2026-08-29），结果推翻了其中一条，也坐实了另外几条。**这一步不能省**：
「这个工具值不值得接」取决于你在哪一档，而档位只有登录进去才看得见——
这与本 Skill 反复强调的「配额前置检查」是同一条规则。

| 站 | 实测登录态 | 对判定的影响 |
|---|---|---|
| Ahrefs | **已登录，套餐 = 「网站管理员工具（免费）」(AWT)** | **推翻了「Ahrefs 只是 ahrefs-setup 那点用途」**。AWT 免费档看不了别人的站，但**自己已验证站点的 Site Audit 是完整的**：定期抓取、健康评分、20 个分类报告，且不消耗按次配额 |
| GTmetrix | **未登录**（`/dashboard/` 落回首页，显示 Log In） | ❌ 判定成立，且现在有证据 |
| WooRank | **未登录**（显示 Log In / Free Trial） | ❌ 判定成立 |
| Wappalyzer | **未登录**（账号页显示 Sign in to continue） | ❌ 判定成立，技术栈仍走第三节的 curl 指纹 |
| Keywords Everywhere | **未登录**（页面只有 Get API Key，无账号/登出入口） | ❌ 判定成立 |

### Ahrefs AWT 免费档：边界在哪、能拿什么

**能**：自己已验证所有权的站点的完整 Site Audit——
内部链接失效数、重定向链、HTML 标签、可索引性、hreflang、图片、性能、抓取日志、历史健康分。
**不能**：查别人的站、Keywords Explorer 的词量与 KD、Content Explorer（导航里有，点进去是升级页）。

所以 Ahrefs 在 rankup 里的正确位置**不是关键词工具，也不是外链工具**（那两件事分别归
`seo-webcafe.mjs kd` / Semrush 和 `backlink` Skill），而是**自有站点的第二台爬虫**：

| 它能替谁干活 | 现状 | 拿 Ahrefs 之后 |
|---|---|---|
| 闸门 1「内链零 404」 | 自己抓全站内链逐条请求 | Site Audit 的 `links` 报告**已经在按周自动做**并保留历史 |
| 闸门 2「TDK 全站逐 URL」 | `seo-audit.mjs --sitemap` | `html-tags` 报告作为**第二双眼睛**——两边都说没问题才算数 |
| 段 5 / 段 7 的 301 检查 | `curl -sIL` 逐条 | `redirects` 报告给的是**全站**重定向链，不是你想起来查的那几条 |

**两边不一致时以自己的脚本为准**——Ahrefs 抓的是它上次抓取那一刻的站，
可能是几天前；`seo-audit.mjs` 打的是此刻的线上。**日期对不上就不是矛盾**，
所以 `projects` 的输出里「最后一次抓取」那一列必须一起记进 `audit.md`。

**MCP / API v3 在免费档拿不到 Site Audit。** `site-audit-projects`、
`site-audit-issues` 这类端点即使 MCP 服务器已经连通，一律回 `Insufficient plan`——
免费档没有把自己站的审计数据开放给 API/MCP。读自己站审计的唯一通路仍是
`ahrefs-site-audit.mjs` 驱动浏览器，这条结论比上面「关于走 API」那节更具体：
不是「懒得搬凭据」，是这条路径本身在免费档走不通。

**逐 URL 清单藏在 `issues --json` 的链接里。** `report <id> issues --json`
返回的每条问题带一个 `links`，里面有形如
`data-explorer?columns=...&filterId=...&issueId=...` 的相对路径——
把它**原样**当报告名传给 `report <id> <这段路径>`，就能拿到该问题对应的逐 URL 表。
`filterId` 是动态生成的，**不进 `routes` 清单**，每次都要从当次的 `issues --json`
里现取。已在「仅一条 dofollow 内链」「重定向链」「元描述过短」「缺失 alt」四类问题上跑通。

**几条免费档特有的判读噪音，别当真报警处理：**

- 「缺失替代文本」把 `alt=""` 也算缺失。装饰图按可访问性规范本该留空 alt，
  但给一个描述性 alt 对读屏器零负面影响（尤其在 `aria-hidden` 容器里），
  对爬虫也少一条噪音——遇到就直接补文案，不用去和 Ahrefs 的判定标准较真。
- 「变更的页面未提交至 IndexNow」是 **Ahrefs 自家 IndexNow 集成没配 key** 的提示，
  和站点自己有没有推送 IndexNow 无关。免费档界面上找不到任何可填 key 的入口
  （项目设置页、抓取设置面板都是只读，「新的抓取」按钮直接触发、不弹配置对话框）——
  这条通知在免费档下消不掉，判「不追」。
- 「标题/描述/字数已更改」是**变更通知**，不是缺陷；重定向链报告里
  `http://` 与 `www.` 入口各自那一跳收敛到规范域的 301，是正常收敛路径，不是问题。

**判读顺序固定为「先复算、后动手、再核销」**：Ahrefs 报的每一条，先用
`seo-audit.mjs --sitemap`（或对应的本地脚本）独立复算一遍，逐 URL 对上了再动手改；
改完手动点一次「新的抓取」核销——免费档有几千次抓取额度，不用等它按周自动抓。

### 关于走 API（用户问过，这里是结论）

账号里**确实有 API 密钥**（范围 `MCP`、限制「无限制」、消耗单位 0），但脚本没有走它：

1. 密钥在页面上打了码，取出来要么抠 network、要么读剪贴板——**为省一次浏览器调用去搬运一枚凭据，不划算**；
2. `api.ahrefs.com/v3/*` 不带鉴权一律 403，**猜不出免费档放行哪几个端点**：
   实测 `/v3/public/keyword-difficulty` 这类猜测路径全是 404，
   匿名可用的只有 `/v3/public/crawler-ip-ranges` 和 `/v3/public/crawler-ips`（Ahrefs 爬虫 IP 段，
   顺带一提这两个对配 robots/防火墙白名单是有用的，零鉴权）；
3. 浏览器路径此刻就是通的，且全程不碰凭据。

**要走 MCP 是用户自己配的事**——密钥在「帐号设置 → API密钥」，脚本不该去搬它。

## 本轮真正落地的三件事

对账的产出不是 28 条摘要，是下面三个**能挂进环节**的东西。其余 25 条要么已覆盖、要么已判死。

### 一 · PageSpeed 网页版 → 补上闸门 6 缺的那一半

[`checklists.md`](checklists.md) 段 4 闸门 6 的判据是
「**实验室与现场数据都记录，不一致以现场为准**」。在此之前那一行的「怎么做」只写了
「跑 Lighthouse」——Lighthouse 只给实验室数据，**现场那一半没有任何工具**，
于是这个闸门长期只能过一半，而表面上是绿的。这正是本 Skill 反复警告的失败形态。

**取数走网页版 `pagespeed.web.dev`，不走带 key 的 PSI API**（2026-08-31 改）。
网页版零 key、零配额、零账号，而且比 API 多给两样东西：CrUX 的**样本量档位**
（「许多样本 / 少量样本」）和新的**「智能体浏览」类别**——API 都不返回。

```bash
# 出链接与读数清单（零依赖，随时能跑）
node <rankup-skill-dir>/scripts/pagespeed.mjs plan \
  https://example.com https://example.com/tool https://example.com/blog/x \
  --strategy both

# 可选：驱动本机 Chrome 采双证人（截图 + 页面文本）进 .rankup/evidence/
node <rankup-skill-dir>/scripts/pagespeed.mjs collect <同样三个 URL> --strategy both
```

四条必须知道的（2026-08-31 实测）：

1. **网页版跑分只在标签页真的可见时才渲染得完。** 同一个 URL：标签页处于后台
   （`document.visibilityState === "hidden"`）时页面停在「Running analysis」，
   连测 4 轮、每轮 60–80 秒**一次都没出分**；标签页一变可见，报告立刻从 179 个
   元素涨到 8559 个、分数当场出现。数据其实早到了（后台也能看到报告外壳），
   卡住的是**重报告的渲染**——后台标签页拿不到 rAF/空闲回调。
   **伪造可见性无效**：改写 `document.visibilityState`/`hidden`、把 rAF 垫成
   `setTimeout`、补发 `visibilitychange` 都试过，页面读到的确实变 visible，
   渲染纹丝不动——节流在浏览器层，不在页面读的那个标志位。
   单靠 `opencli --window foreground` 也不够（Chrome 整个 app 不在最前时标签页
   仍是 hidden）——**但组合另一件事就够了：`collect` 期间额外起一个后台循环，
   每 15 秒 `osascript activate` 一次把 Chrome 这个 App 也拉回前台**。
   **所以 `collect` 默认就是前台驱动（open 带 `--window foreground` + activate
   循环），2026-09-12 实测无人值守跑通（3 个 URL × 移动/桌面共 6 组一次性全部
   出分，零重试，约 2 分钟）；人跑只是兜底，仍卡 tab-hidden 才需要。**
2. **跑不出来 ≠ 没有数据。** `collect` 把两种卡住分开报：`tab-hidden`（标签页
   没在前台）与 `budget-exhausted`（可见但没跑完——实测有站跑满 240 秒仍在跑）。
   两种都**不许**被写成「性能没问题」或「这个站没有数据」。
3. **现场数据缺失是正常形态，不是错误。** 页面上「了解您的真实用户的体验」
   那一整块直接不出现——新站流量不够进 CrUX 就长这样。
   记进 `baseline.md` 必须原样写「**现场无数据（CrUX 流量不足）— 不是 0，也不等于通过**」：
   留空会在下一轮被读成「查过了，没问题」。
4. **读数时把作用域和样本量一起记。** 网页版会标这份现场数据是「这个 URL」还是
   「整个源」，还会标样本量档位。两者混记会让下一轮对不上——同一个站的 origin 级
   数据和 page 级数据本来就不是一回事。
   另外别忘了跑分环境那行（Lighthouse 版本、节流档位）：**换了环境的绝对值不可比**。

**不要试图直接调网页版的内部接口**：它的跑分请求走 `_/PagespeedUi/data/batchexecute`，
参数混淆、没有契约、随时会变。要么人读页面，要么按双证人采下来让 AI 判读。

**Web 字体字节预算是闸门 6 的独立项**（【实测】多站复现）：慢 4G 下字体总字节直接吃
FCP/LCP。CJK 站用 Google Fonts 会按 `unicode-range` 拆成上百个子集，文字越多拉得越多，
总量可达 1MB 级；`font-display: swap`/`optional` 只解决绘制阻塞与位移，**不省字节**，
而 `preload` 更会让字体抢在 HTML/JS 前面占带宽。判据：CJK 站默认系统字体栈（不下载）；
拉丁站自托管并子集化到实际用到的字符与字重，可变字体裁掉不用的轴，单站字体总量控制在
几十 KB 级；不 `preload` 首屏用不到的字重；改动前后看 PSI 网页版的「第三方/资源分解」与
「网络依赖树」两个区块的字体总字节，不要只看 `font-display` 有没有设对。

**本地 Lighthouse（simulate 或 devtools 节流）不能替代 PSI 网页版**（【实测】同一时刻
本地 93–99 分而 PSI 57 分的情况出现过，纯字节量问题在本地节流下不显形）：闸门 6 只认
PSI 网页版读数，本地 Lighthouse 只用于迭代定位；读报告的顺序是「第三方分解 / 网络依赖树」
先于「渲染阻塞资源」审计——先看字节量，再看阻塞关系，顺序反了容易把字节问题误判成纯粹的
加载顺序问题。

作为闸门用时判据见 [`checklists.md`](checklists.md) 闸门 6，本节不重复写判据。TTFB 判据与匿名页面边缘缓存做法同样见 checklists 段 3 / 闸门 6，不在本节重复。

**Lantern 优先级模型：PSI 移动端评分只按请求优先级判「是否算首绘依赖」**（【实测】多站对照、逐项 A/B 复现）。PSI 移动端分数由 Lantern 模拟器给出，它判断一个请求要不要计入首绘依赖图，看的只是资源的请求优先级：`VeryHigh` 一律计入，`High` 且资源类型是 Script/Document 也计入；`async`/`defer`/`type="module"`/`rel="preload"`/`font-display` 这些属性本身**不参与判定**，只是间接改变了请求会被浏览器标成哪档优先级。后果是客户端入口 bundle、`modulepreload`（属 High+Script）、`rel="preload" as="style"` 的 CSS（属 VeryHigh）、以及**没有被预加载的 webfont（默认 VeryHigh）**都会被算进首绘依赖链，拖慢 LCP 的「元素渲染延迟」。反直觉推论：给字体加 `preload` 反而会把它的优先级从 VeryHigh 降到 High，从而移出依赖图；给非首屏脚本加 `fetchpriority="low"`（Cloudflare Worker 场景可用 HTMLRewriter 流式改写响应头/属性）能把它们移出依赖图。判据：PSI「LCP 细分」里 TTFB 很小、但「元素渲染延迟」高达上千毫秒且看不到明显阻塞资源时，先去查该页面的 VeryHigh/High 子资源清单，而不是继续在渲染阻塞资源审计里找。本地 Lighthouse 常常复现不出这条——TTFB 慢导致本地观测到的首绘时间点早于这些 VeryHigh/High 请求完成的时间点，要复现需要把页面连同静态资源一起镜像到本机 `127.0.0.1`，让 TTFB 与线上边缘缓存处在同一量级。

**入场动画会污染 LCP 与 Speed Index**（【实测】）：首屏内容如果用 `opacity: 0` 起始、靠 `animation-delay` 落在 1–5 秒的入场动画淡入，Lighthouse 的 trace 窗口从不与用户交互，几乎每次都会在动画中途截到新的 LCP 候选，表现为「LCP 比 FCP 晚 1 秒以上、Speed Index 异常高，而同模板去掉动画的页面读数正常」；判据同闸门 6 D7 一行——首屏内的入场/循环动画一律 gate 到用户首次交互之后触发（用 `html.<class>` 一次性开关，不设定时兜底），或者干脆不要用 `opacity` 做首屏内容的初始状态。

**文档体积超出 Lantern 初始拥塞窗口会多算一跳 RTT**（【实测】）：约 14.6KB brotli 是 Lantern 模拟的文档初始拥塞窗口，依赖图里只剩文档本身时，LCP 最后 0.2–0.5 秒的差距通常就对应文档超出这个窗口的字节数，此时同文档内去重 SVG（`symbol`+`use`）对 brotli 体积几乎零收益，只有把内容整段移出文档（外部 sprite、异步加载的 CSS）才真的省字节；判据见 checklists.md 闸门 6 排查顺序最后一项。

**PSI 双峰多数不是「平台抖动」，是站点自身**（修正上一轮结论，【实测】）：同一时段拿一个已知稳定的对照站一起测，对照站分数稳定就说明抖动出在自己站上，不能默认甩锅给测量平台；PSI 结果没有同时段对照站陪测，不得下「这是后端/平台抖动」的结论。

### 二 · 重定向链：要能力，不要那个网站

WhereGoes 做的事 `curl` 本来就会做，且本地版更可用（可批量、可进 CI、不受第三方限流）：

```bash
curl -sIL -A 'Mozilla/5.0' https://example.com/old-page | grep -iE '^(HTTP/|location:)'
```

**为什么这条值得单独留一节**：[`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 第五节
已有一条硬结论——**302/307 不传权重**。但在此之前，rankup 里没有任何地方写「怎么查一条 URL 到底走的是 301 还是 302」。
判据有了、量具没有，规则就只能靠人记得去查。

该在这三处查：**段 5 域名接入后**（裸域 → www、http → https 到底几跳、是不是 301）、
**段 7 改过 URL 之后**（旧页面的跳转是不是 301，链接权重有没有断在 302 上）、
**段 6 验收外链时**（对方站给的链接如果经过跳转中转，跳的是什么码——见 backlink 的证据阶梯）。

**Cloudflare 的「从 WWW 重定向到根」模板会在 `http://www` 入口上多跳一次。**
该模板的匹配条件写死 `https://www.*`，只认 https 协议；`http://www` 这个入口
先被「Always Use HTTPS」接走升级成 `https://www.*`，再撞上重定向规则，实测就形成
两跳链（而不是一跳到位的 301）。**判据不是「关掉 Always Use HTTPS」**——
Single Redirects 本来就先于它执行，关了也不解决匹配条件本身写死协议的问题。
正确做法是把匹配条件改成按主机名判断、不含协议：`(http.host eq "www.<域>")`，
目标写 `concat("https://<域>", http.request.uri.path)` 并保留 query string，
状态码用 301。这样任何协议进来的 `www` 入口都在同一条规则里一跳到位。

### 三 · 技术栈指纹：竞品变现分析的输入

Wappalyzer 的 API 收费，但它识别的信号绝大多数就摆在响应头和 HTML 里，
[`lifecycle.md`](lifecycle.md) 6.3「竞品变现分析」要的那一行结论（**他赚谁的钱、怎么收**）
往往一次 `curl` 就能定：

```bash
curl -sSL -A 'Mozilla/5.0' https://competitor.example -D - -o body.html | head -40
grep -oiE '(gtag|googletagmanager|clarity\.ms|cloudflareinsights|plausible|umami|posthog|stripe|paddle|lemonsqueezy|creem|adsbygoogle|carbonads|ezoic|mediavine)' body.html | sort -u
```

命中 `stripe`/`paddle`/`lemonsqueezy`/`creem` → 卖订阅或买断；
命中 `adsbygoogle`/`ezoic`/`mediavine` → 靠广告，那么**它的商业模型是流量规模**，
定位对标时不能照抄它的功能取舍（见 [`lifecycle.md`](lifecycle.md) 段 1 必做动作第 8 条（1.3 节）：
照抄一个变现方式不同、不可比的竞品是明确的失败模式）。

还有一个已经在 rankup 里的更强工具：`scripts/demand/site-network.mjs`
按 GA/GTM/AdSense ID 反查同一批人的站群。技术栈指纹是它的单站版本。

## seo-audit 判读指引（分级表从脚本迁来）

2026-08-30 起 `scripts/seo-audit.mjs` 降级为纯机械工具：只输出观察记录
`{code, observed}`（存在与否、长度、计数、密度）和每页抓取结果（失败页带
`fetchError`），**不再自带 error/warning/info 分级与修复建议**。原分级表在此，
判读时按站点上下文取舍（例如营销站缺 og:image 比工具站严重；单页应用多 h1
可能是组件库习惯而非事故）：

| code | 原分级 | 观察内容 | 常用判读 |
|---|---|---|---|
| NO_TITLE / NO_DESCRIPTION / NO_VIEWPORT / NO_H1 / NOINDEX | error | 标签缺失；robots 含 noindex | 一般视为必修；NOINDEX 若非灰度页面即上线事故 |
| TITLE_LEN / DESC_LEN | warning | 长度在典型范围外（title 目安 10–60、desc 目安 50–160，字符数口径） | 超长会被截断展示、过短浪费位；按 SERP 实际展示判断 |
| NO_CANONICAL / NO_LANG / NO_CHARSET / MULTIPLE_H1 / HEADING_SKIP / IMG_NO_ALT / NO_OG_TITLE / NO_OG_DESC / NO_OG_IMAGE | warning | 缺失或计数异常 | 多数应修；OG 三件套影响分享卡片而非排名 |
| NO_KEYWORDS / CANONICAL_MISMATCH / IMG_EMPTY_ALT / IMG_NO_DIMENSIONS / NO_TWITTER_CARD / NO_STRUCTURED | info | 存在性事实 | keywords 可忽略；CANONICAL_MISMATCH 要人工确认是否有意；IMG_NO_DIMENSIONS 关 CLS |
| fetchError | —— | 该页这次**根本没看到** | **抓取失败 ≠ 页面没问题**，修通抓取或换环境重跑，不许当成通过 |

上表的 title 10–60 / desc 50–160 是 **`seo-audit.mjs` 这一把尺**（字符数口径，
区间最宽，只筛明显异常）。仓里另有两把口径不同的尺——`seo-webcafe.mjs string`
的 30–60 / 70–160（按近似展示宽度计长）与 Ahrefs 的 110–160——三者的对照与
「说超长时必须点名是哪把尺」的规矩，见
[`seo-webcafe.md`](seo-webcafe.md) 「本地命令数值判读指引」的
「`string` 的判读：三套 TDK 长度口径，别混着引」小节。

密度（unigrams/bigrams/trigrams）没有「正确值」：它是给判读者看「这页在向搜索引擎
强调什么」的证据，不做阈值判定。

## 什么时候回来读这一篇

| 环节 | 用它的哪一条 |
|---|---|
| 段 1 · 竞品拆解与变现反推 | 第三节「技术栈指纹」；Detailed SEO Extension 用于人工复看首页 |
| 段 5 · 域名与 DNS 接入完成后 | 第二节「重定向链」——裸域/www/https 到底几跳、是不是 301 |
| 段 4 · 闸门 6 性能 | 第一节 PageSpeed 网页版，**实验室与现场都要有** |
| 段 7 · 改过 URL 之后 | 第二节「重定向链」 |
| 段 7 · 排障定位算法更新 | 博客区：只信 Google Search Central Blog，不信厂商博客 |
| 段 6 · 外链验收 | 第二节「重定向链」 |
| 任何时候有人推荐「一个很全的 SEO 工具站」 | 开头那条规则：**不接入，只对账，三态判定写清裁决依据** |
