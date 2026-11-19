# OpenCLI 实测记录与低频操作细节

从主 Skill 下沉的原始记录；日常入口和当前决策以 [`../SKILL.md`](../SKILL.md) 为准。

## 入口与脚本沉淀

### 入口案例（历史记录）

本 Skill 是**底层能力**，不是业务流程。用户不会说「用 OpenCLI」，他会说下面左边那些话。
这张表回答的是「这句话该不该落到浏览器上」——**判错方向的代价是拿到看起来正常、
内容却不同的数据**，比慢一轮贵得多。

| 用户大概会这么说 | 该走哪条 | 为什么 |
|---|---|---|
| 「测试/验收自己的网站」「跑 E2E」「截图比对」「走一遍支付测试」 | **用**（`opencli browser`，dedicated 窗口） | 浏览器里的真实页面和操作都从本机 Chrome 验收 |
| 「帮我登录后台查一下」「看我的 GSC / 数据面板」 | **用**（`opencli browser`） | 需要身份。沙箱浏览器要么跳登录页，要么以匿名身份返回**更少的字段、更低的配额** |
| 「这个站没有 API，把表格给我」 | **用**，但先看第四节有没有 adapter | adapter 里封装过的坑，现场驱动要重踩一遍 |
| 「填一下这个表单」「帮我提交」 | **用**，但提交动作归业务 Skill 管 | 本 Skill 只负责把浏览器开对；能不能按提交见 `backlink` 的三道闸 |
| 「打开这个页面看看写了什么」（公开页） | **先不用** | 先问有没有 `curl` / 公开 API。只为读一段公开文本开浏览器是浪费 |
| 「帮我调研一下 X」「搜搜大家怎么说」 | **不用** → `agent-reach` | 它已经做好多平台路由。本 Skill 不做「找信息」，只做「把数据取回来」 |
| 「查这个词的搜索量 / 难度」「看看竞品外链」 | **不用直接开浏览器** → 先进 `rankup` / `backlink` | 那两个 Skill 里已经有现成脚本，直接跑；现写等价实现是本阶梯第 1 级明令禁止的 |
| 「Semrush / Similarweb 上帮我看个数」 | **用，但先读配额纪律** | 见下面「配额站」一节：固定会话名 + 整轮持机器级工具锁。先跑 `node <opencli-skill-dir>/scripts/pressure.mjs --tool semrush` |
| 「开十个 agent 一起抓」 | **不要** | 扇出的单位是 agent，资源却是标签页。采集落盘（`scripts/receiver.mjs`），N 个 agent 读文件，站点侧并发度 0 |
| 「我的标签页被别人抢了」「读回来的页面不对」 | **用本 Skill 排障** | 先怀疑会话撞名，见第三节四条法律 |
| 「浏览器连不上 / doctor 报红 / 命令行为和文档不符」 | **用本 Skill 排障** | 第二节：先看扩展版本，商店版会让每条规则都对不上 |
| 「过一下验证码」 | **半自动** | 把前面全部做完，只把那一下点击留给用户，见第八节 |

**一句话判据**：*无痕窗口打开它，还是不是同一个东西？* 不是 → 必须走用户真实的
Chrome（也就是本 Skill）；是 → 先找 API 或现成脚本。
沙箱浏览器（Playwright / agent-browser / headless）在本机不作为选项，只有用户明确点名时才用。

最小操作示例（选择本地或预览 URL，`state` 返回的输入框引用也可替代 CSS 选择器）：

```bash
opencli browser site-acceptance open http://localhost:3000 --window dedicated
opencli browser site-acceptance upload 'input[type="file"]' /path/to/file.png
opencli browser site-acceptance click --role button --name '提交'
opencli browser site-acceptance network --since 30s
opencli browser site-acceptance screenshot /tmp/site-acceptance.png
opencli browser site-acceptance close
```


---

## 配额站实测与操作细节

### 配额站：法律 1 的唯一例外

有些站**同时加载**会触发上限。实测（2026-08-28）Semrush 大约 3 个标签页同时 load
就出问题，一个个开、中间隔几秒则没事。**受限的是导航事件，不是标签页存在**——
所以它要的不是信号量，是串行加间隔。

而串行 daemon 已经免费给了：同名会话的写会在本机排队。于是配额站的解法是把法律 1
反过来用——**一个站一个固定会话名，不带任何 per-agent 后缀**：

```
semrush-nav        similarweb-nav
```

十个 agent 拿到同一个名字，daemon 就把它们排成一队，Semrush 那边永远只看到
一个标签页在一页页地翻。

**动手前先跑 `pressure.mjs`：**

```bash
node <opencli-skill-dir>/scripts/pressure.mjs --tool semrush
```

它一句话回答「现在动手会不会把事情搞砸」——配额站已经几个标签页、到没到线、
tools-share 锁被谁拿着、那个 pid 还活着吗，然后给 `go` / `wait` / `stale-lock`。
退出码可以直接串起来：`node pressure.mjs --tool semrush && node my-crawler.mjs`。
**它报 `unknown` 时不要当成「没人在用」**——那是「会话列表拿不到」，不是「0 个标签页」。

| 规则 | 为什么 |
|---|---|
| **配额站用固定会话名**，`sessionForUrl(url, base)` 自动判 | 会话名就是并发度。名字固定 = 并发度 1 |
| **一次访问 = 一个 batch**（`openAndExtract`） | 「含任一写操作的混合 batch 整体按写处理」，所以整包是原子的，别人插不进来——这正是共用名字仍然安全的原因 |
| **禁止 open 一次隔几轮对话再读** | 会话一直占着，后面全在排队。实测 daemon.log 一天 1016 条 busy 轮询 |
| **采集写成顺序循环**（`sequentialCrawl`），不要扇出 | 排队是兜底不是调度器：daemon 默认只等 10 分钟，20 个词顺序跑就快贴到上限 |
| **间隔用 `sleepStep()`** | 它生成 `{ cmd: 'wait', args: { seconds } }`，在 batch 中按秒等待 |
| **撞上限的第一动作是 `close`，不是 `sleep`** | 释放标签页本身就是退避。当成「页面没加载好」去重试只会再开一个，越retry越糟 |

**daemon 排队只串行化单条命令 / 单个 batch，保护不了跨多条命令的整轮采集。**
同名会话排队意味着两条命令之间的间隙对别人是敞开的：一轮横跨几十条命令的采集
（poll → 截图 → 滚动循环），任何 poll 间隙里别的工作流都能往同一个固定名标签页
`open` 自己的 URL。实测 2026-08-29 一天抓到 4 次现行接管。所以整轮采集必须**另持
机器级工具锁**（`<user>-tools-share-<tool>.lock`，`pressure.mjs` 报告的就是它），
整轮持有、结束释放——「排队所以安全」只对单条 batch 成立。完整法律与参考实现见
backlink Skill 的 `one-collector-per-quota-tool`（`backlink/SKILL.md`，实现在
`backlink/scripts/ground-truth.mjs`）。

**分析阶段一律不碰配额站。** 采集落盘（`scripts/receiver.mjs`），N 个分析 agent 读文件，
站点侧并发度是 0。这是唯一能让 agent 数量和站点压力彻底解耦的做法——今天那
19 个 `tm-*` 标签页全开在同一个 Semrush 报表上，就是因为扇出的单位是 agent 而资源是页面。

**导航超时不等于页面没开。** 扩展硬编码 15 秒且改不了，Semrush 的重报表经常超。
标签页那时已经建好了，正确反应是先 extract 探活，确认真没内容才在**同一个会话里**
重新导航。`openAndExtract` 已经这么做了；手写的话千万别开新会话去重试。

> Semrush / Similarweb **一个 adapter 都没有**（`opencli list` 里 0 条），所以每次取数
> 都必须开真标签页。想从根上删掉这个问题，就得给最高频的几个报表写 COOKIE/INTERCEPT
> adapter——从日志看是 `analytics/overview`、`keywordoverview`、`keywordmagic`
> （也正好是超时最多的三个：9 / 8 / 5 次）。

## 窗口模式与版本记录

#### `isolated` 曾经有两条限制，两条都已修好

**当前行为（2026-08-24 复测于扩展 1.0.30 + CLI 1.8.7，两条都 PASS）**：
两个 isolated 会话可以并存，`sessions` 里都在、都可读，且都落在自动化自己的独立窗口里
（`win379222152`），与用户窗口（`win379220956`）分开。`isolated` 隔离的是**用户 vs 自动化**，
不是会话之间——会话之间的隔离靠会话名（上面四条法律）和每会话一个的标签页组。

<details>
<summary>修好之前是什么样（留着，因为这两种失败形态会重复出现）</summary>

**一、第二个 isolated 会把第一个静默打掉**（扩展 1.0.27）。
`w1` 开出独立窗口 → 再开 `w2` → `w2` 落回用户窗口，**且 `w1` 整条会话从 `sessions` 蒸发**，
再访问 `session_not_found`，而创建 `w2` 的那一方毫无报错。跨 agent 同样会踩——
一个 agent 开 isolated 就打掉兄弟 agent 已有的那个。

**二、adapter 命令不接受 `isolated`**（CLI ≤ 1.8.7 的某个中间版本）。
报 `--window must be one of: foreground, background`。真因是 adapter 走的是
`src/execution.ts` 里**另一份白名单**，它只列了两个值，而紧挨着的 `src/help.ts`
文案却在宣传 isolated——文档说一套、代码做一套，读起来像用户抄错了参数。

两条的共同点：**失败都不报错，或者报的错指向错误的方向。** 所以下面那条自检值得每次都做。
</details>

背景模式跑的是用户真实的、已登录的 Chrome：`navigator.webdriver` 为 `false`、
UA 不含 `Headless`、`plugins.length` 为 5。
**「后台模式会被反爬识破」不是真问题**，每一项无头特征都是负的。

## 专用窗口与旧版可见性方案

### 专用窗口（扩展 ≥ 1.2.0 / CLI ≥ 1.10.0）

第五种模式 `dedicated`：`OPENCLI_WINDOW=dedicated` 或 `--window dedicated` 显式开启，不配置时默认仍是
`background`，其余四种模式行为逐字节不变。它是"专门给自动化用、但仍在用户**同一个 Chrome、同一份 profile**
里"的窗口——不是另开一个 Chrome 实例，也不是另建 user-data-dir。

**生命周期**：不指定 slot 时自动分配/复用窗口池；`--window-slot`（或 `OPENCLI_WINDOW_SLOT`）可钉住具名窗口，slot 名满足 `^[A-Za-z0-9_.-]{1,40}$`。并发可见的多个会话用各自会话或不同 slot。最后一个租约释放后窗口保留、标签退回占位页，默认空闲 15 秒回收（`OPENCLI_DEDICATED_IDLE_MS` 仍可覆盖；lease 结束时 setTimeout 检查，alarm 与每次获取/创建前的惰性回收兜底）；手动关闭后 slot 被遗忘、其下租约释放，下一条命令按定位规则重建。窗口 id 记在 `chrome.storage.session` 里，支持 MV3 worker 重启。

**定位与窗口池**：显式 bounds > 指定屏幕匹配分格 > 自动跨副屏网格。

默认有副屏/虚拟屏时，自动化窗口只用副屏，不占主屏、不抢焦点；没有副屏才回主屏。池跨所有副屏自动铺开：外接屏优先、按 id 排序，先填满一块屏的动态网格再用下一块，各屏使用自己的工作区坐标（支持负坐标）；自然容量内互不遮挡，全部副屏自然容量用完后才在最后一块屏层叠。层叠窗口可能被 Chrome 判为 `hidden`，懒加载报表要避免超过自然容量。

池上限随显示器自适应（所有自动化副屏 naturalCapacity 之和，下限 4，不再是固定值）；`window status -f json` 的 `pool.capacity` 是当前上限，`pool.naturalCapacity` 是所有自动化副屏的非重叠容量总和，`pool.automationDisplays` 列出各屏 id、name、area 和 naturalCapacity；兼容字段 `automationDisplay` 仅指第一块屏。建议配置大分辨率虚拟屏（如 5120×2880 约 20 格，池上限随之变大）或多块虚拟屏；`--window-display <名称片段>` / `OPENCLI_WINDOW_DISPLAY` 可钉到指定屏，显式指定时沿用匹配屏的旧分格规则，不跨到其他屏。

并行任务直接用各自会话，不提前排队等槽位；池满（`live>=pool.capacity`）时先按空闲时间回收无 holder/lease 的窗口（具名 slot 与 pool-N 都算），全部忙才报 `dedicated-pool-exhausted`，此时等任务释放。扩展改动需在 `chrome://extensions` reload 才生效；reload 会中断正在运行的会话，须等任务空闲再做。

指定屏幕时沿用旧分格：每格 1280×900、按 bounds 裁切，列数 `floor(宽/1280)`、行数 `floor(高/900)`，放得下时 0 号格偏移 `(+80,+60)`，一个 slot 占最低空闲格；扩展通过 `chrome.system.display` 探测屏幕，与 `chrome.windows` 使用同一坐标系。pattern 支持 `/正则/` 或大小写不敏感子串。没匹配到时 `placement.displayFound=false`，已有窗口不挪；不存在的窗口仍可能创建但不定位。自动布局在窗口减少时也重新铺开，工作区不可用则使用 bounds。

**隔离**：会话标签页只活在自己 slot 的专用窗口里，绝不出现在用户窗口——创建时就是
`chrome.windows.create({focused:false, left, top, width, height})`，之后永不聚焦。不是 OpenCLI 开的
"外来标签"（用户拖进来的、Cmd+T 新开的、别的 app 甩过来的链接）一旦出现在专用窗口里，默认策略是
`evict`：移回用户最近聚焦过的普通窗口、在那边设为活动标签，但不聚焦那个窗口；配 `tolerate` 就原地保留，
但这类标签永远不会被当成租约候选。会话本来在专用窗口外的现有租约标签，会被直接 `tabs.move` 挪进 slot
窗口（不刷新页面）。反过来，用户把会话标签页手动拖出专用窗口，这个标签就归用户了——租约释放，标签不关。

**可见性**：autoSelect 默认对 `dedicated` 开启——每条页面相关命令执行前，把该会话的标签设成专用窗口的
活动标签（只调 `chrome.tabs.update({active:true})`，不调 `chrome.windows.update({focused:true})`），不抢 OS 焦点；`OPENCLI_WINDOW_AUTOSELECT=0` 可关闭。自然容量内有利于保持 `visible`；层叠遮挡时，选中标签也不能保证可见。多会话由窗口池跨副屏自动摆格。

**可观测**：两个新的、与会话无关的命令：

```bash
opencli browser window [status] [--slot <name>] [-f table|json]
opencli browser window ensure [--slot <name>] [--bounds x,y,w,h] [--display <pattern>] [--foreign-tabs evict|tolerate] [-f table|json]
```

`status -f json` 给 `supported`、`protocol`、`capabilities`（数组，含 `"dedicated-window"`、`"window-slots"`、
`"window-bounds"`、`"window-display"`、`"auto-select"`、`"foreign-tab-policy"`）、`displays`（每个显示器的
id/name/primary/internal/bounds/workArea；`chrome.system.display` 用不了时是 `null` 并带 `displaysError`）、
`windows`（每个 slot 一条 DedicatedWindowInfo：windowId、exists、state、bounds、placement、onDisplay、
activeTab、标签统计、sessions、autoSelect、foreignTabPolicy、evictedTabs）。`ensure` 会补建缺失的 slot
窗口（占位标签起步）、窗口中心不在目标范围内（bounds 矩形，或匹配到的显示器）就挪过去，返回
`DedicatedWindowInfo & {created, moved}`。`opencli browser sessions` 表格新增 `[dedicated:<slot>]` 标出
会话所属 slot、`*` 标出当前活动标签；json 里对应新增 `dedicatedSlot`、`tabActive` 字段。

**特性检测**：跑 `opencli browser window status -f json`——只有 JSON 能解析、`supported===true`、且
`capabilities` 里有 `dedicated-window`，才算这套扩展支持 `dedicated`。旧扩展对这类未知 op 会直接答一个
"纯数组"的会话列表（这个形状本身就是判据：不是预期的对象），老 CLI 印 help/报错、桥连不上，都一律当不
支持，退回旧路径——桥连不上时打印 `{"supported":false,"reason":"bridge-unavailable",...}` 并 exit 1，
老扩展则打印 `{"supported":false,"reason":"extension-too-old"}` 并 exit 0。

**接口**：`opencli browser` 组新增选项（覆盖同名 env，仅当次调用生效）：`--window dedicated`、
`--window-slot <name>`、`--window-bounds <x,y,w,h>`、`--window-display <pattern>`。adapter 命令能接
`--window dedicated`，但定位（slot/bounds/display）只能走 env，不接受这几个 flag。对应六个 env 变量
（都可选，非法值报错并指名变量）：

| env | 取值 |
|---|---|
| `OPENCLI_WINDOW` | 新增取值 `dedicated` |
| `OPENCLI_WINDOW_SLOT` | slot 名，默认 `default` |
| `OPENCLI_WINDOW_BOUNDS` | `x,y,w,h` 整数（x,y 可负） |
| `OPENCLI_WINDOW_DISPLAY` | 显示器名 pattern |
| `OPENCLI_WINDOW_AUTOSELECT` | `1/0/true/false/on/off`，默认 on |
| `OPENCLI_DEDICATED_FOREIGN_TABS` | `evict` / `tolerate` |

**扩展改完需 reload**：在 `chrome://extensions` 手动 reload 才采用新构建；reload 会中断正在跑的会话，要等任务空闲。新增 `system.display` 权限的升级若未 reload，可能表现为 `displays=null` 并带 `displaysError`。

**待实测（还没验证过，别当结论用）**：
- `chrome.windows.update` 挪动窗口位置这一步，会不会顺带把窗口激活——"不抢焦点"这条还需要专门验证；
- `chrome.system.display` 报的显示器 `name`，和 macOS `NSScreen.localizedName` 是不是一套命名——直接
  决定 `OPENCLI_WINDOW_DISPLAY` 的 pattern 该怎么写；
- 主屏幕熄屏/系统锁屏时，专用窗口和标签选中会是什么行为。

### 要可见又不抢焦点：isolated + 虚拟屏幕 + tab select（2026-09-14 实测）

> 这是**旧版扩展（< 1.2.0）**的手工组合方案。扩展 ≥ 1.2.0 应优先用上一节的「专用窗口」——`dedicated`
> 原生做了同样的事（不抢焦点又保持可见），还带了隔离和可观测性；没升级到 1.2.0 之前，这套手工组合依然
> 有效，留着供参考。

`background` 标签页恒为 `hidden`；`active`/`foreground` 能拿到 `visible`，但窗口一旦被别的应用**完全遮挡**，
macOS 会让 Chrome 把活动标签页也标成 `hidden`（数秒内，rAF 与 IntersectionObserver 停摆），懒加载报表因此不挂载。
以前的补救是 `open -a "Google Chrome"` 抬前台——打断用户。不抢焦点又保持可见的组合：

1. `opencli browser <s> --window isolated open <http(s) 占位页>`：扩展以 `focused:false` 建独立窗口
   （`open` 只接受 http/https，`about:blank` 会报 Blocked URL scheme）；
2. `osascript -e 'tell application "Google Chrome" to set bounds of window id <windowId> to {…}'`：把**这个**窗口
   移到一块没人看的虚拟屏幕上（`windowId` 取自 `opencli browser sessions -f json`）。这条不激活 Chrome；
3. `opencli browser <s> tab select <page>`：让它成为窗口活动标签（同一窗口只有活动标签 `visible`），
   读回 `document.visibilityState` 再导航。

限制：`active`/`background` 单独不行（用户开着窗口时会进用户窗口）；自动化窗口里只要混进一个非 opencli 标签页，
扩展就把它判为借用窗口，下次 isolated 会另开新窗口（默认落在主屏）；只移动确认全是 opencli 标签页的窗口，
绝不移动用户窗口。backlink Skill 的 `scripts/lib-automation-window.mjs` 是这套流程的实现（检测、移窗、恢复、回退）。

---

## 模型驱动实测与限制

### 多层导航、甚至整张表单交给 JEV 挑，agent 不用逐步参与（省 token）

上游 OpenCLI **没有**内置模型驱动浏览器的功能（2026-09-25 核对并已合并上游）。
我们 fork 在 `feat/jev-auto` 分支（2026-09-26，CLI 1.12.0，尚未合入 `fork/main`）加了原生子命令：

```bash
opencli browser "$S" auto --goal "<目标>" \
  [--data payload.json] [--max-steps 20] [--min-confidence 0.55] \
  [--allow-submit] [--confirm-terms] [--dry-run] [--json]
```

给一个目标，每步由 TypeSafe 的 JEV 从当前页面的可点元素 + 待填表单字段里选一个动作
（choice 题型），OpenCLI 执行，循环直到 JEV 判定 DONE、置信度跌破阈值、步数耗尽或
安全闸门触发——全程不需要 agent 逐步参与。`--data` 给一个 JSON 文件，JEV 负责判断
「这个表单字段该填 data 里的哪个 key」（语义匹配，key 名不需要和字段名一致），
但值只能来自这个文件，没匹配到就跳过、不编造。

**安全闸门（默认全部生效，未经显式选项不能绕过）**：

| 闸门 | 默认行为 | 放行方式 |
|---|---|---|
| 提交/支付/发送/删除/确认/创建账号类关键词 + `type=submit` | 从候选菜单剔除，剩下的都执行完就停在 `awaiting_submit` | `--allow-submit` |
| terms/consent/隐私政策复选框 | 整组排除出候选（不是「没匹配就不勾」，是不出现） | `--confirm-terms` |
| CAPTCHA/Turnstile 检测 | 每步零成本 DOM 探针命中即停（`captcha_detected`），不解验证码 | 没有旁路，人工处理 |
| 登录墙检测（`input[type=password]` / `form[action*=login]`） | 命中即停（`login_wall_detected`），不建账号不输密码 | 没有旁路，人工处理 |
| `--allow-submit` 点击命中后的提交结果 | 正反双证据校验（表单是否还在、是否回显了原值、confirmation 文案是否在表单之外），只有双证据判定 `submitted` 才报 `completed`，否则 `submit_unverified` 交人工复核 | 无——JEV 的 noul 判断只作辅助展示，不参与这个分类 |

实测（2026-09-26，会话 `jev-auto-test`）：example.com → IANA Root Zone Management
页 4 步全自动完成（4 次 JEV 调用，4010 输入 token，~5.5s）；httpbin.org/forms/post
真实填表+提交，`custname`/`custtel`/`custemail` 等六个字段用故意不同名的 data key
（`name`→`custname` 之类）全部语义匹配正确，不带 `--allow-submit` 时正确停在
「已填好待提交」，带 `--allow-submit` 提交后页面回显核对一致。CAPTCHA/登录墙/
terms 三道闸在本地测试页与真实站点均按预期拦截。

**已知限制**：`--min-confidence` 的默认阈值对「多个字段都可以先填、顺序不重要」
的长表单偏严——JEV 对着 5-6 个同样合法的候选时，概率会打散到 0.25~0.35，没有
一个单选能过 0.55；`auto` 已经改成「取 JEV 自身 confidence 和候选里所有
fill/select/check 候选累计概率质量两者较大值」来缓解，但仍可能需要按同一个
`--data` 重跑几次（幂等，不会重复填已经正确的字段）才能填完一张字段很多的表单。
文件上传、非原生 `<select>`（Radix/shadcn 一类自定义下拉）、字段映射结果落盘复用
尚未实现，见下方「已知限制与后续方案」。

打字、填表值、提交决策的最终把关仍然是 agent/用户的责任——`auto` 只是把「选哪个
按钮/填哪个字段」这一步的判断成本降到 JEV 的价位。`opencli browser <session> auto`
的完整用法、四道安全闸门、已知限制和设计取舍见
[`references/model-driven.md`](model-driven.md)。

---

## 原生对话框与观测记录

### 原生对话框会把会话锁死，而唯一的解法排不进去

**症状**：某个会话上的调用永不返回，日志里是 `opencli timed out after 60000ms`。

**成因**（2026-08-28 实测跑通整条链）：

```
站点弹一个原生 alert（Semrush 的设备上限就是 alert，不是页面元素）
        ↓
alert 阻塞渲染进程的 JS 线程 → eval 永不返回
        ↓
会话锁被这个挂住的 eval 握着
        ↓
dialog accept ——唯一能清掉 alert 的命令——排在同一把锁后面，轮不到
        ↓
客户端被超时杀掉后，守护进程仍认为它握着锁
（实测 "browser eval (pid 49191) has been driving it for 110s"，而那个 pid 早已不存在）
```

| | |
|---|---|
| **脱困** | `opencli browser <session> close`——同样要排队，但最终会成功，关掉标签页也带走 alert |
| **不要做** | `dialog accept`（排不进去）· 重开一个会话重试（原来那个标签页还挂着） |
| **判据** | 同一会话上连续超时 + `access-report.mjs --suspicious` 里的「超时」行 |

**这把锁不探活。** backlink 那层文件锁会 `process.kill(pid, 0)` 回收崩溃遗留的锁，
守护进程的会话锁不会——所以死掉的客户端会把会话按住一段时间。

**测这件事的时候别用 setTimeout 造 alert**：后台标签页的定时器会被冻结
（`visibilityState: hidden`），回调根本不跑，看起来像「alert 不阻塞」，
其实是 alert 压根没弹。要同步调 `alert()`。

**alert 挡着的时候页面本身仍是 HTTP 200、DOM 齐全**，降级形态只表现为
指标全 `n/a` 和一个没解析的 i18n key `state.undefined`——所以协议层看不出任何异常。

### 守护进程的日志看不见的那一半

它记标签页租额、导航超时、窗口分组——**没有 HTTP 状态码、没有响应体、没有调用方**。
所以有一整类问题它答不了：

| 问题 | 守护进程日志 | `site-access.jsonl` |
|---|---|---|
| 站点限流了吗 | **看不见**（Semrush 限流是 HTTP 200 + 页面里写着已达上限） | 留下 payload 大小和失败痕迹 |
| 哪个路由访问最多（该封 adapter） | 看不见（只记超时，不记成功导航） | 有 |
| 这一串标签页是谁开的 | 只有会话名 | 入口脚本名 + `tag` + 对话 id + pid（会话名在配额站上由站点决定，答不了这个） |
| 哪个报表慢、慢多少 | 看不见 | p50 / p95 |

`scripts/opencli-core.mjs` 每次浏览器调用追一行 JSONL 到
`~/.opencli/logs/site-access.jsonl`。**纯观测，不改行为**——不判限流、不退避、不重试，
只留证据。关掉用 `OPENCLI_ACCESS_LOG=0`。

调用方归属自动记：`script` 字段取入口脚本名，不需要任何配合。`OPENCLI_ACCESS_TAG=<任务名>`
是它上面一层，给**跨脚本的一轮任务**打标（比如一轮悬赏调研跑了五个脚本），
报告里 tag 优先于脚本名。

```bash
node <opencli-skill-dir>/scripts/access-report.mjs --since 2h
node <opencli-skill-dir>/scripts/access-report.mjs --suspicious   # 挑限流样本
node <opencli-skill-dir>/scripts/access-report.mjs --degraded     # 只看 detectDegradation 判出的那一类，带证据
```

**限流的自动判据在 `opencli-core.mjs` 的 `detectDegradation(pageText, meta)`**，
是个纯函数，`openAndExtract` 每次拿到 eval 结果都会过一遍，不止在重试耗尽时才看。
规则表（`DEGRADATION_RULES`，在文件最顶上，方便直接加一行）按站点分：

| kind | 站点 | 判据 | 来源 |
|---|---|---|---|
| `degraded-render` | 仅 Semrush | 页面文本同时出现未解析的 i18n key `state.undefined` **和** 3 处以上 `n/a` | 实测 2026-08-28 |
| `device-limit` | Semrush / Similarweb | 配额站上出现原生 `dialog`（`captureSample` 的 `dialog accept` 拿到文案）；命中「maximum...devices」「already logged in...device」等已知措辞时证据里标出来，没命中也照样判定，只是证据里说明「未命中已知列表，建议人工复核」 | 实测（弹窗存在）+ 措辞未逐字记录 |
| `rate-limit` | 任意站点 | 命中「you've reached your limit」「rate limit exceeded」「too many requests」等固定短语 | 文档整理，尚无实测样本 |
| `auth` | 任意站点 | 命中「please sign in to continue」「your session has expired」等登录态失效短语 | 文档整理，尚无实测样本 |

判定为 `degraded` 之后**不自动重试、不自动退避**——`openAndExtract` 把结果包成
`{ degraded: true, kind, evidence, result }` 返回给调用方，同时在
`site-access.jsonl` 里追一行带 `degraded_kind` / `evidence` 字段的记录，
并调用 `captureSample(session, reason)` 留原文样本。调用方拿到 `degraded`
标记之后自己决定：换路由、报给人看、还是就此放弃；这一层依然是纯观测，
不替调用方做决定。

新站点或新措辞出现时，直接在 `DEGRADATION_RULES` 里加一条：`siteKeys` 留空
表示所有站点适用，写成数组就只在列出的配额站 key 上生效（比如 `device-limit`
只在配额站上生效，因为普通站弹一个 `confirm`/`alert` 太常见，拿它当限流证据
会大量误判）。`rate-limit` / `auth` 目前是按文档整理的固定短语，还没有实测样本
校准过，命中之后建议先用 `--degraded` 看一眼证据再决定要不要收紧或放宽。

出事那一刻的原文会自动取样存进 `~/.opencli/logs/samples/`（`openAndExtract`
判定 degraded、或重试耗尽时都会触发，也可以自己调 `captureSample(session, reason)`）。
取样是三级降级，每级都带短超时：先 `dialog accept`（**原生 alert 的文案只有这里
拿得到**，顺手清掉它），再 `eval` 取页面原文，都不行就把诊断本身写下来。
第一版只会 `eval`——而在最需要它的场景里 eval 自己就挂住了，见上一节。

**为什么 `bytes` 不够、必须留原文**：限流、设备上限、降级渲染全是
**HTTP 200 + DOM 齐全**，只是数据没来。2026-08-28 实测抓到一次 Semrush 的
降级形态——标题正常是 `Dashboards`，指标全是 `n/a`，页面上还留着一个
没被解析的 i18n key `state.undefined`。光看 `bytes` 分不出它和一次正常的小响应。

`--suspicious` 的判据留四类，每类都说得出为什么值得看：真失败（排除测试桩
和 Node 警告这类已知噪音）、超时、配额站上「成功但几乎没内容」（bytes 判据，粗）、
以及 `degraded_kind` 非空的行（`detectDegradation` 读了页面原文之后判出的
结论，比 bytes 判据细，两者会有重叠，不去重）。
第一版判据是「失败或 eval 且 bytes < 200」，实测标出 601/1080 行——
**判据太松等于没有判据**，没人会去翻一份 55% 都是可疑的清单。收紧后是 2 行；
加上 `detectDegradation` 之后是 4 行。
