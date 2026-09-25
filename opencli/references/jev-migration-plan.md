# rankup / backlink 浏览器脚本迁移到 JEV + OpenCLI 方案

状态：只读盘点 + 方案，未落地、未提交 git。范围见文末方法论。

## 0. 结论摘要

**可改造脚本的收益分布**：rankup 与 backlink 两个 Skill 的 `scripts/` 目录下，会操作网页的脚本合计约 55 个（rankup 23 个 + backlink ~32 个"browser_operating: true"，另有约 20 个 backlink 脚本是纯本地/纯 HTTP，不碰浏览器）。逐个判断后：

| 收益档 | 数量 | 典型代表 |
|---|---|---|
| 高 | 2 | `backlink/scripts/inspect-page.mjs`、`submit-directory.mjs`（外链提交表单的"摸索/判断"环节） |
| 中 | 2 | `adapter-phpld.mjs`（PHPLD 家族 category 选择）、`submit-known.mjs`（recipe 失效后的重新探路） |
| 低 | 4 | `gsc-remove-urls.mjs` / `gsc-request-indexing.mjs`（按钮文案跨语言健壮性）、`footprint-discover.mjs` 的 `--engine google` 兜底路径、`chatbot-drive.browser.js` 系列的完成态判断 |
| 不适合 | 约 47 | 其余全部——原因分两类：① rankup 的后台驱动脚本已经是"确定性自动化到固定后台"，判断环节要么不存在要么被验证码/竞态挡死；② backlink 的数据面板/收集脚本受 `scripts-collect-ai-judges` 法律约束，**只采集不判断**，JEV 的判断能力在这类脚本里根本不该被引入 |

**结论一句话**：JEV 真正值得进场的地方几乎全部集中在 backlink 的**外链提交流水线**（第 3 节），rankup 那 23 个脚本以及 backlink 的配额面板/收集脚本都不建议改。

**外链流水线概要**：现状是"抓证据的脚本 + Claude 现场判断"（`inspect-page.mjs` 出 census，Claude 读 census+截图判断哪个是提交表单、字段怎么映射，`safe-fill.mjs` 机械回填，`release-submit-guard.mjs` 机械放行，`submit-directory.mjs`/`submit-known.mjs` 编排整条链）。新流水线把"Claude 现场判断"这一步替换成 `opencli browser <s> auto`（JEV 驱动的动作选择器，已在 `feat/jev-auto` 分支实现，未合并），安全层（三道闸、不解验证码/不建账号/不勾条款/不付款）原样保留在 `safe-fill.mjs`/`release-submit-guard.mjs`，只是判断来源从 Claude 换成更便宜的 JEV。详见第 4、5 节。

**第一批改造清单**（第 6 节展开）：
1. `submit-directory.mjs` 接入 `opencli browser auto`，替换现有 Claude 现场判断环节
2. `adapter-phpld.mjs` 的 category 选择环节接入 JEV（复用 auto 的 select-mapping 能力，覆盖几十个 PHPLD 家族域名）
3. `browser auto` 补一个 outcome-check 收尾，复用 `lib-submit-outcome.mjs` 现有判据（不是脚本改造，是 auto 命令自身的能力缺口，但两个脚本改造都依赖它，建议同批做）

**`auto` 命令还需要补的能力清单**（第 5.3 节完整版，这里列摘要，供转给开发 agent）：
1. 新增 `upload` action kind（OpenCLI CLI 层已有 `upload` 原语，`auto` 没接入）
2. CAPTCHA/Turnstile 检测并停止（现在没有专门检测，只有点击关键词黑名单）
3. 登录墙检测并停止（现在没有）
4. terms/consent checkbox 显式禁区（现在只是"没有匹配的 data key 就不勾"这种隐式保护，不是硬性拒绝）
5. outcome-check 复用 `lib-submit-outcome.mjs` 的正反双证据判据（现在 DONE 只看 url/title，容易被"表单静默重渲染并回显刚填的值"骗过）
6. 自定义下拉（Radix/shadcn/MUI）支持（现在 `select` 只认原生 `<select>`）
7. 字段映射结果的 recipe 化复用（对齐 backlink 已有的 `known-forms/*.json` 机制）
8. 批量/多会话编排的薄封装（一个域名一个 session 的纪律，`auto` 本身不管，需要外层脚本按 `adapter-phpld.mjs` 的 `sessionFor()` 模式派生）

---

## 1. 方法论与范围

- rankup 23 个脚本的盘点表（第 2 节）由 agent-fleet 的 `kollab-gateway-research`（grok-4.6）批量读取产出，本人逐条核对了其中约 20 个脚本的文件头，结论一致（选择器/文案细节、双语/多语言按钮匹配、双证人化落盘等描述均与源码吻合），判为可信。
- backlink 目录本打算同样交给 agent-fleet 批量摘要，但该次调用运行超过 15 分钟仍未产出（期间它还自主 fork 出了一个用 `kollab-gateway-code` 跑的子调用去分摊 12 个文件，这是它自己的行为，不是我指示的），判定为**耗时异常，产出可信度未知**，按"出现问题就改为自己读"处理：backlink 目录下全部 55 个文件本人逐一直接读取（文件头 + 关键逻辑段），第 2、3、4 节的 backlink 部分全部基于本人阅读结论。两个 agent-fleet backlink 调用留在后台运行，未产出前不计入本报告；如果之后产出，与本人结论冲突需要人工复核，不自动采信。
- `opencli browser <session> auto` 的能力盘点（第 5 节）不是猜测：直接读取了 `/Users/kcsx/Project/kcsx/macmini/opencli-worktrees/jev-auto`（`feat/jev-auto` 分支的真实 worktree，`git log` 确认为该分支）下 `src/browser/auto/*.ts`（10 个文件，共 1116 行）与 `src/cli.ts` 的未提交 diff，只读，未做任何修改，符合 CONFLICT-SCOPE 约束。

---

## 2. rankup/scripts 盘点表

23 个"会操作网页"的脚本全部落在 opencli-browser-scripted 或 opencli-adapter/pure-api 的混合形态，**没有一个是"探索式判断"任务**——每个脚本要点哪个按钮、填哪个框都是在开发时一次性摸清楚、写死进选择器的，运行时不存在"选哪个"这种分支。这类脚本的痛点集中在选择器/按钮文案随目标站点改版漂移（`discipline.md` 十五条已有回流机制处理），不是判断问题，JEV 的优势区间用不上。

| 脚本 | 做什么 | 现在怎么驱动 | 痛点 | JEV 能接管的部分 | 收益 | 不适合/备注 |
|---|---|---|---|---|---|---|
| `ahrefs-setup.mjs` | 创建/查看 Ahrefs 项目，走 GSC 完成所有权验证，开 Web Analytics | opencli-browser-scripted，写死选择器找项目卡片/输入框/GSC 账号选择器 | 选择器模糊匹配 class 名+中英文按钮文案，改版易碎；GSC 授权弹窗需人工 | 找"Add manually"按钮/输入框这类点击目标可以不 care 精确选择器 | 低 | 流程固定，判断成分低，且最后一步本来就卡人工 |
| `ahrefs-site-audit.mjs` | 读 Ahrefs Site Audit 已有抓取结果 | opencli-browser-scripted，固定会话名 `ahrefs-nav` | 依赖虚拟化表格结构，`data-explorer` 翻页/路由判断需要重试分支 | — | 不适合 | 纯读数，无选择判断，是解析问题不是判断问题 |
| `aitdk-triage.mjs` | 离线分析 AITDK 导出 JSON，给缺失分区 triage 结论 | pure-api-or-cli，无浏览器/网络/LLM | 无 | — | 不适合 | 纯本地规则判断 |
| `analytics-beacon-check.mjs` | 检查站点实际发出的分析 beacon（GA4/Clarity/Ahrefs WA/CF WA） | opencli-browser-scripted，读 performance/网络请求 | 被动观察，页面结构/CSP 变化可能误判 | — | 不适合 | 只读观察，无点击判断分支 |
| `clarity-setup.mjs` | 创建 Clarity 项目拿追踪 ID | opencli-browser-scripted | 属性+文案混合匹配，改版/多语言易碎 | 找按钮/输入框可不依赖精确选择器 | 低 | 流程固定，单一路径 |
| `gefei-ask.mjs` | 向哥飞 SEO Agent 提问，注入/轮询/取回/落盘 | opencli-browser-scripted，注入 `gefei-chat.browser.js` | 依赖登录态，轮询时序不稳 | — | 不适合 | 痛点是时序不是判断 |
| `gsc-remove-urls.mjs` | GSC「移除网址」批量提交暂时移除请求 | opencli-browser-scripted，按钮文案纯中文写死 | **已知限制**：账号语言非中文直接失效 | 按语义选按钮可以消除"文案语言写死"这个特定脆弱性 | 低-中 | 判断成分低（固定对话框流程），收益窄于"跨语言健壮性"这一点，不建议首批 |
| `gsc-request-indexing.mjs` | 解析 sitemap，GSC「网址检查」逐条查状态/请求编入索引 | opencli-browser-scripted，中英双语文案匹配 | 选择器和文案随 GSC 改版易碎；配额分支需自行判断 | 同上，语言健壮性 | 低-中 | 同上，且已有断点续跑机制降低了改版代价 |
| `gt-browser.mjs` | Google Trends 新版 Explore：compare/region/related，另有 adapter 走 trending-now | opencli-browser-scripted 为主，拦截 fetch 读内部数据 | DOM 选择器随 Explore UI 改版易碎，需处理标签页 hidden | — | 不适合 | 主要靠拦截 XHR/fetch 读数据，不是靠点击做判断 |
| `lib-scene.mjs` | 双证人取证共享工具库 | pure-api-or-cli，无 DOM 操作 | 无 | — | 不适合 | 纯本地工具库 |
| `naver-setup.mjs` | Naver Search Advisor 注册站点/取验证信息/提交 sitemap | opencli-browser-scripted，韩英双语文案 | 选择器极易碎；所有权验证卡人工 CAPTCHA | 导航到验证信息这一段 | 低 | 最后一步本来就卡人工，收益有限 |
| `pagespeed.mjs` | 驱动 pagespeed.web.dev 网页版跑分并抠出 Lighthouse JSON | opencli-browser-scripted，前台可见性强依赖 | 隐藏即卡死渲染（已反复实测踩坑） | — | 不适合 | 痛点是标签页可见性不是判断 |
| `seo-webcafe.mjs` | 统一驱动 seo.web.cafe 工具箱 21 个工具 | 混合，主要在页面上下文里发 `fetch`（非 DOM 操作） | 防"静默降级"为游客态，非选择器问题 | — | 不适合 | eval 内跑的是 fetch，不点页面 |
| `sitedata.mjs` | 查 SiteData 流量/Reverse AdSense/whois | opencli-browser-scripted，SPA 路由脆弱 | 必须走搜索框触发 React 路由，选择器随改版碎 | 有一点"点哪个 tab"的判断，但目标唯一 | 低 | 路径固定、判断范围窄 |
| `webcafe-forum.mjs` | 取 new.web.cafe 论坛内容 | 主要 pure-api-or-cli（走 `webcafe-transport.mjs` 的匿名 fetch），失败才升级浏览器 | 判断"是否拿到真数据"看业务字段不看状态码 | — | 不适合 | 数据层问题，非 DOM 判断 |
| `webcafe-transport.mjs` | new.web.cafe 取数传输层共享库 | 混合：常规是页面内 fetch；第三方登录弹窗是 opencli-browser-scripted | 登录弹窗按钮选择器随第三方组件样式漂移 | 找"用 Google 登录"按钮 | 低 | 使用频率低（一次性登录流程），不值得单独立项 |
| `webmaster-sitemap.mjs` | GSC/Bing/Yandex 读取/提交 sitemap | opencli-browser-scripted，打 `data-rankup-target` 属性两步法 | Bing Fluent UI 的 `jsaction` div 合成点击不生效，已用真实 click 精确解决 | — | 不适合 | 现有两步法方案已经比再引入一次 JEV 网络往返更稳、更快 |
| `yandex-setup.mjs` | Yandex Webmaster 添加站点/DNS TXT/验证 | opencli-browser-scripted（Yandex 部分）+ pure-api（Cloudflare DNS 部分） | 点击存在竞态窗口，用 network 判据而非文案判断生效 | — | 不适合 | 现有方案已用更可靠的网络判据取代文案判断 |
| `chatbot-drive.browser.js` | 通用注入脚本，驱动任意网页版 Chatbot 发问/轮询/复制回答 | opencli-browser-scripted，选择器由调用方传入的 PROFILE 配置 | 依赖每站点自定义 SELECTOR profile，改版即碎；done 判断靠轮询超时 | "回答是否已完成"这个 done 判断可以用 JEV 的 noul 题型替代轮询超时 | 低 | 现有超时轮询已够用，仅在追问"更快判断完成"时值得动 |
| `gefei-chat.browser.js` | 哥飞聊天页专用版驱动 | opencli-browser-scripted，正则匹配"复制本段" | 选择器/文案写死，改版即碎 | 同上 done 判断 | 低 | 同上 |
| `aitdk-batch.sh` | 并发跑 `aitdk-opencli.sh`，窗口 tiling 编排 | opencli-browser-scripted（委托），自身不碰 DOM | tiling 依赖 `opencli window status` 返回值 | — | 不适合 | 纯编排脚本 |
| `aitdk-opencli.sh` | Part A 页面 HTML 抽取 + Part B AITDK 扩展面板 frame-eval 抽取 | opencli-browser-scripted，含跨 frame 定位+合成键盘事件+按钮文本匹配 | **全脚本痛点最重**：frame 编号运行中漂移、面板需合成键事件、部分 `el.click()` 被忽略需变通 | 理论上"点哪个按钮"可以交给 JEV | 不适合 | 痛点是底层技术可靠性（frame 定位、事件合成），不是"选哪个"的判断问题，加一层 JEV 网络调用只会更慢更不确定 |
| `gt.py` | Google Trends CLI 包装器，纯转发给 `gt-browser.mjs` | 自身 pure-api-or-cli（subprocess 转发） | 无（真实痛点在 `gt-browser.mjs`） | — | 不适合 | 纯转发层 |

---

## 3. backlink/scripts 盘点表

先分组：**外链提交核心流水线**（真正的判断发生地，逐个展开）→ **提交流水线的机械执行/守卫层**（不该动，理由写清）→ **配额面板/收集脚本**（法律层面禁止引入判断，一次性说明）→ **纯本地脚本**（不适合，简要列出）。

### 3.1 外链提交核心流水线（判断发生地）

| 脚本 | 做什么 | 现在怎么驱动 | 痛点 | JEV 能接管的部分 | 收益 | 备注 |
|---|---|---|---|---|---|---|
| `inspect-page.mjs` | 对一个目标提交页做**全表单普查**（每个 form 每个 field 的语义七元组+稳定 marker）+ 截图，输出 `fillable`/`blocker`/`reason`/`selectedForm`/`qualifies` 等**启发式建议**，"判断由 AI 基于普查+截图做，可推翻" | opencli-browser-scripted，census 表达式在共享库 `lib-form-scan.mjs`，判断目前由 **Claude 现场读 census+截图**完成 | 每次都要把整页 census（含隐藏字段）+ 截图喂给 Claude 做判断，token 贵、慢；`qualifies:false` 时（如 `playlin.io` 三个"name-like"字段撞车）连 Claude 都要靠 known-forms 硬编码规则绕过 | 直接命中 —— 这正是 `inspect-page.mjs` 文件头写明的"判断由 AI 做"的那一步；用 `opencli browser auto` 的 JEV 字段映射（`field-mapping.ts`）替代，语义匹配同样成立，且一次 JEV 调用比一次 Claude 调用便宜两个数量级 | **高** | 见第 4、6 节详细设计 |
| `submit-directory.mjs` | 对**首次遇到**的目标，走"填→停在第一个需要人决定的地方"的完整编排（含判断这一页是不是提交页、哪个表单该填），文件头明确写"任何 cohort 都是乐观的，只有走一遍才知道" | opencli-browser-scripted，靠 Claude 在探路过程中做分支判断 | 每个新目标都要 Claude 逐步摸索：这是不是对的表单、这一步是不是卡点 | 直接命中——把"摸索"这一步换成 `opencli browser auto --goal "..." --data payload.json`，安全层（不点不可逆按钮、CAPTCHA/login 检测）继续由 `safe-fill.mjs`/`release-submit-guard.mjs` 或者 `auto` 补齐后的对等能力兜底 | **高** | 第一批改造目标之一，见第 6 节 |
| `submit-known.mjs` | recipe 驱动，**跳过**"AI 读 census 猜字段"这一步（因为已经人工验证过一次），其余安全检查（CAPTCHA/login/terms）全部照旧现场重跑 | opencli-browser-scripted，recipe 里的 `fieldMap` 是精确匹配（非正则）的硬编码规则 | recipe 只对**验证过的确切字段结构**有效，页面改版会触发 `recipe-stale` 并**拒绝降级猜测**，需要人工重新摸索、重写 recipe 文件 | recipe 失效后"重新摸索"这一步可以先过一遍 `auto`（JEV 摸索），产出的字段映射人工审核后固化成新 recipe，比从零人工摸索快 | 中 | 不是替换 `submit-known.mjs` 本身的运行时逻辑（它本来就该继续用精确匹配保证确定性），而是把"recipe 怎么写出来"这个准备阶段接上 JEV |
| `adapter-phpld.mjs` | PHP Link Directory 家族适配器：字段契约固定（TITLE/URL/DESCRIPTION/OWNER_NAME/OWNER_EMAIL/CATEGORY_ID），跨几十个域名复用；因为装机都带 reCAPTCHA，**永不提交**，填完停在待点状态 | opencli-browser-scripted，字段用精确契约填，category 选择靠脚本内字符串匹配 | category 下拉的匹配逻辑是硬编码字符串规则，遇到 category 命名跟预期不一致的实例会选错或选不中 | category 选择这一步是纯语义匹配问题（"给定候选 label 列表，哪个最贴近产品定位"），正是 JEV `choice` 题型的目标形状；且 PHPLD 覆盖几十个域名，一次改造全部受益 | 中 | 第一批改造目标之一 |
| `adapter-phpld-submit.mjs` | PHPLD 家族 Lane A：对 staging 阶段没有出现挑战的行按 Continue，读真实结果 | opencli-browser-scripted，只处理 `filled-no-captcha` 状态的行 | 拒绝提交"staging 之后新出现挑战"的表单（正确行为），逻辑本身已经很保守 | — | 不适合 | 这是纯机械的"按 Continue 并读结果"，没有判断，改了反而增加不确定性 |

### 3.2 提交流水线的机械执行/守卫层（不该动）

这几个脚本是 `scripts-collect-ai-judges` 法律里"脚本只收集/只执行，判断交给 AI"的**执行层**，本身故意不含判断逻辑——**这正是它们该被保留的原因**，JEV 接管的应该是它们的上游（谁决定填什么、谁决定点哪个），不是它们自己。

| 脚本 | 做什么 | 为什么不动 |
|---|---|---|
| `safe-fill.mjs` | 按已经决定好的"指纹"（fingerprint）回填四类字段（url/name/email/description），每次运行都现场重新校验页面身份/表单身份/字段身份/CAPTCHA/登录态，绝不提交 | 它是机械执行器，"填什么"的决定权在上游（`inspect-page.mjs` 的判断或 `submit-known.mjs` 的 recipe），`safe-fill.mjs` 自己不做选择判断；新流水线里它原样保留，继续被 `submit-directory.mjs`/`auto` 的执行层调用 |
| `release-submit-guard.mjs` | 唯一能在真正点击提交前解除守卫的脚本，纯机械 | 同上，不含判断 |
| `ledger.mjs` | 台账状态机（`candidate→...→submitted→public→indexed→rel_verified`），文件锁保证并发安全 | 纯本地状态存储，无浏览器操作 |
| `targets-select.mjs` | 按 cohort/gate/payment/ledger 排除规则挑一批目标 | 纯本地查询，cohort 语义由 `lib-cohort.mjs` 统一推导，不碰浏览器 |
| `lib-form-scan.mjs` | 普查表达式的唯一实现（被 `inspect-page.mjs` 和 `submit-known.mjs` 共用） | 共享库，不是独立驱动器；`auto` 命令的 snapshot/`getFormState` 已经是同类能力的独立实现，两边对齐见第 5 节 |
| `lib-submit-outcome.mjs` | "这次提交到底有没有被接受"的唯一判据：正向信号（URL/受理文案出现在表单之外）与否定信号（表单还在、字段还回显着刚填的值、error 标记）成对判断，两者都满足才是 `submitted` | 判据本身很精密（防止"表单静默重渲染并回显刚填值"这类误判），**`auto` 命令目前没有对等能力**（第 5.2 节 gap 5），建议是让 `auto` 复用/对齐这份判据，而不是碰这个文件本身 |
| `fingerprint-forms.mjs` | 用纯 HTTP（非浏览器）按表单字段名给站点聚类分家族，"写一个 adapter 覆盖二十个站"的依据 | 明确写着"Plain HTTP is enough here on purpose"，不碰浏览器 |
| `third-party-list-ingest.mjs` / `probe-submission-targets.mjs` / `merge-submission-targets.mjs` / `apply-traffic-screen.mjs` / `discovery-queue.mjs` | 候选清单构建/探测/合并/流量回写，均为纯本地 JSON 处理或匿名 HTTP，不碰浏览器 | 同上，且 `probe-submission-targets.mjs` 文件头明确写"只回答纯 HTTP 能诚实回答的问题" |

### 3.3 配额面板/收集脚本（法律禁止引入判断）

以下全部**不适合**。原因统一：`SKILL.md` 的 `scripts-collect-ai-judges` 法律明确要求"脚本只收集、AI 判断"，这批脚本的工作正是"收集"本身——它们导航到固定报表路由、滚动、截图、抽取数字，**不存在"选哪个"的分支**；给它们接 JEV 判断能力，不是"没收益"，是**违反了这个 Skill 自己的架构原则**（判断会被脚本悄悄做掉，AI 事后拿不到两个证人对质）。

| 脚本 | 一句话 | 不适合原因 |
|---|---|---|
| `ground-truth.mjs` | 配额站页面双证人采集（穿透 shadow DOM 的 census + 截图，成对落盘） | 只采集不判断，判断交给 AI 对质两个证人 |
| `semrush-batch.mjs` / `semrush-keyword.mjs` / `semrush-overview.mjs` / `semrush-report.mjs` / `semrush-traffic.mjs` | Semrush 各维度报表读取（域名概览/关键词/自然排名/反链/流量与市场） | 同上，均明确写"只采集，不判断" |
| `similarweb-batch.mjs` / `similarweb-keywords.mjs` / `similarweb-query.mjs` | Similarweb 各维度报表读取 | 同上 |
| `tools-share-open.mjs` / `tools-share-node.mjs` / `tools-share-evidence.mjs` | 共享账号面板启动器/节点探测/证据抓取 | 节点探测是确定性轮询（按倍率从低到高试），不是语义判断；证据抓取只采集 |
| `harvest-commenters.mjs` / `harvest-paginated.mjs` / `harvest.browser.js` | 从文章页收割评论者外链域名 / 大表翻页批采 / 登录态后台表格提取（legacy） | 纯抽取，无分支判断；`harvest.browser.js` 已被 `ground-truth.mjs` 取代，只保留供参考 |
| `page-read.mjs` | 渲染竞品公开页面，取回正文/价格/导航链接 | 只读内容，不碰任何输入框，无判断 |
| `footprint-discover.mjs`（`--engine google` 兜底路径时） | Google 搜索算子 footprint 发现，优先走 Serper API，只有配置不了才退到 OpenCLI 浏览器兜底 | 收集性质，"发现新域名"不是语义判断；即使算低收益也只在兜底路径产生，优先级低 |
| `health.mjs` | OpenCLI 环境体检（`doctor`/`--version`/npm 最新版检查） | 环境检查，不是页面操作 |

### 3.4 纯本地脚本（不适合，简列）

`harvest-merge.mjs`（本地 CSV 去重合并）、`harvest-collect.sh`（本地下载目录等齐收拢）、`traffic-crosscheck.mjs`（纯离线两份 JSON 互相校验）、`lib-automation-window.mjs`（窗口虚拟屏放置，机械）、`lib-deep-dom.mjs`（shadow DOM 遍历工具库）、`lib-evidence-scene.mjs`（证据双落盘工具库）、`lib-cohort.mjs`（cohort/gate 推导逻辑，纯函数）、`lib-semrush-overview.mjs` / `lib-similarweb.mjs`（解析层共享库）、`lib-tools-share.mjs`（面板启动器共享库）、`opencli-core.mjs`（OpenCLI CLI 调用基础设施）、`self-test.mjs`（测试）、`validate-skill-xml.mjs`（SKILL.md 格式校验）——以上全部不碰"选哪个"这类判断，均为纯本地计算或基础设施库。

---

## 4. 外链提交流水线现状

```
third-party-list-ingest.mjs (清单 → 候选)
        ↓
probe-submission-targets.mjs (匿名 HTTP 探测：能不能到达、有没有表单、最早的 gate)
        ↓
merge-submission-targets.mjs (合并进 data/submission-targets.json，付费的分流进 paid-platforms.json)
        ↓
【硬闸：候选清单摆给用户圈定这一轮要提交的子集 —— rankup SKILL.md 段六，见第 7 节】
        ↓
targets-select.mjs --cohort open --free-only (按 cohort 分批，一次只跑一个 cohort)
        ↓
逐个目标：inspect-page.mjs（普查+截图）→ Claude 现场判断 fillable/blocker/字段映射
        ↓                                    ↑ 这一步是本方案要替换的
    （或 submit-known.mjs 读 known-forms/<domain>.json 的现成 recipe，跳过上面判断）
        ↓
safe-fill.mjs（机械回填四字段，live 重新校验页面/表单/字段身份+CAPTCHA+登录）
        ↓
命中 CAPTCHA/登录/付费/条款 → 停在 Lane B（staged，等人一次性点完）
未命中 → release-submit-guard.mjs 解除守卫 → 真实点击提交
        ↓
lib-submit-outcome.mjs 判定 submitted / submitted-inconclusive / outcome-unknown
        ↓
ledger.mjs upsert + transition（写台账，`submitted`/`public`/`indexed`/`rel_verified` 强制要求 evidence）
```

**三道硬闸**（`submission-lanes.md`）：① 没有 URL 字段就不是提交表单，不填；② 提交控件的文案必须读起来像"提交"（submit/send/add/post/next 或中文对应），不是页面上随便一个按钮；③ `requestSubmit()` 不算点击，必须点真实控件并用页面文本之外的信号核实。

**三条硬禁令**（`directory-run-playbook.md`）：不注册账号、不解验证码、不选付费档/不填支付信息；外加"不为了填满表单而编造事实"（必填字段没有可授权的真值就整行 skip，不瞎填）。

这套安全模型**不需要因为引入 JEV 而重新设计**——JEV 只是替换"哪个是对的表单""哪个字段该填什么"这个判断的**来源**（从 Claude 现场判断换成 JEV 的 choice 题型），三道闸、三条禁令、`safe-fill.mjs`/`release-submit-guard.mjs` 的执行层原样保留。这也是本方案第 6 节设计的核心约束。

---

## 5. `opencli browser <session> auto`：真实现状（非猜测）

来源：`/Users/kcsx/Project/kcsx/macmini/opencli-worktrees/jev-auto`（`feat/jev-auto` 分支的 worktree，`git log` 确认 `931b0cb9 [feat/jev-auto]`），只读了 `src/browser/auto/*.ts`（10 个文件）与 `src/cli.ts` 的未提交 diff，未做任何修改。

### 5.1 已经实现的（不用再要）

- CLI 已完整接好：`opencli browser <session> auto --goal <text> [--data <file>] [--max-steps 20] [--min-confidence 0.55] [--allow-submit] [--dry-run] [--json]`，与 brief 里给的签名一致。
- 循环模型：每步 `snapshot()` + `getFormState()` → 构建候选（可点击元素 + 待填的 fill/select/check 字段 + DONE）→ 一次 JEV `choice` 调用 → 执行 → 记录到 `StepLog`，直到 DONE/低置信度/步数耗尽/无候选。
- 字段映射：新出现的表单字段分组（text/select/radio/checkbox）后，**一次批量 JEV 调用**把所有分组映射到 `--data` 文件的 key（`field-mapping.ts` 的 `buildMappingQuestions`），JEV 只选 key、不生成值，语义匹配（"Customer name" 可以映射到 data key `full_name`）。
- 原生 `<select>` 下拉：`select` action kind 已支持，`select-by-ref.ts` 按 label 精确匹配→包含匹配→value 匹配的顺序解析。
- checkbox/radio 分组：同名字段自动收拢成一组，radio 选一个、checkbox 可多选，均走 `check` action kind。
- 不可逆点击防护：`safety.ts` 的 `looksIrreversible()` 用中英文关键词（提交/确认/支付/发送/删除等）+ `type=submit` 检测，命中且没传 `--allow-submit` 时直接从 JEV 候选菜单剔除（"模型不会被给选它未曾被提供的选项"），全部剔除后返回 `stopped_for_human` / `awaiting_submit`。
- `--dry-run`：预览下一步 JEV 会选什么，不执行。
- `--min-confidence`：低于阈值直接停，交回人工。
- JEV 协议对接：`jev-client.ts` 直连 `https://api.typesafe.ai/v1/systemone`，`model: jev-latest`，key 只从 `TYPESAFE_API_KEY` 环境变量读，不落盘不打印——与已验证过的 `yan-skills/opencli/scripts/jev-step-demo.mjs` 用的是同一协议。

### 5.2 确认存在的能力缺口（读代码验证，不是猜）

| # | 缺口 | 证据 |
|---|---|---|
| 1 | 无文件上传：`ActionKind` 类型只有 `'click' \| 'fill' \| 'select' \| 'check' \| 'done'`，没有 `upload` | `types.ts` 第 115 行；OpenCLI CLI 层本身有 `upload [target] <file...>` 原语（经 CDP 挂 `input[type=file]`），`auto` 没接进去 |
| 2 | 无 CAPTCHA 检测：`safety.ts` 只做"点击关键词黑名单"，没有识别 CAPTCHA/Turnstile 的 iframe/属性并主动停止 | 通读 `safety.ts` 全文（70 行），只有 `IRREVERSIBLE_KEYWORDS` 一套逻辑；对比 `safe-fill.mjs` 现成的 CAPTCHA 正则（`[class*="captcha" i],[id*="captcha" i],[class*="turnstile" i]...`），`auto` 里没有对等实现 |
| 3 | 无登录墙检测：没有 `input[type=password]` / `form[action*=login]` 检测 | 同上，`safe-fill.mjs` 有这行判断（`form.matches('form[action*="login" i]') \|\| form.querySelector('input[type="password"]')`），`auto` 没有对应逻辑 |
| 4 | terms/consent checkbox 无显式禁区：`field-groups.ts` 把任何 checkbox 都当普通字段分组，`field-mapping.ts` 允许 JEV 把任意 data key 语义匹配到"我同意条款"并勾选；唯一的保护是"没有匹配的 data key 就选 NONE、不勾"——这是**隐式的**，不是像 backlink `known-forms.md` 的 `termsCheckbox` 字段那样**硬性拒绝并要求 `--confirm-terms`** | `field-groups.ts`/`field-mapping.ts` 通读，没有 terms/consent 关键词检测；对比 `known-forms.md` 的 `termsCheckbox` 设计（"driver always stages, never ticks it, unless `--confirm-terms`"） |
| 5 | 无强 outcome 校验：DONE 判断喂给 JEV 的 `state` 只有 `{goal, current_page:{url,title}, progress}`（`buildStepState()`），**不含页面正文**，也没有 `lib-submit-outcome.mjs` 那种"表单是否仍在页面上+字段是否被原样回显+error 标记"的正反双证据判据 | `run.ts` 第 226-243 行 `buildStepState()`；对比 `lib-submit-outcome.mjs` 头部注释明确写过的历史事故模式（表单校验失败静默重渲染并把刚提交的值原样回填进 `<input value>`，旧判据会把这种情况误判成 `submitted`） |
| 6 | 自定义下拉不支持：`select-by-ref.ts` 明确 `if (el.tagName !== 'SELECT') return { error: 'not_a_select', ... }` | `select-by-ref.ts` 第 19 行；`browser-driving.md` 也写"不要对这类控件（Radix/shadcn/MUI 下拉）用 `select`" |
| 7 | 字段映射结果不落盘复用：`mappedGroupKeys` 只在单次运行内存活，没有对齐 backlink 已有的 `known-forms/<domain>.json` 机制——同一个域名下次再跑 `auto` 要重新做一次 JEV 字段映射调用 | `run.ts` 全文没有任何文件读写；`model-driven.md` 里"已知限制"一节也没提这条（该文档写于 `auto` 子命令实现之前，已过时） |
| 8 | 无批量/多会话编排：`auto` 是单会话单目标命令，"N 个待办站点开 N 个会话名"仍需外层脚本按 `adapter-phpld.mjs` 的 `sessionFor(url)` 模式手动派生 | `cli.ts` diff 里的 `auto` 命令定义只接受单个已绑定的 `<session>`，没有批量入口 |
| 9 | 无 ledger/evidence 钩子：`auto` 不认识 backlink 的台账格式，也不像 `safe-fill.mjs`/`inspect-page.mjs` 那样在每个失败/完成分支 `captureScene()` 落一对证据（census+截图）到 `--evidence-dir` | `run.ts`/`candidates.ts` 全文没有 `captureScene`/`evidence-dir` 相关代码；`AutoResult` 类型里也没有 evidence 字段 |
| 10 | 无表单级预筛："这个 form 里是不是真的有 URL 字段""这是不是提交表单而不是订阅框"这类 `inspect-page.mjs` 的 `selectedForm` 级判断，在 `auto` 里没有对等机制——字段映射是逐字段独立做的，没有先确认"这个表单值不值得进入候选" | `field-mapping.ts`/`candidates.ts` 通读，候选构建按 `formRefs` 逐元素展开，没有表单级的"这是不是提交表单"预判 |

这 10 条里，**2、3、4、5 是安全相关的硬缺口**（对齐 backlink 已有的三道闸和三条禁令是接入外链场景的前提条件，不能跳过），1、6、7、8、9、10 是能力/工程缺口（决定了接入后好不好用、能不能规模化）。

---

## 6. 设计：内容准备 → JEV+OpenCLI 批量填 → 待提交/自动提交 → JEV 校验成功 → 写台账

### 6.1 五段流水线，谁做什么

| 阶段 | 做什么 | 谁做 | 对应现状 |
|---|---|---|---|
| ① 内容准备 | 定稿 `product-profile.json`：品牌、canonical URL、按长度档的描述变体（50/150/500 字符）、分类、联系邮箱 | Claude 审核字段真实性（不编造）；文案初稿可交给 agent-fleet 的 `kollab-gateway-copy` 生成候选变体，Claude 过一遍 | `directory-run-playbook.md` 一："提交文案必须事先定稿，不能让驱动器现编" |
| ① 候选清单 | `third-party-list-ingest.mjs` → `probe-submission-targets.mjs` → `merge-submission-targets.mjs`，产出 `data/submission-targets.json` | 脚本，纯本地/匿名 HTTP，维持现状不变 | 已有实现，不改 |
| ①→② 之间【硬闸】 | 候选清单摆给用户，圈定这一轮实际要提交的子集 | 用户 | `rankup` SKILL.md 段六，第 7 节展开，**不可绕过、自动提交也不能绕过** |
| ② JEV+OpenCLI 批量填 | 对用户圈定的子集，按 `targets-select.mjs --cohort open --free-only` 分批，逐目标派生会话名后调用 `opencli browser <site-session> auto --goal "..." --data payload-<slug>.json --max-steps 20 --min-confidence 0.55 --json`（不传 `--allow-submit`） | JEV 做字段映射判断 + OpenCLI 执行点击/填写；外层是一个新的薄编排脚本（角色类似现在的 `submit-directory.mjs`，但把"摸索"环节换成调 `auto`） | 替换的是 `inspect-page.mjs` 之后 Claude 现场判断这一段 |
| ③ 待提交/自动提交 | `auto` 返回 `awaiting_submit`（只剩不可逆点击待决）的目标进入 Lane B 队列，把会话名清单交给用户一次性点完；只有同时满足 (a) cohort=open (b) 该 family/recipe 已至少一次人工验证过 outcome 判据 (c) 用户对这一批做过具名+范围+到期的批量授权时，才允许对这批传 `--allow-submit` | 人工点击（默认）；`--allow-submit` 场景下机器点击 | `submission-lanes.md` 的 Lane A/Lane B 划分；`batch-campaign.md`"Authorization is per action, not per campaign"里的四要素批准 |
| ④ JEV 校验成功 | 不信任 `auto` 自己的 DONE：单独一次 outcome-check 调用，把最终页面正文喂给判据（复用 `lib-submit-outcome.mjs` 的正反双证据逻辑，或用 JEV 的 `noul` 题型问"表单是否还在页面上""是否有受理文案出现在表单之外"），合成 `submitted` / `submitted-inconclusive` / `outcome-unknown` | JEV（noul 判断）+ `lib-submit-outcome.mjs` 现成判据逻辑 | 第 5.2 节缺口 5，是 auto 命令要补的能力，不是新脚本 |
| ⑤ 写台账 | `ledger.mjs upsert` + `transition`，evidence 字段写③④阶段观察到的具体文字；同轮如果实测和 `data/submission-targets.json`/`free-channels.json` 记录不符，顺手回写 | 脚本（机械） | 现状不变，`ledger.mjs` 不用动 |

### 6.2 `--data` 文件长什么样

```json
{
  "url": "https://example.com",
  "name": "Example Tool",
  "email": "hello@example.com",
  "description": "一句话说清产品是什么、给谁用（按目标站点常见字段长度预先定稿，不在运行时现编）",
  "category": "Productivity",
  "pricing": "Free"
}
```

说明：
- `url`/`name`/`email`/`description` 对齐 `safe-fill.mjs` 现有的四类字段，`auto` 的 `field-mapping.ts` 已经能把它们语义映射到任意标签的表单字段。
- `category`/`pricing` 这类 select/checkbox 字段按需要追加，`field-mapping.ts` 对 radio/checkbox 组会把 data value 与每个选项的可见文案做包含匹配。
- **多长度描述变体的选择不在 `auto` 运行时做**：`field-mapping.ts` 目前是"一个 data key 对应一个字段"的一对一匹配，没有"按目标输入框的 `maxlength` 自动挑合适长度变体"这种能力（这是本设计发现的一个小缺口，优先级低于第 5.2 节的 10 条，先在①内容准备阶段人工按常见站点特征定稿单一版本即可，遇到明确要求短标语的站点再单独传一份 `--data`）。

### 6.3 `auto` 命令需要补的能力（汇总，逐条见第 5.2 节表格）

按接入外链场景的优先级排序：

1. **CAPTCHA 检测并停止**（安全，阻断项）
2. **登录墙检测并停止**（安全，阻断项）
3. **terms/consent checkbox 显式禁区 + `--confirm-terms` 门禁**（安全，阻断项，对齐 backlink 已有措辞）
4. **outcome-check 复用 `lib-submit-outcome.mjs` 判据**（正确性，阻断项——没有这条，"提交成功"的判断不可信）
5. 文件上传 action kind（能力，覆盖需要传图片/logo 的目录）
6. 字段映射结果 recipe 化落盘（效率，降低重复调用 JEV 的成本，对齐 `known-forms/*.json`）
7. 批量/多会话编排薄封装（效率，不建议进 CLI 本体，backlink 侧写脚本更合适）
8. ledger/evidence 钩子（不建议进 `auto` CLI 本体——`auto` 应该保持通用、不该认识 backlink 的台账格式；由 backlink 侧的薄封装脚本调用 `auto` 拿到 `AutoResult` JSON 后自己接 `captureScene`/`ledger.mjs`，这正是现在 `submit-directory.mjs` 扮演的角色，改造后角色不变）
9. 自定义下拉支持（能力，PHPLD 等已知 family 多数是原生 select，遇到具体需要自定义下拉的目标再做）
10. 表单级预筛（正确性加固，优先级最低，现有"没有 URL 字段就不像提交表单"的直觉目前只体现在 `field-mapping.ts` 能不能匹配到 url key，没有做成一道独立的硬闸）

---

## 7. 分批改造计划

### 第一批（收益最高、风险最低）

| # | 改造项 | 改动量 | 验收判据（实测） |
|---|---|---|---|
| 1 | `browser auto` 补 CAPTCHA/登录墙检测 + terms 禁区 + outcome-check（第 6.3 节 1-4 条，四个一起做——没有安全闸门，后面两项改造无法验收） | 中：`safety.ts` 新增两个检测函数（参考 `safe-fill.mjs` 现成正则）；`run.ts` 主循环新增两个提前停止分支；新增一个 outcome-check 模块（复用/移植 `lib-submit-outcome.mjs` 逻辑） | 对 backlink 已有的两个 known-forms 案例（`playlin.io` 开放表单、`projectpedia.net` 账号+条款表单）重放：CAPTCHA 案例能正确停在 `captcha_detected`；`projectpedia.net` 的条款复选框在没传 `--confirm-terms` 时保持 `staged-terms`（不被误勾）；outcome-check 对两个案例历史截图重放，分类结果与人工记录一致 |
| 2 | `submit-directory.mjs` 接入 `opencli browser auto`，替换 `inspect-page.mjs`+Claude 现场判断这一段 | 中：新增一层调用 `auto --data <profile>` 拿字段映射结果，`safe-fill.mjs`/`release-submit-guard.mjs` 的执行层原样保留；失败/完成分支补 `captureScene` 落证据（对齐现有双证人化纪律） | 对至少 3 个**没有** known-forms recipe 的新目标跑 `--dry-run`：JEV 选出的字段映射（`matchedRefs`/`dataKey`）与人工预期比对，映射正确率不低于同批 Claude 人工判断的基线；对至少 1 个已知案例做真实提交（走完整闸门），outcome-check 判定与人工核对一致 |
| 3 | `adapter-phpld.mjs` 的 category 选择接入 JEV | 小：PHPLD 字段契约已知，只替换 category 匹配这一段逻辑，改成一次 JEV `choice` 调用 | 对 3-5 个已知 PHPLD 家族目标跑 `--dry-run`：category 选择结果与人工核对一致率 100%（这是有限选项分类，不该有歧义） |

第一批共三项，第 1 项是第 2、3 项的前置条件（没有安全闸门就不能验收"填对了"以外的正确性），建议同一批一起排。

### 第二批（视第一批验证结果决定要不要做）

- `gsc-remove-urls.mjs` / `gsc-request-indexing.mjs` 的按钮文案跨语言健壮性——收益窄（只覆盖"账号界面语言非中文"这一种失效模式），不紧急，可选。
- `footprint-discover.mjs` 的 `--engine google` 兜底路径——只在 Serper API 配置不了时触发，优先级低。
- `chatbot-drive.browser.js` / `gefei-chat.browser.js` 的完成态判断从轮询超时换成 JEV `noul` 判断——现有方案已经够用，只在需要"更快判断完成"时才值得动。

### 不建议列入近期改造

- backlink 全部配额面板/收集脚本（第 3.3 节）——**机制性排除**，改了违反 `scripts-collect-ai-judges` 法律。
- `aitdk-opencli.sh`——痛点是 frame 定位/事件合成的底层可靠性，不是判断问题，加 JEV 只会更慢更不确定。
- rankup 其余全部脚本——判断成分低或被验证码/竞态挡死，收益不足以覆盖开发成本。

---

## 8. rankup 规矩落实

- **配额站不传 `--session`**（discipline.md 六）：本方案标"不适合"的全部 Semrush/Similarweb/Ahrefs 相关脚本维持现状不动，固定会话名（`semrush-nav`/`similarweb-nav`/`ahrefs-nav`）规则天然满足，不受本方案影响；若未来有人尝试给这批脚本接 JEV，必须继续遵守固定会话名，不得为每次 JEV 判断另起会话。
- **discipline.md 五（浏览器操作必须走 opencli 驱动用户真实浏览器）**：JEV 只是在 `auto` 内部替换"选哪个"这个判断的来源，真正操作页面的执行原语（`click`/`fillText`/`select` 等）仍然是 OpenCLI 的既有能力，符合"必须由 opencli 驱动"的字面要求；JEV 本身不是浏览器驱动工具，它只回答选择题。
- **discipline.md 六（配额面板先查能力表再决定开不开浏览器）**：本方案不建议改动配额面板脚本，此规则不受影响。
- **discipline.md 十五（面板/网页操作对不上时先分诊，确认是漂移才改原文档）**：接入 JEV 之后，如果一个改造过的脚本（如 `submit-directory.mjs`）表现异常，仍要按五层分诊排除环境问题（同命令重跑、浏览器与会话、额度、人眼对照、跨时段复现），不能一遇到 JEV 选错就直接怪"页面变了"去改 recipe；`auto` 的字段映射结果异常时的排查顺序同样适用这五层。
- **discipline.md 十八（ID/token/密钥禁止从截图或记忆抄录）**：本方案的数据流是"页面文本 → state JSON → JEV 答案"，不经过 OCR 或人工转录，天然符合；`AutoResult` JSON 落盘时同样要过现有的剥敏规则（对齐 `lib-evidence-scene.mjs` 的既有做法），不得含 cookie/token。
- **候选站点用户圈定（rankup SKILL.md 段六硬规则）**：第 6.1 节流水线在①和②之间显式设了一道硬闸——技术上判定"可以对外提交"不代表这一轮该提交，批量投递前必须把完整候选清单摆给用户过一遍，等用户明确圈定子集才能进入执行阶段；**引入 JEV 和 `--allow-submit` 之后这道闸依然不能绕过**，`--allow-submit` 的批量授权范围只能覆盖用户已圈定的子集，不能反过来用"技术上可以批量提交"当作圈定完成的证据。

---

## 9. 风险与未决问题

- `feat/jev-auto` 分支尚未合并，且另有 agent 在同分支开发、还有一个会话在合并 `wip` 分支——本方案第一批改造的具体落地时机要等分支合并和冲突处理完成后再排期，本文档不涉及任何源码改动。
- 两个 agent-fleet backlink 批量摘要调用（`kollab-gateway-research` 及其自行 fork 出的 `kollab-gateway-code` 子调用）跑了超过 15 分钟仍留在后台，未产出、未验证质量。如果之后自行完成并与本文档结论冲突，需要人工复核，不自动采信更晚到达的结果。
- `auto` 命令 outcome-check 复用 `lib-submit-outcome.mjs` 判据的具体实现方式（TypeScript 移植一份 vs. 两边共享一份逻辑）需要开发 agent 决定，本文档只给出功能要求，不做技术选型。
- 第 6.2 节提到的"按字段长度自动挑选描述变体"是本次盘点顺带发现的小缺口，优先级低于第 5.2 节十条，未纳入第一批。
