# 生命周期 · 段 4：上线前 SEO/GEO

> 本文件是 [`lifecycle.md`](../lifecycle.md) 的段 4 全文（2026-09-30 从单文件拆出）。开工先做[对账](../lifecycle.md#每段开头的固定动作对账原阶段-0)；闸门判据在 [`checklists.md`](../checklists.md) 段 4，本文件只写怎么做。

## 段 4：上线前 SEO/GEO（在预览域 noindex 上做）

**本段全部在预览域上完成，预览域保持 `noindex`。** 域名此时还没定稿，
但 TDK、密度、结构化数据、GEO、性能、图标全部与域名无关——它们从段 3 的域名留位常量读绝对 URL，
换域名时只改那一处。等到段 5 绑定正式域名后，只需重跑一遍确认 `noindex` 已摘。

> **这不是一份「可以跑一跑」的推荐工具列表，是一道硬性闸门。** 站主原话：
> 「这些东西都必须要走一遍……这是硬性要求」。

### 硬规则（全文，含「为什么」；`SKILL.md` 只留摘要）

| 规则 | 为什么 |
|---|---|
| **每页先登记目标词再测密度**：`.rankup/keywords.md` 里页面 ↔ 目标短语一一对应，密度测的就是那个字符串 | 实测过 8 个页面构建绿灯下全过，逐页核对才发现每页测的都不是自己声明的短语 |
| **无关区块不进 SSR 文本**：价格表、FAQ 控件文案、单位换算、UI 标签这类会稀释目标词的区块，改客户端加载，让 SSR 只输出目标文案。**注意 Googlebot 会渲染 JS**，`DOMContentLoaded` 注入只骗得过密度工具骗不过 Google；更稳的做法是 [`seo-ssr.md`](../seo-ssr.md)「做法二：首次真实交互后再注入」——**首次真实交互**（pointerdown / keydown / touchstart / wheel）之后才注入，爬虫从不交互所以永远看不到 | 密度工具读 raw HTML，Google 读渲染后 DOM；两者都要过 |
| **每页独立 title / description / `og:image`，且必须有图**；`og:image` **不得全站共用** | 实测某 7 语种站共用同一 `og:image`、页内 0 个 `<img>`，结果只有 1 个语种出 SERP 缩略图（`seo-experiences-2026-07.md` 2026-07-18 条目） |
| **`llms.txt` 与 is-agentic 一起做**：`llms.txt` 列真实路径，`is-agentic.mjs scan` 出基线 | `llms.txt` 对被 ChatGPT 引用无收益证据、成本低（见 [`seo-ai-search.md`](../seo-ai-search.md)），闸门仍按 [`checklists.md`](../checklists.md) 执行；`is-agentic.mjs` 出的是 AI 代理可达性基线 |
| **每次页面改动全套体检重跑**（下 C 表 0–6 + 4b + 4c 全部），不是只跑某几行 | 改一处 TDK 可能带坏密度，改一个区块可能带坏 CLS；只重跑某两行等于默认其余没变，而这正是清单腐坏的起点 |
| 在预览域上做完，预览域 **noindex** | 半成品被收录，第一印象就是半成品 |
| **页面与问法簇的关系** | 唯一规划源见 [段 2 · 2.3](stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构) |
| 每页目标词 + 密度达标；价格表等无关区块改**客户端加载**，SSR 只输出目标文案（与 [`seo-ssr.md`](../seo-ssr.md) 的「首次交互后注入」是同一节）；**想被 AI 引用的价格表与推荐位除外，保持 SSR**（OpenAI 爬虫不执行 JS，2024-12 单一独立实测） | 密度按 SSR 输出的 HTML 算，无关区块会把目标词冲淡 |
| **占位专项复查**是上线 review 必做项：按 sitemap 逐 URL grep（正则见 `discipline.md` 十四）+ 人工抽查首页/定价/关于/联系/法律页每个链接可点、每张图有内容，重跑不采信上一轮 | 段 3 的开发期禁令拦不住上线后仍有占位——这是漏法本身，闸门必须落在「上线前」这个时间点上才管用 |
| **Cloudflare 循环消耗红线未通过不许启用付费后台链路**：上线前复查 `checklists.md` 段 3 同名项，操作按 [§8.9](../cloudflare-stack.md#89-循环消耗与账单熔断红线)，不采信旧勾选 | SEO/性能全绿不能证明后台有界；预览测试也可能计费 |
| **图标专项未通过不许上线**：段 4 必过 `checklists.md` 图标专项，操作统一见本文件段 4 · A 节；发布后正式域名回读 | 必须核对全部实际引用与图案，文件存在、200 或标签页正常都不能代替实图核验；搜索结果刷新单独观察 |
| 正文是给人读的，不是给密度工具凑的：起稿后必须过一遍去 AI 味与结构梳理（中文走 `/write` 阶段四，英文按 `/ai-seo` 的 Information Gain 判据自查），首屏一句话说清这页解决什么。**中英文都查四样**：矫饰文风（用比喻花腔代替直说，有直说就直说）、句子密度（一句一个意思）、引文标记（别人的话打引号注出处，最多一处）、格式克制（列表只在内容确实多面时用）——判据与自查正则在 `/write` 阶段四 | 模板腔与空话会被 AI 搜索跳过、被读者秒关；Information Gain 是 2026 排名与被引用的共同判据；矫饰句读者一眼能认出是模型写的 |
| GEO 先按 Google 搜索基础实践和目标用户任务检查；`llms.txt` 不当作 Google 搜索优化的收益依据，但段 4 闸门 1 仍要求它存在且列出的路径与真实 URL 集合一致（不是模板占位） | Google 表示其搜索系统不使用 `llms.txt`，它是 AI 代理与第三方 AI 产品的可发现性入口，按 `checklists.md` 闸门 1 核对；收益另按其实际协议验证 |
| **上线前（段 4）与 `rankup review` 全站体检都要用 AITDK 扩展面板对站点跑一遍完整报告**（按 sitemap 抽样：首页 + 每类模板页各至少一个 + 全部法律/关于/联系页）；报告里**所有标红/标黄的问题项，以及任何没拿到满分的评分项，一律算必修**，逐条修完重跑，直到全绿满分，改不动的写清为什么改不动 | AITDK 是与 Google 视角独立的第三双眼睛，看得到自家 `seo-audit.mjs` / `is-agentic.mjs` 漏掉的项；不满分就说明还有可修的空间，不能因为自家脚本已经全绿就跳过 |
| 证据必填：控制台绿图标不算；性能验收只按 [`checklists.md`](../checklists.md) 段 4「闸门 6」；TTFB 不达标先查匿名页 HTML 边缘缓存是否命中再排查别的原因；LCP 慢而无阻塞资源先按 seo-box 一的 Lantern 优先级模型排查——**降请求优先级只能收敛 FCP，改不动 LCP**，LCP 要查 hydration 脚本是否已挪到首帧绘制之后才加载 | 这套东西唯一致命的失败形态是看着全绿、底下什么都没有；判据写成自设下限的结果是两个站直接跳过了这一闸 |

> 2026-09-30 合并：此表由原 `SKILL.md` 本段硬规则表与本文件原「本段的 N 条硬规则」表去重合并而成，同一条规则只在这里写全文。

### 输入

- 段 3 交来的预览域（`noindex`）与私有仓库。
- `.rankup/keywords.md` 的页面映射与 Brief；规划只见 [段 2 · 2.3](stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)。
- 已确定的品牌色板与字体（段 2 的设计决策）。

### 必做动作

**A. 品牌资产：图标一次做全，开发当天完成、上线前复核**

本节是图标制作与核验的唯一操作源；段 3 Day-1 即执行，上线前在预览域重跑，发布后在正式域名回读。

1. **先定标记，且必须在 16px 实测下定。** 这是唯一有效的判据：
   16px 是浏览器标签页的真实尺寸，很多在 512px 下好看的方案在这里直接消失。
   实测得到的三条结论（跨项目成立）：
   - **表意文字（汉字/かな）在 16px 不可用**：笔画细、有断口，缩下去糊成一坨。
     "它是我们的品牌字"不构成保留理由。
   - **面部/面具类图形在 16px 糊掉**：五官是细节，细节先死。
   - **能活下来的只有厚实的几何形**：少量、粗、彼此分离的色块。
   - 尖角形状要给 8–16 的圆角，否则 16px 采样后尖端是毛刺。
2. **警惕"像 UI 图标"**。等长/等距的条、箭头、放大镜、齿轮会被读成工具栏按钮而不是品牌。
   判据：把它放进一排系统图标里，还认得出它是个标记吗？
3. **生成模型可以出概念，但不要直接用它的位图做图标**：位图在小尺寸糊边，
   且其色值往往是量化出来的、与色板不精确一致。**取其概念，重画为矢量。**
4. **标准图标集整套一次做齐**（全部由同一张正方形品牌 logo 源图通过 `scripts/make-favicons.mjs` 生成，源图 ≥512×512，缺一个就会在某个终端上露出默认图标）：
   - `favicon.ico`：内含 16、32、48 多尺寸，head 声明 `sizes="48x48"` 作为兜底回退。
   - `favicon-48.png`、`favicon-96.png`、`favicon-192.png`（Google 要求 48 的倍数，在 head 声明对应 `sizes` 与 `type="image/png"`）。
   - `apple-touch-icon.png`：180×180，head 声明 `rel="apple-touch-icon"`。
   - `icon-512.png`：512×512；`manifest.json` 的 icons 列 192 与 512（若原有 maskable 图标如 `icon-maskable-512.png` 则保留）。
   - head 里完整声明：`<link rel="icon" href="/favicon.ico" sizes="48x48">`、48/96/192 三个 `<link rel="icon" type="image/png" sizes=... href=...>`、`<link rel="apple-touch-icon" href="/apple-touch-icon.png">`、`<link rel="manifest" href="/manifest.json">`。不要再引用与品牌 logo 不一致的 SVG。
5. **`manifest.json` 必须逐个引用，且引用的文件必须真实存在**。
   脚手架自带的 manifest 常常指向不存在的 `logo192.png`／`logo512.png`，
   并留着框架自己的名字——它是 Android 添加到主屏时用户看到的东西。
5a. **图标专项：不能只换 SVG，或只检查文件存在 / HTTP 200。**
    - 落实标准图标集：必须包含由同一张品牌 logo 源图生成的 `favicon.ico`（内含 16/32/48）、`favicon-48.png`、`favicon-96.png`、`favicon-192.png`、`apple-touch-icon.png`（180×180）、`icon-512.png`（512×512）。清除静态目录、构建产物中的框架默认图标及旧引用；逐项核对首页与各模板的 **SSR HTML 与浏览器水合后 DOM** 中所有 `rel="icon"`、`shortcut icon`、`apple-touch-icon`（含其变体），manifest 的全部 `icons`，以及即使未声明也会被访问的根 `/favicon.ico`。不要再引用与 logo 不一致的旧 SVG。一个入口残留默认图标，整项不通过。
    - 对上述去重后的 URL **逐个 GET 并解码实际图片**：必须为 200、非空、可解码的真图，不能是路由回退的 HTML；响应 `Content-Type`、head/manifest 声明的 `type` / `sizes` 必须与文件格式及真实尺寸相符；ICO 逐层核对尺寸。每张图都亲眼查看，允许按尺寸简化，但必须属于同一品牌，不能仍是脚手架图案。**改名不等于换图，标签页显示正确不等于所有入口正确。**
    - 搜索图标使用方形图片与稳定 URL，除 SVG 外保留 Google 支持的 ICO/PNG 回退；建议补 `favicon-96x96.png` 并在首页 head 声明。Google 当前要求至少 8×8，建议大于 48×48；不把页面图片的 WebP 规则套到 favicon 上。格式与抓取规则以 [Google Search Central 的 favicon 文档](https://developers.google.com/search/docs/appearance/favicon-in-search) 为准（2026-09-14 核验，规则变更时复查）。
    - 预览域保留设计中的索引封锁；上线后在正式域名重跑实图核验，放开索引时确认首页不阻止 Googlebot、图标不阻止 Googlebot-Image（含 robots 与访问控制）。**技术检查通过不等于 Google 搜索结果已更新**：重新抓取可能需几天至几周，满足条件也不保证展示；需要刷新时按 `search-platforms.md` 请求重新抓取首页，搜索显示状态另记。
5b. **`manifest.json` 的 `display` 按站点类型分情况判，不要照抄脚手架默认的 `standalone`。**
    判据一句话：问「用户把它装成 PWA 之后，能在里面完成什么」，答不出来就不做。
    - **网站本身有可用功能**（在线工具、SaaS、有登录态的产品）：可以做 standalone PWA——
      `display: "standalone"`、补 maskable 图标、`theme_color` 与页面 meta 一致。
    - **纯官网／营销站／给桌面或移动客户端引流的落地页／内容站**：不做 PWA——
      manifest 照样保留（favicon、`theme_color`、Android 书签图标仍靠它读取），
      但 `display` 设为 `"browser"`，不注册 service worker，页面上不出现浏览器的
      「安装应用」「添加到主屏」一类安装提示。
    - 【实测】曾有一个给 macOS 桌面客户端引流的纯营销官网，按脚手架默认配置生成了
      `display: "standalone"` 的 manifest，结果 Chrome 把这个官网当成可安装 PWA，
      弹出「在应用中打开」与图标更新一类对话框；装出来的「应用」和真正的桌面客户端
      同名同图标，用户装完才发现只是个网页壳，体验不升反降。Lighthouse 已经移除
      PWA 评分项，Google 排名也不看站点是否可安装为 PWA，去掉 standalone 没有 SEO 损失。

**B. 每页的词、文案与元数据**

6. 页面、FAQ 与 description 的需求追溯只见 [段 2 · 2.3](stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)。**目标词登记**：`.rankup/keywords.md` 里为每个页面写一行「URL ↔ 目标短语（原字符串）」，
   没有登记的页面不进 C 表第 3 行。
7. **无关区块剥离**：找出每页 SSR 文本里不属于目标文案的区块（价格表、UI 控件标签、单位、法务文案），
   改客户端加载；能做到交互门控注入的用交互门控（做法与断言见 [`seo-ssr.md`](../seo-ssr.md)「做法二：首次真实交互后再注入」）。
   判据是 `seo-audit.mjs --density-only` 的 top15 里没有 UI 词。
8. **每页独立 TDK 与 OG**：title、description、`og:title`、`og:description`、`og:image`（≥1200px 宽）逐页不同；
   页内至少一张真实 `<img>`（懒加载可）；`og:image` 尺寸声明写真值；`og:image:alt`、JSON-LD `image`、
   image-sitemap 一并补齐。**全站共用一张 `og:image` 不通过。**
9. **`llms.txt`**：列出真实存在的路径与一句话说明，不是模板；与 sitemap 逐条对得上。

**C. 上线前闸门：九行硬性检查（0–6 + 4b + 4c），逐行要证据，不是工具清单**

上线前复用 `checklists.md` D1 / D4 / D12 / D13 与 P3 的判据。延迟脚本等性能优化须回归所影响模板的 head、交互与分析上报；共享模块覆盖其消费模板，本项增补只针对上面这组开发期判据，不要求每次小改都重测无关页面或平台；段 4 九行闸门（0–6 + 4b + 4c）仍按第 12 条对每次页面改动全套重跑。

下表每一行都要在预览域产出可核验的证据，证据落进 `.rankup/` 对应文件；
**只跑了命令、没留下证据不算过这项**，口头「应该没问题」或控制台一个绿色图标都不算证据。
预览域的 `noindex` / `Disallow: /` 是**设计**，不是缺口——闸门 1、2、4 里因此报出的 robots 类问题
记「设计，段 5 放开索引后复核」，其余问题照常修。

| # | 检查项 | 命令 / 方法 | 客观通过条件 | 证据落点 |
|---|---|---|---|---|
| 0 | 站点身份 | 人工核对预览域 HTML | OG 元数据（`og:title`、`og:image` ≥1200px，**逐页独立**）与图标全集（见本段 A 节）预览域 200，`manifest.json` 引用全部命中真实文件；无占位扫描零命中 | `.rankup/integrations.md` |
| 1 | 技术 SEO | 抓取 `sitemap.xml` 逐条请求；抓取全站内链逐条请求；请求 `/robots.txt` | sitemap 条目与真实 URL 集合一致、零 404；内链零 404、零 `href="#"`；`llms.txt` 存在且其列出的路径与真实 URL 集合一致（不是模板占位）；robots 除设计中的预览封锁外未误挡应收录路径 | `.rankup/audit.md` |
| 2 | TDK | `node <rankup-skill-dir>/scripts/seo-audit.mjs --sitemap <sitemap-url> --json`（零依赖、零配额、零登录）遍历**全站每一个 URL**（不是抽样——抽样测不出「没人想起来改」的那一页）核对 title/description/keywords/H1/OGP/canonical/robots/构造化データ | 全站 title 互不重复、description 互不重复、`og:image` 互不重复、长度在搜索引擎截断阈值内；**每页恰好一个 `h1`**，零、多个都不通过；必修观察项清零（seo-audit 只出事实记录，按 [`seo-box.md`](../seo-box.md)「seo-audit 判读指引」判读，`fetchError` 也必须为零；预览域的 NOINDEX 记为设计）；`--json` 输出的 `issues` 数组逐条检查 | `.rankup/audit.md`（逐 URL 记录，不是一条总述） |
| 3 | 关键词密度 | `node <rankup-skill-dir>/scripts/seo-audit.mjs --sitemap <sitemap-url> --density-only`（日本語は `Intl.Segmenter('ja')` で分かち書き、1/2/3-gram）。对每页**先在 `.rankup/keywords.md` 里登记本页目标短语**（B 节第 6 条），再在密度输出中核对该短语的实际占比 | 密度落在自然区间；**声明的短语与测量的短语必须是同一个字符串**，测别的短语等于没测；top15 里没有 UI 控件词（否则回 B 节第 7 条剥离）。薄页面「密度太高」与「内容太少」是同一个事实：解法是把内容做厚，不是删关键词讨好指标 | `.rankup/audit.md` |
| 4 | GEO / AI Agent 就绪度 | `node <rankup-skill-dir>/scripts/is-agentic.mjs scan <preview-domain> --save`（零配置，公开 API，结果存 `.rankup/agentic/`） | 有一份带分数与逐项 Essential/Recommended/Bonus 结果的基线报告；**每条 `partial`/`failed` 都必须独立核实，不是照抄结论**——实测一次 75 分「Ready with a few material gaps」报告里，2 条 Essential `partial` 核实后不成立（误报 soft-404，实测 4 个不存在路径均返回真 404；误报缺失 no-JS 内容，实测预渲染页面原始 HTML 里有 4,800–7,000 字符正文），核实后据实改判或记录驳回理由 | `.rankup/agentic/<domain>/<date>.json` + 核实结论写入 `.rankup/audit.md` |
| 4b | GEO 内容形状 | `bash <rankup-skill-dir>/scripts/aitdk-opencli.sh <url>` 抓 AITDK 面板（读 `aitdkPanel.sections.geo.raw`；前置条件见 [`seo-box.md`](../seo-box.md)「AITDK 面板全自动取数」），跑不起来才退回「请用户在 GEO 标签页跑一页贴回报告」，再 `curl` 全站数 `<table>/<blockquote>/<cite>/<h3>/<time>` 与 JSON-LD 字段逐页核 | 判据见 [`checklists.md`](../checklists.md) 段 4「闸门 4b」；**先分「设计」与「缺口」**：robots 类三项在预览域恒 FAIL 是故意的 | `.rankup/evidence/aitdk-geo-<date>/` |
| 4c | AITDK 全站报告 | 按 sitemap 抽样（首页 + 每类模板页各至少一个 + 全部法律/关于/联系页），一条命令跑完整批：`bash <rankup-skill-dir>/scripts/aitdk-batch.sh <url1> <url2> …`（默认 `--window dedicated`，按真实窗口容量自动降并发；单屏机器上安全串行、不抢焦点，有多显示器才真并发，见 [`seo-box.md`](../seo-box.md)「窗口模式：dedicated 默认、真并发的边界」），前置条件同 4b | 判据见 [`checklists.md`](../checklists.md) 段 4「闸门 4c」：Issues 标签页零问题，带评分的标签页逐项满分；不满分/有问题的逐条修完重跑，改不动的写明原因并在 `checks.md` 标 ⏸ | `.rankup/evidence/aitdk-full-<date>/` |
| 5 | 哥飞开放 API 数据复核 | `官方 `gefei-page` Skill 调用 `page_coach <代表页 URL> --raw --out <证据文件>`；有目标词再 `onpage_audit <URL> --keyword "<词>" --raw --out <证据文件>`，见 `seo-webcafe.md` | 各建议与本地 A/B/D 事实逐条核对，采纳/拒绝附理由；每次记录 `requestId`、`credits.charged` | `.rankup/audit.md` + `.rankup/evidence/` |
| 6 | 性能 / Core Web Vitals | 判据见 [`checklists.md`](../checklists.md) 段 4「闸门 6」：抽样首页 + 每类模板页各至少一个 + 一个内容/说明页，`node <rankup-skill-dir>/scripts/pagespeed.mjs collect <抽样 URL…> --strategy both` 直接抠完整 LHR JSON 落盘，交给 AI 判读，落 `.rankup/evidence/pagespeed-<date>/`（2026-09-12 起默认路径，opencli 驱动真实可见 Chrome 无人值守出分）；`pagespeed.mjs plan …` 只打印链接、不采数，是没有 opencli / 非 macOS 时的兜底——**链接必须在真实前台可见的浏览器标签页里打开才会读数**（2026-08-31 起走网页版，零 key 零配额），隐藏面板/无显示环境打开会卡在「Running analysis」永远不出分。**网页版一屏同时给实验室（Lighthouse）与现场（CrUX）两套数据；单跑 Lighthouse 只有实验室那一半，这条闸门会「只过一半而表面是绿的」**（见 [`seo-box.md`](../seo-box.md) 「一 · PageSpeed 网页版 → 补上闸门 6 缺的那一半」，同节也记录了 **Web 字体总字节判据**与**只认 PSI 网页版、本地 Lighthouse 不能替代**这两条，判据详见 [`checklists.md`](../checklists.md) 闸门 6）。`--strategy both` 是移动端与桌面端都跑（默认只跑其一），CLS 一类只在桌面触发的问题必须靠它才看得到。**预览域几乎不会有现场数据，原样记「现场无数据（流量不足）」，不是 0、不等于通过，别留空**；段 5 上线后在正式域名补现场那一半 | 通过条件只引用 [`checklists.md`](../checklists.md) 段 4「闸门 6」，现场与实验室不一致时先查测量环境——已实测一个站 Lighthouse 每次都读到 CLS 0，同期 Cloudflare 现场数据在同一元素上读到 0.127，原因是那类位移只在 Windows 桌面 Chrome 的经典滚动条上发生（macOS/iOS 覆层滚动条不占布局宽度，结构上不可能触发），实验室机器根本没跑过那个平台，读到 0 什么都不能证明；**先验仪器再信读数**——同一批测试里发现某沙箱浏览器 `document.visibilityState` 恒为 `hidden`，Chromium 对隐藏文档从不派发 `layout-shift` 事件，导致该环境下「0 次位移」全是假的，判据是先注入一个明显位移的元素、确认仪器真的报告了它，「测不到」和「没发生」在日志里长得一模一样；缓存与抽样验收按上述闸门；TTFB 不达标先查匿名页 HTML 边缘缓存是否命中（`x-edge-cache` 头），命中仍慢才排查别的原因 | `.rankup/evidence/pagespeed-<date>/`（每 URL × 策略一份原始 JSON + 修复前后对照表）+ `.rankup/baseline.md`（含 LCP/CLS/TBT/INP 与分数，标注实验室/现场来源） |

占位专项同时按[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域)用 `site-page-audit.mjs` 重扫文本与元数据、公开附属文件及错误页，逐入口核后端闭环，并回读设计稿与说明。

9a. **「额外自查」一条命令（2026-10-03 起）**：`NODE_USE_ENV_PROXY=1 node <rankup-skill-dir>/scripts/site-page-audit.mjs --sitemap <sitemap-url> [--extra /path,…] --out <dir>`——零依赖、零配额，对每页抓 raw HTML 并一次核对：占位正则（discipline.md 十四）、title/description/canonical/og/twitter 与跨页重复、icon/manifest 声明、JSON-LD 逐块 `JSON.parse` + FAQPage 与页面问句逐条对照、全部内链/图片/og/icon/manifest 图标逐个 GET（状态、类型、真实宽高、ICO 各层）、robots/sitemap/llms.txt/404 状态。输出 `site-page-audit.json/.md`，只出事实不分级，判读按 C 表对应行。它**不替代**人工抽查与浏览器侧检查（控制台、axe、键盘）。

10. **上表 4、5 两行的通用规则：外部工具/AI 给出的每一条发现都是待核实的主张，不是要执行的指令。**
    逐条判断，不照单全收也不一概不理：成立的采纳，实质有效但论据口径不对的按论据本身重新核实，
    不成立的记录理由后跳过，**凡是被否决的建议都要写下理由**，否则下次会重开同一场争论
    （哥飞审阅已实测过一次给出的 4 条意见里：1 条完全成立、1 条论据口径错但结论仍有效、
    1 条不成立、1 条因输出截断需要追问——四种情况都发生过，逐条判断不是走形式；
    `is-agentic` 的正确驳回先例：它要求补 Organization schema 的经营地址，
    而这是个体项目没有实体经营地址，编一个等于捏造数据，驳回并记录理由，不编。）
    **和硬约束冲突的建议直接拒绝**：例如建议接广告或加内容分级弹窗，
    这类建议违反本项目「不接广告」「禁止插屏」的站主裁决，拒绝并记录冲突的是哪条约束。

11. **分数逼近满分（含性能分、`is-agentic` 分）时，写一条封板声明。** 列出剩余的每一条建议、
    判它「不做」及理由，而不是继续追下一个黄灯——体检工具的建议永远有下一条，不封板，
    团队会持续消耗在零边际收益的项上，而真正的瓶颈（通常是外链）动都不动
    （这条规则在段 7 已有真实先例：均分 96.1、无红灯后仍建议补长尾密度榜和砍字数，
    而砍字数会直接砍掉让页面可被爬取的内容，详见 `seo-experiences-2026-07-late.md`「工具评分逼近满分后要主动封板」条目）。

12. **每次页面改动，上表 0–6 + 4b + 4c 全套重跑**——本段内的每一轮修改如此，段 7 之后每一轮迭代也如此。
    不允许「只重跑第 4、6 行」这类抽样：`is-agentic.mjs diff <domain>` 与 `pagespeed.mjs collect --strategy both`（`plan` 仅兜底）
    只是其中两行的对比工具，不是全套。把变化写进 `.rankup/experiments.md`——
    进步或倒退要用对比数字说话，不能只断言「应该更好了」。

### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| A1 | 标记在 **16px 实测**下定过，不是只看 512px 效果图 | `.rankup/integrations.md` |
| A2 | 标记不是等长条、箭头、放大镜、齿轮这类会被读成工具栏按钮的形状 | 同上 |
| A3 | 图标是矢量重绘的，**没有直接拿生成模型的位图缩小** | 同上 |
| A4 | 整套图标一次做齐，逐个预览域 200 | curl 各路径 |
| A5 | `manifest.json` 的每一条引用都命中真实文件，**没有指向不存在的尺寸** | curl 各路径 |
| A5b | `manifest.json` 的 `display` 按站点类型判过：站点本身有可用功能才 `standalone`；纯官网/营销站/引流落地页/内容站强制 `browser`，未注册 service worker，预览域没有出现安装提示 | `.rankup/integrations.md` |
| B6 | 每个进 sitemap 的页面在 `keywords.md` 有「URL ↔ 目标短语」一行，短语是原字符串 | `.rankup/keywords.md` |
| B7 | 无关区块已改客户端加载或交互门控注入；`--density-only` top15 里没有 UI 控件词；若用交互门控，无头零输入下 SSR 不含该区块、单击后出现 | 密度输出 + 无头测试 |
| B8 | 全站 title / description / `og:image` 三样逐页互不重复；每页至少一张真实 `<img>`；`og:image` 尺寸声明是真值 | seo-audit `--json` |
| B9 | `llms.txt` 的路径与 sitemap 逐条对得上，没有模板行 | curl + diff |
| C0–C6 | 上线前闸门九行（含 4b、4c）逐行有证据，落点按 C 节表格。**只跑了命令、没留证据不算过**；预览封锁引起的 robots 类问题标了「设计」 | `audit.md` / `agentic/` / `baseline.md` / `evidence/` |
| C-占位 | **上线 review 必含占位专项**：按 sitemap 逐 URL grep [`discipline.md`](../discipline.md) 十四的正则，零命中；人工抽查首页/定价/关于/联系/法律页每个链接可点、每张图有内容；**本轮 review 必须重跑，不采信上一轮（含段 3 开发期）的结果**——页面在这之间可能又动过 | grep 输出（逐 URL）+ 人工抽查记录进 `.rankup/audit.md` |
| C10 | 外部工具与 AI 的每条发现都逐条判过；**被否决的都写了理由**，与硬约束冲突的写明冲突的是哪条 | `.rankup/audit.md` |
| C11 | 分数逼近满分时写了封板声明，剩余建议逐条判「不做」及理由 | `.rankup/audit.md` |
| C12 | 本段内每一轮页面改动之后都**全套**重跑了 0–6 + 4b + 4c，对比数字进了 `experiments.md`；**没有「只重跑某两行」的记录** | `.rankup/experiments.md` |

### 输出

- 完整图标集与 `manifest.json`，且全部经预览域 200 校验；`manifest.json` 的 `display` 已按站点类型（有可用功能 vs 纯营销/引流/内容站）判过，不是照抄脚手架默认值。
- `.rankup/keywords.md`（页面 ↔ 目标短语登记）
- 上线前闸门九行（0 站点身份 / 1 技术 SEO / 2 TDK / 3 关键词密度 / 4 GEO·AI Agent 就绪度 / 4b GEO 内容形状 / 4c AITDK 全站报告 / 5 哥飞开放 API 数据复核 / 6 性能·CWV）逐行的通过证据，按上表落进 `.rankup/audit.md`、`.rankup/agentic/`、`.rankup/baseline.md`、`.rankup/evidence/`。
- `is-agentic.mjs scan --save` 产出的基线报告；哥飞开放 API 数据复核与 `is-agentic` 发现的采纳/拒绝记录，拒绝项附理由。
- `.rankup/experiments.md`（每轮改动的全套对比）

### 完成门禁

图标集每个文件预览域返回 `200` 且 `manifest.json` 的引用全部命中真实文件；标记经过 16px 实测；
`manifest.json` 的 `display` 按站点类型判过，纯营销/引流/内容站的预览域没有出现浏览器安装提示；
每个页面登记了目标短语且密度测的就是那个字符串；无关区块不在 SSR 文本里；
全站 title / description / `og:image` 逐页独立且每页有真实图片；`llms.txt` 与 sitemap 一致；
上线前闸门九行（0–6 + 4b + 4c）全部在预览域核验通过，且每行都留下了表中要求的证据文件；
TDK 与内链检查覆盖**全站每一个 URL** 而非抽样；`is-agentic.mjs scan --save` 已跑出基线且每条 `partial`/`failed` 都有独立核实结论；
哥飞开放 API 数据复核已跑且每条建议有采纳/拒绝记录，拒绝项附理由；性能三类页面的实验室结果已记录、现场一栏如实记「无数据」；
若分数已接近满分，附一条封板声明；本段内每次页面改动都有一份全套重跑记录。

### 交给下一段的

| 交给下一段的 | 下一段会怎么用它 | 如果这项缺失会怎样 |
|---|---|---|
| 预览域上全绿的九行闸门证据 + `is-agentic` 基线 + 性能基线 | 段 5 绑正式域名、放开索引后只需重跑确认 `noindex` 已摘、robots 类「设计」项转绿；段 7 把这份基线当「变更前」状态 | 段 5 要在正式域名上从零做体检，上线被拖后数天；段 7 没有基线就没有 diff 可言 |
| 哥飞开放 API 数据复核与 `is-agentic` 发现的采纳/拒绝记录 | 段 5、7 复查同一批建议时直接读这份记录，不重新审一遍、不重开已有定论的争论 | 每轮迭代都要重新和同一个工具辩论一次同样的建议，浪费接口积分也浪费时间 |
| `.rankup/keywords.md` 的页面 ↔ 目标短语登记 | 段 6 把外链对准这些页面；段 7 每轮改动后按同一登记重测密度 | 外链撒网式投放；密度每轮测的都是不同的短语，前后不可比 |

### 新增内页 / 新模板的随手清单（2026-09-12 回流）

**每加一个内页或一个新模板都要过这份清单，不是只在段 4 集中体检时才想起来。** 页面拆合与需求追溯只见 [段 2 · 2.3](stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)，目标词、TDK、OG 操作见本段 B 节第 6–9 条；这份清单补的是**每次新增都容易被漏掉的连带动作**——它们不会让当页的密度或 TDK 检测变红，却会让页面在别处（内链闭环、接入白名单、体检抽样）里悄悄失效。客观通过条件在 [`checklists.md`](../checklists.md) 段 4 对应行，本节不重复。

| # | 规则 |
|---|---|
| P0 | **先出 SEO Brief 再写内容**：字段与问法、FAQ、description 的追溯只见 [段 2 · 2.3](stage-2-positioning.md#23-问法簇--页面--faqdescription与站点结构)，登记进 `.rankup/keywords.md` 该 URL 对应行（来源枚举见 [`playbooks/research/p2-keyword-root.md`](../playbooks/research/p2-keyword-root.md#小语种候选词三关与本地竞品取词) 收尾一节）；没有 Brief 就起稿，容易写完才发现和意图对不上。**非英语页按 Brief 重新生成**内容，不逐句翻译英文页——标题、功能描述、FAQ、按钮文案都按当地表达（见 [`experiences/webcafe-experiences.md`](../experiences/webcafe-experiences.md) 三）；含文字的配图（截图类、需要展示界面文案的场景图）叠字用目标语言，不是套英文版换皮——`/imagegen` 本身不生成图内文字，文字都是后期用 HTML/CSS 叠上去的，叠字这一步叠当地语言 |
| P1 | 目标词先登记进 `.rankup/keywords.md`（同本段 B 节第 6 条）；title 40–60 字且主词在句首，分隔符按语种（日文站用全角「｜」，不要沿用拉丁站的 `-`/`\|`）；description 140–160 字且含本页真实事实（具体数量、尺寸、线索数这类不能套模板的数字）；H1 唯一且含目标词；H2 ≥ 2、H3 ≥ 2 |
| P2 | **内容形状随模板带**，不是写完正文才想起来补：规格类信息用 `<table>`；至少一条外部来源用 `<cite>` + 真实外链；FAQ 用 H3 结构并配 `FAQPage` JSON-LD（页面结构卫生项，不是被 ChatGPT 引用的收益依据，见 [`seo-ai-search.md`](../seo-ai-search.md)「FAQ Rich Results 下架」）；页面带更新日期。**模板化生成的内页正文 ≥ 150 字且必须含本页独有的事实**——同一模板生成两百多页却是同一套话术，会被判定为薄内容；首屏第一句话就说清这一页解决什么，不要让用户往下滚才明白 |
| P3 | **每页独立 og 图**（真实图片，体积 > 10KB，不是共享同一张模板底图）；canonical 自引；内链闭环三件套：面包屑、同类上一项/下一项、回分类页。批量新增与分页时，全部可索引内容须从分类页或可抓取分页的 SSR 真实 `<a href>` 到达，不能只靠客户端按钮、搜索或无限滚动；无需全塞首页或全部进 sitemap。分类页样板控件文案放进 aria-label，不进 SSR 正文；抓取内链图并与可索引路由清单对账，包含 sitemap 外页面 |
| P4 | 新页上线要同步进四张清单，缺一个页面就在某处静默失效：边缘缓存白名单（[`cloudflare-stack.md`](../cloudflare-stack.md)「12. 匿名页面 HTML 边缘缓存」的适用范围）、markdown 内容协商白名单（本段 D9）、sitemap（仅当有独立搜索意图，见本段 D10）、IndexNow 增量推送 |
| P4a | 页面 lastmod 从实际内容源 Git 历史与真实 updated 字段自动生成；日期纪律与上线收尾见 [IndexNow 操作](../search-platforms.md#无状态-lastmod-窗口与页面日期) |
| P5 | **新模板上线前，PageSpeed 抽样必须专门覆盖这个模板**，不能只抽已有模板的页面代表全站——**实测某分类页模板加了规格表和 FAQ 之后 DOM 体积变大，TBT 从 120ms 回落到 280ms**，同样的改动放到内容更简单的模板上可能完全没有影响。任何一次改动都要按 [`checklists.md`](../checklists.md) 闸门 6 全套重跑，不是只测改动的那一页 |
| P6 | **无 JS 内容占比**：shadcn/Tailwind 的类名天然会拉高 HTML 里非文本字符的占比，这本身不是问题，但正文文本量要够——判据仍是本段闸门 3 的密度检测；重复出现的样板区块（如 P3 提到的批量控件文案）不进 SSR 正文，理由同上 |
| P7 | 按[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域)重扫新增内页渲染产物，并逐入口回读实现；缺数据区块按唯一源处置。 |
| P8 | 新内页上线前按 [`seo-geo.md` 的 GPT 推荐位自查清单](../seo-geo.md#新站上线后-gpt-推荐位自查清单)过一遍。 |


### sitemap 的内容日期

每个 URL 的 lastmod 取该页组件、文案/i18n、内容数据的最近 Git 提交日期与真实 updated 字段的较大者，格式 YYYY-MM-DD；列表页取自身与直接列出内容的最新日期。不要使用构建当天、手写统一日期；共享布局组件、robots、IndexNow key 与 CI 改动不刷新全站。构建/CI 使用完整 Git 历史（`fetch-depth: 0` 或等价方式）。静态框架在构建脚本生成 URL 日期映射；TanStack Start 在构建时注入映射供 sitemap 使用；Next.js 在 `app/sitemap.ts` 读取内容源 Git 历史并生成 MetadataRoute.Sitemap。按路由明确列依赖，不要把全目录或共享布局一概当全站内容。新增内容页同步登记依赖。

运行 `node <rankup-skill-dir>/scripts/sitemap-lastmod-check.mjs <域名>`，再用实际内容变更前后证据验证对应日期变化；全站同日可能是新站历史真实情况，须人工核实，快照本身不能证明自动更新。
