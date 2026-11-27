# 生命周期 · 段 3：建站与开发

> 本文件是 [`lifecycle.md`](../lifecycle.md) 的段 3 全文（2026-09-30 从单文件拆出）。开工先做[对账](../lifecycle.md#每段开头的固定动作对账)；闸门判据在 [`checklists.md`](../checklists.md) 段 3，本文件只写怎么做。

## 目录

- 段 3：建站与开发
  - 硬规则（全文，含「为什么」）
  - 两条路：引擎站与自建站

## 段 3：建站与开发

> **动手之前先读** [`experiences/webcafe-topics.md`](../experiences/webcafe-topics.md) 二、九
> 与 [`experiences/webcafe-experiences-2.md`](../experiences/webcafe-experiences-2.md) 二十三、二十四：
> 第一版要粗但核心闭环不能缺；托管选型的商用限制；
> **CF Pages 根目录没有 `404.html` 会被当成 SPA**，所有无效路径返回首页且 HTTP 200。

### 硬规则（全文，含「为什么」）

| 规则 | 为什么 |
|---|---|
| **有建站引擎就先走引擎 MCP**：用户有以 MCP 写站点数据的多站引擎时，建站、改站、加页面、加功能都先接引擎 MCP，先调 `get_guide` 读目录和对应篇，引擎带了预置提示词（如 `new_site`、`write_post`、`ai_saas_site`、`audit_site`）就照着走，用引擎工具写主题、页面和设置，过引擎的发布闸门再发布；不在引擎仓库改代码，不另起脚手架，不从零手写。引擎做不到的，先 `feedback_search` 查有没有人报过，没有就 `feedback_submit` 并告诉用户，由用户决定是否另起独立站。本表其余条（模板、shadcn、Cloudflare 全栈、Day-1）只约束不走引擎的独立站；段 2 立项和段 4 起的线上验收对引擎站照常适用 | 引擎已经带渲染、SEO 发布闸门、发布回滚、统计、收款等能力，从零搭是重复造轮子，还跟引擎升级脱节；改引擎代码会让升级冲突，改坏引擎上所有站 |
| **Web 规则只约束 Web 面**：shadcn、TanStack、Cloudflare 与段 4–6 的网页规则只管网站；macOS 按 `build-macos-apps` 专项 Skill，iOS/iPad 按对应原生工具，商店分发读 [`monetization.md`](../monetization.md) 五；只有 App 时网页项标 N/A（[段 2](stage-2-positioning.md)） | 原生 App 没有 URL、SSR 与爬虫，套网页闸门只会产生假绿或假红 |
| **新站内容页构建时预渲染成静态资产**，Worker 只管 API 与必须动态的页面，每页都 SSR 要写明原因（[静态优先](../cloudflare-stack.md#20-默认静态优先)） | 静态资产没有冷启动与计费放大，SEO 读到的也是完整 HTML |
| **多功能工具站导航先读[侧栏统一规范](../design-references.md#多功能工具站侧栏统一规范)**，当天过完 Day-1 清单，核[建设中红线](../discipline.md#二十一禁止建设中内容与功能区域) | 侧栏模式已经过用户确认，各站各写一套会让导航与键盘行为不一致 |
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

> 同一条规则只在这里写全文；入口与开工卡只给指针。

### 两条路：引擎站与自建站

| 站建在哪 | 第一站 | 闸门 |
|---|---|---|
| 站点引擎（默认） | [`playbooks/build.md`](../playbooks/build.md) 的开工卡与「引擎站步骤」；工具与返回字段见 [`integrations/site-engine.md`](../integrations/site-engine.md) | [`checklists.md`](../checklists.md) 段 3 按「引擎站」列取值 |
| 自建站（回退：引擎做不到、用户指定模板或非网页项目） | [`stage-3-scaffold.md`](stage-3-scaffold.md) 的 3.1–3.4、输出、完成门禁与交给下一段 | 段 3 原判据全部适用 |

上表的硬规则对两条路都适用，标明「只约束不走引擎的独立站」的条目除外。
