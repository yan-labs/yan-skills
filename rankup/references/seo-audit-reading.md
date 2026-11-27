# PageSpeed 与 seo-audit 判读

> 从 [`seo-box.md`](seo-box.md) 拆出（2026-11-27）：PageSpeed 网页版与 LHR 直抠、`seo-audit.mjs` 观察记录的分级判读。

### 一 · PageSpeed 网页版 → 补上闸门 6 缺的那一半

[`checklists.md`](checklists.md) 段 4 闸门 6 的判据是
「**实验室与现场数据都记录，不一致以现场为准**」。在此之前那一行的「怎么做」只写了
「跑 Lighthouse」——Lighthouse 只给实验室数据，**现场那一半没有任何工具**，
于是这个闸门长期只能过一半，而表面上是绿的。这正是本 Skill 反复警告的失败形态。

**取数走网页版 `pagespeed.web.dev`，不走带 key 的 PSI API**（2026-08-31 改）。
网页版零 key、零配额、零账号，而且比 API 多给两样东西：CrUX 的**样本量档位**
（「许多样本 / 少量样本」）和新的**「智能体浏览」类别**——API 都不返回。

```bash
# 默认路径：驱动本机 Chrome 采数，报告出分后直接抠完整 Lighthouse LHR JSON 落盘，
# 不需要人工打开网页、不再靠人肉点开「展开视图」——见下方「LHR 直抠」一节
# （默认 dedicated 专用窗口，扩展将会话标签设为该窗口活动标签；本机已实测出分）
node <rankup-skill-dir>/scripts/pagespeed.mjs collect <url> <url2> <url3> --strategy both

# 兜底：只出链接与读数清单，不采数（零依赖，随时能跑；把 <url> 换成自己要测的站）。
# 拿到链接后必须在可见的浏览器标签页里打开，隐藏面板/无显示环境打开会卡在
# 「Running analysis」永远不出分——仅在这台机器没有 opencli、或 collect 持续报 tab-hidden 时才用
node <rankup-skill-dir>/scripts/pagespeed.mjs plan <同样几个 url> --strategy both
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
   **2026-10-04 修订：`collect` 默认使用 `--window dedicated` 专用窗口**，
   扩展把会话标签设为该窗口活动标签，满足可见性要求，无需抢用户前台窗口。
   依据是当日任务 brief 提供的本机实测：另一进程在 dedicated 窗口跑 PSI 已出结果；
   本轮未重跑线上 PSI，跨环境及最小化、遮挡时的表现未验证。
   `--no-foreground` 为兼容别名，等同默认；仅显式 `--foreground` 才使用 foreground
   与 hidden 时的 activate 兜底，会抢用户前台窗口，仅在用户明确要求看着时用。
   历史 foreground + activate 实测可出分，不代表 PSI 必须抢系统前台。
2. **跑不出来 ≠ 没有数据。** `collect` 把两种卡住分开报：`tab-hidden`（标签页
   不可见）与 `budget-exhausted`（可见但没跑完——实测有站跑满 240 秒仍在跑）。
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

### LHR 直抠：collect 不再靠读文字（2026-09-12 起）

在此之前 `collect` 只采「截图 + `document.body.innerText`」两个证人——**只拿得到
可见文字**：折叠的「展开视图」明细（网络依赖关系树、每条 opportunity 的逐文件表、
旧版 JavaScript 的浪费字节与具体 polyfill 名、缓存 TTL 表、LCP 细分、第三方分解、
非合成动画元素）全部读不到，逼着人一遍遍点开「展开视图」手动核对，一天里因此走了
好几轮弯路。

**实测确认**：pagespeed.web.dev 用官方 Lighthouse report renderer 渲染报告时，
完整 LHR（Lighthouse Result）JSON 就挂在页面全局 `window.__LIGHTHOUSE_MOBILE_
JSON__` / `window.__LIGHTHOUSE_DESKTOP_JSON__`，报告一出分这两个变量就已经就绪，
`JSON.stringify` 直接拿到手就是完整 LHR，`audits` 下每一条的 `details.items`
（包括 `subItems` 里逐文件、逐 polyfill 的明细）原样都在，不需要点开任何「展开
视图」。移动端和桌面端是同一次分析里两个独立标签页、各自独立报告，`collect`
按 `form_factor` 分两次单独打开（而不是开一次页面再点标签切换），确保「当前
active tab」与「本次请求的那一端」对得上——**同一个 gauges>0 的就绪信号不区分
是哪一端的报告先渲染完，必须专门等本次请求那一端自己的全局变量就绪，等的时候
只信 gauges 会把还没就绪的那一端读成 `undefined`**（2026-09-12 实测踩过）。

现在 `collect` 每个 (URL × 端) 落 4+2 份文件：`<tag>.lhr.json`（原始完整 LHR）、
`<tag>.summary.json`（结构化摘要：分数、四指标、LCP 细分、缓存 TTL、旧版 JS、
依赖树、第三方分解、非合成动画、逐条 opportunity/diagnostic/insight 全量、
network-requests 前 20 条）、`<tag>.summary.md`（人读版，逐条审计连同
`subItems` 逐文件/逐 polyfill 明细都展开成表格）、`<url>.combined-summary.md`
（`--strategy both` 时移动端/桌面端指标并排对照），加上原有的截图/页面文本
双证人兜底。三级降级：a) 页面全局变量（默认，已验证稳定）→ b) 报告工具栏
「Save as JSON / Copy JSON」+ `opencli … clipboard` 读剪贴板（未逐一测过所有
报错分支）→ c) 展开所有「展开视图」+ 读 innerText（`summary.md` 里标
`source: "innerText-fallback"`，只保证人工可读，不保证结构化）。

已知限制：这两个全局变量名是 pagespeed.web.dev 前端实现细节，没有公开契约，
随时可能改名或改结构，脚本靠三级降级兜底但 fallback 下的数据完整度会打折；
经典审计 id（`uses-long-cache-ttl` / `legacy-javascript` /
`network-dependency-tree` / `third-party-summary` / `render-blocking-resources` /
`font-display`）在较新 Lighthouse 版本里已并入「Insights」新命名
（`cache-insight` / `legacy-javascript-insight` / `network-dependency-tree-insight` /
`third-parties-insight` / `render-blocking-insight` / `font-display-insight`），
脚本两种 id 都收，按 LHR 里实际存在的那个取。**闸门 6 的证据落点从此改成
`lhr.json` + `summary.md`**，不再要求人工把「展开视图」截图当证据。

**Web 字体字节预算是闸门 6 的独立项**（【实测】多站复现）：慢 4G 下字体总字节直接吃
FCP/LCP。CJK 站用 Google Fonts 会按 `unicode-range` 拆成上百个子集，文字越多拉得越多，
总量可达 1MB 级；`font-display: swap`/`optional` 只解决绘制阻塞与位移，**不省字节**，
而 `preload` 更会让字体抢在 HTML/JS 前面占带宽。判据：CJK 站默认系统字体栈（不下载）；
拉丁站自托管并子集化到实际用到的字符与字重，可变字体裁掉不用的轴，单站字体总量控制在
几十 KB 级；不 `preload` 首屏用不到的字重；改动前后看 PSI 网页版的「第三方/资源分解」与
「网络依赖树」两个区块的字体总字节，不要只看 `font-display` 有没有设对。

**装饰性字体两全法：品牌字体不必用分数换**（【实测】一站验证，PSI 分数与 LCP 改前改后不变，
字体 40KB → 12KB 子集，切换位移 0.02px）。背景：CSS 里声明的 webfont 是 `VeryHigh` 优先级，
Lantern 一律计入首绘依赖图（见本节「Lantern 优先级模型」），`async`/`font-display`/`preload`
都改变不了这一点，看似「品牌字体 vs 分数」只能二选一。两全做法：
1. **首屏之前不声明**：CSS 里不写该 `@font-face`、不 `preload`；`window.load` +
   `requestIdleCallback` 之后用 FontFace API 加载（`new FontFace(...).load()` →
   `document.fonts.add` → 给 `html` 加 `.font-ready`），只在 `.font-ready` 选择器下切换
   `font-family`——Lighthouse 的首屏依赖图里因此没有这个请求，真实用户在首屏出现后半秒内
   看到品牌字体。
2. **子集化到实际用到的字符**：标题/标签文案是有限集，`pyftsubset` 按实际字符集与用到的
   字重出 woff2，可变字体裁掉不用的轴，目标几十 KB 以内。
3. **零位移**：回退字体用 `@font-face` 的 `size-adjust`/`ascent-override`/
   `descent-override`/`line-gap-override` 做度量匹配（fontaine/capsize 一类工具算），
   切换前后 `getBoundingClientRect()` 位移 ≤ 1px，CLS 不动。
4. **不要把字体加载挂在分析脚本的交互触发器上**，用 `load` 事件即可；关键 CSS 提取时
   确认 `.font-ready` 规则不在关键片段里。
适用范围：标题、标签、logo 文字这类装饰性字体；正文字体仍按「CJK 系统字体栈 / 拉丁自托管
子集 + optional」的既有规则。验收：PSI `network-requests` 前 15 条无该字体、分数与 LCP 与
改前一致、CLS ≤ 0.1，外加真实浏览器 3 秒后截图确认字体已切换。

**本地 Lighthouse（simulate 或 devtools 节流）不能替代 PSI 网页版**（【实测】同一时刻
本地 93–99 分而 PSI 57 分的情况出现过，纯字节量问题在本地节流下不显形）：闸门 6 只认
PSI 网页版读数，本地 Lighthouse 只用于迭代定位；读报告的顺序是「第三方分解 / 网络依赖树」
先于「渲染阻塞资源」审计——先看字节量，再看阻塞关系，顺序反了容易把字节问题误判成纯粹的
加载顺序问题。

作为闸门用时判据见 [`checklists.md`](checklists.md) 闸门 6，本节不重复写判据。TTFB 判据与匿名页面边缘缓存做法同样见 checklists 段 3 / 闸门 6，不在本节重复。

**Lantern 优先级模型只裁 FCP 依赖图，不裁 LCP 依赖图**（【实测】多站对照、逐项 A/B 复现；此前「降优先级能连带把 LCP 移出依赖图」的推论已被证伪，本条据此修订，不并列保留旧推论）。PSI 移动端分数由 Lantern 模拟器给出，它判断一个请求要不要计入 **FCP** 依赖图，看的只是资源的请求优先级：`VeryHigh` 一律计入，`High` 且资源类型是 Script/Document 也计入；`async`/`defer`/`type="module"`/`rel="preload"`/`font-display` 这些属性本身**不参与判定**，只是间接改变了请求会被浏览器标成哪档优先级。客户端入口 bundle、`modulepreload`（属 High+Script）、`rel="preload" as="style"` 的 CSS（属 VeryHigh）、以及没有被预加载的 webfont（默认 VeryHigh）都会被算进 **FCP** 依赖链，拖慢首绘。**LCP 依赖图不看这些非图片请求的优先级，只看它们是否会在实际绘制发生之前完成**——给 `modulepreload`/入口脚本加 `fetchpriority="low"`（Cloudflare Worker 场景可用 HTMLRewriter 流式改写响应头/属性）能显著收敛 FCP（实测移动端从约 2.4s 降到约 1.2s），但文字型 LCP 基本不变，降优先级只是让浏览器晚一点抢带宽，不会把请求从「是否卡住绘制」这件事里摘出去。真正影响 LCP 的是**这批 hydration 相关请求有没有在首帧绘制之后才开始加载**：可在边缘用 HTMLRewriter 把响应流中 head 里的 `modulepreload` 与入口脚本标签先整体移除，首帧渲染完成后再把同一组标签原样插回触发加载，hydration、交互能力与 SSR 正文均不受影响，实测移动端 LCP 从 3.8–4.7s 降到 1.9–2.4s。代价：挪到首帧之后执行的 hydration 长任务会被计入 TBT，桌面端 TBT 会因此出现单次波动，不能只跑一次就下结论，要多测几次取中位数。给字体加 `preload` 仍会把它的优先级从 VeryHigh 降到 High、移出 **FCP** 依赖图，这条只对 FCP 成立，不受本次修订影响。判据：PSI「LCP 细分」里 TTFB 很小、但「元素渲染延迟」高达上千毫秒且看不到明显阻塞资源时，先查 hydration 脚本是否在首帧之前抢跑，而不是先去改请求优先级；FCP 慢才去查该页面的 VeryHigh/High 子资源清单。本地 Lighthouse 常常复现不出这条——TTFB 慢导致本地观测到的首绘时间点早于这些 VeryHigh/High 请求完成的时间点，要复现需要把页面连同静态资源一起镜像到本机 `127.0.0.1`，让 TTFB 与线上边缘缓存处在同一量级。

**入场动画会污染 LCP 与 Speed Index**（【实测】）：首屏内容如果用 `opacity: 0` 起始、靠 `animation-delay` 落在 1–5 秒的入场动画淡入，Lighthouse 的 trace 窗口从不与用户交互，几乎每次都会在动画中途截到新的 LCP 候选，表现为「LCP 比 FCP 晚 1 秒以上、Speed Index 异常高，而同模板去掉动画的页面读数正常」；判据同闸门 6 D7 一行——首屏内的入场/循环动画一律 gate 到用户首次交互之后触发（用 `html.<class>` 一次性开关，不设定时兜底），或者干脆不要用 `opacity` 做首屏内容的初始状态。

**文档体积超出 Lantern 初始拥塞窗口会多算一跳 RTT**（【实测】）：约 14.6KB brotli 是 Lantern 模拟的文档初始拥塞窗口，依赖图里只剩文档本身时，LCP 最后 0.2–0.5 秒的差距通常就对应文档超出这个窗口的字节数，此时同文档内去重 SVG（`symbol`+`use`）对 brotli 体积几乎零收益，只有把内容整段移出文档（外部 sprite、异步加载的 CSS）才真的省字节；判据见 checklists.md 闸门 6 排查顺序最后一项。

**PSI 双峰多数不是「平台抖动」，是站点自身**（修正上一轮结论，【实测】）：同一时段拿一个已知稳定的对照站一起测，对照站分数稳定就说明抖动出在自己站上，不能默认甩锅给测量平台；PSI 结果没有同时段对照站陪测，不得下「这是后端/平台抖动」的结论。

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
[`seo-webcafe.md`](seo-webcafe.md) （仅作工具入口）的
「`string` 的判读：三套 TDK 长度口径，别混着引」小节。

密度（unigrams/bigrams/trigrams）没有「正确值」：它是给判读者看「这页在向搜索引擎
强调什么」的证据，不做阈值判定。

