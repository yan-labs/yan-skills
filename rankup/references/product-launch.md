# 产品发布平台 runbook（Product Hunt 一类）

段 6 · 外链的一条分发渠道，单独成文是因为它**只能正经发一次**，
而踩坑的地方全在流程细节里，写在清单里放不下。

以 Product Hunt 为准写，同类平台（BetaList、Uneed、Peerlist、Launching Next）
的表单字段不同，但下面的**判断顺序**通用。

---

## 零、先决条件：账号形态是硬门槛，不是产品

必须是**看起来像真实用户的个人号**——头像、ID、简介齐全，且平时真的用它投票评论。
被判定为品牌号会导致发帖与评论被禁用。

**这一条要在动手之前问站主**，不要发现问题时才问：
「你这个号是个人号还是品牌号？」新注册的空号发首帖，风险最高。

---

## 一、素材：先备齐再开表单

下表的字数与尺寸**在 2026-08-24 复核过**：字数上限来自发布表单自己渲染的计数器
（`56/60`、`492/500`、`12/40`），图片尺寸来自平台帮助中心「How to post a product」原文。
不是二手转述。

| 素材 | 要求 | 备注 |
|---|---|---|
| 名称 | **40 字**（表单计数器 `12/40`） | 只写产品名，别塞描述和 emoji |
| tagline | **60 字**（表单计数器 `56/60`） | 写完数一遍，超一个字保存不了 |
| description | **500 字**（表单计数器 `492/500`） | |
| 标签 | **最多 3 个**（表单原文 Select up to three launch tags） | |
| 缩略图 | 正方形，**推荐 240×240**；GIF **要 <3MB** | 官方只对 GIF 给了体积数字，静态图没写上限。平台常会自动从站点抓一个，多半够用 |
| 画廊图 | **推荐 1270×760**；**2 张起才会显示**，表单建议 3 张以上 | 第一张会被当作社交分享预览图 |
| 图片格式 | 上传控件 `accept` 实测为 `image/gif, image/jpeg, image/png, image/webp` | **webp 是收的**，旧文只写 JPG/PNG/GIF |
| 首条评论 | 由 maker 本人视角写 | 这是转化率最高的一块，不要省 |

**这些数字只在发布/编辑表单里看得到**，产品公开页上没有。要复核就打开
`/posts/<slug>/edit`（需登录 maker 账号）读计数器，别去猜。

**画廊图用真实产品截图，不要用做好的宣传图。**
截 1270×760 左右，每张展示一个具体功能，不叠字不加边框。
平台自动抓的那张 OG 卡可以留着当第一张，但**不能只有它**。

---

## 二、图片上传：用专用工具，不要点按钮

> **⚠️ 这一节推翻了本文件 2026-08-22 之前的说法。**
> 旧文写「浏览器自动化连接器通常无法为 file input 设置文件，
> 把图交给用户拖是正确的分工」。**这是错的，而且是有害的错**——
> 它会让后来者直接放弃一条走得通的路。

正确做法：

1. **不要点上传按钮。** 点了会弹出**系统级文件选择框**，
   而自动化连接器关不掉系统对话框——渲染进程会被冻死，
   `eval` 与 `screenshot` 全部超时，那个标签页救不回来。
2. 用 `find` 或 `read_page` 定位 **file input 元素本身**，拿它的 ref。
3. 用连接器的**专用文件上传工具**，把本地路径直接写进那个 ref。
   一次可以传多个文件（实测 4 个文件 786KB 一次成功）。

**在我们这套栈里，「专用文件上传工具」有名有姓，照着敲就行：**

| 驱动 | 命令 |
|---|---|
| OpenCLI | `opencli browser <session> upload [target] <files...>`<br>（`opencli browser --help` 原文：`Attach local files to a file input — JSON envelope {uploaded, files, file_names, target, matches_n}`；`target` 省略时取页面上第一个 file input） |
| Chrome 连接器 | `file_upload` |

PH 的两个上传控件（缩略图、画廊）实测都是
`<input type="file" accept="image/gif, image/jpeg, image/png, image/webp" multiple>`，
`multiple` 为真，所以画廊那几张可以一次 `upload` 全推进去。

**能力差异是真实存在的，所以「换一个连接器」是标准动作，不是碰运气**：
走 CDP 直接写 file input 的路径会返回 `-32000 Not allowed`（隐藏、改成可见、
换标准路径三种全被拒）；而带专用上传工具的连接器一次调用就成。

> **通用规矩：判「做不到」之前，先问「是这条路做不到，还是这件事做不到」。**
> 一个工具返回 `Not allowed`，证明的是**那个工具**的边界，不是任务的边界。
> 宣告 external-blocker 之前必须先枚举同类能力的其它入口。
> 2026-08-22 的实际教训：因为没换工具就下结论，白白停了一天。

**ref 会过期。** `find` 与上传/点击之间不要插入任何会导致重渲染的操作，
两步必须紧挨着做。一次用了重渲染前的旧 ref，ref 落到了「Select an image」按钮上，
于是踩中第 1 条，冻死一个标签页。

---

## 三、发布：先过 checklist，再选日期

1. 走到平台的 **Launch checklist**，确认 Required 一栏 **100%**。
   缺项在这里一目了然，比在表单里翻找快得多。
2. **没有「立刻发布」按钮**——PH 的模型是选一个上线日期，当天 00:01 PT 起跑满 24 小时。
   所以「发布」这个动作实际上叫 **Schedule**。
3. **不要选今天**，除非当地时间还在凌晨。选今天等于把 24 小时窗口砍掉已经过去的部分。
4. 选日期的取舍：
   - **周二至周四**流量最高，但发布量也最多，竞争最激烈；
   - **周末**流量低但发布量少得多，**自然排名容易进前列**。

   **没有推票资源就选周末。**
   平台**明令禁止 upvote 服务与刷票群**，违者从首页移除，且「增长顾问」用了禁术
   算在你头上。这条不是道德建议，是账号存续问题。
5. 确认后回读 **Launch status = `Scheduled`**，并记下产品页 URL 与倒计时。
   点了确认不等于排上了。

---

## 四、记账：发布前不入渠道表

产品页是平台域下的**独立页面**，比 README 那种全 nofollow 的锚点值钱，
但**发布前不写进 `free-channels.json`**——那张表记的是**活页面上观测到的链接**，
没发布就没有可观测对象。

上线后抓**渲染后**的产品页，实测 `rel` 再入账。
不采信平台自己的 Dofollow 声明，也不因为「一般都是 nofollow」就跳过实测。

**这一步必须走浏览器，`curl` 一定失败。** producthunt.com 对纯 HTTP 客户端一律
`403` + `cf-mitigated: challenge`（2026-08-24 实测：带完整 Chrome UA 请求
`/products/<slug>`，返回 `HTTP/2 403`、`server: cloudflare`、`cf-mitigated: challenge`；
`help.producthunt.com` 同样被挡）。所以「抓渲染后的产品页」要用 OpenCLI 驱动真实 Chrome，
不要写成一条 `curl` 就当验过了。

**先记住两个 URL 形状，能省一轮摸索（均为 2026-08-24 实测）：**

| 形状 | 是什么 |
|---|---|
| `/products/<slug>` | 产品页。**不是**老的 `/posts/<slug>`（老形状现在只剩发布编辑页 `/posts/<slug>/edit` 在用） |
| `/r/p/<id>` | 外链跳转端点。它不出现在产品页 DOM 里，只在页面 hydrate 的 Apollo store 的 `Post.shortenedUrl` 字段里。实测跟到底：`/r/p/1209555` → `https://toplify.app/?ref=producthunt` |

**产品页上外链的实测形态（两个产品页各测一次）**：maker 自己的官网链接是
**直链**，不走 `/r/p/`，形如 `https://<你的域名>/?ref=producthunt`，
`rel="noreferrer noopener ugc"`——**没有 `nofollow`，但有 `ugc`**。
同一页上评论区之类的外链才是 `rel="nofollow noopener noreferrer"`。
入账时按 `ugc` 记，别照抄「PH 全 nofollow」这个流传很广的说法，也别就此当成 dofollow：
`ugc` 和 `nofollow` 一样是「不传递权重」的提示信号。
每次发布仍要自己重测一遍，PH 改过不止一次。

`nofollow` 不等于零：把它算作提示信号与外链盘自然度的一部分，
不当权重来源，也不当没有。

---

## 五、上线当天

- 平台会给一个 **Launch Day dashboard**，全天回评论。这是唯一还能影响排名的合法动作。
- 平台通常提供带追踪参数的分享链接（X / LinkedIn 各一条），发社交用那个，不要用裸 URL。
- **可以分享，不能明着要票**，也不要冷启动私信轰炸。

---

## 六、同类平台实测记录

### `rel="noopener"` 不是 nofollow —— 高频误判，必须纠正

> **⚠️ `rel="noopener"` 是纯安全属性**，防止 `window.opener` 攻击，**完全不影响 PageRank 传递**。
> 只有 `nofollow`、`ugc`、`sponsored` 才阻止链接权重传递。
>
> 2026-09-11 实测踩坑：sub agent 报告 Fazier 和 Twelve Tools 的链接「等价于 nofollow」，
> 原因是看到了 `rel="noopener"` 就下了结论。实际上这些是**完全的 dofollow 链接**。
>
> **判断规则**：检查 `rel` 属性时，只关注 `nofollow`、`ugc`、`sponsored` 三个值。
> `noopener`、`noreferrer` 都是安全/隐私属性，与 SEO 无关。

#### 6.1 BuiltByIndies（2026-09-11 实测）

【实测】**单产品限制**：一个账号同一时间**只能有一个产品草稿**。每次「Submit Product」
都会覆盖上一个草稿。必须先攒够 **10 Karma**（或一次性付费 **$9 premium**）才能
「launch」已提交的产品，腾出名额提交下一个。

【实测】**Karma 规则**：Complete Profile +5、Follow maker +2、Upvote product +2、
Comment +2、Buildlog post +5。**最低 10 分才能 launch**。

【实测】**Free Launch 要排队**：Free Launch 进入按周排期的队列（例如 Week 42 =
2026-10-12~10-18）；实测时 Week 38-41 已满。产品详情页提交后**立刻公开可访问**，
但**不会出现在当周 Products 榜单**，要等排到的那一周。

**多产品策略**：因为单产品限制，按优先级顺序逐个提交——launch 一个会消耗 Karma，
要提前规划节奏。一个产品 launch 完，「名额」才会腾给下一个待提交的产品。

**账号建议**：账号绑定社交链接（X、GitHub）有助于触发 Profile 的 +5 里程碑。

#### 6.2 BetaList（2026-09-10 实测）

【实测】**「Started」状态**：免费提交后列表状态显示 **Started**，意味着要**付费**
（featuring $129，或更便宜的选项）才能进入 review / featuring 队列。免费提交理论上
最终也可能被 review，但队列极长。

【实测】**Google OAuth 登录**：账号注册走 Google OAuth。

【实测】**Rails Active Storage DirectUpload**：图片上传走 Rails Active Storage 的
direct upload，直传云存储。

#### 6.3 LaunchIgniter（2026-09-10 实测）

【实测】**算术验证码**：提交表单带一个简单算术 CAPTCHA（如「7-7=?」「5+7=?」），
易于自动化。

【实测】**不需要登录**：直接提交表单，无需注册账号。

【实测】**分类选择**：表单有 category 下拉（Video、AI 等）。

#### 6.4 Fazier —— DR 73，confirmed dofollow（2026-09-11 实测）

【实测】**链接属性**：仅 `rel="noopener"`，**没有** nofollow/ugc/sponsored。
**判定为 dofollow**——传递 PageRank。

【实测】**有免费档**：无需付费即可提交。

【实测】**footer 徽章**：要求在自家站点 footer 挂一个 Fazier 徽章 SVG。

【实测】**Google 登录**：走 Google OAuth。

【实测】**URL 形状**：`https://fazier.com/launches/<product-slug>`

#### 6.5 Twelve Tools —— DR 81，confirmed dofollow（2026-09-11 实测）

【实测】**链接属性**：仅 `rel="noopener"`，**没有** nofollow/ugc/sponsored。
**判定为 dofollow**——传递 PageRank。

【实测】**不需要登录**：直接提交。

【实测】**footer 徽章**：要求挂一个 Twelve Tools 徽章。

【实测】**URL 形状**：`https://twelve.tools/<domain-slug>`

#### 6.6 Product Hunt —— 页面结构与链接属性补遗（2026-08-24 / 2026-09-11 实测）

【实测】**Reviews tab ≠ Forum/launch thread**，两者容易混淆：

| 路径 | 是什么 |
|---|---|
| `/products/<slug>/reviews` | 发布后的用户评分 tab。没有评分的产品这里显示「0 reviews」 |
| `/p/<slug>/<slug>` | Forum / launch thread。maker 本人的首条评论（置顶，标 "Maker"）在**这里** |

复核 maker 评论时不要看错 tab——查 reviews tab 只会看到「0 reviews」，误判成「maker 没发评论」。
