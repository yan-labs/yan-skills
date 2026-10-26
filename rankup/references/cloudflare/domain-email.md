# Cloudflare · 接入域名与品牌邮箱

> 本文件从 [`cloudflare-stack.md`](../cloudflare-stack.md) 拆出（2026-09-30），含原 §8.5、§8.6 两节。节号保持不变，文字里的「§8.5」「§8.6」指针指这里。

## 8.4 买域名：Spaceship 官方优惠码

买域名默认在 Spaceship；加购物车前先对照下表，由用户在购物车里填码并结账（我们只加购并回读，不结账，见 `scripts/spaceship-cart.mjs`）。

| 后缀 | 优惠码 | 首年价（美元） |
|---|---|---|
| .com | COMPROS | 2.70 |
| .com | COM67 | 5.67 |
| .xyz | XYZ52 | 0.75 |
| .net | NET19 | 10.24 |
| .io | IO85 | 14.98 |
| .top | SPSR86 | 0.98 |

来源：群友转述的 Spaceship 官方活动（2026-10-26），未逐码实测、可能限时限量；加购后在购物车回读折扣是否生效，不生效就按原价并记下。同一后缀有多个码时先试价更低的。只对首年有效，续费按原价，选词时把续费价算进去。

## 8.5 接入域名：把 zone 加进 Cloudflare

**域名接入在生命周期的段 5，不在建站之初。** 开发与上线前体检全部在预览域
（`workers.dev` 或预览 URL，`noindex`）上完成，域名只是代码里的一处配置留位；
等 [`lifecycle/stage-5-launch.md`](../lifecycle/stage-5-launch.md) 段 5 的黑历史裁决通过、域名定稿之后，绑正式域名的第一步才是
**让 Cloudflare 接管这个域名**（zone onboarding）。
部署到 `workers.dev` 不需要 zone；只有配置了 custom domain / routes 的 `wrangler deploy`
会因为找不到 zone 而失败，custom domain 也无从绑定。

**Wrangler 没有 zone 命令；`cf` 有 `zones list/create`。** 实测 Wrangler 命令面覆盖 Workers / Pages / KV / R2 / D1 /
Queues / AI / Containers / secret / email，**没有任何创建或列出 zone 的子命令**——
zone 属于账号层资源，不在 Wrangler 职责内。已登录 `cf` 时，先按 `/cf-cli` 运行只读查询、核对 `cf zones create --help` 与 `cf schema zones create`，再决定是否创建；zone 创建成功仍只是 pending，必须回读 NS 与激活状态。现有 `cf-zone-setup.mjs` 是已验证的端到端脚本，重复站点接入优先复用它，不能因 `cf` 新增命令就跳过脚本里的 DNSSEC、重定向与验收步骤。

### cf 未认证或命令未覆盖时的两条路径

**路径 A（优先）：操作用户自己的浏览器。**
Cloudflare 后台是登录态页面，按本 Skill 的浏览器规则，必须驱动**用户本机那个真实的、
已登录的浏览器**，不得使用运行环境自带的沙箱浏览器（沙箱没有用户会话，只会看到登录页）。
流程：打开 Cloudflare 控制台 → Add a domain → 输入域名 → 选择方案 → 读回分配到的
nameserver 对 → 把这对 NS 交给用户。

这条路的优势不只是省事：**全程不涉及任何凭据**。它只是代替用户点了几下网页，
没有任何 token 被创建、传输或落盘，因此不产生新的泄露面。

**路径 B（退路）：用户已有 API 凭据时，走脚本。**
浏览器不可用时（扩展未连接、用户机器网络受限、无图形界面），用
`scripts/cf-zone-setup.mjs`。让**用户自己**把凭据写进项目根的 `.cf-token`
（该文件必须先加入 `.gitignore`），或导出为环境变量；脚本自行读取，
凭据值不经过对话、不进日志、不落提交。

```bash
node <rankup-skill-dir>/scripts/cf-zone-setup.mjs status <domain>   # 先只读探测
node <rankup-skill-dir>/scripts/cf-zone-setup.mjs create <domain>   # 建 zone 并读回 NS
```

**先跑 `status`**：它是只读的，既能验证凭据有效，又能发现 zone 其实已经存在
（重复创建会报错，而错误信息不会告诉你"其实已经有了"）。

### 凭据选型：这里的默认答案是 scoped token

创建 zone 需要 **`Zone > Zone > Edit`，且资源范围必须是 All zones**。
zone 尚不存在，所以 zone-scoped 的 token 建不了它——这是官方文档明确写死的约束，
不是可以绕的配置问题。

**永远优先 scoped API Token，不要用 Global API Key。** 两者在使用现场都只是一串字符，
但风险差着数量级：Global Key 不能限定 scope、资源或 IP，等同账号完全控制权
（所有 zone、所有 Worker、DNS、账单），且无法按用途回收；scoped token 可以窄到
"只允许改 zone 配置"，即使泄露，可造成的最大伤害也被框死。

两者的 HTTP 认证方式还不同，认错会得到一个**极具误导性的错误**：

| 凭据 | 长度 | header |
|---|---|---|
| API Token | 40 字符 | `Authorization: Bearer <token>` |
| Global API Key | 37 位十六进制 | `X-Auth-Email` + `X-Auth-Key`（必须带账号邮箱） |

把 Global Key 当 Bearer 发出去，返回的是 `400 / 6003 Invalid request headers`。
这条错误看起来像"请求头写错了"，会把排查引向请求构造，**而真实成因是凭据类型不匹配**。
判据：先按长度判别凭据形态，再选 header。

### 换 NS 之前必须先关 DNSSEC

**注册商默认签名已是常态**——新注册的域名可能立刻就是 `DNSSEC: signedDelegation`。
带着旧的 DS 记录把 NS 指向新服务商，验证型 resolver 会 SERVFAIL，**域名整个打不开**，
而症状伪装成"NS 还没生效，再等等"，排查方向完全错，代价是白等一天。

顺序不可颠倒：

1. 注册商后台关闭 DNSSEC；
2. `whois -h <注册局 whois 主机> <domain>` 复查到 `DNSSEC: unsigned` 才继续；
3. 在 Cloudflare 建 zone、取得 NS 对；
4. 注册商侧 **整体替换** NS（删掉原有的，不是追加——混合 NS 会解析错乱）；
5. 等 zone 变为 active；
6. 用 Cloudflare 提供的 DS 记录重新启用 DNSSEC。

Spaceship 注册的域名可用官方 API 操作，免去逐站手改 NS：
`scripts/spaceship-api.mjs get <domain>` 只读核对；
`scripts/spaceship-api.mjs set-ns <domain> <Cloudflare NS1> <Cloudflare NS2>` 整体替换并跳过已一致的配置。
先按上面步骤关闭旧 DNSSEC、确认注册局 DS 已消失，再执行 `set-ns`。
脚本从 macOS 钥匙串读取 `rankup.spaceship.api-key` 与 `rankup.spaceship.api-secret`
（账户默认取当前登录用户名；需要时用环境变量 `SPACESHIP_KEYCHAIN_ACCOUNT` 覆盖为现有钥匙串条目的账户名），不会把凭据放到命令参数、项目文件或日志里。
通用官方端点可用 `scripts/spaceship-api.mjs request GET /domains/<domain>`；
写入请求的 JSON 从标准输入读取，其他操作的路径与参数按[Spaceship 官方 API](https://docs.spaceship.dev/)核对。
Spaceship 另有[官方远程 MCP](https://www.spaceship.com/en-GB/knowledgebase/spaceship-mcp/)（`https://mcp.spaceship.com/mcp`，OAuth 授权，含 `domain_set_nameservers`）；目前官方仅验证 Claude 客户端，其他 MCP 客户端需实际连接验收。

**NS 对是按 zone 分配的**，加站点之后才知道是哪一对，无法预先告知或猜测；
换一个域名就是另一对，不可套用上一个项目的值。

### 判定域名状态只看注册局 whois

不要用本机 `dig` 判断域名是否被占用或 NS 是否已切换：解析器或 VPN 可能返回劫持应答
（例如落在 `198.18.0.0/15` 基准测试保留段的地址），看起来像一条正常记录。
**权威来源是注册局 whois**，且每批查询都应带正对照（一个确定已注册的域名）与
负对照（一个随机串），否则无法把"查不到"与"查询链路故障"区分开。

### 一个会误判成"Cloudflare 打不开"的现象

若用户机器无法访问某个身份提供商（例如 OAuth 跳转的域被网络阻断），
Cloudflare 后台点"用该身份登录"会失败，表现为**控制台整个打不开**。
此时应分别探测身份提供商与 Cloudflare 各自的可达性，而不是断定 Cloudflare 不可用——
改用邮箱密码登录通常即可解决。

### www / http 收敛

「从 WWW 重定向到根」这类 Single Redirects 模板默认只匹配 `https://www.*`，
`http://www` 入口会先被「Always Use HTTPS」接走再撞规则，多跳一次而不是一跳到位。
**结论**：改成按主机名匹配（不含协议）+ `concat` 拼目标 URL，不要靠关闭
「Always Use HTTPS」解决——判据与具体规则写法见
[`seo-box.md`](../seo-box.md)「二 · 重定向链：要能力，不要那个网站」。

### 域名绑定到 Workers（全 API，零界面操作）

**目标**：以后用户只需要说"域名买完了"并给出域名，就能自动走完 zone 接入
→ Workers 自定义域名绑定 → 环境变量 → 索引放开的全流程，只把分配到的 NS
地址返回给用户去注册商那边改，不需要用户或 Claude 再点任何 Cloudflare 控制台
页面。这条是上面"路径 B 脚本"和"§9.1 Workers Builds API"两段经验在**域名接入
这一步**的延伸整合，记录一次完整实测串联起来的顺序，供以后直接照抄。

**前提**：
- 凭据（scoped API Token 或 Global API Key，选型判据见上文「凭据选型」）已就绪，
  `wrangler whoami` 能成功返回 Account ID。
- 目标 Worker 已通过 Workers Builds 部署（push `main` 自动构建，见 §9.1）。

**触发**：用户说"域名买完了""帮我绑域名""这个域名绑一下"并给出域名名称。

**流程（按顺序执行）**：

1. **添加 zone**：`POST /zones`，`account.id` 填目标账号，`type: full`。
   响应的 `result.id` 是 zone_id；`result.name_servers` 是唯一要回传给用户的东西；
   `result.original_registrar` 能看出域名在哪个注册商——流程不依赖具体注册商，
   只要用户能进去改 NS 就行。这一步也可以直接用已有的 `scripts/cf-zone-setup.mjs
   create <domain>`，两者等价，脚本内部同样是这个端点。

   **随即显式关闭 AI 爬虫拦截**：先 `GET /zones/{zone_id}/bot_management` 记录现值，再以具备 Bot Management 编辑权限的凭据调用 `PUT /zones/{zone_id}/bot_management`，将 `ai_bots_protection`、`ai_training`、`ai_search`、`ai_user` 全部设为 `disabled`；回读四个字段。正式域名可访问后再用 [`ai-crawler-access.mjs`](../../scripts/ai-crawler-access.mjs) 逐 UA 实测，不能只看 robots.txt。【实测 2026-09-28】

2. **绑定 Workers 自定义域名**（裸域 + `www` 各一条）：`PUT
   /accounts/{account_id}/workers/domains`，请求体为
   `{"hostname": "<domain 或 www.<domain>>", "zone_id": "<zone_id>", "service":
   "<worker-name>", "environment": "production"}`。Cloudflare 自动签发证书
   （响应带 `cert_id`），不需要手动去 SSL/TLS 页面等待。
   **端点必须是 `/accounts/{account_id}/workers/domains`（单条 PUT，一次绑一个
   hostname），不是 `/workers/scripts/{name}/domains`**——后者不存在，会报
   parse error，是本次实测踩到的第一个坑。

3. **设置 `SITE_URL` 环境变量**：不要用 Workers 的 `PUT .../settings` API 改——
   那个端点要求 `Content-Type: multipart/form-data`，不接受 JSON，比直接改配置
   麻烦。改在项目的 `wrangler.jsonc`（通常在 `apps/<site>/wrangler.jsonc`）的
   `vars` 里写 `"SITE_URL": "https://<domain>"`，提交推送 `main`，Workers Builds
   自动重新部署（见 §9.1）。

4. **把 NS 地址交给用户**：取步骤 1 响应里的 `result.name_servers`（一对），
   按上文「换 NS 之前必须先关 DNSSEC」的顺序提醒用户——先关注册商侧 DNSSEC，
   再整体替换 NS（不是追加），而不是直接甩两个地址过去让用户自己踩坑。

5. **等 NS 生效**：判定方式见上文「判定域名状态只看注册局 whois」，不要用本机
   `dig` 下结论；也可以轮询 `GET /zones/<zone_id>`，看 `status` 从 `pending`
   变成 `active`。通常几分钟到 24 小时不等，不要在这一步空等或反复轮询占用前台。

6. **NS 生效、正式域名验证通过后立刻放开索引**：在 `wrangler.jsonc` 的 `vars` 里加
   `"ALLOW_INDEX": "true"`，提交推送，走 Workers Builds 自动重新部署。
   同样不必走 Workers settings API——直接改配置文件更省事，理由同步骤 3。
   **不要等 GSC/Bing/IndexNow 这批站长工具接完再放开**——那是分析与站长工具接入，
   跟正式域名能不能被抓取无关，拿它当索引闸门只会平白拖长正式域名带着 `noindex`
   公开可访问的窗口，见 [`lifecycle/stage-5-launch.md`](../lifecycle/stage-5-launch.md) 段 5.4 第 22 条的真实教训。

7. **协议/host 收敛到规范 URL**：zone 没开 Always Use HTTPS、`www` 子域也没收敛到
   裸域（或反过来），会让 http / http-www / https-www 三种非规范协议+host 组合
   都能直接 200 访问到内容——这是一批表面上互不相干的问题（Ahrefs 之类的第二双
   眼睛报出的重复内容、多个 sitemap 出现同一批 URL、内链走了非规范 host）背后
   共同的根因，属于建站接入环节本应一次做好的 Day-1 类项，晚做的返工成本明显
   更高。用 `scripts/cf-zone-setup.mjs` 的 `check-redirects`/`apply-redirects`
   子命令：

   ```bash
   node <rankup-skill-dir>/scripts/cf-zone-setup.mjs check-redirects <domain>
   node <rankup-skill-dir>/scripts/cf-zone-setup.mjs apply-redirects <domain> --to apex
   ```

   `--to apex` 把 `www.<domain>` 收敛到裸域，`--to www` 收敛到 `www` 子域，二选一
   必填、没有默认值——方向是意图声明，不能靠猜。两个已验证的坑（2026-09-13）：
   - `target_url` 的 `expression` **不支持 `if()`**，wirefilter 表达式语法会报
     `unknown identifier`——查询串保留与否交给同级的 `preserve_query_string`
     参数处理，不要在 expression 里手写判空逻辑。
   - **不要套用 Cloudflare 控制台自带的「从 WWW 重定向到根」模板规则**：它硬编码
     匹配 `https://www.*`（要求协议已经是 https），来源若是 `http://www.*` 会先
     被 Always Use HTTPS 接走升级协议、再撞上这条规则，变成两跳而不是一跳。手写
     规则按 `http.host`（不含协议前缀）匹配，不管来源协议是 http 还是 https 都
     一次性跳到位，这是刻意的设计，不是疏漏。

**这一条经验补充的坑，前两段没写全的部分**：
- Workers Custom Domains 的正确端点是账号级的 `/accounts/{account_id}/
  workers/domains`，裸域和 `www` 子域名各发一次请求，不是一次调用绑两个 host。
- 环境变量（`SITE_URL`、`ALLOW_INDEX`）走 `wrangler.jsonc` 而不是 Workers
  settings API，是因为后者的 `multipart/form-data` 要求在纯脚本化流程里明显
  更麻烦，不是这个 API 做不到。
- 域名在哪个注册商买的不影响这条流程，只要用户能进去改 NS 就行。

**实测验证**：2026-09-11，两个域名分别绑定到各自的 Workers 项目，从 zone
创建到自定义域名生效、环境变量部署，全流程走 API 完成，全程零界面操作；
协议/host 收敛（步骤 7，`check-redirects`/`apply-redirects`）：2026-09-13
在真实账号上验证通过。

## 8.6 品牌邮箱：Cloudflare Email Routing

域名在 Cloudflare 上之后，用 **Email Routing** 给站点加一个官方邮箱（如 `hello@<domain>`），
零成本把收到的邮件转发到个人邮箱。先用 `wrangler --version` 和 `wrangler email routing --help`
核验本机支持的命令与参数；支持则优先 CLI，不支持则直接用官方 API，不要求打开控制台。

```bash
wrangler email routing settings <domain>          # 查看状态
wrangler email routing enable <domain>            # 启用（自动配 MX/SPF/DKIM）
wrangler email routing addresses list             # 已验证的目标地址
wrangler email routing addresses create <email>   # 注册目标（首次需点确认链接）
wrangler email routing rules create <domain> \    # 创建转发规则
  --match-type literal --match-field to \
  --match-value "hello@<domain>" \
  --action-type forward --action-value "<email>"
wrangler email routing rules list <domain>        # 验证规则
wrangler email routing dns get <domain>           # 验证 DNS 记录
```

**路径 B：Cloudflare API。** CLI 不支持或认证不可用时直接使用官方 REST API；
按操作核验 Email Routing 或 DNS 编辑权限。凭据只从环境变量或安全存储读入进程内的认证头，
不得打印、落入报告或放进命令实参；不要复制带明文认证头的 curl 命令。

| 操作 | API 路径（基址 `https://api.cloudflare.com/client/v4`） |
|---|---|
| 启用 Email Routing（先核验所需 DNS 与现有收件配置不冲突） | `POST /zones/{zone_id}/email/routing/enable` |
| 查看状态 | `GET /zones/{zone_id}/email/routing` |
| 列出转发规则 | `GET /zones/{zone_id}/email/routing/rules` |

**实测陷阱**：Dashboard 上 Email Routing 的「启用/禁用」开关有时点击无响应——
routing 显示「已禁用」但 DNS 记录和规则都在。此时 API `POST .../enable`
能立刻把 `enabled` 翻成 `true`、`status` 变为 `ready`。
如果 Dashboard 开关不动，别反复点——直接走 API。【实测 2026-09-03】

**冲突风险**：`enable` 会写入 Cloudflare 自己的 MX 记录。如果域名已有 MX
（Google Workspace / Zoho 等），启用前先确认不会抢走现有邮箱的收件。

**只管收件**：Email Routing 只做转发，不提供发件能力。发信用下面的 Cloudflare Email Sending；验证码、改密、完成通知、回复来信都走它，**不再接 Resend 等第三方发信服务**（2026-10-08 起）。

### 发信：Cloudflare Email Sending（2026-10-08 实测）
- 状态 beta；需要 Workers Paid（账户已是），含每月 3000 封（全账户所有站共用），超出 $0.35/千封；发给已验证的目的地址免费。域名须用 Cloudflare DNS。
- **开通（一条 API，不用进面板）**：`POST /zones/<zone>/email/sending/subdomains`，body `{"name":"<域名或子域名>"}`。会自动加 `cf-bounce.<name>` 的 MX、SPF、DKIM，以及缺失时的 `_dmarc`（`p=reject`），不改原有记录。站点验证码沿用 `login@mail.<域名>` 就开通 `mail.<域名>`；人工回信用 `hello@<域名>` 就开通根域。先拍 DNS 快照再开通，回读新增记录。
- **新开通域名要等约 1 分钟**才能发，之前会返回 `sending_disabled`（code 10203），不是权限问题，等一下重试。
- **站点代码**：wrangler 加 `"send_email": [{ "name": "EMAIL" }]`，代码 `env.EMAIL.send({ from: {email,name}, to, subject, text, html, replyTo })`，不需要任何 secret；无幂等键，重复发送靠自己的发码/通知表去重。模板见 saas-template。
- **脚本/人工发信（REST）**：`POST /accounts/<account>/email/sending/send`，字段 `to, from(字符串或{address,name}), reply_to, subject, text, html`；返回 `delivered/queued/permanent_bounces`，`queued` 不等于已送达，要回读。
- **回信流程（读者/来信回复）**：①Gmail 读来信并核实事实；②做完网站改动并上线、回读页面；③用官方 `hello@<域名>` 从 REST 发感谢信（`reply_to` 设为 hello@，回信会经 Email Routing 回到收件箱）；④公开署名、转载等要先问对方同意，未获同意一律匿名。不要用个人 Gmail 回，容易被对方过滤，也不是官方身份。
- 上线验收：真实触发一次验证码并在收件箱回读；有 Turnstile 的入口需真人在浏览器里登录一次；确认可用后再删旧的 `RESEND_API_KEY` secret，并在项目 `.rankup/integrations.md` 记录发信域名与验收时间。

### 邮件防冒充：与收信一起验收

新建或绑定域名、接入 `hello@`、上线验收及现站 `rankup review` 时，**主动核查 SPF、DKIM、DMARC 并补齐可确认的缺口**；收信成功不能代替防冒充验收。先读现有 DNS、代码与发送服务配置，区分只收信、实际外发及用途未知，并核对独立发信子域及其 DMARC 策略。

- **只收信**须有证据或用户确认：核对没有会受父域策略影响的发信子域后，可在 `_dmarc.<domain>` 添加 TXT：`v=DMARC1; p=reject; sp=reject; adkim=r; aspf=r`。已有独立发信子域先验证其认证与策略，不能直接套 `sp=reject`。保留 Cloudflare Routing 所需 MX / SPF / DKIM，不为套用「不发信」模板而改坏转发记录。
- **有外发**：盘点验证码、通知、营销、人工回复等实际发送服务；逐个验证 SPF / DKIM 及与可见 From 的 DMARC 对齐，再启用 `quarantine` / `reject`。`p=none` 只是观察，不能标记已防护；只收信无需虚构外发 DKIM 测试。
- **用途未知**：继续只读核验及其他可完成工作，仅阻塞拒收/隔离策略变更，不得默认为只收信。

通用 DNS TXT 使用 [Cloudflare DNS Records API](https://developers.cloudflare.com/api/resources/dns/subresources/records/methods/create/)；先读后写，不创建重复 DMARC、不覆盖其他 TXT、不降级现有策略：

| 操作 | API 路径（同上基址） |
|---|---|
| 查询目标记录 | `GET /zones/{zone_id}/dns_records?type=TXT&name=_dmarc.<domain>` |
| 仅在缺失时新增 | `POST /zones/{zone_id}/dns_records`，正文含 `type: "TXT"`、`name: "_dmarc.<domain>"`、已确定的 `content`、`ttl: 1` |
| 已存在且确需调整 | `PATCH /zones/{zone_id}/dns_records/{dns_record_id}`，精确使用查询所得 ID，仅修改需要的字段 |

写入后 API 回读，并查询权威 DNS 与公共递归 DNS，确认唯一有效 DMARC 及策略内容一致；DNS 未生效时只能记待验证，不能报完成。在项目 `.rankup/integrations.md` 记录用途依据、变更前后、记录 ID、验证时间和回滚方法（恢复旧值；本次新增则删除该精确 ID），不保存凭据。收信测试与实际外发邮件头的 SPF / DKIM / DMARC 认证测试分开记录；无外发时后者标不适用，不主动发送未经授权的测试邮件。

策略含义与配置参考：[Cloudflare 邮件安全记录](https://developers.cloudflare.com/dmarc-management/security-records/)。

**地址只有一个约定：`hello@<domain>`**，不用 `contact@` / `admin@` / `info@`。
详见 [`lifecycle/stage-5-launch.md`](../lifecycle/stage-5-launch.md) 段 5 批 B 第 26 条的完整操作指南与注意事项。

