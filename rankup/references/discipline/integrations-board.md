# 纪律十：接入看板与线上实测口径（全文）

> 入口在 [`discipline.md`](../discipline.md) 十，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

`.rankup/integrations.md` 是项目所有平台接入的**唯一看板**——做了什么、没做什么、为什么不做，一张表说清。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 完成一项接入，**立刻**打 ✅ 并写证据和验证日期 | 不记等于没做，下次 review 会重来一遍 | 接完 Clarity 没记，review 判「未接入」又走一遍 |
| `rankup review` 必须**线上实测**逐项验证，不采信勾 | 代码改了、键换了、部署覆盖了——✅ 不代表线上还活着 | 清单写 GA4 ✅，线上 script 被删了三个月没人发现 |
| `rankup init` 用完整清单初始化全部 ⬜ | 一开始就知道要做多少事，不靠记忆 | 忘了接 IndexNow，上线两个月没被 Bing 收录 |
| 「不接」标 ❌ 并写裁决依据 | 区分「还没做」和「决定不做」 | AdSense 标 ⬜，每次 review 都催，其实早决定不挂广告 |

已上线站点至少覆盖以下平台（`rankup review` 逐项验证；接入步骤见 [`search-platforms.md`](../search-platforms.md) 与 [`analytics-platforms.md`](../analytics-platforms.md)）。前三行是批 A（域名无关，预览域即可接）；其余搜索/索引/外链/邮箱/受众忠诚度行是批 B（域名定稿后一次接完，顺序与粒度对齐 [`lifecycle/stage-5-launch.md`](../lifecycle/stage-5-launch.md) 段 5「批 B 平台清单」与 [`checklists.md`](../checklists.md) 段 5「批 B 清单逐行有状态」）：

| 类别 | 平台 | 验证方式 |
|---|---|---|
| 托管方分析 | Cloudflare Web Analytics | `curl` 线上 HTML grep `cloudflareinsights` **只证明脚本在**；必须再用 GraphQL 查 `count > 0`（第八节那条事故） |
| 产品分析 | GA4 | grep `gtag` 或 `googletagmanager` |
| 行为分析 | Microsoft Clarity | grep `clarity.ms` |
| 索引推送 | IndexNow | `curl` 线上密钥文件 HTTP 200 |
| 搜索平台 | Google Search Console（GSC） | 后台查验证 + sitemap 状态 |
| 搜索平台 | Bing Webmaster | 后台查验证 + sitemap 状态 |
| 搜索平台 | Yandex Webmaster | grep `yandex-verification`；爬虫 UA `YandexBot` |
| 搜索平台 | Naver Search Advisor | grep `naver-site-verification`；爬虫 UA `Yeti` |
| 外链视角 | Ahrefs Webmaster Tools（Ahrefs WA） | 后台查项目验证状态；grep `analytics.ahrefs.com` |
| 站点体检 | Ahrefs Site Audit | 后台查有已完成的抓取；`ahrefs-site-audit.mjs report <id> <section>` |
| 邮箱 | Cloudflare Email Routing `hello@` + SPF / DKIM / DMARC | 收信与防冒充分开验收：按 [`cloudflare-stack.md`](../cloudflare-stack.md) §8.6 盘点用途及发信子域、补齐并回读策略；权威/公共 DNS 生效，外发认证通过或有依据标不适用；`p=none` 仅观察，不能以收信成功代替防护完成 |
| 受众忠诚度 | Preferred Sources 引导按钮 | 人工核对页面已有引导按钮/组件 |
| 品牌资产 | favicon / manifest / icons | `curl` 各路径 HTTP 200 |
| SEO 元素 | title / description / robots / OG（含图） | grep 各标签，逐页 |
| 结构化数据 | JSON-LD | grep `application/ld+json` |
| AI 就绪度 | is-agentic | `is-agentic.mjs scan` |
| 多语言 | hreflang / `<html lang>` | 仅多语言站点 |
| 兜底 | 其他能带流量的平台 | 目标市场有本地引擎或本地站长工具就加一行，一个不漏 |

**批 A/批 B 每个平台一行独立勾选，抄录时不得合并或省略；状态只能是 ✅（附证据）/❌（写裁决依据）/⏸（写卡点）/⬜，表头不得用『⬜=未在本文件核实』这类弱化口径，看板必须与 `checks.md` 同步。**

**`rankup review`/`scripts/review.mjs` 的逐行核对范围（2026-09-13 独立验收澄清）**：`review.mjs` 的 `checkIntegrationRows()` 只逐行核对上表里的**账号/平台接入行**（Cloudflare Web Analytics、GA4、Clarity、IndexNow、GSC、Bing、Yandex、Naver、Ahrefs WA、Ahrefs Site Audit、Email Routing、Preferred Sources、兜底这十三行）——这些都要在第三方后台开账号或拿验证凭据。同一张表里**品牌资产、SEO 元素、结构化数据、AI 就绪度、多语言**这五行是代码级行，靠代码/页面本身满足，不需要账号，`review.mjs` 不逐行核对它们；它们由段 4 上线前闸门（`references/lifecycle/stage-4-prelaunch.md` 段 4 C 节「上线前闸门」0–6 + 4b）覆盖检查。看到 `review.mjs` 没报这五行的缺口，不代表它们免检，去段 4 闸门找判据。
