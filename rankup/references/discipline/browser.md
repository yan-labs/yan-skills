# 纪律五：浏览器与取数（全文）

> 入口在 [`discipline.md`](../discipline.md) 五，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

浏览器窗口默认只落副屏/虚拟屏并自动铺开（无副屏才回主屏），规则见 [opencli Skill](../../../opencli/SKILL.md#专用窗口与可见性)；不要因窗口池满就提前排队等槽位，实际收到 `dedicated-pool-exhausted` 后再等，也不要改用 Playwright 类沙箱浏览器。

**浏览器动作默认用 OpenCLI 驱动用户本机的 Chrome（dedicated 窗口）；沙箱浏览器（Playwright / agent-browser / headless）仍禁止。**
唯一例外：Claude 桌面 app 内置浏览器（`mcp__Claude_Browser__*`）仅供 Claude 主线程只读查看公开页面（SERP、竞品首页、自己的站）；Codex 与脚本仍一律 opencli，涉及登录态 / 配额的站（Semrush、Similarweb、GSC、ChatGPT 探针等）也仍只用 opencli，SERP 顺序见 [取数路线](../seo-serp.md#serp-取数路线)。
沙箱没有用户的 cookie：要登录的目标要么跳登录页，要么以匿名身份返回**看起来正常但内容不同**的结果
（配额更低、字段更少、国家库不同）。这种失败会伪装成「这个工具没有这项数据」，真相是「你没登录」。

公开搜索须显式指定地区与语言；登录态页面直接使用用户的浏览器。

**需要登录态 / 配额的「用户的浏览器」必须由 `opencli` 驱动，不是随便一个能操作到用户已登录浏览器的工具都算数。**
即便是 Claude 自带的浏览器自动化工具（如 Claude in Chrome / `claude-in-chrome`），技术上同样能
操作用户已登录的真实浏览器、同样能通过上面「无痕窗口是不是同一个东西」的判据，但它**不能替代**
`opencli`。差别不在好不好用，在**操作完之后剩下什么**：`opencli` 有 adapter 的编写与自修复能力
（见下表 `adapters.md`）和会话/租约管理，这次摸索一个目标的页面结构、点击路径、字段名踩的坑，
收工时能沉淀成一个可复用的 adapter 或脚本，登记进 `registry.md`，下次同类目标、同类操作直接调用，
不用重新摸索；用 `opencli` 之外的工具操作，不管这次操作本身做没做对，做完**都不产出任何可复用的
东西**——下一次遇到同类目标或同类操作，还是从零摸索一遍页面结构、重新踩一遍同样的坑，等于白做。
**这条对调研阶段与执行阶段同样成立，不因为「只是看一眼」「还没正式提交」而降级**：判断一个需要
登录态的目标能不能做、值不值得做某个操作（有没有对应表单、流程几步、要不要审核）属于调研；真正
去点、去填、去提交属于执行。两者只要落在「需要登录态的页面操作」上，就都必须走 `opencli`——探路
本身就是要沉淀成 adapter 的那一步，换了工具探路，路就白探了。

未安装：`npx skills add $SKILLS_SOURCE --skill opencli -g -y`。

**除 [SERP 取数路线](../seo-serp.md#serp-取数路线)外，反过来同样是硬规则：目标平台有 API 或 CLI、且本机已有凭据能证明（`wrangler whoami`、
`gh auth status` 一类能给出肯定结果的命令），一律走 API/CLI，禁止开浏览器去后台点。**
只有两种情况例外，且只做那一步就退回 API：API 确实不覆盖某个操作；或需要一次性 OAuth /
App 安装授权（只能由用户本人在浏览器里点一次，例如给某个 GitHub org 装 Cloudflare 的
Workers & Pages GitHub App）。反面例子：给站点接 Cloudflare Workers Builds Git 集成，
早期做法是让 agent 去控制台点「连接仓库」「新建 token」「建 trigger」，改成全程用
Cloudflare API（服务查询 → 仓库连接 → 建窄权限 build token → 建 trigger → 写构建环境
变量）之后，同样的接入不再需要打开浏览器，唯一仍需人工点一次的只有 GitHub App 装到 org
这一步。判断「该不该开浏览器」先自问一句：这件事有没有对应的 API 端点或官方 CLI 子命令，
本机的凭据够不够权限——够，就不是「登录态」问题，是「懒得查 API 文档」问题。

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
