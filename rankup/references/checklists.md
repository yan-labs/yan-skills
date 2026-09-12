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
| **步骤 check** | 各段自己的 md 里，紧跟在必做动作后面（[`lifecycle.md`](lifecycle.md) 每段的「步骤 check」一节） | **这一步做对了没有** | 每做完一步就核 |

**关系是单向的：闸门过不了，一定是某条步骤 check 没过。** 反过来不成立——
步骤全过不自动等于闸门过，闸门还要判跨步骤的一致性
（例如段 1 每个词单独看都齐了，但意图核验与搜索量核实的先后顺序看不出来）。

**为什么步骤 check 不写在这里**：它脱离动作原文就没法读。硬塞进本文件会逼着执行的人
在两个文件之间来回翻，而判据和动作一旦分家，改了动作没改判据是必然发生的事。

## 三条规则

| 规则 | 为什么 |
|---|---|
| **每条 check 都要有证据，证据要写清楚在哪个文件的哪一段** | 这套东西唯一致命的失败形态是**看着全绿、底下什么都没有**。只跑了命令、没留下证据不算过；控制台一个绿色图标不是证据 |
| **闸门判据写在这里，步骤判据紧贴动作，操作说明写在各自的 md** | 同一件事在两处各写一份，改了一处另一处就静默过期，而两边看起来都正常。所以本文件的「怎么做」一列只给一句话加一个指路 |
| **过不了就写清为什么过不了** | 需要 CAPTCHA、需要付费决策、需要用户的物理操作 —— 这些标 ⏸ 并写明卡在哪、需要用户做什么，不要留一个悬空的空格 |

**还有一条贯穿全程的：任何调研都要亲眼去搜索引擎看一遍第一页。** 数据平台给的是模型输出与面板外推，首页是搜索引擎此刻真正端给用户的东西。至少 Google + Bing，做非英语市场再加目标市场的本地引擎，方法见 [`demand-sources.md`](demand-sources.md) 第一·五节。

## 复查口径：哪些 check 下一轮还要再过

| 口径 | 含义 | 典型 |
|---|---|---|
| **一次** | 过了就一直过，技术事实不会自己退回去 | 脚手架跑通、zone 生效、远端仓库存在 |
| **每轮** | **每一轮迭代都必须重跑** | 三方对账、构建全绿、性能基线、迭代记录 |
| **动了 URL** | 本轮新增或修改了线上可访问的 URL 才必须重跑 | 上线前闸门的 TDK、技术 SEO、IndexNow 推送 |
| **动了页面** | 本轮改了任何页面的内容、结构或元数据（不一定新增 URL）就必须**全套**重跑 | 段 4 的九行闸门——改一处 TDK 可能带坏密度，改一个区块可能带坏 CLS |
| **会过期** | 依赖的外部数据是易腐品，超过 30 天必须重取 | SERP 快照、关键词裁决、域名黑历史 |

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
| 闸门 5 · 哥飞 AI 审阅 | ⏸ | 缺 SEO_WEBCAFE_COOKIE，需要用户在浏览器登录一次 | 2026-08-28 |
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

说明见 [`lifecycle.md`](lifecycle.md) 段 1、[`playbooks/research.md`](playbooks/research.md)、[`experiences/demand-discovery.md`](experiences/demand-discovery.md)、[`demand-sources.md`](demand-sources.md)。

**验收单**：[`research-checklist.md`](research-checklist.md) 是本环节的逐项验收单——覆盖 seo.web.cafe / Semrush / Similarweb / Google Trends / 收入三榜 / 折成钱的完整工具链。**每次调研必须逐项走完，不许只用一部分工具。** 操作顺序以 `playbooks/research.md` 为准。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **否决清单已对过** | 本轮每个候选词/方向/功能开跑前都在 `.rankup/rejected.md` 里查过：命中的要么直接跳过并在报告里引用那一行，要么写明「复活：<复活条件> 已于 <日期> 满足，证据 <…>」再继续；**没有第三种** | `.rankup/research/<词根>-<date>.md` 开头的「已否决对照」段 | `grep -i "<词根或功能名>" .rankup/rejected.md .rankup/decisions.md`，再翻 `.rankup/research/` 有没有同词根旧报告 | 每轮 |
| **多引擎首页实勘** | 目标词/方向在 **Google + Bing + 目标市场本地引擎**（做非英语市场时必看）各搜过一遍，**且是无痕/隔离窗口、显式指定了地区与语言**；每个引擎按 [`demand-sources.md`](demand-sources.md)「每个引擎记下这七样」一节逐样记全，带引擎+国家+日期（七样是什么以那一节为准，本表不复述）。**引擎之间不一致要写出来，不能只留一个「综合印象」** | `.rankup/keywords.md`（词级）或 `.rankup/decisions.md`（方向级） | 见 [`demand-sources.md`](demand-sources.md) 第一·五节。**这一步在任何取数之前**，不许拿 `serp-query.mjs` / `seo-webcafe.mjs serp` 这类二手接口代替——它们看不到版式、SERP 特性和 AI 答案。DuckDuckGo 用的是 Bing 索引，**和 Bing 不算两个独立样本** | 会过期 |
| **词根已扩树且有停止条件** | 用户给的词按词根处理：先亲眼搜过，再扩成树（面板相关词 + Google/Bing/DDG 下拉联想）；**不超过两层**；每片停止扩的叶子写了停止原因（月量低于阈值 / KD 高于阈值 / 已到两层）；三引擎下拉的原始 manifest 落盘 | `.rankup/research/` + `.rankup/keywords.md` | `scripts/demand/suggest.mjs <词根> --engine google,bing,ddg --hl <语种> --gl <地区> --json --out`，顺序见 [`playbooks/research.md`](playbooks/research.md) 步骤 2。**0 条不等于没词**，先看 manifest 里的 status | 会过期 |
| 需求证据 | 每个进入开发的机会都有两条来源不同的证据，至少一条是直接信号（GSC 曝光 / Suggest / 持续投放 / 可核验收入）。证据不足的仍标 `RESEARCH`，没有被写成已验证 | `.rankup/decisions.md` | `scripts/demand/` 取数 → [`demand-sources.md`](demand-sources.md) 第十节的候选验证链路 | 一次 |
| **社区验证已做（四平台各有状态行）** | 每个候选词有近 14 天的社区信号：Reddit / X / YouTube / B 站至少两处的帖数或互动量，带链接与日期；零讨论如实记「社区无信号」而不是空着。**数据平台只有 28 天窗口，这一腿不能省** | `.rankup/keywords.md` | `reddit-wishes` 与 `/agent-reach`，顺序见 [`playbooks/research.md`](playbooks/research.md) 步骤 5 | 会过期 |
| 每个「做」的词有完整裁决 | 六项证据 + 社区信号同时对得上：搜索量、KD、SERP 构成、意图核验、链接预算、目标页面、社区信号。**意图核验与搜索量核实是两条分开可见的记录**，且意图是按 SERP 前十的页面类型判的，不是按字面猜的 | `.rankup/keywords.md` | `seo-webcafe.mjs kd --keyword <词>`；判断读 [`webcafe-topics.md`](experiences/webcafe-topics.md) 一；意图核验做法见 [`lifecycle.md`](lifecycle.md) 段 1 · 1.2 | 会过期 |
| SERP 快照是当天的 | 每个词的 SERP 构成带日期；写了「窗口在关闭」的词另带一个不超过一个月的复测日期 | `.rankup/keywords.md` | 拉一次真实 top10。**先读 [`seo-growth.md`](seo-growth.md) 的 `google.com/goto` 一节**——二手 SERP 通道会降级但照样 200，盘面「突然空了」先怀疑通道 | 会过期 |
| **月量已用 Trends 锚点交叉验证** | 每个候选词的月量都有 Trends 锚点折算值与相对 Semrush/Similarweb 的偏差倍数，或明确标注「Trends 无法分辨」（12 个月多数月份指数为 0）——**没有这两种状态之一的候选词不许进裁决** | `.rankup/keywords.md` | `playbooks/research.md` P2 阶段 3 的锚点交叉验证步骤；判据与折算表见 [`trends.md`](trends.md)「〇·六」 | 会过期 |
| **词表已反查竞品补第二轮** | 自己扩的词池与 **3–5 个同赛道、站龄 9–24 个月竞品的实际排名词库**（每站前 100 词）做过差集，差集里的词逐个补测了量与难度。**被自己判过「太难」的头词也测了**。补漏后**重算了按量加权的 CPC** | `.rankup/keywords.md` | `backlink/scripts/semrush-report.mjs` 取排名词报表；规则见 [`demand-sources.md`](demand-sources.md) 九·六 | 一次 |
| **排上去值不值已折成钱** | 同赛道竞品的**真实流量**（面板，不是关键词模型）已取到并折成收入区间，与词池的模型上界并排写出。**面板与模型的倍差有归因**，不是只写「口径不同」。竞品低于面板收录门槛的，如实记为「无可观测流量」 | `.rankup/roadmap.md`（进立项前置条件）与 `.rankup/decisions.md` | `similarweb-query.mjs` + `semrush-overview.mjs` 取数，`seo-webcafe.mjs money` 折算；**判断读 [`demand-sources.md`](demand-sources.md) 十·五与 ②·六·四**——单个大头词以 #5–#10 撑起竞品过半模型流量时，模型高估 4–13 倍，以面板为准 | 会过期 |
| 量化的继续/停止标准 | `roadmap.md` 有阶段目标与放弃条件，且放弃条件是可判定的数字或事实，不是「效果不好就停」 | `.rankup/roadmap.md` | 判据取自 [`zero-to-one.md`](experiences/zero-to-one.md) 的止损线一节 | 一次 |

## 段 2 · 立项与定位

说明见 [`lifecycle.md`](lifecycle.md) 段 2、[`trends.md`](trends.md) W1、[`cloudflare-stack.md`](cloudflare-stack.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **单语种裁定已落** | 一行裁决：做哪个语种/市场 + W1 的并排数据（各语种量 / KD / CPC）+ 为什么不做多语言 + 扩张候选。**起步没有规划多语言路由**；多语言只在「单语站已拿到流量」的扩张期出现 | `.rankup/decisions.md` | [`trends.md`](trends.md) W1 探测；判据见 [`lifecycle.md`](lifecycle.md) 段 2 · 2.1 | 一次 |
| **意图 → 形态 → 变现对得上** | 产品形态与变现方式是从段 1 的 SERP 意图核验推出来的（信息型 → 内容站接广告；工具型 → 工具页/客户端；持续使用型 → 订阅），三者写在同一行 | `.rankup/PROJECT.md` | 对照 [`lifecycle.md`](lifecycle.md) 段 2 · 2.2 的表；变现细节路由到 [`monetization.md`](monetization.md) | 一次 |
| 关键路径有可测试的验收标准 | `plan.md` 每条 P0 都写了动作、证据、预期影响和完成判定 | `.rankup/plan.md` | 手写 | 每轮 |
| 每个 Cloudflare 服务都有理由 | 每个服务写明需求、binding、环境边界和失败处理；**没有「以后可能需要」而提前创建的资源** | `.rankup/architecture.md` | 对照 [`cloudflare-stack.md`](cloudflare-stack.md) 逐项填 | 一次 |
| 域名是待定项 | `infrastructure.md` 的域名一栏写「待段 5 定稿」，本段没有选域名、没有买域名 | `.rankup/infrastructure.md` | 域名裁决在段 5，这里只留位 | 一次 |
| 高风险动作有回滚方案 | 数据、支付、发布三类各有一条回滚路径 | `.rankup/decisions.md` | 手写 | 一次 |

## 段 3 · 建站与开发

说明见 [`lifecycle.md`](lifecycle.md) 段 3（3.1 初始化 / 3.2 Cloudflare 基础 / 3.3 开发与测试 / 3.4 集成）、[`cloudflare-stack.md`](cloudflare-stack.md)、[`integrations.md`](integrations.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **UI 只来自组件库** | 业务代码里没有手写的基础控件（下拉框 / 弹窗 / 日期选择 / 表格分页 / Toast / Tabs）；每个控件能指出它来自 `components/ui/` 的哪个文件或哪个已安装的 shadcn / React 生态包；库里没有的先 `shadcn add` 或安装再用 | 本轮 diff 与 `components/ui/` 目录清单 | `grep -rn 'role="dialog"\|role="listbox"\|role="combobox"\|<select' apps/` 逐条核来源；命中在业务目录的就是手写 | 每轮 |
| **用的是 shadcn monorepo 命令** | journal 里有命令原文且就是 `pnpm dlx shadcn@latest init --preset … --template start --monorepo`；**没有 `create-next-app` / `create-vite` 或其他脚手架的痕迹** | 项目仓库 + journal | 命令原文在 [`lifecycle.md`](lifecycle.md) 段 3 · 3.1 第 1 条；任何规模都用它 | 一次 |
| 脚手架真实可运行 | Monorepo 被包管理器识别，dev/build 脚本真实跑通，用户已有文件没被覆盖 | 项目仓库 | 真跑一遍，不看脚手架的成功输出 | 一次 |
| 构建缓存生效 | 连续两次构建，第二次命中缓存 | 项目仓库 | 连跑两次比对耗时与缓存日志 | 一次 |
| 站点身份不是模板占位 | title/description/manifest/OG 里没有脚手架预设文案，且是段 2 裁定的语种；`<html lang>` 对得上 | 项目仓库 | grep 脚手架默认字符串 | 一次 |
| **无占位红线** | 全站任何页面任何地方**没有**占位链接（`href="#"`、`example.com`、`javascript:void(0)`）、占位文案（lorem ipsum、「待补充」、`Project ready!`、`Hello world`）、占位图片（灰块、`placeholder`、`via.placeholder`）；grep 零命中且预览域逐页人眼过过 | grep 输出 + `.rankup/audit.md` | 扫描词表见 [`lifecycle.md`](lifecycle.md) 段 3 · 3.1 第 7 条。**Google 据此判垃圾站，整站连坐**；命中的要么换真实内容要么删区块，不许「先留着」 | 动了页面 |
| **占位专项：源码 grep 零命中** | 源码目录用 [`discipline.md`](discipline.md) 十四那批正则全量 `grep -rn`（排除 `node_modules`、构建产物），零命中；命中的立即处置，不许标「待补」 | 命令与输出进 `.rankup/audit.md` | 正则见 discipline 十四；这是与「无占位红线」互补的**独立必过项**——前者是人眼过页面，这项是机械扫源码，两者都要过 | 动了页面 |
| **域名是一处配置留位** | 域名只存在于一个常量/环境变量；**全仓库 grep 不到域名字面量**；预览构建输出 `noindex` 与 `robots.txt` `Disallow: /`，两处由同一个索引开关控制 | 项目仓库 + 预览域 `curl` | 做法见 [`lifecycle.md`](lifecycle.md) 段 3 · 3.1 第 6 条。开发期不接正式域名 | 一次 |
| **远端仓库私有且已推送** | `gh repo view --json isPrivate` 为 true，当前状态已推；若公开，journal 里有用户明说「公开」的原话 | 项目仓库 | `gh repo create <name> --private --source . --push`。未上线项目的仓库里带着选题与定价策略，公开等于把选题送人 | 每轮 |
| 入库内容不含凭据 | 将要入库的文件里没有真实密钥、token、私钥 | 项目仓库 | 提交前扫一遍 diff | 每轮 |
| 真实 SSR/API 路径能跑 | 至少一条 SSR 页面和一条 API 路由在本地或预览环境返回预期内容 | `.rankup/infrastructure.md` | `wrangler dev` + curl | 一次 |
| **匿名页 HTML 边缘缓存已实现且线上验证** | 匿名页面（无 Cookie/Authorization 的 GET 页面）线上连续两次 `curl` 第二次带 `x-edge-cache: HIT` 且 TTFB 明显下降；换出口/节点再测一遍；部署新版本后首个请求是 `x-edge-cache: MISS` 且内容是新版本 | `.rankup/infrastructure.md` | 做法见 [`cloudflare-stack.md`](cloudflare-stack.md)「12. 匿名页面 HTML 边缘缓存（Cache API）」 | 一次 |
| bindings 完成最小读写验证 | 每个声明的 binding 都做过一次真实读写，不是只在配置里存在 | `.rankup/infrastructure.md` | 逐个 binding 跑一次 | 一次 |
| 预览域可访问且未绑正式域名 | 预览域返回 `noindex`；`wrangler.jsonc` 没有指向正式域名的 custom domain / routes | 预览域 `curl` + `wrangler.jsonc` | 域名接入在段 5 | 一次 |
| 仓库与 `.rankup/` 无真实密钥 | `secrets.md` 只有名称、用途、环境、保管位置 | `.rankup/secrets.md` | 扫描 | 每轮 |
| 目标验收场景通过 | 本轮定义的可观察结果逐条达成 | `.rankup/plan.md` | 按 plan.md 的完成判定逐条核 | 每轮 |
| 类型检查、测试、生产构建全绿 | 三样都跑过且通过。**失败不得隐瞒，也不得把旧失败归因到本次改动** | 项目仓库 | 项目自己的 check-types / test / build | 每轮 |
| 关键路径不只由 mock 证明 | 至少一条端到端或真实浏览器验证覆盖关键交互 | `.rankup/audit.md` | 真实浏览器或等价 E2E | 每轮 |
| **真实输入回归集** | 项目自带一份真实输入清单（用户给过的 URL / 文件 / 查询 / 样例）与每条在浏览器里亲眼核过的预期，随仓库提交为 fixture；改了核心逻辑（解析器、API、即将上线的新功能）就全量跑一遍，**预期由浏览器判定，不由脚本自证** | `.rankup/evidence/live-inputs-<date>/report.json` | 项目内自己的 live 测试命令；新输入先在浏览器里看清内容再填预期。用户新给的输入一律先追加进 fixture，再当场跑 | 每轮 |
| 未解决问题有处置计划 | 每条遗留问题都写了证据、影响、处置计划，不是只列现象 | `.rankup/audit.md` | 手写 | 每轮 |
| **没有重复造轮子** | 每个自写的通用能力（登录、支付、邮件、图片/PDF/OCR 处理）都在 `decisions.md` 写了「为什么现成的三方库/服务/Skill 不能用」；写不出理由的已换成现成方案 | `.rankup/decisions.md` | 先 `find-skills`、再查三方库与托管服务，见 [`integrations.md`](integrations.md)「三方库/服务优先」 | 一次 |
| 集成在目标环境端到端验证 | 不是本地 mock 通过就算；Stripe 与 PayPal 各有一条 | `.rankup/integrations.md` | 按 [`integrations.md`](integrations.md) 逐项验证 | 每轮 |
| 回调签名、幂等、错误路径 | 三类各有一次真实验证记录 | `.rankup/integrations.md` | 构造真实回调与重复回调 | 一次 |
| 四处均未暴露密钥 | 代码、日志、Git、`.rankup/` 扫描都干净 | `.rankup/secrets.md` | 扫描 | 每轮 |
| **D1 · `SITE_URL` 构建期注入客户端** | 真实浏览器打开预览域，`document.querySelectorAll('link[rel=canonical]').length === 1` 且 outerHTML 不含占位域名；水合前后 canonical/og:url 一致；取不到 `SITE_URL` 时构建**直接失败**而不是回落占位默认值 | 真实浏览器 DOM 快照（非 `curl`）进 `.rankup/audit.md` | 做法见 [`lifecycle.md`](lifecycle.md) 段 3 · 3.2「脚手架初始化当天默认清单」D1；`curl` 看不出这项，必须真实浏览器渲染后读 | 一次 |
| D2 · 边缘缓存随脚手架就位 | 与本表「匿名页 HTML 边缘缓存已实现且线上验证」同一项，验证补一条：**用 GET 而不是 HEAD**——多数实现的缓存键只对 GET 生效，HEAD 会得到假阴性 | 同上 | 见 [`cloudflare-stack.md`](cloudflare-stack.md)「12」 | 一次 |
| D3 · 字体策略当天定死 | 判据见闸门 6「Web 字体总字节是独立判据」一行，本行不重复；CJK 系统字体栈、拉丁自托管子集化、不 `preload` 非首屏字重 | 同闸门 6 | 见 [`seo-box.md`](seo-box.md) 一 | 一次 |
| D4 · 分析脚本延迟加载 | 与段 5「第三方分析脚本延迟到首次交互或 6s 兜底」同一判据，脚手架当天即接入这个加载策略，不留到接入分析平台那天 | 同段 5 | 见 [`analytics-platforms.md`](analytics-platforms.md) | 一次 |
| **D5 · 图片默认已到位** | logo/favicon 源图、hero 图、装饰图均为 WebP+PNG 回退且按显示尺寸出图（含 2x）、标注 `width`/`height`；首屏 LCP 图有 `fetchpriority="high"`，非首屏图有 `loading="lazy"`；`og:image` 不在首屏渲染路径里；**任意一张首屏图片原始文件 > 200KB 视为不通过** | 图片体积清单进 `.rankup/audit.md` | `curl -sI` 逐张图取 `content-length`，检查首屏 HTML 里的 `fetchpriority`/`loading` 属性 | 一次 |
| **D6 · 大数据不进入口 bundle** | 构建产物分析（`vite build --report` 或等价）确认入口 chunk 不含题库/条目库这类大数据；路由 loader 数据随 HTML dehydrate，客户端**没有**针对同一份数据的二次 `import()` | 构建产物分析记录进 `.rankup/audit.md` | 看构建产物体积分布 + 网络面板确认无冗余请求 | 一次 |
| D7 · DOM 与动画默认项 | 列表/网格缩略图用单个 SVG/canvas 而非逐格 `div`；首屏下内容有 `content-visibility: auto`；动画属性检查（`transition`/`animation`）只涉及 `transform`/`opacity`；无「主内容 `opacity: 0` 靠 JS 淡入」的写法 | grep + DOM 节点计数进 `.rankup/audit.md` | 浏览器 DevTools 数节点数，grep 动画 CSS 属性 | 一次 |
| D8 · CSS 内联策略已实测选定 | CSS gzip 体积记录在案；若 ≤ 约 10KB 选择整份内联，若更大选择关键 CSS 提取，且两种方案都做过**实测对比**（记录内联前后 LCP/渲染阻塞时间），不是凭经验直接选一种 | 实测对比记录进 `.rankup/experiments.md` | PSI 网页版跑内联前后各一次 | 一次 |
| D9 · 路由与协商中间件已处理边界 | 尾斜杠 301 规范化到全站统一形态；`curl -H 'Accept: text/markdown' <404路径>` 与 `curl -H 'Accept: application/json'` 均不返回 500 | curl 输出进 `.rankup/audit.md` | 逐条构造非常规 `Accept` 头请求 | 一次 |
| D10 · sitemap 策略已裁定 | sitemap 只含有独立搜索意图的页（首页/分类页/说明法律页）；模板化内页默认不进 sitemap，`.rankup/decisions.md` 写明触发补入条件（GSC 收录比例阈值）；sitemap 由运行时路由生成，仓库里**没有**构建期写死的静态 sitemap 文件 | `.rankup/decisions.md` + sitemap 源码位置 | 见 [`lifecycle.md`](lifecycle.md) 段 3 D10；段 4「一个关键词对应一个内页」不等于「模板化内页都要进 sitemap」 | 一次 |
| D11 · og 图渲染失败必须可见 | CJK/RTL 站已用真实文本验证过至少一张 og 图渲染成功（非静态占位、非 0 字节 200）；渲染管线里模拟一次失败输入，确认返回非 200 而不是空图 200 | 渲染验证记录 + 故障注入结果进 `.rankup/audit.md` | 手动构造一次会导致渲染失败的输入 | 一次 |
| D12 · JSON-LD 注入方式与类型选择已定 | 全站 JSON-LD 统一走路由 `head()` 的 `scripts` 字段（grep 业务组件内没有手写 `<script type="application/ld+json">`）；`Organization.sameAs` 里每个链接真实可访问；`author`/`datePublished`/`dateModified` 是构建期注入的真实日期，不是硬编码占位日期 | grep 输出 + 抽样 curl 验证 `sameAs` 链接 | 见 [`lifecycle.md`](lifecycle.md) 段 3 D12 与闸门 4b | 一次 |
| D13 · a11y 属性组件级核对 | 网格/按钮类组件的 `role`/`aria-label`/`aria-pressed` 逐一核对不缺失；纯装饰图 `alt=""` | 组件审计记录进 `.rankup/audit.md` | 抽查 `components/ui/` 之外自己包装的交互组件 | 一次 |
| D14 · 部署与仓库卫生当天完成 | Workers Builds Git 集成已连接（判据同段 5「Cloudflare Git 集成已连接」一行）且 `wrangler.jsonc` 注释记录了接入日期；`lint`/`test` 命令脚手架跑通当天即为绿并已进 `ship` 命令；`.env`/`.cf-token` 类文件在首次提交前已入 `.gitignore`（`git log --all --full-history -- .env` 应为空） | `wrangler.jsonc` 注释 + `git log` 输出 | 见 [`lifecycle.md`](lifecycle.md) 段 3 D14 | 一次 |

## 段 4 · 上线前 SEO/GEO（预览域 noindex；九行闸门）

说明见 [`lifecycle.md`](lifecycle.md) 段 4。**判据的完整版在那边，本表只是取用口。**
下表前九行（闸门 0–6 + 4b + 4c）对应 C 节那张表；「每页目标词已登记」「无关区块不进 SSR」「每页独立 OG 含图」出自 B 节，
「封板声明」出自 C 节后面的第 11 条，「改动即全套重跑」出自第 12 条。
**改判据要回各自的出处改，别只改这张表。**
站主原话：「这些东西都必须要走一遍……这是硬性要求」。**只跑了命令、没留下证据不算过这项。**
预览域的 `noindex` / `Disallow: /` 是设计：闸门 1、2、4 里由它引起的 robots 类项记「设计，段 5 放开索引后复核」，不算红灯。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **每页目标词已登记** | 每个进 sitemap 的页面在 `keywords.md` 有「URL ↔ 目标短语」一行，短语是原字符串；没登记的页面不进闸门 3 | `.rankup/keywords.md` | 见 [`lifecycle.md`](lifecycle.md) 段 4 · B 节第 6 条 | 动了页面 |
| **无关区块不进 SSR 文本** | 价格表、UI 控件标签、单位、法务文案等不属于目标文案的区块已改客户端加载或交互门控注入；`--density-only` top15 里没有 UI 词；用交互门控的，无头零输入下 SSR 不含该区块、单击后出现 | 密度输出 + 无头测试记录进 `.rankup/audit.md` | 做法见 [`seo-growth.md`](seo-growth.md)「交互门控注入」。**Googlebot 会渲染 JS**，`DOMContentLoaded` 注入骗不过它 | 动了页面 |
| **每页独立 title/description/og:image 且有图** | 全站 title、description、`og:image` 三样逐页互不重复；每页至少一张真实 `<img>`；`og:image` ≥1200px 宽且尺寸声明是真值；**全站共用一张 `og:image` 不通过** | seo-audit `--json` + `.rankup/audit.md` | 实测 7 语种站共用一张 `og:image` 只有 1 个语种出缩略图（[`seo-growth.md`](seo-growth.md) 2026-07-18） | 动了页面 |
| **文案闸门（起稿即带，不是起稿后再改）** | 中文正文过 `/write` 阶段四：`check_prose.py` 的「需要修改」为空（冒号、破折号、「不是A而是B」及意思层面的先否后肯清零）、无矫饰比喻、无模型口癖、长句≤45 字为主；日韩无破折号；英文按 `/ai-seo` Information Gain 自查，**长句按句量不按段量**（40 词），无 AI 词汇，无 not-X-but-Y；每语种 title 30–60、description 70–160 | `.rankup/evidence/copy-check/<页>-<语种>.md` | 把「抽文案 → 跑正则 → 跑 `check_prose.py`」固化成项目脚本，派起稿 agent 时把闸门写进 prompt 让它自己循环到 0。实测：起稿后再派改稿 agent，一页要 40 多处替换；起稿时就带闸门，一次过 | 动了页面 |
| **功能声明逐条对代码核** | 页面与首页对比表里每一条「有 / 无」都能指到源码；产品文档（FEATURES 之类）与代码不一致时以代码为准并回改文档；不写「即将推出」占位 | agent 报告里的 file:line 清单进 `.rankup/audit.md` | 实测一个功能在产品文档与官网四语都写「有」，代码里只有一个返回空串的桩；另一个功能官网写「同一快捷键」，代码里只能从菜单栏启动。起稿 agent 的 prompt 里必须写「只写代码能证明的，证明不了就删」 | 动了页面 |
| 闸门 0 · 站点身份 | OG 元数据（`og:image` ≥1200px，逐页独立）与图标全集预览域 200，`manifest.json` 引用全部命中真实文件，标记经 16px 实测；`manifest.json` 的 `display` 按站点类型判过（详见 [`lifecycle.md`](lifecycle.md) 段 4 · A 节第 5b 条），纯营销/引流/内容站预览域没有浏览器安装提示；无占位扫描零命中 | `.rankup/integrations.md` | curl 各路径 + 人工核对预览域 HTML | 动了页面 |
| **占位专项（硬性红线，不过不许进段 5）** | 按 sitemap 逐 URL `curl` 全站 HTML，用 [`discipline.md`](discipline.md) 十四那批正则 grep 零命中；**且人工抽查首页、定价页、关于页、联系页、法律页（隐私政策/条款）**，每个链接真的可点（不是 404、不是 `#`）、每张图真的有内容（不是占位图床、不是空 `src`） | grep 输出（逐 URL）+ 人工抽查记录进 `.rankup/audit.md` | `seo-audit.mjs --sitemap` 的 `PLACEHOLDER_*` issue 已内置这批检测，逐页读 `issues` 即可；人工抽查那半不能省，脚本只覆盖 HTML 里能匹配到的字面量，链接是否真的可达要点开确认 | 动了页面 |
| 闸门 1 · 技术 SEO | sitemap 条目与真实 URL 集合一致且零 404；内链零 404、零 `href="#"`；`llms.txt` 列出的路径与真实 URL 一致（不是模板占位）；robots 除预览封锁外未误挡应收录路径 | `.rankup/audit.md` | 抓 sitemap 逐条请求 + 抓全站内链逐条请求 + 请求 `/robots.txt`。站点已在 Ahrefs 里验证过所有权时（段 5 之后），`ahrefs-site-audit.mjs report <id> links` 是**第二双眼睛**——**两边都说没问题才算数，且必须一起记下 Ahrefs 那次抓取的日期**（它抓的可能是几天前的站）。Ahrefs 报的每条问题要用 `issues --json` 里的 data-explorer 链接拿逐 URL 清单，与本地 `seo-audit.mjs` 的结果对上再修，修完手动重抓核销。→ 对应 [`seo-growth.md`](seo-growth.md)「2026 年 Google 十大排名因素」#8（技术 SEO 健康度）与 #10（内部链接） | 动了页面 |
| 闸门 2 · TDK | 全站 title 互不重复、description 互不重复且长度在截断阈值内；**每页恰好一个 `h1`**；必修观察项清零（seo-audit 已改为只出事实记录，哪些算必修按 [`seo-box.md`](seo-box.md)「seo-audit 判读指引」判：NO_TITLE / NO_DESCRIPTION / NO_VIEWPORT / NO_H1 等为零，`fetchError` 为零——抓取失败 ≠ 通过；预览域的 NOINDEX 记为设计）。**覆盖全站每一个 URL，不是抽样** | `.rankup/audit.md`（逐 URL，不是一条总述） | `seo-audit.mjs --sitemap <url> --json`（顶层是以 "0"… 为键的对象，`Object.values()` 后逐页读；title / description 是 `{text,length}` 对象），逐条读 `issues` | 动了页面 |
| 闸门 3 · 关键词密度 | 密度在自然区间，且**「声明的短语」与「测量的短语」逐页是同一个字符串** | `.rankup/audit.md` | `seo-audit.mjs --sitemap <url> --density-only`。实测过 8 个页面在构建绿灯下全过，逐页核对才发现每页测的都不是自己声明的短语 | 动了页面 |
| 闸门 4 · GEO / AI Agent 就绪度 | 有带分数与逐项结果的基线报告，且**每条 `partial`/`failed` 都独立核实过**（成立则改，误报则记驳回理由）；`llms.txt` 存在且与 sitemap 一致 | `.rankup/agentic/<domain>/<date>.json` + 核实结论进 `audit.md` | `is-agentic.mjs scan <domain> --save` | 动了页面 |
| 闸门 4b · GEO 内容形状（AITDK GEO 标签页） | 每个内容页：≥1 条外部官方来源（`<cite>` + 外链）汇成 Sources 节；≥1 张规格表（`<table>`），半数以上行含有出处的数字；FAQ 问题是 H3；页面节点（SoftwareApplication / WebPage / WebSite）带 `author` + `datePublished` + `dateModified` 且页面有可见 `<time>`；Organization 不输出空 `sameAs` | `.rankup/evidence/aitdk-geo-<date>/` | 扩展只能看当前页、要用户浏览器，脚本跑不了：请用户在 AITDK 扩展 GEO 标签页跑一页贴回报告，再 curl 全站数（**无人值守时只能做 curl 计数这半截**：结果落 `.rankup/evidence/page-audit-<date>/geo-counts.tsv`，状态记 ⬜ 并注明「扩展那半截待用户在场」，不许因为做不了另一半就跳过这一半） `<table>/<blockquote>/<cite>/<h3>/<time>` 与 JSON-LD 字段逐页核。**先分「设计」与「缺口」**：robots 类三项在预览域恒 FAIL（`Disallow: /` 是故意的），段 5 放开索引后才算 | 动了页面 |
| 闸门 4c · AITDK 全站报告（第三双眼睛） | 按 sitemap 抽样跑 AITDK 全报告：首页 + 每类模板页各至少一个 + 全部法律/关于/联系页；每份报告 Issues 标签页零问题；每个带评分的标签页（以脚本实际输出为准，不编字段名）都是满分。**不满分或有问题的每一条都算必修**，逐条修完重跑，直到全绿满分；改不动的写清为什么改不动，登记进 `checks.md` 标 ⏸，不留空 | `.rankup/evidence/aitdk-full-<date>/`（报告 JSON 路径 + 修复前后对照） | `bash <rankup-skill-dir>/scripts/aitdk-opencli.sh <url>`，见 [`seo-box.md`](seo-box.md)「AITDK 面板全自动取数」。这是与 Google 视角独立的第三双眼睛，看得到自家 `seo-audit.mjs` 漏掉的项，不因为闸门 1–4b 已经全绿就跳过 | 动了页面 |
| 闸门 5 · 哥飞 AI 审阅 | 每条建议有采纳/拒绝记录，拒绝附理由；**`done` 事件的 `toolCalls`、`rounds`、`charged` 已打印并记录** | `.rankup/audit.md` | `seo-webcafe.mjs chat --ask "审阅 https://<预览域> …"`，见 [`seo-webcafe.md`](seo-webcafe.md) | 动了页面 |
| 闸门 6 · 性能 / CWV | 抽样首页 + 每类模板页各至少一个 + 一个内容/说明页，移动端与桌面端都跑（`--strategy both`）；**硬下限，不是项目自设**：每份报告实验室性能分 ≥ 90，LCP ≤ 2.5s、CLS ≤ 0.1、TBT ≤ 200ms（INP 有现场数据时 ≤ 200ms），任一不达标闸门不过；**opportunity 与 diagnostic 逐条必修**——每条要么修掉重跑证明消失，要么写明改不动的原因（第三方脚本、平台限制等）并在 `checks.md` 标 ⏸，不许「分数够了就不看清单」；现场（CrUX）无数据如实记「现场无数据（流量不足）」，段 5 在正式域名补，有现场数据以现场为准；**先验仪器再信读数**；**PSI 抽样至少跑两次，其中一次要在边缘缓存热身之后（先访问一次让缓存命中，再跑 PSI）**；**TTFB（初始服务器响应时间）> 600ms 视为不通过，先查匿名页 HTML 边缘缓存是否命中**（`x-edge-cache` 头），命中仍慢才排查别的原因；**Web 字体总字节是独立判据**：CJK 站默认系统字体栈，拉丁站自托管子集化到实际用到的字符与字重、单站字体总量控制在几十 KB 级、不 `preload` 首屏用不到的字重，`font-display: swap/optional` 只解决绘制阻塞不省字节，看 PSI 网页版「第三方/资源分解」与「网络依赖树」的字体总字节；**只认 PSI 网页版读数，本地 Lighthouse（simulate 或 devtools 节流）不能替代**——实测同一时刻本地 93–99 分而 PSI 57 分的情况出现过，本地 Lighthouse 只用于迭代定位，读报告顺序是「第三方分解 / 网络依赖树」先于「渲染阻塞资源」审计；**LCP 慢而报告里看不到明显阻塞资源时，排查顺序补三步**：先查该页 VeryHigh/High 子资源清单（Lantern 优先级模型，见 [`seo-box.md`](seo-box.md) 一）→ 再查首屏是否有定时入场动画在 trace 窗口内制造新 LCP 候选 → 最后查文档 brotli 体积是否超过约 14.6KB 的 Lantern 初始拥塞窗口；**PSI 读数怀疑是平台抖动前，必须用同一时段的一个已知稳定对照站陪测**，对照站分数稳定就说明问题在自己站，不许在没有对照的情况下把双峰或异常波动记成「平台抖动」；**`checks.md` 里没有这一行等于没过**，不能因为其他闸门全绿就记段 4 通过 | `.rankup/evidence/pagespeed-<date>/`（每 URL × 策略一份原始 JSON + 修复前后对照表）与 `.rankup/baseline.md` | `pagespeed.mjs plan <抽样 URL…> --strategy both` 出链接与读数清单，再**在浏览器里打开 pagespeed.web.dev 读数**（2026-08-31 起走网页版，零 key 零配额；也可 `pagespeed.mjs collect …` 采双证人存进 `.rankup/evidence/pagespeed-<date>/`）——**网页版一屏同时给实验室（Lighthouse）与现场（CrUX）**；单跑 Lighthouse 只给实验室，这条闸门只能过一半而表面是绿的。`--strategy both` 另指移动端 + 桌面端都跑。**现场那一块不存在 = CrUX 流量不足，原样记「现场无数据（流量不足）」，不是 0、不等于通过，更别留空**（见 [`seo-box.md`](seo-box.md)「一 · PageSpeed 网页版 → 补上闸门 6 缺的那一半」） | 动了页面 |
| 封板声明（分数接近满分时） | 剩余建议逐条判「不做」并写理由 | `.rankup/audit.md` | 不封板，团队会持续消耗在零边际收益的项上，而真正的瓶颈动都不动 | 每轮 |
| **改动即全套重跑** | 本段内（以及段 7 之后）每一次页面改动，上面九行闸门**全部**重跑并留了本轮证据，对比数字进 `experiments.md`；**没有「只重跑第 4、6 行」这类抽样记录** | `.rankup/experiments.md` | `is-agentic.mjs diff` 与 `pagespeed.mjs plan --strategy both` 只是其中两行的对比工具，不是全套 | 动了页面 |
| **P1 · 内页 TDK 规格达标** | title 40–60 字且主词在句首、分隔符按语种（日文全角「｜」，拉丁站用 `-`/`\|`）；description 140–160 字且含本页真实事实（具体数字，不是套话）；H1 唯一含目标词；H2 ≥ 2、H3 ≥ 2 | seo-audit `--json` 输出 + 人工核对分隔符与事实 | 见 [`lifecycle.md`](lifecycle.md) 段 4「新增内页 / 新模板的随手清单」P1 | 动了页面 |
| **P2 · 内容形状随模板带** | 每个内容页有 `<table>` 规格信息、≥1 条 `<cite>`+外链的外部来源、FAQ 用 H3 + `FAQPage` JSON-LD、可见更新日期；模板化内页正文 ≥ 150 字且含本页独有事实（不是同模板复制文案）；首屏第一句话说清本页解决什么 | `.rankup/evidence/aitdk-geo-<date>/` 与人工抽查 | 与闸门 4b 判据一致，本行是「新增内页当场自查」，闸门 4b 是「批量体检」 | 动了页面 |
| **P3 · 独立 og + 内链闭环** | 每页 og:image 真实、体积 > 10KB、不与其他页共用；canonical 自引；面包屑 + 同类上一项/下一项 + 回分类页三件套都在；分类页样板控件文案（「开始」「查看」等）在 `aria-label` 里、不进 SSR 正文 | seo-audit `--json` + `--density-only` top15 无样板词 | 见段 4 内页清单 P3 | 动了页面 |
| **P4 · 新页四张清单同步** | 新增页面已出现在：边缘缓存白名单（判据同「匿名页 HTML 边缘缓存」一行）、markdown 协商白名单（判据同闸门 1「技术 SEO」）、sitemap（仅当有独立搜索意图，按 D10 裁定）、本轮 IndexNow 增量推送清单 | `.rankup/audit.md` 逐页勾选 | 四项各自的验证命令见对应闸门；本行只判「四项都过了一遍，不是漏了某一项」 | 动了 URL |
| **P5 · 新模板 PSI 抽样已覆盖** | 新增模板首次上线前，PSI 抽样清单里已包含该模板至少一个真实页面（不是复用旧模板的抽样结果代表新模板）；判据同闸门 6 | `.rankup/evidence/pagespeed-<date>/` | 见段 4 内页清单 P5 | 动了页面 |
| P6 · 无 JS 内容占比 | 判据同闸门 3「关键词密度」，样板文案不进 SSR 正文（同 P3） | 同闸门 3 | 见段 4 内页清单 P6 | 动了页面 |

## 段 5 · 上线与接入

说明见 [`lifecycle.md`](lifecycle.md) 段 5（5.1 批 A / 5.2 黑历史裁决 / 5.3 域名定稿与绑定 / 5.4 部署验证 / 5.5 批 B / 5.6 放开索引）、[`cloudflare-stack.md`](cloudflare-stack.md) §8.5、[`search-platforms.md`](search-platforms.md)、[`analytics-platforms.md`](analytics-platforms.md)。
顺序固定：批 A（预览域）→ 黑历史裁决 → 绑域名 → 部署验证 → 批 B → 放开索引 → 首页请求编入索引。**一个不漏**——有站 80% 流量来自 Bing，有站英语市场做得好流量却几乎全部来自韩国。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **批 A 在预览域接好并验证** | Cloudflare Web Analytics、GA4、Clarity 三个都有资源 ID 与「数据流状态条 / 互不相同的国家设备来源」两类证据；**先接的是不需要第三方账号的那个** | `.rankup/integrations.md` | `cf-analytics-setup.mjs`；GA4 与 Clarity 接入步骤见 [`analytics-platforms.md`](analytics-platforms.md) | 一次 |
| 分析通道在采集 | **线上原始 HTML 里 grep 得到 beacon**。控制台显示「已启用」不算；beacon 注入方式按运行时选过，没有默认自动注入 | `.rankup/integrations.md` | `cf-analytics-setup.mjs status <domain>` | 每轮 |
| **域名黑历史裁决** | 每个候选域名四项都有带日期的证据：`seo-webcafe.mjs history`（前世）、Wayback 快照、外链画像（`seo-webcafe.mjs backlink` 或 Ahrefs）、Google `site:` 与品牌名搜索；**成人 / 赌博 / 药 / 被惩罚 / 大量垃圾外链任一命中即否决**，否决的连证据一起记；通过且有前世的标 `has_history: true` | `.rankup/decisions.md` | 做法见 [`lifecycle.md`](lifecycle.md) 段 5 · 5.2。定稿前必查，**不允许「外链多但先用着」** | 会过期 |
| zone 与 NS 用真实解析核验 | `whois` 的真实返回或 zone `active`，**不是「已告知用户改 NS」就结项**；NS 值交给用户自己改，没有代劳；域名没有代买 | `.rankup/infrastructure.md` | `whois -h <注册局 whois> <域名>`；路径见 [`cloudflare-stack.md`](cloudflare-stack.md) §8.5 | 一次 |
| DNSSEC 先关后开 | 换 NS 前 `whois` 复查到 `unsigned`；zone active 后用 Cloudflare 的 DS 重新启用 | `.rankup/infrastructure.md` | [`cloudflare-stack.md`](cloudflare-stack.md)「换 NS 之前必须先关 DNSSEC」 | 一次 |
| 域名跳转是 301 且不超过一跳 | 裸域/www、http/https 收敛到同一个规范域，**中间每一跳都是 301**；302/307 不传权重 | `.rankup/infrastructure.md` | `curl -sIL <四种入口> \| grep -iE '^(HTTP/\|location:)'`，判据见 [`seo-box.md`](seo-box.md) 二。要**全站**而不只是这四个入口，用 `ahrefs-site-audit.mjs report <id> redirects` | 动了 URL |
| 域名留位已换成正式域名 | 只改了那一处常量；**全仓库 grep 预览域字面量为零**；canonical / `og:url` / sitemap 指向正式域名 | grep 输出 + `curl` | 见 [`lifecycle.md`](lifecycle.md) 段 5 · 5.3 第 16 条 | 一次 |
| **Cloudflare Git 集成已连接且首次自动构建成功** | Pages「Git 存储库连接」或 Worker Workers Builds 已连到 `main`；控制台能看到一次成功的自动构建记录；仓库里**没有**给网站部署用的 `.github/workflows/*.yml`（跑测试/lint 的 workflow 不算）；接入前已在干净克隆里用 `pnpm install --frozen-lockfile` 构建通过。**验证方式是 push 一个无害提交（例如 `robots.txt` 加一行注释）后线上可见，不接受本地 `wrangler deploy` 作为通过证据**——本地部署证明的是产物能上线，不证明 Git 集成本身接通了 | `.rankup/infrastructure.md` | 配置模板见 [`cloudflare-stack.md`](cloudflare-stack.md) §9.1（优先用 `cf-builds-connect.mjs` 走 API）；`grep -rl "wrangler deploy\|pages deploy" .github/workflows/` 应为空；干净克隆验证见 [`cloudflare-stack.md`](cloudflare-stack.md) §9.1.1 | 一次 |
| 线上部署关联到预期提交 | 部署状态里的提交号 = 本轮要发的提交 | `.rankup/releases.md` | `wrangler deployments` 或 CF 面板 | 每轮 |
| 真实域名返回预期 SSR HTML | curl 拿到的原始 HTML 里有预期正文，不是壳。**构建成功 / Worker upload 成功 / 健康页 200 都不算完成** | `.rankup/releases.md` | `curl -s https://<域名>` | 每轮 |
| 关键 API、bindings、上传、鉴权、支付回调 | 适用项逐条在线上跑过一次，支付用的是 **live** 凭证 | `.rankup/releases.md` | 逐条真实请求 | 每轮 |
| 回滚目标和方法已记录 | 写明回滚到哪个版本、用什么命令 | `.rankup/releases.md` | 手写 | 一次 |
| **批 B 清单逐行有状态** | GSC、Bing、Yandex、Naver、IndexNow、Ahrefs WA、**Ahrefs Site Audit**、Email Routing `hello@`、Preferred Sources、**兜底行（做哪个市场就接哪个市场的引擎）** 每一行标 ✅（证据+日期）/ ⬜ / ❌（裁决依据）/ ⏸（阻塞原因与需要用户做什么）；**兜底行按段 2 的市场填了具体平台或写明「该市场无额外引擎」，不许空着**；搜索平台建的是网域资源，记的是**资源 ID 不是名字** | `.rankup/integrations.md` | 对照 [`lifecycle.md`](lifecycle.md) 段 5 批 B 平台清单；DNS OAuth 与 Bing「从 GSC 导入」**由用户自己点** | 每轮 |
| IndexNow | 密钥文件正文逐字节等于密钥，首次推送已被接受并记下条数与 HTTP 状态 | `.rankup/integrations.md` | `indexnow-submit.mjs`。**密钥不可达时整批被丢弃而接口照样回 200** | 动了 URL |
| 两边 sitemap 已提交 | GSC 与 Bing 都提交过，记的是**快照日期**不是实时值 | `.rankup/integrations.md` | `webmaster-sitemap.mjs <gsc\|bing> submit` | 动了 URL |
| **`hello@<domain>` 可收信且三处一致** | Email Routing 转发规则存在、收过一封测试邮件；JSON-LD `contactPoint.email`、`/about`、外链联络三处是同一个字符串，且只有 `hello@` 这一个地址 | 线上 HTML + `wrangler email routing rules list` | [`cloudflare-stack.md`](cloudflare-stack.md) §8.6 | 一次 |
| **Cloudflare AI 爬虫阻止已关闭** | `curl <site>/robots.txt` 无 `# Cloudflare Managed Content` 段；CF dashboard 两个开关都已关（① Security → Bots → "阻止 AI 训练自动程序" → 不阻止；② Security → Bots → "管理您的 robots.txt" → 禁用）。**新建 zone 默认开启**，不关会阻止 AI 搜索引擎爬虫 | `.rankup/integrations.md` | [`cloudflare-stack.md`](cloudflare-stack.md) §8.7 | 一次 |
| **索引已放开并复核** | 正式域名首页与内页 `curl` 无 `noindex`、robots 无 `Disallow: /`；段 4 闸门 1、2、4 重跑后「设计」项转绿 | `.rankup/audit.md` | 翻索引开关，重跑三行 | 一次 |
| **占位专项复查（硬性红线，放开索引前必过）** | 段 4 的占位专项已在**本域名**（正式域名，不是预览域）线上重跑一遍，零命中；**上一轮在预览域跑过的结果不采信**，域名换了、内容可能也动过 | grep 输出（逐 URL）+ 人工抽查记录进 `.rankup/audit.md` | 正则与人工抽查范围同段 4 闸门；域名定稿绑定后立即重跑，不等放开索引前才想起来 | 一次 |
| **首页已请求编入索引** | GSC 与 Bing 各一条提交记录；域名 `has_history: true` 时这是放开索引后的**第一件事** | `.rankup/integrations.md` | GSC 网址检查 → 请求编入索引；Bing URL 提交 | 一次 |
| 索引推送焊进出荷命令 | 项目自己的 ship 命令末段带索引推送，**脚本在项目仓库内而不是指向 Skill 目录** | 项目仓库 | 见 [`search-platforms.md`](search-platforms.md)「挂进发布流程」。这是静默收尾动作：漏了不会有任何东西变红 | 动了 URL |

## 段 6 · 外链

说明见 [`lifecycle.md`](lifecycle.md) 段 6、[`webcafe-topics.md`](experiences/webcafe-topics.md) 五，执行在 `backlink` Skill。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **发链时机对** | 目标页已被索引（`site:` 能查到）、段 4 无红灯、段 5 已完成；**没有给 `noindex` 或未索引页发外链** | `.rankup/plan.md` | 对照 [`lifecycle.md`](lifecycle.md) 段 6「什么时候发」表 | 每轮 |
| 每项分发有结果 URL 或明确审核状态 | **表单提交成功、成功关键词命中、待付费页面都不算已获得外链** | `.rankup/integrations.md` | backlink 的 `ledger.mjs`，submitted/public/indexed 每级都要证据 | 每轮 |
| 链接预算没被无理由拆分 | 集中投给预算内排最前的目标词；若拆分，`plan.md` 里有拆分理由 | `.rankup/plan.md` | 对照 keywords.md 的链接预算 | 每轮 |
| 两条零成本渠道已做掉 | 公开仓库 README（**另建公开仓，不是私有主仓；外链全 nofollow，买的是收录加速不是权重**）与产品发布平台各有记录；README 与线上 sitemap 逐条 diff 过 | `.rankup/integrations.md` | 仓库 CLI + git；发布平台见 [`product-launch.md`](product-launch.md) | 动了 URL |
| 联络用的是 `hello@<domain>` | 目录提交与触达邮件的发件/联系地址是站点域名邮箱 | `.rankup/integrations.md` | 段 5 已接 Email Routing | 一次 |

## 段 7 · 变现与监控

说明见 [`lifecycle.md`](lifecycle.md) 段 7（7.1 变现 / 7.2 SEO 与内容增长 / 7.3 监控与迭代）、[`monetization.md`](monetization.md)、[`seo-growth.md`](seo-growth.md)、[`evolution.md`](evolution.md)。

| 检查项 | 客观通过条件 | 证据落点 | 怎么做 | 复查 |
|---|---|---|---|---|
| **面板对不上的已分诊，只有确认漂移的回流** | 本轮每一处「脚本/文档与面板实际不符」都有分类：`environment-issue`（记 `journal/`，注明排除到了第几层）或 `provider-drift`（五层分诊记录齐全，已修 Skill 原文档并同步 JSON、脚本已验证日期已更新）。**没有「看到一次就改了文档」** | `.rankup/journal/<date>.md`「面板对不上」小节；漂移的另附 `.rankup/evidence/drift-<平台>-<date>/` 截图 | [`discipline.md`](discipline.md) 十五 | 每轮 |
| **本轮否决的都进了否决清单** | 本轮 pass 掉的词、方向、功能、渠道、域名每个在 `.rankup/rejected.md` 有一行：对象 / 类型 / 日期 / 一句理由 / 复活条件 / 证据链接；只写「不做」不写理由的不算 | `.rankup/rejected.md` | 收尾时对照本轮 `journal/` 与 `iterations.md` 逐条补；被否决的建议同时在 `audit.md` 留理由 | 每轮 |
| 变现路径按段 2 的裁定接了 | 段 2.2 定的变现方式（广告 / 单次付费 / 订阅 / 商店）至少一条在线上真实可用，有一笔真实交易或一次真实结算记录 | `.rankup/integrations.md` | 路由与判据见 [`monetization.md`](monetization.md) | 一次 |
| 线上技术信号已核实 | 改了什么就在线上核过什么，不是本地看着对 | `.rankup/audit.md` | `seo-audit.mjs --sitemap <url>` | 每轮 |
| **改动后段 4 全套重跑** | 本轮动过页面，段 4 九行闸门全部重跑并有本轮证据；**没有「只重跑某两行」** | `.rankup/experiments.md` | 回段 4 表逐行过 | 动了页面 |
| 本轮改过的旧 URL 跳转正确 | 每个被改/被删的旧 URL 都 301 到新址，**不是 302，也不是软 404 落回首页** | `.rankup/audit.md` | `curl -sIL <旧 URL>`，见 [`seo-box.md`](seo-box.md) 二 | 动了 URL |
| 目标词首页复看 | 本轮动过的目标词，在 Google 与 Bing 各重看一次首页：自己的页面进没进、AI 答案引用名单变没变、盘面有没有新进入者 | `.rankup/experiments.md` | 同 [`demand-sources.md`](demand-sources.md) 第一·五节的七样，只记变化 | 每轮 |
| 实验有基线、目标指标、回看日期 | 三样齐全。**没有观察窗口就没有结论** | `.rankup/experiments.md` | 基线取自段 4 的全套证据 | 每轮 |
| AI 搜索合规项已检查 | Back Button、FAQ schema 现状、非大众化内容审计三项都查过并记录 | `.rankup/audit.md` | 对照 [`seo-growth.md`](seo-growth.md) 三-B | 每轮 |
| 没有承诺未经观察窗口的结果 | 结论都带观察窗口；排名没稳（连续 5 天不动）之前只做加法 | `.rankup/iterations.md` | 自查，判据见 [`webcafe-experiences.md`](experiences/webcafe-experiences.md) 十七~十九 | 每轮 |
| 指标更新到明确时间点 | 每个数字都带日期和来源，流量数字标了同意门槛哪一侧 | `.rankup/baseline.md` | 各平台读数 | 每轮 |
| 异常有归因或验证计划 | 定位到具体版本、页面、渠道、环境或集成，**不是只看聚合指标** | `.rankup/iterations.md` | 手写 | 每轮 |
| 本轮迭代已记录 | 做了什么、判据、结果、下一轮唯一改进。**失败轮次写清被证伪的假设** | `.rankup/iterations.md` | 手写 | 每轮 |
| **回段 1 判据已对过** | 流量 / 收入 / 索引六行触发条件逐条对过读数；命中的写明哪一条与下一棵树的词根，没命中的写明「继续打磨，不开新树」；**没有在没命中时开新站，也没有在命中时继续加码外链** | `.rankup/iterations.md` + `.rankup/roadmap.md` | 表在 [`lifecycle.md`](lifecycle.md) 段 7 · 7.3「回到段 1 的判据」 | 每轮 |
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
