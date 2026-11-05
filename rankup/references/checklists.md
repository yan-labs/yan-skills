# 环节闸门：每个环节的 checklist

**这是 rankup 的主线。每个环节都有一套 check，不过 check 不许进下一个环节；每一轮迭代新做的东西，也要把相关的 check 重新过一遍。这是硬性门槛，不是建议。**

读这个文件的是 Agent，不是解释器。**判断由你做**——「三方对账一致吗」「每条 AI 建议都有采纳或拒绝理由吗」这类事没有任何脚本能替你判，去看真实代码、真实线上响应、真实后台读数，然后下判断。

只有真机械的那一层（`.rankup/` 里某个文件在不在、够不够大、含不含某个词）才交给
`scripts/review.mjs`，它给的是「文件层面的缺口清单」，**不是「这一项做对了」**。
一个 500 字节的 `audit.md` 能让脚本变绿，但里面写的是不是全站逐 URL 的 TDK 结果，只有你能看出来。

## 旧阶段号 → 新七段

3.0 起环节按七段编号；项目里旧的 `.rankup/checks.md` 用的是阶段 `0`–`10` 与 `7.5`。对照表在
[`lifecycle.md`](lifecycle.md) 顶部「旧阶段号 → 新七段 映射表」，速记：
`0` → 每段开头的对账 · `1` → 段 1 · `2` → 段 2 · `3/4/5/6` → 段 3 · `7.5` 的 D 表 → 段 4 ·
`4` 的域名部分 + `7` + `7.5` 的接入 → 段 5 · `9` → 段 6 · `8/10` → 段 7。读到旧号按此换算，不重写旧 `checks.md`。

## 两层 check：闸门 + 步骤

| 层 | 在哪 | 回答什么 | 什么时候跑 |
|---|---|---|---|
| **闸门 check**（本文件） | `checklists.md`，一个环节一张表 | **这个环节能不能算完、能不能进下一个** | 环节收尾时 |
| **步骤 check** | 各段自己的 md 里，紧跟在必做动作后面（[`lifecycle.md`](lifecycle.md) 索引中的对应分册「步骤 check」一节） | **这一步做对了没有** | 每做完一步就核 |

**关系是单向的：闸门过不了，一定是某条步骤 check 没过。** 反过来不成立——
步骤全过不自动等于闸门过，闸门还要判跨步骤的一致性
（例如段 1 每个词单独看都齐了，但意图核验与搜索量核实的先后顺序看不出来）。

**为什么步骤 check 不写在这里**：它脱离动作原文就没法读。硬塞进本文件会逼着执行的人
在两个文件之间来回翻，而判据和动作一旦分家，改了动作没改判据是必然发生的事。

## 三条规则

| 规则 | 为什么 |
|---|---|
| **每条 check 都要有证据，证据要写清楚在哪个文件的哪一段** | 这套东西唯一致命的失败形态是**看着全绿、底下什么都没有**。只跑了命令、没留下证据不算过；控制台一个绿色图标不是证据 |
| **完成验收写在这里，关键词/立项裁决与测量方法只指向唯一源** | 同一件事在两处各写一份，改了一处另一处就静默过期，而两边看起来都正常。所以本文件的「怎么做」一列只给一句话加一个指路 |
| **过不了就写清为什么过不了** | 需要 CAPTCHA、需要付费决策、需要用户的物理操作 —— 这些标 ⏸ 并写明卡在哪、需要用户做什么，不要留一个悬空的空格 |

**调研的执行顺序与两路裁决**只见 [entry.md](playbooks/entry.md)，逐问法 Google 记录只见 [seo-serp.md](seo-serp.md#逐问法-google-读法)。

## 复查口径：哪些 check 下一轮还要再过

| 口径 | 含义 | 典型 |
|---|---|---|
| **一次** | 过了就一直过，技术事实不会自己退回去 | 脚手架跑通、zone 生效、远端仓库存在 |
| **每轮** | **每一轮迭代都必须重跑** | 三方对账、构建全绿、性能基线、迭代记录 |
| **动了 URL** | 本轮新增或修改了线上可访问的 URL 才必须重跑 | 上线前闸门的 TDK、技术 SEO、IndexNow 推送 |
| **动了页面** | 本轮改了任何页面的内容、结构或元数据（不一定新增 URL）就必须**全套**重跑 | 段 4 的九行闸门——改一处 TDK 可能带坏密度，改一个区块可能带坏 CLS |
| **会过期** | 依赖外部数据；有效期与触发条件按对应唯一源核对，过期或事实变化才补取 | SERP 快照、关键词裁决、域名黑历史 |
| **内容质量定期复查** | 已上线站每季度（或 Google 发布 Spam/Core Update 后）按 [`seo-helpful-content.md` 站点级自检表](seo-helpful-content.md#站点级自检表)复查并记录分数、范围与证据 | 内容质量、AI/程序化内容与责任披露 |

**每轮开工时的第一个动作**：把上一轮标记为「每轮」的 check 全部打回未过，
本轮动过线上 URL 的把「动了 URL」那一批也打回，动过页面的把「动了页面」那一批**整段**打回。
**不打回等于默认继承上一轮的绿灯**，而这正是清单腐坏的起点。

## 状态记在 `<project>/.rankup/checks.md`

一个环节一段，格式和 `integrations.md` 同构（✅ 已过 / ⬜ 未过 / ⏸ 卡住 / ❌ 判定不做）：

```markdown
## 段 4 · 上线前 SEO/GEO（第 3 轮）

| 检查项 | 状态 | 证据 | 日期 |
|---|---|---|---|
| 闸门 2 · TDK | ✅ | seo-audit 全站 42 URL 必修观察项为零（判读口径见 seo-box.md），逐 URL 结果在 audit.md「TDK」一节 | 2026-08-28 |
| 闸门 5 · 哥飞开放 API 数据复核 | ⏸ | 旧站内 Agent 口径已废弃；按新接口保存原始结果与扣费证据 | 2026-09-25 |
| 闸门 6 · 性能 CWV | ⬜ | — | — |
```

**状态在项目侧，判据在这里，两边不得各存一份。** 本文件不写任何站名、域名、真实数字。

---

## 对账 · 每段开头的固定动作（原阶段 0）

说明见 [`lifecycle.md`](lifecycle.md)「每段开头的固定动作：对账」。**每一段开工前都过一遍**，不是只在段 1 之前。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| 项目记忆存在且可导航 | `.rankup/INDEX.md` 与 `PROJECT.md` 存在，INDEX 的导航指向真实存在的文件 | `.rankup/INDEX.md` | 缺目录跑 `rankup init`；结构见 [`project-memory.md`](project-memory.md) | 每轮 |
| 三方对账通过 | `git log -25`、真实路由/页面清单、线上 `sitemap.xml` 全量 `<loc>` 三者与 `plan.md` 的勾选一致；不一致的已回写 | `.rankup/plan.md` | 三样各查一次再比对，**勾选框是滞后指标，读到「未开始」先去代码里验证** | 每轮 |
| Skill 版本状态已记录 | `skill-state.json` 记着本地版本与最近检查时间 | `.rankup/skill-state.json` | `check-version.mjs --project-root . --apply` | 每轮 |

## 段 1 · 调研

说明见 [`lifecycle/stage-1-research.md`](lifecycle/stage-1-research.md)（段 1）、[`playbooks/research.md`](playbooks/research.md)、[`experiences/demand-discovery.md`](experiences/demand-discovery.md)、[`demand-sources.md`](demand-sources.md)。

**验收单**：[research-checklist.md](research-checklist.md) 查产物覆盖；执行顺序与裁决只见 [entry.md](playbooks/entry.md)，网页项不能替代 App 市场验证，不适用项记 N/A 与理由。

### 主词与域名用词实测闸门

保留标题供旧链接定位；这里只核入口卡①是否覆盖主词与候选域名完整短语的原始证据、市场、窗口、日期及状态，测量与合并量处理只见 [trends.md「gpts 基线判读」](trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源)。没有候选域名记「尚无候选域名」；新增或更换用词补对应记录，未知项按 [entry.md](playbooks/entry.md#4--判读)处理。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| 主词与域名用词记录 | 回读上节覆盖记录，新增短语未沿用其他词的证据 | 入口卡①、原始证据指针 | 先复用存量，缺项按上节指针补 | 新增/更换用词、证据失效 |
| 平台与 App 市场证据 | 分发形态与适用项有状态，公开估计与自有后台分开，网页读数未替代 App 证据 | `.rankup/research/` | [research.md App 分支](playbooks/research.md#app-市场验证分支)与 [demand-sources.md](demand-sources.md) | 每轮 |
| 否决清单对照 | 已查旧结论；复用或复活有原证据与条件指针 | 研究报告「已否决对照」 | 查 `.rankup/rejected.md`、`decisions.md` 与旧报告 | 每轮 |
| 入口卡与 GT 卡 | 入口卡字段可回读；GT 原始读数、量级判读与缺测状态有指针 | `.rankup/research/<词根>-<日期>.md` 入口卡① | [entry.md 产出](playbooks/entry.md#2--产出)；[trends.md](trends.md) | 按唯一源 |
| ChatGPT 问法链路与三清单 | 问法池、环境卡、首次回答、追问及三张清单均可追溯原始证据；缺项有状态 | 同上入口卡②；原始记录路径 | [seo-geo.md 步骤 2–3](seo-geo.md#步骤-2探针采样)，有效样本先复用 | 按 [步骤 6](seo-geo.md#步骤-6复测节奏) |
| 逐问法 Google 与意图证据 | 每条长尾问法有 Google 卡指针，市场与日期可查；意图记录与 GT 卡分别可见 | 入口卡③、`.rankup/keywords.md` | [seo-serp.md](seo-serp.md#逐问法-google-读法) | 按 [SERP 有效期](seo-serp.md#serp-快照有保质期窗口在关闭必须带复测日期) |
| 本地词与反查补漏 | 非英语来源、探索日志、竞品差集、停止原因与新意图补测状态可查；不适用有理由 | 入口卡③、研究报告第 3 节 | [P2](playbooks/research/p2-keyword-root.md)，不重复扩树或反查阈值 | 新意图/证据失效 |
| 两路结论与页面移交 | SEO/GEO 的结论与支持、反证、未知有原证据指针；页面清单承接问法与任务 | 入口卡④、`keywords.md`；`decisions.md` 只留结论与指针 | [entry.md 判读](playbooks/entry.md#4--判读)；[段 2](lifecycle/stage-2-positioning.md) | 新证据/事实变化 |
| 背景与局限 | 本轮采集的社区、流量、收入及估算均带来源、口径、日期或缺测状态 | 研究报告与 `.rankup/decisions.md` | 来源见 [demand-sources.md](demand-sources.md)，只核记录覆盖 | 按来源 |

## 段 2 · 立项与定位

说明见 [`lifecycle/stage-2-positioning.md`](lifecycle/stage-2-positioning.md)（段 2）、[`trends.md`](trends.md) W1、[`cloudflare-stack.md`](cloudflare-stack.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **立项 / 建站前用词记录已核** | 回读段 1 [用词记录](#主词与域名用词实测闸门)，拟用短语有证据与状态 | 入口卡①与 `.rankup/checks.md` | 复用段 1 记录 | 新增/更换用词、证据失效 |
| **语种与市场决定已落** | 选定市场、语言与扩张候选有两路证据指针及理由 | `.rankup/decisions.md` | [stage-2-positioning.md](lifecycle/stage-2-positioning.md) | 新证据/范围变化 |
| **问法簇 → 页面 → 形态已映射** | 页面清单、用户任务、真实能力与承接问法有关联；产品形态与变现备注可回读 | `.rankup/PROJECT.md`、`keywords.md` 与页面清单 | [stage-2-positioning.md](lifecycle/stage-2-positioning.md)；变现见 [monetization.md](monetization.md) | 新页面/任务变化 |
| 关键路径有可测试的验收标准 | `plan.md` 每条 P0 都写了动作、证据、预期影响和完成判定 | `.rankup/plan.md` | 手写 | 每轮 |
| 每个 Cloudflare 服务都有理由 | 每个服务写明需求、binding、环境边界和失败处理；**没有「以后可能需要」而提前创建的资源** | `.rankup/architecture.md` | 对照 [`cloudflare-stack.md`](cloudflare-stack.md) 逐项填 | 一次 |
| 域名是待定项 | `infrastructure.md` 的域名一栏写「待段 5 定稿」，本段没有选域名、没有买域名 | `.rankup/infrastructure.md` | 域名裁决在段 5，这里只留位 | 一次 |
| 高风险动作有回滚方案 | 数据、支付、发布三类各有一条回滚路径 | `.rankup/decisions.md` | 手写 | 一次 |

## 段 3 · 建站与开发

Web组件、Cloudflare和后续URL/SEO检查仅适用Web面；原生App按[`lifecycle/stage-2-positioning.md`](lifecycle/stage-2-positioning.md) 2.2与平台专项工具验收，网页项N/A需说明理由。

说明见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md)（段 3）（3.1 初始化 / 3.2 Cloudflare 基础 / 3.3 开发与测试 / 3.4 集成）、[`cloudflare-stack.md`](cloudflare-stack.md)、[`integrations.md`](integrations.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **建设中内容与功能区域为零** | 渲染产物及公开附属文件词表命中 0；无未实现或无后端入口；设计稿与说明待上线状态 0 | 检查输出、入口操作与设计回读进 `.rankup/audit.md` | 用模板时尤其要核对模板占位已全部替换；按[唯一规则](discipline.md#二十一禁止建设中内容与功能区域)；构建期检查器与步骤见[段 3](lifecycle/stage-3-build.md) | 动了页面 / 设计 / 功能 |
| **UI 只来自组件库** | 业务代码里没有手写的基础控件（下拉框 / 弹窗 / 日期选择 / 表格分页 / Toast / Tabs）；每个控件能指出它来自 `components/ui/` 的哪个文件或哪个已安装的 shadcn / React 生态包；库里没有的先 `shadcn add` 或安装再用 | 本轮 diff 与 `components/ui/` 目录清单 | `grep -rn 'role="dialog"\|role="listbox"\|role="combobox"\|<select' apps/` 逐条核来源；命中在业务目录的就是手写 | 每轮 |
| **设计走 `/design` 且带获奖标准 prompt** | 本轮设计任务记录里有 `/design` 画布链接（无画布时为 `frontend-design` 的调用记录），且任务描述原文包含「Awwwards、Webby Awards、FWA」「Dribbble、Behance」「通过自我检查不断优化，直至符合这个标准」；journal 里有至少一轮自检记录（对照该标准列出的差距与修改）；配图风格与站内设计语言一致 | 设计任务记录 + journal + 截图 | 对照 [`stage-3-build.md`](lifecycle/stage-3-build.md) 硬规则「设计一律走 `/design`」；缺调用记录或缺自检记录即不通过 | 每次整站设计 / 改版 / 新增页面类型 |
| **多功能工具站侧栏模式** | 采用该模式时，[侧栏统一规范](design-references.md#多功能工具站侧栏统一规范)的结构、交互、工具覆盖与跨模板回归均通过；不适用则说明原因 | 本轮截图、导航对账与浏览器回归记录 | 按权威段落逐项核验，不以单张首页截图代替 | 动了共享布局 / 导航 / 图标样式 |
| **建站起点有据可查** | journal 有完整的 (A) 用户指定模板来源（地址或路径）、版本（提交哈希或标签）与复制/生成命令原文，或 (B) 默认 shadcn init 精确命令原文；**缺记录不通过，且没有 `create-next-app` / `create-vite` 等其他脚手架痕迹**（模板自身使用的栈不算，但须在记录中说明） | 项目仓库 + journal | 两种方式及默认命令原文见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 · 3.1 第 1 条；逐项核对完整记录 | 一次 |
| 脚手架真实可运行 | 实际项目结构被包管理器识别（Monorepo 核对 workspace 与共享包），dev/build 脚本真实跑通，用户已有文件没被覆盖；两种起点都适用 | 项目仓库 | 真跑一遍，不看脚手架的成功输出 | 一次 |
| 构建缓存生效 | 连续两次构建，第二次命中缓存 | 项目仓库 | 连跑两次比对耗时与缓存日志 | 一次 |
| 站点身份不是模板占位 | title/description/manifest/OG 里没有脚手架预设文案，且是段 2 裁定的语种；`<html lang>` 对得上 | 项目仓库 | grep 脚手架默认字符串及模板占位站名/文案；用模板时尤其要核对模板占位已全部替换 | 一次 |
| **无占位红线** | 全站任何页面任何地方**没有**占位链接（`href="#"`、`example.com`、`javascript:void(0)`）、占位文案（lorem ipsum、「待补充」、`Project ready!`、`Hello world`）、占位图片（灰块、`placeholder`、`via.placeholder`）；grep 零命中且预览域逐页人眼过过 | grep 输出 + `.rankup/audit.md` | 扫描词表见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 · 3.1 第 7 条。**Google 据此判垃圾站，整站连坐**；命中的要么换真实内容要么删区块，不许「先留着」 | 动了页面 |
| **占位专项：源码 grep 零命中** | 源码目录用 [`discipline.md`](discipline.md) 十四那批正则全量 `grep -rn`（排除 `node_modules`、构建产物），零命中；命中的立即处置，不许标「待补」 | 命令与输出进 `.rankup/audit.md` | 正则见 discipline 十四；这是与「无占位红线」互补的**独立必过项**——前者是人眼过页面，这项是机械扫源码，两者都要过 | 动了页面 |
| **域名是一处配置留位** | 域名只存在于一个常量/环境变量；**全仓库 grep 不到域名字面量**；预览构建输出 `noindex` 与 `robots.txt` `Disallow: /`，两处由同一个索引开关控制 | 项目仓库 + 预览域 `curl` | 做法见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 · 3.1 第 6 条。开发期不接正式域名 | 一次 |
| **远端仓库私有且已推送** | `gh repo view --json isPrivate` 为 true，当前状态已推；若公开，journal 里有用户明说「公开」的原话 | 项目仓库 | `gh repo create <name> --private --source . --push`。未上线项目的仓库里带着选题与定价策略，公开等于把选题送人 | 每轮 |
| 入库内容不含凭据 | 将要入库的文件里没有真实密钥、token、私钥 | 项目仓库 | 提交前扫一遍 diff | 每轮 |
| 公开内容页已预渲染为静态资产 | 内容页构建产物是静态 HTML，`run_worker_first` 只含 `/api/*` 等动态路径；请求内容页时 Worker 请求数不增长；确需 SSR 的页面已在 `.rankup/PROJECT.md` 写明原因 | `.rankup/infrastructure.md` | `wrangler dev` + curl、读回 wrangler 配置 | 一次 |
| 真实 SSR/API 路径能跑 | 至少一条 SSR 页面和一条 API 路由在本地或预览环境返回预期内容 | `.rankup/infrastructure.md` | `wrangler dev` + curl | 一次 |
| **匿名页 HTML 边缘缓存已实现且线上验证** | 匿名页面（无 Cookie/Authorization 的 GET 页面）线上连续两次 `curl` 第二次带 `x-edge-cache: HIT` 且 TTFB 明显下降；换出口/节点再测一遍；部署新版本后首个请求是 `x-edge-cache: MISS` 且内容是新版本 | `.rankup/infrastructure.md` | 做法见 [`cloudflare-stack.md`](cloudflare-stack.md)「12. 匿名页面 HTML 边缘缓存（Cache API）」 | 一次 |
| **Cloudflare 循环消耗红线** | 触发图覆盖全部后台入口、回写与重试边；每条循环有持久化终止条件和操作量/成本上界；共享预算副作用前原子预留；独立停用能阻止续约与生产。空待办/失败/重复/重启/取消/过期/超预算的故障测试通过，隔离环境真实熔断后完整观察窗口内业务操作不再增长；正常任务与有限重试不回归。预算告警不当硬顶，未证明有界的付费后台链路不得启用；纯静态或未用 CF 的项写明不适用依据 | 触发图、预算与计费依据、测试命令/断言、停机步骤、实测时间与指标进 `.rankup/audit.md` / `infrastructure.md` | 唯一操作源见 [§8.9](cloudflare-stack.md#89-循环消耗与账单熔断红线)；检索只是起点，必须追所有调用者和平台触发配置 | 建站当天 / 上线前 / 改触发链或额度 / 每次 review |
| bindings 完成最小读写验证 | 每个声明的 binding 都做过一次真实读写，不是只在配置里存在 | `.rankup/infrastructure.md` | 逐个 binding 跑一次 | 一次 |
| 预览域可访问且未绑正式域名 | 预览域返回 `noindex`；`wrangler.jsonc` 没有指向正式域名的 custom domain / routes | 预览域 `curl` + `wrangler.jsonc` | 域名接入在段 5 | 一次 |
| 仓库与 `.rankup/` 无真实密钥 | `secrets.md` 只有名称、用途、环境、保管位置 | `.rankup/secrets.md` | 扫描 | 每轮 |
| 目标验收场景通过 | 本轮定义的可观察结果逐条达成 | `.rankup/plan.md` | 按 plan.md 的完成判定逐条核 | 每轮 |
| 类型检查、测试、生产构建全绿 | 三样都跑过且通过。**失败不得隐瞒，也不得把旧失败归因到本次改动** | 项目仓库 | 项目自己的 check-types / test / build | 每轮 |
| 关键路径不只由 mock 证明 | 至少一条端到端或真实浏览器验证覆盖关键交互 | `.rankup/audit.md` | 真实浏览器或等价 E2E | 每轮 |
| **真实输入回归集** | 项目自带一份真实输入清单（用户给过的 URL / 文件 / 查询 / 样例）与每条在浏览器里亲眼核过的预期，随仓库提交为 fixture；改了核心逻辑（解析器、API、即将上线的新功能）就全量跑一遍，**预期由浏览器判定，不由脚本自证** | `.rankup/evidence/live-inputs-<date>/report.json` | 项目内自己的 live 测试命令；新输入先在浏览器里看清内容再填预期。用户新给的输入一律先追加进 fixture，再当场跑 | 每轮 |
| 未解决问题有处置计划 | 每条遗留问题都写了证据、影响、处置计划，不是只列现象 | `.rankup/audit.md` | 手写 | 每轮 |
| **没有重复造轮子** | 每个自写的通用能力（登录、支付、邮件、图片/PDF/OCR 处理）都在 `decisions.md` 写了「为什么现成的三方库/服务/Skill 不能用」；写不出理由的已换成现成方案 | `.rankup/decisions.md` | 先 `find-skills`、再查三方库与托管服务，见 [`integrations.md`](integrations.md)「三方库/服务优先」 | 一次 |
| 集成在目标环境端到端验证 | 不是本地 mock 通过就算；所选支付主通道与备份通道各有一条（通道按 `monetization.md` 选，不强制 Stripe 与 PayPal 都接） | `.rankup/integrations.md` | 按 [`integrations.md`](integrations.md) 逐项验证 | 每轮 |
| 回调签名、幂等、错误路径 | 三类各有一次真实验证记录 | `.rankup/integrations.md` | 构造真实回调与重复回调 | 一次 |
| 四处均未暴露密钥 | 代码、日志、Git、`.rankup/` 扫描都干净 | `.rankup/secrets.md` | 扫描 | 每轮 |
| **D1 · `SITE_URL` 构建期注入客户端** | 域名与索引开关的共享构建配置在 SSR / 无 `process` 的客户端一致；production 开与 preview 关两条构建回归都通过，缺 `SITE_URL` 构建失败。首次 SSR、水合后、真实 SPA 导航后 canonical 恰好一条、自指且无占位，og:url 一致；站点控制的 robots meta 恰好一条并符合环境，响应头及额外机器人指令无冲突，preview 保留 `noindex` 与 robots 封锁 | 两种构建回归 + SSR/响应头 + 浏览器三阶段 DOM 进 `.rankup/audit.md` | [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 D1；不能仅找到一条正确标签 | 初始化 / 动了共享配置或 head / 发布 |
| D2 · 边缘缓存随脚手架就位 | 与本表「匿名页 HTML 边缘缓存已实现且线上验证」同一项，验证补一条：**用 GET 而不是 HEAD**——多数实现的缓存键只对 GET 生效，HEAD 会得到假阴性 | 同上 | 见 [`cloudflare-stack.md`](cloudflare-stack.md)「12」 | 一次 |
| D3 · 字体策略当天定死 | 判据见闸门 6「Web 字体总字节是独立判据」一行，本行不重复；CJK 系统字体栈、拉丁自托管子集化、不 `preload` 非首屏字重；装饰字体不在 PSI 前 15 个请求里 | 同闸门 6 | 见 [`seo-box.md`](seo-box.md) 一 | 一次 |
| D4 · 分析脚本延迟加载 | 判据统一见段 5「分析通道在采集」：开发时即验证延迟触发、首屏与 SPA 去重及实际远端上报，性能优化后不遗漏这些回归 | 同段 5 | [`analytics-platforms.md`](analytics-platforms.md) | 动了分析加载器或共享入口 |
| **D5 · 图片默认已到位** | 页面内的 logo、hero 图、装饰图均为 WebP+PNG 回退（favicon 按 D15 的图标格式规则）且按显示尺寸出图（含 2x）、标注 `width`/`height`；首屏 LCP 图有 `fetchpriority="high"`，非首屏图有 `loading="lazy"`；`og:image` 不在首屏渲染路径里；**任意一张首屏图片原始文件 > 200KB 视为不通过** | 图片体积清单进 `.rankup/audit.md` | `curl -sI` 逐张图取 `content-length`，检查首屏 HTML 里的 `fetchpriority`/`loading` 属性 | 一次 |
| **D6 · 大数据与路由组件不进入口 bundle** | 构建产物分析（`vite build --report` 或等价）确认入口 chunk 不含题库/条目库这类大数据；路由 loader 数据随 HTML dehydrate，客户端**没有**针对同一份数据的二次 `import()`；每条路由的 `component` 直接在 `createFileRoute(...)({ component })` 里静态引用，**不由工厂函数间接返回**——构建产物分析需确认该组件确实拆进了独立路由 chunk，不在主 chunk 里 | 构建产物分析记录进 `.rankup/audit.md` | 看构建产物体积分布 + 网络面板确认无冗余请求；grep 路由文件确认 `component` 不是由工厂函数返回值赋值 | 一次 |
| D7 · DOM 与动画默认项 | 列表/网格缩略图用单个 SVG/canvas 而非逐格 `div`；首屏下内容有 `content-visibility: auto`；动画属性检查（`transition`/`animation`）只涉及 `transform`/`opacity`；无「主内容 `opacity: 0` 靠 JS 淡入」的写法 | grep + DOM 节点计数进 `.rankup/audit.md` | 浏览器 DevTools 数节点数，grep 动画 CSS 属性 | 一次 |
| D8 · CSS 内联策略已实测选定 | CSS gzip 体积记录在案；若 ≤ 约 10KB 选择整份内联，若更大选择关键 CSS 提取，且两种方案都做过**实测对比**（记录内联前后 LCP/渲染阻塞时间），不是凭经验直接选一种 | 实测对比记录进 `.rankup/experiments.md` | PSI 网页版跑内联前后各一次 | 一次 |
| D9 · 路由与协商中间件已处理边界 | 尾斜杠 301 规范化到全站统一形态；`curl -H 'Accept: text/markdown' <404路径>` 与 `curl -H 'Accept: application/json'` 均不返回 500 | curl 输出进 `.rankup/audit.md` | 逐条构造非常规 `Accept` 头请求 | 一次 |
| D10 · sitemap 策略已裁定 | sitemap 只含有独立搜索意图的页（首页/分类页/说明法律页）；模板化内页默认不进 sitemap，`.rankup/decisions.md` 写明触发补入条件（GSC 收录比例阈值）；sitemap 由运行时路由生成，仓库里**没有**构建期写死的静态 sitemap 文件 | `.rankup/decisions.md` + sitemap 源码位置 | 见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 D10；段 4「一个关键词对应一个内页」不等于「模板化内页都要进 sitemap」 | 一次 |
| D11 · og 图渲染失败必须可见 | CJK/RTL 站已用真实文本验证过至少一张 og 图渲染成功（非静态占位、非 0 字节 200）；渲染管线里模拟一次失败输入，确认返回非 200 而不是空图 200 | 渲染验证记录 + 故障注入结果进 `.rankup/audit.md` | 手动构造一次会导致渲染失败的输入 | 一次 |
| D12 · JSON-LD 注入方式与类型选择已定 | JSON-LD 统一走路由 head；合法 JSON 之外，实际类型、属性 domain / 继承关系和值类型已按官方定义及验证工具通过语义核验；适用富结果的必需字段有真实内容支持，无伪造类型、评价或数据；sameAs 可访问、日期与联系资料为真值 | 各模板实际 JSON-LD + 官方规则/验证结果进 `.rankup/audit.md` | [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) D12；内容形状另见闸门 4b，不能以 JSON.parse 成功代替 | 初始化 / 动了 JSON-LD 或模板 |
| D13 · a11y 属性组件级核对 | 真实 DOM 的 role 与父子语义合法；交互网格为 `grid → row → gridcell`，网格项不越过 row；焦点与方向键、输入、点击及相关按钮实测正常，包装层未破坏布局；属性按真实语义设置，纯装饰图 `alt=""` | 真实 DOM + 键盘/点击结果进 `.rankup/audit.md` | [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) D13；不只查属性存在 | 初始化 / 动了交互组件或 DOM |
| D14 · 部署与仓库卫生当天完成 | Workers Builds Git 集成已连接（判据同段 5「Cloudflare Git 集成已连接」一行）且 `wrangler.jsonc` 注释记录了接入日期；`lint`/`test` 命令脚手架跑通当天即为绿并已进 `ship` 命令；`.env`/`.cf-token` 类文件在首次提交前已入 `.gitignore`（`git log --all --full-history -- .env` 应为空） | `wrangler.jsonc` 注释 + `git log` 输出 | 见 [`lifecycle/stage-3-build.md`](lifecycle/stage-3-build.md) 段 3 D14 | 一次 |
| **D15 · 品牌图标当天做齐** | 段 4「图标专项（上线前必过）」的资产、引用与图案检查在开发当天已通过；静态目录及构建产物无 React / Vite / TanStack 默认图标残留，含根 `/favicon.ico` | 图标清单与实图预览进 `.rankup/audit.md` | 唯一操作源见 [`lifecycle/stage-4-prelaunch.md`](lifecycle/stage-4-prelaunch.md) 段 4 · A 节；不能只改 SVG 或文件名 | 一次 |

## 段 4 · 上线前 SEO/GEO（预览域 noindex；九行闸门）

**本表是闸门判据的唯一源；操作见 [段 4 操作](lifecycle/stage-4-prelaunch.md) A/B/C 节及内页清单。全部必走，只跑命令、未留证据不算通过；图标专项未通过不许上线。**
预览域的 `noindex` / `Disallow: /` 是设计：闸门 1、2、4 里由它引起的 robots 类项记「设计，段 5 放开索引后复核」，不算红灯。
上线前复用 D1、D4、D12、D13 与 P3 的判据；发布后在正式环境回读本轮涉及项。共享模板或加载器改动覆盖其消费模板，延迟脚本性能优化须回归相关 head、交互与分析上报；这项增补不扩大为每次小改都重测无关页面或平台。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **有用内容与可信度** | 本轮新增或实质改动的可索引页逐页通过 [`seo-helpful-content.md` 单页级自检表](seo-helpful-content.md#单页级自检表)，≥15/16、关键项全为 2、无 0 分与红线 | 逐 URL 分数、范围与证据进 `.rankup/audit.md` | 按单页表核对真实投入、增量、准确性、责任与 AI 披露 | 动了页面 |
| **每页目标词已登记** | 每个进 sitemap 的页面在 `keywords.md` 有「URL ↔ 目标短语」一行，短语是原字符串，并关联承接问法簇、任务与页面清单证据；没登记的页面不进闸门 3 | `.rankup/keywords.md` | 页面映射见 [段 2](lifecycle/stage-2-positioning.md)，实施见 [段 4](lifecycle/stage-4-prelaunch.md) | 动了页面 |
| **无关区块不进 SSR 文本** | 价格表、UI 控件标签、单位、法务文案等不属于目标文案的区块已改客户端加载或交互门控注入（想被 AI 引用的价格表与推荐位除外，保持 SSR，见 [`seo-ssr.md`](seo-ssr.md) 做法一边界）；`--density-only` top15 里没有 UI 词；用交互门控的，无头零输入下 SSR 不含该区块、单击后出现 | 密度输出 + 无头测试记录进 `.rankup/audit.md` | [`seo-ssr.md`](seo-ssr.md)「交互门控注入」 | 动了页面 |
| **每页独立 title/description/og:image 且有图** | 全站 title、description、`og:image` 三样逐页互不重复；每页至少一张真实 `<img>`；`og:image` ≥1200px 宽且尺寸声明是真值；**全站共用一张 `og:image` 不通过** | seo-audit `--json` + `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) B8 | 动了页面 |
| **文案闸门（起稿即带，不是起稿后再改）** | 中文正文过 `/write` 阶段四：`check_prose.py` 的「需要修改」为空（冒号、破折号、「不是A而是B」及意思层面的先否后肯清零）、无矫饰比喻、无模型口癖、长句≤45 字为主；日韩无破折号；英文按 `/ai-seo` Information Gain 自查，**长句按句量不按段量**（40 词），无 AI 词汇，无 not-X-but-Y；每语种 title 30–60、description 70–160 | `.rankup/evidence/copy-check/<页>-<语种>.md` | `/write` 阶段四、`/ai-seo`；抽文案与检查固化成项目脚本，起稿 prompt 带闸门并循环到 0；起稿即校验可减少返工 | 动了页面 |
| **功能声明逐条对代码核** | 页面与首页对比表里每一条「有 / 无」都能指到源码；产品文档（FEATURES 之类）与代码不一致时以代码为准并回改文档；不写「即将推出」占位 | agent 报告里的 file:line 清单进 `.rankup/audit.md` | 起稿 prompt 写「只写代码能证明的，证明不了就删」；产品文档可能把桩或菜单入口误写成可用功能或快捷键，必须以源码核实 | 动了页面 |
| 闸门 0 · 站点身份 | OG 元数据（`og:image` ≥1200px，逐页独立）与图标全集预览域 200，`manifest.json` 引用全部命中真实文件，标记经 16px 实测；`manifest.json` 的 `display` 按站点类型判过（详见 [段 4 操作](lifecycle/stage-4-prelaunch.md) 段 4 · A 节第 5b 条），纯营销/引流/内容站预览域没有浏览器安装提示；无占位扫描零命中 | `.rankup/integrations.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) A 节、C0 | 动了页面 |
| **图标专项（上线前必过）** | 标准图标集（由同一品牌 logo 源图通过 `make-favicons.mjs` 生成的 `favicon.ico` 内含 16/32/48、`favicon-48.png`、`favicon-96.png`、`favicon-192.png`、`apple-touch-icon.png` 180×180、`icon-512.png`）做齐；首页及各模板的 SSR / 水合后 DOM 所有 icon、shortcut icon、apple-touch-icon 引用，manifest icons 与根 `/favicon.ico` 均完成核对；head 声明 `<link rel="icon" href="/favicon.ico" sizes="48x48">` 与 48/96/192 三个 PNG 图标及 apple-touch-icon、manifest，不引用与 logo 不一致的 SVG；逐个 GET 为 200 且解码为真图（非 HTML），响应类型、声明尺寸与真实尺寸一致，方形、URL 稳定且有 ICO/PNG 搜索回退；每张图经人眼确认属于同一品牌、非脚手架默认图标；16px 可辨认 | 引用清单、响应类型/真实尺寸、实图预览进 `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) 段 4 · A 节第 4–5a 条；仅有文件或浏览器标签显示正常均不算通过 | 动了图标或 head/manifest |
| **占位专项（硬性红线，不过不许进段 5）** | 按 sitemap 逐 URL `curl` 全站 HTML，用 [`discipline.md`](discipline.md) 十四那批正则 grep 零命中；**且人工抽查首页、定价页、关于页、联系页、法律页（隐私政策/条款）**，每个链接真的可点（不是 404、不是 `#`）、每张图真的有内容（不是占位图床、不是空 `src`）；按[建设中红线](discipline.md#二十一禁止建设中内容与功能区域)核渲染词表命中 0、无未实现或无后端入口、设计稿与说明待上线状态 0 | grep 输出（逐 URL）+ 人工抽查记录进 `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md)「步骤 check」C-占位；`seo-audit.mjs` 的 `PLACEHOLDER_*` 只做字面检测，不能替代人工抽查；`site-page-audit.mjs` 检查文本与元数据，逐入口回读实现 | 动了页面 |
| 闸门 1 · 技术 SEO | sitemap 条目与按 D10 裁定的 URL 集合一致且零 404；全体可索引页面的 SSR 可达性另按 P3 核验；内链零 404、零 `href="#"`；`llms.txt` 列出的路径与真实 URL 一致（不是模板占位）；robots 除预览封锁外未误挡应收录路径；已验证 Ahrefs 所有权时，本地与 Ahrefs 两边均无问题才通过，记录 Ahrefs 抓取日期，逐 URL 对账后修复并重抓核销 | `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) C1；Ahrefs 逐 URL 清单与重抓核销见 [工具取数](seo-box.md)「Ahrefs AWT 免费档」 | 动了页面 |
| 闸门 2 · TDK | 全站 title 互不重复、description 互不重复且长度在截断阈值内；**每页恰好一个 `h1`**；必修观察项清零（seo-audit 已改为只出事实记录，哪些算必修按 [工具取数](seo-box.md)「seo-audit 判读指引」判：NO_TITLE / NO_DESCRIPTION / NO_VIEWPORT / NO_H1 等为零，`fetchError` 为零——抓取失败 ≠ 通过；预览域的 NOINDEX 记为设计）。**覆盖全站每一个 URL，不是抽样** | `.rankup/audit.md`（逐 URL，不是一条总述） | [段 4 操作](lifecycle/stage-4-prelaunch.md) C2；`--json` 顶层经 `Object.values()` 逐页读 `issues`，title/description 为 `{text,length}` 对象 | 动了页面 |
| 闸门 3 · 关键词密度 | 密度在自然区间，且**「声明的短语」与「测量的短语」逐页是同一个字符串** | `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) B6、C3 | 动了页面 |
| **sitemap 内容日期** | 每个 URL 有有效 lastmod、无未来日期；全站同日须核实真实历史；内容更改后对应日期确实变化 | sitemap 快照及改动前后证据 | `sitemap-lastmod-check.mjs <域名>` + 对照内容提交 | 动了页面 |
| 闸门 4 · GEO / AI Agent 就绪度 | 有带分数与逐项结果的基线报告，且**每条 `partial`/`failed` 都独立核实过**（成立则改，误报则记驳回理由）；`llms.txt` 存在且与 sitemap 一致 | `.rankup/agentic/<domain>/<date>.json` + 核实结论进 `audit.md` | `is-agentic.mjs scan <domain> --save` | 动了页面 |
| **AI 爬虫可访问性** | 正式域名各 AI 爬虫 UA 请求首页、一个内页、`robots.txt`、`llms.txt` 全部 200，且 robots.txt 不对任何 AI 爬虫写 `Disallow: /`；预览域封锁只能记设计，正式域名必须重验；OpenAI 官方发布的爬虫 IP 段没被 WAF 或 Cloudflare 规则拦，改 robots 或规则后约 24 小时再复测，ChatGPT-User 的 200 只证明可达、判断有没有进搜索看 OAI-SearchBot（见 [`seo-ai-search.md`](seo-ai-search.md)「三-D」） | 逐 UA 状态表进 `.rankup/audit.md` | `node <rankup-skill-dir>/scripts/ai-crawler-access.mjs --url <正式域名>`；`llms.txt` 404 单列为文件缺失，不能算拦截或本项全过 | 绑定正式域名 / 改了爬虫或安全配置 |
| **AI 爬虫读到的 raw HTML 与桌面/移动一致** | 每类模板页至少一个：`ua-parity.mjs` 的四个 UA 均 200，title、canonical、robots meta、h1 有无、JSON-LD 块数一致，词集与 Googlebot Smartphone 基线的差异在 2% 内或有可解释的原因，`Vary` 不含 User-Agent（含则逐个 UA 读内容）；想被 AI 引用的区块（价格表、推荐位、FAQ）在 raw HTML 里，不是 mount 后才渲染；没有「疑似客户端渲染空壳」提示，或已逐条核实为误报。预览域封锁记设计，正式域名必须重验 | 逐 UA 对照表（脚本输出）进 `.rankup/audit.md` | `ua-parity.mjs <url>`；读法见 [`seo-ssr.md`](seo-ssr.md)「三-E」 | 绑定正式域名 / 改了渲染或安全配置 / 动了页面 |
| 闸门 4b · GEO 内容形状（AITDK GEO 标签页） | 每个内容页：≥1 条外部官方来源（`<cite>` + 外链）汇成 Sources 节；≥1 张规格表（`<table>`），半数以上行含有出处的数字；FAQ 问题是 H3；页面节点（SoftwareApplication / WebPage / WebSite）带 `author` + `datePublished` + `dateModified` 且页面有可见 `<time>`；Organization 不输出空 `sameAs`；预览域 robots 类三项 FAIL 记设计，段 5 放开索引后复核；面板与兜底均不可用时仍做全站 curl 计数，落 `.rankup/evidence/page-audit-<date>/geo-counts.tsv`，记 ⬜ 并注明原因，不算通过 | `.rankup/evidence/aitdk-geo-<date>/` | [段 4 操作](lifecycle/stage-4-prelaunch.md) C4b；自动取数、前置条件与兜底见 [工具取数](seo-box.md)「AITDK 面板全自动取数」 | 动了页面 |
| 闸门 4c · AITDK 全站报告（第三双眼睛） | 按 sitemap 抽样跑 AITDK 全报告：首页 + 每类模板页各至少一个 + 全部法律/关于/联系页；每份报告 Issues 标签页零问题；每个带评分的标签页（以脚本实际输出为准，不编字段名）都是满分。**所有标红/标黄问题及未满分项都算必修**，逐条修完重跑，直到全绿满分；改不动的写清为什么改不动，登记进 `checks.md` 标 ⏸，不留空；工具不可用记 ⬜ 并写原因，不算通过；不因闸门 1–4b 全绿而跳过 | `.rankup/evidence/aitdk-full-<date>/`（报告 JSON 路径 + 修复前后对照） | [段 4 操作](lifecycle/stage-4-prelaunch.md) C4c；批量取数与窗口容量见 [工具取数](seo-box.md)「多个 URL」与「窗口模式」 | 动了页面 |
| 闸门 5 · 哥飞开放 API 数据复核 | `page_coach` / `onpage_audit` 对代表页给出独立结果；与本地事实逐条核实，每条建议有采纳/拒绝记录和理由；原始响应的 `requestId`、`credits.charged`、工具名与市场已保存 | `.rankup/audit.md` + `.rankup/evidence/` | 调用与价格余额查询见 [`seo-webcafe.md`](seo-webcafe.md)；不使用站内 AI review | 动了页面 |
| 闸门 6 · 性能 / CWV | 抽样首页 + 每类模板页各至少一个 + 一个内容/说明页，移动端与桌面端都跑（`--strategy both`）；**硬下限，不是项目自设**：每份报告实验室性能分 ≥ 90，LCP ≤ 2.5s、CLS ≤ 0.1、TBT ≤ 200ms（INP 有现场数据时 ≤ 200ms），任一不达标闸门不过；**opportunity 与 diagnostic 逐条必修**——每条要么修掉重跑证明消失，要么写明改不动的原因（第三方脚本、平台限制等）并在 `checks.md` 标 ⏸，不许「分数够了就不看清单」；现场（CrUX）无数据如实记「现场无数据（流量不足）」，不是 0、不等于通过、不留空，段 5 在正式域名补，有现场数据以现场为准；**先验仪器再信读数**；**PSI 抽样至少跑两次，其中一次要在边缘缓存热身之后（先访问一次让缓存命中，再跑 PSI）**；**TTFB（初始服务器响应时间）> 600ms 视为不通过，先查匿名页 HTML 边缘缓存是否命中**（`x-edge-cache` 头），命中仍慢才排查别的原因；**Web 字体总字节是独立判据**：CJK 站默认系统字体栈，拉丁站自托管子集化到实际用到的字符与字重、单站字体总量控制在几十 KB 级、不 `preload` 首屏用不到的字重，`font-display: swap/optional` 只解决绘制阻塞不省字节，看 PSI 网页版「第三方/资源分解」与「网络依赖树」的字体总字节；**只认 PSI 网页版读数，本地 Lighthouse（simulate 或 devtools 节流）不能替代**；本地 Lighthouse 只用于迭代定位，读报告顺序是「第三方分解 / 网络依赖树」先于「渲染阻塞资源」审计；**LCP 慢而报告里看不到明显阻塞资源时，排查顺序补三步**：先查该页 VeryHigh/High 子资源清单（Lantern 优先级模型，见 [工具取数](seo-box.md) 一）→ 再查首屏是否有定时入场动画在 trace 窗口内制造新 LCP 候选 → 最后查文档 brotli 体积是否超过约 14.6KB 的 Lantern 初始拥塞窗口；**PSI 读数怀疑是平台抖动前，必须用同一时段的一个已知稳定对照站陪测**，对照站分数稳定就说明问题在自己站，不许在没有对照的情况下把双峰或异常波动记成「平台抖动」；**`checks.md` 里没有这一行等于没过**，不能因为其他闸门全绿就记段 4 通过 | `lhr.json + summary.md`（`.rankup/evidence/pagespeed-<date>/` 下每 URL × 策略各一份，含逐条 opportunity/diagnostic 的 `details.items` / `subItems` 逐文件明细）与 `.rankup/baseline.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) C6；`pagespeed.mjs collect --strategy both`、`plan` 兜底与取数边界见 [工具取数](seo-box.md)「一 · PageSpeed 网页版」「LHR 直抠」 | 动了页面 |
| 封板声明（分数接近满分时） | 剩余建议逐条判「不做」并写理由 | `.rankup/audit.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) C11 | 每轮 |
| **改动即全套重跑** | 本段内（以及段 7 之后）每一次页面改动，上面九行闸门**全部**重跑并留了本轮证据，对比数字进 `experiments.md`；**没有「只重跑第 4、6 行」这类抽样记录** | `.rankup/experiments.md` | [段 4 操作](lifecycle/stage-4-prelaunch.md) C12（diff / collect 仅是其中两行的对比工具） | 动了页面 |
| **P0 · 内页有 SEO Brief** | 新增内页在起稿前已有主词/辅助词/搜索意图/页面类型与结构/TDK 草稿，登记进 `.rankup/keywords.md` 该 URL 对应行；非英语页写明是按 Brief 重新生成还是逐句翻译（逐句翻译不通过） | `.rankup/keywords.md` | 见 [段 4 操作](lifecycle/stage-4-prelaunch.md) 段 4「新增内页 / 新模板的随手清单」P0 | 动了页面 |
| **P1 · 内页 TDK 规格达标** | title 40–60 字且主词在句首、分隔符按语种（日文全角「｜」，拉丁站用 `-`/`\|`）；description 140–160 字且含本页真实事实（具体数字，不是套话）；H1 唯一含目标词；H2 ≥ 2、H3 ≥ 2 | seo-audit `--json` 输出 + 人工核对分隔符与事实 | 见 [段 4 操作](lifecycle/stage-4-prelaunch.md) 段 4「新增内页 / 新模板的随手清单」P1 | 动了页面 |
| **P2 · 内容形状随模板带** | 每个内容页有 `<table>` 规格信息、≥1 条 `<cite>`+外链的外部来源、FAQ 用 H3 + `FAQPage` JSON-LD（结构卫生项，不是被 ChatGPT 引用的收益依据）、可见更新日期；模板化内页正文 ≥ 150 字且含本页独有事实（不是同模板复制文案）；首屏第一句话说清本页解决什么 | `.rankup/evidence/aitdk-geo-<date>/` 与人工抽查 | [段 4 操作](lifecycle/stage-4-prelaunch.md) 内页清单 P2；新增当场自查，闸门 4b 批量体检 | 动了页面 |
| **P3 · 独立 og + 内链闭环** | 每页 og:image 真实、体积 > 10KB、不共用；canonical 自引，面包屑/同类上一项下一项/回分类页齐全；全部可索引内容经分类或可抓取分页的 SSR 真实 `<a href>` 可达，内链图与可索引路由清单对账无遗漏，包含 sitemap 外页面；不能仅靠客户端按钮/搜索/无限滚动，无需全塞首页或全入 sitemap；样板控件文案在 aria-label、不进 SSR 正文 | og/密度结果 + SSR 内链图和逐 URL 覆盖清单 | [段 4 操作](lifecycle/stage-4-prelaunch.md) 段 4 P3 | 动了 URL / 分类分页或内链模板 |
| **P4 · 新页四张清单同步** | 新增页面已出现在：边缘缓存白名单（判据同「匿名页 HTML 边缘缓存」一行）、markdown 协商白名单（判据同闸门 1「技术 SEO」）、sitemap（仅当有独立搜索意图，按 D10 裁定）、本轮 IndexNow 增量推送清单 | `.rankup/audit.md` 逐页勾选 | [段 4 操作](lifecycle/stage-4-prelaunch.md) 内页清单 P4 | 动了 URL |
| **P5 · 新模板 PSI 抽样已覆盖** | 新增模板首次上线前，PSI 抽样清单里已包含该模板至少一个真实页面（不是复用旧模板的抽样结果代表新模板）；判据同闸门 6 | `.rankup/evidence/pagespeed-<date>/` | [段 4 操作](lifecycle/stage-4-prelaunch.md) 内页清单 P5 | 动了页面 |
| P6 · 无 JS 内容占比 | 判据同闸门 3「关键词密度」，样板文案不进 SSR 正文（同 P3） | 同闸门 3 | [段 4 操作](lifecycle/stage-4-prelaunch.md) 内页清单 P6 | 动了页面 |

## 段 5 · 上线与接入

说明见 [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md)（段 5）（5.1 批 A / 5.2 黑历史裁决 / 5.3 域名定稿与绑定 / 5.4 部署验证（含放开索引）/ 5.5 批 B / 5.6 复核索引已放开）、[`cloudflare-stack.md`](cloudflare-stack.md) §8.5、[`search-platforms.md`](search-platforms.md)、[`analytics-platforms.md`](analytics-platforms.md)。
顺序固定：批 A（预览域）→ 黑历史裁决 → 绑域名 → 部署验证（索引开关随之翻开，不等批 B）→ 批 B → 复核索引已放开 → 提交 sitemap（默认不逐 URL 请求编入索引，需要催收录时可选 `gsc-request-indexing.mjs`）。**一个不漏**——有站 80% 流量来自 Bing，有站英语市场做得好流量却几乎全部来自韩国。
**正式域名不再靠 `noindex` / `Disallow: /` 拖到批 B 接完才放开**：曾有项目这样做，Google 抓到过屏蔽状态的 robots.txt，放开后 GSC 仍长期报「已编入索引，尽管遭到 robots.txt 屏蔽」，理由与替代方案见 [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) 段 5.4 第 22 条。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **批 A 在预览域接好并验证** | Cloudflare Web Analytics、GA4、Clarity 三个都有资源 ID 与「数据流状态条 / 互不相同的国家设备来源」两类证据；**先接的是不需要第三方账号的那个** | `.rankup/integrations.md` | `cf-analytics-setup.mjs`；GA4 与 Clarity 接入步骤见 [`analytics-platforms.md`](analytics-platforms.md) | 一次 |
| 分析通道在采集 | 延迟加载器的首次交互与无交互兜底均按设计触发；HTML Accept 原始响应与真实浏览器分别核验，首屏及真实 SPA 导航无重复加载/重复同一事件，站点 ID 与目标远端一致，至少有实际远端上报证据。API 开关关闭不等于 HTML 无注入，源码含脚本或资源 200 不等于已上报；性能优化后仍须通过相关回归 | HTML 响应、浏览器脚本/事件及远端结果进 `.rankup/integrations.md`，仅存脱敏数据 | [`analytics-platforms.md`](analytics-platforms.md)；`analytics-beacon-check.mjs` 只覆盖其实际支持的检查，缺少项补真实浏览器验证 | 动了分析加载器 / 共享入口 / 注入配置或相关发布 |
| **域名黑历史裁决** | 每个候选域名四项都有带日期的证据：官方 `gefei-domain` 的域名历史工具（前世）、Wayback 快照、外链画像（官方 `gefei-domain` 的外链工具或 Ahrefs）、Google `site:` 与品牌名搜索；**成人 / 赌博 / 药 / 被惩罚 / 大量垃圾外链任一命中即否决**，否决的连证据一起记；通过且有前世的标 `has_history: true` | `.rankup/decisions.md` | 做法见 [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) 段 5 · 5.2。定稿前必查，**不允许「外链多但先用着」** | 会过期 |
| zone 与 NS 用真实解析核验 | `whois` 的真实返回或 zone `active`，**不是「已告知用户改 NS」就结项**；NS 值交给用户自己改，没有代劳；域名没有代买 | `.rankup/infrastructure.md` | `whois -h <注册局 whois> <域名>`；路径见 [`cloudflare-stack.md`](cloudflare-stack.md) §8.5 | 一次 |
| DNSSEC 先关后开 | 换 NS 前 `whois` 复查到 `unsigned`；zone active 后用 Cloudflare 的 DS 重新启用 | `.rankup/infrastructure.md` | [`cloudflare/domain-email.md`](cloudflare/domain-email.md)「换 NS 之前必须先关 DNSSEC」 | 一次 |
| 域名跳转是 301 且不超过一跳 | 裸域/www、http/https 收敛到同一个规范域，**中间每一跳都是 301**；302/307 不传权重 | `.rankup/infrastructure.md` | `curl -sIL <四种入口> \| grep -iE '^(HTTP/\|location:)'`，判据见 [`seo-box.md`](seo-box.md) 二。要**全站**而不只是这四个入口，用 `ahrefs-site-audit.mjs report <id> redirects` | 动了 URL |
| **基础安全按用途核验** | HTTPS 收敛、`nosniff`、Referrer-Policy 生效；嵌入、CSP、HSTS 与实际 API 防护按 §8.8 判适用性，缺口已修复或注明阻塞，不用统一模板误伤业务；生产 GET、关键资源/API 类型与相关正常及拒绝路径通过 | `.rankup/audit.md` + `.rankup/infrastructure.md`：变更前后、精确规则/版本、验证与回滚 | [`cloudflare-stack.md`](cloudflare-stack.md) §8.8 | 绑定正式域名后、上线验收前；已上线 review 或改了共享入口/API/安全规则 |
| 域名留位已换成正式域名 | 只改了那一处常量；**全仓库 grep 预览域字面量为零**；canonical / `og:url` / sitemap 指向正式域名 | grep 输出 + `curl` | 见 [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) 段 5 · 5.3 第 16 条 | 一次 |
| **Cloudflare Git 集成已连接且首次自动构建成功** | Pages「Git 存储库连接」或 Worker Workers Builds 已连到 `main`；控制台能看到一次成功的自动构建记录；仓库里**没有**给网站部署用的 `.github/workflows/*.yml`（跑测试/lint 的 workflow 不算）；接入前已在干净克隆里用 `pnpm install --frozen-lockfile` 构建通过。**验证方式是 push 一个无害提交（例如 `robots.txt` 加一行注释）后线上可见，不接受本地 `wrangler deploy` 作为通过证据**——本地部署证明的是产物能上线，不证明 Git 集成本身接通了 | `.rankup/infrastructure.md` | 配置模板见 [`cloudflare/deploy.md`](cloudflare/deploy.md) §9.1（优先用 `cf-builds-connect.mjs` 走 API）；`grep -rl "wrangler deploy\|pages deploy" .github/workflows/` 应为空；干净克隆验证见 [`cloudflare/deploy.md`](cloudflare/deploy.md) §9.1.1 | 一次 |
| 线上部署关联到预期提交 | 部署状态里的提交号 = 本轮要发的提交 | `.rankup/releases.md` | `wrangler deployments` 或 CF 面板 | 每轮 |
| 真实域名返回预期 SSR HTML | curl 拿到的原始 HTML 里有预期正文，不是壳；本轮涉及的 D1 / D12 / D13 与分析项按原判据回读，批量内容按 P3 验证包括 sitemap 外索引页的 SSR 图覆盖。**构建成功 / Worker upload 成功 / 健康页 200 都不算完成** | `.rankup/releases.md` | `curl -s https://<域名>` | 每轮 |
| **正式域名图标回读** | 正式域名重跑段 4 图标专项；放开索引后首页允许 Googlebot、图标允许 Googlebot-Image 抓取，robots/访问控制无误挡；保存本次真实响应与图片证据，Google 搜索显示状态单独记录 | `.rankup/releases.md` + `.rankup/audit.md` | [`lifecycle/stage-4-prelaunch.md`](lifecycle/stage-4-prelaunch.md) 段 4 · A 节第 5a 条；用户代理请求成功不等于 Google 已重新抓取 | 每次发布 / 放开索引 |
| 关键 API、bindings、上传、鉴权、支付回调 | 适用项逐条在线上跑过一次，支付用的是 **live** 凭证 | `.rankup/releases.md` | 逐条真实请求 | 每轮 |
| 回滚目标和方法已记录 | 写明回滚到哪个版本、用什么命令 | `.rankup/releases.md` | 手写 | 一次 |
| **批 B 清单逐行有状态** | GSC、Bing、Yandex、Naver、IndexNow、Ahrefs WA、**Ahrefs Site Audit**、Email Routing `hello@`、Preferred Sources、**兜底行（做哪个市场就接哪个市场的引擎）** 每一行标 ✅（证据+日期）/ ⬜ / ❌（裁决依据）/ ⏸（阻塞原因与需要用户做什么）；**兜底行按段 2 的市场填了具体平台或写明「该市场无额外引擎」，不许空着**；搜索平台建的是网域资源，记的是**资源 ID 不是名字** | `.rankup/integrations.md` | 对照 [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) 段 5 批 B 平台清单；DNS OAuth 与 Bing「从 GSC 导入」**由用户自己点** | 每轮 |
| GA4 与 GSC 已关联 | 先建 GSC 网域资源、再建 GA4 媒体资源；关联列表显示对应域名 | GA4 关联页截图 + `.rankup/integrations.md` | `ga4-gsc-link.mjs link --domain <域名>`，再运行 `status` 回读 | 一次 |
| IndexNow | 密钥文件正文逐字节等于密钥，首次全量推送已接受；每条实际部署路径（含 Workers Builds CI 部署命令）都带仓库内 IndexNow 脚本；使用 Workers Builds 时实际触发器配置已回读，最近一次部署日志有 `accepted N url(s) (HTTP 200)`，N 与窗口内及无 lastmod 的变动页清单相符；无变动时日志明确跳过且 exit 0；条数、HTTP 状态与日期已记录 | `.rankup/integrations.md` + 实际触发器配置/最近构建日志 | [IndexNow 操作](search-platforms.md#12-indexnow)。**密钥不可达时整批被丢弃而接口照样回 200** | 动了 URL |
| **线上 sitemap 内容日期** | 每个 URL 有有效 lastmod、无未来日期；全站同日须核实真实历史；改内容后对应日期变化 | 线上 sitemap 与改动前后证据 | `sitemap-lastmod-check.mjs <域名>` | 每次内容发布 |
| 两边 sitemap 已提交 | GSC 与 Bing 都提交过，记的是**快照日期**不是实时值 | `.rankup/integrations.md` | `webmaster-sitemap.mjs <gsc\|bing> submit` | 动了 URL |
| **`hello@<domain>` 收信与防冒充分别通过** | 转发规则存在、收过测试邮件，JSON-LD `contactPoint.email`、`/about`、外链联络三处同一 `hello@`；SPF / DKIM / DMARC 按 §8.6 主动核查，拒收/隔离策略生效，外发认证通过或有依据标不适用；仅 `p=none`、用途未知或 DNS 未生效不能标完成 | 线上 HTML + CLI/API 回读 + 权威/公共 DNS + `.rankup/integrations.md` 用途依据、变更前后及回滚记录 | [`cloudflare-stack.md`](cloudflare-stack.md) §8.6 | 新建/绑定域名、接邮箱、上线及现站 review |
| **Cloudflare AI 爬虫阻止已关闭** | Bot Management 的 `ai_bots_protection`、`ai_training`、`ai_search`、`ai_user` 均回读为 `disabled`；托管 robots.txt 无 `ai-train=no` 或 AI 爬虫 `Disallow: /` | `.rankup/integrations.md` | [`cloudflare-stack.md`](cloudflare-stack.md) §8.5、§8.7；仅看 robots.txt 不足以发现边缘 403 | 新 zone / 改了安全配置 |
| **上线站推荐位探测与整改闭环** | 按闭环完成 ChatGPT 网页版探测、建议甄别、整改发布与复审，记录出现率及区间、未达标或停止原因；不得把知情复审混作自然推荐 | `.rankup/geo-loop/<日期>.md`，原始证据指向仓库外 | [`seo-geo-recommendation-loop.md`](seo-geo-recommendation-loop.md) | 沿用 [`seo-geo.md`](seo-geo.md) 步骤 6 复测节奏 |
| **AI 爬虫上线实测** | 各 AI 爬虫 UA 请求首页、一个内页、`robots.txt`、`llms.txt` 全部 200，且 robots.txt 不对任何 AI 爬虫写 `Disallow: /`；`llms.txt` 404 单列缺失，不能算拦截或全过 | Bot Management 四字段回读 + 逐 UA 状态表进 `.rankup/audit.md` | `node <rankup-skill-dir>/scripts/ai-crawler-access.mjs --url <正式域名>`；设置见 [`cloudflare-stack.md`](cloudflare-stack.md) §8.5、§8.8 | 新 zone / 上线 / 改了安全规则 |
| **索引已放开并复核** | 索引开关应在部署验证阶段（5.4 第 22 条）就已翻开，这里只是复核不是第一次翻；正式首页与代表内页按 D1 完成 SSR / 水合 / 真实 SPA 导航一致性复核，索引开关为开，无冲突 noindex、robots 无误挡；preview 仍封锁；段 4 闸门 1、2、4 的设计项转绿 | D1 三阶段证据 + robots/响应头进 `.rankup/audit.md` | [`lifecycle/stage-5-launch.md`](lifecycle/stage-5-launch.md) 段 5.6 第 27–28 条，判据复用 D1 | 放开索引 / 动了索引配置或 head |
| **占位专项复查（硬性红线，放开索引前必过）** | 段 4 的占位专项已在**本域名**（正式域名，不是预览域）线上重跑一遍，零命中；**上一轮在预览域跑过的结果不采信**，域名换了、内容可能也动过 | grep 输出（逐 URL）+ 人工抽查记录进 `.rankup/audit.md` | 正则与人工抽查范围同段 4 闸门；域名定稿绑定后立即重跑，不等放开索引前才想起来 | 一次 |
| **索引放开后已重新提交 sitemap** | GSC 与 Bing 各一条提交记录（快照日期在索引放开之后）；域名 `has_history: true` 时这是放开索引后的**第一件事**；收录进度默认看 sitemap 报告与覆盖率，**默认不逐 URL/首页走 GSC「请求编入索引」**（域名有前世、急需覆盖旧记忆时可选 `gsc-request-indexing.mjs` 加速，见 `search-platforms.md`） | `.rankup/integrations.md` | `webmaster-sitemap.mjs gsc submit` / `bing submit` | 一次 |
| 索引推送焊进出荷命令 | 项目自己的 ship 命令末段带索引推送，**脚本在项目仓库内而不是指向 Skill 目录** | 项目仓库 | 见 [`search-platforms.md`](search-platforms.md)「挂进发布流程」。这是静默收尾动作：漏了不会有任何东西变红 | 动了 URL |

## 段 6 · 外链

说明见 [`lifecycle/stage-6-backlinks.md`](lifecycle/stage-6-backlinks.md)（段 6）、[`webcafe-topics.md`](experiences/webcafe-topics.md) 五，执行在 `backlink` Skill。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **发链时机对** | 目标页已被索引（`site:` 能查到）、段 4 无红灯、段 5 已完成；**没有给 `noindex` 或未索引页发外链** | `.rankup/plan.md` | 对照 [`lifecycle/stage-6-backlinks.md`](lifecycle/stage-6-backlinks.md) 段 6「什么时候发」表 | 每轮 |
| 每项分发有结果 URL 或明确审核状态 | **表单提交成功、成功关键词命中、待付费页面都不算已获得外链** | `.rankup/integrations.md` | backlink 的 `ledger.mjs`，submitted/public/indexed 每级都要证据 | 每轮 |
| 链接预算没被无理由拆分 | 集中投给预算内排最前的目标词；若拆分，`plan.md` 里有拆分理由 | `.rankup/plan.md` | 对照 keywords.md 的链接预算 | 每轮 |
| 两条零成本渠道已做掉 | 公开仓库 README（**另建公开仓，不是私有主仓；外链全 nofollow，买的是收录加速不是权重**）与产品发布平台各有记录；README 与线上 sitemap 逐条 diff 过 | `.rankup/integrations.md` | 仓库 CLI + git；发布平台见 [`product-launch.md`](product-launch.md) | 动了 URL |
| 联络用的是 `hello@<domain>` | 目录提交与触达邮件的发件/联系地址是站点域名邮箱 | `.rankup/integrations.md` | 段 5 已接 Email Routing | 一次 |

## 段 7 · 变现与监控

说明见 [`lifecycle/stage-7-monetize.md`](lifecycle/stage-7-monetize.md)（段 7）（7.1 变现 / 7.2 SEO 与内容增长 / 7.3 监控与迭代）、[`monetization.md`](monetization.md)、[`seo-growth.md`](seo-growth.md)、[`evolution.md`](evolution.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **新增入口与实现同交付** | 本轮新增入口全部有实现与实际结果，无后端入口 0；渲染文案词表命中 0；设计稿与说明待上线状态 0 | 检查输出、入口操作与设计回读进 `.rankup/iterations.md` | 按[唯一规则](discipline.md#二十一禁止建设中内容与功能区域)回段 4 复查 | 新增功能 / 入口 / 设计 |
| **面板对不上的已分诊，只有确认漂移的回流** | 本轮每一处「脚本/文档与面板实际不符」都有分类：`environment-issue`（记 `journal/`，注明排除到了第几层）或 `provider-drift`（五层分诊记录齐全，已修 Skill 原文档并同步 JSON、脚本已验证日期已更新）。**没有「看到一次就改了文档」** | `.rankup/journal/<date>.md`「面板对不上」小节；漂移的另附 `.rankup/evidence/drift-<平台>-<date>/` 截图 | [`discipline.md`](discipline.md) 十五 | 每轮 |
| **本轮否决的都进了否决清单** | 本轮 pass 掉的词、方向、功能、渠道、域名每个在 `.rankup/rejected.md` 有一行：对象 / 类型 / 日期 / 一句理由 / 复活条件 / 证据链接；只写「不做」不写理由的不算 | `.rankup/rejected.md` | 收尾时对照本轮 `journal/` 与 `iterations.md` 逐条补；被否决的建议同时在 `audit.md` 留理由 | 每轮 |
| 变现路径按段 2 的裁定接了 | 段 2.2 定的变现方式（广告 / 单次付费 / 订阅 / 商店）至少一条在线上真实可用，有一笔真实交易或一次真实结算记录 | `.rankup/integrations.md` | 路由与判据见 [`monetization.md`](monetization.md) | 一次 |
| 线上技术信号已核实 | 改了什么就在线上核过什么，不是本地看着对 | `.rankup/audit.md` | `seo-audit.mjs --sitemap <url>` | 每轮 |
| **改动后段 4 全套重跑** | 本轮动过页面，段 4 九行闸门全部重跑并有本轮证据；**没有「只重跑某两行」** | `.rankup/experiments.md` | 回段 4 表逐行过 | 动了页面 |
| 本轮改过的旧 URL 跳转正确 | 每个被改/被删的旧 URL 都 301 到新址，**不是 302，也不是软 404 落回首页** | `.rankup/audit.md` | `curl -sIL <旧 URL>`，见 [`seo-box.md`](seo-box.md) 二 | 动了 URL |
| 目标词首页复看 | 本轮动过的目标词，在 Google 与 Bing 各重看一次首页：自己的页面进没进、AI 答案引用名单变没变、盘面有没有新进入者 | `.rankup/experiments.md` | 同 [`demand-sources.md`](demand-sources.md) 第一·五节的七样，只记变化 | 每轮 |
| 实验有基线、目标指标、回看日期 | 三样齐全。**没有观察窗口就没有结论** | `.rankup/experiments.md` | 基线取自段 4 的全套证据 | 每轮 |
| AI 搜索合规项已检查 | Back Button、FAQ schema 现状、非大众化内容审计三项都查过并记录 | `.rankup/audit.md` | 对照 [`seo-ai-search.md`](seo-ai-search.md) | 每轮 |
| 没有承诺未经观察窗口的结果 | 结论都带观察窗口；排名没稳（连续 5 天不动）之前只做加法 | `.rankup/iterations.md` | 自查，判据见 [`webcafe-experiences-2.md`](experiences/webcafe-experiences-2.md) 十七~十九 | 每轮 |
| 指标更新到明确时间点 | 每个数字都带日期和来源，流量数字标了同意门槛哪一侧 | `.rankup/baseline.md` | 各平台读数 | 每轮 |
| 异常有归因或验证计划 | 定位到具体版本、页面、渠道、环境或集成，**不是只看聚合指标** | `.rankup/iterations.md` | 手写 | 每轮 |
| 本轮迭代已记录 | 做了什么、判据、结果、下一轮唯一改进。**失败轮次写清被证伪的假设** | `.rankup/iterations.md` | 手写 | 每轮 |
| **回段 1 判据已对过** | 流量 / 收入 / 索引六行触发条件逐条对过读数；命中的写明哪一条与下一棵树的词根，没命中的写明「继续打磨，不开新树」；**没有在没命中时开新站，也没有在命中时继续加码外链** | `.rankup/iterations.md` + `.rankup/roadmap.md` | 表在 [`lifecycle/stage-7-monetize.md`](lifecycle/stage-7-monetize.md) 段 7 · 7.3「回到段 1 的判据」 | 每轮 |
| 回流内容已剥离项目信息 | 不含站名、域名、流量数字、property ID；证据与数字留在项目侧 | `.rankup/experience.md` | 回流后跑 `validate-rankup.mjs` | 每轮 |
| 跨项目登记表已刷新 | 本轮新增的可复用脚本已被扫到 | `registry.md` | `registry.mjs scan --roots <目录>` | 每轮 |

---

## 缺 check 的时候

发现某个环节有该做、而本文件里没有的动作时，**先补进这里，再去做**——顺序反了，
这一条就只会存在于那次对话里。补的时候：

1. **只写判据，不写教程。** 「怎么做」一列给一句话加一个指路，操作说明写进对应的 md。
2. 只对当前项目成立的写进项目侧 `.rankup/`，跨项目成立的才进这里
   （晋升门见 [`evolution.md`](evolution.md)）。
3. 定复查口径。**拿不准就写「每轮」**——多跑一次的成本远小于漏跑一次。
