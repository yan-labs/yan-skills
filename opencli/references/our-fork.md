# 我们这个 fork 与上游的差异

**为什么需要这一篇**：本 Skill 描述的一部分能力**只存在于我们的 fork 里**，
而它缺席时有两种截然不同的表现：

- **CLI 缺席 → 吵闹**：命令直接报 `unknown command`，只是错得像「装坏了」而不是「版本不对」。
- **扩展缺席 → 安静，而且危险得多**：`--window isolated` 这类标志照样被接受，
  命令照样返回成功，**只有行为回到上游**——默认前台、自己开窗口、抢走用户的活动标签页。
  没有任何报错，只有「怎么和文档说的不一样」。

第二种是装了 Chrome 应用商店那个扩展的默认下场。`opencli doctor` 现在会主动报它。

上游是 `jackwener/opencli`，我们的 fork 是 `yan-labs/OpenCLI`。

---

## 装哪一个

发布在 [yan-labs/OpenCLI 的 Release](https://github.com/yan-labs/OpenCLI/releases/latest)，
CLI 与扩展**两半都要装我们的**：

```bash
npm i -g https://github.com/yan-labs/OpenCLI/releases/download/v1.9.0-yan.2/opencli-cli-1.9.0-yan.2.tgz
# 扩展：下载 opencli-extension-v*.zip 解压 →
#   chrome://extensions → 开发者模式 → 加载已解压的扩展程序
#   并把 Chrome 应用商店那个 OpenCLI 移除或停用（两个都装会一起连守护进程互相打架）
```

**只装 CLI 不换扩展是最容易踩的坑**：命令全都能跑，行为却是上游的——
默认前台、自己开窗口、抢走活动标签页。`opencli doctor` 会在扩展低于 1.0.33 时主动报这一条。
改完扩展源码（或换了新构建）要在 chrome://extensions 里对 OpenCLI 点 **reload**——
没 reload 时 `doctor` 同样会提示已加载版本低于最低要求，那是没 reload，不是装错。

## 先确认你在跑哪一个

```bash
opencli --version
npm ls -g @jackwener/opencli
```

如果 `npm ls -g` 的输出指向一个**本地路径**（而不是 `node_modules` 里的实体目录），
说明 CLI 是从源码 `npm link` 过来的——**它的行为等于那个仓库的当前构建**，
而不是 `--version` 打印的那个版本号所对应的发布版。

这条在排障时很关键：版本号可以完全正常，而行为来自一个未发布的本地提交。

```bash
cd <npm ls -g 指出的路径>
git remote -v            # 确认是 fork 还是上游
git log --oneline origin/main..HEAD   # 我们领先上游的部分
```

---

## fork 独有的能力

| 能力 | 在哪一侧 | 缺了它会怎样 |
|---|---|---|
| **后台是默认值** | 扩展 + CLI | 默认变成前台：每条命令抬窗口、抢走用户正在看的标签页 |
| **在用户当前窗口开标签页——`browser` 与 adapter 都是**（1.0.33 起；此前 adapter 自己开窗口） | 扩展 | 每次都新开一个 1280×900 的窗口砸在用户布局上。借不到 normal 窗口才新建，且 `sessions` 报 `windowFallbackReason` |
| **每会话一个标签页组**，组名 `OpenCLI: <会话名>`（adapter 显示站点名） | 扩展 | 所有会话挤一个组、adapter 标签页不分组，看不出哪个标签页是哪件事的 |
| **`--window isolated`** | 扩展 + CLI | 标志被**静默忽略**，行为等同 `background` |
| **自动化跟着用户换窗口** | 扩展 | 一直往用户早就离开的那个窗口里堆 |
| **`sessions` 报 windowId / groupId / groupTitle / windowFallbackReason** | 扩展 + CLI | 「谁占着哪个标签页」「新窗口为什么冒出来」只能靠眯眼看浏览器猜 |
| **借来的窗口不留占位页** | 扩展 | 释放最后一个租约时在用户标签栏留一个 `about:blank` |
| **批量执行** `browser batch` | CLI/守护进程 | 固定序列只能一条条调，每条各付一次连接开销 |
| **`browser sessions` / `cleanup`** | CLI + 扩展 | 看不到当前有哪些租约，也没有一键释放 |
| **不存在会话的护栏** | 扩展 | 对不存在的会话跑 `state`/`eval` 会静默新建空白标签页，制造孤儿页 |

**`batch` 是唯一一个纯 CLI/守护进程层的能力**，官方商店版扩展也能用。
其余全部或部分在扩展侧——**只换 CLI 不换扩展，等于什么都没换**。

---

## CLI 1.9.0 / 扩展 1.1.0 新增（2026-09-11 真机验证）

提交在 `yan-labs/OpenCLI` main 的 `1d18770f` 与 `d2d3a0ec`。

| 能力 | 在哪一侧 | 缺了它会怎样 |
|---|---|---|
| **`browser <会话> clipboard`** —— 读系统剪贴板文本并打到 stdout | 扩展 + CLI | 没有这条命令。扩展侧靠 offscreen document + `execCommand('paste')` 实现，manifest 要有 `clipboardRead` + `offscreen` 权限 |
| **跨源 iframe（OOPIF）可用** —— `frames` 能列出跨源子帧，`eval --frame N` 能打进去 | 扩展 | `frames` **静默返回 `[]`**，`eval --frame N` 永远 out of range |
| **`frames --debug`** —— 多返回 `debug` 块定位卡在哪一层 | 扩展 + CLI | CLI 报 `unknown option '--debug'` |
| **CDP 允许名单加了 `Target.getTargets` / `Target.getTargetInfo`**（只读） | 扩展 | 只影响自己写的调试探针 |

### 跨源 iframe 为什么之前永远是空的

Chrome 站点隔离下，跨源 iframe 是**独立进程的 target**，不在父页面的
`Page.getFrameTree` 里；而在 tab 级 `chrome.debugger` 上调 `Target.getTargets`
会被 Chrome 直接拒绝：`{"code":-32000,"message":"Not allowed"}`。
两条路都堵死，于是 `frames` 只能返回 `[]`——**没有任何报错**。

扩展 1.1.0 改为监听 `Target.attachedToTarget`（`Target.setAutoAttach` 开 flatten，
再按 iframe 过滤）来收集子帧，并用 `{tabId, sessionId}`（Chrome 125+）向子帧发命令，
失败再回退一次 `attach({targetId})`。

`frames --debug` 返回
`{frames, debug: {treeChildCount, autoAttachError, getTargetsError, getTargetsIframeCount, attachedEventCount, domFrameUrls}}`
——`attachedEventCount` 为 0 说明 autoAttach 没生效，`domFrameUrls` 有而 `frames` 空
说明子帧没被认成 iframe target。

**版本判据：`opencli doctor` 的 Extension 行 ≥ 1.1.0 才有这一组能力。**
扩展 < 1.1.0 的症状就是 `frames` 返回 `[]` 且不报任何错。

### 已随 v1.9.0-yan.2 发布

上面四条已经进 Release（CLI 1.9.0 / 扩展 1.1.0）。全局装的仍是旧 tgz 时，
`frames --debug` 会报 `unknown option`，`npm i -g` 上面那个新 URL 即可。

扩展要装 Release 里的 `opencli-extension-v1.1.0-yan.2.zip`（或从仓库的 `extension/dist`
加载），并在 `chrome://extensions` 里 reload 一次；`opencli doctor` 的 Extension 行显示
1.1.0 才算生效。

### 已知回归与修复：面板反复 toggle 后 eval 静默落回主页面（扩展 1.1.1 修复）

症状：`frames` / `contexts` 都正确列出了跨源 iframe 和它的 execution context，
但 `eval --frame N`（或缓存 contextId 后走的 `eval --context ID`）读到的是主页面
内容，不报任何错；跨源 iframe 面板（如 AITDK 侧边面板）开合几次后必现。

根因一句话：扩展只把 contextId 缓存成 `tabId -> contextId`，没记它属于哪个
flatten 子 session；Chrome 每个子 session 的 context 编号独立，面板 toggle 几次后
新旧 session 里出现同号 contextId，`Runtime.evaluate({tabId}, ...)` 就撞进了主页面
的同号 context，且这条路径本身不报错。

修复：扩展 1.1.1 起 context 缓存按 `sessionId` 记录并据此选择 debuggee，监听
`Target.targetDestroyed` / `targetCrashed` 让失活 session 的缓存立即作废；找不到
活 session 时返回机器可读错误码 `frame_not_attached`，不再静默回退主页面。

**判据：出现 `frame_not_attached` 错误码，或升级到扩展 ≥ 1.1.1 后症状消失，都说明
命中的是这个问题；`opencli doctor` 的 Extension 行 < 1.1.1 就仍有这条回归。**

---

## 扩展侧改动要手动 reload

这是最容易漏的一步：

- **CLI 侧的改动** → `opencli daemon restart` 就生效。
- **扩展侧的改动** → 必须去 `chrome://extensions` 手动点一次 reload。

改完扩展源码、构建完、却发现行为一点没变，几乎总是漏了这一步。

**约定：每改一次扩展就顶一次 `manifest.json` 的版本号**，于是
`opencli doctor` 打印的扩展版本就是「加载的到底是哪个构建」的判据。
这条是 2026-08-23 定下的——在那之前版本号钉死在 1.0.22，改了代码也不变，
「装进去没有」从外面根本观测不到，一个 bug 因此来回验证了六轮。

---

## 已知回归与修复（读排障时的背景）

护栏（拒绝对不存在的会话执行不带 URL 的命令）落地时，判据写得过宽——
它用「这条命令带没带 URL」来推断「这是不是导航命令」。
有三类调用天生不带 URL，于是被误杀：

1. `open` 自己（它先开网络捕获再导航，捕获命令不带 URL）；
2. `opencli doctor` 的连通性探针（`evaluate('1 + 1')`）；
3. 所有走浏览器的 adapter 租约（`COOKIE` / `INTERCEPT` / `UI`）。

表现是：`doctor` 前两行 `[OK]`、第三行 Connectivity FAIL，
`open` 报 `session_not_found` 并提示「先用 open 打开一个 URL」——**提示自相矛盾**。

修复把护栏收窄到只管 `opencli browser <session>` 这条用户通道
（adapter 租约不受影响），并让 doctor 的探针先用 `tabs op:new` 建好会话。

**留下的通用判据**：提示信息在逻辑上自相矛盾时，先怀疑本地构建，
不要照着提示打转。详见 [`troubleshooting.md`](troubleshooting.md)。

---

## 窗口归属：四个 bug，一个根因

这条留着，因为它的形状会重演：**分组收敛会走向「规范分组」所在的任何窗口，
并把标签页搬过去。** 每一处调用它却没说明「我要哪个窗口」的地方，都是一扇门。

四次现身，前三次都在出问题的那个调用点补钉，于是每次都以为修完了：

1. 新建专用窗口后的分组调用没钉 → `isolated` 建对了窗口，标签页又被搬回用户窗口
2. **复用**路径没钉 → 第二个 `isolated` 会话走这条，把第一个打掉
3. 决定去哪之前就先认领了分组 → 容器刚挪走又被拽回
4. 建完标签页那次只在 isolated 时才钉 → 普通会话把 isolated 的标签页全搬走，
   专用窗口被搬空，Chrome 自动关掉，里面所有会话随之释放

**一共六个调用点没钉，一个个补必然再漏。** 最终改成默认行为：
`pinWindowId` 缺省取 `fallbackWindowId`，跨窗口认领只剩显式传 `null` 的发现调用。

**判据：把「记得做某件事」变成默认行为，比在每个调用点提醒自己更可靠。**
一条只在你想起来时才生效的规则，等于没有规则。

验证靠 `npm run test:e2e-window`——单测把 `chrome.*` 整个 mock 掉了，
对一个在真实浏览器里表现错误的构建会欣然点头，这四个 bug 全从那个缝里漏了过去。

---

## fork 上打 tag / push 不会自动出 Release

`yan-labs/OpenCLI` fork 上 `push`（含推一个 tag）不会触发 `.github/workflows/release.yml`，
只有手动 `workflow_dispatch` 能跑通；已诊断确认，原因未查。所以打完 tag 要**本地照抄该
workflow 的打包步骤**（typecheck → build → manifest drift 校验 → `npm pack` → 打包扩展 →
zip）再 `gh release create` 手工把产物挂上去，别指望 Actions 自己出 Release。

---

## 同步上游时注意

- 我们领先的提交都在浏览器会话/批量这条线上，冲突面集中在
  `src/cli.ts`、`src/browser/page.ts`、`extension/src/background.ts`。
- **合完必须跑** `vitest run --project unit --project extension --project adapter`。
  扩展那一组测试是最灵敏的：护栏那次回归就是被它抓住的
  （合入时带着 10 个红测试，说明当时没跑）。
- 合完还要**实跑一遍最小闭环**：`opencli doctor` 三行绿，
  再 `open` 一个真实页面并 `extract` 出内容。单测绿而端到端挂，
  正是护栏那次事故的形态。
