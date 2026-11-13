# SEO：经验库（验证过的判断）

> 渐进式加载：本篇是验证过的判断清单，做判断前先查这里有没有现成结论。

> **已被新判据取代的部分（2026-10-03）**：本篇及所链接归档中的历史选词、立项裁决（含 KD 阈值、排序、权重、预算推导、量筛与旧采样裁决线）不再承担现行规则；带日期的事实、数值与原结论保留，其他经验仍按原证据边界阅读。当前顺序与两路裁决只见 [entry.md](playbooks/entry.md)，GT 测量只见 [trends.md](trends.md)，问法链路只见 [seo-geo.md](seo-geo.md)，逐问法 Google 核验只见 [seo-serp.md](seo-serp.md)。

## 五、经验库(验证过的判断,带日期)

> 2026-08 及之后的条目。更早的见 [seo-experiences-2026-07.md](seo-experiences-2026-07.md)。


- **[2026-08-01] 竞品页面的标题会撒谎,判断"这个词要什么"必须看 DOM 而不是看 title**:某主题的字体词在 SERP 前排出现标题带 **Generator** 的页面,据此很容易以为这个词要生成器。实际打开一看:`canvas: 0`、`form: 0`,"Generate" 链接只是页内锚点,真正交付的是字体文件直链和样张图。**标题里的词是给搜索引擎看的,页面里的元素才是给用户的**。核验意图时抓 `document.querySelectorAll('canvas'/'form').length` 和所有 `<a>` 的 href,把"它到底给了什么"列出来,再和自家页面对比;只读标题和 H2 会得出相反结论。
- **[2026-08-01] 删掉一个功能后,必须把所有描述它的文案一起清算,否则页面会开始说谎**:font 页移除 PNG 生成器后,残留 20+ 条失实文案:title/H1 还叫 "Generator"、meta description 还承诺 "download a free PNG"、chips 还写 "HD Export"、而最严重的一条 FAQ 直接**说反了**——"本工具生成 PNG 图片,而不是可安装的字体文件",与新页面恰好相反。这些在 SERP 上就是失实承诺,直接毁 CTR 和信任。规矩:功能删除的清单不止代码,要按 title→h1→meta(description/og/twitter)→chips→how→uses→faq→cross-sell 逐层过一遍,**且要跨全部语种**(本轮 en 改完后 es/ar 仍各残留 4-5 条)。手工字符串匹配容易漏,可靠做法是用 tsx 加载数据模块、正则扫出命中项、导出精确值再按精确值替换。
- **[2026-08-01] `npm test` 只看汇总行会漏掉失败,"102 tests" 不等于 102 通过**:本轮 grep 出 `# tests 102` 就提交推送,实际是 `# pass 101 / # fail 1`——一次大范围替换把付费弹窗里的 Stripe/Apple Pay/Google Pay 信任标识整块吞掉了,而那是付费弹窗上最不该缺的东西。规矩:测试结果的判据只有 `# fail 0`,提交前必须显式 grep 这一行;`# tests N` 是总数不是通过数。同类教训:大段 `s[i:j]` 替换要先确认区间的**结束锚点**是不是自己以为的那个——本轮 `\n  </div>` 匹配到了比预期更远的位置。
- **[2026-08-01] 同一条 CSS 规则被 style.css 与 mobile.css 各写一份时,改了桌面那份等于没改**:`.section-content` 的展开动画在两个文件里各有完整定义,我删掉 style.css 里的就宣布"动画已移除",而移动端生效的是 mobile.css 那份——bug 所在的环境原封未动。**更糟的是验证也通过了**:预览面板节流帧调度,根本不跑动画,所以修与不修测出来一样。规矩:①改任何视觉规则先 `grep -n "<属性>" public/assets/css/*.css src/**/*.astro` 确认有几份定义;②验收断言要落在**构建产物**上(`grep -c "transition:max-height" dist/**/*.html` 应为 0),而不是落在"页面表现看起来对"——表现可能因为环境不跑动画而恰好正确。
- **[2026-08-01] 依赖帧调度的 API(rAF / `behavior:'smooth'`)在受限环境里会静默什么都不做,别用它们承载功能逻辑**:为修跳转定位,我先用 `requestAnimationFrame` 延后测量,结果整个跳转彻底失效——预览面板节流 rAF,回调从不执行,连 body 上的临时 class 都留在原地没被清掉。同一环境里 `scrollTo({behavior:'smooth'})` 也完全无效而 `behavior:'auto'` 正常。规矩:①需要"布局稳定后再测量"时,用 `void el.offsetHeight` 强制同步回流,不要 rAF;②"跳到某处"这类控件用瞬时滚动,平滑滚动只是效果,却会把功能置于帧调度的摆布之下;③排查"点了没反应"时,先验证依赖的是不是帧驱动 API——判据是同一个操作换成同步/瞬时版本是否立刻正常。
- **[2026-08-02] 判断字体是否真的生效,不能拿通用族(serif/cursive/sans-serif)当基准**:为验证 canvas 里 5 款字体都已加载,我测量每款渲染的文本宽度,与 `serif`/`cursive`/`sans-serif` 三个通用族的宽度比对,全部不同 → 判定"都生效了"。实际 Kalam 是回退的——**缺失字体回退到的是某个具体字体,不是你拿来比对的那个通用族**,所以宽度自然对不上,测量给出了假阳性。可靠做法只有一条:绘制前 `await Promise.all(families.map(f => document.fonts.load(size + ' ' + f)))`,拿加载本身作保证,而不是事后猜。教训的通用形式:**当"证明 X 成立"的方法本身有假阳性,那个证明比没有证明更危险**,因为它会让你停止怀疑。
- **[2026-08-02] alt="" 是无障碍的正解,却是图片 SEO 的零信号,两者要按图片角色分开裁决**:全站 501 个 `<img>` 无一缺 alt,但有 9 个来源是 `alt=""`。拆开看是两类:①导航里 34×20 的缩略图,紧挨同名文字标签——`alt=""` 正确,补描述反而让屏幕阅读器读两遍,且这尺寸 Google 图片不会收录;②底部推荐条 1200×675 的真实产品图——那是**内容不是装饰**,空 alt 等于白扔图片搜索信号。规矩:按"这张图是否携带文字之外的信息"裁决,而不是按"旁边有没有文字"。审计脚本要按 **(src, alt) 组合**统计而非按 src——同一文件在不同位置常常一处有描述、一处为空,只按 src 记会漏掉后者(本轮初版审计就漏了)。
- **[2026-08-02] 下线一个价格档时,断言「当前价格必须出现」的守卫会反过来咬你,而且它同时是最好的清扫工具**:退役一个价格档后 build 立刻红,因为守卫仍在要求上一版的价格。正确动作不是放宽,是**把退役价格从「必须出现」挪进「禁止出现」清单**,于是同一条规则接着帮你抓残留。做完必须负向验证(往受检文件追加该退役价格,确认检查失败),否则你只是把断言删了而不自知。配套:所有会展示价格的页面都要列进受检清单。
- **[2026-08-02] 停售 = UI 移除 + 服务端拒绝,只做前者等于还在卖**:把套餐从弹窗里删掉之后,`/api/checkout` 仍然接受 `pack=single`——而浏览器缓存里存着发布前的 HTML,那个按钮还在,还能付款。正解是服务端对退役档返 **410 pack_retired**(不是 400:400 说「你写错了」,410 说「这东西曾经存在,现在没了」),同时**保留所有兑现路径**(verify/consume/webhook/对账仍认旧 product id),这样已购用户的余额一分不少。判据一句话:停售改的是**创建**,不是**兑现**。
- **[2026-08-02] `backdrop-filter` 的 header 会俘获它内部的所有 `position: fixed` 弹层**:把会员弹窗顺手放进页头组件,全屏遮罩就会被定位到页头而不是视口——filter / backdrop-filter / transform 任一非 none 都会让该元素成为 fixed 后代的包含块。这类 bug 在预览面板里很难看出来(面板常把 innerWidth 报成 0,一切宽度都失真),可靠判据是**沿弹层祖先链检查这三个属性**:`while(n){const cs=getComputedStyle(n); if(cs.backdropFilter!=='none'||cs.filter!=='none'||cs.transform!=='none') ...}`,命中即把弹层移到 body 末尾。触发器按钮留在页头、弹层挂 body、两者靠全局函数联系,是这类「头部入口 + 全屏弹窗」的标准拆法。
- **[2026-08-02] 预览面板报 `innerWidth: 0` 时,先量一个已上线的同类元素再下结论**:新弹窗测出 50px 宽,像是 CSS 写错了;但把线上已跑了几个月的定价弹窗放到同一环境里量,同样是 50px —— 是面板的 0 宽视口,不是我的样式。**判据是找一个「已知正确」的对照物**,而不是去改代码试。同一环境还会让 `max-width: 640px` 之类的媒体查询恒真,所以「响应式隐藏的元素测不到」也别当成 bug。
- **[2026-08-02] `dir="ltr"` 只对「真的是拉丁内容」成立,套在本地化日期上会把数字甩到句尾**:阿语页的续费日期 `toLocaleDateString('ar')` 得到「26 يوليو 2026」,外面裹了 `dir="ltr"` 之后渲染成「يوليو 2026 26」——日子跑到最后。已有的经验条「RTL 页里固定英文内容要设 ltr」不适用于**随语言变化的字符串**,那种应该用 `dir="auto"`(首个强方向字符决定)。同一屏还暴露第二条:绝对定位的关闭按钮用 `inset-inline-end` 在两个方向都贴「行首侧」,所以标题必须配 `padding-inline-end` 让位,否则 LTR 下标题短看不出来、RTL 下直接撞上。
- **[2026-08-02] 幂等键按设备/用户聚合时,请求体里就不能带调用方特有的参数——一条测试断言替我拦下了这个「改进」**:订阅 Checkout 的幂等键按用户和代次组成,我看到 success URL 固定跳回默认语言首页觉得是 bug,改成用调用方的 returnPath。跑测试才发现有一条「两个并发请求的 body 必须逐字节相同」的断言——同键不同参 Stripe 会直接拒第二个。**硬编码的返回地址是幂等性的必然结果,不是疏忽**;真正的回跳由客户端自己保存 returnPath 再走回去。看到一处「明显该参数化却写死了」的值,先搜它是否参与某个跨请求相等性契约,再动手。
- **[2026-08-02] 埋点参数要做双层白名单(参数名 + 值形),否则总有一天会把访客输入送进 GA4**:只按名字过滤,一个未来的调用方把用户输入放进标识字段就可能外传。加一条 `^[a-z0-9_-]{1,32}$` 的值形校验,凡是带空格、标点或超长的一律**丢弃而不是截断**(截断会留下半个真名)。配套两点:①用委托监听器(如 `data-event` 与 `data-event-*`)让埋点写在 markup 上,新增一个转化点只加两个属性;②注册监听前先 `typeof window.addEventListener === "function"` 特性检测——埋点脚本被 vm/无 DOM 环境加载时不该抛异常,分析失败必须是静默的。
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

- **[2026-08-22] Google 官方否定 llms.txt**：Google Search 不使用 `llms.txt` 文件，不需要为 AI 创建任何特殊文件。它不会影响可见性或排名（2026-06-15 文档更新明确注明）。之前在 robots.txt 里放 `LLMs-Txt:` 非标准指令导致 Lighthouse 审计 0 分的坑（见本库已有条目）现在有了官方盖棺定论：Google 不需要它。对被 ChatGPT 引用同样没有收益证据（约 30 万域名的检验，见 [seo-ai-search.md](seo-ai-search.md)），成本低，闸门 1、4 仍按 [checklists.md](checklists.md) 要求它存在且与 sitemap 一致。
- **[2026-08-22] FAQ Rich Results 已下架**：Google 2026-05-07 起不再展示 FAQ 富结果，06 月从 GSC 工具移除，08 月从 API 移除。FAQPage 仍是有效的 Schema.org 类型，但不再带来 Google 搜索可见性收益。旧稿写的「schema 转为 LLM 引用资产，实测 80-150 词答案被引用率显著更高」没有出处，已按收录规则降为【猜测】并删去 80-150 词的说法，还有反证（新增 schema 的匹配对照里 ChatGPT 与随机不可分），见 [seo-ai-search.md](seo-ai-search.md)「FAQ Rich Results 下架」。不删已有 FAQ schema，但不再为 Google 富结果而新增。
- **[2026-08-22] Back Button Hijacking 是新 spam 类型，06-15 起执行**：劫持浏览器后退按钮现在是明确的 spam 违规（Google Search Central Blog 2026-04 公告），可触发人工处罚。站主对第三方脚本注入的劫持代码同样负责。技术审计必须加：从搜索结果进入 → 点后退 → 必须回到搜索结果。审计所有第三方脚本的 `history.pushState` 行为。
- **[2026-08-22] Preferred Sources 是品牌忠诚度的 SEO 信号化**：用户标记为 Preferred 的站点 CTR 翻倍（Google 官方数据），04-30 全球推出，05-27 扩展至 AI Overviews 和 AI Mode。已有 34.5 万被标记来源。经营自有受众（订阅、注册用户、回头客）现在直接影响搜索可见性，不再只是产品运营。08-20 更新增加了自定义引导按钮。
- **[2026-08-22] Google 官方定论：AEO/GEO 就是 SEO**：2026-05-15 发布的 AI 优化指南明确否定"AI 搜索优化是独立学科"的说法。（这是 Google AI 功能，即 AI 概览与 AI 模式的口径。ChatGPT 侧靠检索名次与标题匹配，做法见 [seo-geo.md](seo-geo.md) 步骤 5，与这里不矛盾。）不需要为 AI 改写内容、不需要切块、不需要刷品牌提及、结构化数据不是 AI 引用前提。唯一的差异化要求是「非大众化内容」——AI 自己能生成的摘要没有引用价值，只有一手评测/原创数据/亲历经验才会被引用。
- **[2026-08-22] Discover 已有独立算法，Topic Authority 是新信号**：February 2026 Discover Core Update 是 Google 首次为 Discover 发布独立核心更新。Discover 排名不再是搜索算法的副产品。三个新信号：Topic Authority（持续发布 > 追热点）、反 Clickbait（标题必须兑现）、本地相关性。图片要求 1200px+ 宽度 + `max-image-preview:large`（实测 CTR 高 45%）。工具站受影响较小，内容站必须独立规划 Discover。
- **[2026-08-22] AI 引用比有机排名第一更值钱**：被 AI 引用的品牌获得的有机点击比未引用竞品高 35%（Digital Applied 2026-03，【未核实】：找不到方法与样本，只作线索）；AI 功能出现的查询中 Position 1 CTR 从 27% 降至 11%（SISTRIX 2026-03）；零点击搜索达 58.5%（SparkToro/Datos）。传统排名仍有价值但不再是唯一目标。每轮 SEO 规划必须同时回答「能排进前十吗」和「AI 会引用我吗」；后一问在 ChatGPT 侧要重复采样才答得出，手动查一次不算，流程见 [seo-geo.md](seo-geo.md)。
- **[2026-08-22] Search Console 新增 Generative AI 效果报告**：2026-06-03 上线，2026-08-31 起向所有网站推出。包含 AI 功能中的曝光次数、页面、国家、设备、日期。暂无点击/CTR/查询词。另有 opt-out 开关可阻止内容出现在 AI 功能中且不影响传统有机排名。监控清单必须加入 AI 曝光基线。
- **[2026-08-22] Information Gain 成为 March 2026 Core Update 的观察焦点**：Google 重新加权 Information Gain——衡量一篇内容相对于已排名内容增加了多少真正新知识。工具站的内容页不能只是同类页面的改写，必须有独特切角。「原创数据」「一手测评」「独特方法论」是 Information Gain 的三大来源。

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

  与 [seo-workflow.md](seo-workflow.md)「落地映射」中「多语言不是翻译而是本地化」一致。
- **[2026-11-13] SEO 审计三项实测（sitemap 去分页/列表、首页 H1 品类词、首屏大视频压缩与 unused JS）**【实测】：① **sitemap 只放可索引的规范页**：排掉分页和无独立搜索意图的分类列表页后，条目从 261 条压到 81 条（方法已并入 [段 3 D10](lifecycle/stage-3-build.md)）；② **首页 H1 用通用大品类词**：承接整站品类定位，不跟单个内页的具体词抢排名（方法已并入 [段 4 B6](lifecycle/stage-4-prelaunch.md)）；③ **压缩首屏大视频不等于提升移动端 Lighthouse 分**：首屏视频从 13.2MB 压到 2.4MB 后，移动端 Lighthouse 性能分未变，因为真正卡点在 unused JS——压缩大媒体能省真实带宽与起播等待，但跑分卡点要按 TBT / 网络依赖树归因到 JS 减重（方法已并入 [段 3 D5](lifecycle/stage-3-build.md)）。
