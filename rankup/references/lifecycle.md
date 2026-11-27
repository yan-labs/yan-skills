# 网站全生命周期（七段）

本文件是 `rankup` 的执行工作流。它把网站从机会判断到长期经营拆成 **七段**：
调研 → 立项与定位 → 建站与开发 → 上线前 SEO/GEO → 上线与接入 → 外链 → 变现与监控。
段是导航，不是必须从头重跑的瀑布流程：已有网站先完成「对账」（每段开头的固定动作），
再从与当前目标最相关的段进入；不得为了套流程而重新初始化、迁移或覆盖已有项目。

所有输出路径均相对于项目根目录。写入 `.rankup/` 前先遵循项目记忆协议；任何密钥真实值都不得写入 `.rankup/`、Git、日志或命令输出。

## 目录

- 七段文件索引（2026-09-30 拆分：本文件只留总述、映射、通用规则与对账）
- 各段入口与常用脚本速查
- 旧阶段号 → 新七段 映射表
- 每段的「完成门禁」都在 checklist 里有对应条目
- 通用执行规则
- 每段开头的固定动作：对账

## 七段文件索引（2026-09-30 拆分：本文件只留总述、映射、通用规则与对账）

一次任务只读对应那一段的文件；每段文件都是「输入 / 必做动作 / 步骤 check / 输出 / 完成门禁 / 交给下一段」的完整结构，硬规则总表（含「为什么」）也在各段文件里，入口与开工卡只给指针。文字里写「`lifecycle.md` 段 N」的指针，一律指下表对应文件。

| 段 | 文件 | 判据（闸门） |
|---|---|---|
| 1 调研 | [`lifecycle/stage-1-research.md`](lifecycle/stage-1-research.md) | [`checklists.md`](checklists.md) 段 1 |
| 2 立项与定位 | [`lifecycle/stage-2-positioning.md`](lifecycle/stage-2-positioning.md) | [`checklists.md`](checklists.md) 段 2 |
| 3 建站与开发 | [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md)（自建站步骤在 [`stage-3-scaffold.md`](lifecycle/stage-3-scaffold.md)） | [`checklists.md`](checklists.md) 段 3 |
| 4 上线前 SEO/GEO | [`lifecycle/stage-4-prelaunch.md`](lifecycle/stage-4-prelaunch.md) | [`checklists.md`](checklists.md) 段 4 |
| 5 上线与接入 | [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) | [`checklists.md`](checklists.md) 段 5 |
| 6 外链 | [`lifecycle/stage-6-backlinks.md`](lifecycle/stage-6-backlinks.md) | [`checklists.md`](checklists.md) 段 6 |
| 7 变现与监控 | [`lifecycle/stage-7-monetize.md`](lifecycle/stage-7-monetize.md) | [`checklists.md`](checklists.md) 段 7 |

## 各段入口与常用脚本速查

跑之前先在这里找现成脚本，不现写等价实现；全量能力底账见 [`capability-map.md`](capability-map.md)。脚本路径相对 Skill 根目录。

| 段 | 判读与方法入口 | 常用脚本与工具 |
|---|---|---|
| 1 调研 | 词级先过 [`playbooks/entry.md`](playbooks/entry.md) → [`playbooks/research.md`](playbooks/research.md)（P0 分流：没东西 P1、一个词 P2、一个域名 P4）；历史经验 [`experiences/demand-discovery.md`](experiences/demand-discovery.md)；证据覆盖 [`research-checklist.md`](research-checklist.md)；GT 测量只按 [gpts 基线判读](trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)；问法与采样只按 [`seo-geo.md`](seo-geo.md) | `scripts/demand/suggest.mjs`、官方 `gefei-keywords` / `gefei-competitor`、`backlink/scripts/semrush-keyword.mjs`、面板取证 `scripts/rankup-cli.mjs`（`npx --package $RANKUP_PACKAGE rankup audit similarweb`）、`scripts/gt.py` |
| 2 立项与定位 | 立项裁决只见 [`playbooks/entry.md`](playbooks/entry.md)；经营经验 [`experiences/zero-to-one.md`](experiences/zero-to-one.md) | — |
| 3 建站与开发 | [`cloudflare-stack.md`](cloudflare-stack.md)（脚手架、资源选择、静态优先）；三方库优先 [`integrations.md`](integrations.md)；基础控件边界见[纪律十六](discipline.md#十六组件库红线段-3--段-4ui-只准来自组件库不许自己造控件) | `scripts/make-favicons.mjs --src <logo.png> --out <public目录>`、`scripts/cf-zone-setup.mjs`、`scripts/domain-age.mjs` |
| 4 上线前 SEO/GEO | [`seo-box.md`](seo-box.md)、[`seo-webcafe.md`](seo-webcafe.md)、[`seo-ai-search.md`](seo-ai-search.md) | `scripts/sitemap-lastmod-check.mjs <域名>`、`scripts/seo-audit.mjs --sitemap`、`scripts/pagespeed.mjs collect --strategy both`、`scripts/is-agentic.mjs scan --save`、`scripts/ai-crawler-access.mjs --url <正式域名>`、`scripts/ua-parity.mjs <url>`、`scripts/hcu-audit.mjs <domain>` |
| 5 上线与接入 | [`search-platforms.md`](search-platforms.md)、[`analytics-platforms.md`](analytics-platforms.md)、[`cloudflare/domain-email.md`](cloudflare/domain-email.md) | `scripts/sitemap-lastmod-check.mjs <域名>`、`scripts/site-onboard.mjs`、`scripts/gsc-domain-verify.mjs`、`scripts/bing-import-from-gsc.mjs`、`scripts/cf-analytics-setup.mjs`、`scripts/indexnow-submit.mjs`、`scripts/webmaster-sitemap.mjs`、`scripts/yandex-setup.mjs`、`scripts/ahrefs-site-audit.mjs`、`scripts/analytics-beacon-check.mjs`、`scripts/verify-live.mjs` |
| 6 外链 | `backlink` Skill（未装：`npx skills add $SKILLS_SOURCE --skill backlink -g -y`）；判据 [`experiences/webcafe-topics.md`](experiences/webcafe-topics.md) 五；发布平台 [`product-launch.md`](product-launch.md) | 见 `backlink` Skill |
| 7 变现与监控 | [`monetization.md`](monetization.md)、[`experiences/conversion.md`](experiences/conversion.md)、[`evolution.md`](evolution.md)；掉量排查 [`experiences/webcafe-experiences-2.md`](experiences/webcafe-experiences-2.md) 十七～十九 | `scripts/is-agentic.mjs diff`、`scripts/review.mjs`；只读读数：`scripts/gsc-export.mjs`、`scripts/gsc-daily-readback.mjs`、`scripts/ga4-report-readback.mjs`、`scripts/cf-traffic-readback.mjs`、`scripts/clarity-recordings-readback.mjs` |

## 旧阶段号 → 新七段 映射表

3.0 之前本文件按阶段 `0`–`10`（含 `7.5`）编号，项目里旧的 `.rankup/checks.md` 仍用旧号。对照如下，
读到旧号时按这张表换算，**不要**把旧 `checks.md` 重写一遍：

| 旧阶段 | 旧名称 | 新段 | 说明 |
|---|---|---|---|
| 0 | 恢复并对账项目上下文 | **每段开头的「对账」动作** | 不再是独立阶段；每段开工第一件事就是它 |
| 1 | 机会与市场调研 | **段 1 · 调研** | 加入词根扩树、社区验证两条硬规则 |
| 2 | 产品与架构设计 | **段 2 · 立项与定位** | 前置新增：流量第一、语种裁定、意图 → 形态 → 变现 |
| 3 | 初始化项目 | **段 3 · 建站与开发**（3.1） | shadcn 与私有仓改为强制；域名改成留位；无占位红线 |
| 4 | 建立 Cloudflare 全栈基础 | **段 3 · 建站与开发**（3.2）；**域名接入移到段 5** | 旧步 7–9（zone / NS）整体搬到段 5 |
| 5 | 开发与测试 | **段 3 · 建站与开发**（3.3） | 原样 |
| 6 | 集成专项能力 | **段 3 · 建站与开发**（3.4） | 加「不重复造轮子」 |
| 7 | 部署并真实线上验证 | **段 5 · 上线与接入**（5.4） | 正式域名绑定之后做 |
| 7.5 | 品牌资产与测量接入 | **段 4 · 上线前 SEO/GEO**（A 品牌资产、C 九行闸门）+ **段 5 · 上线与接入**（B26 邮箱、A/B 两批接入） | 一拆为二：预览域上能做的进段 4，依赖正式域名的进段 5 |
| 8 | SEO 与内容增长 | **段 7 · 变现与监控**（7.2） | 每次页面改动回段 4 全套体检 |
| 9 | 分发与外链 | **段 6 · 外链** | 原样，执行在 `backlink` |
| 10 | 监控、学习与迭代 | **段 7 · 变现与监控**（7.3） | 新增「回到段 1 开下一棵树」的判据 |

**旧闸门编号不映射，按名字对照。** 更早版本的 `checks.md` 里出现过「闸门 3 · 结构化数据」「闸门 4 · 无障碍」这类命名，
与现在的「闸门 3 · 关键词密度」「闸门 4 · GEO / AI 就绪度」撞号不撞名。对照旧记录时只认检查项的名字与证据，
不认编号；新写的记录一律用 `checklists.md` 段 4 当前的名字，旧节原样保留不改写。

## 每段的「完成门禁」都在 checklist 里有对应条目

本文件每段末尾的 **完成门禁** 在 [`checklists.md`](checklists.md) 里有一张对应的表，
状态记在项目的 `.rankup/checks.md`。**不过闸不许进下一段；每一轮迭代新做的东西
也要把相关 check 重新过一遍。**

分工是固定的：`checklists.md` 只写**客观通过条件与证据落点**，
**怎么做写在本文件对应段**。新增一条门禁时先补 `checklists.md`，
再在这里写它的操作说明——反过来做，那条门禁就只存在于本文件里，
没有任何东西会在开工时把它拿出来。

## 通用执行规则

1. 每次只推进能用当前证据验收的最小工作单元。
2. `.rankup/` 是项目记忆，不是实时事实源。涉及代码、Git、Cloudflare、Stripe、搜索平台或线上状态时，必须重新读取真实来源。
3. 每段都必须满足可观察门禁才算完成。生成文件、构建成功、Worker 上传成功或口头确认都不能替代门禁。
4. 如果门禁失败，在 `.rankup/audit.md` 或当日日志记录证据与下一步，保持该段未完成。
5. 真实生产变更遵循最小范围和可回滚原则；破坏性操作必须取得用户对确切目标和环境的授权。

## 每段开头的固定动作：对账

**任何一段开工的第一件事都是这一节，不是从段 1 才开始。** 它回答「项目现在真实在哪」，
答不出来就没有资格进任何一段。

### 输入

- 用户当前目标和约束。
- `.rankup/INDEX.md`、`.rankup/PROJECT.md`、`.rankup/skill-state.json` 及任务相关主题文件。
- 当前工作树、Git 历史、应用代码、配置和相关线上服务。

### 必做动作

1. 判断是绿地项目、已有项目还是一次专项修复。
2. 读取 `.rankup/INDEX.md` 推荐的最小文件集合；目录不存在时初始化项目记忆。
   **随后必读 `.rankup/rejected.md`**（否决清单）：本轮要碰的词、方向、功能、渠道、域名先在里面 grep 一遍，命中的按「复活条件」处理，不许当成新点子重新捡起来；同一对象在 `research/` 里有旧报告的先读结论再决定要不要重跑。
3. 检查工作树、近期提交、实际目录和运行脚本，避免覆盖用户改动。
4. 对任务涉及的 Cloudflare bindings、域名、部署、数据库、对象存储、支付或搜索状态进行实时核对。
5. 修正已确认过期的项目记录，并标明证据时间；不确定项标为待验证。
6. 检查 `rankup` 版本状态，但 Skill 更新不得修改业务代码或部署网站。

### 步骤 check

**每步做完就核，不要攒到闸门再一起补。** 闸门（[`checklists.md`](checklists.md)）判的是「这个环节能不能算完」，下表判的是「这一步做对了没有」——闸门过不了，一定是下面某一行没过。

| 步 | 客观通过条件 | 证据 |
|---|---|---|
| 1 | 三选一有明确结论：绿地 / 已有项目 / 专项修复。判据是仓库里有没有可运行的应用，不是用户怎么描述 | `.rankup/PROJECT.md` |
| 2 | `INDEX.md` 推荐的最小文件集已读；目录不存在时已跑 `rankup init` 而不是边猜边做 | `.rankup/INDEX.md` |
| 2b | `.rankup/rejected.md` 已 grep 过本轮涉及的每个对象；命中的要么跳过并引用，要么写了「复活」行说明哪条条件已满足。**上一轮 pass 掉的东西这一轮又出现在计划里、却没有复活记录**，这条直接判不过 | 本轮 journal + `rejected.md` |
| 3 | `git status` 与 `git log -25` 都看过，**已列出未提交改动**；没有在未读工作树的情况下改文件 | 本轮 journal |
| 4 | 任务涉及的每一项外部状态（bindings / 域名 / 部署 / D1 / R2 / 支付 / 搜索）都有一条**本次查询**的结果，不是引用记忆 | `.rankup/infrastructure.md`、`integrations.md` |
| 5 | 过期记录已改写并标了证据日期；拿不准的标「待验证」而不是删掉或保留原值 | 被修正的文件本身 |
| 6 | 版本状态已刷新，且**本次没有因为 Skill 更新而改动任何业务代码或触发部署** | `.rankup/skill-state.json` |

### 输出

- `.rankup/INDEX.md`
- `.rankup/PROJECT.md`
- `.rankup/skill-state.json`
- 必要时更新 `.rankup/plan.md`、`.rankup/audit.md` 和 `.rankup/journal/<date>.md`

### 完成门禁

能用当前代码、Git 和相关线上来源说明项目的真实状态、当前目标、未提交改动、目标环境和应进入的段；项目记忆中的冲突已修正或明确标记为待验证。

### 交给本段的

| 交给本段的 | 本段会怎么用它 | 如果这项缺失会怎样 |
|---|---|---|
| 项目当前真实状态判断（绿地/已有项目/专项修复）及应进入的段 | 后续据此决定从哪一步开始，而不是从头套流程 | 已有项目被当成绿地重新初始化，或专项修复被拖入不相关的完整流程，浪费工作量且可能覆盖用户改动 |
| 已修正或标记为待验证的项目记忆冲突 | 后续读 `.rankup/` 时，知道哪些记录可信、哪些要重新核实 | 把一条过期或待验证的记录当成事实使用，在此基础上继续决策 |

