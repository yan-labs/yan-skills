# Rankup SEO 与增长参考

本文件保存数据驱动的 SEO、关键词、内容、索引、性能和增长经验。只有当前任务涉及这些主题时才读取；项目特有的事实和结果写入项目 `.rankup/`，不要追加到本文件。

## SERP 快照有保质期，「窗口在关闭」必须带复测日期

**SERP 快照是易腐品。** 一份两个月前的 top10 已经不能用来立项，
尤其当你当初写下的判据本身就是「这里有空位」——空位存在的时候，别人也看得见。

已验证的翻车路径：某簇关键词初次调研时 top10 里真工具页只有两家，其余是仓库、论坛、视频凑数，
判为最大机会并**在文档里自己写下「窗口在关闭，这一条要快」**；两个月后复测，
同一个词 **8/10 已全是专门为该词制作的页面**，难度从「容易」变成「困难」，
进入前十的引用域预算翻了三倍。**预警写对了，但没有配上复测动作，等于没写。**

因此：

1. **任何写下「窗口在关闭」「要快」「先发优势」的结论，必须同时写一个复测日期**，
   而且间隔要与预警强度成反比——判为「窗口在关」的词，复测间隔不得超过一个月。
2. **换一把尺子复测，不要只重跑同一个数据源。** 不同工具的难度分口径不可互换
   （同一个词在两家工具可以是 14 和 68），但**盘面构成是客观的**：
   top10 里「专门为该词制作的页面」有几个，这个数字跨工具一致，也是唯一值得跨期对比的量。
3. **立项前的最后一次复测必须是当天的。** 用两个月前的快照立项，
   等于拿别人已经吃完的机会做计划。

## SERP 是关键词难度的最终裁决，难度分只是线索

**任何关键词在立项前必须看完整 top10，不能只看工具给的难度分。**
难度分是估算模型的输出，而各家工具的「领先者/竞争者」列通常**只给第一名** ——
第 2 到第 10 名藏着什么，只有实际拉一次 SERP 才知道。

**而且要在多个引擎上各看一遍，亲眼看。** Google 与 Bing 是两套独立索引，对同一个词的取舍经常不同；做非英语市场时目标国的本地引擎（Naver / Yandex / 百度 / Seznam）首页构成可能与 Google 完全不一样。二手 SERP 接口看不到版式、SERP 特性占了多少屏、也看不到 AI 答案引用了谁——那些恰恰是决定「这盘面还有没有独立站空位」的部分。做法与要记的七样见 [`demand-sources.md`](demand-sources.md) 第一·五节。

判据是**看对手是谁，不是看分数是多少**。按信号强弱排：

**正向（可攻）**

- **top10 出现免费托管的个人页**（个人子域、代码托管页、免费博客平台）
  → 该词几乎无人认真竞争，**最优先**。
- **top10 出现论坛帖、代码仓库、应用商店页、官方文档，或同一视频平台占多席**
  → 搜索引擎找不到足够多真正解决问题的页面，只能拿这些凑数。
  一个即开即用、不要求登录的专门页面有明确空位可占。
- **top10 里出现意图混杂的结果**（例如「工具页」和「素材下载页」混排）
  → 引擎自己也没分清意图，一个定位清晰的页面有位置。

**负向（跳过）**

- **top10 有把工具页当获客漏斗的融资公司** → 跳过，不管难度分多低。
  最容易重复踩的一类是**「某平台 + 某功能」型关键词**：先问一句
  「有没有一整个 SaaS 品类把这个平台当主战场」。有的话难度分一律不可信，
  而且**高 CPC 反而是危险信号** —— 那是这些公司在竞价，不是词好做。
  这一条的判断在这里，不在脚本里：`demand/keyword-value.mjs` 只负责给出每个词的
  CPC 数值和同批中位数，「远高于中位数 ⇒ 先查 SERP 再信难度分」由 AI 对着这两个数判，
  判读方法见
  [`demand-discovery.md`](experiences/demand-discovery.md#cpc-怎么读脚本demandkeyword-valuemjs)。
- **少数几个域名反复占满 top10**（去重后只剩两三个域名）
  → 新站难插入。**这类词的低难度分是「没人在优化」，不是「容易排上去」。**
- **top10 是素材库、下载站或内容站而非工具站** → **意图不匹配**，
  做一个工具去接这个词排不上去。难度分不含任何意图信息，
  凡是「做工具接某个词」的判断都必须先确认排前面的确实是工具页。
- **精确匹配域名扎堆且都是垂直老站** → 成熟小生态，难度分往往低估。
  这类词仍可作为站内的一个功能，但不适合当获客主入口。

**高难度分未必要放弃。** 难度分衡量的是「排到第 1 需要多少权重」，
不是「整个前十有多难挤进去」。若 top10 除榜首外都是小站甚至免费托管页，
说明只有榜首那个高权重站在守 —— 目标定为进 top10 拿流量而非抢第 1 时，
这类词同样值得评估，不必一律推到最后阶段。

实践比例可以作为预期：验证一批「难度分低」的候选词，
**被 SERP 否掉两三成是正常的**。省掉这一步，被否掉的那些会直接变成计划里的首选项。
**一次验证发现的规律要立刻提炼成判据**，否则同一个陷阱会在下一个词上原样重演。

### 域名命名不构成扩品类的约束，别为此纠结

一个反复出现的伪问题：「用精确匹配的关键词域名，还是用可扩展的品牌词？」

**用 SERP 数据自己回答**：统计已排进 top10 的域名里，有几个**同时覆盖了多个不相关品类**。
实测这类跨品类域名普遍存在，而且其中包括**名字与所排品类毫无关系的**
（一个名为「查重复内容」的域名同时排进图片压缩与文字工具两个簇），
以及**名字极窄的描述性域名跨到邻近品类**的情形。

结论：**域名叫什么，对能不能往下加品类几乎没有影响。**
因此不必为「描述性域名会不会锁死品类」纠结 —— 这个担心没有数据支持。

同样地，想验证「域名含关键词是否排得更高」时，**必须先剔除平台级巨头**
（视频站、论坛、搜索引擎自家产品、大厂官网）。它们排名高与域名命名毫无关系，
留在对照组里会把差距凭空放大。剔除前后的结论可能完全不同 —— 这是实际踩过的方法错误。

由此，域名选择应当按**好记、好口述、拼写无歧义**来定，而不是按 SEO 来定。
另外注意：热门品类的精确匹配 `.com` 通常早已被注册完毕，
这条路往往在决策之前就已经不存在了。

### 泛品类词往往没有流量，不能当品牌锚点

「用一个自带搜索量的泛品类词做域名」听起来很美，但**先查它的实际体量**。
这类词（某某工具、免费某某之类）常常总量极小，还混着机构内部系统的导航词，
比任何一个具体任务词都小一个数量级。

规律：**流量在具体任务词上，不在品类统称上。** 域名承担不了拉流量的角色，
它只需要好记。这反而是好消息 —— 选择空间大得多，也不必为溢价域名付钱。

### 一个站还是多个站：看现任赢家怎么分的

判据同样在 SERP 里：**统计跨品类域名的数量与形态**。
若已有多个域名同时吃下你打算做的这几个品类，说明合并成一个站是被验证过的打法，
且一个域名的权重全站共享，比建多份权重省得多。

变现方式不同（例如广告品类与付费品类）**不构成拆站理由** ——
成熟的综合工具站普遍是「免费带广告 + 付费去限制」，两者是同一漏斗的两段。
需要处理的只是让付费品类的差异化卖点在它自己的落地页上讲清楚，这是文案问题不是架构问题。

### 小语种同义词的低难度分，默认是打分偏差而不是机会

常见诱惑：英语词很硬，但同义的小语种词难度分低得多、体量还不小。
**默认假设应当是打分模型对非英语市场的竞争度估算偏低**，而不是那里没人守。

验证方法是**在该语种自己的国家盘面上拉 SERP**（用全球或英语盘面看等于没看）。
判据很干脆：如果头部位置是既有产品的**本地化页面**（同一域名的 `/xx/` 路径），
且整屏没有免费托管页、没有论坛/仓库凑数，就说明这些公司早把多语言做完了，
每个位置都有真实产品占着 —— 否决。
反过来，只有在小语种盘面上**也**看到凑数位或个人页，才算真机会。

### 把 SERP 判断做成脚本，人只做裁决

这类验证是典型的可复用操作（换一批词就要重跑），必须固化成两段：

1. **采集**：批量拉 SERP，参数化关键词与**国家**，结果直接落进项目。
2. **机械分类**：把 top10 域名按名单归类，输出客观信号 ——
   免费托管页数、凑数位数、素材库数、漏斗 SaaS 数、成熟产品数、
   域名去重数、单域名重复占位数。

**分类器不应该输出「这个词能做」**，它只回答客观问题；能不能做是上层判断。
名单必然不完整，因此输出里要保留一个**「未分类」计数**，
明确提示还有多少域名需要人工看一眼再补名单 —— 假装全都认识才是危险的。

新分类器上线前**用已经人工判过的一批词做回归**：
它必须独立复现那些已有结论，才可以用于新词。
另外，空结果必须与「没有竞争」区分开 —— 去重域名数为 0 是采集失败或数据源缺口，
不是好消息，要显式提示重抓。

拉 SERP 时注意口径：这类页面常沿用账号上次选择的国家与设备。
「全球」这类聚合选项在 URL 里往往不生效，**换成具体国家代码通常可以钉住**；
无论如何都要把每个词实际所处的国家随结果一起记下来，不同国家的结果不可混读。
快照型数据还要记录快照日期 —— 它不是实时 SERP。

## Google 出站链接改成 `google.com/goto` 跳板（2026-08-26 官方确认推出）

**事实**（出处：seroundtable.com `/google-search-goto-tracking-41957.html`，Barry Schwartz，2026-08-26；Google 发言人已向该站确认；证据等级【实测+官方确认】）：

- 2026-07 开始测试，8 月底接近全量。Nozzle 的 Derek Perkins 在 X 上称
  「跨多家住宅 IP 提供商接近 100% 覆盖」，并给出四个月的占比爬升曲线。
- SERP 里的结果链接**不再是目标站的 href**，而是 `google.com/goto` 的**服务端跳转**，
  客户端链接被整体消灭。Perkins：goto 链接**无法解码**，抓取方只能逐条跟随跳转，
  「小规模测试能跑通，但每个 SERP 有上百条链接」。
- Google 官方口径只有一句「我们长期部署技术措施应对不断演变的滥用行为」，
  没有承认目的；行业解读是反抓取（SerpApi 诉讼 + AI 公司取数）。

**这对我们意味着什么（按动作排）**：

1. **任何「从 Google SERP HTML 按 `href` 取域名」的实现都会静默变错**——
   取到的全是 `google.com`。判域名改看**结果卡片上可见的 cite / 显示 URL**，
   不要读链接目标。跟随跳转在单条核查时可行，成批取数不可行。
2. **第三方 SERP / 排名 / KD 通道会跟着抖**（`serp-query.mjs` 走的 serper.dev、
   `seo-webcafe.mjs serp|kd`、Semrush 的排名表都是二手 SERP）。表现可能是变慢、变贵、
   字段缺失，或**悄悄降级但接口照样 200**。因此：**结果域名突然变少、变怪、
   或某个词的盘面一夜之间「空了」时，先怀疑通道，再怀疑盘面**——
   换一个源交叉验证过才允许写进 `keywords.md`。这条与「拿 HTTP 200 当取到了」是同一类错误。
3. **我们的 SERP 判据本身不受影响**：top10 的页面类型、专门经营比例、标题措辞
   都来自标题与可见域名，不依赖 href。受影响的是「点开看一眼」的成本——
   人工抽查从「逐条点」降到「挑 2–3 条最关键的点」。
4. **不要顺手改站侧归因口径**。该报道只讲 SERP 出站链接，**没有**给出 referrer 或
   分析数据的变化证据；在自己站上实测到差异之前，流量归因仍以 GSC 为准，
   不得据此调整分析平台的解读。

**复测线**：这是推出中的变更，`goto` 的形态和第三方工具的适配都会继续动。
凡是依赖二手 SERP 的调研，**引用超过一个月的 SERP 快照前先重跑一次通道自检**。

## 机会调研：先证伪，再汇总

宽泛种子词的调研里，**「体量大」与「值得做」经常是反相关的**。
体量最大的种子往往是新闻、赛事、影视、成人内容或平台名 —— 需求真实但不是工具需求，
且被平台级站点占满。而真正能做的，通常藏在体量中游、意图明确的长尾簇里。

因此汇总表必须配合逐条裁决读，**不能把「英文体量」这类总量指标当作排序依据**。
更实用的做法是先给每个种子做一次**否定判断**（这个种子有没有工具需求？
占位者是不是平台级？有没有法律或后端约束？），淘汰掉的种子不再进入横向比较。

同样重要的是**不要让任何汇总数字带有人为上限**。
统计列表若在生成阶段被截断（取前 N 条），汇总表里每个种子都会显示同一个数字，
看上去像巧合，实际是上限假象，会直接误导排序。凡是要进汇总的计数，一律不截断。

> **经验库原则**：凭数据说话，不凭直觉。只有跨项目成立、经过验证且剥离了站点敏感信息的结论，才允许回流本参考文件。

## 一、数据通道地图(2026-08 实测)

| 通道 | 用法 | 坑 |
|---|---|---|
| **GSC(真实点击,最高优先)** | claude-in-chrome 扩展操作用户真实 Chrome:`list_connected_browsers` 非空 → `select_browser` → `tabs_create` → 导航 performance 报告;每页行数调 100 逐维度读 | 扩展需在 Chrome 侧边栏用同账号登录后才配对;`find` 的 ref 点击自定义下拉可能不生效,改坐标点击 |
| **Google Suggest(真实输入,免费无限)** | `curl --retry 3 --retry-all-errors ${HTTP_PROXY:+-x "$HTTP_PROXY"} "https://suggestqueries.google.com/complete/search?client=firefox&oe=utf-8&ie=utf-8&hl=<hl>&gl=<gl>&q=<enc>"` | **oe/ie=utf-8 必带**,否则非拉丁文字结果丢失;`[512]` subtype = 高量词;空结果本身就是"无需求"的裁决 |
| **哥飞 SEO Agent 搜索量核实(Google Ads 级精度)** | `seo-webcafe.mjs chat --ask "查一下 <词> 美国的月搜索量，以及全球搜索量"`；返回分国家/全球月均量、趋势、竞争度、CPC | 强制登录(需 `SEO_WEBCAFE_COOKIE`);消耗 Agent 积分;适合单词验证,批量仍走 Semrush。**数据与 Google Ads Keyword Planner 一致**(2026-09-04 `ai image generator` 实测 US 823K / Global 2.24M 完全吻合),精度远高于 `kd` 的 `keywordVolume` |
| **哥飞 KD(难度+SERP 盘面)** | `GET https://seo.web.cafe/kd/api/v1/kd?keyword=&gl=`，使用服务商要求的认证凭据；或使用可用的 KD 工具 | 仅英文词;额度可能共享;凭据重置会使旧值作废。凭据只放用户级 Secret 系统，Skill 和项目仓库只记录名称、用途与存放位置。**注意：`kd` 的 `keywordVolume` 已被证伪(差 19–58 倍),需要月搜量时优先用上面的 SEO Agent 搜索量核实** |
| **哥飞 On-Page 体检** | `POST https://seo.web.cafe/audit/api/analyze` body `{url,keyword}`,header `X-AUDIT-Token`(token 内嵌在 /audit/ 页 meta,403 时重抓页面刷新) | 对阿拉伯文词数统计是假阳性(漏计),阿语页"内容过少"警告忽略 |
| **哥飞其余工具(MINE/TRANSLATE/WHY/VALUE)** | 走 OAuth session,无法无头自动化;VALUE 是纯前端计算器 | KD 的认证方式不代表其他工具也可复用 |
| **PageSpeed 网页版(lab + field 两套)** | `node <rankup>/scripts/pagespeed.mjs plan <url> --strategy both` 出链接,再在浏览器里打开 `pagespeed.web.dev` 读数 | **零 key 零配额**(2026-08-31 起停用带 key 的 PSI API)。跑分只在标签页真的可见时才渲染得完,后台标签页会一直停在 Running analysis;跑不出来**不等于**没有数据。本地 lighthouse median-of-N 仍可做同环境"修复前"基线,绝对值不可跨环境比 |
| **GSC Gen AI 效果报告(AI 曝光,2026-06 新)** | Search Console → 效果 → Generative AI 报告;追踪内容在 AI Overviews/AI Mode 中的曝光次数、页面、国家、设备 | 2026-06-03 上线,按子集推出,不是所有站都有;**暂无点击/CTR/查询词数据**;另有 opt-out 开关(不影响传统排名) |
| **死路(勿再试)** | **Semrush / Similarweb / Ahrefs 的全部程序化接口(API + MCP)**——共享账号代理**出借的是会话,不是账号**;API key 与 OAuth 同意页都住在账号设置区,面板不会递出来,绕过面板去取等于绕过访问控制。2026-08-27 逐家核实:Semrush Analytics/Projects API 要 Business 档+另购 units、MCP 与 HTTP 共用同一份 units(实测 units=0,**换客户端/换传输/重连 OAuth 都不会改变**);Similarweb Data API 与 MCP 要 Business/Enterprise/API-only 档;Ahrefs 2026-07-18 复验全接口 "Insufficient plan"。**浏览器抓取不是临时替代方案,它是这个账号形态下唯一正确的方案**(详见 `provider-capabilities.md` 四·五)。另:agent-browser 连真实 Chrome(Chrome 136+ 禁 CDP)、Google Trends(共享代理 IP 常年 429) | |
| 网络 | 本机 shell 直连部分外网 TLS 间歇重置(curl exit 35):Google 系/github/npm registry/ui.shadcn.com 走本机代理($HTTP_PROXY,按需)(node 系 CLI 另加 `NODE_USE_ENV_PROXY=1` 才吃 env,undici EHPA),git push 带 `HTTPS_PROXY`,所有 curl 带 `--retry-all-errors`;**api.cloudflare.com 反着来:必须直连**(2026-07-18 实证代理下 wrangler 全部 fetch failed,直连一次成)——wrangler deploy 不带代理+重试 | zsh 内联 for 循环易 parse error,写成 .sh 脚本跑;管道尾接 tail 会吞退出码,成功判定用输出 grep;刚部署完 workers.dev 可能瞬态回 CF 1042,几十秒自愈勿误判 |

> **2026-08 起，所有二手 SERP 通道都在 `google.com/goto` 的影响半径内**——
> Google 把 SERP 出站链接换成了不可解码的服务端跳转。通道异常先按上文
> 「Google 出站链接改成 `google.com/goto` 跳板」一节自检，不要直接当成盘面变化。

## 二、SEO 项目接入

项目目录结构、初始化模板、密钥元数据边界和状态对账规则统一读取 [`project-memory.md`](project-memory.md)，不在本文件维护第二份目录协议。

SEO 接入按三步进行：

1. **收集事实**：读取站点代码和线上 HTML，检查 sitemap、robots、canonical、hreflang、结构化数据、GSC、SERP、关键词、性能和已有转化路径。
2. **汇总落档**：把基线写入 `.rankup/baseline.md`，词库写入 `keywords.md`，技术发现写入 `audit.md`，取舍写入 `decisions.md`。
3. **形成计划**：将工作按 P0–P2 排序，每项写明动作、证据、预期影响和完成判定；已有站点直接从真实数据暴露的瓶颈开始，不重做无关的初始化。

允许并行做互不依赖的只读调查，但是否使用多 Agent 由当前执行环境和任务规模决定，不是 SEO 接入的前置条件。

## 三-A、机会池选型与冷启动(“鱼多人少”框架)

> **定位**:本节来自 Fiona 的出海经验分享,用于发现和筛选候选机会,不是已经被本站数据验证的结论。文章里的“四个月月入万刀”等个人结果没有可复核证据,不得写进项目基线或当作成功率依据。候选方向必须通过本 skill 的 GSC/Suggest/SERP/真实交易数据门禁后,才能进入 `.rankup/decisions.md` 和 `plan.md`。

### 1. 先选池子,再谈技术

新项目、新产品线或新词族在写代码前,先填一张【机会池卡】并回答四个问题:

1. **鱼(Demand):需求是否真实?** 至少找两条彼此独立的信号,其中至少一条是直接信号。直接信号优先级:GSC 已有曝光/点击或意外词簇 > Suggest 稳定联想与明确意图 > 持续而非一次性的搜索广告 > 可核验的付款、订阅、评论或榜单收入。讨论热度、单个爆款、竞品自述、有人发外链都只是弱信号。
2. **人(Competition):新手是否有可挤的位置?** 查最终目标词形的 SERP,记录前十标题专门经营比例、最弱占位者 DR、体验分、引用域和页面质量;再看领先站点的内容新增速度、外链增长和产品/定价成熟度。**有人买高价外链只证明有人投入,不证明项目盈利,更不等于我们也该买。**
3. **切口(Wedge):为什么轮得到我们?** 至少指出一个可验证缺口:内容型修饰词、衍生需求、语言/地区时间差、网页与 App 的渠道错配、结果格式差异、流程更短、体验更强或细分用户未被服务。只说“市场很大”“AI 很火”不算切口。
4. **钱(Monetization):具体赚谁的什么钱?** 四类里至少命中一类并能在页面上证明:省时间;帮业务赚钱/省人力;提供娱乐或情绪价值;把复杂流程包装成简单服务。写不出付款人、付费时刻和替代方案时,先不做。

**GO 门槛**:`D+C+W+M` 四项都有证据,且能定义一个低成本验证版本;缺任一项只能标 `RESEARCH`,不能因为技术能做就开工。

### 2. 跟踪高手留下的时间线,不抄结果页

- **外链时间线**:看早期先出现在哪些社区、目录、发布页和内容页,重点是冷启动顺序、目标页与后续结果;最终公开页必须核对 URL、重定向和 `rel`,不能把目录宣传或当前总外链数当历史证据。
- **新增内容**:通过 sitemap、lastmod、站内新页面、博客/工具发布日期持续记录竞品最近押注的词簇。竞品动作只生成候选假设,仍要回到 Suggest、SERP 和真实交易信号验证。
- **真实交互**:实际走完落地页 → 输入 → 生成/结果 → 注册 → 价格 → 支付前一步,拆标题、入口、示例、信任信号、等待反馈和付费点。学习其决策与漏斗,不要只让 AI 复制视觉样式。
- **通过鱼找人**:从新词前排、持续盈利产品和高质量分发位反查反复出现的域名/操盘者,建立观察清单;研究其可见动作,不把个人光环或社群宣传当证据。

### 3. 新手默认先“截流”,能造势的人再造势

- **截流**:承接已经存在、意图明确的搜索需求。用户已经知道要什么时,页面负责更快给出可用结果和顺畅付费路径;这是新站拿首批真实反馈的默认策略。
- **造势**:市场尚无搜索词时,依赖社媒、内容、红人和持续叙事创造需求。只有已有分发能力、内容产能和更长验证预算时才选。
- **热点不要只追第一层词**:沿“事件/模型 → 具体用途 → 衍生任务 → 地区/小语种 → 结果格式”展开候选词,逐层验需求与竞争。小语种晚爆发只是待验证假设,不能凭时间差直接建站。
- **模型词/平台词加风险门禁**:核对商标、冒充官方、模型/API 授权、内容安全、供应商价格与下线风险;能截到流量不代表能长期经营。

### 4. MVP 的目标是拿证据,不是批量制造薄站

- 页面、功能和后台流程可以从最小版本开始;人工处理只在交付真实、时效可控且不欺骗用户时使用。先定义页面唯一要验证的需求和付款理由。
- 从第一天记录 `landing → input → generation success → result action → signup → pricing → checkout` 漏斗。精准流量的价值要用激活、完成、留存或付款证明,不能把访问量和停留时长本身当成功。
- 赠送积分用于让目标用户完成足够次数的真实试用;进度动画、示例和明确状态用于降低等待焦虑。**不要为了“增加停留”故意放慢生成**,速度、成功率和感知等待要分别测。
- 每个版本只改少量变量,记录“保留什么、删掉什么、下一站复用什么”。复用基础设施可以,复制薄内容、相同页面和未经验证的词矩阵不可以。

### 5. 用连续小实验提高胜率,不用“大数定理”安慰盲目铺站

项目成功概率不独立、也不会长期固定;同一错误选词复制十次仍是十次同源失败。正确做法是为每个候选池设置:

- 固定的时间/现金/外链预算上限;
- 最小样本和观察窗口;
- `GO / ITERATE / KILL` 判据;
- 失败后必须更新的假设与下一轮唯一改进。

只有上一轮产生了可迁移学习,增加样本量才有意义。“多上站”应理解为**更快完成多个有止损的小实验**,不是同时养一批没有需求证据的站。

### 6.【机会池卡】模板

```md
候选池/最终目标词形:
需求证据(D): [直接信号] + [独立交叉信号]
竞争盘面(C): 前十专页比 / 最弱 DR / 体验分 / 引用域 / 投入速度
可切入缺口(W):
付款人和价值(M): 谁在何时为什么付费;替代方案是什么
高手时间线: 早期外链 / 最近新增页 / 关键漏斗
流量策略: 截流或造势;首个精准渠道
MVP 与漏斗事件:
预算上限 / 观察窗口 / 最小样本:
GO / ITERATE / KILL 判据:
结论: GO | RESEARCH | SKIP
```

## 三-B、2026 AI 搜索范式：引用 > 排名（Google 官方指南 + @googlesearchc 实测）

> **定位**：本节整合 Google Search Central 2026 年全年官方博客、@googlesearchc 推文、
> Google I/O 2026 公告、以及 Google 首份 AI 优化指南（2026-05-15）。
> 只收录 Google 官方发布或其官方账号确认的信息，第三方解读仅作佐证。
> 2026-08 更新。

### 核心判断：被 AI 引用比排第一更值钱

Google I/O 2026（5 月 19 日）宣布搜索 25 年来最大改版：AI Mode 月活突破 10 亿、
查询量每季度翻倍。**AI Mode 是全页替换，不显示传统结果；AI Overviews 叠在有机结果上方。**
被 AI 引用的品牌获得的有机点击比未被引用的竞品高 35%（Digital Applied，2026-03）；
而 Position 1 的 CTR 从 27% 跌到 11%（SISTRIX，2026-03，限有 AI 功能的查询）。
零点击搜索已达 58.5%（SparkToro/Datos）。

**对我们的影响**：传统排名仍有价值但不再是唯一目标。每轮 SEO 规划必须同时回答两个问题：
1. 这个词我能排进前十吗？（传统 KD/SERP 分析，已有流程不变）
2. 这个词的 AI 回答会引用我吗？（下面的新流程）

### Google 官方 AI 优化指南要点（2026-05-15 发布）

Google 明确说 **AEO/GEO 不是独立学科，就是 SEO**。以下是官方指南的完整可执行清单：

**该做的：**
1. **写非大众化（non-commodity）内容**——AI 自己能生成的摘要毫无引用价值；
   只有一手评测、原创数据、亲历经验才会被引用。
2. **保持可抓取**——AI 模型用的是公开可抓取的内容。技术 SEO 基础不变。
3. **页面结构清晰**——段落、小节、描述性标题，为人类写而不是为 AI 写。
4. **加多媒体**——高质量相关图片和视频，遵循既有图片/视频 SEO。
5. **负责任地用 AI 辅助写作**——内容必须达到 Search Essentials 标准。
6. **Merchant Center + Google Business Profile**——本地和电商内容的 AI 可见性靠这两个。
7. **关注 agent-readiness**——交易型站点为 AI agent 做好准备（Universal Commerce Protocol）。

**不该做的（Google 明确否定）：**
1. ❌ **不需要 `llms.txt` 或任何特殊 AI 文件**——Google Search 不使用它们。
2. ❌ **不需要把内容切成小块（chunking）**——Google 系统理解多主题页面。
3. ❌ **不需要为 AI 改写内容**——AI 理解同义词和通用含义。
4. ❌ **不需要在全网刷品牌提及**——虚假提及无效且有反噬风险。
5. ❌ **结构化数据不是 AI 引用的前提**——继续用它拿 rich results，但别指望它是 AI 通行证。

### Preferred Sources：品牌忠诚度成为 SEO 因子

2026-01-30 上线，04-30 全球全语言推出，05-27 扩展到 AI Overviews 和 AI Mode。
用户可以标记信任的出版商，标记后的来源在搜索结果中获得视觉标记且排名提升。
截至 05-27 已有 34.5 万个被标记的来源。**用户标记为 Preferred 的站点点击率翻倍。**

**对我们的影响**：经营自有受众（邮件订阅、注册用户、回头客）不再只是产品运营，
它直接影响 AI 搜索可见性。08-20 更新的文档还增加了自定义按钮引导用户设为 Preferred Source。

### Search Console 新工具：Generative AI 效果报告（2026-06）

2026-06-03 上线，目前按子集推出。报告包含：AI 功能中的曝光次数、页面、国家、设备、日期。
**暂无点击/CTR/查询词数据**（Google 称后续会加）。
另有 opt-out 开关：可以阻止内容出现在 AI 功能中，且不影响传统有机排名。

**对我们的影响**：段 7（7.2 与 7.3）的监控清单必须加入 AI 曝光指标。
在 `.rankup/baseline.md` 里新增 AI 曝光基线（可用时）。

### February 2026 Discover Core Update：Discover 独立算法

Google 首次为 Discover 发布独立核心更新（02-05 至 02-27）。
**Discover 现在使用独立于搜索的排名算法**，不再是搜索算法的副产品。
三个新信号：

1. **Topic Authority**——在特定主题上持续发布建立 Discover 可见性；追热点不再管用。
2. **反 Clickbait**——标题必须兑现内容承诺；依赖煽情标题的站流量跌 30-60%。
3. **本地相关性**——针对特定地区的内容优先推送给该地区用户。

**对我们的影响**：工具站受影响较小（Discover 偏内容消费），
但内容站必须把 Discover 当独立渠道规划，不能假设「搜索排好了 Discover 自然有」。
图片要求：1200px+ 宽度 + `max-image-preview:large` meta 标签，实测 CTR 高 45%。

### 2026 算法更新时间线（用于排障定位）

| 日期 | 更新 | 完成 | 要点 |
|---|---|---|---|
| 02-05 | February Discover Core Update | 02-27 | Discover 独立算法、Topic Authority |
| 03-24 | March Spam Update | 一天内 | 反垃圾 |
| 03-27 | March Core Update | 04-08 | E-E-A-T 仍核心、Information Gain 信号 |
| 04-13 | Back Button Hijacking 政策 | 06-15 执行 | 新 spam 类型，劫持浏览器后退按钮 |
| 05-07 | FAQ Rich Results 下架 | 06 月移除工具 | FAQPage schema 仍有效但不再产生富结果 |
| 05-15 | AI 优化指南发布 | — | AEO/GEO = SEO 的官方定论 |
| 05-21 | May Core Update | 06-02 | 常规核心更新 |
| 06-03 | GSC Gen AI 效果报告 | 按子集推出 | AI 功能曝光数据 |
| 06-15 | FAQ Rich Results 从 GSC 移除 | 08 月移除 API | — |
| 06-24 | June Spam Update | 06-26 | 年度第二次反垃圾 |
| 08-01~03 | 未确认排名波动 | — | 多工具检测到大幅波动，Google 未确认 |
| 08-18 | August Spam Update | 08-22 | 年度第三次反垃圾 |

**排障用法**：站点流量异常时，先对照此表看是否落在更新窗口内。
Core Update 完成后 2-4 周才能看到稳定影响。

### Information Gain：内容独特性成为排名信号

March 2026 Core Update 重新加权了 Information Gain——衡量一篇内容相对于
已排名内容增加了多少**真正新知识**。这不是新概念（Google 2020 年专利），
但 2026 是它被明确观察到影响排名的一年。

**对我们的影响**：
- 工具站的内容页不能只是同类工具页的改写，必须有独特切角。
- 「原创数据」「一手测评」「独特方法论」是 Information Gain 的三大来源。
- 与 experiences/webcafe-experiences.md 第九条（「已抓取但未编入索引」是内容问题）互证：
  Google 不只是不收低质量内容，它现在主动降权「没有新信息增量」的内容。

### Back Button Hijacking：新增 Spam 政策（2026-04 发布，06-15 执行）

劫持浏览器后退按钮现在是明确的 spam 违规，可触发人工处罚或算法降权。
**站主对第三方广告网络或互动脚本注入的劫持代码同样负责。**

**必检项**（加入技术审计清单）：
- 审计所有第三方脚本，确认无 `history.pushState` 滥用或后退拦截。
- 测试方法：从搜索结果进入页面 → 点后退 → 必须回到搜索结果页。

### FAQ Rich Results 下架（2026-05-07 生效）

FAQ 富结果不再出现在 Google Search 中。FAQPage schema 仍是有效的 Schema.org 类型，
但不再产生任何搜索可见性收益。**已实测：结构良好的 FAQ schema（80-150 词答案）
仍被 ChatGPT/Perplexity 等 LLM 优先引用**——从 Google 富结果资产变成了 LLM 引用资产。

**对我们的影响**：
- 现有 FAQ schema 不删，但不再为获取 Google 富结果而新增。
- FAQ 内容本身仍有价值（长尾查询承接、AI 引用），只是展现形式变了。

### Information Agents：Google 的后台持续搜索

Google I/O 2026 推出的 Information Agents 是 24/7 后台运行的 AI 程序，
可同时发出 16 个子查询，扫描博客、新闻、社交帖、实时数据，
在匹配条件时向用户推送综合更新。

**对我们的影响**：你的内容可能被 AI agent 阅读而非人类阅读，
因此**机器可读的准确性**在任何时候都至关重要——不只是发布时。
这强化了已有的「结构化数据 + 语义 HTML + 事实准确」要求，不需要新流程。

### 落地清单：每轮 SEO 工作流新增检查项

在现有工作流（section 四）基础上，每轮额外检查：

1. **AI 引用检查**：目标页面是否出现在 AI Overviews / AI Mode 的引用中？
   （用 Search Console Gen AI 报告，或手动搜索目标词观察）
2. **非大众化内容审计**：页面有没有 AI 自己就能生成的泛泛之谈？
   有就加独特切角或一手数据。
3. **Back Button 审计**：第三方脚本有无后退劫持？
4. **Discover 适配**（内容站）：OG image ≥ 1200px？`max-image-preview:large`？
   主题是否持续发布而非追热点？
5. **Preferred Sources 引导**：有无引导忠实用户设为 Preferred Source？

### AI Agent 就绪度：让 AI 代理能发现和使用你的站点

> **与 AEO/GEO 的区别**：AEO/GEO 关心「被 AI 搜索引用」（Google 说等于 SEO）；
> Agent Readiness 关心「AI 代理（编码助手、购物机器人、自动化助手等）能不能
> 发现、访问、理解、使用你的站点」。两者互补，不互相替代。
> Google 说不需要 llms.txt，但 AI 代理生态（ChatGPT Plugins、MCP、Cursor 等）需要。
> 2026 年 Vercel 推出 is-agentic.com 和开源 CLI，这是第一个系统化的评分工具。

**工具**：`scripts/is-agentic.mjs`（包装 is-agentic.com 公开 API，零配置可跑）。

```bash
# 扫描并输出报告
node <rankup-skill-dir>/scripts/is-agentic.mjs scan <domain>

# 扫描并存入 .rankup/agentic/<domain>/
node <rankup-skill-dir>/scripts/is-agentic.mjs scan <domain> --save

# 与上次对比
node <rankup-skill-dir>/scripts/is-agentic.mjs diff <domain>

# 查看历史分数
node <rankup-skill-dir>/scripts/is-agentic.mjs history <domain>
```

**评分模型**（满分 100 + 5 附加）：

| 层级 | 分值池 | 含义 |
|---|---|---|
| Essential | 80 分 | AI 代理能否进入、读取、操作公开站点 |
| Recommended | 20 分 | 增强代理交互的最佳实践 |
| Bonus | +5 上限 | 新兴格式，不扣分 |

不适用的检查项自动排除（没有 API 的站不会因缺 OpenAPI 扣分）。

**Essential 检查项**（决定 80% 的分数）：

| 检查项 | 判据 | 怎么修 |
|---|---|---|
| Agent crawler reachability | 主要 AI 爬虫 UA 能访问 | robots.txt 允许 ChatGPT-User / ClaudeBot / Google-Extended |
| Not blocked by bot detection | WAF 不拦 AI UA | 检查 Bot Fight Mode 等防护规则 |
| Content without JavaScript | 原始 HTML 有 H1 + 500+ 字符 | SSR 首页，确保无 JS 也有实质内容 |
| Agent-friendly 404s | 不存在的路径返回真 404（非 200 + 空壳） | 404 页面返回 markdown 正文指向 sitemap/llms.txt |
| Redirect hygiene | 无 meta-refresh / JS-only 重定向 | 全用 HTTP 301/302 |
| Markdown content negotiation | `Accept: text/markdown` 时返回 markdown + `Vary: Accept` | 中间件按 Accept 头协商内容格式 |
| Content behind auth | 内容页无登录墙 | 确保公开页面不跳登录 |

**Recommended 检查项**（常见扣分项）：

| 检查项 | 要点 |
|---|---|
| Sitemap | `/sitemap.xml` 存在且有效 |
| JSON-LD structured data | 首页有 Organization/SoftwareApplication 等身份类型 |
| Trust anchor pages | `/about`、`/contact`、`/privacy` 各 500+ 字符 |
| Metadata completeness | canonical、lang、og:image、og:type 齐全 |
| Content efficiency | 文本占 HTML ≥ 5% |
| Agent instruction / when-to-use | llms.txt 或 agent-instructions 文件说明「什么时候该用我」 |
| Organization schema | 含 contactPoint 和 address |
| Brand name discoverability | 品牌名搜索能找到自己 |

**Bonus 信号**（加分项，对工具站/SaaS 最相关的）：

- `llms.txt` 存在且格式规范、链接可访问
- JSON-LD `sameAs` 指向 GitHub/LinkedIn/Wikipedia
- sitemap 的 `lastmod` 新鲜
- Schema 类型丰富（FAQPage、Service 等）
- HTTP `Link` 头（RFC 8288）
- MCP server / 注册表条目
- OpenAPI spec、SDK 包、CLI 工具
- skills.sh 上架、ChatGPT Apps 上架
- `pricing.md`、`agent.txt` / `agents.md`

**什么时候跑**：

1. **上线后第一次**（lifecycle 段 4 闸门 4 出基线，段 5 绑正式域名后复跑）：存基线，`--save`。
2. **每轮 SEO 优化收尾时**（段 7 · 7.2/7.3）：`diff` 对比改进。
3. **接入新的 AI 代理表面（MCP、OpenAPI、Skills）后**：验证得分变化。

**注意**：llms.txt 对 **Google Search 无用**（Google 官方已否定），但对 AI 代理生态有用。
如果你的站点同时追求 Google 排名和 AI 代理可达性，llms.txt 只是一个 bonus 加分项，
不要为了它牺牲 Essential 层级的修复优先级。

#### 两条取分路径，以及一个会让「修完再 diff」失效的缓存

**都实测过（2026-08-22），结论与直觉不同，动手前读完。**

| 路径 | 命令 | 它到底做了什么 |
|---|---|---|
| 原始 CLI | `npx is-agentic <域名>`（加 `--json` 出结构化） | 取**最新已存在的报告**；只有当该域名从未被扫过时才真去扫 |
| 本 Skill 包装 | `is-agentic.mjs scan <域名> [--save]` | **先** `GET is-agentic.com/api/v1/report`，**404 才回退去 `npx is-agentic`**。多出 `--save` 存档、`diff` 对比、`history` 趋势 |

看一眼分数，`npx is-agentic <域名>` 最快，不必动本 Skill 的脚本。
要纳入优化流程做前后对比，才用 `--save` + `diff`。

> **⚠️ 但「修完问题再 `diff` 看涨了几分」这个工作流，在报告已存在时是失效的。**
>
> CLI 自己的帮助原文写着：*Retrieve the **latest** Is Agentic report, **scanning the
> site when none exists**.* 它只有 `--json` 和 `--help` 两个选项，**没有任何强制重扫的开关**。
>
> 实测证据（同一域名、同一天、三条路）：本地存档、报告 API、`npx` 直连
> 三者返回的 `scanned_at` 完全相同（`2026-08-22T13:50:39.325Z`），分数同为 75。
> **也就是说改完代码立刻重跑，拿回来的还是改之前那份报告。**
>
> 后果很具体：你会 diff 出「零变化」，然后得出「我的修复没生效」——
> 而真相是**根本没有重新测量**。这是典型的「测不到 ≠ 没发生」。
>
> **规矩**：
> 1. `diff` 之前先核对两份报告的 `scanned_at` **确实不同**。相同就说明没有新数据，
>    此时任何关于「涨了几分」的结论都不成立。
> 2. 要拿新数据，得去有「重新扫描」控件的地方触发（is-agentic.com 的网页报告页、
>    或 Cloudflare 代理就绪面板的「重新扫描」），CLI 侧目前触发不了。
> 3. 存档文件名按日期命名会掩盖这个问题——**同一天两次 `--save` 可能存的是同一份数据**。
>    判据永远是 `scanned_at`，不是文件名。

**未确认**：is-agentic.com 的报告缓存多久过期、有没有自动重扫周期。只确认了
CLI 侧无法强制刷新。若哪天 CLI 加了 `--force` 之类的开关，这一节要重测重写。

#### 单站分数配一个全网分母：Cloudflare Radar Agent Readiness

`is-agentic.mjs` 给单站打分，报告里会出现「高级集成 0/8」这种读起来像缺陷的行——
但没有分母就看不出这是「你没做」还是「全网基本没人做」。Cloudflare Radar 的
Agent Readiness 端点提供这个分母。

**这不是站点扫描器。** 端点是
`GET https://api.cloudflare.com/client/v4/radar/agent_readiness/summary/CHECK`，
`dimension` 是路径段，枚举只有 `CHECK` 一个值；可选查询参数 `date`、
`domainCategory`、`name`、`format`（`JSON`/`CSV`）。**没有 `url` 参数**——它返回的是
全网抽样域名的聚合通过率，不针对任何具体网站。以为它能审计单个站点是常见误读。

**工具**：`scripts/cf-agent-baseline.mjs`。零配置可跑——按 `--token` 参数 →
`CLOUDFLARE_API_TOKEN` 环境变量 → 本机 wrangler 的 OAuth token（
`~/.wrangler` 或 macOS 的 `~/Library/Preferences/.wrangler` 下的
`config/default.toml`，字段 `oauth_token`）顺序取认证，本机登录过 `wrangler`
就有现成的。**必须显式带 `User-Agent`**，缺了会拿到 HTML 错误页而不是 JSON
（同一个坑见 `seo-webcafe.md`）。

```bash
# 拉全网基线，按通过率排序打印
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch

# 存入 .rankup/agentic/baseline/<date>.json
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch --save

# 按行业分类过滤
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch --category Technology

# 对照某次 is-agentic.mjs 单站扫描，把失败项和全网通过率并排显示
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs --compare <is-agentic-scan.json>
```

**已验证的全网通过率**（2026-08-17 数据，107985/160188 个域名扫描成功——
这份数字会漂移，不要凭记忆引用，`fetch` 重新拉一次）：

| 检查项 | 通过率 |
|---|---|
| robots.txt 存在 | 83.9% |
| robots.txt 含 AI 爬虫规则 | 80.9% |
| sitemap 存在 | 69.1% |
| Markdown 内容协商（Accept: text/markdown） | 10.3% |
| OAuth Discovery | 9.6% |
| HTTP Link 头（RFC 8288） | 9.3% |
| OAuth Protected Resource | 8.7% |
| UCP | 8.1% |
| Content Signals | 8.1% |
| API Catalog | 0.5% |
| Agent Skills | 0.4% |
| MCP Server Card | 0.3% |
| Web Bot Auth | 0.1% |
| A2A Agent Card / ACP / MPP / x402 / AP2 | ~0.0% |
| WebMCP | 0（107985 个里一个都没有） |

**解读规则**：单站分数只有对着这份分母看才有意义。`webMcp` 全网通过率是
0/107985——追一项没人做到的检查，价值几乎总是低于它挤占的工作，那不是
站点的缺陷，是这个时间点互联网的常态。反过来，robots.txt / sitemap 这类
80%+ 通过率的项如果单站没做到，才是真实差距，值得优先修。

**这条解读住在这里，不在脚本里。** `cf-agent-baseline.mjs --compare` 以前会
逐项打印「`pct<15` → 这项该让位 / 否则值得修」，2026-08-30 删掉了：一个通过率
推不出优先级——全网 8% 通过可能是这项难做（该让位），也可能是所有人都还没做
（那是先发优势）；90% 通过的项若对你的站型不适用，修了也没有收益。脚本现在
只并排给出「站点现状 + 全网通过率（分子/分母）」这两个事实，先修哪个由读的人定。

**`--compare` 的边界**：`is-agentic.mjs` 的检查项和这个端点的检查项**不是
1:1 对应**——两边测的东西大多不同（前者查 404 语义、无 JS 内容、品牌可发现性、
Organization schema 完整度、trust anchor 页面；后者是全网聚合的协议/格式
采纳率）。脚本只在概念完全一致时才连线（目前唯一确认的一条：
Markdown 内容协商），其余一律列进「未能对照」，不做凑数假映射——错的映射
会给出自信但错误的建议。

**什么时候跑**：`is-agentic.mjs` 输出「高级集成」类低分时，先跑一次
`--compare` 判断这是全网通病还是真实差距，再决定要不要动手修。

## 三-C、无关区块（价格表、推荐位）：SSR 只输出本页目标文案

### 目的

密度、TDK、首屏文案这些检查都是对**一页一个目标词**做的。页面里与目标词无关的区块
——价格表、其它产品的推荐位、全站通用的 UI 控件文案（position / px / size / shadow 这类标签）、
每个卡片都重复一遍的免责声明——会把主题词从 top 榜里挤出去。段 4 的硬规则是：
**SSR 输出里只有本页目标文案**，无关区块不进首屏 HTML。

判据先于手法：先用 `scripts/seo-audit.mjs` 看 raw HTML 的 1/2/3-gram top15，
主题词不在前列、榜上全是控件词或价格表词，才动手；主题词已经在前列就不要为了「更干净」去改结构。

### 做法一：无关区块改客户端加载（最简单）

价格表、推荐位改成 mount 后再渲染（或 `hidden` + 客户端展开）。SSR 产物里没有它们，
密度工具立刻通过，实现只是把一个组件挪到客户端。

**边界**：它只对「密度工具读 raw HTML」这一件事成立。Googlebot 的 WRS 会渲染 JS，
DOMContentLoaded 或 mount 时注入的内容**照样进渲染后 DOM**——所以密度工具通过，不代表 Google
看到的一样。用这个做法要接受一个前提：那块内容 Google 看见也无妨（价格表通常如此，它本来就该被索引），
你只是不想让它压主题词的**工具读数**。反过来，如果目的是让 Google 的渲染层也不看见，这个做法不够。

### 做法二：首次真实交互后再注入（更稳）

Googlebot 渲染 JS 但**从不交互**。所以唯一可靠的逐出是：等到第一次真实交互
（pointerdown / pointermove / keydown / touchstart / wheel 五事件，`once` + `passive`）才注入。
已实证的形态：

- 文案来源是 SSR 内嵌的 JSON blob，与 SSR 同一个 `t()` 调用生成——**单真源**，blob 属 script 内容不计入可见文本；
- 注入目标是空 span（`data-i18n-lazy`，并摘掉 `data-i18n` 防运行时包提前水合）；
- `:empty::before` 占位防 CLS，px / ° / % 后缀走 `data-unit`。

实证数字：64 个 label + 16 个单位转换后，raw top15 的 position（1.88%）/ px（1.78%）/ size / shadow
全部出榜、主题词回正；无头零输入 3s 后全空、单击后双语全对、面板高度 Δ0。

**边界**：它只适用于**不该被索引的装饰性文案**——控件标签、单位、工具面板。
把正文、FAQ、价格这类**你希望被索引**的内容放到交互后注入，等于亲手把它们从 Google 面前藏起来；
「把结果预加载进 DOM 但首页不展示」已经吃过整域 shadow ban
（[`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 十七·一），方向相反但同一条红线。

### 两种做法怎么选

| 区块 | Google 看见有没有问题 | 做法 |
|---|---|---|
| 价格表、其它产品推荐位、相关页卡片 | 无妨，甚至该被索引 | 做法一：客户端加载，只压工具读数 |
| 控件标签、单位、面板文案、每卡重复的免责声明 | 稀释主题、无索引价值 | 做法二：首次交互后注入；重复样板提到容器层只写一次 |
| 分月 / 分类面板的长尾正文 | **必须**被看见 | 都不用：全量 SSR + `hidden` 切换（五 2026-07-26 那条） |

改完必须两处都验：raw HTML 的密度（工具视角）和无头加载 + settle 后的 DOM（Google 视角），
只测一处会漏掉另一侧（五 2026-07-18「双真源站的运行时包」那条讲的是同一件事）。

## 四、工作流(每轮优化按此走)

0. **读项目 `.rankup/`**：按 [`project-memory.md`](project-memory.md) 恢复并对账上下文；没有就初始化项目记忆。新项目、新产品线或新词族先填【机会池卡】并通过 `D+C+W+M` 门禁;已运行站点的存量优化直接从 GSC 真实数据开始。
1. **先拉真实数据再动手**:GSC 查询词(点击+曝光+CTR)→ 按语义聚类 → 国家分布交叉(哪个市场曝光大 CTR 低 = 收割空间)。没有 GSC 就用 Suggest 摸需求形态。
2. **意图核验后再选词**:对候选主词查 KD 的 `details[]`(前十是谁、dedicated?、DR、体验分)。**SERP 被电商/实体货占据的词 = 意图不匹配,放 H1 蹭不进 title**。
3. **落地映射**:title ≤60 字符、主词只出现一次 + Suggest 验证过的修饰词;description 110–160 字符、动词开头、写差异化(free/秒出/免注册);H1 承接第二词组;FAQ 逐条承接长尾(一条 FAQ = 一个查询意图);多语言不是翻译而是本地化(音译、方言词、当地搜索习惯)。
4. **验证闭环**:构建后脚本核对全语言 title/desc 长度与关键词落位 → commit → push → 轮询线上生效 → IndexNow ping(key 文件在站根)→ 记录 GSC 基线,1–2 周后回看 CTR/排名变化。
5. **AI 引用与合规检查**（见 section 三-B「落地清单」）：AI 引用检查 → 非大众化内容审计 → Back Button 审计 → Discover 适配（内容站）→ Preferred Sources 引导。
6. **收尾必做**:执行【自更新协议】。

## 五、经验库(验证过的判断,带日期)

- **[2026-07-17] 查 GSC 意外集群**:你可能已经在为没写过的词排名(实测:某工具站的功能词集群位列全站点击第一,而页面上根本没有该功能)。GSC 查询表是最便宜的机会挖掘器,每轮必看。
- **[2026-07-17] 多语言音译 > 官方名**:阿语用户搜剧名音译 بيتر كول سول(376 曝光)远多于人名 سول غودمان(109);还用方言词 كرت(名片)、فاضيه(空白)。本地化要进 Suggest 验证当地拼写/方言,别只翻译。
- **[2026-07-17] 意图不匹配的词别硬刚**:"saul goodman business card" KD 48 且 SERP 全是 Amazon/Etsy 实体卡 —— 工具站蹭 H1 即可,title 主槽给意图匹配的 template/generator。
- **[2026-07-17→19 修订] 语言版 go/no-go 要 Suggest+SERP 两票**:Suggest 空结果 = 需求不存在(结论级,如印尼语 Saul 卡片为零→不建 id 版);但 Suggest 满格只证需求存在,**不证可赢**——某内容站实证:ko/ja 탄생석/誕生石 Suggest 全满格,SERP 却被 Naver 等本土平台垄断(渠道错配,谷歌站吃不到)→ 不做。裁决顺序:Suggest 验需求 → SERP 盘面验可赢性 → 两票通过才开语言版。
- **[2026-07-17] 虚构结构化数据是 P0**:JSON-LD 里编造的 aggregateRating(4.8/1250,无评分功能)违反 Google 政策,盈利站点有人工处罚风险,发现即删。
- **[2026-07-17] 标题堆砌导致 Google 改写**:同一短语在 title 出现两次 → SERP 标题被改写(Ahrefs "Page and SERP titles do not match")。主词一次 + 差异化修饰词。
- **[2026-07-17] 体验分是排名天花板**:哥飞 KD 直接给 SERP 占位者打体验分(停留/跳出);文案做满后,守位靠产品(停留 33s vs 竞品 4-6min = 脆弱占位者)。
- **[2026-07-17] 第二产品线验证法**:同机制跨 IP 扩展前先用 Suggest 验证(American Psycho 名片 = generator/maker/template/font 全 [512] → GO;Breaking Bad 无名片意图 → SKIP,同宇宙≠同需求)。
- **[2026-07-17] meta description 110–160 字符**是 Ahrefs 警告阈值(三把尺里最严的一把,把"太短浪费展示位"也算警告);CJK/阿语按字符数同样适用。本仓两个脚本的区间比这宽且口径不同(`seo-audit.mjs` 50–160 按字符数、`seo-webcafe.mjs string` 70–160 按近似展示宽度),对照表与"说超长时必须点名是哪把尺"的规矩见 [`seo-webcafe.md`](seo-webcafe.md)「本地命令数值判读指引」的「`string` 的判读：三套 TDK 长度口径，别混着引」小节。
- **[2026-07-17] title/desc 长度按"解码后码点"量,别量构建产物**:Astro 把属性里的 `"` 转 `&#34;`(5 码点)、`&`→`&amp;` —— 一条含 `"Better Call Saul!"` 的 desc 在 raw HTML 比 Google 实际计数长 8+ 码点,天真 grep 会误判超长/把 CJK 误判达标。核查脚本先 decode `&#\d+;`/`&#x..;`/`&quot;`/`&amp;` 再套 110–160。CJK 偏低端就达标(~112-118,首页实证 115),拉丁/阿/印 ~145-158。
- **[2026-07-17] canonical 指向会重定向的 URL 形态 = 白写**:站点服务端把尾斜杠 307 到无斜杠,而 canonical/内链/sitemap 全是带斜杠形态 → 每次点击多一跳、canonical 可能被 Google 忽略。修法:选定一种形态,用一个共享的 normalize 函数守住 href/canonical/hreflang/sitemap 四处(内容站实证)。
- **[2026-07-17] 仓库结构迁移后必查静态资产**:monorepo 化把 public/ 留在旧根目录,vite 只认 app 内 public/ → favicon/og-image/全部插图 404 静默上线数日。迁移后必跑:线上首页控制台错误 + curl favicon/og-image。
- **[2026-07-17] robots.txt 里放非标准指令会被判 invalid**:`LLMs-Txt:` 让 Lighthouse robots-txt 审计直接 0 分(SEO 分被拉低)。非标准内容一律放注释。
- **[2026-07-17] Cloudflare Bot Fight Mode 是三重 SEO 税**:挑战脚本占主线程 ~2.5s(TBT 爆表)、自带 deprecated API 警告(拉低 Best Practices)、还会 403 掉 Bing IndexNow 的 key 验证抓取。且程序化关不掉:wrangler OAuth 无 bot_management scope(读都 403),只能 dashboard 或专建 API token(Zone→Bot Management→Edit)。**关的时候是两个开关**:Bot Fight Mode 和「JS 检测」(JS Detections)相互独立,只关 BFM 注入照旧——验证标准是 curl 首页 grep challenge-platform 归零(实证:关 BFM 后 12 分钟注入仍在,关 JS 检测后秒消)。Bing IndexNow 对 key 验证失败有 ~24h 缓存,挑战撤掉后要延时重推。
- **[2026-07-17] 线上 React #418 = SSR/客户端文本不一致,时间类内容是头号嫌犯**:Worker 在 UTC 渲染日期/月相,UTC+8 用户每天早上 0-8 点全量触发 mismatch。时间衍生的装饰性文案用 suppressHydrationWarning(React 官方许可的用途);功能性内容改为 mounted 后渲染。
- **[2026-07-17] soft-404 检查法**:对"该 404 的 URL"(未发布内容/删除页)curl 状态码,200+页面写着 404 = soft-404。SSR 框架修法是 loader 里 throw notFound(),别在组件层兜底了事。
- **[2026-07-17] WCAG 对比度修复的三分法**:装饰性字形加 aria-hidden(直接退出审计)>给信息性小字专设深色 token(如 ember→ember-ink 4.5:1)>全局加深整个色阶(最后手段,会压扁文字层级)。mounted-gated 的客户端页面记得把 h1 放进 skeleton,否则 SSR 无标题。
- **[2026-07-17] hreflang 按"页面所属 section"成簇,不复用全站首页模板**:多语言站的子页 section(如 /<lang>/logo-maker/)其 hreflang 必须列**本 section 的 N 个语言兄弟 + x-default**,而不是首页那套。演进两阶段:①只有单语言版时(en-only 子页)——布局默认输出全站 hreflang 会指向一堆 404,安全解 = 关掉 hreflang 只留自引用 canonical;②补齐全部语言后——给布局加一个 `alternatePathSuffix` 之类的 prop,把 section 路径拼到每个 locale 根(`站/​<lang>/` + `logo-maker/`),首页传空即不变、子页传后缀即成本 section 簇。构建后脚本必须扫全 dist 的 hreflang 逐个 resolve 到已构建文件(0 个 404)。顺手给无画布/无支付的子页加脚本开关省掉无用 JS(实证 ~70KB);且该开关一旦关掉运行时 JS 包,客户端 i18n 也不加载(见下条)。
- **[2026-07-17] 后台 agent 被进程重启杀死时,工作区可能有未提交半成品**:恢复第一步 `git status` 验货(build+验收产物质量),质量过关就主线程接手收尾,别盲目重派浪费一轮。
- **[2026-07-17] 审计爬虫必须跟随同语言重定向**,否则尾斜杠 307 会把 BFS 掐死在种子页(第一版只爬到 69/284 页,结论全错)。多语言站爬虫按"页面语言 vs 链接目标语言"报违规,一轮就能揪出全部串语言链接(实证 450 处)。
- **[2026-07-17] 体验层做"预设=参数集",别建平行状态**:模板画廊/一键随机在既有可序列化表单状态上 applyDefaults(合并到默认值),复用 reset 流程;缺的样式维度(颜色等)补成一等参数、渲染处用原字面值兜底 → 默认渲染逐字节不变、付费导出路径不受影响。随机化只覆盖 curated 调色板/字体/阴影且只作用于"当前卡"(不碰文案/坐标),永远出可用卡。缩略图用 CSS mock(零资产、不拖首屏),别渲染多个 canvas。停留时长是体验分/排名天花板时,这是最低风险的加分项。
- **[2026-07-17] Canvas/HTML 文本继承页面 dir,RTL 语言页里固定英文内容会被 bidi 重排**:阿语页画布把 "IN LEGAL TROUBLE?" 渲成 "?IN LEGAL TROUBLE"、电话/数字错位;HTML 缩略图英文脚本同理("Better Call Saul!"→"!Better Call Saul")。固定拉丁内容:画布设 `ctx.direction="ltr"`、HTML 片段加 `direction:ltr`。页内预览画布在 RTL DOM 内会中招,detached 导出画布默认 ltr 常不受影响 —— 预览与导出要分别验证。**[实证升级]** `ctx.direction="ltr"` 设在绘制函数顶部时:①对 LTR 页是 no-op;②仍能正确整形阿语名(阿语字形是 strong-RTL,单跑内部照样右到左),所以同一张卡"阿语名 + 英文 logo"混排两边都对;③若导出走 renderExportCanvas 把同一个模块级 ctx 换成临时画布再调同一绘制函数,这一行同时覆盖预览与导出(无头浏览器 2× 导出实测通过)。
- **[2026-07-17] Canvas 文本不会触发 web 字体下载**:DOM 文本会拉取 @font-face,但只在画布用到的字体(如仅 canvas 用的 Cairo)可能一直用 fallback 渲染。换预设/换字体后要 `document.fonts.load('bold 54px "X"').then(重绘)` 强制加载再重绘,才能保证预览和导出 PNG 都用真字体(导出是同步 toDataURL,字体没就位就把 fallback 烤进 PNG)。按需加载:小语种字体只在该 locale 的页 `<link>`(如 Cairo 仅 /ar/),别全站背包袱。
- **[2026-07-17] 多语言站常有两套文案真源(SSR 数据文件 + 客户端 i18n 包)**:SSR 从数据文件(如 translations.ts)渲染初始 HTML,客户端再用运行时语言包(如 lang-ar.js)覆盖 data-i18n 元素。只改 SSR 源不改运行时包 → 水合后文案被还原。改任一语言文案先 grep 确认有没有第二层覆盖,两边同步;运行时包若只含子集,缺失键会保留 SSR 文案(可利用,新增键可只落 SSR)。**[补 2026-07-17]** 若某页 opt-out 运行时 JS 包(无画布/无支付子页,如 /<lang>/logo-maker/),客户端 i18n 根本不加载 → 该页只剩 SSR 真源,整页文案单放 SSR 数据文件即可、无双源同步负担;而仍跑 JS 的页(首页)要给子页加的新入口/CTA 文案,走 SSR-only 键最省(客户端 applyTranslations 对运行时包里缺的键 `return` 跳过、保留 SSR),别再往每个运行时包塞一份。**[补 2026-07-18]** 双真源站的运行时包可能不止覆盖文案——若包里有 applyMetaFromPack 之类逻辑,**加载后会重写 title/desc/canonical 整个 head**,Googlebot 索引的是包接管后的渲染层:一切 SEO/密度断言必须加一层"无输入渲染后 DOM"检查(headless 加载+settle 后再断言),只测 SSR 产物会漏掉包层回写;head 改动必须双源同步否则线上 SERP 用的是包里的旧 meta。

- **[2026-07-17] 跨工具 carry 状态要按"目的地的字面量约定"归一化,颜色要防背景撞色**:两个 canvas 工具各自的 `<select>` 值约定不同(A 端多词字体带 CSS 引号 `'"Dancing Script"'`,B 端裸名)——直接透传时引号值匹配不到 B 端 option,恰好最重要的字体静默丢失;carry 前剥引号即全表映射。颜色只带"用户主动选的非默认值":A 端默认色若等于 B 端背景色(金字→金底),无脑带过去=内容隐形。兜底靠机制而非白名单:`select.value=未知值` 是 no-op、`hidden input` 收任意串,所以目的地 option 空间自然过滤非法值,前向兼容(双画布工具站实测:quoted→unquoted、指定色落位渲染、reset 全复原)。
- **[2026-07-17] 全局下拉里放小语种字体用"选择时注入"零成本**:`<option>` 全 locale 可见,但 Google Fonts `<link>` 在 change 事件里按 family 注入(link id 去重 + onload 后 FontFaceSet load→重绘),没选的用户一字节不下载,LTR 性能零回退;**localStorage restore 后要补一次同样的检查**——跨页/跨 locale 的 carry 会把字体值带到不预载它的页面,漏了这步恢复的卡就一直用 fallback 渲染(实测:选择注入 link、默认渲染逐字节不变、restore 场景兜住)。
- **[2026-07-18] LCP 图被 loading="lazy" 拖死是首号性能反模式**:lazy 让预载扫描器直接跳过 + Chrome 按 Low priority 取图 → Load Delay 占 LCP 48%(内容站实证 LCP 6.3s→3.4s)。修法三件套:img 加 `loading="eager" fetchPriority="high"`(共享图组件开 opt-in priority prop,默认仍 lazy)+ 路由 head 加 `<link rel="preload" as="image" fetchpriority="high">`(React 19 会把它 hoist 到 stylesheet 之前)。验证不看分数看机制:LH JSON `network-requests` 里图的 priority 翻成 High、请求起点与 CSS 并行、`lcp-lazy-loaded` 审计过。修完若 LCP≈FCP,说明图已退出瓶颈,别再折腾图。**[补 2026-07-17]** 同站首页修完记得扫其余模板页——详情页 plate 同样 lazy/Low(load delay 55%),同配方复制即可;动态路由的 preload 用 `params.slug` 拼 href。TanStack Start 会把 head link 输出两份(SSR head + router payload),浏览器对同 URL preload 去重,无害勿追。部署后首个 curl 可能撞上未失效的边缘 POP 旧字节(`max-age=0, must-revalidate` 下一跳即回源)——用 etag/content-length 比对 + retry 再下结论,别误判部署失败。
- **[2026-07-18] 水彩/软渐变插图 WebP 重压缩近乎免费**:同 PSNR(~41.9dB)下 700px q78 只有 800px q72 的 55% 体积(28KB vs 50KB);按"最大 CSS 渲染尺寸×1.5~2"定目标宽,cwebp -m 6 重编码,肉眼无差(用 Read 工具双图对照确认再换)。photo 类纹理图不适用此倍率,需单独目检。**[批量实证 2026-07-17]** 57 张插图一次过(−54%,PSNR 36.4–42.3dB):连金属簇晶/葡萄状细密纹理(pyrite/chrysocolla,PSNR 最低段)在 ≤460px 渲染下也无可见差——"需单独目检"实际只适用于真实照片,风格化插图整批只抽最差 PSNR 3 张 + 旗舰页 1 张目检即可。批量脚本:备份原图到 scratchpad + `-print_psnr` 记录逐张 TSV,按 PSNR 升序挑目检对象。
- **[2026-07-18] "流量突然归零"三步定性法**:①GSC 人工处置措施+安全问题(双绿=非惩罚,断崖惩罚极少且必有通知);②曝光是否与点击同步归零——排名掉了曝光仍会记录,曝光同步归零=搜索需求本身消失(需求侧),不是排名问题;③查询表形态——若近乎 100% 是"品牌+子词"导航词("品牌名+子词" 式),流量本质是站外病毒传播的回搜,退潮≠SEO 事故,处方是通用词布局+再传播,不是修站(某测评站实证:全部查询皆为品牌词、单一国家占比近九成、峰值后数月贴地,GSC 双绿)。
- **[2026-07-18] GSC 效果报告读表用 get_page_text 而非截图翻页**:把"每页行数"调大后 get_page_text 一次返回整张查询/国家表(150 行全量),比逐屏截图快一个量级;表格数据在 SPA DOM 里是纯文本,直接可解析。
- **[2026-07-18] Suggest 联想词出现"品牌+品类"组合 = 品牌已渗透该语言市场**:如 "<品类词> parody" 前面长出 "<品牌名> <品类词> parody"、繁简两种写法双双出现——这类词是零成本必承接词,也是跨语言传播回声的免费探测器(比社媒监听便宜)。
- **[2026-07-18] 程序化组合页矩阵的 GSC 病理形态与处方**:27×26 配对页×4语言=2808 页,病理=890 页"已抓取-尚未编入索引"+已索引数被 Google 主动回收(峰值 2400→1858);处方分级:先撤 sitemap(保守可逆,页面保留 index,follow 承接长尾),4-6 周未消化再升级 noindex。hub 页留在 sitemap(前提是该需求集群真实存在,用 GSC 曝光验证)。**[终态实证 2026-07-18]** 用户授权大刀阔斧后直接跳到 noindex,follow 终态(4,742 页含二级游戏配对矩阵+分享落地页+答题进行页),站点从 5,222 页收敛到 ~480 索引目标;分享落地页(/result/*)与内容页(/type/*)同质=索引稀释,share landing 一律 noindex(社交访问不受影响)。
- **[2026-07-18] Cloudflare Email Obfuscation 是全站死链制造机**:页面有明文邮箱时 CF 边缘把它替换成 `/cdn-cgi/l/email-protection#<hex>` 链接,不执行 JS 的审计爬虫(Ahrefs)把它当 404 内链 → 全站每页报一条死链(实证 3,488 页)。修法:邮箱拆 span+JS 拼装(或 `<!--email_off-->` 注释/关 Scrape Shield)。**本地构建产物永远扫不出来**(注入发生在边缘),线上 curl grep email-protection 才是验证。且审计报告必须先对照"爬取日期 vs 最近部署日期"——旧爬照旧版,可能报的问题已经修完了。
- **[2026-07-18] 类型/产品改名后旧名可能是 GSC 品牌词**:某测评站把一个类型名改掉之后,GSC 显示用户仍在搜旧名,且旧名是站内第二大品牌词。清理 prose 里的旧名残留会误伤流量;正解=改名页保留一句 legacy bridge("曾经被称为 <旧名>"),0-1 click 的旧名不做。改名决策前必查 GSC 查询表。
- **[2026-07-18] 图片批量压缩工具链升级**:pngquant(256色)+oxipng 对插画类 PNG 比 ImageMagick 量化质量好一个档(实证 results png -80% 无可见劣化);OG 用途的 png 压不到 100KB 时保留原质量(爬虫单次抓取,不是页面权重);全幅 hero(fill 渲染)的图不可按"渲染宽×2"缩尺寸,只能重编码——**压缩 agent 的 brief 里"已验证的渲染尺寸"也要让 agent 复核**(实证 brief 里两处"事实"是错的,agent 复核后避免了 upscale 模糊)。
- **[2026-07-18] @astrojs/sitemap 只会输出 index+chunk 双文件**(无单文件选项),协议合法、Google 认;但小站建议 postbuild 扁平化成单一 /sitemap.xml(脚本:复制 chunk → 删除 index+chunk → robots.txt 同步 → 旧 URL 加 301)。**Cloudflare Pages 的 _redirects 只在路径不命中静态文件时生效** —— 不删旧文件,重定向永远不触发。手工维护的静态 sitemap 副本是事故源(本站 5 月版本后来被当垃圾清掉导致 404 两个月),要么生成要么重定向,别手写。
- **[2026-07-18] 词密度被 UI 控件文案稀释的根治法 = 交互门控注入**:密度工具读 raw HTML,但 Googlebot WRS 渲染 JS 却**从不交互**——DOMContentLoaded 注入只骗得过工具骗不过 Google。完整做法、两种方案的适用边界与实证数字已合并到 **三-C「无关区块（价格表、推荐位）：SSR 只输出本页目标文案」**,这里只留索引。配套教训:①计数断言要**数据驱动**,规格里硬编码的 27/28 这类数字连两个独立 checker 都数错(Prettier 折行的 `>--</span>px` 漏计);②代码注释声称的"build 断言"必须真实落进 build 管线并验证会咬人(故意注坏一个值看 exit 1),phantom guard 比没有更危险。
- **[2026-07-18] CF Pages 构建成功的无 dashboard 验证**:`npx wrangler pages deployment list --project-name=<name>` 出现新 commit 的 Production 行即构建成功(失败构建不产生部署行,老部署继续服务=站点健康不能证明新构建没挂);未装 GitHub 集成的 repo `commits/<sha>/status` 恒 pending 不可依赖。改动只含 build 脚本/注释时线上字节不变,这是唯一的客观信号。

- **[2026-07-17] Stripe 本地币展示的决策树**(Stripe-hosted Checkout):要让访客按所在国看本地币,首选 **Adaptive Pricing**(后台一个开关、零代码、Stripe 维护汇率+四舍五入+解锁本地支付方式、官方推荐 complexity 1/5)——但它是**账户级设置**(要用户去 Dashboard 开,代理只能出指令不擅动)。代码侧能自己实现的替代 = 按国发 inline `price_data`(自担汇率、需硬编码金额)。**致命坑:IDR 在 Stripe 是 2 位小数币种**(不在 zero-decimal 名单 BIF/CLP/JPY/KRW/VND…),金额=最小单位×100(Rp 30.000 = `unit_amount:3_000_000`);别凭记忆猜,用 test-mode 会话建单开 hosted 页看渲染("IDR 30,000.00"证实)。**发货/积分逻辑只要 keyed off session `metadata`(不读金额)就天然币种无关**——presentment 换币不碰它;换任何多币种方案前先核这条成立(实证:credit 走 metadata.credits,ID→IDR / 无国→USD 两路 e2e 均对,USD 请求逐字节不变)。
- **[2026-07-19] 退役旧 Stripe Checkout 不能按价格或 metadata 形状批量 expire**:共享账户里的无命名空间历史会话必须同时核验站点 return host、client/device identity、完整且无后续分页的单 line item、quantity、session/item/price currency 与金额、商品名和 recurring `interval=month + interval_count=1`;dry-run 只给聚合 count+digest,每次确认最多处理字典序一个候选,网络不确定后重新 dry-run。实证先拦下 `line_items.has_more`、双月 cadence 和多候选 partial-failure 三类误杀风险,再逐笔处理 21 条 legacy open。
- **[2026-07-17] Web Share 文件分享(把成品图甩进 WhatsApp)**:`navigator.share({files:[File]})`(Web Share L2)需 `navigator.canShare({files})` 门控 + secure context(https/localhost)+ **用户手势**内调用。File 必须**同步**构建——`canvas.toDataURL()`→手搓 base64→`new File(...)`,**别用异步 `canvas.toBlob`**(回调跑到时手势已丢,iOS Safari 抛 NotAllowedError)。降级 `https://wa.me/?text=<encodeURIComponent(文案+页URL)>`(全平台可用,含桌面)。**分享带水印导出**(水印=站 URL)= 免费分发,每次分享都在打广告,且不白送干净 HD。headless 浏览器 `navigator.canShare`/`share` 常 undefined → 自动落 wa.me,可据此验降级链路;真机 OS 分享面板+WhatsApp 交接无法无头 e2e(如实说明验了什么)。
- **[2026-07-17] Cloudflare Pages Functions 取访客国**:用 `request.headers.get("CF-IPCountry")` 优先、`request.cf?.country` 兜底。理由:两者生产都由 CF 边缘设且相等、header 不可被客户端伪造(CF 会覆写入站 CF-*);但 **`wrangler pages dev` 本地 `request.cf.country` 是 mock 值会短路盖过你发的 header**,header 优先才能本地发 `-H "CF-IPCountry: ID"` 把地区分支测通,且不损生产正确性。
- **[2026-07-18] Google SERP 缩略图需要页内真实 `<img>`,canvas-only 站点 og:image 只是彩票**:某 7 语种工具站共用同一 og:image、页面 0 个 img,结果只有 1 个语种出缩略图。修复全家桶=页内可见 img(懒加载可,Googlebot 处理 lazy)+ og 尺寸声明改真值(造假会被忽略)+ og:image:alt + JSON-LD image + image-sitemap 条目。**双格式策略**:og/twitter 用 PNG(WhatsApp/FB 预览爬虫对 webp 不稳,站内有 WhatsApp 分享流时尤其别赌),页内/JSON-LD/sitemap 用 WebP(同图 175KB→56KB)。SERP 生效要等重抓(机制层当天可线上断言,效果 1-2 周回看)。
- **[2026-07-18] CF Pages _headers 合并语义实测**:所有命中规则 MERGE(非最专一优先),同名 header 值串联成矛盾垃圾(`no-store,...,immutable` 浏览器按 no-store 解);修法=更专一块里 `! Cache-Control` 先摘再设。实测生效范围:根级扩展 glob(/*.png 等)、depth-1 文件夹 glob(/_astro/x.css)、/sitemap*.xml 均正常;**但 /assets/*(文件在二级子目录 /assets/js/x.js)的 detach 生效、set 永不落地**——新旧两版规则一致,最终落 Pages 静态默认 `public, max-age=14400, must-revalidate`(对无哈希资产这默认反而合理,可接受)。原因未明(字节已排除),**验收只能 curl 实测且认 cf-cache-status:MISS**(HIT 是旧部署边缘残留,加 `?cb=` 绕缓存键取源站真值)。连带教训:合并 bug 修好前 no-store 假死掩盖了"无哈希直连 JS 配 1yr immutable"的雷——修缓存头时必须重估每类资产年限(直连 payments.js 短缓存,哈希 /_astro/* 才配 immutable);同 URL 换图字节被 immutable 挡住,换封面要改文件名。
- **[2026-07-18] @astrojs/sitemap 的 urlset 自带 xmlns:image/video/news 命名空间**:postbuild 注入 `<image:image>` 前先查重(重复 xmlns 属性=XML 硬错误,ET.parse 直接炸),且要插在 `<url>` 块**末尾**(XSD 的扩展元素槽在 sequence 尾部,插 `<loc>` 后面严格校验器会拒)。
- **[2026-07-18] 浏览器预览面板三个坑**:①scrollY≠0 时 screenshot 输出纯背景色帧——绕法=把目标元素临时 `position:fixed` 钉到视口顶再截,拍完还原;②整个 tab 合成器可能坏死(任何位置都截不出内容)→ tabs_create 换新 tab;③面板里原生 `loading=lazy` 可能不触发(节流),`img.decode()` 可强制加载做诊断——都是面板 quirk,真浏览器/Googlebot 不受影响,别据此改产品代码。

- **[2026-07-18] 次级关键词用 H2 锚定在现有页,不必新建页**:KD <25、月搜 <300 的长尾关键词,在已有排名页里加一个 H2 section(3 段正文 + CTA)即可锚定,省去新页的索引等待和权重稀释。条件:母页已有一定权威 + 新词意图与母页高度重合。实证:某工具站的 "logo font"(KD 19.4/160 月搜)加到 font generator 页,不建独立页;H2 精确匹配目标短语,正文自然出现 2 次,密度安全。
- **[2026-07-18] 部分语言版 hreflang 必须过滤到实际存在的 locale 子集**:多语言站某页只做了 3/7 语言时,布局默认输出全部 7 个 hreflang → 4 个指向 301 重定向或 404,Google 会降权或忽略整组 hreflang。修法:布局加 `alternateLangs` prop,页面级声明自己存在于哪些 locale,hreflang 输出只包含这些 + x-default。构建后脚本扫全 dist 的 hreflang 每个 href 必须 resolve 到已构建文件。
- **[2026-07-18] 交互式 UI 的 i18n 完整性是 SEO 审计盲区**:下拉菜单选项标签、badge 文案、modal 按钮——这些"功能性 UI"常被 i18n 遗漏(开发时用母语测通就提交)。后果:非母语页面的 Core Web Vitals 不受影响但 UX 信号(跳出/停留)劣化,且 Googlebot 渲染后能看到混语言内容。修法:数据接口里为每个 UI 字符串建类型字段(包括 option label),CSS 值(hex/font-weight)保持跨 locale 常量;构建脚本断言每个 locale 的翻译键数 === 接口字段数。
- **[2026-07-18] 关键词密度超标的降密手法:自然变体替换而非删内容**:密度 >3% 时,把精确短语的部分出现替换为语义等价的自然变体("Better Call Saul font" → "the font" / "this lettering" / "Saul-style text" / "the show's signature lettering")。目标:精确短语在 title/H1/首段各一次 + FAQ 问句,其余全用变体;降密后仍保持话题相关性,不砍内容量。
- **[2026-07-19] 静态代码审计的"定罪"必须构建产物/运行时复核后才能开修**:audit agent 从布局层 script 门控推断"子页付费墙死"(判 SUSPECT confirmed),但组件文件自己带了一个无条件内联 `<script src=payments.js>`——maker 用 dist grep + Node 实际执行当场证伪,若按报告盲改会引入脚本重复加载。规矩:任何 SUSPECT 裁决,修复者第一步是复现(dist grep/无头点击),复现不了按误报回销。
- **[2026-07-19] 工具站加子页时支付回跳链三件套要同步审**:①checkout 后端 returnPath 若是单段正则(`^\/[a-z-]*\/?$`),所有子页购买后静默跳回首页——放宽用 `^\/(?!\/)[a-z0-9-]+(?:\/[a-z0-9-]+)*\/?$` + 长度帽(天然拒 //、..、\、%,对抗探针实测无站外泄漏);②locale 解析别 `replace(/\//g,"")` 剥全部斜杠(多段路径永不匹配),读首段 `split("/").filter(Boolean)[0]`(zh-hant 连字符安全);③不载全站 i18n 运行时的页面用内联 shim 只带所需键,必须 `JSON.stringify().replace(/</g,"\\u003c")` 防 `</script` 逃逸 + `if(!window.X)` 防覆写。
- **[2026-07-19] AI 插图标注 "Illustration" 是内容站 E-E-A-T 信任信号**:宝石/矿物内容站用 AI 生成的"看起来真实"的标本图,必须在 figcaption 或组件内可见标注 "Illustration"(不是 alt-only、不是 HTML 注释)。三级分类:装饰/信息图可不标注;拟真宝石图必须标注;辨真假教学图禁止用 AI(必须真实照片)。标注透明度建立信任且不影响视觉品质;Google E-E-A-T 评估看"是否诚实展示内容来源"而非"是否用 AI"——标注反而加分。适用所有用 AI 插图呈现实物外观的内容站。
- **[2026-07-19] References 列表禁止裸 URL,必须显示描述性来源标题**:文末 References 区块的链接文字应显示"石头名 — 来源机构全称"(如 "Peridot — Gemological Institute of America (GIA)"),不是 `gia.edu/peridot` 式裸 URL。原因:①裸 URL 显得不专业,用户无法判断来源权威性;②屏幕阅读器读 URL 是噪音;③E-E-A-T 信号——证明作者真的读了来源并能命名它。实现:URL 域名模式固定时(GIA/Mindat/GemSociety/geology.com)用辅助函数从域名自动生成标题,不需改数据层;域名不固定时改数据模型为 `{title, url}` 对象。
- **[2026-07-20→修订] TanStack Start + CF Workers 站的 sitemap 用 prebuild 脚本生成,不手写不动态**:TanStack Start 无内置 sitemap 机制(无 @astrojs/sitemap、无 Next.js sitemap.ts),CF Workers 也不支持 API route 式动态 sitemap(增加运行时成本 + TTFB)。正确做法:一个 Node.js prebuild 脚本从**路由数据源**(如 signs.json)读全部页面 slug → 生成 static XML → 放进 public/ → vite build 打包为 Worker 静态资产,CDN 直送零运行时。关键:脚本与路由逻辑共享数据源(不是另存一份列表),确保路由新增 → sitemap 自动跟进,杜绝手写静态 sitemap 的漂移问题(实证:手写版 7 URL、自动版 17 URL,缺口 10 页)。`lastmod` 不能用构建日期冒充:Google 只在它持续、可验证地等于页面显著修改时间时使用;无法维护真实逐页日期就省略该可选字段。
- **[2026-07-20] 响应式 `srcset` 必须逐候选做资产门禁**:只检查 `<img src>` 或抽测 390/1440px 会漏掉中间宽度候选;浏览器会按 viewport/DPR 真实选择缺失的 960w,导致只在该档首屏破图。构建校验应从组件规格枚举每个内容实体的全部 800/960/1200 候选并逐文件断言,线上 crawl 也要直接请求每个候选 URL。
- **[2026-07-20] 手写静态 sitemap 必然漂移是已验证的反模式**:新页面上线但 sitemap 未同步更新的发生率 100%(本站实证:12 个星座页上线但 sitemap 仍只有 7 条)。小站认为"手动加一下很简单"——但人永远会忘,尤其数据驱动的动态路由(从 JSON 读 slug)不会主动提醒你更新 sitemap。任何超过 5 页的站,sitemap 必须由代码生成,无例外。
- **[2026-07-20] React/JSX SSR 页面的文本断言必须先归一化空白**:JSX 在插值边界注入 `<!-- -->` 注释标记,剥标签后 "How to Choose a Pearl" 变成双空格,天真 substring 检查报假阴性(实证同一天两个独立检查脚本都中招)。规矩:剥 script → 剥标签 → 空白归一化(`\s+`→单空格),然后才做 in/count 断言。
- **[2026-07-20] 模板+数据驱动批量页的 meta 长度断言按"最长数据组合"逐行算**:title/desc 模板串上最长实体名组合(如 "Sagittarius"+"Turquoise")才是超标点,只人工看旗舰页必漏(实证 12 页里 5 title/4 desc 超标,旗舰 Leo 恰好全合规)。修法=build 链加内容断言脚本,镜像模板字符串对每行数据计算长度;同一脚本顺带断言"每个数据引用都解析得到记录"(组合名 slug 查不到记录 → 整块静默不渲染,页面残缺 40% 无人报错)。上线前负向测试确认断言真的 exit 1。
- **[2026-07-20] 批量内容的事实错误浓度在"边角层"**:核心实体内容被反复过目,事实错误聚集在辅助层(aux 条目、次要 blurb)——一轮全量核查 3 个事实错误全部出在边角(含人物出生年份都对不上的张冠李戴)。审核资源分配要反直觉:越边角越要查;"人名+日期+数字"组合是最高危形态,联网核证优先给它们。
- **[2026-07-21] Workers Custom Domain 与旧根域 A/AAAA 记录冲突时，先读 CF API 错误再动 DNS**:自定义域部署若报 `100117 Hostname already has externally managed DNS records`，`custom_domain:true` 和 Wrangler 的覆盖参数都不会删除外部管理的同名 A/AAAA/CNAME。先列出该 hostname 的全部记录，确认旧源站确实失效后，只删除冲突的 IP/CNAME 记录，保留 TXT/MX/验证记录；重跑部署后 CF 会建立只读代理 Worker DNS 和证书。验收必须同时查 Custom Domain API、HTTPS 实际响应、canonical 和 sitemap，不能把 Worker upload 成功当域名上线。
- **[2026-07-21] IndexNow 的安全接入是“线上 root key + 已发布 canonical + 精确变更”**:先把 UTF-8 key 文件部署到正式域根目录并实际读取核对，再从 sitemap/路由真源筛出已上线的 canonical URL 提交；响应 200/202 只代表接收（202 还可能在校验 key），不是抓取或收录。首发可一次回填；默认只提交新增、更新或删除 URL，避免无意义地消耗 crawl quota。若用户明确要求小站每次生产发布全自动通知，则只能把 `--all` 串在**成功的** `wrangler deploy` 后，并以当次 sitemap 为唯一 URL 真源；通知失败必须让 CI 标红，但不能误称已发布的 Worker 被回滚。客户端脚本应在本地拒绝外域、query/hash 和 sitemap 外路径，并只重试网络或 5xx，4xx 直接报错。
- **[2026-07-21] 目录宣传不是链接属性证据**:免费目录的“可见 listing”与“可传递权重的外链”是不同事实；提交成功后必须打开最终公开页，核对目标 URL、重定向形态和 `rel`。实证中页面即时上线但出站链接带 `nofollow`，所以记录应拆成“已提交 / 已上线 / follow 或 nofollow / 已收录或带来 referral”，不得用 DR 宣传替代核验。
- **[2026-07-21] 批量目录的 success keyword 只能产出待复核候选**:通用确认词会读到表单说明或营销文案而误报成功；实证中一个页面正文写“review your submission”但同时报 `Tool's Name is empty`，另一个所谓确认页其实还停在选择免费/付费方案。批次结束后必须逐条核对结果 URL、错误提示、下一步按钮和邮件/审核门槛，再把状态落成“确认提交 / 待验证 / 校验失败 / 未提交”。

- **[2026-07-21] 建页和等权重不互斥——DR 0 阶段内容页的内链拓扑价值大于排名价值**:新页面即使短期无法排名,它向现有页面注入的内链(月历→晶体×2+星座×2+首页+Chart = 6 条/页)会加速爬虫发现已有页 + 传递话题信号 + 储备长尾变体的零成本曝光。因此内容拓扑型扩展(月历页、聚合页)在 DR 0 就应该建,不需要等到有权重再建——等的成本(内链缺口期)比建的成本(多维护几页)高。实证:某 29 页内容站仅靠双圈互链,补 10 个聚合页即注入 42 条新内链打通三圈闭环。但此论点不适用于需要独立排名才有流量价值的孤岛页(如博客文章)。
- **[2026-07-26] 「可下载资产」挂哪个页面由 Suggest 的词形决定,不由你觉得哪页合适**:直觉会把可打印图表挂在最相关的新页(日历),但 Suggest 实测 `printable birthstone` 的 8 条联想**全部落在 chart、无一落在 calendar** —— 用户脑子里「能打印的那张表」叫 chart。而且 Suggest 会把形态一并说死(`free` / `pdf` / `with pictures`),照着做就行,不用猜。**配套裁决**:逐个子实体的下载页要先验需求——`printable december birthstone` 与 `december birthstone printable` 双双返回空,证明需求只在「一张涵盖全集的表」这个粒度,做 N 个单实体下载页 = N 个无人搜的薄页。
- **[2026-07-26] 「新增几个页面」是用户最容易误解的一环,先把「文件不是页面」讲清楚再谈方案**:PDF/PNG/WebP 是静态资产,不进 sitemap `<loc>`、无 TDK、不参与索引竞争;把可下载资产做成「现有页的一个 H2 区块 + 几个文件」通常是 0 新增 URL。用户问「是不是每个都要独立页面/独立 URL」时,答案往往是零,但必须画出层级图(页面 / 区块 / 文件三层)才讲得明白。**拆独立页要给触发条件而不是拍脑袋**:等 GSC 出现该词形的查询打到母页但排名靠后,才说明母页吃到意图却因 title 没占住词而排不上——那时拆才有依据。
- **[2026-07-26] 程序生成的下载物必须与站点共用数据源,并给排版加溢出断言**:海报/图表类可下载资产一旦手绘,必然与站上数据漂移(硬度改了、多石月份改了,下载版还是旧的)。正解是脚本从既有数据文件生成并进 build 链。**排版守卫同样重要**:固定画布(A4 595×842pt)里塞 N 行内容极易越界,而生成物是图片、CI 不会报错、肉眼不看就发不现——加一条「格内最后一条基线 ≤ 卡片高度」的断言,本轮当场咬中 152pt 内容塞进 150.5pt 卡片、两行文字被下一行边框划穿。
- **[2026-07-26] 修饰词的降难效应逐个实体不同(−11.5 到 −39.5),查一个就外推必然误判**:同一模板的 12 个词(`{month} birthstone meaning`)实测 KD 从 9.5 到 42.7 横跨三个难度档,`+meaning` 相对头词的降幅 October −39.5、December −32.8、April 只有 −11.5。**一个模板化词族看起来同质,SERP 却各不相同**——竞争者按实体分布不均(某些月份被珠宝电商重点做,某些没人管)。规矩:词族规划要**逐个实测**,不能查一个代表性词就给整族排批次;配额不够就先查最可能做的头几个,把其余标 `未测` 而不是估算填表。附带判据:排批次时用「KD × 最弱占位者 DR × 该占位者体验分」三元组,只看 KD 会把"最弱位是 DR 64"(无位可挤)和"最弱位是 DR 11 且体验分 29"(可挤)混为一谈。
- **[2026-07-26] 盘面里出现「低 DR + 高体验分」的占位者是警告而非机会**:哥飞模型会显式标注这种位置——DR 15 但停留 2:13、跳出 37%、体验分 81 的站,判词是"靠产品力站住的位置,复制它需要同等的产品质量"(-8)。**这类位置不是靠外链能拿的**,和"DR 11 + 体验分 29"的脆弱占位者要分开处理:后者堆链接+做好内容能挤,前者必须在内容质量上真正超过它。规划文档里要把这两类分开标注,否则执行时会误判工作量。
- **[2026-07-26] 一个修饰词能把同一主题的 KD 砍掉 30 分,选词必须在词形层面比价而不是主题层面**:`december birthstone` KD 46.5(8/8 是标题命中的单月专页,Tiffany/BlueNile/Jared 等电商重兵,需 50–110 引用域),加一个 `meaning` 变成 `december birthstone meaning` KD **13.7**(仅 3/8 标题命中,DR 11、体验分 28 的站占着 #6,需 10–20 引用域)。**同一主题不同词形是两个完全不同的 SERP**,只查主题头词就下"这个方向做不了"的结论必然误判。机制:头词往往是交易意图(电商砸资源),`+meaning`/`+symbolism`/`+history` 这类修饰词把意图切到内容侧,电商不专门做。**规矩**:对任何候选主题,至少查「头词 + 一个内容型修饰词」两个词形再裁决;规划文档里排批次也要按最终要打的那个词形排,而不是按头词。
- **[2026-07-26] 聚合页/工具页打不过"专页"盘面,但能吃"无人专门经营"的盘面,判据是 SERP 里的「专门经营」比例**:哥飞 KD 报告直接给这个信号——`birthstone calendar` 前十只有 1-2 个标题命中、"没有人押上首页经营这个词",聚合工具页有结构性机会;`december birthstone` 8/8 标题命中、模型明确标注"被正面争夺的红海词",聚合页零机会。**所以"一个聚合页承接 N 个子主题"这种设计,可行性完全取决于那 N 个词的专页比例,不取决于你的页面做得多好**。查一个代表性子词的盘面就能定生死,别先写代码。
- **[2026-07-26] URL 参数态(`?month=12`)永远不会成为独立搜索结果,别把它当承接页规划**:参数页的 canonical 必须指回无参基础页(否则自造重复内容),因此它在索引层不存在。想让某个子主题被单独承接只有两条路:独立 URL,或者接受由基础页整体承接。**用户常见误解是"给参数页做好 SEO 就能命中子词"**——要先把这条讲清楚再讨论方案,否则整个讨论建立在错误前提上。锚点(`#december`)同理:它能做站内链接目标和 passage 提示,但不产生独立索引单元;且锚点指向 `display:none` 的元素时原生跳转失效,需要在挂载时把 hash 解析成选中态。
- **[2026-07-26] 用户报"页面跳一下"时,先把同时发生的几件事拆开分别测,别信因果直觉**:用户看到的是"改选项 → URL 变 → 页面跳",三件事同时发生,几乎必然归因到最显眼的那个(URL)。实测:单独调 `replaceState` 滚动位移 **0px**,单独换面板位移 **150px** —— URL 完全无辜。根因是**可切换面板高度不等**(12 个面板 306–455px,摆动 149px),切换时它下方的一切被推走;顶部 tab 切换看不出来(变高的部分在视口下方),只有触发控件位于变化内容**下方**时用户才会被推走,这正是"只有些选项才跳"的解释。修法优先选"让触发控件把目标滚进视口"而不是锁死容器高度(后者要为最高的那个面板永久留白)。**通用检查**:任何 tab/手风琴/结果卡设计,先量各状态高度差,再看触发控件在内容的上方还是下方。
- **[2026-07-26] 单页应用里手写 `history.replaceState` 必须把原 state 传回去,且不能在水合前判断它是否为空**:框架路由(TanStack Router 等)把自己的 `__TSR_index`/`__TSR_key` 存在 `history.state` 里做历史追踪与滚动恢复;传 `null` 或 `{}` 会整个抹掉,后续导航的滚动行为随之出错。正确写法恒为 `replaceState(window.history.state, "", url)`。**陷阱**:SSR 页面在水合完成前读 `history.state` 得到 `null`,据此会误判"路由器根本没存东西、传 null 无害"——本轮差点因此否掉正确假设,水合后再读才是 `{__TSR_index, __TSR_key, key}`。排查时对全站 grep `replaceState` 逐个核对第一个参数,一个项目里通常只有最早写的那处是对的。
- **[2026-07-26] 循环里渲染的样板文案 = DOM 里的 N 份重复文本,肉眼永远查不出来**:免责声明、"了解更多"、单位说明这类文字写在 `.map()` 内部时,读者一次只看到一份(其余被 `hidden` 藏着),但爬虫拿到的是 N 份完全相同的段落,直接稀释主题词密度。实证:诞生石日历 12 个月面板各带一份相同的 chakra 免责声明,提到循环外只写一次后,页面从 2,403 词降到 2,006 词,少掉的 397 词全是重复样板。查法只能是数 DOM(`txt.count(片段)`),不能靠看页面。**推论**:凡是"每个卡片/每个 tab 都有同一句话"的设计,都应该提到容器层。
- **[2026-07-26] 「先否定后肯定」是跨语言的 AI 指纹,英文站同样要清,且改法是删掉否定的那半句**:`not X but Y` / `rather than` / `instead of` / `neither` / `says nothing about` / `X by design` 全是同一套路,和中文的「不是A，而是B」同源。实证:一版新写的英文页 12 处,其中 `rather than` 独占 6 处——这个词在英文技术写作里太顺手,是最容易漏的一个。正确改法不是换同义表达,而是**只留肯定的那半句**(`is not one mineral but a family of them` → `Six related minerals share the garnet name`;`Neither answer is wrong` → `Both answers are right`)。配套一个次级 tic:`which is why` 在 12 段并列文案里出现 5 次,同样要清零。
- **[2026-07-26] N 个并列条目的首句结构必须打散,同构就是模板指纹**:批量写 12 段/12 个卡片时,最自然的写法是每段都「{主体名} + 动词」开头,结果 12/12 同构,读者翻两屏就察觉是一句话跑了十二遍(红线级的模板页问题)。做法:强制按不同锚点起头——数量、地点、年代、过程、物质、名字,名字起头的控制在半数以下。检查方法是把 N 段的首个逗号前的部分并排打出来看,一眼可辨。
- **[2026-07-26] 改完内容必须重核计数,这是最容易漏也最显业余的一类错**:每轮改写都会让数字、区间、以及"页面承诺展示 X"与"实际展示了什么"对不上。日历页一轮改写后抓到 3 处:①FAQ 说星座起始日是 20th-23rd 而正文说 19th-23rd(Feb 19 = Pisces,19th 才对)——**同一事实在两处用不同数字表述时必然有一处错**;②新写的 intro 承诺"每张卡片给 color and hardness",但硬度当时只在表格里,卡片没有;③改写引入了 `Name: X: y` 双冒号渲染。前两类要写成脚本比对(数据源 vs 文案断言、承诺清单 vs 组件实际字段),不能靠通读。
- **[2026-07-26] 交互式"分月/分类"页要把全部面板渲进 SSR,靠 `hidden` 切换,而不是点击才渲染**:这类页(日历、tab 式对比、手风琴)的排名价值恰恰在于那 N 份长尾正文;点击后才挂载 = 爬虫只拿到 1/N,页面退化成一个空壳工具。实证:12 个月面板全量 SSR 后 raw HTML 有 2,403 可见词、12 段独有事实全部可抓,而交互体验完全不变。配套两条:①深链(`?month=N`)必须服务端就渲染对应面板,别等水合;②"当前月/今天"这类高亮**只能 mount 后算**,服务端取当前日期会让 HTML 随请求日期和时区变化(React #418),还会毁掉整页缓存——默认值取固定值,个性化交给页内控件。
- **[2026-07-26] 为省客户端包而复制的数据,安全性 100% 来自那条构建断言,复制和断言必须同一个 commit**:把大 JSON(64 条长文记录)整个 import 进客户端组件是包体灾难,所以抄少量字段(如 12 个 Mohs 值)进小数据文件是对的;但抄贝一旦没有断言就是必然漂移的第二真源。规矩:抄贝的注释里写明"由 X 断言守护",断言逐字段比对原始文件,并**负向测试确认它真的 exit 1**(改坏一个值看构建是否失败)——本轮 4 条断言全部负向测试通过,其中"关键词与另一页重复"这条是纯内容红线,静态类型检查永远抓不到。
- **[2026-07-26] 组件库的浮层控件(Radix Select 等)在浏览器预览面板里常常驱动不了,别把它当产品 bug 也别硬刚**:实测合成 pointerdown、typeahead+Enter、ArrowDown+Enter 全部无效,面板还会把 `innerWidth/innerHeight` 报成 0、`read_page` 返回空、`getBoundingClientRect` 全 0;换 tab、resize、把元素 `position:fixed` 钉到顶都救不回来(钉住反而会破坏 Radix 的定位)。正确做法是换一条能给出真实证据的验证路径:把该控件**最终影响的断言**抽出来,用真实编译产物验证(本轮改为对已上线的姊妹页发请求,核对 SSR 输出里的星座跨界结论 6/6 正确)——这比反复戳弹层更有价值,因为文案里的事实断言错了是红线级问题,而 select 接线错了是一眼可见的表层问题。报告时如实说明哪条路径验了、哪条没验。
- **[2026-07-25] 多个知识库文件同时过期会制造"一致的错觉",跨文件一致 ≠ 事实**:某内容站的 `plan.md`/`audit.md`/`baseline.md`/`infra.md` 四个文件全都写着"GSC 未接入、仅首页被索引",互相印证得毫无破绽——实际 GSC 三天前就接好了,sitemap 31 URL 状态成功,抽检页面全部已编入索引。根因:一处状态变更时没人回写全部引用点,而后续每次读取都在复制同一个陈旧事实。规矩:**凡是"外部系统的状态"(GSC 接没接、sitemap 收没收、页面收录没收录、外链上没上线),一律以实时查询该系统为准,知识库只当线索不当证据**;确认后必须把全部提到该状态的文件一次改完(grep 状态关键词找全引用点),否则下轮又会被同一批文件误导。
- **[2026-07-25] "已索引"和"有曝光"是两个独立诊断,别把权重问题当技术问题修**:新站常见形态 = 31 页全部被发现、抽检页面均"网页已编入索引"、无人工处置措施,但 GSC 效果报告里**只有首页拿到曝光、内页近乎为零、平均排名 30+**。这不是收录故障,继续修 canonical/schema/sitemap 是白费力气;它是 DR 0 的权重与"索引后观察期"共同作用。判读顺序:①URL 检查确认索引状态 → ②效果报告看曝光的**页面分布**(不是总量) → ③两者都正常才说明瓶颈在站外(外链/内容面积)。反之若"已索引但零曝光"持续 30 天以上且有外链进来,才回头查内容质量或意图错配。
- **[2026-07-25] GSC URL 检查只能走顶部输入框,且必须坐标点击**:`/search-console/inspect?resource_id=...&id=<明文URL>` 形式的深链一律 404(GSC 的 `id` 是内部不透明句柄,如 `OA4xThouN1b6yTnlqOtM6w`,无法自己构造)。唯一可靠路径 = 顶部"检查…中的任何网址"输入框;而该框用 `find` 返回的 ref 点击后**接收不到键入**(type 静默丢弃,页面毫无变化),必须先 `screenshot` 再按坐标 `left_click`,然后 type + `key: Return`,等 4-5s。同一 quirk 也适用于 GSC 的其他自定义控件——ref 点击失败时先怀疑它,别以为是选择器找错了。
- **[2026-07-25] `.rankup/plan.md` 的勾选框是滞后指标，激活 skill 后必须先做三方对账再答"接下来做什么"**:计划文件由人/agent 手动勾选,而代码由 commit 推进,两者必然漂移。开工第一步 = `git log --oneline -25` + 路由文件清单 + `sitemap.xml` 的 `<loc>` 全量,三方交叉才是真实交付状态。实证:某内容站的 plan.md 把已部署上线的功能仍标为未完成(commit + 页面 + 导航 + 组件 + sitemap 条目俱在),若直接照 plan 回答会让用户重做一遍已完成的工作。同类残留:仓库根的 `progress.md`/autopilot 状态文件在任务完成后不会自动清理,读到"⏳ 未开始"要先去代码里验证,别当成待办。对账后立即回写 plan.md,不要只在回复里口头更正。
- **[2026-07-21] 全站性能验收必须从 sitemap 枚举真实 URL，不能用首页或一次满分代表全站**:先按模板分组定位可传播的共性问题，再对 sitemap 全集跑生产双端报告；同时保存 FCP/LCP/TBT/CLS，不能只存总分。PageSpeed 是受测试节点、网络与部署传播影响的估算值：同一构建可在 TBT 0/150ms 间波动，旧 HTML 引用刚下线的哈希资源还会短暂制造 Best Practices 误报。正确裁决是先复核 CI、生产 HTML/资源与重复运行；只有可复现的资源、主线程或布局问题才改代码，不能靠刷新筛选漂亮截图，也不能承诺每次恒定 100。
- **[2026-07-30] 聚合型首页的品牌 Hero 应稳定表达整站主题，日期个性化留在次级组件**:首页服务完整品类或 Finder 时，用“今天/本月/当前星座”决定首屏主图，会让页面主题、品牌记忆和不同访客看到的视觉证据随请求漂移；固定的全品类主视觉更适合作为 LCP。仍有用的日期个性化可以保留在下方 CTA/结果卡，并把两条数据依赖拆开。验收要同时断言首页 raw HTML 不再出现动态 Hero 路径、个性化 CTA 的日期函数仍在、子实体详情页原 Hero 未受影响；图片还要用固定尺寸 + responsive `srcSet` + eager/high priority，避免把品牌一致性修复变成 LCP/CLS 回归。**换可见 Hero 时必须同步审计社交 Meta**：`og:image` / `twitter:image` 常仍指向旧默认图；为首页单独绑定 1200×630 分享图，不要顺手替换全站 fallback，并把 URL、尺寸、alt 与路由接线一起写进构建守卫。

- **[2026-07-19→2026-07-30 修订] Stripe 资源 ID 的模式不能靠 ID 字符串判断**:`price_`/`prod_`/`we_` 的形态不携带 test/live 信息。自动化验收只允许静态 binding/配置合同、本地 mock/unit 和 Stripe test mode（断言金额、币种、`recurring.interval`）；**禁止为核价从生产 API 创建 hosted Checkout，也禁止点击生产购买入口**。live 配置只能由站点所有者提供既有只读证据或等待真实交易观测，不能把新建 live Session 当验证手段。
- **[2026-07-19→2026-07-30 事故修订] "没人付款"四路并行定性法**:①只读既有运营证据按日比较 sessions/PI/charges/events（剔除历史合成数据）②静态链路、构建产物与本地 mock/unit；需要托管语义时只用 Stripe test mode，**不得创建 live Session 或请求生产 `/api/checkout`** ③改动窗口 commit 逐一 CLEAR/SUSPECT ④GSC 周对比。低基数站先算基线——"上周有人付款"可能只是唯一一位买家，短窗口零单可能是统计常态，别先假设故障。冷知识:`checkout.session.created` 事件类型在 Stripe 不存在（创建是同步 API 调用，不发事件）。
- **[2026-07-30] URL 迁移期的页面报表必须把旧 URL 与新 canonical 合并看，再判断涨跌**:根路径 301 到语言目录后，GSC 仍会把历史点击和曝光留在旧 URL，同时新 URL 开始积累数据；只看旧页会得到“流量暴跌”，只看新页会夸大“突然增长”。先按同一查询意图聚合旧入口与新 canonical，再分别检查重定向、canonical 选择和新页趋势；站点总量、查询簇和 URL 迁移要分三层解释。
- **[2026-07-30] 跨站读 GSC 必须先统一日期范围，第三方共享工具失败不能阻塞主判断**:GSC 会为不同 property 保留不同的 28 天/3 个月选择，同一时刻直接抄卡片会得到不可比较的窗口；先显式切到同一周期并把图表起止日期写入证据。Similarweb 共享代理还可能出现“URL/标题已加载但正文空白”的节点故障，此时记录 `unavailable`，继续用 GSC、生产 HTML 和 sitemap 做决策，绝不把空白当成 N/A 或零流量。
- **[2026-07-30] zsh 脚本禁止把 `path` 当普通循环变量**：zsh 的小写 `path` 是与 `$PATH` 绑定的特殊数组；`for path in / ...` 会在当前 shell 内改写命令搜索路径，随后 `curl`、`grep`、`mktemp` 等全部报 `command not found`。多 URL 探测统一使用 `route_path` / `target_url` 等任务专用变量名。
- **[2026-07-30 事故修订] 生产支付不能用 live Checkout 核价**:一次“停在付款前”的核价仍创建了两个未付款 live Checkout Session，证明打开 hosted Checkout 本身就是生产写操作。SEO/CRO 付费口径只允许核对源码与 raw HTML → 本地零输入水合 DOM（拦截 `/api/checkout`）→ 运行时语言包与支付脚本 → 构建产物/负向注坏守卫；需要 Stripe 托管语义时只能用 `sk_test`/test Price/`cs_test`。自动化禁止点击生产购买、请求生产 `/api/checkout`、使用 live Stripe API 或访问生产 hosted Checkout；live 配置只接受所有者提供的既有只读证据或真实交易后的被动观察。
- **[2026-07-31] 读第三方 On-Page 体检的第一步是核对「它测的词形 = 你声明的目标词形」,不符则难度与优先级结论全部作废**:一份 10 页体检把 8 个月份页判为"完整短语出现次数为零"并建议正文补 `february birthstone`——实测该头词出现 6 次(0.76%),事实陈述本身就是错的;而它给的全部 KD/月搜/链接预算也都是**头词**口径。同日同工具实测:`february birthstone` KD 56.6 / 需 80–170 引用域(GIA DR87、Brilliant Earth DR75、Zales DR72 把守),`february birthstone meaning` KD 32.1 / 需 30–60 且**前十无一把该词当主力流量词**。照报告改 = 主动进红海并稀释真正在争的词。**但报告对页面本身的观察可能仍然有效**——本轮它对聚合页的判断(Title/H1/密度脱靶)就是对的,且实测比它说的更严重(精确短语全文 1 次、0.25%、H1 是意译、6 个 H2 无一承接)。规矩:体检报告拆成两类信息分别处置——①**页面事实观察**(密度、标题、结构)可核可用;②**难度/优先级/词量**必须先验词形,不符即作废重排。
- **[2026-07-31] 断言「声明一个短语、测量另一个短语」是最难自查的一类守卫缺陷,修好一处必须立刻横扫同类页族**:某项目的月份页断言 `target_phrase` 必须等于 `{Month} birthstone meaning`,三十行后的密度检查测的却是 `{Month} birthstone`——八个页面的声明目标词全部落在 0.32%–0.40%(跌破 0.5% 下限)而构建全绿。同一病还有第三种变体:聚合页**声明了却根本不测**正文(1 次 / 1,580 词 = 0.25%)。关键教训:这个 bug 两轮前刚在**晶体页**修过(把短语从推导改成声明),修完没有回头横扫,于是月份页版本继续潜伏。**规矩:修好任何一处"测错对象"的守卫后,立刻对所有同类页族逐个回答两个问题——①它声明目标短语了吗?②它测的是不是同一个?两问有一个为否就是同一个 bug。**本轮横扫产出:晶体页 ✅、每日水晶页 ✅、月份页 ❌(声明 A 测 B)、聚合页 ❌(声明了不测)、星座页 ⚠️(根本不声明,靠推导,今天恰好全对但正是击穿晶体页的前置条件)。
- **[2026-07-31] 密度公式若已乘 `phraseWords` 就是 n-gram 长度中立的,换长短语不必改区间**:把目标从两词换成三词时,直觉是"三词自然更稀疏,区间要放宽"——这个直觉在公式写对时是错的。`density = 命中次数 × 短语词数 ÷ 总词数` 算的是**页面有多少比例的词花在该短语上**,已经归一化:1,700 词页面里 4 次三词 = 6 次两词 = 0.71%,同一个数;粒度也够(一次使用值 0.17–0.22 个百分点)。规矩:改目标短语长度前先看公式有没有乘 `phraseWords`;乘了不用动区间,没乘(只数命中次数除以总词数)才需要按长度分档——而那种公式本身就该修。
- **[2026-07-31] 目标短语与头词存在包含关系时必须分别设限,且方向相反**:抬高 `{month} birthstone meaning` 会连带推高 `{month} birthstone`(前者包含后者)。实证:October 头词已在 1.40%,再补两次 meaning 就会破 1.5% 顶。做法=给**目标词设地板**(必须承接)、给**头词只设天花板不设地板**(不许堆砌但不强制承接);October 最终用头词中性的改写(`What does the X birthstone mean spiritually?` → `...X birthstone meaning in spiritual practice?`)落到比改前更低。只守一边的话,抬高目标词会把头词一起推过线。
- **[2026-07-31] 工具评分逼近满分后要主动封板,继续追黄灯就是把指标当目的**:全站 On-Page 均分 96.1、无红灯之后,体检工具剩下的建议是"4词/5词密度榜未上榜""词数超 1800"。前者要求补的是头词的长尾变体(见第一条,方向反),后者在本例中会砍掉刻意全量 SSR 的 12 个轮换面板——**而那正是让该页可被爬取、可排名的东西**。规矩:给每轮优化写一条**封板声明**(当前分数、剩余项逐条判为"不做"及理由),否则工具永远有下一个黄灯,团队会持续消耗在零边际收益的项上,而真瓶颈(本例:已核实 follow 外链 0 条)一动不动。
- **[2026-07-31] 否决裁决必须写死"词形边界",否则会被后人误读成整个 IP/主题的否决**:某工具站的 `decisions.md` 里一行"Breaking Bad ❌ 不做 | Suggest 空",实际调研范围只有 **business card** 一个词形;半个月后它成功阻止了对整个 BB IP 的复查,而复查显示 `breaking bad font/logo/title card/name generator` 全部 Suggest 满格、KD 只有 9–31.8、站点在该 IP 上的 SEO 面为 0。**同宇宙≠同需求"这条经验反过来同样成立:同一 IP 的不同词形也是完全不同的需求**。规矩:裁决行必须写成"X 的 <具体词形> ❌ 不做",并注明"未覆盖的词形:…";复核旧裁决时先问"当时到底查了哪几个词",别信摘要。
- **[2026-07-31] KD 极低但 Trends 归一化为 0 = 体量陷阱,难度和需求必须两侧都查再排序**:`breaking bad title card generator` KD 9.0(极易)、组件现成,看起来是最该先做的;但把它和同 IP 的兄弟词放进一次 `compare` 后,全年 12 个月归一化值恒为 **0.0**(logo 88.6 / font 31.5),说明绝对量低于归一化地板。哥飞模型在取不到月搜量时会显式提示"难度合适但体量过小的词同样不值得做"——这句提示要当硬门禁,不是免责声明。**排优先级用需求侧(Trends 同批比较 + KD 的 keywordVolume),不用 KD 高低**;KD 只回答"能不能拿下",不回答"值不值得拿"。
- **[2026-07-31] 同一 IP 的多个工具词常共享一个 SERP 盘面,查 3-4 个词看 top3 域名重合度就能判定**:BB 的 font / logo / text / title card / name / periodic-table 六个 generator 词,前三名几乎恒定是同一组三个站(kassellabs DR48、elementfinder DR15、echosystem.fr DR5)。这意味着**它不是六个战场而是一个**——一个真正好用的聚焦页有机会通吃整簇,链接预算按最难的那个词算(35-40 引用域)而不是六份叠加。判据:对同族 3-4 个词各跑一次 KD,把 `details[]` 的 top3 域名并排看,重合 ≥2/3 即判为共享盘面。附带信号:这类盘面里若有 DR 5 / 体验分 0 / 跳出 100% 的站长期占着 top3(模型会标"脆弱占位者"),说明整簇根本没人认真经营,是结构性机会而非红海。
- **[2026-07-31] "先查 GSC 有没有免费信号"对全新实体必然返回 0,别把它当否决票**:GSC 意外集群的存在有前提——**页面上必须已有可匹配的文本**。某工具站白捡 "logo generator" 集群,是因为 title/正文本来就含 "logo" 一词,Google 有东西可匹配;而同站对 Breaking Bad 的 3 个月 GSC 过滤查询是 0 点击/0 曝光(`breaking` 与 `heisenberg` 双词均为 0,80 行全量查询表逐行核对无一条 BB 词),因为全仓库对该 IP 的可索引位置**一个字都没有**。规矩:开工前查 GSC 要先分清两类——①**近义/衍生词的意外集群**(站上已有文本基础 → 有信号=可立即收割,无信号=真需求存疑);②**全新实体/IP**(无文本基础 → 0 曝光是必然,不含任何需求信息,需求判定只能靠 Suggest/Trends/KD)。把第二类的 0 读成"没需求"会误杀方向;反过来,也要据此下调预期——它是冷启动(要走完整收录→爬取→起量周期),不是"上线即接住既有曝光"的专页打法。
- **[2026-07-31] 用头词的 Trends 值论证工具页的需求是无效论证,必须先验头词 SERP 的意图归属**:`breaking bad logo` Trends 峰值 88.6(是 `breaking bad font` 的 3 倍),据此把 logo 排成 P0——但补查该头词 KD 后,前十是 **9/9 专门经营** 的 Wikimedia Commons / Pinterest / seeklogo / 1000logos / logos.fandom,全是**图片下载与图库站**,KD 49.3 红海。头词意图 = "下载官方 logo 图",工具站一点吃不到;真正可承接的只有 `+generator`(KD 29,330/mo)/`+maker`(KD 10.1)这一档。**Trends 只能比较词与词的相对热度,它不告诉你那份热度是不是你的产品能满足的**。规矩:任何用头词热度支撑的建站论证,必须先跑头词 KD 看前十性质;头词与工具词的 SERP 组成完全不同时,可承接盘子只算工具词那一档,别把头词的量写进预期。这与已有的"一个修饰词能把 KD 砍掉 30 分"是同一现象的两面——修饰词切换的不只是难度,更是意图归属。
- **[2026-07-31] 判断"这个词的量够不够"要用本站自身数据锚定,不要用绝对值直觉**:330/mo 听起来很小,但该站全站 3 个月 987 点击(≈329 点击/月)、最强词 `better call saul logo generator` 也只贡献 53 点击/月——330/mo 的词若拿到位置 2 并复制其 44.5% 的 CTR,约 130 点击/月 = **全站流量 +40%**。反过来在月均十万点击的站上,同一个词不值得开页。规矩:每次给出"值不值得做"的结论,分母必须是该站 GSC 的真实月点击与其最强词的单词贡献,并同时写出下修因素(估算口径、冷启动、引用域缺口、SERP 里靠产品力站住的强者);只报乐观上限是误导。
- **[2026-07-31] "复用现有组件"的成本估算必须先读绘图层,不能只看目录结构**:该工具站的页面是 20 行薄壳 + `src/data/<tool>.ts` 数据驱动,从结构看"加个 BB 页 = 新 data 文件 + 新路由";实际 LogoMaker 的画布代码是目标标志的**逐像素几何重建**(`SKEW=-0.26`、`NAME_INK=2.6`、正义天平线稿,注释写明数字量自原图),对另一个 IP 的视觉语言零复用。**薄壳架构会让人高估复用度**——真正决定成本的是画布/渲染层是通用的还是为单一视觉写死的。规矩:承诺"复用组件、成本最低"之前,先 grep 渲染函数里的常量;出现从原作量取的比例、专有线稿资产、写死的配色名,就是专用渲染器,按新建估算。**可复用的通常是管线不是绘图**(导出注册表、水印、支付、SEO 断言链);把这两层分开报价,用户才能做真实决策。且估算翻倍时要停下来重新征求同意,因为用户上一次的"可以"是基于旧成本给的。
- **[2026-07-31] 新页面的 `.<容器> p { color }` 兜底规则会静默吃掉所有更具体的单类规则**:Astro/Vue/Svelte 的作用域样式给每个选择器都补一个属性选择器,于是 `.page[attr] p[attr]`(0,3,1) 直接压过 `.eyebrow[attr]`(0,2,0)、`.field-hint[attr]`、`.warning[attr]` 等等——本轮一条兜底规则同时把 7 处文字改成同一个棕色,其中徽章变成深棕压深绿,是实打实的对比度事故。**肉眼看截图不一定发现**(颜色都"像是对的"),要用 `getComputedStyle` 逐节点比对意图值。规矩:①正文色只给正文区块(`.how p, .faq p …`),别给页面根;②新页面上线前跑一次全节点对比度扫描(遍历可见文本节点,按字号/字重取 4.5 或 3 的阈值,逐个算 ratio),本轮据此抓到 5 处不达标并逐一改到达标。
- **[2026-07-31] 工具站的预览图/OG 图应当由工具本身的真实输出生成,不要手绘 SVG 再转码**:手写 SVG 转 PNG 时本机没装页面用的字族(Anton),rsvg 静默回退成常规字重,产出的"预览图"与用户实际看到的重量级窄体完全不同——而它正是 SERP 缩略图和社交卡片用的那张。正解=把页面跑起来,调工具自己的导出函数取 dataURL 落盘,再转 WebP;这样预览图与产品**同源**,产品改了重跑一次即可,且不存在字体缺失问题。生成后**删掉手绘 SVG**,否则它会成为一个永远漂移的假真源。
- **[2026-07-31] 同一仓库有并发会话时,共享组件的新增 prop 会让你"写的时候正确"的调用静默失效**:本轮新页面挂 `<PaidExport freeDownload />` 时该组件只有这一个开关;半小时后另一会话提交 `fix(export)` 给它加了 `exportChoice` 来门控选择器 markup 与 `window.bcsOpenExportChoice` 的安装。结果新页面的付费路径**静默不可达**——按钮 catch 不到 chooser 就回退到免费导出,零报错、构建全绿、截图正常。规矩:①开工前 `git log --oneline -3` 存下基线,收尾前再看一次,有新 commit 就重新验证自己接入的每一个共享钩子(不是重新 build,是重新在浏览器里断言函数存在且被调用);②对共享组件的调用,验收断言要写成"钩子函数 typeof === 'function' 且点击后弹层真的 open",别只断言构建产物里有 markup;③把"与现有页面对照"当标准手法——同一钩子在旧页面是 `function`、在新页面是 `undefined`,一次对照就定位到 prop 缺失,比读源码快得多。
- **[2026-07-31] 重建一个已存在的视觉标识时,比例必须逐像素量原图,凭记忆做出来的东西会在七项里错六项**:本轮第一版 BB 瓷砖标"看起来挺像",实际全大写(原作混合大小写)、无衬线(原作衬线)、浅灰字(原作深绿)、圆角(原作直角)、纯色(原作对角渐变且两块镜像)、原子序数在左上(原作右上)、两行各自居中(原作沿对角错开整块)。**构建断言全绿、对比度全过、截图看着没问题**——因为这些守卫管的是字符数、资产存在与可读性,没有一条管"像不像"。规矩:①拿到官方矢量图(Wikimedia 等)渲成高分辨率位图,写脚本采样出瓷砖/字重/基线/间距/配色,把每个常数标注成"measured, 不是 eyeballed"(现有 LogoMaker 的注释就是这么写的,应当照抄这个规范);②改完用**同一套测量脚本**量自己的画布,逐项列表对比,目标 ±0.01;③测量脚本的颜色阈值要够紧——本轮文字检测容差过宽,把瓷砖渐变的深色角当成文字,量出 x-height=0.689 的荒谬值,险些据此改坏正确的渲染;④换字体后所有从字形推导的常数(x-height、左边距)必须重新标定,并在注释里写明"若换默认字体需重量"。
- **[2026-07-31] 用户一句"你确定这是我们要的效果吗"通常意味着你跳过了保真度验证,别用已通过的技术指标回答**:本轮被问到时,手上有 title 长度、对比度 19 节点全过、导出裁剪正确、密度 1.24% 等一整套绿灯,但没有一条回答"像不像原标"。正确反应是承认没验过、把参考图拉出来并排比对,而不是复述那些无关的绿灯。**技术验收与设计保真是两个正交维度**,工具站尤其容易只做前者——而对"仿制某个知名视觉"的页面来说,保真度直接决定跳出率,也就直接决定能不能挤掉 SERP 里的脆弱占位者。
- **[2026-07-31] "这个页面没解决用户需求"要用 SERP 前三的 UI 去证伪,不能靠直觉**:站长怀疑 font 页无用,实际核验是打开排在前面的竞品逐个看形态——fontmeme(#1 DR74)与 fontbolt(#2 DR38)都是同一套:①正文点名具体字体("Better Call 用 Script1 Script Casual,Saul 用接近 Dancing Script 的笔刷体");②文字转图生成器(选字体/字号/效果/颜色 → GENERATE);③fontbolt 额外给**字体文件下载**按钮。对照后本站页面①②俱全且用实时画布(优于其提交式表单),唯一缺口是③。**结论翻转**:UI 与市场对齐,0 流量的原因是未索引。规矩:判定"页面是否匹配意图"的最短路径是打开 SERP 前 3-5 名读它们的可见结构(get_page_text 即可,不必截图),把"它们提供什么"列成清单再和自家页面逐条对——比读自家代码或凭产品直觉可靠得多。
- **[2026-07-31] 决定删页前必须查页面级 GSC,而不是只看查询级**:查询表显示 `better call saul font generator` 32 点击,很容易据此认为 font 页在工作;但页面表(三个月全量仅 **10 行**)显示**全部 5 个工具子页 0 曝光**,那些点击全部落在首页。两张表回答的是不同问题:查询表=需求存不存在,页面表=哪个 URL 在承接。**删页决策只能由页面表 + 需求侧共同裁决**:需求为零才删(title card:0 点击/33 曝光 → 删),需求真实但页面无流量说明是收录问题而非页面问题(font:1550 月搜、我方已排 #9 → 保留)。附带:页面表只列有≥1 曝光的 URL,所以"共 N 行"就是全量,不必再翻页。
- **[2026-07-31] 删整块功能要连同它专属的性能门控一起摘掉**:删 /title-card/ 时容易只删路由、组件、数据和资产,但 BaseLayout 里还有一个 `loadAmiriFont` 开关是**专为该页的阿语画布**加的,页面没了它就成了永远为 false 的死代码和一段误导性注释。同类残留还有:sectionImages 条目、构建断言的 section、sitemap 图片注入表、其余组件页脚的互链、以及各 data 文件里的 `navTitleCard` 键和 7 个语种的 `titlecard.*` 翻译。清理顺序:先 grep 功能名找全引用点,再按"路由→组件→数据→资产→布局门控→构建脚本→互链→翻译键→301"逐层删,最后用 `grep -r` 复查残留只剩正文描述。
- **[2026-07-31] 语言切换器按前缀替换生成 URL,在"部分语种才有"的页面上会谎报语言**:多语言站的切换器普遍写成 `currentPath.replace('/'+from+'/', '/'+to+'/')`;当该 section 只建了部分语种时,它会产出一个从未构建的 URL,访客点"Türkçe"却被 301 回英文——**标签说的语言和落地语言不一致,这比多一跳严重得多**。正确回退是**该语种的首页**(最近的真实祖先),不是英文同名页:丢掉 section 好过谎报语言。判据:凡是站内存在"非全语种 section",切换器就必须知道每个 section 建了哪些语种。附带发现路径——这个 bug 是在核验另一件事(导航链接)时用 `grep -ro` 扫全 dist 才浮出来的,按语种分目录扫会漏掉它(它出现在**别的语种**的页面上),所以链接审计要既扫"每个 locale 目录内",也扫"全站"并比对差额。
- **[2026-07-31] 同一个事实被复制到 N 处时,把它收敛成模块 + 让无法 import 的脚本回读源文件做断言**:"font 页只建了 en/ar/es"这条曾同时存在于 4 个文件,而构建脚本是 .mjs、无法 import .ts。可行解:事实放 TS 模块,脚本保留自己的副本,再由其中一个脚本**正则回读 TS 源文件**逐项比对,不一致就 exit 1。关键是负向测试要覆盖"其它守卫察觉不到"的场景——本轮 flatten-sitemap 自带的计数守卫在"去掉一个 locale"时仍然自洽(10/10 通过),只有新加的交叉断言能发现,不专门构造这个用例就会误以为已经守住了。
- **[2026-07-31] Suggest 的空结果是裁决级证据,能直接证伪"竞品有 X 所以我们缺 X"**:看到 fontbolt(SERP #2)给每款字体配 Download 按钮,顺手推断本站 font 页"缺字体文件下载"。实测 `better call saul font download` 与 `... font free` **双双返回空**——这个意图根本不存在,fontbolt 的下载按钮是它自己的产品选择,不是需求证据。真实词形是 `font name`(它叫什么)/`font dafont`/`font canva`(去哪儿拿)/`copy and paste`(怎么用)。规矩:**竞品做什么 ≠ 用户搜什么**;把"我们缺某功能"写进计划前,先用该功能对应的词形跑一次 Suggest,空结果就撤销这条。反过来,空结果还能变成内容:实测 DaFont 搜该剧 **0 结果**,于是页面直接写"它不在 DaFont,用这个代替"——这恰好回答了一个有人搜、却没人回答的问题。
- **[2026-07-31] 多会话共享 checkout 时 `git add -A` 会卷走别人的文件,我自己也中招了**:上午刚记录另一会话因 `git add <file>` 把我的半成品推上 main 弄坏生产,下午我用 `git add -A` 提交时把仓库根目录 4 个不属于我的 PNG 一起提交了。规矩:①共享 checkout 里**永远 `git commit` 前先 `git status --short` 逐行确认**,尤其看 `??` 未跟踪项;②只 add 自己确知的路径,`-A` 只在独占 worktree 里用;③已经提交了就 `git rm --cached <files> && git commit --amend`,让它们回到未跟踪状态,而不是删掉别人的文件。真正的解法是 `git worktree` 分开,同一目录并行改同一个仓库无法用 git 隔离作者。
- **[2026-07-31] 头词想"看见"某样东西时,链接表不是答案——把东西渲染出来**:`better call saul font`(1550/月)的搜索者想看清字体长什么样,而不是拿到一串字体名。我先做了一张"去哪儿拿"的名称+链接表,站长一看就说"这应该是字体展示"。升级为真实样张(完整大写/小写/数字标点,用真字体现场渲染)后才对位——SERP 前排(fontmeme/fontbolt/dafontfree)无一例外都在页面上把字形摆出来。判据:头词的动词是"看/是什么"(font / logo / what does X look like)时,页面必须**呈现实物**;动词是"做/生成"时才轮到工具。附带便宜:如果这些字体已经因为别的功能被加载,渲染样张是零额外字节。
- **[2026-07-31] 许可证、作者、字重这类可核查事实必须读权威源,"大多数都是 X"会咬人**:五款 Google Fonts 里四款是 OFL,唯独 Satisfy 是 **Apache-2.0**——凭"Google Fonts 基本都是 OFL"的印象写就会错一条,而许可证写错是要担责任的那类错。可核查路径:`fonts.google.com/metadata/fonts` 拿设计者/字重(注意响应带 XSSI 前缀要先剥),许可证读 `raw.githubusercontent.com/google/fonts/main/{ofl|apache|ufl}/{family}/METADATA.pb` 的 `license:` 字段(目录名本身就是许可证类型,OFL.txt 取不到就换 apache 目录)。规矩:凡是要写进页面的第三方事实(许可证、作者、版本、价格),都要留下"从哪个 URL 读到的"这条证据链。
- **[2026-08-01] 竞品页面的标题会撒谎,判断"这个词要什么"必须看 DOM 而不是看 title**:`better call saul font` 的 SERP #2 是 fontbolt,页面标题写着 "Better Call Saul Font **Generator**",据此很容易以为这个词要生成器。实际打开一看:`canvas: 0`、`form: 0`,那个 "Generate" 链接只是 `#fgen` 页内锚点,真正的交付是两条 `.ttf` 直链和几张样张图。**标题里的词是给搜索引擎看的,页面里的元素才是给用户的**。规矩:核验意图时抓 `document.querySelectorAll('canvas'/'form').length` 和所有 `<a>` 的 href,把"它到底给了什么"列出来,再和自家页面对比;只读标题和 H2 会得出相反结论。
- **[2026-08-01] 删掉一个功能后,必须把所有描述它的文案一起清算,否则页面会开始说谎**:font 页移除 PNG 生成器后,残留 20+ 条失实文案:title/H1 还叫 "Generator"、meta description 还承诺 "download a free PNG"、chips 还写 "HD Export"、而最严重的一条 FAQ 直接**说反了**——"本工具生成 PNG 图片,而不是可安装的字体文件",与新页面恰好相反。这些在 SERP 上就是失实承诺,直接毁 CTR 和信任。规矩:功能删除的清单不止代码,要按 title→h1→meta(description/og/twitter)→chips→how→uses→faq→cross-sell 逐层过一遍,**且要跨全部语种**(本轮 en 改完后 es/ar 仍各残留 4-5 条)。手工字符串匹配容易漏,可靠做法是用 tsx 加载数据模块、正则扫出命中项、导出精确值再按精确值替换。
- **[2026-08-01] `npm test` 只看汇总行会漏掉失败,"102 tests" 不等于 102 通过**:本轮 grep 出 `# tests 102` 就提交推送,实际是 `# pass 101 / # fail 1`——一次大范围替换把付费弹窗里的 Stripe/Apple Pay/Google Pay 信任标识整块吞掉了,而那是付费弹窗上最不该缺的东西。规矩:测试结果的判据只有 `# fail 0`,提交前必须显式 grep 这一行;`# tests N` 是总数不是通过数。同类教训:大段 `s[i:j]` 替换要先确认区间的**结束锚点**是不是自己以为的那个——本轮 `\n  </div>` 匹配到了比预期更远的位置。
- **[2026-08-01] 同一条 CSS 规则被 style.css 与 mobile.css 各写一份时,改了桌面那份等于没改**:`.section-content` 的展开动画在两个文件里各有完整定义,我删掉 style.css 里的就宣布"动画已移除",而移动端生效的是 mobile.css 那份——bug 所在的环境原封未动。**更糟的是验证也通过了**:预览面板节流帧调度,根本不跑动画,所以修与不修测出来一样。规矩:①改任何视觉规则先 `grep -n "<属性>" public/assets/css/*.css src/**/*.astro` 确认有几份定义;②验收断言要落在**构建产物**上(`grep -c "transition:max-height" dist/**/*.html` 应为 0),而不是落在"页面表现看起来对"——表现可能因为环境不跑动画而恰好正确。
- **[2026-08-01] 依赖帧调度的 API(rAF / `behavior:'smooth'`)在受限环境里会静默什么都不做,别用它们承载功能逻辑**:为修跳转定位,我先用 `requestAnimationFrame` 延后测量,结果整个跳转彻底失效——预览面板节流 rAF,回调从不执行,连 body 上的临时 class 都留在原地没被清掉。同一环境里 `scrollTo({behavior:'smooth'})` 也完全无效而 `behavior:'auto'` 正常。规矩:①需要"布局稳定后再测量"时,用 `void el.offsetHeight` 强制同步回流,不要 rAF;②"跳到某处"这类控件用瞬时滚动,平滑滚动只是效果,却会把功能置于帧调度的摆布之下;③排查"点了没反应"时,先验证依赖的是不是帧驱动 API——判据是同一个操作换成同步/瞬时版本是否立刻正常。
- **[2026-08-02] 判断字体是否真的生效,不能拿通用族(serif/cursive/sans-serif)当基准**:为验证 canvas 里 5 款字体都已加载,我测量每款渲染的文本宽度,与 `serif`/`cursive`/`sans-serif` 三个通用族的宽度比对,全部不同 → 判定"都生效了"。实际 Kalam 是回退的——**缺失字体回退到的是某个具体字体,不是你拿来比对的那个通用族**,所以宽度自然对不上,测量给出了假阳性。可靠做法只有一条:绘制前 `await Promise.all(families.map(f => document.fonts.load(size + ' ' + f)))`,拿加载本身作保证,而不是事后猜。教训的通用形式:**当"证明 X 成立"的方法本身有假阳性,那个证明比没有证明更危险**,因为它会让你停止怀疑。
- **[2026-08-02] alt="" 是无障碍的正解,却是图片 SEO 的零信号,两者要按图片角色分开裁决**:全站 501 个 `<img>` 无一缺 alt,但有 9 个来源是 `alt=""`。拆开看是两类:①导航里 34×20 的缩略图,紧挨同名文字标签——`alt=""` 正确,补描述反而让屏幕阅读器读两遍,且这尺寸 Google 图片不会收录;②底部推荐条 1200×675 的真实产品图——那是**内容不是装饰**,空 alt 等于白扔图片搜索信号。规矩:按"这张图是否携带文字之外的信息"裁决,而不是按"旁边有没有文字"。审计脚本要按 **(src, alt) 组合**统计而非按 src——同一文件在不同位置常常一处有描述、一处为空,只按 src 记会漏掉后者(本轮初版审计就漏了)。
- **[2026-08-02] 下线一个价格档时,断言「当前价格必须出现」的守卫会反过来咬你,而且它同时是最好的清扫工具**:删掉 2 美元 档后 build 立刻红,报的是「dist/*/index.html 缺少当前价格 token 2 美元」——守卫忠实执行的是上一版的定价模型。正确动作不是放宽,是**把退役价格从「必须出现」挪进「禁止出现」清单**,于是同一条规则接着帮你抓残留:它当场揪出 `functions/api/checkout.js` 和组件注释里我自己刚写下的 `2 美元` 字样。做完必须负向测试(往受检文件追加一行 `// 2 美元`,确认 exit 1),否则你只是把断言删了而不自知。配套:把所有会展示价格的文件都列进受检清单(本轮补了 LogoMaker/BreakingBadLogo,它们的 `2 美元` 徽章原本无人看守)。
- **[2026-08-02] 停售 = UI 移除 + 服务端拒绝,只做前者等于还在卖**:把套餐从弹窗里删掉之后,`/api/checkout` 仍然接受 `pack=single`——而浏览器缓存里存着发布前的 HTML,那个按钮还在,还能付款。正解是服务端对退役档返 **410 pack_retired**(不是 400:400 说「你写错了」,410 说「这东西曾经存在,现在没了」),同时**保留所有兑现路径**(verify/consume/webhook/对账仍认旧 product id),这样已购用户的余额一分不少。判据一句话:停售改的是**创建**,不是**兑现**。
- **[2026-08-02] `backdrop-filter` 的 header 会俘获它内部的所有 `position: fixed` 弹层**:把会员弹窗顺手放进 SiteHeader,全屏遮罩就被定位到 54px 高的 header 上而不是视口——filter / backdrop-filter / transform 任一非 none 都会让该元素成为 fixed 后代的包含块。这类 bug 在预览面板里很难看出来(面板常把 innerWidth 报成 0,一切宽度都失真),可靠判据是**沿弹层祖先链检查这三个属性**:`while(n){const cs=getComputedStyle(n); if(cs.backdropFilter!=='none'||cs.filter!=='none'||cs.transform!=='none') ...}`,命中即必须把弹层移到 body 末尾。触发器按钮留在 header、弹层挂 body、两者靠全局函数联系,是这类「头部入口 + 全屏弹窗」的标准拆法。
- **[2026-08-02] 预览面板报 `innerWidth: 0` 时,先量一个已上线的同类元素再下结论**:新弹窗测出 50px 宽,像是 CSS 写错了;但把线上已跑了几个月的定价弹窗放到同一环境里量,同样是 50px —— 是面板的 0 宽视口,不是我的样式。**判据是找一个「已知正确」的对照物**,而不是去改代码试。同一环境还会让 `max-width: 640px` 之类的媒体查询恒真,所以「响应式隐藏的元素测不到」也别当成 bug。
- **[2026-08-02] `dir="ltr"` 只对「真的是拉丁内容」成立,套在本地化日期上会把数字甩到句尾**:阿语页的续费日期 `toLocaleDateString('ar')` 得到「26 يوليو 2026」,外面裹了 `dir="ltr"` 之后渲染成「يوليو 2026 26」——日子跑到最后。已有的经验条「RTL 页里固定英文内容要设 ltr」不适用于**随语言变化的字符串**,那种应该用 `dir="auto"`(首个强方向字符决定)。同一屏还暴露第二条:绝对定位的关闭按钮用 `inset-inline-end` 在两个方向都贴「行首侧」,所以标题必须配 `padding-inline-end` 让位,否则 LTR 下标题短看不出来、RTL 下直接撞上。
- **[2026-08-02] 幂等键按设备/用户聚合时,请求体里就不能带调用方特有的参数——一条测试断言替我拦下了这个「改进」**:订阅 Checkout 的 idempotency key 是 `bcs-monthly-{deviceId}-{generation}`,我看到 success_url 硬编码成 `/en/` 觉得是 bug(买家从 logo 页走会被丢回首页),改成用调用方的 returnPath。跑测试才发现有一条「两个并发请求的 body 必须逐字节相同」的断言——同键不同参 Stripe 会直接拒第二个。**硬编码的返回地址是幂等性的必然结果,不是疏忽**;真正的回跳由客户端自己存 returnPath 再走回去。教训的通用形式:看到一处「明显该参数化却写死了」的值,先搜它是否参与某个跨请求相等性契约,再动手。
- **[2026-08-02] 埋点参数要做双层白名单(参数名 + 值形),否则总有一天会把访客输入送进 GA4**:只按名字过滤,一个未来的调用方写 `template_id: cardName` 就会把用户填的姓名/电话发出去。加一条 `^[a-z0-9_-]{1,32}$` 的值形校验,凡是带空格、标点或超长的一律**丢弃而不是截断**(截断会留下半个真名)。配套两点:①委托监听器(`[data-bcs-event]` + `data-bcs-*`)让埋点写在 markup 上、不用给每个按钮塞内联脚本,新增一个转化点只加两个属性;②注册监听前先 `typeof window.addEventListener === "function"` 特性检测——埋点脚本被 vm/无 DOM 环境加载时不该抛异常,分析失败必须是静默的。
- **[2026-08-02] 「工具页 0 转化」在没有前置埋点时是无法诊断的**:原有 10 个事件全部在「用户已经点了要 HD 文件」之后,数据上「没人用这个工具」和「很多人用得很开心但都要免费版」长得一模一样。最低成本的补法是一个 `tool_engaged`(首次 pointerdown/keydown/touchstart,`once`+`passive`,每页最多一次)+ 每个事件都带 `surface`(哪个工具),这样一张 GA4 报表就能横向比较同一步骤在不同工具上的流失,而不需要为每个页面单独建事件名。
- **[2026-08-02] 把「分发」挂在一个不可能成功的 CI job 之后 = 静默不发布,而且没有任何红灯**:某桌面应用项目的 `deploy-web.yml`(部署 Cloudflare Pages = 用户真正轮询的域名)用 `workflow_run` 监听 "Build macOS Release" **成功**才触发,而那个 workflow 因为仓库没有 Developer ID 签名 secrets **必然失败**(实证:`build-macos: failure` / `publish-public: skipped`)。后果不是"发版失败",是**发版看起来完全成功**——GitHub Release 有、资产齐、tag 在,只有线上 appcast 还停在上一版,所有已安装用户收不到更新且不会有人报错。判据:任何"发布/分发"的最后一跳,若其触发条件是**另一个 job 的成功**,就要问"那个 job 在当前凭据下能成功吗";不能就**删掉耦合**,由发布脚本显式 dispatch + 验证。同源反模式还有一个变体:`deploy-web` 在 `CLOUDFLARE_API_TOKEN` 缺失时**跳过但仍然绿**——所以"run 成功"永远不能作为发布到达的证据。
- **[2026-08-02] 凭据只在某台机器上时,CI 发布路径要显式删掉而不是留着红**:签名证书和 Sparkle 私钥只在维护者钥匙串里,`release.yml` 却还监听 `v*` tag,于是每次发版都留一个红 run。留着的代价不只是噪音:①它让后人以为"修修 CI 就能自动发版",把真实路径(本地脚本)当应急预案;②红 run 会拖垮任何 `workflow_run` 下游(见上条)。正解=删触发器 + 在 workflow 头部写明"发布在哪、为什么不在这",并把"要恢复 CI 发版需要补哪 8 个 secrets"一并写进去,让选择是显式的。删完要复核**全部** workflow 的触发器(本轮 `python3 -c "yaml.safe_load"` 逐个打印),确认没有第二个文件还在监听 tag。
- **[2026-08-02] 「发布是否到达用户」的唯一判据是终端交付面的内容,不是任何中间态**:Release 页面、CI run 状态、dist 仓 commit、部署 API 返回 200,全都可以在用户拿不到新版的情况下齐刷刷地绿。可接受的证据只有一条:**直接读用户端会读的那个 URL,并断言它的内容里含本次的版本/构建号**(`curl appcast.xml | grep <build>`),外加下载一次真实资产核对字节数与声明一致。把这条写进发布脚本(轮询 20×15s,超时即红),比写进文档可靠——文档会被跳过,脚本不会。
- **[2026-08-02] 发布脚本的价值一半在预检,把"发版需要什么"变成可执行断言**:某桌面应用项目的 `release-local.sh` 在动手前逐条验:工作区干净、在 master 且与 origin 同步、CHANGELOG 有本版段落、钥匙串里有签名证书与 Sparkle 私钥、`gh` 已登录、`generate_appcast` 存在——每条缺失都在**构建前**报出对应的人话。对照组是把这些写在 skill 文档里的时代:同一套步骤靠人照着抄,漏掉最后一步就是一次静默事故。判据:凡是"文档里写了 N 步、少做一步会静默出错"的流程,都应该压成一个带预检和终态验证的脚本,文档退化为"跑这条命令"。

- **[2026-08-02] 第三方工具报"title 过长"量的是最终 `<title>`,含品牌后缀,不是数据层里那个标题**:在数据层把标题压到阈值以下,渲染时拼上 ` | 品牌名` 又超了,于是同一条告警反复出现、每轮都以为已经修好。核查脚本必须量**渲染后的完整 title**,并把后缀长度算进预算再倒推数据层的上限。
- **[2026-08-02] 外部工具判定"你这站不是 SSR"时,先量 `<h1>` 在 HTML 里的字节偏移,别急着改渲染架构**:抓取工具通常只读前若干 KB,内联 CSS 与大型导航会把正文推到很靠后的位置,于是它读到了 title 却看不到 body。**判据很锋利:它引用了你的 title 和 description(说明前几 KB 读到了)却同时说正文为空,这就是截断而不是 CSR**——真 CSR 的话它连 title 都拿不到。修法是把内联样式外链、把巨型菜单挪后,让 `<h1>` 尽早出现,而不是去动 SSR。
- **[2026-08-02] 线条类图形在 16–26px 会糊成噪点,小尺寸必须单独出加粗变体**:同一份矢量在大尺寸精致、在图标尺寸变成一团灰。等比缩放解决不了——笔画宽度需要按尺寸重新设计。凡是同一图形要跨"展示尺寸"和"图标尺寸"使用,就按两个资产做,并在构建断言里绑定各自的使用位置。
- **[2026-08-02] GA4 的自定义维度不追溯**:注册之前发生的事件,那个参数永远查不到,补注册也救不回历史数据。所以埋点顺序是**先在后台注册维度,再上线发送该参数**;上线后才发现漏注册,只能认下这段数据缺口,不要浪费时间找"怎么回填"。
- **[2026-08-21] 影视/热点 IP 的周边资产站是脉冲生意，半衰期约一个季度，等你能排上来时窗口已经关了**：Google Trends 五年对照，一部大制作的「XX 壁纸」类词在上映月见顶，次月腰斩，**第三个月归零且此后长期为 0**（一部近 10 亿美元票房的片子就是这条曲线）；一部续作稍好，留下约 8% 的残值；一部公认经典在上映十年后基本没有量。而新站拿排名要几个月，且这类词的坑位在预告片阶段就被 DR 54–91 的老牌资源站占满。**判据：只有「几天内能上线」和「已有域名权重」两个条件同时成立才值得碰，缺一即否决。** 另注意词面污染——热门 IP 名往往同时是车型、消费品或老经典的名字，上映前的基线量不是电影意图，不能算进收益。

- **[2026-08-22] Google 官方否定 llms.txt**：Google Search 不使用 `llms.txt` 文件，不需要为 AI 创建任何特殊文件。它不会影响可见性或排名（2026-06-15 文档更新明确注明）。之前在 robots.txt 里放 `LLMs-Txt:` 非标准指令导致 Lighthouse 审计 0 分的坑（见本库已有条目）现在有了官方盖棺定论：根本不需要。
- **[2026-08-22] FAQ Rich Results 已下架，schema 转为 LLM 引用资产**：Google 2026-05-07 起不再展示 FAQ 富结果，06 月从 GSC 工具移除，08 月从 API 移除。但 FAQPage schema 仍有效——实测 80-150 词答案在 ChatGPT/Perplexity 中被引用率显著高于 30 词短答案。不删已有 FAQ schema，但不再为 Google 富结果而新增。
- **[2026-08-22] Back Button Hijacking 是新 spam 类型，06-15 起执行**：劫持浏览器后退按钮现在是明确的 spam 违规（Google Search Central Blog 2026-04 公告），可触发人工处罚。站主对第三方脚本注入的劫持代码同样负责。技术审计必须加：从搜索结果进入 → 点后退 → 必须回到搜索结果。审计所有第三方脚本的 `history.pushState` 行为。
- **[2026-08-22] Preferred Sources 是品牌忠诚度的 SEO 信号化**：用户标记为 Preferred 的站点 CTR 翻倍（Google 官方数据），04-30 全球推出，05-27 扩展至 AI Overviews 和 AI Mode。已有 34.5 万被标记来源。经营自有受众（订阅、注册用户、回头客）现在直接影响搜索可见性，不再只是产品运营。08-20 更新增加了自定义引导按钮。
- **[2026-08-22] Google 官方定论：AEO/GEO 就是 SEO**：2026-05-15 发布的 AI 优化指南明确否定"AI 搜索优化是独立学科"的说法。不需要为 AI 改写内容、不需要切块、不需要刷品牌提及、结构化数据不是 AI 引用前提。唯一的差异化要求是「非大众化内容」——AI 自己能生成的摘要没有引用价值，只有一手评测/原创数据/亲历经验才会被引用。
- **[2026-08-22] Discover 已有独立算法，Topic Authority 是新信号**：February 2026 Discover Core Update 是 Google 首次为 Discover 发布独立核心更新。Discover 排名不再是搜索算法的副产品。三个新信号：Topic Authority（持续发布 > 追热点）、反 Clickbait（标题必须兑现）、本地相关性。图片要求 1200px+ 宽度 + `max-image-preview:large`（实测 CTR 高 45%）。工具站受影响较小，内容站必须独立规划 Discover。
- **[2026-08-22] AI 引用比有机排名第一更值钱**：被 AI 引用的品牌获得的有机点击比未引用竞品高 35%（Digital Applied 2026-03）；AI 功能出现的查询中 Position 1 CTR 从 27% 降至 11%（SISTRIX 2026-03）；零点击搜索达 58.5%（SparkToro/Datos）。传统排名仍有价值但不再是唯一目标。每轮 SEO 规划必须同时回答「能排进前十吗」和「AI 会引用我吗」。
- **[2026-08-22] Search Console 新增 Generative AI 效果报告**：2026-06-03 上线（按子集推出）。包含 AI 功能中的曝光次数、页面、国家、设备、日期。暂无点击/CTR/查询词。另有 opt-out 开关可阻止内容出现在 AI 功能中且不影响传统有机排名。监控清单必须加入 AI 曝光基线。
- **[2026-08-22] Information Gain 成为 March 2026 Core Update 的观察焦点**：Google 重新加权 Information Gain——衡量一篇内容相对于已排名内容增加了多少真正新知识。工具站的内容页不能只是同类页面的改写，必须有独特切角。「原创数据」「一手测评」「独特方法论」是 Information Gain 的三大来源。

## 六、经验沉淀协议

1. **何时写项目日志**:每轮工作都把项目事实、指标、验证和下一步写回 `.rankup/`。只有出现跨项目可复用且经过验证的新判断、通道变化或被证伪的旧规则，才更新本【经验库】。
2. **什么不写**:未验证的猜测、一次性细节(具体某次的数字进 memory 不进 skill)、与现有条目重复的(改为更新旧条目日期与内容)。
3. **怎么写**:一条一行,`[日期] 结论:证据`。通道变化直接改【数据通道地图】对应行。条目超过 ~25 条时合并同类、删除过时。
4. **双层分流**:通用规则(剥离站点细节后对任意站点成立)→ 本文件【经验库】;项目专属(基线数据、词库、裁决、站点结构)→ 项目 `.rankup/` 对应文件并同步 INDEX.md;敏感信息(token/密钥)→ 只进服务商或 CI 的 Secret 系统，两层都不放真实值。
5. 更新后不用请示 —— 这是本 skill 的设计意图,改完在回复里提一句"rankup 已沉淀 N 条新经验"即可。
- **[2026-08-17] LCP 会被"后出现的更大元素"不断刷新,所以把元素推迟到 hydration 之后可能正是它变成 LCP 元素的原因**:一个刻意不进预渲染 HTML、hydration 后才挂上的同意条/提示条,若在首屏里比任何一块正文都大,就会把 LCP 往后拖整整一个"渲染延迟"(实测:纯文本元素 `Element render delay` 702ms,LCP 比 FCP 晚 900ms)。**"晚出现所以测不到"对 FCP 成立,对 LCP 恰好相反。** 修法不是塞回预渲染 HTML(对已选过的回访用户会先闪一下再被 hydration 摘掉,既有闪烁又有 CLS),而是利用 LCP 的定义:**浏览器在首次交互(点击/按键/滚动)时停止上报新的 LCP 候选**,因此挂在首次交互之后的元素在定义上永不可能是候选,实验室与真实用户一致。实测 perf 97→99、LCP 2033→1573ms、LCP−FCP 900→150ms。⚠️ **不要给它加"N 秒后兜底显示"的定时器**——定时器若先于交互触发,问题原样回来,且只在慢设备上偶发,人工 review 抓不住,必须用断言守。
- **[2026-08-17] 用"首次交互后再显示"换 LCP 时,必须同时验 CLS,并核 SEO 合规**:CLS 与 LCP 的封板规则不同——**CLS 统计整个页面生命周期,不在首次交互时封板**,所以躲过 LCP 的元素躲不过 CLS,很容易把一个指标的收益换成另一个指标的损失。验法是真的触发一次交互并读 `layout-shift` 条目,不能只读 CSS 猜(`position: fixed` 是必要不充分:同层还可能有 `:has()` 驱动的兄弟元素内边距变化)。SEO 侧逐条核过:不构成 cloaking(闸门是"有没有交互"而不是 user-agent,机器人与真人拿到相同 HTML/JS);可索引内容零变化(该元素改动前后都不在预渲染 HTML 里);CrUX 同样受益故非糊弄指标;搜索引擎对"为满足法律义务出现的插页(如 cookie 告知)"有明确豁免。**遗留约束:爬虫不交互,因此永远看不到该元素——以后不要往里面放任何需要被索引的内容。**
- **[2026-08-17] 性能结论必须在生产量,本地静态 preview 会系统性高估耗时**:本地 preview 服务器通常**不做任何压缩**,而 Lighthouse 的模拟节流按传输字节收费——同一份 HTML 本地 84KB、生产 brotli 后 12.5KB,整站传输 333KB 时光传输就吃掉 1.7s,FCP 被凭空拉高 1 秒量级。据此做出的"性能很差"判断会把人引向错误的优化方向(去拆 JS,而真正的差异只是没压缩)。本地 preview 只适合查**相对回归**,绝对值一律以生产为准。
- **[2026-08-17] 凡"改了却没生效",先怀疑读到的是某层缓存里的旧副本,再怀疑改动本身**:一轮任务里连续两次被缓存层给出假读数——(1) 本地 preview 服务器**在内存里缓存了入口 HTML**,重新构建后仍吐旧的 chunk 哈希,于是"新代码没生效"的结论完全建立在测旧产物上,判据是比对页面引用的哈希文件名与产物目录里的实际文件名,不一致就重起服务;(2) CDN 边缘缓存返回改规则之前的响应头(见 cloudflare-stack.md)。这类假读数的危险在于它**看起来像证据**,会让人去修一个本来正确的东西。
- **[2026-08-17] 懒加载对 LCP 无用的判据是 TBT 与 LCP 元素,不是直觉**:被要求"用 React.lazy 压 LCP"时,先看两个数——若 **TBT 已经是 0**(TBT 占 Lighthouse 性能分 30%,已满分)且 **LCP 元素是预渲染在 HTML 里的文字**(hydration 之前就画完),那么拆 JS 在这两项上都无分可拿,再拆只是搬运。此时真正的瓶颈在别处(本例是一个后挂载的大文本块)。先归因 LCP 元素与它的四段耗时(TTFB / 资源加载延迟 / 资源加载 / 渲染延迟),再决定手段——不先归因就选手段,是性能工作里最常见的空转。
- **[2026-08-23] 多语言站架构参考（Apple 模型）——URL 结构、`<html lang>`、hreflang、语言检测与区域切换的完整规则集**:

  以下规则从 apple.com 的实际实现提取,经核验 sitemap（447+ 区域级 sitemap）、hreflang（137 条 alternate）、URL 结构和前端检测脚本后整理。适用于任何要做多语言/多地区的站。**每条规则都附 Apple 实证 URL,可直接打开验证。**

  **规则 1：URL 结构用子目录,不用子域,不用独立域名。**
  Apple 全球 100+ 市场统一在 `apple.com/{region}/` 下,只有中国大陆因监管要求（ICP 备案）用了独立域名 `apple.com.cn`。子目录的好处：域名权重集中、部署与 CDN 配置简单、hreflang 管理在一个 sitemap 体系内。
  URL 模式六类（按需选用,全部可在 Apple 官网验证）：

  | 模式 | Apple 实证 | 适用 |
  |---|---|---|
  | 根路径（默认语言） | `apple.com/` → 美国英文,无前缀 | 英文或单语言站 |
  | `/{country}/` | `apple.com/jp/`（日本）、`apple.com/de/`（德国）、`apple.com/kr/`（韩国） | 单语言国家 |
  | `/{country}/{lang}/` | `apple.com/hk/en/`（香港英文版,默认中文在 `apple.com/hk/`） | 双语地区的非默认语言 |
  | `/{country+lang}/` | `apple.com/chfr/`（瑞士法语）、`apple.com/chde/`（瑞士德语）、`apple.com/befr/`（比利时法语） | 欧洲多语言国家 |
  | `/{country}-{lang}/` | `apple.com/ae-ar/`（阿联酋阿拉伯语,默认英文在 `apple.com/ae/`）、`apple.com/sa-ar/`（沙特） | 中东双语市场 |
  | 独立域名 | `apple.com.cn`（中国大陆,`apple.com/cn/` 301 过去） | 仅限法规强制（ICP 备案等） |

  另外 Apple 还有**区域枢纽**模式：`apple.com/la/`（拉美西语）、`apple.com/lae/`（拉美英语）——多个小国共享同一套页面,在 hreflang 里用多个国家代码指向同一个 URL。

  **规则 2：`<html lang>` 必须与页面实际语言一致,且必须带地区后缀。**
  Apple 实证（查看各页面源码的 `<html>` 标签）：
  - `apple.com/` → `<html lang="en-US">`
  - `apple.com/jp/` → `<html lang="ja-JP">`
  - `apple.com/tw/` → `<html lang="zh-TW">`
  - `apple.com/hk/` → `<html lang="zh-HK">`
  - `apple.com.cn` → `<html lang="zh-CN">`
  - `apple.com/kr/` → `<html lang="ko-KR">`
  - `apple.com/hk/en/` → `<html lang="en-HK">`

  **不能所有中文页面都写 `zh`**——`zh-CN`、`zh-TW`、`zh-HK` 是三个不同的值,浏览器据此选择不同的字体渲染（宋体 vs 明體）、无障碍工具据此选择朗读语音。Apple 同时在每页设置 `<meta property="og:locale" content="ja_JP">` 和 `<link rel="canonical">`（自引用）,三者必须对齐。在开发环节：
  - 单语言英文站：`<html lang="en">`（或 `en-US`）。
  - 多语言站：每个语言路由渲染时动态设置,`/{lang}/` 路由的 `lang` 值从路由参数派生。
  - **构建后断言**：扫全 dist 的 HTML,断言每个文件的 `<html lang=` 值与其所在目录的 locale 一致,不一致就 exit 1。

  **规则 3：hreflang 必须每页都输出完整的语言替代列表。**
  Apple 实证（在任意页面 `view-source:` 搜索 `hreflang`）：`apple.com/` 和 `apple.com/jp/` 都输出**完全相同的 137 条** `<link rel="alternate" hreflang="xx-XX">`,覆盖所有市场。关键实证：
  - **自引用**：`apple.com/jp/` 的列表包含 `<link rel="alternate" hreflang="ja-JP" href="https://www.apple.com/jp/">`。
  - **跨域引用**：同一列表包含 `<link rel="alternate" hreflang="zh-CN" href="https://www.apple.com.cn/">`——指向不同域名。
  - **区域枢纽多对一**：`hreflang="es-HN"`、`hreflang="es-AR"`、`hreflang="es-SV"` 等十几个拉美国家代码全部指向同一个 `apple.com/la/`。加勒比英语国家同理全指向 `apple.com/lae/`。
  - **Apple 没有用 `x-default`**。Google 建议用,指向默认语言版本供回退——我们自己做的时候加上。
  - **部分语言版才有的子页,hreflang 只列实际存在的语言**（已在本文件 2026-07-18 条目详述）。

  **规则 4：绝对不要根据 IP 自动跳转语言/地区,只做建议。**
  这条是硬性规则,不是建议。Apple 实证（用任意非美国 IP 访问 `apple.com/`）：
  - 页面正常展示美国英文内容,**不跳转**。服务端通过 IP 设一个 `geo` cookie（如 `geo=AU`）,仅用于检测。
  - 客户端加载 locale switcher 脚本（路径 `apple.com/ac/localeswitcher/4/{locale}/scripts/localeswitcher.built.js`）,读 `geo` cookie,与当前页面 locale 对比。
  - 不匹配时在页面顶部 `<aside id="globalmessage-segment">`（全局导航上方）注入一条横幅：「Choose another country or region to shop online and see content specific to your location.」+ 下拉选择器（预选检测到的地区）+ Continue 按钮 + 关闭按钮（×）。
  - 用户关掉后 `localStorage`/`sessionStorage` 记住,当次会话不再弹出。
  - **唯一例外**：`apple.com/cn/` → `apple.com.cn` 的 301,这是 ICP 备案的监管要求,不是语言选择。

  为什么不能自动跳转：搜索引擎爬虫出口 IP 多在美国,自动跳转会导致所有语言版本被当成英文爬;VPN/出差/海外用户被跳到错误语言且找不到切回入口;Google 官方文档明确建议不要用 IP 调整语言。

  Cloudflare Worker 里的参考实现思路：
  ```ts
  // 用 cf.country 检测地区,写入 cookie,不做跳转
  const country = request.cf?.country || 'US'
  // 响应头 Set-Cookie: geo={country}; Path=/; SameSite=Lax
  // 客户端 JS 读 geo cookie → 比对当前路由 locale → 不匹配时注入顶部横幅
  // 横幅关掉后写 localStorage('locale-switcher-dismissed', '1')
  ```

  **规则 5：中文市场必须按「四个独立市场」对待,不是「一种语言两种字体」。**
  Apple 实证（逐个打开对比）：

  | 市场 | Apple URL | hreflang | `<html lang>` | 页面标题 | 导航术语「支持」 |
  |---|---|---|---|---|---|
  | 中国大陆 | `apple.com.cn` | `zh-CN` | `zh-CN` | Apple (中国大陆) - 官方网站 | 技术支持 |
  | 台湾 | `apple.com/tw/` | `zh-TW` | `zh-TW` | Apple (台灣) | 支援服務 |
  | 香港 | `apple.com/hk/` | `zh-HK` | `zh-HK` | Apple (香港) | 支援服務 |
  | 澳门 | `apple.com/mo/` | `zh-MO` | `zh-MO` | Apple (澳門) | — |

  四者使用不同的货币（CNY / NT$ / HK$ / MOP$）、不同的法律声明（大陆有 ICP 备案号）、不同的客服电话（大陆 400-666-8800）。**香港还是双语市场**——`apple.com/hk/` 繁体中文（默认）,`apple.com/hk/en/` 英文,页脚有语言切换。做中文多语言时,**至少要分「简体」和「繁体」两个独立 locale,各自做关键词研究和文案**。

  **规则 6：sitemap 按地区分文件,支持 image/video 子类型。**
  Apple 实证（`apple.com/robots.txt` 列出 5 个 sitemap 入口）：
  - 主内容：`apple.com/autopush/sitemap/sitemap-index.xml` → 447+ 子 sitemap,按地区组织,每地区最多三个：`{region}/sitemap.xml`（页面）、`{region}/sitemap-image.xml`、`{region}/sitemap-video.xml`。
  - 商店：`apple.com/shop/sitemap.xml` → 47 个区域商店 sitemap。
  - 新闻室、零售店、Today at Apple 各一个独立 sitemap 入口。

  小站不需要这么细,但多语言站的 sitemap 至少要：
  - 所有语言版本的 URL 都在 sitemap 里,不能只有默认语言。
  - 用 `<xhtml:link rel="alternate" hreflang="xx">` 在 sitemap 里也声明语言替代关系（与 HTML head 里的 hreflang 双保险）。

  **规则 7：页脚放地区/语言选择器,链接到选择页面。**
  Apple 实证：每页页脚显示当前地区名（`apple.com/jp/` 显示「日本」,`apple.com/` 显示「United States」）,点击进入 `apple.com/choose-country-region/`——按五大洲分组列出约 195 个地区,双语市场同时列两种语言选项（如巴林同时显示 "Bahrain" 和 "البحرين"）。这个页面本身也是一个有 SEO 价值的页面——它内链到所有语言版本的首页。

  **规则 8：robots.txt 对地区爬虫做针对性放行。**
  Apple 实证（`apple.com/robots.txt`）：对 Baiduspider（百度）、HaoSouSpider（好搜）、Sogou（搜狗）单独设规则,限制大部分路径但明确 `Allow: /cn/`。做多语言站时,确认各语言版本对目标市场的主流爬虫没有误拦：
  - Google → Googlebot
  - Bing/Yahoo/DuckDuckGo → Bingbot
  - 韩国 → Yeti（Naver 爬虫）
  - 中国 → Baiduspider、Sogou
  - 俄罗斯 → YandexBot

  **规则 9：全面本地化,不是翻译。**
  Apple 实证（对比 `apple.com/` vs `apple.com/uk/` vs `apple.com/jp/`）：
  - **术语本地化**：UK 用 "colour"（不是 "color"）、"Uni, sorted"（不是 "College, sorted"）。
  - **货币和价格**：各站点显示本地货币（GBP £ / JPY ¥ / CHF）。
  - **金融产品完全不同**：US 有 Apple Card,UK 有 Flexible Finance——不是翻译,是不同的产品。
  - **法律声明**：UK 有 FCA 金融声明,大陆有 ICP 备案,各站隐私政策指向当地司法管辖区。
  - **字体**：日文页面加载 `SF-Pro-JP`,阿拉伯文页面加载专用 RTL 字体。
  - **导航完全翻译**：不只是正文,菜单栏（ストア / Mac / iPad / iPhone / Watch）也是本地语言。

  与本文件 2026-07-17 条目「多语言不是翻译而是本地化」一致。
