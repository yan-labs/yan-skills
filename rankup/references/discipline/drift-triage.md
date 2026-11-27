# 纪律十五：面板与网页对不上时的分诊（全文）

> 入口在 [`discipline.md`](../discipline.md) 十五，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

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
| 3 额度与配额 | 节点额度满、当日配额用完、账号降档 | `tools-share-node.mjs list` 看节点余量；哥飞按[官方 Skill](../seo-webcafe.md)查实时余额与用量；Semrush/Similarweb 看启动时打印的额度 | 额度问题 → `environment-issue: quota`，记进 `journal/`，明天再验 |
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
