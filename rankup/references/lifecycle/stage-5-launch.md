# 生命周期 · 段 5：上线与接入

## 目录

- [段 5：上线与接入](#段-5上线与接入)
  - [硬规则（全文，含「为什么」；SKILL.md 只留摘要）](#硬规则全文含为什么skillmd-只留摘要)
  - [输入](#输入)
  - [前提：Cloudflare 凭据与操作优先级](#前提cloudflare-凭据与操作优先级)
  - [必做动作](#必做动作)
  - [步骤 check](#步骤-check)
  - [输出](#输出)
  - [完成门禁](#完成门禁)
  - [交给下一段的](#交给下一段的)

> 本文件是 [`lifecycle.md`](../lifecycle.md) 的段 5 全文（2026-09-30 从单文件拆出）。开工先做[对账](../lifecycle.md#每段开头的固定动作对账原阶段-0)；闸门判据在 [`checklists.md`](../checklists.md) 段 5，本文件只写怎么做。

## 段 5：上线与接入

正式域名占位复查同时按[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域)重跑文案扫描与入口闭环，保留本轮证据。

**顺序是固定的，分两批**：
批 A（域名无关）在预览域接好并验证 → 域名黑历史裁决 → 域名定稿与绑定 → 部署到正式域名并真实验证 →
放开索引（部署验证通过即放开，不等批 B，理由见 5.4 第 22 条）→ 批 B（域名相关）一个不漏 → 提交 sitemap（默认不逐 URL 请求编入索引，见 5.6）。

**为什么要「一个不漏」**：有站 80% 流量来自 Bing；有站英语市场做得好，流量却几乎全部来自韩国（Naver）。
哪个引擎会成为主来源在接入之前不知道，漏接一个就是永久少一段历史数据——这些平台记的是历史，晚接一天就少一天。

### 硬规则（全文，含「为什么」；`SKILL.md` 只留摘要）

| 规则 | 为什么 |
|---|---|
| **部署一律走 Cloudflare 原生 Git 集成**（Pages「Git 存储库连接」/ Worker Workers Builds），push `main` 自动构建部署；**不写 GitHub Actions 部署 workflow**；本地 `wrangler deploy` 只作应急兜底。模板与坑见 [`cloudflare-stack.md`](../cloudflare-stack.md) §9 | GitHub Actions 免费额度用完就断，Cloudflare 构建额度对站点几乎用不完 |
| 分两批：**批 A 域名无关**（GA4、Clarity、CF Web Analytics）在预览域接好并验证 → **域名定稿** → 绑域名并部署验证（**索引开关随之翻开，不等批 B**）→ **批 B 域名相关**（GSC、Bing、Yandex、Naver、IndexNow、Ahrefs WA + Site Audit、Email Routing）→ 提交 sitemap（默认不逐 URL 请求编入索引，需要催收录见 `search-platforms.md` 的可选脚本） | 批 A 不依赖域名，先做省一轮；批 B 换域名就作废，所以放在定稿之后。**正式域名不再靠 `noindex`/`Disallow: /` 拖到批 B 接完才放开**——曾有项目这样做，Google 抓到过屏蔽状态的 robots.txt，放开后 GSC 仍长期报「已编入索引，尽管遭到 robots.txt 屏蔽」，理由与替代方案见 `lifecycle.md` 段 5.4 第 22 条 |
| 域名定稿前过**黑历史裁决闸门**：官方 `gefei-domain` Skill、Wayback、外链画像、`site:` 搜索；成人 / 赌博 / 被惩罚一律否 | 带惩罚的域名做什么都起不来，换域名比救域名便宜 |
| **一个不漏**，清单要有「其他能带流量的平台」兜底行 | 有站 80% 流量来自 Bing，有站几乎全部来自韩国 |
| IndexNow 排在站长工具前面 | 它一样账号都不欠，先推了再慢慢验证所有权 |
| **绑定正式域名后、上线验收前主动完成基础安全**：按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.8 核对 HTTPS、响应头及实际 API 防护，生产验证后记证据；已上线站 review 补查 | 属于上站后的检查优化；小改优先，嵌入/CSP/HSTS 先核用途，不批量上验证码或复杂 WAF |
| **网站必须允许所有 AI 爬虫访问**：训练、搜索、用户代理类均不得在 Cloudflare、WAF、Bot Fight Mode 或 robots.txt 被禁；新 zone 关闭 Bot Management 四字段，按 [`checklists.md`](../checklists.md) 段 5 逐 UA 实测 | robots.txt 放行仍可能被 Cloudflare Block AI Bots 在边缘返回 403，页面和 llms.txt 都抓不到【实测 2026-09-28】 |
| 接入必须**线上实测**：`curl` grep beacon 只证脚本在，CF WA 还要 GraphQL `count > 0` | `site_token` 填成 `site_tag` 不报错，一个站空跑了 45 天 |
| **第三方分析脚本（GA4、Clarity）一律延迟到首次交互或 6s 兜底再加载**（单用 `requestIdleCallback` 不够——空闲回调仍会落在 TBT 观测窗内），不许因为「脚本拖 LCP」把 GA4 标 ❌ 或推迟接入——延迟加载就完了，LCP 零影响 | 曾经因为这个理由把 GA4 标 ❌ 整整推迟了一天，纯属多此一举；【实测】单靠 `requestIdleCallback` 仍会被计入 TBT 观测窗 |
| Ahrefs Site Audit 的问题按报告逐 URL 修完，回段 4 全套重跑 | 第二台爬虫的价值在它看得到你自己漏掉的整站问题 |

> 2026-09-30 合并：此表由原 `SKILL.md` 本段硬规则表下沉而来，同一条规则只在这里写全文。

### 输入

- 段 4 交来的预览域体检结果与基线。
- 用户已购或候选的域名（**域名购买本身在第三方注册商完成，不在本段代买**）。
- 用户对第三方账号（搜索平台、分析平台、站长工具）的可用性说明。

### 前提：Cloudflare 凭据与操作优先级

段 5 密集操作 Cloudflare（DNS、Email Routing、zone 设置）。**一次性配好凭据，后面全程省事**。

**Wrangler 环境变量**（配一次，所有项目通用）：

```bash
# 放 Skill 根目录 .env 或 shell 环境变量（见 discipline.md 十一）
export CLOUDFLARE_EMAIL="<账号邮箱>"
export CLOUDFLARE_API_KEY="<Global API Key>"    # 37 位十六进制
# 或者用 scoped API Token（更安全，但需要覆盖所有 zone）
# export CLOUDFLARE_API_TOKEN="<token>"         # 40 字符
```

配好后 `wrangler whoami` 直接认证，不需要 `wrangler login`（浏览器 OAuth）。
同一组变量也可以用于 `curl` 调 Cloudflare API（Global Key 用 `X-Auth-Email` + `X-Auth-Key`，
scoped token 用 `Authorization: Bearer`，**两种 header 不能混用，混用报 6003 错误但错误信息极具误导性**）。

**操作优先级：API > CLI > 浏览器。** 段 5 涉及的 Cloudflare 操作（Email Routing 启用、
DNS 记录、zone 设置），优先用 API 或 `wrangler` CLI。浏览器是最后手段——
实测 Dashboard 上的 Email Routing 开关和 AI 爬虫设置有时点击无响应，
API 能立刻生效。AI 爬虫的 Bot Management 四字段已有 zone API，按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.5 操作并回读；无公开端点的设置才走 Dashboard。【实测 2026-09-28】

### 必做动作

**5.1 批 A：域名无关的接入，在预览域接好并验证**

1. **先接不需要任何第三方账号的那个**。托管平台自带的分析（Cloudflare Web Analytics）
   同账号即可开通，无 cookie、无同意横幅，当天就开始积累数据。
   把它排在需要外部登录的工具**前面**，这样"用户账号暂时不可用"不会阻塞全部测量。
2. **beacon 注入方式要按运行时选**，不要默认用"自动注入"：
   自动注入依赖边缘改写 HTML 响应体，而 **Worker 在边缘本身就是源站**，
   其响应未必经过该管线（官方 FAQ 亦说明 RUM 只作用于初次客户端请求）。
   判据是**线上原始 HTML 里 grep 得到 beacon**，不是控制台开关显示已启用。
   改手动嵌入时，**必须同时关掉平台侧的自动注入**——否则将来它一旦生效就是一页两个 beacon，
   而平台限制一页只允许一个。API 显示关闭后仍按 [`analytics-platforms.md`](../analytics-platforms.md) 分别核验 HTML Accept 请求与真实浏览器首屏、SPA 导航及远端上报；源码和控制台开关不能替代正式响应。
3. **分析 beacon 的站点 token 是公开值**（它本就印在页面 HTML 里），可以进源码，
   但要在注释里写明它不是机密，否则后人会当作泄露而删掉它。
4. **GA4 与 Clarity（会话录制/热图）**：接入步骤见 [`analytics-platforms.md`](../analytics-platforms.md)；
   衡量 ID / 项目 ID 写进 `.rankup/integrations.md`，**核对 ID 不核对名字**——
   实测某分析账号下有六个名字高度相似的资源，默认落点是错的那个。
5. **「装对了但没人来」和「装错了会漏数据」是两件事，验收必须能分开它们。**
   低数字本身不是证据。可分辨的证据是：平台自己的数据流状态条（「正在接收过去 N 小时内的流量」）、
   真实会话记录里**互不相同**的国家/设备/来源、以及页面标题与线上真实页面逐条对得上。
   一个装错的标签给出的是**零**，不是「少而结构完整」。
6. **同意门槛会让不同工具差一个数量级，这不是任何一方的 bug。**
   走 cookie 同意门槛的分析（GA4、多数会话录制工具）只统计点了同意的人；
   托管方的无 cookie 分析统计所有人。**实测记录**：同一个站同一 30 天窗口，
   无 cookie 的边缘分析记到 410 次浏览，同一时段 GA4 记到 51 次——约 **8 倍**差距。
   **「有多少人来」这句话必须先说清楚是同意门槛哪一侧的数字**，
   两侧不能互相替代，也不能只报一侧当作全量。
   拿被门槛过滤过的那个数字（更小的一侧）得出「没人用」，
   结论会和真相**正好相反**——这不是误差范围内的偏差，是方向性的误判。
7. **登录态失效的样子不是登录提示，是一个空白页。**
   实测某站长平台：HTTP 正常、脚本全下载、`readyState` 是 `complete`，
   但 SPA 从未渲染、**整页一次 XHR 都没发**、cookie 里没有该账号的鉴权项。
   判据是**看有没有发出过 API 请求**，不是看页面像不像坏了。
   这类卡点只能由用户自己重新登录，脚本不代填密码。

**5.2 域名黑历史裁决（定稿前必查，一票否决）**

8. 对每个候选域名，定稿前**四项都查**，证据落 `.rankup/decisions.md`：
   - **域名前世**：官方 `gefei-domain` Skill 的 `domain_timeline`，看历史上被谁用过、改过几次版；
   - **Wayback 存档**：在浏览器里打开 `web.archive.org/web/*/<domain>`，逐年抽看快照的页面内容与语言；
   - **外链画像**：官方 `gefei-domain` Skill 的外链工具 或 Ahrefs 免费站长版，看引荐域的类型、锚文本、语言；
   - **搜索引擎记忆**：Google `site:<domain>` 与品牌名搜索，看有没有残留收录、有没有「此网站可能被黑客入侵」一类标注。
9. **否决条件（任一命中即否，不讨论）**：成人、赌博、药、被搜索引擎惩罚过、大量垃圾外链（赌博/色情锚文本、成批同 IP 引荐域）。
   否决的域名连同证据一起记进 `decisions.md`，下次别再拿出来。
10. 域名有「前世」但通过裁决的，标记 `has_history: true`——它决定 5.6 索引放开后第一件事是（重新）提交 sitemap（默认不逐 URL 请求编入索引，需要时见 29 的可选加速工具）。

**5.3 域名定稿与绑定**

11. 按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.5 把 zone 加进 Cloudflare（优先驱动用户浏览器操作
    Cloudflare 后台，退路是 `scripts/cf-zone-setup.mjs` 配用户自己写入的凭据）。**域名购买本身在
    第三方注册商完成，不在这一步**；这一步只是让 Cloudflare 接管已购域名的 zone。
12. **换 NS 之前先关 DNSSEC**（§8.5「换 NS 之前必须先关 DNSSEC」），`whois` 复查到 `unsigned` 才继续；
    zone active 后再用 Cloudflare 的 DS 记录重新启用。
13. 若接入需要改 nameserver，**只把 Cloudflare 分配的 NS 值交给用户，由用户自己去注册商那边改**——
    这一步不代劳。原因不是技术做不到，是 NS 指向权决定整个域名的解析权，必须留在用户手里。
    交付形态是把 NS 值写清楚（写进对话或 `.rankup/infrastructure.md`），不是替用户点掉这一步。
14. 改完之后等待传播，再用真实解析结果核验（`whois` 看 NS，Cloudflare zone 状态从 `pending`
    变 `active`），不要以「已经告诉用户」当作域名已生效的证据。
15. **www / http 收敛**：裸域/www、http/https 四个入口收敛到同一个规范域，每一跳都是 301 且不超过一跳
    （规则写法见 §8.5「www / http 收敛」与 [`seo-box.md`](../seo-box.md) 二）。
16. **把段 3 的域名留位常量换成正式域名**——只改这一处；然后全仓库 grep 预览域字面量，必须为零。

16a. **绑定正式域名后主动补齐基础安全**：域名可访问后按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.8 检查并配置；在 5.4 的生产验证中一并验收，再放开索引。已上线站 review 补查，开发期无需提前完成正式域名配置。
    新 zone 同时按 §8.5 显式关闭 Bot Management 四个 AI 拦截字段；正式域名上线按 [`checklists.md`](../checklists.md) 段 5 的 AI 爬虫实测闸门验收。

**5.4 部署到正式域名并真实线上验证（原阶段 7）**

17. 部署前确认精确 Git SHA、目标环境、bindings、待执行迁移、域名和回滚点。
18. **默认部署路径是 Cloudflare Git 集成**（Pages 用「Git 存储库连接」，Worker 用 Workers Builds）：
    在控制台连好后 push 到 `main` 即自动构建部署，配置模板与实测坑见
    [`cloudflare-stack.md`](../cloudflare-stack.md) §9。**不写 GitHub Actions 部署 workflow**——
    本地 `wrangler deploy` 只作应急兜底，两者并存时以 Cloudflare 自动构建的 deployment 为准。
19. 上传完成后等待部署进入可服务状态，并从真实域名验证 SSR HTML、静态资源、API、D1、R2 上传/读取、鉴权和支付回调（**live 凭证**）；图标按段 4 · A 节第 5a 条逐项回读，放开索引后再核抓取权限。对本轮涉及的共享配置、结构化数据、交互组件、分析加载器，正式域名回读 D1 / D12 / D13 与段 5 分析判据；批量内容按 P3 对账包括 sitemap 外可索引页的 SSR 内链图。
20. 对边缘缓存或传播延迟进行有界重试，并用版本标识、响应头或实际内容确认服务的是新版本。
21. 检查日志与错误率，保存部署标识、时间、验证证据和回滚命令。
22. **不要再用 `noindex` / `Disallow: /` 把正式域名先上线、验收期间继续屏蔽、以后再手动放开。**
    真实教训：有项目在验收期把正式域名的索引开关关着，Google 抓到了那份处于屏蔽状态的
    `robots.txt`/`noindex`；后来虽然已经改回允许抓取，Google Search Console 仍长期报
    「已编入索引，尽管遭到 robots.txt 屏蔽」——这条历史记录不受你控制，改完不会自动消失，
    平白多出一轮排查成本，还会让人怀疑网站是不是哪里没配对。
    **默认做法：本条上一步（19）在正式域名上验证通过后，索引开关随之翻开，不等 5.5 批 B 接完**——
    批 B 是分析、站长工具这类接入，和页面能不能被抓取无关，不必也不该拿来当索引闸门。
    真需要在正式域名上暂时挡一段时间（软发布只给特定人看、或个别页面还没写完），
    按范围选替代方案，都不是 sitewide `noindex` / `Disallow: /`：
    - **整站还没准备好公开**：用 Cloudflare Access 或 HTTP Basic Auth 挡访问权限——
      没有权限的人连内容都看不到，不是靠爬虫自觉遵守 robots 协议；域名可以先不绑，
      继续在 `workers.dev` 预览域上跑体检，真正要发布时才绑正式域名。
    - **只有个别页面没写完**：只给那几个页面单独加 `<meta name="robots" content="noindex">`，
      不要牵连全站——已经写完的页面被一起挡住，等于平白推迟它们的收录。

**5.5 批 B：域名相关的接入，一个不漏**

23. **搜索平台优先建"网域"（DNS 验证）资源而不是"网址前缀"**：
    前者覆盖所有子域与 http/https，后者一个前缀一个资源，www 与非 www 要建两份。
24. **搜索平台提供的"授权访问你的 DNS 服务商账号"是一次 OAuth 授权，不得代替用户点。**
    它给出的是对用户 DNS 账号的**长期访问权**，属于必须由用户本人决定的动作。
    等价替代路径是：把验证方式切到"任何 DNS 提供商"，取回 TXT 值，
    由**你**通过 DNS API 写入记录，再让用户点验证——同样自动化，但不产生任何长期授权。
25. **索引推送与 sitemap 提交这一整段，走 [`search-platforms.md`](../search-platforms.md)，不要现摸。**
    那份文档给的是顺序表 + 两个脚本 + 每个坑的判据：
    - IndexNow 操作统一见 [`search-platforms.md` 的 IndexNow 章节](../search-platforms.md#12-indexnow)。
      **它排在站长工具前面**：IndexNow 一样账号都不欠，一个密钥文件就是全部凭据，
      排到后面等于白等账号问题解决的那几天。
    - `scripts/webmaster-sitemap.mjs` —— 在 GSC 与 Bing 里读/提交 sitemap（`status` / `submit`）。

    这一段有两条**必须由用户本人点**、不得代做的：站长工具的「授权访问你的 DNS 服务商账号」，
    以及 Bing 的「从 Google Search Console 导入」——后者省下几分钟，换来的是 Bing 对用户
    Google 账号的长期 OAuth，而一行 meta 标签达到完全相同的效果。
26. **品牌邮箱 `hello@<domain>`**：站点上线后，`contactPoint`、`/about` 页面和任何对外投放（目录提交、外链联络）
    都需要一个**看起来属于这个站的邮箱**——用个人 Gmail 会让 E-E-A-T 信任信号打折，
    也会让外链站主怀疑你是不是真的运营这个站。零成本做法是 Cloudflare Email Routing，
    在 Cloudflare 边缘接收发往你域名的邮件，转发到你的个人邮箱；不需要买邮箱服务、不配 SMTP、不要同意横幅。
    先用 `wrangler --version` 与 `wrangler email routing --help` 核验本机命令，支持则 CLI，
    否则直接用官方 API；操作与安全认证方式统一见 [`cloudflare-stack.md` §8.6](../cloudflare/domain-email.md#86-品牌邮箱cloudflare-email-routing)。
    **新建/绑定域名、接邮箱及上线时主动核查 SPF / DKIM / DMARC**：先盘点外发用途与独立发信子域，
    只收信有证据或用户确认后补拒收策略；有外发先验证认证对齐，用途未知只阻塞策略变更。
    先读后写、不重复、不降级、不改坏 Routing 的 MX / SPF / DKIM；API 回读、权威与公共 DNS 都验证生效，
    并留变更前后与回滚记录。收信测试和外发认证测试分开，无外发标不适用；`p=none` 只算观察。

    注意事项：
    - **`enable` 会自动配 MX、SPF 和 DKIM DNS 记录**——如果域名已有 MX（比如用着 Google Workspace），
      启用前先确认不会冲突，否则会中断现有邮箱收件。
    - **目标地址需要验证**：`addresses create` 之后，目标邮箱会收到一封确认邮件，
      点了才能用作转发目标。同一个 Cloudflare 账号下已验证过的地址**跨域名共用**，不需要重新验证。
    - **Dashboard 开关可能无响应**：实测 Email Routing 的「启用/禁用」按钮偶尔点击无效——
      routing 显示「已禁用」但 DNS 记录和规则都在。此时用 API `POST .../enable` 能立刻生效。【实测 2026-09-03】
    - **这只解决收件**。如果需要用 `hello@<domain>` 发信（不只是收），
      需另接发信服务并验证 SPF / DKIM 与 DMARC 对齐，不能把 Routing 当成外发能力。
    - **地址只有一个约定：`hello@`。** 不用 `contact@`（多一个写法就多一处不一致）、
      不用 `admin@`（暗示管理入口）、不用 `info@`（垃圾邮件重灾区）。

    设好之后，把 `hello@<domain>` 填入：Organization JSON-LD 的 `contactPoint.email`、`/about` 页面的可见联系方式、
    外链投放和目录提交时的联系邮箱——三处同一个字符串。

**批 B 平台清单（域名配好之后必须一次接完的那一批）**

这一批的共同点是「越早接越值钱」——它们记的是历史数据，晚接一天就永久少一天。

| 类别 | 平台 | 依赖 | 它独有的东西 |
|---|---|---|---|
| 索引推送 | IndexNow | 只要一个密钥文件 | 接入、密钥路由与各部署路径（含 Workers Builds 部署命令）按 [IndexNow 操作](../search-platforms.md#12-indexnow) |
| 搜索平台 | Google Search Console | Google 账号 + DNS 验证 | 查询词、曝光、平均排名、索引状态、人工处置、Generative AI 效果报告（AI Overviews/AI Mode 曝光）。sitemap 用 `webmaster-sitemap.mjs gsc submit` |
| 搜索平台 | Bing Webmaster | 微软账号 | Bing/Yahoo/DuckDuckGo 一侧的收录。**有站 80% 流量来自这里。** **用 HTML meta 验证，不要用「从 GSC 导入」**（那是给 Bing 一个对 Google 账号的长期 OAuth）。sitemap 用 `webmaster-sitemap.mjs bing submit` |
| 搜索平台 | Yandex Webmaster | Yandex 账号 | 全球第五大搜索引擎，俄罗斯 60%+ 份额。所有站点都接——即使不做俄语市场，Yandex 的行为因素分析数据也有参考价值。用 HTML meta 验证（`yandex-verification`），爬虫 UA 是 `YandexBot`，确认 `robots.txt` 没误拦。Yandex 也是 IndexNow 共同创建者，推送已覆盖。详见 `search-platforms.md`「步骤 6：Yandex Webmaster」 |
| 搜索平台 | Naver Search Advisor | Naver 账号 | **有站英语市场做得好，流量却几乎全部来自韩国。** Naver 在韩国的地位相当于百度 + 小红书 + 大众点评 + 抖音的合体，占韩国搜索流量的主导份额。虽然 IndexNow 能被动推送，但站长工具的收录状态、搜索分析、网站诊断只有注册后才有。用 HTML meta 验证，爬虫 UA 是 `Yeti`，确认 `robots.txt` 没误拦。详见 `search-platforms.md`「步骤 5：Naver Search Advisor」 |
| 外链视角 | Ahrefs Webmaster Tools（免费站长版） | Ahrefs 账号 + 所有权验证 | 免费看自己的引荐域名与 rel 分布。**GSC 已接入时用 Dashboard「Import from GSC」一步完成创建+验证+Site Audit 启用（优先）**；否则 `ahrefs-setup.mjs create` → `verify`。详见 [`analytics-platforms.md`](../analytics-platforms.md)「两条路：GSC 导入（优先）与手动创建」 |
| 站点体检 | Ahrefs Site Audit | 同上 | 全站抓取的第二双眼睛：重定向链、内链 404、孤儿页。`ahrefs-site-audit.mjs report <id> <section>`；边界见 [`seo-box.md`](../seo-box.md)「Ahrefs AWT 免费档」 |
| 品牌邮箱 | Cloudflare Email Routing `hello@` | Cloudflare 账号 | 见第 26 条 |
| 受众忠诚度 | Preferred Sources 引导按钮 | 无 | 引导用户标记站点为 Preferred Source，被标记站点 CTR 翻倍（2026-08 新增自定义按钮） |
| **兜底** | **其他能带流量的平台——做哪个市场就接哪个市场的引擎** | 该平台账号 | 日本 Yahoo! JAPAN（走 Google 索引但有自己的站长入口）、韩国 Daum、捷克 Seznam、中国百度/搜狗、越南 Cốc Cốc……**段 2 裁定的语种/市场决定这一行填什么，不许空着** |

**5.6 复核索引已放开，并提交 sitemap**

27. **复核索引开关确实是开**——按 5.4 第 22 条，这一步应该在部署验证时就已经翻开，
    这里是复核不是第一次翻：正式域名的 HTML 不再输出 `noindex`，`robots.txt` 不再 `Disallow: /`；
    `curl` 正式域名首页与一个内页核实。如果发现还没翻开，立刻翻开——批 B 没接完、
    还在验收都不是继续关着的理由，理由见 5.4 第 22 条。
    **同时核对 Cloudflare AI 爬虫放行**：Bot Management 四字段均为 `disabled`，托管 robots.txt 无 AI 禁止指令，并用 `ai-crawler-access.mjs` 逐 UA 检查首页、内页、robots.txt、llms.txt；判据见 [`checklists.md`](../checklists.md) 段 5，做法见 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.5、§8.7。
28. **重跑段 4 闸门 1、2、4**，并按 D1 比对正式首页与代表内页的 SSR、水合及真实 SPA 切页 head，排除第二条冲突 robots，复核 preview 仍封锁：确认 robots 类「设计」项转绿、canonical 指向正式域名、`is-agentic` 分数不低于预览域基线。
29. **GSC 与 Bing 各提交（或复核）sitemap**，**记的是快照日期不是实时值**。
    域名有「前世」（5.2 第 10 条）时，**这是放开索引后的第一件事**——
    把搜索引擎对该域名的旧记忆（停放页、旧站）尽快覆盖掉。
    **默认不对任何 URL（含首页）手工走 GSC「网址检查 → 请求编入索引」**：sitemap 已经是标准的
    「通知有新内容」机制，收录进度默认看 sitemap 报告与覆盖率，不逐页催收录，理由见
    [`search-platforms.md`](../search-platforms.md)「GSC 默认只提交 sitemap，请求编入索引是可选
    加速工具」。域名有前世、急需覆盖旧记忆时，用 `scripts/gsc-request-indexing.mjs` 一条命令
    跑（受配额限制、自动断点续跑），**不要 agent 手工逐页点击**。
    Bing 侧不受影响，仍可视需要用「URL 提交」（不同平台，流程不变）。
30. 按 [IndexNow 操作](../search-platforms.md#12-indexnow) 完成首次推送与上线后 sitemap 收尾。
31. 按同一入口接好每条实际部署路径；Workers Builds 部署命令同样要带 IndexNow，完成实际配置与日志回读。
32. 在正式域名上补段 4 闸门 6 的现场那一半：正式域名有流量后重开 pagespeed.web.dev 读 CrUX；仍无数据照旧记「现场无数据」。

### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| A1 | 先接了**不需要第三方账号**的那一个（Cloudflare Web Analytics），没有一上来就等 GA 授权；且是在**预览域**上接好并验证的 | `.rankup/integrations.md` |
| A2 | beacon 注入方式按运行时选过，**没有默认用自动注入**；线上原始 HTML 里 grep 得到 beacon | 线上原始 HTML |
| A3 | 分析 beacon 的站点 token 按公开值处理（可进源码）；**没有把它当密钥藏进 secret，也没有把真密钥当公开值** | `.rankup/secrets.md` |
| A4 | GA4 与 Clarity 各有一条资源 ID 记录，且已与账号下名字相近的其它资源比对过 | `.rankup/integrations.md` |
| A5 | 验收能分开「装对了但没人来」与「装错了会漏数据」，两者各有独立判据 | 同上 |
| A6 | 不同工具的数字差一个数量级时，已归因到同意门槛差异，**没有当成某一方的 bug 去排查** | `.rankup/baseline.md` |
| A7 | 读到空白页时先怀疑登录态失效，**没有把空白当成「这个功能不存在」或零数据** | 本轮 journal |
| H8 | 每个候选域名四项都查了：官方 `gefei-domain` 的域名历史工具、Wayback、外链画像、`site:` 与品牌名搜索，各有一条带日期的证据 | `.rankup/decisions.md` |
| H9 | 命中成人/赌博/药/被惩罚/垃圾外链任一项的域名已否决并记证据；**没有「外链多但先用着」** | `.rankup/decisions.md` |
| H10 | 通过裁决且有前世的域名标了 `has_history: true` | `.rankup/decisions.md` |
| D11 | zone 已加进 Cloudflare 并读回 NS 对。**域名购买不在这一步**，没有代买 | `.rankup/infrastructure.md` |
| D12 | 换 NS 之前 DNSSEC 已关且 `whois` 复查到 `unsigned`；zone active 后已用 Cloudflare 的 DS 重新启用 | `whois` 输出 |
| D13 | NS 值已明确交给用户（写进对话或 `infrastructure.md`）；**没有代替用户去注册商改 NS** | `.rankup/infrastructure.md` |
| D14 | 用真实解析核验过（`whois` NS 或 zone 从 `pending` 变 `active`）；**「已经告诉用户」不作为生效证据** | 命令输出 |
| D15 | 四个入口（裸域/www × http/https）收敛到同一规范域，每跳 301 且不超过一跳 | `curl -sIL` 输出 |
| D16 | 域名留位常量已换成正式域名，**全仓库 grep 预览域字面量为零** | grep 输出 |
| P17 | 部署前把精确 SHA、目标环境、bindings、待执行迁移、域名、回滚点六项写下来了，不是发完再回忆 | `.rankup/releases.md` |
| P18 | 迁移与依赖检查在部署**之前**完成，顺序没有反 | 命令输出 |
| P19 | 从**真实域名**验证过 SSR HTML、静态资源、API、D1、R2 读写、鉴权、支付回调（适用项，live 凭证） | `.rankup/releases.md` |
| P19a | 绑定正式域名后、上线验收前，基础安全按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.8 主动检查并补齐适用项；判据复用 `checklists.md` 段 5「基础安全按用途核验」 | `.rankup/audit.md` + `.rankup/infrastructure.md` |
| P20 | 对缓存/传播延迟做的是**有界**重试，并用版本标识、响应头或实际内容确认服务的是新版本 | `.rankup/releases.md` |
| P21 | 日志与错误率看过；部署标识、时间、验证证据、回滚命令四样都记了 | `.rankup/releases.md` |
| P22 | 正式域名验证通过后索引开关已随之翻开，**没有**为了等批 B 接完而刻意继续 `noindex` / `Disallow: /`；确需暂缓公开的走 Access/Basic Auth 或单页 noindex，不是全站屏蔽 | `curl` 输出 + journal 时间顺序 |
| B23 | 搜索平台优先建的是**网域（DNS 验证）**资源而不是网址前缀 | `.rankup/integrations.md` |
| B24 | DNS 服务商的 OAuth 授权**由用户自己点**，没有代劳；Bing 没有走「从 GSC 导入」 | 同上 |
| B25 | IndexNow 判据统一见 [`checklists.md` 段 5 的 IndexNow 行](../checklists.md)；站长工具操作见 [搜索平台接入](../search-platforms.md) | 同上 |
| B26 | `hello@<domain>` 转发规则存在且收过测试邮件，三处地址一致；SPF / DKIM / DMARC 按 §8.6 核查，拒收/隔离策略已生效，外发认证通过或有依据标不适用；仅 `p=none` 不算已防护 | 线上 HTML + CLI/API 规则回读 + 权威/公共 DNS + `.rankup/integrations.md` |
| B27 | 批 B 清单**每一行**都有状态（✅ 证据+日期 / ⏸ 阻塞原因 / ❌ 裁决依据），含 Ahrefs Site Audit 与兜底行；**兜底行按段 2 的市场填了具体平台或写明「该市场无额外引擎」** | `.rankup/integrations.md` |
| I28 | 复核索引开关确实是开（应在 P22 已翻开，这里是复核），正式域名首页与内页 `curl` 无 `noindex`、robots 无 `Disallow: /` | `curl` 输出 |
| I29 | 复核后重跑了段 4 闸门 1、2、4，「设计」项已转绿，canonical 指向正式域名 | `.rankup/audit.md` |
| I30 | 索引放开后 GSC + Bing 已（重新）提交 sitemap 并记快照日期；有前世的域名这是放开索引后**第一件事**；默认不逐 URL/首页走 GSC 请求编入索引（需要催收录用 `gsc-request-indexing.mjs`） | `.rankup/integrations.md` |
| I31 | 按 [IndexNow 操作](../search-platforms.md#12-indexnow) 回读实际部署路径；判据同 B25 指针 | 项目仓库 + 触发器配置/构建日志 |
| I32 | 正式域名上补了闸门 6 的现场读数，或如实记「现场无数据（流量不足）」 | `.rankup/baseline.md` |

### 输出

- 已发布的线上版本，正式域名可访问且已放开索引。
- `.rankup/decisions.md`（域名黑历史裁决与证据）
- `.rankup/infrastructure.md`（含域名/zone/NS/DNSSEC 状态：已生效 / 待用户改 NS / 待传播）
- `.rankup/releases.md`
- **批 A 与批 B 每一行的状态逐条写进 `.rankup/integrations.md`**：已接入 / 卡住（附阻塞原因与需要用户做什么），并附各自的资源 ID。
- IndexNow 配置与推送证据（按 [搜索平台操作](../search-platforms.md#12-indexnow) 写入接入表）；
  两边站长工具的 sitemap 已提交，**并记下它是快照日期而不是实时值**。
- 索引放开后 GSC + Bing 重新提交 sitemap 的记录（快照日期）。
- `.rankup/audit.md`、`.rankup/baseline.md`、`.rankup/journal/<date>.md`

### 完成门禁

批 A 三个分析通道在预览域接好且至少一个的 beacon 能在**线上原始 HTML** 中被 grep 到——
但 grep 只证明代码在，不证明延迟加载器真的按设计触发；四个延迟加载的分析脚本
（GA4/Clarity/Ahrefs WA/CF WA）是否真的加载，跑 `scripts/analytics-beacon-check.mjs
<预览域 URL> --both` 分别验证「不交互等 6s 兜底」与「首次交互立即触发」两种场景；
候选域名四项黑历史证据齐全且无一命中否决条件；zone 状态与 NS 传播已用真实解析结果核验，DNSSEC 先关后开，
四入口 301 一跳收敛，不是仅凭「已告知用户」结项；
目标部署可通过 Cloudflare 部署状态关联到预期提交，真实域名返回预期 SSR HTML，关键 API 和实际 bindings 正常，上传、鉴权及适用的支付回调已用 live 凭证验证，回滚目标和方法已记录——仅有构建成功、Worker upload 成功或健康页 `200` 不算完成；
批 B 清单每一行（含 Ahrefs Site Audit 与兜底行）都有状态，搜索平台资源**记的是资源 ID 不是资源名字**——网域资源覆盖全部子域，用错父级资源时单条 URL 的操作照样成功，只有聚合数字是别的站的，全程零报错；
IndexNow 门禁见 [`checklists.md` 段 5 的 IndexNow 行](../checklists.md)；`hello@<domain>` 可收信且三处一致，邮件防冒充按 §8.6 验证生效；
索引已放开、段 4 闸门 1/2/4 复核通过、索引放开后已重新提交 sitemap（GSC/Bing）。控制台显示"已启用"不算完成。

### 交给下一段的

| 交给下一段的 | 下一段会怎么用它 | 如果这项缺失会怎样 |
|---|---|---|
| 已放开索引、可访问的正式域名 | 段 6 的外链全部指向它；段 7 的监控读数从它来 | 外链指向预览域或 `noindex` 页面，权重全部浪费 |
| `.rankup/integrations.md`：批 A/B 每个平台的资源 ID 与同意门槛所在的一侧 | 段 7 读转化和流量数据时，知道数字来自门槛哪一侧、读的是哪个资源 | 读到偏低的数字直接下「没人用」的结论，方向性判断错误（见 5.1 第 6 条的实测数字） |
| `.rankup/releases.md`：部署标识与回滚点 | 段 7 排查线上异常时，把问题定位到具体版本而非笼统的「最近改动」 | 出现回归时无法快速判断是哪次发布引入的，回滚也没有明确目标版本 |
| `hello@<domain>` | 段 6 的目录提交与外链联络用它 | 用个人邮箱联络，外链站主怀疑你不是站主 |


发布内容后回读线上 sitemap，运行 `node <rankup-skill-dir>/scripts/sitemap-lastmod-check.mjs <域名>`，对照修改页的日期；用 `webmaster-sitemap.mjs` 向 GSC 与 Bing 重提 sitemap，并通过 `indexnow-submit.mjs` 推送改动页。日期实现见 [段 4](stage-4-prelaunch.md#sitemap-的内容日期)。
