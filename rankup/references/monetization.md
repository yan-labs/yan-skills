# 变现与监控：路由与判据

段 7 的入口。本文件只回答「这个站该怎么收钱、接哪条通道、什么时候回头开下一棵树」，
只写路由与确认项，不写实现——实现分别在 [`integrations.md`](integrations.md)、
`stripe-best-practices` Skill 和经验库里，本文只指过去。

## 零、意图类型决定变现方式

产品形态不限，包括macOS、iOS、iPad、网站/SaaS，唯独不做Android App；按用户任务和分发方式选买断、订阅、IAP或广告。
**变现方式在段2由用户任务、网页/商店意图、原生使用与渠道证据共同定下**；Web可用SEO+GEO获客，App另核商店与直销市场，不等做完才挑。

| 意图类型（段 1 SERP 核实的） | 典型产品形态 | 默认变现 | 备用 |
|---|---|---|---|
| 信息型（问答、教程、对照表、日历） | 内容站 | 广告（AdSense 为主） | 去广告会员、可下载资产 |
| 工具型（generator / converter / checker） | 网页工具、桌面客户端 | 一次性付费（导出、去水印、买断） | 广告兜底、商店上架 |
| 持续使用型（每天/每周都要回来） | SaaS、AI 工具 | 订阅 | 一次性买断作为高价档 |
| 交易型（SERP 全是电商） | 不做站，或只做导购 | 联盟 / 导流 | — |

判据只有一条：**用户搜完这个词，愿意为「结果」还是为「持续可用」付钱？** 前者一次性，
后者订阅；两者都不愿意的就是广告。拿不准时按 [`experiences/conversion.md`](experiences/conversion.md) 零
先查上游流量意图，再动定价页。

## 一、Stripe

路由到 [`integrations.md`](integrations.md)「Stripe 路由」与 `stripe-best-practices` Skill，本文不复制。
只补一条定位：**Stripe 是默认主通道**，多产品用子账户隔离
（[`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 八·一），本地币展示的决策树在
[`seo-growth.md`](seo-growth.md) 五 2026-07-17 Stripe 那条。

## 二、PayPal：主通道的备份，不是第二主通道

### 为什么要有

风控关户不是小概率事件。经验库里的原话：「Stripe 子账号被关闭时，PayPal 还正常」
（[`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 八·一，出处 `/topic/hfmlrubo6b`），
同一节还记了 Paddle 大规模关户只留 30 天提现窗口。**收款通道只有一条时，关户等于收入归零且无申辩窗口。**
所以段 7 的第一件事是 Stripe + PayPal 两条都通，而不是把 Stripe 做精。

### 接入路径（路由，不写代码）

| 事项 | 走哪条 | 判据 |
|---|---|---|
| 一次性付费 | PayPal Checkout（Orders API） | 与 Stripe Checkout 同一个「下单 → 回跳 → 服务端确认」形状 |
| 订阅 | PayPal Subscriptions API（先建 Product + Plan） | 计划一旦有订阅者就改不了价，改价 = 新建 Plan |
| 回调 | Webhook + **验签**（`PAYPAL-TRANSMISSION-*` 头走官方验签接口） | 没验签的 webhook 等于公开的「给我发货」接口 |
| 环境 | 沙箱与生产是**两套凭据、两个 App、两个 webhook 地址** | 沙箱能跑通不代表生产 App 已审核通过；切换视为独立发布 |
| 凭据 | Client ID 是公开值，Secret 与 Webhook ID 走 Worker Secrets | 与 Stripe 同一条纪律：真实凭据绝不进 `.rankup/` |

### 接入前确认项

- 商家账号类型（个人 / 企业）与收款国家——决定能不能开 Subscriptions、结汇走哪。
- 一次性还是订阅——两套 API，别用 Orders 硬做续费。
- 回跳地址与 webhook 地址在沙箱、预览域、正式域各是什么（段 5 域名定稿后要换一遍）。
- webhook 幂等键（PayPal 会重发）与 Stripe 的幂等策略是否同一套。
- 退款入口：从哪里发起、多久到账、手续费是否退还（PayPal 默认不退固定手续费）。
- 验收：沙箱一次成功 + 一次失败 + 一次退款，三条 webhook 都落到你的处理器并写回订单状态。

### 与 Stripe 并存时的三条规则

1. **同一订单只走一条通道。** 用户选了哪个按钮就在哪条通道完成，不做「Stripe 失败自动转 PayPal」——
   那会产生两笔待确认订单，对账时分不清哪笔算数。
2. **两边对账口径统一。** 订单表里通道是一个字段，金额、币种、状态、外部 ID 用同一套列；
   报表按「订单」聚合而不是按「通道」各出一张。
3. **退款全退，两边一样。**「退一半他照样争议，你赔两次」
   （[`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 八·三）；争议率靠续费前 7 天邮件、
   订单成功当天邮件、账单上用完整域名压下来，这三条与通道无关。

反例一句话：花一周加通道、开本地支付，转化率反而降（同上 八·二）——**通道是备份，不是增长手段**。

## 三、广告

路由到 [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 二十二
（AdSense 七条实操：申请顺序、被拒「低价值内容」怎么改、实验、千展偏低、屏蔽联盟；Adsterra 只用 banner
与 native banner、popunder 有诈骗广告、Social bar 会改 title）。`ads.txt` 的规则在
[`integrations.md`](integrations.md)「容易整站漏掉的几个根目录文件」：**接广告的同一次改动里必须一起上**。

判据两条：

- 单页工具站几乎过不了 AdSense，先补 about / terms / 有信息增量的内容页再申请。
- AdSense 过审预检可先跑 `scripts/seo-webcafe.mjs adsense`（[`capability-map.md`](capability-map.md) 八）。

## 四、订阅

- 宽限期与永久授权事故：[`integrations.md`](integrations.md)「授权与宽限期」——永久授权必须走独立分支，
  不进任何以到期时间为基准的计算；服务端修完客户端必须做同一条兜底。
- 定价：[`experiences/conversion.md`](experiences/conversion.md) 二（先把目标换成每访客收入、价格锚定 +
  自动续订、三档定价、低频刚需上来就弹付费）。广告站加去广告会员的价位与「终身比年费好卖」在
  [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md) 二十二末行。
- 税：从第一天把价格设成不含税，营收达门槛后代收 VAT 会突然出现（同上二十二「其余变现」）。

## 五、商店上架（本 Skill 尚无脚本）

macOS、iOS、iPad App与浏览器扩展的分发渠道；macOS还可直销。每个平台一行判据，最小清单四项：**开发者账号、隐私政策页、截图、审核常见拒因**。
隐私政策页与截图是站点侧就能先做好的，账号申请要提前——审核排队以天计。

| 平台 | 账号 | 站点侧要先有 | 审核最常拒的 | 脚本 |
|---|---|---|---|---|
| App Store（iOS / iPad） | Apple Developer Program（年费，需 D-U-N-S 走企业） | 隐私政策 URL、支持页 URL、隐私营养标签 | 功能像网页壳、内购绕过 IAP、崩溃、缺演示账号 | 无 |
| Mac App Store | 同上一个账号 | 同上；MAS 包不需要公证，走 Transporter 上传 `.pkg`；需要 App Sandbox 与 Mac App Distribution / Installer 两张证书；SwiftPM 项目要先生成 Xcode 工程才能归档 | 沙箱权限说明不清、用了私有 API、装完不能立刻用；**系统功能替代类（启动器 / Launchpad / 剪贴板）另有四条硬阻塞：特权 LaunchDaemon、Sparkle 自更新、下载并执行代码（含 JS 插件市场）、站外授权码解锁（3.1.1）；且 5.2.5「与 Apple 产品混淆」会拒掉所有以 Launchpad 定位的 App；沙箱下靠 Accessibility 发 ⌘V 粘贴的剪贴板工具有被拒案例，改走 Apple Events 才过** | 无 |
| Chrome Web Store | 开发者注册（一次性费用） | 隐私政策 URL、权限逐条说明、宣传图 | 权限超需求、单一用途不清、远程代码、描述与功能不符 | 无 |
| Microsoft Store | Partner Center 账号 | 隐私政策 URL、年龄分级 | 缺隐私政策、名称保留冲突、安装包签名 | 无 |

判据：**上架是分发渠道，买断/IAP/订阅才是收费方式**。商店自然搜索和浏览发现有独立市场价值，不能仅当SEO外链。支付与外链引导按目标商店、地区及当前规则核验，不默认绕开IAP。App市场验证见 `demand-sources.md` App证据表；macOS直销的支付、下载、激活与留存各自取原始证据，彼此不可替代。

**桌面客户端上不上商店，先做两件事再决定**（2026-09-03 实测，【实测】）：①拿目标词亲眼看 Google SERP——商店页只在部分品类词上有排名（剪贴板、汇率换算、通用启动器类能进首页；Launchpad 替代、emoji 类零排名），词不在那几类里，只能说明未观察到网页搜索曝光，不能推断商店内需求；②看同类头部竞品的分发方式——启动器 / 截图 / 窗口管理这一类的头部产品全部直装 + Homebrew cask，cask 一年能带每个产品十万量级的安装，且提交只是一个 PR，零成本。把整个产品搬进沙箱等于砍功能换渠道，先算砍掉的是不是卖点；折中是「免费 Lite 版进商店当漏斗，全功能版直装」，但要先确认 Lite 里留下的功能本身在商店里有搜索量。

## 六、监控闭环：读数触发回段 1

变现接通之后不是「守着看」，是**读到某个状态就回到段 1 开下一棵词根树**。三类读数，每类一条触发线：

| 读数 | 看哪里 | 触发「开下一棵树」的状态 |
|---|---|---|
| 流量 | GSC 查询表 + 国家分布（每轮必看，[`seo-growth.md`](seo-growth.md) 四·1） | 主词族排名进前三页且 CTR 已按 TDK 调过一轮——本树的收割空间见顶 |
| 收入 | Stripe / PayPal 订单表按周 | 连续四周环比持平，且定价页曝光已按 conversion.md 调过——不是转化问题是流量问题 |
| 索引 | GSC 索引覆盖 + `site:` | 已提交页 90% 以上进索引、无「已抓取未编入索引」堆积——再加页边际收益递减 |

三条线的共同点：**本站能做的动作已经做完一轮，剩下的杠杆在新的需求**。此时不要给本站硬加功能，
回段 1 用 `scripts/demand/suggest.mjs` 与面板相关词扩下一棵树；新树落在同站还是新站，按
[`seo-growth.md`](seo-growth.md)「一个站还是多个站」的判据看现任赢家怎么分。

反向的触发同样要看：流量突然归零先走 [`seo-growth.md`](seo-growth.md) 五 2026-07-18「三步定性法」
（处置措施 / 曝光与点击是否同步归零 / 查询表形态），需求侧消失不是修站能救的，同样回段 1。

## 七、本文不做的事

- 不代替用户开通商家账号、不代替登录支付后台、不生成或存放任何凭据（[`integrations.md`](integrations.md)「权限边界」）。
- 不给具体金额建议；定价判据在 conversion.md，数字由站主定。
- 各站的通道状态、Plan ID、webhook 地址一律记在 `<project>/.rankup/integrations.md`，不回流本文件。
