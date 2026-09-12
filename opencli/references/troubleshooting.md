# 排障：桥接、守护进程、扩展

`doctor` 红、连不上、命令报的错自相矛盾时读这一篇。

页面层面的错（`selector_not_found`、`stale_ref`）在
[`browser-driving.md`](browser-driving.md)；标签页归属问题在
[`session-laws.md`](session-laws.md)；adapter 因站点改版失败在
[`adapters.md`](adapters.md)。

---

## 先跑 doctor，并且知道它管什么

```bash
opencli doctor          # -v 看详细
```

它诊断的**只是浏览器桥**：守护进程 + 扩展 + Chrome 连线。

| 需要 doctor 绿 | 不需要 |
|---|---|
| `opencli browser *` 的一切 | `opencli list` / `validate` / `verify` |
| `COOKIE` / `INTERCEPT` / `UI` 策略的 adapter | `PUBLIC` / `LOCAL` 策略的 adapter |
| | 外部 CLI 透传（`opencli gh`、`opencli docker`……） |

正常输出是三行 `[OK]`：Daemon / Extension / Connectivity，外加 profile 列表。

### 脚本里不要用 doctor 的文案当判据

三行全 `[OK]` 时 doctor 会在结尾打一句 `Everything looks good!`，
**但只要存在任何 `Issues:`（比如扩展版本偏低），那句话就不再打印**——
桥其实完全可用。

已验证事故（2026-08-24）：一个脚本用 `stdout.includes("Everything looks good")`
决定走不走 OpenCLI，doctor 因为扩展版本提示而漏掉那句吉祥话，脚本**静默降级**
到了公开 RSS 路径——输出少了两列字段，不报任何错，看起来只是"这个源就这些字段"。

**判据要用结构化的行**，例如 `[OK] Connectivity`；
或者干脆直接跑一条真实命令，失败了按 error code 分支。

---

## 事后要证据：守护进程的日志

**问题往往是事后才发现的**——在另一个任务里跑坏了，回过头来查时那个终端早没了。
守护进程会把每次派发、超时、断连，以及扩展转发上来的消息落盘，
按类分在 `~/.opencli/logs/` 下：

```bash
opencli daemon logs                 # 默认读 errors —— 排障第一站
opencli daemon logs commands        # 出问题的命令：超时、派发失败、结果因断连丢失
opencli daemon logs extension       # 扩展转发上来的消息（[ext] ...）
opencli daemon logs daemon          # 生命周期：启动、关闭、扩展连接与断开
opencli daemon logs errors -n 50 --grep "timed out"
opencli daemon logs --path          # 日志目录，想自己 grep 时用
```

**分四个流是有意的**：读日志时你每次只想回答一个很窄的问题，
挤在一个流里会逼你把全部内容读进来——慢，而且对 agent 来说很贵。
`errors` 故意与各分类重复，几 KB 换掉「先知道哪一类坏了才能开始查」。

两条边界：

- **只从守护进程的下一次启动开始记。** 之前发生的事没有留下来。
  没有日志时它会告诉你路径和 `opencli daemon restart`。
- **`commands` 只记失败**——守护进程没有逐条成功日志，一行一条会把真正要看的失败埋掉。
- 需要页面级证据（DOM 快照、网络、截图）要另外开 `--trace`，见下面的自修复入口。

日志里会出现 URL 和会话名，不含凭据。

---

## 三层，从下往上查

```
Chrome + OpenCLI 扩展
        ↕  WebSocket
本地守护进程（默认端口 19825）
        ↕  HTTP（带 X-OpenCLI 头，裸 curl 会 403）
opencli CLI
```

```bash
opencli daemon status       # PID、版本、运行时长、内存、端口、扩展连接状态
opencli daemon restart      # 会断开扩展，扩展应自动重连
opencli profile list        # 已连接的 Chrome profile
opencli browser sessions    # 当前活跃的租约
```

守护进程的 HTTP 接口要求 `X-OpenCLI` 头，直接 `curl http://127.0.0.1:19825/status`
会返回 `403 Forbidden: missing X-OpenCLI header`——**这是正常的，不是故障**。

---

## 症状表

| 症状 | 大概率原因 | 修法 |
|---|---|---|
| `Extension: not connected`，**而且刚重启过守护进程** | service worker 睡死了，靠自己醒不过来 | `open -g -a "Google Chrome" "https://example.com"` 给它一个事件，见下节。**先试这个**，别急着重装 |
| `Extension: not connected` | 扩展没装 / 被禁用 / Chrome 没开 | 从 [Release](https://github.com/yan-labs/OpenCLI/releases/latest) 下载 zip 解压后在 `chrome://extensions` 加载已解压的扩展程序，确认 Chrome 在跑。**不要装应用商店版** |
| 行为与本 Skill 描述不符（默认前台、`isolated` 无效） | 装的是应用商店版或旧构建 | `opencli doctor` 看 Extension 版本，< 1.0.32 就换成 [Release](https://github.com/yan-labs/OpenCLI/releases/latest) 里的 zip |
| `attach failed: chrome-extension://...` | 别的扩展抢 CDP | 临时禁用 1Password 一类占用 CDP 的扩展 |
| Daemon 版本比 CLI 老 | 升级后没重启 | `opencli daemon restart` |
| `unknown command: <你的会话名>` | `--window` 放在了会话名**前面** | 挪到会话名和子命令**之间** |
| 每条命令都 `session_not_found` | 见下一节 | |
| 改了扩展源码但行为没变 | Chrome 加载的还是旧构建 | `chrome://extensions` 里手动 reload；**CLI 侧改动重启守护进程即可，扩展侧不会自动生效** |
| 读回来的页面不是你导航的那个 | 会话撞名 | 先 `opencli browser sessions` 看有没有别人的名字 |
| `frames` 返回 `[]`，页面上明明有跨源 iframe | 扩展 < 1.1.0，没有 OOPIF 支持，**而且它是静默的** | `opencli doctor` 看 Extension 行；够 1.1.0 了再跑 `frames --debug` 看 `attachedEventCount` / `autoAttachError` |
| `No iframe target found … Candidates: none` | 同上；或者页面刚 reload 过，新 iframe 在 load 阶段附着，拿不到 target | 别 reload 恢复面板，用 toggle 关再开。详见 [`browser-driving.md`](browser-driving.md) 的「跨源 iframe 与扩展注入面板」 |
| `unknown option '--debug'`（跑 `frames --debug` 时） | 该选项已随 **v1.9.0-yan.2** 发布；全局装的仍是旧 tgz | `npm i -g https://github.com/yan-labs/OpenCLI/releases/download/v1.9.0-yan.2/opencli-cli-1.9.0-yan.2.tgz`，再 `opencli daemon restart`。见 [`our-fork.md`](our-fork.md) |

---

## `session_not_found`：先确认你在跑哪个构建

这个错误的正常含义是：**你对一个还不存在的会话执行了不带 URL 的命令**
（`state`、`eval`、`click`……）。这是一道有意加的护栏，
挡的是「会话名每次调用都不一样 → 制造一堆孤儿空白标签页」那个坑
（见 [`session-laws.md`](session-laws.md) 法律 3）。正常修法就是先 `open` 一个 URL。

**但如果挂掉的是 `open` 本身，提示就自相矛盾了**——它叫你去做的正是失败的那件事。
这时不要照着提示打转，按下面的顺序走。

### 第一步：确认 CLI 是从哪来的

```bash
opencli --version
npm ls -g @jackwener/opencli
```

`npm ls -g` 的输出指向一个**本地路径** → CLI 是从源码 link 过来的，
**行为等于那个仓库的当前构建**，版本号说明不了什么。
指向 `node_modules` 里的实体目录 → 跑的是发布版。

**这一步决定后面往哪查，跳过它会浪费一整轮。**

### 情况 A：本地源码构建（我们的 fork）

优先怀疑最近的提交引入了回归。

```bash
cd <npm ls -g 指出的路径>
git log --oneline -10
git status --short
```

**已验证的一次回归（2026-08-23，我们的 fork）**：护栏用「这条命令带没带 URL」
来推断「这是不是导航命令」，误杀了三类天生不带 URL 的调用——
`open` 自己（它先开网络捕获再导航）、`doctor` 的 `evaluate('1 + 1')` 探针、
以及所有走浏览器的 adapter 租约（`COOKIE` / `INTERCEPT` / `UI`）。
症状就是 `doctor` 前两行 `[OK]`、Connectivity FAIL，`open` 报 `session_not_found`。
已在 `af08a636` 修复，护栏收窄到只管 `opencli browser <session>` 这条用户通道。

`git log` 里没有这个提交就 `git pull` 一下；有了还挂，说明是**另一个**回归，
按同样的思路去看最近改过 `src/browser/`、`src/cli.ts`、`extension/src/` 的提交。

### 情况 B：npm 发布版

上面那段与你无关。按常规的桥接故障查：

1. **扩展的连接是不是幽灵记录**——Chrome 关过、service worker 被回收，
   守护进程那边的注册还在。**重启 Chrome 或在 `chrome://extensions` reload 扩展**，
   不是重启守护进程（`doctor` 说它是 OK 的）。
2. **profile 不匹配**——扩展挂在一个 profile 上，CLI 默认走另一个。
   `opencli profile list` 看有几个，用显式 profile 再试一次。
3. **跑着两个守护进程 / 陈旧的 socket 与 pid 文件**——CLI 连 A、扩展连 B。
   这条专门解释「`daemon restart` 为什么没用」。
4. **CLI 与扩展版本错配**——升级了一边没升另一边。

每做一步重跑一次 `doctor`，别一次改三样。还不行就 `opencli doctor -v` 看详细，
用它区分「请求根本没发出去」和「发出去了没人回」。

### 这次事故留下的通用判据

- **`doctor` 前两行绿、第三行红**，说明守护进程和扩展这两个**组件**都活着，
  坏的是它们之间那条命令路径。重启守护进程通常没用——它正是唯一确认健康的那个。
- **提示信息在逻辑上自相矛盾时，先确认你在跑哪个构建**，再决定是查代码还是查环境。

## `daemon restart` 之后扩展不会自动重连

**这是重启守护进程的隐藏代价，实测踩到过一次，浏览器自动化断了 16 分钟。**

扩展是 MV3 的 service worker，Chrome 会在闲置约 30 秒后把它杀掉，靠事件唤醒。
守护进程一重启，那条长连接就断了——而**断开本身不是一个能唤醒 service worker 的事件**。
于是它就一直睡着，`doctor` 一直是 `[MISSING] Extension: not connected`，
Chrome 明明开着，扩展明明装着。

实测（2026-08-28，扩展 1.0.32）：重启后连续两次 `opencli daemon restart` 都没能让它回来，
扩展日志整整 16 分钟一个字都没有。

**唤醒方法是给 Chrome 一个导航事件：**

```bash
open -g -a "Google Chrome" "https://example.com"   # -g 不抢焦点
```

实测 8 秒后 `Connected to daemon`，`doctor` 三行恢复全绿。

| 做法 | 结果 |
|---|---|
| 再 `daemon restart` 一次 | **没用**——重启的是守护进程，睡着的是扩展 |
| 等它自己醒 | 实测 16 分钟没醒 |
| **给 Chrome 一个导航事件** | **8 秒重连** |
| 去 `chrome://extensions` 手动 reload | 也行，但要人动手；上面那条不用 |

**所以任何自动重启守护进程的脚本，重启之后必须验一次 `doctor`，红了就唤醒再验。**
少这一步的后果不是脚本报错，是**它后面所有的浏览器操作都在一个没有桥的守护进程上跑**，
每一条都失败，而失败原因看起来跟当时在测的东西有关——那次踩到时，
一个本来该验证会话锁的测试报了 FAIL，其实跟锁毫无关系。

**重启守护进程之前先看有没有活儿在跑。** 它会打断所有在飞的浏览器命令。
`pgrep -f '<你的采集脚本名>'` 或 `opencli browser sessions` 都能判断；
配额站上打断一个跑了一小时的采集，等于白烧一小时配额。

## adapter 的自修复入口

```bash
opencli <site> <command> --trace retain-on-failure 2>trace-error.yaml
```

失败时 stderr 会多一个 `trace` 块，`summaryPath` 是入口。完整流程见
[`adapters.md`](adapters.md) 的「修」那一节。

**两个硬停条件**：`AUTH_REQUIRED`（叫用户去登录）和 `BROWSER_CONNECT`（叫用户跑 doctor）
——这两个都**不要改代码**。

---

## 收工清理

```bash
opencli browser sessions     # 还有谁活着
opencli browser cleanup      # 释放全部并关掉它们的标签页——主线专用
```

**Sub agent 必须在 finally 块或退出前显式 `close` 自己的会话**——崩溃时不会自动回收。
**但 sub agent 不能跑 `cleanup`**：它释放的是全部租约，会把兄弟 agent 正在用的
标签页一起关掉，而那些 agent 只会看到自己的页面莫名其妙不见了。
留下的会话在用户 Chrome 里看起来和别人正在做的活儿一模一样，
而且下一个任务如果撞上同名，会直接读到这个残留页面。

## 「TLS 握手被切断」/ `ERR_CONNECTION_CLOSED`：先查 DNS 是不是 fake-IP

**这条能省一整轮，而且它的错误结论特别贵**——很容易被写成「这个站不可达」结案。

已验证事故（2026-08-23）：某站被判定「环境级不可达」——apex 域 TLS 握手直接被切断，
`www` 全路径 403，连真实 Chrome 都报 `ERR_CONNECTION_CLOSED`，于是结论写成
「浏览器也救不回来」。**真因是本机 DNS 把它解析到了 `198.18.0.0/15`——
代理软件（Clash 一类）的 fake-IP 网段。** 那个地址本来就不存在，
只有走代理的请求才会被翻译回真实目标；某条没走 `HTTPS_PROXY` 的请求直接去连它，
表现就是握手被切断。

诊断顺序：

```bash
# 1. 本机解析到哪儿了？落在 198.18.x.x / 198.19.x.x 就是 fake-IP
dig +short <域名>

# 2. 拿真实记录对照
curl -s -H 'accept: application/dns-json'   'https://1.1.1.1/dns-query?name=<域名>&type=A'

# 3. 走代理再试一次
curl -sI --max-time 20 -x "$HTTPS_PROXY" https://<域名>/robots.txt | head -1

# 4. 用真实 Chrome 打开一次
opencli browser dns-probe open "https://<域名>/"
opencli browser dns-probe state
opencli browser dns-probe close
```

**判据**：第 4 步能打开 → 站点是可达的，前面的失败是我们的请求路径问题；
只有第 4 步也打不开，才允许写「不可达」。

顺带一条：`robots.txt` 返回 200 而所有 HTML 路径 403 + `cf-mitigated: challenge`，
这不是「不可达」，是**站点在挡非浏览器客户端**——正是该上真实浏览器的场景。
