# Authorized backlink data sources

Use this reference for logged-in research surfaces.

## 哥飞社区的众筹外链榜（可脚本刷新）

`new.web.cafe` 上有一场**征集型悬赏**「网站上线之后，你会去哪些地方提交外链？」
（`/ask/bounty/wlhmhdaoqg`），162 人提交、汇成一个 **588 条**的按票排序榜单，
**每条还带提交者写的理由**（免费/付费、价格、能不能被 GSC 收录、有没有真实流量）。
这是一份**众人真金白银试过之后投票投出来的**外链目标清单，
比任何一份「100 个外链平台」的博客汇总都可信。

刷新它不需要人肉抄：

```bash
node ../../rankup/scripts/webcafe-forum.mjs bounty wlhmhdaoqg \
     --transport browser --json --out board.json
```

**三件必须知道的事：**

1. 内容在 `collect.board[]`，**不在 `answers[]`**。只读 answers 会得到「0 条答案」
   ——不报错、不为空，就是答错了数组。
2. **匿名拿不到**：`board` 会是空数组（HTTP 仍是 200）。必须 `--transport browser`。
3. 榜单要到状态 `open`（已开榜）才可见；`collecting` 阶段登录也是空的。

字段与全站接口地图见 [`../../rankup/references/webcafe-forum.md`](../../rankup/references/webcafe-forum.md)。
**注意那是只读的**——脚本对该站只发 GET，绝不解锁/支付/提交。

**2026-09-09 把整张榜单打回数据集**：`submission-targets.json` 的 target 定义和
`paid-platforms.json` 的每个平台条目上都可以带 `communityBoards[]`——每条记
`board`（榜单 id，这份榜单固定是 `webcafe-bounty-wlhmhdaoqg`）、`rank`（按票排
序的名次）、`votes`（票数）、`submitterNote`（提交者理由原文，多人重复提交时
合并去重，截断到 500 字）、`boardUrl`（帖子本身）、`boardEntryUrl`（榜单条目里
写的原始 URL）、`capturedAt`（抓取日期）。它只是「多少人推荐在这提交」的排序信
号，不是外链证据——不能替代 `evidence`/`status` 该有的探测。取数走本节前面的
`webcafe-forum.mjs bounty wlhmhdaoqg --transport browser --json`；回写时按域名
（不带 scheme/www）匹配已有条目追加 `communityBoards`，榜单里有但数据集没有的
域名，按 `status: "unverified"` 补一条新 target（`sourceList` 仍写
`"web.cafe bounty wlhmhdaoqg"`），解析不出域名或不是外链平台的条目（纯描述性
文字如「导航站」「各种可以带链接的论坛」）不硬塞，弃掉。


## Tools Share dashboard

Entry point, hardcoded because it is a public URL and every owner of this Skill
lands on their **own** account there:

```
https://dash.3ue.co/zh-Hans/#/page/m/home
```

`TOOLS_SHARE_DASHBOARD_URL` still overrides it, for anyone on a different panel.
There is nothing secret in the URL — the account lives in the browser session,
so a reader of this file gains nothing without the owner's logged-in Chrome.

Tools Share is a **shared-account proxy**: it holds one paid subscription and
lends it out through its own origins. As measured 2026-08-19 the panel carried
two SEO cards, and the card labels describe the *plan*, not the product:

| Card label on the panel | What it actually launches | Origin |
| --- | --- | --- |
| `🔖 PRO 全球版` | Similarweb PRO | `https://sim.3ue.co` |
| `🔖 GURU 地区数据库` | Semrush GURU | `https://sem.3ue.co` |

So the mapping is not guessable from the label — verify the landed origin
rather than trusting the card text, which is what `tools-share-open.mjs` does.

⚠️ **`sem.3ue.co` is the ONLY authorised Semrush base, and typing the wrong host
fails SILENTLY onto a sales page.** Measured 2026-08-29: a deep link built on
`www.semrush.com/analytics/traffic/...` **does not error**. It renders a
skeleton, bounces to `/analytics/traffic/` — the **public marketing page**
(`innerText` 514, 10 images, title
`Traffic Analytics: Estimate Any Website's Traffic | Semrush`) — then bounces
again to overview. **A scanner will record "no table, has svg, has export
buttons" off a sales page and file it as a finding about your target.** After
those bounces the tab was sitting on **`mmradar.gg`**'s domain overview (23
filled cells, AS 22, organic 23.9K), so any probe reading `cells > 0` at that
moment files someone else's numbers under your domain. Assert **landed path ==
requested route** and **header domain == requested target** before classifying
anything — see <law-ref id="readiness-must-bind-to-this-query"/> and
`scripts/lib-report-readiness.mjs`.

### Use the script, not hand-driven clicks

```bash
node scripts/tools-share-open.mjs --tool semrush
node scripts/tools-share-open.mjs --tool similarweb
node scripts/tools-share-open.mjs --tool semrush \
  --goto '/analytics/backlinks/referring-domains/?q=example.com&searchType=domain'
```

It opens the panel in a named background OpenCLI session, picks the card by
matching its label, clicks `打开`, polls until the expected origin appears, and
prints the subscription expiry and today's quota. It **never types a password**:
a logged-out panel is an error telling the owner to sign in themselves.

### 节点：会挂，而且必须在点「打开」之前选

每张卡片上有一个**节点选择器**（`节点1`…`节点N`），面板是 Angular + Nebular，
结构是 `<nb-select>` 里一个 `button.select-button` 触发，选项是 `<nb-option>`。

```bash
node scripts/tools-share-open.mjs --tool similarweb --node 5
```

四条实测规则：

1. **节点会挂，而且挂的样子很像脚本坏了。** 挂掉的节点点「打开」之后，工具页落到一个
   空白页或者长时间不渲染（`bodyText` 为空、标题却是对的）。这时**先换节点**，
   不要去调选择器、加等待、怀疑登录态——那些都不是原因。
2. **选节点必须在点「打开」之前。** 点完「打开」标签页就跳到工具域了，
   那边一个 `nb-select` 都没有。（这个顺序错误的症状是 `Seen: []`，
   读起来像「面板上没有节点选择器」，实际是你已经不在面板上了。）
3. **倍率越高，配额消耗越快**（面板自己的提示原文）。没有特别理由就用 `X 1` 的节点。
4. **卡片上的产品名是 logo 图片，没有文字。** 想按卡片文案定位卡片会失败；
   产品名真正出现在节点选择器自己的文案里（`节点3 倍率 X 1 🔖 PRO 全球版`），
   所以直接在 `nb-select` 列表里按 label 挑。

### 会话会停在工具 origin 上

**硬规则（2026-08-26 用户现场发现）**：同一任务、同一工具从头到尾固定一个 session；
零值或异常复查仍复用它，整批完成后只 `close` 一次。每次重新打开 dashboard 都可能被平台
计作新的客户端登录。共享启动器已增加 `existing-tool-session` 快速路径，但调用脚本仍必须
显式传同一个 `--session`，不能靠默认名碰运气。

点过一次「打开」之后，这个 OpenCLI 会话的标签页就留在 `sim`/`sem` 那边了。
**再 `open` 面板不保证把它导航回来**，`close` + 重新 `open` 实测也可能救不回来。
脚本已经在 `open` 之后核对当前 host，两次都不对就直接报错并指路，
而不是带着一个读不到面板的会话继续跑。

会话名之间的隔离本身是好的——三个不同 session 名实测拿到三个不同的 `page` id，
互不干扰。所以遇到这种情况，**换一个 `--session` 名重跑**是最省事的解法，
或者干脆在所有者的 Chrome 里手工走一遍：打开面板 → 在那张卡上选节点 → 点「打开」→
在落地的那个标签页里继续操作。

### Three things that will waste an hour if you do not know them

**The launcher is what mints the session.** Navigating straight to
`https://sem.3ue.co/analytics/...` before clicking `打开` lands on
**`about:blank`** — not an error page, not a redirect to a login, just blank.
Launch first, then navigate inside the established session (`--goto` does
exactly this). A blank page here means "no session yet", not "the tool is down".

**The launch URL carries a session token** as a `__gmitm=` query parameter.
Never log it, never paste it into a file, never commit it. Strip the query
string before printing any URL from these origins.

**The subscription is short-dated and the panel says so.** The instance measured
on 2026-08-19 had **2 days left** (expiry `2026-08-20 21:56`) with per-tool daily
quotas at 2% and 15%. Read `到期时间` / `剩余天数` / `API 今日配额` off the panel
before planning a campaign around this data source; the script returns all three
and warns at 7 days or fewer. Plan the pull around the expiry, not the other way
around.

### Similarweb role

Use Similarweb to:

- discover similar and competing domains;
- estimate traffic/channel mix;
- compare geographic and topical fit;
- prioritize which domains enter backlink research.

Do not treat estimated traffic as proof of link quality or causal SEO impact.

Use `scripts/similarweb-query.mjs` for repeatable domain research through this
owner-authorized session. It performs DOM-based navigation and readiness
polling; it does not use screen coordinates or expose session cookies.

```bash
node scripts/similarweb-query.mjs --domain example.com --report performance \
  --out .backlink/similarweb-example.com.json
```

The app can take 20–60 seconds to initialize. A completed report with N/A or no
similar sites is evidence of sparse Similarweb coverage, not a script failure.
Traffic, rank, channel, and competitive-site values remain directional and
time-sensitive.

### Semrush role

Use Semrush to:

- retrieve authorized backlink rows for a seed domain;
- inspect referring pages/domains and anchors;
- expand the recursive discovery queue;
- compare backlink gaps.

Respect plan quotas and exports. Never capture or print session secrets.

**每一个 Semrush 数字都挂着一个国家库，读数字之前先确认是哪一个。**

| 维度 | 脚本 | `--db` 的含义 | 有没有全球合计 |
|---|---|---|---|
| 关键词（`semrush-keyword.mjs`） | `volume`＝该国搜索量；`--bulk` 同库一次最多 100 词 | 批量模式必填；单词模式省略时沿用历史默认 `jp` 并给出提示 | 单词模式有 `globalVolume` 与 Top-N `byCountry`；批量模式专注当前国家库 |

多个国家已经由全球结果筛出时，把 `{ "us": ["keyword"], "de": ["keyword"] }` 写进 JSON，使用
`--bulk-plan <file> --out <jsonl>`。脚本只启动一次 Semrush，再通过同一页面会话取完各国家库，避免
每个国家都回到工具主页。
| 域名（`semrush-overview.mjs` / `semrush-batch.mjs` / `semrush-report.mjs` 的四张报表） | `organicTraffic` 等＝该国估算 | 省略不等于全球，只是落到 Semrush 自己的默认库 | **没有**——这几个脚本目前没有全球选项，域名维度想要全球规模只能换一个独立信源（比如 Similarweb）按国家占比折算，不能靠不传 `--db` 拿到 |

Semrush 网页版本身是否提供一档「Worldwide」数据库供域名概览选择，**这一点没有验证过**，
不要替它下结论；如果哪天验证到了，回来更新上面这张表，而不是继续假设「没有」。

关键词先按国家分文件，用 `--bulk --db <cc>` 一次筛最多 100 个；入选词再用单词模式读取
`globalVolume` 和 `byCountry`，随后对主要国家与项目目标市场分别跑对应 `--db`。这样美国库的零值
不会覆盖其他国家的真实需求。

单词模式会自动做一次 **geo-hop**（2026-08-30 起只报事实）：`byCountry` 第一大国家
不是当前 `db` 时，脚本在**同一个 session**里追加该国复查并写进 `geoHop.result`，
同时给出 `share`（第一大国家占 `globalVolume` 的百分比）与两边的量；只追一层，
不递归，也不回 dashboard。用 `--no-follow-top-country` 才会明确关闭。旧版
「份额 >=35% 或当前库量 <500 才追查」的阈值已从脚本移出——**显著与否由 AI 拿
share/volume 判**。这样 US 低量但印度等市场占绝对多数的词不会被误判为
“没有需求”，判断也不再被写死的阈值遮住。

跟别的面板对比时（尤其是 Similarweb），三件事都要对齐，缺一个都能吵出一个假的倍数差：
1. **地理范围**——Semrush 的数字是一个国家库，Similarweb 默认是全球，先把两边扳到同一个地理范围（乘目标国占比，或用 Semrush 关键词维度的 `globalVolume`）再比；
2. **报表页面**——Similarweb 自己的「网站表现」总量和「流量来源渠道」的渠道加总就能对不上（实测差 6–35%），报数字时必须写清楚是哪一页；
3. **口径定义**——Semrush 的自然流量是**模型**（追踪到的词 × 搜索量 × 位次假设点击率算出来的，它数据库之外的搜索词完全看不见），Similarweb 是**面板外推**（基于抽样设备的点击流数据放大），两者一个是模型输出、一个是观测外推，标清楚各自是什么，不要相减或相除。

下面「两个搜索量数字打架」「闭环的两端不能接在同一个模型上」两节就是踩过这三条坑之后的处理方法，遇到数字对不上先看这张表和那两节，而不是怀疑哪个工具坏了。

## Non-interruptive OpenCLI policy

The dashboard's `打开` controls may create or activate a browser window. Default
to a named OpenCLI browser session with `--window background`. Inspect the card
and launcher first. If a stable target URL or already-open tool tab is available,
open or bind that target directly instead of clicking the launcher.

Do not automate while the user is actively using the same Chrome window if the
site cannot remain backgrounded. Stop and report the limitation rather than
stealing foreground focus.

## Search Console role

Google Search Console is a verification and monitoring surface, not the primary
recursive discovery source. Keep these facts separate:

- performance clicks and queries;
- indexed/not-indexed page counts;
- link existence in a report;
- exact public anchor and `rel` attributes on the live referring page.

Authenticated access does not authorize account switching, property changes,
user management, removals, or other mutations.

## columbus.tools —— AI 工具站的外链榜（免费层可用）

`https://columbus.tools/ai-backlink-rank` 把「被 AI 工具站引用最多的外链来源域名」
按**出现频次**排好了，每行带 DR、月访问量、Dofollow/Nofollow、自然搜索占比。
这正是我们想要的「出现在多少个独立同行身上」信号，只不过它的样本池是 3,640 个 AI 站。

- **免费能拿到的**：默认排序前 100 名，无需登录。
- **要钱的**：翻页（共 126 页 / 6,254 个域名）、按 DR/流量/搜索占比筛选，
  以及 MCP 的 `list_backlink_domains` 等 6 个工具（只有 `list_model_releases` 免费）。
- **采集注意**：虚拟滚动 + Tab 分隔字段，做法见
  [harvest.md](harvest.md) 的「columbus.tools 免费层只给前 100 名」。

**2026-08-19 对账结果：前 100 名里我们已收录 22 个，78 个是新的。**
新增里判为可用 45 个、判为垃圾 33 个（短链农场与镜像站：`*-links-bhs.xyz` 系列、
`buzzshrink.website`、`anchorurl.cloud`、`urls-shortener.eu`、`shortenurls.eu`、
`bye.fyi`、`quero.party` 等，共同特征是 0 流量 + 0 自然搜索占比 + 短链形态）。
原始数据落在项目侧的 `<项目>/.backlink/columbus-top100.json`——**采集产物属于项目，不进本 Skill**。

> 这份榜是**平台层面的断言**，不是对某一条链的观测。
> 它的 Dofollow 列和第三方名单的 Dofollow 列性质一样——
> 按 [instant-publish.md](instant-publish.md) 的「Reading a third-party list」对待：
> 可以拿来排候选，不可以直接写进 ledger 当 `rel_verified`。

### 瞬时错误页：刷新即恢复，不是节点挂了（2026-08-21，站主口述 + 实测）

面板和工具页偶尔整页变成：

> **出错了**
> 别担心，我们已经发现了问题并正在处理。
> 请稍后重试。

**这是瞬时的，重载页面即恢复，多刷几次一定回来。**
不要因此换节点、改选择器、怀疑登录态——那些都不是原因。

**与「节点会挂」是两件事，症状可以区分：**

| | 瞬时错误页 | 节点挂了 |
|---|---|---|
| 页面长什么样 | **有明确错误文案**（上面那三行） | **白页 / 长时间不渲染**，`bodyText` 为空但标题是对的 |
| 怎么办 | **重载当前页**，重试几次 | **换 `--node`**，重载没用 |

`semrush-report.mjs` 已经按这条实现：命中错误文案就 `location.reload()` 重试，
默认 3 次（`--retries`），失败时的报错文案会把两种成因分开列。

### 标签出现 ≠ 数值出现（2026-08-23 实测，静默错数）

指标区分两拍渲染：先挂标签和占位值（`Authority Score` 下面一个 `0`、
`总访问量` 下面一个空态句），几秒后真值才水合进来。**只认标签的就绪判据会在
这个缝里通过，读到的是占位值，而且不报错。** 8 个域名跑 `semrush-overview.mjs`，
6 个被记成 `authorityScore: 0`（真值 22/29/38/15/22/26）；同一天
`similarweb-batch.mjs` 把月访问 351,111 的 mmradar.gg 记成 `below-floor`。

判据与实现见 [traffic-screen.md](traffic-screen.md#a-rendered-label-is-not-a-rendered-number)：
`lib-tools-share.mjs` 的 `captureStable()`，**同一组数值连读两次一致才收下，
读不稳记 error**。`semrush-overview.mjs` / `semrush-batch.mjs` /
`similarweb-batch.mjs` 已按此实现。

**六个脚本已全部走这条路**：`semrush-overview.mjs`、`semrush-batch.mjs`、
`similarweb-batch.mjs`、`similarweb-query.mjs`，以及 `semrush-report.mjs` 的全部六张报告
（它拿 `parse()` 的完整输出当指纹——**指纹就是要写出去的那个对象**，
不存在「盯着 A、写出去 B」的漏洞）。`spec.ready` 从此只是入场券，不是结论。

**「连读两次一致」是下限，不是上限**（2026-08-24 实跑打脸补充）：占位值本身是稳定的，
两次快读之间它根本不变。`semrush-batch` 在旧默认（settle 5s / 间隔 2s / 超时 40s）下
仍然把 mmradar.gg 的 AS 读成 0，并把另外三个正常站判成 below-floor。补了三条才真正拦住：
**一个字段都没解析出来永不收下**（超时记 error）、**自相矛盾的指纹要连读六次**
（自然流量 > 0 却 AS = 0 说明 AS 还没水合）、**settle/间隔/超时调大到 8s/3s/75s**。
改后同样四个域名 4/4 正确，单域名从 16 秒涨到 25 秒。

**注意这一整段只管一个轴：占位值 vs 真值。** 它默认「表在那儿，只是数还没进来」，
所以补救永远是「再读一次」。**读到空还有另一个轴，判据和补救都不一样**：
一是**没水合**（读的那一刻 `document.visibilityState === 'hidden'`，换一次 `visible` 读就有了），
二是**这条路由本来就没有表**（`visible` 下连读三次仍是 0 个表格元素，只有图表——
再读多少次都一样，数据存在，但取数形态是图不是表）。
所以读到空之后第一个动作是**在页面里取 `visibilityState`**，不是再读一次；
`hidden` 下的读一律记 `inconclusive-hidden`，不许记 `below-floor`、不许记「空」。
实测、路由清单和可下判定的协议只有一份权威，在本 Skill SKILL.md 里
id 为 `hidden-tabs-do-not-hydrate` 的那条 law，要改就改在那儿。

**Similarweb 的取值曾经会「扫过头」**：页面上没有数据时写的是 `-`，而旧模式
`#?\s*[\d,]+` 既不限整行也没有标签边界，于是一路扫到「Last 28 days (As of Aug 21)」，
把 **28** 抓成了国家排名和行业排名（na.whatismymmr.com，真实是三个 `-`）。
三条守则照抄 `semrush-report.mjs` 的 `pick()`：**碰到下一个标签就停、整行匹配、
`-`/`N/A` 直接返回 null**。解析器同时从两份拷贝合并成一份 `lib-similarweb.mjs`——
之前两份各抄一遍，同一个 bug 要修两次，实际只修了一次。

**令牌会经由第三方输出漏出去**：`opencli` 命令失败时把活动会话连同完整 URL 打进 stderr，
`run()` 原样抛成 Error.message，脚本再塞进 `output.error.message`——
`__gmitm=ayWzA3*...` 就这样进了 stdout、`--out` 文件和日志（2026-08-24 实测到一次）。
现在所有外发的错误文本一律过 `redactSecrets()`。**不要指望每个调用点自己记得。**

顺带修掉的四个同源问题：
- **`semrush-report.mjs` 在全新 `--session` 下根本跑不起来**：`ensureTool()` 的复用探测
  在会话不存在时让 opencli 非零退出，而那层 try 只兜 JSON 解析——整张报告变成
  `report_failed`，报错写着「No active session」，读起来像 OpenCLI 坏了。
  探测的语义只有一句「我是不是已经站在工具页上」，答不上来就当没有，去启动。
- **翻页**：页码指示器先走，表体后换。点完就读会把上一页再读一遍，而行级去重
  把它悄悄吞掉（翻五页只多十二行）。现在要求新页的解析结果**稳定且与上一页不同**，
  拿不到就停下并写明 `pagination.stoppedBecause` + stderr `[truncated]`。
- **静默截断**：`--max-pages` 到顶、下一页按钮没了、某页始终没稳——三种都会明确报出来。
- **`parsePages` 的字段名对不上内容**（`rowsVisible` 里装的是行数组），
  导致 `--all-pages` 翻 `organic-pages` 时 `parsed.rows` 是 undefined，
  push 抛 TypeError，整张报告变成 `report_failed`——看起来像数据源坏了。

### Semrush 的五张「没有导出按钮」的报告，以及会话复用的经济账

`semrush-overview.mjs` 只覆盖域名概览一张。真正做竞品勘测要的是另外四张，
全部由 `semrush-report.mjs` 覆盖：

| `--report` | 路由 | 拿得到什么 |
|---|---|---|
| `organic-overview` | `/analytics/organic/overview/` | 关键词数、自然流量、流量成本、分国家 |
| `organic-positions` | `/analytics/organic/positions/` | **全量排名词**（页面只显示 10 行，DOM 里是全部） |
| `organic-pages` | `/analytics/organic/pages/` | 哪些页在带流量、各自几个词、引荐域名数 |
| `backlinks-overview` | `/analytics/backlinks/overview/` | 引荐域名、反链、AS、月访问、**有没有 follow 反链** |
| `keyword` | `/analytics/keywordoverview/` | 量、KD、**要多少引荐域名**、CPC、分国家 |

**同一个 `--session` 贯穿整轮勘测，面板只启动一次。**
启动一次 20–40 秒并消耗一次登录，报告本身只要十几秒。
一轮读十几张报告，每张都重新启动等于把时间和配额乘以十几倍。
脚本会检测会话是否已停在工具 origin 上并跳过启动，输出里的 `sessionReused` 说明走了哪条。

**`backlinks-overview` 有一个别处拿不到的强信号**：全站一条 follow 反链都没有时，
Semrush 会直接写「找不到 Follow 反向链接」。脚本解析成 `noFollowBacklinks: true`。
它比 `AS = 0` 更明确——AS 0 也可能只是数据太新，而这句话是关于 rel 的断言。

### 两条走不通的路由，别再花一小时重新发现

- **批量关键词分析不能用 URL 驱动。** 把换行连接的关键词塞进 `?q=`，
  页面会落在「批量分析」标签页上、参数被丢弃、表格为空。**一次查一个词。**
- **Keyword Magic 的关键词表格渲染不出来。** 主题云会水合，行不会，
  于是采集「成功」但一个关键词都没有。**改用 `--report keyword` 逐词查。**

### `opencli eval` 返回裸字符串时没有 JSON 信封

`eval` 的返回值是字符串时，stdout 里就是那个裸字符串，`firstJson()` 会抛
`OpenCLI returned no JSON payload`。**所有 eval 表达式都用 `JSON.stringify(...)` 包一层**，
调用侧再兜一层 try。2026-08-21 有个一次性脚本因为这个在第一步直接崩掉，
现象是「OpenCLI 坏了」，实际是返回值形状。


### `backlinks-overview` 的「找不到 Follow 反向链接」不等于零（2026-08-21 实测）

概览页会在 Authority Score 旁边打一句「**找不到 Follow 反向链接**」。
**不要把它当成「一条 follow 都没有」的字面结论。** 同一个域名、同一时刻，
`backlinks-list` 报告顶部的卡片写着「最佳 **2** · 带 follow 属性的反向链接」，
而逐条到源页面用 `curl` 核实，**至少 7 个来源发的是无 `rel` 属性的 follow 链**。

三个数字都是 Semrush 自己给的，口径各不相同：概览那句大概率是**质量过滤后**的说法
（垃圾网络发的 follow 不计入它的权重模型），不是爬虫计数。

**规矩：`rel` 只有一个可信来源——源页面上那个 `<a>` 标签本身。**
任何第三方面板的 follow/nofollow 列都只能用来排候选，不能写进 ledger 的 `rel_verified`。
这与「Reading a third-party list」里对 Dofollow 列的处置是同一条。

### 排名页全落在裸根域名时，解析器会静默吐空（2026-08-21 实战测试）

`semrush-report.mjs --report organic-positions` 的 URL 行匹配器曾经写成
`/^[a-z0-9-]+(\.[a-z0-9-]+)+\/\S/i`——**斜杠后面必须还有一个非空白字符**。
于是每一条排名页是裸根（`snapgen.ai/`，斜杠后面什么都没有）的行都被丢掉，
既不报错，也不留痕迹。

这不是边缘情况，是这个人群的**中位数情况**：新上线的 SaaS / AI 工具站，
自然流量基本全压在 `/` 上。2026-08-21 实测一批榜单站，**五个域名无一幸免**：

| 域名 | 修复前解析出 | 修复后 | 丢失 |
|---|---|---|---|
| snapgen.ai | 2 | 93 | 91 |
| ezmaker.ai | 51 | 100 | 49 |
| logomotion.design | 2 | 22 | 20 |
| foziscribe.ai | 8 | 14 | 6 |
| agenton.me | 2 | 5 | 3 |

危险的地方在 `ezmaker.ai` 那一行：51 行看着完全正常，没有任何理由去怀疑它。
测试者当场只发现了 snapgen.ai 一个，并且据 `logomotion.design` 那 2 行写下
「这个站几乎没有自然排名」——**结论是错的，而他不知道**。

已修（斜杠后不再要求字符）。留在这里是因为它示范了一类比选择器写错更难发现的
故障：**页面完全就绪、渲染完整、脚本退出码 0，错的是解析器自己的正则。**
Skill 里原有的四个坑全都是「页面还没好就去读」，这一个不是，所以四条老经验
一条都拦不住它。

推论，写给下一个写解析器的人：**行数是可以被证伪的。** 拿 `rawText` 里符合
「一行一条记录」特征的行数，和 `parsed.rows.length` 对一次，差额就是你正则的
盲区。这个自查比任何就绪判定都便宜。

### 会话复用之后，配额读数就消失了（2026-08-21 实战测试）

`lib-tools-share.mjs` 只在面板/仪表盘页面上刮 `API 今日配额` 那段文字。
复用会话跳过启动器——也就是本文件明确推荐、用来省时间省配额的那条路——
页面不会重新渲染那段文字，所以**后续每一次 `semrush-report.mjs` /
`semrush-keyword.mjs` 调用都不再打印配额**。

后果很具体：「配额过 80% 就停」这类预算纪律，在推荐工作流下**无法在中途执行**。
实测一轮 5 份域名报表 + 13 个关键词查询，全程只有最开始那一次启动打印过
`["3%", "33%"]`，跑完拿不到第二个读数。

所以：**按启动时那一个读数给整轮 recon 做预算**，别指望中途还能看到。
真要中途复核，只能额外付一次启动的钱（20–40 秒），值不值自己权衡。

### 行数对不上的两种原因，别混为一谈（2026-08-21 复跑）

上一节的自查——「拿 `rawText` 的记录行数和 `parsed.rows.length` 对一次」——
在复跑里当场抓到了问题，也当场制造了一次假警报。差额有两个来源，方向相反：

| 比较 | 差额说明什么 | 该怎么办 |
|---|---|---|
| `rawText` 的记录行 **>** `parsed.rows.length` | **正则有盲区**，行到手了被你丢了 | 修解析器 |
| 页面自报的总数（`自然搜索排名: N`）**>** `rawText` 里的行 | 行**根本没到你手上**：这些表是虚拟滚动，一次只挂载一部分 | 已知天花板，要全量只能走导出，而导出计入配额 |

复跑同一批域名，两种同时出现：`foziscribe.ai` 14/14、`logomotion.design` 22/22、
`agenton.me` 5/5 与页面自报完全吻合（证明解析器是对的），而 `ezmaker.ai`
解析出 91 行、页面自报 430——那是第二种，`semrush-report.mjs:288` 的注释里
早就写着「页面只渲染前 10 行……想要全量必须走导出」。

**报告时必须说清是哪一种。** 把虚拟滚动写成「解析器修好了」，
等于承诺了一份你并没有拿到的全量数据。

### 两个搜索量数字打架时，别停在「工具不可信」——拿第三个指标闭环（2026-08-22）

`keyword-research` 项目里，同一批日文关键词的搜索量，Semrush 和 seo.web.cafe
（`rankup` skill 记录的另一个工具，见 `rankup/references/seo-webcafe.md`）给出的数字
差了 19–58 倍：

| 词 | Semrush | seo.web.cafe | 倍数 |
|---|---|---|---|
| 悪口診断 | 201,000–246,000 | 4,210 | 约 48–58× |

第一反应是「两边都错过一次，所以谁的数字都不能当绝对值用，只能拿来排序」——
这个结论**当场看似谨慎，实际是错的**，而且错了一周：一个本可以证伪的问题被
当成了不可证伪的问题去搁置。

**方法：换一个测的是不同东西的第三个指标，把两边都摁到算术里。** 搜索量是估算，
但一个域名的**真实访问量**不是估算，是观测。选一个在争议词上排名 #1 的域名，
反推它需要多少次搜索才能撑起观测到的点击量，谁的数字撑不住谁就被证伪。

以 `waruguchi16.jp`（悪口診断系列词的 #1 站）为例，完整算式：

1. **拿真实流量。** Similarweb：`totalVisits` 28 天 55,947 次 → 折合每月约
   59,943 次；`Organic Search` 渠道占比 59.78%。两个数字相乘：
   **59,943 × 59.78% ≈ 35,834 次/月的自然搜索点击**。这里用的是 Similarweb 的
   **渠道占比**，不是总访问量本身——「Similarweb 流量 vs Semrush 流量口径不同」
   （见本文件上方 Similarweb/Semrush role 两节，以及 `SKILL.md` 的 division 表）
   在这里不是要回避的坑，而是**闭环成立的前提**：总访问量里混着直接访问、社媒、
   买量，不能拿来跟自然搜索关键词的搜索量比，必须先用 Organic Search 占比把它
   过滤成「自然搜索贡献了多少访问」，才能跟搜索量做除法。
2. **拿候选站的关键词全库。** 用 Semrush 拉这个域名的 `organic-positions`，
   六个主力词全部排名 #1 附近，量加总 **287,300 次/月**。
3. **除一下。** Semrush 口径下，这个站要撑起 35,834 次点击，隐含点击率
   = 35,834 / 287,300 ≈ **12.5%**。#1 位置的典型 CTR 是 25–35%，12.5% 偏低但
   不是不可能——这个站 94% 流量来自移动端，日文移动 SERP 的广告位和 SERP
   feature 会吃掉大量点击。**判定：Semrush 的量级站得住，可能虚高 2–3 倍。**
4. **反过来验证 seo.web.cafe。** 它给的量比 Semrush 低 48 倍，六个词加总只有
   约 5,985 次/月，而这个站实打实收到 35,834 次自然点击。隐含点击率
   = 35,834 / 5,985 ≈ **599%**——平均每次搜索点了接近六次。**这在算术上不可能，
   证伪。**

**规矩，写成动作而不是提醒：两个搜索量数字差出 3 倍以上时，必须在数字进入任何
决策之前跑完这四步**（选 #1 域名 → Similarweb 拿自然搜索点击 → Semrush 拿该域名
关键词量加总 → 除出隐含 CTR，判断落在合理区间还是超出 100%）。
「两边方法论不同，谨慎使用」这种提醒在真实事故里试过——带着这两个数字的
subagent 依然回报「无法判定」，因为没人告诉它要去做这个除法。提醒不会让人
动手，写成必须执行的检查步骤才会。

**这一步验证的是「量」，不是「意图」。** 一个词哪怕真实搜索量被验证到
20 万/月，如果 SERP 显示搜索者要的东西你根本不卖，这个词照样没用——那是
SERP 构成的问题，不是任何搜索量数字能回答的，见
`rankup/references/webcafe-experiences.md`。

**证伪一个工具的一个功能，不等于证伪它的另一个功能。** seo.web.cafe 的
**搜索量估算**在这次闭环里被证伪了；它的 **SERP 构成读取**（把结果页实际排名
的站点列出来）不含估算模型，读的是页面本身，是目前拿得到的最硬证据，没有被
这次证伪波及。用哪张表做过哪个判断，必须分开记账。

### 闭环的两端不能接在同一个模型上（2026-08-22，独立 checker 抓到）

上一节的闭环之所以成立，是因为**分母来自一个独立信源**：Similarweb 的真实流量
和 Semrush 的关键词量是两家公司各自测的，一边错另一边不会跟着错。

**换一种域名，这个前提就没了。** 同一次调研里遇到一个综合工具站
（`took.jp`，约 10,500 个关键词，BMI 计算器、扑克牌型、彩票模拟器…诊断只是其中
一个工具）。全域闭环在这里没有意义——会把两百个不相关工具的点击混进来。
于是改用 **Semrush 自己的「页面流量份额 %」当分配键**，把真实自然点击摊到那一页上：

```
真实自然点击 66,550/月 × 该页份额 16.07% ≈ 10,700/月
10,700 ÷ 该词 165,000 = 6.5% 隐含 CTR   → 折价后 13–19%，看似过关
```

**但这个「过关」证明不了任何事。** 那个 16.07% 的份额是 Semrush 用它自己的量模型
算出来的，而**该页份额几乎全部由正在被检验的那个词贡献**。如果 165,000 是虚高的，
份额会朝同一个方向一起虚高，分子分母同步放大，**检查照样通过**。

**判据：一个分不清「量是对的」和「量以自洽的方式错着」的检查，不是闭环。**
它只能得出「真实流量没有反驳这个量」，不能得出「真实流量证实了这个量」——
这两句话的强度差得很远，写结论时不能混用。

所以：
- **分配键必须来自被检验模型之外**。拿不到独立的分配键，就承认这个词没做过闭环。
- 报告里给这类结果**单独一个证据等级**（例如 `proxy-only`），不要写成
  `closed-loop-verified` 的括号变体——读者扫表格时看到的是类别，不是括号里的让步。

### KD 显示 null 时，换一个端点再问一次（2026-08-22）

`semrush-keyword.mjs`（关键词概览端点）对一批词返回 `KD: null`，当时记成了
「不知道是真没评分还是页面没渲染完」。**同一次会话拉的 organic-positions 报告里
就有这些词的非空 KD**（陰キャ診断 KD 18、性格の悪さ診断 KD 19）。

这是**端点差异，不是谜**。关键词概览拿不到 KD 时，先去 `semrush-report.mjs
--report organic-positions` 的表里找——那里按词逐行带 KD。把一个能查证的差异
写成「原因不明」，会让后来的人重新花时间查一遍。
