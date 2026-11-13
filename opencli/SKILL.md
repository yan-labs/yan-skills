---
name: opencli
description: 当用户要用本机已登录 Chrome 操作或验收网页（含测试自己的站、E2E、截图）、读取登录后台、抓取无 API 的数据、填表，或排查 OpenCLI doctor、会话、adapter 故障，或明确提到 opencli、浏览器自动化、标签页被抢时使用。公开文本先用 HTTP；话题调研交 agent-reach；SEO 与选词决策交 rankup；外链选点、提交与 Semrush、Similarweb 报表判读交 backlink；本 Skill 只负责浏览器驱动、会话与取数机制。
metadata:
  version: "1.8.2"
---

# OpenCLI

OpenCLI 把任意网站、Electron 桌面应用和外部 CLI 收敛成一条 `opencli <site> <command>`，
再加一条 `opencli browser <session> <command>` 用来现场驱动浏览器。

它走的是**用户本机那个真实的、已登录的 Chrome**（浏览器扩展 + 本地守护进程），
不是无痕实例、不是沙箱。这一个事实决定了本 Skill 里几乎所有规则。

本 Skill 面向的是我们自己维护的 fork（`yan-labs/OpenCLI`），和上游 `jackwener/opencli`
有差异，差异清单见 [`references/our-fork.md`](references/our-fork.md)。

---

## 零、选入口与沉淀

验收入口：[`scripts/accept.mjs`](scripts/accept.mjs)。例如：
```bash
node <opencli-skill-dir>/scripts/accept.mjs --url http://localhost:3000/ --url /pricing --widths 1440,390 --height 900 --out /tmp/site-accept
```

**验收三铁律**：①只用 OpenCLI 驱动真实 Chrome，不用 Playwright、Firefox/Nightly 或沙箱浏览器；②固定验收做成脚本，只输出摘要，截图落盘；③能力缺口必须明说：新扩展支持真实 console/pageerror 捕获与持续 viewport set/reset，模板探测能力并验证读数；旧扩展 console 空返回不能当无错误，viewport 回退同源 iframe 并记录原因；外域只能检测记录，暂不能阻断。详见 [`references/browser-driving.md`](references/browser-driving.md#验收三铁律)。

外站瞬时失败：同 URL 约隔 5 秒重试，最多 5 次；仍失败标「无法验证」，继续其他项。用户在远程控制时少让他动手：他要做的步骤（如登录）先打开页面、填好非敏感字段、放大到看得清，只留最后一下；密码和验证码由用户本人输入。

OpenCLI 负责用户真实 Chrome 中的页面操作和数据获取；调研主题先进 `agent-reach`，SEO / 外链决策先进 `rankup` / `backlink`。公开文本先用 `curl` 或公开 API；需要登录态、截图、E2E、填表或浏览器实测时用本 Skill。提交决策归业务 Skill。浏览器只用用户本机已登录的 Chrome；沙箱浏览器（Playwright / agent-browser / headless）在本机不作为选项，含测试自己的站、E2E、截图，只有用户明确点名时才用。

按顺序找：现成项目或 Skill 脚本 → HTTP API → `opencli <site> <command>` adapter → `opencli browser <session>` → 确需复用时写 adapter。先用 `opencli list`、`opencli <site> --help` 查现有能力；不要重走已经有脚本的链路。配额站先读第三节并运行 `scripts/pressure.mjs`。

**硬规则：跑通即沉淀成脚本，是完成条件，不需要用户督促。** 现场驱动浏览器是最贵的操作，**同一条链路绝不允许让 agent 手工走第二遍**：

1. **开浏览器之前**先查有没有现成脚本或 adapter：`opencli list` / `opencli <site> --help`、本 Skill `scripts/`、rankup `scripts/`（GSC 收录、移除、导出）、backlink `scripts/`（Semrush/Similarweb）。有就直接跑；跑不通就**修脚本**，不许绕开它重新手点。
2. **没有现成的，边驱动边记录**。满足任一条就必须沉淀：会再做一次、换个参数就要重跑、驱动超过约 5 步、同一串命令手敲了 2 次以上。第一次跑通后当场整理成参数化脚本（`.mjs`，调用 `opencli browser` / batch，用 try/finally 归还会话）：SEO 取数归 rankup、外链和竞品归 backlink，各放进那个 Skill 的 `scripts/`；通用站点能力写成 opencli adapter 或放本 Skill `scripts/`；只属于某个项目的放 `<project>/.rankup/scripts/`。脚本头部写清用途、参数、登录态依赖、已知坑（页面懒加载、行数上限、配额）和验证日期。
3. **写完用真实参数跑一次**，跑通才算沉淀。
4. **交付报告必须有「## 沉淀的脚本」一节**：写脚本路径和验证命令；没有可沉淀的，写「无，理由：…」。缺这一节，任务判为未完成，主线程会打回。
5. 写脚本可以按全局派单规则交给第三方模型（Codex 等），但「必须沉淀」的责任在当前执行者，不能甩掉。

入口案例见 [`references/field-notes.md`](references/field-notes.md#入口与脚本沉淀)。

最小浏览器闭环：

```bash
opencli browser site-acceptance open http://localhost:3000 --window dedicated
opencli browser site-acceptance state
opencli browser site-acceptance screenshot /tmp/site-acceptance.png
opencli browser site-acceptance close
```

---

opencli 自带的 chatgpt adapter 在新版页面读不到回答；需要网页 ChatGPT 问答时，用 [agent-fleet](../agent-fleet/skill/SKILL.md#网页版-chatgpt-通道) 的 `fleet web start/say/close/list`（`chatgpt-web-ask.mjs`）：不限轮次，默认留页，用完显式 close。

## 一、开工前：doctor

```bash
opencli doctor
```

`doctor` 只诊断**浏览器桥**（守护进程 + 扩展 + Chrome 连线）。
`PUBLIC` / `LOCAL` 策略的 adapter、`opencli list`、外部 CLI 透传都不需要它绿。
`COOKIE` / `INTERCEPT` / `UI` 策略和所有 `opencli browser *` 才需要。

### 行为和这份文档对不上时，第一件事是查扩展版本

**本 Skill 描述的默认行为全部住在扩展里**——扩展 1.5.x 起默认 dedicated，`opencli browser` 与 adapter 命令
默认使用不抢焦点的专用窗口；background 要显式指定，不切走活动标签页、每个会话一个以会话名命名的标签页组、
`--window isolated`、`sessions` 报 windowId / groupTitle / windowFallbackReason。
装成 Chrome 应用商店那个版本的话，**每条命令都照样成功，只是行为回到上游**：
默认前台、自己开一个窗口、抢走用户正在看的标签页、`isolated` 被忽略。

**这类失败没有报错，只有「怎么和文档说的不一样」。** 所以：

| 观察到 | 该做什么 |
|---|---|
| 命令成功但窗口/焦点行为与本文档不符 | 跑 `opencli doctor`，看 `Extension` 那行的版本 |
| 版本 < 1.0.33 | **告诉用户他装的是应用商店版**，需要换成 [yan-labs 的 Release](https://github.com/yan-labs/OpenCLI/releases/latest) 里的 zip，并把商店版移除或停用 |
| `doctor` 自己就报了这条 | 照它说的做——它会打印下载地址和加载步骤 |
| `frames` 对明明存在的跨源 iframe 返回 `[]`，不报错 | 扩展 < 1.1.0 没有 OOPIF 支持。已随 v1.9.0-yan.2 发布，装新 Release 的 tgz 并 reload 扩展即可，见第十节 |
| `frames`/`contexts` 正常，但 `eval --frame`/`--context` 面板开合几次后静默读到主页面 | 扩展 1.1.0 的已知回归，1.1.1 已修复（`frame_not_attached` 错误码判据）。见 [`references/our-fork.md`](references/our-fork.md) |

`doctor` 会在扩展低于 1.0.33 时主动报这个问题，**不要跳过它的输出**。
改过扩展源码（或刚拉了新构建）之后要在 chrome://extensions 里对 OpenCLI 点 **reload**——
没 reload 时 Chrome 跑的仍是旧版，`doctor` 会提示已加载版本低于最低要求，那不是装错，是没 reload。

红了先看 [`references/troubleshooting.md`](references/troubleshooting.md)。
排障的第一步永远是 **`npm ls -g @jackwener/opencli` 确认 CLI 是发布版还是本地源码 link**——
这一步决定后面是查代码还是查环境，跳过它会浪费一整轮。

**`doctor` 前两行绿、第三行红**是一个特定信号：守护进程和扩展这两个组件都活着，
坏的是它们之间那条命令路径，重启守护进程通常没用。

---

## 三、会话纪律：本 Skill 最贵的一节

`opencli browser <session>` 里的 `<session>` **就是标签页的所有权声明**。
同名会话共用同一个标签页，不同名之间互不干扰。所以「我的标签页被别人抢了」
最常见的成因是：**两个任务挑了同一个会话名**。

OpenCLI 1.8.7 的守护进程会保护同一 profile + surface + session：第二个**并发写**
会留在本机排队，每 2 秒检查一次；前一个任务结束后自动继续，不把 `session_busy` 交给
外层 Agent，避免它立即重试。排队检查只访问本机 daemon，不会访问目标网站；首次等待会
明确打印占用者、等待原因和下次检查时间。默认最多等 10 分钟，超时会说明命令尚未发往
Chrome/目标网站，并要求不要立即重试。读操作仍可并行；含任一写操作的混合 batch
整体按写处理。

这只串行化同一时刻的写入。两个任务顺序或交替复用同名会话，仍会操作同一个标签页，
随后读到对方打开的页面，所以唯一会话名规则不变。

这把锁也不管站点账号的并发与限速。数据源脚本若同一账号不能并发，仍要自己加全局锁。

### 四条法律（完整实测数据见 [`references/session-laws.md`](references/session-laws.md)）

| # | 法律 | 一句话理由 |
|---|---|---|
| 1 | **一个会话一个标签页；N 个页面就要 N 个会话名** | 三个 agent 各用独立名字：跨 agent 抢占 0 次。共用 `work`：3 / 12 / 2 次，其中一个每次读都读错。**唯一例外是配额站，见下一节** |
| 2 | **不要用 `tab new` / `tab select` / `open --tab` 在一个会话里放多个页面** | 三个都**静默**失败：命令报成功，下一次读回错误的页面。一次三 agent 运行把用户的 Chrome 从 11 个标签页涨到 30 个孤儿页 |
| 3 | **绝不硬编码会话名** | `opencli browser --help` 的第一个例子就是 `work`，抄它的人全撞在一起 |
| 4 | **开工前一次性把要用的会话全部开好、handle 全部拿到，再进工作循环** | 边创建边使用会把理论上的竞态变成可复现的竞态 |

**法律 1 保护的是标签页身份，不是站点的服务端状态。** 所有会话共用同一个 Chrome
profile 和同一个登录身份，所以如果站点把「当前选中的项目/客户」存在服务端会话里，
一个标签页切换目标，其它标签页刷新后会跟着变——会话名分得再开也拦不住。
**判据：在站点里切换目标之后 URL 变不变？** 不变就先验证再并行，
细节见 [`references/session-laws.md`](references/session-laws.md)。

### 自动回收与临时保活

browser 会话默认空闲 10 分钟自动回收；释放后的空白占位窗口在 15 秒内关闭。
在飞命令也有硬上限：默认 10 分钟，命令自身 timeout 更长时尊重该 timeout；
卡死超过上限会在回收检查时被强制释放。`OPENCLI_INFLIGHT_MAX_MS` 可覆盖默认上限（正整数毫秒）。

```bash
opencli browser captcha-help open https://example.com --keep-alive
opencli browser long-review --idle-timeout 1800 open https://example.com
opencli browser captcha-help close
```

`--keep-alive` 取消空闲回收；`--idle-timeout <秒>` 设置正整数秒数。两者也可放在会话名与子命令之间。
`OPENCLI_BROWSER_IDLE_TIMEOUT` 兼容秒数，也接受 `never`；命令行参数优先于环境变量，再是默认值。
两个命令行参数不要同时用；`close` 和 `opencli browser cleanup` 都能释放保活会话。

仅在等用户人工过验证码、需要长时间挂着的人机协同页、或配额站连续采集间需要保留页面的短暂停顿时使用；
除此之外几乎都不该用。**使用者负责最终 `close`**。brief 或脚本使用 keep-alive 时，
必须在报告里写明会话名与原因；**子 agent 默认不得使用，必须由主线程在 brief 中明确授权**。

用 `opencli browser sessions` 查看占用者、`[keep-alive]` 标记和回收剩余时间（JSON 有 `keepAlive`、`idleDeadlineAt`）；
用 `scripts/orphan-windows.mjs` 只读检查空白窗口残留。

### 配额站例外

Semrush / Similarweb 等同账号限额站使用固定的站点会话名，并且**一次访问放进一个 batch**；单条 batch 由 daemon 串行，跨多条命令的整轮采集还要持有 `yan-tools-share-<tool>.lock`。不要让多个 agent 并行采集：一个采集者顺序抓取并落盘，分析者读文件。开工前先运行：

```bash
node <opencli-skill-dir>/scripts/pressure.mjs --tool semrush
```

`unknown` 表示无法读取会话列表，不能当作零占用。配额站受限时先 `close` 释放标签页；导航超时先在原会话 `extract` 探活。固定名、锁、间隔及实测依据见 [`references/field-notes.md`](references/field-notes.md#配额站实测与操作细节) 和 [`references/session-laws.md`](references/session-laws.md)。

### `$$` 在脚本里安全，在 Bash tool 里不安全

这是我们踩过的真实事故，必须区分：

| 场景 | `$$` / `process.pid` 行为 | 正确做法 |
|---|---|---|
| **Node 脚本**（一个进程跑完全程） | 整个生命周期同一个 PID，安全 | `` let session = `ahs-${process.pid}` `` |
| **Claude Code 的 Bash tool** | **每次调用都是新进程，PID 不同** | 用**描述性字面常量**（`naver-birthstone`、`bing-check-mysite`），或 `S=$(uuidgen \| cut -c1-8)` 存进文件再读回 |

已验证事故（2026-08-23）：sub agent 用 `S="naver-bs-$$"` 连续调用 OpenCLI，
每条命令都创建了新会话（新空白标签页），上一条打开的页面被遗弃。
agent 看到的永远是空白页，以为页面没加载好不断重试，最终泄漏 9 个会话。

**名字要描述工作**，不只是唯一：`backlink-probe-<后缀>` 胜过 `bl-1`。
会话名是唯一存在的标识符，一个唯一但无意义的名字仍然回答不了「这是谁的标签页」。

JS 里不要手搓后缀，用 `scripts/opencli-core.mjs` 的 `defaultSession(base)`；
**Bash 里 `source scripts/session.sh` 然后 `S=$(oc_session <base>)`**——出事的那批
会话全是从 Bash tool 直接发出去的，压根没经过 JS 那个助手。

两边都有一道守卫会**拒绝**以 3~6 位数字结尾的会话名（`guardSessionName` /
`oc_guard_session`），因为那就是 `$$` 展开后的形状。这个失败原本不报错，
只表现为「页面怎么老是空的」，所以必须让它当场红。

### 用完必须还回去

```bash
opencli browser <session> close     # 释放这一个
opencli browser sessions            # 看现在还有谁活着，以及各自在哪个窗口
opencli browser cleanup             # 释放**全部**——只有主线能跑，见下
```

**Sub agent 必须在 finally 块或退出前显式 close 自己的会话**——崩溃时不会自动清理。

**`cleanup` 是主线专用。** 它释放的是**这台机器上全部**的租约，不是「我的」——
sub agent 跑它会把兄弟 agent 正在用的标签页一起关掉，
而那些 agent 只会看到自己的页面莫名其妙不见了。留着的会话在用户 Chrome 里就是一个标签页，看起来和别人正在做的活儿一模一样。

**父级收尾用差集回收，不要用 `cleanup`：**

```js
const before = await snapshotSessions();      // 扇出前存快照
// ... 扇出 ...
await reconcileSessions(before, { prefix: 'tm-' });   // 只关自己那批
```

它能收掉崩溃的 sub agent 留下的标签页，一个兄弟的都不碰。
**`prefix` 或 `sessions` 必须给**——否则它只报告不动手，因为「快照之后新出现的」
里面也包含兄弟 agent 同期开的会话，无差别关掉就退化成了 `cleanup`
（实测一次 dry-run 就混进了一个别人的 `sweep2-*`）。

差集也比 idle alarm 快：实测 2026-08-28 有 31 个标签页是靠 idle 自己掉的，
在它掉之前用户的标签栏一直是脏的。

### 五个窗口模式，默认已经是不打扰的那个

| `--window` | 行为 | 什么时候用 |
|---|---|---|
| `background` | **须显式指定**。在用户当前那个 normal 窗口里开标签页，不抬窗口、不切活动标签页。**显式指定 background 时，`opencli browser` 与 adapter 命令（`opencli <site> …`）都是这样**——1.0.33 起 adapter 不再自己开窗口 | 几乎所有情况 |
| `active` | 把标签页设为它所在窗口的活动标签（扩展只调 `chrome.tabs.update({active:true})`，不调 `chrome.windows.update({focused:true})`），不抬 OS 窗口，标签页不被节流。**落点和 `background` 一样**：用户开着自己的 Chrome 窗口时，标签页会被放进用户窗口，于是会切走他正在看的标签页；窗口被别的应用完全遮挡时仍读成 `hidden` | 要"选中/可见"又不能抢 OS 焦点，且确认用户没在用那个窗口；要稳定可见见下面「要可见又不抢焦点」 |
| `foreground` | 抬起窗口（`chrome.windows.update({focused:true})`，把 Chrome 带到 OS 前台）并选中标签页 | **只有**需要用户亲自完成验证码、或他明确说要看着的时候 |
| `isolated` | 后台，但不在用户那个窗口里——自动化自己的独立窗口（多个 isolated 会话共用这一个独立窗口，各自仍是自己的标签页组） | 长时间批量作业，不想在用户标签栏里堆东西 |
| `dedicated` | **扩展 1.5.x 起默认**，不抢焦点。具名 slot 的专用窗口：`focused:false` 创建，永不聚焦；autoSelect 默认让会话标签在每条命令执行前都变成该窗口的活动标签（`visible`）；不是 OpenCLI 开的"外来标签"默认会被移出（evict） | 长时间批量作业，或者懒加载报表需要真正渲染出来，但又不能打扰用户正在用的窗口 |

标志位置在**会话名和子命令之间**（放在子命令后面也能工作）：

```bash
opencli browser <session> --window isolated open "https://..."
```

放在会话名**前面**会报 `unknown command: <你的会话名>`，读起来像装坏了，其实是语法错。

`dedicated` 的完整生命周期、定位、隔离、可观测细节见下面「专用窗口」小节。

**需要扩展 ≥ 1.0.33**（`opencli doctor` 那行就是判据）。旧扩展上默认仍是前台、
`isolated` 会被静默忽略——那正是下面那张表里的坑。

**`background` 只在借不到 normal 窗口时才新建窗口**，并把原因记下来：
`opencli browser sessions` 那一行尾部显示 `[new window: <reason>]`（JSON 里是 `windowFallbackReason`）。

| reason | 意思 |
|---|---|
| `no-normal-window` | Chrome 一个普通窗口都没开（只剩应用窗口、弹窗，或干脆没窗口） |
| `all-incognito` | 有窗口，但全是无痕窗口——无痕的 cookie 不是用户的登录态，不借 |
| `all-owned` | 有窗口，但全是我们自己建的（比如只剩一个 isolated 窗口） |
| `query-failed` | 问 Chrome「有哪些窗口」这一步本身失败了 |

browser 与 adapter 都借不到时只建**一个**替身窗口共用；用户之后开了自己的窗口，新会话会跟过去。
这个字段为 null 就是落在用户自己的窗口里，或者是用户自己要的 `isolated`。

旧版 `isolated` 的两种故障、版本与复测记录见 [`references/field-notes.md`](references/field-notes.md#窗口模式与版本记录)。需要判定当前版本，运行 `opencli doctor`，再比较 `opencli browser sessions` 中默认与 `isolated` 的 `windowId`。

### 绝不抢用户的浏览器焦点

**这台机器上的 Chrome 是用户正在用的那一个。** 抢焦点不是「体验略差」，
是直接打断他手上的活——他正在打字或看页面，窗口被抬起来、标签页被切走。

| 错误做法 | 正确做法 | 为什么错 |
|---|---|---|
| `--window foreground`（除非用户要亲自操作） | 什么都不加（扩展 1.5.x 起默认 dedicated，不抢焦点）；只取数也使用 dedicated 专用窗口 | 实测会把用户的**活动标签页切走**（从第 1 个跳到第 3 个）。2026-08-23 那次测量里最前端**应用**不变；但之后的扩展在建标签页租约时会 `chrome.windows.update({focused:true})`，2026-09-13 起有用户反馈被反复抬到前台——「foreground 不换前台应用」已经不成立，别再据此放行 |
| 调 adapter 时用前台「方便看页面」 | `--keep-tab true` + `screenshot` / `state` | 调试是高频动作，一轮能打断十几次。标签页留着，用户想看自己切过去 |
| 在旧扩展（< 1.0.33）上省略 `--window background` | 先看 `doctor` 的扩展版本；旧版就每条命令都显式带 | 旧版两层默认都是前台，省略等于每条命令都抬一次窗口 |
| 给 `PUBLIC` / `LOCAL` 命令加 `--window` | 不加 | 它们不接受这个标志，会报 `unknown option '--window'`；这类命令本来也不开浏览器 |
| 崩溃后不清理，留下一堆孤儿标签页 | `finally` 里 `close` | 泄漏的会话在用户窗口里就是一堆莫名其妙的标签页，比抢一次焦点更烦 |

**实测（2026-08-23，macOS + Chrome）**：后台模式下 `open` / `eval` / `screenshot` /
`click` / `type` 全程——用户窗口的**活动标签页索引不变**，标签数在 `close` 之后回到基线，
页面侧 `document.hasFocus()` 恒为 `false`、`visibilityState` 恒为 `hidden`。
**同一台机器上换成 `--window foreground`，活动标签页立刻从第 1 个被切到第 3 个。**

**这条推翻了本 Skill 到 2026-08-22 为止的旧结论「两种模式都不抢焦点」**——
旧测量只查了「最前端应用」（前台模式下它确实不变），漏掉了「活动标签页」这一轴。
完整对照表见 [`references/session-laws.md`](references/session-laws.md)。

> **这条曾经是坏的，2026-08-23 修好了**。当时 `--window isolated`
> 不新开窗口，行为与 `background` 一模一样，于是文档写下了「没办法把 agent 的标签页
> 挪出用户窗口」。真因是四层各自静默地否决它：运行时白名单只认两个值把 `isolated`
> 丢掉了；「这窗口是不是我的」靠猜（全是非 http 页面就算我的）而把用户随手开的空窗口
> 认成了容器；窗口建对了之后分组收敛又把标签页搬回用户窗口；以及挑「用户在哪个窗口」
> 用了 `focused`，而 Chrome 不在最前面时所有窗口的 `focused` 都是 false。
> **每一层都不报错**，所以每修一层都以为好了。

**怎么确认自己拿到的是修好的版本**：`opencli doctor` 的 Extension 那行 ≥ 1.0.33；
再跑 `opencli browser <s> --window isolated open <url>` 之后 `opencli browser sessions`，
它那一行的 `windowId` 应该与显式 `--window background` 会话的不同；background 借到用户窗口时**没有** `[new window: …]`。

### 专用窗口与可见性

| 场景 | 必须用 | 禁止 |
|---|---|---|
| 只取数、不需要页面真正渲染 | 必须显式 `--window background` | 禁止加 foreground / active |
| 网站验收、截图、E2E、懒加载报表需要真渲染 | 必须用 `--window dedicated` | 禁止手写 `--window-slot`、`--window-display` 指向主屏、手算位置 |
| 看手机 / H5 版式 | 必须用 `--window dedicated --half` | 禁止靠改 bounds 宽度模拟 |
| 需要指定窗口宽高（如 390 / 1360 视口对比） | 必须用 `--window dedicated --window-bounds 0,0,<宽>,<高>`：仅当 bounds 与用户当前屏有重叠时才转为自动宫格并采用格子尺寸；未转为 auto 的显式 bounds 保留宽高，0,0 不保证迁移，见表后例外 | 禁止把 left/top 写成主屏以外的坐标来“挑位置”（挑位置交给宫格） |
| 多个页面需同时可见 | 必须每个页面各用一个独立会话名，各自 `--window dedicated` | 禁止一个会话里 tab new / tab select |
| 用户要亲自过验证码 | 必须用 `--window foreground`，并告诉用户去哪个标签页点什么 | 禁止其他任何情况用 foreground |
| 配额站（Semrush/Similarweb 等） | 必须固定站点会话名 + 一次访问一个 batch（沿用本 Skill 配额站一节） | 禁止并行多开 |

显式 bounds 与用户当前屏有重叠时才转为自动宫格，尺寸跟随格子，不再长期保留迁移前的宽高。自动化屏幕集合固定为全部非主屏，按外接/虚拟屏优先、id 数值顺序排列；没有可用非主屏时才用主屏。鼠标所在屏只影响新窗口选屏偏好，其他自动化屏还有空槽时优先用其他屏，否则照常用鼠标屏。用户当前屏在负坐标副屏时，`0,0,…` 若与用户当前屏完全不相交，原 bounds 会被保留，窗口可出现在主屏。当前屏探测不可用时以主屏为迁移判断的备用。
出现主屏位置时先看 `window status -f json` 的 `placement.source`、`relocatedFrom` 和当前屏是否就是主屏，再结合屏幕数量判断；需要迁移却未迁移时再查扩展版本是否 ≥ 1.5.3。

`dedicated` 用专用 slot 窗口保持页面可见，适合懒加载报表、网站验收和截图；仍使用用户同一 Chrome 与登录态。扩展 ≥ 1.2.0、CLI ≥ 1.10.0；先用 `opencli browser window status -f json` 确认 `supported` 和 `dedicated-window` capability。用 `--window-slot` 将需同时可见的会话分开；窗口定位、环境变量、外来标签策略和旧版 `isolated` + 虚拟屏方案见 [`references/field-notes.md`](references/field-notes.md#专用窗口与旧版可见性方案)。

自动网格由每块屏幕自己的 workArea 分辨率计算，目标尺寸接近 1280×900，最小 900×620（屏幕本身更小时退化），最大优先控制在 1600×1100；若整数分格无法同时满足上下限，优先保证最小尺寸和铺满工作区。格子无大间隙，与当前窗口数无关。例如 5120×2850 是 4×3 格、约 1280×950；2560×1440 是 2×2 格、1280×720；1512×949 是 1×1。窗口持久占用「displayId + tileIndex」固定槽位，行优先从左上开始，先填满一块屏再填下一块（鼠标屏的新建偏好例外）；优先复用最小空槽。开关窗口不会移动或缩放其他窗口，鼠标移动也不会迁移已有窗口。所有屏的格子用完后才在最后一块屏层叠；层叠窗口可能被 Chrome 判为 `hidden`，懒加载报表要避免超过自然容量。

自动放置窗口（`placement.source==='auto'`）会在屏幕变化、每条命令获取/创建窗口前以及约 30 秒 alarm 时串行对账；拖离槽位会归位，最大化、全屏、最小化会先恢复 `normal` 再归位，不传 `focused`。屏幕重建或移除时只迁移失去屏幕的窗口，分辨率变化时更新该屏格子。显式 bounds / display 放置不受自动对账影响。`opencli browser window relayout` 可立即对账并显示旧位置→新位置；`-f json` 返回 `windows[]` 的 `old`、`new`（各含 bounds/state）、`displayId`、`tileIndex`、`changed` 和可选 `error`。

默认空闲 15 秒回收，`OPENCLI_DEDICATED_IDLE_MS` 可覆盖；lease 结束时 setTimeout 检查，alarm 与每次获取/创建前的惰性回收兜底。池上限是所有自动化屏格子数之和，下限 4；`window status -f json` 的 `pool.capacity` 是上限，`pool.naturalCapacity` 是非重叠容量总和，`pool.automationDisplays[]` 列出各屏 id、name、area、naturalCapacity、`cols`、`rows`、`tile: {width,height}`，可直接看每屏 cols×rows 和格子大小；整除余下的像素补到边缘格子。兼容字段 `automationDisplay` 仅指第一块屏，`windows[]` 保留 tileIndex 并增加 `displayId`、可选 `reconciledAt`（最后完成归位或首次对齐的时间，毫秒时间戳）。两块 5120×2850 工作区共 24 格。`--window-display <名称片段>` / `OPENCLI_WINDOW_DISPLAY` 仍沿用匹配屏的旧分格规则，不跨到其他屏。

并行任务直接用各自会话，不提前排队等槽位；池满（`live>=pool.capacity`）时先按空闲时间回收无 holder/lease 的窗口（具名 slot 与 pool-N 都算），全部忙才报 `dedicated-pool-exhausted`，此时等任务释放。扩展改动需在 `chrome://extensions` reload 才生效；reload 会中断正在运行的会话，须等任务空闲再做。

```bash
opencli browser <session> --window dedicated --window-slot <slot> open <url>
opencli browser window status -f json
opencli browser window relayout -f json
```

**自动选屏与半宽**：CLI 探测鼠标所在屏，仅给新窗口分配提供偏好，不改变自动化屏幕集合。已有窗口的屏幕和格子固定，不因鼠标变化或其他窗口开关重排。主屏仅在没有可用非主屏时作为候选。`placement.excludedDisplayBounds` 保留作兼容字段，不再表示鼠标屏被排除出集合；以 `windows[].displayId` 和 `pool.automationDisplays[]` 为准。调用方无需手算格子或位置。以上固定网格、自愈与 relayout 属于待合并的 `feat/window-layout` 行为，须在主线程验收并启用对应构建后使用。

要看手机 / H5 版式时加 `--half`：窗口仍占一个完整格位，宽度只有格宽的一半，靠格内左侧；会话结束归还池后自动恢复整宽，`window status` / `window list` 的 `half` 字段可查。其余情况不要加。这只缩窗口宽度，不模拟手机 UA、触控或 DPR。

```bash
opencli browser <session> --window dedicated --half open <url>
```

---

## 四、发现能力：不要背命令表，去问

有 160+ 站点 adapter，数量每周都在变。**任何写死在文档里的清单都会过期**，
所以本 Skill 不列它们。

```bash
opencli list                       # 按站点分组的表格
opencli list -f json               # 机器可读，agent 用这个
opencli list | grep -i twitter     # 找某个站
opencli <site> --help              # 这个站有哪些命令
opencli <site> <command> --help    # 位置参数、专属标志、输出列
```

`opencli list -f json` 每条给 `{site, name, aliases, description, strategy, browser, args, columns}`。
**`strategy` 决定要不要浏览器**：

| strategy | 需要什么 |
|---|---|
| `PUBLIC` | 什么都不要，纯 HTTP |
| `COOKIE` | Chrome 已登录该站 + 装了扩展；命令从活会话里取凭据，不用重新登录 |
| `INTERCEPT` | 同上，另外会开一个自动化窗口截取签名请求 |
| `UI` | 同上，完整 DOM 交互 |
| `LOCAL` | 不要浏览器，连本地/开发端点 |

**在退回裸 `opencli browser` 之前，先查一下有没有 adapter 已经覆盖了这个工作流。**
在高频改版的登录站上尤其值得——adapter 里封装过的坑，现场驱动要重踩一遍。

### 通用标志（多数 adapter 命令有，浏览器相关的那几个例外）

| 标志 | 作用 |
|---|---|
| `-f, --format <fmt>` | `table`（TTY 默认）· `yaml`（非 TTY 默认）· `json` · `plain` · `md` · `csv`。**agent 基本都要 `-f json`** |
| `--trace <mode>` | `off`（默认）· `on` · `retain-on-failure`。排障和写 adapter 时用 |
| `-v, --verbose` | 调试日志 + 失败栈 |
| `--window <mode>` | `background`（须显式指定）/ `active` / `foreground` / `isolated` / `dedicated`（扩展 1.5.x 起默认；语义见上面「五个窗口模式」）。`dedicated` 的定位/隔离参数（slot、bounds、display）走 env 或 `--window-slot` / `--window-bounds` / `--window-display`，不是这个标志本身管。**`PUBLIC` / `LOCAL` 策略的命令不接受它**——加了直接报 `unknown option '--window'`，读起来像装坏了，其实是这类命令根本不开浏览器（实测 342 个 public + 25 个 local 命令）。先看 `strategy` 再决定加不加 |
| `--site-session <mode>` | `ephemeral`（默认）/ `persistent`。**同一站点批量调用一律 `persistent`**：复用 `site:<x>` 一个标签页、已在域内就跳过站点根预导航；默认模式每次新开标签页并先导航站点根，看起来像「一直刷新首页」。见 [session-laws](references/session-laws.md#site-session) |
| `--keep-tab <bool>` | 结束后是否保留标签页租约 |

---

## 五、现场驱动：最小闭环

```bash
S="recon-pricing"            # 描述性常量，Bash tool 里不要用 $$
opencli browser "$S" open "https://example.com/pricing"
opencli browser "$S" state                       # 拿到带 [N] 编号的快照
opencli browser "$S" click 7
opencli browser "$S" wait selector "[data-loaded]" --timeout 15000
opencli browser "$S" state                       # 页面变了就必须重新 state
opencli browser "$S" close
```

四条心智模型，够用来读懂所有返回：

1. **选择器优先的目标契约**：每个交互命令接受**一个** `<target>`，要么是 `state`/`find`
   给的数字 ref，要么是 CSS 选择器。多个匹配时用 `--nth <n>` 消歧。
2. **每个信封都报 `matches_n` 和 `match_level`**（`exact` / `stable` / `reidentified`）。
   CLI 已经替你救回了中等程度的 DOM 漂移，`match_level` 告诉你该有多信。
3. **先要紧凑输出，需要时再要全量**：`state` 是预算感知的快照；`network` 先给形状预览，
   再用 `--detail <key>` 取单条 body。吐一个巨大的 payload 等于白烧上下文。
4. **错误是机器可读的**：失败返回 `{error: {code, message, hint?, candidates?}}`。
   **按 `code` 分支，不要匹配消息字符串。**

完整命令表、目标契约、compound 表单控件、成本表、配方与坑，见
[`references/browser-driving.md`](references/browser-driving.md)。

### 三条最常被违反的规则

- **动手之前先看。** 先 `state` 或 `find`。数字 ref 是**每次快照独有的**，
  绝不要跨会话凭记忆写死。
- **页面变了就重新 `state`。** 导航、表单提交、SPA 路由切换都会让旧 ref 失效——
  失效还算好的，更糟的是 `reidentified` 到新页面上一个形状相似的元素。
- **一般页面的 `eval` 用于读取，并包 IIFE。** 本环境 eval 上下文跨调用持续，
  重复声明会抛错**且那次调用根本没执行**。要改页面就用 `click`/`type`/`select`/`keys`，
  它们有结构化输出和指纹，`eval` 没有。扩展注入 iframe 的特殊交互见下节。

### 跨源 iframe：2026-09-11 起真的能用了

跨源 iframe（含**别家浏览器扩展注入的侧边面板**——它通常就是 shadow root 里的一个
`<iframe src="https://<厂商域>/">`）现在可以 `frames` 列出、`eval --frame N` 直接读写 DOM，
**不需要剪贴板、不需要按坐标点截图**。需要扩展 ≥ 1.1.0；低于它 `frames` 静默返回 `[]`。

三条反直觉的前提：扩展热键要用 `eval` 派发合成 KeyboardEvent（`browser keys` 到不了
扩展那一层）、iframe 里的 React 按钮要派发 pointer/mouse 完整序列（`.click()` 无效）、
**恢复面板绝不 reload 页面**（reload 后拿不到 frame target，opencli 会静默退回主页面执行）。

用法、`frames --debug` 排障表、实测参考脚本见
[`references/browser-driving.md`](references/browser-driving.md) 的「跨源 iframe 与扩展注入面板」。

### batch：一次调用跑多步

固定序列（open → wait → eval）**一律用 batch**，它复用一条 Page 连接，
省掉每条命令各付一次的连接—解析—拆除开销。

```bash
opencli browser "$S" batch --commands '[
  {"cmd": "open", "args": {"url": "https://example.com"}},
  {"cmd": "wait", "args": {"selector": ".loaded", "timeout": 10000}},
  {"cmd": "state", "args": {"source": "dom"}}
]'
```

返回 `{cmd, index, ok, result?, error?}` 数组；默认遇错继续，`--stop-on-error` 改为中止。
修复版 CLI 任一步 `ok:false` 或 fill `verified:false` 整条命令退出非零，`index` 指出失败步；旧版可能退出 0，脚本仍须检查每步结果。截图参数用 `{path, width, height, fullPage, annotate}`。
**条件逻辑**（每一步决定下一步）用顺序调用，不要硬塞进 batch。

### 模型驱动 `auto`（仅在已安装版本支持时）

截至 2026-09-26，`auto` 记录于尚未合入 `fork/main` 的 `feat/jev-auto` 分支；先查 `opencli browser <session> --help`，不要把它当作已发布能力。支持时可给 `--goal`、`--data` 做多步导航或填表；提交需显式 `--allow-submit`，验证码和登录墙停给人工。用法、闸门、实测和已知限制见 [`references/model-driven.md`](references/model-driven.md) 与 [`references/field-notes.md`](references/field-notes.md#模型驱动实测与限制)。

---

## 六、取数与落盘

### 页面里没有 API 时的取数顺序

1. **`network`** —— 页面的数据如果来自 JSON 接口，**接口几乎总比渲染后的 DOM 可靠**。
   先 `network` 看形状，再 `--detail <key>` 取那一条。
2. **`extract`** —— 长文正文，返回带 `next_start_char` 游标，循环到它为 `null`。
3. **`eval`** —— 前两者都不合适时的定点提取。
4. **滚动抓表** —— 兜底手段，不是默认手段。**开抓之前先花一分钟找那个免费导出按钮**。

### 抓之前必须知道的三个坑

- **同名控件陷阱**：同一个报表上常并排放着两个名字高度相似的导出控件，一个走付费配额、
  一个免费导当前页，行为完全相反。**凡是要写下「某功能不可用」，先确认你点的不是同名的另一个控件。**
- **同一个工具里不同报表的导出模型可以完全不同。** 在 A 报表验证出「只能一页页导」，
  不构成 B 报表的结论。每换一个报表，重新看一眼导出面板。
- **导出触发器常常是 `<svg>` 图标**，没有 `.click()` 方法，要 `closest('button,[role=button],a')`
  往上找真正的按钮；面板异步挂载要**轮询等按钮出现**，不要用固定 sleep 或坐标点击。

### 落盘：抓到的数据不许留在下载目录

**首选本地接收端**：起一个只监听 `127.0.0.1` 的服务，让页面 `fetch(..., {method:'POST'})`
把数据直接送进项目目录。它一次性消掉四个问题——不用等文件落齐、不用归并重名副本、
不受下载目录权限影响、不占对话上下文。

**接收端的端口不能写死成常量**，理由和会话名不能写死完全同构：两个项目同时开工时，
第二个实例 `EADDRINUSE` 起不来，而后台常驻的常见写法会把输出丢进 `/dev/null`——
**这个失败是完全静默的**，随后页面的 `fetch` 照样返回 200，打到的是**另一个项目的接收端**。

完整的落盘 SOP（接收端写法、等齐判据、重名归并、manifest 校验）见
[`references/data-extraction.md`](references/data-extraction.md)。

---

## 七、坏了怎么办

**出问题之后回来查证据**：守护进程的日志按类落在 `~/.opencli/logs/`，
`opencli daemon logs`（默认 errors）/ `commands` / `extension` / `daemon`，
支持 `-n` 与 `--grep`。它从守护进程的下一次启动开始记，之前的没有留下来。

原生 alert 可能让 `eval` 和同会话的 `dialog accept` 一起排队超时；遇到连续超时先看 `access-report.mjs --suspicious`，按 [`references/field-notes.md`](references/field-notes.md#原生对话框与观测记录) 的步骤处理。守护进程日志不包含 HTTP 状态码或响应体；`scripts/opencli-core.mjs` 另记 `site-access.jsonl`，用下面的报告看路由、调用方和降级证据：

```bash
node <opencli-skill-dir>/scripts/access-report.mjs --since 2h
node <opencli-skill-dir>/scripts/access-report.mjs --suspicious
node <opencli-skill-dir>/scripts/access-report.mjs --degraded
```

`degraded` 是观察结果，不等于自动重试；原始判据、取样和局限见同一参考文件。

| 症状 | 先看哪里 |
|---|---|
| `doctor` 红、`session_not_found`、守护进程/扩展问题 | [`references/troubleshooting.md`](references/troubleshooting.md) |
| 刚 `daemon restart` 过，扩展就连不上了 | service worker 睡死了：`open -g -a "Google Chrome" "https://example.com"` 唤醒。再重启守护进程没用，见 [`references/troubleshooting.md`](references/troubleshooting.md) |
| 读回来的页面不是你导航过去的那个 | **先怀疑会话撞名**，再怀疑站点或 CLI。诊断顺序见 [`references/session-laws.md`](references/session-laws.md) |
| `selector_not_found` / `stale_ref` / `click` 成功但没反应 | [`references/browser-driving.md`](references/browser-driving.md) 的排障表 |
| `opencli <site> <command>` 因为站点改版失败 | 用 `--trace retain-on-failure` 拿证据，按 [`references/adapters.md`](references/adapters.md) 的自修复流程改 adapter |

**自修复的硬停条件**（不要改代码）：`AUTH_REQUIRED`（叫用户去 Chrome 里登录）、
`BROWSER_CONNECT`（叫用户跑 `doctor`）、验证码 / 限流。修复预算最多 3 轮。

**「空」不等于「坏」。** `EMPTY_RESULT` 常常不是 adapter 的 bug：平台会在反爬启发式下
主动降级结果，站点也会用 HTTP 200 + 空 body 代替真正的 404。换个查询词、
在普通标签页里肉眼看一下，能复现再进修复流程——否则你是在给一个正常的 adapter 打补丁。

---

## 八、人机验证：自动化到最后一步

遇到 CAPTCHA、短信验证码这类无法自动化的节点，**把前面所有能自动完成的步骤全部做完**——
表单填好、选项选好、页面打开好——只把那一下点击留给用户，并明确告诉他
**现在浏览器里哪个标签页、需要点什么**。

不要把整条 SOP 甩回给用户，也不要在回复里写一串「请前往 https://…，然后输入…」。
目标是让用户的操作量从「一整套流程」降到「一次点击」。

---

## 九、参考文件

| 文件 | 什么时候读 |
|---|---|
| [`references/session-laws.md`](references/session-laws.md) | 会话/标签页出问题时；多 agent 并行开工前 |
| [`references/browser-driving.md`](references/browser-driving.md) | 要现场操作页面：点击、填表、等待、读取、截图 |
| [`references/data-extraction.md`](references/data-extraction.md) | 要把数据取回来并落盘：network / extract / 抓表 / 接收端 |
| [`references/adapters.md`](references/adapters.md) | 要写一个新 adapter，或修一个坏掉的 adapter |
| [`references/troubleshooting.md`](references/troubleshooting.md) | `doctor` 红、连不上、命令报的错自相矛盾 |
| [`references/drivers.md`](references/drivers.md) | 有人问「为什么不用 X」；或 OpenCLI 这条路确实走不通 |
| [`references/our-fork.md`](references/our-fork.md) | 命令在别人机器上不存在；升级/同步上游前 |
| [`references/field-notes.md`](references/field-notes.md) | 需要低频命令细节、旧版故障和实测原始记录 |

### 自带脚本

| 脚本 | 干什么 |
|---|---|
| `scripts/appfigures.mjs` | Appfigures 公开应用概览，支持 product ID / URL 与顺序批量；输出月份、地区、下载/扣费后收入估计、新评分与访问状态；已登录时可读商店关键词表（以 `--help` 支持的报表为准）。`--help` 查看参数；product ID 不是 Apple App ID，收入区间和缺失值不会伪装成精确数。 |
| `scripts/opencli-core.mjs` | 给 JS 调用方的最小封装：`defaultSession()` / `sessionForUrl()` 生成安全的会话名、`openAndExtract()` 把一次访问打包成原子 batch、`sequentialCrawl()` 顺序采集带间隔、`reconcileSessions()` 差集回收、`sleepStep()` 真睡眠、`batchBrowser()` / `openAndEval()` 包住 batch |
| `scripts/session.sh` | Bash tool 侧的同一套：`oc_session <base>`、`oc_session_for <url>`（配额站自动收敛）、`oc_guard_session` 拒绝 `$$` 形状的名字 |
| `scripts/pressure.mjs` | **开工前的自查：现在能不能动手。** 配额站各有几个标签页（分「我的 / 共享 / 别人的」）、到没到线、tools-share 锁被哪个 pid 拿着多久、那个进程还活着吗，裁决 `go` / `wait` / `stale-lock` / `unknown` 并给出具体动作。`--tool <key>` 只看一个工具，`--json` 机读，退出码 0/2/3/4 可以直接当闸门。**陈旧锁只报告不删**——删别人的锁比等更危险 |
| `scripts/daemon-restart-safe.mjs` | 重启守护进程的安全版：有采集任务在跑就拒绝（`--force` 可强行），重启后确认桥真的回来，没回来就唤醒 service worker |
| `scripts/access-report.mjs` | 读 `site-access.jsonl` 做复盘：按路由看频次与 p50/p95、按调用方看是谁开的标签页、`--suspicious` 挑可疑行、`--degraded` 只看 `detectDegradation` 判出的限流/降级 |
| `scripts/orphan-windows.mjs` | 只读诊断专用窗口残留：对照 Chrome 里的空白 `about:blank#opencli-dedicated=<slot>` 窗口与 `window status`，分 `held` / `idle-ok` / `idle-overdue`（回收失效）/ `untracked`（扩展不认识，不会自动回收）；有后两类时退出码 2。不关任何窗口 |
| `tests/quota-sites.test.mjs` | 上面那些护栏的纯函数测试，不碰浏览器：`node --test opencli/tests/quota-sites.test.mjs` |
| `tests/pressure.test.mjs` | `pressure.mjs` 的纯函数测试，会话列表和锁状态全部注入，不碰浏览器 |
| `scripts/receiver.mjs` | 本地接收端：页面把数据 POST 进项目目录，绕开下载目录。端口按项目根派生、占用即崩、`/ping` 回报 root、`/script` 按白名单喂提取器源码 |

```bash
node <opencli-skill-dir>/scripts/receiver.mjs --root . --out data/<主题>/raw
```

**不要每次重写接收端。** 自己写的版本十有八九会漏掉「端口占用时必须崩」这一条，
而那一条漏了的后果不是崩溃，是数据静默写进另一个项目的目录。

## 十、安装与更新

```bash
npx skills add yan-labs/yan-skills --skill opencli -g -y
npx skills update opencli -g -y
```

OpenCLI 本体分两半，**两半都要装我们的构建**，来源是
[yan-labs/OpenCLI 的 Release](https://github.com/yan-labs/OpenCLI/releases/latest)：

```bash
# 1) CLI
npm i -g https://github.com/yan-labs/OpenCLI/releases/download/v1.9.0-yan.3/opencli-cli-1.9.0-yan.3.tgz

# 2) 浏览器扩展：下载 opencli-extension-v*.zip 解压，
#    chrome://extensions → 开启开发者模式 → 加载已解压的扩展程序
#    ⚠️ 先移除或停用 Chrome 应用商店那个 OpenCLI

# 3) 验证：三行都要 [OK]，Extension 那行的版本 ≥ 1.0.33
opencli doctor
```

**为什么不能用应用商店那个版本**：本 Skill 描述的默认行为——扩展 1.5.x 起默认 dedicated，background 须显式指定、
browser 与 adapter 默认用不抢焦点的专用窗口、不切走用户活动标签页、每会话一个标签页组、
`--window isolated`、`sessions` 报 windowId / groupTitle / windowFallbackReason——
**全都只存在于我们的构建里**。商店版默认是前台，装了它本 Skill 的规则会与实际行为不符。
两个同时装还会一起连上守护进程互相打架。

**CLI 1.9.0 / 扩展 1.1.1**（跨源 iframe 支持、`frames --debug`、`browser <会话> clipboard`，
以及扩展 1.1.1 修复的 OOPIF eval 路由——面板反复开合后 `eval` 静默落回主页面的已知回归）
已随 **v1.9.0-yan.3** 发布，见 [`references/our-fork.md`](references/our-fork.md)。如果
`frames --debug` 报 `unknown option`，说明全局装的还是旧 tgz，`npm i -g` 上面那个新 URL
即可；扩展侧记得在 `chrome://extensions` reload，装好后照第 3 步验证 `doctor` 打出的版本号。

差异清单见 [`references/our-fork.md`](references/our-fork.md)。

**改过扩展源码之后必须在 `chrome://extensions` 手动 reload 一次**才生效——
CLI 侧的改动重启守护进程即可，扩展侧的不会自动生效。**`opencli doctor` 打印的扩展版本
就是判据**：它显示什么，加载的就是什么。

### X 搜索与免费原帖追溯

`node scripts/x-research.mjs read POST_URL --depth 1`：通过免费 FxTwitter 公共接口读取已知帖子及回复父帖，不使用 Chrome Cookie；引用帖随响应一起精简。depth 默认 0，最多 3；遇到错误即停，不自动重试。

`node scripts/x-research.mjs search 'QUERY' --scrolls 0`：OpenCLI 打开真实 Chrome 搜索页，只读 DOM，输出精简 JSON；默认仅当前已加载一屏，最多滚动 3 次。不是完整搜索全集，父帖 ID 未知保留 null，外链可能仍为 t.co。网页自身仍会请求 X，不能规避账号限速。不要对已受限账号连续运行。

2026-09-17 验证：FxTwitter 回复→父帖、引用帖和游戏外链成功；Chrome 实页显示“出错了”，正常搜索 DOM 提取尚待账号恢复后验收。page_error 不等同已确认 HTTP 429。运行离线检查：`node tests/x-research.test.mjs`。
