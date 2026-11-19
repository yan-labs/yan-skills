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
- [登录态后台批量取数 · 网页版 AI Chatbot 取答（已下沉）](#登录态后台批量取数--网页版-ai-chatbot-取答已下沉)
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

## 登录态后台批量取数 · 网页版 AI Chatbot 取答（已下沉）

两节全文（去重键、分页、每页上限、HTTP 优先、令牌边界、后台标签假死、滚动上限、单采集循环、复制按钮取全文、会话找回）见 [`integrations/browser-data.md`](integrations/browser-data.md)（2026-09-30 拆分）。浏览器驱动机制本身归 `opencli` Skill。

## 分析与搜索平台接入

一个站上线之后要接的那一批：搜索平台（GSC / Bing Webmaster / IndexNow /
外链工具的站长版）与分析（无 cookie 计数 / GA4 / 会话录制类）。
下面是剥掉具体站点之后仍然成立的规则。

### 顺序：先改隐私声明，再注入脚本

**动手接任何分析之前，先 grep 自己站上 privacy / terms / 页脚里关于追踪的措辞。**
不是先研究怎么注入。

这类文案往往写得很早、写得很实（「本站不运行任何分析脚本」「除基本的页面计数外
不做追踪」），而且**没人记得它存在**。脚本一上线，那几句立刻变成虚假陈述。
更糟的是有些站还写过「上线前会先更新本页并点名具体工具」这种承诺——
那是一条必须履行的义务，不是客套话。

会话录制 / 热图类工具**必须单独点名**，不能并进「我们使用分析工具改进服务」
这种句子里。它记录的是用户在你页面上的实际操作过程，
比页面计数严重一个量级，读者有权知道。

### 所有权验证：一次性文件 / TXT > OAuth 授权

几乎每个平台都会把「连接你的 Google 账号 / 从搜索控制台一键导入」放在最显眼处，
标成「推荐」，手动方式藏在旁边。手动方式**效果完全一样**，
区别只是不用交出一份常驻的第三方读取权。

- DNS 托管商被识别出来时，平台会推荐「授权我们访问你的 DNS 账号」。
  把服务商下拉改成「任何 / 其他 DNS 提供商」，就会给出手动 TXT 值。
- 在**文件**和 **meta 标签**之间选文件：meta 标签要挂进每一个页面的 `<head>`，
  文件只是一个静态资源，对页面字节零影响。

> 说清楚一个例外：如果这个工作区/账号**早就**为别的站连过第三方账号，
> 那条连接对新建的项目通常同样生效。此时「我们没有授权 OAuth」并不完整，
> 要如实说明，并把「要不要收回」交给站主——收回会影响其他项目。

### 验证文件的内容必须来自真实产物，不能推断

有的平台只给一个「下载验证文件」按钮，不显示内容。此时文件名里往往含一段 token，
同一页面 meta 标签方式给的值也正是那段 token，于是「文件内容 = token」
看起来是显然的。**这个推断会失败**，而报错通常只有一句「令牌无效」，
不会告诉你差在哪。真实内容可能带前缀、带换行、或是别的封装格式。

不必真的下载到磁盘也能拿到确切字节——在页面里劫持 `URL.createObjectURL`，
点那个下载按钮，再读回 blob：

**照抄下面这一版，别照抄那个三行的。** 三行版把 `URL.createObjectURL` 永久换掉、
把 blob 攒在 `window.__cap` 里从不清空，后果是此后**任何**「这个页面产生下载了吗、
产生了几个 blob」的问题，答案都来自我们自己留在页面上的钩子——
而 `window.__cap[0]` 很可能是**上一个页面**留下的那个，会被读成这一次的产物。
装钩子的这段代码要能还原，采集前要归零，失败要能分辨是哪一种失败：

```js
// ── 注入清单：本段改动页面上的 URL.createObjectURL，一条，用完在 finally 里还原。
//    不写任何 window 全局：捕获到的 blob 收在闭包里，每次 capture() 归零。
//    道理见 backlink/SKILL.md 的 law `readiness-must-bind-to-this-query`：
//    注入进页面的任何东西都会成为后续观测的一部分，哪怕它从没被当成判据。
async function captureDownloadedBlob(clickIt, waitMs = 800) {
  const orig = URL.createObjectURL
  const blobs = []                                   // ← 每次调用一份新的，绝不跨调用累积
  const wrapper = function (b) { blobs.push(b); return orig.call(URL, b) }
  try { URL.createObjectURL = wrapper } catch { /* 属性被冻住，装不上 */ }
  const installed = URL.createObjectURL === wrapper   // ← 装没装上，当场记，别事后猜
  let displaced = false
  try {
    clickIt()                                        // 点「下载验证文件」
    await new Promise((r) => setTimeout(r, waitMs))
  } finally {
    // 只有还是我们那层时才写回；否则说明页面在我们之上又换了一次实现，
    // 硬覆盖回去等于把页面自己的实现抹掉。
    if (URL.createObjectURL === wrapper) URL.createObjectURL = orig
    else displaced = true
  }
  if (blobs.length) return { ok: true, 个数: blobs.length, 内容: await blobs[0].text() }
  // 三种「拿不到」不是一回事，别塌成一句「没抓到」：
  if (!installed) return { ok: false, 原因: "hook-not-installed —— 钩子没装上（属性被冻住 / 注入被拦）" }
  if (displaced) return { ok: false, 原因: "hook-displaced —— 页面换了下载实现，我们那层被顶掉了" }
  return { ok: false, 原因: "no-blob-observed —— 钩子在，但这次点击没走 createObjectURL（可能是直链下载）" }
}

// 用法：把「点哪个按钮」当参数传进去，钩子的寿命就等于这一次点击。
await captureDownloadedBlob(() => document.querySelector("#download-verification").click())
```

**判据：凡是「把这个文件放到根目录」的验证，内容必须来自真实产物。**
文件名里含 token 不等于文件内容就是 token。

### 第三方 snippet 里「写法很旧」的地方，往往是契约

官方埋点 snippet 常有一些看着该现代化的写法。改写之前先假设它们有原因。

最典型的一个：把 `function f(){queue.push(arguments)}` 改成
`const f = (...args) => queue.push(args)`。两者看着等价，
但有些 SDK 依赖的正是那个 **Arguments 对象**，换成真数组之后：
脚本正常下载、全局函数存在、队列里也确实有东西，
**但一条上报请求都不发，cookie 也不写，控制台没有任何报错**。
唯一的症状是「后台报表里永远是 0」，而那要等好几天才有人发现。

**由此得到的验收纪律：不要用「脚本加载了吗」当接通的判据。**
必须验到**一次真实上报**：清空 cookie 与本地存储 → 重新加载 →
（若有同意门槛）点同意 → 等几秒 → 同时检查
① 该设的 cookie 是否出现、② 资源列表里有没有那条 collect / 上报请求。
三项齐全才算接通，缺一项都可能是「装上了但不工作」。

### 同意门槛：把「不加载」做成结构，不是靠自觉

同时接了需要同意的分析（GA4、会话录制）和不需要同意的无 cookie 计数时：

- 所有需要同意的脚本走**同一个加载入口**，那个入口自己再查一次同意状态。
  散落在各处的 `if (consent)` 迟早漏一个。
- 同意状态是**三态**：`granted` / `denied` / **还没问过**。
  后两者都不加载，但只有「还没问过」才弹。合成布尔值之后，
  拒绝过的人每次访问都会被重新问一遍——这是这类同意条最被讨厌的地方。
- 加载函数要**幂等**。同意条可以被重新打开，用户可能连点两次同意；
  没有这道闸就会插进两份埋点，后台看到的是双倍数据，且不报任何错。
- **撤回入口必须常驻每一页**（页脚一个按钮即可）。撤回要和给予一样容易。

顺带一个反直觉的好处：**同意门槛顺带解决了首屏预算的冲突。**
「这两家合计几十 KB，和首屏 N 秒的硬约束有摩擦」这个担忧，
在同意之前不加载的结构下自动消失——绝大多数首次访问在用户做出选择之前
就已经完全可用。反过来说，「为了性能不做同意条」这个论证站不住。

### 增量提交（IndexNow 一类）

无状态 lastmod 窗口、部署命令与提交失败处理的唯一操作源见 [搜索平台发布流程](search-platforms.md#挂进发布流程这一节是规则不是建议)；不再使用提交内容哈希状态或 `--mark-only` 基线。

### 边缘注入型的分析：仓库零代码，但字节要照记

有些平台（尤其是你的 CDN 自家的）在检测到站点就在同一个账号下时，
会提供「自动注入」——埋点由**边缘在响应里插入**，仓库里没有任何痕迹。
省掉一次改代码，但有两个后果必须写进记录：

1. **它不受你的同意门槛管辖**（它通常无 cookie、不识别个人，所以这样是合规的），
   意味着它是每个访客都会下载的；
2. **字节仍然要算在首屏账上**。实测这类 beacon 可能比你自己写的整套同意条 +
   加载器还大一倍多。仓库里搜不到 ≠ 不要钱。

验收方式也不同：改完代码 grep 产物是没用的，
必须**打开线上页面看资源列表里有没有它**。

### 性能归因：复测并核对资源，别按「这轮加了什么」推

接完分析之后用 `pagespeed.mjs collect` 复测，再用 OpenCLI 驱动用户 Chrome
查看实际资源加载；分数下降时先核对第三方脚本是否加载及耗时，再归因。
没有可比的屏蔽前后数据时，归因写「未知」。

两条必须一起遵守的量测纪律：

- **移动端单次 Lighthouse 的方差能到 5–6 分。** 至少跑三次、报区间。
  拿单次结果去和历史基线作差，会得出完全虚构的「回归」。
- **换了测量目标就不是同一个基线。** 上线后正式域取代了预览域（尤其是
  绑定自定义路由之后预览域常被自动停用，旧口径再也复现不了），
  此时新旧数字之间混着换主机的影响，分不干净。
  **必须把这一点写在数字旁边**，否则下一个人会拿它当「加了脚本掉了 N 分」的证据。

### 向导「看起来没反应」时重试，会静默建出重复实体

多步建站向导（建项目 / 建媒体资源 / 加站点）的最后一步失败时，
有些后台**页面纹丝不动**，只在角落闪过一个立刻消失的错误提示。
按「刚才没生效」重试，结果是账号里多出一个一模一样的实体 ——
每次点击其实都成功创建了主实体，失败的只是最后那个子步骤
（常见的是排期、配额、套餐限制），而向导没把这两件事分开告诉你。

这种重复往往不是你发现的，是站主打开自己的面板看见两条同名记录才发现的。

**判据，对所有「多步向导 + 最后一步提交」的后台通用：**

1. **重试之前，先去列表页确认上一次到底有没有建成。**
   向导页面本身不可信——它可能因为某个非关键子步骤失败而停在原地，
   而主实体早就落库了。
2. **收尾必须回列表数一遍数量。** 「我只点了一次创建」不构成证据：
   一次成功创建 + 一次失败子步骤，在界面上和「两次都失败」长得一模一样。
3. 清理重复属于**破坏性操作**：删之前要从条目自身读出它的 id
   （卡片菜单里的设置链接通常带 `/<id>/`），确认删的是哪一个，
   不要靠「它排在列表上面」这种位置推断——排序规则随时会变。

### sitemap 与 IndexNow 的内容日期

页面注册表的 lastmod、sitemap 输出和无状态推送窗口统一按 [搜索平台日期纪律](search-platforms.md#无状态-lastmod-窗口与页面日期)；不另维护本地推送状态。

### 改「抓取指令」而不是内容时，增量推送不会触发

给全站加 `<meta name="robots" content="max-image-preview:large, ...">`、
改 canonical、加 hreflang——这些都**不改可索引内容**，所以基于内容比对的
增量推送会正确地报「无变化，不推送」。判据没错，但你确实希望搜索引擎尽快重读。

**判据：改这类「不是内容、但影响抓取与展示」的东西之后，手动强推一次。**
这正是 `--all` 之类开关存在的理由。

### `robots` meta 只写上限参数，不写 `index, follow`

`index, follow` 是默认值，写了是噪声。这个标签真正值钱的是三个上限：

```html
<meta name="robots" content="max-snippet:-1, max-image-preview:large, max-video-preview:-1">
```

不写的话抓取器按自己的保守默认裁剪——摘要被截短、缩略图只给一张小图。
站点已经在认真做 OG 大图（1200×630）时，缺 `max-image-preview:large`
等于白做。

### 容易整站漏掉的几个根目录文件

- **`/.well-known/security.txt`（RFC 9116）**：`Expires` 是必填，
  过期即失效，所以它**会腐烂**——要么构建期生成，要么把续期提醒写进项目记录。
  顺带：`public/` 下的**点开头目录，Vite 会照常拷贝**（实测），
  不需要为它改 publicDir 配置，但构建完 `ls` 一下产物确认，别靠猜。
- **`ads.txt`**：没接广告时 404 是对的；**接广告的同一次改动里必须一起上**，
  缺它直接影响填充与收入，而后台提示往往不显眼。
- **`humans.txt`**：不建议加，没有任何搜索引擎读它。

### `og:image:alt` 有了不代表 `twitter:image:alt` 也有

两边各读各的字段。只配 OG 那套时，X/Twitter 的大图卡片对读屏软件
就是一张无名图片。检查 head 时把这两个当成两件事。

### 记录漂移：文档写了「已改成 X」，代码里还是旧值

上线前后最容易出现这种漂移的是**脚本里的默认值**——它不出现在任何命令行里，
平时没人看得见它没跟着改。

真实后果长这样：部署校验脚本的默认 origin 还指着已经停用的预览域，
跑出来「所有页面都不一致」，线上内容是 CDN 的错误页文本。
**看起来像部署把整站弄坏了，实际是在验一个已经不存在的主机。**

**判据：在文档里写下「某某已经改成 X」的同时，grep 一遍代码里还有没有旧值。**
写文档的那一刻是唯一还记得这件事的时刻。

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
