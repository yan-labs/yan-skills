# Cloudflare-first 全栈架构

## 目录

- [1. 默认项目脚手架](#1-默认项目脚手架)
- [2. 页面渲染与 API：静态优先，Worker 只管动态](#2-页面渲染与-api静态优先worker-只管动态)
- [3. 按需求选择资源](#3-按需求选择资源)
- [4. cf CLI、Wrangler 和 bindings 工作流](#4-cf-cliwrangler-和-bindings-工作流)
- [5. D1 数据与迁移](#5-d1-数据与迁移)
- [6. R2 对象与上传](#6-r2-对象与上传)
- [7. KV、Queues、Workflows 与 Durable Objects](#7-kvqueuesworkflows-与-durable-objects)
- [8. 环境隔离](#8-环境隔离)
- [8.5 接入域名 · 8.6 品牌邮箱（已下沉）](#85-接入域名--86-品牌邮箱已下沉)
- [8.7 Cloudflare 的 AI 爬虫阻止（边缘拦截与 robots.txt）](#87-cloudflare-的-ai-爬虫阻止边缘拦截与-robotstxt)
- [8.8 基础安全：主动补齐，按用途取舍](#88-基础安全主动补齐按用途取舍)
- [8.9 循环消耗与账单熔断红线](#89-循环消耗与账单熔断红线)
- [9. 部署（已下沉）](#9-部署已下沉)
- [10. Live verification：真实线上验证](#10-live-verification真实线上验证)
- [11. 已验证的部署陷阱(2026-08 回流)](#11-已验证的部署陷阱2026-08-回流)
- [12. 匿名页面 HTML 边缘缓存（Cache API）](#12-匿名页面-html-边缘缓存cache-api)

本文件定义 `rankup` 新网站的默认运行平台和资源选择方法。Cloudflare-first 的含义是：没有已批准的例外时，公开内容页静态优先，Worker 承载 API 与必须动态的页面，数据、对象存储、异步任务和部署统一使用 Cloudflare；它不意味着预先创建全部 Cloudflare 产品。每项资源都必须由当前需求驱动，并在目标环境完成真实验证。

## 1. 默认项目脚手架

建站起点由用户选择，仅在确认的空目录或绿地项目中执行；已有网站不重新初始化：

- **(A) 用户指定模板**：本次请求、项目记录（如 `.rankup/PROJECT.md` 的「建站模板」一项）或用户自己的配置给出模板 git 仓库地址或本地目录时，从该模板起站，按模板自带说明（如 `TEMPLATE.md`）完成复制、改配置和建资源。journal 必须记录模板来源（地址或路径）、版本（提交哈希或标签）及复制/生成命令原文；模板自身使用的栈须在记录中说明。不得替用户默认选模板。
- **(B) 没有指定模板**：照旧运行以下精确命令，并在 journal 记录命令原文：

```bash
pnpm dlx shadcn@latest init --preset b1D0eCA4 --template start --monorepo --rtl --pointer
```

两种起点都不是成功证明。执行后必须检查实际生成的项目结构、应用目录、UI 配置、TypeScript 配置和 scripts；默认起点还须核对 workspace、共享 UI 包与 TanStack Start 配置，并运行项目实际提供的类型检查与生产构建。模板已有的 shadcn 初始化配置视为同等有效，追加组件仍用 `shadcn add`，UI 只来自组件库的规则不变。两种方式均须通过脚手架真实可运行、站点身份不是模板占位、建设中为零等原闸门；用模板时尤其要核对模板占位已全部替换，grep 模板占位站名与文案。journal 缺完整记录即不通过；不得另用 `create-next-app`、`create-vite` 等脚手架，模板自身使用的栈不算此类痕迹，但必须在记录中说明。已有网站应从当前架构进入对应生命周期阶段。

## 2. 页面渲染与 API：静态优先，Worker 只管动态

### 2.0 默认静态优先（2026-10-27 CPU 降耗回流）

**公开内容页（首页、列表/分类、内页、说明/法律页、工具落地页、sitemap/robots/llms.txt、OG 图）默认在构建时预渲染成静态资产，由 Workers Static Assets 直接返回，不经过 Worker 代码。** 每次请求都 SSR 的 Worker 会把 CPU 花在每个访客、每只爬虫、每次扫描上，而内容页的 HTML 在两次发版之间根本不变；2026-10-27 把 22 个站点改成静态优先后，同一小时的账号 CPU 下降约 71%（见 `.rankup/` 的 `cf-cpu-fix` 报告）。

- **默认路径**：内容页预渲染（TanStack Start / Astro 的 prerender 或 SSG）；工具类页面的交互部分做客户端岛，用户态、生成、支付、上传等走 `/api/*` 由 Worker 处理。Worker 只承载 API、鉴权、Webhook、Cron、Queue。
- **`run_worker_first` 只放动态路径**（如 `/api/*`、`/checkout*`、`/auth*`），其余全部直接命中静态资产；不要用"全站先进 Worker 再回落资产"的写法。
- **需要 SSR 才算例外**，并在 `.rankup/PROJECT.md` 写明原因：页面内容依赖登录态/每次不同的数据且不能拆成客户端岛；页面总量大到构建时间不可接受（先试增量预渲染或只预渲染有流量的页，其余走 §12 的边缘缓存）。例外页面仍要走 §12，不直出。
- **内容更新靠重新构建发布**：数据日更的站（如榜单、日更内容）把更新链路写成"拉数据 → 构建 → 发布"，并在 `.rankup/` 记录触发方式与回读方法。
- **HTTP 语义不能因静态化退化**：上线前对账新旧 URL 全集（sitemap 与实际页面），title/description/canonical/hreflang/robots/H1/JSON-LD 逐项一致，301/410/404 语义保留；`Accept: text/markdown` 之类的内容协商静态资产做不到，需要时用 zone 规则或显式替代入口。
- **边缘兜底**：每个 zone 配一条扫描路径 WAF 规则（`/wp-admin`、`/wp-login.php`、`/xmlrpc.php`、`/.env`、`/.git/` 等，排除 `/api/` 与 `/.well-known/`），让爬虫扫描不进 Worker；按 §8.7 管 AI 爬虫。
- **验收加一条**：造一次请求确认静态页的响应不经过 Worker（Worker 日志/请求数不增长，或 `run_worker_first` 配置读回），并看上线后第一个干净整点的 Worker 请求数与 CPU ms（Cloudflare GraphQL `workersInvocationsAdaptive`），与同期基线对比写进 `.rankup/releases.md`。
- 记新站时：起站模板（`saas-template`）已默认静态优先；改动平台层先回写模板再同步各站。

### 2.1 Worker 承载的部分（API 与必须动态的页面）

- 使用 Cloudflare Workers 承载 TanStack Start 的 API、必须动态渲染的页面和服务端逻辑。
- 通过 `@cloudflare/vite-plugin` 将 Worker 运行时、bindings 和 Vite/TanStack Start 构建串联。
- 配置必须明确 Worker 入口、兼容日期、静态资产、路由或 custom domain，以及各环境 bindings。
- 通过 `cloudflare:workers` 或当前官方集成提供的类型化环境访问 bindings，不把账号 ID、数据库 ID 等环境常量散落在业务代码中。
- 本地开发、预览和 production 的运行时差异必须有显式测试；Node.js 本地通过不代表 Workers 运行时可用。

动态/SSR 页面最小验收不是进程启动，而是请求真实路由后同时确认：

1. 响应状态、content type 和关键响应头正确。
2. 返回的原始 HTML 已包含预期服务端内容，而不是只能依靠客户端 JavaScript 出现。
3. 客户端水合后关键交互正常且没有运行时错误。
4. API 错误与未授权路径不会泄露堆栈、配置或密钥。

### 2.2 New Module Registry（可选 flag，2026-09 关注，本仓库尚未实测）

2026-09-09 Cloudflare 官方博客（`workers-module-registry-nodejs`）宣布重写了 `workerd`
底层的 Module Registry，是 ESM/CJS/Wasm 解析加载体系本身的重写，不是 `nodejs_compat`
的增量升级。核心变化：

- 模块 specifier 按**标准 URL** 解析（之前是类文件路径的私有 mock），因此
  `import.meta.url`、`import.meta.main`、`import.meta.resolve()` 第一次原生可用。
- `require(esm)` 按 Node.js 最新规范工作——CommonJS 与 ESM 混用不再稳定触发
  `ERR_REQUIRE_ESM`。
- 懒编译：未被实际用到的模块不在启动时整体编译，冷启动与内存占用下降。
- 应用体积上限提到**所有套餐 64 MiB**（此前的限制逼着打包器把几百个 npm 包硬编译进
  单文件）。

**这是 opt-in flag，不是默认行为，也没有默认开启日期**：

```jsonc
{ "compatibility_flags": ["new_module_registry"] }
```

已部署的 Worker 不受影响，旧 registry 继续跑；只有显式加这个 flag 才切换。

**对本仓库现有项目的判断（2026-09-11 复核）**：四个同栈 Worker 项目
的 `wrangler.jsonc`/`wrangler.toml` 都只有
`nodejs_compat`，没有人加过 `new_module_registry`；`.rankup/` 里也没有任何项目记录过
`ERR_REQUIRE_ESM`、`import.meta` 报错或因 esbuild 单文件打包导致冷启动变慢的踩坑—— TanStack
Start 的 `@cloudflare/vite-plugin` 构建链目前没有把我们逼到这些墙上，因此**这不是紧急修复
项**，先记录可用性，不主动改现有项目配置。

**什么时候该回来试这个 flag**：以后新引入某个较重的 npm 包（尤其是仍发 CJS 主入口、或
显式用 `import.meta.url` 定位资源的库）在 Workers 上打包或运行时报错、或某个 Worker 冷启动
明显变慢/体积逼近旧上限时，先查是不是撞了旧 registry 的墙，再按上面的判据决定要不要加
`new_module_registry` 单独在预览环境试跑，两条兼容性 flag（`nodejs_compat` 与
`new_module_registry`）互不冲突、可以同时开。

## 3. 按需求选择资源

| 需求 | 默认资源 | 适用边界 | 最小验证 |
|---|---|---|---|
| 公开内容页 | Workers Static Assets（构建时预渲染） | 默认；不进 Worker，不计 CPU | 原始 HTML 含完整内容、响应不经 Worker、URL 与 SEO 对账 |
| API、鉴权、Webhook、必须动态的页面 | Workers | 每次请求计算、路由和服务集成 | API 成功/失败路径、Worker 日志；动态页看真实 SSR HTML |
| 关系型、可查询、事务型数据 | D1 | 用户、订单、内容元数据、关系和迁移 | 目标环境迁移状态及最小读写事务 |
| 文件、图片、导出物、用户上传 | R2 | 大对象与对象生命周期，不作为关系数据库 | 上传、读取、权限、content type、删除/保留策略 |
| 缓存和读多写少配置 | KV | 可接受最终一致性的缓存、特性配置、派生数据 | 命中、失效、过期和源数据回退 |
| 异步事件处理 | Queues | 可重试的后台消费、削峰、解耦 | 生产/消费、重试、死信或失败处置、幂等 |
| 多步骤长流程 | Workflows | 有状态步骤、等待、重试和可恢复编排 | 步骤恢复、重试、幂等与最终状态 |
| 协调状态和强一致实例 | Durable Objects | 房间、租约、计数器、会话协调和序列化写入 | 并发行为、实例寻址、持久化和失败恢复 |
| 密钥真实值 | Worker Secrets、Secrets Store 或 CI secrets | API key、签名 secret、凭证 | 目标环境可访问且仓库/日志扫描无泄露 |

### 强约束

- KV 仅用于缓存或读多写少配置，不能成为订单、余额、权限或其他事务事实的唯一真相。
- D1 保存关系和事务事实；大对象正文放 R2，D1 只保存对象键、所有权和业务元数据。
- Queues 适合事件式异步消费；Workflows 适合需要等待、多个步骤和恢复点的过程。不要仅因“以后可能用”同时引入二者。
- Durable Objects 只在需要协调、序列化写入或每实体强一致状态时使用，不能替代普通 D1 查询。
- Secret 名称、用途、环境、存储位置、负责人、访问状态和轮换信息可以写入 `.rankup/secrets.md`；真实值绝不进入 `.rankup/`、源码、Git、测试夹具、命令行参数或可回传日志。

## 4. cf CLI、Wrangler 和 bindings 工作流

Web 项目的 Cloudflare 工具链需要 `cf` CLI。它覆盖账号级 API（包括 zone、DNS 等），用本仓库 `/cf-cli` Skill 先搜索并核对当前命令。现有项目的构建、bindings 和部署仍按项目锁定的 Wrangler 工作流；装 `cf` 不等于迁移项目。安装 CLI 与 Skill：

```bash
npm i -g cf
npx skills add yan-labs/yan-skills --skill cf-cli -g -y
npx skills add cloudflare/skills --skill wrangler -g -y
npx skills add cloudflare/skills --skill workers-best-practices -g -y
```

项目仍应锁定与其兼容的 Wrangler 开发依赖；全局 Skill 不是项目依赖的替代品。

### Binding 变更顺序

1. 明确业务需求、binding 名称、资源类型和目标环境。
2. 创建或核对目标环境资源，记录非敏感资源标识。
3. 在 Wrangler 配置的正确环境声明 binding。
4. 每次 binding 变化后运行：

   ```bash
   wrangler types
   ```

   如果项目以包脚本或 `pnpm exec wrangler` 固定版本，应使用项目已有的等价命令，但仍须确认 `wrangler types` 实际执行成功。
5. 检查生成类型是否与应用访问名称一致，再运行类型检查和集成测试。
6. 在 preview/staging 做最小真实读写，确认资源没有错误指向 production。
7. 部署 production 后重复生产只读或低风险验证；写入验证使用可识别、可清理且不影响用户的数据。

不得手工修改生成类型来掩盖配置错误，也不得只因 TypeScript 通过就声称真实 binding 可用。

## 5. D1 数据与迁移

- D1 用于关系型数据、约束、索引、查询和需要事务边界的业务事实。
- 迁移文件必须进入版本控制，并保持顺序、幂等预期和回滚/前滚策略清晰。
- 本地、preview/staging、production 的迁移状态分别核对；本地成功不能证明远端已应用。
- 部署前记录待应用迁移、目标数据库和备份/恢复策略。
- 生产迁移后核对迁移列表、关键 schema、读路径与受控写路径。
- 对可能破坏兼容性的 schema 变更使用扩展—迁移—收缩或等价的分阶段方法，避免新 Worker 与旧 schema 短暂不兼容。

完成门禁：目标环境迁移状态与预期一致，应用通过 binding 完成真实查询和受控写入，错误路径不会回退到错误环境或静默丢数据。

## 6. R2 对象与上传

- R2 保存文件、图片、导出物和用户上传；对象键、所有权、content type、大小和业务状态通常记录在 D1。
- 明确上传方式（Worker 代理或受限签名 URL）、对象大小、content type 白名单、权限、配额、生命周期和删除策略。
- 私有对象不得仅依靠难猜 URL；下载路径必须验证授权。
- 上传完成后从实际读取路径核对字节、content type、缓存头和访问控制。
- 对失败、重复上传、超限、恶意类型和孤儿对象制定处置策略。

完成门禁：在目标环境完成真实上传和读取；未授权读取失败；元数据与对象一致；清理或保留策略可执行。

## 7. KV、Queues、Workflows 与 Durable Objects

### KV

只用于允许最终一致性的缓存、派生结果、功能开关和低频配置。必须定义 source of truth、缓存键、TTL、主动失效和未命中回退。验证既包括命中，也包括变更后的失效传播。

### Queues

用于把请求路径与后台工作解耦。消息需携带稳定 ID，消费者必须幂等，并定义重试上限、不可重试错误和死信/人工处理。验收要观察真实消息从生产到消费，而不是只直接调用消费者函数。

### Workflows

用于需要多步骤、等待、重试和恢复的长流程。每一步记录可重复执行边界，外部副作用使用幂等键。验收覆盖步骤失败、恢复和最终状态。

### Durable Objects

用于按实体协调的强一致状态或序列化处理。明确对象 ID 的生成规则、持久化内容、并发模型和迁移。验收需制造并发请求，观察冲突处理与恢复，而不是只测单请求。

## 8. 环境隔离

至少区分开发/preview、staging（若项目需要）和 production：

- 使用独立 D1 数据库、R2 bucket、KV namespace、Queue、Workflow、Durable Object 配置及 secret 值。
- binding 名可以一致，但底层资源 ID 必须属于目标环境；共享资源必须有记录充分的业务理由。
- production 数据不得复制到低环境，除非经过授权、最小化和脱敏。
- preview/staging 支付只能使用测试模式资源；production 使用 live 资源，并以目标环境凭证核验。
- custom domain、workers.dev、回调 URL、CORS、canonical 和 sitemap 必须与环境一致。
- `.rankup/infrastructure.md` 记录非敏感映射，`.rankup/secrets.md` 只记录 secret 元数据。

部署前门禁：

1. 精确目标环境和 Git SHA 已确认。
2. binding 名称和底层资源映射已核对。
3. D1 待执行迁移已核对并有恢复方案。
4. secrets 均存在于目标环境，但输出不包含真实值。
5. 回滚部署或前滚修复路径已记录。

## 8.5 接入域名 · 8.6 品牌邮箱（已下沉）

§8.5「接入域名：把 zone 加进 Cloudflare」（含域名绑定到 Workers 全 API 流程、AI 爬虫 Bot Management 四字段）与 §8.6「品牌邮箱：Cloudflare Email Routing」（含 SPF / DKIM / DMARC）全文见 [`cloudflare/domain-email.md`](cloudflare/domain-email.md)。

## 8.7 Cloudflare 的 AI 爬虫阻止（边缘拦截与 robots.txt）

Cloudflare 的 Bot Management 拦截与托管 robots.txt 是不同层。新 zone 接入时相关开关可能默认开启；robots.txt 放行仍可能让 AI UA 在边缘得到 403。【实测 2026-09-28】

两层设置分别核对：

| 开关 | 位置 | 含义 | 应设为 |
|---|---|---|---|
| Block AI Bots | Security → Bots → Bot Protection | `ai_bots_protection=block` 可在边缘直接给 AI UA 返回 403 | `ai_bots_protection=disabled`；另将 `ai_training`、`ai_search`、`ai_user` 设为 `disabled` |
| 托管 robots.txt | Security → Bots → Managed Content Protection | 可追加 Managed Content 与 Content Signals | 禁用 AI 禁止规则和 `ai-train=no`，保留站点自己的放行规则 |

托管 robots.txt 禁用后，确认没有 `# Cloudflare Managed Content` 和 `Content-Signal: ai-train=no`；Bot Management 四字段按 §8.5 通过 API 关闭并回读。最后用 `ai-crawler-access.mjs` 实测，任何层的 403 都不能算通过。

## 8.8 基础安全：主动补齐，按用途取舍

本节属于段 5 上站后的检查优化：**绑定正式域名并可访问后、上线验收前主动完成**；已上线站在 review 时补查。开发阶段先做好代码输入与接口边界，不要求未绑定域名就配置 DNS / HTTPS。用户只要求基础加固时，以这些适用项为范围，不扩成全面安全审计。先读线上响应、现有规则与实际路由，复用项目共享入口和平台能力，不为基础配置增加依赖。

| 项目 | 默认处理与边界 |
|---|---|
| HTTPS | 按 §8.5 收敛 HTTP / www 到规范 HTTPS，保留路径与查询参数；检查证书有效、无循环，不叠加已有重定向 |
| 类型与来源信息 | 补 `X-Content-Type-Options: nosniff`、`Referrer-Policy: strict-origin-when-cross-origin`；已有更严格且兼容业务的策略保留，先纠正脚本、样式与 API 的 Content-Type |
| 页面嵌入 | 先确认工具是否供其他网站 iframe 嵌入。无跨站嵌入需求才设 `X-Frame-Options: SAMEORIGIN`；需要指定外域时按真实来源配置 CSP `frame-ancestors`，不加冲突的 X-Frame-Options |
| CSP | 保留并核验已有策略；新增时盘点内联脚本、分析、支付、登录与资源域，必要时先 Report-Only。不要为了评分批量套严格 CSP，也不拿放开所有来源冒充有效防护 |
| HSTS | 确认目标主机 HTTPS 稳定后，新增先用短 `max-age`（如 86400）观察；不默认加 `includeSubDomains` / `preload`，不降级已有有效策略。扩展前核对所有子域，回滚须经 HTTPS 下发 `max-age=0`，浏览器已缓存策略不会因删除服务器配置立即失效 |
| 实际 API | 沿共享处理入口核对参数、请求体/上传大小、外部请求超时、对象权限与必要鉴权；URL 抓取还要核对协议、目标及重定向后的地址范围。耗资源接口复用已有服务端限流/额度，按真实入口设阈值；不能把进程内计数当分布式硬限额，不能只信客户端或 Content-Length |
| AI 爬虫 | 不得为了安全开启 Security → Bots 的 **Block AI Bots**；不得用 Bot Fight Mode 或 WAF 拦截 AI 爬虫；托管 robots.txt 不得设置 `Content-Signal: ai-train=no`。按 §8.5 关闭 Bot Management 四字段，再按 [`checklists.md`](checklists.md) 段 5 逐 UA 实测 |
| 账号与凭据 | 可读时核对管理账号双重验证、令牌用途与最小权限；无法读取就注明未核验，不输出秘密，不自行轮换或撤销正在使用的凭据 |

纯前端工具无需为了这轮加验证码；不批量启用攻击模式、全站挑战、国家封禁、封爬虫或复杂 WAF。已发现的真实高风险缺口如无法小改修复，单列证据与影响，不能标成已安全。

**配置与验收顺序**：

1. CLI 支持则用 CLI，否则用官方 API；执行前查当前官方文档与可用权限。按需要精确设置响应头，不为了少一次调用启用捆绑多种响应头的托管开关；启用前核清全部效果，避免夹带不需要的旧机制。复用已有响应头中间件、静态资产 `_headers` 或 Cloudflare Response Header Transform Rules 中实际覆盖目标请求的一处。`_headers` 只覆盖静态资产响应，不能代表 Worker 动态 HTML / API 已覆盖。
2. 先保存现有配置与规则 ID，限定本次主机/路径；能改单条就改单条，必须更新规则集时先读取、合并并保留其他规则与顺序，发现并发变更则重读，不用整表覆盖模板。只填缺项，不削弱已有策略；权限不足时不改用范围更大的凭据绕过。
3. 本地验证本次逻辑，发布后以真实生产 **GET** 回读首页、代表内页、关键 JS/CSS 与适用 API 的状态、响应头和 Content-Type；抽查正常业务与本次新增拒绝路径，涉及嵌入/登录/支付等策略时做相应浏览器回归。兼查正常缓存请求与新版本证据，不把 API 成功或控制台开关当生效。
4. 在 `.rankup/audit.md` / `.rankup/infrastructure.md` 留本次范围、变更前后、规则 ID 或部署版本、验证时间、适用/不适用依据及精确回滚方法；应用代码发布另记 `.rankup/releases.md`。失败先回滚本次改动并复核，不撤销他人规则；未验证项单列，不宣称全面安全。

官方参考：[响应头规则](https://developers.cloudflare.com/rules/transform/response-header-modification/)、[静态资产响应头](https://developers.cloudflare.com/workers/static-assets/headers/)、[HSTS](https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/)。

## 8.9 循环消耗与账单熔断红线

**建站当天、上线前、每次涉及触发链的修改和现站 review 都必须检查；判据唯一源在 [`checklists.md`](checklists.md)「Cloudflare 循环消耗红线」。不能证明会停止的付费后台链路，不得启用或带风险上线；已在线的先隔离问题链路再修。**没有用户访问、测试项目、前台已关闭都不等于后台不计费。优先不建不需要的常驻任务，不为防循环另造一套调度平台。

**来源与证据（2026-10-07）**：【经验·作者自述】[浮世绘 @shmily7 的事故复盘](https://x.com/shmily7/status/2107481028726251762)称无人使用的测试项目因 Durable Object alarm 死循环产生巨额账单。未获得事故代码与完整账单，不推断具体错误行、模型因果或照搬金额。以下终止与预算要求是本 Skill 的防护裁定，类推场景不是原帖已发生的事故。

### 先查触发关系，再查单个函数

从真实入口到副作用画最小触发图（列表即可），包含代码、平台配置和现存任务：谁唤醒谁、写入什么、是否重新触发上游、每次最多派生多少子任务、在哪停止。沿所有调用者追到共享入口；圈出自环、互调、回写与重试边，逐个证明有界。只 grep `while(true)` 或只查 HTTP API 不算完成。

| 高风险关系 | 必查与最小防护 |
|---|---|
| DO `constructor → setAlarm → alarm → setAlarm` | 无待办不续约；完成/取消/过期/熔断后不重挂。构造函数不得无条件开 alarm；核对已有 alarm 与持久化任务状态。下一次时间必须有限且晚于当前时间，并满足业务最小间隔，禁止过去时间、零间隔、错误秒/毫秒与补跑风暴。截止时间、总尝试次数和无进展次数跨唤醒持久化，不因 `setAlarm()` 或重建对象清零；`finally`、异常分支也不能无条件重挂 |
| Queue / Workflow / Cron / DO alarm 相互触发或回投 | 区分平台重试和应用新建任务；新 message ID / 新实例不得重置逻辑任务的总次数。退避并限定重试、总时长、批次与并发，失败进 DLQ 或可恢复的失败状态，不自动无限回灌。定时任务无待办就结束；按业务键幂等与防重叠，明确长期定时任务的每日总量与停用条件 |
| R2 写入 → 通知 → 消费者 → 再写入；日志/告警写回被监听资源 | 输出桶或输出前缀与监听范围隔离，核对实际通知过滤配置；日志与告警也不得反触发自身。不能只依赖“这次处理成功” |
| Worker fetch / service binding / webhook / 重定向互调 | 核对同域回源是否再进自身路由、A→B→A、回调互相通知。URL 抓取检查每一跳目标，回源走不会重入的目标；回调验签并按业务事件幂等。循环路径设跨服务传播的深度/跳数上限与总超时，不能相信客户端提供的无限预算 |
| 前端轮询/重连 → API → D1/KV/R2/AI；爬虫无限 URL 与批量扇出 | 终态停止，超时/离线退避，限定轮询期限、重连、分页、扫描行数、对象数和子任务数；服务端独立设资源额度。拒绝无效路由与无界参数组合；登录、Turnstile、缓存、单 IP 限流均不能替代后台总量控制 |

DO 官方保证至少执行一次，异常自动重试有限；**应用重新 `setAlarm()` 可以开启下一轮，不能把 `retryCount` 当任务总次数**。`deleteAlarm()` 在 handler 内阻止重试仅是 best-effort；停用必须持久化终态，后续唤醒在任何业务读写/外部调用前退出，允许最小有界的控制状态读取与取消操作。已经开始的外部操作不会被取消 alarm 自动撤销。来源：[Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)。

### 三层止损，不能互相替代

1. **逻辑终止**：任务截止时间、跨重启总次数、无进展检测、幂等与扇出上限；所有成功、失败、取消和空任务分支均有明确终态。长驻周期业务按有限窗口续租，不把无限续租当默认。
2. **运行额度**：先复用平台单次 CPU 限额、队列重试/并发上限及已有额度实现；按实测正常需求设置，不照抄平台最大值。为每个任务、项目/环境及账号共享额度建立操作量预算，覆盖调用、读写/扫描行数、存储、日志与第三方 AI。新 DO/任务数量也要有上限，单对象限额挡不住无限创建对象。共享额度必须在副作用前原子预留，崩溃后保守结算，幂等避免重复扣记；持久化计数，不用内存/KV 最终一致计数冒充硬限额。计数器自身的读写、失败重试与日志也计入上界，预算耗尽不能靠不断读预算继续烧钱。按实际服务、存储后端与当前价格计算最坏成本，并留在途并发和计费粒度余量；记录总预算、阈值、控制失效的处置。未知时先查现有预算与官方计费，仍无法证明可控就保持相关自动触发关闭，不默认无限额。
3. **独立熔断与告警**：复用已有控制面提供不依赖出故障任务的紧急停用能力，支持持久化停机；独立看短窗口操作速率、无进展和预算余量，触阈值自动切断生产者与续约，再停止消费者。多项目共享账号必须汇总，preview/staging 默认关闭无人值守付费触发，确需测试则小额度、短有效期、自动过期停用；废弃项目清理 Cron、通知、consumer 与残留 alarm，不能只删前端。监控失联或额度状态不可读时暂停相关高成本任务，不继续放行。通知只作补充，自动止损不得等待邮件或人工。

**平台能力边界**：Cloudflare 预算告警不是消费硬顶，官方说明按前一天用量处理、可能次日才通知；CPU 上限仅限制单次 CPU，不限制请求总量、DO 持续时间或存储费用。Queues 的 `max_retries` 只约束该消息重试，不约束消费者发送的新消息。不能宣称应用预算或报警能绝对封顶整张 CF 账单；严格固定支出需求优先选有真实硬配额且耗尽拒绝的方案，按涉及产品逐项核验，必要时改为固定价格资源（仍核对额外计费项），不能凭“免费层 / R2 无出流量费 / 已设 CPU”作保证。来源：[预算告警](https://developers.cloudflare.com/changelog/post/2026-06-15-budget-alerts-default-on/)、[Workers 计费与 CPU limits](https://developers.cloudflare.com/workers/platform/pricing/)、[DO 计费](https://developers.cloudflare.com/durable-objects/platform/pricing/)、[Queues DLQ](https://developers.cloudflare.com/queues/configuration/dead-letter-queues/)、[R2 通知](https://developers.cloudflare.com/r2/buckets/event-notifications/)。

### 验证与事故停机

先本地故障注入：空待办、持续失败、重复事件、对象重启、过期时间、取消、预算耗尽、跨服务回环；用可执行断言验证触发/读写次数有界、终态不再排程。对照反例也要通过：正常任务仍完成、必要的有限重试仍可恢复，纯静态站没有后台触发则说明不适用，不强装队列/DO/预算系统。再用隔离环境的小额度、短有效期做一次真实熔断，观察至少一个完整调度/重试窗口（记录窗口为何足够），核对控制面与操作指标已停止增长、业务链不再新增任务；不得在生产制造无限循环验证。静态校验不能证明线上不会超支。

发现异常先停触发源、持久化 disabled/终态，取消已知对象 alarm，暂停队列交付并停止生产者/通知/Cron，部署能在后台入口退出的版本；仅撤 HTTP 路由、删 DNS 或只暂停 consumer 都不足。暂停队列仍会接收和存储新消息，存量也可能有费用；清空队列/删除数据另核可恢复性，不用毁数据代替熔断。保留最小脱敏证据，回读操作增长已止住后再修根因、限定恢复；不得赌事后减免。具体停机命令按目标项目资源和当前官方 API 核验，记录在 `.rankup/infrastructure.md`，并将触发图、成本上界、故障测试和真实停机证据记入 `.rankup/audit.md`。来源：[Queues 暂停与清空](https://developers.cloudflare.com/queues/configuration/pause-purge/)。

## 9. 部署（已下沉）

§9「部署」（Cloudflare 原生 Git 集成、Workers Builds、模板与坑）全文见 [`cloudflare/deploy.md`](cloudflare/deploy.md)。

## 10. Live verification：真实线上验证

发布后的完成标准是从真实服务面验证预期结果。按项目适用范围执行：

### 部署与域名

- 核对 Cloudflare 返回的部署/版本状态与预期 Git SHA。
- 请求 workers.dev 和/或真实 custom domain，确认 DNS、TLS、路由和实际服务版本。
- 用版本标识、响应头、ETag、内容哈希或独特页面内容排除旧边缘缓存。

### SSR 与静态资源

- 获取原始响应并确认 HTML 已包含预期服务端内容、canonical、语言、robots 和关键元数据。
- 请求关键 JS/CSS/图片资源，核对状态、content type 和缓存策略。
- 用真实浏览器验证水合、关键交互、错误控制台和移动端路径。

### API 与 bindings

- 验证关键 API 的成功、输入错误、未授权和供应商失败路径。
- 通过应用 API 或受控诊断路径验证生产 D1 读写，而不是只查询本地数据库。
- 在 R2 执行受控上传、读取和权限测试，并清理测试对象。
- 对 KV 检查命中/失效；对 Queues/Workflows 检查异步最终结果；对 Durable Objects 检查需要的一致性行为。

### 鉴权与支付

- 验证登录、登出、会话过期、权限拒绝和回调 URL。
- 支付场景必须从 production API 创建真实目标模式的 Checkout/Payment 流程，并核对 live/test 模式、金额、币种、周期、签名 webhook、幂等和失败处理。
- 未获授权时不产生真实扣款；可以使用供应商批准的生产验证方式或停在明确的授权门禁。

### 观测与回滚

- 检查 Worker 日志、错误率、关键延迟和外部集成失败。
- 在 `.rankup/releases.md` 记录部署 ID、Git SHA、环境、时间、验证项目、结果、已知风险和回滚命令/目标。
- 若关键检查失败，停止扩大流量，执行已批准的回滚或前滚修复，并重新完成整套相关验证。

### 线上完成门禁

只有同时满足以下条件才可宣布上线完成：

1. Cloudflare 部署状态关联到预期提交或版本。
2. 真实域名返回预期 HTML（静态页为预渲染内容）和静态资源。
3. 关键 API 与所有实际使用的 bindings 在目标环境通过验证。
4. 上传、鉴权、支付回调等适用路径通过端到端验证。
5. 监控没有出现阻断性错误。
6. 部署证据和可执行的回滚信息已写入 `.rankup/releases.md`。

构建成功、测试环境通过、Worker 上传成功、控制台显示 Ready 或健康检查 `200` 都不能单独满足此门禁。

## 11. 已验证的部署陷阱(2026-08 回流)

- **Worker 部署下,仓库根的 `_redirects` 完全不生效**:那是 Cloudflare Pages 的约定,Worker 只跑你的入口代码,没有任何东西会去读它。站点从 Pages 迁到 Worker 后,这类文件会安静地留在仓库里,让人以为重定向还在工作——实测表现为一批 404 长期被误判成"搜索引擎还没重爬"。重定向规则必须写进 Worker 入口的路由函数;迁移后要 grep 并删掉 `_redirects`、`functions/` 等 Pages 时代的残留,否则它们会持续误导后来者。
- **自定义 Worker 入口必须在 `wrangler.jsonc` 里声明 `main`**,否则 Cloudflare Vite 插件会打包它自己的默认入口:dev 下一切正常,线上 Worker 却不含你的任何逻辑。判据是**同一路径在 dev 与 `wrangler preview` 下状态码不一致**——出现这个差异就先查 `main`,别去调业务代码。
- **`pnpm deploy` 会被 pnpm 的内置子命令吞掉**:它是 pnpm 自己的命令(把包部署到目录),不会执行你 `package.json` 里的 `deploy` 脚本,而且**返回成功**——于是什么都没发布却一片绿。必须写成 `pnpm --filter <包名> run deploy`。凡是脚本名与包管理器内置命令同名(`deploy`、`pack`、`link`、`add`),都要显式加 `run`。
- **上传成功不等于流量已经切过去**:新版本存在与旧响应仍在服务可以同时为真。判据只有一个——请求真实域名并断言响应内容里含本次的标识,`wrangler` 的输出不算。另外,OAuth 登录拿到的 wrangler 凭据**没有清缓存的权限**,边缘缓存到期前你无法强制刷新;对无哈希文件名的直连资产,这意味着"改完要等",不是"部署失败"。
- **静态资产托管的默认 `Cache-Control` 可能是 `max-age=0, must-revalidate`,连内容哈希产物也一样**:构建工具产出的 `index-<hash>.js` 本该永久缓存——哈希文件名的全部意义就是内容变了 URL 就变——但托管层的默认值会把浏览器缓存整个关掉。后果不是变慢一点:回访用户为**每一个**子资源发一条条件请求、各付一个往返,尽管服务器全部回 304(实测一个静态站的单页受影响子资源 13–21 个)。修法是在资产目录里放 `_headers`(Workers 静态资产原生支持,构建时要被拷进产物目录),哈希产物给 `max-age=31536000, immutable`,**非哈希产物只给有限 `max-age`、不加 `immutable`**——脚本生成的图片、字体会被同名重生成,`immutable` 会让老访客长期拿不到新版。HTML 保持 `max-age=0, must-revalidate` 是**正确**的,不要顺手一起改。
- **`cf-cache-status: HIT` 不能证明浏览器缓存生效**:它证明的是边缘缓存住了,省的是"边缘到源"那一段;`Cache-Control` 管的是"浏览器到边缘",而回访用户的耗时几乎全在后一段。这两层被混为一谈时的典型表现是"看到 HIT 就认为缓存没问题",而实际每次访问都在重新走网络。
- **验证响应头要识别实际缓存与生效层**：改完 `_headers` 可能仍读到旧缓存；随机查询参数仅在缓存键包含该参数时才可能避开旧副本，不能保证重新回源。先看实际 Cache Rules、Worker 缓存键与响应头处理层，再用部署版本、资源哈希、响应内容及可用的缓存状态交叉核实；同时验证正常 URL，不能只验证带参数的请求。必要时精确刷新受影响缓存，不盲目清空全站。按 §8.8 对每类目标 URL 分别回读，其他路径生效不能代表本路径。

## 12. 匿名页面 HTML 边缘缓存（Cache API）

**Worker 响应带 `Cache-Control` 不会自动进 Cloudflare 边缘缓存**——那条头只管浏览器，`cf-cache-status` 对 Worker 直出的响应根本不出现。要真正命中边缘，必须在 Worker 代码里手动读写 `caches.default`（`match` / `put`）。两个已上线的 TanStack Start + Workers 站漏了这一步：HTML 每次请求都冷启动加现场 SSR，不同地区节点测 PageSpeed，TTFB 差 1 秒以上，LCP 从 1.7s 拉到 4.7s。**匿名页面 HTML 几乎 100% 可命中，不做就是白丢这段延迟。**

**适用范围**：GET、无 `Cookie` / `Authorization`、非搜索结果页、非个性化内容——首页、分类/列表页、内页、说明/法律页，以及 `sitemap.xml`、`robots.txt`、`llms.txt`。**排除**：POST、带会话态、A/B 分支、后台/管理页。

**模板要点**（TanStack Start 的请求中间件位置，一般在 `src/start.ts` 附近）：

```ts
// 伪码，落地时按项目实际中间件签名调整
const cacheKey = new Request(
  normalizeUrl(request.url) + `?_v=${BUILD_ID}&_a=${normalizeAccept(request.headers.get("accept"))}`,
  request
);
const cache = caches.default;

const cached = await cache.match(cacheKey);
if (cached) return withHeader(cached, "x-edge-cache", "HIT");

const response = await renderSSR(request);
if (isCacheable(request, response)) {
  const toStore = response.clone();
  toStore.headers.set(
    "Cache-Control",
    "public, max-age=0, s-maxage=600, stale-while-revalidate=86400"
  );
  ctx.waitUntil(cache.put(cacheKey, toStore));
}
return withHeader(response, "x-edge-cache", "MISS");
```

- **缓存键**：URL + 归一化后的 `Accept`（HTML 与 `text/markdown` 分开缓存，和 `Vary: Accept` 保持一致）+ 构建 id（`import.meta.env` 在构建期注入 git sha，新部署自动失效，不用手动清缓存）。
- **默认 `Cache-Control`**：`public, max-age=0, s-maxage=600, stale-while-revalidate=86400`，项目可按流量调整 `s-maxage`。
- **写入用 `ctx.waitUntil`**，不阻塞响应返回。
- **4xx/5xx 一律不缓存**；带 `Set-Cookie` 的响应绝不 `put`。
- **`Vary` 头照常保留**，不因为加了 Cache API 就删。
- 用自定义响应头 `x-edge-cache: HIT|MISS` 做证据——Worker 直出的响应上没有 `cf-cache-status` 可看。

**验证**：

1. 本机 `curl -o /dev/null -s -w 'ttfb %{time_starttransfer}\n' <url>` 连跑两次，第二次响应带 `x-edge-cache: HIT` 且 TTFB 明显下降。
2. 不同出口验证：`curl --resolve <domain>:443:<另一节点IP>` 或用不同地区的代理/沙箱再测一遍，确认不是单一地区的偶然结果。
3. 部署新版本后，第一个请求应是 `x-edge-cache: MISS` 且内容是新版本——用「10. Live verification」里「用版本标识排除旧边缘缓存」的同一套判据核实缓存没有把旧版本焐住。

**坑**：

- **Early Hints 只对可缓存的响应生效**，没做边缘缓存之前配 Early Hints 是空转，先做这条再谈 Early Hints。
- **`caches.default` 在 `wrangler dev` 本地只是内存模拟**，不是真实边缘行为，验收必须在线上做，本地跑通不算数。
- 带 `Set-Cookie` 的响应绝不能 `put` 进缓存——那是把一个用户的会话种给所有访问者。
