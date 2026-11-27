# Rankup 集成与专项 Skill 路由

AI 生成供应商 Kie 的可选接入、能力与脚本统一见 [Kie 分支](integrations/kie.md)；本页不重复其模型与操作。
## 目录

- [已验证的 Skills CLI 命令](#已验证的-skills-cli-命令)
- [路由表](#路由表)
- [Google OAuth 2.0 Web Client（登录用，非 GA4/GSC）](#google-oauth-20-web-client登录用非-ga4gsc)
- [Cloudflare 路由](#cloudflare-路由)
- [Stripe 路由](#stripe-路由)
- [PayPal 路由](#paypal-路由)
- [三方库与现成服务优先](#三方库与现成服务优先)
- [趋势、SEO 与外链路由](#趋势seo-与外链路由)
- [能力发现](#能力发现)
- [登录态后台批量取数 · 网页版 AI Chatbot 取答](#登录态后台批量取数--网页版-ai-chatbot-取答)
- [分析与搜索平台接入](#分析与搜索平台接入)
- [权限边界](#权限边界)
- [授权与宽限期](#授权与宽限期)

Rankup 负责识别需求、选择专项能力和保持项目记录；专项 Skill 负责各自领域的操作细节。只安装当前任务需要的依赖，并在执行前确认用户授权范围。

## 已验证的 Skills CLI 命令

以下命令的 `add`、`update`、`--skill`、`-g`、`-y` 和 `--all` 语法已用当前 Skills CLI 帮助与仓库清单核对：

```bash
# 安装或刷新 yan-skills 仓库中的全部 Skill
npx skills add $SKILLS_SOURCE -g --all

# 更新全局安装的 rankup
npx skills update rankup -g -y

# 外链执行、外链分析，以及登录态后台批量取数（三者已合并为一个 Skill）
npx skills add $SKILLS_SOURCE --skill backlink -g -y

# Cloudflare 资源、绑定、迁移、密钥和部署
npx skills add cloudflare/skills --skill wrangler -g -y

# Cloudflare Workers 代码与运行时最佳实践
npx skills add cloudflare/skills --skill workers-best-practices -g -y

# Stripe 支付与计费集成规范
npx skills add stripe/ai --skill stripe-best-practices -g -y

# 搜索尚未覆盖的专项能力
npx skills add vercel-labs/skills --skill find-skills -g -y
```

这些示例采用全局范围。项目级安装时遵循 Skills CLI 当前帮助所示的项目范围选项，并在项目内记录实际安装范围。安装依赖只增加本地能力，不代表用户授权修改外部账户。

## 路由表

这张表只管基础设施、支付与外链类 Skill；内容、SEO 与调研类兄弟 Skill 接与不接的唯一源在 [`skill-ecosystem.md`](skill-ecosystem.md)。

| 需求 | 使用的 Skill | 使用时机 | 写回 `.rankup/` |
|---|---|---|---|
| Cloudflare 登录、资源查询、bindings、D1 migrations、R2、Worker Secrets、日志 tail、发布与回滚 | `wrangler` | 任何 Cloudflare 控制面或 CLI 操作 | `infrastructure.md`、`secrets.md` 元数据、`releases.md`、日志 |
| Worker 代码、运行时 API、资源限制、性能、安全和代码审查 | `workers-best-practices` | 编写或审查 Worker、SSR 服务端和 bindings 使用方式 | `architecture.md`、`audit.md`、决策 |
| 支付、订阅、Checkout、Billing、Webhook 或 Stripe 数据模型 | `stripe-best-practices` | 仅当支付或计费明确进入任务范围 | `integrations.md`、`secrets.md` 元数据、`releases.md` |
| PayPal Checkout / Subscriptions、与 Stripe 并存的对账 | 本文「PayPal 路由」+ [`monetization.md`](monetization.md) 二 | Stripe 主通道接通之后，作为关户备份 | `integrations.md`、`secrets.md` 元数据 |
| 趋势方向、关键词热度、区域或时间变化证据 | 本 Skill 的 [`trends.md`](trends.md) 加 `scripts/gt.py` | 机会调研、内容选题和关键词复核 | `keywords.md`、`baseline.md`、实验 |
| 外链盘点、质量评估、差距和风险 | `backlink`（`references/link-quality-rubric.md`） | 任何外链执行之前，以及周期性复查时 | `audit.md`、`baseline.md`、计划 |
| 已批准的外链获取、提交和结果验证 | `backlink` | 分析完成、目标和风险经用户确认后 | `plan.md`、日志、实验 |
| 当前列表没有覆盖某项明确能力 | `find-skills` | 先描述能力缺口，再搜索候选 Skill | `decisions.md`、`integrations.md` |

## Google OAuth 2.0 Web Client（登录用，非 GA4/GSC）

网站要接「使用 Google 登录」时用 `<rankup-skill-dir>/scripts/google-oauth-client.mjs`
配置 consent screen 和 Web OAuth client 表单。用户手点「创建」后，用同一
OpenCLI 会话读取成功弹窗，再写入目标 Worker 的 Wrangler secrets。
**没有 gcloud/API 能建这类标准 Web client**
（`gcloud iam oauth-clients` 是 Workforce Identity 用的，`gcloud iap
oauth-clients` 锁定在 IAP 资源上，都不适用），只能靠这个脚本驱动 Console UI，
详细依据见脚本文件头「研究结论」。

```bash
# dry-run（默认）：只打印计划，不碰任何外部状态
node <rankup-skill-dir>/scripts/google-oauth-client.mjs \
  --project my-app \
  --name "My App" \
  --origins https://example.workers.dev,https://example.com,https://www.example.com,http://localhost:3000 \
  --redirect-path /api/auth/google/callback \
  --publish --stop-before-create

# 第一步：填好表单后停下，保留标签页；--project new:<名字> 可新建项目
node <rankup-skill-dir>/scripts/google-oauth-client.mjs \
  --project my-app --name "My App" \
  --origins https://example.com --session oauth-my-app \
  --stop-before-create --commit

# 在浏览器里手点「创建」，成功弹窗保持打开，然后执行第二步
node <rankup-skill-dir>/scripts/google-oauth-client.mjs \
  --capture --session oauth-my-app --worker-dir /path/to/apps/web --commit
# 如需同时写本地 .dev.vars，第二步加 --write-dev-vars
```

第一步幂等：consent screen 已配置、已发布、client 已存在时各自跳过，可原样重跑；
失败时脚本保留标签页并打印当前页面文字（不再自动关会话），查完用
`opencli browser <会话名> close` 关掉。「已获授权的网域」自动折算成可注册域
（`www.example.com` → `example.com`，`my-app.<account>.workers.dev` → `<account>.workers.dev`），Console 仍拒绝的
会被删除并跳过。Console 界面语言需为简体中文。2026-10-02 Console 实测
踩坑（顶栏搜索框被当成表单控件、域名必须是顶级专用域名、创建页偶发「加载失败」
要点「重试」等）详见脚本头注释。

2026-09-29 实测：自动点击「创建 OAuth 客户端」连续 7 次被拒，用户手点一次
即成功。因此脚本不自动点击这个按钮；第二步只读取仍打开的成功弹窗，凭据
通过 stdin 交给 `wrangler secret put`，不打印。第一步默认停在按钮前，
`--stop-before-create` 用于明确标出这一阶段。

## Cloudflare 路由

涉及 Cloudflare 时先读取项目的 `.rankup/infrastructure.md` 和 `.rankup/secrets.md` 元数据，再根据任务调用 Wrangler：

1. 用 Wrangler 检查身份与目标环境，不在记录或输出中暴露凭据。
2. 先查询现有资源和 bindings，再决定创建、迁移或修改。
3. D1 schema 变更必须有 migration、目标环境和回滚/恢复说明。
4. binding 变化后重新生成类型，并让 Worker 代码与配置保持一致。
5. 部署后验证真实 SSR HTML、API、bindings、上传、认证和适用的回调路径。
6. 将非敏感资源标识、验证结果和回滚点写回项目记忆。

`workers-best-practices` 与 `wrangler` 可以同时使用：前者约束代码和运行时设计，后者负责 CLI、账户资源和部署操作。

## Stripe 路由

只有用户的产品范围明确包含支付或计费时，才安装或调用 `stripe-best-practices`。执行前确认：

- 测试模式还是生产模式；
- 一次性支付、订阅或其他计费模型；
- 产品、价格、税务、退款和取消规则；
- 服务端创建流程、客户端边界和 Webhook 幂等策略；
- Cloudflare 环境中的密钥存储位置与绑定名称；
- 成功、失败、重试和退款的验证标准。

真实凭据和 Webhook 签名材料绝不写入 `.rankup/`。项目记忆只记录非敏感对象标识、环境、集成状态、验证证据和密钥元数据。任何从测试模式到生产模式的切换都视为独立发布，需重新核对资源、回调地址、监控和回滚方案。

## PayPal 路由

PayPal 没有专项 Skill；接入路径、确认项与「同一订单只走一条通道」等并存规则全部在
[`monetization.md`](monetization.md) 二，此处只放一行路由：**Stripe 主通道跑通之后再接，
一次性付费走 Checkout（Orders API），续费走 Subscriptions API，webhook 必须验签。**

执行前确认（与 Stripe 路由同一份纪律，逐条对照）：

- 沙箱还是生产——两套 App、两套凭据、两个 webhook 地址，切换视为独立发布；
- 一次性还是订阅——Orders 与 Subscriptions 是两套 API，Plan 建了就改不了价；
- 回跳地址与 webhook 地址在预览域和正式域各是什么，段 5 域名定稿后要换一遍；
- Client ID 可以进页面，Secret 与 Webhook ID 走 Worker Secrets，与 Stripe 同一条纪律；
- 验收标准：沙箱一次成功、一次失败、一次退款，三条 webhook 都落到处理器并写回订单状态。

## 三方库与现成服务优先

开发任何功能之前先按这个顺序查一遍，能接就不自写：

1. **Cloudflare 原生能力**——Email Routing、Web Analytics、Zaraz、Turnstile、Images、R2 预签名 URL、
   Queues、Cron Triggers。已经在账号里、零依赖、零运维，先看 [`cloudflare-stack.md`](cloudflare-stack.md)。
2. **现成 SaaS**——支付（Stripe / PayPal）、分析（GA4 / Clarity）、邮件发送（域名邮箱统一用 Cloudflare Email Sending，见 cloudflare/domain-email.md）、错误上报、
   搜索、评论。它们的免费档通常覆盖一个新站的前几个月。
3. **npm 上的成熟库**——看周下载量、最近发布日期、open issue 里有没有「维护者失联」的迹象；
   三项有一项不对就换一个。
4. **自写**——只剩这一步时才写，且写之前先 `grep` 仓库与跨项目资产登记表，
   确认别的项目没有已经写过一份。

为什么这么排：**独立开发者最贵的成本是时间，自写的轮子没人维护。** 一个自写的邮件发送、
一个自写的验证码、一个自写的图片裁剪，各自只花一天，但半年后每个都会在某次依赖升级或
平台改动时坏掉，而那时已经没人记得它是怎么写的；现成服务坏了有人修，自写的只有你修。
同一条道理在数据侧已经写过一遍（「有 HTTP 就走 HTTP，没才用 MCP」「动手抓之前先找官方 API」），
这里是它在产品功能侧的版本。

两个例外，都必须写进 `.rankup/decisions.md` 才算成立：

- 三方服务把**核心数据**握在它手里且导不出来（用户表、订单表）——这类自持；
- 三方库为一个小功能拖进整套运行时（几百 KB 的日期库为了格式化一个日期）——这类手写十行。

## 趋势、SEO 与外链路由

- 使用 [`trends.md`](trends.md) 的趋势查询补充证据，但不要把单一趋势曲线当作需求或排名结论。
- 先用 `backlink` 的分析参考（`link-quality-rubric.md`、`analysis-templates.md`）建立现状、质量、差距和风险证据。
- 只有目标已获批准时才使用 `backlink` 执行获取或提交；完成后验证链接是否存在、属性是否符合预期、页面是否可访问。
- 将关键词、外链和结果证据分别写入对应项目文件，避免把一次观察提升为通用规律。

### 抓完竞品反链，必须回流到 `backlink` 的平台登记表

这是一条**生命周期层面**的义务，不是外链任务内部的细节，所以记在这里：
任何项目抓完一批竞品反链之后，都要把产物并进 `backlink` Skill 的跨项目登记表
（`data/paid-platforms.json`，用它的 `scripts/paid-platform-registry.mjs merge`，
并且必须带 `--exclude-subject <本项目域名>`）。

理由是样本量：**一次调研只看得到几十个域名的反链，判断不了「这个投放平台是常用的还是偶发的」。**
只有把很多项目、很多批次并进同一张表，「被多少个独立观察对象用过」才会变成有分量的信号。
不回流的话，每个项目都在从零重新发现一遍同样的平台——而这正是 `.rankup/` 互不可见
所导致的信息孤岛，与跨项目资产登记表要解决的是同一个问题。

登记表本身放在 `backlink` 而不是这里：它是外链领域的资产，rankup 只负责**记得去喂它**。

### 判断「竞品是怎么起量的」，先看引用域集中度

新站在几个月内起量时，值得问的不是「我该提交哪些目录」，而是「它的链接实际来自哪里」——
把反链按首次发现升序拉出来，看最早那几百条**分布在多少个引用域**上。
集中在两三个域上的，基本可以确定是买的；顺着那个引用域的定价页去看，往往一眼确认。

两条容易读反的推论：

- **链接条数不等于投放次数。** 一次收录常常按界面语言各渲染一页，还可能横跨同一运营方的
  多个域名，所以「单日一百多条」通常是**投了一次 × 站点有一堆 locale**。
  估对方花了多少钱要按投放次数算。
- 但同一个机制反过来是**挑渠道的依据**：带 i18n 的平台会把一次成功放大几十倍，
  同等条件下优先，这一条对免费渠道同样成立。

判定与定价证据留在 `backlink` 的 [`paid-platforms.md`](../../backlink/references/paid-platforms.md)，
本节只记「什么时候该去问这个问题」。**记录不等于推荐**：买不买是站主的决定，
不得自行购买，也不得把按条数售卖的链接包粉饰成「目录提交」。

## 能力发现

当现有路由不能覆盖明确任务时：

1. 用 `find-skills` 按能力而不是按模糊产品名搜索。
2. 优先选择官方提供方或可信维护者，并检查描述、依赖、更新活跃度和权限范围。
3. 安装前说明为什么需要该 Skill、会触达什么系统，以及替代方案。
4. 将选择、版本/来源、适用范围和风险记录到 `.rankup/integrations.md` 或 `decisions.md`。
5. 新依赖仍受 Rankup 的密钥、验证和授权边界约束。

## 登录态后台批量取数 · 网页版 AI Chatbot 取答

两节全文（去重键、分页、每页上限、HTTP 优先、令牌边界、后台标签假死、滚动上限、单采集循环、复制按钮取全文、会话找回）见 [`integrations/browser-data.md`](integrations/browser-data.md)（2026-09-30 拆分）。浏览器驱动机制本身归 `opencli` Skill。

## 分析与搜索平台接入

上线后接搜索平台与分析的通用规则（剥掉具体站点之后仍成立的那些）已并进各自的文档：隐私声明顺序、第三方 snippet、同意门槛、边缘注入、性能归因、向导重试与记录漂移见 [`analytics-platforms.md`](analytics-platforms.md)「接入通用规则」；所有权验证、验证文件内容、增量提交、内容日期、抓取指令、robots meta、根目录文件与 `og:image:alt` 见 [`search-platforms.md`](search-platforms.md)「接入通用规则」。

## 权限边界

安装或更新 Skill 不授权以下行为：

- 修改外部账户、计费设置或成员权限；
- 购买产品、域名、套餐或付费服务；
- 删除生产资源、数据、域名、支付对象或历史记录；
- 在用户请求范围之外部署、迁移或切换生产流量；
- 获取、复制、打印或持久化真实密钥；
- 执行外链购买、批量提交或其他未批准的对外操作。

读取状态和准备本地配置可以作为正常诊断或实施步骤；涉及上述外部变更时，必须有用户请求所覆盖的明确授权，并在执行后写回可验证结果。

## 授权与宽限期

- **[2026-08-02] "永久授权"套用为订阅设计的宽限期计算,会把"没有期限"悄悄变成"从现在起算"**:典型写法 `graceBase = periodEnd ?? trialEnd ?? now`,对订阅正确,对永久授权则在两者都为空时回落到 `now`,于是买断用户在离线若干小时后被判为过期。规矩:永久授权必须走**独立分支**,不进入任何以到期时间为基准的计算;写这类回落链时逐个问"每个候选值为空时,语义还成立吗"。
- **配套铁律:服务端修完必须在客户端做同一条兜底**。被卡住的机器恰恰是离线的那台——它永远拉不到你修好的服务端响应,只会一直读本地旧缓存。只改服务端等于只修好了"还没出问题的用户"。
