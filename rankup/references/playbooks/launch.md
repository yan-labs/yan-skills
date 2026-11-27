# 上线、绑域名、接平台

## 开工卡

被派单的执行者先读 [`../executor.md`](../executor.md)。

**触发**：「上线」「域名买完了」「帮我绑域名」「这个域名能不能用」「数据平台都接了吗」「GSC 接了没」「提交 sitemap」「怎么一直不收录」。

**输入**：段 4 已过的站；定稿或待定的域名；`.rankup/integrations.md` 当前看板；项目的部署方式（读 `.rankup/infrastructure.md`）。

**步骤**

1. 域名定稿前过黑历史裁决：官方 `gefei-domain`、Wayback、外链画像、`site:` 搜索（[段 5 硬规则](../lifecycle/stage-5-launch.md#硬规则全文含为什么)）。
2. 自建站绑域名：[`domain-email.md` §8.5](../cloudflare/domain-email.md#85-接入域名把-zone-加进-cloudflare) 全 API 绑定 → [`cloudflare-stack.md` §8.8](../cloudflare-stack.md#88-基础安全主动补齐按用途取舍) 基础安全 → [§8.6](../cloudflare/domain-email.md#86-品牌邮箱cloudflare-email-routing) 邮箱。
3. 部署：先把代码合入对应环境分支并推送，再走项目现有流水线；生产线改动先发预发、发布后自测（[纪律二十二](../discipline.md#二十二部署红线先合入对应环境分支并推送再部署)，自建站流水线见 [`cloudflare/deploy.md`](../cloudflare/deploy.md)）。
4. 接入前只读核查：`node scripts/site-onboard.mjs --domain <域名> --repo <仓库> --check`，按结果补缺再执行。
5. 批 B 接入：搜索平台按 [`search-platforms.md`](../search-platforms.md)，分析平台按 [`analytics-platforms.md`](../analytics-platforms.md)；IndexNow 排在站长工具前面。
6. AI 爬虫全部放行，逐 UA 实测：`scripts/ai-crawler-access.mjs --url <正式域名>`。
7. 正式域名回读：首页与一个内页的正文、`robots.txt`、`sitemap.xml`、图标；`scripts/verify-live.mjs`。

**读哪里**：判据在 [`checklists.md` 段 5](../checklists.md#段-5--上线与接入)；操作全文在 [`stage-5-launch.md` 必做动作](../lifecycle/stage-5-launch.md#必做动作)；脚本速查见 [`lifecycle.md`](../lifecycle.md#各段入口与常用脚本速查) 段 5 行。

**完成标志**：`.rankup/integrations.md` 逐行有 ✅ / ❌、证据与日期；接入一律线上实测，勾选不代替生效状态。

**收尾**：发布记录写 `.rankup/releases.md`，资源与域名状态写 `infrastructure.md`；覆盖接力。
