# Playbook · 全站体检与轻量定位

预制流水线。用户说一句话，照着这里从头跑到尾，中途不问、不选、不猜。

**本文所有命令里的占位符**：`<rankup>` = 本 Skill 目录（`SKILL.md` 所在目录）、
`<site>` = 站点根 URL（含协议）、`<domain>` = 裸域名、`<sitemap>` = 线上 sitemap 地址。
命令一律在**项目根**执行，产物默认落项目侧 `.rankup/`。

**用户说「我这个网站」但没说是哪个，是这条 playbook 最常见的开局，不是异常。**
`<site>` 怎么取见 [阶段 0.0](#阶段-00--站点地址从哪来先取址再体检)——**先取址，不要反问**。

两条 playbook：

| 你要的是 | 看哪一节 | 大概花多久 |
|---|---|---|
| 「这个站整体怎么样、还差什么」 | [一 · 全站体检](#一--全站体检) | 并行派活约 20–40 分钟 |
| 「现在该做什么、到哪一步了」 | [二 · rankup check](#二--rankup-check) | 3–5 分钟 |

---

## 一 · 全站体检

### 1. 触发

用户会说的原话：`rankup review`、「review 一下我的站」、「查漏补缺」、「我这站还差什么」、
「帮我看看这个站有什么问题」、「整体体检一遍」、「SEO / GEO / AI 那块做没做好」、
「我开了个新项目，直接用这个 Skill 帮我 review」。

**判据**：用户要的是**对站本身下判断**，不是问流程走到哪一步。只要句子里的宾语是「站」
而不是「进度」，走这条。

### 2. 产出

跑完手上必须有这些东西，缺一样都不算跑完：

| 产出 | 落点 | 形态 |
|---|---|---|
| 全站逐 URL 的 TDK / 密度 / 结构化 / hreflang 事实 | `.rankup/audit.md` | 逐 URL 表，不是一句总述 |
| 重定向与内链失效事实 | `.rankup/audit.md` | 每条入口的跳转链 + 状态码 |
| AITDK 全站报告：抽样 URL 的 Issues 清单 + 未满分标签页清单 | `.rankup/evidence/aitdk-full-<date>/` | 逐 URL 一份报告；不满分/有问题的逐条修完重跑，改不动的写明原因 |
| PageSpeed 报告：抽样页面 × 移动/桌面的实验室 + 现场双读数 | `.rankup/evidence/pagespeed-<date>/`（原始 JSON + 修复前后对照表）+ `.rankup/baseline.md` | 判据见 [`../checklists.md`](../checklists.md) 段 4 闸门 6：性能分 ≥ 90、CWV 达标，opportunity/diagnostic 逐条必修与 A6 同等；现场无数据原样记 |
| GEO / AI 就绪度分数与逐项结果 | `.rankup/agentic/<domain>/<date>.json` + 结论进 `audit.md` | 每条 partial/failed 都有采纳或驳回理由 |
| 词表体检 + 长尾扩展 + SERP 盘面 | `.rankup/keywords.md` | 每个词六项证据齐（量/KD/SERP/意图/链接预算/目标页） |
| 哥飞 AI 的二次意见 | `.rankup/audit.md`「外部审阅」一节 | 每条建议有采纳/拒绝 + 理由 |
| 市场规模与潜在市场区间 | `.rankup/decisions.md` + `roadmap.md` | 面板真实流量与模型上界并排，倍差有归因 |
| 接入清单线上实测结果 | `.rankup/integrations.md` | 每行 ✅（证据+日期）/ ⬜ / ❌（裁决依据）|
| 本轮过掉的闸门 | `.rankup/checks.md` | 按 [`../checklists.md`](../checklists.md) 的表格式 |
| 一页结论 | 回复正文 | 修了什么、判死了什么、下一轮唯一改进 |

### 3. 流水线

#### 阶段 0 · 摸前提（串行，主线自己跑，别派 agent）

这一阶段决定后面哪些组能跑、哪些组只能标 ⏸。**跳过它就会出现「派了七个 agent，
六个回来说没有 key / 站没上线」这种结果。**

##### 阶段 0.0 · 站点地址从哪来（先取址，再体检）

「review 一下**我这个网站**」里几乎不会带域名。**「他没说是哪个站」不是反问的理由**——
本节这条回退链就是用来把 `<site>` / `<domain>` / `<sitemap>` 挖出来的。
**按顺序走，任何一档拿到一个能 200 的地址就停**，把它填进后面所有命令的 `<site>`。
只有全部落空才允许问那**一个**问题。

**先读 0 档再动手。a–d 四档全部只在「当前工作目录就是该站点的项目根」时才有意义**——
它们 grep 的是这个站自己的 `.rankup/` / `wrangler.toml` / `.env.example` / git 远端。
**如果 cwd 是 Skill 仓库、某个别的项目、或空目录（「新接手一个站、本地没有它的代码」是常态），
a–c 必然全空，而 d 档的 `git remote -v` 会拿当前仓库的名字拼出一个跟目标站毫无关系的候选**——
它长得像结论，其实 100% 是错的。所以：**cwd 不是该站点的项目根时，直接跳过 a–d，从 e 档开始。**

| 档 | 跑什么 | 拿到什么 | 拿不到就下一档 |
|---|---|---|---|
| **0 · 用户这句话里就有** | 不跑任何命令，读一遍用户原话（以及本轮对话里他贴过的链接） | 他已经给了域名 / URL / 「就是 xxx 那个站」 | **有就直接跳到 e 档验证一次，a–d 全部不跑。**用户已经说了是哪个站却还去 grep 项目文件，是纯浪费；更糟的是 d 档会给出一个跟他说的不一样的候选，然后你在两个地址之间纠结 |
| **a · 项目记忆** | `grep -ihoE 'https?://[A-Za-z0-9.-]+[A-Za-z0-9/._-]*' .rankup/PROJECT.md .rankup/infrastructure.md .rankup/INDEX.md 2>/dev/null \| sort \| uniq -c \| sort -rn \| head -20` | 出现次数最多的那个非文档域名就是生产站 | `.rankup/` 不存在（新接手的站是常态）→ b |
| **b · 部署配置** | `grep -inE 'route\|pattern\|custom_domain\|zone_name\|^name *=' wrangler.toml wrangler.jsonc wrangler.json 2>/dev/null \| head -20`<br>再 `grep -iE '"(homepage\|repository)"' package.json 2>/dev/null` | Workers/Pages 的自定义域，或 `package.json` 的 `homepage` | 都没有 → c |
| **c · 环境与站点元数据** | `grep -rihoE 'https?://[A-Za-z0-9.-]+' .env.example .dev.vars.example 2>/dev/null \| sort -u \| head`<br>再 `grep -rihoE '<meta property="og:url" content="[^"]+"' --include='*.html' --include='*.tsx' --include='*.ts' . 2>/dev/null \| head` | `SITE_URL` / `PUBLIC_URL` 之类的变量、`og:url` 的规范地址 | 拿不到 → d。**只读 `.env.example` / `.dev.vars.example` 这类样例文件，不要去读真实 `.env`** |
| **d · git 远端推断** | `git remote -v \| head -2` | 仓库名/组织名 → 猜 `<repo>.pages.dev`、`<repo>.<org>.workers.dev`、`<repo>.com` 等候选 | **这一档只出候选，不出结论**——每个候选都必须走 e 验证过才算数。**cwd 不是该站点的项目根时这一档必须跳过**：它会把当前仓库（很可能是 Skill 仓库本身）的名字拼成候选，看着有模有样，实则与目标站无关 |
| **e · 线上探测（把候选变成事实）** | 对 0–d 得到的每个候选跑：<br>`curl -sIL -A 'Mozilla/5.0' <候选> \| grep -v 'Connection established' \| grep -iE '^(HTTP/\|location:)'`<br>200 的再 `curl -s <候选>/sitemap.xml \| head -5` | 哪个候选真的在线、`<sitemap>` 的真实地址（阶段 0.2 / 0.3 顺手一起做完了） | 全部连不上 → 先走「站还没上线分支」用本地 dev / 预览域跑 A 组，再 f |
| **f · 只剩这一档才问** | 一句话，**同一条消息里 0.1 / 0.4 / 0.5 / 0.6 已经在跑**，不等回答：<br>「站点地址给我一个就行；我先按 `<d 档最像的那个候选>` 探测着。」 | 一个地址 | 用户不回 → 按已探测到的候选跑下去，**不许停在这里等** |

**0–e 全部零配额、零登录、几秒钟**，没有任何理由跳过它们直接问用户。
拿到地址后一行记进 `.rankup/INDEX.md`（哪一档取到的、验证方式是 e 的哪次 curl），
下一轮就直接落在 a 档。

**HTTP 代理会多出一跳假的。** 走 HTTPS 代理时 `curl -sIL` 每个请求会先打印一行
`HTTP/1.1 200 Connection established`，那是代理隧道的应答，不是目标站的响应。
不滤掉它，一个干净的**零跳**首页会被读成「200 → 200 两跳」，进而误判成重定向问题。
本文所有 `curl -sIL … | grep -iE '^(HTTP/|location:)'` 都要先接一段
`| grep -v 'Connection established'`；已经跑过没滤的，按「首行 200 且无 `location:`」重读一遍。

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 0.0 站点地址 | 串行，**第一个动作** | 上面那条回退链 | `<site>` / `<domain>` / `<sitemap>` | 见上表最后一列。**没取到之前不要派任何 sub agent** |
| 0.1 项目记忆 | 串行 | `node <rankup>/scripts/review.mjs --project-root . --json` | 缺失文件、陈旧记录、生命周期检查点待补清单 | **`.rankup/` 不存在时脚本只打印「未找到 `.rankup/`，先运行 `rankup init`」就退出**，不出任何检查点——这不是错误，是新项目的正常返回，走下方「新项目分支」建完最小骨架再回来跑一次 |
| 0.2 站在不在线 | 串行 | `curl -sIL -A 'Mozilla/5.0' <site> \| grep -v 'Connection established' \| grep -iE '^(HTTP/\|location:)'` | 首页状态码 + 跳转链（阶段 3 闸门要的那条） | 连不上 / DNS 没解析 → 走下方「站还没上线分支」。**必须滤掉 `Connection established`**，否则走代理时零跳首页会被读成两跳（见阶段 0.0 末尾） |
| 0.3 有没有 sitemap | 串行 | `curl -s <site>/sitemap.xml \| head -20`；再 `curl -s <site>/robots.txt` | `<sitemap>` 的真实地址；robots 有没有误挡 | 404 → A 组改成「逐个已知页面」模式：`seo-audit.mjs <url1> <url2> …`，并把「缺 sitemap」记成必修项 |
| 0.4 配额档位 | 串行 | `node <rankup>/scripts/seo-webcafe.mjs translateMe` | seo.web.cafe 现在是哪一档、剩多少（只信脚本开头那行 `· 配额 …`，不信文档里的数字）→ **当场把它切成一张预算表**（模板见阶段 1「波次 1b 的预算怎么定」），覆盖 D1 / D4 / E2 / E5 / F5 / F6 全部会扣配额的格 | 打不出档位 = 网络或站点问题，不是「匿名」。重跑一次再判。**不出预算表就不许派波次 1b 的 agent**——它们能并行，所以没人会撞车报错，只会一起把额度花光 |
| 0.5 性能取数路子 | 串行 | `node <rankup>/scripts/pagespeed.mjs plan <首页> --strategy both` | B 组要开的 pagespeed.web.dev 链接 + 读数清单 | **不再需要任何 key**（2026-08-31 起走网页版，零配额）。网页版跑分只在 Chrome 标签页真的可见时才渲染得完（实测后台标签页一直停在「Running analysis」，伪造 visibilityState 无效）。`collect` 默认前台驱动（open 带 `--window foreground` + 后台 activate 循环），2026-09-12 实测无人值守可以直接跑，B 组照跑；仍卡 `tab-hidden` 才标 ⏸ 并写「需要用户本人打开这几个链接读数，或加 `--no-foreground` 人工看着跑」，**不要把跑不出来记成「性能没问题」** |
| 0.6 登录态 | 串行 | `opencli doctor` | A6 与 D/E/F 组里走浏览器的那几条能不能用 | 红 → 这几条标 ⏸ 并写清卡在哪；其余组照跑，**不要因此取消整场体检** |

#### 阶段 1 · 七组诊断（**先按配额分波次，再派 sub agent**）

派发纪律见 SKILL.md「主线只调度，sub agent 做事」：每个 prompt 自包含（站点 URL、
项目根绝对路径、要跑哪几条命令、产物写进哪个文件、判读对照哪一节）。

##### 派活之前先按配额分组

**A–G 七组不是七个可以齐发的 agent。**

[`INDEX.md` 铁律三](INDEX.md#三条贯穿所有-playbook-的铁律)：**一个配额工具同一时刻只许有一个采集器。**
下面七组按功能划分，但 A4 / D2 / D6 / F1 / F2 五个步骤落在**同三个面板会话**上。
**照着「七组并行」字面理解一次性齐发，这三个会话会互相抢窗口——而且不报错，
三个 agent 各自拿到一份残缺或空的数据。**这正是 SKILL.md 列的高频错误。

**还有第二种共享，没有会话锁所以更隐蔽**：seo.web.cafe 的**每日配额池**。
D1 / D4 的 `mineSearch`、E2 / E5、F5 的 `translateSearch`、F6 的 `worth` 全从同一个池子扣。
它允许并发（不会互相抢窗口、不会拿到残缺数据），**但会一起把当天的额度花光**。
所以按功能分组派 agent 时，这几格必须单独拎出来、带着一个写死的次数上限走。

所以真正的派发形状是**三条泳道**：**真零配额组无脑并行 + 共享配额池组带预算并行 + 一条面板队列串行**。
下表 🔢 = 这一格会扣 seo.web.cafe 每日配额：

| 波次 | 派几个 agent | 装哪些步骤 | 能不能并行 |
|---|---|---|---|
| **波次 1a · 真零配额区** | **6 个，一条消息里齐发** | ① A 组 A1–A3<br>② B 组 B1<br>③ C 组 C1–C4<br>④ D 组 D3 / D7<br>⑤ G 组 G1–G5<br>⑥ F 组 F3 / F4 | **无脑并行。** 这些步骤既不碰 `semrush-nav` / `similarweb-nav` / `ahrefs-nav` 任何一个会话，**也不扣 seo.web.cafe 的任何配额** |
| **波次 1b · 共享 seo.web.cafe 配额池** | **1 个**（也可以拆多个，但见右栏） | ① D4 的 `mineSearch` 🔢（`mineSeed` / `mineKd` 不扣，`mineKd` 只在该词已 `mineSearch` 过时免费）<br>② F5 的 `translateSearch` 🔢（同格里的 `gt.py region` 不扣）<br>③ F6 的 `worth` 🔢 | **可以与 1a 并行，也可以彼此并行**——它不是会话锁，不会互相抢窗口。**但三格从同一个每日池子里扣**，所以**总次数必须在阶段 0.4 的预算表里定死再开跑**，每个 agent 的 prompt 里写明「你这一格最多花 N 次」。派并行 agent 而不给上限 = 三个 agent 各自去扣同一个池子且谁都不知道总预算，这正是「省配额」末尾那条事故 |
| **波次 1c · AITDK 独立会话** | **1 个** | A6（按抽样 URL 逐个串行跑） | 用独立 opencli session（默认 `aitdk`），不碰 `semrush-nav`/`similarweb-nav`/`ahrefs-nav`，**可以与 1a/1b/2 同时开跑**；组内按 URL 逐个来，不要为抢时间同时开两个 `aitdk` session 抢面板 |
| **波次 2 · 面板队列** | **1 个**（见下方合并顺序） | A4 · D2 · D6 · F1 · F2 | **必须串行**，与波次 1 同时开跑没问题（不同工具），但**它内部一条队列走到底** |
| **波次 3 · 依赖前两波产出** | 主线自己做 | D1（要 A1/A2 的 title/h1 反推词表）· D5（要 D1–D4 的数）· E1–E5（E4 要 A/B/D 的读数） | 串行。**E 组一轮只问一次**，喂料没齐就不要开口 |

**波次 2 的合并执行顺序（照抄，不要自己重排）**——一个 agent、一条消息、顺序执行：

```
1. A4  ahrefs-site-audit.mjs projects → report <id> links/redirects/html-tags/indexability/localization   # ahrefs-nav
2. D2  semrush-keyword.mjs --bulk --db <cc> --kw "词1,词2,…"          # semrush-nav  ← 先 bulk 初筛
3. D6  semrush-report.mjs（3–5 个竞品各前 100 排名词）      # semrush-nav  ← 同一会话顺手跑完
4. F2  semrush-overview.mjs --domain <竞品> --db <cc>       # semrush-nav  ← Semrush 三步一次装完再离开
5. F1  similarweb-query.mjs --domain <竞品> --report performance / channels / similar-sites   # similarweb-nav
```

**为什么是这个顺序**：Semrush 的三步（D2 / D6 / F2）挤在一起跑完再切 Similarweb，
省掉两次面板导航；A4 排最前是因为它可能直接标 ⏸（站没在 Ahrefs 验证过所有权），
早一步知道就早一步把时间还给后面。

**默认一个 agent 串完三家**，与本文「省配额」一节一致。铁律三只禁止**同一个工具**有两个采集器，
所以最多可以拆成三个 agent（`ahrefs-nav` / `semrush-nav` / `similarweb-nav` 各一）并行；
但**同一个工具内部绝不许并发**，也**不许给任何一条传 `--session`**——会话名就是并发度。

**波次 1b 的预算怎么定**：阶段 0.4 `translateMe` 打出的档位与剩余次数（数字以那一行为准）
是**整场体检的总额**，在派活之前就把它切成一张表写进 `.rankup/`，并原样抄进每个 agent 的 prompt：

| 花在哪 | 匿名档 10/日 | 登录档 100/日 | 定死的规则 |
|---|---|---|---|
| D1 逐词 `kd` | 3 | 15 | 词表里最重要的 N 个，多的留到下一轮 |
| D4 `mineSearch` 🔢 | 2 | 10 | **先 mineSearch 再 mineKd**，顺序反了会多花 |
| E5 `audit` 🔢 | 2（首页 + 一个内容页） | 6 | 代表性页面，不是逐页 |
| F5 `translateSearch` 🔢 | 1 | 3 | 只查核心词；`translatePage` / `translateAggregate` 不扣，能省则省 |
| F6 `worth` 🔢 | 1 | 3 | 只当参照，一个竞品一次 |
| E2 `chat` | 1 | 1 | 一轮体检只问一次（E4） |

数字是起点不是定律，按本轮重点调；**唯一不许动的是「开跑前定死、跑起来不加」**。
判断某条命令扣不扣配额的机器判据：`node <rankup>/scripts/seo-webcafe.mjs --help` 里
**描述带「不计配额」的才是免费的，没写的一律按计配额处理**（`worth` / `backlink` / `adsense` / `history` 就没写）。

**A 组 · 技术与内容 SEO**

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| A1 全站 TDK/密度 | 串行（组内） | `mkdir -p .rankup/evidence && node <rankup>/scripts/seo-audit.mjs --sitemap <sitemap> --json > .rankup/evidence/seo-audit-<date>.json`（脚本**没有 `--out`**，只有 `--json` 打到 stdout，用重定向落盘；**`mkdir -p` 不能省**，见下方落点纪律） | **顶层是一个数组，每个元素是一整页**，10 个字段：`url` / `overview` / `issues` / `density` / `headings` / `images` / `links` / `social` / `hreflangs` / `structured`（抓取失败的元素只有 `url` + `fetchError` + 空 `issues`） | 有 `fetchError` 的页 → **抓取失败 ≠ 页面没问题**，换网络或去掉 UA 限制重跑那几条 URL，重跑不通就逐条记进 audit.md 待查 |
| A2 密度单看 | 串行 | `node <rankup>/scripts/seo-audit.mjs --sitemap <sitemap> --density-only` | 1/2/3-gram 密度 | 密度没有「正确值」，只对照「这页声明的短语」是不是同一个字符串 |
| A3 重定向 | 并行 | 对裸域/www/http/https 四种入口各跑 `curl -sIL -A 'Mozilla/5.0' <入口> \| grep -v 'Connection established' \| grep -iE '^(HTTP/\|location:)'` | 每个入口几跳、每跳是 301 还是 302（滤掉代理那行之后，**剩下几行 `HTTP/` 就是几跳**） | 302/307 出现即记必修（判据 [`../experiences/webcafe-topics.md`](../experiences/webcafe-topics.md) 五）。**忘了 `grep -v 'Connection established'` 会凭空多算一跳**：`HTTP/1.1 200 Connection established` 是 HTTPS 代理隧道的应答，不是目标站的响应，一个零跳首页会被读成 200→200 两跳并误记必修 |
| A4 全站第二双眼睛 | **波次 2 队列第 1 步**（`ahrefs-nav`） | `node <rankup>/scripts/ahrefs-site-audit.mjs projects` → `node <rankup>/scripts/ahrefs-site-audit.mjs report <id> links`、`… redirects`、`… html-tags`、`… indexability`、`… localization` | 全站内链失效、全站重定向链、TDK、可索引性、hreflang | 站没在 Ahrefs 里验证过所有权 → 这一条标 ⏸（免费 AWT 档只能看自己的站），A1–A3 已经能过闸门 2。会话名固定 `ahrefs-nav`，**不要传 `--session`** |
| A5 占位专项（硬性红线） | 串行，与 A1 同批产出 | 输入：sitemap URL 列表 + 源码目录。检测：A1 的 `seo-audit.mjs --json` 已内置 `PLACEHOLDER_*` 系列 issue code（正则见 [`../discipline.md`](../discipline.md) 十四），逐页读 `issues` 过滤出 `PLACEHOLDER_` 前缀即可；源码目录另跑一遍同一批正则 `grep -rn`（排除依赖与构建产物） | 输出：逐 URL 命中清单（URL、code、命中次数），零命中才算过；命中的立即处置（换真实内容或删区块），不进「待办」 | `.rankup/audit.md`「占位专项」一节，逐 URL 记录 |
| A6 AITDK 全站报告（第三双眼睛） | 串行（组内，逐 URL 跑），用独立 opencli session，不占 `semrush-nav`/`similarweb-nav`/`ahrefs-nav`，可与波次 1a/1b/2 同时开跑 | 按 sitemap 抽样（首页 + 每类模板页各至少一个 + 全部法律/关于/联系页）逐个跑 `bash <rankup>/scripts/aitdk-opencli.sh <url>`，前置条件见 [`../seo-box.md`](../seo-box.md)「AITDK 面板全自动取数」 | 每个 URL 一份 `aitdkPanel` 报告：Issues 标签页问题清单 + 带评分标签页的未满分清单 | 前置条件不满足（未登录/opencli 非仓库构建）→ 标 ⏸ 并写清卡在哪，不要因此跳过；Issues 有任何一条、或任一带评分标签页不满分，**都进本轮必修清单**，判据 [`../checklists.md`](../checklists.md) 段 4「闸门 4c」 |

**A1 的 JSON 长什么样（不看这段必然读错）**

`--json` 输出的顶层是**一个数组**，一个元素 = 一页。`jq keys` 对数组回的是 `[0,1,2,…]`
数字索引，**别据此以为它是「以数字为键的对象」**；遍历用 `jq '.[]'`（Node 侧 `arr.forEach` 或
`Object.values()` 都行）。「产出」那张表要的四类事实分别在这几个字段里，
**`issues` 只是其中之一，它的元素形状是 `{code, observed}`，撑不起 TDK / 密度 / 结构化 / hreflang**：

| 想要的事实 | 读哪个字段 | 形状 |
|---|---|---|
| TDK、canonical、lang、robots、viewport、charset | `overview` | 对象；`title` / `description` 是 `{text, length}`，缺失时为空 |
| 关键词密度 | `density` | `{totalWords, unigrams[], bigrams[], trigrams[]}`，每项 `{word\|phrase, count, density}` |
| 结构化数据 | `structured` | **数组**；每项 `{type, summary}` |
| hreflang | `hreflangs` | 数组，每项 `{lang, href}` |
| 逐条观察记录（不分级，分级见 `../seo-box.md`） | `issues` | 数组，每项 `{code, observed}` |
| 标题层级 / 图片 alt / 内外链 / OG 与 Twitter 卡 | `headings` / `images` / `links` / `social` | 见脚本 `--help` |

**`structured` 里的键叫 `type`，不是 `@type`。** 脚本已经把原始 JSON-LD 的 `@type` 抽出来
重命名成 `type`（`@graph` 会记成 `"Graph"`，解析失败记成 `"PARSE_ERROR"`）。
按 `@type` 去取必然全是 `undefined`，于是**一个结构化数据齐全的站会被判成「全站没有结构化数据」**——
这是实跑真发生过的误判。写结论前先 `jq '[.[] | {url, st: [.structured[].type]}]'` 抽一遍看看有没有值；
只要 `structured` 数组非空，就不能写「没有结构化数据」。

**落点纪律（两种写法的区别要记住）**：脚本自己写文件的（`is-agentic.mjs --save --project .`、
`gt-browser.mjs` 的证据目录、各 `*-setup.mjs`）都用 `mkdirSync(..., {recursive:true})` **自建目录**，
父目录不存在也没关系；而 **shell 重定向 `> 某目录/文件` 不会自建目录**，父目录不在就直接
`No such file or directory` + 退出码 1。所以本文凡是 `> .rankup/evidence/…` 的命令都写成
`mkdir -p .rankup/evidence && node … > …`；`--out .rankup/<文件>` 一类同理，先确认 `.rankup/` 已建
（新项目分支的最小骨架已经包含 `.rankup/evidence/`）。

**B 组 · 速度**

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| B1 出清单 | 串行 | `node <rankup>/scripts/pagespeed.mjs plan <首页> <一个工具/功能页> <一个内容页> --strategy both` | 六个 pagespeed.web.dev 链接（三类页面 × 两端）+ 逐项读数清单 + `baseline.md` 的表格列 | 零依赖、零配额，不会失败 |
| B2 取数 | 串行 | 两条路，按阶段 0.5 的判断选：<br>**脚本采**（默认）——`node <rankup>/scripts/pagespeed.mjs collect <同样三个 URL> --strategy both --budget 300`，前台驱动 + activate 循环无人值守跑通，双证人（截图 + 页面文本）落 `.rankup/evidence/pagespeed-<ts>/`，判读仍由 AI 做；<br>**人跑**（兜底）——仍卡 `tab-hidden` 时按 B1 的链接逐个在浏览器里打开，页面自己跑完再读，或给 `collect` 加 `--no-foreground` | 每页：现场 CWV + LCP/INP/CLS + **样本量档位** + **作用域（本 URL 还是整个源）**；实验室四项分数 + 指标区 + 跑分环境 | `collect` 报 `tab-hidden` = **标签页没在前台，不是这个站没有数据**——先查 Chrome 是不是被别的 App 抢了前台，再重跑，或退回人跑。报 `budget-exhausted` = 慢站还没跑完（实测有站跑满 240 秒仍在跑），加大 `--budget`，**超时同样不等于没有数据**。页面上**现场那一整块不存在 = CrUX 流量不足**，原样抄「现场无数据（流量不足）」进 `baseline.md`——不是 0、不等于通过，留空会在下一轮被读成「查过了没问题」 |
| B3 逐条必修 | 串行 | 读 B2 页面里的 Opportunities / Diagnostics 两个区块，**先看「第三方分解 / 网络依赖树」再看「渲染阻塞资源」**——字节量问题（尤其是 Web 字体总字节）在本地 Lighthouse 下常不显形，只认 PSI 网页版读数 | 一份逐条清单：每条要么修掉重跑证明消失，要么写明改不动的原因（第三方脚本、平台限制等），登记进 `checks.md` 标 ⏸ | **B 组输出的 opportunity/diagnostic 清单全部进必修列表，与 A6 同等**——分数够了不等于清单可以不看 |

**C 组 · GEO / AI 就绪度**

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| C1 单站分数 | 串行 | `node <rankup>/scripts/is-agentic.mjs scan <domain> --save --project .` | 分数 + 逐项 pass/partial/failed，快照进 `.rankup/agentic/`。**注意它返回的是缓存报告，不是一次即时重扫**：上游同域名会直接回上一份结果，报告里的 `scanned_at`（终端第二行「扫描时间」、`--save` 落盘的文件名日期）可能是几天前的 | 原始响应无条件落 `agentic/<domain>/raw/`；429 与「这个站真的没数据」只能靠原始件区分，先看它再下结论。**结论落笔前先把报告里的扫描时间和今天比一遍**——不是今天的，站上任何改动都不在里面。**每一条 failed / partial 都要用一次 `curl -s <site>/<路径> \| grep …` 复核过才允许写进必修项**（实跑里「找不到 agent 指引 / when-to-use」就是这样的误报：报告是几天前的，当天 curl 一验，章节和 `/agents.md` 都在）。这与判读表 A 组那条「Ahrefs 与自家脚本不一致时先看抓取日期」是同一个陷阱，C 组同样适用 |
| C2 配分母 | 串行 | `node <rankup>/scripts/cf-agent-baseline.mjs --compare .rankup/agentic/<domain>/<date>.json` | 本站失败项 vs 全网通过率并排 | 需要 Cloudflare 凭据（`--token` / `CLOUDFLARE_API_TOKEN` / Skill 的 `.env` / wrangler 配置）。**两种格式都收**：37 位 Global API Key（还要 `CLOUDFLARE_EMAIL` 或 `--email`）或带 `Radar:Read` 的 API Token——脚本按长度自动判别，报错会分开说「缺邮箱 / 格式不符 / 权限不足」。没有凭据就只报单站分数，**不要把「拿不到基线」写成「本站正常」** |
| C3 内容侧怎么改 | 并行 | 读 [`../seo-growth.md`](../seo-growth.md) 三-B「2026 AI 搜索范式」；再加载 `ai-seo` Skill 读它的 `references/content-patterns.md` 与 `okf.md` | 「被引用」这件事的内容形态判据、llms.txt / OKF 的现状裁决 | `ai-seo` 未装时按 [`../integrations.md`](../integrations.md) 用 find-skills 装；装不上就只用 `seo-growth.md`，**结论不打折但记一句缺了外部对照** |
| C4 结构化数据模板 | 并行 | 加载 `seo-geo` Skill，只读 `references/schema-templates.md` 与 `references/platform-algorithms.md` | JSON-LD 模板与各 AI 平台取源差异 | **不要跑 `seo-geo/scripts/*.py`**：它们走 DataForSEO，要 `DATAFORSEO_LOGIN`/`DATAFORSEO_PASSWORD` 付费凭据，且与 D 组的取数口径重复（会制造第三个对不上的数字）。裁决理由同 [`../seo-box.md`](../seo-box.md) 对 Ahrefs KD Checker 的判死 |

**D 组 · 关键词、长尾与 SERP**

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| D1 现有词表体检 | 串行 | 读 `.rankup/keywords.md`，对每个「做」的词跑 `node <rankup>/scripts/seo-webcafe.mjs kd --keyword "<词>" --gl <cc>` | KD + top9 盘面，逐词补齐六项证据 | `keywords.md` 不存在 → 从 A1 的 title/h1 与 A2 的高频 bigram 反推出站点**实际在打的词**，那就是第一版词表 |
| D2 量与全球口径 | **波次 2 队列第 2 步**（`semrush-nav`） | `node backlink/scripts/semrush-keyword.mjs --bulk --db <cc> --kw "词1,词2,…"`；入选词再单查拿 `globalVolume` | 分国家量、KD、CPC + 全球合计 | 同一国家一次最多 100 词；**词只能走 `--kw "a,b"` / `--kw-file <路径>` / `--bulk-plan`，位置参数会直接抛错**（这一步排在面板队列第 2 位，前面 ahrefs 已经跑完，炸在这里很贵）；配额站会话名固定 `semrush-nav`，**不要传 `--session`** |
| D3 趋势 | 并行 | `python3 <rankup>/scripts/gt.py compare "<词1>" "<词2>" --geo <cc> --time 12m`；方向不明时 `gt.py related "<词>"` | 曲线是涨是跌、相关飙升词（长尾种子的第一来源） | 空曲线**不等于**冷门；脚本会把「没取到」和「没需求」如实标成不可分辨，去 `.rankup/evidence/gt-browser-<ts>/` 看证据 |
| D4 长尾扩展 | 并行 | `node <rankup>/scripts/seo-webcafe.mjs mineSeed --input "<种子>"`（字段是 `--input`，词和网址都吃）→ `mineSearch --keyword "<词>"` → `mineKd --keyword "<词>"`；再 `node <rankup>/scripts/demand/word-roots.mjs` 与 `demand/serp-query.mjs` 补词根与 SERP | 长尾候选池 + 每个词的难度 | `mineSearch` 命中缓存不重复扣配额；`mineKd` 对已搜过的词免费——**先 mineSearch 再 mineKd，顺序反了会多花配额** |
| D5 长尾怎么分组、怎么排 | 串行（拿到词之后） | 加载 `keyword-research` Skill，按它的 8 个 phase 走 Classify（意图四分类）→ Score（`Opportunity = Volume × Intent Value / Difficulty`）→ GEO-Check → Cluster（pillar + cluster） | 意图标签、优先级排序、主题簇、内容日历 | 这个 Skill **自己不带数据源**（它的 Data Sources 一节写明「没有工具就问用户要种子词」）。**数据全部由 D1–D4 供给它**，不要让它去问用户；缺了这一步，rankup 只有一堆孤词，没有簇 |
| D6 竞品词库差集 | **波次 2 队列第 3 步**（`semrush-nav`） | `node backlink/scripts/semrush-report.mjs`（取 3–5 个同赛道竞品各前 100 排名词）→ 与自己的词池做差集 → 差集里的词回 D1 补测 | 自己一定漏掉的那一半词 | 判据 [`../demand-sources.md`](../demand-sources.md) 九·六：**被自己判过「太难」的头词也要测** |
| D7 首页实勘 | 串行 | 目标词在 Google + Bing（做非英语市场再加本地引擎）各搜一遍，无痕窗口、显式指定地区与语言，每个引擎记七样 | 版式、SERP 特性占屏、AI 答案引用了谁、有没有独立站空位 | 二手 SERP 接口（`serp-query.mjs` / `seo-webcafe.mjs serp`）看不到版式与 AI 答案，**不能代替这一步**；公开结果不需要登录态，这是少数可用沙箱浏览器的场景 |

**E 组 · 哥飞 AI 二次意见**（用户点名要的那一条）

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| E1 选路径 | 串行 | 有 `SEO_WEBCAFE_COOKIE` → 走 E2；只有已登录浏览器 → 走 E3。判据见 [`../seo-webcafe.md`](../seo-webcafe.md)「两条取答路径怎么选」 | 一条确定的路径 | 两条都没有 → 整组标 ⏸，写清「需要用户在浏览器登录一次 seo.web.cafe」。**不要用通用 `chatbot-drive.browser.js`**，那会重踩已解决的坑 |
| E2 HTTP 路径 | 串行 | `node <rankup>/scripts/seo-webcafe.mjs chat --ask "<喂料>"` | SSE 流 + `done` 事件的 `toolCalls` / `rounds` / `charged` | 匿名 401 不是脚本坏了 |
| E3 浏览器路径 | 串行 | `node <rankup>/scripts/gefei-ask.mjs --session <描述性名> --slice <本轮名> --ask "<喂料>"` | 同上，全程不碰凭据 | 重抓要换 `--slice` 名（同名文件不覆盖）；超时会把截图+页面文本落 `.rankup/evidence/gefei-ask-<ts>/` |
| E4 喂什么料 | —— | **把 A/B/D 的实际读数拼进问题**，不要只丢一个域名：站点 URL + A1 里几条代表性 URL 的真实 title/description + D1 的目标词清单 + D7 的 SERP 盘面观察 + B1 的现场读数。问三件事：选词有没有问题、TDK 有没有问题、SERP 盘面里我们的位置合不合理 | 一份外部二次意见 | 只丢域名会拿到一份泛泛的通用建议——那正是这一组唯一的失败形态 |
| E5 单页体检对照 | 并行 | `node <rankup>/scripts/seo-webcafe.mjs audit --url <代表性页面> --keyword "<该页目标词>"`（两个参数都必填） | 40+ 项的第三方页面体检，与 A1 互为对照 | 计配额，按阶段 0.4 的档位决定查几页；匿名档只查首页 + 一个内容页 |

**F 组 · 市场规模与潜在市场**（回答「未来市场规模多大」）

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| F1 同类站真实流量 | **波次 2 队列第 5 步**（`similarweb-nav`） | `node backlink/scripts/similarweb-query.mjs --domain <竞品域名> --report performance`，再 `--report channels`、`--report similar-sites` | 总访问量、渠道构成、同类站名单（名单本身就是下一轮的调研对象） | 会话名固定 `similarweb-nav`；读数不稳时脚本直接抛错而不是给最后一次读数——**重跑，不要接受 `stable === false`** |
| F2 自然流量口径 | **波次 2 队列第 4 步**（`semrush-nav`） | `node backlink/scripts/semrush-overview.mjs --domain <竞品域名> --db <cc>` | AS、自然流量（**某一个国家库**，`db: null` 意为不知道是哪个库，不是全球合计）、引荐域数 | 与 F1 差几倍是正常的：一个是模型、一个是面板外推。按 SKILL.md「地理范围 / 面板页面 / 口径定义」三步对齐后**仍差几倍才是真矛盾** |
| F3 折成钱 | 串行 | `node <rankup>/scripts/seo-webcafe.mjs money --income <目标月收入> --kws <词数> --rankpos 3 --rpm <行业 RPM>` | 需要多少 UV、多少日搜索量、多少外链投入、ROI | 纯本地计算，零网络零配额，可放开跑多组参数做区间 |
| F4 钱的信号 | 并行 | `node <rankup>/scripts/demand/stripe-referring.mjs`、`demand/payment-referrers.mjs`、`demand/site-network.mjs`、`demand/aitdk-lookup.mjs` | 谁在这个赛道真收到钱、同一批人还做了哪些站、域名画像 | 空结果**先核 manifest 的 sources 状态**：429 / CAPTCHA / 超时都会产出 0 条，采集失败 ≠ 没市场 |
| F5 邻接市场 | 并行 | `python3 <rankup>/scripts/gt.py region "<核心词>" --top 20`；`node <rankup>/scripts/seo-webcafe.mjs translateSearch --query "<核心词>"` | 哪些国家在搜、同一需求在别的语言里怎么表达 | `translateSearch` 计 1 次配额；`translatePage` / `translateAggregate` 不计，能省则省 |
| F6 估值对照 | 并行 | `node <rankup>/scripts/seo-webcafe.mjs worth --input <竞品域名>`（`worth` / `backlink` / `adsense` / `history` 的字段是 `--input`，不是 `--domain`） | 第三方给的网站估值，作为 F3 折算的旁证 | **计配额**（`--help` 里 `worth` 没标「不计配额」），属波次 1b，次数照阶段 0.4 的预算表。只当参照，不当结论 |

**G 组 · 接入清单与项目记忆**（原来的 `rankup review` 九步，现在降级为其中一组）

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| G1 接入线上实测 | 串行 | 一趟 `curl -s <site> -o body.html`，然后逐项 grep：`cloudflareinsights` / `gtag\|googletagmanager` / `clarity.ms` / `analytics.ahrefs.com` / `yandex-verification` / `naver-site-verification` / `application/ld+json` / `og:` / `hreflang`；再 `curl -sI <site>/<indexnow-key>.txt`、各图标与 `manifest.json` 路径 | 接入清单每一行的线上事实 | 清单里的 ✅ 一律不采信：代码改了、键换了、部署覆盖了都不会有任何东西变红。**「验证 meta 数量为 0」不等于「没验证」**：GSC 与 Bing 都是「HTML meta / DNS TXT 记录 / 上传 HTML 文件」三选一，更常用的是后两种，首页 HTML 里当然 grep 不到 `google-site-verification` / `msvalidate.01`。grep 到 0 只能记 **⬜ 待 G2 确认**，**不许记 ❌ 未验证**；这两行的最终裁决一律以 G2 的 `webmaster-sitemap.mjs gsc status` / `… bing status` 为准。同理，DNS 侧还能自己补一刀：`dig +short TXT <domain>` |
| G2 后台类接入 | 并行 | `node <rankup>/scripts/webmaster-sitemap.mjs gsc status`、`… bing status`、`node <rankup>/scripts/cf-analytics-setup.mjs status <domain>` | GSC/Bing 验证与 sitemap 状态、CF Analytics beacon | 拿不到 GSC → 走下方「拿不到 GSC 分支」 |
| G3 会话挖掘 | 串行 | `node <rankup>/scripts/sessions.mjs --project-root . --days 14 --new-only` → `--dump` → 消化完才 `--mark` | 还留在对话里、从没进过 `.rankup/` 的结论 | `--mark` 必须等信号真的提取完；中途失败或输出被截断就**不要落水位线**，宁可重读不可漏读 |
| G4 三方对账 | 串行 | `git log --oneline -25`、真实路由/页面清单、线上 `sitemap.xml` 全量 `<loc>`，三者与 `.rankup/plan.md` 比对 | 记忆与代码的差 | 勾选框是滞后指标；读到「未开始」先去代码里验证再回写 |
| G5 登记表 | 并行 | `node <rankup>/scripts/registry.mjs scan --roots <存放项目的目录>` | 跨项目可复用脚本名单 | 没配 roots 时读 `RANKUP_PROJECT_ROOTS` 或 `~/.rankup/config.json` |

#### 阶段 2 · 汇总、判读、回写（串行，主线做）

| 阶段 | 跑什么 | 拿到什么 |
|---|---|---|
| 2.1 | 收齐七组结果，按下方「判读」逐组下判断 | 每条观察项的判决：必修 / 可选 / 判死（附理由） |
| 2.2 | 逐项回写 `.rankup/`（落点见「产出」那张表） | 项目记忆与线上事实一致 |
| 2.3 | 对照 [`../checklists.md`](../checklists.md) 把本轮过掉的闸门记进 `.rankup/checks.md`，带证据与日期 | 闸门状态 |
| 2.4 | 剥离站点信息后仍成立的规则回流本 Skill，跑 `node <rankup>/scripts/validate-rankup.mjs` | 经验回流且没带项目信息 |
| 2.5 | 输出一页结论 | 修了什么、判死了什么、卡在哪、下一轮唯一改进 |

#### 四个必须处理的分支（新项目里跑 review 是常态，不是例外）

| 分支 | 判据 | 怎么走 |
|---|---|---|
| **`.rankup/` 还不存在** | 阶段 0.1 报全部文件缺失 | **不要先停下来做完整 `rankup init`**。先建最小骨架——一条命令：`mkdir -p .rankup/evidence && touch .rankup/INDEX.md .rankup/PROJECT.md .rankup/checks.md`。**`evidence/` 目录不能漏**：A1 的第一条采集命令就是 `> .rankup/evidence/…` 重定向，而重定向不自建目录，漏了它开局第一条命令就 exit 1（落点纪律见 A 组「A1 的 JSON 长什么样」末尾那段）。骨架建完照常跑阶段 1；体检结果本身就是 `audit.md` / `baseline.md` / `keywords.md` / `integrations.md` 的第一版内容，阶段 2 一次性写进去。**体检是 init 的输入，不是它的后续。** 结构见 [`../project-memory.md`](../project-memory.md) |
| **站还没上线** | 阶段 0.2 连不上，或只有本地 dev / 预览域 | A 组照跑，把 `<site>` 换成 `http://localhost:<port>` 或预览域（`seo-audit.mjs` 是纯 HTTP fetch，对 dev server 一样跑）；A3/A4、B 组、C1/C2、G1/G2 标 ⏸ 并写明「上线后必跑」；**D/E/F 组完全不受影响**——选词、长尾、SERP、市场规模本来就该在上线前做完 |
| **用户没说是哪个站** | 他说「我这个网站」「帮我看看这站」，句子里没有域名 | **最常见的开局，不是异常。**走 [阶段 0.0](#阶段-00--站点地址从哪来先取址再体检) 那条回退链取址；0–e 全部零配额几秒钟，**跑完它们之前不许反问**。反问是第 f 档，且要和阶段 0 其余步骤同一条消息发出、不等回答。**cwd 不是该站点的项目根时（例如你在 Skill 仓库里跑），a–d 直接跳过，从 e 档开始**——否则 `git remote -v` 会给出一个跟目标站无关的候选 |
| **拿不到 GSC** | 没验证所有权，或后台打不开 | 不阻塞。索引侧改用 `node <rankup>/scripts/indexnow-submit.mjs`（零账号、纯 HTTP，本来就排在站长工具前面）+ `webmaster-sitemap.mjs bing status`；曝光/点击这一路的数字标 ⏸，在收尾里写清「需要用户完成 GSC 验证」并**说明你已经自动化到了哪一步** |

### 4. 判读：每组对照哪个文档的哪一节

**脚本只出事实，判决全部在这一层。** 这张表是本 playbook 与「跑一堆命令」的唯一区别。

| 组 | 判读依据 | 最容易判错的地方 |
|---|---|---|
| A · 技术与内容 SEO | [`../seo-box.md`](../seo-box.md)「seo-audit 判读指引」的分级表；闸门判据 [`../checklists.md`](../checklists.md) 段 4 闸门 1/2/3，A6 的判据是段 4 闸门 4c | `fetchError` 当成通过；Ahrefs 与自家脚本不一致时忘了看 Ahrefs 那次抓取的**日期**（日期对不上就不是矛盾）；A6 的 Issues/评分**没有满分/零问题就是必修**，不因为 A1–A5 已经全绿就跳过 |
| B · 速度 | [`../seo-box.md`](../seo-box.md) 一；闸门 6 判据在 [`../checklists.md`](../checklists.md) 段 4「闸门 6」 | 「现场：无数据」被读成 0 或通过；性能分够 90、CWV 达标就不看 opportunity/diagnostic 清单——这两项逐条必修，和 A6 的 Issues 清单同等，不能因为分数已过线就跳过 |
| C · GEO / AI | [`../seo-growth.md`](../seo-growth.md) 三-B（2026 AI 搜索范式 + AI Agent 就绪度）；内容形态补 `ai-seo` Skill | 把 AEO/GEO 当成另一套技术——Google 的定论是它就是 SEO；`llms.txt` 已被 Google 明确否定为排名信号（见 `seo-growth.md`），别拿它充数；**把缓存报告当即时结果**——`is-agentic scan` 回的是上游缓存，failed 项没用当天的 curl 复核就写成必修项，会凭空造出一条不存在的活 |
| D · 关键词与长尾 | [`../experiences/webcafe-topics.md`](../experiences/webcafe-topics.md) 一 ~ 二（低 KD ≠ 能做、词龄判据）+ [`../demand-sources.md`](../demand-sources.md) 九·六与十·五；分组与优先级用 `keyword-research` 的框架 | 拿低 KD 直接立项，漏掉「排上去值不值」那第四道闸；只扩词不聚簇，产出一堆孤词 |
| E · 哥飞二次意见 | [`../seo-webcafe.md`](../seo-webcafe.md)；采纳纪律见 [`../checklists.md`](../checklists.md) 闸门 5 | 把 AI 的建议整段照单全收——**每条都要有采纳或拒绝记录，拒绝附理由** |
| F · 市场规模 | [`../demand-sources.md`](../demand-sources.md) 十·五（能排上去 ≠ 能赚钱）与 ②·六·四（模型流量什么时候高估 4–13 倍）；SKILL.md「地理范围 / 面板页面 / 口径定义」三步 | 把 Semrush 的自然流量和 Similarweb 的总访问量相减或相除；把采集失败读成「这个市场没人」 |
| G · 接入与记忆 | SKILL.md「接入清单跟踪」的平台表 | 采信清单里已有的 ✅ 而没做线上实测 |

**要不要加载某个兄弟 Skill**（`ai-seo` / `seo-geo` / `keyword-research` / `deep-research` …），
判据统一看 [`../skill-ecosystem.md`](../skill-ecosystem.md)——**加载有成本，默认答案是不加载**，
本 playbook 的 C3 / C4 / D5 三处是已经判过「值得接」的那几条。

### 5. 省配额

| 档位 | 有哪些 | 纪律 |
|---|---|---|
| **零配额、零登录，放开跑** | `seo-audit.mjs`（纯 HTTP）、`pagespeed.mjs`（网页版，零 key 零配额；但 `collect` 要标签页可见）、`curl`、`is-agentic.mjs`、`indexnow-submit.mjs`、`seo-webcafe.mjs` 的四个本地命令 `kgr` / `string` / `money` / `email`、`seo-webcafe.mjs endpoints` / `tools` / `translateMe` / `translateAggregate` / `translatePage` / `minePage` / `mineSeed` / `mineReport` / `referring*` | 不需要省，也不要因为「怕花配额」而少跑 |
| **有配额，先看档位再规划规模** | `seo-webcafe.mjs` 的 `kd` / `serp` / `audit` / `mineSearch` / `mineDomain` / `translateSearch` / `translateDomain` / `chat` / `worth` / `backlink` / `adsense` / `history`。**判据不靠背这张表**：`--help` 里描述**没写「不计配额」的一律按计配额**（写了「计 1」的更是明说） | 阶段 0.4 已经读过档位并出了预算表；**整场体检的规模在开工时定死**，不要边跑边加词。这些格分布在 D4 / E5 / F5 / F6 里，**按功能分组派 agent 就会把它们拆到几个并行 agent 上，每个都不知道总预算**——所以它们统一归波次 1b，prompt 里必须带次数上限 |
| **配额站，固定会话名，串行** | Semrush（`semrush-nav`）、Similarweb（`similarweb-nav`）、Ahrefs（`ahrefs-nav`） | **不要传 `--session`**，也不要每个 sub agent 一个会话名——会话名就是并发度，同时加载会触发上限。这三家的调用放进**同一个** sub agent 里串行跑，顺序照抄阶段 1「[波次 2 的合并执行顺序](#派活之前先按配额分组)」那五步（A4 → D2 → D6 → F2 → F1）。**A4/D2/D6/F1/F2 分散在四个功能组里，按组派 agent 就会把它们拆到四个并发 agent 上**——那正是这条纪律要拦的事故 |
| **按次计费/需登录** | `gefei-ask.mjs` / `seo-webcafe.mjs chat` | 一轮体检只问一次，把 A/B/D 的读数一次性喂完（E4） |

**配额前置检查是硬规则**：真实事故里整场调研按「匿名 10 次/日」规划，实际账号是 500/日、
当天只用了 66 次——少测了 4 个词，报告里写成「配额耗尽，无法验证」。阶段 0.4 不许跳过。

### 6. 收尾：结论写回哪里

| 内容 | 写进 | 补充 |
|---|---|---|
| 逐 URL 技术事实、外部审阅结论、AI 就绪度核实结论 | `.rankup/audit.md` | 逐 URL，不是一条总述 |
| 性能双读数 | `.rankup/baseline.md` | 现场无数据原样保留那句话 |
| 词表、长尾簇、SERP 快照（带日期） | `.rankup/keywords.md` | SERP 快照 30 天过期 |
| 市场规模区间、潜在市场、放弃条件 | `.rankup/decisions.md` + `.rankup/roadmap.md` | 面板与模型并排，倍差有归因 |
| 接入清单逐行状态 | `.rankup/integrations.md` | ✅ 带证据+日期 / ⬜ / ❌ 带裁决依据 |
| 本轮过掉的闸门 | `.rankup/checks.md` | 格式见 [`../checklists.md`](../checklists.md) |
| 本轮做了什么、被证伪的假设、下一轮唯一改进 | `.rankup/iterations.md` | 失败轮次同样要记 |
| 剥离站点后仍成立的规则 | 本 Skill 对应参考文件 | 回流后必跑 `validate-rankup.mjs` |

---

## 二 · rankup check

### 1. 触发

`rankup check`、「现在该做什么」、「到哪一步了」、「本轮还差什么」、「这个环节能过吗」。

**它是高频命令，必须保持轻量**：只读文件 + 一次零成本脚本，不派七组 agent、不花任何配额。

### 2. 产出

- 当前卡在哪个环节、这个环节还差哪几项（逐项带判据）；
- **然后直接照着做**，不是把清单念给用户听；
- 做完的逐条记进 `.rankup/checks.md`。

### 3. 流水线

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 0 | 串行 | `node <rankup>/scripts/check-version.mjs --project-root . --apply`；再 `grep -i` 本轮要碰的对象于 `.rankup/rejected.md` | 版本状态 + 否决清单命中 | 网络失败保留当前版本继续，不得伪称已更新（与 SKILL.md 启动协议第 1、2 步同一件事，这里不另存一份判据） |
| 1 | 串行 | 读 [`../checklists.md`](../checklists.md) + 项目 `.rankup/checks.md` | 七段各一张闸门表（每段开头先对账）+ 本项目的状态；旧 `checks.md` 按 [`../lifecycle.md`](../lifecycle.md) 顶部映射表对照 | `checks.md` 不存在 → 按 `checklists.md` 的格式当场建，全部标 ⬜ |
| 2 | 串行 | `node <rankup>/scripts/review.mjs --project-root .` | 文件层缺口（**只是线索，不是判定**） | `.rankup/` 不存在 → 脚本只说「先运行 `rankup init`」就退出，说明还没做过对账与 init，先补项目记忆 |
| 3 | 串行 | 找到**第一个没过闸的环节**，逐项去真实代码 / 线上响应 / 后台读数核对 | 还差哪几项 | 一个 500 字节的 `audit.md` 能让脚本变绿，里面是不是全站逐 URL 只有你看得出来 |
| 4 | 串行 | 是否要升级成全站体检 —— 判据见下表 | 一个明确的是/否 | 判「是」就直接转第一节的流水线，**不要回来问用户要不要跑** |
| 5 | 串行 | 照着做，逐项在 `.rankup/checks.md` 记 ✅ + 证据 + 日期 | 本环节过闸 | 做不了的标 ⏸，写清卡在哪、**以及你已经自动化到了哪一步** |

### 4. 判读：什么时候把 check 升级成全站体检

| 现象 | 判决 |
|---|---|
| 项目已上线，但 `.rankup/audit.md` 缺失或小于 500 字节 | **升级**——没有技术体检基线，任何「下一步」都是猜的 |
| 项目已上线，但 `.rankup/` 整个不存在（新接手的站） | **升级**——这正是 review 最大的价值场景 |
| 距上一次全站体检超过一个轮次，且中间动过线上 URL | **升级**——标「动了 URL」的那批 check 已经全部作废 |
| 用户问的是「站有什么问题」而不是「进度到哪」 | **升级**——他要的本来就是体检 |
| 上面都不成立：清单齐、基线新、只是想知道下一个动作 | **保持轻量**，跑完 5 步就够；跑七组 agent 是浪费 |

### 5. 省配额

**全程零配额。** `review.mjs` 只读本地文件，不发任何网络请求；第 3 步的核对用 `curl` 和读代码。
判「升级」之后才进入第一节的配额纪律。

### 6. 收尾

- 过掉的每一项记进 `.rankup/checks.md`（✅ + 证据在哪个文件的哪一段 + 日期）；
- 卡住的标 ⏸ 并写明需要用户做什么；
- 回复里只说做了什么、还卡在哪，**不出现「还有 X 没做，要不要做？」**。
