# 搜索平台接入：站长工具与 IndexNow

段 5 · 上线与接入的一个子环节，独立成文是因为它**每建一个站都要原样做一遍**，
而每次重新摸索的成本远高于抄一份。这份文档要回答三件事：

1. 一个新站要接哪几样，按什么顺序；
2. 每样怎么自动化（现成脚本在哪、参数怎么给）；
3. 哪些步骤**不允许**自动化，必须由用户本人点。

## 先看这张顺序表

**按「依赖什么」排序，不按「哪个重要」排序。** 前两项不依赖任何第三方账号，
所以它们不会被「用户的账号暂时不可用」阻塞——先把它们做完，站就已经在往外推内容了。

| 顺序 | 做什么 | 依赖 | 自动化程度 |
|---|---|---|---|
| 1 | **IndexNow 密钥文件上线** | 无 | 全自动（`indexnow-submit.mjs --generate-key` + 站点路由） |
| 2 | **IndexNow 首次全量推送** | 无 | 全自动（`indexnow-submit.mjs`） |
| 3 | **Bing Webmaster 所有权验证** | 微软账号 | 半自动：meta 标签由你写进代码，**验证按钮由用户点** |
| 4 | **GSC 资源创建 + 所有权验证** | Google 账号 | 半自动：TXT 记录可由你写 DNS，**验证按钮由用户点** |
| 5 | **Naver Search Advisor 所有权验证**（仅韩国市场） | Naver 账号 | 半自动：meta 标签由你写进代码，**验证按钮由用户点** |
| 6 | **Yandex Webmaster 所有权验证**（俄语市场或全球覆盖） | Yandex 账号 | 半自动：meta 标签由你写进代码，**验证按钮由用户点** |
| 7 | **各平台提交 sitemap** | 已验证的资源 | 全自动（`webmaster-sitemap.mjs`） |
| 8 | **每次内容变更后推 IndexNow** | 无 | 全自动，应当挂进发布流程 |

**IndexNow 排在站长工具前面，是因为它一样都不欠。** 它不需要账号、不需要验证、
不需要等谁批准——一个密钥文件就是全部凭据。把它排到后面，等于白白等着账号问题解决的那几天。

## 1–2. IndexNow

### 它是什么，不是什么

IndexNow 是一个开放协议：你在自己域名上放一个密钥文件，就获得了「主动告诉搜索引擎
某些 URL 变了」的权利。Bing、Yandex、Seznam、Naver 共用同一张网，推一次全都收到。
**Google 不参与**——Google 那侧只有 sitemap 和 Search Console，不要指望 IndexNow 能替代它们。

「已接受」不等于「已收录」。接口回 200 的意思是队列收下了，收录与否、多久，仍然由各家自己决定。
任何把 IndexNow 说成「立刻收录」的说法都是错的。

### 怎么做

```bash
# 生成密钥（只打印，不写文件——写去哪里由项目决定）
node <rankup-skill-dir>/scripts/indexnow-submit.mjs --generate-key

# 全量推送：URL 列表从线上 sitemap 取
node <rankup-skill-dir>/scripts/indexnow-submit.mjs \
  --site-url https://example.com --key <密钥>

# 只推刚改过的几页（日常应当用这个，不要每次全量）
node <rankup-skill-dir>/scripts/indexnow-submit.mjs \
  --site-url https://example.com --key <密钥> /pricing /zh/pricing
```

### 密钥文件必须由应用层提供，不能是静态文件

这一条在任何「静态资源绑定 + 应用/Worker」的架构上都成立：**静态资源会抢在应用之前响应**，
所以放进静态目录的密钥文件会**永久遮蔽**应用里的同名路由，之后轮换密钥必须重新构建、重新部署。
把它做成应用层的一条路由，轮换就只是改一个常量。

Cloudflare Worker 里的形状（`robots.txt` 和 `sitemap.xml` 同理，同一个原因）：

```ts
// INDEXNOW_KEY 是公开值：协议本来就靠「你能在自己域名上放出它」证明所有权。
// 它可以进源码、进 git——但要在注释里写明它不是机密，否则后人会当泄露删掉。
if (path === `/${INDEXNOW_KEY}.txt`) {
  return new Response(INDEXNOW_KEY, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  })
}
```

### 挂进发布流程（这一节是规则，不是建议）

**通知必须是「出荷命令的一段」，不能是「文档里的一条命令」。**

这条被实战推翻过一次：原文只建议加一条 npm script，并且让它指向
**全局 Skill 目录**里的脚本。两个问题当场暴露：

1. **交给人记的步骤一定会漏，而且漏了不会有任何东西变红。** 忘记推送不会让构建
   失败、不会让测试变红、不会让页面 404——它只是让新页面晚几天被发现。
   **没有失败信号的遗漏，是所有遗漏里最难自查的一种。**
2. **指向 Skill 目录 = 项目在自己仓库外有一个隐形依赖。** 换台机器、别人 clone、
   CI 容器里，那个路径都不存在，而报错会长得像「脚本坏了」而不是「少装了东西」。

正确形态，三条都要满足：

- **脚本放进项目仓库**（`scripts/indexnow-push.mjs`），不引用 Skill 目录；
- **密钥从项目里的单一事实源读**（例如 `src/content/site.ts` 的常量），
  并在脚本里**断言** `public/<key>.txt` 与该常量一致——这个不变条件此前是靠
  源码注释拜托人类维护的，而不一致的后果（送信 403）要到下次推送才暴露；
  把同一个断言也挂进 `test` 任务，漂移就在部署前落地；
- **接到出荷命令的后段**，让「不推送」变成做不到的事：

```json
{ "scripts": {
  "ship": "turbo typecheck && turbo test && turbo build && pnpm --filter web deploy && pnpm --filter web indexnow"
} }
```

**默认行为是 diff 推送**：脚本维护一份上次成功推送的 URL 集合
（`.rankup/indexnow-last.json`，本地状态，不进 git），每次只推 sitemap 里新出现的 URL。
全量推送用 `--all` 显式触发（首次推送或密钥轮换后）。
这个记录文件丢了不影响正确性——下次自动退化为全推一次。

推送时机是**部署完成之后**，不是构建之后：脚本要校验线上的密钥文件与 sitemap，
而它们在部署完成前还是旧的。脚本应当把「部署前就跑」这种情况**指名报错**——
只回一个 403 的话，分不清是密钥不一致还是根本没部署。

**可推广的形式**：任何「做完主要工作之后还必须做、但漏了不会报错」的收尾动作
（推送索引、清缓存、打标签、发 webhook），都应该**焊进那个主要工作的命令里**，
而不是写进文档等人记得。判据很简单——**问「漏掉这一步，会有什么东西变红吗？」
答案是「不会」，那它就不该由人来记。**

### 三个坑

1. **密钥文件不可达时，整批提交被丢弃，而接口照样回 200。**
   这是脚本默认先 GET 一次密钥文件的唯一理由。没有这一步，「推送成功」这句话在
   密钥没部署、拼错、或被静态资源抢答时**逐字一样**地打印出来。
   判据是密钥文件正文 trim 后**逐字节等于**密钥。
2. **URL 列表从线上 sitemap 取，不要在脚本里维护数组。** 硬编码数组会和实际发布的页面漂移，
   而漂移方向永远是「新页面没推」。sitemap 已经是那份清单了。
3. **`host` 必须与 urlList 每一条的主机名一致**，否则整批 422。子域算不同主机，
   `www.` 与非 `www.` 也算。脚本会先自查再提交。

## 3–6. 站长工具的所有权验证

### 验证方式怎么选

**优先「网域」资源（DNS 验证）而不是「网址前缀」**：前者覆盖全部子域与 http/https，
后者一个前缀一份资源，`www` 与非 `www` 要建两份。

各方式的取舍：

| 方式 | 代价 | 适用 |
|---|---|---|
| DNS TXT | 要能写 DNS | **首选**，唯一能建「网域」资源的方式 |
| HTML meta 标签 | 一行代码 + 一次部署 | 没有 DNS 权限、或只需要「网址前缀」资源时 |
| 上传 HTML 文件 | 与 meta 同级，但多一个静态文件要维护 | 没理由优先它 |
| 「从其它平台导入」 | **给对方一个对你另一个平台账号的长期 OAuth 授权** | 见下，默认不用 |

### 两条不允许代替用户做的

- **「授权访问你的 DNS 服务商账号」那个按钮，不得代替用户点。** 它给出的是对用户 DNS 账号的
  长期访问权，属于必须由用户本人决定的动作。等价替代：把验证方式切到「任何 DNS 提供商」，
  取回 TXT 值，由**你**通过 DNS API 写入记录，再让用户点验证——一样自动化，且不产生任何长期授权。
- **Bing 的「从 Google Search Console 导入」同理。** 它省下的是几分钟，换来的是
  Bing 对用户 Google 账号的长期 OAuth。HTML meta 验证达到完全相同的效果，
  代价是一行代码。默认走 meta，除非用户明确要求导入。

meta 标签的形状（token 是公开值，本来就印在每一页的 HTML 里）：

```ts
{ name: "msvalidate.01", content: BING_SITE_VERIFICATION }   // Bing
{ name: "google-site-verification", content: GSC_TOKEN }      // GSC（网址前缀资源）
{ name: "naver-site-verification", content: NAVER_SITE_VERIFICATION }  // Naver（仅韩国市场）
{ name: "yandex-verification", content: YANDEX_VERIFICATION }  // Yandex
```

### 步骤 5：Naver Search Advisor（仅韩国市场）

**什么时候需要这一步：项目有韩文版（`/ko` 或 `.kr` 域名）才做。** 不做韩国市场可以跳过。

韩国人基本上都在用 Naver，整个 Naver 生态相当于百度 + 小红书 + 大众点评 + 抖音的合体。
Naver 虽然通过 IndexNow 被动接收 URL 推送，但 **Naver Search Advisor（站长工具）提供的
站点诊断、收录状态、搜索分析是 IndexNow 给不了的**——和 Bing/GSC 一样，不注册就没有数据。

入口：`https://searchadvisor.naver.com/`

自动化脚本：`scripts/naver-setup.mjs`（`status` / `register` / `submit-sitemap`）

```bash
# 查看注册状态
node <rankup-skill-dir>/scripts/naver-setup.mjs status --site example.com

# 注册站点并获取验证 meta 标签
node <rankup-skill-dir>/scripts/naver-setup.mjs register --site example.com

# 验证通过后提交 sitemap
node <rankup-skill-dir>/scripts/naver-setup.mjs submit-sitemap --site example.com
```

**CAPTCHA 限制：** 所有权验证需要人机验证，脚本会取出 meta 标签内容但无法自动完成验证点击。
用户部署 meta 标签后必须在浏览器中手动完成验证。

**输出是证据不是结论（2026-08-30 双证人化）：** `submit-sitemap` 每步截图落
`.rankup/evidence/naver-setup-<ts>/`，结束时报「页面回读命中/未命中哪些文案 +
suggested」。**eval 超时（读不到页面）不再被当成提交成功**——那只说明读不到，
成没成看最后一张截图。

#### 验证方式

与 Bing/GSC 同理，优先 HTML meta 标签：

```ts
{ name: "naver-site-verification", content: NAVER_SITE_VERIFICATION }
```

Naver 也支持 HTML 文件上传和 DNS TXT，选择逻辑与上面 GSC/Bing 一致。

#### 验证后要做的

1. **提交 sitemap**——`node <rankup-skill-dir>/scripts/naver-setup.mjs submit-sitemap --site example.com`，
   或在 Search Advisor 后台「要求 > Sitemap 提交」里手动提交，
   地址格式与 GSC/Bing 一致（`https://example.com/sitemap.xml`）。
2. **提交 RSS**——Naver 额外支持 RSS 订阅源提交，对博客/内容型站点有加速收录效果。
3. **查看「网站诊断」**——Naver 有自己的一套诊断标准，与 Google Lighthouse 不完全重叠，
   上线后跑一次，把结果记进 `.rankup/audit.md`。

#### 注意事项

- **Naver 账号注册可能需要韩国手机号验证**，这是用户本人的事，不代做。
  如果用户没有韩国手机号，可以尝试用邮箱注册的国际版流程。
- **日本以外的 Yahoo 用的是 Bing 引擎，日本 Yahoo 用的是 Google 引擎。**
  所以做日本市场不需要额外接 Yahoo，GSC 已经覆盖；做其他市场 Bing Webmaster 已经覆盖 Yahoo。
- **Naver 的爬虫 User-Agent 是 `Yeti`**，确认 `robots.txt` 没有误拦它。

### 步骤 6：Yandex Webmaster

**什么时候需要这一步：建议所有站点都接。** Yandex 是全球第五大搜索引擎，俄罗斯市场占有率超过 60%。
即使不做俄语市场，Yandex 也是 IndexNow 的共同创建者——注册 Webmaster 能拿到收录状态和搜索分析数据，
而且 Yandex 对行为指标的权重远高于 Google（用户停留时长、跳出率、点击率都直接影响排名），
这些数据本身就有参考价值。

入口：`https://webmaster.yandex.com/`

#### 验证方式

与 Bing/GSC/Naver 同理，优先 HTML meta 标签：

```ts
{ name: "yandex-verification", content: YANDEX_VERIFICATION }
```

Yandex 也支持 HTML 文件上传（文件名格式 `yandex_<验证码>.html`，内容必须精确匹配模板，
不能有任何额外标签/CSS/JS）和 DNS TXT 记录（值格式 `yandex-verification: <验证码>`）。
选择逻辑与上面 GSC/Bing/Naver 一致。**WHOIS 验证已于 2025 年移除。**

注意：添加站点时必须填入精确的协议和子域（`https://` vs `http://`，`www` vs 非 `www`），
Yandex 把这些当作不同的资源。

#### 验证后要做的

1. **提交 sitemap**——在 Webmaster 后台「Indexing > Sitemap files」里提交。
   Yandex **只接受 XML 和 TXT 格式，不支持 RSS/Atom**。两周内处理完成。
   手动触发重新处理有次数限制（每个 host 10 次，之后等 30 天）。
   也可以在 `robots.txt` 里用 `Sitemap:` 指令声明。
2. **设置地区**——在「Site region settings」里设置站点的目标地区。
   Yandex 是城市级地域搜索引擎，约 30% 的查询结果因地区而异。
   设置后需要人工审核（几天到几周），不是即时生效。
3. **关联 Yandex Metrica**（可选但推荐）——Yandex Metrica 是免费的分析工具（类似 GA4），
   与 Webmaster 关联后可以加速收录。在 Webmaster 后台「Settings > Yandex Metrica tags」关联。
4. **查看「Site diagnostics」**——Yandex 有自己的一套诊断标准（缺失 meta 标签、HTTP 错误、
   重复内容、安全问题），与 Google Lighthouse 不完全重叠。
5. **检查 robots.txt**——用 Webmaster 后台的「Robots.txt analysis」工具验证规则是否正确。

#### Yandex 爬虫与 robots.txt

- **主爬虫 User-Agent**：`YandexBot`（完整字符串 `Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)`）
- robots.txt 里用 `User-agent: Yandex` 可以覆盖**全部** Yandex 机器人（图片、视频、广告等），
  而 `User-agent: YandexBot` 只针对主索引爬虫。
- **`Clean-param` 指令**（Yandex 独有）：告诉爬虫哪些 URL 参数不影响内容，避免重复抓取。
  格式：`Clean-param: utm_source&utm_medium&ref /`
- **`Crawl-delay` 已于 2018 年弃用**——改用 Webmaster 后台的抓取速率设置。
- 确认 `robots.txt` 没有误拦 `YandexBot`。

#### 注意事项

- **Yandex 账号注册无特殊限制**，用邮箱即可在 `passport.yandex.com` 注册。
- **Turbo Pages 已于 2025-04-01 停用**，不要再投入。
- **Yandex 对行为因素的权重极高**（2023 年源码泄漏确认权重 ~0.8），
  包括点击率、停留时长、跳出率、滚动深度、回访率。
  人为刷点击会触发「PF filter」惩罚——**绝对不做**。
- **商业查询有独立排名因子**：联系方式、法人信息、配送/支付/退货页面、
  产品卡片完整度、价格透明度。做电商站时参考。

### DuckDuckGo：无需额外操作

**DuckDuckGo 没有自己的站长工具，没有站点提交入口。**

DuckDuckGo 的搜索结果主要来自 Bing 索引，因此**提交 Bing Webmaster = 覆盖 DuckDuckGo**。
我们在步骤 3 已经做完了。

DuckDuckGo 有自己的爬虫 `DuckDuckBot`（User-Agent: `DuckDuckBot/1.1`），
用于补充特定功能和即时回答（Instant Answers）。
确保 `robots.txt` 没有误拦 `DuckDuckBot` 即可——不需要额外的验证或提交。

### 域名有「前世」时

上线后第一件事是对首页提交「请求编入索引」，把搜索引擎对该域名的旧记忆（停放页、旧站）
尽快覆盖掉。这件事越早越好，且**必须用正确的资源做**——见下一节。

### 请求编入索引的操作细节

**GSC**：URL 检查工具 → 输入首页 URL → 等待实时测试 → 点击「请求编入索引」。
点击后 GSC 会跑一个 **1–2 分钟的实时抓取测试**（页面上有进度条），通过后才显示
「已请求编入索引」。**不要在测试跑完前关闭页面或点其他 URL**。
如果实时测试失败（例如 noindex、robots 阻止），会给出具体原因——先修再重试。

**Bing**：Webmaster Tools → URL Submission → 在文本框中输入 URL（每行一个，
一次最多 10 条），点击 Submit。Bing 不做实时测试，提交后立刻确认。
**自动化陷阱**：Bing 的 URL Submission 文本框是 React 控件，
`el.value = '...'` 不会触发 React 的 state 更新，看起来有值但提交时为空。
必须用 `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set`
设值后再 `dispatchEvent(new Event('input', {bubbles: true}))` 才能生效。【实测 2026-09-03】

**推荐 URL 清单**：首页 + 所有平台页 + about 页。不需要提交 sitemap 里的每一条——
首页请求编入索引足以让爬虫发现 sitemap 并抓取其余页面。

## 6. 提交 sitemap

```bash
# 先读状态（只读）
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs gsc    status --property sc-domain:example.com
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs bing   status --site https://example.com
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs yandex status --site https://example.com

# 提交
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs gsc    submit --property sc-domain:example.com --sitemap sitemap.xml
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs bing   submit --site https://example.com --sitemap https://example.com/sitemap.xml
node <rankup-skill-dir>/scripts/webmaster-sitemap.mjs yandex submit --site https://example.com --sitemap https://example.com/sitemap.xml
```

**脚本采集留证，判读归 AI（2026-08-30 双证人化，截图链路已实盘验证）**：
`webmaster-sitemap.mjs` 的每次点击前后都会截图并保存页面文本到
`.rankup/evidence/webmaster-sitemap-<ts>/`（含 manifest.json 的 stopReason）。
submit 结束时它只报告事实——「解析出 N 行，其中含/不含目标地址（suggested:
listed/not-listed）」；**not-listed 不等于提交失败**（表格改版会让解析器失配），
以 05-after-submit-click 的截图为准。失败退出前现场必已落盘，`--keep-session`
可连标签页一起留下。

### 为什么是浏览器而不是 API

本 Skill 的取数优先级是 API 高于浏览器。这里是**确实没有零配置 API**的少数场景之一：

- **GSC** 的 Search Console API 能提交 sitemap，但要先建 GCP 项目、开 API、配 OAuth 同意屏幕、
  跑一次授权码流程，还要长期保管一串 refresh token。为一次 sitemap 提交做这一整套不划算。
- **Bing** 有一个后台一键生成的 API key，`POST https://ssl.bing.com/webmaster/api.svc/json/SubmitFeed?apikey=…`。
  **项目如果已经有那把 key，Bing 这半边就该走纯 HTTP**，不必用浏览器。

所以脚本的定位是**零配置的默认路径**，不是「唯一路径」。

### 选错资源是这类后台最贵的错误

**网域资源覆盖它的全部子域**，所以拿父级资源去查子域的单条 URL、提交编入索引，
**都会成功**——正因为它「看起来能用」，这个坑才难发现。它悄悄搞错的只有**聚合数字**：
点击、曝光、索引覆盖全是别的站的。把那些数字当基线记下去，会把后面几个月的增长判断全带偏。

**判据：读聚合数字之前，先确认资源 ID 恰好等于目标站点；单条 URL 的动作用父级资源也行。**
一个账号下常有多个名字相近的资源，**核对 ID，不要核对名字**。

### 四个实测的坑

1. **不要用 `opencli browser <s> extract` 读这两个后台。** 它会把页面里的 base64 内嵌图片
   一起吐出来——实测 Bing 后台一次 127 万字符，够冲掉一大半上下文，而你只想要表格里的六个数。
   用 `eval` 取 `innerText` 再切片。
2. **属性由 URL 参数决定，不要去点属性选择器。**
   GSC 是 `?resource_id=<urlencoded 属性>`，Bing 是 `?siteUrl=<urlencoded 源>`。
3. **`click --role button --name "提交"` 会因为「包含匹配」撞词而失败。**
   实测 GSC 站点地图页上同时有「提交」和「提交反馈」，多匹配直接报错。
   正确做法是**在页面里精确认出目标、打一个一次性属性，再让驱动按 CSS 选择器点**——
   精确匹配发生在页面里，点击仍然是驱动的真实 CDP 点击。
   （不能改成在页面里 `el.click()`：这两个后台的按钮多是挂 jsaction 的 `div`，
   合成事件不触发它们的处理器，**报成功、什么都没发生**。）
4. **Bing 的 sitemap 输入框默认不存在**，要先点「Submit sitemap」才挂载。
   少了这一步，脚本会去填页面上唯一可见的那个 input——顶部搜索框——然后点提交、报成功。
   这类「填错了框还报成功」的失败不会有任何报错，只会在几天后表现为「Bing 一直没抓新 sitemap」。

### 两边的表格形状不一样，不要按列解析

同一份数据，`innerText` 里的形状不同：**GSC 整行一条记录、字段用制表符分隔；
Bing 只有地址在行首，其余字段各占一行。** 按列下标解析的代码在任何一次改版后会**静默错位**，
而错位后的数字看起来完全正常。脚本因此只做两件事：认出哪几行是 sitemap 地址、把随后的字段贴回同一行。

### 「提交成功」是什么、不是什么

平台对同一地址的重复提交是**幂等**的，所以「它在列表里」这件事在提交前后长得一模一样，
**不构成提交生效的证据**。可用的证据有两种：

- 提交后状态列立刻从 `Success` 变成 `Processing`（实测 Bing 会）；
- 隔一天再跑一次 `status`，看「上次读取」的日期有没有前进。

另外，**表里的「已提交/上次读取/已发现网址数」是上一次抓取的快照，不是实时值**。
刚改完 sitemap 就来看会读到旧条数——这不是失败，不要因此反复重新提交。

## 验收：写进 `.rankup/integrations.md` 的东西

逐条记，每条都要有证据而不是断言：

- IndexNow 密钥**所在的路由**（不是所在的文件）、密钥值、最近一次推送的条数与 HTTP 状态。
- 两边站长工具的**资源 ID**（不是名字）、验证方式、验证通过日期。
- 两边 sitemap 的提交日期、上次读取日期、状态、已发现条数——**并注明这是快照日期**。
- 已知的、尚未对齐的差异（例如线上 sitemap 已经 N 条而平台仍显示 M 条），
  以及它预计怎么自行收敛。写下来，下次才不会有人把它当成故障重查一遍。

## 7. Bing Webmaster 的「关键词研究」是一个被长期忽略的免费实测源

站长工具验证通过之后，Bing Webmaster Tools 里就多了一个 **Keyword Research** 页
（`bing.com/webmasters/keywordresearch`）。它给的是 **Bing 自己测到的展示次数**，
按国家拆分，还附该词的 top10 排名 URL——**不是模型输出，不是面板外推**。

**为什么它重要**：判「某个关键词工具报的量是不是真的」时，最常见的做法是去开
Google Ads Keyword Planner。但那条路有两个已实测的问题：

1. **入口会被注册漏斗劫持**。账号若停在「正在设置」状态，Keyword Planner 直链、
   账号概览、带完整参数的直链会**全部被弹回「制作首个广告系列」向导**，
   而该向导页面上已经没有「切换到专家模式」的链接（扫过 DOM 含隐藏元素）。
   免费路径仍然存在——新建账号 → 底部「切换到专家模式」→「不投放广告系列创建账户」——
   但它是**新建账号**流程，而创建账号不是可以代替用户做的动作。
2. **免费档只给区间值**（如「1万–10万」）。要回答「这个词是两万还是接近零」，
   区间值精度不够。

而 Bing 的关键词研究**零成本、零新账号**（站长工具本来就要接），给的是绝对数。

### 用法与一条硬性纪律

**必须先跑对照组，再解读「无数据」。** 这个页面对没有量的词返回
「No data available / 0 rows」——与「工具没取到数」在界面上**完全同形**。
所以每次使用前，先查 2–3 个**已知确实有量**的同语种同类词：
它们都返回了数字，「0」才代表真的没量。

跳过这一步，就会把一次取数失败读成一个市场结论——这是本 Skill 反复强调的
「『没有数据』几乎总有一个自己的页面形态，去把那句话找出来」的同一条规则。

### 它能验什么、不能验什么

- **能**：跨词的相对量级（谁比谁大、大几倍）、某个词是不是根本没有需求。
  与闭环反推（Similarweb 实测点击反推点击率）是两条独立方法，**互为交叉验证**。
- **不能**：直接换算成 Google 的月搜索量。两者引擎份额、口径、时间窗都不同，
  只能比**比例**，不能拿绝对数去替换。报数字时必须写明「Bing 实测展示 / N 个月」。
