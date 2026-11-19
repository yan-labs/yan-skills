# SEO：AI Agent 就绪度扫描

> 渐进式加载：本篇只讲 `is-agentic.mjs` 扫描脚本的全套用法。

```bash
## 扫描并输出报告
node <rankup-skill-dir>/scripts/is-agentic.mjs scan <domain>

## 扫描并存入 .rankup/agentic/<domain>/
node <rankup-skill-dir>/scripts/is-agentic.mjs scan <domain> --save

## 与上次对比
node <rankup-skill-dir>/scripts/is-agentic.mjs diff <domain>

## 查看历史分数
node <rankup-skill-dir>/scripts/is-agentic.mjs history <domain>
```

**评分模型**（满分 100 + 5 附加）：

| 层级 | 分值池 | 含义 |
|---|---|---|
| Essential | 80 分 | AI 代理能否进入、读取、操作公开站点 |
| Recommended | 20 分 | 增强代理交互的最佳实践 |
| Bonus | +5 上限 | 新兴格式，不扣分 |

不适用的检查项自动排除（没有 API 的站不会因缺 OpenAPI 扣分）。

**Essential 检查项**（决定 80% 的分数）：

| 检查项 | 判据 | 怎么修 |
|---|---|---|
| Agent crawler reachability | 主要 AI 爬虫 UA 能访问 | robots.txt 允许 ChatGPT-User / ClaudeBot / Google-Extended |
| Not blocked by bot detection | WAF 不拦 AI UA | 检查 Bot Fight Mode 等防护规则 |
| Content without JavaScript | 原始 HTML 有 H1 + 500+ 字符 | SSR 首页，确保无 JS 也有实质内容 |
| Agent-friendly 404s | 不存在的路径返回真 404（非 200 + 空壳） | 404 页面返回 markdown 正文指向 sitemap/llms.txt |
| Redirect hygiene | 无 meta-refresh / JS-only 重定向 | 全用 HTTP 301/302 |
| Markdown content negotiation | `Accept: text/markdown` 时返回 markdown + `Vary: Accept` | 中间件按 Accept 头协商内容格式 |
| Content behind auth | 内容页无登录墙 | 确保公开页面不跳登录 |

**Recommended 检查项**（常见扣分项）：

| 检查项 | 要点 |
|---|---|
| Sitemap | `/sitemap.xml` 存在且有效 |
| JSON-LD structured data | 首页有 Organization/SoftwareApplication 等身份类型 |
| Trust anchor pages | `/about`、`/contact`、`/privacy` 各 500+ 字符 |
| Metadata completeness | canonical、lang、og:image、og:type 齐全 |
| Content efficiency | 文本占 HTML ≥ 5% |
| Agent instruction / when-to-use | llms.txt 或 agent-instructions 文件说明「什么时候该用我」 |
| Organization schema | 含 contactPoint 和 address |
| Brand name discoverability | 品牌名搜索能找到自己 |

**Bonus 信号**（加分项，对工具站/SaaS 最相关的）：

- `llms.txt` 存在且格式规范、链接可访问
- JSON-LD `sameAs` 指向 GitHub/LinkedIn/Wikipedia
- sitemap 的 `lastmod` 新鲜
- Schema 类型丰富（FAQPage、Service 等）
- HTTP `Link` 头（RFC 8288）
- MCP server / 注册表条目
- OpenAPI spec、SDK 包、CLI 工具
- skills.sh 上架、ChatGPT Apps 上架
- `pricing.md`、`agent.txt` / `agents.md`

**什么时候跑**：

1. **上线后第一次**（lifecycle 段 4 闸门 4 出基线，段 5 绑正式域名后复跑）：存基线，`--save`。
2. **每轮 SEO 优化收尾时**（段 7 · 7.2/7.3）：`diff` 对比改进。
3. **接入新的 AI 代理表面（MCP、OpenAPI、Skills）后**：验证得分变化。

**注意**：llms.txt 对 **Google Search 无用**（Google 官方已否定），对被 ChatGPT 引用也没有收益证据（见 [`seo-ai-search.md`](seo-ai-search.md)），对 AI 代理生态是否有用没有找到可靠来源。成本低，闸门仍按 checklists 执行。
如果你的站点同时追求 Google 排名和 AI 代理可达性，llms.txt 只是一个 bonus 加分项，
不要为了它牺牲 Essential 层级的修复优先级。

#### 两条取分路径，以及一个会让「修完再 diff」失效的缓存

**都实测过（2026-08-22），结论与直觉不同，动手前读完。**

| 路径 | 命令 | 它到底做了什么 |
|---|---|---|
| 原始 CLI | `npx is-agentic <域名>`（加 `--json` 出结构化） | 取**最新已存在的报告**；只有当该域名从未被扫过时才真去扫 |
| 本 Skill 包装 | `is-agentic.mjs scan <域名> [--save]` | **先** `GET is-agentic.com/api/v1/report`，**404 才回退去 `npx is-agentic`**。多出 `--save` 存档、`diff` 对比、`history` 趋势 |

看一眼分数，`npx is-agentic <域名>` 最快，不必动本 Skill 的脚本。
要纳入优化流程做前后对比，才用 `--save` + `diff`。

> **⚠️ 但「修完问题再 `diff` 看涨了几分」这个工作流，在报告已存在时是失效的。**
>
> CLI 自己的帮助原文写着：*Retrieve the **latest** Is Agentic report, **scanning the
> site when none exists**.* 它只有 `--json` 和 `--help` 两个选项，**没有任何强制重扫的开关**。
>
> 实测证据（同一域名、同一天、三条路）：本地存档、报告 API、`npx` 直连
> 三者返回的 `scanned_at` 完全相同（`2026-08-22T13:50:39.325Z`），分数同为 75。
> **也就是说改完代码立刻重跑，拿回来的还是改之前那份报告。**
>
> 后果很具体：你会 diff 出「零变化」，然后得出「我的修复没生效」——
> 而真相是**根本没有重新测量**。这是典型的「测不到 ≠ 没发生」。
>
> **规矩**：
> 1. `diff` 之前先核对两份报告的 `scanned_at` **确实不同**。相同就说明没有新数据，
>    此时任何关于「涨了几分」的结论都不成立。
> 2. 要拿新数据，得去有「重新扫描」控件的地方触发（is-agentic.com 的网页报告页、
>    或 Cloudflare 代理就绪面板的「重新扫描」），CLI 侧目前触发不了。
> 3. 存档文件名按日期命名会掩盖这个问题——**同一天两次 `--save` 可能存的是同一份数据**。
>    判据永远是 `scanned_at`，不是文件名。

**未确认**：is-agentic.com 的报告缓存多久过期、有没有自动重扫周期。只确认了
CLI 侧无法强制刷新。若哪天 CLI 加了 `--force` 之类的开关，这一节要重测重写。

#### 单站分数配一个全网分母：Cloudflare Radar Agent Readiness

`is-agentic.mjs` 给单站打分，报告里会出现「高级集成 0/8」这种读起来像缺陷的行——
但没有分母就看不出这是「你没做」还是「全网基本没人做」。Cloudflare Radar 的
Agent Readiness 端点提供这个分母。

**这不是站点扫描器。** 端点是
`GET https://api.cloudflare.com/client/v4/radar/agent_readiness/summary/CHECK`，
`dimension` 是路径段，枚举只有 `CHECK` 一个值；可选查询参数 `date`、
`domainCategory`、`name`、`format`（`JSON`/`CSV`）。**没有 `url` 参数**——它返回的是
全网抽样域名的聚合通过率，不针对任何具体网站。以为它能审计单个站点是常见误读。

**工具**：`scripts/cf-agent-baseline.mjs`。零配置可跑——按 `--token` 参数 →
`CLOUDFLARE_API_TOKEN` 环境变量 → 本机 wrangler 的 OAuth token（
`~/.wrangler` 或 macOS 的 `~/Library/Preferences/.wrangler` 下的
`config/default.toml`，字段 `oauth_token`）顺序取认证，本机登录过 `wrangler`
就有现成的。**必须显式带 `User-Agent`**，缺了会拿到 HTML 错误页而不是 JSON
（同一个坑见 `seo-webcafe.md`）。

```bash
## 拉全网基线，按通过率排序打印
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch

## 存入 .rankup/agentic/baseline/<date>.json
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch --save

## 按行业分类过滤
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs fetch --category Technology

## 对照某次 is-agentic.mjs 单站扫描，把失败项和全网通过率并排显示
node <rankup-skill-dir>/scripts/cf-agent-baseline.mjs --compare <is-agentic-scan.json>
```

**已验证的全网通过率**（2026-08-17 数据，107985/160188 个域名扫描成功——
这份数字会漂移，不要凭记忆引用，`fetch` 重新拉一次）：

| 检查项 | 通过率 |
|---|---|
| robots.txt 存在 | 83.9% |
| robots.txt 含 AI 爬虫规则 | 80.9% |
| sitemap 存在 | 69.1% |
| Markdown 内容协商（Accept: text/markdown） | 10.3% |
| OAuth Discovery | 9.6% |
| HTTP Link 头（RFC 8288） | 9.3% |
| OAuth Protected Resource | 8.7% |
| UCP | 8.1% |
| Content Signals | 8.1% |
| API Catalog | 0.5% |
| Agent Skills | 0.4% |
| MCP Server Card | 0.3% |
| Web Bot Auth | 0.1% |
| A2A Agent Card / ACP / MPP / x402 / AP2 | ~0.0% |
| WebMCP | 0（107985 个里一个都没有） |

**解读规则**：单站分数只有对着这份分母看才有意义。`webMcp` 全网通过率是
0/107985——追一项没人做到的检查，价值几乎总是低于它挤占的工作，那不是
站点的缺陷，是这个时间点互联网的常态。反过来，robots.txt / sitemap 这类
80%+ 通过率的项如果单站没做到，才是真实差距，值得优先修。

**这条解读住在这里，不在脚本里。** `cf-agent-baseline.mjs --compare` 以前会
逐项打印「`pct<15` → 这项该让位 / 否则值得修」，2026-08-30 删掉了：一个通过率
推不出优先级——全网 8% 通过可能是这项难做（该让位），也可能是所有人都还没做
（那是先发优势）；90% 通过的项若对你的站型不适用，修了也没有收益。脚本现在
只并排给出「站点现状 + 全网通过率（分子/分母）」这两个事实，先修哪个由读的人定。

**`--compare` 的边界**：`is-agentic.mjs` 的检查项和这个端点的检查项**不是
1:1 对应**——两边测的东西大多不同（前者查 404 语义、无 JS 内容、品牌可发现性、
Organization schema 完整度、trust anchor 页面；后者是全网聚合的协议/格式
采纳率）。脚本只在概念完全一致时才连线（目前唯一确认的一条：
Markdown 内容协商），其余一律列进「未能对照」，不做凑数假映射——错的映射
会给出自信但错误的建议。

**什么时候跑**：`is-agentic.mjs` 输出「高级集成」类低分时，先跑一次
`--compare` 判断这是全网通病还是真实差距，再决定要不要动手修。
