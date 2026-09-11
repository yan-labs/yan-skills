# 能力清单：rankup 到底能干什么

**这份文件的用途只有一个**：用户只说了一句模糊的人话（「我想让我的站流量涨一点」
「今天弄下 SEO」「帮我看看这个词能不能做」），你需要在**不猜**的前提下知道
——rankup 有哪些能力、每个能力的入口在哪、判读依据在哪个文件。

它是**全量底账**，不是路由。从人话反查入口请先看 `SKILL.md` 的总路由表（3.0 起 SKILL.md
只放路由与七段的硬规则，不再放任何能力表）；本文件是那张路由表背后的全部能力，用于
「路由表里没有的意图」和「盘点覆盖度」。**§四的数据面板脚本速查与 §十的外链表只存在于这里**，
SKILL.md 段 6 与取数纪律只一行指回本文件，改脚本入口时只改这一处。

三条阅读约定：

1. **入口列写的是真实存在的路径**，相对仓库根。跑之前不用再确认它在不在。
2. **脚本只采集，判读归你。** 三波重构之后，本 Skill 的脚本里没有打分器、没有阈值门、
   没有 verdict；它们产出的是原始数值 + manifest（每源 `{status,count,error}`）+ 失败现场。
   「这个词能不能做」「这站是不是真赚钱」「这项算不算过闸」全部由你对着判读文档下。
3. **采集失败 ≠ 结论为零。** 配额 429、CAPTCHA、卡加载、改版都会产出 0 条。
   看到空结果先读 manifest 与证据目录，再决定是重试还是如实标「未测」。

---

## 一、流程控制与项目记忆（判「现在该做什么」）

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 环节闸门判据 | 12 个环节各一张表：检查项 / 客观通过条件 / 证据落点 / 复查口径 | [`references/checklists.md`](checklists.md) | 「这个环节能不能过」「本轮还差什么」 |
| 生命周期步骤 | 七段（每段开头先对账）每段的输入、必做动作、步骤 check、完成门禁 | [`references/lifecycle.md`](lifecycle.md) | 「到哪一步了」「下一步做什么」 |
| 项目记忆结构 | `.rankup/` 该有哪些文件、各自的时效契约与提升路径 | [`references/project-memory.md`](project-memory.md) | 「给这个项目建个档」「rankup init」 |
| 项目体检（文件层） | 缺失文件、超期记录、脚本体检、**生命周期检查点**（哪些工具还没用过） | `rankup/scripts/review.mjs` | 「rankup review」「这站还差什么没做」 |
| 会话信号挖掘 | 把本项目的 Claude Code / Codex 会话浓缩成人话与结论，供提取经验 | `rankup/scripts/sessions.mjs` | review 第二步；「以前聊过的结论没沉淀」 |
| 跨项目资产登记 | 扫描各项目 `.rankup/` 重建可复用脚本索引 | `rankup/scripts/registry.mjs` | 「别的项目有没有现成的」 |
| 版本检查与自更新 | 比对远端清单、必要时更新本 Skill | `rankup/scripts/check-version.mjs` | 每次激活 |
| Skill 自体门禁 | 项目中立性、凭据泄露、必需引用与内容片段的机械断言 | `rankup/scripts/validate-rankup.mjs` | 改完 Skill 必跑 |
| 规则晋升与淘汰 | 一条经验该留项目侧还是回流 Skill、怎么废弃 | [`references/evolution.md`](evolution.md) | 「这条经验要不要写进 Skill」 |

## 二、需求挖掘与选题（判「做什么方向」）

**开跑的入口是 [`playbooks/research.md`](playbooks/research.md)**——4 条预制流水线
（挖需求 / 这词能不能做 / 扩词 / 竞品反查）+ 1 个分流器，每条给到「哪一步跑什么命令、
哪些能一条消息并行派 agent、配额多少、卡住了怎么办」。本表是**底账**，回答「有没有这个能力」，
不回答「什么时候跑它」。

判读顺序固定：**[`research-checklist.md`](research-checklist.md)（9 节清单逐项打勾，验收单）→
[`demand-sources.md`](demand-sources.md)（源 → 脚本路由表）→
[`experiences/demand-discovery.md`](experiences/demand-discovery.md)（裁定集）**。
先读路由表，不要逐个翻脚本。

`rankup/scripts/demand/` 共 24 个可执行脚本 + 1 个公共库（`_lib.mjs`，不可单独运行），
全部零依赖、统一支持 `--json` / `--out`，失败把 `{url,status,body}` 落证据目录。

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| Stripe 引荐榜 | 谁在往 Stripe 收银台送人 = 谁已经在收钱，含 31 个月历史 | `scripts/demand/stripe-referring.mjs` | 「反查谁在赚钱」 |
| 长尾支付网关反查 | Creem / Lemon Squeezy / Paddle / Gumroad 等网关的引荐站 | `scripts/demand/payment-referrers.mjs` | 「不用 Stripe 的那些人呢」 |
| 收入/流量榜单聚合 | traffic.cv、TrustMRR、AI 工具榜、新品发现站统一取数 | `scripts/demand/boards.mjs` | 「有哪些站在涨」「谁的 MRR 高」 |
| App 付费榜 | Apple 榜单（付费榜 = 已验证的付费意愿），可 `--list-genres` | `scripts/demand/appstore-charts.mjs` | 「用户愿意为什么掏钱」 |
| Google Play 榜单 | 名次 + 涨跌 + 安装估算，分国家分品类 | `scripts/demand/gplay-charts.mjs` | 「安卓侧量在哪」 |
| 广告主反查 | 谁在持续买流量（持续投放 = ROI > 1） | `scripts/demand/ads-transparency.mjs` | 「谁在花钱买这个词」 |
| 差评矿 | 从「掏了钱之后的反馈」里挖没被满足的需求 | `scripts/demand/reviews-mine.mjs` | 「竞品被骂什么」 |
| 外包需求 | 有人在为这件事付外包费 = 需求已被验证 | `scripts/demand/freelance-demand.mjs` | 「有没有人付钱做这个」 |
| 用户原话 | Reddit 许愿句式（"I wish there was…"），可直接当标题用 | `scripts/demand/reddit-wishes.mjs` | 「用户自己怎么说的」 |
| HN 信号 | Show HN 新品、Ask HN 痛点、方向讨论热度 | `scripts/demand/hn-signals.mjs` | 「最近技术圈在聊什么」 |
| GitHub 升温方向 | trending 的「今天/本周新增 star」——唯一公开的增速信号 | `scripts/demand/github-trending.mjs` | 「哪些方向在起来」 |
| 已沉淀的 skill 反查 | 别人写成 SKILL.md / prompt 的需求 = 高频且值得自动化 | `scripts/demand/github-skill-search.mjs` | 「大家都在反复做什么」 |
| Chrome 扩展缺口 | 分类/搜索页的用户数 + 评分 + 评分人数，找供给缺口 | `scripts/demand/chrome-ext-gap.mjs` | 「插件市场有什么空位」 |
| Chrome 扩展趋势 | 一周/一月涨最快、新增、已下架 | `scripts/demand/chrome-stats.mjs` | 「哪个扩展在爆」 |
| 游戏新词 | 新游戏 = 新词 = 发布当天几乎零竞争页面 | `scripts/demand/game-newtitles.mjs` | 「有什么新游戏能做站」 |
| 游戏平台监控 | 批量跑 sitemap-diff，多语种平台新内页汇成候选报告 | `scripts/demand/game-platform-monitor.mjs` | 「每天盯一遍游戏平台」 |
| 竞品 sitemap 增量 | 竞品新布的 URL = 它自己花钱调研出来的结论 | `scripts/demand/sitemap-diff.mjs` | 「竞品最近在押哪些词」 |
| 站群反查 | 给一个域名，找出同一主体运营的其它站 | `scripts/demand/site-network.mjs` | 「他还做了哪些站」 |
| 域名画像 | 注册日期 / 月访问 / 流量结构 / 核心搜索词（只采不判） | `scripts/demand/aitdk-lookup.mjs` | 「这站是新站吗、量哪来的」 |
| 收入站案例复核 | 薄编排：串起 AITDK/Similarweb/Semrush/sitemap/KD，产出各源对照与倍差事实 | `scripts/demand/revenue-site-audit.mjs` | 「帖子说这站月入 X，真的假的」 |
| SERP 取数 | serper.dev 拿 Google 第一页 organic + relatedSearches + PAA | `scripts/demand/serp-query.mjs` | 「这个词首页排的是什么」 |
| 词根扩展 | 给词根并扩成可投喂数据平台的候选串（挖词的起手式） | `scripts/demand/word-roots.mjs` | 「我只有一个词根」 |
| 搜索框下拉联想 | Google / Bing / DuckDuckGo 三引擎的搜索框联想，按语种带 `--hl` / `--gl`；扩树第二层的入口（词根 → 联想词 → 叶子再联想一次即停），只采集、每引擎独立落 manifest，0 条不等于没词 | `scripts/demand/suggest.mjs` | 「帮我扩树」「这个词大家还怎么搜」 |
| CPC 折算 | 把关键词表里的 CPC 变成参与决策的信号（纯计算，不联网） | `scripts/demand/keyword-value.mjs` | 「这批词值多少钱」 |

判读依据集中在 [`demand-sources.md`](demand-sources.md)：**十**（候选验证链路）、
**十·五**（能排上去 ≠ 能赚钱）、**九·六**（自扩词表必漏一半）、**②·六·四**（模型流量何时高估）。

### 没有脚本、但一样是正式来源的手工源

**这些不在上面那张表里，因为它们没有脚本——但它们是清单的正式条目，不是备选。**
只看脚本表会漏掉整整一类信号（真人原话、新品冒头、平台自己泄露的动向）。
取数方式是浏览器或搜索，配方写在 [`demand-sources.md`](demand-sources.md) 对应小节，
验收条目在 [`research-checklist.md`](research-checklist.md)。

| 手工源 | 拿到什么信号 | 配方在 |
|---|---|---|
| AppSumo · AlternativeTo | 买过的人抱怨什么 = 已验证需求 + 执行短板 | §四 谁做了但没做好（差评矿） |
| turbo0.com · Indie Hackers | 正在冒头的新产品与它们的公开数据 | §六 正在冒出来的新产品 |
| HuggingFace Trending · Arena.ai（lmarena.ai） | 模型/应用侧的新词从这里先出现 | §七 持续涌现新词的平台 |
| StackOverflow · V2EX · TikTok / YouTube · X（Twitter）· 行业博客评论 | 用户没被满足时的**原话**（搜索词的来源） | §八 用户的原话 |
| CT 子域名监控 | 平台新开的子域名 = 它自己还没公布的方向 | §九·三 平台子域名监控 |
| Alphabet Soup + keywordtool.io | 搜索框补全的长尾扩展（自扩词表必漏的那一半） | §九·七 |
| 品牌截流词策略 | 竞品品牌词周边的可截流位 | §九·六 之后的小节 |

「用户的原话」那一行**现在有取数工具了**：`/agent-reach` 覆盖 V2EX / X / YouTube / Reddit /
小红书 / B 站等 15 个平台（见 §十四）。rankup 自带的只有 `demand/reddit-wishes.mjs`（Reddit 许愿句式）
和 `demand/hn-signals.mjs`（HN），**中文社媒一个都没有**——做中文市场的需求挖掘时这条通路是必需的。

## 三、选词、趋势与竞争度（判「这个词能不能做」）

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 关键词难度 + top9 盘面 | KD、首页/内页构成、最弱竞争者、链接预算 | `scripts/seo-webcafe.mjs kd` | 「这个词难不难做」 |
| SERP 排名归因 | 某个词的排名盘面归因 | `scripts/seo-webcafe.mjs serp` | 「为什么是他排第一」 |
| 本地零配额计算 | `kgr` / `string`（TDK 长度）/ `money`（收入目标拆解）/ `email`，支持 `--batch`，**只出数值不出评级** | `scripts/seo-webcafe.mjs kgr\|string\|money\|email` | 「算下 KGR」「TDK 超长没」 |
| 需求翻译 / 需求挖掘机 / 起名核域名 | `translateSearch`（字段 `query`）· `mineSearch`（字段 `keyword`）· `domainIntent`→`domainName`→`domainCheck` | `scripts/seo-webcafe.mjs` 对应子命令 | 「帮我想个站名」「这词换成英文怎么搜」 |
| Google Trends | 热度对比、地区分布、相关飙升词、每日热搜；含 1h/4h/1d 短时窗口（小时级曲线，验证刚出现的新词）；2026-09-09 切到新版 Explore UI（`trends.google.com/explore`）路由，零 venv；旧版（`/trends/explore` + pytrends）归档在 `scripts/archive/gt-v1/`，不算独立能力入口 | `scripts/gt.py`（取数层 `scripts/gt-browser.mjs`） | 「XX 和 YY 哪个更火」「今天在搜什么」 |
| 搜索量 / KD / CPC（Semrush） | 分国家量与 KD，**外加全球合计 `globalVolume`**；同国家最多 100 词 `--bulk --db <cc>`（**bulk 下 `globalVolume`/`byCountry` 恒 null**） | `backlink/scripts/semrush-keyword.mjs` | 「这词一个月多少量」 |
| **词根批量扩词（Similarweb）** | 一个种子词扩出整页关键词，四个 tab：`phraseMatch` / `relatedKeywords`（量最大）/ `trending` / `questions`。这是 `demand-discovery.md` 那条「1,309 词根 → 97,681 词」流水线的**入口**（2026-08-28 落地） | `backlink/scripts/similarweb-keywords.mjs` | 「帮我扩词」「我只有一个词根」 |
| **整包扩词 + 聚簇（Semrush）** | Keyword Magic 整包导出 + Topics 聚簇（实测种子 `nonogram` → 20.1K 词 / 201 页）。与上一行互补：那个给广度，这个给簇 | `backlink/scripts/semrush-report.mjs --report keyword-magic` | 「这个主题一共有多少词」「帮我分组」 |
| 判读：做不做 | 词龄、窗口、低 KD ≠ 能做、非英语版本值不值 | [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 一 ~ 二 | 「KD 才 12，能做吗」 |
| 判读：趋势怎么读 | 窗口选择、毛刺与加速度、空曲线 ≠ 没需求 | [`references/trends.md`](trends.md) | 「这曲线是不是在涨」 |

## 四、竞品与数据面板（判「别人是怎么跑起来的」）

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 面板能力目录 | Semrush **9 个工具箱共 102 页 + App Center 16 页**（覆盖率分母只按 102 算，见 `provider-capabilities.json` 的 `note`）、Similarweb 23 个模块的实测测绘 + 「没摸到的地方」 | [`references/provider-capabilities.md`](provider-capabilities.md)，`scripts/rankup-cli.mjs catalog` | 「Semrush 能不能查 X」「该用哪个」 |
| 面板取证与续跑 | `capture`（别名 `run`）抓一个报告；`audit` 按 manifest 逐页保存原图/HTML/DOM/AX/解析/网络结构 + 哈希回执 | `scripts/rankup-cli.mjs capture\|run\|audit` | 「把这些页面全抓一遍」 |
| 脚本覆盖缺口 | 能力 × 脚本覆盖矩阵、Top 10 优先级、10 个已知短板的兜/不兜判决 | [`references/provider-script-gaps.md`](provider-script-gaps.md) | 「要不要给这个报表写脚本」 |
| 站点流量画像 | 总访问量、渠道构成、相似站、地理分布 | `backlink/scripts/similarweb-query.mjs` | 「这站多大、流量哪来的」 |
| 批量流量筛选 | 几百个域名逐个追加写盘，可续跑 | `backlink/scripts/similarweb-batch.mjs` | 「这批域名筛一遍」 |
| 域名自然流量与外链 | AS、自然流量、引荐域数、关键词数（**只有分国家，没有全球合计**） | `backlink/scripts/semrush-overview.mjs` | 「他自然流量多少」 |
| **Semrush 总访问量口径（.Trends）** | 总访问 / 唯一访客 / 页数per访问 / 时长 / 跳出率。**跨面板并排时真正对得上 Similarweb 的是这个数，不是 organic**——2026-08-28 实测 canva.com 两家差 2.4%（`--window` 默认 foreground，全仓唯一例外：这张报表在后台标签页里不水合） | `backlink/scripts/semrush-traffic.mjs` | 「两家流量差三倍，到底信谁」 |
| 面板节点枚举与探测 | 共享账号每个节点是**不同账号**；`list` 只读下拉不消耗配额，`probe` 真启动逐个试 | `backlink/scripts/tools-share-node.mjs list\|probe --tool semrush\|similarweb` | 「配额满了怎么办」「换个节点」 |
| 四张无导出报表 | 自然排名、主要页面、反链概览、关键词报表 | `backlink/scripts/semrush-report.mjs` | 「他排了哪些词」 |
| 建站指纹 | 一次 `curl` + grep 看竞品用什么建站、挂了哪些分析/广告/支付 | [`references/seo-box.md`](seo-box.md) 三 | 「他靠什么赚钱」 |

**两家「流量」口径不同是常态**，对不上先按地理范围 / 面板页面 / 口径定义三步对齐，
见 [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 十六·五「对齐口径要对齐三样东西」。

## 五、建站与基础设施

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 默认建站栈 | TanStack Start Monorepo 脚手架（shadcn 初始化命令唯一）+ Cloudflare-first 资源选型 | [`references/cloudflare-stack.md`](cloudflare-stack.md) + [`references/lifecycle.md`](lifecycle.md) 段 3 | 「新建个站」「搭个工具站」 |
| 设计组件库参考 | 外部 shadcn 生态组件库（21st.dev 等），做页面级设计（Hero / landing page / 动画动效）时先浏览找案例再实现 | [`references/design-references.md`](design-references.md) | 「做个好看的页面」「找设计参考」「Hero 怎么设计」 |
| 脚手架四个坑 | 每一条都实际踩过的初始化陷阱 | [`references/lifecycle.md`](lifecycle.md) 段 3 · 3.1 | 「init 报错了」 |
| 域名接入 Cloudflare | zone onboarding 并读回 NS 对（Wrangler 没有 zone 命令）；`status` 只读、`create` 建 | `scripts/cf-zone-setup.mjs` | 「把域名挂到 CF」 |
| 支付 / 邮件 / 第三方接入 | 接入方式与边界；三方库与现成服务优先 | [`references/integrations.md`](integrations.md) | 「接个 Stripe」「这个功能有没有现成的」 |
| 变现路由 | 意图类型 → 变现方式、Stripe + PayPal 并存规则、广告 / 订阅 / 商店上架判据、监控读数何时回段 1 | [`references/monetization.md`](monetization.md) | 「这站怎么收钱」「接个 PayPal」 |
| 多语言架构 | URL 结构、`<html lang>`、hreflang、繁简分治；**禁止按 IP 自动跳转语言** | [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 三·五 + [`seo-growth.md`](seo-growth.md) | 「要不要上多语言」 |

## 六、上线前闸门、测量与品牌资产

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 上线前闸门九行 | 段 4 的九行硬性判据（0–6 + 4b + 4c） | [`references/checklists.md`](checklists.md) 段 4 | 「能不能上线了」 |
| 全站 SEO 审计 | 全页 TDK/canonical/robots/lang/h1/OGP/结构化数据/alt/hreflang + 关键词密度（1/2/3-gram，日文 `Intl.Segmenter`）；`--sitemap` 全站。**2026-08-30 起只出观察记录 `{code, observed}`，不带分级也不带修复建议**；`--fix-report` 现在只是把原始 `issues` dump 成机器可读格式，分级表在 [`seo-box.md`](seo-box.md)「seo-audit 判读指引」 | `scripts/seo-audit.mjs` | 「TDK 都对吗」「标题写好没」 |
| 性能双读数 | 一屏同时拿实验室（Lighthouse）与现场（CrUX）；闸门 6 要的就是两套 | `scripts/pagespeed.mjs`（走网页版，**零 key 零配额**；`collect` 需标签页可见） | 「站慢不慢」「Core Web Vitals」 |
| 托管方分析 | 开通 Cloudflare Web Analytics 并读回 beacon；应排在 GSC/GA 之前 | `scripts/cf-analytics-setup.mjs` | 「先接个统计」 |
| 行为分析 | 在 Microsoft Clarity 建项目拿 project ID（会话录制 / 热图） | `scripts/clarity-setup.mjs` | 「想看用户怎么点的」 |
| Ahrefs 项目接入 | 建项目、经 GSC 验证所有权、启用 Web Analytics 取回 `data-key` | `scripts/ahrefs-setup.mjs` | 「接下 Ahrefs」 |
| 分析平台判读 | 各平台读数差异与验证方式 | [`references/analytics-platforms.md`](analytics-platforms.md) | 「两个统计对不上」 |
| 接入清单看板 | 已上线站点至少覆盖的平台（域名无关一批 + 域名相关一批）与各自验证方式 | [`references/lifecycle.md`](lifecycle.md) 段 5 接入清单 → 项目 `.rankup/integrations.md` | 「还有哪些没接」 |
| 产品发布平台 | Product Hunt 等发布排期与画廊图上传（**不要点上传按钮**） | [`references/product-launch.md`](product-launch.md) | 「发个 PH」 |

## 七、收录、索引与站长平台

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 索引主动推送 | 把 URL 推给 IndexNow（Bing/Yandex/Seznam/Naver 共用；Google 不参与）；默认从线上 sitemap 取 | `scripts/indexnow-submit.mjs` | 「新页面怎么快点被收」 |
| sitemap 读/提交 | GSC、Bing Webmaster **与 Yandex** 三个平台的 `status` / `submit`，驱动已登录浏览器（脚本白名单就是这三个） | `scripts/webmaster-sitemap.mjs gsc\|bing\|yandex` | 「提交下 sitemap」 |
| 批量移除 URL | GSC「暂时移除网址」批量提交（GSC 没有公开移除 API） | `scripts/gsc-remove-urls.mjs` | 「把废弃页面从谷歌撤下来」 |
| 韩国市场 | Naver Search Advisor 注册、取验证 meta、提交 sitemap（CAPTCHA 需用户点一下） | `scripts/naver-setup.mjs` | 「做韩国市场」 |
| 平台全景 | Bing / GSC / Naver / Yandex / IndexNow 的接入顺序与「挂进发布流程」 | [`references/search-platforms.md`](search-platforms.md) | 「站长工具都要接哪些」 |
| 判读：不收录怎么排查 | 排名起不来、被 K 站、GSC 报索引异常、新站波动 | [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 十七 ~ 十九 | 「一直不收录」 |

## 八、站点体检、性能与第二台爬虫

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 页面体检（第三方） | seo.web.cafe 的页面体检、外链估价、网站估值、域名前世、AdSense 过审预检 | `scripts/seo-webcafe.mjs audit\|backlink\|worth\|history\|adsense` | 「帮我看看这个页面」 |
| 自有站爬虫报告 | 读 Ahrefs Site Audit 已有抓取结果：`projects` 看健康分，`report <id> <报告>` 取**脚本已接的 15 个**分类报告之一（`routes` 列全清单）| `scripts/ahrefs-site-audit.mjs` | 「全站有多少内链失效」 |
| 重定向链 | 裸域/www 几跳、旧 URL 是 301 还是 302（302/307 不传权重） | `curl -sIL`，判据 [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 五 | 「跳转对不对」 |
| 判据与分级表 | seo-audit 的 error/warning 阈值、Ahrefs 档位实测、第三方工具接不接的对账 | [`references/seo-box.md`](seo-box.md) | 「这条 warning 要紧吗」 |
| 站点打不开类排障 | CF Pages 无效路径返回首页、图片慢、绑域名跳两次 | [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 二十四 | 「站打不开」 |

## 九、AI 搜索与 Agent 就绪度

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 2026 AI 搜索范式 | AI Overviews / AI Mode / Preferred Sources / Discover 独立算法 / Information Gain；引用优先于排名 | [`references/seo-growth.md`](seo-growth.md) 三-B | 「怎么被 AI 引用」「AEO 怎么做」 |
| Agent 就绪度评分 | `scan` 评分+待修项、`diff` 与上次对比、`history`；`--save` 存 `.rankup/agentic/` | `scripts/is-agentic.mjs` | 「llms.txt 要不要写」「对 AI 友好吗」 |
| 全网基线分母 | Cloudflare Radar 的全网 AI Agent Readiness 聚合通过率（**不是站点扫描器**） | `scripts/cf-agent-baseline.mjs` | 「我这个分数算高吗」 |

## 十、外链（专项 Skill：backlink）

rankup 只判「什么时候发、发多少」（SKILL.md 段 6 一行指回这里），深入操作时 `/backlink`；未安装：
`npx skills add yan-labs/yan-skills --skill backlink -g -y`。下表是外链能力的**唯一底账**，SKILL.md 不再复制。

| 能力 | 一句话能干什么 | 入口 | 是否必须加载 backlink |
|---|---|---|---|
| 机会发现与竞品反链 | 队列化发现 + 评论者反查 | `backlink/scripts/discovery-queue.mjs`、`harvest-commenters.mjs` | 是（读 `discovery-loop.md`） |
| 投放台账 | `stats` 覆盖率、`remaining` 还差多少、证据阶梯 submitted/public/indexed | `backlink/scripts/ledger.mjs` | 是 |
| 受控填表与提交 | 探入口 → 安全填表 → 提交闸门 | `backlink/scripts/inspect-page.mjs`、`safe-fill.mjs`、`release-submit-guard.mjs` | 是（`submission-lanes.md` + `safety-policy.md`） |
| 批量 campaign | 100+ 行的选靶与目录提交 | `backlink/scripts/targets-select.mjs`、`submit-directory.mjs` | 是（`batch-campaign.md`） |
| 质量与毒性判读 | 无专用脚本，靠评分卡 | `backlink/references/link-quality-rubric.md` | 是 |
| 付费平台登记 | 竞品在哪买的链接、投放平台估价 | `backlink/scripts/paid-platform-registry.mjs` | 读 `paid-platforms.md` |
| 登录态后台抓表格 | 虚拟滚动、节流、静默丢行的完整陷阱清单 | `backlink/scripts/harvest.browser.js` + `harvest-collect.sh` + `harvest-merge.mjs` | 是（`harvest.md`） |
| 判读：外链怎么发 | 买链花多少钱、KD → 引荐域数量对照、导航站过滤、发多快算太快 | [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 五 + [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 二十 | — |

## 十一、社群与经验（判「别人踩过什么坑」）

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 论坛全站取数 | new.web.cafe：`get <任意站内 URL>` 万能入口、悬赏问答（含 `collect` 征集榜）、经验 91 条 / 帖子 722 条 / 教程 40 个、站内搜索 | `scripts/webcafe-forum.mjs` | 「论坛里搜一下」 |
| 微信群归档搜索 | 14 个群的原文，**就是哥飞.ai 的知识库**，零 AI 额度 | `scripts/webcafe-forum.mjs chat-search "词"` | 「群里怎么说的」 |
| 问 SEO Agent | 有 `SEO_WEBCAFE_COOKIE` 走 `seo-webcafe.mjs chat`（纯 HTTP）；只有登录态浏览器走 `gefei-ask.mjs` | 两条互补路径，选法见 [`seo-webcafe.md`](seo-webcafe.md) | 「问下哥飞」 |
| 取数注意 | **匿名不报错**：返回 200 但把正文抹成空串、票数归零 | [`references/webcafe-forum.md`](webcafe-forum.md) 第一节 | 拿到空正文时 |
| 裁定集：挖需求阶段 | 还没定方向时的判断口径 | [`experiences/demand-discovery.md`](experiences/demand-discovery.md) | 「方向怎么选」 |
| 裁定集：0→1 | 优先级、「1」的定义、虚荣指标、止损线、新站上线执行清单 | [`experiences/zero-to-one.md`](experiences/zero-to-one.md) | 「先做哪个」「什么时候放弃」 |
| 裁定集：转化 | 访客不注册、注册不付费、定价怎么定；**动页面前先查上游流量意图** | [`experiences/conversion.md`](experiences/conversion.md) | 「没人付费」 |
| 裁定集：技术 SEO / 站群 / 索引 | 老站救不救、多站自我重复、品牌名不显示、页面下限 | [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) | 「这站还有救吗」 |
| 裁定集：群友复盘 | 带数字与失败根因的单点实践 | [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) | 「有人做过这个吗」 |
| 收录规则 | 往经验库加东西的三层归属与证据等级 | [`experiences/INDEX.md`](experiences/INDEX.md) | 「这条经验放哪」 |

## 十二、小游戏专项（子 Skill：game-opportunity）

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 每日全流程 | `collect`（discover + radar）→ `demand` → `evaluate`，产出当日候选与日报 | `node game-opportunity/scripts/game-opportunity.mjs daily` | 「运行小游戏监测」 |
| 分步入口 | `discover` / `radar` / `dedupe` / `plan` / `demand` / `evaluate` / `render` | 同上，换子命令 | 「只跑一下发现」 |
| 证据验收 | `collect-checklist` / `decision-checklist` 各 10 项硬验收（查证据在不在，不查判决对不对） | 同上 | 「今天这轮算完了吗」 |
| 判读指引 | 双轨闸门分值表、KD × 新站动作表、深查 6 名额规则——**全部是 AI 判读参考，脚本不执行** | `game-opportunity/SKILL.md` | 「这个游戏值不值得做」 |
| 建站阶段规则 | 游戏站的页面形态、iframe、变现 | [`references/game-sites.md`](game-sites.md) | 「游戏站怎么搭」 |

## 十三、浏览器与取数底座

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 数据获取优先级 | 现有脚本 → HTTP API → 用户浏览器 + 脚本 → 手动 OpenCLI；**跳级的唯一理由是上一级不存在** | [`references/discipline.md`](discipline.md)「取数优先级」 | 任何取数开工前 |
| 会话纪律 | 一会话一标签页、不要硬编码会话名、Bash 里禁用 `$$`、Semrush/Similarweb 不传 `--session` | `opencli` Skill `references/session-laws.md` | 「标签页被抢了」 |
| 落盘 SOP | 本地接收端优先，端口不能写死；退路才是下载目录 | `opencli` Skill `references/data-extraction.md` | 「数据落哪」 |
| 网页版 AI 工具驱动 | 只有聊天网页形态、且**确认没有 HTTP API** 的工具 | `scripts/chatbot-drive.browser.js` | 罕用；先确认无 API |
| 令牌存放 | 跨项目工具账号令牌只有一份，放 Skill 根 `.env`；项目 `secrets.md` 只记名称不记值 | [`references/discipline.md`](discipline.md)「令牌 `.env`」 | 「token 放哪」 |

## 十四、兄弟 Skill 提供的能力（rankup 做不到或做得差的那些）

**入口列写的是全局 Skill 的加载命令**，不是脚本路径。加载有上下文成本，
**默认答案是不加载**——只有下面这些经过取舍判定「值得接」，且要满足各自的触发条件。
每条的完整分工（什么情况用它、什么情况用 rankup 自己的脚本）、以及**判定「不接」的清单
与理由**，全部在 [`skill-ecosystem.md`](skill-ecosystem.md)。

| 能力 | 一句话能干什么 | 入口 | 典型触发说法 |
|---|---|---|---|
| 词表分层与聚类 | 已有词表按意图/优先级/内容簇分组（**它自己不取数**，取数仍归 rankup） | `/keyword-research` | 「这一百个词先写哪几篇」「怎么分簇」 |
| 被 LLM 引用的内容形状 | 逐平台来源选择机制、内容改写模式、llms.txt / OKF 知识包 | `/ai-seo` | 「这篇怎么改才会被 AI 引用」 |
| JSON-LD schema 模板库 | 结构化数据模板与字段填法（**只取模板，它的脚本一律不用**） | `/seo-geo` 的 `references/schema-templates.md` | 「加个结构化数据」 |
| 联网调研方法论 | 先广后深的分层检索法，替代裸 WebSearch | `/deep-research` | 「查一下 X 是怎么回事」 |
| 实时检索与正文抽取 | `search` / `batch_search` 并行 / `extract` 取网页全文 / 垂直领域检索 | `/anysearch` | 「这次更新到底改了什么」 |
| 中文社媒用户原话 | 小红书 / 推特 / B 站 / V2EX / Reddit / YouTube 等 15 平台取数 | `/agent-reach` | 「大家怎么评价 X」「小红书上怎么说」 |
| Agent Skill 供给盘点 | 1.6M SKILL.md 索引检索（**要时间序信号仍用 `demand/github-skill-search.mjs --mode recent`**） | `/skillsmp` | 「这个领域有人做过没」「别重复造轮子」 |
| 中文长内容起稿 | 中文创作与改稿，含「非虚构长文先列五件材料」的前置门槛 | `/human-writing` | 「写篇中文长文」 |
| 去 AI 味 | 初稿后的模板感/表演腔清理，保留术语与责任主体 | `/shuorenhua` | 「这稿子 AI 味太重」 |
| 扩词：心理角度 | 痛点词 / 对比词 / 决策词 | `/marketing-psychology` | 「扩词想不出角度了」 |
| 扩词：场景角度 | 不同职业 / 平台 / 用例的搜法；另有 139 条增长打法 | `/marketing-ideas` | 「还能从哪些角度想词」 |
| Workers 部署与资源 | `wrangler deploy` / `types` / D1 迁移（已在 [`cloudflare-stack.md`](cloudflare-stack.md) 接入） | `/wrangler`；平台深度用法升 `/cloudflare` | 「部署一下」「wrangler 报错」 |

**两条必须记住的边界**（展开见 [`skill-ecosystem.md`](skill-ecosystem.md) 第三节）：

- **`seo-audit` Skill ≠ `rankup/scripts/seo-audit.mjs`。** 同名但完全不是一回事：脚本是全站
  零配额取数，Skill 是一份**开场先问用户六个问题**的面谈式框架，与本 Skill「全权委托、直接做」
  的执行纪律冲突。**不要加载那个 Skill**，站点体检走 §八 的脚本链路。
- **`/write` 不要加载**：它路由到的五个附属 Skill 在本机全局目录里一个都不存在。中文写作
  直接用 `/human-writing` + `/shuorenhua`。

明确判「与 rankup 无关，不要加载」的：`ops`、`macmini`、`kollab-cli`、`gh-cli`、`skill-creator`、
`find-skills`、`agent-browser`（会和 `opencli` 撞会话）、`tuner`/`tuner-ci`（付费通道，现有免费通路已覆盖）。
全局目录下的 `learned` 是**空目录、没有 SKILL.md**，不是能力。

---

## 覆盖度自检

盘点时间 2026-08-30，对照磁盘实际文件：

- `rankup/scripts/` 顶层 **27 个可执行 `.mjs` + `gt.py`**（2026-09-09 复查），另有 4 个不单独作为能力入口的文件：
  `lib-scene.mjs`、`webcafe-transport.mjs`、`webcafe-rsc.mjs`（库）与 `gt-browser.mjs`（`gt.py` 的取数层，
  可直接跑但一般由 `gt.py` 转发）；两个 `.browser.js` 是注入页面的载荷，不单独运行；
  `rankup/scripts/archive/gt-v1/`（旧版 Google Trends 路由，2026-09-09 归档）**不算独立能力
  入口**，不计入这个数字——新版接口失效时的对拍兜底，见 `trends.md`；
- `rankup/scripts/demand/` **24 个可执行 + 1 个公共库**（2026-09-02 加 `suggest.mjs`）；
- `rankup/references/` 顶层 **23 个 md**（3.0 新增 `discipline.md`、`monetization.md`），另加
  `experiences/` **6 个**（合计 27），
  外加 `playbooks/` 目录；
- 生命周期 **七段**（每段开头先对账）× 闸门表——`lifecycle.md` 与 `checklists.md` 段编号一一对应，
  旧的 0–10 与 7.5 编号见 `lifecycle.md` 顶部映射表；
- 专项 / 底座 Skill：`backlink`（必要时加载）、`game-opportunity`（游戏专项）、`opencli`（浏览器底座）；
- 兄弟 Skill：判定「值得接」的 12 项见上方 §十四，判定「不接」的与理由见
  [`skill-ecosystem.md`](skill-ecosystem.md)。

新增能力时**同时改三处**：本文件、`SKILL.md` 的总路由表（若产生新意图簇）、
以及 `SKILL.md` 的 frontmatter `description`（若用户会用新说法触发）。
只改脚本不改这三处，等于这个能力对用户不存在。
