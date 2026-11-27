# seo.box：一张外部工具清单，用来给 rankup 的工具地图做对账

## 目录

- [先说清它是什么，免得按错的期待去用](#先说清它是什么免得按错的期待去用)
- [对账结果：28 条逐条判定](#对账结果28-条逐条判定)
- [会员实测：判定不能靠推断，要用登录态验](#会员实测判定不能靠推断要用登录态验)
- [本轮真正落地的三件事](#本轮真正落地的三件事)
- [seo-audit 判读指引](#seo-audit-判读指引)（全文在 [`seo-audit-reading.md`](seo-audit-reading.md)）
- [什么时候回来读这一篇](#什么时候回来读这一篇)

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

关键词研究的顺序与裁决只见 [entry.md](playbooks/entry.md)；问法链路见 [seo-geo.md](seo-geo.md)，逐问法 Google 读法见 [seo-serp.md](seo-serp.md)，官方工具调用见 [seo-webcafe.md](seo-webcafe.md)。

## 对账结果：28 条逐条判定

判定口径与 `.rankup/integrations.md` 一致：**✅ 已覆盖**（rankup 里已有等价或更好的路径）/
**➕ 值得接**（真缺口，本轮已处理）/ **❌ 不接**（附裁决依据，`rankup review` 不要反复催）。

### 工具区（16 条）

| 工具 | 判定 | 依据 |
|---|---|---|
| Google Search | ✅ | 逐问法盘面取证与判读见 [seo-serp.md「逐问法 Google 读法」](seo-serp.md#逐问法-google-读法) |
| Similarweb | ✅ | `backlink/scripts/similarweb-query.mjs` / `similarweb-batch.mjs`，能力边界见 [`provider-capabilities.md`](provider-capabilities.md) |
| Semrush | ✅ | `backlink/scripts/semrush-*.mjs` 一组 |
| Ahrefs（主站） | ✅ **且被低估了** | 见下方「会员实测」一节：免费 AWT 档的 Site Audit 是完整的，`scripts/ahrefs-site-audit.mjs` 取它 |
| Ahrefs Keyword Difficulty Checker | ❌ | KD 已有官方 `gefei-keywords` Skill 的 `keyword_difficulty`（哥飞版盘面）与 `semrush-keyword.mjs`（带 `globalVolume`）。Ahrefs 免费版一次一个词、要账号、给不出盘面，接了是**第三个口径**，只会制造对不上的数字 |
| Ahrefs Backlink Checker | ❌ | 同上。外链走 `backlink` Skill 的既有链路（Semrush 引荐域 + `ledger.mjs` 证据阶梯）。免费版只给 Top 100 外链且要注册，**不足以支撑任何判断，却足以让人以为查过了** |
| Ahrefs Website "Authority" Checker | ❌ | AS/DR 这类第三方权重分在 rankup 里只作为**相对参照**出现，`semrush-overview.mjs` 已经给 AS。再引一个厂商的分数会诱发跨厂商比大小，那是无意义的 |
| WooRank SEO Health Checker | ❌ | 全站逐 URL 体检走 `scripts/seo-audit.mjs`；代表页的哥飞复核走官方 `gefei-page` Skill。WooRank 免费额度极小且要注册，**覆盖不了「全站每一个 URL」这条闸门 2 的硬判据** |
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
| AITDK Extension | ✅（SEO 标签页）/ ✅（GEO 标签页，2026-09-11 起可脚本化） | AITDK **SEO** 标签页的能力已被 `scripts/seo-audit.mjs` 复刻（它的头部注释就写着「AITDK 相当」），且脚本能跑全站，扩展只能看当前页。**GEO 标签页**（引用 / 表格 / 数字 / 作者 / 日期 / sameAs / H3，曾在示例站点实测）`seo-audit.mjs` 不覆盖，判据在 `checklists.md` 闸门 4b。**旧结论「报告靠用户贴回」已作废**：2026-09-11 起 `scripts/aitdk-opencli.sh` 用 opencli 直接读面板 iframe，15 个标签页（含 GEO）一次跑完，详见下方「AITDK 面板全自动取数」 |
| Wappalyzer | ➕ 能力值得要 | **技术栈识别在段 1 的竞品拆解里有真实用途**（对方用什么建站、挂了哪些分析/广告/支付 → 反推变现方式，直接喂 [`lifecycle/stage-1-research.md`](lifecycle/stage-1-research.md) 1.3 竞品变现分析）。但其 API 是付费 `x-api-key`（实测 2026-08-29），**免费替代见下方「技术栈指纹」一节** |

### AITDK 面板全自动取数（`scripts/aitdk-opencli.sh`）

**【实测 2026-09-11】** 一条命令把 AITDK 面板的 15 个标签页全抓下来，不需要人手点、不需要贴回。
**2026-09-12 复测通过（扩展 1.1.1，两站 16 个 URL 全部 15/15 section）**——修的是上面那条 1.1.0 已知回归。

```bash
bash <rankup-skill-dir>/scripts/aitdk-opencli.sh <url> [session-name] [output.json] [options]
```

- `session-name` 默认自动生成（URL 哈希 + 时间戳，不是固定字面量），两次不传会话名的并发调用不会撞同一个标签页；`output.json` 默认 `./aitdk-report-<domain>-<时间戳>.json`。
- `--skip-panel` 只跑 Part A（页面自身 HTML/robots/sitemap/whois），不碰扩展——**没装扩展、或只想要页面事实时走这条**。
- `--window dedicated`（默认，2026-09-25 起）| `--window foreground`（兜底）：见下方「窗口模式：dedicated 默认、真并发的边界」。多个 URL 用 `scripts/aitdk-batch.sh`，不要手写循环调这条命令。

### 窗口模式：dedicated 默认、真并发的边界（【实测 2026-09-25】）

2026-09-25 之前这条脚本硬编码 `--window foreground`——每次跑都会把用户的 Chrome 窗口抬到前台、切走他正在看的标签页，命中 [`discipline.md`](discipline.md)「四条最常被违反的」第 3 条红线。改成默认 `--window dedicated`（OpenCLI 专用窗口：不聚焦、不进用户窗口，标签页在自己的窗口里保持 `visible`）后实测：

- **AITDK 在 dedicated 窗口里工作正常，和 foreground 没有差别**：<站点> 全量单跑，15/15 section 有内容、0 错误、**2 分 13 秒**（对照旧版 foreground 基线 2 分 08 秒，同一量级）；全程 `osascript` 读前台 App 名字保持 `Claude` 不变——**零抢焦点**，用户的窗口、标签页全程未被触碰。
- **同一台单屏机器上，真正同时可见的 dedicated 窗口上限是 1，不是脚本能调的**：OpenCLI 扩展在创建第 2 个专用窗口前会做一次容量检查（`assertDedicatedCapacity`，`extension/src/background.ts`），按显示器面积 ÷ 硬编码的 900×620 最小格算出 `capacity`；**这条检查不认 `--window-bounds`**——即使调用方显式给了更小的、互不重叠的坐标，第 2 个窗口照样在创建那一步直接报错 `dedicated-pool-exhausted`，不是「挤出来一个更小的窗口」。本机单屏 1512×949（point，对应 3024×1964 physical Retina）算出来的 `capacity` 就是 1；`opencli browser <s> window status -f json` 的 `pool.capacity` 是权威数字，改不了（没有对应的 env/flag，改要动 OpenCLI 扩展源码，不在本 Skill 范围内）。
- **`scripts/aitdk-batch.sh` 已经按这个事实设计**：跑前先查 `pool.capacity`，请求的 `--concurrency` 大于真实容量就自动下调并打印原因，不会无脑发起注定失败的并发请求；单屏机器上因此表现为**安全串行**（一个一个跑，不抢焦点），不是失败。哪怕并发数已经正确下调到 1，如果这台机器上**同时还有别的 opencli 会话在用专用窗口**（哪怕只是一个空闲未关的窗口——`assertDedicatedCapacity` 数的是"窗口存在"不是"窗口忙"），仍会报同一个错；脚本对这个错单独识别、退避 20 秒再重试，而不是立刻按普通失败处理。
- **真正的多窗口并发需要第二块（哪怕是虚拟的）显示器**：OpenCLI 的专用窗口机制原生支持 `--window-display` 把不同 slot 分别钉到不同显示器，每块显示器各自单独算 `capacity`；只要有一块够大的（或几块都过 900×620 门槛的）第二显示器，`aitdk-batch.sh` 现成的分块摆放逻辑无需改动就能生效。本机确认没有现成的虚拟屏（`system_profiler SPDisplaysDataType` 只有内建屏；`betterdisplaycli` 已装但 `/Applications/BetterDisplay.app` 缺失，是个没装完的 brew cask，需要 `brew reinstall --cask betterdisplay` 才能用）——这是系统级、影响整台共享机器桌面的改动，本次没有动，留给用户/主线程决定要不要开。

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

**实测成绩**：一个已上线的小游戏站，15/15 有内容、0 错误、2 分 08 秒，结束后无残留会话（脚本自己关面板、关 session）。**每抓完一个 section 落盘一次**，所以中途被打断也留得下半份结果。

### 多个 URL：`scripts/aitdk-batch.sh`（不要手写循环）

```bash
bash <rankup-skill-dir>/scripts/aitdk-batch.sh [--concurrency N] [--out-dir DIR] [--retries N] [--skip-panel] <url...>
```

`--concurrency` 默认 3，但会按上一节「窗口模式」实测的真实容量（`pool.capacity`）自动下调——单屏机器上这意味着实际是安全串行，不是并发失败；有第二块显示器时同一份代码不需要改动就能真正并发。每个 URL 独立输出 JSON + 独立日志，失败重试一次（`--retries` 可调），产出 `manifest.json`（每 URL 的 `status`/`duration_sec`/`output`/`error`，失败记具体原因，不写成 0 分）。即便在单屏机器上只能串行，也比手写循环调 `aitdk-opencli.sh` 好：默认 `--window dedicated` 不抢用户焦点（旧脚本的 `--window foreground` 每次都会抢），失败自动重试、有汇总，不用自己攒这套逻辑。

**输出 JSON 的形状：**

| 字段 | 内容 |
|---|---|
| Part A 字段 | `url` / `title` / `metaDescription` / `canonical` / OGP / Twitter card / `robots` / `hreflang` / `headings` / `links` / `images` / `structuredData` / `robotsTxt` / `sitemapExcerpt` / `whois` |
| `issues` | 页面级问题数组。含 `placeholder-domain-leak`——**`og:url` / `canonical` / `og:image` / `twitter:image` 里出现 `example.com` 时触发**，正是两个同栈站点出过的 `SITE_URL` 没在构建期注入、占位域名泄到线上的失败模式 |
| `aitdkPanel.sections.<name>` | 每个 section 一个对象，含 `raw`（面板全文）与 `fields`（尽力配对出来的键值） |

### AITDK 研究报告离线分流

用于 [P2 关键词竞争与竞品页面证据](playbooks/research/p2-keyword-root.md#关键词竞争与竞品页面证据p2--p4-共用)与 P4 竞品研究；研究顺序见 [entry.md](playbooks/entry.md)。先用现有 `aitdk-opencli.sh` 保存完整报告，再离线筛选已有文件；不重新采集有效报告。

```bash
bash "$RANKUP/scripts/aitdk-opencli.sh" '<目标URL>' '<独有会话>' report1.json
# 其他页面同样各存一份完整报告，然后统一离线处理：
node "$RANKUP/scripts/aitdk-triage.mjs" report1.json report2.json --out '<output-prefix>'
```

输出 `<output-prefix>.json` 保存完整筛选结果，`<output-prefix>.md` 给 AI 默认阅读统计与异常页。JSON 的 `pages[]` 含 `url/source/status/findings[]`；每条 finding 含 `code/kind/evidence/ref/recheck`。需要复核时按 `ref` 的 **`file#JSON-pointer`** 定点读取原字段，结合 `recheck` 操作，不反复展开整份 raw。

命令 stdout 仅输出统计和产物路径。退出码 `0` 表示处理完成，`2` 表示已写报告但有输入/采集缺口，`1` 表示参数或输出错误；都不代表网站质量评分。`review` 是待判读线索，`reported-defect` 是原采集器明确记录的错误，`capture` 是取证缺口。体积统计使用 UTF-8 字节与 Unicode 字符数，未测 tokenizer 时不声称精确 token 节省。输入文件保持原样，输出不得与输入或另一输出互为同文件/符号链接/硬链接。

- 正常项只统计数量，不逐条推送。先看采集状态：15 面板仅部分完成、采集错误、必要字段缺失均须显式保留；未知/采集错误不能算通过或竞品缺陷。
- `meta keywords` 缺失、固定字数或关键词密度不作为**研究筛选**的硬失败。AITDK GEO 分是页面结构观察，不是 ChatGPT 自然推荐证据（采样与三清单见 [seo-geo.md](seo-geo.md)）；AITDK 分数不等于 Google 评分或 KD；机械异常只能产生复核线索，不能穷尽页面承诺与真实功能不符的问题。
- **本脚本只做研究分流，不做上线放行。** 无异常不等于全站合格；段 4 / `rankup review` 仍按现有闸门检查完整报告，所有标红/标黄及未满分项的修复、复跑与解释要求不变。

**解析器短板（消费这份 JSON 之前必须知道）：**

- **Overview 的 Title / Description / Keywords 是三行一组**（标签、字数计数、值），`fields` 里拿到的是**计数**不是真值；真值在 `unpaired` 或 `raw` 里，要读文本。
- **Issues、Structured、Headings 是散文式排版**，`fields` 基本为空；研究时先读离线异常摘要，确需复核才按指针读取相应 `raw`，不要默认展开全部面板。
- **重复标签会合并成数组**（例如面板里两个 `Unique`）。
- **【实测 2026-09-13】GEO 的总分是切标签页之后才播动画画出来的，读早了会拿到假分数**：有时读到的
  `raw` 只有五个分类名重复两遍、没有任何数字（`bodyLength` 看起来有 190 左右，不算「空」，触发不了
  上面通用的空内容重试）；有时结构齐全，但最上面的总分停在 `0 / 100`（动画还没播完）。两种情况脚本
  都不报错，此前会被原样写进报告。`aitdk-opencli.sh` 现在对 GEO 单独做了稳定性重试（`geo_score_from_text()`：
  找 `GEO Score` 之后几行内第一个纯数字行，非空且不是 `0` 才收，最多等 18 次 × 10 秒）；仍然拿不到，
  `aitdkPanel.errors` 里会留一条 `geo: score unsettled after retries...`，且 `aitdkPanel.ok` 为 `false`，消费报告前先查这条，
  不要直接把 0 分或空分当成真实结果。

判读时的规矩不变：**脚本只采集，判读归你**；`fields` 空 ≠ 这项没问题，先看 `raw`。

**原理一句话**：AITDK 面板是挂在页面里的 `https://extension.aitdk.com/` 跨源 iframe，脚本走 opencli 的 `frames` + `eval --frame` 直接读它的 DOM——不用剪贴板、不用坐标、不靠截图。为什么必须用合成键盘事件开面板、为什么不能 reload 页面、为什么点击要发完整指针序列，这些细节在 `opencli` Skill 的 `references/browser-driving.md` 与脚本头部注释里，本文件不重复。

**什么时候用**：段 3 / 段 4 的上线前自检（闸门 4b 的 GEO 那半截），以及竞品或自站的 SEO 体检。比人工打开面板逐页复制快得多，且能批量跑一批域名。

**作为段 4 / `rankup review` 闸门用时**：跑全部 15 个标签页而不只是 GEO 一页，判据见 [`checklists.md`](checklists.md) 闸门 4c，本节不重复写。

**【猜测，2026-09-13，未过 `discipline.md` 十五的五层分诊，不得当结论用】GEO 的「缺问句式标题」「缺答案前置结构」两项判据疑似只认英文句式**：
一次非英语站点的实测里，正文已经按 GEO 警告的字面要求补了该语言的问句式标题（含该语言自己的疑问标点/疑问助词）与答案前置结构，
线上部署确认新文案生效后重新抓 GEO 报告，分数与警告文案完全没变。这个现象很像 AITDK 判断这两项时用的是英文关键词/句式启发式、
不识别非英文的疑问句结构，但**这一轮只做到分诊阶梯第 1 层都不到（一次观察，没有重跑、没有换会话、没有人眼对照、没有跨页/跨时段复现）**，
不能当成「AITDK 对非英文页面有 XX 缺陷」的结论去用，也不能据此判定「这条 GEO 建议对非英文站可以不用管」。

下次再遇到「改了内容、分数纹丝不动」时，按 [`discipline.md`](discipline.md) 十五的五层分诊走完再下结论，这条现象额外建议：
同一轮至少挑 2–3 个语言结构差异明显的页面对照（例如同站的英文页 vs 目标语言页，或语言结构完全不同的另一个站的同类页面），
确认「分数不变」只出现在非英文页面而非全站性的缓存/延迟问题（分诊第 1、5 层），并在人眼对照那一层（第 4 层）直接盯着
GEO 报告里这两项的原文措辞，看它是否真的只匹配英文疑问词/英文答案结构模式。走完五层、确认是平台判据本身的语言覆盖问题，
才把结论正式写进 [`provider-capabilities.md`](provider-capabilities.md) 或 [`checklists.md`](checklists.md) 闸门 4b，并同步撤销这条【猜测】。

### 博客区（4 条）

| 来源 | 判定 | 依据 |
|---|---|---|
| Google Search Central Blog | ✅ 已是一手源 | [`seo-growth.md`](seo-growth.md) 的算法更新时间线与 2026 AI 搜索范式整节就是从它整合来的。**排障定位时先查它，不要查二手解读** |
| Google Search Blog（blog.google） | ✅ | 面向大众的产品公告，与上面那条互补；算法细节仍以 Search Central 为准 |
| Semrush Blog | ❌ | 厂商内容营销，结论普遍缺前提条件。同类判断我们用 [`experiences/`](experiences) 那一组——**那里每条都带证据等级** |
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
官方 `gefei-keywords` Skill / Semrush 和 `backlink` Skill），而是**自有站点的第二台爬虫**：

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

**一 · PageSpeed 网页版（补上闸门 6 缺的那一半）与 LHR 直抠**：全文移到 [`seo-audit-reading.md`](seo-audit-reading.md)。

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
[`lifecycle/stage-1-research.md`](lifecycle/stage-1-research.md) 1.3「竞品变现分析」要的那一行结论（**他赚谁的钱、怎么收**）
往往一次 `curl` 就能定：

```bash
curl -sSL -A 'Mozilla/5.0' https://competitor.example -D - -o body.html | head -40
grep -oiE '(gtag|googletagmanager|clarity\.ms|cloudflareinsights|plausible|umami|posthog|stripe|paddle|lemonsqueezy|creem|adsbygoogle|carbonads|ezoic|mediavine)' body.html | sort -u
```

命中 `stripe`/`paddle`/`lemonsqueezy`/`creem` → 卖订阅或买断；
命中 `adsbygoogle`/`ezoic`/`mediavine` → 靠广告，那么**它的商业模型是流量规模**，
定位对标时不能照抄它的功能取舍（见 [`lifecycle/stage-1-research.md`](lifecycle/stage-1-research.md) 段 1 必做动作第 8 条（1.3 节）：
照抄一个变现方式不同、不可比的竞品是明确的失败模式）。

还有一个已经在 rankup 里的更强工具：`scripts/demand/site-network.mjs`
按 GA/GTM/AdSense ID 反查同一批人的站群。技术栈指纹是它的单站版本。

## seo-audit 判读指引

`seo-audit.mjs` 只出观察记录，error / warning 分级与判读全文在 [`seo-audit-reading.md`](seo-audit-reading.md)。

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
