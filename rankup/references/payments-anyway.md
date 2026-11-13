# Anyway 支付接入（2026-09-29 核对）

## 选型

Anyway 官方将 Business 定义为 Merchant of Record（MoR）：对其覆盖的交易计算、收取和申报适用的 sales tax / VAT / GST，并提供支付链接、托管结账、订单与净额结算。[Anyway Business](https://anyway.sh/)（2026-09-29 访问）。直接使用 Stripe Payments 时，商家仍是销售主体；税务处理须按自己的模式配置。[Anyway 的 MoR 与支付处理商对比](https://anyway.sh/blog/merchant-of-record-vs-payment-processor)（2026-09-29 访问）。

- 需要服务商承担其覆盖交易的间接税处理、接受跳转式托管结账时，可评估 Anyway。商户审核、覆盖地区、付款方式及结算资格应按目标账户当前状态核验。
- 需要自己管理销售主体与支付流程时，可评估 Stripe 直连；PayPal 仍是另一可选通道，见 [`monetization.md`](monetization.md)。
- 【猜测】将 Anyway 作为独立备份，可能降低单一支付账户故障对收入的影响；两个通道是否真正独立，须用账户审核、目标地区付款及结算结果验证。

[Merchant API 订单读取文档](https://docs.anyway.sh/fetch-order-361860806e0)列出 `GET /v1/orders/{orderId}`；同站 [Webhook 文档](https://docs.anyway.sh/webhooks-7536990m0)描述支付事件。下述后台 UI、JWT 和 webhook 签名形状来自 2026-09-07 的单次 stg 实测，接入时仍要对照当前后台和真实样本，不能把旧观察当所有环境的保证。该实测的支付链接跳往 Stripe 托管结账页。

## 硬规则：支付链接域名与上线实测（2026-10-06 hotellobby 事故）

- **支付页域名按环境不同**：stg 是 `https://stg.anyway.sh/pay/<linkId>`，**生产是 `https://app.anyway.sh/pay/<linkId>`**。`https://anyway.sh/pay/<linkId>`（以及 `www.anyway.sh` 跳过去的同一地址）在生产一律返回 404「Page not found」，哪怕商品和链接都存在。hotellobby 因为把生产链接写成 `anyway.sh/pay/…`，用户点"支付"全部落到 404；stg 预览用 `stg.anyway.sh` 是对的，所以预览测试漏掉了它。
- **不要凭记忆或照 stg 改域名拼链接**：Merchant API 的 `paymentLinkUrl` 恒为空，也没有现成完整 URL 字段。用 `node scripts/anyway/anyway.mjs --env prod products links <productId>`，它按环境拼出 `payUrl` 并实际请求，`check` 列必须是 `OK 200`，出现 `FAIL` 就不许写进项目。商品和链接 ID 以该命令输出为准，不手抄。
- **生产切换前必须逐条实测每个生产链接**：对项目里写死的每一条生产支付链接，带上 `?merchant_reference=<任意值>` 请求，要求 HTTP 200 且页面标题不是 `Page not found`。不是只看商品 PUBLISHED / 链接 isActive。
- **项目侧验收必须从用户视角点一次**：线上页面点"支付"按钮，确认跳到的是 Stripe 托管结账页，而不是 Anyway 的 404。只测 stg 预览、只看 API 里链接存在、只看构建通过，都不算支付可用。
- **改价与标价规则（2026-11-13 【用户定+实测】）**：Anyway 后台不能改已有商品价格，改价必须建新商品，旧商品保留给历史订单验单和订阅续费（不删除/不切断兑现路径）；价格尾数不用 9，改成不整齐的精确数字（如 6.83、19.87、189.46），新价不高于原价且不跨整数档；改价后必须逐个打开结账页校验实际显示金额。

## 接入顺序

1. 申请商户并完成审核，核对目标地区、币种与支付方式。
2. 在 stg 后台建商品和支付链接，记录项目侧配置。`create-product.mjs` 提交表单会创建商品，先核对参数；生产切换另作发布。
3. 建立 webhook 端点：先运行 `create-webhook.mjs` dry-run 查看表单，实际创建时再传 `--commit`。
4. 在 Worker 接入 [`anyway-verify.ts`](../scripts/anyway/worker/anyway-verify.ts)：checkout-return 的 `sig` 按 EdDSA JWT 验签并检查 `iss/aud/sub/exp/status`；webhook 用原始 body 与 Ed25519 JWKS 验签；发货前通过 Merchant API 读取订单复核状态、商品、金额和币种。签名公钥按环境隔离缓存，失败时刷新一次。
5. 用 `pay-test.mjs` 跑一次 stg 支付测试（传支付链接和邮箱即可），脚本自动完成结账、回跳、Merchant API 订单复核。将证据留在项目侧。
6. 生产环境使用独立 API key、后台商品、支付链接和 webhook；生产链接用 `--env prod products links <productId>` 取地址并确认 `check` 为 `OK 200`（域名是 `app.anyway.sh`，见上方硬规则）；完成真实目标流程后才切换用户入口。

跳转式结账若页面有必须保留的本地数据（例如用户上传的照片），付款前暂存 IndexedDB；返回后根据已核实的订单恢复使用，并在完成后删除。该模式由项目决定具体存储期限和清理时机。

## 脚本

路径均相对 rankup Skill 根目录。`--env stg|prod` 优先于 `ANYWAY_ENV`，默认 stg。推荐将 `ANYWAY_STG_API_KEY` / `ANYWAY_API_KEY` 配在 Skill 根目录 `.env`（已被 `.gitignore` 忽略），配置一次后所有项目都无需传 `--env-file`。API key 查找顺序：进程环境变量 → Skill 根目录 `.env` → `--env-file <项目侧路径>`；环境之间不互借 key。OpenCLI 会话默认 `anyway-dashboard` 或 `anyway-paytest`，调用后关闭会话。

```bash
node scripts/anyway/anyway.mjs --env stg me
node scripts/anyway/anyway.mjs --env stg products list
node scripts/anyway/anyway.mjs --env prod products links <商品ID>  # 输出真实 payUrl 并实测 200/404，生产链接上线前必跑
node scripts/anyway/scripts/create-product.mjs --env stg --name <商品名> --description <描述> --price <金额> --currency USD --success-url <返回地址>
node scripts/anyway/scripts/archive-product.mjs --env stg --name-match <子串> --keep <保留商品ID,保留商品ID> --dry-run  # 预览归档候选；去掉 --dry-run 才实际归档并回读
node scripts/anyway/scripts/create-webhook.mjs --env stg --url https://example.com/hook
node scripts/anyway/scripts/create-webhook.mjs --env stg --url <端点> --events "订单已付款" --commit
node scripts/anyway/scripts/stg/webhook-capture.mjs --evidence-dir <项目侧证据目录>
node scripts/anyway/scripts/stg/pay-test.mjs --env stg --link <stg支付链接> --ref <项目侧引用> --email <测试邮箱> --evidence-dir <项目侧证据目录>
```

结账会话（后台 app.anyway.sh/checkout-sessions）没有 Merchant API，只能读后台页面：`node scripts/anyway-checkout-sessions.mjs --out <json> [--max-pages N] [--no-detail]`（opencli 专用窗口，只读，逐行点开详情，输出会话 ID / 商户业务单号 / 过期时间 / 客户（邮箱已脱敏）/ 订单；2026-10-30 实测 172 行 9 页全部读出）。页面时间是 Chrome 本地时区（此机 Asia/Bangkok UTC+7，不是北京时间）；来源下拉默认“API 创建”为空，脚本会切到“全部来源”；早期会话 ID 前缀为 `CKA`、无购买快照；详情里没有 IP/国家/UA/return URL。商户业务单号里的站点用户 id（前缀 `site:user:attempt` 或早期裸 uuid）可用来把测试批次与历史会话对上同一浏览器身份。

`anyway.mjs help` 列出只读查询和 webhook 验签命令。`create-product.mjs`、`create-webhook.mjs` 可用 `--env prod` 指向生产后台；前者支持 `--dry-run` 只预览参数、`--type subscription --interval month|year` 选择月付或年付（省略周期时仍为月付，默认类型仍为一次性），提交前会核对表单周期，提交后仍须核对结账页实际周期；不传 `--dry-run` 会实际创建商品，后者只有 `--commit` 才提交。`pay-test.mjs` 自动完成 stg 支付测试全流程（结账、多路径取订单号、Merchant API 复核），直接调用即可；`--env prod` 指向生产支付链接，需要额外的环境变量。生产付款会产生真实交易，须由项目发布流程决定是否执行。

## 已知坑（2026-09-07 stg 单次实测）

- 商品表单没有 cancel URL 字段；提交会创建并发布商品及支付链接。支付链接是跳转式，不在原页面内嵌卡表单。
- webhook 创建/编辑 UI 不展示 signing secret；实测使用组织级 Ed25519 JWKS。stg 公钥地址已写入环境表；验签必须使用捕获的原始请求体。
- 两个后台脚本（2026-10-02 后台改版后）：webhook 页改为 `/developer?tab=webhooks`，脚本先列出现有端点，同 URL 已存在则跳过，`--commit --no-submit` 只填对话框并回读不提交；`create-product.mjs --no-submit` 只填表回读不创建。开页若后台已登出（跳 `/login`），两脚本以退出码 3 报 `LOGIN_REQUIRED`，需用户在 OpenCLI 的 Chrome 里手动登录一次再重跑，脚本不代登录。新会话首次 `open` 报 `Navigation rejected` 是 app.anyway.sh 上的常态，同会话再 `open` 即成功（脚本已自动重试，不要为此关会话）。Merchant API 经代理可能遇到 ECONNRESET，`lib/client.mjs` 已内置重试。
- 一次测试付款仅观察到 `order.paid` 投递；未见中间态事件。这是观察结果，不能据此排除其他事件在别的流程出现。
- 临时隧道在部分网络里默认 QUIC 会卡住；实测 `cloudflared tunnel --protocol http2 --url http://127.0.0.1:<port>` 可注册。若本机代理拦截 trycloudflare 的 TLS，不能只凭本机请求失败断定 webhook 不可达，应以项目侧 evidence 文件和端点接收记录判定。
- Merchant API 订单响应的商品字段为平铺 `productId`，不能按 webhook payload 的嵌套 `product.id` 解析。结账页的字段和币种切换可能改变，运行前核对当前页面。
- webhook 后台（开发者 → Webhook）没有投递日志、响应码、重投或"发送测试事件"入口；确认投递只能靠调用方自己的 `wrangler tail`（或等价日志）配合一次真实付款，不能只看后台的"启用"状态。

## 已知坑（2026-09-29 stg 复测 + 2026-10-25 补充）

- `pay-test.mjs` 在 OpenCLI `open` 时启动的会话级网络捕获中读取整个跳转链的请求 URL，同时检查最终地址栏、成功页链接/表单/订单字段及 Performance URL；站点快速消费并删除 `anyway_order_id` 也不会仅因地址栏超时判失败。旧桥接不支持网络捕获时仍可走 API 兜底。
- 付款前从 Merchant API 商品支付链接读取预期金额/币种；也可传 `--amount-cents <分> --currency <ISO币种>`（可变金额、折扣等以本次实际预期为准）。无法确定预期时在付款前停止。付款提交一次后只读观察，不因 URL 不变或点击回执超时再次提交。
- 订单号取不到时，API 按 `--ref`（merchantReference）与本次启动至查询时刻的创建时间窗口分页回查，并在本地严格校验引用、时间、金额、币种及可用的支付链接 ID。仅唯一匹配的 PAID 订单且独立详情回读一致才退出 0；多个匹配 PAID 订单拒绝猜测。因此每次尽量使用唯一 `--ref`。
- `--timeout`（默认 120 秒）控制 URL/页面/网络观察期限；Merchant API 从付款后开始回查，期限后继续最多 60 秒纯 API 查询。成功日志区分「捕获回跳订单」与「已 PAID、URL 参数缺失、API 找回」；未 PAID/预期不匹配或 API 不可用最终退出 1，均不会重新付款。PAID 只证明订单状态，业务入账与 webhook 仍须项目侧独立验收。
- 一次真实付款会同时触发 webhook 和 checkout-return 回跳，两条路径相隔可能只有几秒；调用方的入账逻辑必须在这种并发下保持幂等（按 Anyway `orderId` 去重），否则会双重入账。
- 想抓真实 webhook 原始报文用于重放：`wrangler tail --format json`（不用 `--format pretty`，后者实测不透传 log）。
