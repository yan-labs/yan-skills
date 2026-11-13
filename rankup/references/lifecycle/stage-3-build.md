# 生命周期 · 段 3：建站与开发

> 本文件是 [`lifecycle.md`](../lifecycle.md) 的段 3 全文（2026-09-30 从单文件拆出）。开工先做[对账](../lifecycle.md#每段开头的固定动作对账原阶段-0)；闸门判据在 [`checklists.md`](../checklists.md) 段 3，本文件只写怎么做。

## 段 3：建站与开发

> **动手之前先读** [`experiences/webcafe-topics.md`](../experiences/webcafe-topics.md) 二、九
> 与 [`experiences/webcafe-experiences-2.md`](../experiences/webcafe-experiences-2.md) 二十三、二十四：
> 第一版要粗但核心闭环不能缺；托管选型的商用限制；
> **CF Pages 根目录没有 `404.html` 会被当成 SPA**，所有无效路径返回首页且 HTTP 200。

### 硬规则（全文，含「为什么」；`SKILL.md` 只留摘要）

| 规则 | 为什么 |
|---|---|
| **用户指定模板则从模板起站，未指定则用默认 shadcn monorepo 初始化命令**（3.1 第 1 条）；两种方式都必须在 journal 完整记录；禁止另用 `create-next-app`、`create-vite` 等脚手架，模板自身的栈须说明、不算此类痕迹 | 起点可追溯；模板按自带说明适配实际结构，下游运行与占位验收不放松 |
| **GitHub 私有仓强制**：`gh repo create <name> --private`；要公开必须用户明说 | 未上线项目的仓库里带着选题、竞品调研与定价策略，公开等于把选题送人 |
| **不重复造轮子**——功能层面先查三方库、现成服务、工具包，再自写 | 自写的登录、支付、邮件、图片处理一定比现成的差，且要自己维护；能力缺口先 `find-skills` |
| **做页面级设计时先浏览外部组件库参考站**（[`design-references.md`](../design-references.md)），选 2–3 个案例参考后再实现 | 脚手架搭架子，shadcn 出基础控件，但 Hero / landing page / 动画动效的视觉设计两者都不管；参考真人设计工程师的现成案例再适配，比凭空画省时间且质量稳定 |
| **设计一律走 `/design`，并逐字带上「获奖标准 prompt」**：做整站设计、首页/落地页/内页视觉、改版、配图方案时，先开 `/design` 画布（Design 类型 Artifact，把设计做在画布上；环境里没有该画布就用 `frontend-design` Skill），任务描述里**原文**附上：「整站要达到能在 Awwwards、Webby Awards、FWA 获奖的水平；配图要达到 Dribbble、Behance 精选作品的水准，并且和产品整体风格完全保持一致。通过自我检查不断优化，直至符合这个标准」；配图仍用 `/imagegen` 生成，prompt 风格与站内设计语言一致 | 脚手架和 shadcn 只保证结构与基础控件，视觉水准靠设计环节把关；不写明标准，设计就停在「能用」；配图与整站风格不一致会让页面像拼出来的 |
| **域名做成一处配置留位**：一个常量或环境变量（如 `SITE_ORIGIN`），canonical / `og:url` / sitemap / robots / JSON-LD / 邮箱地址全部从它读；**开发期不接正式域名**，预览域 `noindex` | 域名在段 5 才定稿；散落在代码里的域名字面量换域名时一定漏；预览域被索引会让正式域名上线时撞上重复内容 |
| **无占位红线**：任何页面任何地方不得出现占位链接（`#`、`example.com`、`javascript:void(0)`）、占位文案（lorem ipsum、「待补充」、`Project ready!`、`Hello world`）、占位图片（灰块、`placeholder.png`、`via.placeholder`） | Google 据此判垃圾站，一旦判了整站连坐；而这些东西没人会专门回来改，会一路活到上线 |
| **邮箱唯一约定 `hello@<domain>`**，走 Cloudflare Email Routing（段 5 接） | 站内三处（JSON-LD `contactPoint`、`/about`、外链联络）要用同一个地址，允许多种写法就会出现三处不一致 |
| **任何功能、任何 UI 一律用脚手架自带的 shadcn 组件库**（`components/ui/`）；模板已初始化的 shadcn 配置视为同等有效；库里没有的先 `pnpm dlx shadcn@latest add <组件>` 或装现成的 shadcn / React 生态组件，**禁止手写下拉框、弹窗、日期选择、表格分页这类基础控件** | 脚手架初始化时组件库已经在了，手写一个下拉框等于放弃可访问性、键盘导航、暗色模式和一致的视觉，且每个站各写一遍没人维护 |
| **品牌图标在开发当天做齐**：按 [`stage-4-prelaunch.md`](stage-4-prelaunch.md) 段 4 · A 节制作与核验，段 3 Day-1 D15 当天通过 | 清除全部脚手架默认图标及引用，不能只换 SVG、留下默认 `favicon.ico` 或 manifest 图标 |
| 网站需要任何视觉素材（logo、favicon 源图、og:image、内页配图、用户场景图、插画）→ 加载 `/imagegen` 真实生成 | 占位图是红线，而段 4 要求每页独立 og:image 必须有图，没有生成能力就只剩占位一条路 |
| 邮箱一律 Cloudflare Email Routing 的 `hello@`；新建/绑定域名、接邮箱、上线及现站 review 主动核查 SPF / DKIM / DMARC，按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.6 补齐并验证 | 收信成功不等于防冒充完成；先确认用途与发信子域，CLI 支持则 CLI，否则官方 API |
| **Cloudflare 循环消耗红线**：建站当天按 [§8.9](../cloudflare-stack.md#89-循环消耗与账单熔断红线) 查触发图、持久化终止、共享预算与独立熔断，过 `checklists.md` 对应项后才启用付费后台触发 | 无人访问也可能因 alarm/通知/重试持续计费，前台限流拦不住后台循环 |
| 开发时在实际 API 的共享入口做好输入、大小、超时与权限边界，复用已有防护 | 域名 HTTPS 与线上响应头加固在段 5 绑定正式域名后完成，见 §8.8 |
| **匿名页面 HTML 必须走边缘缓存**（Worker 里 `caches.default` match/put），不能每次请求都冷启动加现场 SSR | Workers 每个节点冷启动 + 现场 SSR，不缓存则 TTFB 随地区漂 1 秒以上；实测两个上线站没做这条，同一页 PageSpeed 在两个节点测出 95 与 78 分，LCP 从 1.7s 拉到 4.7s |
| **脚手架初始化当天必须过完「Day-1 默认清单」**（本文件段 3 · 3.2），判据见 `checklists.md` 段 3 对应行；不是等段 4 上线前体检才补 | 四个同栈站点复盘发现：清单里的项目晚做一天，返工成本呈指数增长——改一处域名硬编码是分钟级，改一批已发布页面的图片格式是天级 |

> 2026-09-30 合并：此表由原 `SKILL.md` 本段硬规则表与本文件原「本段的 N 条硬规则」表去重合并而成，同一条规则只在这里写全文。

### 3.1 初始化项目（原阶段 3）

#### 输入

- 已批准的产品和架构设计。
- 目标目录、包名、运行环境及本机 Node.js/pnpm 状态。
- 现有目录和 Git 状态。

#### 必做动作

1. 仅对确认的绿地目录起站；已有项目不得重新初始化。**(A) 用户指定模板**：本次请求、项目记录（如 `.rankup/PROJECT.md` 的「建站模板」）或用户自己的配置给出 git 仓库地址或本地目录时，按模板自带说明（如 `TEMPLATE.md`）复制、改配置、建资源；journal 记录来源（地址或路径）、版本（提交哈希或标签）与复制/生成命令原文，并说明模板自身的栈。不得替用户默认选模板。**(B) 没有指定模板**：运行以下精确命令，journal 记录命令原文：

   ```bash
   pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer
   ```

2. 检查实际生成的应用、UI 配置、TypeScript 配置和包管理器脚本；Monorepo 核对共享包与 workspace，默认起点核对 TanStack Start 入口。两种起点均须实际跑通 dev/build；模板已有 shadcn 配置同等有效，追加组件仍用 `shadcn add`。
3. 安装后执行类型检查、测试和生产构建中当前可用的项目命令。
4. **审计脚手架的产物路径配置**（见下「脚手架四个坑」第 1 条）。
5. **把站点自身的身份装上去**：`<html lang>` 用段 2 裁定的目标语种（单语站 `en` 或 `en-US`；
   若是扩张期的多语言站，**每个语言路由必须动态设置对应的 `lang` 值**，如 `ja-JP`、`zh-TW`、`zh-HK`，
   简体和繁体中文是不同的 `lang` 值，不能统一写 `zh`——这影响搜索引擎语言识别、
   浏览器字体选择和无障碍朗读语言）、title/description/og 用目标语言实文案、
   404 页本地化、首页替换成真实落地页。用模板时尤其要核对模板占位已全部替换，grep 模板占位站名与文案。
   多语言站另须遵守 [`seo-experiences.md`](../seo-experiences.md) 的「多语言站架构参考（Apple 模型）」条目
   九条规则——URL 子目录结构、hreflang 互指、**禁止根据 IP 自动跳转**（只做顶部横幅建议切换）、
   中文四市场分治等。
6. **域名留位**：新建一个常量/环境变量（如 `SITE_ORIGIN`）和一个索引开关（如 `SITE_INDEXABLE`），
   所有需要绝对 URL 的地方从常量读；预览/开发构建（`workers.dev` 预览域，不是正式域名）把索引开关设为关，
   输出 `<meta name="robots" content="noindex">` 与 `robots.txt` 的 `Disallow: /`。
   **代码里 grep 不到任何域名字面量**是判据。
   **这个开关只用来封锁预览域，不得延伸成"正式域名先上线、验收期间继续关着、以后再手动打开"**——
   正式域名的索引开关默认随部署翻开，不因为批 B（分析/站长工具接入）没做完而拖延，
   原因与替代方案见段 5.4 第 22 条，不要在这里自行加一段"验收期关闭"的逻辑。
7. **无占位扫描**：全仓库 grep `href="#"`、`example.com`、`lorem`、`待补充`、`placeholder`、
   `Project ready`、`Hello world`，命中的每一处要么换成真实内容要么删掉整个区块——**不允许「先留着」**。
   完整类型清单与 grep 正则见 [`discipline.md`](../discipline.md) 十四。**写页面时不得先写占位再回填**：
   内容没准备好就不渲染该区块，不写占位等以后补——占位一旦上线大概率没人会再回来补。
8. **初始化版本控制与远端**（见下「Git 与远端」）。
9. 将实际结构与初始架构记录对账，不假定模板输出永远不变。
10. 初始化搜索发现所需的页面日期清单、带 lastmod 的 sitemap 与仓库内 `scripts/indexnow-submit.mjs`，本地 ship 和 Workers Builds 部署命令都接好推送；具体操作只按 [IndexNow 发布流程](../search-platforms.md#挂进发布流程这一节是规则不是建议)。

#### 脚手架四个坑（每一条都实际踩过）

1. **产物目录与缓存配置对不上，表现为构建缓存永不命中。**
   预设的构建编排配置里写死的输出目录，可能与当前构建工具版本的实际产物目录不同
   （模板更新滞后于构建工具升级是常态）。症状是每次全量重建，外加一条
   `no output files found for task` 的**警告**——警告不是错误，于是被无视很久。
   **判据：脚手架跑通后立刻连跑两次构建，第二次必须命中缓存。** 没命中就去核对输出目录配置。

2. **脚手架的 `init` 会交互式追问项目名，并把项目建成一个子目录。**
   非交互环境下它会挂在提示符上直到超时。用它的 `--name` 参数跳过。
   而「建成子目录」这一条决定了**目标目录已经有内容时（例如已有项目记忆目录）不能就地初始化**：
   要先在别处生成，再把内容搬进去。
   **搬运时排除依赖目录**——跨文件系统的 `mv` 等于全量复制，几百 MB 白搬；
   到位后重新安装依赖，是秒级操作。

3. **暗色模式默认不跟随系统。** 主流组件库预设按类名切换主题，
   而不是 `prefers-color-scheme`，需要一个 theme provider 才生效。
   **必须实测**：把浏览器配色切到 dark 看页面变不变。不测就会把「预设支持暗色」
   当成「这个站支持暗色」，两者不是一回事。

4. **预览/开发服务配置的工作目录是会话的主工作目录，不是项目子目录。**
   在父目录下管多个项目时，直接写包管理器命令会在父目录里执行并报一个
   指向**完全无关的另一个项目**的 `ENOENT`——错误信息把人带向错误的方向。
   用包管理器的「指定目录」参数把目录显式写进启动参数里。

#### Git 与远端

**脚手架跑通、类型检查与构建都过之后，立刻建仓并推远端**，不要等「做出点东西再说」。
理由是这个阶段的产出（脚手架版本、预设参数、你为修坑做的改动）恰恰是最难凭记忆重建的，
而它此时只存在于一台机器上。

1. 脚手架通常会自带一个本地仓库与一条初始提交，**先确认，不要重复 `git init`**。
2. **提交前扫一遍将要入库的内容**：令牌、密钥、账号配置、代理地址一律不得入库；
   确认忽略规则覆盖依赖目录、构建产物与本地环境文件。
3. 建远端仓库，**强制私有**：`gh repo create <name> --private --source . --push`。
   要公开必须是用户明确说出「公开」；「默认」「随便」「你看着办」都是私有。
4. 项目记忆目录**随仓库一起提交**——它是这个项目最贵的资产，留在单机上没有意义。
   建 git 仓库或初始化 `.rankup/` 时运行 `node "<rankup-skill-dir>/scripts/maintain/rankup-clean.mjs" --project-root . --install-hook --write-gitignore`，装好 `pre-commit` hook 与 `.rankup/.gitignore` 模板，挡住截图、日志和原始过程数据。
   例外仍然是那条老规矩：跨项目资产登记表与真实凭据永不入库。

#### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| 1 | 建站起点有据可查：journal 有 (A) 用户指定模板来源、版本与复制/生成命令原文，或 (B) 上面那条 shadcn 精确命令原文，**缺记录不通过**；没有其他脚手架痕迹（模板自身的栈不算，但须说明）；只在确认过的绿地目录执行；已有项目**没有**被重新初始化 | 项目仓库 + journal 完整记录 |
| 2 | 实际生成物已逐项核对（应用、UI 配置、TS 配置、脚本；Monorepo 核对共享包与 workspace，默认起点核对 Start 入口），不假定模板输出与文档一致 | 项目仓库 |
| 3 | 类型检查、测试、生产构建里当前存在的命令都真跑过并通过 | 命令输出 |
| 4 | 产物路径配置已审计（见「脚手架四个坑」第 1 条），部署产物指向的是真实构建目录 | 项目仓库 |
| 5 | `<html lang>` 是段 2 裁定的语种且多语言站按路由动态设置（`zh-TW` / `zh-HK` 不合并成 `zh`）；title/description/og 是目标语言实文案；404 已本地化；首页是真实落地页 | 项目仓库 |
| 6 | 域名只存在于一个常量/环境变量里，**全仓库 grep 不到域名字面量**；预览构建输出 `noindex` 与 `Disallow: /`，且这两处都由同一个索引开关控制 | 项目仓库 + 预览域 `curl` |
| 7 | 无占位扫描零命中：**没有 `href="#"`、`example.com`、lorem、「待补充」、占位图、`Project ready!` / `Hello world`**（完整类型与正则见 [`discipline.md`](../discipline.md) 十四）；页面上每个链接都指向真实目标，每张图都是真实内容；**没有先写占位再回填的区块**——写页面时内容没备好就不渲染该区块 | grep 输出 + 预览域逐页 |
| 8 | 远端已建且**私有**（`gh repo view --json isPrivate` 为 true），脚手架状态已推送，`git log origin/HEAD..HEAD` 为空；公开的话 journal 里有用户明说的原话 | `git remote -v` |
| 9 | 实际结构与 `architecture.md` 已对账，差异要么改代码要么改文档，没有放着不管 | `.rankup/architecture.md` |

### 3.2 建立 Cloudflare 全栈基础（原阶段 4，域名部分已移到段 5）

#### 输入

- 已验证的项目结构与架构。
- Cloudflare 账户、目标环境和非敏感资源标识。
- 数据、对象、异步任务、一致性和密钥需求。

#### 必做动作

1. 按 `cloudflare-stack.md` 将 TanStack Start SSR/API 接入 Workers 和 `@cloudflare/vite-plugin`。
2. 按需创建并绑定 D1、R2、KV、Queues、Workflows 或 Durable Objects；不用 KV 保存事务事实。
3. 为 preview、staging、production 分配隔离资源并核对 binding 名称。
4. 每次变更 bindings 后运行 `wrangler types`，让应用类型与真实配置一致。
5. 为 D1 建立迁移并分别验证目标环境；真实密钥只进入 Worker Secrets、Secrets Store 或 CI secrets。
6. 建立本地开发、预览、部署、观测和回滚命令。
7. **部署到预览域**（`workers.dev` 或预览 URL），不绑 custom domain；**域名接入（zone / NS / DNSSEC）在段 5**，
   这里不做——`wrangler deploy` 到 `workers.dev` 不需要 zone。
8. **匿名页面 HTML 接入边缘缓存（Cache API）**：按 [`cloudflare-stack.md`](../cloudflare-stack.md)「12. 匿名页面 HTML 边缘缓存（Cache API）」在 Worker 里用 `caches.default` match/put，不能只让 SSR 每次现场跑。

#### 脚手架初始化当天默认清单（Day-1，2026-09-12 回流）

按[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域)把 [`no-wip-check.mjs`](../../scripts/no-wip-check.mjs) 单文件拷贝进项目，构建后执行 `node <检查脚本> <渲染产物目录>`；SSR/动态路由先导出 HTML，另传 sitemap/feed 与 llms.txt。Day-1 即核设计稿与功能入口，水合后文案再回读，不能只扫组件源码。

**这一节的来源是四个同栈站点（TanStack Start + Cloudflare Workers + shadcn monorepo）上线后靠 review 才修回来的问题，逐条实测复现。** 结论：这些不是「上线前体检该抓的漏项」，是脚手架跑通那天就该定死的默认项——晚做一天，返工成本呈指数增长（改一处域名硬编码是分钟级，改一批已发布页面的图片格式是天级）。下表只写规则与为什么，**客观通过条件统一在 [`checklists.md`](../checklists.md) 段 3 对应行**，两处不重复。已有独立成文的规则（边缘缓存见上一条第 8 步、字体字节预算见 [`seo-box.md`](../seo-box.md) 一、分析脚本延迟加载见 [`analytics-platforms.md`](../analytics-platforms.md)、AITDK 闸门 4c 与闸门 6 硬判据见 `checklists.md` 段 4、占位专项见本文段 3 · 3.1 第 7 条）本节不重复展开，只给一句引用。

| # | 规则 | 为什么 |
|---|---|---|
| D1 | **域名与索引开关共享构建期配置**：`SITE_URL` 与索引开关（如 `ALLOW_INDEX`）经 vite `define` / `import.meta.env` 注入服务端及客户端，缺域名时构建失败，不回落占位值；分别构建 production 开与 preview 关，覆盖没有 `process` 的浏览器环境；依次比较 SSR、真实浏览器水合后与点击站内链接的 SPA 导航 head | 构建期表达式外再包 `typeof process` 等运行时分支可能使浏览器走错回退。必须读取完整 canonical、robots 及响应头，不能仅找到一条正确标签；判据见 `checklists.md` D1 |
| D2 | 边缘缓存中间件随脚手架当天就位，不留到上线前 | 见本节上一条第 8 步与 [`cloudflare-stack.md`](../cloudflare-stack.md)「12. 匿名页面 HTML 边缘缓存」，不重复展开；提醒一点本节独有的坑：**HEAD 请求不会命中这条缓存路径**（多数实现只对 GET 建缓存键），验证边缘缓存生效必须用 GET，用 HEAD 验证会得到假阴性 |
| D3 | Web 字体策略当天定死：CJK 站默认系统字体栈；拉丁站自托管、子集化到实际用到的字符与字重、`font-display: optional`、只 `preload` 首屏用到的那一个字重或干脆不 `preload` | 判据与字节预算见 [`seo-box.md`](../seo-box.md) 一，不重复；**本节补一条实测细节**：`preload` 本身会抢在 HTML/JS 前面占带宽，实测反而把 LCP 推后了一个 RTT——「先 preload 保险」是一个直觉上正确、实测上有害的默认动作，脚手架初始化当天就不该无脑加；品牌/装饰字体按 seo-box 一的两全法：首屏后 FontFace 加载 + 子集 + 度量匹配 |
| D4 | 第三方分析脚本（GA4、Clarity 等）统一延迟到首次交互或 6 秒兜底再加载，Cloudflare Web Analytics 关掉 `auto_install`；共享加载器从第一版具备幂等加载与 SPA 导航处理 | 首屏和真实 SPA 切页都须验证去重与远端实际上报；API 开关关闭不证明 HTML 无注入。操作见 [`analytics-platforms.md`](../analytics-platforms.md)，判据统一见 `checklists.md` 段 5「分析通道在采集」 |
| D5 | **图片与首屏视频默认**：页面内的 logo、hero 图、装饰图一律 WebP + PNG 回退（favicon 格式见 D15），按实际显示尺寸出图（含 2x 视网膜档），标注 `width`/`height`；首屏 LCP 图给 `fetchpriority="high"`，其余给 `loading="lazy"`；`og:image` 单独生成，不进首屏渲染路径；首屏大视频同样必须压缩 | 图片与大视频是最容易在脚手架阶段被忽略的默认项——设计稿或占位阶段随手塞进去的原图/原片往往是未压缩的源文件。**实测两个站的 logo 分别是 650KB 与 1.1MB，且都直接被用在首屏**；**【实测，2026-11-13】某站首屏大视频从 13.2MB 压到 2.4MB，但移动端 Lighthouse 分数没变，因为真正卡点在 unused JS**——压缩大媒体省带宽与起播等待，不能代替 JS 减重 |
| D6 | **数据体量**：题库、条目库这类大数据绝不进入口 bundle；按路由或按项懒加载；路由 loader 取到的数据随 HTML 一起 dehydrate 给客户端，客户端不再用 `import()` 二次拉取；SSR 只发当前页真正需要的字段。**路由组件必须在 `createFileRoute(...)({ component })` 里直接静态引用**，不能由工厂函数（如多个路由共用同一个 `createXRoute()`）间接返回 | 入口 bundle 体积直接决定首屏 JS 执行时间；**实测按项拆分成独立 chunk 后客户端反而多了一跳网络请求，比不拆分更差**——正确做法是让 loader 阶段就把数据打进 HTML（SSR dehydrate），而不是打散成很多小 chunk 靠客户端各自 `import()`。**【实测】`component` 由工厂函数返回时，TanStack Router 的自动代码拆分完全不生效**：该组件会被整个打进主 chunk，所有页面都要下载它，不管这条路由是否真的被访问到 |
| D7 | **DOM 与动画**：列表/网格卡片的缩略图用单个 SVG 或 canvas 绘制，不逐格套 `div`；首屏之下的内容用 `content-visibility: auto` 配 `contain-intrinsic-size`；动画只动 `transform`/`opacity`；不做把主内容压在 `opacity: 0` 上做入场动画的写法 | **实测某首页把 2,700 个 DOM 节点压到 760 个**，直接改善解析与布局耗时；把主内容初始状态设为 `opacity: 0` 再靠 JS 动画淡入，是「Googlebot 首次渲染读到空内容」的常见成因之一；同理，首屏内容如果靠定时 `animation-delay`（1–5 秒）淡入，会在 Lighthouse trace 窗口内制造新的 LCP 候选、拖高 Speed Index，判据见 [`seo-box.md`](../seo-box.md) 一 |
| D8 | **CSS**：Tailwind 的 `content` 扫描范围收紧到实际用到的目录；CSS gzip 后体积在约 10KB 以内时整份内联进 SSR 输出的 `<style>`，体积更大时走关键 CSS 提取；两种做法都必须**实测后**定，不能凭经验直接选一种 | **实测两个方向都出现过**：40KB 级别的内联样式表反而拖慢了首屏渲染（阻塞解析的内联体积过大）；而一个 8.5KB 的内联样式表省掉了一次渲染阻塞的外部请求、净赚一段 LCP。判据是「先测再定」，不是「小站一律内联」或「一律外链」；文档本身超出约 14.6KB brotli 的 Lantern 初始拥塞窗口也会多算一跳 RTT，同文档内去重 SVG 对此几乎无收益，见 [`seo-box.md`](../seo-box.md) 一 |
| D9 | **路由与协商**：所有尾斜杠路径 301 规范化到无尾斜杠（或反之，全站统一一种）；`Accept: text/markdown` 这类内容协商中间件对 404 或未知路径不许返回 500，也不许让非 `text/html` 的 `Accept` 落到框架默认 handler | **实测 TanStack Start 对不含 `text/html` 的 `Accept` 头会直接 500**——这不是业务代码的 bug，是框架默认行为，脚手架接入协商中间件那天就要显式处理这条分支，否则任何带非常规 `Accept` 头的抓取（包括部分 AI 抓取工具）会看到一片 500 |
| D10 | **sitemap 策略**：只放有独立搜索意图的**可索引规范页**（首页、核心分类/落地页、说明/法律页），**不放分页与无独立搜索意图的分类列表堆积**（【实测，2026-11-13】某站排掉分页/分类列表后从 261 条压到 81 条）；模板化生成的内页（题目页、条目页这类）默认不进 sitemap，靠分类页的内链承接，等 GSC 收录比例证明值得单独收录后再补进去；sitemap 用运行时路由动态生成，不用构建脚本写死成静态文件 | 构建脚本生成的静态 sitemap 容易在加页面时漏跑，页面已经上线但 sitemap 里没有是最常见的静默失效；「一个关键词对应一个内页」（见本文段 4）不等于「每个模板化内页或分页列表都要单独进 sitemap 抢收录预算」，两者是不同层面的判断，见段 4「一个关键词对应一个内页」一节 |
| D11 | **og 图渲染**：`workers-og` / `satori` 这类边缘渲染方案不支持阿拉伯语等需要复杂文字整形的书写系统；CJK / RTL 站上线前先验证一张真实渲染结果，渲不出来就退回静态图；渲染失败必须报错，**不许吞成 0 字节但状态码 200 的响应** | og 图渲染失败但返回 200 是最隐蔽的一类失败——分享卡片显示空白，抓取脚本却测不出问题，因为 HTTP 层面一切正常 |
| D12 | **JSON-LD**：统一走路由 `head()` 的 `scripts` 字段注入，类型按实际内容选择。逐类模板查 [Schema.org](https://schema.org/docs/schemas.html) 的类型、属性 domain / 继承关系与值类型，用 [Schema Markup Validator](https://validator.schema.org/) 核验；适用 Google 富结果时另按 [Google 对应类型文档及工具](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data) 核必需字段。Organization 联系资料、sameAs、作者与日期只写真值 | **合法 JSON 不等于 Schema 语义合法**；不能为消除 warning 伪造类型、评价或必需字段，无真实内容支持的标记应删去。语义判据见 `checklists.md` D12，内容形状另见闸门 4b |
| D13 | **a11y 从组件第一版就带上**：role 与 aria 属性按实际语义设置；交互网格按 `grid → row → gridcell` 组织，不能把格子直接挂在 grid 下；纯装饰图片给空 `alt=""` | 用真实 DOM 检查父子语义，再操作方向键、焦点、输入与相关按钮；增加 row 包装后同步回归布局和点击坐标，不只 grep 属性存在。判据见 `checklists.md` D13 |
| D14 | **部署与仓库卫生**：Workers Builds 的 Git 集成接好并在 `wrangler.jsonc` 里用注释记下接入日期；`lint`/`test` 命令脚手架跑通当天就要是绿的，并且进 `ship` 命令；`.env`、`.cf-token` 这类凭据文件必须在第一次提交前就写进 `.gitignore` | 这几项对应的失败形态都是「越往后越难补」：`ship` 脚本第一版没接 lint/test，后面加进去要重构整条命令链；凭据文件第一次提交时没 gitignore，事后清理 Git 历史比当天多写一行 `.gitignore`贵得多 |
| D15 | **品牌图标当天做齐**：按段 4 · A 节完成图标资产和引用，清除 React / Vite / TanStack 脚手架默认图标；上线前再过图标专项 | 新 SVG 正常显示，不能证明根 favicon.ico、其他 head 引用或 manifest 没有旧图；默认图标必须在开发当天清掉 |

#### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| 1 | SSR/API 已接进 Workers 与 `@cloudflare/vite-plugin`，预览环境能返回真实 SSR HTML | `.rankup/infrastructure.md` |
| 2 | 每个创建的存储都有需求对应；**事务性事实没有放在 KV 里**（它是最终一致的） | `.rankup/architecture.md` |
| 3 | 三套环境的资源相互隔离，binding 名称逐个核对过，**没有 preview 指向 production 数据** | `wrangler.jsonc` + 面板 |
| 4 | 最近一次 bindings 变更之后跑过 `wrangler types`，类型与真实配置一致 | 命令输出 |
| 5 | D1 迁移在目标环境**分别**验证过；真实密钥只在 Worker Secrets / Secrets Store / CI secrets 里 | `.rankup/secrets.md` |
| 6 | 本地开发、预览、部署、观测、回滚五条命令都存在且真跑过一次 | `package.json` |
| 7 | 预览域可访问且返回 `noindex`；**`wrangler.jsonc` 里没有 custom domain / routes 指向正式域名** | 预览域 `curl` + `wrangler.jsonc` |
| 8 | 匿名页面线上连续两次 `curl` 第二次带 `x-edge-cache: HIT` 且 TTFB 明显下降 | `.rankup/infrastructure.md` |
| 9 | Day-1 默认清单（D1–D15）逐条核对，客观通过条件见 [`checklists.md`](../checklists.md) 段 3 对应行；**没有跳过任何一条也没有留到段 4 才做** | `checklists.md` 段 3 |

### 3.3 开发与测试（原阶段 5）

#### 输入

- 可执行计划、验收标准、架构和已配置的开发/预览环境。
- 当前测试、类型检查、lint 和构建命令。

#### 必做动作

1. 将功能拆成小步实现，每步先定义可观察结果。
2. 覆盖核心业务逻辑、API、SSR、水合、数据访问、权限和错误路径。
3. 对 D1 迁移、R2 上传、异步处理和环境差异做集成验证。
4. 运行类型检查、单元测试、集成测试和生产构建；不得隐瞒失败或把不相关旧失败归因于本次改动。
5. 对关键页面与交互做真实浏览器或等价端到端验证。
6. **维护一份真实输入回归集**：用户给过的真实输入（URL / 文件 / 查询 / 样例）与浏览器里亲眼核过的预期，
   随仓库提交为 fixture；改了核心逻辑（解析器、API、即将上线的新功能）就全量跑。
   新输入先在浏览器看清内容再填预期，**预期由浏览器判定，不由脚本自证**。
7. **做内页随手清单**：按[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域)核入口与实现、回读设计稿，并用构建期检查器重扫渲染产物；新增内页连带动作见[段 4 随手清单](stage-4-prelaunch.md#新增内页--新模板的随手清单2026-09-12-回流)。每加一个页面或区块就重跑 3.1 第 7 条的无占位扫描——占位是开发期最容易长出来的东西。

#### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| 1 | 每个小步都**先**写下可观察结果再动手，做完逐条对照——先写后做的顺序能被看出来 | `.rankup/plan.md` |
| 2 | 核心逻辑、API、SSR、水合、数据访问、权限、错误路径七类都有覆盖，缺的类别写明为什么不需要 | 测试文件 |
| 3 | D1 迁移、R2 上传、异步处理、环境差异四类做过集成验证，不是只有单测 | 测试输出 |
| 4 | 类型检查、单测、集成测试、生产构建四样都跑过且通过。**失败照实说；旧失败不归因到本次改动** | 命令输出 |
| 5 | 关键页面与交互有真实浏览器或等价 E2E 的验证记录，**不是只由 mock/fixture 证明** | `.rankup/audit.md` |
| 6 | 真实输入回归集在仓库里，本轮动了核心逻辑就有一份全量跑的报告；新输入先进 fixture 再跑 | `.rankup/evidence/live-inputs-<date>/report.json` |
| 7 | 本轮新增页面/区块过了无占位扫描，零命中 | grep 输出 |
| 8 | 本轮新增的每一个 UI 控件都来自 `components/ui/`、`shadcn add` 或已安装的 shadcn / React 生态组件；**没有一个手写的下拉框、弹窗、日期选择、表格分页、Toast**。判据是 `grep -rn "role=\"dialog\"\|role=\"listbox\"\|<select" apps/` 命中的都在组件库内部，业务代码里没有 | 本轮 diff + `components/ui/` 清单 |

### 3.4 集成专项能力（原阶段 6）

#### 输入

- 已确定的支付、邮件、分析、鉴权、搜索、AI 或其他外部能力需求。
- 对应供应商环境、专业 Skill 和验收条件。

#### 必做动作

1. **先查再写**：优先发现并调用专业 Skill；支付使用 Stripe 指南（PayPal 见 [`integrations.md`](../integrations.md)），Cloudflare 操作使用 Wrangler/Workers 指南，能力缺口使用 `find-skills`；
   产品功能层面先查有没有三方库、现成服务、工具包能直接接——**登录、支付、邮件、图片处理、PDF、OCR 这类一律不自写**。
2. 记录非敏感资源 ID、模式、环境、webhook 路径、权限范围和负责人。
3. 密钥真实值只写入批准的 secret store；项目文件仅记录名称和存放位置。
4. 分别验证成功、失败、重试、幂等、权限拒绝和供应商超时路径。
5. 支付资源必须用目标环境凭证核对 test/live 模式、金额、币种和周期；Web/站外直销按 [`monetization.md`](../monetization.md) 选主通道并准备可用备份（Stripe 直连、Anyway 与 PayPal 按支付责任和目标市场选用；2026-09 修订，此前写「Stripe 与 PayPal 两个都接」）；App 商店按目标市场的 IAP/买断/订阅规则。

#### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](../checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| 1 | 动手前查过有没有现成 Skill / 三方库 / 现成服务（支付→Stripe+PayPal，CF→Wrangler，缺口→`find-skills`）；**没有重写一遍别人已经封装好的东西**，自写的每一项都写了「为什么现成的不能用」 | 本轮 journal + `.rankup/decisions.md` |
| 2 | 资源 ID、模式、环境、webhook 路径、权限范围、负责人六项记全，**记的是 ID 不是名字** | `.rankup/integrations.md` |
| 3 | 密钥真实值只在批准的 secret store；项目文件里只有名称与存放位置 | `.rankup/secrets.md` |
| 4 | 成功、失败、重试、幂等、权限拒绝、供应商超时六条路径**分别**验证过，不是只跑通了 happy path | `.rankup/integrations.md` |
| 5 | 支付用目标环境凭证核对过 test/live 模式、金额、币种、周期四项；**没有拿 test 凭证的结果当 live 证据**；所选主通道与备份通道各有一条验证记录 | `.rankup/integrations.md` |

### 输出

- 项目 Monorepo 源码与配置；**一个私有远端的 Git 仓库**，当前状态已推送。
- Worker、Wrangler、bindings 和迁移配置；预览域可访问且 `noindex`。
- 业务代码、测试与真实输入回归集。
- 集成代码与测试。
- `.rankup/architecture.md`、`.rankup/infrastructure.md`、`.rankup/integrations.md`、`.rankup/secrets.md`（仅元数据）
- `.rankup/audit.md`、`.rankup/plan.md`、`.rankup/decisions.md`、`.rankup/journal/<date>.md`

### 完成门禁

建站起点的 journal 完整记录通过，生成目录与目标目录一致，实际项目结构可被包管理器识别（Monorepo 核对应用和共享包），开发/构建脚本真实可运行，
用户已有文件没有被覆盖，**连续两次构建第二次命中缓存**，**站点身份是段 2 裁定的语种而非模板占位**（用模板时尤其要核对模板占位已全部替换），
**全站无占位链接/文案/图片**，**域名只存在于一处配置且预览域 noindex**，
**远端仓库私有且当前状态已推送**；
本地或预览环境能够执行真实 SSR/API 路径；所有声明的 bindings 均可被类型检查并完成最小读写验证；环境资源没有意外交叉；密钥扫描确认仓库和 `.rankup/` 中不存在真实密钥值；
目标验收场景通过，相关回归检查和生产构建通过；未解决问题有明确证据、影响和处置计划；关键路径不仅由 mock 或 fixture 证明；
集成在目标环境完成端到端验证；回调签名、幂等和错误路径有证据；资源模式与环境一致。

### 交给下一段的

| 交给下一段的 | 下一段会怎么用它 | 如果这项缺失会怎样 |
|---|---|---|
| 可访问的预览域（`noindex`）与私有远端仓库 | 段 4 的全部体检在预览域上跑；每次改动都有 SHA 可关联 | 段 4 没有可体检的对象，只能在本地产物上跑，测不到边缘层的真实 HTML |
| 域名留位常量与索引开关 | 段 5 定稿域名后只改这一处，放开索引也只翻这一个开关 | 换域名 / 放开索引要满仓库找字面量，漏一处就是一个指向预览域的 canonical |
| 通过测试和生产构建的业务代码、`.rankup/integrations.md` 里的资源 ID 与 test/live 归属 | 段 5 部署 production 时确认接的是 live 而不是 test 凭证，并逐条核对集成在线上真实可用 | production 误用 test 凭证，支付表面正常实际不生效，且不容易被发现 |
| `.rankup/audit.md` 里未解决问题及其影响 | 段 4、5 判断这些遗留问题是否会影响体检与上线 | 一个已知但未记录的缺陷在上线后才被重新发现，且失去了「早就知道」的上下文 |

