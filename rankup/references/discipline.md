# 纪律、红线与事故复盘

这份文件是 `SKILL.md` 3.0 从主文件里搬出来的「怎么干活」那一层：执行纪律、红线判定顺序、
配额、浏览器与取数、落盘、令牌、完成标准，以及每条规则背后的事故。主文件只留路由与七段硬规则，
**遇到「这么做对不对」的问题来这里查，遇到「该做什么」回主文件查。**

每条规则都带「为什么」。没有为什么的规则会在第一次不方便时被绕过。

---

## 一、执行纪律：全权委托

**用了这个 Skill，就意味着全权委托。不存在「要不要继续」「需要我处理吗」——答案永远是「做」。**

### 主线只调度，sub agent 做事

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| **所有实际工作都派 sub agent**，主线只负责摸现状、分解任务、派发、收结果、回写 `.rankup/` | 主线上下文是全局视野，烧在一个站的构建日志里是浪费；sub agent 崩了不影响其他任务 | 在主线里跑 `pnpm run build`、`wrangler deploy`、逐行读源码改 key |
| 独立任务**必须并行派发**（一条消息多个 Agent 调用） | 三个站各自接 Ahrefs WA 互不依赖，串行等于白扔 2/3 的时间 | 先派 A 站，等完成，再派 B 站 |
| sub agent 的 prompt 必须**自包含**：改哪个文件、改成什么、怎么验证、验证完回写 `.rankup/` 哪里 | sub agent 看不到主线上下文，信息不全就会猜，猜就会错 | prompt 只写「给某站接 Ahrefs WA」，没给项目路径、没给 data-key |
| 派它跑 playbook 的某一步时，**把那一步的「跑什么」命令块与产出格式原样贴进 prompt**，并要求按格式逐项交付；不许只写一句「做社区验证」 | 子代理读不到 playbook 的上下文，只能按 prompt 里的字面执行；写意图不写命令，它就自己发挥，少跑的那几步没人发现 | 2026-09-02：prompt 写「community demand signals」，子代理只跑了 Reddit 和 HN，X / YouTube / B 站一条没跑，报告照样交了 |

### 全量执行，不问不等

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 用户开口的目标、中途发现的缺口、上轮待办、本轮新待办——**全部做完** | 这个 Skill 的用户不是在试探，是在执行；问一遍等于白白多一轮对话 | 「还有几项待办未处理，需要我继续处理吗？」 |
| **不请示、不确认、不汇报选项**。发现问题就修，补完在回复里说一句 | 请示的成本是用户切回来看、理解、回复、你再继续的整条链路 | 「发现 key 是错的，要不要我修？」 |
| 连锁任务不截断：A 做完发现 B 要做，B 做完发现 C——**一路做到底** | 截断让用户变成人肉任务队列 | 修了 key，发现脚本有 bug，汇报 bug 然后等用户说「修一下」 |

### 人机验证：自动化到最后一步，只把那一下点击留给用户

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 遇到 CAPTCHA / 短信验证码等无法自动化的节点，**前面所有能自动完成的步骤全部做完**（表单填好、页面打开好） | 用户不该重复做机器能做的事；一个 CAPTCHA 不是放弃整条流程的理由 | 把 Naver 注册整套 SOP 甩给用户 |
| **必须用用户的浏览器打开到那个页面**（OpenCLI 或 Claude in Chrome），不是给一个 URL | 用户看到的应该是已填好的表单，只差点一下 | 「请前往某某网址，输入某某，然后点击某某」 |
| 做完之后**明确说现在浏览器里哪个标签页、要点什么** | 用户切到浏览器应一眼知道该干什么 | 「已打开页面，请完成验证」 |

适用于所有平台：Cloudflare Turnstile、Google reCAPTCHA、任何短信验证码、任何需要人眼识别的步骤。
目标是把用户的操作量从「一整套 SOP」降到「一次点击」。

### 收尾不留尾巴

做完之后的产出是**一段简报**，不是待办清单：做了什么（每项一行）、验证结果（通过/失败）、
确实无法自动完成的事项（写清为什么不能自动做，**以及你已经自动化到了哪一步**）。
「还有 X 没做，要不要做？」这种结尾**禁止出现**。

---

## 二、红线：先查脚本清单，禁止重造轮子

**凡是清单里已有的能力，一律调用现成脚本；不准在对话里现写一段等价实现，也不准手工点一遍界面。**
现写的实现每次形状都不一样，结果不可比、踩过的坑要重踩、上下文白烧，下次换个报表还得再写一遍。
**脚本坏了就修脚本**（改完更新头部的已验证日期），不要绕过它。

判定顺序，从上往下，命中即停：

1. 本 Skill 与兄弟 Skill 的脚本（底账在 [`capability-map.md`](capability-map.md)）；
2. 跨项目资产登记表 `registry.md`（别的项目已写好的，直接去那个路径取）；
3. 当前项目的 `<project>/.rankup/scripts/`；
4. 都没有 → 才新写，写完立刻按主文件「可复用操作必须落成脚本」固化并登记。

### 取数的强制优先级（禁止跳级）

1. **现有脚本**（`node scripts/xxx.mjs`）；
2. **HTTP/REST API**（`fetch` / `curl`）→ 用完固化成脚本；
3. **用户浏览器 + 现有自动化脚本**（底层走 OpenCLI）→ 没有 API 且需要登录态时；
4. **用户浏览器 + 手动 OpenCLI 或 Claude in Chrome** → 一次性探路或脚本不覆盖时。

每一级向下的**唯一理由**是「上一级确实不存在」，不是「我对下一级更熟」。
沙箱浏览器不在这个阶梯上——它没有登录态，用它查需要登录的面板必然拿到错误数据。

**Cloudflare 特别提示**：Wrangler CLI 认 `CLOUDFLARE_EMAIL` + `CLOUDFLARE_API_KEY`（Global Key）
或 `CLOUDFLARE_API_TOKEN`（scoped token）环境变量，**配好后不需要 `wrangler login`**。
段 5 密集操作 CF（DNS、Email Routing、zone 设置），先把环境变量配进 `~/.zshenv`，
后面 wrangler 命令和 `curl` API 调用都直接用。Dashboard 上某些开关偶尔点击无响应
（实测 Email Routing 启用开关），此时 API 能立刻生效——遇到 Dashboard 不动别反复点，
直接走 API。【实测 2026-09-03】

**这个阶梯管「取数」，不替代「亲眼看」。** 任何调研在动用任何一级之前，先去 Google、Bing 与目标市场的
本地引擎把词搜一遍，记第一页的页面类型——数据平台给的是模型外推，首页是搜索引擎此刻真正端给用户的东西。
公开搜索结果不需要登录态，**这是少数可以用沙箱浏览器的场景**，但地区与语言必须显式指定。

### 抓后台数据的顺序（曾经写反过）

「抓一下后台数据」「导出这个报表」「这站没有 API」——**先查 [`provider-capabilities.md`](provider-capabilities.md)
有没有现成脚本，有就直接跑（`backlink/scripts/*`）；没有才加载 `backlink` 读它的 `harvest.md`**
（虚拟滚动、节流、静默丢行的陷阱全在那）。旧版主文件有两处写成「一律先加载 backlink」，
与取数优先级第 1 级冲突，已统一为「脚本优先」。

### 调研的验收单不是入口

`research-checklist.md` 是**跑完之后的验收单**，不是执行顺序，也不是入口。入口是
[`playbooks/research.md`](playbooks/research.md)。旧版主文件的两张路由表一处说「验收单」、一处说「入口，逐项走完」，
拿验收单当流水线跑会把 9 节清单串行走一遍而不是按 playbook 并行派活。

---

## 三、配额前置检查：花配额之前的第一个动作

**凡是有配额的数据源，开工的第一个动作是问自己在哪一档，不是查第一个词。**

真实事故（2026-08-22）：整场关键词调研按「匿名 10 次/日」规划，省着用，少测 4 个词，报告写成
「配额耗尽，无法验证」——账号其实是 VIP 500/日，当天只用了 66 次。没人问过档位，文档里的默认值被当成了事实。

| 数据源 | 档位怎么看 | 为什么这么定 |
|---|---|---|
| seo.web.cafe | `node seo-webcafe.mjs <任意命令>` **第一行自动打印档位**（已用/上限/剩余），匿名档还会打印整段提示 | 档位**以脚本打印为准**，任何文档都不许写死「匿名 10 次/日」这类默认值——写死的默认值就是上面那起事故的根因 |
| Similarweb / Semrush | 档位与到期日在面板启动时打印一次；**会话复用会跳过启动，读数不再刷新** | 两站已收敛到固定会话名（`semrush-nav` / `similarweb-nav`），复用是常态，所以开工那一次读数往往是全程唯一的一次，整场调研的规模要在开工时定死 |

---

## 四、脚本没有登录态而用户浏览器有：把请求发进浏览器，不要抠 cookie

httpOnly 会话**故意**不让 JS 读到，OpenCLI 也没有导出 cookie 的命令。正确解法不是取出凭据，
而是**把调用挪到已登录的页面里执行**——浏览器自动带会话，凭据全程不离开浏览器，不写 `.env`、不进日志、不进 git。

```bash
S="webcafe-serp"          # Bash tool 里用描述性常量，不要用 $$（每次调用 PID 都变）
opencli browser "$S" open "https://seo.web.cafe/serp/"
opencli browser "$S" eval '(async()=>{ /* fetch(..., {credentials:"include"}) */ })()'
```

写法见 [`seo-webcafe.md`](seo-webcafe.md)「httpOnly 会话」。**eval 体一律包 IIFE**——本环境 eval 上下文跨调用持续，
重复声明会抛错且那次调用根本没执行。

---

## 五、浏览器与取数：规则在 `opencli` Skill，这里只留判据

**凡是需要登录态的页面操作，必须驱动用户本机那个真实的、已登录的浏览器，不得用运行环境自带的沙箱浏览器。**
沙箱没有用户的 cookie：要登录的目标要么跳登录页，要么以匿名身份返回**看起来正常但内容不同**的结果
（配额更低、字段更少、国家库不同）。这种失败会伪装成「这个工具没有这项数据」，真相是「你没登录」。

**判据：这个页面用无痕窗口打开，还是不是同一个东西？** 不是，就必须走用户的浏览器。
未安装：`npx skills add yan-labs/yan-skills --skill opencli -g -y`。

| 你要做什么 | 读 `opencli` Skill 的 |
|---|---|
| 会话命名、标签页归属、「我的页面被抢了」 | `references/session-laws.md` |
| 点击/填表/等待/读取/截图 | `references/browser-driving.md` |
| 取数与导出物落盘 SOP（本地接收端、等齐、归并、manifest） | `references/data-extraction.md` |
| adapter 编写与自修复 | `references/adapters.md` |
| `doctor` 红、桥接坏了 | `references/troubleshooting.md` |

### 四条最常被违反的

1. **一个会话一个标签页，N 个页面就要 N 个会话名。** 同名会话共用同一个标签页，「标签页被别人抢了」只有这一个成因，且全程零报错。
2. **不要硬编码通用会话名，也不要在 Bash tool 里用 `$$`。** `$$` 在 Claude Code 的 Bash tool 里每次调用都变——`open` 和 `eval` 的会话名对不上，`eval` 对着空白页执行。实测 2026-08-28：一个探针产生 14 个会话、14 个标签页。用描述性字面常量，或把 `S=$(uuidgen | cut -c1-8)` 存进文件再读回。
3. **不要加 `--window foreground`。** 后台是默认值：开在用户当前窗口里，不抬窗口、不切走他正在看的标签页，也不是无头模式。前台会把用户的活动标签页切走，只有需要他亲自过验证码时才用。要完全挪出用户窗口用 `--window isolated`。（需 OpenCLI 扩展 ≥ 1.0.32，`opencli doctor` 那行就是判据。）
4. **用完 `opencli browser <session> close`；sub agent 退出前必须显式关。** 崩溃不会自动清理，残留会话在用户 Chrome 里看起来就是别人正在做的活儿。
5. **社区采集（Reddit / X / 小红书）动用户浏览器之前先取得本轮同意；采集失败禁止循环回首页重来。** `agent-reach` 对这三个平台的 `active_backend` 就是 OpenCLI，「用 agent-reach」与「借用户的 Chrome」是同一件事，派 sub agent 时要把这一点说破。2026-09-03 实盘：一个采集脚本搜索步失败后反复导航回 reddit.com 首页，用户看到自己的标签页在刷新，两次叫停并要求全程不碰浏览器。零登录态替代路径：HN 与三引擎下拉是纯 HTTP；Reddit 公开内容走 Jina Reader 读 `old.reddit.com` 搜索页或 redlib 镜像（直读 reddit.com 会 403）；B 站 `bili-cli`、YouTube `yt-dlp`、V2EX 公开 API、GitHub `gh` 都不碰浏览器。用户明确不许碰浏览器时，报告里写「X 平台按用户指示跳过」，不许换个脚本再试。

### 抓到的数据不许留在下载目录

首选**本地接收端**（页面 `fetch` POST 到只监听本机回环地址的服务，直接写进项目目录），退路才是下载目录 + 落盘脚本。
**接收端的端口不能写死**，理由与会话名不能写死同构：端口被另一个任务占用时，常见的后台常驻写法会静默失败，
而页面的 `fetch` 照样返回 200——**打到的是另一个项目的接收端**。落盘脚本属于项目侧，固化进 `<project>/.rankup/scripts/` 并登记到 `INDEX.md`。

---

## 六、数据面板（Semrush / Similarweb）：先查能力表，再决定开不开浏览器

「这个面板能不能拿到 X」的答案已经写在 [`provider-capabilities.md`](provider-capabilities.md)——
用真实登录态点出来的测绘表。**先查表，不要现开浏览器翻一遍。** 脚本缺口与优先级在 [`provider-script-gaps.md`](provider-script-gaps.md)。

四条最省事的结论：

1. **两家的 API 和 MCP 全是死路，别再试。** 共享账号代理出借的是会话不是账号；API key 和 OAuth 同意页住在账号设置区。浏览器抓取不是临时替代方案，它是这个账号形态下唯一正确的方案。
2. Semrush 有 49 个页面是「做」层（写文章、发帖、建项目），本项目一个都不用；规划取数覆盖率时不要把它们算进分母。
3. **页面卡在「一直加载」时主动刷新重试**（刷 2–3 次才判 `unavailable`）。绝对不要把「卡加载」写成「功能不存在」或「零流量」——静默错数是这里最贵的错误。
4. 上一版审计报的 4 个「功能缺失」有 3 个是误报。判「缺失」前必须走三步：搜界面名 → 试旧路径看跳转 → 查更新日志。

### 会话名：配额站不传 `--session`

Semrush / Similarweb 的脚本**收敛到固定会话名**（`semrush-nav` / `similarweb-nav`），**不要传 `--session`，
也不要每个 agent 一个会话名**。它们是配额站：会话名就是并发度，固定名让 daemon 把并发排成一队；
传了会被忽略并打一行 stderr。Ahrefs 同理，固定 `ahrefs-nav`。旧版主文件的 Rankup CLI 示例带着 `--session`，已改正：

```bash
npx @yan-labs/rankup catalog semrush --modules      # 展开工具箱 → 功能页树
npx @yan-labs/rankup catalog --gaps                 # 只看两家没摸到的地方
npx @yan-labs/rankup capture semrush keyword-overview --keyword "<词>" --db us --out-dir .rankup/provider-audit/keyword-us
npx @yan-labs/rankup audit similarweb --manifest .rankup/provider-audit/similarweb.json --out-dir .rankup/provider-audit/live/similarweb --resume
```

- 同一平台首页最多用于首次启动一次；进入工具域名后走内页，不要每项报告重新经过首页。
- `audit` 的 manifest 既是页面目录也是续跑入口；每页证据固定八件（page.txt / page.html / DOM / AX / parsed / app JSON / network shape / 全页截图）外加带 SHA-256 的 `receipt.json`。截图不做遮罩；只有 Cookie、登录令牌这类可直接接管账号的凭据不落盘。
- 国家数据库不能只看默认美国：先看 global/country distribution，主要需求在别国时切到该国家库复核；抓取失败或权限不足不能写成零需求。

### 两家「流量」口径不同，对不上要查清原因

对齐三样东西——**地理范围 / 面板页面 / 口径定义**——方法在 [`experiences/webcafe-experiences.md`](experiences/webcafe-experiences.md)
「对齐口径要对齐三样东西」与「两个数分别是什么」两节（含 `byCountry` 只有 Top-N 不能求和）。
本 Skill 自己的实测判据：**Semrush 的自然流量在单个大头词以第 5–10 位撑起过半模型流量时会高估 4–13 倍**，
拿到域名自然流量后先拉排名词分布再决定信不信总数（[`demand-sources.md`](demand-sources.md) ②·六·四）。
三样都对齐了还差几倍才是真矛盾；对不上先怀疑口径，不要先怀疑数据源坏了。

---

## 七、兄弟 Skill：本机装着几十个，能用的只有一小半

取舍写在 [`skill-ecosystem.md`](skill-ecosystem.md)。**加载 Skill 有上下文成本，不是越多越好**，接入的唯一理由是
「rankup 现在做不到或做得差」。找不到能力的顺序：[`capability-map.md`](capability-map.md) → `skill-ecosystem.md` → `/skillsmp` 搜 → 最后才按 [`integrations.md`](integrations.md) 用 find-skills。

**已点名的兄弟 Skill 本机没装 → 用 `find-skills` 装上再继续，不跳过、不现写替代。** 每台机器装的
Skill 集合不一样，文档只保证「该用什么」；遇缺就跳过会让流水线静默少一条腿（社区验证、去 AI 味、生图），
现写替代又回到重造轮子。处置细则见 `skill-ecosystem.md`「缺 Skill 的处置」。

两条会当场出事的边界：

| 陷阱 | 判据 |
|---|---|
| 全局有个 Skill 叫 `seo-audit`，rankup 自己有个脚本叫 `seo-audit.mjs`——同名，方向相反 | **不要加载那个 Skill。** 它开场先问六个问题，与「全权委托」正面冲突；体检就跑 `scripts/seo-audit.mjs`，判读用 `seo-box.md` |
| `/write` 依赖五个附属 Skill（`writing-fragments` / `writing-shape` / `writing-beats` / `edit-article` / `humanizer-zh`），不一定装在当前机器 | **先 `ls` 确认五个都在，缺的用 `find-skills` 装齐再加载**；装不上才退到 `/human-writing` + `/shuorenhua` 并说明原因（`skill-ecosystem.md`「缺 Skill 的处置」） |

`ai-seo` 与 `seo-geo` 只取参考文档，不跑 `seo-geo/scripts/*.py`（走付费凭据，且与 rankup 取数口径重复）。
`keyword-research` 自己不带数据源，由 rankup 先取数，它只做意图分类与聚簇，**严禁跑它的 Score 相**（两个输入都是模型自己编的）。

---

## 八、已证实的高频错误（禁止再犯）

| 错误做法 | 正确做法 | 为什么是错的 |
|---|---|---|
| 为拿哥飞论坛内容去问 `ask`（哥飞.ai） | 先 `webcafe-forum.mjs chat-search` / `search` 拿原文 | 哥飞.ai 的语料就是群聊归档 + 站内教程，直接搜拿到原文、不消耗额度 |
| 以为 seo.web.cafe 只有 kd/audit/serp | 跑 `seo-webcafe.mjs --help` 或 `tools` | 21 个工具全部有归属 |
| 为算 KGR/TDK 去开网页或消耗配额 | 本地命令 `kgr` / `string` / `money` / `email` | 纯本地、零配额、支持 `--batch` |
| 拿 `new.web.cafe` 的 HTTP 200 当「取到了」 | 看 `access` 字段 / 正文空不空 | 该站匿名不返回 401，只把正文抹成空串 |
| 对 `kind:collect` 的悬赏只读 `answers[]` | 读 `collect.board[]` | 征集型内容不在 answers 里，会对着几百条榜单报「0 条」且不报错 |
| 用通用 `chatbot-drive.browser.js` 问哥飞 AI | 有 Cookie 用 `seo-webcafe.mjs chat`；没有用 `gefei-ask.mjs` | 两条专用路径都封装过配额与完成判定 |
| 用 Claude in Chrome / 手动 OpenCLI 操作 Similarweb、Semrush 面板 | `similarweb-query.mjs` / `semrush-overview.mjs` 等 | 脚本已存在，手操浪费上下文且不可复现 |
| OpenCLI 会话名用通用常量如 `work` | JS 用 `defaultSession('base')`；shell 用描述性常量 | 多任务撞名 → 拿到别人的页面，零报错 |
| 用沙箱浏览器访问需要登录的面板 | 用户的浏览器 | 沙箱没有 cookie，返回匿名态数据 |
| 手工去 GSC / Bing 后台点「提交站点地图」 | `webmaster-sitemap.mjs <gsc\|bing\|yandex> submit` | 两个后台各有坑，手操每次重踩 |
| 项目里维护「要推给 IndexNow 的 URL 数组」 | `indexnow-submit.mjs` 默认从线上 sitemap 取 | 硬编码数组必然漂移，方向永远是「新页面没推」 |
| 把 IndexNow 推送写成「文档里的一条命令」交给人记 | 焊进项目自己的 `ship` 命令（第九节） | 漏推不会让任何东西变红 |
| 用 Claude in Chrome 逐个点 GSC 移除工具 | `gsc-remove-urls.mjs` | 6 个 URL 要点 30+ 次且按钮位置漂移 |
| Cloudflare Web Analytics 手嵌 beacon 时把 `site_tag` 填进 `token` | `token` 必须是 `site_token`；接完用 GraphQL `rumPageloadEventsAdaptiveGroups(filter:{siteTag})` 查 `count > 0` | 两者同形（32 位 hex），填错不报错、脚本照样 200，只是永远 0 数据——一个站这样空跑了 45 天 |
| Lighthouse 单跑当性能基线 | `pagespeed.mjs plan --strategy both` 出链接后读网页版 | 单跑只有实验室一半；现场那块不存在 = CrUX 流量不足，不是 0、不等于通过 |
| 页面有占位链接 / 占位文案 / 占位图片就上线 | 上线前全站扫一遍，占位一律清掉或整块删掉 | Google 会把它判成垃圾站，是段 3 的红线 |
| 文案里手打由构建脚本生成的数字（兼容条数、目录规模、扫描总数） | 组件从生成的 JSON 注入，文案留槽位 | 实测同一个站同时挂着三套数字：每次重建目录数字就漂，而文案不会跟着变 |
| 并行 sub agent 在共享 scratchpad 里用 `dump.json` / `edit.py` 这类无前缀文件名 | 文件名带自己的页面 slug 前缀 | 实测一个 agent 的中间产物被兄弟 agent 覆盖，脚本读到别人的数据且不报错 |
| sub agent 撞 API 会话限额（429）死掉后从头重做 | 先看它已落盘的文件，限额重置后只补没做完的那半截 | 起稿类 agent 边写边落盘，死在改稿中途时文件往往已经改了一大半；重派前跑一次检查脚本定位剩余项 |
| 关键词短语命中一个 KD 极低的词就当机会 | 先亲眼看 SERP 页面类型再判 | 实测一个「计算器」类短语 KD 0，首页全是舞台灯光计算器；一个换算类词根的下拉被地名与机器名淹没；同名歧义是低 KD 最常见的假信号 |

---

## 九、静默收尾动作：焊进命令，不要交给人记

**判据一句话：「漏掉这一步，会有什么东西变红吗？」答案是「不会」，那它就不该由人来记。**

改完代码准备出荷时，凡是「主要工作做完之后还必须做、但漏了不会有任何报错」的动作
（推送索引、清 CDN 缓存、打版本标签、发 webhook、重新抓 OG 图），**必须在同一个任务里焊进出荷命令**，
不允许以「记得跑一下 xxx」的形式交付。危险不在难，在**失败是静默的**：构建绿、测试绿、页面 200，没有任何信号提示你漏了。

正确形态三条（脚本进项目仓库 / 配置单一事实源 + 断言挂 `test` / 焊进 ship 后段）写在
[`search-platforms.md`](search-platforms.md)「挂进发布流程」——那边是权威，动手前去读那一节。
出荷前自查：**这次改动新增或修改了线上可访问的 URL 吗？** 是 → 出荷命令里必须含索引推送。

---

## 十、接入看板与线上实测口径

`.rankup/integrations.md` 是项目所有平台接入的**唯一看板**——做了什么、没做什么、为什么不做，一张表说清。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 完成一项接入，**立刻**打 ✅ 并写证据和验证日期 | 不记等于没做，下次 review 会重来一遍 | 接完 Clarity 没记，review 判「未接入」又走一遍 |
| `rankup review` 必须**线上实测**逐项验证，不采信勾 | 代码改了、键换了、部署覆盖了——✅ 不代表线上还活着 | 清单写 GA4 ✅，线上 script 被删了三个月没人发现 |
| `rankup init` 用完整清单初始化全部 ⬜ | 一开始就知道要做多少事，不靠记忆 | 忘了接 IndexNow，上线两个月没被 Bing 收录 |
| 「不接」标 ❌ 并写裁决依据 | 区分「还没做」和「决定不做」 | AdSense 标 ⬜，每次 review 都催，其实早决定不挂广告 |

已上线站点至少覆盖以下平台（`rankup review` 逐项验证；接入步骤见 [`search-platforms.md`](search-platforms.md) 与 [`analytics-platforms.md`](analytics-platforms.md)）：

| 类别 | 平台 | 验证方式 |
|---|---|---|
| 托管方分析 | Cloudflare Web Analytics | `curl` 线上 HTML grep `cloudflareinsights` **只证明脚本在**；必须再用 GraphQL 查 `count > 0`（第八节那条事故） |
| 产品分析 | GA4 | grep `gtag` 或 `googletagmanager` |
| 行为分析 | Microsoft Clarity | grep `clarity.ms` |
| 外链视角 | Ahrefs Site Explorer / Web Analytics / Site Audit | 后台查项目验证状态；grep `analytics.ahrefs.com`；Site Audit 有已完成的抓取 |
| 搜索平台 | GSC、Bing Webmaster | 后台查验证 + sitemap 状态 |
| 搜索平台 | Yandex、Naver | grep `yandex-verification` / `naver-site-verification` |
| 索引推送 | IndexNow | `curl` 线上密钥文件 HTTP 200 |
| 邮箱 | Cloudflare Email Routing `hello@` | 发一封测试邮件收到 |
| 品牌资产 | favicon / manifest / icons | `curl` 各路径 HTTP 200 |
| SEO 元素 | title / description / robots / OG（含图） | grep 各标签，逐页 |
| 结构化数据 | JSON-LD | grep `application/ld+json` |
| AI 就绪度 | is-agentic | `is-agentic.mjs scan` |
| 多语言 | hreflang / `<html lang>` | 仅多语言站点 |
| 兜底 | 其他能带流量的平台 | 目标市场有本地引擎或本地站长工具就加一行，一个不漏 |

---

## 十一、令牌统一放 Skill 根目录的 `.env`

**本 Skill 依赖的第三方令牌只有一份，放在 Skill 根目录的 `.env`，所有项目共用。**
这些令牌属于**工具账号**（关键词难度、SERP、体检这类第三方服务），不属于任何一个站点。放进项目就会出现同一个令牌在 N 个项目里各存一份，
过期时要改 N 处，漏掉的那几处会以「配额用尽」「未授权」的面貌出现，排查方向完全错。

| | 放什么 | 例子 |
|---|---|---|
| Skill 的 `.env` | 跨项目的工具账号令牌**真实值** | `KD_TOKEN`、`CLOUDFLARE_API_TOKEN`（若是 Global API Key 还要 `CLOUDFLARE_EMAIL`） |
| 项目的 `secrets.md` | 本项目专属凭据的**名称、用途、保管位置**，绝不写真实值 | 部署密钥、支付密钥 |

1. **必须被 `.gitignore` 排除，且要断言。** `git add -f` 就能绕过 `.gitignore`，所以 `scripts/validate-rankup.mjs` 断言它不被 git 追踪，违反即构建失败。与 `registry.md` 用同一条防线。
2. **读取顺序：环境变量优先，再退到 Skill 的 `.env`。** 便于临时覆盖。
3. **调用方脚本必须和驱动脚本用同一套解析。** 只看环境变量的调用方会在令牌配好的情况下判「没有令牌」，退回匿名档撞配额，而报错在教人去设一个已经设好的变量。
4. **令牌失效时更新这一个文件**，不在项目里另建副本；某处读不到，修读取逻辑。
5. **真实值不出现在任何回复、日志、提交或落盘数据里。** 需要说明时只说键名与所在文件。

安装后 `.env` 不存在是正常状态，首次需要令牌时创建即可。

---

## 十二、完成标准

一次 `rankup` 工作只有同时满足以下条件才算完成：

1. 用户要求的产出已经存在。
2. 相关类型检查、测试、构建或迁移验证通过。
3. 若涉及发布，真实线上目标和关键路径已验证；上传成功或 Worker Ready 不能单独证明完成。若本轮初始化了绿地项目，**远端私有仓库必须存在且当前状态已推送**。
4. **本段 [`checklists.md`](checklists.md) 的 check 全部过闸**，每一项都在 `.rankup/checks.md` 记了证据；做不了的标 ⏸ 并写明原因。
5. 相关 `.rankup/` 文件已更新，过时的交叉引用已一并修正。
6. 说明完成内容、验证证据、仍存在的风险和需要用户处理的外部事项。

---

## 十三、`rankup check` 与 `rankup review` 的边界

`check` 是高频命令，**必须保持轻量：全程零配额、不派七组 agent**。它判「第一个没过闸的环节还差什么」，然后直接做。
但它要判一次要不要升级（判据在 [`playbooks/site-review.md`](playbooks/site-review.md) 第二节第 4 小节：已上线但 `audit.md` 缺失或过小、
`.rankup/` 整个不存在、距上次体检超过一轮且中间动过线上 URL、或用户问的其实是「站有什么问题」）。
**命中任一条时，先明确说一句「这已经不是 check，是 review」，再转全站体检流水线**，不要回来问用户要不要跑，
也不要在 check 的名义下偷偷派七组 agent——旧版主文件一句说「零配额不派 agent」、下一句说「直接转体检」，边界就是这一句话。

---

## 十四、占位红线（段 3）

**任何页面不得出现占位链接（`#`、`javascript:void`、指向不存在页面的 `href`）、占位文案（lorem ipsum、「即将上线」、
「敬请期待」这类空壳）、占位图片（灰块、示例图、未替换的模板图）。** Google 会把这种页面判成垃圾站，一旦判定，
后面的 SEO 全白做。宁可整块删掉，也不留一个占位。上线前闸门（段 4）要全站扫一遍，扫描口径在 [`checklists.md`](checklists.md)。

## 十五、面板与网页操作「对不上」时的回流：先分诊，确认是漂移才改原文档

Semrush / Similarweb / seo.web.cafe（含哥飞 AI）/ 哥飞论坛 / GSC、Bing、Naver 等站长工具，
以及所有走 OpenCLI 驱动浏览器的脚本，文档里写的口径、路径、字段、配额，都是某一天实测出来的。
用的时候发现「和文档说的不一样」，**跑完这一轮必须处理**，处理只有两种结果：
确认是**平台本身变了**（`provider-drift`）→ 修 Skill 原文档；确认是**环境问题**（`environment-issue`）→ 只记项目侧 `journal/`，Skill 一个字不动。

**为什么不能看到一次对不上就改**：同一个现象，浏览器扩展版本旧、标签页在后台没渲染、会话被别的采集器抢了、
网络抖动、Tools Share 节点额度满、当天配额用完、当天面板故障，都会长得和「面板改版」一模一样。
把一次环境故障写成「Semrush 这个报表没了」，下一个人就会绕开一个其实好好的功能——**这比不回流更糟**。

### 分诊阶梯：五层全过才算漂移

| 层 | 排除什么 | 怎么做 | 过不了怎么记 |
|---|---|---|---|
| 1 同命令重跑 | 瞬时抖动 | 原样再跑一次，间隔 ≥ 1 分钟 | 第二次正常 → `environment-issue: transient`，不回流 |
| 2 浏览器与会话 | 扩展旧、标签页后台、会话被抢、登录掉了 | `opencli doctor` 全绿；换会话名重跑；确认标签页可见（`visibilityState`）；面板启动行打印的档位与到期日正常 | 任一不正常 → `environment-issue: browser/session`，修环境不修文档 |
| 3 额度与配额 | 节点额度满、当日配额用完、账号降档 | `tools-share-node.mjs list` 看节点余量；seo.web.cafe 看脚本第一行档位；Semrush/Similarweb 看启动时打印的额度 | 额度问题 → `environment-issue: quota`，记进 `journal/`，明天再验 |
| 4 人眼对照 | 脚本 selector 坏了 vs 页面真的变了 | 在用户浏览器里**手动打开同一页面**，截图；对照文档描述的位置、字段、按钮。截图落 `.rankup/evidence/drift-<平台>-<date>/` | 页面和文档一致、只是脚本抓不到 → 是**脚本坏了**，按「脚本坏了修脚本」处理，文档不动 |
| 5 跨时段或跨对象复现 | 单日故障、单个输入的特例 | 换一天（或至少隔 6 小时）再跑一次；再换一个域名/词跑一次 | 只在一个时段或一个对象上复现 → 仍记 `environment-issue: unconfirmed`，附证据等下次 |

五层都过、且第 4 层截图证明**页面本身**已与文档不符 → 判 `provider-drift`，才允许改 Skill。

### 确认漂移之后怎么改

1. **修订原条目，不并列**：在 `provider-capabilities.md` / `seo-webcafe.md` / `webcafe-forum.md` / `search-platforms.md` 等原位置改，
   并同步 `data/provider-capabilities.json`（两边不一致 `provider-doc-sync` 会挂）。旧说法删掉或标 `superseded`，不留两个版本让下一个人猜。
2. **改的那一句带三样东西**：新的已验证日期、原来怎么说、现在观察到什么（一句话），证据目录路径留在项目侧 `journal/`，Skill 里只写「已验证 YYYY-MM-DD」。
3. **脚本随文档改**：口径变了脚本头部的已验证日期与字段说明一起改；脚本坏了先修脚本再改文档，顺序不能反。
4. **走晋升门**：`evolution.md` 第 7 节的条件对这类修订同样适用，尤其第 4 条——能写出一条「改之前跑会错、改之后跑对」的核验（哪怕只是一次实跑记录）。
5. 没过五层的，一律留在项目 `journal/` 的「面板对不上」小节，写清排除到了第几层、缺什么证据；`rankup review` 时再看要不要补验。


## 十六、组件库红线（段 3 / 段 4）：UI 只准来自组件库，不许自己造控件

用户最常见的开口方式是「做个功能吧」「做个内页吧」，然后直接进开发。这时第一条约束不是 SEO，是 UI 从哪来：
项目是用 shadcn 的命令行初始化的，`components/ui/` 里已经有一整套组件，**任何功能、任何页面的控件一律从这里取**。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 先 `ls components/ui/` 看有没有；有就用，没有就 `pnpm dlx shadcn@latest add <组件>`；shadcn 没有的装同一生态（Radix / React 生态里带可访问性的现成包），装完再用 | 组件库带着键盘导航、焦点管理、暗色模式、ARIA 和统一视觉，手写一个下拉框这些全丢，且每个站各写一遍没人维护 | 用 `<div onClick>` 拼一个下拉菜单；用绝对定位 `<div>` 当弹窗；自己写日期选择器 |
| **禁止手写**：下拉框、弹窗 / Dialog / Sheet、日期选择、表格分页、Toast、Tabs、Tooltip、Command 面板这类基础控件 | 这些正是最容易「看着能用、键盘和读屏全坏」的一类，也是 Lighthouse 可访问性分和 GEO 就绪度掉分的常见来源 | 「组件库那个不好改样式，我自己写一个」——改样式走 className 与 variants，不走重写 |
| 判据：在业务目录 `grep -rn 'role="dialog"\|role="listbox"\|role="combobox"\|<select' apps/`，命中的每一处都要能指出来自 `components/ui/` 哪个文件或哪个已安装的包；指不出来的就是手写，打回 | 让「有没有手写」变成可 grep 的事实，不靠自觉 | 代码评审时说「应该都是组件库的」 |
| 这条与「不重复造轮子」（段 3）是同一条纪律在 UI 层的落地，闸门在 `checklists.md` 段 3「UI 只来自组件库」，步骤 check 在 `lifecycle.md` 3.3 | 一处判据两处指路，不各存一份 | — |

---

## 十七、IndexNow 推送默认 diff，不全量

`ship` 命令里的 IndexNow 脚本**默认只推新增的 URL**——对比上一次成功推送的记录
（`.rankup/indexnow-last.json`），只把 sitemap 里新出现的 URL 发给 IndexNow。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 默认 diff 推送：脚本维护一份上次推送的 URL 集合，只推新增的；全量推送用 `--all` 显式触发 | 每次全量推 19 条（以后更多）全是重复信号，IndexNow 的设计意图就是「变了才推」；搜索引擎对重复推送不报错但会降低信任权重 | 每次 `pnpm ship` 把全站 URL 无差别推一遍 |
| 上次推送记录是**本地状态**，不进 git（`.gitignore`），丢了等于下次全推一次，不影响正确性 | 换机器或首次推送自然退化为全量，不需要额外处理 | 把推送记录放进 git，每次部署制造一个 diff 噪音提交 |

---

## 十八、ID / token / 密钥等标识符禁止从截图或记忆中抄录

复制任何平台分配的标识符（Measurement ID、Project ID、Tracking Code、API key、
CNAME 值、TXT 记录值等）时，**必须从页面元素直接获取文本或点击平台的复制按钮**。
禁止从截图 OCR、从上一次对话的记忆、或从人工转录中抄录。

| 规则 | 为什么 | 反面教材 |
|---|---|---|
| 获取 ID 的唯一合法来源：页面 DOM 里的文本节点（`read_page` / `get_page_text` / `javascript_tool` 取值）或平台提供的「复制」按钮（点击后从剪贴板读） | 截图 OCR 会把 `B` 读成 `8`、`N` 读成 `W`；记忆会在会话压缩时丢失精度；人工转录更不可靠——这些错误**在功能层面不报错**，数据静默流进错误的账号 | GA4 Measurement ID 从截图里读，`7BB4N5` 变成 `78B4W5`，代码里埋的是错的 ID，GA4 实时报告永远收不到数据但页面不报错 |
| 拿到 ID 后**立刻写进代码或配置**，不要先存到中间变量、临时文件、或对话里隔几轮再用 | 中间步骤越多，被压缩、被覆盖、被手误的概率越高 | 先「记住」ID，做完其他事回头再用，结果用的是压缩后的残值 |
| 部署后用线上 HTML **反向 grep** 确认 ID 与控制台里的一致 | 唯一的闭环验证；光看代码里有没有不够，要看线上跑的是不是对的那个 | 代码里有 ID、部署成功、但 ID 是错的——三个绿灯全亮，数据全丢 |
